const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public'))); // Serve images from the uploads folder

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public'));
})

// File paths
const USERS_FILE = './users.json';
const MESSAGES_FILE = './messages.json';
const GROUPS_FILE = './groups.json';

// Encryption settings
const ENCRYPTION_KEY = crypto.randomBytes(32); // Static key for simplicity
const IV_LENGTH = 16;
const validTokens = {}; // Store valid tokens for active users

function isTokenValid(token) {
    return Object.values(validTokens).includes(token);
}

// Multer storage for avatar uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

const initFiles = () => {
    const files = [
        { path: USERS_FILE, defaultContent: '{}' },
        { path: GROUPS_FILE, defaultContent: '{}' },
        { path: MESSAGES_FILE, defaultContent: '{}' },
    ];

    files.forEach(({ path, defaultContent }) => {
        if (!fs.existsSync(path)) {
            fs.writeFileSync(path, defaultContent, 'utf-8');
        }
    });
};

// Call this function before starting the server
initFiles();

// Helper functions to read and write files
function loadFile(file) {
    if (!fs.existsSync(file)) return {};
    const content = fs.readFileSync(file, 'utf-8').trim();
    return content ? JSON.parse(content) : {};
}

function saveFile(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Encrypt and decrypt functions
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);  // Generate a random IV
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;  // Return IV and encrypted text together
}

function decrypt(text) {
    const textParts = text.split(':');  // Split the IV and the encrypted text
    const iv = Buffer.from(textParts[0], 'hex');  // Get the IV from the beginning
    const encryptedText = textParts[1];  // The rest is the encrypted message

    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Register (with description and avatar)
app.post('/register', upload.single('avatar'), async (req, res) => {
    const { username, password, description } = req.body;
    const users = loadFile(USERS_FILE);

    if (users[username]) {
        return res.json({ message: 'Username already exists!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = req.file ? `/uploads/${req.file.filename}` : null;
    users[username] = { password: hashedPassword, description, avatarUrl };
    saveFile(USERS_FILE, users);

    res.json({ message: 'Registration successful!' });
});

// Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = loadFile(USERS_FILE);

    if (!users[username]) {
        return res.json({ message: 'User does not exist!' });
    }

    const isValid = await bcrypt.compare(password, users[username].password);
    if (isValid) {
        const token = uuidv4();
        validTokens[username] = token; // Store the token
        res.json({ message: 'Login successful!', token, username });
    } else {
        res.json({ message: 'Invalid password!' });
    }
});

// Create a new group chat
app.post('/groups', (req, res) => {
    const { groupName } = req.body;
    const groups = loadFile(GROUPS_FILE);  // This loads the existing groups from the JSON file

    // Check if group already exists
    if (groups[groupName]) {
        return res.json({ message: 'Group already exists!' });
    }

    // Create a new group if it doesn't exist
    groups[groupName] = [];  // Initialize the group with an empty array for messages
    saveFile(GROUPS_FILE, groups);  // Save the new group to the JSON file

    res.json({ message: 'Group created successfully!' });
});

// Create a new group chat
// Get all groups
app.get('/groups', (req, res) => {
    const groups = loadFile(GROUPS_FILE);
    res.json(Object.keys(groups)); // Return an array of group names
});

// Send message to a group
// Get user profile
app.get('/profile/:username', (req, res) => {
    const { username } = req.params;
    const users = loadFile(USERS_FILE);

    if (!users[username]) {
        return res.status(404).json({ message: 'User not found!' });
    }

    const user = users[username];
    res.json({ username, description: user.description, avatarUrl: user.avatarUrl });
});

app.get('/messages/:group', (req, res) => {
    const { group } = req.params;
    const groups = loadFile(GROUPS_FILE);

    if (!groups[group]) {
        return res.status(404).json({ message: 'Group not found' });
    }

    const decryptedMessages = groups[group].map(msg => ({
        username: msg.username,
        content: decrypt(msg.content),
        timestamp: msg.timestamp,
        avatarUrl: msg.avatarUrl,
    }));

    res.json(decryptedMessages);
});

// Send message to a group
app.post('/message', (req, res) => {
    const { username, token, group, content } = req.body;
    const users = loadFile(USERS_FILE);
    const groups = loadFile(GROUPS_FILE);

    // Validate user
    if (!users[username]) {
        return res.status(403).json({ message: 'Unauthorized: User does not exist.' });
    }

    // Validate group
    if (!groups[group]) {
        return res.status(404).json({ message: 'Group not found.' });
    }

    // Encrypt the message
    const encryptedMessage = encrypt(content);

    // Get user's avatar URL
    const avatarUrl = users[username].avatarUrl || '/default-avatar.png';

    // Save the message to the group
    groups[group].push({
        username,
        content: encryptedMessage,
        timestamp: new Date().toISOString(),
        avatarUrl,
    });

    saveFile(GROUPS_FILE, groups);
    res.json({ message: 'Message sent successfully.' });
});

app.post('/delete-account', (req, res) => {
    const { username, token } = req.body;
    if (!isTokenValid(token)) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    deleteUserAccount(username); // Replace with your deletion logic
    res.json({ message: 'Account deleted successfully' });
});

function deleteUserAccount(username) {
    const users = loadFile(USERS_FILE);
    delete users[username];
    saveFile(USERS_FILE, users);

    delete validTokens[username]; // Remove token from active sessions
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

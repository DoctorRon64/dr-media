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
app.use(express.static(__dirname)); // Serve static files from the current directory
app.use(express.static(path.join(__dirname, 'uploads'))); // Serve images from the uploads folder

// File paths
const USERS_FILE = './users.json';
const GROUPS_FILE = './groups.json';
const MESSAGES_FILE = './messages.json';

// Encryption settings
const ENCRYPTION_KEY = crypto.randomBytes(32); // Static key for simplicity
const IV_LENGTH = 16;

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
// Initialize files if they don't exist
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
// Register new user with avatar
app.post('/register', upload.single('avatar'), async (req, res) => {
    const { username, password, description } = req.body;
    const users = loadFile(USERS_FILE);

    if (users[username]) {
        return res.json({ message: 'Username already exists!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = req.file ? `/uploads/${req.file.filename}` : '/default-avatar.png'; // Default avatar if no file uploaded
    users[username] = { password: hashedPassword, description, avatarUrl };
    saveFile(USERS_FILE, users);

    res.json({ message: 'Registration successful!' });
});

// Login user and return token
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = loadFile(USERS_FILE);

    if (!users[username]) {
        return res.json({ message: 'User does not exist!' });
    }

    const isValid = await bcrypt.compare(password, users[username].password);
    if (isValid) {
        const token = uuidv4(); // Generate session token
        users[username].token = token;  // Save token to user
        saveFile(USERS_FILE, users);  // Save the updated user data with the token
        res.json({ message: 'Login successful!', token, username });
    } else {
        res.json({ message: 'Invalid password!' });
    }
});

// Create a new group chat
app.post('/groups', (req, res) => {
    const { groupName } = req.body;
    const groups = loadFile(GROUPS_FILE);  // Load existing groups from the JSON file

    if (groups[groupName]) {
        return res.json({ message: 'Group already exists!' });
    }

    groups[groupName] = [];  // Initialize the group with an empty array for messages
    saveFile(GROUPS_FILE, groups);

    res.json({ message: 'Group created successfully!' });
});

app.get('/dashboard.html', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const users = loadFile(USERS_FILE);

    // Check for a valid token
    const user = Object.values(users).find((user) => user.token === token);
    if (user) {
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    } else {
        res.redirect('/login.html');
    }
});

// Delete a group
app.delete('/groups/:groupName', (req, res) => {
    const { groupName } = req.params;
    const groups = loadFile(GROUPS_FILE); // Load the list of groups from your data file

    if (!groups[groupName]) {
        return res.status(404).json({ message: 'Group not found' });
    }

    delete groups[groupName]; // Remove the group from the data

    saveFile(GROUPS_FILE, groups); // Save the updated list back to the file

    res.json({ message: `Group "${groupName}" deleted successfully` });
});

// Get all groups
app.get('/groups', (req, res) => {
    const groups = loadFile(GROUPS_FILE);
    res.json(Object.keys(groups)); // Return an array of group names
});

app.post('/validate-token', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]; // Extract the token
    const users = loadFile(USERS_FILE);

    // Find user with matching token
    const user = Object.values(users).find((user) => user.token === token);

    if (user) {
        return res.json({ valid: true });
    }
    res.json({ valid: false });
});

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

app.get('/messages/:groupName', (req, res) => {
    const { groupName } = req.params;
    const groups = loadFile(GROUPS_FILE);
    const messages = loadMessagesFile(MESSAGES_FILE);

    if (!groups[groupName]) {
        return res.status(404).json({ message: 'Group not found' });
    }

    // Filter messages for the given group
    const groupMessages = messages.filter(msg => msg.group === groupName);

    res.json(groupMessages);
});

app.post('/message', (req, res) => {
    const { username, token, group, content } = req.body;
    
    // Validate group exists
    const groups = loadFile(GROUPS_FILE);
    if (!groups[group]) {
        return res.status(404).json({ message: 'Group not found' });
    }

    // Store the message (without checking users for now)
    const messages = loadMessagesFile(MESSAGES_FILE);
    messages.push({ group, username, content, timestamp: new Date().toISOString() });

    saveMessagesFile(MESSAGES_FILE, messages); // Save new message to the database or file
    res.json({ message: 'Message sent successfully' });
});

// Helper functions for messages file
function loadMessagesFile(file) {
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file, 'utf-8').trim();
    return content ? JSON.parse(content) : [];
}

function saveMessagesFile(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Delete account
app.post('/delete-account', (req, res) => {
    const { username, token } = req.body;
    const users = loadFile(USERS_FILE);

    // Check if the user exists and validate the token (session management)
    if (!users[username] || users[username].token !== token) {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    // Delete the user's account
    delete users[username];
    saveFile(USERS_FILE, users);
    res.json({ message: 'Account deleted successfully!' });
});

// Start the server
app.listen(PORT, () => {
    //console.log(`Server running on http://localhost:${PORT}`);
});
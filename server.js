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
app.use(express.static(path.join(__dirname, 'uploads'))); // Serve images from the uploads folder

// File paths
const USERS_FILE = './users.json';
const MESSAGES_FILE = './messages.json';
const GROUPS_FILE = './groups.json';

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

// Helper functions to read and write files
function loadFile(file) {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function saveFile(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Encrypt and decrypt functions
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = textParts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Routes

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
        const token = uuidv4(); // Simple session token
        res.json({ message: 'Login successful!', token, username });
    } else {
        res.json({ message: 'Invalid password!' });
    }
});

// Fetch groups (show available group chats)
// Fetch all groups (show available group chats)
app.get('/groups', (req, res) => {
    const groups = loadFile(GROUPS_FILE);
    res.json(Object.keys(groups)); // Send list of group names
});


// Create a new group chat
app.post('/groups', (req, res) => {
    const { groupName } = req.body;
    const groups = loadFile(GROUPS_FILE);

    if (groups[groupName]) {
        return res.json({ message: 'Group already exists!' });
    }

    groups[groupName] = [];
    saveFile(GROUPS_FILE, groups);

    res.json({ message: 'Group created successfully!' });
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


// Get messages for a group
// Get messages for a group
// Get messages for a group
app.get('/messages/:group', (req, res) => {
    const { group } = req.params;
    const groups = loadFile(GROUPS_FILE);

    if (!groups[group]) {
        return res.status(404).json({ message: 'Group not found!' });
    }

    // Decrypt messages before sending, add avatarUrl
    const decryptedMessages = groups[group].map(msg => ({
        username: msg.username,
        content: decrypt(msg.content),
        timestamp: msg.timestamp,
        avatarUrl: users[msg.username]?.avatarUrl || 'default-avatar.png', // Ensure avatar URL is sent
    }));

    res.json(decryptedMessages);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

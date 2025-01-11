
let currentGroup = null;
const token = localStorage.getItem('token');
const username = localStorage.getItem('username');

// Fetch user profile data
async function fetchProfile() {
    const response = await fetch(`/profile/${username}`);
    const data = await response.json();
    document.getElementById('profileAvatar').src = data.avatarUrl || 'default-avatar.png';
    document.getElementById('profileUsername').textContent = data.username;
    document.getElementById('profileDescription').textContent = data.description;
}

// Fetch groups
async function fetchGroups() {
    const response = await fetch('/groups');
    const groups = await response.json();
    const groupList = document.getElementById('groupList');
    groupList.innerHTML = '';
    groups.forEach(group => {
        const li = document.createElement('li');
        li.textContent = group;
        li.classList.add('group-item');
        li.onclick = () => selectGroup(group);
        groupList.appendChild(li);
    });
}

// Handle group selection
async function selectGroup(groupName) {
    currentGroup = groupName;
    document.getElementById('currentGroup').textContent = `Group: ${groupName}`;
    try {
        await fetchMessages(groupName);
    } catch (error) {
        console.error('Error loading messages:', error.message);
        alert('Cannot load messages. Try again.');
    }
}

// Fetch messages
async function fetchMessages(groupName) {
    const response = await fetch(`/messages/${groupName}`);
    if (!response.ok) {
        alert("Can't load messages, try again");
        return;
    }
    const messages = await response.json();
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';
    messages.forEach(msg => {
        const msgElement = document.createElement('div');
        msgElement.classList.add('message');
        msgElement.innerHTML = `
            <img src="${msg.avatarUrl || '/default-avatar.png'}" alt="Avatar" class="avatar">
            <div class="message-content">${msg.content}</div>
            <span class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</span>
        `;
        messagesContainer.appendChild(msgElement);
    });
}

document.getElementById('logoutButton').addEventListener('click', () => {
    localStorage.clear(); // Clear stored credentials
    window.location.href = '/login.html'; // Redirect to login page
});

// Handle message send
document.getElementById('sendMessageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = document.getElementById('messageContent').value;
    if (!currentGroup) return alert('Please select a group!');
    await fetch('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, token, group: currentGroup, content }),
    });
    fetchMessages(currentGroup);
    document.getElementById('messageContent').value = '';
});

// Handle profile edit
document.getElementById('editProfileButton').addEventListener('click', () => {
    document.getElementById('editProfileForm').style.display = 'block';
});

document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent default form submission

    const newUsername = document.getElementById('newUsername').value;
    const newDescription = document.getElementById('newDescription').value;

    const response = await fetch('/edit-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, newUsername, newDescription, token }),
    });

    // Make sure user provided new data
    if (!newUsername || !newDescription) {
        alert("Please provide both new username and description");
        return;
    }

    // Sending the updated profile information to the server
    app.post('/edit-profile', (req, res) => {
        const { username, newUsername, newDescription, token } = req.body;
        // Add token validation logic and update the database
        if (isTokenValid(token)) {
            updateUserProfile(username, newUsername, newDescription); // Replace with your logic
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Invalid token' });
        }
    });

    const data = await response.json();
    if (data.success) {
        alert('Profile updated successfully');
        fetchProfile(); // Reload profile with updated data
    } else {
        alert('Failed to update profile: ' + data.message);
    }
});

// Handle account deletion
document.getElementById('deleteAccountButton').addEventListener('click', async () => {
    try {
        const response = await fetch('/delete-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, token }), // Ensure the `token` variable contains the correct value
        });
        const data = await response.json();
        alert(data.message);
        if (response.ok) {
            localStorage.clear(); // Clear stored credentials
            window.location.href = '/login.html'; // Redirect to login page
        }
    } catch (error) {
        console.error('Error deleting account:', error);
        alert('Could not delete account. Please try again.');
    }
});

// Create group
document.getElementById('createGroupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const groupName = document.getElementById('newGroupName').value;
    const response = await fetch('/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName })
    });
    if (response.ok) {
        fetchGroups();
        document.getElementById('newGroupName').value = '';
    } else {
        alert('Failed to create group');
    }
});

fetchProfile();
fetchGroups();
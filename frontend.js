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

// Fetch groups and display them
async function fetchGroups() {
    const response = await fetch('/groups');
    const groups = await response.json();
    const groupList = document.getElementById('groupList');
    groupList.innerHTML = ''; // Clear the group list before updating

    groups.forEach(group => {
        const li = document.createElement('li');
        li.textContent = group;
        li.classList.add('group-item');
        li.onclick = () => selectGroup(group);

        // Create delete button for each group
        const deleteButton = document.createElement('button');
        const icon = document.createElement('img');
        icon.src = 'icons/folder-delete.svg';
        icon.alt = 'Delete Icon'; 
        icon.style.width = '20px';
        icon.style.height = '20px';
        deleteButton.style.marginLeft = '10px';
        deleteButton.appendChild(icon);

        document.body.appendChild(deleteButton);
        deleteButton.onclick = (e) => {
            e.stopPropagation(); // Prevent the li click handler from triggering
            deleteGroup(group);
        };

        // Append delete button to the group list item
        li.appendChild(deleteButton);
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

async function getAvatar(username) {
    const response = await fetch(`/profile/${username}`);
    const user = await response.json();
    console.log(user);
    if (user.message) {
        return '/deleted-avatar.png';
    }

    return user.avatarUrl || '/default-avatar.png'; // Return default avatar if not found
}

// Fetch messages for the selected group
async function fetchMessages(groupName) {
    const response = await fetch(`/messages/${groupName}`);
    if (!response.ok) {
        alert("Can't load messages, try again");
        return;
    }
    const messages = await response.json();
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = ''; // Clear the message container before appending new messages
    for (const msg of messages) {
        const avatarUrl = await getAvatar(msg.username);  // Wait for the avatar URL to be fetched
        const msgElement = document.createElement('div');
        msgElement.classList.add('message');
        console.log(msg);
        msgElement.innerHTML = `
            <img src="${avatarUrl}" alt="Avatar" class="avatar">
            <div class="message-username"> ${msg.username} </div>
            <div class="message-content">${msg.content}</div>
            <span class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</span>
        `;
        messagesContainer.appendChild(msgElement);
    }
}

// Delete group
async function deleteGroup(groupName) {
    const confirmation = confirm(`Are you sure you want to delete the group "${groupName}"?`);

    if (confirmation) {
        try {
            console.log('Sending DELETE request to delete group:', groupName);
            const response = await fetch(`/groups/${groupName}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (response.ok) {
                alert(result.message); // Success message
                fetchGroups(); // Reload the group list
            } else {
                alert(result.message); // Failure message
            }
        } catch (error) {
            console.error('Error deleting group:', error);
            alert('Failed to delete the group');
        }
    }
}

document.getElementById('sendMessageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageContent = document.getElementById('messageContent').value;

    if (!currentGroup) {
        alert('Please select a group first!');
        return;
    }

    const response = await fetch('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            token,
            group: currentGroup,
            content: messageContent
        })
    });

    const result = await response.json();
    if (response.ok) {
        fetchMessages(currentGroup);  // Reload the messages
    } else {
        alert(result.message || 'Failed to send message');
    }
});

// Handle account deletion
document.getElementById('deleteAccountButton').addEventListener('click', async () => {
    try {
        const response = await fetch('/delete-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, token }),
        });
        const data = await response.json();
        alert(data.message);
        if (response.ok) {
            localStorage.clear(); // Clear stored credentials
            window.location.reload(true);
            window.location.href = '/login.html'; // Redirect to login page
        }
    } catch (error) {
        console.error('Error deleting account:', error);
        alert('Could not delete account. Please try again.');
    }
});

document.getElementById('logOutButton').addEventListener('click', () => {
    if (confirm('Are you shure you want to log out?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('username');

        window.location.reload(true); 
        window.location.href = '/login.html';
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

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const response = await fetch('/validate-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (!result.valid) {
            // If the token is invalid, redirect to login
            alert('Your session has expired. Please log in again.');
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error('Error validating token:', error);
        alert('Unable to validate session. Please log in again.');
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
})


fetchProfile();
fetchGroups();
function updateMessage() {
    const newMessage = document.getElementById('newMessage').value;
    if (!newMessage) {
        alert("Please enter a message!");
        return;
    }
    document.getElementById('message').innerText = newMessage;
}

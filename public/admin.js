document.getElementById('shutdownButton').addEventListener('click', function() {
    fetch('/admin/shutdown', { method: 'POST' })
    .then(response => response.text())
    .then(data => alert(data));
});

document.getElementById('kickButton').addEventListener('click', function() {
    const playerName = document.getElementById('playerName').value;
    fetch('/admin/kick', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerName })
    })
    .then(response => response.text())
    .then(data => alert(data));
});
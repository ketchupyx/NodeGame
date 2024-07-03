const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 800;

const socket = io();

let players = {};
let playerId = null;
let isShooting = false;
let shootCooldown = 0;

const keysPressed = {};
let projectiles = [];

const acceleration = 3;
const maxSpeed = 50;
const projectileSpeed = 10; // Vitesse des projectiles
const cooldownTime = 500; // Temps de recharge de 0.5 seconde
const maxLives = 5; // Nombre maximum de vies

// Charger l'image de fond
const backgroundImage = new Image();
backgroundImage.src = 'img/map.png';

// Charger l'image de collision
const collisionImage = new Image();
collisionImage.src = 'img/collision.png';

let collisionData = null;

// Lorsque l'image de collision est chargée, créer un canvas temporaire pour récupérer les données
collisionImage.onload = () => {
    const collisionCanvas = document.createElement('canvas');
    collisionCanvas.width = 800;
    collisionCanvas.height = 800;
    const collisionCtx = collisionCanvas.getContext('2d');
    collisionCtx.drawImage(collisionImage, 0, 0, 800, 800);
    collisionData = collisionCtx.getImageData(0, 0, 800, 800).data;
    console.log('Collision data loaded');
};

socket.on('connect', () => {
    console.log('connected to server');
    playerId = socket.id;

    const playerName = prompt('Enter your name (5 letters max):').substring(0, 5);
    socket.emit('join', { name: playerName });
});

socket.on('state', (state) => {
    players = state.players;
    projectiles = state.projectiles;
});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (playerId && players[playerId]) {
        const player = players[playerId];
        const cameraX = Math.max(0, Math.min(800 - canvas.width, player.x - canvas.width / 2));
        const cameraY = Math.max(0, Math.min(800 - canvas.height, player.y - canvas.height / 2));

        // Dessiner l'image de fond
        ctx.drawImage(backgroundImage, -cameraX, -cameraY, 800, 800);

        for (let id in players) {
            let otherPlayer = players[id];
            if (!otherPlayer.dead) {
                ctx.fillStyle = otherPlayer.color;
                ctx.beginPath();
                ctx.arc(otherPlayer.x - cameraX, otherPlayer.y - cameraY, 20, 0, Math.PI * 2);
                ctx.fill();
                // Dessiner le score
                ctx.fillStyle = 'black';  // Couleur du texte
                ctx.font = '12px Arial'; // Taille et police du texte
                ctx.textAlign = 'center'; // Aligner le texte au centre
                ctx.fillText(otherPlayer.score, otherPlayer.x - cameraX, otherPlayer.y - cameraY + 4);

                // Contour blanc pour le score pour une meilleure visibilité
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1;
                ctx.strokeText(otherPlayer.score, otherPlayer.x - cameraX, otherPlayer.y - cameraY + 4);

                // Dessiner le nom du joueur
                ctx.fillStyle = 'black';
                ctx.font = '12px Arial';
                ctx.fillText(otherPlayer.name, otherPlayer.x - cameraX - 10, otherPlayer.y - cameraY - 25);

                // Dessiner les barres de vie et de recharge sous les joueurs
                const barWidth = 40;
                const barHeight = 5;
                const barOffsetY = 30;

                // Barre de vie
                ctx.fillStyle = 'red';
                ctx.fillRect(otherPlayer.x - cameraX - barWidth / 2, otherPlayer.y - cameraY + barOffsetY, barWidth, barHeight);
                ctx.fillStyle = 'green';
                ctx.fillRect(otherPlayer.x - cameraX - barWidth / 2, otherPlayer.y - cameraY + barOffsetY, barWidth * (otherPlayer.lives / maxLives), barHeight);

                // Barre de recharge
                ctx.fillStyle = 'green';
                ctx.fillRect(otherPlayer.x - cameraX - barWidth / 2, otherPlayer.y - cameraY + barOffsetY + barHeight + 2, barWidth, barHeight);
                if (otherPlayer.shootCooldown > 0) {
                    ctx.fillStyle = 'blue';
                    ctx.fillRect(otherPlayer.x - cameraX - barWidth / 2, otherPlayer.y - cameraY + barOffsetY + barHeight + 2, barWidth * (1 - otherPlayer.shootCooldown / cooldownTime), barHeight);
                }
            }
        }

        // Dessiner les projectiles
        for (let projectile of projectiles) {
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(projectile.x - cameraX, projectile.y - cameraY, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        if (player.dead) {
            const respawnTimeLeft = Math.max(0, Math.ceil((player.respawnTime - Date.now()) / 1000));
            ctx.fillStyle = 'black';
            ctx.font = '30px Arial';
            ctx.fillText(`Dead, respawning in ${respawnTimeLeft}...`, canvas.width / 2 - 150, canvas.height / 2);
        }
    }

    requestAnimationFrame(draw);
}

canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0 && shootCooldown <= 0) {
        fireProjectile(event.clientX, event.clientY);
    }
});

function fireProjectile(mouseX, mouseY) {
    if (playerId && players[playerId]) {
        const player = players[playerId];
        const rect = canvas.getBoundingClientRect();
        const x = mouseX - rect.left;
        const y = mouseY - rect.top;

        const cameraX = Math.max(0, Math.min(800 - canvas.width, player.x - canvas.width / 2));
        const cameraY = Math.max(0, Math.min(800 - canvas.height, player.y - canvas.height / 2));
        const targetX = cameraX + x;
        const targetY = cameraY + y;

        const dx = targetX - player.x;
        const dy = targetY - player.y;
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        const direction = { x: dx / magnitude, y: dy / magnitude };

        const projectile = {
            x: player.x,
            y: player.y,
            direction: direction,
            ownerId: playerId
        };
        projectiles.push(projectile);
        socket.emit('fire', projectile);
        shootCooldown = cooldownTime;
        console.log('Fire! Shoot cooldown set to:', shootCooldown); // Log pour vérifier la valeur de shootCooldown
    }
}

document.addEventListener('keydown', (event) => {
    keysPressed[event.key] = true;
});

document.addEventListener('keyup', (event) => {
    keysPressed[event.key] = false;
});

function updateMovement() {
    let movement = { x: 0, y: 0 };
    let playerSpeed = { x: 0, y: 0 };

    if (keysPressed['ArrowUp']) playerSpeed.y -= acceleration;
    if (keysPressed['ArrowDown']) playerSpeed.y += acceleration;
    if (keysPressed['ArrowLeft']) playerSpeed.x -= acceleration;
    if (keysPressed['ArrowRight']) playerSpeed.x += acceleration;

    if (playerSpeed.x > maxSpeed) playerSpeed.x = maxSpeed;
    if (playerSpeed.x < -maxSpeed) playerSpeed.x = -maxSpeed;
    if (playerSpeed.y > maxSpeed) playerSpeed.y = maxSpeed;
    if (playerSpeed.y < -maxSpeed) playerSpeed.y = maxSpeed;

    movement.x = playerSpeed.x;
    movement.y = playerSpeed.y;

    // Vérifier les collisions avec les obstacles
    if (playerId && players[playerId]) {
        let newX = players[playerId].x + movement.x;
        let newY = players[playerId].y + movement.y;
        if (!isCollidingWithObstacles(newX, newY, 20)) {
            socket.emit('move', movement);
        }
    }

    // Mettre à jour les projectiles
    updateProjectiles();
}

function updateProjectiles() {
    if (shootCooldown > 0) {
        shootCooldown -= 1000 / 60;
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let projectile = projectiles[i];
        projectile.x += projectile.direction.x * projectileSpeed;
        projectile.y += projectile.direction.y * projectileSpeed;

        if (projectile.x < 0 || projectile.x > 800 || projectile.y < 0 || projectile.y > 800 ||
            isCollidingWithObstacles(projectile.x, projectile.y, 5)) {
            projectiles.splice(i, 1);
        }
    }
}

function isCollidingWithObstacles(x, y, radius) {
    if (!collisionData) return false;
    for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
            if (i * i + j * j <= radius * radius) {
                const pixelX = Math.floor(x + i);
                const pixelY = Math.floor(y + j);
                const index = (pixelY * 800 + pixelX) * 4;
                if (collisionData[index] === 255 && collisionData[index + 1] === 0 && collisionData[index + 2] === 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

setInterval(updateMovement, 1000 / 60); // Mettre à jour le mouvement 60 fois par seconde
 
draw();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 800;

const socket = io();

let players = {};
let playerId = null;
let isShooting = false;
let shootCooldown = 0;
let mouseX = 0;
let mouseY = 0;
const keysPressed = {};
let projectiles = [];
let particles = [];
const acceleration = 3;
const maxSpeed = 50;
const projectileSpeed = 10;
const cooldownTime = 500;
const maxLives = 5;
const characterImage = new Image();
characterImage.src = 'img/character.png';
const backgroundImage = new Image();
backgroundImage.src = 'img/map.png';
const collisionImage = new Image();
collisionImage.src = 'img/collision.png';

let collisionData = null;

canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
});

collisionImage.onload = () => {
    const collisionCanvas = document.createElement('canvas');
    collisionCanvas.width = 800;
    collisionCanvas.height = 800;
    const collisionCtx = collisionCanvas.getContext('2d');
    collisionCtx.drawImage(collisionImage, 0, 0, 800, 800);
    collisionData = collisionCtx.getImageData(0, 0, 800, 800).data;
    console.log('Collision data loaded');
};

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = 3;
        this.velocity = {
            x: Math.random() * 2 - 1,
            y: Math.random() * 2 - 1
        };
        this.lifespan = 60;
    }

    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.lifespan--;
    }

    draw(cameraX, cameraY) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x - cameraX, this.y - cameraY, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

socket.on('connect', () => {
    console.log('connected to server');
    playerId = socket.id;

    const playerName = prompt('Enter your name (5 letters max):').substring(0, 5);
    socket.emit('join', { name: playerName });
});

socket.on('collision', (collisionData) => {
    createParticles(collisionData.x, collisionData.y);
});

socket.on('state', (state) => {
    players = state.players;
    projectiles = state.projectiles;
});

function createParticles(x, y) {
    for (let i = 0; i < 10; i++) {
        particles.push(new Particle(x, y, 'red'));
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].lifespan <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles(cameraX, cameraY) {
    particles.forEach(particle => {
        particle.draw(cameraX, cameraY);
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (playerId && players[playerId]) {
        const player = players[playerId];
        const cameraX = Math.max(0, Math.min(800 - canvas.width, player.x - canvas.width / 2));
        const cameraY = Math.max(0, Math.min(800 - canvas.height, player.y - canvas.height / 2));

        // Draw the background image
        ctx.drawImage(backgroundImage, -cameraX, -cameraY, 800, 800);

        // Draw other players
        drawOtherPlayers(cameraX, cameraY);

        // Draw the local player
        drawLocalPlayer(player, cameraX, cameraY);

        // Draw projectiles
        drawProjectiles(cameraX, cameraY);

        // Draw particles
        drawParticles(cameraX, cameraY);

        // Draw UI elements
        drawUI(player, cameraX, cameraY);
    }

    updateParticles();
    requestAnimationFrame(draw);
}

function drawOtherPlayers(cameraX, cameraY) {
    for (let id in players) {
        if (id !== playerId && !players[id].dead) {
            drawPlayer(players[id], cameraX, cameraY);
        }
    }
}

function drawLocalPlayer(player, cameraX, cameraY) {
    const characterSize = 100 * 0.5;
    const angle = Math.atan2(mouseY - (player.y - cameraY), mouseX - (player.x - cameraX));

    ctx.save();
    ctx.translate(player.x - cameraX, player.y - cameraY);
    ctx.rotate(angle);
    ctx.drawImage(characterImage, -characterSize / 2, -characterSize / 2, characterSize, characterSize);
    ctx.restore();
    drawPlayerBars(player, cameraX, cameraY);
}

function drawPlayer(player, cameraX, cameraY) {
    const characterSize = 100 * 0.5;

    ctx.save();
    ctx.translate(player.x - cameraX, player.y - cameraY);
    ctx.rotate(player.angle);
    ctx.drawImage(characterImage, -characterSize / 2, -characterSize / 2, characterSize, characterSize);
    ctx.restore();

    drawPlayerBars(player, cameraX, cameraY);
}

function drawPlayerBars(player, cameraX, cameraY) {
    const barWidth = 40;
    const barHeight = 5;
    const barOffsetY = 30;

    // Health bar
    ctx.fillStyle = 'red';
    ctx.fillRect(player.x - cameraX - barWidth / 2, player.y - cameraY + barOffsetY, barWidth, barHeight);
    ctx.fillStyle = 'green';
    ctx.fillRect(player.x - cameraX - barWidth / 2, player.y - cameraY + barOffsetY, barWidth * (player.lives / maxLives), barHeight);

    // Reload bar
    ctx.fillStyle = 'green';
    ctx.fillRect(player.x - cameraX - barWidth / 2, player.y - cameraY + barOffsetY + barHeight + 2, barWidth, barHeight);
    if (player.shootCooldown > 0) {
        ctx.fillStyle = 'blue';
        ctx.fillRect(player.x - cameraX - barWidth / 2, player.y - cameraY + barOffsetY + barHeight + 2, barWidth * (1 - player.shootCooldown / cooldownTime), barHeight);
    }
}

function drawProjectiles(cameraX, cameraY) {
    for (let projectile of projectiles) {
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(projectile.x - cameraX, projectile.y - cameraY, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawUI(player, cameraX, cameraY) {
    if (player.dead && player.respawnTime) {
        const respawnTimeLeft = Math.max(0, Math.ceil((player.respawnTime - Date.now()) / 1000));
        ctx.fillStyle = 'black';
        ctx.font = '30px Arial';
        ctx.fillText(`Dead, respawning in ${respawnTimeLeft}...`, canvas.width / 2 - 150, canvas.height / 2);
    }
}

canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0 && shootCooldown <= 0) {
        fireProjectile(event.clientX, event.clientY);
    }
});

canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;

    if (playerId && players[playerId]) {
        const player = players[playerId];
        const cameraX = Math.max(0, Math.min(800 - canvas.width, player.x - canvas.width / 2));
        const cameraY = Math.max(0, Math.min(800 - canvas.height, player.y - canvas.height / 2));
        const angle = Math.atan2(mouseY - (player.y - cameraY), mouseX - (player.x - cameraX));
        socket.emit('playerAngle', angle);
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
        console.log('Fire! Shoot cooldown set to:', shootCooldown);
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
    if (playerSpeed.y < -maxSpeed) playerSpeed.y = -maxSpeed;

    movement.x = playerSpeed.x;
    movement.y = playerSpeed.y;

    if (playerId && players[playerId]) {
        let newX = players[playerId].x + movement.x;
        let newY = players[playerId].y + movement.y;
        if (!isCollidingWithObstacles(newX, newY, 20)) {
            socket.emit('move', movement);
        }
    }

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

        let collision = false;

        if (projectile.x < 0 || projectile.x > 800 || projectile.y < 0 || projectile.y > 800 ||
            isCollidingWithObstacles(projectile.x, projectile.y, 5)) {
            collision = true;
        }

        for (let id in players) {
            if (id !== projectile.ownerId) {
                let player = players[id];
                if (!player.dead && Math.hypot(projectile.x - player.x, projectile.y - player.y) < 20) {
                    collision = true;
                    socket.emit('playerHit', { playerId: id, projectileId: i });
                    break;
                }
            }
        }

        if (collision) {
            createParticles(projectile.x, projectile.y);
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

setInterval(updateMovement, 1000 / 60);

draw();
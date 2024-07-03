const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const { isCollidingWithObstacles, getRandomColor, loadScores, saveScores, findValidPosition } = require('./utilities');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const players = {};
const projectiles = [];
const cooldownTime = 500; // Temps de recharge de 0.5 seconde
const respawnTime = 5000; // Temps de respawn de 5 secondes
const maxLives = 5;
const projectileSpeed = 10; // Vitesse des projectiles
const playerSockets = {};
const scoreFile = 'scores.json';
const port = process.env.PORT || 3000;  // Définir le port ici, utiliser le port spécifié par l'environnement

let collisionData = null;
let scores = loadScores(); // Charge les scores dès le démarrage

// Charger l'image de collision
loadImage('public/img/collision.png').then((image) => {
    const canvas = createCanvas(800, 800);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, 800, 800);
    collisionData = ctx.getImageData(0, 0, 800, 800).data;
    console.log('Collision data loaded');
}).catch((error) => {
    console.error('Error loading collision image:', error);
});

app.use(express.json());
app.use(express.static('public')); // Servir les fichiers statiques depuis le répertoire public

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        playerSockets[data.name] = socket;
        let currentScore = scores[data.name] || 0;
        let spawnX, spawnY;
        do {
            spawnX = Math.random() * 800;
            spawnY = Math.random() * 800;
        } while (isCollidingWithObstacles(spawnX, spawnY, 20, collisionData));

        players[socket.id] = {
            x: spawnX,
            y: spawnY,
            color: getRandomColor(),
            name: data.name,
            lives: maxLives,
            dead: false,
            respawnTime: null,
            lastShotTime: 0,
            score: currentScore
        };
        console.log(`Player connected: ${data.name}`);
        io.emit('state', { players, projectiles });
    });

    socket.on('move', (movement) => {
        const player = players[socket.id];
        if (player && !player.dead) {
            const newX = player.x + movement.x;
            const newY = player.y + movement.y;

            // Vérifier les collisions avant de mettre à jour la position du joueur
            if (!isCollidingWithObstacles(newX, newY, 20, collisionData)) {
                player.x = newX;
                player.y = newY;
            } else {
                // Essayer de déplacer le joueur de petites étapes jusqu'à trouver une position valide
                const [adjustedX, adjustedY] = findValidPosition(player.x, player.y, movement.x, movement.y, 20, collisionData);
                player.x = adjustedX;
                player.y = adjustedY;
            }

            player.x = Math.max(0, Math.min(800, player.x));
            player.y = Math.max(0, Math.min(800, player.y));
            io.emit('state', { players, projectiles });
        }
    });

    socket.on('fire', (projectile) => {
        const player = players[socket.id];
        if (player && !player.dead) {
            const now = Date.now();
            if (now - player.lastShotTime >= cooldownTime) {
                projectiles.push({ ...projectile, ownerId: socket.id });
                player.lastShotTime = now;
                player.shootCooldown = cooldownTime; // Assurez-vous que shootCooldown est initialisé
                io.emit('state', { players, projectiles });
            }
        }
    });
    socket.on('bulletHit', (data) => {
      io.emit('collision', { x: data.x, y: data.y });
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            scores[players[socket.id].name] = players[socket.id].score;
            saveScores(scores);
            delete players[socket.id];
        }
        Object.keys(playerSockets).forEach(name => {
            if (playerSockets[name].id === socket.id) {
                delete playerSockets[name];
            }
        });
        io.emit('state', { players, projectiles });
    });
});

setInterval(updateProjectiles, 1000 / 60);

function updateProjectiles() {
    for (let id in players) {
        let player = players[id];
        if (player.shootCooldown > 0) {
            player.shootCooldown -= 1000 / 60;
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let projectile = projectiles[i];
        projectile.x += projectile.direction.x * projectileSpeed;
        projectile.y += projectile.direction.y * projectileSpeed;

        if (isCollidingWithObstacles(projectile.x, projectile.y, 5, collisionData)) {
            projectiles.splice(i, 1);
        } else {
            for (let id in players) {
                let player = players[id];
                if (!player.dead && id !== projectile.ownerId && Math.hypot(projectile.x - player.x, projectile.y - player.y) < 20) {
                    projectiles.splice(i, 1);
                    player.lives--;
                    if (player.lives <= 0) {
                        player.dead = true;
                        player.respawnTime = Date.now() + respawnTime;
                        players[projectile.ownerId].score += 1;  // Incrémentation du score
                        console.log(`Player ${player.name} is dead and will respawn in ${respawnTime / 1000} seconds.`);
                    }
                    break;
                }
            }
        }
    }

    for (let id in players) {
        let player = players[id];
        if (player.dead && Date.now() >= player.respawnTime) {
            let spawnX, spawnY;
            do {
                spawnX = Math.random() * 800;
                spawnY = Math.random() * 800;
            } while (isCollidingWithObstacles(spawnX, spawnY, 20, collisionData));

            player.dead = false;
            player.lives = maxLives;
            player.x = spawnX;
            player.y = spawnY;
            console.log(`Player ${player.name} has respawned.`);
        }
    }

    io.emit('state', { players, projectiles });
}

// Route pour vérifier la santé de l'application
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.post('/admin/shutdown', (req, res) => {
    console.log("Shutting down the server...");
    res.send("Shutting down the server...");
    server.close(() => {
        process.exit(0);
    });
});

app.post('/admin/kick', (req, res) => {
    const playerName = req.body.playerName;
    const socket = playerSockets[playerName];
    if (socket) {
        socket.disconnect(true);
        console.log(`Kicking player: ${playerName}`);
        res.send(`Player ${playerName} has been kicked out.`);
    } else {
        console.log(`Player ${playerName} not found.`);
        res.status(404).send(`Player ${playerName} not found.`);
    }
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

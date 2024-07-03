const fs = require('fs');
const scoreFile = 'scores.json';

function isCollidingWithObstacles(x, y, radius, collisionData) {
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
 
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function loadScores() {
    if (fs.existsSync(scoreFile)) {
        return JSON.parse(fs.readFileSync(scoreFile));
    } else {
        return {};
    }
}

function saveScores(scores) {
    fs.writeFileSync(scoreFile, JSON.stringify(scores));
}

function findValidPosition(x, y, dx, dy, radius, collisionData) {
    const step = 1; // Petite distance de déplacement pour éviter les téléportations visibles
    for (let i = 0; i < Math.abs(dx); i++) {
        const newX = x + Math.sign(dx) * step;
        if (!isCollidingWithObstacles(newX, y, radius, collisionData)) {
            x = newX;
        } else {
            break;
        }
    }
    for (let i = 0; i < Math.abs(dy); i++) {
        const newY = y + Math.sign(dy) * step;
        if (!isCollidingWithObstacles(x, newY, radius, collisionData)) {
            y = newY;
        } else {
            break;
        }
    }
    return [x, y];
}

module.exports = {
    isCollidingWithObstacles,
    getRandomColor,
    loadScores,
    saveScores,
    findValidPosition
};

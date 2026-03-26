const gameMap = document.getElementById('gameMap');
const playerElement = document.getElementById('player');
const enemyElement = document.getElementById('enemy');
const finishZoneElement = document.getElementById('finishZone');
const scoreElement = document.getElementById('score');
const statusElement = document.getElementById('status');
const dashButtonElement = document.getElementById('dashButton');
const restartButtonElement = document.getElementById('restartButton');
const dashCooldownElement = document.getElementById('dashCooldown');
const mobileDashButtonElement = document.getElementById('mobileDashButton');
const dpadButtons = document.querySelectorAll('[data-move]');
const difficultySelectElement = document.getElementById('difficultySelect');
const startMenuElement = document.getElementById('startMenu');
const gamePageElement = document.getElementById('gamePage');
const playButtonElement = document.getElementById('playButton');

const player = {
	x: 220,
	y: 220,
	size: 22,
	speed: 3
};

const enemy = {
	x: 500,
	y: 320,
	size: 22,
	baseSpeed: player.speed * 0.5,
	speedGrowthPerSecond: 0.05
};

const finishZone = {
	x: 0,
	y: 0,
	width: 130,
	height: 110
};

const items = [];
const keys = {};
let score = 0;
let gameOver = false;
let difficulty = 'normal';
const dashDistance = 70;
const dashCooldownMs = 1000;
let lastDashTime = -dashCooldownMs;
let dashDirection = { x: 1, y: 0 };
let gameStartTime = 0;
let animationFrameId = null;
const defaultStatusText = 'Collect items, avoid the enemy, and reach the green finish zone any time.';
const directionKeyMap = {
	up: 'arrowup',
	down: 'arrowdown',
	left: 'arrowleft',
	right: 'arrowright'
};

document.addEventListener('keydown', (event) => {
	if (event.code === 'Space') {
		event.preventDefault();
		tryDash();
	}

	keys[event.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (event) => {
	keys[event.key.toLowerCase()] = false;
});

function randomRange(min, max) {
	return Math.random() * (max - min) + min;
}

function getDifficultyMultiplier() {
	// Hard mode makes enemy speed 25% faster
	return difficulty === 'hard' ? 1.25 : 1;
}

function setMoveKey(direction, isPressed) {
	const keyName = directionKeyMap[direction];
	if (!keyName) {
		return;
	}

	keys[keyName] = isPressed;
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function isColliding(a, b) {
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
}

function updateElementPosition(element, x, y) {
	element.style.left = `${x}px`;
	element.style.top = `${y}px`;
}

function removeAllItems() {
	items.forEach((item) => item.element.remove());
	items.length = 0;
}

function randomItemPosition(mapWidth, mapHeight, itemSize) {
	return {
		x: randomRange(finishZone.width + 8, mapWidth - itemSize - 8),
		y: randomRange(8, mapHeight - itemSize - 8)
	};
}

function spawnTwoItems() {
	const mapWidth = gameMap.clientWidth;
	const mapHeight = gameMap.clientHeight;
	const size = 32;

	removeAllItems();

	const bluePos = randomItemPosition(mapWidth, mapHeight, size);
	let redPos = randomItemPosition(mapWidth, mapHeight, size);
	let attempts = 0;

	// Keep trying random red positions until it is closer to the player than blue.
	while (
		Math.hypot(redPos.x - player.x, redPos.y - player.y) >=
			Math.hypot(bluePos.x - player.x, bluePos.y - player.y) &&
		attempts < 40
	) {
		redPos = randomItemPosition(mapWidth, mapHeight, size);
		attempts += 1;
	}

	// Fallback: if random attempts fail, place red halfway between player and blue.
	if (attempts >= 40) {
		redPos = {
			x: (bluePos.x + player.x) / 2,
			y: (bluePos.y + player.y) / 2
		};
	}

	const blueElement = document.createElement('div');
	blueElement.className = 'item item-blue';
	gameMap.appendChild(blueElement);

	const redElement = document.createElement('div');
	redElement.className = 'item item-red';
	gameMap.appendChild(redElement);

	const blueItem = {
		element: blueElement,
		x: bluePos.x,
		y: bluePos.y,
		width: size,
		height: size,
		type: 'blue'
	};

	const redItem = {
		element: redElement,
		x: clamp(redPos.x, finishZone.width + 8, mapWidth - size - 8),
		y: clamp(redPos.y, 8, mapHeight - size - 8),
		width: size,
		height: size,
		type: 'red'
	};

	updateElementPosition(blueElement, blueItem.x, blueItem.y);
	updateElementPosition(redElement, redItem.x, redItem.y);
	items.push(blueItem, redItem);
}

function movePlayer() {
	let directionX = 0;
	let directionY = 0;

	if (keys['arrowup'] || keys['w']) {
		directionY -= 1;
	}
	if (keys['arrowdown'] || keys['s']) {
		directionY += 1;
	}
	if (keys['arrowleft'] || keys['a']) {
		directionX -= 1;
	}
	if (keys['arrowright'] || keys['d']) {
		directionX += 1;
	}

	if (directionX !== 0 || directionY !== 0) {
		const magnitude = Math.hypot(directionX, directionY);
		dashDirection.x = directionX / magnitude;
		dashDirection.y = directionY / magnitude;

		player.x += dashDirection.x * player.speed;
		player.y += dashDirection.y * player.speed;
	}

	const maxX = gameMap.clientWidth - player.size;
	const maxY = gameMap.clientHeight - player.size;

	player.x = clamp(player.x, 0, maxX);
	player.y = clamp(player.y, 0, maxY);
}

function updateDashUI(currentTime = performance.now()) {
	const timeSinceDash = currentTime - lastDashTime;
	const remainingMs = Math.max(0, dashCooldownMs - timeSinceDash);

	if (remainingMs > 0) {
		dashButtonElement.disabled = true;
		dashCooldownElement.textContent = `Dash cooling down: ${(remainingMs / 1000).toFixed(1)}s`;
		return;
	}

	dashButtonElement.disabled = false;
	dashCooldownElement.textContent = 'Dash ready';
}

function tryDash(currentTime = performance.now()) {
	if (gameOver) {
		return;
	}

	if (currentTime - lastDashTime < dashCooldownMs) {
		updateDashUI(currentTime);
		return;
	}

	player.x += dashDirection.x * dashDistance;
	player.y += dashDirection.y * dashDistance;

	const maxX = gameMap.clientWidth - player.size;
	const maxY = gameMap.clientHeight - player.size;
	player.x = clamp(player.x, 0, maxX);
	player.y = clamp(player.y, 0, maxY);

	lastDashTime = currentTime;
	updateDashUI(currentTime);
}

function moveEnemy() {
	// Move enemy toward player by using a normalized direction vector.
	const dx = player.x - enemy.x;
	const dy = player.y - enemy.y;
	const distance = Math.hypot(dx, dy) || 1;
	const elapsedSeconds = (performance.now() - gameStartTime) / 1000;
	const basedEnemySpeed = enemy.baseSpeed + elapsedSeconds * enemy.speedGrowthPerSecond;
	const enemySpeed = basedEnemySpeed * getDifficultyMultiplier();

	enemy.x += (dx / distance) * enemySpeed;
	enemy.y += (dy / distance) * enemySpeed;

	const maxX = gameMap.clientWidth - enemy.size;
	const maxY = gameMap.clientHeight - enemy.size;
	enemy.x = clamp(enemy.x, 0, maxX);
	enemy.y = clamp(enemy.y, 0, maxY);
}

function checkItemCollection() {
	const playerBox = {
		x: player.x,
		y: player.y,
		width: player.size,
		height: player.size
	};

	const touchedItem = items.find((item) => isColliding(playerBox, item));

	if (!touchedItem) {
		return;
	}

	// Blue is worth 2 points, red is worth 1 point.
	const points = touchedItem.type === 'blue' ? 2 : 1;
	score += points;
	scoreElement.textContent = `${score}`;

	// Always keep exactly two items active after every pickup.
	spawnTwoItems();
}

function checkLoseCondition() {
	const playerBox = {
		x: player.x,
		y: player.y,
		width: player.size,
		height: player.size
	};

	const enemyBox = {
		x: enemy.x,
		y: enemy.y,
		width: enemy.size,
		height: enemy.size
	};

	if (isColliding(playerBox, enemyBox)) {
		statusElement.textContent = `Caught! Final score: ${score}. Press Restart to play again.`;
		gameOver = true;
	}
}

function checkFinishCondition() {
	const playerBox = {
		x: player.x,
		y: player.y,
		width: player.size,
		height: player.size
	};

	const finishZoneBox = {
		x: finishZone.x,
		y: finishZone.y,
		width: finishZone.width,
		height: finishZone.height
	};

	if (isColliding(playerBox, finishZoneBox)) {
		statusElement.textContent = `Level complete! You finished with ${score} points.`;
		gameOver = true;
	}
}

function render() {
	updateElementPosition(playerElement, player.x, player.y);
	updateElementPosition(enemyElement, enemy.x, enemy.y);
}

function showMenu() {
	startMenuElement.style.display = 'flex';
	gamePageElement.style.display = 'none';
}

function hideMenu() {
	startMenuElement.style.display = 'none';
	gamePageElement.style.display = 'grid';
}

function gameLoop() {
	if (gameOver) {
		updateDashUI();
		animationFrameId = null;
		return;
	}

	movePlayer();
	moveEnemy();
	checkItemCollection();
	checkLoseCondition();
	checkFinishCondition();
	updateDashUI();
	render();

	animationFrameId = requestAnimationFrame(gameLoop);
}

function startGame() {
	if (animationFrameId !== null) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}

	hideMenu();

	// Keep finish zone dimensions in sync with CSS (including responsive changes).
	const finishRect = finishZoneElement.getBoundingClientRect();
	const mapRect = gameMap.getBoundingClientRect();
	finishZone.width = finishRect.width;
	finishZone.height = finishRect.height;

	player.x = 220;
	player.y = 220;
	keys['w'] = false;
	keys['a'] = false;
	keys['s'] = false;
	keys['d'] = false;
	keys['arrowup'] = false;
	keys['arrowdown'] = false;
	keys['arrowleft'] = false;
	keys['arrowright'] = false;
	lastDashTime = -dashCooldownMs;
	dashDirection = { x: 1, y: 0 };
	gameOver = false;
	score = 0;
	scoreElement.textContent = `${score}`;
	statusElement.textContent = defaultStatusText;
	gameStartTime = performance.now();

	// Start enemy near the bottom-right on any screen size.
	enemy.x = mapRect.width - enemy.size - 18;
	enemy.y = mapRect.height - enemy.size - 18;

	spawnTwoItems();
	render();

	updateDashUI();

	animationFrameId = requestAnimationFrame(gameLoop);
}

dashButtonElement.addEventListener('click', () => {
	tryDash();
});

restartButtonElement.addEventListener('click', () => {
	startGame();
});

// Mobile D-pad supports press-and-hold movement.
dpadButtons.forEach((button) => {
	const direction = button.dataset.move;

	button.addEventListener('pointerdown', (event) => {
		event.preventDefault();
		setMoveKey(direction, true);
		button.classList.add('pressed');
	});

	button.addEventListener('pointerup', (event) => {
		event.preventDefault();
		setMoveKey(direction, false);
		button.classList.remove('pressed');
	});

	button.addEventListener('pointerleave', () => {
		setMoveKey(direction, false);
		button.classList.remove('pressed');
	});

	button.addEventListener('pointercancel', () => {
		setMoveKey(direction, false);
		button.classList.remove('pressed');
	});
});

mobileDashButtonElement.addEventListener('pointerdown', (event) => {
	event.preventDefault();
	tryDash();
});

difficultySelectElement.addEventListener('change', (event) => {
	difficulty = event.target.value;
});

playButtonElement.addEventListener('click', () => {
	startGame();
});

showMenu();

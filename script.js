/* DOM */
const canvas = document.getElementById('game-board');
const ctx = canvas.getContext('2d', { alpha: false });
const overlay = document.querySelector('.overlay');
const overlayMsg = document.getElementById('overlay-msg');
const overlayTitle = document.getElementById('overlay-title');
const overlayBody = document.getElementById('overlay-body');
const startBtn = document.getElementById('start-btn');
const resumeBtn = document.getElementById('resume-btn');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const highScoreMenu = document.getElementById('high-score');
const pauseBtn = document.getElementById('pause-btn');
const restartBtn = document.getElementById('restart-btn');
const sizeSelect = document.getElementById('size-select');
const themeSelect = document.getElementById('theme-select');
const speedDisplay = document.getElementById('speed-display');
const playsCountEl = document.getElementById('plays-count');
const minSpeedDisplay = document.getElementById('min-speed-display');
const muteBtn = document.getElementById('mute-btn');

/* Game config and state */
let GRID = parseInt(sizeSelect.value, 10) || 20;
let TILE = Math.floor(canvas.width / GRID);
let snake = [];
let food = {};
let dir = { x: 1, y: 0 }; // grid direction (x,y) - values are -1,0,1
let nextDir = { x: 1, y: 0 };
let score = 0;
let highScore = 0;
let running = false;
let paused = false;
let tickInterval = 140; // ms base
const MIN_TICK = 50; // fastest allowed tick
let tickHandle = null;
let plays = 0;
let minTickSeen = 9999;
let soundOn = true;

/* Themes */
const THEMES = {
    neon: { bg: '#081226', snakeHead: '#84F3C9', snakeBody: '#06B6D4', food: '#FB7185' },
    classic: { bg: '#0b1220', snakeHead: '#4ade80', snakeBody: '#10b981', food: '#ef4444' },
    retro: { bg: '#121212', snakeHead: '#FFD166', snakeBody: '#06D6A0', food: '#FF6B6B' },
};

/* Audio (simple beep) */
const audioCtx = typeof AudioContext !== 'undefined' ? new AudioContext() : null;
function beep(freq=440, length=0.06, volume=0.06){
    if(!audioCtx || !soundOn) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = volume;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); g.disconnect(); }, length*1000);
}

/* Utilities */
    function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
    function randInt(max){ return Math.floor(Math.random() * max); }

/* Storage */
function loadHighScore(){
    const stored = parseInt(localStorage.getItem('snakeHighScore') || '0', 10);
    highScore = !isNaN(stored) ? stored : 0;
    highScoreEl.textContent = highScore;
}
function saveHighScore(){
    if(score > highScore){
        highScore = score;
        localStorage.setItem('snakeHighScore', String(highScore));
        highScoreEl.textContent = highScore;
    }
}

/* Board / Resize helpers */
function setGrid(newGrid){
    GRID = newGrid;
    TILE = Math.floor(canvas.width / GRID);
}

function resetGameState(){
    setGrid(parseInt(sizeSelect.value, 10) || 20);
    score = 0;
    scoreEl.textContent = score;
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    // center snake horizontally, near top/center
    const midX = Math.floor(GRID/2);
    snake = [
        { x: midX - 1, y: Math.floor(GRID/2) },
        { x: midX - 2, y: Math.floor(GRID/2) },
        { x: midX - 3, y: Math.floor(GRID/2) }
    ];
    tickInterval = 140; // base
    minTickSeen = 9999;
    plays++;
    playsCountEl.textContent = plays;
}

function spawnFood(){
    let fx, fy, tries = 0;
    do {
        fx = randInt(GRID);
        fy = randInt(GRID);
        tries++;
        // safety fallback: break after many tries and clear tail
        if(tries > 200){
            // create deterministic loop-free spot by clearing tail
            fx = (snake[0].x + 3) % GRID;
            fy = (snake[0].y + 3) % GRID;
            break;
        }
    } while(snake.some(p => p.x===fx && p.y===fy));
    food = { x: fx, y: fy };
}

/* Drawing */
function clearBoard(){
    const theme = THEMES[themeSelect.value] || THEMES.neon;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0,0,canvas.width,canvas.height);
}

function drawFood(){
    const theme = THEMES[themeSelect.value] || THEMES.neon;
    ctx.fillStyle = theme.food;
    ctx.fillRect(food.x * TILE + 2, food.y * TILE + 2, TILE - 4, TILE - 4);
    // small inner highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(food.x * TILE + TILE/4, food.y * TILE + TILE/4, TILE/2, TILE/2);
}

function drawSnake(){
    const theme = THEMES[themeSelect.value] || THEMES.neon;
    // draw tail->head for shading
    for(let i=snake.length-1;i>=0;i--){
        const p = snake[i];
        const x = p.x * TILE;
        const y = p.y * TILE;
    // head render
        if(i === 0){
        // rounded head
            roundRect(ctx, x+1, y+1, TILE-2, TILE-2, Math.max(6, TILE*0.14));
            ctx.fillStyle = theme.snakeHead;
            ctx.fill();
            // small eye
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            const eyeX = x + (dir.x > 0 ? TILE*0.7 : dir.x < 0 ? TILE*0.2 : TILE*0.5);
            const eyeY = y + (dir.y > 0 ? TILE*0.7 : dir.y < 0 ? TILE*0.2 : TILE*0.35);
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, Math.max(1, TILE*0.06), 0, Math.PI*2);
            ctx.fill();
        } else {
            // body parts gradient
            const grad = ctx.createLinearGradient(x, y, x+TILE, y+TILE);
            grad.addColorStop(0, theme.snakeBody);
            grad.addColorStop(1, 'rgba(0,0,0,0.05)');
            roundRect(ctx, x+1, y+1, TILE-2, TILE-2, Math.max(4, TILE*0.1));
            ctx.fillStyle = grad;
            ctx.fill();
        }
    }
}

function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/* Game logic */
function update(){
    if(!running || paused) return;

    // update direction (prevent reversing)
    if((nextDir.x !== -dir.x || nextDir.y !== -dir.y) || snake.length === 1){
        dir = { x: nextDir.x, y: nextDir.y };
    }

    // compute next head
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // wall collision -> game over
    if(head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID){
        endGame();
        return;
    }

    // self collision
    if(snake.some((p,i) => i>0 && p.x===head.x && p.y===head.y)){
        endGame();
        return;
    }

    // push head
    snake.unshift(head);

    // food eaten?
    if(head.x === food.x && head.y === food.y){
        score++;
        scoreEl.textContent = score;
        spawnFood();
        beep(880, 0.05, 0.08);
        // speed increases slightly every 3 points or so
        if(score % 3 === 0 && tickInterval > MIN_TICK){
            tickInterval = Math.max(MIN_TICK, Math.round(tickInterval - 6));
            restartTick(); // update interval
            }
        } else {
        // remove tail
        snake.pop();
    }
}

function drawGridGuide() {
    ctx.strokeStyle = "rgba(255,255,255,0.08)";  // soft white
    ctx.lineWidth = 1;

    // vertical lines
    for (let x = 0; x <= GRID; x++) {
        ctx.beginPath();
        ctx.moveTo(x * TILE, 0);
        ctx.lineTo(x * TILE, canvas.height);
        ctx.stroke();
    }

    // horizontal lines
    for (let y = 0; y <= GRID; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * TILE);
        ctx.lineTo(canvas.width, y * TILE);
        ctx.stroke();
    }
}

function loopDraw(){
    clearBoard();
    drawGridGuide();
    drawFood();
    drawSnake();
}

function gameTick(){
    update();
    loopDraw();
        // track min tick for display
        minTickSeen = Math.min(minTickSeen, tickInterval);
        minSpeedDisplay.textContent = `${minTickSeen} ms`;
        // update speed label (human friendly)
        speedDisplay.textContent = tickInterval <= 80 ? 'Fast' : tickInterval <= 110 ? 'Normal' : 'Relaxed';
    }

function startGame(){
    paused = false;
    if(running) return;
    resetGameState();
    spawnFood();
    running = true;
    paused = false;
    overlayMsg.classList.remove('show');
    overlay.style.display = 'none';
    overlayTitle.textContent = 'Go, Snake!';
    restartTick();
    saveHighScore(); // ensure high score UI updated
    beep(660, 0.06, 0.08);
}

function endGame(){
    running = false;
    paused = false;
    clearInterval(tickHandle);
    tickHandle = null;
    overlayTitle.textContent = 'Game Over';
    overlayBody.textContent = `Score: ${score} — High Score: ${Math.max(score, highScore)}`;
    overlay.style.display = 'flex';
    overlayMsg.classList.add('show');
    startBtn.textContent = 'Play Again';
    resumeBtn.style.display = 'none';
    saveHighScore();
    beep(220, 0.12, 0.14);
}

function pauseGame(){
    if(!running || paused) return;
    paused = true;
    clearInterval(tickHandle);
    tickHandle = null;
    overlayTitle.textContent = 'Paused';
    overlayBody.textContent = `Score: ${score}`;
    overlay.style.display = 'flex';
    overlayMsg.classList.add('show');
    resumeBtn.style.display = 'inline-block';
    beep(330, 0.04, 0.04);
}

function resumeGame(){
    if(!running || !paused) return;
    paused = false;
    overlayMsg.classList.remove('show');
    overlay.style.display = 'none';
    resumeBtn.style.display = 'none';
    restartTick();
    beep(660, 0.04, 0.06);
}

function restartTick(){
    if(tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(gameTick, tickInterval);
}

function restartNow(){
    // restart from overlay
    running = false;
    paused = false;
    clearInterval(tickHandle);
    tickHandle = null;
    startGame();
}

/* Input handling (arrow keys / wasd) */
const keyMap = {
    ArrowLeft: {x:-1,y:0}, ArrowRight: {x:1,y:0}, ArrowUp: {x:0,y:-1}, ArrowDown: {x:0,y:1},
    a: {x:-1,y:0}, d:{x:1,y:0}, w:{x:0,y:-1}, s:{x:0,y:1}
};

function handleKey(e){
    const k = e.key;
    const lk = k.length === 1 ? k.toLowerCase() : k;
    if(keyMap[lk]){
        e.preventDefault();
        const nd = keyMap[lk];
        // allow change, but don't let direct reverse if snake length > 1
        if(snake.length > 1 && nd.x === -dir.x && nd.y === -dir.y) return;
        nextDir = nd;
    } else if(k === 'p' || k === 'P'){
        if(!running) return;
        if(paused) resumeGame(); else pauseGame();
    } else if(k === ' '){ // space to pause/resume
        if(!running) return;
        if(paused) resumeGame(); else pauseGame();
    }
}

/* Click handlers */
startBtn.addEventListener('click', ()=> {
    paused = false; 
    running = false;
    overlay.style.display = 'none';     // hide full overlay
    overlayMsg.classList.remove('show'); // hide the box
    startGame();
});
resumeBtn.addEventListener('click', ()=> resumeGame());
pauseBtn.addEventListener('click', ()=> {
    if(!running) return;
    if(paused) resumeGame(); else pauseGame();
});
restartBtn.addEventListener('click', ()=>{
    restartNow();
});

sizeSelect.addEventListener('change', ()=>{
    // apply new grid size only if not running; otherwise require restart
    if(running){
        alert('Change will take effect on next start/restart.');
    } else {
        setGrid(parseInt(sizeSelect.value,10));
    }
});

themeSelect.addEventListener('change', ()=>{
    loopDraw();
});

muteBtn.addEventListener('click', ()=>{
    soundOn = !soundOn;
    muteBtn.textContent = soundOn ? '🔊 Sound' : '🔇 Muted';
});

/* Start-up */
loadHighScore();
overlay.style.display = 'flex';
overlayMsg.classList.add('show');
overlayTitle.textContent = 'Ready?';
overlayBody.textContent = 'Press Start to play — arrow keys or WASD to move';
startBtn.textContent = 'Start Game';
resumeBtn.style.display = 'none';
scoreEl.textContent = '0';
playsCountEl.textContent = '0';
minSpeedDisplay.textContent = 'N/A';

/* Keyboard listener */
window.addEventListener('keydown', handleKey, {passive:false});

/* Initial draw loop for polish when not running */
function idleDraw(){
    if (running) return;  // ❗ Stop repainting during gameplay

    clearBoard();
    drawGridGuide();

    // draw placeholder snake + food if not running
    const t = parseInt(sizeSelect.value,10);
    const mid = Math.floor(t/2);
    const oldGrid = GRID;
    setGrid(t);

    const mockSnake = [
        {x:mid-1,y:mid}, 
        {x:mid-2,y:mid}, 
        {x:mid-3,y:mid}
    ];

    // mock food
    ctx.fillStyle = THEMES[themeSelect.value].food;
    ctx.fillRect((mid+4)*TILE+2, mid*TILE+2, TILE-4, TILE-4);

    // mock snake
    ctx.fillStyle = THEMES[themeSelect.value].snakeHead;
    roundRect(ctx, (mid-1)*TILE+1, mid*TILE+1, TILE-2, TILE-2, 6);
    ctx.fill();

    ctx.fillStyle = THEMES[themeSelect.value].snakeBody;
    roundRect(ctx, (mid-2)*TILE+1, mid*TILE+1, TILE-2, TILE-2, 4);
    ctx.fill();
    roundRect(ctx, (mid-3)*TILE+1, mid*TILE+1, TILE-2, TILE-2, 4);
    ctx.fill();

    setGrid(oldGrid);

    // loop only if not running
    setTimeout(()=> requestAnimationFrame(idleDraw), 300);
}
requestAnimationFrame(idleDraw);


// Clean up on page hide/unload
window.addEventListener('blur', () => { if(running && !paused) pauseGame(); });

// Prevent arrow keys from scrolling the page
window.addEventListener('keydown', function(e){
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)){
        e.preventDefault();
    }
}, {passive:false});
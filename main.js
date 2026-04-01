const $ = (id) => document.getElementById(id);

const ui = {
  menu: $("menu"),
  titleText: $("titleText"),
  hintText: $("hintText"),
  startText: $("startText"),
  retryText: $("retryText"),
  gameOverText: $("gameOverText"),
  hudLeft: $("hiScore"),
  hudRight: $("score"),
  gameOver: $("gameOver"),
  finalScore: $("finalScore"),
  btnStart: $("btnStart"),
  btnRestart: $("btnRestart"),
  imgTitle: $("imgTitle"),
  imgHint: $("imgHint"),
  imgStartBtn: $("imgStartBtn"),
  imgGameOver: $("imgGameOver"),
  imgRetryBtn: $("imgRetryBtn"),
};

const canvas = $("game");
const ctx = canvas.getContext("2d", { alpha: false });

// ---------- 1. 资源管理 ----------
const ASSET_BASE = "./assets/";
const ASSET_FILES = {
  catRun1: "cat-run-1.png",
  catRun2: "cat-run-2.png",
  catRun3: "cat-run-3.png",
  catJump: "cat-jump.png",
  catDead: "cat-dead.png",
  egg: "egg.png",
  seagull1: "seagull-1.png",
  seagull2: "seagull-2.png",
  seagull3: "seagull-3.png",
  mountain: "mountain.png",
  groundTile: "ground-tile.png",
  skyTile: "sky-tile.png",
  uiTitle: "ui-title.png",
  uiHint: "ui-hint.png",
  uiStartBtn: "ui-start-btn.png",
  uiGameOver: "ui-gameover.png",
  uiRetryBtn: "ui-retry-btn.png",
};

const images = new Map();

async function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn(`加载失败: ${src}`); resolve(null); };
  });
}

async function loadAssets() {
  const entries = Object.entries(ASSET_FILES);
  await Promise.all(entries.map(async ([key, file]) => {
    const img = await loadImage(`${ASSET_BASE}${file}`);
    if (img) images.set(key, img);
  }));
  applyUiAssets();
}

function getImg(key) { return images.get(key) || null; }

function applyUiAssets() {
  const configs = [
    { key: "uiTitle", img: ui.imgTitle, text: ui.titleText },
    { key: "uiHint", img: ui.imgHint, text: ui.hintText },
    { key: "uiStartBtn", img: ui.imgStartBtn, text: ui.startText },
    { key: "uiGameOver", img: ui.imgGameOver, text: ui.gameOverText },
    { key: "uiRetryBtn", img: ui.imgRetryBtn, text: ui.retryText },
  ];
  configs.forEach(conf => {
    const asset = getImg(conf.key);
    if (asset && conf.img) {
      conf.img.src = asset.src;
      conf.img.style.display = "block";
      if (conf.text) conf.text.style.display = "none";
    }
  });
}

// ---------- 2. 音频引擎 ----------
class AudioEngine {
  constructor() { this.ctx = null; this.master = null; this.bgTimer = null; this.isBgOn = false; this.isInited = false; this.noteIdx = 0; }
  async ensure() {
    if (this.isInited) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
    this.isInited = true;
  }
  async startBackground() {
    await this.ensure();
    if (!this.ctx || this.isBgOn) return;
    await this.ctx.resume?.();
    this.isBgOn = true;
    this.noteIdx = 0;
    this.scheduleLoop();
  }
  stopBackground() { this.isBgOn = false; if (this.bgTimer) clearInterval(this.bgTimer); this.bgTimer = null; }
  scheduleLoop() {
    const bpm = 120;
    const stepMs = (60_000 / bpm) / 2;
    const scale = [0, 2, 4, 7, 9, 12];
    const baseFreq = 261.63;
    const pattern = [0, 1, 2, 3, 2, 1, 4, 5];
    this.bgTimer = setInterval(() => {
      if (!this.isBgOn || !this.ctx) return;
      const now = this.ctx.currentTime;
      const degree = pattern[this.noteIdx % pattern.length];
      const semitone = scale[degree % scale.length];
      const freq = baseFreq * Math.pow(2, semitone / 12);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.13);
      this.noteIdx++;
    }, stepMs);
  }
  jumpSound(kind) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(kind === "big" ? 440 : 330, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.09);
  }
  hitSound() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.22);
  }
}

const audio = new AudioEngine();

// ---------- 3. 游戏状态与核心变量 ----------
const GameState = { menu: "menu", playing: "playing", dying: "dying", gameover: "gameover" };
let state = GameState.menu;

const world = { dpr: 1, w: 0, h: 0, groundY: 0, playerX: 0 };
let timeSinceStart = 0;
let distanceTraveled = 0;
let baseSpeed = 260; 
let speed = baseSpeed;
let accel = 18; 
let gravity = 2200;
let player = null;
const obstacles = [];

let eggSpawnIn = 800; 
let birdSpawnIn = 1500; 

let dead = false;
let deathElapsed = 0;
let birdAnimT = 0;
let lastTs = 0;

const JUMP = { smallVel: 600, bigVel: 980, longPressMs: 180 };
const DEATH_DURATION = 0.55;
const CAT_RUN_FPS = 12;
const BIRD_FPS = 10;

function resize() {
  world.dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  world.w = window.innerWidth;
  world.h = window.innerHeight;
  world.groundY = world.h * 0.78;
  world.playerX = world.w * 0.24;
  canvas.width = Math.floor(world.w * world.dpr);
  canvas.height = Math.floor(world.h * world.dpr);
  canvas.style.width = `${world.w}px`;
  canvas.style.height = `${world.h}px`;
  ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener("resize", resize);
resize();

// ---------- 4. 绘图核心函数 ----------
function drawBackground() {
  const skyImg = getImg("skyTile");
  if (skyImg) {
    const pattern = ctx.createPattern(skyImg, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, world.w, world.h);
  } else {
    ctx.fillStyle = "#87CEEB"; 
    ctx.fillRect(0, 0, world.w, world.h);
  }

  const mountainImg = getImg("mountain");
  if (mountainImg) {
    const mDisplayHeight = world.h * 0.25; 
    const scale = mDisplayHeight / mountainImg.height;
    const mDisplayWidth = mountainImg.width * scale;
    const mOffset = -(distanceTraveled * 0.2) % mDisplayWidth; 
    for (let x = mOffset; x < world.w; x += mDisplayWidth) {
      ctx.drawImage(mountainImg, x, world.groundY - mDisplayHeight + 5, mDisplayWidth, mDisplayHeight);
    }
  }
  drawGround(distanceTraveled);
}

function drawGround(dist) {
  const y0 = world.groundY;
  const groundImg = getImg("groundTile");
  if (groundImg) {
    const tileW = groundImg.width || 64;
    const offset = (dist % tileW);
    for (let x = -tileW; x < world.w + tileW; x += tileW) {
      ctx.drawImage(groundImg, x - offset, y0, tileW, world.h - y0);
    }
  } else {
    ctx.fillStyle = "#2b8a3e";
    ctx.fillRect(0, y0, world.w, world.h - y0);
  }
}

function drawPlayer() {
  if (!player) return;
  const fallP = dead ? Math.max(0, Math.min(1, player.deadT / DEATH_DURATION)) : 0;
  ctx.save();
  ctx.translate(player.x + player.w/2, player.y + player.h/2);
  if (dead) { 
    ctx.rotate(fallP * 0.24); 
    ctx.scale(1.12 + fallP * 0.42, 0.55); 
  }
  ctx.translate(-player.w/2, -player.h/2);
  let imgKey = dead ? "catDead" : (!player.onGround ? "catJump" : `catRun${(Math.floor(timeSinceStart * CAT_RUN_FPS) % 3) + 1}`);
  const img = getImg(imgKey);
  if (img) ctx.drawImage(img, 0, 0, player.w, player.h);
  else { ctx.fillStyle = "#f4b968"; ctx.fillRect(0, 0, player.w, player.h); }
  ctx.restore();
}

function drawObstacle(o) {
  if (o.type === "egg") {
    const img = getImg("egg");
    if (img) ctx.drawImage(img, o.x, o.y, o.w, o.h);
    else { ctx.fillStyle = "#eee"; ctx.fillRect(o.x, o.y, o.w, o.h); }
  } else if (o.type === "bird") {
    const frame = Math.floor(birdAnimT * BIRD_FPS + (o.phase || 0)) % 3;
    const img = getImg(`seagull${frame + 1}`);
    ctx.save();
    ctx.translate(o.x + o.w/2, o.y + o.h/2);
    ctx.scale(-1, 1); 
    if (img) ctx.drawImage(img, -o.w/2, -o.h/2, o.w, o.h);
    else { ctx.fillStyle = "#fff"; ctx.fillRect(-o.w/2, -o.h/2, o.w, o.h); }
    ctx.restore();
  }
}

// ---------- 5. 游戏逻辑 ----------
function resetGame() {
  state = GameState.playing;
  ui.menu.classList.add("overlay-hidden");
  ui.gameOver.classList.add("overlay-hidden");
  ui.hudLeft.textContent = String(localStorage.getItem("hiScore") || 0);
  timeSinceStart = 0;
  distanceTraveled = 0;
  speed = baseSpeed;
  obstacles.length = 0;
  dead = false;
  deathElapsed = 0;
  
  eggSpawnIn = 800;
  birdSpawnIn = 1800;

  const pW = Math.max(42, world.h * 0.10);
  const pH = Math.max(58, world.h * 0.14);
  player = { w: pW, h: pH, x: world.playerX, y: world.groundY - pH, vy: 0, onGround: true, deadT: 0 };
  
  audio.startBackground();
  lastTs = performance.now();
  requestAnimationFrame(loop);
}

function loop(ts) {
  if (state !== GameState.playing && state !== GameState.dying) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000);
  lastTs = ts;

  if (state === GameState.playing) {
    timeSinceStart += dt;
    speed = baseSpeed + timeSinceStart * accel;
    distanceTraveled += speed * dt;
    ui.hudRight.textContent = String(Math.floor(distanceTraveled / 800) * 100);

    eggSpawnIn -= speed * dt;
    if (eggSpawnIn <= 0) {
      const eggSize = Math.max(22, world.h * 0.055);
      obstacles.push({ type: "egg", x: world.w + 60, y: world.groundY - eggSize * 1.6, w: eggSize, h: eggSize * 1.6 });
      eggSpawnIn = 700 + Math.random() * 600;
    }

    birdSpawnIn -= speed * dt;
    if (birdSpawnIn <= 0) {
      const bW = Math.max(50, world.h * 0.12);
      const bH = bW * 0.8;
      const randomY = world.h * (0.4 + Math.random() * 0.3); 
      obstacles.push({ 
        type: "bird", 
        x: world.w + 100, 
        y: randomY, 
        w: bW, 
        h: bH, 
        phase: Math.random() * 10,
        flySpeed: speed * 1.2 
      });
      birdSpawnIn = 1200 + Math.random() * 1000;
    }

    if (!player.onGround) {
      player.vy += gravity * dt;
      player.y += player.vy * dt;
      if (player.y >= world.groundY - player.h) { 
        player.y = world.groundY - player.h; 
        player.vy = 0; 
        player.onGround = true; 
      }
    }

    const pShrinkX = 0.5; 
    const pShrinkY = 0.6; 
    const px = player.x + player.w * (1 - pShrinkX) / 2;
    const py = player.y + player.h * (1 - pShrinkY) / 2;
    const pw = player.w * pShrinkX;
    const ph = player.h * pShrinkY;

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      const moveSpeed = o.type === "bird" ? (o.flySpeed || speed) : speed;
      o.x -= moveSpeed * dt;
      if (o.x < -200) { obstacles.splice(i, 1); continue; }
      const ox = o.x + o.w * 0.2;
      const oy = o.y + o.h * 0.2;
      const ow = o.w * 0.6;
      const oh = o.h * 0.6;
      if (px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy) {
        state = GameState.dying;
        audio.stopBackground();
        audio.hitSound();
        dead = true;
      }
    }
  } else if (state === GameState.dying) {
    deathElapsed += dt;
    player.deadT = deathElapsed;
    if (deathElapsed >= DEATH_DURATION) {
      state = GameState.gameover;
      ui.finalScore.textContent = ui.hudRight.textContent;
      const hi = Math.max(Number(localStorage.getItem("hiScore") || 0), Number(ui.finalScore.textContent));
      localStorage.setItem("hiScore", hi);
      ui.gameOver.classList.remove("overlay-hidden");
    }
  }

  ctx.clearRect(0, 0, world.w, world.h);
  drawBackground();
  birdAnimT += dt;
  for (const o of obstacles) drawObstacle(o);
  drawPlayer();
  requestAnimationFrame(loop);
}

// ---------- 6. 交互核心：一键即跳优化版 ----------
let jumpTimer = null;
let longJumpTriggered = false;

window.addEventListener("pointerdown", (e) => {
  // 如果点的是 UI 按钮，则不触发跳跃逻辑
  if (e.target.closest("button")) return;

  if (state === GameState.menu) {
    resetGame();
    return;
  }
  
  if (state === GameState.playing) {
    if (player.onGround) {
      longJumpTriggered = false;
      // 开启长按判定
      jumpTimer = setTimeout(() => {
        player.vy = -JUMP.bigVel;
        player.onGround = false;
        longJumpTriggered = true;
        audio.jumpSound("big");
      }, JUMP.longPressMs);
    }
  }
});

window.addEventListener("pointerup", (e) => {
  // 如果点的是按钮，跳过逻辑
  if (e.target.closest("button")) return;

  if (state === GameState.playing) {
    if (!longJumpTriggered && player.onGround) {
      // 快速松手，触发小跳
      clearTimeout(jumpTimer);
      player.vy = -JUMP.smallVel;
      player.onGround = false;
      audio.jumpSound("small");
    }
  }
  longJumpTriggered = false;
});

ui.btnStart.addEventListener("click", (e) => { e.stopPropagation(); resetGame(); });
ui.btnRestart.addEventListener("click", (e) => { e.stopPropagation(); resetGame(); });

loadAssets().then(() => {
  ui.hudLeft.textContent = String(localStorage.getItem("hiScore") || 0);
});
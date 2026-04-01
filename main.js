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

// ---------- Assets ----------
const ASSET_BASE = "./assets/";
const ASSET_FILES = {
  // 角色（你后续可以分别做成散图）
  // 行驶：3 帧连续动画
  catRun1: "cat-run-1.png",
  catRun2: "cat-run-2.png",
  catRun3: "cat-run-3.png",
  catJump: "cat-jump.png",
  catDead: "cat-dead.png",
  // 障碍物
  egg: "egg.png",
  // 海鸥：3 帧连续动画
  seagull1: "seagull-1.png",
  seagull2: "seagull-2.png",
  seagull3: "seagull-3.png",
  // 背景（可选）
  mountain: "mountain.png",
  groundTile: "ground-tile.png",
  skyTile: "sky-tile.png",

  // UI（可选：有图就显示，没图就回退为文字/按钮文本）
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
    img.onerror = () => resolve(null);
  });
}

async function loadAssets() {
  const entries = Object.entries(ASSET_FILES);
  await Promise.all(
    entries.map(async ([key, file]) => {
      const img = await loadImage(`${ASSET_BASE}${file}`);
      images.set(key, img);
    })
  );
}

function getImg(key) {
  return images.get(key) || null;
}

function drawSprite(img, x, y, w, h) {
  if (!img) return false;
  ctx.drawImage(img, x, y, w, h);
  return true;
}

// ---------- Audio (WebAudio 8-bit) ----------
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bgTimer = null;
    this.isBgOn = false;
    this.isInited = false;
    this.noteIdx = 0;
  }

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

  stopBackground() {
    this.isBgOn = false;
    if (this.bgTimer) clearInterval(this.bgTimer);
    this.bgTimer = null;
  }

  // 简单 scheduler：按节拍定时播放短音符
  scheduleLoop() {
    const bpm = 120;
    const stepMs = (60_000 / bpm) / 2; // 8分音符
    const scale = [0, 2, 4, 7, 9, 12]; // 大调简化
    const baseFreq = 261.63; // C4
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

      // 快速包络，8-bit 质感
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
    const freq = kind === "big" ? 440 : 330; // 大跳更高
    osc.frequency.setValueAtTime(freq, now);
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

// ---------- Game State ----------
const GameState = {
  menu: "menu",
  playing: "playing",
  dying: "dying",
  gameover: "gameover",
};

let state = GameState.menu;

const world = {
  dpr: 1,
  w: 0,
  h: 0,
  groundY: 0,
  playerX: 0,
};

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

window.addEventListener("resize", () => resize());
resize();

function readHiScore() {
  const raw = localStorage.getItem("hiScore");
  const v = raw ? Number(raw) : 0;
  return Number.isFinite(v) ? v : 0;
}

function writeHiScore(v) {
  localStorage.setItem("hiScore", String(v));
}

function setMenuVisible(visible) {
  ui.menu.classList.toggle("overlay-hidden", !visible);
}

function setGameOverVisible(visible) {
  ui.gameOver.classList.toggle("overlay-hidden", !visible);
}

function resetGame() {
  state = GameState.playing;
  setMenuVisible(false);
  setGameOverVisible(false);

  const hi = readHiScore();
  ui.hudLeft.textContent = String(hi);

  // 游戏动态参数
  timeSinceStart = 0;
  distanceTraveled = 0;
  speed = baseSpeed;

  obstacles.length = 0;
  eggSpawnIn = 600;
  birdSpawnIn = 900;

  dead = false;
  deathElapsed = 0;
  deathHit = null;
  birdAnimT = 0;

  player = {
    w: Math.max(42, world.h * 0.10),
    h: Math.max(58, world.h * 0.14),
    x: world.playerX,
    y: world.groundY - Math.max(58, world.h * 0.14),
    vy: 0,
    onGround: true,
    jumpKind: "none", // "small" | "big"
    animT: 0,
    deadT: 0,
  };

  // 控制状态
  pressTimer = null;
  longTriggered = false;

  audio.startBackground();
  lastTs = performance.now();
  requestAnimationFrame(loop);
}

function startDeath(hitObstacle) {
  if (dead || state === GameState.dying || state === GameState.gameover) return;
  dead = true;
  state = GameState.dying;

  deathElapsed = 0;
  deathHit = hitObstacle || null;
  if (deathHit) {
    deathHit.cracked = true;
    deathHit.crackedT = 0;
  }

  // 让猫咪从“冲刺状态”坠落到地面
  if (player) {
    player.onGround = false;
    player.jumpKind = "none";
    // 加大下落速度，让倒地更有“撞击感”
    player.vy = Math.max(player.vy, 260);
    player.deadT = 0;
  }

  audio.stopBackground();
  audio.hitSound();
}

function gameOver() {
  if (state === GameState.gameover) return;
  state = GameState.gameover;

  const score = calcScore();
  ui.finalScore.textContent = String(score);

  const hi = readHiScore();
  const newHi = Math.max(hi, score);
  if (newHi !== hi) writeHiScore(newHi);
  ui.hudLeft.textContent = String(newHi);

  setGameOverVisible(true);
}

// ---------- Physics & Spawning ----------
let timeSinceStart = 0;
let distanceTraveled = 0;

let baseSpeed = 280; // px/s
let speed = baseSpeed;
let accel = 26; // px/s^2
let gravity = 2200; // px/s^2

let player = null;

const obstacles = [];
let eggSpawnIn = 600;
let birdSpawnIn = 900;
let dead = false;
let deathElapsed = 0;
let deathHit = null;

let pressTimer = null;
let longTriggered = false;

let birdAnimT = 0;

const JUMP = {
  smallVel: 600, // px/s（短按小跳：用于躲地面蛋）
  bigVel: 980,
  longPressMs: 200,
};

const DEATH_DURATION = 0.55; // 撞击倒地动画时长（秒）

// 海鸥：需要一定时间后才出现（前期只刷蛋）
const BIRD_START_AFTER_SEC = 12;
// 海鸥相对地面“额外向左飞行”的速度（让它看起来不像蛋那样贴地）
const BIRD_EXTRA_VX = 220; // px/s

// 角色/障碍物帧动画参数（帧图像数量固定为 3）
const CAT_RUN_FPS = 12; // 行驶动画速度（帧/秒）
const BIRD_FPS = 10; // 海鸥扇翼动画速度（帧/秒）

function calcScore() {
  return Math.floor(distanceTraveled / 800) * 100;
}

function smallJump() {
  if (!player || !player.onGround || dead || state !== GameState.playing) return;
  player.vy = -JUMP.smallVel;
  player.onGround = false;
  player.jumpKind = "small";
  audio.jumpSound("small");
}

function bigJump() {
  if (!player || !player.onGround || dead || state !== GameState.playing) return;
  player.vy = -JUMP.bigVel;
  player.onGround = false;
  player.jumpKind = "big";
  audio.jumpSound("big");
}

function getPlayerHitbox() {
  const shrink = 0.64;
  const w = player.w * shrink;
  const h = player.h * shrink;
  const ox = (player.w - w) / 2;
  const oy = (player.h - h) / 2;
  return { x: player.x + ox, y: player.y + oy, w, h };
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function spawnEgg() {
  const eggSize = Math.max(22, world.h * 0.055);
  const eggH = eggSize * 1.6;
  const egg = {
    type: "egg",
    x: world.w + 60,
    // 让蛋“底部贴地”，避免碰撞/视觉高度不一致
    y: world.groundY - eggH,
    w: eggSize,
    h: eggH,
    rot: (Math.random() - 0.5) * 0.2,
  };
  obstacles.push(egg);
}

function spawnBird() {
  const birdW = Math.max(42, world.h * 0.08);
  const birdH = birdW * 0.55;
  const eggSize = Math.max(22, world.h * 0.055);
  // 海鸥高度略高于蛋（贴地但比蛋更“悬空”）
  const clear = eggSize * 1.55;
  const bird = {
    type: "bird",
    x: world.w + 80,
    y: world.groundY - birdH - clear,
    w: birdW,
    h: birdH,
    flip: Math.random() < 0.5 ? -1 : 1,
    // 每只海鸥的扇翼动画相位略不同
    phase: Math.random() * 2.5,
  };
  obstacles.push(bird);
}

function currentDifficultyFactor() {
  // 前 60 秒逐步提高，避免到后期离谱
  return Math.max(0, Math.min(1, timeSinceStart / 60));
}

function updateSpawns(dt) {
  const distStep = speed * dt;

  eggSpawnIn -= distStep;
  if (eggSpawnIn <= 0) {
    spawnEgg();
    const f = currentDifficultyFactor();
    const eggMin = 420 - f * 140;
    const eggMax = 740 - f * 240;
    eggSpawnIn = eggMin + Math.random() * (eggMax - eggMin);
  }

  // 海鸥：需要一定时间后才出现（前期只刷蛋）
  if (timeSinceStart >= BIRD_START_AFTER_SEC) {
    birdSpawnIn -= distStep;
    if (birdSpawnIn <= 0) {
      // 随机：后期海鸥更频繁
      if (Math.random() < 0.7 + currentDifficultyFactor() * 0.2) {
        spawnBird();
      }
      const f = currentDifficultyFactor();
      const birdMin = 650 - f * 220;
      const birdMax = 1050 - f * 380;
      birdSpawnIn = birdMin + Math.random() * (birdMax - birdMin);
    }
  }
}

// ---------- Drawing ----------
function drawBackground() {
  // 背景色
  ctx.fillStyle = "#97d9f3";
  ctx.fillRect(0, 0, world.w, world.h);

  // 远景雪山（简单三角视差）
  const par = 0.20;
  const mOffset = -(distanceTraveled * par) % (world.w + 240);
  drawMountains(mOffset);

  // 天空星点（很轻）
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  const seed = Math.floor(distanceTraveled / 250);
  for (let i = 0; i < 24; i++) {
    const x = (i * 73 + seed * 19) % world.w;
    const y = ((i * 47 + seed * 29) % (world.h * 0.45)) + 10;
    ctx.fillRect(x, y, 2, 2);
  }

  // 近景地面（草皮条纹）
  drawGround(distanceTraveled);
}

function drawMountains(offsetX) {
  const baseY = world.groundY - world.h * 0.28;
  const color1 = "#17304f";
  const color2 = "#132640";
  const w = world.w + 240;

  // 三角山组
  for (let i = -1; i < 4; i++) {
    const x0 = i * 200 + offsetX;
    const h = world.h * (0.18 + (i % 2) * 0.04);
    ctx.fillStyle = i % 2 === 0 ? color1 : color2;
    ctx.beginPath();
    ctx.moveTo(x0, baseY + 80);
    ctx.lineTo(x0 + 90, baseY - h);
    ctx.lineTo(x0 + 180, baseY + 80);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGround(dist) {
  const y0 = world.groundY;
  ctx.fillStyle = "#2b8a3e";
  ctx.fillRect(0, y0, world.w, world.h - y0);

  // 地面纹理只做“横向平滑滚动”，不做纵向取模（避免你看到的跳动感）
  const tileW = Math.max(10, Math.floor(world.w / 60));
  const bladeH = Math.max(14, Math.floor((world.h - y0) * 0.35));
  const offset = dist * 0.35;
  for (let x = -tileW * 2; x < world.w + tileW * 2; x += tileW) {
    const t = Math.floor((x + offset) / tileW);
    const light = (t & 1) === 0;
    ctx.fillStyle = light ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

    const w = tileW * (light ? 0.65 : 0.55);
    const sx = x + (tileW - w) / 2;
    ctx.fillRect(sx, y0, w, bladeH);
  }

  // 地面边缘发光（基座位置固定）
  ctx.fillStyle = "rgba(255,255,255,0.09)";
  ctx.fillRect(0, y0 - 2, world.w, 3);
}

function drawObstacle(o) {
  if (o.type === "egg") {
    const drawW = o.w;
    const drawH = o.h;
    const x = o.x;
    const y = o.y;

    const img = getImg("egg");
    if (!drawSprite(img, x, y, drawW, drawH)) {
      // 占位：白色鸵鸟蛋
      ctx.save();
      ctx.translate(x + drawW / 2, y + drawH / 2);
      ctx.rotate(o.rot);
      ctx.fillStyle = "#f8f8f8";
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      roundRect(ctx, -drawW / 2, -drawH / 2, drawW, drawH, drawW * 0.28);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 裂壳效果（撞击后短时动画）
    if (o.cracked) {
      const p = Math.max(0, Math.min(1, (o.crackedT || 0) / DEATH_DURATION));
      ctx.save();
      ctx.globalAlpha = 0.25 + p * 0.65;
      ctx.translate(x + drawW / 2, y + drawH / 2);
      ctx.rotate(o.rot);
      ctx.scale(1 + p * 0.08, 1 + p * 0.03);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;

      // 裂缝几条斜线（像素风）
      const a = -0.8 + p * 0.6;
      const b = 0.35 + p * 0.15;
      crackLine(ctx, 0, -drawH * 0.15, drawW * 0.22, -drawH * 0.05, a);
      crackLine(ctx, 0, 0, -drawW * 0.24, drawH * 0.12, b);
      crackLine(ctx, -drawW * 0.05, -drawH * 0.02, drawW * 0.12, drawH * 0.20, -0.15);
      ctx.restore();
    }
    return;
  }

  if (o.type === "bird") {
    // 海鸥：3 帧连续动画
    const birdFrame = Math.floor(birdAnimT * BIRD_FPS + (o.phase || 0)) % 3;
    const img =
      birdFrame === 0 ? getImg("seagull1") : birdFrame === 1 ? getImg("seagull2") : getImg("seagull3");
    const swing = Math.sin(birdAnimT * 9) * 0.18;
    const x = o.x;
    const y = o.y;
    const w = o.w;
    const h = o.h;
    ctx.save();
    if (!img) {
      // 占位：贴地海鸥（小飞行图标）
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(o.flip, 1);
      ctx.rotate(swing);
      ctx.fillStyle = "#f9f9f9";
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.lineWidth = 2;

      // 身体
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.02, w * 0.34, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 翅膀
      ctx.beginPath();
      ctx.ellipse(-w * 0.06, 0, w * 0.32, h * 0.16, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 嘴
      ctx.fillStyle = "#111";
      ctx.fillRect(w * 0.14, -h * 0.02, w * 0.08, h * 0.04);
    } else {
      // img：简单横向摆动（如果你做了帧动画，也可以后续替换成切帧）
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(swing);
      ctx.scale(o.flip, 1);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }
}

function drawPlayer() {
  if (!player) return;
  const x = player.x;
  const y = player.y;

  const fallP = dead ? Math.max(0, Math.min(1, (player.deadT || 0) / DEATH_DURATION)) : 0;
  let rotation = 0;
  let squashX = 1;
  let squashY = 1;
  if (dead) {
    // 大字型倒地占位：压扁 + 略旋转
    squashY = 0.55;
    squashX = 1.12 + fallP * 0.42;
    rotation = fallP * 0.24;
  } else if (!player.onGround) {
    // 轻微朝向：向上/向下时变形（占位用；真实素材你后续可改成切图）
    squashY = 1 - Math.min(0.18, Math.abs(player.vy) / 900) * 0.25;
    squashX = 1 + (1 - squashY) * 0.5;
  }

  ctx.save();
  ctx.translate(x + player.w / 2, y + player.h / 2);
  if (rotation) ctx.rotate(rotation);
  ctx.scale(squashX, squashY);
  ctx.translate(-player.w / 2, -player.h / 2);

  let imgKey;
  if (dead) {
    imgKey = "catDead";
  } else if (player.onGround) {
    // 行驶：3 帧连续动画
    const runFrame = Math.floor(timeSinceStart * CAT_RUN_FPS) % 3;
    imgKey = runFrame === 0 ? "catRun1" : runFrame === 1 ? "catRun2" : "catRun3";
  } else {
    // 跳跃：使用单张图（你后续也可以按需扩展成 3 帧）
    imgKey = "catJump";
  }

  const img = getImg(imgKey);
  if (!drawSprite(img, 0, 0, player.w, player.h)) {
    // 占位绘制：黄色胖橘猫（带红嘴）
    // 身体（梨形）
    ctx.fillStyle = "#f4b968";
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(player.w * 0.5, player.h * 0.56, player.w * 0.40, player.h * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 脸部略圆
    ctx.beginPath();
    ctx.ellipse(player.w * 0.5, player.h * 0.48, player.w * 0.28, player.h * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();

    // 大红嘴唇
    ctx.fillStyle = "#ee7b80";
    ctx.beginPath();
    ctx.ellipse(player.w * 0.52, player.h * 0.62, player.w * 0.18, player.h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛/表情
    const eyesUp = !player.onGround && player.vy < 0;
    const eyeY = eyesUp ? player.h * 0.44 : player.h * 0.47;
    const blink = eyesUp ? 0.6 : 1;
    ctx.fillStyle = "rgba(0,0,0,0.65)";

    if (dead) {
      // X 眼
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 4;
      line(ctx, player.w * 0.42, player.h * 0.45, player.w * 0.58, player.h * 0.60);
      line(ctx, player.w * 0.58, player.h * 0.45, player.w * 0.42, player.h * 0.60);
    } else if (eyesUp) {
      // 眯眼（跳跃努力）
      ctx.fillRect(player.w * 0.38, eyeY, player.w * 0.10, player.h * 0.015 * blink);
      ctx.fillRect(player.w * 0.52, eyeY, player.w * 0.10, player.h * 0.015 * blink);
    } else {
      // 呆滞圆眼
      ctx.beginPath();
      ctx.ellipse(player.w * 0.42, eyeY, player.w * 0.06, player.h * 0.05, 0, 0, Math.PI * 2);
      ctx.ellipse(player.w * 0.58, eyeY, player.w * 0.06, player.h * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!dead) {
      // 电动车简化轮子（死亡时跳过，强调“从车上跌落倒地”）
      const t = timeSinceStart;
      const wheelR = player.h * 0.10;
      const wheelY = player.h * 0.72;

      // 轮子震动摆动
      const wv = !player.onGround ? 0.08 : Math.sin(t * 16) * 0.10;
      ctx.save();
      ctx.translate(player.w * 0.36, wheelY);
      ctx.rotate(wv);
      ctx.beginPath();
      ctx.arc(0, 0, wheelR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, wheelR * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(player.w * 0.70, wheelY);
      ctx.rotate(-wv);
      ctx.beginPath();
      ctx.arc(0, 0, wheelR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, wheelR * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fill();
      ctx.restore();

      // 车架
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(player.w * 0.40, player.h * 0.70);
      ctx.lineTo(player.w * 0.63, player.h * 0.70);
      ctx.stroke();
    }

    // 耳朵摆动（跑动时）
    if (!dead && player.onGround) {
      const earWiggle = Math.sin(timeSinceStart * 18) * 0.22;
      ctx.save();
      ctx.translate(player.w * 0.50, player.h * 0.24);
      ctx.rotate(earWiggle);
      ctx.fillStyle = "#f4b968";
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-player.w * 0.10, 0);
      ctx.lineTo(-player.w * 0.04, -player.h * 0.18);
      ctx.lineTo(player.w * 0.03, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

  }

  ctx.restore();
}

function drawGameOverTint() {
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fillRect(0, 0, world.w, world.h);
}

function roundRect(ctx2, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx2.beginPath();
  ctx2.moveTo(x + rr, y);
  ctx2.arcTo(x + w, y, x + w, y + h, rr);
  ctx2.arcTo(x + w, y + h, x, y + h, rr);
  ctx2.arcTo(x, y + h, x, y, rr);
  ctx2.arcTo(x, y, x + w, y, rr);
  ctx2.closePath();
}

function line(ctx2, x1, y1, x2, y2) {
  ctx2.beginPath();
  ctx2.moveTo(x1, y1);
  ctx2.lineTo(x2, y2);
  ctx2.stroke();
}

// ---------- Main Loop ----------
let lastTs = 0;

function loop(ts) {
  if (state !== GameState.playing && state !== GameState.dying) return;
  const now = ts;
  const dt = Math.min(0.033, (now - lastTs) / 1000 || 0);
  lastTs = now;

  // dt=0 时跳过，避免首次闪烁
  if (dt <= 0) {
    requestAnimationFrame(loop);
    return;
  }

  if (state === GameState.playing) {
    timeSinceStart += dt;

    // 动态加速
    speed = baseSpeed + timeSinceStart * accel;
    const distStep = speed * dt;
    distanceTraveled += distStep;

    // 更新 HUD
    const score = calcScore();
    ui.hudRight.textContent = String(score);

    updateSpawns(dt);

    // 更新障碍物
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= distStep;
      // 海鸥：额外向左“飞行”，与地面上的蛋形成运动差异
      if (o.type === "bird") {
        const f = currentDifficultyFactor();
        o.x -= (BIRD_EXTRA_VX * (0.85 + f * 0.35)) * dt;
      }
      if (o.x + o.w < -80) obstacles.splice(i, 1);
    }

    // 玩家物理
    if (!player.onGround) {
      player.vy += gravity * dt;
      player.y += player.vy * dt;
      if (player.y >= world.groundY - player.h) {
        player.y = world.groundY - player.h;
        player.vy = 0;
        player.onGround = true;
        player.jumpKind = "none";
      }
    }

    // 碰撞
    const pHit = getPlayerHitbox();
    for (const o of obstacles) {
      if (o.type === "egg") {
        const shrink = 0.72;
        const w = o.w * shrink;
        const h = o.h * shrink;
        const ox = (o.w - w) / 2;
        const oy = (o.h - h) / 2;
        const eHit = { x: o.x + ox, y: o.y + oy, w, h };
        if (rectsIntersect(pHit, eHit)) {
          startDeath(o);
          break;
        }
      }
      if (o.type === "bird") {
        const shrink = 0.62;
        const w = o.w * shrink;
        const h = o.h * shrink;
        const ox = (o.w - w) / 2;
        const oy = (o.h - h) / 2;
        const bHit = { x: o.x + ox, y: o.y + oy, w, h };
        if (rectsIntersect(pHit, bHit)) {
          startDeath(o);
          break;
        }
      }
    }
  } else if (state === GameState.dying) {
    deathElapsed += dt;
    if (player) player.deadT = deathElapsed;
    if (deathHit && deathHit.cracked) {
      deathHit.crackedT = (deathHit.crackedT || 0) + dt;
    }

    // 只有倒地动画时，让猫继续坠落到地面
    if (player && !player.onGround) {
      player.vy += gravity * dt;
      player.y += player.vy * dt;
      if (player.y >= world.groundY - player.h) {
        player.y = world.groundY - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }

    if (deathElapsed >= DEATH_DURATION) {
      gameOver();
    }
  }

  // 绘制
  drawBackground();
  drawGroundExtras();
  birdAnimT += dt;
  for (const o of obstacles) drawObstacle(o);
  drawPlayer();

  if (state === GameState.dying) drawGameOverTint();
  requestAnimationFrame(loop);
}

function crackLine(ctx2, x1, y1, x2, y2, angleOffset) {
  ctx2.save();
  ctx2.rotate(angleOffset);
  ctx2.beginPath();
  ctx2.moveTo(x1, y1);
  ctx2.lineTo(x2, y2);
  ctx2.stroke();
  ctx2.restore();
}

function drawGroundExtras() {
  // 简化的“飞行道具粒子/地面速度线”（提升动感）
  ctx.save();
  ctx.globalAlpha = 0.35;
  const lines = 14;
  for (let i = 0; i < lines; i++) {
    const x = ((distanceTraveled * (0.18 + i * 0.01)) % (world.w + 40)) - 20;
    const y = world.groundY + 8 + (i % 4) * 14;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 12, y);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- Input ----------
function startFromUserGesture() {
  // 音频需要用户手势才能开始
  if (state === GameState.menu) {
    resetGame();
  }
}

function clearPressTimer() {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

canvas.addEventListener("pointerdown", async (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  if (state === GameState.menu) {
    // 允许直接从画布开始
    startFromUserGesture();
    return;
  }
  if (state !== GameState.playing) return;

  longTriggered = false;
  clearPressTimer();

  // 200ms 到了立刻触发大跳，更接近“长按大跳”的手感
  pressTimer = setTimeout(() => {
    longTriggered = true;
    bigJump();
  }, JUMP.longPressMs);
});

canvas.addEventListener("pointerup", (e) => {
  e.preventDefault();
  if (state !== GameState.playing) return;
  if (longTriggered) {
    clearPressTimer();
    return;
  }
  clearPressTimer();
  smallJump();
});

canvas.addEventListener("pointercancel", (e) => {
  e.preventDefault();
  if (state !== GameState.playing) return;
  clearPressTimer();
  longTriggered = false;
});

ui.btnStart.addEventListener("click", () => {
  // 点击按钮也算手势
  resetGame();
});
ui.btnRestart.addEventListener("click", () => {
  resetGame();
});

// ---------- Init ----------
function boot() {
  ui.hudRight.textContent = "0";
  ui.hudLeft.textContent = String(readHiScore());
  setMenuVisible(true);
  setGameOverVisible(false);
  ui.finalScore.textContent = "0";
}

boot();

function applyUiAssets() {
  const titleImg = getImg("uiTitle");
  if (titleImg) {
    ui.imgTitle.src = titleImg.src;
    ui.imgTitle.style.display = "block";
    if (ui.titleText) ui.titleText.style.visibility = "hidden";
  }

  const hintImg = getImg("uiHint");
  if (hintImg) {
    ui.imgHint.src = hintImg.src;
    ui.imgHint.style.display = "block";
    if (ui.hintText) ui.hintText.style.visibility = "hidden";
  }

  const startImg = getImg("uiStartBtn");
  if (startImg) {
    ui.imgStartBtn.src = startImg.src;
    ui.imgStartBtn.style.display = "block";
    if (ui.startText) ui.startText.style.visibility = "hidden";
  }

  const gameOverImg = getImg("uiGameOver");
  if (gameOverImg) {
    ui.imgGameOver.src = gameOverImg.src;
    ui.imgGameOver.style.display = "block";
    if (ui.gameOverText) ui.gameOverText.style.visibility = "hidden";
  }

  const retryImg = getImg("uiRetryBtn");
  if (retryImg) {
    ui.imgRetryBtn.src = retryImg.src;
    ui.imgRetryBtn.style.display = "block";
    if (ui.retryText) ui.retryText.style.visibility = "hidden";
  }
}

// 资源加载不阻塞首帧：失败会回退到占位绘制
loadAssets()
  .then(() => applyUiAssets())
  .catch(() => {});

// 菜单动画（轻微）可选：此处不复杂处理
lastTs = performance.now();
requestAnimationFrame((ts) => {
  lastTs = ts;
});


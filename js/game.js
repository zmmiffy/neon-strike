/**
 * NEON STRIKE — 外壳层：输入、固定步长循环、HUD 与界面状态机
 */

import {
  createGame,
  startGame,
  togglePause,
  stepGame,
  useBomb,
  drainEvents,
  FIXED_DT,
  LOGICAL_WIDTH,
  MAX_WEAPON,
} from "./core.js";
import { createRenderer } from "./render.js";
import { createAudio } from "./audio.js";

const BEST_KEY = "neon-strike:best:v1";
const MUTE_KEY = "neon-strike:muted:v1";

const $ = (id) => document.getElementById(id);
const el = {
  stage: $("stage"),
  canvas: $("game"),
  overlay: $("overlay"),
  score: $("score"),
  best: $("best"),
  wave: $("wave"),
  lives: $("lives"),
  bombs: $("bombs"),
  weaponPips: $("weaponPips"),
  weaponLabel: $("weaponLabel"),
  combo: $("combo"),
  comboBar: $("comboBar"),
  banner: $("banner"),
  bannerText: $("bannerText"),
  bannerSub: $("bannerSub"),
  startBtn: $("startBtn"),
  resumeBtn: $("resumeBtn"),
  pauseMenuBtn: $("pauseMenuBtn"),
  restartBtn: $("restartBtn"),
  menuBtn: $("menuBtn"),
  pauseBtn: $("pauseBtn"),
  bombBtn: $("bombBtn"),
  soundBtn: $("soundBtn"),
  finalScore: $("finalScore"),
  finalWave: $("finalWave"),
  finalKills: $("finalKills"),
  finalBest: $("finalBest"),
  recordBadge: $("recordBadge"),
  statusText: $("statusText"),
  live: $("liveRegion"),
  hint: $("touchHint"),
};

const state = createGame();
const renderer = createRenderer(el.canvas);
const audio = createAudio();

let best = readBest();
let muted = localStorage.getItem(MUTE_KEY) === "1";
audio.setMuted(muted);
el.best.textContent = best.toLocaleString("en-US");

const input = {
  keys: new Set(),
  moveX: 0,
  moveY: 0,
  focus: false,
  bomb: false,
  pointer: { active: false, x: 0, y: 0 },
};

let accumulator = 0;
let lastTime = 0;
let pausedFromBlur = false;
let bannerKey = "";

/* ------------------------------------------------------------------ *
 * 尺寸
 * ------------------------------------------------------------------ */

function fitCanvas() {
  const rect = el.stage.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return;
  // .stage 已由 CSS 保证 2:3 比例，这里按实际尺寸建位图；
  // 只有比例偏差超过 2% 时才做一次修正，避免画面被拉伸。
  let w = rect.width;
  let h = rect.height;
  const aspect = LOGICAL_WIDTH / 720;
  if (Math.abs(h / w - 1 / aspect) > (1 / aspect) * 0.02) {
    if (h / w > 1 / aspect) h = w / aspect;
    else w = h * aspect;
  }
  renderer.resize(w, h);
}

const resizeObserver = new ResizeObserver(() => fitCanvas());

/* ------------------------------------------------------------------ *
 * 输入
 * ------------------------------------------------------------------ */

const KEY_MAP = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  KeyA: "left",
  KeyD: "right",
  KeyW: "up",
  KeyS: "down",
};

function recomputeMove() {
  const k = input.keys;
  const left = k.has("left");
  const right = k.has("right");
  const up = k.has("up");
  const down = k.has("down");
  input.moveX = (right ? 1 : 0) - (left ? 1 : 0);
  input.moveY = (down ? 1 : 0) - (up ? 1 : 0);
}

function onKeyDown(event) {
  if (event.repeat && !KEY_MAP[event.code]) return;
  const code = event.code;

  if (KEY_MAP[code]) {
    event.preventDefault();
    input.keys.add(KEY_MAP[code]);
    recomputeMove();
    if (state.status === "ready") begin();
    return;
  }

  switch (code) {
    case "Space":
      event.preventDefault();
      pauseToggle();
      break;
    case "ShiftLeft":
    case "ShiftRight":
      input.focus = true;
      break;
    case "KeyB":
      event.preventDefault();
      if (state.status === "playing") {
        if (useBomb(state)) audio.bomb();
      }
      break;
    case "KeyM":
      toggleMute();
      break;
    case "Enter":
      event.preventDefault();
      if (state.status === "ready") begin();
      else if (state.status === "over") begin();
      else if (state.status === "paused") pauseToggle();
      break;
    case "Escape":
      pauseToggle();
      break;
    default:
      break;
  }
}

function onKeyUp(event) {
  const dir = KEY_MAP[event.code];
  if (dir) {
    input.keys.delete(dir);
    recomputeMove();
    return;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") input.focus = false;
}

function toLogical(clientX, clientY) {
  const rect = el.canvas.getBoundingClientRect();
  const scale = LOGICAL_WIDTH / rect.width;
  return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
}

function onPointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest("#overlay")) return;
  if (state.status === "ready") {
    begin();
    return;
  }
  if (state.status !== "playing") return;
  el.canvas.setPointerCapture?.(event.pointerId);
  const pos = toLogical(event.clientX, event.clientY);
  input.pointer = { active: true, x: pos.x, y: pos.y };
  el.stage.classList.add("is-dragging");
}

function onPointerMove(event) {
  if (!input.pointer.active) return;
  const pos = toLogical(event.clientX, event.clientY);
  input.pointer.x = pos.x;
  input.pointer.y = pos.y;
}

function onPointerUp() {
  input.pointer.active = false;
  el.stage.classList.remove("is-dragging");
}

/* ------------------------------------------------------------------ *
 * 游戏流程
 * ------------------------------------------------------------------ */

function begin() {
  audio.resume();
  startGame(state);
  input.pointer.active = false;
  accumulator = 0;
  bannerKey = "";
  syncScreens();
  announce("出击！第一波敌人正在接近。");
}

function pauseToggle() {
  if (state.status !== "playing" && state.status !== "paused") return;
  togglePause(state);
  syncScreens();
}

function toggleMute() {
  muted = audio.toggleMute();
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  el.soundBtn.setAttribute("aria-pressed", String(muted));
  el.soundBtn.classList.toggle("is-muted", muted);
  el.soundBtn.setAttribute("aria-label", muted ? "开启音效" : "关闭音效");
}

function readBest() {
  const raw = Number(localStorage.getItem(BEST_KEY) || 0);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

function saveBest(score) {
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    return true;
  }
  return false;
}

function announce(text) {
  if (el.live) el.live.textContent = text;
}

/* ------------------------------------------------------------------ *
 * 每帧
 * ------------------------------------------------------------------ */

function frame(now) {
  if (!lastTime) lastTime = now;
  const delta = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (state.status === "playing") {
    accumulator += delta;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 5) {
      stepGame(state, FIXED_DT, input);
      input.bomb = false;
      accumulator -= FIXED_DT;
      steps += 1;
    }
  } else {
    accumulator = 0;
    stepGame(state, delta, input);
  }

  handleEvents();
  renderer.draw(state);
  syncHud();
  requestAnimationFrame(frame);
}

function handleEvents() {
  for (const event of drainEvents(state)) {
    switch (event.type) {
      case "shoot":
        audio.shoot();
        break;
      case "hit":
        audio.hit();
        break;
      case "explode":
        audio.explode(event.size);
        break;
      case "enemyShoot":
        audio.enemyShoot();
        break;
      case "tankShoot":
        audio.tankShoot();
        break;
      case "bossShoot":
        audio.bossShoot();
        break;
      case "powerup":
        audio.powerup();
        break;
      case "levelup":
        audio.levelup();
        break;
      case "wave":
        audio.wave();
        announce(`第 ${event.wave} 波敌人来袭。`);
        break;
      case "waveClear":
        audio.waveClear();
        announce(`第 ${event.wave} 波已清空。`);
        break;
      case "bossWarning":
        audio.bossWarning();
        announce("警告：BOSS 接近。");
        break;
      case "bossPhase":
        audio.bossShoot();
        break;
      case "bossDown":
        audio.explode("boss");
        announce("BOSS 已击破。");
        break;
      case "playerHit":
        audio.playerHit();
        announce(`被击中！剩余护盾 ${state.lives}。`);
        break;
      case "bomb":
        audio.bomb();
        break;
      case "gameover":
        onGameOver();
        break;
      case "start":
        audio.start();
        break;
      default:
        break;
    }
  }
}

function onGameOver() {
  audio.gameOver();
  const isRecord = saveBest(state.score);
  el.finalScore.textContent = state.score.toLocaleString("en-US");
  el.finalWave.textContent = String(state.wave);
  el.finalKills.textContent = String(state.kills);
  el.finalBest.textContent = best.toLocaleString("en-US");
  el.recordBadge.hidden = !isRecord;
  syncScreens();
  announce(`游戏结束，得分 ${state.score}，抵达第 ${state.wave} 波。`);
}

/* ------------------------------------------------------------------ *
 * HUD
 * ------------------------------------------------------------------ */

let hudCache = {};

function syncHud() {
  const score = state.score.toLocaleString("en-US");
  if (hudCache.score !== score) {
    el.score.textContent = score;
    hudCache.score = score;
  }
  const bestText = Math.max(best, state.score).toLocaleString("en-US");
  if (hudCache.best !== bestText) {
    el.best.textContent = bestText;
    hudCache.best = bestText;
  }
  const waveText = `WAVE ${String(state.wave).padStart(2, "0")}`;
  if (hudCache.wave !== waveText) {
    el.wave.textContent = waveText;
    hudCache.wave = waveText;
  }

  const lives = Math.max(0, state.lives);
  if (hudCache.lives !== lives) {
    el.lives.innerHTML = Array.from({ length: 5 }, (_, i) =>
      `<i class="pip${i < lives ? " is-on" : ""}"></i>`,
    ).join("");
    hudCache.lives = lives;
  }

  if (hudCache.bombs !== state.bombs) {
    el.bombs.textContent = `×${state.bombs}`;
    hudCache.bombs = state.bombs;
    el.bombBtn.disabled = state.bombs <= 0 || state.status !== "playing";
  }

  const weapon = Math.min(state.weapon, MAX_WEAPON);
  if (hudCache.weapon !== weapon) {
    el.weaponPips.innerHTML = Array.from({ length: MAX_WEAPON }, (_, i) =>
      `<i class="pip${i < weapon ? " is-on" : ""}"></i>`,
    ).join("");
    el.weaponLabel.textContent = `LV.${weapon}`;
    hudCache.weapon = weapon;
  }

  const combo = state.combo;
  if (hudCache.combo !== combo) {
    el.combo.textContent = combo > 1 ? `×${combo}` : "";
    el.combo.classList.toggle("is-hot", combo >= 10);
    hudCache.combo = combo;
  }
  const pct = Math.max(0, Math.min(1, state.comboTimer / 2.6));
  el.comboBar.style.transform = `scaleX(${pct.toFixed(3)})`;

  const paused = state.status === "paused";
  el.pauseBtn.disabled = state.status !== "playing" && state.status !== "paused";
  el.pauseBtn.classList.toggle("is-paused", paused);
  el.pauseBtn.setAttribute("aria-label", paused ? "继续游戏" : "暂停游戏");

  const statusText =
    state.status === "playing" ? "作战中" : state.status === "paused" ? "已暂停" : state.status === "over" ? "任务失败" : "待机";
  if (hudCache.status !== statusText) {
    el.statusText.textContent = statusText;
    hudCache.status = statusText;
    document.body.dataset.status = state.status;
  }

  if (state.banner) {
    const key = `${state.banner.text}|${state.banner.sub}`;
    if (bannerKey !== key) {
      bannerKey = key;
      el.bannerText.textContent = state.banner.text;
      el.bannerSub.textContent = state.banner.sub;
      el.banner.dataset.tone = state.banner.tone;
      el.banner.hidden = false;
      el.banner.classList.remove("is-show");
      void el.banner.offsetWidth;
      el.banner.classList.add("is-show");
    }
  } else if (!el.banner.hidden) {
    el.banner.hidden = true;
    bannerKey = "";
  }

  el.hint.classList.toggle("is-hidden", state.status !== "playing");
}

function syncScreens() {
  const screen =
    state.status === "ready" ? "start" : state.status === "paused" ? "pause" : state.status === "over" ? "over" : "none";
  el.overlay.dataset.screen = screen;
  el.overlay.hidden = screen === "none";
  hudCache = {};
  if (screen === "start") el.startBtn.focus({ preventScroll: true });
  else if (screen === "pause") el.resumeBtn.focus({ preventScroll: true });
  else if (screen === "over") el.restartBtn.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ *
 * 绑定
 * ------------------------------------------------------------------ */

el.startBtn.addEventListener("click", begin);
el.restartBtn.addEventListener("click", begin);
el.resumeBtn.addEventListener("click", pauseToggle);
el.pauseMenuBtn.addEventListener("click", () => {
  state.status = "ready";
  syncScreens();
});
el.menuBtn.addEventListener("click", () => {
  state.status = "ready";
  syncScreens();
});
el.pauseBtn.addEventListener("click", pauseToggle);
el.bombBtn.addEventListener("click", () => {
  if (state.status === "playing" && useBomb(state)) audio.bomb();
});
el.soundBtn.addEventListener("click", () => {
  audio.resume();
  toggleMute();
});

el.stage.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove, { passive: true });
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

window.addEventListener("blur", () => {
  if (state.status === "playing") {
    pausedFromBlur = true;
    pauseToggle();
  }
});
window.addEventListener("focus", () => {
  if (pausedFromBlur) {
    pausedFromBlur = false;
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.status === "playing") {
    pauseToggle();
  }
});

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

el.soundBtn.setAttribute("aria-pressed", String(muted));
el.soundBtn.classList.toggle("is-muted", muted);
resizeObserver.observe(el.stage);
fitCanvas();
syncScreens();
syncHud();
requestAnimationFrame(frame);

// 供调试/自动化测试使用
window.__NEON_STRIKE__ = { state, begin, renderer };

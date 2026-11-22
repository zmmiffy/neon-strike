/**
 * NEON STRIKE — 确定性游戏核心
 * 纯逻辑：不触碰 DOM、不使用 Math.random、不依赖计时器。
 * 渲染层读取 state，外壳层用固定步长驱动 stepGame()。
 */

export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 720;
export const FIXED_DT = 1 / 60;
export const MAX_WEAPON = 5;
export const MAX_LIVES = 5;

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** 可复现的伪随机数（mulberry32） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = (state, lo, hi) => lo + state.rng() * (hi - lo);

const ENEMY_TYPES = {
  drone: { r: 13, hp: 3, score: 100, color: "#5ef2ff" },
  weaver: { r: 15, hp: 4, score: 150, color: "#b18cff" },
  sniper: { r: 16, hp: 5, score: 200, color: "#ff7ad9" },
  tank: { r: 23, hp: 18, score: 400, color: "#ffb454" },
  boss: { r: 46, hp: 150, score: 5000, color: "#ff4d6d" },
};

/** 武器等级 -> 弹道（ax 为横向偏移，off 为弧度偏移） */
const WEAPON_PATTERNS = [
  [{ ax: 0, off: 0 }],
  [{ ax: -6, off: 0 }, { ax: 6, off: 0 }],
  [{ ax: 0, off: 0 }, { ax: -11, off: -0.09 }, { ax: 11, off: 0.09 }],
  [{ ax: -6, off: 0 }, { ax: 6, off: 0 }, { ax: -15, off: -0.17 }, { ax: 15, off: 0.17 }],
  [{ ax: 0, off: 0 }, { ax: -9, off: -0.07 }, { ax: 9, off: 0.07 }, { ax: -18, off: -0.21 }, { ax: 18, off: 0.21 }],
];

export function createGame(seed = 20260101) {
  const state = {
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    status: "ready", // ready | playing | paused | over
    seed,
    rng: mulberry32(seed >>> 0),
    time: 0,
    score: 0,
    wave: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    lives: 3,
    bombs: 2,
    weapon: 1,
    player: null,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    powerups: [],
    particles: [],
    floaters: [],
    rings: [],
    stars: [],
    waveState: null,
    waveClearTimer: 0,
    banner: null,
    shake: 0,
    flash: 0,
    events: [],
    nextId: 1,
  };
  resetRun(state);
  return state;
}

function resetRun(state) {
  state.score = 0;
  state.wave = 0;
  state.kills = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.lives = 3;
  state.bombs = 2;
  state.weapon = 1;
  state.bullets = [];
  state.enemyBullets = [];
  state.enemies = [];
  state.powerups = [];
  state.particles = [];
  state.floaters = [];
  state.rings = [];
  state.waveState = null;
  state.waveClearTimer = 0;
  state.banner = null;
  state.shake = 0;
  state.flash = 0;
  state.events = [];
  state.time = 0;
  state.player = {
    x: state.width / 2,
    y: state.height - 96,
    vx: 0,
    vy: 0,
    r: 11,
    speed: 305,
    invuln: 2.4,
    fireCd: 0,
    focus: false,
    tilt: 0,
    trailTimer: 0,
  };
  initStars(state);
}

function initStars(state) {
  state.stars = [];
  for (let i = 0; i < 120; i++) {
    const layer = i < 60 ? 0 : i < 96 ? 1 : 2;
    state.stars.push({
      x: state.rng() * state.width,
      y: state.rng() * state.height,
      speed: 26 + layer * 46 + state.rng() * 22,
      size: 0.7 + layer * 0.6 + state.rng() * 0.8,
      alpha: 0.25 + layer * 0.28,
      hue: state.rng() < 0.2 ? "magenta" : "cyan",
    });
  }
}

export function startGame(state) {
  resetRun(state);
  state.status = "playing";
  beginWave(state, 1);
  emit(state, "start");
  return state;
}

export function togglePause(state) {
  if (state.status === "playing") {
    state.status = "paused";
    emit(state, "pause");
  } else if (state.status === "paused") {
    state.status = "playing";
    emit(state, "resume");
  }
  return state.status;
}

export function drainEvents(state) {
  const events = state.events;
  state.events = [];
  return events;
}

function emit(state, type, data) {
  if (state.events.length < 64) state.events.push({ type, ...(data || {}) });
}

/* ------------------------------------------------------------------ *
 * 主循环
 * ------------------------------------------------------------------ */

export function stepGame(state, dt, input = {}) {
  if (state.status === "paused") return state;

  if (state.status === "playing") {
    state.time += dt;
    updateStars(state, dt);
    updatePlayer(state, dt, input);
    if (input.bomb) useBomb(state);
    updateBullets(state, dt);
    updateEnemies(state, dt);
    updateEnemyBullets(state, dt);
    resolveCollisions(state);
    updatePowerups(state, dt);
    updateDirector(state, dt);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
  } else {
    state.time += dt;
    updateStars(state, dt);
  }

  updateEffects(state, dt);
  state.shake = Math.max(0, state.shake - dt * 34);
  state.flash = Math.max(0, state.flash - dt * 2.6);
  if (state.banner) {
    state.banner.life -= dt;
    if (state.banner.life <= 0) state.banner = null;
  }
  return state;
}

function updateStars(state, dt) {
  for (const s of state.stars) {
    s.y += s.speed * dt;
    if (s.y > state.height + 4) {
      s.y = -4;
      s.x = state.rng() * state.width;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 玩家
 * ------------------------------------------------------------------ */

function updatePlayer(state, dt, input) {
  const p = state.player;
  p.focus = Boolean(input.focus);
  const speed = p.speed * (p.focus ? 0.46 : 1);

  const pointer = input.pointer;
  if (pointer && pointer.active) {
    const tx = clamp(pointer.x, 16, state.width - 16);
    const ty = clamp(pointer.y, 24, state.height - 22);
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.6) {
      const step = Math.min(dist, speed * 2.1 * dt);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      p.vx = (dx / dist) * speed;
      p.vy = (dy / dist) * speed;
    } else {
      p.vx = 0;
      p.vy = 0;
    }
  } else {
    let mx = clamp(input.moveX || 0, -1, 1);
    let my = clamp(input.moveY || 0, -1, 1);
    if (mx !== 0 && my !== 0) {
      const inv = Math.SQRT1_2;
      mx *= inv;
      my *= inv;
    }
    p.vx = mx * speed;
    p.vy = my * speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  p.x = clamp(p.x, 16, state.width - 16);
  p.y = clamp(p.y, 26, state.height - 22);
  p.tilt += ((p.vx / p.speed) * 0.42 - p.tilt) * Math.min(1, dt * 9);
  p.invuln = Math.max(0, p.invuln - dt);
  p.fireCd -= dt;

  if (p.fireCd <= 0) {
    playerFire(state);
    p.fireCd = p.focus ? 0.088 : 0.105;
  }

  p.trailTimer -= dt;
  if (p.trailTimer <= 0) {
    p.trailTimer = 0.028;
    const jitter = rand(state, -2.4, 2.4);
    addParticle(state, {
      x: p.x + jitter,
      y: p.y + 16,
      vx: rand(state, -14, 14),
      vy: rand(state, 120, 220),
      life: rand(state, 0.18, 0.34),
      maxLife: 0.34,
      size: rand(state, 1.6, 3.2),
      color: state.rng() < 0.5 ? "#7df9ff" : "#3a7bff",
      kind: "spark",
      drag: 1.2,
    });
  }
}

function playerFire(state) {
  const p = state.player;
  const pattern = WEAPON_PATTERNS[Math.min(state.weapon, MAX_WEAPON) - 1];
  const spreadScale = p.focus ? 0.34 : 1;
  const speed = p.focus ? 780 : 690;
  for (const shot of pattern) {
    const angle = -Math.PI / 2 + shot.off * spreadScale;
    state.bullets.push({
      x: p.x + shot.ax * (p.focus ? 0.7 : 1),
      y: p.y - 16,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 4,
      damage: 1.15,
      t: 0,
      dead: false,
    });
  }
  emit(state, "shoot", { level: state.weapon });
}

export function useBomb(state) {
  if (state.status !== "playing" || state.bombs <= 0) return false;
  state.bombs -= 1;
  state.flash = 0.9;
  state.shake = 20;
  for (const b of state.enemyBullets) {
    addParticle(state, {
      x: b.x,
      y: b.y,
      vx: rand(state, -60, 60),
      vy: rand(state, -60, 60),
      life: 0.35,
      maxLife: 0.35,
      size: 3,
      color: "#9bffef",
      kind: "spark",
      drag: 2,
    });
  }
  state.enemyBullets = [];
  for (const e of state.enemies) damageEnemy(state, e, 34, e.x, e.y);
  addRing(state, state.player.x, state.player.y, 620, 0.7, "#9bffef");
  addRing(state, state.player.x, state.player.y, 380, 0.5, "#ff8bd8");
  addExplosion(state, state.player.x, state.player.y, "#9bffef", 56, 520);
  emit(state, "bomb");
  return true;
}

function hitPlayer(state) {
  const p = state.player;
  if (p.invuln > 0 || state.status !== "playing") return;
  state.lives -= 1;
  state.weapon = Math.max(1, state.weapon - 1);
  p.invuln = 2.3;
  state.combo = 0;
  state.comboTimer = 0;
  state.shake = 18;
  state.flash = 0.8;
  addExplosion(state, p.x, p.y, "#5ef2ff", 34, 340);
  addRing(state, p.x, p.y, 240, 0.45, "#5ef2ff");
  emit(state, "playerHit");
  for (const b of state.enemyBullets) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    if (dx * dx + dy * dy < 150 * 150) b.dead = true;
  }
  state.enemyBullets = state.enemyBullets.filter((b) => !b.dead);
  if (state.lives <= 0) {
    state.lives = 0;
    gameOver(state);
  }
}

function gameOver(state) {
  state.status = "over";
  state.banner = null;
  state.flash = 0.7;
  state.shake = 24;
  addExplosion(state, state.player.x, state.player.y, "#5ef2ff", 70, 430);
  addRing(state, state.player.x, state.player.y, 420, 0.8, "#ff4d6d");
  emit(state, "gameover");
}

/* ------------------------------------------------------------------ *
 * 子弹
 * ------------------------------------------------------------------ */

function updateBullets(state, dt) {
  const out = [];
  for (const b of state.bullets) {
    b.t += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < -30 || b.y > state.height + 30 || b.x < -30 || b.x > state.width + 30) continue;
    out.push(b);
  }
  state.bullets = out;
}

function updateEnemyBullets(state, dt) {
  const out = [];
  for (const b of state.enemyBullets) {
    b.t += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < -40 || b.y > state.height + 40 || b.x < -40 || b.x > state.width + 40) continue;
    out.push(b);
  }
  state.enemyBullets = out;
}

function fireBullet(state, x, y, angle, speed, opts = {}) {
  if (state.enemyBullets.length > 620) return;
  state.enemyBullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: opts.r ?? 5,
    color: opts.color ?? "#ff5f8f",
    t: 0,
    dead: false,
  });
}

function fireAimed(state, enemy, speed, spread = 0) {
  const p = state.player;
  const base = Math.atan2(p.y - enemy.y, p.x - enemy.x) + spread;
  fireBullet(state, enemy.x, enemy.y + enemy.r * 0.4, base, speed, { color: enemy.color });
}

/* ------------------------------------------------------------------ *
 * 敌人
 * ------------------------------------------------------------------ */

export function spawnEnemy(state, type, x, y, extra = {}) {
  const base = ENEMY_TYPES[type] || ENEMY_TYPES.drone;
  const waveScale = 1 + Math.max(0, state.wave - 1) * 0.075;
  const hp = extra.hp ?? Math.max(1, Math.round(base.hp * waveScale));
  const enemy = {
    id: state.nextId++,
    type,
    x,
    y,
    baseX: x,
    vx: 0,
    vy: 0,
    r: base.r,
    hp,
    maxHp: hp,
    score: base.score,
    color: base.color,
    t: 0,
    seed: state.rng() * TAU,
    fireCd: extra.fireCd ?? 0.9 + state.rng() * 0.9,
    hitFlash: 0,
    burstLeft: 0,
    burstGap: 0,
    phase: 1,
    spiral: 0,
    arrived: false,
    dead: false,
    ...extra,
  };
  state.enemies.push(enemy);
  return enemy;
}

function updateEnemies(state, dt) {
  for (const e of state.enemies) {
    if (e.dead) continue;
    e.t += dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;

    switch (e.type) {
      case "drone": {
        e.vy = 98 + state.wave * 3;
        e.y += e.vy * dt;
        e.x = e.baseX + Math.sin(e.t * 1.8 + e.seed) * 26;
        e.fireCd -= dt;
        if (e.fireCd <= 0 && e.y > 50 && e.y < state.height * 0.74) {
          e.fireCd = 1.7 + state.rng() * 0.8;
          fireAimed(state, e, 205);
          emit(state, "enemyShoot");
        }
        break;
      }
      case "weaver": {
        e.y += (78 + state.wave * 2) * dt;
        e.x = e.baseX + Math.sin(e.t * 1.55 + e.seed) * 74;
        e.fireCd -= dt;
        if (e.fireCd <= 0 && e.y > 40 && e.y < state.height * 0.7) {
          e.fireCd = 1.9 + state.rng() * 0.6;
          fireAimed(state, e, 195, -0.12);
          fireAimed(state, e, 195, 0.12);
          emit(state, "enemyShoot");
        }
        break;
      }
      case "sniper": {
        const targetY = 110 + (e.id % 3) * 62;
        if (e.y < targetY) {
          e.y += 82 * dt;
        } else {
          e.x = e.baseX + Math.sin(e.t * 0.85 + e.seed) * 62;
          e.y = targetY + Math.sin(e.t * 1.4) * 10;
        }
        if (e.burstLeft > 0) {
          e.burstGap -= dt;
          if (e.burstGap <= 0) {
            e.burstGap = 0.14;
            e.burstLeft -= 1;
            fireAimed(state, e, 250, 0);
            emit(state, "enemyShoot");
          }
        } else {
          e.fireCd -= dt;
          if (e.fireCd <= 0 && e.y > 70) {
            e.fireCd = 2.5 + state.rng() * 0.7;
            e.burstLeft = 3;
            e.burstGap = 0;
          }
        }
        break;
      }
      case "tank": {
        const hoverY = 128 + (e.id % 2) * 46;
        if (e.y < hoverY) e.y += 52 * dt;
        else e.y = hoverY + Math.sin(e.t * 1.1) * 8;
        e.x = clamp(e.baseX + Math.sin(e.t * 0.7 + e.seed) * 40, 46, state.width - 46);
        e.fireCd -= dt;
        if (e.fireCd <= 0 && e.y > 60) {
          e.fireCd = 2.7;
          const n = 9;
          const offset = e.t * 0.6;
          for (let i = 0; i < n; i++) {
            const a = Math.PI / 2 + (i / n) * TAU + offset;
            fireBullet(state, e.x, e.y, a, 150, { r: 5.5, color: "#ffb454" });
          }
          emit(state, "tankShoot");
        }
        break;
      }
      case "boss":
        updateBoss(state, e, dt);
        break;
      default:
        e.y += 90 * dt;
    }

    if (e.type !== "boss" && e.y > state.height + 70) e.dead = true;
  }
  state.enemies = state.enemies.filter((e) => !e.dead);
}

function updateBoss(state, e, dt) {
  const p = state.player;
  if (!e.arrived) {
    e.y += 74 * dt;
    if (e.y >= 132) {
      e.arrived = true;
      e.t = 0;
    }
    return;
  }

  e.t += dt;
  e.x = state.width / 2 + Math.sin(e.t * 0.62) * (state.width * 0.3);
  e.y = 132 + Math.sin(e.t * 1.1) * 13;

  const ratio = e.hp / e.maxHp;
  const phase = ratio > 0.62 ? 1 : ratio > 0.3 ? 2 : 3;
  if (phase !== e.phase) {
    e.phase = phase;
    e.fireCd = 0.45;
    state.shake = Math.max(state.shake, 10);
    addExplosion(state, e.x, e.y, "#ff4d6d", 26, 260);
    emit(state, "bossPhase", { phase });
    if (phase === 2) {
      spawnEnemy(state, "drone", state.width * 0.22, -34);
      spawnEnemy(state, "drone", state.width * 0.78, -34);
    } else if (phase === 3) {
      spawnEnemy(state, "sniper", state.width * 0.18, -40);
      spawnEnemy(state, "sniper", state.width * 0.82, -40);
    }
  }

  e.fireCd -= dt;
  if (e.fireCd > 0) return;

  if (e.phase === 1) {
    e.fireCd = 1.35;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.19;
      fireBullet(state, e.x, e.y + 20, a, 168, { r: 6, color: "#ff4d6d" });
    }
    emit(state, "bossShoot");
  } else if (e.phase === 2) {
    e.fireCd = 0.92;
    const aimed = Math.atan2(p.y - e.y, p.x - e.x);
    for (let i = -2; i <= 2; i++) {
      fireBullet(state, e.x, e.y + 14, aimed + i * 0.13, 208, { r: 5, color: "#ff8fb0" });
    }
    for (let i = 0; i < 5; i++) {
      fireBullet(state, e.x, e.y + 14, Math.PI / 2 + (i - 2) * 0.3, 152, { r: 5, color: "#ff5f8f" });
    }
    emit(state, "bossShoot");
  } else {
    e.fireCd = 0.17;
    e.spiral += 0.42;
    for (let i = 0; i < 2; i++) {
      fireBullet(state, e.x, e.y + 10, e.spiral + i * Math.PI, 176, { r: 4.5, color: "#ffd166" });
    }
    emit(state, "bossShoot");
  }
}

function damageEnemy(state, enemy, amount, x, y) {
  if (enemy.dead) return;
  enemy.hp -= amount;
  enemy.hitFlash = 0.1;
  addParticle(state, {
    x,
    y,
    vx: rand(state, -70, 70),
    vy: rand(state, -70, 70),
    life: 0.18,
    maxLife: 0.18,
    size: rand(state, 1.6, 3.4),
    color: "#ffffff",
    kind: "spark",
    drag: 3,
  });
  emit(state, "hit");
  if (enemy.hp <= 0) killEnemy(state, enemy);
}

function killEnemy(state, enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  state.kills += 1;
  state.combo += 1;
  state.comboTimer = 2.6;

  const mult = 1 + Math.min(state.combo, 20) * 0.05;
  const gained = Math.round(enemy.score * mult);
  state.score += gained;
  addFloater(state, enemy.x, enemy.y - 6, `+${gained}`, enemy.color);

  if (enemy.type === "boss") {
    addExplosion(state, enemy.x, enemy.y, "#ff4d6d", 90, 430);
    addExplosion(state, enemy.x, enemy.y, "#ffd166", 40, 240);
    addRing(state, enemy.x, enemy.y, 560, 0.9, "#ff4d6d");
    state.shake = 22;
    state.flash = 0.75;
    emit(state, "bossDown");
    addPowerup(state, enemy.x - 42, enemy.y, "power");
    addPowerup(state, enemy.x, enemy.y, "bomb");
    addPowerup(state, enemy.x + 42, enemy.y, "shield");
  } else {
    const big = enemy.type === "tank";
    addExplosion(state, enemy.x, enemy.y, enemy.color, big ? 42 : 18, big ? 320 : 190);
    state.shake = Math.max(state.shake, big ? 9 : 3.5);
    emit(state, "explode", { size: enemy.type });
    const chance = { drone: 0.07, weaver: 0.1, sniper: 0.14, tank: 0.55 }[enemy.type] ?? 0.05;
    if (state.rng() < chance) addPowerup(state, enemy.x, enemy.y, pickPowerup(state));
  }
}

function pickPowerup(state) {
  const roll = state.rng();
  if (state.weapon >= MAX_WEAPON) return roll < 0.5 ? "bomb" : "shield";
  if (roll < 0.58) return "power";
  if (roll < 0.82) return "shield";
  return "bomb";
}

/* ------------------------------------------------------------------ *
 * 道具
 * ------------------------------------------------------------------ */

export function addPowerup(state, x, y, type) {
  state.powerups.push({
    x: clamp(x, 20, state.width - 20),
    y,
    vy: 58,
    r: 12,
    type,
    t: 0,
    dead: false,
  });
}

function updatePowerups(state, dt) {
  const p = state.player;
  const out = [];
  for (const item of state.powerups) {
    item.t += dt;
    const dx = p.x - item.x;
    const dy = p.y - item.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 110) {
      const pull = 340 * (1 - dist / 110) + 120;
      item.x += (dx / dist) * pull * dt;
      item.y += (dy / dist) * pull * dt;
    } else {
      item.y += item.vy * dt;
      item.x += Math.sin(item.t * 2.2) * 22 * dt;
    }
    if (dist < p.r + item.r + 4) {
      collectPowerup(state, item);
      continue;
    }
    if (item.y > state.height + 30) continue;
    out.push(item);
  }
  state.powerups = out;
}

function collectPowerup(state, item) {
  emit(state, "powerup", { kind: item.type });
  addRing(state, item.x, item.y, 90, 0.35, "#ffffff");
  if (item.type === "power") {
    if (state.weapon < MAX_WEAPON) {
      state.weapon += 1;
      addFloater(state, item.x, item.y - 10, "POWER UP", "#7df9ff");
      emit(state, "levelup");
    } else {
      state.score += 300;
      addFloater(state, item.x, item.y - 10, "+300", "#7df9ff");
    }
  } else if (item.type === "shield") {
    if (state.lives < MAX_LIVES) {
      state.lives += 1;
      addFloater(state, item.x, item.y - 10, "SHIELD +1", "#9bffef");
    } else {
      state.score += 300;
      addFloater(state, item.x, item.y - 10, "+300", "#9bffef");
    }
  } else if (item.type === "bomb") {
    state.bombs += 1;
    addFloater(state, item.x, item.y - 10, "BOMB +1", "#ffd166");
  }
  addExplosion(state, item.x, item.y, "#ffffff", 12, 160);
}

/* ------------------------------------------------------------------ *
 * 碰撞
 * ------------------------------------------------------------------ */

function resolveCollisions(state) {
  const p = state.player;

  for (const b of state.bullets) {
    if (b.dead) continue;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      const rr = e.r + b.r;
      if (dx * dx + dy * dy <= rr * rr) {
        b.dead = true;
        damageEnemy(state, e, b.damage, b.x, b.y);
        break;
      }
    }
  }
  state.bullets = state.bullets.filter((b) => !b.dead);
  state.enemies = state.enemies.filter((e) => !e.dead);

  if (state.status !== "playing") return;

  if (p.invuln <= 0) {
    for (const b of state.enemyBullets) {
      if (b.dead) continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const rr = p.r + b.r;
      if (dx * dx + dy * dy <= rr * rr) {
        b.dead = true;
        hitPlayer(state);
        break;
      }
    }
    state.enemyBullets = state.enemyBullets.filter((b) => !b.dead);
    if (state.status !== "playing") return;
  }

  for (const e of state.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const rr = p.r + e.r * 0.82;
    if (dx * dx + dy * dy <= rr * rr) {
      damageEnemy(state, e, 8, p.x, p.y);
      hitPlayer(state);
      break;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 波次导演
 * ------------------------------------------------------------------ */

function beginWave(state, n) {
  state.wave = n;
  const isBoss = n % 5 === 0;
  state.waveState = {
    entries: buildWave(n, state.rng),
    index: 0,
    timer: 0,
  };
  state.banner = isBoss
    ? { text: "WARNING", sub: "BOSS APPROACHING", life: 2.1, maxLife: 2.1, tone: "danger" }
    : { text: `WAVE ${n}`, sub: n === 1 ? "ENGAGE" : "HOSTILES INBOUND", life: 1.5, maxLife: 1.5, tone: "normal" };
  emit(state, isBoss ? "bossWarning" : "wave", { wave: n });
}

function updateDirector(state, dt) {
  const ws = state.waveState;
  if (ws) {
    ws.timer += dt;
    while (ws.index < ws.entries.length && ws.entries[ws.index].delay <= ws.timer) {
      const s = ws.entries[ws.index];
      ws.index += 1;
      spawnEnemy(state, s.type, s.x, s.y, s.extra || {});
    }
    if (ws.index >= ws.entries.length && state.enemies.length === 0) {
      state.waveState = null;
      state.waveClearTimer = 1.5;
      const bonus = 200 + state.wave * 60;
      state.score += bonus;
      addFloater(state, state.width / 2, state.height * 0.46, `WAVE BONUS +${bonus}`, "#9bffef", 1.4);
      state.banner = { text: "WAVE CLEAR", sub: `BONUS +${bonus}`, life: 1.35, maxLife: 1.35, tone: "clear" };
      emit(state, "waveClear", { wave: state.wave });
    }
  } else if (state.waveClearTimer > 0) {
    state.waveClearTimer -= dt;
    if (state.waveClearTimer <= 0) beginWave(state, state.wave + 1);
  }
}

function buildWave(n, rng) {
  const W = LOGICAL_WIDTH;
  const entries = [];
  const add = (delay, type, x, y = -50, extra = {}) => entries.push({ delay, type, x, y, extra });

  if (n % 5 === 0) {
    add(1.9, "boss", W / 2, -110, {});
    add(2.6, "drone", W * 0.2, -40);
    add(2.8, "drone", W * 0.8, -40);
    return entries;
  }

  let cursor = 1.1;
  const style = n % 4;

  if (style === 0 || style === 1) {
    const count = Math.min(9, 5 + Math.floor(n / 2));
    for (let i = 0; i < count; i++) {
      const offset = i - (count - 1) / 2;
      add(cursor + Math.abs(offset) * 0.16, "drone", W / 2 + offset * 54, -46 - Math.abs(offset) * 24);
    }
    cursor += 2.0;
  }

  if (style === 0 || style === 2) {
    const pairs = Math.min(4, 2 + Math.floor(n / 3));
    for (let i = 0; i < pairs; i++) {
      add(cursor + i * 0.42, "weaver", W * 0.22, -40);
      add(cursor + 0.18 + i * 0.42, "weaver", W * 0.78, -40);
    }
    cursor += 2.2;
  }

  if (style === 1 || style === 3) {
    const count = Math.min(4, 1 + Math.floor(n / 2));
    for (let i = 0; i < count; i++) {
      add(cursor + i * 0.7, "sniper", W * (i % 2 === 0 ? 0.28 : 0.72), -50);
    }
    cursor += 2.4;
  }

  if (n >= 3 && (style === 2 || style === 3)) {
    const tanks = n >= 8 ? 2 : 1;
    for (let i = 0; i < tanks; i++) {
      add(cursor + i * 0.9, "tank", W * (tanks === 1 ? 0.5 : i === 0 ? 0.32 : 0.68), -70);
    }
    cursor += 1.8;
  }

  if (style === 3) {
    const count = Math.min(6, 3 + Math.floor(n / 3));
    for (let i = 0; i < count; i++) {
      add(cursor + i * 0.22, "drone", W * (0.14 + (i / Math.max(1, count - 1)) * 0.72), -44);
    }
  }

  if (rng && n > 6) {
    for (const entry of entries) entry.delay += rng() * 0.12;
  }
  return entries;
}

/* ------------------------------------------------------------------ *
 * 视觉特效（不影响玩法）
 * ------------------------------------------------------------------ */

function addParticle(state, particle) {
  if (state.particles.length > 460) return;
  state.particles.push(particle);
}

export function addExplosion(state, x, y, color, count, power) {
  for (let i = 0; i < count; i++) {
    const angle = state.rng() * TAU;
    const speed = rand(state, power * 0.14, power);
    const life = rand(state, 0.24, 0.78);
    addParticle(state, {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: rand(state, 1.4, 3.8),
      color,
      kind: "spark",
      drag: 3.1,
    });
  }
  addParticle(state, {
    x,
    y,
    vx: 0,
    vy: 0,
    life: 0.24,
    maxLife: 0.24,
    size: Math.max(6, power * 0.07),
    color,
    kind: "flash",
    drag: 0,
  });
}

function addRing(state, x, y, maxR, life, color) {
  if (state.rings.length > 24) return;
  state.rings.push({ x, y, r: 6, maxR, life, maxLife: life, color });
}

function addFloater(state, x, y, text, color, life = 0.9) {
  if (state.floaters.length > 40) return;
  state.floaters.push({ x, y, text, color, life, maxLife: life });
}

function updateEffects(state, dt) {
  const particles = [];
  for (const p of state.particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    if (p.kind !== "flash") {
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    particles.push(p);
  }
  state.particles = particles;

  const rings = [];
  for (const r of state.rings) {
    r.life -= dt;
    if (r.life <= 0) continue;
    r.r += (r.maxR - r.r) * Math.min(1, dt * 7);
    rings.push(r);
  }
  state.rings = rings;

  const floaters = [];
  for (const f of state.floaters) {
    f.life -= dt;
    if (f.life <= 0) continue;
    f.y -= 34 * dt;
    floaters.push(f);
  }
  state.floaters = floaters;
}

export const __internal = { buildWave, ENEMY_TYPES, WEAPON_PATTERNS };

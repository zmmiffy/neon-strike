import test from "node:test";
import assert from "node:assert/strict";

import {
  createGame,
  startGame,
  stepGame,
  togglePause,
  useBomb,
  drainEvents,
  spawnEnemy,
  addPowerup,
  FIXED_DT,
  LOGICAL_WIDTH,
  LOGICAL_HEIGHT,
  MAX_WEAPON,
  __internal,
} from "../js/core.js";

function play(state, seconds, input = {}) {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) stepGame(state, FIXED_DT, input);
}

test("新游戏处于待机状态且玩家居中", () => {
  const state = createGame(1);
  assert.equal(state.status, "ready");
  assert.equal(state.score, 0);
  assert.equal(state.lives, 3);
  assert.equal(state.player.x, LOGICAL_WIDTH / 2);
  assert.ok(state.player.y > LOGICAL_HEIGHT * 0.7);
  assert.ok(state.stars.length > 0);
});

test("开始游戏会重置进度并进入第一波", () => {
  const state = createGame(2);
  startGame(state);
  assert.equal(state.status, "playing");
  assert.equal(state.wave, 1);
  assert.ok(state.banner);
  assert.equal(state.banner.text, "WAVE 1");
  assert.ok(drainEvents(state).some((e) => e.type === "start"));
});

test("玩家射击会生成子弹并自动飞向屏幕上方", () => {
  const state = createGame(3);
  startGame(state);
  stepGame(state, FIXED_DT, {});
  assert.ok(state.bullets.length > 0);
  const bullet = state.bullets[0];
  const y0 = bullet.y;
  stepGame(state, FIXED_DT, {});
  assert.ok(bullet.y < y0, "子弹应向上飞行");
  assert.ok(bullet.vy < 0);
});

test("键盘输入可以移动战机且被限制在边界内", () => {
  const state = createGame(4);
  startGame(state);
  const x0 = state.player.x;
  play(state, 0.4, { moveX: 1, moveY: 0 });
  assert.ok(state.player.x > x0);
  play(state, 4, { moveX: 1, moveY: 0 });
  assert.equal(state.player.x, LOGICAL_WIDTH - 16);
  play(state, 4, { moveY: -1, moveX: 0 });
  assert.equal(state.player.y, 26);
});

test("精准模式降低移动速度", () => {
  const fast = createGame(5);
  startGame(fast);
  play(fast, 0.3, { moveX: 1 });
  const normalDx = fast.player.x - LOGICAL_WIDTH / 2;

  const slow = createGame(5);
  startGame(slow);
  play(slow, 0.3, { moveX: 1, focus: true });
  const focusDx = slow.player.x - LOGICAL_WIDTH / 2;

  assert.ok(focusDx < normalDx * 0.75, `focus=${focusDx} normal=${normalDx}`);
});

test("指针输入会把战机拉向目标点", () => {
  const state = createGame(6);
  startGame(state);
  const target = { active: true, x: 120, y: 300 };
  play(state, 1.2, { pointer: target });
  assert.ok(Math.abs(state.player.x - 120) < 6);
  assert.ok(Math.abs(state.player.y - 300) < 6);
});

test("子弹命中敌机后敌机受伤并被击落", () => {
  const state = createGame(7);
  startGame(state);
  state.enemies = [];
  state.waveState = null;
  state.waveClearTimer = 99;
  const enemy = spawnEnemy(state, "drone", LOGICAL_WIDTH / 2, state.player.y - 120);
  enemy.fireCd = 999;
  enemy.hp = 2;

  play(state, 1.0);
  assert.ok(state.kills >= 1);
  assert.ok(state.score > 0);
  assert.equal(state.enemies.length, 0);
  assert.ok(state.particles.length > 0);
});

test("敌机子弹命中会扣除护盾并给予无敌时间", () => {
  const state = createGame(8);
  startGame(state);
  state.enemies = [];
  state.waveState = null;
  state.waveClearTimer = 99;
  state.player.invuln = 0;
  const p = state.player;
  state.enemyBullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, color: "#f00", t: 0, dead: false });

  stepGame(state, FIXED_DT, {});
  assert.equal(state.lives, 2);
  assert.ok(state.player.invuln > 0);
  assert.equal(state.enemyBullets.length, 0, "命中后子弹应被移除");
});

test("无敌时间内不会再扣护盾", () => {
  const state = createGame(9);
  startGame(state);
  state.enemies = [];
  state.waveState = null;
  state.waveClearTimer = 99;
  state.player.invuln = 0;
  const p = state.player;
  const shot = () => {
    state.enemyBullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, color: "#f00", t: 0, dead: false });
    stepGame(state, FIXED_DT, {});
  };
  shot();
  const afterFirst = state.lives;
  shot();
  assert.equal(state.lives, afterFirst);
});

test("护盾耗尽后进入结束状态", () => {
  const state = createGame(10);
  startGame(state);
  state.enemies = [];
  state.waveState = null;
  state.waveClearTimer = 99;
  state.lives = 1;
  state.player.invuln = 0;
  const p = state.player;
  state.enemyBullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, color: "#f00", t: 0, dead: false });

  stepGame(state, FIXED_DT, {});
  assert.equal(state.status, "over");
  assert.equal(state.lives, 0);
  assert.ok(drainEvents(state).some((e) => e.type === "gameover"));
});

test("炸弹清除敌方弹幕并造成伤害", () => {
  const state = createGame(11);
  startGame(state);
  state.enemies = [];
  state.waveState = null;
  state.waveClearTimer = 99;
  const tank = spawnEnemy(state, "tank", 240, 140, { fireCd: 999 });
  const hpBefore = tank.hp;
  state.enemyBullets.push({ x: 100, y: 200, vx: 0, vy: 40, r: 5, color: "#f00", t: 0, dead: false });

  assert.equal(useBomb(state), true);
  assert.equal(state.bombs, 1);
  assert.equal(state.enemyBullets.length, 0);
  assert.ok(tank.hp < hpBefore);
});

test("没有炸弹时无法使用", () => {
  const state = createGame(12);
  startGame(state);
  state.bombs = 0;
  assert.equal(useBomb(state), false);
});

test("拾取火力道具提升武器等级，满级后转化为分数", () => {
  const state = createGame(13);
  startGame(state);
  state.enemies = [];
  state.waveState = null;
  state.waveClearTimer = 99;
  state.player.invuln = 999;

  const p = state.player;
  for (let level = 1; level < MAX_WEAPON; level++) {
    addPowerup(state, p.x, p.y, "power");
    play(state, 0.3);
  }
  assert.equal(state.weapon, MAX_WEAPON);

  const before = state.score;
  addPowerup(state, p.x, p.y, "power");
  play(state, 0.3);
  assert.equal(state.weapon, MAX_WEAPON);
  assert.ok(state.score > before);
});

test("护盾道具最多把生命补到上限", () => {
  const state = createGame(14);
  startGame(state);
  state.enemies = [];
  state.waveState = null;
  state.waveClearTimer = 99;
  state.player.invuln = 999;
  state.lives = 5;
  addPowerup(state, state.player.x, state.player.y, "shield");
  play(state, 0.3);
  assert.equal(state.lives, 5);
});

test("清空一波后进入下一波并结算奖励", () => {
  const state = createGame(15);
  startGame(state);
  const wave1 = state.wave;
  state.waveState.entries = [];
  state.waveState.index = 0;
  state.enemies = [];
  const before = state.score;

  play(state, 0.2);
  assert.equal(state.waveState, null, "波次应进入清场结算");
  play(state, 2.0);
  assert.equal(state.wave, wave1 + 1);
  assert.ok(state.score > before);
  assert.ok(state.banner && state.banner.text.startsWith("WAVE"));
});

test("每五波出现旗舰，且旗舰拥有更高血量", () => {
  const state = createGame(16);
  startGame(state);
  state.wave = 4;
  state.waveClearTimer = 0.01;
  state.waveState = null;
  state.enemies = [];
  play(state, 0.3);
  assert.equal(state.wave, 5);
  play(state, 3.0);
  const boss = state.enemies.find((e) => e.type === "boss");
  assert.ok(boss, "第五波应生成旗舰");
  assert.ok(boss.hp > __internal.ENEMY_TYPES.drone.hp * 10);
  assert.equal(state.banner, null);
});

test("旗舰会发射弹幕，且血量降低后切换形态", () => {
  const state = createGame(17);
  startGame(state);
  state.enemies = [];
  state.waveState = null;
  state.waveClearTimer = 999;
  state.player.invuln = 999;
  const boss = spawnEnemy(state, "boss", LOGICAL_WIDTH / 2, -110);
  boss.hp = 600;
  boss.maxHp = 600;

  play(state, 6.5);
  assert.equal(boss.arrived, true);
  assert.ok(state.enemyBullets.length > 0, "旗舰应开火");
  assert.equal(boss.phase, 1);

  boss.hp = 200;
  play(state, 0.5);
  assert.equal(boss.phase, 2);
});

test("击破旗舰会掉落三个道具并给出高分", () => {
  const state = createGame(18);
  startGame(state);
  state.enemies = [];
  state.waveState = null;
  state.waveClearTimer = 999;
  state.player.invuln = 999;
  const boss = spawnEnemy(state, "boss", LOGICAL_WIDTH / 2, 132, { arrived: true });
  boss.hp = 1;
  boss.maxHp = 1;
  state.bullets.push({
    x: boss.x,
    y: boss.y,
    vx: 0,
    vy: -600,
    r: 4,
    damage: 2,
    t: 0,
    dead: false,
  });
  const before = state.score;
  stepGame(state, FIXED_DT, {});
  assert.equal(state.enemies.length, 0);
  assert.ok(state.score - before >= 5000);
  assert.equal(state.powerups.length, 3);
  assert.deepEqual(state.powerups.map((p) => p.type).sort(), ["bomb", "power", "shield"]);
});

test("连击会提高得分倍率", () => {
  const first = createGame(19);
  startGame(first);
  first.enemies = [];
  first.waveState = null;
  first.waveClearTimer = 999;
  first.player.invuln = 999;
  const a = spawnEnemy(first, "drone", 240, 300);
  a.hp = 1;
  first.bullets.push({ x: 240, y: 300, vx: 0, vy: -600, r: 4, damage: 2, t: 0, dead: false });
  stepGame(first, FIXED_DT, {});
  const singleKillScore = first.score;

  const second = createGame(19);
  startGame(second);
  second.enemies = [];
  second.waveState = null;
  second.waveClearTimer = 999;
  second.player.invuln = 999;
  second.combo = 10;
  const b = spawnEnemy(second, "drone", 240, 300);
  b.hp = 1;
  second.bullets.push({ x: 240, y: 300, vx: 0, vy: -600, r: 4, damage: 2, t: 0, dead: false });
  stepGame(second, FIXED_DT, {});

  assert.ok(second.score > singleKillScore, "高连击应获得更高分数");
});

test("暂停后世界静止，恢复后继续推进", () => {
  const state = createGame(20);
  startGame(state);
  const t0 = state.time;
  togglePause(state);
  assert.equal(state.status, "paused");
  play(state, 0.5);
  assert.equal(state.time, t0);

  togglePause(state);
  assert.equal(state.status, "playing");
  play(state, 0.2);
  assert.ok(state.time > t0);
});

test("同样的种子与输入得到完全相同的结果", () => {
  const run = () => {
    const state = createGame(42);
    startGame(state);
    play(state, 6, { moveX: 1, moveY: -0.4 });
    return { score: state.score, wave: state.wave, enemies: state.enemies.length, x: state.player.x };
  };
  assert.deepEqual(run(), run());
});

test("波次编排随波数增加而更密集", () => {
  const { buildWave } = __internal;
  const early = buildWave(1);
  const late = buildWave(12);
  assert.ok(late.length >= early.length);
  for (const entry of early) {
    assert.ok(entry.delay > 0);
    assert.ok(entry.x > 0 && entry.x < LOGICAL_WIDTH);
  }
  const bossWave = buildWave(5);
  assert.equal(bossWave.length > 0, true);
  assert.ok(bossWave.some((e) => e.type === "boss"));
});

test("长时间运行不会越界，敌人最终会离场", () => {
  const state = createGame(21);
  startGame(state);
  state.player.invuln = 999;
  play(state, 25, { moveX: 0.6 });
  assert.ok(state.enemies.length < 200);
  assert.ok(state.bullets.length < 400);
  assert.ok(state.enemyBullets.length < 700);
  assert.ok(state.particles.length <= 460);
  for (const e of state.enemies) {
    assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
  }
});

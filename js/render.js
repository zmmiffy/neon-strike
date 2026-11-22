/**
 * NEON STRIKE — Canvas 渲染层
 * 只读取 state，不修改玩法数据（除了只读缓存）。
 */

const TAU = Math.PI * 2;

const COLORS = {
  cyan: "#5ef2ff",
  blue: "#3a7bff",
  magenta: "#ff4dd2",
  pink: "#ff5f8f",
  amber: "#ffd166",
  mint: "#9bffef",
  white: "#ffffff",
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let dpr = 1;
  let W = canvas.width;
  let H = canvas.height;
  const bg = document.createElement("canvas");
  const bgCtx = bg.getContext("2d");

  function resize(cssWidth, cssHeight) {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(cssWidth * dpr);
    H = Math.round(cssHeight * dpr);
    canvas.width = W;
    canvas.height = H;
    buildBackground();
  }

  function buildBackground() {
    bg.width = W;
    bg.height = H;
    const g = bgCtx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#05040f");
    g.addColorStop(0.45, "#080a1c");
    g.addColorStop(1, "#04060f");
    bgCtx.fillStyle = g;
    bgCtx.fillRect(0, 0, W, H);

    const blobs = [
      { x: 0.18, y: 0.16, r: 0.52, c: "rgba(58,123,255,0.20)" },
      { x: 0.86, y: 0.32, r: 0.46, c: "rgba(255,77,210,0.15)" },
      { x: 0.5, y: 0.95, r: 0.62, c: "rgba(94,242,255,0.10)" },
      { x: 0.7, y: 0.68, r: 0.38, c: "rgba(126,92,255,0.14)" },
    ];
    for (const b of blobs) {
      const radial = bgCtx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * W);
      radial.addColorStop(0, b.c);
      radial.addColorStop(1, "rgba(0,0,0,0)");
      bgCtx.fillStyle = radial;
      bgCtx.fillRect(0, 0, W, H);
    }

    bgCtx.globalAlpha = 0.5;
    bgCtx.strokeStyle = "rgba(120,170,255,0.045)";
    bgCtx.lineWidth = 1 * dpr;
    const step = 40 * dpr;
    for (let x = 0; x <= W; x += step) {
      bgCtx.beginPath();
      bgCtx.moveTo(x, 0);
      bgCtx.lineTo(x, H);
      bgCtx.stroke();
    }
    for (let y = 0; y <= H; y += step) {
      bgCtx.beginPath();
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(W, y);
      bgCtx.stroke();
    }
    bgCtx.globalAlpha = 1;
  }

  function draw(state) {
    const sx = state.width / W;
    const scale = 1 / sx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);

    const shake = state.shake;
    const ox = shake > 0 ? (Math.random() - 0.5) * shake * dpr * 0.55 : 0;
    const oy = shake > 0 ? (Math.random() - 0.5) * shake * dpr * 0.55 : 0;
    ctx.setTransform(dpr / sx, 0, 0, dpr / sx, ox, oy);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawStars(state);
    drawRings(state, "under");
    drawPowerups(state);
    drawEnemies(state);
    drawPlayer(state);
    drawBullets(state);
    drawEnemyBullets(state);
    drawParticles(state);
    drawRings(state, "over");
    drawFloaters(state);

    if (state.status === "ready") drawIdleHint(state);

    if (state.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.55, state.flash * 0.5);
      ctx.fillStyle = state.flash > 0.6 ? "#c9f6ff" : "#8ad7ff";
      ctx.fillRect(0, 0, state.width, state.height);
      ctx.globalAlpha = 1;
    }

    return scale;
  }

  function drawStars(state) {
    for (const s of state.stars) {
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.hue === "magenta" ? "#ff9be0" : "#bfe9ff";
      ctx.fillRect(s.x, s.y, s.size, s.size * 2.4);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p || state.status === "over") return;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.tilt * 0.5);

    // 引擎尾焰
    const flame = 14 + Math.sin(state.time * 42) * 4;
    const fg = ctx.createLinearGradient(0, 12, 0, 12 + flame);
    fg.addColorStop(0, "rgba(160,240,255,0.95)");
    fg.addColorStop(0.45, "rgba(94,242,255,0.55)");
    fg.addColorStop(1, "rgba(58,123,255,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-6, 12);
    ctx.lineTo(0, 12 + flame);
    ctx.lineTo(6, 12);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = blink ? 0.45 : 1;

    // 机翼
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 18 * dpr;
    ctx.fillStyle = "rgba(20,60,110,0.85)";
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(9, 2);
    ctx.lineTo(22, 12);
    ctx.lineTo(8, 11);
    ctx.lineTo(0, 17);
    ctx.lineTo(-8, 11);
    ctx.lineTo(-22, 12);
    ctx.lineTo(-9, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 座舱
    const cg = ctx.createLinearGradient(0, -16, 0, 6);
    cg.addColorStop(0, "#ffffff");
    cg.addColorStop(1, "#5ef2ff");
    ctx.fillStyle = cg;
    ctx.shadowBlur = 12 * dpr;
    ctx.beginPath();
    ctx.ellipse(0, -7, 4.2, 8.6, 0, 0, TAU);
    ctx.fill();

    // 护盾
    if (p.invuln > 0) {
      ctx.globalAlpha = 0.32 + Math.sin(state.time * 12) * 0.12;
      ctx.strokeStyle = COLORS.mint;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 22 * dpr;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const flash = e.hitFlash > 0;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 16 * dpr;
      ctx.strokeStyle = flash ? "#ffffff" : e.color;
      ctx.fillStyle = flash ? "rgba(255,255,255,0.5)" : "rgba(10,16,36,0.88)";
      ctx.lineWidth = 2;

      switch (e.type) {
        case "drone": {
          ctx.beginPath();
          ctx.moveTo(0, 14);
          ctx.lineTo(7, 2);
          ctx.lineTo(13, -4);
          ctx.lineTo(9, -12);
          ctx.lineTo(3, -9);
          ctx.lineTo(-3, -9);
          ctx.lineTo(-9, -12);
          ctx.lineTo(-13, -4);
          ctx.lineTo(-7, 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.arc(0, -1, 3, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = flash ? "#fff" : "rgba(255,255,255,0.5)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(-13, -4);
          ctx.lineTo(-6, 3);
          ctx.moveTo(13, -4);
          ctx.lineTo(6, 3);
          ctx.stroke();
          break;
        }
        case "weaver": {
          ctx.rotate(Math.sin(e.t * 2.2 + e.seed) * 0.24);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + Math.PI / 6;
            const r = i % 2 === 0 ? 16 : 9;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = flash ? "#fff" : "rgba(255,255,255,0.55)";
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, TAU);
          ctx.stroke();
          break;
        }
        case "sniper": {
          ctx.beginPath();
          ctx.moveTo(0, 16);
          ctx.lineTo(15, 0);
          ctx.lineTo(8, -13);
          ctx.lineTo(-8, -13);
          ctx.lineTo(-15, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = flash ? "#fff" : e.color;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(0, 14);
          ctx.lineTo(0, 22);
          ctx.stroke();
          if (e.burstLeft > 0) {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(0, 20, 3, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          break;
        }
        case "tank": {
          ctx.beginPath();
          ctx.roundRect(-23, -20, 46, 40, 8);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = flash ? "#fff" : "rgba(255,255,255,0.35)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.roundRect(-14, -12, 28, 24, 5);
          ctx.stroke();
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.arc(0, 4, 6, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(-15, -14, 2.4, 0, TAU);
          ctx.arc(15, -14, 2.4, 0, TAU);
          ctx.fill();
          break;
        }
        case "boss": {
          drawBoss(e, flash);
          break;
        }
        default:
          ctx.beginPath();
          ctx.arc(0, 0, e.r, 0, TAU);
          ctx.fill();
          ctx.stroke();
      }
      ctx.restore();

      if (e.type !== "boss" && e.hp < e.maxHp) drawHpBar(e);
    }
    ctx.shadowBlur = 0;
  }

  function drawBoss(e, flash) {
    const pulse = 1 + Math.sin(e.t * 3) * 0.02;
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = flash ? "#ffffff" : e.phase === 3 ? "#ffd166" : e.color;
    ctx.lineWidth = 2.6;
    ctx.fillStyle = flash ? "rgba(255,255,255,0.45)" : "rgba(20,8,24,0.9)";

    ctx.beginPath();
    ctx.moveTo(0, 44);
    ctx.lineTo(30, 20);
    ctx.lineTo(58, 26);
    ctx.lineTo(46, -6);
    ctx.lineTo(22, -16);
    ctx.lineTo(0, -34);
    ctx.lineTo(-22, -16);
    ctx.lineTo(-46, -6);
    ctx.lineTo(-58, 26);
    ctx.lineTo(-30, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = flash ? "#fff" : "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-30, -2);
    ctx.lineTo(30, -2);
    ctx.moveTo(-20, 14);
    ctx.lineTo(20, 14);
    ctx.stroke();

    // 核心
    const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 20);
    core.addColorStop(0, "#ffffff");
    core.addColorStop(0.35, e.phase === 3 ? "#ffd166" : "#ff5f8f");
    core.addColorStop(1, "rgba(255,77,109,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, 20 + Math.sin(e.t * 6) * 2.5, 0, TAU);
    ctx.fill();

    // 侧炮
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(-52, 10, 6, 16);
    ctx.fillRect(46, 10, 6, 16);
  }

  function drawHpBar(e) {
    const w = e.r * 1.8;
    const pct = Math.max(0, e.hp / e.maxHp);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, 3);
    ctx.fillStyle = pct > 0.5 ? "#9bffef" : pct > 0.25 ? "#ffd166" : "#ff5f8f";
    ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * pct, 3);
    ctx.globalAlpha = 1;
  }

  function drawBullets(state) {
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 14 * dpr;
    for (const b of state.bullets) {
      const len = 15;
      const nx = b.vx / Math.hypot(b.vx, b.vy);
      const ny = b.vy / Math.hypot(b.vx, b.vy);
      const g = ctx.createLinearGradient(b.x - nx * len, b.y - ny * len, b.x + nx * 3, b.y + ny * 3);
      g.addColorStop(0, "rgba(94,242,255,0)");
      g.addColorStop(0.55, "rgba(120,200,255,0.85)");
      g.addColorStop(1, "#ffffff");
      ctx.strokeStyle = g;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(b.x - nx * len, b.y - ny * len);
      ctx.lineTo(b.x + nx * 3, b.y + ny * 3);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function drawEnemyBullets(state) {
    for (const b of state.enemyBullets) {
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12 * dpr;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.4);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.42, b.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function drawPowerups(state) {
    for (const item of state.powerups) {
      const color = item.type === "power" ? COLORS.cyan : item.type === "shield" ? COLORS.mint : COLORS.amber;
      const glyph = item.type === "power" ? "P" : item.type === "shield" ? "+" : "B";
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(Math.sin(item.t * 2.4) * 0.28);
      ctx.shadowColor = color;
      ctx.shadowBlur = 20 * dpr;
      ctx.strokeStyle = color;
      ctx.fillStyle = "rgba(8,16,30,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const px = Math.cos(a) * 12;
        const py = Math.sin(a) * 12;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "700 12px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, 0, 0.5);
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      const k = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = k;
      if (p.kind === "flash") {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.2);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.35, p.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3.2, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRings(state) {
    for (const r of state.rings) {
      const k = Math.max(0, r.life / r.maxLife);
      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2 + k * 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters(state) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of state.floaters) {
      const k = Math.max(0, f.life / f.maxLife);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = f.color;
      ctx.font = `700 ${13 + (1 - k) * 2}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawIdleHint(state) {
    ctx.globalAlpha = 0.9;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(160,220,255,0.85)";
    ctx.font = "600 12px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("按 ENTER 或点击「出击」开始", state.width / 2, state.height * 0.62);
    ctx.globalAlpha = 1;
  }

  return { resize, draw, buildBackground };
}

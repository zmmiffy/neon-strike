/**
 * NEON STRIKE — 极简 WebAudio 合成器
 * 不加载任何音频文件：所有声音都由振荡器与噪声实时生成。
 */

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuffer = null;
  let lastShot = 0;
  let lastHit = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master.connect(comp).connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function resume() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume();
  }

  function tone({ freq = 440, endFreq = null, dur = 0.12, type = "square", gain = 0.18, delay = 0, attack = 0.004, filter = null }) {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = filter.type || "lowpass";
      f.frequency.value = filter.freq || 1200;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.2, gain = 0.2, freq = 1200, type = "lowpass", delay = 0, q = 1 }) {
    const c = ensure();
    if (!c || muted || !noiseBuffer) return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.25), t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const api = {
    resume,
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = Boolean(value);
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    toggleMute() {
      api.setMuted(!muted);
      return muted;
    },
    shoot() {
      const now = performance.now();
      if (now - lastShot < 55) return;
      lastShot = now;
      tone({ freq: 900, endFreq: 320, dur: 0.07, type: "square", gain: 0.045, filter: { type: "highpass", freq: 500 } });
    },
    hit() {
      const now = performance.now();
      if (now - lastHit < 40) return;
      lastHit = now;
      noise({ dur: 0.06, gain: 0.06, freq: 2400, type: "bandpass", q: 1.4 });
    },
    explode(size = "small") {
      const big = size === "tank" || size === "boss";
      noise({ dur: big ? 0.5 : 0.24, gain: big ? 0.3 : 0.16, freq: big ? 900 : 1500 });
      tone({ freq: big ? 180 : 300, endFreq: 40, dur: big ? 0.42 : 0.2, type: "sawtooth", gain: big ? 0.18 : 0.09 });
    },
    enemyShoot() {
      tone({ freq: 240, endFreq: 150, dur: 0.09, type: "triangle", gain: 0.045 });
    },
    tankShoot() {
      tone({ freq: 160, endFreq: 70, dur: 0.28, type: "sawtooth", gain: 0.08 });
      noise({ dur: 0.2, gain: 0.08, freq: 600 });
    },
    bossShoot() {
      tone({ freq: 120, endFreq: 80, dur: 0.16, type: "square", gain: 0.05, filter: { type: "lowpass", freq: 700 } });
    },
    playerHit() {
      noise({ dur: 0.45, gain: 0.28, freq: 1000 });
      tone({ freq: 420, endFreq: 60, dur: 0.45, type: "sawtooth", gain: 0.2 });
    },
    bomb() {
      noise({ dur: 0.9, gain: 0.32, freq: 2600 });
      tone({ freq: 90, endFreq: 30, dur: 0.8, type: "sine", gain: 0.28 });
      tone({ freq: 620, endFreq: 120, dur: 0.5, type: "square", gain: 0.1, delay: 0.03 });
    },
    powerup() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ freq: f, dur: 0.12, type: "triangle", gain: 0.1, delay: i * 0.055 }),
      );
    },
    levelup() {
      [659.25, 880, 1318.5].forEach((f, i) => tone({ freq: f, dur: 0.16, type: "square", gain: 0.07, delay: i * 0.06 }));
    },
    wave() {
      tone({ freq: 330, endFreq: 660, dur: 0.26, type: "triangle", gain: 0.09 });
      tone({ freq: 495, dur: 0.2, type: "sine", gain: 0.06, delay: 0.12 });
    },
    waveClear() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        tone({ freq: f, dur: 0.22, type: "triangle", gain: 0.075, delay: i * 0.07 }),
      );
    },
    bossWarning() {
      for (let i = 0; i < 3; i++) {
        tone({ freq: 220, dur: 0.18, type: "sawtooth", gain: 0.1, delay: i * 0.34 });
        tone({ freq: 110, dur: 0.18, type: "square", gain: 0.08, delay: i * 0.34 });
      }
    },
    gameOver() {
      [523.25, 440, 349.23, 261.63].forEach((f, i) =>
        tone({ freq: f, endFreq: f * 0.94, dur: 0.4, type: "triangle", gain: 0.11, delay: i * 0.16 }),
      );
    },
    start() {
      [392, 523.25, 659.25, 880].forEach((f, i) => tone({ freq: f, dur: 0.18, type: "square", gain: 0.07, delay: i * 0.07 }));
    },
  };

  return api;
}

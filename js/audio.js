/* BOX HORSE — procedural audio (Web Audio API). No samples.
 * Everything is a no-op until unlock() is called from a user gesture.
 */
(function () {
  'use strict';
  const BH = (window.BH = window.BH || {});

  const A = {
    ctx: null, master: null, sfxGain: null, musicGain: null,
    muted: false, unlocked: false,
    music: { playing: false, timer: null, step: 0, nextTime: 0, biome: 'street', tempo: 148 },
  };

  function unlock() {
    if (A.unlocked) { if (A.ctx && (A.ctx.state === 'suspended' || A.ctx.state === 'interrupted')) A.ctx.resume().catch(() => {}); return; }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain(); A.master.gain.value = A.muted ? 0 : 0.8; A.master.connect(A.ctx.destination);
      A.sfxGain = A.ctx.createGain(); A.sfxGain.gain.value = 0.9; A.sfxGain.connect(A.master);
      // music bus -> lowpass (opens with speed: the "feeding the algorithm" read you can hear) -> master
      A.musicFilter = A.ctx.createBiquadFilter(); A.musicFilter.type = 'lowpass'; A.musicFilter.frequency.value = 1200; A.musicFilter.Q.value = 0.7;
      A.musicGain = A.ctx.createGain(); A.musicGain.gain.value = 0.32; A.musicGain.connect(A.musicFilter); A.musicFilter.connect(A.master);
      A.unlocked = true;
      if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
    } catch (e) { /* audio is optional */ }
  }

  function setMuted(m) {
    A.muted = !!m;
    if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : 0.8, A.ctx.currentTime, 0.02);
  }

  function now() { return A.ctx ? A.ctx.currentTime : 0; }

  // basic oscillator voice
  function tone(opts) {
    if (!A.unlocked || A.muted) return;
    const c = A.ctx;
    const t0 = now() + (opts.delay || 0);
    const o = c.createOscillator(); const g = c.createGain();
    o.type = opts.type || 'square';
    o.frequency.setValueAtTime(opts.f0 || 440, t0);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.f1), t0 + (opts.dur || 0.1));
    const v = opts.vol == null ? 0.2 : opts.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.1));
    let dest = opts.dest || A.sfxGain;
    if (opts.vibrato) {
      const lfo = c.createOscillator(); const lg = c.createGain();
      lfo.frequency.value = opts.vibrato; lg.gain.value = opts.vibratoDepth || 20;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t0); lfo.stop(t0 + (opts.dur || 0.1) + 0.05);
    }
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + (opts.dur || 0.1) + 0.05);
  }

  let noiseBuf = null;
  function noise(opts) {
    if (!A.unlocked || A.muted) return;
    const c = A.ctx;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = now() + (opts.delay || 0);
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const g = c.createGain(); const f = c.createBiquadFilter();
    f.type = opts.filter || 'lowpass'; f.frequency.setValueAtTime(opts.f0 || 1200, t0);
    if (opts.f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.f1), t0 + (opts.dur || 0.2));
    const v = opts.vol == null ? 0.3 : opts.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.2));
    src.connect(f); f.connect(g); g.connect(A.sfxGain);
    src.start(t0); src.stop(t0 + (opts.dur || 0.2) + 0.05);
  }

  // ---- named SFX --------------------------------------------------------------
  const SFX = {
    egg(combo) {
      const f = 740 * Math.pow(1.059, Math.min(24, combo || 0));
      tone({ type: 'square', f0: f, f1: f * 1.5, dur: 0.09, vol: 0.12 });
    },
    goldenEgg() {
      [0, 0.08, 0.16, 0.24].forEach((d, i) => tone({ type: 'triangle', f0: 880 * Math.pow(1.26, i), dur: 0.18, vol: 0.18, delay: d }));
    },
    chicken() {
      tone({ type: 'square', f0: 900, f1: 1500, dur: 0.07, vol: 0.14, vibrato: 40, vibratoDepth: 120 });
      tone({ type: 'square', f0: 1300, f1: 700, dur: 0.12, vol: 0.12, delay: 0.07, vibrato: 30, vibratoDepth: 200 });
      noise({ f0: 3000, f1: 800, dur: 0.12, vol: 0.08, filter: 'bandpass' });
    },
    scream(arg) {
      // "啊啊啊啊": sawtooth with wobble, slightly falling; pitch rises with speed
      const dur = typeof arg === 'number' ? arg : (arg && arg.dur) || 0.5;
      const f = 520 + 8 * ((arg && arg.speed) || 12);
      tone({ type: 'sawtooth', f0: f, f1: f * 0.78, dur, vol: 0.09, vibrato: 11, vibratoDepth: 35, attack: 0.03 });
      tone({ type: 'square', f0: f * 2, f1: f * 1.55, dur, vol: 0.03, vibrato: 11, vibratoDepth: 60, attack: 0.03 });
    },
    woah() { tone({ type: 'sawtooth', f0: 330, f1: 250, dur: 0.22, vol: 0.1, vibrato: 18, vibratoDepth: 30, attack: 0.02 }); },
    clutch() {
      tone({ type: 'sine', f0: 60, dur: 0.35, vol: 0.5 });
      [0, 0.09, 0.18].forEach((d, i) => tone({ type: 'square', f0: [440, 660, 880][i], dur: 0.2, vol: 0.14, delay: d + 0.1 }));
    },
    heartbeat() { tone({ type: 'sine', f0: 55, f1: 40, dur: 0.18, vol: 0.5 }); tone({ type: 'sine', f0: 50, f1: 38, dur: 0.16, vol: 0.4, delay: 0.22 }); },
    bell() { [0, 0.5].forEach((d) => { tone({ type: 'triangle', f0: 1800, f1: 1500, dur: 0.6, vol: 0.14, delay: d }); tone({ type: 'sine', f0: 900, f1: 850, dur: 0.6, vol: 0.1, delay: d }); }); },
    bonk() {
      tone({ type: 'sine', f0: 160, f1: 40, dur: 0.25, vol: 0.5 });
      noise({ f0: 900, f1: 120, dur: 0.22, vol: 0.35 });
    },
    smash() {
      noise({ f0: 2400, f1: 200, dur: 0.3, vol: 0.4 });
      tone({ type: 'square', f0: 220, f1: 90, dur: 0.18, vol: 0.25 });
    },
    land() { noise({ f0: 600, f1: 150, dur: 0.1, vol: 0.14 }); },
    perfect() {
      [0, 0.07, 0.14].forEach((d, i) => tone({ type: 'square', f0: [660, 880, 1320][i], dur: 0.14, vol: 0.16, delay: d }));
    },
    ohyeah() {
      // two syllables "OH - YEAH"
      tone({ type: 'sawtooth', f0: 300, f1: 360, dur: 0.14, vol: 0.14, attack: 0.02 });
      tone({ type: 'sawtooth', f0: 420, f1: 520, dur: 0.3, vol: 0.16, delay: 0.15, attack: 0.02, vibrato: 7, vibratoDepth: 15 });
    },
    launch() { noise({ f0: 400, f1: 4000, dur: 0.25, vol: 0.12, filter: 'bandpass' }); },
    flip() { tone({ type: 'triangle', f0: 500, f1: 1000, dur: 0.1, vol: 0.1 }); },
    goldship() {
      // smug "hehehe"
      [0, 0.11, 0.22].forEach((d) => tone({ type: 'square', f0: 520, f1: 440, dur: 0.09, vol: 0.14, delay: d }));
    },
    cheer() {
      [0, 0.1, 0.2, 0.3].forEach((d, i) => tone({ type: 'triangle', f0: [523, 659, 784, 1046][i], dur: 0.22, vol: 0.16, delay: d }));
    },
    cloutLow() { tone({ type: 'sine', f0: 220, f1: 200, dur: 0.12, vol: 0.14 }); },
    pick() { tone({ type: 'square', f0: 880, f1: 1760, dur: 0.1, vol: 0.14 }); },
    click() { tone({ type: 'square', f0: 600, dur: 0.04, vol: 0.08 }); },
    gameover() {
      [0, 0.25, 0.5, 0.75].forEach((d, i) => tone({ type: 'sawtooth', f0: [392, 349, 311, 262][i], dur: 0.32, vol: 0.14, delay: d }));
      noise({ f0: 1200, f1: 100, dur: 1.2, vol: 0.12, delay: 0.8 });
    },
    record() {
      [0, 0.1, 0.2, 0.3, 0.45].forEach((d, i) => tone({ type: 'square', f0: [523, 659, 784, 1046, 1318][i], dur: 0.25, vol: 0.16, delay: d }));
    },
    revive() { tone({ type: 'sine', f0: 200, f1: 1200, dur: 0.6, vol: 0.2 }); },
  };

  function play(name, arg) {
    try { if (SFX[name]) SFX[name](arg); } catch (e) { /* ignore audio errors */ }
  }

  // ---- music: tiny step sequencer -------------------------------------------
  // Per-biome patterns: 16 steps, bass + lead (semitone offsets from root), root freq.
  const PATTERNS = {
    street: { root: 110, bass: [0, 0, 7, 0, 5, 0, 7, 7, 0, 0, 7, 0, 3, 3, 5, 7], lead: [12, -1, 15, 12, -1, 19, 17, -1, 12, -1, 15, 12, 19, -1, 17, 15] },
    farm:   { root: 130.8, bass: [0, 0, 0, 7, 0, 0, 0, 7, 5, 5, 5, 7, 3, 3, 5, 7], lead: [12, 12, 16, 12, 19, -1, 16, 12, 17, 17, 16, 14, 12, -1, 14, 16] },
    gym:    { root: 98, bass: [0, 0, 0, 0, 3, 3, 3, 3, 5, 5, 5, 5, 7, 7, 10, 7], lead: [12, -1, 12, 15, -1, 12, 15, 17, -1, 17, 15, 12, -1, 10, 12, -1] },
    void:   { root: 123.5, bass: [0, -1, 0, -1, 7, -1, 7, -1, 5, -1, 5, -1, 3, -1, 3, -1], lead: [12, 19, 24, 19, 12, 19, 24, 19, 10, 17, 22, 17, 8, 15, 20, 15] },
  };

  function scheduleStep(time, step, pat, root) {
    const c = A.ctx;
    const dest = A.musicGain;
    const bass = pat.bass[step], lead = pat.lead[step];
    if (bass >= 0) {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'triangle'; o.frequency.value = root * Math.pow(2, bass / 12);
      g.gain.setValueAtTime(0.28, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      o.connect(g); g.connect(dest); o.start(time); o.stop(time + 0.22);
    }
    if (lead >= 0) {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'square'; o.frequency.value = root * 2 * Math.pow(2, lead / 12);
      g.gain.setValueAtTime(0.09, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
      o.connect(g); g.connect(dest); o.start(time); o.stop(time + 0.16);
    }
    // hat on even steps, kick on 0/8
    if (step % 2 === 0) {
      const src = c.createBufferSource(); src.buffer = noiseBuf; const g = c.createGain(); const f = c.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 6000;
      g.gain.setValueAtTime(step % 4 === 0 ? 0.08 : 0.04, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      src.connect(f); f.connect(g); g.connect(dest); src.start(time); src.stop(time + 0.05);
    }
    if (step % 8 === 0 || step === 10) {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, time); o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
      g.gain.setValueAtTime(0.5, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
      o.connect(g); g.connect(dest); o.start(time); o.stop(time + 0.16);
    }
  }

  function musicTick() {
    const M = A.music;
    if (!M.playing || !A.unlocked) return;
    if (!noiseBuf) noise({ vol: 0.0001, dur: 0.01 }); // ensure buffer exists
    const c = A.ctx;
    const stepDur = 60 / M.tempo / 4;
    if (M.nextTime < c.currentTime) M.nextTime = c.currentTime + 0.05; // stalled: drop the missed steps instead of firing them all at once
    while (M.nextTime < c.currentTime + 0.25) {
      const pat = PATTERNS[M.biome] || PATTERNS.street;
      scheduleStep(M.nextTime, M.step % 16, pat, pat.root);
      M.step++;
      M.nextTime += stepDur;
    }
  }

  function startMusic(biome) {
    if (!A.unlocked) return;
    const M = A.music;
    M.biome = biome || M.biome;
    if (M.playing) return;
    M.playing = true; M.step = 0; M.nextTime = A.ctx.currentTime + 0.05;
    if (M.timer) clearInterval(M.timer);
    M.timer = setInterval(musicTick, 80);
  }
  function stopMusic() {
    const M = A.music;
    M.playing = false;
    if (M.timer) { clearInterval(M.timer); M.timer = null; }
  }
  function setBiome(biome) { A.music.biome = biome; }
  function setTempo(t) { A.music.tempo = t; }
  // speed read: lowpass opens from 800 Hz at 12 m/s to 8 kHz at 22 m/s
  function setSpeed(v) {
    if (!A.unlocked || !A.musicFilter) return;
    const t = Math.max(0, Math.min(1, (v - 12) / 10));
    const f = 800 * Math.pow(10, t); // 800 -> 8000 (log sweep)
    A.musicFilter.frequency.setTargetAtTime(f, A.ctx.currentTime, 0.08);
  }

  BH.audio = { unlock, play, setMuted, startMusic, stopMusic, setBiome, setTempo, setSpeed, state: A };
})();

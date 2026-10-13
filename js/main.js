/* BOX HORSE — bootstrap: save data, input, run flow, attract mode, loop, test hooks. */
(function () {
  'use strict';
  const BH = (window.BH = window.BH || {});
  const { Game, C, STEP } = BH.game;
  const SAVE_KEY = 'boxhorse.save.v1';
  const TAU = Math.PI * 2;

  function defaultSave() {
    return { v: 1, followers: 0, bestLikes: 0, bestDist: 0, bestCombo: 0, bestScream: 0, runs: 0, unlocks: { tann: true }, hats: { none: true }, char: 'tann', hat: 'none', muted: false, daily: { date: '', likes: 0, dist: 0 }, milestones: {} };
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const s = Object.assign(defaultSave(), JSON.parse(raw));
      s.unlocks = Object.assign({ tann: true }, s.unlocks || {}); s.hats = Object.assign({ none: true }, s.hats || {}); s.milestones = s.milestones || {};
      if (!BH.sprites.CHARACTERS[s.char] || !s.unlocks[s.char]) s.char = 'tann';
      if (!s.hats[s.hat]) s.hat = 'none';
      return s;
    } catch (e) { return defaultSave(); }
  }

  // Can this device draw 啊? Compare it against a private-use glyph (guaranteed tofu).
  function detectCJK() {
    try {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const font = 'bold 24px ' + BH.render.SUB_FONT;
      const render = (ch) => { ctx.clearRect(0, 0, 32, 32); ctx.font = font; ctx.fillStyle = '#000'; ctx.fillText(ch, 2, 26); return ctx.getImageData(0, 0, 32, 32).data; };
      const a = render('啊'), b = render('');
      for (let i = 0; i < a.length; i += 4) if (a[i + 3] !== b[i + 3]) return true;
      return false;
    } catch (e) { return true; }
  }

  // ---- autopilot (attract mode + bots) --------------------------------------
  function timeToLand(game, maxT, holding) {
    const r = game.rider, T = game.terrain;
    const g = C.G * game.char.airGrav * (game.perks.feather ? 0.8 : 1) * (holding ? 1 + C.DIVE_AIR * (game.perks.heavy ? 1.25 : 1) : 1);
    let x = r.x, y = r.y - C.RIDER_LIFT, vx = r.vx, vy = r.vy, t = 0;
    const dt = 0.04;
    while (t < (maxT || 5)) {
      vy -= g * dt; x += vx * dt; y += vy * dt; t += dt;
      if (y <= T.heightAt(x)) return t;
    }
    return t;
  }
  function autopilot(game, opts) {
    opts = opts || {};
    const r = game.rider, T = game.terrain;
    if (r.grounded) {
      const slope = T.slopeAt(r.x);
      if (opts.sticky && slope > -0.06 && slope < 0.02 && r.s > 24) return true;
      return slope < -0.06;
    }
    if (opts.tricks === false) return false;
    const tl = timeToLand(game, 4, true);
    const spin = Math.abs(r.spin);
    const left = Math.ceil(spin / TAU + 0.02) * TAU - spin;
    const spinUp = Math.max(0, (C.SPIN_MAX - r.angVel) / C.SPIN_ACCEL);
    const need = spinUp * 0.5 + left / C.SPIN_MAX + (opts.margin == null ? 0.35 : opts.margin);
    return r.airTime > 0.08 && tl > need + 0.1;
  }
  const POLICIES = {
    auto: (g) => autopilot(g, {}),
    safe: (g) => autopilot(g, { tricks: false }),
    greedy: (g) => autopilot(g, { margin: 0.15 }),
    sticky: (g) => autopilot(g, { sticky: true }),
    hold: () => true,
    never: () => false,
    spam: (g) => Math.floor(g.time * 4) % 2 === 0,
    // a human-ish diver: reacts late and sometimes misses the release
    sloppy: (g) => { const r = g.rider; const s = g.terrain.slopeAt(r.x - Math.max(1, r.s * 0.18)); if (!r.grounded) return r.airTime < 0.3 && g.fxRng() < 0.3; return s < -0.06; },
    random: (g) => (g._rndHold == null || Math.floor(g.time * 10) !== g._rndTick) ? (g._rndTick = Math.floor(g.time * 10), g._rndHold = g.fxRng() < 0.5) : g._rndHold,
  };

  // Headless simulation for balance testing. Returns summary + events + timeline.
  function simulate(opts) {
    opts = opts || {};
    const policy = typeof opts.policy === 'function' ? opts.policy : (POLICIES[opts.policy] || POLICIES.auto);
    const perkPolicy = typeof opts.perkPolicy === 'function' ? opts.perkPolicy : (choices, game) => {
      if (opts.perkPolicy === 'first') return 0;
      if (Array.isArray(opts.perkPolicy)) { const idx = choices.findIndex((c) => opts.perkPolicy.includes(c.id)); return idx >= 0 ? idx : 0; }
      return Math.floor(game.fxRng() * choices.length);
    };
    const game = new Game({ seed: opts.seed == null ? 12345 : opts.seed >>> 0, mode: 'sim', charId: opts.charId || 'tann', hat: 'none' });
    const maxTime = opts.maxTime || 240;
    const timeline = [];
    let nextSample = 0;
    while (game.state !== 'over' && game.time < maxTime) {
      if (game.state === 'perk') game.choosePerk(perkPolicy(game.perkChoices, game));
      game.setInput(policy(game));
      game.tickReal(STEP * (game.grace ? 1 / C.GRACE_SCALE : 1)); // grace counts real seconds while sim runs at half speed
      game.step(STEP);
      game.hitStop = 0;
      game._decayFx(STEP);
      if (game.time >= nextSample) {
        nextSample += 1;
        timeline.push({ t: Math.round(game.time), x: Math.round(game.rider.x), spd: +Math.hypot(game.rider.vx, game.rider.vy).toFixed(1), clout: Math.round(game.clout), combo: game.combo, likes: game.likes, air: !game.rider.grounded });
      }
    }
    const summary = game.summary();
    summary.timedOut = game.state !== 'over';
    summary.followersEarned = followersFor(game, {});
    return { summary, events: game.events.slice(), timeline };
  }

  // followers: a flat base, a slice of likes and distance, and one-time milestones
  function followersFor(game, ms) {
    let f = 5 + Math.floor(game.likes / 30) + Math.floor(game.distance / 50);
    const got = [];
    const add = (k, label) => { if (!ms[k]) { got.push([k, label]); f += 50; } };
    if (game.distance >= 1000) add('km', 'first 1,000 m');
    if (game.biome === 'void' || game.tier > 0 || game.distance >= 1800) add('void', 'reached society');
    if (game.maxCombo >= 50) add('combo50', 'combo x50');
    if (game.flips >= 10) add('flips10', '10 flips');
    if (game.mode === 'daily') add('daily', 'first daily');
    if (game.clutches > 0) add('clutch', 'first clutch');
    followersFor.last = got;
    return f;
  }

  // ---- App --------------------------------------------------------------------
  class App {
    constructor() {
      this.save = loadSave();
      this.cjk = detectCJK();
      BH.sprites.cjk = this.cjk;
      this.pointers = new Set();
      this.restartFrom = null;
      this.canvas = document.getElementById('game');
      this.renderer = new BH.render.Renderer(this.canvas);
      this.ui = new BH.ui.UI(this);
      this.game = null; this.mode = 'menu';
      this.overShown = false; this.overSince = 0;
      this.held = false; this.last = performance.now();
      this.newAttract();
      BH.audio.setMuted(this.save.muted);
      this.bindInput();
      this.ui.show('title');
      requestAnimationFrame((t) => this.loop(t));
    }
    newAttract() {
      this.attract = new Game({ seed: BH.rng.hashString('attract' + Math.floor(Math.random() * 1e6)), mode: 'attract', charId: this.save.char, hat: this.save.hat, cjk: this.cjk });
    }
    persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* private mode etc. */ } }
    toggleMute() { this.save.muted = !this.save.muted; BH.audio.setMuted(this.save.muted); this.persist(); }

    startRun(mode) {
      BH.audio.unlock(); BH.audio.startMusic('street');
      const d = BH.rng.dailySeed();
      const seed = mode === 'daily' ? d.seed : (Math.floor(Math.random() * 4294967296) >>> 0);
      if (mode === 'daily' && this.save.daily.date !== d.key) this.save.daily = { date: d.key, likes: 0, dist: 0 };
      this.game = new Game({ seed, mode, dailyKey: mode === 'daily' ? d.key : null, charId: this.save.char, hat: this.save.hat, showHint: this.save.runs < 3, cjk: this.cjk });
      this.game.on('perkOffer', () => this.ui.showPerks(this.game));
      this.game.on('perk', () => this.ui.hideAll()); // the timeout auto-pick must close the DOM picker too
      this.game.on('gameover', (e) => this.onGameOver(e));
      this.mode = 'playing'; this.overShown = false; this.held = false;
      this.ui.hideAll();
      BH.audio.setBiome('street'); BH.audio.setTempo(148);
    }
    onGameOver() {
      const sv = this.save; const g = this.game;
      sv.runs++;
      const followers = followersFor(g, sv.milestones);
      for (const [k] of followersFor.last) sv.milestones[k] = true;
      sv.followers += followers;
      const newLikes = g.likes > sv.bestLikes; const newDist = g.distance > sv.bestDist;
      if (newLikes) sv.bestLikes = g.likes; if (newDist) sv.bestDist = Math.round(g.distance);
      if (g.maxCombo > sv.bestCombo) sv.bestCombo = g.maxCombo;
      if (g.longestScream > (sv.bestScream || 0)) sv.bestScream = g.longestScream;
      if (g.mode === 'daily') { if (sv.daily.date !== g.dailyKey) sv.daily = { date: g.dailyKey, likes: 0, dist: 0 }; sv.daily.likes = Math.max(sv.daily.likes, g.likes); sv.daily.dist = Math.max(sv.daily.dist, Math.round(g.distance)); }
      this.persist();
      this.lastResult = { followers, newLikes, newDist, milestones: followersFor.last };
    }
    pickPerk(i) { if (this.game && this.game.state === 'perk') { this.game.choosePerk(i); this.ui.hideAll(); } }
    pause() { if (this.mode === 'playing' && this.game && this.game.state !== 'over') { this.mode = 'paused'; this.held = false; this.game.setInput(false); this.ui.showPause(); } }
    resume() { if (this.mode === 'paused') { BH.audio.unlock(); BH.audio.startMusic(this.game.biome); this.mode = 'playing'; this.last = performance.now(); this.ui.hideAll(); if (this.game.state === 'perk') this.ui.showPerks(this.game); } }
    toMenu() { BH.audio.stopMusic(); this.mode = 'menu'; this.game = null; this.newAttract(); this.ui.show('title'); }
    shareText(game, result) {
      const scream = game.screamText(game.longestScream) || '(nothing)';
      return 'box horse · ' + (game.mode === 'daily' ? 'daily ' + game.dailyKey : 'endless') + '\n' +
        scream + '\n' +
        '💬 ' + game.comments + ' · ❤️ ' + game.likes.toLocaleString() + ' · 👤 +' + result.followers + '   |   💬 0 · ❤️ 0 · 👤 0\n' +
        Math.round(game.distance).toLocaleString() + ' m · we live in a society';
    }
    share(game, result, btn) {
      const txt = this.shareText(game, result);
      const done = () => { if (btn) { btn.textContent = 'copied'; setTimeout(() => (btn.textContent = 'copy'), 1500); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => this.fallbackCopy(txt, done));
      else this.fallbackCopy(txt, done);
    }
    fallbackCopy(txt, done) {
      try { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); } catch (e) { window.prompt('copy your run:', txt); }
    }

    setHeld(h) {
      this.held = h;
      if (this.mode === 'playing' && this.game) this.game.setInput(h);
    }
    canRestart() { return this.mode === 'playing' && this.game && this.game.state === 'over' && this.overShown && performance.now() - this.overSince > 1100; }
    bindInput() {
      const down = (e) => {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        BH.audio.unlock();
        if (this.canRestart()) { this.restartFrom = { x: e.clientX, y: e.clientY }; return; } // restart on the completed tap, so a scroll does not restart
        if (e.target && e.target.closest && e.target.closest('.card')) return;
        if (this.mode === 'playing') { this.pointers.add(e.pointerId); this.setHeld(true); if (e.cancelable) e.preventDefault(); }
      };
      const up = (e) => {
        const from = this.restartFrom; this.restartFrom = null;
        if (from && e.type === 'pointerup' && this.canRestart() && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 10) { this.startRun(this.game.mode); return; }
        this.pointers.delete(e.pointerId);
        if (this.pointers.size === 0) this.setHeld(false); // a second finger lifting must not release the first
      };
      window.addEventListener('pointerdown', down, { passive: false });
      window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      window.addEventListener('contextmenu', (e) => { if (e.target === this.canvas) e.preventDefault(); });
      window.addEventListener('keydown', (e) => {
        const k = e.code;
        if (k === 'KeyM' && !e.repeat) { this.toggleMute(); this.ui.refreshMute(); return; }
        if ((k === 'Escape' || k === 'KeyP') && !e.repeat) { if (this.mode === 'playing') this.pause(); else if (this.mode === 'paused') this.resume(); return; }
        if (this.mode === 'playing' && this.game && this.game.state === 'perk' && (k === 'Digit1' || k === 'Digit2' || k === 'Digit3')) { this.pickPerk(parseInt(k.slice(5), 10) - 1); return; }
        const isHold = k === 'Space' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'KeyW' || k === 'KeyS';
        if (isHold) e.preventDefault();
        if (e.repeat) return;
        if (this.mode === 'playing' && this.game && this.game.state === 'over') {
          if (this.canRestart() && (isHold || k === 'Enter')) this.startRun(this.game.mode);
          return;
        }
        if (this.mode === 'menu' && this.ui.current === 'title' && (k === 'Space' || k === 'Enter')) {
          if (!(e.target && e.target.closest && e.target.closest('button'))) this.startRun('endless'); // a focused button handles its own Enter
          return;
        }
        if (this.mode === 'playing' && isHold) { BH.audio.unlock(); this.setHeld(true); }
      });
      window.addEventListener('keyup', (e) => {
        const k = e.code;
        if (k === 'Space' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'KeyW' || k === 'KeyS') this.setHeld(false);
      });
      window.addEventListener('blur', () => { this.pointers.clear(); this.setHeld(false); this.pause(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden) { this.pointers.clear(); this.setHeld(false); this.pause(); BH.audio.stopMusic(); } });
      window.addEventListener('resize', () => this.renderer.resize());
    }

    loop(now) {
      let dt = (now - this.last) / 1000; this.last = now;
      if (!(dt > 0)) dt = 0; if (dt > 0.05) dt = 0.05;
      if (this.mode === 'playing' && this.game) {
        const g = this.game;
        g.update(dt);
        BH.audio.setSpeed(Math.hypot(g.rider.vx, g.rider.vy));
        if (g.state === 'perk') this.ui.updatePerkTimer(g);
        if (g.state === 'over' && !this.overShown && g.overTime > 0.9) {
          this.overShown = true; this.overSince = performance.now();
          this.ui.showGameOver(g, this.lastResult || { followers: 0 });
        }
        this.renderer.draw(g, dt);
      } else if (this.mode === 'paused' && this.game) {
        this.renderer.draw(this.game, 0);
      } else {
        const a = this.attract;
        a.setInput(POLICIES.auto(a));
        if (a.state === 'perk') a.choosePerk(Math.floor(a.fxRng() * 3));
        a.update(dt);
        if (a.state === 'over' && a.overTime > 1.5) this.newAttract();
        this.renderer.draw(a, dt, { attract: true });
      }
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  function boot() {
    const app = new App();
    window.BOXHORSE = { version: '1.1.0', app, BH, simulate, autopilot, POLICIES, C, STEP, followersFor,
      get game() { return app.game; },
      setInput(h) { app.setHeld(!!h); },
      start(mode) { app.startRun(mode || 'endless'); },
      summary() { return app.game ? app.game.summary() : null; },
    };
  }
  // boot now if the document is already parsed (hosted/injected pages), else on DOMContentLoaded
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* BOX HORSE — core simulation: rider physics, entities, scoring, clout, perks, subtitles.
 * Deterministic for a given seed + input sequence (fixed 120 Hz steps).
 * World units: meters, +y UP. The renderer flips y.
 */
(function () {
  'use strict';
  const BH = (window.BH = window.BH || {});
  const { Terrain, biomeAt, tierAt, boundariesBetween, biomeStartX } = BH.terrain;
  const CHARACTERS = BH.sprites.CHARACTERS;

  const STEP = 1 / 120;
  const TAU = Math.PI * 2;

  const C = {
    G: 22,                 // base gravity m/s^2
    DIVE_GROUND: 1.0,      // extra gravity multiplier while diving on the ground (x mass)
    DIVE_AIR: 0.45,        // extra gravity multiplier while diving (flipping) in the air
    FRICTION: 0.12,        // ground: dv = -FRICTION * v per second (linear drag caps top speed)
    AIR_DRAG: 0.02,
    MAX_SPEED: 40,
    STUCK_SPEED: 5, STUCK_TIME: 0.8, PUSH_ACCEL: 9, PUSH_UNTIL: 9,
    SPIN_ACCEL: 60,        // rad/s^2 while holding in the air: full spin speed in ~0.2 s
    SPIN_MAX: 12,          // rad/s: one flip in ~0.6 s of holding
    SPIN_DECAY: 10,        // per second when released (release = commit)
    AUTO_LEVEL: 4.5,       // per second: released box levels toward the predicted landing slope
    RIDER_R: 0.9,          // collision radius (m)
    RIDER_LIFT: 0.75,      // box center height above ground
    BOX_W_M: 2.0,          // rider box width in meters (visual + collision reference)
    MIN_AIR_FOR_LANDING: 0.18,
    SKETCHY_EXTRA: 20,     // degrees beyond the clean window that count as sketchy
    SKETCHY_SPEED: 0.8,
    BONK_SPEED: 0.6,
    PERFECT_BOOST: 1.15,
    STUN: 0.25,
    MERCY: 1.5,            // seconds after a bonk: stacks and Gold Ship are pass-through
    HITSTOP: { perfect: 0.04, smash: 0.07, bonk: 0.11, gegg: 0.025, goldship: 0.3, clutch: 0.12 },
    CLOUT_MAX: 100,
    CLOUT_DRAIN: 4.8,
    CLOUT_DRAIN_TIER: 2.4,     // the algorithm wants more every lap (a perfect diver must still lose eventually)
    CLOUT_SPEED_PAUSE: 18,
    CLOUT_PAUSE_TIER: 3.0,     // ...and faster every lap
    CLOUT_LOW: 25,
    CLOUT_EGG: 0.8, CLOUT_SPICY: 8, CLOUT_GEGG: 15, CLOUT_CHICKEN: 0.3, CLOUT_CLEAN: 3, CLOUT_PERFECT: 6, CLOUT_FLIP: 3, CLOUT_TEIO: 15, CLOUT_SMASH: 2,
    OVERFLOW_LIKES: 2,         // likes per point of clout gained above the cap (x mult)
    GRACE_TIME: 2.5, GRACE_SCALE: 0.5, PERK_SCALE: 0.12, CLUTCH_NEED: 5, CLUTCH_CLOUT: 15, CLUTCH_FREEZE: 2, CLUTCH_COOLDOWN: 30,
    COMBO_IDLE: 5.0, COMBO_DECAY_EVERY: 0.6,
    SMASH_BELOW_PAUSE: 3,      // smash threshold = pause threshold - 3 (one number to read)
    BOX_W: 1.3, BOX_H: 1.05,
    HARD_SPACING: 25,          // min meters between hard obstacles (stacks, Gold Ship)
    MULT_PER_COMBO: 0.05, MULT_CAP: 4,
    SPICY_ONE_IN: 8,
    STREAK_FREEZE: 5,          // three perfects in a row: drain freeze seconds
    SCREAM_MAX: 48,
  };

  const PERKS = [
    { id: 'magnet', name: 'Egg Magnet', emoji: '🧲', desc: 'Eggs come to you. The chickens were not consulted.' },
    { id: 'heavy', name: 'Premium Cardboard', emoji: '📦', desc: '+25% dive. It is the same box.' },
    { id: 'feather', name: 'Mostly Air', emoji: '🪶', desc: '-20% air gravity. The box was mostly air anyway.' },
    { id: 'insurance', name: 'Clout Insurance', emoji: '🛡️', desc: '-15% drain. Terms apply.' },
    { id: 'secondwind', name: 'Reupload', emoji: '💊', desc: 'If you get cancelled, come back at 50. Same content.', notFirst: true },
    { id: 'whisperer', name: '土鸡土鸡蛋蛋', latin: 'tu ji tu ji dan dan', emoji: '🐔', desc: 'Chickens x3. The song is louder.' },
    { id: 'smash', name: 'Boxes Are Free', emoji: '💥', desc: 'Box stacks break 30% easier.' },
    { id: 'goblin', name: 'Egg Content', emoji: '🥚', desc: '+50% clout from eggs.' },
    { id: 'trick', name: 'Flip Content', emoji: '🌀', desc: 'Flips are worth 2x. Each flip is a comment.' },
    { id: 'pact', name: 'She Likes You', emoji: '🤝', desc: "She still won't say anything. Shoves always go forward." },
    { id: 'softbonk', name: 'Soft Bonk', emoji: '😶', desc: 'Bonks do not touch your combo.' },
    { id: 'hack', name: 'Shadowban Lifted', emoji: '📈', desc: 'Drain pauses 3 m/s sooner.' },
    { id: 'ragebait', name: 'Ragebait', emoji: '🔥', desc: 'Likes x1.5. Drain x1.3.' },
    { id: 'clickbait', name: 'Clickbait', emoji: '🪝', desc: 'Combo multiplier caps at x6 instead of x4. Bonks reset it to 0.' },
    { id: 'doomscroll', name: 'Doomscroll', emoji: '📱', desc: 'Drain pauses 4 m/s sooner. Clout caps at 60.' },
  ];
  const PERK_BY_ID = {}; PERKS.forEach((p) => (PERK_BY_ID[p.id] = p));
  const FILLER = { id: 'filler', name: 'Sponsored Post', emoji: '💸', desc: '+30 clout now.', filler: true };

  function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.seed = opts.seed >>> 0;
      this.mode = opts.mode || 'endless';
      this.dailyKey = opts.dailyKey || null;
      // attract and sim games are silent: the title screen must not play SFX, bots must not touch audio
      this.audio = (this.mode === 'attract' || this.mode === 'sim') ? { play() {}, setBiome() {}, setTempo() {} } : BH.audio;
      this.charId = CHARACTERS[opts.charId] ? opts.charId : 'tann';
      this.char = CHARACTERS[this.charId];
      this.hat = opts.hat || 'none';
      this.cjk = opts.cjk !== false; // can the device draw 啊?
      this.rng = BH.rng.mulberry32(this.seed);
      this.terrain = new Terrain(this.rng.fork('terrain'));
      this.spawnRng = this.rng.fork('spawn');
      this.fxRng = this.rng.fork('fx');
      this.entities = [];
      this.particles = [];
      this.popups = [];
      this.events = [];
      this.listeners = {};
      this.state = 'playing'; // playing | perk | over
      this.time = 0; this.realTime = 0;
      this.acc = 0; this.hitStop = 0; this.timeScale = 1; this.shake = 0;
      this.held = false;
      this.rider = {
        x: -8, y: 0, vx: 0, vy: 0, s: 9, angle: 0, angVel: 0, grounded: true,
        airTime: 0, spin: 0, stun: 0, groundTime: 0, stuckT: 0, pushing: false,
        squashX: 1, squashY: 1, mercy: 0, lastAngles: [],
      };
      this.rider.y = this.terrain.heightAt(this.rider.x) + C.RIDER_LIFT;
      this.cam = { x: this.rider.x + 6, y: this.rider.y + 3, scale: 1, zoom: 1 };
      this.likes = 0; this.comments = 0; this.combo = 0; this.maxCombo = 0;
      this.clout = C.CLOUT_MAX; this.distance = 0;
      this.eggs = 0; this.chickens = 0; this.smashes = 0; this.bonks = 0; this.sketchies = 0; this.flips = 0; this.perfects = 0; this.cleans = 0;
      this.perfectStreak = 0; this.goldenBox = false;
      this.comboIdle = 0; this.comboDecayT = 0;
      this.perks = {}; this.perkChoices = null; this.perkTimer = 0; this.perkCount = 0;
      this.secondWindUsed = false;
      this.grace = null; this.graceCooldown = 0; this.drainFreeze = 0; this.clutches = 0;
      this.subtitle = null; this.subNote = null; this.subBlank = 0; this.forcedScream = 0; this.screamN = 0;
      this.longestScream = 0; this.subtitleOverflow = false;
      this.deathReason = null; this.deathLine = null; this.overTime = 0; this.lastBonkTime = -99;
      this.biome = 'street'; this.tier = 0; this.biomeIndex = 0;
      this.hint = opts.showHint ? 12 : 0;
      this.letterT = 0; this.cloutWarnT = 0; this.maxSpeed = 0; this.maxAir = 0; this.topHeight = 0;
      this.goldshipBoosts = 0; this.goldshipKicks = 0; this.goldshipJackpots = 0; this.flexes = 0;
      this.passenger = null; this.oneComment = false; this.trioSeen = false; this.chickenRain = 0;
      this.recentChickens = []; this.faceCam = 0; this.lastHardX = -100;
      this.terrain.onSegment((seg) => this._spawnForSegment(seg));
      this.terrain.ensure(this.rider.x + 260);
    }

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, data) {
      const e = Object.assign({ t: +this.time.toFixed(3), type: ev }, data || {});
      this.events.push(e); if (this.events.length > 4000) this.events.splice(0, 1000);
      const l = this.listeners[ev]; if (l) for (const fn of l) fn(e);
      const any = this.listeners['*']; if (any) for (const fn of any) fn(e);
    }

    hasPerk(id) { return !!this.perks[id]; }
    get mult() { return Math.min(this.perks.clickbait ? 6 : C.MULT_CAP, 1 + C.MULT_PER_COMBO * this.combo); }
    get pauseThreshold() { return C.CLOUT_SPEED_PAUSE + C.CLOUT_PAUSE_TIER * this.tier - (this.perks.hack ? 3 : 0) - (this.perks.doomscroll ? 4 : 0); }
    get drainRate() { return (C.CLOUT_DRAIN + C.CLOUT_DRAIN_TIER * this.tier) * (this.perks.insurance ? 0.85 : 1) * (this.perks.ragebait ? 1.3 : 1); }
    get cloutCap() { return this.perks.doomscroll ? 60 : C.CLOUT_MAX; }
    get smashThreshold() { return (this.pauseThreshold - C.SMASH_BELOW_PAUSE) * (this.perks.smash ? 0.7 : 1); }
    get feeding() { return Math.hypot(this.rider.vx, this.rider.vy) >= this.pauseThreshold; }
    setInput(h) { this.held = !!h; }

    // ---- text: the subtitle bar is the only text system ---------------------
    sub(text, hold, scale) { this.subtitle = { text, life: hold || 0.6, ttl: hold || 0.6, scale: scale || 1 }; }
    note(text, hold) { this.subNote = { text, life: hold || 1.2, ttl: hold || 1.2 }; }
    popup(x, y, text, color, size) { this.popups.push({ x, y, text, color: color || '#bbb', size: size || 1, life: 0.9, ttl: 0.9, vy: 2.2 }); }
    screamText(n) {
      if (!n) return '';
      const g = this.cjk ? this.char.glyph : this.char.latin;
      if (!g) return '';
      return g.repeat(Math.max(1, Math.ceil(n / g.length)));
    }

    addLikes(n) { if (this.state === 'over') return 0; const v = Math.round(n * (this.perks.ragebait ? 1.5 : 1)); this.likes += v; return v; }
    addClout(v) {
      if (this.state === 'over') return;
      if (this.grace) this.grace.gained += v;
      const cap = this.cloutCap;
      const room = cap - this.clout;
      if (v > room) {
        const over = v - Math.max(0, room);
        this.clout = cap;
        if (over > 0.5 && this.state !== 'over') {
          const l = this.addLikes(over * C.OVERFLOW_LIKES * this.mult);
          this.popup(this.rider.x, this.rider.y + 2.6, 'overflow +' + l, '#ddd', 0.7);
        }
      } else this.clout += v;
    }

    // ---- spawning ---------------------------------------------------------
    _chicken(x, extra) {
      const rng = this.spawnRng; const T = this.terrain;
      return Object.assign({ type: 'chicken', x, y: T.heightAt(x), r: 0.65, alive: true, color: rng.chance(0.6) ? 'brown' : 'white', t: rng.range(0, 10), home: x, dir: rng.chance(0.5) ? 1 : -1 }, extra || {});
    }
    _spawnForSegment(seg) {
      const rng = this.spawnRng;
      const T = this.terrain;
      const biome = seg.biome; const tier = tierAt(seg.x0);
      const dens = Math.min(2.5, 1 + 0.15 * tier);
      const goingDown = seg.y1 < seg.y0;
      const w = seg.x1 - seg.x0;
      // biome lines: the cheerleader stands there
      for (const k of boundariesBetween(seg.x0, seg.x1)) {
        const tx = biomeStartX(k);
        this.entities.push({ type: 'teio', x: tx, y: T.heightAt(tx), r: 1.2, alive: true, done: false, index: k });
      }
      if (seg.x0 < 50) return; // scripted opening stays clean
      const chickenDens = biome === 'farm' ? 1 : 0.3;
      if (goingDown && seg.kind === 'cos') {
        const pEgg = { street: 0.75, farm: 0.6, gym: 0.6, void: 0.55 }[biome];
        if (rng.chance(pEgg)) {
          const n = rng.int(3, 7); const t0 = rng.range(0.2, 0.5); const dt = Math.min(0.1, (0.9 - t0) / n);
          for (let i = 0; i < n; i++) {
            const x = seg.x0 + w * (t0 + dt * i);
            this.entities.push({ type: 'egg', x, y: T.heightAt(x) + 0.55, r: 0.45, alive: true, bob: rng.range(0, TAU), spicy: rng.chance(1 / C.SPICY_ONE_IN) });
          }
        }
        const nChick = rng.chance(0.8 * chickenDens * dens) ? (biome === 'farm' ? rng.int(1, 2) : 1) : 0;
        for (let i = 0; i < nChick; i++) this.entities.push(this._chicken(seg.x0 + w * rng.range(0.3, 0.9)));
      } else if (!goingDown && seg.kind !== 'flat') {
        // upslope: stacks (speed check), chickens, Gold Ship near the crest, egg arc over the crest
        const pBox = { street: 0.25, farm: 0.28, gym: 0.55, void: 0.4 }[biome] * dens;
        const bx = seg.x0 + w * rng.range(0.25, 0.6);
        if (bx - this.lastHardX >= C.HARD_SPACING && rng.chance(Math.min(0.85, pBox))) {
          const maxH = biome === 'street' ? (tier > 0 ? 2 : 1) : biome === 'gym' ? 3 : 2;
          const n = Math.min(3, rng.int(1, maxH + (tier > 1 ? 1 : 0)));
          this.entities.push({ type: 'boxes', x: bx, y: T.heightAt(bx), n, r: 0.8, alive: true });
          this.lastHardX = bx;
        }
        const nChick = rng.chance(0.9 * chickenDens * dens) ? (biome === 'farm' ? rng.int(1, 3) : 1) : 0;
        for (let i = 0; i < nChick; i++) this.entities.push(this._chicken(seg.x0 + w * rng.range(0.1, 0.8)));
        const pGold = { street: 0.05, farm: 0.06, gym: 0.09, void: 0.1 }[biome];
        const gx = seg.x1 + 4; // just past the crest: a launched rider is ~1 m up here, a grounded one meets her
        if (seg.x0 > 120 && gx - this.lastHardX >= C.HARD_SPACING && rng.chance(pGold)) {
          const trio = tier >= 2 && rng.chance(0.05);
          for (let i = 0; i < (trio ? 3 : 1); i++) {
            const x = gx + i * 2.3;
            // y is resolved lazily (needY): the next segment is not generated yet
            this.entities.push({ type: 'goldship', x, y: seg.y1, needY: true, r: 0.9, alive: true, done: false, trio });
          }
          this.lastHardX = gx;
        }
        const pArc = { street: 0.5, farm: 0.5, gym: 0.55, void: 0.6 }[biome];
        if (rng.chance(pArc)) {
          const crestX = seg.x1, crestY = seg.y1;
          const n = rng.int(4, 7); const lift = rng.range(2.2, 4.5) * (1 + 0.1 * Math.min(4, tier));
          const spread = rng.range(1.6, 2.4);
          for (let i = 0; i < n; i++) {
            const u = i / (n - 1);
            const x = crestX + 1 + i * spread;
            const y = crestY + 1.2 + lift * Math.sin(u * Math.PI) - u * u * 2.5;
            this.entities.push({ type: 'egg', x, y, r: 0.45, alive: true, bob: rng.range(0, TAU), air: true, spicy: rng.chance(1 / C.SPICY_ONE_IN) });
          }
          if ((biome === 'void' || tier > 0 || (biome === 'farm' && rng.chance(0.5))) && rng.chance(0.3)) {
            const x = crestX + 2 + (n / 2) * spread;
            this.entities.push({ type: 'gegg', x, y: crestY + lift * 1.6 - 4.5, r: 0.55, alive: true, bob: 0, air: true });
          }
        }
      }
      if (this.entities.length > 400) {
        const minX = this.rider.x - 80;
        this.entities = this.entities.filter((e) => e.x > minX);
      }
    }

    // ---- main update ------------------------------------------------------
    update(realDt) {
      realDt = clamp(realDt, 0, 0.05);
      this.realTime += realDt;
      if (this.hitStop > 0) { this.hitStop -= realDt; this._decayFx(realDt * 0.3); return; }
      this.tickReal(realDt);
      this.acc += realDt * this.timeScale;
      let n = 0;
      while (this.acc >= STEP && n < 12) { this.step(STEP); this.acc -= STEP; n++; }
      if (n === 12) this.acc = 0;
      this._decayFx(realDt);
      this._updateCamera(realDt);
    }

    // real-time timers (menus, grace, death animation)
    tickReal(dt) {
      if (this.state === 'perk') {
        this.perkTimer -= dt;
        if (this.perkTimer <= 0) this.choosePerk(0);
      }
      if (this.grace && this.state !== 'over') {
        this.grace.t -= dt;
        if (this.grace.gained >= C.CLUTCH_NEED) this._clutch();
        else if (this.grace.t <= 0) this._graceExpired();
      }
      if (this.state === 'over') this.overTime += dt;
    }

    _decayFx(dt) {
      this.shake = Math.max(0, this.shake - dt * 3.2);
      if (this.subtitle) { this.subtitle.life -= dt; if (this.subtitle.life <= 0) this.subtitle = null; }
      if (this.subNote) { this.subNote.life -= dt; if (this.subNote.life <= 0) this.subNote = null; }
      if (this.subBlank > 0) this.subBlank -= dt;
      if (this.forcedScream > 0) this.forcedScream -= dt;
      if (this.faceCam > 0) this.faceCam -= dt;
      if (this.hint > 0) this.hint -= dt;
      const r = this.rider;
      r.squashX += (1 - r.squashX) * Math.min(1, dt * 12); r.squashY += (1 - r.squashY) * Math.min(1, dt * 12);
      for (let i = this.popups.length - 1; i >= 0; i--) {
        const p = this.popups[i]; p.life -= dt; p.y += p.vy * dt; p.vy *= 0.96;
        if (p.life <= 0) this.popups.splice(i, 1);
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.vy -= (p.grav == null ? 12 : p.grav) * dt;
        const drag = p.drag == null ? 0.8 : p.drag;
        p.vx *= (1 - drag * dt); p.vy *= (1 - drag * dt);
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.rotV * dt;
        if (p.ground !== false && p.y < this.terrain.heightAt(p.x) + 0.05) { p.y = this.terrain.heightAt(p.x) + 0.05; p.vy *= -0.3; p.vx *= 0.7; p.rotV *= 0.5; }
      }
    }

    _updateCamera(dt) {
      const r = this.rider;
      const alt = r.y - this.terrain.heightAt(r.x);
      const speed = Math.hypot(r.vx, r.vy);
      const tx = r.x + clamp(r.vx * 0.42, 4, 15);
      const ty = r.y + 2.5 + Math.min(4, alt * 0.35);
      this.cam.x += (tx - this.cam.x) * (1 - Math.exp(-dt * 7));
      this.cam.y += (ty - this.cam.y) * (1 - Math.exp(-dt * 4.5));
      const targetZoom = 1 / (1 + Math.max(0, speed - 14) * 0.012 + Math.max(0, alt - 3) * 0.028);
      this.cam.zoom += (clamp(targetZoom, 0.5, 1) - this.cam.zoom) * (1 - Math.exp(-dt * 3));
    }

    // ---- fixed step -------------------------------------------------------
    step(dt) {
      this.time += dt;
      const r = this.rider; const T = this.terrain; const P = this.perks;
      const held = this.held && this.state !== 'over';
      const mass = this.char.mass;
      T.ensure(r.x + 260);
      if (r.stun > 0) r.stun -= dt;
      if (r.mercy > 0) r.mercy -= dt;
      if (this.drainFreeze > 0) this.drainFreeze -= dt;
      if (this.graceCooldown > 0) this.graceCooldown -= dt;
      if (this.chickenRain > 0) this.chickenRain -= dt;
      if (this.passenger) { this.passenger.t -= dt; if (this.passenger.t <= 0) { this.passenger = null; this.note('(she got out)', 1.2); } }

      if (r.grounded) {
        r.groundTime += dt;
        const theta = T.angleAt(r.x);
        const gEff = C.G * (held ? 1 + C.DIVE_GROUND * mass * (P.heavy ? 1.25 : 1) : 1);
        let a = -gEff * Math.sin(theta) - C.FRICTION * r.s;
        r.s += a * dt;
        // stuck rescue: crawling or rolling backwards for a while -> she paddles
        if (r.s < C.STUCK_SPEED) {
          r.stuckT += dt;
          if (r.stuckT > C.STUCK_TIME) {
            if (!r.pushing) { r.pushing = true; this.note('(pushing)', 1.0); this.emit('push'); }
            r.s += C.PUSH_ACCEL * dt;
          }
        } else if (r.s > C.PUSH_UNTIL) { r.stuckT = 0; r.pushing = false; }
        if (r.pushing && r.s < C.PUSH_UNTIL) r.s += (C.PUSH_ACCEL + Math.max(0, gEff * Math.sin(theta))) * dt; // paddling beats any slope
        r.s = clamp(r.s, -8, C.MAX_SPEED);
        const ct = Math.cos(theta), st = Math.sin(theta);
        r.vx = r.s * ct; r.vy = r.s * st;
        // launch test: on a convex crest the ground curves away; if following it would need more
        // centripetal acceleration than gravity's normal component provides, we leave the ground.
        const hh = 0.35;
        const ypp = (T.slopeAt(r.x + hh) - T.slopeAt(r.x - hh)) / (2 * hh);
        const yp = st / ct;
        const kappa = ypp / Math.pow(1 + yp * yp, 1.5);
        const needN = r.s * r.s * -kappa;
        const nx = r.x + r.vx * dt;
        if (needN > gEff * ct && r.s > 0) {
          r.grounded = false; r.airTime = 0; r.spin = 0; r.angVel = 0; r.lastAngles.length = 0;
          r.x = nx; r.y += r.vy * dt - 0.5 * gEff * dt * dt; r.vy -= gEff * dt;
          r.squashX = 0.85; r.squashY = 1.2;
          r.launchSfx = false;
          this.emit('launch', { s: +r.s.toFixed(2), x: +r.x.toFixed(1) });
        } else {
          r.x = nx;
          r.y = T.heightAt(nx) + C.RIDER_LIFT;
          const th2 = T.angleAt(r.x);
          r.vx = r.s * Math.cos(th2); r.vy = r.s * Math.sin(th2);
          r.angle += wrapAngle(th2 - r.angle) * Math.min(1, 18 * dt);
        }
      } else {
        r.airTime += dt;
        if (!r.launchSfx && r.airTime >= 0.25) {
          // a real launch, not a micro-hop: whoosh + a scream whose pitch tracks speed
          r.launchSfx = true;
          const sp = Math.hypot(r.vx, r.vy);
          this.audio.play('launch'); this.audio.play('scream', { dur: Math.min(1.2, 0.3 + sp / 40), speed: sp });
        }
        const gAir = C.G * this.char.airGrav * (P.feather ? 0.8 : 1) * (held ? 1 + C.DIVE_AIR * (P.heavy ? 1.25 : 1) : 1);
        r.vy -= gAir * dt;
        r.vx *= (1 - C.AIR_DRAG * dt); r.vy *= (1 - C.AIR_DRAG * dt);
        r.x += r.vx * dt; r.y += r.vy * dt;
        if (held) r.angVel = Math.min(C.SPIN_MAX, r.angVel + C.SPIN_ACCEL * dt);
        else r.angVel *= Math.max(0, 1 - C.SPIN_DECAY * dt);
        r.angle += r.angVel * dt; r.spin += r.angVel * dt;
        const landX = this._predictLandingX(gAir);
        if (!held && r.angVel < 1.5) {
          const want = T.angleAt(landX);
          r.angle += wrapAngle(want - r.angle) * Math.min(1, C.AUTO_LEVEL * dt);
        }
        // ring buffer of recent angles: a slightly late release is forgiven at touchdown
        r.lastAngles.push(r.angle); if (r.lastAngles.length > 7) r.lastAngles.shift();
        const alt = r.y - C.RIDER_LIFT - T.heightAt(r.x);
        if (alt > this.topHeight) this.topHeight = alt;
        const gy2 = T.heightAt(r.x);
        if (r.y - C.RIDER_LIFT <= gy2) {
          r.y = gy2 + C.RIDER_LIFT;
          const theta = T.angleAt(r.x);
          const tx = Math.cos(theta), ty = Math.sin(theta);
          const sTan = r.vx * tx + r.vy * ty;
          const sNorm = -r.vx * ty + r.vy * tx;
          if (r.airTime >= C.MIN_AIR_FOR_LANDING) this._judgeLanding(theta, sTan, sNorm);
          else r.s = sTan;
          r.grounded = true; r.groundTime = 0;
          if (r.airTime > this.maxAir) this.maxAir = r.airTime;
          r.airTime = 0; r.spin = 0; r.angVel = 0; r.angle = theta; r.lastAngles.length = 0;
          r.vx = r.s * tx; r.vy = r.s * ty;
        }
        if (r.y > T.heightAt(r.x) + 400) { r.y = T.heightAt(r.x) + 400; r.vy = Math.min(r.vy, 0); }
      }

      const speed = Math.hypot(r.vx, r.vy);
      if (speed > this.maxSpeed) this.maxSpeed = speed;
      if (this.state !== 'over' && r.x > this.distance) this.distance = r.x;

      // biome / tier tracking
      const b = biomeAt(Math.max(0, r.x)); const tier = tierAt(Math.max(0, r.x));
      if (b !== this.biome || tier !== this.tier) {
        const first = this.biome !== b;
        this.biome = b; this.tier = tier; this.audio.setBiome(b); this.audio.setTempo(148 + tier * 10);
        if (b === 'gym') this.audio.play('bell');
        if (first && tier > 0 && b === 'street') this.note('(lap ' + (tier + 1) + ')', 1.5);
        this.emit('biome', { biome: b, tier });
      }

      // scream length is physics
      let n = (r.grounded && speed < 8) ? 0 : clamp(Math.round(speed / 2.5) + Math.round(r.airTime * 6) + (held ? 2 : 0), 1, C.SCREAM_MAX);
      if (this.forcedScream > 0) n = Math.max(n, this.forcedN || 24);
      if (this.state === 'over' || this.subBlank > 0) n = 0;
      this.screamN = n;
      if (n > this.longestScream) this.longestScream = n;

      // clout
      if (this.state !== 'over') {
        if (!this.grace && this.drainFreeze <= 0 && speed < this.pauseThreshold) this.clout -= this.drainRate * dt;
        if (this.clout <= 0 && !this.grace) {
          this.clout = 0;
          if (this.graceCooldown > 0) this._graceExpired(); // no second grace so soon: it is over (unless Reupload)
          else this._enterGrace();
        }
        if (this.clout < C.CLOUT_LOW && !this.grace) {
          this.cloutWarnT += dt;
          if (this.cloutWarnT > 1.0) { this.cloutWarnT = 0; this.audio.play('heartbeat'); }
        }
        this.comboIdle += dt;
        if (this.combo > 0 && this.comboIdle > C.COMBO_IDLE) {
          this.comboDecayT += dt;
          if (this.comboDecayT > C.COMBO_DECAY_EVERY) { this.comboDecayT = 0; this.combo--; }
        }
        // set piece: she got one comment
        if (!this.oneComment && this.biome === 'void' && this.likes >= 1500) { this.oneComment = true; this.note('(she got one comment)', 2.5); this.emit('oneComment'); }
      }

      // letter trail when fast or airborne (motion read; the bar is the text)
      this.letterT -= dt;
      const glyph = this.cjk ? this.char.glyph : this.char.latin;
      if (glyph && this.letterT <= 0 && (speed > 19 || (!r.grounded && r.airTime > 0.25)) && this.state !== 'over') {
        this.letterT = 0.14;
        const ch = glyph[Math.floor(this.fxRng() * glyph.length)];
        this.particles.push({ kind: 'letter', text: ch, x: r.x - 0.8, y: r.y + 0.9 + this.fxRng() * 0.6, vx: -speed * 0.25 + this.fxRng() * 2, vy: 2 + this.fxRng() * 3, life: 0.8, ttl: 0.8, rot: this.fxRng() * 0.6 - 0.3, rotV: 0, grav: 2, drag: 0.5, ground: false, size: 0.9 + this.fxRng() * 0.5 });
      }
      if (r.grounded && speed > 10 && this.fxRng() < 0.35) {
        this.particles.push({ kind: 'dust', x: r.x - 0.6, y: r.y - 0.5, vx: -2 - this.fxRng() * 3, vy: 1 + this.fxRng() * 2, life: 0.45, ttl: 0.45, rot: 0, rotV: 0, grav: 1, drag: 1.5, ground: false, size: 0.25 + this.fxRng() * 0.25 });
      }

      this._updateEntities(dt);
    }

    _predictLandingX(g) {
      const r = this.rider, T = this.terrain;
      if (this._predT === this.time) return this._predX;
      let x = r.x, y = r.y - C.RIDER_LIFT, vx = r.vx, vy = r.vy;
      const dt = 0.05;
      for (let i = 0; i < 70; i++) {
        vy -= g * dt; x += vx * dt; y += vy * dt;
        if (y <= T.heightAt(x)) break;
      }
      this._predT = this.time; this._predX = x;
      return x;
    }

    _judgeLanding(theta, sTan, sNorm) {
      const r = this.rider; const P = this.perks;
      // best angle over the last ~60 ms of flight (late-release forgiveness)
      let diff = Math.abs(wrapAngle(r.angle - theta));
      for (const a of r.lastAngles) { const d = Math.abs(wrapAngle(a - theta)); if (d < diff) diff = d; }
      diff = diff * 180 / Math.PI;
      const flips = Math.floor(Math.abs(r.spin) / TAU + 0.08);
      const win = this.char.landWindow, pwin = this.char.perfectWindow;
      if (this.state === 'over') { r.s = sTan * 0.8; return; }
      if (diff <= win) {
        r.s = Math.max(sTan, 0);
        const perfect = diff <= pwin && theta < -0.05;
        if (flips > 0) {
          const worth = this.addLikes(20 * flips * this.mult * (P.trick ? 2 : 1));
          this.comments += flips; this.flips += flips;
          this.addClout(C.CLOUT_FLIP * flips);
          this.popup(r.x, r.y + 2.2, (flips > 1 ? flips + ' flips +' : 'flip +') + worth, '#ddd', 0.9);
          this.bumpCombo(flips);
          this.audio.play('flip');
        }
        if (perfect) {
          r.s = Math.min(C.MAX_SPEED, r.s * C.PERFECT_BOOST); this.perfects++; this.perfectStreak++;
          this.addClout(C.CLOUT_PERFECT);
          this.sub(this.cjk ? '哦耶' : 'oh yeah', 0.8, 1.1);
          this.bumpCombo(1); this.audio.play('perfect');
          this.hitStop = Math.max(this.hitStop, C.HITSTOP.perfect);
          if (this.biome === 'gym') this.faceCam = 0.32;
          if (this.perfectStreak === 3) { this.drainFreeze = C.STREAK_FREEZE; this.note('(three in a row)', 1.5); if (!this.passenger) { this.passenger = { t: 10 }; this.note('(she got in the box)', 1.6); } }
          if (this.perfectStreak === 5 && !this.goldenBox) { this.goldenBox = true; this.note('(golden box)', 1.5); }
          this.emit('land', { kind: 'perfect', flips, diff: +diff.toFixed(1), s: +r.s.toFixed(1) });
        } else {
          this.cleans++; this.perfectStreak = 0;
          this.addClout(C.CLOUT_CLEAN);
          this.sub(this.cjk ? '哦耶' : 'oh yeah', 0.6, 1);
          this.bumpCombo(1); this.audio.play(flips > 0 ? 'ohyeah' : 'land');
          this.emit('land', { kind: 'clean', flips, diff: +diff.toFixed(1), s: +r.s.toFixed(1) });
        }
        r.squashX = 1.25; r.squashY = 0.8;
        this.burst(r.x, r.y - 0.5, 'dust', 6);
      } else if (diff <= win + C.SKETCHY_EXTRA) {
        // sketchy: the near miss. speed x0.8, combo kept, no clout.
        r.s = Math.max(0, sTan) * C.SKETCHY_SPEED; this.sketchies++; this.perfectStreak = 0;
        this.sub(this.cjk ? '哎呀' : 'woah', 0.5, 0.9);
        r.squashX = 1.4; r.squashY = 0.7; r.wobble = 0.5;
        this.audio.play('woah');
        this.burst(r.x, r.y - 0.5, 'dust', 4);
        this.emit('land', { kind: 'sketchy', flips, diff: +diff.toFixed(1), s: +r.s.toFixed(1) });
      } else {
        this.bonk('land', { diff: +diff.toFixed(1), sNorm: +sNorm.toFixed(1) });
        r.s = Math.max(0, sTan) * C.BONK_SPEED;
      }
    }

    bonk(src, extra) {
      const r = this.rider;
      this.bonks++; this.perfectStreak = 0; this.lastBonkTime = this.time;
      if (this.perks.clickbait) this.combo = 0;
      else if (!this.perks.softbonk) this.combo = Math.floor(this.combo / 2);
      r.stun = C.STUN; r.mercy = C.MERCY;
      this.shake = Math.max(this.shake, 1.0); this.hitStop = Math.max(this.hitStop, C.HITSTOP.bonk);
      r.squashX = 1.6; r.squashY = 0.5;
      this.sub(this.cjk ? '啊' : 'a', 0.4, 0.6); this.subBlank = 0.8;
      this.audio.play('bonk'); this.audio.play('scream', { dur: 0.45, speed: 8 });
      this.burst(r.x, r.y, 'spark', 8);
      if (this.passenger) { this.passenger = null; this.note('(she got out)', 1.2); }
      if (this.grace) this._graceExpired(); // a bonk ends grace; Reupload still honoured
      this.emit('bonk', Object.assign({ src }, extra || {}));
    }

    bumpCombo(n) {
      this.combo += n; this.comboIdle = 0; this.comboDecayT = 0;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }

    burst(x, y, kind, n, color) {
      for (let i = 0; i < n; i++) {
        const a = this.fxRng() * TAU, sp = 2 + this.fxRng() * 6;
        this.particles.push({ kind, color, x, y, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + 2, life: 0.6 + this.fxRng() * 0.7, ttl: 1.2, rot: this.fxRng() * TAU, rotV: (this.fxRng() - 0.5) * 12, size: 0.3 + this.fxRng() * 0.3, grav: kind === 'feather' ? 3 : 14, drag: kind === 'feather' ? 1.6 : 0.6 });
      }
    }

    _hitChicken(e, speed) {
      e.alive = false; this.chickens++;
      const worth = this.addLikes(15 * this.mult * (this.perks.whisperer ? 3 : 1));
      this.addClout(C.CLOUT_CHICKEN);
      this.bumpCombo(1);
      this.recentChickens.push(this.time); this.recentChickens = this.recentChickens.filter((t) => this.time - t < 2);
      if (this.recentChickens.length >= 3) { this.sub(this.cjk ? '土鸡土鸡蛋蛋' : 'tu ji tu ji dan dan', 1.2, 1); this.recentChickens.length = 0; }
      else if (this.chickenRain <= 0) this.sub(this.cjk ? '土鸡' : 'tu ji', 0.5, 1);
      this.popup(e.x, e.y + 1.5, '+' + worth, '#ddd', 0.8);
      this.audio.play('chicken');
      this.burst(e.x, e.y + 0.5, 'feather', 10, e.color === 'white' ? '#f6f2e6' : '#c9733f');
      this.particles.push({ kind: 'chicken', color: e.color, x: e.x, y: e.y + 0.5, vx: speed * 0.5 + 3, vy: 9 + this.fxRng() * 4, life: 2.5, ttl: 2.5, rot: 0, rotV: 9, size: 1, grav: 14, drag: 0.2, ground: false });
      this.emit('chicken');
    }

    _updateEntities(dt) {
      if (this.state === 'over') return; // the dead box rolls, but it does not score
      const r = this.rider; const T = this.terrain; const P = this.perks;
      const rx = r.x, ry = r.y;
      const speed = Math.hypot(r.vx, r.vy);
      const grounded = r.grounded;
      const rr = C.RIDER_R;
      for (let i = 0; i < this.entities.length; i++) {
        const e = this.entities[i];
        if (!e.alive) continue;
        const dx = e.x - rx;
        if (dx < -30) { e.alive = false; continue; }
        if (dx > 60 && !e.falling) continue;
        switch (e.type) {
          case 'egg':
          case 'gegg': {
            if (e.air && !e.placed) { e.placed = true; const gy = T.heightAt(e.x) + 0.55; if (e.y < gy) e.y = gy; }
            if (P.magnet) {
              const dy0 = e.y - ry; const d = Math.hypot(dx, dy0);
              if (d < 2.5 && d > 0.01) { const pull = 18 * dt / d; e.x -= dx * pull; e.y -= dy0 * pull; }
            }
            const dy = e.y - ry;
            if (dx * dx + dy * dy < (e.r + rr) * (e.r + rr)) {
              e.alive = false;
              if (e.type === 'egg') {
                if (e.spicy) {
                  const worth = this.addLikes(10 * this.mult);
                  this.eggs++; this.addClout(C.CLOUT_SPICY * (P.goblin ? 1.5 : 1)); this.bumpCombo(3);
                  this.popup(e.x, e.y + 0.6, '+' + worth, '#ff6b6b', 0.9); this.note('(spicy egg)', 0.9);
                  this.audio.play('goldenEgg'); this.burst(e.x, e.y, 'spark', 8, '#ff4d4d');
                  this.emit('egg', { air: !!e.air, spicy: true });
                } else {
                  const worth = this.addLikes(5 * this.mult);
                  this.eggs++; this.addClout(C.CLOUT_EGG * (P.goblin ? 1.5 : 1)); this.bumpCombo(1);
                  this.popup(e.x, e.y + 0.6, '+' + worth, '#ccc', 0.6);
                  this.audio.play('egg', this.combo); this.burst(e.x, e.y, 'heart', 2);
                  this.emit('egg', { air: !!e.air });
                }
              } else {
                const worth = this.addLikes(60 * this.mult);
                this.eggs++; this.addClout(C.CLOUT_GEGG); this.bumpCombo(3);
                this.sub(this.cjk ? '蛋蛋！' : 'dan dan!', 0.9, 1.2);
                this.popup(e.x, e.y + 0.8, '+' + worth, '#ffd34d', 1.1);
                this.audio.play('goldenEgg'); this.burst(e.x, e.y, 'spark', 14, '#ffd34d');
                this.shake = Math.max(this.shake, 0.4); this.hitStop = Math.max(this.hitStop, C.HITSTOP.gegg);
                if (this.biome === 'farm') this._chickenRain();
                this.emit('gegg');
              }
            }
            break;
          }
          case 'chicken': {
            e.t += dt;
            if (e.falling) {
              e.vy = (e.vy || 0) - C.G * 0.6 * dt; e.y += e.vy * dt;
              const gy = T.heightAt(e.x);
              if (e.y <= gy) { e.y = gy; e.falling = false; e.home = e.x; this.burst(e.x, e.y + 0.3, 'dust', 3); }
            } else {
              e.x += e.dir * 0.7 * dt;
              if (Math.abs(e.x - e.home) > 1.2) e.dir = -e.dir;
              e.y = T.heightAt(e.x);
            }
            const dy = (e.y + 0.5) - ry;
            if (dx * dx + dy * dy < (e.r + rr) * (e.r + rr)) this._hitChicken(e, speed);
            break;
          }
          case 'boxes': {
            const top = e.y + e.n * C.BOX_H;
            const riderBottom = ry - C.RIDER_LIFT;
            const overlapX = Math.abs(dx) < (C.BOX_W / 2 + rr * 0.8);
            if (overlapX && riderBottom < top - 0.1) {
              e.alive = false;
              if (r.mercy > 0) { this.burst(e.x, e.y + e.n * 0.5, 'card', 4); break; } // pass-through after a bonk
              if (speed >= this.smashThreshold || !grounded) {
                const worth = this.addLikes(10 * e.n * this.mult);
                this.smashes++;
                this.bumpCombo(1); this.addClout(C.CLOUT_SMASH * e.n);
                this.hitStop = Math.max(this.hitStop, C.HITSTOP.smash); this.shake = Math.max(this.shake, 0.5 + 0.2 * e.n);
                this.sub(this.cjk ? '啊啊啊' : 'AAA', 0.5, 1.3);
                this.popup(e.x, top + 0.8, '+' + worth, '#ddd', 0.9);
                this.audio.play('smash');
                this.burst(e.x, e.y + e.n * 0.5, 'card', 6 + 4 * e.n);
                this.emit('smash', { n: e.n, s: +speed.toFixed(1) });
              } else {
                this.bonk('boxes', { n: e.n, s: +speed.toFixed(1) });
                r.s *= 0.5; r.vx = r.s * Math.cos(T.angleAt(r.x)); r.vy = r.s * Math.sin(T.angleAt(r.x));
                this.burst(e.x, e.y + e.n * 0.5, 'card', 4 + 2 * e.n);
              }
            }
            break;
          }
          case 'goldship': {
            if (e.needY) { e.needY = false; e.y = T.heightAt(e.x); }
            if (e.done) break;
            if (e.trio && !this.trioSeen && dx < 40) { this.trioSeen = true; this.note('(three of them)', 2); }
            const dy = (e.y + 0.8) - ry;
            if (!grounded && Math.abs(dx) < 1.2 && ry - C.RIDER_LIFT > e.y + 1.0) {
              e.done = true; this.flexes++;
              const close = ry - C.RIDER_LIFT < e.y + 2.0;
              const worth = this.addLikes((close ? 60 : 30) * this.mult);
              this.bumpCombo(2);
              this.note(close ? "(she almost looked up)" : "(she didn't look up)", 1.4);
              this.popup(e.x, e.y + 3, '+' + worth, '#ddd', 0.9);
              this.emit('flex', { close });
            } else if (dx * dx + dy * dy < (e.r + rr) * (e.r + rr)) {
              e.done = true;
              if (r.mercy > 0) break;
              const roll = this.fxRng();
              this.hitStop = Math.max(this.hitStop, C.HITSTOP.goldship); this.shake = Math.max(this.shake, 0.8);
              this.burst(e.x, e.y + 1, 'card', 8);
              this.audio.play('smash');
              if (P.pact || roll < 0.7) {
                this.goldshipBoosts++;
                r.grounded = false; r.airTime = 0; r.spin = 0; r.angVel = 0; r.lastAngles.length = 0;
                const s = Math.min(C.MAX_SPEED, Math.max(speed * 1.35, speed + 9));
                r.vx = s * 0.86; r.vy = Math.min(13, s * 0.45 + 2); r.y += 0.3;
                this.forcedScream = 0.8; this.forcedN = 24; this.note('(good)', 1.2);
                this.audio.play('scream', { dur: 0.8, speed: s });
                this.emit('goldship', { outcome: 'boost' });
              } else if (roll < 0.9) {
                this.goldshipKicks++;
                r.s = speed * 0.7; r.vx = r.s * Math.cos(T.angleAt(r.x)); r.vy = r.s * Math.sin(T.angleAt(r.x));
                r.stun = C.STUN; r.squashX = 1.5; r.squashY = 0.6;
                this.sub(this.cjk ? '啊' : 'a', 0.4, 0.6); this.subBlank = 0.8; this.note('(bad)', 1.2);
                this.audio.play('bonk');
                this.emit('goldship', { outcome: 'shove' });
              } else {
                this.goldshipJackpots++;
                r.grounded = false; r.airTime = 0; r.spin = 0; r.angVel = 0; r.lastAngles.length = 0;
                const s = Math.min(C.MAX_SPEED, Math.max(speed * 1.2, speed + 6));
                r.vx = s * 0.7; r.vy = 17; r.y += 0.3;
                this.forcedScream = 1.4; this.forcedN = 48; this.note('(very good)', 1.6);
                this.audio.play('scream', { dur: 1.2, speed: 36 });
                this.emit('goldship', { outcome: 'jackpot' });
              }
            }
            break;
          }
          case 'teio': {
            if (e.done) break;
            if (rx >= e.x) {
              e.done = true;
              this.addClout(C.CLOUT_TEIO);
              this.sub(this.cjk ? '加油！' : 'go go!', 1.0, 1);
              this.audio.play('cheer'); this.burst(e.x, e.y + 1.5, 'heart', 10);
              this.emit('teio', { biome: biomeAt(e.x), tier: tierAt(e.x), index: e.index });
              if (this.state === 'playing') this._openPerks();
            }
            break;
          }
        }
      }
      if ((this.time * 120 | 0) % 240 === 0) this.entities = this.entities.filter((e) => e.alive);
    }

    _chickenRain() {
      const rng = this.spawnRng; const r = this.rider;
      this.chickenRain = 3;
      this.sub(this.cjk ? '土鸡土鸡蛋蛋' : 'tu ji tu ji dan dan', 3, 1.1);
      for (let i = 0; i < 12; i++) {
        const x = r.x + 6 + i * 2.2 + rng.range(-0.8, 0.8);
        this.entities.push(this._chicken(x, { falling: true, y: this.terrain.heightAt(x) + 12 + rng.range(0, 8), vy: 0 }));
      }
      this.emit('chickenRain');
    }

    // ---- grace / clutch ----------------------------------------------------------
    _enterGrace() {
      this.grace = { t: C.GRACE_TIME, gained: 0 };
      this.timeScale = C.GRACE_SCALE;
      this.sub('', 0.1); this.subBlank = 0;
      this.emit('grace');
    }
    _clutch() {
      this.grace = null; this.timeScale = this.state === 'perk' ? C.PERK_SCALE : 1; this.clutches++;
      this.clout = C.CLUTCH_CLOUT; this.drainFreeze = C.CLUTCH_FREEZE; this.graceCooldown = C.CLUTCH_COOLDOWN;
      this.note('(clutch)', 1.5); this.audio.play('clutch'); this.hitStop = Math.max(this.hitStop, C.HITSTOP.clutch);
      this.emit('clutch');
    }
    _graceExpired() {
      this.grace = null; this.timeScale = this.state === 'perk' ? C.PERK_SCALE : 1;
      if (this.perks.secondwind && !this.secondWindUsed) {
        this.secondWindUsed = true; this.clout = 50; this.graceCooldown = C.CLUTCH_COOLDOWN;
        this.note('(reuploaded)', 1.6); this.audio.play('revive');
        this.emit('revive');
      } else this._gameOver('clout');
    }

    // ---- perks --------------------------------------------------------------
    _openPerks() {
      if (this.grace) this._clutch(); // never let grace and the picker overlap (the cheer's +15 already clutches)
      const avail = PERKS.filter((p) => !this.perks[p.id] && !(p.notFirst && this.perkCount === 0));
      const rng = this.spawnRng;
      const choices = [];
      while (choices.length < 3 && avail.length) choices.push(avail.splice(Math.floor(rng() * avail.length), 1)[0]);
      while (choices.length < 3) choices.push(Object.assign({}, FILLER, { id: 'filler' + choices.length }));
      this.perkChoices = this.cjk ? choices : choices.map((p) => (p.latin ? Object.assign({}, p, { name: p.latin }) : p));
      this.perkTimer = 4.5; this.state = 'perk'; this.timeScale = C.PERK_SCALE;
      this.emit('perkOffer', { choices: choices.map((c) => c.id) });
    }
    choosePerk(i) {
      if (this.state !== 'perk' || !this.perkChoices) return;
      const p = this.perkChoices[clamp(i | 0, 0, this.perkChoices.length - 1)];
      if (p.filler) this.addClout(30); else this.perks[p.id] = true;
      this.perkCount++;
      this.perkChoices = null; this.state = 'playing'; this.timeScale = this.grace ? C.GRACE_SCALE : 1;
      this.note('(' + p.name + ')', 1.4); this.audio.play('pick');
      this.emit('perk', { id: p.id });
    }

    // ---- end ------------------------------------------------------------------
    _gameOver(reason) {
      if (this.state === 'over') return;
      const r = this.rider; const speed = Math.hypot(r.vx, r.vy);
      this.state = 'over'; this.deathReason = reason; this.timeScale = 1; this.held = false; this.grace = null;
      if (this.distance < 150) this.deathLine = 'Posted at 3 am. No one saw it.';
      else if (this.time - this.lastBonkTime < 1.2) this.deathLine = "Ratio'd by a hill.";
      else if (!r.grounded) this.deathLine = 'Lost signal mid-flip.';
      else if (speed < 5) this.deathLine = 'You stopped moving. So did they.';
      else this.deathLine = 'The algorithm moved on.';
      this.subtitle = null; this.subNote = null;
      this.audio.play('gameover');
      this.emit('gameover', { reason, likes: this.likes, distance: Math.round(this.distance), comments: this.comments, maxCombo: this.maxCombo, perks: Object.keys(this.perks) });
    }

    summary() {
      return {
        seed: this.seed, mode: this.mode, charId: this.charId, state: this.state, time: +this.time.toFixed(2),
        likes: this.likes, comments: this.comments, distance: Math.round(this.distance), clout: +this.clout.toFixed(1),
        combo: this.combo, maxCombo: this.maxCombo, eggs: this.eggs, chickens: this.chickens, smashes: this.smashes,
        bonks: this.bonks, sketchies: this.sketchies, flips: this.flips, perfects: this.perfects, cleans: this.cleans, perks: Object.keys(this.perks),
        biome: this.biome, tier: this.tier, maxSpeed: +this.maxSpeed.toFixed(1), maxAir: +this.maxAir.toFixed(2), topHeight: +this.topHeight.toFixed(1),
        goldshipBoosts: this.goldshipBoosts, goldshipKicks: this.goldshipKicks, goldshipJackpots: this.goldshipJackpots, flexes: this.flexes,
        clutches: this.clutches, longestScream: this.longestScream, deathReason: this.deathReason, deathLine: this.deathLine,
        rider: { x: +this.rider.x.toFixed(2), y: +this.rider.y.toFixed(2), s: +this.rider.s.toFixed(2), grounded: this.rider.grounded, speed: +Math.hypot(this.rider.vx, this.rider.vy).toFixed(2) },
      };
    }
  }

  BH.game = { Game, C, PERKS, PERK_BY_ID, STEP };
})();

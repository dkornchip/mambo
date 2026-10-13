/* BOX HORSE — procedural hill track.
 * World units are meters, y is UP. Track is an infinite sequence of smooth
 * cosine half-hills (crest -> trough -> crest ...) with a gentle global descent.
 * Biomes repeat in laps: street (400 m), farm, gym, void (700 m each).
 */
(function () {
  'use strict';
  const BH = (window.BH = window.BH || {});

  const BIOMES = ['street', 'farm', 'gym', 'void'];
  const BIOME_LENS = [400, 700, 700, 700];
  const LAP = BIOME_LENS.reduce((a, b) => a + b, 0);
  const CUM = [0]; for (let i = 0; i < BIOME_LENS.length; i++) CUM.push(CUM[i] + BIOME_LENS[i]);
  const MAX_AMP_TIER = 4; // amplitude stops growing after this tier; density and drain keep scaling

  // Per-biome hill parameters. widths in meters, drops in meters.
  const HILL = {
    street: { wd: [9, 16],  wu: [10, 17], drop: [3.0, 6.0], feature: 0.10 },
    farm:   { wd: [8, 15],  wu: [9, 16],  drop: [3.5, 7.5], feature: 0.10 },
    gym:    { wd: [8, 14],  wu: [9, 15],  drop: [4.5, 9.0], feature: 0.16 },
    void:   { wd: [8, 16],  wu: [9, 18],  drop: [5.5, 11],  feature: 0.22 },
  };

  // global biome index (0 = first street, 4 = second street, ...)
  function biomeIndexAt(x) {
    x = Math.max(0, x);
    const lap = Math.floor(x / LAP);
    const rem = x - lap * LAP;
    let i = 0; while (i < 3 && rem >= CUM[i + 1]) i++;
    return lap * 4 + i;
  }
  function biomeStartX(index) { return Math.floor(index / 4) * LAP + CUM[index % 4]; }
  function biomeAt(x) { return BIOMES[biomeIndexAt(x) % 4]; }
  function tierAt(x) { return Math.floor(biomeIndexAt(x) / 4); }
  // biome start lines strictly inside (x0, x1]
  function boundariesBetween(x0, x1) {
    const out = [];
    let k = biomeIndexAt(Math.max(0, x0)) + 1;
    while (biomeStartX(k) <= x1) { if (biomeStartX(k) > x0) out.push(k); k++; }
    return out;
  }

  class Terrain {
    constructor(rng) {
      this.rng = rng;
      this.segs = []; // {x0,x1,y0,y1,kind,biome}
      this.coverX = 0;
      this.lastX = -12;
      this.lastY = 40;
      this.listeners = [];
      this._cursor = 0;
      // scripted opening: short flat, a 24 m dive into a low sharp crest, then a long landing slope.
      // A first-time diver launches at the crest inside ~3 s; a non-diver just rolls over it.
      this._push(-12, 40, 0, 39.6, 'flat', 'street');
      this._push(0, 39.6, 24, 34.4, 'cos', 'street');
      this._push(24, 34.4, 33, 35.9, 'cos', 'street');
      this._push(33, 35.9, 52, 29.4, 'cos', 'street');
      this._lastDrop = 6.5;
      this.phase = 'up';
    }

    onSegment(fn) { this.listeners.push(fn); }

    _push(x0, y0, x1, y1, kind, biome) {
      const seg = { x0, y0, x1, y1, kind, biome, index: this.segs.length };
      this.segs.push(seg);
      this.lastX = x1; this.lastY = y1; this.coverX = x1;
      for (const fn of this.listeners) fn(seg, this);
      return seg;
    }

    ensure(xMax) { while (this.coverX < xMax) this._gen(); }

    _gen() {
      const rng = this.rng;
      const x = this.lastX;
      const biome = biomeAt(x);
      const tier = tierAt(x);
      const P = HILL[biome];
      const ampMul = 1 + 0.12 * Math.min(MAX_AMP_TIER, tier);
      if (this.phase === 'down') {
        const wd = rng.range(P.wd[0], P.wd[1]);
        const drop = rng.range(P.drop[0], P.drop[1]) * ampMul;
        let kind = 'cos';
        if (rng.chance(P.feature)) kind = rng.pick(['cliff', 'cos', 'cos']);
        if (kind === 'cliff') this._push(x, this.lastY, x + wd * 0.45, this.lastY - drop * 1.15, 'cos', biome);
        else this._push(x, this.lastY, x + wd, this.lastY - drop, 'cos', biome);
        this._lastDrop = drop;
        this.phase = 'up';
      } else {
        const wu = rng.range(P.wu[0], P.wu[1]);
        const drop = this._lastDrop || 5;
        let rise = drop - wu * rng.range(0.04, 0.09); // global descent
        rise = Math.max(rise, drop * 0.45);
        let kind = 'cos';
        if (rng.chance(P.feature)) kind = rng.pick(['ramp', 'plateau']);
        if (kind === 'ramp') {
          this._push(x, this.lastY, x + wu * 0.6, this.lastY + rise * 0.8, 'ramp', biome);
        } else if (kind === 'plateau') {
          this._push(x, this.lastY, x + wu, this.lastY + rise, 'cos', biome);
          this._push(this.lastX, this.lastY, this.lastX + rng.range(4, 9), this.lastY - 0.15, 'flat', biome);
        } else {
          this._push(x, this.lastY, x + wu, this.lastY + rise, 'cos', biome);
        }
        this.phase = 'down';
      }
    }

    _find(x) {
      const segs = this.segs;
      let i = this._cursor;
      if (i >= segs.length) i = segs.length - 1;
      while (i > 0 && x < segs[i].x0) i--;
      while (i < segs.length - 1 && x >= segs[i].x1) i++;
      this._cursor = i;
      return segs[i];
    }

    heightAt(x) {
      if (x >= this.coverX) this.ensure(x + 200);
      const s = this._find(x);
      const w = s.x1 - s.x0;
      let t = (x - s.x0) / w;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      if (s.kind === 'flat' || s.kind === 'ramp') return s.y0 + (s.y1 - s.y0) * t;
      return s.y0 + (s.y1 - s.y0) * (1 - Math.cos(Math.PI * t)) * 0.5;
    }

    slopeAt(x) {
      if (x >= this.coverX) this.ensure(x + 200);
      const s = this._find(x);
      const w = s.x1 - s.x0;
      let t = (x - s.x0) / w;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      if (s.kind === 'flat' || s.kind === 'ramp') return (s.y1 - s.y0) / w;
      return (s.y1 - s.y0) * Math.PI * Math.sin(Math.PI * t) * 0.5 / w;
    }

    angleAt(x) { return Math.atan(this.slopeAt(x)); }
    segmentAt(x) { return this._find(x); }
  }

  BH.terrain = { Terrain, BIOMES, BIOME_LENS, LAP, biomeAt, biomeIndexAt, biomeStartX, tierAt, boundariesBetween, HILL, MAX_AMP_TIER };
})();

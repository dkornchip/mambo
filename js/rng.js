/* BOX HORSE — deterministic RNG (mulberry32) + string hashing. */
(function () {
  'use strict';
  const BH = (window.BH = window.BH || {});

  function hashString(str) {
    // FNV-1a 32-bit
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    const rng = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.seed = seed >>> 0;
    rng.range = (lo, hi) => lo + rng() * (hi - lo);
    rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.chance = (p) => rng() < p;
    rng.fork = (salt) => mulberry32((seed ^ hashString(String(salt))) >>> 0);
    return rng;
  }

  function dailySeed(date) {
    const d = date || new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return { key, seed: hashString('boxhorse-daily-' + key) };
  }

  BH.rng = { hashString, mulberry32, dailySeed };
})();

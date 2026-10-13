// Headless balance bot: plays N seeded runs per policy using BOXHORSE.simulate() (no rendering),
// then prints distribution stats. Usage:
//   node test/bot.mjs [--runs 30] [--policies auto,safe,greedy,hold,never,spam,random] [--chars tann,gold,teio] [--maxTime 240] [--json out.json]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // honors NODE_PATH (global install) and local node_modules
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const RUNS = parseInt(args.runs || '30', 10);
const POLICIES = String(args.policies || 'auto,safe,greedy,hold,never,spam').split(',');
const CHARS = String(args.chars || 'tann').split(',');
const MAX_TIME = parseFloat(args.maxTime || '240');
const SEED0 = parseInt(args.seed || '1000', 10);

function q(arr, p) { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); const i = Math.min(s.length - 1, Math.floor(p * (s.length - 1))); return s[i]; }
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => window.BOXHORSE && window.BOXHORSE.simulate);

const report = { runs: RUNS, maxTime: MAX_TIME, results: {} };
for (const charId of CHARS) {
  for (const policy of POLICIES) {
    const t0 = Date.now();
    const rows = await page.evaluate(({ policy, charId, RUNS, MAX_TIME, SEED0 }) => {
      const out = [];
      for (let i = 0; i < RUNS; i++) {
        const r = window.BOXHORSE.simulate({ seed: SEED0 + i, policy, charId, maxTime: MAX_TIME, perkPolicy: 'random' });
        const s = r.summary;
        const deaths = r.events.filter((e) => e.type === 'gameover').map((e) => e.reason);
        const launches = r.events.filter((e) => e.type === 'launch').length;
        const lands = r.events.filter((e) => e.type === 'land');
        const bonkLand = r.events.filter((e) => e.type === 'bonk' && e.src === 'land').length;
        const bonkBox = r.events.filter((e) => e.type === 'bonk' && e.src === 'boxes').length;
        const speeds = r.timeline.map((t) => t.spd);
        const airFrac = r.timeline.length ? r.timeline.filter((t) => t.air).length / r.timeline.length : 0;
        out.push({ seed: SEED0 + i, time: s.time, likes: s.likes, dist: s.distance, maxCombo: s.maxCombo, eggs: s.eggs, chickens: s.chickens, smashes: s.smashes, bonks: s.bonks, bonkLand, bonkBox, flips: s.flips, perfects: s.perfects, cleans: s.cleans, launches, lands: lands.length, maxSpeed: s.maxSpeed, maxAir: s.maxAir, topHeight: s.topHeight, biome: s.biome, tier: s.tier, perks: s.perks, timedOut: s.timedOut, deathReason: deaths[0] || null, meanSpeed: speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0, airFrac, gsBoost: s.goldshipBoosts, gsKick: s.goldshipKicks, flexes: s.flexes, followers: s.followersEarned });
      }
      return out;
    }, { policy, charId, RUNS, MAX_TIME, SEED0 });
    const key = `${charId}/${policy}`;
    report.results[key] = rows;
    const times = rows.map((r) => r.time), dists = rows.map((r) => r.dist), likes = rows.map((r) => r.likes);
    const biomes = {}; rows.forEach((r) => { const b = r.biome + (r.tier ? '+' + r.tier : ''); biomes[b] = (biomes[b] || 0) + 1; });
    console.log(`\n== ${key}  (${rows.length} runs, ${((Date.now() - t0) / 1000).toFixed(1)}s wall)`);
    console.log(`  run time  s: p10 ${q(times, 0.1).toFixed(0)}  p50 ${q(times, 0.5).toFixed(0)}  p90 ${q(times, 0.9).toFixed(0)}  mean ${mean(times).toFixed(0)}  timedOut ${rows.filter((r) => r.timedOut).length}`);
    console.log(`  distance  m: p10 ${q(dists, 0.1).toFixed(0)}  p50 ${q(dists, 0.5).toFixed(0)}  p90 ${q(dists, 0.9).toFixed(0)}  max ${Math.max(...dists)}`);
    console.log(`  likes      : p10 ${q(likes, 0.1)}  p50 ${q(likes, 0.5)}  p90 ${q(likes, 0.9)}  max ${Math.max(...likes)}`);
    console.log(`  per run    : eggs ${mean(rows.map((r) => r.eggs)).toFixed(1)}  chickens ${mean(rows.map((r) => r.chickens)).toFixed(1)}  smashes ${mean(rows.map((r) => r.smashes)).toFixed(1)}  flips ${mean(rows.map((r) => r.flips)).toFixed(1)}  perfects ${mean(rows.map((r) => r.perfects)).toFixed(1)}  cleans ${mean(rows.map((r) => r.cleans)).toFixed(1)}`);
    console.log(`  bonks      : total ${mean(rows.map((r) => r.bonks)).toFixed(1)}  landing ${mean(rows.map((r) => r.bonkLand)).toFixed(1)}  boxes ${mean(rows.map((r) => r.bonkBox)).toFixed(1)}  | launches ${mean(rows.map((r) => r.launches)).toFixed(1)}  lands ${mean(rows.map((r) => r.lands)).toFixed(1)}  maxCombo p50 ${q(rows.map((r) => r.maxCombo), 0.5)}`);
    console.log(`  speed      : mean ${mean(rows.map((r) => r.meanSpeed)).toFixed(1)}  maxSpeed p50 ${q(rows.map((r) => r.maxSpeed), 0.5).toFixed(1)}  airFrac ${mean(rows.map((r) => r.airFrac)).toFixed(2)}  maxAir p50 ${q(rows.map((r) => r.maxAir), 0.5).toFixed(2)}s  topHeight p50 ${q(rows.map((r) => r.topHeight), 0.5).toFixed(1)}m`);
    console.log(`  goldship   : boosts ${mean(rows.map((r) => r.gsBoost)).toFixed(2)}  kicks ${mean(rows.map((r) => r.gsKick)).toFixed(2)}  flexes ${mean(rows.map((r) => r.flexes)).toFixed(2)}  | followers/run ${mean(rows.map((r) => r.followers)).toFixed(0)}`);
    console.log(`  ended in   : ${Object.entries(biomes).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join('  ')}`);
  }
}
await browser.close();
if (args.json) { fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1)); console.log('\nwrote', args.json); }

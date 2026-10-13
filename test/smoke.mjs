// Smoke test: loads the game in headless Chromium, checks for console/page errors,
// drives a short run with real input events, and saves screenshots.
// Usage: node test/smoke.mjs [outDir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // honors NODE_PATH (global install) and local node_modules
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = process.argv[2] || path.join(root, 'test', 'out');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const errors = [];
let failed = false;
try {
  for (const vp of [{ name: 'desktop', width: 1280, height: 720 }, { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${vp.name}] console.${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[${vp.name}] pageerror: ${e.message}`));
    await page.goto('file://' + path.join(root, 'index.html'));
    await page.waitForFunction(() => window.BOXHORSE && window.BOXHORSE.app);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, `title-${vp.name}.png`) });

    // start a run via the PLAY button, then hold with real input for a while
    await page.click('#screen-title .btn.primary');
    await page.waitForFunction(() => window.BOXHORSE.game && window.BOXHORSE.game.state === 'playing');
    // autopilot-driven input through real events: poll policy at 30 Hz from the test side
    let held = false;
    const t0 = Date.now();
    let shots = 0;
    while (Date.now() - t0 < 14000) {
      const want = await page.evaluate(() => { const g = window.BOXHORSE.game; return g && g.state !== 'over' ? window.BOXHORSE.POLICIES.auto(g) : false; });
      if (want !== held) {
        held = want;
        if (vp.hasTouch) { if (held) await page.touchscreen.tap(vp.width / 2, vp.height / 2); }
        if (held) await page.keyboard.down('Space'); else await page.keyboard.up('Space');
      }
      const state = await page.evaluate(() => window.BOXHORSE.game.state);
      if (state === 'perk') { await page.keyboard.press('Digit1'); }
      if (Date.now() - t0 > 4000 && shots === 0) { shots++; await page.screenshot({ path: path.join(outDir, `play-${vp.name}.png`) }); }
      if (Date.now() - t0 > 10000 && shots === 1) { shots++; await page.screenshot({ path: path.join(outDir, `play2-${vp.name}.png`) }); }
      await page.waitForTimeout(33);
    }
    await page.keyboard.up('Space');
    const summary = await page.evaluate(() => window.BOXHORSE.summary());
    console.log(`[${vp.name}] after 14 s of real input:`, JSON.stringify(summary));
    if (!(summary.distance > 50)) { failed = true; errors.push(`[${vp.name}] rider barely moved: distance=${summary.distance}`); }
    // force game over quickly to screenshot the end screen
    await page.evaluate(() => { const g = window.BOXHORSE.game; if (g.state !== 'over') { g.clout = 0; g._gameOver('clout'); } });
    await page.waitForFunction(() => document.querySelector('#screen-over:not(.hidden)'), { timeout: 8000 }).catch(() => { failed = true; errors.push(`[${vp.name}] game over screen never appeared`); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `over-${vp.name}.png`) });
    // restart with the AGAIN button and ensure a new run starts
    await page.click('#screen-over .btn.primary').catch(() => {});
    const restarted = await page.waitForFunction(() => window.BOXHORSE.game && window.BOXHORSE.game.state === 'playing', { timeout: 3000 }).then(() => true).catch(() => false);
    if (!restarted) { failed = true; errors.push(`[${vp.name}] AGAIN did not restart`); }
    // frame timing sample
    const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    console.log(`[${vp.name}] ~${fps.toFixed(0)} fps during play (headless, software raster)`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (errors.length) { console.log('ERRORS/WARNINGS:'); for (const e of errors) console.log('  ' + e); }
if (failed || errors.some((e) => e.includes('pageerror') || e.includes('console.error'))) { console.log('SMOKE: FAIL'); process.exit(1); }
console.log('SMOKE: OK');

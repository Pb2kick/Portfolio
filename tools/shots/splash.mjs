// Checks the splash dragon with a real (headless) browser: at several window sizes it watches
// the orbit during the sound choice and the strikes, records how close the dragon's body ever
// gets to the diamond round KPR, and saves screenshots of the emblem.
//
//   cd tools && npm run shots -- [base url]      (default http://localhost:4321; serve src/ first)
//
// Output: tools/shots/out/<size>-*.png and a summary line per size. Exits 1 if the body ever
// crosses into the diamond.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://localhost:4321';
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });

const sizes = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'fullhd', width: 1920, height: 1080 },
  { name: 'short', width: 1366, height: 640 },
  { name: 'phone', width: 390, height: 844 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;

for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/?shots=${Date.now()}`);
  await page.waitForFunction(() => window.__kprDragon3D, null, { timeout: 10000 }).catch(() => {});
  const has3d = await page.evaluate(() => !!window.__kprDragon3D);

  // the emblem's box on screen, padded, for the close-up shots
  const clip = async () => page.evaluate(() => {
    const r = document.querySelector('.intro-whole .intro-reticle--whole').getBoundingClientRect();
    if (r.width < 4) return { x: 0, y: 0, width: innerWidth, height: innerHeight }; // emblem already cut
    const pad = r.width * 0.35;
    return {
      x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad),
      width: Math.min(innerWidth, r.right + pad) - Math.max(0, r.left - pad),
      height: Math.min(innerHeight, r.bottom + pad) - Math.max(0, r.top - pad),
    };
  });

  let minClear = Infinity, samples = 0;
  const sample = async () => {
    const s = await page.evaluate(() => window.__kprDragon3D && window.__kprDragon3D.debugState());
    // the final lunge sweeps across the whole screen on purpose (the cut); only the orbit counts
    if (s && !s.lunge && Number.isFinite(s.clearPx)) { minClear = Math.min(minClear, s.clearPx); samples++; }
  };

  // the sound choice: the dragon circles the raised emblem for a while
  for (let i = 0; i < 60; i++) {
    await sample();
    if (i % 15 === 7) await page.screenshot({ path: join(out, `${size.name}-gate-${i}.png`), clip: await clip() });
    await sleep(150);
  }
  // enter silently: the emblem glides back to centre, then the charge and strikes
  await page.click('[data-intro-enter="silent"]');
  for (let i = 0; i < 14; i++) {
    await sample();
    if (i === 4 || i === 9) await page.screenshot({ path: join(out, `${size.name}-run-${i}.png`), clip: await clip() });
    await sleep(80);
  }
  await page.screenshot({ path: join(out, `${size.name}-full.png`) });

  const ok = has3d && errors.length === 0 && minClear >= 0;
  if (!ok) failed = true;
  console.log(`${size.name.padEnd(8)} ${size.width}x${size.height}  3d:${has3d}  samples:${samples}  ` +
    `closest to the diamond tips: ${minClear.toFixed(1)}px  errors:${errors.length ? errors.join(' | ') : 'none'}  ${ok ? 'OK' : 'FAIL'}`);
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);

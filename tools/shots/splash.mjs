// Checks the splash dragon with a real (headless) browser: at several window sizes it watches
// the orbit during the sound choice and the strikes, verifies smooth borderless flight through
// and around the diamond while KPR stays stacked strictly above the dragon canvases, and saves
// screenshots of the emblem.
//
//   cd tools && npm run shots -- [base url]      (default http://localhost:4321; serve src/ first)
//
// Output: tools/shots/out/<size>-*.png and a summary line per size.
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

  // Verify DOM z-index layering inside .intro-whole: back canvas < reticle < mid canvas < KPR logo
  const layersOk = await page.evaluate(() => {
    const z = (sel) => Number(getComputedStyle(document.querySelector(sel)).zIndex) || 0;
    const zBack = z('.intro-canvas--back');
    const zRet = z('.intro-mark--reticle');
    const zMid = z('.intro-canvas--mid');
    const zLogo = z('.intro-mark--logo');
    return zBack < zRet && zRet < zMid && zMid < zLogo;
  });

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

  let minClear = Infinity, minZ = Infinity, maxZ = -Infinity, samples = 0;
  let prevHeading = null, maxHeadingJumpDeg = 0;
  const sample = async () => {
    const s = await page.evaluate(() => window.__kprDragon3D && window.__kprDragon3D.debugState());
    if (s && !s.lunge && Number.isFinite(s.clearPx)) {
      minClear = Math.min(minClear, s.clearPx);
      if (Number.isFinite(s.minZ)) minZ = Math.min(minZ, s.minZ);
      if (Number.isFinite(s.maxZ)) maxZ = Math.max(maxZ, s.maxZ);
      if (prevHeading && s.heading) {
        const dot = Math.max(-1, Math.min(1, prevHeading.x * s.heading.x + prevHeading.y * s.heading.y + prevHeading.z * s.heading.z));
        maxHeadingJumpDeg = Math.max(maxHeadingJumpDeg, Math.acos(dot) * (180 / Math.PI));
      }
      prevHeading = s.heading || prevHeading;
      samples++;
    }
  };

  // the sound choice: the dragon weaves freely through and around the raised emblem
  for (let i = 0; i < 45; i++) {
    await sample();
    if (i % 12 === 6) await page.screenshot({ path: join(out, `${size.name}-gate-${i}.png`), clip: await clip() });
    await sleep(150);
  }
  // enter silently: the emblem glides back to centre, then the charge and strikes
  await page.click('[data-intro-enter="silent"]');
  for (let i = 0; i < 14; i++) {
    await sample();
    if (i === 4 || i === 9) await page.screenshot({ path: join(out, `${size.name}-run-${i}.png`), clip: await clip() });
    await sleep(80);
  }
  // wait for reveal to complete before taking the full-page screenshot
  await sleep(1600);
  await page.screenshot({ path: join(out, `${size.name}-full.png`) });

  const passesBothDepths = minZ < -0.5 && maxZ > 0.5;
  const movesThroughDiamond = minClear < 0;
  const ok = has3d && layersOk && passesBothDepths && movesThroughDiamond && errors.length === 0;
  if (!ok) failed = true;
  console.log(`${size.name.padEnd(8)} ${size.width}x${size.height}  3d:${has3d}  layers:${layersOk}  samples:${samples}  ` +
    `minClear:${minClear.toFixed(1)}px  z:[${minZ.toFixed(2)},${maxZ.toFixed(2)}]  maxTurnStep:${maxHeadingJumpDeg.toFixed(1)}deg  ` +
    `errors:${errors.length ? errors.join(' | ') : 'none'}  ${ok ? 'OK' : 'FAIL'}`);
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);

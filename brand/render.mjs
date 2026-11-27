// Renders brand/banner.html to the LinkedIn cover and the GitHub profile banner, at 2x for
// sharp text: brand/linkedin-cover.png (3168x792 = 1584x396 @2x) and brand/github-banner.png
// (2560x720 = 1280x360 @2x). Uses the Playwright install in tools/.
//   node brand/render.mjs
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(here, '..', 'tools', 'package.json'))('@playwright/test');
const page0 = pathToFileURL(join(here, 'banner.html')).href;

const browser = await chromium.launch();
for (const [which, width, height, out] of [
  ['linkedin', 1584, 396, 'linkedin-cover.png'],
  ['github', 1280, 360, 'github-banner.png'],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(`${page0}?for=${which}`);
  await page.waitForSelector('body[data-ready]', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.locator('.banner').screenshot({ path: join(here, out) });
  console.log('wrote', out);
  await page.close();
}
await browser.close();

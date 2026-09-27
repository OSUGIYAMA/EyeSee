// Dev helper: screenshot a page in headless Chrome (WebGL via SwiftShader).
// usage: node tests/shot.mjs <url> <out.png> [waitMs] [width] [height]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [url, out, waitMs = '1500', width = '1280', height = '800'] = process.argv.slice(2);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: fs.existsSync(chrome) ? chrome : undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'],
});
const page = await browser.newPage({ viewport: { width: +width, height: +height } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
await browser.close();
console.log(logs.join('\n') || '(no console output)');

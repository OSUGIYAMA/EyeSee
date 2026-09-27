// Screenshot a page after optionally playing N demo steps.
// usage: node tests/ui-shot.mjs <url> <out.png> [demoSteps=0] [w=390] [h=844] [extraWaitMs=1500] [evalJs]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [url, out, steps = '0', w = '390', h = '844', wait = '1500', evalJs = ''] = process.argv.slice(2);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const logs = [];
page.on('console', (m) => m.type() !== 'debug' && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1200);
for (let i = 0; i < +steps; i++) {
  await page.evaluate(() => window.__eyesee.link.send({ type: 'demoNext' }));
  await page.waitForTimeout(350);
}
if (evalJs) await page.evaluate(evalJs);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
console.log(logs.filter((l) => !/GPU stall|GL Driver/.test(l)).join('\n') || '(no console output)');

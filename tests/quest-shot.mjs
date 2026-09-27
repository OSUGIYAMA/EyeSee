// Drive the demo from a phone page and screenshot the Quest page (desktop preview).
// usage: node tests/quest-shot.mjs <base> <room> <steps> <outPrefix> [yawDeg,pitchDeg ...]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [base, room, steps, out, ...views] = process.argv.slice(2);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext();
const logs = [];
const phone = await ctx.newPage({ viewport: { width: 390, height: 844 } });
const quest = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
for (const [n, p] of [['phone', phone], ['quest', quest]]) {
  p.on('console', (m) => !/GPU stall|GL Driver|deprecated/.test(m.text()) && logs.push(`[${n}:${m.type()}] ${m.text()}`));
  p.on('pageerror', (e) => logs.push(`[${n}:pageerror] ${e.message}`));
}
await phone.goto(`${base}/phone?room=${room}`);
await quest.goto(`${base}/quest?room=${room}&preview`);
await phone.waitForTimeout(1500);
await phone.evaluate(() => window.__eyesee.link.send({ type: 'demoReset' }));
await phone.waitForTimeout(500);
for (let i = 0; i < +steps; i++) {
  await phone.evaluate(() => window.__eyesee.link.send({ type: 'demoNext' }));
  await phone.waitForTimeout(250);
}
await quest.waitForTimeout(3000);
const list = views.length ? views : ['0,0'];
for (const [i, v] of list.entries()) {
  const [yaw, pitch] = v.split(',').map(Number);
  await quest.evaluate(([y, p]) => { const cam = window.__eyesee.scene.children.find((c) => c.isPerspectiveCamera) || null; }, [yaw, pitch]);
  await quest.evaluate(([y, p]) => { window.__cam = window.__cam || null; }, [yaw, pitch]);
  await quest.evaluate(([y, p]) => window.__setView?.(y, p), [yaw, pitch]);
  await quest.waitForTimeout(700);
  await quest.screenshot({ path: `${out}-${i}.png` });
}
await phone.screenshot({ path: `${out}-phone.png` });
await browser.close();
console.log(logs.join('\n') || '(no console output)');

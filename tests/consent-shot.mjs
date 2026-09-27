// Screenshot the consent step on both devices (plays the whole demo first).
// usage: node tests/consent-shot.mjs <base> <room> <outPrefix>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [base, room, out] = process.argv.slice(2);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext();
const logs = [];
const phone = await ctx.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const quest = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
for (const [n, p] of [['phone', phone], ['quest', quest]]) p.on('pageerror', (e) => logs.push(`[${n}] ${e.message}`));
await phone.goto(`${base}/phone?room=${room}`);
await quest.goto(`${base}/quest?room=${room}&preview`);
await phone.waitForTimeout(1200);
const send = (m) => phone.evaluate((m) => window.__eyesee.link.send(m), m);
const st = () => phone.evaluate(() => window.__eyesee.state);
await send({ type: 'demoReset' });
await phone.waitForTimeout(400);
const cfg = await (await fetch(`${base}/api/config`)).json();
for (let i = 0; i < cfg.demoSteps; i++) {
  await send({ type: 'demoNext' });
  for (let k = 0; k < 200; k++) { const s = await st(); if (s.demo.index === i + 1 && !s.entries.some((e) => e.pending) && !s.aiBusy) break; await phone.waitForTimeout(100); }
}
await phone.waitForTimeout(2500);
await phone.screenshot({ path: `${out}-phone-meter.png` });
await phone.click('#meterBar');
await phone.waitForTimeout(300);
await phone.screenshot({ path: `${out}-phone-meter-open.png` });
await phone.click('#consentBtn');
for (let k = 0; k < 300; k++) { if ((await st()).consent?.status === 'precheck') break; await phone.waitForTimeout(100); }
await phone.waitForTimeout(500);
await phone.screenshot({ path: `${out}-phone-precheck.png` });
await send({ type: 'consentProceed', acknowledge: true });
await quest.waitForTimeout(1500);
await quest.evaluate(() => window.__setView(0, -38));
await quest.waitForTimeout(800);
await quest.screenshot({ path: `${out}-quest-review.png` });
const s = await st();
for (const cp of s.consent.checkpoints) { await quest.evaluate((id) => window.__eyesee.link.send({ type: 'consentAck', cp: id, status: 'understood' }), cp.id); await quest.waitForTimeout(60); }
await quest.waitForTimeout(1200);
await quest.screenshot({ path: `${out}-quest-sign.png` });
await phone.waitForTimeout(500);
await phone.screenshot({ path: `${out}-phone-signing.png` });
await quest.evaluate(() => window.__setView(0, -8));
await quest.waitForTimeout(600);
await quest.screenshot({ path: `${out}-quest-front.png` });
await browser.close();
console.log(logs.join('\n') || '(no page errors)');

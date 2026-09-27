// Screenshot the consent step on both devices: steps through the demo, then answers the quiz (one
// wrong answer first) and signs, capturing each moment the patient and the doctor see.
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
const answer = (q, choice) => quest.evaluate(([q, choice]) => window.__eyesee.link.send({ type: 'consentAnswer', q, choice }), [q, choice]);
const st = () => phone.evaluate(() => window.__eyesee.state);
const until = async (fn, ms = 30000) => { for (const t = Date.now(); Date.now() - t < ms; await phone.waitForTimeout(100)) if (fn(await st())) return; };
const shoot = async (name) => {
  await quest.screenshot({ path: `${out}-quest-${name}.png` });
  await phone.screenshot({ path: `${out}-phone-${name}.png` });
};

await send({ type: 'demoReset' });
await phone.waitForTimeout(400);
const cfg = await (await fetch(`${base}/api/config`)).json();
for (let i = 0; i < cfg.demoSteps; i++) {
  await send({ type: 'demoNext' });
  await until((s) => s.demo.index === i + 1 && !s.entries.some((e) => e.pending) && !s.aiBusy, 60000);
}
// The last demo step opens consent and starts the quiz; from here on it is up to the people.
await until((s) => s.consent?.status === 'quiz');
await quest.evaluate(() => window.__setView(0, -34));
await quest.waitForTimeout(1200);
await shoot('quiz');
const quiz = (await st()).consent.quiz;

await answer(quiz[0].id, (quiz[0].answer + 1) % 3);
await quest.waitForTimeout(900);
await shoot('wrong');

await answer(quiz[0].id, quiz[0].answer);
await quest.waitForTimeout(700);
await shoot('correct');

for (const q of quiz.slice(1)) {
  await until((s) => !s.consent.reveal);
  await answer(q.id, q.answer);
  await until((s) => s.consent.quiz.find((x) => x.id === q.id).passed);
}
await until((s) => s.consent.status === 'passed');
await quest.waitForTimeout(1100);
await shoot('passed');

await until((s) => s.consent.status === 'signing');
await quest.waitForTimeout(900);
await shoot('signing');

const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
await quest.evaluate((px) => window.__eyesee.link.send({ type: 'sign', dataUrl: px }), px);
await send({ type: 'sign', dataUrl: px });
await until((s) => s.consent.status === 'signed');
await quest.waitForTimeout(1100);
await shoot('signed');
await browser.close();
console.log(logs.join('\n') || '(no page errors)');

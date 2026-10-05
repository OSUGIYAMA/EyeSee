// README screenshots: plays the demo visit and captures the patient's headset view in passthrough AR,
// with a scanned meeting room where the real passthrough would be (Meta's IWER and its Synthetic
// Environment Module), plus the doctor's phone.
// usage: node tests/readme-shots.mjs [base=http://localhost:8080] [outDir=docs/img]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://localhost:8080';
const outDir = path.resolve(process.argv[3] || 'docs/img');
// The patient stands at the end of the meeting room's long table, facing along it.
const stand = { x: 0, z: 0.6 };
const room = `readme${Date.now() % 10000}`;
fs.mkdirSync(outDir, { recursive: true });
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const logs = [];

const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const quest = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
for (const [n, p] of [['phone', phone], ['quest', quest]]) p.on('pageerror', (e) => logs.push(`[${n}] ${e.message}`));

await quest.route('**/__sem/env.json', (r) => r.fulfill({ path: path.resolve('node_modules/@iwer/sem/captures/meeting_room.json'), contentType: 'application/json' }));
await quest.addInitScript({ path: path.resolve('node_modules/iwer/build/iwer.js') });
await quest.addInitScript({ path: path.resolve('node_modules/@iwer/sem/build/iwer-sem.js') });
await quest.addInitScript(() => {
  const d = new IWER.XRDevice(IWER.metaQuest3);
  d.installRuntime({ forceInstall: true });
  d.installSEM(IWER_SEM.SyntheticEnvironmentModule);
  window.__xr = d;
});
await phone.goto(`${base}/phone?room=${room}`);
await quest.goto(`${base}/quest?room=${room}`);
await quest.evaluate(async () => window.__xr.sem.loadEnvironment(await (await fetch('/__sem/env.json')).json()));
await quest.waitForTimeout(1500);
await quest.click('#startBtn');
await quest.waitForSelector('#arBtn:not([hidden])', { timeout: 5000 });
await quest.evaluate(([x, z]) => window.__xr.position.set(x, 1.6, z), [stand.x, stand.z]);
await quest.click('#arBtn');
await quest.waitForFunction(() => window.__eyesee.renderer.xr.isPresenting);
await quest.waitForTimeout(1200);
// Hands, not controllers (no rays in the picture), resting out of view.
await quest.evaluate(() => {
  const xr = window.__xr;
  xr.primaryInputMode = 'hand';
  xr.hands.left.position.set(-0.25, 0.9, 1);
  xr.hands.right.position.set(0.25, 0.9, 1);
});

const send = (m) => phone.evaluate((m) => window.__eyesee.link.send(m), m);
const st = () => phone.evaluate(() => window.__eyesee.state);
const until = async (fn, ms = 30000) => { for (const t = Date.now(); Date.now() - t < ms; await phone.waitForTimeout(100)) if (fn(await st())) return true; return false; };
// Look from a point (relative to where the panels were placed) in a direction, with a vertical field of view.
const look = ({ x = 0, y = 1.6, z = 0, yaw = 0, pitch = 0, fov = 64 }) =>
  quest.evaluate(([x, y, z, yaw, pitch, fov]) => {
    const { THREE } = window.__eyesee;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((pitch * Math.PI) / 180, (yaw * Math.PI) / 180, 0, 'YXZ'));
    window.__xr.position.set(x, y, z);
    window.__xr.quaternion.set(q.x, q.y, q.z, q.w);
    window.__xr.fovy = (fov * Math.PI) / 180;
  }, [stand.x + x, y, stand.z + z, yaw, pitch, fov]);
const shootQuest = async (name, view, settle = 900) => {
  await look(view);
  await quest.waitForTimeout(settle);
  await quest.screenshot({ path: path.join(outDir, `quest-${name}.png`) });
  console.log(`  quest-${name}.png`);
};
const shootPhone = async (name) => {
  await phone.waitForTimeout(400);
  await phone.screenshot({ path: path.join(outDir, `phone-${name}.png`) });
  console.log(`  phone-${name}.png`);
};

// Before the demo: the doctor opens the body, the patient points at the upper stomach and is asked
// what it feels like.
await send({ type: 'stage', stage: { tool: 'body' } });
await quest.waitForFunction(() => window.__eyesee.stageObj?.regionAt, null, { timeout: 15000 });
await quest.waitForTimeout(800);
await quest.evaluate(() => {
  const { THREE, ix, stageObj } = window.__eyesee;
  const from = window.__xr.position;
  const o = new THREE.Vector3(from.x, from.y, from.z);
  const r = ix.cast(o, stageObj.object.localToWorld(new THREE.Vector3(0, 1.14, 0.14)).sub(o).normalize());
  r.target.onPress(r.hit);
});
await until((s) => s.symptoms?.length);
await shootQuest('sensation', { x: 0.15, z: 0.3, yaw: 24, pitch: -16, fov: 68 }, 2500);

await send({ type: 'demoReset' });
await phone.waitForTimeout(400);
const cfg = await (await fetch(`${base}/api/config`)).json();
const step = async (i) => {
  await send({ type: 'demoNext' });
  await until((s) => s.demo.index === i + 1 && !s.entries.some((e) => e.pending) && !s.aiBusy, 60000);
};
const shots = {
  // after this many demo steps → what to capture
  4: async () => {
    await phone.waitForTimeout(1500);
    await shootPhone('conversation');
  },
  6: async () => shootQuest('model', { x: 0.05, z: 0.2, yaw: 22, pitch: -6, fov: 66 }, 2000),
  13: async () => {
    await shootQuest('overview', { z: 0.45, yaw: 8, pitch: -10, fov: 84 });
    await shootPhone('ai');
  },
};
for (let i = 0; i < cfg.demoSteps; i++) {
  await step(i);
  await shots[i + 1]?.();
}

// The last demo step opens consent and starts the quiz; from here on it is up to the people.
await until((s) => s.consent?.status === 'quiz');
await quest.waitForTimeout(1200);
await shootQuest('quiz', { z: 0.1, pitch: -24, fov: 62 });
const answer = (q, choice) => quest.evaluate(([q, choice]) => window.__eyesee.link.send({ type: 'consentAnswer', q, choice }), [q, choice]);
for (const q of (await st()).consent.quiz) {
  await until((s) => !s.consent.reveal);
  await answer(q.id, q.answer);
  await until((s) => s.consent.quiz.find((x) => x.id === q.id).passed);
}
await until((s) => s.consent.status === 'signing');
await quest.waitForTimeout(900);

// The patient signs by hand: a looping scribble, normalised to the pad (0..1), as finger strokes on the sheet.
const signature = [
  Array.from({ length: 141 }, (_, i) => {
    const t = i / 140;
    return [0.12 + 0.62 * t + 0.035 * Math.cos(t * 22), 0.55 - 0.18 * Math.sin(t * 22) * (0.6 + 0.4 * Math.sin(t * 5)) - 0.08 * t];
  }),
  Array.from({ length: 21 }, (_, i) => [0.1 + 0.75 * (i / 20), 0.8 - 0.06 * Math.sin((i / 20) * Math.PI)]),
];
await quest.evaluate(async (strokes) => {
  const { ix, panels } = window.__eyesee;
  const sheet = panels.sheet;
  const target = [...ix.targets].find((t) => t.object === sheet.mesh);
  const pad = sheet.regions.find((r) => r.id === 'pad');
  const uv = ([u, v]) => ({ x: (pad.x + u * pad.w) / sheet.W, y: 1 - (pad.y + v * pad.h) / sheet.H });
  for (const s of strokes) {
    target.onPress({ region: pad, uv: uv(s[0]) });
    for (const p of s.slice(1)) target.onDrag({ uv: uv(p) }), await new Promise((r) => setTimeout(r, 8));
    target.onRelease();
  }
}, signature);
await shootQuest('signing', { z: 0.1, pitch: -24, fov: 62 }, 600);

await browser.close();
console.log(logs.join('\n') || '(no page errors)');

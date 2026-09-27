// WebXR interaction test with Meta's Immersive Web Emulation Runtime (emulated Quest 3):
// enter AR, recenter, poke 3D buttons with a tracked index finger, press UI with a controller ray.
// usage: node tests/xr.mjs [base=http://localhost:8080] [room=xrtest]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://localhost:8080';
const room = process.argv[3] || `xrtest${Date.now() % 10000}`;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext();
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++; };
const logs = [];

const phone = await ctx.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto(`${base}/phone?room=${room}`);
const quest = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
quest.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
quest.on('console', (m) => m.type() === 'error' && logs.push(`[console] ${m.text()}`));
await quest.addInitScript({ path: path.resolve('node_modules/iwer/build/iwer.js') });
await quest.addInitScript(() => {
  const d = new IWER.XRDevice(IWER.metaQuest3);
  d.installRuntime({ forceInstall: true });
  window.__xr = d;
});
await quest.goto(`${base}/quest?room=${room}`);
await quest.waitForTimeout(1500);
const serverState = () => phone.evaluate(() => window.__eyesee.state);

await quest.click('#startBtn');
await quest.waitForSelector('#arBtn:not([hidden])', { timeout: 5000 }).catch(() => {});
check(await quest.isVisible('#arBtn'), 'emulated Quest 3 offers immersive-ar (passthrough)');
await quest.click('#arBtn');
await quest.waitForTimeout(1500);
check(await quest.evaluate(() => window.__eyesee.renderer.xr.isPresenting), 'XR session is presenting');

// Recenter: move the head, squeeze, UI should follow.
await quest.evaluate(() => { window.__xr.position.set(0.5, 1.3, 0.2); });
await quest.waitForTimeout(300);
await quest.evaluate(() => window.__eyesee.renderer.xr.getController(0).dispatchEvent({ type: 'squeezestart' }));
await quest.waitForTimeout(600);
const ui = await quest.evaluate(() => window.__eyesee.uiRoot.position.toArray().map((v) => +v.toFixed(2)));
check(Math.abs(ui[0] - 0.5) < 0.05 && Math.abs(ui[1] - 1.3) < 0.05, `panels recentered to the head (uiRoot ${ui.join(', ')})`);

// ---- hand poke helper: move the right hand so its index fingertip follows a path
await quest.evaluate(() => { window.__xr.primaryInputMode = 'hand'; window.__xr.hands.right.poseId = 'point'; });
await quest.waitForTimeout(300);
async function poke(buttonName, holdMs = 400) {
  return quest.evaluate(async ([name, holdMs]) => {
    const { THREE, buttons, renderer } = window.__eyesee;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const btn = buttons[name];
    const face = btn.localToWorld(new THREE.Vector3(0, 0, btn.userData.face));
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(btn.matrixWorld);
    const hand = window.__xr.hands.right;
    const tipOf = () => {
      let best = null;
      for (let i = 0; i < 2; i++) {
        const j = renderer.xr.getHand(i).joints['index-finger-tip'];
        if (!j || !j.visible) continue;
        const p = j.getWorldPosition(new THREE.Vector3());
        const d = p.distanceTo(new THREE.Vector3(hand.position.x, hand.position.y, hand.position.z));
        if (!best || d < best.d) best = { p, d };
      }
      return best?.p;
    };
    hand.position.set(face.x, face.y + 0.1, face.z + 0.2);
    await wait(150);
    const tip = tipOf();
    if (!tip) return 'no fingertip joint';
    const off = tip.clone().sub(new THREE.Vector3(hand.position.x, hand.position.y, hand.position.z));
    const moveTip = async (target) => { const p = target.clone().sub(off); hand.position.set(p.x, p.y, p.z); await wait(120); };
    await moveTip(face.clone().addScaledVector(normal, 0.06));
    await moveTip(face.clone().addScaledVector(normal, 0.02));
    await moveTip(face.clone().addScaledVector(normal, -0.01));
    await wait(holdMs);
    const pressed = btn.userData.cap.position.z < 0.01;
    await moveTip(face.clone().addScaledVector(normal, 0.06));
    return pressed ? 'pressed' : 'not pressed';
  }, [buttonName, holdMs]);
}

const before = (await serverState()).entries.length;
check((await poke('iSeeBtn')) === 'pressed', 'finger poke depresses the 👍 button');
await quest.waitForTimeout(500);
const afterISee = await serverState();
check(afterISee.entries.slice(before).some((e) => e.kind === 'event' && e.event.type === 'isee' && e.speaker === 'patient'), '👍 poke reaches the doctor as “I see”');

// AI button: press-and-hold should flag aiListening while held.
const holdCheck = quest.evaluate(() => new Promise((r) => { const t = setInterval(() => { if (window.__eyesee.state?.aiListening?.patient) { clearInterval(t); r(true); } }, 50); setTimeout(() => { clearInterval(t); r(false); }, 3000); }));
check((await poke('aiBtn', 900)) === 'pressed', 'finger poke depresses the ✦ AI button');
check(await holdCheck, 'holding ✦ AI tells the doctor “patient is asking EyeSee AI”');
await quest.waitForTimeout(600);
check(!(await serverState()).aiListening.patient, 'releasing ✦ AI ends the question');

// ---- controller ray: point at the hand panel's "💬 気持ち" button and pull the trigger.
await quest.evaluate(() => { window.__xr.primaryInputMode = 'controller'; });
await quest.waitForTimeout(300);
const rayResult = await quest.evaluate(async () => {
  const { THREE, panels } = window.__eyesee;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const work = panels.work;
  const r = work.regions.find((x) => x.x > 300 && x.x < 600 && x.y > work.H - 200);
  if (!r) return 'no feelings region';
  const uv = new THREE.Vector2((r.x + r.w / 2) / work.W, 1 - (r.y + r.h / 2) / work.H);
  const target = work.mesh.localToWorld(new THREE.Vector3((uv.x - 0.5) * work.w, (uv.y - 0.5) * work.h, 0));
  const c = window.__xr.controllers.right;
  const from = new THREE.Vector3(0.62, 1.15, 0.2);
  c.position.set(from.x, from.y, from.z);
  const m = new THREE.Matrix4().lookAt(from, target, new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  c.quaternion.set(q.x, q.y, q.z, q.w);
  await wait(200);
  c.updateButtonValue('trigger', 1);
  await wait(200);
  c.updateButtonValue('trigger', 0);
  await wait(300);
  return window.__eyesee.workMode;
});
check(rayResult === 'feelings', `controller ray + trigger opens the feelings panel (work mode: ${rayResult})`);

await quest.screenshot({ path: path.resolve(process.env.SHOT_DIR || '.', 'xr-test.png') });
await browser.close();
if (logs.length) console.log(logs.join('\n'));
console.log(failures ? `\n${failures} check(s) failed` : '\nall XR checks passed');
process.exit(failures ? 1 : 0);

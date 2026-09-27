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

// ---- hand poke helper: move the right hand so its index fingertip pokes a point along a normal
await quest.evaluate(() => { window.__xr.primaryInputMode = 'hand'; window.__xr.hands.right.poseId = 'point'; });
await quest.waitForTimeout(300);
async function pokeAt(target, holdMs = 400) {
  return quest.evaluate(async ([target, holdMs]) => {
    const { THREE, buttons, panels, renderer } = window.__eyesee;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let face, normal, pressedCheck;
    if (target.button) {
      const btn = buttons[target.button];
      face = btn.localToWorld(new THREE.Vector3(0, 0, btn.userData.face));
      normal = new THREE.Vector3(0, 0, 1).transformDirection(btn.matrixWorld);
      pressedCheck = () => btn.scale.x < 0.99;
    } else {
      const panel = panels[target.panel];
      const r = panel.regions.find((x) => x.id === target.region);
      if (!r) return `no region ${target.region}`;
      const uv = { x: (r.x + r.w / 2) / panel.W, y: 1 - (r.y + r.h / 2) / panel.H };
      face = panel.mesh.localToWorld(new THREE.Vector3((uv.x - 0.5) * panel.w, (uv.y - 0.5) * panel.h, 0));
      normal = new THREE.Vector3(0, 0, 1).transformDirection(panel.mesh.matrixWorld);
      pressedCheck = () => true;
    }
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
    const moveTip = async (p) => { const q = p.clone().sub(off); hand.position.set(q.x, q.y, q.z); await wait(120); };
    await moveTip(face.clone().addScaledVector(normal, 0.06));
    await moveTip(face.clone().addScaledVector(normal, 0.02));
    await moveTip(face.clone().addScaledVector(normal, -0.01));
    await wait(holdMs);
    const pressed = pressedCheck();
    await moveTip(face.clone().addScaledVector(normal, 0.06));
    return pressed ? 'pressed' : 'not pressed';
  }, [target, holdMs]);
}

const before = (await serverState()).entries.length;
check((await pokeAt({ panel: 'toolbar', region: 'isee' })) === 'pressed', 'finger poke on the toolbar “わかった”');
await quest.waitForTimeout(500);
const afterISee = await serverState();
check(afterISee.entries.slice(before).some((e) => e.kind === 'event' && e.event.type === 'isee' && e.speaker === 'patient'), '“わかった” reaches the doctor as “I see”');

// AI orb: press-and-hold should flag aiListening while held.
const holdCheck = quest.evaluate(() => new Promise((r) => { const t = setInterval(() => { if (window.__eyesee.state?.aiListening?.patient) { clearInterval(t); r(true); } }, 50); setTimeout(() => { clearInterval(t); r(false); }, 3000); }));
check((await pokeAt({ button: 'aiBtn' }, 900)) === 'pressed', 'finger poke presses the AI orb');
check(await holdCheck, 'holding the AI orb tells the doctor “patient is asking AI”');
await quest.waitForTimeout(600);
check(!(await serverState()).aiListening.patient, 'releasing the AI orb ends the question');

// ---- controller ray: the doctor opens Feelings; the patient picks one with ray + trigger.
await phone.evaluate(() => window.__eyesee.link.send({ type: 'stage', stage: { tool: 'feelings' } }));
await quest.waitForTimeout(900);
await quest.evaluate(() => { window.__xr.primaryInputMode = 'controller'; });
await quest.waitForTimeout(300);
async function rayClick(panelName, regionId, from = [0.3, 1.2, 0.2]) {
  return quest.evaluate(async ([panelName, regionId, from]) => {
    const { THREE, panels } = window.__eyesee;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const panel = panels[panelName];
    const r = panel.regions.find((x) => x.id === regionId);
    if (!r) return `no region ${regionId}`;
    const target = panel.mesh.localToWorld(new THREE.Vector3(((r.x + r.w / 2) / panel.W - 0.5) * panel.w, (0.5 - (r.y + r.h / 2) / panel.H) * panel.h, 0));
    const c = window.__xr.controllers.right;
    const o = new THREE.Vector3(...from);
    c.position.set(o.x, o.y, o.z);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(o, target, new THREE.Vector3(0, 1, 0)));
    c.quaternion.set(q.x, q.y, q.z, q.w);
    await wait(250);
    c.updateButtonValue('trigger', 1);
    await wait(150);
    c.updateButtonValue('trigger', 0);
    await wait(400);
    return 'ok';
  }, [panelName, regionId, from]);
}
await rayClick('sheet', 'f:anxious');
await quest.waitForTimeout(500);
check((await serverState()).entries.some((e) => e.kind === 'event' && e.event.type === 'feeling' && e.event.id === 'anxious'), 'controller ray + trigger picks a feeling on the sheet');

// ---- pinch-drag scroll on the conversation window
await phone.evaluate(async () => { for (let i = 0; i < 8; i++) window.__eyesee.link.send({ type: 'text', text: `Line ${i}: we will talk about your symptoms and the plan in detail today.` }); });
await quest.waitForTimeout(1500);
const scrolled = await quest.evaluate(async () => {
  const { THREE, panels, scroll } = window.__eyesee;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const conv = panels.conv;
  const c = window.__xr.controllers.right;
  const o = new THREE.Vector3(0.3, 1.2, 0.2);
  c.position.set(o.x, o.y, o.z);
  const aim = async (v) => {
    const p = conv.mesh.localToWorld(new THREE.Vector3(0, v * conv.h, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(o, p, new THREE.Vector3(0, 1, 0)));
    c.quaternion.set(q.x, q.y, q.z, q.w);
    await wait(60);
  };
  await aim(0.2);
  c.updateButtonValue('trigger', 1);
  for (let k = 0; k <= 10; k++) await aim(0.2 - k * 0.04);
  c.updateButtonValue('trigger', 0);
  await wait(300);
  return Math.round(scroll.y);
});
check(scrolled > 40, `pinch-drag scrolls the conversation back (${scrolled}px)`);

// ---- body map: the doctor opens it, the patient points at the chest with the controller ray.
await phone.evaluate(() => window.__eyesee.link.send({ type: 'stage', stage: { tool: 'body' } }));
await quest.waitForFunction(() => window.__eyesee.stageObj?.regionAt, null, { timeout: 8000 }).catch(() => {});
const bodyResult = await quest.evaluate(async () => {
  const { THREE, stageObj } = window.__eyesee;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!stageObj) return 'body not loaded';
  const target = stageObj.object.localToWorld(new THREE.Vector3(0.0, 1.3, 0.2));
  const c = window.__xr.controllers.right;
  const from = new THREE.Vector3(0.62, 1.2, 0.2);
  c.position.set(from.x, from.y, from.z);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from, target, new THREE.Vector3(0, 1, 0)));
  c.quaternion.set(q.x, q.y, q.z, q.w);
  await wait(200);
  c.updateButtonValue('trigger', 1);
  await wait(200);
  c.updateButtonValue('trigger', 0);
  await wait(600);
  return window.__eyesee.state.stage?.points?.map((p) => p.region.id).join(',') || 'no point';
});
check(/chest/.test(bodyResult), `pointing at the body's chest records a pain location (${bodyResult})`);

await quest.screenshot({ path: path.resolve(process.env.SHOT_DIR || '.', 'xr-test.png') });
await browser.close();
if (logs.length) console.log(logs.join('\n'));
console.log(failures ? `\n${failures} check(s) failed` : '\nall XR checks passed');
process.exit(failures ? 1 : 0);

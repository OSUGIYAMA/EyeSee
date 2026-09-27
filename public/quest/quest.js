// EyeSee — the patient's headset (Meta Quest, WebXR), in the visionOS idiom.
// The conversation is the interface: one glass window of text in the patient's own language,
// everything else appears only when it has a job to do.
import * as THREE from 'three';
import { Link, params } from '/shared/net.js';
import { Recorder } from '/shared/recorder.js';
import { PAIN_TYPES, FEELINGS, MODELS, LANGUAGES } from '/shared/catalog.js';
import { readFor } from '/shared/entries.js';
import { Panel, C, glass, rr, text, measure, para, paraHeight, button, spinner, dots, orb, capsuleMesh } from './panel.js';
import { Interact } from './interact.js';

const { room } = params();
localStorage.setItem('eyesee.room', room);
const link = new Link({ room, role: 'patient' });
let S = null;
let caps = {};
let presence = { doctor: 0, patient: 0 };
const now = () => performance.now() / 1000;

// ================================================================ language packs

let pack = {};
let packEn = {};
let packLang = null; // set only once the pack has arrived, so every drawing keyed on it redraws
let packWanted = null;
async function loadPack(lang) {
  if (packWanted === lang) return;
  packWanted = lang;
  const [p, en] = await Promise.all([fetch(`/api/i18n/${lang}`).then((r) => r.json()), Object.keys(packEn).length ? packEn : fetch('/api/i18n/en').then((r) => r.json())]);
  if (packWanted !== lang) return;
  pack = p;
  packEn = en;
  packLang = lang;
  document.documentElement.lang = lang;
  layoutCache.clear();
  intro();
  invalidate();
}
const t = (key) => pack[`ui.${key}`] ?? packEn[`ui.${key}`] ?? '';
const tk = (key, fallback = '') => pack[key] ?? packEn[key] ?? fallback;

// ================================================================ scene

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('stage').append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 80);
camera.position.set(0, 1.6, 0);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xf4f7ff, 0x40454f, 1.5));
const key = new THREE.DirectionalLight(0xffffff, 1.8);
key.position.set(1, 3, 2);
scene.add(key);

// A calm environment for VR mode (hidden in passthrough).
const env = new THREE.Mesh(
  new THREE.SphereGeometry(40, 48, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){ float h = vP.y;
      vec3 top = vec3(0.10,0.12,0.16), hor = vec3(0.28,0.30,0.34), low = vec3(0.12,0.12,0.13);
      vec3 c = h > 0.0 ? mix(hor, top, pow(smoothstep(0.0, 0.8, h), 0.7)) : mix(hor, low, smoothstep(0.0, 0.2, -h));
      gl_FragColor = vec4(c, 1.0); }`,
  }),
);
env.userData.noHit = true;
scene.add(env);

const uiRoot = new THREE.Group();
uiRoot.position.set(0, 1.6, 0);
scene.add(uiRoot);
const floorRoot = new THREE.Group();
scene.add(floorRoot);
const ix = new Interact(renderer, camera, scene);

const place = (obj, x, y, z, ry = 0, rx = 0, parent = uiRoot) => {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, 0, 'YXZ');
  parent.add(obj);
  return obj;
};

// ================================================================ motion

// Everything that appears or changes eases in; nothing pops.
const tweens = new Set();
function tween(obj, props, ms = 280, ease = (k) => 1 - Math.pow(1 - k, 3)) {
  for (const tw of tweens) if (tw.obj === obj) tweens.delete(tw);
  const from = {};
  for (const k of Object.keys(props)) from[k] = obj[k];
  tweens.add({ obj, from, props, t0: now(), dur: ms / 1000, ease });
}
function stepTweens() {
  const n = now();
  for (const tw of tweens) {
    const k = Math.min(1, (n - tw.t0) / tw.dur);
    const e = tw.ease(k);
    for (const [p, to] of Object.entries(tw.props)) tw.obj[p] = tw.from[p] + (to - tw.from[p]) * e;
    if (k >= 1) tweens.delete(tw);
  }
}

/** A window that fades and scales in/out. */
class Win {
  constructor(panel, { scaleFrom = 0.96 } = {}) {
    this.panel = panel;
    this.mesh = panel.mesh;
    this.shown = false;
    this.a = 0;
    this.scaleFrom = scaleFrom;
    this.mesh.visible = false;
    panel.material.opacity = 0;
  }
  get opacity() {
    return this.a;
  }
  set opacity(v) {
    this.a = v;
    this.panel.material.opacity = v;
    this.mesh.visible = v > 0.01;
    this.mesh.scale.setScalar(this.scaleFrom + (1 - this.scaleFrom) * v);
    this.mesh.userData.interactive = v > 0.5;
  }
  show(on) {
    if (on === this.shown) return;
    this.shown = on;
    tween(this, { opacity: on ? 1 : 0 }, on ? 320 : 200);
  }
}

// ================================================================ windows

const conv = new Panel({ w: 1.2, h: 0.8, ppm: 1100, name: 'conversation' });
place(conv.mesh, 0, 0.08, -1.3);
const grabber = new Panel({ w: 0.12, h: 0.022, ppm: 1600, name: 'grabber' });
place(grabber.mesh, 0, -0.345, -1.29);
const gloss = new Panel({ w: 0.6, h: 0.8, ppm: 1100, name: 'glossary' });
place(gloss.mesh, 0.99, 0.08, -1.02, -0.78);
const sheet = new Panel({ w: 0.64, h: 0.36, ppm: 1300, name: 'sheet' });
place(sheet.mesh, 0, -0.34, -0.56, 0, -0.5);
const toolbar = new Panel({ w: 0.34, h: 0.075, ppm: 1500, name: 'toolbar' });
place(toolbar.mesh, -0.07, -0.5, -0.38, 0.08, -0.9);
const pic = new Panel({ w: 0.5, h: 0.64, ppm: 1100, name: 'picture' });
place(pic.mesh, -0.5, 0.06, -0.98, 0.45);
const partInfo = new Panel({ w: 0.44, h: 0.13, ppm: 1200, name: 'partInfo' });
const stageAnchor = place(new THREE.Group(), -0.74, 0.0, -0.86, 0.7);
stageAnchor.add(partInfo.mesh);
partInfo.mesh.position.set(0, -0.3, 0);
const bodyAnchor = place(new THREE.Group(), -0.95, 0, -1.3, 0.62, 0, floorRoot);
const painGrid = place(new THREE.Group(), 0, -0.04, -0.62);

const glossWin = new Win(gloss);
const sheetWin = new Win(sheet, { scaleFrom: 0.94 });
const picWin = new Win(pic, { scaleFrom: 0.9 });
const infoWin = new Win(partInfo);

// ---- the AI orb: a softly swirling sphere in a glass ring
const orbMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: { t: { value: 0 }, energy: { value: 0.3 } },
  vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float t; uniform float energy; varying vec3 vN; varying vec3 vP;
    vec3 pal(float x){ return 0.55 + 0.45*cos(6.2831*(x + vec3(0.0,0.33,0.67))); }
    void main(){
      float a = atan(vP.y, vP.x) + t*(0.6+energy*1.4) + vP.z*60.0;
      vec3 c = mix(pal(a*0.16 + t*0.05), vec3(0.62,0.36,1.0), 0.25);
      float rim = pow(1.0 - abs(vN.z), 2.0);
      c += rim * (0.35 + energy*0.6);
      gl_FragColor = vec4(c, 0.96);
    }`,
});
const aiBtn = new THREE.Group();
const aiSphere = new THREE.Mesh(new THREE.SphereGeometry(0.036, 48, 32), orbMat);
aiBtn.add(aiSphere);
const aiRing = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.0035, 12, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
aiRing.userData.noHit = true;
aiBtn.add(aiRing);
aiBtn.userData.radius = 0.05;
aiBtn.userData.face = 0.036;
place(aiBtn, 0.24, -0.49, -0.4, -0.3, -0.7);
let aiHint = null;
function setAiHint(on) {
  if (!aiHint && on) {
    aiHint = capsuleMesh(t('holdToAsk'), { h: 0.03 });
    aiHint.mesh.position.set(0, 0.075, 0);
    aiBtn.add(aiHint.mesh);
    aiHint.material.opacity = 0;
    aiHint.mesh.userData.noHit = true;
  }
  if (aiHint) tween(aiHint.material, { opacity: on ? 1 : 0 }, 180);
}

// ================================================================ hands in front of the UI

// In passthrough the real hands must appear in front of virtual panels. Joint spheres and bone
// capsules drawn into the depth buffer only (no colour) cut the hand's shape out of everything behind.
const FINGERS = [
  ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ...['index', 'middle', 'ring', 'pinky'].map((f) => ['wrist', `${f}-finger-metacarpal`, `${f}-finger-phalanx-proximal`, `${f}-finger-phalanx-intermediate`, `${f}-finger-phalanx-distal`, `${f}-finger-tip`]),
];
const BONES = FINGERS.flatMap((ch) => ch.slice(1).map((j, i) => [ch[i], j]));
const occluderMat = new THREE.MeshBasicMaterial({ colorWrite: false });
const handVisibleMat = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.6 });
class HandOccluder {
  constructor(hand) {
    this.hand = hand;
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), occluderMat, 25);
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1), occluderMat, BONES.length);
    this.palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), occluderMat);
    for (const m of [this.joints, this.bones, this.palm]) {
      m.renderOrder = -10;
      m.frustumCulled = false;
      m.userData.noHit = true;
      m.visible = false;
      scene.add(m);
    }
    this.m = new THREE.Matrix4();
    this.p = new THREE.Vector3();
    this.q = new THREE.Vector3();
    this.mid = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.s = new THREE.Vector3();
  }
  setVisible(material) {
    for (const m of [this.joints, this.bones, this.palm]) m.material = material;
  }
  update() {
    const J = this.hand.joints;
    const ok = !!(renderer.xr.isPresenting && J && J.wrist && J.wrist.visible);
    for (const m of [this.joints, this.bones, this.palm]) m.visible = ok;
    if (!ok) return;
    const { p, q, mid, quat, s } = this;
    const up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (const name in J) {
      if (i >= 25) break;
      const r = (J[name].jointRadius || 0.008) * 1.1;
      J[name].getWorldPosition(p);
      this.m.compose(p, quat.identity(), s.set(r, r, r));
      this.joints.setMatrixAt(i++, this.m);
    }
    this.joints.count = i;
    this.joints.instanceMatrix.needsUpdate = true;
    BONES.forEach(([a, b], k) => {
      if (!J[a] || !J[b]) return;
      J[a].getWorldPosition(p);
      J[b].getWorldPosition(q);
      const r = ((J[a].jointRadius || 0.008) + (J[b].jointRadius || 0.008)) * 0.55;
      mid.addVectors(p, q).multiplyScalar(0.5);
      quat.setFromUnitVectors(up, q.clone().sub(p).normalize());
      this.m.compose(mid, quat, s.set(r, p.distanceTo(q), r));
      this.bones.setMatrixAt(k, this.m);
    });
    this.bones.instanceMatrix.needsUpdate = true;
    // Palm: an ellipsoid between the wrist and the middle-finger knuckle.
    if (J['middle-finger-phalanx-proximal']) {
      J.wrist.getWorldPosition(p);
      J['middle-finger-phalanx-proximal'].getWorldPosition(q);
      this.palm.position.lerpVectors(p, q, 0.55);
      this.palm.quaternion.setFromUnitVectors(up, q.clone().sub(p).normalize());
      this.palm.scale.set(0.042, p.distanceTo(q) * 0.55, 0.018);
    }
  }
}
const occluders = [0, 1].map((i) => new HandOccluder(renderer.xr.getHand(i)));

// ================================================================ scrolling

/** Pinch/drag scrolling with momentum and rubber-band edges. `y` = px scrolled back from the newest. */
class Scroller {
  constructor(fromBottom = true) {
    this.y = 0;
    this.v = 0;
    this.max = 0;
    this.drag = null;
    this.sign = fromBottom ? 1 : -1;
  }
  press(uvY, H) {
    this.drag = { y0: uvY * H, s0: this.y, moved: 0, last: uvY * H, lt: now() };
    this.v = 0;
  }
  move(uvY, H) {
    if (!this.drag) return false;
    const y = uvY * H;
    const d = (y - this.drag.y0) * this.sign;
    this.drag.moved = Math.max(this.drag.moved, Math.abs(d));
    const n = now();
    this.v = (-(y - this.drag.last) * this.sign) / Math.max(1e-3, n - this.drag.lt);
    this.drag.last = y;
    this.drag.lt = n;
    let s = this.drag.s0 - d;
    if (s < 0) s *= 0.35;
    if (s > this.max) s = this.max + (s - this.max) * 0.35;
    this.y = s;
    return this.drag.moved > 10;
  }
  release() {
    const wasDrag = !!this.drag && this.drag.moved > 10;
    this.drag = null;
    if (!wasDrag) this.v = 0;
    return wasDrag;
  }
  step(dt) {
    if (this.drag) return true;
    let moving = false;
    if (Math.abs(this.v) > 5) {
      this.y += this.v * dt;
      this.v *= Math.pow(0.93, dt * 60);
      moving = true;
    } else this.v = 0;
    const target = Math.min(this.max, Math.max(0, this.y));
    if (Math.abs(target - this.y) > 0.5) {
      this.y += (target - this.y) * Math.min(1, dt * 12);
      moving = true;
    } else this.y = target;
    return moving;
  }
  toStart() {
    this.v = -Math.max(1500, this.y * 6);
  }
}
const convScroll = new Scroller(true);
const glossScroll = new Scroller(false);

// ================================================================ state

link.on('state', (s) => {
  if (S && S.sessionId !== s.sessionId) {
    convScroll.y = 0;
    selected = null;
    localFeelings = false;
    seen.clear();
    layoutCache.clear();
  }
  S = s;
  caps = s.caps || caps;
  loadPack(s.patientLang);
  invalidate();
});
link.on('presence', (m) => {
  presence = m.roles;
  invalidate();
});
link.on('link', () => invalidate());

let dirty = true;
function invalidate() {
  dirty = true;
}

// ================================================================ conversation window

const seen = new Map(); // entry id → first time shown (for the slide-in)
let selected = null; // a doctor line the patient tapped (targets わかった / わからない)
const layoutCache = new Map();
const PAD = 64;

/** What the patient sees in the conversation, in order. */
function convItems() {
  const items = [];
  for (const e of S.entries) {
    if (e.kind === 'speech') items.push({ e, type: e.speaker === 'doctor' ? 'doctor' : 'me' });
    else if (e.kind === 'ai') items.push({ e, type: 'ai' });
    else if (e.kind === 'event') {
      const ty = e.event.type;
      if (ty === 'confused' && e.help?.patientExplanation) items.push({ e, type: 'help' });
      else if (['pain', 'body', 'feeling', 'signature'].includes(ty)) items.push({ e, type: 'caption' });
    } else if (e.kind === 'system' && ['mode', 'language', 'signed'].includes(e.event?.type)) items.push({ e, type: 'caption' });
  }
  if (S.speaking?.doctor) items.push({ type: 'typing-doctor', e: { id: 'typing-doctor', v: 0 } });
  if (rec.speaking && !aiHolding) items.push({ type: 'typing-me', e: { id: 'typing-me', v: 0 } });
  return items;
}

function captionText(e) {
  const ev = e.event || {};
  if (ev.type === 'pain') return `${t('pain')}  ${tk(`pain.${ev.id}.name`, '')}${ev.intensity != null ? ` · ${ev.intensity}/10` : ''}`;
  if (ev.type === 'body') return `${t('whereItHurts')}  ${(ev.regions || []).map((r) => tk(`part.body.${r.id}.label`, r.label?.en || '')).join(' · ')}`;
  if (ev.type === 'feeling') return `${t('feeling')}  ${tk(`feeling.${ev.id}`, '')}`;
  if (ev.type === 'signature') return e.speaker === 'patient' ? t('signed') : '';
  if (ev.type === 'mode') return tk(`mode.${ev.mode}`, '');
  if (ev.type === 'language') return LANGUAGES[ev.lang]?.native || '';
  if (ev.type === 'signed') return t('recorded');
  return '';
}

const stripReading = (s) => String(s || '').replace(/（[^）]*）|\([^)]*\)/g, '').trim();

/** Measure one item (cached) → { h, draw(ctx, x, y) }. */
function layout(ctx, item, w) {
  const e = item.e;
  const lang = S.patientLang;
  const k = `${item.type}:${e.v}:${lang}:${fontsReady}:${packLang}:${selected === e.id}`;
  const hit = layoutCache.get(e.id);
  if (hit && hit.k === k) return hit;
  let L;
  if (item.type === 'doctor') {
    const r = readFor(e, lang);
    const main = r.main || '';
    const sub = r.sub && r.subLang !== lang ? r.sub : '';
    const marks = (e.terms || []).filter((x) => x.audience === 'patient').map((x) => stripReading(x.display));
    const hMain = main ? paraHeight(ctx, main, w, 42, 600, 1.34) : 42;
    const hSub = sub ? paraHeight(ctx, sub, w, 24, 500, 1.35, 3) + 10 : 0;
    const mark = e.iSee ? t('iSee') : e.confused ? t('notSure') : '';
    const h = 32 + hMain + hSub + (mark ? 34 : 0);
    L = {
      h,
      draw(c, x, y) {
        if (selected === e.id) {
          rr(c, x - 24, y - 12, w + 48, h + 18, 26);
          c.fillStyle = 'rgba(255,255,255,0.08)';
          c.fill();
        }
        text(c, t('doctor'), x, y, 22, C.text3, 600);
        let cy = y + 32;
        if (main) cy += para(c, main, x, cy, w, 42, e.pending ? C.text2 : C.text, 600, 1.34, undefined, { mark: marks });
        else dots(c, x, cy + 12, 14, now(), C.text2), (cy += 42);
        if (sub) cy += 10 + para(c, sub, x, cy + 6, w, 24, C.text3, 500, 1.35, 3);
        if (mark) text(c, mark, x, cy + 8, 22, e.iSee ? C.green : C.orange, 600);
      },
    };
  } else if (item.type === 'me') {
    const r = readFor(e, lang);
    const main = r.main || '';
    const sub = r.sub && r.subLang !== lang ? r.sub : '';
    const bw = Math.min(w * 0.8, Math.max(160, measure(ctx, main || 'xxxxxx', 32, 500) + 48));
    const hMain = main ? paraHeight(ctx, main, bw - 48, 32, 500, 1.34) : 32;
    const hSub = sub ? paraHeight(ctx, sub, w * 0.8, 22, 500, 1.35, 3) + 10 : 0;
    const h = hMain + 32 + hSub;
    L = {
      h,
      draw(c, x, y) {
        const bx = x + w - bw;
        rr(c, bx, y, bw, hMain + 32, 30);
        c.fillStyle = 'rgba(10,132,255,0.92)';
        c.fill();
        if (main) para(c, main, bx + 24, y + 16, bw - 48, 32, '#fff', 500, 1.34);
        else dots(c, bx + 24, y + 22, 12, now(), '#fff');
        if (sub) para(c, sub, x + w * 0.2, y + hMain + 32 + 10, w * 0.8, 22, C.text3, 500, 1.35, 3, { align: 'right' });
      },
    };
  } else if (item.type === 'ai') {
    const a = e.ai;
    const q = `${a.from === 'doctor' ? t('doctorAsked') : t('youAsked')}  ${a.question?.patient || ''}`;
    const ans = a.pending ? '' : a.answer?.patient || '';
    const om = (a.omissions || []).map((o) => `・${o.patient}`).join('\n');
    const hQ = paraHeight(ctx, q, w - 44, 22, 500, 1.35, 2);
    const hA = ans ? paraHeight(ctx, ans, w - 44, 32, 500, 1.4) : 34;
    const hO = om ? paraHeight(ctx, om, w - 44, 26, 500, 1.4) + 12 : 0;
    const h = hQ + 12 + hA + hO;
    L = {
      h,
      draw(c, x, y) {
        orb(c, x + 13, y + 13, 12);
        para(c, q, x + 44, y, w - 44, 22, C.text3, 500, 1.35, 2);
        const ay = y + hQ + 12;
        if (ans) para(c, ans, x + 44, ay, w - 44, 32, C.text, 500, 1.4);
        else dots(c, x + 44, ay + 10, 12, now(), C.text2);
        if (om) para(c, om, x + 44, ay + hA + 12, w - 44, 26, C.text2, 500, 1.4);
      },
    };
  } else if (item.type === 'help') {
    const s = e.help.patientExplanation;
    const h = paraHeight(ctx, s, w - 44, 30, 500, 1.4);
    L = { h, draw: (c, x, y) => (orb(c, x + 13, y + 15, 12), para(c, s, x + 44, y, w - 44, 30, C.text2, 500, 1.4)) };
  } else if (item.type === 'caption') {
    const s = captionText(e);
    const h = s ? paraHeight(ctx, s, w, 22, 500, 1.35) : 0;
    L = { h, draw: (c, x, y) => s && para(c, s, x, y, w, 22, C.text3, 500, 1.35, undefined, { align: 'center' }) };
  } else if (item.type === 'typing-doctor') L = { h: 60, draw: (c, x, y) => (text(c, t('doctor'), x, y, 22, C.text3, 600), dots(c, x, y + 38, 14, now(), C.text2)) };
  else L = { h: 60, draw: (c, x, y) => (rr(c, x + w - 110, y, 110, 60, 30), (c.fillStyle = 'rgba(10,132,255,0.92)'), c.fill(), dots(c, x + w - 84, y + 23, 12, now(), '#fff')) };
  L.k = k;
  if (!item.type.startsWith('typing')) layoutCache.set(e.id, L);
  return L;
}

function drawConversation() {
  const items = convItems();
  const u = S.understanding;
  const top = S.mode === 'consent' ? 132 : 58;
  const bottom = conv.H - 52;
  const w = conv.W - PAD * 2;
  const ctx = conv.ctx;
  const hs = items.map((it) => layout(ctx, it, w).h);
  const gaps = items.map((it, i) => (i === 0 ? 0 : it.type === 'caption' || items[i - 1].type === 'caption' ? 22 : 34));
  const total = hs.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
  convScroll.max = Math.max(0, total - (bottom - top));
  const n = now();
  let animating = false;
  conv.draw((c, p) => {
    glass(c, 0, 0, p.W, p.H, 60);
    // Consent phase: how far shared understanding has come.
    if (S.mode === 'consent') {
      const thr = caps.consentThreshold ?? 8;
      text(c, t('understanding'), PAD, 46, 24, C.text2, 600);
      const segW = 34, gap = 8, x0 = p.W - PAD - 10 * segW - 9 * gap;
      for (let i = 0; i < 10; i++) {
        rr(c, x0 + i * (segW + gap), 56, segW, 10, 5);
        c.fillStyle = i < u.score ? (u.score >= thr ? C.green : '#ffffff') : C.fill;
        c.fill();
      }
      text(c, `${u.score}/10`, x0 - 20, 46, 24, C.text2, 600, 'right');
      c.fillStyle = C.sep;
      c.fillRect(PAD, 104, p.W - PAD * 2, 2);
    }
    if (!(link.connected && presence.doctor)) text(c, t('disconnected'), p.W / 2, S.mode === 'consent' ? 12 : 18, 20, C.orange, 600, 'center');

    c.save();
    rr(c, 0, top - 8, p.W, bottom - top + 16, 0);
    c.clip();
    if (!items.length) para(c, t('empty'), PAD, (top + bottom) / 2 - 24, w, 30, C.text3, 500, 1.4, 2, { align: 'center' });
    let y = bottom + convScroll.y;
    for (let i = items.length - 1; i >= 0; i--) {
      const L = layout(c, items[i], w);
      const y0 = y - L.h;
      if (y < top - 20) break;
      if (y0 < bottom + 20) {
        const id = items[i].e.id;
        if (!seen.has(id)) seen.set(id, n);
        const k = Math.min(1, (n - seen.get(id)) / 0.38);
        if (k < 1 || items[i].e.pending || items[i].type.startsWith('typing')) animating = true;
        const ease = 1 - Math.pow(1 - k, 3);
        c.globalAlpha = ease;
        L.draw(c, PAD, y0 + (1 - ease) * 26);
        c.globalAlpha = 1;
        if (items[i].type === 'doctor' && !items[i].e.pending) p.region(0, Math.max(top, y0), p.W, L.h, () => select(id), `line:${id}`);
      }
      y = y0 - gaps[i];
    }
    c.restore();
    // Scrolled back: a small capsule returns to the newest line.
    if (convScroll.y > 60) button(p, p.W / 2 - 60, bottom - 22, 120, 50, '↓', () => convScroll.toStart(), { id: 'latest', size: 26 });
  });
  return animating;
}

function select(id) {
  selected = selected === id ? null : id;
  invalidate();
}

ix.add({
  object: conv.mesh,
  kind: 'panel',
  onHover: (h) => conv.setHover(h?.region?.id ?? null),
  onPress: (h) => convScroll.press(h.uv.y, conv.H),
  onDrag: (h) => convScroll.move(h.uv.y, conv.H) && (dirty = true),
  onRelease: (h) => {
    if (!convScroll.release() && h?.region) h.region.action?.();
  },
});
conv.onChange = invalidate;

// ---- the window bar under the conversation: tap to bring everything back in front
grabber.draw((c, p) => {
  rr(c, 0, 0, p.W, p.H, p.H / 2);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fill();
});
ix.add({ object: grabber.mesh, kind: 'panel', onPress: () => (needsRecenter = true) });

// ================================================================ glossary window

function glossTerms() {
  return S.entries.filter((e) => e.kind === 'speech').flatMap((e) => (e.terms || []).filter((x) => x.audience === 'patient').map((x) => ({ ...x, entryId: e.id }))).reverse();
}

function drawGlossary() {
  const terms = glossTerms();
  glossWin.show(terms.length > 0 && !S.consent);
  if (!terms.length) return false;
  const ctx = gloss.ctx;
  const w = gloss.W - PAD * 2;
  const rows = terms.map((x) => {
    const hD = paraHeight(ctx, x.display, w, 34, 600, 1.3, 2);
    const hE = paraHeight(ctx, x.explanation, w, 25, 500, 1.45, 5);
    return { x, hD, hE, h: hD + 10 + hE + (caps.image ? 70 : 0) };
  });
  const top = 116, bottom = gloss.H - 40;
  const total = rows.reduce((a, r) => a + r.h + 34, 0);
  glossScroll.max = Math.max(0, total - (bottom - top));
  gloss.draw((c, p) => {
    glass(c, 0, 0, p.W, p.H, 60);
    text(c, t('words'), PAD, 46, 32, C.text, 700);
    c.save();
    rr(c, 0, top - 6, p.W, bottom - top + 12, 0);
    c.clip();
    let y = top - glossScroll.y;
    rows.forEach((r, i) => {
      if (y > bottom || y + r.h < top - 40) return (y += r.h + 34);
      if (i) (c.fillStyle = C.sep), c.fillRect(PAD, y - 17, w, 2);
      para(c, r.x.display, PAD, y, w, 34, C.text, 600, 1.3, 2);
      para(c, r.x.explanation, PAD, y + r.hD + 10, w, 25, C.text2, 500, 1.45, 5);
      if (caps.image) {
        const by = y + r.hD + 10 + r.hE + 16;
        const label = r.x.image === 'pending' ? t('drawing') : t('showPicture');
        button(p, PAD, by, measure(c, label, 24, 600) + 56, 50, label, r.x.image === 'pending' ? null : () => link.send({ type: 'termImage', entryId: r.x.entryId, termId: r.x.id }), { id: `pic:${r.x.id}`, size: 24 });
      }
      y += r.h + 34;
    });
    c.restore();
  }, JSON.stringify([rows.map((r) => r.x.id + r.x.image), Math.round(glossScroll.y), packLang, fontsReady, caps.image]));
  return false;
}
ix.add({
  object: gloss.mesh,
  kind: 'panel',
  onHover: (h) => gloss.setHover(h?.region?.id ?? null),
  onPress: (h) => glossScroll.press(h.uv.y, gloss.H),
  onDrag: (h) => glossScroll.move(h.uv.y, gloss.H) && (dirty = true),
  onRelease: (h) => {
    if (!glossScroll.release() && h?.region) h.region.action?.();
  },
});
gloss.onChange = invalidate;

const images = new Map();
function loadImage(url) {
  if (!images.has(url)) {
    const img = new Image();
    img.onload = () => {
      img.loadedAt = now();
      invalidate();
    };
    img.src = url;
    images.set(url, img);
  }
  const img = images.get(url);
  return img.complete && img.naturalWidth ? img : null;
}

// ================================================================ picture window (generated illustration)

function drawPicture() {
  const st = S.consent ? null : S.stage;
  const on = st?.tool === 'image';
  picWin.show(on);
  if (!on) return false;
  const img = st.url ? loadImage(st.url) : null;
  const n = now();
  const fade = img ? Math.min(1, (n - (img.loadedAt || n - 1)) / 0.6) : 0;
  pic.draw((c, p) => {
    glass(c, 0, 0, p.W, p.H, 52);
    const s = p.W - 64;
    c.save();
    rr(c, 32, 32, s, s, 34);
    c.clip();
    if (img && fade > 0) {
      c.globalAlpha = fade;
      c.drawImage(img, 32, 32, s, s);
      c.globalAlpha = 1;
    }
    if (!img || fade < 1) {
      // A soft shimmer while the picture is being drawn.
      c.globalAlpha = 1 - fade;
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fillRect(32, 32, s, s);
      const x = (((n * 0.5) % 1.4) - 0.2) * s;
      const g = c.createLinearGradient(32 + x - 180, 0, 32 + x + 180, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(32, 32, s, s);
      spinner(c, 32 + s / 2, 32 + s / 2 - 12, 26, n);
      text(c, t('drawing'), 32 + s / 2, 32 + s / 2 + 34, 24, C.text2, 600, 'center');
      c.globalAlpha = 1;
    }
    c.restore();
    const cy = 32 + s + 26;
    para(c, stripReading(st.caption?.patient || ''), 36, cy, p.W - 72, 32, C.text, 700, 1.3, 1);
    if (st.caption?.detail) para(c, st.caption.detail, 36, cy + 46, p.W - 72, 22, C.text2, 500, 1.4, 3);
    button(p, p.W - 92, 46, 50, 50, '×', () => link.send({ type: 'closeImage' }), { id: 'close', size: 32, weight: 400 });
  });
  return !img || fade < 1;
}
ix.add({ object: pic.mesh, kind: 'panel', onHover: (h) => pic.setHover(h?.region?.id ?? null), onPress: (h) => h.region?.action?.() });
pic.onChange = invalidate;

// ================================================================ task sheet (near the hands)

let localFeelings = false;
let strokes = [];
let stroke = null;
let hoverPain = null;

function sheetMode() {
  const c = S.consent;
  if (c) return c.status === 'cancelled' ? null : `consent-${c.status}`;
  if (localFeelings) return 'feelings';
  const st = S.stage;
  if (!st) return null;
  if (st.tool === 'model') return stageMeta?.steps?.length && stageMeta.id === st.modelId ? 'procedure' : null;
  if (st.tool === 'image') return null;
  return st.tool;
}

function drawSheet() {
  const mode = sheetMode();
  sheetWin.show(!!mode);
  if (!mode) return false;
  const st = S.stage;
  const c = S.consent;
  const n = now();
  let animating = false;
  // While signing, strokes are drawn straight onto the canvas; don't wipe them.
  if (mode === 'consent-signing' && !c.signatures?.patient && stroke) return false;
  sheet.draw((ctx, p) => {
    const { W, H } = p;
    glass(ctx, 0, 0, W, H, 56);
    const X = 56;
    const title = (s, y = 50) => text(ctx, s, X, y, 38, C.text, 700);

    if (mode === 'pain') {
      const pt = PAIN_TYPES.find((x) => x.id === st.type);
      if (!pt) {
        title(t('painTitle'), H - 170);
        const hp = PAIN_TYPES.find((x) => x.id === hoverPain);
        if (hp) para(ctx, tk(`pain.${hp.id}.hint`), X, H - 108, W - X * 2, 28, C.text2, 500, 1.4, 2);
        return;
      }
      title(t('painStrength'), 44);
      const bw = 64, gap = (W - X * 2 - bw * 11) / 10;
      for (let v = 0; v <= 10; v++) button(p, X + v * (bw + gap), 130, bw, bw, String(v), () => link.send({ type: 'painIntensity', v }), { id: `v${v}`, size: 30, selected: st.intensity === v });
      text(ctx, t('painNone'), X, 214, 22, C.text3, 500);
      text(ctx, t('painWorst'), W - X, 214, 22, C.text3, 500, 'right');
      return;
    }

    if (mode === 'feelings') {
      title(t('feelingsTitle'), 44);
      if (localFeelings) button(p, W - X - 150, 36, 150, 60, t('done'), () => ((localFeelings = false), invalidate()), { id: 'done', size: 24 });
      const chosen = new Set([...(st?.tool === 'feelings' ? st.selected || [] : []), ...recentFeelings()]);
      const cols = 4, gw = (W - X * 2 - (cols - 1) * 14) / cols, gh = 62;
      FEELINGS.forEach((f, i) => {
        const x = X + (i % cols) * (gw + 14), y = 120 + Math.floor(i / cols) * (gh + 14);
        button(p, x, y, gw, gh, tk(`feeling.${f.id}`, f.en), () => link.send({ type: 'feeling', id: f.id }), { id: `f:${f.id}`, size: 23, selected: chosen.has(f.id) });
      });
      return;
    }

    if (mode === 'body') {
      title(t('bodyTitle'), 44);
      let x = X;
      for (const pt of st.points || []) {
        const label = tk(`part.body.${pt.region.id}.label`, pt.region.label?.en || '');
        const w = measure(ctx, label, 24, 600) + 44;
        if (x + w > W - X) break;
        rr(ctx, x, 130, w, 54, 27);
        ctx.fillStyle = C.fill;
        ctx.fill();
        text(ctx, label, x + 22, 144, 24, C.text, 600);
        x += w + 12;
      }
      if (st.highlight) text(ctx, t('here'), X, 212, 26, C.orange, 600);
      if (st.points?.length) button(p, X, H - 104, 180, 60, t('clear'), () => link.send({ type: 'bodyClear' }), { id: 'clear', size: 24 });
      return;
    }

    if (mode === 'procedure') {
      const i = st.step || 0;
      const total = stageMeta.steps.length;
      text(ctx, `${t('step')} ${i + 1} / ${total}`, X, 44, 24, C.text3, 600);
      para(ctx, tk(`step.${st.modelId}.${i}`, stageMeta.steps[i]?.en || ''), X, 88, W - X * 2, 32, C.text, 600, 1.4, 3);
      button(p, X, H - 104, 120, 64, '‹', i > 0 ? () => link.send({ type: 'modelStep', step: i - 1 }) : null, { id: 'prev', size: 40, weight: 400 });
      button(p, W - X - 120, H - 104, 120, 64, '›', i < total - 1 ? () => link.send({ type: 'modelStep', step: i + 1 }) : null, { id: 'next', size: 40, weight: 400 });
      return;
    }

    if (mode === 'consent-preparing' || mode === 'consent-precheck') {
      spinner(ctx, W / 2, H / 2 - 20, 26, n);
      text(ctx, t('preparing'), W / 2, H / 2 + 30, 26, C.text2, 600, 'center');
      animating = true;
      return;
    }

    if (mode === 'consent-review') {
      const i = Math.max(0, c.index);
      const cp = c.checkpoints[i];
      text(ctx, `${i + 1} / ${c.checkpoints.length}`, X, 40, 24, C.text3, 600);
      c.checkpoints.forEach((x, j) => {
        ctx.beginPath();
        ctx.arc(W - X - (c.checkpoints.length - 1 - j) * 26 - 6, 54, 6, 0, Math.PI * 2);
        ctx.fillStyle = x.ack === 'understood' ? C.green : x.ack === 'question' ? C.orange : j === i ? C.text : C.fill;
        ctx.fill();
      });
      para(ctx, cp.patient, X, 88, W - X * 2, 34, C.text, 600, 1.42, 4);
      if (cp.ack === 'question') para(ctx, t('questionSent'), X, H - 188, W - X * 2, 22, C.orange, 600, 1.35, 2);
      const bw = (W - X * 2 - 16) / 2;
      button(p, X, H - 110, bw, 76, t('understood'), () => link.send({ type: 'consentAck', cp: cp.id, status: 'understood' }), { id: 'ok', size: 28, prominent: true });
      button(p, X + bw + 16, H - 110, bw, 76, t('question'), () => link.send({ type: 'consentAck', cp: cp.id, status: 'question' }), { id: 'q', size: 28 });
      return;
    }

    if (mode === 'consent-signing') {
      if (c.signatures?.patient) {
        text(ctx, t('signed'), W / 2, H / 2 - 40, 34, C.text, 700, 'center');
        text(ctx, t('waitDoctorSign'), W / 2, H / 2 + 12, 24, C.text2, 500, 'center');
        return;
      }
      title(t('signHere'), 40);
      const pad = { x: X, y: 100, w: W - X * 2, h: H - 210 };
      rr(ctx, pad.x, pad.y, pad.w, pad.h, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(pad.x + 40, pad.y + pad.h - 44, pad.w - 80, 2);
      p.region(pad.x, pad.y, pad.w, pad.h, (r, h) => beginStroke(h), 'pad');
      drawStrokes(ctx);
      button(p, X, H - 94, 190, 64, t('redo'), () => ((strokes = []), invalidate()), { id: 'redo', size: 24 });
      button(p, W - X - 240, H - 94, 240, 64, t('sign'), submitSignature, { id: 'sign', size: 26, prominent: true });
      return;
    }

    if (mode === 'consent-signed') {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2 - 40, 38, 0, Math.PI * 2);
      ctx.fillStyle = C.green;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(W / 2 - 16, H / 2 - 40);
      ctx.lineTo(W / 2 - 4, H / 2 - 27);
      ctx.lineTo(W / 2 + 18, H / 2 - 54);
      ctx.stroke();
      text(ctx, t('recorded'), W / 2, H / 2 + 20, 30, C.text, 700, 'center');
    }
  }, JSON.stringify([mode, st, c && { s: c.status, i: c.index, a: c.checkpoints.map((x) => x.ack), g: Object.keys(c.signatures || {}) }, hoverPain, strokes.length, packLang, fontsReady, stageMeta?.id, mode.startsWith('consent-pre') ? Math.floor(n * 10) : 0]));
  return animating;
}

function recentFeelings() {
  return S.entries.filter((e) => e.kind === 'event' && e.event.type === 'feeling' && Date.now() - Date.parse(e.ts) < 10 * 60e3).map((e) => e.event.id);
}

ix.add({
  object: sheet.mesh,
  kind: 'panel',
  poke: true,
  onHover: (h) => sheet.setHover(h?.region?.id ?? null),
  onPress: (h) => {
    const r = h.region;
    if (!r) return;
    sheet.pressId = r.id;
    r.action?.(r, h);
    invalidate();
    setTimeout(() => ((sheet.pressId = null), invalidate()), 160);
  },
  onDrag: (h) => onSignDrag(h),
  onRelease: () => {
    stroke = null;
    invalidate();
  },
});
sheet.onChange = invalidate;

function beginStroke(h) {
  if (sheetMode() !== 'consent-signing') return;
  stroke = [sheet.uvToPx(h.uv)];
  strokes.push(stroke);
}
function onSignDrag(h) {
  if (!stroke || !h.uv) return;
  const [x, y] = sheet.uvToPx(h.uv);
  const last = stroke[stroke.length - 1];
  if (Math.hypot(x - last[0], y - last[1]) < 3) return;
  stroke.push([x, y]);
  const ctx = sheet.ctx;
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(...last);
  ctx.lineTo(x, y);
  ctx.stroke();
  sheet.texture.needsUpdate = true;
}
function drawStrokes(ctx) {
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.beginPath();
    s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
}
function submitSignature() {
  const pts = strokes.flat();
  if (pts.length < 8) return;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs) - 20, minY = Math.min(...ys) - 20;
  const w = Math.max(...xs) - minX + 20, h = Math.max(...ys) - minY + 20;
  const cv = document.createElement('canvas');
  cv.width = Math.min(1200, w);
  cv.height = Math.min(500, h);
  const ctx = cv.getContext('2d');
  const s = Math.min(cv.width / w, cv.height / h);
  ctx.scale(s, s);
  ctx.translate(-minX, -minY);
  drawStrokes(ctx);
  link.send({ type: 'sign', dataUrl: cv.toDataURL('image/png') });
  strokes = [];
}

// ================================================================ toolbar: mic · I see · I don't understand

let micOn = true;
let micLevel = 0;
let ack = null; // brief confirmation on the pressed segment
function drawToolbar() {
  const n = now();
  const ackOn = ack && n - ack.t < 1.4;
  toolbar.draw((c, p) => {
    const { W, H } = p;
    glass(c, 0, 0, W, H, H / 2);
    const segs = [
      { id: 'mic', w: 130 },
      { id: 'isee', w: (W - 130) / 2 },
      { id: 'no', w: (W - 130) / 2 },
    ];
    let x = 0;
    segs.forEach((s, i) => {
      if (i) (c.fillStyle = C.sep), c.fillRect(x - 1, 24, 2, H - 48);
      const hover = p.hoverId === s.id;
      const pressed = ackOn && ack.id === s.id;
      if (hover || pressed) {
        rr(c, x + 8, 8, s.w - 16, H - 16, (H - 16) / 2);
        c.fillStyle = pressed ? 'rgba(255,255,255,0.92)' : C.fillHover;
        c.fill();
      }
      const col = pressed ? '#000' : C.text;
      if (s.id === 'mic') drawMic(c, x + s.w / 2, H / 2, micOn, micLevel, col);
      else {
        const label = s.id === 'isee' ? t('iSee') : t('notSure');
        const lw = measure(c, label, 32, 600);
        const off = pressed ? 18 : 0;
        text(c, label, x + s.w / 2 + off, H / 2 - 18, 32, col, 600, 'center');
        if (pressed) {
          const cx = x + s.w / 2 + off - lw / 2 - 26;
          c.strokeStyle = s.id === 'isee' ? C.green : C.orange;
          c.lineWidth = 5;
          c.lineCap = 'round';
          c.lineJoin = 'round';
          c.beginPath();
          if (s.id === 'isee') c.moveTo(cx - 10, H / 2), c.lineTo(cx - 2, H / 2 + 8), c.lineTo(cx + 12, H / 2 - 9);
          else c.arc(cx, H / 2, 9, 0, Math.PI * 2);
          c.stroke();
        }
      }
      p.region(x, 0, s.w, H, () => onToolbar(s.id), s.id);
      x += s.w;
    });
  }, JSON.stringify([micOn, Math.round(micLevel * 8), ackOn && ack.id, packLang, fontsReady]));
  return ackOn || (micOn && micLevel > 0.02);
}

function drawMic(c, cx, cy, on, level, col) {
  c.strokeStyle = on ? col : C.text3;
  c.lineWidth = 5;
  c.lineCap = 'round';
  rr(c, cx - 10, cy - 24, 20, 32, 10);
  c.stroke();
  c.beginPath();
  c.arc(cx, cy - 4, 18, 0.15 * Math.PI, 0.85 * Math.PI);
  c.moveTo(cx, cy + 14);
  c.lineTo(cx, cy + 22);
  c.stroke();
  if (!on) {
    c.strokeStyle = C.orange;
    c.beginPath();
    c.moveTo(cx - 22, cy - 26);
    c.lineTo(cx + 22, cy + 24);
    c.stroke();
  } else if (level > 0.02) {
    c.fillStyle = C.green;
    const h = Math.min(28, 6 + level * 60);
    rr(c, cx + 30, cy - h / 2, 6, h, 3);
    c.fill();
  }
}

function onToolbar(id) {
  if (id === 'mic') return toggleMic();
  ack = { id, t: now() };
  link.send({ type: id === 'isee' ? 'isee' : 'confused', entryId: selected });
  selected = null;
  invalidate();
}

ix.add({ object: toolbar.mesh, kind: 'panel', poke: true, onHover: (h) => toolbar.setHover(h?.region?.id ?? null), onPress: (h) => h.region?.action?.() });
toolbar.onChange = invalidate;

async function toggleMic() {
  micOn = !micOn;
  try {
    await rec.setListening(micOn);
  } catch {}
  document.getElementById('micToggle').textContent = micOn ? 'Mic on' : 'Mic off';
  invalidate();
}

// ================================================================ microphone & AI

let aiHolding = false;
const rec = new Recorder({
  onSegment: (blob, meta) => link.postAudio(blob, meta.target, meta.mode).catch(() => {}),
  onSpeaking: (on) => {
    link.send({ type: 'vad', speaking: on });
    invalidate();
  },
  onLevel: (lv) => (micLevel = lv),
  // The headset mic sits next to the wearer's mouth: demand a clear, close voice and skip auto-gain
  // so other people in the room are not written down.
  vad: { minRms: 0.03, factor: 4.5, minSpeech: 0.5, agc: false },
});

async function aiStart() {
  if (aiHolding) return;
  aiHolding = true;
  link.send({ type: 'aiListening', on: true });
  tween(aiBtn.scale, { x: 0.92, y: 0.92, z: 0.92 }, 120);
  try {
    await rec.pttStart('ai');
  } catch {}
}
function aiEnd() {
  if (!aiHolding) return;
  aiHolding = false;
  link.send({ type: 'aiListening', on: false });
  tween(aiBtn.scale, { x: 1, y: 1, z: 1 }, 220);
  rec.pttEnd(true);
}
ix.add({
  object: aiBtn,
  kind: 'button',
  poke: true,
  onHover: (h) => {
    if (!aiHolding) tween(aiBtn.scale, h ? { x: 1.08, y: 1.08, z: 1.08 } : { x: 1, y: 1, z: 1 }, 160);
    setAiHint(!!h);
  },
  onPress: aiStart,
  onRelease: aiEnd,
});

// ================================================================ 3D stage: models, body, pain orbs

let stageKey = '';
let stageObj = null;
let stageMeta = null;
let stageTarget = null;
let stageHolder = null;
let stageLabel = null;
let loadToken = 0;
let targetYaw = 0, targetPitch = 0;

function clearStage() {
  if (stageObj) {
    (stageHolder || stageObj.object).removeFromParent();
    stageObj.dispose?.();
  }
  ix.remove(stageTarget);
  stageLabel?.mesh.removeFromParent();
  stageObj = stageMeta = stageTarget = stageHolder = stageLabel = null;
  infoWin.show(false);
}

function fitHolder(object, size) {
  const box = new THREE.Box3().setFromObject(object);
  const holder = new THREE.Group();
  object.position.sub(box.getCenter(new THREE.Vector3()));
  holder.add(object);
  holder.scale.setScalar(size / Math.max(...box.getSize(new THREE.Vector3()).toArray()));
  return holder;
}

function syncStage() {
  const st = S.consent ? null : S.stage;
  syncPain(st?.tool === 'pain' ? st : null);
  const key = st && (st.tool === 'model' || st.tool === 'body') ? `${st.tool}:${st.modelId || ''}` : '';
  if (key !== stageKey) {
    stageKey = key;
    clearStage();
    const token = ++loadToken;
    const id = st?.tool === 'body' ? 'body' : st?.tool === 'model' ? st.modelId : null;
    if (id)
      import(`/shared/models/${id}.js`).then((mod) => {
        if (token !== loadToken) return;
        stageMeta = mod.meta;
        stageObj = mod.create();
        if (id === 'body') bodyAnchor.add(stageObj.object);
        else {
          stageHolder = fitHolder(stageObj.object, id === 'artery' ? 0.62 : 0.42);
          const s = stageHolder.scale.x;
          stageHolder.scale.setScalar(s * 0.6);
          stageAnchor.add(stageHolder);
          tween(stageHolder.scale, { x: s, y: s, z: s }, 480);
        }
        stageTarget = ix.add({
          object: stageObj.object,
          kind: 'mesh',
          poke: true,
          onPress: (hit) => {
            if (id === 'body') {
              const local = stageObj.object.worldToLocal(hit.point.clone());
              const region = stageObj.regionAt?.(local, hit.object);
              if (region) link.send({ type: 'bodyPoint', region: { id: region.id, label: region.label }, point: local.toArray().map((v) => +v.toFixed(3)) });
            } else {
              let o = hit.object;
              while (o && !o.userData.partId) o = o.parent;
              link.send({ type: 'modelHighlight', part: o?.userData.partId || null });
            }
          },
        });
        applyStage(S.stage);
        invalidate();
      });
  } else applyStage(st);
}

function applyStage(st) {
  if (!stageObj || !st) return;
  stageObj.highlight?.(st.highlight || null);
  if (st.tool === 'model') {
    if (stageObj.setStep && st.step != null && stageObj._step !== st.step) {
      stageObj.setStep(st.step, { instant: stageObj._step === undefined });
      stageObj._step = st.step;
    }
    targetYaw = st.yaw || 0;
    targetPitch = st.pitch || 0;
    // A capsule names the model or the touched part; a small glass card explains the part.
    const label = st.highlight ? tk(`part.${st.modelId}.${st.highlight}.label`, st.highlight) : tk(`model.${st.modelId}`, '');
    if (stageLabel?.label !== label) {
      stageLabel?.mesh.removeFromParent();
      stageLabel = label ? capsuleMesh(label, { h: 0.042 }) : null;
      if (stageLabel) {
        stageLabel.label = label;
        stageLabel.mesh.position.set(0, -0.25, 0.02);
        stageAnchor.add(stageLabel.mesh);
      }
    }
    const info = st.highlight ? tk(`part.${st.modelId}.${st.highlight}.info`, '') : '';
    infoWin.show(!!info);
    if (info)
      partInfo.draw((c, p) => {
        glass(c, 0, 0, p.W, p.H, 40);
        para(c, info, 36, 28, p.W - 72, 26, C.text2, 500, 1.4, 3);
      }, info + fontsReady);
  }
  if (st.tool === 'body' && stageObj.addMarker) {
    const sig = (st.points || []).map((p) => p.id).join(',');
    if (stageObj._pts !== sig) {
      stageObj.clearMarkers();
      for (const p of st.points || []) if (p.point) stageObj.addMarker(new THREE.Vector3(...p.point));
      stageObj._pts = sig;
    }
  }
}

// ---- pain orbs: animated sensations floating above the sheet
let painOrbs = null;
let painVizMod = null;
let painLoading = false;
async function syncPain(st) {
  painGrid.visible = !!st;
  if (!st) return;
  if (!painOrbs) {
    if (painLoading) return;
    painLoading = true;
    painVizMod ||= await import('/shared/painviz.js').catch(() => null);
    painOrbs = PAIN_TYPES.map((pt, i) => {
      const g = new THREE.Group();
      g.userData.home = new THREE.Vector3(((i % 5) - 2) * 0.13, i < 5 ? 0.08 : -0.06, 0);
      g.position.copy(g.userData.home);
      const viz = painVizMod?.createPainViz(pt.anim);
      if (viz) viz.object.scale.setScalar(0.038), g.add(viz.object);
      const collider = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      g.add(collider);
      painGrid.add(g);
      const o = { pt, g, viz, collider, label: null };
      o.target = ix.add({
        object: collider,
        kind: 'mesh',
        poke: true,
        onHover: (h) => {
          if (h) hoverPain = pt.id;
          else if (hoverPain === pt.id) hoverPain = null;
          o.viz?.setActive(!!h || S.stage?.type === pt.id);
          tween(o.g.scale, h ? { x: 1.12, y: 1.12, z: 1.12 } : { x: 1, y: 1, z: 1 }, 160);
          invalidate();
        },
        onPress: () => link.send({ type: 'painType', id: pt.id }),
      });
      return o;
    });
  }
  const chosen = st.type;
  for (const o of painOrbs) {
    const name = tk(`pain.${o.pt.id}.name`, o.pt.ja);
    if (o.label?.text !== name) {
      o.label?.mesh.removeFromParent();
      o.label = capsuleMesh(name, { h: 0.028 });
      o.label.text = name;
      o.label.mesh.position.set(0, -0.058, 0);
      o.label.mesh.userData.noHit = true;
      o.g.add(o.label.mesh);
    }
    const isChosen = chosen === o.pt.id;
    o.g.visible = !chosen || isChosen;
    o.viz?.setActive(isChosen || hoverPain === o.pt.id);
    const dest = isChosen ? new THREE.Vector3(0, 0.02, 0) : o.g.userData.home;
    if (o.g.position.distanceTo(dest) > 0.001 && !o.moving) {
      o.moving = true;
      tween(o.g.position, { x: dest.x, y: dest.y, z: dest.z }, 380);
      setTimeout(() => (o.moving = false), 400);
    }
  }
}

// ================================================================ frame loop

let needsRecenter = false;
let recenterFrames = 0;
function recenter() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  cam.getWorldPosition(p);
  cam.getWorldQuaternion(q);
  if (renderer.xr.isPresenting && p.y < 0.3) return false;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const yaw = Math.atan2(-fwd.x, -fwd.z);
  uiRoot.position.copy(p);
  uiRoot.rotation.set(0, yaw, 0);
  floorRoot.position.set(p.x, 0, p.z);
  floorRoot.rotation.set(0, yaw, 0);
  return true;
}

let fontsReady = false;
let lastT = now();
let animUntil = 0;
function frame() {
  const n = now();
  const dt = Math.min(0.05, n - lastT);
  lastT = n;
  if (needsRecenter && ++recenterFrames > 3 && recenter()) (needsRecenter = false), (recenterFrames = 0);
  ix.update();
  stepTweens();
  for (const o of occluders) o.update();

  // Thumbsticks scroll the conversation too.
  for (const src of ix.sources) {
    const ax = src.input?.gamepad?.axes;
    if (ax && Math.abs(ax[3] || 0) > 0.2) (convScroll.y -= ax[3] * 900 * dt), (dirty = true);
  }
  const scrolling = convScroll.step(dt) | glossScroll.step(dt);

  if (S && (dirty || scrolling || n < animUntil)) {
    // Redraw only when something changed, and keep animating while anything moves.
    dirty = false;
    let anim = drawConversation();
    anim = drawGlossary() || anim;
    anim = drawSheet() || anim;
    anim = drawPicture() || anim;
    anim = drawToolbar() || anim;
    syncStage();
    if (anim) animUntil = n + 0.05;
  }

  if (stageObj) {
    stageObj.update?.(dt, n);
    if (stageHolder) {
      stageHolder.rotation.y += (targetYaw - stageHolder.rotation.y) * 0.12;
      stageHolder.rotation.x += (targetPitch - stageHolder.rotation.x) * 0.12;
    }
  }
  if (painGrid.visible && painOrbs) for (const o of painOrbs) if (o.g.visible) o.viz?.update(dt, n);
  orbMat.uniforms.t.value = n;
  orbMat.uniforms.energy.value += ((aiHolding || S?.aiBusy ? 1 : 0.25) - orbMat.uniforms.energy.value) * 0.08;
  aiSphere.scale.setScalar(aiHolding ? 1 + 0.06 * Math.sin(n * 7) : 1);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ================================================================ XR session

async function enterXR(mode) {
  const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
  await renderer.xr.setSession(session);
  const ar = mode === 'immersive-ar';
  env.visible = !ar;
  // In passthrough the real hands cut through the UI; in VR they are drawn as light shapes.
  for (const o of occluders) o.setVisible(ar ? occluderMat : handVisibleMat);
  needsRecenter = true;
  recenterFrames = 0;
  document.getElementById('intro').hidden = true;
  session.addEventListener('end', () => {
    env.visible = true;
    camera.position.set(0, 1.6, 0);
    needsRecenter = true;
  });
}
for (let i = 0; i < 2; i++) renderer.xr.getController(i).addEventListener('squeezestart', () => (needsRecenter = true));

// Desktop preview: drag to look around, hold Space to ask AI.
ix.onLook = (dx, dy) => {
  camera.rotation.y -= dx * 0.004;
  camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x - dy * 0.004));
};
addEventListener('keydown', (e) => e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && !e.repeat && aiStart());
addEventListener('keyup', (e) => e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && aiEnd());

// ================================================================ intro

const $ = (id) => document.getElementById(id);
function intro() {
  $('tagline').textContent = t('tagline');
  $('lead').textContent = `${t('intro1')} ${t('intro2')}`;
  $('startBtn').textContent = t('start');
  $('arBtn').textContent = t('startAR');
  $('vrBtn').textContent = t('startVR');
  $('deskBtn').textContent = t('preview');
}
$('startBtn').onclick = async () => {
  try {
    await rec.setListening(micOn);
  } catch {
    $('status').textContent = t('micNeeded');
    return;
  }
  $('startBtn').hidden = true;
  $('xrBtns').hidden = false;
  if (navigator.xr) {
    const [ar, vr] = await Promise.all([navigator.xr.isSessionSupported('immersive-ar').catch(() => false), navigator.xr.isSessionSupported('immersive-vr').catch(() => false)]);
    $('arBtn').hidden = !ar;
    $('vrBtn').hidden = !vr || ar;
  }
};
$('arBtn').onclick = () => enterXR('immersive-ar').catch((e) => ($('status').textContent = e.message));
$('vrBtn').onclick = () => enterXR('immersive-vr').catch((e) => ($('status').textContent = e.message));
$('deskBtn').onclick = () => {
  $('intro').hidden = true;
  $('desk').hidden = false;
};
$('micToggle').onclick = toggleMic;
$('desk').onsubmit = (e) => {
  e.preventDefault();
  const v = $('deskInput').value.trim();
  if (v) link.send({ type: 'text', text: v });
  $('deskInput').value = '';
};
if (new URLSearchParams(location.search).has('preview')) $('deskBtn').onclick();

// Warm up heavy assets while the patient reads the intro.
setTimeout(() => {
  import('/shared/models/body.js').then((m) => m.preload?.()).catch(() => {});
  import('/shared/painviz.js').then((m) => (painVizMod = m)).catch(() => {});
}, 1200);

Promise.race([Promise.all([document.fonts.load('600 32px "Inter"'), document.fonts.load('600 32px "Noto Sans JP"')]), new Promise((r) => setTimeout(r, 2500))]).finally(() => {
  fontsReady = true;
  layoutCache.clear();
  invalidate();
});

// Test hooks.
window.__eyesee = {
  link, get state() { return S; }, scene, uiRoot, ix, renderer, THREE,
  buttons: { aiBtn }, panels: { conv, gloss, sheet, toolbar, pic, work: sheet },
  painGrid, get painOrbs() { return painOrbs; }, get stageObj() { return stageObj; }, get workMode() { return S && sheetMode(); },
  scroll: convScroll,
};
window.__setView = (yawDeg, pitchDeg) => camera.rotation.set((pitchDeg * Math.PI) / 180, (yawDeg * Math.PI) / 180, 0, 'YXZ');

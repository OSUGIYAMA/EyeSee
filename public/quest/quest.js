// EyeSee — patient's headset (Meta Quest, WebXR). The headset mic hears only the wearer, so the
// patient just talks; the doctor's words arrive from the phone, translated, on the big panel.
import * as THREE from 'three';
import { Link, params, fetchConfig } from '/shared/net.js';
import { Recorder } from '/shared/recorder.js';
import { PAIN_TYPES, PAIN_SCALE, FEELINGS, MODES, MODELS, L } from '/shared/catalog.js';
import { Panel, C, rr, text, para, measurePara, button, labelMesh, font } from './panel.js';
import { Interact } from './interact.js';

const { room } = params();
localStorage.setItem('eyesee.room', room);
const link = new Link({ room, role: 'patient' });
let S = null;
let cfg = { caps: {} };
let presence = { doctor: 0, patient: 0 };
const lang = () => S?.patientLang || 'ja';
const T = (ja, en) => (lang() === 'ja' ? ja : en);
document.getElementById('roomName').textContent = room;

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
scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x2a3440, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(1, 3, 2);
scene.add(sun);

const env = buildEnvironment();
scene.add(env);
const uiRoot = new THREE.Group();
uiRoot.position.set(0, 1.6, 0);
scene.add(uiRoot);
const floorRoot = new THREE.Group();
scene.add(floorRoot);
const ix = new Interact(renderer, camera, scene);

function buildEnvironment() {
  const g = new THREE.Group();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#0a1a28') }, mid: { value: new THREE.Color('#16384c') }, low: { value: new THREE.Color('#0b1720') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top, mid, low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, low, smoothstep(0.0, 0.25, -h)); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  sky.userData.noHit = true;
  g.add(sky);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshStandardMaterial({ color: '#10212d', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  for (const r of [1.2, 2.4, 3.6]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.004, r + 0.004, 96), new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: 0.12 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    g.add(ring);
  }
  return g;
}

// ================================================================ panels & layout

const place = (obj, x, y, z, ry = 0, rx = 0, parent = uiRoot) => {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, 0, 'YXZ');
  parent.add(obj);
  return obj;
};

const transcript = new Panel({ w: 1.16, h: 0.74, ppm: 1100, name: 'transcript' });
place(transcript.mesh, 0, 0.03, -1.25);
const live = new Panel({ w: 0.9, h: 0.075, ppm: 1100, name: 'live' });
place(live.mesh, 0, -0.39, -1.24);
const glossary = new Panel({ w: 0.62, h: 0.74, ppm: 1100, name: 'glossary' });
place(glossary.mesh, 0.93, 0.03, -1.0, -0.75);
const work = new Panel({ w: 0.66, h: 0.4, ppm: 1300, name: 'work' });
place(work.mesh, 0, -0.41, -0.53, 0, -0.62);
const toastP = new Panel({ w: 0.56, h: 0.07, ppm: 1200, name: 'toast' });
place(toastP.mesh, 0, -0.205, -0.56, 0, -0.45); // just above the hand panel, below the transcript's line of sight
toastP.mesh.visible = false;
const stageAnchor = place(new THREE.Group(), -0.66, -0.06, -0.8, 0.7);
const imageP = new Panel({ w: 0.5, h: 0.6, ppm: 1000, name: 'image' });
stageAnchor.add(imageP.mesh);
imageP.mesh.visible = false;
const modelLabel = new Panel({ w: 0.5, h: 0.12, ppm: 1100, name: 'modelLabel' });
modelLabel.mesh.position.set(0, -0.3, 0);
stageAnchor.add(modelLabel.mesh);
modelLabel.mesh.visible = false;
const bodyAnchor = place(new THREE.Group(), -0.95, 0, -1.3, 0.62, 0, floorRoot);
const painGrid = place(new THREE.Group(), 0, -0.07, -0.56);

// Panels you can touch or point at.
ix.add({ object: transcript.mesh, kind: 'panel', poke: false, onPress: (h) => onPanel(transcript, h) });
ix.add({ object: glossary.mesh, kind: 'panel', poke: false, onPress: (h) => onPanel(glossary, h) });
ix.add({ object: work.mesh, kind: 'panel', poke: true, onPress: (h) => onPanel(work, h), onDrag: (h) => onWorkDrag(h), onRelease: () => endStroke() });

function onPanel(panel, h) {
  const r = h.region;
  if (!r) return;
  r.action?.(r, h);
}

// ================================================================ 3D push buttons

function pushButton({ color, radius = 0.05, label, sub }) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.25, radius * 1.32, 0.018, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1c2a36', roughness: 0.6, metalness: 0.2 }));
  base.position.z = -0.009;
  g.add(base);
  const capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05, emissive: new THREE.Color(color), emissiveIntensity: 0.25 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.024, 48).rotateX(Math.PI / 2), capMat);
  cap.position.z = 0.012;
  g.add(cap);
  const lab = labelMesh(sub ? [label, sub] : [label], { w: radius * 3.2, h: radius * 1.05 });
  lab.mesh.position.set(0, radius * 1.9, 0.004);
  g.add(lab.mesh);
  g.userData.radius = radius;
  g.userData.face = 0.024;
  g.userData.cap = cap;
  g.userData.capMat = capMat;
  return g;
}

function pressAnim(btn, down) {
  btn.userData.cap.position.z = down ? 0.004 : 0.012;
  btn.userData.capMat.emissiveIntensity = down ? 0.9 : 0.25;
}

const iSeeBtn = place(pushButton({ color: '#22c55e', radius: 0.045, label: '👍 わかった', sub: 'I see' }), -0.47, -0.5, -0.42, 0.35, -0.75);
const confusedBtn = place(pushButton({ color: '#f59e0b', radius: 0.045, label: '🤔 わからない', sub: "I don't understand" }), -0.33, -0.56, -0.36, 0.25, -0.8);
const aiBtn = place(pushButton({ color: '#8b5cf6', radius: 0.065, label: '✦ AI に聞く', sub: '押しながら話す' }), 0.43, -0.52, -0.42, -0.35, -0.75);
const aiOrb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 32, 16), new THREE.MeshStandardMaterial({ color: '#a78bfa', emissive: '#7c3aed', emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.9 }));
aiOrb.position.set(0, 0.2, 0.02);
aiOrb.userData.noHit = true;
aiBtn.add(aiOrb);

for (const [btn, fn] of [
  [iSeeBtn, () => (link.send({ type: 'isee', entryId: selectedEntry }), flash(T('👍 「わかった」を医師に伝えました', '👍 Sent "I see"')), (selectedEntry = null))],
  [confusedBtn, () => (link.send({ type: 'confused', entryId: selectedEntry }), flash(T('🤔 「わからない」を医師に伝えました', '🤔 Sent "I don\'t understand"')), (selectedEntry = null))],
]) {
  ix.add({ object: btn, kind: 'button', poke: true, onPress: () => (pressAnim(btn, true), fn()), onRelease: () => pressAnim(btn, false) });
}
ix.add({ object: aiBtn, kind: 'button', poke: true, onPress: () => aiStart(), onRelease: () => aiEnd() });

// ================================================================ microphone

let micOn = true;
let micLevel = 0;
let aiHolding = false;
const rec = new Recorder({
  onSegment: (blob, meta) => link.postAudio(blob, meta.target).catch((err) => flash(`⚠︎ ${err.message}`)),
  onSpeaking: (on) => link.send({ type: 'vad', speaking: on }),
  onLevel: (lv) => (micLevel = lv),
  // The headset mic only hears the wearer, but don't start while the doctor's phone is capturing.
  gate: () => !S?.speaking?.doctor,
});

async function startMic() {
  try {
    await rec.setListening(micOn);
    return true;
  } catch (err) {
    setStatus(`マイクを使えません: ${err.message}`);
    return false;
  }
}

async function aiStart() {
  if (aiHolding) return;
  aiHolding = true;
  pressAnim(aiBtn, true);
  link.send({ type: 'aiListening', on: true });
  try {
    await rec.pttStart();
  } catch (err) {
    flash(`⚠︎ ${err.message}`);
  }
}

function aiEnd() {
  if (!aiHolding) return;
  aiHolding = false;
  pressAnim(aiBtn, false);
  link.send({ type: 'aiListening', on: false });
  rec.pttEnd(true);
  flash(T('✦ AIに質問を送りました', '✦ Question sent to EyeSee AI'));
}

// ================================================================ state → UI

link.on('state', (s) => {
  const newSession = S && S.sessionId !== s.sessionId;
  S = s;
  if (newSession) (scrollBack = 0), (selectedEntry = null), (localFeelings = false);
  renderAll();
});
link.on('presence', (m) => {
  presence = m.roles;
  renderTranscript();
});
link.on('link', () => renderTranscript());
link.on('toast', (m) => m.text?.patient && flash(m.text.patient));
link.on('unlock', () => flash(T('✨ 大切な点の理解が確認できました', '✨ Shared understanding reached')));
link.on('signed', () => flash(T('🤝 同意が記録されました', '🤝 Consent recorded')));
fetchConfig().then((c) => {
  cfg = c;
  renderAll();
});

function renderAll() {
  if (!S) return;
  renderTranscript();
  renderGlossary();
  renderWork();
  syncStage();
}

// ---------------------------------------------------------------- transcript

let scrollBack = 0;
let selectedEntry = null;
const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function renderTranscript() {
  if (!S) return;
  const u = S.understanding;
  const sig = JSON.stringify([S.sessionId, S.entries.map((e) => e.id + ':' + e.v), scrollBack, selectedEntry, S.mode, u.score, u.updating, presence.doctor, link.connected, fontsReady, lang()]);
  transcript.draw((ctx, p) => {
    const { W, H } = p;
    rr(ctx, 0, 0, W, H, 40, C.bg, C.line);
    // header
    const mode = MODES.find((m) => m.id === S.mode);
    text(ctx, 'EyeSee', 34, 26, 34, C.ink, 800);
    rr(ctx, 190, 24, 44 + measure(ctx, L(mode, lang()), 24, 700), 44, 22, C.card2);
    text(ctx, L(mode, lang()), 212, 33, 24, C.accent, 700);
    const linked = link.connected && presence.doctor > 0;
    text(ctx, linked ? T('● 医師のスマホと接続中', '● Linked to doctor') : T('○ 医師のスマホを待っています', '○ Waiting for doctor'), W - 34, 34, 22, linked ? C.ok : C.muted, 700, 'right');
    if (S.mode === 'consent') {
      const thr = S.caps?.consentThreshold ?? 8;
      const x0 = W - 34 - 10 * 34;
      text(ctx, T('理解度', 'Understanding'), x0 - 14, 76, 22, C.muted, 700, 'right');
      for (let i = 0; i < 10; i++) rr(ctx, x0 + i * 34, 80, 28, 16, 5, i < u.score ? (u.score >= thr ? C.ok : C.warn) : C.card2);
      text(ctx, `${u.score}/10`, x0 - 120, 72, 26, u.score >= thr ? C.ok : C.warn, 800, 'right');
    }
    ctx.fillStyle = C.line;
    ctx.fillRect(30, 118, W - 60, 2);

    // body: newest at the bottom
    const top = 132, bottom = H - 24, left = 30, right = W - 100;
    const bw = right - left;
    const list = S.entries.slice(0, Math.max(0, S.entries.length - scrollBack));
    let y = bottom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, bottom - top);
    ctx.clip();
    if (!list.length) {
      para(ctx, T('医師が話すと、ここに日本語で表示されます。\nあなたが話すと、医師のスマホに英語で表示されます。', "The doctor's words appear here in your language."), left + 20, top + 60, bw - 40, 32, C.muted, 500);
    }
    for (let i = list.length - 1; i >= 0 && y > top; i--) {
      const h = drawEntry(ctx, list[i], left, y, bw, true);
      drawEntry(ctx, list[i], left, y, bw, false, p);
      y -= h + 16;
    }
    ctx.restore();

    // scroll controls
    const canUp = list.length > 1 && y < top;
    button(p, W - 86, top + 6, 64, 84, '▲', canUp ? () => ((scrollBack = Math.min(S.entries.length - 1, scrollBack + 2)), renderTranscript()) : null, { size: 30, bg: canUp ? C.card2 : C.card, color: canUp ? C.ink : C.muted });
    button(p, W - 86, bottom - 90, 64, 84, '▼', scrollBack ? () => ((scrollBack = Math.max(0, scrollBack - 2)), renderTranscript()) : null, { size: 30, bg: scrollBack ? C.card2 : C.card, color: scrollBack ? C.ink : C.muted });
    if (scrollBack) button(p, W / 2 - 110, bottom - 64, 220, 54, T('最新へ ↓', 'Latest ↓'), () => ((scrollBack = 0), renderTranscript()), { size: 24, bg: C.accent, color: '#04201c' });
  }, sig);
}

function measure(ctx, s, size, weight) {
  font(ctx, size, weight);
  return ctx.measureText(s).width;
}

/** Draw one entry ending at `yBottom` (measure=true returns height only). */
function drawEntry(ctx, e, x, yBottom, w, measureOnly, panel) {
  const pad = 22;
  const iw = w - pad * 2;
  if (e.kind === 'speech') {
    const doc = e.speaker === 'doctor';
    const main = doc ? e.tr?.text || (e.pending ? T('翻訳しています…', 'Translating…') : e.orig.text) : e.orig.text || T('聞き取っています…', 'Listening…');
    const sub = doc ? e.orig.text : e.tr?.text ? `${T('医師には', 'Doctor sees')}: ${e.tr.text}` : e.pending ? T('英語に翻訳中…', 'Translating…') : '';
    const bw = doc ? w : w * 0.86;
    const bx = doc ? x : x + w - bw;
    const mainSize = doc ? 36 : 30;
    const hMain = measurePara(ctx, main, bw - pad * 2, mainSize, doc ? 700 : 500);
    const hSub = sub ? measurePara(ctx, sub, bw - pad * 2, 21, 500, 1.35, 3) + 8 : 0;
    const terms = doc ? (e.terms || []) : [];
    const hTerms = terms.length ? 50 : 0;
    const h = 44 + hMain + hSub + hTerms + pad;
    if (measureOnly) return h;
    const y = yBottom - h;
    const selected = selectedEntry === e.id;
    rr(ctx, bx, y, bw, h, 26, doc ? C.doctorBg : C.patientBg, selected ? C.accent : null);
    if (selected) (ctx.lineWidth = 4), (ctx.strokeStyle = C.accent), ctx.stroke();
    text(ctx, `${doc ? T('医師', 'Doctor') : T('あなた', 'You')} · ${hhmm(e.ts)}`, bx + pad, y + 14, 20, doc ? C.doctor : C.patient, 700);
    const flags = [e.iSee && '👍', e.confused && '🤔'].filter(Boolean).join(' ');
    if (flags) text(ctx, flags, bx + bw - pad, y + 10, 26, C.ink, 500, 'right');
    let cy = y + 44;
    cy += para(ctx, main, bx + pad, cy, bw - pad * 2, mainSize, e.pending ? C.muted : C.ink, doc ? 700 : 500);
    if (sub) cy += 8 + para(ctx, sub, bx + pad, cy + 4, bw - pad * 2, 21, C.muted, 500, 1.35, 3);
    if (terms.length) {
      let tx = bx + pad;
      for (const t of terms) {
        const label = `📘 ${String(t.display).replace(/（.*?）|\(.*?\)/g, '')}`;
        const tw = measure(ctx, label, 22, 700) + 30;
        if (tx + tw > bx + bw - pad) break;
        rr(ctx, tx, cy + 8, tw, 38, 19, C.card2);
        text(ctx, label, tx + 15, cy + 15, 22, C.ink, 700);
        tx += tw + 10;
      }
    }
    if (doc && !e.pending) panel.region(bx, Math.max(y, 132), bw, h, () => ((selectedEntry = selectedEntry === e.id ? null : e.id), renderTranscript(), flash(selectedEntry ? T('選択しました：👍 / 🤔 を押してください', 'Selected — now press 👍 or 🤔') : '')));
    return h;
  }
  if (e.kind === 'ai') {
    const a = e.ai;
    const q = `✦ EyeSee AI · ${a.from === 'doctor' ? T('医師の質問', 'Doctor asked') : T('あなたの質問', 'You asked')}：${a.question?.patient || ''}`;
    const ans = a.pending ? T('考えています…', 'Thinking…') : a.answer?.patient || '';
    const om = (a.omissions || []).map((o) => `・${o.patient}`).join('\n');
    const hQ = measurePara(ctx, q, iw, 21, 700, 1.35, 3);
    const hA = measurePara(ctx, ans, iw, 30, 500);
    const hO = om ? measurePara(ctx, om, iw, 22, 500) + 10 : 0;
    const h = pad + hQ + 10 + hA + hO + pad;
    if (measureOnly) return h;
    const y = yBottom - h;
    rr(ctx, x, y, w, h, 26, C.aiBg);
    let cy = y + pad;
    cy += para(ctx, q, x + pad, cy, iw, 21, C.ai, 700, 1.35, 3) + 10;
    cy += para(ctx, ans, x + pad, cy, iw, 30, C.ink, 500);
    if (om) para(ctx, om, x + pad, cy + 10, iw, 22, C.warn, 600);
    return h;
  }
  // events & system notes
  const main = e.text?.patient || e.text?.doctor || '';
  const help = e.help?.patientExplanation ? `✦ ${T('AIのやさしい説明', 'Simple explanation')}：${e.help.patientExplanation}` : '';
  const size = e.kind === 'system' ? 20 : 23;
  const hM = measurePara(ctx, main, iw, size, 600);
  const hH = help ? measurePara(ctx, help, iw, 26, 500) + 16 : 0;
  const h = 18 + hM + hH + 14;
  if (measureOnly) return h;
  const y = yBottom - h;
  if (e.kind !== 'system') rr(ctx, x + 40, y, w - 80, h, 20, e.speaker === 'patient' ? C.patientBg : C.card);
  font(ctx, size, 600);
  para(ctx, main, x + pad + (e.kind === 'system' ? 0 : 40), y + 14, iw - (e.kind === 'system' ? 0 : 80), size, C.muted, 600);
  if (help) {
    rr(ctx, x + 50, y + 18 + hM, w - 100, hH - 6, 16, C.aiBg);
    para(ctx, help, x + 70, y + 26 + hM, w - 140, 26, C.ink, 500);
  }
  return h;
}

// ---------------------------------------------------------------- glossary

let glossBack = 0;
const images = new Map();
function loadImage(url) {
  if (!images.has(url)) {
    const img = new Image();
    img.onload = () => ((glossary.sig = null), (imageP.sig = null), renderGlossary(), renderImage());
    img.src = url;
    images.set(url, img);
  }
  const img = images.get(url);
  return img.complete && img.naturalWidth ? img : null;
}

function renderGlossary() {
  if (!S) return;
  const terms = S.entries.filter((e) => e.kind === 'speech' && e.speaker === 'doctor').flatMap((e) => (e.terms || []).map((t) => ({ ...t, entryId: e.id }))).reverse();
  const sig = JSON.stringify([terms.map((t) => t.id + t.image), glossBack, fontsReady, cfg.caps?.image, lang()]);
  glossary.draw((ctx, p) => {
    const { W, H } = p;
    rr(ctx, 0, 0, W, H, 40, C.bg, C.line);
    text(ctx, T('📘 ことばの説明', '📘 Glossary'), 30, 28, 30, C.ink, 800);
    text(ctx, T('むずかしい言葉を、やさしく', 'Hard words, made simple'), 30, 70, 20, C.muted, 500);
    if (!terms.length) para(ctx, T('医師が専門用語を使うと、ここに説明が出ます。', 'Medical terms the doctor uses are explained here.'), 30, 140, W - 60, 26, C.muted);
    let y = 112;
    const list = terms.slice(glossBack);
    for (const t of list) {
      const hasImg = t.image && t.image !== 'pending' ? loadImage(t.image) : null;
      const hD = measurePara(ctx, t.display, W - 100, 30, 800, 1.3, 2);
      const hE = measurePara(ctx, t.explanation, W - 100, 23, 500, 1.4, 5);
      const hI = hasImg ? 240 : t.image === 'pending' ? 44 : cfg.caps?.image ? 56 : 0;
      const h = 22 + hD + 4 + hE + hI + 22;
      if (y + h > H - 20) break;
      rr(ctx, 20, y, W - 40, h, 24, C.card);
      let cy = y + 22;
      cy += para(ctx, t.display, 44, cy, W - 100, 30, C.ink, 800, 1.3, 2) + 4;
      cy += para(ctx, t.explanation, 44, cy, W - 100, 23, '#d5e3ee', 500, 1.4, 5);
      if (hasImg) {
        const s = 220;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(44, cy + 10, s, s, 16);
        ctx.clip();
        ctx.drawImage(hasImg, 44, cy + 10, s, s);
        ctx.restore();
      } else if (t.image === 'pending') text(ctx, T('🖼 絵を描いています…', '🖼 Drawing…'), 44, cy + 10, 22, C.ai, 700);
      else if (cfg.caps?.image) button(p, 44, cy + 8, 220, 44, T('🖼 絵で見る', '🖼 Show picture'), () => (link.send({ type: 'termImage', entryId: t.entryId, termId: t.id }), flash(T('絵を作っています…', 'Creating a picture…'))), { size: 22, bg: C.aiBg });
      y += h + 14;
    }
    if (terms.length > 1) {
      button(p, W - 150, 26, 56, 52, '▲', glossBack ? () => ((glossBack = Math.max(0, glossBack - 1)), renderGlossary()) : null, { size: 24, bg: C.card2 });
      button(p, W - 86, 26, 56, 52, '▼', glossBack < terms.length - 1 ? () => ((glossBack = Math.min(terms.length - 1, glossBack + 1)), renderGlossary()) : null, { size: 24, bg: C.card2 });
    }
  }, sig);
}

// ---------------------------------------------------------------- the hand panel (work)

let localFeelings = false;
let strokes = [];
let stroke = null;

function workMode() {
  const c = S.consent;
  if (c) return `consent-${c.status}`;
  if (localFeelings) return 'feelings';
  return S.stage?.tool || 'idle';
}

function renderWork() {
  if (!S) return;
  const mode = workMode();
  const st = S.stage;
  const c = S.consent;
  const sig = JSON.stringify([mode, st, c && { s: c.status, i: c.index, a: c.checkpoints.map((x) => x.ack), sig: Object.keys(c.signatures || {}) }, micOn, fontsReady, cfg.caps?.stt, lang(), localFeelings && S.entries.length, stageMeta?.id, stageObj?.parts?.length]);
  if (mode === 'consent-signing' && work.sig && work.sig.startsWith('["consent-signing"') && strokes.length && !c.signatures?.patient) return;
  work.draw((ctx, p) => {
    const { W, H } = p;
    rr(ctx, 0, 0, W, H, 44, C.bg, C.line);
    const title = (s, sub) => {
      text(ctx, s, 40, 30, 36, C.ink, 800);
      if (sub) text(ctx, sub, 40, 80, 22, C.muted, 500);
    };

    if (mode === 'idle') {
      title(T('話すだけで、医師に英語で伝わります', 'Just speak — the doctor reads it in English'), T('日本語でも、英語でも、話しやすい言葉で大丈夫です', 'Use whichever language is easiest'));
      rr(ctx, 40, 140, W - 80, 20, 10, C.card2);
      rr(ctx, 40, 140, (W - 80) * Math.min(1, micLevel), 20, 10, C.accent);
      if (!cfg.caps?.stt) para(ctx, T('⚠︎ サーバーの音声認識が未設定です', '⚠︎ Speech recognition is not configured on the server'), 40, 176, W - 80, 22, C.warn, 700);
      button(p, 40, H - 170, 260, 120, micOn ? T('🎙 マイクON', '🎙 Mic on') : T('🔇 ミュート中', '🔇 Muted'), toggleMic, { size: 30, bg: micOn ? C.okBg : C.warnBg, sub: T('タッチで切り替え', 'tap to toggle'), subSize: 18 });
      button(p, 320, H - 170, 250, 120, T('💬 気持ち', '💬 Feelings'), () => ((localFeelings = true), renderWork()), { size: 30, sub: T('医師に伝える', 'tell the doctor'), subSize: 18 });
      button(p, 590, H - 170, W - 630, 120, T('↺ 位置を合わせる', '↺ Recenter'), () => (needsRecenter = true), { size: 26, sub: T('正面に表示し直す', 'bring panels in front'), subSize: 18 });
      return;
    }

    if (mode === 'pain') {
      const pt = PAIN_TYPES.find((x) => x.id === st.type);
      if (!pt) {
        title(T('どんな痛みですか？', 'What does the pain feel like?'), T('目の前の動くボールから、いちばん近いものにタッチしてください', 'Touch the floating orb that matches best'));
        para(ctx, T('例：ずきずき・ちくちく・しめつけ…', 'e.g. throbbing, prickling, squeezing…'), 40, 150, W - 80, 26, C.muted);
        return;
      }
      title(T(`「${pt.ja}」— 痛みの強さは？`, `${pt.en} — how strong?`), T('0 = 痛くない　10 = がまんできない', '0 = no pain, 10 = worst imaginable'));
      const bw = (W - 80 - 10 * 8) / 11;
      for (let v = 0; v <= 10; v++) {
        const face = PAIN_SCALE.find((f) => f.v === v);
        const x = 40 + v * (bw + 8);
        const on = st.intensity === v;
        const hue = v <= 3 ? C.okBg : v <= 6 ? C.warnBg : 'rgba(248,113,113,0.28)';
        button(p, x, 150, bw, 140, String(v), () => link.send({ type: 'painIntensity', v }), { size: 38, bg: on ? C.accent : hue, color: on ? '#04201c' : C.ink, r: 18 });
        if (face) text(ctx, face.face, x + bw / 2, 300, 34, C.ink, 500, 'center');
      }
      if (st.intensity != null) text(ctx, T(`✓ ${st.intensity}/10 を医師に伝えました`, `✓ Sent ${st.intensity}/10`), 40, H - 60, 24, C.ok, 700);
      return;
    }

    if (mode === 'feelings') {
      title(T('いまの気持ちは？', 'How do you feel right now?'), T('いくつ選んでもOK。医師に伝わります', 'Pick any — the doctor will see them'));
      const cols = 4, gw = (W - 80 - (cols - 1) * 12) / cols, gh = 82;
      const chosen = new Set([...(st?.tool === 'feelings' ? st.selected || [] : []), ...S.entries.filter((e) => e.kind === 'event' && e.event.type === 'feeling' && Date.now() - Date.parse(e.ts) < 10 * 60e3).map((e) => e.event.id)]);
      FEELINGS.forEach((f, i) => {
        const x = 40 + (i % cols) * (gw + 12), y = 120 + Math.floor(i / cols) * (gh + 10);
        button(p, x, y, gw, gh, `${f.emoji} ${L(f, lang())}`, () => (link.send({ type: 'feeling', id: f.id }), flash(`${f.emoji} ${T('医師に伝えました', 'Sent to the doctor')}`)), { size: 20, bg: chosen.has(f.id) ? C.accent : C.card2, color: chosen.has(f.id) ? '#04201c' : C.ink, r: 18 });
      });
      if (localFeelings) button(p, W - 200, 26, 160, 56, T('とじる', 'Close'), () => ((localFeelings = false), renderWork()), { size: 24 });
      return;
    }

    if (mode === 'body') {
      title(T('痛い場所を指さしてください', 'Point to where it hurts'), T('左の人体にタッチ（ピンチ／トリガー）。何か所でもOK', 'Touch the body on your left (pinch / trigger)'));
      const pts = st.points || [];
      let x = 40;
      for (const pt of pts) {
        const label = `📍 ${L(pt.region.label, lang())}`;
        const w = measure(ctx, label, 24, 700) + 36;
        if (x + w > W - 40) break;
        rr(ctx, x, 140, w, 50, 25, C.patientBg);
        text(ctx, label, x + 18, 151, 24, C.ink, 700);
        x += w + 10;
      }
      if (st.highlight) para(ctx, T('医師がたずねています：「ここですか？」（光っている場所）', 'The doctor asks: "Here?" (glowing area)'), 40, 214, W - 80, 24, C.warn, 700);
      if (pts.length) button(p, 40, H - 110, 220, 70, T('やり直す', 'Clear'), () => link.send({ type: 'bodyClear' }), { size: 24 });
      return;
    }

    if (mode === 'model') {
      const m = MODELS.find((x) => x.id === st.modelId);
      const part = stageObj?.parts?.find((x) => x.id === st.highlight);
      title(`${m?.icon || ''} ${L(m, lang())}`, T('左の模型にタッチすると、部分の説明が出ます', 'Touch the model on your left to learn about each part'));
      if (st.modelId === 'artery' && stageMeta?.steps) {
        const n = st.step || 0;
        const cap = stageMeta.steps[n];
        text(ctx, T(`ステップ ${n + 1} / ${stageMeta.steps.length}`, `Step ${n + 1} / ${stageMeta.steps.length}`), 40, 130, 24, C.accent, 800);
        para(ctx, L(cap, lang()), 40, 168, W - 80, 30, C.ink, 600, 1.4, 3);
        button(p, 40, H - 100, 150, 70, '◀', n > 0 ? () => link.send({ type: 'modelStep', step: n - 1 }) : null, { size: 30 });
        button(p, W - 190, H - 100, 150, 70, '▶', n < stageMeta.steps.length - 1 ? () => link.send({ type: 'modelStep', step: n + 1 }) : null, { size: 30 });
      } else if (part) {
        text(ctx, L(part.label, lang()), 40, 130, 32, C.accent, 800);
        para(ctx, L(part.info, lang()), 40, 180, W - 80, 27, C.ink, 500, 1.45, 4);
      }
      return;
    }

    if (mode === 'image') {
      title(T('🖼 説明のための絵', '🖼 Illustration'), T('左に表示しています', 'Shown on your left'));
      para(ctx, st.caption?.patient || '', 40, 140, W - 80, 28, C.ink, 500, 1.45, 5);
      return;
    }

    // ---------- consent
    if (mode === 'consent-preparing' || mode === 'consent-precheck') {
      title(T('同意の確認を準備しています', 'Preparing the consent confirmation'), T('医師がAIの最終チェックを見ています…', 'The doctor is reviewing the AI final check…'));
      const t = performance.now() / 300;
      for (let i = 0; i < 3; i++) rr(ctx, W / 2 - 60 + i * 44, 200, 26, 26, 13, i === Math.floor(t) % 3 ? C.accent : C.card2);
      return;
    }
    if (mode === 'consent-review') {
      const i = Math.max(0, c.index);
      const cp = c.checkpoints[i];
      text(ctx, T(`確認 ${i + 1} / ${c.checkpoints.length}`, `Check ${i + 1} / ${c.checkpoints.length}`), 40, 28, 26, C.accent, 800);
      c.checkpoints.forEach((x, j) => rr(ctx, W - 40 - (c.checkpoints.length - j) * 30, 34, 22, 22, 11, x.ack === 'understood' ? C.ok : x.ack === 'question' ? C.warn : j === i ? C.ink : C.card2));
      para(ctx, cp.patient, 40, 84, W - 80, 32, C.ink, 700, 1.45, 5);
      if (cp.ack === 'question') para(ctx, T('医師に質問を伝えました。説明を聞いたら、もう一度えらんでください', 'Your question was sent. After the doctor explains, choose again.'), 40, H - 200, W - 80, 22, C.warn, 700, 1.35, 2);
      button(p, 40, H - 130, (W - 100) * 0.58, 104, T('✓ 理解しました', '✓ I understand'), () => link.send({ type: 'consentAck', cp: cp.id, status: 'understood' }), { size: 34, bg: C.okBg });
      button(p, 60 + (W - 100) * 0.58, H - 130, (W - 100) * 0.42, 104, T('？ 質問がある', '? I have a question'), () => link.send({ type: 'consentAck', cp: cp.id, status: 'question' }), { size: 28, bg: C.warnBg });
      return;
    }
    if (mode === 'consent-signing') {
      if (c.signatures?.patient) {
        title(T('✍️ 署名しました', '✍️ Signed'), T('医師の署名を待っています…', 'Waiting for the doctor to sign…'));
        return;
      }
      title(T('✍️ ここに指で署名してください', '✍️ Sign here with your finger'), T('すべての項目を理解しました。署名すると同意が記録されます', 'All points confirmed. Signing records your consent.'));
      const pad = { x: 40, y: 120, w: W - 80, h: H - 240 };
      rr(ctx, pad.x, pad.y, pad.w, pad.h, 22, 'rgba(255,255,255,0.92)');
      ctx.fillStyle = '#c9d4de';
      ctx.fillRect(pad.x + 40, pad.y + pad.h - 50, pad.w - 80, 3);
      p.region(pad.x, pad.y, pad.w, pad.h, (r, h) => beginStroke(h), 'pad');
      drawStrokes(ctx);
      button(p, 40, H - 104, 240, 84, T('書き直す', 'Clear'), () => ((strokes = []), (work.sig = null), renderWork()), { size: 28 });
      button(p, W - 340, H - 104, 300, 84, T('署名する', 'Sign'), submitSignature, { size: 30, bg: C.accent, color: '#04201c' });
      return;
    }
    if (mode === 'consent-signed') {
      title(T('🤝 インフォームド・コンセントが記録されました', '🤝 Informed consent recorded'), T(`理解度 ${c.scoreAtSign ?? S.understanding.score}/10 · お互いに「I see」`, `Understanding ${c.scoreAtSign ?? S.understanding.score}/10`));
      para(ctx, T('記録は医師と共有されています。わからないことがあれば、いつでも聞いてください。', 'The record is shared with your doctor. You can ask questions any time.'), 40, 150, W - 80, 28, C.ink, 500);
      return;
    }
  }, sig);
}

function toggleMic() {
  micOn = !micOn;
  rec.setListening(micOn).catch((err) => flash(err.message));
  document.getElementById('micToggle').textContent = micOn ? '🎙 ON' : '🔇 OFF';
  document.getElementById('micToggle').classList.toggle('on', micOn);
  renderWork();
}

// signature strokes (in work-panel pixels)
function beginStroke(h) {
  if (workMode() !== 'consent-signing') return;
  const [x, y] = work.uvToPx(h.uv);
  stroke = [[x, y]];
  strokes.push(stroke);
}
function onWorkDrag(h) {
  if (!stroke || !h.uv) return;
  const [x, y] = work.uvToPx(h.uv);
  const last = stroke[stroke.length - 1];
  if (Math.hypot(x - last[0], y - last[1]) < 3) return;
  stroke.push([x, y]);
  const ctx = work.ctx;
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(...last);
  ctx.lineTo(x, y);
  ctx.stroke();
  work.texture.needsUpdate = true;
}
function endStroke() {
  stroke = null;
}
function drawStrokes(ctx) {
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 7;
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
  if (pts.length < 8) return flash(T('署名を書いてください', 'Please sign first'));
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
  flash(T('✍️ 署名を送りました', '✍️ Signature sent'));
}

// ---------------------------------------------------------------- live strip & toast

let liveSig = '';
function renderLive(now) {
  if (!S) return;
  const pending = S.entries.some((e) => e.pending);
  let msg = '';
  let color = C.muted;
  if (aiHolding) (msg = T('✦ AIが聞いています… 話し終えたら離してください', '✦ EyeSee AI is listening… release when done')), (color = C.ai);
  else if (S.aiBusy) (msg = T('✦ AIが考えています…', '✦ EyeSee AI is thinking…')), (color = C.ai);
  else if (S.aiListening?.doctor) (msg = T('✦ 医師がAIに質問しています…', '✦ The doctor is asking EyeSee AI…')), (color = C.ai);
  else if (S.speaking?.doctor) (msg = T('🗣 医師が話しています…', '🗣 The doctor is speaking…')), (color = C.doctor);
  else if (rec.speaking) (msg = T('🎙 あなたの声を聞いています…', '🎙 Listening to you…')), (color = C.patient);
  else if (pending) (msg = T('🔄 翻訳しています…', '🔄 Translating…')), (color = C.accent);
  else if (!micOn) msg = T('🔇 マイクはミュート中です', '🔇 Mic muted');
  const lv = Math.round(micLevel * 10);
  const dots = Math.floor(now / 350) % 4;
  const sig = `${msg}|${lv}|${msg ? dots : 0}`;
  if (sig === liveSig) return;
  liveSig = sig;
  live.draw((ctx, p) => {
    if (!msg) return;
    rr(ctx, 0, 0, p.W, p.H, p.H / 2, C.bg);
    text(ctx, msg.replace(/…$/, '.'.repeat(dots)), p.W / 2, 18, 34, color, 700, 'center');
  });
}

let toastUntil = 0;
function flash(msg) {
  if (!msg) return;
  toastUntil = performance.now() + 2800;
  toastP.mesh.visible = true;
  toastP.draw((ctx, p) => {
    rr(ctx, 0, 0, p.W, p.H, p.H / 2, 'rgba(15,118,110,0.95)');
    text(ctx, msg, p.W / 2, 20, 36, '#ecfeff', 700, 'center');
  });
}

// ================================================================ stage: models, body, pain orbs, images

let stageKey = '';
let stageObj = null;
let stageMeta = null;
let stageTarget = null;
let stageHolder = null;
let loadToken = 0;

function clearStageObj() {
  if (stageObj) {
    (stageHolder || stageObj.object).removeFromParent();
    stageObj.dispose?.();
  }
  if (stageTarget) ix.remove(stageTarget);
  stageObj = stageMeta = stageTarget = stageHolder = null;
  modelLabel.mesh.visible = false;
}

function syncStage() {
  const st = S.consent ? null : S.stage;
  const key = st ? `${st.tool}:${st.modelId || ''}` : '';
  syncPainGrid(st?.tool === 'pain' ? st : null);
  imageP.mesh.visible = st?.tool === 'image';
  if (st?.tool === 'image') renderImage();
  if (key !== stageKey) {
    stageKey = key;
    clearStageObj();
    const token = ++loadToken;
    const id = st?.tool === 'body' ? 'body' : st?.tool === 'model' ? st.modelId : null;
    if (id) {
      import(`/shared/models/${id}.js`)
        .then((mod) => {
          if (token !== loadToken) return;
          stageMeta = mod.meta;
          stageObj = mod.create();
          if (id === 'body') bodyAnchor.add(stageObj.object);
          else stageAnchor.add((stageHolder = fitHolder(stageObj.object, 0.42)));
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
          renderWork();
        })
        .catch((err) => console.warn('model load failed', err));
    }
  } else applyStage(st);
}

/** Wrap a model in a holder that is centered and scaled to `size` meters; rotation happens on the holder. */
function fitHolder(object, size) {
  const box = new THREE.Box3().setFromObject(object);
  const holder = new THREE.Group();
  object.position.sub(box.getCenter(new THREE.Vector3()));
  holder.add(object);
  holder.scale.setScalar(size / Math.max(...box.getSize(new THREE.Vector3()).toArray()));
  return holder;
}

let targetYaw = 0, targetPitch = 0;
function applyStage(st) {
  if (!stageObj || !st) return;
  stageObj.highlight?.(st.highlight || null);
  if (st.tool === 'model') {
    if (stageObj.setStep && st.step != null && stageObj._step !== st.step) stageObj.setStep((stageObj._step = st.step));
    targetYaw = st.yaw || 0;
    targetPitch = st.pitch || 0;
    const part = stageObj.parts?.find((x) => x.id === st.highlight);
    modelLabel.mesh.visible = true;
    modelLabel.draw((ctx, p) => {
      rr(ctx, 0, 0, p.W, p.H, 30, C.bg);
      const m = MODELS.find((x) => x.id === st.modelId);
      text(ctx, part ? L(part.label, lang()) : L(m, lang()), p.W / 2, 22, 40, part ? C.accent : C.ink, 800, 'center');
      text(ctx, part ? L(m, lang()) : T('タッチで部分の名前', 'touch a part'), p.W / 2, 78, 22, C.muted, 500, 'center');
    }, JSON.stringify([st.modelId, st.highlight, fontsReady, lang()]));
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

function renderImage() {
  const st = S?.stage;
  if (st?.tool !== 'image') return;
  const img = loadImage(st.url);
  imageP.draw((ctx, p) => {
    rr(ctx, 0, 0, p.W, p.H, 30, C.bg);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(20, 20, p.W - 40, p.W - 40, 22);
      ctx.clip();
      ctx.drawImage(img, 20, 20, p.W - 40, p.W - 40);
      ctx.restore();
    } else text(ctx, '…', p.W / 2, p.W / 2 - 30, 60, C.muted, 700, 'center');
    para(ctx, st.caption?.patient || '', 26, p.W - 4, p.W - 52, 24, C.ink, 600, 1.35, 3);
  }, JSON.stringify([st.url, !!img, fontsReady]));
}

// ---- pain orbs
let painOrbs = null;
async function syncPainGrid(st) {
  const show = !!st && !st.type;
  painGrid.visible = !!st;
  if (!st) return;
  if (!painOrbs) {
    painOrbs = [];
    const { createPainViz } = await import('/shared/painviz.js').catch(() => ({ createPainViz: null }));
    PAIN_TYPES.forEach((pt, i) => {
      const g = new THREE.Group();
      g.position.set((i % 5 - 2) * 0.13, i < 5 ? 0.07 : -0.1, 0);
      let viz = null;
      if (createPainViz) {
        viz = createPainViz(pt.anim);
        viz.object.scale.setScalar(0.042);
        g.add(viz.object);
      }
      const collider = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      g.add(collider);
      const lab = labelMesh([pt.ja, pt.jaHint], { w: 0.125, h: 0.042 });
      lab.mesh.position.y = -0.068;
      g.add(lab.mesh);
      painGrid.add(g);
      const orb = { pt, g, viz, collider };
      orb.target = ix.add({
        object: collider,
        kind: 'mesh',
        poke: true,
        onPress: () => {
          link.send({ type: 'painType', id: pt.id });
          flash(T(`「${pt.ja}」を医師に伝えました`, `Sent: ${pt.en}`));
        },
      });
      painOrbs.push(orb);
    });
  }
  for (const o of painOrbs) {
    const chosen = st.type === o.pt.id;
    o.g.visible = show || chosen;
    o.viz?.setActive(chosen);
    // Once chosen, the orb moves above the hand panel while the patient rates intensity.
    o.g.position.set(chosen && !show ? 0 : ((painOrbs.indexOf(o) % 5) - 2) * 0.13, chosen && !show ? 0.06 : painOrbs.indexOf(o) < 5 ? 0.07 : -0.1, 0);
  }
}

// ================================================================ XR session & frame loop

let needsRecenter = false;
let recenterFrames = 0;
function recenter() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  cam.getWorldPosition(p);
  cam.getWorldQuaternion(q);
  if (renderer.xr.isPresenting && p.y < 0.3) return false; // pose not ready yet
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const yaw = Math.atan2(-fwd.x, -fwd.z);
  uiRoot.position.copy(p);
  uiRoot.rotation.set(0, yaw, 0);
  floorRoot.position.set(p.x, 0, p.z);
  floorRoot.rotation.set(0, yaw, 0);
  return true;
}

async function enterXR(mode) {
  const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
  await renderer.xr.setSession(session);
  env.visible = mode === 'immersive-vr';
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

const clock = new THREE.Clock();
renderer.setAnimationLoop((t) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (needsRecenter && ++recenterFrames > 3 && recenter()) (needsRecenter = false), (recenterFrames = 0);
  ix.update();
  // animations
  if (stageObj) {
    stageObj.update?.(dt, time);
    if (S?.stage?.tool === 'model' && stageHolder) {
      const o = stageHolder;
      o.rotation.y += (targetYaw - o.rotation.y) * 0.15;
      o.rotation.x += (targetPitch - o.rotation.x) * 0.15;
    }
  }
  if (painGrid.visible && painOrbs) for (const o of painOrbs) if (o.g.visible) o.viz?.update(dt, time);
  const aiActive = aiHolding || S?.aiBusy || S?.aiListening?.doctor;
  aiOrb.scale.setScalar(aiActive ? 1 + 0.18 * Math.sin(time * 6) : 1);
  aiOrb.material.emissiveIntensity = aiActive ? 1.6 : 0.5;
  if (toastP.mesh.visible && performance.now() > toastUntil) toastP.mesh.visible = false;
  if (S?.consent?.status === 'preparing' || S?.consent?.status === 'precheck') {
    if (Math.floor(t / 300) !== renderLoopTick) (renderLoopTick = Math.floor(t / 300)), (work.sig = null), renderWork();
  }
  renderLive(t);
  renderer.render(scene, camera);
});
let renderLoopTick = 0;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// desktop preview: drag to look around, Space = hold AI button
ix.onLook = (dx, dy) => {
  camera.rotation.y -= dx * 0.004;
  camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x - dy * 0.004));
};
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && !e.repeat) aiStart();
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') aiEnd();
});

// ================================================================ intro / start

const setStatus = (s) => (document.getElementById('status').textContent = s);
document.getElementById('startBtn').onclick = async () => {
  setStatus('マイクを準備しています…');
  const ok = await startMic();
  if (ok) setStatus('マイク OK ✓');
  document.getElementById('startBtn').hidden = true;
  document.getElementById('xrBtns').hidden = false;
  if (navigator.xr) {
    const [ar, vr] = await Promise.all([navigator.xr.isSessionSupported('immersive-ar').catch(() => false), navigator.xr.isSessionSupported('immersive-vr').catch(() => false)]);
    document.getElementById('arBtn').hidden = !ar;
    document.getElementById('vrBtn').hidden = !vr;
    document.getElementById('enterXR').hidden = !(ar || vr);
  }
};
document.getElementById('arBtn').onclick = () => enterXR('immersive-ar').catch((e) => setStatus(e.message));
document.getElementById('vrBtn').onclick = () => enterXR('immersive-vr').catch((e) => setStatus(e.message));
document.getElementById('enterXR').onclick = async () => {
  const ar = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  enterXR(ar ? 'immersive-ar' : 'immersive-vr').catch((e) => flash(e.message));
};
document.getElementById('deskBtn').onclick = () => {
  document.getElementById('intro').hidden = true;
  document.getElementById('desk').hidden = false;
  document.getElementById('hint').hidden = false;
};
document.getElementById('micToggle').onclick = toggleMic;
document.getElementById('desk').onsubmit = (e) => {
  e.preventDefault();
  const inp = document.getElementById('deskInput');
  if (inp.value.trim()) link.send({ type: 'text', text: inp.value.trim() });
  inp.value = '';
};
if (new URLSearchParams(location.search).has('preview')) document.getElementById('deskBtn').onclick();

// Fonts: redraw everything once Noto Sans JP is ready (canvas text doesn't reflow on its own).
let fontsReady = false;
Promise.race([document.fonts.load(`700 32px "Noto Sans JP"`), new Promise((r) => setTimeout(r, 2500))]).finally(() => {
  fontsReady = true;
  renderAll();
});

window.__eyesee = { link, get state() { return S; }, scene, uiRoot, ix, renderer, THREE, buttons: { iSeeBtn, confusedBtn, aiBtn }, panels: { transcript, glossary, work }, painGrid, get painOrbs() { return painOrbs; }, get workMode() { return S && workMode(); } };
// test hook: look direction in degrees (desktop preview)
window.__setView = (yawDeg, pitchDeg) => camera.rotation.set((pitchDeg * Math.PI) / 180, (yawDeg * Math.PI) / 180, 0, 'YXZ');

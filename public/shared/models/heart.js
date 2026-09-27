// EyeSee — procedural human heart (organ model).
// Anterior view faces +z; patient's left is +x. Built in centimetres around the
// cardiac base, then normalised to ~1 unit tall and centred on the origin.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const meta = {
  id: 'heart',
  label: { en: 'Heart', ja: '心臓' },
  summary: {
    en: 'Four chambers, great vessels and coronary arteries — with a narrowing in the LAD.',
    ja: '4つの部屋・太い血管・冠動脈（左前下行枝に狭窄あり）',
  },
  kind: 'organ',
};

const PARTS = [
  { id: 'lv', label: { en: 'Left ventricle', ja: '左心室' },
    info: { en: 'The strongest pumping chamber. It pushes oxygen-rich blood out through the aorta to the whole body.',
            ja: '心臓でいちばん力の強い部屋です。酸素を多く含む血液を大動脈から全身へ送り出します。' } },
  { id: 'rv', label: { en: 'Right ventricle', ja: '右心室' },
    info: { en: 'Pumps the blood returning from the body into the lungs, where it picks up oxygen.',
            ja: '全身から戻ってきた血液を肺へ送り出し、酸素を受け取らせます。' } },
  { id: 'la', label: { en: 'Left atrium', ja: '左心房' },
    info: { en: 'Collects oxygen-rich blood coming back from the lungs and passes it down to the left ventricle.',
            ja: '肺から戻ってきた酸素の多い血液を受け取り、左心室へ送ります。' } },
  { id: 'ra', label: { en: 'Right atrium', ja: '右心房' },
    info: { en: 'Receives blood returning from the body. The heart\'s natural pacemaker, which sets the heartbeat, sits here.',
            ja: '全身から戻ってきた血液を受け取る部屋です。心拍のリズムを作る「ペースメーカー（洞結節）」もここにあります。' } },
  { id: 'aorta', label: { en: 'Aorta', ja: '大動脈' },
    info: { en: 'The body\'s largest artery. It carries blood from the left ventricle up over the arch to the head, arms and the rest of the body.',
            ja: '体でいちばん太い動脈です。左心室から出た血液を、弓の形のカーブを通って頭・腕・全身へ運びます。' } },
  { id: 'pulmonary', label: { en: 'Pulmonary artery', ja: '肺動脈' },
    info: { en: 'Carries oxygen-poor blood from the right ventricle to the left and right lungs.',
            ja: '右心室から酸素の少ない血液を左右の肺へ運びます。' } },
  { id: 'pulmonary-veins', label: { en: 'Pulmonary veins', ja: '肺静脈' },
    info: { en: 'Four veins that bring freshly oxygenated blood from the lungs back into the left atrium.',
            ja: '肺で酸素を受け取った血液を左心房へ戻す4本の静脈です。' } },
  { id: 'vena-cava', label: { en: 'Superior & inferior vena cava', ja: '上大静脈・下大静脈' },
    info: { en: 'Two large veins that return blood from the upper and lower body into the right atrium.',
            ja: '上半身と下半身から戻ってくる血液を右心房へ運ぶ、2本の太い静脈です。' } },
  { id: 'rca', label: { en: 'Right coronary artery (RCA)', ja: '右冠動脈' },
    info: { en: 'Feeds the right side and the underside of the heart muscle with blood.',
            ja: '心臓の右側と下側の筋肉に血液を送る血管です。' } },
  { id: 'left-main', label: { en: 'Left main coronary artery', ja: '左冠動脈主幹部' },
    info: { en: 'A short trunk that starts at the aorta and splits into the two arteries feeding the left side of the heart.',
            ja: '大動脈から出てすぐ2本に分かれる短い幹で、心臓の左側に血液を送る大もとです。' } },
  { id: 'lad', label: { en: 'Left anterior descending artery (LAD)', ja: '左前下行枝' },
    info: { en: 'Runs down the front of the heart and supplies a large part of the main pumping chamber.',
            ja: '心臓の前面を下っていく血管で、ポンプの主役である左心室の広い範囲に血液を送ります。' } },
  { id: 'lcx', label: { en: 'Left circumflex artery (LCx)', ja: '左回旋枝' },
    info: { en: 'Wraps around the left side toward the back of the heart, feeding the side wall of the left ventricle.',
            ja: '心臓の左側を回り込んで後ろへ向かい、左心室の側面に血液を送ります。' } },
  { id: 'stenosis', label: { en: 'Narrowing (plaque)', ja: '狭窄（プラーク）' },
    info: { en: 'A fatty buildup called plaque has narrowed this artery, so less blood reaches the heart muscle. This can cause chest pain or tightness, especially during activity.',
            ja: 'プラークと呼ばれる脂肪などのかたまりで血管が狭くなり、心臓の筋肉に届く血液が減っています。体を動かしたときの胸の痛みや締めつけ感の原因になります。' } },
];

// ───────────────────────── small math / noise helpers ─────────────────────────
const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = clamp01(0.5 + 0.5 * (b - a) / k); return lerp(b, a, h) - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);

function hash3(i, j, k, s) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683) ^ Math.imul(s + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
function noise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = lerp(hash3(xi, yi, zi, s), hash3(xi + 1, yi, zi, s), u);
  const b = lerp(hash3(xi, yi + 1, zi, s), hash3(xi + 1, yi + 1, zi, s), u);
  const c = lerp(hash3(xi, yi, zi + 1, s), hash3(xi + 1, yi, zi + 1, s), u);
  const d = lerp(hash3(xi, yi + 1, zi + 1, s), hash3(xi + 1, yi + 1, zi + 1, s), u);
  return lerp(lerp(a, b, v), lerp(c, d, v), w);
}
const fbm = (x, y, z, s = 0) =>
  noise3(x, y, z, s) * 0.6 + noise3(x * 2.03, y * 2.03, z * 2.03, s + 7) * 0.28 + noise3(x * 4.1, y * 4.1, z * 4.1, s + 13) * 0.12;

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
function sdCapsule(x, y, z, a, b, r) {
  const px = x - a.x, py = y - a.y, pz = z - a.z;
  const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z;
  const h = clamp01((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz));
  return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - r;
}

// Orthonormal frame whose y axis is `up`, z axis as close to `hint` as possible.
function makeFrame(up, hint) {
  const y = up.clone().normalize();
  const z = hint.clone().addScaledVector(y, -hint.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return { x, y, z };
}

// Star-shaped implicit surface → mesh: every vertex of an icosphere is pushed along its
// ray from `c` to the first zero-crossing of F (negative inside).
function implicitGeometry(F, c, detail, rMax, stretch) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const d = new THREE.Vector3();
  const steps = 56, dt = rMax / steps;
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i);
    if (stretch) {
      const { f, s } = stretch;
      const a = d.x * s[0], b = d.y * s[1], e = d.z * s[2];
      d.set(f.x.x * a + f.y.x * b + f.z.x * e, f.x.y * a + f.y.y * b + f.z.y * e, f.x.z * a + f.y.z * b + f.z.z * e);
    }
    d.normalize();
    let lo = 0, hi = rMax;
    for (let t = dt; t <= rMax + 1e-6; t += dt) {
      if (F(c.x + d.x * t, c.y + d.y * t, c.z + d.z * t) > 0) { hi = t; lo = t - dt; break; }
    }
    for (let k = 0; k < 16; k++) {
      const m = (lo + hi) * 0.5;
      if (F(c.x + d.x * m, c.y + d.y * m, c.z + d.z * m) > 0) hi = m; else lo = m;
    }
    const t = (lo + hi) * 0.5;
    pos.setXYZ(i, c.x + d.x * t, c.y + d.y * t, c.z + d.z * t);
  }
  g.computeVertexNormals();
  return g;
}

// Tube with variable radius along a curve; optional end caps showing a cut lumen.
function tubeGeometry(curve, segs, radial, rFn, opts = {}) {
  const { capStart = false, capEnd = false, lumen = null, wall = null } = opts;
  const frames = curve.computeFrenetFrames(segs, false);
  const len = curve.getLength();
  const ring = radial + 1;
  const nCap = (capStart ? 1 : 0) + (capEnd ? 1 : 0);
  const count = (segs + 1) * ring + nCap * (2 * ring + 1);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  col.fill(1);
  const idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  let v = 0;
  const e = 1 / segs;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, P);
    const r = rFn(u);
    const slope = (rFn(Math.min(1, u + e * 0.5)) - rFn(Math.max(0, u - e * 0.5))) / (e * len);
    const T = frames.tangents[i], Nn = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      N.set(Nn.x * ca + B.x * sa, Nn.y * ca + B.y * sa, Nn.z * ca + B.z * sa);
      pos.set([P.x + N.x * r, P.y + N.y * r, P.z + N.z * r], v * 3);
      N.addScaledVector(T, -slope).normalize();
      nor.set([N.x, N.y, N.z], v * 3);
      uv.set([u, j / radial], v * 2);
      v++;
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j, b = a + ring;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const cap = (end) => {
    const i = end ? segs : 0;
    const u = end ? 1 : 0;
    curve.getPointAt(u, P);
    const r = rFn(u);
    const T = frames.tangents[i], Nn = frames.normals[i], B = frames.binormals[i];
    const s = end ? 1 : -1;
    const base = v;
    for (let k = 0; k < 2; k++) {
      const rr = k === 0 ? r : r * 0.72;
      const c = k === 0 ? wall : lumen;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        N.set(Nn.x * ca + B.x * sa, Nn.y * ca + B.y * sa, Nn.z * ca + B.z * sa);
        pos.set([P.x + N.x * rr, P.y + N.y * rr, P.z + N.z * rr], v * 3);
        nor.set([T.x * s, T.y * s, T.z * s], v * 3);
        if (c) col.set([c.r, c.g, c.b], v * 3);
        v++;
      }
    }
    pos.set([P.x - T.x * s * r * 0.25, P.y - T.y * s * r * 0.25, P.z - T.z * s * r * 0.25], v * 3);
    nor.set([T.x * s, T.y * s, T.z * s], v * 3);
    if (lumen) col.set([lumen.r * 0.6, lumen.g * 0.6, lumen.b * 0.6], v * 3);
    const center = v++;
    for (let j = 0; j < radial; j++) {
      const o = base + j, n = base + ring + j;
      if (end) idx.push(o, n, o + 1, o + 1, n, n + 1, n, center, n + 1);
      else idx.push(o, o + 1, n, o + 1, n + 1, n, n, n + 1, center);
    }
  };
  if (capStart) cap(false);
  if (capEnd) cap(true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Soft studio environment (generated) so wet tissue and clear-coat catch highlights.
function makeEnvTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#fbfdff'); grd.addColorStop(0.38, '#aab4c0'); grd.addColorStop(0.52, '#6d6560');
  grd.addColorStop(0.7, '#3a3434'); grd.addColorStop(1, '#141214');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  const box = (x, y, w, h, a) => {
    const r = g.createRadialGradient(x + w / 2, y + h / 2, 1, x + w / 2, y + h / 2, Math.max(w, h) * 0.7);
    r.addColorStop(0, `rgba(255,255,255,${a})`); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(x - w * 0.3, y - h * 0.3, w * 1.6, h * 1.6);
  };
  box(30, 18, 50, 26, 1); box(150, 26, 60, 22, 0.8); box(215, 50, 30, 30, 0.45);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Highlight / dim controller shared by all parts of a model.
function makeHighlighter() {
  const entries = []; // { id, mats: [], glow, dim }
  const byId = new Map();
  let current = null;
  const warm = new THREE.Color(1, 0.93, 0.78);
  return {
    register(id, mat) {
      let e = byId.get(id);
      if (!e) { e = { id, mats: [], glow: 0, dim: 0, settled: false }; byId.set(id, e); entries.push(e); }
      if (e.mats.includes(mat)) return;
      mat.userData.hl = {
        color: mat.color.clone(), emissive: mat.emissive.clone(), opacity: mat.opacity,
        glow: mat.color.clone().lerp(warm, 0.45),
      };
      e.mats.push(mat);
    },
    set(id) { current = id && byId.has(id) ? id : null; for (const e of entries) e.settled = false; },
    update(dt, t) {
      const k = 1 - Math.exp(-dt * 7);
      const pulse = 0.55 + 0.45 * Math.sin(t * 5.2);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const tg = current === e.id ? 1 : 0;
        const td = current && current !== e.id ? 1 : 0;
        const active = tg > 0 || e.glow > 0.001;
        if (e.settled && !active) continue;
        e.glow += (tg - e.glow) * k;
        e.dim += (td - e.dim) * k;
        if (Math.abs(tg - e.glow) < 0.002 && Math.abs(td - e.dim) < 0.002) { e.glow = tg; e.dim = td; if (!tg) e.settled = true; }
        const gl = e.glow * (0.22 + 0.38 * pulse);
        const dm = 1 - 0.5 * e.dim;
        for (let m = 0; m < e.mats.length; m++) {
          const mat = e.mats[m], h = mat.userData.hl;
          mat.color.copy(h.color).multiplyScalar(dm);
          mat.emissive.copy(h.emissive).lerp(h.glow, gl);
          if (mat.transparent) mat.opacity = h.opacity * (1 - 0.45 * e.dim);
        }
      }
    },
  };
}

// ─────────────────────────────── the model ───────────────────────────────
export function create() {
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };
  const hl = makeHighlighter();
  const env = makeEnvTexture();
  if (env) track(env);

  const root = new THREE.Group();
  root.name = 'heart';
  const body = new THREE.Group(); // centimetre space, normalised at the end
  root.add(body);

  // ── heart frame: y' = apex→base (long axis), z' = anterior, x' = patient-left ──
  const APEX_DIR = new THREE.Vector3(0.62, -0.72, 0.3).normalize();
  const HF = makeFrame(APEX_DIR.clone().negate(), new THREE.Vector3(0, 0, 1));
  const hx = HF.x, hy = HF.y, hz = HF.z;
  const LV_LEN = 10.2, RV_LEN = 8.4;
  const floor = (x, y) => -5.7 - 0.27 * x - y; // flat diaphragmatic surface (inside when < 0)

  // ── implicit chamber shapes (cm; origin = centre of the cardiac base) ──
  const lv0 = (x, y, z) => {
    const u = x * hx.x + y * hx.y + z * hx.z, v = x * hy.x + y * hy.y + z * hy.z, w = x * hz.x + y * hz.y + z * hz.z;
    const t = -v / LV_LEN;
    let R;
    if (t < 0) { const q = t / 0.24; R = 3.25 * Math.sqrt(Math.max(0, 1 - q * q)); }
    else if (t > 1) R = -1;
    else R = 3.25 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.3)), 0.5);
    return Math.hypot((u - 0.95 + 0.25 * t) / 1.0, (w + 0.4) / 0.9) - R;
  };
  const PVv = new THREE.Vector3(1.25, 2.3, 1.75); // pulmonary valve
  const infA = new THREE.Vector3().addScaledVector(hx, -0.2).addScaledVector(hy, -1.2).addScaledVector(hz, 1.9);
  const rv0 = (x, y, z) => {
    const u = x * hx.x + y * hx.y + z * hx.z, v = x * hy.x + y * hy.y + z * hy.z, w = x * hz.x + y * hz.y + z * hz.z;
    const t = (0.3 - v) / RV_LEN;
    let R;
    if (t < 0) { const q = t / 0.3; R = 3.1 * Math.sqrt(Math.max(0, 1 - q * q)); }
    else if (t > 1) R = -1;
    else R = 3.1 * Math.pow(Math.max(0, 1 - Math.pow(t, 1.9)), 0.6);
    let f = Math.hypot((u + 1.25 - 1.0 * t) / 1.05, (w - 1.25 + 0.2 * t) / 0.78) - R;
    return smin(f, sdCapsule(x, y, z, infA, PVv, 1.3), 1.2); // outflow tract (infundibulum)
  };
  // Blended ventricular mass with a shallow interventricular groove; LV/RV are its two halves.
  const U_v = (x, y, z) => {
    const a = lv0(x, y, z), b = rv0(x, y, z);
    let f = smin(a, b, 0.8);
    const d = a - b;
    f += 0.4 * Math.exp(-(d * d) / 0.25);
    f = smax(f, floor(x, y), 1.5);
    return f + 0.1 * fbm(x * 0.45, y * 0.45, z * 0.45, 3) + 0.025 * noise3(x * 1.7, y * 1.7, z * 1.7, 4);
  };
  const F_lv = (x, y, z) => Math.max(U_v(x, y, z), lv0(x, y, z) - rv0(x, y, z) - 0.03);
  const F_rv = (x, y, z) => Math.max(U_v(x, y, z), rv0(x, y, z) - lv0(x, y, z) - 0.03);

  const svcA = new THREE.Vector3(-3.1, 2.6, -0.55), svcB = new THREE.Vector3(-3.1, 3.4, -0.6);
  const ivcA = new THREE.Vector3(-2.95, -1.0, -0.85), ivcB = new THREE.Vector3(-2.9, -1.9, -0.95);
  const F_ra = (x, y, z) => {
    let f = sdEllipsoid(x + 3.15, y - 0.85, z + 0.35, 2.05, 2.75, 2.15);
    f = smin(f, sdCapsule(x, y, z, svcA, svcB, 1.3), 0.9);
    f = smin(f, sdCapsule(x, y, z, ivcA, ivcB, 1.45), 0.9);
    return f + 0.1 * fbm(x * 0.5, y * 0.5, z * 0.5, 11);
  };
  // right auricle: a flat, scalloped, ear-shaped flap draped over the aortic root
  const rauC = new THREE.Vector3(-1.75, 2.5, 1.35);
  const F_rau = (x, y, z) => {
    const px = x - rauC.x, py = y - rauC.y, pz = z - rauC.z;
    const a = px * 0.86 + py * 0.51, b = -px * 0.51 + py * 0.86; // a points to the tip (medial, up)
    const taper = 1 - 0.4 * clamp01((a + 1.9) / 3.8);
    const f = sdEllipsoid(a, (b + 0.1 * a * a) / taper, pz + 0.16 * a * a - 0.12 * b, 1.95, 0.95, 0.55);
    return f + 0.05 * Math.sin(a * 6.5 + b * 2.0) + 0.06 * noise3(x * 1.8, y * 1.8, z * 1.8, 21);
  };
  const pvStubs = [
    [new THREE.Vector3(-0.9, 2.0, -3.25), new THREE.Vector3(-1.8, 2.25, -3.55)],
    [new THREE.Vector3(-0.8, 0.8, -3.15), new THREE.Vector3(-1.7, 0.65, -3.45)],
    [new THREE.Vector3(2.2, 2.1, -3.25), new THREE.Vector3(3.0, 2.4, -3.45)],
    [new THREE.Vector3(2.2, 0.9, -3.15), new THREE.Vector3(3.0, 0.85, -3.35)],
  ];
  const F_la = (x, y, z) => {
    let f = sdEllipsoid(x - 0.65, y - 1.25, z + 3.0, 2.85, 1.85, 1.95);
    for (const [a, b] of pvStubs) f = smin(f, sdCapsule(x, y, z, a, b, 0.85), 0.6);
    return f + 0.08 * fbm(x * 0.5, y * 0.5, z * 0.5, 17);
  };
  // left auricle: a hooked, crinkled finger peeking round the left of the pulmonary trunk
  const lauC = new THREE.Vector3(3.2, 2.35, 0.55);
  const F_lau = (x, y, z) => {
    const px = x - lauC.x, py = y - lauC.y, pz = z - lauC.z;
    const taper = 1 - 0.35 * clamp01((pz + 1.6) / 3.2);
    const f = sdEllipsoid((px + 0.2 * pz * pz - 0.25 * pz) / taper, py - 0.25 * pz + 0.08 * pz * pz, pz, 0.95, 0.6, 1.65);
    return f + 0.05 * Math.sin(pz * 6 + px * 2.5) + 0.06 * noise3(x * 1.8, y * 1.8, z * 1.8, 31);
  };
  const F_atria = (x, y, z) => Math.min(F_ra(x, y, z), F_la(x, y, z), F_rau(x, y, z), F_lau(x, y, z));
  const F_all = (x, y, z) => Math.min(U_v(x, y, z), F_atria(x, y, z));
  // smooth union used only to seat the coronaries over the atrioventricular groove
  const F_seat = (x, y, z) => smin(U_v(x, y, z), F_atria(x, y, z), 1.0);

  // ── materials ──
  const tissue = (hex, extra = {}) => track(new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.52, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3,
    sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ff9c8a'),
    vertexColors: true, envMap: env, envMapIntensity: 0.5, ...extra,
  }));
  const vessel = (hex, extra = {}) => track(new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.36, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2,
    vertexColors: true, envMap: env, envMapIntensity: 0.6, ...extra,
  }));
  const M = {
    lv: tissue('#9a3a33'), rv: tissue('#963a3c'), la: tissue('#a2474d'), ra: tissue('#9c4558'),
    aorta: vessel('#c43f38'), pulmonary: vessel('#5070b4'), pveins: vessel('#b8464d'), cava: vessel('#42599a'),
    rca: vessel('#e04a3c'), lm: vessel('#e04a3c'), lad: vessel('#e04a3c'), lcx: vessel('#e04a3c'),
    plaque: vessel('#e9c35a', { roughness: 0.5, clearcoat: 0.6, sheen: 0.5, sheenColor: new THREE.Color('#fff4c8') }),
  };
  const partOfMat = { lv: 'lv', rv: 'rv', la: 'la', ra: 'ra', aorta: 'aorta', pulmonary: 'pulmonary', pveins: 'pulmonary-veins', cava: 'vena-cava', rca: 'rca', lm: 'left-main', lad: 'lad', lcx: 'lcx', plaque: 'stenosis' };
  for (const k in M) hl.register(partOfMat[k], M[k]);

  const addMesh = (geo, matKey, parent) => {
    track(geo);
    const mesh = new THREE.Mesh(geo, M[matKey]);
    mesh.userData.partId = partOfMat[matKey];
    parent.add(mesh);
    return mesh;
  };

  // Vertex colours: mottling + cheap ambient occlusion in the grooves between chambers.
  const shadeChamber = (geo, seed) => {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      const d = 0.8;
      const ao = clamp01(F_all(x + nx * d, y + ny * d, z + nz * d) / d);
      const mott = 1 + 0.08 * fbm(x * 1.2, y * 1.2, z * 1.2, seed) + 0.05 * noise3(x * 3.5, y * 3.5, z * 3.5, seed + 1);
      const s = (0.5 + 0.5 * Math.pow(ao, 0.9)) * mott;
      col[i * 3] = s; col[i * 3 + 1] = s * (0.97 + 0.03 * ao); col[i * 3 + 2] = s * (0.97 + 0.03 * ao);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };

  // ── groups driven by the heartbeat ──
  const ventG = new THREE.Group(); body.add(ventG);
  const atriaG = new THREE.Group(); body.add(atriaG);
  const vesselG = new THREE.Group(); body.add(vesselG);

  // chambers
  const at = (u, v, w) => new THREE.Vector3().addScaledVector(hx, u).addScaledVector(hy, v).addScaledVector(hz, w);
  addMesh(shadeChamber(implicitGeometry(F_lv, at(1.1, -4.2, -0.6), 26, 10, { f: HF, s: [1, 1.7, 0.95] }), 3), 'lv', ventG);
  addMesh(shadeChamber(implicitGeometry(F_rv, at(-1.2, -2.6, 1.55), 24, 10, { f: HF, s: [1.1, 1.5, 0.8] }), 5), 'rv', ventG);
  addMesh(shadeChamber(implicitGeometry(F_ra, new THREE.Vector3(-3.15, 0.85, -0.35), 17, 7), 11), 'ra', atriaG);
  addMesh(shadeChamber(implicitGeometry(F_rau, rauC, 12, 3.5), 21), 'ra', atriaG);
  addMesh(shadeChamber(implicitGeometry(F_la, new THREE.Vector3(0.65, 1.25, -3.0), 17, 6), 17), 'la', atriaG);
  addMesh(shadeChamber(implicitGeometry(F_lau, lauC, 12, 3.5), 31), 'la', atriaG);

  // ── great vessels ──
  const cr = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const bump = (u, c, w) => Math.exp(-((u - c) * (u - c)) / (w * w));
  const lumenRed = new THREE.Color('#4a0d10'), lumenBlue = new THREE.Color('#1b2350');
  const wallA = new THREE.Color('#f2cfc6'), wallV = new THREE.Color('#cfd2e6');

  const aortaCurve = cr([[0.15, 0.3, -0.45], [0.0, 2.3, 0.05], [-0.5, 4.3, 0.3], [-0.4, 5.9, 0.0], [0.45, 6.85, -1.3],
    [1.55, 6.7, -3.2], [2.1, 5.4, -4.8], [2.2, 2.8, -5.5], [2.1, -1.4, -5.6]]);
  const aortaR = (u) => lerp(1.5, 1.12, sstep(0.25, 0.8, u)) + 0.25 * bump(u, 0.07, 0.06);
  addMesh(tubeGeometry(aortaCurve, 120, 28, aortaR, { capEnd: true, lumen: lumenRed, wall: wallA }), 'aorta', vesselG);
  const branch = (u0, dirPts, r0, r1) => {
    const p0 = aortaCurve.getPointAt(u0);
    const pts = [p0.clone().add(new THREE.Vector3(0, -0.5, 0)), ...dirPts.map((d) => p0.clone().add(new THREE.Vector3(...d)))];
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    return tubeGeometry(c, 30, 18, (u) => lerp(r0, r1, u) + 0.28 * bump(u, 0.15, 0.13), { capEnd: true, lumen: lumenRed, wall: wallA });
  };
  addMesh(branch(0.36, [[-0.3, 1.1, 0.05], [-0.95, 2.1, 0.2], [-1.3, 2.6, 0.25]], 0.76, 0.68), 'aorta', vesselG);
  addMesh(branch(0.44, [[0.1, 1.2, -0.1], [0.2, 2.2, -0.1], [0.25, 2.6, -0.05]], 0.52, 0.47), 'aorta', vesselG);
  addMesh(branch(0.52, [[0.35, 1.05, -0.15], [0.95, 2.0, -0.2], [1.3, 2.45, -0.1]], 0.58, 0.52), 'aorta', vesselG);

  const ptCurve = cr([[0.9, 1.3, 1.15], [1.3, 2.5, 1.85], [1.7, 3.8, 1.1], [1.85, 4.6, -0.4], [1.85, 4.8, -0.9]]);
  addMesh(tubeGeometry(ptCurve, 64, 26, (u) => 1.36 + 0.16 * bump(u, 0.3, 0.1), {}), 'pulmonary', vesselG);
  const lpa = cr([[1.9, 4.65, -0.7], [3.2, 4.9, -1.6], [4.5, 4.6, -2.5], [5.6, 4.1, -2.95]]);
  const rpa = cr([[1.8, 4.7, -0.8], [0.4, 4.75, -2.05], [-1.8, 4.65, -2.75], [-4.3, 4.2, -2.9]]);
  addMesh(tubeGeometry(lpa, 44, 20, (u) => lerp(1.02, 0.9, u), { capEnd: true, lumen: lumenBlue, wall: wallV }), 'pulmonary', vesselG);
  addMesh(tubeGeometry(rpa, 56, 20, (u) => lerp(1.02, 0.9, u), { capEnd: true, lumen: lumenBlue, wall: wallV }), 'pulmonary', vesselG);

  const svc = cr([[-3.05, 8.0, -0.85], [-3.1, 5.6, -0.75], [-3.1, 3.4, -0.6], [-3.1, 2.4, -0.55]]);
  const ivc = cr([[-2.5, -5.6, -1.5], [-2.65, -3.6, -1.25], [-2.85, -2.0, -0.95], [-2.95, -1.1, -0.85]]);
  addMesh(tubeGeometry(svc, 40, 22, () => 1.02, { capStart: true, lumen: lumenBlue, wall: wallV }), 'cava', vesselG);
  addMesh(tubeGeometry(ivc, 32, 22, () => 1.16, { capStart: true, lumen: lumenBlue, wall: wallV }), 'cava', vesselG);

  const pvCurves = [
    [[-1.3, 2.1, -3.35], [-2.7, 2.55, -3.75], [-4.1, 2.95, -3.9]],
    [[-1.2, 0.75, -3.25], [-2.6, 0.6, -3.65], [-4.0, 0.4, -3.8]],
    [[2.6, 2.25, -3.35], [3.9, 2.7, -3.6], [5.1, 3.0, -3.5]],
    [[2.6, 0.9, -3.25], [3.9, 0.8, -3.55], [5.0, 0.55, -3.4]],
  ];
  for (const pc of pvCurves) addMesh(tubeGeometry(cr(pc), 24, 16, () => 0.64, { capEnd: true, lumen: lumenRed, wall: wallA }), 'pveins', atriaG);

  // ── coronary arteries: paths in (azimuth, height) around the long axis, seated on the surface ──
  const gradF = (F, p, out) => {
    const e = 0.02;
    out.set(F(p.x + e, p.y, p.z) - F(p.x - e, p.y, p.z), F(p.x, p.y + e, p.z) - F(p.x, p.y - e, p.z), F(p.x, p.y, p.z + e) - F(p.x, p.y, p.z - e));
    return out.normalize();
  };
  const tmpN = new THREE.Vector3();
  // march outward from the long axis at height v, azimuth th (0 = anterior, +90° = patient-left)
  const surfAt = (F, th, v, lift) => {
    const o = at(0, v, 0);
    const d = new THREE.Vector3().addScaledVector(hz, Math.cos(th)).addScaledVector(hx, Math.sin(th));
    let lo = 0, hi = -1;
    for (let t = 0.1; t < 9; t += 0.1) { if (F(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) > 0) { hi = t; lo = t - 0.1; break; } }
    if (hi < 0) return null;
    for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (F(o.x + d.x * m, o.y + d.y * m, o.z + d.z * m) > 0) hi = m; else lo = m; }
    const p = o.addScaledVector(d, (lo + hi) / 2);
    return p.addScaledVector(gradF(F, p, tmpN), lift);
  };
  // azimuth of the interventricular groove at height v (sign change of lv0 − rv0 on the surface)
  const grooveAz = (v, a0, a1) => {
    let prev = null, prevA = a0;
    for (let a = a0; a <= a1; a += 0.015) {
      const p = surfAt(U_v, a, v, 0);
      if (!p) continue;
      const d = lv0(p.x, p.y, p.z) - rv0(p.x, p.y, p.z);
      if (prev !== null && Math.sign(d) !== Math.sign(prev)) return lerp(prevA, a, prev / (prev - d));
      prev = d; prevA = a;
    }
    return null;
  };
  const deg = Math.PI / 180;
  const smoothPts = (pts, it = 2) => {
    for (let k = 0; k < it; k++) {
      const c = pts.map((p) => p.clone());
      for (let i = 1; i < pts.length - 1; i++) pts[i].copy(c[i - 1]).add(c[i]).add(c[i]).add(c[i + 1]).multiplyScalar(0.25);
    }
    return pts;
  };
  const coronaryTube = (pts, r0, r1, matKey, rMod) => {
    const curve = new THREE.CatmullRomCurve3(pts.filter(Boolean), false, 'centripetal');
    const segs = Math.max(20, Math.round(curve.getLength() * 7));
    const rf = (u) => lerp(r0, r1, Math.pow(u, 0.85)) * (rMod ? rMod(u) : 1);
    const mesh = addMesh(tubeGeometry(curve, segs, 10, rf, { capStart: true, capEnd: true }), matKey, ventG);
    return { curve, mesh };
  };
  const azOf = (p) => Math.atan2(p.dot(hx), p.dot(hz));
  const branchOff = (curve, u0, dAz, vEnd, r, matKey, n = 8) => {
    const p0 = curve.getPointAt(u0);
    const a0 = azOf(p0), v0 = p0.dot(hy);
    const pts = [p0];
    for (let k = 1; k <= n; k++) {
      const s = k / n;
      pts.push(surfAt(U_v, a0 + dAz * Math.pow(s, 0.8), lerp(v0, vEnd, s), r * 0.4));
    }
    return coronaryTube(smoothPts(pts.filter(Boolean), 2), r, r * 0.4, matKey);
  };

  const Rc = 0.3; // proximal coronary radius (cm; a touch exaggerated for legibility)
  // left main: from the left aortic sinus, passing behind the pulmonary trunk
  const lmStart = aortaCurve.getPointAt(0.04).add(new THREE.Vector3(1.15, 0.0, 0.0));
  const lmEnd = surfAt(F_seat, 64 * deg, 0.55, Rc * 0.5);
  const lmMid = lmStart.clone().lerp(lmEnd, 0.5).add(new THREE.Vector3(0, 0.15, -0.1));
  coronaryTube([lmStart, lmMid, lmEnd], Rc * 1.15, Rc * 1.05, 'lm');

  // LAD down the anterior interventricular groove
  const ladPts = [lmEnd.clone()];
  let lastAz = 40 * deg;
  for (let v = 0.0; v >= -9.6; v -= 0.45) {
    const g = v > -0.8 ? null : grooveAz(v, -30 * deg, 95 * deg);
    const az = g !== null ? g : v > -0.8 ? lerp(64, 45, (-v) / 0.8) * deg : lastAz;
    lastAz = az;
    ladPts.push(surfAt(U_v, az, v, Rc * 0.45));
  }
  smoothPts(ladPts, 3);
  const STEN_U = 0.37;
  const ladNarrow = (u) => 1 - 0.42 * bump(u, STEN_U, 0.022);
  const lad = coronaryTube(ladPts, Rc * 1.0, Rc * 0.35, 'lad', ladNarrow);
  branchOff(lad.curve, 0.3, 40 * deg, -6.0, Rc * 0.62, 'lad');
  branchOff(lad.curve, 0.56, 32 * deg, -8.2, Rc * 0.5, 'lad');

  // LCx round the left atrioventricular groove
  const lcxPts = [lmEnd.clone()];
  for (let k = 1; k <= 16; k++) {
    const s = k / 16;
    lcxPts.push(surfAt(F_seat, lerp(72, 210, s) * deg, lerp(0.35, -0.35, s), Rc * 0.4));
  }
  const lcx = coronaryTube(smoothPts(lcxPts.filter(Boolean), 3), Rc * 0.95, Rc * 0.5, 'lcx');
  branchOff(lcx.curve, 0.4, 14 * deg, -7.0, Rc * 0.62, 'lcx');

  // RCA: from the right (anterior) aortic sinus, down the right AV groove, round to the back,
  // then the posterior descending artery down the posterior interventricular groove.
  const rcaStart = aortaCurve.getPointAt(0.05).add(new THREE.Vector3(-0.55, 0.0, 1.25));
  const rcaPts = [rcaStart];
  for (let k = 0; k <= 20; k++) {
    const s = k / 20;
    rcaPts.push(surfAt(F_seat, lerp(-12, -200, s) * deg, lerp(0.7, -0.1, sstep(0, 0.35, s)) - 0.3 * s, Rc * 0.4));
  }
  let pAz = 200 * deg;
  for (let v = -1.0; v >= -7.0; v -= 0.6) {
    const g = grooveAz(v, 140 * deg, 260 * deg);
    if (g !== null) pAz = g;
    rcaPts.push(surfAt(U_v, pAz, v, Rc * 0.35));
  }
  const rca = coronaryTube(smoothPts(rcaPts.filter(Boolean), 3), Rc * 1.05, Rc * 0.35, 'rca');
  branchOff(rca.curve, 0.3, 25 * deg, -5.8, Rc * 0.55, 'rca');

  // ── the stenosis: lumpy yellow plaque collar around the narrowed LAD ──
  {
    const c = lad.curve;
    const len = c.getLength();
    const halfU = 0.9 / len; // ±0.9 cm along the vessel
    const P = new THREE.Vector3(), T = new THREE.Vector3(), Nn = new THREE.Vector3(), Sd = new THREE.Vector3();
    const segs = 28, radial = 20;
    const pos = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const s = i / segs; // 0..1 across the plaque
      const u = STEN_U + (s * 2 - 1) * halfU;
      c.getPointAt(u, P); c.getTangentAt(u, T);
      gradF(U_v, P, Nn);
      Nn.addScaledVector(T, -Nn.dot(T)).normalize();
      Sd.crossVectors(T, Nn).normalize();
      const env = Math.sin(Math.PI * s);
      const rv = Rc * lerp(1.0, 0.35, Math.pow(u, 0.85));
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        // eccentric: thicker toward the outer/side face
        const ecc = 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(a - 0.9));
        const lump = 1 + 0.13 * noise3(s * 3.2, ca * 1.2 + 3, sa * 1.2, 41);
        const r = rv * (0.92 + 0.95 * Math.pow(env, 0.85) * ecc * lump);
        pos.push(P.x + (Nn.x * ca + Sd.x * sa) * r, P.y + (Nn.y * ca + Sd.y * sa) * r, P.z + (Nn.z * ca + Sd.z * sa) * r);
      }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const col = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      const n = 0.92 + 0.14 * noise3(pos[i] * 6, pos[i + 1] * 6, pos[i + 2] * 6, 47);
      col[i] = n; col[i + 1] = n * 0.97; col[i + 2] = n * 0.88;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    addMesh(g, 'plaque', ventG);
  }

  // ── normalise: ~1 unit tall, centred on the origin ──
  const box = new THREE.Box3().setFromObject(body);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const S = 1 / size.y;
  body.scale.setScalar(S);
  body.position.copy(ctr).multiplyScalar(-S);

  // ── heartbeat (≈70 bpm): atria contract first, then the ventricles squeeze and twist ──
  const PERIOD = 60 / 70;
  const ventPivot = new THREE.Vector3(0, 0.6, -0.5);
  const atriaPivot = new THREE.Vector3(-1.0, 1.5, -1.8);
  const q = new THREE.Quaternion(), vTmp = new THREE.Vector3();
  const setAbout = (obj, pivot, s, angle) => {
    q.setFromAxisAngle(hy, angle);
    obj.quaternion.copy(q);
    obj.scale.setScalar(s);
    vTmp.copy(pivot).multiplyScalar(s).applyQuaternion(q);
    obj.position.copy(pivot).sub(vTmp);
  };

  const update = (dt, t) => {
    const ph = (((t % PERIOD) + PERIOD) % PERIOD) / PERIOD;
    const atr = ph < 0.16 ? Math.pow(Math.sin((Math.PI * ph) / 0.16), 2) : 0;
    const ven = sstep(0.15, 0.3, ph) * (1 - sstep(0.42, 0.66, ph));
    setAbout(ventG, ventPivot, 1 - 0.045 * ven, -0.035 * ven);
    setAbout(atriaG, atriaPivot, 1 - 0.05 * atr + 0.015 * ven, 0);
    setAbout(vesselG, ventPivot, 1 + 0.01 * ven, 0);
    hl.update(dt, t);
  };

  return {
    object: root,
    parts: PARTS.map((p) => ({ ...p })),
    update,
    highlight(partId) { hl.set(partId); },
    setStep() {},
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}

// EyeSee — coronary artery & stent (PCI) procedure explainer.
// A cut-away segment of a coronary artery (blood flows toward +x, the cut window faces +z),
// narrowed by plaque. setStep(0…4) animates: wire & catheter in → balloon → stent → removal.
// Built in "vessel units" (lumen radius 1), then normalised to ~1 unit long and centred.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const meta = {
  id: 'artery',
  label: { en: 'Coronary stent (PCI)', ja: '冠動脈ステント治療（PCI）' },
  summary: {
    en: 'How a narrowed coronary artery is reopened with a balloon and a stent.',
    ja: '狭くなった冠動脈を、風船とステントで広げる治療の流れ',
  },
  kind: 'procedure',
  steps: [
    { en: 'The artery is narrowed by plaque; blood flow is reduced.',
      ja: '冠動脈がプラークで狭くなり、血流が減っています。' },
    { en: 'A thin guide wire and catheter are threaded to the narrowing (from the wrist or groin).',
      ja: '手首や足の付け根から細いワイヤーとカテーテルを狭い所まで進めます。' },
    { en: 'A small balloon is inflated to widen the artery.',
      ja: '小さな風船をふくらませて血管を広げます。' },
    { en: 'A mesh tube (stent) is expanded and pressed against the wall.',
      ja: '網目状の筒「ステント」を広げて血管の壁に押し当てます。' },
    { en: 'The balloon and catheter are removed; the stent stays and blood flows freely.',
      ja: '風船とカテーテルを抜きます。ステントは残り、血液がよく流れるようになります。' },
  ],
};

const PARTS = [
  { id: 'wall', label: { en: 'Artery wall', ja: '血管の壁（動脈壁）' },
    info: { en: 'The muscular wall of the coronary artery, shown cut open so you can see inside.',
            ja: '冠動脈の壁です。中が見えるように、手前側を切り開いて表示しています。' } },
  { id: 'plaque', label: { en: 'Plaque', ja: 'プラーク' },
    info: { en: 'A buildup of fat and cholesterol inside the artery wall. It narrows the channel that blood flows through.',
            ja: '血管の壁の内側にたまった脂肪やコレステロールのかたまりです。血液の通り道を狭くしています。' } },
  { id: 'blood', label: { en: 'Blood (red blood cells)', ja: '血液（赤血球）' },
    info: { en: 'Red blood cells carry oxygen to the heart muscle. Where the artery is narrowed, fewer of them get through.',
            ja: '赤血球は心臓の筋肉に酸素を運びます。血管が狭い所では、通り抜けられる量が減ってしまいます。' } },
  { id: 'wire', label: { en: 'Guide wire', ja: 'ガイドワイヤー' },
    info: { en: 'A very thin, flexible wire that is gently passed through the narrowing first, to guide the other devices into place.',
            ja: 'とても細くしなやかなワイヤーです。最初に狭い所を通し、ほかの器具を正しい場所へ導く道しるべになります。' } },
  { id: 'catheter', label: { en: 'Catheter', ja: 'カテーテル' },
    info: { en: 'A thin, soft tube that is threaded through the blood vessels from the wrist or groin up to the heart.',
            ja: '手首や足の付け根の血管から心臓まで進める、細くやわらかい管です。' } },
  { id: 'balloon', label: { en: 'Balloon', ja: 'バルーン（風船）' },
    info: { en: 'A tiny balloon on the catheter. It is inflated for a few seconds to push the plaque aside and widen the artery.',
            ja: 'カテーテルについた小さな風船です。数秒間ふくらませてプラークを押し広げ、血管を広げます。' } },
  { id: 'stent', label: { en: 'Stent', ja: 'ステント' },
    info: { en: 'A small metal mesh tube. It stays in the artery permanently, holding it open like scaffolding.',
            ja: '金属でできた小さな網目の筒です。血管の中にずっと残り、内側から支えて広がった状態を保ちます。' } },
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


// ─────────────────────────────── geometry helpers ───────────────────────────────
// Point on the vessel: θ = 0 top (+y), π/2 front (+z, toward the viewer), π bottom, 3π/2 back.
const setP = (out, x, th, r) => out.set(x, r * Math.cos(th), r * Math.sin(th));

// Parametric grid (u,v ∈ [0,1]) with normals from finite differences of f; `keep(i,j)` drops cells.
function paramGrid(nu, nv, f, { keep = null, flip = false, color = null } = {}) {
  const n = (nu + 1) * (nv + 1);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const idx = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    if (keep && !keep(i, j)) continue;
    const a = i * (nv + 1) + j, b = a + nv + 1, c = b + 1, d = a + 1;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), du = new THREE.Vector3(), dv = new THREE.Vector3();
  const e = 1e-3, tmpC = new THREE.Color();
  const refill = () => {
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const u = i / nu, v = j / nv, k = (i * (nv + 1) + j) * 3;
      f(u, v, P);
      pos[k] = P.x; pos[k + 1] = P.y; pos[k + 2] = P.z;
      f(Math.min(1, u + e), v, A); f(Math.max(0, u - e), v, B); du.subVectors(A, B);
      f(u, Math.min(1, v + e), A); f(u, Math.max(0, v - e), B); dv.subVectors(A, B);
      du.cross(dv).normalize();
      if (flip) du.negate();
      nor[k] = du.x; nor[k + 1] = du.y; nor[k + 2] = du.z;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
  };
  refill();
  if (color) for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const k = (i * (nv + 1) + j) * 3;
    f(i / nu, j / nv, P);
    color(P, i / nu, j / nv, tmpC);
    col[k] = tmpC.r; col[k + 1] = tmpC.g; col[k + 2] = tmpC.b;
  } else col.fill(1);
  return { geo: g, refill };
}

// Flat banded strip (a cut face through a layered wall): rows at fractions `fr` between
// rIn(s) and rOut(s), each row coloured with `cols[k]`; `pt(s, r, out)` maps to 3D.
function bandStrip(ns, pt, rIn, rOut, fr, cols, normal) {
  const nr = fr.length;
  const n = (ns + 1) * nr;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const idx = [];
  for (let i = 0; i < ns; i++) for (let k = 0; k < nr - 1; k++) {
    const a = i * nr + k, b = a + nr, c = b + 1, d = a + 1;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const P = new THREE.Vector3();
  let flipped = false;
  const refill = () => {
    for (let i = 0; i <= ns; i++) {
      const s = i / ns, r0 = rIn(s), r1 = rOut(s);
      for (let k = 0; k < nr; k++) {
        const o = (i * nr + k) * 3;
        pt(s, lerp(r0, r1, fr[k]), P);
        pos[o] = P.x; pos[o + 1] = P.y; pos[o + 2] = P.z;
        nor[o] = normal.x; nor[o + 1] = normal.y; nor[o + 2] = normal.z;
        const c = cols[k];
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      }
    }
    if (!flipped) { // make the winding agree with the requested normal
      const ia = idx[0] * 3, ib = idx[1] * 3, ic = idx[2] * 3;
      const ux = pos[ib] - pos[ia], uy = pos[ib + 1] - pos[ia + 1], uz = pos[ib + 2] - pos[ia + 2];
      const vx = pos[ic] - pos[ia], vy = pos[ic + 1] - pos[ia + 1], vz = pos[ic + 2] - pos[ia + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * normal.x + ny * normal.y + nz * normal.z < 0) {
        for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
        g.setIndex(idx);
      }
      flipped = true;
    }
    g.attributes.position.needsUpdate = true;
    g.computeBoundingSphere();
  };
  refill();
  return { geo: g, refill };
}

// Discard fragments whose object-space x is below a per-material threshold (devices sliding
// in/out of the open end of the vessel segment look like they continue beyond it).
function addClipX(mat) {
  const u = { value: -1e9 };
  mat.userData.clipX = u;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uClipX = u;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vObjX;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjX = position.x;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vObjX;\nuniform float uClipX;')
      .replace('void main() {', 'void main() {\n\tif ( vObjX < uClipX ) discard;');
  };
  mat.customProgramCacheKey = () => 'eyesee-clipx';
  return mat;
}

// Red blood cell: biconcave disc (Evans–Fung profile) as a lathe, axis = y.
function rbcGeometry(R) {
  const pts = [];
  const N = 5;
  const half = (rho) => R * 0.5 * Math.sqrt(Math.max(0, 1 - rho * rho)) * (0.207 + 2.003 * rho * rho - 1.123 * rho ** 4) + R * 0.02;
  for (let i = 0; i <= N; i++) { const rho = Math.sin((i / N) * Math.PI / 2); pts.push(new THREE.Vector2(R * rho, half(rho))); }
  for (let i = N - 1; i >= 0; i--) { const rho = Math.sin((i / N) * Math.PI / 2); pts.push(new THREE.Vector2(R * rho, -half(rho))); }
  pts[0].x = 1e-4; pts[pts.length - 1].x = 1e-4;
  const g = new THREE.LatheGeometry(pts, 12);
  g.deleteAttribute('uv');
  return g;
}

// ─────────────────────────────── the model ───────────────────────────────
export function create() {
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };
  const hl = makeHighlighter();
  const env = makeEnvTexture();
  if (env) track(env);

  const root = new THREE.Group();
  root.name = 'artery';
  const body = new THREE.Group(); // vessel units
  root.add(body);

  // ── dimensions ──
  const XL = 5.0;          // half-length of the segment
  const XW = 3.6;          // half-length of the cut-away window
  const PX = 2.4;          // plaque half-length
  const HMAX = 0.94;       // max plaque thickness (lumen radius ≈ 1)
  const CLIP = -XL - 0.25; // devices are hidden left of this (they "continue" upstream)
  const BAL_HALF = 2.2, BAL_BODY = 1.75, STENT_HALF = 2.15;

  const prof = (x) => { const t = x / PX; if (t <= -1 || t >= 1) return 0; const a = 1 - t * t; return a * a * (1 + 0.18 * t); };
  const ecc = (th) => 0.72 + 0.28 * Math.cos(th - 1.25 * Math.PI); // thicker toward the bottom-back
  const wallIn = (x, th) => 1.0 + 0.1 * prof(x) * ecc(th) + 0.02 * noise3(x * 1.3, Math.cos(th) * 1.5, Math.sin(th) * 1.5, 3);
  const wallOut = (x, th) => wallIn(x, th) + 0.34 + 0.08 * prof(x) + 0.03 * noise3(x * 0.9 + 5, Math.cos(th) * 1.2, Math.sin(th) * 1.2, 7);
  const plaque0 = (x, th) => HMAX * prof(x) * ecc(th) * (1 + 0.12 * noise3(x * 1.7, Math.cos(th) * 2, Math.sin(th) * 2, 11));
  // longitudinal balloon profile (1 on the working length, tapering at the cones)
  const balProf = (dx) => { const a = Math.abs(dx); return a <= BAL_BODY ? 1 : a >= BAL_HALF - 0.12 ? 0 : 1 - sstep(BAL_BODY, BAL_HALF - 0.12, a); };

  // ── procedure state as a pure function of the timeline T ∈ [0, 4] ──
  const S = { T: 0, wireTip: 0, xB: 0, inflate: 0, rB: 0, stentX: 0, stentR: 0, stentA: 0, push2: 0, push3: 0, flow: 0, occl: 0 };
  const evalState = (T) => {
    const s = (a, b) => sstep(a, b, T);
    S.T = T;
    S.wireTip = lerp(-XL - 0.8, 4.35, s(0.05, 0.55)) - 11 * s(3.35, 3.95);
    S.xB = lerp(-XL - 8.0, 0, s(0.35, 0.95)) - 11 * s(3.3, 3.95);
    const inf1 = s(1.1, 1.6) * (1 - s(2.0, 2.22));
    const inf2 = s(2.6, 2.95) * (1 - s(3.02, 3.28));
    S.inflate = Math.max(inf1, inf2);
    S.rB = lerp(0.15, inf2 > inf1 ? 0.9 : 0.74, S.inflate);
    S.stentX = lerp(-XL - 7.0, 0, s(2.22, 2.6));
    S.stentR = lerp(0.21, 0.97, s(2.6, 2.95));
    S.stentA = lerp(0.2, 0.175, s(2.6, 2.95));
    S.push2 = 0.74 * s(1.1, 1.6) * (1 - 0.07 * s(2.0, 2.22)); // plaque pushed back by the balloon (with slight recoil)
    S.push3 = 0.97 * s(2.6, 2.95);                             // … and held open by the stent
    S.flow = lerp(0.3, 1, s(3.25, 3.95));
    S.occl = sstep(0.5, 0.85, S.inflate);
  };
  evalState(0);
  // plaque thickness right now
  const plaqueNow = (x, th) => {
    const h0 = plaque0(x, th);
    if (h0 <= 0) return 0;
    const push = Math.max(S.push2 * balProf(x), S.push3 * balProf(x * 0.97));
    return Math.min(h0, Math.max(0.035 * prof(x) + 0.004, wallIn(x, th) - push));
  };
  const lumenAt = (x, th) => wallIn(x, th) - plaqueNow(x, th);

  // ── materials ──
  const phys = (o) => track(new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.55, ...o }));
  const M = {
    wall: phys({ color: '#ffffff', vertexColors: true, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.28, sheen: 0.3, sheenColor: new THREE.Color('#ffc4b8') }),
    plaque: phys({ color: '#ffffff', vertexColors: true, roughness: 0.62, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.35, sheenColor: new THREE.Color('#fff2c4') }),
    blood: phys({ color: '#b3141e', roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.5, sheenColor: new THREE.Color('#ff7a70') }),
    wire: addClipX(phys({ color: '#ffffff', vertexColors: true, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.1 })),
    catheter: addClipX(phys({ color: '#ffffff', vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 })),
    balloon: addClipX(phys({ color: '#86c6f0', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.58, depthWrite: false, envMapIntensity: 0.9 })),
    stent: addClipX(phys({ color: '#dfe5ec', metalness: 0.85, roughness: 0.24, envMapIntensity: 1.3 })),
  };
  for (const k in M) hl.register(k, M[k]);
  const mesh = (geo, id, parent) => {
    track(geo);
    const m = new THREE.Mesh(geo, M[id]);
    m.userData.partId = id;
    parent.add(m);
    return m;
  };
  const C = (hex) => new THREE.Color(hex);

  // ── vessel wall (cut-away window on the front half) ──
  const vesselBox = new THREE.Box3();
  {
    const NU = 100, NV = 72; // x step 0.1, θ step 5°
    const iA = Math.round(((-XW + XL) / (2 * XL)) * NU), iB = Math.round(((XW + XL) / (2 * XL)) * NU), jH = NV / 2;
    const keep = (i, j) => !(i >= iA && i < iB && j < jH); // θ ∈ [0, π) is the front half
    const outerC = C('#c86a60'), innerC = C('#e9a79e');
    const tint = (base, amt, seed) => (P, u, v, out) => {
      const n = noise3(P.x * 1.4, P.y * 1.4, P.z * 1.4, seed) * amt + noise3(P.x * 0.6, P.y * 6, P.z * 6, seed + 1) * amt * 0.7;
      out.copy(base).multiplyScalar(1 + n);
    };
    const outer = paramGrid(NU, NV, (u, v, o) => { const x = lerp(-XL, XL, u), th = v * TAU; setP(o, x, th, wallOut(x, th)); },
      { keep, flip: true, color: tint(outerC, 0.1, 21) });
    const inner = paramGrid(NU, NV, (u, v, o) => { const x = lerp(-XL, XL, u), th = v * TAU; setP(o, x, th, wallIn(x, th)); },
      { keep, color: tint(innerC, 0.06, 23) });
    // wall layers in section: intima | media (smooth muscle) | adventitia
    const fr = [0, 0.1, 0.15, 0.56, 0.62, 1];
    const intima = C('#f2d6cc'), media = C('#c4535a'), advent = C('#e6bda4');
    const bands = [intima, intima, media, media, advent, advent];
    const parts = [outer.geo, inner.geo];
    const zPlus = new THREE.Vector3(0, 0, 1);
    for (const th of [0, Math.PI]) { // long cut edges at the top and bottom of the window
      parts.push(bandStrip(72, (s, r, o) => setP(o, lerp(-XW, XW, s), th, r), (s) => wallIn(lerp(-XW, XW, s), th), (s) => wallOut(lerp(-XW, XW, s), th), fr, bands, zPlus).geo);
    }
    for (const [x, nx] of [[-XW, 1], [XW, -1]]) { // window ends (half rings)
      parts.push(bandStrip(36, (s, r, o) => setP(o, x, s * Math.PI, r), (s) => wallIn(x, s * Math.PI), (s) => wallOut(x, s * Math.PI), fr, bands, new THREE.Vector3(nx, 0, 0)).geo);
    }
    for (const [x, nx] of [[-XL, -1], [XL, 1]]) { // open ends of the segment (full rings)
      parts.push(bandStrip(72, (s, r, o) => setP(o, x, s * TAU, r), (s) => wallIn(x, s * TAU), (s) => wallOut(x, s * TAU), fr, bands, new THREE.Vector3(nx, 0, 0)).geo);
    }
    const g = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    g.computeBoundingBox();
    vesselBox.copy(g.boundingBox);
    mesh(g, 'wall', body);
  }

  // ── plaque (back half inside the window, cut faces at the top/bottom) – reshaped as it is compressed ──
  const plaqueRefills = [];
  {
    const cap = C('#f1d99e'), core = C('#e6ad32'), base = C('#ebc877');
    const surf = paramGrid(64, 36, (u, v, o) => {
      const x = lerp(-PX, PX, u), th = Math.PI + v * Math.PI;
      setP(o, x, th, wallIn(x, th) - plaqueNow(x, th));
    }, { color: (P, u, v, out) => {
      const n = noise3(P.x * 3, P.y * 3, P.z * 3, 31);
      out.copy(cap).lerp(core, 0.22 + 0.2 * n).multiplyScalar(1 + 0.06 * n);
    } });
    const g = new THREE.Group();
    body.add(g);
    mesh(surf.geo, 'plaque', g);
    plaqueRefills.push(surf.refill);
    const fr = [0, 0.14, 0.24, 0.8, 0.9, 1];
    const cols = [cap, cap, core, core, base, base];
    for (const th of [Math.PI, TAU]) {
      const strip = bandStrip(64, (s, r, o) => setP(o, lerp(-PX, PX, s), th, r),
        (s) => lumenAt(lerp(-PX, PX, s), th), (s) => wallIn(lerp(-PX, PX, s), th) + 0.004, fr, cols, new THREE.Vector3(0, 0, 1));
      mesh(strip.geo, 'plaque', g);
      plaqueRefills.push(strip.refill);
    }
  }

  // ── guide wire (with a radiopaque J-tip) ──
  const wireG = new THREE.Group();
  body.add(wireG);
  {
    const shaft = new THREE.CylinderGeometry(0.035, 0.035, 16, 8, 1, true);
    shaft.rotateZ(Math.PI / 2);
    shaft.translate(-8.4, 0, 0);
    const tipCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.42, 0, 0), new THREE.Vector3(0.05, 0, 0), new THREE.Vector3(0.12, 0.16, 0));
    const tip = tubeGeometry(tipCurve, 12, 8, (u) => 0.037 - 0.008 * u, { capEnd: true });
    tip.deleteAttribute('uv');
    const cc = tip.attributes.color;
    for (let i = 0; i < cc.count; i++) cc.setXYZ(i, 0.95, 0.72, 0.35);
    shaft.deleteAttribute('uv');
    shaft.setAttribute('color', new THREE.BufferAttribute(new Float32Array(shaft.attributes.position.count * 3).fill(0.9), 3));
    mesh(mergeGeometries([shaft, tip]), 'wire', wireG);
    shaft.dispose(); tip.dispose();
  }

  // ── balloon catheter (shaft, markers, tip) + balloon ──
  const cathG = new THREE.Group();
  body.add(cathG);
  let balloonMesh, balloonRefill;
  {
    const parts = [];
    const cyl = (r0, r1, x0, x1, hex, radial = 16) => {
      const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, radial, 1, false);
      g.rotateZ(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, 0);
      g.deleteAttribute('uv');
      const c = C(hex);
      const a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      parts.push(g);
    };
    cyl(0.1, 0.1, -20, -BAL_HALF + 0.05, '#3f7fd0');           // shaft
    cyl(0.1, 0.06, -BAL_HALF + 0.05, -BAL_HALF + 0.25, '#3f7fd0');
    cyl(0.058, 0.058, -BAL_HALF + 0.2, BAL_HALF, '#cfe3f5');   // inner lumen through the balloon
    cyl(0.075, 0.075, -BAL_BODY - 0.07, -BAL_BODY + 0.07, '#e0b54a'); // radiopaque markers
    cyl(0.075, 0.075, BAL_BODY - 0.07, BAL_BODY + 0.07, '#e0b54a');
    cyl(0.07, 0.042, BAL_HALF, BAL_HALF + 0.45, '#8fb9e6');     // soft tip
    const g = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    mesh(g, 'catheter', cathG);
    // balloon: working length + cones, pleated when deflated
    const NX = 56, NT = 36;
    const bal = paramGrid(NX, NT, (u, v, o) => {
      const x = lerp(-BAL_HALF, BAL_HALF, u), th = v * TAU;
      const p = balProf(x);
      const pleat = 1 + 0.22 * (1 - S.inflate) * Math.cos(3 * th);
      const r = lerp(0.075, S.rB * pleat, p);
      setP(o, x, th, r);
    }, { flip: true });
    balloonMesh = mesh(bal.geo, 'balloon', cathG);
    balloonMesh.renderOrder = 10;
    balloonRefill = bal.refill;
  }

  // ── stent: sinusoidal rings joined by links, as flat metal struts ──
  const stent = (() => {
    const RINGS = 9, CROWNS = 8, NS = 128, LINK_NS = 3;
    const W = 0.065, TH = 0.035;
    const pitch = (2 * STENT_HALF - 0.44) / (RINGS - 1);
    const paths = []; // each: { closed, pt(s, R, A, out) → sets out & returns θ }
    for (let i = 0; i < RINGS; i++) {
      const xc = -STENT_HALF + 0.22 + i * pitch, ph = i % 2 ? Math.PI : 0;
      paths.push({ closed: true, n: NS, x: (s, A) => xc + A * Math.sin(CROWNS * s * TAU + ph), th: (s) => s * TAU });
    }
    for (let i = 0; i < RINGS - 1; i++) {
      const xc = -STENT_HALF + 0.22 + i * pitch, ph = i % 2 ? Math.PI : 0;
      const ks = i % 2 ? [1, 4, 6] : [0, 3, 5];
      for (const k of ks) {
        const th = (Math.PI / 2 + TAU * k - ph) / CROWNS;
        paths.push({ closed: false, n: LINK_NS, x: (s, A) => lerp(xc + A * 0.92, xc + pitch - A * 0.92, s), th: () => th });
      }
    }
    let nv = 0;
    const idx = [];
    for (const p of paths) {
      p.v0 = nv;
      const samples = p.closed ? p.n : p.n + 1;
      nv += samples * 8;
      const segs = p.closed ? p.n : p.n;
      for (let s = 0; s < segs; s++) {
        const a = p.v0 + s * 8, b = p.v0 + ((s + 1) % samples) * 8;
        for (let f = 0; f < 4; f++) {
          const a0 = a + f * 2, a1 = a0 + 1, b0 = b + f * 2, b1 = b0 + 1;
          idx.push(a0, b0, b1, a0, b1, a1);
        }
      }
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    const P = new THREE.Vector3(), Q = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    const corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const fn = [N, B, N, B];
    let flipChecked = false;
    const refill = (R, A, xOff) => {
      for (const p of paths) {
        const samples = p.closed ? p.n : p.n + 1;
        for (let s = 0; s < samples; s++) {
          const u = s / p.n, e = 1e-3;
          const th = p.th(u);
          setP(P, p.x(u, A) + xOff, th, R);
          setP(Q, p.x(u + e, A) + xOff, p.th(u + e), R);
          T.subVectors(Q, P);
          if (!p.closed) T.set(1, 0, 0);
          N.set(0, Math.cos(th), Math.sin(th));
          B.crossVectors(N, T).normalize();
          corner[0].copy(P).addScaledVector(B, W / 2).addScaledVector(N, TH / 2);
          corner[1].copy(P).addScaledVector(B, -W / 2).addScaledVector(N, TH / 2);
          corner[2].copy(P).addScaledVector(B, -W / 2).addScaledVector(N, -TH / 2);
          corner[3].copy(P).addScaledVector(B, W / 2).addScaledVector(N, -TH / 2);
          const base = (p.v0 + s * 8) * 3;
          for (let f = 0; f < 4; f++) {
            const c0 = corner[f], c1 = corner[(f + 1) % 4];
            const sgn = f === 0 || f === 3 ? 1 : -1; // outer (+N), right (−B), inner (−N), left (+B)
            const nn = fn[f];
            const o = base + f * 6;
            pos[o] = c0.x; pos[o + 1] = c0.y; pos[o + 2] = c0.z;
            pos[o + 3] = c1.x; pos[o + 4] = c1.y; pos[o + 5] = c1.z;
            nor[o] = nor[o + 3] = nn.x * sgn; nor[o + 1] = nor[o + 4] = nn.y * sgn; nor[o + 2] = nor[o + 5] = nn.z * sgn;
          }
        }
      }
      if (!flipChecked) { // orient the winding outward once
        const ia = idx[0] * 3, ib = idx[1] * 3, ic = idx[2] * 3;
        const ux = pos[ib] - pos[ia], uy = pos[ib + 1] - pos[ia + 1], uz = pos[ib + 2] - pos[ia + 2];
        const vx = pos[ic] - pos[ia], vy = pos[ic + 1] - pos[ia + 1], vz = pos[ic + 2] - pos[ia + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * nor[ia] + ny * nor[ia + 1] + nz * nor[ia + 2] < 0) {
          for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
          g.setIndex(idx);
        }
        flipChecked = true;
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.normal.needsUpdate = true;
      g.computeBoundingSphere();
      g.computeBoundingBox();
    };
    refill(0.21, 0.2, 0);
    const m = mesh(g, 'stent', body);
    return { mesh: m, refill };
  })();

  // ── red blood cells ──
  const NCELL = 170, CELL_R = 0.15;
  const cellGeo = track(rbcGeometry(CELL_R));
  const cells = new THREE.InstancedMesh(cellGeo, M.blood, NCELL);
  cells.userData.partId = 'blood';
  cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  body.add(cells);
  const rng = (() => { let s = 1234567; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
  const cx = new Float32Array(NCELL), crho = new Float32Array(NCELL), cphi = new Float32Array(NCELL), cadm = new Float32Array(NCELL);
  const cspin = new Float32Array(NCELL), cang = new Float32Array(NCELL), caxis = [];
  const tmpCol = new THREE.Color();
  for (let i = 0; i < NCELL; i++) {
    cx[i] = lerp(-XL - 0.3, XL + 0.3, rng());
    crho[i] = Math.sqrt(rng()) * 0.9;
    cphi[i] = Math.PI - 0.3 + rng() * (Math.PI + 0.6); // mostly the back half (the front is cut away)
    cadm[i] = rng();
    cspin[i] = (rng() - 0.5) * 2.4;
    cang[i] = rng() * TAU;
    caxis.push(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize());
    cells.setColorAt(i, tmpCol.setRGB(1, 1, 1).multiplyScalar(0.88 + 0.2 * rng()));
  }
  const GATE = -PX + 0.1;
  const qc = new THREE.Quaternion(), pc = new THREE.Vector3(), sc = new THREE.Vector3(), mc = new THREE.Matrix4();
  const updateCells = (dt) => {
    const flowEff = S.flow * (1 - S.occl);
    const v0 = lerp(0.75, 2.3, (S.flow - 0.3) / 0.7);
    const balIn = S.xB > -BAL_HALF && S.inflate > 0.02;
    for (let i = 0; i < NCELL; i++) {
      let x = cx[i];
      const blocked = cadm[i] > flowEff;
      const lum = lumenAt(x, cphi[i]);
      let v = v0 * (0.75 + 0.25 * Math.min(1, lum));
      if (blocked && x > GATE - 1.2) v *= 0.55; // queue up in front of the narrowing
      x += v * dt;
      let scale = 1;
      if (blocked && x > GATE - 0.9) scale = clamp01((GATE - x) / 0.9);
      if ((blocked && x >= GATE) || x > XL + 0.4) { // recycle at the inlet
        x = -XL - 0.4 - rng() * XL; // re-enter spread out in time
        crho[i] = Math.sqrt(rng()) * 0.9;
        cadm[i] = rng();
        scale = 0;
      }
      cx[i] = x;
      cang[i] += cspin[i] * dt;
      // radial placement inside the current lumen (and outside an inflated balloon)
      let rMin = 0.12, rMax = Math.max(0.05, lum - CELL_R * 0.75);
      if (balIn) {
        const bp = balProf(x - S.xB);
        if (bp > 0) rMin = Math.max(rMin, S.rB * bp + CELL_R * 0.7);
      }
      if (rMin > rMax) scale = 0;
      const r = lerp(rMin, rMax, crho[i]);
      setP(pc, x, cphi[i], r);
      qc.setFromAxisAngle(caxis[i], cang[i]);
      const sEnd = sstep(XL + 0.4, XL - 0.2, x) * sstep(-XL - 0.4, -XL + 0.2, x); // fade at the open ends
      const k = scale * Math.max(sEnd, 0.001);
      sc.set(k, k, k);
      mc.compose(pc, qc, sc);
      cells.setMatrixAt(i, mc);
    }
    cells.instanceMatrix.needsUpdate = true;
  };

  // ── apply the state to devices/plaque (only when it changes) ──
  const collapse = (o) => { o.visible = false; o.scale.setScalar(1e-4); o.position.set(0, 0, 0); };
  const expand = (o) => { o.visible = true; o.scale.setScalar(1); };
  let lastT = -1, lastBal = '', lastStent = '', lastPlaque = '';
  const applyState = () => {
    if (S.T === lastT) return;
    lastT = S.T;
    const kBal = S.rB + '|' + S.inflate, kStent = S.stentR + '|' + S.stentA + '|' + S.stentX, kPlq = S.push2 + '|' + S.push3;
    // wire
    if (S.wireTip > CLIP + 0.02) { expand(wireG); wireG.position.x = S.wireTip; M.wire.userData.clipX.value = CLIP - S.wireTip; } else collapse(wireG);
    // catheter + balloon
    if (S.xB + BAL_HALF + 0.45 > CLIP + 0.02) {
      expand(cathG); cathG.position.x = S.xB;
      const c = CLIP - S.xB;
      M.catheter.userData.clipX.value = c; M.balloon.userData.clipX.value = c;
      if (kBal !== lastBal) { lastBal = kBal; balloonRefill(); }
    } else collapse(cathG);
    // stent
    if (S.stentX + STENT_HALF > CLIP + 0.02) {
      stent.mesh.visible = true; stent.mesh.scale.setScalar(1);
      M.stent.userData.clipX.value = CLIP;
      if (kStent !== lastStent) { lastStent = kStent; stent.refill(S.stentR, S.stentA, S.stentX); }
    } else { stent.mesh.visible = false; stent.mesh.scale.setScalar(1e-4); }
    if (kPlq !== lastPlaque) { lastPlaque = kPlq; for (const f of plaqueRefills) f(); }
  };

  // ── normalise: ~1 unit long, centred (bounds = the vessel itself; devices/cells stay inside it) ──
  applyState();
  updateCells(0);
  cells.boundingBox = vesselBox.clone(); // fixed bounds: cells waiting upstream must not inflate them
  cells.boundingSphere = vesselBox.getBoundingSphere(new THREE.Sphere());
  const size = vesselBox.getSize(new THREE.Vector3()), ctr = vesselBox.getCenter(new THREE.Vector3());
  const SC = 1 / Math.max(size.x, size.y, size.z);
  body.scale.setScalar(SC);
  body.position.copy(ctr).multiplyScalar(-SC);

  // ── timeline ──
  let T = 0, target = 0;
  const update = (dt, t) => {
    if (T !== target) {
      const d = target - T;
      const speed = (d > 0 ? 0.6 : 1.6) * Math.max(1, Math.abs(d) * 0.8);
      T = Math.abs(d) <= speed * dt ? target : T + Math.sign(d) * speed * dt;
      evalState(T);
      applyState();
    }
    updateCells(Math.min(dt, 0.1));
    hl.update(dt, t);
  };

  return {
    object: root,
    parts: PARTS.map((p) => ({ ...p })),
    update,
    highlight(partId) { hl.set(partId); },
    setStep(n) {
      const k = Math.max(0, Math.min(meta.steps.length - 1, Math.round(Number(n) || 0)));
      target = k;
    },
    getStep() { return Math.round(target); },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
      cells.dispose();
    },
  };
}

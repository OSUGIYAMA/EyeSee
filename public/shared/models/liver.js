// EyeSee — partial hepatectomy (liver resection) procedure explainer.
// Anterior view faces +z; the patient's left is +x, so the large right lobe sits on the viewer's left.
// Built in centimetres, then normalised to ~1 unit across and centred. setStep(0…4) animates:
// tumour → inflow clamped → cut line marked → section (with tumour) removed → remnant regrows.
import * as THREE from 'three';

export const meta = {
  id: 'liver',
  label: { en: 'Liver resection (partial hepatectomy)', ja: '肝切除術' },
  summary: {
    en: 'How a section of the liver containing a tumour is removed, and how the rest of the liver recovers.',
    ja: '腫瘍を含む肝臓の一部を切り取る手術と、その後の回復の流れ',
  },
  kind: 'procedure',
  steps: [
    { en: 'A tumour is in the right part of the liver.',
      ja: '肝臓の右側に腫瘍があります。' },
    { en: 'The blood vessels feeding that part are temporarily clamped to limit bleeding.',
      ja: '出血を抑えるため、その部分に血液を送る血管を一時的に止めます。' },
    { en: 'The surgeon marks a cut line around the tumour with a safe margin.',
      ja: '腫瘍のまわりに余裕をもって、切る線を決めます。' },
    { en: 'That section of the liver, with the tumour, is removed.',
      ja: '腫瘍を含むその部分の肝臓を切り取ります。' },
    { en: 'The remaining liver keeps working and regrows over the following weeks.',
      ja: '残った肝臓は働き続け、数週間かけて大きさを取り戻します。' },
  ],
};

const PARTS = [
  { id: 'right-lobe', label: { en: 'Right lobe', ja: '右葉（肝臓の右側）' },
    info: { en: 'The larger, right-hand part of the liver. The tumour is here. Most of this lobe is kept, and it keeps working after the operation.',
            ja: '肝臓の右側にある大きな部分です。腫瘍はここにあります。手術ではこの大部分を残し、手術後も働き続けます。' } },
  { id: 'left-lobe', label: { en: 'Left lobe', ja: '左葉（肝臓の左側）' },
    info: { en: 'The smaller, left-hand part of the liver. It is not operated on and keeps working normally.',
            ja: '肝臓の左側にある小さめの部分です。手術はせず、そのまま働き続けます。' } },
  { id: 'tumour', label: { en: 'Tumour', ja: '腫瘍' },
    info: { en: 'An abnormal lump growing in the liver. The aim of the operation is to remove all of it.',
            ja: '肝臓の中にできた、しこり（できもの）です。手術では、これを残さずに取り除くことを目指します。' } },
  { id: 'resected', label: { en: 'Section to be removed', ja: '切り取る部分' },
    info: { en: 'The part of the liver that contains the tumour, together with a rim of healthy tissue around it (a “safe margin”) so that no tumour is left behind.',
            ja: '腫瘍と、そのまわりの健康な肝臓を少し含めた部分です。腫瘍を取り残さないよう、余裕（安全域）をもって切り取ります。' } },
  { id: 'gallbladder', label: { en: 'Gallbladder', ja: '胆のう' },
    info: { en: 'A small pouch under the liver that stores bile, a fluid that helps you digest fat.',
            ja: '肝臓の下にある小さな袋です。脂肪の消化を助ける「胆汁」をためておきます。' } },
  { id: 'portal-vein', label: { en: 'Portal vein', ja: '門脈' },
    info: { en: 'A large vein that brings blood from the stomach and intestines to the liver, carrying nutrients for the liver to process.',
            ja: '胃や腸から、栄養を含んだ血液を肝臓へ運ぶ太い血管です。' } },
  { id: 'hepatic-artery', label: { en: 'Hepatic artery', ja: '肝動脈' },
    info: { en: 'Brings oxygen-rich blood from the heart to the liver.',
            ja: '心臓から送られる、酸素の多い血液を肝臓へ運ぶ動脈です。' } },
  { id: 'hepatic-veins', label: { en: 'Hepatic veins & vena cava', ja: '肝静脈・下大静脈' },
    info: { en: 'Carry blood out of the liver into the body’s largest vein (the vena cava), which takes it back to the heart.',
            ja: '肝臓を通った血液を、体でいちばん太い静脈（下大静脈）へ流し、心臓へ戻します。' } },
  { id: 'bile-duct', label: { en: 'Bile duct', ja: '胆管' },
    info: { en: 'A thin tube that carries bile made in the liver to the gallbladder and on into the intestine.',
            ja: '肝臓でつくられた胆汁を、胆のうや腸へ運ぶ細い管です。' } },
  { id: 'clamp', label: { en: 'Vascular clamp', ja: '血管クランプ' },
    info: { en: 'A soft-jawed clamp that briefly stops blood flowing into the liver while it is being cut, to reduce bleeding. It is taken off straight afterwards.',
            ja: '肝臓を切っている間だけ、肝臓に流れこむ血液を一時的に止める器具です。出血を少なくするためのもので、切り終えたらすぐに外します。' } },
  { id: 'cut-line', label: { en: 'Cut line', ja: '切る線（切離線）' },
    info: { en: 'Where the surgeon will cut, drawn around the tumour with a safe margin of healthy liver.',
            ja: '外科医が切る予定の線です。腫瘍のまわりに、健康な肝臓の余裕をもって引きます。' } },
  { id: 'ligament', label: { en: 'Falciform ligament', ja: '肝鎌状間膜' },
    info: { en: 'A thin fold of tissue that attaches the liver to the front of the belly. It marks the border between the right and left lobes.',
            ja: '肝臓をおなかの前側の壁につなぎとめている薄い膜です。右葉と左葉の境目の目印になります。' } },
];

// ───────────────────────── small math / noise helpers ─────────────────────────
const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

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
// C2-smooth value noise (quintic fade) for shaping glossy surfaces: C1 noise shows its lattice in highlights
function snoise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10), w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = lerp(hash3(xi, yi, zi, s), hash3(xi + 1, yi, zi, s), u);
  const b = lerp(hash3(xi, yi + 1, zi, s), hash3(xi + 1, yi + 1, zi, s), u);
  const c = lerp(hash3(xi, yi, zi + 1, s), hash3(xi + 1, yi, zi + 1, s), u);
  const d = lerp(hash3(xi, yi + 1, zi + 1, s), hash3(xi + 1, yi + 1, zi + 1, s), u);
  return lerp(lerp(a, b, v), lerp(c, d, v), w);
}
const sfbm = (x, y, z, s = 0) => snoise3(x, y, z, s) * 0.68 + snoise3(x * 2.03, y * 2.03, z * 2.03, s + 7) * 0.32;
const sstep5 = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };

// Tube with variable radius along a curve; optional end caps showing a cut lumen.
function tubeGeometry(curve, segs, radial, rFn, opts = {}) {
  const { capStart = false, capEnd = false, lumen = null, wall = null } = opts;
  const frames = curve.computeFrenetFrames(segs, false);
  const len = curve.getLength();
  const ring = radial + 1;
  const nCap = (capStart ? 1 : 0) + (capEnd ? 1 : 0);
  const count = (segs + 1) * ring + nCap * (2 * ring + 1);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
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
      if (end) idx.push(o, o + 1, n, o + 1, n + 1, n, n, n + 1, center);
      else idx.push(o, n, o + 1, o + 1, n, n + 1, n, center, n + 1);
    }
  };
  if (capStart) cap(false);
  if (capEnd) cap(true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
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

// Freshly cut liver tissue: fine lobular grain with a few small, sealed vessel ends.
function makeCutTexture() {
  if (typeof document === 'undefined') return null;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#c0705c'; g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rg = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
  rg.addColorStop(0, 'rgba(120,40,34,0.28)'); rg.addColorStop(1, 'rgba(120,40,34,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 3200; i++) { // lobules
    const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 4.5;
    g.fillStyle = rnd() < 0.5 ? `rgba(255,214,196,${0.05 + rnd() * 0.07})` : `rgba(96,26,24,${0.05 + rnd() * 0.07})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  for (let i = 0; i < 16; i++) { // a few small, sealed vessel ends (portal triads / hepatic vein branches)
    const a = rnd() * TAU, rr = Math.sqrt(rnd()) * S * 0.34;
    const x = S / 2 + Math.cos(a) * rr, y = S / 2 + Math.sin(a) * rr, r = 2 + rnd() * 3.5;
    g.strokeStyle = 'rgba(244,214,200,0.55)'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(x, y, r + 1, 0, TAU); g.stroke();
    g.fillStyle = rnd() < 0.35 ? 'rgba(98,76,132,0.8)' : 'rgba(122,44,44,0.8)';
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Highlight / dim controller shared by all parts of a model. Base colours live in mat.userData.hl
// (the model may tint them), and `fade` scales the opacity of transparent parts that come and go.
function makeHighlighter() {
  const entries = [];
  const byId = new Map();
  let current = null;
  const warm = new THREE.Color(1, 0.93, 0.78);
  return {
    register(id, mat) {
      let e = byId.get(id);
      if (!e) { e = { id, mats: [], glow: 0, dim: 0 }; byId.set(id, e); entries.push(e); }
      if (e.mats.includes(mat)) return;
      mat.userData.hl = {
        color: mat.color.clone(), base: mat.color.clone(), emissive: mat.emissive.clone(), opacity: mat.opacity, fade: 1,
        glow: mat.color.clone().lerp(warm, 0.45),
      };
      e.mats.push(mat);
    },
    set(id) { current = id && byId.has(id) ? id : null; },
    update(dt, t) {
      const k = 1 - Math.exp(-dt * 7);
      const pulse = 0.55 + 0.45 * Math.sin(t * 5.2);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const tg = current === e.id ? 1 : 0;
        const td = current && current !== e.id ? 1 : 0;
        e.glow += (tg - e.glow) * k;
        e.dim += (td - e.dim) * k;
        const gl = e.glow * (0.22 + 0.38 * pulse);
        const dm = 1 - 0.38 * e.dim;
        for (let m = 0; m < e.mats.length; m++) {
          const mat = e.mats[m], h = mat.userData.hl;
          mat.color.copy(h.color).multiplyScalar(dm);
          mat.emissive.copy(h.emissive).lerp(h.glow, gl);
          if (mat.transparent) mat.opacity = h.opacity * h.fade * (1 - 0.3 * e.dim);
        }
      }
    },
  };
}

// Procedural micro-relief (object-space value noise → derivative bump mapping), as in the other models.
const BUMP_GLSL = `
varying vec3 vObjPos;
uniform float uBumpAmp;
uniform vec3 uBumpFreq;
float eyHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float eyNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(eyHash(i), eyHash(i + vec3(1, 0, 0)), f.x), mix(eyHash(i + vec3(0, 1, 0)), eyHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(eyHash(i + vec3(0, 0, 1)), eyHash(i + vec3(1, 0, 1)), f.x), mix(eyHash(i + vec3(0, 1, 1)), eyHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 eyBump(vec3 surfPos, vec3 n, float h, float fd) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  float k = length(sx) / max(1e-7, length(dFdx(vObjPos)));
  vec2 dH = vec2(dFdx(h), dFdy(h)) * k;
  vec3 R1 = cross(sy, n), R2 = cross(n, sx);
  float det = dot(sx, R1) * fd;
  vec3 g = sign(det) * (dH.x * R1 + dH.y * R2);
  return normalize(abs(det) * n - g);
}`;
function addMicroBump(mat, amp, freq) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uBumpAmp = { value: amp };
    sh.uniforms.uBumpFreq = { value: new THREE.Vector3(...freq) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + BUMP_GLSL)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 q = vObjPos * uBumpFreq;
          float h = (eyNoise(q) * 0.65 + eyNoise(q * 2.7 + 5.3) * 0.35) * uBumpAmp;
          normal = eyBump(-vViewPosition, normal, h, faceDirection); }`);
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => prevKey + '|eyesee-bump';
  return mat;
}

// ─────────────────────────────── mesh surgery ───────────────────────────────
// Split an indexed triangle mesh (position/normal/color) by a scalar field: side 1 where sd(p) > 0.
// Every crossing edge gets exactly one new vertex (refined onto sd = 0), shared by both halves, so
// the pieces fit together without cracks and shade seamlessly. Returns both halves plus the ordered
// boundary loop(s) as lists of vertex ids into `pos`/`nor`.
function splitMesh(geo, sd) {
  const P0 = geo.attributes.position.array, N0 = geo.attributes.normal.array, C0 = geo.attributes.color.array;
  const ix = geo.index.array;
  const nv0 = P0.length / 3;
  const pos = Array.from(P0), nor = Array.from(N0), col = Array.from(C0);
  const val = new Float64Array(nv0);
  for (let i = 0; i < nv0; i++) val[i] = sd(P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]);
  const side = (i) => (val[i] > 0 ? 1 : 0);
  const edgeMap = new Map();
  const cutEdge = (a, b) => {
    const key = a < b ? a * nv0 + b : b * nv0 + a;
    const hit = edgeMap.get(key);
    if (hit !== undefined) return hit;
    const lo0 = a < b ? a : b, hi0 = a < b ? b : a; // canonical order → identical result from either side
    const ax = P0[lo0 * 3], ay = P0[lo0 * 3 + 1], az = P0[lo0 * 3 + 2];
    const bx = P0[hi0 * 3], by = P0[hi0 * 3 + 1], bz = P0[hi0 * 3 + 2];
    let t0 = 0, t1 = 1, f0 = val[lo0], f1 = val[hi0];
    let t = f0 / (f0 - f1);
    for (let k = 0; k < 18; k++) { // regula falsi / bisection hybrid
      const f = sd(lerp(ax, bx, t), lerp(ay, by, t), lerp(az, bz, t));
      if (Math.abs(f) < 1e-7) break;
      if ((f > 0) === (f0 > 0)) { t0 = t; f0 = f; } else { t1 = t; f1 = f; }
      t = k % 2 ? (t0 + t1) / 2 : t0 + (t1 - t0) * (f0 / (f0 - f1));
    }
    const id = pos.length / 3;
    pos.push(lerp(ax, bx, t), lerp(ay, by, t), lerp(az, bz, t));
    let nx = lerp(N0[lo0 * 3], N0[hi0 * 3], t), ny = lerp(N0[lo0 * 3 + 1], N0[hi0 * 3 + 1], t), nz = lerp(N0[lo0 * 3 + 2], N0[hi0 * 3 + 2], t);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nor.push(nx / nl, ny / nl, nz / nl);
    col.push(lerp(C0[lo0 * 3], C0[hi0 * 3], t), lerp(C0[lo0 * 3 + 1], C0[hi0 * 3 + 1], t), lerp(C0[lo0 * 3 + 2], C0[hi0 * 3 + 2], t));
    edgeMap.set(key, id);
    return id;
  };
  const tris = [[], []];
  const segs = [];
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2];
    const s = side(a) + side(b) + side(c);
    if (s === 0 || s === 3) { tris[s ? 1 : 0].push(a, b, c); continue; }
    // rotate so the lone vertex comes first (keeps the winding)
    let l = a, m = b, n = c;
    const lone = s === 1 ? 1 : 0;
    if (side(b) === lone) { l = b; m = c; n = a; } else if (side(c) === lone) { l = c; m = a; n = b; }
    const pm = cutEdge(l, m), pn = cutEdge(l, n);
    tris[lone].push(l, pm, pn);
    tris[1 - lone].push(pm, m, n, pm, n, pn);
    segs.push(pm, pn);
  }
  const build = (k) => {
    const list = tris[k];
    const remap = new Map();
    const p = [], nn = [], cc = [], out = [];
    for (const v of list) {
      let r = remap.get(v);
      if (r === undefined) {
        r = p.length / 3; remap.set(v, r);
        p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        nn.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
        cc.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
      }
      out.push(r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    g.setIndex(out);
    return g;
  };
  // chain the cut segments into closed loops
  const adj = new Map();
  const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (let i = 0; i < segs.length; i += 2) { if (segs[i] === segs[i + 1]) continue; link(segs[i], segs[i + 1]); link(segs[i + 1], segs[i]); }
  const seen = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [start];
    seen.add(start);
    let prev = -1, cur = start;
    for (;;) {
      const nb = adj.get(cur).find((x) => x !== prev && !seen.has(x));
      if (nb === undefined) break;
      loop.push(nb); seen.add(nb); prev = cur; cur = nb;
    }
    loops.push(loop);
  }
  loops.sort((a, b) => b.length - a.length);
  return { neg: build(0), pos: build(1), loops, P: pos, N: nor };
}

// ─────────────────────────────── the model ───────────────────────────────
export function create() {
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };
  const hl = makeHighlighter();
  const env = makeEnvTexture();
  if (env) track(env);
  const cutTex = makeCutTexture();
  if (cutTex) track(cutTex);

  const root = new THREE.Group();
  root.name = 'liver';
  const body = new THREE.Group(); // centimetre space, normalised at the end
  root.add(body);
  const anat = new THREE.Group(); // presentation tilt (a touch from below, so the hilum shows)
  body.add(anat);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── liver shape: an anterior outline (x–y) inflated into a solid with separate front
  //    (diaphragmatic) and back (visceral) sheets that meet along the outline ──
  const OUTLINE = [
    [-10.7, 0.6], [-10.3, 4.1], [-8.3, 6.9], [-4.9, 8.3], [-1.3, 8.0], [1.2, 6.9], [3.0, 6.4],
    [5.9, 6.0], [8.7, 4.8], [11.0, 2.9], [12.0, 1.3], [11.2, 0.4], [8.6, -0.3], [5.4, -1.3],
    [2.8, -2.3], [0.9, -2.75], [-1.0, -3.7], [-3.2, -5.2], [-5.6, -7.0], [-7.9, -8.1],
    [-9.7, -7.3], [-10.7, -4.6],
  ];
  const C2x = -1.0, C2y = 0.2; // polar centre of the outline
  const NA = 720;
  const tR = new Float64Array(NA + 1), tCa = new Float64Array(NA + 1), tZe = new Float64Array(NA + 1);
  const tRf = new Float64Array(NA + 1), tRb = new Float64Array(NA + 1), tSf = new Float64Array(NA + 1), tSb = new Float64Array(NA + 1);
  {
    const curve = new THREE.CatmullRomCurve3(OUTLINE.map(([x, y]) => V(x, y, 0)), true, 'centripetal');
    const pts = curve.getSpacedPoints(1400);
    const sx = [], sy = [];
    for (const p of pts) { sx.push(p.x); sy.push(p.y); }
    const nx = new Float64Array(NA), ny = new Float64Array(NA), xo = new Float64Array(NA), yo = new Float64Array(NA);
    for (let k = 0; k < NA; k++) {
      const phi = (k / NA) * TAU, dx = Math.cos(phi), dy = Math.sin(phi);
      let best = Infinity, bnx = dx, bny = dy;
      for (let i = 0; i < sx.length - 1; i++) {
        const ax = sx[i] - C2x, ay = sy[i] - C2y, ex = sx[i + 1] - sx[i], ey = sy[i + 1] - sy[i];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = (ax * ey - ay * ex) / den, s = (ax * dy - ay * dx) / den;
        if (s >= 0 && s <= 1 && t > 0 && t < best) {
          best = t;
          const l = Math.hypot(ex, ey); bnx = ey / l; bny = -ex / l;
          if (bnx * dx + bny * dy < 0) { bnx = -bnx; bny = -bny; }
        }
      }
      tR[k] = best; nx[k] = bnx; ny[k] = bny; tCa[k] = Math.max(0.45, bnx * dx + bny * dy);
      xo[k] = C2x + dx * best; yo[k] = C2y + dy * best;
    }
    const smooth = (t, passes) => { // circular [1 2 1] smoothing of a per-angle table
      for (let it = 0; it < passes; it++) {
        const c = Float64Array.from(t);
        for (let k = 0; k < NA; k++) t[k] = (c[(k + NA - 1) % NA] + 2 * c[k] + c[(k + 1) % NA]) / 4;
      }
    };
    smooth(tR, 24);   // kinks in the polar radius would show up as creases along their rays
    smooth(tCa, 220);
    smooth(ny, 160); // region weights follow the broad shape, not the little notch
    for (let k = 0; k < NA; k++) {
      const wDown = sstep(0.25, 0.75, -ny[k]);          // inferior border: sharp, anterior
      const wLL = sstep(3.5, 9.0, xo[k]);                 // thin left lobe
      tZe[k] = lerp(lerp(-1.2, 1.1, wLL), lerp(3.5, 2.3, wLL), wDown);
      tRf[k] = lerp(lerp(6.5, 3.4, wLL), lerp(2.8, 2.2, wLL), wDown);
      tRb[k] = lerp(lerp(7.5, 3.8, wLL), lerp(5.2, 3.6, wLL), wDown);
      const wTip = sstep(9.5, 12, xo[k]);                // the very tip of the left lobe thins to an edge
      tSf[k] = lerp(0.35 * wTip, 0.8, wDown);
      tSb[k] = lerp(0.05 + 0.4 * wTip, 1.0, wDown);
    }
    for (const t of [tZe, tRf, tRb, tSf, tSb]) smooth(t, 60);
    for (const t of [tR, tCa, tZe, tRf, tRb, tSf, tSb]) t[NA] = t[0];
  }
  const tab = (t, phi) => {
    let f = (phi / TAU) * NA; f -= Math.floor(f / NA) * NA;
    const i = Math.floor(f), w = f - i;
    return t[i] + (t[i + 1] - t[i]) * w;
  };
  const Zf = (x, y) => 6.2 - 0.0175 * (x + 3) * (x + 3) - 0.014 * (y - 1.5) * (y - 1.5);
  const Zb = (x, y) => lerp(-7.0, 0.6, sstep5(-3.5, 12.5, x)) + 0.012 * (y - 2) * (y - 2); // left lobe thins towards its tip
  const prof = (q, sig) => { q = clamp01(q); const o = 1 - q; return lerp(Math.sqrt(1 - o * o), 1 - o * o, sig); };
  // surface point for polar angle phi and "latitude" theta (0 = front pole … π/2 = outline … π = back pole)
  const liverPoint = (phi, theta, out) => {
    const R = tab(tR, phi), s = Math.sin(theta);
    const x = C2x + s * R * Math.cos(phi), y = C2y + s * R * Math.sin(phi);
    const o = 1 - s;
    const d = o * R * tab(tCa, phi) + 14 * o * o * o; // ≈ distance to the outline; saturates towards the poles (no cone there)
    const ze = tab(tZe, phi);
    let z;
    if (theta <= Math.PI / 2) {
      const p = prof(d / tab(tRf, phi), tab(tSf, phi));
      z = ze + (Zf(x, y) - ze) * p + p * 0.24 * sfbm(x * 0.2, y * 0.2, 1.3, 5);
    } else {
      const p = prof(d / tab(tRb, phi), tab(tSb, phi));
      z = ze - (ze - Zb(x, y)) * p + p * 0.3 * sfbm(x * 0.2, y * 0.2, 7.7, 8);
    }
    return out.set(x, y, z);
  };
  const tmpA = V(0, 0, 0);
  // z of the front/back sheet above a point of the outline's interior (null outside)
  const sheetZ = (x, y, back) => {
    const phi = Math.atan2(y - C2y, x - C2x);
    const s = Math.hypot(x - C2x, y - C2y) / tab(tR, phi);
    if (s > 1) return null;
    const th = Math.asin(s);
    return liverPoint(phi, back ? Math.PI - th : th, tmpA).z;
  };
  const frontNormal = (x, y, out) => {
    const e = 0.05;
    const dx = (sheetZ(x + e, y, false) - sheetZ(x - e, y, false)) / (2 * e);
    const dy = (sheetZ(x, y + e, false) - sheetZ(x, y - e, false)) / (2 * e);
    return out.set(-dx, -dy, 1).normalize();
  };

  // polar grid with a single vertex at each pole
  const liverGeo = (() => {
    const NU = 180, NV = 96;
    const nRing = NV - 1;
    const count = 2 + nRing * NU;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const P = V(0, 0, 0), A = V(0, 0, 0), B = V(0, 0, 0), du = V(0, 0, 0), dv = V(0, 0, 0);
    const e = 1e-3;
    const put = (i, phi, th) => {
      liverPoint(phi, th, P);
      pos[i * 3] = P.x; pos[i * 3 + 1] = P.y; pos[i * 3 + 2] = P.z;
      liverPoint(phi + e, th, A); liverPoint(phi - e, th, B); du.subVectors(A, B);
      liverPoint(phi, th + e, A); liverPoint(phi, th - e, B); dv.subVectors(A, B);
      du.cross(dv).normalize().negate();
      nor[i * 3] = du.x; nor[i * 3 + 1] = du.y; nor[i * 3 + 2] = du.z;
    };
    const ringId = (j, i) => 1 + (j - 1) * NU + (i % NU);
    for (let j = 1; j < NV; j++) {
      const th = (j / NV) * Math.PI;
      for (let i = 0; i < NU; i++) put(ringId(j, i), (i / NU) * TAU, th);
    }
    const last = count - 1;
    liverPoint(0, 0, P); pos.set([P.x, P.y, P.z], 0);
    liverPoint(0, Math.PI, P); pos.set([P.x, P.y, P.z], last * 3);
    const avgN = (j, into) => {
      let x = 0, y = 0, z = 0;
      for (let i = 0; i < NU; i++) { const k = ringId(j, i) * 3; x += nor[k]; y += nor[k + 1]; z += nor[k + 2]; }
      const l = Math.hypot(x, y, z); nor[into * 3] = x / l; nor[into * 3 + 1] = y / l; nor[into * 3 + 2] = z / l;
    };
    avgN(1, 0); avgN(NV - 1, last);
    const idx = [];
    for (let i = 0; i < NU; i++) idx.push(0, ringId(1, i), ringId(1, i + 1));
    for (let j = 1; j < NV - 1; j++) for (let i = 0; i < NU; i++) {
      const a = ringId(j, i), b = ringId(j, i + 1), c = ringId(j + 1, i + 1), d = ringId(j + 1, i);
      idx.push(a, c, b, a, d, c);
    }
    for (let i = 0; i < NU; i++) idx.push(last, ringId(NV - 1, i + 1), ringId(NV - 1, i));
    // vertex colour: gentle mottling, a little darker on the underside
    for (let i = 0; i < count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
      const m = 1 + 0.07 * fbm(x * 0.35, y * 0.35, z * 0.35, 21) + 0.035 * noise3(x * 1.3, y * 1.3, z * 1.3, 22);
      const under = 1 - 0.1 * clamp01(-ny) * clamp01(-nz + 0.3);
      const s = m * under;
      col[i * 3] = s; col[i * 3 + 1] = s * 0.985; col[i * 3 + 2] = s * 0.985;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  })();

  // ── tumour and the (dome-shaped) section around it ──
  const TX = -5.7, TY = -0.3;
  const tumS = V(TX, TY, sheetZ(TX, TY, false));
  const Nt = frontNormal(TX, TY, V(0, 0, 0)); // outward surface normal at the tumour
  const TUM_R = 1.55;
  const tumC = tumS.clone().addScaledVector(Nt, -0.85);
  const CUT_H = 0.45, CUT_R = 3.95; // cutting sphere: centre just outside the surface, reaching ~1.3 cm past the tumour
  const cutC = tumS.clone().addScaledVector(Nt, CUT_H);
  const sdCut = (x, y, z) => CUT_R - Math.hypot(x - cutC.x, y - cutC.y, z - cutC.z);
  const split1 = splitMesh(liverGeo, sdCut);
  liverGeo.dispose();
  // falciform plane divides the remnant into anatomical right and left lobes
  const FAL_P = V(1.55, -1.9, 0), FAL_N = V(1, 0.1, 0.08).normalize();
  const split2 = splitMesh(split1.neg, (x, y, z) => (x - FAL_P.x) * FAL_N.x + (y - FAL_P.y) * FAL_N.y + (z - FAL_P.z) * FAL_N.z);
  split1.neg.dispose();

  // ── materials ──
  const tissue = (hex, extra = {}) => track(new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.4, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.22,
    sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff9d86'),
    vertexColors: true, envMap: env, envMapIntensity: 0.55, ...extra,
  }));
  const vessel = (hex, extra = {}) => track(new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.34, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2,
    vertexColors: true, envMap: env, envMapIntensity: 0.6, ...extra,
  }));
  const LIVER = '#94412f';
  const cutSurf = (extra = {}) => track(new THREE.MeshPhysicalMaterial({
    color: cutTex ? '#ffffff' : '#c0705c', map: cutTex, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.45,
    sheen: 0.4, sheenColor: new THREE.Color('#ffc2b0'), envMap: env, envMapIntensity: 0.35, ...extra,
  }));
  const M = {
    right: tissue(LIVER), left: tissue(LIVER),
    piece: tissue(LIVER, { transparent: true }),
    cutR: cutSurf(), cutP: cutSurf({ transparent: true }),
    tumour: tissue('#efe3c9', { roughness: 0.55, clearcoat: 0.45, sheen: 0.4, sheenColor: new THREE.Color('#fff6de'), transparent: true }),
    gall: vessel('#5f9a45', { roughness: 0.3, clearcoat: 0.9, sheen: 0.3, sheenColor: new THREE.Color('#c8f0a0') }),
    portal: vessel('#7a62b6'), artery: vessel('#d9493c'), hv: vessel('#4c66b0'), bile: vessel('#7db64c'),
    ligament: tissue('#dcab9a', { roughness: 0.5, clearcoat: 0.4, sheenColor: new THREE.Color('#fff0ea') }),
    clampMetal: track(new THREE.MeshPhysicalMaterial({ color: '#d8dee6', metalness: 0.85, roughness: 0.26, envMap: env, envMapIntensity: 1.25, transparent: true })),
    clampPad: track(new THREE.MeshPhysicalMaterial({ color: '#3f86d8', roughness: 0.45, clearcoat: 0.6, envMap: env, envMapIntensity: 0.6, transparent: true })),
    line: track(new THREE.MeshStandardMaterial({ color: '#fbfaf2', emissive: '#5c5646', roughness: 0.4, envMap: env, envMapIntensity: 0.4 })),
  };
  addMicroBump(M.right, 0.03, [1.4, 1.4, 1.4]);
  addMicroBump(M.left, 0.03, [1.4, 1.4, 1.4]);
  addMicroBump(M.piece, 0.03, [1.4, 1.4, 1.4]);
  addMicroBump(M.cutR, 0.06, [3.5, 3.5, 3.5]);
  addMicroBump(M.cutP, 0.06, [3.5, 3.5, 3.5]);
  addMicroBump(M.tumour, 0.07, [2.6, 2.6, 2.6]);
  for (const k of ['portal', 'artery', 'hv', 'bile', 'gall']) addMicroBump(M[k], 0.012, [2, 2, 2]);
  const partOf = {
    right: 'right-lobe', left: 'left-lobe', piece: 'resected', cutR: 'right-lobe', cutP: 'resected', tumour: 'tumour',
    gall: 'gallbladder', portal: 'portal-vein', artery: 'hepatic-artery', hv: 'hepatic-veins', bile: 'bile-duct',
    ligament: 'ligament', clampMetal: 'clamp', clampPad: 'clamp', line: 'cut-line',
  };
  for (const k in M) hl.register(partOf[k], M[k]);
  const addMesh = (geo, key, parent) => {
    track(geo);
    const m = new THREE.Mesh(geo, M[key]);
    m.userData.partId = partOf[key];
    parent.add(m);
    return m;
  };

  // ── groups: the remnant regrows about the hilum; the section is lifted out ──
  const HILUM = V(-0.5, -2.0, sheetZ(-0.5, -2.0, true));
  const remnantG = new THREE.Group(); anat.add(remnantG);
  const remnantIn = new THREE.Group(); remnantG.add(remnantIn);
  remnantG.position.copy(HILUM); remnantIn.position.copy(HILUM).negate();
  const pieceG = new THREE.Group(); anat.add(pieceG);
  const pieceIn = new THREE.Group(); pieceG.add(pieceIn);

  addMesh(split2.neg, 'right', remnantIn);
  addMesh(split2.pos, 'left', remnantIn);
  addMesh(split1.pos, 'piece', pieceIn);

  // ── the cut surface: a smooth bowl in the remnant / dome on the removed section ──
  const loopIds = split1.loops[0];
  const nL = loopIds.length;
  const loopP = loopIds.map((id) => V(split1.P[id * 3], split1.P[id * 3 + 1], split1.P[id * 3 + 2]));
  const loopN = loopIds.map((id) => V(split1.N[id * 3], split1.N[id * 3 + 1], split1.N[id * 3 + 2]));
  const loopC = loopP.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / nL);
  const K = 13; // rings from the rim (k = 0) to the pole (k = K)
  const nCap = nL * K + 1;
  const capBase = new Float32Array(nCap * 3), capLid = new Float32Array(nCap * 3);
  const D = Nt.clone().negate();
  const E1 = V(0, 1, 0).cross(Nt).normalize(), E2 = Nt.clone().cross(E1).normalize();
  {
    const a = V(0, 0, 0), q = V(0, 0, 0);
    let lidH = 0; // how far the original surface bulged above the rim's mean plane
    for (let s = 0; s <= 8; s++) {
      // sample the original surface along the section's middle to estimate its dome height
      const p = tumS.clone().addScaledVector(E1, (s / 8 - 0.5) * CUT_R * 0.6);
      const z = sheetZ(p.x, p.y, false);
      if (z !== null) lidH = Math.max(lidH, V(p.x, p.y, z).sub(loopC).dot(Nt));
    }
    for (let i = 0; i < nL; i++) {
      a.copy(loopP[i]).sub(cutC).normalize();
      const om = Math.acos(Math.max(-1, Math.min(1, a.dot(D))));
      for (let k = 0; k < K; k++) {
        const f = k / K, o = (i * K + k) * 3;
        if (k === 0) q.copy(loopP[i]);
        else {
          const w1 = Math.sin((1 - f) * om) / Math.sin(om), w2 = Math.sin(f * om) / Math.sin(om);
          q.copy(a).multiplyScalar(w1).addScaledVector(D, w2).normalize().multiplyScalar(CUT_R).add(cutC);
        }
        capBase[o] = q.x; capBase[o + 1] = q.y; capBase[o + 2] = q.z;
        const r = 1 - f;
        q.copy(loopP[i]).sub(loopC).multiplyScalar(r).add(loopC).addScaledVector(Nt, lidH * 0.8 * (1 - r * r));
        capLid[o] = q.x; capLid[o + 1] = q.y; capLid[o + 2] = q.z;
      }
    }
    const o = (nCap - 1) * 3;
    q.copy(D).multiplyScalar(CUT_R).add(cutC); capBase.set([q.x, q.y, q.z], o);
    q.copy(loopC).addScaledVector(Nt, lidH * 0.8); capLid.set([q.x, q.y, q.z], o);
  }
  const capIdx = (flip) => {
    const idx = [];
    const id = (i, k) => (k === K ? nCap - 1 : ((i + nL) % nL) * K + k);
    for (let i = 0; i < nL; i++) for (let k = 0; k < K; k++) {
      const a = id(i, k), b = id(i + 1, k), c = id(i + 1, k + 1), d = id(i, k + 1);
      if (k === K - 1) { if (flip) idx.push(a, d, b); else idx.push(a, b, d); }
      else if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
    return idx;
  };
  // normals of the ring grid by central differences (allocation-free; `sign` picks the side)
  const capNormals = (pos, out, sign) => {
    const id = (i, k) => (k >= K ? nCap - 1 : ((i + nL) % nL) * K + k);
    for (let i = 0; i < nL; i++) for (let k = 0; k < K; k++) {
      const a = id(i + 1, k) * 3, b = id(i - 1, k) * 3, c = id(i, k + 1) * 3, d = id(i, Math.max(0, k - 1)) * 3;
      const ux = pos[a] - pos[b], uy = pos[a + 1] - pos[b + 1], uz = pos[a + 2] - pos[b + 2];
      const vx = pos[c] - pos[d], vy = pos[c + 1] - pos[d + 1], vz = pos[c + 2] - pos[d + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      const s = (nx * Nt.x + ny * Nt.y + nz * Nt.z) * sign < 0 ? -1 : 1;
      const o = id(i, k) * 3;
      out[o] = (nx / l) * s; out[o + 1] = (ny / l) * s; out[o + 2] = (nz / l) * s;
    }
    const o = (nCap - 1) * 3;
    out[o] = Nt.x * sign; out[o + 1] = Nt.y * sign; out[o + 2] = Nt.z * sign;
  };
  const capUV = new Float32Array(nCap * 2);
  for (let i = 0; i < nCap; i++) {
    const x = capBase[i * 3] - cutC.x, y = capBase[i * 3 + 1] - cutC.y, z = capBase[i * 3 + 2] - cutC.z;
    capUV[i * 2] = 0.5 + (x * E1.x + y * E1.y + z * E1.z) / (2.2 * CUT_R);
    capUV[i * 2 + 1] = 0.5 + (x * E2.x + y * E2.y + z * E2.z) / (2.2 * CUT_R);
  }
  const makeCap = (sign) => {
    const g = new THREE.BufferGeometry();
    const p = Float32Array.from(capBase), n = new Float32Array(nCap * 3);
    capNormals(p, n, sign);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(capUV), 2));
    // winding that agrees with the normals
    let idx = capIdx(false);
    const t0 = idx[0] * 3, t1 = idx[1] * 3, t2 = idx[2] * 3;
    const ux = p[t1] - p[t0], uy = p[t1 + 1] - p[t0 + 1], uz = p[t1 + 2] - p[t0 + 2];
    const vx = p[t2] - p[t0], vy = p[t2 + 1] - p[t0 + 1], vz = p[t2 + 2] - p[t0 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[t0] + cy * n[t0 + 1] + cz * n[t0 + 2] < 0) idx = capIdx(true);
    g.setIndex(idx);
    return g;
  };
  const bowlGeo = makeCap(1);   // remnant: concave, faces out of the liver
  const domeGeo = makeCap(-1);  // removed section: convex, faces into where the liver was
  const bowlMesh = addMesh(bowlGeo, 'cutR', remnantIn);
  const domeMesh = addMesh(domeGeo, 'cutP', pieceIn);
  const lidNor = new Float32Array(nCap * 3), baseNor = Float32Array.from(bowlGeo.attributes.normal.array);
  capNormals(capLid, lidNor, 1);

  // tumour: a pale, softly lobulated nodule
  {
    let g = new THREE.IcosahedronGeometry(1, 11);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVerts(g);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = TUM_R * (1 + 0.09 * noise3(x * 1.6 + 3, y * 1.6, z * 1.6, 51) + 0.04 * noise3(x * 3.4, y * 3.4, z * 3.4 + 2, 52));
      p.setXYZ(i, tumC.x + x * r, tumC.y + y * r, tumC.z + z * r);
      const m = 0.95 + 0.07 * noise3(x * 2.5, y * 2.5, z * 2.5, 53);
      col[i * 3] = m; col[i * 3 + 1] = m * 0.98; col[i * 3 + 2] = m * 0.95;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    addMesh(g, 'tumour', pieceIn);
  }
  const pieceC = loopC.clone().addScaledVector(D, 1.2);
  pieceG.position.copy(pieceC); pieceIn.position.copy(pieceC).negate();

  // ── cut line: dashes along the rim of the section ──
  const NDASH = 34;
  const dashes = (() => {
    const cum = [0];
    for (let i = 1; i <= nL; i++) cum.push(cum[i - 1] + loopP[i % nL].distanceTo(loopP[i - 1]));
    const total = cum[nL];
    const g = track(new THREE.CapsuleGeometry(0.12, 0.34, 2, 8));
    const im = new THREE.InstancedMesh(g, M.line, NDASH);
    im.userData.partId = 'cut-line';
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const P = [], Q = [];
    const tan = V(0, 0, 0), nrm = V(0, 0, 0), side = V(0, 0, 0), m = new THREE.Matrix4();
    let j = 0;
    for (let k = 0; k < NDASH; k++) {
      const target = ((k + 0.5) / NDASH) * total;
      while (cum[j + 1] < target) j++;
      const w = (target - cum[j]) / (cum[j + 1] - cum[j]);
      const a = loopP[j], b = loopP[(j + 1) % nL];
      const p = a.clone().lerp(b, w);
      nrm.copy(loopN[j]).lerp(loopN[(j + 1) % nL], w).normalize();
      tan.subVectors(b, a).addScaledVector(nrm, -tan.dot(nrm)).normalize();
      side.crossVectors(tan, nrm);
      p.addScaledVector(nrm, 0.08);
      m.makeBasis(side, tan, nrm);
      P.push(p); Q.push(new THREE.Quaternion().setFromRotationMatrix(m));
    }
    const box = new THREE.Box3().setFromPoints(loopP).expandByScalar(0.5);
    im.boundingBox = box;
    im.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    anat.add(im);
    return { im, P, Q };
  })();

  // ── falciform ligament (a thin fold standing off the surface) with the round ligament ──
  {
    const loop = split2.loops[0].map((id) => ({ p: V(split2.P[id * 3], split2.P[id * 3 + 1], split2.P[id * 3 + 2]), n: V(split2.N[id * 3], split2.N[id * 3 + 1], split2.N[id * 3 + 2]) }));
    // walk from the umbilical notch (lowest front point) up over the dome until the back of it
    let s = -1;
    loop.forEach((o, i) => { if (o.p.z > 0 && (s < 0 || o.p.y < loop[s].p.y)) s = i; });
    const dir = loop[(s + 3) % loop.length].p.z > loop[(s - 3 + loop.length) % loop.length].p.z ? 1 : -1; // up the front
    const path = [];
    for (let k = 0, i = s; k < loop.length; k++, i = (i + dir + loop.length) % loop.length) {
      path.push(loop[i]);
      if (loop[i].p.z < -2.4 && loop[i].p.y > 3) break;
    }
    const n = path.length;
    const edge = [], quads = [];
    const H = (f) => 0.38 * Math.sin(Math.PI * Math.min(1, f * 1.1)) ** 0.6 + 0.08;
    const pos = [], nor = [], idx = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), { p, n: nn } = path[i];
      const h = H(f);
      const top = p.clone().addScaledVector(nn, h);
      edge.push(top);
      pos.push(p.x - nn.x * 0.1, p.y - nn.y * 0.1, p.z - nn.z * 0.1, top.x, top.y, top.z);
      nor.push(FAL_N.x, FAL_N.y, FAL_N.z, FAL_N.x, FAL_N.y, FAL_N.z);
      if (i) { const a = (i - 1) * 2; quads.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    // double-sided thin sheet: second copy with flipped normals
    const off = pos.length / 3;
    for (let i = 0; i < off; i++) { pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); nor.push(-FAL_N.x, -FAL_N.y, -FAL_N.z); }
    for (let t = 0; t < quads.length; t += 3) { idx.push(quads[t], quads[t + 1], quads[t + 2]); idx.push(quads[t] + off, quads[t + 2] + off, quads[t + 1] + off); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3));
    g.setIndex(idx);
    // sheet faces point along ±FAL_N; make each triangle's winding match its normal
    const pa = g.attributes.position.array, ia = g.index.array, na = g.attributes.normal.array;
    for (let t = 0; t < ia.length; t += 3) {
      const a = ia[t] * 3, b = ia[t + 1] * 3, c = ia[t + 2] * 3;
      const ux = pa[b] - pa[a], uy = pa[b + 1] - pa[a + 1], uz = pa[b + 2] - pa[a + 2];
      const vx = pa[c] - pa[a], vy = pa[c + 1] - pa[a + 1], vz = pa[c + 2] - pa[a + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * na[a] + cy * na[a + 1] + cz * na[a + 2] < 0) { const tmp = ia[t + 1]; ia[t + 1] = ia[t + 2]; ia[t + 2] = tmp; }
    }
    addMesh(g, 'ligament', remnantIn);
    // free edge of the fold, continuing below the notch as the round ligament
    const lo = edge[0];
    const teres = [lo.clone().add(V(0.1, -0.9, 0.35)), ...edge];
    const curve = new THREE.CatmullRomCurve3(teres, false, 'centripetal');
    addMesh(tubeGeometry(curve, 110, 7, (u) => lerp(0.17, 0.06, sstep(0, 0.25, u)), { capStart: true, lumen: new THREE.Color('#d9a898'), wall: new THREE.Color('#f5dcd2') }), 'ligament', remnantIn);
  }

  // ── vessels, bile ducts and gallbladder at the hilum ──
  const cr = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(...p))), false, 'centripetal');
  const lumenRed = new THREE.Color('#5a1418'), wallA = new THREE.Color('#f2cfc6');
  const lumenBlue = new THREE.Color('#231f55'), wallV = new THREE.Color('#d6d2ea');
  const lumenGreen = new THREE.Color('#2f4a1c'), wallB = new THREE.Color('#e2efcf');
  const hz = HILUM.z;
  const inside = (x, y, depth) => V(x, y, sheetZ(x, y, true) + depth); // a point just inside the visceral surface
  // portal vein: up behind the duct and artery, dividing into right and left branches
  const pvMain = cr([[0.1, -10.0, hz - 1.7], [-0.1, -8.2, hz - 1.3], [-0.3, -5.9, hz - 1.0], [-0.45, -3.6, hz - 0.8], [-0.5, -2.2, hz - 0.4]]);
  addMesh(tubeGeometry(pvMain, 80, 22, (u) => 0.78 + 0.06 * Math.sin(u * 9), { capStart: true, lumen: lumenBlue, wall: wallV }), 'portal', remnantIn);
  addMesh(tubeGeometry(cr([[-0.5, -2.5, hz - 0.6], [-1.8, -2.2, hz - 0.5], [-3.2, -1.5, hz - 0.1], inside(-4.2, -0.9, 0.9)]), 40, 16, (u) => lerp(0.62, 0.5, u)), 'portal', remnantIn);
  addMesh(tubeGeometry(cr([[-0.5, -2.5, hz - 0.6], [0.9, -2.3, hz - 0.5], [2.3, -1.6, hz - 0.2], inside(3.3, -0.9, 0.8)]), 40, 16, (u) => lerp(0.58, 0.46, u)), 'portal', remnantIn);
  // hepatic artery: from the lower left, rising alongside and in front of the portal vein
  const haMain = cr([[5.6, -9.6, hz - 2.8], [3.4, -9.1, hz - 1.6], [1.4, -7.8, hz - 0.9], [1.0, -5.9, hz - 0.7], [0.6, -3.4, hz - 0.3], [0.5, -3.2, hz - 0.1]]);
  addMesh(tubeGeometry(haMain, 70, 12, () => 0.3, { capStart: true, lumen: lumenRed, wall: wallA }), 'artery', remnantIn);
  addMesh(tubeGeometry(cr([[0.5, -3.3, hz - 0.1], [-0.8, -2.8, hz + 0.25], [-2.5, -2.1, hz + 0.3], inside(-3.6, -1.2, 0.6)]), 40, 10, (u) => lerp(0.26, 0.2, u)), 'artery', remnantIn);
  addMesh(tubeGeometry(cr([[0.5, -3.3, hz - 0.1], [1.6, -2.7, hz + 0.1], [2.8, -1.9, hz + 0.2], inside(3.6, -1.2, 0.6)]), 40, 10, (u) => lerp(0.24, 0.18, u)), 'artery', remnantIn);
  // bile ducts: right + left hepatic ducts → common duct (in front, patient's right), joined by the cystic duct
  const cbd = cr([[-1.75, -10.0, hz - 0.6], [-1.65, -8.2, hz - 0.6], [-1.55, -5.9, hz - 0.55], [-1.3, -3.6, hz + 0.3], [-1.1, -2.4, hz + 0.7]]);
  addMesh(tubeGeometry(cbd, 70, 12, () => 0.36, { capStart: true, lumen: lumenGreen, wall: wallB }), 'bile', remnantIn);
  addMesh(tubeGeometry(cr([[-1.1, -2.5, hz + 0.7], [-2.2, -2.0, hz + 0.9], inside(-3.1, -1.5, 0.5)]), 24, 10, (u) => lerp(0.3, 0.24, u)), 'bile', remnantIn);
  addMesh(tubeGeometry(cr([[-1.1, -2.5, hz + 0.7], [0.1, -2.0, hz + 0.9], inside(1.2, -1.6, 0.5)]), 24, 10, (u) => lerp(0.3, 0.24, u)), 'bile', remnantIn);
  // gallbladder: a pear-shaped sac under the right lobe, its fundus peeping out below the edge
  const gbTop = sheetZ(-2.6, -4.2, true);
  const gbCurve = cr([[-3.25, -6.25, 2.05], [-2.95, -5.0, gbTop - 1.05], [-2.55, -3.6, sheetZ(-2.5, -3.6, true) - 1.0], [-2.1, -2.55, sheetZ(-2.1, -2.55, true) - 0.72], [-1.75, -2.35, hz - 0.2]]);
  const gbR = (u) => (u < 0.16 ? 1.45 * Math.sqrt(Math.max(0, 1 - (1 - u / 0.16) ** 2)) : lerp(1.45, 0.42, sstep(0.3, 1, u)) * (1 + 0.05 * Math.sin(u * 20)));
  addMesh(tubeGeometry(gbCurve, 64, 26, gbR), 'gall', remnantIn);
  addMesh(tubeGeometry(cr([[-1.75, -2.35, hz - 0.2], [-1.6, -3.1, hz - 0.1], [-1.55, -4.2, hz + 0.05], [-1.45, -4.9, hz - 0.2]]), 30, 10, () => 0.24), 'bile', remnantIn);
  // hepatic veins draining into the vena cava along the back of the liver
  // vena cava: straight up behind the liver, then bedded in a groove on its back as it rises to the heart
  const ivcZ = (y) => sheetZ(-1.2, Math.max(1, y), true) + 0.85;
  const ivc = cr([[-1.3, -9.5, ivcZ(1) + 0.1], [-1.25, -4.0, ivcZ(1) + 0.05], [-1.2, 1.0, ivcZ(1)], [-1.2, 4.0, ivcZ(4)], [-1.15, 6.4, ivcZ(6.4)], [-1.1, 7.8, ivcZ(7.3) + 0.5], [-1.05, 8.7, ivcZ(7.3) + 0.9]]);
  addMesh(tubeGeometry(ivc, 64, 20, () => 1.15, { capStart: true, capEnd: true, lumen: lumenBlue, wall: wallV }), 'hv', remnantIn);
  for (const [x, y, zIn] of [[-6.4, 5.4, 2.6], [-3.4, 6.2, 2.8], [2.6, 5.0, 1.6]]) {
    const end = V(-1.15, 6.7, ivcZ(6.7));
    const start = V(x, y, sheetZ(x, y, true) + zIn);
    const mid = start.clone().lerp(end, 0.6).add(V(0, 0.3, -0.1));
    addMesh(tubeGeometry(cr([start, mid, end]), 30, 12, (u) => lerp(0.55, 0.7, u)), 'hv', remnantIn);
  }

  // ── vascular clamp across the vessels below the liver (Pringle manoeuvre) ──
  const CLAMP_P = V(-0.35, -5.9, hz - 1.0);
  const clampG = new THREE.Group(); anat.add(clampG);
  const jawA = new THREE.Group(), jawB = new THREE.Group();
  const HINGE_X = 2.6; // jaws pivot about a vertical axis at +x
  {
    const JL = 5.0;
    const addTo = (grp, geo, key) => { const m = addMesh(geo, key, grp); return m; };
    for (const [jaw, s] of [[jawA, 1], [jawB, -1]]) {
      const bar = new THREE.CapsuleGeometry(0.24, JL, 4, 12); bar.rotateZ(Math.PI / 2); bar.scale(1, 1.5, 1);
      bar.translate(HINGE_X - JL / 2 - 0.35, 0, s * 0.95);
      addTo(jaw, bar, 'clampMetal');
      const pad = new THREE.CapsuleGeometry(0.15, JL - 0.8, 3, 10); pad.rotateZ(Math.PI / 2); pad.scale(1, 1.3, 0.8);
      pad.translate(HINGE_X - JL / 2 - 0.2, 0, s * 0.74);
      addTo(jaw, pad, 'clampPad');
      const grip = new THREE.CapsuleGeometry(0.28, 1.9, 4, 12); grip.rotateZ(Math.PI / 2); grip.scale(1, 1.7, 1);
      grip.rotateY(-s * 0.32); grip.translate(HINGE_X + 1.5, 0, s * 1.3);
      addTo(jaw, grip, 'clampMetal');
      jaw.position.set(HINGE_X, 0, 0);
      jaw.children.forEach((c) => c.position.set(-HINGE_X, 0, 0));
      clampG.add(jaw);
    }
    const coil = new THREE.TorusGeometry(0.95, 0.13, 10, 40); coil.rotateX(Math.PI / 2); coil.translate(HINGE_X, 0, 0);
    addTo(clampG, coil, 'clampMetal');
    const pin = new THREE.CylinderGeometry(0.16, 0.16, 1.5, 12); pin.translate(HINGE_X, 0, 0);
    addTo(clampG, pin, 'clampMetal');
  }
  clampG.position.copy(CLAMP_P);

  // ── presentation tilt, then normalise: ~1 unit across, centred ──
  anat.rotation.set(-0.3, 0.12, 0);
  const collapse = (o) => { o.visible = false; o.scale.setScalar(1e-4); };
  collapse(clampG);
  const box = new THREE.Box3().setFromObject(body);
  const size = box.getSize(V(0, 0, 0)), ctr = box.getCenter(V(0, 0, 0));
  const SC = 1 / Math.max(size.x, size.y, size.z);
  body.scale.setScalar(SC);
  body.position.copy(ctr).multiplyScalar(-SC);

  // ── procedure state as a pure function of the timeline T ∈ [0, 4] ──
  const S = { clampIn: 0, clampClose: 0, dusk: 0, draw: 0, lineFade: 1, lift: 0, away: 0, clampOut: 0, grow: 0 };
  const evalState = (T) => {
    const s = (a, b) => sstep(a, b, T);
    S.clampIn = s(0.05, 0.6);
    S.clampClose = s(0.55, 0.85) * (1 - s(3.05, 3.3));
    S.dusk = s(0.65, 1.0) * (1 - s(3.1, 3.6));
    S.draw = s(1.1, 1.9);
    S.lineFade = 1 - s(2.02, 2.22);
    S.lift = s(2.08, 2.92);
    S.away = s(3.0, 3.45);
    S.clampOut = s(3.25, 3.7);
    S.grow = s(3.4, 4.0);
  };
  evalState(0);

  const liverMats = [M.right, M.left, M.piece];
  const duskCol = new THREE.Color('#6e4550');
  const healCol = new THREE.Color(cutTex ? '#c98474' : LIVER);
  const liftDir = Nt.clone().multiplyScalar(2.6).add(V(-5.0, -5.4, -0.4));
  const awayDir = V(-3.0, -3.5, 1.0);
  const rotAxis = V(0.25, -1, 0.1).normalize();
  const qTmp = new THREE.Quaternion();
  const mTmp = new THREE.Matrix4(), vTmp = V(0, 0, 0), sTmp = V(1, 1, 1);
  const clampFrom = V(5.5, -3.5, 7.0);
  const bowlPos = bowlGeo.attributes.position.array, bowlNor = bowlGeo.attributes.normal.array;
  let lastT = -1;
  const applyState = (T) => {
    if (T === lastT) return;
    lastT = T;
    // clamp: glides in, closes; later opens and leaves
    const inAmt = S.clampIn * (1 - S.clampOut);
    if (inAmt > 0.001) {
      clampG.visible = true; clampG.scale.setScalar(1);
      clampG.position.copy(CLAMP_P).addScaledVector(clampFrom, (1 - S.clampIn) ** 2 + S.clampOut * S.clampOut);
      const open = 0.34 * (1 - S.clampClose);
      jawA.rotation.y = -open; jawB.rotation.y = open;
      M.clampMetal.userData.hl.fade = M.clampPad.userData.hl.fade = sstep(0, 0.5, inAmt);
    } else collapse(clampG);
    // tissue tone while inflow is clamped
    for (const m of liverMats) m.userData.hl.color.copy(m.userData.hl.base).lerp(duskCol, 0.22 * S.dusk);
    // cut line drawn progressively, then gone once the section lifts away
    const prog = S.draw * (NDASH + 2);
    for (let k = 0; k < NDASH; k++) {
      const sc = clamp01(prog - k) * S.lineFade;
      sTmp.setScalar(Math.max(sc, 1e-4));
      mTmp.compose(dashes.P[k], dashes.Q[k], sTmp);
      dashes.im.setMatrixAt(k, mTmp);
    }
    dashes.im.instanceMatrix.needsUpdate = true;
    dashes.im.visible = S.draw > 0 && S.lineFade > 0;
    // the section: lifted out, turned to show its cut face, then taken away
    bowlMesh.visible = domeMesh.visible = S.lift > 0.002; // coincident with the surface until then
    if (S.away < 0.999) {
      pieceG.visible = true;
      pieceG.scale.setScalar(1);
      pieceG.position.copy(pieceC).addScaledVector(liftDir, S.lift).addScaledVector(awayDir, S.away);
      qTmp.setFromAxisAngle(rotAxis, 1.05 * S.lift + 0.3 * S.away);
      pieceG.quaternion.copy(qTmp);
      const f = 1 - S.away;
      M.piece.userData.hl.fade = M.cutP.userData.hl.fade = M.tumour.userData.hl.fade = f;
      M.piece.depthWrite = M.cutP.depthWrite = M.tumour.depthWrite = f > 0.98;
    } else collapse(pieceG);
    // regrowth: the remnant enlarges and the cut surface fills in
    remnantG.scale.setScalar(1 + 0.1 * S.grow);
    const fill = 0.78 * S.grow;
    for (let i = 0; i < bowlPos.length; i++) {
      bowlPos[i] = lerp(capBase[i], capLid[i], fill);
      bowlNor[i] = lerp(baseNor[i], lidNor[i], fill);
    }
    M.cutR.userData.hl.color.copy(M.cutR.userData.hl.base).lerp(healCol, 0.55 * S.grow);
    bowlGeo.attributes.position.needsUpdate = true;
    bowlGeo.attributes.normal.needsUpdate = true;
  };
  applyState(0);

  // ── timeline ──
  let T = 0, target = 0;
  const update = (dt, t) => {
    if (T !== target) {
      const d = target - T;
      const speed = (d > 0 ? 0.5 : 1.6) * Math.max(1, Math.abs(d) * 0.8); // ≈2 s per step forward
      T = Math.abs(d) <= speed * dt ? target : T + Math.sign(d) * speed * dt;
      evalState(T);
      applyState(T);
    }
    hl.update(dt, t);
  };

  return {
    object: root,
    parts: PARTS.map((p) => ({ ...p })),
    update,
    highlight(partId) { hl.set(partId); },
    // setStep(n) animates to step n; setStep(n, { instant: true }) jumps (e.g. a late-joining viewer).
    setStep(n, opts) {
      target = Math.max(0, Math.min(meta.steps.length - 1, Math.round(Number(n) || 0)));
      if (opts && opts.instant) { T = target; evalState(T); applyState(T); }
    },
    getStep() { return Math.round(target); },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
      dashes.im.dispose();
    },
  };
}

// Weld duplicate vertices of a non-indexed geometry (position only) so normals come out smooth.
function mergeVerts(g) {
  const p = g.attributes.position;
  const map = new Map(), pos = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let id = map.get(key);
    if (id === undefined) { id = pos.length / 3; map.set(key, id); pos.push(x, y, z); }
    idx.push(id);
  }
  g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

// EyeSee — procedural lungs & airways (organ model).
// Anterior view faces +z; the patient's right lung is on −x. Built in centimetres with the
// carina at the origin, then normalised to ~1 unit tall and centred.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const meta = {
  id: 'lungs',
  label: { en: 'Lungs', ja: '肺' },
  summary: {
    en: 'Windpipe, bronchial tree and the five lobes of the lungs, breathing.',
    ja: '気管・気管支と、呼吸する肺の5つの葉',
  },
  kind: 'organ',
};

const PARTS = [
  { id: 'trachea', label: { en: 'Trachea (windpipe)', ja: '気管' },
    info: { en: 'The windpipe that carries air from the throat down to the lungs. Rings of cartilage keep it from collapsing.',
            ja: 'のどから肺へ空気を運ぶ管です。軟骨の輪が、つぶれないように支えています。' } },
  { id: 'carina', label: { en: 'Carina', ja: '気管分岐部' },
    info: { en: 'The point where the windpipe divides into the right and left main bronchi.',
            ja: '気管が左右の主気管支に分かれる場所です。' } },
  { id: 'bronchi', label: { en: 'Bronchi (bronchial tree)', ja: '気管支' },
    info: { en: 'Airways that branch again and again like an upside-down tree, carrying air deep into every part of the lungs.',
            ja: '逆さまの木のように何度も枝分かれしながら、肺のすみずみまで空気を運ぶ管です。' } },
  { id: 'right-upper', label: { en: 'Right upper lobe', ja: '右上葉' },
    info: { en: 'The top section of the right lung. The right lung is divided into three lobes.',
            ja: '右肺のいちばん上の部分です。右肺は3つの「葉（よう）」に分かれています。' } },
  { id: 'right-middle', label: { en: 'Right middle lobe', ja: '右中葉' },
    info: { en: 'The smallest lobe, at the front of the right lung, next to the heart.',
            ja: '右肺の前側、心臓のそばにある、いちばん小さな葉です。' } },
  { id: 'right-lower', label: { en: 'Right lower lobe', ja: '右下葉' },
    info: { en: 'The large bottom-and-back section of the right lung, resting on the diaphragm.',
            ja: '右肺の下側から背中側に広がる大きな部分で、横隔膜の上にのっています。' } },
  { id: 'left-upper', label: { en: 'Left upper lobe', ja: '左上葉' },
    info: { en: 'The top section of the left lung. It has a notch at the front that makes room for the heart.',
            ja: '左肺の上の部分です。前側には心臓の入る「くぼみ（心切痕）」があります。' } },
  { id: 'left-lower', label: { en: 'Left lower lobe', ja: '左下葉' },
    info: { en: 'The bottom-and-back section of the left lung. The left lung has only two lobes.',
            ja: '左肺の下側から背中側の部分です。左肺は2つの葉だけからできています。' } },
  { id: 'diaphragm', label: { en: 'Diaphragm', ja: '横隔膜' },
    info: { en: 'A dome-shaped muscle under the lungs. When it tightens and flattens, air is drawn into the lungs; when it relaxes, you breathe out.',
            ja: '肺の下にあるドーム状の筋肉です。縮んで下がると肺に空気が入り、ゆるむと息が出ていきます。' } },
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
  const ax = x / rx, ay = y / ry, az = z / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
function sdCapsule(x, y, z, a, b, r) {
  const px = x - a.x, py = y - a.y, pz = z - a.z;
  const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z;
  const h = clamp01((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz));
  const qx = px - bx * h, qy = py - by * h, qz = pz - bz * h;
  return Math.sqrt(qx * qx + qy * qy + qz * qz) - r;
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
  const steps = 36, dt = rMax / steps;
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
    for (let k = 0; k < 11; k++) {
      const m = (lo + hi) * 0.5;
      if (F(c.x + d.x * m, c.y + d.y * m, c.z + d.z * m) > 0) hi = m; else lo = m;
    }
    const t = (lo + hi) * 0.5;
    pos.setXYZ(i, c.x + d.x * t, c.y + d.y * t, c.z + d.z * t);
  }
  g.computeVertexNormals();
  return g;
}

// Relax an implicit mesh: Laplacian smoothing + Newton re-projection onto F = 0.
// Evens out triangles where rays graze the surface (thin wedges, fissures).
function relaxToSurface(geo, F, iters = 4) {
  const pos = geo.attributes.position, idx = geo.index.array, n = pos.count;
  const nb = Array.from({ length: n }, () => []);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    nb[a].push(b, c); nb[b].push(c, a); nb[c].push(a, b);
  }
  const P = Float32Array.from(pos.array), Q = new Float32Array(P.length);
  const e = 0.03;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      const l = nb[i];
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < l.length; k++) { const j = l[k] * 3; x += P[j]; y += P[j + 1]; z += P[j + 2]; }
      const m = 1 / Math.max(1, l.length);
      Q[i * 3] = lerp(P[i * 3], x * m, 0.6); Q[i * 3 + 1] = lerp(P[i * 3 + 1], y * m, 0.6); Q[i * 3 + 2] = lerp(P[i * 3 + 2], z * m, 0.6);
    }
    for (let i = 0; i < n; i++) {
      let x = Q[i * 3], y = Q[i * 3 + 1], z = Q[i * 3 + 2];
      for (let s = 0; s < (it === iters - 1 ? 3 : 1); s++) {
        const f = F(x, y, z);
        const gx = (F(x + e, y, z) - F(x - e, y, z)) / (2 * e), gy = (F(x, y + e, z) - F(x, y - e, z)) / (2 * e), gz = (F(x, y, z + e) - F(x, y, z - e)) / (2 * e);
        const g2 = gx * gx + gy * gy + gz * gz;
        if (g2 < 1e-8) break;
        const k = f / g2;
        x -= gx * k; y -= gy * k; z -= gz * k;
      }
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    }
  }
  pos.array.set(P);
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
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


// Procedural micro-relief (object-space value noise → derivative bump mapping). Scale-independent:
// `amp` is in object units, so the look doesn't change with display size. The clear-coat keeps
// the unperturbed normal, which reads as a thin wet film over textured tissue.
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

// Seeded PRNG so the bronchial tree is identical on every device.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ─────────────────────────────── the model ───────────────────────────────
export function create() {
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };
  const hl = makeHighlighter();
  const env = makeEnvTexture();
  if (env) track(env);

  const root = new THREE.Group();
  root.name = 'lungs';
  const body = new THREE.Group(); // centimetre space, carina at the origin
  root.add(body);
  const breathG = new THREE.Group(); // everything that expands with inspiration
  body.add(breathG);

  // ── diaphragm surface height ──
  const DZC = -2.0, DRX = 14.6, DRZ = 9.2;
  const D = (x, z) => {
    const gx = (d) => Math.exp(-(d * d) / 30);
    const h0 = -16.4 + 2.2 * gx(x + 6.5) + 1.4 * gx(x - 7.0); // right dome higher than left
    const zz = (z - DZC) / DRZ;
    const rho = Math.min(1.04, Math.sqrt((x / DRX) * (x / DRX) + zz * zz));
    const fz = zz > 0 ? 1.4 * zz * zz : -0.8 * zz * zz; // anterior attachment higher than posterior
    return h0 - 3.6 * Math.pow(rho, 2.4) + fz;
  };
  // ── lung shape (implicit; negative inside) ──
  const heartC = new THREE.Vector3(1.6, -12.8, 2.6);
  const lungF = (x, y, z, side) => {
    const sx = x * side; // lateral is +sx
    const yTop = side < 0 ? 4.6 : 4.2;
    const tt = clamp01((yTop - y) / 19);
    const k = Math.sqrt(tt) * (0.82 + 0.18 * tt);
    const a = 6.3 * k + 0.05, b = 9.9 * k + 0.05;
    const xc = 5.2 + 3.2 * tt, zc = -0.6 - 1.0 * tt;
    const X = (sx - xc) / a, Z = (z - zc) / b;
    let f = (Math.sqrt(X * X + Z * Z) - 1) * Math.min(a, b);
    if (y > yTop) f = Math.max(f, y - yTop);
    f = smax(f, 2.4 - sx + 0.18 * z, 1.2); // flat mediastinal surface
    f = smax(f, 0.4 - sdEllipsoid(x - heartC.x, y - heartC.y, z - heartC.z, 6.7, 5.6, 5.4), 1.6); // heart bed / cardiac notch
    f = smax(f, D(x, z) + 0.45 - y, 1.8); // sits on the diaphragm
    f += 0.1 * Math.sin((y + 0.35 * z) * 1.25) * sstep(4, 11, sx) * sstep(-16, -2, y); // faint rib impressions
    return f + 0.16 * noise3(x * 0.25, y * 0.25, z * 0.25, side < 0 ? 5 : 9);
  };
  const R = (x, y, z) => lungF(x, y, z, -1);
  const L = (x, y, z) => lungF(x, y, z, 1);
  // fissures (positive on the upper/anterior side)
  const nObl = new THREE.Vector3(0, 0.7, 0.72).normalize();
  const obl = (x, y, z, y0) => (y - y0) * nObl.y + (z + 8.5) * nObl.z + 0.012 * (Math.abs(x) - 8) * (Math.abs(x) - 8) - 0.012 * (y + 8) * (y + 8);
  const oblR = (x, y, z) => obl(x, y, z, -3.6);
  const oblL = (x, y, z) => obl(x, y, z, -3.0);
  const hor = (x, y, z) => y + 8.4 - 0.08 * z - 0.05 * (x + 8) + 0.018 * (z - 2) * (z - 2) + 0.012 * (x + 8) * (x + 8);
  const g = 0.16; // half-gap at each fissure
  const LOBES = {
    'right-upper': (x, y, z) => smax(smax(R(x, y, z), g - oblR(x, y, z), 0.85), g - hor(x, y, z), 0.85),
    'right-middle': (x, y, z) => smax(smax(R(x, y, z), g - oblR(x, y, z), 0.85), g + hor(x, y, z), 0.85),
    'right-lower': (x, y, z) => smax(R(x, y, z), g + oblR(x, y, z), 0.85),
    'left-upper': (x, y, z) => smax(L(x, y, z), g - oblL(x, y, z), 0.85),
    'left-lower': (x, y, z) => smax(L(x, y, z), g + oblL(x, y, z), 0.85),
  };
  // centroid of a lobe by coarse sampling
  const centroid = (F) => {
    const c = new THREE.Vector3(); let n = 0;
    for (let x = -15; x <= 15; x += 1.2) for (let y = -22; y <= 6; y += 1.2) for (let z = -12; z <= 11; z += 1.2) {
      if (F(x, y, z) < -0.5) { c.x += x; c.y += y; c.z += z; n++; }
    }
    return c.multiplyScalar(1 / Math.max(1, n));
  };

  // ── materials ──
  const lungMat = (hex) => {
    const m = track(new THREE.MeshPhysicalMaterial({
      color: hex, roughness: 0.55, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.35,
      sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffd6d0'),
      transparent: true, opacity: 0.86, depthWrite: false, side: THREE.FrontSide,
      vertexColors: true, envMap: env, envMapIntensity: 0.55,
    }));
    // silhouette-weighted alpha: thin tissue face-on, denser at the edges (reads as a volume)
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        float eyeFres = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        diffuseColor.a = clamp(diffuseColor.a * mix(0.6, 1.3, pow(eyeFres, 1.2)), 0.0, 1.0);
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'eyesee-lung-fresnel';
    return m;
  };
  const M = {
    'right-upper': lungMat('#f2a39c'), 'right-middle': lungMat('#ee9a98'), 'right-lower': lungMat('#f0a59b'),
    'left-upper': lungMat('#f2a39c'), 'left-lower': lungMat('#f0a59b'),
    trachea: track(new THREE.MeshPhysicalMaterial({ color: '#e9d9cf', roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3, vertexColors: true, envMap: env, envMapIntensity: 0.5 })),
    carina: track(new THREE.MeshPhysicalMaterial({ color: '#e6d2c8', roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3, envMap: env, envMapIntensity: 0.5 })),
    bronchi: track(new THREE.MeshPhysicalMaterial({ color: '#f6ece2', emissive: '#3a2a26', roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, vertexColors: true, envMap: env, envMapIntensity: 0.5 })),
    diaphragm: track(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new THREE.Color('#ffc0b0'), vertexColors: true, envMap: env, envMapIntensity: 0.5, side: THREE.DoubleSide })),
  };
  for (const id in LOBES) addMicroBump(M[id], 0.07, [1.5, 1.5, 1.5]);
  addMicroBump(M.diaphragm, 0.05, [1.2, 3.5, 1.2]);
  addMicroBump(M.trachea, 0.02, [3, 3, 3]);
  addMicroBump(M.bronchi, 0.015, [3, 3, 3]);
  for (const k in M) hl.register(k, M[k]);
  const addMesh = (geo, id, parent, centre) => {
    track(geo);
    const mesh = new THREE.Mesh(geo, M[id]);
    mesh.userData.partId = id;
    if (centre) { // position at the geometry centre so transparent sorting works
      geo.computeBoundingBox();
      const c = geo.boundingBox.getCenter(new THREE.Vector3());
      geo.translate(-c.x, -c.y, -c.z);
      mesh.position.copy(c);
    }
    parent.add(mesh);
    return mesh;
  };

  // ── lobes ──
  const lobeMeshes = [];
  for (const id in LOBES) {
    const F = LOBES[id];
    const c = centroid(F);
    const geo = relaxToSurface(implicitGeometry(F, c, 19, 16), F, 4);
    const p = geo.attributes.position, n = geo.attributes.normal;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // lobular mottling + slightly darker, denser tissue toward the lower back
      const m = 1 + 0.07 * fbm(x * 0.9, y * 0.9, z * 0.9, 61) + 0.05 * noise3(x * 2.6, y * 2.6, z * 2.6, 63);
      const dep = 1 - 0.1 * sstep(-6, -18, y) * sstep(2, -6, z);
      const s = m * dep;
      col[i * 3] = s; col[i * 3 + 1] = s * 0.98; col[i * 3 + 2] = s * 0.98;
      void n;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = addMesh(geo, id, breathG, true);
    mesh.renderOrder = 2;
    lobeMeshes.push(mesh);
  }

  // ── trachea with C-shaped cartilage rings ──
  const TR_R = 1.0, TR_TOP = 9.5;
  const trCurve = new THREE.LineCurve3(new THREE.Vector3(0, TR_TOP, -0.6), new THREE.Vector3(0, 0.9, -0.2));
  const trParts = [tubeGeometry(trCurve, 24, 28, () => TR_R, { capStart: true, lumen: new THREE.Color('#6b3a3a'), wall: new THREE.Color('#f0e2d8') })];
  const ringArc = 1.62 * Math.PI;
  for (let y = TR_TOP - 0.35; y > 1.3; y -= 0.5) {
    const tg = new THREE.TorusGeometry(TR_R + 0.01, 0.12, 6, 22, ringArc);
    tg.rotateZ(-Math.PI / 2 - (ringArc + TAU) / 2);
    tg.rotateX(Math.PI / 2);
    tg.scale(1, 1.55, 1);
    const k = (TR_TOP - y) / (TR_TOP - 0.9);
    tg.translate(0, y, lerp(-0.6, -0.2, k));
    tg.deleteAttribute('uv');
    trParts.push(tg);
  }
  const trGeo = mergeGeometries(trParts.map((q) => {
    const h = q.index ? q : q;
    if (!h.attributes.color) {
      const c = new Float32Array(h.attributes.position.count * 3).fill(1.04);
      h.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    if (h.attributes.uv) h.deleteAttribute('uv');
    return h;
  }));
  addMesh(trGeo, 'trachea', body);

  // carina: smooth saddle where the trachea divides
  {
    const Fc = (x, y, z) => {
      const a = sdCapsule(x, y, z, new THREE.Vector3(0, 1.6, -0.25), new THREE.Vector3(0, 0.2, -0.15), 0.98);
      const b = sdCapsule(x, y, z, new THREE.Vector3(0, 0.4, -0.15), new THREE.Vector3(-1.6, -1.2, 0.0), 0.78);
      const c = sdCapsule(x, y, z, new THREE.Vector3(0, 0.4, -0.15), new THREE.Vector3(1.9, -1.1, 0.05), 0.68);
      return smin(smin(a, b, 0.5), c, 0.5);
    };
    addMesh(implicitGeometry(Fc, new THREE.Vector3(0, 0.3, -0.15), 12, 4), 'carina', body);
  }

  // ── bronchial tree ──
  const rng = makeRng(20240611);
  const branchGeos = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const addBranch = (a, b, r0, r1, bendAmt = 0.12) => {
    const d = b.clone().sub(a);
    const len = d.length();
    const side = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(d).normalize();
    const mid = a.clone().lerp(b, 0.5).addScaledVector(side, len * bendAmt * (rng() - 0.3));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const radial = r0 > 0.5 ? 14 : r0 > 0.25 ? 9 : 6;
    const segs = Math.max(2, Math.min(8, Math.round(len / 0.9)));
    const geo = tubeGeometry(curve, segs, radial, (u) => lerp(r0, r1, u), { capEnd: true });
    geo.deleteAttribute('uv');
    branchGeos.push(geo);
  };
  // free length along a direction inside a lobe (keeping a margin from its surface)
  const freeLen = (F, p, d, maxL, margin) => {
    let ok = 0;
    for (let t = 0.25; t <= maxL; t += 0.25) {
      if (F(p.x + d.x * t, p.y + d.y * t, p.z + d.z * t) > -margin) break;
      ok = t;
    }
    return ok;
  };
  const randCone = (dir, minA, maxA) => {
    const a = lerp(minA, maxA, rng()), roll = rng() * TAU;
    const up = Math.abs(dir.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(dir, up).normalize();
    const w = new THREE.Vector3().crossVectors(dir, u);
    return dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(u, Math.sin(a) * Math.cos(roll)).addScaledVector(w, Math.sin(a) * Math.sin(roll)).normalize();
  };
  const grow = (F, start, dir, r, len, gen) => {
    const margin = 0.3 + r;
    // the first stretch may still be outside the lobe (at the hilum): walk in first
    let enter = 0;
    const maxEnter = gen === 1 ? 5 : 1.2;
    while (enter <= maxEnter && F(start.x + dir.x * enter, start.y + dir.y * enter, start.z + dir.z * enter) > -margin) enter += 0.2;
    if (enter > maxEnter) return;
    const p0 = start.clone().addScaledVector(dir, enter);
    const L0 = Math.min(Math.max(len, enter + 0.8), enter + freeLen(F, p0, dir, len, margin));
    if (L0 < 0.7) return;
    const end = start.clone().addScaledVector(dir, L0);
    const r1 = r * 0.9;
    addBranch(start, end, r, r1);
    if (gen >= 6 || r < 0.08) return;
    // pick two well-separated child directions with the most room ahead of them
    const cands = [];
    for (let k = 0; k < 14; k++) {
      const d = randCone(dir, 0.35, 0.95);
      cands.push({ d, s: freeLen(F, end, d, 7, 0.4) + rng() * 0.6 });
    }
    cands.sort((p, q) => q.s - p.s);
    const c1 = cands[0];
    const c2 = cands.find((c) => c.d.dot(c1.d) < Math.cos(0.75)) || cands[1];
    const rc = r1 * 0.8;
    const lc = len * 0.8;
    grow(F, end.clone().addScaledVector(c1.d, -rc * 0.5), c1.d, rc, lc, gen + 1);
    grow(F, end.clone().addScaledVector(c2.d, -rc * 0.5), c2.d, rc * 0.92, lc * 0.9, gen + 1);
  };
  // main + lobar bronchi (explicit), segmental tree grown inside each lobe
  const carinaP = V(0, 0.3, -0.15);
  const rMainEnd = V(-2.5, -2.1, 0.0), lMainEnd = V(4.1, -2.7, 0.15);
  addBranch(carinaP, rMainEnd, 0.8, 0.72, 0.02);
  addBranch(carinaP, lMainEnd, 0.7, 0.6, 0.02);
  // segmental bronchi: [direction, radius, length]
  const segs = (from, lobe, list) => {
    for (const [d, r, len] of list) {
      const dir = V(...d).normalize();
      const tip = from.clone().addScaledVector(dir, 0.9);
      addBranch(from, tip, r * 1.05, r, 0.02);
      grow(LOBES[lobe], tip, dir, r, len, 1);
    }
  };
  // right: upper lobe bronchus; bronchus intermedius → middle & lower lobe bronchi
  const rul = V(-4.2, -1.3, -0.1), bi = V(-3.2, -4.8, 0.2), rml = V(-3.9, -6.2, 1.7), rll = V(-3.9, -7.3, -0.5);
  addBranch(rMainEnd, rul, 0.52, 0.48, 0.02);
  addBranch(rMainEnd, bi, 0.62, 0.56, 0.02);
  addBranch(bi, rml, 0.4, 0.36, 0.03);
  addBranch(bi, rll, 0.55, 0.5, 0.02);
  segs(rul, 'right-upper', [[[-0.25, 1, 0.05], 0.36, 4.6], [[-0.6, 0.45, -0.8], 0.34, 4.2], [[-0.55, 0.1, 1.0], 0.34, 4.2]]);
  segs(rml, 'right-middle', [[[-0.8, -0.4, 0.6], 0.28, 3.6], [[-0.1, -0.5, 1.0], 0.28, 3.4]]);
  segs(bi.clone().lerp(rll, 0.5), 'right-lower', [[[-0.35, 0.15, -1.0], 0.34, 4.2]]);
  segs(rll, 'right-lower', [[[0.05, -1, 0.15], 0.3, 4.4], [[-0.45, -1, 0.65], 0.32, 4.4], [[-0.95, -1, 0.0], 0.32, 4.4], [[-0.3, -1, -0.8], 0.34, 4.6]]);
  // left: upper lobe (incl. lingula) and lower lobe
  const lul = V(5.2, -2.4, 0.9), lll = V(5.0, -5.2, -0.8);
  addBranch(lMainEnd, lul, 0.5, 0.46, 0.02);
  addBranch(lMainEnd, lll, 0.55, 0.5, 0.02);
  segs(lul, 'left-upper', [[[0.25, 1, -0.35], 0.36, 4.6], [[0.5, 0.2, 1.0], 0.34, 4.2], [[0.6, -0.5, 0.9], 0.3, 3.8], [[0.3, -0.9, 0.8], 0.3, 3.8]]);
  segs(lll, 'left-lower', [[[0.3, 0.2, -1.0], 0.34, 4.2], [[0.2, -1, 0.5], 0.32, 4.4], [[0.8, -1, 0.0], 0.32, 4.4], [[0.3, -1, -0.8], 0.34, 4.6]]);
  // cartilage plates on the main bronchi
  const ringOn = (a, b, r, n) => {
    const d = b.clone().sub(a).normalize();
    for (let i = 1; i <= n; i++) {
      const p = a.clone().lerp(b, i / (n + 1));
      const tg = new THREE.TorusGeometry(r + 0.03, 0.12, 5, 18, 1.6 * Math.PI);
      tg.deleteAttribute('uv');
      tg.lookAt(d);
      tg.translate(p.x, p.y, p.z);
      tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tg.attributes.position.count * 3).fill(1.04), 3));
      branchGeos.push(tg);
    }
  };
  ringOn(carinaP.clone().lerp(rMainEnd, 0.3), rMainEnd, 0.76, 3);
  ringOn(carinaP.clone().lerp(lMainEnd, 0.25), lMainEnd, 0.65, 5);
  const brGeo = mergeGeometries(branchGeos.map((q) => (q.index ? q : q.toNonIndexed())));
  for (const q of branchGeos) q.dispose();
  addMesh(brGeo, 'bronchi', breathG);

  // ── diaphragm: two domes with a pale central tendon, as a thin muscular sheet ──
  {
    const NR = 30, NA = 72, TH = 0.45;
    const RX = DRX * 0.93, RZ = DRZ * 0.93, zc = DZC;
    const pos = [], col = [], idx = [];
    const muscle = new THREE.Color('#b9584e'), tendon = new THREE.Color('#d9c3b6');
    const surfY = (x, z) => D(x, z);
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i <= NR; i++) {
        const rho = Math.pow(i / NR, 0.9);
        for (let j = 0; j < NA; j++) {
          const a = (j / NA) * TAU;
          const x = RX * rho * Math.cos(a), z = zc + RZ * rho * Math.sin(a);
          const y = surfY(x, z) - (layer ? TH : 0);
          pos.push(x, y, z);
          // central tendon: trefoil-shaped pale area
          const tx = x - 0.6, tz = z - 0.8;
          const ang = Math.atan2(tz, tx);
          const tr = Math.hypot(tx / 1.25, tz) / (4.2 + 1.6 * Math.cos(3 * (ang + 0.5)));
          const w = 1 - sstep(0.55, 1.1, tr);
          const c = muscle.clone().lerp(tendon, w * 0.7);
          const m = 1 + 0.06 * noise3(x * 0.8, y * 0.8, z * 0.8, 71);
          col.push(c.r * m, c.g * m, c.b * m);
        }
      }
    }
    const ring = NA, layerN = (NR + 1) * NA;
    for (let layer = 0; layer < 2; layer++) {
      const o = layer * layerN;
      for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
        const a = o + i * ring + j, b = o + i * ring + ((j + 1) % NA), c = a + ring, d = b + ring;
        if (layer === 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
    for (let j = 0; j < NA; j++) { // rim
      const a = NR * ring + j, b = NR * ring + ((j + 1) % NA);
      idx.push(a, b + layerN, b, a, a + layerN, b + layerN);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    dg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    dg.setIndex(idx);
    dg.computeVertexNormals();
    addMesh(dg, 'diaphragm', breathG);
  }

  // ── normalise: ~1 unit tall, centred ──
  const box = new THREE.Box3().setFromObject(body);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const S = 1 / size.y;
  body.scale.setScalar(S);
  body.position.copy(ctr).multiplyScalar(-S);

  // ── breathing (~14 / min): inhale 40 %, exhale 60 % ──
  const PERIOD = 60 / 14;
  const update = (dt, t) => {
    const ph = (((t % PERIOD) + PERIOD) % PERIOD) / PERIOD;
    const b = ph < 0.4 ? 0.5 - 0.5 * Math.cos((Math.PI * ph) / 0.4) : 0.5 + 0.5 * Math.cos((Math.PI * (ph - 0.4)) / 0.6);
    breathG.scale.set(1 + 0.03 * b, 1 + 0.065 * b, 1 + 0.045 * b); // pivot = carina (origin)
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

// EyeSee — distal gastrectomy (Billroth I reconstruction) procedure explainer.
// Anterior view faces +z; the patient's left is +x. The stomach, duodenum and a loop of small
// intestine are one continuous tube whose pieces are cut, sealed, removed and re-joined:
// tumour → lower stomach divided → removed → remnant joined to the duodenum → food passes.
// Built in centimetres, then normalised to ~1 unit tall and centred.
import * as THREE from 'three';

export const meta = {
  id: 'stomach',
  label: { en: 'Stomach surgery (distal gastrectomy)', ja: '胃切除術（幽門側胃切除）' },
  summary: {
    en: 'How the lower part of the stomach with a tumour is removed, and the remaining stomach is reconnected so food can pass.',
    ja: '腫瘍のある胃の下の部分を切り取り、残った胃をつなぎ直して食べ物が通れるようにする手術の流れ',
  },
  kind: 'procedure',
  steps: [
    { en: 'A tumour is in the lower part of the stomach.',
      ja: '胃の下のほうに腫瘍があります。' },
    { en: 'The lower part of the stomach, including the tumour, is separated.',
      ja: '腫瘍を含む胃の下の部分を切り離します。' },
    { en: 'That part is removed.',
      ja: 'その部分を取り出します。' },
    { en: 'The remaining stomach is connected to the small intestine so food can pass.',
      ja: '残った胃を小腸とつなぎ、食べ物が通れるようにします。' },
    { en: 'After recovery, you eat smaller meals more often at first.',
      ja: '回復後、しばらくは少量ずつ回数を分けて食べます。' },
  ],
};

const PARTS = [
  { id: 'oesophagus', label: { en: 'Oesophagus (food pipe)', ja: '食道' },
    info: { en: 'The muscular tube that carries food from your mouth down to your stomach. It is not operated on.',
            ja: '口から入った食べ物を胃へ運ぶ、筋肉でできた管です。手術はしません。' } },
  { id: 'stomach', label: { en: 'Stomach (the part that stays)', ja: '胃（残す部分）' },
    info: { en: 'A stretchy, muscular bag that stores food and mixes it with digestive juices. The upper part of the stomach is kept and keeps doing this job.',
            ja: '食べ物をためて消化液とまぜる、伸び縮みする筋肉の袋です。胃の上の部分は残り、この働きを続けます。' } },
  { id: 'tumour', label: { en: 'Tumour', ja: '腫瘍' },
    info: { en: 'An abnormal growth in the lower part of the stomach. The operation removes it together with the surrounding part of the stomach.',
            ja: '胃の下の部分にできた、できもの（腫瘍）です。手術では、まわりの胃と一緒に取り除きます。' } },
  { id: 'resected', label: { en: 'Part to be removed', ja: '切り取る部分' },
    info: { en: 'The lower part of the stomach containing the tumour, including the stomach’s outlet (the pylorus). It is removed with a margin of healthy tissue.',
            ja: '腫瘍を含む胃の下の部分で、胃の出口（幽門）も含みます。健康な部分を少し含めて切り取ります。' } },
  { id: 'duodenum', label: { en: 'Duodenum', ja: '十二指腸' },
    info: { en: 'The first part of the small intestine, right after the stomach. Here food mixes with bile and digestive juices from the pancreas.',
            ja: '胃のすぐ後に続く、小腸のはじまりの部分です。ここで食べ物が胆汁やすい液とまざります。' } },
  { id: 'small-intestine', label: { en: 'Small intestine', ja: '小腸' },
    info: { en: 'The long, coiled tube where most of the nutrients from food are absorbed.',
            ja: '食べ物の栄養の大部分を吸収する、長く折りたたまれた管です。' } },
  { id: 'anastomosis', label: { en: 'New connection (anastomosis)', ja: '吻合部（つなぎ目）' },
    info: { en: 'Where the remaining stomach is joined to the small intestine (duodenum), so that food can pass through again.',
            ja: '残った胃と小腸（十二指腸）をつなぎ合わせた部分です。ここを通って、食べ物が再び流れるようになります。' } },
  { id: 'cut-line', label: { en: 'Cut line & staples', ja: '切る線とステープル' },
    info: { en: 'Where the stomach and the duodenum are divided. The cut ends are sealed with rows of tiny surgical staples.',
            ja: '胃と十二指腸を切り離す線です。切った端は、小さな医療用ステープル（ホチキスのようなもの）で閉じます。' } },
  { id: 'food', label: { en: 'Food', ja: '食べ物' },
    info: { en: 'A small mouthful of food passing through the new connection. At first, eating small meals more often is easier on the smaller stomach.',
            ja: '新しいつなぎ目を通っていく少量の食べ物です。胃が小さくなるため、はじめは少量ずつ回数を分けて食べると楽です。' } },
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
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10), w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = lerp(hash3(xi, yi, zi, s), hash3(xi + 1, yi, zi, s), u);
  const b = lerp(hash3(xi, yi + 1, zi, s), hash3(xi + 1, yi + 1, zi, s), u);
  const c = lerp(hash3(xi, yi, zi + 1, s), hash3(xi + 1, yi, zi + 1, s), u);
  const d = lerp(hash3(xi, yi + 1, zi + 1, s), hash3(xi + 1, yi + 1, zi + 1, s), u);
  return lerp(lerp(a, b, v), lerp(c, d, v), w);
}
const fbm = (x, y, z, s = 0) => noise3(x, y, z, s) * 0.65 + noise3(x * 2.03, y * 2.03, z * 2.03, s + 7) * 0.35;

// Tube with variable radius along a curve (Frenet frames); optional end caps showing a cut lumen.
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

// Highlight / dim controller shared by all parts of a model. Base colours live in mat.userData.hl,
// and `fade` scales the opacity of transparent parts that come, go or turn see-through.
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
        color: mat.color.clone(), emissive: mat.emissive.clone(), opacity: mat.opacity, fade: 1,
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

// Peristalsis: vertices with a path coordinate `aS` (cm along the food's route) swell around each
// food bolus and gently squeeze just behind it. Uniforms are shared, so every wall moves in step.
function addPeristalsis(mat, uniforms) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aS;
uniform vec2 uBolus;
uniform float uPeri;
uniform float uWave;
float eyPeri(float x) { return 0.5 * exp(-x * x / 1.1) - 0.22 * exp(-(x + 2.1) * (x + 2.1) / 0.9); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed += objectNormal * uPeri * (eyPeri(aS - uBolus.x) + eyPeri(aS - uBolus.y) + 0.08 * sin(aS * 0.9 - uWave));`);
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => prevKey + '|eyesee-peri';
  return mat;
}

// See-through (step 4): walls facing the viewer fade, silhouettes stay solid — like a clear diagram,
// so the food inside can be followed. `uSee` 0…1.
function addSeeThrough(mat, uniforms) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSee;')
      .replace('#include <opaque_fragment>', `{ float nv = abs(dot(normalize(normal), normalize(vViewPosition)));
          diffuseColor.a *= mix(1.0, 0.16 + 0.84 * pow(1.0 - nv, 1.7), uSee); }
        #include <opaque_fragment>`);
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => prevKey + '|eyesee-see';
  return mat;
}

// 1-D cubic Hermite through knots [[s, v...], ...] with Catmull-Rom slopes (non-uniform spacing).
function knotCurve(knots) {
  const n = knots.length;
  const slope = (k, c) => {
    const a = knots[Math.max(0, k - 1)], b = knots[Math.min(n - 1, k + 1)];
    return (b[c] - a[c]) / (b[0] - a[0]);
  };
  return (s, c) => {
    if (s <= knots[0][0]) return knots[0][c];
    if (s >= knots[n - 1][0]) return knots[n - 1][c];
    let k = 0;
    while (knots[k + 1][0] < s) k++;
    const s0 = knots[k][0], s1 = knots[k + 1][0], h = s1 - s0, t = (s - s0) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * knots[k][c] + (t3 - 2 * t2 + t) * h * slope(k, c) + (-2 * t3 + 3 * t2) * knots[k + 1][c] + (t3 - t2) * h * slope(k + 1, c);
  };
}

// n points evenly spaced by arc length along a polyline
function resample(pts, n) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = cum[cum.length - 1], out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * L;
    while (j < pts.length - 2 && cum[j + 1] < t) j++;
    const w = clamp01((t - cum[j]) / (cum[j + 1] - cum[j] || 1));
    out.push(pts[j].clone().lerp(pts[j + 1], w));
  }
  return out;
}

// ─────────────────────────────── the model ───────────────────────────────
export function create() {
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };
  const hl = makeHighlighter();
  const env = makeEnvTexture();
  if (env) track(env);

  const root = new THREE.Group();
  root.name = 'stomach';
  const body = new THREE.Group(); // centimetre space, normalised at the end
  root.add(body);
  const anat = new THREE.Group();
  body.add(anat);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── one centreline: fundus → body → antrum → pylorus → duodenum → small intestine ──
  const STOM = [[5.0, 12.4, -1.3], [6.4, 10.0, -0.7], [7.0, 6.6, 0.0], [6.7, 3.4, 0.5], [5.6, 0.5, 0.8], [3.9, -2.0, 1.0],
    [1.1, -3.1, 1.0], [-1.6, -2.4, 0.8], [-3.2, -0.8, 0.5], [-4.1, 0.1, 0.1]];
  const DUO = [[-5.3, 0.7, -0.6], [-6.6, 0.2, -1.7], [-7.2, -2.4, -2.3], [-6.9, -5.4, -2.5], [-4.9, -7.2, -2.7],
    [-1.6, -7.8, -2.9], [1.5, -7.3, -2.7], [2.9, -5.8, -2.2]];
  const JEJ = [[4.1, -5.2, -1.0], [5.9, -6.4, 0.6], [6.0, -9.0, 1.5], [3.8, -10.5, 1.9], [0.8, -10.1, 1.9], [-1.8, -10.7, 1.6], [-3.3, -12.2, 1.1]];
  const ctrl = [...STOM, ...DUO, ...JEJ].map((p) => V(...p));
  const gCurve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  const DS = 0.2;
  const NR = Math.round(gCurve.getLength() / DS) + 1;
  const G = gCurve.getSpacedPoints(NR - 1);
  const ds = gCurve.getLength() / (NR - 1);
  const rowOf = (p) => { let b = 0, bd = Infinity; for (let i = 0; i < NR; i++) { const d = G[i].distanceToSquared(p); if (d < bd) { bd = d; b = i; } } return b; };
  const rowOfCtrl = (k) => rowOf(ctrl[k]);
  const sOf = (k) => rowOfCtrl(k) * ds;
  const nS = STOM.length, nD = DUO.length;
  // radius profile: a = in-plane half-width, b = front–back half-depth
  const FUND = 2.8;
  const prof = knotCurve([
    [FUND, 3.45, 3.0], [sOf(2), 3.95, 3.05], [sOf(4), 3.8, 2.85], [sOf(5), 3.35, 2.65], [sOf(6), 2.7, 2.25], [sOf(7), 2.1, 1.85],
    [sOf(8), 1.5, 1.42], [sOf(9), 1.08, 1.08], [sOf(9) + 1.0, 1.48, 1.42], [sOf(nS + 1), 1.4, 1.36],
    [sOf(nS + nD - 1), 1.34, 1.3], [NR * ds, 1.28, 1.26],
  ]);
  const A0 = new Float64Array(NR), B0 = new Float64Array(NR);
  for (let i = 0; i < NR; i++) {
    const s = i * ds;
    if (s < FUND) { const q = 1 - s / FUND, f = Math.sqrt(Math.max(0, 1 - q * q)); A0[i] = 3.45 * f; B0[i] = 3.0 * f; }
    else { A0[i] = prof(s, 1); B0[i] = prof(s, 2); }
  }
  // landmark rows: the two cuts and the duodeno-jejunal flexure
  let iC1 = 0;
  { let bd = Infinity; for (let i = rowOfCtrl(2); i < rowOfCtrl(4); i++) { const d = Math.abs(G[i].y - 2.7); if (d < bd) { bd = d; iC1 = i; } } }
  const iC2 = rowOfCtrl(9) + Math.round(1.5 / ds);
  const iDJ = rowOfCtrl(nS + nD - 1);
  const iM = rowOfCtrl(2) - 2;     // the remnant bends below here when it is joined
  const iN = rowOfCtrl(nS + 2);    // the duodenum stays put beyond here
  const tangents = (P, i, n, out) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    return out.subVectors(b, a).normalize();
  };
  const T0 = G.map((_, i) => tangents(G, i, NR, V(0, 0, 0)));

  // ── post-operative (Billroth I) layout: remnant curves down to meet the duodenum at J ──
  const J = V(0.4, 0.2, 0.7);
  const RJ = 1.46;
  const P1 = G.map((p) => p.clone());
  const T1 = T0.map((t) => t.clone());
  const A1 = Float64Array.from(A0), B1 = Float64Array.from(B0);
  {
    const qa = new THREE.CatmullRomCurve3([G[iM - 8], G[iM], V(6.0, 3.6, 0.7), V(4.0, 1.1, 0.9), J, V(-1.6, 0.25, 0.35)], false, 'centripetal');
    const dense = qa.getSpacedPoints(1500);
    let k0 = 0, k1 = 0, bd0 = Infinity, bd1 = Infinity;
    dense.forEach((p, k) => { const d0 = p.distanceToSquared(G[iM]), d1 = p.distanceToSquared(J); if (d0 < bd0) { bd0 = d0; k0 = k; } if (d1 < bd1) { bd1 = d1; k1 = k; } });
    const ra = resample(dense.slice(k0, k1 + 1), iC1 - iM + 1);
    for (let i = iM; i <= iC1; i++) {
      P1[i].copy(ra[i - iM]);
      const f = (i - iM) / (iC1 - iM);
      A1[i] = lerp(A0[i], RJ, sstep(0.45, 1, f)); B1[i] = lerp(B0[i], RJ, sstep(0.45, 1, f));
    }
    const qd = new THREE.CatmullRomCurve3([V(3.2, 0.4, 0.9), J, V(-2.4, 0.2, 0.2), V(-5.2, 0.0, -0.9), G[iN], G[iN + 8]], false, 'centripetal');
    const dd = qd.getSpacedPoints(1500);
    let m0 = 0, m1 = 0; bd0 = Infinity; bd1 = Infinity;
    dd.forEach((p, k) => { const d0 = p.distanceToSquared(J), d1 = p.distanceToSquared(G[iN]); if (d0 < bd0) { bd0 = d0; m0 = k; } if (d1 < bd1) { bd1 = d1; m1 = k; } });
    const rd = resample(dd.slice(m0, m1 + 1), iN - iC2 + 1);
    for (let i = iC2; i <= iN; i++) {
      P1[i].copy(rd[i - iC2]);
      const f = (i - iC2) / (iN - iC2);
      A1[i] = lerp(RJ, A0[i], sstep(0, 0.4, f)); B1[i] = lerp(RJ, B0[i], sstep(0, 0.4, f));
    }
    // tangents of the joined tract (remnant rows then duodenal rows, continuous across J)
    const seq = [];
    for (let i = 0; i <= iC1; i++) seq.push(i);
    for (let i = iC2 + 1; i < NR; i++) seq.push(i);
    const tmp = V(0, 0, 0);
    for (let k = 0; k < seq.length; k++) {
      const a = P1[seq[Math.max(0, k - 1)]], b = P1[seq[Math.min(seq.length - 1, k + 1)]];
      T1[seq[k]].copy(tmp.subVectors(b, a).normalize());
    }
    T1[iC2].copy(T1[iC1]);
  }

  // ── materials ──
  const tissue = (hex, extra = {}) => track(new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.46, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.24,
    sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffc2b4'),
    vertexColors: true, envMap: env, envMapIntensity: 0.55, ...extra,
  }));
  const metal = (extra = {}) => track(new THREE.MeshPhysicalMaterial({ color: '#e6ebf0', metalness: 0.7, roughness: 0.3, envMap: env, envMapIntensity: 1.4, ...extra }));
  const M = {
    oes: tissue('#d9877c', { transparent: true }),
    stomach: tissue('#eba08f', { transparent: true }),
    resected: tissue('#eba08f', { transparent: true }),
    tumour: tissue('#efe2ca', { roughness: 0.58, clearcoat: 0.4, sheenColor: new THREE.Color('#fff6de'), transparent: true }),
    duo: tissue('#eeab8a', { transparent: true }),
    jej: tissue('#eca592'),
    ring: tissue('#f0ae9c', { roughness: 0.4, clearcoat: 0.7, vertexColors: false }),
    suture: metal({ color: '#eef1f5', roughness: 0.3 }),
    staple: metal(),
    stapleR: metal({ transparent: true }),
    line: track(new THREE.MeshStandardMaterial({ color: '#fbfaf2', emissive: '#5c5646', roughness: 0.4, envMap: env, envMapIntensity: 0.4 })),
    food: tissue('#efcf92', { roughness: 0.6, clearcoat: 0.3, emissive: '#3a2a10', sheenColor: new THREE.Color('#fff2cc') }),
  };
  const partOf = {
    oes: 'oesophagus', stomach: 'stomach', resected: 'resected', tumour: 'tumour', duo: 'duodenum', jej: 'small-intestine',
    ring: 'anastomosis', suture: 'anastomosis', staple: 'cut-line', stapleR: 'cut-line', line: 'cut-line', food: 'food',
  };
  for (const k of ['oes', 'stomach', 'resected', 'duo', 'jej']) addMicroBump(M[k], 0.035, [1.6, 1.6, 1.6]);
  addMicroBump(M.tumour, 0.08, [2.8, 2.8, 2.8]);
  addMicroBump(M.ring, 0.02, [3, 3, 3]);
  const peri = { uBolus: { value: new THREE.Vector2(-50, -50) }, uPeri: { value: 0 }, uWave: { value: 0 } };
  for (const k of ['oes', 'stomach', 'duo']) addPeristalsis(M[k], peri);
  const see = { uSee: { value: 0 } };
  for (const k of ['oes', 'stomach', 'duo']) addSeeThrough(M[k], see);
  for (const k of ['oes', 'stomach', 'duo', 'jej', 'resected']) M[k].side = THREE.DoubleSide; // hollow organs: the far wall shows through
  for (const k in M) hl.register(partOf[k], M[k]);
  const addMesh = (geo, key, parent) => {
    track(geo);
    const m = new THREE.Mesh(geo, M[key]);
    m.userData.partId = partOf[key];
    parent.add(m);
    return m;
  };

  // ── tract pieces: rows i0…i1 of the centreline, rebuilt in place when the state changes ──
  const RADIAL = 44;
  const Z = V(0, 0, 1);
  const S = { seal: 0, sealR: 0, post: 0, join: 0 };
  const makePiece = (i0, i1, radial, opts = {}) => {
    const n = i1 - i0 + 1;
    const capEnd = !!opts.capEnd;
    const count = n * radial + (capEnd ? radial * 2 + 1 : 0);
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const cx = new Float64Array(n), cy = new Float64Array(n), cz = new Float64Array(n);
    const idx = [];
    for (let r = 0; r < n - 1; r++) for (let j = 0; j < radial; j++) {
      const a = r * radial + j, b = r * radial + ((j + 1) % radial), c = b + radial, d = a + radial;
      idx.push(a, d, c, a, c, b);
    }
    const P = V(0, 0, 0), T = V(0, 0, 0), N = V(0, 0, 0), Bv = V(0, 0, 0);
    const nTube = idx.length;
    if (capEnd) { // outer (wall) ring → inner (lumen) ring → centre
      const base = n * radial;
      for (let j = 0; j < radial; j++) {
        const j1 = (j + 1) % radial;
        idx.push(base + j, base + radial + j, base + radial + j1, base + j, base + radial + j1, base + j1);
        idx.push(base + radial + j, base + 2 * radial, base + radial + j1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    // `seal0`/`seal1`: how closed (flattened into a stapled seam) the start/end is, 0…1
    const refill = (post, seal0, seal1) => {
      for (let r = 0; r < n; r++) {
        const i = i0 + r;
        P.lerpVectors(G[i], P1[i], post);
        T.lerpVectors(T0[i], T1[i], post).normalize();
        Bv.copy(Z).addScaledVector(T, -Z.dot(T)).normalize();
        N.crossVectors(Bv, T);
        let a = lerp(A0[i], A1[i], post), b = lerp(B0[i], B1[i], post);
        const d0 = r * ds, d1 = (n - 1 - r) * ds, L = 2.2;
        const f0 = Math.sqrt(clamp01(d0 / L) * (2 - clamp01(d0 / L))), f1 = Math.sqrt(clamp01(d1 / L) * (2 - clamp01(d1 / L)));
        const kb = lerp(1, f0, seal0) * lerp(1, f1, seal1);
        a *= 1 + 0.22 * (seal0 * (1 - f0) + seal1 * (1 - f1));
        b *= Math.max(kb, 0.004);
        cx[r] = P.x; cy[r] = P.y; cz[r] = P.z;
        for (let j = 0; j < radial; j++) {
          const th = (j / radial) * TAU, ca = Math.cos(th), sa = Math.sin(th), o = (r * radial + j) * 3;
          pos[o] = P.x + N.x * a * ca + Bv.x * b * sa;
          pos[o + 1] = P.y + N.y * a * ca + Bv.y * b * sa;
          pos[o + 2] = P.z + N.z * a * ca + Bv.z * b * sa;
        }
      }
      // normals from the grid (central differences), pointing away from the centreline
      for (let r = 0; r < n; r++) {
        const rp = Math.min(n - 1, r + 1), rm = Math.max(0, r - 1);
        for (let j = 0; j < radial; j++) {
          const o = (r * radial + j) * 3;
          const jp = (r * radial + ((j + 1) % radial)) * 3, jm = (r * radial + ((j + radial - 1) % radial)) * 3;
          const up = (rp * radial + j) * 3, um = (rm * radial + j) * 3;
          const ux = pos[jp] - pos[jm], uy = pos[jp + 1] - pos[jm + 1], uz = pos[jp + 2] - pos[jm + 2];
          const vx = pos[up] - pos[um], vy = pos[up + 1] - pos[um + 1], vz = pos[up + 2] - pos[um + 2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          let l = Math.hypot(nx, ny, nz);
          const ox = pos[o] - cx[r], oy = pos[o + 1] - cy[r], oz = pos[o + 2] - cz[r];
          if (l < 1e-9) { nx = ox; ny = oy; nz = oz; l = Math.hypot(nx, ny, nz) || 1; }
          if (nx * ox + ny * oy + nz * oz < 0) l = -l;
          nor[o] = nx / l; nor[o + 1] = ny / l; nor[o + 2] = nz / l;
        }
      }
      // at a sealed end the seam's normal leans outwards along the tube
      for (const [r, sl] of [[0, seal0], [n - 1, seal1]]) {
        if (sl <= 0) continue;
        const rr = r === 0 ? 1 : n - 2;
        const tx = cx[r] - cx[rr], ty = cy[r] - cy[rr], tz = cz[r] - cz[rr]; // outwards along the tube
        const tl = Math.hypot(tx, ty, tz) || 1;
        for (let j = 0; j < radial; j++) {
          const o = (r * radial + j) * 3;
          const x = lerp(nor[o], tx / tl, sl * 0.8), y = lerp(nor[o + 1], ty / tl, sl * 0.8), z = lerp(nor[o + 2], tz / tl, sl * 0.8);
          const l = Math.hypot(x, y, z) || 1;
          nor[o] = x / l; nor[o + 1] = y / l; nor[o + 2] = z / l;
        }
      }
      if (capEnd) { // cut end of the intestine loop, showing its lumen
        const r = n - 1, base = n * radial;
        const tx = cx[r] - cx[r - 1], ty = cy[r] - cy[r - 1], tz = cz[r] - cz[r - 1], tl = Math.hypot(tx, ty, tz);
        for (let k = 0; k < 2; k++) for (let j = 0; j < radial; j++) {
          const s = (r * radial + j) * 3, o = (base + k * radial + j) * 3, f = k ? 0.7 : 1;
          pos[o] = cx[r] + (pos[s] - cx[r]) * f; pos[o + 1] = cy[r] + (pos[s + 1] - cy[r]) * f; pos[o + 2] = cz[r] + (pos[s + 2] - cz[r]) * f;
          nor[o] = tx / tl; nor[o + 1] = ty / tl; nor[o + 2] = tz / tl;
        }
        const o = (base + 2 * radial) * 3;
        pos[o] = cx[r] - tx / tl * 0.4; pos[o + 1] = cy[r] - ty / tl * 0.4; pos[o + 2] = cz[r] - tz / tl * 0.4;
        nor[o] = tx / tl; nor[o + 1] = ty / tl; nor[o + 2] = tz / tl;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
      geo.computeBoundingSphere();
    };
    refill(0, 0, 0);
    // vertex colour: soft mottling, a little pinker along the greater curvature
    for (let r = 0; r < n; r++) for (let j = 0; j < radial; j++) {
      const o = (r * radial + j) * 3, s = (i0 + r) * ds, th = (j / radial) * TAU;
      const m = 1 + 0.07 * fbm(s * 0.45, Math.cos(th) * 1.2, Math.sin(th) * 1.2, 31) + 0.03 * noise3(s * 1.6, Math.cos(th) * 3, Math.sin(th) * 3, 32);
      const gc = Math.max(0, Math.cos(th)) ** 3 * (opts.curv || 0);
      col[o] = m * (1 - 0.02 * gc); col[o + 1] = m * (1 - 0.12 * gc); col[o + 2] = m * (1 - 0.1 * gc);
    }
    if (capEnd) for (let k = 0; k < 2 * radial + 1; k++) { // pale cut wall, then the (deeper pink) lining
      const o = (n * radial + k) * 3;
      if (k < radial) col.set([0.98, 0.92, 0.88], o); else col.set([0.62, 0.34, 0.34], o);
    }
    // windings that agree with the normals (tube and cap checked separately)
    const ia = geo.index.array;
    const orient = (from, to) => {
      const t0 = ia[from] * 3, t1 = ia[from + 1] * 3, t2 = ia[from + 2] * 3;
      const ux = pos[t1] - pos[t0], uy = pos[t1 + 1] - pos[t0 + 1], uz = pos[t1 + 2] - pos[t0 + 2];
      const vx = pos[t2] - pos[t0], vy = pos[t2 + 1] - pos[t0 + 1], vz = pos[t2 + 2] - pos[t0 + 2];
      if ((uy * vz - uz * vy) * nor[t0] + (uz * vx - ux * vz) * nor[t0 + 1] + (ux * vy - uy * vx) * nor[t0 + 2] < 0) {
        for (let t = from; t < to; t += 3) { const tmp = ia[t + 1]; ia[t + 1] = ia[t + 2]; ia[t + 2] = tmp; }
      }
    };
    orient(0, nTube);
    if (capEnd) orient(nTube, ia.length);
    return { geo, refill, n, i0, i1, cx, cy, cz };
  };

  const remnant = makePiece(0, iC1, RADIAL, { curv: 1 });
  const resec = makePiece(iC1, iC2, RADIAL, { curv: 1 });
  const duo = makePiece(iC2, iDJ, 26);
  const jej = makePiece(iDJ, NR - 1, 26, { capEnd: true });
  const resG = new THREE.Group(); anat.add(resG);
  const resIn = new THREE.Group(); resG.add(resIn);
  addMesh(remnant.geo, 'stomach', anat);
  addMesh(resec.geo, 'resected', resIn);
  addMesh(duo.geo, 'duo', anat);
  addMesh(jej.geo, 'jej', anat);

  // ── oesophagus: down through the diaphragm into the cardia ──
  const oesCurve = new THREE.CatmullRomCurve3([V(1.4, 16.0, -2.6), V(1.8, 13.0, -1.9), V(2.3, 10.3, -1.0), V(3.1, 8.2, -0.3), V(4.4, 6.6, 0.1)], false, 'centripetal');
  const OES_SEGS = 70;
  const oesR = (u) => 1.02 + 0.55 * sstep(0.72, 1, u);
  const oesGeo = tubeGeometry(oesCurve, OES_SEGS, 22, oesR, { capStart: true, lumen: new THREE.Color('#7a3434'), wall: new THREE.Color('#f6dcd4') });
  addMesh(oesGeo, 'oes', anat);

  // ── the food's route (for peristalsis and the bolus): oesophagus → remnant → J → duodenum ──
  const route = [];
  for (let k = 0; k <= 40; k++) route.push(oesCurve.getPointAt((k / 40) * 0.9));
  const iCard = rowOf(oesCurve.getPointAt(1));
  for (let i = iCard; i <= iC1; i++) route.push(P1[i].clone());
  for (let i = iC2 + 1; i <= iN + 30; i++) route.push(P1[i].clone());
  const routeCum = new Float32Array(route.length);
  for (let k = 1; k < route.length; k++) routeCum[k] = routeCum[k - 1] + route[k].distanceTo(route[k - 1]);
  const ROUTE_L = routeCum[route.length - 1];
  const routeX = new Float32Array(route.length * 3);
  route.forEach((p, k) => routeX.set([p.x, p.y, p.z], k * 3));
  const nearestRouteS = (p) => { let b = 0, bd = Infinity; for (let k = 0; k < route.length; k++) { const d = route[k].distanceToSquared(p); if (d < bd) { bd = d; b = k; } } return routeCum[b]; };
  // path coordinate per vertex: rows of the remnant/duodenum by their joined (post-op) position
  const setAS = (geo, rowS, radial, extra = 0) => {
    const cnt = geo.attributes.position.count;
    const a = new Float32Array(cnt);
    for (let v = 0; v < cnt; v++) a[v] = rowS(Math.min(Math.floor(v / radial), rowS.max));
    geo.setAttribute('aS', new THREE.BufferAttribute(a, 1));
  };
  {
    const sCard = nearestRouteS(P1[iCard]);
    const remS = (r) => (r < iCard ? sCard - (iCard - r) * ds * 0.6 : nearestRouteS(P1[r]));
    remS.max = remnant.n - 1;
    setAS(remnant.geo, remS, RADIAL);
    const duoS = (r) => nearestRouteS(P1[iC2 + r]) + (r > iN - iC2 + 30 ? (r - (iN - iC2 + 30)) * ds : 0);
    duoS.max = duo.n - 1;
    setAS(duo.geo, duoS, 26);
    const cnt = oesGeo.attributes.position.count, a = new Float32Array(cnt);
    const ring = 23;
    for (let v = 0; v < cnt; v++) a[v] = v < (OES_SEGS + 1) * ring ? (Math.floor(v / ring) / OES_SEGS) * oesCurve.getLength() * 0.97 : 0; // cap at the top
    oesGeo.setAttribute('aS', new THREE.BufferAttribute(a, 1));
  }
  const routeAt = (s, out) => {
    if (s <= 0) return out.set(routeX[0], routeX[1], routeX[2]);
    let lo = 0, hi = route.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (routeCum[m] < s) lo = m; else hi = m; }
    const w = clamp01((s - routeCum[lo]) / (routeCum[hi] - routeCum[lo] || 1));
    return out.set(lerp(routeX[lo * 3], routeX[hi * 3], w), lerp(routeX[lo * 3 + 1], routeX[hi * 3 + 1], w), lerp(routeX[lo * 3 + 2], routeX[hi * 3 + 2], w));
  };

  // ── tumour: a pale, slightly raised growth on the front wall of the antrum ──
  {
    const iT = Math.round(lerp(rowOfCtrl(6), rowOfCtrl(7), 0.35));
    const t = T0[iT], b = Z.clone().addScaledVector(t, -Z.dot(t)).normalize(), nn = V(0, 0, 0).crossVectors(b, t);
    const th = 1.95; // front wall, leaning towards the lesser curvature
    const dir = nn.clone().multiplyScalar(Math.cos(th)).add(b.clone().multiplyScalar(Math.sin(th))).normalize();
    const rr = Math.hypot(A0[iT] * Math.cos(th), B0[iT] * Math.sin(th));
    const c = G[iT].clone().addScaledVector(dir, rr - 0.28);
    let g = new THREE.IcosahedronGeometry(1, 9);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVerts(g);
    const p = g.attributes.position;
    const e1 = t.clone(), e2 = V(0, 0, 0).crossVectors(dir, e1).normalize();
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.14 * noise3(x * 1.8, y * 1.8, z * 1.8, 61) + 0.06 * noise3(x * 4, y * 4, z * 4, 62);
      const lx = x * 1.45 * k, ly = y * 1.2 * k, lz = z * 0.62 * k;
      p.setXYZ(i, c.x + e1.x * lx + e2.x * ly + dir.x * lz, c.y + e1.y * lx + e2.y * ly + dir.y * lz, c.z + e1.z * lx + e2.z * ly + dir.z * lz);
      const m = 0.94 + 0.08 * noise3(x * 3, y * 3, z * 3, 63);
      col[i * 3] = m; col[i * 3 + 1] = m * 0.97; col[i * 3 + 2] = m * 0.95;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    addMesh(g, 'tumour', resIn);
  }

  // ── cut lines: dashed rings drawn where the stomach and duodenum will be divided ──
  const dashGeo = track(new THREE.CapsuleGeometry(0.1, 0.36, 2, 8));
  const cutRings = [iC1, iC2].map((i) => {
    const t = T0[i], b = Z.clone().addScaledVector(t, -Z.dot(t)).normalize(), nn = V(0, 0, 0).crossVectors(b, t);
    const circ = Math.PI * (A0[i] + B0[i]);
    const count = Math.max(10, Math.round(circ / 0.78));
    const P = [], Q = [], m = new THREE.Matrix4();
    for (let k = 0; k < count; k++) {
      const th = ((k + 0.5) / count) * TAU;
      const radial = nn.clone().multiplyScalar(Math.cos(th) / A0[i]).add(b.clone().multiplyScalar(Math.sin(th) / B0[i])).normalize();
      const p = G[i].clone().addScaledVector(nn, (A0[i] + 0.1) * Math.cos(th)).addScaledVector(b, (B0[i] + 0.1) * Math.sin(th));
      const tan = nn.clone().multiplyScalar(-A0[i] * Math.sin(th)).add(b.clone().multiplyScalar(B0[i] * Math.cos(th))).normalize();
      const side = V(0, 0, 0).crossVectors(tan, radial);
      m.makeBasis(side, tan, radial);
      P.push(p); Q.push(new THREE.Quaternion().setFromRotationMatrix(m));
    }
    return { P, Q, count };
  });
  const NDASH = cutRings[0].count + cutRings[1].count;
  const dashes = new THREE.InstancedMesh(dashGeo, M.line, NDASH);
  dashes.userData.partId = 'cut-line';
  dashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  anat.add(dashes);

  // ── staple rows along each sealed end (instanced tiny staples) ──
  const stapleGeo = track(new THREE.CapsuleGeometry(0.07, 0.36, 2, 6));
  const NST = 13; // per face, per seam
  const staplesLive = new THREE.InstancedMesh(stapleGeo, M.staple, NST * 2 * 2); // remnant end + duodenal start (move when joined)
  staplesLive.userData.partId = 'cut-line';
  staplesLive.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  anat.add(staplesLive);
  const staplesR = new THREE.InstancedMesh(stapleGeo, M.stapleR, NST * 2 * 2); // both ends of the removed part
  staplesR.userData.partId = 'cut-line';
  staplesR.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  resIn.add(staplesR);
  const mTmp = new THREE.Matrix4(), qTmp = new THREE.Quaternion(), vTmp = V(0, 0, 0), sTmp = V(1, 1, 1);
  const sT = V(0, 0, 0), sB = V(0, 0, 0), sN = V(0, 0, 0), sP = V(0, 0, 0), bas = new THREE.Matrix4();
  // write NST×2 staples along the seam at row i (moving towards the piece by `inward`), scaled by `sc`
  const placeSeam = (im, slot, i, post, inward, sc) => {
    sP.lerpVectors(G[i], P1[i], post);
    sT.lerpVectors(T0[i], T1[i], post).normalize();
    sB.copy(Z).addScaledVector(sT, -Z.dot(sT)).normalize();
    sN.crossVectors(sB, sT);
    const a = lerp(A0[i], A1[i], post) * 1.22;
    bas.makeBasis(sT, sN, sB);
    qTmp.setFromRotationMatrix(bas);
    sTmp.setScalar(Math.max(sc, 1e-4));
    for (let f = 0; f < 2; f++) for (let k = 0; k < NST; k++) {
      const u = ((k + 0.5) / NST) * 2 - 1;
      vTmp.copy(sP).addScaledVector(sN, u * a * 0.88).addScaledVector(sT, inward * (0.2 + 0.12 * (k % 2))).addScaledVector(sB, (f ? -1 : 1) * 0.07);
      mTmp.compose(vTmp, qTmp, sTmp);
      im.setMatrixAt(slot + f * NST + k, mTmp);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  placeSeam(staplesR, 0, iC1, 0, 1, 1);
  placeSeam(staplesR, NST * 2, iC2, 0, -1, 1);

  // ── the new connection: a soft ring with fine stitches where remnant meets duodenum ──
  const anaG = new THREE.Group(); anat.add(anaG);
  {
    const t = T1[iC1];
    const ring = new THREE.TorusGeometry(RJ + 0.06, 0.2, 12, 48);
    addMesh(ring, 'ring', anaG);
    const st = new THREE.InstancedMesh(track(new THREE.CapsuleGeometry(0.05, 0.42, 2, 5)), M.suture, 20);
    st.userData.partId = 'anastomosis';
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU;
      vTmp.set(Math.cos(a) * (RJ + 0.24), Math.sin(a) * (RJ + 0.24), 0);
      qTmp.setFromAxisAngle(Z, 0);
      mTmp.compose(vTmp, qTmp.setFromUnitVectors(V(0, 1, 0), Z), sTmp.set(1, 1, 1));
      st.setMatrixAt(k, mTmp);
    }
    anaG.add(st);
    anaG.position.copy(J);
    anaG.quaternion.setFromUnitVectors(Z, t);
  }

  // ── food boluses (small mouthfuls) ──
  const foodGeo = new THREE.IcosahedronGeometry(1, 3);
  {
    const p = foodGeo.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.12 * noise3(x * 2.2, y * 2.2, z * 2.2, 71);
      p.setXYZ(i, x * 0.72 * k, y * 0.62 * k, z * 0.66 * k);
      col.set([1, 0.97, 0.92], i * 3);
    }
    foodGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    foodGeo.computeVertexNormals();
  }
  const boluses = [addMesh(foodGeo, 'food', anat), new THREE.Mesh(foodGeo, M.food)];
  boluses[1].userData.partId = 'food';
  anat.add(boluses[1]);

  // ── presentation, then normalise: ~1 unit tall, centred ──
  anat.rotation.set(0.04, -0.18, 0);
  const collapse = (o) => { o.visible = false; o.scale.setScalar(1e-4); };
  for (const b of boluses) collapse(b);
  anaG.visible = false;
  const box = new THREE.Box3().setFromObject(body);
  collapse(anaG);
  const size = box.getSize(V(0, 0, 0)), ctr = box.getCenter(V(0, 0, 0));
  const SC = 1 / Math.max(size.x, size.y, size.z);
  body.scale.setScalar(SC);
  body.position.copy(ctr).multiplyScalar(-SC);
  const fixBounds = (im) => { im.boundingBox = box.clone(); im.boundingSphere = box.getBoundingSphere(new THREE.Sphere()); };
  fixBounds(dashes); fixBounds(staplesLive); fixBounds(staplesR);

  // ── procedure state as a pure function of the timeline T ∈ [0, 4] ──
  const St = { draw: 0, lineFade: 1, seal: 0, gap: 0, away: 0, post: 0, join: 0, clear: 0, peri: 0 };
  const evalState = (T) => {
    const s = (a, b) => sstep(a, b, T);
    St.draw = s(0.04, 0.42);
    St.lineFade = 1 - s(0.46, 0.58);
    St.seal = s(0.45, 0.82);
    St.gap = s(0.5, 0.95);
    St.away = s(1.05, 1.9);
    St.post = s(2.05, 2.85);
    St.join = s(2.62, 2.95);
    St.clear = s(3.05, 3.55);
    St.peri = s(3.15, 3.8);
  };
  evalState(0);

  const gapDir = V(-0.3, -0.75, 0.9).normalize();
  const awayDir = V(0.5, -4.5, 7.0);
  const resPivot = G[Math.round((iC1 + iC2) / 2)].clone();
  resG.position.copy(resPivot); resIn.position.copy(resPivot).negate();
  const rotAx = V(1, 0.2, 0).normalize();
  let lastT = -1;
  const applyState = (T) => {
    if (T === lastT) return;
    lastT = T;
    // dashed cut lines, drawn in turn, then replaced by the staple lines
    let slot = 0;
    for (let r = 0; r < 2; r++) {
      const ring = cutRings[r];
      const prog = clamp01(St.draw * 2 - r * 0.85) * (ring.count + 2);
      for (let k = 0; k < ring.count; k++) {
        sTmp.setScalar(Math.max(clamp01(prog - k) * St.lineFade, 1e-4));
        mTmp.compose(ring.P[k], ring.Q[k], sTmp);
        dashes.setMatrixAt(slot++, mTmp);
      }
    }
    dashes.instanceMatrix.needsUpdate = true;
    dashes.visible = St.draw > 0 && St.lineFade > 0;
    // divided ends pinch closed into stapled seams; they open again as the remnant meets the duodenum
    const sealLive = St.seal * (1 - St.join);
    remnant.refill(St.post, 0, sealLive);
    duo.refill(St.post, sealLive, 0);
    resec.refill(0, St.seal, St.seal);
    const stSc = sstep(0.35, 0.9, St.seal) * (1 - sstep(0, 0.6, St.join));
    placeSeam(staplesLive, 0, iC1, St.post, -1, stSc);
    placeSeam(staplesLive, NST * 2, iC2, St.post, 1, stSc);
    staplesLive.visible = stSc > 0.001;
    staplesR.visible = St.seal > 0.3 && St.away < 1;
    for (let k = 0; k < NST * 4 && St.seal < 1; k++) {
      staplesR.getMatrixAt(k, mTmp);
      mTmp.decompose(vTmp, qTmp, sTmp);
      sTmp.setScalar(Math.max(sstep(0.35, 0.9, St.seal), 1e-4));
      mTmp.compose(vTmp, qTmp, sTmp);
      staplesR.setMatrixAt(k, mTmp);
    }
    staplesR.instanceMatrix.needsUpdate = true;
    // the removed part: eases away from the cuts, then is lifted out and fades
    if (St.away < 0.999) {
      resG.visible = true; resG.scale.setScalar(1);
      resG.position.copy(resPivot).addScaledVector(gapDir, 0.9 * St.gap).addScaledVector(awayDir, St.away);
      resG.quaternion.setFromAxisAngle(rotAx, 0.35 * St.away);
      const f = 1 - sstep(0.35, 1, St.away);
      M.resected.userData.hl.fade = M.tumour.userData.hl.fade = M.stapleR.userData.hl.fade = f;
      M.resected.depthWrite = M.tumour.depthWrite = f > 0.98;
    } else collapse(resG);
    // the new connection
    if (St.join > 0.001) {
      anaG.visible = true;
      anaG.scale.setScalar(lerp(0.6, 1, St.join));
      anaG.position.copy(J);
    } else collapse(anaG);
    // see-through walls so the food can be followed
    see.uSee.value = 0.9 * St.clear;
    peri.uPeri.value = 0.55 * St.peri;
  };
  applyState(0);

  // ── timeline ──
  let T = 0, target = 0;
  const CYCLE = ROUTE_L + 6;
  const update = (dt, t) => {
    if (T !== target) {
      const d = target - T;
      const speed = (d > 0 ? 0.5 : 1.6) * Math.max(1, Math.abs(d) * 0.8); // ≈2 s per step forward
      T = Math.abs(d) <= speed * dt ? target : T + Math.sign(d) * speed * dt;
      evalState(T);
      applyState(T);
    }
    // food: two small mouthfuls, one after the other, riding a gentle peristaltic wave
    if (St.peri > 0.001) {
      for (let b = 0; b < 2; b++) {
        const s = ((t * 3.2 + b * CYCLE * 0.5) % CYCLE) - 2;
        const k = sstep(-2, 1, s) * (1 - sstep(ROUTE_L - 3, ROUTE_L, s)) * St.peri;
        const m = boluses[b];
        if (k > 0.001) { m.visible = true; routeAt(s, m.position); m.scale.setScalar(k); }
        else collapse(m);
        if (b === 0) peri.uBolus.value.x = s; else peri.uBolus.value.y = s;
      }
      peri.uWave.value = t * 1.6;
    } else if (boluses[0].visible || boluses[1].visible) { collapse(boluses[0]); collapse(boluses[1]); }
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
      dashes.dispose(); staplesLive.dispose(); staplesR.dispose();
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

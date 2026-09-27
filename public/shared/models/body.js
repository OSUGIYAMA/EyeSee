// Life-size, gender-neutral body for "where does it hurt?".
//
// The figure is built procedurally from signed distance fields (SDF): smooth, blended
// capsules / ellipsoids / round cones are polygonised with surface nets and the vertices
// are projected onto the exact surface with SDF-gradient normals, so the skin is smooth
// with no visible faceting. Hands, feet and head are meshed at a finer resolution and
// meet the body at subtle mannequin-style joint lines (wrist, ankle, nape).
//
// Real scale in metres: ~1.70 m tall, feet on y = 0, facing +Z, centred on x = z = 0.
// The patient's anatomical LEFT is at +X (viewer's right when facing the figure).
import * as THREE from 'three';

export const meta = {
  id: 'body',
  label: { en: 'Life-size body', ja: '人体（等身大）' },
  summary: {
    en: 'A life-size, gender-neutral figure. Point to where it hurts — each area is named for the doctor, and pain points can be pinned on the body.',
    ja: '等身大の人体モデル。痛む場所を指さすと部位の名前が医師に伝わり、痛みの位置に印をつけられます。',
  },
  kind: 'body',
};

// ---------------------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------------------
const LR = [
  ['shoulder', 'shoulder', '肩', 'Top of the shoulder and shoulder joint.', '肩の上・肩の関節のあたり'],
  ['upper-arm', 'upper arm', '上腕', 'Upper arm between the shoulder and the elbow.', '肩からひじまでの腕（二の腕）'],
  ['elbow', 'elbow', 'ひじ', 'Elbow joint, front and back.', 'ひじの関節（内側・外側）'],
  ['forearm', 'forearm', '前腕', 'Forearm between the elbow and the wrist.', 'ひじから手首までの腕'],
  ['hand', 'hand', '手', 'Wrist, hand and fingers.', '手首・手のひら・手の甲・指'],
  ['hip', 'hip / groin', '股関節・鼠径部', 'Hip joint, side of the hip and groin (inguinal) area.', '股関節・腰の横・足の付け根（鼠径部）'],
  ['thigh', 'thigh', '太もも', 'Thigh, front, back and inner side.', '太もも（前・後ろ・内側）'],
  ['knee', 'knee', 'ひざ', 'Knee joint, including the back of the knee.', 'ひざ（ひざの裏を含む）'],
  ['shin', 'lower leg', 'すね・ふくらはぎ', 'Lower leg: shin and calf.', 'ひざから足首まで（すね・ふくらはぎ）'],
  ['foot', 'foot', '足', 'Ankle, foot and toes.', '足首・足の甲・足の裏・つま先'],
];
const REGIONS = [
  ['head', 'Head', '頭', 'Forehead, top, sides and back of the head.', 'おでこ・頭のてっぺん・側頭部・後頭部'],
  ['face', 'Face', '顔', 'Eyes, nose, cheeks, mouth and jaw.', '目・鼻・ほお・口・あご'],
  ['neck', 'Neck', '首', 'Throat, sides and back of the neck.', 'のど・首の横・うなじ'],
  ['chest-center', 'Center of chest', '胸の中央', 'Middle of the chest over the breastbone (sternum).', '胸骨のあたり、胸の真ん中'],
  ['chest-left', 'Left chest', '左胸', 'Left side of the chest, including the side under the arm.', '胸の左側（わきの下の側面を含む）'],
  ['chest-right', 'Right chest', '右胸', 'Right side of the chest, including the side under the arm.', '胸の右側（わきの下の側面を含む）'],
  ['epigastric', 'Upper middle abdomen (epigastric)', 'みぞおち', 'Pit of the stomach, just below the breastbone.', '胸骨のすぐ下、おなかの上の真ん中'],
  ['ruq', 'Right upper abdomen (RUQ)', '右上腹部', 'Below the right ribs (liver / gallbladder area).', '右の肋骨の下（肝臓・胆のうのあたり）'],
  ['luq', 'Left upper abdomen (LUQ)', '左上腹部', 'Below the left ribs (stomach / spleen area).', '左の肋骨の下（胃・脾臓のあたり）'],
  ['umbilical', 'Around the navel (periumbilical)', 'へその周り', 'Middle of the abdomen around the belly button.', 'おへその周り'],
  ['rlq', 'Right lower abdomen (RLQ)', '右下腹部', 'Right lower abdomen (appendix area).', 'おなかの右下（虫垂のあたり）'],
  ['llq', 'Left lower abdomen (LLQ)', '左下腹部', 'Left lower abdomen (sigmoid colon area).', 'おなかの左下（S状結腸のあたり）'],
  ['suprapubic', 'Lower middle abdomen (suprapubic)', '下腹部', 'Above the pubic bone (bladder / uterus area).', '恥骨の上、おなかの下の真ん中（膀胱のあたり）'],
  ...LR.flatMap(([id, en, ja, ien, ija]) => [
    [`${id}-left`, `Left ${en}`, `左${ja}`, ien.replace(/^./, (c) => `Left side — ${c.toLowerCase()}`), `左側の${ija}`],
    [`${id}-right`, `Right ${en}`, `右${ja}`, ien.replace(/^./, (c) => `Right side — ${c.toLowerCase()}`), `右側の${ija}`],
  ]),
  ['upper-back', 'Upper back', '背中（上部）', 'Between and around the shoulder blades.', '肩甲骨のあたり・背中の上のほう'],
  ['lower-back', 'Lower back', '腰', 'Lumbar area of the back, above the buttocks.', '背中の下のほう、おしりの上（腰）'],
  ['flank-left', 'Left flank', '左わき腹', 'Left side / back between the ribs and the hip (kidney area).', '左の肋骨と骨盤の間の横〜背中側（腎臓のあたり）'],
  ['flank-right', 'Right flank', '右わき腹', 'Right side / back between the ribs and the hip (kidney area).', '右の肋骨と骨盤の間の横〜背中側（腎臓のあたり）'],
  ['buttocks', 'Buttocks', 'おしり', 'Buttocks and tailbone area.', 'おしり・尾てい骨のあたり'],
];
const PARTS = REGIONS.map(([id, en, ja, ien, ija]) => ({ id, label: { en, ja }, info: { en: ien, ja: ija } }));
const RIDX = Object.fromEntries(PARTS.map((p, i) => [p.id, i]));
const SEGMENTS = ['torso', 'neck', 'arm-left', 'arm-right', 'leg-left', 'leg-right', 'head', 'hand-left', 'hand-right', 'foot-left', 'foot-right'];
const SIDX = Object.fromEntries(SEGMENTS.map((s, i) => [s, i]));

// ---------------------------------------------------------------------------------------
// Small vector helpers (plain arrays, build time only)
// ---------------------------------------------------------------------------------------
const deg = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const orth = (v, axis) => nrm(sub(v, mul(axis, dot(v, axis))));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------
// SDF primitives — each returns a closure (x, y, z) => signed distance (approx.)
// ---------------------------------------------------------------------------------------
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

function sphere(c, r) {
  const [cx, cy, cz] = c;
  return (x, y, z) => { const dx = x - cx, dy = y - cy, dz = z - cz; return Math.sqrt(dx * dx + dy * dy + dz * dz) - r; };
}
// basis = [u, v, w] orthonormal axes matching radii [ru, rv, rw]; omitted → world axes
function ellipsoid(c, r, basis) {
  const [cx, cy, cz] = c, [ra, rb, rc] = r;
  const [u, v, w] = basis || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const ia = 1 / ra, ib = 1 / rb, ic = 1 / rc, ia2 = ia * ia, ib2 = ib * ib, ic2 = ic * ic, rmin = Math.min(ra, rb, rc);
  return (x, y, z) => {
    const dx = x - cx, dy = y - cy, dz = z - cz;
    const a = dx * u[0] + dy * u[1] + dz * u[2], b = dx * v[0] + dy * v[1] + dz * v[2], cc = dx * w[0] + dy * w[1] + dz * w[2];
    const k0 = Math.sqrt(a * a * ia2 + b * b * ib2 + cc * cc * ic2);
    const k1 = Math.sqrt(a * a * ia2 * ia2 + b * b * ib2 * ib2 + cc * cc * ic2 * ic2);
    return k1 < 1e-12 ? -rmin : (k0 * (k0 - 1)) / k1;
  };
}
// Round cone (capsule with different end radii). Optional flattening of the cross-section
// along `flat` (unit vector ⟂ axis) by factor f (<1) — used for wrists / forearms.
function roundCone(A, B, r1, r2, flat, f = 1) {
  const [ax, ay, az] = A, bx = B[0] - ax, by = B[1] - ay, bz = B[2] - az;
  const l2 = bx * bx + by * by + bz * bz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2, srr = Math.sign(rr) * rr * rr;
  const fx = flat ? flat[0] : 0, fy = flat ? flat[1] : 0, fz = flat ? flat[2] : 0, s = flat ? 1 / f - 1 : 0, scl = flat ? f : 1;
  return (x, y, z) => {
    let px = x - ax, py = y - ay, pz = z - az;
    if (s) { const t = (px * fx + py * fy + pz * fz) * s; px += fx * t; py += fy * t; pz += fz * t; }
    const yy = px * bx + py * by + pz * bz, zz = yy - l2;
    const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2, k = srr * x2;
    let d;
    if (Math.sign(zz) * a2 * z2 > k) d = Math.sqrt(x2 + z2) * il2 - r2;
    else if (Math.sign(yy) * a2 * y2 < k) d = Math.sqrt(x2 + y2) * il2 - r1;
    else d = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    return d * scl;
  };
}
const capsule = (A, B, r) => roundCone(A, B, r, r);
function roundBox(c, half, r, basis) {
  const [cx, cy, cz] = c, [hx, hy, hz] = half;
  const [u, v, w] = basis || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return (x, y, z) => {
    const dx = x - cx, dy = y - cy, dz = z - cz;
    const qx = Math.abs(dx * u[0] + dy * u[1] + dz * u[2]) - hx;
    const qy = Math.abs(dx * v[0] + dy * v[1] + dz * v[2]) - hy;
    const qz = Math.abs(dx * w[0] + dy * w[1] + dz * w[2]) - hz;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}
// basis whose 2nd axis (v) is `along`, 1st axis (u) is `side` made orthogonal
function frame(along, side) { const v = nrm(along), u = orth(side, v); return [u, v, cross(u, v)]; }
// smooth union of a list of [fn, k] (first k ignored)
function blend(list) {
  return (x, y, z) => {
    let d = list[0][0](x, y, z);
    for (let i = 1; i < list.length; i++) d = smin(d, list[i][0](x, y, z), list[i][1]);
    return d;
  };
}

// ---------------------------------------------------------------------------------------
// Skeleton / landmarks (left side, +X). The right side is the mirror image (x → -x).
// ---------------------------------------------------------------------------------------
const SH = [0.170, 1.380, -0.012];                               // shoulder joint
const DIR_U = nrm([Math.sin(21 * deg), -Math.cos(21 * deg), -0.02]); // upper-arm direction (A-pose)
const LEN_U = 0.298;
const EL = add(SH, mul(DIR_U, LEN_U));                            // elbow
const DIR_F = nrm([Math.sin(24 * deg), -Math.cos(24 * deg), 0.15]);  // forearm direction (slight flexion)
const LEN_F = 0.25;
const WR = add(EL, mul(DIR_F, LEN_F));                            // wrist centre
const H_A = DIR_F;                                                // hand: toward fingertips
const H_N = orth([-1, 0, -0.3], H_A);                             // palm normal (faces the thigh, a bit back)
const H_T = cross(H_N, H_A);                                      // thumb direction (forward)
const HIP = [0.092, 0.885, -0.004];
const KNEE = [0.099, 0.478, 0.006];
const ANK = [0.104, 0.088, -0.018];
const TOE_OUT = 8 * deg;
const F_Z = [Math.sin(TOE_OUT), 0, Math.cos(TOE_OUT)];            // foot forward
const F_X = [Math.cos(TOE_OUT), 0, -Math.sin(TOE_OUT)];           // foot lateral
const F_O = [ANK[0], 0, ANK[2]];                                  // foot origin (on the floor, under the ankle)
const NAVEL_Y = 1.005;

// canonical hand (left): x = thumb side, y = toward the forearm (fingers at -y), z = palm normal
const handToWorld = (p) => add(WR, add(add(mul(H_T, p[0]), mul(H_A, -p[1])), mul(H_N, p[2])));
const worldToHand = (x, y, z, out) => {
  const dx = x - WR[0], dy = y - WR[1], dz = z - WR[2];
  out[0] = dx * H_T[0] + dy * H_T[1] + dz * H_T[2];
  out[1] = -(dx * H_A[0] + dy * H_A[1] + dz * H_A[2]);
  out[2] = dx * H_N[0] + dy * H_N[1] + dz * H_N[2];
  return out;
};
// canonical foot (left): x = lateral, y = up, z = toward the toes
const footToWorld = (p) => add(F_O, add(add(mul(F_X, p[0]), [0, p[1], 0]), mul(F_Z, p[2])));
const worldToFoot = (x, y, z, out) => {
  const dx = x - F_O[0], dz = z - F_O[2];
  out[0] = dx * F_X[0] + dz * F_X[2]; out[1] = y; out[2] = dx * F_Z[0] + dz * F_Z[2];
  return out;
};

// ---------------------------------------------------------------------------------------
// Body SDF (torso + neck + arms + legs). Symmetric: evaluated on |x|.
// Groups: 0 torso, 1 neck, 2 arm, 3 leg  (side comes from the sign of x)
// ---------------------------------------------------------------------------------------
function buildBodySDF() {
  const torso = blend([
    [ellipsoid([0, 1.235, -0.005], [0.147, 0.19, 0.102]), 0],             // rib cage
    [ellipsoid([0, 1.338, -0.018], [0.168, 0.07, 0.083]), 0.05],          // shoulder girdle
    [ellipsoid([0, 1.045, 0.004], [0.131, 0.16, 0.091]), 0.06],           // abdomen
    [ellipsoid([0, 0.952, 0.02], [0.12, 0.085, 0.08]), 0.05],             // lower belly
    [ellipsoid([0, 0.905, -0.008], [0.155, 0.112, 0.096]), 0.06],         // pelvis
    [ellipsoid([0.064, 0.868, -0.046], [0.077, 0.095, 0.074]), 0.04],     // buttock
    [ellipsoid([0.066, 1.268, 0.04], [0.073, 0.058, 0.05]), 0.045],       // pectoral (subtle)
    [capsule([0.0, 1.418, -0.03], [0.14, 1.387, -0.027], 0.041), 0.05],   // trapezius
    [ellipsoid([0.072, 1.225, -0.045], [0.074, 0.14, 0.058]), 0.05],      // scapula / lats
  ]);
  const neckCone = roundCone([0, 1.36, -0.022], [0, 1.535, -0.008], 0.058, 0.051);
  const cutN = nrm([0, 1, 0.33]);
  const neck = (x, y, z) => smax(neckCone(x, y, z), (y - 1.50) * cutN[1] + z * cutN[2], 0.003);

  const armFr = frame(DIR_U, [1, 0, 0]);
  const foreFr = frame(DIR_F, H_N); // u ≈ palm normal, w ≈ thumb axis
  const armRaw = blend([
    [ellipsoid(add(SH, [0.006, -0.014, 0.0]), [0.049, 0.078, 0.052], armFr), 0],   // deltoid
    [roundCone(SH, EL, 0.043, 0.033), 0.03],
    [ellipsoid(add(lerp3(SH, EL, 0.5), [0, 0, 0.004]), [0.04, 0.11, 0.043], armFr), 0.03], // biceps / triceps
    [sphere(EL, 0.034), 0.02],
    [roundCone(EL, WR, 0.035, 0.0245, H_N, 0.74), 0.02],
    [ellipsoid(add(EL, mul(DIR_F, 0.075)), [0.035, 0.1, 0.042], foreFr), 0.03],     // forearm muscles
  ]);
  const arm = (x, y, z) => smax(armRaw(x, y, z), (x - WR[0]) * DIR_F[0] + (y - WR[1]) * DIR_F[1] + (z - WR[2]) * DIR_F[2], 0.003);

  const legFr = frame(sub(KNEE, HIP), [1, 0, 0]);
  const shinFr = frame(sub(ANK, KNEE), [1, 0, 0]);
  const legRaw = blend([
    [roundCone(HIP, KNEE, 0.083, 0.052), 0],
    [ellipsoid(add(lerp3(HIP, KNEE, 0.4), [0.004, 0, 0.01]), [0.074, 0.19, 0.074], legFr), 0.05], // quadriceps
    [sphere(KNEE, 0.051), 0.03],
    [ellipsoid(add(KNEE, [0, 0.006, 0.043]), [0.027, 0.031, 0.017]), 0.02],                      // kneecap
    [roundCone(KNEE, ANK, 0.049, 0.031), 0.03],
    [ellipsoid(add(lerp3(KNEE, ANK, 0.27), [0.003, 0, -0.024]), [0.047, 0.115, 0.047], shinFr), 0.04], // calf
  ]);
  const leg = (x, y, z) => smax(legRaw(x, y, z), 0.105 - y, 0.003);

  const g = new Float64Array(4);
  const sdf = (x, y, z) => {
    const ax = x < 0 ? -x : x;
    const t = torso(ax, y, z), n = neck(ax, y, z);
    // cheap bounding tests keep far limbs from being evaluated
    const a = (ax > 0.1 && y > 0.6) ? arm(ax, y, z) : 1;
    const l = (y < 1.05) ? leg(ax, y, z) : 1;
    g[0] = t; g[1] = n; g[2] = a; g[3] = l;
    return smin(smin(smin(t, n, 0.04), a, 0.03), l, 0.05);
  };
  sdf.group = () => { let m = 0; for (let i = 1; i < 4; i++) if (g[i] < g[m]) m = i; return m; };
  return sdf;
}

function buildHeadSDF() {
  const earFr = frame([0, Math.cos(14 * deg), -Math.sin(14 * deg)], [1, 0, 0]);
  const parts = blend([
    [ellipsoid([0, 1.612, -0.012], [0.077, 0.092, 0.097]), 0],                  // cranium
    [ellipsoid([0, 1.558, 0.022], [0.061, 0.078, 0.072]), 0.045],               // face mass
    [capsule([0.047, 1.522, -0.008], [0.02, 1.483, 0.058], 0.017), 0.025],       // jaw
    [ellipsoid([0, 1.481, 0.07], [0.021, 0.019, 0.018]), 0.02],                 // chin
    [sphere([0.041, 1.571, 0.057], 0.021), 0.025],                              // cheekbone
    [capsule([0, 1.607, 0.083], [0.04, 1.609, 0.071], 0.012), 0.018],           // brow
  ]);
  const socket = sphere([0.031, 1.588, 0.094], 0.0165);
  const lid = ellipsoid([0.031, 1.586, 0.081], [0.016, 0.012, 0.011]);
  const nose = roundCone([0, 1.603, 0.088], [0, 1.556, 0.107], 0.0075, 0.011);
  const ala = sphere([0.012, 1.555, 0.097], 0.0085);
  const lips = ellipsoid([0, 1.522, 0.087], [0.021, 0.0085, 0.009]);
  const ear = ellipsoid([0.077, 1.585, -0.01], [0.011, 0.031, 0.019], earFr);
  const stub = roundCone([0, 1.41, -0.018], [0, 1.535, -0.008], 0.0535, 0.0485);
  return (x, y, z) => {
    const ax = x < 0 ? -x : x;
    let d = parts(ax, y, z);
    d = smax(d, -socket(ax, y, z), 0.012);
    d = smin(d, lid(ax, y, z), 0.006);
    d = smin(d, nose(ax, y, z), 0.012);
    d = smin(d, ala(ax, y, z), 0.008);
    d = smin(d, lips(ax, y, z), 0.008);
    d = smin(d, ear(ax, y, z), 0.008);
    return smin(d, stub(ax, y, z), 0.03);
  };
}

function buildHandSDF() {
  // wrist stub: sits ~1.5 mm inside the forearm and continues the flattened wrist section
  const stub = roundCone([0, 0.05, 0], [0, 0, 0], 0.0228, 0.0228, [0, 0, 1], 0.74);
  const palm = blend([
    [roundBox([0, -0.05, 0.001], [0.029, 0.036, 0.0035], 0.0105), 0],
    [stub, 0.025],
    [ellipsoid([0.021, -0.037, 0.009], [0.017, 0.026, 0.012]), 0.016],      // thenar
    [ellipsoid([-0.026, -0.053, 0.005], [0.011, 0.034, 0.011]), 0.012],     // hypothenar
  ]);
  const fingers = [];
  // [x, y, spread°, [phalanx lengths], [flex° MCP, PIP, DIP], radius scale]
  const defs = [
    [0.027, -0.093, 5, [0.039, 0.023, 0.019], [8, 16, 10], 1.0],
    [0.009, -0.095, 1, [0.043, 0.026, 0.021], [10, 20, 12], 1.02],
    [-0.009, -0.093, -3, [0.041, 0.025, 0.02], [12, 24, 14], 0.97],
    [-0.026, -0.087, -8, [0.031, 0.019, 0.018], [15, 28, 15], 0.85],
  ];
  for (const [fx, fy, spread, lens, flex, rs] of defs) {
    let p = [fx, fy, 0.0], th = 0;
    const radii = [0.0093, 0.0086, 0.0079, 0.0069].map((r) => r * rs);
    const segs = [];
    for (let i = 0; i < 3; i++) {
      th += flex[i] * deg;
      const d = [Math.sin(spread * deg) * Math.cos(th), -Math.cos(spread * deg) * Math.cos(th), Math.sin(th)];
      const q = add(p, mul(d, lens[i]));
      segs.push(roundCone(p, q, radii[i], radii[i + 1]));
      p = q;
    }
    fingers.push((x, y, z) => smin(smin(segs[0](x, y, z), segs[1](x, y, z), 0.004), segs[2](x, y, z), 0.004));
  }
  const thumbPts = [[0.017, -0.01, 0.004], [0.04, -0.041, 0.02], [0.052, -0.066, 0.033], [0.058, -0.087, 0.043]];
  const thumbR = [0.0135, 0.0114, 0.0098, 0.0081];
  const thumb = [0, 1, 2].map((i) => roundCone(thumbPts[i], thumbPts[i + 1], thumbR[i], thumbR[i + 1]));
  return (x, y, z) => {
    let d = palm(x, y, z);
    let t = smin(smin(thumb[0](x, y, z), thumb[1](x, y, z), 0.004), thumb[2](x, y, z), 0.004);
    d = smin(d, t, 0.018);
    for (let i = 0; i < 4; i++) d = smin(d, fingers[i](x, y, z), 0.011);
    return d;
  };
}

function buildFootSDF() {
  // ankle stub follows the shin axis, ~2 mm inside the leg surface
  const toC = (p) => worldToFoot(p[0], p[1], p[2], [0, 0, 0]);
  const tTop = (KNEE[1] - 0.175) / (KNEE[1] - ANK[1]);
  const stubTop = toC(lerp3(KNEE, ANK, tTop)), stubBot = toC(ANK);
  const stub = roundCone(stubTop, stubBot, 0.0295, 0.0295);
  const foot = blend([
    [roundCone([0, 0.095, -0.008], [0, 0.055, -0.002], 0.031, 0.034), 0],
    [sphere([0.021, 0.071, -0.011], 0.015), 0.012],                          // lateral malleolus
    [sphere([-0.018, 0.08, -0.004], 0.015), 0.012],                          // medial malleolus
    [ellipsoid([0, 0.036, -0.029], [0.031, 0.036, 0.036]), 0.025],          // heel
    [roundCone([0, 0.042, -0.012], [-0.002, 0.026, 0.118], 0.034, 0.025), 0.025],
    [ellipsoid([-0.004, 0.052, 0.045], [0.034, 0.03, 0.068]), 0.025],       // instep
    [ellipsoid([-0.003, 0.024, 0.121], [0.045, 0.024, 0.038]), 0.025],      // ball of the foot
    [roundCone([-0.024, 0.021, 0.147], [-0.027, 0.017, 0.177], 0.0135, 0.0118), 0.01], // big toe
    [ellipsoid([0.014, 0.0155, 0.162], [0.029, 0.0135, 0.026]), 0.01],      // small toes
  ]);
  return (x, y, z) => smax(smin(foot(x, y, z), stub(x, y, z), 0.02), -y, 0.006);
}

// ---------------------------------------------------------------------------------------
// Surface nets polygoniser with narrow-band sampling and exact-surface projection
// ---------------------------------------------------------------------------------------
function polygonize(f, bmin, bmax, h) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const sxy = nx * ny, N = sxy * nz;
  const F = new Float32Array(N);
  // coarse pass (every C nodes), then refine only near the surface
  const C = 4, cnx = Math.ceil((nx - 1) / C) + 1, cny = Math.ceil((ny - 1) / C) + 1, cnz = Math.ceil((nz - 1) / C) + 1;
  const CF = new Float32Array(cnx * cny * cnz);
  for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++)
    CF[i + cnx * (j + cny * k)] = f(bmin[0] + i * C * h, bmin[1] + j * C * h, bmin[2] + k * C * h);
  const thr = C * h * 1.5;
  for (let k = 0; k < nz; k++) {
    const ck = Math.round(k / C), z = bmin[2] + k * h;
    for (let j = 0; j < ny; j++) {
      const cj = Math.round(j / C), y = bmin[1] + j * h, row = cnx * (cj + cny * ck), base = nx * (j + ny * k);
      for (let i = 0; i < nx; i++) {
        const cv = CF[Math.round(i / C) + row];
        F[i + base] = (cv > thr || cv < -thr) ? cv : f(bmin[0] + i * h, y, z);
      }
    }
  }
  // one vertex per sign-changing cell
  const off = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const cellV = new Int32Array(N).fill(-1);
  const P = [];
  const cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const n0 = i + nx * j + sxy * k;
    let mask = 0;
    for (let c = 0; c < 8; c++) { cv[c] = F[n0 + off[c]]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let e = 0; e < 24; e += 2) {
      const a = EDGES[e], b = EDGES[e + 1], va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t;
      sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
      sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
      cnt++;
    }
    cellV[n0] = P.length / 3;
    P.push(bmin[0] + (i + sx / cnt) * h, bmin[1] + (j + sy / cnt) * h, bmin[2] + (k + sz / cnt) * h);
  }
  const vcount = P.length / 3;
  const pos = new Float32Array(P), nor = new Float32Array(vcount * 3);
  // project onto the true surface (2 Newton steps, clamped) and take SDF-gradient normals
  const e = h * 0.05, maxMove = h * 0.75;
  const grad = (x, y, z, out) => {
    const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
    out[0] = a - b - c + d; out[1] = -a - b + c + d; out[2] = -a + b - c + d;
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l;
    return l / (4 * e);
  };
  const gv = [0, 0, 0];
  for (let v = 0; v < vcount; v++) {
    const ox = pos[3 * v], oy = pos[3 * v + 1], oz = pos[3 * v + 2];
    let x = ox, y = oy, z = oz;
    for (let it = 0; it < 2; it++) {
      const d = f(x, y, z), gl = grad(x, y, z, gv);
      const step = d / Math.max(gl, 0.2);
      x -= gv[0] * step; y -= gv[1] * step; z -= gv[2] * step;
      const mx = x - ox, my = y - oy, mz = z - oz, ml = Math.hypot(mx, my, mz);
      if (ml > maxMove) { x = ox + (mx * maxMove) / ml; y = oy + (my * maxMove) / ml; z = oz + (mz * maxMove) / ml; }
    }
    grad(x, y, z, gv);
    pos[3 * v] = x; pos[3 * v + 1] = y; pos[3 * v + 2] = z;
    nor[3 * v] = gv[0]; nor[3 * v + 1] = gv[1]; nor[3 * v + 2] = gv[2];
  }
  // quads for sign-changing grid edges
  const T = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    const d1 = dist2(pos, a, c), d2 = dist2(pos, b, d);
    if (d1 <= d2) T.push(a, b, c, a, c, d); else T.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const n0 = i + nx * j + sxy * k, in0 = F[n0] < 0;
    if (in0 !== (F[n0 + 1] < 0)) quad(cellV[n0 - nx - sxy], cellV[n0 - sxy], cellV[n0], cellV[n0 - nx], !in0);
    if (in0 !== (F[n0 + nx] < 0)) quad(cellV[n0 - 1 - sxy], cellV[n0 - 1], cellV[n0], cellV[n0 - sxy], !in0);
    if (in0 !== (F[n0 + sxy] < 0)) quad(cellV[n0 - 1 - nx], cellV[n0 - nx], cellV[n0], cellV[n0 - 1], !in0);
  }
  return { pos, nor, idx: new Uint32Array(T), vcount };
}
function dist2(p, a, b) { const x = p[3 * a] - p[3 * b], y = p[3 * a + 1] - p[3 * b + 1], z = p[3 * a + 2] - p[3 * b + 2]; return x * x + y * y + z * z; }

// transform a canonical mesh into place (and optionally mirror it to the right side)
function placeMesh(m, toWorld, mirror) {
  const pos = new Float32Array(m.pos.length), nor = new Float32Array(m.nor.length);
  const o = toWorld([0, 0, 0]);
  for (let v = 0; v < m.vcount; v++) {
    const p = toWorld([m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]]);
    const q = sub(toWorld([m.nor[3 * v], m.nor[3 * v + 1], m.nor[3 * v + 2]]), o);
    const s = mirror ? -1 : 1;
    pos[3 * v] = p[0] * s; pos[3 * v + 1] = p[1]; pos[3 * v + 2] = p[2];
    nor[3 * v] = q[0] * s; nor[3 * v + 1] = q[1]; nor[3 * v + 2] = q[2];
  }
  const idx = new Uint32Array(m.idx);
  if (mirror) for (let t = 0; t < idx.length; t += 3) { const a = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = a; }
  return { pos, nor, idx, vcount: m.vcount };
}
function mirrorMesh(m) { return placeMesh(m, (p) => p, true); }

// vertex adjacency (CSR) for smoothing highlight weights
function adjacency(idx, vcount) {
  const deg = new Uint32Array(vcount + 1);
  for (let t = 0; t < idx.length; t += 3) { deg[idx[t]] += 2; deg[idx[t + 1]] += 2; deg[idx[t + 2]] += 2; }
  const start = new Uint32Array(vcount + 1);
  for (let v = 0; v < vcount; v++) start[v + 1] = start[v] + deg[v];
  const list = new Uint32Array(start[vcount]), fill = start.slice(0, vcount);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    list[fill[a]++] = b; list[fill[a]++] = c; list[fill[b]++] = a; list[fill[b]++] = c; list[fill[c]++] = a; list[fill[c]++] = b;
  }
  return { start, list };
}

// ---------------------------------------------------------------------------------------
// Region classification (point in object space + coarse segment)
// ---------------------------------------------------------------------------------------
const side = (x) => (x >= 0 ? 'left' : 'right');
function regionOf(x, y, z, seg) {
  const ax = Math.abs(x), s = side(x);
  switch (seg) {
    case 'head': {
      const th = Math.atan2(ax, z + 0.005) / deg;
      if (y < 1.505 && (z < 0.035 || th > 62)) return 'neck';
      if (th < 58 && y < 1.622 && y > 1.455) return 'face';
      return 'head';
    }
    case 'neck': return 'neck';
    case 'hand-left': case 'hand-right': return seg;
    case 'foot-left': case 'foot-right': return seg;
    case 'arm-left': case 'arm-right': {
      const sd = seg.slice(4);
      const px = ax - SH[0], py = y - SH[1], pz = z - SH[2];
      const t1 = clamp((px * DIR_U[0] + py * DIR_U[1] + pz * DIR_U[2]) / LEN_U, 0, 1);
      const d1 = Math.hypot(px - DIR_U[0] * LEN_U * t1, py - DIR_U[1] * LEN_U * t1, pz - DIR_U[2] * LEN_U * t1);
      const qx = ax - EL[0], qy = y - EL[1], qz = z - EL[2];
      const t2 = clamp((qx * DIR_F[0] + qy * DIR_F[1] + qz * DIR_F[2]) / LEN_F, 0, 1);
      const d2 = Math.hypot(qx - DIR_F[0] * LEN_F * t2, qy - DIR_F[1] * LEN_F * t2, qz - DIR_F[2] * LEN_F * t2);
      const L = d1 <= d2 ? t1 * LEN_U : LEN_U + t2 * LEN_F;
      if (L < 0.075 || y > 1.33) return `shoulder-${sd}`;
      if (Math.abs(L - LEN_U) < 0.045) return `elbow-${sd}`;
      return L < LEN_U ? `upper-arm-${sd}` : `forearm-${sd}`;
    }
    case 'leg-left': case 'leg-right': {
      const sd = seg.slice(4);
      if (y < 0.42) return `shin-${sd}`;
      if (y < 0.535) return `knee-${sd}`;
      const t = clamp((HIP[1] - y) / (HIP[1] - KNEE[1]), 0, 1);
      const cx = HIP[0] + (KNEE[0] - HIP[0]) * t, cz = HIP[2] + (KNEE[2] - HIP[2]) * t;
      const th = Math.atan2(ax - cx, z - cz) / deg; // 0 front, +90 lateral, -90 medial, ±180 back
      const back = Math.abs(th) > 112;
      if (back) return y > 0.752 ? 'buttocks' : `thigh-${sd}`;
      if (th > 50) return y > 0.78 ? `hip-${sd}` : `thigh-${sd}`;
      return y > 0.795 ? `hip-${sd}` : `thigh-${sd}`;
    }
    default: { // torso
      if (y > 1.40 && ax < 0.10) return 'neck';
      if ((y > 1.335 && ax > 0.112) || (y > 1.29 && ax > 0.148)) return `shoulder-${s}`;
      const th = Math.abs(Math.atan2(x / 1.45, z + 0.005)) / deg; // 0 front … 180 back
      const costal = 1.15 - 0.5 * ax;
      if (th <= 70) { // front
        if (y >= costal) return ax < 0.042 ? 'chest-center' : `chest-${s}`;
        if (ax < 0.055) return y > NAVEL_Y + 0.035 ? 'epigastric' : y > NAVEL_Y - 0.035 ? 'umbilical' : 'suprapubic';
        if (y < 0.835 + 1.1 * (ax - 0.02)) return `hip-${s}`;
        return y > NAVEL_Y ? (x < 0 ? 'ruq' : 'luq') : (x < 0 ? 'rlq' : 'llq');
      }
      if (th < 115) { // side
        if (y >= costal) return `chest-${s}`;
        return y > 0.955 ? `flank-${s}` : `hip-${s}`;
      }
      if (y > 1.10) return 'upper-back';
      if (y > 0.93) return ax < 0.085 ? 'lower-back' : `flank-${s}`;
      return 'buttocks';
    }
  }
}

// ---------------------------------------------------------------------------------------
// Shared resources (built once, reused by every create())
// ---------------------------------------------------------------------------------------
let BUILT = null;
function build() {
  if (BUILT) return BUILT;
  const bodySDF = buildBodySDF(), headSDF = buildHeadSDF(), handSDF = buildHandSDF(), footSDF = buildFootSDF();
  const surfaces = [];

  // body: one blended surface, split into coarse segments by the dominant SDF group
  {
    const m = polygonize(bodySDF, [-0.43, 0.085, -0.17], [0.43, 1.575, 0.16], 0.0125);
    const vseg = new Uint8Array(m.vcount);
    for (let v = 0; v < m.vcount; v++) {
      const x = m.pos[3 * v];
      bodySDF(x, m.pos[3 * v + 1], m.pos[3 * v + 2]);
      const gr = bodySDF.group();
      vseg[v] = gr === 0 ? SIDX.torso : gr === 1 ? SIDX.neck : gr === 2 ? (x >= 0 ? SIDX['arm-left'] : SIDX['arm-right']) : (x >= 0 ? SIDX['leg-left'] : SIDX['leg-right']);
    }
    surfaces.push({ ...m, vseg, split: true, iters: 2 });
  }
  {
    const m = polygonize(headSDF, [-0.098, 1.35, -0.125], [0.098, 1.72, 0.13], 0.0055);
    surfaces.push({ ...m, vseg: new Uint8Array(m.vcount).fill(SIDX.head), iters: 4 });
  }
  {
    const c = polygonize(handSDF, [-0.052, -0.2, -0.04], [0.078, 0.06, 0.075], 0.0042);
    const L = placeMesh(c, handToWorld, false), R = mirrorMesh(L);
    surfaces.push({ ...L, vseg: new Uint8Array(L.vcount).fill(SIDX['hand-left']), iters: 5 });
    surfaces.push({ ...R, vseg: new Uint8Array(R.vcount).fill(SIDX['hand-right']), iters: 5 });
  }
  {
    const c = polygonize(footSDF, [-0.07, -0.01, -0.08], [0.07, 0.19, 0.205], 0.006);
    const L = placeMesh(c, footToWorld, false), R = mirrorMesh(L);
    surfaces.push({ ...L, vseg: new Uint8Array(L.vcount).fill(SIDX['foot-left']), iters: 3 });
    surfaces.push({ ...R, vseg: new Uint8Array(R.vcount).fill(SIDX['foot-right']), iters: 3 });
  }

  // per-vertex region + breathing weights, adjacency
  for (const s of surfaces) {
    s.vreg = new Uint8Array(s.vcount);
    s.breath = new Float32Array(s.vcount * 2);
    for (let v = 0; v < s.vcount; v++) {
      const x = s.pos[3 * v], y = s.pos[3 * v + 1], z = s.pos[3 * v + 2];
      s.vreg[v] = RIDX[regionOf(x, y, z, SEGMENTS[s.vseg[v]])];
      const ax = Math.abs(x);
      s.breath[2 * v] = sstep(0.93, 1.06, y) * (1 - sstep(1.27, 1.40, y)) * (1 - sstep(0.15, 0.2, ax)); // chest/belly swell
      s.breath[2 * v + 1] = Math.max(sstep(1.10, 1.38, y), y > 0.6 ? sstep(0.19, 0.25, ax) : 0);      // shoulders/arms/head lift
    }
    s.adj = adjacency(s.idx, s.vcount);
  }

  // geometries: split the body surface into coarse segment meshes
  const pieces = [];
  for (const s of surfaces) {
    if (!s.split) { pieces.push({ surf: s, seg: SEGMENTS[s.vseg[0]], map: null, idx: s.idx }); continue; }
    const buckets = new Map();
    for (let t = 0; t < s.idx.length; t += 3) {
      const a = s.vseg[s.idx[t]], b = s.vseg[s.idx[t + 1]], c = s.vseg[s.idx[t + 2]];
      const g = a === b || a === c ? a : b === c ? b : a;
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g).push(s.idx[t], s.idx[t + 1], s.idx[t + 2]);
    }
    for (const [g, tri] of buckets) {
      const remap = new Map(), map = [];
      const idx = new Uint32Array(tri.length);
      for (let i = 0; i < tri.length; i++) {
        let r = remap.get(tri[i]);
        if (r === undefined) { r = map.length; remap.set(tri[i], r); map.push(tri[i]); }
        idx[i] = r;
      }
      pieces.push({ surf: s, seg: SEGMENTS[g], map: Uint32Array.from(map), idx });
    }
  }
  for (const pc of pieces) {
    const s = pc.surf, n = pc.map ? pc.map.length : s.vcount;
    const g = new THREE.BufferGeometry();
    const pick = (src, k) => {
      if (!pc.map) return src;
      const out = new Float32Array(n * k);
      for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) out[i * k + c] = src[pc.map[i] * k + c];
      return out;
    };
    g.setAttribute('position', new THREE.BufferAttribute(pick(s.pos, 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(pick(s.nor, 3), 3));
    g.setAttribute('breathW', new THREE.BufferAttribute(pick(s.breath, 2), 2));
    g.setIndex(new THREE.BufferAttribute(n < 65536 ? Uint16Array.from(pc.idx) : pc.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    pc.geometry = g;
  }
  const sdfAll = makeSdfAll(bodySDF, headSDF, handSDF, footSDF);
  BUILT = { surfaces, pieces, sdfAll };
  return BUILT;
}

// nearest-surface SDF over all parts; `.seg()` reports which coarse segment won
function makeSdfAll(bodySDF, headSDF, handSDF, footSDF) {
  const c = [0, 0, 0];
  let seg = 'torso';
  const f = (x, y, z) => {
    let d = bodySDF(x, y, z);
    const gr = bodySDF.group();
    seg = gr === 0 ? 'torso' : gr === 1 ? 'neck' : gr === 2 ? `arm-${side(x)}` : `leg-${side(x)}`;
    if (y > 1.35) { const h = headSDF(x, y, z); if (h < d) { d = h; seg = 'head'; } }
    const ax = Math.abs(x);
    if (y < 1.0 && ax > 0.25) { worldToHand(ax, y, z, c); const h = handSDF(c[0], c[1], c[2]); if (h < d) { d = h; seg = `hand-${side(x)}`; } }
    if (y < 0.2) { worldToFoot(ax, y, z, c); const h = footSDF(c[0], c[1], c[2]); if (h < d) { d = h; seg = `foot-${side(x)}`; } }
    return d;
  };
  f.seg = () => seg;
  return f;
}

// soft radial glow texture (no DOM needed)
function glowTexture() {
  const S = 64, data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = (i + 0.5) / S * 2 - 1, dy = (j + 0.5) / S * 2 - 1, r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.pow(Math.max(0, 1 - r), 2.2);
    const o = 4 * (i + j * S);
    data[o] = data[o + 1] = data[o + 2] = 255; data[o + 3] = Math.round(a * 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.needsUpdate = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  return t;
}

const MAX_RING_MARKERS = 8;

// ---------------------------------------------------------------------------------------
export function create() {
  const { surfaces, pieces, sdfAll } = build();
  const object = new THREE.Group();
  object.name = 'body';

  const uniforms = {
    uTime: { value: 0 },
    uBreath: { value: 0 },
    uHlColor: { value: new THREE.Color(0xff6a2b) },
    uHlAmt: { value: 0 },
    uMk: { value: Array.from({ length: MAX_RING_MARKERS }, () => new THREE.Vector4()) },
    uMkC: { value: Array.from({ length: MAX_RING_MARKERS }, () => new THREE.Color()) },
    uMkN: { value: 0 },
  };
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xe7ddd3, roughness: 0.6, metalness: 0,
    sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffc7ad),
    clearcoat: 0.06, clearcoatRoughness: 0.55,
  });
  skin.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float hl;
attribute vec2 breathW;
uniform float uBreath;
varying float vHl;
varying vec3 vLocal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vHl = hl;
vLocal = position;
transformed += normal * (breathW.x * uBreath * 0.0035) + vec3(0.0, breathW.y * uBreath * 0.0022, 0.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uHlColor;
uniform float uHlAmt;
uniform vec4 uMk[${MAX_RING_MARKERS}];
uniform vec3 uMkC[${MAX_RING_MARKERS}];
uniform float uMkN;
varying float vHl;
varying vec3 vLocal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float hlW = smoothstep(0.22, 0.78, vHl) * uHlAmt;
diffuseColor.rgb = mix(diffuseColor.rgb, uHlColor, hlW * 0.5);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float pulse = 0.78 + 0.22 * sin(uTime * 3.2);
  float edge = hlW * (1.0 - hlW) * 4.0;
  totalEmissiveRadiance += uHlColor * (hlW * 0.42 * pulse + edge * 0.55 * uHlAmt);
  vec3 vd = normalize(vViewPosition);
  float rim = pow(1.0 - saturate(dot(normalize(normal), vd)), 3.0);
  totalEmissiveRadiance += vec3(0.55, 0.62, 0.75) * rim * 0.10;
  for (int i = 0; i < ${MAX_RING_MARKERS}; i++) {
    if (float(i) >= uMkN) break;
    float r = length(vLocal - uMk[i].xyz);
    float age = uTime - uMk[i].w;
    float g = 0.0;
    for (int k = 0; k < 2; k++) {
      float ph = fract(age * 0.7 + float(k) * 0.5);
      float R = 0.012 + ph * 0.06;
      float ring = 1.0 - smoothstep(0.0, 0.0045, abs(r - R));
      g += ring * (1.0 - ph) * (1.0 - ph) * step(0.0, age - float(k) * 0.714);
    }
    g += (1.0 - smoothstep(0.0, 0.03, r)) * 0.35;
    totalEmissiveRadiance += uMkC[i] * g * 1.3;
    diffuseColor.rgb = mix(diffuseColor.rgb, uMkC[i], clamp(g, 0.0, 1.0) * 0.5);
  }
}`);
  };
  skin.customProgramCacheKey = () => 'eyesee-body-skin-v1';

  const meshes = [];
  for (const pc of pieces) {
    const geometry = pc.geometry.clone();
    const n = geometry.attributes.position.count;
    const hlAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
    hlAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('hl', hlAttr);
    const mesh = new THREE.Mesh(geometry, skin);
    mesh.name = pc.seg;
    mesh.userData.partId = pc.seg;
    object.add(mesh);
    meshes.push({ mesh, pc, hlAttr });
  }
  const weights = surfaces.map((s) => [new Float32Array(s.vcount), new Float32Array(s.vcount)]);

  // ---- highlight --------------------------------------------------------------------
  let hlTarget = 0, hlAmt = 0, current = null;
  function highlight(regionId, color) {
    current = regionId ?? null;
    if (color != null) uniforms.uHlColor.value.set(color);
    if (!current) { hlTarget = 0; return; }
    const r = RIDX[current], sg = SIDX[current];
    if (r === undefined && sg === undefined) { hlTarget = 0; current = null; return; }
    surfaces.forEach((s, si) => {
      let [a, b] = weights[si];
      const src = r !== undefined ? s.vreg : s.vseg, key = r !== undefined ? r : sg;
      let any = false;
      for (let v = 0; v < s.vcount; v++) { a[v] = src[v] === key ? 1 : 0; any ||= a[v] > 0; }
      if (any) {
        const { start, list } = s.adj;
        for (let it = 0; it < s.iters; it++) {
          for (let v = 0; v < s.vcount; v++) {
            let sum = a[v] * 2, cnt = 2;
            for (let e = start[v]; e < start[v + 1]; e++) { sum += a[list[e]]; cnt++; }
            b[v] = sum / cnt;
          }
          const t = a; a = b; b = t;
        }
      }
      s._w = a;
    });
    for (const { pc, hlAttr } of meshes) {
      const w = pc.surf._w, arr = hlAttr.array;
      if (pc.map) for (let i = 0; i < arr.length; i++) arr[i] = w[pc.map[i]];
      else arr.set(w);
      hlAttr.needsUpdate = true;
    }
    hlTarget = 1;
    hlAmt = Math.min(hlAmt, 0.35); // re-trigger the fade-in
  }

  // ---- region lookup ----------------------------------------------------------------
  function regionAt(p, hitMesh) {
    let seg = hitMesh?.userData?.partId;
    sdfAll(p.x, p.y, p.z);
    if (!seg || SIDX[seg] === undefined) seg = sdfAll.seg();
    const id = regionOf(p.x, p.y, p.z, seg);
    const part = PARTS[RIDX[id]];
    return { id, label: { ...part.label }, segment: seg };
  }
  const _n = [0, 0, 0];
  function normalAt(p) {
    const e = 0.001, x = p.x, y = p.y, z = p.z;
    const a = sdfAll(x + e, y - e, z - e), b = sdfAll(x - e, y - e, z + e), c = sdfAll(x - e, y + e, z - e), d = sdfAll(x + e, y + e, z + e);
    _n[0] = a - b - c + d; _n[1] = -a - b + c + d; _n[2] = -a + b - c + d;
    const l = Math.hypot(_n[0], _n[1], _n[2]) || 1;
    return new THREE.Vector3(_n[0] / l, _n[1] / l, _n[2] / l);
  }

  // ---- markers ----------------------------------------------------------------------
  const markerGeo = new THREE.SphereGeometry(0.0125, 24, 16);
  const haloTex = glowTexture();
  const markers = [];
  let markerSeq = 0, now = 0;
  function syncMarkerUniforms() {
    const list = markers.slice(-MAX_RING_MARKERS);
    list.forEach((m, i) => { uniforms.uMk.value[i].set(m.pos.x, m.pos.y, m.pos.z, m.born); uniforms.uMkC.value[i].copy(m.color); });
    uniforms.uMkN.value = list.length;
  }
  function addMarker(p, color = 0xff2a2a) {
    const id = `m${++markerSeq}`;
    const col = new THREE.Color(color);
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    const n = normalAt(pos);
    const group = new THREE.Group();
    group.position.copy(pos).addScaledVector(n, 0.005);
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.85, roughness: 0.3, metalness: 0 });
    const sphereMesh = new THREE.Mesh(markerGeo, mat);
    const haloMat = new THREE.SpriteMaterial({ map: haloTex, color: col, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(0.07);
    sphereMesh.raycast = () => {}; halo.raycast = () => {};
    group.add(halo, sphereMesh);
    group.userData.markerId = id;
    object.add(group);
    markers.push({ id, group, sphere: sphereMesh, halo, mat, haloMat, pos, color: col, born: now, phase: Math.random() * 6.28 });
    syncMarkerUniforms();
    return id;
  }
  function removeMarker(id) {
    const i = markers.findIndex((m) => m.id === id);
    if (i < 0) return false;
    const [m] = markers.splice(i, 1);
    object.remove(m.group); m.mat.dispose(); m.haloMat.dispose();
    syncMarkerUniforms();
    return true;
  }
  function clearMarkers() { while (markers.length) removeMarker(markers[0].id); }

  // ---- animation --------------------------------------------------------------------
  function update(dt, t) {
    now = t;
    uniforms.uTime.value = t;
    // breathing: ~4.6 s cycle, slightly longer exhale
    const ph = (t / 4.6) % 1;
    uniforms.uBreath.value = ph < 0.42 ? sstep(0, 0.42, ph) : 1 - sstep(0.42, 1, ph);
    const k = 1 - Math.exp(-(dt || 0.016) * 6);
    hlAmt += (hlTarget - hlAmt) * k;
    uniforms.uHlAmt.value = hlAmt;
    for (const m of markers) {
      const s = 1 + 0.14 * Math.sin((t - m.born) * 5.5 + m.phase);
      m.sphere.scale.setScalar(s);
      m.halo.scale.setScalar(0.06 + 0.02 * (0.5 + 0.5 * Math.sin((t - m.born) * 5.5 + m.phase)));
    }
  }

  function dispose() {
    clearMarkers();
    for (const { mesh } of meshes) mesh.geometry.dispose();
    skin.dispose(); markerGeo.dispose(); haloTex.dispose();
  }

  return {
    object,
    parts: PARTS.map((p) => ({ id: p.id, label: { ...p.label }, info: { ...p.info } })),
    update,
    highlight,
    regionAt,
    addMarker,
    removeMarker,
    clearMarkers,
    dispose,
    get highlighted() { return current; },
  };
}

// Animated 3D metaphors for pain qualities (catalog.js PAIN_TYPES[].anim).
//
// Every orb shares one visual language: a soft, translucent-looking "body tissue" core
// sphere (warm wrap lighting + sub-surface rim, lit in view space so it reads the same in
// AR passthrough and in dark VR) plus one effect that carries the meaning.
// Each orb fits inside a sphere of radius ~1 centred at the origin, stays well under 8k
// triangles, shares geometry between instances, uses instancing for repeated parts and
// allocates nothing per frame.
import * as THREE from 'three';

export const PAIN_ANIMS = ['pulse', 'needles', 'drill', 'squeeze', 'burn', 'electric', 'heavy', 'pound', 'nag', 'tingle'];

// ---------------------------------------------------------------------------------------
// Shared geometry (ref-counted across all live orbs)
// ---------------------------------------------------------------------------------------
let SHARED = null, REFS = 0;
function acquire() {
  if (!SHARED) SHARED = makeShared();
  REFS++;
  return SHARED;
}
function release() {
  if (--REFS > 0 || !SHARED) return;
  for (const g of Object.values(SHARED)) g.dispose();
  SHARED = null; REFS = 0;
}
function makeShared() {
  return {
    core: new THREE.SphereGeometry(0.5, 48, 32),
    shell: new THREE.SphereGeometry(0.5, 32, 20),
    quad: new THREE.PlaneGeometry(1, 1),
    needle: needleGeometry(),
    drill: drillGeometry(),
    band: new THREE.TorusGeometry(1, 0.085, 14, 80),
    ring: new THREE.TorusGeometry(1, 0.016, 6, 80),
    cone: new THREE.ConeGeometry(1, 1, 14),
    box: new THREE.BoxGeometry(1, 1, 1),
    weight: weightGeometry(),
    loop: new THREE.TorusGeometry(0.085, 0.024, 8, 28),
    handle: new THREE.CylinderGeometry(0.036, 0.044, 1, 12),
    head: new THREE.CylinderGeometry(0.1, 0.1, 0.3, 24),
    drop: dropGeometry(),
  };
}
// thin needle: sharp tip at the origin, shaft (with a small bead head) along +Y to 0.425
function needleGeometry() {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.011, 0.055), new THREE.Vector2(0.013, 0.37), new THREE.Vector2(0.024, 0.385), new THREE.Vector2(0.024, 0.415), new THREE.Vector2(0, 0.425)];
  return new THREE.LatheGeometry(pts, 8);
}
// two-flute twisted drill bit, tip at the origin, body along +Y (length 0.55)
function drillGeometry() {
  const segL = 48, segA = 28, L = 0.55, pos = [], nrmA = [], idx = [];
  for (let i = 0; i <= segL; i++) {
    const s = i / segL, y = s * L;
    const R = s < 0.22 ? 0.105 * Math.sqrt(s / 0.22) : 0.105;
    for (let j = 0; j <= segA; j++) {
      const a = (j / segA) * Math.PI * 2;
      const flute = s < 0.8 ? 0.7 + 0.3 * Math.abs(Math.cos(a - s * 16)) : 1; // helical flutes, plain shank
      const r = R * (s < 0.8 ? flute : 0.72);
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      nrmA.push(Math.cos(a), 0.15, Math.sin(a));
    }
  }
  for (let i = 0; i < segL; i++) for (let j = 0; j < segA; j++) {
    const a = i * (segA + 1) + j, b = a + segA + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// trapezoid "heavy weight" block
function weightGeometry() {
  const g = new THREE.CylinderGeometry(0.24, 0.34, 0.26, 4, 1);
  g.rotateY(Math.PI / 4);
  const n = g.toNonIndexed(); // flat-shaded facets read as a solid metal block
  n.computeVertexNormals();
  g.dispose();
  return n;
}
function dropGeometry() {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, a = t * Math.PI;
    pts.push(new THREE.Vector2(Math.sin(a) * (0.5 + 0.5 * t) * 0.05, -Math.cos(a) * 0.05 + t * t * 0.05));
  }
  return new THREE.LatheGeometry(pts, 14);
}

// ---------------------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------------------
const OUT = `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;
// view-space light so every orb looks the same regardless of the scene's lights
const LIGHT = 'normalize(vec3(-0.35, 0.8, 0.55))';

const CORE_VERT = `
uniform float uTime;
uniform vec3 uScale;
uniform float uSqueeze, uBandY, uWobble, uDent;
uniform vec3 uDentDir;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec3 p = position;
  vec3 n = normalize(position);
  float band = exp(-pow((p.y - uBandY) / 0.13, 2.0));
  p.xz *= 1.0 - uSqueeze * band * 0.42 + uSqueeze * (1.0 - band) * 0.1;
  p.y *= 1.0 + uSqueeze * 0.12;
  p += n * uWobble * sin(p.y * 10.0 - uTime * 1.4) * 0.028;
  float dd = max(dot(n, uDentDir), 0.0);
  p -= n * uDent * pow(dd, 10.0) * 0.13;
  p *= uScale;
  vP = position;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * n);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const CORE_FRAG = `
uniform float uTime, uIntensity, uGlow, uSwirl, uWaves, uFizz, uFlicker, uShadow;
uniform vec3 uColor, uDeep, uRim, uFx, uSwirlDir;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 n = normalize(vN), v = normalize(vV), L = ${LIGHT};
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float wrap = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.4);
  vec3 col = mix(uDeep, uColor, wrap);                        // deep tissue -> surface
  col += uRim * fres * 0.85;                                  // sub-surface rim
  col += pow(clamp(dot(reflect(-L, n), v), 0.0, 1.0), 28.0) * 0.28; // moist highlight
  vec3 q = normalize(vP);
  if (uSwirl > 0.0) {                                         // drill: twisting vortex around the entry point
    float c = dot(q, uSwirlDir);
    vec3 t1 = normalize(cross(uSwirlDir, vec3(0.0, 0.0, 1.0)));
    vec3 t2 = cross(uSwirlDir, t1);
    float r = acos(clamp(c, -1.0, 1.0));
    float ang = atan(dot(q, t2), dot(q, t1));
    float s = sin(ang * 3.0 + r * 16.0 - uTime * 11.0);
    col += uFx * smoothstep(0.35, 1.0, s) * smoothstep(1.5, 0.15, r) * uSwirl;
  }
  if (uWaves > 0.0) {                                         // nag: slow lingering waves
    float w = sin(q.y * 11.0 + uTime * 1.2) * 0.5 + 0.5;
    col = mix(col, col * 0.72 + uFx * 0.18, w * uWaves);
  }
  if (uFizz > 0.0) {                                          // tingle: static fizz
    float h = hash(floor(vP * 46.0) + floor(uTime * 18.0));
    col += uFx * step(0.9, h) * uFizz * (0.6 + 0.4 * wrap);
  }
  if (uFlicker > 0.0) {                                       // burn: raw, flickering heat
    float h = vnoise(vP * 5.0 + vec3(0.0, -uTime * 2.2, uTime * 0.7));
    col += uFx * smoothstep(0.45, 1.0, h) * uFlicker;
  }
  if (uShadow > 0.0) col *= 1.0 - uShadow * smoothstep(0.1, 0.95, q.y) * 0.55; // heavy: pressed-down shade
  col *= mix(0.72, 1.08, uIntensity);
  col += uColor * uGlow + uFx * uGlow * 0.35;
  gl_FragColor = vec4(col, 1.0);${OUT}
}`;

const SOLID_VERT = `
uniform float uInflate;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 pos = position;
  pos.xz *= uInflate;
  vec4 p = vec4(pos, 1.0);
  vec3 n = normal;
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
  n = mat3(instanceMatrix) * n;
#endif
  vec4 mv = modelViewMatrix * p;
  vN = normalize(normalMatrix * n);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const SOLID_FRAG = `
uniform vec3 uColor, uRim;
uniform float uEmissive, uOpacity, uSpec;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 n = normalize(vN), v = normalize(vV), L = ${LIGHT};
  if (!gl_FrontFacing) n = -n;
  float wrap = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.5);
  float spec = pow(clamp(dot(reflect(-L, n), v), 0.0, 1.0), 36.0) * uSpec;
  vec3 col = uColor * (0.32 + 0.78 * wrap) + uRim * fres + spec + uColor * uEmissive;
  gl_FragColor = vec4(col, uOpacity);${OUT}
}`;
const HALO_VERT = `
uniform float uSize;
varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize * length(modelViewMatrix[0].xyz);
  vUv = uv;
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FRAG = `
uniform vec3 uColor;
uniform float uOpacity, uSize;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * uSize;
  float g = exp(-pow(max(r - 0.49, 0.0) / 0.16, 2.0)) * smoothstep(1.0, 0.8, r);
  gl_FragColor = vec4(uColor, g * uOpacity);${OUT}
}`;
const AURA_FRAG = `
uniform vec3 uColor;
uniform float uOpacity, uPower;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
  gl_FragColor = vec4(uColor, clamp(f * uOpacity, 0.0, 1.0));${OUT}
}`;
// camera-facing particles on an instanced quad; per-mode motion lives in particle()
const PART_VERT = (body) => `
attribute vec4 aSeed;
uniform float uTime, uIntensity;
uniform float uState[16];
varying vec2 vUv;
varying vec4 vCol;
${body}
void main() {
  vec3 c; float size; vec4 col;
  particle(aSeed, uTime, c, size, col);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  mv.xy += position.xy * size * length(modelViewMatrix[0].xyz);
  vUv = uv; vCol = col;
  gl_Position = projectionMatrix * mv;
}`;
const PART_FRAG = (shape) => `
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec2 q = (vUv - 0.5) * 2.0;
  float a;
  ${shape}
  if (a * vCol.a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, clamp(a * vCol.a, 0.0, 1.0));${OUT}
}`;
const SHAPE_SOFT = 'a = exp(-dot(q, q) * 3.2) * smoothstep(1.0, 0.7, length(q));';
const SHAPE_FLAME = `float h = clamp(q.y * 0.5 + 0.5, 0.0, 1.0);
  float w = mix(0.55, 0.1, h * h);
  a = exp(-(q.x * q.x) / (w * w) * 1.5) * (1.0 - smoothstep(0.5, 1.0, h)) * smoothstep(0.0, 0.22, h);`;
const SHAPE_STAR = `vec2 k = abs(q);
  a = exp(-dot(q, q) * 14.0) + (exp(-k.x * 22.0) * exp(-k.y * 3.2) + exp(-k.y * 22.0) * exp(-k.x * 3.2)) * 0.85;`;

const col3 = (hex) => new THREE.Color(hex);

// ---------------------------------------------------------------------------------------
export function createPainViz(anim) {
  if (!PAIN_ANIMS.includes(anim)) anim = 'pulse';
  const G = acquire();
  const object = new THREE.Group();
  object.name = `painviz-${anim}`;
  const root = new THREE.Group(); // scaled by setActive
  object.add(root);
  const materials = [], ownGeometries = [], instancedMeshes = [];
  let active = false, act = 0; // act: 0 idle … 1 active (smoothed)
  let seed = 1 + PAIN_ANIMS.indexOf(anim) * 7919;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // ---- builders -----------------------------------------------------------------------
  const coreU = {
    uTime: { value: 0 }, uIntensity: { value: 0.6 }, uGlow: { value: 0 },
    uColor: { value: col3(0xf0806f) }, uDeep: { value: col3(0x9c2f3f) }, uRim: { value: col3(0xffc4ae) }, uFx: { value: col3(0xffffff) },
    uScale: { value: new THREE.Vector3(1, 1, 1) }, uSqueeze: { value: 0 }, uBandY: { value: 0 }, uWobble: { value: 0 },
    uDent: { value: 0 }, uDentDir: { value: new THREE.Vector3(0, 1, 0) }, uSwirl: { value: 0 }, uSwirlDir: { value: new THREE.Vector3(0, 1, 0) },
    uWaves: { value: 0 }, uFizz: { value: 0 }, uFlicker: { value: 0 }, uShadow: { value: 0 },
  };
  const coreMat = new THREE.ShaderMaterial({ uniforms: coreU, vertexShader: CORE_VERT, fragmentShader: CORE_FRAG });
  materials.push(coreMat);
  const core = new THREE.Mesh(G.core, coreMat);
  root.add(core);

  function solid(color, opts = {}) {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: col3(color) }, uRim: { value: col3(opts.rim ?? 0xffffff) }, uEmissive: { value: opts.emissive ?? 0 },
        uOpacity: { value: opts.opacity ?? 1 }, uSpec: { value: opts.spec ?? 0.4 }, uInflate: { value: opts.inflate ?? 1 },
      },
      vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG,
      transparent: (opts.opacity ?? 1) < 1 || !!opts.transparent, depthWrite: opts.depthWrite ?? true,
      side: opts.side ?? THREE.FrontSide, blending: opts.blending ?? THREE.NormalBlending,
    });
    materials.push(m);
    return m;
  }
  function aura(color, opacity = 0.55, power = 2.2, scale = 1.14) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col3(color) }, uOpacity: { value: opacity }, uPower: { value: power } },
      vertexShader: SOLID_VERT.replace('pos.xz *= uInflate;', ''), fragmentShader: AURA_FRAG,
      transparent: true, depthWrite: false, side: THREE.BackSide,
    });
    m.uniforms.uInflate = { value: 1 };
    materials.push(m);
    const mesh = new THREE.Mesh(G.shell, m);
    mesh.scale.setScalar(scale);
    mesh.renderOrder = 2;
    root.add(mesh);
    return mesh;
  }
  // soft glow disc behind the core (a camera-facing quad; the core hides its centre)
  function halo(color, opacity = 0.5) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col3(color) }, uOpacity: { value: opacity }, uSize: { value: 2.0 } },
      vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false,
    });
    materials.push(m);
    const mesh = new THREE.Mesh(G.quad, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    root.add(mesh);
    return mesh;
  }
  function particles(count, seedFn, body, shape, opts = {}) {
    const g = new THREE.InstancedBufferGeometry();
    g.index = G.quad.index;
    g.setAttribute('position', G.quad.attributes.position);
    g.setAttribute('uv', G.quad.attributes.uv);
    const s = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { const v = seedFn(i); s.set(v, i * 4); }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s, 4));
    g.instanceCount = count;
    ownGeometries.push(g);
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0.6 }, uState: { value: new Array(16).fill(0) } },
      vertexShader: PART_VERT(body), fragmentShader: PART_FRAG(shape),
      transparent: true, depthWrite: false, blending: opts.blending ?? THREE.NormalBlending,
    });
    materials.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    root.add(mesh);
    return mesh;
  }
  function instanced(geo, mat, count) {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(m);
    instancedMeshes.push(m);
    return m;
  }
  // fibonacci-sphere directions
  const fib = (i, n) => {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };

  // scratch objects (no per-frame allocation)
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  // place a unit-length Y-aligned segment between points a and b with thickness t
  const segMatrix = (a, b, t, out) => {
    _v.subVectors(b, a); const len = _v.length();
    _q.setFromUnitVectors(_up, _v.multiplyScalar(1 / (len || 1)));
    _v2.addVectors(a, b).multiplyScalar(0.5);
    _s.set(t, len, t);
    return out.compose(_v2, _q, _s);
  };

  // ---- per-anim setup -----------------------------------------------------------------
  let tick = () => {};
  const beat = (ph) => Math.exp(-(((ph - 0.06) / 0.055) ** 2)) + 0.62 * Math.exp(-(((ph - 0.27) / 0.06) ** 2));

  switch (anim) {
    case 'pulse': { // ずきずき — throbbing in heartbeat rhythm
      coreU.uFx.value.set(0xff3048);
      const shells = [0, 1].map(() => {
        const m = aura(0xff6076, 1.0, 1.4, 1);
        m.material.uniforms.uOpacity.value = 0;
        return m;
      });
      const glow = halo(0xff5a6a, 0.6);
      const P = 1.0;
      tick = (t) => {
        const ph = (t / P) % 1, b = beat(ph);
        coreU.uScale.value.setScalar(1 + 0.1 * b);
        coreU.uGlow.value = 0.22 * b;
        glow.material.uniforms.uOpacity.value = 0.25 + 0.35 * b;
        for (let i = 0; i < shells.length; i++) {
          const s = shells[i];
          const age = ((t / P) + (i ? 0.79 : 0.94)) % 1; // launched on lub and dub
          const k = i ? 0.75 : 1;
          s.scale.setScalar(1.02 + age * 0.9);
          s.material.uniforms.uOpacity.value = (1 - age) ** 1.6 * 1.6 * k;
        }
      };
      break;
    }
    case 'needles': { // ちくちく — fine needles poking in and out at random
      coreU.uFx.value.set(0xffffff);
      const N = 12;
      const mat = solid(0xd9e2ee, { rim: 0xffffff, spec: 0.9, emissive: 0.08 });
      const mesh = instanced(G.needle, mat, N);
      const dirs = [], period = [], phase = [], stab = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const d = fib(i, N);
        d.x += (rnd() - 0.5) * 0.35; d.z += (rnd() - 0.5) * 0.35; d.normalize();
        if (d.z < -0.55) d.z = -d.z; // keep needles mostly visible from the front
        dirs.push(d.normalize()); period.push(0.9 + rnd() * 0.9); phase.push(rnd());
      }
      const flash = particles(N, (i) => [dirs[i].x, dirs[i].y, dirs[i].z, i], `
        void particle(vec4 s, float t, out vec3 c, out float size, out vec4 col) {
          float k = uState[int(s.w)];
          c = s.xyz * 0.5;
          size = 0.16 * k * (0.8 + 0.4 * uIntensity);
          col = vec4(1.0, 0.93, 0.95, k);
        }`, SHAPE_STAR);
      const glow = halo(0xffd9e0, 0.54);
      tick = (t) => {
        let sum = 0;
        for (let i = 0; i < N; i++) {
          const ph = ((t / period[i]) + phase[i]) % 1;
          // quick jab in (0 → 0.1), short hold, pull out (→ 0.3), rest
          const k = ph < 0.1 ? Math.sin((ph / 0.1) * Math.PI * 0.5) : ph < 0.3 ? 1 - ((ph - 0.1) / 0.2) ** 2 : 0;
          stab[i] = k; sum += k;
          const tipR = 0.58 - 0.26 * k; // tip rests just off the skin and jabs deep into the core
          _v.copy(dirs[i]).multiplyScalar(tipR);
          _q.setFromUnitVectors(_up, dirs[i]);
          _s.set(1.7, 1, 1.7);
          mesh.setMatrixAt(i, _m.compose(_v, _q, _s));
          flash.material.uniforms.uState.value[i] = ph < 0.18 ? k : 0;
        }
        mesh.instanceMatrix.needsUpdate = true;
        coreU.uGlow.value = 0.05 + sum * 0.035;
        glow.material.uniforms.uOpacity.value = 0.2 + sum * 0.05;
      };
      break;
    }
    case 'drill': { // きりきり — a twisting drill boring in
      coreU.uFx.value.set(0xffd27a);
      const dir = new THREE.Vector3(0.62, 0.62, 0.48).normalize();
      coreU.uSwirlDir.value.copy(dir); coreU.uDentDir.value.copy(dir);
      const holder = new THREE.Group();
      holder.quaternion.setFromUnitVectors(_up, dir);
      root.add(holder);
      const bit = new THREE.Mesh(G.drill, solid(0xf2b85a, { rim: 0xfff1c9, spec: 1.0, emissive: 0.1 }));
      holder.add(bit);
      const chips = particles(26, () => [rnd(), rnd(), rnd(), rnd()], `
        void particle(vec4 s, float t, out vec3 c, out float size, out vec4 col) {
          float life = fract(t * (0.7 + s.z * 0.6) + s.w);
          float a = s.x * 6.2832 + t * 9.0 + life * 5.0;
          vec3 d = normalize(vec3(${dir.x.toFixed(4)}, ${dir.y.toFixed(4)}, ${dir.z.toFixed(4)}));
          vec3 t1 = normalize(cross(d, vec3(0.0, 0.0, 1.0))), t2 = cross(d, t1);
          float r = 0.06 + life * (0.18 + 0.12 * s.y);
          c = d * (0.5 + life * 0.35) + (t1 * cos(a) + t2 * sin(a)) * r;
          size = 0.05 * (1.0 - life) * (0.7 + 0.6 * uIntensity);
          col = vec4(mix(vec3(1.0, 0.95, 0.75), vec3(1.0, 0.6, 0.2), life), 1.0 - life);
        }`, SHAPE_SOFT);
      halo(0xffc070, 0.54);
      tick = (t) => {
        const push = 0.5 + 0.5 * Math.sin(t * 1.6); // slowly bores in and backs off
        bit.rotation.y = -t * 14;
        holder.position.copy(dir).multiplyScalar(0.44 - 0.12 * push);
        coreU.uSwirl.value = 0.55 + 0.45 * push;
        coreU.uDent.value = 0.35 + 0.65 * push;
        coreU.uGlow.value = 0.04 + 0.12 * push;
        chips.material.uniforms.uIntensity.value = 0.4 + 0.6 * push;
      };
      break;
    }
    case 'squeeze': { // しめつけ — a band constricting the sphere, which bulges
      coreU.uFx.value.set(0xff4a6a);
      const tilt = new THREE.Group();
      tilt.rotation.set(0.32, 0, -0.12);
      root.add(tilt);
      tilt.add(core);
      const band = new THREE.Mesh(G.band, solid(0x6d4bd8, { rim: 0xc9b8ff, spec: 0.6, emissive: 0.1 }));
      band.rotation.x = Math.PI / 2;
      tilt.add(band);
      const arrows = instanced(G.cone, solid(0xb9a6ff, { rim: 0xffffff, emissive: 0.25 }), 6);
      tilt.add(arrows);
      halo(0x9a7bff, 0.50);
      tick = (t) => {
        const ph = (t / 2.4) % 1;
        // tighten (ease) → hold with a tremble → release
        let sq = ph < 0.3 ? sstep(0, 0.3, ph) : ph < 0.62 ? 1 : 1 - sstep(0.62, 0.92, ph);
        if (ph >= 0.3 && ph < 0.62) sq -= 0.035 * Math.abs(Math.sin(t * 40));
        coreU.uSqueeze.value = sq;
        coreU.uGlow.value = 0.2 * sq;
        const rb = 0.5 * (1 - 0.42 * sq) + 0.03;
        band.scale.set(rb, rb, 1 + 0.25 * sq);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          const r = rb + 0.2 - 0.05 * sq;
          _v.set(Math.cos(a) * r, 0, Math.sin(a) * r);
          _v2.set(-Math.cos(a), 0, -Math.sin(a));
          _q.setFromUnitVectors(_up, _v2);
          _s.set(0.085, 0.17, 0.085).multiplyScalar(0.8 + 0.4 * sq);
          arrows.setMatrixAt(i, _m.compose(_v, _q, _s));
        }
        arrows.instanceMatrix.needsUpdate = true;
      };
      break;
    }
    case 'burn': { // ひりひり — flickering flames on raw skin
      coreU.uColor.value.set(0xff8a5c); coreU.uDeep.value.set(0xa8281f); coreU.uRim.value.set(0xffd08a);
      coreU.uFx.value.set(0xffc34d); coreU.uFlicker.value = 0.35;
      const N = 64;
      particles(N, () => {
        // spawn on the upper 2/3 of the core
        const y = -0.35 + rnd() * 1.35, a = rnd() * Math.PI * 2;
        return [a, Math.min(y, 0.98), rnd(), rnd()];
      }, `
        void particle(vec4 s, float t, out vec3 c, out float size, out vec4 col) {
          float life = fract(t * (0.8 + s.z * 0.7) + s.w);
          float y0 = s.y, r0 = sqrt(max(1.0 - y0 * y0, 0.0));
          vec3 base = vec3(cos(s.x) * r0, y0, sin(s.x) * r0) * 0.5;
          vec3 out0 = normalize(base);
          c = base + out0 * 0.06 + vec3(0.0, 0.04 + life * (0.26 + 0.12 * s.z), 0.0);
          c.x += sin(t * 7.0 + s.x * 5.0) * 0.03 * life;
          size = (0.24 + 0.12 * s.z) * (1.0 - life * 0.6) * (0.75 + 0.35 * uIntensity);
          vec3 hot = vec3(1.0, 0.92, 0.5), mid = vec3(1.0, 0.52, 0.06), cool = vec3(0.92, 0.16, 0.04);
          col.rgb = life < 0.3 ? mix(hot, mid, life / 0.3) : mix(mid, cool, (life - 0.3) / 0.7);
          col.a = smoothstep(0.0, 0.1, life) * (1.0 - life * life);
        }`, SHAPE_FLAME);
      halo(0xff7a2e, 0.80);
      tick = (t) => {
        coreU.uGlow.value = 0.1 + 0.06 * Math.sin(t * 13) * Math.sin(t * 7.3);
        coreU.uFlicker.value = 0.3 + 0.2 * act;
      };
      break;
    }
    case 'electric': { // びりびり — zig-zag lightning arcs
      coreU.uFx.value.set(0x9ff4ff);
      const BOLTS = 5, SEG = 7, N = BOLTS * SEG;
      const matCore = solid(0xeafdff, { rim: 0xffffff, emissive: 0.6 });
      const matGlow = solid(0x5fdcff, { opacity: 0.35, emissive: 0.8, inflate: 3.2, depthWrite: false });
      const boltMesh = instanced(G.box, matCore, N);
      const glowMesh = new THREE.InstancedMesh(G.box, matGlow, N);
      glowMesh.instanceMatrix = boltMesh.instanceMatrix;
      glowMesh.frustumCulled = false; glowMesh.renderOrder = 3;
      root.add(glowMesh);
      const pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
      const next = new Float32Array(BOLTS), on = new Uint8Array(BOLTS);
      const dir = new THREE.Vector3(), side1 = new THREE.Vector3(), side2 = new THREE.Vector3();
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      const glow = halo(0x6fe3ff, 0.72);
      const regen = (b) => {
        dir.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 1.6 - 0.4).normalize();
        side1.set(0, 1, 0).cross(dir); if (side1.lengthSq() < 1e-4) side1.set(1, 0, 0); side1.normalize();
        side2.crossVectors(dir, side1);
        const r0 = 0.46, r1 = 0.8 + rnd() * 0.17;
        for (let k = 0; k <= SEG; k++) {
          const f = k / SEG, j = k === 0 || k === SEG ? 0 : (0.05 + 0.07 * f);
          pts[k].copy(dir).multiplyScalar(r0 + (r1 - r0) * f)
            .addScaledVector(side1, (rnd() * 2 - 1) * j * 1.4).addScaledVector(side2, (rnd() * 2 - 1) * j);
        }
        for (let k = 0; k < SEG; k++) boltMesh.setMatrixAt(b * SEG + k, segMatrix(pts[k], pts[k + 1], 0.02 * (1 - 0.4 * k / SEG), _m));
      };
      const hide = (b) => { for (let k = 0; k < SEG; k++) boltMesh.setMatrixAt(b * SEG + k, zero); };
      for (let b = 0; b < BOLTS; b++) hide(b);
      tick = (t) => {
        let lit = 0, changed = false;
        for (let b = 0; b < BOLTS; b++) {
          if (t >= next[b]) {
            on[b] = rnd() < 0.62 ? 1 : 0;
            if (on[b]) regen(b); else hide(b);
            next[b] = t + 0.05 + rnd() * 0.11;
            changed = true;
          }
          lit += on[b];
        }
        if (changed) boltMesh.instanceMatrix.needsUpdate = true;
        const flick = lit / BOLTS;
        coreU.uGlow.value = 0.05 + 0.28 * flick;
        glow.material.uniforms.uOpacity.value = 0.2 + 0.5 * flick;
      };
      break;
    }
    case 'heavy': { // ずーん — a dark weight slowly pressing down
      coreU.uColor.value.set(0xd77a78); coreU.uDeep.value.set(0x6e2638); coreU.uRim.value.set(0xd7b4c4); coreU.uFx.value.set(0x4a3b6b);
      const w = new THREE.Group();
      const block = new THREE.Mesh(G.weight, solid(0x3d4454, { rim: 0x8c96ad, spec: 0.35 }));
      block.position.y = 0.13;
      const loop = new THREE.Mesh(G.loop, solid(0x3d4454, { rim: 0x8c96ad, spec: 0.35 }));
      loop.position.y = 0.3;
      w.add(block, loop);
      root.add(w);
      const dust = particles(18, (i) => [(i / 18) * Math.PI * 2, rnd(), rnd(), rnd()], `
        void particle(vec4 s, float t, out vec3 c, out float size, out vec4 col) {
          float p = uState[0];
          float life = fract(t * 0.35 + s.w);
          float r = 0.34 + life * 0.3;
          c = vec3(cos(s.x) * r, uState[1] - 0.02 + life * 0.05, sin(s.x) * r * 0.8);
          size = 0.12 * (0.6 + s.y);
          col = vec4(0.35, 0.37, 0.45, p * (1.0 - life) * 0.55);
        }`, SHAPE_SOFT);
      halo(0x5b5f7a, 0.54);
      tick = (t) => {
        const ph = (t / 3.2) % 1;
        // slow press (ease) → long hold → slight lift
        const p = ph < 0.45 ? sstep(0, 0.45, ph) : ph < 0.8 ? 1 : 1 - 0.55 * sstep(0.8, 1, ph);
        const sy = 1 - 0.26 * p, sxz = 1 + 0.13 * p;
        coreU.uScale.value.set(sxz, sy, sxz);
        coreU.uShadow.value = 0.35 + 0.65 * p;
        coreU.uGlow.value = 0.0;
        coreU.uIntensity.value = (0.45 + 0.35 * act) * (1 - 0.25 * p);
        const top = 0.5 * sy;
        w.position.y = top + 0.06 * (1 - p) + 0.005;
        dust.material.uniforms.uState.value[0] = p;
        dust.material.uniforms.uState.value[1] = top - 0.06;
      };
      break;
    }
    case 'pound': { // がんがん — a hammer striking with a shockwave
      coreU.uFx.value.set(0xffe9a8);
      const pivot = new THREE.Group();
      pivot.position.set(0.5, 0.6, 0.1);
      root.add(pivot);
      const handle = new THREE.Mesh(G.handle, solid(0xa0714a, { rim: 0xffd7b0, spec: 0.2 }));
      handle.rotation.z = Math.PI / 2; handle.scale.y = 0.4; handle.position.x = -0.2;
      const head = new THREE.Mesh(G.head, solid(0x8d97a8, { rim: 0xffffff, spec: 1.0 }));
      head.position.x = -0.4;
      pivot.add(handle, head);
      const impactDir = new THREE.Vector3(0.1, 0.47, 0.1).normalize();
      coreU.uDentDir.value.copy(impactDir);
      const shock = [0, 1].map(() => {
        const m = new THREE.Mesh(G.ring, solid(0xfff1c2, { emissive: 0.9, opacity: 0.9, depthWrite: false }));
        m.renderOrder = 3;
        root.add(m);
        return m;
      });
      const flash = particles(1, () => [0, 0, 0, 0], `
        void particle(vec4 s, float t, out vec3 c, out float size, out vec4 col) {
          float k = uState[0];
          c = vec3(${(impactDir.x * 0.52).toFixed(4)}, ${(impactDir.y * 0.52).toFixed(4)}, ${(impactDir.z * 0.52 + 0.05).toFixed(4)});
          size = 0.75 * k;
          col = vec4(1.0, 0.96, 0.8, k);
        }`, SHAPE_STAR);
      const glow = halo(0xffe08a, 0.54);
      const P = 1.15;
      tick = (t) => {
        const ph = (t / P) % 1;
        // wind-up (slow) → strike (fast) → rebound
        let ang;
        if (ph < 0.6) ang = 0.7 * sstep(0, 0.6, ph);
        else if (ph < 0.7) ang = 0.7 * (1 - ((ph - 0.6) / 0.1) ** 2);
        else ang = 0.12 * Math.sin(((ph - 0.7) / 0.3) * Math.PI) * (1 - (ph - 0.7) / 0.3);
        pivot.rotation.z = -ang;
        const since = ph >= 0.7 ? (ph - 0.7) * P : 99;
        const hit = Math.exp(-since * 9);
        coreU.uDent.value = 1.3 * hit;
        coreU.uScale.value.set(1 + 0.08 * hit, 1 - 0.12 * hit, 1 + 0.08 * hit);
        coreU.uGlow.value = 0.28 * hit;
        glow.material.uniforms.uOpacity.value = 0.2 + 0.6 * hit;
        flash.material.uniforms.uState.value[0] = hit;
        for (let i = 0; i < shock.length; i++) {
          const m = shock[i];
          const age = Math.min(1, Math.max(0, since - i * 0.08) / 0.55);
          const r = 0.5 + age * 0.45;
          m.position.set(0, 0.05 - age * 0.05, 0);
          m.rotation.set(Math.PI / 2 - 0.35, 0, 0);
          m.scale.set(r, r, r * (1 + 2 * (1 - age)));
          m.material.uniforms.uOpacity.value = since > 50 ? 0 : (1 - age) ** 1.5 * 0.95;
        }
      };
      break;
    }
    case 'nag': { // しくしく — dim, slow, lingering waves
      coreU.uColor.value.set(0xc99aa8); coreU.uDeep.value.set(0x5d3552); coreU.uRim.value.set(0xb9c4ec); coreU.uFx.value.set(0x8ea2e0);
      coreU.uWaves.value = 1; coreU.uWobble.value = 0.45;
      const rings = [0, 1, 2].map(() => {
        const m = new THREE.Mesh(G.ring, solid(0x9fb1ea, { emissive: 0.4, opacity: 0.6, depthWrite: false }));
        m.rotation.x = Math.PI / 2 - 0.3;
        m.renderOrder = 3;
        root.add(m);
        return m;
      });
      const drop = new THREE.Mesh(G.drop, solid(0xa9bcf2, { rim: 0xffffff, spec: 0.9, opacity: 0.85, emissive: 0.15 }));
      root.add(drop);
      halo(0x8ea2e0, 0.54);
      tick = (t) => {
        const slow = 0.5 + 0.5 * Math.sin(t * 1.3);
        coreU.uGlow.value = 0.04 * slow;
        coreU.uIntensity.value = (0.42 + 0.3 * act) * (0.85 + 0.15 * slow);
        for (let i = 0; i < rings.length; i++) {
          const m = rings[i];
          const age = ((t / 5.2) + i / 3) % 1;
          const r = 0.52 + age * 0.42;
          m.scale.set(r, r, 1);
          m.position.y = 0.04 - age * 0.1;
          m.material.uniforms.uOpacity.value = Math.sin(age * Math.PI) * 0.6;
        }
        // a slow drip forms under the orb and falls
        const dp = (t / 3.6) % 1;
        const grow = sstep(0, 0.55, dp), fall = dp > 0.6 ? (dp - 0.6) / 0.4 : 0;
        drop.position.set(0.05, -0.5 - 0.02 * grow - fall * fall * 0.42, 0.1);
        drop.scale.setScalar(0.35 + 0.65 * grow);
        drop.material.uniforms.uOpacity.value = 0.85 * (1 - fall);
      };
      break;
    }
    case 'tingle': { // じんじん — twinkling sparkles / static fizz
      coreU.uFx.value.set(0xfff2a8); coreU.uFizz.value = 0.55;
      const N = 90;
      particles(N, (i) => {
        const d = fib(i, N);
        return [d.x, d.y, d.z, rnd()];
      }, `
        void particle(vec4 s, float t, out vec3 c, out float size, out vec4 col) {
          float rate = 5.0 + fract(s.w * 13.7) * 7.0;
          float tw = pow(max(sin(t * rate + s.w * 40.0), 0.0), 10.0);
          float r = 0.52 + fract(s.w * 7.3) * 0.33 + 0.02 * sin(t * 3.0 + s.w * 9.0);
          c = normalize(s.xyz) * r;
          size = (0.07 + 0.11 * fract(s.w * 3.1)) * tw * (0.8 + 0.4 * uIntensity);
          col = vec4(mix(vec3(1.0, 0.86, 0.35), vec3(1.0, 1.0, 0.92), fract(s.w * 5.3)), tw);
        }`, SHAPE_STAR);
      halo(0xffe27a, 0.50);
      tick = (t) => {
        coreU.uGlow.value = 0.05 + 0.04 * Math.sin(t * 23) * Math.sin(t * 17);
        coreU.uFizz.value = 0.45 + 0.35 * act;
      };
      break;
    }
  }

  // ---- public API ---------------------------------------------------------------------
  let time = 0;
  function update(dt, t) {
    time = t ?? (time + (dt || 0));
    const k = 1 - Math.exp(-(dt || 0.016) * 8);
    act += ((active ? 1 : 0) - act) * k;
    root.scale.setScalar(1 + 0.12 * act);
    const inten = 0.62 + 0.38 * act;
    coreU.uTime.value = time;
    if (anim !== 'heavy' && anim !== 'nag') coreU.uIntensity.value = inten;
    for (let i = 0; i < materials.length; i++) {
      const m = materials[i], u = m.uniforms;
      if (u.uTime && m !== coreMat) u.uTime.value = time;
      if (u.uIntensity && m !== coreMat && anim !== 'drill') u.uIntensity.value = inten;
    }
    tick(time);
  }
  function setActive(on) { active = !!on; }
  function dispose() {
    object.removeFromParent();
    for (const m of materials) m.dispose();
    for (const g of ownGeometries) g.dispose();
    for (const m of instancedMeshes) m.dispose();
    release();
  }
  update(0, 0);
  return { object, update, setActive, dispose, anim };
}

function sstep(a, b, v) { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); }

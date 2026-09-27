// Input for the headset (and a desktop preview): index-finger pokes, pinch / controller rays, mouse.
// Every target gets the same hover / press / drag / release callbacks, so a control behaves the same
// whether it is poked, pinched, triggered or clicked. Dragging a panel keeps tracking its plane even
// when the ray slides off it, which is what makes pinch-to-scroll feel solid.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _plane = new THREE.Plane();
const _n = new THREE.Vector3();

/**
 * Target: { object, kind: 'panel'|'button'|'mesh', poke?: boolean,
 *           onHover?(hit|null), onPress?(hit, src), onDrag?(hit, src), onRelease?(hit|null, src) }
 *  - panel: object is a Panel mesh (PlaneGeometry w×h facing +Z); hits carry uv + region
 *  - button: object's local +Z is the press direction; userData.radius (m), userData.face (m)
 *  - mesh: any Object3D; hit is a Raycaster intersection
 */
export class Interact {
  constructor(renderer, camera, scene) {
    this.renderer = renderer;
    this.camera = camera;
    this.scene = scene;
    this.targets = new Set();
    this.ray = new THREE.Raycaster();
    this.sources = [];
    this.#controllers();
    this.#hands();
    this.#mouse();
  }

  add(t) {
    this.targets.add(t);
    return t;
  }

  remove(t) {
    if (t) {
      t.onHover?.(null);
      this.targets.delete(t);
    }
  }

  #visible(obj) {
    for (let o = obj; o; o = o.parent) if (!o.visible) return false;
    return obj.userData.interactive !== false;
  }

  /** Closest target hit by a ray. */
  cast(origin, dir, far = 10) {
    this.ray.set(origin, dir);
    this.ray.far = far;
    let best = null;
    for (const t of this.targets) {
      if (!this.#visible(t.object)) continue;
      const h = this.ray.intersectObject(t.object, true).find((x) => x.object.visible && !x.object.userData.noHit);
      if (h && (!best || h.distance < best.hit.distance)) best = { target: t, hit: h };
    }
    if (best?.target.kind === 'panel') best.hit.region = best.target.object.userData.panel.hit(best.hit.uv);
    return best;
  }

  /** Intersect a ray with a panel's plane (unbounded) → uv, for drags that leave the panel. */
  planeHit(target, origin, dir) {
    const mesh = target.object;
    mesh.updateMatrixWorld();
    _n.set(0, 0, 1).transformDirection(mesh.matrixWorld);
    _plane.setFromNormalAndCoplanarPoint(_n, _v.setFromMatrixPosition(mesh.matrixWorld));
    this.ray.set(origin, dir);
    const p = this.ray.ray.intersectPlane(_plane, new THREE.Vector3());
    if (!p) return null;
    const local = mesh.worldToLocal(p.clone());
    const panel = mesh.userData.panel;
    const uv = new THREE.Vector2(local.x / panel.w + 0.5, local.y / panel.h + 0.5);
    return { uv, point: p, region: panel.hit(uv) };
  }

  #hover(src, target, hit) {
    const key = target ? `${target.kind}:${hit?.region?.id ?? ''}` : '';
    if (src.hover === target && src.hoverKey === key) return;
    if (src.hover && src.hover !== target) src.hover.onHover?.(null);
    src.hover = target;
    src.hoverKey = key;
    target?.onHover?.(hit);
  }

  // ---------------------------------------------------------------- controllers & pinch rays

  #controllers() {
    for (let i = 0; i < 2; i++) {
      const c = this.renderer.xr.getController(i);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
      );
      line.userData.noHit = true;
      c.add(line);
      const cursor = new THREE.Mesh(new THREE.CircleGeometry(0.006, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
      cursor.userData.noHit = true;
      cursor.renderOrder = 20;
      cursor.visible = false;
      this.scene.add(cursor);
      const src = { kind: 'ray', controller: c, line, cursor, pressed: null, input: null, hover: null };
      c.addEventListener('connected', (e) => {
        src.input = e.data;
        line.material.opacity = e.data.hand ? 0.18 : 0.35;
      });
      c.addEventListener('disconnected', () => {
        src.input = null;
        this.#hover(src, null);
      });
      c.addEventListener('selectstart', () => this.#rayPress(src));
      c.addEventListener('selectend', () => this.#rayRelease(src));
      this.scene.add(c);
      this.sources.push(src);
    }
  }

  #rayOf(src) {
    _m.identity().extractRotation(src.controller.matrixWorld);
    return [new THREE.Vector3().setFromMatrixPosition(src.controller.matrixWorld), new THREE.Vector3(0, 0, -1).applyMatrix4(_m).normalize()];
  }

  #rayPress(src) {
    const [o, d] = this.#rayOf(src);
    const r = this.cast(o, d);
    if (!r) return;
    src.pressed = r.target;
    this.haptic(src, 0.3, 20);
    r.target.onPress?.(r.hit, src);
  }

  #rayRelease(src) {
    const t = src.pressed;
    src.pressed = null;
    if (!t) return;
    const [o, d] = this.#rayOf(src);
    const hit = t.kind === 'panel' ? this.planeHit(t, o, d) : this.cast(o, d)?.hit;
    t.onRelease?.(hit, src);
  }

  haptic(src, intensity = 0.3, ms = 20) {
    try {
      src?.input?.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms);
    } catch {}
  }

  // ---------------------------------------------------------------- hands: index-finger poke + hover

  #hands() {
    this.hands = [0, 1].map((i) => {
      const hand = this.renderer.xr.getHand(i);
      this.scene.add(hand);
      return { hand, state: new Map(), kind: 'poke', hover: null };
    });
  }

  #poke() {
    for (const h of this.hands) {
      const tipJ = h.hand.joints?.['index-finger-tip'];
      const distJ = h.hand.joints?.['index-finger-phalanx-distal'];
      if (!tipJ || !tipJ.visible) {
        this.#hover(h, null);
        continue;
      }
      const p = tipJ.getWorldPosition(new THREE.Vector3());
      let hoverT = null, hoverHit = null, hoverD = 0.07;
      for (const t of this.targets) {
        if (!t.poke || !this.#visible(t.object)) continue;
        let st = h.state.get(t);
        if (!st) h.state.set(t, (st = { front: true, pressed: false }));
        const local = t.object.worldToLocal(p.clone());
        let inside, depth, hit;
        if (t.kind === 'panel') {
          const panel = t.object.userData.panel;
          inside = Math.abs(local.x) <= panel.w / 2 + 0.01 && Math.abs(local.y) <= panel.h / 2 + 0.01;
          depth = local.z;
          const uv = new THREE.Vector2(local.x / panel.w + 0.5, local.y / panel.h + 0.5);
          hit = { uv, point: p, region: panel.hit(uv), local };
        } else if (t.kind === 'button') {
          const r = t.object.userData.radius || 0.05;
          inside = Math.hypot(local.x, local.y) <= r * 1.2;
          depth = local.z - (t.object.userData.face || 0);
          hit = { point: p, local };
        } else if (t.kind === 'mesh' && distJ) {
          // A short ray along the last finger bone touches arbitrary 3D models.
          const q = distJ.getWorldPosition(new THREE.Vector3());
          const dir = p.clone().sub(q).normalize();
          this.ray.set(q, dir);
          this.ray.far = p.distanceTo(q) + 0.012;
          const hits = this.ray.intersectObject(t.object, true).filter((x) => x.object.visible && !x.object.userData.noHit);
          const touching = hits.length > 0;
          if (touching && !st.pressed && st.front) {
            st.pressed = true;
            st.front = false;
            t.onPress?.(hits[0], h);
          } else if (!touching && st.pressed) {
            st.pressed = false;
            st.front = true;
            t.onRelease?.(null, h);
          }
          continue;
        } else continue;

        if (inside && depth > -0.02 && depth < hoverD) (hoverD = depth), (hoverT = t), (hoverHit = hit);
        if (!st.pressed) {
          if (depth > 0.012) st.front = true;
          if (inside && st.front && depth < 0.004 && depth > -0.06) {
            st.pressed = true;
            st.front = false;
            this.click();
            t.onPress?.(hit, h);
          }
        } else if (depth > 0.02 || !inside) {
          st.pressed = false;
          t.onRelease?.(inside ? hit : null, h);
        } else t.onDrag?.(hit, h);
      }
      this.#hover(h, hoverT, hoverHit);
    }
  }

  // ---------------------------------------------------------------- desktop mouse

  #mouse() {
    const el = this.renderer.domElement;
    const m = (this.mouseSrc = { kind: 'mouse', pressed: null, look: null, hover: null });
    const toRay = (e) => {
      const r = el.getBoundingClientRect();
      this.ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, this.camera);
      return [this.ray.ray.origin.clone(), this.ray.ray.direction.clone()];
    };
    el.addEventListener('pointerdown', (e) => {
      if (this.renderer.xr.isPresenting) return;
      el.setPointerCapture(e.pointerId);
      const r = this.cast(...toRay(e));
      if (r) {
        m.pressed = r.target;
        r.target.onPress?.(r.hit, m);
      } else m.look = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointermove', (e) => {
      if (this.renderer.xr.isPresenting) return;
      const ray = toRay(e);
      if (m.pressed) {
        const t = m.pressed;
        const hit = t.kind === 'panel' ? this.planeHit(t, ...ray) : this.cast(...ray)?.hit;
        if (hit) t.onDrag?.(hit, m);
      } else if (m.look) {
        this.onLook?.(e.clientX - m.look.x, e.clientY - m.look.y);
        m.look = { x: e.clientX, y: e.clientY };
      } else {
        const r = this.cast(...ray);
        this.#hover(m, r?.target || null, r?.hit);
        el.style.cursor = r ? 'pointer' : 'grab';
      }
    });
    el.addEventListener('pointerup', (e) => {
      const t = m.pressed;
      m.pressed = null;
      m.look = null;
      if (!t) return;
      const ray = toRay(e);
      t.onRelease?.(t.kind === 'panel' ? this.planeHit(t, ...ray) : this.cast(...ray)?.hit, m);
    });
  }

  // ---------------------------------------------------------------- per frame

  update() {
    if (!this.renderer.xr.isPresenting) return;
    for (const src of this.sources) {
      if (!src.input) {
        src.cursor.visible = false;
        continue;
      }
      const [o, d] = this.#rayOf(src);
      if (src.pressed) {
        const t = src.pressed;
        const hit = t.kind === 'panel' ? this.planeHit(t, o, d) : this.cast(o, d)?.hit;
        if (hit) t.onDrag?.(hit, src);
        src.cursor.visible = !!hit;
        if (hit) src.cursor.position.copy(hit.point), src.cursor.lookAt(o);
        src.line.scale.z = hit ? hit.point.distanceTo(o) : 1;
        continue;
      }
      const r = this.cast(o, d);
      this.#hover(src, r?.target || null, r?.hit);
      src.line.scale.z = r ? r.hit.distance : 1;
      src.cursor.visible = !!r;
      if (r) src.cursor.position.copy(r.hit.point), src.cursor.lookAt(o);
    }
    this.#poke();
  }

  /** Soft tick for presses. */
  click() {
    try {
      this.actx ||= new (window.AudioContext || window.webkitAudioContext)();
      const t = this.actx.currentTime;
      const o = this.actx.createOscillator();
      const g = this.actx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(700, t + 0.03);
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(this.actx.destination);
      o.start(t);
      o.stop(t + 0.06);
    } catch {}
  }
}

// Input for the headset (and a desktop preview): index-finger pokes (hand tracking), controller or
// pinch rays, and the mouse. Every target gets the same press / drag / release callbacks, so a
// button works the same whether it's poked, pinched, triggered or clicked.
import * as THREE from 'three';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const mat = new THREE.Matrix4();

/**
 * Target: { object, kind: 'panel'|'button'|'mesh', poke?: boolean,
 *           onPress?(hit, src), onDrag?(hit, src), onRelease?(hit, src), onHover?(hit|null) }
 *  - panel: object is a Panel mesh (PlaneGeometry w×h, facing +Z); hit.uv, hit.region
 *  - button: object's local +Z is the press direction; userData.radius (m)
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
    this.#setupControllers();
    this.#setupHands();
    this.#setupMouse();
  }

  add(t) {
    this.targets.add(t);
    return t;
  }

  remove(t) {
    this.targets.delete(t);
  }

  #visible(obj) {
    for (let o = obj; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  /** Raycast the targets; returns { target, hit } for the closest. */
  cast(origin, dir, far = 10) {
    this.ray.set(origin, dir);
    this.ray.far = far;
    let best = null;
    for (const t of this.targets) {
      if (!this.#visible(t.object)) continue;
      const hits = this.ray.intersectObject(t.object, true);
      const h = hits.find((x) => x.object.visible && !x.object.userData.noHit);
      if (h && (!best || h.distance < best.hit.distance)) best = { target: t, hit: h };
    }
    if (best && best.target.kind === 'panel') {
      best.hit.region = best.target.object.userData.panel.hit(best.hit.uv);
    }
    return best;
  }

  // ---------------------------------------------------------------- controllers / pinch rays

  #setupControllers() {
    for (let i = 0; i < 2; i++) {
      const c = this.renderer.xr.getController(i);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.55 }));
      line.userData.noHit = true;
      line.scale.z = 1.2;
      c.add(line);
      const cursor = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.01, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
      cursor.userData.noHit = true;
      cursor.renderOrder = 10;
      cursor.visible = false;
      this.scene.add(cursor);
      const src = { kind: 'ray', controller: c, line, cursor, pressed: null, input: null };
      c.addEventListener('connected', (e) => {
        src.input = e.data;
        // Hands use poke; their pinch ray is still available but drawn subtler.
        line.material.opacity = e.data.hand ? 0.25 : 0.55;
      });
      c.addEventListener('disconnected', () => (src.input = null));
      c.addEventListener('selectstart', () => this.#rayPress(src));
      c.addEventListener('selectend', () => this.#rayRelease(src));
      this.scene.add(c);
      this.sources.push(src);
    }
  }

  #rayOrigin(src) {
    mat.identity().extractRotation(src.controller.matrixWorld);
    const origin = tmp.setFromMatrixPosition(src.controller.matrixWorld).clone();
    const dir = tmp2.set(0, 0, -1).applyMatrix4(mat).normalize().clone();
    return [origin, dir];
  }

  #rayPress(src) {
    const [o, d] = this.#rayOrigin(src);
    const r = this.cast(o, d);
    if (!r) return;
    src.pressed = r.target;
    this.haptic(src, 0.35, 25);
    r.target.onPress?.(r.hit, src);
  }

  #rayRelease(src) {
    const t = src.pressed;
    src.pressed = null;
    if (!t) return;
    const [o, d] = this.#rayOrigin(src);
    const r = this.cast(o, d);
    t.onRelease?.(r?.target === t ? r.hit : null, src);
  }

  haptic(src, intensity = 0.4, ms = 30) {
    try {
      src?.input?.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms);
    } catch {}
  }

  // ---------------------------------------------------------------- hands: index-finger poke

  #setupHands() {
    this.hands = [0, 1].map((i) => {
      const hand = this.renderer.xr.getHand(i);
      this.scene.add(hand);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.85 }));
      tip.userData.noHit = true;
      tip.visible = false;
      this.scene.add(tip);
      return { hand, tip, state: new Map(), kind: 'poke' };
    });
  }

  #pokeUpdate() {
    for (const h of this.hands) {
      const joint = h.hand.joints?.['index-finger-tip'];
      const dist = h.hand.joints?.['index-finger-phalanx-distal'];
      if (!joint || !joint.visible) {
        h.tip.visible = false;
        continue;
      }
      const p = joint.getWorldPosition(new THREE.Vector3());
      h.tip.visible = true;
      h.tip.position.copy(p);
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
          inside = Math.hypot(local.x, local.y) <= r * 1.15;
          depth = local.z - (t.object.userData.face || 0);
          hit = { point: p, local };
        } else if (t.kind === 'mesh' && dist) {
          // Finger ray: a few cm along the last finger bone, to touch arbitrary models.
          const q = dist.getWorldPosition(new THREE.Vector3());
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

        if (!st.pressed) {
          if (depth > 0.012) st.front = true;
          if (inside && st.front && depth < 0.004 && depth > -0.06) {
            st.pressed = true;
            st.front = false;
            this.click();
            t.onPress?.(hit, h);
          }
        } else {
          if (depth > 0.02 || !inside) {
            st.pressed = false;
            t.onRelease?.(inside ? hit : null, h);
          } else t.onDrag?.(hit, h);
        }
      }
    }
  }

  // ---------------------------------------------------------------- desktop mouse

  #setupMouse() {
    const el = this.renderer.domElement;
    this.mouse = { pressed: null, down: false, look: null };
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
        this.mouse.pressed = r.target;
        this.click();
        r.target.onPress?.(r.hit, this.mouse);
      } else this.mouse.look = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointermove', (e) => {
      if (this.renderer.xr.isPresenting) return;
      if (this.mouse.pressed?.onDrag) {
        const r = this.cast(...toRay(e));
        if (r?.target === this.mouse.pressed) this.mouse.pressed.onDrag(r.hit, this.mouse);
      } else if (this.mouse.look) {
        this.onLook?.(e.clientX - this.mouse.look.x, e.clientY - this.mouse.look.y);
        this.mouse.look = { x: e.clientX, y: e.clientY };
      }
    });
    el.addEventListener('pointerup', (e) => {
      const t = this.mouse.pressed;
      this.mouse.pressed = null;
      this.mouse.look = null;
      if (t) {
        const r = this.cast(...toRay(e));
        t.onRelease?.(r?.target === t ? r.hit : null, this.mouse);
      }
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
      const [o, d] = this.#rayOrigin(src);
      const r = this.cast(o, d);
      src.line.scale.z = r ? r.hit.distance : 1.2;
      src.cursor.visible = !!r;
      if (r) {
        src.cursor.position.copy(r.hit.point);
        src.cursor.lookAt(o);
        if (src.pressed === r.target) r.target.onDrag?.(r.hit, src);
      }
    }
    this.#pokeUpdate();
  }

  /** Soft click sound for presses. */
  click() {
    try {
      this.actx ||= new (window.AudioContext || window.webkitAudioContext)();
      const t = this.actx.currentTime;
      const o = this.actx.createOscillator();
      const g = this.actx.createGain();
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(440, t + 0.05);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.connect(g).connect(this.actx.destination);
      o.start(t);
      o.stop(t + 0.08);
    } catch {}
  }
}

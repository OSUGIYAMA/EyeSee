// Compact 3D viewer for the doctor's phone. The same procedural models the patient sees in the
// headset; drags rotate (synced to the headset), taps select a part (highlighted on both devices).
import * as THREE from 'three';

const cache = new Map();
const loadModel = (id) => {
  if (!cache.has(id)) cache.set(id, import(`/shared/models/${id}.js`));
  return cache.get(id);
};

export class Viewer {
  constructor(canvas, { onRotate, onPick } = {}) {
    this.canvas = canvas;
    this.onRotate = onRotate;
    this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3b4b5b, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 2.5, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ec5ff, 0.9);
    rim.position.set(-2, 1, -2);
    this.scene.add(rim);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.zoom = 1;
    this.targetZoom = 1;
    this.dist = 3;
    this.current = null;
    this.key = null;
    this.clock = new THREE.Clock();
    this.#bindInput();
    this.running = false;
  }

  /** Show a library model (`kind:'model'`) or a pain animation (`kind:'pain'`). */
  async show(kind, id) {
    const key = `${kind}:${id}`;
    if (this.key === key) return this.current;
    this.key = key;
    this.clear();
    let obj;
    try {
      if (kind === 'pain') {
        const { createPainViz } = await import('/shared/painviz.js');
        obj = createPainViz(id);
        obj.parts = [];
      } else {
        const mod = await loadModel(id);
        obj = mod.create();
        obj.meta = mod.meta;
      }
    } catch (err) {
      console.warn('viewer: could not load', key, err);
      return null;
    }
    if (this.key !== key) return obj.dispose?.(), null;
    this.current = obj;
    this.pivot.add(obj.object);
    this.#frame(obj.object);
    this.start();
    return obj;
  }

  #frame(object) {
    object.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    const r = Math.max(size.x, size.y, size.z) * 0.5;
    this.camera.near = r / 50;
    this.camera.far = r * 50;
    this.dist = (r / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.25;
    this.camera.position.set(0, 0, this.dist);
    this.zoom = this.targetZoom = 1;
    this.camera.updateProjectionMatrix();
  }

  /** Frame a region of the current model (points in its local space), e.g. the reported symptoms. */
  focus(points, pad = 0.28) {
    const obj = this.current?.object;
    if (!obj || !points?.length) return;
    const box = new THREE.Box3();
    for (const p of points) box.expandByPoint(new THREE.Vector3(...p));
    box.expandByScalar(pad);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -c.y, -c.z);
    const r = Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 0.5;
    this.dist = (r / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.15;
    this.camera.position.set(0, 0, this.dist);
    this.camera.updateProjectionMatrix();
  }

  clear() {
    if (this.current) {
      this.pivot.remove(this.current.object);
      this.current.dispose?.();
    }
    this.current = null;
  }

  hide() {
    this.key = null;
    this.clear();
    this.stop();
  }

  /** Apply the shared view (from the other device). */
  setView(yaw, pitch, zoom) {
    if (this.dragging) return;
    this.targetYaw = yaw;
    this.targetPitch = pitch;
    if (zoom) this.targetZoom = zoom;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.renderer.setAnimationLoop(() => this.#tick());
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  #tick() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.yaw += (this.targetYaw - this.yaw) * 0.18;
    this.pitch += (this.targetPitch - this.pitch) * 0.18;
    this.zoom += (this.targetZoom - this.zoom) * 0.2;
    this.camera.position.z = this.dist / this.zoom;
    this.pivot.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.current?.update?.(dt, this.clock.elapsedTime);
    this.onTick?.(dt, this.clock.elapsedTime);
    this.renderer.render(this.scene, this.camera);
  }

  #bindInput() {
    const c = this.canvas;
    const pts = new Map();
    let sx = 0, sy = 0, moved = 0, lastSend = 0, pinch0 = 0, zoom0 = 1;
    const send = (force) => {
      const now = performance.now();
      if (force || now - lastSend > 60) (lastSend = now), this.onRotate?.(this.targetYaw, this.targetPitch, this.targetZoom);
    };
    const spread = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true;
      if (pts.size === 2) (pinch0 = spread()), (zoom0 = this.targetZoom), (moved = 99);
      sx = e.clientX;
      sy = e.clientY;
      if (pts.size === 1) moved = 0;
    });
    c.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        // Pinch to zoom.
        this.targetZoom = Math.max(0.6, Math.min(3, (zoom0 * spread()) / Math.max(1, pinch0)));
        return send();
      }
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = e.clientX;
      sy = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      this.targetYaw += dx * 0.012;
      this.targetPitch = Math.max(-1.2, Math.min(1.2, this.targetPitch + dy * 0.01));
      send();
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size) return;
      this.dragging = false;
      send(true);
      if (moved < 8) this.#pick(e);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', (e) => (pts.delete(e.pointerId), (this.dragging = pts.size > 0)));
    // Trackpad pinch / mouse wheel.
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.targetZoom = Math.max(0.6, Math.min(3, this.targetZoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
        send();
      },
      { passive: false },
    );
  }

  #pick(e) {
    if (!this.current) return;
    const rect = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 }, this.camera);
    const hit = ray.intersectObject(this.current.object, true).find((h) => h.object.visible);
    let o = hit?.object;
    while (o && !o.userData.partId) o = o.parent;
    const local = hit ? this.current.object.worldToLocal(hit.point.clone()) : null;
    this.onPick?.({ part: o?.userData.partId || null, local, mesh: hit?.object || null });
  }
}

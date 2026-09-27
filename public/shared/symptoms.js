// The patient's symptoms made physical on the body model: a marker where it hurts, and the chosen
// sensation (its animated orb) floating just off the skin there, sized by how strong it is.
// Shared by the headset and the doctor's phone so both see the same map.
import * as THREE from 'three';
import { PAIN_TYPES } from './catalog.js';

export class SymptomLayer {
  /** @param body  a body model instance (body.js create()) @param createPainViz from painviz.js (optional) */
  constructor(body, createPainViz) {
    this.body = body;
    this.create = createPainViz;
    this.items = new Map();
    this.sig = '';
  }

  sync(symptoms = [], activeId = null) {
    const ids = new Set(symptoms.map((s) => s.id));
    for (const [id, it] of this.items) if (!ids.has(id)) this.#drop(it), this.items.delete(id);

    const sig = symptoms.map((s) => s.id).join(',');
    if (sig !== this.sig && this.body.clearMarkers) {
      this.body.clearMarkers();
      for (const s of symptoms) if (s.point) this.body.addMarker(new THREE.Vector3(...s.point));
      this.sig = sig;
    }

    for (const s of symptoms) {
      let it = this.items.get(s.id);
      if (!it) this.items.set(s.id, (it = { q: null, viz: null }));
      if (it.q !== s.quality) {
        this.#drop(it);
        it.q = s.quality;
        const pt = PAIN_TYPES.find((p) => p.id === s.quality);
        if (pt && this.create && s.point) {
          it.viz = this.create(pt.anim);
          const p = new THREE.Vector3(...s.point);
          p.z += p.z >= 0 ? 0.075 : -0.075; // just off the skin, facing the viewer
          it.viz.object.position.copy(p);
          this.body.object.add(it.viz.object);
        }
      }
      if (it.viz) {
        it.viz.object.scale.setScalar(0.03 + 0.0035 * (s.intensity ?? 4));
        it.viz.setActive(s.id === activeId || (s.intensity ?? 0) >= 7);
      }
    }
  }

  #drop(it) {
    if (!it.viz) return;
    it.viz.object.removeFromParent();
    it.viz.dispose?.();
    it.viz = null;
  }

  update(dt, t) {
    for (const it of this.items.values()) it.viz?.update(dt, t);
  }

  dispose() {
    for (const it of this.items.values()) this.#drop(it);
    this.items.clear();
  }
}

/** One line per symptom for lists and captions. */
export function symptomLine(s, { lang = 'en', pack } = {}) {
  const pt = PAIN_TYPES.find((p) => p.id === s.quality);
  const region = pack?.[`part.body.${s.region.id}.label`] ?? s.region.label?.[lang] ?? s.region.label?.en ?? '';
  const pain = pt ? pack?.[`pain.${pt.id}.name`] ?? (lang === 'ja' ? pt.ja : pt.en) : '';
  return [region, pain, s.intensity != null ? `${s.intensity}/10` : ''].filter(Boolean).join(' · ');
}

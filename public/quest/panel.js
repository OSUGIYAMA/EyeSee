// Flat UI for WebXR in the visionOS idiom: glass windows drawn on a canvas and shown as textured
// planes. Panels keep hit regions (with ids) so pokes / rays / clicks map to actions, and a hover id
// so controls can light up under the pointer.
import * as THREE from 'three';

export const FONT = '"Inter", "Noto Sans JP", "Hiragino Sans", "Noto Sans CJK JP", system-ui, sans-serif';

// visionOS-like palette: neutral glass, white text in three strengths, system colours with meaning.
export const C = {
  text: '#ffffff',
  text2: 'rgba(255,255,255,0.62)',
  text3: 'rgba(255,255,255,0.38)',
  fill: 'rgba(255,255,255,0.10)',
  fillHover: 'rgba(255,255,255,0.20)',
  sep: 'rgba(255,255,255,0.12)',
  blue: '#0a84ff',
  green: '#30d158',
  orange: '#ff9f0a',
  red: '#ff453a',
};

export class Panel {
  /** @param {{w:number,h:number,ppm?:number,name?:string}} o  size in meters */
  constructor({ w, h, ppm = 1000, name = 'panel' }) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * ppm);
    this.canvas.height = Math.round(h * ppm);
    this.W = this.canvas.width;
    this.H = this.canvas.height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.material);
    this.mesh.name = name;
    this.mesh.renderOrder = 2;
    this.mesh.userData.panel = this;
    this.regions = [];
    this.hoverId = null;
    this.pressId = null;
    this.sig = null;
    this.onChange = null; // re-render callback (hover changes)
  }

  /** Redraw via fn(ctx, panel) when `sig` changed (always if sig undefined). */
  draw(fn, sig) {
    const full = sig === undefined ? undefined : `${sig}|${this.hoverId}|${this.pressId}`;
    if (full !== undefined && full === this.sig) return false;
    this.sig = full;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    this.regions = [];
    fn(ctx, this);
    this.texture.needsUpdate = true;
    return true;
  }

  region(x, y, w, h, action, id, data) {
    this.regions.push({ x, y, w, h, action, id: id ?? `${Math.round(x)}:${Math.round(y)}`, data });
  }

  hit(uv) {
    const x = uv.x * this.W, y = (1 - uv.y) * this.H;
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { ...r, px: x - r.x, py: y - r.y };
    }
    return null;
  }

  setHover(id) {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.onChange?.();
  }

  uvToPx(uv) {
    return [uv.x * this.W, (1 - uv.y) * this.H];
  }

  set opacity(v) {
    this.material.opacity = v;
    this.mesh.visible = v > 0.01;
  }
}

// ---------------------------------------------------------------- drawing

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** visionOS glass: soft neutral translucency, a faint top-lit gradient and a hairline highlight. */
export function glass(ctx, x, y, w, h, r, { tint = 0 } = {}) {
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(${92 + tint},${92 + tint},${100 + tint},0.62)`);
  g.addColorStop(1, `rgba(${58 + tint},${58 + tint},${64 + tint},0.66)`);
  ctx.fillStyle = g;
  ctx.fill();
  rr(ctx, x + 1, y + 1, w - 2, h - 2, r - 1);
  const e = ctx.createLinearGradient(0, y, 0, y + h);
  e.addColorStop(0, 'rgba(255,255,255,0.34)');
  e.addColorStop(0.35, 'rgba(255,255,255,0.08)');
  e.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.strokeStyle = e;
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function font(ctx, size, weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

export function text(ctx, str, x, y, size, color = C.text, weight = 500, align = 'left') {
  font(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(str, x, y);
}

export function measure(ctx, str, size, weight = 500) {
  font(ctx, size, weight);
  return ctx.measureText(str).width;
}

const CJK = /[　-ヿ㐀-鿿豈-﫿＀-￯가-힯]/;
const NO_START = /^[、。，．・：；？！ー）」』】〕｝〉》ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ,.!?:;)\]}]/;

function tokens(s) {
  const out = [];
  let buf = '';
  for (const ch of s) {
    if (CJK.test(ch)) {
      if (buf) out.push(buf), (buf = '');
      out.push(ch);
    } else if (ch === ' ') out.push(buf + ' '), (buf = '');
    else if (ch === '\n') {
      if (buf) out.push(buf);
      out.push('\n');
      buf = '';
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

/** Wrap mixed CJK / Latin text to maxW with the current font (with basic kinsoku). */
export function wrap(ctx, str, maxW, maxLines = 99) {
  const lines = [];
  let line = '';
  for (const t of tokens(String(str ?? ''))) {
    if (t === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const test = line + t;
    if (ctx.measureText(test.trimEnd()).width <= maxW || !line) {
      line = test;
      continue;
    }
    if (t.length === 1 && NO_START.test(t)) {
      lines.push(test);
      line = '';
      continue;
    }
    lines.push(line);
    line = t.trimStart();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/.{0,1}$/, '…');
    return cut.map((l) => l.trimEnd());
  }
  return lines.map((l) => l.trimEnd());
}

/** Wrapped paragraph; returns height. `mark` underlines given substrings (glossary terms). */
export function para(ctx, str, x, y, maxW, size, color = C.text, weight = 500, lineH = 1.38, maxLines, { align = 'left', mark = [] } = {}) {
  font(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const lines = wrap(ctx, str, maxW, maxLines);
  lines.forEach((l, i) => {
    const ly = y + i * size * lineH;
    const lx = align === 'right' ? x + maxW : align === 'center' ? x + maxW / 2 : x;
    ctx.fillText(l, lx, ly);
    for (const m of mark) {
      const at = m ? l.indexOf(m) : -1;
      if (at < 0) continue;
      const left = lx + (align === 'left' ? ctx.measureText(l.slice(0, at)).width : 0);
      const w = ctx.measureText(m).width;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(2, size / 14);
      ctx.setLineDash([size / 7, size / 7]);
      ctx.beginPath();
      ctx.moveTo(left, ly + size * 1.12);
      ctx.lineTo(left + w, ly + size * 1.12);
      ctx.stroke();
      ctx.restore();
    }
  });
  return lines.length * size * lineH;
}

export function paraHeight(ctx, str, maxW, size, weight = 500, lineH = 1.38, maxLines) {
  font(ctx, size, weight);
  return wrap(ctx, str, maxW, maxLines).length * size * lineH;
}

/**
 * Capsule button. States: glass (default), lighter on hover, white fill with dark label when
 * selected/prominent — the visionOS vocabulary.
 */
export function button(panel, x, y, w, h, label, action, o = {}) {
  const ctx = panel.ctx;
  const id = o.id ?? label;
  const hover = panel.hoverId === id && action;
  const pressed = panel.pressId === id;
  const filled = o.selected || o.prominent;
  rr(ctx, x, y, w, h, o.r ?? h / 2);
  ctx.fillStyle = filled ? (hover || pressed ? '#e8e8ed' : '#ffffff') : o.tint ? o.tint : hover || pressed ? C.fillHover : C.fill;
  if (!action && !filled) ctx.globalAlpha = 0.45;
  ctx.fill();
  ctx.globalAlpha = 1;
  const color = filled ? '#000000' : action ? C.text : C.text3;
  const size = o.size || Math.round(h * 0.4);
  font(ctx, size, o.weight || 600);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + size * 0.04);
  if (action) panel.region(x, y, w, h, action, id, o.data);
}

/** Activity indicator (the visionOS spinner), drawn at time t (seconds). */
export function spinner(ctx, cx, cy, r, t) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const k = ((i - Math.floor(t * 10)) % 8 + 8) % 8;
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.85 * (1 - k / 8)})`;
    ctx.lineWidth = r * 0.22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
}

/** Three animated dots (someone is speaking / being translated). */
export function dots(ctx, x, y, size, t, color = C.text) {
  for (let i = 0; i < 3; i++) {
    const a = 0.3 + 0.7 * Math.max(0, Math.sin(t * 5 - i * 0.7));
    ctx.fillStyle = color;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x + i * size * 1.6 + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The AI glyph: a small multicolour orb. */
export function orb(ctx, cx, cy, r) {
  const g = ctx.createConicGradient ? ctx.createConicGradient(-1.2, cx, cy) : null;
  if (g) {
    g.addColorStop(0, '#5ac8fa');
    g.addColorStop(0.3, '#af52de');
    g.addColorStop(0.55, '#ff2d55');
    g.addColorStop(0.8, '#ff9500');
    g.addColorStop(1, '#5ac8fa');
  }
  ctx.fillStyle = g || '#af52de';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const hl = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r);
  hl.addColorStop(0, 'rgba(255,255,255,0.7)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fill();
}

/** Small glass capsule label (under 3D objects). */
export function capsuleMesh(textStr, { h = 0.036, ppm = 2000, size = 0.5, weight = 600 } = {}) {
  const probe = document.createElement('canvas').getContext('2d');
  const px = Math.round(h * ppm);
  font(probe, px * size, weight);
  const w = (probe.measureText(textStr).width + px * 0.9) / ppm;
  const p = new Panel({ w, h, ppm, name: 'capsule' });
  p.draw((ctx) => {
    glass(ctx, 0, 0, p.W, p.H, p.H / 2);
    text(ctx, textStr, p.W / 2, p.H * (0.5 - size * 0.52), p.H * size, C.text, weight, 'center');
  });
  return p;
}

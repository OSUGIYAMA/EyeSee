// Flat UI panels for WebXR: a canvas drawn with 2D APIs, shown as a textured plane. Panels keep a
// list of hit regions so pokes / rays / mouse clicks map to actions.
import * as THREE from 'three';

export const FONT = '"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", system-ui, sans-serif';

export const C = {
  bg: 'rgba(12, 22, 33, 0.86)',
  card: 'rgba(255, 255, 255, 0.07)',
  card2: 'rgba(255, 255, 255, 0.12)',
  line: 'rgba(255, 255, 255, 0.14)',
  ink: '#f2f7fb',
  muted: '#9fb2c4',
  doctor: '#7fb0ff',
  doctorBg: 'rgba(59, 130, 246, 0.20)',
  patient: '#ffab70',
  patientBg: 'rgba(249, 115, 22, 0.16)',
  ai: '#c4b5fd',
  aiBg: 'rgba(139, 92, 246, 0.22)',
  ok: '#4ade80',
  okBg: 'rgba(34, 197, 94, 0.22)',
  warn: '#fbbf24',
  warnBg: 'rgba(245, 158, 11, 0.22)',
  bad: '#f87171',
  accent: '#2dd4bf',
};

export class Panel {
  /** @param {{w:number,h:number,ppm?:number,name?:string,transparent?:boolean}} o  size in meters */
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
    this.texture.anisotropy = 4;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false }));
    this.mesh.name = name;
    this.mesh.renderOrder = 2;
    this.mesh.userData.panel = this;
    this.regions = [];
    this.sig = null;
  }

  /** Redraw via `fn(ctx, panel)` when `sig` changed (or always if sig undefined). */
  draw(fn, sig) {
    if (sig !== undefined && sig === this.sig) return false;
    this.sig = sig;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    this.regions = [];
    fn(ctx, this);
    this.texture.needsUpdate = true;
    return true;
  }

  region(x, y, w, h, action, data) {
    this.regions.push({ x, y, w, h, action, data });
  }

  /** uv (0..1, origin bottom-left) → region */
  hit(uv) {
    const x = uv.x * this.W, y = (1 - uv.y) * this.H;
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { ...r, px: x - r.x, py: y - r.y };
    }
    return null;
  }

  uvToPx(uv) {
    return [uv.x * this.W, (1 - uv.y) * this.H];
  }
}

// ---------------------------------------------------------------- drawing helpers

export function rr(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) (ctx.fillStyle = fill), ctx.fill();
  if (stroke) (ctx.strokeStyle = stroke), (ctx.lineWidth = 2), ctx.stroke();
}

export function font(ctx, size, weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

const CJK = /[　-ヿ㐀-鿿豈-﫿＀-￯]/;
const NO_START = /^[、。，．・：；？！ー）」』】〕｝〉》ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ,.!?:;)\]}]/;

/** Split into wrap tokens: each CJK char is its own token, latin words keep their trailing space. */
function tokens(text) {
  const out = [];
  let buf = '';
  for (const ch of text) {
    if (CJK.test(ch)) {
      if (buf) out.push(buf), (buf = '');
      out.push(ch);
    } else if (ch === ' ') {
      out.push(buf + ' ');
      buf = '';
    } else if (ch === '\n') {
      if (buf) out.push(buf);
      out.push('\n');
      buf = '';
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

/** Wrap text to lines no wider than maxW with the current ctx font (handles mixed Japanese/English). */
export function wrap(ctx, text, maxW, maxLines = 99) {
  const lines = [];
  let line = '';
  for (const t of tokens(String(text ?? ''))) {
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
    if (NO_START.test(t) && t.length === 1) {
      // Kinsoku: keep closing punctuation on the previous line.
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
    cut[maxLines - 1] = cut[maxLines - 1].replace(/.{0,2}$/, '…');
    return cut.map((l) => l.trimEnd());
  }
  return lines.map((l) => l.trimEnd());
}

export function text(ctx, str, x, y, size, color, weight = 500, align = 'left') {
  font(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(str, x, y);
}

/** Draw wrapped text; returns height used. */
export function para(ctx, str, x, y, maxW, size, color, weight = 500, lineH = 1.42, maxLines) {
  font(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = wrap(ctx, str, maxW, maxLines);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lineH));
  return lines.length * size * lineH;
}

export function measurePara(ctx, str, maxW, size, weight = 500, lineH = 1.42, maxLines) {
  font(ctx, size, weight);
  return wrap(ctx, str, maxW, maxLines).length * size * lineH;
}

/** Big rounded button drawn on a panel + its hit region. */
export function button(panel, x, y, w, h, label, action, o = {}) {
  const ctx = panel.ctx;
  rr(ctx, x, y, w, h, o.r ?? Math.min(28, h / 2), o.bg || C.card2, o.border);
  if (o.sub) {
    text(ctx, label, x + w / 2, y + h / 2 - (o.size || 34) * 0.78, o.size || 34, o.color || C.ink, o.weight || 700, 'center');
    text(ctx, o.sub, x + w / 2, y + h / 2 + 4, o.subSize || 20, o.subColor || C.muted, 500, 'center');
  } else {
    font(ctx, o.size || 34, o.weight || 700);
    ctx.fillStyle = o.color || C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 2);
  }
  if (action) panel.region(x, y, w, h, action, o.data);
}

/** Small text sprite (labels under 3D objects). */
export function labelMesh(lines, { w = 0.14, h = 0.05, ppm = 1600, bg = 'rgba(12,22,33,0.78)' } = {}) {
  const p = new Panel({ w, h, ppm, name: 'label' });
  // Shrink a line's font until it fits the label width.
  const fit = (ctx, str, size, weight) => {
    font(ctx, size, weight);
    const w = ctx.measureText(str).width;
    return w > p.W * 0.92 ? size * ((p.W * 0.92) / w) : size;
  };
  p.draw((ctx) => {
    rr(ctx, 0, 0, p.W, p.H, p.H * 0.3, bg);
    const [a, b] = lines;
    if (b) {
      text(ctx, a, p.W / 2, p.H * 0.1, fit(ctx, a, p.H * 0.4, 800), C.ink, 800, 'center');
      const sb = fit(ctx, b, p.H * 0.24, 500);
      text(ctx, b, p.W / 2, p.H * 0.6 + (p.H * 0.24 - sb) / 2, sb, C.muted, 500, 'center');
    } else text(ctx, a, p.W / 2, p.H * 0.28, fit(ctx, a, p.H * 0.44, 700), C.ink, 700, 'center');
  });
  return p;
}

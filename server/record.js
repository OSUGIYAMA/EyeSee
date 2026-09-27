// Printable, bilingual record of the visit: the minutes, the understanding trajectory, the AI final
// check, each checkpoint the patient confirmed, both signatures and a SHA-256 of the whole record.
import { LANGUAGES } from '../public/shared/catalog.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const time = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { hour12: false }) : '—');
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour12: false }) : '');

function sparkline(history, threshold) {
  if (!history.length) return '<p class="muted">No scores yet.</p>';
  const w = 560, h = 120, pad = 18;
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(1, history.length - 1);
  const y = (v) => h - pad - (v / 10) * (h - pad * 2);
  const pts = history.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="spark" role="img" aria-label="Understanding score over time">
    <line x1="${pad}" x2="${w - pad}" y1="${y(threshold)}" y2="${y(threshold)}" class="thr"/>
    <text x="${w - pad}" y="${y(threshold) - 4}" text-anchor="end" class="thrl">consent threshold ${threshold}</text>
    <polyline points="${pts}" class="line"/>
    ${history.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.score)}" r="3"/>`).join('')}
    <text x="${pad}" y="${h - 2}" class="axis">0</text><text x="${pad}" y="10" class="axis">10</text>
  </svg>`;
}

function minutesRow(e) {
  const t = esc(clock(e.ts));
  if (e.kind === 'speech') {
    const who = e.speaker === 'doctor' ? 'Doctor' : 'Patient';
    const flags = [e.iSee && '👍 I see', e.confused && '🤔 not understood'].filter(Boolean).join(' · ');
    return `<tr class="${e.speaker}"><td>${t}</td><td>${who}</td><td>${esc(e.orig.text)}${flags ? `<div class="flag">${flags}</div>` : ''}</td><td>${esc(e.tr?.text || '')}${e.terms?.length ? `<div class="terms">${e.terms.map((x) => `<b>${esc(x.display)}</b>: ${esc(x.explanation)}`).join('<br>')}</div>` : ''}</td></tr>`;
  }
  if (e.kind === 'ai') {
    return `<tr class="ai"><td>${t}</td><td>EyeSee AI</td><td><i>Q (${esc(e.ai.from)}):</i> ${esc(e.ai.question?.doctor)}<br>${esc(e.ai.answer?.doctor || '')}${e.ai.omissions?.length ? `<ul>${e.ai.omissions.map((o) => `<li>[${o.severity}] ${esc(o.doctor)}</li>`).join('')}</ul>` : ''}</td><td>${esc(e.ai.question?.patient)}<br>${esc(e.ai.answer?.patient || '')}</td></tr>`;
  }
  return `<tr class="ev"><td>${t}</td><td>${esc(e.speaker === 'system' ? '—' : e.speaker)}</td><td>${esc(e.text?.doctor)}</td><td>${esc(e.text?.patient)}</td></tr>`;
}

export function renderRecord(room) {
  const s = room.state;
  const c = s.consent;
  const lang = LANGUAGES[s.patientLang]?.name || s.patientLang;
  const u = s.understanding;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EyeSee record · ${esc(s.sessionId)}</title>
<style>
  :root{--ink:#10202f;--muted:#5b6b7b;--line:#dbe3ea;--accent:#0f766e;--bg:#fff}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "Hiragino Sans","Noto Sans JP",system-ui,sans-serif}
  main{max-width:980px;margin:0 auto;padding:28px 20px 60px}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:28px 0 10px;border-bottom:2px solid var(--line);padding-bottom:6px}
  .muted{color:var(--muted)} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
  .card{border:1px solid var(--line);border-radius:10px;padding:10px 12px} .card b{display:block;font-size:12px;color:var(--muted);font-weight:600}
  table{width:100%;border-collapse:collapse} td,th{border-bottom:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left}
  th{font-size:12px;color:var(--muted)} tr.doctor td:nth-child(2){color:#1d4ed8} tr.patient td:nth-child(2){color:#b45309} tr.ai td{background:#f5f3ff} tr.ev td{color:var(--muted);font-size:13px}
  .terms{margin-top:4px;font-size:12px;color:var(--muted)} .flag{font-size:12px;color:var(--accent)}
  .ok{color:#15803d;font-weight:700} .q{color:#b45309;font-weight:700}
  .spark{width:100%;max-width:560px;height:auto} .spark .line{fill:none;stroke:var(--accent);stroke-width:2.5} .spark circle{fill:var(--accent)} .spark .thr{stroke:#e11d48;stroke-dasharray:4 4} .spark .thrl,.spark .axis{font-size:10px;fill:var(--muted)}
  .sig{display:flex;gap:16px;flex-wrap:wrap} .sig figure{margin:0;border:1px solid var(--line);border-radius:10px;padding:8px} .sig img{width:260px;height:110px;object-fit:contain;background:#fafafa}
  code{font-size:12px;word-break:break-all} .toolbar{float:right} button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer}
  @media print{.toolbar{display:none} main{padding:0}}
</style></head><body><main>
<div class="toolbar"><button onclick="print()">Print / PDF</button> <a href="/api/rooms/${esc(s.room)}/export.json"><button>JSON</button></a></div>
<h1>EyeSee · Visit & Informed Consent Record</h1>
<div class="muted">Session ${esc(s.sessionId)} · started ${esc(time(s.createdAt))} · Doctor: English · Patient: ${esc(lang)}</div>

<h2>Consent</h2>
<div class="grid">
  <div class="card"><b>Procedure</b>${esc(c?.procedure?.doctor || '—')}<br><span class="muted">${esc(c?.procedure?.patient || '')}</span></div>
  <div class="card"><b>Status</b>${esc(c?.status || 'not started')}${c?.signedAt ? `<br><span class="muted">signed ${esc(time(c.signedAt))}</span>` : ''}</div>
  <div class="card"><b>Shared understanding</b>${u.score}/10${c?.scoreAtSign != null ? ` (at signing: ${c.scoreAtSign})` : ''}<br><span class="muted">judge: ${esc(u.source || '—')}</span></div>
</div>
${c?.checkpoints?.length ? `<h2>Checkpoints confirmed by the patient</h2><table><tr><th>#</th><th>English</th><th>${esc(lang)}</th><th>Patient</th></tr>
${c.checkpoints.map((cp, i) => `<tr><td>${i + 1}</td><td>${esc(cp.doctor)}</td><td>${esc(cp.patient)}</td><td>${cp.ack === 'understood' ? `<span class="ok">✓ understood</span>` : cp.ack === 'question' ? `<span class="q">? question</span>` : '—'}<br><span class="muted">${esc(clock(cp.ackTs))}</span></td></tr>`).join('')}</table>` : ''}
${c ? `<h2>EyeSee AI final check</h2>${c.omissions?.length ? `<ul>${c.omissions.map((o) => `<li><b>[${esc(o.severity)}]</b> ${esc(o.doctor)} <span class="muted">/ ${esc(o.patient)}</span></li>`).join('')}</ul>` : '<p>No omissions found.</p>'}${c.overrides?.length ? `<p class="q">The doctor proceeded despite ${c.overrides[0].omissions.length} critical item(s) at ${esc(time(c.overrides[0].ts))}.</p>` : ''}` : ''}
${c?.signatures ? `<h2>Signatures</h2><div class="sig">${['patient', 'doctor'].map((r) => (c.signatures[r] ? `<figure><img src="${c.signatures[r].dataUrl}" alt="${r} signature"><figcaption>${r} · ${esc(time(c.signatures[r].ts))}</figcaption></figure>` : '')).join('')}</div>` : ''}
${c?.hash ? `<p class="muted">Record SHA-256: <code>${esc(c.hash)}</code></p>` : ''}

<h2>Understanding over time</h2>
${sparkline(u.history, s.caps?.consentThreshold ?? 8)}

<h2>Minutes</h2>
<table><tr><th>Time</th><th>Who</th><th>Original</th><th>Translation shown to the other person</th></tr>
${s.entries.map(minutesRow).join('\n')}
</table>
</main></body></html>`;
}

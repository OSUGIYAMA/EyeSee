// EyeSee — doctor's phone. The phone is the doctor's microphone and console: everything said on
// either device lands in one shared transcript, shown here in English and in the headset in the
// patient's language.
import { Link, params, fetchConfig } from '/shared/net.js';
import { Recorder, browserRecognizer } from '/shared/recorder.js';
import { MODES, MODELS, PAIN_TYPES, FEELINGS, CONSENT_ELEMENTS, LANGUAGES, L } from '/shared/catalog.js';
import * as THREE from 'three';
import { Viewer } from '/phone/viewer3d.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const langName = (code) => LANGUAGES[code]?.native || code;

const { room } = params();
localStorage.setItem('eyesee.room', room);
const link = new Link({ room, role: 'doctor' });
let S = null; // latest shared state
let cfg = { caps: {} };
let presence = { doctor: 0, patient: 0 };
fetchConfig().then((c) => {
  cfg = c;
  render();
});

// ================================================================ rendering

link.on('state', (s) => {
  const newSession = S && S.sessionId !== s.sessionId;
  S = s;
  if (newSession) resetFeed();
  render();
});
link.on('presence', (m) => {
  presence = m.roles;
  renderHeader();
});
link.on('link', () => renderHeader());
link.on('toast', (m) => m.text?.doctor && toast(m.text.doctor, m.level === 'error' ? 'alert' : ''));
link.on('alert', (m) => {
  toast(m.text, 'alert');
  navigator.vibrate?.(180);
});
link.on('unlock', (m) => {
  toast(`Shared understanding ${m.score}/10 — consent unlocked`, 'good');
  navigator.vibrate?.([80, 60, 80]);
});
link.on('signed', () => toast('Informed consent recorded ✓', 'good'));

function render() {
  if (!S) return;
  renderHeader();
  renderModes();
  renderMeter();
  renderFeed();
  renderLive();
  renderStage();
  renderTools();
  syncConsentSheet();
  speakNew();
}

function renderHeader() {
  const pill = $('#linkPill');
  const live = link.connected && presence.patient > 0;
  pill.className = `pill ${live ? 'on' : 'off'} ${S?.speaking?.patient ? 'speaking' : ''}`;
  pill.querySelector('span').textContent = !link.connected ? 'Reconnecting…' : live ? `Headset live · ${langName(S?.patientLang)}` : 'Connect headset';
}

function renderModes() {
  const nav = $('#modes');
  if (!nav.children.length) {
    nav.innerHTML = MODES.map((m) => `<button role="tab" data-mode="${m.id}">${m.tab?.en || m.en}<small>${m.tab?.ja || m.ja}</small></button>`).join('');
    nav.onclick = (e) => {
      const b = e.target.closest('button');
      if (b) link.send({ type: 'mode', mode: b.dataset.mode });
    };
  }
  for (const b of nav.children) b.setAttribute('aria-selected', String(b.dataset.mode === S.mode));
}

function renderMeter() {
  const u = S.understanding;
  const thr = S.caps?.consentThreshold ?? 8;
  const show = S.mode === 'consent';
  $('#meter').hidden = !show;
  if (!show) return;
  $('#meter').classList.toggle('good', u.score >= thr);
  $('#meter').classList.toggle('updating', !!u.updating);
  $('#meterScore').textContent = u.score;
  $('#meterCells').innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < u.score ? 'on' : ''} ${i === thr ? 'thr' : ''}"></i>`).join('');
  const detail = $('#meterDetail');
  const els = u.elements || {};
  detail.innerHTML = `
    <div class="next">→ ${esc(u.nextStep || 'Start explaining — the score updates after every utterance.')}</div>
    <div class="els">${CONSENT_ELEMENTS.map((el) => `<span class="${els[el.id] || 'missing'}">${els[el.id] === 'explained' ? '✓' : els[el.id] === 'mentioned' ? '◐' : '○'} ${esc(el.en)}</span>`).join('')}</div>
    <div>Patient understanding: <b>${esc(u.comprehension || 'none')}</b>${u.concerns?.length ? ` · <span style="color:var(--bad)">${u.concerns.length} open concern(s)</span>` : ''}</div>
    ${u.concerns?.length ? `<ul>${u.concerns.map((c) => `<li>${esc(c.doctor)}</li>`).join('')}</ul>` : ''}
    ${u.risky?.length ? `<div class="risk"><b>Phrasing</b>${esc(u.risky[0])}</div>` : ''}
    ${u.rationale?.doctor ? `<div class="src">${esc(u.rationale.doctor)}</div>` : ''}
    <div class="src">Judge: ${u.source === 'jev' ? 'JEV · TypeSafe System One' : esc(u.source || '—')}${u.raw != null ? ` · raw ${u.raw}` : ''}${u.error ? ` · ${esc(u.error)}` : ''}</div>`;
  const btn = $('#consentBtn');
  if (S.consent) {
    btn.disabled = false;
    btn.textContent = S.consent.status === 'signed' ? 'Consent recorded ✓ — view' : 'Consent in progress — view';
  } else {
    btn.disabled = u.score < thr;
    btn.textContent = u.score >= thr ? 'Open informed-consent confirmation →' : `Consent unlocks at ${thr}/10`;
  }
}
$('#meterBar').onclick = () => {
  const d = $('#meterDetail');
  d.hidden = !d.hidden;
  $('#meterBar').setAttribute('aria-expanded', String(!d.hidden));
};
$('#consentBtn').onclick = () => {
  if (S.consent) return openConsentSheet();
  link.send({ type: 'consentOpen' });
  openConsentSheet();
};

// ---------------------------------------------------------------- feed

const nodes = new Map(); // entry id → { el, v }
function resetFeed() {
  nodes.clear();
  $('#feed').innerHTML = '';
}

function renderFeed() {
  const feed = $('#feed');
  if (!S.entries.length) {
    if (!feed.querySelector('.empty')) {
      feed.innerHTML = `<div class="empty"><div class="big">👁️‍🗨️</div><p><b>Ready.</b> Tap <b>Tap to listen</b> and speak English — the patient reads it in ${esc(langName(S.patientLang))} in the headset.<br>Their words appear here in English.</p></div>`;
    }
    return;
  }
  feed.querySelector('.empty')?.remove();
  const ids = new Set(S.entries.map((e) => e.id));
  for (const [id, n] of nodes) if (!ids.has(id)) n.el.remove(), nodes.delete(id);
  for (const e of S.entries) {
    const n = nodes.get(e.id);
    if (n && n.v === e.v) continue;
    const el = renderEntry(e);
    if (n) n.el.replaceWith(el);
    else feed.append(el);
    nodes.set(e.id, { el, v: e.v });
  }
  if (follow) feed.scrollTop = feed.scrollHeight;
}
// Follow new messages unless the doctor scrolled up to re-read.
let follow = true;
$('#feed').addEventListener('scroll', () => {
  const f = $('#feed');
  follow = f.scrollHeight - f.scrollTop - f.clientHeight < 90;
});

function renderEntry(e) {
  const el = document.createElement('div');
  el.dataset.id = e.id;
  if (e.kind === 'speech') {
    const mine = e.speaker === 'doctor';
    el.className = `msg ${e.speaker}`;
    const pendingText = e.pending === 'hearing' ? (mine ? 'Hearing you' : 'Hearing the patient') : 'Translating';
    const text = mine ? e.orig.text : e.tr?.text || (e.pending ? '' : e.orig.text);
    const main = text ? esc(text) : `<span class="dots">${pendingText}</span>`;
    const sub = mine
      ? `<span class="lbl">Patient reads (${esc(langName(S.patientLang))})</span>${e.tr?.text ? esc(e.tr.text) : e.pending ? '<span class="dots">translating</span>' : e.error ? 'translation unavailable' : '—'}`
      : `<span class="lbl">Patient said (${esc(langName(e.orig.lang))})</span>${esc(e.orig.text) || '<span class="dots"></span>'}`;
    const terms = (e.terms || []).length
      ? `<div class="terms">${e.terms.map((t) => `<button class="term" data-entry="${e.id}" data-term="${t.id}">${mine ? '📘' : '🔎'} ${esc(mine ? t.term : t.display || t.term)}${t.image && t.image !== 'pending' ? '<span class="img">🖼</span>' : ''}</button>`).join('')}</div>`
      : '';
    const note = e.note ? `<div class="note"><b>Nuance</b>${esc(e.note)}</div>` : '';
    const risk = e.risk ? `<div class="risk"><b>Phrasing risk</b>${esc(e.risk.issue)}<br><i>Try: ${esc(e.risk.suggestion)}</i></div>` : '';
    const badges = [e.iSee && `<span class="badge ok">👍 ${mine ? 'Patient: I see' : 'You: I see'}</span>`, e.confused && `<span class="badge q">🤔 ${mine ? "Patient didn't understand" : 'Asked to explain'}</span>`, e.error === 'speech' && '<span class="badge err">speech failed</span>'].filter(Boolean).join('');
    el.innerHTML = `<div class="who">${mine ? 'You' : 'Patient'} · ${e.ts.slice(11, 16)}${e.source === 'voice' ? ' · 🎙' : ''}</div>
      <div class="bubble ${e.pending ? 'pending' : ''}"><div class="main">${main}</div><div class="sub">${sub}</div>${terms}${note}${risk}</div>
      ${badges ? `<div class="badges">${badges}</div>` : ''}`;
    return el;
  }
  if (e.kind === 'ai') {
    const a = e.ai;
    el.className = 'ai-card';
    el.innerHTML = `<div class="q"><b>✦ EyeSee AI</b> · ${a.from === 'doctor' ? 'you asked' : 'the patient asked'}: “${esc(a.question?.doctor)}”</div>
      ${a.pending ? '<div class="a"><span class="dots">Thinking</span></div>' : `<div class="a">${esc(a.answer?.doctor)}</div><div class="a2">${esc(a.answer?.patient)}</div>`}
      ${a.omissions?.length ? `<ul>${a.omissions.map((o) => `<li class="${o.severity}">${o.severity === 'critical' ? '⚠︎ ' : ''}${esc(o.doctor)}</li>`).join('')}</ul>` : ''}
      ${a.image === 'pending' ? '<div class="a2"><span class="dots">Drawing an illustration</span></div>' : a.image ? `<img src="${esc(a.image)}" alt="">${a.imageCaption ? `<div class="a2">${esc(a.imageCaption.doctor)}</div>` : ''}` : ''}
      ${a.sources?.length ? `<div class="src">Sources: ${a.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</div>` : ''}`;
    return el;
  }
  el.className = `event ${e.kind === 'system' ? 'system' : e.speaker}`;
  el.innerHTML = `${esc(e.text?.doctor)}${e.help ? `<div class="help"><b>✦ Try saying it this way</b>${esc(e.help.doctorSuggestion)}</div>` : ''}`;
  return el;
}

$('#feed').addEventListener('click', (ev) => {
  const t = ev.target.closest('.term');
  if (t) openTermSheet(t.dataset.entry, t.dataset.term);
});

function renderLive() {
  const live = $('#live');
  const pending = S.entries.filter((e) => e.pending && e.kind === 'speech');
  let html = '';
  if (S.aiListening?.patient) html = '<span class="wave ai"><i></i><i></i><i></i><i></i></span> Patient is asking EyeSee AI…';
  else if (S.speaking?.patient) html = '<span class="wave"><i></i><i></i><i></i><i></i></span> Patient is speaking…';
  else if (S.aiBusy) html = '<span class="wave ai"><i></i><i></i><i></i><i></i></span> EyeSee AI is thinking…';
  else if (pending.length) html = `<span class="wave doc"><i></i><i></i><i></i><i></i></span> ${pending[0].speaker === 'patient' ? 'Interpreting the patient…' : 'Interpreting for the patient…'}`;
  live.hidden = !html;
  live.innerHTML = html;
}

// ---------------------------------------------------------------- stage (shared tool)

let viewer = null;
function ensureViewer(host) {
  let canvas = host.querySelector('canvas.viewer');
  if (!canvas) {
    host.innerHTML = '<canvas class="viewer"></canvas><div class="viewer-hint">drag to rotate · tap a part</div><div class="extra"></div>';
    canvas = host.querySelector('canvas');
    viewer?.stop();
    viewer = new Viewer(canvas, {
      onRotate: (yaw, pitch) => link.send({ type: 'modelView', yaw, pitch }),
      onPick: ({ part, local, mesh }) => {
        const st = S.stage;
        if (st?.tool === 'body' && local && viewer.current?.regionAt) {
          const r = viewer.current.regionAt(local, mesh);
          if (r) link.send({ type: 'modelHighlight', part: r.id });
        } else if (st?.tool === 'model') link.send({ type: 'modelHighlight', part });
      },
    });
  }
  return host.querySelector('.extra');
}

let stageKey = '';
function renderStage() {
  const st = S.stage;
  const box = $('#stage');
  if (!st || (S.consent && S.consent.status !== 'cancelled')) {
    box.hidden = true;
    viewer?.hide();
    stageKey = '';
    return;
  }
  box.hidden = false;
  const body = $('#stageBody');
  const key = `${st.tool}:${st.modelId || ''}`;
  if (key !== stageKey) {
    body.innerHTML = '';
    stageKey = key;
  }
  const title = $('#stageTitle');
  const sub = $('#stageSub');

  if (st.tool === 'pain') {
    const p = PAIN_TYPES.find((x) => x.id === st.type);
    title.textContent = '🩹 Pain quality';
    sub.textContent = p ? (st.intensity == null ? 'patient is rating intensity…' : 'selected by patient') : 'patient is choosing in the headset…';
    const extra = ensureViewer(body);
    if (p) viewer.show('pain', p.anim);
    else viewer.hide();
    extra.innerHTML = p
      ? `<div class="pain-result"><div class="n">${st.intensity ?? '–'}<small style="font-size:14px">/10</small></div><div><b>${esc(p.en)}</b> · “${esc(p.ja)}”<br><span class="muted">${esc(p.enHint)}</span></div></div>`
      : `<div class="waiting">10 animated sensations are floating in front of the patient (ずきずき, ちくちく, しめつけ…). Their choice appears here.</div>`;
    return;
  }
  if (st.tool === 'feelings') {
    title.textContent = '💬 Feelings';
    sub.textContent = 'patient is choosing…';
    viewer?.hide();
    body.innerHTML = `<div class="chips">${(st.selected || []).map((id) => FEELINGS.find((f) => f.id === id)).filter(Boolean).map((f) => `<span class="chip">${f.emoji} ${esc(f.en)}</span>`).join('') || '<span class="waiting">Nothing selected yet.</span>'}</div>`;
    return;
  }
  if (st.tool === 'image') {
    title.textContent = '🖼 Illustration';
    sub.textContent = 'shown to both';
    viewer?.hide();
    body.innerHTML = `<img class="full" src="${esc(st.url)}" alt=""><div class="waiting">${esc(st.caption?.doctor || '')}</div>`;
    return;
  }
  if (st.tool === 'model' || st.tool === 'body') {
    const id = st.tool === 'body' ? 'body' : st.modelId;
    const m = MODELS.find((x) => x.id === id);
    title.textContent = `${m?.icon || '🧊'} ${m?.en || id}`;
    sub.textContent = st.tool === 'body' ? 'patient points where it hurts' : 'synced with the headset';
    const extra = ensureViewer(body);
    viewer.show('model', id).then((obj) => {
      if (!obj || S.stage !== st) return;
      obj.highlight?.(st.highlight || null);
      if (obj.setStep && st.step != null && obj._step !== st.step) obj.setStep((obj._step = st.step));
      if (st.tool === 'body' && obj.addMarker) {
        const sig = (st.points || []).map((p) => p.id).join(',');
        if (obj._pts !== sig) {
          obj.clearMarkers();
          for (const p of st.points || []) if (p.point) obj.addMarker(new THREE.Vector3(...p.point));
          obj._pts = sig;
        }
      }
      if (st.viewBy !== 'doctor') viewer.setView(st.yaw || 0, st.pitch || 0);
      if (st.tool === 'model' && id !== 'artery' && (extra.dataset.for !== id || extra.dataset.hl !== String(st.highlight))) {
        extra.dataset.for = id;
        extra.dataset.hl = String(st.highlight);
        extra.innerHTML = `<div class="chips">${(obj.parts || []).map((p) => `<button class="chip part ${p.id === st.highlight ? 'on' : ''}" data-part="${p.id}">${esc(p.label.en)}</button>`).join('')}</div>`;
        extra.querySelector('.chip.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
      }
    });
    if (st.tool === 'body') {
      extra.innerHTML = `<div class="chips">${(st.points || []).map((p) => `<span class="chip">📍 ${esc(p.region.label.en)}</span>`).join('') || '<span class="waiting">Waiting for the patient to point… (tap the body to ask “here?”)</span>'}${st.points?.length ? '<button class="chip" data-act="clear">Clear</button>' : ''}</div>`;
    } else if (id === 'artery') {
      const n = st.step || 0;
      import('/shared/models/artery.js').then(({ meta }) => {
        const cap = meta.steps?.[n];
        extra.innerHTML = `<div class="steps"><button data-act="prev">◀</button><p><b>Step ${n + 1}/${meta.steps.length}</b> · ${esc(cap?.en || '')}</p><button data-act="next">▶</button></div>`;
      });
    }
  }
}
$('#stageBody').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const st = S.stage;
  if (b.dataset.part) link.send({ type: 'modelHighlight', part: b.dataset.part === st.highlight ? null : b.dataset.part });
  if (b.dataset.act === 'prev') link.send({ type: 'modelStep', step: Math.max(0, (st.step || 0) - 1) });
  if (b.dataset.act === 'next') link.send({ type: 'modelStep', step: Math.min(4, (st.step || 0) + 1) });
  if (b.dataset.act === 'clear') link.send({ type: 'bodyClear' });
});
$('#stageClose').onclick = () => link.send({ type: 'stage', stage: null });

function renderTools() {
  for (const b of $('#tools').children) {
    const t = b.dataset.tool;
    b.classList.toggle('on', !!S.stage && (S.stage.tool === t || (t === 'models' && S.stage.tool === 'model')));
  }
}
$('#tools').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const t = b.dataset.tool;
  if (t === 'models') return openModelSheet();
  link.send({ type: 'stage', stage: S.stage?.tool === t ? null : { tool: t } });
};

// ================================================================ microphone

const micBtn = $('#micBtn');
let listening = false;
const rec = new Recorder({
  onSegment: (blob, meta) => link.postAudio(blob, meta.target).catch((err) => toast(err.message, 'alert')),
  onSpeaking: (on) => {
    micBtn.classList.toggle('talking', on);
    link.send({ type: 'vad', speaking: on });
  },
  onLevel: (lv) => (micBtn.querySelector('.ring').style.transform = `scaleX(${listening ? lv : 0})`),
  // Don't start a doctor utterance while the patient's headset reports they're talking.
  gate: () => !S?.speaking?.patient,
});
let webSpeech = null;

micBtn.onclick = async () => {
  listening = !listening;
  micBtn.setAttribute('aria-pressed', String(listening));
  $('#micLabel').textContent = listening ? 'Listening — tap to pause' : 'Tap to listen';
  try {
    if (cfg.caps?.stt) await rec.setListening(listening);
    else {
      webSpeech ||= browserRecognizer('en-US', (text) => link.send({ type: 'text', text, source: 'webspeech' }), (on) => link.send({ type: 'vad', speaking: on }));
      if (!webSpeech) throw new Error('No speech recognition available — use the keyboard');
      webSpeech.set(listening);
    }
  } catch (err) {
    listening = false;
    micBtn.setAttribute('aria-pressed', 'false');
    $('#micLabel').textContent = 'Tap to listen';
    toast(err.message || 'Microphone unavailable', 'alert');
  }
};

// ---------------------------------------------------------------- EyeSee AI: hold to talk, tap for quick asks

const aiBtn = $('#aiBtn');
let holdTimer = null;
let holding = false;
aiBtn.addEventListener('contextmenu', (e) => e.preventDefault());
aiBtn.addEventListener('pointerdown', (e) => {
  aiBtn.setPointerCapture(e.pointerId);
  holdTimer = setTimeout(async () => {
    holding = true;
    aiBtn.classList.add('hold');
    $('#aiOverlay').hidden = false;
    navigator.vibrate?.(30);
    link.send({ type: 'aiListening', on: true });
    try {
      await rec.pttStart();
    } catch (err) {
      toast(err.message, 'alert');
    }
  }, 260);
});
const aiUp = () => {
  clearTimeout(holdTimer);
  if (holding) {
    holding = false;
    aiBtn.classList.remove('hold');
    $('#aiOverlay').hidden = true;
    link.send({ type: 'aiListening', on: false });
    rec.pttEnd(true);
  } else openAISheet();
};
aiBtn.addEventListener('pointerup', aiUp);
aiBtn.addEventListener('pointercancel', () => {
  clearTimeout(holdTimer);
  if (holding) rec.pttEnd(false), (holding = false), aiBtn.classList.remove('hold'), ($('#aiOverlay').hidden = true), link.send({ type: 'aiListening', on: false });
});

// ---------------------------------------------------------------- typing

$('#kbdBtn').onclick = () => {
  const f = $('#typeForm');
  f.hidden = !f.hidden;
  if (!f.hidden) $('#typeInput').focus();
};
$('#typeForm').onsubmit = (e) => {
  e.preventDefault();
  const v = $('#typeInput').value.trim();
  if (!v) return;
  link.send({ type: 'text', text: v });
  $('#typeInput').value = '';
};

// ================================================================ sheets

let sheetKind = null;
function openSheet(kind, html) {
  sheetKind = kind;
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
}
function closeSheet() {
  sheetKind = null;
  $('#sheet').hidden = true;
}
$('#sheet').addEventListener('click', (e) => {
  if (e.target === $('#sheet') || e.target.closest('[data-close]')) closeSheet();
});

function openModelSheet() {
  openSheet(
    'models',
    `<h2>Show in 3D</h2><p class="muted">Appears in front of the patient and here, synced.</p><div class="list">${MODELS.map((m) => `<button class="row" data-model="${m.id}"><span class="ico">${m.icon}</span><span><b>${esc(m.en)}</b><small>${esc(m.ja)}</small></span></button>`).join('')}</div><button class="btn" data-close>Cancel</button>`,
  );
  $('#sheetBody').onclick = (e) => {
    const b = e.target.closest('[data-model]');
    if (!b) return;
    const id = b.dataset.model;
    link.send({ type: 'stage', stage: id === 'body' ? { tool: 'body' } : { tool: 'model', modelId: id } });
    closeSheet();
  };
}

function openAISheet() {
  const presets = [
    ['Did I forget anything?', 'Check what’s missing for informed consent'],
    ['Explain the last thing I said more simply for the patient.', 'Simplify'],
    ['Show the patient where this is on a 3D model.', 'Visualize'],
  ];
  openSheet(
    'ai',
    `<h2>✦ EyeSee AI</h2><p class="muted">Shared with the patient — they see the question and answer in ${esc(langName(S.patientLang))}. Tip: hold the ✦ button and speak.</p>
    <div class="list">${presets.map(([q, d]) => `<button class="row" data-q="${esc(q)}"><span class="ico">✦</span><span><b>${esc(q)}</b><small>${esc(d)}</small></span></button>`).join('')}</div>
    <form id="aiForm" class="type-form"><input id="aiInput" placeholder="Ask anything…" autocomplete="off"><button class="send" style="background:var(--ai)">Ask</button></form>`,
  );
  $('#sheetBody').onclick = (e) => {
    const b = e.target.closest('[data-q]');
    if (b) link.send({ type: 'ask', text: b.dataset.q }), closeSheet();
  };
  $('#aiForm').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#aiInput').value.trim();
    if (v) link.send({ type: 'ask', text: v }), closeSheet();
  };
}

function openTermSheet(entryId, termId) {
  const draw = () => {
    const e = S.entries.find((x) => x.id === entryId);
    const t = e?.terms?.find((x) => x.id === termId);
    if (!t) return closeSheet();
    const forPatient = t.audience === 'patient';
    openSheet(
      `term:${entryId}:${termId}`,
      `<div class="term-sheet"><div class="muted">${forPatient ? `Explained to the patient in ${esc(langName(S.patientLang))}` : 'Nuance for you'}</div>
       <div class="disp">${esc(t.display)}</div><div class="orig">${esc(t.term)}</div><div class="exp">${esc(t.explanation)}</div>
       ${t.image === 'pending' ? '<div class="spinner"></div>' : t.image ? `<img src="${esc(t.image)}" alt="">` : cfg.caps?.image ? `<button class="btn ai" data-img>🖼 Generate an illustration for both</button>` : ''}
       <button class="btn" data-close>Close</button></div>`,
    );
    const b = $('#sheetBody [data-img]');
    if (b) b.onclick = () => link.send({ type: 'termImage', entryId, termId });
  };
  draw();
  termSheetRedraw = draw;
}
let termSheetRedraw = null;

// ---------------------------------------------------------------- menu & pairing

$('#linkPill').onclick = () => openMenu();
$('#menuBtn').onclick = () => openMenu();

function openMenu() {
  const host = cfg.lan?.[0] ? `${cfg.lan[0]}:${cfg.ports.https}` : location.host;
  const questUrl = `https://${host}/quest?room=${room}`;
  const doctorUrl = `https://${host}/phone?room=${room}`;
  openSheet(
    'menu',
    `<h2>Session</h2><p class="muted">Room <b>${esc(room)}</b> · ${presence.patient ? '🟢 headset connected' : '⚪️ headset not connected'} · ${link.rtt != null ? `${link.rtt} ms` : ''}</p>
    <h3>Connect the patient's Quest</h3>
    <div class="qr"><img src="/api/qr?text=${encodeURIComponent(questUrl)}" alt="QR"><div><p class="muted">Open in the Quest browser:</p><code>${esc(questUrl)}</code></div></div>
    <p class="muted" style="font-size:12.5px">Same Wi-Fi as this server. Accept the certificate warning once, then tap “Start” in the headset. Over USB: <code>adb reverse tcp:${cfg.ports?.http || 8080} tcp:${cfg.ports?.http || 8080}</code> and open <code>http://localhost:${cfg.ports?.http || 8080}/quest</code>.</p>
    <h3>Patient language</h3>
    <select id="langSel">${Object.entries(LANGUAGES).filter(([c]) => c !== 'en').map(([c, l]) => `<option value="${c}" ${c === S.patientLang ? 'selected' : ''}>${esc(l.native)} — ${esc(l.name)}</option>`).join('')}</select>
    <h3>Options</h3>
    <label class="row"><input type="checkbox" id="ttsChk" ${tts ? 'checked' : ''}> <span><b>Read the patient aloud</b><small>Speaks the English translation on this phone</small></span></label>
    <h3>Demo visit</h3>
    <p class="muted" style="font-size:12.5px">Scripted chest-pain → PCI consent story (step ${S.demo.index}/${cfg.demoSteps || '?'}). Uses live AI if configured.</p>
    <div class="grid2"><button class="btn" data-act="demoNext">▶ Next line</button><button class="btn" data-act="${S.demo.playing ? 'demoStop' : 'demoPlay'}">${S.demo.playing ? '⏸ Pause' : '⏩ Auto-play'}</button></div>
    <h3>Record</h3>
    <div class="grid2"><a class="btn" href="/record/${esc(room)}" target="_blank">📄 Minutes & consent</a><button class="btn danger" data-act="newSession">New visit</button></div>
    <p class="muted" style="font-size:12px;margin-top:14px">AI: language ${esc(cfg.caps?.llm || 'offline')} · speech ${esc(cfg.caps?.stt || 'browser')} · images ${esc(cfg.caps?.image || 'off')} · judge ${esc(cfg.caps?.judge || '')}<br>Phone link for another device: <code>${esc(doctorUrl)}</code></p>
    <button class="btn" data-close>Close</button>`,
  );
  $('#langSel').onchange = (e) => link.send({ type: 'patientLang', lang: e.target.value });
  $('#ttsChk').onchange = (e) => {
    tts = e.target.checked;
    localStorage.setItem('eyesee.tts', tts ? '1' : '');
  };
  $('#sheetBody').onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'newSession' && !confirm('Start a new visit? The current minutes are saved.')) return;
    if (act === 'newSession') link.send({ type: 'newSession' });
    else link.send({ type: act });
    closeSheet();
  };
}

// ---------------------------------------------------------------- consent sheet

let consentSeen = null;
function syncConsentSheet() {
  const c = S.consent;
  if (!c) {
    if (sheetKind === 'consent') closeSheet();
    consentSeen = null;
    return;
  }
  if (consentSeen !== c.status && ['preparing', 'precheck', 'signing', 'signed'].includes(c.status)) openConsentSheet();
  consentSeen = c.status;
  if (sheetKind === 'consent') drawConsent();
  else if (sheetKind?.startsWith('term:')) termSheetRedraw?.();
}

function openConsentSheet() {
  sheetKind = 'consent';
  $('#sheet').hidden = false;
  drawConsent(true);
}

let sigDirty = false;
function drawConsent(force) {
  const c = S.consent;
  if (!c) return;
  const body = $('#sheetBody');
  // Keep the signature pad alive while the doctor is signing.
  if (!force && c.status === 'signing' && body.querySelector('.sigpad') && !c.signatures?.doctor) {
    body.querySelector('#patientSig').textContent = c.signatures?.patient ? '✓ Patient has signed in the headset' : 'Waiting for the patient to sign in the headset…';
    return;
  }
  const cps = c.checkpoints || [];
  const cpList = `<div class="list">${cps.map((cp, i) => `<div class="cp ${cp.ack || ''} ${c.status === 'review' && i === c.index ? 'current' : ''}"><span class="st">${cp.ack === 'understood' ? '✓' : cp.ack === 'question' ? '?' : i + 1}</span><div>${esc(cp.doctor)}<small>${esc(cp.patient)}</small></div></div>`).join('')}</div>`;
  const header = `<h2>Informed consent</h2><p class="muted">${esc(c.procedure?.doctor || '')}${c.procedure?.patient ? ` · ${esc(c.procedure.patient)}` : ''}</p>`;
  let html = '';
  if (c.status === 'preparing') html = `${header}<div class="spinner"></div><p style="text-align:center">EyeSee AI is running the final check and writing the checkpoints from the conversation…</p>`;
  else if (c.status === 'precheck') {
    const crit = c.omissions.filter((o) => o.severity === 'critical');
    html = `${header}<h3>AI final check</h3>${c.omissions.length ? `<div class="list">${c.omissions.map((o) => `<div class="omit ${o.severity}"><b>${o.severity}</b><div>${esc(o.doctor)}</div></div>`).join('')}</div>` : '<div class="omit" style="background:var(--ok-soft)"><b style="color:var(--ok)">All clear</b><div>Nothing important seems to be missing.</div></div>'}
      <h3>Checkpoints the patient will confirm</h3>${cpList}
      <button class="btn" data-act="consentCancel">← Go back and discuss</button>
      <button class="btn primary" data-act="proceed">${crit.length ? `Send to patient anyway (${crit.length} critical flagged)` : 'Send checkpoints to the patient →'}</button>`;
  } else if (c.status === 'review') {
    const done = cps.filter((x) => x.ack === 'understood').length;
    const q = cps.filter((x) => x.ack === 'question');
    html = `${header}<p><b>${done}/${cps.length}</b> confirmed in the headset${q.length ? ` · <span style="color:var(--warn);font-weight:700">${q.length} question(s) — answer, then the patient can confirm</span>` : ''}</p>${cpList}<button class="btn" data-act="consentCancel">← Back to discussion</button><button class="btn" data-close>Minimize</button>`;
  } else if (c.status === 'signing') {
    html = `${header}${cpList}<h3>Signatures</h3><p id="patientSig" class="muted">${c.signatures?.patient ? '✓ Patient has signed in the headset' : 'Waiting for the patient to sign in the headset…'}</p>
      ${c.signatures?.doctor ? '<p>✓ You signed.</p>' : `<canvas class="sigpad" id="sigpad"></canvas><div class="grid2"><button class="btn" data-act="sigClear">Clear</button><button class="btn primary" data-act="sign">Sign as physician</button></div>`}`;
  } else if (c.status === 'signed') {
    html = `<div class="signed-hero"><div class="big">🤝</div><h2>Informed consent recorded</h2><p class="muted">Both of you said “I see.” Understanding at signing: ${c.scoreAtSign}/10</p></div>${cpList}<p class="hash">SHA-256 ${esc(c.hash)}</p><a class="btn primary" href="/record/${esc(room)}" target="_blank">📄 Open the signed record</a><button class="btn" data-close>Close</button>`;
  }
  body.innerHTML = html;
  body.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'consentCancel') link.send({ type: 'consentCancel' }), closeSheet();
    if (act === 'proceed') {
      const crit = c.omissions.filter((o) => o.severity === 'critical').length;
      if (crit && !confirm(`${crit} critical item(s) were flagged by the final check. Proceed anyway? This will be recorded.`)) return;
      link.send({ type: 'consentProceed', acknowledge: crit > 0 });
    }
    if (act === 'sigClear') setupSigpad(true);
    if (act === 'sign') {
      if (!sigDirty) return toast('Please sign in the box first');
      link.send({ type: 'sign', dataUrl: $('#sigpad').toDataURL('image/png') });
    }
  };
  if (body.querySelector('#sigpad')) setupSigpad();
}

function setupSigpad(clear) {
  const cv = $('#sigpad');
  const r = cv.getBoundingClientRect();
  cv.width = r.width * 2;
  cv.height = r.height * 2;
  const ctx = cv.getContext('2d');
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1e3a8a';
  sigDirty = false;
  if (clear) ctx.clearRect(0, 0, cv.width, cv.height);
  let last = null;
  const pt = (e) => [(e.clientX - r.left) * 2, (e.clientY - r.top) * 2];
  cv.onpointerdown = (e) => {
    cv.setPointerCapture(e.pointerId);
    last = pt(e);
  };
  cv.onpointermove = (e) => {
    if (!last) return;
    const p = pt(e);
    ctx.beginPath();
    ctx.moveTo(...last);
    ctx.lineTo(...p);
    ctx.stroke();
    last = p;
    sigDirty = true;
  };
  cv.onpointerup = () => (last = null);
}

// ================================================================ misc

let toastTimer = null;
function toast(text, kind = '') {
  const t = $('#toast');
  t.textContent = text;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// Optional: read the patient's translated words aloud on the phone.
let tts = !!localStorage.getItem('eyesee.tts');
const spoken = new Set();
function speakNew() {
  for (const e of S.entries) {
    if (e.kind !== 'speech' || e.speaker !== 'patient' || e.pending || spoken.has(e.id)) continue;
    spoken.add(e.id);
    if (tts && e.tr?.text && Date.now() - Date.parse(e.ts) < 30_000 && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(e.tr.text);
      u.lang = 'en-US';
      speechSynthesis.speak(u);
    }
  }
}

window.__eyesee = { link, get state() { return S; } };

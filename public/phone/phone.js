// EyeSee — the doctor's phone. The doctor holds to talk; the patient's words arrive in English.
// One shared conversation, shown here in the doctor's language and in the headset in the patient's.
import * as THREE from 'three';
import { Link, params, fetchConfig } from '/shared/net.js';
import { Recorder, browserRecognizer } from '/shared/recorder.js';
import { MODES, MODELS, PAIN_TYPES, FEELINGS, CONSENT_ELEMENTS, LANGUAGES } from '/shared/catalog.js';
import { readFor } from '/shared/entries.js';
import { icon } from '/shared/icons.js';
import { Viewer } from '/phone/viewer3d.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const langName = (code) => LANGUAGES[code]?.name || code;

const { room } = params();
localStorage.setItem('eyesee.room', room);
const link = new Link({ room, role: 'doctor' });
let S = null;
let cfg = { caps: {} };
let presence = { doctor: 0, patient: 0 };
const pref = {
  handsFree: localStorage.getItem('eyesee.handsfree') === '1',
  tts: localStorage.getItem('eyesee.tts') === '1',
};

$('#more').innerHTML = icon.ellipsis(24);
$('#stageClose').innerHTML = icon.xmark(14);
$('#plus').innerHTML = icon.plus(22);
$('#talkIcon').innerHTML = icon.mic(20);
$('#typeForm .send').innerHTML = icon.arrowUp(18);
fetchConfig().then((c) => {
  cfg = c;
  render();
});

// ================================================================ state

link.on('state', (s) => {
  if (S && S.sessionId !== s.sessionId) resetFeed();
  S = s;
  render();
});
link.on('presence', (m) => {
  presence = m.roles;
  renderNotice();
});
link.on('link', () => renderNotice());
link.on('toast', (m) => m.text?.doctor && toast(m.text.doctor));
link.on('alert', (m) => {
  toast(m.text, 'attn');
  navigator.vibrate?.(120);
});
link.on('unlock', () => navigator.vibrate?.([60, 50, 60]));

function render() {
  if (!S) return;
  renderNotice();
  renderPhases();
  renderMeter();
  renderFeed();
  renderStage();
  syncSheet();
  speakNew();
}

function renderNotice() {
  const n = $('#notice');
  const msg = !link.connected ? 'Reconnecting…' : presence.patient ? '' : 'Headset not connected';
  n.hidden = !msg;
  n.textContent = msg;
}

function renderPhases() {
  const el = $('#phases');
  if (!el.children.length) {
    el.innerHTML = MODES.map((m) => `<button role="tab" data-mode="${m.id}">${m.tab?.en || m.en}</button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (b) link.send({ type: 'mode', mode: b.dataset.mode });
    };
  }
  for (const b of el.children) b.setAttribute('aria-selected', String(b.dataset.mode === S.mode));
}

// ---------------------------------------------------------------- understanding (consent phase only)

function renderMeter() {
  const u = S.understanding;
  const thr = S.caps?.consentThreshold ?? 8;
  const box = $('#meter');
  box.hidden = S.mode !== 'consent';
  if (box.hidden) return;
  box.classList.toggle('ready', u.score >= thr);
  box.classList.toggle('updating', !!u.updating);
  $('#meterFill').style.width = `${u.score * 10}%`;
  $('#meterThr').style.left = `calc(${thr * 10}% - 1px)`;
  $('#meterScore').innerHTML = `<b>${u.score}</b>/10`;
  $('#meterNext').textContent = u.nextStep || 'Explain the plan. The score updates as you talk.';
  const els = u.elements || {};
  $('#meterDetail').innerHTML =
    CONSENT_ELEMENTS.map((el) => `<div class="check ${els[el.id] || 'missing'}"><i></i>${esc(el.en)}</div>`).join('') +
    `<div class="check ${u.comprehension === 'demonstrated' ? 'explained' : u.comprehension === 'partial' ? 'mentioned' : ''}"><i></i>Patient explained it back</div>` +
    (u.concerns?.length ? u.concerns.map((c) => `<div class="check mentioned"><i></i>${esc(c.doctor)}</div>`).join('') : '') +
    `<div class="meter-src">Scored by ${u.source === 'jev' ? 'JEV' : esc(u.source || '—')} after every utterance${u.rationale?.doctor ? ` · ${esc(u.rationale.doctor)}` : ''}</div>`;
  const btn = $('#consentBtn');
  btn.hidden = !(S.consent || u.score >= thr);
  btn.textContent = S.consent ? (S.consent.status === 'signed' ? 'View Consent' : 'Continue Consent') : 'Confirm Consent';
}
$('#meterRow').onclick = () => {
  const d = $('#meterDetail');
  d.hidden = !d.hidden;
  $('#meterRow').setAttribute('aria-expanded', String(!d.hidden));
};
$('#consentBtn').onclick = () => {
  if (!S.consent) link.send({ type: 'consentOpen' });
  openConsent();
};

// ---------------------------------------------------------------- conversation

const nodes = new Map();
let follow = true;
const feed = $('#feed');
feed.addEventListener('scroll', () => (follow = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90));

function resetFeed() {
  nodes.clear();
  feed.innerHTML = '';
}

// "I see" / "I don't understand" show on the utterance they refer to, not as separate lines.
const shown = (e) => !(e.kind === 'event' && (e.event.type === 'isee' || (e.event.type === 'confused' && !e.help)));

function renderFeed() {
  const visible = S.entries.filter(shown);
  if (!visible.length && !S.speaking?.patient) {
    if (!feed.querySelector('.empty')) feed.innerHTML = `<div class="empty"><b>Ready</b>Hold to talk. The patient reads it in ${esc(langName(S.patientLang))}.</div>`;
    nodes.clear();
    return;
  }
  feed.querySelector('.empty')?.remove();
  const ids = new Set(visible.map((e) => e.id));
  for (const [id, n] of nodes) if (!ids.has(id) && id !== 'typing') n.el.remove(), nodes.delete(id);
  for (const e of visible) {
    const n = nodes.get(e.id);
    const key = `${e.v}:${S.patientLang}`;
    if (n && n.key === key) continue;
    const el = entryEl(e);
    if (n) n.el.replaceWith(el);
    else feed.insertBefore(el, nodes.get('typing')?.el || null);
    nodes.set(e.id, { el, key });
  }
  // The patient is talking right now: a typing bubble, like Messages.
  const typing = nodes.get('typing');
  if (S.speaking?.patient && !typing) {
    const el = document.createElement('div');
    el.className = 'row them';
    el.innerHTML = '<div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>';
    feed.append(el);
    nodes.set('typing', { el });
  } else if (!S.speaking?.patient && typing) typing.el.remove(), nodes.delete('typing');
  if (follow) feed.scrollTop = feed.scrollHeight;
}

function withTerms(text, terms) {
  let html = esc(text);
  for (const t of terms || []) {
    const word = esc(t.term);
    if (!word) continue;
    const i = html.toLowerCase().indexOf(word.toLowerCase());
    if (i >= 0) html = `${html.slice(0, i)}<u data-term="${t.id}">${html.slice(i, i + word.length)}</u>${html.slice(i + word.length)}`;
  }
  return html;
}

function entryEl(e) {
  const el = document.createElement('div');
  el.dataset.id = e.id;
  if (e.kind === 'speech') {
    const me = e.speaker === 'doctor';
    const r = readFor(e, S.doctorLang);
    el.className = `row ${me ? 'me' : 'them'}`;
    const main = e.pending && !r.main ? '<span class="typing"><i></i><i></i><i></i></span>' : withTerms(r.main, (e.terms || []).filter((t) => t.audience === 'patient'));
    const other = readFor(e, S.patientLang).main;
    const sub = me ? (other && other !== r.main ? other : '') : r.sub;
    const nuance = (e.terms || []).filter((t) => t.audience === 'doctor');
    el.innerHTML = `<div class="bubble ${e.pending ? 'pending' : ''}" data-entry="${e.id}">${main}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : e.pending && r.main ? '<div class="sub">Translating…</div>' : ''}
      ${e.iSee ? `<div class="meta ok">${me ? 'Understood' : 'You understood'}</div>` : e.confused ? `<div class="meta q">${me ? 'Not understood' : 'You asked again'}</div>` : ''}
      ${e.error ? `<div class="meta q">${e.error === 'speech' ? 'Could not process audio' : 'Not translated'}</div>` : ''}
      ${e.note ? `<div class="foot">${esc(e.note)}</div>` : ''}
      ${nuance.map((t) => `<div class="foot"><b>${esc(t.display)}</b> <span>${esc(t.explanation)}</span></div>`).join('')}
      ${e.risk ? `<div class="foot risk">${esc(e.risk.issue)}<br><span>Try: ${esc(e.risk.suggestion)}</span></div>` : ''}`;
    return el;
  }
  if (e.kind === 'ai') {
    const a = e.ai;
    el.className = 'ai';
    el.innerHTML = `<div class="ai-q"><span class="orb"></span>${a.from === 'doctor' ? 'You asked' : 'Patient asked'} · ${esc(a.question?.doctor)}</div>
      ${a.pending ? '<div class="ai-a"><span class="typing"><i></i><i></i><i></i></span></div>' : `<div class="ai-a">${esc(a.answer?.doctor)}</div>`}
      ${a.omissions?.length ? `<ul>${a.omissions.map((o) => `<li class="${o.severity}">${esc(o.doctor)}</li>`).join('')}</ul>` : ''}
      ${a.image && a.image !== 'pending' ? `<img src="${esc(a.image)}" alt="">` : ''}
      ${!a.pending && a.answer?.patient ? `<div class="ai-a2">${esc(a.answer.patient)}</div>` : ''}
      ${a.sources?.length ? `<div class="src">${a.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</div>` : ''}`;
    return el;
  }
  el.className = 'caption';
  el.innerHTML = `${esc(e.text?.doctor)}${e.help?.doctorSuggestion ? `<div class="foot help" style="text-align:left;margin:6px auto 0">Try: ${esc(e.help.doctorSuggestion)}</div>` : ''}`;
  return el;
}

feed.addEventListener('click', (ev) => {
  const u = ev.target.closest('u[data-term]');
  if (u) openTerm(u.closest('[data-entry]').dataset.entry, u.dataset.term);
});

// ---------------------------------------------------------------- shared tool / 3D

let viewer = null;
let stageKey = '';
function ensureViewer(body) {
  if (!body.querySelector('canvas.viewer')) {
    body.innerHTML = '<canvas class="viewer"></canvas><div class="extra"></div>';
    viewer?.stop();
    viewer = new Viewer(body.querySelector('canvas'), {
      onRotate: (yaw, pitch) => link.send({ type: 'modelView', yaw, pitch }),
      onPick: ({ part, local, mesh }) => {
        const st = S.stage;
        if (st?.tool === 'body' && local && viewer.current?.regionAt) {
          const r = viewer.current.regionAt(local, mesh);
          if (r) link.send({ type: 'modelHighlight', part: r.id });
        } else if (st?.tool === 'model') link.send({ type: 'modelHighlight', part: part === st.highlight ? null : part });
      },
    });
  }
  return body.querySelector('.extra');
}

function renderStage() {
  const st = S.consent ? null : S.stage;
  const box = $('#stage');
  box.hidden = !st;
  if (!st) {
    viewer?.hide();
    stageKey = '';
    return;
  }
  const body = $('#stageBody');
  const key = `${st.tool}:${st.modelId || ''}`;
  if (key !== stageKey) (body.innerHTML = ''), (stageKey = key);
  const title = $('#stageTitle');

  if (st.tool === 'pain') {
    const p = PAIN_TYPES.find((x) => x.id === st.type);
    title.innerHTML = p ? 'Pain' : 'Pain<small>patient is choosing</small>';
    const extra = ensureViewer(body);
    if (p) viewer.show('pain', p.anim);
    else viewer.hide();
    extra.innerHTML = p ? `<div class="stage-note"><span class="big-num">${st.intensity ?? '–'}</span><b>${esc(p.en)}</b> · ${esc(p.ja)}<br>${esc(p.enHint)}</div>` : '';
    return;
  }
  if (st.tool === 'feelings') {
    title.innerHTML = 'Feelings<small>patient is choosing</small>';
    viewer?.hide();
    const chosen = (st.selected || []).map((id) => FEELINGS.find((f) => f.id === id)).filter(Boolean);
    body.innerHTML = `<div class="pills">${chosen.map((f) => `<span class="pill">${esc(f.en)}</span>`).join('')}</div>`;
    return;
  }
  if (st.tool === 'image') {
    title.textContent = 'Illustration';
    viewer?.hide();
    body.innerHTML = `<img src="${esc(st.url)}" alt=""><div class="stage-note">${esc(st.caption?.doctor || '')}</div>`;
    return;
  }
  const id = st.tool === 'body' ? 'body' : st.modelId;
  const m = MODELS.find((x) => x.id === id);
  title.innerHTML = `${esc(m?.en || id)}<small>${st.tool === 'body' ? 'patient points' : 'shared'}</small>`;
  const extra = ensureViewer(body);
  viewer.show('model', id).then((obj) => {
    if (!obj || S.stage !== st) return;
    obj.highlight?.(st.highlight || null);
    if (obj.setStep && st.step != null && obj._step !== st.step) {
      obj.setStep(st.step, { instant: obj._step === undefined }); // late joiner: jump, don't replay
      obj._step = st.step;
    }
    if (st.tool === 'body' && obj.addMarker) {
      const sig = (st.points || []).map((p) => p.id).join(',');
      if (obj._pts !== sig) {
        obj.clearMarkers();
        for (const p of st.points || []) if (p.point) obj.addMarker(new THREE.Vector3(...p.point));
        obj._pts = sig;
      }
    }
    if (st.viewBy !== 'doctor') viewer.setView(st.yaw || 0, st.pitch || 0);
    if (st.tool === 'model' && !obj.meta?.steps?.length) {
      const sig = `${id}:${st.highlight}`;
      if (extra.dataset.sig !== sig) {
        extra.dataset.sig = sig;
        extra.innerHTML = `<div class="pills">${(obj.parts || []).map((p) => `<button class="pill ${p.id === st.highlight ? 'on' : ''}" data-part="${p.id}">${esc(p.label.en)}</button>`).join('')}</div>`;
        extra.querySelector('.pill.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
      }
    }
  });
  if (st.tool === 'body') {
    extra.innerHTML = `<div class="pills">${(st.points || []).map((p) => `<span class="pill">${esc(p.region.label.en)}</span>`).join('')}${st.points?.length ? '<button class="pill" data-act="clear">Clear</button>' : ''}</div>`;
  } else {
    import(`/shared/models/${id}.js`).then(({ meta }) => {
      if (!meta.steps?.length || S.stage !== st) return;
      const n = st.step || 0;
      extra.dataset.steps = meta.steps.length;
      extra.innerHTML = `<div class="steps"><button class="circle" data-act="prev" aria-label="Previous">${icon.chevronLeft(18)}</button><p><b>${n + 1} of ${meta.steps.length}</b> · ${esc(meta.steps[n]?.en || '')}</p><button class="circle" data-act="next" aria-label="Next">${icon.chevronRight(18)}</button></div>`;
    });
  }
}
$('#stageBody').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  const st = S.stage;
  if (!b || !st) return;
  if (b.dataset.part) link.send({ type: 'modelHighlight', part: b.dataset.part === st.highlight ? null : b.dataset.part });
  if (b.dataset.act === 'prev') link.send({ type: 'modelStep', step: Math.max(0, (st.step || 0) - 1) });
  if (b.dataset.act === 'next') link.send({ type: 'modelStep', step: Math.min(+(b.closest('.extra')?.dataset.steps || 5) - 1, (st.step || 0) + 1) });
  if (b.dataset.act === 'clear') link.send({ type: 'bodyClear' });
});
$('#stageClose').onclick = () => link.send({ type: 'stage', stage: null });

// ================================================================ talking

const talk = $('#talk');
let listening = false;
let holding = false;
const rec = new Recorder({
  onSegment: (blob, meta) => link.postAudio(blob, meta.target, meta.mode).catch((err) => toast(err.message, 'attn')),
  onSpeaking: (on) => link.send({ type: 'vad', speaking: on }),
  onLevel: (lv) => (talk.querySelector('.level').style.transform = `scaleX(${listening || holding ? Math.min(1, lv * 1.4) : 0})`),
  gate: () => !S?.speaking?.patient,
});
let webSpeech = null;
const speechFallback = () => (webSpeech ||= browserRecognizer('en-US', (text) => link.send({ type: 'text', text, source: 'webspeech' })));

function setTalkLabel() {
  talk.classList.toggle('hands-free', pref.handsFree && !listening);
  $('#talkLabel').textContent = holding ? 'Release to Send' : pref.handsFree ? (listening ? 'Listening' : 'Tap to Listen') : 'Hold to Talk';
}
setTalkLabel();

// Hold to talk (default): nothing is recorded unless the doctor is pressing.
talk.addEventListener('pointerdown', async (e) => {
  talk.setPointerCapture(e.pointerId);
  if (pref.handsFree) return;
  holding = true;
  talk.classList.add('active');
  setTalkLabel();
  navigator.vibrate?.(15);
  try {
    if (cfg.caps?.stt) await rec.pttStart('conversation');
    else speechFallback()?.set(true);
  } catch (err) {
    toast(err.message || 'Microphone unavailable', 'attn');
  }
});
const talkUp = async () => {
  if (pref.handsFree) {
    listening = !listening;
    try {
      if (cfg.caps?.stt) await rec.setListening(listening);
      else speechFallback()?.set(listening);
    } catch (err) {
      listening = false;
      toast(err.message, 'attn');
    }
    setTalkLabel();
    return;
  }
  if (!holding) return;
  holding = false;
  talk.classList.remove('active');
  setTalkLabel();
  if (cfg.caps?.stt) rec.pttEnd(true);
  else webSpeech?.set(false);
};
talk.addEventListener('pointerup', talkUp);
talk.addEventListener('pointercancel', talkUp);
talk.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- AI: hold to ask, tap for suggestions

const aiBtn = $('#ai');
let aiTimer = null;
let aiHolding = false;
aiBtn.addEventListener('contextmenu', (e) => e.preventDefault());
aiBtn.addEventListener('pointerdown', (e) => {
  aiBtn.setPointerCapture(e.pointerId);
  aiTimer = setTimeout(async () => {
    aiHolding = true;
    aiBtn.classList.add('active');
    $('#listening').hidden = false;
    navigator.vibrate?.(20);
    link.send({ type: 'aiListening', on: true });
    try {
      await rec.pttStart('ai');
    } catch (err) {
      toast(err.message, 'attn');
    }
  }, 280);
});
const aiUp = (cancel) => {
  clearTimeout(aiTimer);
  if (aiHolding) {
    aiHolding = false;
    aiBtn.classList.remove('active');
    $('#listening').hidden = true;
    link.send({ type: 'aiListening', on: false });
    rec.pttEnd(!cancel);
  } else if (!cancel) openAI();
};
aiBtn.addEventListener('pointerup', () => aiUp(false));
aiBtn.addEventListener('pointercancel', () => aiUp(true));

$('#typeForm').onsubmit = (e) => {
  e.preventDefault();
  const v = $('#typeInput').value.trim();
  if (v) link.send({ type: 'text', text: v });
  $('#typeInput').value = '';
};

// ================================================================ sheets

let sheetKind = null;
let sheetRedraw = null;
function openSheet(kind, html, redraw) {
  sheetKind = kind;
  sheetRedraw = redraw || null;
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
}
function closeSheet() {
  sheetKind = null;
  sheetRedraw = null;
  $('#sheet').hidden = true;
}
$('#sheet').addEventListener('click', (e) => {
  if (e.target === $('#sheet') || e.target.closest('[data-close]')) closeSheet();
});

const cell = (label, { sub = '', val = '', act = '', cls = '', chevron = false, attrs = '' } = {}) =>
  `<button class="cell ${cls}" ${act ? `data-act="${act}"` : ''} ${attrs}><span class="grow">${label}${sub ? `<small>${sub}</small>` : ''}</span>${val ? `<span class="val">${val}</span>` : ''}${chevron ? icon.chevronRight(16) : ''}</button>`;

$('#plus').onclick = () => {
  openSheet(
    'tools',
    `<h2>Show the Patient</h2>
     <div class="group">
       ${cell('Pain', { sub: 'Type and strength', act: 'pain', chevron: true })}
       ${cell('Body', { sub: 'Where it hurts', act: 'body', chevron: true })}
       ${cell('Feelings', { sub: 'How they feel', act: 'feelings', chevron: true })}
     </div>
     <h3>3D Models</h3>
     <div class="group">${MODELS.filter((m) => m.id !== 'body').map((m) => cell(esc(m.en), { act: `model:${m.id}`, chevron: true })).join('')}</div>
     <h3>Input</h3>
     <div class="group">${cell('Type a Message', { act: 'type', chevron: true })}</div>
     <button class="btn plain" data-close>Cancel</button>`,
  );
  $('#sheetBody').onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'type') {
      $('#typeForm').hidden = !$('#typeForm').hidden;
      if (!$('#typeForm').hidden) setTimeout(() => $('#typeInput').focus(), 50);
    } else if (a.startsWith('model:')) link.send({ type: 'stage', stage: { tool: 'model', modelId: a.slice(6) } });
    else link.send({ type: 'stage', stage: { tool: a } });
    closeSheet();
  };
};

function openAI() {
  const presets = ['Did I forget anything?', 'Explain my last point more simply for the patient.', 'Show this on a 3D model.'];
  openSheet(
    'ai',
    `<h2>Ask AI</h2><p class="lead">The patient sees the question and the answer.</p>
     <div class="group">${presets.map((q) => cell(esc(q), { attrs: `data-q="${esc(q)}"` })).join('')}</div>
     <form class="ai-input" id="aiForm"><input id="aiInput" placeholder="Ask anything" autocomplete="off"><button>Ask</button></form>`,
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

function openTerm(entryId, termId) {
  const draw = () => {
    const e = S.entries.find((x) => x.id === entryId);
    const t = e?.terms?.find((x) => x.id === termId);
    if (!t) return closeSheet();
    openSheet(
      'term',
      `<div class="term-title">${esc(t.display)}</div><div class="term-orig">${esc(t.term)} · as the patient reads it</div>
       <div class="term-body">${esc(t.explanation)}</div>
       ${t.image === 'pending' ? '<div class="spinner"></div>' : t.image ? `<img class="term-img" src="${esc(t.image)}" alt="">` : cfg.caps?.image ? '<button class="btn" data-img>Show an Illustration</button>' : ''}
       <button class="btn plain" data-close>Done</button>`,
      draw,
    );
    const b = $('#sheetBody [data-img]');
    if (b) b.onclick = () => link.send({ type: 'termImage', entryId, termId });
  };
  draw();
}

$('#more').onclick = () => openMore();
function openMore() {
  const host = cfg.lan?.[0] ? `${cfg.lan[0]}:${cfg.ports.https}` : location.host;
  const questUrl = `https://${host}/q${room === 'clinic' ? '' : `?room=${room}`}`;
  const draw = () => {
    openSheet(
      'more',
      `<h2>Visit</h2>
       <h3>Patient</h3>
       <div class="group">
         <label class="cell"><span class="grow">Language</span><select id="langSel">${Object.entries(LANGUAGES)
           .filter(([c]) => c !== S.doctorLang)
           .map(([c, l]) => `<option value="${c}" ${c === S.patientLang ? 'selected' : ''}>${esc(l.name)}</option>`)
           .join('')}</select></label>
         ${cell('Headset', { val: presence.patient ? 'Connected' : 'Not connected' })}
       </div>
       ${presence.patient ? '' : `<div class="group" style="margin-top:10px"><div class="qr"><img src="/api/qr?text=${encodeURIComponent(questUrl)}" alt=""><code>${esc(questUrl)}</code></div></div>`}
       <h3>Microphone</h3>
       <div class="group">
         <label class="cell"><span class="grow">Hands-free<small>Listen continuously instead of hold to talk</small></span><input type="checkbox" class="switch" id="hfSw" ${pref.handsFree ? 'checked' : ''}></label>
         <label class="cell"><span class="grow">Read patient aloud</span><input type="checkbox" class="switch" id="ttsSw" ${pref.tts ? 'checked' : ''}></label>
       </div>
       <h3>Record</h3>
       <div class="group">
         <a class="cell link" href="/record/${esc(room)}" target="_blank">View Minutes and Consent</a>
         ${cell('New Visit', { act: 'newSession', cls: 'danger' })}
       </div>
       <h3>Demo</h3>
       <div class="group">
         ${cell('Play Next Line', { act: 'demoNext', sub: `Scripted chest-pain visit · ${S.demo.index}/${cfg.demoSteps || '?'}` })}
         ${cell(S.demo.playing ? 'Pause' : 'Play All', { act: S.demo.playing ? 'demoStop' : 'demoPlay' })}
       </div>
       <button class="btn plain" data-close>Done</button>`,
    );
    bindMore();
  };
  draw();
}
function bindMore() {
  $('#langSel').onchange = (e) => link.send({ type: 'patientLang', lang: e.target.value });
  $('#hfSw').onchange = async (e) => {
    pref.handsFree = e.target.checked;
    localStorage.setItem('eyesee.handsfree', pref.handsFree ? '1' : '');
    if (!pref.handsFree && listening) {
      listening = false;
      await rec.setListening(false);
    }
    setTalkLabel();
  };
  $('#ttsSw').onchange = (e) => {
    pref.tts = e.target.checked;
    localStorage.setItem('eyesee.tts', pref.tts ? '1' : '');
  };
  $('#sheetBody').onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'newSession' && !confirm('Start a new visit? The current minutes are kept.')) return;
    link.send({ type: b.dataset.act });
    closeSheet();
  };
}

// ---------------------------------------------------------------- consent

let consentSeen = null;
function syncSheet() {
  const c = S.consent;
  if (!c && sheetKind === 'consent') closeSheet();
  if (c && consentSeen !== c.status && ['preparing', 'precheck', 'signing', 'signed'].includes(c.status)) openConsent();
  consentSeen = c?.status || null;
  if (sheetKind === 'consent') drawConsent();
  else if (sheetKind === 'term') sheetRedraw?.();
}

function openConsent() {
  sheetKind = 'consent';
  $('#sheet').hidden = false;
  drawConsent(true);
}

let sigDirty = false;
function drawConsent(force) {
  const c = S.consent;
  if (!c) return;
  const body = $('#sheetBody');
  if (!force && c.status === 'signing' && body.querySelector('#sigpad')) {
    body.querySelector('#patientSig').textContent = c.signatures?.patient ? 'The patient has signed.' : 'Waiting for the patient to sign.';
    return;
  }
  const list = `<div class="group">${(c.checkpoints || [])
    .map((cp, i) => `<div class="cp ${cp.ack || ''} ${c.status === 'review' && i === c.index ? 'current' : ''}"><span class="st">${cp.ack === 'understood' ? icon.check(14) : cp.ack === 'question' ? '?' : ''}</span><div>${esc(cp.doctor)}<small>${esc(cp.patient)}</small></div></div>`)
    .join('')}</div>`;
  let html = '';
  if (c.status === 'preparing') html = `<h2>Final Check</h2><p class="lead">Reviewing the conversation.</p><div class="spinner"></div>`;
  else if (c.status === 'precheck') {
    const crit = c.omissions.filter((o) => o.severity === 'critical');
    html = `<h2>Final Check</h2><p class="lead">${esc(c.procedure?.doctor || '')}</p>
      ${c.omissions.length ? `<div class="group">${c.omissions.map((o) => `<div class="omit ${o.severity}"><i></i><span>${esc(o.doctor)}</span></div>`).join('')}</div>` : '<div class="group"><div class="omit"><span>Nothing important is missing.</span></div></div>'}
      <h3>The patient will confirm</h3>${list}
      <button class="btn primary" data-act="proceed">${crit.length ? 'Send Anyway' : 'Send to Patient'}</button>
      <button class="btn plain" data-act="cancel">Keep Discussing</button>`;
  } else if (c.status === 'review') {
    const done = c.checkpoints.filter((x) => x.ack === 'understood').length;
    const q = c.checkpoints.filter((x) => x.ack === 'question').length;
    html = `<h2>Patient Is Confirming</h2><p class="lead">${done} of ${c.checkpoints.length} confirmed${q ? ` · ${q} question${q > 1 ? 's' : ''}` : ''}</p>${list}
      <button class="btn plain" data-act="cancel">Keep Discussing</button><button class="btn plain" data-close>Hide</button>`;
  } else if (c.status === 'signing') {
    html = `<h2>Sign</h2><p class="lead" id="patientSig">${c.signatures?.patient ? 'The patient has signed.' : 'Waiting for the patient to sign.'}</p>
      ${c.signatures?.doctor ? '<p class="lead">You signed.</p>' : `<canvas class="sigpad" id="sigpad"></canvas><button class="btn primary" data-act="sign">Sign as Physician</button><button class="btn plain" data-act="clear">Clear</button>`}`;
  } else if (c.status === 'signed') {
    html = `<div class="done"><div class="mark">${icon.check(32)}</div><h2>Consent Recorded</h2><p>Understanding at signing ${c.scoreAtSign}/10</p></div>${list}
      <p class="hash">SHA-256 ${esc(c.hash)}</p><a class="btn primary" href="/record/${esc(room)}" target="_blank">View Record</a><button class="btn plain" data-close>Done</button>`;
  }
  body.innerHTML = html;
  body.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'cancel') link.send({ type: 'consentCancel' }), closeSheet();
    if (a === 'proceed') {
      const crit = c.omissions.filter((o) => o.severity === 'critical').length;
      if (crit && !confirm(`${crit} critical item${crit > 1 ? 's were' : ' was'} flagged. Send anyway? This is recorded.`)) return;
      link.send({ type: 'consentProceed', acknowledge: crit > 0 });
    }
    if (a === 'clear') setupSig(true);
    if (a === 'sign') {
      if (!sigDirty) return toast('Sign in the box first');
      link.send({ type: 'sign', dataUrl: $('#sigpad').toDataURL('image/png') });
    }
  };
  if (body.querySelector('#sigpad')) setupSig();
}

function setupSig(clear) {
  const cv = $('#sigpad');
  const r = cv.getBoundingClientRect();
  cv.width = r.width * 2;
  cv.height = r.height * 2;
  const ctx = cv.getContext('2d');
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = getComputedStyle(document.body).color;
  sigDirty = false;
  if (clear) ctx.clearRect(0, 0, cv.width, cv.height);
  let last = null;
  const pt = (e) => [(e.clientX - r.left) * 2, (e.clientY - r.top) * 2];
  cv.onpointerdown = (e) => (cv.setPointerCapture(e.pointerId), (last = pt(e)));
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
  toastTimer = setTimeout(() => (t.hidden = true), 2800);
}

const spoken = new Set();
function speakNew() {
  for (const e of S.entries) {
    if (e.kind !== 'speech' || e.speaker !== 'patient' || e.pending || spoken.has(e.id)) continue;
    spoken.add(e.id);
    const text = readFor(e, S.doctorLang).main;
    if (pref.tts && text && Date.now() - Date.parse(e.ts) < 30_000 && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      speechSynthesis.speak(u);
    }
  }
}

window.__eyesee = { link, get state() { return S; } };

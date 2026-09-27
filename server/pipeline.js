// The live pipeline: speech from either device → one shared minutes stream → both devices.
// Doctor audio comes from the phone mic, patient audio from the Quest mic; each entry is shown
// to both sides (original + translation), and during consent every entry re-scores understanding.
import { config, llmProvider } from './config.js';
import { FEELINGS, PAIN_TYPES, MODES, L } from '../public/shared/catalog.js';
import { interpret, hearAndInterpret, consentPackage, mediate, helpUnderstand, termImagePrompt } from './ai/tasks.js';
import { canHearAudio } from './ai/llm.js';
import { transcribe } from './ai/openai.js';
import { makeImage } from './ai/images.js';
import { assess } from './ai/judge.js';
import { offlineConsentPackage, offlineMediator, offlineHelp, RIGHTS_CHECKPOINT } from './ai/offline.js';
import { DEMO_STEPS, DEMO_CONSENT } from './demo/script.js';
import { newUnderstanding } from './room.js';

const other = (role) => (role === 'doctor' ? 'patient' : 'doctor');
const langOf = (state, role) => (role === 'doctor' ? state.doctorLang : state.patientLang);
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------------------------------------------------------------- speech

/** Audio segment from a device mic. Returns quickly; the entry appears and fills in asynchronously. */
export async function speechAudio(room, role, audio) {
  const s = room.state;
  if (canHearAudio()) {
    // One round trip: transcript + translation + glossary + notes.
    const entry = room.addEntry({ kind: 'speech', speaker: role, orig: { text: '', lang: langOf(s, role) }, tr: null, pending: 'hearing', source: 'voice', terms: [] });
    try {
      const r = await hearAndInterpret(s, { speaker: role, audio });
      const text = (r.transcript || '').trim();
      if (!text || crossTalk(room, role, text, r.sourceLanguage, entry.id)) return dropEntry(room, entry.id);
      applyInterpretation(room, entry.id, role, text, r);
    } catch (err) {
      console.warn('[speech] audio interpretation failed:', err.message);
      room.updateEntry(entry.id, { pending: false, error: 'speech' });
      room.emit({ type: 'toast', level: 'error', text: { doctor: `Speech failed: ${err.message}`, patient: '音声の処理に失敗しました' } });
    }
    return;
  }
  if (config.openai) {
    const text = await transcribe(audio.data, { language: langOf(s, role) === 'en' && role === 'doctor' ? 'en' : undefined, prompt: recentTerms(s) });
    if (text) await speechText(room, role, text, 'voice');
    return;
  }
  room.emit({ type: 'toast', level: 'error', text: { doctor: 'No speech-to-text configured on the server', patient: '音声認識が設定されていません' } }, role);
}

/** Text from a device (typed, browser speech recognition, quick phrase or demo line). */
export async function speechText(room, role, text, source = 'typed', canned = null) {
  text = String(text || '').trim().slice(0, 2000);
  if (!text) return;
  if (source !== 'demo' && isEcho(room, role, text)) return;
  const entry = room.addEntry({ kind: 'speech', speaker: role, orig: { text, lang: langOf(room.state, role) }, tr: null, pending: 'translating', source, terms: [] });
  let r = null;
  if (canned && (!llmProvider() || source === 'demo-offline')) r = canned;
  else if (llmProvider()) {
    try {
      r = await interpret(room.state, { speaker: role, text, seq: entry.seq });
    } catch (err) {
      console.warn('[speech] interpretation failed:', err.message);
      r = canned;
    }
  } else r = canned;
  if (!r) {
    room.updateEntry(entry.id, { pending: false, tr: null, error: 'translation' });
    afterSpeech(room);
    return entry;
  }
  applyInterpretation(room, entry.id, role, text, r);
  return entry;
}

function applyInterpretation(room, id, role, text, r) {
  const s = room.state;
  const listener = other(role);
  const terms = (r.terms || []).slice(0, 4).map((t) => ({
    id: uid(),
    term: t.term,
    display: t.display || t.term,
    explanation: t.explanation,
    visual: !!t.visual,
    audience: listener,
    image: null,
  }));
  room.updateEntry(id, {
    orig: { text, lang: r.sourceLanguage || langOf(s, role) },
    tr: r.translation ? { text: r.translation, lang: langOf(s, listener) } : null,
    terms,
    note: role === 'patient' ? r.doctorNote || null : null,
    risk: role === 'doctor' && r.risk?.issue ? r.risk : null,
    pending: false,
  });
  afterSpeech(room);
}

function dropEntry(room, id) {
  room.state.entries = room.state.entries.filter((e) => e.id !== id);
  room.changed();
}

// Word tokens for Latin text, character bigrams for CJK — enough to recognise the same sentence.
function grams(t) {
  const clean = t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const out = clean.split(/\s+/).filter((w) => w && !/[\u3040-\u9fff]/.test(w));
  const cjk = clean.replace(/[^\u3040-\u9fff]/g, '');
  for (let i = 0; i < cjk.length - 1; i++) out.push(cjk.slice(i, i + 2));
  return out;
}

/** The same sentence captured by the other device's mic within the last 15 s, if any. */
function findEcho(room, role, text, exceptId) {
  const a = new Set(grams(text));
  if (a.size < 3) return null;
  const since = Date.now() - 15_000;
  return room.state.entries.find((e) => {
    if (e.id === exceptId || e.kind !== 'speech' || e.speaker === role || !e.orig.text || Date.parse(e.ts) < since) return false;
    const b = grams(e.orig.text);
    return b.filter((w) => a.has(w)).length / Math.max(a.size, b.length) > 0.6;
  });
}

/**
 * Each person speaks into their own device, but the phone on the desk can also pick up the patient
 * (and vice versa). Decide whether this segment is really the other person's voice:
 *  - the same sentence was already captured by the other device → keep the copy whose spoken
 *    language matches its device's owner (the phone's copy of Japanese speech loses), else first wins;
 *  - the doctor's phone heard the patient's language while the headset reported the patient talking.
 */
function crossTalk(room, role, text, spokenLang, exceptId) {
  const s = room.state;
  const own = langOf(s, role);
  const echo = findEcho(room, role, text, exceptId);
  if (echo) {
    const echoOwn = langOf(s, echo.speaker);
    if (spokenLang === own && echo.orig.lang !== echoOwn) {
      dropEntry(room, echo.id); // the earlier copy was the misattributed one
      return false;
    }
    return true;
  }
  const other = role === 'doctor' ? 'patient' : 'doctor';
  const otherLang = langOf(s, other);
  const otherSpokeRecently = Date.now() - (room.vadAt?.[other] || 0) < 6000;
  return own !== otherLang && spokenLang === otherLang && otherSpokeRecently;
}
const isEcho = (room, role, text) => !!findEcho(room, role, text);

const recentTerms = (s) => s.entries.flatMap((e) => (e.terms || []).map((t) => t.term)).slice(-20).join(', ');

function afterSpeech(room) {
  if (room.state.mode === 'consent') scheduleJudge(room);
}

// ---------------------------------------------------------------- understanding judge

const judgeTimers = new WeakMap();
export function scheduleJudge(room, delay = 900) {
  const t = judgeTimers.get(room) || {};
  clearTimeout(t.timer);
  t.timer = setTimeout(() => runJudge(room), delay);
  judgeTimers.set(room, t);
}

async function runJudge(room) {
  const t = judgeTimers.get(room);
  if (t.running) return void (t.again = true);
  t.running = true;
  const u = room.state.understanding;
  u.updating = true;
  room.changed(false);
  try {
    const sessionId = room.state.sessionId;
    const r = await assess(room.state);
    if (room.state.sessionId !== sessionId || room.state.mode !== 'consent') return;
    const before = u.score;
    Object.assign(u, r, { updating: false });
    u.history.push({ ts: new Date().toISOString(), score: r.score, source: r.source });
    if (before < config.consentThreshold && r.score >= config.consentThreshold) {
      room.emit({ type: 'unlock', score: r.score });
    }
    room.changed();
  } catch (err) {
    console.warn('[judge] failed:', err.message);
    u.updating = false;
    u.error = err.message;
    room.changed(false);
  } finally {
    t.running = false;
    if (t.again) {
      t.again = false;
      scheduleJudge(room, 100);
    }
  }
}

// ---------------------------------------------------------------- mode & stage

export function setMode(room, mode) {
  const s = room.state;
  if (!MODES.some((m) => m.id === mode) || s.mode === mode) return;
  s.mode = mode;
  const m = MODES.find((x) => x.id === mode);
  room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: `Phase: ${m.en}`, patient: `${L(m, s.patientLang)}` }, event: { type: 'mode', mode } });
  if (mode === 'consent') {
    // Understanding starts at 0 when the informed-consent conversation begins.
    s.understanding = newUnderstanding();
    scheduleJudge(room, 300);
  }
  room.changed();
}

export function setStage(room, stage) {
  room.state.stage = stage ? { ...stage, openedAt: Date.now() } : null;
  room.changed();
}

// ---------------------------------------------------------------- patient input tools

export function painType(room, id) {
  const s = room.state;
  const p = PAIN_TYPES.find((x) => x.id === id);
  if (!p) return;
  const stage = s.stage?.tool === 'pain' ? s.stage : (s.stage = { tool: 'pain' });
  stage.type = id;
  stage.phase = 'intensity';
  const text = painText(s, p, stage.intensity);
  if (stage.entryId && room.entry(stage.entryId)) room.updateEntry(stage.entryId, { event: { type: 'pain', id, intensity: stage.intensity ?? null }, text });
  else stage.entryId = room.event('pain', { id, intensity: null }, text, 'patient').id;
  room.changed();
}

export function painIntensity(room, v) {
  const s = room.state;
  const stage = s.stage?.tool === 'pain' ? s.stage : null;
  v = Math.max(0, Math.min(10, Math.round(+v)));
  if (!stage) return;
  stage.intensity = v;
  stage.phase = 'done';
  const p = PAIN_TYPES.find((x) => x.id === stage.type);
  const text = painText(s, p, v);
  if (stage.entryId && room.entry(stage.entryId)) room.updateEntry(stage.entryId, { event: { type: 'pain', id: p?.id ?? null, intensity: v }, text });
  else stage.entryId = room.event('pain', { id: p?.id ?? null, intensity: v }, text, 'patient').id;
  room.changed();
}

function painText(s, p, v) {
  const lv = v == null ? '' : ` — ${v}/10`;
  if (!p) return { doctor: `Pain intensity${lv}`, patient: `痛みの強さ${lv}` };
  return {
    doctor: `Pain quality: ${p.en} (“${p.ja}”) — ${p.enHint}${lv}`,
    patient: `痛みの種類：${p.ja}（${p.jaHint}）${lv}`,
  };
}

export function bodyPoint(room, region, point, role = 'patient') {
  const s = room.state;
  if (!region?.id) return;
  const stage = s.stage?.tool === 'body' ? s.stage : (s.stage = { tool: 'body' });
  stage.points = [...(stage.points || []), { id: uid(), region, point, by: role }].slice(-8);
  const names = stage.points.map((x) => x.region.label);
  const text = { doctor: `Pain location: ${names.map((n) => n.en).join(', ')}`, patient: `痛む場所：${names.map((n) => L(n, s.patientLang)).join('、')}` };
  if (stage.entryId && room.entry(stage.entryId)) room.updateEntry(stage.entryId, { event: { type: 'body', regions: names }, text });
  else stage.entryId = room.event('body', { regions: names }, text, role).id;
  room.changed();
}

export function feeling(room, id) {
  const s = room.state;
  const f = FEELINGS.find((x) => x.id === id);
  if (!f) return;
  room.event('feeling', { id }, { doctor: `Patient feels: ${f.emoji} ${f.en} (${f.ja})`, patient: `気持ち：${f.emoji} ${L(f, s.patientLang)}` }, 'patient');
  if (s.stage?.tool === 'feelings') s.stage.selected = [...new Set([...(s.stage.selected || []), id])];
  if (f.concern) room.emit({ type: 'alert', to: 'doctor', text: `${f.emoji} Patient: ${f.en}` }, 'doctor');
  if (s.mode === 'consent') scheduleJudge(room);
}

// ---------------------------------------------------------------- I see / I don't understand

/** The patient (or doctor) says "I see" to the latest thing the other person said. */
export function iSee(room, role, entryId) {
  const target = entryId ? room.entry(entryId) : room.lastEntry((e) => e.kind === 'speech' && e.speaker === other(role));
  if (target) room.updateEntry(target.id, { iSee: true, confused: false });
  const text = role === 'patient' ? { doctor: '👍 Patient: “I see.”', patient: '👍 わかりました' } : { doctor: '👍 You: “I see.”', patient: '👍 医師：「わかりました」' };
  room.event('isee', { target: target?.id || null }, text, role);
  if (room.state.mode === 'consent') scheduleJudge(room);
}

/** "I don't understand" — flags the utterance, alerts the doctor and asks AI for a simpler explanation. */
export async function confused(room, role, entryId) {
  const s = room.state;
  const target = entryId ? room.entry(entryId) : room.lastEntry((e) => e.kind === 'speech' && e.speaker === other(role));
  if (!target) return;
  room.updateEntry(target.id, { confused: true, iSee: false });
  if (role === 'doctor') {
    // The doctor asking the patient to say it again.
    room.event('confused', { target: target.id }, { doctor: '🤔 You asked the patient to explain more.', patient: '🤔 医師：「もう少し詳しく教えてください」' }, 'doctor');
    return;
  }
  const ev = room.event('confused', { target: target.id }, { doctor: `🤔 Patient didn't understand: “${target.orig.text.slice(0, 90)}”`, patient: '🤔 わからない、を医師に伝えました' }, 'patient');
  if (s.mode === 'consent') scheduleJudge(room);
  let help;
  try {
    help = llmProvider() ? await helpUnderstand(s, target) : offlineHelp(s);
  } catch (err) {
    console.warn('[help] failed:', err.message);
    help = offlineHelp(s);
  }
  room.updateEntry(ev.id, { help });
}

// ---------------------------------------------------------------- images

export async function termImage(room, entryId, termId) {
  const s = room.state;
  const e = room.entry(entryId);
  const t = e?.terms?.find((x) => x.id === termId);
  if (!t || t.image) return;
  if (s.imagesUsed >= config.maxImagesPerSession) return room.emit({ type: 'toast', level: 'info', text: { doctor: 'Image limit reached for this session', patient: '画像の上限に達しました' } });
  s.imagesUsed++;
  t.image = 'pending';
  room.updateEntry(entryId, {});
  try {
    t.image = await makeImage(termImagePrompt(t));
  } catch (err) {
    console.warn('[image] failed:', err.message);
    t.image = null;
    room.emit({ type: 'toast', level: 'error', text: { doctor: `Image failed: ${err.message}`, patient: '画像を作れませんでした' } });
  }
  room.updateEntry(entryId, {});
}

// ---------------------------------------------------------------- EyeSee AI (shared mediator)

export async function askAIAudio(room, role, audio) {
  const s = room.state;
  // Transcribe the question (Gemini hears audio directly; otherwise OpenAI STT).
  let question = '';
  try {
    if (canHearAudio()) {
      const r = await hearAndInterpret(s, { speaker: role, audio });
      question = (r.transcript || '').trim();
    } else if (config.openai) question = await transcribe(audio.data, {});
  } catch (err) {
    console.warn('[ai] question transcription failed:', err.message);
  }
  if (!question) return room.emit({ type: 'toast', level: 'info', text: { doctor: "Didn't catch the question", patient: '質問を聞き取れませんでした' } }, role);
  return askAI(room, role, question);
}

export async function askAI(room, role, question) {
  const s = room.state;
  question = String(question || '').trim().slice(0, 1000);
  if (!question) return;
  const entry = room.addEntry({
    kind: 'ai',
    speaker: 'ai',
    ai: { from: role, question: { doctor: question, patient: question, orig: question }, answer: null, pending: true, omissions: [], model: null, image: null, imageCaption: null, sources: [] },
  });
  s.aiBusy = true;
  room.changed(false);
  let r;
  try {
    r = llmProvider() ? await mediate(s, { from: role, question }) : offlineMediator(s, { question });
  } catch (err) {
    console.warn('[ai] mediator failed:', err.message);
    r = offlineMediator(s, { question });
  }
  s.aiBusy = false;
  const ai = {
    ...room.entry(entry.id).ai,
    question: { doctor: r.questionForDoctor || question, patient: r.questionForPatient || question, orig: question },
    answer: { doctor: r.answerDoctor, patient: r.answerPatient },
    omissions: r.omissions || [],
    model: r.showModel || null,
    imageCaption: r.imageCaption || null,
    sources: r._sources || [],
    pending: false,
  };
  room.updateEntry(entry.id, { ai });
  if (r.showModel?.id) showModel(room, r.showModel);
  if (r.imagePrompt && s.imagesUsed < config.maxImagesPerSession) {
    s.imagesUsed++;
    ai.image = 'pending';
    room.updateEntry(entry.id, {});
    try {
      ai.image = await makeImage(`${r.imagePrompt}\nNo text, letters, numbers or labels in the image.`);
      setStage(room, { tool: 'image', url: ai.image, caption: r.imageCaption || { doctor: '', patient: '' }, entryId: entry.id });
    } catch (err) {
      console.warn('[ai] image failed:', err.message);
      ai.image = null;
    }
    room.updateEntry(entry.id, {});
  }
  if (s.mode === 'consent') scheduleJudge(room);
}

export function showModel(room, { id, highlight = null, step = null }) {
  const s = room.state;
  if (id === 'body') return setStage(room, { tool: 'body', points: s.stage?.tool === 'body' ? s.stage.points : [] });
  const keep = s.stage?.tool === 'model' && s.stage.modelId === id ? s.stage : {};
  setStage(room, { tool: 'model', modelId: id, highlight: highlight ?? keep.highlight ?? null, step: step ?? keep.step ?? 0, yaw: keep.yaw ?? 0, pitch: keep.pitch ?? 0 });
}

// ---------------------------------------------------------------- consent

export async function openConsent(room, { force = false } = {}) {
  const s = room.state;
  if (s.consent && s.consent.status !== 'cancelled') return;
  if (s.understanding.score < config.consentThreshold && !force) {
    return room.emit({ type: 'toast', level: 'info', text: { doctor: `Consent unlocks at ${config.consentThreshold}/10 shared understanding (now ${s.understanding.score}).`, patient: '' } }, 'doctor');
  }
  s.consent = { status: 'preparing', openedAt: new Date().toISOString(), scoreAtOpen: s.understanding.score, checkpoints: [], omissions: [], index: 0, signatures: {}, overrides: [] };
  s.stage = null;
  room.changed();
  let pkg;
  try {
    if (s.demo.used && !llmProvider()) pkg = DEMO_CONSENT;
    else pkg = llmProvider() ? await consentPackage(s) : offlineConsentPackage(s);
  } catch (err) {
    console.warn('[consent] package failed:', err.message);
    pkg = s.demo.used ? DEMO_CONSENT : offlineConsentPackage(s);
  }
  const cps = pkg.checkpoints.filter((c) => c.category !== 'rights');
  cps.push(pkg.checkpoints.find((c) => c.category === 'rights') || RIGHTS_CHECKPOINT);
  Object.assign(s.consent, {
    status: 'precheck',
    procedure: pkg.procedure,
    checkpoints: cps.map((c, i) => ({ id: `cp${i + 1}`, ...c, ack: null, ackTs: null })),
    omissions: pkg.omissions || [],
  });
  room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: `EyeSee AI final check: ${s.consent.omissions.length ? `${s.consent.omissions.length} item(s) to review` : 'nothing missing'}`, patient: '最終チェックを行いました' }, event: { type: 'finalCheck', omissions: s.consent.omissions } });
  room.changed();
}

/** Doctor reviewed the AI final check and sends the checkpoints to the patient. */
export function consentProceed(room, { acknowledgeOmissions = false } = {}) {
  const c = room.state.consent;
  if (!c || c.status !== 'precheck') return;
  const critical = c.omissions.filter((o) => o.severity === 'critical');
  if (critical.length && !acknowledgeOmissions) return;
  if (critical.length) {
    c.overrides.push({ ts: new Date().toISOString(), omissions: critical });
    room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: `Doctor proceeded despite ${critical.length} critical item(s) flagged by the final check.`, patient: '医師が最終チェックの指摘を確認して先に進みました。' }, event: { type: 'override' } });
  }
  c.status = 'review';
  c.index = 0;
  room.changed();
}

export function consentCancel(room) {
  const s = room.state;
  if (!s.consent) return;
  room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: 'Consent step closed to continue the discussion.', patient: '説明の続きに戻ります。' }, event: { type: 'consentCancel' } });
  s.consent = null;
  room.changed();
}

export function consentAck(room, cpId, status) {
  const c = room.state.consent;
  if (!c || !['review', 'signing'].includes(c.status)) return;
  const cp = c.checkpoints.find((x) => x.id === cpId);
  if (!cp || !['understood', 'question'].includes(status)) return;
  cp.ack = status;
  cp.ackTs = new Date().toISOString();
  const i = c.checkpoints.indexOf(cp);
  room.event('checkpoint', { cp: cp.id, status }, status === 'understood' ? { doctor: `✓ Patient confirmed: ${cp.doctor}`, patient: `✓ 確認：${cp.patient}` } : { doctor: `❓ Patient has a question about: ${cp.doctor}`, patient: `❓ 質問：${cp.patient}` }, 'patient');
  if (status === 'question') room.emit({ type: 'alert', to: 'doctor', text: `❓ Question on: ${cp.doctor}` }, 'doctor');
  const next = c.checkpoints.findIndex((x, j) => j > i && x.ack !== 'understood');
  c.index = next >= 0 ? next : c.checkpoints.findIndex((x) => x.ack !== 'understood');
  if (c.checkpoints.every((x) => x.ack === 'understood')) {
    c.status = 'signing';
    c.index = c.checkpoints.length;
  } else if (c.status === 'signing') c.status = 'review';
  scheduleJudge(room);
  room.changed();
}

export function consentGoto(room, index) {
  const c = room.state.consent;
  if (!c || c.status !== 'review') return;
  c.index = Math.max(0, Math.min(c.checkpoints.length - 1, +index || 0));
  room.changed(false);
}

export function sign(room, role, dataUrl) {
  const c = room.state.consent;
  if (!c || c.status !== 'signing' || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.length > 400_000) return;
  c.signatures[role] = { dataUrl, ts: new Date().toISOString() };
  room.event('signature', { role }, role === 'patient' ? { doctor: '✍️ Patient signed.', patient: '✍️ 署名しました' } : { doctor: '✍️ You signed.', patient: '✍️ 医師が署名しました' }, role);
  if (c.signatures.patient && c.signatures.doctor) {
    c.status = 'signed';
    c.signedAt = new Date().toISOString();
    c.scoreAtSign = room.state.understanding.score;
    c.hash = room.hash();
    room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: `Informed consent recorded · SHA-256 ${c.hash.slice(0, 12)}…`, patient: 'インフォームド・コンセントが記録されました' }, event: { type: 'signed' } });
    room.emit({ type: 'signed' });
  }
  room.changed();
  room.save(true);
}

// ---------------------------------------------------------------- demo player

export async function demoNext(room) {
  const s = room.state;
  if (s.demo.index >= DEMO_STEPS.length) return false;
  const step = DEMO_STEPS[s.demo.index++];
  s.demo.used = true;
  room.changed(false);
  if (step.speaker) {
    const canned = { translation: step.tr, sourceLanguage: langOf(s, step.speaker), terms: step.terms || [], doctorNote: step.note || null, risk: null };
    // With AI configured, demo lines go through the live pipeline; otherwise use the pre-written interpretation.
    await speechText(room, step.speaker, step.text, llmProvider() ? 'demo' : 'demo-offline', canned);
  } else if (step.do === 'mode') setMode(room, step.mode);
  else if (step.do === 'stage') setStage(room, step.stage);
  else if (step.do === 'pain') {
    if (s.stage?.tool !== 'pain') setStage(room, { tool: 'pain' });
    painType(room, step.type);
    painIntensity(room, step.intensity);
  } else if (step.do === 'body') {
    if (s.stage?.tool !== 'body') setStage(room, { tool: 'body' });
    bodyPoint(room, step.region, step.point);
  } else if (step.do === 'model') showModel(room, step);
  else if (step.do === 'confused') await confused(room, 'patient');
  else if (step.do === 'isee') iSee(room, 'patient');
  else if (step.do === 'feeling') feeling(room, step.id);
  else if (step.do === 'ai') await askAI(room, step.from, step.question);
  return s.demo.index < DEMO_STEPS.length;
}

export async function demoPlay(room, delay = 2600) {
  const s = room.state;
  if (s.demo.playing) return;
  s.demo.playing = true;
  room.changed(false);
  const sessionId = s.sessionId;
  while (room.state.demo.playing && room.state.sessionId === sessionId) {
    const more = await demoNext(room);
    if (!more) break;
    await new Promise((r) => setTimeout(r, delay));
  }
  room.state.demo.playing = false;
  room.changed(false);
}

export const demoStop = (room) => {
  room.state.demo.playing = false;
  room.changed(false);
};

export const demoLength = () => DEMO_STEPS.length;

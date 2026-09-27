// The live pipeline: speech from either device → one shared minutes stream → both devices.
// Doctor audio comes from the phone mic, patient audio from the Quest mic; each entry is shown
// to both sides (original + translation), and during consent every entry re-scores understanding.
import { config, llmProvider } from './config.js';
import { FEELINGS, PAIN_TYPES, MODES, LANGUAGES, L } from '../public/shared/catalog.js';
import { interpret, hearAndInterpret, consentPackage, mediate, helpUnderstand, termImagePrompt, illustrationPrompt } from './ai/tasks.js';
import { canHearAudio } from './ai/llm.js';
import { transcribe } from './ai/openai.js';
import { makeImage } from './ai/images.js';
import { assess } from './ai/judge.js';
import { offlineConsentPackage, offlineMediator, offlineHelp, RIGHTS_CHECKPOINT } from './ai/offline.js';
import { DEMO_STEPS, DEMO_CONSENT } from './demo/script.js';
import { newUnderstanding } from './room.js';
import { prewarm } from './i18n.js';

const other = (role) => (role === 'doctor' ? 'patient' : 'doctor');

/** Models sometimes answer "Japanese" or "ja-JP" for a language code. */
export function normLang(x) {
  if (!x) return null;
  const v = String(x).trim().toLowerCase();
  const two = v.split(/[-_]/)[0];
  if (LANGUAGES[two]) return two;
  if (two === 'fil') return 'tl';
  return Object.keys(LANGUAGES).find((c) => LANGUAGES[c].name.toLowerCase() === v || LANGUAGES[c].native.toLowerCase() === v) || null;
}

/** Switch the patient's language (doctor's menu, the patient asking AI, or auto-detected speech). */
export function setPatientLang(room, code, how = 'doctor') {
  const s = room.state;
  if (!LANGUAGES[code] || code === s.doctorLang || code === s.patientLang) return false;
  s.patientLang = code;
  room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: `Patient language: ${LANGUAGES[code].name}${how === 'auto' ? ' (detected)' : ''}`, patient: LANGUAGES[code].native }, event: { type: 'language', lang: code, how } });
  room.emit({ type: 'language', lang: code });
  prewarm(code); // translate the headset's interface text now, not when the patient is waiting
  room.changed();
  return true;
}
const langOf = (state, role) => (role === 'doctor' ? state.doctorLang : state.patientLang);
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------------------------------------------------------------- speech

/** Audio segment from a device mic. Returns quickly; the entry appears and fills in asynchronously. */
// Phrases speech models tend to produce from noise or silence.
const PHANTOM = /^(thank you( for watching)?|thanks( for watching)?|you|bye|okay|ok|so|hmm+|uh+|um+|ご視聴ありがとうございました|ありがとうございました|はい|うん)[.!。！…]*$/i;

/**
 * Audio segment from a device mic. Returns quickly; the entry appears and fills in asynchronously.
 * mode 'ptt' = the person held the talk button (intentional); 'vad' = hands-free voice detection,
 * which is filtered hard so background talk and noise never become transcript lines.
 */
export async function speechAudio(room, role, audio, { mode = 'vad' } = {}) {
  const s = room.state;
  if (canHearAudio()) {
    // One round trip: transcript + translation + glossary + notes.
    const entry = room.addEntry({ kind: 'speech', speaker: role, orig: { text: '', lang: langOf(s, role) }, tr: null, pending: 'hearing', source: 'voice', terms: [] });
    try {
      let r = await hearAndInterpret(s, { speaker: role, audio });
      const text = (r.transcript || '').trim();
      const phantom = mode !== 'ptt' && (r.background || PHANTOM.test(text));
      r.sourceLanguage = normLang(r.sourceLanguage);
      if (!text || phantom || crossTalk(room, role, text, r.sourceLanguage, entry.id)) {
        if (phantom && text) console.log(`[speech] ignored background/noise from ${role}: "${text.slice(0, 60)}"`);
        return dropEntry(room, entry.id);
      }
      if (await switchedLanguage(room, role, r.sourceLanguage)) r = await interpret(s, { speaker: role, text, seq: entry.seq });
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
      r.sourceLanguage = normLang(r.sourceLanguage);
      if (await switchedLanguage(room, role, r.sourceLanguage)) r = await interpret(room.state, { speaker: role, text, seq: entry.seq });
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

/**
 * The headset hears only the patient. If they speak a language that is neither the doctor's nor the
 * current patient language, that is their language: switch, and the caller re-interprets.
 */
async function switchedLanguage(room, role, spoken) {
  const s = room.state;
  if (role !== 'patient' || !spoken || spoken === s.patientLang || spoken === s.doctorLang) return false;
  return setPatientLang(room, spoken, 'auto');
}

function applyInterpretation(room, id, role, text, r) {
  const s = room.state;
  // Direction follows the spoken language, not the device: Japanese heard by the doctor's phone is
  // the patient (or a companion) talking, and must reach the doctor in English.
  const toPatient = r.direction ? r.direction === 'toPatient' : role === 'doctor';
  const listener = toPatient ? 'patient' : 'doctor';
  // The headset mic hears only its wearer (who may choose to speak accented English), so only the
  // phone's attribution is corrected.
  const speaker = role === 'doctor' && !toPatient && s.patientLang !== s.doctorLang ? 'patient' : role;
  const terms = cleanTerms(r.terms || [], { audience: listener, lang: langOf(s, listener), origText: text }).map((t) => ({
    id: uid(),
    term: t.term,
    display: t.display || t.term,
    explanation: t.explanation,
    visual: !!t.visual,
    audience: listener,
    image: null,
  }));
  room.updateEntry(id, {
    speaker,
    heardBy: speaker !== role ? role : undefined,
    orig: { text, lang: normLang(r.sourceLanguage) || langOf(s, speaker) },
    tr: r.translation ? { text: r.translation, lang: langOf(s, listener) } : null,
    terms,
    plain: toPatient && r.plain && s.reading?.plain ? { text: r.plain, lang: langOf(s, 'patient'), kana: !!s.reading.kana } : null,
    note: !toPatient ? r.doctorNote || null : null,
    risk: toPatient && r.risk?.issue ? r.risk : null,
    pending: false,
  });
  afterSpeech(room);
}

const CJK_LANGS = new Set(['ja', 'zh', 'ko']);
const squash = (t) => String(t || '').toLowerCase().replace(/[\s\-‐・･.,'’"]/g, '');

/**
 * Glossary hygiene. Patient-facing terms must come from what was actually said and read naturally
 * in the patient's language (no romaji like "ichiou"); at most 4 per utterance.
 */
function cleanTerms(terms, { audience, lang, origText }) {
  const acronym = /^[A-Z0-9]{2,6}$/;
  return terms
    .filter((t) => t?.term && t.explanation)
    .filter((t) => {
      if (audience !== 'patient') return true;
      if (!squash(origText).includes(squash(t.term))) return false; // invented or from another utterance
      if (CJK_LANGS.has(lang)) {
        const latin = (String(t.display || '').match(/[A-Za-z0-9]+/g) || []).filter((w) => !acronym.test(w) && !/^\d+$/.test(w));
        if (latin.length) return false; // romaji / English in the display
        if (/[A-Za-z]{4,}/.test(String(t.explanation).replace(/\b[A-Z0-9]{2,6}\b/g, ''))) return false; // English or romaji in the explanation
      }
      return true;
    })
    .slice(0, 4);
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
  scheduleJudge(room);
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
    if (room.state.sessionId !== sessionId) return;
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
  room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: m.en, patient: `${L(m, s.patientLang)}` }, event: { type: 'mode', mode } });
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

// ---------------------------------------------------------------- symptoms: where, how, how much

// The patient holds the information about the illness. Each symptom is a place on the body, a
// sensation and a strength: made physical in the headset, and shown to the doctor as a map.

function symText(s, sym) {
  const p = PAIN_TYPES.find((x) => x.id === sym.quality);
  const lv = sym.intensity == null ? '' : ` · ${sym.intensity}/10`;
  return {
    doctor: `${sym.region.label.en}${p ? ` — ${p.en} (${p.ja})` : ''}${lv}`,
    patient: `${L(sym.region.label, s.patientLang)}${p ? ` — ${p.ja}` : ''}${lv}`,
  };
}
const symEvent = (sym) => ({ symptom: sym.id, region: sym.region, quality: sym.quality, intensity: sym.intensity });

function touchSymptom(room, sym) {
  const s = room.state;
  if (sym.entryId && room.entry(sym.entryId)) room.updateEntry(sym.entryId, { event: { type: 'symptom', ...symEvent(sym) }, text: symText(s, sym) });
  else sym.entryId = room.event('symptom', symEvent(sym), symText(s, sym), sym.by).id;
  room.changed();
}

const findSym = (s, id) => (s.symptoms || []).find((x) => x.id === (id || s.stage?.active));

/** The patient (or the doctor) points at the body: a new symptom starts there. */
export function symptomPoint(room, region, point, role = 'patient') {
  const s = room.state;
  if (!region?.id) return;
  s.symptoms ||= [];
  const sym = { id: uid(), region: { id: region.id, label: region.label }, point, quality: null, intensity: null, by: role, ts: new Date().toISOString() };
  s.symptoms = [...s.symptoms, sym].slice(-8);
  s.stage = { ...(s.stage?.tool === 'body' ? s.stage : { tool: 'body' }), active: sym.id, highlight: null };
  touchSymptom(room, sym);
}

export function symptomQuality(room, id, quality) {
  const s = room.state;
  const sym = findSym(s, id);
  if (!sym || !PAIN_TYPES.some((p) => p.id === quality)) return;
  sym.quality = quality;
  touchSymptom(room, sym);
}

export function symptomIntensity(room, id, v) {
  const s = room.state;
  const sym = findSym(s, id);
  if (!sym) return;
  sym.intensity = Math.max(0, Math.min(10, Math.round(+v)));
  touchSymptom(room, sym);
}

/** Finished describing this spot (the body stays open to add another). */
export function symptomDone(room) {
  const st = room.state.stage;
  if (st?.tool === 'body') st.active = null;
  room.changed();
}

export function symptomRemove(room, id) {
  const s = room.state;
  const sym = (s.symptoms || []).find((x) => x.id === id);
  if (!sym) return;
  s.symptoms = s.symptoms.filter((x) => x !== sym);
  if (s.stage?.active === id) s.stage.active = null;
  if (sym.entryId) room.updateEntry(sym.entryId, { removed: true });
  room.changed();
}

/** Open a symptom tool from either side (the patient can start telling without being asked). */
export function openTool(room, tool) {
  if (!['body', 'feelings'].includes(tool)) return;
  const st = room.state.stage;
  setStage(room, st?.tool === tool ? null : { tool });
}

// Older clients / scripts: a pain type or strength applies to the spot being described.
export const painType = (room, id) => symptomQuality(room, null, id);
export const painIntensity = (room, v) => symptomIntensity(room, null, v);
export const bodyPoint = symptomPoint;

export function feeling(room, id) {
  const s = room.state;
  const f = FEELINGS.find((x) => x.id === id);
  if (!f) return;
  room.event('feeling', { id }, { doctor: `Patient feels ${f.en.toLowerCase()}`, patient: `気持ち：${L(f, s.patientLang)}` }, 'patient');
  if (s.stage?.tool === 'feelings') s.stage.selected = [...new Set([...(s.stage.selected || []), id])];
  if (f.concern) room.emit({ type: 'alert', to: 'doctor', text: `Patient: ${f.en}` }, 'doctor');
  scheduleJudge(room);
}

// ---------------------------------------------------------------- I see / I don't understand

/** The patient (or doctor) says "I see" to the latest thing the other person said. */
export function iSee(room, role, entryId) {
  const target = entryId ? room.entry(entryId) : room.lastEntry((e) => e.kind === 'speech' && e.speaker === other(role));
  if (target) room.updateEntry(target.id, { iSee: true, confused: false });
  const text = role === 'patient' ? { doctor: 'Patient: I see', patient: 'わかりました' } : { doctor: 'You: I see', patient: '医師：わかりました' };
  room.event('isee', { target: target?.id || null }, text, role);
  scheduleJudge(room);
}

/** "I don't understand" — flags the utterance, alerts the doctor and asks AI for a simpler explanation. */
export async function confused(room, role, entryId) {
  const s = room.state;
  const target = entryId ? room.entry(entryId) : room.lastEntry((e) => e.kind === 'speech' && e.speaker === other(role));
  if (!target) return;
  room.updateEntry(target.id, { confused: true, iSee: false });
  if (role === 'doctor') {
    // The doctor asking the patient to say it again.
    room.event('confused', { target: target.id }, { doctor: 'You asked the patient to say more', patient: '医師：もう少し詳しく教えてください' }, 'doctor');
    return;
  }
  const ev = room.event('confused', { target: target.id }, { doctor: `Patient didn't understand “${target.orig.text.slice(0, 90)}”`, patient: 'わからない' }, 'patient');
  scheduleJudge(room);
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
  if (!t) return;
  const caption = { doctor: t.term, patient: t.display, detail: t.explanation };
  // Already drawn: just bring it up front again.
  if (t.image && t.image !== 'pending') return setStage(room, { tool: 'image', url: t.image, caption, entryId, termId });
  if (t.image === 'pending') return;
  if (s.imagesUsed >= config.maxImagesPerSession) return room.emit({ type: 'toast', level: 'info', text: { doctor: 'Image limit reached for this visit', patient: '' } });
  s.imagesUsed++;
  t.image = 'pending';
  room.updateEntry(entryId, {});
  // Open the picture window right away so the patient sees it being drawn.
  setStage(room, { tool: 'image', url: null, caption, entryId, termId });
  try {
    const prompt = llmProvider() ? await illustrationPrompt({ term: t.term, explanation: t.explanation, context: e.orig.text }) : termImagePrompt(t);
    t.image = await makeImage(prompt);
  } catch (err) {
    console.warn('[image] failed:', err.message);
    t.image = null;
    room.emit({ type: 'toast', level: 'error', text: { doctor: `Image failed: ${err.message}`, patient: '' } });
  }
  room.updateEntry(entryId, {});
  const st = s.stage;
  if (st?.tool === 'image' && st.termId === termId) setStage(room, t.image ? { ...st, url: t.image } : null);
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
  if (r.setPatientLanguage) setPatientLang(room, r.setPatientLanguage, role === 'patient' ? 'patient' : 'doctor');
  if (r.showModel?.id) showModel(room, r.showModel);
  if (r.imagePrompt && s.imagesUsed < config.maxImagesPerSession) {
    s.imagesUsed++;
    ai.image = 'pending';
    room.updateEntry(entry.id, {});
    const caption = r.imageCaption || { doctor: '', patient: '' };
    setStage(room, { tool: 'image', url: null, caption, entryId: entry.id });
    try {
      ai.image = await makeImage(await illustrationPrompt({ term: caption.doctor || question, explanation: r.imagePrompt, context: question }));
      setStage(room, { tool: 'image', url: ai.image, caption, entryId: entry.id });
    } catch (err) {
      console.warn('[ai] image failed:', err.message);
      ai.image = null;
    }
    room.updateEntry(entry.id, {});
  }
  scheduleJudge(room);
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
    return room.emit({ type: 'toast', level: 'info', text: { doctor: `Consent unlocks at ${config.consentThreshold}/10 (now ${s.understanding.score}).`, patient: '' } }, 'doctor');
  }
  s.consent = { status: 'preparing', openedAt: new Date().toISOString(), scoreAtOpen: s.understanding.score, checkpoints: [], omissions: [], index: 0, signatures: {}, overrides: [] };
  s.mode = 'consent';
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
  room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: `Final check: ${s.consent.omissions.length ? `${s.consent.omissions.length} item${s.consent.omissions.length > 1 ? 's' : ''} to review` : 'nothing missing'}`, patient: '最終確認' }, event: { type: 'finalCheck', omissions: s.consent.omissions } });
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
    room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: `Proceeded despite ${critical.length} flagged item${critical.length > 1 ? 's' : ''}`, patient: '最終確認を終えました' }, event: { type: 'override' } });
  }
  c.status = 'review';
  c.index = 0;
  room.changed();
}

export function consentCancel(room) {
  const s = room.state;
  if (!s.consent) return;
  room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: 'Back to discussion', patient: '説明に戻ります' }, event: { type: 'consentCancel' } });
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
  room.event('checkpoint', { cp: cp.id, status }, status === 'understood' ? { doctor: `Confirmed: ${cp.doctor}`, patient: `確認：${cp.patient}` } : { doctor: `Question about: ${cp.doctor}`, patient: `質問：${cp.patient}` }, 'patient');
  if (status === 'question') room.emit({ type: 'alert', to: 'doctor', text: `Patient has a question: ${cp.doctor}` }, 'doctor');
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
  room.event('signature', { role }, role === 'patient' ? { doctor: 'Patient signed', patient: '署名しました' } : { doctor: 'You signed', patient: '医師が署名しました' }, role);
  if (c.signatures.patient && c.signatures.doctor) {
    c.status = 'signed';
    c.signedAt = new Date().toISOString();
    c.scoreAtSign = room.state.understanding.score;
    c.hash = room.hash();
    room.addEntry({ kind: 'system', speaker: 'system', text: { doctor: 'Consent recorded', patient: '同意が記録されました' }, event: { type: 'signed' } });
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
  else if (step.do === 'symptom') {
    symptomPoint(room, step.region, step.point);
    symptomQuality(room, null, step.quality);
    symptomIntensity(room, null, step.intensity);
    symptomDone(room);
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

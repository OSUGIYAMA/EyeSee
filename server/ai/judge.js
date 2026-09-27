// Shared-understanding judge: a 0–10 score of how well informed consent is actually achieved —
// not whether the patient said "yes". JEV (TypeSafe AI System One) is the primary engine because it
// answers typed questions in ~100 ms, so we can re-score after every utterance. Deterministic caps
// are applied on top of any engine so the score can't be gamed by a bare "I agree".
import { config, judgeProvider } from '../config.js';
import { CONSENT_ELEMENTS, FEELINGS } from '../../public/shared/catalog.js';
import { formatTranscript, langName } from './transcript.js';
import { jsonCall, S } from './llm.js';
import { heuristicAssessment } from './offline.js';

const CORE = CONSENT_ELEMENTS.filter((e) => e.core).map((e) => e.id);
const ELEMENT_IDS = CONSENT_ELEMENTS.map((e) => e.id);

// ---------------------------------------------------------------- open concerns (deterministic)

/** Confusion flags, worrying feelings and checkpoint questions the patient raised and that are still open. */
export function openConcerns(state) {
  const out = [];
  const entries = state.entries;
  entries.forEach((e, i) => {
    let concern = null;
    if (e.kind === 'speech' && e.confused) concern = { doctor: `Patient didn't understand #${e.seq}: "${e.orig.text.slice(0, 80)}"`, patient: `「わからない」: ${(e.tr?.text || e.orig.text).slice(0, 40)}` };
    if (e.kind === 'event' && e.event.type === 'feeling' && FEELINGS.find((f) => f.id === e.event.id)?.concern) concern = { doctor: `Patient feels: ${e.text.doctor}`, patient: e.text.patient };
    if (!concern) return;
    const later = entries.slice(i + 1);
    const doctorReplied = later.some((x) => x.kind === 'speech' && x.speaker === 'doctor');
    const patientOk = later.some(
      (x) =>
        (x.kind === 'event' && x.speaker === 'patient' && (x.event.type === 'isee' || FEELINGS.find((f) => f.id === x.event.id)?.resolves)) ||
        (x.kind === 'speech' && x.speaker === 'patient' && doctorReplied),
    );
    out.push({ ...concern, doctorReplied, resolved: doctorReplied && patientOk });
  });
  for (const cp of state.consent?.checkpoints || []) {
    if (cp.ack === 'question') out.push({ doctor: `Question on checkpoint: ${cp.doctor}`, patient: cp.patient, doctorReplied: false, resolved: false });
  }
  return out.filter((c) => !c.resolved);
}

// ---------------------------------------------------------------- caps

/**
 * @param {number} raw         engine score 0–10
 * @param {Record<string,'missing'|'mentioned'|'explained'|'notApplicable'>} elements
 * @param {'none'|'claimed'|'partial'|'demonstrated'} comprehension
 * @param {number} concerns    number of unresolved concerns
 */
export function applyCaps(raw, elements, comprehension, concerns) {
  const ok = (id) => elements[id] === 'explained' || elements[id] === 'notApplicable';
  const touched = ELEMENT_IDS.some((id) => elements[id] === 'explained' || elements[id] === 'mentioned');
  const rules = [
    [!touched, 0, 'nothing has been explained yet'],
    [!ok('procedure') || !ok('risks'), 3, 'the procedure and its risks must be explained'],
    [comprehension === 'none' || comprehension === 'claimed', 5, 'the patient has not shown understanding'],
    [!CORE.every(ok), 7, `not yet explained: ${CORE.filter((id) => !ok(id)).join(', ')}`],
    [comprehension !== 'demonstrated', 7, 'no teach-back yet'],
    [concerns > 0, 7, 'a patient concern is unresolved'],
  ].filter(([hit]) => hit);
  const cap = Math.min(10, ...rules.map(([, c]) => c));
  const capReasons = rules.filter(([, c]) => c === cap).map(([, , why]) => why);
  return { score: Math.max(0, Math.min(Math.round(raw), cap)), cap, capReasons };
}

// ---------------------------------------------------------------- guidance text (deterministic)

const NEXT = {
  diagnosis: 'Explain the diagnosis in plain words.',
  procedure: 'Explain the proposed procedure step by step.',
  benefits: 'Explain what the procedure is expected to achieve.',
  risks: 'Explain the main risks and how likely they are.',
  alternatives: 'Discuss alternatives, including non-surgical options.',
  noTreatment: 'Explain what happens if the patient declines treatment.',
  anesthesia: 'Explain the anesthesia or sedation and its risks.',
  recovery: 'Explain recovery and what to expect afterwards.',
  questions: 'Invite the patient to ask questions.',
};

function guidance(state, elements, comprehension, concerns) {
  if (concerns[0]) return `Address the open concern — ${concerns[0].doctor}`;
  const missing = CORE.find((id) => elements[id] !== 'explained' && elements[id] !== 'notApplicable');
  if (missing) return NEXT[missing];
  if (comprehension !== 'demonstrated') return 'Ask the patient to explain the plan back in their own words (teach-back).';
  const extra = ELEMENT_IDS.find((id) => elements[id] === 'missing' || elements[id] === 'mentioned');
  if (extra) return NEXT[extra];
  return 'Shared understanding reached — you can open the consent step.';
}

function patientLine(state, score) {
  const ja = state.patientLang === 'ja';
  if (score >= config.consentThreshold) return ja ? '大切な点を理解できています。同意の確認に進めます。' : 'You understand the key points. You can move on to confirming consent.';
  if (score >= 4) return ja ? '説明が進んでいます。気になることは何でも聞いてください。' : 'The explanation is progressing. Ask anything you are unsure about.';
  return ja ? 'まだ説明の途中です。わからない時は「わからない」を押してください。' : 'The explanation has just started. Press "I don\'t understand" any time.';
}

// ---------------------------------------------------------------- engines

const JEV_LEVELS = [
  'No real explanation yet: the doctor has not explained the condition or the procedure (even if the patient says yes or agrees).',
  'The procedure is only named or mentioned; nothing has been explained in terms a layperson could follow.',
  'The procedure is explained, but its risks have not been explained yet.',
  'The procedure and some risks are explained; the patient has not shown any understanding yet.',
  'Diagnosis, procedure and risks are explained; the patient only says yes/OK/I understand without showing understanding.',
  'Most elements are explained and the patient asks relevant questions or restates some parts.',
  "Most elements are explained and the patient's questions are answered, but alternatives or a teach-back are still missing.",
  'Nearly complete: the patient restates the plan, but alternatives / the option of no treatment are not discussed, or a patient concern is unresolved.',
  'Complete: diagnosis, procedure, benefits, risks and alternatives explained; the patient restated the key points in their own words; no unresolved concerns.',
  'Exemplary: all of the above plus anesthesia, recovery and the option to decline covered, questions invited and answered, and the patient is clearly confident.',
];

const JEV_ELEMENT_Q = {
  diagnosis: 'Has the doctor explained the diagnosis / the patient\'s condition in terms a layperson could follow?',
  procedure: 'Has the doctor explained what the proposed procedure involves, in terms a layperson could follow?',
  benefits: 'Has the doctor explained the expected benefits of the procedure?',
  risks: 'Has the doctor explained the main risks or complications of the procedure (ideally with how likely they are)?',
  alternatives: 'Has the doctor explained alternatives to the procedure (for example medication or another treatment)?',
  noTreatment: 'Has the doctor explained that the patient can decline, or what happens without treatment?',
  anesthesia: 'Has the doctor explained the anesthesia or sedation that will be used?',
  recovery: 'Has the doctor explained the recovery or what to expect after the procedure?',
  questions: 'Has the doctor invited the patient to ask questions?',
};

async function jevAssess(state, concerns) {
  const questions = {
    understanding: { type: 'score', instructions: 'How far has genuine informed consent (disclosure by the doctor AND demonstrated understanding by the patient) been achieved in this conversation?', criteria: JEV_LEVELS },
    comprehension: {
      type: 'choice',
      instructions: "What best describes the patient's demonstrated understanding of the proposed procedure?",
      criteria: {
        none: 'The patient has not responded about the procedure at all',
        claimed: 'The patient only says yes / OK / I understand / agrees, without showing what they understood',
        partial: 'The patient asks relevant questions or restates some parts correctly',
        demonstrated: 'The patient restates the key points (what will be done, why, main risks) in their own words',
      },
    },
    unresolved: { type: 'noul', instructions: 'Does the patient have a question, confusion or worry that the doctor has not addressed yet?', criteria: { true: 'An open patient question, "I don\'t understand" flag or worry has not been answered', false: 'All patient questions and worries have been addressed, or none were raised' } },
    risky: { type: 'noul', instructions: 'Did the doctor guarantee an outcome, minimise real risks, or pressure the patient to agree?' },
  };
  for (const [id, q] of Object.entries(JEV_ELEMENT_Q)) questions[`el_${id}`] = { type: 'noul', instructions: q };

  const body = {
    model: config.jevModel,
    state: {
      setting: `Informed-consent conversation between a doctor (${langName(state.doctorLang)}) and a patient (${langName(state.patientLang)}) through a live interpreter app. Each line shows what was said and the translation shown to the other person. EVENT lines are taps in the app.`,
      transcript: formatTranscript(state),
      open_patient_concerns: concerns.map((c) => c.doctor),
    },
    questions,
  };
  const res = await fetch(config.jevUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.jevKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`JEV ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { answers } = await res.json();

  const elements = {};
  for (const id of ELEMENT_IDS) {
    const p = answers[`el_${id}`]?.noul ?? 0;
    elements[id] = p >= 0.5 ? 'explained' : p >= 0.25 ? 'mentioned' : 'missing';
  }
  const level = answers.understanding?.score ?? 0; // 0–9, expected value over the levels
  const comprehension = answers.comprehension?.choice || 'none';
  let raw = level;
  if (level >= 8.5 && comprehension === 'demonstrated' && ELEMENT_IDS.every((id) => elements[id] === 'explained')) raw = 10;
  return {
    raw,
    elements,
    comprehension,
    engineConcern: (answers.unresolved?.noul ?? 0) >= 0.5,
    risky: (answers.risky?.noul ?? 0) >= 0.6 ? ['The doctor may have guaranteed an outcome, minimised a risk or pressured the patient.'] : [],
    detail: { level, confidence: answers.understanding?.confidence, probabilities: answers.understanding?.probabilities },
  };
}

const STATUS = S.enum(['missing', 'mentioned', 'explained', 'notApplicable']);
const LLM_SCHEMA = S.obj({
  score: S.int('0–10'),
  elements: S.obj(Object.fromEntries(ELEMENT_IDS.map((id) => [id, STATUS]))),
  comprehension: S.enum(['none', 'claimed', 'partial', 'demonstrated']),
  unresolvedConcerns: S.arr(S.str()),
  riskyStatements: S.arr(S.str()),
});

async function llmAssess(state) {
  const r = await jsonCall({
    name: 'understanding',
    system: `You are the shared-understanding judge in EyeSee, used during informed consent between a doctor and a patient who speak different languages (the patient reads machine translations). Score 0–10 how well informed consent is actually achieved so far — NOT whether the patient said yes.
Element status: missing (not mentioned) / mentioned (named, not explained for a layperson) / explained (clear: what, why, what it means for the patient; risks with rough likelihood; alternatives incl. non-surgical and no treatment) / notApplicable.
Comprehension: none / claimed (only yes, OK, はい, "I agree") / partial (relevant questions or partial restatement) / demonstrated (teach-back of what, why, main risks).
unresolvedConcerns: patient questions, "didn't understand" flags or worried feelings not yet addressed. riskyStatements: doctor guarantees, minimisation or pressure.
Scale: 0 nothing explained (even if the patient agrees); 1–2 procedure mentioned; 3–4 procedure + some risks, no understanding shown; 5–6 most elements, partial understanding; 7 nearly complete but alternatives missing or a concern open; 8 all core elements + teach-back + no open concerns; 9–10 exemplary.`,
    prompt: `Conversation:\n${formatTranscript(state)}`,
    schema: LLM_SCHEMA,
    effort: 'medium',
    maxTokens: 3000,
  });
  return { raw: r.score, elements: r.elements, comprehension: r.comprehension, engineConcern: r.unresolvedConcerns.length > 0, engineConcerns: r.unresolvedConcerns, risky: r.riskyStatements };
}

// ---------------------------------------------------------------- public API

/** Full assessment with the configured engine; falls back to the offline heuristic on error. */
export async function assess(state) {
  const concerns = openConcerns(state);
  let provider = judgeProvider();
  let a;
  let error = null;
  try {
    if (provider === 'jev') a = await jevAssess(state, concerns);
    else if (provider === 'llm') a = await llmAssess(state);
  } catch (err) {
    error = err.message;
    console.warn(`[judge] ${provider} failed, using heuristic:`, err.message);
  }
  if (!a) {
    provider = 'heuristic';
    a = heuristicAssessment(state);
  }
  // A concern counts as open if the engine says so, or if the doctor hasn't responded to it at all.
  const strictOpen = concerns.filter((c) => !c.doctorReplied);
  const concernList = a.engineConcern ? (concerns.length ? concerns : (a.engineConcerns || []).map((t) => ({ doctor: t, patient: t }))) : strictOpen;
  const { score, cap, capReasons } = applyCaps(a.raw, a.elements, a.comprehension, concernList.length);
  return {
    score,
    raw: Math.round(a.raw * 10) / 10,
    cap,
    capReasons,
    elements: a.elements,
    comprehension: a.comprehension,
    concerns: concernList.map(({ doctor, patient }) => ({ doctor, patient })),
    risky: a.risky || [],
    nextStep: guidance(state, a.elements, a.comprehension, concernList),
    rationale: { doctor: score === cap && cap < 10 ? `Held at ${cap}: ${capReasons.join('; ')}.` : '', patient: patientLine(state, score) },
    source: provider,
    detail: a.detail || null,
    error,
  };
}

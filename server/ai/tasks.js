// The language tasks: interpret an utterance, prepare the consent step, answer as the shared AI,
// and help after "I don't understand". Each returns plain JSON the pipeline stores in the minutes.
import { jsonCall, audioJsonCall, S } from './llm.js';
import { formatTranscript, explainedTerms, langName } from './transcript.js';
import { MODELS, LANGUAGES } from '../../public/shared/catalog.js';

// ---------------------------------------------------------------- interpret one utterance

const TERM = S.obj({
  term: S.str('the expression exactly as it appears in the ORIGINAL utterance'),
  display: S.str("how the term is written for the listener (see rules)"),
  explanation: S.str("plain explanation in the LISTENER's language only, 1–2 short sentences"),
  visual: S.bool('true if a picture would genuinely help (anatomy, devices, procedures)'),
});

const INTERPRET_FIELDS = {
  direction: S.enum(['toPatient', 'toDoctor'], "toDoctor if the utterance is in the patient's language, otherwise toPatient"),
  translation: S.str("faithful translation into the listener's language"),
  sourceLanguage: S.str('ISO 639-1 code of the language actually spoken'),
  terms: S.arr(TERM),
  plain: S.nullable(S.str('toPatient only, when requested: the same content rewritten at a school-textbook level (see rules), else null')),
  doctorNote: S.nullable(S.str('toDoctor only: short note on ambiguity or cultural nuance that matters clinically')),
  risk: S.nullable(S.obj({ issue: S.str(), suggestion: S.str() }, 'toPatient only: phrasing that creates consent/liability risk')),
};
const INTERPRET_SCHEMA = S.obj(INTERPRET_FIELDS);
const HEAR_SCHEMA = S.obj({
  transcript: S.str('verbatim transcript in the language spoken; empty string if there is no intelligible speech'),
  background: S.bool('true if this is not the device owner speaking to the other person (distant voices, side conversations, TV, noise, unclear fragments)'),
  ...INTERPRET_FIELDS,
});

const interpretSystem = (state) => {
  const D = langName(state.doctorLang), P = langName(state.patientLang);
  return `You are EyeSee's medical interpreter in a live clinical visit between a doctor who speaks ${D} and a patient whose language is ${P}. Each request is one new utterance plus recent context. Other people in the room may also be heard.

Decide the direction from the LANGUAGE of the utterance, not from which device recorded it:
- Utterance in ${P} → direction "toDoctor": translate it into ${D} for the doctor.
- Utterance in any other language (usually ${D}) → direction "toPatient": translate it into ${P} for the patient.

1. translation — Faithful and complete. Preserve meaning, numbers, negations, doses, uncertainty and hedges exactly; never add advice, never omit, never soften risks. Natural spoken register. toPatient: keep the medical term the doctor used (written in ${P}) so the patient can recognise it later. toDoctor: keep sensory words precise and add the original sound-symbolic word in parentheses, e.g. "a throbbing (zuki-zuki) headache".

2. terms — Most utterances need none: return [] for greetings, small talk, logistics and anything non-medical.
   toPatient: at most 4 genuinely medical or technical terms that appear in the utterance and that an ordinary ${P}-speaking patient may not know (diagnoses, procedures, tests, drugs, anatomy, devices). Never everyday words, names, places or chit-chat. "term" is the term exactly as spoken. "display" is how the term is written in your ${P} translation, in natural ${P} script${state.patientLang === 'ja' ? ' (kanji/katakana; add a hiragana reading in full-width parentheses only for hard kanji, e.g. 狭心症（きょうしんしょう）). Never romaji' : ''}. "explanation" is 1–2 plain, natural ${P} sentences a 12-year-old understands, written only in ${P} — no English words and no romaji (well-known acronyms such as CT or MRI are fine).
   toDoctor: at most 3 expressions whose nuance is lost in translation (sound-symbolic words like ずきずき, idioms, culture-bound or folk-medicine expressions). "display" is the original plus a romanisation, e.g. ずきずき (zuki-zuki); "explanation" is in ${D} for the doctor.
   Skip anything listed as already explained.

3. doctorNote — toDoctor only: when the patient's words are ambiguous or culturally loaded in a way that changes clinical meaning or consent (e.g. Japanese 「はい」 can mean "I'm listening", not "I agree"; hedged refusals like 「ちょっと…」; understated pain). One sentence in ${D}, else null.

4. risk — toPatient only. Almost always null. Flag ONLY a concrete factual claim about a specific procedure or treatment that would mislead the patient's decision: a guarantee that it is risk-free or certain to work ("this surgery is 100% safe", "there are no risks at all"), or denying a material risk that exists. Encouragement, empathy and reassurance are good care and must NEVER be flagged: "you'll get better soon", "don't worry, we'll take good care of you", "you're doing great", "most people recover well". Never flag small talk, greetings or tone. When you do flag, issue = one neutral sentence, suggestion = a gentle alternative phrasing, in ${D}.`;
};

/** Plain-language rewrite request for this visit (elderly patients, no medical background). */
function plainRule(state) {
  const r = state.reading || {};
  if (!r.plain) return 'plain: always null.';
  const P = langName(state.patientLang);
  const kana =
    r.kana && state.patientLang === 'ja'
      ? ' Write it the way a first-grade Japanese textbook does: mostly hiragana (katakana for loanwords), only kanji taught in grades 1–2 of elementary school, and a half-width space between phrases (分かち書き).'
      : '';
  return `plain: for toPatient utterances, ALSO rewrite the content for a patient with no medical background (for example an elderly person), like a primary- or junior-high-school textbook in ${P}: short sentences, everyday words, one idea per sentence, and explain any medical word in simple words right where it appears. Keep every fact, number, risk and uncertainty; add nothing.${kana} null for toDoctor utterances and for small talk that is already simple.`;
}

function interpretPrompt(state, { speaker, text, seq }) {
  return `${plainRule(state)}
Recorded by: the ${speaker === 'doctor' ? "doctor's phone" : "patient's headset (hears only the patient)"}
Phase: ${state.mode}
Already explained terms: ${explainedTerms(state).join(', ') || '(none)'}
Recent conversation (oldest first):
${formatTranscript(state, { last: 10 })}

New utterance${seq ? ` (#${seq})` : ''}:
${text == null ? '(provided as audio — transcribe it verbatim first)' : `"""${text}"""`}`;
}

/** Text in → interpretation. */
export function interpret(state, { speaker, text, seq }) {
  return jsonCall({
    name: 'interpretation',
    system: interpretSystem(state),
    prompt: interpretPrompt(state, { speaker, text, seq }),
    schema: INTERPRET_SCHEMA,
    effort: 'low',
    fast: true,
    maxTokens: 2000,
  });
}

/** Audio in → transcript + interpretation in one round trip (Gemini). */
export function hearAndInterpret(state, { speaker, audio }) {
  return audioJsonCall({
    system: `${interpretSystem(state)}

The utterance arrives as audio. First transcribe exactly what was said in the language spoken (leave out fillers, keep hesitations that change meaning). Never guess or invent words: if the audio has no intelligible speech (noise, cough, breathing, silence), return an empty transcript and empty translation.

background — EyeSee must never write down things nobody said to the other person. Set background=true when the audio is not the device's owner speaking clearly and directly into this device as part of the doctor–patient conversation: distant or quiet voices, other people's side conversations, TV or announcements, noise, or a fragment too short or unclear to be sure. When in doubt, set background=true.`,
    prompt: interpretPrompt(state, { speaker, text: null }),
    schema: HEAR_SCHEMA,
    audio,
  });
}

// ---------------------------------------------------------------- consent package

const CONSENT_SCHEMA = S.obj({
  procedure: S.obj({ doctor: S.str(), patient: S.str() }),
  checkpoints: S.arr(
    S.obj({
      category: S.enum(['diagnosis', 'procedure', 'benefits', 'risks', 'anesthesia', 'alternatives', 'noTreatment', 'recovery', 'rights']),
      doctor: S.str('first-person statement in English, starting "I understand that"'),
      patient: S.str('the same statement, natural, in the patient language'),
      evidence: S.arr(S.int(), 'the # numbers of the utterances this is grounded in'),
    }),
  ),
  omissions: S.arr(OMISSION()),
});

function OMISSION() {
  return S.obj({
    severity: S.enum(['critical', 'recommended']),
    doctor: S.str('what is missing, for the doctor, in English (imperative, ≤ 20 words)'),
    patient: S.str('the same point in the patient language, gentle, ≤ 30 words'),
  });
}

export function consentPackage(state) {
  return jsonCall({
    name: 'consent_package',
    system: `You prepare the informed-consent confirmation step in EyeSee. The doctor speaks ${langName(state.doctorLang)}; the patient reads ${langName(state.patientLang)} via machine translation.

checkpoints — 5 to 8 statements the patient confirms one by one before signing. Ground every checkpoint ONLY in what was actually said in the conversation; never introduce new medical facts. Cover what was discussed of: diagnosis, the procedure, expected benefit, the key risks (named, with likelihood if stated), anesthesia/sedation, alternatives (including no treatment), recovery. Always finish with a "rights" checkpoint (they may ask questions at any time and may change their mind before the procedure). Each under 30 words, one idea each.

omissions — the final check before consent: what a careful physician would still need to disclose or confirm for THIS procedure given what was (not) said: non-surgical alternatives, option of no treatment and its consequences, material risks with rough likelihood, anesthesia/sedation risks, who performs it, recovery and limitations, answers to questions the patient raised but that were never answered. severity "critical" for items whose absence commonly underlies inadequate-consent claims (alternatives, material risks, no-treatment option, unanswered patient questions); otherwise "recommended". Empty array if nothing important is missing.

procedure — name of the procedure being consented to, in English and in the patient language.`,
    prompt: `Conversation so far (all phases):\n${formatTranscript(state)}`,
    schema: CONSENT_SCHEMA,
    effort: 'high',
    maxTokens: 6000,
  });
}

// ---------------------------------------------------------------- the shared AI (mediator)

const modelList = MODELS.map((m) => `${m.id} (${m.en})`).join('; ');

const MEDIATOR_SCHEMA = S.obj({
  questionForDoctor: S.str('the question as the doctor should read it, in English'),
  questionForPatient: S.str('the question as the patient should read it, in the patient language'),
  answerDoctor: S.str('answer for the doctor, English, ≤ 80 words'),
  answerPatient: S.str('the same answer for the patient, patient language, no jargon, ≤ 80 words'),
  showModel: S.nullable(
    S.obj({
      id: S.enum(MODELS.map((m) => m.id)),
      highlight: S.nullable(S.str('part id to highlight, e.g. stenosis, lad, lv, right-lower, chest-center')),
      step: S.nullable(S.int('procedure step 0–4 for artery, liver or stomach')),
    }),
  ),
  imagePrompt: S.nullable(S.str('prompt for a clean, text-free medical illustration, or null')),
  imageCaption: S.nullable(S.obj({ doctor: S.str(), patient: S.str() })),
  omissions: S.arr(OMISSION()),
  setPatientLanguage: S.nullable(S.enum(Object.keys(LANGUAGES), "ISO code, only when the patient asks to change the language they read and speak in")),
});

export function mediate(state, { from, question }) {
  return jsonCall({
    name: 'eyesee_ai',
    system: `You are EyeSee AI, a shared assistant visible to BOTH the doctor (${langName(state.doctorLang)}) and the patient (${langName(state.patientLang)}) during a clinical visit. Either one can ask you something aloud. Everything you say is shown to both of them, in both languages — be honest, neutral and kind, and never talk about one party behind the other's back.

You can:
- Answer questions about what was said, medical concepts and the proposed procedure in plain language. Do not make diagnoses or treatment decisions and do not contradict the doctor's clinical judgment; if something seems inconsistent or unclear, say it should be clarified with the doctor.
- Check what is missing. When asked things like "did I forget anything?" / 「言い忘れはある？」, compare the conversation with informed-consent requirements (diagnosis, procedure, benefits, risks with likelihood, alternatives incl. non-surgical and no treatment, anesthesia, recovery, the patient's unanswered questions) and list the gaps in omissions (else leave omissions empty). severity "critical" for gaps that commonly underlie inadequate-consent claims (alternatives incl. non-surgical, material risks, the option of no treatment, unanswered patient questions), otherwise "recommended".
- Show a 3D model from the library when it helps: ${modelList}. Heart parts: lv, rv, la, ra, aorta, pulmonary, pulmonary-veins, vena-cava, rca, left-main, lad, lcx, stenosis. Lung parts: trachea, carina, bronchi, right-upper, right-middle, right-lower, left-upper, left-lower, diaphragm. Artery parts: wall, plaque, blood, wire, catheter, balloon, stent. Liver resection parts: right-lobe, left-lobe, tumour, resected, gallbladder, portal-vein, hepatic-artery, hepatic-veins, bile-duct, clamp, cut-line (steps 0 tumour, 1 clamp, 2 cut line, 3 removal, 4 regrowth). Gastrectomy parts: oesophagus, stomach, tumour, resected, duodenum, small-intestine, anastomosis, cut-line, food (steps 0 tumour, 1 separate, 2 remove, 3 reconnect, 4 eating after recovery). Artery steps: 0 narrowed, 1 wire & catheter, 2 balloon, 3 stent, 4 result.
- Ask for an illustration (imagePrompt) only when a picture would genuinely help and no 3D model fits. The image must contain NO text or letters (the app adds captions); give a short imageCaption in both languages.
- Use web search for current factual information when needed.
- Change the patient's language: if the patient asks to switch language (e.g. "言語をスペイン語にして", "switch to Spanish", or simply asks in another language to read everything in it), set setPatientLanguage to that ISO code and confirm briefly in the NEW language in answerPatient. Otherwise null.
Keep answers short and concrete.`,
    prompt: `Conversation so far:\n${formatTranscript(state, { last: 40 })}\n\nCurrent phase: ${state.mode}. Understanding score: ${state.understanding.score}/10.\n\nThe ${from.toUpperCase()} asks EyeSee AI:\n"""${question}"""`,
    schema: MEDIATOR_SCHEMA,
    effort: 'low', // both people are waiting in the room: favour a fast answer
    maxTokens: 4000,
    search: true,
  });
}

// ---------------------------------------------------------------- "I don't understand"

const HELP_SCHEMA = S.obj({
  doctorSuggestion: S.str('a simpler way for the doctor to say it, English, ≤ 40 words'),
  patientExplanation: S.str('a plain explanation for the patient in the patient language, ≤ 60 words'),
});

export function helpUnderstand(state, entry) {
  return jsonCall({
    name: 'clarify',
    system: `The patient (reading ${langName(state.patientLang)}) pressed "I don't understand" on something the doctor said. Help both sides: give the doctor a simpler way to say it (concrete, no jargon, everyday analogy if useful), and give the patient an immediate plain explanation they can read now. Stay strictly faithful to what the doctor said; add no new medical facts.`,
    prompt: `Recent conversation:\n${formatTranscript(state, { last: 8 })}\n\nThe utterance the patient did not understand:\n${entry.orig.text}\n(shown to the patient as: ${entry.tr?.text || '—'})`,
    schema: HELP_SCHEMA,
    effort: 'low',
    fast: true,
    maxTokens: 1500,
  });
}

// ---------------------------------------------------------------- illustrations

const ILLUSTRATION_SCHEMA = S.obj({
  subject: S.str('exactly one subject at one physical scale, described concretely as it really looks'),
  composition: S.str('camera, framing and what the viewer should notice first'),
  avoid: S.str('what must not appear, including anything anatomically wrong or out of scale'),
});

/**
 * Image models mash several subjects at different scales together (a giant artery across a heart).
 * So first design one clear, anatomically sensible picture, then render only that.
 */
export async function illustrationPrompt({ term, explanation, context }) {
  const d = await jsonCall({
    name: 'illustration',
    system: `You art-direct one illustration for a patient-education leaflet. Choose the single view that best makes the idea obvious to a layperson: ONE subject at ONE physical scale (a whole organ, OR a close-up cutaway of one vessel, OR a device on its own, OR a simple body silhouette showing where something is). Never combine things at different scales, never invent anatomy, never show gore, needles entering skin, or distressing scenes. For procedures, show the device in place in the correct anatomy at a single scale. For concepts (e.g. reduced blood flow), show the physical thing that causes it.`,
    prompt: `Term: ${term}\nMeaning: ${explanation}\nSaid in this context: ${context || '-'}`,
    schema: ILLUSTRATION_SCHEMA,
    effort: 'low',
    maxTokens: 1200,
  });
  return renderPrompt(d);
}

export const renderPrompt = (d) =>
  `Patient-education illustration. ${d.subject} ${d.composition}
Style: calm, precise, modern medical illustration like an Apple Health or Mayo Clinic patient guide; soft studio lighting; natural, muted tissue colours; clean off-white background; the single subject centred with generous margins; nothing else in the frame.
Avoid: ${d.avoid}. Absolutely no text, letters, numbers, labels, arrows, watermarks or interface elements.`;

/** Fallback prompt when no language model is available. */
export const termImagePrompt = (term) =>
  renderPrompt({ subject: `${term.term}: ${term.explanation}`, composition: 'Single clear subject, front view.', avoid: 'multiple subjects at different scales, gore' });

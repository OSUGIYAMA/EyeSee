// The language tasks: interpret an utterance, prepare the consent step, answer as the shared AI,
// and help after "I don't understand". Each returns plain JSON the pipeline stores in the minutes.
import { jsonCall, audioJsonCall, S } from './llm.js';
import { formatTranscript, explainedTerms, langName } from './transcript.js';
import { MODELS } from '../../public/shared/catalog.js';

// ---------------------------------------------------------------- interpret one utterance

const TERM = S.obj({
  term: S.str('the expression exactly as it appears in the ORIGINAL utterance'),
  display: S.str("how the term reads in the listener's language (e.g. Japanese medical term, with kana reading for hard kanji)"),
  explanation: S.str("plain-language explanation in the LISTENER's language, 1–2 short sentences"),
  visual: S.bool('true if a picture would genuinely help (anatomy, devices, procedures)'),
});

const INTERPRET_FIELDS = {
  translation: S.str("faithful translation into the listener's language"),
  sourceLanguage: S.str('ISO 639-1 code of the language actually spoken'),
  terms: S.arr(TERM),
  doctorNote: S.nullable(S.str('patient→doctor only: short note on ambiguity or cultural nuance that matters clinically')),
  risk: S.nullable(S.obj({ issue: S.str(), suggestion: S.str() }, "doctor→patient only: phrasing that creates consent/liability risk")),
};
const INTERPRET_SCHEMA = S.obj(INTERPRET_FIELDS);
const HEAR_SCHEMA = S.obj({
  transcript: S.str('verbatim transcript in the language spoken; empty string if there is no intelligible speech'),
  ...INTERPRET_FIELDS,
});

const interpretSystem = (state) => `You are EyeSee's medical interpreter. You sit between a doctor (speaking ${langName(state.doctorLang)}) and a patient whose native language is ${langName(state.patientLang)}, during a real clinical visit. Each request is one new utterance plus recent context.

1. translation — Translate faithfully into the listener's language. Preserve meaning, numbers, negations, doses, uncertainty and hedges exactly; never add advice, never omit, never soften risks. Natural spoken register. Doctor→patient: keep the medical term the doctor used (in the patient's language) so the patient can recognise it later. Patient→doctor: keep sensory words precise and add the original sound-symbolic word in parentheses in romaji, e.g. "a throbbing (zuki-zuki) headache". If the speaker already used the listener's language (e.g. the patient speaks accented English), return a cleaned-up version, fixing only obvious speech-recognition errors that the context makes certain.

2. terms — Doctor→patient: up to 4 medical/technical words this patient likely doesn't know; explanation in ${langName(state.patientLang)} at a 12-year-old's level, concrete, 1–2 sentences. Patient→doctor: up to 3 expressions whose nuance is lost in translation (onomatopoeia, idioms, culture-bound or folk-medicine expressions); explanation in English for the doctor. Skip anything listed as already explained. Empty array when nothing needs explaining.

3. doctorNote — Patient→doctor only: when the patient's words are ambiguous or culturally loaded in a way that changes clinical meaning or consent (e.g. Japanese 「はい」 can mean "I'm listening", not "I agree"; hedged refusals like 「ちょっと…」; understated pain). One sentence in English, else null. Always null for doctor utterances.

4. risk — Doctor→patient only: flag phrasing that undermines informed consent or creates liability: guarantees ("nothing will go wrong", "100% safe"), minimising material risks, pressure or coercion, dismissiveness, or dense jargon with no explanation. issue + a better phrasing, in English. Else null. Always null for patient utterances.`;

function interpretPrompt(state, { speaker, text, seq }) {
  const toPatient = speaker === 'doctor';
  const from = toPatient ? state.doctorLang : state.patientLang;
  const to = toPatient ? state.patientLang : state.doctorLang;
  return `Direction: ${toPatient ? 'DOCTOR → PATIENT' : 'PATIENT → DOCTOR'} (usually ${langName(from)} → translate into ${langName(to)} [${to}])
Phase: ${state.mode}
Already explained terms: ${explainedTerms(state).join(', ') || '(none)'}
Recent conversation (oldest first):
${formatTranscript(state, { last: 10 })}

New utterance${seq ? ` (#${seq})` : ''} from the ${speaker.toUpperCase()}:
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

The utterance arrives as audio recorded by the ${speaker}'s own device (${speaker === 'doctor' ? 'the doctor\'s phone' : 'the patient\'s headset'}). First transcribe exactly what was said in the language spoken (keep fillers out, keep hesitations that change meaning). If the audio has no intelligible speech (noise, cough, silence), return an empty transcript and empty translation.`,
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
      step: S.nullable(S.int('procedure step 0–4 for the artery model')),
    }),
  ),
  imagePrompt: S.nullable(S.str('prompt for a clean, text-free medical illustration, or null')),
  imageCaption: S.nullable(S.obj({ doctor: S.str(), patient: S.str() })),
  omissions: S.arr(OMISSION()),
});

export function mediate(state, { from, question }) {
  return jsonCall({
    name: 'eyesee_ai',
    system: `You are EyeSee AI, a shared assistant visible to BOTH the doctor (${langName(state.doctorLang)}) and the patient (${langName(state.patientLang)}) during a clinical visit. Either one can ask you something aloud. Everything you say is shown to both of them, in both languages — be honest, neutral and kind, and never talk about one party behind the other's back.

You can:
- Answer questions about what was said, medical concepts and the proposed procedure in plain language. Do not make diagnoses or treatment decisions and do not contradict the doctor's clinical judgment; if something seems inconsistent or unclear, say it should be clarified with the doctor.
- Check what is missing. When asked things like "did I forget anything?" / 「言い忘れはある？」, compare the conversation with informed-consent requirements (diagnosis, procedure, benefits, risks with likelihood, alternatives incl. non-surgical and no treatment, anesthesia, recovery, the patient's unanswered questions) and list the gaps in omissions (else leave omissions empty). severity "critical" for gaps that commonly underlie inadequate-consent claims (alternatives incl. non-surgical, material risks, the option of no treatment, unanswered patient questions), otherwise "recommended".
- Show a 3D model from the library when it helps: ${modelList}. Heart parts: lv, rv, la, ra, aorta, pulmonary, vena-cava, rca, lad, lcx, stenosis. Lung parts: trachea, bronchi, right-upper, right-middle, right-lower, left-upper, left-lower, diaphragm. Artery steps: 0 narrowed, 1 wire & catheter, 2 balloon, 3 stent, 4 result.
- Ask for an illustration (imagePrompt) only when a picture would genuinely help and no 3D model fits. The image must contain NO text or letters (the app adds captions); give a short imageCaption in both languages.
- Use web search for current factual information when needed.
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

/** Illustration prompt for a glossary term (text-free; captions come from the UI). */
export const termImagePrompt = (term) =>
  `A clean, friendly medical illustration that helps a patient understand "${term.term}" (${term.explanation}). Soft flat vector style, gentle colors, plain white background, anatomically sensible, no gore. Absolutely no text, letters, numbers or labels anywhere in the image.`;

// Offline fallbacks so EyeSee stays usable (and demoable) with no AI credentials or when a call fails.
import { CONSENT_ELEMENTS } from '../../public/shared/catalog.js';

const RX = {
  diagnosis: /(diagnos|your (tests?|ecg|results?|scan)|shows?|narrow|block|disease|condition|angina|you have)/i,
  procedure: /(procedure|surgery|operation|catheter|stent|insert|\bpci\b|biopsy|we (will|would|can) (put|place|do|remove|thread))/i,
  benefits: /(benefit|improve|reliev|help (you|your)|reduce (the |your )?(risk|pain)|should (get|feel) better|goal)/i,
  risks: /(risk|complication|bleed|infection|side effect|damage|allerg|stroke|heart attack|\d+ in \d+|percent)/i,
  alternatives: /(alternative|other option|instead|medications? alone|medicines? alone|bypass|another (way|option)|non-?surgical)/i,
  noTreatment: /(do nothing|no treatment|decline|choose not|not to have|without (any )?(treatment|procedure)|refuse)/i,
  anesthesia: /(anesthe|anaesthe|sedat|numb|put you to sleep|you'll be awake|asleep)/i,
  recovery: /(recover|go home|hospital stay|follow-?up|after the procedure|return to|normal activit)/i,
  questions: /(any questions|what questions|questions\?|feel free to ask|ask me anything)/i,
};
const TEACH_BACK = /(own words|explain (it |that )?back|tell me what (we|you)|repeat (it )?back|in your words)/i;
const words = (s) => s.trim().split(/\s+/).length;

/** Keyword/structure-based estimate with the same shape as the AI engines. */
export function heuristicAssessment(state) {
  const elements = Object.fromEntries(CONSENT_ELEMENTS.map((e) => [e.id, 'missing']));
  const speech = state.entries.filter((e) => e.kind === 'speech' && !e.pending);
  let teachBackAsked = false;
  let comprehension = 'none';
  let patientQuestions = 0;
  let answered = 0;
  let lastWasPatientQuestion = false;

  for (const e of speech) {
    if (e.speaker === 'doctor') {
      const text = e.orig.lang === 'en' ? e.orig.text : e.tr?.text || e.orig.text;
      for (const [id, rx] of Object.entries(RX)) {
        if (rx.test(text)) elements[id] = words(text) >= 8 ? 'explained' : elements[id] === 'explained' ? 'explained' : 'mentioned';
      }
      if (TEACH_BACK.test(text)) teachBackAsked = true;
      if (lastWasPatientQuestion) answered++;
      lastWasPatientQuestion = false;
    } else {
      const t = e.orig.text;
      const long = /[぀-ヿ一-龯]/.test(t) ? t.length >= 25 : words(t) >= 8;
      const question = /[?？]|か[。]?$|ですか|ますか/.test(t);
      if (question) patientQuestions++, (lastWasPatientQuestion = true);
      if (teachBackAsked && long) comprehension = 'demonstrated';
      else if (comprehension !== 'demonstrated' && (question || long)) comprehension = 'partial';
      else if (comprehension === 'none') comprehension = 'claimed';
    }
  }
  if (comprehension === 'none' && state.entries.some((e) => e.kind === 'event' && e.event.type === 'isee')) comprehension = 'claimed';

  let raw = 0;
  for (const el of CONSENT_ELEMENTS) if (elements[el.id] === 'explained') raw += el.core ? 1 : 0.5;
  raw += comprehension === 'demonstrated' ? 2 : comprehension === 'partial' ? 1 : 0;
  if (patientQuestions && answered) raw += 1;
  return { raw: Math.min(10, raw), elements, comprehension, engineConcern: false, risky: [] };
}

// ---------------------------------------------------------------- consent templates

const CHECKPOINT_TEXT = {
  diagnosis: ['I understand my diagnosis as the doctor explained it.', '医師から説明された診断（病状）を理解しました。'],
  procedure: ['I understand what the proposed procedure involves.', '提案された治療・手術の内容を理解しました。'],
  benefits: ['I understand the expected benefits.', '期待される効果を理解しました。'],
  risks: ['I understand the main risks and complications that were explained.', '説明された主なリスクや合併症を理解しました。'],
  anesthesia: ['I understand the anesthesia or sedation that will be used.', '使用する麻酔・鎮静について理解しました。'],
  alternatives: ['I understand the alternatives, including non-surgical options.', '手術以外も含めた、他の選択肢を理解しました。'],
  noTreatment: ['I understand I can decline, and what could happen without treatment.', '治療を受けない選択もでき、その場合に起こりうることを理解しました。'],
  recovery: ['I understand the recovery and what to expect afterwards.', '回復の見通しとその後の流れを理解しました。'],
};
export const RIGHTS_CHECKPOINT = {
  category: 'rights',
  doctor: 'I understand I can ask questions at any time and can change my mind before the procedure.',
  patient: 'いつでも質問でき、処置の前なら考えを変えてもよいことを理解しました。',
  evidence: [],
};

export const OMISSION_TEXT = {
  diagnosis: ['Explain the diagnosis in plain words.', '診断（病状）の説明がまだです。'],
  procedure: ['Explain the proposed procedure step by step.', '治療・手術の内容の説明がまだです。'],
  benefits: ['Explain the expected benefits.', '期待される効果の説明がまだです。'],
  risks: ['Explain the main risks and how likely they are.', 'リスクや合併症と、その起こりやすさの説明がまだです。'],
  alternatives: ['Discuss alternatives, including non-surgical options such as medication.', '手術以外（薬など）も含めた、他の選択肢の説明がまだです。'],
  noTreatment: ['Explain the option to decline and what happens without treatment.', '治療を受けない場合どうなるかの説明がまだです。'],
  anesthesia: ['Explain the anesthesia or sedation and its risks.', '麻酔・鎮静の説明がまだです。'],
  recovery: ['Explain recovery and what to expect afterwards.', '回復やその後の流れの説明がまだです。'],
  questions: ['Invite the patient to ask questions.', '質問できる機会がまだありません。'],
  teachBack: ['Ask the patient to explain the plan back in their own words.', '内容を自分の言葉で確認するステップがまだです。'],
};
const CRITICAL = new Set(['procedure', 'risks', 'alternatives', 'noTreatment']);

const pick = (state, [en, ja]) => (state.patientLang === 'ja' ? ja : en);

export function offlineOmissions(state) {
  const a = heuristicAssessment(state);
  const out = Object.entries(a.elements)
    .filter(([, s]) => s !== 'explained')
    .map(([id]) => ({ severity: CRITICAL.has(id) ? 'critical' : 'recommended', doctor: OMISSION_TEXT[id][0], patient: pick(state, OMISSION_TEXT[id]) }));
  if (a.comprehension !== 'demonstrated') out.push({ severity: 'recommended', doctor: OMISSION_TEXT.teachBack[0], patient: pick(state, OMISSION_TEXT.teachBack) });
  return out;
}

export function offlineConsentPackage(state) {
  const a = heuristicAssessment(state);
  const checkpoints = Object.entries(CHECKPOINT_TEXT)
    .filter(([id]) => a.elements[id] === 'explained')
    .map(([category, t]) => ({ category, doctor: t[0], patient: pick(state, t), evidence: [] }));
  return {
    procedure: { doctor: 'The proposed procedure', patient: state.patientLang === 'ja' ? '提案された治療' : 'The proposed procedure' },
    checkpoints,
    omissions: offlineOmissions(state),
  };
}

export function offlineMediator(state, { question }) {
  const ja = state.patientLang === 'ja';
  if (/(forg[eo]t|missing|miss|left out|check|忘れ|抜け|足りない|確認)/i.test(question)) {
    const omissions = offlineOmissions(state);
    return {
      questionForDoctor: question,
      questionForPatient: question,
      answerDoctor: omissions.length ? `Offline check: ${omissions.length} item(s) not yet covered.` : 'Offline check: all consent elements appear to be covered.',
      answerPatient: omissions.length ? (ja ? `まだ説明されていない項目が ${omissions.length} 件あります。` : `${omissions.length} item(s) not yet explained.`) : ja ? '大切な項目はすべて説明されているようです。' : 'All key items appear to be covered.',
      showModel: null,
      imagePrompt: null,
      imageCaption: null,
      omissions,
    };
  }
  return {
    questionForDoctor: question,
    questionForPatient: question,
    answerDoctor: 'EyeSee AI is offline (no AI credentials configured), so it can only run the omission check.',
    answerPatient: ja ? 'AIがオフラインのため、今は「言い忘れチェック」だけ使えます。' : 'EyeSee AI is offline right now.',
    showModel: null,
    imagePrompt: null,
    imageCaption: null,
    omissions: [],
  };
}

export function offlineHelp(state) {
  return {
    doctorSuggestion: 'Say it again in shorter sentences with everyday words, and check understanding.',
    patientExplanation: state.patientLang === 'ja' ? '医師にもう一度、やさしい言葉で説明してもらいましょう。' : 'The doctor will explain again in simpler words.',
  };
}

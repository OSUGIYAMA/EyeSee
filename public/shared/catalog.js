// Shared, bilingual catalogs used by the phone app, the Quest app and the server.
// Labels are keyed by language code; the patient UI falls back to `en` for languages
// that don't have a UI pack yet (the conversation itself is translated into any language).

// Pain qualities. Japanese onomatopoeia are famously hard to translate, so each one carries
// an animated 3D metaphor (painviz.js `anim`) and a clinical English descriptor for the doctor.
export const PAIN_TYPES = [
  { id: 'zukizuki', anim: 'pulse', ja: 'ずきずき', jaHint: '脈に合わせてくり返す痛み', en: 'Throbbing', enHint: 'Pulsating pain in rhythm with the heartbeat' },
  { id: 'chikuchiku', anim: 'needles', ja: 'ちくちく', jaHint: '針で刺されるような細かい痛み', en: 'Prickling', enHint: 'Fine, needle-like pricking' },
  { id: 'kirikiri', anim: 'drill', ja: 'きりきり', jaHint: 'ねじ込まれるような鋭い痛み', en: 'Boring / twisting', enHint: 'Sharp, drilling or twisting pain (often colicky/gastric)' },
  { id: 'shimetsuke', anim: 'squeeze', ja: 'しめつけ', jaHint: 'ぎゅっと締め付けられる・圧迫される', en: 'Squeezing / pressure', enHint: 'Constricting pressure or tightness (classic angina description)' },
  { id: 'hirihiri', anim: 'burn', ja: 'ひりひり', jaHint: '焼けるような・しみるような', en: 'Burning / stinging', enHint: 'Burning, raw or stinging sensation' },
  { id: 'biribiri', anim: 'electric', ja: 'びりびり', jaHint: '電気が走るような', en: 'Electric / shooting', enHint: 'Electric, shooting or radiating (suggests nerve involvement)' },
  { id: 'zuun', anim: 'heavy', ja: 'ずーん', jaHint: '重くのしかかる鈍い痛み', en: 'Dull, heavy ache', enHint: 'Deep, heavy, dull ache' },
  { id: 'gangan', anim: 'pound', ja: 'がんがん', jaHint: '叩かれるように響く', en: 'Pounding', enHint: 'Pounding, hammering (often headache)' },
  { id: 'shikushiku', anim: 'nag', ja: 'しくしく', jaHint: '弱い痛みがだらだら続く', en: 'Nagging ache', enHint: 'Mild, persistent, nagging ache (often abdominal)' },
  { id: 'jinjin', anim: 'tingle', ja: 'じんじん', jaHint: 'しびれるような・うずく', en: 'Tingling / numb ache', enHint: 'Tingling, numb, pins-and-needles ache' },
];

// 0–10 numeric rating scale with face anchors.
export const PAIN_SCALE = [
  { v: 0, face: '😀', ja: '痛くない', en: 'No pain' },
  { v: 2, face: '🙂', ja: '少し痛い', en: 'Hurts a little' },
  { v: 4, face: '😐', ja: 'けっこう痛い', en: 'Hurts more' },
  { v: 6, face: '😟', ja: 'かなり痛い', en: 'Hurts even more' },
  { v: 8, face: '😣', ja: 'とても痛い', en: 'Hurts a whole lot' },
  { v: 10, face: '😭', ja: 'がまんできない', en: 'Worst pain imaginable' },
];

// Feelings: richer than happy/sad, and several of them are consent-relevant signals.
// `concern: true` feelings count as an unresolved concern for the understanding score.
export const FEELINGS = [
  { id: 'anxious', emoji: '😟', ja: '不安', en: 'Anxious', concern: false },
  { id: 'scared', emoji: '😨', ja: 'こわい', en: 'Scared', concern: false },
  { id: 'confused', emoji: '😵‍💫', ja: 'よくわからない', en: 'Confused', concern: true },
  { id: 'overwhelmed', emoji: '🌀', ja: '情報が多すぎる', en: 'Overwhelmed — too much information', concern: true },
  { id: 'rushed', emoji: '⏱️', ja: '急かされている', en: 'Feels rushed', concern: true },
  { id: 'needTime', emoji: '🕰️', ja: '考える時間がほしい', en: 'Needs time to think', concern: true },
  { id: 'hesitant', emoji: '😳', ja: '質問しにくい', en: 'Hesitant to ask questions', concern: true },
  { id: 'family', emoji: '👪', ja: '家族と相談したい', en: 'Wants to consult family', concern: true },
  { id: 'painFocus', emoji: '🤕', ja: '痛くて集中できない', en: 'Pain makes it hard to focus', concern: true },
  { id: 'tired', emoji: '😩', ja: '疲れた', en: 'Tired', concern: false },
  { id: 'relieved', emoji: '😌', ja: '安心した', en: 'Relieved', concern: false, resolves: true },
  { id: 'convinced', emoji: '🙆', ja: '納得した', en: 'It makes sense to me', concern: false, resolves: true },
];

// 3D library (procedural Three.js models in shared/models/<id>.js).
export const MODELS = [
  { id: 'heart', icon: '🫀', ja: '心臓', en: 'Heart' },
  { id: 'lungs', icon: '🫁', ja: '肺', en: 'Lungs' },
  { id: 'artery', icon: '🩸', ja: '冠動脈とステント治療', en: 'Coronary artery & stent (PCI)' },
  { id: 'body', icon: '🧍', ja: '人体（等身大）', en: 'Life-size body' },
];

// Elements of informed consent tracked by the understanding judge.
export const CONSENT_ELEMENTS = [
  { id: 'diagnosis', core: true, en: 'Diagnosis / condition', ja: '診断・病状' },
  { id: 'procedure', core: true, en: 'Proposed procedure', ja: '提案する治療・手術' },
  { id: 'benefits', core: true, en: 'Expected benefits', ja: '期待される効果' },
  { id: 'risks', core: true, en: 'Risks & complications', ja: 'リスク・合併症' },
  { id: 'alternatives', core: true, en: 'Alternatives (incl. non-surgical)', ja: '他の選択肢（手術以外も含む）' },
  { id: 'noTreatment', core: false, en: 'Option to decline / no treatment', ja: '治療を受けない選択' },
  { id: 'anesthesia', core: false, en: 'Anesthesia / sedation', ja: '麻酔・鎮静' },
  { id: 'recovery', core: false, en: 'Recovery & what to expect', ja: '回復・その後の流れ' },
  { id: 'questions', core: false, en: 'Invitation to ask questions', ja: '質問の機会' },
];

export const MODES = [
  { id: 'interview', en: 'Interview', ja: '問診' },
  { id: 'exam', en: 'Tests', ja: '検査' },
  { id: 'consent', en: 'Informed consent', ja: 'インフォームド・コンセント', tab: { en: 'Consent', ja: 'IC・同意' } },
];

export const LANGUAGES = {
  en: { name: 'English', native: 'English' },
  ja: { name: 'Japanese', native: '日本語' },
  es: { name: 'Spanish', native: 'Español' },
  zh: { name: 'Chinese', native: '中文' },
  ko: { name: 'Korean', native: '한국어' },
  vi: { name: 'Vietnamese', native: 'Tiếng Việt' },
  pt: { name: 'Portuguese', native: 'Português' },
  tl: { name: 'Tagalog', native: 'Tagalog' },
  ar: { name: 'Arabic', native: 'العربية' },
  hi: { name: 'Hindi', native: 'हिन्दी' },
  ru: { name: 'Russian', native: 'Русский' },
  fr: { name: 'French', native: 'Français' },
};

// Pick the label for `lang` from a catalog item, falling back to English.
export const L = (item, lang) => (item && (item[lang] ?? item.en)) ?? '';

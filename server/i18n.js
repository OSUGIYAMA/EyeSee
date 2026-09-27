// Language packs for the patient's headset. Japanese and English are written by hand; any other
// language is translated once from English by the language model and cached in data/i18n/.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, llmProvider } from './config.js';
import { PAIN_TYPES, PAIN_SCALE, FEELINGS, MODELS, MODES, LANGUAGES } from '../public/shared/catalog.js';
import { jsonCall, S } from './ai/llm.js';

const DIR = path.join(DATA_DIR, 'i18n');
fs.mkdirSync(DIR, { recursive: true });

// Interface text in the headset. Short on purpose: the conversation is the interface.
const UI = {
  en: {
    tagline: 'See what your doctor means.',
    intro1: 'Speak in the language that is easiest for you.',
    intro2: "The doctor's words appear in front of you.",
    intro3: 'Hold the AI button to ask anything.',
    start: 'Start',
    startAR: 'Start',
    startVR: 'Start in VR',
    preview: 'Preview on this screen',
    micNeeded: 'Allow the microphone to continue.',
    empty: "The doctor's words will appear here.",
    doctor: 'Doctor',
    you: 'You',
    doctorSpeaking: 'Doctor is speaking',
    listening: 'Listening',
    translating: 'Translating',
    iSee: 'I see',
    notSure: "I don't understand",
    askAI: 'Ask AI',
    holdToAsk: 'Hold and speak',
    aiListening: 'Speak now',
    aiThinking: 'Thinking',
    youAsked: 'You asked',
    doctorAsked: 'The doctor asked',
    micOff: 'Microphone off',
    words: 'Words',
    showPicture: 'Show picture',
    drawing: 'Drawing',
    painTitle: 'What does it feel like?',
    painStrength: 'How strong is it?',
    painNone: 'No pain',
    painWorst: 'Worst',
    feelingsTitle: 'How do you feel?',
    done: 'Done',
    bodyTitle: 'Point to where it hurts',
    clear: 'Clear',
    here: 'The doctor asks: here?',
    step: 'Step',
    understanding: 'Understanding',
    understood: 'I understand',
    question: 'I have a question',
    questionSent: 'Your question was sent to the doctor.',
    signHere: 'Sign here',
    sign: 'Sign',
    redo: 'Redo',
    waitDoctorSign: 'Waiting for the doctor to sign',
    recorded: 'Consent recorded',
    preparing: 'Preparing',
    recenter: 'Recenter',
    disconnected: 'Not connected to the doctor',
    pain: 'Pain',
    whereItHurts: 'Where it hurts',
    feeling: 'Feeling',
    signed: 'Signed',
    confirmed: 'Confirmed',
    tell: 'Show',
    another: 'Another spot',
    feelingsShort: 'Feelings',
    whereTitle: 'Point to where it hurts',
    answering: 'Answer',
    sources: 'Sources',
    toAI: 'To AI',
    quizWrong: 'Not quite. Listen to the doctor, then try again.',
    agreeing: 'You are agreeing to',
  },
  ja: {
    tagline: '医師の言葉が、わかる。',
    intro1: 'いちばん話しやすい言葉で話してください。',
    intro2: '医師の言葉が、目の前に表示されます。',
    intro3: 'AIボタンを押しながら、何でも聞けます。',
    start: 'はじめる',
    startAR: 'はじめる',
    startVR: 'VRではじめる',
    preview: 'この画面で試す',
    micNeeded: 'マイクを許可してください。',
    empty: '医師の言葉がここに表示されます。',
    doctor: '医師',
    you: 'あなた',
    doctorSpeaking: '医師が話しています',
    listening: '聞いています',
    translating: '翻訳中',
    iSee: 'わかった',
    notSure: 'わからない',
    askAI: 'AIに聞く',
    holdToAsk: '押しながら話す',
    aiListening: 'どうぞ',
    aiThinking: '考えています',
    youAsked: 'あなたの質問',
    doctorAsked: '医師の質問',
    micOff: 'マイクオフ',
    words: 'ことば',
    showPicture: '絵で見る',
    drawing: '描いています',
    painTitle: 'どんな痛みですか',
    painStrength: '痛みの強さは',
    painNone: '痛くない',
    painWorst: 'がまんできない',
    feelingsTitle: 'いまの気持ちは',
    done: '完了',
    bodyTitle: '痛いところを指してください',
    clear: 'やり直す',
    here: '医師：ここですか？',
    step: 'ステップ',
    understanding: '理解度',
    understood: '理解しました',
    question: '質問がある',
    questionSent: '医師に伝えました。説明を聞いてから、もう一度選んでください。',
    signHere: 'ここに署名してください',
    sign: '署名する',
    redo: 'やり直す',
    waitDoctorSign: '医師の署名を待っています',
    recorded: '同意が記録されました',
    preparing: '準備しています',
    recenter: '正面に戻す',
    disconnected: '医師とつながっていません',
    pain: '痛み',
    whereItHurts: '痛い場所',
    feeling: '気持ち',
    signed: '署名しました',
    confirmed: '確認',
    tell: '伝える',
    another: 'もう一か所',
    feelingsShort: '気持ち',
    whereTitle: '痛いところを指してください',
    answering: '回答',
    sources: '出典',
    toAI: 'AIへ',
    quizWrong: 'ちがいます。医師の説明を聞いてから、もう一度えらんでください。',
    agreeing: '同意する内容',
  },
};

let modelInfo = null;
async function models() {
  if (modelInfo) return modelInfo;
  modelInfo = {};
  for (const m of MODELS) {
    try {
      const mod = await import(`../public/shared/models/${m.id}.js`);
      const obj = mod.create();
      modelInfo[m.id] = { parts: obj.parts.map((p) => ({ id: p.id, label: p.label, info: p.info })), steps: mod.meta.steps || [] };
      obj.dispose?.();
    } catch (err) {
      console.warn(`[i18n] model ${m.id}:`, err.message);
      modelInfo[m.id] = { parts: [], steps: [] };
    }
  }
  return modelInfo;
}

/** Flat key → text map for one of the two hand-written languages. */
async function builtin(lang) {
  const k = lang === 'ja' ? 'ja' : 'en';
  const out = {};
  for (const [key, v] of Object.entries(UI[k])) out[`ui.${key}`] = v;
  for (const p of PAIN_TYPES) {
    out[`pain.${p.id}.name`] = k === 'ja' ? p.ja : p.en;
    out[`pain.${p.id}.hint`] = k === 'ja' ? p.jaHint : p.enHint;
  }
  for (const f of FEELINGS) out[`feeling.${f.id}`] = f[k];
  for (const m of MODELS) out[`model.${m.id}`] = m[k];
  for (const m of MODES) out[`mode.${m.id}`] = m[k];
  const info = await models();
  for (const [id, mi] of Object.entries(info)) {
    for (const p of mi.parts) {
      out[`part.${id}.${p.id}.label`] = p.label?.[k] || p.label?.en || p.id;
      if (p.info) out[`part.${id}.${p.id}.info`] = p.info?.[k] || p.info?.en || '';
    }
    mi.steps.forEach((s, i) => (out[`step.${id}.${i}`] = s[k] || s.en));
  }
  return out;
}

const cache = new Map();

/** Resolve a pack; unknown languages are translated (once) from English. */
export async function pack(lang) {
  if (!LANGUAGES[lang]) lang = 'en';
  if (lang === 'ja' || lang === 'en') return builtin(lang);
  if (cache.has(lang)) return cache.get(lang);
  const file = path.join(DIR, `${lang}.json`);
  if (fs.existsSync(file)) {
    const p = JSON.parse(fs.readFileSync(file, 'utf8'));
    cache.set(lang, p);
    return p;
  }
  const en = await builtin('en');
  if (!llmProvider()) return en;
  const job = translatePack(en, lang)
    .then((p) => {
      fs.writeFileSync(file, JSON.stringify(p, null, 1));
      cache.set(lang, p);
      return p;
    })
    .catch((err) => {
      console.warn(`[i18n] ${lang} failed:`, err.message);
      cache.delete(lang);
      return en;
    });
  cache.set(lang, job);
  return job;
}

async function translatePack(en, lang) {
  const keys = Object.keys(en);
  const out = { ...en };
  // Chunked so each structured call stays small and fast.
  for (let i = 0; i < keys.length; i += 70) {
    const chunk = Object.fromEntries(keys.slice(i, i + 70).map((k) => [k, en[k]]));
    const r = await jsonCall({
      name: 'ui_pack',
      system: `Translate the user-interface text of a medical app for a patient into ${LANGUAGES[lang].name}. Keep each string short, natural and plain, as a native ${LANGUAGES[lang].name} app would phrase it. Medical words must be the standard terms patients know. Pain descriptions: use the everyday words ${LANGUAGES[lang].name} speakers use to describe that kind of pain. Keep the same keys.`,
      prompt: JSON.stringify(chunk, null, 1),
      schema: S.obj(Object.fromEntries(Object.keys(chunk).map((k) => [k, S.str()]))),
      effort: 'low',
      maxTokens: 6000,
    });
    Object.assign(out, r);
  }
  return out;
}

/** Warm the cache for a language (called when the patient language changes). */
export const prewarm = (lang) => pack(lang).catch(() => {});
export const PAIN_SCALE_POINTS = PAIN_SCALE.map((p) => p.v);

import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');

const env = process.env;
const flag = (v, dflt) => (v == null || v === '' ? dflt : !/^(0|false|no|off)$/i.test(v));

// Anthropic credentials can come from an env var or an `ant auth login` profile.
const anthropicProfile = fs.existsSync(path.join(os.homedir(), '.config', 'anthropic'));
const hasAnthropic = flag(env.EYESEE_USE_CLAUDE, true) && !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || anthropicProfile);

// Google Cloud (Vertex AI) service account: a key file path or the whole JSON in an env var.
function googleCredentials() {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch {
      console.warn('[config] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }
  const file = env.GOOGLE_APPLICATION_CREDENTIALS && path.resolve(ROOT, env.GOOGLE_APPLICATION_CREDENTIALS);
  if (file && fs.existsSync(file)) {
    env.GOOGLE_APPLICATION_CREDENTIALS = file; // absolute, for google-auth-library
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return null;
}
const gcp = googleCredentials();

export const config = {
  port: +(env.PORT || 8080),
  httpsPort: +(env.HTTPS_PORT || 8443),
  https: flag(env.EYESEE_HTTPS, true),

  // Claude (if configured) does the language work: translation, glossary, consent, AI mediator.
  anthropic: hasAnthropic,
  model: env.EYESEE_MODEL || 'claude-opus-5',
  fastModel: env.EYESEE_FAST_MODEL || env.EYESEE_MODEL || 'claude-opus-5',
  serverFallbacks: flag(env.EYESEE_FALLBACKS, true),
  webSearch: flag(env.EYESEE_WEB_SEARCH, true),

  // Gemini on Vertex AI: speech (audio in → transcript + translation in one call), text and images.
  google: !!gcp,
  googleCredentials: gcp,
  googleProject: env.GOOGLE_CLOUD_PROJECT || gcp?.project_id || '',
  googleLocation: env.GOOGLE_CLOUD_LOCATION || 'global',
  geminiModel: env.GEMINI_MODEL || 'gemini-3.6-flash',
  geminiImageModel: env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  ttsModel: env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-tts',
  ttsVoice: env.GEMINI_TTS_VOICE || 'Kore',

  // OpenAI: optional alternative for speech-to-text / images / text.
  openai: !!env.OPENAI_API_KEY,
  sttModel: env.OPENAI_STT_MODEL || 'gpt-4o-transcribe',
  imageModel: env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  openaiTextModel: env.OPENAI_TEXT_MODEL || 'gpt-4.1',

  // Understanding judge: JEV (TypeSafe AI System One) scores every utterance during consent.
  judge: env.EYESEE_JUDGE || 'auto', // auto | jev | llm | heuristic
  jevUrl: env.JEV_API_URL || 'https://api.typesafe.ai/v1/systemone',
  jevKey: env.JEV_API_KEY || env.TYPESAFE_API_KEY || '',
  jevModel: env.JEV_MODEL || 'jev-latest',
  consentThreshold: +(env.EYESEE_CONSENT_THRESHOLD || 7),

  patientLang: env.EYESEE_PATIENT_LANG || 'ja',
  doctorLang: env.EYESEE_DOCTOR_LANG || 'en',

  // Cost guards (hackathon credits have no hard cap).
  maxImagesPerSession: +(env.EYESEE_MAX_IMAGES || 12),
  maxCallsPerMinute: +(env.EYESEE_MAX_CALLS_PER_MIN || 60),
};

export const llmProvider = () => (config.anthropic ? 'claude' : config.google ? 'gemini' : config.openai ? 'openai' : null);
export const sttProvider = () => (config.google ? 'gemini' : config.openai ? 'openai' : null);
export const imageProvider = () => (config.google ? 'gemini' : config.openai ? 'openai' : null);

export function judgeProvider() {
  const j = config.judge;
  if ((j === 'auto' || j === 'jev') && config.jevKey) return 'jev';
  if ((j === 'auto' || j === 'llm') && llmProvider()) return 'llm';
  return 'heuristic';
}

export const caps = () => ({
  llm: llmProvider(),
  stt: sttProvider(),
  image: imageProvider(),
  tts: config.google,
  webSearch: (config.anthropic && config.webSearch) || config.google,
  judge: judgeProvider(),
  consentThreshold: config.consentThreshold,
});

export function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

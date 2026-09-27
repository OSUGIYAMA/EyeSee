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
const hasAnthropic = !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || anthropicProfile);
const hasOpenAI = !!env.OPENAI_API_KEY;

export const config = {
  port: +(env.PORT || 8080),
  httpsPort: +(env.HTTPS_PORT || 8443),
  https: flag(env.EYESEE_HTTPS, true),

  // Claude does the language work: translation, glossary, understanding judge, consent, AI mediator.
  anthropic: hasAnthropic,
  model: env.EYESEE_MODEL || 'claude-opus-5',
  fastModel: env.EYESEE_FAST_MODEL || env.EYESEE_MODEL || 'claude-opus-5',
  serverFallbacks: flag(env.EYESEE_FALLBACKS, true),
  webSearch: flag(env.EYESEE_WEB_SEARCH, true),

  // OpenAI does speech-to-text and image generation (and text, only if no Claude credentials).
  openai: hasOpenAI,
  sttModel: env.OPENAI_STT_MODEL || 'gpt-4o-transcribe',
  imageModel: env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  openaiTextModel: env.OPENAI_TEXT_MODEL || 'gpt-4.1',

  // Understanding judge: 'auto' → JEV if configured, else LLM, else offline heuristic.
  judge: env.EYESEE_JUDGE || 'auto',
  jevUrl: env.JEV_API_URL || '',
  jevKey: env.JEV_API_KEY || '',
  consentThreshold: +(env.EYESEE_CONSENT_THRESHOLD || 8),

  patientLang: env.EYESEE_PATIENT_LANG || 'ja',
  doctorLang: env.EYESEE_DOCTOR_LANG || 'en',
  maxImagesPerSession: +(env.EYESEE_MAX_IMAGES || 12),
};

export const caps = () => ({
  llm: config.anthropic ? 'claude' : config.openai ? 'openai' : null,
  stt: config.openai,
  image: config.openai,
  webSearch: config.anthropic && config.webSearch,
  judge: judgeProvider(),
  consentThreshold: config.consentThreshold,
});

export function judgeProvider() {
  const j = config.judge;
  if (j === 'jev' || (j === 'auto' && config.jevUrl)) return 'jev';
  if (j === 'heuristic') return 'heuristic';
  if (config.anthropic || config.openai) return 'llm';
  return 'heuristic';
}

export function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

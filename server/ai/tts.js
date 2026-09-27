// Spoken voice for the headset: the doctor's words read aloud in the patient's language.
// Gemini TTS returns raw 16-bit PCM; we wrap it as WAV and cache it on disk.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, config } from '../config.js';
import { gemini } from './gemini.js';
import { limited } from './llm.js';

const DIR = path.join(DATA_DIR, 'tts');
fs.mkdirSync(DIR, { recursive: true });

export const canSpeak = () => !!gemini;

const inflight = new Map();

/** @returns {Promise<string>} path to a cached WAV file */
export function speak(text, lang) {
  const key = crypto.createHash('sha1').update(`${lang}|${text}`).digest('hex');
  const file = path.join(DIR, `${key}.wav`);
  if (fs.existsSync(file)) return Promise.resolve(file);
  if (!inflight.has(key)) inflight.set(key, synth(text, file).finally(() => inflight.delete(key)));
  return inflight.get(key);
}

async function synth(text, file) {
  const res = await limited(() =>
    gemini.models.generateContent({
      model: config.ttsModel,
      contents: [{ role: 'user', parts: [{ text }] }],
      config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoice } } } },
    }),
  );
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error('TTS returned no audio');
  const rate = +(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000);
  const pcm = Buffer.from(part.inlineData.data, 'base64');
  fs.writeFileSync(file, Buffer.concat([wavHeader(pcm.length, rate), pcm]));
  return file;
}

function wavHeader(bytes, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}

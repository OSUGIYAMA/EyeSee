// OpenAI handles what Claude doesn't: speech-to-text and image generation.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import OpenAI, { toFile } from 'openai';
import { config, DATA_DIR } from '../config.js';

export const openai = config.openai ? new OpenAI() : null;
export const IMAGE_DIR = path.join(DATA_DIR, 'images');

/**
 * Transcribe one speech segment.
 * @param {Buffer} audio  WAV (from the browser recorder) or any format OpenAI accepts
 * @param {object} o
 * @param {string} [o.language]  ISO-639-1 hint; omit to auto-detect (patients may code-switch)
 * @param {string} [o.prompt]    vocabulary hint (recent medical terms improve accuracy)
 */
export async function transcribe(audio, { language, prompt, filename = 'speech.wav' } = {}) {
  if (!openai) throw new Error('Speech-to-text needs OPENAI_API_KEY');
  const file = await toFile(audio, filename);
  const res = await openai.audio.transcriptions.create({
    file,
    model: config.sttModel,
    ...(language && { language }),
    ...(prompt && { prompt: prompt.slice(0, 800) }),
  });
  return (res.text || '').trim();
}

/** Generate an explanatory illustration; returns a URL path served from /media/images. */
export async function generateImage(prompt) {
  if (!openai) throw new Error('Image generation needs OPENAI_API_KEY');
  const res = await openai.images.generate({ model: config.imageModel, prompt, size: '1024x1024', n: 1 });
  const item = res.data?.[0];
  let buf;
  if (item?.b64_json) buf = Buffer.from(item.b64_json, 'base64');
  else if (item?.url) buf = Buffer.from(await (await fetch(item.url)).arrayBuffer());
  else throw new Error('Image API returned no image');
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
  await fs.writeFile(path.join(IMAGE_DIR, name), buf);
  return `/media/images/${name}`;
}

// Gemini on Vertex AI (Google Cloud service account). Used for speech (audio → transcript +
// translation in a single call), text JSON when Claude isn't configured, and illustrations.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { config, DATA_DIR } from '../config.js';

export const gemini = config.google
  ? new GoogleGenAI({
      vertexai: true,
      project: config.googleProject,
      location: config.googleLocation,
      googleAuthOptions: { credentials: config.googleCredentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] },
    })
  : null;

export const IMAGE_DIR = path.join(DATA_DIR, 'images');

/**
 * Structured JSON from Gemini. `audio` (optional) is sent as inline audio before the text prompt.
 * @param {{system:string, prompt:string, schema:object, audio?:{data:Buffer,mime:string}, thinking?:'MINIMAL'|'LOW'|'MEDIUM'|'HIGH', search?:boolean}} o
 */
export async function geminiJSON({ system, prompt, schema, audio, thinking = 'LOW', search = false }) {
  const parts = [];
  if (audio) parts.push({ inlineData: { mimeType: audio.mime, data: audio.data.toString('base64') } });
  parts.push({ text: prompt });
  const res = await gemini.models.generateContent({
    model: config.geminiModel,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      thinkingConfig: { thinkingLevel: thinking },
      ...(search && { tools: [{ googleSearch: {} }] }),
    },
  });
  const text = res.text || '';
  const data = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources = chunks.filter((c) => c.web?.uri).map((c) => ({ title: c.web.title || c.web.uri, url: c.web.uri }));
  if (sources.length) Object.defineProperty(data, '_sources', { value: sources.slice(0, 5), enumerable: false });
  return data;
}

/** Text-free illustration (image models garble non-Latin labels, so captions are drawn by the UI). */
export async function geminiImage(prompt) {
  const res = await gemini.models.generateContent({
    model: config.geminiImageModel,
    contents: prompt,
    config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error('Image model returned no image');
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  const ext = (part.inlineData.mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png';
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(IMAGE_DIR, name), Buffer.from(part.inlineData.data, 'base64'));
  return `/media/images/${name}`;
}

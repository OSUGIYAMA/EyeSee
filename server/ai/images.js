import { imageProvider } from '../config.js';
import { limited } from './llm.js';
import { geminiImage } from './gemini.js';
import { generateImage } from './openai.js';

/** Generate an explanatory illustration; resolves to a URL path under /media/images. */
export function makeImage(prompt) {
  const p = imageProvider();
  if (!p) return Promise.reject(new Error('No image generation configured'));
  return limited(() => (p === 'gemini' ? geminiImage(prompt) : generateImage(prompt)));
}

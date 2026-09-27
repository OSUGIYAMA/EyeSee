// One entry point for every structured LLM call in EyeSee.
// Provider order: Claude (if credentials) → Gemini on Vertex → OpenAI → offline fallbacks (callers handle).
import Anthropic from '@anthropic-ai/sdk';
import { config, llmProvider } from '../config.js';
import { openai } from './openai.js';
import { gemini, geminiJSON } from './gemini.js';

export const anthropic = config.anthropic ? new Anthropic() : null;

export class LLMUnavailable extends Error {}
export class LLMRefusal extends Error {}

let fallbacksSupported = config.serverFallbacks;
let claudeSearchSupported = config.webSearch;

// ---- cost guard: a global concurrency + per-minute cap on paid calls ----
const MAX_CONCURRENT = 6;
let active = 0;
const waiters = [];
const recent = [];
export async function limited(fn) {
  const now = Date.now();
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= config.maxCallsPerMinute) throw new Error('EyeSee rate guard: too many AI calls this minute');
  recent.push(now);
  if (active >= MAX_CONCURRENT) await new Promise((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

/**
 * Ask the model for JSON matching `schema`.
 * @param {object} o
 * @param {string} o.name        short schema name (OpenAI needs one)
 * @param {string} o.system      stable system prompt
 * @param {string} o.prompt      volatile user content
 * @param {object} o.schema      JSON schema (closed objects, all keys required)
 * @param {'low'|'medium'|'high'} [o.effort]  reasoning effort (latency vs. depth)
 * @param {number} [o.maxTokens]
 * @param {boolean} [o.fast]     latency-sensitive route
 * @param {boolean} [o.search]   allow web search (Claude web_search / Gemini Google Search)
 */
export async function jsonCall(o) {
  const provider = llmProvider();
  if (!provider) throw new LLMUnavailable('No LLM credentials configured');
  return limited(() => {
    if (provider === 'claude') return claudeJSON(o);
    if (provider === 'gemini') return geminiCall(o);
    return openaiJSON(o);
  });
}

/** Audio in → JSON out (Gemini only: transcription + translation in one round trip). */
export const canHearAudio = () => !!gemini;
export async function audioJsonCall({ system, prompt, schema, audio }) {
  if (!gemini) throw new LLMUnavailable('Audio understanding needs Google Cloud credentials');
  return limited(() => geminiJSON({ system, prompt, schema, audio, thinking: 'LOW' }));
}

const GEMINI_THINKING = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' };
async function geminiCall({ system, prompt, schema, effort = 'medium', search = false }) {
  const thinking = GEMINI_THINKING[effort] || 'LOW';
  if (search) {
    try {
      return await geminiJSON({ system, prompt, schema, thinking, search: true });
    } catch (err) {
      // Fall back for this call only; the next question tries search again.
      console.warn('[llm] Gemini search + JSON failed for this call, answering without search:', err.message?.slice(0, 160));
    }
  }
  return geminiJSON({ system, prompt, schema, thinking });
}

async function claudeJSON({ system, prompt, schema, effort = 'medium', maxTokens = 4000, fast = false, search = false }) {
  const params = {
    model: fast ? config.fastModel : config.model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  };
  if (search && claudeSearchSupported) params.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }];

  let res;
  try {
    res = await createMessage(params);
  } catch (err) {
    // Web search + structured output may be unavailable for this org/model: retry once without it.
    if (params.tools && err instanceof Anthropic.BadRequestError) {
      console.warn('[llm] web search rejected, continuing without it:', err.message);
      claudeSearchSupported = false;
      delete params.tools;
      res = await createMessage(params);
    } else throw err;
  }

  if (res.stop_reason === 'refusal') throw new LLMRefusal(res.stop_details?.explanation || 'Model declined the request');
  if (res.stop_reason === 'max_tokens') throw new Error('LLM output truncated (max_tokens)');

  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const sources = [];
  for (const b of res.content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === 'web_search_result') sources.push({ title: r.title, url: r.url });
    }
  }
  const data = parseJSON(text);
  if (sources.length) Object.defineProperty(data, '_sources', { value: sources.slice(0, 5), enumerable: false });
  return data;
}

// Server-side refusal fallbacks (`fallbacks: "default"`) re-run a declined request on Anthropic's
// recommended model instead of failing the turn. If the beta is unavailable we drop it once.
async function createMessage(params) {
  if (fallbacksSupported) {
    try {
      return await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    } catch (err) {
      if (!(err instanceof Anthropic.BadRequestError)) throw err;
      console.warn('[llm] server-side fallbacks unavailable, continuing without them:', err.message);
      fallbacksSupported = false;
    }
  }
  return anthropic.messages.create(params);
}

async function openaiJSON({ name, system, prompt, schema }) {
  const res = await openai.chat.completions.create({
    model: config.openaiTextModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } },
  });
  const choice = res.choices[0];
  if (choice.message.refusal) throw new LLMRefusal(choice.message.refusal);
  return parseJSON(choice.message.content || '');
}

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('LLM did not return JSON');
  }
}

// Schema helpers: every object is closed and every key required (valid for Claude, Gemini and OpenAI strict mode).
export const S = {
  str: (description) => ({ type: 'string', ...(description && { description }) }),
  int: (description) => ({ type: 'integer', ...(description && { description }) }),
  bool: (description) => ({ type: 'boolean', ...(description && { description }) }),
  enum: (values, description) => ({ type: 'string', enum: values, ...(description && { description }) }),
  arr: (items, description) => ({ type: 'array', items, ...(description && { description }) }),
  nullable: (schema) => ({ anyOf: [schema, { type: 'null' }] }),
  obj: (properties, description) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
    ...(description && { description }),
  }),
};

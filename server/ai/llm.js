// One entry point for every structured LLM call in EyeSee.
// Claude is the primary engine; OpenAI chat is used only when no Claude credentials exist.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { openai } from './openai.js';

export const anthropic = config.anthropic ? new Anthropic() : null;

export class LLMUnavailable extends Error {}
export class LLMRefusal extends Error {}

let fallbacksSupported = config.serverFallbacks;
let webSearchSupported = config.webSearch;

/**
 * Ask the model for JSON matching `schema`.
 * @param {object} o
 * @param {string} o.name        short schema name (used by OpenAI)
 * @param {string} o.system      stable system prompt
 * @param {string} o.prompt      the volatile user content
 * @param {object} o.schema      JSON schema (every object: additionalProperties:false, all keys required)
 * @param {'low'|'medium'|'high'} [o.effort]
 * @param {number} [o.maxTokens]
 * @param {boolean} [o.fast]     latency-sensitive route (translation)
 * @param {boolean} [o.webSearch] allow Claude's web search server tool
 */
export async function jsonCall({ name, system, prompt, schema, effort = 'medium', maxTokens = 4000, fast = false, webSearch = false }) {
  if (anthropic) return claudeJSON({ system, prompt, schema, effort, maxTokens, fast, webSearch });
  if (openai) return openaiJSON({ name, system, prompt, schema });
  throw new LLMUnavailable('No LLM credentials configured');
}

async function claudeJSON({ system, prompt, schema, effort, maxTokens, fast, webSearch }) {
  const params = {
    model: fast ? config.fastModel : config.model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  };
  if (webSearch && webSearchSupported) {
    params.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }];
  }

  let res;
  try {
    res = await createMessage(params);
  } catch (err) {
    // Web search + structured output may be unavailable for this org/model: retry once without it.
    if (params.tools && err instanceof Anthropic.BadRequestError) {
      console.warn('[llm] web search rejected, continuing without it:', err.message);
      webSearchSupported = false;
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

// Schema helpers: every object is closed and every key required (valid for Claude and OpenAI strict mode).
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

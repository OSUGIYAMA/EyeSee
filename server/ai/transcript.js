// Render the minutes as plain text for the AI tasks.
import { LANGUAGES } from '../../public/shared/catalog.js';

export const langName = (code) => LANGUAGES[code]?.name || code;

const clock = (iso) => iso.slice(11, 19);

export function formatEntry(e) {
  const head = `#${e.seq} [${clock(e.ts)}]`;
  if (e.kind === 'speech') {
    const who = e.speaker === 'doctor' ? 'DOCTOR' : 'PATIENT';
    const other = e.speaker === 'doctor' ? 'patient' : 'doctor';
    const tr = e.tr?.text ? ` → shown to ${other} (${e.tr.lang}): "${e.tr.text}"` : '';
    const marks = [e.confused && 'patient pressed "I don\'t understand" on this', e.iSee && 'listener pressed "I see"'].filter(Boolean);
    return `${head} ${who} (${e.orig.lang}): "${e.orig.text}"${tr}${marks.length ? `  [${marks.join('; ')}]` : ''}`;
  }
  if (e.kind === 'event') return `${head} EVENT (${e.speaker}): ${e.text?.doctor ?? e.event?.type}`;
  if (e.kind === 'ai') {
    const q = e.ai.question?.doctor || '';
    const a = e.ai.answer?.doctor || (e.ai.pending ? '(thinking…)' : '');
    return `${head} EYESEE AI (asked by ${e.ai.from}): Q: "${q}" A: "${a}"`;
  }
  return `${head} NOTE: ${e.text?.doctor ?? ''}`;
}

/** @param {object} state  @param {{modes?:string[], last?:number}} [o] */
export function formatTranscript(state, { modes, last } = {}) {
  let list = state.entries.filter((e) => !e.pending || e.kind === 'ai');
  if (modes) list = list.filter((e) => modes.includes(e.mode));
  if (last) list = list.slice(-last);
  return list.map(formatEntry).join('\n') || '(nothing said yet)';
}

export const explainedTerms = (state) =>
  [...new Set(state.entries.flatMap((e) => (e.terms || []).map((t) => t.term.toLowerCase())))].slice(-60);

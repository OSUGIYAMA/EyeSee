// How a speech entry reads on each side: the main line is always in the reader's own language,
// with what was actually said (if it was another language) as a small secondary line.

/** @returns {{ main: string, sub: string, subLang: string|null, pending: boolean }} */
export function readFor(e, lang) {
  const orig = e.orig || { text: '', lang: null };
  const tr = e.tr;
  if (orig.lang === lang) return { main: orig.text, sub: tr?.text || '', subLang: tr?.lang || null, pending: !!e.pending, translated: false };
  if (tr?.text && tr.lang === lang) return { main: tr.text, sub: orig.text, subLang: orig.lang, pending: !!e.pending, translated: true };
  // Translation missing (offline or failed): show what we have.
  return { main: tr?.text || orig.text, sub: tr?.text ? orig.text : '', subLang: tr?.text ? orig.lang : null, pending: !!e.pending, translated: false };
}

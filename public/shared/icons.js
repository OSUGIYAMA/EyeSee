// Minimal line icons in the spirit of SF Symbols (stroke = currentColor).
const svg = (d, size = 22, w = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icon = {
  plus: (s) => svg('<path d="M12 5v14M5 12h14"/>', s),
  mic: (s) => svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>', s),
  ellipsis: (s) => svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>', s),
  xmark: (s) => svg('<path d="M6 6l12 12M18 6L6 18"/>', s, 2.4),
  chevronLeft: (s) => svg('<path d="M15 5l-7 7 7 7"/>', s, 2.4),
  chevronRight: (s) => svg('<path d="M9 5l7 7-7 7"/>', s, 2.4),
  arrowUp: (s) => svg('<path d="M12 19V5M6 11l6-6 6 6"/>', s, 2.4),
  check: (s) => svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', s, 2.6),
  keyboard: (s) => svg('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10"/>', s),
  body: (s) => svg('<circle cx="12" cy="4.5" r="2"/><path d="M12 7.5v7M7 9.5l5 1 5-1M9.5 21l2.5-6.5 2.5 6.5"/>', s),
  wave: (s) => svg('<path d="M3 12h2l2-5 3 10 3-12 3 9 2-2h3"/>', s),
  heart: (s) => svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', s),
  face: (s) => svg('<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0"/>', s),
  cube: (s) => svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9"/>', s),
  doc: (s) => svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>', s),
};

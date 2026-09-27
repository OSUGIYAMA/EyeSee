// Plays the demo exactly as a presenter would (one tap) and reports how long it takes.
// usage: node tests/demo-timing.mjs [base=http://localhost:8080]
import WebSocket from 'ws';
const base = process.argv[2] || 'http://localhost:8080';
const room = `timing${Date.now() % 10000}`;
const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?room=${room}&role=doctor`);
let state = null;
ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'state') state = m.state; });
await new Promise((r) => ws.on('open', r));
const t0 = Date.now();
ws.send(JSON.stringify({ type: 'demoStart' }));
let last = '';
while (Date.now() - t0 < 300000) {
  await new Promise((r) => setTimeout(r, 250));
  const mark = `${state?.demo?.index}/${state?.consent?.status || '-'}`;
  if (mark !== last) console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  step ${mark}  understanding ${state?.understanding?.score}`), (last = mark);
  if (state?.consent?.status === 'signed') break;
}
console.log(`\ndemo finished in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
ws.close();
process.exit(0);

// Plays the demo as a presenter would (one tap) and reports how long it takes. The demo hands the
// quiz and the signatures to the people in the room, so this script plays them at the end: it first
// checks the demo does not answer or sign on its own, then answers as the patient and signs for both.
// usage: node tests/demo-timing.mjs [base=http://localhost:8080]
import WebSocket from 'ws';
const base = process.argv[2] || 'http://localhost:8080';
const room = `timing${Date.now() % 10000}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function connect(role) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?room=${room}&role=${role}`);
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'state') ws.state = m.state; });
  return new Promise((r) => ws.on('open', () => r(ws)));
}
const doctor = await connect('doctor');
const patient = await connect('patient');
const send = (ws, m) => ws.send(JSON.stringify(m));
const st = () => doctor.state;
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`;
send(doctor, { type: 'demoStart' });
let last = '';
while (Date.now() - t0 < 300000 && st()?.consent?.status !== 'quiz') {
  await sleep(250);
  const mark = `${st()?.demo?.index}/${st()?.consent?.status || '-'}`;
  if (mark !== last) console.log(`${at()}  step ${mark}  understanding ${st()?.understanding?.score}`), (last = mark);
}
const talk = (Date.now() - t0) / 1000;
console.log(`${at()}  quiz open — conversation took ${talk.toFixed(1)} s`);

await sleep(6000);
const idle = st().consent;
const ok = idle.status === 'quiz' && idle.quiz.every((q) => !q.tries.length) && !Object.keys(idle.signatures).length && st().demo.playing;
console.log(`${ok ? '✓' : '✗'} after 6 s nobody answered: still on the quiz, nothing signed, demo still running`);

for (const q of st().consent.quiz) {
  await sleep(1200); // reading the question
  send(patient, { type: 'consentAnswer', q: q.id, choice: q.answer });
  while (!st().consent.quiz.find((x) => x.id === q.id).passed || st().consent.reveal) await sleep(100);
}
while (st().consent.status !== 'signing') await sleep(100);
console.log(`${at()}  all correct → signing`);
const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
send(patient, { type: 'sign', dataUrl: px });
await sleep(1500);
send(doctor, { type: 'sign', dataUrl: px });
while (st().consent.status !== 'signed' || st().demo.playing) await sleep(100);
console.log(`${at()}  signed; demo finished`);
doctor.close();
patient.close();
process.exit(ok ? 0 : 1);

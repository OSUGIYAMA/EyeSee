// Protocol-level end-to-end test: plays the demo visit, checks the understanding gate,
// runs the consent flow (checkpoints + both signatures) and verifies the record.
// usage: node tests/flow.mjs [baseUrl=http://localhost:8080] [room=flowtest]
import WebSocket from 'ws';

const base = process.argv[2] || 'http://localhost:8080';
const room = process.argv[3] || `flowtest${Date.now() % 10000}`;
const wsUrl = (role) => `${base.replace(/^http/, 'ws')}/ws?room=${room}&role=${role}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++; };

function connect(role) {
  const ws = new WebSocket(wsUrl(role));
  ws.state = null;
  ws.events = [];
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'state') ws.state = m.state; else ws.events.push(m); });
  return new Promise((res) => ws.on('open', () => res(ws)));
}
const send = (ws, m) => ws.send(JSON.stringify(m));
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(100); } return false; }

const doctor = await connect('doctor');
const patient = await connect('patient');
send(doctor, { type: 'demoReset' });
await sleep(300);
const cfg = await (await fetch(`${base}/api/config`)).json();
const scores = [];
for (let i = 0; i < cfg.demoSteps; i++) {
  send(doctor, { type: 'demoNext' });
  await until(() => doctor.state?.demo.index === i + 1 && !doctor.state.entries.some((e) => e.pending) && !doctor.state.aiBusy, 60000);
  await sleep(1300); // the judge re-scores ~1 s after each utterance
  scores.push(doctor.state.understanding.score);
}
await until(() => !doctor.state.understanding.updating, 20000);
await sleep(1500);
const s = doctor.state;
console.log('score trajectory:', scores.join(' '));
check(s.entries.filter((e) => e.kind === 'speech').length >= 20, `minutes have ${s.entries.length} entries`);
check(patient.state.entries.length === s.entries.length, 'patient sees the same minutes');
const firstConsent = scores.findIndex((x, i) => i > 0 && x > 0);
const thr = cfg.caps.consentThreshold;
const altIdx = s.entries.findIndex((e) => e.kind === 'speech' && /alternatives/i.test(e.orig.text));
check(altIdx > 0 && Math.max(...s.understanding.history.filter((h) => Date.parse(h.ts) < Date.parse(s.entries[altIdx].ts)).map((h) => h.score)) < thr, `score stays below ${thr} until alternatives are discussed`);
check(s.understanding.score >= thr, `final understanding ${s.understanding.score}/10 (judge: ${s.understanding.source})`);
check(s.entries.some((e) => e.kind === 'ai' && e.ai.omissions?.some((o) => /alternative/i.test(o.doctor))), 'AI check flagged missing alternatives');
check(s.symptoms?.length === 2 && s.symptoms.every((x) => x.region && x.quality && x.intensity != null), 'symptoms recorded as where + how + how much');
check(s.entries.some((e) => e.kind === 'event' && e.event.type === 'symptom' && e.event.quality === 'shimetsuke'), 'symptom appears in the minutes');

send(doctor, { type: 'consentOpen' });
await until(() => doctor.state.consent?.status === 'precheck', 60000);
check(doctor.state.consent?.checkpoints.length >= 5, `consent has ${doctor.state.consent?.checkpoints.length} checkpoints`);
check(doctor.state.entries.some((e) => e.kind === 'ai' && e.ai.from === 'system'), 'final check posted into the chat for both sides');
send(doctor, { type: 'consentProceed', acknowledge: true });
await until(() => patient.state.consent?.status === 'quiz');
check(patient.state.consent?.status === 'quiz' && patient.state.consent.quiz.length === 3, 'patient gets a 3-question comprehension check');
const quiz = patient.state.consent.quiz;
send(patient, { type: 'consentAnswer', q: quiz[0].id, choice: (quiz[0].answer + 1) % 3 });
await until(() => doctor.events.some((e) => e.type === 'alert'));
check(doctor.events.some((e) => e.type === 'alert'), 'a wrong answer alerts the doctor');
check(patient.state.consent.status === 'quiz', 'a wrong answer does not unlock signing');
for (const q of quiz) { send(patient, { type: 'consentAnswer', q: q.id, choice: q.answer }); await sleep(120); }
await until(() => patient.state.consent?.status === 'signing');
check(patient.state.consent?.status === 'signing', 'all three correct → signing');
check(patient.state.entries.some((e) => e.event?.type === 'summary'), 'what is being agreed to appears in the chat');
const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
send(patient, { type: 'sign', dataUrl: px });
send(doctor, { type: 'sign', dataUrl: px });
await until(() => doctor.state.consent?.status === 'signed');
check(doctor.state.consent?.status === 'signed' && /^[0-9a-f]{64}$/.test(doctor.state.consent.hash), 'consent signed with SHA-256 hash');
const html = await (await fetch(`${base}/record/${room}`)).text();
check(html.includes('Comprehension check') && html.includes(doctor.state.consent.hash), 'record shows the quiz, the agreement and the hash');
doctor.close(); patient.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);

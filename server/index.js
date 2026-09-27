// EyeSee server: serves the phone app (doctor) and the Quest WebXR app (patient), keeps the shared
// session in sync over WebSockets, and runs the AI pipeline.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import selfsigned from 'selfsigned';
import { config, caps, ROOT, DATA_DIR, lanAddresses } from './config.js';
import { getRoom } from './room.js';
import * as P from './pipeline.js';
import { renderRecord } from './record.js';
import { pack } from './i18n.js';

const app = express();
app.disable('x-powered-by');
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three')));
// Short links (typing URLs in a headset is painful): /q → patient headset, /d → doctor phone.
app.get('/q', (req, res) => res.redirect(`/quest?room=${encodeURIComponent(req.query.room || 'clinic')}`));
app.get('/d', (req, res) => res.redirect(`/phone?room=${encodeURIComponent(req.query.room || 'clinic')}`));
app.use('/media/images', express.static(path.join(DATA_DIR, 'images'), { maxAge: '1d' }));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/config', (req, res) => res.json({ caps: caps(), demoSteps: P.demoLength(), lan: lanAddresses(), ports: { http: config.port, https: config.httpsPort } }));

app.get('/api/i18n/:lang', async (req, res) => res.json(await pack(String(req.params.lang).slice(0, 5))));

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  res.type('image/svg+xml').send(await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#0b1b2b', light: '#ffffff' } }));
});

// Speech segments from a device mic (WAV from the in-browser recorder).
// target=conversation → minutes; target=ai → question for EyeSee AI.
app.post('/api/rooms/:room/audio', express.raw({ type: () => true, limit: '12mb' }), (req, res) => {
  const role = req.query.role === 'doctor' ? 'doctor' : 'patient';
  const room = getRoom(req.params.room);
  const audio = { data: req.body, mime: (req.headers['content-type'] || 'audio/wav').split(';')[0] };
  if (!audio.data?.length || audio.data.length < 2000) return res.status(400).json({ error: 'empty audio' });
  res.status(202).json({ ok: true });
  const mode = req.query.mode === 'ptt' ? 'ptt' : 'vad';
  const job = req.query.target === 'ai' ? P.askAIAudio(room, role, audio) : P.speechAudio(room, role, audio, { mode });
  job.catch((err) => console.error('[audio]', err));
});

app.get('/api/rooms/:room/export.json', (req, res) => {
  const room = getRoom(req.params.room);
  res.setHeader('Content-Disposition', `attachment; filename="${room.state.sessionId}.json"`);
  res.json(room.state);
});

app.get('/record/:room', (req, res) => res.type('html').send(renderRecord(getRoom(req.params.room))));

// ---------------------------------------------------------------- WebSocket protocol

const HANDLERS = {
  // any role
  text: (room, ws, m) => P.speechText(room, ws.role, m.text, m.source === 'webspeech' ? 'voice' : 'typed'),
  vad: (room, ws, m) => {
    room.state.speaking[ws.role] = !!m.speaking;
    (room.vadAt ||= {})[ws.role] = Date.now(); // when each side last started/stopped talking (cross-talk check)
    room.changed(false);
  },
  aiListening: (room, ws, m) => {
    room.state.aiListening[ws.role] = !!m.on;
    room.changed(false);
  },
  ask: (room, ws, m) => P.askAI(room, ws.role, m.text),
  isee: (room, ws, m) => P.iSee(room, ws.role, m.entryId),
  confused: (room, ws, m) => P.confused(room, ws.role, m.entryId),
  termImage: (room, ws, m) => P.termImage(room, m.entryId, m.termId),
  modelView: (room, ws, m) => {
    const st = room.state.stage;
    if (st?.tool !== 'model') return;
    st.yaw = +m.yaw || 0;
    st.pitch = Math.max(-1.2, Math.min(1.2, +m.pitch || 0));
    st.viewBy = ws.role;
    room.changed(false);
  },
  modelHighlight: (room, ws, m) => {
    const st = room.state.stage;
    if (st?.tool !== 'model' && st?.tool !== 'body') return;
    st.highlight = m.part || null;
    st.highlightBy = ws.role;
    room.changed(false);
  },
  modelStep: (room, ws, m) => {
    const st = room.state.stage;
    if (st?.tool !== 'model') return;
    st.step = Math.max(0, Math.min(8, +m.step || 0));
    room.changed(false);
  },
  bodyPoint: (room, ws, m) => P.symptomPoint(room, m.region, m.point, ws.role),
  symptomQuality: (room, ws, m) => P.symptomQuality(room, m.id, m.quality),
  symptomIntensity: (room, ws, m) => P.symptomIntensity(room, m.id, m.v),
  symptomDone: (room) => P.symptomDone(room),
  symptomRemove: (room, ws, m) => P.symptomRemove(room, m.id),
  openTool: (room, ws, m) => P.openTool(room, m.tool),
  closeImage: (room) => room.state.stage?.tool === 'image' && P.setStage(room, null),
  bodyClear: (room) => [...(room.state.symptoms || [])].forEach((x) => P.symptomRemove(room, x.id)),
  // patient
  painType: (room, ws, m) => P.painType(room, m.id),
  painIntensity: (room, ws, m) => P.painIntensity(room, m.v),
  feeling: (room, ws, m) => P.feeling(room, m.id),
  consentAck: (room, ws, m) => ws.role === 'patient' && P.consentAck(room, m.cp, m.status),
  consentGoto: (room, ws, m) => P.consentGoto(room, m.index),
  sign: (room, ws, m) => P.sign(room, ws.role, m.dataUrl),
  // doctor
  mode: (room, ws, m) => P.setMode(room, m.mode),
  stage: (room, ws, m) => (m.stage?.tool === 'model' || m.stage?.tool === 'body' ? P.showModel(room, { id: m.stage.tool === 'body' ? 'body' : m.stage.modelId, ...m.stage }) : P.setStage(room, m.stage || null)),
  consentOpen: (room, ws, m) => P.openConsent(room, { force: !!m.force }),
  consentProceed: (room, ws, m) => P.consentProceed(room, { acknowledgeOmissions: !!m.acknowledge }),
  consentCancel: (room) => P.consentCancel(room),
  newSession: (room, ws, m) => {
    P.demoStop(room);
    room.newSession(m.patientLang);
  },
  patientLang: (room, ws, m) => P.setPatientLang(room, P.normLang(m.lang), 'doctor'),
  demoNext: (room) => P.demoNext(room),
  demoPlay: (room) => P.demoPlay(room),
  demoStop: (room) => P.demoStop(room),
  demoReset: (room) => {
    P.demoStop(room);
    room.newSession();
  },
};
const DOCTOR_ONLY = new Set(['mode', 'stage', 'consentOpen', 'consentProceed', 'consentCancel', 'newSession', 'patientLang', 'demoNext', 'demoPlay', 'demoStop', 'demoReset']);

function attachWS(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1_000_000 });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    ws.role = url.searchParams.get('role') === 'doctor' ? 'doctor' : 'patient';
    const room = getRoom(url.searchParams.get('room'));
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    room.join(ws);
    ws.on('message', async (raw) => {
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (m.type === 'ping') return room.send(ws, { type: 'pong', t: m.t });
      const h = HANDLERS[m.type];
      if (!h || (DOCTOR_ONLY.has(m.type) && ws.role !== 'doctor')) return;
      try {
        await h(room, ws, m);
      } catch (err) {
        console.error(`[ws] ${m.type}:`, err);
        room.send(ws, { type: 'toast', level: 'error', text: { doctor: err.message, patient: 'エラーが発生しました' } });
      }
    });
    ws.on('close', () => room.leave(ws));
  });
  // Drop dead connections (headset taken off, phone locked) so presence stays truthful.
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) ws.terminate();
      else (ws.isAlive = false), ws.ping();
    }
  }, 15_000).unref();
}

// ---------------------------------------------------------------- start

const httpServer = http.createServer(app);
attachWS(httpServer);
httpServer.listen(config.port, () => console.log(`EyeSee http  → http://localhost:${config.port}`));

if (config.https) {
  const tls = await certificate();
  const httpsServer = https.createServer(tls, app);
  attachWS(httpsServer);
  httpsServer.listen(config.httpsPort, () => {
    console.log(`EyeSee https → https://localhost:${config.httpsPort}`);
    for (const ip of lanAddresses()) console.log(`   on Wi-Fi:   https://${ip}:${config.httpsPort}   (Quest & phone; accept the self-signed certificate once)`);
  });
}
const c = caps();
console.log(`AI: language=${c.llm || 'offline'} · speech=${c.stt || 'browser/offline'} · images=${c.image || 'off'} · understanding judge=${c.judge}`);

async function certificate() {
  const dir = path.join(DATA_DIR, 'certs');
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  const ips = lanAddresses();
  const stamp = path.join(dir, 'ips.txt');
  const fresh = fs.existsSync(certFile) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === ips.join(',');
  if (!fresh) {
    fs.mkdirSync(dir, { recursive: true });
    const pems = await selfsigned.generate([{ name: 'commonName', value: 'eyesee.local' }], {
      keySize: 2048,
      algorithm: 'sha256',
      notAfterDate: new Date(Date.now() + 825 * 864e5),
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 2, value: 'eyesee.local' }, { type: 7, ip: '127.0.0.1' }, ...ips.map((ip) => ({ type: 7, ip }))] },
      ],
    });
    fs.writeFileSync(keyFile, pems.private);
    fs.writeFileSync(certFile, pems.cert);
    fs.writeFileSync(stamp, ips.join(','));
  }
  return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
}

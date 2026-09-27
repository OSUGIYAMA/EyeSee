// A room = one exam room: the doctor's phone + the patient's headset + the shared session state.
// The session state doubles as the minutes (議事録) and is persisted to data/sessions/<id>.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, caps, DATA_DIR } from './config.js';

const SESSION_DIR = path.join(DATA_DIR, 'sessions');
fs.mkdirSync(SESSION_DIR, { recursive: true });

const rooms = new Map();

export function getRoom(id) {
  const key = String(id || 'clinic').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'clinic';
  if (!rooms.has(key)) rooms.set(key, new Room(key));
  return rooms.get(key);
}

export function newUnderstanding() {
  return {
    score: 0,
    history: [],
    elements: null,
    comprehension: 'none',
    concerns: [],
    risky: [],
    rationale: { doctor: '', patient: '' },
    nextStep: '',
    source: null,
    updating: false,
    error: null,
  };
}

function newSession(room, patientLang = config.patientLang) {
  return {
    sessionId: `${room}-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    room,
    createdAt: new Date().toISOString(),
    doctorLang: config.doctorLang,
    patientLang,
    mode: 'interview',
    entries: [],
    stage: null,
    speaking: { doctor: false, patient: false },
    aiListening: { doctor: false, patient: false },
    aiBusy: false,
    understanding: newUnderstanding(),
    consent: null,
    imagesUsed: 0,
    demo: { index: 0, playing: false },
    caps: caps(),
  };
}

export class Room {
  constructor(id) {
    this.id = id;
    this.clients = new Set();
    this.state = this.#load() || newSession(id);
    this.state.caps = caps();
    this.state.speaking = { doctor: false, patient: false };
    this.state.aiListening = { doctor: false, patient: false };
    this.state.aiBusy = false;
    this.state.demo = { index: this.state.demo?.index || 0, playing: false };
    this.seq = this.state.entries.reduce((m, e) => Math.max(m, e.seq), 0);
    this.broadcastTimer = null;
    this.saveTimer = null;
  }

  // ---------- lifecycle ----------
  newSession(patientLang) {
    this.save(true);
    this.state = newSession(this.id, patientLang || this.state.patientLang);
    this.seq = 0;
    this.changed();
  }

  #load() {
    // Resume the most recent session of this room after a server restart.
    try {
      const files = fs.readdirSync(SESSION_DIR).filter((f) => f.startsWith(`${this.id}-`) && f.endsWith('.json')).sort();
      if (!files.length) return null;
      return JSON.parse(fs.readFileSync(path.join(SESSION_DIR, files.at(-1)), 'utf8'));
    } catch {
      return null;
    }
  }

  save(now = false) {
    clearTimeout(this.saveTimer);
    const write = () => {
      const file = path.join(SESSION_DIR, `${this.state.sessionId}.json`);
      fs.writeFileSync(file, JSON.stringify(this.state, null, 2));
    };
    if (now) write();
    else this.saveTimer = setTimeout(write, 800);
  }

  // ---------- clients ----------
  join(ws) {
    this.clients.add(ws);
    this.send(ws, { type: 'state', state: this.state });
    this.presence();
  }

  leave(ws) {
    this.clients.delete(ws);
    if (ws.role && this.state.speaking[ws.role]) {
      this.state.speaking[ws.role] = false;
      this.changed(false);
    }
    this.presence();
  }

  presence() {
    const roles = { doctor: 0, patient: 0 };
    for (const c of this.clients) if (c.role in roles) roles[c.role]++;
    this.emit({ type: 'presence', roles });
  }

  send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  /** Transient message (toast, sound cue) to everyone, or to one role. */
  emit(msg, role) {
    const data = JSON.stringify(msg);
    for (const c of this.clients) if (c.readyState === 1 && (!role || c.role === role)) c.send(data);
  }

  /** Mark state dirty: broadcast (throttled) and persist (debounced). */
  changed(persist = true) {
    if (!this.broadcastTimer) {
      this.broadcastTimer = setTimeout(() => {
        this.broadcastTimer = null;
        this.emit({ type: 'state', state: this.state });
      }, 40);
    }
    if (persist) this.save();
  }

  // ---------- minutes ----------
  addEntry(partial) {
    const entry = {
      id: `e${++this.seq}`,
      seq: this.seq,
      ts: new Date().toISOString(),
      mode: this.state.mode,
      v: 1,
      ...partial,
    };
    this.state.entries.push(entry);
    this.changed();
    return entry;
  }

  entry(id) {
    return this.state.entries.find((e) => e.id === id);
  }

  updateEntry(id, patch) {
    const e = this.entry(id);
    if (!e) return null;
    Object.assign(e, typeof patch === 'function' ? patch(e) || {} : patch);
    e.v = (e.v || 0) + 1;
    this.changed();
    return e;
  }

  /** A non-speech event in the minutes; `text` holds what each side reads. */
  event(type, data, text, speaker = 'system') {
    return this.addEntry({ kind: 'event', speaker, event: { type, ...data }, text });
  }

  lastEntry(pred) {
    for (let i = this.state.entries.length - 1; i >= 0; i--) if (pred(this.state.entries[i])) return this.state.entries[i];
    return null;
  }

  /** Canonical hash of the minutes + consent, stamped on the signed record. */
  hash() {
    const { entries, consent, understanding, sessionId, patientLang, doctorLang } = this.state;
    const body = JSON.stringify({ sessionId, doctorLang, patientLang, entries, consent: { ...consent, hash: undefined }, score: understanding.history });
    return crypto.createHash('sha256').update(body).digest('hex');
  }
}

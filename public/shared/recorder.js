// Mic capture for both devices. Continuous voice-activity detection cuts the conversation into
// utterances (with pre-roll so first syllables aren't clipped); push-to-talk captures an AI question.
// Output is 16 kHz mono WAV — small, and accepted by every speech backend.

const RATE = 16000;
const PRE_ROLL = 0.45; // s kept before speech onset
const HANG = 0.9; // s of silence that ends an utterance
const MIN_SPEECH = 0.35; // s of voiced audio for a segment to count
const MAX_SEG = 25; // s hard cut

export class Recorder {
  /**
   * @param {object} o
   * @param {(blob: Blob, meta: {duration:number, target:string}) => void} o.onSegment
   * @param {(speaking: boolean) => void} [o.onSpeaking]   VAD state (for the live "speaking…" indicator)
   * @param {(level: number) => void} [o.onLevel]          0..1 mic level for meters
   * @param {() => boolean} [o.gate]                       return false to ignore speech starting now
   */
  constructor({ onSegment, onSpeaking, onLevel, gate }) {
    Object.assign(this, { onSegment, onSpeaking, onLevel, gate });
    this.vadOn = false; // continuous conversation capture
    this.ptt = false; // push-to-talk capture in progress
    this.ring = new Float32Array(Math.round(RATE * PRE_ROLL));
    this.ringPos = 0;
    this.seg = null;
    this.noise = 0.004;
    this.voiced = 0;
    this.silent = 0;
    this.speaking = false;
  }

  get ready() {
    return !!this.ctx;
  }

  async init() {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    await this.ctx.audioWorklet.addModule('/shared/pcm-worklet.js');
    const src = this.ctx.createMediaStreamSource(this.stream);
    const tap = new AudioWorkletNode(this.ctx, 'pcm-tap');
    tap.port.onmessage = (e) => this.#frame(e.data);
    src.connect(tap);
    // Keep the graph pulled on browsers that only process connected nodes.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    tap.connect(mute).connect(this.ctx.destination);
    this.ratio = this.ctx.sampleRate / RATE;
  }

  async resume() {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  async setListening(on) {
    if (on) {
      await this.init();
      await this.resume();
    }
    this.vadOn = on;
    if (!on && this.seg && this.seg.target === 'conversation') this.#end(false);
  }

  /** Push-to-talk (EyeSee AI questions). Conversation capture pauses while held. */
  async pttStart() {
    await this.init();
    await this.resume();
    if (this.seg?.target === 'conversation') this.#end(false);
    this.ptt = true;
    this.seg = { target: 'ai', chunks: [this.#preRoll()], len: 0, voiced: 1 };
  }

  pttEnd(send = true) {
    if (!this.ptt) return;
    this.ptt = false;
    this.#end(send);
  }

  #preRoll() {
    const r = this.ring;
    const out = new Float32Array(r.length);
    out.set(r.subarray(this.ringPos));
    out.set(r.subarray(0, this.ringPos), r.length - this.ringPos);
    return out;
  }

  #frame(input) {
    // Downsample to 16 kHz (simple decimation with averaging — fine for speech).
    const n = Math.floor(input.length / this.ratio);
    const f = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * this.ratio), b = Math.floor((i + 1) * this.ratio);
      let s = 0;
      for (let j = a; j < b; j++) s += input[j];
      f[i] = s / (b - a);
      sum += f[i] * f[i];
    }
    const rms = Math.sqrt(sum / Math.max(1, n));
    const dt = n / RATE;
    this.onLevel?.(Math.min(1, rms * 12));

    if (this.seg) {
      this.seg.chunks.push(f);
      this.seg.len += dt;
    } else {
      for (let i = 0; i < n; i++) {
        this.ring[this.ringPos] = f[i];
        this.ringPos = (this.ringPos + 1) % this.ring.length;
      }
    }
    if (this.ptt) return;

    // Adaptive noise floor + hysteresis VAD.
    const threshold = Math.max(0.012, this.noise * 3.2);
    const voiced = rms > threshold;
    if (!voiced) this.noise = this.noise * 0.995 + rms * 0.005;
    if (!this.vadOn) return;

    if (voiced) {
      this.voiced += dt;
      this.silent = 0;
      if (!this.seg && this.voiced > 0.08) {
        if (this.gate && !this.gate()) return;
        this.seg = { target: 'conversation', chunks: [this.#preRoll()], len: dt, voiced: 0 }; // pre-roll already holds this frame
        this.#speaking(true);
      }
      if (this.seg) this.seg.voiced += dt;
    } else {
      this.voiced = Math.max(0, this.voiced - dt * 0.5);
      if (this.seg) {
        this.silent += dt;
        if (this.silent > HANG) this.#end(true);
      }
    }
    if (this.seg && this.seg.len > MAX_SEG) this.#end(true);
  }

  #speaking(on) {
    if (this.speaking === on) return;
    this.speaking = on;
    this.onSpeaking?.(on);
  }

  #end(send) {
    const seg = this.seg;
    this.seg = null;
    this.silent = 0;
    this.voiced = 0;
    if (seg?.target === 'conversation') this.#speaking(false);
    if (!seg || !send) return;
    if (seg.target === 'conversation' && seg.voiced < MIN_SPEECH) return;
    const total = seg.chunks.reduce((a, c) => a + c.length, 0);
    const pcm = new Float32Array(total);
    let o = 0;
    for (const c of seg.chunks) pcm.set(c, o), (o += c.length);
    this.onSegment(encodeWav(pcm), { duration: total / RATE, target: seg.target });
  }
}

function encodeWav(pcm) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const gain = peak > 0 && peak < 0.5 ? 0.9 / peak : 1; // light normalisation for quiet mics
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i] * gain)) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

/** Browser speech recognition fallback (doctor phone, when the server has no speech-to-text). */
export function browserRecognizer(lang, onText, onSpeaking) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = false;
  let on = false;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript);
  };
  r.onspeechstart = () => onSpeaking?.(true);
  r.onspeechend = () => onSpeaking?.(false);
  r.onend = () => on && r.start();
  return {
    set(v) {
      on = v;
      v ? r.start() : r.stop();
    },
  };
}

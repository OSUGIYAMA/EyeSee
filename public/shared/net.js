// Live link to the EyeSee server: auto-reconnecting WebSocket + audio upload.

export function params() {
  const q = new URLSearchParams(location.search);
  return { room: (q.get('room') || localStorage.getItem('eyesee.room') || 'clinic').toLowerCase() };
}

export class Link extends EventTarget {
  constructor({ room, role }) {
    super();
    this.room = room;
    this.role = role;
    this.state = null;
    this.connected = false;
    this.rtt = null;
    this.queue = [];
    this.#connect();
    setInterval(() => this.send({ type: 'ping', t: performance.now() }), 5000);
  }

  #connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(this.room)}&role=${this.role}`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.backoff = 500;
      for (const m of this.queue.splice(0)) ws.send(m);
      this.dispatchEvent(new CustomEvent('link', { detail: true }));
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'state') {
        this.state = m.state;
        this.dispatchEvent(new CustomEvent('state', { detail: m.state }));
      } else if (m.type === 'pong') {
        this.rtt = Math.round(performance.now() - m.t);
      } else this.dispatchEvent(new CustomEvent(m.type, { detail: m }));
    };
    ws.onclose = () => {
      if (this.connected) this.dispatchEvent(new CustomEvent('link', { detail: false }));
      this.connected = false;
      this.backoff = Math.min((this.backoff || 500) * 1.6, 5000);
      setTimeout(() => this.#connect(), this.backoff);
    };
  }

  send(msg) {
    const data = JSON.stringify(msg);
    if (this.ws?.readyState === 1) this.ws.send(data);
    else if (msg.type !== 'ping' && msg.type !== 'vad' && msg.type !== 'modelView') this.queue.push(data);
  }

  on(type, fn) {
    this.addEventListener(type, (e) => fn(e.detail));
    return this;
  }

  /** Upload one speech segment. target: 'conversation' | 'ai'; mode: 'ptt' (held to talk) | 'vad' (hands-free) */
  async postAudio(blob, target = 'conversation', mode = 'vad') {
    const res = await fetch(`/api/rooms/${encodeURIComponent(this.room)}/audio?role=${this.role}&target=${target}&mode=${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/wav' },
      body: blob,
    });
    if (!res.ok) throw new Error(`audio upload failed (${res.status})`);
  }
}

export async function fetchConfig() {
  return (await fetch('/api/config')).json();
}

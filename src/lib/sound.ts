/**
 * Procedural sound effects via the Web Audio API — no binary assets, so the
 * bundle stays small and works offline. A single mute preference is persisted in
 * localStorage and exposed through the useSound() hook (sound controls are a
 * stated requirement of the platform).
 */
type Sfx = 'click' | 'correct' | 'wrong' | 'levelup' | 'collect' | 'whoosh' | 'tick' | 'win' | 'lose';

let ctx: AudioContext | null = null;
const KEY = 'hga_muted';

export const soundPrefs = {
  get muted() {
    return localStorage.getItem(KEY) === '1';
  },
  set muted(v: boolean) {
    localStorage.setItem(KEY, v ? '1' : '0');
  },
};

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (soundPrefs.muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.07, delay = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.05, delay = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

export function playSfx(name: Sfx) {
  if (soundPrefs.muted) return;
  switch (name) {
    case 'click':
      tone(420, 0.06, 'triangle', 0.04);
      break;
    case 'correct':
      tone(660, 0.11, 'sine', 0.06, 0);
      tone(880, 0.14, 'sine', 0.055, 0.09);
      tone(1180, 0.16, 'sine', 0.04, 0.18);
      break;
    case 'wrong':
      tone(220, 0.16, 'sawtooth', 0.045);
      tone(160, 0.22, 'sine', 0.05, 0.1);
      break;
    case 'levelup':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.055, i * 0.1));
      break;
    case 'collect':
      tone(1040, 0.07, 'triangle', 0.045);
      tone(1380, 0.09, 'triangle', 0.035, 0.06);
      break;
    case 'whoosh':
      noise(0.25, 0.04);
      break;
    case 'tick':
      tone(1200, 0.03, 'square', 0.02);
      break;
    case 'win':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'sine', 0.05, i * 0.13));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sine', 0.05, i * 0.16));
      break;
  }
}

/** Unlock the audio context after the first user gesture (browser policy). */
export function primeAudio() {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume();
}

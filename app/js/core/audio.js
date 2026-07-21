/**
 * SFX sintéticos estilo RO via Web Audio API
 */
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(m) {
  muted = m;
}

export function isMuted() {
  return muted;
}

function tone(freq, dur, type = 'square', gain = 0.08, delay = 0) {
  if (muted) return;
  try {
    const c = ac();
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur);
  } catch { /* ignore */ }
}

export const SFX = {
  click() {
    tone(420, 0.05, 'triangle', 0.06);
  },
  hit() {
    tone(880, 0.08, 'square', 0.07);
    tone(1320, 0.06, 'square', 0.04, 0.04);
  },
  miss() {
    tone(120, 0.15, 'sawtooth', 0.08);
    tone(80, 0.2, 'sawtooth', 0.05, 0.05);
  },
  levelUp() {
    // Fanfarra ascendente estilo RO
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, i * 0.1));
  },
  critical() {
    tone(1200, 0.1, 'square', 0.09);
    tone(1600, 0.12, 'square', 0.07, 0.08);
    tone(2000, 0.15, 'triangle', 0.06, 0.16);
  },
  drop() {
    tone(600, 0.1, 'sine', 0.08);
    tone(900, 0.15, 'sine', 0.07, 0.1);
    tone(1200, 0.2, 'triangle', 0.06, 0.22);
  },
  win() {
    [523, 659, 784, 988].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, i * 0.09));
  },
  forge() {
    tone(200, 0.05, 'square', 0.07);
    tone(300, 0.05, 'square', 0.06, 0.06);
    tone(400, 0.08, 'triangle', 0.05, 0.12);
  },
};

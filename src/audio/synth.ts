/**
 * Sound effects made by code (whoosh, impact, riser, pop, tick): a few lines of DSP rendered to a WAV
 * data URL, so they travel inside the project like any imported clip and need no files or network.
 * Pure and deterministic (a seeded noise source): the same call always gives the same bytes.
 */
import type { AudioClip } from '../types';

export type SfxKind = 'whoosh' | 'impact' | 'riser' | 'pop' | 'tick';

export const SFX_KINDS: SfxKind[] = ['whoosh', 'impact', 'riser', 'pop', 'tick'];

export const SFX_SAMPLE_RATE = 44100;

/** Length of each effect in seconds. */
export const SFX_SECONDS: Record<SfxKind, number> = { whoosh: 0.7, impact: 1.1, riser: 2, pop: 0.18, tick: 0.06 };

/** A repeatable white-noise source in [-1, 1] (mulberry32). */
function noiseSource(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** One-pole low-pass: `amount` in (0, 1], smaller = darker. */
const lowpass = () => {
  let y = 0;
  return (x: number, amount: number) => (y += amount * (x - y));
};

const TWO_PI = Math.PI * 2;

/** Mono samples in [-1, 1] for the effect; the peak is normalised to 0.9 so clips never clip. */
export function synthSfx(kind: SfxKind, sampleRate = SFX_SAMPLE_RATE, seed = 1): Float32Array {
  const seconds = SFX_SECONDS[kind];
  const length = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(length);
  const noise = noiseSource(seed + SFX_KINDS.indexOf(kind) * 101);
  const filter = lowpass();
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const p = i / length; // 0..1 through the effect
    let v = 0;
    if (kind === 'whoosh') {
      // Noise whose brightness sweeps up then down, under a bell-shaped volume
      const bright = 0.04 + 0.5 * Math.sin(Math.PI * p) ** 2;
      v = filter(noise(), bright) * Math.sin(Math.PI * p) ** 1.5 * 3;
    } else if (kind === 'impact') {
      // A low sine falling in pitch plus a short noise burst, decaying fast
      const freq = 45 + 90 * Math.exp(-t * 18);
      phase += (TWO_PI * freq) / sampleRate;
      v = Math.sin(phase) * Math.exp(-t * 5) + filter(noise(), 0.3) * Math.exp(-t * 40) * 1.2;
    } else if (kind === 'riser') {
      // A tone and noise rising together, swelling until the end
      const freq = 200 * 2 ** (p * 4);
      phase += (TWO_PI * freq) / sampleRate;
      v = (Math.sin(phase) * 0.6 + filter(noise(), 0.05 + 0.6 * p) * 0.8) * p ** 2;
    } else if (kind === 'pop') {
      // A short sine blip that drops in pitch
      const freq = 900 * Math.exp(-t * 25) + 250;
      phase += (TWO_PI * freq) / sampleRate;
      v = Math.sin(phase) * Math.exp(-t * 28);
    } else {
      // tick: a few milliseconds of high-passed noise
      v = (noise() - filter(noise(), 0.2)) * Math.exp(-t * 120);
    }
    // Fade the last 5 ms so the file never ends on a click
    const tail = Math.min(1, (length - 1 - i) / (0.005 * sampleRate));
    out[i] = v * tail;
  }
  const peak = out.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  if (peak > 0) for (let i = 0; i < length; i++) out[i] = (out[i] / peak) * 0.9;
  return out;
}

/** 16-bit PCM mono WAV file. */
export function encodeWav(samples: Float32Array, sampleRate = SFX_SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x)) * 32767), true));
  return bytes;
}

export function wavDataUrl(wav: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < wav.length; i += 0x8000) binary += String.fromCharCode(...wav.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** An audio clip of the effect, starting at `startFrame`, ready for the timeline. */
export function sfxClip(kind: SfxKind, startFrame: number, id: string, name: string, volume = 1): AudioClip {
  return {
    id,
    name,
    src: wavDataUrl(encodeWav(synthSfx(kind))),
    sourceDuration: SFX_SECONDS[kind],
    startFrame: Math.max(1, Math.round(startFrame)),
    offset: 0,
    duration: SFX_SECONDS[kind],
    volume: Math.min(2, Math.max(0, volume)),
    muted: false,
    kind: 'sfx',
  };
}

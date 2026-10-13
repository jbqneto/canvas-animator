/** Pure EBU R128 / ITU-R BS.1770 loudness measurement, ducking and true-peak mastering. */

import type { AudioMasterOptions } from '../types';

export interface MasteredAudio {
  channels: Float32Array[];
  integratedLufs: number;
  truePeakDb: number;
  gainDb: number;
}

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

function weightingFilters(sampleRate: number): [Biquad, Biquad] {
  const shelfF = 1681.974450955533;
  const shelfQ = 0.7071752369554196;
  const shelfGain = 3.999843853973347;
  const k = Math.tan((Math.PI * shelfF) / sampleRate);
  const vh = 10 ** (shelfGain / 20);
  const vb = vh ** 0.4996667741545416;
  const a0 = 1 + k / shelfQ + k * k;
  const shelf: Biquad = {
    b0: (vh + (vb * k) / shelfQ + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / shelfQ + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / shelfQ + k * k) / a0,
  };
  const hpF = 38.13547087602444;
  const hpQ = 0.5003270373238773;
  const hk = Math.tan((Math.PI * hpF) / sampleRate);
  const h0 = 1 + hk / hpQ + hk * hk;
  const highPass: Biquad = {
    b0: 1 / h0,
    b1: -2 / h0,
    b2: 1 / h0,
    a1: (2 * (hk * hk - 1)) / h0,
    a2: (1 - hk / hpQ + hk * hk) / h0,
  };
  return [shelf, highPass];
}

function filter(input: ArrayLike<number>, b: Biquad): Float64Array {
  const output = new Float64Array(input.length);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b.b0 * x + b.b1 * x1 + b.b2 * x2 - b.a1 * y1 - b.a2 * y2;
    output[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return output;
}

const toLufs = (energy: number) => energy > 0 ? -0.691 + 10 * Math.log10(energy) : -Infinity;
const fromLufs = (lufs: number) => 10 ** ((lufs + 0.691) / 10);

/** Integrated loudness with 400 ms blocks, 75% overlap, -70 LUFS absolute and -10 LU relative gates. */
export function integratedLufs(channels: Float32Array[], sampleRate: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || channels.length === 0) return -Infinity;
  const length = Math.min(...channels.map((c) => c.length));
  if (length === 0) return -Infinity;
  const [shelf, highPass] = weightingFilters(sampleRate);
  const filtered: Array<Float64Array | null> = channels.map((channel, i) => {
    if (channels.length >= 4 && i === 3) return null; // BS.1770 excludes LFE.
    return filter(filter(channel.subarray(0, length), shelf), highPass);
  });
  const blockLength = Math.max(1, Math.round(sampleRate * 0.4));
  const hop = Math.max(1, Math.round(blockLength * 0.25));
  const starts: number[] = [];
  if (length <= blockLength) starts.push(0);
  else {
    for (let start = 0; start + blockLength <= length; start += hop) starts.push(start);
    const endAligned = length - blockLength;
    if (starts[starts.length - 1] !== endAligned) starts.push(endAligned);
  }
  const energies: number[] = [];
  for (const start of starts) {
    const end = Math.min(length, start + blockLength);
    let total = 0;
    for (let channel = 0; channel < filtered.length; channel++) {
      const values = filtered[channel];
      if (!values) continue;
      let energy = 0;
      for (let i = start; i < end; i++) energy += values[i] * values[i];
      const channelWeight = filtered.length >= 5 && (channel === 4 || channel === 5) ? Math.SQRT2 : 1;
      total += channelWeight * energy / (end - start);
    }
    energies.push(total);
  }
  const absolute = energies.filter((energy) => toLufs(energy) >= -70);
  if (!absolute.length) return -Infinity;
  const preliminary = absolute.reduce((sum, energy) => sum + energy, 0) / absolute.length;
  const relativeGate = fromLufs(toLufs(preliminary) - 10);
  const gated = absolute.filter((energy) => energy >= relativeGate);
  if (!gated.length) return -Infinity;
  return toLufs(gated.reduce((sum, energy) => sum + energy, 0) / gated.length);
}

const sinc = (x: number) => Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);

function interpolatedSample(channel: Float32Array, position: number, radius: number): number {
  const center = Math.floor(position);
  let value = 0;
  let norm = 0;
  for (let i = center - radius + 1; i <= center + radius; i++) {
    const d = position - i;
    const ratio = Math.abs(d) / radius;
    if (ratio >= 1) continue;
    // Blackman-windowed sinc reconstructs band-limited inter-sample peaks without browser APIs.
    const window = 0.42 + 0.5 * Math.cos(Math.PI * ratio) + 0.08 * Math.cos(2 * Math.PI * ratio);
    const weight = sinc(d) * window;
    const sample = channel[Math.max(0, Math.min(channel.length - 1, i))];
    value += sample * weight;
    norm += weight;
  }
  return norm ? value / norm : 0;
}

/** 4x (default) band-limited true-peak estimate; returns dBTP. */
export function truePeakDb(channels: Float32Array[], oversample = 4): number {
  const factor = Math.max(1, Math.min(16, Math.round(oversample)));
  let peak = 0;
  for (const channel of channels) {
    if (channel.length === 0) continue;
    const radius = 8;
    const last = (channel.length - 1) * factor;
    const firstInterior = channel.length > radius * 2 ? radius * factor : 0;
    const lastInterior = channel.length > radius * 2 ? last - radius * factor : last;
    for (let i = firstInterior; i <= lastInterior; i++) {
      peak = Math.max(peak, Math.abs(interpolatedSample(channel, i / factor, radius)));
    }
    // The finite file edge has no samples outside the source to reconstruct; include its actual peaks.
    for (let i = 0; i < channel.length; i++) peak = Math.max(peak, Math.abs(channel[i]));
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

function lookAheadLimiter(channels: Float32Array[], sampleRate: number, ceilingDb: number): Float32Array[] {
  const count = Math.min(...channels.map((c) => c.length));
  const limit = 10 ** (ceilingDb / 20);
  const lookAhead = Math.max(1, Math.round(sampleRate * 0.005));
  const release = Math.exp(-1 / (sampleRate * 0.18));
  const out = channels.map((channel) => new Float32Array(channel.length));
  const peaks = new Float32Array(count);
  for (let i = 0; i < count; i++) for (const channel of channels) peaks[i] = Math.max(peaks[i], Math.abs(channel[i]));
  // Monotone deque gives the maximum in each forward look-ahead window in O(n).
  const deque = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const addPeak = (index: number) => {
    if (index >= count) return;
    while (tail > head && peaks[deque[tail - 1]] <= peaks[index]) tail--;
    deque[tail++] = index;
  };
  for (let i = 0; i < Math.min(count, lookAhead); i++) addPeak(i);
  let gain = 1;
  for (let i = 0; i < count; i++) {
    const peak = tail > head ? peaks[deque[head]] : 0;
    const desired = peak > limit ? limit / peak : 1;
    gain = desired < gain ? desired : desired + (gain - desired) * release;
    for (let c = 0; c < channels.length; c++) out[c][i] = channels[c][i] * gain;
    if (tail > head && deque[head] === i) head++;
    addPeak(i + lookAhead);
  }
  // Catch any residual inter-sample overshoot after the gain envelope.
  const measured = truePeakDb(out, 4);
  if (measured > ceilingDb) {
    const correction = 10 ** ((ceilingDb - measured) / 20);
    out.forEach((channel) => { for (let i = 0; i < channel.length; i++) channel[i] *= correction; });
  }
  return out;
}

/** Applies integrated loudness gain followed by a 4x true-peak look-ahead limiter. */
export function masterAudio(channels: Float32Array[], sampleRate: number, options: AudioMasterOptions): MasteredAudio {
  const loudness = integratedLufs(channels, sampleRate);
  const gainDb = Number.isFinite(loudness) ? options.targetLufs - loudness : 0;
  const gain = 10 ** (gainDb / 20);
  const gained = channels.map((channel) => Float32Array.from(channel, (value) => value * gain));
  const limited = lookAheadLimiter(gained, sampleRate, options.truePeakDb);
  return { channels: limited, integratedLufs: loudness, truePeakDb: truePeakDb(limited, 4), gainDb };
}

/** Music sidechain envelope: 25 ms attack, 180 ms release, and a 10 dB nominal reduction. */
export function duckMusic(
  music: Float32Array[], narration: Float32Array[], sampleRate: number, amountDb = 10,
  timing: { attackMs?: number; releaseMs?: number; thresholdDb?: number } = {}
): Float32Array[] {
  const length = Math.min(music.length ? Math.min(...music.map((c) => c.length)) : 0, narration.length ? Math.min(...narration.map((c) => c.length)) : 0);
  if (!length || sampleRate <= 0) return music.map((c) => new Float32Array(c));
  const attack = Math.exp(-1 / (sampleRate * (timing.attackMs ?? 25) / 1000));
  const release = Math.exp(-1 / (sampleRate * (timing.releaseMs ?? 180) / 1000));
  const threshold = 10 ** ((timing.thresholdDb ?? -50) / 20);
  const maxAttenuation = 10 ** (-Math.max(0, amountDb) / 20);
  const rmsWindow = Math.max(1, Math.round(sampleRate * 0.01));
  let duckGain = 1;
  let squared = 0;
  const out = music.map((channel) => new Float32Array(channel.length));
  for (let i = 0; i < length; i++) {
    let voice = 0;
    for (const channel of narration) voice = Math.max(voice, Math.abs(channel[i] ?? 0));
    squared += voice * voice;
    if (i >= rmsWindow) {
      let old = 0;
      for (const channel of narration) old = Math.max(old, Math.abs(channel[i - rmsWindow] ?? 0));
      squared -= old * old;
    }
    const rms = Math.sqrt(Math.max(0, squared / Math.min(i + 1, rmsWindow)));
    const desiredGain = rms > threshold ? maxAttenuation : 1;
    const gainCoeff = desiredGain < duckGain ? attack : release;
    duckGain = gainCoeff * duckGain + (1 - gainCoeff) * desiredGain;
    for (let c = 0; c < music.length; c++) out[c][i] = music[c][i] * duckGain;
  }
  for (let c = 0; c < music.length; c++) out[c].set(music[c].subarray(length), length);
  return out;
}

import { describe, expect, it } from 'vitest';
import { duckMusic, integratedLufs, masterAudio, truePeakDb } from '../loudness';

const tone = (sampleRate: number, segments: Array<[number, number]>, hz = 1000) => {
  const length = segments.reduce((sum, [seconds]) => sum + Math.round(seconds * sampleRate), 0);
  const channel = new Float32Array(length);
  let at = 0;
  let phase = 0;
  for (const [seconds, dbfs] of segments) {
    const count = Math.round(seconds * sampleRate);
    const amplitude = 10 ** (dbfs / 20);
    for (let i = 0; i < count; i++) {
      channel[at++] = amplitude * Math.sin(phase);
      phase += (2 * Math.PI * hz) / sampleRate;
    }
  }
  return channel;
};

describe('integrated loudness (EBU Tech 3341 generated tones)', () => {
  const sr = 48000;
  it.each([-23, -33])('measures a 20 s stereo 1 kHz tone at %d LUFS', (dbfs) => {
    const signal = tone(sr, [[20, dbfs]]);
    expect(integratedLufs([signal, signal], sr)).toBeCloseTo(dbfs, 1);
  });
  it('applies the absolute and relative gates to the 10/60/10 s sequence', () => {
    const signal = tone(sr, [[10, -72], [10, -36], [60, -23], [10, -36], [10, -72]]);
    expect(Math.abs(integratedLufs([signal, signal], sr) + 23)).toBeLessThanOrEqual(0.1);
  });
  it('energy-averages the 20/20.1/20 s sequence to -23 LUFS', () => {
    const signal = tone(sr, [[20, -26], [20.1, -20], [20, -26]]);
    expect(integratedLufs([signal, signal], sr)).toBeCloseTo(-23, 1);
  });
});

describe('true peak and mastering', () => {
  it('estimates an inter-sample peak with 4x oversampling', () => {
    const signal = tone(48000, [[0.2, -6]], 12000);
    // Shift the sequence by 45 degrees: sample peaks fall below the reconstructed sinus peak.
    for (let i = 0; i < signal.length; i++) signal[i] = 10 ** (-6 / 20) * Math.sin((Math.PI / 2) * i + Math.PI / 4);
    expect(truePeakDb([signal, signal], 4)).toBeCloseTo(-6, 1);
  });
  it('keeps the mastered signal below its true-peak ceiling', () => {
    const signal = tone(48000, [[1, -6]], 1000);
    const mastered = masterAudio([signal, signal], 48000, { targetLufs: -16, truePeakDb: -1.5 });
    expect(truePeakDb(mastered.channels, 4)).toBeLessThanOrEqual(-1.5);
    expect(Number.isFinite(mastered.gainDb)).toBe(true);
  });
});

describe('music ducking', () => {
  it('ramps down under narration and releases smoothly', () => {
    const sr = 1000;
    const music = new Float32Array(1000).fill(0.5);
    const voice = new Float32Array(1000);
    voice.fill(0.5, 200, 700);
    const ducked = duckMusic([music], [voice], sr, 10);
    expect(ducked[0][100]).toBeCloseTo(0.5, 3);
    expect(ducked[0][500]).toBeCloseTo(0.5 * 10 ** (-10 / 20), 2);
    expect(ducked[0][205]).toBeGreaterThan(ducked[0][500]);
    expect(ducked[0][900]).toBeLessThan(ducked[0][990]);
    expect(ducked[0][990]).toBeGreaterThan(0.5 * 10 ** (-10 / 20));
    expect(ducked[0][990]).toBeLessThan(0.5);
  });
});

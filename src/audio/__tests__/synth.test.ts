import { describe, expect, it } from 'vitest';
import { encodeWav, sfxClip, SFX_KINDS, SFX_SAMPLE_RATE, SFX_SECONDS, synthSfx, wavDataUrl } from '../synth';

describe('synthSfx', () => {
  for (const kind of SFX_KINDS) {
    describe(kind, () => {
      const samples = synthSfx(kind);
      it('has the documented length, is audible, normalised and ends silent', () => {
        expect(samples.length).toBe(Math.round(SFX_SECONDS[kind] * SFX_SAMPLE_RATE));
        const peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
        expect(peak).toBeGreaterThan(0.8);
        expect(peak).toBeLessThanOrEqual(0.9001);
        expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.01);
        expect(samples.every((x) => Number.isFinite(x))).toBe(true);
      });
      it('is deterministic', () => {
        expect(Array.from(synthSfx(kind).slice(0, 2000))).toEqual(Array.from(samples.slice(0, 2000)));
      });
    });
  }
  it('different seeds give different noise and the kinds differ from each other', () => {
    expect(Array.from(synthSfx('whoosh', SFX_SAMPLE_RATE, 1).slice(1000, 1050))).not.toEqual(Array.from(synthSfx('whoosh', SFX_SAMPLE_RATE, 2).slice(1000, 1050)));
    expect(Array.from(synthSfx('pop').slice(0, 50))).not.toEqual(Array.from(synthSfx('tick').slice(0, 50)));
  });
  it('a riser grows louder toward the end and an impact is loudest at the start', () => {
    const energy = (a: Float32Array, from: number, to: number) => a.slice(from, to).reduce((s, x) => s + x * x, 0);
    const riser = synthSfx('riser');
    expect(energy(riser, riser.length - 4000, riser.length - 1000)).toBeGreaterThan(energy(riser, 0, 3000) * 10);
    const impact = synthSfx('impact');
    expect(energy(impact, 0, 3000)).toBeGreaterThan(energy(impact, 30000, 33000) * 10);
  });
});

describe('encodeWav', () => {
  it('writes a valid mono 16-bit PCM header and the samples', () => {
    const wav = encodeWav(Float32Array.from([0, 1, -1, 0.5]), 8000);
    const view = new DataView(wav.buffer);
    const tag = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)]).toEqual([0, 32767, -32767, 16384]);
  });
});

describe('sfxClip', () => {
  it('is a timeline clip with an embedded WAV, clamped start and volume', () => {
    const clip = sfxClip('pop', 0, 'sfx-1', 'Pop', 5);
    expect(clip).toMatchObject({ id: 'sfx-1', name: 'Pop', startFrame: 1, offset: 0, volume: 2, muted: false, sourceDuration: SFX_SECONDS.pop, duration: SFX_SECONDS.pop });
    expect(clip.src.startsWith('data:audio/wav;base64,')).toBe(true);
    const bytes = Uint8Array.from(atob(clip.src.split(',')[1]), (c) => c.charCodeAt(0));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
  });
  it('encodes large files without blowing the call stack', () => {
    expect(() => wavDataUrl(new Uint8Array(400_000))).not.toThrow();
  });
});

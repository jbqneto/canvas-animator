import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportVideoSequence, SceneContent, seekVideo } from '../exportVideo';

const encoder = vi.hoisted(() => ({
  target: null as WritableStream | null, mp4Options: null as any,
  start: vi.fn(), add: vi.fn(), close: vi.fn(), finalize: vi.fn(), cancel: vi.fn(), audioAdd: vi.fn(),
}));
vi.mock('mediabunny', () => ({
  Output: class {
    target: any;
    constructor({ target }: any) { this.target = target; }
    addVideoTrack() {}
    addAudioTrack() {}
    start = encoder.start;
    finalize = encoder.finalize;
    cancel = encoder.cancel;
  },
  StreamTarget: class { constructor(stream: WritableStream) { encoder.target = stream; } },
  BufferTarget: class { buffer = new ArrayBuffer(8); },
  CanvasSource: class { add = encoder.add; close = encoder.close; },
  AudioBufferSource: class { add = encoder.audioAdd; close() {} },
  Mp4OutputFormat: class { constructor(options: any) { encoder.mp4Options = options; } getSupportedVideoCodecs() { return ['avc']; } getSupportedAudioCodecs() { return ['aac']; } },
  WebMOutputFormat: class { getSupportedVideoCodecs() { return ['vp9']; } getSupportedAudioCodecs() { return ['opus']; } },
  getFirstEncodableVideoCodec: vi.fn().mockResolvedValue('avc'),
  getFirstEncodableAudioCodec: vi.fn().mockResolvedValue('aac'),
  QUALITY_HIGH: 1,
}));

const scene = (): SceneContent => ({
  frames: {}, charts: [], texts: [], images: [], actors: [], paths: [],
  videoBg: { type: 'color', color: '#000', opacity: 1, playbackRate: 1 },
});
const options = () => ({ totalFrames: 6, fps: 24, width: 1280, height: 720 });

beforeEach(() => {
  Object.values(encoder).filter((fn) => typeof fn === 'function').forEach((fn: any) => fn.mockReset().mockResolvedValue(undefined));
  encoder.target = null;
  encoder.mp4Options = null;
  vi.stubGlobal('VideoEncoder', class {});
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({ getContext: () => ({ save() {}, restore() {}, clearRect() {}, fillRect() {} }) }),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('video export lifecycle', () => {
  it('encodes the requested range with exact timestamps and reports 100 only after finalization', async () => {
    const phases: string[] = [];
    const progress: number[] = [];
    encoder.finalize.mockImplementation(async () => { expect(progress.at(-1)).toBe(99); });
    const result = await exportVideoSequence(scene(), {
      ...options(), startFrame: 4, endFrame: 6,
      onPhase: (phase) => phases.push(phase), onProgress: (value) => progress.push(value),
    });
    expect(encoder.add.mock.calls).toEqual([[0, 1 / 24], [1 / 24, 1 / 24], [2 / 24, 1 / 24]]);
    expect(phases).toEqual(['preparing', 'rendering', 'finalizing']);
    expect(progress.at(-1)).toBe(100);
    expect(result.extension).toBe('mp4');
    expect(result.blob?.type).toBe('video/mp4');
    expect(encoder.cancel).not.toHaveBeenCalled();
  });

  it('streams positional writes and commits only after finalization, without an output blob', async () => {
    const file = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined), abort: vi.fn() };
    const progress: number[] = [];
    const prepareAudio = vi.fn().mockResolvedValue(null);
    const openFile = vi.fn(async (extension) => {
      expect(extension).toBe('mp4');
      expect(prepareAudio).not.toHaveBeenCalled();
      return file;
    });
    encoder.finalize.mockImplementation(async () => {
      const writer = encoder.target!.getWriter();
      await writer.write({ type: 'write', position: 16, data: new Uint8Array([1, 2]) });
      await writer.close();
      expect(file.close).not.toHaveBeenCalled();
    });
    file.close.mockImplementation(async () => { expect(progress.at(-1)).toBe(99); });
    const result = await exportVideoSequence(scene(), { ...options(), openFile, prepareAudio, onProgress: (p) => progress.push(p) });
    expect(file.write).toHaveBeenCalledWith({ type: 'write', position: 16, data: new Uint8Array([1, 2]) });
    expect(file.close).toHaveBeenCalledTimes(1);
    expect(file.abort).not.toHaveBeenCalled();
    expect(result.blob).toBeNull();
    expect(encoder.mp4Options.fastStart).toBe(false);
    expect(progress.at(-1)).toBe(100);
  });

  it('uses the actual WebM extension for the file picker when MP4 codecs are unavailable', async () => {
    const { getFirstEncodableVideoCodec } = await import('mediabunny');
    vi.mocked(getFirstEncodableVideoCodec).mockResolvedValueOnce(null).mockResolvedValueOnce('vp9');
    const file = { write: vi.fn(), close: vi.fn().mockResolvedValue(undefined), abort: vi.fn() };
    const openFile = vi.fn().mockResolvedValue(file);
    const result = await exportVideoSequence(scene(), { ...options(), openFile });
    expect(openFile).toHaveBeenCalledWith('webm');
    expect(result.extension).toBe('webm');
    expect(result.blob).toBeNull();
  });

  it.each(['preflight', 'encoding', 'commit'])('discards partial output when %s fails', async (stage) => {
    const failure = new Error('Disk export failed');
    const file = { write: vi.fn(), close: vi.fn().mockResolvedValue(undefined), abort: vi.fn().mockResolvedValue(undefined) };
    if (stage === 'preflight') (document.fonts as any).ready = Promise.reject(failure);
    if (stage === 'encoding') encoder.add.mockRejectedValueOnce(failure);
    if (stage === 'commit') file.close.mockRejectedValueOnce(failure);
    await expect(exportVideoSequence(scene(), { ...options(), openFile: async () => file })).rejects.toThrow(failure);
    expect(file.abort).toHaveBeenCalledTimes(1);
    if (stage !== 'commit') expect(file.close).not.toHaveBeenCalled();
  });

  it('discards a writer returned after cancellation while the picker was open', async () => {
    const controller = new AbortController();
    const file = { write: vi.fn(), close: vi.fn(), abort: vi.fn().mockResolvedValue(undefined) };
    await expect(exportVideoSequence(scene(), { ...options(), signal: controller.signal, openFile: async () => {
      controller.abort(); return file;
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(file.abort).toHaveBeenCalledTimes(1);
    expect(encoder.start).not.toHaveBeenCalled();
  });

  it('does not mix audio or encode when the destination picker is canceled', async () => {
    const prepareAudio = vi.fn();
    await expect(exportVideoSequence(scene(), { ...options(), prepareAudio, openFile: async () => {
      throw new DOMException('Canceled', 'AbortError');
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(prepareAudio).not.toHaveBeenCalled();
    expect(encoder.start).not.toHaveBeenCalled();
  });

  it('does not start encoding when already canceled', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(exportVideoSequence(scene(), { ...options(), signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(encoder.start).not.toHaveBeenCalled();
  });

  it('cancels promptly while a frame is waiting for the encoder and does not finalize', async () => {
    let release!: () => void;
    encoder.add.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = new AbortController();
    const pending = exportVideoSequence(scene(), { ...options(), signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(encoder.add).toHaveBeenCalledTimes(1));
    controller.abort();
    await rejected;
    expect(encoder.cancel).toHaveBeenCalledTimes(1);
    expect(encoder.finalize).not.toHaveBeenCalled();
    release();
  });

  it('cleans up if encoder setup fails', async () => {
    encoder.start.mockRejectedValueOnce(new Error('Encoder startup failed'));
    await expect(exportVideoSequence(scene(), options())).rejects.toThrow('Encoder startup failed');
    expect(encoder.cancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the original error when cleanup also fails', async () => {
    encoder.add.mockRejectedValueOnce(new Error('Encoding failed'));
    encoder.cancel.mockRejectedValueOnce(new Error('Cleanup failed'));
    await expect(exportVideoSequence(scene(), options())).rejects.toThrow('Encoding failed');
  });

  it('observes audio errors while video frames are still being encoded', async () => {
    encoder.audioAdd.mockRejectedValueOnce(new Error('Audio encoding failed'));
    await expect(exportVideoSequence(scene(), {
      ...options(), audio: { numberOfChannels: 2, sampleRate: 48000 } as AudioBuffer,
    })).rejects.toThrow('Audio encoding failed');
    expect(encoder.cancel).toHaveBeenCalledTimes(1);
  });

  it('waits for finalization cleanup but never returns a download after cancellation', async () => {
    let release!: () => void;
    encoder.finalize.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = new AbortController();
    const pending = exportVideoSequence(scene(), { ...options(), signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(encoder.finalize).toHaveBeenCalled());
    controller.abort();
    release();
    await rejected;
  });

  it.each([{ fps: 0 }, { width: 1 }, { startFrame: 1.5 }, { endFrame: NaN }])('rejects invalid export settings: %j', async (invalid) => {
    await expect(exportVideoSequence(scene(), { ...options(), ...invalid })).rejects.toThrow();
    expect(encoder.start).not.toHaveBeenCalled();
  });
});

class TestVideo extends EventTarget {
  currentTime = 0;
  readyState = 2;
  seeking = false;
}

describe('background video seeking', () => {
  it('rejects a stalled seek instead of silently encoding the wrong frame', async () => {
    vi.useFakeTimers();
    const video = new TestVideo();
    const remove = vi.spyOn(video, 'removeEventListener');
    const pending = seekVideo(video as unknown as HTMLVideoElement, 1, 100);
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(remove).toHaveBeenCalledWith('seeked', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('error', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes listeners and timeout immediately on cancellation', async () => {
    vi.useFakeTimers();
    const video = new TestVideo();
    const controller = new AbortController();
    const pending = seekVideo(video as unknown as HTMLVideoElement, 1, 100, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for an ongoing seek even if currentTime is already at the target', async () => {
    const video = new TestVideo(); video.seeking = true;
    let finished = false;
    const pending = seekVideo(video as unknown as HTMLVideoElement, 0).then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    video.dispatchEvent(new Event('seeked'));
    await pending;
    expect(finished).toBe(true);
  });
});

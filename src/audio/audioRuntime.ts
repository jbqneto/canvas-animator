/**
 * Web Audio side of the audio clips: decoding (cached per clip), live playback, scrub snippets,
 * the export mixdown and importing files. Timing comes from `engine/audio.ts`.
 */
import type { AudioClip } from '../types';
import { t } from '../i18n';
import { clipPlayback, computePeaks, frameTime, PEAKS_PER_SECOND } from '../engine/audio';

let context: AudioContext | null = null;

function audioContext(): AudioContext {
  context ??= new AudioContext({ latencyHint: 'interactive' });
  return context;
}

/** Autoplay policies start the context suspended; call from a user gesture (play, scrub). */
export function resumeAudio() {
  const ctx = audioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
}

export interface DecodedAudio {
  buffer: AudioBuffer;
  /** Whole source summarized at PEAKS_PER_SECOND, for the waveform. */
  peaks: Float32Array;
}

// Keyed by clip id; the src is compared by identity so editing the clip (trim, volume) keeps the cache
const decoded = new Map<string, { src: string; promise: Promise<DecodedAudio> }>();

async function decodeSrc(src: string): Promise<DecodedAudio> {
  const data = await (await fetch(src)).arrayBuffer();
  const buffer = await audioContext().decodeAudioData(data);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const peaks = computePeaks(channels, Math.max(1, Math.ceil(buffer.duration * PEAKS_PER_SECOND)));
  return { buffer, peaks };
}

export function decodeClip(clip: AudioClip): Promise<DecodedAudio> {
  const cached = decoded.get(clip.id);
  if (cached && cached.src === clip.src) return cached.promise;
  const promise = decodeSrc(clip.src);
  decoded.set(clip.id, { src: clip.src, promise });
  promise.catch(() => decoded.delete(clip.id));
  return promise;
}

/** Decoded audio when it's already available (no waiting), for synchronous scheduling. */
const ready = new Map<string, { src: string; audio: DecodedAudio }>();
function readyAudio(clip: AudioClip): DecodedAudio | null {
  const entry = ready.get(clip.id);
  if (entry && entry.src === clip.src) return entry.audio;
  decodeClip(clip).then((audio) => ready.set(clip.id, { src: clip.src, audio })).catch(() => undefined);
  return null;
}

/** Starts decoding every clip ahead of time (on import/open), so playback can start instantly. */
export function prepareClips(clips: AudioClip[]) {
  clips.forEach(readyAudio);
}

/**
 * Plays every audible clip from timeline time `from` (seconds). Returns a function that stops them.
 * Clips still decoding join in when ready, at the right position.
 */
export function playClips(clips: AudioClip[], fps: number, from: number): () => void {
  const ctx = audioContext();
  resumeAudio();
  const t0 = ctx.currentTime + 0.02;
  const nodes: AudioScheduledSourceNode[] = [];
  let stopped = false;

  const schedule = (clip: AudioClip, audio: DecodedAudio) => {
    if (stopped) return;
    // A clip that finished decoding late starts where the playhead is now
    const late = Math.max(0, ctx.currentTime - t0);
    const p = clipPlayback(clip, fps, from + late);
    if (!p) return;
    const source = ctx.createBufferSource();
    source.buffer = audio.buffer;
    const gain = ctx.createGain();
    gain.gain.value = clip.volume;
    source.connect(gain).connect(ctx.destination);
    source.start(t0 + late + p.at, p.offset, p.duration);
    nodes.push(source);
  };

  clips
    .filter((c) => !c.muted && c.volume > 0)
    .forEach((clip) => {
      const audio = readyAudio(clip);
      if (audio) schedule(clip, audio);
      else decodeClip(clip).then((a) => schedule(clip, a)).catch(() => undefined);
    });

  return () => {
    stopped = true;
    nodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        // already ended
      }
    });
  };
}

let scrubNodes: AudioScheduledSourceNode[] = [];

/**
 * Plays a short snippet at `frame` (Flash-style audio scrubbing), so words and beats can be found
 * by dragging the playhead or stepping frames.
 */
export function scrubClips(clips: AudioClip[], fps: number, frame: number) {
  const ctx = audioContext();
  if (ctx.state !== 'running') return; // needs a user gesture first; never queue stale snippets
  scrubNodes.forEach((n) => {
    try {
      n.stop();
    } catch {
      // already ended
    }
  });
  scrubNodes = [];
  const from = frameTime(frame, fps);
  const length = Math.max(1 / fps, 0.08);
  const now = ctx.currentTime;
  clips
    .filter((c) => !c.muted && c.volume > 0)
    .forEach((clip) => {
      const audio = readyAudio(clip);
      const p = audio && clipPlayback(clip, fps, from, from + length);
      if (!audio || !p) return;
      const source = ctx.createBufferSource();
      source.buffer = audio.buffer;
      // Short fades avoid clicks at the snippet edges
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(clip.volume, now + 0.005);
      gain.gain.setValueAtTime(clip.volume, now + p.duration - 0.01);
      gain.gain.linearRampToValueAtTime(0, now + p.duration);
      source.connect(gain).connect(ctx.destination);
      source.start(now, p.offset, p.duration);
      scrubNodes.push(source);
    });
}

/**
 * Mixes the audible clips over the frame range [firstFrame, lastFrame] (inclusive), exactly as long
 * as the exported video. Null when nothing is audible there.
 */
export async function mixdown(
  clips: AudioClip[],
  fps: number,
  firstFrame: number,
  lastFrame: number,
  sampleRate = 48000
): Promise<AudioBuffer | null> {
  const from = frameTime(firstFrame, fps);
  const to = frameTime(lastFrame + 1, fps);
  const audible = clips.filter((c) => !c.muted && c.volume > 0 && clipPlayback(c, fps, from, to));
  if (audible.length === 0) return null;

  const offline = new OfflineAudioContext(2, Math.ceil((to - from) * sampleRate), sampleRate);
  for (const clip of audible) {
    const { buffer } = await decodeClip(clip);
    const p = clipPlayback(clip, fps, from, to)!;
    const source = offline.createBufferSource();
    source.buffer = buffer;
    const gain = offline.createGain();
    gain.gain.value = clip.volume;
    source.connect(gain).connect(offline.destination);
    source.start(p.at, p.offset, p.duration);
  }
  return offline.startRendering();
}

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error(t('import.error.read')));
    reader.readAsDataURL(blob);
  });
}

/** Above this size an audio file is re-encoded (a WAV narration would bloat the project file). */
const EMBED_AS_IS_BYTES = 8 * 1024 * 1024;

/** Audio track of a video (or a large audio file) re-encoded to Opus in WebM, or null if impossible. */
async function extractAudio(file: File): Promise<Blob | null> {
  const { Input, BlobSource, ALL_FORMATS, Output, WebMOutputFormat, BufferTarget, Conversion, QUALITY_HIGH, canEncodeAudio } =
    await import('mediabunny');
  if (!(await canEncodeAudio('opus'))) return null;
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input,
    output,
    video: { discard: true },
    audio: { codec: 'opus', quality: QUALITY_HIGH },
    showWarnings: false,
  });
  if (!conversion.isValid || conversion.utilizedTracks.length === 0) return null;
  await conversion.execute();
  return new Blob([output.target.buffer!], { type: 'audio/webm' });
}

/**
 * Reads an audio file, or the sound of a video file, into an embeddable data URL and measures it.
 * Throws a translated error when the file has no playable audio.
 */
export async function loadAudioFile(file: File): Promise<{ src: string; sourceDuration: number }> {
  const isVideo = file.type.startsWith('video/');
  let blob: Blob = file;
  if (isVideo || file.size > EMBED_AS_IS_BYTES) {
    let extracted: Blob | null = null;
    try {
      extracted = await extractAudio(file);
    } catch {
      extracted = null;
    }
    if (extracted) blob = extracted;
    else if (isVideo) throw new Error(t('audio.error.noTrack'));
  }
  const src = await readAsDataURL(blob);
  let duration: number;
  try {
    duration = (await decodeSrc(src)).buffer.duration;
  } catch {
    throw new Error(t('audio.error.format'));
  }
  if (!(duration > 0)) throw new Error(t('audio.error.noTrack'));
  return { src, sourceDuration: duration };
}

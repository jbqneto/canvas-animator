/**
 * Changing the frame rate while keeping every event at the same time in seconds (the After Effects
 * behavior): frame-based values are rescaled, so a 2 s animation stays 2 s at 24, 30 or 60 fps.
 */
import type { Animated, HistorySnapshot, FrameData } from '../types';
import type { Track } from './keyframes';

export type SceneData = Omit<HistorySnapshot, 'description'>;

/** Frame at the same time under a rate ratio `k` = newFps / oldFps (frames start at 1). */
export const retimeFrame = (frame: number, k: number) => Math.max(1, Math.round(1 + (frame - 1) * k));

/** New [start, duration] keeping both edges at the same times. */
export function retimeSpan(start: number, duration: number, k: number) {
  const s = retimeFrame(start, k);
  const e = retimeFrame(start + duration, k);
  return { startFrame: s, durationFrames: Math.max(1, e - s) };
}

/** Keys moved to their new frames; keys that land on the same frame keep the later one. */
export function retimeTrack<T>(track: Track<T> | undefined, k: number): Track<T> | undefined {
  if (!track) return track;
  const byFrame = new Map<number, Track<T>[number]>();
  track.forEach((key) => byFrame.set(retimeFrame(key.frame, k), { ...key, frame: retimeFrame(key.frame, k) }));
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}

export function retimeAnimated<T extends Animated>(obj: T, k: number): T {
  return {
    ...obj,
    ...retimeSpan(obj.startFrame, obj.durationFrames, k),
    tracks: Object.fromEntries(
      Object.entries(obj.tracks).map(([prop, track]) => [prop, retimeTrack(track as Track<unknown>, k)])
    ) as Animated['tracks'],
    follow: obj.follow && { ...obj.follow, progress: retimeTrack(obj.follow.progress, k) ?? [] },
  };
}

const retimeIntro = <T extends { animDurationFrames?: number }>(obj: T, k: number): T =>
  obj.animDurationFrames ? { ...obj, animDurationFrames: Math.max(1, Math.round(obj.animDurationFrames * k)) } : obj;

/** Frame-by-frame drawings and poses: each new frame shows the old frame at the same time. */
function resampleFrames(frames: Record<number, FrameData>, oldTotal: number, newTotal: number, k: number) {
  const out: Record<number, FrameData> = {};
  for (let f = 1; f <= newTotal; f++) {
    const src = Math.min(oldTotal, Math.max(1, Math.round(1 + (f - 1) / k)));
    const data = frames[src];
    if (data) out[f] = { ...data, frameNumber: f };
  }
  return out;
}

export const retimeTotalFrames = (total: number, k: number) => Math.max(1, Math.round(total * k));

/** Everything in the scene rescaled from `fromFps` to `toFps`, plus the new timeline length. */
export function retimeScene(scene: SceneData, totalFrames: number, fromFps: number, toFps: number) {
  const k = toFps / fromFps;
  const newTotal = retimeTotalFrames(totalFrames, k);
  const markers = new Map<number, NonNullable<SceneData['markers']>[number]>();
  (scene.markers ?? []).forEach((m) => markers.set(retimeFrame(m.frame, k), { ...m, frame: retimeFrame(m.frame, k) }));
  const retimed: SceneData = {
    ...scene,
    frames: resampleFrames(scene.frames, totalFrames, newTotal, k),
    actors: scene.actors.map((a) => retimeAnimated(a, k)),
    sticks: scene.sticks?.map((st) => ({ ...retimeAnimated(st, k), poses: retimeTrack(st.poses, k) ?? [] })),
    charts: scene.charts.map((c) => retimeIntro(retimeAnimated(c, k), k)),
    texts: scene.texts.map((x) => retimeIntro(retimeAnimated(x, k), k)),
    paths: scene.paths.map((p) => ({ ...p, ...retimeSpan(p.startFrame, p.durationFrames, k) })),
    images: scene.images.map((img) => ({ ...img, ...retimeSpan(img.startFrame, img.durationFrames, k) })),
    // Audio timing inside the clip is already in seconds; only where it starts moves
    audio: scene.audio?.map((c) => ({ ...c, startFrame: retimeFrame(c.startFrame, k) })),
    camera: scene.camera && {
      ...scene.camera,
      tracks: {
        panX: retimeTrack(scene.camera.tracks.panX, k),
        panY: retimeTrack(scene.camera.tracks.panY, k),
        zoom: retimeTrack(scene.camera.tracks.zoom, k),
        rotation: retimeTrack(scene.camera.tracks.rotation, k),
      },
    },
    markers: scene.markers && [...markers.values()].sort((a, b) => a.frame - b.frame),
  };
  return { scene: retimed, totalFrames: newTotal };
}

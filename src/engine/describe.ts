import { parallaxOf } from './camera';
import { usedEffectGroups, type EffectGroup } from './effects';
import type { ActorOverlay, AudioClip, ChartOverlay, Marker, MotionPath, SceneCamera, TextOverlay, Animated } from '../types';

export interface DescribeInput {
  name?: string;
  fps: number;
  totalFrames: number;
  canvas: { width: number; height: number };
  content: {
    texts?: TextOverlay[];
    actors?: ActorOverlay[];
    charts?: ChartOverlay[];
    paths?: MotionPath[];
    audio?: AudioClip[];
    markers?: Marker[];
    camera?: SceneCamera;
  };
}

export interface SceneItem {
  id: string;
  kind: 'text' | 'actor' | 'chart' | 'path' | 'audio';
  label: string;
  startSec: number;
  endSec: number;
  /** Effects the object turns on at some point (shadow, glow, blur, tint); absent when none. */
  effects?: EffectGroup[];
  /** Camera parallax when it is not the default 1 (0 = pinned to the screen). */
  parallax?: number;
}

export interface SceneDescription {
  name?: string;
  fps: number;
  canvas: { width: number; height: number };
  durationSec: number;
  hasCamera: boolean;
  items: SceneItem[];
  markers: { label: string; sec: number }[];
}

const fx = (o: Animated) => {
  const effects = usedEffectGroups(o);
  const parallax = parallaxOf(o);
  return { ...(effects.length ? { effects } : {}), ...(parallax !== 1 ? { parallax } : {}) };
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A compact, text-friendly summary of the timeline: who appears when. Cheaper than reading the whole .fmproj. */
export function describeScene(project: DescribeInput): SceneDescription {
  const { fps, content } = project;
  const span = (startFrame: number, durationFrames: number) => ({
    startSec: round2((startFrame - 1) / fps),
    endSec: round2((startFrame - 1 + durationFrames) / fps),
  });
  const items: SceneItem[] = [
    ...(content.texts ?? []).map((o) => ({ id: o.id, kind: 'text' as const, label: o.text.slice(0, 40), ...span(o.startFrame, o.durationFrames), ...fx(o) })),
    ...(content.actors ?? []).map((o) => ({ id: o.id, kind: 'actor' as const, label: o.name, ...span(o.startFrame, o.durationFrames), ...fx(o) })),
    ...(content.charts ?? []).map((o) => ({ id: o.id, kind: 'chart' as const, label: o.title, ...span(o.startFrame, o.durationFrames), ...fx(o) })),
    ...(content.paths ?? []).map((o) => ({ id: o.id, kind: 'path' as const, label: o.name, ...span(o.startFrame, o.durationFrames) })),
    ...(content.audio ?? []).map((o) => ({ id: o.id, kind: 'audio' as const, label: o.name, startSec: round2((o.startFrame - 1) / fps), endSec: round2((o.startFrame - 1) / fps + o.duration) })),
  ].sort((a, b) => a.startSec - b.startSec);
  return {
    name: project.name,
    fps,
    canvas: project.canvas,
    durationSec: round2(project.totalFrames / fps),
    hasCamera: !!content.camera,
    items,
    markers: (content.markers ?? []).map((m) => ({ label: m.label, sec: round2((m.frame - 1) / fps) })),
  };
}

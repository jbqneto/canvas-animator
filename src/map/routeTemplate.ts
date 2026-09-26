/**
 * "Travel route" template built from the generic pieces: a drawn MotionPath through the stops
 * (optionally bending each leg into a flight arc) and an actor that follows it, stopping at each stop.
 * The template only adds what is specific to it: the "landing" scale and the stop labels.
 */
import { createText } from '../engine/overlays';
import type { ActorFollow, MotionPath, TextOverlay } from '../types';
import type { Track, Vec2 } from '../engine/keyframes';
import { buildFollowProgress, samplePath } from '../engine/path';
import { t } from '../i18n';

export interface RouteStop {
  name: string;
  x: number;
  y: number;
}

export interface RouteTiming {
  fps: number;
  secondsPerLeg: number;
  pauseSeconds: number;
  /** Scale while landed (1 = no landing effect). */
  landedScale: number;
  /** Flight arc height as a fraction of the leg length (0 = straight legs). */
  arc: number;
}

export interface RouteTemplate {
  path: MotionPath;
  follow: ActorFollow;
  scale: Track<number>;
  /** Frame when the vehicle is at each stop (first stop = frame 1). */
  arrivals: number[];
  endFrame: number;
}

/** Points of the path: the stops, plus a bent midpoint per leg when `arc` > 0. */
export function routePoints(stops: Vec2[], arc: number): { points: Vec2[]; stopIndices: number[] } {
  const points: Vec2[] = [];
  const stopIndices: number[] = [];
  stops.forEach((stop, i) => {
    if (i > 0 && arc > 0) {
      const prev = stops[i - 1];
      const dx = stop.x - prev.x;
      const dy = stop.y - prev.y;
      const len = Math.hypot(dx, dy);
      // Normal pointing "north" (up on screen)
      let nx = -dy / (len || 1);
      let ny = dx / (len || 1);
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      points.push({ x: (prev.x + stop.x) / 2 + nx * len * arc, y: (prev.y + stop.y) / 2 + ny * len * arc });
    }
    stopIndices.push(points.length);
    points.push({ x: stop.x, y: stop.y });
  });
  return { points, stopIndices };
}

export function routeDurationFrames(stopCount: number, timing: Pick<RouteTiming, 'fps' | 'secondsPerLeg' | 'pauseSeconds'>): number {
  const leg = Math.round(timing.secondsPerLeg * timing.fps);
  const pause = Math.round(timing.pauseSeconds * timing.fps);
  return 1 + pause * stopCount + leg * Math.max(0, stopCount - 1);
}

export function buildRouteTemplate(stops: RouteStop[], timing: RouteTiming, pathId: string): RouteTemplate {
  const leg = Math.max(2, Math.round(timing.secondsPerLeg * timing.fps));
  const pause = Math.max(0, Math.round(timing.pauseSeconds * timing.fps));
  const { points, stopIndices } = routePoints(stops, timing.arc);
  const endFrame = routeDurationFrames(stops.length, timing);

  const path: MotionPath = {
    id: pathId,
    name: t('route.pathName'),
    points,
    smooth: true,
    closed: false,
    style: { visible: true, color: '#f8fafc', width: 4, stroke: 'dashed', reveal: 'follow' },
    startFrame: 1,
    durationFrames: endFrame - 1,
  };

  // Waits `pause` at the first stop, travels (stopping `pause` at each intermediate stop), waits at the end
  const anchorProgress = samplePath(path).anchorProgress;
  const departure = 1 + pause;
  const arrival = endFrame - pause;
  const progress = buildFollowProgress({
    anchorProgress,
    startFrame: departure,
    endFrame: arrival,
    easing: 'easeInOut',
    holdFrames: pause,
    stopAt: stopIndices.map((i) => anchorProgress[i]),
  });

  // Landed intervals: before departure, every hold (two keys with the same progress), after arrival
  const landed: [number, number][] = [[1, departure]];
  for (let i = 1; i < progress.length; i++) {
    if (progress[i].value === progress[i - 1].value) landed.push([progress[i - 1].frame, progress[i].frame]);
  }
  landed.push([arrival, endFrame]);

  const scale: Track<number> = [];
  landed.forEach(([from, to], i) => {
    if (i > 0) {
      // Full size in the middle of the flight that ends here
      const prevEnd = landed[i - 1][1];
      scale.push({ frame: Math.round((prevEnd + from) / 2), value: 1, easing: 'easeInOut' });
    }
    scale.push({ frame: from, value: timing.landedScale, easing: 'linear' });
    if (to > from) scale.push({ frame: to, value: timing.landedScale, easing: 'easeInOut' });
  });

  return {
    path,
    follow: { pathId, orient: true, progress },
    scale: dedupeFrames(scale),
    arrivals: landed.map(([from]) => from),
    endFrame,
  };
}

/** Keeps the last key when two keys land on the same frame (e.g. zero-length pauses). */
function dedupeFrames(track: Track<number>): Track<number> {
  const byFrame = new Map<number, Track<number>[number]>();
  track.forEach((k) => byFrame.set(k.frame, k));
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}

/** Stop names that pop in above each stop when the vehicle arrives. */
export function buildStopLabels(
  stops: RouteStop[],
  arrivals: number[],
  endFrame: number,
  canvasWidth: number,
  idPrefix: string
): TextOverlay[] {
  const fontSize = Math.round(canvasWidth / 48);
  return stops.map((stop, i) =>
    createText(
      {
        id: `${idPrefix}-label-${i}`,
        text: stop.name,
        fontSize,
        color: '#ffffff',
        effect: 'bouncePop',
        startFrame: arrivals[i],
        durationFrames: Math.max(1, endFrame - arrivals[i]),
        visible: true,
      },
      // Text is drawn left-aligned from its anchor: center it approximately over the stop
      { x: Math.round(stop.x - (stop.name.length * fontSize * 0.55) / 2), y: Math.round(stop.y - fontSize * 1.6) }
    )
  );
}

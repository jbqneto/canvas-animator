/**
 * "Plane flying through countries" template (pure): turns ordered stops into actor keyframes.
 * Each stop holds for a pause (the plane "lands": it shrinks a little) and takes off again,
 * like travel-route apps (TravelBoast, Travel Animator).
 */
import type { ActorOverlay, TextOverlay } from '../types';
import type { Track, Vec2 } from '../engine/keyframes';

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
  /** Flight arc height as a fraction of the leg length (0 = straight line). */
  arc?: number;
}

export interface RouteKeyframes {
  position: Track<Vec2>;
  scale: Track<number>;
  /** Frame when the vehicle arrives at each stop (the first stop is frame 1). */
  arrivals: number[];
  /** Last frame of the animation (end of the final pause). */
  endFrame: number;
}

export function buildRouteKeyframes(stops: RouteStop[], timing: RouteTiming): RouteKeyframes {
  const leg = Math.max(2, Math.round(timing.secondsPerLeg * timing.fps));
  const pause = Math.max(0, Math.round(timing.pauseSeconds * timing.fps));
  const position: Track<Vec2> = [];
  const scale: Track<number> = [];
  const arrivals: number[] = [];

  let frame = 1;
  const arc = timing.arc ?? 0;
  stops.forEach((stop, i) => {
    const point = { x: stop.x, y: stop.y };
    if (i > 0) {
      const mid = frame - Math.round(leg / 2);
      // Mid-flight: full size at the middle of the leg
      scale.push({ frame: mid, value: 1, easing: 'easeInOut' });
      if (arc > 0) {
        // Bend the leg like a flight arc, bulging "north" (up on screen). The departure key eases in
        // and this one eases out, so speed is continuous through the middle (both are 3× at the join).
        const prev = stops[i - 1];
        const dx = stop.x - prev.x;
        const dy = stop.y - prev.y;
        const len = Math.hypot(dx, dy);
        let nx = -dy / (len || 1);
        let ny = dx / (len || 1);
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        }
        position[position.length - 1].easing = 'easeIn';
        position.push({
          frame: mid,
          value: { x: (prev.x + stop.x) / 2 + nx * len * arc, y: (prev.y + stop.y) / 2 + ny * len * arc },
          easing: 'easeOut',
        });
      }
    }
    arrivals.push(frame);
    position.push({ frame, value: point, easing: 'linear' });
    scale.push({ frame, value: timing.landedScale, easing: 'linear' });
    if (pause > 0) {
      frame += pause;
      // Departure: same place, then ease into the next leg
      position.push({ frame, value: point, easing: 'easeInOut' });
      scale.push({ frame, value: timing.landedScale, easing: 'easeInOut' });
    } else {
      position[position.length - 1].easing = 'easeInOut';
    }
    if (i < stops.length - 1) frame += leg;
  });

  return { position, scale, arrivals, endFrame: frame };
}

/** Country name labels that pop in above each stop when the vehicle arrives. */
export function buildStopLabels(
  stops: RouteStop[],
  arrivals: number[],
  endFrame: number,
  canvasWidth: number,
  idPrefix: string
): TextOverlay[] {
  const fontSize = Math.round(canvasWidth / 48);
  return stops.map((stop, i) => ({
    id: `${idPrefix}-label-${i}`,
    text: stop.name,
    // Text is drawn left-aligned from x: center it approximately over the stop
    x: Math.round(stop.x - (stop.name.length * fontSize * 0.55) / 2),
    y: Math.round(stop.y - fontSize * 1.6),
    fontSize,
    color: '#ffffff',
    effect: 'bouncePop',
    startFrame: arrivals[i],
    durationFrames: Math.max(1, endFrame - arrivals[i]),
    visible: true,
  }));
}

export function routeTotalFrames(stops: number, timing: RouteTiming): number {
  return buildRouteKeyframes(
    Array.from({ length: stops }, () => ({ name: '', x: 0, y: 0 })),
    timing
  ).endFrame;
}

/** Applies the route to a vehicle actor: path, landing scale, orientation and trail. */
export function applyRouteToActor(actor: ActorOverlay, route: RouteKeyframes): ActorOverlay {
  return {
    ...actor,
    startFrame: 1,
    durationFrames: Math.max(1, route.endFrame - 1),
    tracks: { ...actor.tracks, position: route.position, scale: route.scale },
    smoothPath: true,
    orientToPath: true,
    trail: actor.trail ?? { enabled: true, color: '#f8fafc', width: 4, dashed: true },
  };
}

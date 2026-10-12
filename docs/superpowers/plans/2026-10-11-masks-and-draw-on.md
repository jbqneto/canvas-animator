# Masks and Draw-On Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shape actor can cut another object (mask, inside/outside), and shapes and motion paths can trace their own outline on entry (draw-on).

**Architecture:** Pure engine modules (`engine/mask.ts`, `engine/reveal.ts`) resolve the mask and the draw progress; the single renderer (`renderCompositeFrame` in `src/utils/exportVideo.ts`) applies `ctx.clip` per masked drawable and dash-offset strokes for draw-on. UI is inspector fields; MCP needs no new tool (`replace_content` carries the fields).

**Tech Stack:** TypeScript, React 19, Vitest (jsdom, `src/test/canvasStub.ts` records canvas calls), Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-10-11-masks-and-draw-on-design.md` (binding authority; written in Portuguese).

## Global Constraints

- Branch `feat/masks-and-draw-on` (from `main`). Do not touch PR #20 (`feat/camera-parallax`, unmerged): this branch has **no parallax**; the mask clips inside the global camera. If #20 merges first, rebase and make the clip use the target's per-object camera (spec "Renderer").
- Code, identifiers, comments and commit messages in English. Docs under `docs/` in Portuguese. PR title/body in English.
- Every commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Gate every commit: `npm test && npm run lint && npm run i18n:scan` must pass **before** `git commit` (chain with `&&`; read the output). Final task also `npm run build`.
- All new fields optional; absent = today's behavior; an old project renders with identical canvas calls.
- No hard-coded user-facing strings: `pt-BR.ts` and `en-US.ts` keys (`src/i18n/`).
- Out of scope: feather, luminance/image masks, several masks per object, mask of mask, pencil-stroke reveal, handwritten text.
- Mask outside its time span = no cut (target drawn whole). A `line` shape, a missing actor, a non-shape actor or self-reference is not a mask.
- `ShapeStyle.draw` needs `strokeWidth > 0` (a `line` always qualifies); otherwise ignored.

## Review Focus

- Mask references a deleted/missing/non-shape/`line`/self actor → target drawn whole, no crash (Task 1, 2).
- Mutual masks (A masks B, B masks A) → one level only, no recursion/hang (Task 1).
- Degenerate mask (scale 0, width 0, NaN transform from a corrupt file) → no NaN reaches the canvas; no throw (Task 1, 2).
- `draw.frames` invalid (0, negative, NaN, string) or `strokeWidth` 0 → shape drawn fully, no dash set (Task 1, 3).
- Mask rotated + `flipX` + scaled, and `outside` mode with a camera zoom → clip path is in scene space, same space as the target (Task 1, 2).
- Frame-rate change keeps draw durations in seconds (Task 1).
- Old project (no new fields) → identical canvas call list to before (Task 2, 3).

## File Structure

- Create `src/engine/mask.ts` — `resolveMask`, `maskPath`, `clearMaskRefs`.
- Create `src/engine/reveal.ts` — `drawProgress`, `fillAlpha`, `shapeOutlineLength`.
- Create `src/components/MaskSection.tsx` — mask selector in the motion inspector.
- Modify `src/types.ts`, `src/engine/shapes.ts` (`normalizeShape`), `src/engine/retime.ts`, `src/utils/exportVideo.ts`, `src/components/{FlashCanvas,ActorInspector,MotionInspector,PropertiesInspector,PathInspector}.tsx`, `src/App.tsx`, `src/engine/{lint,describe}.ts`, `src/i18n/{pt-BR,en-US}.ts`, `docs/ROADMAP.md`, `docs/AUTOMATION.md`, `mcp/server.ts` only if a tool description lists lint rules.
- Tests: `src/engine/__tests__/{mask,reveal,retime,shapes,lint,describe}.test.ts`, `src/utils/__tests__/{maskRender,drawOnRender}.test.ts`, `src/components/__tests__/{MaskSection,ShapeDraw,PathReveal}.test.tsx`.

---

### Task 1: Types, mask and reveal engine, retime (standard model)

**Files:**
- Modify: `src/types.ts` (near `Animated` ~l.261, `ShapeStyle` ~l.289, `ActorOverlay` ~l.299, `MotionPath.style` ~l.336)
- Create: `src/engine/mask.ts`, `src/engine/reveal.ts`
- Modify: `src/engine/shapes.ts` (`normalizeShape`), `src/engine/retime.ts`
- Test: `src/engine/__tests__/mask.test.ts`, `reveal.test.ts`, extend `retime.test.ts`, `shapes.test.ts`

**Interfaces:**
- Produces (types): `MaskRef = { actorId: string; mode: 'inside' | 'outside' }`; `Animated.mask?: MaskRef`; `ActorOverlay.maskOnly?: boolean`; `ShapeStyle.draw?: { frames: number }`; `MotionPath.style.reveal: 'full' | 'follow' | 'draw'`; `MotionPath.style.drawFrames?: number`.
- Produces (mask.ts): `ResolvedMask = { shape: ActorOverlay; state: ActorState; mode: 'inside'|'outside' }`; `resolveMask(target: Animated & { id?: string }, actors: ActorOverlay[], frame: number, paths?: MotionPath[]): ResolvedMask | null`; `maskPath(shape: ActorOverlay, state: ActorState): Vec2[][]`; `clearMaskRefs<S extends { actors; sticks?; charts; texts }>(scene: S, actorId: string): S`.
- Produces (reveal.ts): `drawProgress(startFrame: number, frames: number | undefined, frame: number): number`; `fillAlpha(startFrame: number, frames: number | undefined, frame: number): number`; `shapeOutlineLength(style: ShapeStyle, width: number, height: number): number`; `validDrawFrames(draw: unknown): number` (0 when invalid).

- [ ] **Step 1: Types.** In `src/types.ts` add `export interface MaskRef { actorId: string; mode: 'inside' | 'outside' }`; add `mask?: MaskRef;` (doc: "Cut this object by a shape actor") to `Animated`; `draw?: { frames: number };` to `ShapeStyle` (doc: "Outline traces during the first `frames`, then the fill fades in"); `maskOnly?: boolean;` to `ActorOverlay` (doc: "Only a cut for other objects: never drawn in preview or export"); change `reveal: 'full' | 'follow'` to `'full' | 'follow' | 'draw'` and add `drawFrames?: number;` (doc: "Frames the line takes to trace itself when reveal is 'draw' (default 24)") to `MotionPath.style`. Run `npm run lint` — fix any exhaustiveness errors the wider union causes (only add cases; behavior of `'full'`/`'follow'` unchanged).

- [ ] **Step 2: Failing tests for reveal.** Create `src/engine/__tests__/reveal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { drawProgress, fillAlpha, shapeOutlineLength, validDrawFrames } from '../reveal';
import { defaultShapeStyle } from '../shapes';

describe('drawProgress', () => {
  it('goes 0 -> 1 over the frames with ease in/out', () => {
    expect(drawProgress(10, 20, 10)).toBe(0);
    expect(drawProgress(10, 20, 20)).toBeCloseTo(0.5, 5);
    expect(drawProgress(10, 20, 30)).toBe(1);
    expect(drawProgress(10, 20, 99)).toBe(1);
    expect(drawProgress(10, 20, 5)).toBe(0);
    expect(drawProgress(10, 20, 15)).toBeLessThan(0.25); // slow start
  });
  it('means "no effect" (1) for invalid frames', () => {
    for (const f of [0, -4, NaN, Infinity, undefined, '8' as unknown as number]) expect(drawProgress(1, f, 1)).toBe(1);
  });
});

describe('fillAlpha', () => {
  it('stays 0 while tracing, then fades in over half the draw time', () => {
    expect(fillAlpha(1, 20, 10)).toBe(0);
    expect(fillAlpha(1, 20, 21)).toBe(0);
    expect(fillAlpha(1, 20, 26)).toBeCloseTo(0.5, 5); // fade = round(20/2) = 10 frames
    expect(fillAlpha(1, 20, 31)).toBe(1);
  });
  it('is 1 for invalid frames and fades in at least one frame', () => {
    expect(fillAlpha(1, 0, 1)).toBe(1);
    expect(fillAlpha(1, 1, 2)).toBe(1);
  });
});

describe('validDrawFrames', () => {
  it('returns the frames or 0', () => {
    expect(validDrawFrames({ frames: 12 })).toBe(12);
    for (const bad of [undefined, null, {}, { frames: 0 }, { frames: -1 }, { frames: NaN }, { frames: '5' }]) expect(validDrawFrames(bad)).toBe(0);
  });
});

describe('shapeOutlineLength', () => {
  const rect = (radius: number) => ({ ...defaultShapeStyle('rect'), radius });
  it('measures rectangles, rounded rectangles, circles, lines and arrows', () => {
    expect(shapeOutlineLength(rect(0), 100, 50)).toBe(300);
    expect(shapeOutlineLength(rect(10), 100, 50)).toBeCloseTo(300 - 80 + 2 * Math.PI * 10, 5);
    expect(shapeOutlineLength(defaultShapeStyle('ellipse'), 100, 100)).toBeCloseTo(2 * Math.PI * 50, 2);
    expect(shapeOutlineLength(defaultShapeStyle('line'), 120, 16)).toBe(120);
    expect(shapeOutlineLength(defaultShapeStyle('arrow'), 120, 60)).toBeGreaterThan(300);
  });
  it('never returns NaN for a degenerate box', () => {
    expect(shapeOutlineLength(rect(5), 0, 0)).toBe(0);
  });
});
```

- [ ] **Step 3: Run `npx vitest run src/engine/__tests__/reveal.test.ts`** → FAIL (module missing).

- [ ] **Step 4: Implement `src/engine/reveal.ts`:**

```ts
/** Draw-on reveal: progress of the outline trace and of the fill that follows. Pure. */
import type { ShapeStyle } from '../types';
import { arrowPolygon, fittedRadius } from './shapes';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const usable = (frames: unknown): frames is number => typeof frames === 'number' && Number.isFinite(frames) && frames > 0;

/** Frames of a `ShapeStyle.draw` value, or 0 when it is missing or invalid. */
export function validDrawFrames(draw: unknown): number {
  const frames = (draw as { frames?: unknown } | null | undefined)?.frames;
  return usable(frames) ? frames : 0;
}

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** 0..1 along the outline at `frame`; 1 (no effect) when `frames` is not a positive number. */
export function drawProgress(startFrame: number, frames: number | undefined, frame: number): number {
  if (!usable(frames)) return 1;
  return easeInOut(clamp01((frame - startFrame) / frames));
}

/** 0..1 opacity of the fill: 0 while tracing, then a fade of round(frames / 2) frames (at least 1). */
export function fillAlpha(startFrame: number, frames: number | undefined, frame: number): number {
  if (!usable(frames)) return 1;
  const fade = Math.max(1, Math.round(frames / 2));
  return clamp01((frame - (startFrame + frames)) / fade);
}

/** Length of the shape's outline in pixels, at scale 1 (the dash pattern needs it). */
export function shapeOutlineLength(style: ShapeStyle, width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return style.type === 'line' && width > 0 ? width : 0;
  switch (style.type) {
    case 'line':
      return width;
    case 'ellipse': {
      const a = width / 2;
      const b = height / 2; // Ramanujan's approximation
      return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    }
    case 'arrow': {
      const pts = arrowPolygon(width, height);
      return pts.reduce((sum, p, i) => sum + Math.hypot(p.x - pts[(i + 1) % pts.length].x, p.y - pts[(i + 1) % pts.length].y), 0);
    }
    default: {
      const r = fittedRadius(style.radius, width, height);
      return 2 * (width + height) - 8 * r + 2 * Math.PI * r;
    }
  }
}
```

- [ ] **Step 5: Run reveal tests** → PASS. (If `fillAlpha(1, 20, 26)` is off, recheck the formula: `(26 - 21) / 10 = 0.5`.)

- [ ] **Step 6: Failing tests for mask.** Create `src/engine/__tests__/mask.test.ts` (build actors with `createShapeActor` from `../shapes`, `defaultShapeStyle`; actor ids `m` and `t`):

```ts
import { describe, expect, it } from 'vitest';
import { clearMaskRefs, maskPath, resolveMask } from '../mask';
import { createShapeActor, defaultShapeStyle } from '../shapes';
import { sampleActor } from '../actor';
import type { ActorOverlay, Animated } from '../../types';

const shape = (id: string, type: 'rect' | 'ellipse' | 'line' | 'arrow' = 'rect', over: Partial<ActorOverlay> = {}): ActorOverlay => ({
  ...createShapeActor({ id, name: id, style: { ...defaultShapeStyle(type), radius: 0 }, width: 100, height: 50, x: 200, y: 100, startFrame: 1, durationFrames: 30 }),
  ...over,
});
const target = (mask?: Animated['mask'], id = 't'): Animated & { id: string } => ({ ...shape(id), mask });

describe('resolveMask', () => {
  const m = shape('m');
  it('resolves an existing shape in its span', () => {
    const r = resolveMask(target({ actorId: 'm', mode: 'inside' }), [m], 5);
    expect(r?.shape.id).toBe('m');
    expect(r?.mode).toBe('inside');
  });
  it.each([
    ['no mask', undefined],
    ['missing actor', { actorId: 'zz', mode: 'inside' as const }],
    ['self reference', { actorId: 't', mode: 'inside' as const }],
    ['unknown mode', { actorId: 'm', mode: 'weird' as unknown as 'inside' }],
  ])('is null for %s', (_n, mask) => {
    expect(resolveMask(target(mask), [m, shape('t')], 5)).toBeNull();
  });
  it('is null for line shapes, image actors, and outside the mask span', () => {
    expect(resolveMask(target({ actorId: 'l', mode: 'inside' }), [shape('l', 'line')], 5)).toBeNull();
    expect(resolveMask(target({ actorId: 'i', mode: 'inside' }), [{ ...shape('i'), kind: 'image' }], 5)).toBeNull();
    expect(resolveMask(target({ actorId: 'm', mode: 'inside' }), [m], 99)).toBeNull();
  });
  it('is null when the mask transform is not finite', () => {
    const bad = shape('m', 'rect', { base: { ...m.base, x: NaN } });
    expect(resolveMask(target({ actorId: 'm', mode: 'inside' }), [bad], 5)).toBeNull();
  });
  it('does not recurse when two objects mask each other', () => {
    const a = { ...shape('a'), mask: { actorId: 'b', mode: 'inside' as const } };
    const b = { ...shape('b'), mask: { actorId: 'a', mode: 'inside' as const } };
    expect(resolveMask(a, [a, b], 5)?.shape.id).toBe('b');
    expect(resolveMask(b, [a, b], 5)?.shape.id).toBe('a');
  });
});

describe('maskPath', () => {
  it('places a rectangle at the actor position', () => {
    const m = shape('m');
    const [c] = maskPath(m, sampleActor(m, 5));
    expect(c).toHaveLength(4);
    expect(c[0]).toEqual({ x: 150, y: 75 });
    expect(c[2]).toEqual({ x: 250, y: 125 });
  });
  it('applies rotation, scale and flipX in canvas order (translate, rotate, scale)', () => {
    const m = shape('m');
    const [c] = maskPath(m, { ...sampleActor(m, 5), rotation: 90, scale: 2 });
    expect(c[0].x).toBeCloseTo(200 + 50, 5); // (-50,-25)*2 = (-100,-50) -> rotate 90 -> (50,-100)
    expect(c[0].y).toBeCloseTo(100 - 100, 5);
    const flipped = shape('f', 'arrow', { flipX: true });
    const [fc] = maskPath(flipped, sampleActor(flipped, 5));
    const [plain] = maskPath(shape('p', 'arrow'), sampleActor(shape('p', 'arrow'), 5));
    expect(fc[0].x).toBeCloseTo(400 - plain[0].x, 5);
  });
  it('uses a dense polygon for ellipses and rounded corners, never NaN', () => {
    const e = shape('e', 'ellipse');
    expect(maskPath(e, sampleActor(e, 5))[0].length).toBeGreaterThanOrEqual(48);
    const r = shape('r', 'rect', { shape: { ...defaultShapeStyle('rect'), radius: 20 } });
    const pts = maskPath(r, sampleActor(r, 5))[0];
    expect(pts.length).toBeGreaterThan(16);
    expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    const z = shape('z', 'rect', { width: 0, height: 0 });
    expect(maskPath(z, { ...sampleActor(z, 5), scale: 0 })[0].every((p) => Number.isFinite(p.x))).toBe(true);
  });
});

describe('clearMaskRefs', () => {
  it('removes only the references to the deleted actor, in every object list', () => {
    const scene = {
      actors: [target({ actorId: 'm', mode: 'inside' }, 'a1'), target({ actorId: 'other', mode: 'inside' }, 'a2')],
      sticks: [target({ actorId: 'm', mode: 'outside' }, 's1')],
      charts: [target({ actorId: 'm', mode: 'inside' }, 'c1')],
      texts: [target(undefined, 'x1')],
    } as any;
    const next = clearMaskRefs(scene, 'm');
    expect(next.actors[0].mask).toBeUndefined();
    expect('mask' in next.actors[0]).toBe(false);
    expect(next.actors[1].mask).toEqual({ actorId: 'other', mode: 'inside' });
    expect(next.sticks[0].mask).toBeUndefined();
    expect(next.charts[0].mask).toBeUndefined();
    expect(next.texts[0]).toBe(scene.texts[0]);
  });
});
```

- [ ] **Step 7: Run mask tests** → FAIL. Implement `src/engine/mask.ts`:

```ts
/** Masks: a shape actor cuts another object. Pure geometry; the renderer applies it with `ctx.clip`. */
import type { ActorOverlay, Animated, MotionPath } from '../types';
import { isActorOnScreen, sampleActor, type ActorState } from './actor';
import type { Vec2 } from './keyframes';
import { arrowPolygon, fittedRadius } from './shapes';

export interface ResolvedMask {
  shape: ActorOverlay;
  state: ActorState;
  mode: 'inside' | 'outside';
}

const ELLIPSE_POINTS = 64;
const CORNER_STEPS = 12;

/** The mask that applies to `target` at `frame`, or null (drawn whole) when it is missing or not usable. */
export function resolveMask(
  target: Animated & { id?: string },
  actors: ActorOverlay[],
  frame: number,
  paths: MotionPath[] = []
): ResolvedMask | null {
  const ref = target.mask;
  if (!ref || (ref.mode !== 'inside' && ref.mode !== 'outside') || ref.actorId === target.id) return null;
  const shape = actors.find((a) => a.id === ref.actorId);
  if (!shape || shape.kind !== 'shape' || !shape.shape || shape.shape.type === 'line') return null;
  if (!isActorOnScreen(shape, frame)) return null;
  const state = sampleActor(shape, frame, paths);
  if (![state.x, state.y, state.scale, state.rotation].every(Number.isFinite)) return null;
  return { shape, state, mode: ref.mode };
}

/** Outline of the shape in its own space (centered on the anchor), at scale 1. */
function localOutline(shape: ActorOverlay): Vec2[] {
  const w = shape.width;
  const h = shape.height;
  const style = shape.shape!;
  if (style.type === 'ellipse') {
    return Array.from({ length: ELLIPSE_POINTS }, (_, i) => {
      const a = (2 * Math.PI * i) / ELLIPSE_POINTS;
      return { x: (Math.cos(a) * w) / 2, y: (Math.sin(a) * h) / 2 };
    });
  }
  if (style.type === 'arrow') return arrowPolygon(w, h);
  const r = fittedRadius(style.radius, w, h);
  if (r <= 0) return [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }];
  // Corners clockwise from top-right: [center, first angle in degrees]
  const corners: [Vec2, number][] = [
    [{ x: w / 2 - r, y: -h / 2 + r }, -90],
    [{ x: w / 2 - r, y: h / 2 - r }, 0],
    [{ x: -w / 2 + r, y: h / 2 - r }, 90],
    [{ x: -w / 2 + r, y: -h / 2 + r }, 180],
  ];
  return corners.flatMap(([c, from]) =>
    Array.from({ length: CORNER_STEPS + 1 }, (_, i) => {
      const a = ((from + (90 * i) / CORNER_STEPS) * Math.PI) / 180;
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    })
  );
}

/** Mask contours in scene coordinates: translate, rotate, then scale/flip, like the shape is drawn. */
export function maskPath(shape: ActorOverlay, state: ActorState): Vec2[][] {
  const sx = state.scale * (shape.flipX ? -1 : 1);
  const sy = state.scale;
  const rad = (state.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    localOutline(shape).map((p) => {
      const x = p.x * sx;
      const y = p.y * sy;
      return { x: state.x + x * cos - y * sin, y: state.y + x * sin + y * cos };
    }),
  ];
}

type WithObjects = { actors: Animated[]; sticks?: Animated[]; charts: Animated[]; texts: Animated[] };

/** Drops the `mask` of every object that pointed at `actorId` (deleting a mask actor). Other objects are untouched. */
export function clearMaskRefs<S extends WithObjects>(scene: S, actorId: string): S {
  const clean = <T extends Animated>(list: T[]): T[] =>
    list.map((o) => {
      if (o.mask?.actorId !== actorId) return o;
      const { mask: _drop, ...rest } = o;
      return rest as T;
    });
  return { ...scene, actors: clean(scene.actors), sticks: scene.sticks && clean(scene.sticks), charts: clean(scene.charts), texts: clean(scene.texts) };
}
```

Note: `sticks: undefined` must not appear when the scene had none — if the spread leaves a `sticks: undefined` key, build the object conditionally. Run tests; fix the rotation expectation only if the math above is wrong (it is: `(-100,-50)` rotated 90° is `(50,-100)`, so `(250, 0)`; adjust the test's second assertion to `100 - 100`, as written).

- [ ] **Step 8: Run mask tests** → PASS.

- [ ] **Step 9: Retime and normalize (failing tests first).** In `retime.test.ts` follow the file's existing `retimeScene` fixture style and add: a shape actor with `shape.draw = { frames: 24 }` retimed 24→48 fps gets `frames: 48`, 24→12 gets 12, tiny values stay ≥ 1 (`{ frames: 1 }` at k=0.1 → 1); a path with `style.drawFrames: 24` scales the same, and a path without `drawFrames` stays without it. In `shapes.test.ts` add: `normalizeShape` keeps `draw: { frames: 12 }`, drops `draw` when `frames` is 0/negative/NaN/string, and keeps `maskOnly: true` on the actor. Run → FAIL.

- [ ] **Step 10: Implement.** `normalizeShape` in `src/engine/shapes.ts`: after building `shape`, `const frames = validDrawFrames(s.draw); ... ...(frames ? { draw: { frames } } : {})` (import `validDrawFrames` from `./reveal` — `reveal.ts` imports `shapes.ts`; to avoid a cycle, inline the check in `shapes.ts` as `typeof d?.frames === 'number' && Number.isFinite(d.frames) && d.frames > 0` and keep `validDrawFrames` in `reveal.ts` delegating to the same rule). In `retime.ts` add:

```ts
const scaleFrames = (frames: number, k: number) => Math.max(1, Math.round(frames * k));
```
and in `retimeScene`: `actors: scene.actors.map((a) => { const r = retimeAnimated(a, k); return r.shape?.draw ? { ...r, shape: { ...r.shape, draw: { frames: scaleFrames(r.shape.draw.frames, k) } } } : r; })` and `paths: scene.paths.map((p) => ({ ...p, ...retimeSpan(p.startFrame, p.durationFrames, k), style: p.style.drawFrames ? { ...p.style, drawFrames: scaleFrames(p.style.drawFrames, k) } : p.style }))`.

- [ ] **Step 11: Gate and commit.**

```bash
npm test && npm run lint && npm run i18n:scan && git add -A && git commit -m "feat: mask and draw-on types, engine and retime

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Renderer — mask clip (most capable model)

**Files:**
- Modify: `src/utils/exportVideo.ts` (`RenderOptions` ~l.58, drawables loop ~l.162-253), `src/components/FlashCanvas.tsx` (call at ~l.437)
- Test: `src/utils/__tests__/maskRender.test.ts`

**Interfaces:**
- Consumes: `resolveMask`, `maskPath`, `ResolvedMask` (Task 1).
- Produces: `RenderOptions.showMasks?: boolean`; exported `clipToMask(ctx, mask, width, height)` is **not** exported (internal). Behavior: a masked drawable runs `ctx.save(); beginPath; [rect]; contour; clip(rule); draw(); ctx.restore()`.

Read `drawWithEffects` (`src/engine/layers.ts` or `src/utils/...` — grep it) first: the effect layer is composed back onto `ctx` under whatever clip is active, so the clip also cuts shadow/glow. Verify that by reading, and say so in the report.

- [ ] **Step 1: Failing tests** in `maskRender.test.ts`, with the same scene-builder style as `cameraRender.test.ts` (use `createCanvasStub`; an actor mask `m`: `createShapeActor` rect 100×50 at (200,100); a text `t` with `mask: { actorId: 'm', mode: 'inside' }`). Cases:
  1. `inside`: calls include, in order, `save`, `beginPath`, `moveTo` (first contour point = (150,75)), 3 `lineTo`, `closePath`, `clip` with args `[]` or `['nonzero']`, then the text's `fillText`/draw, then `restore` after it.
  2. `outside`: a `rect` call (huge, e.g. width ≥ 1e5) precedes the contour and `clip` is called with `'evenodd'`.
  3. Mask under camera zoom 2 (`scene.camera`): the `scale(2,2)` call happens **before** the `clip` call (clip lives inside camera space).
  4. Mask actor with `maskOnly: true` draws nothing itself: no `fill`/`roundRect` call for its shape; with `{ showMasks: true }` it draws a stroked dashed outline (`setLineDash` called with a non-empty array, `stroke` called) and never `fill`.
  5. Mask outside its time span, missing mask actor, mutual masks: no `clip` call at all, target still drawn.
  6. Degenerate mask (`scale: 0` base) → no throw, and every numeric argument of every recorded call is finite.
  7. Old project: a scene with no `mask`/`maskOnly` produces the **same call list** as before — build it by rendering the scene twice, once with the new code path (no mask fields) and asserting there is no `clip` call and `save`/`restore` counts are balanced.
  8. Effects: a masked text with `effects.glowRadius > 0` and an injected `createLayer` stub (see `effectsRender.test.ts`) still ends with balanced save/restore and the final `drawImage` of the layer happens between `clip` and its `restore`.

- [ ] **Step 2: Run** `npx vitest run src/utils/__tests__/maskRender.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In `RenderOptions` add `/** Editor only: draw mask-only actors as dashed outlines. */ showMasks?: boolean;`. In `renderCompositeFrame`:

```ts
const BIG = 1e6;
const clipToMask = (mask: ResolvedMask) => {
  ctx.beginPath();
  if (mask.mode === 'outside') ctx.rect(-BIG, -BIG, 2 * BIG, 2 * BIG);
  maskPath(mask.shape, mask.state).forEach((contour) => {
    contour.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  });
  ctx.clip(mask.mode === 'outside' ? 'evenodd' : 'nonzero');
};
/** Wraps a drawable so it is cut by its mask; the cut is resolved once per frame. */
const masked = (target: Animated & { id?: string }, draw: () => void) => {
  const mask = target.mask ? resolveMask(target, actors, currentFrame, paths) : null;
  if (!mask) return draw;
  return () => { ctx.save(); clipToMask(mask); draw(); ctx.restore(); };
};
```
Apply `masked(actor, …)` around the actor draw closure, and in `withTransform` return `masked(obj, <existing closure>)` (it receives `obj`). In `actors.forEach`, `if (actor.maskOnly)`: skip the normal draw; when `options.showMasks`, `add(actor.id, 'actor', FRONT, () => drawMaskGhost(ctx, actor, state))` instead (ghost ignores `opacity <= 0` early return? — place the `maskOnly` branch **before** the `state.opacity <= 0` check so an invisible mask is still shown in the editor). `drawMaskGhost`: `save; strokeStyle '#e879f9'; lineWidth 2; setLineDash([6,4]); beginPath; contour moveTo/lineTo; closePath; stroke; restore` using `maskPath`. Never `fill`. In `FlashCanvas.tsx` pass `showMasks: true` in the options of the `renderCompositeFrame` call (next to `showGrid: true`). Images (`ImageOverlay`) are not `Animated`: unsupported, leave unmasked.

- [ ] **Step 4: Run** the new tests and the whole suite → PASS. Existing `cameraRender`/`effectsRender`/`textRender` tests must be untouched and green.

- [ ] **Step 5: Gate and commit** (`feat: mask clip in the renderer`).

---

### Task 3: Renderer — draw-on for shapes and paths (standard model)

**Files:**
- Modify: `src/utils/exportVideo.ts` (`drawActorBody` ~l.316, `drawShape` ~l.330, `drawMotionPath` ~l.366)
- Test: `src/utils/__tests__/drawOnRender.test.ts`

**Interfaces:**
- Consumes: `drawProgress`, `fillAlpha`, `shapeOutlineLength`, `validDrawFrames` (Task 1).
- Changes: `drawActorBody(ctx, actor, state, frame)` and `drawShape(ctx, style, w, h, reveal?: { progress: number; fill: number })` (internal functions; update the call sites in `renderCompositeFrame`).

- [ ] **Step 1: Failing tests** (`drawOnRender.test.ts`, shape actor with `strokeWidth: 4`, `shape.draw = { frames: 20 }`, `startFrame: 1`, text-free scene, `createCanvasStub`):
  1. Frame 1 (progress 0): no outline stroke and no fill (`fill` not called, or `globalAlpha` 0 when it is).
  2. Mid trace (frame 11): `setLineDash` called with `[L, L]` where `L ≈ shapeOutlineLength(...) * 1.02`, `lineDashOffset` set to `L * (1 - p)` with `p = drawProgress(1, 20, 11)`, `stroke` called, fill not drawn yet (alpha 0 / not called).
  3. After tracing, fading (frame 26 → `fillAlpha` 0.5): `globalAlpha` during `fill` equals `state.opacity * 0.5`; the dash is cleared (`setLineDash([])`) or never set because progress is 1.
  4. Frame ≥ 41: identical call list to the same shape without `draw` (compare name+args lists).
  5. `strokeWidth: 0` with `draw` set → identical to no `draw` (ignored). A `line` shape with `draw` and `strokeWidth: 6` traces: dash `[w*1.02, w*1.02]`.
  6. Invalid `draw` (`{ frames: NaN }`, `{ frames: -3 }`, `{ frames: '5' as any }`) → identical call list to no `draw`.
  7. Path: `reveal: 'draw'`, `drawFrames: 10`, 3-point straight path from (0,0) to (100,0): at `startFrame` nothing stroked; at mid, the last `lineTo` x is between 0 and 100 exclusive; at `startFrame + 10` the last point is (100,0); omitted `drawFrames` defaults to 24; `'full'` and `'follow'` unchanged (existing tests still pass).
  8. save/restore balanced in every case.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** In `drawShape` compute reveal at the call site (`drawActorBody`):

```ts
const frames = actor.shape && (actor.shape.strokeWidth > 0 || actor.shape.type === 'line') ? validDrawFrames(actor.shape.draw) : 0;
const reveal = frames ? { progress: drawProgress(actor.startFrame, frames, frame), fill: fillAlpha(actor.startFrame, frames, frame) } : undefined;
```
In `drawShape`: for `line`, if `reveal && reveal.progress < 1`: if progress ≤ 0 return; `L = w * 1.02`; `ctx.setLineDash([L, L]); ctx.lineDashOffset = L * (1 - reveal.progress)` before `stroke()`, `lineCap` 'butt' while tracing. For other shapes: fill with `ctx.globalAlpha *= reveal.fill` (restore the previous alpha afterwards; skip `fill()` when `reveal.fill <= 0`), then stroke: if `reveal && progress < 1`: skip when `progress <= 0`, else `L = shapeOutlineLength(style, w, h) * 1.02`, set the dash and offset as above; when `progress >= 1` stroke normally. Reset with `ctx.setLineDash([])` after the stroke. In `drawMotionPath`, add `else if (path.style.reveal === 'draw') points = polylineUpTo(sampler, drawProgress(path.startFrame, path.style.drawFrames ?? 24, frame));`.

- [ ] **Step 4: Run** tests + whole suite → PASS.
- [ ] **Step 5: Gate and commit** (`feat: draw-on reveal for shapes and paths`).

---

### Task 4: Reveal UI and i18n (economical model)

**Files:**
- Modify: `src/components/ActorInspector.tsx` (`ShapePanel` ~l.224), `src/components/PathInspector.tsx` (reveal select ~l.159), `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`
- Test: `src/components/__tests__/ShapeDraw.test.tsx`, `PathReveal.test.tsx` (copy the render/query style of `EffectsSection.test.tsx`)

**Interfaces:**
- Consumes: `ShapeStyle.draw`, `MotionPath.style.reveal/drawFrames` (Task 1).
- Produces i18n keys: `shape.draw` ("Draw outline (frames, 0 = off)" / "Desenhar contorno (quadros, 0 = desligado)"), `shape.draw.hint`, `path.reveal.draw` ("Draws itself" / "Desenha-se"), `path.drawFrames` ("Frames to draw" / "Quadros para desenhar"), `path.history.drawFrames`.

- [ ] **Step 1: Failing tests.** ShapeDraw: rendering `ShapePanel` content through `ActorInspector` for a shape actor with `strokeWidth: 4` shows an input `[data-shape-field="drawFrames"]`; typing `24` calls `onChange` with an actor whose `shape.draw` equals `{ frames: 24 }`; typing `0` or empty removes the `draw` key (`'draw' in shape` is false); negative/NaN input is clamped to off; the field is disabled (or hidden) when `strokeWidth` is 0 and not a line. PathReveal: the select offers `draw`; choosing it calls `onChange` with `style.reveal === 'draw'`; with `reveal: 'draw'` a number input labelled `path.drawFrames` appears (default value 24) and editing it sets `style.drawFrames`; it is absent for `full`/`follow`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** following the existing field patterns in each file (same classes, `data-shape-field`, `t(...)`). Add the keys to **both** locale files with the same key set.
- [ ] **Step 4: Run** tests, then `npm run i18n:scan` → PASS.
- [ ] **Step 5: Gate and commit** (`feat: draw-on controls for shapes and paths`).

---

### Task 5: Mask UI (standard model)

**Files:**
- Create: `src/components/MaskSection.tsx`
- Modify: `src/components/MotionInspector.tsx` (new prop `maskActors?: { id: string; name: string }[]`, section rendered next to `<ModifiersSection>` ~l.266), `src/components/ActorInspector.tsx`, `src/components/PropertiesInspector.tsx` (3 `MotionInspector` call sites, l.548/878/988), `src/App.tsx` (`handleDeleteActor` ~l.1606), `src/i18n/*`
- Test: `src/components/__tests__/MaskSection.test.tsx`, extend an `App`-level or helper test for delete cleanup (the pure `clearMaskRefs` is already tested; here test the wiring through the smallest existing App test harness, or extract the snapshot-building into a pure function and test that)

**Interfaces:**
- Consumes: `Animated.mask`, `ActorOverlay.maskOnly`, `clearMaskRefs` (Task 1), `showMasks` stage ghost (Task 2).
- Produces i18n keys: `mask.title`, `mask.none`, `mask.mode.inside`, `mask.mode.outside`, `mask.history` ("Mask" change description), `mask.use` ("Use as mask" / "Usar como máscara"), `mask.use.hint`.

- [ ] **Step 1: Failing tests (MaskSection):** with `maskActors = [{id:'m',name:'Circle'}]` the select lists "None" + Circle (never the object itself — pass `obj.id` and assert it is filtered); choosing Circle calls `onChange` with `mask: { actorId: 'm', mode: 'inside' }`; changing the mode to outside keeps the actor; choosing "None" removes the `mask` key (`'mask' in next` false); the mode select is hidden/disabled while "None"; a `mask` pointing at an id not in the list still renders that option marked missing (so the user can clear it). One `onChange` call per change (one undo step). Plus: the ActorInspector shape view shows a "Use as mask" checkbox (`data-mask-only`) that sets/clears `maskOnly` (`false` removes the key).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `MaskSection` (a `<details data-mask-section>` like `ModifiersSection`, open when `obj.mask` is set), plug it into `MotionInspector` using the new prop (default `[]`), compute `maskActors` in the callers as the actors with `maskOnly` (and `kind === 'shape'`, not `line`). In `App.tsx`, `handleDeleteActor` builds its snapshot through `clearMaskRefs({ ...history.present, actors: filtered }, actorId)` so the delete and the cleanup are **one** `pushSnapshot`. Add the i18n keys to both locales.
- [ ] **Step 4: Run** tests + `npm run i18n:scan` + whole suite → PASS.
- [ ] **Step 5: Gate and commit** (`feat: mask controls and cleanup on delete`).

---

### Task 6: Lint, describe_scene, docs (economical model)

**Files:**
- Modify: `src/engine/lint.ts`, `src/engine/describe.ts`, `docs/ROADMAP.md` (item 5 → done + contract), `docs/AUTOMATION.md` (short section, Portuguese), `mcp/server.ts` only if the `lint_scene` description enumerates rules (grep `uniform-entrance`)
- Test: extend `src/engine/__tests__/lint.test.ts`, `describe.test.ts`

**Interfaces:**
- Consumes: `resolveMask` rules (Task 1), types.
- Produces: `LintRule` gains `'mask-missing' | 'mask-span'`; `SceneItem` gains `maskOnly?: true` and `mask?: { actorId: string; mode: 'inside' | 'outside' }`.

- [ ] **Step 1: Failing tests.** lint: `mask-missing` (severity `error`, `objectId` = the masked object) for a mask pointing at a missing id, an image actor, a `line`, and the object itself; none for a valid rect/ellipse/arrow mask; `mask-span` (severity `warning`) when the mask actor's `[startFrame, startFrame + durationFrames]` does not cover the target's whole span, none when it does; objects without `mask` are unaffected (existing tests stay green). describe: an actor with `maskOnly: true` has `maskOnly: true` in its item; a text with a mask lists `mask: { actorId, mode }`; items without those fields have no such keys (use `toEqual` on an existing fixture).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** In `lintScene` iterate `timed` objects that have `mask`: look up the mask actor in `input.content.actors`; reuse the same eligibility rule as `resolveMask` (shape kind, not line, not self) — factor a tiny exported `isUsableMaskShape(actor)` in `mask.ts` and use it from both so they cannot drift. Messages in English, like the other rules, naming the mask id. In `describe.ts` add the two optional fields via a spread helper like `fx`.
- [ ] **Step 4: Docs.** ROADMAP: mark item 5 delivered with a 5-line contract (fields, behavior outside the span, `showMasks`, `draw` semantics, out of scope list). AUTOMATION: how an agent builds a mask or a draw-on with `replace_content` (JSON snippet with `maskOnly`, `mask`, `shape.draw`, `style.reveal: 'draw'`) and the two new lint rules.
- [ ] **Step 5: Gate** (`npm test && npm run lint && npm run i18n:scan && npm run build`) **and commit** (`feat: mask lint rules, describe_scene fields and docs`).

---

### Final: whole-branch review (most capable model)

Dispatch the final reviewer over `main...HEAD` with the spec path and this plan's Review Focus. One fix dispatch if needed, then `superpowers:finishing-a-development-branch` (push, PR in English with the attribution line).

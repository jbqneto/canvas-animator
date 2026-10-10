# Efeitos por objeto (sombra, glow, desfoque, tint) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a qualquer objeto animado (ator imagem/forma, texto, gráfico, boneco) sombra, glow, desfoque e tint, com os parâmetros numéricos animáveis pelo modelo de keyframes existente.

**Architecture:** Slots fixos: `Animated.effects` guarda os valores estáticos e cores, e `MotionTracks` ganha uma track numérica por parâmetro. `engine/effects.ts` (puro) amostra e valida; `engine/actor.ts` aprende que o `base` das propriedades de efeito mora em `effects`. O renderer, só para objetos com efeito ativo, desenha o objeto numa canvas fora da tela (`drawWithEffects`) e compõe de volta; sem efeito o caminho atual fica byte a byte igual.

**Tech Stack:** TypeScript, React 19, Vitest (jsdom nos testes de componente), Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-10-10-object-effects-design.md`

## Global Constraints

- Efeito desligado = gatilho 0: `shadowOpacity`, `glowRadius`, `blur`, `tintAmount`. Sem booleano `enabled`.
- Padrões: `shadowOpacity` 0, `shadowBlur` 8, `shadowX` 0, `shadowY` 4, `shadowColor` `#000000`; `glowRadius` 0, `glowStrength` 1, `glowColor` `#ffffff`; `blur` 0; `tintAmount` 0, `tintColor` `#ff0000`.
- Cores são estáticas (sem track). Só os numéricos são animáveis.
- Sem efeito ativo: mesmas chamadas de desenho de hoje (nenhuma regressão de imagem ou performance).
- `effects` ausente = `DEFAULT_EFFECTS`; projetos antigos abrem sem migração.
- Todo texto novo de UI entra em `src/i18n/pt-BR.ts` e `src/i18n/en-US.ts` com as mesmas chaves e placeholders; `npm run i18n:scan` limpo.
- Verificação: `npm test`, `npm run lint` (tsc) e `npm run i18n:scan` passando antes de cada commit de feature.
- Fora de escopo: lista de efeitos, brilho/contraste, cor animada, camada de ajuste, MCP, efeitos em imagens legadas (`scene.images`).

## Review Focus

- Objeto com efeito ativo e `opacity` < 1: a opacidade vale uma vez só (não duas), e a sombra não escurece o objeto translúcido. (Task 4)
- Efeito ativo com câmera com zoom/pan: o efeito acompanha o objeto. (Task 4)
- Fade do efeito animando o gatilho até 0 no meio do clip volta ao caminho sem efeito, sem sobrar estado no contexto (`filter`, `shadow*`). (Task 4)
- Parar o cronômetro de uma propriedade de efeito mantém o valor visto no frame e escreve em `effects`, não em `base`. (Task 2)
- Mover o clip no tempo (`shiftActorTime`) ou um losango (`moveActorKeys`) leva as tracks de efeito junto. (Task 2)
- Valores absurdos num `.fmproj` editado à mão (negativos, `NaN`, strings) não viram raio negativo nem quebram o desenho. (Task 1)

---

### Task 1: Tipos e motor de efeitos

**Files:**
- Modify: `src/types.ts:216-236`
- Create: `src/engine/effects.ts`
- Test: `src/engine/__tests__/effects.test.ts`

**Interfaces:**
- Produces (types.ts): `EffectParams`, `EffectProp`; `MotionTracks` com as 8 tracks opcionais; `Animated.effects?: EffectParams`.
- Produces (effects.ts): `DEFAULT_EFFECTS: EffectParams`; `EFFECT_PROPS: Record<EffectProp, {group: EffectGroup; min: number; max: number; step: number}>`; `EFFECT_GROUPS: {id: EffectGroup; trigger: EffectProp; onValue: number}[]`; `type EffectGroup = 'shadow'|'glow'|'blur'|'tint'`; `isEffectProp(p: string): p is EffectProp`; `sampleEffects(obj: Animated, frame: number): EffectParams`; `hasActiveEffects(fx: EffectParams): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/__tests__/effects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_EFFECTS, hasActiveEffects, isEffectProp, sampleEffects } from '../effects';
import { staticMotion } from '../actor';
import type { Animated } from '../../types';

const obj = (over: Partial<Animated> = {}): Animated => ({
  startFrame: 1, durationFrames: 100, ...staticMotion(0, 0), ...over,
});

describe('effects engine', () => {
  it('defaults to everything off', () => {
    const fx = sampleEffects(obj(), 10);
    expect(fx).toEqual(DEFAULT_EFFECTS);
    expect(hasActiveEffects(fx)).toBe(false);
  });

  it('uses the static effects value when there are no keys', () => {
    const fx = sampleEffects(obj({ effects: { ...DEFAULT_EFFECTS, blur: 7, tintColor: '#00ff00' } }), 10);
    expect(fx.blur).toBe(7);
    expect(fx.tintColor).toBe('#00ff00');
  });

  it('interpolates a keyed parameter between keys', () => {
    const o = obj({
      tracks: { blur: [{ frame: 1, value: 12, easing: 'linear' }, { frame: 11, value: 0 }] },
    });
    expect(sampleEffects(o, 6).blur).toBeCloseTo(6);
    expect(sampleEffects(o, 11).blur).toBe(0);
  });

  it('clamps out-of-range values', () => {
    const fx = sampleEffects(
      obj({ effects: { ...DEFAULT_EFFECTS, shadowOpacity: 4, blur: -3, glowRadius: 9999 } }), 1);
    expect(fx.shadowOpacity).toBe(1);
    expect(fx.blur).toBe(0);
    expect(fx.glowRadius).toBe(100);
  });

  it('treats NaN and non-numbers from hand-edited files as the default', () => {
    const fx = sampleEffects(
      obj({ effects: { ...DEFAULT_EFFECTS, blur: NaN, shadowBlur: 'x' as unknown as number } }), 1);
    expect(fx.blur).toBe(0);
    expect(fx.shadowBlur).toBe(DEFAULT_EFFECTS.shadowBlur);
  });

  it('falls back to default colors when the color is not a string', () => {
    const fx = sampleEffects(obj({ effects: { ...DEFAULT_EFFECTS, glowColor: 5 as unknown as string } }), 1);
    expect(fx.glowColor).toBe('#ffffff');
  });

  it('is active when any trigger is above zero (glow needs strength too)', () => {
    expect(hasActiveEffects({ ...DEFAULT_EFFECTS, shadowOpacity: 0.5 })).toBe(true);
    expect(hasActiveEffects({ ...DEFAULT_EFFECTS, tintAmount: 0.1 })).toBe(true);
    expect(hasActiveEffects({ ...DEFAULT_EFFECTS, glowRadius: 10 })).toBe(true);
    expect(hasActiveEffects({ ...DEFAULT_EFFECTS, glowRadius: 10, glowStrength: 0 })).toBe(false);
  });

  it('recognises effect property names', () => {
    expect(isEffectProp('blur')).toBe(true);
    expect(isEffectProp('opacity')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/effects.test.ts`
Expected: FAIL (cannot resolve `../effects`).

- [ ] **Step 3: Write minimal implementation**

In `src/types.ts`, replace the `MotionTracks` interface and add the effect types above it:

```ts
/** Numeric (animatable) effect parameters; the colors are static. See `engine/effects.ts`. */
export type EffectProp =
  | 'shadowOpacity' | 'shadowBlur' | 'shadowX' | 'shadowY'
  | 'glowRadius' | 'glowStrength'
  | 'blur'
  | 'tintAmount';

/** Static values (stopwatch off) of the per-object effects, plus their colors. Trigger 0 = effect off. */
export interface EffectParams extends Record<EffectProp, number> {
  shadowColor: string;
  glowColor: string;
  tintColor: string;
}

export interface MotionTracks extends Partial<Record<EffectProp, Track<number>>> {
  position?: Track<Vec2>;
  scale?: Track<number>;
  rotation?: Track<number>;
  opacity?: Track<number>;
}
```

and in `Animated` add after `follow?`:

```ts
  /** Shadow, glow, blur and tint; absent = all off. Keys for the numbers live in `tracks`. */
  effects?: EffectParams;
```

Create `src/engine/effects.ts`:

```ts
/**
 * Per-object effects (shadow, glow, blur, tint): defaults, valid ranges and sampling. Pure; drawing
 * lives in `utils/exportVideo.ts`. Each effect has a trigger that is 0 when the effect is off.
 */
import type { Animated, EffectParams, EffectProp } from '../types';
import { sampleTrack } from './keyframes';

export type EffectGroup = 'shadow' | 'glow' | 'blur' | 'tint';

export const DEFAULT_EFFECTS: EffectParams = {
  shadowOpacity: 0, shadowBlur: 8, shadowX: 0, shadowY: 4, shadowColor: '#000000',
  glowRadius: 0, glowStrength: 1, glowColor: '#ffffff',
  blur: 0,
  tintAmount: 0, tintColor: '#ff0000',
};

export const EFFECT_PROPS: Record<EffectProp, { group: EffectGroup; min: number; max: number; step: number }> = {
  shadowOpacity: { group: 'shadow', min: 0, max: 1, step: 0.05 },
  shadowBlur: { group: 'shadow', min: 0, max: 100, step: 1 },
  shadowX: { group: 'shadow', min: -200, max: 200, step: 1 },
  shadowY: { group: 'shadow', min: -200, max: 200, step: 1 },
  glowRadius: { group: 'glow', min: 0, max: 100, step: 1 },
  glowStrength: { group: 'glow', min: 0, max: 1, step: 0.05 },
  blur: { group: 'blur', min: 0, max: 100, step: 1 },
  tintAmount: { group: 'tint', min: 0, max: 1, step: 0.05 },
};

/** UI groups in display order: the trigger and the value the quick on/off button turns it to. */
export const EFFECT_GROUPS: { id: EffectGroup; trigger: EffectProp; onValue: number }[] = [
  { id: 'shadow', trigger: 'shadowOpacity', onValue: 0.6 },
  { id: 'glow', trigger: 'glowRadius', onValue: 12 },
  { id: 'blur', trigger: 'blur', onValue: 6 },
  { id: 'tint', trigger: 'tintAmount', onValue: 0.5 },
];

export function isEffectProp(prop: string): prop is EffectProp {
  return prop in EFFECT_PROPS;
}

const clampProp = (prop: EffectProp, v: number) => {
  const { min, max } = EFFECT_PROPS[prop];
  return Math.min(max, Math.max(min, v));
};

/** Effect values at `frame` (keys win over the static value), clamped to their valid ranges. */
export function sampleEffects(obj: Animated, frame: number): EffectParams {
  const stat = obj.effects ?? DEFAULT_EFFECTS;
  const out = { ...DEFAULT_EFFECTS };
  (Object.keys(EFFECT_PROPS) as EffectProp[]).forEach((prop) => {
    const fallback = typeof stat[prop] === 'number' && Number.isFinite(stat[prop]) ? stat[prop] : DEFAULT_EFFECTS[prop];
    const v = sampleTrack(obj.tracks[prop], frame, fallback);
    out[prop] = clampProp(prop, Number.isFinite(v) ? v : DEFAULT_EFFECTS[prop]);
  });
  (['shadowColor', 'glowColor', 'tintColor'] as const).forEach((key) => {
    out[key] = typeof stat[key] === 'string' ? stat[key] : DEFAULT_EFFECTS[key];
  });
  return out;
}

/** True when at least one effect would change the pixels (decides the renderer's fast path). */
export function hasActiveEffects(fx: EffectParams): boolean {
  return fx.shadowOpacity > 0 || (fx.glowRadius > 0 && fx.glowStrength > 0) || fx.blur > 0 || fx.tintAmount > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/effects.test.ts && npm run lint`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/engine/effects.ts src/engine/__tests__/effects.test.ts
git commit -m "feat: effect types and sampling engine"
```

---

### Task 2: Edição com a regra do cronômetro, shift e keys

**Files:**
- Modify: `src/engine/actor.ts` (`setActorProperty`, `actorPropertyValue`, `shiftActorTime`)
- Test: `src/engine/__tests__/effects.test.ts` (append)

**Interfaces:**
- Consumes: `isEffectProp`, `DEFAULT_EFFECTS`, `EFFECT_PROPS` (Task 1).
- Produces: `setActorProperty`/`actorPropertyValue`/`toggleAnimated` aceitam as 8 chaves de efeito (já tipadas via `ActorProperty = keyof Animated['tracks']`). O helper interno `baseOf(actor, prop)` é o único lugar que decide onde mora o `base`.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/__tests__/effects.test.ts` (add imports `actorKeyframes, actorPropertyValue, moveActorKeys, setActorProperty, shiftActorTime, toggleAnimated` from `'../actor'`):

```ts
describe('editing effects like any other property', () => {
  it('without keys edits effects, not base', () => {
    const a = setActorProperty(obj(), 'shadowOpacity', 5, 0.7);
    expect(a.effects?.shadowOpacity).toBe(0.7);
    expect(a.effects?.shadowBlur).toBe(DEFAULT_EFFECTS.shadowBlur);
    expect((a.base as unknown as Record<string, unknown>).shadowOpacity).toBeUndefined();
    expect(sampleEffects(a, 5).shadowOpacity).toBe(0.7);
  });

  it('with keys creates a key at the frame', () => {
    let a = toggleAnimated(obj(), 'blur', 1);
    a = setActorProperty(a, 'blur', 11, 12);
    expect(actorKeyframes(a)).toEqual([1, 11]);
    expect(actorPropertyValue(a, 'blur', 11)).toBe(12);
  });

  it('stopwatch off keeps the value seen at the frame, in effects', () => {
    let a = toggleAnimated(obj(), 'tintAmount', 1);
    a = setActorProperty(a, 'tintAmount', 10, 0.8);
    a = toggleAnimated(a, 'tintAmount', 10);
    expect(a.tracks.tintAmount).toEqual([]);
    expect(a.effects?.tintAmount).toBe(0.8);
  });

  it('shiftActorTime and moveActorKeys carry effect tracks', () => {
    let a = toggleAnimated(obj(), 'blur', 5);
    a = setActorProperty(a, 'blur', 15, 9);
    const shifted = shiftActorTime(a, 10);
    expect(actorKeyframes(shifted)).toEqual([15, 25]);
    const moved = moveActorKeys(a, 15, 20);
    expect(actorKeyframes(moved)).toEqual([5, 20]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/effects.test.ts`
Expected: FAIL (`effects` stays undefined; shift drops `blur` track).

- [ ] **Step 3: Write minimal implementation**

In `src/engine/actor.ts` add the import `import { DEFAULT_EFFECTS, isEffectProp } from './effects';` and a helper above `setActorProperty`:

```ts
/** Static (stopwatch off) value of a numeric property: effects live in `effects`, the rest in `base`. */
function baseOf(actor: Animated, prop: Exclude<ActorProperty, 'position'>): number {
  if (isEffectProp(prop)) return (actor.effects ?? DEFAULT_EFFECTS)[prop];
  return actor.base[prop];
}
```

In `setActorProperty`, replace the non-animated branch:

```ts
  if (!isAnimated(actor, prop)) {
    if (prop !== 'position' && isEffectProp(prop)) {
      return { ...actor, effects: { ...(actor.effects ?? DEFAULT_EFFECTS), [prop]: value as number } };
    }
    const base =
      prop === 'position'
        ? { ...actor.base, ...(value as Vec2) }
        : { ...actor.base, [prop]: value as number };
    return { ...actor, base };
  }
```

In `actorPropertyValue`, replace the last line:

```ts
  return sampleTrack(track, frame, baseOf(actor, prop as Exclude<ActorProperty, 'position'>)) as PropertyValue<P>;
```

Replace the `tracks` literal in `shiftActorTime` so every track moves:

```ts
  const tracks = Object.fromEntries(
    Object.entries(actor.tracks).map(([prop, track]) => [prop, shift(track as Track<unknown>)])
  ) as Animated['tracks'];
  return {
    ...actor,
    startFrame: actor.startFrame + delta,
    tracks,
    follow: actor.follow && { ...actor.follow, progress: shift(actor.follow.progress) ?? [] },
  };
```

(`moveActorKeys` and `actorKeyframes` already iterate all tracks.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine && npm run lint`
Expected: PASS (existing actor/retime/motionPresets tests still green), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/actor.ts src/engine/__tests__/effects.test.ts
git commit -m "feat: edit, shift and key effect properties with the stopwatch rule"
```

---

### Task 3: Persistência (round-trip e projetos antigos)

**Files:**
- Test: `src/project/__tests__/projectFile.test.ts` (append)
- Modify (only if the test fails): `src/project/projectFile.ts`

**Interfaces:**
- Consumes: `Animated.effects` (Task 1). Atores/textos/gráficos passam por `asArray(...)` e spread, então `effects` e as novas tracks devem sobreviver sem código novo; este task prova isso.

- [ ] **Step 1: Write the failing test**

Read the top of `src/project/__tests__/projectFile.test.ts` to reuse its helpers for building a project and serializing it (look for the existing round-trip test and copy its pattern), then append:

```ts
describe('object effects persistence', () => {
  it('round-trips effects and effect tracks on a text', () => {
    // Build `state` exactly as the existing round-trip test does, with one text that has:
    //   effects: { ...DEFAULT_EFFECTS, shadowOpacity: 0.6, glowColor: '#ffcc00' }
    //   tracks: { blur: [{ frame: 1, value: 12, easing: 'easeOut' }, { frame: 20, value: 0 }] }
    const text = parseProject(serializeProject(state)).content.texts[0];
    expect(text.effects?.shadowOpacity).toBe(0.6);
    expect(text.effects?.glowColor).toBe('#ffcc00');
    expect(text.tracks.blur).toHaveLength(2);
  });

  it('opens an old project without effects as all off', () => {
    // Use the existing fixture/serializer for a project whose text has no `effects`.
    const text = parseProject(oldProjectJson).content.texts[0];
    expect(text.effects).toBeUndefined();
    expect(sampleEffects(text, 1)).toEqual(DEFAULT_EFFECTS);
  });
});
```

Fill the two comments with real code using the helpers already in that file (names of the serializer and project factory are in the existing tests; do not invent new ones). Import `sampleEffects`, `DEFAULT_EFFECTS` from `../../engine/effects`.

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run src/project`
Expected: PASS if parsing already passes the fields through (likely: `texts` use `migrateText` and actors a spread). If it FAILS because `migrateText`/`migrateChart`/`normalizeShape` rebuilds the object and drops `effects`, go to Step 3.

- [ ] **Step 3: Fix only what the test shows**

If a migrate function drops fields, make it spread the original (`{ ...value, ... }`) so `effects` survives. Do not add a new version number: `effects` is optional.

- [ ] **Step 4: Run to verify**

Run: `npx vitest run src/project && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/project
git commit -m "test: effects survive save/open and old projects open with effects off"
```

---

### Task 4: Renderer (`drawWithEffects` e integração)

**Files:**
- Create: `src/utils/effectsRender.ts`
- Modify: `src/utils/exportVideo.ts` (`RenderOptions`, `withTransform`, actors loop, `drawActor`)
- Test: `src/utils/__tests__/effectsRender.test.ts`

**Interfaces:**
- Consumes: `EffectParams`, `hasActiveEffects`, `sampleEffects`.
- Produces (effectsRender.ts):
  `type Ctx = CanvasRenderingContext2D;`
  `interface EffectLayer { canvas: CanvasImageSource; ctx: Ctx }`
  `type LayerFactory = (width: number, height: number) => EffectLayer;`
  `defaultLayerFactory: LayerFactory` (canvas reaproveitada, recriada só se o tamanho mudar);
  `drawWithEffects(ctx: Ctx, width: number, height: number, fx: EffectParams, opacity: number, draw: (c: Ctx) => void, makeLayer?: LayerFactory): void`;
  `canvasFilterSupported(): boolean`.
- `RenderOptions.createLayer?: LayerFactory`.

Design (fixed, do not improvise): `draw` pinta o objeto já com translate/rotate/scale e **sem** opacidade na canvas fora da tela, que recebe a mesma matriz (`ctx.getTransform()`, câmera inclusa) e tem o tamanho do canvas de saída. A composição volta com matriz identidade. Ordem: sombra (objeto fora da tela + `shadowOffsetX` compensando, para só a sombra aparecer), glow (idem, offset 0 e `globalAlpha *= glowStrength`), objeto. Tint é aplicado na canvas fora da tela antes de compor (`source-atop`). Desfoque é `ctx.filter` durante toda a composição. A opacidade multiplica `globalAlpha` da composição. Raios em pixels de saída (não escalam com o zoom da câmera); a canvas ter o tamanho da saída faz sombras fora da cena continuarem visíveis com zoom-out.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/effectsRender.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { drawWithEffects, type EffectLayer } from '../effectsRender';
import { DEFAULT_EFFECTS } from '../../engine/effects';
import { createCanvasStub } from '../../test/canvasStub';

const setup = () => {
  const main = createCanvasStub();
  const layer = createCanvasStub();
  const layerCanvas = { tag: 'layer' } as unknown as CanvasImageSource;
  const factory = () => ({ canvas: layerCanvas, ctx: layer.ctx }) as EffectLayer;
  return { main, layer, layerCanvas, factory };
};
const names = (calls: { name: string }[]) => calls.map((c) => c.name);

describe('drawWithEffects', () => {
  it('paints the object on the off-screen layer, not on the main context', () => {
    const { main, layer, factory } = setup();
    let drewOn: unknown;
    drawWithEffects(main.ctx, 800, 450, { ...DEFAULT_EFFECTS, blur: 4 }, 1, (c) => { drewOn = c; }, factory);
    expect(drewOn).toBe(layer.ctx);
    expect(names(main.calls)).toContain('drawImage');
  });

  it('applies tint on the layer with source-atop before composing', () => {
    const { main, layer, factory } = setup();
    drawWithEffects(main.ctx, 800, 450, { ...DEFAULT_EFFECTS, tintAmount: 0.5, tintColor: '#00ff00' }, 1, () => {}, factory);
    expect(layer.calls).toContainEqual({ name: 'set:globalCompositeOperation', args: ['source-atop'] });
    expect(layer.calls).toContainEqual({ name: 'set:fillStyle', args: ['#00ff00'] });
    expect(layer.calls).toContainEqual({ name: 'set:globalAlpha', args: [0.5] });
    expect(layer.calls.findIndex((c) => c.name === 'fillRect')).toBeGreaterThan(-1);
  });

  it('draws the shadow first (object off-screen so only the shadow shows), then the object', () => {
    const { main, factory } = setup();
    drawWithEffects(
      main.ctx, 800, 450,
      { ...DEFAULT_EFFECTS, shadowOpacity: 0.6, shadowBlur: 10, shadowX: 5, shadowY: 7, shadowColor: '#112233' },
      1, () => {}, factory);
    const draws = main.calls.filter((c) => c.name === 'drawImage');
    expect(draws).toHaveLength(2);
    expect(draws[0].args.slice(1, 3)).toEqual([-800, 0]); // off-screen copy casting the shadow
    expect(draws[1].args.slice(1, 3)).toEqual([0, 0]); // the object itself
    expect(main.calls).toContainEqual({ name: 'set:shadowOffsetX', args: [805] });
    expect(main.calls).toContainEqual({ name: 'set:shadowOffsetY', args: [7] });
    expect(main.calls).toContainEqual({ name: 'set:shadowBlur', args: [10] });
    expect(main.calls).toContainEqual({ name: 'set:shadowColor', args: ['#112233'] });
  });

  it('draws glow behind the object with its strength as alpha', () => {
    const { main, factory } = setup();
    drawWithEffects(main.ctx, 800, 450,
      { ...DEFAULT_EFFECTS, glowRadius: 20, glowStrength: 0.5, glowColor: '#ffcc00' }, 1, () => {}, factory);
    expect(main.calls.filter((c) => c.name === 'drawImage')).toHaveLength(2);
    expect(main.calls).toContainEqual({ name: 'set:shadowColor', args: ['#ffcc00'] });
    expect(main.calls).toContainEqual({ name: 'set:shadowBlur', args: [20] });
    expect(main.calls).toContainEqual({ name: 'set:globalAlpha', args: [0.5] });
  });

  it('applies blur as a canvas filter and applies opacity only once, on the composition', () => {
    const { main, layer, factory } = setup();
    drawWithEffects(main.ctx, 800, 450, { ...DEFAULT_EFFECTS, blur: 6, shadowOpacity: 0.5 }, 0.4, () => {}, factory);
    expect(main.calls).toContainEqual({ name: 'set:filter', args: ['blur(6px)'] });
    expect(main.calls).toContainEqual({ name: 'set:globalAlpha', args: [0.4] });
    expect(layer.calls.some((c) => c.name === 'set:globalAlpha' && c.args[0] === 0.4)).toBe(false);
  });

  it('does not leave filter or shadow state behind', () => {
    const { main, factory } = setup();
    drawWithEffects(main.ctx, 800, 450,
      { ...DEFAULT_EFFECTS, blur: 6, shadowOpacity: 0.5, glowRadius: 5 }, 1, () => {}, factory);
    const n = (name: string) => main.calls.filter((c) => c.name === name).length;
    expect(n('save')).toBe(n('restore'));
  });

  it('gives the layer the main context transform (camera) and clears it first', () => {
    const { main, layer, factory } = setup();
    drawWithEffects(main.ctx, 800, 450, { ...DEFAULT_EFFECTS, blur: 1 }, 1, () => {}, factory);
    const i = layer.calls.findIndex((c) => c.name === 'clearRect');
    expect(i).toBeGreaterThan(-1);
    expect(names(layer.calls).slice(i)).toContain('setTransform');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/effectsRender.test.ts`
Expected: FAIL (cannot resolve `../effectsRender`).

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/effectsRender.ts`:

```ts
/**
 * Composites an object with its effects (shadow, glow, blur, tint). The object is painted on an
 * off-screen layer the size of the output, which gets the main context's current matrix (so the
 * camera is already applied), and is composed back with an identity matrix. Radii are output pixels.
 */
import type { EffectParams } from '../types';

type Ctx = CanvasRenderingContext2D;
export interface EffectLayer {
  canvas: CanvasImageSource;
  ctx: Ctx;
}
export type LayerFactory = (width: number, height: number) => EffectLayer;

let cached: { width: number; height: number; layer: EffectLayer } | null = null;

/** One reusable layer; recreated only when the output size changes. */
export const defaultLayerFactory: LayerFactory = (width, height) => {
  if (cached && cached.width === width && cached.height === height) return cached.layer;
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d') as Ctx;
  cached = { width, height, layer: { canvas, ctx } };
  return cached.layer;
};

/** `ctx.filter` is missing in some browsers (old Safari): blur is then skipped. */
export function canvasFilterSupported(): boolean {
  return typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
}

export function drawWithEffects(
  ctx: Ctx,
  width: number,
  height: number,
  fx: EffectParams,
  opacity: number,
  draw: (c: Ctx) => void,
  makeLayer: LayerFactory = defaultLayerFactory
): void {
  const layer = makeLayer(width, height);
  const l = layer.ctx;
  const matrix = ctx.getTransform();

  l.save();
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.clearRect(0, 0, width, height);
  l.setTransform(matrix);
  draw(l);
  l.restore();

  if (fx.tintAmount > 0) {
    l.save();
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-atop';
    l.globalAlpha = fx.tintAmount;
    l.fillStyle = fx.tintColor;
    l.fillRect(0, 0, width, height);
    l.restore();
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fx.blur > 0) ctx.filter = `blur(${fx.blur}px)`;
  const baseAlpha = ctx.globalAlpha * opacity;

  // A copy parked off-screen casts only its shadow into view (offset compensates the parking spot)
  const castShadow = (color: string, blur: number, dx: number, dy: number, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = baseAlpha * alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = width + dx;
    ctx.shadowOffsetY = dy;
    ctx.drawImage(layer.canvas, -width, 0);
    ctx.restore();
  };
  if (fx.shadowOpacity > 0) castShadow(fx.shadowColor, fx.shadowBlur, fx.shadowX, fx.shadowY, fx.shadowOpacity);
  if (fx.glowRadius > 0 && fx.glowStrength > 0) castShadow(fx.glowColor, fx.glowRadius, 0, 0, fx.glowStrength);

  ctx.globalAlpha = baseAlpha;
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.restore();
}
```

Test notes while implementing: the stub's `getTransform` is a recorded no-op returning `undefined`, so `l.setTransform(matrix)` is called with `undefined` in tests; that is fine. The `castShadow` shadow color alpha: the test expects `shadowOpacity` to be applied via `globalAlpha`, which the glow assertion (`globalAlpha` 0.5) also expects. If the "opacity only once" test fails because `set:globalAlpha` 0.4 is not recorded for `baseAlpha`, the stub's initial `globalAlpha` is 1, so `0.4` is recorded in `ctx.globalAlpha = baseAlpha` — keep that assignment.

Now wire `src/utils/exportVideo.ts`:

1. Imports: `import { hasActiveEffects, sampleEffects } from '../engine/effects';` and `import { drawWithEffects, type LayerFactory } from './effectsRender';`.
2. `RenderOptions`: add `createLayer?: LayerFactory;` (with a one-line doc comment: "Off-screen layer factory for objects with effects; injected in tests").
3. Replace `withTransform` and give `draw` the context:

```ts
  const withTransform = (obj: Animated, draw: (c: CanvasRenderingContext2D) => void) => {
    const state = sampleActor(obj, currentFrame, paths);
    if (!state.visible || state.opacity <= 0) return null;
    const fx = sampleEffects(obj, currentFrame);
    const place = (c: CanvasRenderingContext2D) => {
      c.translate(state.x, state.y);
      c.rotate((state.rotation * Math.PI) / 180);
      c.scale(state.scale, state.scale);
    };
    return () => {
      if (hasActiveEffects(fx)) {
        drawWithEffects(ctx, width, height, fx, state.opacity, (c) => { c.save(); place(c); draw(c); c.restore(); }, options.createLayer);
        return;
      }
      ctx.save();
      place(ctx);
      ctx.globalAlpha *= state.opacity;
      draw(ctx);
      ctx.restore();
    };
  };
```

and update the three callers to pass the context through: `(c) => drawStickFigure(c, localFigure(...))`, `(c) => drawChart(c, chart, currentFrame)`, `(c) => drawText(c, txt, currentFrame, effectRate)`.

4. Split `drawActor` into `drawActorTrail(ctx, actor, state, frame, paths)` (the trail block, unchanged) and `drawActorBody(ctx, actor, state)` (from `const img = ...` to the end, unchanged). In the actors loop:

```ts
    add(actor.id, 'actor', FRONT, () => {
      drawActorTrail(ctx, actor, state, currentFrame, paths);
      const fx = sampleEffects(actor, currentFrame);
      if (!hasActiveEffects(fx)) return drawActorBody(ctx, actor, state);
      // opacity is applied once, when composing the layer
      drawWithEffects(ctx, width, height, fx, state.opacity, (c) => drawActorBody(c, actor, { ...state, opacity: 1 }), options.createLayer);
    });
```

Remove the old `drawActor`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils && npm run lint`
Expected: PASS (existing `exportVideo`, `textRender`, `cameraRender` tests unchanged and green: they prove the no-effect path).

- [ ] **Step 5: Integration test in the renderer**

Append to `src/utils/__tests__/textRender.test.ts` (it already has the `scene`/`text` helpers):

```ts
  describe('effects', () => {
    it('without effects does not touch an off-screen layer', () => {
      const { ctx, calls } = createCanvasStub();
      let made = 0;
      renderCompositeFrame(ctx, 1280, 720, 5, scene([text()]), {
        createLayer: () => { made++; return { canvas: {} as CanvasImageSource, ctx } as never; },
      });
      expect(made).toBe(0);
      expect(calls.some((c) => c.name === 'drawImage')).toBe(false);
    });
    it('with an active effect draws the text on the layer and composes it', () => {
      const main = createCanvasStub();
      const layer = createCanvasStub();
      renderCompositeFrame(main.ctx, 1280, 720, 5,
        scene([text({ effects: { ...DEFAULT_EFFECTS, blur: 8 } })]),
        { createLayer: () => ({ canvas: {} as CanvasImageSource, ctx: layer.ctx }) });
      expect(layer.calls.some((c) => c.name === 'fillText')).toBe(true);
      expect(main.calls.some((c) => c.name === 'fillText')).toBe(false);
      expect(main.calls).toContainEqual({ name: 'set:filter', args: ['blur(8px)'] });
    });
    it('goes back to the plain path once the trigger animates to 0', () => {
      const main = createCanvasStub();
      let made = 0;
      const t = text({ tracks: { blur: [{ frame: 1, value: 8, easing: 'linear' }, { frame: 5, value: 0 }] } });
      renderCompositeFrame(main.ctx, 1280, 720, 5, scene([t]),
        { createLayer: () => { made++; return { canvas: {} as CanvasImageSource, ctx: main.ctx }; } });
      expect(made).toBe(0);
    });
  });
```

Add imports `DEFAULT_EFFECTS` from `'../../engine/effects'`. Run `npx vitest run src/utils/__tests__/textRender.test.ts`; Expected: PASS. (Note the camera case is covered by the unit test asserting the layer receives `setTransform`.)

- [ ] **Step 6: Commit**

```bash
git add src/utils
git commit -m "feat: render per-object effects through an off-screen layer"
```

---

### Task 5: UI do inspetor + i18n

**Files:**
- Create: `src/components/EffectsSection.tsx`
- Modify: `src/components/MotionInspector.tsx` (render the section; include effect tracks in `easingHere`)
- Modify: `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`
- Test: `src/components/__tests__/EffectsSection.test.tsx`

**Interfaces:**
- Consumes: `EFFECT_GROUPS`, `EFFECT_PROPS`, `sampleEffects`, `setActorProperty`, `toggleAnimated`, `isAnimated`, `actorPropertyValue`, `canvasFilterSupported`.
- Produces: `EffectsSection<T extends Animated>({ obj, currentFrame, onChange }: { obj: T; currentFrame: number; onChange: (obj: T, description: string) => void })`.

i18n keys (add to both files, same placeholders): 

| key | pt-BR | en-US |
|---|---|---|
| `fx.title` | `Efeitos` | `Effects` |
| `fx.group.shadow` | `Sombra` | `Shadow` |
| `fx.group.glow` | `Brilho (glow)` | `Glow` |
| `fx.group.blur` | `Desfoque` | `Blur` |
| `fx.group.tint` | `Tint (cor sobreposta)` | `Tint (color overlay)` |
| `fx.prop.shadowOpacity` | `Opacidade da sombra` | `Shadow opacity` |
| `fx.prop.shadowBlur` | `Suavidade` | `Softness` |
| `fx.prop.shadowX` | `Deslocamento X` | `Offset X` |
| `fx.prop.shadowY` | `Deslocamento Y` | `Offset Y` |
| `fx.prop.glowRadius` | `Raio` | `Radius` |
| `fx.prop.glowStrength` | `Intensidade` | `Strength` |
| `fx.prop.blur` | `Desfoque (px)` | `Blur (px)` |
| `fx.prop.tintAmount` | `Quantidade` | `Amount` |
| `fx.color` | `Cor` | `Color` |
| `fx.toggle` | `Ligar/desligar` | `Turn on/off` |
| `fx.history.color` | `Cor do efeito` | `Effect color` |
| `fx.blurUnsupported` | `Este navegador não suporta desfoque; ele será ignorado.` | `This browser doesn't support blur; it will be ignored.` |

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/EffectsSection.test.tsx` following the pattern of `StudioHeader.test.tsx` (jsdom pragma, `createRoot`, `I18nProvider`, `act`). Cases:

```tsx
// renders four groups; the shadow group's quick toggle sets shadowOpacity to 0.6 via onChange
it('turns an effect on with its quick button, writing to effects (stopwatch off)', () => {
  const onChange = vi.fn();
  render(<EffectsSection obj={baseObj} currentFrame={1} onChange={onChange} />);
  click('[data-fx-toggle="shadow"]');
  const [next] = onChange.mock.calls[0];
  expect(next.effects.shadowOpacity).toBe(0.6);
});
it('with the stopwatch on, editing a value creates a key at the frame', () => {
  // obj with tracks.blur = [{frame:1,value:0}]; set the blur input to 9 at frame 10
  // expect next.tracks.blur to have a key at frame 10 with value 9
});
it('changing a color edits effects only, never tracks', () => {
  // change [data-fx-color="shadowColor"] to #ff0000; expect next.effects.shadowColor and tracks unchanged
});
```

Use `data-fx-toggle="<group>"`, `data-fx-input="<prop>"`, `data-fx-stopwatch="<prop>"` and `data-fx-color="<colorKey>"` attributes in the component so tests don't depend on translated text. Fill in the helpers (`render`, `click`, `change` for a number input via the native value setter + `input` event) from the StudioHeader test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/EffectsSection.test.tsx`
Expected: FAIL (cannot resolve `../EffectsSection`).

- [ ] **Step 3: Implement the component**

`EffectsSection.tsx`: a collapsible block (`<details data-fx-section>` with `<summary>{t('fx.title')}</summary>`; open by default if any trigger is active at the frame). Per group of `EFFECT_GROUPS`: header with name, and the quick toggle button (`data-fx-toggle`) that calls `setActorProperty(obj, group.trigger, currentFrame, active ? 0 : group.onValue)`; the group rows are the props of `EFFECT_PROPS` with `group === id`, in the table order. Each row mirrors `MotionInspector`: stopwatch button (`Timer`, `data-fx-stopwatch`) calling `toggleAnimated`, label `t('fx.prop.<prop>')`, a number input (`data-fx-input`, `min/max/step` from `EFFECT_PROPS`, value from `actorPropertyValue(obj, prop, currentFrame)`) calling `setActorProperty`, and when animated the diamond key toggle. For the key diamond use the same logic as `toggleKeyHere` in `MotionInspector.tsx:94-104` (`hasKeyframeAt`/`removeKeyframe`/`setKeyframe` on `obj.tracks[prop]`), with the description strings from the existing `actor.history.*` keys. History descriptions for value edits reuse `actor.history.change`/`actor.history.key` like `MotionInspector.setValue`, with `label = t('fx.prop.<prop>')`. Colors: `<input type="color" data-fx-color="shadowColor|glowColor|tintColor">` shown in the shadow, glow and tint groups, calling `onChange({ ...obj, effects: { ...(obj.effects ?? DEFAULT_EFFECTS), [key]: value } }, t('fx.history.color'))`. In the blur group, when `!canvasFilterSupported()` show `t('fx.blurUnsupported')` as a small hint. Use `motionInputClass` from `MotionInspector` for inputs (export is already there; import it from `'./MotionInspector'` — to avoid a circular import, move nothing: `EffectsSection` imports the constant and `MotionInspector` imports the component, so define the class string locally in `EffectsSection` instead).

In `MotionInspector.tsx`: render `<EffectsSection obj={obj} currentFrame={currentFrame} onChange={onChange} />` after the "Animatable properties" block and before the easing block, and change the `easingHere` loop source from `PROPS.map((p) => track(p.id))` to `Object.values(obj.tracks) as (Track<unknown> | undefined)[]` so keys of effect tracks show their easing too (`setEasingHere` already covers every track).

- [ ] **Step 4: Run all checks**

Run: `npx vitest run && npm run lint && npm run i18n:scan`
Expected: all PASS / clean (dictionaries test enforces matching keys).

- [ ] **Step 5: Commit**

```bash
git add src/components src/i18n
git commit -m "feat: effects section in the motion inspector"
```

---

### Task 6: Verificação manual, docs e fechamento

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Run the full gates**

Run: `npm test && npm run lint && npm run i18n:scan && npm run build`
Expected: everything green.

- [ ] **Step 2: Manual check in the browser (`npm run dev`)**

Verify, and note any miss before continuing: (a) texto com sombra sobre vídeo de fundo; (b) glow numa seta; (c) entrada "desfoque 12 → 0" com a predefinição de fade/keys; (d) tint animado entre duas cores de quantidade; (e) objeto com opacidade 50% e sombra (a sombra não escurece o objeto); (f) zoom de câmera ligado e o efeito acompanha; (g) exportar MP4 curto e conferir que preview e export batem; (h) desfazer/refazer de uma edição de efeito; (i) abrir um projeto salvo antes desta mudança.

- [ ] **Step 3: Update the roadmap**

In `docs/ROADMAP.md`, mark item 1 of "Próximos passos sugeridos" as done and add under "Contratos / decisões": efeitos por objeto em `engine/effects.ts` (gatilho 0 = desligado, cores estáticas, ordem fixa sombra → glow → objeto, desfoque como `ctx.filter`, raios em pixels de saída), e a nota de que efeitos via MCP (`set_effects`/`apply_template`) é o passo seguinte natural.

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: roadmap and contracts for per-object effects"
```

---

## Self-review

- **Spec coverage:** modelo de dados (Task 1), motor e edição pela regra do cronômetro, `shiftActorTime`/`moveActorKeys`/`actorKeyframes` (Task 1-2), renderer com fast path idêntico e canvas fora da tela (Task 4), UI + i18n + aviso de `ctx.filter` (Task 5), compatibilidade/persistência (Task 3), testes e verificação manual (Tasks 1-6), nota de MCP no ROADMAP (Task 6). Histórico de desfazer vem de `onChange` (mesmo caminho das outras propriedades).
- **Desvios deliberados da spec:** (1) `effectsMargin` não existe: a canvas fora da tela tem o tamanho da saída e recebe a matriz da câmera, então não há corte a evitar; a otimização por caixa do objeto fica para depois da medição, como a spec já previa. (2) A spec dizia que `withTransform` é o único ponto de desenho; atores usam `drawActor` próprio, por isso a Task 4 integra também o loop de atores (rastro do ator fica fora do efeito). (3) Raios de desfoque/sombra são em pixels de saída e não escalam com o zoom da câmera.
- **Consistência de nomes:** `EffectProp`, `EffectParams`, `DEFAULT_EFFECTS`, `EFFECT_PROPS`, `EFFECT_GROUPS`, `sampleEffects`, `hasActiveEffects`, `drawWithEffects`, `LayerFactory`, `createLayer` usados igual em todas as tasks.

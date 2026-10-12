# F1 Motion Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add F1's editable spring motion, blur transition preset, object anchors, export motion blur, readable numerals, and optional mastered audio without changing legacy project output.

**Architecture:** New optional project fields remain absent in old `.fmproj` files, so the existing renderer and export paths retain their output until an author opts in. Pure engine/audio helpers own numerical work; React dialogs and inspectors only select values; the MCP passes the same validated export options used by the UI.

**Tech Stack:** React 19, TypeScript, Vitest, Canvas 2D, Web Audio/OfflineAudioContext, mediabunny, MCP/Zod.

**Spec:** `docs/superpowers/specs/2026-10-12-motion-framework-design.md`

## Global Constraints

- Implement F1 only; do not begin components/brand, beats/review, morph/camera, SDK, CLI, or skills.
- New `.fmproj` fields are optional and omitted defaults preserve prior rendering/export behavior.
- Frame numbers start at 1; sampling may use fractional frames only in the render/export pipeline.
- `renderCompositeFrame` remains the sole scene renderer for preview, MCP frames, contact sheets, and export.
- Engine and loudness calculations are pure and Vitest-covered; UI text uses i18n and must pass `npm run i18n:scan`.
- Before each feature commit run `npx tsc --noEmit`, targeted/full Vitest, `npm run i18n:scan`, and the applicable build check.
- Update the F1 checkboxes/spec, ROADMAP contracts, and AUTOMATION MCP table in the same feature commit.

## Review Focus

- Old files with no F1 fields must sample/render/export bit-for-bit as before; Tasks 1–6 add explicit absent-field regressions.
- Fractional sample frames must not make an object appear outside its inclusive span; Task 4 pins start/end, text effects, masks, follows, modifiers, and camera sampling.
- An anchor must move image, shape, text, chart, and stick transforms consistently while selection/hit testing matches the painted bounds; Task 3 owns this.
- Mastering must never alter audio when `audioMaster` is absent and must never exceed the requested true-peak ceiling when present; Task 6 owns both.
- Canvas implementations that lack `fontVariantNumeric` must retain a readable fallback and lint must flag old-style numeric text; Task 5 owns this.

---

### Task 1: Spring keyframe interpolation

**Files:**
- Modify: `src/engine/keyframes.ts`, `src/engine/actor.ts`, `src/engine/camera.ts`, `src/engine/retime.ts`, `src/types.ts`
- Modify: `src/components/MotionInspector.tsx`, `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`
- Test: `src/engine/__tests__/keyframes.test.ts`, `src/components/__tests__/MotionInspector.test.tsx`
- Modify: `docs/ROADMAP.md`, `docs/superpowers/specs/2026-10-12-motion-framework-design.md`

**Interfaces:**
- Produces `SpringParams`, `SPRING_PRESETS`, `springProgress`, and `applyEasing(name, t, { fps?, durationFrames?, springParams? })`.
- Extends `Keyframe<T>` with `springParams?: SpringParams`; `setKeyframeEasing` accepts optional spring data and preserves it when unrelated keys are changed.

- [ ] **Step 1: Write failing pure-engine tests** for Morph at frames 1/13/25 (24 fps, 24-frame segment), asserting exact endpoints, maximum progress no greater than 1.03, and repeatable output; add Camera samples asserting non-decreasing progress.
- [ ] **Step 2: Run** `npm test -- src/engine/__tests__/keyframes.test.ts` and confirm the failures identify missing `spring` support.
- [ ] **Step 3: Implement** `SpringParams`, frozen presets (`morph`, `fast`, `slow`, `soft`, `camera`), and closed-form step response. Convert segment progress to seconds with `durationFrames / fps`; divide each intermediate response by the response at segment end, while returning exact 0/1 at boundaries.
- [ ] **Step 4: Thread sampling context** through `locate`, `sampleTrack`, `samplePosition`, actor tracks, follow tracks, camera tracks, and retime cloning. Existing callers omit context and therefore retain prior easing values.
- [ ] **Step 5: Write failing inspector tests** that select spring on a key, choose `camera`, and assert only the current key receives `{ easing: 'spring', springParams: { w: 7.5, z: 1 } }`.
- [ ] **Step 6: Implement** the spring option and preset select in `MotionInspector`; add English and legacy Portuguese labels, propagate the selected preset to all tracks keyed at the playhead, and keep the generic easing selector unchanged for all other easings.
- [ ] **Step 7: Run** the targeted tests, `npx tsc --noEmit`, `npm run i18n:scan`, and `npm test`.
- [ ] **Step 8: Update** the spring contract and F1 checkbox, then commit `feat: add spring keyframe easing`.

### Task 2: Editable blurSwap entrance and exit

**Files:**
- Modify: `src/engine/motionPresets.ts`, `src/components/MotionInspector.tsx`, `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`
- Test: `src/engine/__tests__/motionPresets.test.ts`, `src/components/__tests__/MotionInspector.test.tsx`
- Modify: `docs/ROADMAP.md`, `docs/superpowers/specs/2026-10-12-motion-framework-design.md`

**Interfaces:**
- Extends `MotionPreset` with `'blurSwap'`; `applyEntrance/Exit(obj, 'blurSwap', { fps })` creates ordinary position-free scale, opacity, and blur keys.

- [ ] **Step 1: Write failing tests** for a 30-fps object: entrance waits 2 frames, then uses an 8-frame window with blur 12→0, scale .94→1, opacity 0→1; exit uses a 4-frame window with blur resting→9.6, scale 1→.97, opacity 1→0.
- [ ] **Step 2: Run** `npm test -- src/engine/__tests__/motionPresets.test.ts` and verify blurSwap is missing.
- [ ] **Step 3: Implement** an `fps` option on presets, clamped windows, and blurSwap’s separate delay/window calculation. Ensure it only writes `tracks.blur`, `tracks.scale`, and `tracks.opacity`, so users can edit/delete resulting keys normally.
- [ ] **Step 4: Add** the inspector menu label and pass its existing project fps into both entrance and exit calls.
- [ ] **Step 5: Run** targeted tests, typecheck, i18n scan, full tests, and update contracts/spec.
- [ ] **Step 6: Commit** `feat: add blur swap motion preset`.

### Task 3: Normalized object anchors

**Files:**
- Modify: `src/types.ts`, `src/engine/actor.ts`, `src/engine/overlays.ts`, `src/utils/exportVideo.ts`, `src/components/FlashCanvas.tsx`, `src/components/MotionInspector.tsx`
- Modify: `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`, `docs/AUTOMATION.md`, `docs/ROADMAP.md`, `docs/superpowers/specs/2026-10-12-motion-framework-design.md`
- Test: `src/engine/__tests__/actor.test.ts`, `src/utils/__tests__/exportVideo.test.ts`, `src/components/__tests__/MotionInspector.test.tsx`, `src/components/__tests__/ShapeDraw.test.tsx`

**Interfaces:**
- Adds `Animated.anchor?: { x: number; y: number }` where both values are normalized and clamped to 0..1.
- Produces `anchorOf(animated, fallback)` and shared local-to-world bounds helpers consumed by renderer and stage hit/handle geometry.

- [ ] **Step 1: Write failing tests** for an actor at (100,100) with a top-left anchor, scale .5, and rotation 0: its top-left remains fixed while the default center anchor retains the current center-fixed behavior. Add renderer pixel tests for a shape/image and hit-test/handle tests against those same bounds.
- [ ] **Step 2: Run** the targeted tests and confirm the default-only transform fails the new anchor cases.
- [ ] **Step 3: Implement** normalized anchor resolution in one shared pure helper. Change each renderer transform to translate to the object position, translate by the anchor’s local offset, rotate/scale, then translate back before drawing. Use each object’s historical center/baseline fallback so absent anchors reproduce current output.
- [ ] **Step 4: Implement** matching world bounds and handle origins in `FlashCanvas`; rotation and scale drags compute their reference point from the resolved anchor rather than the geometric center.
- [ ] **Step 5: Implement** the 3×3 MotionInspector control (top-left through bottom-right), set the normalized coordinates immutably, and use translated labels.
- [ ] **Step 6: Document** `anchor` as a `replace_content` field in AUTOMATION, including normalized coordinates and legacy defaults.
- [ ] **Step 7: Run** targeted tests, typecheck, i18n scan, full tests, update contracts/spec, and commit `feat: add object transform anchors`.

### Task 4: Sub-frame export motion blur

**Files:**
- Modify: `src/utils/exportVideo.ts`, `src/components/ExportDialog.tsx`, `src/App.tsx`, `src/automation/protocol.ts`, `src/automation/browserApi.ts`, `mcp/server.ts`, `docs/AUTOMATION.md`
- Modify: `src/engine/actor.ts`, `src/engine/camera.ts`, `src/engine/modifiers.ts`, `src/engine/captions.ts`, `src/engine/path.ts`, `src/engine/mask.ts`
- Test: `src/utils/__tests__/exportVideo.test.ts`, `src/engine/__tests__/actor.test.ts`, `src/engine/__tests__/camera.test.ts`, `src/engine/__tests__/modifiers.test.ts`, `src/engine/__tests__/captions.test.ts`, `src/automation/__tests__/protocol.test.ts`
- Modify: `docs/ROADMAP.md`, `docs/superpowers/specs/2026-10-12-motion-framework-design.md`

**Interfaces:**
- Adds `MotionBlurOptions { subframes: number; shutter: number }` to `ExportRequest`, exported render options, browser API schema, and MCP `export_video` schema.
- Adds `renderMotionBlurredFrame(canvas, frame, scene, options)` which calls only `renderCompositeFrame` for each sample.

- [ ] **Step 1: Write failing render tests**: disabled blur and a static scene produce identical RGBA buffers; a linearly moving opaque rectangle with `{ subframes: 4, shutter: 180 }` fills pixels across the expected half-frame travel while the unblurred frame does not.
- [ ] **Step 2: Run** `npm test -- src/utils/__tests__/exportVideo.test.ts` and verify the helper/options are absent.
- [ ] **Step 3: Make temporal predicates fractional-safe**: retain inclusive `startFrame <= frame <= startFrame + durationFrames`; remove integer-only lookup assumptions in frame data; ensure typewriter/counter/karaoke use fractional elapsed time deterministically; preserve masks, path following, modifiers, and sampled camera at fractional frames.
- [ ] **Step 4: Implement** the blur renderer with an offscreen sample canvas: clear each sample, call `renderCompositeFrame`, draw it into the destination with `globalAlpha = 1 / subframes`, and preserve transparent-alpha composition. Clamp subframes to 1..16 and shutter to 0..360.
- [ ] **Step 5: Integrate** it into `exportVideoSequence` only when configured; preview, contact-sheet, and MCP `render_frame` retain single-frame rendering.
- [ ] **Step 6: Add** export-dialog checkbox, subframe number input, shutter input, translated validation/help; carry the option from App to export.
- [ ] **Step 7: Add** optional `motionBlur` to the MCP/browser schemas and server tool documentation; validate ranges and preserve omitted-field behavior.
- [ ] **Step 8: Run** all listed targeted tests, typecheck, i18n scan, full suite, `npm run build`, and update contracts/spec with measured fixture export time.
- [ ] **Step 9: Commit** `feat: add export motion blur`.

### Task 5: Numeral rendering and text safety lint

**Files:**
- Modify: `src/types.ts`, `src/utils/fonts.ts`, `src/utils/exportVideo.ts`, `src/engine/lint.ts`, `src/components/PropertiesInspector.tsx`
- Modify: `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`, `docs/ROADMAP.md`, `docs/superpowers/specs/2026-10-12-motion-framework-design.md`
- Test: `src/utils/__tests__/textRender.test.ts`, `src/engine/__tests__/lint.test.ts`, `src/project/__tests__/projectFile.test.ts`

**Interfaces:**
- Adds `TextOverlay.numerals?: 'lining' | 'oldstyle' | 'default'`; `resolvedNumerals(text)` returns lining by default only for Cormorant Garamond/Fraunces.
- Extends lint output with `oldstyle-digits` and `text-overflow` warnings.

- [ ] **Step 1: Write failing renderer tests** for Cormorant numeric text defaulting to lining, explicit oldstyle overriding it, and an unsupported canvas context leaving `fontVariantNumeric` untouched without throwing.
- [ ] **Step 2: Write failing lint tests** for Cormorant `15` without lining and for a 170px monospaced date exceeding the safe width of a 1080px portrait canvas; assert ordinary in-bounds text produces neither warning.
- [ ] **Step 3: Implement** the optional field, renderer assignment guarded by `'fontVariantNumeric' in ctx`, and reset it after drawing. Persist naturally through project serialization while old files retain undefined/default behavior.
- [ ] **Step 4: Implement** the PropertiesInspector numerals control and translated options.
- [ ] **Step 5: Implement** lint width measurement with a scratch CanvasRenderingContext2D matching `fontCss`, letter spacing, text alignment, and a documented safe-area margin; emit object IDs and actionable messages.
- [ ] **Step 6: Run** targeted tests, typecheck, i18n scan, full suite, update contracts/spec, and commit `feat: add numeral controls and text safety lint`.

### Task 6: Optional R128-style audio master and ducking

**Files:**
- Create: `src/audio/loudness.ts`, `src/audio/__tests__/loudness.test.ts`
- Modify: `src/types.ts`, `src/audio/audioRuntime.ts`, `src/utils/exportVideo.ts`, `src/components/ExportDialog.tsx`, `src/App.tsx`, `src/automation/protocol.ts`, `src/automation/browserApi.ts`, `mcp/server.ts`
- Modify: `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`, `docs/AUTOMATION.md`, `docs/ROADMAP.md`, `docs/superpowers/specs/2026-10-12-motion-framework-design.md`

**Interfaces:**
- Adds `AudioMasterOptions { targetLufs: number; truePeakDb: number; duckMusicUnder?: 'narration' }` to export paths.
- Produces pure `integratedLufs(channels, sampleRate)`, `truePeakDb(channels, oversample = 4)`, `masterAudio(channels, sampleRate, options)`, and `duckMusic(music, narration, sampleRate, amountDb = 10)`.

- [ ] **Step 1: Write failing pure tests** that generate the EBU Tech 3341 1 kHz stereo signals: 20 s at −23 dBFS and −33 dBFS, the 10/60/10 s gate sequence, and the 20/20.1/20 s sequence; assert the official ±0.1 LUFS targets. Add a 4×-oversampled inter-sample peak test, a ceiling test, and a narration/music envelope test for attack/release and ~10 dB reduction.
- [ ] **Step 2: Run** `npm test -- src/audio/__tests__/loudness.test.ts` and confirm the module is absent.
- [ ] **Step 3: Implement** K-weighting as two stable biquad stages, 400 ms blocks with 75% overlap, absolute −70 LUFS gate, relative −10 LU gate, channel weighting, gain to target, 4× oversampled peak estimation, and a look-ahead limiter that enforces `truePeakDb`.
- [ ] **Step 4: Extend** `AudioClip` with optional `kind?: 'narration' | 'music' | 'sfx'` only if T16’s existing import/UI model has no equivalent; otherwise use that existing field. In mixdown, render narration and music buses separately, apply smooth attack/release duck gain to music, then master the final mix only when `audioMaster` exists.
- [ ] **Step 5: Add** export-dialog controls for target LUFS, true-peak ceiling, and narration ducking; pass omitted options unchanged. Add the MCP/browser schemas and AUTOMATION table row/options for `export_video`.
- [ ] **Step 6: Run** targeted audio/export/protocol tests, typecheck, i18n scan, full suite, `npm run build`, then manually export the supplied short fixture. Measure with `ffmpeg -af ebur128=peak=true`, record integrated LUFS, true peak, and export duration in ROADMAP.
- [ ] **Step 7: Mark** F1 complete only after fixture validation, update contracts/spec, and commit `feat: add export loudness mastering and ducking`.

## Final Verification

- [ ] Open `/home/jbqneto/Documentos/projetos/youtube/projects/mirabilia/productions/episodio-02-st-acutis/shorts/_aux/fm-short-b/short-b.fmproj`; compare a contact sheet to a pre-F1 no-option export.
- [ ] Set anchors on `B7 • check1/check2`, apply pop, and verify the checks stay inside their boxes.
- [ ] Export 4 subframes/180°; compare static text and moving edges in a contact sheet and record elapsed time.
- [ ] Export with −16 LUFS/−1.5 dBTP master; measure using `ffmpeg -af ebur128=peak=true` and record values.
- [ ] Make lint emit both new warnings with controlled fixture texts.
- [ ] Run `npx tsc --noEmit`, `npm test`, `npm run i18n:scan`, `npm run build`, and `npm run mcp:check`.

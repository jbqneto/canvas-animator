import { describe, expect, it } from 'vitest';
import { parseProject, ProjectFileError, ProjectState, serializeProject, projectNameFromFile } from '../projectFile';
import { createActor } from '../../engine/actor';
import { createShapeActor, defaultShapeStyle } from '../../engine/shapes';
import { createText } from '../../engine/overlays';
import { createStickActor, togglePoseKey } from '../../engine/stickActor';
import type { Keyframe } from '../../engine/keyframes';
import { DEFAULT_EFFECTS, sampleEffects } from '../../engine/effects';
import { applyPoseToStickFigure, createDefaultStickFigure } from '../../utils/stickFigurePresets';

const state = (): ProjectState => ({
  name: 'Viagem',
  fps: 30,
  totalFrames: 90,
  canvas: { width: 1920, height: 1080, preset: 'youtube-1080p' },
  videoBg: { type: 'upload', url: 'blob:abc', color: '#111111', opacity: 0.8, playbackRate: 1 },
  content: {
    frames: { 1: { frameNumber: 1, stickFigures: [], drawings: [], groups: [] } },
    charts: [],
    texts: [],
    images: [],
    actors: [
      createActor({ id: 'a1', name: 'avião', src: 'data:image/png;base64,AA', width: 10, height: 5, x: 1, y: 2, startFrame: 1, durationFrames: 89 }),
    ],
    paths: [],
    layers: [{ id: 'l1', name: 'avião', type: 'actor', visible: true, locked: false, color: '#f00', targetId: 'a1' }],
  },
});

describe('project file', () => {
  it('round-trips the project content and settings', () => {
    const parsed = parseProject(serializeProject(state(), 'aula.mp4'));
    expect(parsed.name).toBe('Viagem');
    expect(parsed.fps).toBe(30);
    expect(parsed.canvas).toEqual({ width: 1920, height: 1080, preset: 'youtube-1080p' });
    expect(parsed.content.actors[0].src).toBe('data:image/png;base64,AA');
    expect(parsed.content.layers).toHaveLength(1);
    expect(parsed.content.frames[1].frameNumber).toBe(1);
  });

  it('preserves normalized pivots from replaceable project content and clamps invalid ranges', () => {
    const raw = JSON.stringify({
      format: 'flashmotion-project', version: 1,
      project: { content: {
        actors: [{ ...state().content.actors[0], anchor: { x: 0.95, y: 0.7 } }],
        charts: [{ id: 'c', base: { x: 0, y: 0 }, anchor: { x: 2, y: -1 } }],
      } },
    });
    const parsed = parseProject(raw);
    expect(parsed.content.actors[0].anchor).toEqual({ x: 0.95, y: 0.7 });
    expect(parsed.content.charts[0].anchor).toEqual({ x: 1, y: 0 });
  });

  it('round-trips explicit numeral style while old text stays omitted', () => {
    const base = state();
    base.content.texts = [createText({ id: 'n', text: '15', fontSize: 48, color: '#fff', effect: 'none', visible: true, startFrame: 1, durationFrames: 60, numerals: 'lining' }, { x: 400, y: 300 })];
    const parsed = parseProject(serializeProject(base));
    expect(parsed.content.texts[0].numerals).toBe('lining');
    const old = JSON.stringify({ format: 'flashmotion-project', version: 1, project: { content: { texts: [{ ...base.content.texts[0], numerals: undefined }] } } });
    expect(parseProject(old).content.texts[0].numerals).toBeUndefined();
  });

  it('never stores session-only video URLs and reports the missing video', () => {
    const text = serializeProject(state(), 'aula.mp4');
    expect(text).not.toContain('blob:abc');
    const parsed = parseProject(text);
    expect(parsed.videoBg.type).toBe('color');
    expect(parsed.missingVideo).toBe('aula.mp4');
  });

  it('fills fields missing in older files with defaults', () => {
    const old = JSON.stringify({ format: 'flashmotion-project', version: 1, project: { content: { frames: {} } } });
    const parsed = parseProject(old);
    expect(parsed.content.actors).toEqual([]);
    expect(parsed.content.audio).toEqual([]);
    expect(parsed.content.markers).toEqual([]);
    expect(parsed.fps).toBe(24);
    expect(parsed.totalFrames).toBe(60);
  });

  it('keeps embedded audio clips and repairs their timing', () => {
    const base = state();
    const clip = {
      id: 'v1', name: 'narração', src: 'data:audio/webm;base64,AA', sourceDuration: 12,
      startFrame: 10, offset: 2, duration: 5, volume: 0.8, muted: true,
    };
    base.content.audio = [clip];
    expect(parseProject(serializeProject(base)).content.audio).toEqual([clip]);

    const broken = JSON.stringify({
      format: 'flashmotion-project', version: 1,
      project: { content: { audio: [
        { id: 'x', src: 'data:audio/wav;base64,AA', sourceDuration: 4, offset: 9, duration: 50, volume: 7, startFrame: -3 },
        { id: 'no-data', src: 'blob:lost', sourceDuration: 4 },
      ] } },
    });
    const [repaired, ...rest] = parseProject(broken).content.audio!;
    expect(rest).toEqual([]);
    expect(repaired).toMatchObject({ startFrame: 1, offset: 4, duration: 0, volume: 2, muted: false });
  });

  it('keeps markers sorted and drops broken ones', () => {
    const base = state();
    base.content.markers = [
      { id: 'b', frame: 40, label: 'fim', color: '#fff' },
      { id: 'a', frame: 12, label: 'começo', color: '#000' },
    ];
    expect(parseProject(serializeProject(base)).content.markers!.map((m) => m.id)).toEqual(['a', 'b']);
    const broken = JSON.stringify({
      format: 'flashmotion-project', version: 1,
      project: { content: { markers: [{ frame: 'x' }, { frame: 3.6 }, null] } },
    });
    expect(parseProject(broken).content.markers).toEqual([{ id: 'marker-0', frame: 4, label: '', color: '#f59e0b' }]);
  });

  it('keeps stick actors with their pose keys', () => {
    const base = state();
    base.content.sticks = [togglePoseKey(createStickActor(createDefaultStickFigure('s1', 'Zé', 100, 200), 1, 60), 12)];
    const parsed = parseProject(serializeProject(base));
    expect(parsed.content.sticks![0].poses.map((k) => k.frame)).toEqual([12]);
    // A figure without a layer of its own gets one (older files drew it on the drawings layer)
    expect(parsed.content.layers.find((l) => l.targetId === 's1')?.type).toBe('group');
  });

  it('turns stick figures stored per frame (older files) into stick actors', () => {
    const fig = createDefaultStickFigure('s1', 'Zé', 100, 200);
    const frames = {
      1: { frameNumber: 1, stickFigures: [fig], drawings: [] },
      10: { frameNumber: 10, stickFigures: [applyPoseToStickFigure(fig, 'wave')], drawings: [{ id: 'd' }] },
    };
    const old = JSON.stringify({ format: 'flashmotion-project', version: 1, project: { content: { frames } } });
    const { content } = parseProject(old);
    expect(content.frames[10].stickFigures).toEqual([]);
    expect(content.frames[10].drawings).toHaveLength(1);
    expect(content.sticks!.map((s) => [s.id, s.startFrame, s.poses.length])).toEqual([['s1', 1, 2]]);
  });

  it('carries the saved poses and drops broken ones', () => {
    const base = state();
    const poses = [
      { id: 'p1', name: 'Salto', joints: { head: { id: 'head', x: 0, y: -90 } } },
      { id: 'p2', name: 'Sem juntas', joints: { head: { id: 'head', x: 'a', y: 0 } } },
    ] as any;
    const parsed = parseProject(serializeProject({ ...base, poses }));
    expect(parsed.poses).toEqual([{ id: 'p1', name: 'Salto', joints: { head: { id: 'head', x: 0, y: -90 } } }]);
    expect(parseProject(serializeProject(base)).poses).toEqual([]);
  });

  it('rejects files that are not projects', () => {
    expect(() => parseProject('not json')).toThrow(ProjectFileError);
    expect(() => parseProject('{"hello":1}')).toThrow(ProjectFileError);
    expect(() => parseProject(JSON.stringify({ format: 'flashmotion-project', version: 99, project: {} }))).toThrow(
      ProjectFileError
    );
  });

  it('derives the project name from the file name', () => {
    expect(projectNameFromFile('Aula 3.fmproj')).toBe('Aula 3');
  });

  it.each([
    { fps: 0 }, { fps: -24 }, { fps: 24.5 }, { fps: '30' }, { fps: 121 },
    { totalFrames: 0 }, { totalFrames: 1.5 }, { totalFrames: 1_000_001 }, { totalFrames: Number.MAX_SAFE_INTEGER + 1 },
    { canvas: { width: 1, height: 720 } }, { canvas: { width: 1920, height: 0 } },
    { canvas: { width: 9000, height: 720 } }, { canvas: { width: '1920', height: 1080 } },
  ])('rejects invalid settings without loading them into the editor: %j', (settings) => {
    const data = JSON.parse(serializeProject(state()));
    Object.assign(data.project, settings);
    expect(() => parseProject(JSON.stringify(data))).toThrow(ProjectFileError);
  });

  it.each([
    { content: [] }, { content: { actors: [null] } }, { content: { paths: 'bad' } },
    { content: { frames: [] } }, { content: { frames: { 1: { drawings: [null] } } } },
    { canvas: 'bad' },
  ])('rejects invalid content containers: %j', (fields) => {
    expect(() => parseProject(JSON.stringify({ format: 'flashmotion-project', version: 1, project: fields })))
      .toThrow(ProjectFileError);
  });

  it('uses custom for unknown or mismatched canvas presets', () => {
    const data = JSON.parse(serializeProject(state()));
    data.project.canvas.preset = 'unknown';
    expect(parseProject(JSON.stringify(data)).canvas.preset).toBe('custom');
    data.project.canvas.preset = 'youtube-720p';
    expect(parseProject(JSON.stringify(data)).canvas.preset).toBe('custom');
  });
});

describe('camera in the project file', () => {
  const state = (camera?: unknown) => ({
    name: 'T', fps: 24, totalFrames: 60,
    canvas: { width: 1280, height: 720, preset: 'custom' as const },
    videoBg: { type: 'color' as const, color: '#000', opacity: 1, playbackRate: 1 },
    content: { layers: [], frames: {}, charts: [], texts: [], images: [], actors: [], paths: [], camera } as any,
  });

  it('round-trips a camera', () => {
    const camera = { base: { panX: 0, panY: 0, zoom: 1, rotation: 0 }, tracks: { zoom: [{ frame: 1, value: 1, easing: 'linear' }, { frame: 60, value: 1.2 }] } };
    expect(parseProject(serializeProject(state(camera))).content.camera).toEqual(camera);
  });
  it('has no camera when the file has none', () => {
    expect(parseProject(serializeProject(state())).content.camera).toBeUndefined();
  });
  it('rejects a camera that is not an object', () => {
    expect(() => parseProject(serializeProject(state('zoom')))).toThrow();
  });
  it('repairs bad values and drops junk keys', () => {
    const camera = {
      base: { zoom: 0, panX: 'a' },
      tracks: { zoom: [{ frame: 9, value: 2 }, { frame: 'x', value: 1 }, { frame: 1, value: Number.NaN }, { frame: 3, value: 1.5, easing: 'bogus' }] },
    };
    const parsed = parseProject(serializeProject(state(camera))).content.camera!;
    expect(parsed.base).toEqual({ panX: 0, panY: 0, zoom: 0.05, rotation: 0 });
    expect(parsed.tracks.zoom).toEqual([{ frame: 3, value: 1.5 }, { frame: 9, value: 2 }]);
  });
});

describe('object effects persistence', () => {
  const fx = { ...DEFAULT_EFFECTS, shadowOpacity: 0.6, glowColor: '#ffcc00' };
  const blur: Keyframe<number>[] = [{ frame: 1, value: 12, easing: 'easeOut' }, { frame: 20, value: 0 }];
  const motion = { startFrame: 1, durationFrames: 30, base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, tracks: { blur } };
  const withEffects = () => {
    const base = state();
    base.content.texts = [{ id: 't1', text: 'oi', fontSize: 40, align: 'left', ...motion, effects: fx } as any];
    base.content.charts = [{ id: 'c1', width: 400, height: 200, data: [], ...motion, effects: fx } as any];
    base.content.actors = [{ ...base.content.actors[0], tracks: { blur }, effects: fx }];
    return base;
  };

  it('round-trips effects and effect tracks on a text, a chart and an actor', () => {
    const { content } = parseProject(serializeProject(withEffects()));
    [content.texts[0], content.charts[0], content.actors[0]].forEach((obj) => {
      expect(obj.effects?.shadowOpacity).toBe(0.6);
      expect(obj.effects?.glowColor).toBe('#ffcc00');
      expect(obj.tracks.blur).toHaveLength(2);
      expect(obj.tracks.blur![0]).toMatchObject({ frame: 1, value: 12, easing: 'easeOut' });
    });
  });

  it('opens an old project without effects as all off', () => {
    const base = withEffects();
    delete (base.content.texts[0] as any).effects;
    delete (base.content.texts[0].tracks as any).blur;
    const text = parseProject(serializeProject(base)).content.texts[0];
    expect(text.effects).toBeUndefined();
    expect(sampleEffects(text, 1)).toEqual(DEFAULT_EFFECTS);
  });
});

describe('loop and shake persistence', () => {
  it('round-trips modifiers on a text and an actor', () => {
    const base = state();
    const modifiers = { rotation: { loop: 'pingpong' }, position: { shake: { amount: 4, periodFrames: 6 } } };
    base.content.texts = [{ id: 't1', text: 'oi', fontSize: 40, align: 'left', startFrame: 1, durationFrames: 30, base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, tracks: {}, modifiers } as any];
    base.content.actors = [{ ...base.content.actors[0], modifiers } as any];
    const { content } = parseProject(serializeProject(base));
    expect(content.texts[0].modifiers).toEqual(modifiers);
    expect(content.actors[0].modifiers).toEqual(modifiers);
  });

  describe('masks and draw-on', () => {
    const mask = { actorId: 'm1', mode: 'outside' as const };
    it('round-trips mask, maskOnly, shape.draw, reveal draw and drawFrames', () => {
      const base = state();
      const shape = createShapeActor({ id: 'm1', name: 'M', style: { ...defaultShapeStyle('rect'), draw: { frames: 30 } }, width: 10, height: 10, x: 0, y: 0, startFrame: 1, durationFrames: 30 });
      const text = { ...createText({ id: 't1', text: 'Hi', fontSize: 40, color: '#fff', effect: 'none', visible: true, startFrame: 1, durationFrames: 30 }, { x: 5, y: 5 }), mask };
      const stick = { ...createStickActor(createDefaultStickFigure('s1', 'Zé', 100, 200), 1, 60), mask };
      base.content.actors = [{ ...shape, maskOnly: true }, { ...base.content.actors[0], mask }];
      base.content.texts = [text];
      base.content.sticks = [stick];
      base.content.paths = [{
        id: 'p1', name: 'P', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], smooth: false, closed: false,
        style: { visible: true, color: '#fff', width: 2, stroke: 'solid', reveal: 'draw', drawFrames: 18 }, startFrame: 1, durationFrames: 30,
      }];
      const parsed = parseProject(serializeProject(base));
      expect(parsed.content.actors[0].maskOnly).toBe(true);
      expect(parsed.content.actors[0].shape!.draw).toEqual({ frames: 30 });
      expect(parsed.content.actors[1].mask).toEqual(mask);
      expect(parsed.content.texts[0].mask).toEqual(mask);
      expect(parsed.content.sticks![0].mask).toEqual(mask);
      expect(parsed.content.paths[0].style.reveal).toBe('draw');
      expect(parsed.content.paths[0].style.drawFrames).toBe(18);
    });

    it('leaves a project without those fields unchanged', () => {
      const parsed = parseProject(serializeProject(state()));
      expect('mask' in parsed.content.actors[0]).toBe(false);
      expect('maskOnly' in parsed.content.actors[0]).toBe(false);
      expect(parsed.content.actors[0]).toEqual(state().content.actors[0]);
    });
  });
});

describe('camera parallax persistence', () => {
  it('round-trips parallax on a text and an actor', () => {
    const base = state();
    base.content.texts = [{ id: 't1', text: 'oi', fontSize: 40, align: 'left', startFrame: 1, durationFrames: 30, base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, tracks: {}, parallax: 0 } as any];
    base.content.actors = [{ ...base.content.actors[0], parallax: 0.5 } as any];
    const { content } = parseProject(serializeProject(base));
    expect(content.texts[0].parallax).toBe(0);
    expect(content.actors[0].parallax).toBe(0.5);
  });
});

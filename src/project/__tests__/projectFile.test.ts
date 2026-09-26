import { describe, expect, it } from 'vitest';
import { parseProject, ProjectFileError, ProjectState, serializeProject, projectNameFromFile } from '../projectFile';
import { createActor } from '../../engine/actor';

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
    expect(parsed.fps).toBe(24);
    expect(parsed.totalFrames).toBe(60);
  });

  it('rejects files that are not projects', () => {
    expect(() => parseProject('not json')).toThrow(ProjectFileError);
    expect(() => parseProject('{"hello":1}')).toThrow(ProjectFileError);
    expect(() => parseProject(JSON.stringify({ format: 'flashmotion-project', version: 99, project: {} }))).toThrow(
      /versão mais nova/
    );
  });

  it('derives the project name from the file name', () => {
    expect(projectNameFromFile('Aula 3.fmproj')).toBe('Aula 3');
  });
});

import { describe, expect, it } from 'vitest';
import { createNewProject } from '../newProject';

describe('createNewProject', () => {
  it('creates an untitled, empty 720p project with only its base layers', () => {
    const project = createNewProject();

    expect(project.name).toBe('Untitled project');
    expect(project.fps).toBe(24);
    expect(project.totalFrames).toBe(60);
    expect(project.canvas).toEqual({ width: 1280, height: 720, preset: 'youtube-720p' });
    expect(project.videoBg).toEqual({ type: 'color', url: '', color: '#0a0a0f', opacity: 1, playbackRate: 1 });
    expect(project.content).toMatchObject({
      frames: {}, charts: [], texts: [], images: [], actors: [], paths: [], sticks: [], audio: [], markers: [],
    });
    expect(project.content.layers).toEqual([
      expect.objectContaining({ id: 'layer-drawings', type: 'drawing' }),
      expect.objectContaining({ id: 'layer-video', type: 'video' }),
    ]);
  });
});

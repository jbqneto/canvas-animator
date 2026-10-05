import { describe, it, expect, vi } from 'vitest';
import { createBrowserApi, type AutomationStatus } from '../browserApi';
import { serializeProject } from '../../project/projectFile';

function setup() {
  const status: AutomationStatus = { name: 'Test', frame: 1, fps: 24, totalFrames: 60,
    playing: false, dirty: false, ready: true, exporting: false };
  const content = { frames: {}, charts: [], texts: [], images: [], actors: [], paths: [], layers: [] };
  const adapter = {
    status: () => status,
    project: () => serializeProject({ name: status.name, fps: 24, totalFrames: 60,
      canvas: { width: 1280, height: 720, preset: 'custom' },
      videoBg: { type: 'color' as const, color: '#000', opacity: 1, playbackRate: 1 }, content }),
    replaceContent: vi.fn(), seek: vi.fn(), play: vi.fn(), render: vi.fn(async () => 'data:image/png;base64,AA'),
  };
  return { status, content, adapter, api: createBrowserApi(adapter) };
}

describe('browser automation', () => {
  it('reads detached project data without changing the editor', () => {
    const { api, adapter } = setup();
    api.getProject().project.name = 'Changed';
    expect(api.getProject().project.name).toBe('Test');
    expect(adapter.replaceContent).not.toHaveBeenCalled();
  });

  it('rejects malformed content before changing the scene', () => {
    const { api, adapter } = setup();
    for (const content of [null, [], { actors: 'invalid' }, { frames: { 1: { drawings: [null] } } }]) {
      expect(() => api.replaceContent(content)).toThrow();
    }
    expect(adapter.replaceContent).not.toHaveBeenCalled();
  });

  it('blocks changes while recovery or export is pending', () => {
    const { status, content, api, adapter } = setup();
    status.ready = false;
    expect(() => api.replaceContent(content)).toThrow('RECOVERY_PENDING');
    status.ready = true;
    status.exporting = true;
    expect(() => api.replaceContent(content)).toThrow('EXPORT_IN_PROGRESS');
    expect(() => api.seek(1)).toThrow('EXPORT_IN_PROGRESS');
    expect(adapter.replaceContent).not.toHaveBeenCalled();
  });

  it('accepts validated content and rejects invalid frame numbers', async () => {
    const { api, content, adapter } = setup();
    api.replaceContent(content);
    expect(adapter.replaceContent).toHaveBeenCalledWith(expect.objectContaining(content));
    for (const frame of [0, 61, 1.5, NaN]) expect(() => api.seek(frame)).toThrow('INVALID_FRAME');
    api.seek(60);
    expect(adapter.seek).toHaveBeenCalledExactlyOnceWith(60);
    expect(await api.renderFrame(24)).toBe('data:image/png;base64,AA');
    expect(adapter.render).toHaveBeenCalledExactlyOnceWith(24);
  });

  it('requires paused playback and releases the render lock after a failure', async () => {
    const { api, status, adapter } = setup();
    status.playing = true;
    await expect(api.renderFrame(1)).rejects.toThrow('PLAYBACK_ACTIVE');
    status.playing = false;
    let rejectRender: (error: Error) => void;
    adapter.render.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRender = reject; }));
    const render = api.renderFrame(1);
    expect(() => api.seek(2)).toThrow('RENDER_IN_PROGRESS');
    rejectRender!(new Error('IMAGE_LOAD_FAILED'));
    await expect(render).rejects.toThrow('IMAGE_LOAD_FAILED');
    api.seek(2);
    expect(adapter.seek).toHaveBeenCalledExactlyOnceWith(2);
  });
});

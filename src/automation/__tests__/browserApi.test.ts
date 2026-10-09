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
    loadProject: vi.fn(),
    contactSheet: vi.fn(async () => 'data:image/png;base64,AA'),
    exportVideo: vi.fn(async () => ({ blob: new Blob([new Uint8Array([1, 2, 3])]), extension: 'mp4' })),
  };
  return { status, content, adapter, api: createBrowserApi(adapter) };
}

describe('browser automation', () => {
  it('renders a contact sheet through the adapter', async () => {
    const { api, adapter } = setup();
    await expect(api.renderContactSheet([1, 30, 60])).resolves.toMatch(/^data:image\/png/);
    expect(adapter.contactSheet).toHaveBeenCalledWith([1, 30, 60], { columns: 3, cellWidth: 480 });
  });
  it('rejects empty, oversized or out-of-range contact sheets', async () => {
    const { api, adapter } = setup();
    await expect(api.renderContactSheet([])).rejects.toThrow('INVALID_FRAMES');
    await expect(api.renderContactSheet(Array.from({ length: 25 }, (_, i) => i + 1))).rejects.toThrow('INVALID_FRAMES');
    await expect(api.renderContactSheet([1, 999])).rejects.toThrow('INVALID_FRAME');
    await expect(api.renderContactSheet([1], { columns: 9 })).rejects.toThrow('INVALID_SHEET_OPTIONS');
    expect(adapter.contactSheet).not.toHaveBeenCalled();
  });
  it('refuses to render a contact sheet while playing', async () => {
    const { status, api } = setup();
    status.playing = true;
    await expect(api.renderContactSheet([1, 2])).rejects.toThrow('PLAYBACK_ACTIVE');
  });
  it('reads detached project data without changing the editor', () => {
    const { api, adapter } = setup();
    api.getProject().project.name = 'Changed';
    expect(api.getProject().project.name).toBe('Test');
    expect(adapter.replaceContent).not.toHaveBeenCalled();
  });

  it('keeps the camera when replacing content', () => {
    const { content, api, adapter } = setup();
    const camera = { base: { panX: 0, panY: 0, zoom: 2, rotation: 0 }, tracks: {} };
    api.replaceContent({ ...content, camera });
    expect(adapter.replaceContent.mock.calls[0][0].camera?.base.zoom).toBe(2);
  });

  it('rejects malformed content before changing the scene', () => {
    const { api, adapter } = setup();
    for (const content of [null, [], { actors: 'invalid' }, { frames: { 1: { drawings: [null] } } }]) {
      expect(() => api.replaceContent(content)).toThrow();
    }
    expect(adapter.replaceContent).not.toHaveBeenCalled();
  });

  it('sets, repairs and removes the camera', () => {
    const { api, adapter } = setup();
    api.setCamera({ tracks: { zoom: [{ frame: 1, value: 1 }, { frame: 60, value: 1.2 }] } });
    expect(adapter.replaceContent.mock.calls[0][0].camera?.tracks.zoom).toHaveLength(2);
    api.setCamera({ base: { zoom: 0 } });
    expect(adapter.replaceContent.mock.calls[1][0].camera?.base.zoom).toBe(0.05);
    api.setCamera(null);
    expect(adapter.replaceContent.mock.calls[2][0].camera).toBeUndefined();
  });
  it('refuses to load a project while recovery is pending', () => {
    const { status, api, adapter } = setup();
    status.ready = false;
    expect(() => api.loadProject(adapter.project())).toThrow('RECOVERY_PENDING');
    expect(adapter.loadProject).not.toHaveBeenCalled();
  });
  it('rejects contact sheets that would be too large', async () => {
    const { api, adapter } = setup();
    const text = JSON.parse(adapter.project());
    text.project.canvas = { width: 1080, height: 1920, preset: 'custom' };
    adapter.project = () => JSON.stringify(text);
    await expect(api.renderContactSheet(Array.from({ length: 24 }, (_, i) => i + 1), { columns: 1, cellWidth: 960 })).rejects.toThrow('SHEET_TOO_LARGE');
    expect(adapter.contactSheet).not.toHaveBeenCalled();
  });
  it('blocks set_camera while recovery is pending', () => {
    const { status, api } = setup();
    status.ready = false;
    expect(() => api.setCamera(null)).toThrow('RECOVERY_PENDING');
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

describe('background export and project loading', () => {
  it('runs an export job and serves its bytes in base64 chunks', async () => {
    const { api } = setup();
    const job = api.startExport({ format: 'mp4' });
    expect(job.state).toBe('running');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.exportStatus()).toMatchObject({ state: 'done', size: 3, extension: 'mp4' });
    expect(api.exportChunk(0, 2)).toEqual({ offset: 0, size: 3, data: 'AQI=' });
    expect(api.exportChunk(2, 10).data).toBe('Aw==');
  });
  it('validates project text before loading it', () => {
    const { api, adapter } = setup();
    expect(() => api.loadProject('{}')).toThrow();
    expect(adapter.loadProject).not.toHaveBeenCalled();
  });

  it('lists templates with their parameters', () => {
    const { api } = setup();
    const list = api.listTemplates();
    const title = list.find((t) => t.id === 'title')!;
    expect(title.params.map((p) => p.key)).toContain('title');
    expect(list.map((t) => t.id)).toEqual(expect.arrayContaining(['dateCard', 'quote']));
  });
  it('inserts a template as one edit with layers', () => {
    const { api, adapter } = setup();
    const result = api.applyTemplate('title', { title: 'Hello' });
    expect(adapter.replaceContent).toHaveBeenCalledTimes(1);
    const content = adapter.replaceContent.mock.calls[0][0];
    expect(content.texts.some((t: any) => t.text === 'Hello')).toBe(true);
    expect(content.layers[0].targetId).toBe(result.createdIds[0]);
  });
  it('reports when the template does not fit the timeline', () => {
    const { api } = setup(); // 60 frames at 24 fps
    expect(api.applyTemplate('title', { seconds: 60 }).fitsTimeline).toBe(false);
    expect(api.applyTemplate('title', { seconds: 1 }).fitsTimeline).toBe(true);
  });
  it('rejects bad input without touching the scene', () => {
    const { api, adapter } = setup();
    expect(() => api.applyTemplate('nope', {})).toThrow('UNKNOWN_TEMPLATE');
    expect(() => api.applyTemplate('title', { bogus: 1 })).toThrow('UNKNOWN_TEMPLATE_PARAM:bogus');
    expect(() => api.applyTemplate('title', { color: 'red' })).toThrow('INVALID_TEMPLATE_VALUE:color');
    expect(() => api.applyTemplate('title', {}, 999)).toThrow('INVALID_FRAME');
    expect(adapter.replaceContent).not.toHaveBeenCalled();
  });
  it('blocks template insertion while recovery is pending', () => {
    const { status, api } = setup();
    status.ready = false;
    expect(() => api.applyTemplate('title', {})).toThrow('RECOVERY_PENDING');
  });
});

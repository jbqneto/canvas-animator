import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HeadlessEditor, isChromiumAvailable } from '../headless';
import { ffprobePath, resolveFfmpeg } from '../ffmpeg';

const chromiumAvailable = isChromiumAvailable();
const fixture = fileURLToPath(new URL('./fixtures/mini.fmproj', import.meta.url));
const distDir = path.resolve('dist');

describe('headless startup preconditions', () => {
  it('explains that the editor must be built when dist/index.html is missing', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-agent-no-dist-'));
    try {
      await expect(HeadlessEditor.launch({ distDir: empty })).rejects.toThrow('run `npm run build` first');
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!chromiumAvailable)('headless browser integration', () => {
  let editor: HeadlessEditor;

  beforeAll(async () => {
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
    }
    editor = await HeadlessEditor.launch();
    await editor.load(fs.readFileSync(fixture, 'utf8'));
  }, 120_000);

  afterAll(async () => {
    await editor?.close();
  });

  it('renders the fixture frame as a correctly sized PNG', async () => {
    const png = await editor.renderFrame(1);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(320);
    expect(png.readUInt32BE(20)).toBe(180);
  }, 60_000);

  it('renders a three-frame contact sheet', async () => {
    const png = await editor.contactSheet([1, 15, 30], { columns: 3, cellWidth: 160 });
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(134);
  }, 60_000);

  it('exports frames 1–10 to a playable container and probes H.264 when transcoding is available', async () => {
    const exported = await editor.export({ format: 'mp4', startFrame: 1, endFrame: 10, includeAudio: false });
    expect(exported.frames).toBe(10);
    expect(exported.fps).toBe(30);
    expect(exported.bytes.length).toBeGreaterThan(100);
    if (exported.extension === 'mp4') expect(exported.bytes.includes(Buffer.from('ftyp'))).toBe(true);
    else expect(exported.bytes.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));

    const ffmpeg = resolveFfmpeg();
    const ffprobe = ffmpeg && ffprobePath(ffmpeg);
    if (ffmpeg && ffprobe) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flashmotion-export-test-'));
      try {
        const input = path.join(tempDir, `mini.${exported.extension}`);
        let output = input;
        fs.writeFileSync(input, exported.bytes);
        if (exported.extension !== 'mp4') {
          output = path.join(tempDir, 'mini.mp4');
          execFileSync(ffmpeg, ['-y', '-i', input, '-t', '0.333333', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-an', output], { stdio: 'ignore' });
        }
        const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,nb_read_frames', '-of', 'json', output], { encoding: 'utf8' }));
        expect(probe.streams[0]).toMatchObject({ codec_name: 'h264', width: 320, height: 180, nb_read_frames: '10' });
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }, 180_000);
});

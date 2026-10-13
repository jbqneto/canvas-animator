import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs } from '../ffmpeg';

describe('ffmpeg transcode arguments', () => {
  it('includes H.264, AAC, frame rate and exact duration when audio is enabled', () => {
    expect(buildFfmpegArgs({ input: 'in.webm', output: 'out.mp4', fps: 30, durationSec: 10, includeAudio: true })).toEqual([
      '-y', '-i', 'in.webm', '-t', '10', '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high',
      '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '18', '-maxrate', '3.6M', '-bufsize', '7M',
      '-c:a', 'aac', '-ar', '48000', '-b:a', '160k', '-movflags', '+faststart', '-f', 'mp4', 'out.mp4',
    ]);
  });

  it('omits audio encoder options when the caller disabled audio', () => {
    const args = buildFfmpegArgs({ input: 'in.webm', output: 'out.mp4', fps: 24, durationSec: 0.5, includeAudio: false });
    expect(args).toContain('24');
    expect(args).toContain('0.5');
    expect(args).not.toContain('aac');
    expect(args).not.toContain('-ar');
  });
});

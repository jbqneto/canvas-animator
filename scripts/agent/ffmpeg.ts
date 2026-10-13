import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export interface FfmpegTranscodeOptions {
  input: string;
  output: string;
  fps: number;
  durationSec: number;
  includeAudio: boolean;
}

export function buildFfmpegArgs(options: FfmpegTranscodeOptions): string[] {
  if (!(options.fps > 0) || !(options.durationSec > 0) || !Number.isFinite(options.fps) || !Number.isFinite(options.durationSec)) {
    throw new Error('INVALID_TRANSCODE_TIMING');
  }
  const args = [
    '-y', '-i', options.input, '-t', String(options.durationSec), '-c:v', 'libx264', '-preset', 'slow',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(options.fps), '-crf', '18',
    '-maxrate', '3.6M', '-bufsize', '7M',
  ];
  if (options.includeAudio) args.push('-c:a', 'aac', '-ar', '48000', '-b:a', '160k');
  args.push('-movflags', '+faststart', '-f', 'mp4', options.output);
  return args;
}

function executable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function resolveFfmpeg(explicit?: string): string | null {
  const requested = explicit ?? process.env.FLASHMOTION_FFMPEG;
  if (requested && executable(requested)) return requested;
  const names = process.platform === 'win32' ? ['ffmpeg.exe', 'ffmpeg'] : ['ffmpeg'];
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (executable(candidate)) return candidate;
    }
  }
  return null;
}

export function ffprobePath(ffmpegPath: string): string | null {
  const candidate = path.join(path.dirname(ffmpegPath), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  return executable(candidate) ? candidate : null;
}

export async function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errorText = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { errorText += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`FFMPEG_FAILED: ${errorText.trim().slice(-2000) || code}`)));
  });
}

export function chromiumFfmpegCandidates(): string[] {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return (process.env.PATH ?? '').split(path.delimiter).map((directory) => path.join(directory, name)).filter(Boolean);
}

export function hasFfprobe(ffmpegPath: string): boolean {
  const probe = ffprobePath(ffmpegPath);
  return !!probe && spawnSync(probe, ['-version'], { stdio: 'ignore' }).status === 0;
}

export function tempPathNear(output: string): string {
  return `${output}.tmp`;
}

export function isPathWritable(file: string): boolean {
  try {
    fs.accessSync(path.dirname(path.resolve(file)), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export const systemTempDir = os.tmpdir;

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describeScene } from '../../src/engine/describe';
import { lintScene } from '../../src/engine/lint';
import { parseProject } from '../../src/project/projectFile';
import type { HeadlessEditor, AgentOperation, HeadlessExportOptions } from './headless';
import { buildFfmpegArgs, resolveFfmpeg, runFfmpeg, tempPathNear } from './ffmpeg';

type PureCommand = 'validate' | 'lint' | 'describe';
type AgentCommand = PureCommand | 'render-frame' | 'contact-sheet' | 'export' | 'apply' | 'run';

export interface ParsedAgentArgs {
  command: AgentCommand;
  positionals: string[];
  options: Record<string, string | boolean | undefined>;
}

const OPTION_DEFINITIONS = {
  chromium: { type: 'string' },
  frame: { type: 'string' },
  out: { type: 'string' },
  frames: { type: 'string' },
  count: { type: 'string' },
  start: { type: 'string' },
  end: { type: 'string' },
  columns: { type: 'string' },
  'cell-width': { type: 'string' },
  format: { type: 'string' },
  range: { type: 'string' },
  'no-audio': { type: 'boolean' },
  overwrite: { type: 'boolean' },
  ops: { type: 'string' },
} as const;

export function parseAgentArgs(args: string[]): ParsedAgentArgs {
  const parsed = parseArgs({ args, options: OPTION_DEFINITIONS, allowPositionals: true, strict: true });
  const [command, ...positionals] = parsed.positionals;
  const valid: AgentCommand[] = ['validate', 'lint', 'describe', 'render-frame', 'contact-sheet', 'export', 'apply', 'run'];
  if (!command || !valid.includes(command as AgentCommand)) throw new Error('USAGE: npm run agent -- <validate|lint|describe|render-frame|contact-sheet|export|apply|run>');
  return { command: command as AgentCommand, positionals, options: parsed.values as Record<string, string | boolean | undefined> };
}

export function framesForCount(start: number, end: number, count: number): number[] {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) throw new Error('INVALID_FRAME_RANGE');
  if (!Number.isSafeInteger(count) || count < 1 || count > 24) throw new Error('INVALID_FRAME_COUNT');
  if (count === 1 || end === start) return [start];
  const frames = Array.from({ length: count }, (_, i) => Math.round(start + (i * (end - start)) / (count - 1)));
  return frames.filter((frame, index) => index === 0 || frame !== frames[index - 1]);
}

/** Browser-free commands intentionally import no Playwright module. */
export function executePureCommand(command: PureCommand, filePath: string): unknown {
  const text = fs.readFileSync(filePath, 'utf8');
  const project = parseProject(text);
  if (command === 'lint') return { issues: lintScene(project) };
  if (command === 'describe') return describeScene(project);
  const issues = lintScene(project);
  const summary = {
    name: project.name,
    fps: project.fps,
    totalFrames: project.totalFrames,
    canvas: { width: project.canvas.width, height: project.canvas.height },
    counts: {
      texts: project.content.texts.length,
      actors: project.content.actors.length,
      charts: project.content.charts.length,
      paths: project.content.paths.length,
      audio: (project.content.audio ?? []).length,
    },
  };
  return { ok: true, summary, issues };
}

export function validationExitCode(result: unknown): 0 | 2 {
  const issues = (result as { issues?: { severity: string }[] }).issues ?? [];
  return issues.some((issue) => issue.severity === 'error') ? 2 : 0;
}

function output(result: unknown, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = exitCode;
}

async function main(args: string[]) {
  let parsed: ParsedAgentArgs;
  try {
    parsed = parseAgentArgs(args);
  } catch (error) {
    output({ ok: false, error: error instanceof Error ? error.message : String(error) }, 1);
    return;
  }
  if (parsed.command === 'validate' || parsed.command === 'lint' || parsed.command === 'describe') {
    if (parsed.positionals.length !== 1) {
      output({ ok: false, error: `USAGE: ${parsed.command} <file.fmproj>` }, 1);
      return;
    }
    try {
      const result = executePureCommand(parsed.command, parsed.positionals[0]);
      const exitCode = parsed.command === 'validate' ? validationExitCode(result) : 0;
      output(result, exitCode);
    } catch (error) {
      output({ ok: false, error: error instanceof Error ? error.message : String(error) }, 1);
    }
    return;
  }
  try {
    const result = await runHeadlessCommand(parsed);
    output(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exitCode = message.startsWith('CHROMIUM_NOT_FOUND') ? 3
      : /^(BUILD_REQUIRED|USAGE|INVALID_|OUTPUT_EXISTS|OUTPUT_TEMP_EXISTS|OPS_INVALID|STEPS_INVALID|NO_EXPORT_RANGE)/.test(message) ? 1
        : 4;
    output({ ok: false, error: message }, exitCode);
  }
}

const required = (options: Record<string, string | boolean | undefined>, key: string): string => {
  const value = options[key];
  if (typeof value !== 'string' || !value) throw new Error(`USAGE: missing --${key}`);
  return value;
};

const numberOption = (options: Record<string, string | boolean | undefined>, key: string, fallback?: number): number => {
  const value = options[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(`USAGE: --${key} must be a positive integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`USAGE: --${key} must be a positive integer`);
  return number;
};

function frameList(options: Record<string, string | boolean | undefined>, totalFrames: number): number[] {
  const frames = options.frames;
  if (typeof frames === 'string') {
    if (options.count !== undefined || options.start !== undefined || options.end !== undefined) {
      throw new Error('USAGE: use either --frames or --count with --start/--end');
    }
    const list = frames.split(',').map((value) => Number(value));
    if (!list.length || list.some((frame) => !Number.isSafeInteger(frame) || frame < 1 || frame > totalFrames) || list.length > 24) {
      throw new Error('USAGE: --frames must contain 1..24 valid frames');
    }
    return list;
  }
  const count = numberOption(options, 'count', 6);
  const start = numberOption(options, 'start', 1);
  const end = numberOption(options, 'end', totalFrames);
  if (end > totalFrames) throw new Error('INVALID_FRAME_RANGE');
  return framesForCount(start, end, count);
}

function parseRange(value: string | undefined, totalFrames: number): [number, number] {
  if (!value) return [1, totalFrames];
  const match = /^(\d+):(\d+)$/.exec(value);
  if (!match) throw new Error('USAGE: --range must be start:end');
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > totalFrames) throw new Error('INVALID_FRAME_RANGE');
  return [start, end];
}

function requirePositionals(parsed: ParsedAgentArgs, count: number) {
  if (parsed.positionals.length !== count) throw new Error(`USAGE: unexpected arguments for ${parsed.command}`);
}

function saveAtomic(outputPath: string, data: Buffer | string, overwrite = false): number {
  const target = path.resolve(outputPath);
  const temporary = tempPathNear(target);
  if (!overwrite && fs.existsSync(target)) throw new Error('OUTPUT_EXISTS');
  if (fs.existsSync(temporary)) throw new Error('OUTPUT_TEMP_EXISTS');
  fs.writeFileSync(temporary, data, { flag: 'wx' });
  try {
    if (!overwrite && fs.existsSync(target)) throw new Error('OUTPUT_EXISTS');
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  return fs.statSync(target).size;
}

function parseOps(filePath: string): AgentOperation[] {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object' || typeof (item as any).op !== 'string' || !Array.isArray((item as any).args))) {
    throw new Error('OPS_INVALID: expected an array of {op,args}');
  }
  const valid = (item: any) => {
    if (!Array.isArray(item.args)) return false;
    switch (item.op) {
      case 'addSfx': return item.args.length >= 2 && item.args.length <= 3 && ['whoosh', 'impact', 'riser', 'pop', 'tick'].includes(item.args[0]) && Array.isArray(item.args[1]) && item.args[1].every((frame: unknown) => Number.isSafeInteger(frame) && (frame as number) >= 1);
      case 'setCamera': return item.args.length === 1;
      case 'setEffects': return item.args.length >= 1 && item.args.length <= 3 && typeof item.args[0] === 'string';
      case 'applyTemplate': return item.args.length >= 1 && item.args.length <= 3 && typeof item.args[0] === 'string';
      case 'replaceContent': return item.args.length === 1 && !!item.args[0] && typeof item.args[0] === 'object' && !Array.isArray(item.args[0]);
      default: return false;
    }
  };
  if (value.some((item) => !valid(item))) throw new Error('OPS_INVALID: unsupported operation or invalid args');
  return value as AgentOperation[];
}

async function loadEditor(projectPath: string, chromiumPath?: string) {
  const projectText = fs.readFileSync(projectPath, 'utf8');
  parseProject(projectText);
  const { HeadlessEditor: Editor } = await import('./headless');
  const editor = await Editor.launch({ chromiumPath });
  await editor.load(projectText);
  return editor;
}

async function exportToFile(
  editor: HeadlessEditor,
  out: string,
  format: 'mp4' | 'webm-alpha',
  startFrame: number,
  endFrame: number,
  includeAudio: boolean,
  overwrite: boolean,
): Promise<Record<string, unknown>> {
  const { bytes, extension, fps, frames } = await editor.export({ format, includeAudio, startFrame, endFrame }, (progress) => {
    process.stderr.write(`export ${(progress * 100).toFixed(1)}%\n`);
  });
  const durationSec = frames / fps;
  let target = path.resolve(out);
  let temp = tempPathNear(target);
  let finalBytes = bytes;
  let container = extension === 'mp4' ? 'mp4' : 'webm';
  let videoCodec = extension === 'mp4' ? 'h264' : 'vp9';
  let transcoded = false;
  let warning: string | undefined;

  if (format === 'mp4' && extension !== 'mp4') {
    const ffmpeg = resolveFfmpeg();
    if (ffmpeg) {
      const rawTemp = `${target}.source.webm.tmp`;
      if (fs.existsSync(rawTemp)) throw new Error('OUTPUT_TEMP_EXISTS');
      fs.writeFileSync(rawTemp, bytes, { flag: 'wx' });
      try {
        if (!overwrite && fs.existsSync(target)) throw new Error('OUTPUT_EXISTS');
        if (fs.existsSync(temp)) throw new Error('OUTPUT_TEMP_EXISTS');
        await runFfmpeg(ffmpeg, buildFfmpegArgs({ input: rawTemp, output: temp, fps, durationSec, includeAudio }));
        fs.renameSync(temp, target);
        finalBytes = fs.readFileSync(target);
        transcoded = true;
        container = 'mp4';
        videoCodec = 'h264';
      } finally {
        fs.rmSync(rawTemp, { force: true });
        if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
      }
    } else {
      target = path.join(path.dirname(target), `${path.basename(target, path.extname(target))}.webm`);
      temp = tempPathNear(target);
      if (!overwrite && fs.existsSync(target)) throw new Error('OUTPUT_EXISTS');
      saveAtomic(target, bytes, overwrite);
      warning = 'H264_UNAVAILABLE';
    }
  } else {
    if (format === 'mp4' && path.extname(target).toLowerCase() !== '.mp4') throw new Error('USAGE: MP4 export requires an .mp4 output path');
    if (format === 'webm-alpha' && path.extname(target).toLowerCase() !== '.webm') throw new Error('USAGE: WebM export requires a .webm output path');
    saveAtomic(target, finalBytes, overwrite);
  }

  const result = {
    ok: true,
    outputPath: target,
    bytes: fs.statSync(target).size,
    container,
    videoCodec,
    transcoded,
    frames,
    fps,
    durationSec,
    ...(warning ? { warning } : {}),
  };
  return result;
}

async function runHeadlessCommand(parsed: ParsedAgentArgs): Promise<unknown> {
  if (parsed.command === 'run') {
    requirePositionals(parsed, 1);
    const stepsPath = path.resolve(parsed.positionals[0]);
    const plan = JSON.parse(fs.readFileSync(stepsPath, 'utf8')) as { steps?: unknown[] };
    if (!Array.isArray(plan.steps)) throw new Error('STEPS_INVALID: expected {steps: []}');
    const { HeadlessEditor: Editor } = await import('./headless');
    const editor = await Editor.launch({ chromiumPath: parsed.options.chromium as string | undefined });
    try {
      const results: unknown[] = [];
      for (const raw of plan.steps) {
        if (!raw || typeof raw !== 'object' || typeof (raw as any).op !== 'string') throw new Error('STEPS_INVALID: invalid step');
        const step = raw as Record<string, any>;
        const resolve = (file: string) => path.resolve(path.dirname(stepsPath), file);
        switch (step.op) {
          case 'load': {
            const text = fs.readFileSync(resolve(step.file), 'utf8');
            parseProject(text);
            await editor.load(text);
            results.push({ op: 'load', ok: true });
            break;
          }
          case 'addSfx': case 'setCamera': case 'setEffects': case 'applyTemplate': case 'replaceContent':
            results.push({ op: step.op, result: await editor.applyOps([{ op: step.op, args: step.args } as AgentOperation]) });
            break;
          case 'renderFrame':
            results.push({ op: step.op, outputPath: resolve(step.out), bytes: saveAtomic(resolve(step.out), await editor.renderFrame(step.frame), !!step.overwrite) });
            break;
          case 'contactSheet':
            {
              const project = await editor.getProject();
              const frames = Array.isArray(step.frames)
                ? step.frames
                : framesForCount(step.start ?? 1, step.end ?? project.project.totalFrames, step.count ?? 6);
              const options = step.options ?? {};
              results.push({ op: step.op, outputPath: resolve(step.out), bytes: saveAtomic(resolve(step.out), await editor.contactSheet(frames, options), !!step.overwrite) });
            }
            break;
          case 'export': {
            const status = await editor.getProject();
            const project = (status as any).project;
            const [startFrame, endFrame] = parseRange(step.range, project.totalFrames);
            results.push(await exportToFile(editor, resolve(step.out), step.format ?? (path.extname(step.out).toLowerCase() === '.webm' ? 'webm-alpha' : 'mp4'), startFrame, endFrame, !step.noAudio, !!step.overwrite));
            break;
          }
          case 'save': {
            const out = resolve(step.out);
            results.push({ op: step.op, outputPath: out, bytes: saveAtomic(out, JSON.stringify(await editor.getProject(), null, 2), !!step.overwrite) });
            break;
          }
          default: throw new Error(`STEPS_INVALID: unsupported step ${(step as any).op}`);
        }
      }
      return { ok: true, results };
    } finally {
      await editor.close();
    }
  }

  requirePositionals(parsed, 1);
  const projectPath = parsed.positionals[0];
  const applyOps = parsed.command === 'apply' ? parseOps(required(parsed.options, 'ops')) : undefined;
  if (parsed.command === 'apply' || parsed.command === 'render-frame' || parsed.command === 'contact-sheet' || parsed.command === 'export') {
    required(parsed.options, 'out');
  }
  if (parsed.command === 'render-frame') numberOption(parsed.options, 'frame');
  if (parsed.command === 'contact-sheet') {
    frameList(parsed.options, 1_000_000);
    const columns = numberOption(parsed.options, 'columns', 3);
    const cellWidth = numberOption(parsed.options, 'cell-width', 480);
    if (columns > 6 || cellWidth < 160 || cellWidth > 960) throw new Error('USAGE: invalid contact-sheet size; columns 1..6 and cell-width 160..960');
  }
  if (parsed.command === 'export') {
    const out = required(parsed.options, 'out');
    const format = parsed.options.format;
    if (format !== undefined && format !== 'mp4' && format !== 'webm-alpha') throw new Error('USAGE: --format must be mp4 or webm-alpha');
    const selectedFormat = format ?? (path.extname(out).toLowerCase() === '.webm' ? 'webm-alpha' : 'mp4');
    if (selectedFormat === 'mp4' && path.extname(out).toLowerCase() !== '.mp4') throw new Error('USAGE: MP4 export requires an .mp4 output path');
    if (selectedFormat === 'webm-alpha' && path.extname(out).toLowerCase() !== '.webm') throw new Error('USAGE: WebM export requires a .webm output path');
  }
  const editor = await loadEditor(projectPath, parsed.options.chromium as string | undefined);
  try {
    if (parsed.command === 'render-frame') {
      const frame = numberOption(parsed.options, 'frame');
      const out = required(parsed.options, 'out');
      const bytes = saveAtomic(out, await editor.renderFrame(frame), parsed.options.overwrite === true);
      return { ok: true, outputPath: path.resolve(out), bytes, frame };
    }
    if (parsed.command === 'contact-sheet') {
      const project = await editor.getProject();
      const frames = frameList(parsed.options, project.project.totalFrames);
      const columns = numberOption(parsed.options, 'columns', 3);
      const cellWidth = numberOption(parsed.options, 'cell-width', 480);
      if (columns > 6 || cellWidth < 160 || cellWidth > 960) throw new Error('USAGE: invalid contact-sheet size; columns 1..6 and cell-width 160..960');
      const out = required(parsed.options, 'out');
      const bytes = saveAtomic(out, await editor.contactSheet(frames, { columns, cellWidth }), parsed.options.overwrite === true);
      return { ok: true, outputPath: path.resolve(out), bytes, frames, columns, cellWidth };
    }
    if (parsed.command === 'export') {
      const out = required(parsed.options, 'out');
      const project = await editor.getProject();
      const [startFrame, endFrame] = parseRange(parsed.options.range as string | undefined, project.project.totalFrames);
      const requestedFormat = parsed.options.format;
      if (requestedFormat !== undefined && requestedFormat !== 'mp4' && requestedFormat !== 'webm-alpha') throw new Error('USAGE: --format must be mp4 or webm-alpha');
      const format = (requestedFormat ?? (path.extname(out).toLowerCase() === '.webm' ? 'webm-alpha' : 'mp4')) as 'mp4' | 'webm-alpha';
      if (format === 'mp4' && path.extname(out).toLowerCase() !== '.mp4') throw new Error('USAGE: MP4 export requires an .mp4 output path');
      if (format === 'webm-alpha' && path.extname(out).toLowerCase() !== '.webm') throw new Error('USAGE: WebM export requires a .webm output path');
      return await exportToFile(editor, out, format, startFrame, endFrame, parsed.options['no-audio'] !== true, parsed.options.overwrite === true);
    }
    if (parsed.command === 'apply') {
      const out = required(parsed.options, 'out');
      const applied = await editor.applyOps(applyOps!);
      const bytes = saveAtomic(out, JSON.stringify(await editor.getProject(), null, 2), parsed.options.overwrite === true);
      return { ok: true, outputPath: path.resolve(out), bytes, applied };
    }
    throw new Error(`USAGE: ${parsed.command} is not a browser command`);
  } finally {
    await editor.close();
  }
}

export { runHeadlessCommand };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  void main(process.argv.slice(2));
}

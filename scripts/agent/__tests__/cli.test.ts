import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { executePureCommand, framesForCount, parseAgentArgs, validationExitCode } from '../cli';

const fixture = fileURLToPath(new URL('./fixtures/mini.fmproj', import.meta.url));

describe('agent CLI argument parsing', () => {
  it('parses the command, input and typed options without consuming option values as positionals', () => {
    expect(parseAgentArgs(['render-frame', 'scene.fmproj', '--frame', '12', '--out', 'frame.png'])).toEqual({
      command: 'render-frame',
      positionals: ['scene.fmproj'],
      options: { frame: '12', out: 'frame.png' },
    });
  });

  it('rejects unknown flags and malformed count frame requests', () => {
    expect(() => parseAgentArgs(['validate', 'scene.fmproj', '--wat'])).toThrow();
    expect(() => framesForCount(10, 4, 6)).toThrow('INVALID_FRAME_RANGE');
  });
});

describe('browser-free project commands', () => {
  it('validates a project and returns its deterministic summary', () => {
    expect(executePureCommand('validate', fixture)).toEqual({
      ok: true,
      summary: {
        name: 'Mini Agent Fixture', fps: 30, totalFrames: 30,
        canvas: { width: 320, height: 180 },
        counts: { texts: 2, actors: 1, charts: 0, paths: 0, audio: 0 },
      },
      issues: [],
    });
  });

  it('returns the exact MCP lint and describe payloads', () => {
    expect(executePureCommand('lint', fixture)).toEqual({ issues: [] });
    expect(executePureCommand('describe', fixture)).toEqual({
      name: 'Mini Agent Fixture',
      fps: 30,
      canvas: { width: 320, height: 180, preset: 'custom' },
      durationSec: 1,
      hasCamera: false,
      items: [
        { id: 'title', kind: 'text', label: 'Headless', startSec: 0, endSec: 1 },
        { id: 'counter', kind: 'text', label: '10', startSec: 0, endSec: 1 },
        { id: 'shape', kind: 'actor', label: 'Shape', startSec: 0, endSec: 1 },
      ],
      markers: [],
    });
  });

  it('uses exit code 2 when validation finds an error-severity issue', () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-agent-invalid-'));
    try {
      const projectFile = JSON.parse(fs.readFileSync(fixture, 'utf8'));
      projectFile.project.content.texts[0].startFrame = 31;
      const invalid = path.join(temporaryDirectory, 'error.fmproj');
      fs.writeFileSync(invalid, JSON.stringify(projectFile));
      expect(validationExitCode(executePureCommand('validate', invalid))).toBe(2);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('rejects syntactically valid JSON that is not an fmproj file', () => {
    const bad = fileURLToPath(new URL('./fixtures/not-a-project.fmproj', import.meta.url));
    expect(() => executePureCommand('validate', bad)).toThrow();
  });
});

describe('count-based frame selection', () => {
  it('spreads six samples across the inclusive range without duplicates', () => {
    expect(framesForCount(1, 30, 6)).toEqual([1, 7, 13, 18, 24, 30]);
  });
});

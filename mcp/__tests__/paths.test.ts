import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { MAX_PROJECT_FILE_BYTES, resolveAllowedRoots, resolveReadable, resolveWritable } from '../paths';

describe('MCP path safety', () => {
  let root: string;
  let outside: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'fm-root-'));
    outside = await mkdtemp(path.join(tmpdir(), 'fm-outside-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  describe('resolveAllowedRoots', () => {
    it('adds --allow-root and FLASHMOTION_MCP_ROOTS entries, ignores relative ones, and de-duplicates', () => {
      const roots = resolveAllowedRoots(
        ['node', 'mcp.mjs', '--allow-root', '/srv/a', '--allow-root', 'relative/dir'],
        { FLASHMOTION_MCP_ROOTS: ['/srv/b', 'also/relative', '/srv/a'].join(path.delimiter) },
        '/proj'
      );
      expect(roots).toEqual(expect.arrayContaining(['/proj', '/srv/a', '/srv/b', path.resolve(tmpdir())]));
      expect(roots.filter((r) => r === '/srv/a')).toHaveLength(1);
      expect(roots.some((r) => r.includes('relative'))).toBe(false);
    });
  });

  describe('resolveReadable', () => {
    it('accepts a project file inside a root', async () => {
      const file = path.join(root, 'a.fmproj');
      await writeFile(file, '{}');
      await expect(resolveReadable(file, [root])).resolves.toBe(realpathSync(file));
    });
    it('rejects paths outside the roots, including ../ traversal', async () => {
      const file = path.join(outside, 'a.fmproj');
      await writeFile(file, '{}');
      await expect(resolveReadable(file, [root])).rejects.toThrow('PATH_NOT_ALLOWED');
      await expect(resolveReadable(path.join(root, '..', path.basename(outside), 'a.fmproj'), [root])).rejects.toThrow('PATH_NOT_ALLOWED');
      await expect(resolveReadable('/etc/passwd', [root])).rejects.toThrow('PATH_NOT_ALLOWED');
    });
    it('rejects a symlink inside the root that points outside', async () => {
      const target = path.join(outside, 'secret.fmproj');
      await writeFile(target, '{}');
      const link = path.join(root, 'link.fmproj');
      await symlink(target, link);
      await expect(resolveReadable(link, [root])).rejects.toThrow('PATH_NOT_ALLOWED');
    });
    it('rejects wrong extensions, directories, missing files and oversized files with a generic error', async () => {
      await writeFile(path.join(root, 'a.txt'), '{}');
      await mkdir(path.join(root, 'dir.fmproj'));
      await expect(resolveReadable(path.join(root, 'a.txt'), [root])).rejects.toThrow('FILE_NOT_READABLE');
      await expect(resolveReadable(path.join(root, 'dir.fmproj'), [root])).rejects.toThrow('FILE_NOT_READABLE');
      await expect(resolveReadable(path.join(root, 'missing.fmproj'), [root])).rejects.toThrow('FILE_NOT_READABLE');
      const big = path.join(root, 'big.fmproj');
      await writeFile(big, '');
      await truncate(big, MAX_PROJECT_FILE_BYTES + 1);
      await expect(resolveReadable(big, [root])).rejects.toThrow('FILE_NOT_READABLE');
    });
  });

  describe('resolveWritable', () => {
    it('accepts a new file, also in a folder that does not exist yet, inside a root', async () => {
      await expect(resolveWritable(path.join(root, 'out.mp4'), 'mp4', [root])).resolves.toMatch(/out\.mp4$/);
      await expect(resolveWritable(path.join(root, 'new', 'deep', 'clip.webm'), 'webm-alpha', [root])).resolves.toMatch(/clip\.webm$/);
    });
    it('requires the extension to match the format', async () => {
      await expect(resolveWritable(path.join(root, 'out.webm'), 'mp4', [root])).rejects.toThrow('INVALID_OUTPUT_EXTENSION');
      await expect(resolveWritable(path.join(root, 'out.mp4'), 'webm-alpha', [root])).rejects.toThrow('INVALID_OUTPUT_EXTENSION');
      await expect(resolveWritable(path.join(root, '.bashrc'), 'mp4', [root])).rejects.toThrow('INVALID_OUTPUT_EXTENSION');
    });
    it('rejects paths outside the roots, traversal and symlinked folders that escape', async () => {
      await expect(resolveWritable(path.join(outside, 'out.mp4'), 'mp4', [root])).rejects.toThrow('PATH_NOT_ALLOWED');
      await expect(resolveWritable(path.join(root, '..', path.basename(outside), 'out.mp4'), 'mp4', [root])).rejects.toThrow('PATH_NOT_ALLOWED');
      const link = path.join(root, 'escape');
      await symlink(outside, link);
      await expect(resolveWritable(path.join(link, 'out.mp4'), 'mp4', [root])).rejects.toThrow('PATH_NOT_ALLOWED');
    });
    it('does not overwrite an existing file unless asked, and never writes through a symlink to outside', async () => {
      const file = path.join(root, 'out.mp4');
      await writeFile(file, 'x');
      await expect(resolveWritable(file, 'mp4', [root])).rejects.toThrow('OUTPUT_EXISTS');
      await expect(resolveWritable(file, 'mp4', [root], true)).resolves.toMatch(/out\.mp4$/);
      const victim = path.join(outside, 'victim.mp4');
      await writeFile(victim, 'x');
      const link = path.join(root, 'link.mp4');
      await symlink(victim, link);
      await expect(resolveWritable(link, 'mp4', [root], true)).rejects.toThrow('PATH_NOT_ALLOWED');
    });
  });
});

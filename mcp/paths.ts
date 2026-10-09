import { lstat, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, extname, isAbsolute, relative, resolve } from 'node:path';

/** Largest .fmproj the bridge accepts (see MAX_BRIDGE_BYTES in the protocol). */
export const MAX_PROJECT_FILE_BYTES = 45 * 1024 * 1024;

const PROJECT_EXTENSIONS = ['.fmproj', '.json'];
const OUTPUT_EXTENSIONS = { mp4: '.mp4', 'webm-alpha': '.webm' } as const;

/**
 * Folders the MCP server may read projects from and write videos to: the project folder and the
 * system temp folder, plus every `--allow-root <dir>` argument and every entry of the
 * FLASHMOTION_MCP_ROOTS environment variable. Relative entries are ignored.
 */
export function resolveAllowedRoots(argv: string[], env: NodeJS.ProcessEnv, projectRoot: string): string[] {
  const extra: string[] = [];
  argv.forEach((arg, i) => {
    if (arg === '--allow-root' && argv[i + 1]) extra.push(argv[i + 1]);
  });
  extra.push(...(env.FLASHMOTION_MCP_ROOTS ?? '').split(delimiter));
  const roots = [projectRoot, tmpdir(), ...extra].filter((r) => r && isAbsolute(r)).map((r) => resolve(r));
  return [...new Set(roots)];
}

const isInside = (root: string, target: string) => {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/** Roots with symlinks resolved; roots that do not exist are dropped. */
async function realRoots(roots: string[]): Promise<string[]> {
  const real: string[] = [];
  for (const root of roots) {
    try { real.push(await realpath(root)); } catch { /* a missing root allows nothing */ }
  }
  return real;
}

/** The real path of `target`, resolving symlinks in its nearest existing ancestor. */
async function resolveThroughAncestors(target: string): Promise<string> {
  const rest: string[] = [];
  let current = target;
  for (;;) {
    try {
      const real = await realpath(current);
      return rest.length ? resolve(real, ...rest.reverse()) : real;
    } catch {
      const parent = dirname(current);
      if (parent === current) return target;
      rest.push(basename(current));
      current = parent;
    }
  }
}

const denied = () => new Error('PATH_NOT_ALLOWED');
const unreadable = () => new Error('FILE_NOT_READABLE');

/**
 * Validates a project file to load: inside an allowed root (symlinks resolved), a regular
 * .fmproj/.json file of a sane size. Errors are deliberately generic so they do not reveal
 * whether a path outside the roots exists.
 */
export async function resolveReadable(path: string, roots: string[]): Promise<string> {
  const allowed = await realRoots(roots);
  if (!roots.some((r) => isInside(resolve(r), resolve(path)))) throw denied();
  let real: string;
  try { real = await realpath(path); } catch { throw unreadable(); }
  if (!allowed.some((r) => isInside(r, real))) throw denied();
  if (!PROJECT_EXTENSIONS.includes(extname(real).toLowerCase())) throw unreadable();
  const info = await stat(real).catch(() => null);
  if (!info?.isFile() || info.size > MAX_PROJECT_FILE_BYTES) throw unreadable();
  return real;
}

/**
 * Validates where a video may be written: extension matches the format, inside an allowed root
 * (symlinks in existing ancestors resolved), never through a symlink, and never over an existing
 * file unless `overwrite` is set. Returns the real target path.
 */
export async function resolveWritable(
  outputPath: string,
  format: keyof typeof OUTPUT_EXTENSIONS,
  roots: string[],
  overwrite = false
): Promise<string> {
  if (extname(outputPath).toLowerCase() !== OUTPUT_EXTENSIONS[format]) throw new Error('INVALID_OUTPUT_EXTENSION');
  const allowed = await realRoots(roots);
  const lexical = resolve(outputPath);
  if (!roots.some((r) => isInside(resolve(r), lexical))) throw denied();
  const real = await resolveThroughAncestors(lexical);
  if (!allowed.some((r) => isInside(r, real))) throw denied();
  const existing = await lstat(real).catch(() => null);
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isFile()) throw denied();
    if (!overwrite) throw new Error('OUTPUT_EXISTS');
  }
  return real;
}

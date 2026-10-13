import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadLocalFontAssets, fontResponse } from './fonts';
import { startStaticServer, type StaticServer } from './static-server';
import type { BrowserAutomationApi } from '../../src/automation/browserApi';

type PlaywrightBrowser = import('playwright-core').Browser;
type PlaywrightContext = import('playwright-core').BrowserContext;
type PlaywrightPage = import('playwright-core').Page;

export type AgentOperation =
  | { op: 'addSfx'; args: [string, number[], number?] }
  | { op: 'setCamera'; args: [unknown] }
  | { op: 'setEffects'; args: [string, Record<string, unknown>?, Record<string, unknown>?] }
  | { op: 'applyTemplate'; args: [string, Record<string, string | number>?, number?] }
  | { op: 'replaceContent'; args: [Record<string, unknown>] };

export interface HeadlessExportOptions {
  format: 'mp4' | 'webm-alpha';
  includeAudio?: boolean;
  startFrame?: number;
  endFrame?: number;
}

function hasExecutable(file: string | undefined): file is string {
  return !!file && fs.existsSync(file) && fs.statSync(file).isFile();
}

function findInPath(names: string[]): string | undefined {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (hasExecutable(candidate)) return candidate;
    }
  }
}

function browserInstallCandidates(): string[] {
  const roots = process.env.PLAYWRIGHT_BROWSERS_PATH === '0'
    ? [path.resolve('node_modules/playwright-core/.local-browsers')]
    : [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), '.cache/ms-playwright')].filter((value): value is string => !!value);
  const paths: string[] = [];
  for (const root of roots) {
    let dirs: string[];
    try { dirs = fs.readdirSync(root).filter((entry) => /^(chromium|chromium-headless-shell)-/.test(entry)).sort().reverse(); }
    catch { continue; }
    for (const dir of dirs) {
      const base = path.join(root, dir);
      paths.push(
        path.join(base, 'chrome-linux', 'chrome'),
        path.join(base, 'chrome-linux64', 'chrome'),
        path.join(base, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(base, 'chrome-win', 'chrome.exe'),
        path.join(base, 'chrome-win64', 'chrome.exe'),
        path.join(base, 'chrome-linux', 'headless_shell'),
        path.join(base, 'chrome-linux64', 'headless_shell'),
      );
    }
  }
  return paths;
}

export function isChromiumAvailable(): boolean {
  if (hasExecutable(process.env.FLASHMOTION_CHROMIUM)) return true;
  if (browserInstallCandidates().some(hasExecutable)) return true;
  return !!findInPath(process.platform === 'win32'
    ? ['chrome.exe', 'google-chrome.exe', 'chromium.exe']
    : ['google-chrome', 'google-chrome-stable', 'chrome', 'chromium', 'chromium-browser']);
}

async function launchBrowser(chromiumPath?: string): Promise<PlaywrightBrowser> {
  const { chromium } = await import('playwright-core');
  const explicit = chromiumPath;
  const installed = browserInstallCandidates();
  const playwrightExecutable = chromium.executablePath();
  const candidates = [explicit, process.env.FLASHMOTION_CHROMIUM, playwrightExecutable, ...installed].filter((candidate): candidate is string => !!candidate);
  const attempted = new Set<string>();
  for (const candidate of candidates) {
    if (!hasExecutable(candidate) || attempted.has(candidate)) continue;
    attempted.add(candidate);
    try {
      return await chromium.launch({ executablePath: candidate, args: ['--autoplay-policy=no-user-gesture-required'] });
    } catch {
      // Continue in the documented order; the final error below explains the recovery options.
    }
  }
  try {
    return await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  } catch {
    throw new Error('CHROMIUM_NOT_FOUND: install Chrome/Chromium, set PLAYWRIGHT_BROWSERS_PATH, or pass --chromium <path>');
  }
}

function decodePngDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('INVALID_RENDER_RESULT');
  return Buffer.from(match[1], 'base64');
}

export class HeadlessEditor {
  private constructor(
    private readonly server: StaticServer,
    private readonly browser: PlaywrightBrowser,
    private readonly context: PlaywrightContext,
    private readonly page: PlaywrightPage,
  ) {}

  static async launch(options: { distDir?: string; chromiumPath?: string } = {}): Promise<HeadlessEditor> {
    const distDir = options.distDir ?? path.resolve('dist');
    if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error('BUILD_REQUIRED: run `npm run build` first');
    const fontAssets = loadLocalFontAssets();
    const server = await startStaticServer(distDir);
    let browser: PlaywrightBrowser | undefined;
    let context: PlaywrightContext | undefined;
    try {
      browser = await launchBrowser(options.chromiumPath);
      context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.route('**/*', async (route) => {
        const requestUrl = new URL(route.request().url());
        if (requestUrl.hostname === 'fonts.googleapis.com') {
          return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: fontAssets.css });
        }
        if (requestUrl.hostname === 'fonts.gstatic.com') {
          return route.fulfill(fontResponse(fontAssets, route.request().url()));
        }
        if (requestUrl.origin === server.origin) {
          if (requestUrl.pathname === '/') {
            const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8')
              .replace(/<link\b[^>]*rel="preconnect"[^>]*>/gi, '');
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
          }
          return route.continue();
        }
        // No external hosts are needed for this offline editor task.
        return route.abort('blockedbyclient');
      });
      page.on('pageerror', (error) => process.stderr.write(`browser: ${error.message}\n`));
      await page.goto(`${server.origin}/?automation=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction(() => !!window.flashmotion?.getStatus().ready, undefined, { timeout: 60_000 });
      return new HeadlessEditor(server, browser, context, page);
    } catch (error) {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
      await server.close().catch(() => undefined);
      throw error;
    }
  }

  async load(projectText: string): Promise<void> {
    await this.page.evaluate((text) => window.flashmotion!.loadProject(text), projectText);
    await this.page.evaluate(() => document.fonts.ready.then(() => undefined));
  }

  getProject(): Promise<ReturnType<BrowserAutomationApi['getProject']>> {
    return this.page.evaluate(() => window.flashmotion!.getProject());
  }

  async applyOps(ops: AgentOperation[]): Promise<unknown[]> {
    return this.page.evaluate(async (operations) => {
      const api = window.flashmotion!;
      return operations.map(({ op, args }) => {
        switch (op) {
          case 'addSfx': return api.addSfx(...args as Parameters<typeof api.addSfx>);
          case 'setCamera': return api.setCamera(args[0]);
          case 'setEffects': return api.setEffects(...args as Parameters<typeof api.setEffects>);
          case 'applyTemplate': return api.applyTemplate(...args as Parameters<typeof api.applyTemplate>);
          case 'replaceContent': return api.replaceContent(args[0]);
        }
      });
    }, ops);
  }

  async renderFrame(frame: number): Promise<Buffer> {
    await this.page.evaluate(() => document.fonts.ready.then(() => undefined));
    return decodePngDataUrl(await this.page.evaluate((n) => window.flashmotion!.renderFrame(n), frame));
  }

  async contactSheet(frames: number[], options: { columns?: number; cellWidth?: number } = {}): Promise<Buffer> {
    await this.page.evaluate(() => document.fonts.ready.then(() => undefined));
    return decodePngDataUrl(await this.page.evaluate(({ list, opts }) => window.flashmotion!.renderContactSheet(list, opts), { list: frames, opts: options }));
  }

  async export(options: HeadlessExportOptions, onProgress: (progress: number) => void = () => undefined): Promise<{ bytes: Buffer; extension: string; fps: number; frames: number }> {
    const status = await this.page.evaluate(() => window.flashmotion!.getStatus());
    const startFrame = options.startFrame ?? 1;
    const endFrame = options.endFrame ?? status.totalFrames;
    if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrame) || startFrame < 1 || endFrame < startFrame || endFrame > status.totalFrames) {
      throw new Error('INVALID_FRAME_RANGE');
    }
    const started = await this.page.evaluate((opts) => window.flashmotion!.startExport(opts), {
      format: options.format,
      includeAudio: options.includeAudio ?? true,
      startFrame,
      endFrame,
    });
    if ('error' in started && started.error) throw new Error(started.error);
    let current = started;
    while (current.state === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const next = await this.page.evaluate(() => window.flashmotion!.exportStatus());
      if (!next) throw new Error('EXPORT_STATUS_MISSING');
      current = next;
      onProgress(current.progress > 1 ? current.progress / 100 : current.progress);
    }
    if (current.state !== 'done' || !current.size) throw new Error(current.error ?? 'EXPORT_FAILED');
    const chunks: Buffer[] = [];
    const chunkSize = 4 * 1024 * 1024;
    for (let offset = 0; offset < current.size; offset += chunkSize) {
      const chunk = await this.page.evaluate(([start, length]) => window.flashmotion!.exportChunk(start, length), [offset, chunkSize]);
      if (chunk.offset !== offset || chunk.size !== current.size) throw new Error('INVALID_EXPORT_CHUNK');
      chunks.push(Buffer.from(chunk.data, 'base64'));
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== current.size) throw new Error('INVALID_EXPORT_SIZE');
    return { bytes, extension: current.extension ?? 'webm', fps: status.fps, frames: endFrame - startFrame + 1 };
  }

  async close(): Promise<void> {
    try {
      await this.context.close();
    } finally {
      try {
        await this.browser.close();
      } finally {
        await this.server.close();
      }
    }
  }
}

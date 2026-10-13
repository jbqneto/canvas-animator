import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startStaticServer } from '../static-server';

let close: (() => Promise<void>) | undefined;
let directory: string | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
  if (directory) await fs.rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe('headless static server', () => {
  it('serves files from the requested dist root on loopback', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fm-static-'));
    const root = path.join(directory, 'dist');
    await fs.mkdir(root);
    await fs.writeFile(path.join(root, 'index.html'), '<h1>studio</h1>');
    const server = await startStaticServer(root);
    close = server.close;
    const response = await fetch(`${server.origin}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<h1>studio</h1>');
    expect(new URL(server.origin).hostname).toBe('127.0.0.1');
    expect(new URL(server.origin).port).not.toBe('0');
  });

  it('returns 404 for traversal instead of exposing files beside dist', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fm-static-'));
    const root = path.join(directory, 'dist');
    await fs.mkdir(root);
    await fs.writeFile(path.join(root, 'index.html'), 'safe');
    await fs.writeFile(path.join(directory, 'package.json'), 'secret');
    const server = await startStaticServer(root);
    close = server.close;
    const response = await fetch(`${server.origin}/%2e%2e/package.json`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('secret');
  });
});

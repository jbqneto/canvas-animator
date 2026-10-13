import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const FONTS = [
  { packageName: '@fontsource/plus-jakarta-sans', family: 'Plus Jakarta Sans' },
  { packageName: '@fontsource/inter', family: 'Inter' },
  { packageName: '@fontsource/jetbrains-mono', family: 'JetBrains Mono' },
  { packageName: '@fontsource/cormorant-garamond', family: 'Cormorant Garamond' },
  { packageName: '@fontsource/ibm-plex-mono', family: 'IBM Plex Mono' },
];

export interface LocalFontAssets {
  css: string;
  files: Map<string, Buffer>;
}

/** Reads local @fontsource assets and emits CSS whose URLs are fulfilled by the headless page router. */
export function loadLocalFontAssets(root = process.cwd()): LocalFontAssets {
  const require = createRequire(path.join(root, 'package.json'));
  const files = new Map<string, Buffer>();
  const faces: string[] = [];
  for (const font of FONTS) {
    for (const weight of [400, 500, 600, 700, 800]) {
      let cssFile: string;
      try {
        cssFile = require.resolve(`${font.packageName}/${weight}.css`);
      } catch {
        continue;
      }
      const source = fs.readFileSync(cssFile, 'utf8');
      for (const match of source.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
        const face = match[1];
        if (!/unicode-range\s*:\s*U\+0000-00FF/i.test(face)) continue;
        const urlMatch = face.match(/url\((['"]?)([^)'\"]+\.woff2)\1\)/i);
        if (!urlMatch) continue;
        const fontFile = path.resolve(path.dirname(cssFile), urlMatch[2]);
        if (!fs.existsSync(fontFile)) continue;
        const assetName = `${font.packageName.slice('@fontsource/'.length)}-${weight}.woff2`;
        files.set(assetName, fs.readFileSync(fontFile));
        const rewritten = face
          .replace(/font-family\s*:\s*[^;]+;/i, `font-family: '${font.family}';`)
          .replace(/src\s*:\s*[^;]+;/i, `src: url('https://fonts.gstatic.com/s/flashmotion/${assetName}') format('woff2');`);
        faces.push(`@font-face {${rewritten}}`);
      }
    }
  }
  return { css: faces.join('\n'), files };
}

export function fontResponse(assets: LocalFontAssets, requestUrl: string): { status: number; body: Buffer | string; contentType: string } {
  const name = decodeURIComponent(new URL(requestUrl).pathname.split('/').pop() ?? '');
  if (name.endsWith('.css')) return { status: 200, body: assets.css, contentType: 'text/css; charset=utf-8' };
  const font = assets.files.get(name);
  return font
    ? { status: 200, body: font, contentType: 'font/woff2' }
    : { status: 404, body: '', contentType: 'text/plain; charset=utf-8' };
}

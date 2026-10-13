import { describe, expect, it } from 'vitest';
import { fontResponse, loadLocalFontAssets } from '../fonts';

describe('local agent font service', () => {
  it('provides local regular-face CSS and woff2 files for the editor families', () => {
    const assets = loadLocalFontAssets();
    for (const family of ['Plus Jakarta Sans', 'Inter', 'JetBrains Mono', 'Cormorant Garamond', 'IBM Plex Mono']) {
      expect(assets.css).toContain(`font-family: '${family}'`);
    }
    expect(assets.files.size).toBeGreaterThanOrEqual(5);
    expect(assets.css).not.toMatch(/https?:\/\/(?!fonts\.gstatic\.com\/s\/flashmotion\/)/);
  });

  it('serves a referenced font from memory and rejects unknown files', () => {
    const assets = loadLocalFontAssets();
    const response = fontResponse(assets, 'https://fonts.gstatic.com/s/flashmotion/inter-400.woff2');
    expect(response.status).toBe(200);
    expect(response.contentType).toBe('font/woff2');
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(fontResponse(assets, 'https://fonts.gstatic.com/s/flashmotion/unknown.woff2').status).toBe(404);
  });
});

/**
 * Shared cache of decoded images used by the canvas renderer.
 * Creating `new Image()` inside the render loop never gives the browser time to decode it,
 * so images were drawn only by luck (and never in the first exported frames).
 */

import { t } from '../i18n';

const cache = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

/** Returns the cached image for `url`, starting the load on first request. */
export function getCachedImage(url: string): HTMLImageElement {
  let img = cache.get(url);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => listeners.forEach((cb) => cb());
    img.src = url;
    cache.set(url, img);
  }
  return img;
}

export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** A broken image must not silently disappear from an exported video or PNG. */
export async function preloadImages(urls: string[]): Promise<void> {
  const results = await Promise.all(
    [...new Set(urls)].map(async (url) => {
      const img = getCachedImage(url);
      try {
        await img.decode();
        if (isImageReady(img)) return true;
      } catch {
        // Retry a failed load on the next export, without retaining a broken cache entry.
      }
      cache.delete(url);
      return false;
    })
  );
  const count = results.filter((ready) => !ready).length;
  if (count > 0) throw new Error(t('exportVideo.error.imagesFailed', { count }));
}

/** Subscribes to "an image finished loading" so the live preview can redraw. */
export function onImageLoaded(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Shared cache of decoded images used by the canvas renderer.
 * Creating `new Image()` inside the render loop never gives the browser time to decode it,
 * so images were drawn only by luck (and never in the first exported frames).
 */

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

/** Resolves once every image has finished loading (or failed), so export never skips them. */
export function preloadImages(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map((url) => {
      const img = getCachedImage(url);
      if (img.complete) return Promise.resolve();
      return img.decode().catch(() => undefined);
    })
  ).then(() => undefined);
}

/** Subscribes to "an image finished loading" so the live preview can redraw. */
export function onImageLoaded(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

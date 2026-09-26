const MAX_SOURCE_SIDE = 2048;
/** Imported images start at most this fraction of the canvas, so they never cover the whole stage. */
const MAX_STAGE_FRACTION = 0.35;

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Formato de imagem não suportado'));
    img.src = src;
  });
}

/**
 * Reads an image file into a self-contained data URL (so the project can be saved as one file),
 * downscaling very large images, and computes a sensible initial size on the stage.
 */
export async function loadImageFileAsActorSource(
  file: File,
  canvasWidth: number,
  canvasHeight: number
): Promise<{ src: string; width: number; height: number }> {
  let src = await readAsDataURL(file);
  const img = await loadImage(src);
  // SVGs without intrinsic size report 0
  const naturalW = img.naturalWidth || 300;
  const naturalH = img.naturalHeight || 300;

  const longest = Math.max(naturalW, naturalH);
  if (longest > MAX_SOURCE_SIDE && file.type !== 'image/svg+xml') {
    const k = MAX_SOURCE_SIDE / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(naturalW * k);
    canvas.height = Math.round(naturalH * k);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    // WebP keeps transparency and is much smaller than PNG
    src = canvas.toDataURL('image/webp', 0.92);
  }

  const fit = Math.min(
    1,
    (canvasWidth * MAX_STAGE_FRACTION) / naturalW,
    (canvasHeight * MAX_STAGE_FRACTION) / naturalH
  );
  return { src, width: Math.round(naturalW * fit), height: Math.round(naturalH * fit) };
}

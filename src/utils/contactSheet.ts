import type { ContactSheetLayout } from '../engine/contactSheet';

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('CONTACT_SHEET_IMAGE'));
    img.src = url;
  });

/** One PNG with every frame in a grid and its label above it. */
export async function composeContactSheet(frameUrls: string[], labels: string[], layout: ContactSheetLayout): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, layout.width, layout.height);
  const images = await Promise.all(frameUrls.map(loadImage));
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(layout.labelHeight * 0.6)}px sans-serif`;
  images.forEach((img, i) => {
    const { x, y } = layout.cells[i];
    ctx.fillStyle = '#ffffff';
    ctx.fillText(labels[i] ?? '', x + 6, y + layout.labelHeight / 2);
    ctx.drawImage(img, x, y + layout.labelHeight, layout.cellWidth, layout.cellHeight);
  });
  return canvas.toDataURL('image/png');
}

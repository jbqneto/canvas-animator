/** `count` evenly spaced integer frames in [start, end], increasing and without repeats. */
export function evenFrames(start: number, end: number, count: number): number[] {
  if (count <= 1 || end <= start) return [start];
  const frames = Array.from({ length: count }, (_, i) => Math.round(start + (i * (end - start)) / (count - 1)));
  return frames.filter((f, i) => i === 0 || f !== frames[i - 1]);
}

export interface ContactSheetLayout {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  labelHeight: number;
  cells: { x: number; y: number }[];
}

export function contactSheetLayout(p: {
  count: number;
  columns: number;
  cellWidth: number;
  /** cell height / cell width */
  aspect: number;
  gap?: number;
  labelHeight?: number;
}): ContactSheetLayout {
  const gap = p.gap ?? 8;
  const labelHeight = p.labelHeight ?? 28;
  const cellHeight = Math.round(p.cellWidth * p.aspect);
  const columns = Math.max(1, Math.min(p.columns, p.count));
  const rows = Math.ceil(p.count / columns);
  const cells = Array.from({ length: p.count }, (_, i) => ({
    x: gap + (i % columns) * (p.cellWidth + gap),
    y: gap + Math.floor(i / columns) * (labelHeight + cellHeight + gap),
  }));
  return {
    width: gap + columns * (p.cellWidth + gap),
    height: gap + rows * (labelHeight + cellHeight + gap),
    cellWidth: p.cellWidth,
    cellHeight,
    labelHeight,
    cells,
  };
}

/**
 * Layers own objects by id: one (`targetId`) or several (`targetIds`, e.g. the captions track, where
 * each caption is a clip on the same row, like sequential tweens on one Flash layer).
 */
import type { StudioLayer } from '../types';

/** Ids of the objects on the layer. */
export const layerTargets = (layer: StudioLayer): string[] =>
  layer.targetIds ?? (layer.targetId ? [layer.targetId] : []);

export const layerHolds = (layer: StudioLayer, id: string) =>
  layer.targetId === id || (layer.targetIds?.includes(id) ?? false);

/** Layers after an object is deleted: its own layer goes; a shared layer loses it (and goes when empty). */
export function withoutTarget(layers: StudioLayer[], id: string): StudioLayer[] {
  return layers.flatMap((l) => {
    if (l.targetId === id) return [];
    if (!l.targetIds?.includes(id)) return [l];
    const targetIds = l.targetIds.filter((x) => x !== id);
    return targetIds.length ? [{ ...l, targetIds }] : [];
  });
}

/**
 * Adds objects to the shared layer `layer.id`, creating it (on top) when missing. The new ids go after
 * the ones already there.
 */
export function addToSharedLayer(layers: StudioLayer[], layer: StudioLayer, ids: string[]): StudioLayer[] {
  const existing = layers.find((l) => l.id === layer.id);
  if (!existing) return [{ ...layer, targetIds: [...ids] }, ...layers];
  return layers.map((l) =>
    l.id === layer.id ? { ...l, targetIds: [...(l.targetIds ?? []), ...ids.filter((id) => !l.targetIds?.includes(id))] } : l
  );
}

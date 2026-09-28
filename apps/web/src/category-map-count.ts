import type { CategoryMapCount } from './map-discovery';

export function resolveCategoryMapCount(
  categoryId: string,
  markerCount: number,
  mapCounts: ReadonlyMap<string, CategoryMapCount> | undefined,
): CategoryMapCount {
  if (!mapCounts) return { visible: markerCount, collectedOutside: 0 };
  return mapCounts.get(categoryId) ?? { visible: 0, collectedOutside: 0 };
}

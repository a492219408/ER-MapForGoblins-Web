import type { LegacyMapConversion, MapPlane } from './dataset';
import type { SaveMapId, SaveMapPoint } from './slot-map-state';

export interface ProjectedSaveMapPoint {
  coordinate: [number, number];
  elevation: number;
  mapId: string;
  plane: MapPlane;
}

export function projectSaveMapPoint(
  point: SaveMapPoint,
  legacyConversions: readonly LegacyMapConversion[],
): ProjectedSaveMapPoint | undefined {
  if (!point.coordinates.every(Number.isFinite)) return undefined;
  const [a, b, c, d] = point.mapId;
  const forward: SaveMapId = [a, b, c, d];
  const reversed: SaveMapId = [d, c, b, a];

  // UserDataX 把 MapId 的四个字节按小端顺序保存。地表/幽影之地的
  // area=60/61 因而位于最后一个字节，必须先尝试反向解释；否则正向的
  // area=0 偶尔会误命中一条 legacy conversion，把当前位置投到错误区域。
  const candidates = d === 60 || d === 61
    ? [reversed, forward]
    : [forward, reversed];
  return projectCandidate(candidates[0], point.coordinates, legacyConversions)
    ?? projectCandidate(candidates[1], point.coordinates, legacyConversions);
}

function projectCandidate(
  mapId: SaveMapId,
  coordinates: readonly [number, number, number],
  legacyConversions: readonly LegacyMapConversion[],
): ProjectedSaveMapPoint | undefined {
  const [area, gridX, gridZ, layerAndTier] = mapId;
  const [x, elevation, z] = coordinates;
  const formattedMapId = `m${pad(area)}_${pad(gridX)}_${pad(gridZ)}_${pad(layerAndTier)}`;

  if (area === 60 || area === 61) {
    const tier = layerAndTier % 10;
    if (tier > 2) return undefined;
    const size = 256 * 2 ** tier;
    const worldX = gridX * size + size / 2 + x;
    const worldZ = gridZ * size + size / 2 + z;
    return {
      coordinate: [round(worldX - 7168), round(16640 - worldZ)],
      elevation,
      mapId: formattedMapId,
      plane: area === 61 ? 'shadow' : 'surface',
    };
  }

  const conversion = legacyConversions.find((candidate) => (
    candidate.sourceArea === area && candidate.sourceGridX === gridX
  ));
  if (!conversion) return undefined;
  const worldX = conversion.targetGridX * 256 + conversion.targetX + (x - conversion.sourceX);
  const worldZ = conversion.targetGridZ * 256 + conversion.targetZ + (z - conversion.sourceZ);
  return {
    coordinate: [round(worldX - 7040), round(16512 - worldZ)],
    elevation,
    mapId: formattedMapId,
    plane: area === 12 ? 'underground' : conversion.targetArea === 61 ? 'shadow' : 'surface',
  };
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

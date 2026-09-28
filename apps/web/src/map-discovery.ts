import {
  type MapDiscoveryDefinition,
  type MapPlane,
  type MapRegionLabelDefinition,
  type MarkerCatalog,
  type MarkerCatalogEntry,
} from './dataset';
import { MarkerStateCode } from './marker-state';
import { projectSaveMapPoint } from './save-map-position';
import type { ParsedSlotSummary } from './save-parser-protocol';
import { surfaceFogCellRevealed } from './surface-fog';

export type MapDisplayMode = 'complete' | 'exploration';
export type ExplorationMarkerVisibility = 'region' | 'collected-outside' | 'hidden';

export const MAP_DISCOVERY_EVENT_FLAGS = [
  62004, 62005, 62006, 62007, 62008, 62009,
  62010, 62011, 62012,
  62020, 62021, 62022,
  62030, 62031, 62032,
  62040, 62041,
  62050, 62051, 62052,
  62060, 62061, 62062, 62063, 62064,
  62080, 62081, 62082, 62083, 62084,
] as const;

export interface MapDiscoveryContext {
  mode: MapDisplayMode;
  definition?: MapDiscoveryDefinition;
  hasSave: boolean;
  gridSize: number;
  openFlags: ReadonlySet<number>;
  visitedPrefixes: ReadonlySet<number>;
  fogRevealBytes?: Uint8Array;
  tileMasks: ReadonlyMap<MapPlane, ReadonlyMap<number, number>>;
  markerMasks?: readonly number[];
  supportedMasks: ReadonlyMap<MapPlane, number>;
  openMasks: ReadonlyMap<MapPlane, number>;
  visitedMasks: ReadonlyMap<MapPlane, number>;
}

export interface CategoryMapCount {
  visible: number;
  collectedOutside: number;
}

const mapIdForPlane: Record<MapPlane, 'M00' | 'M01' | 'M10'> = {
  surface: 'M00',
  underground: 'M01',
  shadow: 'M10',
};

export function createMapDiscoveryContext(
  catalog: MarkerCatalog,
  slot: ParsedSlotSummary | undefined,
  mode: MapDisplayMode,
): MapDiscoveryContext {
  const definition = catalog.mapTileManifest?.discovery;
  const openFlags = new Set(slot?.mapDiscovery.openEventFlagIds ?? []);
  const visitedPrefixes = new Set((slot?.mapDiscovery.visitedRegionIds ?? []).map(regionVisitPrefix));
  const tileMasks = new Map<MapPlane, ReadonlyMap<number, number>>();
  const supportedMasks = new Map<MapPlane, number>();
  const openMasks = new Map<MapPlane, number>();
  const visitedMasks = new Map<MapPlane, number>();

  for (const plane of ['surface', 'underground', 'shadow'] as const) {
    tileMasks.set(plane, new Map(definition?.tiles[mapIdForPlane[plane]] ?? []));
    let supportedMask = 0;
    let openMask = 0;
    let visitedMask = 0;
    for (const piece of definition?.pieces.filter((candidate) => candidate.plane === plane) ?? []) {
      supportedMask |= piece.maskBit;
      if (openFlags.has(piece.openEventFlagId)) openMask |= piece.maskBit;
      if (piece.visitPrefixes.some((prefix) => visitedPrefixes.has(prefix))) visitedMask |= piece.maskBit;
    }
    supportedMasks.set(plane, supportedMask);
    openMasks.set(plane, openMask);
    visitedMasks.set(plane, visitedMask);
  }

  return {
    mode,
    definition,
    hasSave: Boolean(slot),
    gridSize: catalog.coordinateSystem.mapFrame.xyzSpan,
    openFlags,
    visitedPrefixes,
    fogRevealBytes: slot?.mapDiscovery.fogRevealBytes,
    tileMasks,
    markerMasks: definition?.markerMasksByProfile?.[catalog.profile],
    supportedMasks,
    openMasks,
    visitedMasks,
  };
}

export function explorationMarkerVisibility(
  context: MapDiscoveryContext,
  marker: MarkerCatalogEntry,
  markerIndex: number,
  markerStates: Uint8Array | undefined,
): ExplorationMarkerVisibility {
  if (context.mode === 'complete' || !context.hasSave || !context.definition || !marker.mapPosition) return 'region';
  const mask = context.markerMasks
    ? (context.markerMasks[markerIndex] ?? 0)
    : markerTileMask(context, marker);
  const supported = mask & (context.supportedMasks.get(marker.plane) ?? 0);
  if (supported === 0 || (supported & (context.openMasks.get(marker.plane) ?? 0)) !== 0) return 'region';
  if (
    marker.category === 'WorldMaps'
    && (supported & (context.visitedMasks.get(marker.plane) ?? 0)) !== 0
    && markerFogCellVisited(context, marker)
  ) return 'region';
  if (markerStates?.[markerIndex] === MarkerStateCode.COLLECTED) return 'collected-outside';
  return 'hidden';
}

export function categoryMapCounts(
  catalog: MarkerCatalog,
  slot: ParsedSlotSummary | undefined,
  context: MapDiscoveryContext,
  capitalState: 'royal' | 'ashen',
  visiblePlanes?: ReadonlySet<MapPlane>,
): ReadonlyMap<string, CategoryMapCount> {
  const counts = new Map<string, CategoryMapCount>();
  catalog.markers.forEach((marker, markerIndex) => {
    if (
      !marker.mapPosition
      || (visiblePlanes && !visiblePlanes.has(marker.plane))
      || (marker.capitalState && marker.capitalState !== capitalState)
    ) return;
    const visibility = explorationMarkerVisibility(context, marker, markerIndex, slot?.markerStates);
    if (visibility === 'hidden') return;
    const count = counts.get(marker.category) ?? { visible: 0, collectedOutside: 0 };
    if (visibility === 'collected-outside') count.collectedOutside += 1;
    else count.visible += 1;
    counts.set(marker.category, count);
  });
  return counts;
}

export function availableMapPlanes(
  catalog: MarkerCatalog,
  slot: ParsedSlotSummary | undefined,
  context: MapDiscoveryContext,
  allowShadow: boolean,
): ReadonlySet<MapPlane> {
  if (context.mode === 'complete' || !slot || !context.definition) {
    return new Set<MapPlane>(allowShadow ? ['surface', 'underground', 'shadow'] : ['surface', 'underground']);
  }
  const available = new Set<MapPlane>(['surface']);
  const playerPlane = projectSaveMapPoint(slot.playerPosition, catalog.legacyConversions)?.plane;
  if (playerPlane && (playerPlane !== 'shadow' || allowShadow)) available.add(playerPlane);
  for (const plane of ['underground', 'shadow'] as const) {
    if (plane === 'shadow' && !allowShadow) continue;
    if ((context.openMasks.get(plane) ?? 0) !== 0 || (context.visitedMasks.get(plane) ?? 0) !== 0) {
      available.add(plane);
      continue;
    }
    const hasCollectedMarker = catalog.markers.some((marker, markerIndex) => (
      marker.plane === plane && slot.markerStates[markerIndex] === MarkerStateCode.COLLECTED
    ));
    if (hasCollectedMarker) available.add(plane);
  }
  return available;
}

export function visibleRegionLabels(
  context: MapDiscoveryContext,
  plane: MapPlane,
): MapRegionLabelDefinition[] {
  const labels = context.definition?.regionLabels.filter((label) => label.plane === plane) ?? [];
  if (context.mode === 'complete' || !context.hasSave) return labels;
  return labels.filter((label) => context.openFlags.has(label.openEventFlagId));
}

/** 用地图碎片的正式 MTMSK 判断一个静态官方点是否位于已揭示区域。 */
export function explorationCoordinateVisible(
  context: MapDiscoveryContext,
  plane: MapPlane,
  coordinate: readonly [number, number],
): boolean {
  if (context.mode === 'complete' || !context.hasSave || !context.definition) return true;
  const mask = coordinateTileMask(context, plane, coordinate);
  const supported = mask & (context.supportedMasks.get(plane) ?? 0);
  return supported === 0 || (supported & (context.openMasks.get(plane) ?? 0)) !== 0;
}

function markerTileMask(context: MapDiscoveryContext, marker: MarkerCatalogEntry): number {
  if (!marker.mapPosition) return 0;
  return coordinateTileMask(context, marker.plane, marker.mapPosition.coordinate);
}

function coordinateTileMask(
  context: MapDiscoveryContext,
  plane: MapPlane,
  coordinate: readonly [number, number],
): number {
  const [x, y] = coordinate;
  const col = Math.floor(x / 256);
  // 游戏 MTMSK / 地图纹理的行号向北递增，而项目地图画布的 Y 向南
  // 递增。地图渲染器在拼接 DDS 时做了同一转换；标记过滤必须保持一致，
  // 否则南方已揭示碎片会错误地放出北方未揭示区域的标记。
  const row = context.gridSize - 1 - Math.floor(y / 256);
  return context.tileMasks.get(plane)?.get(col * 100 + row) ?? 0;
}

/**
 * 存档迷雾块的第一张位图是地表 40×41 个 128 世界单位探索格，LSB 优先。地区访问表只
 * 能说明玩家进入过某个大区；地图碎片图标还必须落在已经探索的格子内，
 * 否则相邻子区（例如利耶尼亚西部、王城）会被同一大区前缀提前放出。
 * 其他平面的位图索引尚未完全确认，因此暂时沿用地区访问证据。
 */
function markerFogCellVisited(context: MapDiscoveryContext, marker: MarkerCatalogEntry): boolean {
  if (marker.plane !== 'surface' || !marker.mapPosition || !context.fogRevealBytes) return true;
  return surfaceFogCellRevealed(context.fogRevealBytes, marker.mapPosition.coordinate);
}

function regionVisitPrefix(regionId: number): number {
  return Math.floor(regionId / 1000);
}

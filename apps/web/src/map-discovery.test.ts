import { describe, expect, it } from 'vitest';
import type { MapPlane, MarkerCatalog, MarkerCatalogEntry } from './dataset';
import {
  availableMapPlanes,
  categoryMapCounts,
  createMapDiscoveryContext,
  explorationCoordinateVisible,
  explorationMarkerVisibility,
  visibleRegionLabels,
} from './map-discovery';
import { MarkerStateCode } from './marker-state';
import type { ParsedSlotSummary } from './save-parser-protocol';

const marker = (
  id: number,
  plane: MapPlane,
  coordinate: [number, number],
  category = 'loot',
): MarkerCatalogEntry => ({
  id,
  category,
  group: 'world',
  iconId: 0,
  area: 60,
  gridX: 0,
  gridZ: 0,
  position: [0, 0, 0],
  mapPosition: { coordinate, targetArea: 60 },
  plane,
  displayFlag: 0,
  collectionFlags: [],
  geomSlot: -1,
  lotId: 0,
  lotType: 0,
  textIds: [],
  trackable: false,
});

const catalog: MarkerCatalog = {
  schemaVersion: 1,
  profile: 'vanilla',
  coordinateSystem: {
    id: 'elden-ring-world-map-v1',
    description: 'test',
    mapFrame: {
      bounds: [0, 0, 512, 512],
      tileSize: 256,
      xyzZoom: 6,
      xyzOrigin: [0, 0],
      xyzSpan: 41,
    },
  },
  markerCount: 3,
  mappedMarkerCount: 3,
  extent: [0, 0, 512, 512],
  legacyConversions: [],
  markers: [
    marker(1, 'surface', [300, 300]),
    marker(2, 'surface', [300, 300]),
    marker(3, 'underground', [300, 300]),
  ],
  categoryCatalog: {
    schemaVersion: 1,
    profile: 'vanilla',
    locales: ['zh-CN'],
    sections: [],
    categories: [],
  },
  mapTileManifest: {
    schemaVersion: 1,
    game: 'elden-ring',
    format: 'webp',
    tileSize: 256,
    minZoom: 0,
    maxZoom: 6,
    projection: {
      coordinateSystemId: 'elden-ring-world-map-v1',
      gameBounds: [0, 0, 512, 512],
      xyzOrigin: [0, 0],
      xyzSpan: 2,
    },
    maps: [],
    discovery: {
      hiddenTileTemplates: { M00: 'hidden/M00', M01: 'hidden/M01', M10: 'hidden/M10' },
      pieces: [
        {
          id: 'surface-piece', plane: 'surface', worldMapPieceId: 0, maskBit: 1, openEventFlagId: 62010,
          acquisitionEventFlagId: 63010, visitPrefixes: [1000], tileTemplate: 'piece/0',
        },
        {
          id: 'surface-piece-2', plane: 'surface', worldMapPieceId: 1, maskBit: 2, openEventFlagId: 62011,
          acquisitionEventFlagId: 63011, visitPrefixes: [1001], tileTemplate: 'piece/1',
        },
        {
          id: 'underground-piece', plane: 'underground', worldMapPieceId: 100, maskBit: 1, openEventFlagId: 62060,
          acquisitionEventFlagId: 63060, visitPrefixes: [1200], tileTemplate: 'piece/100',
        },
      ],
      tiles: { M00: [[139, 3], [239, 3]], M01: [[139, 1]], M10: [] },
      regionLabels: [{
        id: 'surface-label',
        plane: 'surface',
        placeNameId: 100,
        worldMapPieceId: 0,
        position: [300, 300],
        openEventFlagId: 62010,
        labels: { 'zh-CN': '测试地区' },
      }],
    },
  },
};

const slot = (states: number[], openFlags: number[] = [], visitedRegions: number[] = []): ParsedSlotSummary => ({
  index: 0,
  name: 'test',
  level: 1,
  secondsPlayed: 0,
  version: 251,
  eventFlagBytes: 1,
  playerPosition: { mapId: [0, 0, 0, 0], coordinates: [0, 0, 0] },
  bloodstain: { mapId: [0, 0, 0, 0], coordinates: [0, 0, 0], runes: 0 },
  markerStates: Uint8Array.from(states),
  officialMarkerStates: new Uint8Array(),
  officialTextStates: new Uint8Array(),
  counts: { available: 0, collected: 0, locked: 0, unknown: 0, trackable: 0 },
  fastTravel: { restricted: false },
  dlcEvidence: 'NONE',
  mapDiscovery: { openEventFlagIds: openFlags, visitedRegionIds: visitedRegions, fogRevealBytes: new Uint8Array(205) },
});

describe('存档探索地图', () => {
  it('分类数量区分已揭示标记和未揭示地区内的已完成标记', () => {
    const parsedSlot = slot([
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.COLLECTED,
      MarkerStateCode.COLLECTED,
    ]);
    const context = createMapDiscoveryContext(catalog, parsedSlot, 'exploration');
    const counts = categoryMapCounts(
      catalog,
      parsedSlot,
      context,
      'royal',
      new Set<MapPlane>(['surface']),
    );

    expect(counts.get('loot')).toEqual({ visible: 0, collectedOutside: 1 });
  });

  it('静态官方点也要经过地图碎片可见性过滤', () => {
    const hidden = createMapDiscoveryContext(catalog, slot([], []), 'exploration');
    const opened = createMapDiscoveryContext(catalog, slot([], [62010]), 'exploration');
    expect(explorationCoordinateVisible(hidden, 'surface', [300, 300])).toBe(false);
    expect(explorationCoordinateVisible(opened, 'surface', [300, 300])).toBe(true);
  });

  it('地图层按钮随存档进度显示，已完成标记可使未揭示平面保持可访问', () => {
    const withoutUnderground = slot([
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.AVAILABLE,
    ]);
    const withCollectedUnderground = slot([
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.COLLECTED,
    ]);

    expect([...availableMapPlanes(
      catalog,
      withoutUnderground,
      createMapDiscoveryContext(catalog, withoutUnderground, 'exploration'),
      false,
    )]).toEqual(['surface']);
    expect([...availableMapPlanes(
      catalog,
      withCollectedUnderground,
      createMapDiscoveryContext(catalog, withCollectedUnderground, 'exploration'),
      false,
    )]).toEqual(['surface', 'underground']);
  });

  it('角色当前位置可使尚未揭示的地图层保持可访问', () => {
    const undergroundPlayer = slot([
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.AVAILABLE,
    ]);
    undergroundPlayer.playerPosition = { mapId: [12, 1, 0, 0], coordinates: [410, 8, -100] };
    const catalogWithLegacyMap = {
      ...catalog,
      legacyConversions: [{
        sourceArea: 12,
        sourceGridX: 1,
        sourceX: 400,
        sourceZ: -120,
        targetArea: 60,
        targetGridX: 38,
        targetGridZ: 46,
        targetX: 89,
        targetZ: 77,
      }],
    } satisfies MarkerCatalog;

    expect([...availableMapPlanes(
      catalogWithLegacyMap,
      undergroundPlayer,
      createMapDiscoveryContext(catalogWithLegacyMap, undergroundPlayer, 'exploration'),
      false,
    )]).toEqual(['surface', 'underground']);
  });

  it('地区文字严格跟随 WorldMapPiece 的开放旗标，访问记录不会提前显示文字', () => {
    const parsedSlot = slot([], [], [1_000_123]);
    const context = createMapDiscoveryContext(catalog, parsedSlot, 'exploration');
    expect(visibleRegionLabels(context, 'surface')).toEqual([]);

    const opened = createMapDiscoveryContext(catalog, slot([], [62010]), 'exploration');
    expect(visibleRegionLabels(opened, 'surface').map(({ id }) => id)).toEqual(['surface-label']);
  });

  it('优先使用构建期逐标记采样掩码，不被同一 L0 瓦片内的相邻碎片误放行', () => {
    catalog.mapTileManifest!.discovery!.markerMasksByProfile = { vanilla: [2, 1, 1] };
    const parsedSlot = slot([
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.AVAILABLE,
    ], [62010]);
    const counts = categoryMapCounts(
      catalog,
      parsedSlot,
      createMapDiscoveryContext(catalog, parsedSlot, 'exploration'),
      'royal',
      new Set<MapPlane>(['surface']),
    );

    expect(counts.get('loot')).toEqual({ visible: 1, collectedOutside: 0 });
    delete catalog.mapTileManifest!.discovery!.markerMasksByProfile;
  });

  it('分别显示每个已探索格中的地图碎片，而不是只放出单个固定图标', () => {
    const worldMapCatalog = {
      ...catalog,
      markers: catalog.markers.map((entry, index) => {
        if (index === 0) return {
          ...entry,
          category: 'WorldMaps',
          mapPosition: { ...entry.mapPosition!, coordinate: [4105.955, 6528.433] as [number, number] },
        };
        if (index === 1) return {
          ...entry,
          category: 'WorldMaps',
          mapPosition: { ...entry.mapPosition!, coordinate: [4032, 6464] as [number, number] },
        };
        return entry;
      }),
      mapTileManifest: {
        ...catalog.mapTileManifest!,
        discovery: {
          ...catalog.mapTileManifest!.discovery!,
          markerMasksByProfile: { vanilla: [1, 1, 1] },
        },
      },
    } satisfies MarkerCatalog;
    const parsedSlot = slot([
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.AVAILABLE,
      MarkerStateCode.AVAILABLE,
    ], [], [1_000_123]);

    const hiddenContext = createMapDiscoveryContext(worldMapCatalog, parsedSlot, 'exploration');
    expect(explorationMarkerVisibility(hiddenContext, worldMapCatalog.markers[0], 0, parsedSlot.markerStates)).toBe('hidden');
    expect(explorationMarkerVisibility(hiddenContext, worldMapCatalog.markers[1], 1, parsedSlot.markerStates)).toBe('hidden');

    // 实测锚点 [4106, 6528] => 地表探索格 row=10, col=32，LSB 优先。
    const bitIndex = 10 * 40 + 32;
    parsedSlot.mapDiscovery.fogRevealBytes[bitIndex >>> 3] |= 1 << (bitIndex & 7);
    const visitedContext = createMapDiscoveryContext(worldMapCatalog, parsedSlot, 'exploration');
    expect(explorationMarkerVisibility(visitedContext, worldMapCatalog.markers[0], 0, parsedSlot.markerStates)).toBe('region');
    expect(explorationMarkerVisibility(visitedContext, worldMapCatalog.markers[1], 1, parsedSlot.markerStates)).toBe('hidden');

    // 相邻的 bit 391 需要独立揭示第二个碎片，证明并非只为 #8607 特判。
    parsedSlot.mapDiscovery.fogRevealBytes[391 >>> 3] |= 1 << (391 & 7);
    const secondVisitedContext = createMapDiscoveryContext(worldMapCatalog, parsedSlot, 'exploration');
    expect(explorationMarkerVisibility(secondVisitedContext, worldMapCatalog.markers[1], 1, parsedSlot.markerStates)).toBe('region');
  });
});

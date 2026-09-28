import { describe, expect, it } from 'vitest';
import type { MarkerCatalogEntry } from './dataset';
import { selectVisibleMarkers } from './marker-render-set';
import type { MapDiscoveryContext } from './map-discovery';
import { MarkerStateCode } from './marker-state';

const baseMarker: MarkerCatalogEntry = {
  id: 1,
  category: 'test',
  group: 'world',
  iconId: 0,
  area: 60,
  gridX: 0,
  gridZ: 0,
  position: [0, 0, 0],
  mapPosition: { coordinate: [0, 0], targetArea: 60 },
  plane: 'surface',
  displayFlag: 0,
  collectionFlags: [],
  geomSlot: -1,
  lotId: 0,
  lotType: 0,
  textIds: [],
  trackable: false,
  capitalState: undefined,
};

describe('selectVisibleMarkers', () => {
  it('只返回当前平面、可见分类且具有地图坐标的标记', () => {
    const markers: MarkerCatalogEntry[] = [
      baseMarker,
      { ...baseMarker, id: 2, category: 'visible', group: 'key-items' },
      { ...baseMarker, id: 3, plane: 'underground' },
      { ...baseMarker, id: 4, mapPosition: null },
    ];

    const selected = selectVisibleMarkers(markers, 'surface', new Set(['visible']), 'royal');

    expect(selected.map(({ marker, markerIndex }) => [marker.id, markerIndex])).toEqual([[2, 1]]);
  });

  it('只显示当前王城形态的标记', () => {
    const markers: MarkerCatalogEntry[] = [
      { ...baseMarker, id: 10, capitalState: 'royal' },
      { ...baseMarker, id: 11, capitalState: 'ashen' },
      { ...baseMarker, id: 12 },
    ];

    expect(selectVisibleMarkers(markers, 'surface', new Set(['test']), 'ashen')
      .map(({ marker }) => marker.id)).toEqual([11, 12]);
  });

  it('探索地图隐藏未揭示地区，但保留其中已完成的标记', () => {
    const marker = {
      ...baseMarker,
      mapPosition: { coordinate: [300, 300] as [number, number], targetArea: 60 },
    };
    const context: MapDiscoveryContext = {
      mode: 'exploration',
      hasSave: true,
      gridSize: 2,
      definition: {
        hiddenTileTemplates: { M00: 'hidden/M00', M01: 'hidden/M01', M10: 'hidden/M10' },
        pieces: [{
          id: 'test', plane: 'surface', worldMapPieceId: 0, maskBit: 1, openEventFlagId: 62010,
          acquisitionEventFlagId: 63010, visitPrefixes: [], tileTemplate: 'piece/0',
        }],
        tiles: { M00: [[100, 1]], M01: [], M10: [] },
        regionLabels: [],
      },
      openFlags: new Set(),
      visitedPrefixes: new Set(),
      tileMasks: new Map([['surface', new Map([[100, 1]])]]),
      supportedMasks: new Map([['surface', 1]]),
      openMasks: new Map([['surface', 0]]),
      visitedMasks: new Map([['surface', 0]]),
    };

    expect(selectVisibleMarkers([marker], 'surface', new Set(['test']), 'royal', context, new Uint8Array([MarkerStateCode.AVAILABLE])))
      .toHaveLength(0);
    expect(selectVisibleMarkers([marker], 'surface', new Set(['test']), 'royal', context, new Uint8Array([MarkerStateCode.COLLECTED])))
      .toHaveLength(1);
  });

  it('按游戏纹理向北递增的行号匹配地图碎片', () => {
    const southernMarker = {
      ...baseMarker,
      id: 20,
      mapPosition: { coordinate: [300, 300] as [number, number], targetArea: 60 },
    };
    const northernMarker = {
      ...baseMarker,
      id: 21,
      mapPosition: { coordinate: [300, 100] as [number, number], targetArea: 60 },
    };
    const context: MapDiscoveryContext = {
      mode: 'exploration',
      hasSave: true,
      gridSize: 2,
      definition: {
        hiddenTileTemplates: { M00: 'hidden/M00', M01: 'hidden/M01', M10: 'hidden/M10' },
        pieces: [],
        tiles: { M00: [[100, 1], [101, 2]], M01: [], M10: [] },
        regionLabels: [],
      },
      openFlags: new Set([62010]),
      visitedPrefixes: new Set(),
      tileMasks: new Map([['surface', new Map([[100, 1], [101, 2]])]]),
      supportedMasks: new Map([['surface', 3]]),
      openMasks: new Map([['surface', 1]]),
      visitedMasks: new Map([['surface', 0]]),
    };

    expect(selectVisibleMarkers(
      [southernMarker, northernMarker],
      'surface',
      new Set(['test']),
      'royal',
      context,
      new Uint8Array([MarkerStateCode.AVAILABLE, MarkerStateCode.AVAILABLE]),
    ).map(({ marker }) => marker.id)).toEqual([20]);
  });
});

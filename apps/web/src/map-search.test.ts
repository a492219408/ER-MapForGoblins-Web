import { describe, expect, it } from 'vitest';
import { searchMapContent } from './map-search';
import { createMapDiscoveryContext } from './map-discovery';
import type { MarkerCatalog } from './dataset';

const catalog = {
  coordinateSystem: { id: 'elden-ring-world-map-v1', description: 'test', mapFrame: { xMin: 0, zMin: 0, xyzSpan: 100 } },
  categoryCatalog: {
    schemaVersion: 1,
    profile: 'vanilla',
    sections: [],
    categories: [{
      id: 'WorldGraces', section: 'world', markerCount: 1,
      labels: { 'zh-CN': '赐福点', en: 'Sites of Grace' },
      descriptions: { 'zh-CN': '赐福' },
    }],
  },
  markers: [{
    id: 610003, category: 'WorldGraces', group: 'world', iconId: 1,
    area: 60, gridX: 10, gridZ: 0, position: [10, 0, 20],
    mapPosition: { coordinate: [10, 20], targetArea: 60 }, plane: 'surface',
    displayFlag: 0, collectionFlags: [], geomSlot: -1, lotId: 0, lotType: 0,
    textIds: [100], trackable: false,
  }],
  markerTextCatalog: {
    schemaVersion: 1, game: 'elden-ring', encoding: 'map-for-goblins-fmg-offset-v1',
    locales: ['zh-CN'], requestedTextIdCount: 1,
    entries: { '100': { encodedId: 100, sourceId: 100, table: 'PlaceName', kind: 'place', labels: { 'zh-CN': '引导之始' } } },
  },
  officialMapCatalog: {
    schemaVersion: 1, game: 'elden-ring', coordinateSystemId: 'elden-ring-world-map-v1',
    locales: ['zh-CN'], markerCount: 1, mappedMarkerCount: 1, textStateCount: 0, npcEntityCount: 0,
    iconSprite: { path: '', cellSize: 64, worldMapFrameCount: 1, keys: [] },
    markers: [{
      id: 1011001692, paramdexName: 'Sending Gate', labels: { 'zh-CN': '传送门' }, iconId: 0,
      iconKey: 'supplemental-sending-gate', alternateIconId: 0, angle: 0, area: 11, gridX: 0, gridZ: 0,
      position: [30, 0, 40], mapPosition: { coordinate: [30, 40], targetArea: 60 }, plane: 'surface',
      openEventFlagId: 0, clearedEventFlagId: 0, showWithoutText: true, isAreaIcon: false,
      displayMasks: [0, 0, 0], minZoomStep: 0, entryFEType: 0, textSlots: [], zPriority: 0,
    }],
  },
} as unknown as MarkerCatalog;

const completeDiscovery = createMapDiscoveryContext(catalog, undefined, 'complete');

describe('searchMapContent', () => {
  it('searches catalog markers by localized name and ID', () => {
    expect(searchMapContent(catalog, { locale: 'zh-CN', query: '引导之始 610003', discovery: completeDiscovery }))
      .toMatchObject([{ source: 'catalog', id: 610003, title: '引导之始' }]);
  });

  it('searches official markers without applying capital or visibility modes', () => {
    expect(searchMapContent(catalog, { locale: 'zh-CN', query: '#1011001692', discovery: completeDiscovery }))
      .toMatchObject([{ source: 'official', id: 1011001692, categoryLabel: '传送门' }]);
  });
});

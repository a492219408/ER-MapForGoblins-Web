import {
  localizedText,
  type MapPlane,
  type MarkerCatalog,
  type MarkerCatalogEntry,
  type OfficialMapMarker,
} from './dataset';
import {
  explorationCoordinateVisible,
  explorationMarkerVisibility,
  type MapDiscoveryContext,
} from './map-discovery';
import { isGuidanceOfGrace, isNpcMarker, isSendingGate, officialMarkerTitle } from './official-marker-render';

export type MapSearchSource = 'catalog' | 'official';

export interface MapSearchResult {
  key: string;
  source: MapSearchSource;
  markerIndex: number;
  id: number;
  title: string;
  category: string;
  categoryLabel: string;
  plane: MapPlane;
  area: number;
  gridX: number;
  gridZ: number;
  coordinate: [number, number];
}

export interface MapFocusRequest {
  result: MapSearchResult;
  requestId: number;
}

interface MapSearchOptions {
  locale: string;
  query: string;
  discovery: MapDiscoveryContext;
  markerStates?: Uint8Array;
  officialTextStates?: Uint8Array;
}

export function searchMapContent(catalog: MarkerCatalog, options: MapSearchOptions): MapSearchResult[] {
  const terms = normalizedTerms(options.query);
  if (terms.length === 0) return [];
  const categoryLabels = new Map(catalog.categoryCatalog.categories.map((category) => [
    category.id,
    localizedText(category.labels, options.locale),
  ]));
  const results: MapSearchResult[] = [];

  catalog.markers.forEach((marker, markerIndex) => {
    if (!marker.mapPosition) return;
    if (explorationMarkerVisibility(options.discovery, marker, markerIndex, options.markerStates) === 'hidden') return;
    const title = catalogMarkerTitle(marker, catalog, options.locale);
    const categoryLabel = categoryLabels.get(marker.category) ?? marker.category;
    const haystack = [
      title,
      marker.id,
      `#${marker.id}`,
      marker.category,
      categoryLabel,
      marker.group,
      marker.area,
      marker.gridX,
      marker.gridZ,
      ...marker.textIds,
      ...resolvedMarkerLabels(marker, catalog),
    ];
    if (!matchesAll(haystack, terms)) return;
    results.push(toCatalogResult(marker, markerIndex, title, categoryLabel, marker.mapPosition.coordinate));
  });

  (catalog.officialMapCatalog?.markers ?? []).forEach((marker, markerIndex) => {
    if (!marker.mapPosition || (marker.iconId <= 0 && !marker.iconKey)) return;
    if (!explorationCoordinateVisible(options.discovery, marker.plane, marker.mapPosition.coordinate)) return;
    const title = officialMarkerTitle(marker, options.locale, options.officialTextStates);
    const categoryLabel = officialCategoryLabel(marker);
    const haystack = [
      title,
      marker.id,
      `#${marker.id}`,
      marker.paramdexName,
      categoryLabel,
      marker.iconId,
      marker.iconKey ?? '',
      marker.area,
      marker.gridX,
      marker.gridZ,
      marker.source?.mapId ?? '',
      marker.source?.entityId ?? '',
      ...Object.values(marker.labels),
      ...marker.textSlots.flatMap((slot) => Object.values(slot.labels)),
    ];
    if (!matchesAll(haystack, terms)) return;
    results.push(toOfficialResult(marker, markerIndex, title, categoryLabel, marker.mapPosition.coordinate));
  });

  return results.sort((left, right) => (
    left.title.localeCompare(right.title, options.locale)
    || left.source.localeCompare(right.source)
    || left.id - right.id
  ));
}

function toCatalogResult(
  marker: MarkerCatalogEntry,
  markerIndex: number,
  title: string,
  categoryLabel: string,
  coordinate: [number, number],
): MapSearchResult {
  return {
    key: `catalog:${markerIndex}`,
    source: 'catalog',
    markerIndex,
    id: marker.id,
    title,
    category: marker.category,
    categoryLabel,
    plane: marker.plane,
    area: marker.area,
    gridX: marker.gridX,
    gridZ: marker.gridZ,
    coordinate,
  };
}

function toOfficialResult(
  marker: OfficialMapMarker,
  markerIndex: number,
  title: string,
  categoryLabel: string,
  coordinate: [number, number],
): MapSearchResult {
  return {
    key: `official:${markerIndex}`,
    source: 'official',
    markerIndex,
    id: marker.id,
    title,
    category: categoryLabel,
    categoryLabel,
    plane: marker.plane,
    area: marker.area,
    gridX: marker.gridX,
    gridZ: marker.gridZ,
    coordinate,
  };
}

function catalogMarkerTitle(marker: MarkerCatalogEntry, catalog: MarkerCatalog, locale: string): string {
  return marker.textIds
    .map((textId) => catalog.markerTextCatalog?.entries[String(textId)])
    .map((entry) => entry ? localizedText(entry.labels, locale) : '')
    .find(Boolean) ?? `标记 #${marker.id}`;
}

function resolvedMarkerLabels(marker: MarkerCatalogEntry, catalog: MarkerCatalog): string[] {
  return marker.textIds.flatMap((textId) => Object.values(catalog.markerTextCatalog?.entries[String(textId)]?.labels ?? {}));
}

function officialCategoryLabel(marker: OfficialMapMarker): string {
  if (isSendingGate(marker)) return '传送门';
  if (isGuidanceOfGrace(marker)) return '赐福的指引';
  if (isNpcMarker(marker)) return 'NPC';
  if (marker.isAreaIcon) return '地区与地点';
  return '官方地图标记';
}

function normalizedTerms(query: string): string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
}

function matchesAll(values: readonly unknown[], terms: readonly string[]): boolean {
  const haystack = values.map((value) => String(value).toLocaleLowerCase()).join('\n');
  return terms.every((term) => haystack.includes(term));
}

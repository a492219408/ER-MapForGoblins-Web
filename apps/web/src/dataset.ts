import type { GameRelease } from './game-release';
import { resolveAssetBases } from './asset-base';

export type MarkerGroup = 'equipment' | 'key-items' | 'collectibles' | 'world';
export type MapPlane = 'surface' | 'underground' | 'shadow';
export type DatasetProfile =
  | 'err'
  | 'vanilla'
  | 'convergence2'
  | 'convergence3'
  | 'erte'
  | 'goldenage'
  | 'goldenage363'
  | 'vins'
  | 'reborn'
  | 'graceborne';

export const DATASET_PROFILES: readonly DatasetProfile[] = [
  'err', 'vanilla', 'convergence2', 'convergence3', 'erte',
  'goldenage', 'goldenage363', 'vins', 'reborn', 'graceborne',
];

export interface DatasetIndex {
  schemaVersion: 1;
  defaultProfile: DatasetProfile;
  profiles: Array<{ id: DatasetProfile; manifestPath: string }>;
}

export interface MarkerCatalogEntry {
  id: number;
  category: string;
  group: MarkerGroup;
  iconId: number;
  area: number;
  gridX: number;
  gridZ: number;
  position: [number, number, number];
  mapPosition: { coordinate: [number, number]; targetArea: number } | null;
  plane: MapPlane;
  displayFlag: number;
  collectionFlags: number[];
  geomSlot: number;
  lotId: number;
  lotType: number;
  textIds: number[];
  trackable: boolean;
  capitalState?: 'royal' | 'ashen';
}

export interface LegacyMapConversion {
  sourceArea: number;
  sourceGridX: number;
  sourceX: number;
  sourceZ: number;
  targetArea: number;
  targetGridX: number;
  targetGridZ: number;
  targetX: number;
  targetZ: number;
}

export type LocalizedText = Record<string, string>;

export interface MarkerTextEntry {
  encodedId: number;
  sourceId: number;
  table: string;
  kind: 'weapon' | 'armour' | 'talisman' | 'ash-of-war' | 'goods'
    | 'npc' | 'enemy' | 'enemy-type' | 'interaction' | 'place';
  labels: LocalizedText;
}

export interface MarkerTextCatalog {
  schemaVersion: 1;
  game: 'elden-ring';
  encoding: 'map-for-goblins-fmg-offset-v1';
  locales: string[];
  requestedTextIdCount: number;
  resolvedTextIdCount: number;
  entries: Record<string, MarkerTextEntry>;
}

export interface MapCoordinateFrame {
  bounds: [number, number, number, number];
  tileSize: 256;
  xyzZoom: 6;
  xyzOrigin: [number, number];
  xyzSpan: 41;
}

export interface MapTileDefinition {
  id: 'M00' | 'M01' | 'M10';
  plane: MapPlane;
  name: string;
  order: number;
  tileTemplate: string;
}

export interface MapDiscoveryPiece {
  id: string;
  plane: MapPlane;
  worldMapPieceId: number;
  maskBit: number;
  openEventFlagId: number;
  acquisitionEventFlagId: number;
  visitPrefixes: number[];
  tileTemplate: string;
}

export interface MapRegionLabelDefinition {
  id: string;
  plane: MapPlane;
  placeNameId: number;
  worldMapPieceId: number;
  position: [number, number];
  openEventFlagId: number;
  labels: LocalizedText;
}

export interface MapDiscoveryDefinition {
  hiddenTileTemplates: Record<'M00' | 'M01' | 'M10', string>;
  pieces: MapDiscoveryPiece[];
  /** L0 瓦片 ID（col * 100 + row）及官方 MTMSK 位掩码。 */
  tiles: Record<'M00' | 'M01' | 'M10', Array<[number, number]>>;
  /**
   * 构建期在各官方地图碎片差分纹理上逐点采样得到的标记归属位掩码。
   * 数组索引与对应 profile 的 marker catalog 保持一致。
   */
  markerMasksByProfile?: Partial<Record<DatasetProfile, number[]>>;
  regionLabelFont?: {
    family: 'GR-FZShuSong-Z01';
    path: string;
  };
  regionLabels: MapRegionLabelDefinition[];
}

export interface MapTileManifest {
  schemaVersion: 1;
  game: 'elden-ring';
  format: 'webp';
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  processing?: {
    seamMode: 'native' | 'optimized';
    seamRadius?: number;
    seamStrength?: number;
  };
  projection: {
    coordinateSystemId: 'elden-ring-world-map-v1';
    gameBounds: [number, number, number, number];
    xyzOrigin: [number, number];
    xyzSpan: number;
  };
  maps: MapTileDefinition[];
  discovery?: MapDiscoveryDefinition;
}

export interface MarkerCategorySection {
  id: string;
  labels: LocalizedText;
}

export interface MarkerCategoryDefinition {
  id: string;
  configKey: string;
  section: string;
  group: MarkerGroup;
  markerCount: number;
  labels: LocalizedText;
  descriptions: LocalizedText;
}

export interface CategoryCatalog {
  schemaVersion: 1;
  profile: DatasetProfile;
  locales: string[];
  sections: MarkerCategorySection[];
  categories: MarkerCategoryDefinition[];
}

export type OfficialMapTextKind = 'place' | 'npc';

export interface OfficialMapFlagPredicate {
  enabledFlagIds: number[];
  disabledFlagIds: number[];
}

export interface OfficialMapTextSlot {
  slot: number;
  textStateIndex: number;
  textId: number;
  kind: OfficialMapTextKind;
  labels: LocalizedText;
  enableFlagId: number;
  disableFlagId: number;
  secondaryEnableFlagId: number;
  secondaryDisableFlagId: number;
  /**
   * WorldMapPointParam 的四个固定旗标不足以表达部分任务 NPC 的当前位置。
   * 每一项为一组 AND 条件，数组之间为 OR；省略时完全沿用原参数语义。
   */
  activeWhenAny?: OfficialMapFlagPredicate[];
}

export interface OfficialMapMarker {
  id: number;
  paramdexName: string;
  labels: LocalizedText;
  iconId: number;
  /** 项目自有精灵键；用于游戏没有合适地图图标的补充点。 */
  iconKey?: string;
  alternateIconId: number;
  angle: number;
  area: number;
  gridX: number;
  gridZ: number;
  position: [number, number, number];
  mapPosition: { coordinate: [number, number]; targetArea: number } | null;
  plane: MapPlane;
  openEventFlagId: number;
  clearedEventFlagId: number;
  /**
   * 可交互状态的专用事件条件。传送门的开放条件与地图文字可见条件并不
   * 等价；数组内为 OR，每一项内部仍为 AND。
   */
  availableWhenAny?: OfficialMapFlagPredicate[];
  showWithoutText: boolean;
  isAreaIcon: boolean;
  displayMasks: [number, number, number];
  minZoomStep: number;
  entryFEType: number;
  textSlots: OfficialMapTextSlot[];
  zPriority: number;
  capitalState?: 'royal' | 'ashen';
  source?: {
    kind: 'world-map-param' | 'msb-npc-event' | 'msb-asset';
    mapId?: string;
    entityId?: number;
    eventId?: number;
  };
}

export interface OfficialMapCatalog {
  schemaVersion: 1;
  game: 'elden-ring';
  coordinateSystemId: 'elden-ring-world-map-v1';
  locales: string[];
  markerCount: number;
  mappedMarkerCount: number;
  textStateCount: number;
  npcEntityCount: number;
  iconSprite: {
    /** MapLibre sprite 的无扩展名资源路径；客户端会读取同名 .json / .png。 */
    path: string;
    cellSize: number;
    worldMapFrameCount: number;
    /** 由 MapForGoblins 图标注册表生成的分类图标数量。 */
    mfgIconCount?: number;
    keys: string[];
  };
  markers: OfficialMapMarker[];
}

interface MarkerCatalogResource {
  schemaVersion: 1;
  profile: DatasetProfile;
  coordinateSystem: {
    id: 'elden-ring-world-map-v1';
    description: string;
    mapFrame: MapCoordinateFrame;
  };
  markerCount: number;
  mappedMarkerCount: number;
  extent: [number, number, number, number];
  legacyConversions: LegacyMapConversion[];
  markers: MarkerCatalogEntry[];
}

export interface MarkerCatalog extends MarkerCatalogResource {
  gameRelease?: GameRelease;
  categoryCatalog: CategoryCatalog;
  mapTileManifest?: MapTileManifest;
  officialMapCatalog?: OfficialMapCatalog;
  markerTextCatalog?: MarkerTextCatalog;
}

interface DatasetManifest {
  schemaVersion: 1;
  profile: DatasetProfile;
  gameRelease?: GameRelease;
  resources: {
    markerCatalog: {
      path: string;
      schemaVersion: 1;
    };
    categoryCatalog: {
      path: string;
      schemaVersion: 1;
    };
    mapTiles?: {
      path: string;
      schemaVersion: 1;
    };
    officialMap?: {
      path: string;
      schemaVersion: 1;
    };
    markerText?: {
      path: string;
      schemaVersion: 1;
    };
  };
}

export async function loadDataset(profile: DatasetProfile, signal?: AbortSignal): Promise<MarkerCatalog> {
  const manifest = await fetchDatasetManifest(profile, signal);
  if (manifest.schemaVersion !== 1 || !isDatasetProfile(manifest.profile)) {
    throw new Error('本地资源清单版本不受支持');
  }

  const [catalog, categoryCatalog, mapTileManifest, officialMapCatalog, markerTextCatalog] = await Promise.all([
    fetchJson<MarkerCatalogResource>(assetUrl(manifest.resources.markerCatalog.path), signal),
    fetchJson<CategoryCatalog>(assetUrl(manifest.resources.categoryCatalog.path), signal),
    manifest.resources.mapTiles
      ? fetchJson<MapTileManifest>(assetUrl(manifest.resources.mapTiles.path), signal)
      : Promise.resolve(undefined),
    manifest.resources.officialMap
      ? fetchJson<OfficialMapCatalog>(assetUrl(manifest.resources.officialMap.path), signal)
      : Promise.resolve(undefined),
    manifest.resources.markerText
      ? fetchJson<MarkerTextCatalog>(assetUrl(manifest.resources.markerText.path), signal)
      : Promise.resolve(undefined),
  ]);
  if (catalog.schemaVersion !== 1 || catalog.profile !== manifest.profile || catalog.markers.length !== catalog.markerCount) {
    throw new Error('标记目录不完整、profile 不匹配或版本不受支持');
  }
  if (!Array.isArray(catalog.legacyConversions) || catalog.legacyConversions.length === 0) {
    throw new Error('旧地图坐标转换目录缺失');
  }
  const markerCategoryIds = new Set(catalog.markers.map((marker) => marker.category));
  const catalogCategoryIds = new Set(categoryCatalog.categories.map((category) => category.id));
  const categoryCatalogValid = categoryCatalog.schemaVersion === 1
    && categoryCatalog.profile === manifest.profile
    && categoryCatalog.categories.length > 0
    && categoryCatalog.locales.includes('zh-CN')
    && [...markerCategoryIds].every((category) => catalogCategoryIds.has(category));
  if (!categoryCatalogValid) throw new Error('分类与本地化目录不完整、profile 不匹配或版本不受支持');
  if (mapTileManifest && !validMapTileManifest(mapTileManifest, catalog.coordinateSystem.mapFrame)) {
    throw new Error('游戏地图瓦片清单不完整或投影版本不匹配');
  }
  if (officialMapCatalog && !validOfficialMapCatalog(officialMapCatalog)) {
    throw new Error('官方地图标记或图标资源不完整');
  }
  if (markerTextCatalog && !validMarkerTextCatalog(markerTextCatalog)) {
    throw new Error('标记文本目录不完整或版本不受支持');
  }
  return {
    ...catalog,
    gameRelease: manifest.gameRelease,
    categoryCatalog,
    mapTileManifest,
    officialMapCatalog,
    markerTextCatalog,
  };
}

export function isDatasetProfile(value: unknown): value is DatasetProfile {
  return DATASET_PROFILES.includes(String(value) as DatasetProfile);
}

export async function loadDatasetIndex(signal?: AbortSignal): Promise<DatasetIndex> {
  let lastStatus: number | undefined;
  for (const baseUrl of assetBaseCandidates()) {
    const url = new URL('dataset-index.v1.json', baseUrl).toString();
    const response = await fetch(url, { cache: 'no-cache', signal });
    if (!response.ok) {
      lastStatus = response.status;
      continue;
    }
    const index = await response.json() as DatasetIndex;
    const valid = index.schemaVersion === 1
      && isDatasetProfile(index.defaultProfile)
      && Array.isArray(index.profiles)
      && index.profiles.length > 0
      && index.profiles.every((entry) => isDatasetProfile(entry.id) && Boolean(entry.manifestPath));
    if (!valid) throw new Error('数据集索引版本不受支持');
    return index;
  }
  throw new Error(`无法读取数据集索引（HTTP ${lastStatus ?? '未知'}）`);
}

export function localizedText(values: LocalizedText, locale: string, fallbackLocale = 'en-US'): string {
  return values[locale] ?? values[fallbackLocale] ?? Object.values(values)[0] ?? '';
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-cache', signal });
  if (!response.ok) throw new Error(`无法读取本地资源（HTTP ${response.status}）`);
  return response.json() as Promise<T>;
}

export function assetUrl(path: string): string {
  const configuredBase = import.meta.env.VITE_MFG_ASSET_BASE_URL?.trim();
  if (configuredBase) return new URL(path, resolveAssetBases(configuredBase, document.baseURI)[0]).toString();
  if (resolvedAssetBaseUrl) return new URL(path, resolvedAssetBaseUrl).toString();
  return new URL(path, document.baseURI).toString();
}

/**
 * `URL` 会把花括号编码为 `%7B` / `%7D`，而 MapLibre 只会替换原样的
 * `{z}`、`{x}`、`{y}`。普通资源继续使用 assetUrl；只有瓦片模板需要还原
 * 这三个受支持的占位符。
 */
export function mapTileTemplateUrl(path: string): string {
  return assetUrl(path).replace(/%7B([xyz])%7D/gi, (_match, token: string) => `{${token.toLowerCase()}}`);
}

let resolvedAssetBaseUrl: string | undefined;

async function fetchDatasetManifest(profile: DatasetProfile, signal?: AbortSignal): Promise<DatasetManifest> {
  let lastStatus: number | undefined;
  for (const baseUrl of assetBaseCandidates()) {
    for (const relativePath of [`datasets/${profile}/dataset-manifest.v1.json`, 'dataset-manifest.v1.json']) {
      const url = new URL(relativePath, baseUrl).toString();
      const response = await fetch(url, { cache: 'no-cache', signal });
      if (response.ok) {
        const manifest = await response.json() as DatasetManifest;
        if (manifest.profile !== profile) continue;
        resolvedAssetBaseUrl = baseUrl;
        return manifest;
      }
      lastStatus = response.status;
    }
  }
  throw new Error(`无法读取 ${profile} 数据清单（HTTP ${lastStatus ?? '未知'}）`);
}

function assetBaseCandidates(): string[] {
  return resolveAssetBases(import.meta.env.VITE_MFG_ASSET_BASE_URL, document.baseURI);
}

function validMapTileManifest(manifest: MapTileManifest, frame: MapCoordinateFrame): boolean {
  const requiredMaps = new Set(['M00', 'M01', 'M10']);
  return manifest.schemaVersion === 1
    && manifest.game === 'elden-ring'
    && manifest.format === 'webp'
    && (!manifest.processing || ['native', 'optimized'].includes(manifest.processing.seamMode))
    && manifest.tileSize * 2 ** manifest.maxZoom === frame.tileSize * 2 ** frame.xyzZoom
    && manifest.projection.coordinateSystemId === 'elden-ring-world-map-v1'
    && manifest.projection.gameBounds.every((value, index) => value === frame.bounds[index])
    && manifest.projection.xyzOrigin.every((value, index) => value === frame.xyzOrigin[index])
    && manifest.projection.xyzSpan === frame.xyzSpan
    && manifest.maps.length === 3
    && manifest.maps.every((map) => requiredMaps.delete(map.id) && Boolean(map.tileTemplate))
    && validMapDiscovery(manifest.discovery);
}

function validMapDiscovery(discovery: MapDiscoveryDefinition | undefined): boolean {
  if (!discovery) return true;
  const validPlanes = new Set<MapPlane>(['surface', 'underground', 'shadow']);
  return Boolean(discovery.hiddenTileTemplates)
    && discovery.pieces.length > 0
    && (['M00', 'M01', 'M10'] as const).every((mapId) => Boolean(discovery.hiddenTileTemplates[mapId]))
    && discovery.pieces.every((piece) => (
      Boolean(piece.id)
      && validPlanes.has(piece.plane)
      && Number.isInteger(piece.worldMapPieceId)
      && Number.isInteger(piece.maskBit)
      && piece.maskBit > 0
      && piece.openEventFlagId > 0
      && Array.isArray(piece.visitPrefixes)
      && Boolean(piece.tileTemplate)
    ))
    && (['M00', 'M01', 'M10'] as const).every((mapId) => (
      Array.isArray(discovery.tiles[mapId])
      && discovery.tiles[mapId].every(([id, mask]) => Number.isInteger(id) && id >= 0 && mask > 0)
    ))
    && discovery.regionLabels.every((label) => (
      Boolean(label.id)
      && validPlanes.has(label.plane)
      && Number.isInteger(label.worldMapPieceId)
      && label.openEventFlagId > 0
      && label.position.length === 2
      && Object.keys(label.labels).length > 0
    ));
}

function validOfficialMapCatalog(catalog: OfficialMapCatalog): boolean {
  const validPlanes = new Set<MapPlane>(['surface', 'underground', 'shadow']);
  return catalog.schemaVersion === 1
    && catalog.game === 'elden-ring'
    && catalog.coordinateSystemId === 'elden-ring-world-map-v1'
    && catalog.markerCount === catalog.markers.length
    && catalog.mappedMarkerCount > 0
    && catalog.textStateCount > 0
    && Boolean(catalog.iconSprite.path)
    && catalog.iconSprite.keys.includes('player')
    && catalog.markers.every((marker) => (
      Number.isInteger(marker.id)
      && validPlanes.has(marker.plane)
      && marker.textSlots.every((slot) => (
        slot.textStateIndex >= 0
        && slot.textStateIndex < catalog.textStateCount
        && (slot.kind === 'place' || slot.kind === 'npc')
        && (slot.activeWhenAny === undefined || slot.activeWhenAny.every((predicate) => (
          Array.isArray(predicate.enabledFlagIds)
          && predicate.enabledFlagIds.every((flagId) => Number.isInteger(flagId) && flagId > 0)
          && Array.isArray(predicate.disabledFlagIds)
          && predicate.disabledFlagIds.every((flagId) => Number.isInteger(flagId) && flagId > 0)
        )))
      ))
    ));
}

function validMarkerTextCatalog(catalog: MarkerTextCatalog): boolean {
  return catalog.schemaVersion === 1
    && catalog.game === 'elden-ring'
    && catalog.encoding === 'map-for-goblins-fmg-offset-v1'
    && catalog.locales.includes('zh-CN')
    && catalog.resolvedTextIdCount === Object.keys(catalog.entries).length
    && Object.entries(catalog.entries).every(([encodedId, entry]) => (
      Number(encodedId) === entry.encodedId
      && entry.sourceId >= 0
      && Boolean(entry.table)
      && Object.keys(entry.labels).length > 0
    ));
}

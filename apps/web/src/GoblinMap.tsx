import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  RasterTileSource,
  type MapGeoJSONFeature,
  type MapMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import {
  assetUrl,
  localizedText,
  mapTileTemplateUrl,
  type MapPlane,
  type MarkerCatalog,
  type MarkerCatalogEntry,
  type MarkerGroup,
  type MarkerTextEntry,
  type MapTileDefinition,
  type OfficialMapMarker,
} from './dataset';
import { gameExtentToBounds, gameToLngLat } from './map-coordinate';
import { MarkerStateCode, type MarkerStateCode as MarkerStateValue } from './marker-state';
import { selectVisibleMarkers, type IndexedMarker } from './marker-render-set';
import {
  COMPLETED_GRACE_ICON_SCALE,
  markerIconKey,
  markerIconOpacity,
  markerShowsDiagnosticDot,
} from './marker-icon-render';
import { projectSaveMapPoint, type ProjectedSaveMapPoint } from './save-map-position';
import type { ParsedSlotSummary } from './save-parser-protocol';
import type { CapitalState } from './capital-state';
import {
  createMapDiscoveryContext,
  explorationCoordinateVisible,
  visibleRegionLabels,
  type MapDiscoveryContext,
  type MapDisplayMode,
} from './map-discovery';
import {
  discoveryTileTemplate,
  registerDiscoveryTileProtocol,
  unregisterDiscoveryTileProtocol,
} from './discovery-tile-protocol';
import { OfficialMarkerStateCode, OfficialTextStateCode } from './official-marker-state';
import {
  categoryAllowsOfficialMarker,
  guidanceForGrace,
  isOfficialMarkerInteractive,
  isNpcMarker,
  isSendingGate,
  officialMarkerIconOffset,
  officialMarkerIconScale,
  officialMarkerEvidence,
  officialMarkerSortKey,
  officialMarkerTitle,
  officialMarkerVisibleInMode,
  type OfficialMarkerDisplayMode,
} from './official-marker-render';
import { createSendingGateIcon, SENDING_GATE_ICON_SCALE } from './sending-gate-icon';
import type { MapCenter } from './client-settings';
import type { MapFocusRequest, MapSearchResult } from './map-search';

interface GoblinMapProps {
  catalog: MarkerCatalog;
  slot?: ParsedSlotSummary;
  visibleCategories: ReadonlySet<string>;
  locale: string;
  plane: MapPlane;
  onPlaneChange(plane: MapPlane): void;
  mapDisplayMode: MapDisplayMode;
  capitalState: CapitalState;
  officialMarkerDisplayMode: OfficialMarkerDisplayMode;
  searchResults?: readonly MapSearchResult[];
  focusRequest?: MapFocusRequest;
  followPlayerLocation: boolean;
  onFollowPlayerLocationChange(following: boolean): void;
  mapCenter?: MapCenter;
  mapZoom: number | null;
  onMapCenterChange(center: MapCenter): void;
  onMapZoomChange(zoom: number): void;
}

interface InspectedCatalogMarker {
  type: 'catalog';
  marker: MarkerCatalogEntry;
  markerIndex: number;
  pixel: [number, number];
}

interface SavePoint extends ProjectedSaveMapPoint {
  kind: 'player' | 'bloodstain';
  characterName: string;
  runes?: number;
}

interface InspectedSavePoint {
  type: 'save';
  point: SavePoint;
  savePointIndex: number;
  pixel: [number, number];
}

interface InspectedOfficialMarker {
  type: 'official';
  marker: OfficialMapMarker;
  markerIndex: number;
  pixel: [number, number];
}

type InspectedItem = InspectedCatalogMarker | InspectedOfficialMarker | InspectedSavePoint;

interface MarkerProperties {
  markerIndex: number;
  groupCode: number;
  state: number;
  iconKey: string;
  sortKey: number;
  opacity: number;
  diagnosticDot: number;
}

interface MarkerFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: MarkerProperties;
  }>;
}

interface OfficialMarkerProperties {
  markerIndex: number;
  iconKey: string;
  angle: number;
  sortKey: number;
  state: number;
  opacity: number;
  iconScale: number;
  iconOffset: [number, number];
}

interface OfficialMarkerFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: OfficialMarkerProperties;
  }>;
}

interface SavePointProperties {
  savePointIndex: number;
  kindCode: number;
  iconKey: string;
}

interface SavePointFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: SavePointProperties;
  }>;
}

const MARKER_SOURCE_ID = 'err-markers';
const COMPLETED_GRACE_SOURCE_ID = 'completed-graces';
const MARKER_LAYER_ID = 'err-marker-circles';
const MARKER_SYMBOL_LAYER_ID = 'err-marker-symbols';
const COMPLETED_GRACE_SYMBOL_LAYER_ID = 'completed-grace-symbols';
const OFFICIAL_MARKER_SOURCE_ID = 'official-map-markers';
const OFFICIAL_MARKER_LAYER_ID = 'official-map-symbols';
const SAVE_POINT_SOURCE_ID = 'save-points';
const SAVE_POINT_HALO_LAYER_ID = 'save-point-halo';
const SAVE_POINT_LAYER_ID = 'save-point-circles';
const SAVE_POINT_SYMBOL_LAYER_ID = 'save-point-symbols';
const MAP_RASTER_PREFIX = 'game-map-raster';
const MAP_DISCOVERY_RASTER_PREFIX = 'game-map-discovery-raster';

const groupLabels: Record<MarkerGroup, string> = {
  equipment: '装备',
  'key-items': '关键物品',
  collectibles: '收集品',
  world: '世界设施',
};

const planeLabels: Record<MapPlane, string> = {
  surface: '交界地',
  underground: '地下',
  shadow: '幽影之地',
};

const stateLabels: Record<MarkerStateValue, string> = {
  [MarkerStateCode.AVAILABLE]: '可获取',
  [MarkerStateCode.COLLECTED]: '已完成',
  [MarkerStateCode.LOCKED]: '尚未解锁',
  [MarkerStateCode.UNKNOWN]: '状态未知',
};

const markerTextKindLabels: Record<MarkerTextEntry['kind'], string> = {
  weapon: '武器',
  armour: '防具',
  talisman: '护符',
  'ash-of-war': '战灰',
  goods: '道具',
  npc: 'NPC',
  enemy: '敌人',
  'enemy-type': '敌人类型',
  interaction: '交互',
  place: '地点',
};

export function GoblinMap({
  catalog,
  slot,
  visibleCategories,
  locale,
  plane,
  onPlaneChange,
  mapDisplayMode,
  capitalState,
  officialMarkerDisplayMode,
  searchResults,
  focusRequest,
  followPlayerLocation,
  onFollowPlayerLocationChange,
  mapCenter,
  mapZoom,
  onMapCenterChange,
  onMapZoomChange,
}: GoblinMapProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | undefined>(undefined);
  const restoredPlaneRef = useRef<MapPlane | undefined>(undefined);
  const loadedRef = useRef(false);
  const renderDataRef = useRef<MarkerFeatureCollection | undefined>(undefined);
  const completedGraceDataRef = useRef<MarkerFeatureCollection | undefined>(undefined);
  const officialRenderDataRef = useRef<OfficialMarkerFeatureCollection | undefined>(undefined);
  const savePointDataRef = useRef<SavePointFeatureCollection | undefined>(undefined);
  const savePointsRef = useRef<readonly SavePoint[]>([]);
  const regionLabelMarkersRef = useRef<MapLibreMarker[]>([]);
  const discoveryProtocolIdRef = useRef<string | undefined>(undefined);
  const planeRef = useRef(plane);
  planeRef.current = plane;
  const followPlayerLocationRef = useRef(followPlayerLocation);
  followPlayerLocationRef.current = followPlayerLocation;
  const onFollowPlayerLocationChangeRef = useRef(onFollowPlayerLocationChange);
  onFollowPlayerLocationChangeRef.current = onFollowPlayerLocationChange;
  const mapZoomRef = useRef(mapZoom);
  mapZoomRef.current = mapZoom;
  const mapCenterRef = useRef(mapCenter);
  mapCenterRef.current = mapCenter;
  const onMapCenterChangeRef = useRef(onMapCenterChange);
  onMapCenterChangeRef.current = onMapCenterChange;
  const onMapZoomChangeRef = useRef(onMapZoomChange);
  onMapZoomChangeRef.current = onMapZoomChange;
  const [hovered, setHovered] = useState<InspectedItem>();
  const [selected, setSelected] = useState<InspectedItem>();
  const [mapReady, setMapReady] = useState(false);
  const [focusPulse, setFocusPulse] = useState<{ requestId: number; x: number; y: number }>();
  const categoryLabels = useMemo(() => new Map(
    catalog.categoryCatalog.categories.map((category) => [category.id, localizedText(category.labels, locale)]),
  ), [catalog.categoryCatalog.categories, locale]);
  const markerStates = slot?.markerStates;
  const mapDiscovery = useMemo(
    () => createMapDiscoveryContext(catalog, slot, mapDisplayMode),
    [catalog, mapDisplayMode, slot],
  );
  const searchCatalogIndexes = useMemo(() => searchResults === undefined
    ? undefined
    : new Set(searchResults.filter((result) => result.source === 'catalog').map((result) => result.markerIndex)), [searchResults]);
  const searchOfficialIndexes = useMemo(() => searchResults === undefined
    ? undefined
    : new Set(searchResults.filter((result) => result.source === 'official').map((result) => result.markerIndex)), [searchResults]);
  const visibleMarkers = useMemo(
    () => searchCatalogIndexes
      ? selectSearchCatalogMarkers(catalog.markers, plane, searchCatalogIndexes)
      : selectVisibleMarkers(catalog.markers, plane, visibleCategories, capitalState, mapDiscovery, markerStates),
    [capitalState, catalog, mapDiscovery, markerStates, plane, searchCatalogIndexes, visibleCategories],
  );
  const visibleOfficialMarkers = useMemo(
    () => searchOfficialIndexes
      ? selectSearchOfficialMarkers(catalog.officialMapCatalog?.markers ?? [], plane, searchOfficialIndexes)
      : selectVisibleOfficialMarkers(
      catalog.officialMapCatalog?.markers ?? [],
      plane,
      capitalState,
      slot?.officialMarkerStates,
      officialMarkerDisplayMode,
      visibleCategories,
      mapDiscovery,
    ),
    [capitalState, catalog.officialMapCatalog?.markers, officialMarkerDisplayMode, mapDiscovery, plane, searchOfficialIndexes, slot?.officialMarkerStates, visibleCategories],
  );
  const projectedPlayer = useMemo(
    () => slot ? projectSaveMapPoint(slot.playerPosition, catalog.legacyConversions) : undefined,
    [catalog.legacyConversions, slot],
  );
  const selectedGraceGuidance = useMemo(
    () => selected?.type === 'catalog' && selected.marker.category === 'WorldGraces'
      ? guidanceForGrace(selected.marker, visibleOfficialMarkers.map(({ marker }) => marker))
      : [],
    [selected, visibleOfficialMarkers],
  );
  const regionLabels = useMemo(
    () => visibleRegionLabels(mapDiscovery, plane).map((label) => ({
      ...label,
      text: localizedText(label.labels, locale),
    })),
    [locale, mapDiscovery, plane],
  );
  const savePoints = useMemo(
    () => searchResults === undefined ? createSavePoints(slot, catalog, plane) : [],
    [catalog, plane, searchResults, slot],
  );
  const markerGeoJson = useMemo(
    () => createMarkerGeoJson(
      visibleMarkers,
      markerStates,
      catalog.coordinateSystem.mapFrame,
      slot?.fastTravel?.restricted ?? false,
    ),
    [catalog.coordinateSystem.mapFrame, markerStates, slot?.fastTravel?.restricted, visibleMarkers],
  );
  const completedGraceGeoJson = useMemo(
    () => selectCompletedGraceFeatures(markerGeoJson),
    [markerGeoJson],
  );
  const officialMarkerGeoJson = useMemo(
    () => createOfficialMarkerGeoJson(
      visibleOfficialMarkers,
      slot?.officialMarkerStates,
      searchResults === undefined ? officialMarkerDisplayMode : 'all',
      catalog.coordinateSystem.mapFrame,
    ),
    [catalog.coordinateSystem.mapFrame, officialMarkerDisplayMode, searchResults, slot?.officialMarkerStates, visibleOfficialMarkers],
  );
  const savePointGeoJson = useMemo(
    () => createSavePointGeoJson(savePoints, catalog.coordinateSystem.mapFrame),
    [catalog.coordinateSystem.mapFrame, savePoints],
  );
  renderDataRef.current = markerGeoJson;
  completedGraceDataRef.current = completedGraceGeoJson;
  officialRenderDataRef.current = officialMarkerGeoJson;
  savePointDataRef.current = savePointGeoJson;
  savePointsRef.current = savePoints;

  const regionLabelFontPath = catalog.mapTileManifest?.discovery?.regionLabelFont?.path;
  useEffect(() => {
    if (!regionLabelFontPath || typeof FontFace === 'undefined') return;
    const font = new FontFace('ER Map Region', `url("${assetUrl(regionLabelFontPath)}")`, {
      style: 'normal',
      weight: '400',
    });
    let active = true;
    void font.load().then((loaded) => {
      if (active) document.fonts.add(loaded);
    }).catch(() => undefined);
    return () => {
      active = false;
      document.fonts.delete(font);
    };
  }, [regionLabelFontPath]);

  useEffect(() => {
    if (!targetRef.current) return;
    const discoveryProtocolId = catalog.mapTileManifest
      ? registerDiscoveryTileProtocol(catalog.mapTileManifest)
      : undefined;
    discoveryProtocolIdRef.current = discoveryProtocolId;
    const map = new MapLibreMap({
      container: targetRef.current,
      style: createEmptyMapStyle(catalog),
      center: mapCenterRef.current ?? [0, 0],
      zoom: mapZoomRef.current ?? 1,
      minZoom: 0,
      maxZoom: 12,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      canvasContextAttributes: { antialias: false, powerPreference: 'high-performance' },
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    // 与 MapGenie 当前公开页面相同的滚轮比例；MapLibre 会连续合并正反向输入。
    map.scrollZoom.setWheelZoomRate(1 / 150);
    map.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'bottom-right');

    let hoverFrame: number | undefined;
    let pendingHover: MapMouseEvent | undefined;
    const clearHover = () => {
      pendingHover = undefined;
      map.getCanvas().style.cursor = '';
      setHovered((current) => current ? undefined : current);
    };
    const inspectFeature = (feature: MapGeoJSONFeature | undefined, point: { x: number; y: number }): InspectedItem | undefined => {
      if (feature?.layer.id === SAVE_POINT_LAYER_ID || feature?.layer.id === SAVE_POINT_SYMBOL_LAYER_ID) {
        const savePointIndex = Number((feature.properties as Partial<SavePointProperties> | undefined)?.savePointIndex);
        const savePoint = savePointsRef.current[savePointIndex];
        return savePoint ? { type: 'save', point: savePoint, savePointIndex, pixel: [point.x, point.y] } : undefined;
      }
      if (feature?.layer.id === OFFICIAL_MARKER_LAYER_ID) {
        const markerIndex = Number((feature.properties as Partial<OfficialMarkerProperties> | undefined)?.markerIndex);
        const marker = catalog.officialMapCatalog?.markers[markerIndex];
        return marker && isOfficialMarkerInteractive(marker)
          ? { type: 'official', marker, markerIndex, pixel: [point.x, point.y] }
          : undefined;
      }
      const markerIndex = Number((feature?.properties as Partial<MarkerProperties> | undefined)?.markerIndex);
      if (!Number.isInteger(markerIndex)) return undefined;
      const marker = catalog.markers[markerIndex];
      return marker ? { type: 'catalog', marker, markerIndex, pixel: [point.x, point.y] } : undefined;
    };
    const inspectFeatures = (features: MapGeoJSONFeature[], point: { x: number; y: number }): InspectedItem | undefined => (
      features.map((feature) => inspectFeature(feature, point)).find(Boolean)
    );
    const handleMouseMove = (event: MapMouseEvent) => {
      if (map.isMoving()) {
        clearHover();
        return;
      }
      pendingHover = event;
      if (hoverFrame !== undefined) return;
      hoverFrame = window.requestAnimationFrame(() => {
        hoverFrame = undefined;
        const latest = pendingHover;
        pendingHover = undefined;
        if (!latest || map.isMoving()) return;
        const layers = interactiveMarkerLayers(map);
        if (layers.length === 0) return;
        const hit = inspectFeatures(map.queryRenderedFeatures(latest.point, { layers }), latest.point);
        map.getCanvas().style.cursor = hit ? 'pointer' : '';
        setHovered((current) => inspectedKey(current) === inspectedKey(hit) ? current : hit);
      });
    };
    const handleClick = (event: MapMouseEvent) => {
      const layers = interactiveMarkerLayers(map);
      const hit = layers.length > 0
        ? inspectFeatures(map.queryRenderedFeatures(event.point, { layers }), event.point)
        : undefined;
      setSelected(hit);
    };
    const stopFollowingForDrag = () => {
      if (followPlayerLocationRef.current) onFollowPlayerLocationChangeRef.current(false);
    };
    const stopFollowingForZoom = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent && followPlayerLocationRef.current) {
        onFollowPlayerLocationChangeRef.current(false);
      }
    };

    map.on('load', () => {
      addMapRasterLayers(map, catalog, planeRef.current, discoveryProtocolId);
      map.addSource(MARKER_SOURCE_ID, {
        type: 'geojson',
        data: renderDataRef.current ?? emptyMarkerGeoJson(),
        maxzoom: 12,
      });
      map.addSource(COMPLETED_GRACE_SOURCE_ID, {
        type: 'geojson',
        data: completedGraceDataRef.current ?? emptyMarkerGeoJson(),
        maxzoom: 12,
      });
      if (catalog.officialMapCatalog) {
        if (!map.hasImage('supplemental-sending-gate')) {
          map.addImage('supplemental-sending-gate', createSendingGateIcon(true));
        }
        if (!map.hasImage('supplemental-sending-gate-locked')) {
          map.addImage('supplemental-sending-gate-locked', createSendingGateIcon(false));
        }
        map.addSource(OFFICIAL_MARKER_SOURCE_ID, {
          type: 'geojson',
          data: officialRenderDataRef.current ?? emptyOfficialMarkerGeoJson(),
          maxzoom: 12,
        });
      }
      map.addSource(SAVE_POINT_SOURCE_ID, {
        type: 'geojson',
        data: savePointDataRef.current ?? emptySavePointGeoJson(),
        maxzoom: 12,
      });
      addMarkerLayer(map, hasMfgIconSprite(catalog));
      if (catalog.officialMapCatalog) addOfficialMarkerLayer(map);
      addSavePointLayers(map, Boolean(catalog.officialMapCatalog));
      loadedRef.current = true;
      setMapReady(true);
      setRasterState(map, catalog, planeRef.current, mapDiscovery, discoveryProtocolId);
      if (!mapCenterRef.current) fitPlane(map, catalog, planeRef.current);
      if (mapZoomRef.current !== null) map.setZoom(mapZoomRef.current);
    });
    map.on('mousemove', handleMouseMove);
    map.on('click', handleClick);
    map.on('movestart', clearHover);
    map.on('dragstart', stopFollowingForDrag);
    map.on('zoomstart', stopFollowingForZoom);
    map.on('zoomend', () => {
      const zoom = Math.round(map.getZoom() * 1000) / 1000;
      if (zoom !== mapZoomRef.current) onMapZoomChangeRef.current(zoom);
    });
    map.on('moveend', () => {
      const center = map.getCenter();
      const next: MapCenter = [roundMapCoordinate(center.lng), roundMapCoordinate(center.lat)];
      const previous = mapCenterRef.current;
      if (!previous || previous[0] !== next[0] || previous[1] !== next[1]) {
        onMapCenterChangeRef.current(next);
      }
    });

    return () => {
      if (hoverFrame !== undefined) window.cancelAnimationFrame(hoverFrame);
      loadedRef.current = false;
      setMapReady(false);
      regionLabelMarkersRef.current.forEach((marker) => marker.remove());
      regionLabelMarkersRef.current = [];
      mapRef.current = undefined;
      map.remove();
      unregisterDiscoveryTileProtocol(discoveryProtocolId);
      discoveryProtocolIdRef.current = undefined;
    };
  }, [catalog]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (restoredPlaneRef.current === plane) return;
    restoredPlaneRef.current = plane;
    if (mapCenter) map.jumpTo({ center: mapCenter, zoom: mapZoomRef.current ?? map.getZoom() });
    else fitPlane(map, catalog, plane);
  }, [catalog, mapCenter, mapReady, plane]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(MARKER_SOURCE_ID);
    if (source instanceof GeoJSONSource) source.setData(markerGeoJson);
  }, [markerGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(COMPLETED_GRACE_SOURCE_ID);
    if (source instanceof GeoJSONSource) source.setData(completedGraceGeoJson);
  }, [completedGraceGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(OFFICIAL_MARKER_SOURCE_ID);
    if (source instanceof GeoJSONSource) source.setData(officialMarkerGeoJson);
  }, [officialMarkerGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(SAVE_POINT_SOURCE_ID);
    if (source instanceof GeoJSONSource) source.setData(savePointGeoJson);
  }, [savePointGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    regionLabelMarkersRef.current.forEach((marker) => marker.remove());
    const markers = regionLabels.map((label) => {
      const anchor = document.createElement('div');
      anchor.className = 'region-map-label-anchor';
      anchor.setAttribute('aria-hidden', 'true');
      const element = document.createElement('div');
      element.className = 'region-map-label';
      element.textContent = label.text;
      anchor.append(element);
      const marker = new MapLibreMarker({ element: anchor, anchor: 'center', subpixelPositioning: true })
        .setLngLat(gameToLngLat(label.position, catalog.coordinateSystem.mapFrame))
        .addTo(map);
      anchor.removeAttribute('role');
      anchor.removeAttribute('tabindex');
      return marker;
    });
    regionLabelMarkersRef.current = markers;
    const updateZoom = () => updateRegionLabelZoom(map, markers);
    updateZoom();
    map.on('zoom', updateZoom);
    return () => {
      map.off('zoom', updateZoom);
      markers.forEach((marker) => marker.remove());
      if (regionLabelMarkersRef.current === markers) regionLabelMarkersRef.current = [];
    };
  }, [catalog.coordinateSystem.mapFrame, mapReady, regionLabels]);

  useEffect(() => {
    const refresh = (current: InspectedItem | undefined): InspectedItem | undefined => {
      if (current?.type !== 'save') return current;
      const nextIndex = savePoints.findIndex((point) => point.kind === current.point.kind);
      return nextIndex >= 0
        ? { ...current, point: savePoints[nextIndex], savePointIndex: nextIndex }
        : undefined;
    };
    setSelected(refresh);
    setHovered(refresh);
  }, [savePoints]);

  useEffect(() => {
    setSelected(undefined);
    setHovered(undefined);
  }, [plane]);

  useEffect(() => {
    if (!followPlayerLocation || !projectedPlayer) return;
    if (projectedPlayer.plane !== plane) {
      onPlaneChange(projectedPlayer.plane);
      return;
    }
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.easeTo({
      center: gameToLngLat(projectedPlayer.coordinate, catalog.coordinateSystem.mapFrame),
      duration: 360,
      essential: true,
    });
  }, [catalog.coordinateSystem.mapFrame, followPlayerLocation, onPlaneChange, plane, projectedPlayer]);

  useEffect(() => {
    if (!focusRequest || focusRequest.result.plane !== plane) return;
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    setSelected(undefined);
    setHovered(undefined);
    setFocusPulse(undefined);
    const center = gameToLngLat(focusRequest.result.coordinate, catalog.coordinateSystem.mapFrame);
    map.easeTo({ center, duration: 500, essential: true });
    let dismissTimer: number | undefined;
    const revealTimer = window.setTimeout(() => {
      const pixel = map.project(center);
      setFocusPulse({ requestId: focusRequest.requestId, x: pixel.x, y: pixel.y });
      dismissTimer = window.setTimeout(() => setFocusPulse(undefined), 2000);
    }, 520);
    return () => {
      window.clearTimeout(revealTimer);
      if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
    };
  }, [catalog.coordinateSystem.mapFrame, focusRequest, plane]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    setRasterState(map, catalog, plane, mapDiscovery, discoveryProtocolIdRef.current);
  }, [catalog, mapDiscovery, plane]);

  useEffect(() => {
    setSelected(undefined);
    setHovered(undefined);
  }, [capitalState, mapDisplayMode, officialMarkerDisplayMode]);

  return (
    <div className="game-map-shell">
      <div ref={targetRef} className="game-map" aria-label={`${planeLabels[plane]}互动地图`} />
      <button
        type="button"
        className={`player-follow-button${followPlayerLocation ? ' active' : ''}`}
        aria-label={followPlayerLocation ? '停止跟随角色当前位置' : '显示并跟随角色当前位置'}
        aria-pressed={followPlayerLocation}
        disabled={!projectedPlayer}
        title={projectedPlayer ? '显示并跟随角色当前位置；拖动或缩放地图会停止跟随' : '加载包含有效角色坐标的存档后可用'}
        onClick={() => onFollowPlayerLocationChange(!followPlayerLocation)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
          <circle cx="12" cy="12" r="5" />
          <circle className="player-follow-center" cx="12" cy="12" r="1.8" />
        </svg>
      </button>
      {focusPulse && (
        <div
          className="map-focus-overlay"
          key={focusPulse.requestId}
          style={{
            '--focus-x': `${focusPulse.x}px`,
            '--focus-y': `${focusPulse.y}px`,
          } as CSSProperties}
          aria-hidden="true"
        />
      )}
      {hovered && !selected && (
        <div className="map-tooltip" style={{ left: hovered.pixel[0] + 14, top: hovered.pixel[1] + 14 }}>
          {hovered.type === 'catalog' ? (
            <>
              <strong>{catalogMarkerTitle(hovered.marker, catalog, locale)}</strong>
              <span>{categoryLabels.get(hovered.marker.category) ?? hovered.marker.category} · {stateLabels[stateAt(markerStates, hovered.markerIndex)]}</span>
            </>
          ) : hovered.type === 'official' ? (
            <>
              <strong>{officialMarkerTitle(hovered.marker, locale, slot?.officialTextStates)}</strong>
              <span>{officialMarkerStatus(hovered.marker, hovered.markerIndex, slot)}</span>
            </>
          ) : (
            <>
              <strong>{savePointTitle(hovered.point)}</strong>
              <span>{savePointStatus(hovered.point, locale)}</span>
            </>
          )}
        </div>
      )}
      {selected?.type === 'catalog' && (
        <article className="marker-inspector">
          <button type="button" aria-label="关闭标记详情" onClick={() => setSelected(undefined)}>×</button>
          <span className="eyebrow">{groupLabels[selected.marker.group]}</span>
          <h3>{catalogMarkerTitle(selected.marker, catalog, locale)}</h3>
          <p>{stateLabels[stateAt(markerStates, selected.markerIndex)]} · 证据来源：{evidenceLabel(selected.marker)}</p>
          <dl>
            <div><dt>分类</dt><dd>{categoryLabels.get(selected.marker.category) ?? selected.marker.category}</dd></div>
            <div><dt>区域</dt><dd>m{selected.marker.area}_{selected.marker.gridX}_{selected.marker.gridZ}</dd></div>
            <div><dt>高度</dt><dd>{selected.marker.position[1].toFixed(1)}</dd></div>
            {selectedGraceGuidance.length > 0 && (
              <div>
                <dt>赐福引导</dt>
                <dd>{selectedGraceGuidance.length} 条 · {selectedGraceGuidance.map((marker) => `#${marker.id}`).join('、')}</dd>
              </div>
            )}
          </dl>
          {resolvedMarkerTexts(selected.marker, catalog).length > 0 && (
            <ul className="official-npc-state-list">
              {resolvedMarkerTexts(selected.marker, catalog).map((entry) => (
                <li key={entry.encodedId}>
                  <strong>{localizedText(entry.labels, locale)}</strong>
                  <span>{markerTextKindLabels[entry.kind]} · {entry.table} #{entry.sourceId}</span>
                </li>
              ))}
            </ul>
          )}
          <small>标记 #{selected.marker.id} · 未解析文本仍保留原始 ID，不推测名称。</small>
        </article>
      )}
      {selected?.type === 'official' && (
        <article className="marker-inspector official-marker-inspector">
          <button type="button" aria-label="关闭官方标记详情" onClick={() => setSelected(undefined)}>×</button>
          <span className="eyebrow">官方地图标记 · 图标 {selected.marker.iconId}</span>
          <h3>{officialMarkerTitle(selected.marker, locale, slot?.officialTextStates)}</h3>
          <p>
            {officialMarkerStatus(selected.marker, selected.markerIndex, slot)}
            {' · '}证据来源：{officialMarkerEvidence(selected.marker)}
          </p>
          <dl>
            <div><dt>地图点</dt><dd>#{selected.marker.id}</dd></div>
            <div><dt>区域</dt><dd>m{selected.marker.area}_{selected.marker.gridX}_{selected.marker.gridZ}</dd></div>
            <div><dt>高度</dt><dd>{selected.marker.position[1].toFixed(1)}</dd></div>
          </dl>
          {selected.marker.textSlots.some((textSlot) => textSlot.kind === 'npc') && (
            <ul className="official-npc-state-list">
              {selected.marker.textSlots.filter((textSlot) => textSlot.kind === 'npc').map((textSlot) => (
                <li key={`${textSlot.slot}:${textSlot.textId}`}>
                  <strong>{localizedText(textSlot.labels, locale) || `NPC #${textSlot.textId}`}</strong>
                  <span>{officialNpcSlotStatus(textSlot.textStateIndex, slot?.officialTextStates)}</span>
                </li>
              ))}
            </ul>
          )}
          <small>“当前”取自主任务阶段旗标；“已发现”取自该位置的第二组发现旗标。全部候选位置均保留在目录中。</small>
        </article>
      )}
      {selected?.type === 'save' && (
        <article className="marker-inspector special-point-inspector">
          <button type="button" aria-label="关闭位置详情" onClick={() => setSelected(undefined)}>×</button>
          <span className="eyebrow">{selected.point.kind === 'player' ? '存档位置' : '死亡记录'}</span>
          <h3>{savePointTitle(selected.point)}</h3>
          <p>{savePointStatus(selected.point, locale)}</p>
          <dl>
            <div><dt>场景</dt><dd>{selected.point.mapId}</dd></div>
            <div><dt>平面</dt><dd>{planeLabels[selected.point.plane]}</dd></div>
            <div><dt>高度</dt><dd>{selected.point.elevation.toFixed(1)}</dd></div>
            {selected.point.kind === 'bloodstain' && (
              <div><dt>地面卢恩</dt><dd>{Math.max(0, selected.point.runes ?? 0).toLocaleString(locale)}</dd></div>
            )}
          </dl>
          <small>位置和卢恩数量直接来自当前存档槽位；不会读取游戏进程内存。</small>
        </article>
      )}
    </div>
  );
}

function roundMapCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

interface IndexedOfficialMarker {
  marker: OfficialMapMarker & { mapPosition: NonNullable<OfficialMapMarker['mapPosition']> };
  markerIndex: number;
}

const groupCodes: Record<MarkerGroup, number> = { equipment: 0, 'key-items': 1, collectibles: 2, world: 3 };

function createEmptyMapStyle(catalog: MarkerCatalog): StyleSpecification {
  const spritePath = catalog.officialMapCatalog?.iconSprite.path;
  return {
    version: 8,
    ...(spritePath ? { sprite: assetUrl(spritePath) } : {}),
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': 'rgba(0, 0, 0, 0)' } }],
  };
}

function addOfficialMarkerLayer(map: MapLibreMap): void {
  map.addLayer({
    id: OFFICIAL_MARKER_LAYER_ID,
    type: 'symbol',
    source: OFFICIAL_MARKER_SOURCE_ID,
    layout: {
      'icon-image': ['get', 'iconKey'],
      'icon-size': ['get', 'iconScale'],
      'icon-rotate': ['get', 'angle'],
      // 偏移分量会乘以 icon-size，并随 icon-rotate 一起旋转。
      'icon-offset': ['get', 'iconOffset'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'sortKey'],
    },
    paint: {
      'icon-opacity': ['get', 'opacity'],
    },
  });
}

function addMarkerLayer(map: MapLibreMap, hasMfgSprite: boolean): void {
  map.addLayer({
    id: MARKER_LAYER_ID,
    type: 'circle',
    source: MARKER_SOURCE_ID,
    ...(hasMfgSprite ? { filter: ['==', ['get', 'diagnosticDot'], 1] } : {}),
    paint: {
      'circle-radius': ['case', ['==', ['get', 'state'], MarkerStateCode.COLLECTED], 3.5, 5],
      'circle-color': [
        'case',
        ['==', ['get', 'state'], MarkerStateCode.COLLECTED], '#4c554d',
        ['==', ['get', 'state'], MarkerStateCode.LOCKED], '#6b5576',
        ['==', ['get', 'state'], MarkerStateCode.UNKNOWN], '#737a72',
        ['==', ['get', 'groupCode'], groupCodes.equipment], '#d7b86a',
        ['==', ['get', 'groupCode'], groupCodes['key-items']], '#70a6c2',
        ['==', ['get', 'groupCode'], groupCodes.collectibles], '#9b7ac2',
        '#78a778',
      ],
      'circle-opacity': 1,
      'circle-stroke-color': 'rgba(12, 15, 13, 0.92)',
      'circle-stroke-width': 1.5,
    },
  });
  if (!hasMfgSprite) return;
  map.addLayer({
    id: MARKER_SYMBOL_LAYER_ID,
    type: 'symbol',
    source: MARKER_SOURCE_ID,
    layout: {
      'icon-image': ['get', 'iconKey'],
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        0, 0.13,
        4, 0.2,
        8, 0.27,
        12, 0.32,
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'sortKey'],
    },
    paint: {
      'icon-opacity': ['get', 'opacity'],
    },
  });
  map.addLayer({
    id: COMPLETED_GRACE_SYMBOL_LAYER_ID,
    type: 'symbol',
    source: COMPLETED_GRACE_SOURCE_ID,
    layout: {
      'icon-image': ['get', 'iconKey'],
      // 官方圆形赐福的有效内容小于精灵单元格；使用与状态渲染逻辑共享的
      // 倍率，使它明显大于收集品且不改变普通标记图层。
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        0, 0.13 * COMPLETED_GRACE_ICON_SCALE,
        4, 0.2 * COMPLETED_GRACE_ICON_SCALE,
        8, 0.27 * COMPLETED_GRACE_ICON_SCALE,
        12, 0.32 * COMPLETED_GRACE_ICON_SCALE,
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'sortKey'],
    },
    paint: {
      'icon-opacity': ['get', 'opacity'],
    },
  });
}

function addSavePointLayers(map: MapLibreMap, hasOfficialSprite: boolean): void {
  map.addLayer({
    id: SAVE_POINT_HALO_LAYER_ID,
    type: 'circle',
    source: SAVE_POINT_SOURCE_ID,
    paint: {
      'circle-radius': ['case', ['==', ['get', 'kindCode'], 0], 13, 12],
      'circle-color': ['case', ['==', ['get', 'kindCode'], 0], '#67c8ee', '#e3b64e'],
      'circle-opacity': ['case', ['==', ['get', 'kindCode'], 2], 0.08, 0.22],
      'circle-blur': 0.35,
    },
  });
  map.addLayer({
    id: SAVE_POINT_LAYER_ID,
    type: 'circle',
    source: SAVE_POINT_SOURCE_ID,
    ...(hasOfficialSprite ? { filter: ['!=', ['get', 'kindCode'], 0] } : {}),
    paint: {
      'circle-radius': ['case', ['==', ['get', 'kindCode'], 0], 7, 6.5],
      'circle-color': [
        'case',
        ['==', ['get', 'kindCode'], 0], '#67c8ee',
        ['==', ['get', 'kindCode'], 1], '#e3b64e',
        '#55482d',
      ],
      'circle-opacity': ['case', ['==', ['get', 'kindCode'], 2], 0.58, 1],
      'circle-stroke-color': '#f8f1dc',
      'circle-stroke-width': 2,
    },
  });
  if (hasOfficialSprite) {
    map.addLayer({
      id: SAVE_POINT_SYMBOL_LAYER_ID,
      type: 'symbol',
      source: SAVE_POINT_SOURCE_ID,
      filter: ['==', ['get', 'kindCode'], 0],
      layout: {
        'icon-image': ['get', 'iconKey'],
        'icon-size': 0.6,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': 10_000,
      },
    });
  }
}

function createMarkerGeoJson(
  markers: readonly IndexedMarker[],
  markerStates: Uint8Array | undefined,
  frame: MarkerCatalog['coordinateSystem']['mapFrame'],
  fastTravelRestricted: boolean,
): MarkerFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map(({ marker, markerIndex }) => {
      const state = (markerStates?.[markerIndex] ?? MarkerStateCode.UNKNOWN) as MarkerStateValue;
      return {
        type: 'Feature',
        id: markerIndex,
        geometry: { type: 'Point', coordinates: gameToLngLat(marker.mapPosition.coordinate, frame) },
        properties: {
          markerIndex,
          groupCode: groupCodes[marker.group],
          state,
          iconKey: markerIconKey(marker, state, fastTravelRestricted),
          opacity: markerIconOpacity(marker, state),
          diagnosticDot: markerShowsDiagnosticDot(Boolean(markerStates), state) ? 1 : 0,
          // MFG 的低行号类别在游戏中绘制在上层；MapLibre 则以较大的
          // symbol-sort-key 后绘制，因此在这里反转稳定 Row ID。
          sortKey: -marker.id,
        },
      };
    }),
  };
}

function emptyMarkerGeoJson(): MarkerFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function selectCompletedGraceFeatures(markers: MarkerFeatureCollection): MarkerFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.features.filter((feature) => feature.properties.iconKey.startsWith('world-map-')),
  };
}

function createOfficialMarkerGeoJson(
  markers: readonly IndexedOfficialMarker[],
  markerStates: Uint8Array | undefined,
  mode: OfficialMarkerDisplayMode,
  frame: MarkerCatalog['coordinateSystem']['mapFrame'],
): OfficialMarkerFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map(({ marker, markerIndex }) => {
      const state = markerStates?.[markerIndex] ?? 0;
      const npcCandidate = isNpcMarker(marker);
      const sendingGate = isSendingGate(marker);
      const sendingGateAvailable = !markerStates || (state & OfficialMarkerStateCode.AVAILABLE) !== 0;
      return {
        type: 'Feature',
        id: markerIndex,
        geometry: { type: 'Point', coordinates: gameToLngLat(marker.mapPosition.coordinate, frame) },
        properties: {
          markerIndex,
          iconKey: sendingGate
            ? (sendingGateAvailable ? 'supplemental-sending-gate' : 'supplemental-sending-gate-locked')
            : marker.iconKey ?? `world-map-${marker.iconId}`,
          angle: marker.angle,
          sortKey: officialMarkerSortKey(marker, npcCandidate),
          state,
          opacity: mode === 'all' && npcCandidate && markerStates ? 0.62 : 1,
          iconScale: sendingGate
            ? SENDING_GATE_ICON_SCALE
            : officialMarkerIconScale(mode, npcCandidate),
          iconOffset: officialMarkerIconOffset(marker),
        },
      };
    }),
  };
}

function emptyOfficialMarkerGeoJson(): OfficialMarkerFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function createSavePoints(slot: ParsedSlotSummary | undefined, catalog: MarkerCatalog, plane: MapPlane): SavePoint[] {
  if (!slot) return [];
  const points: SavePoint[] = [];
  const player = projectSaveMapPoint(slot.playerPosition, catalog.legacyConversions);
  if (player?.plane === plane) points.push({ ...player, kind: 'player', characterName: slot.name });
  const bloodstain = projectSaveMapPoint(slot.bloodstain, catalog.legacyConversions);
  if (bloodstain?.plane === plane) {
    points.push({
      ...bloodstain,
      kind: 'bloodstain',
      characterName: slot.name,
      runes: slot.bloodstain.runes,
    });
  }
  return points;
}

function createSavePointGeoJson(
  points: readonly SavePoint[],
  frame: MarkerCatalog['coordinateSystem']['mapFrame'],
): SavePointFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point, savePointIndex) => ({
      type: 'Feature',
      id: savePointIndex,
      geometry: { type: 'Point', coordinates: gameToLngLat(point.coordinate, frame) },
      properties: {
        savePointIndex,
        kindCode: point.kind === 'player' ? 0 : (point.runes ?? 0) > 0 ? 1 : 2,
        iconKey: point.kind === 'player' ? 'player' : '',
      },
    })),
  };
}

function emptySavePointGeoJson(): SavePointFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function fitPlane(map: MapLibreMap, catalog: MarkerCatalog, plane: MapPlane): void {
  if (!catalog.markers.some((marker) => marker.plane === plane && marker.mapPosition)) return;
  const frame = catalog.coordinateSystem.mapFrame;
  map.fitBounds(gameExtentToBounds(frame.bounds, frame), { padding: 90, maxZoom: 5, duration: 0 });
}

function addMapRasterLayers(
  map: MapLibreMap,
  catalog: MarkerCatalog,
  plane: MapPlane,
  discoveryProtocolId: string | undefined,
): void {
  const manifest = catalog.mapTileManifest;
  if (!manifest) return;
  const [[west, south], [east, north]] = gameExtentToBounds(
    catalog.coordinateSystem.mapFrame.bounds,
    catalog.coordinateSystem.mapFrame,
  );
  for (const definition of [...manifest.maps].sort((left, right) => left.order - right.order)) {
    const sourceId = rasterSourceId(definition);
    const layerId = rasterLayerId(definition);
    map.addSource(sourceId, {
      type: 'raster',
      tiles: [mapTileTemplateUrl(definition.tileTemplate)],
      tileSize: manifest.tileSize,
      minzoom: manifest.minZoom,
      maxzoom: manifest.maxZoom,
      bounds: [west, south, east, north],
    });
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      layout: { visibility: definition.plane === plane ? 'visible' : 'none' },
      paint: {
        'raster-fade-duration': 0,
        'raster-resampling': 'linear',
      },
    });
  }

  if (!manifest.discovery || !discoveryProtocolId) return;
  for (const mapId of ['M00', 'M01', 'M10'] as const) {
    const id = discoveryCompositeLayerId(mapId);
    map.addSource(`${id}-source`, {
      type: 'raster',
      tiles: [discoveryTileTemplate(discoveryProtocolId, mapId, 0)],
      tileSize: manifest.tileSize,
      minzoom: manifest.minZoom,
      maxzoom: manifest.maxZoom,
      bounds: [west, south, east, north],
    });
    map.addLayer({
      id,
      type: 'raster',
      source: `${id}-source`,
      layout: { visibility: 'none' },
      paint: {
        'raster-fade-duration': 0,
        'raster-resampling': 'linear',
      },
    });
  }
}

function setRasterState(
  map: MapLibreMap,
  catalog: MarkerCatalog,
  plane: MapPlane,
  context: MapDiscoveryContext,
  discoveryProtocolId: string | undefined,
): void {
  const exploration = context.mode === 'exploration' && context.hasSave && Boolean(context.definition);
  for (const definition of catalog.mapTileManifest?.maps ?? []) {
    const layerId = rasterLayerId(definition);
    if (map.getLayer(layerId)) {
      const surfaceUnderlay = plane === 'underground' && definition.plane === 'surface';
      // 地下地图在官方界面中叠在一张完整、暗化的交界地地图之上；
      // 这张底图不随探索遮罩切碎，遮罩只作用于当前地下层。
      const visible = surfaceUnderlay || (!exploration && definition.plane === plane);
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      setRasterUnderlayAppearance(map, layerId, surfaceUnderlay);
    }
  }
  const discovery = catalog.mapTileManifest?.discovery;
  if (!discovery || !discoveryProtocolId) return;
  for (const mapId of ['M00', 'M01', 'M10'] as const) {
    const layerId = discoveryCompositeLayerId(mapId);
    const sourcePlane = mapId === 'M00' ? 'surface' : mapId === 'M01' ? 'underground' : 'shadow';
    if (map.getLayer(layerId)) {
      const visible = exploration && mapIdForPlane(plane) === mapId;
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      setRasterUnderlayAppearance(map, layerId, false);
    }
    const source = map.getSource(`${layerId}-source`);
    if (source instanceof RasterTileSource) {
      source.setTiles([discoveryTileTemplate(
        discoveryProtocolId,
        mapId,
        context.openMasks.get(sourcePlane) ?? 0,
      )]);
    }
  }
}

function setRasterUnderlayAppearance(map: MapLibreMap, layerId: string, underlay: boolean): void {
  map.setPaintProperty(layerId, 'raster-brightness-min', 0);
  map.setPaintProperty(layerId, 'raster-brightness-max', underlay ? 0.42 : 1);
  map.setPaintProperty(layerId, 'raster-saturation', underlay ? -0.35 : 0);
}

function discoveryCompositeLayerId(mapId: 'M00' | 'M01' | 'M10'): string {
  return `${MAP_DISCOVERY_RASTER_PREFIX}-composite-${mapId}`;
}

function mapIdForPlane(plane: MapPlane): 'M00' | 'M01' | 'M10' {
  if (plane === 'surface') return 'M00';
  if (plane === 'underground') return 'M01';
  return 'M10';
}

function rasterSourceId(definition: MapTileDefinition): string {
  return `${MAP_RASTER_PREFIX}-source-${definition.id}`;
}

function rasterLayerId(definition: MapTileDefinition): string {
  return `${MAP_RASTER_PREFIX}-layer-${definition.id}`;
}

function updateRegionLabelZoom(map: MapLibreMap, markers: readonly MapLibreMarker[]): void {
  const zoom = map.getZoom();
  const scale = 2 ** (zoom - 4);
  for (const marker of markers) {
    marker.getElement().style.setProperty('--map-label-scale', String(scale));
  }
}

function selectSearchCatalogMarkers(
  markers: readonly MarkerCatalogEntry[],
  plane: MapPlane,
  markerIndexes: ReadonlySet<number>,
): IndexedMarker[] {
  const result: IndexedMarker[] = [];
  markers.forEach((marker, markerIndex) => {
    if (!markerIndexes.has(markerIndex) || marker.plane !== plane || !marker.mapPosition) return;
    result.push({ marker: marker as IndexedMarker['marker'], markerIndex });
  });
  return result;
}

function selectSearchOfficialMarkers(
  markers: readonly OfficialMapMarker[],
  plane: MapPlane,
  markerIndexes: ReadonlySet<number>,
): IndexedOfficialMarker[] {
  const result: IndexedOfficialMarker[] = [];
  markers.forEach((marker, markerIndex) => {
    if (!markerIndexes.has(markerIndex) || marker.plane !== plane || !marker.mapPosition) return;
    result.push({ marker: { ...marker, mapPosition: marker.mapPosition }, markerIndex });
  });
  return result;
}

function selectVisibleOfficialMarkers(
  markers: readonly OfficialMapMarker[],
  plane: MapPlane,
  capitalState: CapitalState,
  markerStates: Uint8Array | undefined,
  mode: OfficialMarkerDisplayMode,
  visibleCategories: ReadonlySet<string>,
  mapDiscovery: MapDiscoveryContext,
): IndexedOfficialMarker[] {
  const result: IndexedOfficialMarker[] = [];
  markers.forEach((marker, markerIndex) => {
    if (marker.plane !== plane || !marker.mapPosition || (marker.iconId <= 0 && !marker.iconKey)) return;
    if (marker.capitalState && marker.capitalState !== capitalState) return;
    if (!categoryAllowsOfficialMarker(marker, visibleCategories)) return;
    if (
      isSendingGate(marker)
      && !explorationCoordinateVisible(mapDiscovery, marker.plane, marker.mapPosition.coordinate)
    ) return;
    const state = markerStates?.[markerIndex] ?? 0;
    if (!officialMarkerVisibleInMode(marker, state, markerStates !== undefined, mode)) return;
    result.push({ marker: { ...marker, mapPosition: marker.mapPosition }, markerIndex });
  });
  return result;
}

function interactiveMarkerLayers(map: MapLibreMap): string[] {
  return [
    SAVE_POINT_SYMBOL_LAYER_ID,
    SAVE_POINT_LAYER_ID,
    COMPLETED_GRACE_SYMBOL_LAYER_ID,
    MARKER_SYMBOL_LAYER_ID,
    MARKER_LAYER_ID,
    OFFICIAL_MARKER_LAYER_ID,
  ]
    .filter((layerId) => Boolean(map.getLayer(layerId)));
}

function hasMfgIconSprite(catalog: MarkerCatalog): boolean {
  return (catalog.officialMapCatalog?.iconSprite.mfgIconCount ?? 0) > 0;
}

function resolvedMarkerTexts(marker: MarkerCatalogEntry, catalog: MarkerCatalog): MarkerTextEntry[] {
  const entries = catalog.markerTextCatalog?.entries;
  if (!entries) return [];
  return marker.textIds
    .map((textId) => entries[String(textId)])
    .filter((entry): entry is MarkerTextEntry => Boolean(entry));
}

function catalogMarkerTitle(marker: MarkerCatalogEntry, catalog: MarkerCatalog, locale: string): string {
  const text = resolvedMarkerTexts(marker, catalog)
    .map((entry) => localizedText(entry.labels, locale))
    .find(Boolean);
  return text || `标记 #${marker.id}`;
}

function officialMarkerStatus(
  marker: OfficialMapMarker,
  markerIndex: number,
  slot: ParsedSlotSummary | undefined,
): string {
  if (!slot) {
    if (isSendingGate(marker)) return '传送门 · 可用状态未知';
    return marker.textSlots.some((textSlot) => textSlot.kind === 'npc') ? 'NPC 候选位置' : '官方地图点';
  }
  const state = slot.officialMarkerStates[markerIndex] ?? 0;
  if (isSendingGate(marker)) {
    return (state & OfficialMarkerStateCode.AVAILABLE) !== 0
      ? '传送门 · 可以使用'
      : '传送门 · 尚不可用';
  }
  const values: string[] = [];
  if ((state & OfficialMarkerStateCode.VISIBLE) !== 0) values.push('游戏内可见');
  if ((state & OfficialMarkerStateCode.NPC_CURRENT) !== 0) values.push('NPC 当前阶段');
  if ((state & OfficialMarkerStateCode.NPC_DISCOVERED) !== 0) values.push('位置已发现');
  if ((state & OfficialMarkerStateCode.CLEARED) !== 0) values.push('已完成');
  return values.join(' · ') || '当前存档未显示';
}

function officialNpcSlotStatus(textStateIndex: number, states: Uint8Array | undefined): string {
  if (!states) return '候选位置';
  const state = states[textStateIndex] ?? 0;
  const values: string[] = [];
  if ((state & OfficialTextStateCode.PRIMARY_ACTIVE) !== 0) values.push('当前阶段');
  if ((state & OfficialTextStateCode.DISCOVERED) !== 0) values.push('已发现');
  if ((state & OfficialTextStateCode.VISIBLE) !== 0) values.push('游戏内可见');
  return values.join(' · ') || '条件未满足';
}

function stateAt(states: Uint8Array | undefined, index: number): MarkerStateValue {
  return (states?.[index] ?? MarkerStateCode.UNKNOWN) as MarkerStateValue;
}

function evidenceLabel(marker: MarkerCatalogEntry): string {
  if (marker.collectionFlags.length > 0) return '事件旗标';
  if (marker.geomSlot >= 0) return 'GEOM/GEOF（待解析）';
  return '不可跟踪世界设施';
}

function inspectedKey(item: InspectedItem | undefined): string | undefined {
  if (!item) return undefined;
  if (item.type === 'catalog') return `catalog:${item.markerIndex}`;
  if (item.type === 'official') return `official:${item.markerIndex}`;
  return `save:${item.point.kind}`;
}

function savePointTitle(point: SavePoint): string {
  if (point.kind === 'player') return `${point.characterName} · 当前位置`;
  return (point.runes ?? 0) > 0 ? '遗失的卢恩' : '上次死亡位置';
}

function savePointStatus(point: SavePoint, locale: string): string {
  if (point.kind === 'player') return '角色当前存档位置';
  return (point.runes ?? 0) > 0
    ? `${point.runes!.toLocaleString(locale)} 卢恩等待回收`
    : '卢恩已经回收';
}

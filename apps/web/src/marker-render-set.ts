import type { MapPlane, MarkerCatalogEntry } from './dataset';
import type { CapitalState } from './capital-state';
import { explorationMarkerVisibility, type MapDiscoveryContext } from './map-discovery';

export interface IndexedMarker {
  marker: RenderableMarker;
  markerIndex: number;
}

type RenderableMarker = MarkerCatalogEntry & { mapPosition: NonNullable<MarkerCatalogEntry['mapPosition']> };

/**
 * 只把当前平面和可见分类交给渲染器。使用 WebGL 样式变量隐藏标记仍会让
 * 顶点进入每一帧绘制，对低缩放级别尤其不利。
 */
export function selectVisibleMarkers(
  markers: readonly MarkerCatalogEntry[],
  plane: MapPlane,
  visibleCategories: ReadonlySet<string>,
  capitalState: CapitalState,
  discoveryContext?: MapDiscoveryContext,
  markerStates?: Uint8Array,
): IndexedMarker[] {
  const selected: IndexedMarker[] = [];
  markers.forEach((marker, markerIndex) => {
    const capitalVisible = !marker.capitalState || marker.capitalState === capitalState;
    const explorationVisible = !discoveryContext
      || explorationMarkerVisibility(discoveryContext, marker, markerIndex, markerStates) !== 'hidden';
    if (marker.mapPosition && marker.plane === plane && capitalVisible && explorationVisible && visibleCategories.has(marker.category)) {
      selected.push({ marker: marker as RenderableMarker, markerIndex });
    }
  });
  return selected;
}

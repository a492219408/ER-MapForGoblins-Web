import type { MarkerCatalogEntry } from './dataset';
import { MarkerStateCode, type MarkerStateCode as MarkerStateValue } from './marker-state';

type MarkerIconSource = Pick<MarkerCatalogEntry, 'category' | 'iconId'>;

/** 已激活赐福相对于普通 MFG 标记单元格的渲染倍率。 */
export const COMPLETED_GRACE_ICON_SCALE = 2.2;

/**
 * 未激活的赐福继续使用 Map for Goblins 的发光提示；激活后则改用
 * 游戏自己的圆形赐福图标。两者仍然是同一个目录标记，不会影响计数。
 */
export function markerIconKey(
  marker: MarkerIconSource,
  state: MarkerStateValue,
  fastTravelRestricted = false,
): string {
  if (marker.category === 'WorldGraces' && state === MarkerStateCode.COLLECTED) {
    return fastTravelRestricted ? 'world-map-2' : 'world-map-1';
  }
  return `mfg-${marker.iconId}`;
}

export function markerIconOpacity(marker: MarkerIconSource, state: MarkerStateValue): number {
  if (marker.category === 'WorldGraces' && state === MarkerStateCode.COLLECTED) return 1;
  // 地图碎片的纸卷图标本身颜色很浅，沿用通用 0.3 会在暗色地图上近似
  // 消失，只剩尚未取得的 #8607 一类高亮图标容易被看见。
  if (marker.category === 'WorldMaps' && state === MarkerStateCode.COLLECTED) return 0.72;
  if (state === MarkerStateCode.COLLECTED) return 0.3;
  if (state === MarkerStateCode.LOCKED) return 0.58;
  if (state === MarkerStateCode.UNKNOWN) return 0.68;
  return 1;
}

/**
 * 官方圆形赐福纹理在 128 px 精灵单元里只有约 78 px，MFG 收集品通常有
 * 120 px。单独补偿它的有效内容尺寸，使已激活赐福略大于普通收集品。
 */
export function markerIconScaleFactor(marker: MarkerIconSource, state: MarkerStateValue): number {
  return marker.category === 'WorldGraces' && state === MarkerStateCode.COLLECTED
    ? COMPLETED_GRACE_ICON_SCALE
    : 1;
}

/**
 * 通用圆点只作为已加载存档时的诊断提示保留。没有存档导致的“状态未知”
 * 不代表数据本身尚未确认，不能让所有正式图标重新垫上一层圆点。
 */
export function markerShowsDiagnosticDot(hasSaveState: boolean, state: MarkerStateValue): boolean {
  return hasSaveState && state === MarkerStateCode.UNKNOWN;
}

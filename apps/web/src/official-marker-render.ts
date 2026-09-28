import { localizedText, type OfficialMapMarker } from './dataset';
import { OfficialMarkerStateCode, OfficialTextStateCode } from './official-marker-state';

export type OfficialMarkerDisplayMode = 'visible' | 'npc-current' | 'all';

export const GUIDANCE_OF_GRACE_ICON_ID = 83;

export function isNpcMarker(marker: OfficialMapMarker): boolean {
  return marker.textSlots.some((slot) => slot.kind === 'npc');
}

export function isGuidanceOfGrace(marker: OfficialMapMarker): boolean {
  return marker.iconId === GUIDANCE_OF_GRACE_ICON_ID;
}

export function isSendingGate(marker: OfficialMapMarker): boolean {
  return marker.iconKey === 'supplemental-sending-gate';
}

export function officialMarkerVisibleInMode(
  marker: OfficialMapMarker,
  state: number,
  markerStatesAvailable: boolean,
  mode: OfficialMarkerDisplayMode,
): boolean {
  if (mode === 'all' || !markerStatesAvailable) return mode !== 'npc-current';
  if (mode === 'npc-current') {
    return isNpcMarker(marker) && (state & OfficialMarkerStateCode.NPC_CURRENT) !== 0;
  }
  // 传送门是始终存在的地图实体；尚不可用时保留位置，图标改画为无旋涡。
  return isSendingGate(marker) || (state & OfficialMarkerStateCode.VISIBLE) !== 0;
}

/**
 * 赐福引导是赐福点的附属视觉，不提供独立命中区域。这样两张纹理重叠时，
 * 用户点击的始终是更常用的赐福点；引导详情由赐福点面板承载。
 */
export function isOfficialMarkerInteractive(marker: OfficialMapMarker): boolean {
  return !isGuidanceOfGrace(marker);
}

export function officialMarkerTitle(
  marker: OfficialMapMarker,
  locale: string,
  textStates?: Uint8Array,
): string {
  if (isGuidanceOfGrace(marker)) return locale.startsWith('zh') ? '赐福的指引' : 'Guidance of Grace';

  // NPC 行没有独立的地点 FMG 时，Paramdex 仍会带一条英文开发者标签。
  // 先使用游戏 NpcName FMG，避免中文界面退回英文开发者元数据。
  const npcName = marker.textSlots
    .filter((slot) => slot.kind === 'npc')
    .sort((left, right) => {
      if (!textStates) return left.slot - right.slot;
      const leftActive = (textStates[left.textStateIndex] & OfficialTextStateCode.PRIMARY_ACTIVE) !== 0;
      const rightActive = (textStates[right.textStateIndex] & OfficialTextStateCode.PRIMARY_ACTIVE) !== 0;
      return Number(rightActive) - Number(leftActive) || left.slot - right.slot;
    })
    .map((slot) => localizedText(slot.labels, locale))
    .find(Boolean);
  if (npcName) return npcName;

  return localizedText(marker.labels, locale) || marker.paramdexName || `官方标记 #${marker.id}`;
}

export function officialMarkerEvidence(marker: OfficialMapMarker): string {
  if (marker.source?.kind === 'msb-npc-event') return 'MSB 实体 + EMEVD 任务旗标';
  if (marker.source?.kind === 'msb-asset') return 'MSB 地图实体';
  return 'WorldMapPointParam';
}

export function guidanceForGrace(
  grace: { plane: string; mapPosition: { coordinate: readonly [number, number] } | null },
  officialMarkers: readonly OfficialMapMarker[],
  maximumDistance = 20,
): OfficialMapMarker[] {
  if (!grace.mapPosition) return [];
  const [graceX, graceY] = grace.mapPosition.coordinate;
  return officialMarkers.filter((marker) => {
    if (!isGuidanceOfGrace(marker) || marker.plane !== grace.plane || !marker.mapPosition) return false;
    const [markerX, markerY] = marker.mapPosition.coordinate;
    return Math.hypot(markerX - graceX, markerY - graceY) <= maximumDistance;
  });
}

export function officialMarkerSortKey(marker: OfficialMapMarker, npcCandidate: boolean): number {
  // icon 84（指引）和 icon 85（地点）共用坐标；MapLibre 以较大的
  // symbol-sort-key 后绘制，因此方向指引必须比地点底图高一层。
  const catacombGuidancePart = marker.iconId === 84 ? 2 : marker.iconId === 85 ? 1 : 0;
  return marker.zPriority + (npcCandidate ? 10 : 0) + catacombGuidancePart;
}

export function officialMarkerIconScale(mode: OfficialMarkerDisplayMode, npcCandidate: boolean): number {
  return mode === 'npc-current' && npcCandidate ? 0.68 : 0.42;
}

export function officialMarkerIconOffset(marker: OfficialMapMarker): [number, number] {
  // 两种引导图标在官方纹理中的头部方向相反：赐福引导（83）的头部朝上，
  // 地下墓地引导（84）的尖端朝下。偏移会随 icon-rotate 一起旋转。
  // 83 的有效纹理高约 120 px，因此移动接近半个纹理高度，让细尾端而
  // 不是图标中心落在赐福坐标上，圆形赐福才能与引导同时露出。
  if (marker.iconId === 83) return [0, 80];
  if (marker.iconId === 84) return [0, 24];
  return [0, 0];
}

export function categoryAllowsOfficialMarker(
  marker: OfficialMapMarker,
  visibleCategories: ReadonlySet<string>,
): boolean {
  // Guidance of Grace 是赐福的附属视觉，不作为独立分类显示。
  return !isGuidanceOfGrace(marker) || visibleCategories.has('WorldGraces');
}

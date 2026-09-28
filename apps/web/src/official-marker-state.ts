import type { OfficialMapMarker, OfficialMapTextSlot } from './dataset';

export const OfficialMarkerStateCode = {
  VISIBLE: 1 << 0,
  NPC_CURRENT: 1 << 1,
  NPC_DISCOVERED: 1 << 2,
  CLEARED: 1 << 3,
  AVAILABLE: 1 << 4,
} as const;

export const OfficialTextStateCode = {
  PRIMARY_ACTIVE: 1 << 0,
  DISCOVERED: 1 << 1,
  VISIBLE: 1 << 2,
} as const;

export interface DerivedOfficialMarkerStates {
  markerStates: Uint8Array;
  textStates: Uint8Array;
}

/**
 * 按游戏参数中的两组旗标分别保留“任务阶段”和“位置发现”证据。
 * 不把它们提前合并为单一布尔值，后续 NPC 流程图仍可复用同一目录。
 */
export function deriveOfficialMarkerStates(
  markers: readonly OfficialMapMarker[],
  textStateCount: number,
  readFlag: (flagId: number) => boolean | undefined,
): DerivedOfficialMarkerStates {
  const markerStates = new Uint8Array(markers.length);
  const textStates = new Uint8Array(textStateCount);
  markers.forEach((marker, markerIndex) => {
    const open = enabled(marker.openEventFlagId, readFlag);
    let hasVisibleText = false;
    let hasCurrentNpc = false;
    let hasDiscoveredNpc = false;
    for (const slot of marker.textSlots) {
      const state = deriveTextState(slot, open, readFlag);
      textStates[slot.textStateIndex] = state;
      hasVisibleText ||= (state & OfficialTextStateCode.VISIBLE) !== 0;
      if (slot.kind === 'npc') {
        hasCurrentNpc ||= open && (state & OfficialTextStateCode.PRIMARY_ACTIVE) !== 0;
        hasDiscoveredNpc ||= (state & OfficialTextStateCode.DISCOVERED) !== 0;
      }
    }
    let state = 0;
    if (open && (marker.showWithoutText || hasVisibleText)) state |= OfficialMarkerStateCode.VISIBLE;
    if (hasCurrentNpc) state |= OfficialMarkerStateCode.NPC_CURRENT;
    if (hasDiscoveredNpc) state |= OfficialMarkerStateCode.NPC_DISCOVERED;
    if (marker.clearedEventFlagId > 0 && readFlag(marker.clearedEventFlagId) === true) {
      state |= OfficialMarkerStateCode.CLEARED;
    }
    // AVAILABLE 只描述补充传送门的交互状态，不能加到全部官方标记上，
    // 否则会改变既有 VISIBLE / NPC / CLEARED 位掩码的语义。
    if (marker.iconKey === 'supplemental-sending-gate') {
      const available = marker.availableWhenAny === undefined
        ? open
        : marker.availableWhenAny.some((predicate) => predicateMatches(predicate, readFlag));
      // 可交互的传送门必须继续显示；某些地图点会在启用后关闭自己的
      // 地点文字（例如 #81463900），那不是隐藏传送门本体的证据。
      if (available) state |= OfficialMarkerStateCode.AVAILABLE | OfficialMarkerStateCode.VISIBLE;
    }
    markerStates[markerIndex] = state;
  });
  return { markerStates, textStates };
}

function deriveTextState(
  slot: OfficialMapTextSlot,
  markerOpen: boolean,
  readFlag: (flagId: number) => boolean | undefined,
): number {
  const supplementalPredicate = slot.activeWhenAny === undefined
    || slot.activeWhenAny.some((predicate) => predicateMatches(predicate, readFlag));
  const primary = supplementalPredicate
    && enabled(slot.enableFlagId, readFlag)
    && notDisabled(slot.disableFlagId, readFlag);
  const secondary = enabled(slot.secondaryEnableFlagId, readFlag)
    && notDisabled(slot.secondaryDisableFlagId, readFlag);
  // 没有第二组发现旗标的文字，其“已发现”状态只能由实际可见性证明。
  const discovered = slot.secondaryEnableFlagId > 0 ? secondary : markerOpen && primary;
  let state = 0;
  if (primary) state |= OfficialTextStateCode.PRIMARY_ACTIVE;
  if (discovered) state |= OfficialTextStateCode.DISCOVERED;
  if (markerOpen && primary && secondary) state |= OfficialTextStateCode.VISIBLE;
  return state;
}

function predicateMatches(
  predicate: { enabledFlagIds: readonly number[]; disabledFlagIds: readonly number[] },
  readFlag: (flagId: number) => boolean | undefined,
): boolean {
  return predicate.enabledFlagIds.every((flagId) => readFlag(flagId) === true)
    && predicate.disabledFlagIds.every((flagId) => readFlag(flagId) !== true);
}

function enabled(flagId: number, readFlag: (flagId: number) => boolean | undefined): boolean {
  return flagId <= 0 || flagId === 6001 || readFlag(flagId) === true;
}

function notDisabled(flagId: number, readFlag: (flagId: number) => boolean | undefined): boolean {
  return flagId <= 0 || readFlag(flagId) !== true;
}

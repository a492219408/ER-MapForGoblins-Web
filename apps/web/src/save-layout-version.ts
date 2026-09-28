export const MAX_VERIFIED_SAVE_LAYOUT_VERSION = 260;
export const LEGACY_GA_ITEM_MAX_VERSION = 81;
export const LEGACY_GA_ITEM_COUNT = 5_118;
export const MODERN_GA_ITEM_COUNT = 5_120;

/**
 * 1.17 将 PC 槽位版本从 252 提升到 260，但动态物品表与后续地图、装备
 * 布局保持不变。未知的更高版本必须先用受控样本验证，不能静默套用旧偏移。
 */
export function assertSupportedSaveLayoutVersion(version: number): void {
  if (!Number.isInteger(version) || version <= 0) throw new Error(`存档布局版本无效：${version}`);
  if (version > MAX_VERIFIED_SAVE_LAYOUT_VERSION) {
    throw new Error(`存档布局版本 ${version} 高于已验证上限 ${MAX_VERIFIED_SAVE_LAYOUT_VERSION}`);
  }
}

export function gaItemCountForSaveVersion(version: number): number {
  assertSupportedSaveLayoutVersion(version);
  return version <= LEGACY_GA_ITEM_MAX_VERSION ? LEGACY_GA_ITEM_COUNT : MODERN_GA_ITEM_COUNT;
}

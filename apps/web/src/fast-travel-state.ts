import type { SaveMapId } from './slot-map-state';

export type FastTravelRestrictionReason = 'transport-trap' | 'uncleared-dungeon-boss';

export interface FastTravelState {
  restricted: boolean;
  reason?: FastTravelRestrictionReason;
  evidenceFlagId?: number;
}

type EventFlagReader = (flagId: number) => boolean | undefined;

/**
 * 陷阱宝箱传送后的持久化限制旗标。官方 common EMEVD 会在该旗标开启时
 * 施加禁止传送状态，并在满足解除条件后关闭它。
 */
export const TRANSPORT_TRAP_RESTRICTION_FLAG_ID = 9080;

/**
 * 只推断已经由成对存档和官方参数共同验证的持久化限制。战斗、联机等
 * 纯运行时限制不会可靠写入存档，因此不在这里猜测。
 */
export function deriveFastTravelState(mapId: SaveMapId, readFlag: EventFlagReader): FastTravelState {
  if (readFlag(TRANSPORT_TRAP_RESTRICTION_FLAG_ID) === true) {
    return {
      restricted: true,
      reason: 'transport-trap',
      evidenceFlagId: TRANSPORT_TRAP_RESTRICTION_FLAG_ID,
    };
  }

  const bossFlagId = legacyMiniDungeonBossFlagId(mapId);
  if (bossFlagId !== undefined && readFlag(bossFlagId) === false) {
    return {
      restricted: true,
      reason: 'uncleared-dungeon-boss',
      evidenceFlagId: bossFlagId,
    };
  }

  return { restricted: false };
}

/**
 * 本体小型地下城使用 m30..m39 地图族，Boss 事件旗标遵循
 * AAXXZZ800。例：m31_03_00_00 -> 31030800（近林洞窟）。
 */
export function legacyMiniDungeonBossFlagId(mapId: SaveMapId): number | undefined {
  // 不同存档字段会以正序或小端字节序保存地图 ID；与坐标投影相同，
  // 同时检查两种顺序，再只接受明确的小型地下城区域号。
  const candidates: SaveMapId[] = [mapId, [mapId[3], mapId[2], mapId[1], mapId[0]]];
  for (const [area, gridX, gridZ] of candidates) {
    if (area >= 30 && area <= 39) {
      return area * 1_000_000 + gridX * 10_000 + gridZ * 100 + 800;
    }
  }
  return undefined;
}

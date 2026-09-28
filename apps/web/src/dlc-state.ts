export type DlcEvidence = 'NONE' | 'CURRENT_MAP_AREA_61' | 'VISITED_DLC_LOCATION';

const SHADOW_REALM_AREA = 61;
const DLC_LOCATION_ID_START = 6_800_000;
const DLC_LOCATION_ID_END = 7_000_000;

interface RegionLike {
  regionId?: number;
}

/**
 * 存档没有“当前 Steam 账号拥有 DLC”的可靠布尔字段。这里只报告槽位中已经写入的
 * DLC 内容证据：角色当前位于 area 61，或访问记录含幽影之地的位置文本 ID。
 */
export function detectDlcEvidence(mapId: string | undefined, regions: readonly RegionLike[] | undefined): DlcEvidence {
  if (mapAreaFromId(mapId) === SHADOW_REALM_AREA) return 'CURRENT_MAP_AREA_61';
  if (regions?.some(({ regionId }) => (
    regionId !== undefined && regionId >= DLC_LOCATION_ID_START && regionId < DLC_LOCATION_ID_END
  ))) {
    return 'VISITED_DLC_LOCATION';
  }
  return 'NONE';
}

function mapAreaFromId(mapId: string | undefined): number | undefined {
  const normalized = mapId?.trim();
  if (!normalized || !/^[0-9a-f]{8}$/i.test(normalized)) return undefined;
  return Number.parseInt(normalized.slice(-2), 16);
}

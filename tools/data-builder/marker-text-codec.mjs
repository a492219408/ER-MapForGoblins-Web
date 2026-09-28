const TEXT_BANDS = [
  { minimum: 1_600_000_000, maximum: 1_700_000_000, table: 'NpcName', offset: 700_000_000, kind: 'npc' },
  { minimum: 950_000_000, maximum: 960_000_000, table: 'BloodMsg', offset: 950_000_000, kind: 'enemy-type' },
  { minimum: 900_000_000, maximum: 950_000_000, table: 'TutorialTitle', offset: 900_000_000, kind: 'enemy' },
  { minimum: 800_000_000, maximum: 900_000_000, table: 'ActionButtonText', offset: 800_000_000, kind: 'interaction' },
  { minimum: 700_000_000, maximum: 800_000_000, table: 'NpcName', offset: 700_000_000, kind: 'npc' },
  { minimum: 500_000_000, maximum: 600_000_000, table: 'GoodsName', offset: 500_000_000, kind: 'goods' },
  { minimum: 400_000_000, maximum: 500_000_000, table: 'GemName', offset: 400_000_000, kind: 'ash-of-war' },
  { minimum: 300_000_000, maximum: 400_000_000, table: 'AccessoryName', offset: 300_000_000, kind: 'talisman' },
  { minimum: 200_000_000, maximum: 300_000_000, table: 'ProtectorName', offset: 200_000_000, kind: 'armour' },
  { minimum: 100_000_000, maximum: 200_000_000, table: 'WeaponName', offset: 100_000_000, kind: 'weapon' },
  { minimum: 1, maximum: 100_000_000, table: 'PlaceName', offset: 0, kind: 'place' },
];

/**
 * MapForGoblins 把不同 FMG 表的 ID 编码到互不冲突的整数区间。
 * 这里严格复刻 DLL 的区间约定；600M 区间为保留区，不猜测来源。
 */
export function decodeMarkerTextId(encodedId) {
  if (!Number.isInteger(encodedId) || encodedId <= 0) return undefined;
  const band = TEXT_BANDS.find(({ minimum, maximum }) => encodedId >= minimum && encodedId < maximum);
  if (!band) return undefined;
  return {
    encodedId,
    sourceId: encodedId - band.offset,
    table: band.table,
    kind: band.kind,
  };
}

export function usableFmgText(value) {
  const text = String(value ?? '').trim();
  return text && text !== '%null%' && text !== '[ERROR]' ? text : undefined;
}

import { describe, expect, it } from 'vitest';
import { CharacterLoadoutError, deriveMemorySlotCount, parseCharacterLoadout } from './character-loadout';

const SLOT_SIZE = 2_621_456;
const SLOT_START = 768;
const EMPTY = 0xffff_ffff;

describe('parseCharacterLoadout', () => {
  it('reads verified equipment, goods, spells and inventory counts', () => {
    const fixture = createFixture();
    const result = parseCharacterLoadout(fixture, 0);

    expect(result.rightHand.map((item) => item?.id)).toEqual([2_190_000, 1_030_100, 22_020_001]);
    expect(result.leftHand.map((item) => item?.id)).toEqual([33_280_000, 34_080_000, 41_000_000]);
    expect(result.armor).toEqual({
      head: undefined,
      chest: { id: 1_020_100, kind: 'armor', handle: 0x9000_000d },
      arms: { id: 1_020_200, kind: 'armor', handle: 0x9000_000e },
      legs: { id: 1_020_300, kind: 'armor', handle: 0x9000_000f },
    });
    expect(result.talismans.map((item) => item?.id)).toEqual([1_221, 1_090, 1_051, 1_080]);
    expect(result.quickItems.map((item) => item?.id)).toEqual([1_025, 1_075, 1_730, 250, undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(result.pouchItems.map((item) => item?.id)).toEqual([130, 2_140, 3_500, 2_070, 2_040, 1_200]);
    expect(result.memorizedSpells.slice(0, 4)).toEqual([7_030, 7_020, 6_210, 4_670]);
    expect(result.memorySlotCount).toBe(2);
    expect(result.activeSpellSlot).toBe(3);
    expect(result.activeLeftHandSlot).toBe(0);
    expect(result.activeRightHandSlot).toBe(1);
    expect(result.activeQuickItemSlot).toBe(2);
    expect(result.greatRune).toEqual({ id: 191, kind: 'goods', handle: 0xb000_00bf });
    expect(result.ageGroup).toBe('young');
    expect(result.rightHand[1]).toMatchObject({
      baseId: 1_030_000,
      upgradeLevel: 0,
      affinityId: 1,
      ashOfWarId: 60_200,
    });
    expect(result.rightHand[2]).toMatchObject({
      baseId: 22_020_000,
      upgradeLevel: 1,
      affinityId: 0,
    });
    expect(result.inventory).toEqual({
      heldCommonDistinctCount: 1_170,
      heldKeyDistinctCount: 84,
      storedCommonDistinctCount: 294,
      storedKeyDistinctCount: 17,
      heldItems: [],
      storedItems: [
        {
          id: 3_200_000,
          kind: 'weapon',
          handle: 0x8080_0247,
          baseId: 3_200_000,
          upgradeLevel: 0,
          affinityId: 0,
          quantity: 1,
          inventoryIndex: 1_056,
          keyItem: false,
        },
        { id: 15_160, kind: 'goods', handle: 0xb000_3b38, quantity: 1, inventoryIndex: 1_058, keyItem: false },
      ],
    });
  });

  it('normalizes the unequipped head placeholder and item sentinels', () => {
    const result = parseCharacterLoadout(createFixture({ unequippedRightHand: true, ageValue: 21 }), 0);
    expect(result.armor.head).toBeUndefined();
    expect(result.rightHand[0]).toBeUndefined();
    expect(result.quickItems[4]).toBeUndefined();
    expect(result.memorizedSpells[4]).toBeUndefined();
    expect(result.ageGroup).toBe('mature');
  });

  it('normalizes every unequipped armor placeholder', () => {
    const result = parseCharacterLoadout(createFixture({ unequippedArmor: true }), 0);
    expect(result.armor).toEqual({ head: undefined, chest: undefined, arms: undefined, legs: undefined });
  });

  it('accepts the 1.17 slot layout version without shifting loadout offsets', () => {
    const result = parseCharacterLoadout(createFixture({ version: 260 }), 0);
    expect(result.rightHand[0]?.id).toBe(2_190_000);
    expect(result.activeQuickItemSlot).toBe(2);
    expect(result.inventory.storedItems).toHaveLength(2);
  });

  it('derives usable memory slots from Memory Stones and Moon of Nokstella', () => {
    const memoryStones = [{
      id: 10_030, kind: 'goods' as const, quantity: 8, inventoryIndex: 0, keyItem: true,
    }];
    expect(deriveMemorySlotCount(memoryStones, [])).toBe(10);
    expect(deriveMemorySlotCount(memoryStones, [{ id: 1_140, kind: 'talisman' }])).toBe(12);
  });

  it('rejects a truncated slot before reading dynamic records', () => {
    expect(() => parseCharacterLoadout(new ArrayBuffer(SLOT_START + 64), 0))
      .toThrow(new CharacterLoadoutError('角色槽位数据被截断'));
  });
});

function createFixture({
  unequippedRightHand = false,
  unequippedArmor = false,
  ageValue = 20,
  version = 252,
}: { unequippedRightHand?: boolean; unequippedArmor?: boolean; ageValue?: number; version?: number } = {}): ArrayBuffer {
  const buffer = new ArrayBuffer(SLOT_START + SLOT_SIZE);
  const view = new DataView(buffer);
  view.setUint32(SLOT_START + 16, version, true);
  let offset = SLOT_START + 48;
  const gaItems = [
    { handle: 0x8000_0002, itemId: 1_030_100, ashOfWarHandle: 0xc000_0001 },
    { handle: 0xc000_0001, itemId: 0x8000_0000 + 60_200 },
    { handle: 0x8000_0003, itemId: 22_020_001, ashOfWarHandle: 0 },
    { handle: 0x8080_0247, itemId: 3_200_000, ashOfWarHandle: 0 },
  ];
  for (const item of gaItems) {
    view.setUint32(offset, item.handle, true);
    view.setUint32(offset + 4, item.itemId, true);
    offset += 8;
    if (item.handle >>> 28 !== 0xc) offset += 8;
    if (item.handle >>> 28 === 0x8) {
      view.setUint32(offset, item.ashOfWarHandle ?? 0, true);
      offset += 5;
    }
  }
  offset += (5_120 - gaItems.length) * 8;
  offset += 0x1b0 + 0xd0;
  offset += 22 * 4;
  writeU32Array(view, offset, [1, 0, 1, 0, 0, 0, 0]);
  offset += 7 * 4;

  const equipmentIds = [
    33_280_000, unequippedRightHand ? 110_000 : 2_190_000, 34_080_000, 1_030_100, 41_000_000, 22_020_001,
    50_300_000, 53_020_000, 50_020_000, 53_010_000, EMPTY, EMPTY,
    10_000, unequippedArmor ? 10_100 : 1_020_100, unequippedArmor ? 10_200 : 1_020_200, unequippedArmor ? 10_300 : 1_020_300, EMPTY,
    1_221, 1_090, 1_051, 1_080, EMPTY,
  ];
  writeU32Array(view, offset, equipmentIds);
  offset += 22 * 4;
  const equipmentHandles = equipmentIds.map((_, index) => 0x9000_0000 + index);
  equipmentHandles[1] = 0x8000_0001;
  equipmentHandles[3] = 0x8000_0002;
  equipmentHandles[5] = 0x8000_0003;
  writeU32Array(view, offset, equipmentHandles);
  offset += 22 * 4;

  view.setUint32(offset, 1_170, true);
  view.setUint32(offset + 4 + 2_688 * 12, 84, true);
  offset += 36_880;

  const spells = [7_030, 7_020, 6_210, 4_670, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
  spells.forEach((id, index) => view.setInt32(offset + index * 8, id, true));
  offset += 14 * 8;
  view.setInt32(offset, 3, true);
  offset += 4;
  offset += 10 * 8;
  view.setUint32(offset, 2, true);
  offset += 4 + 6 * 8;
  view.setUint32(offset, 0xb000_00bf, true);
  view.setUint32(offset + 4, 55, true);
  offset += 8;
  offset += 24;
  view.setUint32(offset, 0, true);
  offset += 4;

  const mirror = Array.from({ length: 39 }, () => EMPTY);
  [1_025, 1_075, 1_730, 250].forEach((id, index) => { mirror[22 + index] = 0x4000_0000 + id; });
  [130, 2_140, 3_500, 2_070, 2_040, 1_200].forEach((id, index) => { mirror[32 + index] = 0x4000_0000 + id; });
  writeU32Array(view, offset, mirror);
  offset += 39 * 4 + 12;
  view.setUint8(offset + 16, ageValue);
  offset += 303;

  view.setUint32(offset, 294, true);
  view.setUint32(offset + 4, 0x8080_0247, true);
  view.setUint32(offset + 8, 1, true);
  view.setUint32(offset + 12, 1_056, true);
  view.setUint32(offset + 16, 0xb000_3b38, true);
  view.setUint32(offset + 20, 1, true);
  view.setUint32(offset + 24, 1_058, true);
  view.setUint32(offset + 4 + 1_920 * 12, 17, true);
  return buffer;
}

function writeU32Array(view: DataView, offset: number, values: readonly number[]): void {
  values.forEach((value, index) => view.setUint32(offset + index * 4, value, true));
}

import type {
  CharacterAgeGroup,
  ParsedCharacterLoadout,
  ParsedEquippedItem,
  ParsedInventoryItem,
  ParsedItemKind,
} from './save-parser-protocol';
import { gaItemCountForSaveVersion } from './save-layout-version';

const SLOT_SIZE = 2_621_456;
const SLOT_START = 768;
const EMPTY_ITEM_ID = 0xffff_ffff;
const UNEQUIPPED_WEAPON_ID = 110_000;
const PLAYER_GAME_DATA_LENGTH = 0x1b0;
const SPECIAL_EFFECTS_LENGTH = 0xd0;
const EQUIPMENT_SLOT_COUNT = 22;
const HELD_INVENTORY_LENGTH = 36_880;
const SPELL_SLOT_COUNT = 14;
const BASE_MEMORY_SLOT_COUNT = 2;
const MAX_USABLE_MEMORY_SLOT_COUNT = 12;
const MEMORY_STONE_GOODS_ID = 10_030;
const MOON_OF_NOKSTELLA_TALISMAN_ID = 1_140;
const QUICK_ITEM_COUNT = 10;
const POUCH_ITEM_COUNT = 6;
const REDUNDANT_EQUIPMENT_COUNT = 39;
const STORAGE_LENGTH = 24_592;

const EQUIPMENT = {
  leftHand: [0, 2, 4],
  rightHand: [1, 3, 5],
  arrows: [6, 8],
  bolts: [7, 9],
  armor: [12, 13, 14, 15],
  talismans: [17, 18, 19, 20],
} as const;

const UNEQUIPPED_ARMOR_IDS = new Map<number, number>([
  [EQUIPMENT.armor[0], 10_000],
  [EQUIPMENT.armor[1], 10_100],
  [EQUIPMENT.armor[2], 10_200],
  [EQUIPMENT.armor[3], 10_300],
]);

interface GaItemRecord {
  itemId: number;
  ashOfWarHandle?: number;
}

/**
 * Reads only the character loadout records whose boundaries have been checked
 * against controlled single-change fixtures. This runs inside the save Worker.
 */
export function parseCharacterLoadout(buffer: ArrayBuffer, slotIndex: number): ParsedCharacterLoadout {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 10) {
    throw new CharacterLoadoutError(`角色槽位索引超出范围：${slotIndex}`);
  }

  const reader = new LittleEndianReader(buffer);
  const slotStart = SLOT_START + slotIndex * SLOT_SIZE;
  reader.ensure(slotStart, SLOT_SIZE, '角色槽位');
  const version = reader.u32(slotStart + 16);
  let offset = slotStart + 48;
  const gaItemCount = gaItemCountForSaveVersion(version);
  const gaItems = new Map<number, GaItemRecord>();

  for (let index = 0; index < gaItemCount; index += 1) {
    const handle = reader.u32(offset);
    const itemId = reader.u32(offset + 4);
    offset += 8;
    if (handle === 0) continue;
    const itemClass = handle >>> 28;
    if (itemClass !== 0xc) offset += 8;
    const ashOfWarHandle = itemClass === 0x8 ? reader.u32(offset) : undefined;
    if (itemClass === 0x8) offset += 5;
    gaItems.set(handle, { itemId, ashOfWarHandle });
    reader.ensure(offset, 0, '动态物品表');
  }

  offset += PLAYER_GAME_DATA_LENGTH + SPECIAL_EFFECTS_LENGTH;
  offset += EQUIPMENT_SLOT_COUNT * 4; // EquipmentInventoryData index mirror.
  const activeWeaponSlots = reader.u32Array(offset, 7);
  offset += 7 * 4;

  const equipmentIds = reader.u32Array(offset, EQUIPMENT_SLOT_COUNT);
  offset += EQUIPMENT_SLOT_COUNT * 4;
  const equipmentHandles = reader.u32Array(offset, EQUIPMENT_SLOT_COUNT);
  offset += EQUIPMENT_SLOT_COUNT * 4;

  const heldInventory = readInventory(reader, offset, HELD_INVENTORY_LENGTH, 2_688, 384, gaItems);
  offset += HELD_INVENTORY_LENGTH;

  const memorizedSpells: Array<number | undefined> = [];
  for (let index = 0; index < SPELL_SLOT_COUNT; index += 1) {
    const id = reader.i32(offset);
    memorizedSpells.push(id >= 0 ? id : undefined);
    offset += 8;
  }
  const activeSpellSlot = reader.i32(offset);
  offset += 4;

  // The handle/index pairs are retained by the game but semantic goods IDs are
  // repeated later in the 39-entry equipped-items mirror.
  offset += QUICK_ITEM_COUNT * 8;
  const activeQuickItemSlot = reader.u32(offset);
  offset += 4 + POUCH_ITEM_COUNT * 8;
  const greatRuneHandle = reader.u32(offset);
  offset += 8; // Great Rune handle + equipment index.
  offset += 24; // Gestures.
  const projectileCount = reader.u32(offset);
  if (projectileCount > 4_096) throw new CharacterLoadoutError(`投射物记录数量异常：${projectileCount}`);
  offset += 4 + projectileCount * 8;

  const equippedItemMirror = reader.u32Array(offset, REDUNDANT_EQUIPMENT_COUNT);
  offset += REDUNDANT_EQUIPMENT_COUNT * 4;
  offset += 12; // Physick crystal tears.
  const ageGroup = characterAgeGroup(reader.u8(offset + 16));
  offset += 303; // Face data.
  const storage = readInventory(reader, offset, STORAGE_LENGTH, 1_920, 128, gaItems);

  const equipmentItem = (index: number, kind: ParsedItemKind): ParsedEquippedItem | undefined => {
    const id = equipmentIds[index];
    if (
      id === EMPTY_ITEM_ID
      || (kind === 'weapon' && id === UNEQUIPPED_WEAPON_ID)
      || (kind === 'armor' && id === UNEQUIPPED_ARMOR_IDS.get(index))
    ) return undefined;
    return enrichItem({ id, kind, handle: equipmentHandles[index] }, gaItems);
  };
  const goodsItem = (raw: number): ParsedEquippedItem | undefined => {
    if (raw === EMPTY_ITEM_ID) return undefined;
    if (raw >>> 28 !== 0x4) return undefined;
    return { id: raw & 0x0fff_ffff, kind: 'goods' };
  };

  const talismans = EQUIPMENT.talismans.map((index) => equipmentItem(index, 'talisman'));
  return {
    rightHand: EQUIPMENT.rightHand.map((index) => equipmentItem(index, 'weapon')),
    leftHand: EQUIPMENT.leftHand.map((index) => equipmentItem(index, 'weapon')),
    arrows: EQUIPMENT.arrows.map((index) => equipmentItem(index, 'weapon')),
    bolts: EQUIPMENT.bolts.map((index) => equipmentItem(index, 'weapon')),
    armor: {
      head: equipmentItem(EQUIPMENT.armor[0], 'armor'),
      chest: equipmentItem(EQUIPMENT.armor[1], 'armor'),
      arms: equipmentItem(EQUIPMENT.armor[2], 'armor'),
      legs: equipmentItem(EQUIPMENT.armor[3], 'armor'),
    },
    talismans,
    quickItems: equippedItemMirror.slice(22, 32).map(goodsItem),
    pouchItems: equippedItemMirror.slice(32, 38).map(goodsItem),
    memorizedSpells,
    memorySlotCount: deriveMemorySlotCount(heldInventory.items, talismans),
    activeSpellSlot: activeSpellSlot >= 0 && activeSpellSlot < SPELL_SLOT_COUNT ? activeSpellSlot : undefined,
    activeLeftHandSlot: validSlot(activeWeaponSlots[1], 3),
    activeRightHandSlot: validSlot(activeWeaponSlots[2], 3),
    activeQuickItemSlot: validSlot(activeQuickItemSlot, QUICK_ITEM_COUNT),
    greatRune: equippedGoodsItem(greatRuneHandle, gaItems),
    ageGroup,
    inventory: {
      heldCommonDistinctCount: heldInventory.commonCount,
      heldKeyDistinctCount: heldInventory.keyCount,
      storedCommonDistinctCount: storage.commonCount,
      storedKeyDistinctCount: storage.keyCount,
      heldItems: heldInventory.items,
      storedItems: storage.items,
    },
  };
}

export function deriveMemorySlotCount(
  heldItems: readonly ParsedInventoryItem[],
  talismans: readonly (ParsedEquippedItem | undefined)[],
): number {
  const memoryStones = heldItems
    .filter((item) => item.kind === 'goods' && item.id === MEMORY_STONE_GOODS_ID)
    .reduce((total, item) => total + Math.max(0, item.quantity), 0);
  const talismanBonus = talismans.some((item) => (
    item?.kind === 'talisman' && (item.baseId ?? item.id) === MOON_OF_NOKSTELLA_TALISMAN_ID
  )) ? 2 : 0;
  return Math.min(
    MAX_USABLE_MEMORY_SLOT_COUNT,
    Math.max(BASE_MEMORY_SLOT_COUNT, BASE_MEMORY_SLOT_COUNT + memoryStones + talismanBonus),
  );
}

function readInventory(
  reader: LittleEndianReader,
  offset: number,
  sectionLength: number,
  commonCapacity: number,
  keyCapacity: number,
  gaItems: ReadonlyMap<number, GaItemRecord>,
): { commonCount: number; keyCount: number; items: ParsedInventoryItem[] } {
  reader.ensure(offset, sectionLength, '物品栏');
  const commonCount = reader.u32(offset);
  const items: ParsedInventoryItem[] = [];
  let itemOffset = offset + 4;
  for (let index = 0; index < commonCapacity; index += 1) {
    const item = readInventoryItem(reader, itemOffset, false, gaItems);
    if (item) items.push(item);
    itemOffset += 12;
  }
  const keyCountOffset = offset + 4 + commonCapacity * 12;
  const keyCount = reader.u32(keyCountOffset);
  itemOffset = keyCountOffset + 4;
  for (let index = 0; index < keyCapacity; index += 1) {
    const item = readInventoryItem(reader, itemOffset, true, gaItems);
    if (item) items.push(item);
    itemOffset += 12;
  }
  if (commonCount > commonCapacity || keyCount > keyCapacity) {
    throw new CharacterLoadoutError(`物品栏计数异常：${commonCount}/${commonCapacity}, ${keyCount}/${keyCapacity}`);
  }
  return { commonCount, keyCount, items };
}

function readInventoryItem(
  reader: LittleEndianReader,
  offset: number,
  keyItem: boolean,
  gaItems: ReadonlyMap<number, GaItemRecord>,
): ParsedInventoryItem | undefined {
  const handle = reader.u32(offset);
  if (handle === 0 || handle === EMPTY_ITEM_ID) return undefined;
  const kind = itemKindFromHandle(handle);
  if (!kind) return undefined;
  const mapped = gaItems.get(handle);
  const id = mapped?.itemId ?? (handle & 0x0fff_ffff);
  if (id === 0 || id === EMPTY_ITEM_ID) return undefined;
  return enrichItem({
    id,
    kind,
    handle,
    quantity: reader.u32(offset + 4),
    inventoryIndex: reader.u32(offset + 8),
    keyItem,
  }, gaItems);
}

function enrichItem<T extends ParsedEquippedItem>(
  item: T,
  gaItems: ReadonlyMap<number, GaItemRecord>,
): T {
  if (item.kind !== 'weapon') return item;
  const instanceId = gaItems.get(item.handle ?? 0)?.itemId ?? item.id;
  const suffix = instanceId % 10_000;
  const baseId = instanceId - suffix;
  const ashOfWarHandle = gaItems.get(item.handle ?? 0)?.ashOfWarHandle;
  const encodedAshOfWarId = ashOfWarHandle ? gaItems.get(ashOfWarHandle)?.itemId : undefined;
  const ashOfWarId = encodedAshOfWarId == null ? undefined : encodedAshOfWarId & 0x0fff_ffff;
  return {
    ...item,
    id: instanceId,
    baseId,
    upgradeLevel: suffix % 100,
    affinityId: Math.floor(suffix / 100),
    ...(ashOfWarId ? { ashOfWarId } : {}),
  };
}

function equippedGoodsItem(
  handle: number,
  gaItems: ReadonlyMap<number, GaItemRecord>,
): ParsedEquippedItem | undefined {
  if (handle === 0 || handle === EMPTY_ITEM_ID || handle >>> 28 !== 0xb) return undefined;
  const id = gaItems.get(handle)?.itemId ?? (handle & 0x0fff_ffff);
  return id > 0 ? { id, kind: 'goods', handle } : undefined;
}

function validSlot(value: number, count: number): number | undefined {
  return Number.isInteger(value) && value >= 0 && value < count ? value : undefined;
}

function characterAgeGroup(value: number): CharacterAgeGroup | undefined {
  return ({ 20: 'young', 21: 'mature', 22: 'aged' } as const)[value as 20 | 21 | 22];
}

function itemKindFromHandle(handle: number): ParsedItemKind | undefined {
  switch (handle >>> 28) {
    case 0x8: return 'weapon';
    case 0x9: return 'armor';
    case 0xa: return 'talisman';
    case 0xb: return 'goods';
    case 0xc: return 'ash-of-war';
    default: return undefined;
  }
}

class LittleEndianReader {
  private readonly view: DataView;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  ensure(offset: number, length: number, label: string): void {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > this.view.byteLength) {
      throw new CharacterLoadoutError(`${label}数据被截断`);
    }
  }

  u32(offset: number): number {
    this.ensure(offset, 4, '角色');
    return this.view.getUint32(offset, true);
  }

  i32(offset: number): number {
    this.ensure(offset, 4, '角色');
    return this.view.getInt32(offset, true);
  }

  u8(offset: number): number {
    this.ensure(offset, 1, '角色');
    return this.view.getUint8(offset);
  }

  u32Array(offset: number, count: number): number[] {
    this.ensure(offset, count * 4, '角色数组');
    return Array.from({ length: count }, (_, index) => this.view.getUint32(offset + index * 4, true));
  }
}

export class CharacterLoadoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterLoadoutError';
  }
}

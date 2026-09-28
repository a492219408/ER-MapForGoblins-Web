import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const SLOT_SIZE = 2_621_456;
const SLOT_START = 768;
const fixtureDirectory = resolve(process.argv[2] ?? 'saves/角色数据解析');
const slotIndex = Number.parseInt(process.argv[3] ?? '0', 10);
const compact = process.argv.includes('--compact');
const requestedNames = process.argv.slice(4).filter((value) => value !== '--compact');

const availableNames = (await readdir(fixtureDirectory))
  .filter((value) => /\.(?:sl2|co2|err)$/i.test(value))
  .sort((a, b) => a.localeCompare(b, 'zh-CN'));
const names = requestedNames.length > 0
  ? requestedNames.map((requestedName) => resolveFixtureName(requestedName, availableNames))
  : availableNames;

for (const name of names) {
  const bytes = await readFile(resolve(fixtureDirectory, name));
  const parsed = parseFixture(bytes, slotIndex);
  console.log(`\n${name}`);
  console.log(JSON.stringify(compact ? compactFixture(parsed) : parsed, hexReplacer, 2));
}

function compactFixture(parsed) {
  return {
    version: parsed.version,
    characterStart: parsed.characterStart,
    equipmentItemIds: parsed.equipmentItemIds,
    activeSlots: parsed.activeSlots,
    activeSpell: parsed.activeSpell,
    activeQuickItemSlot: parsed.activeQuickItemSlot,
    equippedGreatRune: {
      handle: parsed.equippedGreatRuneHandle,
      itemId: parsed.equippedGreatRuneHandle & 0x0fff_ffff,
      equipmentIndex: parsed.equippedGreatRuneEquipmentIndex,
    },
    equippedWeapons: parsed.resolvedEquipment.slice(0, 6).map((item) => ({
      itemId: item.itemId,
      ashOfWarItemId: item.ashOfWarItemId == null ? undefined : item.ashOfWarItemId & 0x0fff_ffff,
    })),
    faceAge: parsed.faceAge,
    chest: parsed.chest,
  };
}

function parseFixture(bytes, index) {
  const slotStart = SLOT_START + index * SLOT_SIZE;
  const version = bytes.readUInt32LE(slotStart + 16);
  let offset = slotStart + 48;
  const gaItems = new Map();
  for (let itemIndex = 0; itemIndex < (version <= 81 ? 5_118 : 5_120); itemIndex += 1) {
    const handle = bytes.readUInt32LE(offset);
    const itemId = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (handle !== 0) {
      const type = (handle & 0xf0000000) >>> 0;
      const record = { handle, itemId };
      if (type !== 0xc0000000) {
        record.unknown1 = bytes.readInt32LE(offset);
        record.unknown2 = bytes.readInt32LE(offset + 4);
        offset += 8;
      }
      if (type === 0x80000000) {
        record.ashOfWarHandle = bytes.readUInt32LE(offset);
        record.weaponUnknown = bytes.readUInt8(offset + 4);
        offset += 5;
      }
      gaItems.set(handle, record);
    }
  }
  const characterStart = offset;
  offset += 0x1b0 + 0xd0;
  const equipmentIndices = readU32Array(bytes, offset, 22); offset += 0x58;
  const activeSlots = readU32Array(bytes, offset, 7); offset += 0x1c;
  const equipmentItemIds = readU32Array(bytes, offset, 22); offset += 0x58;
  const equipmentHandles = readU32Array(bytes, offset, 22); offset += 0x58;
  const held = readInventory(bytes, offset, 0xa80, 0x180, gaItems); offset = held.end;
  const spells = [];
  for (let spellIndex = 0; spellIndex < 14; spellIndex += 1) {
    spells.push(bytes.readInt32LE(offset));
    offset += 8;
  }
  const activeSpell = bytes.readInt32LE(offset); offset += 4;
  const quick = readEquippedItems(bytes, offset, 10, gaItems); offset += 80;
  const activeQuickItemSlot = bytes.readUInt32LE(offset); offset += 4;
  const pouch = readEquippedItems(bytes, offset, 6, gaItems); offset += 48;
  const equippedGreatRuneHandle = bytes.readUInt32LE(offset); offset += 4;
  const equippedGreatRuneEquipmentIndex = bytes.readUInt32LE(offset); offset += 4;
  offset += 24;
  const projectileCount = bytes.readUInt32LE(offset); offset += 4 + projectileCount * 8;
  const equippedArmamentsAndItems = readU32Array(bytes, offset, 39); offset += 156;
  offset += 12;
  const faceAge = bytes.readUInt8(offset + 16);
  offset += 303;
  const chest = readInventory(bytes, offset, 0x780, 0x80, gaItems);

  return {
    version,
    characterStart,
    gaItemCount: gaItems.size,
    gaItemClasses: [...gaItems.keys()].reduce((counts, handle) => {
      const key = `0x${((handle & 0xf0000000) >>> 0).toString(16)}`;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
    equipmentIndices,
    activeSlots,
    equipmentItemIds,
    equipmentHandles,
    resolvedEquipment: equipmentHandles.map((handle) => resolveGaItem(handle, gaItems)),
    held: { commonCount: held.commonCount, keyCount: held.keyCount },
    spells,
    activeSpell,
    quick,
    activeQuickItemSlot,
    pouch,
    equippedGreatRuneHandle,
    equippedGreatRuneEquipmentIndex,
    equippedArmamentsAndItems,
    faceAge,
    chest: {
      commonCount: chest.commonCount,
      keyCount: chest.keyCount,
      highlightedItems: chest.items.filter(({ itemId }) => [3_200_000, 15_160, 1_720].includes(itemId)),
    },
  };
}

function readInventory(bytes, start, commonCapacity, keyCapacity, gaItems) {
  let offset = start;
  const commonCount = bytes.readUInt32LE(offset); offset += 4;
  const items = [];
  for (let index = 0; index < commonCapacity; index += 1) {
    const handle = bytes.readUInt32LE(offset);
    const quantity = bytes.readUInt32LE(offset + 4);
    const inventoryIndex = bytes.readUInt32LE(offset + 8);
    if (handle !== 0 && handle !== 0xffffffff) items.push({ handle, itemId: resolveItemId(handle, gaItems), quantity, inventoryIndex, keyItem: false });
    offset += 12;
  }
  const keyCount = bytes.readUInt32LE(offset); offset += 4;
  for (let index = 0; index < keyCapacity; index += 1) {
    const handle = bytes.readUInt32LE(offset);
    const quantity = bytes.readUInt32LE(offset + 4);
    const inventoryIndex = bytes.readUInt32LE(offset + 8);
    if (handle !== 0 && handle !== 0xffffffff) items.push({ handle, itemId: resolveItemId(handle, gaItems), quantity, inventoryIndex, keyItem: true });
    offset += 12;
  }
  return { commonCount, keyCount, items, end: offset + 8 };
}

function resolveItemId(handle, gaItems) {
  return gaItems.get(handle)?.itemId ?? (handle & 0x0fffffff);
}

function resolveGaItem(handle, gaItems) {
  const record = gaItems.get(handle);
  if (!record) return { handle };
  const ashOfWar = record.ashOfWarHandle == null ? undefined : gaItems.get(record.ashOfWarHandle);
  return {
    ...record,
    ...(ashOfWar ? { ashOfWarItemId: ashOfWar.itemId } : {}),
  };
}

function readEquippedItems(bytes, start, count, gaItems) {
  const result = [];
  let offset = start;
  for (let index = 0; index < count; index += 1) {
    const handle = bytes.readUInt32LE(offset);
    const equipmentIndex = bytes.readInt32LE(offset + 4);
    result.push({ ...resolveGaItem(handle, gaItems), equipmentIndex });
    offset += 8;
  }
  return result;
}

function resolveFixtureName(requestedName, names) {
  const exact = names.find((name) => name === requestedName);
  if (exact) return exact;
  const withoutExtension = names.find((name) => name.slice(0, -extname(name).length) === requestedName);
  if (withoutExtension) return withoutExtension;
  throw new Error(`目录 ${fixtureDirectory} 中没有存档 ${requestedName}`);
}

function readU32Array(bytes, start, count) {
  return Array.from({ length: count }, (_, index) => bytes.readUInt32LE(start + index * 4));
}

function hexReplacer(key, value) {
  if (['handle', 'equipmentHandles'].includes(key)) return value;
  return value;
}

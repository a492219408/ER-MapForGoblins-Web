import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import {
  compareUint8Arrays,
  getBstMap,
  getEventIdFromPosition,
  parse,
} from '../../apps/web/node_modules/@zebbedaja/er-save-parser/dist/index.mjs';

const SLOT_START = 768;
const fixtureDirectory = resolve('saves/游戏版本更新');
const previousPath = resolve(fixtureDirectory, '旧-DLC-20260828-1.co2');
const currentPath = resolve(fixtureDirectory, '新-DLC-20260828-1.co2');
const tarnishedPackPath = resolve(fixtureDirectory, '新-DLC-20260828-2.co2');

test('1.17 受控存档只提升已知布局版本，角色装备段语义不偏移', { skip: !existsSync(previousPath) || !existsSync(currentPath) }, () => {
  const previous = readFileSync(previousPath);
  const current = readFileSync(currentPath);
  assert.equal(previous.subarray(0, 4).toString('ascii'), 'BND4');
  assert.equal(current.subarray(0, 4).toString('ascii'), 'BND4');
  assert.equal(previous.length, current.length);

  const previousSlot = inspectSlot(previous);
  const currentSlot = inspectSlot(current);
  assert.equal(previousSlot.version, 252);
  assert.equal(currentSlot.version, 260);
  assert.equal(previousSlot.characterStart, 51_018);
  assert.equal(currentSlot.characterStart, 51_018);
  assert.deepEqual(currentSlot.equipmentItemIds, previousSlot.equipmentItemIds);
  assert.deepEqual(currentSlot.activeSlots, previousSlot.activeSlots);
});

test('Tarnished Pack 前后已知角色布局保持一致且只留下可审计旗标差异', {
  skip: !existsSync(currentPath) || !existsSync(tarnishedPackPath),
}, () => {
  const previous = readFileSync(currentPath);
  const purchased = readFileSync(tarnishedPackPath);
  const previousSlot = inspectSlot(previous);
  const purchasedSlot = inspectSlot(purchased);
  assert.equal(purchasedSlot.version, 260);
  assert.deepEqual(purchasedSlot.equipmentItemIds, previousSlot.equipmentItemIds);
  assert.deepEqual(purchasedSlot.activeSlots, previousSlot.activeSlots);
  assert.deepEqual(purchasedSlot.memorizedSpells, previousSlot.memorizedSpells);
  assert.equal(purchasedSlot.memoryStoneQuantity, 8);

  const previousParsed = parse(exactArrayBuffer(previous), { logLevel: 'none', includeEventFlagUInt8Array: true });
  const purchasedParsed = parse(exactArrayBuffer(purchased), { logLevel: 'none', includeEventFlagUInt8Array: true });
  const differences = compareUint8Arrays(
    previousParsed.slots[0].eventFlagUint8Array,
    purchasedParsed.slots[0].eventFlagUint8Array,
  );
  const index = getBstMap();
  assert.deepEqual(differences.map(({ offset, bitIndex }) => getEventIdFromPosition(index, offset, bitIndex)), [
    6_953, 9_807, 9_805, 1_041_370_340, 1_041_375_002,
  ]);
});

function inspectSlot(bytes) {
  const version = bytes.readUInt32LE(SLOT_START + 16);
  let offset = SLOT_START + 48;
  const gaItemCount = version <= 81 ? 5_118 : 5_120;
  const gaItems = new Map();
  for (let index = 0; index < gaItemCount; index += 1) {
    const handle = bytes.readUInt32LE(offset);
    const itemId = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (handle === 0) continue;
    gaItems.set(handle, itemId);
    const type = (handle & 0xf000_0000) >>> 0;
    if (type !== 0xc000_0000) offset += 8;
    if (type === 0x8000_0000) offset += 5;
  }
  const characterStart = offset;
  offset += 0x1b0 + 0xd0 + 0x58;
  const activeSlots = readU32Array(bytes, offset, 7);
  offset += 0x1c;
  const equipmentItemIds = readU32Array(bytes, offset, 22);
  offset += 22 * 4;
  offset += 22 * 4; // Equipment handles.
  const memoryStoneQuantity = inventoryQuantity(bytes, offset, gaItems, 10_030);
  offset += 36_880;
  const memorizedSpells = Array.from({ length: 14 }, (_, index) => bytes.readInt32LE(offset + index * 8));
  return { version, characterStart, activeSlots, equipmentItemIds, memorizedSpells, memoryStoneQuantity };
}

function inventoryQuantity(bytes, start, gaItems, wantedItemId) {
  let total = 0;
  const readEntries = (offset, count) => {
    for (let index = 0; index < count; index += 1) {
      const handle = bytes.readUInt32LE(offset);
      const quantity = bytes.readUInt32LE(offset + 4);
      const itemId = gaItems.get(handle) ?? (handle & 0x0fff_ffff);
      if (itemId === wantedItemId) total += quantity;
      offset += 12;
    }
    return offset;
  };
  let offset = start + 4;
  offset = readEntries(offset, 2_688);
  offset += 4;
  readEntries(offset, 384);
  return total;
}

function exactArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function readU32Array(bytes, start, count) {
  return Array.from({ length: count }, (_, index) => bytes.readUInt32LE(start + index * 4));
}

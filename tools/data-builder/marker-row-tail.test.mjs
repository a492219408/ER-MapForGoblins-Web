import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkerRowTail } from './marker-row-tail.mjs';

test('解析 ItemLot ID、类型和地图偏移时不发生字段错位', () => {
  const tail = parseMarkerRowTail(
    'Category::QuestSeedbedCurses, -1, -1, nullptr, 11000850u, 1, -274.777f, -259.063f },',
    700000,
  );
  assert.deepEqual(tail, {
    category: 'QuestSeedbedCurses',
    geomSlot: -1,
    secondaryGeomSlot: -1,
    lotId: 11000850,
    lotType: 1,
    mapOffsetX: -274.777,
    mapOffsetY: -259.063,
  });
});

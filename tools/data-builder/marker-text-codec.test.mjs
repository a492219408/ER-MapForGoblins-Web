import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMarkerTextId, usableFmgText } from './marker-text-codec.mjs';

test('解码物品、NPC、敌人与原始地点文本 ID', () => {
  assert.deepEqual(decodeMarkerTextId(131_020_000), {
    encodedId: 131_020_000,
    sourceId: 31_020_000,
    table: 'WeaponName',
    kind: 'weapon',
  });
  assert.equal(decodeMarkerTextId(700_130_900)?.table, 'NpcName');
  assert.equal(decodeMarkerTextId(1_603_320_300)?.sourceId, 903_320_300);
  assert.equal(decodeMarkerTextId(900_301_540)?.table, 'TutorialTitle');
  assert.equal(decodeMarkerTextId(120_600)?.table, 'PlaceName');
});

test('保留区与无效 ID 不会被猜测', () => {
  assert.equal(decodeMarkerTextId(0), undefined);
  assert.equal(decodeMarkerTextId(650_000_000), undefined);
  assert.equal(decodeMarkerTextId(1_000_000_000), undefined);
});

test('过滤 FMG 空占位文本', () => {
  assert.equal(usableFmgText('%null%'), undefined);
  assert.equal(usableFmgText('[ERROR]'), undefined);
  assert.equal(usableFmgText('  菈妮  '), '菈妮');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLegacyConversions } from './legacy-conversions.mjs';

test('正式基准点优先于同区域的普通点和后补点', () => {
  const rows = [
    parameterRow({ srcPosX: 668.01, srcPosZ: -2509.77, isBasePoint: 0, rowId: 10 }),
    parameterRow({ srcPosX: -2509.61, srcPosZ: -668.01, isBasePoint: 1, rowId: 11 }),
    parameterRow({ srcPosX: 0, srcPosZ: 0, isBasePoint: 1, rowId: 132, dstGridXNo: 54, dstGridZNo: 53 }),
  ];
  const header = '{ 13, 0, 668.01f, -2509.77f, 60, 51, 43, -36.71f, 0.32f }';

  assert.deepEqual(parseLegacyConversions(header, JSON.stringify(rows)), [{
    sourceArea: 13,
    sourceGridX: 0,
    sourceX: -2509.61,
    sourceZ: -668.01,
    targetArea: 60,
    targetGridX: 51,
    targetGridZ: 43,
    targetX: -36.71,
    targetZ: 0.32,
  }]);
});

test('生成头只补充参数 JSON 中没有的转换', () => {
  const rows = [parameterRow({ srcAreaNo: 13, isBasePoint: 1 })];
  const header = '{ 20, 1, 10.0f, 20.0f, 61, 45, 46, 30.0f, 40.0f }';

  const result = parseLegacyConversions(header, JSON.stringify(rows));
  assert.equal(result.length, 2);
  assert.equal(result[1].sourceArea, 20);
  assert.equal(result[1].targetArea, 61);
});

test('把多跳旧地图连接解析到主画布', () => {
  const rows = [
    parameterRow({
      srcAreaNo: 11, srcGridXNo: 0, srcPosX: 10, srcPosZ: 20,
      dstAreaNo: 60, dstGridXNo: 45, dstGridZNo: 52, dstPosX: 40, dstPosZ: 50,
      isBasePoint: 1,
    }),
    parameterRow({
      srcAreaNo: 12, srcGridXNo: 3, srcPosX: 100, srcPosZ: 200,
      dstAreaNo: 35, dstGridXNo: 0, dstGridZNo: 0, dstPosX: 110, dstPosZ: 220,
    }),
    parameterRow({
      srcAreaNo: 35, srcGridXNo: 0, srcPosX: 300, srcPosZ: 400,
      dstAreaNo: 11, dstGridXNo: 0, dstGridZNo: 0, dstPosX: 320, dstPosZ: 430,
    }),
  ];

  const result = parseLegacyConversions('', JSON.stringify(rows));
  const deepRoot = result.find(({ sourceArea, sourceGridX }) => sourceArea === 12 && sourceGridX === 3);
  assert.deepEqual(deepRoot, {
    sourceArea: 12,
    sourceGridX: 3,
    sourceX: 100,
    sourceZ: 200,
    targetArea: 60,
    targetGridX: 45,
    targetGridZ: 52,
    targetX: 160,
    targetZ: 280,
  });
});

test('为只有入边的旧地图页建立反向转换', () => {
  const rows = [
    parameterRow({
      srcAreaNo: 12, srcGridXNo: 2, srcPosX: 100, srcPosZ: 200,
      dstAreaNo: 60, dstGridXNo: 48, dstGridZNo: 39, dstPosX: 20, dstPosZ: 30,
      isBasePoint: 1,
    }),
    parameterRow({
      srcAreaNo: 12, srcGridXNo: 2, srcPosX: 50, srcPosZ: 60,
      dstAreaNo: 12, dstGridXNo: 8, dstGridZNo: 0, dstPosX: 70, dstPosZ: 90,
    }),
  ];

  const result = parseLegacyConversions('', JSON.stringify(rows));
  const connected = result.find(({ sourceArea, sourceGridX }) => sourceArea === 12 && sourceGridX === 8);
  assert.deepEqual(connected, {
    sourceArea: 12,
    sourceGridX: 8,
    sourceX: 70,
    sourceZ: 90,
    targetArea: 60,
    targetGridX: 48,
    targetGridZ: 39,
    targetX: -30,
    targetZ: -110,
  });
});

function parameterRow(overrides = {}) {
  return {
    srcAreaNo: 13,
    srcGridXNo: 0,
    srcPosX: -2509.61,
    srcPosZ: -668.01,
    dstAreaNo: 60,
    dstGridXNo: 51,
    dstGridZNo: 43,
    dstPosX: -36.71,
    dstPosZ: 0.32,
    ...overrides,
  };
}

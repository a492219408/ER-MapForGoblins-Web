import { describe, expect, it } from 'vitest';
import type { LegacyMapConversion } from './dataset';
import { projectSaveMapPoint } from './save-map-position';

const legacyConversion: LegacyMapConversion = {
  sourceArea: 12,
  sourceGridX: 1,
  sourceX: 400,
  sourceZ: -120,
  targetArea: 60,
  targetGridX: 38,
  targetGridZ: 46,
  targetX: 89,
  targetZ: 77,
};

describe('projectSaveMapPoint', () => {
  it('识别存档中的反向 map id 并投影地表坐标', () => {
    expect(projectSaveMapPoint(
      { mapId: [0, 40, 50, 60], coordinates: [1, 2, 3] },
      [legacyConversion],
    )).toEqual({
      coordinate: [5761, 6269],
      elevation: 2,
      mapId: 'm60_50_40_00',
      plane: 'surface',
    });
  });

  it('反向地表 ID 即使正向值误命中 legacy conversion 也优先投影地表', () => {
    const ambiguousConversion: LegacyMapConversion = {
      sourceArea: 0,
      sourceGridX: 37,
      sourceX: 0,
      sourceZ: 0,
      targetArea: 60,
      targetGridX: 37,
      targetGridZ: 43,
      targetX: 0,
      targetZ: 0,
    };
    expect(projectSaveMapPoint(
      { mapId: [0, 37, 43, 60], coordinates: [71.3437, 89.5956, -64.9033] },
      [ambiguousConversion],
    )).toEqual({
      coordinate: [4039.344, 7104.903],
      elevation: 89.5956,
      mapId: 'm60_43_37_00',
      plane: 'surface',
    });
  });

  it('通过 ERR legacy conversion 投影地下场景', () => {
    expect(projectSaveMapPoint(
      { mapId: [12, 1, 0, 0], coordinates: [410, 8, -100] },
      [legacyConversion],
    )).toEqual({
      coordinate: [2787, 4639],
      elevation: 8,
      mapId: 'm12_01_00_00',
      plane: 'underground',
    });
  });

  it('拒绝无法映射的场景', () => {
    expect(projectSaveMapPoint(
      { mapId: [99, 1, 2, 0], coordinates: [0, 0, 0] },
      [legacyConversion],
    )).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { detectDlcEvidence } from './dlc-state';

describe('detectDlcEvidence', () => {
  it('从当前地图 area 61 识别幽影之地', () => {
    expect(detectDlcEvidence('00302e3d', [])).toBe('CURRENT_MAP_AREA_61');
  });

  it('从已访问的 DLC 位置识别幽影之地', () => {
    expect(detectDlcEvidence('00000a0b', [{ regionId: 6_800_000 }])).toBe('VISITED_DLC_LOCATION');
  });

  it('不会把原版位置或无效地图编号误判为 DLC', () => {
    expect(detectDlcEvidence('00000a0b', [{ regionId: 6_503_000 }])).toBe('NONE');
    expect(detectDlcEvidence('not-a-map', [{ regionId: 6_799_999 }])).toBe('NONE');
  });
});

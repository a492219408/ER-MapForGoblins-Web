import { describe, expect, it } from 'vitest';
import {
  SURFACE_FOG_BYTES,
  surfaceFogBitRevealed,
  surfaceFogCellAt,
  surfaceFogCellRevealed,
} from './surface-fog';

describe('地表探索雾位图', () => {
  it('把 2026-08-25 实测移动后锚点映射到 bit 432', () => {
    expect(surfaceFogCellAt([4105.955, 6528.433])).toEqual({ column: 32, row: 10, bitIndex: 432 });
    expect(surfaceFogCellAt([3920, 6528.632])).toEqual({ column: 30, row: 10, bitIndex: 430 });
  });

  it('按 LSB 优先读取格子状态并拒绝位图范围外坐标', () => {
    const bytes = new Uint8Array(SURFACE_FOG_BYTES);
    bytes[432 >>> 3] |= 1 << (432 & 7);
    expect(surfaceFogCellRevealed(bytes, [4105.955, 6528.433])).toBe(true);
    expect(surfaceFogBitRevealed(bytes, 32, 10)).toBe(true);
    expect(surfaceFogCellAt([7000, 0])).toBeUndefined();
    expect(surfaceFogCellRevealed(bytes, [7000, 0])).toBe(false);
  });

  it('以 128 世界单位半格解释首段，并保留新增 bit 391 的相邻轨迹格', () => {
    const bytes = new Uint8Array(SURFACE_FOG_BYTES);
    bytes[391 >>> 3] |= 1 << (391 & 7);
    expect(surfaceFogCellAt([3968, 6400])).toEqual({ column: 31, row: 9, bitIndex: 391 });
    expect(surfaceFogCellAt([4095.999, 6527.999])).toEqual({ column: 31, row: 9, bitIndex: 391 });
    expect(surfaceFogCellRevealed(bytes, [4095.999, 6527.999])).toBe(true);
    expect(surfaceFogCellAt([5120, 7000])).toBeUndefined();
  });
});

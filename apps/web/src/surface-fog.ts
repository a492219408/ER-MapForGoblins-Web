/**
 * 地表局部探索雾是 40×41 个 128 世界单位格，位按行存储、每字节
 * LSB 优先。首格从项目地图画布 [0, 5248] 开始，行号随画布 Y 向南递增。
 *
 * 2026-08-25 的前后存档只有一次向东跨格移动：角色由
 * [3920, 6528.632] 移至 [4105.955, 6528.433]，新增 bit 391 与 bit 432。
 * bit 432 = row 10 / column 32，覆盖 [4096, 4224] × [6528, 6656]，
 * 与移动后的坐标严格一致；bit 391 是轨迹北侧相邻格。由此也证明旧版
 * 256 单位解释把迷雾放大了一倍。
 */
export const SURFACE_FOG_COLUMNS = 40;
export const SURFACE_FOG_ROWS = 41;
export const SURFACE_FOG_BYTES = Math.ceil(SURFACE_FOG_COLUMNS * SURFACE_FOG_ROWS / 8);
export const SURFACE_FOG_CELL_SIZE = 128;
export const SURFACE_FOG_WEST = 0;
export const SURFACE_FOG_NORTH = 5248;
export const SURFACE_FOG_SOUTH = SURFACE_FOG_NORTH + SURFACE_FOG_ROWS * SURFACE_FOG_CELL_SIZE;

export interface SurfaceFogCell {
  column: number;
  row: number;
  bitIndex: number;
}

export function surfaceFogCellAt(coordinate: readonly [number, number]): SurfaceFogCell | undefined {
  const column = Math.floor((coordinate[0] - SURFACE_FOG_WEST) / SURFACE_FOG_CELL_SIZE);
  const row = Math.floor((coordinate[1] - SURFACE_FOG_NORTH) / SURFACE_FOG_CELL_SIZE);
  if (column < 0 || column >= SURFACE_FOG_COLUMNS || row < 0 || row >= SURFACE_FOG_ROWS) return undefined;
  return { column, row, bitIndex: surfaceFogBitIndex(column, row) };
}

export function surfaceFogCellRevealed(
  fogRevealBytes: Uint8Array | undefined,
  coordinate: readonly [number, number],
): boolean {
  if (!fogRevealBytes) return true;
  const cell = surfaceFogCellAt(coordinate);
  if (!cell) return false;
  const byte = fogRevealBytes[cell.bitIndex >>> 3];
  return byte !== undefined && ((byte >>> (cell.bitIndex & 7)) & 1) === 1;
}

export function surfaceFogBitRevealed(fogRevealBytes: Uint8Array, column: number, row: number): boolean {
  if (column < 0 || column >= SURFACE_FOG_COLUMNS || row < 0 || row >= SURFACE_FOG_ROWS) return false;
  const bitIndex = surfaceFogBitIndex(column, row);
  return ((fogRevealBytes[bitIndex >>> 3] >>> (bitIndex & 7)) & 1) === 1;
}

function surfaceFogBitIndex(column: number, row: number): number {
  return row * SURFACE_FOG_COLUMNS + column;
}

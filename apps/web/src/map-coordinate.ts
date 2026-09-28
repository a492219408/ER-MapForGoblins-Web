import type { MapCoordinateFrame } from './dataset';

/**
 * 把游戏二维坐标线性映射到 Web Mercator 世界。纬度转换抵消 Mercator 的
 * 非线性，因此游戏地图在屏幕上的 x/y 比例仍保持线性。
 */
export function gameToLngLat(
  coordinate: readonly [number, number],
  frame: MapCoordinateFrame,
): [number, number] {
  const extent = frame.bounds;
  const width = extent[2] - extent[0];
  const height = extent[3] - extent[1];
  const ratioX = width === 0 ? 0.5 : (coordinate[0] - extent[0]) / width;
  const ratioY = height === 0 ? 0.5 : (coordinate[1] - extent[1]) / height;
  const worldTileSpan = 2 ** frame.xyzZoom;
  const mercatorX = (frame.xyzOrigin[0] + ratioX * frame.xyzSpan) / worldTileSpan;
  const mercatorY = (frame.xyzOrigin[1] + ratioY * frame.xyzSpan) / worldTileSpan;
  const longitude = mercatorX * 360 - 180;
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * mercatorY))) * 180 / Math.PI;
  return [longitude, latitude];
}

export function gameExtentToBounds(
  extent: readonly [number, number, number, number],
  frame: MapCoordinateFrame,
): [[number, number], [number, number]] {
  return [
    gameToLngLat([extent[0], extent[3]], frame),
    gameToLngLat([extent[2], extent[1]], frame),
  ];
}

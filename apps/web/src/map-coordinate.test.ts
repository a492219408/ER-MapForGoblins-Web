import { describe, expect, it } from 'vitest';
import type { MapCoordinateFrame } from './dataset';
import { gameExtentToBounds, gameToLngLat } from './map-coordinate';

const extent: [number, number, number, number] = [-100, -50, 100, 150];
const frame: MapCoordinateFrame = {
  bounds: extent,
  tileSize: 256,
  xyzZoom: 6,
  xyzOrigin: [11.5, 11.5],
  xyzSpan: 41,
};

describe('gameToLngLat', () => {
  it('把世界中心映射到零经纬度', () => {
    const [longitude, latitude] = gameToLngLat([0, 50], frame);
    expect(longitude).toBeCloseTo(0, 10);
    expect(latitude).toBeCloseTo(0, 10);
  });

  it('保持游戏坐标的东西与南北方向', () => {
    const northWest = gameToLngLat([-100, -50], frame);
    const southEast = gameToLngLat([100, 150], frame);
    expect(northWest[0]).toBeLessThan(southEast[0]);
    expect(northWest[1]).toBeGreaterThan(southEast[1]);
    expect(northWest[0]).toBeGreaterThan(-180);
    expect(northWest[1]).toBeLessThan(90);
  });

  it('生成 MapLibre 可直接使用的西南—东北边界', () => {
    expect(gameExtentToBounds([-50, 0, 50, 100], frame)).toEqual([
      gameToLngLat([-50, 100], frame),
      gameToLngLat([50, 0], frame),
    ]);
  });
});

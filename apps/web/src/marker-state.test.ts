import { describe, expect, it } from 'vitest';
import { deriveMarkerStates, MarkerStateCode } from './marker-state';

describe('标记状态证据推导', () => {
  it('使用拾取事件旗标判定已收集和可获取', () => {
    const markers = [
      { collectionFlags: [100], displayFlag: 0, geomSlot: -1, trackable: true },
      { collectionFlags: [101], displayFlag: 0, geomSlot: -1, trackable: true },
    ];
    const result = deriveMarkerStates(markers, (flag) => flag === 100);
    expect([...result.states]).toEqual([MarkerStateCode.COLLECTED, MarkerStateCode.AVAILABLE]);
  });

  it('使用显示前置旗标判定锁定', () => {
    const result = deriveMarkerStates(
      [{ collectionFlags: [100], displayFlag: 200, geomSlot: -1, trackable: true }],
      (flag) => flag === 100 ? false : flag === 200 ? false : undefined,
    );
    expect(result.states[0]).toBe(MarkerStateCode.LOCKED);
  });

  it('不会把仅有 GEOM/GEOF 证据的标记猜测为未收集', () => {
    const result = deriveMarkerStates(
      [{ collectionFlags: [], displayFlag: 0, geomSlot: 3, trackable: true }],
      () => undefined,
    );
    expect(result.states[0]).toBe(MarkerStateCode.UNKNOWN);
  });

  it('不可跟踪的永久世界设施保持未知', () => {
    const result = deriveMarkerStates(
      [{ collectionFlags: [], displayFlag: 0, geomSlot: -1, trackable: false }],
      () => undefined,
    );
    expect(result.states[0]).toBe(MarkerStateCode.UNKNOWN);
    expect(result.counts.trackable).toBe(0);
  });
});

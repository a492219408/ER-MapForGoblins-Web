import { describe, expect, it } from 'vitest';
import { extractSlotMapState } from './slot-map-state';

describe('extractSlotMapState', () => {
  it('拒绝槽位范围之外的索引', () => {
    expect(() => extractSlotMapState(new ArrayBuffer(0), -1)).toThrow('存档槽位索引无效');
    expect(() => extractSlotMapState(new ArrayBuffer(0), 10)).toThrow('存档槽位索引无效');
  });

  it('拒绝截断的槽位', () => {
    const bytes = new ArrayBuffer(0x400);
    new DataView(bytes).setUint32(0x310, 1, true);
    expect(() => extractSlotMapState(bytes, 0)).toThrow('存档槽位被截断');
  });
});

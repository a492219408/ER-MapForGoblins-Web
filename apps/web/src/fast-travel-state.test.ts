import { describe, expect, it } from 'vitest';
import {
  deriveFastTravelState,
  legacyMiniDungeonBossFlagId,
  TRANSPORT_TRAP_RESTRICTION_FLAG_ID,
} from './fast-travel-state';

function flags(values: Record<number, boolean>): (flagId: number) => boolean | undefined {
  return (flagId) => values[flagId];
}

describe('存档禁止传送状态', () => {
  it('识别陷阱宝箱限制，并在旗标关闭后解除', () => {
    expect(deriveFastTravelState([11, 0, 0, 0], flags({
      [TRANSPORT_TRAP_RESTRICTION_FLAG_ID]: true,
    }))).toEqual({
      restricted: true,
      reason: 'transport-trap',
      evidenceFlagId: TRANSPORT_TRAP_RESTRICTION_FLAG_ID,
    });
    expect(deriveFastTravelState([11, 0, 0, 0], flags({
      [TRANSPORT_TRAP_RESTRICTION_FLAG_ID]: false,
    }))).toEqual({ restricted: false });
  });

  it('按当前小型地下城地图识别未击败 Boss 的限制', () => {
    expect(legacyMiniDungeonBossFlagId([31, 3, 0, 0])).toBe(31030800);
    expect(legacyMiniDungeonBossFlagId([0, 0, 3, 31])).toBe(31030800);
    expect(deriveFastTravelState([31, 3, 0, 0], flags({
      [TRANSPORT_TRAP_RESTRICTION_FLAG_ID]: false,
      31030800: false,
    }))).toEqual({
      restricted: true,
      reason: 'uncleared-dungeon-boss',
      evidenceFlagId: 31030800,
    });
    expect(deriveFastTravelState([31, 3, 0, 0], flags({
      [TRANSPORT_TRAP_RESTRICTION_FLAG_ID]: false,
      31030800: true,
    }))).toEqual({ restricted: false });
  });

  it('不把普通地图或无法读取的旗标猜成禁止传送', () => {
    expect(legacyMiniDungeonBossFlagId([60, 41, 36, 0])).toBeUndefined();
    expect(deriveFastTravelState([60, 41, 36, 0], () => undefined)).toEqual({ restricted: false });
  });
});

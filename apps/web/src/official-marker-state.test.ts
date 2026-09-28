import { describe, expect, it } from 'vitest';
import type { OfficialMapMarker, OfficialMapTextSlot } from './dataset';
import {
  deriveOfficialMarkerStates,
  OfficialMarkerStateCode,
  OfficialTextStateCode,
} from './official-marker-state';

const slot = (overrides: Partial<OfficialMapTextSlot> = {}): OfficialMapTextSlot => ({
  slot: 3,
  textStateIndex: 0,
  textId: 122000,
  kind: 'npc',
  labels: { 'zh-CN': '亚历山大' },
  enableFlagId: 3665,
  disableFlagId: 3663,
  secondaryEnableFlagId: 1043399302,
  secondaryDisableFlagId: 400175,
  ...overrides,
});

const marker = (textSlots: OfficialMapTextSlot[]): OfficialMapMarker => ({
  id: 1,
  paramdexName: 'Saintsbridge',
  labels: {},
  iconId: 5,
  alternateIconId: 105,
  angle: 0,
  area: 60,
  gridX: 43,
  gridZ: 39,
  position: [0, 0, 0],
  mapPosition: { coordinate: [0, 0], targetArea: 60 },
  plane: 'surface',
  openEventFlagId: 6001,
  clearedEventFlagId: 0,
  showWithoutText: false,
  isAreaIcon: false,
  displayMasks: [1, 0, 0],
  minZoomStep: 0,
  entryFEType: 0,
  textSlots,
  zPriority: 100,
});

describe('deriveOfficialMarkerStates', () => {
  it('区分 NPC 当前阶段、玩家发现和游戏内实际可见', () => {
    const flags = new Set([3665, 1043399302]);
    const result = deriveOfficialMarkerStates([marker([slot()])], 1, (id) => flags.has(id));
    expect(result.markerStates[0] & OfficialMarkerStateCode.VISIBLE).not.toBe(0);
    expect(result.markerStates[0] & OfficialMarkerStateCode.NPC_CURRENT).not.toBe(0);
    expect(result.markerStates[0] & OfficialMarkerStateCode.NPC_DISCOVERED).not.toBe(0);
    expect(result.textStates[0]).toBe(
      OfficialTextStateCode.PRIMARY_ACTIVE
      | OfficialTextStateCode.DISCOVERED
      | OfficialTextStateCode.VISIBLE,
    );
  });

  it('保留已经发现但任务阶段已离开的历史位置', () => {
    const flags = new Set([1043399302]);
    const result = deriveOfficialMarkerStates([marker([slot()])], 1, (id) => flags.has(id));
    expect(result.markerStates[0] & OfficialMarkerStateCode.VISIBLE).toBe(0);
    expect(result.markerStates[0] & OfficialMarkerStateCode.NPC_CURRENT).toBe(0);
    expect(result.markerStates[0] & OfficialMarkerStateCode.NPC_DISCOVERED).not.toBe(0);
  });

  it('任一失效旗标都会阻止对应层级继续生效', () => {
    const flags = new Set([3665, 3663, 1043399302, 400175]);
    const result = deriveOfficialMarkerStates([marker([slot()])], 1, (id) => flags.has(id));
    expect(result.markerStates[0]).toBe(0);
    expect(result.textStates[0]).toBe(0);
  });

  it('支持任务脚本补充的 OR-of-AND 当前位置谓词', () => {
    const supplemental = slot({
      enableFlagId: 0,
      disableFlagId: 0,
      secondaryEnableFlagId: 0,
      secondaryDisableFlagId: 0,
      activeWhenAny: [
        { enabledFlagIds: [3766, 3760], disabledFlagIds: [] },
        { enabledFlagIds: [3768], disabledFlagIds: [9999] },
      ],
    });

    const active = deriveOfficialMarkerStates(
      [marker([supplemental])],
      1,
      (id) => new Set([3766, 3760]).has(id),
    );
    expect(active.markerStates[0] & OfficialMarkerStateCode.NPC_CURRENT).not.toBe(0);

    const inactive = deriveOfficialMarkerStates(
      [marker([supplemental])],
      1,
      (id) => new Set([3766, 9999]).has(id),
    );
    expect(inactive.markerStates[0]).toBe(0);
  });

  it('用独立条件判断传送门可用性，不受地图文字禁用旗标影响', () => {
    const sendingGate = {
      ...marker([slot({
        kind: 'place',
        enableFlagId: 1045399206,
        disableFlagId: 1051439205,
        secondaryEnableFlagId: 0,
        secondaryDisableFlagId: 0,
      })]),
      openEventFlagId: 1045399206,
      iconKey: 'supplemental-sending-gate',
    } satisfies OfficialMapMarker;
    const flags = new Set([1045399206, 1051439205]);
    const result = deriveOfficialMarkerStates([sendingGate], 1, (id) => flags.has(id));
    expect(result.markerStates[0] & OfficialMarkerStateCode.VISIBLE).not.toBe(0);
    expect(result.markerStates[0] & OfficialMarkerStateCode.AVAILABLE).not.toBe(0);
  });

  it('支持事件脚本补充的传送门激活旗标', () => {
    const sendingGate = {
      ...marker([slot({ kind: 'place', enableFlagId: 0, disableFlagId: 0 })]),
      iconKey: 'supplemental-sending-gate',
      availableWhenAny: [{ enabledFlagIds: [1034470610], disabledFlagIds: [] }],
    } satisfies OfficialMapMarker;
    const inactive = deriveOfficialMarkerStates([sendingGate], 1, () => false);
    expect(inactive.markerStates[0] & OfficialMarkerStateCode.AVAILABLE).toBe(0);
    const active = deriveOfficialMarkerStates([sendingGate], 1, (id) => id === 1034470610);
    expect(active.markerStates[0] & OfficialMarkerStateCode.AVAILABLE).not.toBe(0);
  });
});

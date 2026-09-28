import { describe, expect, it } from 'vitest';
import type { OfficialMapMarker } from './dataset';
import {
  categoryAllowsOfficialMarker,
  guidanceForGrace,
  isOfficialMarkerInteractive,
  isSendingGate,
  officialMarkerEvidence,
  officialMarkerIconOffset,
  officialMarkerIconScale,
  officialMarkerSortKey,
  officialMarkerTitle,
  officialMarkerVisibleInMode,
} from './official-marker-render';

const marker = (iconId: number): OfficialMapMarker => ({
  id: iconId,
  paramdexName: '',
  labels: {},
  iconId,
  alternateIconId: 0,
  angle: 0,
  area: 60,
  gridX: 0,
  gridZ: 0,
  position: [0, 0, 0],
  mapPosition: { coordinate: [0, 0], targetArea: 60 },
  plane: 'surface',
  openEventFlagId: 0,
  clearedEventFlagId: 0,
  showWithoutText: false,
  isAreaIcon: false,
  displayMasks: [0, 0, 0],
  minZoomStep: 0,
  entryFEType: 0,
  textSlots: [],
  zPriority: 100,
});

describe('官方地图标记渲染规则', () => {
  it('地下墓地指引覆盖在地点底图之上', () => {
    expect(officialMarkerSortKey(marker(84), false)).toBeGreaterThan(
      officialMarkerSortKey(marker(85), false),
    );
  });

  it('按官方纹理头部方向偏移两类引导图标', () => {
    expect(officialMarkerIconOffset(marker(83))).toEqual([0, 80]);
    expect(officialMarkerIconOffset(marker(84))).toEqual([0, 24]);
    expect(officialMarkerIconOffset(marker(85))).toEqual([0, 0]);
  });

  it('仅在 NPC 当前模式放大 NPC 图标', () => {
    expect(officialMarkerIconScale('npc-current', true)).toBe(0.68);
    expect(officialMarkerIconScale('all', true)).toBe(0.42);
    expect(officialMarkerIconScale('npc-current', false)).toBe(0.42);
  });

  it('恩典引导跟随赐福点分类', () => {
    expect(categoryAllowsOfficialMarker(marker(83), new Set())).toBe(false);
    expect(categoryAllowsOfficialMarker(marker(83), new Set(['WorldGraces']))).toBe(true);
    expect(categoryAllowsOfficialMarker(marker(82), new Set())).toBe(true);
  });

  it('存档可见模式保留已探索区域内尚不可用的传送门', () => {
    const gate = { ...marker(87), iconKey: 'supplemental-sending-gate' };
    expect(isSendingGate(gate)).toBe(true);
    expect(officialMarkerVisibleInMode(gate, 0, true, 'visible')).toBe(true);
    expect(officialMarkerVisibleInMode(marker(82), 0, true, 'visible')).toBe(false);
  });

  it('把赐福引导作为赐福点的非交互附属属性', () => {
    const guidance = { ...marker(83), plane: 'surface' as const, mapPosition: { coordinate: [12, 6] as [number, number], targetArea: 60 } };
    const farGuidance = { ...marker(83), id: 84, plane: 'surface' as const, mapPosition: { coordinate: [60, 60] as [number, number], targetArea: 60 } };
    expect(isOfficialMarkerInteractive(guidance)).toBe(false);
    expect(guidanceForGrace(
      { plane: 'surface', mapPosition: { coordinate: [0, 0] } },
      [guidance, farGuidance],
    )).toEqual([guidance]);
  });

  it('优先使用游戏内 NPC 本地化文本', () => {
    const npc = {
      ...marker(80),
      paramdexName: 'Bellum Highway - Finger Reader Crone',
      labels: { 'en-US': 'Bellum Highway - Finger Reader Crone' },
      textSlots: [{
        slot: 3,
        textStateIndex: 0,
        textId: 175000,
        kind: 'npc' as const,
        labels: { 'zh-CN': '解指老妪', 'en-US': 'Finger Reader Crone' },
        enableFlagId: 0,
        disableFlagId: 0,
        secondaryEnableFlagId: 0,
        secondaryDisableFlagId: 0,
      }],
    };
    expect(officialMarkerTitle(npc, 'zh-CN')).toBe('解指老妪');
    expect(officialMarkerTitle(marker(83), 'zh-CN')).toBe('赐福的指引');
  });

  it('多阶段 NPC 优先显示当前任务阶段的本地化名称', () => {
    const iji = {
      ...marker(80),
      textSlots: [
        {
          slot: 3,
          textStateIndex: 0,
          textId: 122400,
          kind: 'npc' as const,
          labels: { 'zh-CN': '铁匠伊吉' },
          enableFlagId: 0,
          disableFlagId: 0,
          secondaryEnableFlagId: 0,
          secondaryDisableFlagId: 0,
        },
        {
          slot: 4,
          textStateIndex: 1,
          textId: 122401,
          kind: 'npc' as const,
          labels: { 'zh-CN': '军师伊吉' },
          enableFlagId: 0,
          disableFlagId: 0,
          secondaryEnableFlagId: 0,
          secondaryDisableFlagId: 0,
        },
      ],
    };
    expect(officialMarkerTitle(iji, 'zh-CN', new Uint8Array([0, 1]))).toBe('军师伊吉');
  });

  it('区分参数、NPC 事件和地图实体证据', () => {
    expect(officialMarkerEvidence(marker(80))).toBe('WorldMapPointParam');
    expect(officialMarkerEvidence({
      ...marker(80),
      source: { kind: 'msb-npc-event', mapId: 'm60_36_48_00', entityId: 1036480700 },
    })).toBe('MSB 实体 + EMEVD 任务旗标');
  });
});

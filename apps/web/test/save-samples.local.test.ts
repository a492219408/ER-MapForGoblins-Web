import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getBstMap, getEventFlagState, parse } from '@zebbedaja/er-save-parser';
import { describe, expect, it } from 'vitest';
import type { MarkerCatalog, OfficialMapCatalog } from '../src/dataset';
import { projectSaveMapPoint } from '../src/save-map-position';
import { extractSlotMapState } from '../src/slot-map-state';
import { detectDlcEvidence } from '../src/dlc-state';
import { deriveOfficialMarkerStates, OfficialMarkerStateCode } from '../src/official-marker-state';
import { SURFACE_FOG_BYTES } from '../src/surface-fog';

const samples = [
  { kind: 'NODLC', path: resolve(process.cwd(), '../../saves/ER0000-NODLC.sl2'), activeSlots: 2 },
  { kind: 'DLC', path: resolve(process.cwd(), '../../saves/ER0000-DLC.sl2'), activeSlots: 1 },
] as const;
const localSamplesAvailable = samples.every((sample) => existsSync(sample.path));
const capitalStateSample = resolve(process.cwd(), '../../saves/ER0000-NODLC-20260819-2023.sl2');
const fogBeforeSample = resolve(
  process.cwd(),
  '../../saves/ER0000-NODLC-20260825-0040-迷雾测试1-角色移动前.sl2',
);
const fogAfterSample = resolve(
  process.cwd(),
  '../../saves/ER0000-NODLC-20260825-0040-迷雾测试1-角色移动后.sl2',
);
const sendingGateSample = resolve(process.cwd(), '../../saves/ER0000-NODLC-20260823-1716.sl2');
const assetsDirectory = resolve(process.cwd(), '../../runtime/assets');

describe.skipIf(!localSamplesAvailable)('本地授权的 DLC / 非 DLC 存档兼容性', () => {
  for (const sample of samples) {
    it(`${sample.kind} 样本保持 PC 十槽位和事件旗标布局`, () => {
      const file = readFileSync(sample.path);
      expect(file.byteLength).toBe(0x1ba03d0);
      expect([...file.subarray(0, 4)]).toEqual([0x42, 0x4e, 0x44, 0x34]);

      const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
      const save = parse(buffer, { logLevel: 'none', includeEventFlagUInt8Array: true });
      const activeSlots = (save.slots ?? []).filter((_, index) => save.activeProfiles?.[index] === 1);

      expect(save.slots).toHaveLength(10);
      expect(activeSlots).toHaveLength(sample.activeSlots);
      expect(activeSlots.every((slot) => (slot.version ?? 0) >= 251)).toBe(true);
      expect(activeSlots.every((slot) => slot.eventFlagUint8Array?.byteLength === 1_833_375)).toBe(true);
      const mapStates = [];
      for (const [slotIndex, slot] of (save.slots ?? []).entries()) {
        if (save.activeProfiles?.[slotIndex] !== 1) continue;
        const mapState = extractSlotMapState(buffer, slotIndex);
        mapStates.push(mapState);
        expect(mapState.player.coordinates.every(Number.isFinite)).toBe(true);
        expect(mapState.player.mapId).toHaveLength(4);
        expect(mapState.bloodstain.coordinates.every(Number.isFinite)).toBe(true);
        expect(Number.isInteger(mapState.bloodstain.runes)).toBe(true);
      }
      expect(mapStates.some((state) => state.player.coordinates.some((coordinate) => coordinate !== 0))).toBe(true);
      expect(mapStates.some((state) => state.player.mapId.some((component) => component !== 0))).toBe(true);
      expect(mapStates[0].player.mapId).toEqual([0, 0, 10, 11]);
      expect(mapStates[0].player.coordinates[0]).toBeCloseTo(sample.kind === 'NODLC' ? -293.8975 : -292.3629, 3);
      expect(mapStates[0].bloodstain.mapId).toEqual(
        sample.kind === 'NODLC' ? [0, 53, 51, 60] : [0, 48, 46, 61],
      );
      expect(mapStates[0].bloodstain.runes).toBe(-1);
      expect(activeSlots.map((slot) => detectDlcEvidence(slot.mapId, slot.regions))).toEqual(
        sample.kind === 'DLC' ? ['VISITED_DLC_LOCATION'] : Array(sample.activeSlots).fill('NONE'),
      );

      const manifestPath = resolve(assetsDirectory, 'dataset-manifest.v1.json');
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          resources: { markerCatalog: { path: string }; officialMap?: { path: string } };
        };
        const markerCatalog = JSON.parse(
          readFileSync(resolve(assetsDirectory, manifest.resources.markerCatalog.path), 'utf8'),
        ) as MarkerCatalog;
        expect(mapStates.some((state) => (
          projectSaveMapPoint(state.player, markerCatalog.legacyConversions) !== undefined
        ))).toBe(true);
        if (manifest.resources.officialMap) {
          const officialCatalog = JSON.parse(
            readFileSync(resolve(assetsDirectory, manifest.resources.officialMap.path), 'utf8'),
          ) as OfficialMapCatalog;
          const eventFlagIndex = getBstMap();
          for (const activeSlot of activeSlots) {
            const eventFlags = activeSlot.eventFlagUint8Array!;
            const official = deriveOfficialMarkerStates(
              officialCatalog.markers,
              officialCatalog.textStateCount,
              (flagId) => getEventFlagState(eventFlagIndex, eventFlags, flagId),
            );
            expect(official.markerStates).toHaveLength(officialCatalog.markerCount);
            expect(official.textStates).toHaveLength(officialCatalog.textStateCount);
            expect([...official.markerStates].filter((state) => (
              (state & OfficialMarkerStateCode.VISIBLE) !== 0
            )).length).toBeGreaterThan(10);
            expect([...official.markerStates].some((state) => (
              (state & OfficialMarkerStateCode.NPC_CURRENT) !== 0
            ))).toBe(true);
          }
        }
      }
    });
  }
});

describe.skipIf(!existsSync(capitalStateSample))('本地授权的王城状态存档', () => {
  it('事件旗标 118 能区分灰城槽位与王城槽位', () => {
    const file = readFileSync(capitalStateSample);
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const save = parse(buffer, { logLevel: 'none', includeEventFlagUInt8Array: true });
    const eventFlagIndex = getBstMap();
    const readCapitalFlag = (slotIndex: number) => {
      const eventFlags = save.slots?.[slotIndex]?.eventFlagUint8Array;
      expect(eventFlags).toBeDefined();
      return getEventFlagState(eventFlagIndex, eventFlags!, 118);
    };

    expect(readCapitalFlag(0)).toBe(true);
    expect(readCapitalFlag(1)).toBe(false);
  });
});

describe.skipIf(!existsSync(fogBeforeSample) || !existsSync(fogAfterSample))('本地授权的地表迷雾移动样本', () => {
  it('槽位 2 的 205 字节位图只新增实测轨迹格 391 和 432', () => {
    const before = readSaveBuffer(fogBeforeSample);
    const after = readSaveBuffer(fogAfterSample);
    const beforeMap = extractSlotMapState(before, 1);
    const afterMap = extractSlotMapState(after, 1);

    expect(beforeMap.fogRevealBytes).toHaveLength(SURFACE_FOG_BYTES);
    expect(afterMap.fogRevealBytes).toHaveLength(SURFACE_FOG_BYTES);
    expect(changedBits(beforeMap.fogRevealBytes, afterMap.fogRevealBytes)).toEqual([391, 432]);
    expect(beforeMap.player.mapId).toEqual([0, 39, 43, 60]);
    expect(afterMap.player.mapId).toEqual([0, 39, 44, 60]);
  });
});

describe.skipIf(!existsSync(sendingGateSample))('本地授权的传送门状态样本', () => {
  it('槽位 2 的独立激活旗标与游戏内可用状态一致', () => {
    const buffer = readSaveBuffer(sendingGateSample);
    const save = parse(buffer, { logLevel: 'none', includeEventFlagUInt8Array: true });
    const eventFlags = save.slots?.[1]?.eventFlagUint8Array;
    expect(eventFlags).toBeDefined();
    const eventFlagIndex = getBstMap();
    const readFlag = (flagId: number) => getEventFlagState(eventFlagIndex, eventFlags!, flagId);

    // #81463900 的地图文字禁用旗标已开启，但交互开放旗标仍证明它可用。
    expect(readFlag(1045399206)).toBe(true);
    expect(readFlag(1051439205)).toBe(true);
    expect(readFlag(1034470610)).toBe(true);
    expect(readFlag(1033470610)).toBe(false);
    expect(readFlag(1033460610)).toBe(false);
  });
});

function readSaveBuffer(path: string): ArrayBuffer {
  const file = readFileSync(path);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

function changedBits(before: Uint8Array, after: Uint8Array): number[] {
  const result: number[] = [];
  for (let bit = 0; bit < Math.min(before.length, after.length) * 8; bit += 1) {
    const left = (before[bit >>> 3] >>> (bit & 7)) & 1;
    const right = (after[bit >>> 3] >>> (bit & 7)) & 1;
    if (left !== right) result.push(bit);
  }
  return result;
}

/// <reference lib="webworker" />

import { getBstMap, getEventFlagState, parse, type Character } from '@zebbedaja/er-save-parser';
import type { MarkerCatalogEntry, OfficialMapMarker } from './dataset';
import { deriveMarkerStates } from './marker-state';
import { deriveCapitalState } from './capital-state';
import { inspectPcSaveContainer, SaveContainerError } from './save-container';
import type { ParsedSlotSummary, SaveParserRequest, SaveParserResponse } from './save-parser-protocol';
import { extractSlotMapState } from './slot-map-state';
import { detectDlcEvidence } from './dlc-state';
import { MAP_DISCOVERY_EVENT_FLAGS } from './map-discovery';
import { deriveOfficialMarkerStates } from './official-marker-state';
import { deriveFastTravelState } from './fast-travel-state';
import { parseCharacterLoadout } from './character-loadout';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let markers: MarkerCatalogEntry[] | undefined;
let officialMarkers: OfficialMapMarker[] = [];
let officialTextStateCount = 0;
const eventFlagIndex = getBstMap();

workerScope.onmessage = (event: MessageEvent<SaveParserRequest>) => {
  const request = event.data;
  if (request.type === 'INITIALIZE') {
    markers = request.markers;
    officialMarkers = request.officialMarkers;
    officialTextStateCount = request.officialTextStateCount;
    post({ type: 'INITIALIZED' });
    return;
  }

  if (!markers) {
    post({ type: 'ERROR', requestId: request.requestId, message: '标记目录尚未初始化' });
    return;
  }

  try {
    const startedAt = performance.now();
    inspectPcSaveContainer(request.bytes);
    const save = parse(request.bytes, { logLevel: 'none', includeEventFlagUInt8Array: true });
    const slots: ParsedSlotSummary[] = [];
    for (const [index, slot] of (save.slots ?? []).entries()) {
      const active = save.activeProfiles
        ? save.activeProfiles[index] === 1
        : (slot.version ?? 0) > 0;
      if (!active) continue;
      const eventFlags = slot.eventFlagUint8Array;
      if (!eventFlags) continue;
      const derived = deriveMarkerStates(markers, (flagId) => readFlag(eventFlags, flagId));
      const officialDerived = deriveOfficialMarkerStates(
        officialMarkers,
        officialTextStateCount,
        (flagId) => readFlag(eventFlags, flagId),
      );
      const profile = save.profileSummaries?.[index];
      const mapState = extractSlotMapState(request.bytes, index);
      slots.push({
        index,
        name: slot.character?.characterName || profile?.name || `槽位 ${index + 1}`,
        level: slot.character?.level ?? profile?.level ?? 0,
        secondsPlayed: profile?.secondsPlayed ?? 0,
        totalDeathCount: slot.totalDeathCount,
        character: toCharacterSummary(
          slot.character,
          profile?.archetype,
          profile?.startingGift,
          parseCharacterLoadout(request.bytes, index),
        ),
        mapId: slot.mapId ?? profile?.mapId,
        mapName: slot.mapName ?? profile?.mapName,
        version: slot.version ?? 0,
        eventFlagBytes: eventFlags.byteLength,
        playerPosition: mapState.player,
        bloodstain: mapState.bloodstain,
        markerStates: derived.states,
        officialMarkerStates: officialDerived.markerStates,
        officialTextStates: officialDerived.textStates,
        counts: derived.counts,
        capitalState: deriveCapitalState((flagId) => readFlag(eventFlags, flagId)),
        fastTravel: deriveFastTravelState(mapState.player.mapId, (flagId) => readFlag(eventFlags, flagId)),
        dlcEvidence: detectDlcEvidence(slot.mapId ?? profile?.mapId, slot.regions),
        mapDiscovery: {
          openEventFlagIds: MAP_DISCOVERY_EVENT_FLAGS.filter((flagId) => readFlag(eventFlags, flagId) === true),
          visitedRegionIds: (slot.regions ?? [])
            .map(({ regionId }) => regionId)
            .filter((regionId): regionId is number => Number.isInteger(regionId) && regionId! > 0),
          fogRevealBytes: mapState.fogRevealBytes,
        },
      });
    }
    const response: SaveParserResponse = {
      type: 'RESULT',
      requestId: request.requestId,
      snapshot: { schemaVersion: 1, slots, elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10 },
    };
    workerScope.postMessage(response, slots.flatMap((slot) => [
      slot.markerStates.buffer as ArrayBuffer,
      slot.officialMarkerStates.buffer as ArrayBuffer,
      slot.officialTextStates.buffer as ArrayBuffer,
      slot.mapDiscovery.fogRevealBytes.buffer as ArrayBuffer,
    ]));
  } catch (error) {
    post({
      type: 'ERROR',
      requestId: request.requestId,
      message: error instanceof SaveContainerError
        ? error.message
        : error instanceof Error ? friendlyError(error.message) : '存档解析失败',
    });
  }
};

function readFlag(eventFlags: Uint8Array, flagId: number): boolean | undefined {
  try {
    return getEventFlagState(eventFlagIndex, eventFlags, flagId);
  } catch {
    return undefined;
  }
}

function toCharacterSummary(
  character: Character | undefined,
  fallbackArchetype: number | undefined,
  fallbackGift: number | undefined,
  loadout: NonNullable<ParsedSlotSummary['character']>['loadout'],
): ParsedSlotSummary['character'] {
  if (!character) return undefined;
  return {
    hp: character.hp,
    maxHp: character.maxHp,
    baseMaxHp: character.baseMaxHp,
    fp: character.fp,
    maxFp: character.maxFp,
    baseMaxFp: character.baseMaxFp,
    stamina: character.sp,
    maxStamina: character.maxSp,
    baseMaxStamina: character.baseMaxSp,
    vigor: character.vigor,
    mind: character.mind,
    endurance: character.endurance,
    strength: character.strength,
    dexterity: character.dexterity,
    intelligence: character.intelligence,
    faith: character.faith,
    arcane: character.arcane,
    runes: character.runes,
    runeMemory: character.runesMemory,
    archetype: character.archetype ?? fallbackArchetype,
    gift: character.gift ?? fallbackGift,
    bodyType: character.bodyType,
    voiceType: character.voiceType,
    poisonBuildup: character.poisonBuildup,
    rotBuildup: character.rotBuildup,
    bleedBuildup: character.bleedBuildup,
    deathBuildup: character.deathBuildup,
    frostBuildup: character.frostBuildup,
    sleepBuildup: character.sleepBuildup,
    madnessBuildup: character.madnessBuildup,
    additionalTalismanSlotCount: character.additionalTalismanSlotCount,
    summonSpiritLevel: character.summonSpiritLevel,
    maxCrimsonTearFlaskCount: character.maxCrimsonTearFlaskCount,
    maxCeruleanTearFlaskCount: character.maxCeruleanTearFlaskCount,
    acquiredProjectilesCount: character.aquiredProjectilesCount,
    loadout,
  };
}

function friendlyError(message: string): string {
  if (/magic|BND4|SL2/i.test(message)) return '文件不是受支持的 PC 版 Elden Ring 存档';
  if (/bounds|range|offset|length|布局版本/i.test(message)) return '存档被截断或布局版本暂不支持';
  return '无法解析该存档；请确认它是未损坏的 .sl2、.co2 或 ERR .err 文件';
}

function post(response: SaveParserResponse): void {
  workerScope.postMessage(response);
}

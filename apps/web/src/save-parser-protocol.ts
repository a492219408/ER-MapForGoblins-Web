import type { MarkerCatalogEntry, OfficialMapMarker } from './dataset';
import type { MarkerStateCounts } from './marker-state';
import type { SaveMapPoint } from './slot-map-state';
import type { CapitalState } from './capital-state';
import type { DlcEvidence } from './dlc-state';
import type { FastTravelState } from './fast-travel-state';

export type ParsedItemKind = 'weapon' | 'armor' | 'talisman' | 'goods' | 'ash-of-war';
export type CharacterAgeGroup = 'young' | 'mature' | 'aged';

export interface ParsedEquippedItem {
  id: number;
  kind: ParsedItemKind;
  handle?: number;
  /** 去除强化与质变后对应的 EquipParamWeapon 基础行。 */
  baseId?: number;
  upgradeLevel?: number;
  /** 0 = 普通、1 = 厚重……对应武器实例 ID 的百位后缀。 */
  affinityId?: number;
  /** 从这件具体武器实例解析出的 EquipParamGem 战灰行。 */
  ashOfWarId?: number;
}

export interface ParsedInventoryItem extends ParsedEquippedItem {
  quantity: number;
  inventoryIndex: number;
  keyItem: boolean;
}

export interface ParsedCharacterLoadout {
  rightHand: Array<ParsedEquippedItem | undefined>;
  leftHand: Array<ParsedEquippedItem | undefined>;
  arrows: Array<ParsedEquippedItem | undefined>;
  bolts: Array<ParsedEquippedItem | undefined>;
  armor: {
    head?: ParsedEquippedItem;
    chest?: ParsedEquippedItem;
    arms?: ParsedEquippedItem;
    legs?: ParsedEquippedItem;
  };
  talismans: Array<ParsedEquippedItem | undefined>;
  quickItems: Array<ParsedEquippedItem | undefined>;
  pouchItems: Array<ParsedEquippedItem | undefined>;
  memorizedSpells: Array<number | undefined>;
  /** 实际可用记忆空格；存档始终预留 14 个物理字段。 */
  memorySlotCount: number;
  activeSpellSlot?: number;
  activeLeftHandSlot?: number;
  activeRightHandSlot?: number;
  activeQuickItemSlot?: number;
  greatRune?: ParsedEquippedItem;
  ageGroup?: CharacterAgeGroup;
  inventory: {
    heldCommonDistinctCount: number;
    heldKeyDistinctCount: number;
    storedCommonDistinctCount: number;
    storedKeyDistinctCount: number;
    heldItems: ParsedInventoryItem[];
    storedItems: ParsedInventoryItem[];
  };
}

export interface ParsedCharacterSummary {
  hp?: number;
  maxHp?: number;
  baseMaxHp?: number;
  fp?: number;
  maxFp?: number;
  baseMaxFp?: number;
  stamina?: number;
  maxStamina?: number;
  baseMaxStamina?: number;
  vigor?: number;
  mind?: number;
  endurance?: number;
  strength?: number;
  dexterity?: number;
  intelligence?: number;
  faith?: number;
  arcane?: number;
  runes?: number;
  runeMemory?: number;
  archetype?: number;
  gift?: number;
  bodyType?: number;
  voiceType?: number;
  poisonBuildup?: number;
  rotBuildup?: number;
  bleedBuildup?: number;
  deathBuildup?: number;
  frostBuildup?: number;
  sleepBuildup?: number;
  madnessBuildup?: number;
  additionalTalismanSlotCount?: number;
  summonSpiritLevel?: number;
  maxCrimsonTearFlaskCount?: number;
  maxCeruleanTearFlaskCount?: number;
  acquiredProjectilesCount?: number;
  loadout?: ParsedCharacterLoadout;
}

export interface ParsedSlotSummary {
  index: number;
  name: string;
  level: number;
  secondsPlayed: number;
  totalDeathCount?: number;
  character?: ParsedCharacterSummary;
  mapId?: string;
  mapName?: string;
  version: number;
  eventFlagBytes: number;
  playerPosition: SaveMapPoint;
  bloodstain: SaveMapPoint & { runes: number };
  markerStates: Uint8Array;
  officialMarkerStates: Uint8Array;
  officialTextStates: Uint8Array;
  counts: MarkerStateCounts;
  capitalState?: CapitalState;
  fastTravel: FastTravelState;
  dlcEvidence: DlcEvidence;
  mapDiscovery: {
    openEventFlagIds: number[];
    visitedRegionIds: number[];
    fogRevealBytes: Uint8Array;
  };
}

export interface ParsedSaveSnapshot {
  schemaVersion: 1;
  slots: ParsedSlotSummary[];
  elapsedMs: number;
}

export type SaveParserRequest =
  | {
    type: 'INITIALIZE';
    markers: MarkerCatalogEntry[];
    officialMarkers: OfficialMapMarker[];
    officialTextStateCount: number;
  }
  | { type: 'PARSE'; requestId: number; bytes: ArrayBuffer };

export type SaveParserResponse =
  | { type: 'INITIALIZED' }
  | { type: 'RESULT'; requestId: number; snapshot: ParsedSaveSnapshot }
  | { type: 'ERROR'; requestId: number; message: string };

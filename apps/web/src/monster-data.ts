import type { GameRelease } from './game-release';
import { resolveAssetBases } from './asset-base';

export type MonsterStatValue = number | string | boolean | null;

export interface MonsterCycle {
  id: string;
  label: string;
  clearCount: number;
}

export interface MonsterField {
  id: string;
  label: string;
  group: string;
  sourceColumn: string;
  unit?: string;
}

export interface DlcCompletionEffect {
  spEffectId: number;
  damageMultipliers: [number, number, number, number, number];
}

export interface MonsterFlags {
  void: boolean;
  thoseWhoLiveInDeath: boolean;
  ancientDragon: boolean;
  dragonOrWyrm: boolean;
  calculatePvpDamage: boolean;
  defFlickPower: MonsterStatValue;
}

export interface MultiplayerCorrection {
  id: number;
  summons: MonsterStatValue[][];
}

export interface ResistanceCorrection {
  id: number;
  name: string | null;
  addPoints: MonsterStatValue[];
  addRates: MonsterStatValue[];
}

export interface MonsterEntry {
  key: string;
  location: string;
  locationLabels?: Record<string, string>;
  name: string;
  labels?: Record<string, string>;
  nameLocalizationSource?: 'npc-param' | 'boss-event' | 'exact-name';
  id: string;
  drops: string[];
  flags: MonsterFlags;
  dlcCompletionSpEffectId: number | null;
  multiPlayCorrectionId: number | null;
  resistanceCorrectionIds: Array<number | null>;
  cycles: MonsterStatValue[][];
}

export interface MonsterDataset {
  schemaVersion: 1;
  game: 'elden-ring';
  source: {
    kind: 'community-reference-workbook';
    fileName: string;
    applicationVersion: string | null;
    sha256: string;
    note: string;
  };
  generatedAt: string;
  gameRelease?: GameRelease;
  localization: {
    defaultLocale: string;
    locales: string[];
    nameRows: number;
    locationRows: number;
    npcParamNameRows: number;
    bossEventNameRows: number;
    exactNameRows: number;
    note: string;
  };
  cycleModel: {
    kind: 'table';
    maximumClearCount: number;
    parameter: 'ClearCountCorrectParam';
    dlcCompletion: string;
    areaScaling: string;
  };
  cycles: MonsterCycle[];
  fields: MonsterField[];
  dlcCompletionEffects: DlcCompletionEffect[];
  multiplayerFields: Array<{ id: string; label: string }>;
  multiplayerCorrections: MultiplayerCorrection[];
  resistanceCorrections: ResistanceCorrection[];
  enemyCount: number;
  enemies: MonsterEntry[];
}

interface MonsterDataManifest {
  schemaVersion: 1;
  gameRelease?: GameRelease;
  resource: {
    path: string;
    schemaVersion: 1;
  };
}

export async function loadMonsterDataset(signal?: AbortSignal): Promise<MonsterDataset> {
  let lastStatus: number | undefined;
  for (const baseUrl of assetBaseCandidates()) {
    const manifestResponse = await fetch(new URL('monster-data/monster-data-manifest.v1.json', baseUrl), {
      cache: 'no-cache',
      signal,
    });
    if (!manifestResponse.ok) {
      lastStatus = manifestResponse.status;
      continue;
    }
    const manifest = await manifestResponse.json() as MonsterDataManifest;
    if (manifest.schemaVersion !== 1 || manifest.resource.schemaVersion !== 1 || !manifest.resource.path) {
      throw new Error('怪物数据清单版本不受支持');
    }
    const response = await fetch(new URL(manifest.resource.path, baseUrl), { cache: 'no-cache', signal });
    if (!response.ok) throw new Error(`无法读取怪物数据（HTTP ${response.status}）`);
    const dataset = await response.json() as MonsterDataset;
    if (!validMonsterDataset(dataset)) throw new Error('怪物数据不完整或版本不受支持');
    return { ...dataset, gameRelease: manifest.gameRelease };
  }
  throw new Error(`无法读取怪物数据清单（HTTP ${lastStatus ?? '未知'}）；请先运行 pnpm build:monster-data`);
}

export function monsterFieldIndex(dataset: MonsterDataset, fieldId: string): number {
  return dataset.fields.findIndex((field) => field.id === fieldId);
}

export function searchMonsters(enemies: readonly MonsterEntry[], query: string): MonsterEntry[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...enemies];
  return enemies.filter((enemy) => {
    const haystack = [
      enemy.name,
      enemy.location,
      enemy.id,
      ...Object.values(enemy.labels ?? {}),
      ...Object.values(enemy.locationLabels ?? {}),
    ].join('\u0000').toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export function localizedMonsterName(enemy: MonsterEntry, locale: string): string {
  return localizedValue(enemy.labels, locale, enemy.name);
}

export function localizedMonsterLocation(enemy: MonsterEntry, locale: string): string {
  return localizedValue(enemy.locationLabels, locale, enemy.location);
}

function validMonsterDataset(dataset: MonsterDataset): boolean {
  return dataset.schemaVersion === 1
    && dataset.game === 'elden-ring'
    && typeof dataset.localization?.defaultLocale === 'string'
    && Array.isArray(dataset.localization?.locales)
    && dataset.cycleModel.kind === 'table'
    && dataset.cycles.length === 8
    && dataset.fields.length > 0
    && dataset.multiplayerFields.length === 14
    && dataset.enemies.length === dataset.enemyCount
    && dataset.enemies.every((enemy) => (
      enemy.cycles.length === dataset.cycles.length
      && enemy.cycles.every((values) => values.length === dataset.fields.length)
    ));
}

function localizedValue(labels: Record<string, string> | undefined, locale: string, fallback: string): string {
  return labels?.[locale] ?? labels?.['en-US'] ?? fallback;
}

function assetBaseCandidates(): string[] {
  return resolveAssetBases(import.meta.env.VITE_MFG_ASSET_BASE_URL, document.baseURI);
}

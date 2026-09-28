import type { CapitalPreference } from './capital-state';
import { isDatasetProfile, type DatasetProfile, type MapPlane } from './dataset';

export const REFRESH_INTERVALS = [0, 2, 5, 10, 30] as const;
export type RefreshInterval = typeof REFRESH_INTERVALS[number];
export type MapCenter = [number, number];
export type MapCenters = Partial<Record<MapPlane, MapCenter>>;

export interface ClientPreferences {
  version: 1;
  refreshInterval: RefreshInterval;
  selectedSlot: number | null;
  locale: string;
  hiddenCategories: string[];
  capitalPreference: CapitalPreference;
  datasetProfile: DatasetProfile;
  followPlayerLocation: boolean;
  mapPlane: MapPlane;
  mapZoom: number | null;
  mapCenters: MapCenters;
  monsterCycle: number;
  monsterDlcCompleted: boolean;
  showShadowOfTheErdtreeItems: boolean;
  showTarnishedPackItems: boolean;
  itemCategory: string;
}

const COOKIE_NAME = 'mfg_preferences_v1';
const DEFAULT_PREFERENCES: ClientPreferences = {
  version: 1,
  refreshInterval: 5,
  selectedSlot: null,
  locale: 'auto',
  hiddenCategories: [],
  capitalPreference: 'auto',
  datasetProfile: 'vanilla',
  followPlayerLocation: false,
  mapPlane: 'surface',
  mapZoom: null,
  mapCenters: {},
  monsterCycle: 0,
  monsterDlcCompleted: false,
  showShadowOfTheErdtreeItems: true,
  showTarnishedPackItems: true,
  itemCategory: 'melee',
};

export function loadClientPreferences(cookieHeader = document.cookie): ClientPreferences {
  const encoded = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!encoded) return DEFAULT_PREFERENCES;

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded)) as Partial<ClientPreferences>;
    const interval = REFRESH_INTERVALS.includes(parsed.refreshInterval as RefreshInterval)
      ? parsed.refreshInterval as RefreshInterval
      : DEFAULT_PREFERENCES.refreshInterval;
    return {
      version: 1,
      refreshInterval: interval,
      selectedSlot: Number.isInteger(parsed.selectedSlot) ? Number(parsed.selectedSlot) : null,
      locale: typeof parsed.locale === 'string' && parsed.locale.length <= 20 ? parsed.locale : DEFAULT_PREFERENCES.locale,
      hiddenCategories: normalizeHiddenCategories(parsed.hiddenCategories),
      capitalPreference: normalizeCapitalPreference(parsed.capitalPreference),
      datasetProfile: isDatasetProfile(parsed.datasetProfile) ? parsed.datasetProfile : DEFAULT_PREFERENCES.datasetProfile,
      followPlayerLocation: parsed.followPlayerLocation === true,
      mapPlane: normalizeMapPlane(parsed.mapPlane),
      mapZoom: normalizeMapZoom(parsed.mapZoom),
      mapCenters: normalizeMapCenters(parsed.mapCenters),
      monsterCycle: normalizeMonsterCycle(parsed.monsterCycle),
      monsterDlcCompleted: parsed.monsterDlcCompleted === true,
      showShadowOfTheErdtreeItems: parsed.showShadowOfTheErdtreeItems !== false,
      showTarnishedPackItems: parsed.showTarnishedPackItems !== false,
      itemCategory: normalizeItemCategory(parsed.itemCategory),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function normalizeItemCategory(value: unknown): string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
    ? value
    : DEFAULT_PREFERENCES.itemCategory;
}

function normalizeMapPlane(value: unknown): MapPlane {
  return value === 'underground' || value === 'shadow' ? value : 'surface';
}

function normalizeMapCenters(value: unknown): MapCenters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: MapCenters = {};
  for (const plane of ['surface', 'underground', 'shadow'] as const) {
    const center = (value as Record<string, unknown>)[plane];
    if (!Array.isArray(center) || center.length !== 2) continue;
    const [longitude, latitude] = center;
    if (
      typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    ) continue;
    result[plane] = [roundCoordinate(longitude), roundCoordinate(latitude)];
  }
  return result;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeMonsterCycle(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 7 ? Number(value) : 0;
}

function normalizeMapZoom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 12
    ? Math.round(value * 1000) / 1000
    : null;
}

function normalizeCapitalPreference(value: unknown): CapitalPreference {
  return value === 'royal' || value === 'ashen' ? value : 'auto';
}

function normalizeHiddenCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (category): category is string => typeof category === 'string' && category.length > 0 && category.length <= 64,
  ))].slice(0, 100);
}

export function saveClientPreferences(preferences: ClientPreferences): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(preferences))}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
}

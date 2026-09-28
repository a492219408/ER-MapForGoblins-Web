import type { GameRelease } from './game-release';

export type ItemParamValue = number | string | boolean | null;

export interface ItemEntry {
  key: string;
  id: string;
  kind: ItemKind;
  categoryPath: string[];
  iconId: number | null;
  sortId: number;
  isCutContent: boolean;
  contentPack: ItemContentPack;
  fallbackName: string;
  params: Record<string, ItemParamValue>;
}

export type ItemContentPack = 'base' | 'shadow-of-the-erdtree' | 'tarnished-pack';
export type ItemIconVariant = 'small' | 'large';

export type ItemKind =
  | 'weapon'
  | 'armor'
  | 'talisman'
  | 'goods'
  | 'material'
  | 'upgrade-material'
  | 'key-item'
  | 'information'
  | 'gesture'
  | 'spirit-ash'
  | 'crystal-tear'
  | 'sorcery'
  | 'incantation'
  | 'ash-of-war';

export interface ItemText {
  name?: string;
  info?: string;
  info2?: string;
  caption?: string;
  effects?: string[];
  skillName?: string;
  skillCaption?: string;
}

export interface ItemDataset {
  schemaVersion: 1;
  game: 'elden-ring';
  generatedAt: string;
  gameRelease?: GameRelease;
  itemCount: number;
  items: ItemEntry[];
  reinforcements: Record<string, Record<string, ItemParamValue>>;
  spEffects: Record<string, Record<string, ItemParamValue>>;
  texts: Record<string, ItemText>;
  locale: string;
  iconPathTemplates: Record<ItemIconVariant, string>;
  iconIdsByVariant: Record<ItemIconVariant, ReadonlySet<number>>;
  assetBaseUrl: string;
}

interface ItemManifest {
  schemaVersion: 1;
  game: 'elden-ring';
  gameRelease?: GameRelease;
  core: { path: string; itemCount: number };
  locales: Record<string, { path: string }>;
  icons: {
    pathTemplate?: string;
    available?: number[];
    variantsVersion?: 1;
    variants?: Record<ItemIconVariant, { pathTemplate: string; available: number[] }>;
  };
}

interface ItemCore extends Omit<ItemDataset, 'texts' | 'locale' | 'iconPathTemplates' | 'iconIdsByVariant' | 'assetBaseUrl'> {}

interface ItemLocaleData {
  schemaVersion: 1;
  locale: string;
  texts: Record<string, ItemText>;
}

export async function loadItemDataset(locale: string, signal?: AbortSignal): Promise<ItemDataset> {
  let lastStatus: number | undefined;
  for (const baseUrl of assetBaseCandidates()) {
    const manifestResponse = await fetch(new URL('item-data/item-data-manifest.v1.json', baseUrl), {
      cache: 'no-cache',
      signal,
    });
    if (!manifestResponse.ok) {
      lastStatus = manifestResponse.status;
      continue;
    }
    const manifest = await manifestResponse.json() as ItemManifest;
    if (manifest.schemaVersion !== 1 || manifest.game !== 'elden-ring' || !manifest.core?.path) {
      throw new Error('物品数据清单版本不受支持');
    }
    const selectedLocale = selectDatasetLocale(locale, Object.keys(manifest.locales));
    const textLocales = selectedLocale === 'en-US' ? ['en-US'] : ['en-US', selectedLocale];
    const [coreResponse, ...textResponses] = await Promise.all([
      fetch(new URL(manifest.core.path, baseUrl), { cache: 'no-cache', signal }),
      ...textLocales.map((value) => fetch(new URL(manifest.locales[value].path, baseUrl), { cache: 'no-cache', signal })),
    ]);
    if (!coreResponse.ok || textResponses.some((response) => !response.ok)) {
      throw new Error('物品数据资源不完整');
    }
    const core = await coreResponse.json() as ItemCore;
    const textDatasets = await Promise.all(textResponses.map((response) => response.json() as Promise<ItemLocaleData>));
    if (core.schemaVersion !== 1 || core.itemCount !== core.items?.length) throw new Error('物品参数核心不完整');
    const texts = Object.assign({}, ...textDatasets.map((data) => data.texts));
    const legacyPath = manifest.icons.pathTemplate ?? 'item-data/icons/{iconId}.webp';
    const legacyAvailable = manifest.icons.available ?? [];
    const smallIcons = manifest.icons.variants?.small;
    const largeIcons = manifest.icons.variants?.large;
    return {
      ...core,
      items: core.items.map((item) => ({ ...item, contentPack: item.contentPack ?? 'base' })),
      gameRelease: manifest.gameRelease,
      texts,
      locale: selectedLocale,
      iconPathTemplates: {
        small: smallIcons?.pathTemplate ?? legacyPath,
        large: largeIcons?.pathTemplate ?? smallIcons?.pathTemplate ?? legacyPath,
      },
      iconIdsByVariant: {
        small: new Set(smallIcons?.available ?? legacyAvailable),
        large: new Set(largeIcons?.available ?? smallIcons?.available ?? legacyAvailable),
      },
      assetBaseUrl: baseUrl,
    };
  }
  throw new Error(`无法读取物品数据清单（HTTP ${lastStatus ?? '未知'}）；请先运行 pnpm build:item-data`);
}

export function localizedItemName(dataset: ItemDataset, item: ItemEntry): string {
  return dataset.texts[item.key]?.name ?? item.fallbackName;
}

export function itemIconUrl(dataset: ItemDataset, item: ItemEntry, variant: ItemIconVariant = 'small'): string | undefined {
  if (item.iconId == null) return undefined;
  const selectedVariant = dataset.iconIdsByVariant[variant].has(item.iconId)
    ? variant
    : dataset.iconIdsByVariant.small.has(item.iconId) ? 'small' : undefined;
  if (!selectedVariant) return undefined;
  const path = dataset.iconPathTemplates[selectedVariant].replace('{iconId}', String(item.iconId));
  return new URL(path, dataset.assetBaseUrl).toString();
}

export function searchItems(
  dataset: ItemDataset,
  query: string,
  options: { includeCutContent?: boolean; contentPacks?: ReadonlySet<ItemContentPack> } = {},
): ItemEntry[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return dataset.items.filter((item) => {
    if (item.isCutContent === true && !options.includeCutContent) return false;
    if (options.contentPacks && !options.contentPacks.has(item.contentPack)) return false;
    const text = dataset.texts[item.key];
    const haystack = [text?.name, item.fallbackName, item.id, item.kind, ...item.categoryPath]
      .filter(Boolean)
      .join('\u0000')
      .toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export function itemEffectIds(item: ItemEntry): number[] {
  return [...new Set(Object.entries(item.params)
    .filter(([key, value]) => (
      (key.includes('SpEffectId') || key.startsWith('refId'))
      && typeof value === 'number'
      && value > 0
    ))
    .map(([, value]) => Number(value)))];
}

function selectDatasetLocale(locale: string, available: readonly string[]): string {
  if (available.includes(locale)) return locale;
  const language = locale.split('-')[0];
  return available.find((candidate) => candidate.split('-')[0] === language) ?? 'en-US';
}

function assetBaseCandidates(): string[] {
  const configuredBase = import.meta.env.VITE_MFG_ASSET_BASE_URL?.trim();
  if (configuredBase) return [`${configuredBase.replace(/\/$/, '')}/`];
  return [...new Set([
    new URL('.', document.baseURI).toString(),
    new URL('assets/', document.baseURI).toString(),
  ])];
}

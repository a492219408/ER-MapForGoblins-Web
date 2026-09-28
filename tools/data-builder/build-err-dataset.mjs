import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseLegacyConversions } from './legacy-conversions.mjs';
import { parseMarkerRowTail } from './marker-row-tail.mjs';

const args = readArguments(process.argv.slice(2));
const profile = normalizeProfile(args.profile ?? 'err');
const referenceDirectory = resolve(
  args.reference ?? process.env.MFG_ERR_MAP_REFERENCE ?? fail('请通过 --reference 或 MFG_ERR_MAP_REFERENCE 指定 ERR-MapForGoblins-DLL 目录'),
);
const outputDirectory = resolve(args.output ?? 'runtime/assets');
const activateProfile = args.activate !== 'false';
const generatedDirectory = profile === 'err' ? 'generated' : `generated_${profile}`;
const profileDataDirectory = profile === 'err' ? 'data' : join('data', profile);
const mapDataPath = join(referenceDirectory, 'src', generatedDirectory, 'goblin_map_data.cpp');
const legacyConversionHeaderPath = join(referenceDirectory, 'src', generatedDirectory, 'goblin_legacy_conv.hpp');
const legacyConversionParameterPath = join(referenceDirectory, profileDataDirectory, 'WorldMapLegacyConvParam.json');
const localeDefinitions = [
  ['en-US', 'en.json'],
  ['zh-CN', 'schinese.json'],
  ['zh-TW', 'tchinese.json'],
  ['fr-FR', 'french.json'],
  ['de-DE', 'german.json'],
  ['es-ES', 'spanish.json'],
  ['ko-KR', 'korean.json'],
  ['ru-RU', 'russian.json'],
];
const supportedLocales = [
  'zh-CN', 'zh-TW', 'en-US', 'fr-FR', 'it-IT', 'de-DE', 'es-ES', 'ja-JP',
  'ko-KR', 'pl-PL', 'pt-BR', 'ru-RU', 'es-419', 'th-TH', 'ar-AE',
];

const sourceManifest = args['source-manifest']
  ? JSON.parse(await readFile(resolve(args['source-manifest']), 'utf8'))
  : undefined;
const gameRelease = sourceManifest ? gameReleaseFromSourceManifest(sourceManifest) : undefined;

const [mapSource, legacyHeaderSource, legacyParameterSource, ...localeSources] = await Promise.all([
  readFile(mapDataPath, 'utf8'),
  readFile(legacyConversionHeaderPath, 'utf8'),
  readFile(legacyConversionParameterPath, 'utf8'),
  ...localeDefinitions.map(([, file]) => readFile(join(referenceDirectory, 'i18n', file), 'utf8')),
]);

const legacyConversions = parseLegacyConversions(legacyHeaderSource, legacyParameterSource);
const markers = parseMarkers(mapSource, legacyConversions);
if (profile === 'err' && markers.length !== 9201) {
  throw new Error(`标记数量异常：预期 9201，实际 ${markers.length}`);
}

const mappedMarkers = markers.filter((marker) => marker.mapPosition);
const localeBundles = new Map(localeDefinitions.map(([locale], index) => [locale, JSON.parse(localeSources[index])]));
for (const locale of supportedLocales) {
  if (!localeBundles.has(locale)) localeBundles.set(locale, localeBundles.get('en-US'));
}
const categoryCatalog = buildCategoryCatalog(markers, localeBundles, profile);
const catalog = {
  schemaVersion: 1,
  profile,
  coordinateSystem: {
    id: 'elden-ring-world-map-v1',
    description: 'worldX = gridX * 256 + posX；mapX = worldX - 7040；mapY = 16512 - worldZ',
    mapFrame: {
      bounds: [0, 0, 10496, 10496],
      tileSize: 256,
      xyzZoom: 6,
      xyzOrigin: [11, 11],
      xyzSpan: 41,
    },
  },
  legacyConversions,
  evidence: {
    source: `ERR-MapForGoblins-DLL/src/${generatedDirectory}/goblin_map_data.cpp`,
    license: 'MIT-style',
  },
  markerCount: markers.length,
  mappedMarkerCount: mappedMarkers.length,
  extent: calculateExtent(mappedMarkers),
  markers,
};

const catalogBytes = Buffer.from(JSON.stringify(catalog));
const catalogHash = sha256(catalogBytes);
const catalogRelativePath = `datasets/${profile}/marker-catalog.v1.${catalogHash.slice(0, 16)}.json`;
const catalogOutputPath = join(outputDirectory, catalogRelativePath);
await mkdir(dirname(catalogOutputPath), { recursive: true });
await writeFile(catalogOutputPath, catalogBytes);

const categoryBytes = Buffer.from(JSON.stringify(categoryCatalog));
const categoryHash = sha256(categoryBytes);
const categoryRelativePath = `datasets/${profile}/category-catalog.v1.${categoryHash.slice(0, 16)}.json`;
const categoryOutputPath = join(outputDirectory, categoryRelativePath);
await writeFile(categoryOutputPath, categoryBytes);

const existingResources = await readExistingGeneratedResources(outputDirectory);
const manifest = {
  schemaVersion: 1,
  profile,
  generatedAt: new Date().toISOString(),
  sourceRevision: sha256(Buffer.from([mapSource, legacyHeaderSource, legacyParameterSource, ...localeSources].join('\0'))),
  ...(gameRelease ? { gameRelease } : {}),
  resources: {
    markerCatalog: {
      path: catalogRelativePath.replaceAll('\\', '/'),
      sha256: catalogHash,
      bytes: catalogBytes.byteLength,
      schemaVersion: 1,
    },
    categoryCatalog: {
      path: categoryRelativePath.replaceAll('\\', '/'),
      sha256: categoryHash,
      bytes: categoryBytes.byteLength,
      schemaVersion: 1,
    },
    ...existingResources,
  },
};
await mkdir(outputDirectory, { recursive: true });
const profileManifestRelativePath = `datasets/${profile}/dataset-manifest.v1.json`;
await writeFile(join(outputDirectory, profileManifestRelativePath), `${JSON.stringify(manifest, null, 2)}\n`);
if (activateProfile) {
  await writeFile(join(outputDirectory, 'dataset-manifest.v1.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
await updateDatasetIndex(outputDirectory, profile, profileManifestRelativePath, activateProfile);

console.log(`已生成 ${markers.length} 个 ${profile} 标记（可投影 ${mappedMarkers.length} 个）`);
console.log(`已生成 ${categoryCatalog.categories.length} 个分类（${categoryCatalog.locales.length} 种语言）`);
console.log(`Profile 清单：${join(outputDirectory, profileManifestRelativePath)}`);
if (activateProfile) console.log(`默认清单：${join(outputDirectory, 'dataset-manifest.v1.json')}`);

function gameReleaseFromSourceManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || typeof manifest.sourceFingerprint !== 'string') {
    throw new Error('游戏源清单版本不受支持');
  }
  const regulation = manifest.files.find(({ path }) => {
    const normalized = path.replaceAll('\\', '/').toLowerCase();
    return normalized === 'regulation.bin' || normalized.endsWith('/regulation.bin');
  });
  return {
    ...manifest.release,
    sourceFingerprint: manifest.sourceFingerprint,
    ...(regulation?.sha256 ? { regulationSha256: regulation.sha256 } : {}),
  };
}

function parseMarkers(source, legacyConversions) {
  const blocks = source.split(/(?=\s*\/\/ Row ID \d+)/g);
  const markers = [];
  for (const block of blocks) {
    const rowMatch = block.match(/\/\/ Row ID (\d+)\s*\r?\n\s*\{(\d+)ull,\s*\{/);
    if (!rowMatch) continue;
    const tail = parseMarkerRowTail(block, rowMatch[1]);

    const id = Number(rowMatch[1]);
    if (id !== Number(rowMatch[2])) throw new Error(`Row ID 不一致：${rowMatch[1]} / ${rowMatch[2]}`);
    const category = tail.category;
    const area = fieldNumber(block, 'areaNo');
    const gridX = fieldNumber(block, 'gridXNo');
    const gridZ = fieldNumber(block, 'gridZNo');
    const posX = fieldNumber(block, 'posX');
    const posY = fieldNumber(block, 'posY');
    const posZ = fieldNumber(block, 'posZ');
    const geomSlot = tail.geomSlot;
    const collectionFlags = uniquePositive([
      ...Array.from({ length: 8 }, (_, index) => fieldNumber(block, `textDisableFlagId${index + 1}`)),
      fieldNumber(block, 'clearedEventFlagId'),
    ]);
    const mapPosition = project(area, gridX, gridZ, posX, posZ, legacyConversions);

    markers.push({
      id,
      category,
      group: categoryGroup(category),
      iconId: fieldNumber(block, 'iconId'),
      area,
      gridX,
      gridZ,
      position: [posX, posY, posZ],
      mapPosition,
      plane: planeFor(area, mapPosition?.targetArea),
      displayFlag: fieldNumber(block, 'eventFlagId'),
      collectionFlags,
      geomSlot,
      lotId: tail.lotId,
      lotType: tail.lotType,
      textIds: uniquePositive(Array.from({ length: 8 }, (_, index) => fieldNumber(block, `textId${index + 1}`))),
      trackable: collectionFlags.length > 0 || geomSlot >= 0,
      ...(capitalStateFor(area, gridX) ? { capitalState: capitalStateFor(area, gridX) } : {}),
    });
  }
  return markers;
}

function capitalStateFor(area, gridX) {
  if (area !== 11) return undefined;
  if (gridX === 0) return 'royal';
  if (gridX === 5) return 'ashen';
  return undefined;
}

function buildCategoryCatalog(markers, localeBundles, activeProfile) {
  const counts = new Map();
  for (const marker of markers) counts.set(marker.category, (counts.get(marker.category) ?? 0) + 1);
  const allCategoryDefinitions = buildCategoryDefinitions();
  const categoryDefinitions = activeProfile === 'err'
    ? allCategoryDefinitions
    : allCategoryDefinitions.filter(({ id }) => counts.has(id));
  const definedIds = new Set(categoryDefinitions.map(({ id }) => id));
  const unknown = [...counts.keys()].filter((category) => !definedIds.has(category));
  if (unknown.length > 0 || (activeProfile === 'err' && categoryDefinitions.length !== 63)) {
    throw new Error(`分类定义不完整：${unknown.join(', ') || `定义数量 ${categoryDefinitions.length}`}`);
  }

  const localized = (table, key) => Object.fromEntries([...localeBundles].map(([locale, bundle]) => {
    const value = bundle[table]?.[key] ?? localeBundles.get('en-US')?.[table]?.[key];
    if (!value) throw new Error(`本地化缺失：${locale} / ${table} / ${key}`);
    return [locale, value];
  }));
  const sectionIds = [...new Set(categoryDefinitions.map(({ section }) => section))];
  return {
    schemaVersion: 1,
    profile: activeProfile,
    locales: [...localeBundles.keys()],
    evidence: {
      source: 'ERR-MapForGoblins-DLL/i18n/*.json',
      license: 'MIT-style',
    },
    sections: sectionIds.map((id) => ({ id, labels: localized('section_labels', id) })),
    categories: categoryDefinitions.map(({ id, configKey, section }) => ({
      id,
      configKey,
      section,
      group: categoryGroup(id),
      markerCount: counts.get(id) ?? 0,
      labels: localized('entry_labels', configKey),
      descriptions: localized('entry_comments', configKey),
    })),
  };
}

function normalizeProfile(value) {
  const supported = new Set([
    'err', 'vanilla', 'convergence2', 'convergence3', 'erte',
    'goldenage', 'goldenage363', 'vins', 'reborn', 'graceborne',
  ]);
  const normalized = String(value).trim().toLowerCase();
  if (!supported.has(normalized)) throw new Error(`不支持的数据 profile：${value}`);
  return normalized;
}

function project(area, gridX, gridZ, posX, posZ, legacyConversions) {
  let worldX;
  let worldZ;
  let targetArea = area;
  if (area === 60 || area === 61) {
    worldX = gridX * 256 + posX;
    worldZ = gridZ * 256 + posZ;
  } else {
    const conversion = legacyConversions.find((candidate) => candidate.sourceArea === area && candidate.sourceGridX === gridX);
    if (!conversion) return null;
    targetArea = conversion.targetArea;
    worldX = conversion.targetGridX * 256 + conversion.targetX + (posX - conversion.sourceX);
    worldZ = conversion.targetGridZ * 256 + conversion.targetZ + (posZ - conversion.sourceZ);
  }
  return {
    coordinate: [round(worldX - 7040), round(16512 - worldZ)],
    targetArea,
  };
}

function planeFor(area, targetArea) {
  if (area === 12) return 'underground';
  return (targetArea ?? area) === 61 ? 'shadow' : 'surface';
}

function categoryGroup(category) {
  if (category.startsWith('Equip')) return 'equipment';
  if (category.startsWith('Key') || category.startsWith('Magic') || category.startsWith('Quest')) return 'key-items';
  if (category.startsWith('World')) return 'world';
  return 'collectibles';
}

function fieldNumber(block, field) {
  const match = block.match(new RegExp(`\\.${field}\\s*=\\s*([-+]?\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : 0;
}

function uniquePositive(values) {
  return [...new Set(values.filter((value) => value > 0))];
}

function calculateExtent(markers) {
  const xs = markers.map((marker) => marker.mapPosition.coordinate[0]);
  const ys = markers.map((marker) => marker.mapPosition.coordinate[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function readArguments(values) {
  const parsed = {};
  const normalized = values[0] === '--' ? values.slice(1) : values;
  for (let index = 0; index < normalized.length; index += 2) {
    const key = normalized[index];
    const value = normalized[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error(`无效参数：${key ?? ''}`);
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function fail(message) {
  throw new Error(message);
}

async function readExistingGeneratedResources(directory) {
  try {
    const manifest = JSON.parse(await readFile(join(directory, 'dataset-manifest.v1.json'), 'utf8'));
    const resources = {};
    for (const key of ['mapTiles', 'officialMap', 'markerText']) {
      const resource = manifest?.resources?.[key];
      if (!resource?.path || resource.schemaVersion !== 1) continue;
      await access(join(directory, resource.path));
      resources[key] = resource;
    }
    return resources;
  } catch {
    return {};
  }
}

async function updateDatasetIndex(directory, activeProfile, manifestPath, activate) {
  const indexPath = join(directory, 'dataset-index.v1.json');
  let current;
  try {
    current = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch {
    current = undefined;
  }
  const profiles = new Map(
    Array.isArray(current?.profiles)
      ? current.profiles
        .filter((entry) => isProfileIndexEntry(entry))
        .map((entry) => [entry.id, entry])
      : [],
  );
  profiles.set(activeProfile, { id: activeProfile, manifestPath: manifestPath.replaceAll('\\', '/') });
  const index = {
    schemaVersion: 1,
    defaultProfile: activate ? activeProfile : normalizeProfile(current?.defaultProfile ?? activeProfile),
    profiles: [...profiles.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

function isProfileIndexEntry(value) {
  if (!value || typeof value !== 'object' || typeof value.manifestPath !== 'string') return false;
  try {
    return normalizeProfile(value.id) === value.id;
  } catch {
    return false;
  }
}

function buildCategoryDefinitions() {
  return [
  ['EquipArmaments', 'show_armaments', 'Equipment'],
  ['EquipArmour', 'show_armour', 'Equipment'],
  ['EquipAshesOfWar', 'show_ashes_of_war', 'Equipment'],
  ['EquipSpirits', 'show_spirits', 'Equipment'],
  ['EquipTalismans', 'show_talismans', 'Equipment'],
  ['KeyCelestialDew', 'show_celestial_dew', 'Key Items'],
  ['KeyCookbooks', 'show_cookbooks', 'Key Items'],
  ['KeyCrystalTears', 'show_crystal_tears', 'Key Items'],
  ['KeyGreatRunes', 'show_great_runes', 'Key Items'],
  ['KeyImbuedSwordKeys', 'show_imbued_sword_keys', 'Key Items'],
  ['KeyLarvalTears', 'show_larval_tears', 'Key Items'],
  ['KeyLostAshes', 'show_lost_ashes', 'Key Items'],
  ['KeyPotsNPerfumes', 'show_pots_n_perfumes', 'Key Items'],
  ['KeyScadutreeFragments', 'show_scadutree_fragments', 'Key Items'],
  ['KeySeedsTears', 'show_seeds_tears', 'Key Items'],
  ['KeyWhetblades', 'show_whetblades', 'Key Items'],
  ['LootAmmo', 'show_ammo', 'Loot'],
  ['LootBellBearings', 'show_bell_bearings', 'Loot'],
  ['LootMerchantBellBearings', 'show_merchant_bell_bearings', 'Loot'],
  ['LootConsumables', 'show_consumables', 'Loot'],
  ['LootGreases', 'show_greases', 'Loot'],
  ['LootUtilities', 'show_utilities', 'Loot'],
  ['LootStatBoosts', 'show_stat_boosts', 'Loot'],
  ['LootCraftingMaterials', 'show_crafting_materials', 'Loot'],
  ['LootGloveworts', 'show_gloveworts', 'Loot'],
  ['LootGoldenRunes', 'show_golden_runes', 'Loot'],
  ['LootGoldenRunesLow', 'show_golden_runes_low', 'Loot'],
  ['LootGreatGloveworts', 'show_great_gloveworts', 'Loot'],
  ['LootMaterialNodes', 'show_material_nodes', 'Loot'],
  ['LootMPFingers', 'show_mp_fingers', 'Loot'],
  ['LootPrattlingPates', 'show_prattling_pates', 'Loot'],
  ['LootGestures', 'show_gestures', 'Loot'],
  ['LootReusables', 'show_reusables', 'Loot'],
  ['LootSmithingStones', 'show_smithing_stones', 'Loot'],
  ['LootSmithingStonesLow', 'show_smithing_stones_low', 'Loot'],
  ['LootSmithingStonesRare', 'show_smithing_stones_rare', 'Loot'],
  ['LootStoneswordKeys', 'show_stonesword_keys', 'Loot'],
  ['LootThrowables', 'show_throwables', 'Loot'],
  ['LootRuneArcs', 'show_rune_arcs', 'Loot'],
  ['LootDragonHearts', 'show_dragon_hearts', 'Loot'],
  ['MagicIncantations', 'show_incantations', 'Magic'],
  ['MagicMemoryStones', 'show_memory_stones', 'Magic'],
  ['MagicPrayerbooks', 'show_prayerbooks', 'Magic'],
  ['MagicSorceries', 'show_sorceries', 'Magic'],
  ['QuestDeathroot', 'show_deathroot', 'Quest'],
  ['QuestProgression', 'show_progression', 'Quest'],
  ['QuestSeedbedCurses', 'show_seedbed_curses', 'Quest'],
  ['ReforgedEmberPieces', 'show_ember_pieces', 'Reforged'],
  ['ReforgedItemsAndChanges', 'show_items_and_changes', 'Reforged'],
  ['ReforgedFortunes', 'show_fortunes', 'Reforged'],
  ['ReforgedRunePieces', 'show_rune_pieces', 'Reforged'],
  ['WorldBosses', 'show_bosses', 'World'],
  ['WorldGraces', 'show_graces', 'World'],
  ['WorldHostileNPC', 'show_hostile_npc', 'World'],
  ['WorldImpStatues', 'show_imp_statues', 'World'],
  ['WorldPaintings', 'show_paintings', 'World'],
  ['WorldSpiritSprings', 'show_spirit_springs', 'World'],
  ['WorldSpiritspringHawks', 'show_spiritspring_hawks', 'World'],
  ['WorldStakesOfMarika', 'show_stakes_of_marika', 'World'],
  ['WorldSummoningPools', 'show_summoning_pools', 'World'],
  ['WorldKindlingSpirits', 'show_kindling_spirits', 'World'],
  ['WorldInteractables', 'show_interactables', 'World'],
  ['WorldMaps', 'show_world_maps', 'World'],
  ].map(([id, configKey, section]) => ({ id, configKey, section }));
}

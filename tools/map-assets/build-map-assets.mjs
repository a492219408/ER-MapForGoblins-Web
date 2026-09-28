import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = readArguments(process.argv.slice(2));
const unpackedDirectory = resolve(
  args.unpacked ?? process.env.MFG_ER_UNPACKED ?? fail('请通过 --unpacked 或 MFG_ER_UNPACKED 指定 Nuxe 解包目录'),
);
const witchy = resolve(
  args.witchy ?? process.env.MFG_WITCHY_BND ?? fail('请通过 --witchy 或 MFG_WITCHY_BND 指定 WitchyBND 可执行文件'),
);
const outputDirectory = resolve(args.output ?? 'runtime/assets');
const workDirectory = resolve(args.work ?? 'runtime/work/map-assets');
const menuDirectory = join(unpackedDirectory, 'menu');
const mapHeader = join(menuDirectory, '71_maptile.tpfbhd');
const mapData = join(menuDirectory, '71_maptile.tpfbdt');
const maskArchive = join(menuDirectory, '71_maptile.mtmskbnd.dcx');
const simplifiedChineseFont = join(unpackedDirectory, 'font', 'simplifiedchinese', 'font.gfx');
const ffdec = resolve(args.ffdec ?? process.env.MFG_FFDEC_JAR ?? 'runtime/work/ffdec/app/ffdec.jar');
const bxfOutput = join(workDirectory, 'maptile-bxf4');
const maskOutput = join(workDirectory, 'maptile-mask');
const ddsOutput = join(workDirectory, 'selected-dds');
const planPath = join(workDirectory, 'map-codec-plan.json');
const markerMaskOutputPath = join(workDirectory, 'marker-discovery-masks.json');
const codecManifest = resolve('tools/map-assets/Cargo.toml');
const seamMode = args['seam-mode'] ?? 'optimized';
if (!['native', 'optimized'].includes(seamMode)) {
  fail(`--seam-mode 只支持 native 或 optimized，实际为 ${seamMode}`);
}
const seamOptimization = seamMode === 'optimized' ? { radius: 3, strength: 0.65 } : undefined;
const mapBuildRevision = `map-tiles-v10-no-visual-fog-${seamMode}-${seamOptimization?.radius ?? 0}-${seamOptimization?.strength ?? 0}`;

const gameLocaleDefinitions = [
  ['en-US', 'engus'],
  ['zh-CN', 'zhocn'],
  ['zh-TW', 'zhotw'],
  ['fr-FR', 'frafr'],
  ['it-IT', 'itait'],
  ['de-DE', 'deude'],
  ['es-ES', 'spaes'],
  ['ja-JP', 'jpnjp'],
  ['ko-KR', 'korkr'],
  ['pl-PL', 'polpl'],
  ['pt-BR', 'porbr'],
  ['ru-RU', 'rusru'],
  ['es-419', 'spaar'],
  ['th-TH', 'thath'],
  ['ar-AE', 'araae'],
];

const discoveryPieces = [
  piece('west-limgrave', 'surface', 0, 0, 62010, 63010, [6100, 6101]),
  piece('weeping-peninsula', 'surface', 1, 1, 62011, 63011, [6102]),
  piece('east-limgrave', 'surface', 2, 2, 62012, 63012, [6100, 6101]),
  piece('east-liurnia', 'surface', 3, 3, 62020, 63020, [6200]),
  piece('north-liurnia', 'surface', 4, 4, 62021, 63021, [6200, 6201]),
  piece('west-liurnia', 'surface', 5, 5, 62022, 63022, [6200, 6202]),
  piece('altus', 'surface', 6, 6, 62030, 63030, [6300]),
  piece('leyndell', 'surface', 7, 7, 62031, 63031, [1100, 6302]),
  piece('gelmir', 'surface', 8, 8, 62032, 63032, [6301]),
  piece('caelid', 'surface', 9, 9, 62040, 63040, [6400, 6402]),
  piece('dragonbarrow', 'surface', 10, 10, 62041, 63041, [6401]),
  piece('mountaintops-west', 'surface', 11, 11, 62050, 63050, [6500]),
  piece('mountaintops-east', 'surface', 12, 12, 62051, 63051, [6500, 6501]),
  piece('snowfields', 'surface', 13, 13, 62052, 63052, [6502]),
  piece('surface-story-15', 'surface', 15, 15, 62004, 63004, []),
  piece('surface-story-16', 'surface', 16, 16, 62005, 0, []),
  piece('surface-story-17', 'surface', 17, 17, 62006, 0, []),
  piece('surface-story-18', 'surface', 18, 18, 62007, 0, []),
  piece('farum-azula', 'surface', 19, 19, 62008, 0, [1300]),
  piece('haligtree', 'surface', 20, 20, 62009, 0, [1500]),
  piece('ainsel', 'underground', 100, 0, 62060, 63060, [1201]),
  piece('lake-of-rot', 'underground', 101, 1, 62061, 63061, [1201]),
  piece('mohgwyn', 'underground', 102, 2, 62062, 63062, [1205]),
  piece('siofra', 'underground', 103, 3, 62063, 63063, [1202, 1207]),
  piece('deeproot', 'underground', 104, 4, 62064, 63064, [1203]),
  piece('gravesite-plain', 'shadow', 1000, 0, 62080, 63080, [6800, 6810]),
  piece('scadu-altus', 'shadow', 1001, 1, 62081, 63081, [6900, 6902]),
  piece('southern-shore', 'shadow', 1002, 2, 62082, 63082, [6820, 6830]),
  piece('rauh-ruins', 'shadow', 1003, 3, 62083, 63083, [6901]),
  piece('abyss', 'shadow', 1004, 4, 62084, 63084, [6860]),
];

// WorldMapPlaceNameParam 的正式行。坐标已经按 WorldMapLegacyConvParam 投影
// 到项目的 10496×10496 地图画布；这里只包含游戏会绘制在卷轴标志物上方的文字。
const regionLabelDefinitions = [
  label('limgrave', 'surface', 8000000, 0, 62010, [2580.742981, 6876.960991], 'Limgrave'),
  label('liurnia', 'surface', 8000400, 4, 62021, [3336.650002, 4639.519997], 'Liurnia of the Lakes'),
  label('altus', 'surface', 8000800, 8, 62032, [3014.400002, 1816.299988], 'Altus Plateau'),
  label('caelid', 'surface', 8000900, 9, 62040, [5503.990005, 7514.160004], 'Caelid'),
  label('mountaintops', 'surface', 8001200, 12, 62051, [6760.640015, 3392.75], 'Mountaintops of the Giants'),
  label('ainsel', 'underground', 8010000, 100, 62060, [1797.243019, 3702.097969], 'Ainsel River'),
  label('siofra', 'underground', 8010200, 102, 62062, [5394.97902, 5698.670028], 'Siofra River'),
  label('deeproot', 'underground', 8010400, 104, 62064, [4234.633095, 2266.820046], 'Deeproot Depths'),
  label('gravesite-plain', 'shadow', 8020000, 1000, 62080, [3865.409973, 6676.359985], 'Gravesite Plain'),
];

await assertFile(witchy);
await mkdir(workDirectory, { recursive: true });

if (args['messages-only'] === 'true') {
  const placeNames = await readLocalizedPlaceNames();
  await updateExistingMapLocalization(placeNames);
  console.log(`游戏文本已解包：${gameLocaleDefinitions.length} 种语言`);
  console.log(`目录：${join(workDirectory, 'game-messages')}`);
  process.exit(0);
}

await Promise.all([mapHeader, mapData, maskArchive].map(assertFile));

const bxfXml = await findGeneratedFile(bxfOutput, '_witchy-bxf4.xml')
  ?? await unpackAndFind(witchy, bxfOutput, mapHeader, '_witchy-bxf4.xml');
const maskBinderXml = await findGeneratedFile(maskOutput, '_witchy-bnd4.xml')
  ?? await unpackAndFind(witchy, maskOutput, maskArchive, '_witchy-bnd4.xml', true);
const tpfDirectory = dirname(bxfXml);
const maskDirectory = dirname(maskBinderXml);
const masks = await readMasks(maskDirectory);
const variants = await readTileVariants(tpfDirectory);
const selected = selectFullRevealTiles(variants, masks);

if (args['plan-only'] === 'true') {
  printSelection(selected);
  process.exit(0);
}

const hiddenSelected = selectHiddenTiles(variants);
const pieceSelections = new Map(discoveryPieces.map((definition) => {
  const mapId = mapIdForPlane(definition.plane);
  return [pieceMapId(mapId, definition), selectPieceTiles(variants, masks, mapId, definition.maskBit)];
}));
const allSelections = new Map([
  ...selected,
  ...[...hiddenSelected].map(([mapId, tiles]) => [hiddenMapId(mapId), tiles]),
  ...pieceSelections,
]);
const ddsTiles = await unpackSelectedTextures(witchy, ddsOutput, allSelections);
const markerProfiles = await readMarkerProfiles(outputDirectory);
const regionLabelFont = await buildRegionLabelFont();
const sourceRevision = sha256(Buffer.from(`${await hashFiles([mapHeader, mapData, maskArchive])}\0${mapBuildRevision}`));
const tilesRelativeDirectory = `tiles/elden-ring/${sourceRevision.slice(0, 16)}`;
const tilesOutputDirectory = join(outputDirectory, tilesRelativeDirectory);
const contentMask = { left: 0, top: 0, right: 9644, bottom: 9105, fade: 128 };
const codecPlan = {
  outputDirectory: tilesOutputDirectory,
  sourceTileSize: 256,
  tileSize: 1024,
  sourceZoom: 6,
  maxZoom: 4,
  xyzOrigin: [11, 11],
  gridSize: 41,
  markerProfiles,
  markerMaskOutput: markerMaskOutputPath,
  maps: [
    ...['M00', 'M01', 'M10'].map((id) => ({
      id,
      tiles: ddsTiles.get(id),
      ...(seamOptimization ? { seamOptimization } : {}),
      ...(id === 'M00' ? { contentMask } : {}),
    })),
    ...['M00', 'M01', 'M10'].map((id) => ({
      id: hiddenMapId(id),
      tiles: ddsTiles.get(hiddenMapId(id)),
      ...(seamOptimization ? { seamOptimization } : {}),
      ...(id === 'M00' ? { contentMask } : {}),
    })),
    ...discoveryPieces.map((definition) => {
      const mapId = mapIdForPlane(definition.plane);
      const id = pieceMapId(mapId, definition);
      const tiles = ddsTiles.get(id);
      const hiddenByCoordinate = new Map(
        ddsTiles.get(hiddenMapId(mapId)).map((tile) => [`${tile.col}:${tile.row}`, tile]),
      );
      return {
        id,
        tiles,
        differenceTiles: tiles.map((tile) => hiddenByCoordinate.get(`${tile.col}:${tile.row}`)
          ?? fail(`${id} 缺少隐藏底图 ${tile.col},${tile.row}`)),
        discoveryMaskBit: definition.maskBit,
        discoveryPlane: definition.plane,
        ...(mapId === 'M00' ? { contentMask } : {}),
      };
    }),
  ],
};
await writeFile(planPath, `${JSON.stringify(codecPlan, null, 2)}\n`);
run('cargo', [
  '--config', 'registries.crates-io.protocol="sparse"',
  'run', '--release', '--bin', 'mfg-map-codec', '--manifest-path', codecManifest, '--', planPath,
]);
const markerMasksByProfile = JSON.parse(await readFile(markerMaskOutputPath, 'utf8')).profiles;

const mapManifest = {
  schemaVersion: 1,
  game: 'elden-ring',
  sourceRevision,
  format: 'webp',
  tileSize: 1024,
  minZoom: 0,
  maxZoom: 4,
  processing: {
    seamMode,
    ...(seamOptimization ? {
      seamRadius: seamOptimization.radius,
      seamStrength: seamOptimization.strength,
    } : {}),
  },
  projection: {
    coordinateSystemId: 'elden-ring-world-map-v1',
    gameBounds: [0, 0, 10496, 10496],
    xyzOrigin: [11, 11],
    xyzSpan: 41,
  },
  maps: [
    mapDefinition('M00', 'surface', '交界地', 0),
    mapDefinition('M01', 'underground', '地下', 0),
    mapDefinition('M10', 'shadow', '幽影之地', 0),
  ],
  discovery: await buildMapDiscovery(masks, markerMasksByProfile, regionLabelFont),
};
const mapManifestBytes = Buffer.from(JSON.stringify(mapManifest));
const mapManifestHash = sha256(mapManifestBytes);
const mapManifestRelativePath = `maps/elden-ring/map-tiles.v1.${mapManifestHash.slice(0, 16)}.json`;
await mkdir(dirname(join(outputDirectory, mapManifestRelativePath)), { recursive: true });
await writeFile(join(outputDirectory, mapManifestRelativePath), mapManifestBytes);
await updateDatasetManifest(outputDirectory, {
  path: mapManifestRelativePath.replaceAll('\\', '/'),
  sha256: mapManifestHash,
  bytes: mapManifestBytes.byteLength,
  schemaVersion: 1,
});

console.log(`地图资源已生成：${mapManifest.maps.length} 个图层`);
console.log(`清单：${join(outputDirectory, mapManifestRelativePath)}`);

function mapDefinition(id, plane, name, order) {
  return {
    id,
    plane,
    name,
    order,
    tileTemplate: `${tilesRelativeDirectory}/${id}/{z}/{x}/{y}.webp`,
  };
}

async function updateExistingMapLocalization(placeNames) {
  const rootManifestPath = join(outputDirectory, 'dataset-manifest.v1.json');
  if (!(await exists(rootManifestPath))) return;
  const rootManifest = JSON.parse(await readFile(rootManifestPath, 'utf8'));
  const relativePath = rootManifest.resources?.mapTiles?.path;
  if (typeof relativePath !== 'string') return;
  const mapManifest = JSON.parse(await readFile(join(outputDirectory, relativePath), 'utf8'));
  if (!mapManifest.discovery?.regionLabels) return;
  const definitionById = new Map(regionLabelDefinitions.map((definition) => [definition.id, definition]));
  mapManifest.discovery.regionLabels = mapManifest.discovery.regionLabels.map((labelDefinition) => {
    const definition = definitionById.get(labelDefinition.id);
    if (!definition) return labelDefinition;
    return {
      ...labelDefinition,
      labels: Object.fromEntries(gameLocaleDefinitions.map(([locale]) => [
        locale,
        placeNames.get(locale)?.get(definition.placeNameId) ?? definition.fallback,
      ])),
    };
  });
  const bytes = Buffer.from(JSON.stringify(mapManifest));
  const hash = sha256(bytes);
  const nextRelativePath = `maps/elden-ring/map-tiles.v1.${hash.slice(0, 16)}.json`;
  await writeFile(join(outputDirectory, nextRelativePath), bytes);
  await updateDatasetManifest(outputDirectory, {
    path: nextRelativePath.replaceAll('\\', '/'),
    sha256: hash,
    bytes: bytes.byteLength,
    schemaVersion: 1,
  });
  console.log(`地图地区文字已更新：${gameLocaleDefinitions.length} 种语言`);
}

function mapIdForPlane(plane) {
  if (plane === 'surface') return 'M00';
  if (plane === 'underground') return 'M01';
  if (plane === 'shadow') return 'M10';
  fail(`未知地图平面：${plane}`);
}

function hiddenMapId(mapId) {
  return `${mapId}-hidden`;
}

function pieceMapId(mapId, definition) {
  return `${mapId}-piece-${definition.worldMapPieceId}`;
}

async function buildMapDiscovery(masks, markerMasksByProfile, regionLabelFont) {
  const placeNames = await readLocalizedPlaceNames();
  return {
    hiddenTileTemplates: Object.fromEntries(['M00', 'M01', 'M10'].map((mapId) => [
      mapId,
      `${tilesRelativeDirectory}/${hiddenMapId(mapId)}/{z}/{x}/{y}.webp`,
    ])),
    pieces: discoveryPieces.map((definition) => ({
      ...definition,
      tileTemplate: `${tilesRelativeDirectory}/${pieceMapId(mapIdForPlane(definition.plane), definition)}/{z}/{x}/{y}.webp`,
    })),
    tiles: Object.fromEntries(['M00', 'M01', 'M10'].map((mapId) => [
      mapId,
      [...(masks.get(mapId) ?? [])]
        .filter(([id, mask]) => id < 10000 && mask > 0)
        .sort(([left], [right]) => left - right),
    ])),
    markerMasksByProfile,
    ...(regionLabelFont ? { regionLabelFont } : {}),
    regionLabels: regionLabelDefinitions.map((definition) => ({
      id: definition.id,
      plane: definition.plane,
      placeNameId: definition.placeNameId,
      worldMapPieceId: definition.worldMapPieceId,
      position: definition.position,
      openEventFlagId: definition.openEventFlagId,
      labels: Object.fromEntries(gameLocaleDefinitions.map(([locale]) => [
        locale,
        placeNames.get(locale)?.get(definition.placeNameId) ?? definition.fallback,
      ])),
    })),
  };
}

async function buildRegionLabelFont() {
  if (!(await exists(simplifiedChineseFont))) {
    console.warn(`未找到简体中文字体资源，地区文字将使用系统书宋回退：${simplifiedChineseFont}`);
    return undefined;
  }
  if (!(await exists(ffdec))) {
    console.warn(`未找到 FFDec，地区文字将使用系统书宋回退；可通过 --ffdec 指定 ffdec.jar：${ffdec}`);
    return undefined;
  }
  const target = join(workDirectory, 'region-label-font');
  await mkdir(target, { recursive: true });
  let fontPath = (await findGeneratedFiles(target, /GR-FZShuSong-Z01\.woff$/i))[0];
  if (!fontPath) {
    const ffdecProfile = join(workDirectory, 'ffdec-profile');
    await mkdir(ffdecProfile, { recursive: true });
    run('java', [
      '-jar', ffdec, '-cli', '-onerror', 'abort', '-format', 'font:woff',
      '-export', 'font', target, simplifiedChineseFont,
    ], { env: { ...process.env, APPDATA: ffdecProfile } });
    fontPath = (await findGeneratedFiles(target, /GR-FZShuSong-Z01\.woff$/i))[0]
      ?? fail('FFDec 未导出 GR-FZShuSong-Z01.woff');
  }
  const bytes = await readFile(fontPath);
  const hash = sha256(bytes);
  const relativePath = `fonts/elden-ring/map-region-gr-fzshusong-z01.${hash.slice(0, 16)}.woff`;
  const outputPath = join(outputDirectory, relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(fontPath, outputPath);
  console.log(`地区文字字体：${outputPath}`);
  return {
    family: 'GR-FZShuSong-Z01',
    path: relativePath.replaceAll('\\', '/'),
  };
}

async function readMarkerProfiles(directory) {
  const result = [];
  const datasetsDirectory = join(directory, 'datasets');
  if (!(await exists(datasetsDirectory))) fail('请先运行数据构建器生成数据集标记清单');
  for (const entry of await readdir(datasetsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(datasetsDirectory, entry.name, 'dataset-manifest.v1.json');
    if (!(await exists(manifestPath))) continue;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const markerRelativePath = manifest.resources?.markerCatalog?.path;
    if (manifest.schemaVersion !== 1 || typeof markerRelativePath !== 'string') continue;
    const catalog = JSON.parse(await readFile(join(directory, markerRelativePath), 'utf8'));
    if (!Array.isArray(catalog.markers) || catalog.markers.length !== catalog.markerCount) {
      fail(`${manifest.profile ?? entry.name} 的标记目录不完整`);
    }
    result.push({
      profile: manifest.profile,
      markerCount: catalog.markerCount,
      markers: catalog.markers.flatMap((marker, index) => marker.mapPosition ? [{
        index,
        plane: marker.plane,
        x: marker.mapPosition.coordinate[0],
        y: marker.mapPosition.coordinate[1],
      }] : []),
    });
  }
  if (result.length === 0) fail('没有找到可用于精确地图碎片归属的数据集');
  console.log(`标记地图碎片归属：读取 ${result.map(({ profile, markers }) => `${profile} ${markers.length}`).join('、')}`);
  return result;
}

async function readLocalizedPlaceNames() {
  const result = new Map();
  for (const [locale, gameDirectory] of gameLocaleDefinitions) {
    const values = new Map();
    for (const archive of [
      'menu.msgbnd.dcx', 'menu_dlc01.msgbnd.dcx', 'menu_dlc02.msgbnd.dcx',
      'item.msgbnd.dcx', 'item_dlc01.msgbnd.dcx', 'item_dlc02.msgbnd.dcx',
    ]) {
      const input = join(unpackedDirectory, 'msg', gameDirectory, archive);
      if (!(await exists(input))) continue;
      const target = join(workDirectory, 'game-messages', locale, archive.replaceAll('.', '-'));
      const binderXml = await findGeneratedFile(target, '_witchy-bnd4.xml')
        ?? await unpackAndFind(witchy, target, input, '_witchy-bnd4.xml', true);
      const fmgFiles = await findGeneratedFiles(dirname(binderXml), /^PlaceName(?:_dlc\d+)?\.fmg\.xml$/i);
      for (const file of fmgFiles) {
        const source = await readFile(file, 'utf8');
        for (const match of source.matchAll(/<text id="(\d+)">([\s\S]*?)<\/text>/g)) {
          const value = decodeXml(match[2]).trim();
          if (value && value !== '%null%') values.set(Number(match[1]), value);
        }
      }
    }
    result.set(locale, values);
  }
  return result;
}

async function findGeneratedFiles(directory, pattern) {
  const files = [];
  if (!(await exists(directory))) return files;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findGeneratedFiles(path, pattern));
    else if (pattern.test(entry.name)) files.push(path);
  }
  return files;
}

function decodeXml(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function piece(id, plane, worldMapPieceId, bit, openEventFlagId, acquisitionEventFlagId, visitPrefixes) {
  return {
    id,
    plane,
    worldMapPieceId,
    maskBit: 2 ** bit,
    openEventFlagId,
    acquisitionEventFlagId,
    visitPrefixes,
  };
}

function label(id, plane, placeNameId, worldMapPieceId, openEventFlagId, position, fallback) {
  return { id, plane, placeNameId, worldMapPieceId, openEventFlagId, position, fallback };
}

async function unpackAndFind(executable, target, input, expectedName, recursive = false) {
  await mkdir(target, { recursive: true });
  const commandArgs = ['-p', '-u', ...(recursive ? ['-c'] : []), '-l', target, input];
  run(executable, commandArgs);
  return await findGeneratedFile(target, expectedName)
    ?? fail(`WitchyBND 未生成 ${expectedName}`);
}

async function readMasks(directory) {
  const result = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^MENU_MapTile_M\d{2}\.mtmsk$/i.test(entry.name)) continue;
    const mapId = entry.name.match(/(M\d{2})/i)[1].toUpperCase();
    const source = await readFile(join(directory, entry.name), 'utf8');
    const values = new Map();
    for (const match of source.matchAll(/<MapTileMask exists="(\d)" id="(\d+)" mask="(\d+)"\/>/g)) {
      if (match[1] === '1') values.set(Number(match[2]), Number(match[3]));
    }
    result.set(mapId, values);
  }
  if (result.size !== 4) fail(`地图遮罩不完整：预期 4 组，实际 ${result.size}`);
  return result;
}

async function readTileVariants(directory) {
  const tilePattern = /^MENU_MapTile_(M\d{2})_L(\d)_(\d+)_(\d+)_([0-9A-Fa-f]{8})\.tpf\.dcx$/;
  const variants = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(tilePattern);
    if (!match || Number(match[2]) !== 0) continue;
    const [, map, , colText, rowText, variant] = match;
    const col = Number(colText);
    const row = Number(rowText);
    const key = `${map}:${col}:${row}`;
    const values = variants.get(key) ?? [];
    values.push({ map, col, row, variant: variant.toUpperCase(), tpf: join(directory, entry.name) });
    variants.set(key, values);
  }
  return variants;
}

function selectFullRevealTiles(variants, masks) {
  const selected = new Map([['M00', []], ['M01', []], ['M10', []], ['M11', []]]);
  for (const values of variants.values()) {
    const { map, col, row } = values[0];
    const mask = masks.get(map)?.get(col * 100 + row) ?? 0;
    const target = mask.toString(16).toUpperCase().padStart(8, '0');
    const tile = values.find((candidate) => candidate.variant === target)
      ?? values.find((candidate) => candidate.variant === '00000000');
    if (!tile) fail(`${map} L0 ${col},${row} 缺少完整显示纹理 ${target}`);
    selected.get(map).push(tile);
  }
  for (const tiles of selected.values()) tiles.sort((left, right) => left.col - right.col || left.row - right.row);
  const expected = new Map([['M00', 1681], ['M01', 1681], ['M10', 1681], ['M11', 160]]);
  for (const [map, count] of expected) {
    if (selected.get(map).length !== count) fail(`${map} L0 数量异常：预期 ${count}，实际 ${selected.get(map).length}`);
  }
  return selected;
}

function selectHiddenTiles(variants) {
  const selected = new Map([['M00', []], ['M01', []], ['M10', []], ['M11', []]]);
  for (const values of variants.values()) {
    const tile = values.find((candidate) => candidate.variant === '00000000');
    if (!tile) fail(`${values[0].map} L0 ${values[0].col},${values[0].row} 缺少隐藏纹理 00000000`);
    selected.get(tile.map).push(tile);
  }
  for (const tiles of selected.values()) tiles.sort((left, right) => left.col - right.col || left.row - right.row);
  return selected;
}

function selectPieceTiles(variants, masks, mapId, maskBit) {
  const selected = [];
  for (const values of variants.values()) {
    const { map, col, row } = values[0];
    if (map !== mapId) continue;
    const mask = masks.get(map)?.get(col * 100 + row) ?? 0;
    if ((mask & maskBit) === 0) continue;
    const target = (mask & maskBit).toString(16).toUpperCase().padStart(8, '0');
    const tile = values.find((candidate) => candidate.variant === target);
    if (!tile) fail(`${map} L0 ${col},${row} 缺少地图碎片纹理 ${target}`);
    selected.push(tile);
  }
  selected.sort((left, right) => left.col - right.col || left.row - right.row);
  return selected;
}

async function unpackSelectedTextures(executable, target, selected) {
  await mkdir(target, { recursive: true });
  const output = new Map();
  const missing = new Map();
  for (const [map, tiles] of selected) {
    const mapped = [];
    for (const tile of tiles) {
      const stem = basename(tile.tpf, '.tpf.dcx');
      const dds = join(target, `${stem}-tpf-dcx`, `${stem}.dds`);
      mapped.push({ col: tile.col, row: tile.row, dds });
      if (!(await exists(dds))) missing.set(tile.tpf, tile.tpf);
    }
    output.set(map, mapped);
  }
  const missingPaths = [...missing.values()];
  // Windows CreateProcess 的命令行上限约 32 KiB；完整 TPF 路径较长，
  // 24 个一批可避免 WitchyBND 在没有诊断信息的情况下返回 -1。
  for (let index = 0; index < missingPaths.length; index += 24) {
    const batch = missingPaths.slice(index, index + 24);
    console.log(`WitchyBND：解包 DDS ${Math.min(index + batch.length, missingPaths.length)}/${missingPaths.length}`);
    run(executable, ['-s', '-u', '-l', target, ...batch]);
  }
  for (const tiles of output.values()) {
    for (const tile of tiles) await assertFile(tile.dds);
  }
  return output;
}

async function updateDatasetManifest(directory, resource) {
  const rootPath = join(directory, 'dataset-manifest.v1.json');
  const paths = [rootPath];
  const datasetsDirectory = join(directory, 'datasets');
  if (await exists(datasetsDirectory)) {
    for (const entry of await readdir(datasetsDirectory, { withFileTypes: true })) {
      if (entry.isDirectory()) paths.push(join(datasetsDirectory, entry.name, 'dataset-manifest.v1.json'));
    }
  }
  let updated = 0;
  for (const path of paths) {
    if (!(await exists(path))) continue;
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    if (manifest.schemaVersion !== 1 || !manifest.resources) continue;
    manifest.resources.mapTiles = resource;
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
    updated += 1;
  }
  if (updated === 0) fail('请先运行数据构建器生成至少一个数据清单');
}

async function findGeneratedFile(directory, name) {
  if (!(await exists(directory))) return undefined;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name === name) return path;
    if (entry.isDirectory()) {
      const found = await findGeneratedFile(path, name);
      if (found) return found;
    }
  }
  return undefined;
}

async function hashFiles(paths) {
  const hash = createHash('sha256');
  for (const path of paths) {
    await new Promise((resolvePromise, reject) => {
      const stream = createReadStream(path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', resolvePromise);
      stream.on('error', reject);
    });
  }
  return hash.digest('hex');
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} 执行失败，退出码 ${result.status}`);
}

function printSelection(selected) {
  for (const [map, tiles] of selected) {
    const variants = new Set(tiles.map((tile) => tile.variant));
    console.log(`${map}：${tiles.length} 个 L0 纹理，${variants.size} 种完整显示 mask`);
  }
}

function readArguments(values) {
  const parsed = {};
  const normalized = values[0] === '--' ? values.slice(1) : values;
  for (let index = 0; index < normalized.length;) {
    const key = normalized[index];
    if (!key?.startsWith('--')) throw new Error(`无效参数：${key ?? ''}`);
    const next = normalized[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key.slice(2)] = 'true';
      index += 1;
    } else {
      parsed[key.slice(2)] = next;
      index += 2;
    }
  }
  return parsed;
}

async function assertFile(path) {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) fail(`文件不存在：${path}`);
}

async function exists(path) {
  return access(path).then(() => true, () => false);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(message);
}

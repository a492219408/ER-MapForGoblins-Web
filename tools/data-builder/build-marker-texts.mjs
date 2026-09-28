import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { decodeMarkerTextId, usableFmgText } from './marker-text-codec.mjs';

const args = readArguments(process.argv.slice(2));
const messageRoot = resolve(args.messages ?? 'runtime/work/map-assets/game-messages');
const outputRoot = resolve(args.output ?? 'runtime/assets');
const datasetIndex = JSON.parse(await readFile(join(outputRoot, 'dataset-index.v1.json'), 'utf8'));
const encodedIds = await collectMarkerTextIds(outputRoot, datasetIndex);
const locales = (await readdir(messageRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (locales.length === 0) throw new Error(`没有找到 FMG 语言目录：${messageRoot}`);

const decoded = [...encodedIds]
  .map(decodeMarkerTextId)
  .filter(Boolean)
  .sort((left, right) => left.encodedId - right.encodedId);
const tablesNeeded = new Set(decoded.map((entry) => entry.table));
const entries = new Map(decoded.map((entry) => [entry.encodedId, { ...entry, labels: {} }]));

for (const locale of locales) {
  const tables = await readLocaleTables(join(messageRoot, locale), tablesNeeded);
  for (const entry of entries.values()) {
    const text = usableFmgText(tables.get(entry.table)?.get(entry.sourceId));
    if (text) entry.labels[locale] = text;
  }
}

const resolvedEntries = Object.fromEntries([...entries]
  .filter(([, entry]) => Object.keys(entry.labels).length > 0)
  .map(([encodedId, entry]) => [String(encodedId), entry]));
const catalog = {
  schemaVersion: 1,
  game: 'elden-ring',
  encoding: 'map-for-goblins-fmg-offset-v1',
  locales,
  requestedTextIdCount: encodedIds.size,
  resolvedTextIdCount: Object.keys(resolvedEntries).length,
  entries: resolvedEntries,
};
const bytes = Buffer.from(JSON.stringify(catalog));
const hash = sha256(bytes);
const relativePath = `marker-text/marker-text-catalog.v1.${hash.slice(0, 16)}.json`;
const outputPath = join(outputRoot, relativePath);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, bytes);

const resource = {
  path: relativePath.replaceAll('\\', '/'),
  sha256: hash,
  bytes: bytes.byteLength,
  schemaVersion: 1,
};
for (const profile of datasetIndex.profiles) {
  await patchManifest(join(outputRoot, profile.manifestPath), resource);
}
await patchManifest(join(outputRoot, 'dataset-manifest.v1.json'), resource);

console.log(`已从 ${locales.length} 种语言解析 ${Object.keys(resolvedEntries).length}/${encodedIds.size} 个标记文本 ID`);
console.log(`标记文本目录：${outputPath}`);

async function collectMarkerTextIds(root, index) {
  const result = new Set();
  for (const profile of index.profiles) {
    const manifestPath = join(root, profile.manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const catalogPath = join(root, manifest.resources.markerCatalog.path);
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    for (const marker of catalog.markers) {
      for (const textId of marker.textIds ?? []) {
        if (Number.isInteger(textId) && textId > 0) result.add(textId);
      }
    }
  }
  return result;
}

async function readLocaleTables(localeRoot, tableNames) {
  const files = await walk(localeRoot);
  const result = new Map([...tableNames].map((table) => [table, new Map()]));
  for (const table of tableNames) {
    const candidates = files
      .filter((path) => path.toLowerCase().endsWith(`${table.toLowerCase()}.fmg.xml`))
      .sort((left, right) => filePriority(left) - filePriority(right) || left.localeCompare(right));
    for (const path of candidates) {
      const source = await readFile(path, 'utf8');
      for (const match of source.matchAll(/<text id="(-?\d+)">([\s\S]*?)<\/text>/g)) {
        const text = usableFmgText(decodeXml(match[2]));
        if (text) result.get(table).set(Number(match[1]), text);
      }
    }
  }
  return result;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name));
}

function filePriority(path) {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  if (normalized.includes('dlc02')) return 2;
  if (normalized.includes('dlc01')) return 1;
  return 0;
}

function decodeXml(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

async function patchManifest(path, resource) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.resources.markerText = resource;
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
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

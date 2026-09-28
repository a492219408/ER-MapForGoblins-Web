import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { classifyGameSourceFile, releaseMetadata, sourceFingerprint } from './source-manifest.mjs';

const args = readArguments(process.argv.slice(2));
const gameRoot = resolve(args.game ?? fail('请通过 --game 指定游戏安装或备份目录'));
const output = resolve(args.output ?? 'runtime/work/game-source-manifest.v1.json');
const fullMode = args.mode === 'full';
if (args.mode && !['quick', 'full'].includes(args.mode)) fail('--mode 只支持 quick 或 full');

const candidates = [];
await walk(gameRoot, async (path) => {
  const relativePath = relative(gameRoot, path).replaceAll('\\', '/');
  const hashMode = classifyGameSourceFile(relativePath, fullMode);
  if (hashMode) candidates.push({ path, relativePath, hashMode });
});
if (candidates.length === 0) fail('指定目录中没有找到 regulation.bin、eldenring.exe 或 Data/DLC 归档');

const files = [];
for (const candidate of candidates.sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
  const fileStat = await stat(candidate.path);
  files.push({
    path: candidate.relativePath,
    bytes: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
    hashMode: candidate.hashMode,
    ...(candidate.hashMode === 'content' ? { sha256: await sha256File(candidate.path) } : {}),
  });
}

const tools = [];
for (const [name, path] of [['nuxe', args.nuxe], ['witchyBnd', args.witchy]]) {
  if (!path) continue;
  const resolvedPath = resolve(path);
  const fileStat = await stat(resolvedPath);
  if (!fileStat.isFile()) fail(`${name} 必须指向可执行文件，而不是目录`);
  tools.push({ name, fileName: basename(resolvedPath), bytes: fileStat.size, sha256: await sha256File(resolvedPath) });
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: fullMode ? 'full' : 'quick',
  sourceRootName: basename(gameRoot),
  sourceFingerprint: sourceFingerprint(files),
  release: releaseMetadata({
    applicationVersion: args['application-version'],
    calibrationsVersion: args['calibrations-version'],
    executableFileVersion: args['executable-file-version'],
    regulationInternalVersion: args['regulation-internal-version'],
  }, files),
  files,
  tools,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`已记录 ${files.length} 个游戏源文件，指纹 ${manifest.sourceFingerprint}`);
console.log(`源清单：${output}`);

async function walk(directory, visit) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path, visit);
    else if (entry.isFile()) await visit(path);
  }
}

function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function readArguments(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === '--') continue;
    if (!key.startsWith('--')) fail(`无法识别参数：${key}`);
    const value = values[index + 1];
    if (!value || value.startsWith('--')) fail(`参数 ${key} 缺少值`);
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

function fail(message) {
  throw new Error(message);
}

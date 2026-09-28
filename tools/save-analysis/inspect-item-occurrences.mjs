import { readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const fixtureDirectory = resolve(process.argv[2] ?? 'saves/角色数据解析');
const baselineName = process.argv[3];
const candidateName = process.argv[4];
const itemId = Number.parseInt(process.argv[5] ?? '', 10);

if (!baselineName || !candidateName || !Number.isInteger(itemId) || itemId < 0) {
  throw new Error('用法：node inspect-item-occurrences.mjs <目录> <基准文件> <变化文件> <物品ID>');
}

const availableNames = (await readdir(fixtureDirectory)).filter((name) => /\.(?:sl2|co2|err)$/i.test(name));
const baselineFixtureName = resolveFixtureName(baselineName, availableNames);
const candidateFixtureName = resolveFixtureName(candidateName, availableNames);
const baseline = await readFile(resolve(fixtureDirectory, baselineFixtureName));
const candidate = await readFile(resolve(fixtureDirectory, candidateFixtureName));
const encodedHandle = (0xb000_0000 | itemId) >>> 0;

for (const [label, value] of [['物品 ID', itemId], ['道具句柄', encodedHandle]]) {
  const needle = Buffer.alloc(4);
  needle.writeUInt32LE(value);
  const baselineOffsets = findAll(baseline, needle);
  const candidateOffsets = findAll(candidate, needle);
  console.log(`\n${label} ${value}：基准 ${baselineOffsets.length} 处，变化 ${candidateOffsets.length} 处`);
  for (const offset of [...new Set([...baselineOffsets, ...candidateOffsets])]) {
    console.log(JSON.stringify({
      offset,
      baseline: context(baseline, offset),
      candidate: context(candidate, offset),
    }));
  }
}

function findAll(bytes, needle) {
  const offsets = [];
  let offset = 0;
  while (offset <= bytes.length - needle.length) {
    const found = bytes.indexOf(needle, offset);
    if (found < 0) break;
    offsets.push(found);
    offset = found + 1;
  }
  return offsets;
}

function resolveFixtureName(requestedName, availableNames) {
  const exact = availableNames.find((name) => name === requestedName);
  if (exact) return exact;
  const withoutExtension = availableNames.find((name) => name.slice(0, -extname(name).length) === requestedName);
  if (withoutExtension) return withoutExtension;
  throw new Error(`目录 ${fixtureDirectory} 中没有存档 ${requestedName}`);
}

function context(bytes, offset) {
  const start = Math.max(0, offset - 16);
  const end = Math.min(bytes.length, offset + 20);
  return `${start.toString(16).padStart(8, '0')}: ${bytes.subarray(start, end).toString('hex').match(/../g).join(' ')}`;
}

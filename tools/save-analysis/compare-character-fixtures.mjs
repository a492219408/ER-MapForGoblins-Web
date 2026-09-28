import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const SLOT_SIZE = 2_621_456;
const SLOT_START = 768;
const fixtureDirectory = resolve(process.argv[2] ?? 'saves/角色数据解析');
const slotIndex = Number.parseInt(process.argv[3] ?? '0', 10);
const requestedBaselineName = process.argv[4];
const requestedCandidateNames = process.argv.slice(5);

if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 10) {
  throw new Error(`槽位索引必须在 0..9 之间，实际为 ${process.argv[3]}`);
}

const names = (await readdir(fixtureDirectory))
  .filter((name) => /\.(?:sl2|co2|err)$/i.test(name))
  .sort((left, right) => left.localeCompare(right, 'zh-CN'));
const baselineName = requestedBaselineName
  ? resolveFixtureName(requestedBaselineName, names)
  : names.find((name) => name.slice(0, -extname(name).length).includes('基准'));
if (!baselineName) throw new Error(`目录 ${fixtureDirectory} 中没有名称包含“基准”的存档`);
const candidateNames = requestedCandidateNames.length > 0
  ? requestedCandidateNames.map((name) => resolveFixtureName(name, names))
  : names.filter((name) => name !== baselineName);

const baseline = await readFile(resolve(fixtureDirectory, baselineName));
const baselineLayout = locateSections(baseline, slotIndex);
console.log(JSON.stringify({ fixtureDirectory, slotIndex, baselineName, characterStart: baselineLayout.characterStart }, null, 2));

for (const name of candidateNames) {
  const candidate = await readFile(resolve(fixtureDirectory, name));
  const candidateLayout = locateSections(candidate, slotIndex);
  console.log(`\n${name} characterStart=${candidateLayout.characterStart} shift=${candidateLayout.characterStart - baselineLayout.characterStart}`);
  for (const section of baselineLayout.sections) {
    const other = candidateLayout.sections.find(({ name: otherName }) => otherName === section.name);
    if (!other || section.length !== other.length) {
      console.log(`${section.name}: 动态长度 ${section.length} -> ${other?.length ?? '缺失'}`);
      continue;
    }
    const runs = diffRuns(
      baseline.subarray(section.start, section.start + section.length),
      candidate.subarray(other.start, other.start + other.length),
    );
    if (runs.length === 0) continue;
    const changedBytes = runs.reduce((sum, run) => sum + run.length, 0);
    console.log(`${section.name}: changedBytes=${changedBytes} runs=${runs.length}`);
    for (const run of runs.slice(0, 24)) {
      console.log(JSON.stringify({
        offset: run.start,
        length: run.length,
        baseline: hex(baseline.subarray(section.start + run.start, section.start + Math.min(run.end, run.start + 24))),
        candidate: hex(candidate.subarray(other.start + run.start, other.start + Math.min(run.end, run.start + 24))),
      }));
    }
    if (runs.length > 24) console.log(`... ${runs.length - 24} 个差异区段未显示`);
  }
}

function resolveFixtureName(requestedName, availableNames) {
  const exact = availableNames.find((name) => name === requestedName);
  if (exact) return exact;
  const withoutExtension = availableNames.find(
    (name) => name.slice(0, -extname(name).length) === requestedName,
  );
  if (withoutExtension) return withoutExtension;
  throw new Error(`目录 ${fixtureDirectory} 中没有存档 ${requestedName}`);
}

function locateSections(bytes, index) {
  const slotStart = SLOT_START + index * SLOT_SIZE;
  const version = bytes.readUInt32LE(slotStart + 16);
  const gaItemCount = version <= 81 ? 5_118 : 5_120;
  let offset = slotStart + 48;
  const gaItemStart = offset;
  for (let itemIndex = 0; itemIndex < gaItemCount; itemIndex += 1) {
    const handle = bytes.readUInt32LE(offset);
    offset += 8;
    if (handle === 0) continue;
    const type = (handle & 0xf0000000) >>> 0;
    if (type !== 0xc0000000) offset += 8;
    if (type === 0x80000000) offset += 5;
  }
  const characterStart = offset;
  const sections = [{ name: 'gaItems', start: gaItemStart, length: characterStart - gaItemStart }];
  const add = (name, length) => {
    sections.push({ name, start: offset, length });
    offset += length;
  };
  add('playerGameData', 0x1b0);
  add('specialEffects', 0xd0);
  add('equipmentIndices', 0x58);
  add('activeWeaponSlots', 0x1c);
  add('equipmentItemIds', 0x58);
  add('equipmentHandles', 0x58);
  add('heldInventory', 36_880);
  add('spells', 116);
  add('quickAndPouch', 140);
  add('gestures', 24);
  const projectileCount = bytes.readUInt32LE(offset);
  add('projectiles', 4 + projectileCount * 8);
  add('equippedArmamentsAndItems', 156);
  add('physick', 12);
  add('face', 303);
  add('storage', 24_592);
  add('gestureTable', 0x100);
  const regionCount = bytes.readUInt32LE(offset);
  add('regions', 4 + regionCount * 4);
  add('torrentAndControl', 0x29);
  add('bloodstain', 0x44);
  add('postBloodstain', 8);
  const menuProfileSize = bytes.readUInt32LE(offset + 4);
  add('menuProfile', 8 + menuProfileSize);
  add('trophy', 0x34);
  add('gaItemGameData', 8 + 7_000 * 16);
  const tutorialSize = bytes.readUInt32LE(offset + 4);
  const tutorialCount = bytes.readUInt32LE(offset + 8);
  add('tutorial', 12 + (tutorialCount === 0 ? 0 : tutorialSize - 4));
  add('countersBeforeEventFlags', 29);
  return { characterStart, sections };
}

function diffRuns(left, right) {
  const result = [];
  let runStart = -1;
  for (let offset = 0; offset < left.length; offset += 1) {
    const changed = left[offset] !== right[offset];
    if (changed && runStart < 0) runStart = offset;
    if (!changed && runStart >= 0) {
      result.push({ start: runStart, end: offset, length: offset - runStart });
      runStart = -1;
    }
  }
  if (runStart >= 0) result.push({ start: runStart, end: left.length, length: left.length - runStart });
  return result;
}

function hex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join(' ');
}

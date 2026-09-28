import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compareSourceManifests } from './source-manifest.mjs';

const args = readArguments(process.argv.slice(2));
const previousPath = resolve(args.previous ?? fail('请通过 --previous 指定旧版源清单'));
const currentPath = resolve(args.current ?? fail('请通过 --current 指定新版源清单'));
const previous = JSON.parse(await readFile(previousPath, 'utf8'));
const current = JSON.parse(await readFile(currentPath, 'utf8'));
const comparison = compareSourceManifests(previous, current);
const payload = `${JSON.stringify(comparison, null, 2)}\n`;
if (args.output) await writeFile(resolve(args.output), payload);
else process.stdout.write(payload);

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

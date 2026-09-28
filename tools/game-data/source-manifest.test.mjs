import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyGameSourceFile,
  compareSourceManifests,
  releaseMetadata,
  sourceFingerprint,
} from './source-manifest.mjs';

test('快速模式哈希索引与 regulation，仅记录大型 BDT 元数据', () => {
  assert.equal(classifyGameSourceFile('Game/regulation.bin'), 'content');
  assert.equal(classifyGameSourceFile('Game/Data0.bhd'), 'content');
  assert.equal(classifyGameSourceFile('Game/Data0.bdt'), 'metadata');
  assert.equal(classifyGameSourceFile('Game/Data0.bdt', true), 'content');
  assert.equal(classifyGameSourceFile('Game/movie/intro.usm'), undefined);
});

test('源指纹与输入顺序及时间戳无关', () => {
  const first = sourceFingerprint([
    { path: 'Data0.bdt', bytes: 2, sha256: undefined, modifiedAt: 'a' },
    { path: 'Data0.bhd', bytes: 1, sha256: 'abc', modifiedAt: 'b' },
  ]);
  const second = sourceFingerprint([
    { path: 'Data0.bhd', bytes: 1, sha256: 'abc', modifiedAt: 'x' },
    { path: 'Data0.bdt', bytes: 2, sha256: undefined, modifiedAt: 'y' },
  ]);
  assert.equal(first, second);
});

test('版本元数据记录可读版本并从归档判断黄金树幽影资源', () => {
  assert.deepEqual(releaseMetadata({
    applicationVersion: '1.17',
    calibrationsVersion: '1.17',
    executableFileVersion: '2.7.0.0',
    regulationInternalVersion: '11701000',
  }, [{ path: 'Game/DLC.bhd' }]), {
    applicationVersion: '1.17',
    calibrationsVersion: '1.17',
    executableFileVersion: '2.7.0.0',
    regulationInternalVersion: 11701000,
    shadowOfTheErdtreeArchivePresent: true,
  });
  assert.throws(() => releaseMetadata({ applicationVersion: 'v1.17' }, []), /应用版本格式无效/);
});

test('源清单差异同时识别内容哈希与仅元数据的大型归档', () => {
  const result = compareSourceManifests({
    sourceFingerprint: 'old',
    files: [
      { path: 'Data0.bhd', bytes: 10, sha256: 'aaa' },
      { path: 'Data0.bdt', bytes: 20 },
    ],
  }, {
    sourceFingerprint: 'new',
    files: [
      { path: 'Data0.bhd', bytes: 10, sha256: 'bbb' },
      { path: 'Data0.bdt', bytes: 21 },
    ],
  });
  assert.equal(result.changedFileCount, 2);
  assert.deepEqual(result.files.map(({ path, status }) => ({ path, status })), [
    { path: 'Data0.bdt', status: 'changed' },
    { path: 'Data0.bhd', status: 'changed' },
  ]);
});

import { createHash } from 'node:crypto';

const CONTENT_HASH_NAMES = new Set([
  'eldenring.exe',
  'regulation.bin',
]);

export function classifyGameSourceFile(relativePath, fullMode = false) {
  const fileName = relativePath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() ?? '';
  if (CONTENT_HASH_NAMES.has(fileName)) return 'content';
  if (/^(?:data\d*|dlc\d*)\.bhd$/.test(fileName)) return 'content';
  if (/^(?:data\d*|dlc\d*)\.bdt$/.test(fileName)) return fullMode ? 'content' : 'metadata';
  return undefined;
}

export function sourceFingerprint(files) {
  const canonical = files
    .map(({ path, bytes, sha256 }) => `${path}\0${bytes}\0${sha256 ?? 'metadata-only'}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

export function releaseMetadata(values, files) {
  const applicationVersion = optionalVersion(values.applicationVersion, '应用版本');
  const calibrationsVersion = optionalVersion(values.calibrationsVersion, '校准版本');
  const executableFileVersion = optionalVersion(values.executableFileVersion, '程序文件版本');
  const regulationInternalVersion = optionalInteger(values.regulationInternalVersion, 'Regulation 内部版本');
  return {
    ...(applicationVersion ? { applicationVersion } : {}),
    ...(calibrationsVersion ? { calibrationsVersion } : {}),
    ...(executableFileVersion ? { executableFileVersion } : {}),
    ...(regulationInternalVersion ? { regulationInternalVersion } : {}),
    shadowOfTheErdtreeArchivePresent: files.some(({ path }) => /(?:^|\/)dlc\.bhd$/i.test(path.replaceAll('\\', '/'))),
  };
}

export function compareSourceManifests(previous, current) {
  const previousFiles = new Map(previous.files.map((file) => [file.path.replaceAll('\\', '/'), file]));
  const currentFiles = new Map(current.files.map((file) => [file.path.replaceAll('\\', '/'), file]));
  const paths = [...new Set([...previousFiles.keys(), ...currentFiles.keys()])].sort();
  const files = paths.flatMap((path) => {
    const before = previousFiles.get(path);
    const after = currentFiles.get(path);
    const status = before === undefined ? 'added'
      : after === undefined ? 'removed'
      : sourceFileIdentity(before) === sourceFileIdentity(after) ? 'unchanged' : 'changed';
    return status === 'unchanged' ? [] : [{ path, status, before, after }];
  });
  return {
    previousFingerprint: previous.sourceFingerprint,
    currentFingerprint: current.sourceFingerprint,
    previousRelease: previous.release,
    currentRelease: current.release,
    changedFileCount: files.length,
    files,
  };
}

function sourceFileIdentity(file) {
  return `${file.bytes}\0${file.sha256 ?? 'metadata-only'}`;
}

function optionalVersion(value, label) {
  if (value === undefined || value === '') return undefined;
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d+){1,3}$/.test(normalized)) throw new Error(`${label}格式无效：${value}`);
  return normalized;
}

function optionalInteger(value, label) {
  if (value === undefined || value === '') return undefined;
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${label}格式无效：${value}`);
  return Number(normalized);
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const base = new URL(args[0] ?? 'http://localhost:8080/');
const requireAssets = args.includes('--assets');
const assetOption = args.indexOf('--asset-base');
const assetBase = new URL(assetOption >= 0 ? args[assetOption + 1] : 'assets/', base);
const checks = [];

async function read(url, type) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, `${url.pathname}: HTTP ${response.status}`);
  assert.match(response.headers.get('content-type') ?? '', type, `${url.pathname}: wrong content type`);
  const bytes = Buffer.from(await response.arrayBuffer());
  checks.push({ path: url.pathname, status: response.status });
  return { bytes, headers: response.headers };
}

async function json(path, root = base, mutable = false) {
  const resource = await read(new URL(path, root), /json/);
  if (mutable) {
    assert.match(resource.headers.get('cache-control') ?? '', /no-cache|no-store|max-age=0/,
      `${path}: mutable manifest must revalidate`);
  }
  return JSON.parse(resource.bytes);
}

async function catalog(resource) {
  assert.ok(resource?.path, 'Missing catalog path');
  const result = await read(new URL(resource.path, assetBase), /json/);
  if (resource.sha256) {
    assert.equal(createHash('sha256').update(result.bytes).digest('hex'), resource.sha256,
      `${resource.path}: content hash mismatch`);
  }
  return JSON.parse(result.bytes);
}

try {
  const health = await json('actuator/health/readiness');
  assert.equal(health.status, 'UP');
  const info = await json('api/v1/system/info');
  assert.equal(info.saveParsingMode, 'browser-worker');
  const page = await read(base, /html/);
  const assets = [...page.bytes.toString().matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)];
  assert.ok(assets.some((entry) => entry[1].endsWith('.js')), 'HTML has no JavaScript entrypoint');
  for (const [, path] of assets) {
    await read(new URL(path, base), path.endsWith('.js') ? /javascript/ : /css/);
  }
  if (requireAssets) {
    const index = await json('dataset-index.v1.json', assetBase, true);
    assert.equal(index.schemaVersion, 1);
    assert.ok(index.profiles.length > 0);
    for (const profile of index.profiles) {
      const manifest = await json(profile.manifestPath, assetBase, true);
      assert.equal(manifest.profile, profile.id);
      for (const resource of Object.values(manifest.resources)) await catalog(resource);
    }
    const items = await json('item-data/item-data-manifest.v1.json', assetBase, true);
    await catalog(items.core);
    for (const resource of Object.values(items.locales)) await catalog(resource);
    const monsters = await json('monster-data/monster-data-manifest.v1.json', assetBase, true);
    await catalog(monsters.resource);
  }
  console.log(JSON.stringify({ ok: true, checkCount: checks.length, gameAssetsChecked: requireAssets, checks }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message, completedChecks: checks }, null, 2));
  process.exitCode = 1;
}

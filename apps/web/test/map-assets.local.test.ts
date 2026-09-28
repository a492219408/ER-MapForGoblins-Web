import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const assetsDirectory = resolve(process.cwd(), '../../runtime/assets');
const datasetManifestPath = resolve(assetsDirectory, 'dataset-manifest.v1.json');
const localAssetsAvailable = existsSync(datasetManifestPath);

describe.skipIf(!localAssetsAvailable)('本地地图资源包', () => {
  it('地图清单具有正确哈希、投影与三个独立平面', () => {
    const datasetManifest = JSON.parse(readFileSync(datasetManifestPath, 'utf8')) as {
      resources: { mapTiles?: { path: string; sha256: string; bytes: number; schemaVersion: number } };
    };
    const resource = datasetManifest.resources.mapTiles;
    if (!resource) return;

    const bytes = readFileSync(resolve(assetsDirectory, resource.path));
    expect(bytes.byteLength).toBe(resource.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(resource.sha256);
    const manifest = JSON.parse(bytes.toString('utf8')) as {
      schemaVersion: number;
      tileSize: number;
      maxZoom: number;
      projection: { gameBounds: number[]; xyzOrigin: number[]; xyzSpan: number };
      maps: Array<{ id: string; plane: string; tileTemplate: string }>;
    };
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.tileSize).toBe(1024);
    expect(manifest.maxZoom).toBe(4);
    expect(manifest.projection).toEqual({
      coordinateSystemId: 'elden-ring-world-map-v1',
      gameBounds: [0, 0, 10496, 10496],
      xyzOrigin: [11, 11],
      xyzSpan: 41,
    });
    expect(manifest.maps.map(({ id, plane }) => [id, plane])).toEqual([
      ['M00', 'surface'],
      ['M01', 'underground'],
      ['M10', 'shadow'],
    ]);

    for (const map of manifest.maps) {
      const overview = resolve(
        assetsDirectory,
        map.tileTemplate.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0'),
      );
      const tile = readFileSync(overview);
      expect(tile.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(tile.subarray(8, 12).toString('ascii')).toBe('WEBP');
    }
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const assetsDirectory = resolve(process.cwd(), '../../runtime/assets');
const datasetManifestPath = resolve(assetsDirectory, 'datasets/err/dataset-manifest.v1.json');
const localAssetsAvailable = existsSync(datasetManifestPath);

describe.skipIf(!localAssetsAvailable)('本地 ERR 数据资源包', () => {
  it('标记与瓦片共用完整的 41×41 L0 坐标框架', () => {
    const catalog = readCatalog();
    expect(catalog.coordinateSystem.mapFrame.bounds).toEqual([0, 0, 10496, 10496]);
  });

  it('法姆·亚兹拉采用首个正式 legacy 基准点并落在地图东侧', () => {
    const catalog = readCatalog();
    const conversion = catalog.legacyConversions.find((candidate) => (
      candidate.sourceArea === 13 && candidate.sourceGridX === 0
    ));
    expect(conversion?.sourceX).toBeCloseTo(-2509.6101, 3);
    expect(conversion?.sourceZ).toBeCloseTo(-668.01, 3);

    const coordinates = catalog.markers
      .filter((marker) => marker.area === 13 && marker.mapPosition)
      .map((marker) => marker.mapPosition!.coordinate);
    expect(coordinates).toHaveLength(191);
    expect(Math.min(...coordinates.map(([x]) => x))).toBeGreaterThan(8000);
    expect(Math.max(...coordinates.map(([, y]) => y))).toBeLessThan(4800);
  });

  it('深根底层通过多段 legacy 转换落在地下地图北侧', () => {
    const catalog = readCatalog();
    const coordinates = catalog.markers
      .filter((marker) => marker.area === 12 && marker.gridX === 3 && marker.mapPosition)
      .map((marker) => marker.mapPosition!.coordinate);

    expect(coordinates).toHaveLength(170);
    expect(Math.min(...coordinates.map(([x]) => x))).toBeGreaterThan(3900);
    expect(Math.max(...coordinates.map(([x]) => x))).toBeLessThan(4800);
    expect(Math.min(...coordinates.map(([, y]) => y))).toBeGreaterThan(2900);
    expect(Math.max(...coordinates.map(([, y]) => y))).toBeLessThan(3700);
  });

  it('王城与灰城标记带有互斥形态标签', () => {
    const catalog = readCatalog();
    expect(catalog.markers.filter((marker) => marker.capitalState === 'royal')).toHaveLength(249);
    expect(catalog.markers.filter((marker) => marker.capitalState === 'ashen')).toHaveLength(32);
  });
});

interface LocalCatalog {
  coordinateSystem: { mapFrame: { bounds: number[] } };
  legacyConversions: Array<{ sourceArea: number; sourceGridX: number; sourceX: number; sourceZ: number }>;
  markers: Array<{
    area: number;
    gridX: number;
    capitalState?: 'royal' | 'ashen';
    mapPosition: { coordinate: [number, number] } | null;
  }>;
}

function readCatalog(): LocalCatalog {
  const manifest = JSON.parse(readFileSync(datasetManifestPath, 'utf8')) as {
    resources: { markerCatalog: { path: string } };
  };
  return JSON.parse(readFileSync(resolve(assetsDirectory, manifest.resources.markerCatalog.path), 'utf8')) as LocalCatalog;
}

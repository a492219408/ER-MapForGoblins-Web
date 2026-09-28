import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetUrl, mapTileTemplateUrl } from './dataset';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('地图资源 URL', () => {
  it('普通资源仍使用文档基址解析', () => {
    vi.stubGlobal('document', { baseURI: 'http://localhost:5173/app/' });

    expect(assetUrl('datasets/err/catalog.json'))
      .toBe('http://localhost:5173/app/datasets/err/catalog.json');
  });

  it('保留 MapLibre 的 XYZ 瓦片占位符', () => {
    vi.stubGlobal('document', { baseURI: 'http://localhost:5173/' });

    expect(mapTileTemplateUrl('tiles/elden-ring/revision/M00/{z}/{x}/{y}.webp'))
      .toBe('http://localhost:5173/tiles/elden-ring/revision/M00/{z}/{x}/{y}.webp');
  });
});

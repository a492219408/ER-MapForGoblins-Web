import { describe, expect, it } from 'vitest';
import { resolveAssetBases } from './asset-base';

describe('部署资源基址', () => {
  it('Bridge 的根相对路径可作为数据清单的 URL 基址', () => {
    const [base] = resolveAssetBases('/game-assets', 'http://bridge.example:51337/');
    expect(new URL('datasets/vanilla/dataset-manifest.v1.json', base).href)
      .toBe('http://bridge.example:51337/game-assets/datasets/vanilla/dataset-manifest.v1.json');
  });

  it('支持站点子目录内的相对资源路径', () => {
    expect(resolveAssetBases('./bundle/', 'https://map.example/app/?page=items'))
      .toEqual(['https://map.example/app/bundle/']);
  });

  it('保留外部资源主机并规范化尾部分隔符', () => {
    expect(resolveAssetBases(' https://assets.example/game/// ', 'https://map.example/'))
      .toEqual(['https://assets.example/game/']);
  });

  it('未配置时保留 Vite 根路径及 Java assets 路径的回退顺序', () => {
    expect(resolveAssetBases(undefined, 'https://map.example/app/index.html'))
      .toEqual(['https://map.example/app/', 'https://map.example/app/assets/']);
  });
});

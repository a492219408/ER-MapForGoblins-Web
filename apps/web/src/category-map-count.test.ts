import { describe, expect, it } from 'vitest';
import { resolveCategoryMapCount } from './category-map-count';

describe('resolveCategoryMapCount', () => {
  it('没有地图过滤结果时使用目录总数', () => {
    expect(resolveCategoryMapCount('QuestSeedbedCurses', 6, undefined)).toEqual({
      visible: 6,
      collectedOutside: 0,
    });
  });

  it('探索结果缺少某分类时保持为零而不是回退到目录总数', () => {
    expect(resolveCategoryMapCount('QuestSeedbedCurses', 6, new Map())).toEqual({
      visible: 0,
      collectedOutside: 0,
    });
  });
});

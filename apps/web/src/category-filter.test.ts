import { describe, expect, it } from 'vitest';
import type { MarkerCategoryDefinition } from './dataset';
import { filterCategoryDefinitions } from './category-filter';

const categories: MarkerCategoryDefinition[] = [
  {
    id: 'WorldBosses',
    configKey: 'show_bosses',
    section: 'World',
    group: 'world',
    markerCount: 216,
    labels: { 'zh-CN': 'Boss', 'en-US': 'Bosses' },
    descriptions: { 'zh-CN': '显示所有首领', 'en-US': 'Show all bosses' },
  },
  {
    id: 'KeyCookbooks',
    configKey: 'show_cookbooks',
    section: 'Key Items',
    group: 'key-items',
    markerCount: 86,
    labels: { 'zh-CN': '制作笔记', 'en-US': 'Cookbooks' },
    descriptions: { 'zh-CN': '显示制作笔记', 'en-US': 'Show cookbooks' },
  },
];

describe('filterCategoryDefinitions', () => {
  it('搜索当前语言、英文回退与技术标识', () => {
    expect(filterCategoryDefinitions(categories, '首领', 'zh-CN').map(({ id }) => id)).toEqual(['WorldBosses']);
    expect(filterCategoryDefinitions(categories, 'cookbooks', 'zh-CN').map(({ id }) => id)).toEqual(['KeyCookbooks']);
    expect(filterCategoryDefinitions(categories, 'show_bosses', 'zh-CN').map(({ id }) => id)).toEqual(['WorldBosses']);
  });
});

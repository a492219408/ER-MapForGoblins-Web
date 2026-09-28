import { describe, expect, it } from 'vitest';
import { itemEffectIds, searchItems, type ItemDataset, type ItemEntry } from './item-data';

const item: ItemEntry = {
  key: 'weapon:33250000',
  id: '33250000',
  kind: 'weapon',
  categoryPath: ['equipment', 'weapons', 'melee'],
  iconId: 11216,
  sortId: 1,
  isCutContent: false,
  contentPack: 'base',
  fallbackName: 'Meteorite Staff',
  params: { residentSpEffectId: 1920, spEffectMsgId0: 1101, refId1: -1 },
};

const dataset = {
  items: [item],
  texts: { [item.key]: { name: '陨石杖' } },
} as unknown as ItemDataset;

describe('item data helpers', () => {
  it('searches localized names, fallback names and IDs', () => {
    expect(searchItems(dataset, '陨石')).toEqual([item]);
    expect(searchItems(dataset, 'Meteorite 3325')).toEqual([item]);
  });

  it('hides cut content from search unless explicitly enabled', () => {
    const cut = { ...item, key: 'weapon:cut', id: '999', isCutContent: true };
    const withCut = { ...dataset, items: [cut] } as unknown as ItemDataset;
    expect(searchItems(withCut, 'Meteorite')).toEqual([]);
    expect(searchItems(withCut, 'Meteorite', { includeCutContent: true })).toEqual([cut]);
  });

  it('deduplicates positive effect references', () => {
    expect(itemEffectIds({ ...item, params: { residentSpEffectId: 1920, residentSpEffectId1: 1920, refId1: -1 } })).toEqual([1920]);
  });

  it('filters expansion and Tarnished Pack entries during search', () => {
    const expansion = { ...item, key: 'weapon:dlc', id: '2', contentPack: 'shadow-of-the-erdtree' as const };
    const pack = { ...item, key: 'weapon:pack', id: '3', contentPack: 'tarnished-pack' as const };
    const mixed = { ...dataset, items: [item, expansion, pack] } as unknown as ItemDataset;
    expect(searchItems(mixed, 'Meteorite', { contentPacks: new Set(['base']) })).toEqual([item]);
  });
});

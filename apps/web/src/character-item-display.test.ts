import { describe, expect, it } from 'vitest';
import type { ItemEntry } from './item-data';
import {
  buildCharacterItemIndex,
  buildInventoryQuantityIndex,
  inventoryQuantityLabel,
  resolveEquippedItem,
  resolveSpellItem,
} from './character-item-display';

const item = (partial: Partial<ItemEntry> & Pick<ItemEntry, 'id' | 'key' | 'kind'>): ItemEntry => ({
  categoryPath: [],
  contentPack: 'base',
  fallbackName: partial.key,
  iconId: 1,
  isCutContent: false,
  params: {},
  sortId: 0,
  ...partial,
});

describe('character item display', () => {
  it('resolves goods-derived Great Runes and both spell families', () => {
    const greatRune = item({ id: '191', key: 'key-item:191', kind: 'key-item' });
    const sorcery = item({ id: '4670', key: 'sorcery:4670', kind: 'sorcery' });
    const incantation = item({ id: '7030', key: 'incantation:7030', kind: 'incantation' });
    const index = buildCharacterItemIndex([greatRune, sorcery, incantation]);
    expect(resolveEquippedItem(index, { id: 191, kind: 'goods' })).toBe(greatRune);
    expect(resolveSpellItem(index, 4670)).toBe(sorcery);
    expect(resolveSpellItem(index, 7030)).toBe(incantation);
  });

  it('formats held and stored quantities while suppressing infinite goods', () => {
    const quantities = buildInventoryQuantityIndex(
      [{ id: 830, kind: 'goods', handle: 0xb000_033e, quantity: 12, inventoryIndex: 1, keyItem: false }],
      [{ id: 830, kind: 'goods', handle: 0xb000_133e, quantity: 45, inventoryIndex: 1, keyItem: false }],
    );
    const consumable = item({ id: '830', key: 'goods:830', kind: 'goods', params: { isConsume: 1, maxRepositoryNum: 600 } });
    const infinite = item({ id: '115', key: 'goods:115', kind: 'goods', params: { isConsume: 0, maxRepositoryNum: 1 } });
    expect(inventoryQuantityLabel({ id: 830, kind: 'goods', handle: 0xb000_033e }, consumable, 'quick-item', quantities, 'zh-CN')).toBe('12/45');
    expect(inventoryQuantityLabel({ id: 115, kind: 'goods' }, infinite, 'quick-item', quantities, 'zh-CN')).toBeUndefined();
  });
});

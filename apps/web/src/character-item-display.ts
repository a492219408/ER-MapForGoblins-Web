import type { ItemEntry } from './item-data';
import type { ParsedEquippedItem, ParsedInventoryItem } from './save-parser-protocol';

export type CharacterSlotKind =
  | 'right-weapon'
  | 'left-weapon'
  | 'arrow'
  | 'bolt'
  | 'head'
  | 'chest'
  | 'arms'
  | 'legs'
  | 'talisman'
  | 'quick-item'
  | 'pouch-item'
  | 'great-rune'
  | 'spell';

export interface CharacterItemIndex {
  readonly equipped: ReadonlyMap<string, ItemEntry>;
  readonly spells: ReadonlyMap<string, ItemEntry>;
}

export interface InventoryQuantityIndex {
  readonly heldByHandle: ReadonlyMap<number, number>;
  readonly heldByKey: ReadonlyMap<string, number>;
  readonly storedByKey: ReadonlyMap<string, number>;
}

const goodsKinds = new Set([
  'goods', 'material', 'upgrade-material', 'key-item', 'information', 'gesture',
  'spirit-ash', 'crystal-tear', 'sorcery', 'incantation',
]);

export function buildCharacterItemIndex(items: readonly ItemEntry[]): CharacterItemIndex {
  const equipped = new Map<string, ItemEntry>();
  const spells = new Map<string, ItemEntry>();
  for (const item of items) {
    equipped.set(item.key, item);
    if (goodsKinds.has(item.kind) && !equipped.has(`goods:${item.id}`)) {
      equipped.set(`goods:${item.id}`, item);
    }
    if (item.kind === 'sorcery' || item.kind === 'incantation') {
      spells.set(`${item.kind}:${item.id}`, item);
    }
  }
  return { equipped, spells };
}

export function resolveEquippedItem(
  index: CharacterItemIndex,
  item: ParsedEquippedItem | undefined,
): ItemEntry | undefined {
  return item ? index.equipped.get(`${item.kind}:${item.baseId ?? item.id}`) : undefined;
}

export function resolveSpellItem(index: CharacterItemIndex, id: number | undefined): ItemEntry | undefined {
  if (id == null) return undefined;
  return index.spells.get(`sorcery:${id}`) ?? index.spells.get(`incantation:${id}`);
}

export function buildInventoryQuantityIndex(
  heldItems: readonly ParsedInventoryItem[],
  storedItems: readonly ParsedInventoryItem[],
): InventoryQuantityIndex {
  const heldByHandle = new Map<number, number>();
  const heldByKey = new Map<string, number>();
  const storedByKey = new Map<string, number>();
  for (const item of heldItems) {
    if (item.handle != null) heldByHandle.set(item.handle, item.quantity);
    addQuantity(heldByKey, inventoryKey(item), item.quantity);
  }
  for (const item of storedItems) addQuantity(storedByKey, inventoryKey(item), item.quantity);
  return { heldByHandle, heldByKey, storedByKey };
}

export function inventoryQuantityLabel(
  item: ParsedEquippedItem | undefined,
  entry: ItemEntry | undefined,
  slotKind: CharacterSlotKind,
  quantities: InventoryQuantityIndex,
  locale: string,
): string | undefined {
  if (!item || !entry || !quantityBearingSlot(slotKind)) return undefined;
  if (item.kind === 'goods' && Number(entry.params.isConsume) === 0) return undefined;
  const key = inventoryKey(item);
  const held = item.handle == null
    ? quantities.heldByKey.get(key) ?? 0
    : quantities.heldByHandle.get(item.handle) ?? quantities.heldByKey.get(key) ?? 0;
  const stored = quantities.storedByKey.get(key) ?? 0;
  if (held === 0 && stored === 0) return undefined;
  if (item.kind === 'goods' && Number(entry.params.maxRepositoryNum) <= 1) {
    return held.toLocaleString(locale);
  }
  return `${held.toLocaleString(locale)}/${stored.toLocaleString(locale)}`;
}

function quantityBearingSlot(kind: CharacterSlotKind): boolean {
  return kind === 'arrow' || kind === 'bolt' || kind === 'quick-item' || kind === 'pouch-item';
}

function inventoryKey(item: ParsedEquippedItem): string {
  return `${item.kind}:${item.baseId ?? item.id}`;
}

function addQuantity(target: Map<string, number>, key: string, quantity: number): void {
  target.set(key, (target.get(key) ?? 0) + Math.max(0, quantity));
}

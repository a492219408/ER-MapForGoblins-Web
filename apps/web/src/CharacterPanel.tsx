import { useEffect, useMemo, useState } from 'react';
import type { ItemDataset, ItemEntry } from './item-data';
import { itemIconUrl, loadItemDataset, localizedItemName } from './item-data';
import type { ParsedCharacterSummary, ParsedEquippedItem, ParsedSlotSummary } from './save-parser-protocol';
import { nextLevelRuneCost } from './character-data';
import {
  buildCharacterItemIndex,
  buildInventoryQuantityIndex,
  inventoryQuantityLabel,
  resolveEquippedItem,
  resolveSpellItem,
  type CharacterItemIndex,
  type CharacterSlotKind,
  type InventoryQuantityIndex,
} from './character-item-display';

interface CharacterPanelProps {
  locale: string;
  slot: ParsedSlotSummary | undefined;
  onBack(): void;
}

const archetypeNames = [
  '流浪骑士', '剑士', '勇者', '盗贼', '观星者', '预言家', '武士', '囚犯', '密使', '一贫如洗',
];

const giftNames = [
  '无', '红琥珀链坠', '交界地卢恩', '黄金种子', '尖牙小恶魔的骨灰',
  '龟裂壶', '石剑钥匙', '魅惑树枝', '煮熟虾子', '夏玻利利之祸',
];

const attributes: Array<[keyof ParsedCharacterSummary, string]> = [
  ['vigor', '生命力'],
  ['mind', '集中力'],
  ['endurance', '耐力'],
  ['strength', '力气'],
  ['dexterity', '灵巧'],
  ['intelligence', '智力'],
  ['faith', '信仰'],
  ['arcane', '感应'],
];

export function CharacterPanel({ locale, slot, onBack }: CharacterPanelProps) {
  const character = slot?.character;
  const hasLoadout = Boolean(character?.loadout);
  const [itemDataset, setItemDataset] = useState<ItemDataset>();
  const [itemDataError, setItemDataError] = useState<string>();
  useEffect(() => {
    if (!hasLoadout) {
      setItemDataset(undefined);
      return;
    }
    const controller = new AbortController();
    setItemDataset(undefined);
    setItemDataError(undefined);
    void loadItemDataset(locale, controller.signal)
      .then(setItemDataset)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setItemDataError(error instanceof Error ? error.message : '无法读取物品数据');
      });
    return () => controller.abort();
  }, [hasLoadout, locale]);
  const itemIndex = useMemo(() => buildCharacterItemIndex(itemDataset?.items ?? []), [itemDataset]);
  const quantityIndex = useMemo(() => buildInventoryQuantityIndex(
    character?.loadout?.inventory.heldItems ?? [],
    character?.loadout?.inventory.storedItems ?? [],
  ), [character?.loadout?.inventory]);
  return (
    <section className="character-panel" aria-label="角色数据">
      <div className="character-panel-heading">
        <button type="button" onClick={onBack}>← 存档连接</button>
        <span><small>当前槽位</small><strong>{slot ? `槽位 ${slot.index + 1}` : '尚未选择'}</strong></span>
      </div>

      {!slot || !character ? (
        <div className="character-empty">
          <h2>等待角色数据</h2>
          <p>选择存档和槽位后，角色基础数值会在这里显示。</p>
        </div>
      ) : (
        <>
          <header className="character-identity">
            <div>
              <span className="eyebrow">{archetypeName(character.archetype)}</span>
              <h2>{slot.name}</h2>
              <p>Lv.{slot.level} · {formatPlayTime(slot.secondsPlayed)}</p>
            </div>
            <dl>
              <div><dt>持有卢恩</dt><dd>{formatNumber(character.runes, locale)}</dd></div>
              <div><dt>升级所需</dt><dd>{formatNumber(nextLevelRuneCost(slot.level), locale)}</dd></div>
              <div><dt>出身遗物</dt><dd>{giftName(character.gift)}</dd></div>
              <div><dt>体形</dt><dd>{bodyTypeName(character.bodyType)}</dd></div>
              <div><dt>年龄段</dt><dd>{ageGroupName(character.loadout?.ageGroup)}</dd></div>
            </dl>
          </header>

          <div className="character-vitals">
            <Vital label="血量" current={character.hp} maximum={character.maxHp} base={character.baseMaxHp} locale={locale} />
            <Vital label="专注值" current={character.fp} maximum={character.maxFp} base={character.baseMaxFp} locale={locale} />
            <Vital label="精力" current={character.stamina} maximum={character.maxStamina} base={character.baseMaxStamina} locale={locale} />
          </div>

          <section className="character-stat-section">
            <div className="character-section-title">
              <h3>能力值</h3>
              <small>角色加点基础值</small>
            </div>
            <dl className="character-attribute-grid">
              {attributes.map(([key, label]) => (
                <div key={key}><dt>{label}</dt><dd>{formatNumber(character[key], locale)}</dd></div>
              ))}
            </dl>
            <p className="character-data-note">这里是存档中的加点基础值。装备与护符带来的当前能力值和单件来源尚未完成参数计算，因此暂不虚构“+5”等拆分。</p>
          </section>

          <section className="character-stat-section two-column">
            <div>
              <div className="character-section-title"><h3>携带与进度</h3></div>
              <dl className="character-detail-list">
                <div><dt>红露滴圣杯瓶分配</dt><dd>{formatNumber(character.maxCrimsonTearFlaskCount, locale)}</dd></div>
                <div><dt>蓝露滴圣杯瓶分配</dt><dd>{formatNumber(character.maxCeruleanTearFlaskCount, locale)}</dd></div>
                <div><dt>额外护符皮袋</dt><dd>{formatNumber(character.additionalTalismanSlotCount, locale)}</dd></div>
                <div><dt>骨灰强化记录</dt><dd>{formatNumber(character.summonSpiritLevel, locale)}</dd></div>
                <div><dt>死亡次数</dt><dd>{formatNumber(slot.totalDeathCount, locale)}</dd></div>
              </dl>
            </div>
            <div>
              <div className="character-section-title"><h3>抵抗力总值</h3></div>
              <dl className="character-detail-list compact">
                <div><dt>免疫力（中毒／腐败）</dt><dd>{formatPair(character.poisonBuildup, character.rotBuildup, locale)}</dd></div>
                <div><dt>健壮度（出血／冻伤）</dt><dd>{formatPair(character.bleedBuildup, character.frostBuildup, locale)}</dd></div>
                <div><dt>理智度（催眠／发狂）</dt><dd>{formatPair(character.sleepBuildup, character.madnessBuildup, locale)}</dd></div>
                <div><dt>抗死度</dt><dd>{formatNumber(character.deathBuildup, locale)}</dd></div>
              </dl>
              <p className="character-data-note">目前只能可靠读取总值；身体与防具的拆分要等装备栏结构接入。</p>
            </div>
          </section>

          {character.loadout && (
            <section className="character-loadout-section">
              <div className="character-section-title">
                <h3>装备与记忆</h3>
                <small>只读存档槽位</small>
              </div>
              <LoadoutRow label="右手武器" items={character.loadout.rightHand} slotKinds={fillSlotKinds('right-weapon', 3)} activeSlot={character.loadout.activeRightHandSlot} dataset={itemDataset} itemIndex={itemIndex} quantityIndex={quantityIndex} />
              <LoadoutRow label="左手武器" items={character.loadout.leftHand} slotKinds={fillSlotKinds('left-weapon', 3)} activeSlot={character.loadout.activeLeftHandSlot} dataset={itemDataset} itemIndex={itemIndex} quantityIndex={quantityIndex} />
              <LoadoutRow label="箭" items={character.loadout.arrows} slotKinds={fillSlotKinds('arrow', 2)} dataset={itemDataset} itemIndex={itemIndex} quantityIndex={quantityIndex} />
              <LoadoutRow label="弩箭" items={character.loadout.bolts} slotKinds={fillSlotKinds('bolt', 2)} dataset={itemDataset} itemIndex={itemIndex} quantityIndex={quantityIndex} />
              <LoadoutRow label="防具" items={[
                character.loadout.armor.head,
                character.loadout.armor.chest,
                character.loadout.armor.arms,
                character.loadout.armor.legs,
              ]} slotKinds={['head', 'chest', 'arms', 'legs']} dataset={itemDataset} itemIndex={itemIndex} quantityIndex={quantityIndex} />
              <LoadoutRow label="护符" items={character.loadout.talismans} slotKinds={fillSlotKinds('talisman', 4)} dataset={itemDataset} itemIndex={itemIndex} quantityIndex={quantityIndex} />
              <LoadoutRow label="使用道具" items={character.loadout.quickItems} slotKinds={fillSlotKinds('quick-item', 10)} activeSlot={character.loadout.activeQuickItemSlot} dataset={itemDataset} itemIndex={itemIndex} quantityIndex={quantityIndex} compact />
              <LoadoutRow label="随身包包" items={character.loadout.pouchItems} slotKinds={fillSlotKinds('pouch-item', 6)} dataset={itemDataset} itemIndex={itemIndex} quantityIndex={quantityIndex} />
              <LoadoutRow label="大卢恩" items={[character.loadout.greatRune]} slotKinds={['great-rune']} dataset={itemDataset} itemIndex={itemIndex} quantityIndex={quantityIndex} />
              <SpellRow
                spellIds={character.loadout.memorizedSpells.slice(0, character.loadout.memorySlotCount)}
                activeSlot={character.loadout.activeSpellSlot}
                locale={locale}
                dataset={itemDataset}
                itemIndex={itemIndex}
              />
              <dl className="character-inventory-summary">
                <div><dt>身上一般物品种类</dt><dd>{formatNumber(character.loadout.inventory.heldCommonDistinctCount, locale)}</dd></div>
                <div><dt>身上贵重物品种类</dt><dd>{formatNumber(character.loadout.inventory.heldKeyDistinctCount, locale)}</dd></div>
                <div><dt>木箱一般物品种类</dt><dd>{formatNumber(character.loadout.inventory.storedCommonDistinctCount, locale)}</dd></div>
                <div><dt>木箱贵重物品种类</dt><dd>{formatNumber(character.loadout.inventory.storedKeyDistinctCount, locale)}</dd></div>
              </dl>
              {itemDataError && <p className="character-data-note">图标与名称资源暂不可用：{itemDataError}</p>}
              <p className="character-data-note">木箱条目的基础 ID 与数量已经解析；武器实例会区分强化、质变与自定义战灰。自动补充状态尚未定位到可复用字段，本页不会根据偶然字节差异猜测。</p>
            </section>
          )}
        </>
      )}
    </section>
  );
}

function LoadoutRow({ label, items, slotKinds, activeSlot, dataset, itemIndex, quantityIndex, compact = false }: {
  label: string;
  items: Array<ParsedEquippedItem | undefined>;
  slotKinds: CharacterSlotKind[];
  activeSlot?: number;
  dataset: ItemDataset | undefined;
  itemIndex: CharacterItemIndex;
  quantityIndex: InventoryQuantityIndex;
  compact?: boolean;
}) {
  return (
    <div className={`character-loadout-row${compact ? ' compact' : ''}`}>
      <span>{label}</span>
      <div>
        {items.map((item, index) => (
          <ItemSlot
            key={`${label}-${index}`}
            item={item}
            kind={slotKinds[index] ?? 'quick-item'}
            active={activeSlot === index}
            dataset={dataset}
            itemIndex={itemIndex}
            quantityIndex={quantityIndex}
          />
        ))}
      </div>
    </div>
  );
}

function ItemSlot({ item, kind, active = false, dataset, itemIndex, quantityIndex }: {
  item: ParsedEquippedItem | undefined;
  kind: CharacterSlotKind;
  active?: boolean;
  dataset: ItemDataset | undefined;
  itemIndex: CharacterItemIndex;
  quantityIndex: InventoryQuantityIndex;
}) {
  const entry = resolveEquippedItem(itemIndex, item);
  const name = item ? (entry && dataset ? localizedItemName(dataset, entry) : specialItemName(item)) : '空';
  const icon = entry && dataset ? itemIconUrl(dataset, entry) : undefined;
  const instanceDetails = item ? weaponInstanceDetails(item, dataset, itemIndex.equipped) : undefined;
  const quantity = inventoryQuantityLabel(item, entry, kind, quantityIndex, dataset?.locale ?? 'zh-CN');
  return (
    <span className={`character-slot-card${item ? '' : ' empty'}${active ? ' active' : ''}`} title={[name, instanceDetails?.summary, instanceDetails?.skillName].filter(Boolean).join(' · ')} aria-label={name}>
      <span className={`character-item-slot ${kind}`}>
        {icon && <img src={icon} alt="" loading="lazy" decoding="async" />}
        {quantity && <b className="character-slot-quantity">{quantity}</b>}
        {instanceDetails?.summary && <em>{instanceDetails.summary}</em>}
      </span>
      <small>{name}</small>
      {instanceDetails?.skillName && <em className="character-slot-skill">{instanceDetails.skillName}</em>}
    </span>
  );
}

function SpellRow({ spellIds, activeSlot, locale, dataset, itemIndex }: {
  spellIds: Array<number | undefined>;
  activeSlot: number | undefined;
  locale: string;
  dataset: ItemDataset | undefined;
  itemIndex: CharacterItemIndex;
}) {
  return (
    <div className="character-loadout-row compact">
      <span>记忆</span>
      <div>
        {spellIds.map((id, index) => {
          const entry = resolveSpellItem(itemIndex, id);
          const name = id == null ? '空' : entry && dataset ? localizedItemName(dataset, entry) : spellName(id, locale);
          const icon = entry && dataset ? itemIconUrl(dataset, entry) : undefined;
          return (
            <span
              key={`spell-${index}`}
              className={`character-slot-card${id == null ? ' empty' : ''}${activeSlot === index ? ' active' : ''}`}
              title={name}
              aria-label={name}
            >
              <span className="character-item-slot spell">
                {icon && <img src={icon} alt="" loading="lazy" decoding="async" />}
              </span>
              <small>{name}</small>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function fillSlotKinds(kind: CharacterSlotKind, count: number): CharacterSlotKind[] {
  return Array.from({ length: count }, () => kind);
}

function kindName(kind: ParsedEquippedItem['kind']): string {
  return { weapon: '武器', armor: '防具', talisman: '护符', goods: '道具', 'ash-of-war': '战灰' }[kind];
}

const affinityNamesZhCn = [
  '普通', '厚重', '锋利', '优质', '魔力', '火焰', '焰术', '雷电', '神圣', '毒', '血', '寒冷', '神秘',
];

function weaponInstanceDetails(
  item: ParsedEquippedItem,
  dataset: ItemDataset | undefined,
  itemIndex: ReadonlyMap<string, ItemEntry>,
): { summary?: string; skillName?: string } | undefined {
  if (item.kind !== 'weapon') return undefined;
  const summary: string[] = [];
  if (item.upgradeLevel) summary.push(`+${item.upgradeLevel}`);
  if (item.affinityId) summary.push(affinityNamesZhCn[item.affinityId] ?? `质变 ${item.affinityId}`);
  let skillName: string | undefined;
  if (item.ashOfWarId) {
    const ash = itemIndex.get(`ash-of-war:${item.ashOfWarId}`);
    skillName = ash && dataset ? localizedItemName(dataset, ash) : `#${item.ashOfWarId}`;
  }
  return summary.length > 0 || skillName ? { summary: summary.join(' · ') || undefined, skillName } : undefined;
}

function specialItemName(item: ParsedEquippedItem): string {
  if (item.kind === 'goods') {
    if (item.id === 191) return '葛瑞克的大卢恩';
    if (item.id === 192) return '拉塔恩的大卢恩';
  }
  return `${kindName(item.kind)} #${item.id}`;
}

const verifiedSpellNamesZhCn: Record<number, string> = {
  7030: '腐败吐息',
  7020: '龙冰',
  6210: '黑焰',
  4670: '化为无形',
  6421: '恢复',
  6320: '血焰刀刃',
  6960: '雷武器',
  6040: '火焰的疗愈啊',
  6300: '血焰爪痕',
};

function spellName(id: number, locale: string): string {
  return locale.toLowerCase().startsWith('zh') && verifiedSpellNamesZhCn[id]
    ? verifiedSpellNamesZhCn[id]
    : `魔法／祷告 #${id}`;
}

function Vital({ label, current, maximum, base, locale }: {
  label: string;
  current: number | undefined;
  maximum: number | undefined;
  base: number | undefined;
  locale: string;
}) {
  const ratio = typeof current === 'number' && typeof maximum === 'number' && maximum > 0
    ? Math.max(0, Math.min(100, current / maximum * 100))
    : 0;
  const bonus = typeof maximum === 'number' && typeof base === 'number' ? maximum - base : 0;
  return (
    <div>
      <span><strong>{label}</strong><em>{formatNumber(current, locale)} / {formatNumber(maximum, locale)}{bonus !== 0 ? ` (${bonus > 0 ? '+' : ''}${formatNumber(bonus, locale)})` : ''}</em></span>
      <b><i style={{ width: `${ratio}%` }} /></b>
    </div>
  );
}

function archetypeName(id: number | undefined): string {
  return typeof id === 'number' && archetypeNames[id] ? archetypeNames[id] : `出身 #${id ?? '—'}`;
}

function giftName(id: number | undefined): string {
  return typeof id === 'number' && giftNames[id] ? giftNames[id] : `#${id ?? '—'}`;
}

function bodyTypeName(id: number | undefined): string {
  if (id === 0) return 'A 类型';
  if (id === 1) return 'B 类型';
  return `#${id ?? '—'}`;
}

function ageGroupName(ageGroup: NonNullable<ParsedCharacterSummary['loadout']>['ageGroup']): string {
  return ageGroup ? { young: '年轻', mature: '壮年', aged: '年老' }[ageGroup] : '—';
}

function formatNumber(value: unknown, locale: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(locale) : '—';
}

function formatPair(first: number | undefined, second: number | undefined, locale: string): string {
  if (first === second) return formatNumber(first, locale);
  return `${formatNumber(first, locale)} / ${formatNumber(second, locale)}`;
}

function formatPlayTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${hours} 小时 ${minutes} 分钟`;
}

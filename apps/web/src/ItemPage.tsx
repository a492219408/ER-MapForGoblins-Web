import { useEffect, useMemo, useRef, useState } from 'react';
import { browserSettingsStore } from './settings-store';
import { resolveGameLocale } from './game-locales';
import { ControlBar } from './ControlBar';
import { DatabaseSavePanel } from './DatabaseSavePanel';
import { readControlPanel } from './control-bar-state';
import {
  itemEffectIds,
  itemIconUrl,
  loadItemDataset,
  localizedItemName,
  searchItems,
  type ItemDataset,
  type ItemContentPack,
  type ItemEntry,
  type ItemParamValue,
  type ItemText,
} from './item-data';
import { formatGameRelease } from './game-release';

interface CategoryNode {
  id: string;
  label: string;
  children?: CategoryNode[];
}

const categoryTree: CategoryNode[] = [
  { id: 'equipment', label: '装备', children: [
    { id: 'weapons', label: '武器', children: [
      { id: 'melee', label: '近战武器', children: [
        { id: 'dagger', label: '短剑' }, { id: 'straight-sword', label: '直剑' },
        { id: 'greatsword', label: '大剑' }, { id: 'colossal-sword', label: '特大剑' },
        { id: 'curved-sword', label: '曲剑' }, { id: 'curved-greatsword', label: '大曲剑' },
        { id: 'katana', label: '刀' }, { id: 'twinblade', label: '双头剑' },
        { id: 'thrusting-sword', label: '刺剑' }, { id: 'heavy-thrusting-sword', label: '大刺剑' },
        { id: 'axe', label: '斧' }, { id: 'greataxe', label: '大斧' }, { id: 'hammer', label: '槌' },
        { id: 'great-hammer', label: '大槌' }, { id: 'flail', label: '连枷' }, { id: 'spear', label: '矛' },
        { id: 'great-spear', label: '大矛' }, { id: 'halberd', label: '戟' }, { id: 'reaper', label: '镰刀' },
        { id: 'fist', label: '拳头' }, { id: 'claw', label: '钩爪' }, { id: 'whip', label: '软鞭' },
        { id: 'colossal-weapon', label: '特大武器' },
        { id: 'hand-to-hand', label: '徒手格斗' }, { id: 'perfume-bottle', label: '调香瓶' },
        { id: 'backhand-blade', label: '反手剑' }, { id: 'light-greatsword', label: '轻大剑' },
        { id: 'great-katana', label: '大刀' }, { id: 'beast-claw', label: '兽爪' },
        { id: 'unarmed', label: '空手' }, { id: 'internal-weapon', label: '内部武器数据' },
      ] },
      { id: 'ranged', label: '远程武器', children: [
        { id: 'light-bow', label: '小弓' }, { id: 'bow', label: '弓' }, { id: 'greatbow', label: '大弓' },
        { id: 'crossbow', label: '弩' }, { id: 'ballista', label: '弩炮' }, { id: 'staff', label: '手杖' },
        { id: 'sacred-seal', label: '圣印记' }, { id: 'throwing-blade', label: '投掷剑' },
      ] },
      { id: 'shield', label: '盾牌', children: [
        { id: 'torch', label: '火把' },
        { id: 'small-shield', label: '小盾' }, { id: 'medium-shield', label: '中盾' },
        { id: 'greatshield', label: '大盾' }, { id: 'thrusting-shield', label: '刺盾' },
      ] },
      { id: 'ammo', label: '箭／弩箭', children: [
        { id: 'arrow', label: '箭' }, { id: 'great-arrow', label: '大箭' },
        { id: 'bolt', label: '弩箭' }, { id: 'ballista-bolt', label: '大弩箭' },
      ] },
    ] },
    { id: 'armor', label: '防具', children: [
      { id: 'head', label: '头盔', children: armorEffectLeaves('head') },
      { id: 'chest', label: '铠甲', children: armorEffectLeaves('chest') },
      { id: 'arms', label: '臂甲', children: armorEffectLeaves('arms') },
      { id: 'legs', label: '腿甲', children: armorEffectLeaves('legs') },
    ] },
    { id: 'talisman', label: '护符' },
  ] },
  { id: 'arts', label: '战技与能力', children: [
    { id: 'sorcery', label: '魔法' },
    { id: 'incantation', label: '祷告' },
    { id: 'ash-of-war', label: '战灰' },
    { id: 'spirit-ash', label: '骨灰' },
  ] },
  { id: 'items', label: '道具与材料', children: [
    { id: 'goods', label: '道具' },
    { id: 'crafting-material', label: '制作道具的材料' },
    { id: 'upgrade-material', label: '强化用材料' },
  ] },
  { id: 'valuables', label: '贵重与其他', children: [
    { id: 'key-item', label: '贵重物品' },
    { id: 'great-rune', label: '大卢恩' },
    { id: 'information', label: '情报' },
    { id: 'gesture', label: '肢体动作' },
  ] },
];

const categoryLabels = new Map<string, string>();
for (const root of categoryTree) collectCategoryLabels(root);
const defaultExpandedCategories = categoryTree.flatMap((node) => [
  node.id,
  ...(node.children ?? []).filter((child) => child.children).map((child) => child.id),
]);
const itemPageSizes = [15, 30, 60, 100] as const;

const kindLabels: Record<string, string> = {
  weapon: '武器', armor: '防具', talisman: '护符', goods: '道具', material: '制作材料',
  'upgrade-material': '强化材料', 'key-item': '贵重物品', information: '情报', gesture: '肢体动作',
  'spirit-ash': '骨灰', 'crystal-tear': '结晶露滴', sorcery: '魔法', incantation: '祷告', 'ash-of-war': '战灰',
};

const weaponTypeLabels: Record<number, string> = {
  0: '内部武器数据', 33: '空手',
  1: '短剑', 3: '直剑', 5: '大剑', 7: '特大剑', 9: '曲剑', 11: '大曲剑', 13: '刀', 14: '双头剑',
  15: '刺剑', 16: '大刺剑', 17: '斧', 19: '大斧', 21: '槌', 23: '大槌', 24: '连枷', 25: '矛',
  28: '大矛', 29: '戟', 31: '镰刀', 35: '拳头', 37: '钩爪', 39: '软鞭', 41: '特大武器',
  50: '小弓', 51: '弓', 53: '大弓', 55: '弩', 56: '弩炮', 57: '手杖', 61: '圣印记',
  65: '小盾', 67: '中盾', 69: '大盾', 81: '箭', 83: '大箭', 85: '弩箭', 86: '大弩箭',
  87: '火把', 88: '徒手格斗', 89: '调香瓶', 90: '刺盾', 91: '投掷剑', 92: '反手剑',
  93: '轻大剑', 94: '大刀', 95: '兽爪',
};

export function ItemPage() {
  const [preferences, setPreferences] = useState(() => browserSettingsStore.loadPreferences());
  const locale = resolveGameLocale(preferences.locale);
  const [dataset, setDataset] = useState<ItemDataset>();
  const [error, setError] = useState<string>();
  const [selectedLeaf, setSelectedLeaf] = useState(() => (
    categoryLabels.has(preferences.itemCategory) ? preferences.itemCategory : 'melee'
  ));
  const [expandedCategories, setExpandedCategories] = useState(() => new Set(defaultExpandedCategories));
  const [showCutContent, setShowCutContent] = useState(false);
  const [pageSize, setPageSize] = useState<(typeof itemPageSizes)[number]>(15);
  const [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [highlightKey, setHighlightKey] = useState<string>();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState<string>();
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [controlBarOpen, setControlBarOpen] = useState(() => new URLSearchParams(location.search).has('panel'));
  const [controlPanel, setControlPanel] = useState<'save' | 'items'>(() => (
    readControlPanel('items') === 'save' ? 'save' : 'items'
  ));
  const enabledContentPacks = useMemo(() => new Set<ItemContentPack>([
    'base',
    ...(preferences.showShadowOfTheErdtreeItems ? ['shadow-of-the-erdtree' as const] : []),
    ...(preferences.showTarnishedPackItems ? ['tarnished-pack' as const] : []),
  ]), [preferences.showShadowOfTheErdtreeItems, preferences.showTarnishedPackItems]);

  useEffect(() => {
    const controller = new AbortController();
    setDataset(undefined);
    setError(undefined);
    void loadItemDataset(locale, controller.signal)
      .then(setDataset)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '无法加载物品数据');
      });
    return () => controller.abort();
  }, [locale]);

  const items = useMemo(
    () => dataset?.items.filter((item) => (
      item.categoryPath.includes(selectedLeaf)
      && enabledContentPacks.has(item.contentPack)
      && (showCutContent || item.isCutContent !== true)
    )) ?? [],
    [dataset, enabledContentPacks, selectedLeaf, showCutContent],
  );
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = items.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = pageItems.find((item) => item.key === selectedKey) ?? pageItems[0];
  const searchResults = useMemo(
    () => dataset && submittedQuery !== undefined
      ? searchItems(dataset, submittedQuery, { includeCutContent: showCutContent, contentPacks: enabledContentPacks })
      : undefined,
    [dataset, enabledContentPacks, showCutContent, submittedQuery],
  );

  useEffect(() => {
    setPage(0);
    setSelectedKey(undefined);
  }, [selectedLeaf, showCutContent, pageSize, preferences.showShadowOfTheErdtreeItems, preferences.showTarnishedPackItems]);

  useEffect(() => {
    if (!highlightKey) return;
    const itemIndex = items.findIndex((item) => item.key === highlightKey);
    if (itemIndex < 0) return;
    setPage(Math.floor(itemIndex / pageSize));
    setSelectedKey(highlightKey);
    const timeout = window.setTimeout(() => rowRefs.current.get(highlightKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    const clear = window.setTimeout(() => setHighlightKey(undefined), 1800);
    return () => { window.clearTimeout(timeout); window.clearTimeout(clear); };
  }, [highlightKey, items, pageSize]);

  const updateLocale = (value: string) => {
    const next = { ...preferences, locale: value };
    setPreferences(next);
    browserSettingsStore.savePreferences(next);
  };

  const selectCategory = (value: string) => {
    setSelectedLeaf(value);
    const next = { ...preferences, itemCategory: value };
    setPreferences(next);
    browserSettingsStore.savePreferences(next);
  };

  const toggleCategory = (value: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const selectSearchResult = (item: ItemEntry) => {
    selectCategory(item.categoryPath.at(-1) ?? 'melee');
    setExpandedCategories((current) => new Set([...current, ...item.categoryPath]));
    setSelectedKey(item.key);
    setHighlightKey(item.key);
  };

  return (
    <main className="item-page">
      <ControlBar
        page="items"
        panel={controlPanel}
        open={controlBarOpen}
        status="官方物品参数与文本"
        localePreference={preferences.locale}
        interfaceLocale={locale}
        onOpenChange={setControlBarOpen}
        onPanelChange={(panel) => {
          if (panel === 'save' || panel === 'items') setControlPanel(panel);
          setControlBarOpen(true);
        }}
        onLocaleChange={updateLocale}
      >
        {controlPanel === 'save' ? (
          <DatabaseSavePanel
            preferences={preferences}
            onPreferencesChange={(next) => {
              setPreferences(next);
              browserSettingsStore.savePreferences(next);
            }}
          />
        ) : (
          <section className="item-control-panel" aria-label="物品数据筛选">
            <div className="item-content-pack-toggles" aria-label="物品内容包">
              <label>
                <input
                  type="checkbox"
                  checked={preferences.showShadowOfTheErdtreeItems}
                  onChange={(event) => {
                    const next = { ...preferences, showShadowOfTheErdtreeItems: event.target.checked };
                    setPreferences(next);
                    browserSettingsStore.savePreferences(next);
                  }}
                />
                <span>显示黄金树幽影的物品</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.showTarnishedPackItems}
                  onChange={(event) => {
                    const next = { ...preferences, showTarnishedPackItems: event.target.checked };
                    setPreferences(next);
                    browserSettingsStore.savePreferences(next);
                  }}
                />
                <span>显示褪色者组合包的物品</span>
              </label>
            </div>
            <div className="control-panel-heading">
              <span className="eyebrow">物品数据</span>
              <strong>搜索与分类</strong>
            </div>
            <form className="item-search-toolbar" onSubmit={(event) => {
              event.preventDefault();
              const value = query.trim();
              if (value) setSubmittedQuery(value);
            }}>
              <label htmlFor="item-search">搜索物品</label>
              <div>
                <input id="item-search" type="search" value={query} placeholder="名称或 Param ID" onChange={(event) => setQuery(event.target.value)} />
                <button type="submit">搜索</button>
                {submittedQuery !== undefined && <button type="button" onClick={() => setSubmittedQuery(undefined)}>退出搜索</button>}
              </div>
            </form>
            {dataset && searchResults !== undefined && (
              <section className="item-search-results" aria-label="物品搜索结果">
                <div><strong>{searchResults.length.toLocaleString(locale)}</strong><span> 个结果；选择后定位到所属分类。</span></div>
                <div>
                  {searchResults.slice(0, 300).map((item) => (
                    <button type="button" key={item.key} onClick={() => selectSearchResult(item)}>
                      <ItemIcon dataset={dataset} item={item} />
                      <span><strong>{localizedItemName(dataset, item)}</strong><small>{item.isCutContent ? '已删减 · ' : ''}{categoryPathLabel(item)} · #{item.id}</small></span>
                    </button>
                  ))}
                </div>
                {searchResults.length > 300 && <small>当前显示前 300 项，请增加关键词缩小范围。</small>}
              </section>
            )}
            <nav className="item-category-tree" aria-label="物品分类">
              {categoryTree.map((node) => (
                <CategoryBranch
                  key={node.id}
                  node={node}
                  selectedLeaf={selectedLeaf}
                  expandedCategories={expandedCategories}
                  onSelect={selectCategory}
                  onToggle={toggleCategory}
                />
              ))}
            </nav>
            <label className="item-cut-content-toggle">
              <input type="checkbox" checked={showCutContent} onChange={(event) => setShowCutContent(event.target.checked)} />
              <span>显示已删减内容</span>
            </label>
          </section>
        )}
      </ControlBar>

      <section className="item-database-content">
        <div className="database-title item-database-title">
          <span className="eyebrow">官方参数与文本 · {formatGameRelease(dataset?.gameRelease)}</span>
          <h1>物品数据</h1>
          <p>从控制栏搜索名称或 Param ID、切换树形分类；列表和详细参数保留在主页面。</p>
        </div>

        {error && <section className="database-error"><strong>物品数据尚不可用</strong><p>{error}</p></section>}

        {dataset && (
          <>
            <div className="item-browser">
              <section className="item-list-panel" aria-label="物品列表">
                <header>
                  <span>{categoryLabels.get(selectedLeaf)}</span>
                  <div>
                    <label>每页
                      <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value) as (typeof itemPageSizes)[number])}>
                        {itemPageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <strong>{items.length.toLocaleString(locale)}</strong>
                  </div>
                </header>
                <div className="item-list">
                  {pageItems.map((item) => (
                    <button
                      ref={(element) => { if (element) rowRefs.current.set(item.key, element); else rowRefs.current.delete(item.key); }}
                      className={`${selected?.key === item.key ? 'selected ' : ''}${highlightKey === item.key ? 'highlight' : ''}`.trim()}
                      type="button"
                      key={item.key}
                      onClick={() => setSelectedKey(item.key)}
                    >
                      <ItemIcon dataset={dataset} item={item} />
                      <span><strong>{localizedItemName(dataset, item)}</strong><small>{item.isCutContent ? '已删减 · ' : ''}{kindLabels[item.kind]} · #{item.id}</small></span>
                    </button>
                  ))}
                </div>
                <footer className="item-list-footer">
                  <span>{items.length === 0 ? '0' : `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, items.length)}`} / {items.length.toLocaleString(locale)}</span>
                  <div className="pagination">
                    <button type="button" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); setSelectedKey(undefined); }}>上一页</button>
                    <span>{currentPage + 1} / {pageCount}</span>
                    <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => { setPage(currentPage + 1); setSelectedKey(undefined); }}>下一页</button>
                  </div>
                </footer>
              </section>

              <section className="item-detail-panel" aria-label="物品详细信息">
                {selected ? <ItemDetails dataset={dataset} item={selected} /> : <p className="database-empty">该分类没有物品。</p>}
              </section>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function CategoryBranch({ node, selectedLeaf, expandedCategories, onSelect, onToggle }: {
  node: CategoryNode;
  selectedLeaf: string;
  expandedCategories: ReadonlySet<string>;
  onSelect(value: string): void;
  onToggle(value: string): void;
}) {
  if (!node.children) {
    return <button type="button" className={selectedLeaf === node.id ? 'active' : ''} onClick={() => onSelect(node.id)}>{node.label}</button>;
  }
  const expanded = expandedCategories.has(node.id);
  return (
    <div className="item-category-branch">
      <div className="item-category-branch-row">
        <button
          className={`item-category-arrow${expanded ? ' expanded' : ''}`}
          type="button"
          aria-label={`${expanded ? '收起' : '展开'}${node.label}`}
          aria-expanded={expanded}
          onClick={() => onToggle(node.id)}
        >›</button>
        <button type="button" className={selectedLeaf === node.id ? 'active' : ''} onClick={() => onSelect(node.id)}>{node.label}</button>
      </div>
      {expanded && <div className="item-category-children">{node.children.map((child) => (
        <CategoryBranch
          key={child.id}
          node={child}
          selectedLeaf={selectedLeaf}
          expandedCategories={expandedCategories}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}</div>}
    </div>
  );
}

function ItemIcon({ dataset, item, large = false, detail = false }: {
  dataset: ItemDataset; item: ItemEntry; large?: boolean; detail?: boolean;
}) {
  const url = itemIconUrl(dataset, item, large ? 'large' : 'small');
  const sizeClass = large ? ' large' : detail ? ' detail' : '';
  return (
    <span className={`item-icon-frame${sizeClass}`}>
      {url
        ? <img className="item-icon" src={url} alt="" loading={large ? 'eager' : 'lazy'} decoding="async" />
        : <span className="item-icon placeholder">◇</span>}
    </span>
  );
}

function ItemDetails({ dataset, item }: { dataset: ItemDataset; item: ItemEntry }) {
  const [upgrade, setUpgrade] = useState(0);
  const [largeImageOpen, setLargeImageOpen] = useState(false);
  const text = dataset.texts[item.key] ?? {};
  const maxUpgrade = item.kind === 'weapon' ? weaponUpgradeMaximum(dataset, item) : 0;

  useEffect(() => { setUpgrade(0); setLargeImageOpen(false); }, [item.key]);

  return (
    <article className="item-details">
      <header>
        <button className="item-detail-icon-button" type="button" onClick={() => setLargeImageOpen(true)} aria-label="查看物品大图">
          <ItemIcon dataset={dataset} item={item} detail />
        </button>
        <span><small>{categoryPathLabel(item)}</small><h1>{localizedItemName(dataset, item)}</h1><code>#{item.id}</code></span>
      </header>
      {item.kind !== 'information' && item.kind !== 'gesture' && (
        <>
          {item.kind === 'weapon' && (
            <WeaponDetails dataset={dataset} item={item} text={text} upgrade={upgrade} maxUpgrade={maxUpgrade} onUpgrade={setUpgrade} />
          )}
          {item.kind === 'armor' && <ArmorDetails dataset={dataset} item={item} text={text} />}
          {item.kind === 'talisman' && <TalismanDetails dataset={dataset} item={item} text={text} />}
          {(item.kind === 'goods' || item.kind === 'material' || item.kind === 'upgrade-material' || item.kind === 'key-item' || item.kind === 'crystal-tear') && (
            <GoodsDetails dataset={dataset} item={item} text={text} />
          )}
          {item.kind === 'spirit-ash' && <SpiritAshDetails dataset={dataset} item={item} text={text} />}
          {(item.kind === 'sorcery' || item.kind === 'incantation') && <MagicDetails dataset={dataset} item={item} text={text} />}
          {item.kind === 'ash-of-war' && <AshOfWarDetails dataset={dataset} item={item} text={text} />}
        </>
      )}
      {item.kind !== 'gesture' && <ItemDescription text={text} />}
      {item.kind === 'gesture' && <p className="item-gesture-note">游戏资源只为该肢体动作提供名称与图标。</p>}
      {largeImageOpen && (
        <div className="item-image-lightbox" role="dialog" aria-modal="true" aria-label={`${localizedItemName(dataset, item)}大图`} onClick={() => setLargeImageOpen(false)}>
          <button type="button" aria-label="关闭大图" onClick={() => setLargeImageOpen(false)}>×</button>
          <div onClick={(event) => event.stopPropagation()}><ItemIcon dataset={dataset} item={item} large /></div>
        </div>
      )}
    </article>
  );
}

function WeaponDetails({ dataset, item, text, upgrade, maxUpgrade, onUpgrade }: {
  dataset: ItemDataset; item: ItemEntry; text: ItemText; upgrade: number; maxUpgrade: number; onUpgrade(value: number): void;
}) {
  const params = item.params;
  const reinforceType = numberParam(params, 'reinforceTypeId');
  const rates = dataset.reinforcements[String(reinforceType + upgrade)] ?? {};
  const scale = (key: string, rateKey: string) => numberParam(params, key) * numberParam(rates, rateKey, 1) / 100;
  const attack = (key: string, rateKey: string) => Math.round(numberParam(params, key) * numberParam(rates, rateKey, 1));
  const guard = (key: string, rateKey: string) => numberParam(params, key) * numberParam(rates, rateKey, 1);
  const scaling = [
    ['力气', 'correctStrength', 'correctStrengthRate'], ['灵巧', 'correctAgility', 'correctAgilityRate'],
    ['智力', 'correctMagic', 'correctMagicRate'], ['信仰', 'correctFaith', 'correctFaithRate'], ['感应', 'correctLuck', 'correctLuckRate'],
  ] as const;
  const requirements = [
    ['力气', 'properStrength'], ['灵巧', 'properAgility'], ['智力', 'properMagic'], ['信仰', 'properFaith'], ['感应', 'properLuck'],
  ] as const;
  return (
    <div className="item-stat-sections">
      <section className="item-primary-facts">
        <strong>{weaponTypeLabels[numberParam(params, 'wepType')] ?? '武器'}</strong>
        <span>重量 {formatNumber(params.weight)}</span>
        <span>战技 {text.skillName ?? '—'}</span>
        {maxUpgrade > 0 && <label>强化预览<select value={upgrade} onChange={(event) => onUpgrade(Number(event.target.value))}>{Array.from({ length: maxUpgrade + 1 }, (_, level) => <option key={level} value={level}>+{level}</option>)}</select></label>}
      </section>
      <StatSection title="攻击力" values={[
        ['物理', attack('attackBasePhysics', 'physicsAtkRate')], ['魔力', attack('attackBaseMagic', 'magicAtkRate')],
        ['火', attack('attackBaseFire', 'fireAtkRate')], ['雷', attack('attackBaseThunder', 'thunderAtkRate')],
        ['圣', attack('attackBaseDark', 'darkAtkRate')], ['致命一击', params.attackBaseParry],
      ]} />
      <StatSection title="防御时减伤率" values={[
        ['物理', guard('physGuardCutRate', 'physicsGuardCutRate')], ['魔力', guard('magGuardCutRate', 'magicGuardCutRate')],
        ['火', guard('fireGuardCutRate', 'fireGuardCutRate')], ['雷', guard('thunGuardCutRate', 'thunderGuardCutRate')],
        ['圣', guard('darkGuardCutRate', 'darkGuardCutRate')], ['防御强度', guard('staminaGuardDef', 'staminaGuardDefRate')],
      ]} />
      <StatSection title="能力加成" values={scaling.map(([label, key, rate]) => [label, scalingValue(scale(key, rate))])} />
      <StatSection title="必须能力值" values={requirements.map(([label, key]) => [label, numberParam(params, key)])} />
      <EffectSection dataset={dataset} item={item} text={text} />
      <p className="item-provenance-note">攻击力显示当前强化等级的官方基础值；人物属性补正部分会在角色装备联动解析完成后加入。</p>
    </div>
  );
}

function ArmorDetails({ dataset, item, text }: { dataset: ItemDataset; item: ItemEntry; text: ItemText }) {
  const p = item.params;
  const reduction = (key: string) => (1 - numberParam(p, key, 1)) * 100;
  return <div className="item-stat-sections">
    <section className="item-primary-facts"><strong>{kindLabels[item.kind]}</strong><span>重量 {formatNumber(p.weight)}</span></section>
    <StatSection title="减伤率" values={[
      ['物理', reduction('neutralDamageCutRate')], ['抗打击', reduction('blowDamageCutRate')], ['抗斩击', reduction('slashDamageCutRate')],
      ['抗突刺', reduction('thrustDamageCutRate')], ['魔力', reduction('magicDamageCutRate')], ['火', reduction('fireDamageCutRate')],
      ['雷', reduction('thunderDamageCutRate')], ['圣', reduction('darkDamageCutRate')],
    ]} />
    <StatSection title="抵抗力" values={[
      ['免疫力', numberParam(p, 'resistPoison')], ['健壮度', numberParam(p, 'resistBlood')], ['理智度', numberParam(p, 'resistSleep')],
      ['抗死度', numberParam(p, 'resistCurse')], ['强韧度', numberParam(p, 'toughnessCorrectRate')],
    ]} />
    <EffectSection dataset={dataset} item={item} text={text} />
  </div>;
}

function TalismanDetails({ dataset, item, text }: { dataset: ItemDataset; item: ItemEntry; text: ItemText }) {
  return <div className="item-stat-sections"><section className="item-primary-facts"><strong>护符</strong><span>重量 {formatNumber(item.params.weight)}</span></section><EffectSection dataset={dataset} item={item} text={text} /></div>;
}

function GoodsDetails({ dataset, item, text }: { dataset: ItemDataset; item: ItemEntry; text: ItemText }) {
  const p = item.params;
  return <div className="item-stat-sections">
    <section className="item-primary-facts"><strong>{kindLabels[item.kind]}</strong><span>持有上限 {formatNumber(p.maxNum)}</span><span>收纳上限 {formatNumber(p.maxRepositoryNum)}</span>{numberParam(p, 'consumeMP') > 0 && <span>消耗专注值 {formatNumber(p.consumeMP)}</span>}</section>
    <EffectSection dataset={dataset} item={item} text={text} />
  </div>;
}

function SpiritAshDetails({ dataset, item, text }: { dataset: ItemDataset; item: ItemEntry; text: ItemText }) {
  const p = item.params;
  return <div className="item-stat-sections"><section className="item-primary-facts"><strong>骨灰</strong><span>持有上限 {formatNumber(p.maxNum)}</span><span>收纳上限 {formatNumber(p.maxRepositoryNum)}</span><span>消耗血量 {numberParam(p, 'consumeHP') > 0 ? formatNumber(p.consumeHP) : '—'}</span><span>消耗专注值 {numberParam(p, 'consumeMP') > 0 ? formatNumber(p.consumeMP) : '—'}</span></section><EffectSection dataset={dataset} item={item} text={text} /></div>;
}

function MagicDetails({ dataset, item, text }: { dataset: ItemDataset; item: ItemEntry; text: ItemText }) {
  const p = item.params;
  return <div className="item-stat-sections">
    <section className="item-primary-facts"><strong>{kindLabels[item.kind]}</strong><span>持有上限 {formatNumber(p.maxNum)}</span><span>收纳上限 {formatNumber(p.maxRepositoryNum)}</span><span>消耗专注值 {formatNumber(p.mp)}</span><span>使用空格 {formatNumber(p.slotLength)}</span></section>
    <StatSection title="必须能力值" values={[["智力", p.requirementIntellect], ["信仰", p.requirementFaith], ["感应", p.requirementLuck]]} />
    <EffectSection dataset={dataset} item={item} text={text} />
  </div>;
}

function AshOfWarDetails({ dataset, item, text }: { dataset: ItemDataset; item: ItemEntry; text: ItemText }) {
  return <div className="item-stat-sections"><section className="item-primary-facts"><strong>战灰</strong><span>战技 {text.skillName ?? '—'}</span></section><EffectSection dataset={dataset} item={item} text={text} /></div>;
}

function EffectSection({ dataset, item, text }: { dataset: ItemDataset; item: ItemEntry; text: ItemText }) {
  const summaries = itemEffectIds(item).flatMap((effectId) => summarizeSpEffect(dataset.spEffects[String(effectId)], effectId));
  const textEffects = [text.info, text.info2, ...(text.effects ?? [])].filter((value): value is string => Boolean(value));
  if (summaries.length === 0 && textEffects.length === 0) return null;
  return <section className="item-effects"><h2>附加效果／道具效用</h2><ul>{textEffects.map((value) => <li key={value}>{value}</li>)}{summaries.map((value) => <li className="numeric-effect" key={value}>{value}</li>)}</ul></section>;
}

function ItemDescription({ text }: { text: ItemText }) {
  return <div className="item-description-view"><div>{text.caption && <p>{text.caption}</p>}{text.skillCaption && <p>{text.skillCaption}</p>}{!text.caption && !text.skillCaption && <p>该条目没有可用的游戏内详细说明。</p>}</div></div>;
}

function StatSection({ title, values }: { title: string; values: Array<readonly [string, ItemParamValue]> }) {
  return <section className="item-stat-group"><h2>{title}</h2><dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatNumber(value)}</dd></div>)}</dl></section>;
}

function weaponUpgradeMaximum(dataset: ItemDataset, item: ItemEntry): number {
  const base = numberParam(item.params, 'reinforceTypeId');
  let level = 0;
  while (level < 25 && dataset.reinforcements[String(base + level + 1)]) level += 1;
  return level;
}

function summarizeSpEffect(effect: Record<string, ItemParamValue> | undefined, effectId: number): string[] {
  if (!effect) return [];
  const summaries: string[] = [];
  const points = [
    ['力气', 'changeStrengthPoint'], ['灵巧', 'changeAgilityPoint'], ['智力', 'changeMagicPoint'], ['信仰', 'changeFaithPoint'], ['感应', 'changeLuckPoint'],
  ] as const;
  for (const [label, key] of points) {
    const value = numberParam(effect, key);
    if (value) summaries.push(`${label} ${signed(value)}`);
  }
  const rates = [
    ['最大血量', 'maxHpRate'], ['最大专注值', 'maxMpRate'], ['最大精力', 'maxStaminaRate'],
    ['物理攻击力', 'physicsAttackPowerRate'], ['魔力攻击力', 'magicAttackPowerRate'], ['火攻击力', 'fireAttackPowerRate'],
    ['雷攻击力', 'thunderAttackPowerRate'], ['圣攻击力', 'darkAttackPowerRate'],
  ] as const;
  for (const [label, key] of rates) {
    const value = numberParam(effect, key, 1);
    if (Math.abs(value - 1) > 0.0001) summaries.push(`${label} ${signed((value - 1) * 100)}%`);
  }
  const duration = numberParam(effect, 'effectEndurance');
  if (duration > 0) summaries.push(`持续时间 ${formatNumber(duration)} 秒`);
  return summaries.map((summary) => `${summary}（SpEffect ${effectId}）`);
}

function scalingValue(value: number): string {
  if (value <= 0) return '—';
  const grade = value >= 1.75 ? 'S' : value >= 1.4 ? 'A' : value >= .9 ? 'B' : value >= .6 ? 'C' : value >= .25 ? 'D' : 'E';
  return `${grade} · ${value.toFixed(3)}`;
}

function numberParam(values: Record<string, ItemParamValue>, key: string, fallback = 0): number {
  const value = values[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatNumber(value: ItemParamValue | undefined): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (typeof value === 'string' && value) return value;
  return '—';
}

function signed(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded >= 0 ? `+${rounded}` : String(rounded);
}

function categoryPathLabel(item: ItemEntry): string {
  return item.categoryPath.map((id) => categoryLabels.get(id) ?? id).join(' / ');
}

function collectCategoryLabels(node: CategoryNode): void {
  categoryLabels.set(node.id, node.label);
  node.children?.forEach(collectCategoryLabels);
}

function armorEffectLeaves(slot: string): CategoryNode[] {
  return [
    { id: `${slot}-special-effect`, label: '有特殊效果' },
    { id: `${slot}-no-special-effect`, label: '无特殊效果' },
  ];
}

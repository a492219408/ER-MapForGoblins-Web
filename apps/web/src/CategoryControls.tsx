import { useMemo, useState } from 'react';
import { filterCategoryDefinitions } from './category-filter';
import {
  localizedText,
  type CategoryCatalog,
  type MarkerCategoryDefinition,
} from './dataset';
import type { CategoryMapCount } from './map-discovery';
import { resolveCategoryMapCount } from './category-map-count';
interface CategoryControlsProps {
  catalog: CategoryCatalog;
  locale: string;
  visibleCategories: ReadonlySet<string>;
  mapCounts?: ReadonlyMap<string, CategoryMapCount>;
  onCategoryVisibility(categoryId: string, visible: boolean): void;
  onSectionVisibility(sectionId: string, visible: boolean): void;
  onShowAll(): void;
  onHideAll(): void;
}

export function CategoryControls({
  catalog,
  locale,
  visibleCategories,
  mapCounts,
  onCategoryVisibility,
  onSectionVisibility,
  onShowAll,
  onHideAll,
}: CategoryControlsProps) {
  const [query, setQuery] = useState('');
  const filteredCategories = useMemo(
    () => filterCategoryDefinitions(catalog.categories, query, locale),
    [catalog.categories, locale, query],
  );
  const sectionLabels = useMemo(
    () => new Map(catalog.sections.map((section) => [section.id, localizedText(section.labels, locale)])),
    [catalog.sections, locale],
  );
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const visibleCount = catalog.categories.filter((category) => visibleCategories.has(category.id)).length;
  const searching = query.trim().length > 0;

  const renderCategory = (category: MarkerCategoryDefinition) => {
    const count = resolveCategoryMapCount(category.id, category.markerCount, mapCounts);
    const countLabel = `${numberFormat.format(count.visible)}${count.collectedOutside > 0 ? `(+${numberFormat.format(count.collectedOutside)})` : ''}`;
    return (
    <label className="category-row" key={category.id}>
      <span className="category-row-copy">
        <strong>{localizedText(category.labels, locale)}</strong>
        <small>{localizedText(category.descriptions, locale)}</small>
      </span>
      <span className="category-row-meta">
        <small title={count.collectedOutside > 0 ? '括号内为未揭示地区中已经完成的标记' : undefined}>{countLabel}</small>
        <input
          type="checkbox"
          checked={visibleCategories.has(category.id)}
          onChange={(event) => onCategoryVisibility(category.id, event.target.checked)}
        />
      </span>
    </label>
    );
  };

  return (
    <section className="category-controls" aria-label="地图标记分类">
      <div className="category-controls-heading">
        <span>
          <small>{catalog.profile === 'vanilla' ? '原版地图分类' : `${catalog.profile.toUpperCase()} 地图分类`}</small>
          <strong>{visibleCount} / {catalog.categories.length} 已显示</strong>
        </span>
      </div>

      <label className="category-search">
        <span>搜索分类</span>
        <input
          type="search"
          value={query}
          placeholder="名称、说明或技术标识"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="drawer-actions">
        <button type="button" onClick={onShowAll}>全部显示</button>
        <button type="button" onClick={onHideAll}>全部隐藏</button>
      </div>

      {searching ? (
        <div className="category-search-results">
          <small>找到 {filteredCategories.length} 个分类</small>
          <div className="category-list">
            {filteredCategories.map(renderCategory)}
          </div>
          {filteredCategories.length === 0 && <p>没有匹配的地图分类。</p>}
        </div>
      ) : (
        <div className="category-sections">
          {catalog.sections.map((section) => {
            const categories = catalog.categories.filter((category) => category.section === section.id);
            const visibleInSection = categories.filter((category) => visibleCategories.has(category.id)).length;
            return (
              <details className="category-section" key={section.id}>
                <summary>
                  <span>{sectionLabels.get(section.id) ?? section.id}</span>
                  <small>{visibleInSection} / {categories.length}</small>
                </summary>
                <div className="category-section-actions">
                  <button type="button" onClick={() => onSectionVisibility(section.id, true)}>本组全选</button>
                  <button type="button" onClick={() => onSectionVisibility(section.id, false)}>本组清空</button>
                </div>
                <div className="category-list">{categories.map(renderCategory)}</div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

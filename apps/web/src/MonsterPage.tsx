import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { browserSettingsStore } from './settings-store';
import { resolveGameLocale } from './game-locales';
import { ControlBar } from './ControlBar';
import { DatabaseSavePanel } from './DatabaseSavePanel';
import { readControlPanel } from './control-bar-state';
import {
  loadMonsterDataset,
  localizedMonsterLocation,
  localizedMonsterName,
  searchMonsters,
  type DlcCompletionEffect,
  type MonsterDataset,
  type MonsterEntry,
  type MonsterStatValue,
  type MultiplayerCorrection,
  type ResistanceCorrection,
} from './monster-data';
import { formatGameRelease } from './game-release';

const PAGE_SIZE = 100;
const damageTypeLabels = ['物理', '魔力', '火焰', '雷电', '圣'];
const resistanceLabels = ['中毒', '猩红腐败', '出血', '冻伤', '催眠', '发狂', '死亡'];
const flagLabels = {
  void: '虚空属性',
  thoseWhoLiveInDeath: '死诞者',
  ancientDragon: '古龙',
  dragonOrWyrm: '龙／土龙',
  calculatePvpDamage: '使用 PvP 伤害计算',
} as const;
const summaryFieldIds = [
  'health',
  'defensePhysical',
  'defenseMagic',
  'negationPhysical',
  'negationMagic',
  'resistancePoison',
  'resistanceRot',
  'resistanceBleed',
  'resistanceFrost',
];

export function MonsterPage() {
  const [dataset, setDataset] = useState<MonsterDataset>();
  const [error, setError] = useState<string>();
  const [preferences, setPreferences] = useState(() => browserSettingsStore.loadPreferences());
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string>();
  const [controlBarOpen, setControlBarOpen] = useState(() => new URLSearchParams(location.search).has('panel'));
  const [controlPanel, setControlPanel] = useState<'save' | 'monsters'>(() => (
    readControlPanel('monsters') === 'save' ? 'save' : 'monsters'
  ));
  const locale = resolveGameLocale(preferences.locale);

  useEffect(() => {
    const controller = new AbortController();
    void loadMonsterDataset(controller.signal)
      .then((loaded) => {
        setDataset(loaded);
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '无法加载怪物数据');
      });
    return () => controller.abort();
  }, []);

  const updatePreferences = (patch: Partial<typeof preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      browserSettingsStore.savePreferences(next);
      return next;
    });
  };

  const filtered = useMemo(
    () => dataset ? searchMonsters(dataset.enemies, deferredQuery) : [],
    [dataset, deferredQuery],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const cycleIndex = dataset ? Math.min(preferences.monsterCycle, dataset.cycles.length - 1) : 0;
  const fieldIndexes = useMemo(
    () => dataset ? new Map(dataset.fields.map((field, index) => [field.id, index])) : new Map<string, number>(),
    [dataset],
  );
  const dlcEffects = useMemo(
    () => new Map(dataset?.dlcCompletionEffects.map((effect) => [effect.spEffectId, effect]) ?? []),
    [dataset],
  );
  const multiplayerCorrections = useMemo(
    () => new Map(dataset?.multiplayerCorrections.map((correction) => [correction.id, correction]) ?? []),
    [dataset],
  );
  const resistanceCorrections = useMemo(
    () => new Map(dataset?.resistanceCorrections.map((correction) => [correction.id, correction]) ?? []),
    [dataset],
  );

  useEffect(() => setPage(0), [deferredQuery]);

  return (
    <main className="monster-page">
      <ControlBar
        page="monsters"
        panel={controlPanel}
        open={controlBarOpen}
        status={`怪物数据库 · ${formatGameRelease(dataset?.gameRelease)}`}
        localePreference={preferences.locale}
        interfaceLocale={locale}
        onOpenChange={setControlBarOpen}
        onPanelChange={(panel) => {
          if (panel === 'save' || panel === 'monsters') setControlPanel(panel);
          setControlBarOpen(true);
        }}
        onLocaleChange={(value) => updatePreferences({ locale: value })}
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
          <section className="database-control-panel" aria-label="怪物数据筛选">
            <div className="control-panel-heading">
              <span className="eyebrow">怪物数据</span>
              <strong>搜索与数值补正</strong>
            </div>
            <label className="monster-search">
              <span>搜索</span>
              <input
                type="search"
                value={query}
                placeholder="例如：玛莲妮亚、Malenia、宁姆格福、38001940"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span>本体周目</span>
              <select
                value={cycleIndex}
                disabled={!dataset}
                onChange={(event) => updatePreferences({ monsterCycle: Number(event.target.value) })}
              >
                {dataset?.cycles.map((cycle, index) => <option key={cycle.id} value={index}>{cycle.label}</option>)}
              </select>
            </label>
            <label>
              <span>DLC 上一周目状态</span>
              <select
                value={preferences.monsterDlcCompleted ? 'completed' : 'not-completed'}
                onChange={(event) => updatePreferences({ monsterDlcCompleted: event.target.value === 'completed' })}
              >
                <option value="not-completed">未击败约定之王</option>
                <option value="completed">已击败约定之王</option>
              </select>
            </label>
            <div className="database-result-count">
              <strong>{filtered.length.toLocaleString(locale)}</strong>
              <span>/ {dataset?.enemyCount.toLocaleString(locale) ?? '—'} 条</span>
            </div>
          </section>
        )}
      </ControlBar>

      <section className="database-content">
        <div className="database-title">
          <span className="eyebrow">PvE 参数索引 · {formatGameRelease(dataset?.gameRelease)}</span>
          <h1>怪物数据</h1>
          <p>按名称、区域或 NpcParam ID 搜索；周目数值来自参考表逐档结果，不对 NG+8 及以后进行外推。</p>
        </div>

        {error && (
          <section className="database-error" role="alert">
            <strong>怪物数据尚不可用</strong>
            <p>{error}</p>
          </section>
        )}

        {dataset && (
          <>
            <section className="parameter-evidence">
              <article>
                <strong>周目：逐档参数</strong>
                <p>`ClearCountCorrectParam` 定义 NG 至 NG+7 的独立补正行，因此这里按表选择，不用拟合算法。</p>
              </article>
              <article>
                <strong>DLC：一次性补正</strong>
                <p>`NpcParam.dlcGameClearSpEffectID` 只在上一周目击败约定之王后应用一次；不会随 DLC 通关次数继续叠加，也不作用于没有该 ID 的本体敌人。</p>
              </article>
              <article>
                <strong>地区：会影响生命值</strong>
                <p>敌人 NpcParam 的常驻地区 SpEffect（7000 系列等）会改变生命值与其他数值；因此同模型在不同区域可拥有不同记录和 ID。</p>
              </article>
            </section>

            <div className="monster-table-shell">
              <table className="monster-table">
                <thead>
                  <tr>
                    <th>名称 / NpcParam</th>
                    <th>区域</th>
                    {summaryFieldIds.map((fieldId) => (
                      <th key={fieldId}>{dataset.fields[fieldIndexes.get(fieldId) ?? -1]?.label ?? fieldId}</th>
                    ))}
                    <th>DLC 通关伤害</th>
                    <th><span className="sr-only">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((enemy) => (
                    <MonsterRows
                      key={enemy.key}
                      dataset={dataset}
                      enemy={enemy}
                      locale={locale}
                      cycleIndex={cycleIndex}
                      fieldIndexes={fieldIndexes}
                      dlcEffect={enemy.dlcCompletionSpEffectId ? dlcEffects.get(enemy.dlcCompletionSpEffectId) : undefined}
                      multiplayerCorrection={enemy.multiPlayCorrectionId != null ? multiplayerCorrections.get(enemy.multiPlayCorrectionId) : undefined}
                      resistanceCorrections={resistanceCorrections}
                      applyDlcCompletion={preferences.monsterDlcCompleted}
                      expanded={expandedKey === enemy.key}
                      onToggle={() => setExpandedKey((current) => current === enemy.key ? undefined : enemy.key)}
                    />
                  ))}
                </tbody>
              </table>
              {visible.length === 0 && <p className="database-empty">没有匹配的怪物。</p>}
            </div>

            <footer className="database-footer">
              <p>
                数值与默认英文名称来自 {dataset.source.fileName}（游戏版本 {dataset.source.applicationVersion ?? '未知'}）；
                官方名称、地区和 NpcParam 映射已由 {formatGameRelease(dataset.gameRelease)} 资源重建；
                当前有 {dataset.localization.nameRows.toLocaleString(locale)} 条记录的名称和 {dataset.localization.locationRows.toLocaleString(locale)} 条记录的地区
                已精确或局部接入 {dataset.localization.locales.length} 种游戏官方 FMG 文本。无法可靠关联的内容保留默认英文，不猜测翻译。
              </p>
              <div className="pagination">
                <button type="button" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>上一页</button>
                <span>{currentPage + 1} / {pageCount}</span>
                <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>下一页</button>
              </div>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}

interface MonsterRowsProps {
  dataset: MonsterDataset;
  enemy: MonsterEntry;
  locale: string;
  cycleIndex: number;
  fieldIndexes: ReadonlyMap<string, number>;
  dlcEffect?: DlcCompletionEffect;
  multiplayerCorrection?: MultiplayerCorrection;
  resistanceCorrections: ReadonlyMap<number, ResistanceCorrection>;
  applyDlcCompletion: boolean;
  expanded: boolean;
  onToggle(): void;
}

function MonsterRows({
  dataset,
  enemy,
  locale,
  cycleIndex,
  fieldIndexes,
  dlcEffect,
  multiplayerCorrection,
  resistanceCorrections,
  applyDlcCompletion,
  expanded,
  onToggle,
}: MonsterRowsProps) {
  const values = enemy.cycles[cycleIndex];
  const name = localizedMonsterName(enemy, locale);
  const location = localizedMonsterLocation(enemy, locale);
  const damageSummary = applyDlcCompletion && dlcEffect
    ? uniformMultiplier(dlcEffect.damageMultipliers)
    : undefined;
  return (
    <>
      <tr className={expanded ? 'expanded' : undefined}>
        <td>
          <strong>{name}</strong>
          <small>{name === enemy.name ? enemy.id : `${enemy.name} · ${enemy.id}`}</small>
        </td>
        <td>
          <span>{location}</span>
          {location !== enemy.location && <small>{enemy.location}</small>}
        </td>
        {summaryFieldIds.map((fieldId) => (
          <td key={fieldId}>{formatStat(values[fieldIndexes.get(fieldId) ?? -1])}</td>
        ))}
        <td title={dlcEffect ? `SpEffect ${dlcEffect.spEffectId}` : '该敌人没有 DLC 通关补正'}>
          {applyDlcCompletion ? (damageSummary ? `×${formatStat(damageSummary)}` : dlcEffect ? '多属性' : '—') : '未应用'}
        </td>
        <td><button className="detail-button" type="button" aria-expanded={expanded} onClick={onToggle}>{expanded ? '收起' : '详情'}</button></td>
      </tr>
      {expanded && (
        <tr className="monster-detail-row">
          <td colSpan={summaryFieldIds.length + 4}>
            <MonsterDetails
              dataset={dataset}
              enemy={enemy}
              values={values}
              dlcEffect={applyDlcCompletion ? dlcEffect : undefined}
              multiplayerCorrection={multiplayerCorrection}
              resistanceCorrections={resistanceCorrections}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function MonsterDetails({
  dataset,
  enemy,
  values,
  dlcEffect,
  multiplayerCorrection,
  resistanceCorrections,
}: {
  dataset: MonsterDataset;
  enemy: MonsterEntry;
  values: MonsterStatValue[];
  dlcEffect?: DlcCompletionEffect;
  multiplayerCorrection?: MultiplayerCorrection;
  resistanceCorrections: ReadonlyMap<number, ResistanceCorrection>;
}) {
  const groups = [...new Set(dataset.fields.map((field) => field.group))];
  const activeFlags = Object.entries(flagLabels)
    .filter(([key]) => enemy.flags[key as keyof typeof flagLabels])
    .map(([, label]) => label);
  return (
    <div className="monster-details">
      {groups.map((group) => (
        <section key={group}>
          <h3>{group}</h3>
          <dl>
            {dataset.fields.map((field, index) => field.group === group && (
              <div key={field.id}>
                <dt>{field.label}</dt>
                <dd>{formatStat(values[index])}{values[index] != null ? field.unit : ''}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section>
        <h3>参数关联</h3>
        <dl>
          <div><dt>多人补正 ID</dt><dd>{enemy.multiPlayCorrectionId ?? '—'}</dd></div>
          <div><dt>DLC 通关 SpEffect</dt><dd>{enemy.dlcCompletionSpEffectId ?? '—'}</dd></div>
          {dlcEffect?.damageMultipliers.map((multiplier, index) => (
            <div key={damageTypeLabels[index]}><dt>{damageTypeLabels[index]}伤害倍率</dt><dd>×{formatStat(multiplier)}</dd></div>
          ))}
        </dl>
      </section>
      <section className="monster-detail-wide">
        <h3>分类旗标与掉落</h3>
        <div className="monster-flag-list">
          {activeFlags.map((label) => <span key={label}>{label}</span>)}
          {enemy.flags.defFlickPower != null && enemy.flags.defFlickPower !== 0 && (
            <span>防御弹开力 {formatStat(enemy.flags.defFlickPower)}</span>
          )}
          {activeFlags.length === 0 && (enemy.flags.defFlickPower == null || enemy.flags.defFlickPower === 0) && <span>无特殊旗标</span>}
        </div>
        {enemy.drops.length > 0
          ? <ol className="monster-drop-list">{enemy.drops.map((drop, index) => <li key={`${index}-${drop}`}>{drop}</li>)}</ol>
          : <p className="monster-detail-empty">参考表没有记录掉落物。</p>}
      </section>
      <section className="monster-detail-wide">
        <h3>多人游戏补正</h3>
        {multiplayerCorrection ? (
          <div className="monster-correction-grid">
            {multiplayerCorrection.summons.map((multipliers, summonIndex) => (
              <article key={summonIndex}>
                <h4>{summonIndex + 1} 名协力者</h4>
                <dl>
                  {dataset.multiplayerFields.map((field, index) => (
                    <div key={field.id}><dt>{field.label}</dt><dd>×{formatStat(multipliers[index])}</dd></div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        ) : <p className="monster-detail-empty">没有匹配的多人补正表。</p>}
      </section>
      <section className="monster-detail-wide">
        <h3>异常抗性连续触发补正</h3>
        <div className="resistance-correction-list">
          {enemy.resistanceCorrectionIds.map((correctionId, index) => {
            const correction = correctionId == null ? undefined : resistanceCorrections.get(correctionId);
            return (
              <article key={resistanceLabels[index]}>
                <strong>{resistanceLabels[index]}</strong>
                <span>ID {correctionId ?? '—'}{correction?.name ? ` · ${correction.name}` : ''}</span>
                {correction && <small>增加值：{correction.addPoints.map(formatStat).join(' → ')}；倍率：{correction.addRates.map(formatStat).join(' → ')}</small>}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function formatStat(value: MonsterStatValue | undefined): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return value.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
  if (value === 'Immune') return '免疫';
  return String(value);
}

function uniformMultiplier(values: readonly number[]): number | undefined {
  return values.every((value) => value === values[0]) ? values[0] : undefined;
}

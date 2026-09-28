import { useEffect, useMemo, useRef, useState } from 'react';
import { CategoryControls } from './CategoryControls';
import { REFRESH_INTERVALS, type ClientPreferences, type MapCenter, type RefreshInterval } from './client-settings';
import { loadDataset, loadDatasetIndex, type DatasetProfile, type MapPlane, type MarkerCatalog } from './dataset';
import { GoblinMap } from './GoblinMap';
import { SAVE_FILE_ACCEPT } from './save-file';
import { browserSettingsStore } from './settings-store';
import { useLocalSave } from './use-local-save';
import { type SaveAnalysisSource, useSaveAnalysis } from './use-save-analysis';
import { useSaveBridge } from './use-save-bridge';
import { resolveCapitalState, type CapitalPreference } from './capital-state';
import type { DlcEvidence } from './dlc-state';
import {
  availableMapPlanes,
  categoryMapCounts,
  createMapDiscoveryContext,
  type MapDisplayMode,
} from './map-discovery';
import { resolveGameLocale } from './game-locales';
import { ControlBar } from './ControlBar';
import { readControlPanel } from './control-bar-state';
import type { OfficialMarkerDisplayMode } from './official-marker-render';
import { searchMapContent, type MapFocusRequest } from './map-search';
import { CharacterPanel } from './CharacterPanel';
import { formatGameRelease } from './game-release';

const intervalLabels: Record<RefreshInterval, string> = {
  0: '关闭',
  2: '2 秒',
  5: '5 秒',
  10: '10 秒',
  30: '30 秒',
};

const profileLabels: Record<DatasetProfile, string> = {
  err: 'ERR',
  vanilla: '原版 + 黄金树幽影',
  convergence2: 'The Convergence 2.x',
  convergence3: 'The Convergence 3.x',
  erte: 'ERTE',
  goldenage: 'Golden Age',
  goldenage363: 'Golden Age 3.6.3',
  vins: 'ELDEN VINS',
  reborn: 'Elden Ring Reborn',
  graceborne: 'Graceborne',
};

const dlcEvidenceLabels: Record<DlcEvidence, string> = {
  NONE: '未检测到 DLC 内容',
  CURRENT_MAP_AREA_61: '已检测到（当前位置：幽影之地）',
  VISITED_DLC_LOCATION: '已检测到（访问记录含幽影之地）',
};

const planeLabels: Record<MapPlane, string> = {
  surface: '交界地',
  underground: '地下',
  shadow: '幽影之地',
};

export function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(() => new URLSearchParams(location.search).has('panel'));
  const [activeControlTab, setActiveControlTab] = useState<'save' | 'map'>(() => (
    readControlPanel('map') === 'save' ? 'save' : 'map'
  ));
  const [saveSubview, setSaveSubview] = useState<'connection' | 'character'>(() => (
    new URLSearchParams(location.search).get('view') === 'character' ? 'character' : 'connection'
  ));
  const [dataset, setDataset] = useState<MarkerCatalog>();
  const [datasetError, setDatasetError] = useState<string>();
  const [availableProfiles, setAvailableProfiles] = useState<DatasetProfile[]>(['vanilla', 'err']);
  const [plane, setPlane] = useState<MapPlane>(() => browserSettingsStore.loadPreferences().mapPlane);
  const [mapDisplayMode, setMapDisplayMode] = useState<MapDisplayMode>('complete');
  const [officialMarkerDisplayMode, setOfficialMarkerDisplayMode] = useState<OfficialMarkerDisplayMode>('visible');
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [submittedMapQuery, setSubmittedMapQuery] = useState<string>();
  const [mapFocusRequest, setMapFocusRequest] = useState<MapFocusRequest>();
  const autoModeSaveKey = useRef<string | undefined>(undefined);
  const [preferences, setPreferences] = useState(() => browserSettingsStore.loadPreferences());
  const localSave = useLocalSave(preferences.refreshInterval);
  const bridge = useSaveBridge(preferences.refreshInterval);
  const bridgeActive = Boolean(bridge.connection) || bridge.state.code !== 'UNCONFIGURED';
  const source = bridgeActive ? bridge.state : undefined;
  const saveSource = useMemo<SaveAnalysisSource | undefined>(() => {
    if (bridgeActive) {
      if (!bridge.snapshot) return undefined;
      return {
        kind: 'BUFFER',
        bytes: bridge.snapshot.bytes,
        key: `bridge:${bridge.snapshot.revision ?? bridge.snapshot.bytes.byteLength}`,
      };
    }
    const file = localSave.state.file;
    if (!file) return undefined;
    return { kind: 'FILE', file, key: `file:${file.name}:${file.size}:${file.lastModified}` };
  }, [bridge.snapshot, bridgeActive, localSave.state.file]);
  const analysis = useSaveAnalysis(dataset, saveSource);
  const slots = analysis.snapshot?.slots ?? [];
  const selectedSlot = slots.find((slot) => slot.index === preferences.selectedSlot) ?? slots[0];
  const allowShadowPlane = !selectedSlot || selectedSlot.dlcEvidence !== 'NONE';
  const capitalState = resolveCapitalState(preferences.capitalPreference, selectedSlot?.capitalState);
  const sourceHasError = bridgeActive
    ? ['OFFLINE', 'AUTH_REQUIRED', 'ORIGIN_REJECTED', 'FILE_MISSING', 'VERSION_MISMATCH', 'ERROR'].includes(bridge.state.code)
    : localSave.state.status === 'ERROR';
  const ready = analysis.status === 'READY';
  const hasError = sourceHasError || analysis.status === 'ERROR' || Boolean(datasetError);
  const fileName = bridgeActive ? source?.fileName ?? source?.message : localSave.state.file?.name;
  const sourceDetail = bridgeActive ? source?.detail : localSave.state.message;
  const statusDetail = datasetError ?? (analysis.status === 'IDLE' ? sourceDetail : analysis.message);
  const resolvedTotal = selectedSlot
    ? selectedSlot.counts.available + selectedSlot.counts.collected + selectedSlot.counts.locked
    : 0;
  const slotVersions = [...new Set(slots.map((slot) => slot.version))].sort((left, right) => right - left);
  const locale = resolveGameLocale(preferences.locale);
  const effectiveOfficialMarkerDisplayMode: OfficialMarkerDisplayMode = selectedSlot ? officialMarkerDisplayMode : 'all';
  const visibleCategories = useMemo(() => {
    const hidden = new Set(preferences.hiddenCategories);
    return new Set(dataset?.categoryCatalog.categories
      .filter((category) => !hidden.has(category.id))
      .map((category) => category.id) ?? []);
  }, [dataset, preferences.hiddenCategories]);
  const mapDiscovery = useMemo(
    () => dataset ? createMapDiscoveryContext(dataset, selectedSlot, mapDisplayMode) : undefined,
    [dataset, mapDisplayMode, selectedSlot],
  );
  const visiblePlanes = useMemo<ReadonlySet<MapPlane>>(
    () => dataset && mapDiscovery
      ? availableMapPlanes(dataset, selectedSlot, mapDiscovery, allowShadowPlane)
      : new Set<MapPlane>(['surface']),
    [allowShadowPlane, dataset, mapDiscovery, selectedSlot],
  );
  const categoryCounts = useMemo(
    () => dataset && mapDiscovery
      ? categoryMapCounts(dataset, selectedSlot, mapDiscovery, capitalState, visiblePlanes)
      : undefined,
    [capitalState, dataset, mapDiscovery, selectedSlot, visiblePlanes],
  );
  const mapSearchResults = useMemo(
    () => dataset && mapDiscovery && submittedMapQuery !== undefined
      ? searchMapContent(dataset, {
        locale,
        query: submittedMapQuery,
        discovery: mapDiscovery,
        markerStates: selectedSlot?.markerStates,
        officialTextStates: selectedSlot?.officialTextStates,
      })
      : undefined,
    [dataset, locale, mapDiscovery, selectedSlot?.markerStates, selectedSlot?.officialTextStates, submittedMapQuery],
  );

  const updatePreferences = (update: (current: ClientPreferences) => ClientPreferences) => {
    setPreferences((current) => {
      const next = update(current);
      browserSettingsStore.savePreferences(next);
      return next;
    });
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadDatasetIndex(controller.signal)
      .then((index) => {
        const profiles = index.profiles.map(({ id }) => id);
        setAvailableProfiles(profiles);
        updatePreferences((current) => profiles.includes(current.datasetProfile)
          ? current
          : { ...current, datasetProfile: index.defaultProfile });
      })
      .catch(() => {
        // 兼容仅包含根清单的旧资源包；具体错误由数据集加载结果显示。
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setDataset(undefined);
    setDatasetError(undefined);
    void loadDataset(preferences.datasetProfile, controller.signal)
      .then((loaded) => {
        setDataset(loaded);
        setDatasetError(undefined);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDatasetError(error instanceof Error ? error.message : '无法加载标记目录');
        }
      });
    return () => controller.abort();
  }, [preferences.datasetProfile]);

  useEffect(() => {
    if (slots.length === 0 || slots.some((slot) => slot.index === preferences.selectedSlot)) return;
    updatePreferences((current) => ({ ...current, selectedSlot: slots[0].index }));
  }, [preferences, slots]);

  useEffect(() => {
    if (!visiblePlanes.has(plane)) updatePlane(visiblePlanes.has('surface') ? 'surface' : [...visiblePlanes][0] ?? 'surface');
  }, [plane, visiblePlanes]);

  useEffect(() => {
    if (!saveSource) {
      autoModeSaveKey.current = undefined;
      setMapDisplayMode('complete');
      return;
    }
    if (!selectedSlot) return;
    const key = `${saveSource.key}:${selectedSlot.index}`;
    if (autoModeSaveKey.current === key) return;
    autoModeSaveKey.current = key;
    setMapDisplayMode('exploration');
  }, [saveSource, selectedSlot]);

  const updateRefreshInterval = (value: string) => {
    const refreshInterval = Number(value) as RefreshInterval;
    if (!REFRESH_INTERVALS.includes(refreshInterval)) return;
    updatePreferences((current) => ({ ...current, refreshInterval }));
  };

  const chooseLocalSave = async () => {
    if (bridgeActive) await bridge.disconnect();
    const handled = await localSave.chooseFile();
    if (!handled) fileInput.current?.click();
  };

  const updateSelectedSlot = (value: string) => {
    const selectedSlot = Number(value);
    if (!slots.some((slot) => slot.index === selectedSlot)) return;
    updatePreferences((current) => ({ ...current, selectedSlot }));
  };

  const updatePlane = (nextPlane: MapPlane) => {
    setPlane(nextPlane);
    updatePreferences((current) => current.mapPlane === nextPlane ? current : { ...current, mapPlane: nextPlane });
  };

  const setCategoryVisibility = (categoryId: string, visible: boolean) => {
    updatePreferences((current) => {
      const hidden = new Set(current.hiddenCategories);
      if (visible) hidden.delete(categoryId);
      else hidden.add(categoryId);
      return { ...current, hiddenCategories: [...hidden].sort() };
    });
  };

  const setSectionVisibility = (sectionId: string, visible: boolean) => {
    if (!dataset) return;
    const sectionCategoryIds = dataset.categoryCatalog.categories
      .filter((category) => category.section === sectionId)
      .map((category) => category.id);
    updatePreferences((current) => {
      const hidden = new Set(current.hiddenCategories);
      sectionCategoryIds.forEach((categoryId) => visible ? hidden.delete(categoryId) : hidden.add(categoryId));
      return { ...current, hiddenCategories: [...hidden].sort() };
    });
  };

  const showAllCategories = () => updatePreferences((current) => ({ ...current, hiddenCategories: [] }));
  const hideAllCategories = () => updatePreferences((current) => ({
    ...current,
    hiddenCategories: dataset?.categoryCatalog.categories.map((category) => category.id) ?? [],
  }));

  return (
    <main className="app-shell">
      <section className="map-workspace" aria-label="地图工作区">
        {dataset ? (
          <GoblinMap
            catalog={dataset}
            slot={selectedSlot}
            visibleCategories={visibleCategories}
            locale={locale}
            plane={plane}
            onPlaneChange={updatePlane}
            mapDisplayMode={mapDisplayMode}
            capitalState={capitalState}
            officialMarkerDisplayMode={effectiveOfficialMarkerDisplayMode}
            searchResults={mapSearchResults}
            focusRequest={mapFocusRequest}
            followPlayerLocation={preferences.followPlayerLocation}
            mapCenter={preferences.mapCenters[plane]}
            mapZoom={preferences.mapZoom}
            onMapCenterChange={(mapCenter: MapCenter) => updatePreferences((current) => {
              const previous = current.mapCenters[plane];
              if (previous?.[0] === mapCenter[0] && previous[1] === mapCenter[1]) return current;
              return { ...current, mapCenters: { ...current.mapCenters, [plane]: mapCenter } };
            })}
            onMapZoomChange={(mapZoom) => (
              updatePreferences((current) => current.mapZoom === mapZoom ? current : { ...current, mapZoom })
            )}
            onFollowPlayerLocationChange={(followPlayerLocation) => (
              updatePreferences((current) => ({ ...current, followPlayerLocation }))
            )}
          />
        ) : (
          <div className={`map-loading${datasetError ? ' error' : ''}`}>
            <span className="eyebrow">标记数据集</span>
            <h1>{datasetError ? '地图资源无法加载' : '正在加载地图标记'}</h1>
            <p>{datasetError ?? '资源来自本机数据构建产物，不会请求或上传你的存档。'}</p>
          </div>
        )}

        <ControlBar
          page="map"
          panel={activeControlTab}
          open={drawerOpen}
          status={dataset ? `${datasetStatusLabel(dataset.profile, selectedSlot?.dlcEvidence)} · ${formatGameRelease(dataset.gameRelease)}` : '正在加载标记数据'}
          localePreference={preferences.locale}
          interfaceLocale={locale}
          onOpenChange={setDrawerOpen}
          onPanelChange={(panel) => {
            if (panel === 'save' || panel === 'map') setActiveControlTab(panel);
            setDrawerOpen(true);
          }}
          onLocaleChange={(nextLocale) => updatePreferences((current) => ({ ...current, locale: nextLocale }))}
        >
          {activeControlTab === 'save' ? saveSubview === 'character' ? (
            <CharacterPanel locale={locale} slot={selectedSlot} onBack={() => setSaveSubview('connection')} />
          ) : (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={SAVE_FILE_ACCEPT}
                hidden
                onChange={(event) => localSave.acceptFallbackFile(event.target.files?.[0])}
              />
              <section className="save-source-controls" aria-label="存档来源与状态">
                <div className="save-source-actions">
                  <button className="primary-button" type="button" onClick={() => void chooseLocalSave()}>选择本机存档</button>
                  {localSave.state.status === 'PERMISSION_REQUIRED' && !bridgeActive && (
                    <button className="secondary-button" type="button" onClick={() => void localSave.requestPermission()}>重新授权</button>
                  )}
                </div>
                <label>
                  <span>槽位</span>
                  <select value={selectedSlot?.index ?? ''} disabled={slots.length === 0} onChange={(event) => updateSelectedSlot(event.target.value)}>
                    {slots.length === 0 && <option value="">等待存档解析</option>}
                    {slots.map((slot) => (
                      <option value={slot.index} key={slot.index}>槽位 {slot.index + 1} · {slot.name} · Lv.{slot.level}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>自动刷新</span>
                  <select value={preferences.refreshInterval} onChange={(event) => updateRefreshInterval(event.target.value)}>
                    {REFRESH_INTERVALS.map((value) => <option value={value} key={value}>{intervalLabels[value]}</option>)}
                  </select>
                </label>
                <div className="file-status" aria-live="polite">
                  <span className={`status-dot${ready ? ' ready' : ''}${hasError ? ' error' : ''}`} />
                  <span>
                    <strong>{fileName ?? '尚未选择存档'}</strong>
                    <small>{statusDetail}</small>
                  </span>
                  <em>{bridgeActive ? 'BRIDGE' : localSave.state.persistentHandle ? 'FILE HANDLE' : 'LOCAL'}</em>
                </div>
              </section>

              <section className={`bridge-card ${bridge.connection ? 'connected' : ''}`} aria-label="存档桥接器">
                <div className="bridge-card-heading">
                  <span><small>跨设备存档来源</small><strong>Save Bridge</strong></span>
                  <i>{bridge.connection ? '已连接' : bridge.state.code === 'PAIRING' ? '配对中' : '未连接'}</i>
                </div>
                {bridge.connection ? (
                  <>
                    <code>{bridge.connection.baseUrl}</code>
                    <p>{bridge.state.detail}</p>
                    <div className="bridge-actions">
                      <button type="button" onClick={() => void bridge.check()}>立即检查</button>
                      <button type="button" onClick={() => void bridge.disconnect()}>断开并清除</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>在 Bridge CLI 中输入 <code>link</code>，再打开生成的一次性链接。链接首次使用后立即失效。</p>
                    <small>不使用中心配对服务器；访问令牌仅保存在当前浏览器的 IndexedDB。</small>
                    {bridge.state.code !== 'UNCONFIGURED' && (
                      <div className="bridge-actions single"><button type="button" onClick={() => void bridge.disconnect()}>清除连接状态</button></div>
                    )}
                  </>
                )}
              </section>

              <section className="compatibility-card" aria-label="存档解析兼容性">
                <div>
                  <span><span className="eyebrow">解析兼容性</span><strong>{analysis.status === 'READY' ? 'PC BND4 · 十槽位' : '等待存档'}</strong></span>
                  <label className="profile-selector">
                    <span>标记版本</span>
                    <select value={preferences.datasetProfile} onChange={(event) => updatePreferences((current) => ({ ...current, datasetProfile: event.target.value as DatasetProfile }))}>
                      {availableProfiles.map((profile) => <option key={profile} value={profile}>{profileLabels[profile]}</option>)}
                    </select>
                  </label>
                </div>
                {analysis.status === 'READY' ? (
                  <dl>
                    <div><dt>有效槽位</dt><dd>{slots.length} / 10</dd></div>
                    <div><dt>布局版本</dt><dd>{slotVersions.join(' / ')}</dd></div>
                    <div><dt>事件旗标区</dt><dd>{selectedSlot ? `${(selectedSlot.eventFlagBytes / 1024 / 1024).toFixed(2)} MiB` : '—'}</dd></div>
                    <div><dt>标记 Profile</dt><dd>{dataset ? profileLabels[dataset.profile] : '—'}</dd></div>
                    <div><dt>游戏数据</dt><dd>{dataset ? formatGameRelease(dataset.gameRelease) : '—'}</dd></div>
                    <div><dt>DLC 内容</dt><dd>{selectedSlot ? dlcEvidenceLabels[selectedSlot.dlcEvidence] : '—'}</dd></div>
                    <div><dt>王城状态</dt><dd>{selectedSlot?.capitalState === 'ashen' ? '灰城（旗标 118）' : selectedSlot?.capitalState === 'royal' ? '王城（旗标 118）' : '无法判定'}</dd></div>
                  </dl>
                ) : <p>选择 `.sl2`、ModEngine 自定义后缀 `.co2` 或兼容的 `.err` 后显示容器与槽位布局。</p>}
                <small>文件后缀只表示兼容的 PC 存档容器，不能证明它是原版或某个 Mod。标记数据集必须与实际游戏或 Mod 一致；DLC 判断只依据当前槽位已经写入的幽影之地记录。</small>
              </section>

              <button className="character-page-entry" type="button" onClick={() => setSaveSubview('character')}>
                <span><small>当前槽位</small><strong>角色数据</strong></span>
                <em>{selectedSlot ? `${selectedSlot.name} · Lv.${selectedSlot.level}` : '选择存档后查看'}</em>
                <b>→</b>
              </button>
            </>
          ) : (
            <>
              <section className="map-control-groups" aria-label="地图显示设置">
                <div className="control-group">
                  <span><strong>地图区域</strong><small>{planeLabels[plane]}</small></span>
                  <div className="segmented-control">
                    {(Object.keys(planeLabels) as MapPlane[]).filter((value) => visiblePlanes.has(value)).map((value) => (
                      <button type="button" className={value === plane ? 'active' : ''} key={value} onClick={() => {
                        if (preferences.followPlayerLocation) updatePreferences((current) => ({ ...current, followPlayerLocation: false }));
                        updatePlane(value);
                      }}>{planeLabels[value]}</button>
                    ))}
                  </div>
                </div>
                <div className="control-group">
                  <span><strong>地图显示</strong><small>{mapDisplayMode === 'exploration' ? '按当前存档揭示' : '不受探索进度限制'}</small></span>
                  <div className="segmented-control">
                    {(['complete', 'exploration'] as MapDisplayMode[]).map((value) => (
                      <button type="button" className={value === mapDisplayMode ? 'active' : ''} disabled={value === 'exploration' && !selectedSlot} key={value} onClick={() => setMapDisplayMode(value)}>
                        {value === 'complete' ? '完整地图' : '探索地图'}
                      </button>
                    ))}
                  </div>
                </div>
                {dataset?.officialMapCatalog && (
                  <div className="control-group">
                    <span><strong>官方标记</strong><small>{officialMarkerModeDescription(effectiveOfficialMarkerDisplayMode)}</small></span>
                    <div className="segmented-control three">
                      {(['visible', 'npc-current', 'all'] as OfficialMarkerDisplayMode[]).map((value) => (
                        <button type="button" className={value === effectiveOfficialMarkerDisplayMode ? 'active' : ''} disabled={!selectedSlot && value !== 'all'} key={value} onClick={() => setOfficialMarkerDisplayMode(value)}>
                          {value === 'visible' ? '存档可见' : value === 'npc-current' ? 'NPC 当前' : '全部候选'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {plane === 'surface' && (
                  <div className="control-group">
                    <span><strong>王城形态</strong><small>{preferences.capitalPreference === 'auto' ? selectedSlot ? '由存档自动判断' : '无存档，默认王城' : '手动覆盖'}</small></span>
                    <div className="segmented-control three">
                      {(['auto', 'royal', 'ashen'] as CapitalPreference[]).map((value) => (
                        <button type="button" className={value === preferences.capitalPreference ? 'active' : ''} key={value} onClick={() => updatePreferences((current) => ({ ...current, capitalPreference: value }))}>
                          {value === 'auto' ? '自动' : value === 'royal' ? '王城' : '灰城'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="map-resource-status">
                  <strong>{dataset?.mapTileManifest ? '游戏地图资源已加载' : '坐标地图模式'}</strong>
                  <small>{dataset?.mapTileManifest ? `${planeLabels[plane]} · ${mapDisplayMode === 'exploration' ? '存档遮罩' : '完整显示'}` : '游戏地图纹理资源包尚未生成'}</small>
                </div>
              </section>

              <form className="map-content-search" onSubmit={(event) => {
                event.preventDefault();
                const query = mapSearchQuery.trim();
                if (!query) return;
                setSubmittedMapQuery(query);
                setMapFocusRequest(undefined);
              }}>
                <label htmlFor="map-content-search-input">搜索地图内容</label>
                <div>
                  <input
                    id="map-content-search-input"
                    type="search"
                    value={mapSearchQuery}
                    placeholder="名称、ID、分类或区域"
                    onChange={(event) => setMapSearchQuery(event.target.value)}
                  />
                  <button type="submit">搜索</button>
                </div>
              </form>

              {mapSearchResults ? (
                <section className="map-search-results" aria-label="地图搜索结果">
                  <div className="map-search-summary">
                    <span>找到 <strong>{mapSearchResults.length.toLocaleString(locale)}</strong> 个结果</span>
                    <button type="button" onClick={() => {
                      setSubmittedMapQuery(undefined);
                      setMapFocusRequest(undefined);
                    }}>退出搜索</button>
                  </div>
                  <div className="map-search-result-list">
                    {mapSearchResults.slice(0, 500).map((result) => (
                      <button type="button" key={result.key} onClick={() => {
                        if (preferences.followPlayerLocation) updatePreferences((current) => ({ ...current, followPlayerLocation: false }));
                        updatePlane(result.plane);
                        setMapFocusRequest({ result, requestId: Date.now() });
                      }}>
                        <span><strong>{result.title}</strong><small>#{result.id} · {result.categoryLabel}</small></span>
                        <small>{planeLabels[result.plane]} · A{result.area} ({result.gridX}, {result.gridZ})</small>
                      </button>
                    ))}
                  </div>
                  {mapSearchResults.length > 500 && <p>为保持控制面板流畅，仅列出前 500 项；请增加关键词缩小范围。</p>}
                  {mapSearchResults.length === 0 && <p>没有符合当前“{mapDisplayMode === 'complete' ? '完整地图' : '探索地图'}”范围的结果。</p>}
                </section>
              ) : dataset && (
                <CategoryControls
                  catalog={dataset.categoryCatalog}
                  locale={locale}
                  visibleCategories={visibleCategories}
                  mapCounts={categoryCounts}
                  onCategoryVisibility={setCategoryVisibility}
                  onSectionVisibility={setSectionVisibility}
                  onShowAll={showAllCategories}
                  onHideAll={hideAllCategories}
                />
              )}
              {mapSearchResults === undefined && (
                <div className="progress-card">
                  <span>{selectedSlot ? `${selectedSlot.name} · 事件旗标进度` : '等待选择存档槽位'}</span>
                  <strong>{selectedSlot ? `${selectedSlot.counts.collected.toLocaleString(locale)} / ${resolvedTotal.toLocaleString(locale)}` : `0 / ${dataset?.markerCount.toLocaleString(locale) ?? '9,201'}`}</strong>
                  <div><i style={{ width: resolvedTotal > 0 ? `${selectedSlot!.counts.collected / resolvedTotal * 100}%` : '0%' }} /></div>
                  {selectedSlot && <small>{selectedSlot.counts.unknown.toLocaleString(locale)} 个标记仍需 GEOM/GEOF 或更多证据</small>}
                </div>
              )}
            </>
          )}
        </ControlBar>
      </section>
    </main>
  );
}

function datasetStatusLabel(profile: DatasetProfile, dlcEvidence: DlcEvidence | undefined): string {
  if (profile === 'vanilla' && dlcEvidence === 'NONE') return '原版标记数据';
  return `${profileLabels[profile]} 标记数据`;
}

function officialMarkerModeDescription(mode: OfficialMarkerDisplayMode): string {
  if (mode === 'visible') return '按存档显示已发现或当前可用标记';
  if (mode === 'npc-current') return '只显示 NPC 当前阶段的位置';
  return '显示所有候选位置与未发现标记';
}

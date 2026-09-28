import { useMemo, useRef, useState } from 'react';
import { CharacterPanel } from './CharacterPanel';
import { REFRESH_INTERVALS, type ClientPreferences, type RefreshInterval } from './client-settings';
import { resolveGameLocale } from './game-locales';
import { SAVE_FILE_ACCEPT } from './save-file';
import { useLocalSave } from './use-local-save';
import { type SaveAnalysisSource, useSaveAnalysis } from './use-save-analysis';
import { useSaveBridge } from './use-save-bridge';

const intervalLabels: Record<RefreshInterval, string> = {
  0: '关闭', 2: '2 秒', 5: '5 秒', 10: '10 秒', 30: '30 秒',
};

interface DatabaseSavePanelProps {
  preferences: ClientPreferences;
  onPreferencesChange(preferences: ClientPreferences): void;
}

export function DatabaseSavePanel({ preferences, onPreferencesChange }: DatabaseSavePanelProps) {
  const [subview, setSubview] = useState<'connection' | 'character'>('connection');
  const fileInput = useRef<HTMLInputElement>(null);
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
    return file ? { kind: 'FILE', file, key: `file:${file.name}:${file.size}:${file.lastModified}` } : undefined;
  }, [bridge.snapshot, bridgeActive, localSave.state.file]);
  const analysis = useSaveAnalysis(undefined, saveSource, true);
  const slots = analysis.snapshot?.slots ?? [];
  const selectedSlot = slots.find((slot) => slot.index === preferences.selectedSlot) ?? slots[0];
  const ready = analysis.status === 'READY';
  const sourceHasError = bridgeActive
    ? ['OFFLINE', 'AUTH_REQUIRED', 'ORIGIN_REJECTED', 'FILE_MISSING', 'VERSION_MISMATCH', 'ERROR'].includes(bridge.state.code)
    : localSave.state.status === 'ERROR';
  const hasError = sourceHasError || analysis.status === 'ERROR';
  const fileName = bridgeActive ? source?.fileName ?? source?.message : localSave.state.file?.name;
  const sourceDetail = bridgeActive ? source?.detail : localSave.state.message;
  const statusDetail = analysis.status === 'IDLE' ? sourceDetail : analysis.message;

  const updatePreferences = (patch: Partial<ClientPreferences>) => {
    onPreferencesChange({ ...preferences, ...patch });
  };

  const chooseLocalSave = async () => {
    if (bridgeActive) await bridge.disconnect();
    const handled = await localSave.chooseFile();
    if (!handled) fileInput.current?.click();
  };

  if (subview === 'character') {
    return (
      <CharacterPanel
        locale={resolveGameLocale(preferences.locale)}
        slot={selectedSlot}
        onBack={() => setSubview('connection')}
      />
    );
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={SAVE_FILE_ACCEPT}
        hidden
        onChange={(event) => localSave.acceptFallbackFile(event.target.files?.[0])}
      />
      <section className="save-source-controls database-save-controls" aria-label="存档来源与状态">
        <div className="save-source-actions">
          <button className="primary-button" type="button" onClick={() => void chooseLocalSave()}>选择本机存档</button>
          {localSave.state.status === 'PERMISSION_REQUIRED' && !bridgeActive && (
            <button className="secondary-button" type="button" onClick={() => void localSave.requestPermission()}>重新授权</button>
          )}
        </div>
        <label>
          <span>槽位</span>
          <select
            value={selectedSlot?.index ?? ''}
            disabled={slots.length === 0}
            onChange={(event) => updatePreferences({ selectedSlot: Number(event.target.value) })}
          >
            {slots.length === 0 && <option value="">等待存档解析</option>}
            {slots.map((slot) => <option value={slot.index} key={slot.index}>槽位 {slot.index + 1} · {slot.name} · Lv.{slot.level}</option>)}
          </select>
        </label>
        <label>
          <span>自动刷新</span>
          <select
            value={preferences.refreshInterval}
            onChange={(event) => updatePreferences({ refreshInterval: Number(event.target.value) as RefreshInterval })}
          >
            {REFRESH_INTERVALS.map((value) => <option value={value} key={value}>{intervalLabels[value]}</option>)}
          </select>
        </label>
        <div className="file-status" aria-live="polite">
          <span className={`status-dot${ready ? ' ready' : ''}${hasError ? ' error' : ''}`} />
          <span><strong>{fileName ?? '尚未选择存档'}</strong><small>{statusDetail}</small></span>
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
        <div><span><span className="eyebrow">解析兼容性</span><strong>{ready ? 'PC BND4 · 十槽位' : '等待存档'}</strong></span></div>
        {ready ? (
          <dl>
            <div><dt>有效槽位</dt><dd>{slots.length} / 10</dd></div>
            <div><dt>当前槽位</dt><dd>{selectedSlot ? `${selectedSlot.name} · Lv.${selectedSlot.level}` : '—'}</dd></div>
            <div><dt>DLC 内容</dt><dd>{selectedSlot?.dlcEvidence === 'NONE' ? '未检测到' : selectedSlot ? '已检测到' : '—'}</dd></div>
          </dl>
        ) : <p>选择 `.sl2`、`.co2` 或兼容的 `.err` 后显示槽位，并与所有数据页面共享 Cookie 设置。</p>}
      </section>

      <button className="character-page-entry" type="button" onClick={() => setSubview('character')}>
        <span><small>当前槽位</small><strong>角色数据</strong></span>
        <em>{selectedSlot ? `${selectedSlot.name} · Lv.${selectedSlot.level}` : '选择存档后查看'}</em>
        <b>→</b>
      </button>
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { BridgeClientError, pairWithBridge, SaveBridgeClient } from './bridge-client';
import type { BridgeConnection, BridgeSaveSnapshot, BridgeState } from './bridge-protocol';
import { readPairingRequest } from './bridge-url';
import type { RefreshInterval } from './client-settings';
import { browserSettingsStore } from './settings-store';

const INITIAL_STATE: BridgeState = {
  code: 'UNCONFIGURED',
  message: '未连接存档桥接器',
  detail: '可使用 Bridge 生成的一次性链接进行连接',
};

export function useSaveBridge(refreshInterval: RefreshInterval) {
  const [connection, setConnection] = useState<BridgeConnection>();
  const [snapshot, setSnapshot] = useState<BridgeSaveSnapshot>();
  const [state, setState] = useState<BridgeState>(INITIAL_STATE);
  const latestRevision = useRef<string | undefined>(undefined);
  const checking = useRef(false);

  useEffect(() => {
    let pairingRequest;
    try {
      pairingRequest = readPairingRequest(location.hash);
    } catch (error) {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      setState({ code: 'ERROR', message: '连接链接不安全', detail: error instanceof Error ? error.message : '无法读取连接链接' });
      return;
    }
    if (pairingRequest) {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      setState({ code: 'PAIRING', message: '正在安全配对', detail: '一次性连接凭据将在首次使用后失效' });
      void pairWithBridge(pairingRequest)
        .then(async (paired) => {
          await browserSettingsStore.saveBridgeConnection(paired);
          setConnection(paired);
        })
        .catch((error: unknown) => setState(errorState(error, '配对失败')));
      return;
    }
    void browserSettingsStore.loadBridgeConnection()
      .then((stored) => {
        if (stored) setConnection(stored);
      })
      .catch(() => setState({ code: 'ERROR', message: '无法读取 Bridge 配置', detail: '浏览器本地数据库不可用' }));
  }, []);

  const check = useCallback(async () => {
    if (!connection || checking.current) return;
    checking.current = true;
    setState((current) => ({ ...current, code: 'CHECKING', message: '正在检查存档' }));
    try {
      const client = new SaveBridgeClient(connection);
      await client.health();
      const status = await client.status();
      if (!status.ready) {
        setState({
          code: status.errorCode === 'FILE_MISSING' ? 'FILE_MISSING' : 'ERROR',
          message: status.errorCode === 'FILE_MISSING' ? '存档文件不存在' : '存档暂时无法读取',
          detail: '请在 Bridge 主机上检查配置和文件权限',
          fileName: status.fileName,
        });
        return;
      }

      if (status.revision && status.revision !== latestRevision.current) {
        setState({ code: 'READING', message: '正在读取存档快照', detail: '数据只会进入当前浏览器', fileName: status.fileName });
        const snapshot = await client.readSave();
        latestRevision.current = snapshot.revision ?? status.revision;
        setSnapshot({
          bytes: snapshot.bytes,
          fileName: status.fileName,
          revision: latestRevision.current,
          lastModified: status.lastModified ?? undefined,
        });
        setState({
          code: 'PARSE_PENDING',
          message: status.fileName,
          detail: '存档已安全读取；正在交给浏览器 Worker 解析',
          fileName: status.fileName,
          lastModified: status.lastModified ?? undefined,
          revision: latestRevision.current,
          bytes: snapshot.bytes.byteLength,
        });
      } else {
        setState({
          code: 'UP_TO_DATE',
          message: status.fileName,
          detail: '存档没有变化',
          fileName: status.fileName,
          lastModified: status.lastModified ?? undefined,
          revision: status.revision ?? undefined,
          bytes: status.size,
        });
      }
    } catch (error) {
      setState(errorState(error, '检查失败'));
    } finally {
      checking.current = false;
    }
  }, [connection]);

  useEffect(() => {
    if (!connection) return;
    void check();
    if (refreshInterval === 0) return;
    const timer = window.setInterval(() => void check(), refreshInterval * 1000);
    return () => window.clearInterval(timer);
  }, [check, connection, refreshInterval]);

  const disconnect = useCallback(async () => {
    await browserSettingsStore.clearBridgeConnection();
    latestRevision.current = undefined;
    setSnapshot(undefined);
    setConnection(undefined);
    setState(INITIAL_STATE);
  }, []);

  return { connection, state, snapshot, check, disconnect };
}

function errorState(error: unknown, fallback: string): BridgeState {
  if (error instanceof BridgeClientError) {
    const code = error.code === 'PAIRING_REJECTED' ? 'AUTH_REQUIRED' : error.code;
    return { code, message: error.message, detail: code === 'OFFLINE' ? 'Bridge 未运行、地址已变化或浏览器阻止了局域网访问' : '请重新生成一次性连接链接' };
  }
  return { code: 'ERROR', message: fallback, detail: error instanceof Error ? error.message : '发生未知错误' };
}

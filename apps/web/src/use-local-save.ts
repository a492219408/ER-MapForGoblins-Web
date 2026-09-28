import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefreshInterval } from './client-settings';
import { isSupportedSaveFileName } from './save-file';
import { browserSettingsStore } from './settings-store';

export interface LocalSaveState {
  file?: File;
  status: 'UNCONFIGURED' | 'READY' | 'PERMISSION_REQUIRED' | 'ERROR';
  message: string;
  persistentHandle: boolean;
}

export function useLocalSave(refreshInterval: RefreshInterval) {
  const [state, setState] = useState<LocalSaveState>({
    status: 'UNCONFIGURED',
    message: '文件仅在本机浏览器中读取',
    persistentHandle: false,
  });
  const handleRef = useRef<FileSystemFileHandle | undefined>(undefined);

  const readHandle = useCallback(async (handle: FileSystemFileHandle) => {
    const file = await handle.getFile();
    if (!isSupportedSaveFileName(file.name)) throw new Error('不是受支持的存档文件');
    handleRef.current = handle;
    setState({ file, status: 'READY', message: '只读文件句柄已授权', persistentHandle: true });
  }, []);

  useEffect(() => {
    void browserSettingsStore.loadSaveFileHandle().then(async (handle) => {
      if (!handle) return;
      handleRef.current = handle;
      const permission = await handle.queryPermission({ mode: 'read' });
      if (permission === 'granted') {
        await readHandle(handle);
      } else {
        setState({ status: 'PERMISSION_REQUIRED', message: `需要重新授权读取 ${handle.name}`, persistentHandle: true });
      }
    }).catch(() => setState((current) => ({ ...current, status: 'ERROR', message: '无法恢复本地文件句柄' })));
  }, [readHandle]);

  useEffect(() => {
    if (!handleRef.current || refreshInterval === 0 || state.status !== 'READY') return;
    const timer = window.setInterval(() => {
      const handle = handleRef.current;
      if (!handle) return;
      void handle.getFile().then((file) => {
        setState((current) => {
          if (current.file?.lastModified === file.lastModified && current.file.size === file.size) return current;
          return { file, status: 'READY', message: '检测到存档更新', persistentHandle: true };
        });
      }).catch(() => setState((current) => ({ ...current, status: 'ERROR', message: '自动刷新本地存档失败' })));
    }, refreshInterval * 1000);
    return () => window.clearInterval(timer);
  }, [refreshInterval, state.status]);

  const chooseFile = useCallback(async (): Promise<boolean> => {
    if (!window.showOpenFilePicker) return false;
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: true,
        types: [{ description: 'Elden Ring 存档', accept: { 'application/octet-stream': ['.sl2', '.co2', '.err'] } }],
      });
      if (!handle) return true;
      await browserSettingsStore.saveSaveFileHandle(handle);
      await readHandle(handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return true;
      setState({ status: 'ERROR', message: '选择存档失败', persistentHandle: false });
    }
    return true;
  }, [readHandle]);

  const acceptFallbackFile = useCallback((file?: File) => {
    if (!file || !isSupportedSaveFileName(file.name)) {
      setState({ status: 'ERROR', message: '请选择 .sl2、.co2 或 .err 存档', persistentHandle: false });
      return;
    }
    handleRef.current = undefined;
    void browserSettingsStore.clearSaveFileHandle();
    setState({ file, status: 'READY', message: '单次读取；浏览器不支持持久文件句柄', persistentHandle: false });
  }, []);

  const requestPermission = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;
    const permission = await handle.requestPermission({ mode: 'read' });
    if (permission === 'granted') await readHandle(handle);
  }, [readHandle]);

  return { state, chooseFile, acceptFallbackFile, requestPermission };
}

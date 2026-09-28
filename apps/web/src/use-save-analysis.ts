import { useEffect, useMemo, useRef, useState } from 'react';
import type { MarkerCatalog } from './dataset';
import type { ParsedSaveSnapshot, SaveParserRequest, SaveParserResponse } from './save-parser-protocol';

export type SaveAnalysisSource =
  | { kind: 'FILE'; file: File; key: string }
  | { kind: 'BUFFER'; bytes: ArrayBuffer; key: string };

export interface SaveAnalysisState {
  status: 'IDLE' | 'READING' | 'READY' | 'ERROR';
  message: string;
  snapshot?: ParsedSaveSnapshot;
}

export function useSaveAnalysis(
  dataset: MarkerCatalog | undefined,
  source: SaveAnalysisSource | undefined,
  initializeWithoutDataset = false,
): SaveAnalysisState {
  const workerRef = useRef<Worker | undefined>(undefined);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<SaveAnalysisState>({ status: 'IDLE', message: '请选择存档开始解析' });
  const sourceKey = source?.key;

  useEffect(() => {
    const worker = new Worker(new URL('./save-parser.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<SaveParserResponse>) => {
      const response = event.data;
      if (response.type === 'INITIALIZED') return;
      if (response.requestId !== requestIdRef.current) return;
      if (response.type === 'ERROR') {
        setState({ status: 'ERROR', message: response.message });
      } else {
        setState({
          status: 'READY',
          message: `已解析 ${response.snapshot.slots.length} 个有效槽位 · ${response.snapshot.elapsedMs.toFixed(1)} ms`,
          snapshot: response.snapshot,
        });
      }
    };
    worker.onerror = () => setState({ status: 'ERROR', message: '浏览器解析 Worker 启动失败' });
    return () => {
      workerRef.current = undefined;
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    if ((!dataset && !initializeWithoutDataset) || !workerRef.current) return;
    const request: SaveParserRequest = {
      type: 'INITIALIZE',
      markers: dataset?.markers ?? [],
      officialMarkers: dataset?.officialMapCatalog?.markers ?? [],
      officialTextStateCount: dataset?.officialMapCatalog?.textStateCount ?? 0,
    };
    workerRef.current.postMessage(request);
  }, [dataset, initializeWithoutDataset]);

  useEffect(() => {
    if ((!dataset && !initializeWithoutDataset) || !source || !workerRef.current) {
      if (!source) setState({ status: 'IDLE', message: '请选择存档开始解析' });
      return;
    }
    let cancelled = false;
    const requestId = ++requestIdRef.current;
    setState((current) => ({ ...current, status: 'READING', message: '正在本机解析存档…' }));
    void readBytes(source).then((bytes) => {
      if (cancelled || requestId !== requestIdRef.current || !workerRef.current) return;
      const request: SaveParserRequest = { type: 'PARSE', requestId, bytes };
      workerRef.current.postMessage(request, [bytes]);
    }).catch(() => {
      if (!cancelled) setState({ status: 'ERROR', message: '浏览器无法读取存档字节' });
    });
    return () => { cancelled = true; };
  }, [dataset, initializeWithoutDataset, source, sourceKey]);

  return useMemo(() => state, [state]);
}

async function readBytes(source: SaveAnalysisSource): Promise<ArrayBuffer> {
  if (source.kind === 'FILE') return source.file.arrayBuffer();
  return source.bytes.slice(0);
}

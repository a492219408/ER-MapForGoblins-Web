import type { BridgeConnection } from './bridge-protocol';

const DATABASE_NAME = 'er-map-for-goblins-client';
const STORE_NAME = 'local-state';
const DATABASE_VERSION = 1;
const BRIDGE_CONNECTION_KEY = 'bridge-connection-v1';
const FILE_HANDLE_KEY = 'save-file-handle-v1';

export async function loadBridgeConnection(): Promise<BridgeConnection | undefined> {
  return getValue<BridgeConnection>(BRIDGE_CONNECTION_KEY);
}

export async function saveBridgeConnection(connection: BridgeConnection): Promise<void> {
  await setValue(BRIDGE_CONNECTION_KEY, connection);
}

export async function clearBridgeConnection(): Promise<void> {
  await deleteValue(BRIDGE_CONNECTION_KEY);
}

export async function loadSaveFileHandle(): Promise<FileSystemFileHandle | undefined> {
  return getValue<FileSystemFileHandle>(FILE_HANDLE_KEY);
}

export async function saveSaveFileHandle(handle: FileSystemFileHandle): Promise<void> {
  await setValue(FILE_HANDLE_KEY, handle);
}

export async function clearSaveFileHandle(): Promise<void> {
  await deleteValue(FILE_HANDLE_KEY);
}

function getValue<T>(key: string): Promise<T | undefined> {
  return withStore<T | undefined>('readonly', (store, resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function setValue(key: string, value: unknown): Promise<void> {
  return withStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteValue(key: string): Promise<void> {
  return withStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
    operation(transaction.objectStore(STORE_NAME), resolve, reject);
  }));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

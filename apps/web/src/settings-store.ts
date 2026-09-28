import type { BridgeConnection } from './bridge-protocol';
import { loadClientPreferences, saveClientPreferences, type ClientPreferences } from './client-settings';
import {
  clearBridgeConnection,
  clearSaveFileHandle,
  loadBridgeConnection,
  loadSaveFileHandle,
  saveBridgeConnection,
  saveSaveFileHandle,
} from './client-storage';

export interface SettingsStore {
  loadPreferences(): ClientPreferences;
  savePreferences(preferences: ClientPreferences): void;
  loadBridgeConnection(): Promise<BridgeConnection | undefined>;
  saveBridgeConnection(connection: BridgeConnection): Promise<void>;
  clearBridgeConnection(): Promise<void>;
  loadSaveFileHandle(): Promise<FileSystemFileHandle | undefined>;
  saveSaveFileHandle(handle: FileSystemFileHandle): Promise<void>;
  clearSaveFileHandle(): Promise<void>;
}

export const browserSettingsStore: SettingsStore = {
  loadPreferences: loadClientPreferences,
  savePreferences: saveClientPreferences,
  loadBridgeConnection,
  saveBridgeConnection,
  clearBridgeConnection,
  loadSaveFileHandle,
  saveSaveFileHandle,
  clearSaveFileHandle,
};

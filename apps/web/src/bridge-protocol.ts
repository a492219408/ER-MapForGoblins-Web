export const BRIDGE_PROTOCOL_VERSION = 1;

export interface BridgeHealth {
  protocolVersion: number;
  bridgeVersion: string;
  ready: boolean;
  pairing: 'ONE_TIME_LINK';
  sameOriginWeb: boolean;
}

export interface BridgePairResponse {
  protocolVersion: number;
  accessToken: string;
}

export interface BridgeSaveStatus {
  protocolVersion: number;
  ready: boolean;
  fileName: string;
  size: number;
  lastModified: string | null;
  revision: string | null;
  errorCode: 'FILE_MISSING' | 'FILE_UNREADABLE' | null;
}

export interface BridgeConnection {
  baseUrl: string;
  accessToken: string;
  connectedAt: string;
}

export interface BridgePairingRequest {
  baseUrl: string;
  pairingToken: string;
}

export interface BridgeSaveSnapshot {
  bytes: ArrayBuffer;
  fileName: string;
  revision: string;
  lastModified?: string;
}

export type BridgeStateCode =
  | 'UNCONFIGURED'
  | 'CHECKING'
  | 'PAIRING'
  | 'CONNECTED_IDLE'
  | 'READING'
  | 'UP_TO_DATE'
  | 'OFFLINE'
  | 'AUTH_REQUIRED'
  | 'ORIGIN_REJECTED'
  | 'FILE_MISSING'
  | 'VERSION_MISMATCH'
  | 'PARSE_PENDING'
  | 'ERROR';

export interface BridgeState {
  code: BridgeStateCode;
  message: string;
  detail: string;
  fileName?: string;
  lastModified?: string;
  revision?: string;
  bytes?: number;
}

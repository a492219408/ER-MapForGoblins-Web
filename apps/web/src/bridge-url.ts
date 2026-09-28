import type { BridgePairingRequest } from './bridge-protocol';

const CONNECT_PREFIX = '#/connect?';

export function readPairingRequest(hash: string): BridgePairingRequest | undefined {
  if (!hash.startsWith(CONNECT_PREFIX)) {
    return undefined;
  }
  const parameters = new URLSearchParams(hash.slice(CONNECT_PREFIX.length));
  const bridge = parameters.get('bridge');
  const pairingToken = parameters.get('pair');
  if (!bridge || !pairingToken || pairingToken.length < 32) {
    return undefined;
  }
  return {
    baseUrl: normalizeBridgeBaseUrl(bridge),
    pairingToken,
  };
}

export function normalizeBridgeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('存档桥接器地址必须使用 HTTP 或 HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('存档桥接器地址不能包含凭据、参数或片段');
  }
  if (url.protocol === 'http:' && !isLocalNetworkHost(url.hostname)) {
    throw new Error('非加密的存档桥接器必须位于本机或私有网络');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

export function isLocalNetworkHost(hostName: string): boolean {
  const host = hostName.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host.includes(':') && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb'))) return true;

  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127);
}

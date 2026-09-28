import { BRIDGE_PROTOCOL_VERSION, type BridgeConnection, type BridgeHealth, type BridgePairResponse, type BridgePairingRequest, type BridgeSaveStatus } from './bridge-protocol';

export class BridgeClientError extends Error {
  constructor(
    readonly code: 'OFFLINE' | 'AUTH_REQUIRED' | 'ORIGIN_REJECTED' | 'VERSION_MISMATCH' | 'PAIRING_REJECTED' | 'ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'BridgeClientError';
  }
}

export async function pairWithBridge(request: BridgePairingRequest): Promise<BridgeConnection> {
  const health = await requestJson<BridgeHealth>(request.baseUrl, '/v1/health');
  assertProtocol(health.protocolVersion);
  const paired = await requestJson<BridgePairResponse>(request.baseUrl, '/v1/pair', {
    method: 'POST',
    headers: { Authorization: `Pair ${request.pairingToken}` },
  });
  assertProtocol(paired.protocolVersion);
  if (paired.accessToken.length < 32) {
    throw new BridgeClientError('ERROR', 'Bridge 返回了无效的访问令牌');
  }
  return { baseUrl: request.baseUrl, accessToken: paired.accessToken, connectedAt: new Date().toISOString() };
}

export class SaveBridgeClient {
  constructor(private readonly connection: BridgeConnection) {}

  async health(): Promise<BridgeHealth> {
    const health = await requestJson<BridgeHealth>(this.connection.baseUrl, '/v1/health');
    assertProtocol(health.protocolVersion);
    return health;
  }

  async status(): Promise<BridgeSaveStatus> {
    const status = await requestJson<BridgeSaveStatus>(this.connection.baseUrl, '/v1/status', this.authenticated());
    assertProtocol(status.protocolVersion);
    return status;
  }

  async readSave(expectedRevision?: string): Promise<{ bytes: ArrayBuffer; revision: string | null }> {
    const response = await bridgeFetch(this.connection.baseUrl, '/v1/save', this.authenticated({
      headers: expectedRevision ? { 'If-None-Match': `"${expectedRevision}"` } : undefined,
    }));
    if (!response.ok) await throwResponseError(response);
    return {
      bytes: await response.arrayBuffer(),
      revision: response.headers.get('ETag')?.replaceAll('"', '') ?? null,
    };
  }

  private authenticated(overrides: RequestInit = {}): RequestInit {
    const headers = new Headers(overrides.headers);
    headers.set('Authorization', `Bearer ${this.connection.accessToken}`);
    return { ...overrides, headers };
  }
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await bridgeFetch(baseUrl, path, init);
  if (!response.ok) await throwResponseError(response);
  return response.json() as Promise<T>;
}

async function bridgeFetch(baseUrl: string, path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const requestInit = {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
      targetAddressSpace: 'local',
    } as RequestInit;
    return await fetch(new URL(path, `${baseUrl}/`), requestInit);
  } catch (error) {
    if (error instanceof BridgeClientError) throw error;
    throw new BridgeClientError('OFFLINE', '无法连接存档桥接器');
  } finally {
    window.clearTimeout(timeout);
  }
}

async function throwResponseError(response: Response): Promise<never> {
  let code = '';
  try {
    code = String((await response.json() as { code?: string }).code ?? '');
  } catch {
    // Keep the status based fallback below.
  }
  if (response.status === 401) {
    throw new BridgeClientError(code === 'PAIRING_REJECTED' ? 'PAIRING_REJECTED' : 'AUTH_REQUIRED', 'Bridge 拒绝了访问令牌');
  }
  if (response.status === 403) {
    throw new BridgeClientError('ORIGIN_REJECTED', 'Bridge 未允许当前网页来源');
  }
  throw new BridgeClientError('ERROR', `Bridge 请求失败（HTTP ${response.status}）`);
}

function assertProtocol(version: number): void {
  if (version !== BRIDGE_PROTOCOL_VERSION) {
    throw new BridgeClientError('VERSION_MISMATCH', `Bridge 协议版本 ${version} 与网页不兼容`);
  }
}

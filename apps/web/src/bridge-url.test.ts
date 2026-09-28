import { describe, expect, it } from 'vitest';
import { isLocalNetworkHost, normalizeBridgeBaseUrl, readPairingRequest } from './bridge-url';

describe('存档桥接器连接链接', () => {
  it('读取一次性连接片段', () => {
    const request = readPairingRequest('#/connect?bridge=http%3A%2F%2F192.168.1.8%3A51337&pair=abcdefghijklmnopqrstuvwxyz1234567890');
    expect(request).toEqual({
      baseUrl: 'http://192.168.1.8:51337',
      pairingToken: 'abcdefghijklmnopqrstuvwxyz1234567890',
    });
  });

  it('拒绝公开网络上的明文 Bridge', () => {
    expect(() => normalizeBridgeBaseUrl('http://example.com:51337')).toThrow(/私有网络/);
    expect(normalizeBridgeBaseUrl('https://bridge.example.com/')).toBe('https://bridge.example.com');
  });

  it.each(['localhost', '127.0.0.1', '10.2.3.4', '172.31.2.1', '192.168.3.5', '100.88.1.2', 'deck.local', '::1'])(
    '识别本地网络地址：%s',
    (host) => expect(isLocalNetworkHost(host)).toBe(true),
  );
});

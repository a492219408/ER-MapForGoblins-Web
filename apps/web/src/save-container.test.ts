import { describe, expect, it } from 'vitest';
import { inspectPcSaveContainer, PC_BND4_MINIMUM_BYTES, SaveContainerError } from './save-container';

describe('PC 存档容器字节级预检', () => {
  it('接受完整的 BND4 十槽位容器', () => {
    const buffer = new ArrayBuffer(PC_BND4_MINIMUM_BYTES);
    new Uint8Array(buffer, 0, 4).set([0x42, 0x4e, 0x44, 0x34]);
    expect(inspectPcSaveContainer(buffer)).toEqual({
      format: 'PC_BND4',
      slotCount: 10,
      byteLength: PC_BND4_MINIMUM_BYTES,
    });
  });

  it('拒绝错误魔数', () => {
    expect(() => inspectPcSaveContainer(new Uint8Array([0x53, 0x4c, 0x32, 0]).buffer))
      .toThrowError(expect.objectContaining<Partial<SaveContainerError>>({ code: 'UNSUPPORTED_MAGIC' }));
  });

  it('区分截断的 BND4 输入', () => {
    const buffer = new Uint8Array([0x42, 0x4e, 0x44, 0x34]).buffer;
    expect(() => inspectPcSaveContainer(buffer))
      .toThrowError(expect.objectContaining<Partial<SaveContainerError>>({ code: 'TRUNCATED_INPUT' }));
  });
});

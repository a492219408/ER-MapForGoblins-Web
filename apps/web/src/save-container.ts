export const PC_BND4_MINIMUM_BYTES = 0x1ba03c0;

export type SaveContainerErrorCode = 'TRUNCATED_INPUT' | 'UNSUPPORTED_MAGIC';

export class SaveContainerError extends Error {
  constructor(readonly code: SaveContainerErrorCode, message: string) {
    super(message);
    this.name = 'SaveContainerError';
  }
}

export interface PcSaveContainerInfo {
  format: 'PC_BND4';
  slotCount: 10;
  byteLength: number;
}

export function inspectPcSaveContainer(buffer: ArrayBuffer): PcSaveContainerInfo {
  if (buffer.byteLength < 4) {
    throw new SaveContainerError('TRUNCATED_INPUT', '存档不足 4 字节，无法读取容器魔数');
  }
  const magic = new Uint8Array(buffer, 0, 4);
  if (magic[0] !== 0x42 || magic[1] !== 0x4e || magic[2] !== 0x44 || magic[3] !== 0x34) {
    throw new SaveContainerError('UNSUPPORTED_MAGIC', '文件不是 PC 版 BND4 存档');
  }
  if (buffer.byteLength < PC_BND4_MINIMUM_BYTES) {
    throw new SaveContainerError('TRUNCATED_INPUT', 'PC 存档长度不足，文件可能仍在写入或已经截断');
  }
  return { format: 'PC_BND4', slotCount: 10, byteLength: buffer.byteLength };
}

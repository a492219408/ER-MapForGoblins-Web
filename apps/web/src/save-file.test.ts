import { describe, expect, it } from 'vitest';
import { isSupportedSaveFileName } from './save-file';

describe('isSupportedSaveFileName', () => {
  it.each(['ER0000.sl2', 'character.ERR', ' character.err ', '基准.co2', 'CUSTOM.CO2'])('接受受支持的 PC 存档：%s', (name) => {
    expect(isSupportedSaveFileName(name)).toBe(true);
  });

  it.each(['ER0000.sl2.bak', 'notes.txt', ''])('拒绝非存档文件：%s', (name) => {
    expect(isSupportedSaveFileName(name)).toBe(false);
  });
});

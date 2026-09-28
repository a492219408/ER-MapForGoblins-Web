import { describe, expect, it } from 'vitest';
import {
  gaItemCountForSaveVersion,
  MAX_VERIFIED_SAVE_LAYOUT_VERSION,
} from './save-layout-version';

describe('PC 存档布局版本', () => {
  it('覆盖旧格式、1.16.2 与 1.17 的动态物品表长度', () => {
    expect(gaItemCountForSaveVersion(81)).toBe(5_118);
    expect(gaItemCountForSaveVersion(252)).toBe(5_120);
    expect(gaItemCountForSaveVersion(260)).toBe(5_120);
  });

  it('拒绝尚未用受控存档验证的未来布局', () => {
    expect(MAX_VERIFIED_SAVE_LAYOUT_VERSION).toBe(260);
    expect(() => gaItemCountForSaveVersion(261)).toThrow('高于已验证上限 260');
  });
});

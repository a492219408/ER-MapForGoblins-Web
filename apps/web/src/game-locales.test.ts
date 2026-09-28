import { describe, expect, it } from 'vitest';
import { formatGameLocaleName, GAME_LOCALES, resolveGameLocale } from './game-locales';

describe('game locale labels', () => {
  it('covers every Steam language', () => {
    expect(GAME_LOCALES).toHaveLength(15);
    expect(new Set(GAME_LOCALES).size).toBe(15);
  });

  it('uses CLDR native names and full-width punctuation in Chinese UI', () => {
    expect(formatGameLocaleName('en-US', 'zh-CN')).toBe('English（英语）');
    expect(formatGameLocaleName('ko-KR', 'zh-CN')).toBe('한국어（韩语）');
    expect(formatGameLocaleName('zh-CN', 'zh-CN')).toBe('简体中文');
    expect(formatGameLocaleName('es-419', 'zh-CN')).toBe('español (Latinoamérica)（西班牙语（拉丁美洲））');
  });

  it('uses half-width punctuation in most non-Chinese UIs', () => {
    expect(formatGameLocaleName('ko-KR', 'en-US')).toBe('한국어 (Korean)');
  });

  it('does not repeat an identical native and translated name', () => {
    expect(formatGameLocaleName('en-US', 'en-US')).toBe('English');
  });

  it('automatically maps browser locales to supported game locales', () => {
    expect(resolveGameLocale('auto', ['zh-Hant-HK'])).toBe('zh-TW');
    expect(resolveGameLocale('auto', ['es-MX'])).toBe('es-419');
    expect(resolveGameLocale('auto', ['es-ES'])).toBe('es-ES');
    expect(resolveGameLocale('auto', ['pt-PT'])).toBe('pt-BR');
    expect(resolveGameLocale('auto', ['xx-XX', 'ja'])).toBe('ja-JP');
    expect(resolveGameLocale('de-DE', ['ja'])).toBe('de-DE');
  });
});

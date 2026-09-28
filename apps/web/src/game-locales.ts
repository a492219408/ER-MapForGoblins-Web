export const GAME_LOCALES = [
  'zh-CN',
  'zh-TW',
  'en-US',
  'fr-FR',
  'it-IT',
  'de-DE',
  'es-ES',
  'ja-JP',
  'ko-KR',
  'pl-PL',
  'pt-BR',
  'ru-RU',
  'es-419',
  'th-TH',
  'ar-AE',
] as const;

export type GameLocale = typeof GAME_LOCALES[number];
export type GameLocalePreference = GameLocale | 'auto';

const displayLocaleByGameLocale: Record<GameLocale, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'en-US': 'en',
  'fr-FR': 'fr',
  'it-IT': 'it',
  'de-DE': 'de',
  'es-ES': 'es-ES',
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'pl-PL': 'pl',
  'pt-BR': 'pt-BR',
  'ru-RU': 'ru',
  'es-419': 'es-419',
  'th-TH': 'th',
  'ar-AE': 'ar',
};

const nativeNameOverrides: Partial<Record<GameLocale, string>> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

export function isGameLocale(value: string): value is GameLocale {
  return GAME_LOCALES.includes(value as GameLocale);
}

export function resolveGameLocale(
  preference: string,
  browserLocales: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages,
): GameLocale {
  if (isGameLocale(preference)) return preference;
  for (const candidate of browserLocales) {
    const matched = matchBrowserLocale(candidate);
    if (matched) return matched;
  }
  return 'zh-CN';
}

function matchBrowserLocale(value: string): GameLocale | undefined {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(value);
  } catch {
    return undefined;
  }
  const exact = GAME_LOCALES.find((candidate) => candidate.toLowerCase() === locale.baseName.toLowerCase());
  if (exact) return exact;
  if (locale.language === 'zh') {
    return locale.script === 'Hant' || ['TW', 'HK', 'MO'].includes(locale.region ?? '') ? 'zh-TW' : 'zh-CN';
  }
  if (locale.language === 'es') {
    return locale.region === 'ES' ? 'es-ES' : 'es-419';
  }
  return ({
    en: 'en-US', fr: 'fr-FR', it: 'it-IT', de: 'de-DE', ja: 'ja-JP', ko: 'ko-KR',
    pl: 'pl-PL', pt: 'pt-BR', ru: 'ru-RU', th: 'th-TH', ar: 'ar-AE',
  } as Partial<Record<string, GameLocale>>)[locale.language];
}

/**
 * 语言名称由浏览器内置的 CLDR 数据生成。地区只在 Steam 明确区分的
 * 西班牙语和巴西葡萄牙语中保留，避免把 English 显示成“美国英语”。
 */
export function formatGameLocaleName(gameLocale: GameLocale, interfaceLocale = 'zh-CN'): string {
  const displayLocale = displayLocaleByGameLocale[gameLocale];
  const nativeName = nativeNameOverrides[gameLocale] ?? displayName(displayLocale, gameLocale);
  if (gameLocale.toLocaleLowerCase() === interfaceLocale.toLocaleLowerCase()) return nativeName;
  const translatedName = displayName(displayLocale, interfaceLocale);
  if (normalizedName(nativeName) === normalizedName(translatedName)) return nativeName;
  return usesFullWidthParentheses(interfaceLocale)
    ? `${nativeName}（${translatedName}）`
    : `${nativeName} (${translatedName})`;
}

function displayName(locale: string, displayLocale: string): string {
  return new Intl.DisplayNames([displayLocale], {
    type: 'language',
    languageDisplay: 'standard',
  }).of(locale) ?? locale;
}

function normalizedName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function usesFullWidthParentheses(locale: string): boolean {
  return new Intl.Locale(locale).language === 'zh';
}

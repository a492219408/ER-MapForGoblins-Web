import { formatGameLocaleName, GAME_LOCALES, resolveGameLocale } from './game-locales';

interface GameLocaleSelectProps {
  value: string;
  interfaceLocale: string;
  onChange(value: string): void;
}

export function GameLocaleSelect({ value, interfaceLocale, onChange }: GameLocaleSelectProps) {
  const automaticLocale = resolveGameLocale('auto');
  const automaticName = formatGameLocaleName(automaticLocale, interfaceLocale);
  const fullWidth = new Intl.Locale(interfaceLocale).language === 'zh';
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="auto">
        {fullWidth ? `自动检测（${automaticName}）` : `Automatic (${automaticName})`}
      </option>
      {GAME_LOCALES.map((gameLocale) => (
        <option key={gameLocale} value={gameLocale}>
          {formatGameLocaleName(gameLocale, interfaceLocale)}
        </option>
      ))}
    </select>
  );
}

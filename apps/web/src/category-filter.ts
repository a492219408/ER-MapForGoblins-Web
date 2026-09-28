import { localizedText, type MarkerCategoryDefinition } from './dataset';

export function filterCategoryDefinitions(
  categories: readonly MarkerCategoryDefinition[],
  query: string,
  locale: string,
): MarkerCategoryDefinition[] {
  const term = query.trim().toLocaleLowerCase(locale);
  if (!term) return [...categories];
  return categories.filter((category) => [
    category.id,
    category.configKey,
    localizedText(category.labels, locale),
    localizedText(category.descriptions, locale),
    localizedText(category.labels, 'en-US'),
    localizedText(category.descriptions, 'en-US'),
  ].some((value) => value.toLocaleLowerCase(locale).includes(term)));
}

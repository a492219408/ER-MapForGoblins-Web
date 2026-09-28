/** Resolve build-time asset paths against the current page before using URL(). */
export function resolveAssetBases(configuredBase: string | undefined, documentBase: string): string[] {
  const configured = configuredBase?.trim();
  if (configured) {
    return [new URL(`${configured.replace(/\/+$/, '')}/`, documentBase).toString()];
  }
  return [...new Set([
    new URL('.', documentBase).toString(),
    new URL('assets/', documentBase).toString(),
  ])];
}

export const SUPPORTED_SAVE_EXTENSIONS = ['.co2', '.err', '.sl2'] as const;
export const SAVE_FILE_ACCEPT = SUPPORTED_SAVE_EXTENSIONS.join(',');

export function isSupportedSaveFileName(fileName: string): boolean {
  const normalizedName = fileName.trim().toLowerCase();
  return SUPPORTED_SAVE_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
}

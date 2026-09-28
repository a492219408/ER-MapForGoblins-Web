export function nextLevelRuneCost(level: number): number | undefined {
  if (!Number.isInteger(level) || level < 1 || level >= 713) return undefined;
  const adjusted = Math.max(0, (level + 81 - 92) * 0.02);
  return Math.floor((adjusted + 0.1) * (level + 81) ** 2) + 1;
}

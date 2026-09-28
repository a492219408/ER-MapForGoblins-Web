export const CAPITAL_ASHEN_STORY_FLAG = 118;

export type CapitalState = 'royal' | 'ashen';
export type CapitalPreference = 'auto' | CapitalState;

export function deriveCapitalState(readFlag: (flagId: number) => boolean | undefined): CapitalState | undefined {
  const ashen = readFlag(CAPITAL_ASHEN_STORY_FLAG);
  return ashen === undefined ? undefined : ashen ? 'ashen' : 'royal';
}

export function resolveCapitalState(
  preference: CapitalPreference,
  saveState: CapitalState | undefined,
): CapitalState {
  return preference === 'auto' ? saveState ?? 'royal' : preference;
}

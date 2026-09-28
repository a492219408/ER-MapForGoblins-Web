export interface GameRelease {
  applicationVersion?: string;
  calibrationsVersion?: string;
  executableFileVersion?: string;
  regulationInternalVersion?: number;
  shadowOfTheErdtreeArchivePresent?: boolean;
  sourceFingerprint?: string;
  regulationSha256?: string;
}

export function formatGameRelease(release: GameRelease | undefined): string {
  if (!release) return '未记录';
  const parts = [
    release.applicationVersion ? `App ${release.applicationVersion}` : undefined,
    release.calibrationsVersion ? `Cal. ${release.calibrationsVersion}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '未记录';
}

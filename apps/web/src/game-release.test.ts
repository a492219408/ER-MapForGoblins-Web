import { describe, expect, it } from 'vitest';
import { formatGameRelease } from './game-release';

describe('game release metadata', () => {
  it('formats the public application and calibrations versions', () => {
    expect(formatGameRelease({ applicationVersion: '1.17', calibrationsVersion: '1.17' }))
      .toBe('App 1.17 · Cal. 1.17');
  });

  it('keeps old manifests readable', () => {
    expect(formatGameRelease(undefined)).toBe('未记录');
  });
});

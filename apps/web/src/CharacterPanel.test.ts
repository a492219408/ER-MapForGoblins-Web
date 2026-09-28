import { describe, expect, it } from 'vitest';
import { nextLevelRuneCost } from './character-data';

describe('nextLevelRuneCost', () => {
  it('matches the level-one game cost', () => {
    expect(nextLevelRuneCost(1)).toBe(673);
  });

  it('does not offer another level above the cap', () => {
    expect(nextLevelRuneCost(713)).toBeUndefined();
  });
});

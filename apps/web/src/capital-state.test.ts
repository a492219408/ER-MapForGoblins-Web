import { describe, expect, it } from 'vitest';
import { CAPITAL_ASHEN_STORY_FLAG, deriveCapitalState, resolveCapitalState } from './capital-state';

describe('王城状态', () => {
  it('使用故事旗标 118 区分王城和灰城', () => {
    expect(deriveCapitalState((flag) => flag === CAPITAL_ASHEN_STORY_FLAG)).toBe('ashen');
    expect(deriveCapitalState(() => false)).toBe('royal');
    expect(deriveCapitalState(() => undefined)).toBeUndefined();
  });

  it('自动模式无法判断时默认王城，手动选择优先', () => {
    expect(resolveCapitalState('auto', undefined)).toBe('royal');
    expect(resolveCapitalState('auto', 'ashen')).toBe('ashen');
    expect(resolveCapitalState('royal', 'ashen')).toBe('royal');
  });
});

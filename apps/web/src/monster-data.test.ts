import { describe, expect, it } from 'vitest';
import {
  localizedMonsterLocation,
  localizedMonsterName,
  searchMonsters,
  type MonsterEntry,
} from './monster-data';

const enemies = [
  {
    key: 'a',
    location: 'Abandoned Cave',
    locationLabels: { 'zh-CN': '废弃洞窟' },
    name: 'Cleanrot Knight',
    labels: { 'zh-CN': '尊腐骑士', 'en-US': 'Cleanrot Knight' },
    id: '38001940',
  },
  { key: 'b', location: 'Limgrave', name: 'Tree Sentinel', id: '31000000' },
] as MonsterEntry[];

describe('monster search', () => {
  it('matches name, area and ID with AND tokens', () => {
    expect(searchMonsters(enemies, 'cleanrot cave').map(({ key }) => key)).toEqual(['a']);
    expect(searchMonsters(enemies, '尊腐 废弃').map(({ key }) => key)).toEqual(['a']);
    expect(searchMonsters(enemies, '31000000').map(({ key }) => key)).toEqual(['b']);
  });

  it('returns every entry for an empty query', () => {
    expect(searchMonsters(enemies, '  ')).toHaveLength(2);
  });

  it('uses the requested official locale and falls back to English/default text', () => {
    expect(localizedMonsterName(enemies[0], 'zh-CN')).toBe('尊腐骑士');
    expect(localizedMonsterName(enemies[0], 'fr-FR')).toBe('Cleanrot Knight');
    expect(localizedMonsterLocation(enemies[1], 'zh-CN')).toBe('Limgrave');
  });
});

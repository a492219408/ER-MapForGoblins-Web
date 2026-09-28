import { describe, expect, it } from 'vitest';
import { loadClientPreferences } from './client-settings';

describe('客户端轻量偏好 Cookie', () => {
  it('只读取受支持的设置', () => {
    const value = encodeURIComponent(JSON.stringify({
      version: 1,
      refreshInterval: 10,
      selectedSlot: 3,
      locale: 'ja-JP',
      hiddenCategories: ['WorldBosses', 'WorldBosses', 42, 'x'.repeat(65)],
    }));
    expect(loadClientPreferences(`other=x; mfg_preferences_v1=${value}`)).toEqual({
      version: 1,
      refreshInterval: 10,
      selectedSlot: 3,
      locale: 'ja-JP',
      hiddenCategories: ['WorldBosses'],
      capitalPreference: 'auto',
      datasetProfile: 'vanilla',
      followPlayerLocation: false,
      mapPlane: 'surface',
      mapZoom: null,
      mapCenters: {},
      monsterCycle: 0,
      monsterDlcCompleted: false,
      showShadowOfTheErdtreeItems: true,
      showTarnishedPackItems: true,
      itemCategory: 'melee',
    });
  });

  it('损坏时回退到默认值', () => {
    expect(loadClientPreferences('mfg_preferences_v1=%not-json')).toMatchObject({
      refreshInterval: 5,
      selectedSlot: null,
      hiddenCategories: [],
      capitalPreference: 'auto',
      datasetProfile: 'vanilla',
      followPlayerLocation: false,
      mapPlane: 'surface',
      mapZoom: null,
      mapCenters: {},
      monsterCycle: 0,
      monsterDlcCompleted: false,
      showShadowOfTheErdtreeItems: true,
      showTarnishedPackItems: true,
      itemCategory: 'melee',
    });
  });

  it('保存怪物列表的周目和 DLC 通关选择', () => {
    const value = encodeURIComponent(JSON.stringify({ version: 1, monsterCycle: 7, monsterDlcCompleted: true }));
    const invalid = encodeURIComponent(JSON.stringify({ version: 1, monsterCycle: 8, monsterDlcCompleted: 'yes' }));
    expect(loadClientPreferences(`mfg_preferences_v1=${value}`)).toMatchObject({ monsterCycle: 7, monsterDlcCompleted: true });
    expect(loadClientPreferences(`mfg_preferences_v1=${invalid}`)).toMatchObject({ monsterCycle: 0, monsterDlcCompleted: false });
  });

  it('只接受已知的标记 Profile', () => {
    const value = encodeURIComponent(JSON.stringify({ version: 1, datasetProfile: 'err' }));
    expect(loadClientPreferences(`mfg_preferences_v1=${value}`).datasetProfile).toBe('err');
  });

  it('保存当前位置跟随偏好且不接受其他真值', () => {
    const enabled = encodeURIComponent(JSON.stringify({ version: 1, followPlayerLocation: true }));
    const invalid = encodeURIComponent(JSON.stringify({ version: 1, followPlayerLocation: 'true' }));
    expect(loadClientPreferences(`mfg_preferences_v1=${enabled}`).followPlayerLocation).toBe(true);
    expect(loadClientPreferences(`mfg_preferences_v1=${invalid}`).followPlayerLocation).toBe(false);
  });

  it('保存有界的地图缩放倍率', () => {
    const valid = encodeURIComponent(JSON.stringify({ version: 1, mapZoom: 4.12345 }));
    const tooLarge = encodeURIComponent(JSON.stringify({ version: 1, mapZoom: 13 }));
    expect(loadClientPreferences(`mfg_preferences_v1=${valid}`).mapZoom).toBe(4.123);
    expect(loadClientPreferences(`mfg_preferences_v1=${tooLarge}`).mapZoom).toBeNull();
  });

  it('按地图平面保存并校验地图中心', () => {
    const valid = encodeURIComponent(JSON.stringify({
      version: 1,
      mapPlane: 'underground',
      mapCenters: {
        surface: [12.12345678, -34.87654321],
        underground: [-5, 6],
        shadow: [999, 0],
      },
    }));
    expect(loadClientPreferences(`mfg_preferences_v1=${valid}`)).toMatchObject({
      mapPlane: 'underground',
      mapCenters: {
        surface: [12.123457, -34.876543],
        underground: [-5, 6],
      },
    });
  });

  it('新用户默认自动检测游戏文本语言', () => {
    expect(loadClientPreferences('')).toMatchObject({
      locale: 'auto',
      showShadowOfTheErdtreeItems: true,
      showTarnishedPackItems: true,
    });
  });

  it('保存物品数据库的内容包筛选', () => {
    const value = encodeURIComponent(JSON.stringify({
      version: 1,
      showShadowOfTheErdtreeItems: false,
      showTarnishedPackItems: false,
    }));
    expect(loadClientPreferences(`mfg_preferences_v1=${value}`)).toMatchObject({
      showShadowOfTheErdtreeItems: false,
      showTarnishedPackItems: false,
    });
  });

  it('保存物品数据库的分类选择并校验长度', () => {
    const value = encodeURIComponent(JSON.stringify({ version: 1, itemCategory: 'ranged' }));
    const invalid = encodeURIComponent(JSON.stringify({ version: 1, itemCategory: 'x'.repeat(65) }));
    expect(loadClientPreferences(`mfg_preferences_v1=${value}`).itemCategory).toBe('ranged');
    expect(loadClientPreferences(`mfg_preferences_v1=${invalid}`).itemCategory).toBe('melee');
  });
});

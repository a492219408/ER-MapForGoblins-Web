import { describe, expect, it } from 'vitest';
import { MarkerStateCode } from './marker-state';
import {
  COMPLETED_GRACE_ICON_SCALE,
  markerIconKey,
  markerIconOpacity,
  markerIconScaleFactor,
  markerShowsDiagnosticDot,
} from './marker-icon-render';

const grace = { category: 'WorldGraces', iconId: 20 };
const mapFragment = { category: 'WorldMaps', iconId: 64 };
const item = { category: 'KeyItems', iconId: 7 };

describe('目录标记图标渲染', () => {
  it('可获取赐福使用发光图标，已完成赐福使用官方圆形图标且不变暗', () => {
    expect(markerIconKey(grace, MarkerStateCode.AVAILABLE)).toBe('mfg-20');
    expect(markerIconKey(grace, MarkerStateCode.COLLECTED)).toBe('world-map-1');
    expect(markerIconKey(grace, MarkerStateCode.COLLECTED, true)).toBe('world-map-2');
    expect(markerIconOpacity(grace, MarkerStateCode.COLLECTED)).toBe(1);
    expect(markerIconScaleFactor(grace, MarkerStateCode.COLLECTED)).toBe(COMPLETED_GRACE_ICON_SCALE);
    expect(markerIconScaleFactor(grace, MarkerStateCode.AVAILABLE)).toBe(1);
  });

  it('其他已完成标记仍使用其 MFG 图标和原有弱化效果', () => {
    expect(markerIconKey(item, MarkerStateCode.COLLECTED)).toBe('mfg-7');
    expect(markerIconOpacity(item, MarkerStateCode.COLLECTED)).toBe(0.3);
    expect(markerIconScaleFactor(item, MarkerStateCode.COLLECTED)).toBe(1);
  });

  it('已取得地图碎片仍保持可辨认，但与未取得状态有透明度差异', () => {
    expect(markerIconKey(mapFragment, MarkerStateCode.COLLECTED)).toBe('mfg-64');
    expect(markerIconOpacity(mapFragment, MarkerStateCode.COLLECTED)).toBe(0.72);
    expect(markerIconOpacity(mapFragment, MarkerStateCode.AVAILABLE)).toBe(1);
  });

  it('只给已加载存档中的未确认状态保留诊断圆点', () => {
    expect(markerShowsDiagnosticDot(true, MarkerStateCode.UNKNOWN)).toBe(true);
    expect(markerShowsDiagnosticDot(false, MarkerStateCode.UNKNOWN)).toBe(false);
    expect(markerShowsDiagnosticDot(true, MarkerStateCode.AVAILABLE)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { controlBarHref, readAppPage, readControlPanel } from './control-bar-state';

describe('control bar URL state', () => {
  it('keeps save connection independent from the current page', () => {
    expect(readAppPage('?page=monsters&panel=save')).toBe('monsters');
    expect(readControlPanel('monsters', '?page=monsters&panel=save')).toBe('save');
    expect(controlBarHref('monsters', 'save')).toBe('?page=monsters&panel=save');
  });

  it('uses the current page panel when the parameter is absent or incompatible', () => {
    expect(readControlPanel('items', '?page=items')).toBe('items');
    expect(readControlPanel('items', '?page=items&panel=map')).toBe('items');
  });

  it('creates shareable URLs for all primary pages', () => {
    expect(controlBarHref('map', 'map')).toBe('?panel=map');
    expect(controlBarHref('monsters', 'monsters')).toBe('?page=monsters&panel=monsters');
    expect(controlBarHref('items', 'items')).toBe('?page=items&panel=items');
  });
});

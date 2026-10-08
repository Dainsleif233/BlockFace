import { describe, expect, it, vi } from 'vitest';
import { HeadCache } from './headCache';
import type { SkinTexture } from '../skin/texture';

function mockSkin(id: string, scale = 1): SkinTexture {
  return {
    id,
    image: {} as HTMLImageElement,
    meta: {
      width: 64 * scale,
      height: 64 * scale,
      scale,
      legacy: false,
      valid: true,
      label: `${64 * scale}×${64 * scale}`,
    },
    origin: 'builtin',
    sourceLabel: id,
    tainted: false,
  };
}

describe('HeadCache', () => {
  it('命中缓存时返回同一个 canvas 实例且不重复渲染', () => {
    const mockRenderer = vi.fn((_skin, _options) => ({ id: Math.random() }) as unknown as HTMLCanvasElement);
    const cache = new HeadCache(10, mockRenderer);
    const skin = mockSkin('steve');

    const first = cache.get(skin, true, 64);
    const second = cache.get(skin, true, 64);

    expect(mockRenderer).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('帽子层不同或尺寸不同时生成独立的缓存项', () => {
    const mockRenderer = vi.fn((_skin, _options) => ({ id: Math.random() }) as unknown as HTMLCanvasElement);
    const cache = new HeadCache(10, mockRenderer);
    const skin = mockSkin('steve');

    const withOverlay = cache.get(skin, true, 64);
    const withoutOverlay = cache.get(skin, false, 64);
    const diffSize = cache.get(skin, true, 128);

    expect(mockRenderer).toHaveBeenCalledTimes(3);
    expect(withOverlay).not.toBe(withoutOverlay);
    expect(withOverlay).not.toBe(diffSize);
  });

  it('超出容量限制时按 LRU 顺序淘汰最久未访问的条目', () => {
    const mockRenderer = vi.fn((_skin, options) => ({ size: options.pixelSize }) as unknown as HTMLCanvasElement);
    const cache = new HeadCache(3, mockRenderer);
    const skin = mockSkin('steve');

    cache.get(skin, true, 10); // entry 1
    cache.get(skin, true, 20); // entry 2
    cache.get(skin, true, 30); // entry 3

    // 此时访问 entry 1，让它刷新为最新使用
    cache.get(skin, true, 10);

    // 插入 entry 4，应该淘汰 entry 2（因为 entry 1 刚被访问过）
    cache.get(skin, true, 40);

    // 重新访问 entry 2，应该重新渲染（mockRenderer 重新触发）
    mockRenderer.mockClear();
    cache.get(skin, true, 20);
    expect(mockRenderer).toHaveBeenCalledTimes(1);

    // 再次访问 entry 1，应该依然在缓存中（无重复渲染）
    mockRenderer.mockClear();
    cache.get(skin, true, 10);
    expect(mockRenderer).toHaveBeenCalledTimes(0);
  });

  it('evictSkin 可以精确淘汰指定皮肤的所有缓存条目', () => {
    const mockRenderer = vi.fn(() => ({}) as unknown as HTMLCanvasElement);
    const cache = new HeadCache(10, mockRenderer);
    const skinA = mockSkin('steve');
    const skinB = mockSkin('alex');

    cache.get(skinA, true, 64);
    cache.get(skinA, false, 64);
    cache.get(skinB, true, 64);

    expect(mockRenderer).toHaveBeenCalledTimes(3);

    // 淘汰 skinA
    cache.evictSkin('steve');

    mockRenderer.mockClear();
    // skinB 依然在缓存中
    cache.get(skinB, true, 64);
    expect(mockRenderer).toHaveBeenCalledTimes(0);

    // skinA 已被清除，需要重新渲染
    cache.get(skinA, true, 64);
    expect(mockRenderer).toHaveBeenCalledTimes(1);
  });

  it('clear 清空所有缓存', () => {
    const mockRenderer = vi.fn(() => ({}) as unknown as HTMLCanvasElement);
    const cache = new HeadCache(10, mockRenderer);
    const skin = mockSkin('steve');

    cache.get(skin, true, 64);
    cache.clear();

    mockRenderer.mockClear();
    cache.get(skin, true, 64);
    expect(mockRenderer).toHaveBeenCalledTimes(1);
  });
});

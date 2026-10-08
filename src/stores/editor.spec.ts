/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { LoadedImage } from '../core/sources/imageLoader';
import {
  addLayer,
  clearUnusedSkins,
  editor,
  getSkin,
  registerSkin,
  removeLayer,
  removeSkin,
  undo,
} from './editor';

function createMockLoadedImage(width = 64, height = 64): LoadedImage {
  return {
    element: {} as HTMLImageElement,
    width,
    height,
    tainted: false,
    url: 'mock://skin.png',
  };
}

describe('editor store - 素材管理与历史栈保护', () => {
  beforeEach(() => {
    editor.layers = [];
    editor.selectedId = null;
    clearUnusedSkins(); // 清理上一轮测试遗留的闲置素材
  });

  it('内置皮肤不允许删除', () => {
    const result = removeSkin('builtin-steve');
    expect(result).toBe(false);
  });

  it('正在被画布图层使用的素材不允许删除', () => {
    const custom = registerSkin(createMockLoadedImage(), 'upload', '测试皮肤1', '上传', 'skin-test-1');
    addLayer(custom.id);

    const deleted = removeSkin(custom.id);
    expect(deleted).toBe(false);
    expect(getSkin(custom.id)).not.toBeNull();
  });

  it('图层删除进入撤销历史后，素材仍受历史保护不可删除，undo 后素材完好', () => {
    const custom = registerSkin(createMockLoadedImage(), 'upload', '测试皮肤2', '上传', 'skin-test-2');
    const layer = addLayer(custom.id);

    // 删除图层，此时操作被压入 past 历史栈
    removeLayer(layer.id);
    expect(editor.layers.length).toBe(0);

    // 尝试删除该素材，应当被历史保护拦截
    const deleted = removeSkin(custom.id);
    expect(deleted).toBe(false);
    expect(getSkin(custom.id)).not.toBeNull();

    // 尝试批量清理闲置素材，由于该素材存在于历史栈中，也不应被清理
    const cleaned = clearUnusedSkins();
    expect(cleaned).toBe(0);
    expect(getSkin(custom.id)).not.toBeNull();

    // 撤销删除，图层重新回到画布，关联的素材完好存在
    undo();
    expect(editor.layers.length).toBe(1);
    expect(editor.layers[0].skinId).toBe(custom.id);
    expect(getSkin(editor.layers[0].skinId)).not.toBeNull();
  });

  it('没有任何图层或历史引用的真正闲置素材可以被正常清理', () => {
    const custom = registerSkin(createMockLoadedImage(), 'upload', '闲置皮肤', '上传', 'skin-unused-99');
    expect(getSkin(custom.id)).not.toBeNull();

    const cleaned = clearUnusedSkins();
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(getSkin(custom.id)).toBeNull();
  });
});

/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { describe, expect, it } from 'vitest';
import {
  clampLayerToDocument,
  handlePosition,
  hitTestHandle,
  hitTestLayer,
  layerCorners,
  normalizeAngle,
  resizeFromHandle,
  rotationFromHandle,
  toDocument,
  toLocal,
} from './transform';

const base = { x: 100, y: 100, size: 100, rotation: 0 };

describe('坐标互转', () => {
  it('旋转 90° 时局部→文档→局部可往返', () => {
    const layer = { x: 50, y: 60, rotation: 90 };
    const doc = toDocument(layer, 10, 20);
    const back = toLocal(layer, doc.x, doc.y);
    expect(back.x).toBeCloseTo(10, 6);
    expect(back.y).toBeCloseTo(20, 6);
  });

  it('四角顺序为 左上→右上→右下→左下，无旋转时与几何一致', () => {
    const [nw, ne, se, sw] = layerCorners(base);
    expect(nw).toEqual({ x: 50, y: 50 });
    expect(ne).toEqual({ x: 150, y: 50 });
    expect(se).toEqual({ x: 150, y: 150 });
    expect(sw).toEqual({ x: 50, y: 150 });
  });
});

describe('hitTestLayer', () => {
  it('中心与边上命中，外部不命中', () => {
    expect(hitTestLayer(base, 100, 100)).toBe(true);
    expect(hitTestLayer(base, 50, 50)).toBe(true);
    expect(hitTestLayer(base, 149, 149)).toBe(true);
    expect(hitTestLayer(base, 151, 100)).toBe(false);
    expect(hitTestLayer(base, 100, 49)).toBe(false);
  });

  it('旋转 45° 后，原本在正上方的点落到方块内', () => {
    const rotated = { ...base, rotation: 45 };
    expect(hitTestLayer(rotated, 100, 20)).toBe(false);
    expect(hitTestLayer({ ...base, rotation: 0 }, 100, 20)).toBe(false);
    // 旋转后对角线方向延伸，右上角外侧的点反而落在方块内
    expect(hitTestLayer(rotated, 100 + 69, 100 + 1)).toBe(true);
  });
});

describe('resizeFromHandle', () => {
  it('拖右下角时左上角保持不动，尺寸跟随指针', () => {
    const result = resizeFromHandle({ layer: base, handle: 'se', point: { x: 200, y: 200 } });
    expect(result).toEqual({ x: 125, y: 125, size: 150 });
    expect(result.x - result.size / 2).toBe(50);
    expect(result.y - result.size / 2).toBe(50);
  });

  it('拖左上角时右下角保持不动', () => {
    const result = resizeFromHandle({ layer: base, handle: 'nw', point: { x: 0, y: 0 } });
    expect(result).toEqual({ x: 75, y: 75, size: 150 });
    expect(result.x + result.size / 2).toBe(150);
  });

  it('旋转 90° 时依然以对角为锚点', () => {
    const layer = { ...base, rotation: 90 };
    const anchorBefore = layerCorners(layer)[0];
    const result = resizeFromHandle({ layer, handle: 'se', point: { x: 220, y: 220 } });
    const after = layerCorners({ ...layer, ...result })[0];
    expect(after.x).toBeCloseTo(anchorBefore.x, 4);
    expect(after.y).toBeCloseTo(anchorBefore.y, 4);
  });

  it('尺寸被下限保护，不会翻面或归零', () => {
    const result = resizeFromHandle({ layer: base, handle: 'se', point: { x: -500, y: -500 } });
    expect(result.size).toBe(16);
  });
});

describe('旋转手柄', () => {
  it('手柄在正上方时为 0°', () => {
    expect(rotationFromHandle(base, { x: 100, y: 20 })).toBeCloseTo(0, 6);
  });

  it('手柄在正右方时为 90°', () => {
    expect(rotationFromHandle(base, { x: 200, y: 100 })).toBeCloseTo(90, 6);
  });

  it('指针位于右上 45° 方向时吸附到 45°', () => {
    expect(rotationFromHandle({ x: 0, y: 0 }, { x: 100, y: -100 }, 15)).toBeCloseTo(45, 6);
  });

  it('未开启吸附时保留精确角度', () => {
    const angle = rotationFromHandle({ x: 0, y: 0 }, { x: 100, y: -20 });
    expect(angle).toBeCloseTo(78.69, 1);
  });

  it('规范化到 (-180, 180]', () => {
    expect(normalizeAngle(370)).toBeCloseTo(10, 6);
    expect(normalizeAngle(-190)).toBeCloseTo(170, 6);
    expect(normalizeAngle(180)).toBe(180);
  });
});

describe('手柄命中', () => {
  it('默认旋转手柄在方块上方 24px 处', () => {
    const point = handlePosition(base, 'rotate', 24);
    expect(point.x).toBeCloseTo(100, 6);
    expect(point.y).toBeCloseTo(50 - 24, 6);
  });

  it('容差内命中 se 手柄', () => {
    expect(hitTestHandle(base, 153, 153, 6)).toBe('se');
    expect(hitTestHandle(base, 190, 190, 6)).toBeNull();
  });
});

describe('边界约束', () => {
  it('图层不会整体移出文档', () => {
    const result = clampLayerToDocument({ x: -9999, y: 9999, size: 100 }, 800, 600);
    expect(result.x).toBe(-25);
    expect(result.y).toBe(625);
  });
});

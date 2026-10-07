/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { describe, expect, it } from 'vitest';
import {
  coverBaseView,
  isCoverBaseView,
  MAX_BASE_SCALE,
  MIN_BASE_SCALE,
  normalizeWheelDelta,
  ROTATE_PER_NOTCH,
  scaleSizeBy,
  tidyAngle,
  wheelRotation,
  wheelZoomFactor,
  zoomBaseView,
  ZOOM_PER_NOTCH,
} from './gesture';

describe('滚轮读数归一化', () => {
  it('像素模式原样保留', () => {
    expect(normalizeWheelDelta(53)).toBe(53);
    expect(normalizeWheelDelta(-53)).toBe(-53);
  });

  it('行模式按 16 像素一行换算', () => {
    expect(normalizeWheelDelta(3, 1)).toBe(48);
    expect(normalizeWheelDelta(-3, 1)).toBe(-48);
  });

  it('页模式按 100 像素一页换算', () => {
    expect(normalizeWheelDelta(2, 2)).toBe(200);
  });

  it('离谱的大读数被夹在三格以内', () => {
    expect(normalizeWheelDelta(99999)).toBe(300);
    expect(normalizeWheelDelta(-99999)).toBe(-300);
  });
});

describe('滚轮缩放倍率', () => {
  it('往上滚是放大，往下滚是缩小', () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(ZOOM_PER_NOTCH, 6);
    expect(wheelZoomFactor(100)).toBeCloseTo(1 / ZOOM_PER_NOTCH, 6);
  });

  it('三格滚轮的倍率相乘', () => {
    expect(wheelZoomFactor(-300)).toBeCloseTo(ZOOM_PER_NOTCH ** 3, 6);
  });

  it('触控板的小读数给出小倍率（连续缩放而不是一格一跳）', () => {
    const small = wheelZoomFactor(-10);
    expect(small).toBeGreaterThan(1);
    expect(small).toBeLessThan(1.02);
  });

  it('行模式与像素模式在同一读数下一致', () => {
    expect(wheelZoomFactor(-6, 1)).toBeCloseTo(wheelZoomFactor(-96), 6);
  });
});

describe('滚轮旋转角度', () => {
  it('一格 5 度，往上滚是顺时针', () => {
    expect(wheelRotation(-100)).toBeCloseTo(ROTATE_PER_NOTCH, 6);
    expect(wheelRotation(100)).toBeCloseTo(-ROTATE_PER_NOTCH, 6);
  });

  it('角度取两位小数并规范化到 (-180, 180]', () => {
    expect(tidyAngle(33.400000000000006)).toBe(33.4);
    expect(tidyAngle(190)).toBe(-170);
    expect(tidyAngle(-180)).toBe(180);
  });
});

describe('滚轮改尺寸', () => {
  it('按倍率缩放并取整', () => {
    expect(scaleSizeBy(200, 1.12, 16, 800)).toBe(224);
    expect(scaleSizeBy(200, 1 / 1.12, 16, 800)).toBe(179);
  });

  it('小尺寸下每格至少动 1 像素', () => {
    expect(scaleSizeBy(16, 1.001, 16, 800)).toBe(17);
    expect(scaleSizeBy(17, 0.999, 16, 800)).toBe(16);
  });

  it('上下限都是硬的', () => {
    expect(scaleSizeBy(16, 0.5, 16, 800)).toBe(16);
    expect(scaleSizeBy(800, 2, 16, 800)).toBe(800);
  });
});

describe('底图摆放', () => {
  it('底图与画布同尺寸时是 100%、左上对齐', () => {
    expect(coverBaseView(1280, 800, 1280, 800)).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('长宽比不同时按 cover 铺满并居中', () => {
    // 400×800 的竖图放进 800×400 的横画布：宽度是瓶颈，放大 2 倍，超出的高度上下各切一半
    const view = coverBaseView(400, 800, 800, 400);
    expect(view.scale).toBeCloseTo(2, 6);
    expect(view.x).toBeCloseTo(0, 6);
    expect(view.y).toBeCloseTo((400 - 1600) / 2, 6);
  });

  it('横向宽出画布时同样居中（另一条瓶颈边）', () => {
    // 1000×500 的横图放进 500×500 的方画布：高度违反直觉但确实是瓶颈，缩放 1 倍，左右各切一半
    const view = coverBaseView(1000, 500, 500, 500);
    expect(view.scale).toBeCloseTo(1, 6);
    expect(view.x).toBeCloseTo((500 - 1000) / 2, 6);
    expect(view.y).toBeCloseTo(0, 6);
  });

  it('尺寸不合法时退回原样，不产生 NaN', () => {
    expect(coverBaseView(0, 100, 800, 600)).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('认得出来"还在原来那个位置"', () => {
    expect(isCoverBaseView({ x: 0, y: 0, scale: 1 }, 1280, 800, 1280, 800)).toBe(true);
    expect(isCoverBaseView({ x: 0, y: 0, scale: 1.5 }, 1280, 800, 1280, 800)).toBe(false);
    expect(isCoverBaseView({ x: 40, y: 0, scale: 1 }, 1280, 800, 1280, 800)).toBe(false);
  });
});

describe('以光标为锚点缩放底图', () => {
  it('光标下的那个像素停在原地', () => {
    const before = { x: 0, y: 0, scale: 1 };
    const anchor = { x: 300, y: 200 };
    const after = zoomBaseView(before, anchor, 2);
    expect(after.scale).toBe(2);
    // 锚点在图片坐标系里的位置（相对左上角除以缩放）不变
    expect((anchor.x - after.x) / after.scale).toBeCloseTo((anchor.x - before.x) / before.scale, 6);
    expect((anchor.y - after.y) / after.scale).toBeCloseTo((anchor.y - before.y) / before.scale, 6);
  });

  it('连续两次缩放等于一次两格', () => {
    const start = { x: 12, y: -8, scale: 1 };
    const once = zoomBaseView(zoomBaseView(start, { x: 100, y: 100 }, 1.12), { x: 100, y: 100 }, 1.12);
    const twice = zoomBaseView(start, { x: 100, y: 100 }, 1.12 * 1.12);
    expect(once.scale).toBeCloseTo(twice.scale, 6);
    expect(once.x).toBeCloseTo(twice.x, 6);
    expect(once.y).toBeCloseTo(twice.y, 6);
  });

  it('缩放被上下限夹住，锚点不会因此漂移', () => {
    const huge = zoomBaseView({ x: 0, y: 0, scale: MAX_BASE_SCALE }, { x: 50, y: 50 }, 2);
    expect(huge.scale).toBe(MAX_BASE_SCALE);
    expect(huge.x).toBe(0);
    const tiny = zoomBaseView({ x: 0, y: 0, scale: MIN_BASE_SCALE }, { x: 50, y: 50 }, 0.5);
    expect(tiny.scale).toBe(MIN_BASE_SCALE);
    expect(tiny.x).toBe(0);
  });

  it('不改变入参本身', () => {
    const view = { x: 1, y: 2, scale: 1 };
    zoomBaseView(view, { x: 10, y: 10 }, 2);
    expect(view).toEqual({ x: 1, y: 2, scale: 1 });
  });
});

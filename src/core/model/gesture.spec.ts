/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  normalizeWheelDelta,
  ROTATE_PER_NOTCH,
  scaleSizeBy,
  tidyAngle,
  wheelRotation,
  wheelZoomFactor,
  zoomViewAt,
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

  it('倍率为 1 时保持原尺寸（如零读数或停止滚轮）', () => {
    expect(scaleSizeBy(200, 1, 16, 800)).toBe(200);
    expect(scaleSizeBy(16, 1, 16, 800)).toBe(16);
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

describe('以光标为锚点缩放画布视图', () => {
  // 照真实布局来算：画布在舞台里居中（居中位置随尺寸变化），view.x/y 是叠加的平移
  const WRAP_W = 1000;
  const WRAP_H = 700;
  const DOC_W = 800;
  const DOC_H = 600;
  const sizeOf = (zoom: number) => ({ width: DOC_W * zoom, height: DOC_H * zoom });
  const leftOf = (view: { zoom: number; x: number }) => (WRAP_W - sizeOf(view.zoom).width) / 2 + view.x;
  const topOf = (view: { zoom: number; y: number }) => (WRAP_H - sizeOf(view.zoom).height) / 2 + view.y;
  const docAt = (view: { zoom: number; x: number; y: number }, cursor: { x: number; y: number }) => ({
    x: (cursor.x - leftOf(view)) / view.zoom,
    y: (cursor.y - topOf(view)) / view.zoom,
  });
  const offsetOf = (view: { zoom: number; x: number; y: number }, cursor: { x: number; y: number }) => ({
    x: cursor.x - leftOf(view),
    y: cursor.y - topOf(view),
  });

  it('光标底下的内容停在原地', () => {
    const view = { zoom: 1, x: 0, y: 0 };
    const cursor = { x: 500, y: 320 };
    const before = docAt(view, cursor);

    const after = zoomViewAt(view, offsetOf(view, cursor), sizeOf(view.zoom), 2);
    const now = docAt(after, cursor);

    expect(after.zoom).toBe(2);
    expect(now.x).toBeCloseTo(before.x, 6);
    expect(now.y).toBeCloseTo(before.y, 6);
  });

  it('在已经平移过、且倍率不是 1 的视图上缩放，锚点依然不动', () => {
    const view = { zoom: 1.5, x: -120, y: 64 };
    const cursor = { x: 260, y: 180 };
    const before = docAt(view, cursor);

    const after = zoomViewAt(view, offsetOf(view, cursor), sizeOf(view.zoom), 1 / 1.12);
    expect(docAt(after, cursor).x).toBeCloseTo(before.x, 6);
    expect(docAt(after, cursor).y).toBeCloseTo(before.y, 6);
  });

  it('连着滚两格，锚点始终不动（等于一次两格）', () => {
    const start = { zoom: 1, x: 0, y: 0 };
    const cursor = { x: 300, y: 200 };

    const first = zoomViewAt(start, offsetOf(start, cursor), sizeOf(start.zoom), 1.12);
    const second = zoomViewAt(first, offsetOf(first, cursor), sizeOf(first.zoom), 1.12);
    const both = zoomViewAt(start, offsetOf(start, cursor), sizeOf(start.zoom), 1.12 * 1.12);

    expect(second.zoom).toBeCloseTo(both.zoom, 6);
    expect(second.x).toBeCloseTo(both.x, 6);
    expect(second.y).toBeCloseTo(both.y, 6);
    expect(docAt(second, cursor).x).toBeCloseTo(docAt(start, cursor).x, 6);
  });

  it('缩放到上下限就停住，平移也不会跟着漂', () => {
    const huge = zoomViewAt({ zoom: MAX_ZOOM, x: 12, y: -8 }, { x: 100, y: 100 }, { width: 100, height: 100 }, 2);
    expect(huge).toEqual({ zoom: MAX_ZOOM, x: 12, y: -8 });
    const tiny = zoomViewAt({ zoom: MIN_ZOOM, x: 12, y: -8 }, { x: 100, y: 100 }, { width: 100, height: 100 }, 0.5);
    expect(tiny).toEqual({ zoom: MIN_ZOOM, x: 12, y: -8 });
  });

  it('不改变入参本身', () => {
    const view = { zoom: 1, x: 5, y: 6 };
    zoomViewAt(view, { x: 10, y: 10 }, { width: 100, height: 100 }, 2);
    expect(view).toEqual({ zoom: 1, x: 5, y: 6 });
  });
});

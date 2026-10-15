/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { describe, expect, it } from 'vitest';
import {
  clampRenderScale,
  MAX_CANVAS_EDGE,
  MAX_CANVAS_PIXELS,
} from './compose';

describe('clampRenderScale', () => {
  it('在安全范围内保持原缩放倍率不变', () => {
    // 默认文档 1280x800，scale = 1
    expect(clampRenderScale(1280, 800, 1)).toBe(1);
    // scale = 2 => 2560x1600 (4.096M pixels <= 16M, 2560 <= 4096)
    expect(clampRenderScale(1280, 800, 2)).toBe(2);
  });

  it('单边超出 MAX_CANVAS_EDGE 时钳位缩放倍率', () => {
    // 1280x800，如果缩放为 6x => 7680x4800，超过 4096
    // 限制为 4096 / 1280 = 3.2
    const clamped = clampRenderScale(1280, 800, 6);
    expect(clamped).toBeCloseTo(3.2, 5);
    expect(Math.round(1280 * clamped)).toBe(MAX_CANVAS_EDGE);
    expect(Math.round(800 * clamped)).toBeLessThanOrEqual(MAX_CANVAS_EDGE);
  });

  it('超高分辨率底图自动根据最大边长下调倍率', () => {
    // 8000x4000 的大底图，即使 desiredScale = 1，也必须被限制在 4096 以内
    const clamped = clampRenderScale(8000, 4000, 1);
    expect(clamped).toBeCloseTo(4096 / 8000, 5);
    expect(Math.round(8000 * clamped)).toBe(4096);
    expect(Math.round(4000 * clamped)).toBe(2048);
  });

  it('总像素超出 MAX_CANVAS_PIXELS 时钳位缩放倍率', () => {
    // 4000x4000（本身 16M 像素），若 desiredScale = 2 则达 64M 像素
    // 像素上限 16,777,216 => scale 限制为 sqrt(16777216 / 16000000) = 1.024
    const clamped = clampRenderScale(4000, 4000, 2);
    expect(clamped).toBeCloseTo(1.024, 4);
    const totalPixels = Math.round(4000 * clamped) * Math.round(4000 * clamped);
    expect(totalPixels).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });

  it('自定义 maxEdge 与 maxPixels 参数生效', () => {
    expect(clampRenderScale(1000, 1000, 2, 1500, 10000000)).toBe(1.5);
  });

  it('非法尺寸或倍率优雅返回 1', () => {
    expect(clampRenderScale(0, 800, 2)).toBe(1);
    expect(clampRenderScale(1280, -10, 2)).toBe(1);
    expect(clampRenderScale(1280, 800, 0)).toBe(1);
  });
});

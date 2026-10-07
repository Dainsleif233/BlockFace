/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { describe, expect, it } from 'vitest';
import { assertUsableSkin, describeSkin } from './texture';

describe('describeSkin', () => {
  it('识别 64×64 标准皮肤', () => {
    const meta = describeSkin(64, 64);
    expect(meta.valid).toBe(true);
    expect(meta.scale).toBe(1);
    expect(meta.legacy).toBe(false);
    expect(meta.label).toBe('64×64 · 标准');
  });

  it('识别 64×32 旧版皮肤并保持 scale = 1', () => {
    const meta = describeSkin(64, 32);
    expect(meta.valid).toBe(true);
    expect(meta.legacy).toBe(true);
    expect(meta.scale).toBe(1);
    expect(meta.label).toContain('旧版');
  });

  it.each([
    [128, 128, 2],
    [256, 256, 4],
    [512, 512, 8],
  ])('识别 %i×%i 高清皮肤，倍率 %i', (w, h, scale) => {
    const meta = describeSkin(w, h);
    expect(meta.valid).toBe(true);
    expect(meta.scale).toBe(scale);
    expect(meta.label).toContain('高清');
  });

  it('识别 128×64 高清旧版格式', () => {
    const meta = describeSkin(128, 64);
    expect(meta.valid).toBe(true);
    expect(meta.legacy).toBe(true);
    expect(meta.scale).toBe(2);
  });

  it.each([
    [63, 63],
    [64, 40],
    [100, 100],
    [64, 128],
    [32, 32],
  ])('拒绝不合法尺寸 %i×%i', (w, h) => {
    expect(describeSkin(w, h).valid).toBe(false);
    expect(() => assertUsableSkin(describeSkin(w, h))).toThrow();
  });
});

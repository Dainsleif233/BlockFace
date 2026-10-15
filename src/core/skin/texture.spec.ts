/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { describe, expect, it } from 'vitest';
import { assertUsableSkin, describeCustomImage, describeSkin } from './texture';

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

  it('识别 16×8 正脸双层格式', () => {
    const meta = describeSkin(16, 8);
    expect(meta.valid).toBe(true);
    expect(meta.frontOnly).toBe(true);
    expect(meta.scale).toBe(1);
    expect(meta.label).toBe('16×8 · 正脸双层');
  });

  it('识别 32×16 高清正脸双层格式', () => {
    const meta = describeSkin(32, 16);
    expect(meta.valid).toBe(true);
    expect(meta.frontOnly).toBe(true);
    expect(meta.scale).toBe(2);
    expect(meta.label).toContain('正脸双层（高清 ×2）');
  });

  it('显式指定 forceFrontOnly 区分 64×32 高清正脸与旧版格式', () => {
    const legacy = describeSkin(64, 32);
    expect(legacy.legacy).toBe(true);
    expect(legacy.frontOnly).toBe(false);
    expect(legacy.scale).toBe(1);

    const front = describeSkin(64, 32, true);
    expect(front.legacy).toBe(false);
    expect(front.frontOnly).toBe(true);
    expect(front.scale).toBe(4);
    expect(front.label).toContain('正脸双层（高清 ×4）');
  });

  it.each([
    [63, 63],
    [64, 40],
    [64, 16],
    [100, 100],
    [64, 128],
    [32, 32],
  ])('拒绝不合法尺寸 %i×%i', (w, h) => {
    expect(describeSkin(w, h).valid).toBe(false);
    expect(() => assertUsableSkin(describeSkin(w, h))).toThrow();
  });
});

describe('describeCustomImage', () => {
  it('正确识别合法尺寸的头像图片', () => {
    const meta = describeCustomImage(800, 600);
    expect(meta.valid).toBe(true);
    expect(meta.isCustomImage).toBe(true);
    expect(meta.scale).toBe(1);
    expect(meta.label).toBe('800×600 · 头像图片');
    expect(() => assertUsableSkin(meta)).not.toThrow();
  });

  it('拒绝非法尺寸的图片', () => {
    const meta = describeCustomImage(0, 0);
    expect(meta.valid).toBe(false);
    expect(() => assertUsableSkin(meta)).toThrow();
  });
});

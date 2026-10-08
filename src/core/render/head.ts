/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { HAT_REGIONS, HEAD_REGIONS, type Region } from '../skin/regions';
import type { SkinTexture } from '../skin/texture';

export interface HeadRenderOptions {
  /** 是否叠上帽子层（皮肤第二层，UV 同区域 x + 32） */
  overlay: boolean;
  /** 头像边长（设备像素） */
  pixelSize: number;
  /** 强制指定高清倍率；缺省时从皮肤元信息推导 */
  scale?: number;
}

/** 头像在文档里的外接正方形；命中测试与缩放都按它算 */
export function headBounds(size: number): { width: number; height: number } {
  return { width: size, height: size };
}

function drawRegion(
  ctx: CanvasRenderingContext2D,
  skin: SkinTexture,
  region: Region,
  scale: number,
  size: number,
): void {
  ctx.drawImage(
    skin.image,
    region[0] * scale,
    region[1] * scale,
    region[2] * scale,
    region[3] * scale,
    0,
    0,
    size,
    size,
  );
}

/**
 * 把头像的正脸渲染到一张离屏 canvas（正方形）。
 *
 * 平面正脸 = 皮肤贴图的正面 8×8 区域放大到目标尺寸；高清皮肤按 `scale = 宽 / 64`
 * 折算源坐标，因此 64 / 128 / 256 / 512 走的是同一条代码路径。
 * 采样强制 nearest-neighbor（imageSmoothingEnabled = false）以保住像素边缘。
 *
 * 先画基础层再画帽子层：第二层的半透明像素直接以 source-over 压在脸上，
 * 与游戏内的渲染顺序一致。
 */
export function renderHeadCanvas(skin: SkinTexture, options: HeadRenderOptions): HTMLCanvasElement {
  const scale = options.scale ?? skin.meta.scale;
  const size = Math.max(1, Math.round(options.pixelSize));

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D');

  if (skin.meta.isCustomImage) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const imgWidth = skin.meta.width;
    const imgHeight = skin.meta.height;
    const aspect = imgWidth / imgHeight;
    let dw = size;
    let dh = size;
    let dx = 0;
    let dy = 0;
    if (aspect > 1) {
      dh = size / aspect;
      dy = (size - dh) / 2;
    } else if (aspect < 1) {
      dw = size * aspect;
      dx = (size - dw) / 2;
    }
    ctx.drawImage(skin.image, dx, dy, dw, dh);
    return canvas;
  }

  ctx.imageSmoothingEnabled = false;

  drawRegion(ctx, skin, HEAD_REGIONS.front, scale, size);
  if (options.overlay) drawRegion(ctx, skin, HAT_REGIONS.front, scale, size);

  return canvas;
}

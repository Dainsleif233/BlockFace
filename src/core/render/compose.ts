/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { toRadians } from '../model/transform';
import type { AvatarLayer } from '../model/types';
import type { SkinTexture } from '../skin/texture';
import { headCache, type HeadCache } from './headCache';

export interface ComposeItem {
  layer: AvatarLayer;
  skin: SkinTexture;
}

export interface ComposeOptions {
  /** 文档逻辑尺寸 */
  width: number;
  height: number;
  /** 输出倍率，1 = 文档原始分辨率，2 = 二倍图 */
  scale?: number;
  baseImage?: CanvasImageSource | null;
  items: ComposeItem[];
  /** 底图适配方式：默认 cover 铺满画布 */
  fit?: 'cover' | 'contain';
  /** 预览用的棋盘透明底（导出时关闭） */
  checkerboard?: boolean;
  cache?: HeadCache;
}

/** 单个头像离屏渲染的设备像素上限，避免超大图层导致 OOM */
const MAX_HEAD_PIXELS = 2048;

function drawCheckerboard(ctx: CanvasRenderingContext2D, width: number, height: number, cell: number): void {
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      ctx.fillStyle = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? '#2b2d34' : '#23252b';
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

function drawFitted(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  fit: 'cover' | 'contain',
): void {
  const source = image as HTMLImageElement;
  const iw = source.naturalWidth || source.width;
  const ih = source.naturalHeight || source.height;
  if (!iw || !ih) return;
  const ratio = fit === 'cover' ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih);
  const w = iw * ratio;
  const h = ih * ratio;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

/**
 * 把「底图 + 若干头像图层」合成为一张图。
 *
 * 这是**预览与导出共用的唯一渲染入口**——预览与导出各写一套是本类工具最经典的 bug 来源
 * （屏幕上好好的，导出的图位置偏了）。任何新的绘制需求都必须加在这里，不许在组件里另开一份。
 *
 * 头像按「输出设备像素」渲染后再贴合，因此导出二倍图时像素边缘依旧锐利，而不是被放大插值。
 */
export function composeDocument(canvas: HTMLCanvasElement, options: ComposeOptions): void {
  const scale = options.scale ?? 1;
  const width = Math.max(1, Math.round(options.width * scale));
  const height = Math.max(1, Math.round(options.height * scale));
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (options.checkerboard) {
    drawCheckerboard(ctx, width, height, Math.max(8, Math.round(16 * scale)));
  }

  if (options.baseImage) {
    drawFitted(ctx, options.baseImage, width, height, options.fit ?? 'cover');
  }

  const cache = options.cache ?? headCache;
  ctx.save();
  ctx.scale(scale, scale);
  for (const item of options.items) {
    const { layer, skin } = item;
    if (!layer.visible || layer.size <= 0) continue;

    const devicePixels = Math.min(MAX_HEAD_PIXELS, Math.max(1, Math.round(layer.size * scale)));
    const head = cache.get(skin, layer.overlay, devicePixels);

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity));
    ctx.translate(layer.x, layer.y);
    ctx.rotate(toRadians(layer.rotation));
    if (layer.flipH) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = devicePixels < layer.size * scale - 0.5;
    ctx.drawImage(head, -layer.size / 2, -layer.size / 2, layer.size, layer.size);
    ctx.restore();
  }
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

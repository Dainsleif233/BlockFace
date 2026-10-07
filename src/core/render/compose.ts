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

/** 底图的摆放：左上角坐标 + 缩放倍率，单位都是文档像素 */
export interface BasePlacement {
  image: CanvasImageSource;
  /** 左上角（文档坐标） */
  x: number;
  y: number;
  /** 1 = 原始像素大小 */
  scale: number;
}

export interface ComposeOptions {
  /** 文档逻辑尺寸 */
  width: number;
  height: number;
  /** 输出倍率，1 = 文档原始分辨率，2 = 二倍图 */
  scale?: number;
  /** 底图及其摆放：位置与缩放由交互层决定，这里只负责照着画 */
  base?: BasePlacement | null;
  items: ComposeItem[];
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

function drawBase(ctx: CanvasRenderingContext2D, base: BasePlacement): void {
  const source = base.image as HTMLImageElement;
  const iw = source.naturalWidth || source.width;
  const ih = source.naturalHeight || source.height;
  if (!iw || !ih || !(base.scale > 0)) return;
  ctx.drawImage(base.image, base.x, base.y, iw * base.scale, ih * base.scale);
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

  if (options.base) {
    // 底图坐标是文档单位，跟着输出倍率一起放大，预览与导出才不会各偏各的
    ctx.save();
    ctx.scale(scale, scale);
    drawBase(ctx, options.base);
    ctx.restore();
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

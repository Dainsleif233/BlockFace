/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import type { SkinTexture } from '../skin/texture';
import { renderHeadCanvas } from './head';

interface Entry {
  canvas: HTMLCanvasElement;
  key: string;
}

export type HeadRenderer = (skin: SkinTexture, options: { overlay: boolean; pixelSize: number }) => HTMLCanvasElement;

/**
 * 头像离屏渲染缓存。
 * 拖动/缩放时每帧都要重绘文档，但头像本身只在「皮肤 / 帽子层 / 像素尺寸」变化时重算。
 * 缓存上限 48 张，超出按插入顺序淘汰。
 */
export class HeadCache {
  private entries = new Map<string, Entry>();
  private limit: number;
  private renderer: HeadRenderer;

  constructor(limit = 48, renderer: HeadRenderer = renderHeadCanvas) {
    this.limit = limit;
    this.renderer = renderer;
  }

  get(skin: SkinTexture, overlay: boolean, pixelSize: number): HTMLCanvasElement {
    const size = Math.max(1, Math.round(pixelSize));
    const key = `${skin.id}|${overlay ? 1 : 0}|${size}|${skin.meta.scale}`;
    const hit = this.entries.get(key);
    if (hit) {
      // LRU 淘汰：命中时将该项移动到 Map 末尾
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.canvas;
    }

    const canvas = this.renderer(skin, { overlay, pixelSize: size });
    this.entries.set(key, { canvas, key });
    if (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return canvas;
  }

  /** 清除特定皮肤的所有缓存条目（例如素材被删除时） */
  evictSkin(skinId: string): void {
    const prefix = `${skinId}|`;
    for (const key of Array.from(this.entries.keys())) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export const headCache = new HeadCache();

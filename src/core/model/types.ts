/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

/** 一个可拖拽/缩放/旋转的头像图层 */
export interface AvatarLayer {
  id: string;
  /** 指向已加载皮肤的 id */
  skinId: string;
  /** 图层面板显示名 */
  name: string;
  /** 是否绘制帽子层（皮肤第二层） */
  overlay: boolean;
  /** 中心点，文档坐标系（左上为原点） */
  x: number;
  y: number;
  /** 外接正方形边长，文档像素 */
  size: number;
  /** 顺时针旋转角度（度） */
  rotation: number;
  /** 0–1 */
  opacity: number;
  flipH: boolean;
  visible: boolean;
}

export interface BaseImageMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  tainted: boolean;
}

export interface DocumentMeta {
  width: number;
  height: number;
}

export type HandleName = 'nw' | 'ne' | 'se' | 'sw' | 'rotate';

export const MIN_LAYER_SIZE = 16;
export const MAX_LAYER_SIZE = 4096;

let counter = 0;

/** 生成稳定且可读的 id */
export function createId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

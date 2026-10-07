/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { normalizeAngle } from './transform';

/**
 * 交互手势的数学。这里只有纯函数：事件打在哪个元素上、画布多大、光标在哪，
 * 都由组件负责换算成坐标再传进来 —— 这样每一条手感规则都能被单测钉死。
 */

/** 底图在文档里的摆放：左上角坐标 + 缩放倍率（1 = 原始像素大小） */
export interface BaseView {
  x: number;
  y: number;
  scale: number;
}

export const MIN_BASE_SCALE = 0.1;
export const MAX_BASE_SCALE = 8;
/** 滚轮一格（约 100 像素读数）的缩放倍率 */
export const ZOOM_PER_NOTCH = 1.12;
/** 滚轮一格（约 100 像素读数）的旋转角度 */
export const ROTATE_PER_NOTCH = 5;
/** 单个滚轮事件最多算三格：某些设备一抖就是几千像素，不夹住会把图层直接甩飞 */
const MAX_NOTCHES = 3;

/**
 * 归一化滚轮读数：deltaMode 0 = 像素、1 = 行、2 = 页。
 * 触控板上蹭出来的小读数原样保留，所以缩放是连续的，不会一跳一跳。
 */
export function normalizeWheelDelta(deltaY: number, deltaMode = 0): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1;
  const raw = deltaY * unit;
  const limit = 100 * MAX_NOTCHES;
  return Math.max(-limit, Math.min(limit, raw));
}

/** 滚轮 → 缩放倍率；往上滚（deltaY < 0）是放大 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  return Math.pow(ZOOM_PER_NOTCH, -normalizeWheelDelta(deltaY, deltaMode) / 100);
}

/** 滚轮 → 旋转增量（度）；往上滚是顺时针 */
export function wheelRotation(deltaY: number, deltaMode = 0): number {
  return (-normalizeWheelDelta(deltaY, deltaMode) / 100) * ROTATE_PER_NOTCH;
}

/** 角度保留两位小数并规范化：模型里存 33.4，别存 33.400000000000006 */
export function tidyAngle(degrees: number): number {
  return normalizeAngle(Math.round(degrees * 100) / 100);
}

/**
 * 按倍率改边长。小尺寸下纯比例缩放会被四舍五入吃掉（16 × 1.001 没动静），
 * 所以放大时至少 +1、缩小时至少 -1，保证每一格滚轮都有反馈。
 */
export function scaleSizeBy(size: number, factor: number, min: number, max: number): number {
  const scaled = size * factor;
  const stepped = factor > 1 ? Math.max(size + 1, Math.round(scaled)) : Math.min(size - 1, Math.round(scaled));
  return Math.min(max, Math.max(min, stepped));
}

/** 底图按 cover 铺满画布时的摆放；画布与底图同尺寸时正好是 100%、左上对齐 */
export function coverBaseView(
  imageWidth: number,
  imageHeight: number,
  docWidth: number,
  docHeight: number,
): BaseView {
  if (!(imageWidth > 0) || !(imageHeight > 0) || !(docWidth > 0) || !(docHeight > 0)) {
    return { x: 0, y: 0, scale: 1 };
  }
  const scale = Math.max(docWidth / imageWidth, docHeight / imageHeight);
  return {
    x: (docWidth - imageWidth * scale) / 2,
    y: (docHeight - imageHeight * scale) / 2,
    scale,
  };
}

/** 以光标为锚点缩放底图：光标底下那个像素在缩放前后停在原地 */
export function zoomBaseView(view: BaseView, point: { x: number; y: number }, factor: number): BaseView {
  const scale = Math.min(MAX_BASE_SCALE, Math.max(MIN_BASE_SCALE, view.scale * factor));
  if (scale === view.scale) return { ...view };
  const k = scale / view.scale;
  return {
    scale,
    x: point.x - (point.x - view.x) * k,
    y: point.y - (point.y - view.y) * k,
  };
}

/** 是否还停在"刚打开图片"的位置（决定要不要显示「底图复位」） */
export function isCoverBaseView(
  view: BaseView,
  imageWidth: number,
  imageHeight: number,
  docWidth: number,
  docHeight: number,
): boolean {
  const cover = coverBaseView(imageWidth, imageHeight, docWidth, docHeight);
  return (
    Math.abs(view.scale - cover.scale) < 0.005 &&
    Math.abs(view.x - cover.x) < 0.5 &&
    Math.abs(view.y - cover.y) < 0.5
  );
}

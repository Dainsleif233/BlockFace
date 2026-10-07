/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { normalizeAngle, type Point } from './transform';

/**
 * 交互手势的数学。这里只有纯函数：事件打在哪个元素上、画布多大、光标在哪，
 * 都由组件负责换算成坐标再传进来 —— 这样每一条手感规则都能被单测钉死。
 */

/** 画布在屏幕上的摆放：缩放倍率 + 平移（单位是屏幕像素） */
export interface ViewState {
  zoom: number;
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 6;
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

/**
 * 以某个点为锚点缩放**画布视图**：锚点底下的内容在缩放前后停在原地。
 *
 * offset 是光标相对画布左上角的屏幕偏移，size 是画布当前在屏幕上的尺寸。
 * 要补两笔位移：
 * 1. \`offset × (1 - k)\` —— 画布左上角会随缩放一起动，抵消锚点的漂移；
 * 2. \`size × (k - 1) / 2\` —— 画布是居中摆的，尺寸一变居中位置就跟着挪半个尺寸差。
 *    漏掉第二笔，缩放时内容会整体往一边跑（这正是画布"往右下角溜"的原因）。
 */
export function zoomViewAt(
  view: ViewState,
  offset: Point,
  size: { width: number; height: number },
  factor: number,
): ViewState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  if (zoom === view.zoom) return { ...view };
  const k = zoom / view.zoom;
  return {
    zoom,
    x: view.x + offset.x * (1 - k) + (size.width * (k - 1)) / 2,
    y: view.y + offset.y * (1 - k) + (size.height * (k - 1)) / 2,
  };
}

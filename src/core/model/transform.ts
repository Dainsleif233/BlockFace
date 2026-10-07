/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { MAX_LAYER_SIZE, MIN_LAYER_SIZE, type AvatarLayer, type HandleName } from './types';

export interface Point {
  x: number;
  y: number;
}

const RAD = Math.PI / 180;

export function toRadians(degrees: number): number {
  return degrees * RAD;
}

/** 归一化到 (-180, 180] */
export function normalizeAngle(degrees: number): number {
  let d = degrees % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** 文档坐标 → 图层局部坐标（原点在图层中心，已抵消旋转） */
export function toLocal(layer: Pick<AvatarLayer, 'x' | 'y' | 'rotation'>, px: number, py: number): Point {
  const dx = px - layer.x;
  const dy = py - layer.y;
  const r = -toRadians(layer.rotation);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** 图层局部坐标 → 文档坐标 */
export function toDocument(layer: Pick<AvatarLayer, 'x' | 'y' | 'rotation'>, lx: number, ly: number): Point {
  const r = toRadians(layer.rotation);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: layer.x + lx * cos - ly * sin, y: layer.y + lx * sin + ly * cos };
}

/** 四角（文档坐标，顺序：左上 → 右上 → 右下 → 左下） */
export function layerCorners(layer: Pick<AvatarLayer, 'x' | 'y' | 'size' | 'rotation'>): Point[] {
  const h = layer.size / 2;
  return [
    toDocument(layer, -h, -h),
    toDocument(layer, h, -h),
    toDocument(layer, h, h),
    toDocument(layer, -h, h),
  ];
}

/** 命中测试：点是否落在图层方块内 */
export function hitTestLayer(layer: Pick<AvatarLayer, 'x' | 'y' | 'size' | 'rotation'>, px: number, py: number): boolean {
  const h = layer.size / 2;
  const l = toLocal(layer, px, py);
  return Math.abs(l.x) <= h && Math.abs(l.y) <= h;
}

const CORNER_SIGN: Record<Exclude<HandleName, 'rotate'>, Point> = {
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};

/** 缩放手柄在文档坐标下的位置 */
export function handlePosition(
  layer: Pick<AvatarLayer, 'x' | 'y' | 'size' | 'rotation'>,
  handle: HandleName,
  rotateOffset = 0,
): Point {
  const h = layer.size / 2;
  if (handle === 'rotate') return toDocument(layer, 0, -h - rotateOffset);
  const s = CORNER_SIGN[handle];
  return toDocument(layer, s.x * h, s.y * h);
}

export function allHandlePositions(
  layer: Pick<AvatarLayer, 'x' | 'y' | 'size' | 'rotation'>,
  rotateOffset = 0,
): { name: HandleName; point: Point }[] {
  return (['nw', 'ne', 'se', 'sw', 'rotate'] as HandleName[]).map((name) => ({
    name,
    point: handlePosition(layer, name, rotateOffset),
  }));
}

/** 命中某个手柄；tolerance 为文档像素单位的容差 */
export function hitTestHandle(
  layer: Pick<AvatarLayer, 'x' | 'y' | 'size' | 'rotation'>,
  px: number,
  py: number,
  tolerance: number,
  rotateOffset = 0,
): HandleName | null {
  for (const { name, point } of allHandlePositions(layer, rotateOffset)) {
    if (Math.abs(point.x - px) <= tolerance && Math.abs(point.y - py) <= tolerance) return name;
  }
  return null;
}

export interface ResizeInput {
  layer: Pick<AvatarLayer, 'x' | 'y' | 'size' | 'rotation'>;
  handle: Exclude<HandleName, 'rotate'>;
  /** 指针位置（文档坐标） */
  point: Point;
  /** 按住 Shift 时锁定长宽比（本工具恒为正方形，参数保留以表达意图） */
  keepAspect?: boolean;
}

/**
 * 从角手柄缩放：**对角固定**。
 * 在图层局部坐标系内取对角点 F 与指针 P，边长 s = max(sign · (P - F))，
 * 再把新的中心点旋转回文档坐标。正方形图层的长宽比因此天然保持 1:1。
 */
export function resizeFromHandle({ layer, handle, point }: ResizeInput): { x: number; y: number; size: number } {
  const h = layer.size / 2;
  const sign = CORNER_SIGN[handle];
  const local = toLocal(layer, point.x, point.y);
  const fixed: Point = { x: -sign.x * h, y: -sign.y * h };
  const dx = local.x - fixed.x;
  const dy = local.y - fixed.y;
  const raw = Math.max(sign.x * dx, sign.y * dy);
  const size = Math.min(MAX_LAYER_SIZE, Math.max(MIN_LAYER_SIZE, raw));
  const centerLocal: Point = { x: fixed.x + (sign.x * size) / 2, y: fixed.y + (sign.y * size) / 2 };
  const center = toDocument(layer, centerLocal.x, centerLocal.y);
  return { x: center.x, y: center.y, size };
}

/** 从旋转手柄得到角度：指针相对图层中心的角度 + 90° 偏移 */
export function rotationFromHandle(
  layer: Pick<AvatarLayer, 'x' | 'y'>,
  point: Point,
  snap = 0,
): number {
  const angle = Math.atan2(point.y - layer.y, point.x - layer.x) / RAD + 90;
  const snapped = snap > 0 ? Math.round(angle / snap) * snap : angle;
  return normalizeAngle(snapped);
}

/** 把图层限制在文档范围内（至少保留一部分可见） */
export function clampLayerToDocument(
  layer: Pick<AvatarLayer, 'x' | 'y' | 'size'>,
  width: number,
  height: number,
): { x: number; y: number } {
  const margin = layer.size * 0.25;
  return {
    x: Math.min(width + layer.size - margin, Math.max(margin - layer.size, layer.x)),
    y: Math.min(height + layer.size - margin, Math.max(margin - layer.size, layer.y)),
  };
}

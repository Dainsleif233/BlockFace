/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Minecraft 皮肤纹理区域表。
 *
 * 所有坐标以 **64×64 基准皮肤**表达；高清皮肤（128/256/512）在取样时统一乘以
 * `scale = 宽度 / 64`，因此全档位共用同一套区域常量。
 *
 * 头部展开布局（64 基准）：
 * ```
 *         (8,0) 顶面                    (40,0) 帽子顶面
 *  (0,8)右 (8,8)正 (16,8)左 (24,8)背    (32,8)右 (40,8)正 (48,8)左 (56,8)背
 * ```
 * 帽子层（第二层）恒为同区域 x + 32。
 */
export type Region = readonly [u: number, v: number, w: number, h: number];

export const HEAD_REGIONS = {
  /** 头顶（v 轴向下 = 从后脑到面部） */
  top: [8, 0, 8, 8],
  /** 正面（u 轴向右 = 从角色右侧到左侧） */
  front: [8, 8, 8, 8],
  /** 角色左脸（u 轴向右 = 从面部到后脑） */
  left: [16, 8, 8, 8],
  /** 角色右脸 */
  right: [0, 8, 8, 8],
  /** 后脑 */
  back: [24, 8, 8, 8],
} as const satisfies Record<string, Region>;

export const HAT_REGIONS = {
  top: [40, 0, 8, 8],
  front: [40, 8, 8, 8],
  left: [48, 8, 8, 8],
  right: [32, 8, 8, 8],
  back: [56, 8, 8, 8],
} as const satisfies Record<string, Region>;

/** 64 基准下每个头面包含的基准像素数 */
export const FACE_PIXELS = 8;

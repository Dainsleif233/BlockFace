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
 * 皮肤贴图的元信息与校验。
 *
 * 合法贴图（社区通行标准）：
 * - `64×64` 现代格式
 * - `64×32` 旧版格式（1.7 及以前；头部区域完整，含帽子层，因此头像渲染无损）
 * - `128×128 / 256×256 / 512×512` 高清皮肤（OptiFine 社区标准，恒为 64 的整数倍）
 */
export interface SkinMeta {
  width: number;
  height: number;
  /** 高清倍率 = width / 64，用于 UV 等比缩放 */
  scale: number;
  /** 是否为 64×32 旧版格式（height * 2 === width） */
  legacy: boolean;
  valid: boolean;
  /** 中文规格标签，直接用于界面展示 */
  label: string;
  /** 是否为普通图片（非 Minecraft 皮肤贴图，无需 UV 切割正面与帽子） */
  isCustomImage?: boolean;
}

const LEGACY_LABEL = '旧版格式';
const HD_LABEL = '高清';

export function describeSkin(width: number, height: number): SkinMeta {
  const square = width === height;
  // 旧版格式高度恰为宽度的一半（如 64×32、128×64），因此不能要求 height 也是 64 的倍数
  const legacy = height * 2 === width;
  const widthAligned = width >= 64 && width % 64 === 0;
  const valid = widthAligned && (square || legacy);

  const scale = valid ? width / 64 : 1;

  let label: string;
  if (!valid) {
    label = `${width}×${height} · 格式不支持`;
  } else if (legacy) {
    label = `${width}×${height} · ${LEGACY_LABEL}`;
  } else if (scale > 1) {
    label = `${width}×${height} · ${HD_LABEL} ×${scale}`;
  } else {
    label = `${width}×${height} · 标准`;
  }

  return { width, height, scale, legacy, valid, label };
}

/** 皮肤的来源类型，用于界面归因与错误文案 */
export type SkinOrigin = 'builtin' | 'account' | 'upload' | 'url' | 'preset';

export interface SkinTexture {
  id: string;
  /** 已解码的位图（禁止放入 Vue 响应式对象，故单独登记） */
  image: CanvasImageSource;
  meta: SkinMeta;
  origin: SkinOrigin;
  /** 人类可读的来源描述，例如玩家名或文件名 */
  sourceLabel: string;
  /** 画布是否被跨域污染（污染后无法导出 PNG） */
  tainted: boolean;
}

export function describeCustomImage(width: number, height: number): SkinMeta {
  const valid = width > 0 && height > 0;
  return {
    width,
    height,
    scale: 1,
    legacy: false,
    valid,
    label: valid ? `${width}×${height} · 头像图片` : '图片尺寸无效',
    isCustomImage: true,
  };
}

export function assertUsableSkin(meta: SkinMeta): void {
  if (!meta.valid) {
    throw new Error(
      `皮肤尺寸 ${meta.width}×${meta.height} 不被支持。请使用 64×64、64×32，或 128/256/512 的高清皮肤。如需直接贴上，请使用「上传头像图片」。`,
    );
  }
}

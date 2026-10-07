/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { normalizeAngle } from './transform';
import { MAX_LAYER_SIZE, MIN_LAYER_SIZE } from './types';

/**
 * 头像预设：把「一张皮肤 + 一组渲染参数」存成可反复套用、可导出迁移的东西。
 *
 * 皮肤位图以 data URI 内嵌，因此预设文件是自包含的 —— 换台机器导入照样能还原，
 * 不依赖任何在线地址。代价是文件会变大，所以对单个内嵌皮肤设了体积上限。
 */

export const PRESET_FORMAT = 'blockface-presets';
export const PRESET_VERSION = 1;
export const MAX_PRESETS = 48;
/** 单个内嵌皮肤 data URI 的长度上限（字符数），超过则只保留变换参数 */
export const MAX_SKIN_DATA_URL = 1_500_000;

export interface PresetSkin {
  dataUrl: string;
  width: number;
  height: number;
}

export interface Preset {
  id: string;
  name: string;
  size: number;
  rotation: number;
  opacity: number;
  overlay: boolean;
  flipH: boolean;
  /** 内嵌皮肤；为 null 时只恢复渲染参数，不动当前皮肤 */
  skin: PresetSkin | null;
  createdAt: number;
}

export interface PresetFile {
  format: string;
  version: number;
  exportedAt: string;
  presets: Preset[];
}

export class PresetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresetParseError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 只认白名单图片 data URI。
 * 预设文件可能来自别人，绝不能让 `javascript:` 之类的东西混进 <img src>。
 */
export function isSafeSkinDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_SKIN_DATA_URL &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)
  );
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 把任意来源的一条记录收拾成合法预设；收拾不出来就返回 null */
export function normalizePreset(raw: unknown, index = 0): Preset | null {
  if (!isRecord(raw)) return null;

  const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
  const name = (rawName || '预设 ' + (index + 1)).slice(0, 40);

  const skinRaw = isRecord(raw.skin) ? raw.skin : null;
  const dataUrl = skinRaw && isSafeSkinDataUrl(skinRaw.dataUrl) ? skinRaw.dataUrl : null;
  const skin: PresetSkin | null = dataUrl
    ? {
        dataUrl,
        width: Math.round(clampNumber(skinRaw?.width, 8, 4096, 64)),
        height: Math.round(clampNumber(skinRaw?.height, 8, 4096, 64)),
      }
    : null;

  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : 'preset-' + index,
    name,
    size: Math.round(clampNumber(raw.size, MIN_LAYER_SIZE, MAX_LAYER_SIZE, 256)),
    rotation: Math.round(normalizeAngle(clampNumber(raw.rotation, -3600, 3600, 0))),
    opacity: clampNumber(raw.opacity, 0, 1, 1),
    overlay: raw.overlay !== false,
    flipH: raw.flipH === true,
    skin,
    createdAt,
  };
}

/** 解析预设文件；任何不合规都抛 PresetParseError，错误信息面向用户 */
export function parsePresetFile(text: string): Preset[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PresetParseError('不是合法的 JSON 文件');
  }

  let list: unknown;
  if (Array.isArray(data)) {
    list = data;
  } else if (isRecord(data)) {
    if (typeof data.version === 'number' && data.version > PRESET_VERSION) {
      throw new PresetParseError('预设文件版本 ' + data.version + ' 比当前支持的 ' + PRESET_VERSION + ' 新');
    }
    if (typeof data.format === 'string' && data.format !== PRESET_FORMAT) {
      throw new PresetParseError('这不是 BlockFace 预设文件');
    }
    list = data.presets;
  }

  if (!Array.isArray(list)) throw new PresetParseError('文件里没有 presets 列表');

  const parsed = list
    .map((item, i) => normalizePreset(item, i))
    .filter((p): p is Preset => p !== null);

  if (parsed.length === 0) throw new PresetParseError('没解析出任何可用预设');
  return parsed.slice(0, MAX_PRESETS);
}

export function createPresetFile(presets: readonly Preset[], now: Date = new Date()): PresetFile {
  return {
    format: PRESET_FORMAT,
    version: PRESET_VERSION,
    exportedAt: now.toISOString(),
    presets: presets.map((p) => ({ ...p, skin: p.skin ? { ...p.skin } : null })),
  };
}

export function serializePresetFile(presets: readonly Preset[]): string {
  return JSON.stringify(createPresetFile(presets), null, 2);
}

function stamp(now: Date): string {
  return (
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')
  );
}

export function suggestPresetFilename(now: Date = new Date()): string {
  return 'blockface-presets-' + stamp(now) + '.json';
}

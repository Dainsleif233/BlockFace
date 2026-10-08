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
 * 预设 = 一张图上**全部头像**的信息，打包成一个整体。
 *
 * 存的是"这张图上摆了哪些头像、各自什么样"：位置、大小、旋转、不透明度、帽子层、翻转、
 * 显示/隐藏，以及每个头像自己的皮肤位图（以 data URI 内嵌，所以预设文件自包含）。
 * **不含底图** —— 底图是用户自己的照片，套用预设不该把它换掉；预设只负责把这一组头像摆回去。
 */

export const PRESET_FORMAT = 'blockface-presets';
export const PRESET_VERSION = 3;
export const MAX_PRESETS = 48;
/** 单个内嵌皮肤 data URI 的长度上限（字符数） */
export const MAX_SKIN_DATA_URL = 1_500_000;
/** 一个预设最多保存多少个头像 */
export const MAX_TEMPLATE_LAYERS = 64;
/** 坐标的合法范围：比任何画布都宽，真正的夹取交给套用时的当前画布 */
export const MAX_LAYER_POSITION = 32768;

export interface PresetSkin {
  dataUrl: string;
  width: number;
  height: number;
  isCustomImage?: boolean;
}

export interface PresetLayer {
  name: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  overlay: boolean;
  flipH: boolean;
  visible: boolean;
  /** 内嵌皮肤；为 null 时这条头像还原不出来，套用时会被跳过 */
  skin: PresetSkin | null;
}

export interface Preset {
  id: string;
  name: string;
  createdAt: number;
  /** 这张图上的全部头像，顺序就是图层顺序（最后一位在最上面） */
  layers: PresetLayer[];
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
 * 预设文件可能来自别人，绝不能让 javascript: 之类的东西混进 <img src>。
 */
export function isSafeImageDataUrl(value: unknown, limit = MAX_SKIN_DATA_URL): value is string {
  return (
    typeof value === 'string' &&
    value.length <= limit &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)
  );
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeSkin(raw: unknown): PresetSkin | null {
  const record = isRecord(raw) ? raw : null;
  if (!record || !isSafeImageDataUrl(record.dataUrl)) return null;
  const isCustomImage = record.isCustomImage === true;
  return {
    dataUrl: record.dataUrl,
    width: Math.round(clampNumber(record.width, 8, 8192, 64)),
    height: Math.round(clampNumber(record.height, 8, 8192, 64)),
    ...(isCustomImage ? { isCustomImage: true } : {}),
  };
}

/** 把任意来源的一条头像记录收拾干净；收拾不出来就返回 null */
export function normalizePresetLayer(raw: unknown, index = 0): PresetLayer | null {
  if (!isRecord(raw)) return null;
  const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
  return {
    name: (rawName || '头像 ' + (index + 1)).slice(0, 40),
    x: clampNumber(raw.x, -MAX_LAYER_POSITION, MAX_LAYER_POSITION, 0),
    y: clampNumber(raw.y, -MAX_LAYER_POSITION, MAX_LAYER_POSITION, 0),
    size: Math.round(clampNumber(raw.size, MIN_LAYER_SIZE, MAX_LAYER_SIZE, 256)),
    rotation: Math.round(normalizeAngle(clampNumber(raw.rotation, -3600, 3600, 0))),
    opacity: clampNumber(raw.opacity, 0, 1, 1),
    overlay: raw.overlay !== false,
    flipH: raw.flipH === true,
    visible: raw.visible !== false,
    skin: normalizeSkin(raw.skin),
  };
}

/** 把任意来源的一条记录收拾成合法预设；收拾不出来就返回 null */
export function normalizePreset(raw: unknown, index = 0): Preset | null {
  if (!isRecord(raw)) return null;

  const layers = Array.isArray(raw.layers)
    ? raw.layers
        .slice(0, MAX_TEMPLATE_LAYERS)
        .map((item, i) => normalizePresetLayer(item, i))
        .filter((layer): layer is PresetLayer => layer !== null)
    : [];

  // 一个头像都没有的预设没有意义，直接丢掉
  if (layers.length === 0) return null;

  const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : 'preset-' + index,
    name: (rawName || '预设 ' + (index + 1)).slice(0, 40),
    createdAt,
    layers,
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
    presets: presets.map((p) => ({
      ...p,
      layers: p.layers.map((l) => ({ ...l, skin: l.skin ? { ...l.skin } : null })),
    })),
  };
}

export function serializePresetFile(presets: readonly Preset[]): string {
  return JSON.stringify(createPresetFile(presets), null, 2);
}

/** 序列化后的字符数，用来判断塞不塞得进 localStorage */
export function presetByteSize(preset: Preset): number {
  try {
    return JSON.stringify(preset).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** 预设里内嵌了多少张皮肤位图 */
export function countEmbeddedImages(preset: Preset): number {
  return preset.layers.filter((l) => l.skin !== null).length;
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

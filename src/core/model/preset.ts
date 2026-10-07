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
 * 预设 = 整张图片的模板：底图 + 画布尺寸 + 全部头像图层（每个图层自带皮肤位图）。
 *
 * 存的是"这张图怎么拼出来的"，不是"一个头像的参数"。位图以 data URI 内嵌，
 * 所以预设文件是自包含的 —— 换台机器导入就能原样还原，不依赖任何在线地址。
 * 代价是文件大，因此对底图、单张皮肤、整个模板分别设了体积上限。
 */

export const PRESET_FORMAT = 'blockface-templates';
export const PRESET_VERSION = 2;
/** 模板比单个头像大得多，数量上限相应收窄 */
export const MAX_PRESETS = 24;
/** 单个内嵌皮肤 data URI 的长度上限（字符数） */
export const MAX_SKIN_DATA_URL = 1_500_000;
/** 底图可能是一张照片，给得宽一些；超过就只能以链接形式保留 */
export const MAX_BASE_DATA_URL = 12_000_000;
/** 一个模板最多还原多少个头像图层 */
export const MAX_TEMPLATE_LAYERS = 64;
/** 单个模板序列化后的大小上限：localStorage 一般只有 5MB，超了就只在内存里待着 */
export const MAX_TEMPLATE_BYTES = 3_500_000;

export interface PresetSkin {
  dataUrl: string;
  width: number;
  height: number;
}

/** 底图：要么内嵌位图（自包含），要么只记一个 https 链接（文件小，但依赖对方还在） */
export interface PresetBase {
  kind: 'data' | 'url';
  value: string;
  width: number;
  height: number;
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
  /** 内嵌皮肤；为 null 时这条图层还原不出来，套用时会被跳过 */
  skin: PresetSkin | null;
}

export interface Preset {
  id: string;
  name: string;
  createdAt: number;
  /** 画布尺寸，套用时会一起还原 */
  width: number;
  height: number;
  base: PresetBase | null;
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
 * 预设文件可能来自别人，绝不能让 `javascript:` 之类的东西混进 <img src>。
 */
export function isSafeImageDataUrl(value: unknown, limit = MAX_SKIN_DATA_URL): value is string {
  return (
    typeof value === 'string' &&
    value.length <= limit &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)
  );
}

/** 底图链接只允许 https，且长度有限 */
export function isSafeImageUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2048 && /^https:\/\/[^\s"'<>]+$/.test(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeSkin(raw: unknown, limit: number): PresetSkin | null {
  const record = isRecord(raw) ? raw : null;
  if (!record || !isSafeImageDataUrl(record.dataUrl, limit)) return null;
  return {
    dataUrl: record.dataUrl,
    width: Math.round(clampNumber(record.width, 8, 8192, 64)),
    height: Math.round(clampNumber(record.height, 8, 8192, 64)),
  };
}

function normalizeBase(raw: unknown): PresetBase | null {
  if (!isRecord(raw)) return null;
  const width = Math.round(clampNumber(raw.width, 1, 8192, 1280));
  const height = Math.round(clampNumber(raw.height, 1, 8192, 800));
  if (raw.kind === 'url') {
    return isSafeImageUrl(raw.value) ? { kind: 'url', value: raw.value, width, height } : null;
  }
  if (isSafeImageDataUrl(raw.value, MAX_BASE_DATA_URL)) {
    return { kind: 'data', value: raw.value, width, height };
  }
  return null;
}

export function normalizePresetLayer(raw: unknown, index = 0, docWidth = 1280, docHeight = 800): PresetLayer | null {
  if (!isRecord(raw)) return null;
  const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
  return {
    name: (rawName || '头像 ' + (index + 1)).slice(0, 40),
    x: clampNumber(raw.x, -docWidth * 4, docWidth * 4, docWidth / 2),
    y: clampNumber(raw.y, -docHeight * 4, docHeight * 4, docHeight / 2),
    size: Math.round(clampNumber(raw.size, MIN_LAYER_SIZE, MAX_LAYER_SIZE, 256)),
    rotation: Math.round(normalizeAngle(clampNumber(raw.rotation, -3600, 3600, 0))),
    opacity: clampNumber(raw.opacity, 0, 1, 1),
    overlay: raw.overlay !== false,
    flipH: raw.flipH === true,
    visible: raw.visible !== false,
    skin: normalizeSkin(raw.skin, MAX_SKIN_DATA_URL),
  };
}

/** 把任意来源的一条记录收拾成合法模板；收拾不出来就返回 null */
export function normalizePreset(raw: unknown, index = 0): Preset | null {
  if (!isRecord(raw)) return null;

  const width = Math.round(clampNumber(raw.width, 16, 8192, 1280));
  const height = Math.round(clampNumber(raw.height, 16, 8192, 800));
  const base = normalizeBase(raw.base);
  const layers = Array.isArray(raw.layers)
    ? raw.layers
        .slice(0, MAX_TEMPLATE_LAYERS)
        .map((item, i) => normalizePresetLayer(item, i, width, height))
        .filter((layer): layer is PresetLayer => layer !== null)
    : [];

  // 既没有底图也没有头像的模板没有任何意义，直接丢掉
  if (!base && layers.length === 0) return null;

  const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : 'preset-' + index,
    name: (rawName || '模板 ' + (index + 1)).slice(0, 40),
    createdAt,
    width,
    height,
    base,
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
      base: p.base ? { ...p.base } : null,
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

/** 模板里内嵌了多少张位图（底图算一张） */
export function countEmbeddedImages(preset: Preset): number {
  return (preset.base && preset.base.kind === 'data' ? 1 : 0) + preset.layers.filter((l) => l.skin !== null).length;
}

function stamp(now: Date): string {
  return (
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')
  );
}

export function suggestPresetFilename(now: Date = new Date()): string {
  return 'blockface-templates-' + stamp(now) + '.json';
}

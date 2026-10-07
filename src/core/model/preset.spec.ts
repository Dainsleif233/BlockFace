/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { describe, expect, it } from 'vitest';
import {
  countEmbeddedImages,
  createPresetFile,
  isSafeImageDataUrl,
  MAX_LAYER_POSITION,
  MAX_PRESETS,
  MAX_TEMPLATE_LAYERS,
  normalizePreset,
  normalizePresetLayer,
  parsePresetFile,
  PRESET_FORMAT,
  PRESET_VERSION,
  presetByteSize,
  PresetParseError,
  serializePresetFile,
  suggestPresetFilename,
  type Preset,
} from './preset';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';

function layer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: '头像 1', x: 100, y: 200, size: 256, rotation: 0, opacity: 1, overlay: true, flipH: false, visible: true, skin: { dataUrl: PNG, width: 64, height: 64 }, ...overrides };
}

function preset(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p1',
    name: '海边傍晚',
    createdAt: 1_700_000_000_000,
    layers: [layer()],
    ...overrides,
  };
}

describe('图片地址白名单', () => {
  it('接受 png / jpeg / webp 的 base64 data URI', () => {
    expect(isSafeImageDataUrl(PNG)).toBe(true);
    expect(isSafeImageDataUrl(JPEG)).toBe(true);
    expect(isSafeImageDataUrl('data:image/webp;base64,UklGRg==')).toBe(true);
  });

  it('拒绝脚本、外链、非 base64 与超长内容', () => {
    expect(isSafeImageDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageDataUrl('http://example.com/a.png')).toBe(false);
    expect(isSafeImageDataUrl('data:image/png,abc')).toBe(false);
    expect(isSafeImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isSafeImageDataUrl(PNG, 10)).toBe(false);
    expect(isSafeImageDataUrl(null)).toBe(false);
  });
});

describe('头像条目归一化', () => {
  it('把越界数值夹回合法范围', () => {
    const result = normalizePresetLayer(layer({ size: 99999, rotation: 900, opacity: 3, x: -100, y: 1e9 }));
    expect(result).not.toBeNull();
    expect(result?.size).toBe(4096);
    expect(result?.rotation).toBe(180);
    expect(result?.opacity).toBe(1);
    expect(result?.x).toBe(-100);
    expect(result?.y).toBe(MAX_LAYER_POSITION);
  });

  it('overlay / flipH / visible 各自有默认值', () => {
    const result = normalizePresetLayer({}, 0);
    expect(result?.overlay).toBe(true);
    expect(result?.flipH).toBe(false);
    expect(result?.visible).toBe(true);
    expect(result?.opacity).toBe(1);
    expect(result?.name).toBe('头像 1');
  });

  it('非对象、皮肤不合法的记录也能收拾出一条头像', () => {
    expect(normalizePresetLayer('nope')).toBeNull();
    const result = normalizePresetLayer(layer({ skin: { dataUrl: 'javascript:alert(1)' } }), 2);
    expect(result?.skin).toBeNull();
    expect(result?.name).toBe('头像 1');
  });

  it('皮肤尺寸被夹进合法区间', () => {
    const result = normalizePresetLayer(layer({ skin: { dataUrl: PNG, width: 0, height: 99999 } }), 0);
    expect(result?.skin?.width).toBe(8);
    expect(result?.skin?.height).toBe(8192);
  });
});

describe('预设 = 一张图上的全部头像', () => {
  it('保留全部头像及其参数', () => {
    const result = normalizePreset(preset({ layers: [layer(), layer({ name: '头像 2', x: 500, size: 80, overlay: false })] }), 0);
    expect(result?.name).toBe('海边傍晚');
    expect(result?.layers).toHaveLength(2);
    expect(result?.layers[0].skin?.dataUrl).toBe(PNG);
    expect(result?.layers[1].x).toBe(500);
    expect(result?.layers[1].size).toBe(80);
    expect(result?.layers[1].overlay).toBe(false);
  });

  it('不含底图与画布尺寸：预设只管头像', () => {
    const result = normalizePreset(preset(), 0);
    expect(result).not.toBeNull();
    expect(Object.keys(result as object).sort()).toEqual(['createdAt', 'id', 'layers', 'name']);
  });

  it('旧格式里的 base / width / height 字段被忽略，不影响解析', () => {
    const result = normalizePreset(preset({ base: { kind: 'data', value: JPEG }, width: 320, height: 200 }), 0);
    expect(result?.layers).toHaveLength(1);
    expect(result && 'base' in result).toBe(false);
  });

  it('一个头像都没有的记录直接丢掉', () => {
    expect(normalizePreset(preset({ layers: [] }), 0)).toBeNull();
    expect(normalizePreset(preset({ layers: 'nope' }), 0)).toBeNull();
    expect(normalizePreset('nope')).toBeNull();
    expect(normalizePreset(null)).toBeNull();
  });

  it('头像数量有上限', () => {
    const many = Array.from({ length: MAX_TEMPLATE_LAYERS + 20 }, () => layer());
    expect(normalizePreset(preset({ layers: many }), 0)?.layers).toHaveLength(MAX_TEMPLATE_LAYERS);
  });

  it('名称与 id 有兜底', () => {
    const result = normalizePreset({ layers: [layer()], name: '   ', id: '' }, 3);
    expect(result?.name).toBe('预设 4');
    expect(result?.id).toBe('preset-3');
    expect(result?.createdAt).toBeGreaterThan(0);
  });
});

describe('预设文件', () => {
  const presets: Preset[] = [normalizePreset(preset({ layers: [layer(), layer({ name: '头像 2' })] }), 0) as Preset];

  it('导出结构与版本号正确', () => {
    const file = createPresetFile(presets, new Date('2026-10-07T00:00:00Z'));
    expect(file.format).toBe(PRESET_FORMAT);
    expect(file.version).toBe(PRESET_VERSION);
    expect(file.exportedAt).toBe('2026-10-07T00:00:00.000Z');
    expect(file.presets[0].layers).toHaveLength(2);
    expect(file.presets[0].layers[0].skin?.dataUrl).toBe(PNG);
  });

  it('序列化再解析能原样回来（自包含）', () => {
    const parsed = parsePresetFile(serializePresetFile(presets));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].layers).toHaveLength(2);
    expect(parsed[0].layers[0].size).toBe(256);
    expect(parsed[0].layers[0].skin?.dataUrl).toBe(PNG);
  });

  it('导出的副本不共享引用', () => {
    const file = createPresetFile(presets);
    file.presets[0].layers[0].size = 999;
    (file.presets[0].layers[0].skin as { dataUrl: string }).dataUrl = 'tampered';
    expect(presets[0].layers[0].size).toBe(256);
    expect(presets[0].layers[0].skin?.dataUrl).toBe(PNG);
  });

  it('纯数组文件也认', () => {
    expect(parsePresetFile(JSON.stringify([preset()]))).toHaveLength(1);
  });

  it('坏文件给出面向用户的错误', () => {
    expect(() => parsePresetFile('{oops')).toThrow(PresetParseError);
    expect(() => parsePresetFile('{oops')).toThrow('不是合法的 JSON 文件');
    expect(() => parsePresetFile(JSON.stringify({ format: 'other', presets: [] }))).toThrow('这不是 BlockFace 预设文件');
    expect(() => parsePresetFile(JSON.stringify({ version: 99, presets: [] }))).toThrow('比当前支持的');
    expect(() => parsePresetFile(JSON.stringify({ version: 3 }))).toThrow('文件里没有 presets 列表');
    expect(() => parsePresetFile(JSON.stringify({ presets: [{}] }))).toThrow('没解析出任何可用预设');
  });

  it('解析结果也有数量上限', () => {
    const many = Array.from({ length: MAX_PRESETS + 5 }, (_, i) => preset({ id: 'p' + i }));
    expect(parsePresetFile(JSON.stringify(many))).toHaveLength(MAX_PRESETS);
  });
});

describe('体积与统计', () => {
  it('能算出序列化体积', () => {
    const item = normalizePreset(preset(), 0) as Preset;
    expect(presetByteSize(item)).toBeGreaterThan(PNG.length);
    expect(presetByteSize(item)).toBe(JSON.stringify(item).length);
  });

  it('统计内嵌皮肤数量', () => {
    const item = normalizePreset(preset({ layers: [layer(), layer({ skin: null }), layer({ skin: { dataUrl: 'bad' } })] }), 0) as Preset;
    expect(item.layers).toHaveLength(3);
    expect(countEmbeddedImages(item)).toBe(1);
  });

  it('导出文件名带日期', () => {
    expect(suggestPresetFilename(new Date('2026-10-07T10:00:00Z'))).toBe('blockface-presets-20261007.json');
  });
});

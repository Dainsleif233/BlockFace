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
  isSafeImageUrl,
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

function template(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p1',
    name: '我的一天',
    createdAt: 1_700_000_000_000,
    width: 1280,
    height: 800,
    base: { kind: 'data', value: JPEG, width: 1280, height: 800 },
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

  it('底图链接只收 https', () => {
    expect(isSafeImageUrl('https://example.com/a.jpg')).toBe(true);
    expect(isSafeImageUrl('http://example.com/a.jpg')).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('https://example.com/' + 'a'.repeat(3000))).toBe(false);
  });
});

describe('图层归一化', () => {
  it('把越界数值夹回合法范围', () => {
    const result = normalizePresetLayer(layer({ size: 99999, rotation: 900, opacity: 3, x: -100, y: 1e9 }), 0, 1280, 800);
    expect(result).not.toBeNull();
    expect(result?.size).toBe(4096);
    expect(result?.rotation).toBe(180);
    expect(result?.opacity).toBe(1);
    expect(result?.x).toBe(-100);
    expect(result?.y).toBe(3200);
  });

  it('overlay / flipH / visible 各自有默认值', () => {
    const result = normalizePresetLayer({}, 0);
    expect(result?.overlay).toBe(true);
    expect(result?.flipH).toBe(false);
    expect(result?.visible).toBe(true);
    expect(result?.opacity).toBe(1);
    expect(result?.name).toBe('头像 1');
  });

  it('非对象、皮肤不合法的记录也能收拾出一条图层', () => {
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

describe('模板归一化', () => {
  it('保留底图、尺寸与全部图层', () => {
    const result = normalizePreset(template(), 0);
    expect(result?.name).toBe('我的一天');
    expect(result?.width).toBe(1280);
    expect(result?.height).toBe(800);
    expect(result?.base).toEqual({ kind: 'data', value: JPEG, width: 1280, height: 800 });
    expect(result?.layers).toHaveLength(1);
    expect(result?.layers[0].skin?.dataUrl).toBe(PNG);
  });

  it('底图链接型模板只留链接', () => {
    const result = normalizePreset(template({ base: { kind: 'url', value: 'https://example.com/a.jpg', width: 640, height: 480 } }), 0);
    expect(result?.base).toEqual({ kind: 'url', value: 'https://example.com/a.jpg', width: 640, height: 480 });
  });

  it('危险底图被丢掉，但模板本身还能用', () => {
    const result = normalizePreset(template({ base: { kind: 'data', value: 'javascript:alert(1)', width: 10, height: 10 } }), 0);
    expect(result?.base).toBeNull();
    expect(result?.layers).toHaveLength(1);
  });

  it('既没底图也没图层的记录直接丢掉', () => {
    expect(normalizePreset(template({ base: null, layers: [] }), 0)).toBeNull();
    expect(normalizePreset('nope')).toBeNull();
    expect(normalizePreset(null)).toBeNull();
  });

  it('图层数量有上限', () => {
    const many = Array.from({ length: MAX_TEMPLATE_LAYERS + 20 }, () => layer());
    expect(normalizePreset(template({ layers: many }), 0)?.layers).toHaveLength(MAX_TEMPLATE_LAYERS);
  });

  it('尺寸越界会被夹住，名称与 id 有兜底', () => {
    const result = normalizePreset({ layers: [layer()], width: 1, height: 1e9, name: '   ', id: '' }, 3);
    expect(result?.width).toBe(16);
    expect(result?.height).toBe(8192);
    expect(result?.name).toBe('模板 4');
    expect(result?.id).toBe('preset-3');
  });
});

describe('预设文件', () => {
  const presets: Preset[] = [normalizePreset(template(), 0) as Preset];

  it('导出结构与版本号正确', () => {
    const file = createPresetFile(presets, new Date('2026-10-07T00:00:00Z'));
    expect(file.format).toBe(PRESET_FORMAT);
    expect(file.version).toBe(PRESET_VERSION);
    expect(file.exportedAt).toBe('2026-10-07T00:00:00.000Z');
    expect(file.presets[0].layers[0].skin?.dataUrl).toBe(PNG);
  });

  it('序列化再解析能原样回来（自包含）', () => {
    const parsed = parsePresetFile(serializePresetFile(presets));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].base?.value).toBe(JPEG);
    expect(parsed[0].layers[0].size).toBe(256);
    expect(parsed[0].width).toBe(1280);
  });

  it('导出的副本不共享引用', () => {
    const file = createPresetFile(presets);
    file.presets[0].layers[0].size = 999;
    file.presets[0].base!.value = 'tampered';
    expect(presets[0].layers[0].size).toBe(256);
    expect(presets[0].base?.value).toBe(JPEG);
  });

  it('纯数组文件也认', () => {
    expect(parsePresetFile(JSON.stringify([template()]))).toHaveLength(1);
  });

  it('坏文件给出面向用户的错误', () => {
    expect(() => parsePresetFile('{oops')).toThrow(PresetParseError);
    expect(() => parsePresetFile('{oops')).toThrow('不是合法的 JSON 文件');
    expect(() => parsePresetFile(JSON.stringify({ format: 'other', presets: [] }))).toThrow('这不是 BlockFace 预设文件');
    expect(() => parsePresetFile(JSON.stringify({ version: 99, presets: [] }))).toThrow('比当前支持的');
    expect(() => parsePresetFile(JSON.stringify({ version: 2 }))).toThrow('文件里没有 presets 列表');
    expect(() => parsePresetFile(JSON.stringify({ presets: [{}] }))).toThrow('没解析出任何可用预设');
  });

  it('解析结果也有数量上限', () => {
    const many = Array.from({ length: MAX_PRESETS + 5 }, (_, i) => template({ id: 'p' + i }));
    expect(parsePresetFile(JSON.stringify(many))).toHaveLength(MAX_PRESETS);
  });
});

describe('体积与统计', () => {
  it('能算出序列化体积', () => {
    const preset = normalizePreset(template(), 0) as Preset;
    expect(presetByteSize(preset)).toBeGreaterThan(PNG.length);
    expect(presetByteSize(preset)).toBe(JSON.stringify(preset).length);
  });

  it('统计内嵌位图数量：底图 + 有皮肤的图层', () => {
    const preset = normalizePreset(template({ layers: [layer(), layer({ skin: null })] }), 0) as Preset;
    expect(countEmbeddedImages(preset)).toBe(2);
    const urlBase = normalizePreset(template({ base: { kind: 'url', value: 'https://e.com/a.png' } }), 0) as Preset;
    expect(countEmbeddedImages(urlBase)).toBe(1);
  });

  it('导出文件名带日期', () => {
    expect(suggestPresetFilename(new Date('2026-10-07T10:00:00Z'))).toBe('blockface-templates-20261007.json');
  });
});

/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  createPresetFile,
  isSafeSkinDataUrl,
  normalizePreset,
  parsePresetFile,
  PresetParseError,
  PRESET_FORMAT,
  PRESET_VERSION,
  serializePresetFile,
  suggestPresetFilename,
  type Preset,
} from './preset';
import { MAX_LAYER_SIZE, MIN_LAYER_SIZE } from './types';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function makePreset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: 'p1',
    name: '我的 Steve',
    size: 256,
    rotation: 0,
    opacity: 1,
    overlay: true,
    flipH: false,
    skin: { dataUrl: PNG, width: 64, height: 64 },
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('isSafeSkinDataUrl', () => {
  it('只放行白名单图片 data URI', () => {
    expect(isSafeSkinDataUrl(PNG)).toBe(true);
    expect(isSafeSkinDataUrl('data:image/webp;base64,AAAA')).toBe(true);
    expect(isSafeSkinDataUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isSafeSkinDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeSkinDataUrl('https://example.com/skin.png')).toBe(false);
    expect(isSafeSkinDataUrl(123)).toBe(false);
  });

  it('超长 data URI 直接拒绝，避免预设文件失控', () => {
    expect(isSafeSkinDataUrl('data:image/png;base64,' + 'A'.repeat(1_600_000))).toBe(false);
  });
});

describe('normalizePreset', () => {
  it('把越界数值夹回合法区间', () => {
    const preset = normalizePreset({ name: 'x', size: 999999, opacity: 8, rotation: 540 });
    expect(preset?.size).toBe(MAX_LAYER_SIZE);
    expect(preset?.opacity).toBe(1);
    expect(preset?.rotation).toBe(180);
  });

  it('最小尺寸同样被夹住', () => {
    expect(normalizePreset({ size: 1 })?.size).toBe(MIN_LAYER_SIZE);
  });

  it('缺 skin 时保留变换参数，skin 为 null', () => {
    const preset = normalizePreset({ name: '纯参数', size: 128 });
    expect(preset?.skin).toBeNull();
    expect(preset?.size).toBe(128);
  });

  it('不安全的 data URI 被丢掉，但预设本身仍然可用', () => {
    const preset = normalizePreset({ name: '坏皮肤', skin: { dataUrl: 'javascript:alert(1)' } });
    expect(preset).not.toBeNull();
    expect(preset?.skin).toBeNull();
  });

  it('非对象输入返回 null', () => {
    expect(normalizePreset(null)).toBeNull();
    expect(normalizePreset('nope')).toBeNull();
    expect(normalizePreset([])).toBeNull();
  });

  it('没有名字时补一个可读的默认名', () => {
    expect(normalizePreset({}, 2)?.name).toBe('预设 3');
  });

  it('overlay 默认开；flipH 默认关', () => {
    const preset = normalizePreset({});
    expect(preset?.overlay).toBe(true);
    expect(preset?.flipH).toBe(false);
    expect(normalizePreset({ overlay: false, flipH: true })?.overlay).toBe(false);
    expect(normalizePreset({ overlay: false, flipH: true })?.flipH).toBe(true);
  });
});

describe('parsePresetFile', () => {
  it('读得回自己写出去的文件', () => {
    const text = serializePresetFile([makePreset()]);
    const parsed = parsePresetFile(text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('我的 Steve');
    expect(parsed[0].skin?.dataUrl).toBe(PNG);
  });

  it('也接受裸数组', () => {
    expect(parsePresetFile(JSON.stringify([{ name: 'a' }]))).toHaveLength(1);
  });

  it('非 JSON 抛错', () => {
    expect(() => parsePresetFile('not json')).toThrow(PresetParseError);
  });

  it('别的产品的 JSON 抛错', () => {
    expect(() => parsePresetFile(JSON.stringify({ format: 'something-else', presets: [] }))).toThrow(/BlockFace/);
  });

  it('未来版本抛错', () => {
    const text = JSON.stringify({ format: PRESET_FORMAT, version: PRESET_VERSION + 1, presets: [{ name: 'a' }] });
    expect(() => parsePresetFile(text)).toThrow(/版本/);
  });

  it('没有 presets 列表抛错', () => {
    expect(() => parsePresetFile(JSON.stringify({ format: PRESET_FORMAT }))).toThrow(/presets/);
  });

  it('列表里全是垃圾时抛错，而不是返回空', () => {
    expect(() => parsePresetFile(JSON.stringify({ presets: [1, 2, null] }))).toThrow(PresetParseError);
  });

  it('跳过垃圾条目，保留可用条目', () => {
    const parsed = parsePresetFile(JSON.stringify({ presets: [null, { name: 'ok' }, 'x'] }));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('ok');
  });
});

describe('createPresetFile', () => {
  it('带上格式标记与版本，便于以后迁移', () => {
    const file = createPresetFile([makePreset()], new Date('2026-10-07T12:00:00Z'));
    expect(file.format).toBe(PRESET_FORMAT);
    expect(file.version).toBe(PRESET_VERSION);
    expect(file.exportedAt).toBe('2026-10-07T12:00:00.000Z');
  });

  it('导出的是副本，改动不会回写原对象', () => {
    const source = makePreset();
    const file = createPresetFile([source]);
    file.presets[0].name = '改过了';
    file.presets[0].skin!.width = 999;
    expect(source.name).toBe('我的 Steve');
    expect(source.skin?.width).toBe(64);
  });
});

describe('suggestPresetFilename', () => {
  it('按日期命名，扩展名是 json', () => {
    expect(suggestPresetFilename(new Date('2026-10-07T12:00:00Z'))).toBe('blockface-presets-20261007.json');
  });
});

/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

import { computed, reactive, ref } from 'vue';
import {
  countEmbeddedImages,
  isSafeImageDataUrl,
  MAX_PRESETS,
  parsePresetFile,
  PresetParseError,
  serializePresetFile,
  suggestPresetFilename,
  type Preset,
  type PresetLayer,
  type PresetSkin,
} from '../core/model/preset';
import { clampLayerToDocument } from '../core/model/transform';
import { createId, MIN_LAYER_SIZE, type AvatarLayer, type BaseImageMeta } from '../core/model/types';
import { composeDocument } from '../core/render/compose';
import { canvasToBlob, downloadBlob, suggestFilename } from '../core/render/exportImage';
import { loadImage, type LoadedImage } from '../core/sources/imageLoader';
import {
  BUILTIN_SKINS,
  loadFirstAvailable,
  resolveAccountSkin,
  SkinLookupError,
  type SkinCandidate,
} from '../core/sources/providers';
import { assertUsableSkin, describeSkin, type SkinOrigin, type SkinTexture } from '../core/skin/texture';

/* ------------------------------------------------------------------ *
 * 非响应式资源登记处
 * HTMLImageElement / SkinTexture 体积大且不可序列化，放进响应式对象会带来
 * 深代理开销与意外比较问题，因此统一登记在这里，响应式状态里只留 id。
 * ------------------------------------------------------------------ */

const baseImages = new Map<string, HTMLImageElement>();
const skins = new Map<string, SkinTexture>();

export function getBaseImage(id: string | null): HTMLImageElement | null {
  return id ? baseImages.get(id) ?? null : null;
}

export function getSkin(id: string | null): SkinTexture | null {
  return id ? skins.get(id) ?? null : null;
}

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

export interface SkinRecord {
  id: string;
  meta: ReturnType<typeof describeSkin>;
  origin: SkinOrigin;
  sourceLabel: string;
  provider: string;
  tainted: boolean;
}

export interface Notice {
  tone: 'info' | 'success' | 'warn' | 'error';
  message: string;
  at: number;
}

interface Snapshot {
  document: { width: number; height: number };
  baseImageId: string | null;
  layers: AvatarLayer[];
  selectedId: string | null;
  activeSkinId: string | null;
}

interface EditorState {
  document: { width: number; height: number };
  baseImage: BaseImageMeta | null;
  baseImageId: string | null;
  skins: SkinRecord[];
  activeSkinId: string | null;
  presets: Preset[];
  layers: AvatarLayer[];
  selectedId: string | null;
  view: { zoom: number; autoFit: boolean };
  busy: string | null;
  notice: Notice | null;
  exportScale: number;
  showGrid: boolean;
  proxyTemplate: string;
  /** 皮肤登记表版本号，异步加载完成后自增，驱动 canvas 组件重绘 */
  skinRevision: number;
}

export const DEFAULT_DOCUMENT = { width: 1280, height: 800 };
export const DEFAULT_PROXY_TEMPLATE = 'https://images.weserv.nl/?url=';

const state = reactive<EditorState>({
  document: { ...DEFAULT_DOCUMENT },
  baseImage: null,
  baseImageId: null,
  skins: [],
  activeSkinId: null,
  presets: [],
  layers: [],
  selectedId: null,
  view: { zoom: 1, autoFit: true },
  busy: null,
  notice: null,
  exportScale: 2,
  showGrid: false,
  proxyTemplate: DEFAULT_PROXY_TEMPLATE,
  skinRevision: 0,
});

/* ------------------------------------------------------------------ *
 * 历史记录
 * ------------------------------------------------------------------ */

const past: Snapshot[] = [];
const future: Snapshot[] = [];
let openChange = false;

/**
 * 快照数组本身不需要响应式（把 60 份快照都做成 Proxy 也没意义），
 * 但"能不能撤销"必须响应式，否则按钮的 disabled 会永远停在初始值上。
 * 所以每次历史变化都把这个计数器 +1，让下面的 computed 重新求值。
 */
const historyVersion = ref(0);
function touchHistory(): void {
  historyVersion.value += 1;
}

function snapshot(): Snapshot {
  return {
    document: { ...state.document },
    baseImageId: state.baseImageId,
    layers: state.layers.map((l) => ({ ...l })),
    selectedId: state.selectedId,
    activeSkinId: state.activeSkinId,
  };
}

function restore(snap: Snapshot): void {
  state.document = { ...snap.document };
  state.baseImageId = snap.baseImageId;
  state.baseImage = snap.baseImageId ? readBaseMeta(snap.baseImageId) : null;
  state.layers = snap.layers.map((l) => ({ ...l }));
  state.selectedId = snap.selectedId;
  state.activeSkinId = snap.activeSkinId;
}

const baseMeta = new Map<string, BaseImageMeta>();
function readBaseMeta(id: string): BaseImageMeta | null {
  return baseMeta.get(id) ?? null;
}

/** 开始一次可撤销的改动；同一交互内重复调用只记一次 */
export function beginChange(): void {
  if (openChange) return;
  past.push(snapshot());
  if (past.length > 60) past.shift();
  future.length = 0;
  openChange = true;
  touchHistory();
}

/** 结束当前改动，允许记录下一次 */
export function endChange(): void {
  openChange = false;
}

/** 一次性改动（不需要成对调用） */
function commit(): void {
  beginChange();
  endChange();
}

export function undo(): void {
  const snap = past.pop();
  if (!snap) return;
  future.push(snapshot());
  restore(snap);
  endChange();
  touchHistory();
}

export function redo(): void {
  const snap = future.pop();
  if (!snap) return;
  past.push(snapshot());
  restore(snap);
  endChange();
  touchHistory();
}

/* ------------------------------------------------------------------ *
 * 选择与图层
 * ------------------------------------------------------------------ */

export const selectedLayer = computed(() => state.layers.find((l) => l.id === state.selectedId) ?? null);
export const activeSkin = computed(() => state.skins.find((s) => s.id === state.activeSkinId) ?? null);
export const canUndo = computed(() => {
  void historyVersion.value; // 建立响应式依赖：历史一变就重算，否则按钮永远停在初始状态
  return past.length > 0;
});
export const canRedo = computed(() => {
  void historyVersion.value;
  return future.length > 0;
});

/**
 * 头像可用的最大边长：比画布短边还大没有意义（贴出去也只会被裁掉），
 * 所以上限跟着底图尺寸走。界面上的"大小"滑杆必须用同一个上限，
 * 否则滑杆右端会有一截拖了没反应的死区。
 */
export const maxLayerSize = computed(() => Math.max(64, Math.min(state.document.width, state.document.height)));

function clampSize(size: number): number {
  return Math.round(Math.min(maxLayerSize.value, Math.max(MIN_LAYER_SIZE, size)));
}

function defaultLayerSize(): number {
  return clampSize(Math.min(state.document.width, state.document.height) * 0.4);
}

export function notify(tone: Notice['tone'], message: string): void {
  state.notice = { tone, message, at: Date.now() };
}

export function addLayer(skinId: string, overrides: Partial<AvatarLayer> = {}): AvatarLayer {
  const size = overrides.size ?? defaultLayerSize();
  const layer: AvatarLayer = {
    id: createId('layer'),
    skinId,
    name: '',
    // 默认叠上第二层（帽子层）。官方 Steve 这层正面是一圈不透明灰，会把额头两行
    // 与两鬓盖成灰的（占成品 34% 面积），看着像坏图，但它就是官方原始数据，
    // 开着才是正版渲染结果；不想要的人在属性面板关掉即可。
    overlay: true,
    x: state.document.width / 2,
    y: state.document.height / 2,
    size,
    rotation: 0,
    opacity: 1,
    flipH: false,
    visible: true,
    ...overrides,
  };
  const record = state.skins.find((s) => s.id === skinId);
  layer.name = `头像 ${state.layers.length + 1}${record ? ` · ${record.sourceLabel}` : ''}`;
  state.layers.push(layer);
  state.selectedId = layer.id;
  return layer;
}

export function removeLayer(id: string): void {
  const index = state.layers.findIndex((l) => l.id === id);
  if (index < 0) return;
  beginChange();
  state.layers.splice(index, 1);
  if (state.selectedId === id) state.selectedId = state.layers.at(-1)?.id ?? null;
  endChange();
}

export function duplicateLayer(id: string): void {
  const source = state.layers.find((l) => l.id === id);
  if (!source) return;
  beginChange();
  const copy: AvatarLayer = {
    ...source,
    id: createId('layer'),
    x: source.x + source.size * 0.2,
    y: source.y + source.size * 0.2,
    name: `${source.name} 副本`,
  };
  state.layers.push(copy);
  state.selectedId = copy.id;
  endChange();
}

/**
 * 把图层挪到数组第 index 位（0 是最底层，最后一位是最上层）。
 * 拖动过程中用 record = false 就地重排、松手时再收一条历史，这样整次拖动只占一格撤销。
 */
export function moveLayerTo(id: string, index: number, record = true): void {
  const from = state.layers.findIndex((l) => l.id === id);
  if (from < 0) return;
  const to = Math.max(0, Math.min(state.layers.length - 1, index));
  if (to === from) return;
  if (record) commit();
  const [layer] = state.layers.splice(from, 1);
  state.layers.splice(to, 0, layer);
}

/** 上移/下移一层（键盘操作），delta 为正表示往上层走 */
export function nudgeLayerOrder(id: string, delta: number): void {
  const from = state.layers.findIndex((l) => l.id === id);
  if (from < 0) return;
  moveLayerTo(id, from + delta);
}

export function updateLayer(id: string, patch: Partial<AvatarLayer>, record = true): void {
  const layer = state.layers.find((l) => l.id === id);
  if (!layer) return;
  if (record) commit();
  Object.assign(layer, patch);
  if (patch.size !== undefined) layer.size = clampSize(patch.size);
}

export function nudgeSelected(dx: number, dy: number): void {
  const layer = selectedLayer.value;
  if (!layer) return;
  commit();
  const next = clampLayerToDocument(
    { x: layer.x + dx, y: layer.y + dy, size: layer.size },
    state.document.width,
    state.document.height,
  );
  layer.x = next.x;
  layer.y = next.y;
}

export function centerSelected(): void {
  const layer = selectedLayer.value;
  if (!layer) return;
  commit();
  layer.x = state.document.width / 2;
  layer.y = state.document.height / 2;
}

export function fitSelectedToDocument(): void {
  const layer = selectedLayer.value;
  if (!layer) return;
  commit();
  layer.size = clampSize(Math.min(state.document.width, state.document.height) * 0.8);
  layer.x = state.document.width / 2;
  layer.y = state.document.height / 2;
}

export function selectLayer(id: string | null): void {
  state.selectedId = id;
  const layer = state.layers.find((l) => l.id === id);
  if (layer) state.activeSkinId = layer.skinId;
}

/* ------------------------------------------------------------------ *
 * 皮肤装载
 * ------------------------------------------------------------------ */

function registerSkin(
  loaded: LoadedImage,
  origin: SkinOrigin,
  sourceLabel: string,
  provider: string,
  id?: string,
  activate = true,
): SkinTexture {
  const meta = describeSkin(loaded.width, loaded.height);
  assertUsableSkin(meta);
  const skinId = id ?? createId('skin');
  const texture: SkinTexture = {
    id: skinId,
    image: loaded.element,
    meta,
    origin,
    sourceLabel,
    tainted: loaded.tainted,
  };
  skins.set(skinId, texture);

  const record: SkinRecord = { id: skinId, meta, origin, sourceLabel, provider, tainted: loaded.tainted };
  const existing = state.skins.findIndex((s) => s.id === skinId);
  if (existing >= 0) state.skins[existing] = record;
  else state.skins.push(record);
  if (activate) state.activeSkinId = skinId;
  // 贴图是异步解码的，canvas 组件靠这个版本号感知"该重画了"
  state.skinRevision += 1;
  return texture;
}

/**
 * 预加载内置皮肤（只登记，不应用到图层），让 Steve/Alex 卡片一开始就是真实渲染。
 */
export async function preloadBuiltins(): Promise<void> {
  for (const builtin of BUILTIN_SKINS) {
    const skinId = `builtin-${builtin.id}`;
    if (skins.has(skinId)) continue;
    try {
      const loaded = await loadImage(builtin.url, { cors: false });
      registerSkin(loaded, 'builtin', builtin.name, '内置', skinId, false);
    } catch {
      // 单张失败不影响其它入口
    }
  }
}

async function loadCandidate(candidate: SkinCandidate): Promise<LoadedImage> {
  return loadImage(candidate.url, { proxyTemplate: state.proxyTemplate });
}

/**
 * 应用一份皮肤：若当前有选中图层则替换其皮肤，否则新建图层。
 * 这样「点 Steve」和「给选中的头像换皮肤」是同一个动作，符合贴纸工具的心智模型。
 */
function applySkin(skinId: string): void {
  const layer = selectedLayer.value;
  if (layer) {
    commit();
    layer.skinId = skinId;
    const record = state.skins.find((s) => s.id === skinId);
    if (record) layer.name = `头像 · ${record.sourceLabel}`;
    notify('success', `已应用到选中的头像`);
  } else {
    commit();
    addLayer(skinId);
  }
}

/**
 * 再放一个头像：无论当前是否选中图层，都新建一个。
 * 皮肤列表的点击语义是「应用到选中」，只有这里明确是「再加一个」——
 * 否则用户点完 Steve 再点 Alex 会以为在新增，实际却把 Steve 换掉了。
 */
export function addAvatar(): void {
  const skinId = state.activeSkinId ?? state.skins[0]?.id ?? null;
  if (!skinId || !skins.has(skinId)) {
    notify('warn', '先从左侧载入一张皮肤，再加头像');
    return;
  }
  commit();
  addLayer(skinId);
  notify('success', '已新增一个头像');
}

/** 把已登记的皮肤应用到当前选中图层（没有选中则新建图层） */
export function useExistingSkin(skinId: string): void {
  if (!skins.has(skinId)) return;
  applySkin(skinId);
}

export async function useBuiltinSkin(builtinId: string): Promise<void> {
  const builtin = BUILTIN_SKINS.find((b) => b.id === builtinId);
  if (!builtin) return;
  state.busy = `加载 ${builtin.name}`;
  try {
    const loaded = await loadImage(builtin.url, { cors: false });
    const skinId = `builtin-${builtin.id}`;
    registerSkin(loaded, 'builtin', builtin.name, '内置', skinId);
    applySkin(skinId);
  } catch (error) {
    notify('error', `内置皮肤加载失败：${(error as Error).message}`);
  } finally {
    state.busy = null;
  }
}

export async function useAccountSkin(name: string): Promise<void> {
  state.busy = `查询 ${name}`;
  try {
    const resolution = await resolveAccountSkin(name);
    const { result, provider } = await loadFirstAvailable(resolution.candidates, loadCandidate);
    const skinId = createId('skin');
    registerSkin(result, 'account', resolution.displayName, provider, skinId);
    applySkin(skinId);
    notify(
      resolution.resolved ? 'success' : 'warn',
      resolution.resolved
        ? `已加载 ${resolution.displayName} 的皮肤`
        : `正版档案未找到「${name}」，已从 ${provider} 取到一张同名皮肤`,
    );
  } catch (error) {
    notify('error', (error as Error).message);
  } finally {
    state.busy = null;
  }
}

export async function useSkinFile(file: File): Promise<void> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) && !/\.(png|jpg|jpeg|webp)$/i.test(file.name)) {
    notify('error', '请选择 PNG 格式的皮肤贴图');
    return;
  }
  state.busy = `读取 ${file.name}`;
  try {
    const url = URL.createObjectURL(file);
    try {
      const loaded = await loadImage(url, { cors: false });
      const skinId = createId('skin');
      registerSkin(loaded, 'upload', file.name.replace(/\.[^.]+$/, ''), '本地上传', skinId);
      applySkin(skinId);
      notify('success', `已载入皮肤 ${file.name}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    notify('error', (error as Error).message);
  } finally {
    state.busy = null;
  }
}

export async function useSkinUrl(rawUrl: string): Promise<void> {
  const url = rawUrl.trim();
  if (!url) {
    notify('error', '请输入皮肤贴图地址');
    return;
  }
  state.busy = '下载皮肤';
  try {
    const loaded = await loadImage(url, { proxyTemplate: state.proxyTemplate });
    const skinId = createId('skin');
    const label = url.split('/').pop()?.slice(0, 24) || '远程皮肤';
    registerSkin(loaded, 'url', label, new URL(url).hostname, skinId);
    applySkin(skinId);
    notify(loaded.tainted ? 'warn' : 'success', loaded.tainted ? '皮肤已载入，但该来源未开启 CORS，导出可能失败' : '皮肤已载入');
  } catch (error) {
    notify('error', `皮肤地址加载失败：${(error as Error).message}`);
  } finally {
    state.busy = null;
  }
}

/* ------------------------------------------------------------------ *
 * 底图与文档
 * ------------------------------------------------------------------ */

export async function setBaseImage(file: File): Promise<void> {
  state.busy = '读取图片';
  try {
    const url = URL.createObjectURL(file);
    try {
      const loaded = await loadImage(url, { cors: false });
      const id = createId('base');
      baseImages.set(id, loaded.element);
      const meta: BaseImageMeta = {
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        width: loaded.width,
        height: loaded.height,
        tainted: loaded.tainted,
      };
      baseMeta.set(id, meta);
      commit();
      state.baseImageId = id;
      state.baseImage = meta;
      state.document = { width: loaded.width, height: loaded.height };
      for (const layer of state.layers) {
        const next = clampLayerToDocument(layer, state.document.width, state.document.height);
        layer.x = next.x;
        layer.y = next.y;
      }
      state.view.autoFit = true;
      notify('success', `已载入底图 ${meta.name}（${meta.width}×${meta.height}）`);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    notify('error', `图片加载失败：${(error as Error).message}`);
  } finally {
    state.busy = null;
  }
}

export function clearBaseImage(): void {
  commit();
  state.baseImageId = null;
  state.baseImage = null;
  state.document = { ...DEFAULT_DOCUMENT };
}

export function setDocumentSize(width: number, height: number): void {
  commit();
  state.document = { width: Math.round(width), height: Math.round(height) };
}

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

function composeToCanvas(scale: number, checkerboard: boolean): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  const items = state.layers
    .map((layer) => ({ layer, skin: getSkin(layer.skinId) }))
    .filter((item): item is { layer: AvatarLayer; skin: SkinTexture } => item.skin !== null);
  if (state.layers.length > 0 && items.length === 0) {
    notify('error', '皮肤尚未加载完成，无法合成');
    return null;
  }
  const baseImage = getBaseImage(state.baseImageId);
  try {
    composeDocument(canvas, {
      width: state.document.width,
      height: state.document.height,
      scale,
      baseImage,
      items,
      checkerboard,
    });
  } catch (error) {
    notify('error', (error as Error).message);
    return null;
  }
  return canvas;
}

export async function exportPng(): Promise<void> {
  const canvas = composeToCanvas(state.exportScale, false);
  if (!canvas) return;
  try {
    const blob = await canvasToBlob(canvas);
    downloadBlob(blob, suggestFilename());
    notify('success', `已导出 ${canvas.width}×${canvas.height} PNG`);
  } catch (error) {
    notify('error', (error as Error).message);
  }
}

export function previewCanvas(scale = 1): HTMLCanvasElement | null {
  return composeToCanvas(scale, false);
}

/* ------------------------------------------------------------------ *
 * 预设（一张图上的全部头像）
 *
 * 预设 = 这张图上所有头像的信息：位置、大小、旋转、不透明度、帽子层、翻转、显隐，
 * 以及各自的皮肤位图（data URI 内嵌，所以文件自包含、换机器能用）。
 * 不含底图：底图是用户自己的照片，套用预设只替换头像，不动图片本身。
 * ------------------------------------------------------------------ */

const PRESET_STORAGE_KEY = 'blockface.presets.v3';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // 隐私模式下访问 localStorage 会直接抛异常
    return null;
  }
}

function persistPresets(): void {
  const store = storage();
  if (!store) return;
  // 预设本身只是几 KB 的皮肤位图，一般不会顶到 localStorage 上限；
  // 但数量多或皮肤特别大时仍可能写不进去，那时的策略是保住最新的几个，而不是整个失败。
  let keep = state.presets.length;
  for (; keep >= 0; keep -= 1) {
    const subset = state.presets.slice(0, keep);
    try {
      store.setItem(PRESET_STORAGE_KEY, JSON.stringify(subset));
      if (keep < state.presets.length) {
        notify(
          'warn',
          keep === 0
            ? '预设太大，没能存进浏览器，刷新后会丢失；先导出成文件更稳妥'
            : `本地存储放不下全部预设，只有最新的 ${keep} 个能在刷新后保留；建议导出成文件`,
        );
      }
      return;
    } catch {
      /* 换少一点再试 */
    }
  }
  notify('warn', '预设写入本地存储失败（可能是存储空间已满），建议导出成文件');
}

/** 从 localStorage 恢复预设；坏数据直接丢弃，不影响启动 */
export function loadPresets(): void {
  const store = storage();
  if (!store) return;
  const raw = store.getItem(PRESET_STORAGE_KEY);
  if (!raw) return;
  try {
    state.presets = parsePresetFile(raw);
  } catch {
    state.presets = [];
  }
}

function uniquePresetName(base: string, exceptId?: string): string {
  const name = base.trim().slice(0, 40) || '预设';
  const taken = new Set(state.presets.filter((p) => p.id !== exceptId).map((p) => p.name));
  if (!taken.has(name)) return name;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${name} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return name;
}

/** 皮肤位图 → PNG data URI；画布被污染时返回 null */
function skinToDataUrl(skin: SkinTexture): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = skin.meta.width;
    canvas.height = skin.meta.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(skin.image, 0, 0, skin.meta.width, skin.meta.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** 把当前整张画布（底图 + 全部头像）存成预设 */
export function saveCurrentAsPreset(): void {
  if (state.presets.length >= MAX_PRESETS) {
    notify('warn', `预设最多 ${MAX_PRESETS} 个，先删掉几个再存`);
    return;
  }
  if (state.layers.length === 0) {
    notify('warn', '画布上还没有头像，先放一个再存');
    return;
  }

  const layers: PresetLayer[] = [];
  let missingSkin = 0;
  for (const layer of state.layers) {
    const skin = getSkin(layer.skinId);
    const dataUrl = skin ? skinToDataUrl(skin) : null;
    const embedded: PresetSkin | null =
      dataUrl && skin && isSafeImageDataUrl(dataUrl)
        ? { dataUrl, width: skin.meta.width, height: skin.meta.height }
        : null;
    if (!embedded) missingSkin += 1;
    layers.push({
      name: layer.name,
      x: layer.x,
      y: layer.y,
      size: layer.size,
      rotation: layer.rotation,
      opacity: layer.opacity,
      overlay: layer.overlay,
      flipH: layer.flipH,
      visible: layer.visible,
      skin: embedded,
    });
  }

  const preset: Preset = {
    id: createId('preset'),
    name: uniquePresetName(state.baseImage ? state.baseImage.name : `${layers.length} 个头像`),
    createdAt: Date.now(),
    layers,
  };

  state.presets.unshift(preset);
  persistPresets();
  const pictures = countEmbeddedImages(preset);
  notify(
    missingSkin ? 'warn' : 'success',
    missingSkin
      ? `已存为预设「${preset.name}」，但有 ${missingSkin} 个头像的皮肤没能一起存进去`
      : `已把这张图上的 ${layers.length} 个头像存为预设「${preset.name}」（内嵌 ${pictures} 张皮肤）`,
  );
}

/**
 * 套用预设：用预设里的这组头像替换当前画布上的全部头像。
 * 底图与画布尺寸一概不动 —— 预设管的是头像，图片是用户自己的。
 * 整个过程只收一条历史，撤销一次就回到套用前的样子。
 */
export async function applyPreset(id: string): Promise<void> {
  const preset = state.presets.find((p) => p.id === id);
  if (!preset) return;

  state.busy = `载入预设 ${preset.name}`;
  try {
    // 要用的皮肤先全部解出来：中途失败就保持原样，不把画布搅成半成品
    const ready: { layer: PresetLayer; loaded: LoadedImage }[] = [];
    for (const item of preset.layers) {
      if (!item.skin) continue;
      const loaded = await loadImage(item.skin.dataUrl, { cors: false });
      if (!describeSkin(loaded.width, loaded.height).valid) continue;
      ready.push({ layer: item, loaded });
    }

    commit();

    state.layers.length = 0;
    for (const item of ready) {
      const skinId = createId('skin');
      registerSkin(item.loaded, 'preset', preset.name, '预设', skinId);
      const size = clampSize(item.layer.size);
      const placed = clampLayerToDocument(
        { x: item.layer.x, y: item.layer.y, size },
        state.document.width,
        state.document.height,
      );
      state.layers.push({
        id: createId('layer'),
        skinId,
        name: item.layer.name,
        overlay: item.layer.overlay,
        x: placed.x,
        y: placed.y,
        size,
        rotation: item.layer.rotation,
        opacity: item.layer.opacity,
        flipH: item.layer.flipH,
        visible: item.layer.visible,
      });
    }
    const top = state.layers.at(-1) ?? null;
    state.selectedId = top?.id ?? null;
    if (top) state.activeSkinId = top.skinId;
    state.view.autoFit = true;

    const skipped = preset.layers.length - ready.length;
    const parts = [`${ready.length} 个头像`, '底图未改动'];
    if (skipped > 0) parts.push(`${skipped} 个头像的皮肤缺失`);
    notify(skipped > 0 ? 'warn' : 'success', `已套用预设「${preset.name}」：${parts.join(' · ')}`);
  } catch (error) {
    notify('error', `套用预设失败：${(error as Error).message}`);
  } finally {
    state.busy = null;
  }
}

export function removePreset(id: string): void {
  const index = state.presets.findIndex((p) => p.id === id);
  if (index < 0) return;
  state.presets.splice(index, 1);
  persistPresets();
}

/** 改名：预设是给人认的，名字得能自己定 */
export function renamePreset(id: string, name: string): void {
  const preset = state.presets.find((p) => p.id === id);
  if (!preset) return;
  const clean = name.trim().slice(0, 40);
  if (!clean || clean === preset.name) return;
  preset.name = uniquePresetName(clean, id);
  persistPresets();
}

export function exportPresets(): void {
  if (state.presets.length === 0) {
    notify('warn', '还没有预设可以导出');
    return;
  }
  const blob = new Blob([serializePresetFile(state.presets)], { type: 'application/json' });
  downloadBlob(blob, suggestPresetFilename());
  notify('success', `已导出 ${state.presets.length} 个预设`);
}

/** 只比头像信息：名字与时间不参与，所以本地改过名也算同一条 */
function presetContent(preset: Preset): string {
  return JSON.stringify(preset.layers);
}

/**
 * 导入预设。同一份文件反复导入不该越堆越多：
 * 同 id 且内容一致 → 跳过；同 id 内容变了 → 就地更新（保留本地改过的名字）；
 * 不同 id 但内容一模一样 → 也当成重复跳过；其余才算新增。
 */
export async function importPresets(file: File): Promise<void> {
  state.busy = `导入 ${file.name}`;
  try {
    const incoming = parsePresetFile(await file.text());
    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const preset of incoming) {
      const index = state.presets.findIndex((p) => p.id === preset.id);
      if (index >= 0) {
        if (presetContent(state.presets[index]) === presetContent(preset)) {
          skipped += 1;
          continue;
        }
        state.presets.splice(index, 1, { ...preset, name: state.presets[index].name });
        updated += 1;
        continue;
      }
      if (state.presets.some((p) => presetContent(p) === presetContent(preset))) {
        skipped += 1;
        continue;
      }
      if (state.presets.length >= MAX_PRESETS) {
        skipped += 1;
        continue;
      }
      state.presets.unshift({ ...preset, name: uniquePresetName(preset.name) });
      added += 1;
    }

    if (added > 0 || updated > 0) persistPresets();
    const parts: string[] = [];
    if (added > 0) parts.push(`新增 ${added} 个`);
    if (updated > 0) parts.push(`更新 ${updated} 个`);
    if (skipped > 0) parts.push(`跳过 ${skipped} 个已存在的`);
    const tone = added > 0 || updated > 0 ? 'success' : 'warn';
    notify(tone, parts.length ? `导入完成：${parts.join('，')}` : '文件里没有预设');
  } catch (error) {
    notify('error', error instanceof PresetParseError ? error.message : '预设文件读取失败');
  } finally {
    state.busy = null;
  }
}

// 启动时恢复本地预设
loadPresets();

/* ------------------------------------------------------------------ *
 * 对外接口
 * ------------------------------------------------------------------ */

export const editor = state;
export { BUILTIN_SKINS, SkinLookupError };
export type { AvatarLayer };

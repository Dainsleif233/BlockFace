<!-- BlockFace · Copyright 2026 Dainsleif · Apache License 2.0 -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { MIN_LAYER_SIZE, type AvatarLayer } from '../core/model/types';
import type { SkinOrigin } from '../core/skin/texture';
import {
  addAvatar,
  applyPreset,
  beginChange,
  centerSelected,
  duplicateLayer,
  editor,
  endChange,
  exportPresets,
  fitSelectedToDocument,
  getSkin,
  importPresets,
  maxLayerSize,
  moveLayerTo,
  nudgeLayerOrder,
  removeLayer,
  removePreset,
  renamePreset,
  saveCurrentAsPreset,
  selectLayer,
  updateLayer,
} from '../stores/editor';
import SkinThumb from './SkinThumb.vue';

/** 一条变换滑杆：模型值 × factor = 显示值（不透明度用 0–100 更好读） */
interface SliderSpec {
  key: 'x' | 'y' | 'size' | 'rotation' | 'opacity';
  label: string;
  aria: string;
  min: number;
  max: number;
  step: number;
  factor: number;
}

const ORIGIN_COLOR: Record<SkinOrigin, string> = {
  builtin: 'var(--bf-grass)',
  account: 'var(--bf-gold)',
  upload: 'var(--bf-cyan)',
  url: 'var(--bf-red)',
  preset: 'var(--bf-ink)',
};

/**
 * 图层列表按"看得见的顺序"排：上层在列表上方，跟画面上的遮挡关系一致。
 * 数组本身是 0 = 最底层，所以这里反过来渲染，拖动时再换算回数组下标。
 */
const layerRows = computed(() => editor.layers.slice().reverse());
const toArrayIndex = (rowIndex: number): number => editor.layers.length - 1 - rowIndex;

const drag = ref<{ id: string; startY: number; moved: boolean } | null>(null);

function rowAt(list: HTMLElement, clientY: number): number {
  const rows = Array.from(list.querySelectorAll<HTMLElement>('li[data-layer-id]'));
  if (!rows.length) return -1;
  for (let i = 0; i < rows.length; i += 1) {
    const box = rows[i].getBoundingClientRect();
    if (clientY >= box.top && clientY <= box.bottom) return i;
  }
  const first = rows[0].getBoundingClientRect();
  return clientY < first.top ? 0 : rows.length - 1;
}

/** 在整张列表上做事件委托，两个列表（有选中 / 没选中）共用同一套拖动逻辑 */
function onListPointerDown(event: PointerEvent): void {
  const row = (event.target as HTMLElement).closest<HTMLElement>('li[data-layer-id]');
  if (!row || event.button !== 0) return;
  const id = row.dataset.layerId;
  if (!id) return;
  drag.value = { id, startY: event.clientY, moved: false };
  try {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  } catch {
    /* 合成事件里没有真实指针，抓不住也无所谓，后面的 move 照样能算 */
  }
}

function onListPointerMove(event: PointerEvent): void {
  const state = drag.value;
  if (!state) return;
  if (!state.moved) {
    if (Math.abs(event.clientY - state.startY) < 4) return; // 手抖不算拖动，也不占一条历史
    state.moved = true;
    beginChange();
  }
  const rowIndex = rowAt(event.currentTarget as HTMLElement, event.clientY);
  if (rowIndex >= 0) moveLayerTo(state.id, toArrayIndex(rowIndex), false);
}

function onListPointerUp(): void {
  const state = drag.value;
  drag.value = null;
  if (state?.moved) endChange();
}

/** 键盘也能调顺序：Alt + 上/下 */
function onRowKeydown(event: KeyboardEvent, id: string): void {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
  event.preventDefault();
  nudgeLayerOrder(id, event.key === 'ArrowUp' ? 1 : -1);
}

const layer = computed(() => editor.layers.find((l) => l.id === editor.selectedId) ?? null);
const selectedSkin = computed(() => (layer.value ? getSkin(layer.value.skinId) : null));
const isCustomImage = computed(() => selectedSkin.value?.meta.isCustomImage === true);

const skinLabel = computed(() => {
  const record = editor.skins.find((s) => s.id === layer.value?.skinId) ?? null;
  return record ? record.sourceLabel : '贴图未载入';
});

const sliders = computed<SliderSpec[]>(() => {
  const cur = layer.value;
  const half = cur ? cur.size / 2 : 0;
  const margin = cur ? cur.size * 0.25 : 0;
  const minX = cur ? Math.round(margin - half) : 0;
  const maxX = cur ? Math.round(editor.document.width + half - margin) : editor.document.width;
  const minY = cur ? Math.round(margin - half) : 0;
  const maxY = cur ? Math.round(editor.document.height + half - margin) : editor.document.height;

  return [
    { key: 'x', label: 'X', aria: '横向位置', min: minX, max: maxX, step: 1, factor: 1 },
    { key: 'y', label: 'Y', aria: '纵向位置', min: minY, max: maxY, step: 1, factor: 1 },
    { key: 'size', label: '大小', aria: '大小', min: MIN_LAYER_SIZE, max: maxLayerSize.value, step: 1, factor: 1 },
    { key: 'rotation', label: '旋转', aria: '旋转角度', min: -180, max: 180, step: 1, factor: 1 },
    { key: 'opacity', label: '不透明度', aria: '不透明度', min: 0, max: 100, step: 1, factor: 100 },
  ];
});

function rawValue(spec: SliderSpec): number {
  const target = layer.value;
  return target ? target[spec.key] * spec.factor : 0;
}

function shown(spec: SliderSpec): number {
  return Math.round(rawValue(spec));
}

function percent(spec: SliderSpec): number {
  const span = spec.max - spec.min || 1;
  return Math.max(0, Math.min(100, ((rawValue(spec) - spec.min) / span) * 100));
}

/** 拖动与输入共用：把输入值夹进区间再换算回模型单位 */
function setValue(spec: SliderSpec, raw: string): void {
  const target = layer.value;
  if (!target) return;
  if (raw.trim() === '') return; // 允许先清空再重打
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  const clamped = Math.min(spec.max, Math.max(spec.min, parsed));
  updateLayer(target.id, { [spec.key]: clamped / spec.factor } as Partial<AvatarLayer>, false);
}

/** 失焦/回车时把输入框拉回模型真值，避免越界数字留在框里 */
function resync(spec: SliderSpec, event: Event): void {
  const input = event.target as HTMLInputElement;
  input.value = String(shown(spec));
  endChange();
}

function patch(value: Partial<AvatarLayer>): void {
  const target = layer.value;
  if (target) updateLayer(target.id, value);
}

function resetTransform(): void {
  patch({
    size: Math.round(Math.min(editor.document.width, editor.document.height) * 0.4),
    rotation: 0,
    opacity: 1,
    flipH: false,
  });
}

function onNameInput(event: Event): void {
  const target = layer.value;
  if (!target) return;
  const val = (event.target as HTMLInputElement).value;
  updateLayer(target.id, { name: val }, false);
}

/* ------------------------------------------------------------------ *
 * 预设
 * ------------------------------------------------------------------ */

const presetInput = ref<HTMLInputElement | null>(null);

const presetRows = computed(() =>
  editor.presets.map((preset) => {
    const faces = preset.layers
      .filter((l) => l.skin)
      .slice(0, 3)
      .map((l) => {
        const s = l.skin as { dataUrl: string; width: number; height: number; isCustomImage?: boolean };
        if (s.isCustomImage) {
          return {
            dataUrl: s.dataUrl,
            bgSize: 'contain',
            bgPos: 'center',
          };
        }
        const isLegacy = s.height === s.width / 2;
        return {
          dataUrl: s.dataUrl,
          bgSize: isLegacy ? '800% 400%' : '800% 800%',
          bgPos: isLegacy ? '14.2857% 33.3333%' : '14.2857% 14.2857%',
        };
      });
    return { ...preset, faces, extra: Math.max(0, preset.layers.length - faces.length) };
  }),
);

const renamingId = ref<string | null>(null);
const renameText = ref('');
let renameInputEl: HTMLInputElement | null = null;

function bindRenameInput(el: unknown): void {
  renameInputEl = (el as HTMLInputElement | null) ?? null;
}

async function startRename(id: string, current: string): Promise<void> {
  renamingId.value = id;
  renameText.value = current;
  await nextTick();
  renameInputEl?.focus();
  renameInputEl?.select();
}

function commitRename(): void {
  if (renamingId.value) renamePreset(renamingId.value, renameText.value);
  renamingId.value = null;
}

function cancelRename(): void {
  renamingId.value = null;
}

const armedDeleteId = ref<string | null>(null);
let armedTimer: ReturnType<typeof setTimeout> | null = null;

function onDeleteClick(id: string): void {
  if (armedTimer) clearTimeout(armedTimer);
  if (armedDeleteId.value !== id) {
    armedDeleteId.value = id;
    armedTimer = setTimeout(() => {
      armedDeleteId.value = null;
    }, 3000);
    return;
  }
  armedDeleteId.value = null;
  removePreset(id);
}

onBeforeUnmount(() => {
  if (armedTimer) clearTimeout(armedTimer);
});

function pickPresetFile(): void {
  presetInput.value?.click();
}

async function onPresetFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await importPresets(file);
}
</script>

<template>
  <aside class="rail rail--r">
    <div class="rail__head">
      <h2>{{ layer ? (isCustomImage ? '图片属性' : '头像属性') : '图层与预设' }}</h2>
      <span>{{ layer ? layer.name : '未选中' }}</span>
    </div>

    <div class="rail__body bf-scroll">
      <template v-if="layer">
        <div class="preview">
          <span class="preview__face">
            <SkinThumb :skin-id="layer.skinId" :overlay="layer.overlay" :flip-h="layer.flipH" :size="84" />
          </span>
          <span class="preview__meta">
            <input
              :value="layer.name"
              class="bf-inp preview__name"
              type="text"
              maxlength="40"
              aria-label="图层名称"
              @focus="beginChange"
              @input="onNameInput"
              @change="endChange"
              @blur="endChange"
            />
            <span>{{ skinLabel }}</span>
          </span>
        </div>

        <section class="bf-sblk bf-sblk--cyan bf-duo">
          <button
            type="button"
            class="bf-tg"
            role="switch"
            :aria-checked="layer.overlay"
            :disabled="isCustomImage"
            :title="isCustomImage ? '头像图片无帽子层' : '第二层是官方贴图的一部分：Steve 这层正面是一圈不透明灰，关掉能露出完整正脸'"
            @click="patch({ overlay: !layer.overlay })"
          >
            <span class="bf-tg-track" aria-hidden="true"><i class="bf-tg-knob" /></span>
            <span class="bf-tg-t">帽子层</span>
            <span class="bf-tg-s">{{ isCustomImage ? '无' : (layer.overlay ? '开' : '关') }}</span>
          </button>
          <button
            type="button"
            class="bf-tg"
            role="switch"
            :aria-checked="layer.flipH"
            @click="patch({ flipH: !layer.flipH })"
          >
            <span class="bf-tg-track" aria-hidden="true"><i class="bf-tg-knob" /></span>
            <span class="bf-tg-t">水平翻转</span>
            <span class="bf-tg-s">{{ layer.flipH ? '开' : '关' }}</span>
          </button>
        </section>

        <section class="bf-sblk bf-sblk--gold">
          <div class="bf-sblk-t"><h3>变换</h3><span>方向键微调</span></div>
          <div v-for="spec in sliders" :key="spec.key" class="bf-sl">
            <div class="bf-sl-top">
              <span class="bf-sl-label">{{ spec.label }}</span>
              <input
                class="bf-sl-val"
                type="number"
                :min="spec.min"
                :max="spec.max"
                :step="spec.step"
                :value="shown(spec)"
                :aria-label="spec.aria"
                @focus="beginChange"
                @input="setValue(spec, ($event.target as HTMLInputElement).value)"
                @change="resync(spec, $event)"
                @blur="resync(spec, $event)"
              />
            </div>
            <span class="bf-sl-track">
              <i class="bf-sl-fill" :style="{ width: percent(spec) + '%' }" />
              <i class="bf-sl-knob" :style="{ left: percent(spec) + '%' }"><b /></i>
              <input
                type="range"
                :min="spec.min"
                :max="spec.max"
                :step="spec.step"
                :value="shown(spec)"
                :aria-label="spec.aria"
                @pointerdown="beginChange"
                @input="setValue(spec, ($event.target as HTMLInputElement).value)"
                @change="endChange"
                @pointerup="endChange"
              />
            </span>
          </div>
        </section>

        <section class="bf-sblk bf-sblk--red">
          <div class="bf-trio">
            <button class="bf-btn bf-btn--sm bf-btn--quiet" type="button" @click="centerSelected">居中</button>
            <button class="bf-btn bf-btn--sm bf-btn--quiet" type="button" @click="fitSelectedToDocument">铺满</button>
            <button class="bf-btn bf-btn--sm bf-btn--quiet" type="button" @click="resetTransform">重置</button>
          </div>
        </section>

        <section class="bf-sblk bf-sblk--red">
          <div class="bf-duo">
            <button class="bf-btn bf-btn--sm bf-btn--quiet" type="button" @click="duplicateLayer(layer.id)">
              <i class="bf-ic bf-ic--copy" aria-hidden="true"><b /><b /></i>复制
            </button>
            <button class="bf-btn bf-btn--sm bf-btn--quiet" type="button" @click="removeLayer(layer.id)">
              <i class="bf-ic bf-ic--del" aria-hidden="true"><b /><b /></i>删除
            </button>
          </div>
        </section>
      </template>

      <template v-else>
        <div class="empty">
          <p class="empty__t">没有选中的图层</p>
          <p class="bf-note">左边任选一张素材或皮肤即可放下，再点它就能选中。</p>
          <div><button class="bf-btn bf-btn--sm bf-btn--ink" type="button" @click="addAvatar">新增头像</button></div>
        </div>
      </template>

      <!-- 图层列表：只要画布上有图层就显示，无论当前是否选中单张 -->
      <section v-if="editor.layers.length" class="bf-sblk bf-sblk--grass">
        <div class="bf-sblk-t">
          <h3>图层</h3>
          <span class="layers__head">
            <span>{{ editor.layers.length }} 个</span>
            <button class="bf-btn bf-btn--sm bf-btn--quiet layers__add" type="button" @click="addAvatar">新增头像</button>
          </span>
        </div>
        <ul
          class="layers"
          @pointerdown="onListPointerDown"
          @pointermove="onListPointerMove"
          @pointerup="onListPointerUp"
          @pointercancel="onListPointerUp"
        >
          <li v-for="item in layerRows" :key="item.id" :data-layer-id="item.id">
            <div class="bf-lay" :aria-current="item.id === editor.selectedId" :data-dragging="drag?.id === item.id">
              <i class="bf-lay-bar" aria-hidden="true" />
              <i class="lay__grip" aria-hidden="true" />
              <button
                type="button"
                class="lay__pick"
                title="按住上下拖动可以调整前后顺序，Alt + 上下方向键也行"
                @click="selectLayer(item.id)"
                @keydown="onRowKeydown($event, item.id)"
              >
                <span class="bf-face">
                  <SkinThumb :skin-id="item.skinId" :overlay="item.overlay" :flip-h="item.flipH" :size="24" />
                </span>
                <span class="bf-lay-n">{{ item.name }}</span>
              </button>
              <button
                type="button"
                class="lay__vis"
                :data-on="item.visible"
                :title="item.visible ? '隐藏' : '显示'"
                :aria-label="item.visible ? '隐藏该图层' : '显示该图层'"
                @click="updateLayer(item.id, { visible: !item.visible })"
              >
                <i />
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- 预设 -->
      <section class="bf-sblk bf-sblk--grass">
        <div class="bf-sblk-t">
          <h3>预设</h3>
          <span class="preset__acts">
            <span v-if="editor.presets.length">{{ editor.presets.length }} 个</span>
            <button
              v-if="editor.presets.length"
              class="bf-btn bf-btn--sm bf-btn--quiet"
              type="button"
              @click="exportPresets"
            >
              导出
            </button>
            <button class="bf-btn bf-btn--sm bf-btn--quiet" type="button" @click="pickPresetFile">导入</button>
          </span>
        </div>

        <button
          class="bf-btn bf-btn--sm preset__save"
          type="button"
          :disabled="!editor.layers.length"
          :title="editor.layers.length ? '把这张图上的全部图层存成一个预设' : '画布上还没有图层'"
          @click="saveCurrentAsPreset"
        >
          保存全部头像为预设
        </button>
        <input ref="presetInput" class="bf-sr-only" type="file" accept="application/json,.json" @change="onPresetFile" />

        <ul v-if="editor.presets.length" class="rows">
          <li v-for="preset in presetRows" :key="preset.id">
            <div class="bf-lay">
              <i class="bf-lay-bar" :style="{ background: ORIGIN_COLOR.preset }" aria-hidden="true" />
              <button
                v-if="renamingId !== preset.id"
                type="button"
                class="row__pick"
                :title="'套用「' + preset.name + '」：替换画布上的 ' + preset.layers.length + ' 个头像，底图不动'"
                @click="applyPreset(preset.id)"
              >
                <span class="preset__faces" aria-hidden="true">
                  <span
                    v-for="(face, index) in preset.faces"
                    :key="index"
                    class="bf-face preset-face"
                    :style="{
                      backgroundImage: 'url(' + face.dataUrl + ')',
                      backgroundSize: face.bgSize,
                      backgroundPosition: face.bgPos,
                    }"
                  />
                  <span v-if="!preset.faces.length" class="bf-face preset-face preset-face--empty" />
                  <span v-if="preset.extra" class="preset__extra">+{{ preset.extra }}</span>
                </span>
                <span class="bf-lay-n">{{ preset.name }}</span>
              </button>
              <input
                v-else
                :ref="bindRenameInput"
                v-model="renameText"
                class="preset__name-input"
                type="text"
                maxlength="40"
                aria-label="预设名称"
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="cancelRename"
                @blur="commitRename"
              />
              <button
                class="bf-x bf-x--pen"
                type="button"
                title="重命名"
                aria-label="重命名预设"
                @click="startRename(preset.id, preset.name)"
              >
                <i class="bf-ic bf-ic--pen" aria-hidden="true" />
              </button>
              <button
                class="bf-x"
                :class="{ 'bf-x--armed': armedDeleteId === preset.id }"
                type="button"
                :title="armedDeleteId === preset.id ? '再点一次就删掉' : '删除预设'"
                :aria-label="armedDeleteId === preset.id ? '确认删除预设' : '删除预设'"
                @click="onDeleteClick(preset.id)"
              >
                <i class="bf-ic bf-ic--x" aria-hidden="true" />
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="bf-note">还没有预设。摆好头像，点上面的按钮存一组。</p>

        <p class="bf-note preset__hint">
          预设会保存在这台电脑的浏览器里，刷新不丢；换电脑或想备份，可以点上面的「导出」存成 .json 文件。
        </p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.rail {
  width: var(--bf-rail-w);
  flex: none;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bf-rail);
  overflow: hidden;
}
.rail--r { border-left: 1px solid var(--bf-ink); }

.rail__head {
  flex: none;
  height: var(--bf-railhead);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 14px;
  background: var(--bf-white);
  border-bottom: 1px solid var(--bf-ink);
}
.rail__head h2 { font-size: var(--bf-font-size); font-weight: 700; letter-spacing: 0.04em; }
.rail__head span { font-size: var(--bf-font-size-sm); color: var(--bf-ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.rail__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bf-gap);
  padding: var(--bf-pad);
}

.preview { display: flex; align-items: center; gap: 11px; padding-bottom: 13px; border-bottom: 1px solid var(--bf-line); }
.preview__face {
  position: relative;
  width: 92px; height: 92px;
  flex: none;
  display: flex; align-items: center; justify-content: center;
  background: var(--bf-white);
  border: 1px solid var(--bf-ink);
}
.preview__face::after { content: ""; position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; background: var(--bf-grass); }
.preview__meta { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1 1 auto; }
.preview__name {
  height: 26px;
  padding: 0 6px;
  font: 700 var(--bf-font-size-ui) / 1 var(--bf-mono);
  background: var(--bf-white);
  border: 1px solid var(--bf-ink);
  color: var(--bf-ink);
}
.preview__meta span { font-size: var(--bf-font-size-sm); color: var(--bf-ink2); }

.layers { display: flex; flex-direction: column; gap: 6px; }
.layers__head { display: flex; align-items: center; gap: 8px; }
.layers__add { height: 24px; padding: 0 8px; font-size: var(--bf-font-size-sm); }
.lay__pick { display: flex; align-items: center; gap: 9px; flex: 1 1 auto; min-width: 0; text-align: left; }
.lay__vis { flex: none; width: 16px; height: 16px; border: 1px solid var(--bf-ink); display: grid; place-items: center; }
.lay__vis i { display: block; width: 8px; height: 8px; background: transparent; }
.lay__vis[data-on="true"] i { background: var(--bf-ink); }

.empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty__t { font-size: var(--bf-font-size); font-weight: 700; }

.rows { display: flex; flex-direction: column; gap: 6px; }
.preset__acts { display: inline-flex; align-items: center; gap: 6px; }
.preset__save { width: 100%; margin: 8px 0; }
.preset__faces { display: inline-flex; align-items: center; gap: 2px; flex: none; }
.preset-face { width: 20px; height: 20px; image-rendering: pixelated; }
.preset__extra { font: 700 var(--bf-font-size-sm) / 1 var(--bf-mono); color: var(--bf-ink2); }
.preset__name-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  font: 700 var(--bf-font-size-ui) / 1 var(--bf-mono);
  color: var(--bf-ink);
  background: var(--bf-white);
  border: 1px solid var(--bf-ink);
}
.preset__hint { margin-top: 9px; }
.row__pick { display: flex; align-items: center; gap: 9px; flex: 1 1 auto; min-width: 0; text-align: left; }
</style>

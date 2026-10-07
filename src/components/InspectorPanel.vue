<!-- BlockFace · Copyright 2026 Dainsleif · Apache License 2.0 -->
<script setup lang="ts">
import { computed } from 'vue';
import { MIN_LAYER_SIZE, type AvatarLayer } from '../core/model/types';
import {
  addAvatar,
  beginChange,
  centerSelected,
  duplicateLayer,
  editor,
  endChange,
  fitSelectedToDocument,
  maxLayerSize,
  removeLayer,
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

const layer = computed(() => editor.layers.find((l) => l.id === editor.selectedId) ?? null);
const skinLabel = computed(() => {
  const record = editor.skins.find((s) => s.id === layer.value?.skinId) ?? null;
  return record ? record.sourceLabel : '皮肤未载入';
});

const sliders = computed<SliderSpec[]>(() => [
  { key: 'x', label: 'X', aria: '横向位置', min: 0, max: editor.document.width, step: 1, factor: 1 },
  { key: 'y', label: 'Y', aria: '纵向位置', min: 0, max: editor.document.height, step: 1, factor: 1 },
  { key: 'size', label: '大小', aria: '大小', min: MIN_LAYER_SIZE, max: maxLayerSize.value, step: 1, factor: 1 },
  { key: 'rotation', label: '旋转', aria: '旋转角度', min: -180, max: 180, step: 1, factor: 1 },
  { key: 'opacity', label: '不透明度', aria: '不透明度', min: 0, max: 100, step: 1, factor: 100 },
]);

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
</script>

<template>
  <aside class="rail rail--r">
    <div class="rail__head">
      <h2>头像属性</h2>
      <span>{{ layer ? layer.name : '未选中' }}</span>
    </div>

    <div v-if="layer" class="rail__body bf-scroll">
      <div class="preview">
        <span class="preview__face">
          <SkinThumb :skin-id="layer.skinId" :overlay="layer.overlay" :size="84" />
        </span>
        <span class="preview__meta">
          <b>{{ layer.name }}</b>
          <span>{{ skinLabel }}</span>
        </span>
      </div>

      <section class="bf-sblk bf-sblk--cyan">
        <button
          type="button"
          class="bf-tg"
          role="switch"
          :aria-checked="layer.overlay"
          title="官方 Steve 的帽子层本身就是一层不透明灰，这是 Mojang 的原始数据"
          @click="patch({ overlay: !layer.overlay })"
        >
          <span class="bf-tg-track" aria-hidden="true"><i class="bf-tg-knob" /></span>
          <span class="bf-tg-t">帽子层</span>
          <span class="bf-tg-s">{{ layer.overlay ? '开' : '关' }}</span>
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

      <section class="bf-sblk bf-sblk--grass">
        <div class="bf-sblk-t">
          <h3>图层</h3>
          <span class="layers__head">
            <span>{{ editor.layers.length }} 个</span>
            <button class="bf-btn bf-btn--sm bf-btn--quiet layers__add" type="button" @click="addAvatar">新增头像</button>
          </span>
        </div>
        <ul class="layers">
          <li v-for="item in editor.layers" :key="item.id">
            <div class="bf-lay" :aria-current="item.id === editor.selectedId">
              <i class="bf-lay-bar" aria-hidden="true" />
              <button type="button" class="lay__pick" @click="selectLayer(item.id)">
                <span class="bf-face">
                  <SkinThumb :skin-id="item.skinId" :overlay="item.overlay" :size="24" />
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

      <section class="bf-sblk bf-sblk--red rail__tail">
        <div class="bf-duo">
          <button class="bf-btn bf-btn--sm bf-btn--quiet" type="button" @click="duplicateLayer(layer.id)">
            <i class="bf-ic bf-ic--copy" aria-hidden="true"><b /><b /></i>复制
          </button>
          <button class="bf-btn bf-btn--sm bf-btn--quiet" type="button" @click="removeLayer(layer.id)">
            <i class="bf-ic bf-ic--del" aria-hidden="true"><b /><b /></i>删除
          </button>
        </div>
      </section>
    </div>

    <div v-else class="rail__body empty">
      <p class="empty__t">没有选中的头像</p>
      <p class="bf-note">左边任选一张皮肤即可放下头像，再点它就能选中。</p>
      <div><button class="bf-btn bf-btn--sm bf-btn--ink" type="button" @click="addAvatar">新增头像</button></div>
      <div v-if="editor.layers.length" class="bf-sblk bf-sblk--grass">
        <div class="bf-sblk-t"><h3>图层</h3><span>{{ editor.layers.length }} 个</span></div>
        <ul class="layers">
          <li v-for="item in editor.layers" :key="item.id">
            <div class="bf-lay">
              <i class="bf-lay-bar" aria-hidden="true" />
              <button type="button" class="lay__pick" @click="selectLayer(item.id)">
                <span class="bf-face">
                  <SkinThumb :skin-id="item.skinId" :overlay="item.overlay" :size="24" />
                </span>
                <span class="bf-lay-n">{{ item.name }}</span>
              </button>
            </div>
          </li>
        </ul>
      </div>
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
.rail__tail { margin-top: auto; }

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
.preview__meta { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.preview__meta b { font: 700 var(--bf-font-size-ui) / 1 var(--bf-mono); }
.preview__meta span { font-size: var(--bf-font-size-sm); color: var(--bf-ink2); }

.layers { display: flex; flex-direction: column; gap: 6px; }
.layers__head { display: flex; align-items: center; gap: 8px; }
.layers__add { height: 24px; padding: 0 8px; font-size: var(--bf-font-size-sm); }
.lay__pick { display: flex; align-items: center; gap: 9px; flex: 1 1 auto; min-width: 0; text-align: left; }
.lay__vis { flex: none; width: 16px; height: 16px; border: 1px solid var(--bf-ink); display: grid; place-items: center; }
.lay__vis i { display: block; width: 8px; height: 8px; background: transparent; }
.lay__vis[data-on="true"] i { background: var(--bf-ink); }

.empty { gap: 10px; }
.empty__t { font-size: var(--bf-font-size); font-weight: 700; }
</style>

<!-- BlockFace · Copyright 2026 Dainsleif · Apache License 2.0 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AvatarLayer, HandleName } from '../core/model/types';
import {
  allHandlePositions,
  clampLayerToDocument,
  hitTestHandle,
  hitTestLayer,
  layerCorners,
  resizeFromHandle,
  rotationFromHandle,
} from '../core/model/transform';
import { composeDocument } from '../core/render/compose';
import type { SkinTexture } from '../core/skin/texture';
import {
  beginChange,
  editor,
  endChange,
  getBaseImage,
  getSkin,
  selectLayer,
} from '../stores/editor';

/** 旋转手柄离顶边的屏幕距离 */
const ROTATE_OFFSET = 41;
/** 手柄命中半径（屏幕像素） */
const HANDLE_HIT = 10;
/** 手柄尺寸（屏幕像素），与 brand-spec 第 8 节一致 */
const HANDLE_SIZE = 11;
const KNOB_SIZE = 12;

const INK = '#14110f';
const PAPER = '#f2efe6';
const RED = '#c8402f';

const wrap = ref<HTMLDivElement | null>(null);
const stage = ref<HTMLDivElement | null>(null);
const docCanvas = ref<HTMLCanvasElement | null>(null);
const overlayCanvas = ref<HTMLCanvasElement | null>(null);

const wrapSize = ref({ w: 960, h: 620 });
let resizeObserver: ResizeObserver | null = null;

type Drag =
  | { kind: 'move'; id: string; originX: number; originY: number; layerX: number; layerY: number }
  | { kind: 'resize'; id: string; handle: Exclude<HandleName, 'rotate'> }
  | { kind: 'rotate'; id: string };

let drag: Drag | null = null;

const fitScale = computed(() => {
  const pad = 44;
  const sx = (wrapSize.value.w - pad) / editor.document.width;
  const sy = (wrapSize.value.h - pad) / editor.document.height;
  return Math.max(0.05, Math.min(sx, sy, 4));
});

const viewScale = computed(() => (editor.view.autoFit ? fitScale.value : editor.view.zoom));
const zoomPercent = computed(() => Math.round(viewScale.value * 100));

const stageStyle = computed(() => ({
  width: editor.document.width * viewScale.value + 'px',
  height: editor.document.height * viewScale.value + 'px',
}));

const selected = computed(() => editor.layers.find((l) => l.id === editor.selectedId) ?? null);
const baseChip = computed(() =>
  editor.baseImage ? editor.baseImage.width + ' × ' + editor.baseImage.height : '未设置（导出透明底）',
);

const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

let frame = 0;
function schedule(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    render();
  });
}

function render(): void {
  renderDocument();
  renderOverlay();
}

function renderDocument(): void {
  const canvas = docCanvas.value;
  if (!canvas) return;
  const items: { layer: AvatarLayer; skin: SkinTexture }[] = [];
  for (const layer of editor.layers) {
    const skin = getSkin(layer.skinId);
    if (skin) items.push({ layer, skin });
  }
  composeDocument(canvas, {
    width: editor.document.width,
    height: editor.document.height,
    scale: viewScale.value * dpr(),
    baseImage: getBaseImage(editor.baseImageId),
    items,
    checkerboard: !editor.baseImage,
  });
}

function renderOverlay(): void {
  const canvas = overlayCanvas.value;
  if (!canvas) return;
  const scale = viewScale.value * dpr();
  const w = Math.max(1, Math.round(editor.document.width * scale));
  const h = Math.max(1, Math.round(editor.document.height * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.scale(scale, scale);

  const layer = selected.value;
  if (!layer) return;

  const px = 1 / viewScale.value; // 1 屏幕像素 = 多少文档单位
  const corners = layerCorners(layer);

  const tracePath = (): void => {
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
  };

  // 选中框：先铺一层 3px 纸色描边，再压 1px 墨线，等于 brand-spec 里的 outline-offset:1px
  tracePath();
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 3 * px;
  ctx.strokeStyle = PAPER;
  ctx.stroke();
  ctx.lineWidth = 1 * px;
  ctx.strokeStyle = INK;
  ctx.stroke();

  const base = allHandlePositions(layer, 0);
  const rotateHandle = allHandlePositions(layer, ROTATE_OFFSET * px).find((item) => item.name === 'rotate');
  const nw = base.find((item) => item.name === 'nw');
  const ne = base.find((item) => item.name === 'ne');

  if (rotateHandle && nw && ne) {
    const midX = (nw.point.x + ne.point.x) / 2;
    const midY = (nw.point.y + ne.point.y) / 2;
    // 红色竖杆
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(rotateHandle.point.x, rotateHandle.point.y);
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = RED;
    ctx.stroke();
    // 纸色方块旋钮，内含 3px 红石方孔
    const knob = KNOB_SIZE * px;
    const kx = rotateHandle.point.x - knob / 2;
    const ky = rotateHandle.point.y - knob / 2;
    ctx.fillStyle = PAPER;
    ctx.fillRect(kx, ky, knob, knob);
    ctx.lineWidth = 1 * px;
    ctx.strokeStyle = INK;
    ctx.strokeRect(kx + px / 2, ky + px / 2, knob - px, knob - px);
    ctx.fillStyle = RED;
    ctx.fillRect(kx + 3.5 * px, ky + 3.5 * px, 5 * px, 5 * px);
  }

  // 四角红色方块手柄
  const size = HANDLE_SIZE * px;
  for (const handle of base) {
    if (handle.name === 'rotate') continue;
    const x = handle.point.x - size / 2;
    const y = handle.point.y - size / 2;
    ctx.fillStyle = RED;
    ctx.fillRect(x, y, size, size);
    ctx.lineWidth = 1 * px;
    ctx.strokeStyle = INK;
    ctx.strokeRect(x + px / 2, y + px / 2, size - px, size - px);
  }
}

function toDocumentPoint(event: PointerEvent): { x: number; y: number } {
  const rect = stage.value?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: (event.clientX - rect.left) / viewScale.value, y: (event.clientY - rect.top) / viewScale.value };
}

function capturePointer(event: PointerEvent): void {
  try {
    wrap.value?.setPointerCapture(event.pointerId);
  } catch {
    // 合成事件（自动化测试）或指针已释放时无可用 pointerId，忽略即可
  }
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const point = toDocumentPoint(event);
  const px = 1 / viewScale.value;
  const layer = selected.value;

  if (layer) {
    const handle = hitTestHandle(layer, point.x, point.y, HANDLE_HIT * px, ROTATE_OFFSET * px);
    if (handle) {
      beginChange();
      drag = handle === 'rotate' ? { kind: 'rotate', id: layer.id } : { kind: 'resize', id: layer.id, handle };
      capturePointer(event);
      event.preventDefault();
      return;
    }
  }

  for (let i = editor.layers.length - 1; i >= 0; i -= 1) {
    const candidate = editor.layers[i];
    if (!candidate.visible) continue;
    if (hitTestLayer(candidate, point.x, point.y)) {
      selectLayer(candidate.id);
      beginChange();
      drag = {
        kind: 'move',
        id: candidate.id,
        originX: point.x,
        originY: point.y,
        layerX: candidate.x,
        layerY: candidate.y,
      };
      capturePointer(event);
      event.preventDefault();
      return;
    }
  }

  selectLayer(null);
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return;
  const layer = editor.layers.find((l) => l.id === drag!.id);
  if (!layer) return;
  const point = toDocumentPoint(event);

  if (drag.kind === 'move') {
    const next = clampLayerToDocument(
      { x: drag.layerX + (point.x - drag.originX), y: drag.layerY + (point.y - drag.originY), size: layer.size },
      editor.document.width,
      editor.document.height,
    );
    layer.x = Math.round(next.x);
    layer.y = Math.round(next.y);
  } else if (drag.kind === 'resize') {
    const result = resizeFromHandle({ layer, handle: drag.handle, point });
    layer.x = result.x;
    layer.y = result.y;
    layer.size = Math.round(result.size);
  } else {
    layer.rotation = Math.round(rotationFromHandle(layer, point, event.shiftKey ? 15 : 0));
  }
  schedule();
}

function onPointerUp(event: PointerEvent): void {
  if (!drag) return;
  drag = null;
  endChange();
  try {
    if (wrap.value?.hasPointerCapture(event.pointerId)) wrap.value.releasePointerCapture(event.pointerId);
  } catch {
    // 合成事件下没有真实指针，忽略
  }
  schedule();
}

function onWheel(event: WheelEvent): void {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  editor.view.zoom = Math.min(6, Math.max(0.05, viewScale.value * factor));
  editor.view.autoFit = false;
}

function zoomBy(factor: number): void {
  editor.view.zoom = Math.min(6, Math.max(0.05, viewScale.value * factor));
  editor.view.autoFit = false;
}

function fit(): void {
  editor.view.autoFit = true;
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  const layer = selected.value;
  if (!layer) return;

  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    const id = layer.id;
    beginChange();
    const index = editor.layers.findIndex((l) => l.id === id);
    if (index >= 0) editor.layers.splice(index, 1);
    editor.selectedId = editor.layers.at(-1)?.id ?? null;
    endChange();
    schedule();
    return;
  }

  const step = event.shiftKey ? 10 : 1;
  const deltas: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const delta = deltas[event.key];
  if (!delta) return;
  event.preventDefault();
  beginChange();
  const next = clampLayerToDocument(
    { x: layer.x + delta[0], y: layer.y + delta[1], size: layer.size },
    editor.document.width,
    editor.document.height,
  );
  layer.x = next.x;
  layer.y = next.y;
  endChange();
  schedule();
}

onMounted(() => {
  const element = wrap.value;
  if (element) {
    resizeObserver = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      wrapSize.value = { w: rect.width, h: rect.height };
    });
    resizeObserver.observe(element);
    const rect = element.getBoundingClientRect();
    wrapSize.value = { w: rect.width, h: rect.height };
  }
  window.addEventListener('keydown', onKeyDown);
  schedule();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', onKeyDown);
  if (frame) cancelAnimationFrame(frame);
});

watch(
  () => [
    editor.document.width,
    editor.document.height,
    editor.selectedId,
    editor.baseImageId,
    editor.layers,
    editor.skinRevision,
    viewScale.value,
  ],
  schedule,
  { deep: true },
);

defineExpose({ schedule });
</script>

<template>
  <section class="stage">
    <div class="stage__head">
      <span class="bf-chip bf-chip--m"><i class="bf-chip-sq" aria-hidden="true" />底图 {{ baseChip }}</span>
      <span class="bf-chip bf-chip--m">显示 {{ zoomPercent }}%</span>
      <span class="bf-chip">
        <i class="bf-chip-sq bf-chip-sq--grass" aria-hidden="true" />
        图层 {{ editor.layers.length }} 个{{ selected ? ' · 选中 ' + selected.name : '' }}
      </span>
      <span class="stage__zoombar">
        <button class="bf-btn bf-btn--icon bf-btn--quiet" type="button" title="缩小" aria-label="缩小" @click="zoomBy(1 / 1.25)">
          <i class="bf-ic bf-ic--minus" aria-hidden="true"><b /></i>
        </button>
        <button class="bf-btn bf-btn--sm bf-btn--quiet" type="button" @click="fit">适应窗口</button>
        <button class="bf-btn bf-btn--icon bf-btn--quiet" type="button" title="放大" aria-label="放大" @click="zoomBy(1.25)">
          <i class="bf-ic bf-ic--plus" aria-hidden="true"><b /><b /></i>
        </button>
      </span>
    </div>

    <div
      ref="wrap"
      class="stage__body"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
    >
      <div ref="stage" class="artboard" :style="stageStyle">
        <canvas ref="docCanvas" class="artboard__doc" />
        <canvas ref="overlayCanvas" class="artboard__overlay" />
      </div>

      <p v-if="!editor.baseImage" class="stage__empty">把图片拖进窗口，或点顶栏的「打开图片」</p>
    </div>

    <div class="stage__foot">
      <span class="bf-chip bf-chip--dark">拖动移动 · 四角缩放 · 顶部旋转</span>
    </div>
  </section>
</template>

<style scoped>
.stage {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background-color: var(--bf-stage);
  background-image:
    repeating-linear-gradient(90deg, var(--bf-stage-major) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(0deg, var(--bf-stage-major) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(90deg, var(--bf-stage-line) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(0deg, var(--bf-stage-line) 0 1px, transparent 1px 8px);
}

.stage__head,
.stage__foot { flex: none; display: flex; align-items: center; gap: 8px; }

.stage__zoombar { margin-left: auto; display: flex; align-items: center; gap: 8px; }

.stage__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

.artboard {
  position: relative;
  flex: none;
  border: 1px solid var(--bf-ink);
  background: var(--bf-board);
  box-shadow: 0 0 0 1px var(--bf-stage-major);
}

.artboard__doc,
.artboard__overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.artboard__doc { image-rendering: pixelated; }
.artboard__overlay { pointer-events: none; }

.stage__empty {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  font-size: var(--bf-font-size-sm);
  color: var(--bf-paper);
  background: rgba(20, 17, 15, 0.72);
  border: 1px solid var(--bf-stage-major);
  padding: 6px 12px;
  white-space: nowrap;
}

.stage__foot-note { margin-left: auto; }
</style>

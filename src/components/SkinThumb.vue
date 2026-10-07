<!-- BlockFace · Copyright 2026 Dainsleif · Apache License 2.0 -->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { headCache } from '../core/render/headCache';
import { editor, getSkin } from '../stores/editor';

const props = withDefaults(
  defineProps<{
    skinId: string | null;
    /** 是否叠帽子层 */
    overlay?: boolean;
    size?: number;
  }>(),
  { overlay: true, size: 44 },
);

const el = ref<HTMLCanvasElement | null>(null);

function draw(): void {
  const canvas = el.value;
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixels = Math.max(1, Math.round(props.size * dpr));
  canvas.width = pixels;
  canvas.height = pixels;
  canvas.style.width = props.size + 'px';
  canvas.style.height = props.size + 'px';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixels, pixels);
  const skin = getSkin(props.skinId);
  if (!skin) return;
  const head = headCache.get(skin, props.overlay, pixels);
  ctx.drawImage(head, 0, 0);
}

onMounted(draw);
watch(() => [props.skinId, props.overlay, props.size, editor.skinRevision], draw);
defineExpose({ draw });
</script>

<template>
  <canvas ref="el" class="skin-thumb" aria-hidden="true" />
</template>

<style scoped>
.skin-thumb {
  display: block;
  image-rendering: pixelated;
}
</style>

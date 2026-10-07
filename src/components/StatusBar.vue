<!-- BlockFace · Copyright 2026 Dainsleif · Apache License 2.0 -->
<script setup lang="ts">
import { computed } from 'vue';
import { editor } from '../stores/editor';

const zoomLabel = computed(() =>
  editor.view.autoFit ? '适应窗口' : Math.round(editor.view.zoom * 100) + '%',
);
const activeRecord = computed(() => editor.skins.find((s) => s.id === editor.activeSkinId) ?? null);
const baseLabel = computed(() => {
  if (!editor.baseImage) return '未设置';
  const percent = Math.round(editor.baseView.scale * 100);
  return editor.baseImage.width + ' × ' + editor.baseImage.height + ' · ' + percent + '%';
});
const skinLabel = computed(() => {
  const record = activeRecord.value;
  if (!record) return '未选皮肤';
  return record.sourceLabel + ' · ' + record.meta.label;
});
</script>

<template>
  <footer class="statusbar">
    <span class="st"><i class="st-sq" aria-hidden="true" />画布 <b>{{ editor.document.width }} × {{ editor.document.height }} px</b></span>
    <span class="st">底图 <b>{{ baseLabel }}</b></span>
    <span class="st">头像 <b>{{ editor.layers.length }}</b> 个</span>
    <span class="st">皮肤 <b>{{ skinLabel }}</b></span>
    <span class="st">缩放 <b>{{ zoomLabel }}</b></span>
    <span class="st-right">
      <span class="beat" aria-hidden="true">
        <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
      </span>
      <span>本地计算 · 图片不上传</span>
    </span>
  </footer>
</template>

<style scoped>
.statusbar {
  flex: none;
  height: var(--bf-statusbar);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: var(--bf-white);
  border-top: 1px solid var(--bf-ink);
  font-size: var(--bf-font-size-sm);
  color: var(--bf-ink2);
  overflow: hidden;
  white-space: nowrap;
}
.st { display: flex; align-items: center; gap: 6px; flex: none; }
.st b { font-family: var(--bf-mono); color: var(--bf-ink); font-weight: 700; }
.st-sq { width: 8px; height: 8px; background: var(--bf-ink); flex: none; }
.st-right { margin-left: auto; display: flex; align-items: center; gap: 10px; flex: none; }
.beat { display: flex; align-items: center; gap: 3px; height: 14px; }
.beat i { display: block; width: 8px; height: 8px; background: var(--bf-ink); }
.beat i:nth-child(3n + 1) { background: var(--bf-grass); }
.beat i:nth-child(4n + 2) { background: var(--bf-gold); }
.beat i:nth-child(5n + 3) { background: var(--bf-cyan); }
.beat i:nth-child(7n) { height: 14px; }
</style>

<!-- BlockFace · Copyright 2026 Dainsleif · Apache License 2.0 -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  canRedo,
  canUndo,
  editor,
  exportPng,
  redo,
  setBaseImage,
  undo,
} from '../stores/editor';

const fileInput = ref<HTMLInputElement | null>(null);
const busy = computed(() => editor.busy !== null);

function pick(): void {
  fileInput.value?.click();
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await setBaseImage(file);
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="bf-glyph" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
      <span class="brand__name">BlockFace</span>
    </div>
    <span class="topbar__sep" aria-hidden="true" />

    <div class="actions">
      <button class="bf-btn" type="button" :disabled="busy" @click="pick">
        <i class="bf-ic bf-ic--open" aria-hidden="true"><b /><b /></i>打开图片
      </button>
      <input ref="fileInput" class="bf-sr-only" type="file" accept="image/*" @change="onFile" />

      <label class="scale">
        <span class="scale__label">倍率</span>
        <select v-model.number="editor.exportScale" class="scale__select" aria-label="导出倍率">
          <option :value="1">1×</option>
          <option :value="2">2×</option>
          <option :value="3">3×</option>
        </select>
      </label>

      <button class="bf-btn bf-btn--go" type="button" :disabled="busy" @click="exportPng">
        <i class="bf-ic bf-ic--out" aria-hidden="true"><b /><b /></i>导出 PNG
      </button>

      <span class="topbar__sep" aria-hidden="true" />

      <button
        class="bf-btn bf-btn--icon"
        type="button"
        title="撤销 (Ctrl+Z)"
        aria-label="撤销"
        :disabled="!canUndo"
        @click="undo"
      >
        <i class="bf-ic bf-ic--undo" aria-hidden="true" />
      </button>
      <button
        class="bf-btn bf-btn--icon"
        type="button"
        title="重做 (Ctrl+Shift+Z)"
        aria-label="重做"
        :disabled="!canRedo"
        @click="redo"
      >
        <i class="bf-ic bf-ic--redo" aria-hidden="true" />
      </button>

      <span v-if="editor.busy" class="busy">{{ editor.busy }}…</span>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  flex: none;
  height: var(--bf-topbar);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: var(--bf-white);
  border-bottom: 1px solid var(--bf-ink);
  position: relative;
  z-index: 5;
}

.brand { display: flex; align-items: center; gap: 10px; }
.brand__name { font: 700 17px/1 var(--bf-mono); letter-spacing: 0.02em; }


.topbar__sep { width: 1px; height: 26px; background: var(--bf-line); flex: none; }

.actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }

.scale { display: flex; align-items: center; gap: 6px; }
.scale__label { font-size: var(--bf-font-size-sm); color: var(--bf-ink2); }
.scale__select {
  height: 34px;
  padding: 0 6px;
  border: 1px solid var(--bf-ink);
  background: var(--bf-white);
  color: var(--bf-ink);
  font: 600 var(--bf-font-size-ui) / 1 var(--bf-mono);
}

.busy { font-size: var(--bf-font-size-sm); color: var(--bf-ink2); }
</style>

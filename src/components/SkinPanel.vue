<!-- BlockFace · Copyright 2026 Dainsleif · Apache License 2.0 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { SkinOrigin } from '../core/skin/texture';
import {
  applyPreset,
  BUILTIN_SKINS,
  editor,
  exportPresets,
  importPresets,
  preloadBuiltins,
  removePreset,
  saveCurrentAsPreset,
  useAccountSkin,
  useBuiltinSkin,
  useExistingSkin,
  useSkinFile,
  useSkinUrl,
} from '../stores/editor';
import SkinThumb from './SkinThumb.vue';

/** 来源 → 色条：与各入口小标题的颜色一一对应，所以列表里不用再写一遍来源文字 */
const ORIGIN_COLOR: Record<SkinOrigin, string> = {
  builtin: 'var(--bf-grass)',
  account: 'var(--bf-gold)',
  upload: 'var(--bf-cyan)',
  url: 'var(--bf-red)',
  preset: 'var(--bf-ink)',
};

const accountId = ref('');
const urlInput = ref('');
const skinInput = ref<HTMLInputElement | null>(null);
const presetInput = ref<HTMLInputElement | null>(null);
const dropActive = ref(false);
const accountState = ref<'idle' | 'busy' | 'ok' | 'fail'>('idle');
const accountText = ref('');

const busy = computed(() => editor.busy !== null);

function builtinRecord(id: string): (typeof editor.skins)[number] | null {
  return editor.skins.find((s) => s.id === 'builtin-' + id) ?? null;
}

function builtinSize(id: string): string {
  const record = builtinRecord(id);
  return record ? record.meta.width + '×' + record.meta.height : '…';
}

function isActive(id: string): boolean {
  return editor.activeSkinId === 'builtin-' + id;
}

onMounted(() => {
  void preloadBuiltins();
});

async function submitAccount(): Promise<void> {
  const value = accountId.value.trim();
  if (!value || busy.value) return;
  accountState.value = 'busy';
  accountText.value = '查询中…';
  try {
    await useAccountSkin(value);
    accountState.value = 'ok';
    accountText.value = '已套用 ' + value;
  } catch (error) {
    accountState.value = 'fail';
    accountText.value = error instanceof Error ? error.message : '查询失败';
  }
}

async function submitUrl(): Promise<void> {
  const value = urlInput.value.trim();
  if (!value || busy.value) return;
  await useSkinUrl(value);
  urlInput.value = '';
}

function pickSkin(): void {
  skinInput.value?.click();
}

function pickPresetFile(): void {
  presetInput.value?.click();
}

async function onSkinFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await useSkinFile(file);
}

async function onPresetFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await importPresets(file);
}

async function onDrop(event: DragEvent): Promise<void> {
  dropActive.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) await useSkinFile(file);
}
</script>

<template>
  <aside class="rail rail--l">
    <div class="rail__head">
      <h2>皮肤来源</h2>
    </div>

    <div class="rail__body bf-scroll">
      <section class="bf-sblk bf-sblk--grass">
        <div class="bf-sblk-t"><h3>内置皮肤</h3></div>
        <div class="bf-duo">
          <button
            v-for="builtin in BUILTIN_SKINS"
            :key="builtin.id"
            type="button"
            class="bf-card card"
            :aria-pressed="isActive(builtin.id)"
            @click="useBuiltinSkin(builtin.id)"
          >
            <span v-if="isActive(builtin.id)" class="bf-card-flag">使用中</span>
            <SkinThumb :skin-id="'builtin-' + builtin.id" :size="56" />
            <span class="bf-card-n">{{ builtin.name }}</span>
            <span class="bf-card-s">{{ builtinSize(builtin.id) }}</span>
          </button>
        </div>
      </section>

      <section class="bf-sblk bf-sblk--gold" title="经 playerdb.co 取回贴图；Mojang 官方接口不返回跨域头，纯前端无法直连">
        <div class="bf-sblk-t"><h3>正版账号 ID</h3></div>
        <form class="bf-row" @submit.prevent="submitAccount">
          <input
            v-model="accountId"
            class="bf-inp"
            type="text"
            placeholder="例如 Notch"
            aria-label="正版账号 ID"
            :disabled="busy"
          />
          <button class="bf-btn bf-btn--sm bf-btn--ink" type="submit" :disabled="busy || !accountId.trim()">查询</button>
        </form>
        <div v-if="accountState === 'busy'" class="qstat">
          <i class="qdot" aria-hidden="true" /><i class="qdot" aria-hidden="true" /><i class="qdot" aria-hidden="true" />
          <span>{{ accountText }}</span>
        </div>
        <div v-else-if="accountState !== 'idle'" class="qstat">
          <i class="bf-lamp" :class="accountState === 'ok' ? 'bf-lamp--ok' : 'bf-lamp--no'" aria-hidden="true" />
          <span>{{ accountText }}</span>
        </div>
      </section>

      <section class="bf-sblk bf-sblk--cyan">
        <div class="bf-sblk-t"><h3>上传皮肤</h3></div>
        <div
          class="bf-drop"
          role="button"
          tabindex="0"
          :data-active="dropActive"
          @click="pickSkin"
          @keydown.enter.prevent="pickSkin"
          @dragover.stop.prevent="dropActive = true"
          @dragleave.stop="dropActive = false"
          @drop.stop.prevent="onDrop"
        >
          <i class="bf-ic bf-ic--file" aria-hidden="true"><b /><b /></i>
          <span class="bf-drop-t">拖入或点击选择</span>
          <span class="bf-drop-s">64×64 · 64×32 · 128 以上高清</span>
        </div>
        <input ref="skinInput" class="bf-sr-only" type="file" accept="image/png,image/jpeg,image/webp" @change="onSkinFile" />
      </section>

      <section class="bf-sblk bf-sblk--red">
        <div class="bf-sblk-t"><h3>皮肤 URL</h3></div>
        <form class="bf-row" @submit.prevent="submitUrl">
          <input
            v-model="urlInput"
            class="bf-inp"
            type="url"
            placeholder="粘贴图片直链"
            aria-label="皮肤 URL"
            :disabled="busy"
          />
          <button class="bf-btn bf-btn--sm" type="submit" :disabled="busy || !urlInput.trim()">加载</button>
        </form>
      </section>

      <section v-if="editor.skins.length" class="bf-sblk bf-sblk--grass">
        <div class="bf-sblk-t"><h3>已载入</h3><span>{{ editor.skins.length }} 张</span></div>
        <ul class="rows">
          <li v-for="record in editor.skins" :key="record.id">
            <button
              type="button"
              class="bf-lay row"
              :aria-current="record.id === editor.activeSkinId"
              @click="useExistingSkin(record.id)"
            >
              <i class="bf-lay-bar" :style="{ background: ORIGIN_COLOR[record.origin] }" aria-hidden="true" />
              <span class="bf-face"><SkinThumb :skin-id="record.id" :size="24" /></span>
              <span class="bf-lay-n">{{ record.sourceLabel }}</span>
              <span class="bf-lay-m">{{ record.meta.label }}</span>
              <i v-if="record.tainted" class="row__warn" title="该来源未开启 CORS，导出可能失败" aria-hidden="true">!</i>
            </button>
          </li>
        </ul>
      </section>

      <section class="bf-sblk bf-sblk--grass rail__tail">
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

        <p class="bf-note">预设存的是<strong>整张图</strong>：底图、画布尺寸和上面的每个头像一起打包。套用会把当前画布整体换掉，撤销一次就能退回来。</p>

        <button
          class="bf-btn bf-btn--sm preset__save"
          type="button"
          :disabled="!editor.layers.length && !editor.baseImage"
          :title="editor.layers.length || editor.baseImage ? '把当前整张图（底图 + 全部头像）存成预设' : '画布还是空的，先载入底图或放个头像'"
          @click="saveCurrentAsPreset"
        >
          保存整张为预设
        </button>
        <input ref="presetInput" class="bf-sr-only" type="file" accept="application/json,.json" @change="onPresetFile" />

        <ul v-if="editor.presets.length" class="rows">
          <li v-for="preset in editor.presets" :key="preset.id">
            <div class="bf-lay">
              <i class="bf-lay-bar" :style="{ background: ORIGIN_COLOR.preset }" aria-hidden="true" />
              <button
                type="button"
                class="row__pick"
                :title="'套用「' + preset.name + '」：' + preset.width + '×' + preset.height + '，' + preset.layers.length + ' 个头像（会替换当前画布，可撤销）'"
                @click="applyPreset(preset.id)"
              >
                <span
                  class="bf-face preset-face"
                  :class="{ 'preset-face--empty': !(preset.base && preset.base.kind === 'data') }"
                  :style="preset.base && preset.base.kind === 'data' ? { backgroundImage: 'url(' + preset.base.value + ')' } : undefined"
                />
                <span class="bf-lay-n">{{ preset.name }}</span>
              </button>
              <span class="bf-lay-m">{{ preset.layers.length }} 头像</span>
              <button class="bf-x" type="button" title="删除预设" aria-label="删除预设" @click="removePreset(preset.id)">
                <i class="bf-ic bf-ic--x" aria-hidden="true" />
              </button>
            </div>
          </li>
        </ul>
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
.rail--l { border-right: 1px solid var(--bf-ink); }

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

.rail__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bf-gap);
  padding: var(--bf-pad);
}
.rail__tail { margin-top: auto; }

.card { height: 128px; }

.qstat { display: flex; align-items: center; gap: 6px; margin-top: 9px; font-size: var(--bf-font-size-sm); color: var(--bf-ink2); }
.qdot { width: 7px; height: 7px; background: var(--bf-gold); animation: qstep 1.2s steps(1, end) infinite; }
.qdot:nth-child(2) { animation-delay: 0.4s; }
.qdot:nth-child(3) { animation-delay: 0.8s; }
@keyframes qstep {
  0% { opacity: 1; }
  45% { opacity: 0.2; }
  100% { opacity: 1; }
}

.rows { display: flex; flex-direction: column; gap: 6px; }
.row { width: 100%; text-align: left; }
.row:hover { border-color: var(--bf-ink); }
.row__warn {
  flex: none;
  width: 16px; height: 16px;
  display: grid; place-items: center;
  background: var(--bf-gold);
  color: var(--bf-ink);
  font-size: var(--bf-font-size-sm);
  font-weight: 700;
  font-style: normal;
}

.preset__acts { display: flex; align-items: center; gap: 6px; }
.preset__save { width: 100%; margin-bottom: 8px; }
.row__pick { display: flex; align-items: center; gap: 9px; flex: 1 1 auto; min-width: 0; text-align: left; }
</style>

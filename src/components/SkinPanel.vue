<!-- BlockFace · Copyright 2026 Dainsleif · Apache License 2.0 -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { SkinOrigin } from '../core/skin/texture';
import {
  applyPreset,
  BUILTIN_SKINS,
  editor,
  exportPresets,
  importPresets,
  MAX_BATCH,
  preloadBuiltins,
  removePreset,
  renamePreset,
  saveCurrentAsPreset,
  splitBatchInput,
  useAccountSkins,
  useBuiltinSkin,
  useExistingSkin,
  useSkinFiles,
  useSkinUrls,
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

/** 预设列表：最多画三个头像缩略图，多于三个用 +N 标出来，一眼能认出是哪一组 */
const presetRows = computed(() =>
  editor.presets.map((preset) => {
    const faces = preset.layers
      .filter((layer) => layer.skin)
      .slice(0, 3)
      .map((layer) => {
        const s = layer.skin as { dataUrl: string; width: number; height: number };
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

/** 改名：点铅笔就地编辑，回车提交、Esc 取消、失焦也算提交 */
const renamingId = ref<string | null>(null);
const renameText = ref('');
/**
 * 这个输入框在 v-for 里，模板 ref 会变成数组、focus() 静默失效（点了铅笔却打不了字），
 * 所以用函数式 ref 只记住当前正在改名的那一个。
 */
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

/**
 * 删除要点两下：预设不在撤销历史里（历史只快照文档），误点一次不该就永久没了。
 * 第一下把按钮变成"再点一次就删掉"，3 秒没动作自动收回。
 */
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

onBeforeUnmount(() => {
  if (armedTimer) clearTimeout(armedTimer);
});

async function submitAccount(): Promise<void> {
  const value = accountId.value.trim();
  if (!value || busy.value) return;
  const count = splitBatchInput(value).length;
  accountState.value = 'busy';
  accountText.value = count > 1 ? `查询 ${count} 个账号…` : '查询中…';
  const result = await useAccountSkins(value);
  accountState.value = result.ok > 0 && result.failed.length === 0 ? 'ok' : 'fail';
  accountText.value = result.failed.length
    ? `成功 ${result.ok} 个 · 失败 ${result.failed.length} 个`
    : count > 1
      ? `已添加 ${result.ok} 个头像`
      : '已套用 ' + value;
}

async function submitUrl(): Promise<void> {
  const value = urlInput.value.trim();
  if (!value || busy.value) return;
  await useSkinUrls(value);
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
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length) await useSkinFiles(files);
}

async function onPresetFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await importPresets(file);
}

async function onDrop(event: DragEvent): Promise<void> {
  dropActive.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length) await useSkinFiles(files);
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
        <div
          class="bf-sblk-t"
          :title="'一次填多个账号（空格、逗号或换行隔开）会各加一个头像，最多 ' + MAX_BATCH + ' 个'"
        >
          <h3>正版账号 ID</h3>
          <span>多个各加一个</span>
        </div>
        <form class="bf-row" @submit.prevent="submitAccount">
          <input
            v-model="accountId"
            class="bf-inp"
            type="text"
            placeholder="Notch，可贴几个账号"
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
        <div class="bf-sblk-t" title="按住 Ctrl/Cmd 多选，或一次拖入多张，每张各加一个头像">
          <h3>上传皮肤</h3>
          <span>可多选</span>
        </div>
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
        <input
          ref="skinInput"
          class="bf-sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          @change="onSkinFile"
        />
      </section>

      <section class="bf-sblk bf-sblk--red">
        <div class="bf-sblk-t" title="一次填多个地址（空格或换行隔开）会各加一个头像">
          <h3>皮肤 URL</h3>
          <span>多个各加一个</span>
        </div>
        <form class="bf-row" @submit.prevent="submitUrl">
          <input
            v-model="urlInput"
            class="bf-inp"
            type="text"
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

        <button
          class="bf-btn bf-btn--sm preset__save"
          type="button"
          :disabled="!editor.layers.length"
          :title="editor.layers.length ? '把这张图上的全部头像存成一个预设' : '画布上还没有头像'"
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
          预设 = 这张图上<strong>全部头像</strong>的摆法；套用只换头像，<strong>底图不动</strong>。
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
.preset__faces { flex: none; display: flex; align-items: center; gap: 2px; }
.preset__faces .preset-face { width: 18px; height: 18px; image-rendering: pixelated; }
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

/** 预设的真实落盘：拼一张"底图 + 两个头像"的图，存成预设，点导出，看 JSON 文件有没有真的下载下来 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);
const store = window.__blockface;
const { editor } = store;

// 干净的舞台 + 一张真底图（走真实上传路径，底图 data URI 才会被留存）
store.clearBaseImage();
for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(300);

const canvas = document.createElement('canvas');
canvas.width = 480;
canvas.height = 320;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#3b6ea5';
ctx.fillRect(0, 0, 480, 320);
ctx.fillStyle = '#f2e8d5';
ctx.fillRect(40, 40, 120, 120);
const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
await store.setBaseImage(new File([blob], '探针底图.png', { type: 'image/png' }));
await sleep(700);

document.querySelector('.rail--l .bf-card').dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(800);
store.addAvatar();
await sleep(250);
await store.useBuiltinSkin('alex');
await sleep(700);
store.updateLayer(editor.layers[0].id, { x: 150, y: 160, size: 180 });
store.updateLayer(editor.layers[1].id, { x: 340, y: 120, size: 120, overlay: false });
await sleep(400);

store.saveCurrentAsPreset();
await sleep(500);

const preset = editor.presets[0];
const exportBtn = Array.from(document.querySelectorAll('.rail--l button')).find((b) => b.textContent.trim() === '导出');
if (!exportBtn) return { fatal: '预设区没有找到导出按钮' };
exportBtn.click();
await sleep(2000);

return {
  presets: editor.presets.length,
  presetName: preset ? preset.name : null,
  baseKind: preset && preset.base ? preset.base.kind : null,
  baseBytes: preset && preset.base ? preset.base.value.length : 0,
  layerCount: preset ? preset.layers.length : 0,
  layerSkins: preset ? preset.layers.filter((l) => l.skin).length : 0,
  document: preset ? preset.width + '×' + preset.height : null,
  totalBytes: preset ? JSON.stringify(preset).length : 0,
  notice: editor.notice ? editor.notice.tone + ': ' + editor.notice.message : null,
  expectedFilename: 'blockface-templates-*.json',
};

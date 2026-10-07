/**
 * 预设文件的往返：把当前这张图存成预设 → 序列化成文件内容 → 清空一切 → 当成外部文件导入 → 套用。
 * 走的是 parsePresetFile / applyPreset 的真实路径，验证"换台机器也能还原"。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);
const store = window.__blockface;
const { editor } = store;
const { serializePresetFile } = await import('/src/core/model/preset.ts');
const { renderHeadCanvas } = await import('/src/core/render/head.ts');

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

// 1. 拼一张有底图、有两个头像的图
store.clearBaseImage();
for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(300);

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 260;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#264653';
ctx.fillRect(0, 0, 400, 260);
ctx.fillStyle = '#e9c46a';
ctx.fillRect(0, 0, 60, 60);
const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
await store.setBaseImage(new File([blob], '往返底图.png', { type: 'image/png' }));
await sleep(700);

document.querySelector('.rail--l .bf-card').dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(800);
store.addAvatar();
await sleep(250);
await store.useBuiltinSkin('alex');
await sleep(700);
store.updateLayer(editor.layers[0].id, { x: 110, y: 130, size: 140, rotation: 0, opacity: 1, overlay: false });
store.updateLayer(editor.layers[1].id, { x: 290, y: 120, size: 100, rotation: 0, opacity: 1, overlay: true });
await sleep(400);

store.saveCurrentAsPreset();
await sleep(400);
const saved = editor.presets[0];
check('先存出一个预设', !!saved, 'presets=' + editor.presets.length);
const fileText = serializePresetFile(editor.presets);
check('序列化后的文件自带底图与两个头像的皮肤',
  fileText.indexOf('"kind": "data"') > 0 && (fileText.match(/data:image\/png;base64,/g) || []).length >= 3,
  fileText.length + ' 字符，内嵌位图 ' + (fileText.match(/data:image\/png;base64,/g) || []).length + ' 张');

// 2. 清空一切，模拟"另一台机器刚打开"
localStorage.clear();
editor.presets.length = 0;
store.clearBaseImage();
for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(500);
check('清空后确实什么都没有', editor.presets.length === 0 && editor.layers.length === 0 && !editor.baseImageId,
  'presets=' + editor.presets.length + ' layers=' + editor.layers.length + ' base=' + editor.baseImageId);

// 3. 把那段文本当成外部文件导入
await store.importPresets(new File([fileText], 'blockface-templates.json', { type: 'application/json' }));
await sleep(600);
check('导入后拿到 1 个预设', editor.presets.length === 1, 'presets=' + editor.presets.length);
const preset = editor.presets[0];
check('预设名字与画布尺寸跟着文件过来',
  !!preset && preset.name === saved.name && preset.width === 400 && preset.height === 260,
  preset ? preset.name + ' ' + preset.width + '×' + preset.height : 'null');
check('底图是内嵌型（不依赖外部地址）', !!preset && !!preset.base && preset.base.kind === 'data',
  preset && preset.base ? preset.base.kind + ' · ' + preset.base.value.length + ' 字符' : 'null');

// 4. 套用：整张图应该原样回来
await store.applyPreset(preset.id);
await sleep(1200);
check('套用后底图与画布尺寸回来了',
  !!editor.baseImageId && editor.document.width === 400 && editor.document.height === 260,
  'base=' + editor.baseImageId + ' ' + editor.document.width + '×' + editor.document.height);
check('套用后两个头像都在', editor.layers.length === 2, 'layers=' + editor.layers.length);
check('逐层变换与帽子层状态都对得上',
  editor.layers[0].size === 140 && editor.layers[0].overlay === false && editor.layers[0].x === 110
    && editor.layers[1].size === 100 && editor.layers[1].overlay === true && editor.layers[1].x === 290,
  JSON.stringify(editor.layers.map((l) => ({ x: l.x, y: l.y, size: l.size, overlay: l.overlay }))));
check('皮肤以 preset 来源登记', editor.skins.filter((s) => s.origin === 'preset').length === 2,
  editor.skins.map((s) => s.origin).join(','));

// 真的画到屏幕上了：拿离屏头像画布的同一点比对（避开正脸中心那条像素边界）
const layer = editor.layers[0];
const skin = store.getSkin(layer.skinId);
const rect = document.querySelector('.artboard').getBoundingClientRect();
const viewScale = (rect.width - 2) / editor.document.width;
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const rel = 0.3125;
const device = Math.round(layer.size * viewScale * dpr);
const head = renderHeadCanvas(skin, { overlay: layer.overlay, pixelSize: device });
const headPixel = Array.from(head.getContext('2d').getImageData(Math.round(head.width * rel), Math.round(head.height * rel), 1, 1).data);
const docCanvas = document.querySelector('.artboard__doc');
const drawn = Array.from(docCanvas.getContext('2d').getImageData(
  Math.round((layer.x - layer.size / 2 + layer.size * rel) * viewScale * dpr),
  Math.round((layer.y - layer.size / 2 + layer.size * rel) * viewScale * dpr), 1, 1).data);
check('导入的皮肤真的画到了画布上（与离屏画布同点同色）',
  drawn[3] === 255 && drawn[0] === headPixel[0] && drawn[1] === headPixel[1] && drawn[2] === headPixel[2],
  '屏幕=' + JSON.stringify(drawn) + ' 离屏=' + JSON.stringify(headPixel));

const basePixel = Array.from(docCanvas.getContext('2d').getImageData(
  Math.round(6 * viewScale * dpr), Math.round(6 * viewScale * dpr), 1, 1).data);
check('底图也画上去了（左上角是底图的黄色块）',
  Math.abs(basePixel[0] - 233) <= 2 && Math.abs(basePixel[1] - 196) <= 2 && Math.abs(basePixel[2] - 106) <= 2,
  '左上角=' + JSON.stringify(basePixel) + ' 期望≈[233,196,106]');

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

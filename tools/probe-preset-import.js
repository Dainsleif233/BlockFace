/**
 * 预设文件的往返：底图上摆好两个头像 → 存成预设 → 序列化成文件内容 → 删掉画布上的头像 →
 * 当成外部文件导入 → 套用。验证"头像信息能原样回来，而底图自始至终没被动过"。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);
const store = window.__blockface;
const { editor } = store;
const { serializePresetFile } = await import('/src/core/model/preset.ts');
const { renderHeadCanvas } = await import('/src/core/render/head.ts');

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

// 1. 一张底图 + 两个头像
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

const baseIdBefore = editor.baseImageId;
store.saveCurrentAsPreset();
await sleep(400);
const saved = editor.presets[0];
check('先在一张底图上存出一个预设', !!saved, 'presets=' + editor.presets.length);
const fileText = serializePresetFile(editor.presets);
// 只断言没有 base 字段：skin 里本来就有 width/height（那是贴图尺寸，不是画布尺寸）
check('预设文件只装头像的皮肤，不含底图',
  fileText.indexOf('"base"') < 0 && (fileText.match(/data:image\/png;base64,/g) || []).length === 2,
  fileText.length + ' 字符，内嵌皮肤 ' + (fileText.match(/data:image\/png;base64,/g) || []).length + ' 张');

// 2. 删掉画布上的头像，底图留着不动，模拟"换一张图重新摆"
for (const item of [...editor.layers]) store.removeLayer(item.id);
editor.presets.length = 0;
await sleep(500);
check('清空头像后底图还在',
  editor.layers.length === 0 && editor.baseImageId === baseIdBefore,
  'layers=' + editor.layers.length + ' base=' + editor.baseImageId);

// 3. 把那段文本当成外部文件导入
await store.importPresets(new File([fileText], 'blockface-presets.json', { type: 'application/json' }));
await sleep(600);
check('导入后拿到 1 个预设', editor.presets.length === 1, 'presets=' + editor.presets.length);
const preset = editor.presets[0];
check('预设名字与头像数量跟着文件过来',
  !!preset && preset.name === saved.name && preset.layers.length === 2,
  preset ? preset.name + ' · ' + preset.layers.length + ' 个头像' : 'null');

// 4. 套用：两个头像应该回到原来的位置，底图不受影响
await store.applyPreset(preset.id);
await sleep(1200);
check('套用后两个头像都回来了', editor.layers.length === 2, 'layers=' + editor.layers.length);
check('底图自始至终没被动过', editor.baseImageId === baseIdBefore && editor.document.width === 400 && editor.document.height === 260,
  'base=' + editor.baseImageId + '(' + baseIdBefore + ') ' + editor.document.width + '×' + editor.document.height);
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
check('导入的头像真的画到了画布上（与离屏画布同点同色）',
  drawn[3] === 255 && drawn[0] === headPixel[0] && drawn[1] === headPixel[1] && drawn[2] === headPixel[2],
  '屏幕=' + JSON.stringify(drawn) + ' 离屏=' + JSON.stringify(headPixel));

const basePixel = Array.from(docCanvas.getContext('2d').getImageData(
  Math.round(6 * viewScale * dpr), Math.round(6 * viewScale * dpr), 1, 1).data);
check('底图也一直画着（左上角是底图的黄色块）',
  Math.abs(basePixel[0] - 233) <= 2 && Math.abs(basePixel[1] - 196) <= 2 && Math.abs(basePixel[2] - 106) <= 2,
  '左上角=' + JSON.stringify(basePixel) + ' 期望≈[233,196,106]');

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

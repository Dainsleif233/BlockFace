/**
 * BlockFace 端到端冒烟测试：在真实浏览器里操作真实组件，并读取真实 canvas 像素。
 * 用法：node tools/cdp.mjs --url http://localhost:5178/ --expr-file tools/e2e.js --json
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
const countDiff = (a, b) => {
  const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
  const db = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
  let n = 0, max = 0;
  for (let i = 0; i < da.length; i += 4) {
    let d = 0;
    for (let k = 0; k < 4; k += 1) d = Math.max(d, Math.abs(da[i + k] - db[i + k]));
    if (d > 0) n += 1;
    if (d > max) max = d;
  }
  return { pixels: n, maxChannel: max };
};

await sleep(600);
const store = window.__blockface;
if (!store) return { fatal: 'window.__blockface 未挂载（是否在 dev 模式？）' };
const { editor } = store;
const { renderHeadCanvas: renderHeadCanvasRef } = await import('/src/core/render/head.ts');

// ============ 1. 内置皮肤 ============
check('内置皮肤预加载 2 张', editor.skins.length === 2, editor.skins.map((s) => s.meta.label).join(' / '));
check('Steve 识别为 64×64 标准', editor.skins[0] && editor.skins[0].meta.label === '64×64 · 标准', editor.skins[0] && editor.skins[0].meta.label);
check('内置皮肤不污染画布', editor.skins.every((s) => s.tainted === false), editor.skins.map((s) => s.tainted).join(','));

// 一开始没有任何历史，撤销/重做必须都是灰的（这里也顺带盯住按钮真的挂在工具栏上）
const undoBtn0 = document.querySelector('button[aria-label="撤销"]');
const redoBtn0 = document.querySelector('button[aria-label="重做"]');
check('工具栏撤销/重做按钮都在', !!undoBtn0 && !!redoBtn0, (undoBtn0 ? 'undo' : '缺 undo') + ' / ' + (redoBtn0 ? 'redo' : '缺 redo'));
check('没有历史时两个按钮都是灰的', !!undoBtn0 && !!redoBtn0 && undoBtn0.disabled === true && redoBtn0.disabled === true,
  'undo=' + (undoBtn0 && undoBtn0.disabled) + ' redo=' + (redoBtn0 && redoBtn0.disabled));

// ============ 2. 新建图层 ============
document.querySelector('.rail--l .bf-card').dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(700);
check('点 Steve 卡片生成 1 个图层', editor.layers.length === 1, 'layers=' + editor.layers.length);
check('图层使用内置 Steve 皮肤', editor.layers[0] && editor.layers[0].skinId === 'builtin-steve', editor.layers[0] && editor.layers[0].skinId);
check('默认不叠帽子层（官方 Steve 这层是灰头盔）', editor.layers[0] && editor.layers[0].overlay === false, 'overlay=' + (editor.layers[0] && editor.layers[0].overlay));

// 选中状态下点别的皮肤是"换皮"，"新增头像"必须真的再加一个
const keepSkin = editor.layers[0].skinId;
store.addAvatar();
await sleep(500);
check('「新增头像」在选中状态下也能加图层', editor.layers.length === 2, 'layers=' + editor.layers.length);
check('新增的头像沿用当前皮肤', editor.layers[1] && editor.layers[1].skinId === keepSkin, editor.layers[1] && editor.layers[1].skinId);
store.removeLayer(editor.layers[1].id);
await sleep(400);
check('删掉多余图层后回到 1 个', editor.layers.length === 1, 'layers=' + editor.layers.length);

const docCanvas = document.querySelector('.artboard__doc');
const ctx = docCanvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const layer = editor.layers[0];
const stageRect = document.querySelector('.artboard').getBoundingClientRect();
// artboard 有 1px 边框，且 getBoundingClientRect 含边框，减掉才等于真正的绘制缩放
const viewScale = (stageRect.width - 2) / editor.document.width;
/** 按"头像包围盒比例"取样：bbox(0,0) 是头像左上角，(0.5,0.5) 是中心 */
const sampleBbox = (bx, by) => {
  const x = Math.max(0, Math.round((layer.x + (bx - 0.5) * layer.size) * viewScale * dpr));
  const y = Math.max(0, Math.round((layer.y + (by - 0.5) * layer.size) * viewScale * dpr));
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
};
// 平面渲染 = 把皮肤正面 8×8 原样放大，所以画布上的像素必须等于贴图上的对应像素。
// 这里不写死颜色，而是从真实贴图里读出来对比 —— 换皮肤也依然成立。
const steve = store.getSkin('builtin-steve');
const sheetCanvas = document.createElement('canvas');
sheetCanvas.width = 64; sheetCanvas.height = 64;
const sheetCtx = sheetCanvas.getContext('2d');
sheetCtx.drawImage(steve.image, 0, 0);
const sheetData = sheetCtx.getImageData(0, 0, 64, 64).data;
const skinAt = (sx, sy) => [sheetData[(sy * 64 + sx) * 4], sheetData[(sy * 64 + sx) * 4 + 1], sheetData[(sy * 64 + sx) * 4 + 2], sheetData[(sy * 64 + sx) * 4 + 3]];

// 64 倍整数放大时每个皮肤像素正好对应 8×8 画布像素，取样点没有歧义，
// 于是可以逐个像素地把"贴图 → 头像"的对应关系和合成公式全部核对一遍。
const head64 = (skin, overlay) => renderHeadCanvasRef(skin, { overlay, pixelSize: 64 });
const headPixel = (canvas, x, y) => Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data);
const noHat = head64(steve, false);
const withHat = head64(steve, true);
let uvBad = 0;
let blendBad = 0;
let blendMax = 0;
for (let y = 0; y < 8; y += 1) {
  for (let x = 0; x < 8; x += 1) {
    const got = headPixel(noHat, x * 8 + 4, y * 8 + 4);
    const base = skinAt(8 + x, 8 + y);
    if (got[0] !== base[0] || got[1] !== base[1] || got[2] !== base[2]) uvBad += 1;
    const hat = skinAt(40 + x, 8 + y);
    const alpha = hat[3] / 255;
    const blended = headPixel(withHat, x * 8 + 4, y * 8 + 4);
    for (let k = 0; k < 3; k += 1) {
      const diff = Math.abs(Math.round(hat[k] * alpha + base[k] * (1 - alpha)) - blended[k]);
      if (diff > blendMax) blendMax = diff;
      if (diff > 0) blendBad += 1;
    }
  }
}
check('正面 64 个像素逐一等于贴图对应像素', uvBad === 0, '不一致=' + uvBad + '/64');
check('帽子层按 source-over 合成（192 通道逐一核对）', blendBad === 0, '最大通道差=' + blendMax);
check('画布上真的画出了头像', sampleBbox(0.5, 0.5)[3] === 255, JSON.stringify(sampleBbox(0.5, 0.5)));

// ============ 3. 指针拖拽移动 ============
const wrap = document.querySelector('.stage__body');
const pointer = (type, cx, cy) => new PointerEvent(type, {
  pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true,
  clientX: cx, clientY: cy, buttons: type === 'pointerup' ? 0 : 1,
});
const startX = stageRect.left + layer.x * viewScale;
const startY = stageRect.top + layer.y * viewScale;
const moveBefore = { x: layer.x, y: layer.y };
wrap.dispatchEvent(pointer('pointerdown', startX, startY));
wrap.dispatchEvent(pointer('pointermove', startX + 80, startY + 50));
wrap.dispatchEvent(pointer('pointerup', startX + 80, startY + 50));
await sleep(250);
const expectDx = 80 / viewScale;
const expectDy = 50 / viewScale;
check('拖拽位移 = 屏幕位移 ÷ 缩放', Math.abs(layer.x - moveBefore.x - expectDx) <= 3 && Math.abs(layer.y - moveBefore.y - expectDy) <= 3,
  'delta=(' + (layer.x - moveBefore.x) + ',' + (layer.y - moveBefore.y) + ') 期望=(' + Math.round(expectDx) + ',' + Math.round(expectDy) + ')');

// ============ 4. 拖角手柄缩放 ============
const cornerX = stageRect.left + (layer.x + layer.size / 2) * viewScale;
const cornerY = stageRect.top + (layer.y + layer.size / 2) * viewScale;
const sizeBefore = layer.size;
wrap.dispatchEvent(pointer('pointerdown', cornerX, cornerY));
wrap.dispatchEvent(pointer('pointermove', cornerX + 60, cornerY + 60));
wrap.dispatchEvent(pointer('pointerup', cornerX + 60, cornerY + 60));
await sleep(250);
check('拖右下角手柄放大图层', layer.size > sizeBefore + 40, sizeBefore + ' → ' + layer.size);

// ============ 5. 帽子层开关 ============
// 官方 Steve 的帽子层正面是全透明的（灰只出现在顶面，平面渲染看不到），
// Alex 的帽子层正面是头发（不透明）。两个断言分别记录这两个数据事实。
const alex = store.getSkin('builtin-alex');
const head128 = (skin, overlay) => renderHeadCanvasRef(skin, { overlay, pixelSize: 128 });
const steveHat = countDiff(head128(steve, true), head128(steve, false));
const alexHat = countDiff(head128(alex, true), head128(alex, false));
// 两个内置皮肤的数据事实刚好相反，都记下来：Steve 的第二层是灰头盔，Alex 的第二层是空的。
check('Steve 的帽子层盖住约三分之一（官方灰头盔）', steveHat.pixels === 5632, '差异像素=' + steveHat.pixels + '/16384');
check('Alex 的帽子层正面全透明', alexHat.pixels === 0, '差异像素=' + alexHat.pixels);

// 端到端：开关真的改变画布上额头那一格的颜色
store.updateLayer(layer.id, { overlay: true });
await sleep(300);
const hatOn = sampleBbox(0.5, 0.07);
check('打开帽子层后额头变成官方灰', Math.abs(hatOn[0] - hatOn[1]) < 12 && Math.abs(hatOn[1] - hatOn[2]) < 12 && hatOn[0] < 170, JSON.stringify(hatOn));
store.updateLayer(layer.id, { overlay: false });
await sleep(300);
const hatOff = sampleBbox(0.5, 0.07);
check('关掉帽子层后额头恢复暖色皮肤/头发', hatOff[0] > hatOff[2] + 20, JSON.stringify(hatOff));

// ============ 6. 撤销 / 重做 ============
// 先盯按钮：canUndo/canRedo 曾经依赖非响应式数组，算出来的值永远停在 false，
// 结果工具栏的撤销按钮一直是灰的，只有直接调 store.undo() 才动得了。
const undoBtn = undoBtn0;
const redoBtn = redoBtn0;

// 注意：撤销会整体换掉图层对象，必须每次从 store 重新读，不能持有旧引用
store.updateLayer(layer.id, { rotation: 33 });
await sleep(150);
check('属性修改已生效', editor.layers[0].rotation === 33, 'rotation=' + editor.layers[0].rotation);
check('改动之后撤销按钮亮起来', !!undoBtn && undoBtn.disabled === false, 'disabled=' + (undoBtn && undoBtn.disabled));
check('此时重做按钮仍是灰的', !!redoBtn && redoBtn.disabled === true, 'disabled=' + (redoBtn && redoBtn.disabled));

// 走真实用户路径：点按钮，而不是直接调 store
undoBtn.click();
await sleep(250);
check('点撤销按钮真的撤销了', editor.layers[0].rotation !== 33, 'rotation=' + editor.layers[0].rotation);
check('撤销之后重做按钮亮起来', !!redoBtn && redoBtn.disabled === false, 'disabled=' + (redoBtn && redoBtn.disabled));
redoBtn.click();
await sleep(250);
check('点重做按钮真的重做了', editor.layers[0].rotation === 33, 'rotation=' + editor.layers[0].rotation);
store.undo();
await sleep(200);
check('撤销回退该次修改', editor.layers[0].rotation !== 33, 'rotation=' + editor.layers[0].rotation);
store.redo();
await sleep(200);
check('重做恢复该次修改', editor.layers[0].rotation === 33, 'rotation=' + editor.layers[0].rotation);
store.undo();
await sleep(200);

// ============ 7. 三种皮肤来源 ============
// 渲染函数已在上方导入为 renderHeadCanvasRef

// 7a 上传：造一张 256 高清皮肤丢进 useSkinFile
const hdCanvas = document.createElement('canvas');
hdCanvas.width = 256; hdCanvas.height = 256;
const hdCtx = hdCanvas.getContext('2d');
hdCtx.fillStyle = '#ff00ff';
hdCtx.fillRect(8 * 4, 8 * 4, 8 * 4, 8 * 4);
const hdBlob = await new Promise((r) => hdCanvas.toBlob(r, 'image/png'));
const before = editor.skins.length;
await store.useSkinFile(new File([hdBlob], 'hd-skin.png', { type: 'image/png' }));
await sleep(400);
const hdRecord = editor.skins[editor.skins.length - 1];
check('上传高清皮肤已登记', editor.skins.length === before + 1, 'skins=' + editor.skins.length);
check('上传皮肤识别为 256×256 高清', hdRecord && /^256×256 · 高清/.test(hdRecord.meta.label), hdRecord && hdRecord.meta.label);
check('上传皮肤成为当前皮肤', editor.activeSkinId === hdRecord.id, editor.activeSkinId);
const hdHead = renderHeadCanvasRef(store.getSkin(hdRecord.id), { overlay: false, pixelSize: 128 });
check('HD 256 皮肤渲染出正确颜色',
  Array.from(hdHead.getContext('2d').getImageData(64, 64, 1, 1).data).join(',') === '255,0,255,255',
  Array.from(hdHead.getContext('2d').getImageData(64, 64, 1, 1).data).join(','));

// 7a-2 512×512 超高清：同一套 UV 折算（scale = 8），必须落在同一张脸上
const bigCanvas = document.createElement('canvas');
bigCanvas.width = 512; bigCanvas.height = 512;
const bigCtx = bigCanvas.getContext('2d');
bigCtx.fillStyle = '#00c8ff';
bigCtx.fillRect(8 * 8, 8 * 8, 8 * 8, 8 * 8); // 正面区域 (8,8,8,8) × scale 8
const bigBlob = await new Promise((r) => bigCanvas.toBlob(r, 'image/png'));
await store.useSkinFile(new File([bigBlob], 'hd512-skin.png', { type: 'image/png' }));
await sleep(400);
const bigRecord = editor.skins[editor.skins.length - 1];
check('上传 512 皮肤识别为高分档', bigRecord && /^512×512 · 高清 ×8/.test(bigRecord.meta.label), bigRecord && bigRecord.meta.label);
const bigHead = renderHeadCanvasRef(store.getSkin(bigRecord.id), { overlay: false, pixelSize: 128 });
const bigPixel = Array.from(bigHead.getContext('2d').getImageData(64, 64, 1, 1).data).join(',');
check('HD 512 与 HD 256 落在同一张脸上', bigPixel === '0,200,255,255', bigPixel);

// 7b 皮肤 URL：真实网络取一张正版皮肤
let urlOk = false;
let urlDetail = '';
try {
  const urlBefore = editor.skins.length;
  await store.useSkinUrl('https://crafatar.com/skins/8667ba71b85a4004af54457a9734eed7');
  await sleep(600);
  urlOk = editor.skins.length === urlBefore + 1;
  urlDetail = urlOk ? editor.skins[editor.skins.length - 1].meta.label : 'skins=' + editor.skins.length;
} catch (e) { urlDetail = String(e && e.message ? e.message : e); }
check('皮肤 URL 入口可用', urlOk, urlDetail);

// 7c 正版账号 ID：走 playerdb
let accOk = false;
let accDetail = '';
try {
  const accBefore = editor.skins.length;
  await store.useAccountSkin('Notch');
  await sleep(800);
  accOk = editor.skins.length === accBefore + 1;
  accDetail = accOk ? editor.skins[editor.skins.length - 1].sourceLabel + ' / ' + editor.skins[editor.skins.length - 1].meta.label : 'skins=' + editor.skins.length;
} catch (e) { accDetail = String(e && e.message ? e.message : e); }
check('正版账号 ID 入口可用', accOk, accDetail);

// ============ 8. 与独立实现逐像素交叉验证 ============
// crafatar 的 /avatars 是别人用另一套代码渲染的平面头像（含帽子层合成），
// 尺寸与正脸区域都和我们一致，因此可以直接逐像素对拍。
const fetchAvatar = async (withOverlay) => {
  const url = 'https://crafatar.com/avatars/8667ba71b85a4004af54457a9734eed7?size=128'
    + (withOverlay ? '&overlay' : '') + '&_=' + Date.now();
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  try {
    await img.decode();
  } catch {
    await sleep(1200);
    const retry = new Image();
    retry.crossOrigin = 'anonymous';
    retry.src = url + 'r';
    await retry.decode();
    img.src = retry.src;
    await img.decode();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.drawImage(img, 0, 0, 128, 128);
  return canvas;
};

try {
  for (const withOverlay of [true, false]) {
    const refCanvas = await fetchAvatar(withOverlay);
    const ours = renderHeadCanvasRef(steve, { overlay: withOverlay, pixelSize: 128 });
    const diff = countDiff(refCanvas, ours);
    const total = 128 * 128;
    check(
      '与 crafatar 独立实现逐像素一致（' + (withOverlay ? '含帽子层' : '不含帽子层') + '）',
      diff.pixels === 0,
      '差异像素=' + diff.pixels + '/' + total + ' 最大通道差=' + diff.maxChannel,
    );
  }
} catch (e) {
  check('与 crafatar 独立实现交叉验证', false, '未能取得参考图：' + String(e && e.message ? e.message : e));
}

// ============ 8b. 头像预设 ============
const { serializePresetFile, parsePresetFile } = await import('/src/core/model/preset.ts');
store.selectLayer(editor.layers[0].id);
await sleep(200);

const presetsBefore = editor.presets.length;
store.savePresetFromSelection();
await sleep(300);
check('保存当前头像为预设', editor.presets.length === presetsBefore + 1, 'presets=' + editor.presets.length);

const saved = editor.presets[0];
check('预设内嵌了皮肤位图', !!saved.skin && /^data:image\/png;base64,/.test(saved.skin.dataUrl),
  saved.skin ? saved.skin.dataUrl.slice(0, 24) + '… 共 ' + saved.skin.dataUrl.length + ' 字符' : 'null');
check('预设带上了尺寸与帽子层状态', saved.size > 0 && saved.overlay === false, 'size=' + saved.size + ' overlay=' + saved.overlay);

const stored = localStorage.getItem('blockface.presets.v1');
let storedCount = -1;
try { storedCount = JSON.parse(stored).length; } catch { storedCount = -1; }
check('预设已写入 localStorage', storedCount === editor.presets.length, '条目=' + storedCount);

const json = serializePresetFile(editor.presets);
check('导出的 JSON 能被解析回同样数量', parsePresetFile(json).length === editor.presets.length, json.length + ' 字符');

await store.importPresets(new File([json], 'presets.json', { type: 'application/json' }));
await sleep(400);
check('导入后预设数量翻倍', editor.presets.length === (presetsBefore + 1) * 2, 'presets=' + editor.presets.length);
check('导入不与已有预设重名', new Set(editor.presets.map((p) => p.name)).size === editor.presets.length,
  editor.presets.map((p) => p.name).join(' / '));

const layersBefore = editor.layers.length;
const target = editor.presets[0];
await store.applyPreset(target.id);
await sleep(700);
const applied = editor.layers[editor.layers.length - 1];
check('套用预设新增了一个图层', editor.layers.length === layersBefore + 1, 'layers=' + editor.layers.length);
check('套用预设还原了尺寸与帽子层', !!applied && Math.abs(applied.size - target.size) <= 1 && applied.overlay === target.overlay,
  applied ? 'size=' + applied.size + '(' + target.size + ') overlay=' + applied.overlay : 'null');
check('套用预设登记了来源为 preset 的新皮肤',
  editor.skins.some((s) => s.origin === 'preset' && s.sourceLabel === target.name),
  editor.skins.map((s) => s.origin).join(','));

const beforeRemove = editor.presets.length;
store.removePreset(target.id);
await sleep(200);
check('删除预设', editor.presets.length === beforeRemove - 1, beforeRemove + ' → ' + editor.presets.length);

await store.importPresets(new File(['not json at all'], 'bad.json', { type: 'application/json' }));
await sleep(300);
check('垃圾文件被拒绝且不影响已有预设',
  editor.presets.length === beforeRemove - 1 && editor.notice && editor.notice.tone === 'error',
  (editor.notice && editor.notice.message) + ' / presets=' + editor.presets.length);

localStorage.removeItem('blockface.presets.v1');

// ============ 9. 导出管线 ============
const { composeDocument } = await import('/src/core/render/compose.ts');
const { canvasToBlob } = await import('/src/core/render/exportImage.ts');
const out = document.createElement('canvas');
composeDocument(out, {
  width: editor.document.width, height: editor.document.height, scale: 2,
  items: editor.layers.map((l) => ({ layer: l, skin: store.getSkin(l.skinId) })).filter((i) => i.skin),
});
check('导出画布 = 文档尺寸 × 2', out.width === editor.document.width * 2 && out.height === editor.document.height * 2,
  out.width + '×' + out.height);
let blobSize = 0;
try { blobSize = (await canvasToBlob(out)).size; } catch (e) { blobSize = -1; }
check('导出 PNG 成功且非空', blobSize > 1000, blobSize + ' bytes');

// 导出的颜色也不能被背景混掉：单独合成一个图层，取正脸第 10 列像素的中心（0.3125 = (10.5-8)/8，
// 离像素边界足够远，整数倍取样不会骑墙），再和离屏头像同一点比。
const soloLayer = editor.layers[0];
const soloSkin = store.getSkin(soloLayer.skinId);
const solo = document.createElement('canvas');
composeDocument(solo, {
  width: editor.document.width, height: editor.document.height, scale: 2,
  items: [{ layer: soloLayer, skin: soloSkin }],
});
const rel = 0.3125;
const soloHead = renderHeadCanvasRef(soloSkin, { overlay: soloLayer.overlay, pixelSize: Math.round(soloLayer.size * 2) });
const soloPixel = Array.from(solo.getContext('2d').getImageData(
  Math.round((soloLayer.x - soloLayer.size / 2 + soloLayer.size * rel) * 2),
  Math.round((soloLayer.y - soloLayer.size / 2 + soloLayer.size * rel) * 2), 1, 1).data);
const soloHeadPixel = Array.from(soloHead.getContext('2d').getImageData(
  Math.round(soloHead.width * rel), Math.round(soloHead.height * rel), 1, 1).data);
check('导出画布的像素 = 离屏头像同点像素（颜色没被底纹混掉）',
  soloPixel[3] === 255 && soloPixel[0] === soloHeadPixel[0] && soloPixel[1] === soloHeadPixel[1] && soloPixel[2] === soloHeadPixel[2],
  '导出=' + JSON.stringify(soloPixel) + ' 离屏=' + JSON.stringify(soloHeadPixel));

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

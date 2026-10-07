/**
 * BlockFace 端到端冒烟测试：在真实浏览器里操作真实组件，并读取真实 canvas 像素。
 * 用法：node tools/cdp.mjs --url http://localhost:5178/ --expr-file tools/e2e.js --json
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
// 依赖外网的用例：对方超时/限流时记"跳过"而不是"失败"，否则网络一抖就分不清是自己坏了还是没网。
// 但只有真的没拿到数据才跳过；拿到了数据却没生效依然是失败。
const skip = (name, detail) => results.push({ name, pass: true, skipped: true, detail: detail === undefined ? '' : String(detail) });
// 外网说挂就挂，用例不能被一个连不上的域卡住跑不完：所有联网步骤都套一层超时。
const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' 超过 ' + ms + 'ms 没响应')), ms)),
]);
const looksLikeNetwork = (text) => /失败|超时|超过|网络|没响应|timeout|fetch|Failed|decode/i.test(String(text || ''));
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
check('默认叠上帽子层（正版渲染结果）', editor.layers[0] && editor.layers[0].overlay === true, 'overlay=' + (editor.layers[0] && editor.layers[0].overlay));

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
// 两个内置皮肤的第二层数据事实刚好相反，都量下来当作回归基线：
// Steve 的第二层正面是一圈不透明灰（平铺直出会盖住额头两行与两鬓），Alex 的正面是全透明。
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
  await withTimeout(store.useSkinUrl('https://crafatar.com/skins/8667ba71b85a4004af54457a9734eed7'), 15000, '皮肤 URL');
  await sleep(600);
  urlOk = editor.skins.length === urlBefore + 1;
  urlDetail = urlOk ? editor.skins[editor.skins.length - 1].meta.label : 'skins=' + editor.skins.length;
} catch (e) { urlDetail = String(e && e.message ? e.message : e); }
// 只有"取图这一步就没成功"才按网络问题跳过；拿到了图却没进列表，那是真 bug。
const netNotice = (editor.notice && editor.notice.tone === 'error' && looksLikeNetwork(editor.notice.message)) || looksLikeNetwork(urlDetail);
if (urlOk) check('皮肤 URL 入口可用', true, urlDetail);
else if (netNotice) skip('皮肤 URL 入口可用', '取不到图，按网络问题跳过：' + urlDetail + (editor.notice ? ' / ' + editor.notice.message : ''));
else check('皮肤 URL 入口可用', false, urlDetail);

// 7c 正版账号 ID：走 playerdb
let accOk = false;
let accDetail = '';
try {
  const accBefore = editor.skins.length;
  await withTimeout(store.useAccountSkin('Notch'), 15000, '正版账号');
  await sleep(800);
  accOk = editor.skins.length === accBefore + 1;
  accDetail = accOk ? editor.skins[editor.skins.length - 1].sourceLabel + ' / ' + editor.skins[editor.skins.length - 1].meta.label : 'skins=' + editor.skins.length;
} catch (e) { accDetail = String(e && e.message ? e.message : e); }
const accNotice = (editor.notice && editor.notice.tone === 'error' && looksLikeNetwork(editor.notice.message)) || looksLikeNetwork(accDetail);
if (accOk) check('正版账号 ID 入口可用', true, accDetail);
else if (accNotice) skip('正版账号 ID 入口可用', '取不到图，按网络问题跳过：' + accDetail + (editor.notice ? ' / ' + editor.notice.message : ''));
else check('正版账号 ID 入口可用', false, accDetail);

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
    await withTimeout(img.decode(), 12000, '参考头像');
  } catch {
    await sleep(800);
    const retry = new Image();
    retry.crossOrigin = 'anonymous';
    retry.src = url + 'r';
    await withTimeout(retry.decode(), 12000, '参考头像重试');
    img.src = retry.src;
    await withTimeout(img.decode(), 12000, '参考头像重新解码');
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
  // 参考图在别人服务器上，拿不到就是没验，不该报成"我们的渲染坏了"。
  // 报 FAIL 会让网络一抖就红一片；报 SKIP 并把原因写清楚，跳过数就是这次没覆盖到的部分。
  const message = String(e && e.message ? e.message : e);
  const compared = results.filter((r) => r.name.indexOf('与 crafatar 独立实现逐像素一致') === 0 && r.pass).length;
  if (looksLikeNetwork(message)) {
    skip('与 crafatar 独立实现交叉验证', '这次没和外部实现对拍（已成功 ' + compared + '/2 种变体）：' + message);
  } else {
    check('与 crafatar 独立实现交叉验证', false, '未能取得参考图：' + message);
  }
}

// ============ 8b. 预设 = 整张图片模板 ============
const { serializePresetFile, parsePresetFile } = await import('/src/core/model/preset.ts');

// 从干净画布开始，后面每个数字都能硬写
store.clearBaseImage();
for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(300);

// 造一张真底图并走真实的上传路径（含底图 data URI 的留存）
const baseCanvas = document.createElement('canvas');
baseCanvas.width = 320;
baseCanvas.height = 200;
const baseCtx = baseCanvas.getContext('2d');
baseCtx.fillStyle = '#3b6ea5';
baseCtx.fillRect(0, 0, 320, 200);
baseCtx.fillStyle = '#d9a441';
baseCtx.fillRect(0, 0, 40, 40);
const baseBlob = await new Promise((resolve) => baseCanvas.toBlob(resolve, 'image/png'));
await store.setBaseImage(new File([baseBlob], '我的底图.png', { type: 'image/png' }));
await sleep(700);
check('载入底图后画布尺寸跟着变', editor.document.width === 320 && editor.document.height === 200,
  editor.document.width + '×' + editor.document.height);

store.addAvatar();
await sleep(250);
await store.useBuiltinSkin('alex');
await sleep(700);
store.addAvatar();
await sleep(250);
const layerA = editor.layers[0];
const layerB = editor.layers[1];
store.updateLayer(layerA.id, { x: 90, y: 100, size: 120, rotation: 15, opacity: 0.8, overlay: false });
store.updateLayer(layerB.id, { x: 230, y: 60, size: 80, rotation: -20, opacity: 1, overlay: true });
await sleep(400);
check('准备好一张底图加两个头像', editor.layers.length === 2, 'layers=' + editor.layers.length);

const presetsBefore = editor.presets.length;
store.saveCurrentAsPreset();
await sleep(400);
check('把整张图存为预设', editor.presets.length === presetsBefore + 1, 'presets=' + editor.presets.length);

const saved = editor.presets[0];
check('预设只装头像，不含底图与画布尺寸',
  !('base' in saved) && !('width' in saved) && !('height' in saved),
  Object.keys(saved).sort().join(','));
check('预设记下了这张图上的全部头像',
  saved.layers.length === 2 && saved.layers[0].size === 120 && saved.layers[1].size === 80,
  saved.layers.length + ' 个头像 · ' + JSON.stringify(saved.layers.map((l) => ({ x: l.x, size: l.size }))));
check('预设逐层记下了变换与内嵌皮肤',
  saved.layers[0].size === 120 && saved.layers[0].rotation === 15 && Math.abs(saved.layers[0].opacity - 0.8) < 1e-6
    && saved.layers[0].overlay === false && !!saved.layers[0].skin && !!saved.layers[1].skin,
  JSON.stringify({ size: saved.layers[0].size, rot: saved.layers[0].rotation, overlay: saved.layers[0].overlay, skin: !!saved.layers[0].skin }));

const stored = localStorage.getItem('blockface.presets.v3');
let storedCount = -1;
try { storedCount = JSON.parse(stored).length; } catch { storedCount = -1; }
check('预设已写入 localStorage', storedCount === editor.presets.length, '条目=' + storedCount);

const json = serializePresetFile(editor.presets);
const reparsed = parsePresetFile(json);
check('导出的 JSON 能被解析回同样内容',
  reparsed.length === editor.presets.length && reparsed[0].layers.length === 2 && !!reparsed[0].layers[0].skin,
  json.length + ' 字符');

// 导入是"合并"而不是"追加"：同一份文件导多少次都不该越堆越多
const countBeforeImport = editor.presets.length;
await store.importPresets(new File([json], 'presets.json', { type: 'application/json' }));
await sleep(500);
check('同一份文件导入不会重复添加',
  editor.presets.length === countBeforeImport && countBeforeImport === presetsBefore + 1,
  countBeforeImport + ' → ' + editor.presets.length + ' / ' + (editor.notice ? editor.notice.message : ''));
check('重复导入会明确说是跳过的',
  !!editor.notice && /跳过/.test(editor.notice.message),
  editor.notice ? editor.notice.message : 'null');

// 套用 = 用预设里的这组头像替换画布上的头像；底图与画布尺寸一概不动
const baseIdBefore = editor.baseImageId;
const docBefore = editor.document.width + '×' + editor.document.height;
for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(400);
check('删掉全部头像后底图还在、尺寸没变',
  editor.layers.length === 0 && editor.baseImageId === baseIdBefore && editor.document.width + '×' + editor.document.height === docBefore,
  'layers=' + editor.layers.length + ' base=' + editor.baseImageId + ' ' + editor.document.width + '×' + editor.document.height);

const target = editor.presets[0];
await store.applyPreset(target.id);
await sleep(1100);
check('套用预设没有动底图，也没动画布尺寸',
  editor.baseImageId === baseIdBefore && editor.document.width + '×' + editor.document.height === docBefore,
  'base=' + editor.baseImageId + '(' + baseIdBefore + ') ' + editor.document.width + '×' + editor.document.height);
check('套用预设把这一组头像放回来了', editor.layers.length === 2, 'layers=' + editor.layers.length);
const restored = editor.layers[0];
check('套用预设逐层还原了变换',
  restored.size === 120 && restored.rotation === 15 && Math.abs(restored.opacity - 0.8) < 1e-6 && restored.overlay === false,
  JSON.stringify({ size: restored.size, rot: restored.rotation, opacity: restored.opacity, overlay: restored.overlay }));
check('套用预设登记了来源为 preset 的皮肤',
  editor.skins.filter((s) => s.origin === 'preset' && s.sourceLabel === target.name).length === 2,
  editor.skins.map((s) => s.origin).join(','));

// 画布上真的画了底图：左上角 40×40 那块是 #d9a441
const tplDoc = document.querySelector('.artboard__doc');
const tplRect = document.querySelector('.artboard').getBoundingClientRect();
const tplScale = (tplRect.width - 2) / editor.document.width;
const tplDpr = Math.min(window.devicePixelRatio || 1, 2);
const readTplDoc = (x, y) => Array.from(tplDoc.getContext('2d').getImageData(Math.round(x * tplScale * tplDpr), Math.round(y * tplScale * tplDpr), 1, 1).data);
const corner = readTplDoc(6, 6);
check('底图始终还在画布上（预设没把它顶掉）',
  Math.abs(corner[0] - 217) <= 2 && Math.abs(corner[1] - 164) <= 2 && Math.abs(corner[2] - 65) <= 2,
  '左上角=' + JSON.stringify(corner) + ' 期望≈[217,164,65]');

const avatarPixel = readTplDoc(90, 100);
check('头像也画在原来的位置上', avatarPixel[3] === 255 && !(avatarPixel[0] === 217 && avatarPixel[1] === 164 && avatarPixel[2] === 65),
  '头像中心=' + JSON.stringify(avatarPixel));

store.undo();
await sleep(500);
check('套用预设是一次可撤销的替换',
  editor.layers.length === 0 && editor.baseImageId === baseIdBefore,
  'layers=' + editor.layers.length + ' base=' + editor.baseImageId);
store.redo();
await sleep(900);
check('重做又能把这一组头像放回来', editor.layers.length === 2 && editor.baseImageId === baseIdBefore,
  'layers=' + editor.layers.length + ' base=' + editor.baseImageId);

// 同 id 但内容变了 → 就地更新，仍然不新增
const mutated = JSON.parse(json);
mutated.presets[0].layers[0].size = 999;
await store.importPresets(new File([JSON.stringify(mutated)], 'mutated.json', { type: 'application/json' }));
await sleep(500);
check('同 id 内容变了就地更新，而不是新增一条',
  editor.presets.length === countBeforeImport && editor.presets[0].layers[0].size === 999,
  'presets=' + editor.presets.length + ' size=' + editor.presets[0].layers[0].size);

// 改名：预设是给人认的。先再存一个，才验得了"撞名自动加序号"
store.saveCurrentAsPreset();
await sleep(400);
check('再存一个预设（用于改名与撞名测试）',
  editor.presets.length === countBeforeImport + 1,
  'presets=' + editor.presets.length);

const nameBefore = editor.presets[0].name;
store.renamePreset(editor.presets[0].id, '  我的常用摆法  ');
await sleep(200);
check('预设能改名，首尾空格会被去掉',
  editor.presets[0].name === '我的常用摆法',
  nameBefore + ' → ' + editor.presets[0].name);
store.renamePreset(editor.presets[0].id, editor.presets[1].name);
await sleep(200);
check('改名撞上已有名字时自动加序号',
  editor.presets[0].name !== editor.presets[1].name,
  editor.presets.map((p) => p.name).join(' / '));

const beforeRemove = editor.presets.length;
store.removePreset(target.id);
await sleep(200);
check('删除预设', editor.presets.length === beforeRemove - 1, beforeRemove + ' → ' + editor.presets.length);

await store.importPresets(new File(['not json at all'], 'bad.json', { type: 'application/json' }));
await sleep(300);
check('垃圾文件被拒绝且不影响已有预设',
  editor.presets.length === beforeRemove - 1 && editor.notice && editor.notice.tone === 'error',
  (editor.notice && editor.notice.message) + ' / presets=' + editor.presets.length);

localStorage.removeItem('blockface.presets.v3');

// 本节故意用了 0.8 不透明度与旋转来验证还原；后面的导出用例要求不透明、不旋转的图层，
// 所以这里把这两项恢复成默认值，别把状态漏给下一节。
for (const item of editor.layers) store.updateLayer(item.id, { opacity: 1, rotation: 0 });
await sleep(300);

// ============ 9. 导出管线 ============
const { composeDocument } = await import('/src/core/render/compose.ts');
const { canvasToBlob } = await import('/src/core/render/exportImage.ts');
const out = document.createElement('canvas');
composeDocument(out, {
  width: editor.document.width, height: editor.document.height,
  items: editor.layers.map((l) => ({ layer: l, skin: store.getSkin(l.skinId) })).filter((i) => i.skin),
});
check('合成画布 = 文档尺寸（导出固定 1 倍）',
  out.width === editor.document.width && out.height === editor.document.height, out.width + '×' + out.height);
check('倍率选择已经不在界面上，exportScale 也删干净了',
  !document.querySelector('select[aria-label="导出倍率"]') && editor.exportScale === undefined,
  '选择框=' + !!document.querySelector('select[aria-label="导出倍率"]') + ' exportScale=' + editor.exportScale);
let blobSize = 0;
try { blobSize = (await canvasToBlob(out)).size; } catch (e) { blobSize = -1; }
check('导出 PNG 成功且非空', blobSize > 1000, blobSize + ' bytes');

// 导出的颜色也不能被背景混掉：单独合成一个图层，取正脸第 10 列像素的中心（0.3125 = (10.5-8)/8，
// 离像素边界足够远，整数倍取样不会骑墙），再和离屏头像同一点比。
const soloLayer = editor.layers[0];
const soloSkin = store.getSkin(soloLayer.skinId);
const solo = document.createElement('canvas');
composeDocument(solo, {
  width: editor.document.width, height: editor.document.height,
  items: [{ layer: soloLayer, skin: soloSkin }],
});
const rel = 0.3125;
const soloHead = renderHeadCanvasRef(soloSkin, { overlay: soloLayer.overlay, pixelSize: Math.round(soloLayer.size) });
const soloPixel = Array.from(solo.getContext('2d').getImageData(
  Math.round(soloLayer.x - soloLayer.size / 2 + soloLayer.size * rel),
  Math.round(soloLayer.y - soloLayer.size / 2 + soloLayer.size * rel), 1, 1).data);
const soloHeadPixel = Array.from(soloHead.getContext('2d').getImageData(
  Math.round(soloHead.width * rel), Math.round(soloHead.height * rel), 1, 1).data);
check('导出画布的像素 = 离屏头像同点像素（颜色没被底纹混掉）',
  soloPixel[3] === 255 && soloPixel[0] === soloHeadPixel[0] && soloPixel[1] === soloHeadPixel[1] && soloPixel[2] === soloHeadPixel[2],
  '导出=' + JSON.stringify(soloPixel) + ' 离屏=' + JSON.stringify(soloHeadPixel));

// ============ 8c. 图层前后顺序 ============
// 干净的舞台：清空后放两层完全重叠，谁在上面那一格就显示谁。
// 上一节留下的是 320×200 的底图，这里连底图一起清掉，回到默认画布，
// 否则下面按 1280×800 摆的坐标会被夹到画布外，读到的全是透明像素。
store.clearBaseImage();
for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(300);
document.querySelectorAll('.rail--l .bf-card')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(600);
store.addAvatar();
await sleep(250);
await store.useBuiltinSkin('alex');
await sleep(700);
check('准备好两层（Steve 在下、Alex 在上）', editor.layers.length === 2, 'layers=' + editor.layers.length);

const rowsNow = Array.from(document.querySelectorAll('.layers li[data-layer-id]'));
check('列表按上层在前渲染', rowsNow.length === 2 && rowsNow[0].dataset.layerId === editor.layers[1].id,
  rowsNow.map((r) => r.dataset.layerId).join(',') + ' / 数组 ' + editor.layers.map((l) => l.id).join(','));
check('每行都有拖动手柄', document.querySelectorAll('.layers .lay__grip').length === 2,
  '手柄=' + document.querySelectorAll('.layers .lay__grip').length);

for (const item of editor.layers) store.updateLayer(item.id, { x: 400, y: 300, size: 220, rotation: 0, opacity: 1 });
await sleep(500);

const docRect = document.querySelector('.artboard').getBoundingClientRect();
const scaleDoc = (docRect.width - 2) / editor.document.width;
const dprDoc = Math.min(window.devicePixelRatio || 1, 2);
const relPos = 0.3125; // 正脸第 10 列的中心，离像素边界远，取样不会骑墙
const headAt = (item) => renderHeadCanvasRef(store.getSkin(item.skinId), { overlay: item.overlay, pixelSize: Math.round(item.size * scaleDoc * dprDoc) });
const headPixelOf = (item) => {
  const head = headAt(item);
  return Array.from(head.getContext('2d').getImageData(Math.round(head.width * relPos), Math.round(head.height * relPos), 1, 1).data);
};
const docPixelOf = (item) => Array.from(document.querySelector('.artboard__doc').getContext('2d').getImageData(
  Math.round((item.x - item.size / 2 + item.size * relPos) * scaleDoc * dprDoc),
  Math.round((item.y - item.size / 2 + item.size * relPos) * scaleDoc * dprDoc), 1, 1).data);
const samePixel = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

const [steveLayer, alexLayer] = editor.layers;
const stevePixel = headPixelOf(steveLayer);
const alexPixel = headPixelOf(alexLayer);
check('两层皮肤颜色本身不同（不然顺序验不出来）', !samePixel(stevePixel, alexPixel),
  'Steve=' + JSON.stringify(stevePixel) + ' Alex=' + JSON.stringify(alexPixel));
check('重叠处显示的是上层（Alex）', samePixel(docPixelOf(alexLayer), alexPixel), '画布=' + JSON.stringify(docPixelOf(alexLayer)));

store.moveLayerTo(alexLayer.id, 0); // 把 Alex 压到底下
await sleep(400);
check('挪到底层后数组顺序变了', editor.layers[0].id === alexLayer.id, editor.layers.map((l) => l.id).join(','));
check('重叠处改成显示 Steve', samePixel(docPixelOf(steveLayer), stevePixel), '画布=' + JSON.stringify(docPixelOf(steveLayer)));

store.undo();
await sleep(400);
check('撤销一次就回到原来的前后关系', editor.layers[1].id === alexLayer.id && samePixel(docPixelOf(alexLayer), alexPixel),
  editor.layers.map((l) => l.id).join(',') + ' 画布=' + JSON.stringify(docPixelOf(alexLayer)));

// 模拟一次拖动：按住列表第一行往下拖过第二行
const list = document.querySelector('.layers');
// 事件要发在行里面的元素上（真实指针也是打在子元素上），发在 ul 上时 target 就是 ul，
// closest('li') 找不到行，拖动根本不会开始。
const rowEls = Array.from(list.querySelectorAll('li[data-layer-id]'));
const rowBoxes = rowEls.map((r) => r.getBoundingClientRect());
const grabTargets = rowEls.map((r) => r.querySelector('.lay__pick') || r);
const orderBeforeDrag = editor.layers.map((l) => l.id).join(',');
const pointerAt = (type, y) => new PointerEvent(type, {
  bubbles: true, cancelable: true, clientX: rowBoxes[0].left + 30, clientY: y, pointerId: 7, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
});
grabTargets[0].dispatchEvent(pointerAt('pointerdown', rowBoxes[0].top + rowBoxes[0].height / 2));
grabTargets[0].dispatchEvent(pointerAt('pointermove', rowBoxes[0].top + rowBoxes[0].height / 2 + 6));
grabTargets[0].dispatchEvent(pointerAt('pointermove', rowBoxes[1].top + rowBoxes[1].height / 2));
grabTargets[0].dispatchEvent(pointerAt('pointerup', rowBoxes[1].top + rowBoxes[1].height / 2));
await sleep(400);
// 第一行是 Alex（上层），往下拖过第二行 ⟹ Alex 落到最底层，也就是数组第 0 位
check('拖动第一行到第二行，Alex 落到底层',
  editor.layers[0].id === alexLayer.id && editor.layers.map((l) => l.id).join(',') !== orderBeforeDrag,
  orderBeforeDrag + ' → ' + editor.layers.map((l) => l.id).join(','));

const afterDrag = editor.layers.map((l) => l.id).join(',');
store.undo();
await sleep(300);
check('整次拖动只占一条历史', editor.layers.map((l) => l.id).join(',') === orderBeforeDrag, afterDrag + ' → ' + editor.layers.map((l) => l.id).join(','));

// ============ 10. 滚轮与底图：缩放、旋转、移动、悬浮名称 ============
// 干净的舞台：1280×800 的底图（左上角一块红，用来看底图是不是真动了）+ 一个头像
store.clearBaseImage();
for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(400);
const wheelBase = document.createElement('canvas');
wheelBase.width = 1280;
wheelBase.height = 800;
const wbx = wheelBase.getContext('2d');
wbx.fillStyle = '#3d6b4a';
wbx.fillRect(0, 0, 1280, 800);
wbx.fillStyle = '#c8402f';
wbx.fillRect(0, 0, 320, 200);
const wheelBlob = await new Promise((r) => wheelBase.toBlob(r, 'image/png'));
await store.setBaseImage(new File([wheelBlob], '滚轮底图.png', { type: 'image/png' }));
await sleep(700);
check('底图和画布一样大时躺在 100%、左上对齐',
  editor.baseView.x === 0 && editor.baseView.y === 0 && editor.baseView.scale === 1,
  JSON.stringify({ x: editor.baseView.x, y: editor.baseView.y, scale: editor.baseView.scale }));

store.addAvatar();
await sleep(400);
for (const item of editor.layers) store.updateLayer(item.id, { x: 640, y: 400, size: 200, rotation: 0, opacity: 1 });
await sleep(400);

const wheelWrap = document.querySelector('.stage__body');
const wheelRect = document.querySelector('.artboard').getBoundingClientRect();
const wheelScale = (wheelRect.width - 2) / editor.document.width;
/** 文档坐标 → 屏幕坐标：滚轮与指针事件都得打在真实位置上 */
const toScreen = (x, y) => [wheelRect.left + x * wheelScale, wheelRect.top + y * wheelScale];
const fireWheel = (x, y, deltaY, shift) => {
  const point = toScreen(x, y);
  wheelWrap.dispatchEvent(new WheelEvent('wheel', {
    clientX: point[0], clientY: point[1], deltaY: deltaY, deltaMode: 0,
    shiftKey: !!shift, bubbles: true, cancelable: true,
  }));
};
const avatar = editor.layers[0];
const size0 = avatar.size;

fireWheel(avatar.x, avatar.y, -100);
await sleep(520);
check('悬停在头像上滚轮往上 = 放大这个头像',
  editor.layers[0].size === Math.round(size0 * 1.12) && editor.selectedId === editor.layers[0].id,
  size0 + ' → ' + editor.layers[0].size + '，顺手选中=' + (editor.selectedId === editor.layers[0].id));
const sizeUp = editor.layers[0].size;
store.undo();
await sleep(320);
check('整段滚轮收成一条历史，撤销一次就回到原尺寸', editor.layers[0].size === size0, sizeUp + ' → ' + editor.layers[0].size);
store.redo();
await sleep(320);
fireWheel(avatar.x, avatar.y, 100);
await sleep(520);
check('滚轮往下 = 缩小', Math.abs(editor.layers[0].size - size0) <= 1, editor.layers[0].size + '（原 ' + size0 + '）');

fireWheel(avatar.x, avatar.y, -100, true);
await sleep(520);
check('Shift + 滚轮 = 旋转，一格 5 度', editor.layers[0].rotation === 5, 'rotation=' + editor.layers[0].rotation);
fireWheel(avatar.x, avatar.y, -100, true);
await sleep(520);
check('再滚一格 = 10 度', editor.layers[0].rotation === 10, 'rotation=' + editor.layers[0].rotation);
store.undo();
await sleep(320);
store.undo();
await sleep(320);
check('两格滚轮 = 两条历史，撤销两次回到 0 度', editor.layers[0].rotation === 0, 'rotation=' + editor.layers[0].rotation);

const anchor = { x: 200, y: 150 };
const viewBeforeWheel = { x: editor.baseView.x, y: editor.baseView.y, scale: editor.baseView.scale };
fireWheel(anchor.x, anchor.y, -100);
await sleep(520);
const relOf = (view, point) => [(point.x - view.x) / view.scale, (point.y - view.y) / view.scale];
const relBefore = relOf(viewBeforeWheel, anchor);
const relAfter = relOf(editor.baseView, anchor);
check('滚轮打在底图上 = 缩放底图（不是缩放头像）',
  Math.abs(editor.baseView.scale - 1.12) < 1e-6 && editor.layers[0].size === size0,
  '底图 scale=' + editor.baseView.scale.toFixed(4) + '，头像尺寸=' + editor.layers[0].size);
check('底图缩放锚在光标上：光标底下那个像素没跑',
  Math.abs(relAfter[0] - relBefore[0]) < 1 && Math.abs(relAfter[1] - relBefore[1]) < 1,
  '光标处的图片坐标 ' + relBefore.map((v) => v.toFixed(1)).join(',') + ' → ' + relAfter.map((v) => v.toFixed(1)).join(','));

const panStart = toScreen(300, 620);
const panBefore = { x: editor.baseView.x, y: editor.baseView.y };
const avatarPos = { x: editor.layers[0].x, y: editor.layers[0].y };
const panPx = (type, cx, cy) => new PointerEvent(type, {
  pointerId: 31, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true,
  clientX: cx, clientY: cy, buttons: type === 'pointerup' ? 0 : 1,
});
const docPixelAt = (x, y) => {
  const board = document.querySelector('.artboard__doc');
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  return Array.from(board.getContext('2d').getImageData(Math.round(x * wheelScale * ratio), Math.round(y * wheelScale * ratio), 1, 1).data);
};
const redBefore = docPixelAt(10, 10);
wheelWrap.dispatchEvent(panPx('pointerdown', panStart[0], panStart[1]));
wheelWrap.dispatchEvent(panPx('pointermove', panStart[0] + 70, panStart[1] + 50));
wheelWrap.dispatchEvent(panPx('pointerup', panStart[0] + 70, panStart[1] + 50));
await sleep(400);
check('拖动底图 = 底图位移，头像原地不动',
  Math.abs(editor.baseView.x - panBefore.x - 70 / wheelScale) <= 2 &&
    Math.abs(editor.baseView.y - panBefore.y - 50 / wheelScale) <= 2 &&
    editor.layers[0].x === avatarPos.x && editor.layers[0].y === avatarPos.y,
  '底图 (' + editor.baseView.x + ',' + editor.baseView.y + ') 期望≈(' + Math.round(panBefore.x + 70 / wheelScale) + ',' + Math.round(panBefore.y + 50 / wheelScale) + ')，头像 ' + editor.layers[0].x + ',' + editor.layers[0].y);
const redAfter = docPixelAt(10, 10);
check('底图真的在画布上挪了（像素为证）',
  Math.abs(redBefore[0] - 200) < 14 && Math.abs(redBefore[1] - 64) < 14 &&
    !(Math.abs(redAfter[0] - 200) < 14 && Math.abs(redAfter[1] - 64) < 14),
  '左上角像素 ' + JSON.stringify(redBefore) + ' → ' + JSON.stringify(redAfter));

const resetBtn = Array.from(document.querySelectorAll('.stage__foot button')).find((b) => b.textContent.trim() === '底图复位');
check('底图被挪过之后，脚上出现「底图复位」', !!resetBtn, resetBtn ? '有' : '没有');
if (resetBtn) {
  resetBtn.click();
  await sleep(450);
}
check('复位 = 回到 100% 且左上对齐',
  editor.baseView.x === 0 && editor.baseView.y === 0 && editor.baseView.scale === 1,
  JSON.stringify({ x: editor.baseView.x, y: editor.baseView.y, scale: editor.baseView.scale }));
check('复位之后按钮自己收起来', !document.querySelector('.stage__foot .stage__reset'), document.querySelector('.stage__foot .stage__reset') ? '还在' : '收起了');

const hoverPoint = toScreen(editor.layers[0].x, editor.layers[0].y);
const movePointer = (cx, cy) => wheelWrap.dispatchEvent(new PointerEvent('pointermove', {
  pointerId: 32, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true, clientX: cx, clientY: cy,
}));
check('没悬停的时候不显示名字条', !document.querySelector('.stage__tip'), document.querySelector('.stage__tip') ? '有' : '没有');
movePointer(hoverPoint[0], hoverPoint[1]);
await sleep(280);
const tipEl = document.querySelector('.stage__tip');
check('悬浮在头像上会显示它的名称',
  !!tipEl && tipEl.textContent.trim() === editor.layers[0].name,
  (tipEl ? tipEl.textContent.trim() : '（没有）') + ' / 期望 ' + editor.layers[0].name);
const tipRect = tipEl ? tipEl.getBoundingClientRect() : { left: -999, top: -999 };
check('名字条贴在光标右下方',
  Math.abs(tipRect.left - (hoverPoint[0] + 14)) <= 2 && Math.abs(tipRect.top - (hoverPoint[1] + 16)) <= 2,
  'left=' + Math.round(tipRect.left) + ' top=' + Math.round(tipRect.top) + '，光标=' + hoverPoint.map((v) => Math.round(v)).join(','));
const emptyPoint = toScreen(60, 760);
movePointer(emptyPoint[0], emptyPoint[1]);
await sleep(280);
check('光标挪到没头像的地方，名字条消失', !document.querySelector('.stage__tip'), document.querySelector('.stage__tip') ? '还在' : '消失了');

// ============ 11. 批量添加 ============
// 真实文件走真实入口：把内置贴图取回来做成 3 个 File，一次性交给「上传皮肤」
const skinBlobs = [];
for (const skinName of ['steve.png', 'alex.png', 'steve.png']) {
  const skinResponse = await fetch('/src/assets/skins/' + skinName);
  skinBlobs.push(await skinResponse.blob());
}
const batchFiles = skinBlobs.map((blob, index) => new File([blob], '批量' + (index + 1) + '.png', { type: 'image/png' }));
const batchBefore = editor.layers.length;
const batchResult = await store.useSkinFiles(batchFiles);
await sleep(500);
const batchLayers = editor.layers.slice(batchBefore);
check('一次丢 3 张皮肤 = 3 个新头像',
  editor.layers.length === batchBefore + 3 && batchResult.ok === 3,
  '图层 ' + batchBefore + ' → ' + editor.layers.length + '，结果 ok=' + batchResult.ok);
check('批量加的头像按方阵摆开，不是叠在一起',
  batchLayers.length === 3 && new Set(batchLayers.map((l) => l.x + ',' + l.y)).size === 3,
  batchLayers.map((l) => l.x + ',' + l.y).join(' / '));
check('批量加的头像各有名字', new Set(batchLayers.map((l) => l.name)).size === 3, batchLayers.map((l) => l.name).join(' / '));
check('批量结果会明说加了几个',
  /批量添加了 3 个头像/.test(editor.notice ? editor.notice.message : ''),
  editor.notice ? editor.notice.message : '（没有提示）');
store.undo();
await sleep(420);
check('整批只占一条历史，撤销一次全部退回', editor.layers.length === batchBefore, '图层=' + editor.layers.length);
store.redo();
await sleep(420);
check('重做又把这三个放回来', editor.layers.length === batchBefore + 3, '图层=' + editor.layers.length);

check('名单能按空格/逗号/顿号/换行拆开',
  JSON.stringify(store.splitBatchInput('Notch, jeb_\nDinnerbone、Grumm')) === JSON.stringify(['Notch', 'jeb_', 'Dinnerbone', 'Grumm']),
  JSON.stringify(store.splitBatchInput('Notch, jeb_\nDinnerbone、Grumm')));
check('一次批量有上限，手一抖粘一百个也不会炸',
  store.splitBatchInput(Array.from({ length: 40 }, (_, i) => 'player' + i).join(' ')).length === store.MAX_BATCH,
  'MAX_BATCH=' + store.MAX_BATCH);

const failed = results.filter((r) => !r.pass);
const skipped = results.filter((r) => r.skipped);
return { total: results.length, failed: failed.length, skipped: skipped.length, results };

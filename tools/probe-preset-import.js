/** 把"另一个浏览器"导出的预设文件导入回来：验证自带皮肤、可套用、能真的渲染 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);
const store = window.__blockface;
const { editor } = store;
const { renderHeadCanvas } = await import('/src/core/render/head.ts');
const raw = "{\n  \"format\": \"blockface-presets\",\n  \"version\": 1,\n  \"exportedAt\": \"2026-10-07T13:31:13.567Z\",\n  \"presets\": [\n    {\n      \"id\": \"preset-muy5bofy-2\",\n      \"name\": \"头像 1 · Steve\",\n      \"size\": 320,\n      \"rotation\": 0,\n      \"opacity\": 1,\n      \"overlay\": false,\n      \"flipH\": false,\n      \"skin\": {\n        \"dataUrl\": \"data:image/png;base64,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\",\n        \"width\": 64,\n        \"height\": 64\n      },\n      \"createdAt\": 1791379873150\n    }\n  ]\n}";
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

check('导入前没有任何预设', editor.presets.length === 0, 'presets=' + editor.presets.length);
await store.importPresets(new File([raw], 'blockface-presets.json', { type: 'application/json' }));
await sleep(500);
check('导入后得到 1 个预设', editor.presets.length === 1, 'presets=' + editor.presets.length);
const preset = editor.presets[0];
check('预设名字跟着文件过来', preset && preset.name === '头像 1 · Steve', preset && preset.name);
check('预设自带皮肤位图', !!(preset && preset.skin && preset.skin.dataUrl.startsWith('data:image/png;base64,')),
  preset && preset.skin ? preset.skin.dataUrl.slice(0, 22) + '… ' + preset.skin.dataUrl.length + ' 字符' : 'null');

const layersBefore = editor.layers.length;
await store.applyPreset(preset.id);
await sleep(900);
check('套用后新增了一个图层', editor.layers.length === layersBefore + 1, layersBefore + ' → ' + editor.layers.length);
const applied = editor.layers[editor.layers.length - 1];
check('尺寸与帽子层状态还原', !!applied && applied.size === preset.size && applied.overlay === preset.overlay,
  applied ? 'size=' + applied.size + '/' + preset.size + ' overlay=' + applied.overlay : 'null');
check('皮肤以 preset 来源登记', editor.skins.some((s) => s.origin === 'preset'), editor.skins.map((s) => s.origin).join(','));

// 真的渲染到屏幕上了：同一点在"头像离屏画布"和"屏幕画布"上必须是同一个像素。
// 注意不要拿"正脸中心"当参照 —— 正脸 8 像素的中心正好落在像素边界上，
// 非整数倍放大时它取整到左边还是右边取决于尺寸奇偶，这里只验证合成链路。
const skin = store.getSkin(applied.skinId);
const rect = document.querySelector('.artboard').getBoundingClientRect();
const viewScale = (rect.width - 2) / editor.document.width;
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const device = Math.round(applied.size * viewScale * dpr);
const head = renderHeadCanvas(skin, { overlay: applied.overlay, pixelSize: device });
const hx = Math.floor(head.width / 2), hy = Math.floor(head.height / 2);
const headPixel = Array.from(head.getContext('2d').getImageData(hx, hy, 1, 1).data);
const doc = document.querySelector('.artboard__doc');
const px = Math.round(applied.x * viewScale * dpr);
const py = Math.round(applied.y * viewScale * dpr);
const drawn = Array.from(doc.getContext('2d').getImageData(px, py, 1, 1).data);
check('导入的皮肤真的画到了画布上（与离屏画布同点同色）',
  drawn[3] === 255 && drawn[0] === headPixel[0] && drawn[1] === headPixel[1] && drawn[2] === headPixel[2],
  '屏幕(' + px + ',' + py + ')=' + JSON.stringify(drawn) + ' 离屏(' + hx + ',' + hy + ')=' + JSON.stringify(headPixel));

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

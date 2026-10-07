/**
 * 验证「导出 PNG」真的落盘：走真实的 store.exportPng()（= 用户点按钮的同一条路径）。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2400);
const store = window.__blockface;
if (!store) return { fatal: 'window.__blockface 未挂载' };
const { editor } = store;

// 造一个底图（真实照片会引入网络依赖，这里用离屏 canvas 合成一张确定性的底图）
const base = document.createElement('canvas');
base.width = 1280;
base.height = 800;
const bx = base.getContext('2d');
bx.fillStyle = '#3b6ea5';
bx.fillRect(0, 0, 1280, 800);
bx.fillStyle = '#e8d9b0';
bx.fillRect(0, 500, 1280, 300);
const blob = await new Promise((r) => base.toBlob(r, 'image/png'));
await store.setBaseImage(new File([blob], 'probe-base.png', { type: 'image/png' }));
await sleep(400);

// 放两个头像：内置 Steve + Alex
await store.useBuiltinSkin('steve');
await sleep(500);
store.addAvatar();
await sleep(400);
await store.useBuiltinSkin('alex');
await sleep(500);
store.updateLayer(editor.layers[1].id, { x: 900, y: 500, size: 240, overlay: false });
await sleep(300);

editor.exportScale = 2;
await store.exportPng();
await sleep(1600);
return {
  layers: editor.layers.length,
  base: editor.baseImage ? editor.baseImage.width + 'x' + editor.baseImage.height : null,
  notice: editor.notice ? editor.notice.tone + ': ' + editor.notice.message : null,
  exportSize: editor.document.width * editor.exportScale + 'x' + editor.document.height * editor.exportScale,
};

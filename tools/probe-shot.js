/** 截图用的展示状态：一张底图 + 两个头像（Steve 带帽子层、Alex 不带），并且已存一个预设 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2400);
const store = window.__blockface;
const { editor } = store;

store.clearBaseImage();
for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(300);

const canvas = document.createElement('canvas');
canvas.width = 960;
canvas.height = 640;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#7fb2d9';
ctx.fillRect(0, 0, 960, 640);
ctx.fillStyle = '#f2c14e';
ctx.fillRect(700, 70, 130, 130);
ctx.fillStyle = '#5f9e4a';
ctx.fillRect(0, 400, 960, 240);
ctx.fillStyle = '#4a7f3a';
ctx.fillRect(0, 470, 960, 60);
const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
await store.setBaseImage(new File([blob], '海边傍晚.png', { type: 'image/png' }));
await sleep(800);

document.querySelectorAll('.rail--l .bf-card')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(700);
store.updateLayer(editor.layers[0].id, { x: 330, y: 330, size: 260 });
store.addAvatar();
await sleep(250);
await store.useBuiltinSkin('alex');
await sleep(800);
store.updateLayer(editor.layers[1].id, { x: 660, y: 360, size: 200 });
await sleep(300);
store.selectLayer(editor.layers[1].id);
store.saveCurrentAsPreset();
await sleep(600);

// 把光标停在 Alex 头像上，截图上就能看到「悬浮显示名称」这一条
const rect = document.querySelector('.artboard').getBoundingClientRect();
const scale = (rect.width - 2) / editor.document.width;
const hovered = editor.layers[1];
const wrap = document.querySelector('.stage__body');
wrap.dispatchEvent(new PointerEvent('pointermove', {
  pointerId: 77, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true,
  clientX: Math.round(rect.left + hovered.x * scale), clientY: Math.round(rect.top + hovered.y * scale),
}));
await sleep(400);
const tip = document.querySelector('.stage__tip');
return {
  layers: editor.layers.length,
  presets: editor.presets.length,
  document: editor.document.width + '×' + editor.document.height,
  tip: tip ? tip.textContent.trim() : null,
};

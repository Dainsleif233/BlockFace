/**
 * 真实输入探针 · 备好场景：1280×800 的底图 + 一个 200px 头像，并量好要用的屏幕坐标。
 * 滚轮探针与平移探针共用这一份前置。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = window.__blockface;
const { editor } = store;

for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(300);

const base = document.createElement('canvas');
base.width = 1280;
base.height = 800;
const bx = base.getContext('2d');
bx.fillStyle = '#3d6b4a';
bx.fillRect(0, 0, 1280, 800);
bx.fillStyle = '#c8402f';
bx.fillRect(0, 0, 320, 200);
const blob = await new Promise((r) => base.toBlob(r, 'image/png'));
await store.setBaseImage(new File([blob], '探针底图.png', { type: 'image/png' }));
await sleep(600);

store.addAvatar();
await sleep(300);
for (const item of editor.layers) store.updateLayer(item.id, { x: 640, y: 400, size: 200, rotation: 0, opacity: 1 });
await sleep(400);

const rect = document.querySelector('.artboard').getBoundingClientRect();
const scale = (rect.width - 2) / editor.document.width;
const at = (x, y) => [Math.round(rect.left + x * scale), Math.round(rect.top + y * scale)];

window.__probe = {
  avatar: at(640, 400),
  empty: at(150, 700),
  sizeBefore: editor.layers[0].size,
  layerPos: { x: editor.layers[0].x, y: editor.layers[0].y },
  effectiveScale: scale,
};
return { sizeBefore: window.__probe.sizeBefore, avatar: window.__probe.avatar, empty: window.__probe.empty, scale: Number(scale.toFixed(4)) };

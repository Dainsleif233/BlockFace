/**
 * 真实导出探针 · 备好场景：1280×800 底图 + Steve/Alex 两个头像。
 * 后面用 CDP 真点「导出 PNG」按钮（真实用户手势），下载才落得下来。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2400);
const store = window.__blockface;
if (!store) return { fatal: 'window.__blockface 未挂载' };
const { editor } = store;

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
await sleep(500);

await store.useBuiltinSkin('steve');
await sleep(500);
store.addAvatar();
await sleep(300);
await store.useBuiltinSkin('alex');
await sleep(500);
store.updateLayer(editor.layers[1].id, { x: 900, y: 500, size: 240, overlay: false });
await sleep(300);
const button = document.querySelector('.bf-btn--go');
window.__probe = { exportScale: editor.exportScale === undefined, button: !!button };
return { layers: editor.layers.length, exportScaleGone: editor.exportScale === undefined, button: !!button };

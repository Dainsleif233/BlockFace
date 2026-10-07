/** 图层拖动排序 · 前置：清空后放两层，并把行中心的坐标量出来给 --drag 用 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);
const store = window.__blockface;
const { editor } = store;
for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(200);
document.querySelectorAll('.rail--l .bf-card')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(600);
store.addAvatar();
await sleep(250);
await store.useBuiltinSkin('alex');
await sleep(700);
const rows = Array.from(document.querySelectorAll('.layers li[data-layer-id]'));
window.__before = {
  ids: editor.layers.map((l) => l.id),
  rows: rows.length,
  rowCenters: rows.map((r) => { const b = r.getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; }),
};

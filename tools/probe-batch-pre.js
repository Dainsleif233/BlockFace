/**
 * 真实输入探针 · 备好场景：清空画布，记下当前图层数（下面用浏览器的文件选择框选 3 张皮肤）
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = window.__blockface;
const { editor } = store;

for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(400);
window.__probe = { layersBefore: editor.layers.length };
const input = document.querySelector('.rail--l input[type=file]');
return { layersBefore: window.__probe.layersBefore, multiple: !!input && input.multiple === true, notice: editor.notice ? editor.notice.message : null };

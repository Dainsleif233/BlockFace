/** 对比度审计的前置状态：放一个头像并选中、存一个预设模板，把只在有内容时才出现的按钮都渲染出来 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2400);
const store = window.__blockface;
const { editor } = store;
document.querySelector('.rail--l .bf-card').dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(800);
store.selectLayer(editor.layers[0].id);
await sleep(200);
store.saveCurrentAsPreset();
await sleep(600);
window.__preState = { layers: editor.layers.length, presets: editor.presets.length, selected: !!editor.selectedLayerId };

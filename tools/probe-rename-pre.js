/** 预设改名/两步删除的前置：摆两个头像，存一个预设 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);
const store = window.__blockface;
const { editor } = store;
store.clearBaseImage();
for (const item of [...editor.layers]) store.removeLayer(item.id);
await sleep(300);
document.querySelectorAll('.rail--l .bf-card')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(700);
store.addAvatar();
await sleep(250);
store.saveCurrentAsPreset();
await sleep(600);
return { presets: editor.presets.length, penButtons: document.querySelectorAll('.bf-x--pen').length };

/** 预设的真实落盘：存一个预设，点导出，看 JSON 文件有没有真的下载下来 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);
const store = window.__blockface;
const { editor } = store;
document.querySelector('.rail--l .bf-card').dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(800);

store.selectLayer(editor.layers[0].id);
await sleep(200);
store.savePresetFromSelection();
await sleep(400);

const preset = editor.presets[0];
const exportBtn = Array.from(document.querySelectorAll('.rail--l button')).find((b) => b.textContent.trim() === '导出');
if (!exportBtn) return { fatal: '预设区没有找到导出按钮' };
exportBtn.click();
await sleep(1800);

return {
  presets: editor.presets.length,
  presetName: preset ? preset.name : null,
  skinBytes: preset && preset.skin ? preset.skin.dataUrl.length : 0,
  notice: editor.notice ? editor.notice.tone + ': ' + editor.notice.message : null,
  expectedFilename: 'blockface-presets-*.json',
};

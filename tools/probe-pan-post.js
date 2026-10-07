/**
 * 真实输入探针 · 断言：在画布空白处用真实鼠标按住拖动 —— 动的是画布在屏幕上的位置，
 * 文档内容（头像坐标、画布尺寸）一点不动，而且这次平移不进撤销历史。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = window.__blockface;
const { editor } = store;
const probe = window.__probe;
const from = probe.dragFrom;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

const rect = document.querySelector('.artboard').getBoundingClientRect();
check('真实拖动：整个画布在屏幕上平移了拖动的那段距离',
  Math.abs(editor.view.x - from.view.x - from.delta[0]) <= 2 && Math.abs(editor.view.y - from.view.y - from.delta[1]) <= 2 &&
    Math.abs(rect.left - from.left - from.delta[0]) <= 2 && Math.abs(rect.top - from.top - from.delta[1]) <= 2,
  '拖动 (' + from.delta[0] + ',' + from.delta[1] + ')，view=(' + editor.view.x.toFixed(0) + ',' + editor.view.y.toFixed(0) + ')，画布左上 ' +
    Math.round(from.left) + ' → ' + Math.round(rect.left));
check('平移只动屏幕位置：头像坐标与画布尺寸一点没变',
  editor.layers[0].x === from.layer.x && editor.layers[0].y === from.layer.y &&
    editor.document.width === 1280 && editor.document.height === 800,
  '头像 ' + editor.layers[0].x + ',' + editor.layers[0].y + ' 文档 ' + editor.document.width + '×' + editor.document.height);
check('拖完之后不再是"适应窗口"，但画布尺寸一点没跳',
  editor.view.autoFit === false && Math.abs(rect.width - from.width) <= 1,
  'autoFit=' + editor.view.autoFit + ' zoom=' + editor.view.zoom.toFixed(4) + '，画布宽 ' + Math.round(from.width) + ' → ' + Math.round(rect.width));

store.undo();
await sleep(400);
check('这次平移没有进撤销历史',
  Math.abs(editor.view.x - from.view.x - from.delta[0]) <= 2 && Math.abs(editor.view.y - from.view.y - from.delta[1]) <= 2,
  '撤销后 view=(' + editor.view.x.toFixed(0) + ',' + editor.view.y.toFixed(0) + ') 期望≈(' + (from.view.x + from.delta[0]) + ',' + (from.view.y + from.delta[1]) + ')');

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

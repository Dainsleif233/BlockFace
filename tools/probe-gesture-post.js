/**
 * 真实输入探针 · 断言：CDP 发的真实滚轮事件，缩放了头像/旋转了头像/缩放了底图，且整段只占一条历史
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = window.__blockface;
const { editor } = store;
const probe = window.__probe;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

const sizeAfter = editor.layers[0].size;
check('真实滚轮：悬停头像上往上滚两格 = 放大 1.12 的两格',
  sizeAfter === Math.round(Math.round(probe.sizeBefore * 1.12) * 1.12),
  probe.sizeBefore + ' → ' + sizeAfter + '（期望 ' + Math.round(Math.round(probe.sizeBefore * 1.12) * 1.12) + '）');
check('真实 Shift+滚轮：一格转 5 度', editor.layers[0].rotation === 5, 'rotation=' + editor.layers[0].rotation);
check('真实滚轮：打在底图上缩放的是底图，不是头像',
  Math.abs(editor.baseView.scale - 1.12) < 1e-6 && editor.layers[0].size === sizeAfter,
  '底图 scale=' + editor.baseView.scale.toFixed(4) + '，头像尺寸=' + editor.layers[0].size);
const anchorRel = (view, point) => (point.x - view.x) / view.scale;
check('真实滚轮：底图缩放锚在光标上',
  Math.abs(anchorRel(editor.baseView, { x: 150, y: 700 }) - (150 - probe.baseBefore.x) / probe.baseBefore.scale) < 1,
  'anchor=' + anchorRel(editor.baseView, { x: 150, y: 700 }).toFixed(2) + ' 期望≈' + ((150 - probe.baseBefore.x) / probe.baseBefore.scale).toFixed(2));

store.undo();
await sleep(400);
check('真实滚轮的一串事件只占一条历史（撤销一次三项全退回）',
  editor.layers[0].size === probe.sizeBefore && editor.layers[0].rotation === 0 &&
    editor.baseView.scale === probe.baseBefore.scale && editor.baseView.x === probe.baseBefore.x,
  '尺寸=' + editor.layers[0].size + ' 角度=' + editor.layers[0].rotation + ' 底图=' + JSON.stringify({ x: editor.baseView.x, y: editor.baseView.y, scale: editor.baseView.scale }));
store.redo();
await sleep(400);
check('重做又把这一串放回来',
  editor.layers[0].size === sizeAfter && editor.layers[0].rotation === 5 && Math.abs(editor.baseView.scale - 1.12) < 1e-6,
  '尺寸=' + editor.layers[0].size + ' 角度=' + editor.layers[0].rotation + ' 底图 scale=' + editor.baseView.scale.toFixed(4));

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

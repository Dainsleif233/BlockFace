/**
 * 真实输入探针 · 断言：CDP 发的真实滚轮 —— 头像上缩放/旋转改的是文档，空白处缩放改的是画布视图，
 * 且视图缩放锚在光标底下那块内容上。
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

const rect = document.querySelector('.artboard').getBoundingClientRect();
const scaleNow = (rect.width - 2) / editor.document.width;
const docNow = [
  (probe.empty[0] - rect.left - 1) / scaleNow,
  (probe.empty[1] - rect.top - 1) / ((rect.height - 2) / editor.document.height),
];
check('空白处真实滚轮 = 放大画布视图（不是改头像）',
  Math.abs(scaleNow - probe.anchor.scale * 1.12) < 1e-3 && editor.layers[0].size === sizeAfter,
  '视图 ' + probe.anchor.scale.toFixed(4) + ' → ' + scaleNow.toFixed(4) + '，头像尺寸=' + editor.layers[0].size);
check('视图缩放锚在光标上：光标底下那块内容没跑',
  Math.abs(docNow[0] - probe.anchor.doc[0]) < 1.5 && Math.abs(docNow[1] - probe.anchor.doc[1]) < 1.5,
  '光标处的文档坐标 ' + probe.anchor.doc.map((v) => v.toFixed(1)).join(',') + ' → ' + docNow.map((v) => v.toFixed(1)).join(','));
check('缩放的是视图倍率，文档尺寸不变',
  editor.view.autoFit === false && editor.document.width === 1280 && editor.document.height === 800,
  'autoFit=' + editor.view.autoFit + ' 文档=' + editor.document.width + '×' + editor.document.height);

store.undo();
await sleep(400);
check('真实滚轮改头像的那一串只占一条历史（撤销一次尺寸回退）',
  editor.layers[0].size === probe.sizeBefore && editor.layers[0].rotation === 0,
  '尺寸=' + editor.layers[0].size + ' 角度=' + editor.layers[0].rotation);
check('撤销文档改动不会把画布视图一起退回去',
  Math.abs(((document.querySelector('.artboard').getBoundingClientRect().width - 2) / editor.document.width) - probe.anchor.scale * 1.12) < 1e-3,
  '视图倍率仍为 ' + (((document.querySelector('.artboard').getBoundingClientRect().width - 2) / editor.document.width).toFixed(4)));

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

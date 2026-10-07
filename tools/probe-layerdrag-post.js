/** 图层拖动排序 · 收尾：真实鼠标拖完之后核对顺序与历史 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(400);
const store = window.__blockface;
const { editor } = store;
const before = window.__before;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

check('前置状态：两层就位', before.rows === 2 && before.ids.length === 2, 'rows=' + before.rows + ' ids=' + before.ids.join(','));
const topId = before.ids[1];
const bottomId = before.ids[0];
check('真实鼠标拖拽后，原来的上层落到底层',
  editor.layers[0].id === topId && editor.layers[1].id === bottomId,
  before.ids.join(',') + ' → ' + editor.layers.map((l) => l.id).join(','));

store.undo();
await sleep(300);
check('整次拖动只写入一条历史，撤销一次就恢复',
  editor.layers[0].id === bottomId && editor.layers[1].id === topId,
  editor.layers.map((l) => l.id).join(','));

store.redo();
await sleep(300);
check('重做回到拖动后的顺序',
  editor.layers[0].id === topId,
  editor.layers.map((l) => l.id).join(','));

const rowsAfter = Array.from(document.querySelectorAll('.layers li[data-layer-id]')).map((r) => r.dataset.layerId);
check('列表渲染顺序跟着数组反着来',
  rowsAfter[0] === editor.layers[1].id && rowsAfter[1] === editor.layers[0].id,
  rowsAfter.join(',') + ' / 数组 ' + editor.layers.map((l) => l.id).join(','));

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

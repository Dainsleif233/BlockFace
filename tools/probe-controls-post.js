/** 变换区交互验证 · 收尾：核对真实拖动与真实输入，以及它们各自的历史记录 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = window.__blockface;
const { editor } = store;
const before = window.__before;
const geom = window.__geom;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

const layer = editor.layers[0];
check('拖动前有 1 个图层', before.count === 1, 'layers=' + before.count);
check('5 条滑杆都渲染出来了', geom.rangeCount === 5 && geom.numberCount === 5, geom.rangeCount + ' range / ' + geom.numberCount + ' number');
check('滑杆轨道宽度不再是 0', geom.rangeBoxes.every((b) => b[0] > 100), JSON.stringify(geom.rangeBoxes.map((b) => b[0])));
check('滑杆中心点真的能点到滑杆本身', geom.hitAtCentre.every(Boolean), JSON.stringify(geom.hitAtCentre));

// ① 真实鼠标拖动滑杆
const draggedX = layer.x;
check('真实拖动改变了 X', Math.abs(draggedX - before.x) > 60, before.x + ' → ' + draggedX);

// ② 真实点击数字框 + 真实键盘输入
check('大小滑杆的上限 = 画布短边，而不是写死的 4096',
  before.maxSize === before.docShortSide && before.maxSize <= 4096,
  'max=' + before.maxSize + ' 画布短边=' + before.docShortSide);
const typedSize = editor.layers[0].size;
check('数字框里打字后模型跟着变、并夹进上限内',
  typedSize !== before.size && typedSize <= before.maxSize,
  before.size + ' → ' + typedSize + '（上限 ' + before.maxSize + '）');
const sizeBox = document.querySelectorAll('.bf-sl-val')[2];
check('数字框显示的是模型真值而不是刚打进去的字', Number(sizeBox.value) === Math.round(typedSize),
  '框里=' + sizeBox.value + ' 模型=' + typedSize);

// ③ 历史：先撤销打字，再撤销拖动
store.undo();
await sleep(250);
check('第一次撤销回退的是打字', editor.layers[0].size === before.size && Math.abs(editor.layers[0].x - draggedX) < 2,
  'size=' + editor.layers[0].size + ' x=' + editor.layers[0].x);
store.undo();
await sleep(250);
check('第二次撤销把整次拖动一次退完（拖动只记一条历史）',
  Math.abs(editor.layers[0].x - before.x) < 2,
  'x=' + editor.layers[0].x + ' 期望=' + before.x);
store.redo();
await sleep(250);
store.redo();
await sleep(250);
check('两次重做回到拖动与打字之后的状态',
  Math.abs(editor.layers[0].x - draggedX) < 2 && editor.layers[0].size === typedSize,
  'x=' + editor.layers[0].x + ' size=' + editor.layers[0].size);

// ④ 键盘微调（无障碍那条路）
const nudgeFrom = editor.layers[0].x;
document.querySelector('.stage__body').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
await sleep(200);
check('方向键微调仍然可用', editor.layers[0].x !== nudgeFrom, nudgeFrom + ' → ' + editor.layers[0].x);

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

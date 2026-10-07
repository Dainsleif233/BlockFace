/**
 * 真实输入探针 · 断言：通过浏览器文件选择框一次选 3 张皮肤，各加一个头像
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = window.__blockface;
const { editor } = store;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

const input = document.querySelector('.rail--l input[type=file]');
await sleep(400);
const layersBefore = window.__probe.layersBefore;
const added = editor.layers.slice(layersBefore);
check('上传口支持多选（multiple）', !!input && input.multiple === true, 'multiple=' + (input ? input.multiple : '没有输入框'));
check('一次选 3 张 = 3 个新头像', added.length === 3, '图层 ' + layersBefore + ' → ' + editor.layers.length);
check('三个头像是方阵摆开的，不是叠在一起', new Set(added.map((l) => l.x + ',' + l.y)).size === added.length,
  added.map((l) => l.x + ',' + l.y).join(' / '));
check('三个头像各有名字', new Set(added.map((l) => l.name)).size === added.length, added.map((l) => l.name).join(' / '));
check('每个头像都用上了对应的皮肤', added.every((l) => !!store.getSkin(l.skinId)),
  added.map((l) => (store.getSkin(l.skinId) ? 'ok' : '缺皮肤')).join(','));
check('提示里说清了加了几个', /批量添加了 3 个头像/.test(editor.notice ? editor.notice.message : ''),
  editor.notice ? editor.notice.message : '（没有提示）');
check('三个头像尺寸一致（同一批用同一个尺寸）', new Set(added.map((l) => l.size)).size === 1, added.map((l) => l.size).join(','));

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

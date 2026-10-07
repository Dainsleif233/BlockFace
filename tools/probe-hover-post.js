/**
 * 真实输入探针 · 断言：真实鼠标移到头像上会浮出名字条（位移用 CDP 发，不是合成事件）
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = window.__blockface;
const { editor } = store;
const probe = window.__probe;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

const tip = document.querySelector('.stage__tip');
const name = editor.layers[0].name;
check('真实鼠标移到头像上 → 浮出名字条', !!tip, tip ? '有' : '没有');
check('名字条写的就是这个头像的名字', !!tip && tip.textContent.trim() === name,
  (tip ? tip.textContent.trim() : '（没有）') + ' / 期望 ' + name);

const wrapBox = document.querySelector('.stage__body').getBoundingClientRect();
const tipBox = tip ? tip.getBoundingClientRect() : { left: -999, top: -999, right: -999, bottom: -999 };
check('名字条紧贴光标右下方', Math.abs(tipBox.left - (probe.avatar[0] + 14)) <= 2 && Math.abs(tipBox.top - (probe.avatar[1] + 16)) <= 2,
  'left=' + Math.round(tipBox.left) + ' top=' + Math.round(tipBox.top) + ' 光标=' + probe.avatar.join(','));
check('名字条没有越出舞台外（不会被裁掉）',
  tipBox.right <= wrapBox.right + 1 && tipBox.bottom <= wrapBox.bottom + 1 && tipBox.left >= wrapBox.left - 1,
  '名字条 ' + Math.round(tipBox.right) + ',' + Math.round(tipBox.bottom) + ' 舞台 ' + Math.round(wrapBox.right) + ',' + Math.round(wrapBox.bottom));

const wrap = document.querySelector('.stage__body');
const moveTo = (point) => wrap.dispatchEvent(new PointerEvent('pointermove', {
  pointerId: 91, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true, clientX: point[0], clientY: point[1],
}));
moveTo(probe.empty);
await sleep(250);
check('光标移到没头像的地方，名字条收起来', !document.querySelector('.stage__tip'),
  document.querySelector('.stage__tip') ? '还在' : '收起了');

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

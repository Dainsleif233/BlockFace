/** 变换区交互验证 · 准备：生成图层、记录基线、量滑杆几何 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2400);
const store = window.__blockface;
const { editor } = store;
document.querySelector('.rail--l .bf-card').dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(800);
const layer = editor.layers[0];
const ranges = Array.from(document.querySelectorAll('.bf-sl input[type=range]'));
const numbers = Array.from(document.querySelectorAll('.bf-sl-val'));
window.__before = {
  x: layer.x,
  y: layer.y,
  size: layer.size,
  sizeBox: numbers[2].value,
  count: editor.layers.length,
  maxSize: Number(ranges[2].max),
  docShortSide: Math.min(editor.document.width, editor.document.height),
};
window.__geom = {
  rangeCount: ranges.length,
  numberCount: numbers.length,
  rangeBoxes: ranges.map((el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height)];
  }),
  hitAtCentre: ranges.map((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return hit === el || el.contains(hit);
  }),
};
return { prepared: true, before: window.__before, geom: window.__geom };

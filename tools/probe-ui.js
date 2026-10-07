/** 量真实应用的界面指标：页面不许出滚动条、字号不许 <12、不许出现 emoji */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);
const all = Array.from(document.querySelectorAll('*'));
let minFont = 999;
let minEl = null;
for (const el of all) {
  if (el.children.length || !el.textContent.trim()) continue;
  const fs = parseFloat(getComputedStyle(el).fontSize);
  if (fs < minFont) { minFont = fs; minEl = el; }
}
const emojiEls = all.filter((el) => !el.children.length && /\p{Extended_Pictographic}/u.test(el.textContent));
const canvases = Array.from(document.querySelectorAll('canvas'));
let painted = 0;
for (const c of canvases) {
  try {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) { painted += 1; break; }
  } catch { /* tainted */ }
}
// 交互控件体检：必须真的有面积，且中心点真的能被点到。
// 这条是通用护栏 —— 之前滑杆的 <input type=range> 宽度被算成 0，看着在、其实点不到，
// 而"字号/溢出/emoji"三项全都发现不了它。
const desc = (el) => el.tagName.toLowerCase()
  + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
const controls = Array.from(document.querySelectorAll('button, input, select, textarea, [role="switch"], [role="button"]'))
  .filter((el) => !el.closest('.bf-sr-only') && !el.classList.contains('bf-sr-only'));
const zeroSize = [];
const occluded = [];
for (const el of controls) {
  const box = el.getBoundingClientRect();
  if (box.width < 12 || box.height < 12) {
    zeroSize.push(desc(el) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height));
    continue;
  }
  const cx = Math.round(box.left + box.width / 2);
  const cy = Math.round(box.top + box.height / 2);
  if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue; // 需要滚动才能看到，跳过
  const hit = document.elementFromPoint(cx, cy);
  if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) occluded.push(desc(el) + ' ← ' + desc(hit));
}

const de = document.documentElement;
const rail = document.querySelector('.rail--l');
const railBody = document.querySelector('.rail--l .rail__body');
return {
  viewport: innerWidth + 'x' + innerHeight,
  pageScroll: de.scrollWidth + 'x' + de.scrollHeight,
  pageOverflowX: de.scrollWidth > innerWidth,
  pageOverflowY: de.scrollHeight > innerHeight,
  topbarH: document.querySelector('.topbar').getBoundingClientRect().height,
  railW: rail.getBoundingClientRect().width,
  statusbarH: document.querySelector('.statusbar').getBoundingClientRect().height,
  railScrolls: railBody.scrollHeight > railBody.clientHeight,
  artboard: (() => { const a = document.querySelector('.artboard').getBoundingClientRect(); return Math.round(a.width) + 'x' + Math.round(a.height); })(),
  minFont,
  minFontEl: minEl ? minEl.tagName + '.' + String(minEl.className).slice(0, 30) : null,
  emoji: emojiEls.length,
  emojiSample: emojiEls.slice(0, 5).map((el) => el.textContent.slice(0, 10)),
  canvases: canvases.length,
  painted,
  controls: controls.length,
  zeroSizeControls: zeroSize,
  occludedControls: occluded,
  buttons: document.querySelectorAll('button').length,
  text: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 500),
};

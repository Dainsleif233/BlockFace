/**
 * 对比度审计：把页面上每一段可见文字的实际前景/背景算出来，按 WCAG 公式算对比度。
 * 背景是逐层向上找最近的实色再合成（半透明也一起算），所以不会把"看着是白底"算错。
 * 阈值：正文 4.5:1，大字号（≥24px 或 ≥18.66px 加粗）3:1。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);

// Chrome 现在两种写法都会给：老式 "rgba(0, 0, 0, 0)" 和新式 "rgb(0 0 0 / 0)"，
// 只按逗号切会把新式整串当成一个数，算出来全是 NaN。
const parseColor = (value) => {
  const m = /^rgba?\(([^)]+)\)$/.exec(String(value || '').trim());
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter((s) => s.length > 0).map((s) => parseFloat(s));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;
  const a = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1;
  return { r: parts[0], g: parts[1], b: parts[2], a: Math.min(1, Math.max(0, a)) };
};
const blend = (top, bottom) => {
  const a = top.a + bottom.a * (1 - top.a);
  const mix = (t, value) => (top[t] * top.a + value * bottom.a * (1 - top.a)) / (a || 1);
  return { r: mix('r', bottom.r), g: mix('g', bottom.g), b: mix('b', bottom.b), a };
};
const luminance = (c) => {
  const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (a, b) => {
  const l1 = luminance(a), l2 = luminance(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
};

const effectiveBackground = (el) => {
  const layers = [];
  let node = el;
  while (node && node.nodeType === 1) {
    const cs = getComputedStyle(node);
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a > 0.001) {
      layers.push(bg);
      if (bg.a >= 0.999) break;
    }
    node = node.parentElement;
  }
  let base = { r: 255, g: 255, b: 255, a: 1 };
  for (let i = layers.length - 1; i >= 0; i -= 1) base = blend(layers[i], base);
  return base;
};

const describe = (el) => {
  const cls = String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
  return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (el.tagName === 'INPUT' ? '[' + (el.type || '') + ']' : '');
};

const dbgChain = [];
{
  let n = document.querySelector('.bf-btn');
  let guard = 0;
  while (n && n.nodeType === 1 && guard < 10) {
    guard += 1;
    const raw = getComputedStyle(n).backgroundColor;
    const p = parseColor(raw);
    dbgChain.push({ tag: n.tagName, raw, p: p ? [p.r, p.g, p.b, p.a] : null });
    if (p && p.a >= 0.999) break;
    n = n.parentElement;
  }
}
const dbg = {
  chain: dbgChain,
  blendSelf: blend({ r: 255, g: 255, b: 255, a: 1 }, { r: 255, g: 255, b: 255, a: 1 }),
  eff: effectiveBackground(document.querySelector('.bf-btn')),
};

const rows = [];
const seen = new Set();
for (const el of Array.from(document.querySelectorAll('body *'))) {
  if (el.closest('.bf-sr-only')) continue;
  if (el.getAttribute('aria-hidden') === 'true') continue;
  const text = Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent.trim())
    .join(' ')
    .trim();
  if (!text) continue;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) continue;
  const fg = parseColor(cs.color);
  if (!fg || fg.a < 0.05) continue;
  const bg = effectiveBackground(el);
  const fgSolid = blend(fg, bg);
  const fontSize = parseFloat(cs.fontSize);
  const weight = parseInt(cs.fontWeight, 10) || 400;
  const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
  const need = large ? 3 : 4.5;
  const r = ratio(fgSolid, bg);
  const key = describe(el) + '|' + cs.color + '|' + text.slice(0, 12);
  if (seen.has(key)) continue;
  seen.add(key);
  rows.push({
    el: describe(el),
    text: text.slice(0, 18),
    color: cs.color,
    bg: 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')',
    fontSize, weight, need,
    ratio: Math.round(r * 100) / 100,
    pass: r >= need - 0.01,
  });
}
// 图标按钮：图形是用 currentColor 画的，所以按钮文字色就是图标色，按非文本对比度要求 3:1
const iconRows = [];
for (const el of Array.from(document.querySelectorAll('button, a, [role="button"]'))) {
  if (!el.querySelector('.bf-ic, .bf-x, svg')) continue;
  if (el.closest('.bf-sr-only')) continue;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') continue;
  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) continue;
  const fg = parseColor(cs.color);
  const bg = effectiveBackground(el);
  if (!fg) continue;
  const r = ratio(blend(fg, bg), bg);
  iconRows.push({ el: describe(el), title: el.getAttribute('aria-label') || el.title || '', ratio: Math.round(r * 100) / 100, pass: r >= 2.99 });
}

// 输入框占位文字：也是用户要读的文字
const placeholderRows = [];
for (const el of Array.from(document.querySelectorAll('input[placeholder], textarea[placeholder]'))) {
  if (el.closest('.bf-sr-only')) continue;
  const cs = getComputedStyle(el);
  const ph = getComputedStyle(el, '::placeholder');
  const fg = parseColor(ph.color || cs.color);
  if (!fg) continue;
  const bg = effectiveBackground(el);
  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) continue;
  const r = ratio(blend(fg, bg), bg);
  placeholderRows.push({ el: describe(el), text: el.getAttribute('placeholder'), ratio: Math.round(r * 100) / 100, pass: r >= 4.49 });
}

const bad = rows.filter((r) => !r.pass).sort((a, b) => a.ratio - b.ratio);
const badIcons = iconRows.filter((r) => !r.pass);
const badPlaceholders = placeholderRows.filter((r) => !r.pass);
return {
  total: rows.length,
  failing: bad.length + badIcons.length + badPlaceholders.length,
  textFailing: bad.length,
  worst: bad.slice(0, 24),
  badIcons,
  badPlaceholders,
  iconCount: iconRows.length,
  placeholderCount: placeholderRows.length,
};

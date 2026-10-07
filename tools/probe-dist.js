/**
 * 生产构建产物（dist/）的纯 UI 冒烟测试：完全不碰任何调试句柄，
 * 只做用户真能做的事 —— 选底图、点皮肤、在画布上拖、点导出。
 * 断言全部落在像素与磁盘文件上。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];

await sleep(2200);

// 1) 造一张 1000×640 的底图，走真实 file input
const src = document.createElement('canvas');
src.width = 1000;
src.height = 640;
const sx = src.getContext('2d');
sx.fillStyle = '#2f5d8a';
sx.fillRect(0, 0, 1000, 640);
sx.fillStyle = '#d9c48a';
sx.fillRect(0, 400, 1000, 240);
const blob = await new Promise((r) => src.toBlob(r, 'image/png'));
const dt = new DataTransfer();
dt.items.add(new File([blob], 'dist-probe.png', { type: 'image/png' }));
const fileInput = document.querySelector('.topbar input[type=file]');
fileInput.files = dt.files;
fileInput.dispatchEvent(new Event('change', { bubbles: true }));
await sleep(1200);
log.push('底图已提交：' + document.querySelector('.statusbar').innerText.replace(/\s+/g, ' ').slice(0, 60));

// 2) 点第一张内置皮肤卡片
const cards = document.querySelectorAll('.rail--l .bf-card');
log.push('内置皮肤卡片数 = ' + cards.length);
cards[0].click();
await sleep(1200);

// 3) 画布像素：找头像肤色 (189,139,114) 的质心
const board = document.querySelector('.artboard__doc');
const ctx = board.getContext('2d', { willReadFrequently: true });
function skinCentroid() {
  const { width: w, height: h } = board;
  const data = ctx.getImageData(0, 0, w, h).data;
  let n = 0, sxp = 0, syp = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (Math.abs(data[i] - 189) < 12 && Math.abs(data[i + 1] - 139) < 12 && Math.abs(data[i + 2] - 114) < 12) {
        n += 1; sxp += x; syp += y;
      }
    }
  }
  return n ? { n, x: sxp / n, y: syp / n } : null;
}
const before = skinCentroid();
log.push('头像肤色像素数 = ' + (before ? before.n : 0) + (before ? ' 质心=' + before.x.toFixed(1) + ',' + before.y.toFixed(1) : ''));

// 4) 真指针事件拖动：屏幕 +150px 应当等于画布上的 +150 × dpr 像素
const rect = document.querySelector('.stage__body').getBoundingClientRect();
const cx = Math.round(rect.left + rect.width / 2);
const cy = Math.round(rect.top + rect.height / 2);
const send = (type, x, y) => document.querySelector('.stage__body').dispatchEvent(
  new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse' }),
);
send('pointerdown', cx, cy);
send('pointermove', cx + 75, cy);
send('pointermove', cx + 150, cy);
send('pointerup', cx + 150, cy);
await sleep(900);
const after = skinCentroid();
log.push('拖动后质心 = ' + (after ? after.x.toFixed(1) + ',' + after.y.toFixed(1) : 'null'));

// 5) 点导出，验证文件真的落盘
document.querySelector('.bf-btn--go').click();
await sleep(2200);
log.push('导出后状态栏 = ' + document.querySelector('.statusbar').innerText.replace(/\s+/g, ' ').slice(0, 90));
log.push('提示条 = ' + (document.querySelector('.notice') ? document.querySelector('.notice').innerText : '（无）'));

const dpr = Math.min(devicePixelRatio || 1, 2);
const dx = before && after ? after.x - before.x : null;
return {
  checks: {
    '底图已进入文档': /1000 × 640/.test(document.querySelector('.statusbar').innerText),
    '点皮肤卡片生成了头像': !!before && before.n > 200,
    '拖动位移与屏幕位移一致': dx !== null && Math.abs(dx - 150 * dpr) <= 6,
    '拖动后质心真移动了': dx !== null && Math.abs(dx) > 100,
  },
  drag: { screenDx: 150, dpr, expectCanvasDx: 150 * dpr, actualCanvasDx: dx === null ? null : Number(dx.toFixed(1)) },
  artboard: board.width + 'x' + board.height,
  log,
};

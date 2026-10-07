
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pairs = ['A-blockgrid', 'B-spline', 'C-monument'];
const report = [];
for (const name of pairs) {
  const load = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('load fail ' + src));
    im.src = src;
  });
  try {
    const [a, b] = await Promise.all([
      load('/design-demos/' + name + '.png'),
      load('/design-demos/_verify-' + name + '.png'),
    ]);
    const ca = document.createElement('canvas'); ca.width = a.naturalWidth; ca.height = a.naturalHeight;
    ca.getContext('2d').drawImage(a, 0, 0);
    const cb = document.createElement('canvas'); cb.width = b.naturalWidth; cb.height = b.naturalHeight;
    cb.getContext('2d').drawImage(b, 0, 0);
    const da = ca.getContext('2d').getImageData(0, 0, ca.width, ca.height).data;
    const db = cb.getContext('2d').getImageData(0, 0, cb.width, cb.height).data;
    let sum = 0, n = 0, maxDiff = 0, differing = 0;
    const len = Math.min(da.length, db.length);
    for (let i = 0; i < len; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      sum += d; n += 1;
      if (d > maxDiff) maxDiff = d;
      if (d > 24) differing += 1;
    }
    report.push({
      name,
      delivered: a.naturalWidth + 'x' + a.naturalHeight,
      mine: b.naturalWidth + 'x' + b.naturalHeight,
      meanChannelDiff: +(sum / (n * 3)).toFixed(2),
      maxPixelDiff: maxDiff,
      differingPixelsPct: +((differing / n) * 100).toFixed(2),
    });
  } catch (e) {
    report.push({ name, error: String(e && e.message ? e.message : e) });
  }
}
return report;

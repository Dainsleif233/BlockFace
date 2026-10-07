#!/usr/bin/env node
/**
 * BlockFace 开发工具 · 极简 Chrome DevTools Protocol 驱动
 *
 * 本会话没有内置浏览器工具，于是用 Node 内置 WebSocket + 本机 Chrome 头less 模式
 * 自建一个可脚本化的浏览器：能导航、求值、量 DOM 指标、截图。
 *
 * 用法：
 *   node tools/cdp.mjs --url <url> [--expr "<js>"] [--expr-file <path>] \
 *        [--screenshot <out.png>] [--width 1440] [--height 900] [--wait 1500] [--json]
 *
 * 真实输入（走 CDP Input 域，是浏览器眼里的"真用户操作"，不是合成事件）：
 *   [--pre "<js>"] [--pre-file <path>]   在输入之前求值，可先备好场景
 *   [--move  "<js 返回 [x,y]>"]          把鼠标移到该视口坐标（只移动，不按键）
 *   [--click "<js 返回 [x,y]>"]          在该视口坐标点一下
 *   [--drag  "<js 返回 [x1,y1,x2,y2]>"]  从 (x1,y1) 按住拖到 (x2,y2)
 *   [--drag-steps 8]                     拖动分几步走（默认 8）
 *   [--wheel "<js 返回步骤>"]            真实滚轮，步骤 = [x,y,deltaY,shift?]，也可以传一组步骤
 *   [--files "<css 选择器>"] [--files-paths "a;b"]  走浏览器的文件选择框给 input[type=file] 塞文件
 *   [--type "文本"]                      向当前焦点插入文本
 *   顺序固定为 pre → move → click → drag → wheel → type → expr，坐标由页面自己算，输入由 CDP 发。
 *
 * 求值表达式若是 async 函数体，可用 `return` 返回结果（自动 await）。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const has = (name) => argv.includes('--' + name);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};

const url = arg('url');
if (!url) {
  console.error('missing --url');
  process.exit(2);
}
const width = Number(arg('width', 1440));
const height = Number(arg('height', 900));
const waitMs = Number(arg('wait', 1600));
const screenshotPath = arg('screenshot', null);
const downloadDir = arg('download', null);
const exprFile = arg('expr-file', null);
const exprInline = arg('expr', null);
const preFile = arg('pre-file', null);
const preInline = arg('pre', null);
const moveExpr = arg('move', null);
const clickExpr = arg('click', null);
const wheelExpr = arg('wheel', null);
const dragExpr = arg('drag', null);
const dragSteps = Number(arg('drag-steps', 8));
const typeText = arg('type', null);
const filesSelector = arg('files', null);
const filesPaths = arg('files-paths', null);
const asJson = has('json');

const CHROME = process.env.BF_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!existsSync(CHROME)) {
  console.error('chrome not found at ' + CHROME);
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'bf-cdp-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--user-data-dir=' + profile,
    '--window-size=' + width + ',' + height,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let port = 0;
let browserPath = '/devtools/browser';
for (let i = 0; i < 120; i += 1) {
  try {
    const text = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/);
    port = Number(text[0]);
    if (text[1]) browserPath = text[1];
    if (port) break;
  } catch {
    /* 还没写出来 */
  }
  await sleep(100);
}
if (process.env.BF_CDP_DEBUG) console.error('devtools port=' + port + ' path=' + browserPath);

function cleanup(code) {
  try { chrome.kill(); } catch { /* ignore */ }
  setTimeout(() => {
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
    process.exit(code);
  }, 200);
}

if (!port) {
  console.error('chrome 未能在 12 秒内启动调试端口');
  cleanup(2);
}

const ws = new WebSocket('ws://127.0.0.1:' + port + browserPath);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
/** 下载事件留痕：既用来等文件落地，也是"文件真的下来了"的证据 */
const downloadEvents = [];
ws.addEventListener('message', (event) => {
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (typeof message.method === 'string' && message.method.startsWith('Browser.download')) {
    downloadEvents.push(message);
  }
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}

const created = await send('Target.createTarget', { url: 'about:blank' });
const targetId = created.result.targetId;
const attached = await send('Target.attachToTarget', { targetId, flatten: true });
const session = attached.result.sessionId;

if (downloadDir) {
  const result = await send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true,
  });
  if (result.error) {
    console.error('设置下载目录失败: ' + JSON.stringify(result.error));
    cleanup(2);
  }
}

await send('Page.enable', {}, session);
await send('Runtime.enable', {}, session);
await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: false,
}, session);

const loaded = new Promise((resolve) => {
  const timer = setTimeout(resolve, 25000);
  const onMessage = (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.method === 'Page.loadEventFired' && message.sessionId === session) {
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      resolve();
    }
  };
  ws.addEventListener('message', onMessage);
});

await send('Page.navigate', { url }, session);
await loaded;
await sleep(waitMs);

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, session);
  if (result.result?.exceptionDetails) {
    const details = result.result.exceptionDetails;
    throw new Error('页面求值异常: ' + (details.exception?.description || details.text));
  }
  return result.result?.result?.value;
}

/** 真实鼠标：按下 → 若干步移动 → 抬起 */
async function mouse(type, x, y, buttons) {
  const result = await send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1,
  }, session);
  if (result.error) throw new Error('鼠标事件失败: ' + JSON.stringify(result.error));
}

const output = { url };
try {
  output.title = await evaluate('document.title');

  if (preInline || preFile) {
    const expression = preFile ? readFileSync(preFile, 'utf8') : preInline;
    output.pre = await evaluate('(async () => { ' + expression + ' })()');
  }

  if (moveExpr) {
    const point = await evaluate(moveExpr);
    if (!Array.isArray(point) || point.length < 2) throw new Error('--move 需要返回 [x,y]，收到 ' + JSON.stringify(point));
    await mouse('mouseMoved', point[0], point[1], 0);
    output.moved = point.slice(0, 2);
    await sleep(150);
  }

  if (clickExpr) {
    const point = await evaluate(clickExpr);
    if (!Array.isArray(point) || point.length < 2) throw new Error('--click 需要返回 [x,y]，收到 ' + JSON.stringify(point));
    await mouse('mouseMoved', point[0], point[1], 0);
    await mouse('mousePressed', point[0], point[1], 1);
    await mouse('mouseReleased', point[0], point[1], 0);
    output.clicked = point.slice(0, 2);
    await sleep(120);
  }

  if (dragExpr) {
    const plan = await evaluate(dragExpr);
    if (!Array.isArray(plan) || plan.length < 4) throw new Error('--drag 需要返回 [x1,y1,x2,y2]，收到 ' + JSON.stringify(plan));
    const [x1, y1, x2, y2] = plan;
    await mouse('mouseMoved', x1, y1, 0);
    await mouse('mousePressed', x1, y1, 1);
    for (let i = 1; i <= dragSteps; i += 1) {
      await mouse('mouseMoved', x1 + ((x2 - x1) * i) / dragSteps, y1 + ((y2 - y1) * i) / dragSteps, 1);
      await sleep(16);
    }
    await mouse('mouseReleased', x2, y2, 0);
    output.dragged = [x1, y1, x2, y2];
    await sleep(120);
  }

  if (filesSelector && filesPaths) {
    const paths = filesPaths.split(';').filter(Boolean);
    await send('DOM.enable', {}, session);
    const doc = await send('DOM.getDocument', {}, session);
    const found = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: filesSelector }, session);
    const nodeId = found.result ? found.result.nodeId : 0;
    if (!nodeId) throw new Error('--files 没找到元素: ' + filesSelector);
    const result = await send('DOM.setFileInputFiles', { nodeId, files: paths }, session);
    if (result.error) throw new Error('选择文件失败: ' + JSON.stringify(result.error));
    output.files = paths;
    await sleep(400);
  }

  if (wheelExpr) {
    const plan = await evaluate(wheelExpr);
    const steps = Array.isArray(plan[0]) ? plan : [plan];
    output.wheel = [];
    for (const step of steps) {
      const x = step[0];
      const y = step[1];
      const deltaY = step[2] === undefined ? 100 : step[2];
      const shift = !!step[3];
      // 指针必须先真的在那个点上：滚轮事件永远发生在指针位置
      await mouse('mouseMoved', x, y, 0);
      const result = await send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers: shift ? 8 : 0,
      }, session);
      if (result.error) throw new Error('滚轮事件失败: ' + JSON.stringify(result.error));
      output.wheel.push({ x, y, deltaY, shift });
      await sleep(110);
    }
    await sleep(200);
  }

  if (typeText !== null) {
    const inserted = await send('Input.insertText', { text: typeText }, session);
    if (inserted.error) throw new Error('输入失败: ' + JSON.stringify(inserted.error));
    output.typed = typeText;
    await sleep(120);
  }

  if (exprInline || exprFile) {
    const expression = exprFile ? readFileSync(exprFile, 'utf8') : exprInline;
    output.result = await evaluate('(async () => { ' + expression + ' })()');
  }
} catch (error) {
  output.error = String(error && error.message ? error.message : error);
}

if (screenshotPath) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, session);
  if (shot.result?.data) {
    writeFileSync(screenshotPath, Buffer.from(shot.result.data, 'base64'));
    output.screenshot = screenshotPath;
  } else {
    output.screenshotError = JSON.stringify(shot.result || shot.error);
  }
}

if (downloadEvents.length > 0) {
  // 有下载就等它落地：不然 Chrome 会在文件写完之前被我们收掉，目录里什么都没有
  for (let i = 0; i < 40; i += 1) {
    const done = downloadEvents.some((e) => e.method === 'Browser.downloadProgress' && e.params.state !== 'inProgress');
    if (done) break;
    await sleep(100);
  }
  output.downloads = downloadEvents.map((e) => ({
    method: e.method,
    state: e.params.state,
    suggestedFilename: e.params.suggestedFilename,
    totalBytes: e.params.totalBytes,
    receivedBytes: e.params.receivedBytes,
  }));
}

console.log(asJson ? JSON.stringify(output, null, 2) : JSON.stringify(output, null, 2));
cleanup(output.error ? 1 : 0);

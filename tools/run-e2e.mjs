#!/usr/bin/env node
/**
 * 一条命令跑完浏览器端到端测试：
 *   1. 起一个临时 vite dev server
 *   2. 用 tools/cdp.mjs 驱动本机 Chrome 打开它，执行 tools/e2e.js
 *   3. 打印结果并按失败数退出
 *
 * 用法：node tools/run-e2e.mjs
 * 依赖：本机装了 Chrome（可用环境变量 BF_CHROME 指定可执行文件路径）
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = process.env.BF_E2E_PORT || '5179';
const url = 'http://localhost:' + PORT + '/';

const vite = spawn('npx', ['vite', '--port', PORT, '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await sleep(500);
  }
  return false;
}

function runCdp() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [join(here, 'cdp.mjs'), '--url', url, '--expr-file', join(here, 'e2e.js'), '--width', '1440', '--height', '900', '--wait', '3000', '--json'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', () => resolve({ out, err }));
  });
}

function stop() {
  try { vite.kill(); } catch { /* ignore */ }
}

let code = 1;
try {
  if (!(await waitForServer())) {
    console.error('vite 没能在 30 秒内起来');
    stop();
    process.exit(2);
  }
  const { out, err } = await runCdp();
  if (err.trim()) console.error(err.trim());
  let payload = null;
  try { payload = JSON.parse(out); } catch { /* 下面兜底 */ }
  const result = payload && payload.result;
  if (!result || !Array.isArray(result.results)) {
    console.error('端到端没有产出结果：' + out.slice(0, 800));
  } else {
    for (const item of result.results) {
      console.log((item.pass ? '  PASS  ' : '  FAIL  ') + item.name + (item.detail ? '   [' + item.detail + ']' : ''));
    }
    console.log('\n' + (result.total - result.failed) + '/' + result.total + ' 通过');
    code = result.failed === 0 ? 0 : 1;
  }
} finally {
  stop();
}

process.exit(code);

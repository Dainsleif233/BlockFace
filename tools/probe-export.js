/**
 * 真实导出探针 · 断言：真点一次「导出 PNG」之后，提示与产物尺寸都是画布尺寸（固定 1 倍）。
 * 下载文件由外部脚本读目录并解析 PNG 头。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(900);
const store = window.__blockface;
const { editor } = store;
const notice = editor.notice ? editor.notice.tone + ': ' + editor.notice.message : null;
const checks = {
  '倍率选项已经从状态里删掉': editor.exportScale === undefined,
  '界面上没有倍率下拉框': !document.querySelector('select[aria-label="导出倍率"]'),
  '导出尺寸 = 画布尺寸（固定 1 倍）': editor.document.width === 1280 && editor.document.height === 800,
  '导出提示里写的就是画布尺寸': /已导出 1280×800 PNG/.test(notice || ''),
};
return {
  layers: editor.layers.length,
  base: editor.baseImage ? editor.baseImage.width + 'x' + editor.baseImage.height : null,
  notice,
  exportSize: editor.document.width + 'x' + editor.document.height,
  checks,
  failed: Object.keys(checks).filter((k) => !checks[k]),
};

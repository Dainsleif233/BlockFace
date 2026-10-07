/** 预设改名（真实点击 + 真实键盘输入）与两步删除的收尾核对 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(400);
const store = window.__blockface;
const { editor } = store;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

const input = document.querySelector('.preset__name-input');
check('点铅笔后行里换成输入框', !!input, input ? input.className : 'null');
// 打字发生在断言之前，所以这里看的不是"选区还在不在"，而是结果：
// 值正好是刚敲进去的四个字、原来的名字一个字都没剩，就说明打开时确实全选了（否则会变成追加）。
const typed = input ? input.value : '';
check('输入框拿到焦点，且原名字被整体替换（全选生效）',
  !!input && document.activeElement === input && typed === '海边摆法' && !/头像/.test(typed),
  '焦点=' + (document.activeElement === input ? '输入框' : String(document.activeElement && document.activeElement.className)) + ' 值=' + JSON.stringify(typed));

if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
await sleep(300);
check('失焦即提交，预设名字改了', editor.presets[0].name === '海边摆法', editor.presets.map((p) => p.name).join(' / '));
const label = document.querySelector('.bf-x--pen') ? document.querySelector('.bf-x--pen').closest('.bf-lay').querySelector('.bf-lay-n') : null;
check('行上显示的就是新名字', !!label && label.textContent.trim() === '海边摆法' && !document.querySelector('.preset__name-input'),
  label ? label.textContent.trim() : 'null');

const row = document.querySelector('.bf-x--pen').closest('.bf-lay');
const del = row.querySelector('.bf-x:not(.bf-x--pen)');
const before = editor.presets.length;
del.dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(250);
check('删除第一下只是上膛，不会真删',
  editor.presets.length === before && !!document.querySelector('.bf-x--armed'),
  'presets=' + editor.presets.length + ' 上膛=' + !!document.querySelector('.bf-x--armed'));
del.dispatchEvent(new MouseEvent('click', { bubbles: true }));
await sleep(350);
check('第二下才真的删掉', editor.presets.length === before - 1, before + ' → ' + editor.presets.length);

const failed = results.filter((r) => !r.pass);
return { total: results.length, failed: failed.length, results };

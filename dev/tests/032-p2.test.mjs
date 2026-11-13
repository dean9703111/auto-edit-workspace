// 032 第二階段的驗收（C4、C5、C6）：靜態掃 shared/template/tools/ 的 .mjs。每項失敗都列出「檔:行」，各工作線看自己的檔。
//   1. 「→ 下一步」只能由 lib/say.mjs 的 next() 印（下面那幾行才保證都是指令）
//   2. 成功符號只用 ✓（不用 ✔）
//   3. 「這支檔是不是被直接執行」只用 lib/cli.mjs 的 isMain（經 symlink 執行也算）
//   4. build 的六行摘要只從 lib/build-summary.mjs 認（不再各抄一份比對式）
//   5. 剪輯台網址用 editor.mjs 的 ensureEditor 拿，不從子行程的輸出比對文字
// 註解（// 開頭、/** */ 裡 * 開頭的行）不算；真的要例外的寫進 ALLOW 並寫理由。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACE } from './helpers.mjs';

const TOOLS = path.join(WORKSPACE, 'shared', 'template', 'tools');
const ALLOW = {
  // '檔:規則': '理由'
  'lib/rough/cuts.mjs:check': '讀使用者在剪輯清單「剪」欄打的勾，✔ 也要認得（032 C9 從 media.mjs 搬過來）',
  'lib/audit-beats.mjs:check': '讀分鏡表裡使用者打的勾，✔ 也要認得',
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}
const FILES = walk(TOOLS).map((f) => ({ rel: path.relative(TOOLS, f).split(path.sep).join('/'), lines: fs.readFileSync(f, 'utf8').split('\n') }));
const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);

function hits(rule, re, { except = [] } = {}) {
  const out = [];
  for (const { rel, lines } of FILES) {
    if (except.includes(rel) || ALLOW[`${rel}:${rule}`]) continue;
    lines.forEach((l, i) => { if (!isComment(l) && re.test(l)) out.push(`${rel}:${i + 1}  ${l.trim().slice(0, 120)}`); });
  }
  return out;
}
const report = (list, fix) => `${list.length} 處：\n  ${list.join('\n  ')}\n→ ${fix}`;

test('C5：「→ 下一步」只由 lib/say.mjs 的 next() 印', () => {
  const list = hits('next', /→ 下一步/, { except: ['lib/say.mjs'] });
  assert.equal(list.length, 0, report(list, '改用 next(說明, 指令…)（lib/say.mjs）；下面接的不是指令就把它寫進說明，或改成 cmdLine() 組出來的指令'));
});

test('C5：成功符號只用 ✓', () => {
  const list = hits('check', /✔/);
  assert.equal(list.length, 0, report(list, '✔ 換成 ✓（或用 lib/say.mjs 的 ok()）；比對外部程式輸出的寫進 ALLOW'));
});

test('C4：被直接執行的判斷只用 lib/cli.mjs 的 isMain', () => {
  const list = hits('main', /process\.argv\[1\]/, { except: ['lib/cli.mjs'] });
  assert.equal(list.length, 0, report(list, "改成 import { isMain } from './lib/cli.mjs'; if (isMain(import.meta.url)) …（經 symlink 執行也算）"));
});

test('C6：六行摘要只從 lib/build-summary.mjs 認', () => {
  const list = hits('summary', /人聲響度\|/, { except: ['lib/build-summary.mjs'] });
  assert.equal(list.length, 0, report(list, '改用 lib/build-summary.mjs 的 isSummaryLine／summaryLines／isSfxWarn'));
});

test('C6：剪輯台網址不從子行程輸出比對', () => {
  const list = hits('url', /(剪輯清單|剪輯(\(\?:已經開著\)\?)?|構圖|完成影片預覽|分鏡表)[：:]\\?s?\*?\(\\S\+\)/);
  assert.equal(list.length, 0, report(list, '改用 editor.mjs 的 ensureEditor(P)（回傳 { main, cuts, framing, storyboard, final, … }）'));
});

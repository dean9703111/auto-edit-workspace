// media.mjs ng-scan：詞級逐字稿對講稿找重講（剪乾淨第 3 步）；純函式測試，不跑 ffmpeg
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { TOOLS } from './helpers.mjs';

const M = await import(new URL(`file://${path.join(TOOLS, 'media.mjs')}`).href);

// 一個字一個詞、每字 0.2 秒；gap＝這段前面先停幾秒
const say = (parts) => {
  const out = [];
  let t = 0;
  for (const [text, gap = 0] of parts) {
    t += gap;
    for (const ch of text) { out.push({ text: ch, start: +t.toFixed(3), end: +(t + 0.2).toFixed(3) }); t += 0.2; }
  }
  return out;
};
const LINES = [
  '大家好歡迎來到工程師下班有約',
  '現在當手機掃碼連上電腦後就能即時顯示拍攝畫面讓我確認畫面的角度光暗',
  '接著我們來看第二個痛點多支手機無法同時開始與停止',
  '這套工具需要節點二十四以上的版本才能執行',
  '安裝完成後要重新開一個終端機來安裝最新的版本',
];

test('ng-scan：句中重講（講到一半往回幾個字再講一次）→ 前一次列 NG，留後面那次', () => {
  const w = say([[LINES[0]], [LINES[1].slice(0, 26), 0.5], [LINES[1].slice(20), 0.6], [LINES[2], 0.5]]);
  const r = M.ngScanRows(w, { lines: LINES });
  assert.equal(r.ng.length, 1);
  assert.equal(r.ng[0].line, 2);
  const restart = w.find((x, i) => i > 30 && x.start > r.ng[0].start + 1 && x.text === LINES[1][20]);
  assert.ok(r.ng[0].start > 3 && r.ng[0].end <= restart.start + 0.21, JSON.stringify(r.ng[0]));
});

test('ng-scan：換檔重講（第一支結尾講了開頭、第二支從頭再講）→ 前一次列 NG；講稿外的話碰巧有幾個字像前面某句（不到 6 字）不算', () => {
  const w = say([[LINES[0]], [LINES[1]], [LINES[2].slice(0, 12), 1], [LINES[2], 2], [LINES[3], 0.5],
    // 講稿外：「以上的版」像第 4 行，講完就跳回原處繼續
    ['那麼安裝完畢後再看到以上的版號就沒問題了', 0.5], [LINES[4], 0.5]]);
  const r = M.ngScanRows(w, { lines: LINES });
  assert.deepEqual(r.ng.map((g) => g.line), [3], JSON.stringify(r.ng));
  assert.equal(r.ng[0].cross, undefined, '沒給換檔點 → 不標');
  // 第二支從重講前 1 秒開始：NG 跨過換檔點 → 標出來交使用者聽
  const b = w.filter((x) => x.text === LINES[2][0]).at(-1).start - 1;
  assert.equal(M.ngScanRows(w, { lines: LINES, bounds: [b] }).ng[0].cross, b);
  assert.ok(r.outside.some((u) => u.text.includes('沒問題')), '講稿外的話列出來');
  // 每一行的開口時間：第 3 行用重講的那次
  const second = w.filter((x) => x.text === LINES[2][0]).at(-1).start;
  assert.ok(Math.abs(r.lineTime.get(2) - second) < 0.3, `${r.lineTime.get(2)} vs ${second}`);
});

test('ng-scan：前一次在 90 秒以前不算重講（講稿裡兩處相似的句子）', () => {
  const w = say([[LINES[0]], [LINES[1]], [LINES[2]], [LINES[1], 100], [LINES[3]]]);
  assert.deepEqual(M.ngScanRows(w, { lines: LINES }).ng, []);
});

test('ng-scan：沒講稿 → 相鄰幾句很像的前一句列 NG', () => {
  const w = say([['今天要分享一個超好用的工具'], ['今天要分享一個超好用的免費工具', 0.6], ['我們開始吧', 0.6]]);
  const r = M.ngScanRows(w, { lines: null });
  assert.equal(r.ng.length, 1);
  assert.equal(r.ng[0].text, '今天要分享一個超好用的工具');
});

test('scriptChapters：## 是章節、### 不算；``` 區塊裡的行不算口播，章節第一句照算', () => {
  const md = ['# 標題', '', '## 開場', '', '大家好', '', '### 痛點', '第一句', '', '```bash', 'curl -o- https://x.sh | bash', '## 不是章節', '```', '', '## 結語', '', '謝謝收看'].join('\n');
  const c = M.scriptChapters(md);
  assert.deepEqual(c.lines, ['大家好', '第一句', '謝謝收看']);
  assert.deepEqual(c.chapters, [{ title: '開場', line: 0 }, { title: '結語', line: 2 }]);
});

test('keepPauses：字幕不蓋 ≥ 1.5 秒的停頓（逐字稿把字攤進章節前的停頓）；起點前只有一點上一句尾巴、換氣也挪', () => {
  const speech = [[0, 2], [2.1, 4], [7, 9], [9.2, 12]];   // 4–7 是 3 秒停頓
  const cues = [{ n: 1, start: 0, end: 4.2, text: 'a' }, { n: 2, start: 4.2, end: 9, text: 'b' }, { n: 3, start: 9, end: 12, text: 'c' }];
  const r = M.keepPauses(cues, speech);
  assert.deepEqual(r.cues.map((c) => [c.start, c.end]), [[0, 4.15], [6.97, 9], [9, 12]]);
  assert.equal(r.pauses, 1);
  assert.equal(r.moved, 2);
  // 第 2 則起點在停頓前 0.1 秒（上一句的尾巴）也挪到開口
  const r2 = M.keepPauses([{ n: 1, start: 0, end: 3.9 }, { n: 2, start: 3.9, end: 9 }], speech);
  assert.deepEqual(r2.cues.map((c) => [c.start, c.end]), [[0, 3.9], [6.97, 9]]);
  // 起點到停頓之間講了 1 秒以上 → 是這句自己的字，不挪
  const r3 = M.keepPauses([{ n: 1, start: 0, end: 1 }, { n: 2, start: 2.5, end: 9 }], speech);
  assert.equal(r3.cues[1].start, 2.5);
});

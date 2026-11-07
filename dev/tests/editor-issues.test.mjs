// 檢查結果的白話與歸併（editor/issues.mjs）：作者看白話、同類合併；AI 會處理的另外放；原文一個字都不能丟
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from './helpers.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { groupIssues, issueId, issueText } = await import(pathToFileURL(path.join(TOOLS, 'editor', 'issues.mjs')).href);

// 實際跑長片（156 段）印的訊息
const WARN = [
  '[s0101 speaker] 講者介紹：還沒設定講者，畫面上是示範人物「林大寶」→ node shared/template/tools/brand.mjs speaker --name "<姓名>" --titles "<頭銜1>,<頭銜2>"（或在這段 slots 寫 name、titles）',
  '[s0301 speaker] 講者介紹：還沒設定講者，畫面上是示範人物「林大寶」→ node shared/template/tools/brand.mjs speaker',
  '音效密度：3 個一分鐘超過 2 顆主音效（0:00–1:00 4 顆）→ 每分鐘留最重要的 2 顆：那段寫 "sfx": null',
  '音效稀疏：0:52.20–2:48.31（116 秒：x0108、d0110）沒有主音效 → 情境動畫在那一拍寫 P.sfx(\'success\', \'#N@詞\')',
  '沒有畫面的區間共 10 段、58.08s → 照 style.md「連續覆蓋」補卡片或情境動畫，或把前一段的 to 延到下一段的 from',
  '#N@詞 有 226 個用字數比例估（沒有 work/transcript.json），可能差 1 秒：#282@儲存這支 → npx hyperframes transcribe …',
  '[c01 chapter] #1 前的空檔只有 0.18s（< 2s），章節 2.5s 會壓到 #1 的人聲 → 回剪乾淨保留 3 秒停頓',
  '[s0101 speaker] 音效 sparkle（2.103s）和 c01 的音效只差 1.461s（< 3s），已拿掉（只保留前一個） → 想留這顆，就在 c01 寫 "sfx": null',
  ...Array.from({ length: 45 }, (_, i) => `[s${1000 + i} key-point] 「重點字卡」大約會蓋到講者框 25% → 看 --storyboard 的截圖確認`),
  '[s0106 key-point] 最後一個內容在第 4.12s，到退場只停 1.36s，建議 ≥ 1.5s（把 to 往後延）',
  '[s0116 two-sides] 最後一個內容在第 6.54s，到退場只停 1.22s，建議 ≥ 1.5s（把 to 往後延）',
  '文字對時：s0116 的 cards[3]「訪談節目」在 2:41.90 出現，「訪談節目」2:42.61（#73）才講到 → slots.cards[3].at 寫 "#73@訪談節目"',
  '[x0302 custom] 動畫分鏡：最後一拍 #296@上傳（11:06.66）到段尾只剩 2.73s → 最後一拍改綁早一點的詞',
  '字幕不到 0.6 秒：#15 → 在剪輯台和前後句合併，或把起迄拉長',
  '字幕 #15 共 1 則不到 0.6 秒（#15 0.47 秒）→ 在剪輯台併到相鄰那則或拉長',
];

test('歸併：75 則變成幾件作者看得懂的事，AI 的另外放，原文都還在', () => {
  const G = groupIssues(['[s0102 speaker] 音效檔不存在 → 補檔'], WARN);
  assert.deepEqual(G.errors, ['[s0102 speaker] 音效檔不存在 → 補檔']);
  assert.deepEqual(G.author.map((g) => g.key), ['speaker', 'empty', 'cover', 'hold', 'short-cap']);
  assert.equal(G.counts.author, 5);
  const by = Object.fromEntries(G.author.map((g) => [g.key, g]));
  assert.equal(by.cover.title, '45 段卡片可能蓋到講者');
  assert.equal(by.cover.ids.length, 45);
  assert.equal(by.speaker.title, '講者介紹還是示範人物');
  assert.equal(by.speaker.action, 'speaker');
  assert.equal(by.empty.title, '有些地方只有講者、沒有卡片（10 段、58.08 秒）');
  assert.equal(by.hold.title, '2 段的字停留太短');
  assert.equal(by['short-cap'].raw.length, 2);
  assert.deepEqual(G.ai.map((g) => g.key).sort(), ['beat', 'chapter', 'sfx-few', 'sfx-many', 'sfx-near', 'timing', 'word'].sort());
  const raw = [...G.author, ...G.ai].flatMap((g) => g.raw);
  assert.equal(raw.length, WARN.length, '原文不能丟（要複製給 AI）');
  // 作者看到的字沒有指令和欄位名
  for (const g of G.author) assert.doesNotMatch(`${g.title}${g.hint}`, /node |plan\.json|slots|"sfx"|P\.sfx|--storyboard|\.mjs|#N@/, g.title);
  for (const g of G.ai) assert.doesNotMatch(g.title, /node |plan\.json|slots|"sfx"|P\.sfx|--storyboard|\.mjs|#N@/, g.title);
});

test('段號：開頭的標頭、文字對時；沒有段號的不亂抓', () => {
  assert.equal(issueId('[s0101 speaker] x'), 's0101');
  assert.equal(issueId('文字對時：s0116 的 cards[3] x'), 's0116');
  assert.equal(issueId('音效稀疏：0:52（116 秒：x0108）'), null);
  assert.equal(issueText('[s0101 speaker] 這是問題 → 這是給 AI 的修法'), '這是問題');
});

test('認不得的訊息：不亂歸類，放給 AI，文字拿掉修法', () => {
  const G = groupIssues([], ['全新的提醒 12 → 修法', '全新的提醒 34 → 修法', '另一種提醒']);
  assert.equal(G.author.length, 0);
  assert.deepEqual(G.ai.map((g) => [g.title, g.raw.length]), [['全新的提醒 12', 2], ['另一種提醒', 1]]);
});

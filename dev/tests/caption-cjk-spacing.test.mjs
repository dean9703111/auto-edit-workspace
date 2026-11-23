// 086 字幕的中英數之間補半形空格（AGENTS.md 規則 4）：editor/text.mjs cjkSpace，
// 用在畫面上的字幕（lib/captions.mjs buildCaptions → captions.html、final.srt、剪映 字幕.srt）、srt-align（displayText）、
// 剪輯台合併與新增（editor/subtitles.mjs）；rough.srt 原文沒補的由 captionWarnings 列出來
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imp } from './helpers.mjs';

const T = await imp('editor/text.mjs');
const S = await imp('editor/subtitles.mjs');
const C = await imp('lib/captions.mjs');
const A = await imp('lib/rough/align.mjs');

test('cjkSpace：中文字、假名和英文字母、數字相鄰才補', () => {
  const cases = [
    ['如果電腦還沒安裝AI 也會協助你', '如果電腦還沒安裝 AI 也會協助你'],   // minimax-ep1 #70 的實際字幕
    ['第3集', '第 3 集'],
    ['Node.js處理影片', 'Node.js 處理影片'],
    ['用4K輸出', '用 4K 輸出'],                                        // 4K 中間不拆
    ['AI郵報', 'AI 郵報'],
    ['看到AI目前的進度', '看到 AI 目前的進度'],
    ['ひらがなABC', 'ひらがな ABC'],
  ];
  for (const [a, b] of cases) assert.equal(T.cjkSpace(a), b, a);
});

test('cjkSpace：已經有空格、標點旁邊、純英文都不動', () => {
  for (const s of ['安裝 AI 也會', '「Select folder」', '有 Word、Excel、PDF', 'Claude Code 很好用', '一百萬', '0.5 秒', '（AI）', '']) {
    assert.equal(T.cjkSpace(s), s, s);
  }
  assert.equal(T.cjkSpace(null), '');
});

test('剪輯台合併：中文接英數補空格（#70 的成因），中文接中文不補', () => {
  const cues = [
    { n: 1, start: 1, end: 3, text: '如果電腦還沒安裝' },
    { n: 2, start: 3.5, end: 5, text: 'AI 也會協助你' },
    { n: 3, start: 5.5, end: 7, text: '但過程中' },
    { n: 4, start: 7.5, end: 9, text: '需要你授權' },
  ];
  const r1 = S.replay(cues, { scenes: [] }, [{ op: 'merge', n: 1 }]);
  assert.equal(r1.cues[0].text, '如果電腦還沒安裝 AI 也會協助你');
  const r2 = S.replay(cues, { scenes: [] }, [{ op: 'merge', n: 3 }]);
  assert.equal(r2.cues[2].text, '但過程中需要你授權');
  const en = [{ n: 1, start: 1, end: 3, text: 'Claude' }, { n: 2, start: 3.5, end: 5, text: 'Code 很好用' }];
  assert.equal(S.replay(en, { scenes: [] }, [{ op: 'merge', n: 1 }]).cues[0].text, 'Claude Code 很好用');
});

test('剪輯台新增一句會補；改字（set）照打的字存，打字時游標不跳', () => {
  const cues = [{ n: 1, start: 1, end: 3, text: '第一句' }, { n: 2, start: 5, end: 7, text: '第二句' }];
  const ins = S.replay(cues, { scenes: [] }, [{ op: 'insert', after: 1, start: 3.5, end: 4.5, text: '用MiniMax剪' }]);
  assert.equal(ins.cues[1].text, '用 MiniMax 剪');
  const set = S.replay(cues, { scenes: [] }, [{ op: 'set', n: 1, text: '安裝AI' }]);
  assert.equal(set.cues[0].text, '安裝AI');
});

test('畫面上的字幕（captions.html 與匯出用的 items）補空格；重點字也跟著找得到', () => {
  const cues = [{ n: 1, start: 0.5, end: 2, text: '還沒安裝AI 也會協助你' }, { n: 2, start: 2.5, end: 4, text: '已經有 AI 的空格' }];
  const cap = C.buildCaptions(cues, { duration: 5, words: [{ n: 1, word: '安裝AI' }] });
  assert.deepEqual(cap.items.map((i) => i.text), ['還沒安裝 AI 也會協助你', '已經有 AI 的空格']);
  assert.match(cap.html, /<em class="cw">安裝 AI<\/em>/);
});

test('build 的檢查列出 rough.srt 少空格的那幾則，附上補好的寫法', () => {
  const cues = [{ n: 7, start: 1, end: 3, text: '第3集' }, { n: 8, start: 3.5, end: 5, text: '沒問題的句子' }];
  const w = C.captionWarnings(cues).filter((s) => s.includes('半形空格'));
  assert.equal(w.length, 1);
  assert.match(w[0], /#7「第3集」→「第 3 集」/);
  assert.doesNotMatch(w[0], /#8/);
  assert.equal(C.captionWarnings([{ n: 1, start: 1, end: 3, text: '第 3 集' }]).filter((s) => s.includes('半形空格')).length, 0);
});

test('srt-align 的顯示文字：拿掉逗號之後、中文直接接英數都補空格', () => {
  assert.equal(A.displayText('如果電腦還沒安裝，AI 也會協助你'), '如果電腦還沒安裝 AI 也會協助你');
  assert.equal(A.displayText('用MiniMax剪片'), '用 MiniMax 剪片');
  assert.equal(A.displayText('有 Word、Excel、PDF'), '有 Word、Excel、PDF');
});

// 時間準確度：關鍵詞對齊（"#N@詞"）＋ 字幕起點對齊開口（media.mjs snap-srt）
// snap-srt 的音訊全部用 ffmpeg aevalsrc 現場合成（已知開口時間），驗證對齊誤差 ≤ 50ms
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lib, imp, TOOLS, tmpDir, missingTools, skipAll } from './helpers.mjs';

import { pathToFileURL } from 'node:url';
const T = await imp('lib/time.mjs');
const { resolvePlan } = await imp('lib/plan.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const { visibleLen } = await imp('lib/scenes.mjs');
const S = await imp('editor/subtitles.mjs');
const ET = await imp('editor/text.mjs');
const W = await imp('editor/server/write.mjs');
const M = await imp('media.mjs');
const L = await lib();

// ---------- 關鍵詞對齊 ----------

// 句 1：10–20 秒、共 17.5 字寬。「剪輯清單」前面是「我們用 Claude Code 做」＝ 3＋0.5＋3＋0.5＋2＋0.5＋1 ＝ 10.5 字寬
const TEXT = '我們用 Claude Code 做剪輯清單這件事';
const cues = [
  { n: 1, start: 10, end: 20, text: TEXT },
  { n: 2, start: 21, end: 25, text: '版本是 GPT-4 這一代' },
  { n: 3, start: 26, end: 30, text: '最後收尾' },
];
const sec = (v, c = cues) => { const t = T.parseTime(v); assert.ok(!t.error, t.error); return T.cueSeconds(t, c); };

test('parseTime：舊寫法的結構一個字都沒變；新增 #N@詞、#Ne@詞、#N@詞±秒', () => {
  assert.deepEqual(T.parseTime('#5'), { kind: 'cue', n: 5, end: false, off: 0, raw: '#5' });
  assert.deepEqual(T.parseTime('#5e-0.2'), { kind: 'cue', n: 5, end: true, off: -0.2, raw: '#5e-0.2' });
  assert.deepEqual(T.parseTime('#12@剪輯清單'), { kind: 'cue', n: 12, end: false, off: 0, kw: '剪輯清單', kwFull: '剪輯清單', raw: '#12@剪輯清單' });
  const e = T.parseTime('#12e@剪輯清單+0.2');
  assert.equal(e.end, true); assert.equal(e.kw, '剪輯清單'); assert.equal(e.off, 0.2);
  assert.equal(T.parseTime('#3@剪輯清單-0.5').off, -0.5);
  assert.match(T.parseTime('#3@').error, /看不懂的時間/);
  assert.match(T.TIME_HELP, /#12@詞/);
});

test('#N@詞＝起點＋詞前面的字數 ÷ 全句字數 × 句長（全形 1、半形 0.5）', () => {
  assert.equal(T.textWidth(TEXT), 17.5);
  assert.equal(T.textWidth('ab中'), 2);
  assert.equal(sec('#1@剪輯清單').sec, T.r3(10 + (10.5 / 17.5) * 10));   // 16
  assert.equal(sec('#1@我們').sec, 10);                                   // 句首的詞＝起點
  // 字數算法跟 visibleLen 一致（visibleLen 四捨五入成整數）
  assert.equal(Math.round(T.textWidth(TEXT)), visibleLen(TEXT));
});

test('#Ne@詞＝詞講完的位置；和 #N@詞 差剛好一個詞的寬度', () => {
  const a = sec('#1@剪輯清單').sec, b = sec('#1e@剪輯清單').sec;
  assert.equal(T.r3(b - a), T.r3((4 / 17.5) * 10));
  assert.equal(sec('#1e@這件事').sec, 20);   // 詞在句尾 → 等於句尾
});

test('+／- 秒數可疊在後面；詞本身有 +／- 時先整串當詞找，找不到才拆出秒數', () => {
  assert.equal(sec('#1@剪輯清單+0.2').sec, T.r3(16.2));
  assert.equal(sec('#1e@剪輯清單-0.3').sec, T.r3(sec('#1e@剪輯清單').sec - 0.3));
  // GPT-4 在原文裡 → 整串當詞，不被當成「GPT 減 4 秒」
  const g = sec('#2@GPT-4');
  assert.equal(g.word, 'GPT-4');
  assert.equal(g.sec, T.r3(21 + (T.textWidth('版本是 ') / T.textWidth(cues[1].text)) * 4));
  // 整串找不到、拆開後的詞找得到 → 拆開用
  const h = sec('#2@GPT-0.5');
  assert.equal(h.word, 'GPT');
  assert.equal(h.sec, T.r3(g.sec - 0.5));
});

test('找詞：精確 → 不分大小寫 → 忽略空白（srt-enhancer 會在中英之間加空格）', () => {
  assert.equal(sec('#1@claude code').word, 'claude code');
  assert.equal(sec('#1@claude code').sec, sec('#1@Claude Code').sec);
  assert.equal(sec('#1@ClaudeCode').sec, sec('#1@Claude Code').sec);
  assert.deepEqual(T.findKw('做 AI 剪輯', 'AI剪輯'), { i: 2, len: 5 });
  assert.equal(T.findKw('abc', 'xyz'), null);
});

test('找不到詞或句號：回 error，附那一句的原文', () => {
  const e = sec('#1@不存在的詞');
  assert.match(e.error, /#1 找不到詞「不存在的詞」/);
  assert.ok(e.error.includes(TEXT), '訊息要附原文');
  assert.match(sec('#9@詞').error, /字幕沒有第 9 句/);
});

test('plan.json：from／to／清單 at／beats／chapter 都吃 #N@詞；找不到詞報 ✖ 並附原文', () => {
  const cs = parseSrt([1, 2, 3, 4, 5, 6].map((n) => `${n}\n00:00:${String(n * 4).padStart(2, '0')},000 --> 00:00:${String(n * 4 + 3).padStart(2, '0')},000\n${n === 4 ? '今天先講重點整理這個動作' : `第${n}句內容在此`}\n`).join('\n'));
  const run = (scenes) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes }, cues: cs, videoDur: 40, lib: L, outDir: os.tmpdir() });
  const c4 = cs.find((c) => c.n === 4);
  const at = (kw, end = false) => T.r3(c4.start + (T.textWidth(c4.text.slice(0, c4.text.indexOf(kw) + (end ? kw.length : 0))) / T.textWidth(c4.text)) * (c4.end - c4.start));

  const r1 = run([{ id: 's01', scene: 'concept', from: '#4@重點整理', to: '#6e', slots: { text: '重點' } }]);
  const r0 = run([{ id: 's00', scene: 'concept', from: '#1', to: '#4e@重點整理', slots: { text: '前' } }]);
  assert.deepEqual(r0.errors, []);
  assert.deepEqual(r1.errors, []);
  const s1 = r1.items.find((x) => x.id === 's01');
  assert.equal(s1.start, at('重點整理'));
  assert.equal(r0.items[0].end, at('重點整理', true));

  // 清單項目 at（物件寫法與字串「｜at=」寫法）、beats
  const r2 = run([{ id: 's02', scene: 'side-panel', from: '#3', to: '#5e', beats: { head: '#4@整理' },
    slots: { title: '標題', items: ['第一項', { text: '第二項', at: '#4@重點' }, '第三項 ｜at="#4@這個動作"'] } }]);
  assert.deepEqual(r2.errors, [], r2.errors.join('\n'));
  assert.ok(r2.warnings.every((w) => !/找不到詞/.test(w)));

  // 找不到詞：✖ 附原文（from／清單 at／beats 三個位置）
  const bad = run([
    { id: 's03', scene: 'concept', from: '#4@不在句子裡', to: '#4e', slots: { text: '重點' } },
    { id: 's04', scene: 'side-panel', from: '#3', to: '#5e', beats: { head: '#4@沒這個詞' }, slots: { title: '標題', items: ['一', { text: '二', at: '#4@也沒有' }] } },
  ]);
  const msg = bad.errors.join('\n');
  assert.match(msg, /s03[\s\S]*#4 找不到詞「不在句子裡」→ 第 4 句原文是「今天先講重點整理這個動作」/);
  assert.match(msg, /沒這個詞/);
  assert.match(msg, /也沒有/);

  // 章節轉場的 at 只吃 "#N"
  const ch = run([{ id: 'c01', scene: 'chapter', at: '#4@重點', slots: { num: '01', title: '開場' } }]);
  assert.match(ch.errors.join('\n'), /章節轉場只寫 "#N"/);
});

// ---------- 剪輯台不會壞 ----------

test('剪輯台 subtitles.mjs：parseRef／fmtRef／refTime 認得 #N@詞，且和 build 算出同一個秒數', () => {
  const r = S.parseRef('#12e@剪輯清單+0.2');
  assert.equal(r.n, 12); assert.equal(r.end, true); assert.equal(r.kw, '剪輯清單'); assert.equal(r.off, 0.2);
  assert.equal(S.fmtRef(r), '#12e@剪輯清單+0.2');
  assert.equal(S.fmtRef(S.parseRef('#2@GPT-4')), '#2@GPT-4');            // 沒動過的詞整串寫回，不被拆壞
  assert.equal(S.fmtRef({ ...S.parseRef('#2@GPT-4'), n: 3 }), '#3@GPT-4');
  for (const v of ['#1@剪輯清單', '#1e@剪輯清單', '#1@剪輯清單+0.2', '#2@GPT-4', '#1@claude code']) assert.equal(S.refTime(v, cues), sec(v).sec, v);
  assert.equal(S.refTime('#1@不存在', cues), null);
  assert.equal(W.resolveTime('#1@剪輯清單', cues), sec('#1@剪輯清單').sec);
  // 頁面用的 findKw／textWidth 跟 lib/time.mjs 同結果
  for (const [t, k] of [[TEXT, '剪輯清單'], [TEXT, 'claude code'], ['做 AI 剪輯', 'AI剪輯'], ['abc', 'x']]) assert.deepEqual(ET.findKw(t, k), T.findKw(t, k));
  assert.equal(ET.textWidth(TEXT), T.textWidth(TEXT));
});

test('剪輯台改字幕結構：#N@詞 跟著文字走（分割看詞在哪一半、合併綁前一句、其餘句號平移）', () => {
  const cs = [1, 2, 3].map((n) => ({ n, start: n * 10, end: n * 10 + 8, text: n === 2 ? '先講前半部分，再講剪輯清單的重點' : `第${n}句` }));
  const plan = { version: 1, scenes: [
    { id: 'a', scene: 'concept', from: '#2@前半', to: '#2e@剪輯清單' },
    { id: 'b', scene: 'concept', from: '#3@第3句', to: '#3e', slots: { text: '#2@剪輯清單 是文字不改' } },
    { id: 'c', scene: 'side-panel', from: '#2', to: '#2e', slots: { items: ['x ｜at="#2@剪輯清單"', 'y ｜at=#2@重點'] } },
  ] };
  // 分割第 2 句在「，」後面（pos 8）：前半 / 後半
  const sp = S.remapPlan(plan, { op: 'split', n: 2, at: 14, pos: 8 }, cs);
  assert.equal(sp.scenes[0].from, '#2@前半');          // 詞在前半 → #2
  assert.equal(sp.scenes[0].to, '#3e@剪輯清單');        // 詞在後半 → #3，e 保留
  assert.equal(sp.scenes[1].from, '#4@第3句');          // 後面的句號 +1
  assert.equal(sp.scenes[1].slots.text, '#2@剪輯清單 是文字不改');
  assert.deepEqual(sp.scenes[2].slots.items, ['x ｜at="#3@剪輯清單"', 'y ｜at=#3@重點']);
  // 合併第 1、2 句：#2@詞 → #1@詞，第 3 句變第 2 句
  const mg = S.remapPlan(plan, { op: 'merge', n: 1 }, cs);
  assert.equal(mg.scenes[0].from, '#1@前半');
  assert.equal(mg.scenes[0].to, '#1e@剪輯清單');
  assert.equal(mg.scenes[1].from, '#2@第3句');
  // 在第 1 句後新增：>1 的 +1
  const ins = S.remapPlan(plan, { op: 'insert', after: 1, start: 19, end: 19.8, text: '新' }, cs);
  assert.equal(ins.scenes[0].from, '#3@前半');
  // 刪除第 2 句：綁在它上面的詞拿掉，退成一般 ref（bind prev → 綁前一句）
  const del = S.remapPlan(plan, { op: 'delete', n: 2, bind: 'prev' }, cs);
  assert.equal(del.scenes[0].from, '#1');
  assert.equal(del.scenes[0].to, '#1e');
  assert.equal(del.scenes[1].from, '#2@第3句');
});

test('剪輯台 applySave 的 from／to：認 #N@詞，找不到詞擋下來並附原文', () => {
  assert.ok(S.refTime('#2@GPT', cues) != null);
  assert.equal(S.refTime('#2@沒有', cues), null);
});

// ---------- snap-srt：合成音訊（已知開口時間）----------

let root, ENV_OK = true;
const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const stamp = (t) => { const ms = Math.round(t * 1000), p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const srtOf = (list) => list.map(([a, b, tx], i) => `${i + 1}\n${stamp(a)} --> ${stamp(b)}\n${tx}\n`).join('\n');
// 用 aevalsrc 在指定區間放一個音（amp 控制音量）＋極小的底噪，模擬「有人聲的區間」
const tone = (ranges, amp, dur) => `${amp}*sin(2*PI*220*t)*(${ranges.map(([a, b]) => `between(t,${a},${b})`).join('+')})+0.0005*sin(2*PI*50*t)`;
function project(name, { ranges, amp = 0.05, dur, srt }) {
  const proj = path.join(root, 'projects', name);
  fs.mkdirSync(path.join(proj, 'work'), { recursive: true });
  ff(['-f', 'lavfi', '-i', `aevalsrc='${tone(ranges, amp, dur)}':s=48000:d=${dur}`, '-f', 'lavfi', '-i', `color=c=black:s=160x90:r=10:d=${dur}`, '-shortest', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', path.join(proj, 'work', 'rough.mp4')]);
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), srtOf(srt));
  return proj;
}
const P = (proj) => ({ project: proj });
const quiet = () => {};

before(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-timing-')); });
after(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });
// snap-srt 的測試要 ffmpeg 合成聲音：沒有就略過這幾個
const ffTest = skipAll(test, await missingTools('ffmpeg'));

ffTest('snap-srt：字幕故意偏早 1 秒，對齊後開口誤差 ≤ 50ms；音量大小不影響（門檻是相對的）', () => {
  const ranges = [[1, 3], [4.2, 6.5], [7, 9], [10.5, 12]];
  for (const amp of [0.5, 0.05, 0.005]) {
    const proj = project(`syn-${amp}`, { ranges, amp, dur: 14, srt: [[0, 1.9, '第一句'], [3.2, 5.2, '第二句'], [6.0, 8.1, '第三句'], [9.6, 12.9, '第四句']] });
    const r = M.snapSrt(P(proj), { dryRun: true, log: quiet });
    ranges.forEach(([a], i) => assert.ok(Math.abs(r.rows[i].start - a) <= 0.05, `amp ${amp} 第 ${i + 1} 則：${r.rows[i].start} vs 開口 ${a}`));
    assert.equal(r.written, false);
  }
});

ffTest('snap-srt：結尾拖進靜音超過 0.4 秒 → 收到說話結束＋0.15；不重疊、每則 ≥ 0.6 秒、順序不變', () => {
  const proj = project('syn-end', { ranges: [[1, 3], [4.2, 6.5], [7, 9], [10.5, 12]], dur: 14, srt: [[0, 1.9, '一'], [3.2, 5.2, '二'], [6.0, 8.1, '三'], [9.6, 12.9, '四']] });
  const { rows } = M.snapSrt(P(proj), { dryRun: true, log: quiet });
  assert.ok(Math.abs(rows[3].end - 12.15) <= 0.05, `第 4 則結尾 ${rows[3].end}`);
  rows.forEach((r, i) => {
    assert.ok(r.end - r.start >= 0.6 - 1e-6, `第 ${i + 1} 則太短`);
    if (i) assert.ok(r.start >= rows[i - 1].end - 1e-6, `第 ${i + 1} 則和前一則重疊`);
    if (i) assert.ok(r.start > rows[i - 1].start, '順序');
  });
});

ffTest('snap-srt：已經對準的不動（差 ≤ 0.25 秒）；窗外的不動；沒有任何調整時不寫檔也不備份', () => {
  const proj = project('syn-ok', { ranges: [[1, 3], [4.2, 6.5], [7, 9]], dur: 11, srt: [[1.1, 3, '一'], [4.3, 6.5, '二'], [7.2, 9, '三']] });
  const r = M.snapSrt(P(proj), { log: quiet });
  assert.equal(r.changed.length, 0);
  assert.equal(r.written, false);
  assert.deepEqual(fs.readdirSync(path.join(proj, 'work')).filter((f) => f.includes('.bak')), []);
  // 開口點離字幕起點超過視窗（字幕早 2 秒以上）→ 不亂動
  const far = project('syn-far', { ranges: [[5, 7]], dur: 9, srt: [[1, 3, '太早']] });
  assert.equal(M.snapSrt(P(far), { dryRun: true, log: quiet }).rows[0].dStart, 0);
});

ffTest('snap-srt：寫回前備份成 rough.srt.bak-<時間戳>（新檔，原檔內容一字不差）；文字與格式原樣保留；--dry-run 不寫；不刪任何檔', () => {
  const srt = [[0, 1.9, '第一句，有逗號'], [3.2, 5.2, '第二句'], [6.0, 8.1, '第三句']];
  const proj = project('syn-write', { ranges: [[1, 3], [4.2, 6.5], [7, 9]], dur: 11, srt });
  const f = path.join(proj, 'work', 'rough.srt');
  const before0 = fs.readFileSync(f, 'utf8');
  const filesBefore = fs.readdirSync(path.join(proj, 'work')).sort();
  M.snapSrt(P(proj), { dryRun: true, log: quiet });
  assert.equal(fs.readFileSync(f, 'utf8'), before0, '--dry-run 不能動檔');
  assert.deepEqual(fs.readdirSync(path.join(proj, 'work')).sort(), filesBefore);
  const logs = [];
  const r = M.snapSrt(P(proj), { log: (...a) => logs.push(a.join(' ')), now: new Date(2026, 0, 2, 3, 4, 5) });
  assert.equal(r.written, true);
  assert.equal(path.basename(r.backup), 'rough.srt.bak-20260102-030405');
  assert.equal(fs.readFileSync(r.backup, 'utf8'), before0);
  const after = parseSrt(fs.readFileSync(f, 'utf8'));
  assert.deepEqual(after.map((c) => c.text), ['第一句，有逗號', '第二句', '第三句']);
  assert.ok(Math.abs(after[0].start - 1) <= 0.05);
  assert.ok(logs.some((l) => /第一句|嗨|#1/.test(l)) && logs.some((l) => l.includes('備份')), '要印調整表和備份位置');
  // 同一秒再跑一次：備份檔名不覆蓋舊的
  fs.writeFileSync(f, before0);
  const r2 = M.snapSrt(P(proj), { log: quiet, now: new Date(2026, 0, 2, 3, 4, 5) });
  assert.notEqual(r2.backup, r.backup);
  assert.ok(fs.existsSync(r.backup) && fs.existsSync(r2.backup));
  // 原檔檔案都還在（只多不少）
  for (const n of filesBefore) assert.ok(fs.existsSync(path.join(proj, 'work', n)), n);
});

test('rewriteSrtTimes：只改時間行，CRLF、BOM、多行字幕、空行原樣保留', () => {
  const src = '﻿1\r\n00:00:00,000 --> 00:00:01,000\r\n第一行\r\n第二行\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\n字\r\n';
  const out = M.rewriteSrtTimes(src, [{ n: 1, start: 0.5, end: 1.25 }, { n: 2, start: 2, end: 3 }]);
  assert.equal(out, '﻿1\r\n00:00:00,500 --> 00:00:01,250\r\n第一行\r\n第二行\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\n字\r\n');
});

test('snapCues（純函式）：起點撞到鄰居就退回原值，不重疊；視窗邊界', () => {
  const speech = [[1, 2], [2.4, 3]];
  // 兩則字幕都想往後對，但第二個開口點離第一個太近（< 0.6 秒）→ 動過的退回
  const cs = [{ n: 1, start: 0.2, end: 1.2, text: 'a' }, { n: 2, start: 1.9, end: 3, text: 'b' }];
  const { rows } = M.snapCues(cs, speech);
  assert.ok(rows[1].start - rows[0].start >= 0.6 - 1e-6);
  assert.ok(rows[0].end <= rows[1].start + 1e-6);
  // 視窗：開口點比字幕晚 1.5 秒內才抓，晚 1.6 秒不抓；比字幕早 0.6 秒內才抓
  assert.notEqual(M.snapCues([{ n: 1, start: 0, end: 4, text: 'a' }], [[1.4, 3]]).rows[0].dStart, 0);
  assert.equal(M.snapCues([{ n: 1, start: 0, end: 4, text: 'a' }], [[1.6, 3]]).rows[0].dStart, 0);
  assert.notEqual(M.snapCues([{ n: 1, start: 2, end: 4, text: 'a' }], [[1.5, 3]]).rows[0].dStart, 0);
  assert.equal(M.snapCues([{ n: 1, start: 2, end: 4, text: 'a' }], [[1.3, 3]]).rows[0].dStart, 0);
});

ffTest('snap-srt：缺檔、沒有聲音、整段靜音都給 ✖ 風格的中文訊息', () => {
  const none = path.join(root, 'projects', 'empty');
  fs.mkdirSync(path.join(none, 'work'), { recursive: true });
  assert.throws(() => M.snapSrt(P(none), { log: quiet }), /找不到.*rough\.srt → 先跑/);
  fs.writeFileSync(path.join(none, 'work', 'rough.srt'), srtOf([[0, 1, 'a']]));
  assert.throws(() => M.snapSrt(P(none), { log: quiet }), /找不到.*rough\.mp4/);
  ff(['-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(none, 'work', 'rough.mp4')]);
  assert.throws(() => M.snapSrt(P(none), { log: quiet }), /沒有聲音軌/);
  const flat = project('syn-flat', { ranges: [[0, 6]], dur: 6, srt: [[0, 1, 'a']] });   // 整段同一個音量：分不出說話與停頓
  assert.throws(() => M.snapSrt(P(flat), { log: quiet }), /分不出哪裡在說話/);
  assert.throws(() => M.snapSrt(P(none), { below: 'abc', log: quiet }), /--below 要是/);
});

ffTest('CLI：snap-srt --dry-run 印調整表、--help 有說明、build 不會呼叫它', () => {
  const proj = project('syn-cli', { ranges: [[1, 3], [4.2, 6.5]], dur: 8, srt: [[0, 1.9, '一'], [3.2, 5.2, '二']] });
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'media.mjs'), ...a], { encoding: 'utf8', cwd: root });
  const r = run('snap-srt', '--project', proj, '--dry-run');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /開口門檻/);
  assert.match(r.stdout, /#1\s+0:00\.00 → 0:00\.9\d\s+\+0\.9\d/);
  assert.match(r.stdout, /--dry-run：只印不寫/);
  assert.match(run('--help').stdout, /snap-srt/);
  for (const f of ['build.mjs', 'lib/plan.mjs', 'lib/main.mjs', 'lib/assemble.mjs']) assert.ok(!/snapSrt|snap-srt/.test(fs.readFileSync(path.join(TOOLS, f), 'utf8')), `${f} 不能呼叫 snap-srt`);
});

// ---------- 002：formatSrt、情境動畫綁句（specs/contracts/cues.md §3.2、§6）----------
const { formatSrt } = await imp('lib/srt.mjs');
const { scanCueRefs, readCustom } = await imp('lib/assemble.mjs');

test('formatSrt(parseSrt(x)) === x：LF、CRLF、BOM 都原樣', () => {
  const lf = '1\n00:00:01,000 --> 00:00:02,500\n第一句\n\n2\n00:01:02,040 --> 00:01:04,000\n第二句 with English\n';
  assert.equal(formatSrt(parseSrt(lf)), lf);
  const crlf = lf.replace(/\n/g, '\r\n');
  assert.equal(formatSrt(parseSrt(crlf), { eol: '\r\n' }), crlf);
  assert.equal(formatSrt(parseSrt('﻿' + lf), { bom: true }), '﻿' + lf);
});

test('scanCueRefs：只看 <template> 的 <script>；註解裡的不算；單雙引號都抓；去重、照順序；http:// 不被當註解', () => {
  const html = `<!doctype html><html><head><script>P.at('#1')</script></head><body><template id="x-a-template"><div id="x-a" data-composition-id="x-a"></div><script>
    // 例：P.at('#77')
    /* P.at('#66') */
    var u = "http://example.com"; P.in('#a', P.at('#18')); P.in('#b', P.at("#18@逐字稿", 0.2)); P.at('#18'); P.at( '#20e' );
    window.__timelines['x-a'] = gsap.timeline({ paused: true });
  </script></template></body></html>`;
  assert.deepEqual(scanCueRefs(html), ['#18', '#18@逐字稿', '#20e']);
  const f = path.join(tmpDir(null, 'hf-scan-'), 'x-a.html');
  fs.writeFileSync(f, html);
  assert.deepEqual(readCustom(f, 'x-a').refs, ['#18', '#18@逐字稿', '#20e']);
});

test('cues.md §6 的 002 端：refs[#18] 等於 from #18 算出的起點；#18@逐字稿＝cueSeconds；#99 ✖', () => {
  const cs = parseSrt('17\n00:00:40,000 --> 00:00:42,900\n先錄影\n\n18\n00:00:43,200 --> 00:00:45,600\n轉成逐字稿\n\n19\n00:00:46,200 --> 00:00:48,400\n再校正\n\n20\n00:00:49,200 --> 00:00:51,800\n最後剪輯\n');
  const od = tmpDir(null, 'hf-cues-');
  fs.mkdirSync(path.join(od, 'compositions'));
  fs.writeFileSync(path.join(od, 'compositions', 'x-process.html'), `<template><div id="x-process" data-composition-id="x-process"></div><script>P.at('#18'); P.at('#18@逐字稿'); P.at('#99'); window.__timelines['x-process'] = gsap.timeline({ paused: true });</script></template>`);
  const go = (scenes) => resolvePlan({ plan: { version: 1, scenes }, cues: cs, videoDur: 60, lib: L, outDir: od });
  const res = go([{ id: 'x01', type: 'custom', src: 'compositions/x-process.html', layout: 'overlay', from: '#17', to: '#20e' }]);
  const x = res.allItems[0];
  const from18 = go([{ id: 'x01', type: 'custom', src: 'compositions/x-process.html', layout: 'overlay', from: '#18', to: '#20e' }]).allItems[0].start;
  assert.equal(x.cueRefs['#18'], 43.2);
  assert.equal(x.cueRefs['#18'], from18);
  assert.equal(x.cueRefs['#18@逐字稿'], +sec('#18@逐字稿', cs).sec.toFixed(3));
  assert.ok(res.errors.some((e) => e.includes("P.at('#99')") && e.includes('字幕沒有第 99 句')));
});

// ---------- F4：詞級逐字稿（work/transcript.json）----------
test('wordTime：去掉標點空白逐字比對、#Ne 用最後一個字的結尾；整個詞找不到時用詞裡最長的一段推回詞頭；離 guess 最近的優先', () => {
  const words = [
    { text: '我們', start: 10, end: 10.4 }, { text: '放', start: 10.4, end: 10.6 }, { text: '到電腦', start: 10.6, end: 11.2 },
    { text: '上，', start: 11.2, end: 11.4 }, { text: '才看得出', start: 11.4, end: 12.2 }, { text: 'AI', start: 13, end: 13.3 }, { text: 'Coding', start: 13.3, end: 13.9 },
    { text: '放到電腦', start: 20, end: 20.8 },
  ];
  const c = { n: 1, start: 9.8, end: 12.5, text: '我們放到電腦上，才看得出' };
  assert.equal(T.wordTime(words, c, '放到電腦'), 10.4);
  assert.equal(T.wordTime(words, c, '放到電腦', { end: true }), 11.2);
  assert.equal(T.wordTime(words, c, '上才看'), 11.2, '中間夾標點');
  assert.equal(T.wordTime(words, { start: 12.5, end: 14 }, 'ai coding'), 13);
  // 逐字稿聽成別的字：「拿到電腦」→ 找到「到電腦」，往前推一個字
  assert.equal(T.wordTime(words, c, '拿到電腦'), 10.4);
  assert.equal(T.wordTime(words, c, '完全沒有'), null);
  assert.equal(T.wordTime([], c, '放到電腦'), null);
});

test('cueSeconds：有 cues.words 時 #N@詞 用真實時間；找不到詞、或沒有逐字稿（wordsWhy）退回字數比例並記進 cues.approx', () => {
  const cs = parseSrt('1\n00:00:10,000 --> 00:00:20,000\n我們用 Claude Code 做剪輯清單這件事\n');
  const prop = T.cueSeconds(T.parseTime('#1@剪輯清單'), cs).sec;
  cs.words = [{ text: '我們用', start: 10, end: 11 }, { text: 'Claude', start: 11, end: 11.5 }, { text: 'Code', start: 11.5, end: 12 }, { text: '做剪輯清單', start: 12, end: 14 }];
  cs.approx = new Set();
  assert.equal(T.cueSeconds(T.parseTime('#1@剪輯清單'), cs).sec, 12.4);
  assert.equal(T.cueSeconds(T.parseTime('#1e@剪輯清單'), cs).sec, 14);
  assert.equal(T.cueSeconds(T.parseTime('#1@剪輯清單+0.2'), cs).sec, 12.6);
  assert.equal(cs.approx.size, 0);
  const r = T.cueSeconds(T.parseTime('#1@這件事'), cs);
  assert.equal(r.approx, '詞級逐字稿在這句附近找不到這個詞');
  assert.deepEqual([...cs.approx], ['#1@這件事']);
  const cs2 = parseSrt('1\n00:00:10,000 --> 00:00:20,000\n我們用 Claude Code 做剪輯清單這件事\n');
  cs2.wordsWhy = '沒有 work/transcript.json（rough.mp4 的詞級逐字稿）'; cs2.approx = new Set();
  assert.equal(T.cueSeconds(T.parseTime('#1@剪輯清單'), cs2).sec, prop);
  assert.deepEqual([...cs2.approx], ['#1@剪輯清單']);
});

test('attachWords：transcript.json 比 rough.mp4 舊、長度對不上、格式錯 → 不掛並記原因；plan 有 #N@詞 時一則 ⚠', async () => {
  const { attachWords } = await imp('build.mjs');
  const d = tmpDir(null, 'hf-words-');
  const tj = path.join(d, 'transcript.json'), video = path.join(d, 'rough.mp4');
  const srt = '1\n00:00:01,000 --> 00:00:03,000\n第一句放到電腦\n';
  fs.writeFileSync(video, 'x');
  assert.equal(attachWords(parseSrt(srt), { transcript: tj, video }).wordsWhy, '沒有 work/transcript.json（rough.mp4 的詞級逐字稿）');
  fs.writeFileSync(tj, JSON.stringify([{ text: '第一句', start: 1, end: 1.6, id: 'w0' }, { text: '放到電腦', start: 1.8, end: 2.9, id: 'w1' }]));
  const ok = attachWords(parseSrt(srt), { transcript: tj, video });
  assert.equal(ok.words.length, 2);
  assert.equal(ok.wordsWhy, undefined);
  fs.writeFileSync(tj, JSON.stringify([{ text: '第一句', start: 1, end: 9 }]));
  assert.match(attachWords(parseSrt(srt), { transcript: tj, video }).wordsWhy, /長度（9s）和 rough\.srt（3s）對不上/);
  const old = new Date(Date.now() - 60000);
  fs.writeFileSync(tj, JSON.stringify([{ text: '第一句', start: 1, end: 3 }]));
  fs.utimesSync(tj, old, old);
  assert.equal(attachWords(parseSrt(srt), { transcript: tj, video }).wordsWhy, 'work/transcript.json 比 rough.mp4 舊（不是這支初剪轉的）');
  const cs = attachWords(parseSrt(srt), { transcript: tj, video });
  const res = resolvePlan({ plan: { version: 1, scenes: [{ id: 's01', scene: 'concept', from: '#1@放到電腦', to: '#1e', slots: { text: '甲乙' } }] }, cues: cs, videoDur: 10, lib: L, outDir: d, projectRel: 'projects/x' });
  assert.ok(res.warnings.includes('#N@詞 有 1 個用字數比例估（work/transcript.json 比 rough.mp4 舊（不是這支初剪轉的）），可能差 1 秒：#1@放到電腦 → 對 rough.mp4 重轉詞級逐字稿：npx hyperframes transcribe projects/x/work/rough.mp4 -d projects/x/work --model small --language zh --json'), JSON.stringify(res.warnings));
});

test('繁簡：normText 折成同一種、#N@詞 對得上簡體逐字稿；toTrad 處理一字多義', async () => {
  const { normText } = await import(pathToFileURL(path.join(TOOLS, 'lib', 'time.mjs')).href);
  const Z = await import(pathToFileURL(path.join(TOOLS, 'lib', 'zh.mjs')).href);
  assert.equal(normText('不滿意的資料夾裡'), normText('不满意的资料夹里'));
  assert.equal([...normText('發髮')].length, 2, '一個字換一個字，位置對照不會歪');
  for (const [s, t] of [['这只影片的头发很干净', '這隻影片的頭髮很乾淨'], ['只有一只猫', '只有一隻貓'], ['干嘛复制这里的资料', '幹嘛複製這裡的資料'], ['系统关系很复杂', '系統關係很複雜'], ['一公里', '一公里'], ['沉默', '沉默'], ['喂', '喂']]) assert.equal(Z.toTrad(s), t);
  assert.equal(Z.hasSimplified('我們會'), false);
  assert.equal(Z.hasSimplified('我们会'), true);
  const words = [{ text: 'AI剪完如果有', start: 10, end: 11 }, { text: '不满意', start: 11, end: 12 }, { text: '的地方', start: 12, end: 13 }];
  const { wordTime } = await import(pathToFileURL(path.join(TOOLS, 'lib', 'time.mjs')).href);
  const t = wordTime(words, { start: 10, end: 13, text: 'AI 剪完如果有不滿意的地方' }, '不滿意');
  assert.ok(Math.abs(t - 11) < 0.05, `簡體逐字稿也找得到：${t}`);
});

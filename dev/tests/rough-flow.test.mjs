// 「剪乾淨」併成指令：media.mjs prep／rough／transcribe、main.mp4 逐字稿換算成 rough.mp4 時間軸、講稿外字數判斷、scan 的圖片 contact sheet、frame 多個時間
// 端到端用 ffmpeg 合成短片；需要 whisper 的步驟用 --transcript 注入假逐字稿；auto-editor 沒裝就 skip
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, hasChrome } from './helpers.mjs';

const MEDIA = path.join(TOOLS, 'media.mjs');
const M = await import(MEDIA);
const X = await import(path.join(TOOLS, 'lib', 'transcript-map.mjs'));
const F = await import(path.join(TOOLS, 'lib', 'rough-flow.mjs'));

const hasAe = spawnSync('auto-editor', ['--version'], { encoding: 'utf8' }).status === 0;
let root, tpl;
const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
// rough 跑完會開預覽（背景處理底片、開剪輯台）：測試不開
const cli = (args, project) => spawnSync(process.execPath, [MEDIA, ...args, ...(args[0] === 'rough' && !args.includes('--no-editor') ? ['--no-editor'] : []), '--template', tpl, '--project', `projects/${project}`], { encoding: 'utf8', cwd: root });
const mkProj = (name) => {
  const p = path.join(root, 'projects', name);
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  fs.mkdirSync(path.join(p, 'work'), { recursive: true });
  return p;
};
// 有聲音、有停頓的短片：spans＝[[起, 迄], …] 這幾段有聲音，其他是靜音（auto-editor 會剪掉）
const talkClip = (file, sec, spans, size = '320x180') => {
  const expr = spans.map(([a, b]) => `between(t,${a},${b})`).join('+');
  ff(['-f', 'lavfi', '-i', `testsrc=size=${size}:rate=30:d=${sec}`, '-f', 'lavfi', '-i', `aevalsrc='0.4*sin(2*PI*440*t)*(${expr})':s=48000:d=${sec}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file]);
};
// 把一段話排成詞：每字 charSec 秒、一字一詞
const say = (text, at, charSec = 0.2) => [...text].map((c, i) => ({ text: c, start: +(at + i * charSec).toFixed(3), end: +(at + (i + 1) * charSec).toFixed(3) }));
const writeJson = (f, v) => { fs.writeFileSync(f, JSON.stringify(v)); return f; };

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-rough-flow-'));
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  tpl = path.join(root, 'shared', 'template');
  fs.symlinkSync(TEMPLATE, tpl, 'dir');
});
after(() => { fs.rmSync(root, { recursive: true, force: true }); });

// ---------- 逐字稿換算 ----------
const V1 = { version: '1', chunks: [[0, 300, 1], [300, 450, 99999], [450, 600, 1], [600, 660, 99999], [660, 900, 1]] };   // 30fps：留 0–10、15–20、22–30；rough 時間 0–10、10–15、15–23

test('keptSegments／sourceToRough：保留段接起來；剪掉的範圍接到下一段起點', () => {
  const k = X.keptSegments(V1, 30);
  assert.deepEqual(k.map((x) => [x.a, x.b, x.at]), [[0, 10, 0], [15, 20, 10], [22, 30, 15]]);
  assert.equal(X.sourceToRough(k, 5), 5);
  assert.equal(X.sourceToRough(k, 12), 10, '落在剪掉的範圍 → 下一段起點');
  assert.equal(X.sourceToRough(k, 16), 11);
  assert.equal(X.sourceToRough(k, 25), 18);
  assert.equal(X.sourceToRough(k, 99), 23, '超過尾巴 → 停在最後');
});

test('mapWords：一般的詞照剪掉多少往前移；NG 裡的詞丟掉（打勾的原始範圍），不是 NG 的剪掉範圍裡的詞不丟', () => {
  const words = [{ text: '甲', start: 1, end: 1.5 }, { text: '乙', start: 16, end: 16.5 }, { text: '丙', start: 23, end: 23.5 }];
  const m = X.mapWords(words, V1, 30);
  assert.deepEqual(m.words.map((w) => [w.text, w.start, w.end]), [['甲', 1, 1.5], ['乙', 11, 11.5], ['丙', 16, 16.5]]);
  assert.equal(m.dropped, 0);
  const ng = X.mapWords([{ text: '錯', start: 16, end: 16.5 }, ...words], V1, 30, { ngRanges: [[15.8, 16.3]] });
  assert.deepEqual(ng.words.map((w) => w.text), ['甲', '丙'], '詞的中點在 NG 範圍 → 丟掉');
  assert.equal(ng.dropped, 2);
});

test('wordsToSource：只留保留段轉的逐字稿 → 換回原片秒數；跨接點的詞起迄分屬兩段', () => {
  const k = X.keptSegments(V1, 30);
  assert.equal(X.roughToSourceTime(k, 5), 5);
  assert.equal(X.roughToSourceTime(k, 11), 16);
  assert.equal(X.roughToSourceTime(k, 16), 23);
  assert.equal(X.roughToSourceTime(k, 99), 30, '超過尾巴 → 原片最後');
  const back = X.wordsToSource([{ text: '甲', start: 1, end: 1.5 }, { text: '乙', start: 9.8, end: 10.4, id: 'w1' }], k);
  assert.deepEqual(back, [{ text: '甲', start: 1, end: 1.5 }, { text: '乙', start: 9.8, end: 15.4, id: 'w1' }]);
  // 換回去再換到同一組保留段：時間回到原本的
  const round = X.mapWords(back, V1, 30);
  assert.deepEqual(round.words.map((w) => [w.start, w.end]), [[1, 1.5], [9.8, 10.4]]);
});

test('mapWords：整個落在剪掉範圍（不是 NG）的詞不丟，接到下一段起點、到下一個詞之間照字數平均排', () => {
  const words = [{ text: '甲', start: 9, end: 9.5 }, { text: '一二', start: 11, end: 11.5 }, { text: '三', start: 12, end: 12.5 }, { text: '乙', start: 15.9, end: 16.4 }];
  const m = X.mapWords(words, V1, 30);
  assert.equal(m.collapsed, 2);
  assert.deepEqual(m.words.map((w) => w.text), ['甲', '一二', '三', '乙']);
  assert.equal(m.words[1].start, 10, '接點');
  assert.ok(Math.abs(m.words[1].end - (10 + 0.6)) < 0.01, '兩個字佔 2／3');
  assert.ok(Math.abs(m.words[2].end - 10.9) < 0.01, '排到下一個詞的起點');
  assert.equal(m.words[3].start, 10.9);
  // 後面沒有詞：照語速往後排，不會全部擠在同一點
  const tail = X.mapWords([{ text: '甲乙', start: 11, end: 12 }], V1, 30);
  assert.ok(tail.words[0].end > tail.words[0].start);
});

test('speechWhisper：現成的停頓結果（--v1）只留保留段轉、時間換回 main.mp4，whisper 用環境裡的版本', { skip: process.env.AUTO_EDIT_REAL_WHISPER ? false : '只在 AUTO_EDIT_REAL_WHISPER=1 時跑（要 whisper 與 say）' }, async () => {
  const p = mkProj('realw');
  const wav = path.join(root, 'realw.aiff');
  assert.equal(spawnSync('say', ['-v', 'Meijia', '-o', wav, '大家好歡迎來到工程師下班有約'], { encoding: 'utf8' }).status, 0);
  ff(['-i', wav, '-af', 'adelay=5000:all=1,apad=pad_dur=2', '-c:a', 'aac', path.join(p, 'a.m4a')]);
  ff(['-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=30', '-i', path.join(p, 'a.m4a'), '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', path.join(p, 'work', 'main.mp4')]);
  const v1 = writeJson(path.join(root, 'realw.v1.json'), { version: '1', timebase: '30/1', chunks: [[0, 140, 99999], [140, 100000, 1]] });
  const P = { project: p };
  const r = await F.speechWhisper(P, path.join(p, 'work', 'main.mp4'), { v1 });
  assert.ok(r.mappable);
  assert.ok(r.words[0].start >= 4.5, JSON.stringify(r.words.slice(0, 3)));
  assert.ok(!fs.existsSync(path.join(p, 'work', '.cache', 'whisper')), '暫存的聲音檔清掉');
});

// ---------- 講稿外：字數判斷 ----------
const LINES = ['大家好歡迎來到工程師下班有約', '現在當手機掃碼連上電腦後就能即時顯示拍攝畫面', '接著我們來看第二個痛點多支手機無法同時開始與停止', '這套工具需要節點二十四以上的版本才能執行', '安裝完成後要重新開一個終端機來安裝最新的版本'];

test('ng-scan 講稿外：字數接近（whisper 聽錯）→ real 否；講稿字數遠少（多講一段）→ real，時間碼只含多講的字；片頭片尾也看', () => {
  let t = 0;
  const seq = (s, gap = 0) => { t += gap; const w = say(s, t); t += [...s].length * 0.2; return w; };
  // 第 2 行有 12 個字被 whisper 聽錯（字數一樣）；第 3、4 行之間多講一段；片頭試音；片尾自言自語
  const garbled = `${LINES[1].slice(0, 6)}快速顯示手機電腦都行的樣子${LINES[1].slice(18)}`;
  const aside = '不好意思手機剛剛響了我們等一下再繼續講下去';
  const words = [...seq('好三二一準備開始囉'), ...seq(LINES[0], 0.5), ...seq(garbled, 0.3), ...seq(LINES[2], 0.3), ...seq(aside, 0.3), ...seq(LINES[3], 0.3), ...seq(LINES[4], 0.3), ...seq('好這樣應該可以了吧收工', 1)];
  const r = M.ngScanRows(words, { lines: LINES });
  assert.deepEqual(r.ng, [], '沒有重講');
  const real = r.outside.filter((u) => u.real);
  assert.deepEqual(real.map((u) => u.text.slice(0, 4)), ['好三二一', '不好意思', '好這樣應'], JSON.stringify(r.outside));
  const mid = real[1];
  assert.ok(mid.text.includes('不好意思手機剛剛響了') && mid.tChars - mid.sChars >= 6, JSON.stringify(mid));
  const asideStart = words.find((w) => w.text === '不').start;
  assert.ok(Math.abs(mid.start - asideStart) <= 0.4, `多講的起點 ${mid.start} vs ${asideStart}`);
  assert.equal(real[0].start, 0, '片頭從第一個字起');
  // 聽錯的不是 real（字數一樣），列在 outside 給 ng-scan.md 看
  assert.ok(r.outside.some((u) => !u.real && Math.abs(u.tChars - u.sChars) <= 2), JSON.stringify(r.outside));
});

test('ng-scan：重講的字不算講稿外；講稿字數略少（改幾個字）不算', () => {
  let t = 0;
  const seq = (s, gap = 0) => { t += gap; const w = say(s, t); t += [...s].length * 0.2; return w; };
  const words = [...seq(LINES[0]), ...seq(LINES[1].slice(0, 16), 0.5), ...seq(LINES[1], 0.8), ...seq(`${LINES[2].slice(0, 10)}其實${LINES[2].slice(10)}`, 0.3), ...seq(LINES[3], 0.3)];
  const r = M.ngScanRows(words, { lines: LINES });
  assert.equal(r.ng.length, 1, JSON.stringify(r.ng));
  assert.deepEqual(r.outside.filter((u) => u.real), [], JSON.stringify(r.outside));
});

test('ng-scan 沒講稿：講到一半卡住重講也算候選；不相干的句子不算', () => {
  const w = [...say('今天要分享一個', 0), ...say('今天要分享一個超好用的工具', 2), ...say('我們直接開始看怎麼安裝', 6), ...say('安裝完成之後打開設定頁', 9)];
  const r = M.ngScanRows(w, { lines: null });
  assert.equal(r.ng.length, 1, JSON.stringify(r.ng));
  assert.equal(r.ng[0].text, '今天要分享一個');
});

test('ng-scan：短的重講（前一次不到 8 字，錨點跳不回來）也抓得到；whisper 兩次聽錯同樣的字也算；講稿本來就重複的不算', () => {
  let t = 0;
  const seq = (s, gap = 0) => { t += gap; const w = say(s, t); t += [...s].length * 0.2; return w; };
  const words = [...seq(LINES[0]), ...seq('但畢竟手', 0.3), ...seq('但畢竟手機畫面較小沒辦法看清楚', 0.8), ...seq(LINES[3], 0.3)];
  const lines = [LINES[0], '但畢竟手機畫面較小沒辦法看清楚', LINES[3]];
  const r = M.ngScanRows(words, { lines });
  assert.equal(r.ng.length, 1, JSON.stringify(r.ng));
  assert.equal(r.ng[0].text, '但畢竟手');
  assert.equal(r.ng[0].line, 2);
  assert.equal(r.ng[0].repeat, 4);
  assert.match(F.cutRows({ ...r, script: { lines } })[0].pending, /重複的字很少/, '只重複 4 字：待確認');
  assert.deepEqual(r.outside.filter((u) => u.real), []);
  // 兩次都聽成「購」：對講稿對不到，自己比自己比得到
  t = 0;
  const heard = [...seq(LINES[0]), ...seq('回購圖頁按重新連接', 0.3), ...seq('回購圖頁按重新連接可保留拖好的框', 0.8), ...seq(LINES[3], 0.3)];
  const r2 = M.ngScanRows(heard, { lines: [LINES[0], '回構圖頁按重新連接可保留拖好的框', LINES[3]] });
  assert.deepEqual(r2.ng.map((g) => g.text), ['回購圖頁按重新連接']);
  // 講稿這裡本來就講兩次：逐字稿沒有比講稿多字，不算
  t = 0;
  const same = [...seq(LINES[0]), ...seq('重點是先存檔重點是先存檔', 0.3), ...seq(LINES[3], 0.3)];
  assert.deepEqual(M.ngScanRows(same, { lines: [LINES[0], '重點是先存檔重點是先存檔', LINES[3]] }).ng, []);
  // 沒講稿：卡住那次和上一句黏在一起（切句比不出來）→ 字元層級也抓得到
  t = 0;
  const glued = [...seq('前一句的結尾今天要分享一個'), ...seq('今天要分享一個超好用的工具', 0.1), ...seq('我們直接開始看怎麼安裝', 1)];
  assert.deepEqual(M.ngScanRows(glued, { lines: null }).ng.map((g) => g.text), ['今天要分享一個']);
});

test('chapterKeep：表上時間比長停頓的終點晚一點點 → 用這個停頓，不要跳到句中的小停頓', () => {
  const sil = [[506.3, 511.67], [514.47, 514.77]];
  const [c] = M.chapterKeep([{ row: 1, title: 'x', t: 511.86 }], sil, 0.15);
  assert.equal(c.sil[1], 511.67);
  assert.equal(c.short, false);
  const [d] = M.chapterKeep([{ row: 1, title: 'x', t: 511.86 }], [[511.2, 511.67], [514.47, 514.77]], 0.15);
  assert.equal(d.sil[1], 514.77, '前面只是小停頓：照原本往後找');
});

// ---------- cuts.md ----------
test('cutRows／cutsMarkdown：重講 [x]、講稿外 [ ]＋待確認、沒講稿全部待確認；寫出來 parseCutsMd、ng-snap 讀得懂；一項都沒有寫「- 無」', () => {
  const scan = { script: { lines: ['x'] }, ng: [{ start: 12.4, end: 15.1, text: '今天|要', line: 3, again: 15.1 }], outside: [{ start: 5, end: 8, text: '多講的話', tChars: 12, sChars: 1, real: true, line: 2 }, { start: 30, end: 33, text: '聽錯', tChars: 12, sChars: 12, real: false, line: 9 }] };
  const rows = F.cutRows(scan);
  assert.deepEqual(rows.map((r) => [r.start, r.cut]), [[5, false], [12.4, true]]);
  const md = F.cutsMarkdown({ rows, chapters: [{ title: '痛點', first: '第一句', t: 41.2 }], decide: [] });
  assert.match(md, /\| 剪 \| 時間碼 \| 內容 \| 原因 \| 待確認 \|/);
  assert.match(md, /## 需要你決定\n\n- 無\n/);
  const cm = M.parseCutsMd(md);
  assert.deepEqual(cm.errors, []);
  assert.deepEqual(cm.ng.map((r) => [r.row, r.cut, r.pending, r.start, r.end]), [[1, false, true, 5, 8], [2, true, false, 12.4, 15.1]]);
  assert.equal(cm.ng[1].text, '今天|要', '表格分隔字元有跳脫');
  assert.deepEqual(cm.chapters.map((c) => [c.title, c.t]), [['痛點', 41.2]]);
  const none = F.cutRows({ ng: [{ start: 1, end: 2, text: 'a', line: null, again: 2 }], outside: [], script: null });
  assert.equal(none[0].cut, true);
  assert.match(none[0].pending, /沒有講稿/);
  assert.deepEqual(F.parseDecide('## 需要你決定\n\n- ⚠ 第一項\n- 第二項\n\n## 別的\n- 不算\n'), ['⚠ 第一項', '第二項']);
  assert.deepEqual(F.parseDecide('## 需要你決定\n\n- 無\n'), []);
});

test('cutStats：剪掉比例過高才標；NG 剪掉的不算停頓', () => {
  const v1 = { chunks: [[0, 30, 99999], [30, 300, 1], [300, 600, 99999], [600, 900, 1]] };
  assert.equal(F.cutStats(v1, 30, 100, 90, []).high, false);
  assert.equal(F.cutStats(v1, 30, 100, 50, []).high, true, '停頓剪掉一半');
  const ng = F.cutStats(v1, 30, 100, 50, [[0, 45]]);
  assert.equal(ng.high, false, '大部分是打勾的 NG（重講很多次）：不是門檻太嚴');
  assert.equal(ng.segments, 2);
  assert.equal(F.cutStats(v1, 30, 100, 30, [[0, 65]]).high, true, '整支剪掉超過 60%');
});

test('whisperEnv：Mac 預設帶 GGML_METAL_BF16_DISABLE=1（使用者自己設了就不蓋），其他平台不帶', () => {
  assert.equal(F.whisperEnv('darwin', {}).GGML_METAL_BF16_DISABLE, '1');
  assert.equal(F.whisperEnv('darwin', { GGML_METAL_BF16_DISABLE: '0' }).GGML_METAL_BF16_DISABLE, '0');
  assert.equal(F.whisperEnv('win32', {}).GGML_METAL_BF16_DISABLE, undefined);
  assert.equal(F.whisperEnv('linux', { AUTO_EDIT_JOB: 'prep' }).AUTO_EDIT_JOB, undefined, '子行程不繼承背景工作的標記');
});

// ---------- prep ＋ rough 端到端 ----------
const SCRIPT = ['# 示範稿', '', '## 開場', '', '大家好歡迎來到工程師下班有約', '今天要介紹一個節省時間的工具', '', '## 操作', '', '先打開設定頁面按下新增專案', '接著選擇要用的解析度', ''].join('\n');
// 原片（秒）：1–4 第一行；4.5–7.5 第二行；7.5 起第三行前半（講到一半卡住）；10.2–13 重講第三行、13–15 第四行
function e2eProject(name) {
  const p = mkProj(name);
  talkClip(path.join(p, 'assets', 'camera', 'a.mp4'), 18, [[1, 4], [4.3, 7.2], [7.8, 9.2], [12.5, 15.4], [15.7, 17.5]]);
  fs.writeFileSync(path.join(p, '講稿.md'), SCRIPT);
  return p;
}
const e2eWords = () => [
  ...say('大家好歡迎來到工程師下班有約', 1, 0.2),
  ...say('今天要介紹一個節省時間的工具', 4.3, 0.2),
  ...say('先打開設定頁面', 7.8, 0.2),
  ...say('先打開設定頁面按下新增專案', 12.5, 0.2),
  ...say('接著選擇要用的解析度', 15.7, 0.18),
];

test('prep（--no-editor、假逐字稿）：一條指令到停點 ①；cuts.md、ng-scan.md、製作進度都寫好；再跑一次不覆蓋使用者的勾選', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = e2eProject('flow');
  const tj = writeJson(path.join(root, 'flow-words.json'), e2eWords());
  const r = cli(['prep', '--no-editor', '--transcript', tj], 'flow');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = r.stdout.trim().split('\n');
  assert.equal(out.slice(-2).join('\n'), '⏸ 停點 ① 剪輯清單｜請看 work/cuts.md\n請回：勾好後說「可以」，或要改的列');
  assert.match(r.stdout, /✓ 主軌：work\/main\.mp4（真人 1 支/);
  assert.match(r.stdout, /✓ 剪輯清單：work\/cuts\.md（NG 1 列/);
  assert.ok(out.length <= 15, `輸出太多（${out.length} 行）：\n${r.stdout}`);
  const cuts = fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8');
  const cm = M.parseCutsMd(cuts);
  assert.deepEqual(cm.errors, []);
  assert.deepEqual(cm.ng.map((x) => x.cut), [true]);
  assert.ok(Math.abs(cm.ng[0].start - 7.8) < 0.3 && Math.abs(cm.ng[0].end - 12.5) < 0.3, JSON.stringify(cm.ng[0]));
  assert.deepEqual(cm.chapters.map((c) => c.title), ['操作'], '影片第一句就是章節開頭：不留空檔');
  assert.ok(fs.existsSync(path.join(p, 'work', 'transcript-main.json')));
  assert.ok(fs.existsSync(path.join(p, 'work', 'ng-scan.md')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(p, 'work', '.cache', 'transcript-main-of.json'), 'utf8')).mappable, true);
  assert.match(fs.readFileSync(path.join(p, 'work', '製作進度.md'), 'utf8'), /\| ① 剪輯清單 \| 待回覆 \|/);
  // 使用者取消勾選後再跑一次：不重寫、不多記一列、照樣印停點
  fs.writeFileSync(path.join(p, 'work', 'cuts.md'), M.setCutChecks(cuts, { 1: false }));
  const again = cli(['prep', '--no-editor'], 'flow');
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /work\/cuts\.md 還是最新的，不重寫/);
  assert.match(again.stdout, /沿用/);
  assert.equal(M.parseCutsMd(fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8')).ng[0].cut, false, '使用者的勾選還在');
  assert.equal(fs.readFileSync(path.join(p, 'work', '製作進度.md'), 'utf8').match(/① 剪輯清單 \| 待回覆/g).length, 1);
  fs.writeFileSync(path.join(p, 'work', 'cuts.md'), cuts);   // 還原給下一個測試
});

test('rough：① 通過後一條指令到字幕與剪接點；有講稿換算逐字稿不重轉；紀錄通過、印回報數字；做完再跑要 --again', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = path.join(root, 'projects', 'flow');
  assert.ok(fs.existsSync(path.join(p, 'work', 'cuts.md')), '接上一個測試');
  const r = cli(['rough', '--no-editor', '--said', '可以'], 'flow');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of ['rough.mp4', 'cuts.v1.json', 'rough.srt', 'cutpoints.json', 'transcript.json']) assert.ok(fs.existsSync(path.join(p, 'work', f)), f);
  assert.ok(fs.readdirSync(path.join(p, 'work')).some((f) => f.startsWith('rough.srt.align-')), 'status 靠 rough.srt.align-* 知道 srt-align 跑過');
  assert.match(r.stdout, /✓ 逐字稿：main\.mp4 那份換算成 rough\.mp4 時間軸，不重轉/);
  assert.match(r.stdout, /初剪完成：原始 18\.\d+s → 初剪 [\d.]+s，剪掉 \d+ 段/);
  assert.match(r.stdout, /srt-align：共 \d+ 則（併 \d+ 次、拆出 \d+ 則）/);
  assert.match(r.stdout, /剪接點 \d+ 個：ng \d+、pause \d+/);
  assert.match(r.stdout, /驗證：work\/rough\.mp4 → [\d.]+s、320×180；verify-rough → ✓/);
  assert.match(r.stdout, /→ 下一步：接著做（有素材先盤點，再到 ② 構圖/);
  assert.match(r.stdout.trim().split('\n').at(-1), /status\.mjs --project/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p, 'work', 'hyperframes', 'plan.json'), 'utf8')), { version: 1 }, 'plan.json 先建起來，預覽改的字幕才有地方存');
  assert.match(fs.readFileSync(path.join(p, 'work', '製作進度.md'), 'utf8'), /\| ① 剪輯清單 \| 通過 \| 「可以」 \| work\/cuts\.md \|/);
  // 換算出來的逐字稿：NG 那次的字不見了，重講那次的時間接得上 rough.mp4
  const words = JSON.parse(fs.readFileSync(path.join(p, 'work', 'transcript.json'), 'utf8'));
  assert.equal(words.filter((w) => w.text === '按').length, 1);
  assert.equal(words.filter((w) => w.text === '先').length, 1, 'NG 那次的「先」丟掉了');
  const srt = fs.readFileSync(path.join(p, 'work', 'rough.srt'), 'utf8');
  assert.match(srt, /大家好歡迎來到工程師下班有約/);
  assert.match(srt, /先打開設定頁面按下新增專案/);
  // 主流程讀得到：cutpoints 差 0 格、rough 比原片短
  const cps = JSON.parse(fs.readFileSync(path.join(p, 'work', 'cutpoints.json'), 'utf8')).cuts;
  assert.ok(cps.some((c) => c.kind === 'ng'), JSON.stringify(cps));
  // 做完再跑：要 --again，不動字幕
  const before = fs.readFileSync(path.join(p, 'work', 'rough.srt'), 'utf8');
  const guard = cli(['rough', '--no-editor'], 'flow');
  assert.equal(guard.status, 1);
  assert.match(guard.stdout, /✖ 初剪已經做完了.*--again/);
  assert.equal(fs.readFileSync(path.join(p, 'work', 'rough.srt'), 'utf8'), before);
  // --again：清單沒變就不重新輸出影片，只重排字幕（舊字幕有備份）
  const mt = fs.statSync(path.join(p, 'work', 'rough.mp4')).mtimeMs;
  const n0 = fs.readdirSync(path.join(p, 'work')).filter((f) => f.startsWith('rough.srt.align-')).length;
  const again = cli(['rough', '--no-editor', '--again'], 'flow');
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /參數和清單都沒變，沿用/);
  assert.equal(fs.statSync(path.join(p, 'work', 'rough.mp4')).mtimeMs, mt);
  assert.ok(fs.readdirSync(path.join(p, 'work')).filter((f) => f.startsWith('rough.srt.align-')).length >= n0);
  // 清單改了：沒有 --again 不蓋 rough.mp4；--again 重新輸出
  const md = fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8');
  fs.writeFileSync(path.join(p, 'work', 'cuts.md'), M.setCutChecks(md, { 1: false }));
  const changed = cli(['rough'], 'flow');
  assert.equal(changed.status, 1);
  assert.match(changed.stdout, /✖ 初剪已經做完了/);
  const recut = cli(['rough', '--again'], 'flow');
  assert.equal(recut.status, 0, recut.stdout + recut.stderr);
  assert.match(recut.stdout, /✓ 初剪：work\/rough\.mp4、work\/cuts\.v1\.json（用 /);
  assert.ok(fs.statSync(path.join(p, 'work', 'rough.mp4')).mtimeMs > mt, '重新輸出了');
  assert.equal(JSON.parse(fs.readFileSync(path.join(p, 'work', 'transcript.json'), 'utf8')).filter((w) => w.text === '先').length, 2, '沒有 NG 要剪：兩次的字都留著');
  fs.writeFileSync(path.join(p, 'work', 'cuts.md'), md);
  // prep：已經有 rough.mp4 → 先問；--again 才重來（rough.mp4 改名留著）
  const pg = cli(['prep', '--no-editor'], 'flow');
  assert.equal(pg.status, 1);
  assert.match(pg.stdout, /✖ work\/rough\.mp4 已經存在（初剪做過了）→ 先問使用者要不要重剪/);
});

test('rough：transcript-main.json 不能換算（media.mjs transcribe 直接轉整支的）→ 走對 rough.mp4 轉的路（--transcript 代替 whisper）', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = e2eProject('flowplain');
  assert.equal(cli(['prep', '--no-editor', '--transcript', writeJson(path.join(root, 'plain.json'), e2eWords())], 'flowplain').status, 0);
  fs.writeFileSync(path.join(p, 'work', '.cache', 'transcript-main-of.json'), JSON.stringify({ mappable: false }));
  const rw = [...say('大家好歡迎來到工程師下班有約', 0.3, 0.2), ...say('今天要介紹一個節省時間的工具', 3.2, 0.2), ...say('先打開設定頁面按下新增專案', 7, 0.2), ...say('接著選擇要用的解析度', 10, 0.18)];
  const r = cli(['rough', '--transcript', writeJson(path.join(root, 'plain-r.json'), rw)], 'flowplain');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ 逐字稿：對 rough\.mp4 轉/);
});

test('rough：剪輯清單頁已經開著（正常流程）→ 一樣印字幕預覽網址，指向同一個剪輯台', { skip: !hasAe && '沒有 auto-editor' }, async (t) => {
  const p = e2eProject('flowopen');
  const run = (tool, ...args) => spawnSync(process.execPath, [tool, ...args, '--template', tpl, '--project', 'projects/flowopen'], { encoding: 'utf8', cwd: root });
  t.after(() => { run(path.join(TOOLS, 'editor.mjs'), '--stop'); });
  const pr = run(MEDIA, 'prep', '--transcript', writeJson(path.join(root, 'open.json'), e2eWords()));
  assert.equal(pr.status, 0, pr.stdout + pr.stderr);
  const cuts = pr.stdout.match(/https?:\/\/\S+\/cuts/)?.[0];
  assert.ok(cuts, pr.stdout);
  const r = run(MEDIA, 'rough', '--said', '可以');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const url = r.stdout.match(/字幕預覽：(\S+)/)?.[1];
  assert.ok(url, r.stdout);
  assert.equal(new URL('cuts', url).href, cuts, '沿用開著的那一個');
  const state = await (await fetch(new URL('api/state', url))).json();
  assert.equal(state.plan.exists, true);
  assert.ok(state.video?.url);
  // plan.json 提早建好，下一步還是構圖，也還能產生分鏡素材
  const st = spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', 'projects/flowopen'], { encoding: 'utf8', cwd: root });
  assert.match(st.stdout, /剪好看／構圖/, st.stdout);
  const sc = run(path.join(TOOLS, 'build.mjs'), '--scaffold');
  assert.equal(sc.status, 0, sc.stdout + sc.stderr);
  assert.ok(fs.existsSync(path.join(p, 'work', '分鏡素材', 'index.json')), sc.stdout);
  // 底片在背景處理：等它跑完才收拾暫存資料夾
  const { jobState } = await import(path.join(TOOLS, 'lib', 'job.mjs'));
  const until = Date.now() + 60000;
  while (Date.now() < until && jobState(p, 'prepare').state === 'running') await new Promise((ok) => setTimeout(ok, 200));
  assert.notEqual(jobState(p, 'prepare').state, 'running');
});

test('rough：直式專案建的 plan.json 帶 format，後面的 build 不會說版式對不上', { skip: !hasAe && '沒有 auto-editor' }, async () => {
  const p = mkProj('flowportrait');
  talkClip(path.join(p, 'assets', 'camera', 'a.mp4'), 18, [[1, 4], [4.3, 7.2], [7.8, 9.2], [12.5, 15.4], [15.7, 17.5]], '180x320');
  fs.writeFileSync(path.join(p, '講稿.md'), SCRIPT);
  assert.equal(cli(['prep', '--no-editor', '--transcript', writeJson(path.join(root, 'portrait.json'), e2eWords())], 'flowportrait').status, 0);
  const r = cli(['rough', '--said', '可以'], 'flowportrait');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const plan = JSON.parse(fs.readFileSync(path.join(p, 'work', 'hyperframes', 'plan.json'), 'utf8'));
  assert.deepEqual(plan, { version: 1, format: 'portrait' });
  const { formatErrors } = await import(path.join(TOOLS, 'lib', 'canvas.mjs'));
  assert.match(fs.readFileSync(path.join(p, 'work', '製作進度.md'), 'utf8'), /版式[^\n]*直式/, '開工決策表是直式，才驗得到對不上');
  assert.deepEqual(formatErrors({ projectDir: p, plan, format: 'portrait', dims: { w: 180, h: 320 } }), []);
  const st = spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', 'projects/flowportrait'], { encoding: 'utf8', cwd: root });
  assert.doesNotMatch(st.stdout + st.stderr, /沒寫 format/);
  const sc = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--scaffold', '--template', tpl, '--project', 'projects/flowportrait'], { encoding: 'utf8', cwd: root });
  assert.equal(sc.status, 0, sc.stdout + sc.stderr);
  assert.doesNotMatch(sc.stdout + sc.stderr, /沒寫 format|版式.*對不上/);
  // --scaffold 也會在背景處理底片：等它跑完才收拾暫存資料夾
  const { jobState } = await import(path.join(TOOLS, 'lib', 'job.mjs'));
  const until = Date.now() + 60000;
  while (Date.now() < until && jobState(p, 'prepare').state === 'running') await new Promise((ok) => setTimeout(ok, 200));
  assert.notEqual(jobState(p, 'prepare').state, 'running');
});

test('rough：verify-rough ✖ 就停、印修法與重做指令；不寫字幕與剪接點', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = e2eProject('flowbad');
  const tj = writeJson(path.join(root, 'flowbad-words.json'), e2eWords());
  assert.equal(cli(['prep', '--no-editor', '--transcript', tj], 'flowbad').status, 0);
  // 假的 auto-editor：輸出全黑的 rough.mp4（模擬初剪壞掉），v1 照實寫
  const bin = path.join(root, 'bin-black');
  fs.mkdirSync(bin, { recursive: true });
  const real = spawnSync('which', ['auto-editor'], { encoding: 'utf8' }).stdout.trim();
  const fake = `#!/bin/sh\nfor a in "$@"; do if [ "$a" = "--export" ]; then exec "${real}" "$@"; fi; done\nout=""\nwhile [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; fi; shift; done\nexec ffmpeg -y -v error -f lavfi -i color=c=black:s=320x180:r=30:d=6 -f lavfi -i "sine=frequency=440:sample_rate=48000:d=6" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "$out"\n`;
  fs.writeFileSync(path.join(bin, 'auto-editor'), fake, { mode: 0o755 });
  const r = spawnSync(process.execPath, [MEDIA, 'rough', '--no-editor', '--template', tpl, '--project', 'projects/flowbad'], { encoding: 'utf8', cwd: root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✖ work\/rough\.mp4 有 \d+ 段黑畫面.*初剪壞了/);
  assert.match(r.stdout, /1\. node shared\/template\/tools\/media\.mjs main/);
  const last = r.stdout.trim().split('\n');
  assert.match(last.at(-2), /→ 下一步：/);
  assert.match(last.at(-1), /^node shared\/template\/tools\/media\.mjs rough --project projects\/flowbad --again$/);
  assert.ok(!fs.existsSync(path.join(p, 'work', 'cutpoints.json')));
});

test('rough：剪掉比例過高 → ⚠（不擋），修法是 --edit 放寬重跑', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = mkProj('flowhigh');
  talkClip(path.join(p, 'assets', 'camera', 'a.mp4'), 20, [[1, 3], [10, 11]]);   // 20 秒只有 3 秒有聲音
  fs.writeFileSync(path.join(p, '講稿.md'), '# 稿\n\n大家好歡迎來到工程師下班有約\n');
  assert.equal(cli(['prep', '--no-editor', '--transcript', writeJson(path.join(root, 'high.json'), say('大家好歡迎來到工程師下班有約', 1, 0.14))], 'flowhigh').status, 0);
  const r = cli(['rough'], 'flowhigh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /⚠ 剪掉比例過高：0:20\.\d+ → .*--edit "audio:-26dB" --again/);
  assert.match(r.stdout, /→ 下一步：接著做（有素材先盤點，再到 ② 構圖/);
  assert.match(r.stdout.trim().split('\n').at(-1), /status\.mjs --project/);
});

test('rough：沒有講稿 → 不換算（對 rough.mp4 的逐字稿）；prep 的候選全部待確認', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = mkProj('flowns');
  talkClip(path.join(p, 'assets', 'camera', 'a.mp4'), 12, [[1, 3], [4.2, 7.5], [8.2, 11]]);
  const words = [...say('今天要分享一個超好用的工具', 1, 0.15), ...say('今天要分享一個超好用的免費工具', 4.2, 0.2), ...say('我們開始吧大家準備好', 8.2, 0.25)];
  const r = cli(['prep', '--no-editor', '--transcript', writeJson(path.join(root, 'ns.json'), words)], 'flowns');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /沒有講稿：相鄰句相似度找的候選，全部待確認/);
  const cm = M.parseCutsMd(fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8'));
  assert.equal(cm.ng.length, 1);
  assert.ok(cm.ng[0].pending && cm.ng[0].cut);
  assert.match(fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8'), /第 1 列（.*）待確認：沒有講稿/);
  // rough：--transcript 給 rough.mp4 秒數的逐字稿，字幕照子句切
  const rw = [...say('今天要分享一個超好用的免費工具', 0.3, 0.2), ...say('我們開始吧大家準備好', 3.6, 0.25)];
  const rr = cli(['rough', '--transcript', writeJson(path.join(root, 'ns-rough.json'), rw)], 'flowns');
  assert.equal(rr.status, 0, rr.stdout + rr.stderr);
  assert.match(rr.stdout, /✓ 逐字稿：對 rough\.mp4 轉.*沒有講稿/);
  assert.match(fs.readFileSync(path.join(p, 'work', 'rough.srt'), 'utf8'), /今天要分享一個超好用的免費工具/);
});

test('prep：多支主軌沒給 --order → 照檔名接；有講稿時用 scriptOrder 建議順序寫進 cuts.md；給 --order 重接、重寫清單、舊清單備份、紀錄修改後重停', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = mkProj('flowmulti');
  talkClip(path.join(p, 'assets', 'camera', 'b1.mp4'), 5, [[0.5, 4.5]]);
  talkClip(path.join(p, 'assets', 'camera', 'b2.mp4'), 5, [[0.5, 4.5]]);
  fs.writeFileSync(path.join(p, '講稿.md'), ['# 稿', '', '大家好歡迎來到工程師下班有約', '接著選擇要用的解析度然後按下確認'].join('\n'));
  // 檔名順序 b1 → b2，但 b1 講的是第二行、b2 講的是第一行
  const words = [...say('接著選擇要用的解析度然後按下確認', 0.5, 0.2), ...say('大家好歡迎來到工程師下班有約', 5.5, 0.2)];
  const tj = writeJson(path.join(root, 'multi.json'), words);
  const r = cli(['prep', '--no-editor', '--transcript', tj], 'flowmulti');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const cuts = fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8');
  assert.match(cuts, /## 主軌順序/);
  assert.match(cuts, /現在照檔名接（2 支）。照講稿比對，建議順序：b2\.mp4 → b1\.mp4/);
  assert.match(cuts, /\| 1 \| assets\/camera\/b1\.mp4 \| 0:05\.00 \| 2–2 \| 2 \|/);
  assert.match(cuts, /⚠ 主軌順序和講稿不同：照講稿應該是 b2\.mp4 → b1\.mp4 .*prep --project projects\/flowmulti --order "assets\/camera\/b2\.mp4,assets\/camera\/b1\.mp4"/);
  assert.match(r.stdout, /需要你決定 \d+ 項/);
  // 使用者說照講稿順序
  const swapped = [...say('大家好歡迎來到工程師下班有約', 0.5, 0.2), ...say('接著選擇要用的解析度然後按下確認', 5.5, 0.2)];
  const o = cli(['prep', '--no-editor', '--order', 'assets/camera/b2.mp4,assets/camera/b1.mp4', '--transcript', writeJson(path.join(root, 'multi2.json'), swapped)], 'flowmulti');
  assert.equal(o.status, 0, o.stdout + o.stderr);
  const clips = JSON.parse(fs.readFileSync(path.join(p, 'work', 'main.json'), 'utf8')).clips;
  assert.deepEqual(clips.map((c) => c.file), ['assets/camera/b2.mp4', 'assets/camera/b1.mp4']);
  assert.ok(fs.readdirSync(path.join(p, 'work')).some((f) => f.startsWith('cuts.md.bak-')), '舊清單備份');
  const log = fs.readFileSync(path.join(p, 'work', '製作進度.md'), 'utf8');
  assert.match(log, /① 剪輯清單 \| 修改後重停/);
  assert.equal(log.match(/① 剪輯清單 \| 待回覆/g).length, 2);
  assert.doesNotMatch(fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8'), /主軌順序和講稿不同/);
  // 再跑一次不給 --order：沿用這次的順序，不重接
  const keep = cli(['prep', '--no-editor'], 'flowmulti');
  assert.equal(keep.status, 0, keep.stdout + keep.stderr);
  assert.match(keep.stdout, /沿用現成的/);
});

test('prep --skip-stop（使用者說不用停）：待確認的列不剪、紀錄略過、下一步是 rough', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = e2eProject('flowskip');
  const words = e2eWords();
  // 多講一段（講稿外）
  words.push(...say('好這樣應該可以了吧我們收工', 17.5, 0.1));
  const r = cli(['prep', '--no-editor', '--skip-stop', '--transcript', writeJson(path.join(root, 'skip.json'), words)], 'flowskip');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /⏭ 停點 ① 略過/);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.at(-2), '→ 下一步：輸出初剪、字幕、剪接點');
  assert.equal(lines.at(-1), 'node shared/template/tools/media.mjs rough --project projects/flowskip');
  assert.match(fs.readFileSync(path.join(p, 'work', '製作進度.md'), 'utf8'), /① 剪輯清單 \| 略過/);
  const cm = M.parseCutsMd(fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8'));
  assert.ok(cm.ng.filter((x) => x.pending).every((x) => !x.cut));
});

test('prep：--wait 0 開了就回（結束碼 75、最後一行是同一條指令）；再跑一次接著等、不重跑', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = e2eProject('flowjob');
  const tj = writeJson(path.join(root, 'job.json'), e2eWords());
  const r = cli(['prep', '--no-editor', '--wait', '0', '--transcript', tj], 'flowjob');
  assert.equal(r.status, 75, r.stdout + r.stderr);
  const last = r.stdout.trim().split('\n').at(-1);
  assert.match(last, /^node .*media\.mjs prep --no-editor --wait 0 --transcript /);
  const w = cli(['prep', '--no-editor', '--transcript', tj], 'flowjob');
  assert.equal(w.status, 0, w.stdout + w.stderr);
  assert.match(w.stdout, /⏸ 停點 ① 剪輯清單/);
  const st = JSON.parse(fs.readFileSync(path.join(p, 'work', '.jobs', 'prep.json'), 'utf8'));
  assert.equal(st.state, 'done');
  assert.equal(fs.readFileSync(path.join(p, 'work', '製作進度.md'), 'utf8').match(/① 剪輯清單 \| 待回覆/g).length, 1, '只跑了一次');
});

test('prep：開工決策表、停點紀錄之外，素材同時掃好（圖片 contact sheet、一行統計）', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = e2eProject('flowscan');
  ff(['-f', 'lavfi', '-i', 'color=c=0x3B82F6:s=400x300', '-frames:v', '1', path.join(p, 'assets', 'images', '架構圖.png')]);
  const r = cli(['prep', '--no-editor', '--transcript', writeJson(path.join(root, 'scan.json'), e2eWords())], 'flowscan');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ 素材：螢幕錄影 0 支、圖片 1 張（contact sheet 1 張/);
  assert.ok(fs.existsSync(path.join(p, 'work', 'media', 'images', 'sheet-01.jpg')));
  assert.ok(fs.existsSync(path.join(p, 'work', 'media', 'index.md')));
  const again = cli(['prep', '--no-editor'], 'flowscan');
  assert.match(again.stdout, /沒換，沿用/);
});

test('prep：純聲音主軌又沒有任何素材 → ① 就提醒', { skip: !hasAe && '沒有 auto-editor' }, () => {
  const p = mkProj('flowvoice');
  ff(['-f', 'lavfi', '-i', "aevalsrc='0.4*sin(2*PI*440*t)*(between(t,0.5,5)+between(t,6,9))':s=48000:d=10", '-c:a', 'aac', path.join(p, 'assets', 'voice', 'v.m4a')]);
  const r = cli(['prep', '--no-editor', '--transcript', writeJson(path.join(root, 'voice.json'), say('今天要分享一個超好用的工具', 0.5, 0.3))], 'flowvoice');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8'), /主軌有 0:10\.00 只有聲音，assets\/screen\/、assets\/images\/ 都是空的/);
  // 只有聲音的主軌：黑畫面是配的（verify-rough ✓），沒有構圖這一步
  const rr = cli(['rough', '--transcript', writeJson(path.join(root, 'voice-r.json'), say('今天要分享一個超好用的工具', 0.2, 0.3))], 'flowvoice');
  assert.equal(rr.status, 0, rr.stdout + rr.stderr);
  assert.match(rr.stdout, /verify-rough → ✓ 黑畫面 \d+ 段，原片同位置也是黑的/);
  assert.match(rr.stdout, /主軌沒有真人畫面，不用構圖/);
  assert.match(rr.stdout.trim().split('\n').at(-1), /status\.mjs --project/);
});

test('prep：開剪輯清單頁（真的啟動 editor.mjs）→ 停點那一行是網址', { skip: !hasAe && '沒有 auto-editor' }, () => {
  e2eProject('flowpage');
  const r = cli(['prep', '--transcript', writeJson(path.join(root, 'page.json'), e2eWords())], 'flowpage');
  try {
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout.trim().split('\n').slice(-2).join('\n'), /^⏸ 停點 ① 剪輯清單｜請看 http:\/\/127\.0\.0\.1:\d+\/cuts\n請回：勾好後說「可以」，或要改的列$/);
  } finally {
    spawnSync(process.execPath, [path.join(TOOLS, 'editor.mjs'), '--stop', '--template', tpl, '--project', 'projects/flowpage'], { encoding: 'utf8', cwd: root });
  }
});

test('rough：還沒有 cuts.md ✖ 指向 prep；transcribe：沒有 main.mp4 ✖、--file 找不到 ✖', () => {
  mkProj('flowempty');
  const r = cli(['rough'], 'flowempty');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✖ 找不到 work\/cuts\.md → 先跑 node shared\/template\/tools\/media\.mjs prep --project projects\/flowempty/);
  const t = cli(['transcribe'], 'flowempty');
  assert.equal(t.status, 1);
  assert.match(t.stdout, /✖ 找不到 work\/main\.mp4 → 先跑 node shared\/template\/tools\/media\.mjs main/);
  const f = cli(['transcribe', '--file', 'work/沒有.mp4'], 'flowempty');
  assert.equal(f.status, 1);
  assert.match(f.stdout, /✖ 找不到 --file「work\/沒有\.mp4」/);
  const bad = cli(['prep', '--wait', 'abc'], 'flowempty');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--wait 要是秒數/);
  const none = cli(['prep', '--no-editor'], 'flowempty');
  assert.equal(none.status, 1);
  assert.match(none.stdout, /assets\/camera\/ 和 assets\/voice\/ 都是空的/);
});

// ---------- scan：圖片 contact sheet、只印一行 ----------
test('scan：圖片每 12 張一頁、每格標檔名、寫進 index.md／index.json；只印統計一行；同時跑多支錄影', async () => {
  const p = mkProj('scanimg');
  for (let i = 1; i <= 14; i++) ff(['-f', 'lavfi', '-i', `color=c=0x${(0x202020 + i * 0x0a0a0a).toString(16)}:s=${200 + i * 10}x${150 + i * 5}`, '-frames:v', '1', path.join(p, 'assets', 'images', `截圖 ${String(i).padStart(2, '0')}.png`)]);
  for (const n of ['a', 'b', 'images']) ff(['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10:d=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(p, 'assets', 'screen', `${n}.mp4`)]);
  fs.writeFileSync(path.join(p, 'assets', 'images', '不支援.heic'), 'x');
  const r = cli(['scan'], 'scanimg');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = r.stdout.trim().split('\n');
  assert.equal(out.length, 2, r.stdout);   // 專案：… ＋ 統計一行
  assert.match(out[1], /^素材：螢幕錄影 3 支（contact sheet \d+ 張）、圖片 14 張（contact sheet 2 張.*⚠ 1 個檔格式不支援.* → 細節在 work\/media\/index\.md$/);
  const dir = path.join(p, 'work', 'media');
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  assert.deepEqual(j.images.sheets.map((s) => [s.file, s.cells.length]), [['work/media/images/sheet-01.jpg', 12], ['work/media/images/sheet-02.jpg', 2]]);
  const img = j.files.find((f) => f.src === 'assets/images/截圖 13.png');
  assert.deepEqual([img.sheet, img.cell, img.width], ['work/media/images/sheet-02.jpg', 13, 330]);
  assert.equal(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', path.join(dir, 'images', 'sheet-01.jpg')], { encoding: 'utf8' }).stdout.trim(), '1904');
  const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8');
  assert.match(md, /\| assets\/images\/截圖 13\.png \| 330×215 \| work\/media\/images\/sheet-02\.jpg #13 \|/);
  assert.match(md, /格式不支援.*\n\n- assets\/images\/不支援\.heic/);
  // 叫 images 的錄影不會和圖片的資料夾打架
  assert.ok(j.files.find((f) => f.src === 'assets/screen/images.mp4').sheets[0].file.startsWith('work/media/images.mp4/'));
  if (await hasChrome()) assert.equal(j.images.labels, 'filename');
  assert.equal(M.scanFresh({ project: p }), true);
  // 沒有 Chrome：每格只標 #格號，index.md 有對照
  const P = { project: p, templateDir: TEMPLATE };
  const j2 = await M.scan(P, { chrome: false });
  assert.equal(j2.images.labels, 'number');
  assert.match(fs.readFileSync(path.join(dir, 'index.md'), 'utf8'), /每格上面是 #格號，對照下表/);
  assert.match(M.scanSummary(j2), /沒有 Chrome：每格只標 #格號/);
  // 少一張圖就不算新
  fs.rmSync(path.join(p, 'assets', 'images', '截圖 14.png'));
  assert.equal(M.scanFresh({ project: p }), false);
});

// ---------- frame 多個時間 ----------
test('frame --at 多個時間：同時截、每張一行；任一個超過素材長度 ✖；可以寫 1:03', () => {
  const p = mkProj('frames');
  ff(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=10:d=8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(p, 'assets', 'screen', 'rec.mp4')]);
  const r = cli(['frame', '--src', 'assets/screen/rec.mp4', '--at', '1,2.5,0:05', '--grid'], 'frames');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const n of ['rec-1s-grid.jpg', 'rec-2.5s-grid.jpg', 'rec-5s-grid.jpg']) assert.ok(fs.existsSync(path.join(p, 'work', 'media', 'frames', n)), n);
  assert.match(r.stdout, /共 3 張（320×180；格線每 100px/);
  const one = cli(['frame', '--src', 'assets/screen/rec.mp4', '--at', '3'], 'frames');
  assert.match(one.stdout, /→ .*rec-3s\.jpg（320×180；加 --grid 疊座標格線）/);
  const over = cli(['frame', '--src', 'assets/screen/rec.mp4', '--at', '1,30'], 'frames');
  assert.equal(over.status, 1);
  assert.match(over.stderr, /--at 30 超過素材長度 8s/);
  const bad = cli(['frame', '--src', 'assets/screen/rec.mp4', '--at', '1,abc'], 'frames');
  assert.match(bad.stderr, /--at 的「abc」看不懂/);
});

// ---------- srt-align 預設安靜 ----------
test('srt-align：預設只印有標記的列和統計，--verbose 才印每一則；長片最多 30 列', () => {
  const p = mkProj('quiet');
  const lines = Array.from({ length: 40 }, (_, i) => `這是第${i + 1}行講稿內容每一行都不太一樣${'甲乙丙丁戊己庚辛壬癸'[i % 10]}`);
  fs.writeFileSync(path.join(p, '講稿.md'), lines.join('\n'));
  let t = 0;
  const words = [];
  for (const l of lines) { words.push(...say(l, t, 0.2)); t += [...l].length * 0.2 + 1.5; }
  fs.writeFileSync(path.join(p, 'work', 'transcript.json'), JSON.stringify(words));
  const q = cli(['srt-align', '--dry-run'], 'quiet');
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.match(q.stdout, /共 \d+ 則/);
  assert.match(q.stdout, /加 --verbose 看每一則/);
  assert.ok(q.stdout.length < 800, `預設太長：${q.stdout.length}`);
  const v = cli(['srt-align', '--dry-run', '--verbose'], 'quiet');
  assert.match(v.stdout, /這是第17行講稿內容/);
  assert.ok(v.stdout.length > q.stdout.length * 3);
});

test('editForLevel：小聲的錄音靜音門檻自動降，音量正常用預設', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-level-'));
  const wav = (name, db) => { const f = path.join(dir, name); const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=1,volume=${db}dB`, f]); assert.equal(r.status, 0); return f; };
  try {
    assert.deepEqual(M.editForLevel(wav('loud.wav', 15)), { edit: M.CUT.edit, note: null });
    const quiet = M.editForLevel(wav('quiet.wav', -3));
    assert.match(quiet.edit, /^audio:-(3[0-9]|4[0-9])dB$/);
    assert.match(quiet.note, /很小聲/);
    assert.deepEqual(M.editForLevel(path.join(dir, '不存在.wav')), { edit: M.CUT.edit, note: null }, '量不到就用預設');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

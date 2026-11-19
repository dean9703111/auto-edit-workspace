// 055 包 B：錄影段的起始鏡位（start）、直式運鏡次數、黑底、推近切掉整頁、頁首、紅框和捲動、綁詞、最後一框多停、隱私、慢放捲動、停住太久、驗收截圖時間
// 直接呼叫 lib/media.mjs 的 checkMediaSeg／validateMedia（不跑 build）；錄影用 ffmpeg lavfi 現場產生，畫面事件（events.json）、盤點筆記手寫
import { test as nodeTest, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { TOOLS, missingTools, skipAll } from './helpers.mjs';

const noFf = await missingTools('ffmpeg');
const test = skipAll(nodeTest, noFf);
const L = await import(pathToFileURL(path.join(TOOLS, 'lib', 'media.mjs')).href);
const { canvasOf } = await import(pathToFileURL(path.join(TOOLS, 'lib', 'canvas.mjs')).href);
const { timeMap } = await import(pathToFileURL(path.join(TOOLS, 'lib', 'edit.mjs')).href);

let root, proj;
const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const rec = (name, size, rate = 30, sec = 20) => ff(['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${rate}`, '-t', String(sec), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', path.join(proj, 'assets', 'screen', name)]);
// 同一支 960×540 錄影複製成多個檔名：每個檔名各自一份 events.json
const NAMES = ['a', 'page', 'mark', 'd3', 'priv', 'slow', 'hold', 'hold2', 'cut', 'cut2'];
const events = (name, ev) => {
  const d = path.join(proj, 'work', 'media', name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'events.json'), JSON.stringify({ events: [], scrolls: [], ...ev }));
};
const full = [0, 0, 960, 540];

before(() => {
  if (noFf) return;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-media055-'));
  proj = path.join(root, 'projects', 'p1');
  fs.mkdirSync(path.join(proj, 'assets', 'screen'), { recursive: true });
  rec('a.mp4', '960x540');
  for (const n of NAMES.slice(1)) fs.copyFileSync(path.join(proj, 'assets', 'screen', 'a.mp4'), path.join(proj, 'assets', 'screen', `${n}.mp4`));
  rec('sq.mp4', '960x960', 30, 6);
  rec('hd.mp4', '1280x720', 30, 6);
  rec('fast.mp4', '320x180', 60, 10);
});
after(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

const tm = timeMap([], 60);
// 段在完成影片 10–20 秒（沒有剪接，rough 秒數＝完成影片秒數）
const run = (seg, { portrait = false, panel = true, start = 10, end = 20, cues = [] } = {}) => {
  const errs = [], warns = [];
  const s = { id: 'v01', type: 'media', ...seg, src: `assets/screen/${seg.src}` };
  const media = L.checkMediaSeg(s, { projectDir: proj, err: (x) => errs.push(x), warn: (x) => warns.push(x) });
  assert.ok(media, errs.join('\n'));
  const it = { id: s.id, seg: s, media, start, end, z: 20, enterFx: 'fade', exitFx: 'fade' };
  const r = L.validateMedia(it, { cues, tm, pipAt: () => panel, canvas: canvasOf(portrait ? 'portrait' : 'landscape'), err: (x) => errs.push(x), warn: (x) => warns.push(x) });
  return { it, m: media, r, errs, warns, w: warns.join('\n') };
};
const nextTrack = (() => { let n = 10; return () => n++; })();

test('Q2 start：直式第一格就推在那一塊（tl.set 在段起點、沒有補間；橫式改成先看全景再推近，066 另測）；報告、json；不再要求第一次運鏡在 0.8 秒後；段起點 0.2 秒硬推建議改成 start', () => {
  const a = run({ src: 'a.mp4', start: [240, 135, 480, 270] }, { portrait: true });
  assert.deepEqual(a.errs, []);
  assert.equal(a.m.start.z, 2);
  assert.ok(!a.m.start.cropped);
  assert.deepEqual(a.r.json.start, { z: 2, x: a.m.start.x, y: a.m.start.y });
  assert.equal(a.r.json.view.scale, +(a.m.geo.kx * 2).toFixed(3));
  assert.match(a.r.summary, /^起始鏡位 2 倍/);
  assert.equal(a.m.cams.length, 0);
  const parts = L.mediaParts({ ...a.it, pipIds: [] }, { nextTrack });
  assert.ok(parts.tl.includes(`tl.set('#mst-v01', { x: ${a.m.start.x}, y: ${a.m.start.y}, scale: 2, force3D: false }, 10);`), parts.tl.join('\n'));
  assert.ok(!parts.tl.some((x) => /tl\.(fromTo|to)\('#mst-v01'/.test(x)), '沒有推的動作');
  // start 之後再推：從 start 的鏡位出發（橫式第一個是開場推近，再來才是 moves）
  const b = run({ src: 'a.mp4', start: [240, 135, 480, 270], moves: [{ at: '+3', to: 'full' }] });
  assert.deepEqual(b.m.cams.find((c) => !c.open).from, { z: 2, x: b.m.start.x, y: b.m.start.y });
  // 第一次運鏡在段起點 0.2 秒就動：不再 ⚠「觀眾還沒看清全景」
  const c = run({ src: 'a.mp4', moves: [{ at: '+0.2', to: [240, 135, 480, 270], dur: 2.2 }] });
  assert.doesNotMatch(c.w, /還沒看清全景|0\.8/);
  // 段起點 0.2 秒硬推：其實是起始鏡位 → 建議改寫成 start，不報「太快」、不算運鏡次數（橫式照起始鏡位先看全景再推，066）
  const moves = [{ at: '+0', to: [240, 135, 480, 270], dur: 0.2 }, { at: '+2', to: 'full' }, { at: '+5', to: [0, 0, 480, 270] }];
  const d = run({ src: 'a.mp4', moves });
  assert.match(d.w, /moves\[0\] 在段起點就推（0\.2s）：橫式改成段頭先看全景 1\.2 秒、再推到這一塊（和 "start" 一樣）→ 改寫成 "start": \[240, 135, 480, 270\]、拿掉這個 moves/);
  assert.doesNotMatch(d.w, /太快|次運鏡/);
  const dp = run({ src: 'hd.mp4', moves: moves.slice(0, 2) }, { portrait: true, end: 16 });
  assert.match(dp.w, /moves\[0\] 在段起點就推（0\.2s），其實是起始鏡位 → 改寫成 "start": \[240, 135, 480, 270\]、拿掉這個 moves（第一格就在那一塊，沒有推的動作）/);
  assert.doesNotMatch(dp.w, /太快|次運鏡/);
  // 慢推（kenburns）和 start 不併用
  const e = run({ src: 'a.mp4', start: [240, 135, 480, 270], kenburns: true });
  assert.equal(e.m.kb, false);
  assert.match(e.w, /kenburns：有 start 時不做慢推/);
  // 欄位格式
  const errs = [];
  L.checkMediaSeg({ id: 'v09', type: 'media', src: 'assets/screen/a.mp4', start: [1, 2, 3] }, { projectDir: proj, err: (x) => errs.push(x), warn: () => {} });
  assert.match(errs.join('\n'), /start 要寫 \[x, y, w, h\]/);
});

test('Q2 start：框比可見區高（推不近）→ 撐滿寬度、上緣對齊（裁掉左右空白）；寬高都比畫面大才 ⚠；moves[0] 推不近時提示改用 start', () => {
  // 直式、960×960 錄影 cover（1080×1080 蓋住上半 0–900）：框 840×800 → 可見區 1080×660 放不進 → 撐滿寬度 1080/945 倍
  const a = run({ src: 'sq.mp4', fit: 'cover', start: [60, 100, 840, 800] }, { portrait: true, end: 15 });
  assert.deepEqual(a.errs, []);
  assert.equal(a.m.start.cropped, true);
  assert.equal(a.m.start.z, +(1080 / (840 * a.m.geo.kx)).toFixed(4));
  assert.match(a.r.summary, /起始鏡位 1\.143 倍（撐滿寬度，框的下面裁掉）/);
  assert.doesNotMatch(a.w, /推不近/);
  const b = run({ src: 'sq.mp4', fit: 'cover', start: [0, 100, 960, 800] }, { portrait: true, end: 15 });
  assert.equal(b.m.start, null);
  assert.match(b.w, /start 的框 \[0, 100, 960, 800\] 寬高都比畫面大，推不近（第一格和沒寫 start 一樣）→ 只框要看的那一塊/);
  const c = run({ src: 'sq.mp4', fit: 'cover', moves: [{ at: '+1', to: [60, 100, 840, 800] }] }, { portrait: true, end: 15 });
  assert.match(c.w, /moves\[0\]\.to 的框比畫面還大，推不近（已維持原大小）→ 框小一點，或寫 "full"；要一開始就裁掉左右空白，改寫成 "start"（框比畫面高時撐滿寬度）/);
});

test('C11：直式 start 以外最多動 1 次（一開始就推近的那次建議改成 start）；橫式維持 2 次', () => {
  const box1 = [100, 100, 600, 340], box2 = [500, 300, 600, 340];
  const p2 = run({ src: 'hd.mp4', moves: [{ at: '+0.5', to: box1 }, { at: '+3', to: box2 }] }, { portrait: true, end: 16 });
  assert.match(p2.w, /moves 直式一段有 2 次運鏡（start 以外最多 1 次），畫面小、動兩次就晃 → moves\[0\] 一開始就推近，改寫成 "start": \[100, 100, 600, 340\]；留內容換位置的那一次，其他用紅框，或拆成兩段/);
  const p1 = run({ src: 'hd.mp4', start: box1, moves: [{ at: '+3', to: box2 }] }, { portrait: true, end: 16 });
  assert.doesNotMatch(p1.w, /次運鏡/);
  const late = run({ src: 'hd.mp4', moves: [{ at: '+2', to: box1 }, { at: '+4.5', to: box2 }] }, { portrait: true, end: 16 });
  assert.match(late.w, /直式一段有 2 次運鏡（start 以外最多 1 次）.*→ 留內容換位置的那一次/);
  assert.doesNotMatch(late.w, /改寫成 "start"/);
  const l2 = run({ src: 'a.mp4', moves: [{ at: '+1', to: [0, 0, 480, 270] }, { at: '+4', to: 'full' }] });
  assert.doesNotMatch(l2.w, /次運鏡/);
  const l3 = run({ src: 'a.mp4', moves: [{ at: '+1', to: [0, 0, 480, 270] }, { at: '+4', to: 'full' }, { at: '+7', to: [480, 270, 480, 270] }] });
  assert.match(l3.w, /moves 一段有 3 次運鏡（建議 ≤ 2）/);
});

test('C10：直式上半第一格黑底 > 10% ⚠（寫 start 或 cover 就不報）；16:9 錄影（黑 8%）、沒有講者面板不報', () => {
  const a = run({ src: 'sq.mp4' }, { portrait: true, end: 15 });
  assert.match(a.w, /上半第一格有 39% 是黑底（錄影只蓋到 x 210–870、y 240–900）→ 寫 "start": \[x,y,w,h\] 推到操作區，或 "fit": "cover"/);
  assert.doesNotMatch(run({ src: 'sq.mp4', start: [0, 200, 960, 586] }, { portrait: true, end: 15 }).w, /黑底/);
  assert.doesNotMatch(run({ src: 'sq.mp4', fit: 'cover' }, { portrait: true, end: 15 }).w, /黑底/);
  assert.doesNotMatch(run({ src: 'hd.mp4' }, { portrait: true, end: 15 }).w, /黑底/);
  assert.doesNotMatch(run({ src: 'sq.mp4', pip: false }, { portrait: true, panel: false, end: 15 }).w, /黑底/);
});

test('C12：推近後整頁版面（換頁事件的框）只看得到 < 85% ⚠；那段有紅框（要看某一塊）、框不是整頁、沒推近不報', () => {
  events('cut', { events: [{ t: 1, settled: 1.5, kind: '換頁', box: full }] });
  const a = run({ src: 'cut.mp4', in: 2, moves: [{ at: '+1', to: [240, 135, 480, 270] }] });
  assert.match(a.w, /moves\[0\] 推近後只看得到整頁版面寬度的 57%（錄影第 \d+(\.\d)?s 那一頁 \[0, 0, 960, 540\]），整頁被切掉、看起來像網頁破版 → 展示整頁不推近（拿掉這個運鏡）；要看某一塊就框整欄/);
  const b = run({ src: 'cut.mp4', in: 2, start: [240, 135, 480, 270] });
  assert.match(b.w, /start 推近後只看得到整頁版面寬度的 57%.*（拿掉這個 start）/);
  assert.doesNotMatch(run({ src: 'cut.mp4', in: 2, start: [240, 135, 480, 270], marks: [{ at: '+1', until: '+3', box: [300, 200, 200, 80] }] }).w, /整頁版面/);
  assert.doesNotMatch(run({ src: 'cut.mp4', in: 2, start: [60, 30, 840, 480] }).w, /整頁版面/);
  assert.doesNotMatch(run({ src: 'cut.mp4', in: 0.2, start: [240, 135, 480, 270] }, { portrait: true }).w, /整頁版面/, '直式起點還沒換到整頁（錄影第 1 秒才換頁）');
  // 066 橫式先看全景再推近：量推完那一刻（錄影第 0.2＋1.2＋2.2＝3.6 秒，已經換頁）
  assert.match(run({ src: 'cut.mp4', in: 0.2, start: [240, 135, 480, 270] }).w, /start 推近後只看得到整頁版面寬度的 57%（錄影第 3\.6s 那一頁/);
  events('cut2', { events: [{ t: 1, settled: 1.5, kind: '換頁', box: [0, 0, 300, 540] }] });
  assert.doesNotMatch(run({ src: 'cut2.mp4', in: 2, start: [240, 135, 480, 270] }).w, /整頁版面/, '換頁的框不到錄影寬 60%（不是整頁）');
});

test('C13：起點那一格頁面已經往下捲 > 80 px、或正在往下捲 ⚠，建議換頁後、捲動前的秒數；從頁首開始、有紅框指著下面某一塊（已捲）不報', () => {
  events('page', { events: [{ t: 2, settled: 2.3, kind: '換頁', box: full }], scrolls: [{ from: 3, to: 4, px: 300, box: full }, { from: 8, to: 9, px: 50, box: full }] });
  const a = run({ src: 'page.mp4', in: 5 });
  assert.match(a.w, /起點那一格（錄影第 5s）頁面已經往下捲了 300 px，頁首看不到（2s 換頁之後） → in 改成 2\.3（換頁後、捲動前），網頁、工具頁從剛打開、停在最上方的那一格開始播/);
  const b = run({ src: 'page.mp4', in: 3.2 });
  assert.match(b.w, /起點那一格（錄影第 3\.2s）頁面正在往下捲（3–4s 捲 300 px），頁首一閃就不見（2s 換頁之後） → in 改成 2\.3/);
  const r = run({ src: 'page.mp4', retime: [{ at: '+0', src: 5 }, { at: '+10', src: 15 }] });
  assert.match(r.w, /→ retime 第一點的 src 改成 2\.3/);
  assert.doesNotMatch(run({ src: 'page.mp4', in: 2.3 }).w, /頁首/);
  assert.doesNotMatch(run({ src: 'page.mp4', in: 5, marks: [{ at: '+1', until: '+3', box: [100, 300, 200, 80] }] }).w, /頁首/);
});

test('C14：紅框出現期間錄影捲動碰到框（≥ 40 px）⚠；有 path、框在捲動前收掉、捲動在別的區域不報', () => {
  events('mark', { scrolls: [{ from: 6, to: 7, px: 200, box: [0, 100, 960, 440] }] });
  const a = run({ src: 'mark.mp4', in: 5, marks: [{ at: '+0.5', until: '+3', box: [100, 200, 200, 80] }] });
  // 最後一框照 D3 多停到 14（捲動 6–7s＝完成影片 11–12，在 13 之前）
  assert.match(a.w, /marks\[0\]（0:10\.50–0:14\.00）出現期間錄影往下捲 200 px（錄影 6–7s），框會停在空的地方 → 加 path 跟過去，或 until 收在 0:11\.00 之前/);
  assert.doesNotMatch(run({ src: 'mark.mp4', in: 5, marks: [{ at: '+0.5', until: '+3', box: [100, 200, 200, 80], path: [{ at: '+1', box: [100, 0, 200, 80], dur: 1 }] }] }).w, /框會停在空的地方/);
  assert.doesNotMatch(run({ src: 'mark.mp4', in: 5, marks: [{ at: '+0.1', until: '+0.9', box: [100, 200, 200, 80] }] }).w, /框會停在空的地方/);
  assert.doesNotMatch(run({ src: 'mark.mp4', in: 5, marks: [{ at: '+0.5', until: '+3', box: [100, 20, 200, 60] }] }).w, /框會停在空的地方/);
});

test('D3：最後一框多停的 1 秒碰到捲動、快轉、跳接就停在那之前；沒碰到照舊多停 1 秒', () => {
  events('d3', { scrolls: [{ from: 8, to: 9, px: 300, box: full }] });
  const mk = [{ at: '+0.5', until: '+2.5', box: [100, 200, 200, 80] }];
  assert.equal(run({ src: 'd3.mp4', in: 5, marks: mk }).r.json.marks[0].until, 13, '捲動 8–9s＝完成影片 13–14 → 停在 13');
  assert.equal(run({ src: 'd3.mp4', in: 1, marks: mk }).r.json.marks[0].until, 13.5, '沒碰到捲動 → 12.5 + 1');
  const fast = run({ src: 'd3.mp4', retime: [{ at: '+0', src: 0 }, { at: '+2.8', src: 2.8 }, { at: '+3.2', src: 6 }, { at: '+10', src: 7.5 }], marks: mk });
  assert.equal(fast.r.json.marks[0].until, 12.8, '快轉 ×8 從 12.8 開始');
});

test('C15：紅框 at 寫秒數（離句首或段起點 ≥ 1 秒）→ 建議綁詞，附估的 #N@詞；綁詞、句首附近不報', () => {
  const cues = [{ n: 3, start: 10, end: 14, text: '打開設定頁面的格式選項' }];
  const a = run({ src: 'a.mp4', marks: [{ at: '+2', until: '+3', box: [100, 200, 200, 80] }, { at: '#3+1.5', until: '+4', box: [300, 200, 200, 80] }] }, { cues });
  assert.match(a.w, /marks\[0\] "\+2"（約講到 "#3@[^"]+"）、marks\[1\] "#3\+1\.5"（約講到 "#3@[^"]+"） 的 at 寫秒數 → 紅框建議綁講到的詞（"#N@詞"），講到那個東西時框才出現，改字幕時間也跟得上/);
  assert.match(L.wordNear(cues, 12), /^#3@(頁面|面的)$/, '照字數比例估：一半的地方');
  assert.doesNotMatch(run({ src: 'a.mp4', marks: [{ at: '#3@格式', until: '+3', box: [100, 200, 200, 80] }, { at: '#3+0.3', until: '+4', box: [300, 200, 200, 80] }] }, { cues }).w, /綁講到的詞/);
});

test('C16：盤點筆記的 privacy 播到時沒被 redact 蓋住 ⚠；有打碼、推近時不在畫面上、時間外不報', () => {
  const notes = path.join(proj, 'work', 'media', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(notes, 'priv.json'), JSON.stringify({ file: 'assets/screen/priv.mp4', privacy: [{ from: 5, to: 8, box: [700, 20, 200, 40], what: '帳號名' }] }));
  const a = run({ src: 'priv.mp4', in: 5 });
  assert.match(a.w, /錄影 5–8 秒露出「帳號名」\[700, 20, 200, 40\]（完成影片 0:10\.00–0:13\.\d+）沒有打碼 → 加 "redact": \[\{ "at": "\+0", "until": "\+3(\.\d)?", "box": \[700, 20, 200, 40\] \}\]/);
  assert.doesNotMatch(run({ src: 'priv.mp4', in: 5, redact: [{ at: '+0', until: '+3.2', box: [690, 15, 220, 50] }] }).w, /沒有打碼/);
  assert.doesNotMatch(run({ src: 'priv.mp4', in: 5, start: [0, 270, 480, 270] }, { portrait: true }).w, /沒有打碼/, '直式第一格就推近，帳號名不在畫面上');
  // 066 橫式段頭先看全景：推走之前帳號名看得到
  assert.match(run({ src: 'priv.mp4', in: 5, start: [0, 270, 480, 270] }).w, /錄影 5–6\.4 秒露出「帳號名」\[700, 20, 200, 40\]（完成影片 0:10\.00–0:11\.50）沒有打碼/);
  assert.doesNotMatch(run({ src: 'priv.mp4', in: 9 }).w, /沒有打碼/);
  assert.deepEqual(L.privacyOf(proj, 'assets/screen/priv.mp4'), [{ from: 5, to: 8, box: [700, 20, 200, 40], what: '帳號名' }]);
  assert.deepEqual(L.privacyOf(proj, 'assets/screen/a.mp4'), []);
});

test('C17：慢放（< ×0.8；60 fps 錄影 < ×0.5）的那段錄影在捲動 ≥ 0.5 秒 ⚠；原速、捲動和慢放只重疊一點點不報', () => {
  events('slow', { scrolls: [{ from: 2, to: 4, px: 900, box: full }] });
  const a = run({ src: 'slow.mp4', retime: [{ at: '+0', src: 1 }, { at: '+5', src: 3 }, { at: '+10', src: 10 }] });
  assert.match(a.w, /0:12\.50–0:15\.00 錄影慢放 ×0\.4 又在捲動（錄影 2–4s 往下捲 900 px），看起來一格一格卡 → 捲動照原速，要看的地方停住（retime 兩點同一個 src）用紅框帶/);
  assert.doesNotMatch(run({ src: 'slow.mp4', retime: [{ at: '+0', src: 1 }, { at: '+10', src: 11 }] }).w, /一格一格卡/);
  assert.doesNotMatch(run({ src: 'slow.mp4', retime: [{ at: '+0', src: 0 }, { at: '+5', src: 2.1 }, { at: '+10', src: 10 }] }).w, /一格一格卡/, '只重疊 0.1 秒錄影＝0.24 秒');
  events('fast', { scrolls: [{ from: 2, to: 4, px: 900, box: [0, 0, 320, 180] }] });
  assert.doesNotMatch(run({ src: 'fast.mp4', retime: [{ at: '+0', src: 1 }, { at: '+5', src: 4 }, { at: '+8', src: 8 }] }).w, /一格一格卡/, '60 fps ×0.6 還不會少格');
  assert.match(run({ src: 'fast.mp4', retime: [{ at: '+0', src: 1 }, { at: '+5', src: 3 }, { at: '+8', src: 8 }] }).w, /錄影慢放 ×0\.4 又在捲動/);
});

test('N8：retime 定格 > 2.5 秒、或慢放 < ×0.5 而錄影沒有換頁捲動 > 4 秒，那段有人講、沒有標註 ⚠；有紅框、不夠久、沒人講不報', () => {
  const cues = [{ n: 1, start: 10, end: 20, text: '一直在講話' }];
  const freeze = [{ at: '+0', src: 1 }, { at: '+1', src: 2 }, { at: '+4.5', src: 2 }, { at: '+10', src: 8 }];
  const a = run({ src: 'hold.mp4', retime: freeze }, { cues });
  assert.match(a.w, /錄影從 0:11\.00 起停在同一格 3\.5 秒（錄影第 2s），講者還在講、畫面沒有在動 → 接到下一段錄影的開頭（retime 的 src 往後接），或加紅框、說明卡/);
  assert.doesNotMatch(run({ src: 'hold.mp4', retime: freeze, marks: [{ at: '+1.5', until: '+4', box: [100, 200, 200, 80] }] }, { cues }).w, /畫面沒有在動/);
  assert.doesNotMatch(run({ src: 'hold.mp4', retime: [{ at: '+0', src: 1 }, { at: '+1', src: 2 }, { at: '+3', src: 2 }, { at: '+10', src: 8 }] }, { cues }).w, /畫面沒有在動/);
  assert.doesNotMatch(run({ src: 'hold.mp4', retime: freeze }).w, /畫面沒有在動/, '沒有字幕（沒人講）');
  // 慢放 ×0.4、錄影 1–3 秒沒有換頁、捲動 → 看起來也停住；那段有換頁就不報
  events('hold2', { events: [{ t: 5, settled: 5.2, kind: '換頁', box: full }] });
  const slow = [{ at: '+0', src: 1 }, { at: '+5', src: 3 }, { at: '+10', src: 10 }];
  assert.match(run({ src: 'hold2.mp4', retime: slow }, { cues }).w, /錄影從 0:10\.00 起 5 秒慢放到 ×0\.4、這段錄影（1–3s）沒有換頁或捲動，看起來停住，講者還在講/);
  events('hold', { events: [{ t: 2, settled: 2.2, kind: '區塊變化', box: [0, 0, 100, 100] }] });
  assert.doesNotMatch(run({ src: 'hold.mp4', retime: slow }, { cues }).w, /慢放到/);
});

test('k19 截圖時間：每個紅框兩格（出現後 0.4 秒、消失前 0.4 秒），太短只截一格；夾在段內；沒有紅框截中間', () => {
  assert.deepEqual(L.markShots([{ i: 0, at: 1, until: 5 }, { i: 1, at: 2, until: 2.9 }]), [
    { at: 1.4, why: 'marks[0] 出現後 0.4 秒' }, { at: 2.4, why: 'marks[1] 出現後 0.4 秒' }, { at: 4.6, why: 'marks[0] 消失前' }]);
  assert.deepEqual(L.mediaShotTimes({ start: 10, end: 20, annotations: { marks: [{ i: 0, at: 10, until: 20.5 }] } }), [10.4, 19.95]);
  assert.deepEqual(L.mediaShotTimes({ start: 10, end: 20, annotations: { marks: [] } }), [15]);
});

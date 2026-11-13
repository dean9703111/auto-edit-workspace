// 螢幕錄影的事件索引（lib/events.mjs）、media.mjs scan 的 events.md、邊錄邊講的「等待」表、素材帳本
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, tmpDir, needs } from './helpers.mjs';

import { pathToFileURL } from 'node:url';
const E = await import(pathToFileURL(path.join(TOOLS, 'lib', 'events.mjs')).href);
const M = await import(pathToFileURL(path.join(TOOLS, 'media.mjs')).href);
const R = await import(pathToFileURL(path.join(TOOLS, 'lib', 'rough-flow.mjs')).href);

// 假的後台畫面：灰底、一列一列的「字」。每格 960×540，素材 1920×1080
const W = 960, H = 540, FPS = 10;
const rect = (f, x, y, w, h, v) => { for (let j = y; j < y + h; j++) f.fill(v, j * W + x, j * W + x + w); };
const page = (seed = 0, off = 0) => {
  const f = new Uint8Array(W * H).fill(235);
  for (let r = -2; r < 30; r++) {
    const y = 40 + r * 18 - off;
    for (let c = 0; c < 28; c++) { const on = (r * 7 + c * 13 + seed * 5 + c * c) % 5 !== 0; if (on && y >= 30 && y + 8 < H) rect(f, 60 + c * 30, y, 22, 8, 60 + ((r + c + seed) % 5) * 12); }
  }
  return f;
};
// 一支「錄影」：t 秒畫出哪一格
function scenePage(t) {
  let f;
  if (t < 9) f = page(0);
  else if (t < 10) f = page(3);
  else if (t < 11) f = page(3, Math.round((t - 10) * 100));   // 往下捲（分析畫面每秒 100 px＝素材 200 px）
  else f = page(3, 100);
  if (t >= 1 && t < 1.5) rect(f, 760, 480, 120, 30, 40);       // 通知
  if (t >= 2 && t < 3) { for (let i = 0; i < f.length; i++) f[i] = Math.round(f[i] * 0.55); rect(f, 330, 150, 300, 240, 250); }   // 開視窗：背景變暗
  if (t >= 4 && t < 9) rect(f, 480 + (Math.round(t * FPS) % 4) * 6, 270, 8, 8, 20);   // 轉圈：同一個地方一直在動
  // 游標走過去（不算事件）
  if (t >= 3.2 && t < 3.8) rect(f, 100 + Math.round((t - 3.2) * 800), 400, 10, 14, 0);
  return f;
}
const run = (dur = 16) => {
  const A = E.analyzer({ width: 1920, height: 1080, fps: FPS, w: W, h: H });
  for (let i = 0; i < dur * FPS; i++) A.push(scenePage(i / FPS));
  return A.end();
};

test('analyzer：通知、開關視窗（框是視窗本身）、換頁、捲動（位移對）、等待；游標走過去不算事件；轉圈不算事件', () => {
  const ev = run();
  const at = (t) => ev.events.find((e) => Math.abs(e.t - t) <= 0.25);
  assert.equal(at(1).kind, '小變化');
  const bx = at(1).box;
  assert.ok(Math.abs(bx[0] - 1520) <= 16 && Math.abs(bx[1] - 960) <= 16 && Math.abs(bx[2] - 240) <= 32, `通知的框 ${bx}`);
  assert.equal(at(1).in, 0.5, '建議 in＝事件前 0.5 秒');
  assert.equal(at(2).kind, '開視窗');
  const d = at(2).box;
  assert.ok(Math.abs(d[0] - 660) <= 24 && Math.abs(d[1] - 300) <= 24 && Math.abs(d[2] - 600) <= 48 && Math.abs(d[3] - 480) <= 48, `視窗的框 ${d}（背景變暗不算）`);
  assert.equal(at(3).kind, '關視窗');
  assert.ok(!ev.events.some((e) => e.t > 3.1 && e.t < 8.9), `游標走過去、轉圈不算事件：${JSON.stringify(ev.events.map((e) => [e.t, e.kind]))}`);
  assert.equal(at(9).kind, '換頁');
  assert.deepEqual(ev.events.map((e) => e.id).slice(0, 2), ['e01', 'e02']);
  assert.equal(ev.scrolls.length, 1);
  const s = ev.scrolls[0];
  assert.ok(Math.abs(s.px - 200) <= 8 && s.from >= 9.8 && s.to <= 11.2, `捲動 ${JSON.stringify(s)}`);
  const w = ev.waits.find((x) => x.kind === '畫面在轉');
  assert.ok(w && w.from <= 4.5 && w.to >= 8.5, `等待 ${JSON.stringify(ev.waits)}`);
  assert.ok(w.box && w.box[0] <= 960 && w.box[0] + w.box[2] >= 1000 && w.box[2] * w.box[3] < 1920 * 1080 * 0.1, `在動的地方包含轉圈、但不是整個畫面：${w.box}`);
  assert.ok(Math.abs(w.speed - (w.to - w.from) / 1.5) < 0.1);
  assert.ok(ev.waits.some((x) => x.kind === '靜止' && x.from >= 11 && x.to >= 15), '最後沒有動');
});

test('eventsMd：事件、等待（附 retime 寫法）、捲動、每一格的秒數', () => {
  const ev = run();
  const md = E.eventsMd({ src: 'assets/screen/a.mp4', info: { width: 1920, height: 1080, duration: 16 }, ev, cells: [{ sheet: 'sheet-01.jpg', n: 1, t: 0 }, { sheet: 'sheet-01.jpg', n: 2, t: 2.6, why: 'e02 開視窗' }] });
  assert.match(md, /\| e\d+ \| 2 \| 開視窗 \| \[\d+,\d+,\d+,\d+\] \| 1\.5 \|/);
  assert.match(md, /\{"at":"#N","src":[\d.]+\},\{"at":"#N\+1\.5","src":[\d.]+\}/);
  assert.match(md, /往下 \d+ px/);
  assert.match(md, /\| sheet-01\.jpg \| #2 \| 2\.6 \| e02 開視窗 \|/);
  assert.match(E.eventsMd({ src: 'a', info: { width: 1, height: 1, duration: 1 }, ev: null }), /畫面分析失敗/);
});

test('waitsInMain：畫面在等又沒人講話 ≥ 3 秒才列；有講話切開；@起-迄換算；不是邊錄邊講的不看', () => {
  const clips = [{ kind: 'camera', file: 'assets/camera/a.mp4', start: 0, end: 10 }, { kind: 'screen', file: 'assets/screen/r.mp4', start: 10, end: 60, src: [5, 55] }];
  const ev = { waits: [{ id: 'w01', from: 15, to: 35, kind: '畫面在轉' }, { id: 'w02', from: 40, to: 42, kind: '靜止' }] };
  // 素材 15–35 → main 20–40；中間 30 秒有人講話
  const words = [{ text: '好', start: 30, end: 30.5 }];
  const out = E.waitsInMain(clips, words, (f) => (f === 'assets/screen/r.mp4' ? ev : { waits: [{ from: 0, to: 9, kind: '靜止' }] }));
  assert.deepEqual(out.map((x) => [x.start, x.end, x.kind]), [[20, 29.7, '畫面在轉'], [30.8, 40, '畫面在轉']]);
  assert.deepEqual(E.waitsInMain(clips, [{ start: 21, end: 39 }], () => ev), []);
});

test('cuts.md 的等待表：預設不勾、頁面當 NG 列；勾了留等待的五分之一（1.5–4.5 秒，≥ 3 秒的會有等待卡）；screen-sync 放一段快轉，前後接得上', () => {
  assert.deepEqual([4, 7.5, 10, 15, 17.5, 200].map((w) => M.waitKeep(w)), [1.5, 1.5, 2, 3, 3.5, 4.5]);
  const md = R.cutsMarkdown({ rows: [{ cut: true, start: 3, end: 5, text: '重講', reason: '同一句講兩次', pending: '' }], waits: [{ start: 22, end: 32, file: 'assets/screen/r.mp4', kind: '畫面在轉' }] });
  assert.match(md, /等待：10\.0 秒沒人講話，勾了壓成 2 秒快轉 \|/, '10 秒的等待留 2 秒，不到 3 秒：沒有等待卡');
  assert.match(R.cutsMarkdown({ rows: [], waits: [{ start: 20, end: 40, file: 'assets/screen/r.mp4', kind: '靜止' }] }), /等待：20\.0 秒沒人講話，勾了壓成 4 秒快轉＋等待卡/);
  assert.match(md, /## 等待（邊錄邊講）/);
  const cm = M.parseCutsMd(md);
  assert.deepEqual(cm.ng.map((r) => [r.cut, !!r.wait]), [[true, false], [false, true]], 'NG 預設勾、等待預設不勾');
  assert.deepEqual(cm.ng.filter((r) => r.cut).length, 1);
  const on = M.parseCutsMd(M.setCutChecks(md, { 2: true }));
  assert.equal(on.ng[1].cut, true);
  // 不對齊停頓：10 秒的等待留開頭 2 秒（5 倍快轉）
  const snapped = M.snapNg(on.ng, [[20, 32]], 1);
  assert.deepEqual([snapped[1].a, snapped[1].b], [24, 32]);
  // main 0–40 秒、剪掉 24–32 → 三段：一般、快轉、一般；快轉的起點接前段、終點接後段
  const clips = [{ kind: 'screen', file: 'assets/screen/r.mp4', start: 0, end: 40 }];
  const v1 = { chunks: [[0, 720, 1], [720, 960, 99999], [960, 1200, 1]] };
  const segs = M.screenSegments(clips, v1, 30, [[22, 32]]);
  assert.deepEqual(segs.map((s) => s.id), ['sync01', 'sync02', 'sync03']);
  assert.deepEqual([segs[0].from, segs[0].to, segs[0].in], [0, 22, 0]);
  assert.deepEqual([segs[1].from, segs[1].to], [22, 24]);
  assert.deepEqual(segs[1].retime, [{ at: '+0', src: 22 }, { at: '+2', src: 32 }]);
  assert.equal(segs[1].in, undefined, 'retime 和 in 擇一');
  assert.deepEqual([segs[2].from, segs[2].in], [24, 32]);
  // 沒勾：照舊兩段
  assert.equal(M.screenSegments(clips, v1, 30, []).length, 2);
});

test('pickTimes：優先取事件變完之後那一格，標原因；固定間隔補空白；最多 64 格', () => {
  const cells = M.pickTimes(30, [{ t: 8.8, why: 'e02 開視窗' }, { t: 19.8, why: 'e07 關視窗' }]);
  const c = cells.find((x) => x.why === 'e02 開視窗');
  assert.equal(c.t, 9);
  assert.equal(c.scene, true);
  assert.ok(cells.some((x) => !x.scene));
  assert.equal(M.pickTimes(30, [5]).find((x) => x.scene).t, 5.2, '也接受純數字');
  assert.ok(M.pickTimes(1800, Array.from({ length: 200 }, (_, i) => ({ t: i * 9 }))).length <= 64);
});

test('media.mjs scan：寫 events.md／events.json、index.md 是總表（不列每一格）；舊版的 index 算過期', async (t) => {
  if (!(await needs(t, 'ffmpeg'))) return;
  const root = tmpDir(t, 'hf-events-');
  const p = path.join(root, 'projects', 'p1');
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  fs.mkdirSync(path.join(p, 'work'), { recursive: true });
  // 白底 8 秒：第 3 秒起出現一塊
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=640x360:r=30:d=8', '-vf', "drawbox=x=200:y=100:w=200:h=120:color=black:t=fill:enable='gte(t,3)'", '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(p, 'assets', 'screen', '操作.mp4')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const j = await M.scan({ project: p, templateDir: TEMPLATE }, { chrome: false });
  const dir = path.join(p, 'work', 'media');
  const v = j.files[0];
  assert.equal(v.events.file, 'work/media/操作/events.md');
  assert.ok(v.events.n >= 1);
  const md = fs.readFileSync(path.join(dir, '操作', 'events.md'), 'utf8');
  assert.match(md, /\| e01 \| 3(\.\d+)? \|/);
  assert.match(md, /Contact sheet 每一格的秒數/);
  const ev = JSON.parse(fs.readFileSync(path.join(dir, '操作', 'events.json'), 'utf8'));
  const b = ev.events[0].box;
  assert.ok(Math.abs(b[0] - 200) <= 16 && Math.abs(b[1] - 100) <= 16 && Math.abs(b[2] - 200) <= 24 && Math.abs(b[3] - 120) <= 24, `框 ${b}`);
  assert.ok(v.sheets[0].cells.some((c) => c.why === 'e01 區塊變化' || /^e01/.test(c.why || '')), '事件之後有取格');
  const idx = fs.readFileSync(path.join(dir, 'index.md'), 'utf8');
  assert.match(idx, /work\/media\/操作\/events\.md/);
  assert.doesNotMatch(idx, /每一格的時間/);
  assert.equal(M.scanFresh({ project: p }), true);
  const old = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  delete old.files[0].events;
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(old));
  assert.equal(M.scanFresh({ project: p }), false, '舊版沒有事件表：重掃');
});

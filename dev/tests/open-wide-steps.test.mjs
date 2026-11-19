// 066（specs/066-open-wide-steps-follow）：橫式錄影段先全景再推近（start、段起點的硬推 moves 都是段頭先停全景 1.2 秒再推）、
// 放不下先縮短、再不行就不推＋⚠；橫式步驟標籤跟著操作（貼在同時出現的紅框、箭頭…旁邊，跟著運鏡移動，找不到放左下角）；直式照舊。
// 素材檔是空檔＋假的 probe，不用 ffmpeg
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { imp, tmpDir } from './helpers.mjs';

const M = await imp('lib/media.mjs');
const { timeMap } = await imp('lib/edit.mjs');
const { canvasOf } = await imp('lib/canvas.mjs');

const tm = timeMap([], 120);
const probe = () => ({ width: 1920, height: 1080, duration: 60, hasAudio: false });
function project(t) {
  const dir = tmpDir(t, 'ow-');
  fs.mkdirSync(path.join(dir, 'assets', 'screen'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'screen', 'v.mp4'), '');
  return dir;
}
// 段在完成影片 10–20 秒（沒有剪接）
const runner = (dir) => (seg, { start = 10, end = 20, portrait = false, steps = null } = {}) => {
  const errs = [], warns = [];
  const s = { id: 'v01', type: 'media', src: 'assets/screen/v.mp4', ...seg };
  const media = M.checkMediaSeg(s, { projectDir: dir, probe, err: (x) => errs.push(x), warn: (x) => warns.push(x) });
  assert.ok(media, errs.join('\n'));
  const it = { id: s.id, seg: s, media, start, end, z: 20, enterFx: 'fade', exitFx: 'fade' };
  const r = M.validateMedia(it, { cues: [], tm, steps, canvas: canvasOf(portrait ? 'portrait' : 'landscape'), err: (x) => errs.push(x), warn: (x) => warns.push(x) });
  const parts = M.mediaParts({ ...it, pipIds: [] }, { nextTrack: (() => { let n = 10; return () => n++; })() });
  return { m: media, r, errs, warns, w: warns.join('\n'), parts };
};
const BOX2 = [480, 270, 960, 540];     // 1920×1080 錄影的中間一塊：推 2 倍（≥ 2 倍用 2.2 秒）
const BOX13 = [240, 135, 1440, 810];   // 推 1.333 倍（用 1.5 秒）
const stageTw = (parts) => parts.tl.filter((x) => x.includes("'#mst-v01'"));

test('橫式 start：段頭先停全景 1.2 秒，再用一般運鏡的速度推過去（≥ 2 倍 2.2 秒、以下 1.5 秒）；不算運鏡次數；json、報告；moves 從起始鏡位出發', (t) => {
  const run = runner(project(t));
  const a = run({ start: BOX2 });
  assert.deepEqual([a.errs, a.warns], [[], []]);
  assert.equal(a.m.start.z, 2);
  assert.deepEqual([a.m.open.t0, a.m.open.dur, a.m.open.hold, a.m.open.src], [11.2, 2.2, 1.2, 'start']);
  assert.deepEqual(a.m.open.from, { z: 1, x: 0, y: 0 }, '段頭是全景');
  assert.deepEqual(a.r.json.start, { z: 2, x: a.m.start.x, y: a.m.start.y, at: 11.2, dur: 2.2 });
  assert.equal(a.r.json.view.moves, 0, '開場推近不算運鏡次數');
  assert.match(a.r.summary, /^起始鏡位 2 倍（先看全景 1\.2 秒再推近）$/);
  // 時間軸：沒有 tl.set（第一格不是推好的），段起點後 1.2 秒從全景補間到起始鏡位
  assert.deepEqual(stageTw(a.parts), [`tl.fromTo('#mst-v01', { x: 0, y: 0, scale: 1 }, { x: ${a.m.start.x}, y: ${a.m.start.y}, scale: 2, duration: 2.2, ease: 'power2.inOut', force3D: false }, 11.2);`]);
  // 1.333 倍：推 1.5 秒
  const b = run({ start: BOX13 });
  assert.deepEqual([b.m.open.t0, b.m.open.dur], [11.2, 1.5]);
  // 之後的 moves 從起始鏡位出發；開場推近不算進次數（另外兩次不 ⚠）
  const c = run({ start: BOX2, moves: [{ at: '+5', to: 'full' }, { at: '+7.5', to: [0, 0, 960, 540] }] });
  assert.equal(c.m.cams.length, 3);
  assert.deepEqual(c.m.cams[1].from, c.m.open.to);
  assert.doesNotMatch(c.w, /次運鏡/);
  assert.match(c.r.summary, /起始鏡位 2 倍（先看全景 1\.2 秒再推近）、運鏡 2/);
});

test('橫式：推近期間的紅框照新的鏡頭驗（推走就 ⚠）、線寬跟著補；推近要在說明卡、箭頭、放大鏡、聚光燈、第一個 moves 之前結束（放不下先縮 hold 到 0.5、再縮推的秒數到 0.8）', (t) => {
  const run = runner(project(t));
  // 推到左上四分之一：右下角的紅框推完就在畫面外
  const a = run({ start: [0, 0, 960, 540], marks: [{ at: '+0.5', until: '+6', box: [1700, 900, 100, 80] }] });
  assert.match(a.w, /marks\[0\] 在 0:1[1-3]\.\d\d 整個跑到畫面外（運鏡把它推出去了，紅框看不到）/);
  assert.ok(a.parts.tl.some((x) => /tl\.fromTo\('#mmk-v01-1', \{ strokeWidth: 4 \}/.test(x) && x.endsWith(', 11.2);')), '開場推近期間紅框線寬反向補');
  // 說明卡在 +2.5：hold 縮到 0.5、推 2.2 → 2.0（0.5＋2.0＝2.5 剛好）
  const b = run({ start: BOX2, callouts: [{ at: '+2.5', until: '+6', box: [600, 400, 300, 100], text: '看這裡' }] });
  assert.deepEqual(b.errs, []);
  assert.deepEqual([b.m.open.hold, b.m.open.dur], [0.5, 2]);
  // 放大鏡在 +2：hold 0.5、推 1.5（2 倍要 2.2，只剩 1.5）
  const c = run({ start: BOX2, lens: [{ at: '+2', until: '+5', box: [700, 400, 200, 100] }] });
  assert.deepEqual([c.m.open.hold, c.m.open.dur], [0.5, 1.5]);
  assert.doesNotMatch(c.w, /期間有運鏡/);
  // 第一個 moves 在 +3：推完要在那一塊停 1 秒 → 2 秒內推完
  const d = run({ start: BOX2, moves: [{ at: '+3', to: 'full' }] });
  assert.deepEqual([d.m.open.t0, d.m.open.dur], [10.5, 1.5]);
  // 箭頭、聚光燈也算
  assert.deepEqual(run({ start: BOX13, arrows: [{ at: '+2.4', to: [960, 540] }] }).m.open.hold, 0.9);
  assert.deepEqual(run({ start: BOX13, spot: [{ at: '+2.2', until: '+5', box: [600, 400, 400, 200] }] }).m.open.hold, 0.7);
});

test('橫式放不下就不推（停在全景）＋⚠：說明卡太早、段太短、第一個 moves 太早；段起點的硬推 moves 照起始鏡位處理', (t) => {
  const run = runner(project(t));
  const a = run({ start: BOX2, callouts: [{ at: '+1', until: '+4', box: [600, 400, 300, 100], text: '看這裡' }] });
  assert.deepEqual(a.errs, []);
  assert.match(a.w, /^start 的開場推近（橫式段頭先看全景 1\.2 秒再推近）放不下：callouts\[0\] 在 0:11\.00 就開始（那時畫面要靜止），先停全景 0\.5 秒再推 0\.8 秒也來不及 → 這段停在全景、不推；要推近就把 callouts\[0\] 往後挪到 0:11\.30 之後$/m);
  assert.equal(a.m.start, null);
  assert.equal(a.m.open, null);
  assert.equal(a.r.json.start, undefined);
  assert.deepEqual(stageTw(a.parts), [], '整段全景，沒有運鏡');
  const b = run({ start: BOX2 }, { end: 12 });
  assert.match(b.w, /start 的開場推近（橫式段頭先看全景 1\.2 秒再推近）放不下：這段只有 2s，先停全景再推完，在那一塊停不到 1 秒（最短要 2\.3 秒） → 這段停在全景、不推；要看那一塊就把段拉長，或改用紅框 marks、放大鏡 lens 指出來/);
  // 第一個 moves 太早：不推，moves 改從全景出發
  const c = run({ start: BOX2, moves: [{ at: '+2', to: [0, 0, 960, 540] }] });
  assert.match(c.w, /start 的開場推近.*放不下：moves\[0\] 在 0:12\.00 就開始，先停全景再推完，在那一塊停不到 1 秒 → 這段停在全景到 moves\[0\]、不推；要推近就把 moves\[0\] 往後挪到 0:12\.30 之後/);
  assert.deepEqual(c.m.cams.map((x) => [x.i, x.from]), [[0, { z: 1, x: 0, y: 0 }]]);
  // 段起點 0.2 秒硬推：橫式照起始鏡位（先看全景 1.2 秒再推 2.2 秒）、⚠ 建議改寫成 start
  const d = run({ moves: [{ at: '+0', to: BOX2, dur: 0.2 }] });
  assert.match(d.w, /moves\[0\] 在段起點就推（0\.2s）：橫式改成段頭先看全景 1\.2 秒、再推到這一塊（和 "start" 一樣）→ 改寫成 "start": \[480, 270, 960, 540\]、拿掉這個 moves/);
  assert.deepEqual([d.m.open.src, d.m.open.t0, d.m.open.dur, d.m.cams.length], ['moves[0]', 11.2, 2.2, 1]);
  assert.match(d.r.summary, /^起始鏡位 2 倍（先看全景 1\.2 秒再推近）$/);
});

test('直式 start 不變：第一格就推在那一塊（tl.set、沒有開場推近）', (t) => {
  const run = runner(project(t));
  const a = run({ start: BOX2 }, { portrait: true });
  assert.equal(a.m.open, null);
  assert.equal(a.m.cams.length, 0);
  assert.deepEqual(a.r.json.start, { z: a.m.start.z, x: a.m.start.x, y: a.m.start.y });
  assert.deepEqual(stageTw(a.parts), [`tl.set('#mst-v01', { x: ${a.m.start.x}, y: ${a.m.start.y}, scale: ${a.m.start.z}, force3D: false }, 10);`]);
  assert.doesNotMatch(a.w, /開場推近/);
});

test('橫式步驟標籤：貼在同時出現的紅框左上外緣、跟著運鏡移動；沒有操作對象放左下角；換步舊的淡出新的淡入；接續的直接出現；stepsSide ⚠', (t) => {
  const run = runner(project(t));
  // 第一步和紅框同時出現：標籤貼在紅框上緣外（紅框 y − 12 − 80）、左緣對齊；第二步沒有東西 → 左下角（錄影左緣 125＋32、可見區下緣 900）
  const a = run({ steps: [{ at: '+0', text: '打開設定' }, { at: '+4', text: '按下儲存' }], marks: [{ at: '+0', until: '+3', box: [700, 400, 200, 80] }] });
  assert.deepEqual(a.errs, []);
  const mk = a.m.marks[0].rect, w1 = M.textPx('打開設定') + 118, w2 = M.textPx('按下儲存') + 118;
  assert.equal(a.m.steps.capsule, null, '橫式沒有固定的膠囊');
  assert.deepEqual(a.r.json.steps.map((x) => x.tag), [
    { side: 'top', target: 'marks[0]', box: [mk[0], mk[1] - 12 - 80, mk[0] + w1, mk[1] - 12] },
    { side: 'corner', target: null, box: [157, 820, 157 + w2, 900] },
  ]);
  const html = a.parts.html;
  assert.ok(html.includes(`<div id="mtag-v01-1" class="mtag" style="left:${mk[0]}px;top:${mk[1] - 92}px"><div id="msteps-v01-1" class="msteps"><div id="mstep-v01-1" class="mstep"><span class="mnum">1</span><span class="mtxt">打開設定</span></div></div></div>`), html);
  assert.ok(html.includes('<div id="mtag-v01-2" class="mtag" style="left:157px;top:820px">'));
  assert.doesNotMatch(html, /id="msteps-v01"/, '沒有左上那顆膠囊');
  const tw = a.parts.tl.filter((x) => /mtag|msteps/.test(x));
  assert.deepEqual(tw, [
    "tl.fromTo('#msteps-v01-1', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }, 10);",
    "tl.fromTo('#msteps-v01-1', { opacity: 1 }, { opacity: 0, duration: 0.25, ease: 'power1.in', immediateRender: false }, 14);",
    "tl.fromTo('#msteps-v01-2', { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' }, 14.1);",
  ]);
  // 有起始鏡位：開場推近時標籤跟著紅框一起移（同時間、同 ease；終點＝推完後紅框角在畫面上的位置＋固定位移）
  const b = run({ start: BOX2, steps: [{ at: '+0', text: '打開設定' }], marks: [{ at: '+0', until: '+6', box: [700, 400, 200, 80] }] });
  const tg = b.m.steps.list[0].tag, c = b.m.open.to;
  assert.equal(tg.target, 'marks[0]');
  const dx = +(c.x + c.z * tg.anchor[0] + tg.off[0] - tg.box[0]).toFixed(2), dy = +(c.y + c.z * tg.anchor[1] + tg.off[1] - tg.box[1]).toFixed(2);
  assert.ok(b.parts.tl.includes(`tl.fromTo('#mtag-v01-1', { x: 0, y: 0 }, { x: ${dx}, y: ${dy}, duration: 2.2, ease: 'power2.inOut', immediateRender: false }, 11.2);`), b.parts.tl.join('\n'));
  // 箭頭、說明卡也能貼；前一步就在的紅框不算這一步的
  const c2 = run({ steps: [{ at: '+0', text: '打開設定' }, { at: '+4', text: '按下儲存' }], marks: [{ at: '+0', until: '+6', box: [700, 400, 200, 80] }],
    arrows: [{ at: '+4.5', to: [1200, 600] }] });
  assert.deepEqual(c2.r.json.steps.map((x) => x.tag.target), ['marks[0]', 'arrows[0]']);
  const c3 = run({ steps: [{ at: '+1', text: '打開設定' }], callouts: [{ at: '+1', until: '+5', box: [300, 500, 300, 100], text: '設定' }] });
  assert.equal(c3.r.json.steps[0].tag.target, 'callouts[0]');
  // 左下角的標籤壓到聚光燈的亮區 → ⚠
  const d = run({ steps: [{ at: '+0', text: '打開設定' }], spot: [{ at: '+1', until: '+4', box: [0, 800, 600, 280] }] });
  assert.match(d.w, /steps\[0\] 的步驟標籤「打開設定」（錄影左下角 x 157–435、y 820–900）在 0:11\.00 壓到 spot\[0\] 的亮區 → 加一個紅框 marks 指出這一步在操作哪裡（標籤會貼在紅框旁邊），或錯開時間/);
  // stepsSide 在橫式沒有作用
  assert.match(run({ steps: [{ at: '+0', text: '打開設定' }], stepsSide: 'right' }).w, /stepsSide 橫式不用寫了：.* → 拿掉 stepsSide/);
  // 接續上一段同一步：直接出現、不重播
  const st = M.newStepState();
  run({ steps: [{ at: '+0', text: '打開設定' }] }, { end: 15, steps: st });
  const e = run({ id: 'v02', steps: [{ at: '+0', text: '打開設定' }] }, { start: 15, end: 20, steps: st });
  assert.equal(e.r.json.steps[0].carry, true);
  assert.deepEqual(e.parts.tl.filter((x) => /mtag|msteps/.test(x)), ["tl.set('#msteps-v02-1', { opacity: 1 }, 15);"]);
});

test('直式 STEP 膠囊不變：上半安全區左上一顆，換步在同一顆裡換', (t) => {
  const run = runner(project(t));
  const a = run({ steps: [{ at: '+0', text: '打開設定' }, { at: '+4', text: '按下儲存' }], marks: [{ at: '+0', until: '+3', box: [700, 400, 200, 80] }], stepsSide: 'left' }, { portrait: true });
  assert.deepEqual(a.errs, []);
  assert.deepEqual(a.m.steps.capsule.box.slice(0, 2), [60, 260]);
  assert.ok(a.m.steps.list.every((x) => !x.tag));
  assert.match(a.parts.html, /<div id="msteps-v01" class="msteps" style="left:60px;top:260px">/);
  assert.doesNotMatch(a.parts.html, /mtag/);
  assert.ok(a.parts.tl.includes("tl.fromTo('#msteps-v01', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }, 10);"));
  assert.ok(a.parts.tl.includes("tl.fromTo('#mstep-v01-2', { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' }, 14.1);"));
  assert.doesNotMatch(a.w, /stepsSide/);
});

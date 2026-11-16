// lib/matte.mjs：人物去背層（025）——哪幾段要去背、底片範圍、檔案指紋與沿用、模型沒下載時不自己下載、主合成的圖層
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'template', 'tools');
const imp = (f) => import(new URL(`file://${path.join(TOOLS, f)}`));
const MT = await imp('lib/matte.mjs');
const { timeMap } = await imp('lib/edit.mjs');

const seg = (matte) => { const s = { template: 'x-wall' }; if (matte) Object.defineProperty(s, '__matte', { value: true, configurable: true }); return s; };
const item = (id, start, end, matte = true) => ({ id, type: 'custom', start, end, seg: seg(matte) });

test('matteItems：只有規格寫 matte 的模板動畫；matteRange：沒有裁剪照原秒數，跨過裁掉的地方回傳 null', () => {
  const items = [item('x1', 2, 6), item('x2', 8, 12, false), { id: 's3', type: 'scene', start: 1, end: 2, seg: {} }];
  assert.deepEqual(MT.matteItems(items).map((x) => x.id), ['x1']);
  assert.deepEqual(MT.matteRange(items[0], null), { start: 2, end: 6 });
  const tm = timeMap([[10, 15]], 60);   // rough 的 10–15 秒被裁掉：完成影片 10 秒之後對到 rough 15 秒之後
  assert.deepEqual(MT.matteRange(item('a', 2, 6), tm), { start: 2, end: 6 });
  assert.deepEqual(MT.matteRange(item('b', 12, 16), tm), { start: 17, end: 21 });
  assert.equal(MT.matteRange(item('c', 8, 12), tm), null, '段跨過接點');
});

test('ensureMattes：做一次、第二次沿用；底片變了重做並清掉舊檔；模型沒下載又沒有替身 → 不下載、回報怎麼做', (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-matte-test-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const asset = path.join(out, 'assets', 'rough.mp4');
  fs.mkdirSync(path.dirname(asset), { recursive: true });
  // ffmpeg 切片要真的影片：有 ffmpeg 才跑這一組
  const has = (() => { try { return spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-t', '3', '-pix_fmt', 'yuv420p', asset], { encoding: 'utf8' }).status === 0; } catch { return false; } })();
  if (!has) { t.skip('需要 ffmpeg'); return; }
  let calls = 0;
  const remove = (clip, dst) => { calls++; assert.ok(fs.existsSync(clip), '切好的片段要在'); fs.writeFileSync(dst, 'webm'); return { ok: true }; };
  const items = [item('x1', 0.5, 1.5), item('x2', 1, 2, false)];
  const a = MT.ensureMattes({ outDir: out, root: out, items, assetVideo: asset, remove });
  assert.deepEqual({ made: a.made, reused: a.reused, problems: a.problems }, { made: 1, reused: 0, problems: [] });
  assert.match(items[0].matte.file, /^assets\/matte\/x1-[0-9a-f]{10}\.webm$/);
  assert.equal(items[1].matte, undefined);
  assert.ok(!fs.readdirSync(path.join(out, 'assets', 'matte')).some((f) => f.startsWith('.')), '暫存的片段清掉');
  const again = [item('x1', 0.5, 1.5)];
  const b = MT.ensureMattes({ outDir: out, root: out, items: again, assetVideo: asset, remove });
  assert.deepEqual({ made: b.made, reused: b.reused, calls }, { made: 0, reused: 1, calls: 1 });
  assert.equal(again[0].matte.file, items[0].matte.file);
  // 段的時間變了＝指紋變了：重做，舊檔清掉
  const moved = [item('x1', 0.6, 1.6)];
  const c = MT.ensureMattes({ outDir: out, root: out, items: moved, assetVideo: asset, remove });
  assert.equal(c.made, 1);
  assert.deepEqual(fs.readdirSync(path.join(out, 'assets', 'matte')), [path.basename(moved[0].matte.file)]);
  // 模型沒下載：不跑、不下載，說要先問使用者
  const cold = [item('x9', 0.2, 0.8)];
  const saved = process.env.AUTO_EDIT_MATTE; delete process.env.AUTO_EDIT_MATTE;
  const d = MT.ensureMattes({ outDir: out, root: out, items: cold, assetVideo: asset, weights: { cached: false, file: 'x' } });
  if (saved != null) process.env.AUTO_EDIT_MATTE = saved;
  assert.equal(d.made, 0);
  assert.match(d.problems[0].msg, /去背模型還沒下載.*先問使用者.*media\.mjs matte-setup/);
  assert.equal(cold[0].matte, undefined);
  // 去背失敗：回報原因，不留半個檔
  const fail = [item('x8', 0.2, 0.8)];
  const e = MT.ensureMattes({ outDir: out, root: out, items: fail, assetVideo: asset, remove: () => ({ ok: false, message: '爆了' }) });
  assert.match(e.problems[0].msg, /去背失敗：爆了/);
  assert.ok(!fs.readdirSync(path.join(out, 'assets', 'matte')).some((f) => f.includes('x8')));
});


test('主合成：有去背檔的段多一層 #matte-<段>（在動畫上面一層、不帶時間屬性的外層 div 包著影片）；沒有就沒有這一層', async () => {
  const { buildMain } = await imp('lib/main.mjs');
  const base = { id: 'x1', type: 'custom', key: 'custom', compId: 'x-wall-x1', file: 'compositions/x-wall-x1.html', start: 2, end: 6, s: 2, e: 6, z: 20, opaque: false, seg: {}, warnings: [], errors: [] };
  const mk = (it) => buildMain({ items: [it], videoDur: 10, captions: null, pip: { style: { left: 0, top: 0, width: 432, height: 324 } }, cues: [{ n: 1, start: 0, end: 10, text: 'a' }] }).html;
  const html = mk({ ...base, matte: { file: 'assets/matte/x1-abc.webm' } });
  const m = html.match(/<div id="matte-x1"[^>]*style="[^"]*z-index:(\d+)[^"]*">\s*<video id="mattev-x1" src="assets\/matte\/x1-abc\.webm" data-start="2" data-duration="4" data-media-start="0"/);
  assert.ok(m, html.split('\n').filter((l) => /matte/.test(l)).join('\n') || '沒有 matte 層');
  assert.equal(Number(m[1]), 21, '在動畫（z 20）上面一層');
  assert.doesNotMatch(html.match(/<div id="matte-x1"[^>]*>/)[0], /data-start|data-duration/, '外層 div 不帶時間屬性');
  assert.doesNotMatch(mk(base), /matte-x1/);
});

test('breakoutWindow：相框開口照講者框算（和 custom/x-breakout.html 的 script 同一個算法）；規格 matteClip: window 的段去背層裁在開口左右和下緣之內，沒有講者框就回報', (t) => {
  assert.deepEqual(MT.breakoutWindow([600, 40, 1360, 1000]), { left: 580, right: 1380, bottom: 880, top0: 100, top1: 354 });
  assert.deepEqual(MT.breakoutWindow([20, 300, 400, 900]), { left: 120, right: 420, bottom: 880, top0: 300, top1: 506 }, '貼邊：左緣不小於 120');
  assert.equal(MT.breakoutWindow(null), null);
  // 模板原始檔的算法和這裡一樣（常數逐一對）
  const src = fs.readFileSync(path.join(TOOLS, '..', 'custom', 'x-breakout.html'), 'utf8');
  for (const x of ['TOP = SP[1] + 40', 'Math.round(0.3 * (SP[3] - 80))', 'Math.max(120, Math.round(SP[0]) - 20)', 'Math.min(1800, Math.round(SP[0] + SP[2]) + 20)', 'Math.min(880, Math.round(SP[1] + SP[3]))', 'Math.max(100, TOP - 40)', 'TOP + HEAD + 10']) assert.ok(src.includes(x), `x-breakout.html 少了「${x}」`);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-matte-clip-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const asset = path.join(out, 'assets', 'rough.mp4');
  fs.mkdirSync(path.dirname(asset), { recursive: true });
  if (spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-t', '2', '-pix_fmt', 'yuv420p', asset], { encoding: 'utf8' }).status !== 0) { t.skip('需要 ffmpeg'); return; }
  const win = () => { const it = item('x1', 0.2, 1.2); Object.defineProperty(it.seg, '__matte', { value: 'window', configurable: true }); return it; };
  const remove = (clip, dst) => { fs.writeFileSync(dst, 'webm'); return { ok: true }; };
  const a = [win()];
  MT.ensureMattes({ outDir: out, root: out, items: a, assetVideo: asset, remove, speakerBox: [600, 40, 1360, 1000] });
  assert.equal(a[0].matte.clip, 'inset(0px 540px 200px 580px)');
  const b = [win()];
  const r = MT.ensureMattes({ outDir: out, root: out, items: b, assetVideo: asset, remove, speakerBox: null });
  assert.match(r.problems[0].msg, /plan\.json 還沒有 speakerBox/);
});

// ---------- 去背穩定（043，lib/matte-steady.mjs） ----------
const ST = await imp('lib/matte-steady.mjs');

// 30×12、40 格：x 14–17 是身體（一直算人），x 18–22／y 4–9 是椅子（前 15 格被算成人，之後不算），x 2–7／y 3–10 是另一塊（40 格裡只有 6 格沒算到），其他是背景
function synth({ chairOn = (t) => t < 15, leftOff = (t) => t >= 30 && t < 36 } = {}) {
  const w = 30, h = 12, n = 40, px = w * h, alpha = Buffer.alloc(n * px), luma = Buffer.alloc(n * px, 200);
  const at = (t, x, y) => t * px + y * w + x;
  for (let t = 0; t < n; t++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= 14 && x <= 17) { luma[at(t, x, y)] = 40; alpha[at(t, x, y)] = 255; }
    if (x >= 18 && x <= 22 && y >= 4 && y <= 9) { luma[at(t, x, y)] = 110; alpha[at(t, x, y)] = chairOn(t) ? 255 : 0; }
    if (x >= 2 && x <= 7 && y >= 3 && y <= 10) { luma[at(t, x, y)] = 90; alpha[at(t, x, y)] = leftOff(t) ? 0 : 255; }
  }
  return { w, h, n, px, alpha, luma, at };
}

test('analyzeMatte：會跳的整塊一起決定（不到七成算人就整塊不算、超過就整塊算），只換模型判錯的那幾格；身體、背景、經過的手都不碰', () => {
  const d = synth();
  // 手（從身體伸出來，連著身體）：第 5 格（椅子被算進人的時候）和第 22 格（椅子沒被算進人的時候）各經過椅子上緊鄰身體的一個位置
  d.luma[d.at(5, 18, 5)] = 190;
  d.luma[d.at(22, 18, 6)] = 190; d.alpha[d.at(22, 18, 6)] = 255;
  // 第 8 格：椅子外側多冒出一小塊、和人分開的碎塊（只有這一格被算成人）
  for (let t = 0; t < d.n; t++) d.luma[d.at(t, 24, 8)] = 110;
  d.alpha[d.at(8, 24, 8)] = 255;
  const r = ST.analyzeMatte(d);
  const W = (t, x, y) => r.weights[d.at(t, x, y)], M = (x, y) => r.med[y * d.w + x];
  assert.equal(r.wrong.length, 2, '兩塊（隔得夠遠，各自決定）');
  assert.equal(M(20, 6), 0, '椅子 15/40 格算人：整塊不算');
  assert.equal(M(3, 6), 255, '左邊那塊 34/40 格算人：整塊算');
  assert.equal(W(3, 20, 6), 255, '椅子被算進人的那幾格：換掉');
  assert.equal(W(20, 20, 7), 0, '模型本來就判對的格：不碰');
  assert.equal(W(22, 18, 6), 0, '模型判對的格裡經過的手：不碰');
  assert.ok(Math.abs(190 - r.bgMap[5 * d.w + 18]) > ST.STEADY.fine[1], '模型判錯的格裡經過的手：亮度和這裡的背景差很多，原尺寸比對時不會換');
  assert.equal(W(32, 3, 6), 255, '左邊那塊漏掉的那幾格：補回來');
  assert.equal(W(3, 15, 6), 0, '身體（不貼著椅子的地方）：不在要換的範圍裡');
  assert.equal(W(3, 23, 6), 255, '椅子外面一圈也在要換的範圍裡（交界落在這一圈，換到哪個像素交給原尺寸的比對）');
  assert.equal(W(3, 29, 0), 0, '遠處的背景：不碰');
  assert.equal(r.force[d.at(8, 24, 8)], 255, '緊貼著換掉的地方、又和人分開的小碎塊：一起拿掉（不用過原尺寸的比對）');
  assert.equal(r.force[d.at(20, 24, 8)], 0);
  assert.equal(r.bgMap[6 * d.w + 20], 110, '椅子那裡的背景亮度');
  assert.equal(r.changed, (15 + 6) / 40);
  // 輪廓邊緣一格寬的細條（人自己在晃）：不當成會跳的東西
  const thin = synth();
  for (let t = 0; t < thin.n; t++) for (let y = 0; y < thin.h; y++) { thin.luma[thin.at(t, 13, y)] = 200; thin.alpha[thin.at(t, 13, y)] = t % 2 ? 255 : 0; }
  const rt = ST.analyzeMatte(thin);
  for (let t = 0; t < thin.n; t++) assert.equal(rt.weights[thin.at(t, 13, 1)], 0, `細條第 ${t} 格`);
  // 參考遮罩：椅子的像素在模型判對的格裡不是人（0）；緊鄰椅子的身體像素一直是人（255）→ 永遠不會被切
  const ref = ST.referenceAlpha({ alpha: d.alpha, rw: d.w, rh: d.h, n: d.n, owner: r.owner, w: d.w, h: d.h, wrong: r.wrong });
  assert.equal(ref[6 * d.w + 20], 0);
  assert.equal(ref[6 * d.w + 17], 255);
  assert.equal(ref[6 * d.w + 3], 255, '左邊那塊在判對的格裡是人');
});

test('analyzeMatte：遮罩本來就穩（整段一致）→ changed 是 0，沒有要換的', () => {
  const r = ST.analyzeMatte(synth({ chairOn: () => false, leftOff: () => false }));
  assert.equal(r.changed, 0);
  assert.ok(r.weights.every((v) => v === 0) && r.force.every((v) => v === 0));
});

test('steadyMatte：真的影片跑一次——椅子前半段被算進人、後半段沒有 → 穩定後整段都不算，身體不變；本來就穩的不重新編碼', (t) => {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) { t.skip('沒有 ffmpeg'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-steady-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clip = path.join(dir, 'clip.mp4'), matte = path.join(dir, 'matte.webm'), stable = path.join(dir, 'stable.webm'), out = path.join(dir, 'out.webm');
  const ff = (args) => { const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  const body = 'drawbox=x=240:y=40:w=120:h=300:color=0x282828:t=fill', chair = 'drawbox=x=360:y=120:w=120:h=160';
  ff(['-f', 'lavfi', '-i', `color=c=0xC8C8C8:s=640x360:r=30:d=1.6,${chair}:color=0x6E6E6E:t=fill,${body}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
  const mk = (file, chairExpr) => ff(['-i', clip, '-f', 'lavfi', '-i', `color=c=black:s=640x360:r=30:d=1.6,drawbox=x=240:y=40:w=120:h=300:color=white:t=fill${chairExpr ? `,${chair}:color=white:t=fill:enable='${chairExpr}'` : ''},format=gray`,
    '-filter_complex', '[0:v][1:v]alphamerge,format=yuva420p', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-deadline', 'realtime', '-cpu-used', '8', '-auto-alt-ref', '0', file]);
  mk(matte, 'lt(t,0.6)'); mk(stable, '');
  const avg = (file, crop) => spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', file, '-vf', `alphaextract,crop=${crop},signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`, '-f', 'null', '-'], { encoding: 'utf8' })
    .stdout.split('\n').filter((l) => l.includes('YAVG')).map((l) => Number(l.split('=')[1]));
  assert.ok(Math.max(...avg(matte, '60:80:390:160')) > 200, '原本前半段椅子被算進人');
  const r = ST.steadyMatte({ clip, matte, out });
  assert.deepEqual({ ok: r.ok, changed: r.changed }, { ok: true, changed: true }, r.message);
  const chairAfter = avg(out, '60:80:390:160'), bodyAfter = avg(out, '60:200:270:90');
  assert.ok(chairAfter.length >= 45, `格數 ${chairAfter.length}`);
  assert.ok(Math.max(...chairAfter) < 30, `穩定後椅子整段都不算人：${Math.max(...chairAfter)}`);
  assert.ok(Math.min(...bodyAfter) > 225, `身體照舊：${Math.min(...bodyAfter)}`);
  const same = ST.steadyMatte({ clip, matte: stable, out: path.join(dir, 'none.webm') });
  assert.deepEqual({ ok: same.ok, changed: same.changed }, { ok: true, changed: false });
  assert.ok(!fs.existsSync(path.join(dir, 'none.webm')), '本來就穩：不寫檔');
});

test('去背穩定預設不做：根元素寫 data-matte="steady" 的段才做（"1"、"window" 都不做）；屬性寫在 data-composition-id 前面或後面都認得', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-steady-attr-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'compositions'));
  const mk = (id, attrs) => { const file = `compositions/x-design-${id}.html`; fs.writeFileSync(path.join(dir, file), `<template>\n  <div id="x-design-${id}" ${attrs}>\n  </div>\n</template>\n`); return { id, type: 'custom', file, seg: {} }; };
  const a = mk('a', 'data-composition-id="x-design-a" data-matte="steady"'), b = mk('b', 'data-matte="steady" data-composition-id="x-design-b"');
  const c = mk('c', 'data-composition-id="x-design-c" data-matte="1"'), d = mk('d', 'data-composition-id="x-design-d" data-matte="window"'), e = mk('e', 'data-composition-id="x-design-e"');
  assert.deepEqual([a, b, c, d, e].map((it) => MT.matteKindOf(it, dir)), ['full', 'full', 'full', 'window', null]);
  assert.deepEqual([a, b, c, d, e].map((it) => MT.matteSteadyOf(it, dir)), [true, true, false, false, false]);
});

test('046 data-matte-front：寫的那幾塊範圍在去背層上開洞（裡面的東西在講者前面）；沒寫照舊整張；寫錯回報怎麼寫，不做去背', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-matte-front-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'compositions'));
  const asset = path.join(dir, 'assets', 'rough.mp4');
  fs.mkdirSync(path.dirname(asset), { recursive: true });
  const has = (() => { try { return spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-t', '3', '-pix_fmt', 'yuv420p', asset], { encoding: 'utf8' }).status === 0; } catch { return false; } })();
  if (!has) { t.skip('需要 ffmpeg'); return; }
  const mk = (id, attrs) => { const file = `compositions/x-design-${id}.html`; fs.writeFileSync(path.join(dir, file), `<template>\n  <div id="x-design-${id}" data-composition-id="x-design-${id}" ${attrs}>\n  </div>\n</template>\n`); return { id, type: 'custom', file, seg: {}, start: 0.5, end: 1.5 }; };
  const a = mk('a', 'data-matte="1" data-matte-front="50,515,890,735; 100, 1300, 200, 60"'), b = mk('b', 'data-matte="1"'), c = mk('c', 'data-matte="1" data-matte-front="50,515,890"'), d = mk('d', 'data-matte-front="1,2,3,4"');
  assert.deepEqual(MT.matteFrontOf(a, dir), [[50, 515, 890, 735], [100, 1300, 200, 60]]);
  assert.equal(MT.matteFrontOf(b, dir), null);
  assert.equal(MT.matteFrontOf(d, dir), null, '沒寫 data-matte 的段不去背，也就沒有前後');
  const remove = (clip, dst) => { fs.writeFileSync(dst, 'webm'); return { ok: true }; };
  const r = MT.ensureMattes({ outDir: dir, root: dir, items: [a, b, c, d], assetVideo: asset, remove });
  assert.equal(r.made, 2);
  assert.equal(a.matte.clip, "path(evenodd,'M-9 -9H9999V9999H-9ZM50 515h890v735h-890ZM100 1300h200v60h-200Z')");
  assert.equal(b.matte.clip, undefined);
  assert.equal(c.matte, undefined);
  assert.deepEqual(r.problems.map((p) => p.id), ['c']);
  assert.match(r.problems[0].msg, /data-matte-front 看不懂 → 寫成 "x,y,寬,高"/);
});

// ---------- 去背閃動檢查（055 C22：只量不改） ----------
test('flickerMessage：整塊一起跳的東西 ≥ 講者框 2% 才報；沒開 steady 建議坐著改 steady、站著換版面，開了 steady 的叫人看截圖；isMatteFlickerLine 認得兩種', () => {
  const m = { W: 1920, H: 1080, n: 137, fps: '30/1', blobs: [{ area: 45936, box: [1176, 684, 198, 396], frames: 62, first: 0, last: 116 }, { area: 2340, box: [690, 930, 54, 150], frames: 33, first: 100, last: 136 }] };
  const box = [487, 117, 1369, 1080];   // 主宣傳片的講者框：882×963
  const w = MT.flickerMessage('s0101', m, { speakerBox: box });
  assert.equal(w, 's0101 去背有一塊在閃（約講者框的 5%，在 x 1176–1374、y 684–1080，段內 0.0–3.9 秒裡跳了 62 格）→ 講者坐著不動就把 data-matte 改成 "steady"；站著走動就換不用去背的版面');
  assert.equal(MT.flickerMessage('s0101', { ...m, blobs: m.blobs.slice(1) }, { speakerBox: box }), null, '穩定後剩的殘角（0.3%）不報');
  assert.match(MT.flickerMessage('s0101', m, { speakerBox: box, steady: true }), /^s0101 寫了 data-matte="steady"，去背還有一塊在閃（.*）→ 看那幾秒的截圖確認；還在閃就換不用去背的版面$/);
  assert.match(MT.flickerMessage('x1', m, {}), /約畫面的 4%/, '沒有講者框：拿畫面的一半當講者框');
  assert.ok(MT.isMatteFlickerLine(`⚠ ${w}`) && MT.isMatteFlickerLine(`  ⚠ ${MT.flickerMessage('s0101', m, { speakerBox: box, steady: true })}`));
  assert.ok(!MT.isMatteFlickerLine('⚠ [s0101] 字太小') && !MT.isMatteFlickerLine('人物去背層：2 段（新做 1、沿用 1）'));
});

test('ensureMattes 量閃動：椅子前半段被算進人 → warnings 一則（也印 ⚠）；同一支去背檔第二次直接用快取；遮罩本來就穩不報；flicker: false 不量', (t) => {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) { t.skip('沒有 ffmpeg'); return; }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-flicker-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const asset = path.join(out, 'assets', 'rough.mp4');
  fs.mkdirSync(path.dirname(asset), { recursive: true });
  const ff = (args) => { const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  const body = 'drawbox=x=240:y=40:w=120:h=300', chair = 'drawbox=x=360:y=120:w=120:h=160';
  ff(['-f', 'lavfi', '-i', `color=c=0xC8C8C8:s=640x360:r=30:d=1.6,${chair}:color=0x6E6E6E:t=fill,${body}:color=0x282828:t=fill`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', asset]);
  const mk = (file, chairExpr) => ff(['-i', asset, '-f', 'lavfi', '-i', `color=c=black:s=640x360:r=30:d=1.6,${body}:color=white:t=fill${chairExpr ? `,${chair}:color=white:t=fill:enable='${chairExpr}'` : ''},format=gray`,
    '-filter_complex', '[0:v][1:v]alphamerge,format=yuva420p', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-deadline', 'realtime', '-cpu-used', '8', '-auto-alt-ref', '0', file]);
  const jumpy = path.join(out, 'jumpy.webm'), stable = path.join(out, 'stable.webm');
  mk(jumpy, 'lt(t,0.6)'); mk(stable, '');
  const removeWith = (src) => (clip, dst) => { fs.copyFileSync(src, dst); return { ok: true }; };
  const logs = [];
  const a = MT.ensureMattes({ outDir: out, root: out, items: [item('x1', 0, 1.6)], assetVideo: asset, remove: removeWith(jumpy), flicker: true, speakerBox: [240, 40, 360, 340], log: (l) => logs.push(l) });
  assert.equal(a.warnings.length, 1, JSON.stringify(a));
  assert.match(a.warnings[0], /^x1 去背有一塊在閃（約講者框的 \d+%，在 x 3\d\d–4\d\d、y 1\d\d–2\d\d，段內 0\.0–0\.\d 秒裡跳了 1\d 格）→ 講者坐著不動就把 data-matte 改成 "steady"/);
  assert.ok(logs.includes(`⚠ ${a.warnings[0]}`), logs.join('\n'));
  // 快取：同一支檔不重量（把快取裡的結果改掉，第二次就照快取報）
  const cacheFile = path.join(out, MT.FLICKER.cache);
  const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const name = Object.keys(c.files)[0];
  c.files[name].m.blobs[0].frames = 99;
  fs.writeFileSync(cacheFile, JSON.stringify(c));
  const b = MT.ensureMattes({ outDir: out, root: out, items: [item('x1', 0, 1.6)], assetVideo: asset, remove: removeWith(jumpy), flicker: true, speakerBox: [240, 40, 360, 340] });
  assert.equal(b.reused, 1);
  assert.match(b.warnings[0], /跳了 99 格/, '沿用快取');
  // 遮罩本來就穩：不報；flicker: false 不量
  const s = MT.ensureMattes({ outDir: out, root: out, items: [item('x2', 0, 1.6)], assetVideo: asset, remove: removeWith(stable), flicker: true });
  assert.deepEqual(s.warnings, []);
  const off = MT.ensureMattes({ outDir: path.join(out, 'off'), root: out, items: [item('x3', 0, 1.6)], assetVideo: asset, remove: removeWith(jumpy) });
  assert.deepEqual(off.warnings, [], '替身去背（測試）預設不量');
  assert.ok(!fs.existsSync(path.join(out, 'off', MT.FLICKER.cache)));
});

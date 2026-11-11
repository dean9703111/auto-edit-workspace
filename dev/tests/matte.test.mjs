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

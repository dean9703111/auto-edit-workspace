// 071 錄影換畫面疊化（specs/071-screen-switch）：挑換畫面那一格（整個換掉、換之前停著）、換算完成影片秒數（剪掉的、段頭段尾不做）、
// mediaParts 疊上前一格淡出＋模糊、"switches": false；ffmpeg 算分數（有 ffmpeg 才跑）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { imp, makeSrt, tmpDir, hasFfmpeg } from './helpers.mjs';

const M = await imp('lib/media.mjs');
const { sceneScores } = await imp('lib/ff.mjs');
const { timeMap } = await imp('lib/edit.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const cues = parseSrt(makeSrt({ n: 12 }));

// 每 1/30 秒一格的分數：預設停著（0.005），指定的格換掉
const scores = (len, hits = {}) => Array.from({ length: Math.round(len * 30) }, (_, i) => [Math.round((i / 30) * 1000) / 1000, hits[i] ?? 0.005]);

test('pickSwitches：整個換掉＋換之前停著才算；捲動（換之前一直在動）、太小的變化不算；連著幾格換只算第一格、兩處至少隔 1 秒', () => {
  assert.deepEqual(M.pickSwitches(scores(4, { 60: 0.8 })), [2]);
  assert.deepEqual(M.pickSwitches(scores(4, { 60: 0.2 })), [], '變化太小');
  const scroll = Object.fromEntries(Array.from({ length: 12 }, (_, k) => [50 + k, 0.15]));
  assert.deepEqual(M.pickSwitches(scores(4, { ...scroll, 62: 0.5 })), [], '換之前 0.5 秒內一直在動＝捲動');
  assert.deepEqual(M.pickSwitches(scores(4, { 60: 0.5, 61: 0.5, 62: 0.4 })), [2], '連著幾格只算第一格');
  assert.deepEqual(M.pickSwitches(scores(6, { 30: 0.6, 54: 0.6, 120: 0.6 })), [1, 4], '1.8 秒那處離 1 秒那處不到 1 秒');
  assert.deepEqual(M.pickSwitches(scores(4, { 1: 0.9 })), [], '開頭前面沒有可以比的格');
});

test('switchTimes：檔案秒數 → 完成影片秒數（剪接點切開的兩片各自換算）；剪掉的、離段頭 0.6 秒、離段尾 0.6＋0.45 秒內不做', () => {
  const it = { start: 10, end: 20, media: { pieces: [{ s: 10, e: 15, fms: 2 }, { s: 15, e: 20, fms: 9 }] } };
  assert.deepEqual(M.switchTimes(it, [4, 10, 7.5, 2.3, 13.5]), [12, 16], '4→12、10→16；7.5 在剪掉的範圍、2.3 離段頭 0.3、13.5 離段尾 0.5');
});

test('mediaParts：換畫面那一格疊上前一格（同一個位置、在 stage 裡跟著運鏡），0.45 秒淡出＋模糊；"switches": false 檢查', (t) => {
  const dir = tmpDir(t, 'sw-');
  fs.mkdirSync(path.join(dir, 'assets/screen'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets/screen/v.mp4'), '');
  const probe = () => ({ width: 1920, height: 1080, duration: 30, hasAudio: false });
  const errs = [], warns = [];
  const seg = { id: 'm1', type: 'media', src: 'assets/screen/v.mp4', from: '#2', to: '#4e' };
  const media = M.checkMediaSeg(seg, { projectDir: dir, probe, err: (x) => errs.push(x), warn: (x) => warns.push(x) });
  const it = { id: 'm1', seg, media, start: 4.5, end: 14, z: 20, enterFx: 'fade', exitFx: 'fade' };
  M.validateMedia(it, { cues, tm: timeMap([], 60), err: (x) => errs.push(x), warn: (x) => warns.push(x) });
  assert.deepEqual(errs, []);
  it.media.asset = 'assets/media/v-1.mp4';
  it.media.swaps = [{ at: 8.2, rel: 'assets/media/v-1-x0003700.jpg' }];
  const { html } = M.mediaParts({ ...it, pipIds: [] }, { nextTrack: (() => { let n = 10; return () => n++; })() });
  const style = html.match(/<video id="mv-m1" [^]*?style="([^"]+)"/)[1];
  assert.match(html, new RegExp(`<video id="mv-m1" [^]*?</video>\\n      <img id="mxf-m1-1" class="clip mxf" src="assets/media/v-1-x0003700\\.jpg" alt="" data-start="8\\.2" data-duration="0\\.45" data-track-index="\\d+" style="${style}">`), '緊接在錄影後面、同一個位置');
  const { tl } = M.mediaParts({ ...it, pipIds: [] }, { nextTrack: () => 1 });
  assert.ok(tl.some((x) => x === "tl.fromTo('#mxf-m1-1', { opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(10px)', duration: 0.45, ease: 'sine.in', immediateRender: false }, 8.2);"), tl.join('\n'));
  // 沒有換畫面：輸出和原本一樣（沒有 mxf）
  delete it.media.swaps;
  assert.doesNotMatch(M.mediaParts({ ...it, pipIds: [] }, { nextTrack: () => 1 }).html, /mxf/);
  // 072 freezeTail：變速錄影接動畫擦入，最後 0.45 s 疊上最後一格（同一個位置），動畫從它上面擦過
  it.media.tail = 'assets/media/v-1-tail0013550.jpg';
  const ft = M.mediaParts({ ...it, freezeTail: 0.45, pipIds: [] }, { nextTrack: () => 1 }).html;
  assert.match(ft, new RegExp(`<img id="mft-m1" class="clip mxf" src="assets/media/v-1-tail0013550\\.jpg" alt="" data-start="13\\.55" data-duration="0\\.45" data-track-index="1" style="${style}">`));
  assert.doesNotMatch(M.mediaParts({ ...it, pipIds: [] }, { nextTrack: () => 1 }).html, /mft-/, '沒有 freezeTail 不放');
  delete it.media.tail;
  // switches 只收 false
  const off = M.checkMediaSeg({ ...seg, switches: false }, { projectDir: dir, probe, err: (x) => errs.push(x), warn: () => {} });
  assert.equal(off.noSwitch, true);
  M.checkMediaSeg({ ...seg, switches: true }, { projectDir: dir, probe, err: (x) => errs.push(x), warn: () => {} });
  assert.match(errs.join('\n'), /switches 只能寫 false（這段錄影換畫面時不疊化），現在是 true/);
});

test('sceneScores＋pickSwitches：真的影片（紅 2 秒換藍 2 秒）找到 2.0 秒那一格', { skip: !hasFfmpeg() && '沒有 ffmpeg' }, (t) => {
  const dir = tmpDir(t, 'sw-ff-'), f = path.join(dir, 'v.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=2',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const sc = sceneScores(f, [[0, 4]]);
  assert.ok(sc.length >= 100, `${sc.length} 格`);
  assert.deepEqual(M.pickSwitches(sc), [2]);
  // 只算一段範圍：秒數照檔案算
  assert.deepEqual(M.pickSwitches(sceneScores(f, [[1, 2]])), [2]);
});

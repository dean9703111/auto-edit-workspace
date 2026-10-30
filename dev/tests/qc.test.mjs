// qc.mjs：解析 ffmpeg 輸出的純函式、cuts 時間換算、時間對段落、判定
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imp } from './helpers.mjs';

const Q = await imp('qc.mjs');
const items = [
  { id: 's01', type: 'scene', label: '01 章節轉場', start: 0, end: 5 },
  { id: 's02', type: 'scene', label: '08 Step 字卡', start: 10, end: 20 },
  { id: 'm01', type: 'media', label: 'media a.mp4', kind: 'video', start: 60, end: 80, shownEnd: 81 },
];

test('parseFreeze：成對與凍到片尾', () => {
  const err = `[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 62.3
[freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 3.7
[freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 66
[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 100`;
  assert.deepEqual(Q.parseFreeze(err, 105), [[62.3, 66], [100, 105]]);
  assert.deepEqual(Q.parseFreeze(err), [[62.3, 66]]);
});

test('parseBlack／parseSilence', () => {
  assert.deepEqual(Q.parseBlack('[blackdetect @ 0x] black_start:10 black_end:11.5 black_duration:1.5'), [[10, 11.5]]);
  const s = 'silence_start: 3.2\nsilence_end: 8 | silence_duration: 4.8\nsilence_start: 20';
  assert.deepEqual(Q.parseSilence(s, 25), [[3.2, 8], [20, 25]]);
  assert.deepEqual(Q.parseSilence('silence_start: -0.001\nsilence_end: 5', 25), [[0, 5]]);
});

test('parseLoudness：取 Summary，-inf 變 null', () => {
  const err = `  Integrated loudness:\n    I:         -14.2 LUFS\n    Threshold: -24.3 LUFS\n  True peak:\n    Peak:       -1.8 dBFS`;
  assert.deepEqual(Q.parseLoudness(`Summary:\n\n${err}`), { i: -14.2, tp: -1.8, found: true });
  const silent = 'Summary:\n  Integrated loudness:\n    I:         -70.0 LUFS\n  True peak:\n    Peak:       -inf dBFS';
  assert.equal(Q.parseLoudness(silent).tp, null);
  assert.equal(Q.parseLoudness('').found, false);
});

test('finalToRough／roughToFinal 隨 cuts 換算', () => {
  const cuts = [[10, 12], [30, 31]];
  assert.equal(Q.finalToRough(5, cuts), 5);
  assert.equal(Q.finalToRough(15, cuts), 17);
  assert.equal(Q.finalToRough(40, cuts), 43);
  assert.equal(Q.roughToFinal(17, cuts), 15);
  assert.equal(Q.roughToFinal(11, cuts), 10);
  assert.equal(Q.roughToFinal(43, cuts), 40);
});

test('locateItem／itemName：取重疊最多的段落', () => {
  assert.equal(Q.locateItem([62, 66], items).id, 'm01');
  assert.equal(Q.locateItem([30, 33], items), null);
  assert.equal(Q.locateItem([12, 15], items).id, 's02');
  assert.equal(Q.itemName(items[1]), 's02 Step 字卡');
  assert.equal(Q.itemName(items[2]), 'm01 螢幕錄影');
  assert.equal(Q.itemName(null), '主軌口播');
  // cuts 剪掉前面 2 秒：成片 58–61 ＝ rough 60–63
  assert.equal(Q.locateItem([58, 61], items, [[0, 2]]).id, 'm01');
});

test('freezeIssues：章節轉場的凍結排除，其餘留下', () => {
  assert.deepEqual(Q.freezeIssues([[0, 5]], items), []);
  assert.deepEqual(Q.freezeIssues([[62, 66]], items), [[62, 66]]);
  assert.deepEqual(Q.freezeIssues([[0.5, 4]], items), []);
  assert.deepEqual(Q.freezeIssues([[62, 64.5]], items), []);
  assert.deepEqual(Q.subtractRanges([0, 10], [[2, 4], [8, 12]]), [[0, 2], [4, 8]]);
});

const base = { width: 1920, height: 1080, fps: 30, vfr: false, hasAudio: true, dur: 24, expected: 24, loud: { i: -14, tp: -2 }, freezes: [], blacks: [], silences: [], items, cuts: [] };

test('judge：全過、ok 為 true', () => {
  const r = Q.judge(base);
  assert.equal(r.ok, true); assert.equal(r.errors, 0); assert.equal(r.warnings, 0);
});

test('judge：格式與長度是 ✖，其餘是 ⚠', () => {
  assert.equal(Q.judge({ ...base, width: 1280, height: 720 }).errors, 1);
  assert.equal(Q.judge({ ...base, hasAudio: false }).errors, 1);
  assert.equal(Q.judge({ ...base, dur: 24.5 }).errors, 1);
  assert.equal(Q.judge({ ...base, dur: 24.08 }).errors, 0);
  const w = Q.judge({ ...base, loud: { i: -20, tp: -0.2 }, freezes: [[62.3, 66]], blacks: [[10, 10.3], [12, 13]], silences: [[30, 36]] });
  assert.equal(w.ok, true);
  assert.equal(w.warnings, 4);
  assert.match(w.checks.find((c) => c.key === 'freeze' && c.level === 'warn').text, /1:02\.3–1:06\.0 畫面凍結 3\.7 秒（m01 螢幕錄影）/);
  assert.equal(Q.judge({ ...base, loud: { i: -14, tp: -0.5 } }).warnings, 1);
});

test('sheetTimes／speakerTimes／padBox', () => {
  assert.deepEqual(Q.sheetTimes(24), [0, 10, 20, 23.7]);
  assert.deepEqual(Q.sheetTimes(5), [0, 4.7]);
  assert.equal(Q.speakerTimes(80).length, 8);
  assert.equal(Q.speakerTimes(80)[0], 5);
  assert.deepEqual(Q.padBox([10, 100, 500, 1070]), [0, 60, 540, 1080]);
});

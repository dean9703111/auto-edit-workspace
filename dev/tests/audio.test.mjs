// 主軌聲音：人聲響度標準化（目標、第二段濾鏡、快取）、剪接點微淡化（時間點計算、樣本處理）、長度不變、edit.cuts 的接點淡化
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lib, imp, makeSrt } from './helpers.mjs';

const A = await imp('lib/audio.mjs');
const { probeDuration, probeMedia } = await imp('lib/ff.mjs');
const { resolvePlan } = await imp('lib/plan.mjs');
const { buildMain } = await imp('lib/main.mjs');
const { parseSrt } = await imp('lib/srt.mjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'audio-test-'));
const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} 應該接近 ${b}（±${tol}）`);

test('目標：−14 LUFS、true peak −1 dBTP；剪接點淡化 10–20 ms', () => {
  assert.equal(A.LOUD.I, -14);
  assert.equal(A.LOUD.TP, -1);
  assert.ok(A.CUT_FADE >= 0.010 && A.CUT_FADE <= 0.020);
});

test('parseLoudnorm：讀 ffmpeg 印的 JSON；全靜音（−inf）或沒有 JSON → null', () => {
  const text = 'noise\n{\n\t"input_i" : "-21.30",\n\t"input_tp" : "-5.10",\n\t"input_lra" : "4.00",\n\t"input_thresh" : "-31.60",\n\t"output_i" : "-14.1",\n\t"normalization_type" : "dynamic",\n\t"target_offset" : "0.10"\n}\n';
  assert.deepEqual(A.parseLoudnorm(text), { i: -21.3, tp: -5.1, lra: 4, thresh: -31.6, offset: 0.1 });
  assert.equal(A.parseLoudnorm('{ "input_i" : "-inf", "input_tp" : "-inf", "input_lra" : "0.00", "input_thresh" : "-70.00", "target_offset" : "inf" }'), null);
  assert.equal(A.parseLoudnorm('沒有 json'), null);
  assert.equal(A.parseLoudnorm(undefined), null);
});

test('第二段濾鏡：用量到的值、線性模式、目標 −14／−1', () => {
  const f = A.loudnormFilter({ i: -21.3, tp: -5.1, lra: 4, thresh: -31.6, offset: 0.1 });
  assert.match(f, /^loudnorm=I=-14:TP=-1:LRA=11:measured_I=-21.3:measured_TP=-5.1:measured_LRA=4:measured_thresh=-31.6:offset=0\.1:linear=true/);
  assert.match(f, /aresample=48000$/);   // loudnorm 內部升到 192 kHz，要降回來
});

test('loudnessPlan：增益、線性條件（true peak 加上增益後不能超過 −1）', () => {
  const quiet = A.loudnessPlan({ i: -21.3, tp: -9, lra: 4 });
  assert.equal(quiet.gainDb, 7.3);
  assert.equal(quiet.tp, -1.7);
  assert.equal(quiet.linear, true);
  const peaky = A.loudnessPlan({ i: -21.3, tp: -3, lra: 4 });   // 加 7.3 dB 後 true peak +4.3 → 超過，ffmpeg 會改走動態
  assert.equal(peaky.linear, false);
  const loud = A.loudnessPlan({ i: -10.4, tp: 0, lra: 2.7 });
  assert.equal(loud.gainDb, -3.6);
  assert.equal(loud.linear, true);
  assert.equal(A.loudnessPlan({ i: -21, tp: -12, lra: 15 }).linear, false);   // 響度範圍太大也走動態
});

test('剪接點整理：去掉 ≤0、≥片長、非數字，排序去重；太近時縮短淡化', () => {
  assert.deepEqual(A.cleanPoints([5, 0, -1, 2.0004, 2, 99, NaN, 'x'], 24), [2, 5]);
  assert.equal(A.fadeLength([2, 5, 9]), A.CUT_FADE);
  assert.equal(A.fadeLength([2, 2.01]), 0.005);             // 間距 10 ms → 兩側各最多 5 ms，不重疊
  assert.equal(A.fadeLength([]), A.CUT_FADE);
});

test('淡化時間點：接點的樣本編號與淡化長度；接點上增益 0、兩側線性回 1、相鄰樣本都很小', () => {
  const [w] = A.dipWindows([1.5], 48000, 0.015);
  assert.deepEqual(w, { c: 72000, n: 720 });
  assert.ok(A.dipGain(w.c, w) < 1e-3 + 1 / w.n);
  assert.ok(A.dipGain(w.c - 1, w) <= 1 / w.n + 1e-9);   // 接點前一個樣本
  near(A.dipGain(w.c - 360, w), 0.5, 0.01);
  near(A.dipGain(w.c + 360, w), 0.5, 0.01);
  assert.equal(A.dipGain(w.c - 721, w), 1);
  assert.equal(A.dipGain(w.c + 5000, w), 1);
  assert.deepEqual(A.dipWindows([1], 48000, 0), []);
});

test('applyDipsToFile：只改接點附近、檔案大小（長度）不變、接點兩側樣本跳變大幅下降', () => {
  const dir = tmp();
  const file = path.join(dir, 'x.f32');
  const N = 48000 * 3, ch = 2;
  const f = new Float32Array(N * ch);
  for (let i = 0; i < N; i++) { const v = i < 48000 * 1.5 ? 0.8 : -0.8; f[i * 2] = v; f[i * 2 + 1] = v; }   // 接點處 +0.8 → −0.8，最壞的硬切
  fs.writeFileSync(file, Buffer.from(f.buffer));
  const before = fs.statSync(file).size;
  const n = A.applyDipsToFile(file, { channels: ch, rate: 48000, points: [1.5], fade: 0.015 });
  assert.equal(n, 1);
  assert.equal(fs.statSync(file).size, before);
  const b = fs.readFileSync(file);
  const g = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const c = 72000;
  let jump = 0;
  for (let i = c - 5; i <= c + 5; i++) jump = Math.max(jump, Math.abs(g[i * 2] - g[(i - 1) * 2]));
  assert.ok(jump < 0.01, `接點附近最大跳變應該 < 0.01，實際 ${jump}（硬切是 1.6）`);
  assert.equal(g[0], f[0]);                              // 遠離接點的樣本不動
  assert.equal(g[(c + 1000) * 2], f[(c + 1000) * 2]);
  assert.equal(g[(c - 1000) * 2], f[(c - 1000) * 2]);
  assert.equal(A.applyDipsToFile(file, { channels: ch, rate: 48000, points: [] }), 0);
});

test('快取戳記：來源、剪接點、開關任一改變就不相等', () => {
  const dir = tmp();
  const src = path.join(dir, 'a.bin');
  fs.writeFileSync(src, 'abc');
  const k = A.audioKey({ src, cutpoints: [1, 2] });
  assert.ok(A.stampMatches({ key: k }, A.audioKey({ src, cutpoints: [2, 1.0001, 1] })));   // 順序、重複、毫秒以下的差不影響
  assert.ok(!A.stampMatches({ key: k }, A.audioKey({ src, cutpoints: [1, 2, 3] })));
  assert.ok(!A.stampMatches({ key: k }, A.audioKey({ src, cutpoints: [1, 2], loudnorm: false })));
  assert.ok(!A.stampMatches({ key: k }, A.audioKey({ src, cutpoints: [1, 2], declick: false })));
  assert.ok(!A.stampMatches(null, k));
  fs.writeFileSync(src, 'abcd');
  assert.ok(!A.stampMatches({ key: k }, A.audioKey({ src, cutpoints: [1, 2] })));
  // 關掉淡化時，剪接點不進 key（改 cutpoints.json 不用重新編碼）
  assert.deepEqual(A.audioKey({ src, cutpoints: [1], declick: false }).points, []);
});

test('報告：人聲響度一行、不再因人聲調幅提醒（音效比例只看 targetDb）、沒有 cutpoints.json 時說明', () => {
  const base = { hasAudio: true, before: { i: -21.3, tp: -9 }, after: { i: -14, tp: -1.7 }, linear: true, gainDb: 7.3, cuts: 0, fade: 0, notes: [] };
  const lines = A.audioReportLines(base, { cutpointsExist: false });
  assert.equal(lines[0], '人聲響度 −21.3 LUFS → −14 LUFS（true peak −1.7）');
  assert.ok(!lines.join('\n').includes('人聲被調大'), '人聲一律調到 −14 LUFS，調幅不影響音效比例，不該再提醒');
  assert.match(lines.at(-1), /剪接點微淡化：略過（work\/cutpoints\.json 不存在/);
  const small = A.audioReportLines({ ...base, gainDb: 12, cuts: 3, fade: 0.015 });
  assert.equal(small.length, 2);
  assert.equal(small[1], '剪接點微淡化：3 個接點，前後各 15 ms');
  assert.match(A.audioReportLines({ ...base, linear: false })[0], /動態模式/);
  assert.deepEqual(A.audioReportLines({ hasAudio: false, notes: [] }), []);
  assert.match(A.audioReportLines(base, { loudnorm: false, declick: false }).join('\n'), /--no-loudnorm[\s\S]*--no-declick/);
});

// ---- 音效政策（specs/contracts/sfx.md §4、§10；訊息原文 cli-005.md §3）----
const CONF = {
  pop: { kind: 'sfx', volume: 0.6, targetDb: -7.8, additive: false, maxPerVideo: null },
  tick: { kind: 'sfx', volume: 0.55, targetDb: -16.1, additive: true, maxPerVideo: null },
  click: { kind: 'sfx', volume: 0.331, targetDb: -19.6, additive: true, maxPerVideo: null },
  chapter: { kind: 'sfx', volume: 0.891, targetDb: -3, additive: false, maxPerVideo: null },
  sparkle: { kind: 'sfx', volume: 0.638, targetDb: -5.9, additive: false, maxPerVideo: 6 },
  thunder: { kind: 'sfx', volume: 0.891, targetDb: -3, additive: false, maxPerVideo: 3 },
  'bgm-outro': { kind: 'bgm', volume: 0.562, targetDb: -11, additive: false, maxPerVideo: null },
};

test('SFX_RULES：3 s、0.2 s、每分 2 顆、上限比人聲小 3 dB', () => {
  assert.deepEqual({ ...A.SFX_RULES }, { gapSec: 3, extraGapSec: 0.2, perMinute: 2, capDb: -3 });
});

test('sfxBudget：次數、附加音效、bgm 不算、資訊行', () => {
  const b = A.sfxBudget([
    { id: 'm01', name: 'click', at: 1.0, volume: 0.331, main: false },
    { id: 'm01', name: 'click', at: 1.63, volume: 0.331, main: false },
    { id: 's02', name: 'pop', at: 1.2, volume: 0.6, main: true },
    { id: 'x', name: 'bgm-outro', at: 50, volume: 0.562, main: true },
  ], CONF, { outDur: 120 });
  assert.deepEqual(b.count, { click: 2, pop: 1 });
  assert.deepEqual(b.over, []);
  assert.deepEqual(b.dense, []);
  assert.deepEqual(b.loud, []);
  assert.deepEqual(b.warnings, []);
  assert.equal(b.lines[0], '音效次數：pop 1、click 2、sparkle 0／6、thunder 0／3');
  assert.equal(b.lines[1], '音效密度：主音效平均 0.5 顆／分（上限：任一分鐘 ≤ 2 顆，超過才 ⚠），附加音效 2 顆');
  assert.deepEqual(b.levels, { main: [-7.8, -7.8, -7.8], extra: [-19.6, -19.6] });
  assert.equal(A.sfxBudget([], CONF, { outDur: 60 }).lines[1], '音效密度：主音效 0 顆，附加音效 0 顆');
});

test('sfxBudget：thunder 4 次 → 1 行 ⚠、四顆都保留', () => {
  const cues = [12.4, 185.1, 404, 541.2].map((at, i) => ({ id: `s${i + 1}`, name: 'thunder', at, volume: 0.891, main: true }));
  const b = A.sfxBudget(cues, CONF, { outDur: 600 });
  assert.equal(b.over.length, 1);
  assert.equal(b.over[0].n, 4);
  assert.equal(b.over[0].cues.length, 4);
  assert.equal(b.warnings[0], '⚠ 音效 thunder 用了 4 次，每集上限 3 次（s1 0:12.40、s2 3:05.10、s3 6:44.00、s4 9:01.20）→ 留最重要的 3 次，其他段寫 "sfx": null 或換成 alert');
});

test('sfxBudget：一分鐘 3 顆主音效 ⚠，tick 不算', () => {
  const cues = [
    ...[5, 20, 40].map((at, i) => ({ id: `s${i + 1}`, name: 'pop', at, volume: 0.6, main: true })),
    ...[6, 7, 8, 9, 10].map((at) => ({ id: 's1', name: 'tick', at, volume: 0.55, main: false })),
    { id: 's9', name: 'click', at: 30, volume: 0.331, main: true },   // 主音效但 additive：不算
  ];
  const b = A.sfxBudget(cues, CONF, { outDur: 120 });
  assert.deepEqual(b.dense, [{ from: 0, to: 60, n: 3, ids: ['s1', 's2', 's3'] }]);
  assert.equal(b.warnings[0], '⚠ 音效密度：1 個一分鐘超過 2 顆主音效（0:00–1:00 3 顆；附加音效 tick、click 不算）→ 每分鐘留最重要的 2 顆（chapter、thunder、shine、sparkle、alert、success 先留，ding、impact 先拿掉：那段寫 "sfx": null）');
});

test('sfxBudget＋報告：chapter 調大 2 dB → 比人聲只小 1 dB，⚠ 音效比例', () => {
  const v = +(0.891 * 10 ** (2 / 20)).toFixed(3);
  const b = A.sfxBudget([{ id: 's05', name: 'chapter', at: 62.4, volume: v, main: true }, { id: 's06', name: 'tick', at: 70, volume: 0.55, main: false }], CONF, { outDur: 120 });
  assert.deepEqual(b.loud, [{ id: 's05', name: 'chapter', at: 62.4, relDb: -1 }]);
  const w = '⚠ 音效比例：1 顆音效比人聲下 3 dB 還大聲（s05 chapter 1:02.40 −1.0 dB → sfxVolume 再減 2.0）→ 在剪輯台把這幾段的音效調小，或改 plan.json 那段的 sfxVolume';
  assert.equal(b.warnings.at(-1), w);
  const info = { hasAudio: true, before: { i: -26, tp: -12 }, after: { i: -14, tp: -1.2 }, linear: true, gainDb: 12, cuts: 0, fade: 0, notes: [] };
  const lines = A.audioReportLines(info, { sfx: b });
  assert.equal(lines[1], '音效比例：主音效比人聲小 1.0–1.0 dB（中位 1.0）、附加音效小 16.1–16.1 dB；上限是比人聲小 3 dB');
  assert.equal(lines[2], w);
  assert.match(A.audioReportLines(info, { sfx: b, loudnorm: false }).join('\n'), /音效比例：沒有檢查（用了 --no-loudnorm/);
  assert.ok(A.audioReportLines(info, { sfx: A.sfxBudget([], CONF) }).includes('音效比例：這支片沒有音效'));
  // edit.volume.voice 調大 3 dB：音效相對變小
  assert.deepEqual(A.sfxBudget([{ id: 's05', name: 'chapter', at: 62.4, volume: v, main: true }], CONF, { voiceDb: 3 }).loud, []);
});

test('audioKey：沒有 look 時戳記和改版前一樣；look 任一欄位不同就不相等', () => {
  const dir = tmp();
  const src = path.join(dir, 'a.bin');
  fs.writeFileSync(src, 'abc');
  const k = A.audioKey({ src, cutpoints: [1] });
  assert.deepEqual(Object.keys(k), ['v', 'size', 'mtimeMs', 'loudnorm', 'target', 'declick', 'fade', 'points']);
  assert.deepEqual(A.audioKey({ src, cutpoints: [1], look: null }), k);
  const look = { v: 1, color: 0.8, lut: '56969a5a84ac', slim: 0.6, footage: 'rough-look.mp4' };
  const kl = A.audioKey({ src, cutpoints: [1], look });
  assert.deepEqual(kl.look, look);
  assert.ok(!A.stampMatches({ key: k }, kl));
  assert.ok(!A.stampMatches({ key: kl }, A.audioKey({ src, cutpoints: [1], look: { ...look, slim: 0 } })));
  assert.ok(A.stampMatches({ key: kl }, A.audioKey({ src, cutpoints: [1], look: { ...look } })));
});

// ---- 剪接點凹洞（specs/005-sfx/spec.md FR-030、FR-031）----
// 3 s、48 kHz、立體聲：白雜訊底噪 −44 dBFS RMS；1.2–1.8 s 疊「講話」−20 dBFS；接點 1.0 s（純底噪）與 1.75 s（講話尾巴）
function synthCutAudio() {
  const R = 48000, n = 3 * R, x = new Float32Array(n * 2);
  let seed = 20261031;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  const floorA = 10 ** (-44 / 20) * Math.sqrt(3), speechA = 10 ** (-20 / 20) * Math.sqrt(3);   // 均勻分布 [−a, a] 的 RMS＝a/√3
  for (let i = 0; i < n; i++) {
    const t = i / R;
    const sp = t >= 1.2 && t < 1.8 ? Math.min(1, (t - 1.2) / 0.01, (1.8 - t) / 0.01) : 0;
    for (let c = 0; c < 2; c++) x[i * 2 + c] = rnd() * floorA + sp * rnd() * speechA;
  }
  return x;
}
function dipped(x, fade) {
  const f = path.join(tmp(), 'cut.f32');
  fs.writeFileSync(f, Buffer.from(x.buffer.slice(0)));
  if (fade > 0) A.applyDipsToFile(f, { channels: 2, rate: 48000, points: [1.0, 1.75], fade });
  const b = fs.readFileSync(f);
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

test('cutDips：現行 15 ms 微淡化在底噪上不挖洞（低於底噪 −6 dB 約 13 ms < 20 ms）', (t) => {
  const ref = synthCutAudio();
  const r = A.cutDips(dipped(ref, A.CUT_FADE), { points: [1.0, 1.75], ref });
  t.diagnostic(JSON.stringify(r));
  near(r[0].floorDb, -44, 1.5);
  assert.ok(r[0].runMs >= 9 && r[0].runMs <= 16, `底噪接點 runMs ${r[0].runMs}`);
  assert.equal(r.filter((d) => d.hole).length, 0);
  assert.equal(r[1].runMs, 0, '講話尾巴的接點不會掉到底噪以下');
});

test('cutDips：30 ms 微淡化會挖出凹洞（重現作者在 −44 dB 底噪旁白上的觀察）', () => {
  const ref = synthCutAudio();
  const r = A.cutDips(dipped(ref, 0.03), { points: [1.0, 1.75], ref });
  assert.equal(r[0].hole, true);
  assert.ok(r[0].runMs >= 25 && r[0].runMs <= 32, `runMs ${r[0].runMs}`);
  assert.equal(r[1].hole, false);
});

test('cutDips：硬切（不淡化）0 凹洞；原本就有的數位靜音不算處理造成的', () => {
  const ref = synthCutAudio();
  assert.equal(A.cutDips(ref, { points: [1.0, 1.75], ref }).filter((d) => d.hole).length, 0);
  const holey = Float32Array.from(ref);
  for (let i = Math.round(0.98 * 48000); i < Math.round(1.02 * 48000); i++) { holey[i * 2] = 0; holey[i * 2 + 1] = 0; }
  const r = A.cutDips(holey, { points: [1.0], ref: holey });
  assert.equal(r[0].hole, false);
  assert.equal(r[0].preexisting, true);
});

// ---- 需要 ffmpeg 的部分 ----
const SKIP = hasFfmpeg ? false : '沒有 ffmpeg';

function makeClip(dir, { volume = 0.1, seconds = 6, audio = true } = {}) {
  const f = path.join(dir, 'clip.mp4');
  // 兩段不同頻率硬接（第 3 秒是剪接點），聲音不連續
  const args = ['-f', 'lavfi', '-i', `testsrc=s=320x180:r=30:d=${seconds}`];
  if (audio) args.push('-f', 'lavfi', '-i', `sine=f=300:r=48000:d=${seconds / 2}`, '-f', 'lavfi', '-i', `sine=f=900:r=48000:d=${seconds / 2}`,
    '-filter_complex', `[1:a][2:a]concat=n=2:v=0:a=1,volume=${volume}[a]`, '-map', '0:v', '-map', '[a]', '-c:a', 'aac');
  ff([...args, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', f]);
  return f;
}

test('measureLoudness：第一次量、第二次用快取、檔案變了重量', { skip: SKIP }, () => {
  const dir = tmp();
  const clip = makeClip(dir);
  const cache = path.join(dir, '.cache', 'loudness.json');
  let miss = 0;
  const m1 = A.measureLoudness(clip, cache, () => miss++);
  assert.equal(miss, 1);
  assert.ok(Number.isFinite(m1.i) && m1.i < -14);
  const m2 = A.measureLoudness(clip, cache, () => miss++);
  assert.equal(miss, 1, '第二次不該再量');
  assert.deepEqual(m2, m1);
  const clip2 = makeClip(dir, { volume: 0.3 });   // 同檔名、內容與修改時間都變
  const m3 = A.measureLoudness(clip2, cache, () => miss++);
  assert.equal(miss, 2);
  assert.ok(m3.i > m1.i + 5);
});

test('整支流程：響度到 −14 LUFS（±1）、true peak ≤ −1、影片長度與格數不變', { skip: SKIP }, () => {
  const dir = tmp();
  const clip = makeClip(dir, { volume: 0.05 });
  const dst = path.join(dir, 'out', 'rough.mp4');
  const cacheDir = path.join(dir, '.cache');
  const info = A.encodeFootagePolished(clip, dst, { cacheDir, cutpoints: [3] });
  assert.equal(info.hasAudio, true);
  assert.equal(info.cuts, 1);
  near(info.after.i, -14, 1);
  assert.ok(info.after.tp <= -1 + 0.3, `true peak ${info.after.tp}`);   // AAC 重新編碼最多多出一點點
  assert.ok(info.before.i < -20);
  near(probeDuration(dst), probeDuration(clip), 1 / 30);
  assert.equal(probeMedia(dst).hasAudio, true);
  // 對照：兩個都關掉，和以前的 encodeFootage 一樣
  const plain = path.join(dir, 'plain.mp4');
  const none = A.encodeFootagePolished(clip, plain, { cacheDir, cutpoints: [3], loudnorm: false, declick: false });
  assert.equal(none.cuts, 0);
  near(probeDuration(plain), probeDuration(dst), 1 / 30);
  // 暫存的 PCM 用完要清掉
  assert.ok(!fs.existsSync(path.join(cacheDir, 'declick.f32')));
});

test('沒有聲音的底片：略過並說明、不出錯；沒有剪接點：只做響度', { skip: SKIP }, () => {
  const dir = tmp();
  const mute = makeClip(dir, { audio: false });
  const out = path.join(dir, 'mute-out.mp4');
  const info = A.encodeFootagePolished(mute, out, { cacheDir: path.join(dir, '.c') });
  assert.equal(info.hasAudio, false);
  assert.match(info.notes[0], /沒有聲音/);
  assert.ok(fs.existsSync(out));
  const withA = makeClip(dir, { volume: 0.05 });
  const i2 = A.encodeFootagePolished(withA, path.join(dir, 'o2.mp4'), { cacheDir: path.join(dir, '.c2'), cutpoints: [] });
  assert.equal(i2.cuts, 0);
  assert.ok(i2.after);
});

test('edit.cuts 的接點（含 joins 為 none）：接點兩側各有 0.02 秒的人聲淡出／淡入', async () => {
  const L = await lib();
  const cues = parseSrt(makeSrt({ n: 12 }));
  const res = resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], edit: { cuts: [[20, 21], [30, 31]], joins: [{ at: 20, type: 'none' }] }, scenes: [{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '字卡' } }] }, cues, videoDur: 44, lib: L, outDir: os.tmpdir() });
  assert.deepEqual(res.errors, []);
  const html = buildMain({ items: res.items, videoDur: res.outDur, captions: { compId: 'captions', file: 'compositions/captions.html' }, pip: res.globals.pip, sideShift: res.globals.sideShift, footage: res.footage, editFx: res.editFx }).html;
  assert.equal((html.match(/data-fade-out="0\.02"/g) || []).length, 2);
  assert.equal((html.match(/data-fade-in="0\.02"/g) || []).length, 2);
  assert.equal(res.outDur, 42);   // 44 − 2 秒的 cuts；淡化不改長度
});

test('renderBgmClip：長度精準、淡入、增益；資料夾模式同參數不重做', { skip: SKIP }, () => {
  const dir = tmp();
  const src = path.join(dir, 'bgm.wav');
  ff(['-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=30', '-ac', '2', '-c:a', 'pcm_s16le', src]);
  const out = A.renderBgmClip(src, path.join(dir, 'clip.wav'), { from: 2, dur: 16, fadeIn: 3.2, fadeOut: 1.85, gain: 0.5 });
  near(probeDuration(out.file), 16, 1 / 48000 + 1e-6);
  const rms = (ss, d) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(ss), '-t', String(d), '-i', out.file, '-ac', '1', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 });
    const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
    let e = 0; for (const v of f) e += v * v;
    return 10 * Math.log10(e / f.length);
  };
  assert.ok(rms(8, 0.5) - rms(0.05, 0.1) >= 20, '第 0.1 s 附近應該比中段小 ≥ 20 dB（淡入）');
  near(rms(8, 0.5), 20 * Math.log10(0.5) + 20 * Math.log10(1 / Math.SQRT2) + 20 * Math.log10(0.125), 0.5);   // lavfi sine 振幅 1/8
  const a = A.renderBgmClip(src, path.join(dir, 'assets'), { dur: 10, fadeIn: 1, fadeOut: 1, gain: 1 });
  assert.match(path.basename(a.file), /^bgm-[0-9a-f]{12}\.wav$/);
  const m = fs.statSync(a.file).mtimeMs;
  assert.equal(A.renderBgmClip(src, path.join(dir, 'assets'), { dur: 10, fadeIn: 1, fadeOut: 1, gain: 1 }).file, a.file);
  assert.equal(fs.statSync(a.file).mtimeMs, m, '同參數不重做');
  assert.notEqual(A.renderBgmClip(src, path.join(dir, 'assets'), { dur: 10, fadeIn: 1, fadeOut: 1, gain: 0.9 }).file, a.file);
  // 錯誤原文（cli-005 §3.4）：每則都有 → 改法
  assert.throws(() => A.renderBgmClip(src, path.join(dir, 'x.wav'), { dur: 0 }), { message: 'renderBgmClip：dur 要是正數，現在是 0 → outro.from 要在片尾之前，改成更早的句號' });
  const bad = path.join(dir, 'bad.wav'); fs.writeFileSync(bad, 'not a wav');
  assert.throws(() => A.renderBgmClip(bad, path.join(dir, 'y.wav'), { dur: 5 }), (e) => e.message.startsWith('ffmpeg 產生結尾配樂失敗：') && e.message.endsWith(` → 確認 ${bad} 是完整的 wav（ffmpeg -i 那個檔看得到長度）；壞了就 git checkout 那個檔`));
});

// 真實素材（gated）：AUTO_EDIT_RMS_PROJECT=projects/example node --test dev/tests/audio.test.mjs
const RMS_PROJECT = process.env.AUTO_EDIT_RMS_PROJECT;
const rmsDir = RMS_PROJECT ? path.resolve(process.cwd(), RMS_PROJECT) : null;
const rmsSkip = !RMS_PROJECT ? '沒設 AUTO_EDIT_RMS_PROJECT' : !hasFfmpeg ? '沒有 ffmpeg'
  : !(fs.existsSync(path.join(rmsDir, 'work', 'rough.mp4')) && fs.existsSync(path.join(rmsDir, 'work', 'cutpoints.json')))
    ? `沒有 ${RMS_PROJECT}/work/rough.mp4 或 work/cutpoints.json（先照 AGENTS.md「剪乾淨」跑到第 7 步）` : false;
test('剪接點 RMS（真實素材）：現行 15 ms 微淡化 0 個凹洞', { skip: rmsSkip }, (t) => {
  const raw = path.join(tmp(), 'rough.f32');
  ff(['-i', path.join(rmsDir, 'work', 'rough.mp4'), '-vn', '-map', '0:a:0', '-af', 'aresample=48000:first_pts=0', '-ac', '2', '-ar', '48000', '-f', 'f32le', raw]);
  const cp = JSON.parse(fs.readFileSync(path.join(rmsDir, 'work', 'cutpoints.json'), 'utf8')).cuts || [];
  const points = A.cleanPoints(cp.map((c) => c.at));
  const kindOf = new Map(cp.map((c) => [A.cleanPoints([c.at])[0], c.kind]));
  const before = fs.readFileSync(raw);
  const ref = new Float32Array(before.buffer.slice(before.byteOffset, before.byteOffset + before.length));
  A.applyDipsToFile(raw, { channels: 2, rate: 48000, points, fade: A.CUT_FADE });
  const after = fs.readFileSync(raw);
  const r = A.cutDips(new Float32Array(after.buffer, after.byteOffset, after.length / 4), { points, ref });
  const f1 = (v) => String(Number.isFinite(v) ? v.toFixed(1) : v).replace('-', '−');
  for (const d of r) t.diagnostic(`剪接點 ${d.at}s（${kindOf.get(d.at) || '?'}）底噪 ${f1(d.floorDb)} dBFS｜處理後最低 ${f1(d.minDb)} dBFS｜低於底噪 −6 dB 共 ${d.runMs} ms｜${d.hole ? '凹洞' : '不是凹洞'}${d.preexisting ? '（原本就有低於底噪的地方）' : ''}`);
  const holes = r.filter((d) => d.hole).length;
  t.diagnostic(`合計：${r.length} 個接點，${holes} 個凹洞（門檻：連續 ≥ 20 ms 低於底噪 −6 dB、而且比處理前低 ≥ 6 dB）`);
  assert.equal(holes, 0);
});

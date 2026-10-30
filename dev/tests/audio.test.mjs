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

test('報告：人聲響度一行、調幅 ≥ 3 dB 時提醒音效比例、沒有 cutpoints.json 時說明', () => {
  const base = { hasAudio: true, before: { i: -21.3, tp: -9 }, after: { i: -14, tp: -1.7 }, linear: true, gainDb: 7.3, cuts: 0, fade: 0, notes: [] };
  const lines = A.audioReportLines(base, { cutpointsExist: false });
  assert.equal(lines[0], '人聲響度 −21.3 LUFS → −14 LUFS（true peak −1.7）');
  assert.match(lines[1], /人聲被調大 7\.3 dB.*音效相對人聲小了 7\.3 dB.*edit\.volume\.sfx/);
  assert.match(lines.at(-1), /剪接點微淡化：略過（work\/cutpoints\.json 不存在/);
  const small = A.audioReportLines({ ...base, gainDb: 1.2, cuts: 3, fade: 0.015 });
  assert.equal(small.length, 2);
  assert.equal(small[1], '剪接點微淡化：3 個接點，前後各 15 ms');
  assert.match(A.audioReportLines({ ...base, linear: false })[0], /動態模式/);
  assert.deepEqual(A.audioReportLines({ hasAudio: false, notes: [] }), []);
  assert.match(A.audioReportLines(base, { loudnorm: false, declick: false }).join('\n'), /--no-loudnorm[\s\S]*--no-declick/);
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

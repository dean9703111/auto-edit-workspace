// 配樂（選用）：曲庫登錄、底樂的鋪法與混音、music.mjs 的指令（要 ffmpeg；不需要 ACE-Step）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, imp, needs } from './helpers.mjs';

const M = await imp('lib/music.mjs');
const { probeDuration } = await imp('lib/ff.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-music-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const tone = (file, secs, freq = 220) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=f=${freq}:d=${secs}`, '-af', 'tremolo=f=2:d=0.5', '-ac', '2', '-ar', '48000', file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return file;
};

test('bedPlan：鋪滿整支片；有片尾配樂就在它起播後 3 秒內淡完；music 是 null 或影片太短不鋪', () => {
  assert.deepEqual(M.bedPlan({ music: 'a' }, { outDur: 120 }), { at: 0, dur: 120, fadeIn: 2, fadeOut: 3 });
  assert.equal(M.bedPlan({ music: 'a' }, { outDur: 120, outroAt: 100 }).dur, 103);
  assert.equal(M.bedPlan({ music: 'a' }, { outDur: 120, outroAt: 119 }).dur, 120, '不超過片長');
  assert.equal(M.bedPlan({ music: null }, { outDur: 120 }), null);
  assert.equal(M.bedPlan(null, { outDur: 120 }), null);
  assert.equal(M.bedPlan({ music: 'a' }, { outDur: 0.5 }), null);
});

test('曲庫：registerTrack 寫登錄檔、已經有的曲名不覆寫、曲名格式不對丟錯；loadMusic 這一集的蓋過工作區同名的，欄位補成片尾配樂能用的', () => {
  const shared = path.join(tmp, 'shared'), project = path.join(tmp, 'proj');
  const d = M.musicDirs({ sharedDir: shared, projectDir: project });
  M.registerTrack(d.shared, 'bed-a', { kind: 'bgm', zh: '工作區的' });
  M.registerTrack(d.shared, 'bed-b', { kind: 'bgm', zh: '只有工作區', credit: 'Music: X' });
  M.registerTrack(d.project, 'bed-a', { kind: 'bgm', zh: '這一集的' });
  assert.throws(() => M.registerTrack(d.shared, 'bed-a', {}), /曲庫已經有「bed-a」/);
  assert.throws(() => M.registerTrack(d.shared, 'Bad Name', {}), /小寫英文開頭/);
  const lib = M.loadMusic({ sharedDir: shared, projectDir: project });
  assert.deepEqual(Object.keys(lib).sort(), ['bed-a', 'bed-b']);
  assert.equal(lib['bed-a'].scope, 'project');
  assert.equal(lib['bed-a'].file, path.join(d.project, 'bed-a.wav'));
  assert.equal(lib['bed-b'].kind, 'bgm');
  assert.equal(lib['bed-b'].targetDb, M.OUTRO_DB);
  assert.equal(lib['bed-b'].credit, 'Music: X');
  assert.deepEqual(Object.keys(M.loadMusic({ sharedDir: shared })), ['bed-a', 'bed-b']);
  assert.deepEqual(M.loadMusic({ sharedDir: path.join(tmp, 'none') }), {});
});

test('normalizeTrack：48 kHz 立體聲、響度調到 −20 LUFS；renderBedClip：比影片短就循環鋪滿、音量照給的 dB、同參數不重做、太短的曲子丟錯', async (t) => {
  if (!(await needs(t, 'ffmpeg'))) return;
  const src = tone(path.join(tmp, 'src.wav'), 30);
  const lib = path.join(tmp, 'lib.wav');
  const n = M.normalizeTrack(src, lib);
  assert.ok(Math.abs(n.lufs - M.LIB_LUFS) <= 0.5, `響度 ${n.lufs}`);
  assert.ok(Math.abs(n.dur - 30) < 0.2);
  const out = path.join(tmp, 'assets');
  const a = M.renderBedClip(lib, out, { dur: 75, gainDb: -14 });
  assert.ok(Math.abs(probeDuration(a.file) - 75) < 0.05, '循環鋪滿 75 秒');
  assert.equal(a.ducked, false);
  const lufs = M.measureLufs(a.file);
  assert.ok(Math.abs(lufs - (M.LIB_LUFS - 14)) <= 1.5, `沒有人聲時整段固定音量：${lufs}`);
  const m1 = fs.statSync(a.file).mtimeMs;
  assert.equal(M.renderBedClip(lib, out, { dur: 75, gainDb: -14 }).file, a.file);
  assert.equal(fs.statSync(a.file).mtimeMs, m1, '同參數不重做');
  // 有人聲（這裡用另一個音當 key）：講話時壓低，整體比固定音量那一版高不超過 lift
  const key = tone(path.join(tmp, 'key.wav'), 75, 440);
  const b = M.renderBedClip(lib, out, { dur: 75, gainDb: -14, key });
  assert.equal(b.ducked, true);
  assert.notEqual(b.file, a.file);
  const d = M.measureLufs(b.file) - lufs;
  assert.ok(d > -6 && d < M.BED.lift + 0.5, `壓低後和固定音量差 ${d.toFixed(1)} dB`);
  const short = tone(path.join(tmp, 'short.wav'), 8);
  assert.throws(() => M.renderBedClip(short, out, { dur: 30, gainDb: -14 }), /當底樂至少要 20 秒/);
});

test('music.mjs：沒有子指令印說明；list 空曲庫說怎麼放；gen 風格打錯、keep 沒有候選、use 不在曲庫都 ✖ 並說怎麼改', () => {
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'music.mjs'), ...a], { encoding: 'utf8' });
  assert.match(run().stdout, /music\.mjs gen/);
  const g = run('gen', '--style', '沒有這種');
  assert.equal(g.status, 1);
  assert.match(g.stdout, /沒有「沒有這種」這個風格 → 可用：輕快科技、溫暖敘事、沉穩專業、活力教學/);
  const k = run('keep', '1', '--name', 'x-y', '--from', path.join(tmp, 'no-candidates'));
  assert.equal(k.status, 1);
  assert.match(k.stdout, /找不到候選/);
  const u = run('use', 'no-such-song-xyz');
  assert.equal(u.status, 1);
  assert.match(u.stdout, /工作區曲庫沒有「no-such-song-xyz」/);
  assert.equal(run('nope').status, 1);
});

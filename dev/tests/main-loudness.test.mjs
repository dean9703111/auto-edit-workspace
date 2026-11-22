// 084 接主軌時先把每個檔的音量拉齊（lib/rough/main-track.mjs matchGains、joinMain）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, imp, tmpDir } from './helpers.mjs';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const ffSkip = hasFfmpeg ? false : '要 ffmpeg';
const tool = (name, args) => spawnSync(process.execPath, [path.join(TOOLS, name), ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
const loud = (file, ss, t) => {
  const err = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(ss), '-t', String(t), '-i', file, '-vn', '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return Number(err.slice(err.lastIndexOf('Summary:')).match(/I:\s*(-?[\d.]+) LUFS/)[1]);
};

test('matchGains：以中間值為準，大聲的調小、小聲的調大；調大會超過峰值就把目標往下降；差不到 1.5 dB、只有一個檔、靜音的不動', async () => {
  const { matchGains } = await imp('lib/rough/main-track.mjs');
  // minimax-ep1 的五個檔：開場、結語是攝影機收音，中間三段是另外錄的聲音檔
  assert.deepEqual(matchGains([{ I: -10.3, tp: 0.1 }, { I: -21, tp: -3.4 }, { I: -19.9, tp: -4.2 }, { I: -19.7, tp: -3.1 }, { I: -11, tp: 0.1 }]), { target: -19.7, gains: [-9.4, 1.3, 0, 0, -8.7] });
  // 小聲的那個只能 +1（峰值 −2 → −1）：目標降到 −24，大聲的多調小一點，兩個一樣大
  assert.deepEqual(matchGains([{ I: -10, tp: -0.5 }, { I: -25, tp: -2 }]), { target: -24, gains: [-14, 1] });
  assert.deepEqual(matchGains([{ I: -14, tp: -2 }, { I: -14.8, tp: -2 }]), { target: null, gains: [0, 0] }, '差不到 1.5 dB');
  assert.deepEqual(matchGains([{ I: -14, tp: -2 }]), { target: null, gains: [0] }, '只有一個檔');
  assert.deepEqual(matchGains([{ I: -12, tp: -2 }, null, { I: -70, tp: -60 }, { I: -20, tp: -6 }]), { target: -16, gains: [-4, 0, 0, 4] }, '沒聲音、靜音的不算');
});

test('joinMain：兩個聲音檔差 14 dB，接成主軌後一樣大聲；main.json 記每個檔的響度與調了幾 dB', { skip: ffSkip }, () => {
  const project = tmpDir(null, 'hf-loud-');
  const voice = path.join(project, 'assets', 'voice');
  fs.mkdirSync(voice, { recursive: true });
  fs.mkdirSync(path.join(project, 'work', 'hyperframes'), { recursive: true });
  // 「講話」：0.25 秒一個音、中間 0.15 秒停，振幅差 5 倍（約 14 dB）
  const tone = (f, amp) => assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='if(lt(mod(t,0.4),0.25),${amp}*sin(2*PI*300*t),0)':s=48000:d=6`, path.join(voice, f)], { encoding: 'utf8' }).status, 0);
  tone('01-a.wav', 0.5);
  tone('02-b.wav', 0.1);
  const r = tool('media.mjs', ['main', '--project', project]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /音量拉齊（每個檔調到 -?[\d.]+ LUFS）：01-a\.wav -?[\d.]+ LUFS -[\d.]+ dB、02-b\.wav -?[\d.]+ LUFS \+[\d.]+ dB/);
  const clips = JSON.parse(fs.readFileSync(path.join(project, 'work', 'main.json'), 'utf8')).clips;
  assert.ok(clips[0].gainDb < 0 && clips[1].gainDb > 0 && clips[0].loudness - clips[1].loudness > 12, JSON.stringify(clips));
  const main = path.join(project, 'work', 'main.mp4');
  const a = loud(main, 0.5, 5), b = loud(main, 6.5, 5);
  assert.ok(Math.abs(a - b) < 1, `接好的主軌兩段要一樣大聲：${a}、${b}`);
});

test('joinMain：各檔差不多大聲就不動（main.json 沒有 gainDb）', { skip: ffSkip }, () => {
  const project = tmpDir(null, 'hf-loud-same-');
  const voice = path.join(project, 'assets', 'voice');
  fs.mkdirSync(voice, { recursive: true });
  fs.mkdirSync(path.join(project, 'work', 'hyperframes'), { recursive: true });
  for (const [f, amp] of [['01-a.wav', 0.3], ['02-b.wav', 0.28]]) assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${amp}*sin(2*PI*300*t)':s=48000:d=3`, path.join(voice, f)], { encoding: 'utf8' }).status, 0);
  const r = tool('media.mjs', ['main', '--project', project]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /音量：各檔差不到 1\.5 dB，不用拉齊/);
  const clips = JSON.parse(fs.readFileSync(path.join(project, 'work', 'main.json'), 'utf8')).clips;
  assert.ok(clips.every((c) => !('gainDb' in c) && typeof c.loudness === 'number'), JSON.stringify(clips));
});

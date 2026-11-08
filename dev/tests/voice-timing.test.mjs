// #N@詞 對準開口：逐字稿給的時間落在停頓裡（那一刻沒在說話）就移到停頓結束；用字數估的只分給有在說話的時間（lib/time.mjs、lib/speech.mjs speechPauses）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { imp } from './helpers.mjs';

const { onVoice, voicedAt, cueSeconds, parseTime } = await imp('lib/time.mjs');
const { speechPauses } = await imp('lib/speech.mjs');
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

// 一句 10.0–14.0 秒，中間停 11.2–11.8（0.6 秒）
const C = { n: 3, start: 10, end: 14, text: '今天先安裝工具再開始' };
const PAUSES = [[8.5, 9.9], [11.2, 11.8], [14.2, 16]];

test('onVoice：詞的起點落在句子裡的停頓 → 停頓結束（開口）；結尾落在停頓裡 → 停頓開始；不在停頓、停頓太長或不在這句都不動', () => {
  assert.equal(onVoice(11.4, C, PAUSES), 11.8);
  assert.equal(onVoice(11.4, C, PAUSES, { end: true }), 11.2);
  assert.equal(onVoice(10.6, C, PAUSES), null, '在說話：不動');
  assert.equal(onVoice(11.22, C, PAUSES), null, '停頓的邊上（0.05 秒內）不算');
  assert.equal(onVoice(11.4, C, [[10.5, 13.0]]), null, '超過 2 秒的停頓不是句中換氣，不猜');
  assert.equal(onVoice(15, C, PAUSES), null, '不在這句（前後 0.3 秒外）的停頓不管');
});

test('voicedAt：字數估的位置只分給有在說話的時間，跳過停頓；停頓佔掉大半句就不可信', () => {
  // 有在說話：10.0–11.2（1.2）＋11.8–14.0（2.2）＝3.4 秒；一半（1.7 秒）落在停頓之後 0.5 秒
  assert.equal(voicedAt(0.5, C, PAUSES), 12.3);
  assert.equal(voicedAt(0, C, PAUSES), 10);
  assert.equal(voicedAt(1, C, PAUSES), 14);
  assert.equal(voicedAt(0.5, C, [[10.2, 13.5]]), null, '只剩 0.5 秒有聲音：照舊用整句');
});

test('cueSeconds：真實時間落在停頓裡就對到開口並記下來；用字數估的照說話時間分；沒有停頓資料時和以前一樣', () => {
  // 逐字稿把「工具」放在 11.4（停頓裡，前一個字收尾的時間）
  const words = [...C.text].map((ch, k) => ({ text: ch, start: 10 + k * 0.4, end: 10.35 + k * 0.4 }));
  words[5] = { text: '工', start: 11.4, end: 11.6 };
  words[6] = { text: '具', start: 11.6, end: 11.75 };
  const cues = Object.assign([C], { words, approx: new Set(), voiceMoved: new Set(), pauses: PAUSES });
  const r = cueSeconds(parseTime('#3@工具'), cues);
  assert.equal(r.sec, 11.8);
  assert.deepEqual([...cues.voiceMoved], ['#3@工具']);
  // 逐字稿找不到的詞：字數比例只分給有在說話的時間
  const noWord = Object.assign([C], { words: [{ text: '別', start: 30, end: 30.2 }], approx: new Set(), voiceMoved: new Set(), pauses: PAUSES });
  const est = cueSeconds(parseTime('#3@安裝'), noWord);
  assert.ok(est.approx);
  assert.equal(est.sec, voicedAt(3 / 10, C, PAUSES), '「安裝」前面有 3 個字（今天先）');
  assert.equal(est.sec, 11.02, '有在說話的 3.4 秒 × 0.3：停頓之前');
  // 沒有停頓資料：照舊（整句平均）
  const plain = Object.assign([C], { words: [{ text: '別', start: 30, end: 30.2 }], approx: new Set() });
  assert.equal(cueSeconds(parseTime('#3@安裝'), plain).sec, 11.2, '整句 4 秒 × 0.3');
});

test('speechPauses：量得到句中的停頓、會快取；幾乎全是靜音（合成的測試影片）回 null，不影響時間', { skip: hasFfmpeg ? false : '要 ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-timing-'));
  try {
    const wav = path.join(dir, 'speech.wav');
    const mk = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-t', '1', '-i', 'sine=frequency=300:sample_rate=48000', '-f', 'lavfi', '-t', '0.5', '-i', 'anullsrc=r=48000:cl=mono',
      '-f', 'lavfi', '-t', '1', '-i', 'sine=frequency=300:sample_rate=48000', '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1', wav]);
    assert.equal(mk.status, 0, String(mk.stderr));
    const cache = path.join(dir, 'speech-pauses.json');
    const a = speechPauses(wav, cache);
    assert.ok(a && Number.isFinite(a.threshold), JSON.stringify(a));
    assert.equal(a.pauses.length, 1, JSON.stringify(a.pauses));
    assert.ok(Math.abs(a.pauses[0][0] - 1) < 0.06 && Math.abs(a.pauses[0][1] - 1.5) < 0.06, JSON.stringify(a.pauses));
    assert.ok(fs.existsSync(cache));
    assert.deepEqual(speechPauses(wav, cache), a, '第二次讀快取');
    const silent = path.join(dir, 'silent.wav');
    assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-t', '3', '-i', 'anullsrc=r=48000:cl=mono', silent]).status, 0);
    assert.equal(speechPauses(silent, path.join(dir, 'silent.json')), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

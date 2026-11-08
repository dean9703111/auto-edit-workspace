// 說話區間：rough.mp4 的能量包絡 → 門檻（相對這支音軌自己的音量）→ 說話區間 [[起, 迄], …]；media.mjs 的 snap-srt、srt-align 和
// build 的 #N@詞 對準開口（speechPauses → cues.pauses → lib/time.mjs onVoice／voicedAt）用同一套，「哪裡在說話」只有一個定義
//   envelope(file) → { db, hop }；pickThreshold(db, below) → { level, floor, threshold }；speechFromEnvelope(env, threshold) → 說話區間
//   speechPauses(file, cacheFile) → { threshold, pauses: [[起, 迄], …] } | null（說話區間之間的停頓；分不出哪裡在說話〔整段音樂、
//     數位靜音的測試影片〕、或說話不到三成時回 null＝不用停頓資料，時間照舊）。照檔案大小、修改時間快取在 cacheFile
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const r3 = (n) => Math.round(n * 1000) / 1000;
export const SPEECH = {
  minSilence: 0.15,  // 短於這個的空檔算咬字間隙，不當成停頓（中文字與字之間常有 0.05–0.1 秒的低能量；實測 0.1 會把一句話切成碎片）
  minSpeech: 0.08,   // 短於這個的聲響（喀嗒、呼吸）不算說話
  minVoiced: 0.3,    // speechPauses：說話佔整支不到這個比例就不可信
};

// 音軌的能量包絡：ffmpeg 解成 16kHz 單聲道，每 10ms 算一次 20ms 視窗的 RMS（dB，滿刻度 0）→ { db: Float32Array, hop: 0.01 }
export const ENV = { rate: 16000, hop: 0.01, win: 0.02 };
export function envelope(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(ENV.rate), '-f', 's16le', 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.error) throw r.error.code === 'ENOENT' ? new Error('找不到 ffmpeg：先跑 npx hyperframes doctor 安裝，或確認 ffmpeg 在 PATH 裡') : r.error;
  if (r.status !== 0) throw new Error(`ffmpeg 解不出 ${path.basename(file)} 的聲音：${String(r.stderr).trim().slice(-300)}`);
  const buf = r.stdout, n = Math.floor(buf.length / 2);
  const hop = Math.round(ENV.rate * ENV.hop), win = Math.round(ENV.rate * ENV.win);
  const frames = Math.max(0, Math.floor((n - win) / hop) + 1);
  const db = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let k = i * hop, e = k + win; k < e; k++) { const v = buf.readInt16LE(k * 2) / 32768; sum += v * v; }
    db[i] = Math.max(-100, 10 * Math.log10(sum / win + 1e-12));
  }
  return { db, hop: ENV.hop };
}

// 門檻：相對這支音軌自己的音量算——說話音量（第 95 百分位）與底噪（第 10 百分位）之間，從底噪往上 30%，
// 再夾在「說話音量 −40～−15 dB」之間（底噪是數位靜音時不會低到抓到氣音，底噪很吵時不會高到切掉小聲的字）。
// below 有給就改成「說話音量 − below dB」（手動微調用）
export function pickThreshold(db, below = null) {
  const sorted = Float32Array.from(db).sort();
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const level = q(0.95), floor = q(0.10);
  if (below != null) return { level, floor, threshold: r3(level - below) };
  if (level - floor < 15) throw new Error(`整支音軌的最大聲與底噪只差 ${r3(level - floor)} dB，分不出哪裡在說話（常見原因：整段都有背景音樂或持續噪音）→ 字幕時間請手動校正，或用 --below <dB> 手動指定門檻`);
  return { level, floor, threshold: r3(Math.min(level - 15, Math.max(level - 40, floor + 0.3 * (level - floor)))) };
}

// 能量包絡 → 說話區間 [[起, 迄], …]（秒）。空檔短於 minSilence 的接起來（字與字之間的低能量），聲響短於 minSpeech 的丟掉
export function speechFromEnvelope(env, threshold, { minSilence = SPEECH.minSilence, minSpeech = SPEECH.minSpeech } = {}) {
  const { db, hop } = env;
  const raw = [];
  let st = null;
  for (let i = 0; i < db.length; i++) {
    if (db[i] > threshold) { if (st == null) st = i; }
    else if (st != null) { raw.push([st * hop, i * hop]); st = null; }
  }
  if (st != null) raw.push([st * hop, db.length * hop]);
  const merged = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && seg[0] - last[1] < minSilence) last[1] = seg[1]; else merged.push([...seg]);
  }
  return merged.filter(([x, y]) => y - x >= minSpeech).map(([x, y]) => [r3(x), r3(y)]);
}


export function speechPauses(file, cacheFile = null) {
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const key = { file: path.basename(file), size: st.size, mtimeMs: Math.round(st.mtimeMs), ...SPEECH, v: 1 };
  if (cacheFile && fs.existsSync(cacheFile)) {
    try { const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (c.key && JSON.stringify(c.key) === JSON.stringify(key)) return c.data; } catch { /* 快取壞了就重算 */ }
  }
  let data = null;
  try {
    const env = envelope(file);
    const th = pickThreshold(env.db).threshold;
    const speech = speechFromEnvelope(env, th);
    const dur = env.db.length * env.hop, talk = speech.reduce((t, [a, b]) => t + b - a, 0);
    if (speech.length && dur > 0 && talk / dur >= SPEECH.minVoiced) data = { threshold: th, pauses: speech.slice(1).map((s, i) => [speech[i][1], s[0]]) };
  } catch { data = null; }   // 分不出哪裡在說話（pickThreshold 丟錯）、沒有音軌、沒有 ffmpeg：不用停頓資料
  if (cacheFile) { try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, `${JSON.stringify({ key, data })}\n`); } catch { /* 寫不進去下次再量 */ } }
  return data;
}

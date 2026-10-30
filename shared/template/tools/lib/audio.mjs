// 主軌聲音處理（零依賴；build.mjs 重新編碼底片時用）：人聲響度標準化＋剪接點微淡化
//
//   LOUD、CUT_FADE                         目標（−14 LUFS／true peak −1 dBTP）與剪接點淡化長度（秒）
//   parseLoudnorm(text)                    ffmpeg loudnorm 印出的 JSON → { i, tp, lra, thresh, offset }（數字）；沒有或全靜音 → null
//   loudnormFilter(m, target)              第二段（套用）的 -af 字串，用量到的值、能線性就線性
//   loudnessPlan(m, target)                { gainDb, linear, tp }：預估要加／減幾 dB、會不會走線性、套用後的 true peak
//   fadeLength(points, fade)               剪接點太近（間距 < 2×淡化）時把淡化縮短，兩側的淡化才不會重疊
//   dipWindows(points, rate, fade)         [{ c（接點的樣本編號）, n（淡化樣本數） }]
//   dipGain(i, w)                          第 i 個樣本的增益：接點上是 0，往兩側線性回到 1
//   applyDipsToFile(file, { channels, rate, points, fade })   就地改 f32le 交錯 PCM（只讀寫接點附近，不載入整檔）
//   measureLoudness(file, cacheFile, onMiss)  第一段：量整合響度（依檔案大小＋修改時間快取）
//   audioKey(...)／readStamp／stampMatches  重新編碼的戳記：來源、剪接點、參數都沒變就不重做
//   encodeFootagePolished(src, dst, opts)  編碼主軌：先淡化剪接點、再 loudnorm，回傳報告用的數字
//   audioReportLines(info)                 build 報告要印的行

import fs from 'node:fs';
import path from 'node:path';
import { run, probeMedia, encodeFootage } from './ff.mjs';

export const LOUD = { I: -14, TP: -1, LRA: 11 };
export const CUT_FADE = 0.015;      // 剪接點前後各 15 ms（接點處最大跳變比硬切少約九成；30 ms 起接點附近的能量被吃掉過半，實驗見 USAGE.md 2.8）
export const AUDIO_VER = 1;
const RATE = 48000;
const r1 = (n) => +Number(n).toFixed(1);
const r3 = (n) => +Number(n).toFixed(3);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// ---------- 響度 ----------
export function parseLoudnorm(text) {
  const blocks = [...String(text ?? '').matchAll(/\{[^{}]*"input_i"[^{}]*\}/g)];
  if (!blocks.length) return null;
  let j;
  try { j = JSON.parse(blocks[blocks.length - 1][0]); } catch { return null; }
  const m = { i: num(j.input_i), tp: num(j.input_tp), lra: num(j.input_lra), thresh: num(j.input_thresh), offset: num(j.target_offset) };
  if (Object.values(m).some((v) => v == null)) return null;   // −inf（整段靜音）也走這裡
  return m;
}

export function loudnormFilter(m, target = LOUD) {
  return `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:measured_I=${m.i}:measured_TP=${m.tp}:measured_LRA=${m.lra}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true:print_format=summary,aresample=${RATE}`;
}

// 線性要成立：量到的 LRA 不超過目標，而且加上增益後的 true peak 不超過目標；不成立 ffmpeg 會自己退回動態模式（會壓縮動態）
export function loudnessPlan(m, target = LOUD) {
  const gainDb = r3(target.I - m.i);
  const tp = r1(m.tp + gainDb);
  return { gainDb, tp, linear: m.lra <= target.LRA && tp <= target.TP + 1e-9 };
}

export function measureLoudness(file, cacheFile = null, onMiss = null, target = LOUD) {
  const st = fs.statSync(file);
  const key = { file: path.basename(file), size: st.size, mtimeMs: Math.round(st.mtimeMs), ...target };
  if (cacheFile && fs.existsSync(cacheFile)) {
    try {
      const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (c.key && JSON.stringify(c.key) === JSON.stringify(key)) return c.measured;
    } catch { /* 快取壞了就重算 */ }
  }
  if (onMiss) onMiss();
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-sn', '-dn', '-af', `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:print_format=json`, '-f', 'null', '-']);
  if (r.status !== 0) throw new Error(`ffmpeg 量響度失敗：${String(r.stderr).trim().slice(-300)}`);
  const measured = parseLoudnorm(r.stderr);   // 整段靜音時是 null
  if (cacheFile) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ key, measured }, null, 2) + '\n');
  }
  return measured;
}

// ---------- 剪接點微淡化 ----------
export function fadeLength(points, fade = CUT_FADE) {
  let f = fade;
  for (let i = 1; i < points.length; i++) f = Math.min(f, (points[i] - points[i - 1]) / 2);
  return Math.max(0, r3(f));
}

// 接點整理：去掉 ≤0 或 ≥ 片長的、排序、去重
export function cleanPoints(points, dur = Infinity) {
  return [...new Set(points.filter((p) => Number.isFinite(p) && p > 0 && p < dur).map(r3))].sort((a, b) => a - b);
}

export function dipWindows(points, rate = RATE, fade = CUT_FADE) {
  const n = Math.round(fade * rate);
  return n < 1 ? [] : points.map((p) => ({ c: Math.round(p * rate), n }));
}

// 第 c 個樣本是新片段的第一個樣本：前一個樣本（c−1）離接點 1、這個離 0 → 接點兩側的相鄰樣本增益都很小，不會有跳變
export const dipGain = (i, w) => Math.min(1, Math.abs(i - w.c + 0.5) / w.n);

// 就地處理 f32le 交錯 PCM：只讀寫每個接點前後 n 個樣本
export function applyDipsToFile(file, { channels = 2, rate = RATE, points, fade = CUT_FADE }) {
  const wins = dipWindows(points, rate, fadeLength(points, fade) || fade);
  if (!wins.length) return 0;
  const total = Math.floor(fs.statSync(file).size / (4 * channels));
  const fd = fs.openSync(file, 'r+');
  try {
    for (const w of wins) {
      const a = Math.max(0, w.c - w.n), b = Math.min(total, w.c + w.n);
      if (b <= a) continue;
      const buf = Buffer.alloc((b - a) * channels * 4);
      fs.readSync(fd, buf, 0, buf.length, a * channels * 4);
      const f = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
      for (let i = a; i < b; i++) {
        const g = dipGain(i, w);
        for (let c = 0; c < channels; c++) f[(i - a) * channels + c] *= g;
      }
      fs.writeSync(fd, buf, 0, buf.length, a * channels * 4);
    }
  } finally { fs.closeSync(fd); }
  return wins.length;
}

// ---------- 快取戳記 ----------
export function audioKey({ src, cutpoints = [], loudnorm = true, declick = true }) {
  const st = fs.statSync(src);
  return { v: AUDIO_VER, size: st.size, mtimeMs: Math.round(st.mtimeMs), loudnorm: !!loudnorm, target: LOUD, declick: !!declick, fade: CUT_FADE, points: declick ? cleanPoints(cutpoints) : [] };
}
export function readStamp(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
export function stampMatches(stamp, key) {
  return !!stamp && JSON.stringify(stamp.key) === JSON.stringify(key);
}

// ---------- 編碼 ----------
const lufsOf = (file) => {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', `loudnorm=I=${LOUD.I}:TP=${LOUD.TP}:LRA=${LOUD.LRA}:print_format=json`, '-f', 'null', '-']);
  return parseLoudnorm(r.stderr);
};

// 回傳 { hasAudio, before, after, linear, gainDb, cuts, fade, notes[] }
export function encodeFootagePolished(src, dst, { cacheDir, cutpoints = [], loudnorm = true, declick = true, onMeasure = null } = {}) {
  const info = { hasAudio: false, before: null, after: null, linear: null, gainDb: 0, cuts: 0, fade: 0, notes: [] };
  const media = probeMedia(src);
  if (!media.hasAudio) {
    info.notes.push('rough.mp4 沒有聲音，略過響度標準化與剪接點淡化');
    encodeFootage(src, dst);
    return info;
  }
  info.hasAudio = true;
  let filter = null;
  if (loudnorm) {
    const m = measureLoudness(src, path.join(cacheDir, 'loudness.json'), onMeasure);
    if (!m) info.notes.push('rough.mp4 的聲音是靜音（量不到響度），略過響度標準化');
    else {
      const p = loudnessPlan(m);
      info.before = { i: r1(m.i), tp: r1(m.tp) };
      info.gainDb = p.gainDb; info.linear = p.linear;
      filter = loudnormFilter(m);
    }
  }
  const points = declick ? cleanPoints(cutpoints, media.duration ?? Infinity) : [];
  let raw = null;
  if (points.length) {
    fs.mkdirSync(cacheDir, { recursive: true });
    raw = path.join(cacheDir, 'declick.f32');
    // aresample first_pts=0：音軌開頭有偏移時補靜音到 0，剪接點的秒數才對得上畫面
    const r = run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vn', '-map', '0:a:0', '-af', `aresample=${RATE}:first_pts=0`, '-ac', '2', '-ar', String(RATE), '-f', 'f32le', raw]);
    if (r.status !== 0) throw new Error(`ffmpeg 抽出聲音失敗：${String(r.stderr).trim().slice(-300)}`);
    info.fade = fadeLength(points);
    info.cuts = applyDipsToFile(raw, { channels: 2, rate: RATE, points, fade: CUT_FADE });
  }
  try {
    encodeFootage(src, dst, { audioFilter: filter, audioRaw: raw ? { file: raw, rate: RATE, channels: 2 } : null });
  } finally {
    if (raw) try { fs.rmSync(raw, { force: true }); } catch { /* 暫存檔刪不掉不影響結果 */ }
  }
  if (loudnorm && info.before) {
    const a = lufsOf(dst);
    if (a) info.after = { i: r1(a.i), tp: r1(a.tp) };
  }
  return info;
}

// ---------- 報告 ----------
const n1 = (v) => String(v).replace('-', '−');
export function audioReportLines(info, { loudnorm = true, declick = true, cutpointsExist = true } = {}) {
  const lines = [];
  if (!info?.hasAudio) return lines;
  if (loudnorm && info.before) {
    const a = info.after;
    lines.push(`人聲響度 ${n1(info.before.i)} LUFS → ${a ? n1(a.i) : n1(LOUD.I)} LUFS（true peak ${a ? n1(a.tp) : n1(LOUD.TP)}${info.linear ? '' : '；超過線性範圍，ffmpeg 改用動態模式，動態會稍微被壓縮'}）`);
    // 音效的 data-volume 是絕對值：人聲被拉大或壓小 N dB，音效相對人聲就小或大 N dB
    if (Math.abs(info.gainDb) >= 3) lines.push(`⚠ 人聲被${info.gainDb > 0 ? '調大' : '調小'} ${Math.abs(r1(info.gainDb))} dB，音效是固定音量，所以音效相對人聲${info.gainDb > 0 ? '小' : '大'}了 ${Math.abs(r1(info.gainDb))} dB → 試聽覺得音效太${info.gainDb > 0 ? '小' : '大'}，剪輯台把「音效」整體音量${info.gainDb > 0 ? '加' : '減'}${Math.abs(Math.round(info.gainDb))} dB（plan.json 的 edit.volume.sfx）`);
  } else if (!loudnorm) lines.push('人聲響度：已用 --no-loudnorm 略過');
  if (declick && info.cuts) lines.push(`剪接點微淡化：${info.cuts} 個接點，前後各 ${Math.round(info.fade * 1000)} ms`);
  else if (declick && !cutpointsExist) lines.push('剪接點微淡化：略過（work/cutpoints.json 不存在；只有照 AGENTS.md「剪乾淨」第 7 步存了才會處理）');
  else if (!declick) lines.push('剪接點微淡化：已用 --no-declick 略過');
  for (const n of info.notes) lines.push(`⚠ ${n}`);
  return lines;
}

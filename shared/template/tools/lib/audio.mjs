// 主軌聲音處理（零依賴；build.mjs 重新編碼底片時用）：人聲響度標準化＋剪接點微淡化；音效政策與結尾配樂（契約 specs/contracts/sfx.md）
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
//   audioKey(...)／readStamp／stampMatches  重新編碼的戳記：來源、剪接點、參數、構圖、look 都沒變就不重做
//   encodeFootagePolished(src, dst, opts)  編碼主軌：先淡化剪接點、再 loudnorm，回傳報告用的數字（lut 原樣轉給 encodeFootage）
//   audioReportLines(info, { sfx })        build 報告要印的行（sfx＝sfxBudget() 的回傳，印「音效比例」）
//   SFX_RULES                              音效政策的數字：主音效間隔 3 s、附加音效間隔 0.2 s、每分鐘 2 顆、上限比人聲小 3 dB
//   sfxBudget(cues, sfxConf, opts)         次數上限、每分鐘密度、稀疏、音效比例 → { count, over, dense, sparse, loud, levels, perMinuteAvg, warnings, lines }
//   renderBgmClip(src, dst, opts)          結尾配樂：截取＋淡入淡出＋增益烤進 wav（dst 是資料夾時檔名含參數 hash，同參數不重做）
//   cutDips(f32, opts)                     剪接點前後 100 ms 的 10 ms RMS，判斷有沒有挖出低於底噪的凹洞（dev 測試用）

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { run, probeMedia, encodeFootage } from './ff.mjs';

export const LOUD = { I: -14, TP: -1, LRA: 11 };
export const CUT_FADE = 0.015;      // 剪接點前後各 15 ms（接點處最大跳變比硬切少約九成；30 ms 起接點附近的能量被吃掉過半，實驗見 USAGE.md 2.8；凹洞量測見 specs/005-sfx/research.md）
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
// frame（構圖裁切）、look（瘦臉調光，ensureLook().key，contracts/look.md §4）有才放進 key：沒用的舊專案，戳記不變、不必重新編碼
// format＝版式（specs/009-vertical）：直式才寫進鍵（橫式的鍵和改版前一樣，舊專案不會因此重新編碼）
export function audioKey({ src, cutpoints = [], loudnorm = true, declick = true, frame = null, look = null, format = null }) {
  const st = fs.statSync(src);
  return { v: AUDIO_VER, size: st.size, mtimeMs: Math.round(st.mtimeMs), loudnorm: !!loudnorm, target: LOUD, declick: !!declick, fade: CUT_FADE, points: declick ? cleanPoints(cutpoints) : [], ...(frame ? { frame } : {}), ...(look ? { look } : {}), ...(format && format !== 'landscape' ? { format } : {}) };
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
// canvas＝畫布（canvas.mjs；specs/009-vertical FR-100）：原樣傳給 encodeFootage，直式沒有 frame 時縮到 1080×1920 置中裁切；不傳＝橫式
export function encodeFootagePolished(src, dst, { cacheDir, cutpoints = [], loudnorm = true, declick = true, onMeasure = null, crop = null, lut = null, canvas = undefined } = {}) {
  const info = { hasAudio: false, before: null, after: null, linear: null, gainDb: 0, cuts: 0, fade: 0, notes: [] };
  const media = probeMedia(src);
  if (!media.hasAudio) {
    info.notes.push('rough.mp4 沒有聲音，略過響度標準化與剪接點淡化');
    encodeFootage(src, dst, { crop, lut, canvas });
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
    encodeFootage(src, dst, { audioFilter: filter, audioRaw: raw ? { file: raw, rate: RATE, channels: 2 } : null, crop, lut, canvas });
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
// sfx：sfxBudget() 的回傳；沒給（舊的呼叫端）就不印「音效比例」。
// 人聲一律被調到 −14 LUFS，音效相對人聲的大小只由 kit/sfx.json 的 targetDb（＋sfxVolume、edit.volume）決定，跟原始收音大小無關
export function audioReportLines(info, { loudnorm = true, declick = true, cutpointsExist = true, sfx = null } = {}) {
  const lines = [];
  if (!info?.hasAudio) return lines;
  if (loudnorm && info.before) {
    const a = info.after;
    lines.push(`人聲響度 ${n1(info.before.i)} LUFS → ${a ? n1(a.i) : n1(LOUD.I)} LUFS（true peak ${a ? n1(a.tp) : n1(LOUD.TP)}${info.linear ? '' : '；超過線性範圍，ffmpeg 改用動態模式，動態會稍微被壓縮'}）`);
  } else if (!loudnorm) lines.push('人聲響度：已用 --no-loudnorm 略過');
  if (sfx) lines.push(...sfxLevelLines(sfx, { loudnorm }));
  if (declick && info.cuts) lines.push(`剪接點微淡化：${info.cuts} 個接點，前後各 ${Math.round(info.fade * 1000)} ms`);
  else if (declick && !cutpointsExist) lines.push('剪接點微淡化：略過（work/cutpoints.json 不存在；只有照 AGENTS.md「剪乾淨」第 7 步存了才會處理）');
  else if (!declick) lines.push('剪接點微淡化：已用 --no-declick 略過');
  for (const n of info.notes) lines.push(`⚠ ${n}`);
  return lines;
}

// ---------- 音效政策（specs/contracts/sfx.md §4；訊息原文 specs/contracts/cli-005.md §3）----------
export const SFX_RULES = Object.freeze({ gapSec: 3, extraGapSec: 0.2, perMinute: 2, capDb: -3, sparseSec: 60 });
const SWAP = { thunder: 'alert', sparkle: 'ding', shine: 'ding' };              // 超過每集上限時建議換成誰
const KEEP_FIRST = ['chapter', 'thunder', 'shine', 'sparkle', 'alert', 'success'];
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;   // 和 plan.mjs 的 fmt 相同
const median = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const d1 = (v) => n1(r1(v).toFixed(1));

// cues：[{ id, name, at（成片秒數）, volume（最終線性音量）, main（是不是主音效）}]，已扣掉被 3 秒規則拿掉的
export function sfxBudget(cues, sfxConf, { voiceDb = 0, outDur = 0, fmt = fmtT, gapNote = null } = {}) {
  const R = SFX_RULES;
  const list = (cues || []).filter((c) => c && sfxConf[c.name] && sfxConf[c.name].kind !== 'bgm').sort((a, b) => a.at - b.at);
  const count = {};
  for (const c of list) count[c.name] = (count[c.name] || 0) + 1;
  const isMain = (c) => c.main && !sfxConf[c.name].additive;
  // 次數上限
  const over = [];
  for (const [name, conf] of Object.entries(sfxConf)) {
    if (conf.maxPerVideo == null || !((count[name] || 0) > conf.maxPerVideo)) continue;
    over.push({ name, n: count[name], max: conf.maxPerVideo, cues: list.filter((c) => c.name === name).map((c) => ({ id: c.id, at: r3(c.at) })) });
  }
  // 每分鐘密度（主音效、非附加；floor(at/60) 分組）
  const byMin = new Map();
  for (const c of list.filter(isMain)) { const k = Math.floor(c.at / 60); if (!byMin.has(k)) byMin.set(k, []); byMin.get(k).push(c); }
  const dense = [...byMin.entries()].filter(([, a]) => a.length > R.perMinute).map(([k, a]) => ({ from: k * 60, to: (k + 1) * 60, n: a.length, ids: a.map((c) => c.id) }));
  // 音效比例：targetDb ＋ 這顆被調了幾 dB − 人聲被調了幾 dB
  const rel = [];
  for (const c of list) {
    const conf = sfxConf[c.name];
    if (!Number.isFinite(conf.targetDb) || !(conf.volume > 0) || !(c.volume > 0)) continue;
    rel.push({ c, db: conf.targetDb + 20 * Math.log10(c.volume / conf.volume) - voiceDb });
  }
  const loud = rel.filter((x) => x.db > R.capDb + 0.05).map((x) => ({ id: x.c.id, name: x.c.name, at: r3(x.c.at), relDb: r1(x.db) }));
  const mainDb = rel.filter((x) => isMain(x.c)).map((x) => x.db), extraDb = rel.filter((x) => !isMain(x.c)).map((x) => x.db);
  const levels = {
    main: mainDb.length ? [r1(Math.min(...mainDb)), r1(Math.max(...mainDb)), r1(median(mainDb))] : null,
    extra: extraDb.length ? [r1(Math.min(...extraDb)), r1(Math.max(...extraDb))] : null,
  };
  const nMain = list.filter(isMain).length, nExtra = list.length - nMain;
  // 音效稀疏：片頭到第一顆、兩顆之間、最後一顆到片尾，超過 60 秒沒有主音效（參考專案：只有旁白的長段沒音效，作者要求補）
  const sparse = [];
  if (outDur > 0) {
    let prev = 0;
    for (const t of [...list.filter(isMain).map((c) => c.at), outDur]) { if (t - prev > R.sparseSec) sparse.push({ from: r3(prev), to: r3(t) }); prev = t; }
  }
  const perMinuteAvg = outDur > 0 ? r1(nMain / (outDur / 60)) : 0;
  // 訊息
  const warnings = [];
  for (const o of over) {
    const where = o.cues.map((c) => `${c.id} ${fmt(c.at)}`).join('、');
    warnings.push(`⚠ 音效 ${o.name} 用了 ${o.n} 次，每集上限 ${o.max} 次（${where}）→ 留最重要的 ${o.max} 次，其他段寫 "sfx": null${SWAP[o.name] ? ` 或換成 ${SWAP[o.name]}` : ''}`);
  }
  if (dense.length) {
    const mm = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    const adds = Object.keys(sfxConf).filter((k) => sfxConf[k].additive);
    warnings.push(`⚠ 音效密度：${dense.length} 個一分鐘超過 ${R.perMinute} 顆主音效（${dense.map((d) => `${mm(d.from)}–${mm(d.to)} ${d.n} 顆`).join('、')}；附加音效${adds.length ? ` ${adds.join('、')}` : ''} 不算）→ 每分鐘留最重要的 ${R.perMinute} 顆（${KEEP_FIRST.join('、')} 先留，ding、impact 先拿掉：那段寫 "sfx": null）`);
  }
  // gapNote(g)：空檔裡可以配音效的段（plan.mjs 給，例「x10、x11、m01」），印在秒數後面，讓人知道去哪一段配
  if (sparse.length) warnings.push(`⚠ 音效稀疏：${sparse.map((g) => { const n = gapNote ? gapNote(g) : ''; return `${fmt(g.from)}–${fmt(g.to)}（${Math.round(g.to - g.from)} 秒${n ? `：${n}` : ''}）`; }).join('、')}沒有主音效 → 在這段裡找踩坑句配 alert、結果句配 success（落在句尾前 0.1–0.2 秒）；情境動畫在那一拍寫 P.sfx('success', '#N@詞')；錄影段寫 "sfx": { "name": "success", "at": "#Ne-0.1" }`);
  const loudLine = loudWarning(loud);
  if (loudLine) warnings.push(loudLine);
  const cnt = Object.keys(sfxConf).filter((k) => sfxConf[k].kind !== 'bgm' && ((count[k] || 0) > 0 || sfxConf[k].maxPerVideo != null))
    .map((k) => `${k} ${count[k] || 0}${sfxConf[k].maxPerVideo != null ? `／${sfxConf[k].maxPerVideo}` : ''}`);
  const lines = [
    `音效次數：${cnt.join('、') || '沒有音效'}`,
    nMain ? `音效密度：主音效平均 ${perMinuteAvg} 顆／分（上限：任一分鐘 ≤ ${R.perMinute} 顆，超過才 ⚠），附加音效 ${nExtra} 顆` : `音效密度：主音效 0 顆，附加音效 ${nExtra} 顆`,
  ];
  return { count, over, dense, sparse, loud, levels, perMinuteAvg, warnings, lines };
}

function loudWarning(loud) {
  if (!loud?.length) return null;
  const R = SFX_RULES;
  const items = loud.slice(0, 8).map((x) => `${x.id} ${x.name} ${fmtT(x.at)} ${d1(x.relDb)} dB → sfxVolume 再減 ${r1(x.relDb - R.capDb).toFixed(1)}`);
  const more = loud.length > 8 ? `…等 ${loud.length} 顆` : '';
  return `⚠ 音效比例：${loud.length} 顆音效比人聲下 ${-R.capDb} dB 還大聲（${items.join('、')}${more}）→ 在影片編輯器把這幾段的音效調小，或改 plan.json 那段的 sfxVolume`;
}

function sfxLevelLines(b, { loudnorm = true } = {}) {
  if (!loudnorm) return ['音效比例：沒有檢查（用了 --no-loudnorm，人聲不是 −14 LUFS，音效和人聲的比例會跟 kit/sfx.json 的設計不同）'];
  const { main, extra } = b.levels || {};
  if (!main && !extra) return ['音效比例：這支片沒有音效'];
  const cap = `上限是比人聲小 ${-SFX_RULES.capDb} dB`;
  const parts = [];
  if (main) parts.push(`主音效比人聲小 ${d1(-main[1])}–${d1(-main[0])} dB（中位 ${d1(-main[2])}）`);
  if (extra) parts.push(`${main ? '' : '附加音效比人聲'}${main ? '附加音效小' : '小'} ${d1(-extra[1])}–${d1(-extra[0])} dB`);
  const out = [`音效比例：${parts.join('、')}；${cap}`];
  const w = loudWarning(b.loud);
  if (w) out.push(w);
  return out;
}

// ---------- 結尾配樂（contracts/sfx.md §6.2）----------
// dst 以 .wav 結尾＝指定檔名（每次都重做）；否則當資料夾，檔名＝<來源檔名>-<參數 hash 12 碼>.wav，已存在就不重做
export function renderBgmClip(src, dst, { from = 0, dur, fadeIn = 0, fadeOut = 0, gain = 1 } = {}) {
  if (!(dur > 0)) throw new Error(`renderBgmClip：dur 要是正數，現在是 ${dur} → outro.from 要在片尾之前，改成更早的句號`);
  const st = fs.statSync(src);
  const p = { from: r3(from), dur: r3(dur), fadeIn: r3(Math.max(0, fadeIn)), fadeOut: r3(Math.max(0, fadeOut)), gain: +Number(gain).toFixed(4) };
  let file = dst;
  if (!/\.wav$/i.test(dst)) {
    const h = createHash('sha1').update(JSON.stringify({ src: path.basename(src), size: st.size, mtimeMs: Math.round(st.mtimeMs), ...p })).digest('hex').slice(0, 12);
    file = path.join(dst, `${path.basename(src, path.extname(src))}-${h}.wav`);
    if (fs.existsSync(file)) return { file, dur: p.dur };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const af = [`atrim=start=${p.from}:duration=${p.dur}`, 'asetpts=PTS-STARTPTS'];
  if (p.fadeIn > 0) af.push(`afade=t=in:st=0:d=${p.fadeIn}`);
  if (p.fadeOut > 0) af.push(`afade=t=out:st=${r3(Math.max(0, p.dur - p.fadeOut))}:d=${p.fadeOut}`);
  af.push(`volume=${p.gain}`, `aresample=${RATE}`);
  const r = run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', af.join(','), '-ac', '2', '-ar', String(RATE), '-c:a', 'pcm_s16le', file]);
  if (r.status !== 0) throw new Error(`ffmpeg 產生結尾配樂失敗：${String(r.stderr).trim().slice(-300)} → 確認 ${src} 是完整的 wav（ffmpeg -i 那個檔看得到長度）；壞了就 git checkout 那個檔`);
  return { file, dur: p.dur };
}

// ---------- 剪接點凹洞量測（specs/005-sfx/spec.md FR-030；dev 測試用）----------
// f32：交錯 PCM（處理後）；ref：處理前（同長度；沒給就用 f32）。底噪＝ref 整檔 10 ms RMS（每 10 ms 一窗）的第 10 百分位。
// 凹洞＝處理後的 RMS 連續 ≥ minRun 低於「底噪 − belowDb」，而且處理前同一窗沒有低於（不是原本就有的洞）
export function cutDips(f32, { channels = 2, rate = RATE, points = [], ref = null, win = 0.010, hop = 0.001, span = 0.100, belowDb = 6, minRun = 0.020 } = {}) {
  const prefix = (x) => {
    const n = Math.floor(x.length / channels), c = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { let e = 0; for (let k = 0; k < channels; k++) { const v = x[i * channels + k]; e += v * v; } c[i + 1] = c[i] + e / channels; }
    return c;
  };
  const P = prefix(f32), Q = ref ? prefix(ref) : P;
  const n = P.length - 1, W = Math.max(1, Math.round(win * rate));
  const dbAt = (C, center) => {
    const a = Math.max(0, Math.round(center - W / 2)), b = Math.min(n, a + W);
    const e = b > a ? (C[b] - C[a]) / (b - a) : 0;
    return e > 0 ? 10 * Math.log10(e) : -Infinity;
  };
  const fl = [];
  for (let a = 0; a + W <= n; a += W) { const e = (Q[a + W] - Q[a]) / W; if (e > 0) fl.push(10 * Math.log10(e)); }
  fl.sort((x, y) => x - y);
  const floorDb = fl.length ? fl[Math.floor(fl.length * 0.1)] : -Infinity;
  const thr = floorDb - belowDb, H = Math.max(1, Math.round(hop * rate)), S = Math.round(span * rate);
  return points.map((p) => {
    const c0 = Math.round(p * rate);
    let minDb = Infinity, run = 0, best = 0, pre = false;
    for (let c = c0 - S; c <= c0 + S; c += H) {
      if (c < 0 || c > n) continue;
      const d = dbAt(P, c), dr = dbAt(Q, c);
      minDb = Math.min(minDb, d);
      const isPre = dr < thr;
      if (isPre) pre = true;
      // 凹洞＝淡化把「原本有聲音的地方」（參考 ≥ 門檻）壓低 ≥ belowDb、而且壓到門檻以下；只看絕對門檻的話，參考本來就貼著底噪的接點掉 2–3 dB 也會被算進去
      if (d < thr && !isPre && d < dr - belowDb) { run++; best = Math.max(best, run); } else run = 0;
    }
    const runMs = Math.round(best * H / rate * 1000);
    return { at: p, floorDb: r1(floorDb), minDb: Number.isFinite(minDb) ? r1(minDb) : -Infinity, runMs, hole: runMs >= minRun * 1000 - 0.5, preexisting: pre };
  });
}

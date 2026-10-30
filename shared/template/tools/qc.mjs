#!/usr/bin/env node
/**
 * 品質檢查工具：成片驗收、講者動作範圍圖（零依賴，只用 Node 22 與 ffmpeg／ffprobe）
 *
 *   node shared/template/tools/qc.mjs final --project projects/<專案> [--file <mp4>] [--json]
 *       成片驗收（預設檔案 成片/final.mp4）。除了尺寸、30fps、音軌、長度，還抓「四項全過、內容卻壞」的問題：
 *         響度（整合響度 −15.5～−12.5 LUFS、true peak ≤ −1.0 dBTP）、畫面凍結（≥ 3 秒，章節轉場本來就靜止，已排除）、
 *         黑畫面（≥ 0.5 秒）、長時間沒聲音（≥ 4 秒）。凍結／黑畫面／無聲的時間會對到 plan.json 的段落 id。
 *       另存總覽圖 成片/驗收截圖/qc-sheet.jpg（每 10 秒一格），給人或 AI 快速掃一眼。
 *       預期長度跑 build.mjs --check --json 取得（rough.mp4 − cuts）。
 *       輸出 ✔／⚠／✖；有 ✖ 結束碼是 1，只有 ⚠ 是 0。--json 只印一個 JSON。
 *   node shared/template/tools/qc.mjs speaker --project projects/<專案> [--file <mp4>]
 *       講者動作範圍圖：從 work/rough.mp4 平均抽 8 張，存
 *         work/場地照-動作範圍.jpg   疊影（平均）＋動作範圍上色＋青色建議框＋每 100px 座標格線
 *         work/場地照-8格.jpg        8 格總表（每格標時間）
 *       不是 1920×1080 的影片先等比放大（不足的邊補黑），圖上的座標直接就是 speakerBox 的座標。
 *       plan.json 有 frame（構圖裁切）時，先照 frame 裁切放大再量，座標就是裁切後成片上的座標。
 *   node shared/template/tools/qc.mjs framing --project projects/<專案> [--file <mp4>] [--zooms 1,1.15,1.3]
 *       構圖預覽：量講者動作範圍、偵測四周黑邊，算出每個放大倍率的 16:9 裁切框（頭頂上方留 120px、講者水平置中），
 *       存 work/構圖預覽.jpg（每個倍率一格，橘框是講者動作範圍）並印出每個倍率的 frame 與會不會切到手勢。
 *       使用者選好倍率後，把那一列的 frame 寫進 plan.json 第一層，再跑 speaker 量講者框。
 *       加 --cards：再抓影片中間一格，每個倍率各 build 一次「疊加（下方字卡）／半畫面（側邊欄）／子母畫面（全畫面清單）」
 *       三種版面的示意卡（用目前 shared/template 的風格），拼成 work/構圖預覽-套卡.jpg（列＝倍率、欄＝版面），
 *       讓使用者看著卡片套上去的樣子選倍率。暫存檔在 work/.framing-preview/（可以刪）。約 15 秒 × 倍率數。
 *
 * --project：專案資料夾（projects/範例，或只寫名稱 範例）。測試用：--template <shared/template 資料夾>
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathsFrom } from './build.mjs';
import { run, probeMedia, rawFrame, writeJpg } from './lib/ff.mjs';
import { canvas, fillRect, blit, text, textWidth } from './lib/raster.mjs';
import { drawGrid } from './media.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALUE_FLAGS = ['project', 'template', 'file', 'zooms'];
const r1 = (n) => Number(n).toFixed(1);
const r2 = (n) => Number(n).toFixed(2);
const r3 = (n) => +Number(n).toFixed(3);
const rel = (p) => path.relative(process.cwd(), p) || '.';
const tail = (s, n = 400) => String(s ?? '').trim().slice(-n);

// 判斷門檻
export const LIMITS = { width: 1920, height: 1080, fps: 30, durTol: 0.1, lufsMin: -15.5, lufsMax: -12.5, tpMax: -1.0, freeze: 3, black: 0.5, silence: 4, sheetStep: 10 };

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`看不懂的參數「${a}」（用 --help 看用法）`);
    const [k, inline] = a.slice(2).split('=');
    if (VALUE_FLAGS.includes(k)) {
      const v = inline ?? rest[++i];
      if (v == null) throw new Error(`--${k} 後面要接值`);
      flags[k] = v;
    } else if (['json', 'help', 'cards'].includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數（用 --help 看用法）`);
  }
  return flags;
}

// ---------- 純函式：解析 ffmpeg 輸出 ----------

export const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

// freezedetect：lavfi.freezedetect.freeze_start／freeze_duration／freeze_end；凍到片尾時可能沒有 freeze_end → 用 dur 補
export function parseFreeze(stderr, dur = null) {
  const out = [];
  let start = null;
  for (const m of String(stderr).matchAll(/freeze_(start|duration|end):\s*(-?[\d.]+)/g)) {
    const v = Number(m[2]);
    if (m[1] === 'start') start = v;
    else if (m[1] === 'end' && start != null) { out.push([r3(start), r3(v)]); start = null; }
  }
  if (start != null && dur != null && dur > start) out.push([r3(start), r3(dur)]);
  return out;
}

export function parseBlack(stderr) {
  return [...String(stderr).matchAll(/black_start:\s*(-?[\d.]+)\s+black_end:\s*(-?[\d.]+)/g)].map((m) => [r3(Math.max(0, Number(m[1]))), r3(Number(m[2]))]);
}

// silencedetect：silence_start 之後接 silence_end；無聲到片尾時只有 silence_start → 用 dur 補
export function parseSilence(stderr, dur = null) {
  const out = [];
  let start = null;
  for (const m of String(stderr).matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    const v = Number(m[2]);
    if (m[1] === 'start') start = Math.max(0, v);
    else if (start != null) { out.push([r3(start), r3(v)]); start = null; }
  }
  if (start != null && dur != null && dur > start) out.push([r3(start), r3(dur)]);
  return out;
}

// ebur128 結尾的 Summary：整合響度 I（LUFS）與 True peak（dBFS）。靜音時是 -inf → null
export function parseLoudness(stderr) {
  const s = String(stderr);
  const sum = s.slice(Math.max(0, s.lastIndexOf('Summary:')));
  const num = (x) => { const n = Number(x); return x && /^-?[\d.]+$/.test(x) && Number.isFinite(n) ? n : null; };
  const i = sum.match(/Integrated loudness:\s*\n\s*I:\s*(\S+)\s*LUFS/);
  const p = sum.match(/True peak:\s*\n\s*Peak:\s*(\S+)\s*dBFS/);
  return { i: i ? num(i[1]) : null, tp: p ? num(p[1]) : null, found: !!(i || p) };
}

// ---------- 純函式：成片時間 ↔ rough.mp4 時間（cuts）、對到段落 ----------

const sortCuts = (cuts) => (cuts || []).filter((c) => Array.isArray(c) && c.length === 2).map(([a, b]) => [Number(a), Number(b)]).sort((x, y) => x[0] - y[0]);

// 成片第 o 秒 → rough.mp4 第幾秒（cuts 是 rough 時間）
export function finalToRough(o, cuts) {
  let acc = 0;
  for (const [a, b] of sortCuts(cuts)) {
    if (o > a - acc + 1e-9) acc += b - a; else break;
  }
  return r3(o + acc);
}

// rough.mp4 第 t 秒 → 成片第幾秒（落在被剪掉的區間時，對到剪接點）
export function roughToFinal(t, cuts) {
  let acc = 0;
  for (const [a, b] of sortCuts(cuts)) {
    if (t >= b) acc += b - a;
    else if (t > a) { acc += t - a; break; }
    else break;
  }
  return r3(t - acc);
}

// 從 [a, b] 扣掉 holes（都是同一個時間軸），回傳剩下的片段
export function subtractRanges([a, b], holes) {
  let pieces = [[a, b]];
  for (const [ha, hb] of [...holes].sort((x, y) => x[0] - y[0])) {
    const next = [];
    for (const [pa, pb] of pieces) {
      if (hb <= pa || ha >= pb) { next.push([pa, pb]); continue; }
      if (ha > pa) next.push([pa, ha]);
      if (hb < pb) next.push([hb, pb]);
    }
    pieces = next;
  }
  return pieces.map(([x, y]) => [r3(x), r3(y)]);
}

export const isChapterItem = (it) => it?.type === 'scene' && /^01(\s|$)/.test(String(it.label || ''));

// 段落顯示名：scene → "s03 全畫面流程"（拿掉 label 開頭的情境編號）；media → "m01 螢幕錄影"／"m01 圖片"
export function itemName(it) {
  if (!it) return '主軌口播';
  if (it.type === 'media') return `${it.id} ${it.kind === 'image' ? '圖片' : '螢幕錄影'}`;
  const name = String(it.label || '').replace(/^\S+\s+/, '');
  return `${it.id}${name ? ` ${name}` : ''}`;
}

// 成片的 [a, b] 對到哪一段：換成 rough 時間後，取重疊最多的段落；沒有重疊回 null
export function locateItem([a, b], items, cuts = []) {
  const ra = finalToRough(a, cuts), rb = finalToRough(b, cuts);
  let best = null, bestOv = 0;
  for (const it of items || []) {
    const s = it.start, e = it.shownEnd ?? it.end;
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    const ov = Math.min(rb, e) - Math.max(ra, s);
    if (ov > bestOv + 1e-9) { best = it; bestOv = ov; }
  }
  return best;
}

// 章節轉場本來就靜止：凍結區間扣掉章節段（成片時間軸）；剩下 ≥ minDur 的才算
export function freezeIssues(freezes, items, cuts = [], minDur = LIMITS.freeze) {
  const holes = (items || []).filter(isChapterItem).map((it) => [roughToFinal(it.start, cuts) - 0.15, roughToFinal(it.shownEnd ?? it.end, cuts) + 0.15]);
  const out = [];
  for (const fz of freezes) for (const [a, b] of subtractRanges(fz, holes)) if (b - a >= minDur - 1e-6) out.push([a, b]);
  return out;
}

// ---------- 純函式：判定 ----------

// facts：{ width, height, fps, vfr, hasAudio, dur, expected, loud:{i,tp}, freezes, blacks, silences, items, cuts }
// 回傳 { checks:[{ key, level:'ok'|'warn'|'error', text }], errors, warnings, ok }
export function judge(f) {
  const L = LIMITS, checks = [];
  const add = (key, level, text) => checks.push({ key, level, text });

  const bad = [];
  if (f.width !== L.width || f.height !== L.height) bad.push(`尺寸 ${f.width}×${f.height}（要 ${L.width}×${L.height}）`);
  if (!Number.isFinite(f.fps) || Math.abs(f.fps - L.fps) > 0.05 || f.vfr) bad.push(`影格率 ${f.fps}fps${f.vfr ? '（變動影格率）' : ''}（要固定 ${L.fps}fps）`);
  if (!f.hasAudio) bad.push('沒有音軌');
  if (bad.length) add('format', 'error', `格式不合：${bad.join('；')} → render 指令加 --fps 30，尺寸以 build 產生的 1920×1080 為準，沒聲音就檢查 rough.mp4 有沒有音軌`);
  else add('format', 'ok', `格式 ${f.width}×${f.height}、${r2(f.fps)}fps、有音軌`);

  if (f.expected == null) add('duration', 'warn', `長度 ${r2(f.dur)}s，拿不到預期長度（build --check --json 失敗）→ 先修好 plan.json，再重跑 qc`);
  else {
    const diff = Math.abs(f.dur - f.expected);
    if (diff > L.durTol + 1e-9) add('duration', 'error', `長度 ${r2(f.dur)}s，預期 ${r2(f.expected)}s，差 ${r2(diff)}s（> ${L.durTol}s）→ 重新 build 再 render；有 edit.cuts 時預期是 rough.mp4 − cuts`);
    else add('duration', 'ok', `長度 ${r2(f.dur)}s（預期 ${r2(f.expected)}s，差 ${r2(diff)}s）`);
  }

  if (f.hasAudio) {
    const { i, tp } = f.loud || {};
    if (i == null) add('loudness', 'warn', '響度量不到（整支幾乎沒有聲音）→ 檢查 rough.mp4 與音量設定');
    else {
      const msgs = [];
      if (i < L.lufsMin) msgs.push(`整合響度 ${r1(i)} LUFS 偏小聲（應在 ${L.lufsMin}～${L.lufsMax}）`);
      else if (i > L.lufsMax) msgs.push(`整合響度 ${r1(i)} LUFS 偏大聲（應在 ${L.lufsMin}～${L.lufsMax}）`);
      if (tp != null && tp > L.tpMax) msgs.push(`true peak ${r1(tp)} dBTP 太高（應 ≤ ${L.tpMax}）`);
      if (msgs.length) add('loudness', 'warn', `${msgs.join('；')} → 到剪輯台調音量，或把人聲標準化到 −14 LUFS 後重新 render`);
      else add('loudness', 'ok', `響度 ${r1(i)} LUFS、true peak ${tp == null ? '—' : r1(tp)} dBTP`);
    }
  }

  const where = (rg) => `（${itemName(locateItem(rg, f.items, f.cuts))}）`;
  const rng = ([a, b]) => `${fmtT(a)}–${fmtT(b)}`;

  const fz = freezeIssues(f.freezes || [], f.items, f.cuts);
  if (!fz.length) add('freeze', 'ok', `沒有 ≥ ${L.freeze} 秒的畫面凍結（章節轉場已排除）`);
  for (const rg of fz) add('freeze', 'warn', `${rng(rg)} 畫面凍結 ${r1(rg[1] - rg[0])} 秒${where(rg)} → 看 qc-sheet.jpg 與該段起點截圖；螢幕錄影先確認素材有在動，重 render 該段；多半是 seek 卡住或素材本身靜止`);

  const bl = (f.blacks || []).filter(([a, b]) => b - a >= L.black - 1e-6);
  if (!bl.length) add('black', 'ok', `沒有 ≥ ${L.black} 秒的黑畫面`);
  for (const rg of bl) add('black', 'warn', `${rng(rg)} 黑畫面 ${r1(rg[1] - rg[0])} 秒${where(rg)} → 可能掉圖，或只有聲音的區間沒用 media 段蓋住；截該段確認`);

  const sl = (f.silences || []).filter(([a, b]) => b - a >= L.silence - 1e-6);
  if (!f.hasAudio) { /* 沒音軌已在格式判成 ✖ */ }
  else if (!sl.length) add('silence', 'ok', `沒有 ≥ ${L.silence} 秒的無聲區間`);
  for (const rg of f.hasAudio ? sl : []) add('silence', 'warn', `${rng(rg)} 沒有聲音 ${r1(rg[1] - rg[0])} 秒${where(rg)} → 可能是漏剪的停頓；刻意留白就不用理它`);

  const errors = checks.filter((c) => c.level === 'error').length, warnings = checks.filter((c) => c.level === 'warn').length;
  return { checks, errors, warnings, ok: errors === 0 };
}

// ---------- final ----------

function expectedFromBuild(P, flags) {
  const args = [path.join(HERE, 'build.mjs'), '--project', P.project, '--check', '--json'];
  if (flags.template) args.push('--template', path.resolve(flags.template));
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* 下面處理 */ }
  if (!j) return { error: `build --check --json 沒有輸出 JSON：${tail(r.stderr, 200)}` };
  if (!j.ok) return { error: `build --check 有 ✖：${(j.errors || []).slice(0, 2).join('；')}`, items: j.items || [], cuts: j.edit?.cuts || [] };
  return { expected: j.outputDur, items: j.items || [], cuts: j.edit?.cuts || [] };
}

function detect(file, dur, hasAudio) {
  const args = ['-hide_banner', '-nostats', '-i', file, '-vf', `freezedetect=n=-60dB:d=${LIMITS.freeze},blackdetect=d=${LIMITS.black}:pix_th=0.1:pic_th=0.98`];
  if (hasAudio) args.push('-af', `ebur128=peak=true:framelog=quiet,silencedetect=n=-50dB:d=${LIMITS.silence}`);
  args.push('-f', 'null', '-');
  const r = run('ffmpeg', args);
  if (r.status !== 0) throw new Error(`ffmpeg 分析失敗：${tail(r.stderr)}`);
  const err = String(r.stderr);
  return { freezes: parseFreeze(err, dur), blacks: parseBlack(err), silences: hasAudio ? parseSilence(err, dur) : [], loud: hasAudio ? parseLoudness(err) : null };
}

// 每 10 秒一格（加最後一格），拼成一張，每格標時間
export function sheetTimes(dur, step = LIMITS.sheetStep) {
  const ts = [];
  for (let t = 0; t < dur - 0.05; t += step) ts.push(r3(t));
  const last = r3(Math.max(0, dur - 0.3));
  if (!ts.length) ts.push(0);
  if (last - ts[ts.length - 1] > 3) ts.push(last);
  return ts.slice(0, 80);
}

export function makeQcSheet(file, dur, outFile) {
  const ts = sheetTimes(dur);
  const cw = 480, ch = 270, gap = 10, bar = 30, cols = 4, rows = Math.ceil(ts.length / cols);
  const c = canvas(cols * cw + (cols + 1) * gap, rows * (ch + bar) + (rows + 1) * gap, [11, 16, 32]);
  ts.forEach((t, k) => {
    const x = gap + (k % cols) * (cw + gap), y = gap + Math.floor(k / cols) * (ch + bar + gap);
    let data;
    try { data = rawFrame(file, { at: t, width: cw, height: ch }); } catch { data = Buffer.alloc(cw * ch * 3); }
    blit(c, { w: cw, h: ch, data }, x, y + bar);
    fillRect(c, x, y, cw, bar, [30, 39, 64]);
    text(c, fmtT(t), x + 8, y + 5, 3, [255, 212, 0]);
  });
  writeJpg(c, outFile, 3);
  return { file: outFile, count: ts.length, times: ts };
}

export function finalCheck(P, flags) {
  const file = flags.file ? path.resolve(flags.file) : path.join(P.project, '成片', 'final.mp4');
  if (!fs.existsSync(file)) throw new Error(`找不到成片 ${rel(file)} → 先 render（USAGE.md 2.7），或用 --file 指定 mp4`);
  const info = probeMedia(file);
  if (!info.hasVideo) throw new Error(`${rel(file)} 沒有影像 → 檔案壞了或不是影片`);
  const dur = info.duration;
  const exp = expectedFromBuild(P, flags);
  const det = detect(file, dur, info.hasAudio);
  const facts = { width: info.width, height: info.height, fps: info.fps, vfr: info.vfr, hasAudio: info.hasAudio, dur, expected: exp.expected ?? null, items: exp.items || [], cuts: exp.cuts || [], ...det };
  const verdict = judge(facts);
  if (exp.error) verdict.checks.splice(2, 0, { key: 'build', level: 'warn', text: `${exp.error} → 時間對不到段落、長度也沒有預期值，先修好專案再重跑 qc` }), verdict.warnings++;
  let sheet = null;
  try { sheet = makeQcSheet(file, dur, path.join(P.project, '成片', '驗收截圖', 'qc-sheet.jpg')); } catch (e) {
    verdict.checks.push({ key: 'sheet', level: 'warn', text: `總覽圖產生失敗：${e.message}` }); verdict.warnings++;
  }
  return { file, facts, ...verdict, sheet };
}

const ICON = { ok: '✔', warn: '⚠', error: '✖' };

function printFinal(P, r) {
  console.log(`專案：${rel(P.project)}\n成片：${rel(r.file)}\n`);
  for (const c of r.checks) console.log(`${ICON[c.level]} ${c.text}`);
  if (r.sheet) console.log(`\n→ 總覽圖 ${rel(r.sheet.file)}（${r.sheet.count} 格，每 ${LIMITS.sheetStep} 秒一格；打開掃一眼有沒有掉圖、卡住）`);
  console.log(`\n${r.errors ? `✖ ${r.errors} 項錯誤` : '✔ 沒有錯誤'}${r.warnings ? `、⚠ ${r.warnings} 項提醒` : ''}${r.errors ? ' → 先修好再交付' : r.warnings ? ' → 逐項確認是不是刻意的' : ' → 可以交付'}`);
}

// ---------- speaker ----------

// 抽一格，等比放進 1920×1080（不足補黑）；frame＝[x, y, w, h]（1920×1080 座標）時再裁切放大回 1920×1080
function frame1080(file, at, frame = null) {
  const crop = frame ? `,crop=${frame[2]}:${frame[3]}:${frame[0]}:${frame[1]},scale=1920:1080:flags=lanczos` : '';
  const vf = `scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black${crop},format=rgb24`;
  const args = ['-v', 'error', '-ss', String(r3(at)), '-i', file, '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'];
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 28 });
  if (r.error) throw r.error.code === 'ENOENT' ? new Error('找不到 ffmpeg：先跑 npx hyperframes doctor') : r.error;
  if (r.status !== 0 || r.stdout.length !== 1920 * 1080 * 3) throw new Error(`抽不到第 ${r3(at)}s 的畫面：${tail(r.stderr?.toString())}`);
  return r.stdout;
}

export function speakerTimes(dur, n = 8) {
  return Array.from({ length: n }, (_, i) => r3(Math.min(Math.max(0, dur - 0.1), (dur * (i + 0.5)) / n)));
}

const lum = (d, i) => (d[i] * 54 + d[i + 1] * 183 + d[i + 2] * 19) >> 8;

// 平均畫面＋動作範圍。回傳 { mean(rgb Buffer), dev(Uint8Array 每像素最大亮度偏差), bbox }
export function motionStats(frames, w = 1920, h = 1080, { thresh = 40, minPx = 12 } = {}) {
  const n = frames.length, px = w * h;
  const sum = new Uint32Array(px * 3);
  for (const f of frames) for (let i = 0; i < px * 3; i++) sum[i] += f[i];
  const mean = Buffer.alloc(px * 3);
  for (let i = 0; i < px * 3; i++) mean[i] = Math.round(sum[i] / n);
  const dev = new Uint8Array(px);
  for (const f of frames) for (let p = 0; p < px; p++) {
    const d = Math.abs(lum(f, p * 3) - lum(mean, p * 3));
    if (d > dev[p]) dev[p] = d;
  }
  const cols = new Uint16Array(w), rows = new Uint16Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dev[y * w + x] > thresh) { cols[x]++; rows[y]++; }
  let x1 = -1, x2 = -1, y1 = -1, y2 = -1;
  for (let x = 0; x < w; x++) if (cols[x] >= minPx) { if (x1 < 0) x1 = x; x2 = x; }
  for (let y = 0; y < h; y++) if (rows[y] >= minPx) { if (y1 < 0) y1 = y; y2 = y; }
  return { mean, dev, bbox: x1 < 0 || y1 < 0 ? null : [x1, y1, x2, y2] };
}

export const padBox = (b, pad = 40, w = 1920, h = 1080) => [Math.max(0, b[0] - pad), Math.max(0, b[1] - pad), Math.min(w, b[2] + pad), Math.min(h, b[3] + pad)];

function rectOutline(c, [x1, y1, x2, y2], rgb, t = 4) {
  fillRect(c, x1, y1, x2 - x1, t, rgb); fillRect(c, x1, y2 - t, x2 - x1, t, rgb);
  fillRect(c, x1, y1, t, y2 - y1, rgb); fillRect(c, x2 - t, y1, t, y2 - y1, rgb);
}

export function speakerMaps(P, flags) {
  const src = flags.file ? path.resolve(flags.file) : path.join(P.project, 'work', 'rough.mp4');
  if (!fs.existsSync(src)) throw new Error(`找不到 ${rel(src)} → 先完成「剪乾淨」產生 work/rough.mp4，或用 --file 指定影片`);
  const info = probeMedia(src);
  if (!info.hasVideo || !info.duration) throw new Error(`${rel(src)} 讀不到影像或長度`);
  const ts = speakerTimes(info.duration);
  const frame = planFrame(P);
  const frames = ts.map((t) => frame1080(src, t, frame));
  const W = 1920, H = 1080;

  // 疊影圖：平均畫面；動作範圍上橘色，青色框是動作範圍外擴 40px 的建議框
  const { mean, dev, bbox } = motionStats(frames, W, H);
  const c = { w: W, h: H, data: Buffer.from(mean) };
  for (let p = 0; p < W * H; p++) {
    const a = Math.min(0.5, Math.max(0, (dev[p] - 25) / 100));
    if (a > 0) for (let k = 0; k < 3; k++) c.data[p * 3 + k] = Math.round(c.data[p * 3 + k] * (1 - a) + [255, 140, 0][k] * a);
  }
  const suggest = bbox ? padBox(bbox) : null;
  if (suggest) rectOutline(c, suggest, [0, 229, 255], 3);
  drawGrid(c);
  const mapFile = path.join(P.project, 'work', '場地照-動作範圍.jpg');
  writeJpg(c, mapFile, 2);

  // 8 格總表：2 欄 × 4 列
  const cw = 720, ch = 405, gap = 10, bar = 30, cols = 2, rows = 4;
  const s = canvas(cols * cw + (cols + 1) * gap, rows * (ch + bar) + (rows + 1) * gap, [11, 16, 32]);
  frames.forEach((f, k) => {
    const x = gap + (k % cols) * (cw + gap), y = gap + Math.floor(k / cols) * (ch + bar + gap);
    const small = frame1080Down(f, W, H, cw, ch);
    blit(s, { w: cw, h: ch, data: small }, x, y + bar);
    fillRect(s, x, y, cw, bar, [30, 39, 64]);
    text(s, `${k + 1}/8  ${fmtT(ts[k])}`, x + 8, y + 5, 3, [255, 212, 0]);
  });
  const sheetFile = path.join(P.project, 'work', '場地照-8格.jpg');
  writeJpg(s, sheetFile, 3);
  return { src, srcSize: [info.width, info.height], times: ts, mapFile, sheetFile, bbox, suggest, frame, scaled: info.width !== W || info.height !== H };
}

// 最近鄰縮小（總表用，夠看就好）
function frame1080Down(buf, w, h, tw, th) {
  const out = Buffer.alloc(tw * th * 3);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / th));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(w - 1, Math.floor(((x + 0.5) * w) / tw));
      const si = (sy * w + sx) * 3, di = (y * tw + x) * 3;
      out[di] = buf[si]; out[di + 1] = buf[si + 1]; out[di + 2] = buf[si + 2];
    }
  }
  return out;
}

// plan.json 的 frame（沒有或格式不對就是 null；格式錯誤由 build --check 報）
function planFrame(P) {
  try {
    const fr = JSON.parse(fs.readFileSync(P.plan, 'utf8')).frame;
    return Array.isArray(fr) && fr.length === 4 && fr.every((v) => Number.isFinite(v)) ? fr.map(Math.round) : null;
  } catch { return null; }
}

// ---------- framing（構圖預覽） ----------

// 四周的黑邊（平均畫面每一列／行的平均亮度 < 18 就算黑邊）→ 內容範圍 [x1, y1, x2, y2]
export function contentBox(mean, w = 1920, h = 1080, th = 18) {
  const rowL = (y) => { let t = 0; for (let x = 0; x < w; x += 4) t += lum(mean, (y * w + x) * 3); return t / Math.ceil(w / 4); };
  const colL = (x) => { let t = 0; for (let y = 0; y < h; y += 4) t += lum(mean, (y * w + x) * 3); return t / Math.ceil(h / 4); };
  let y1 = 0, y2 = h, x1 = 0, x2 = w;
  while (y1 < h / 3 && rowL(y1) < th) y1++;
  while (y2 > (h * 2) / 3 && rowL(y2 - 1) < th) y2--;
  while (x1 < w / 3 && colL(x1) < th) x1++;
  while (x2 > (w * 2) / 3 && colL(x2 - 1) < th) x2--;
  return [x1, y1, x2, y2];
}

// 每個放大倍率的 16:9 裁切框：寬取 16 的倍數；講者水平置中；頭頂上方留 head px（成片座標）；夾在內容範圍裡
export function framingCandidates(motion, content, zooms = [1, 1.15, 1.3], head = 120) {
  const [bx1, by1, bx2, by2] = motion, cx = (bx1 + bx2) / 2;
  const cw = content[2] - content[0], ch = content[3] - content[1];
  const maxW = Math.floor(Math.min(cw, (ch * 16) / 9) / 16) * 16;
  return zooms.map((z) => {
    const w = Math.min(maxW, Math.round(1920 / z / 16) * 16), h = (w * 9) / 16, k = 1920 / w;
    const clamp = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), hi));
    const x = clamp(cx - w / 2, content[0], content[2] - w), y = clamp(by1 - head / k, content[1], content[3] - h);
    const tf = (b) => [Math.round((b[0] - x) * k), Math.round((b[1] - y) * k), Math.round((b[2] - x) * k), Math.round((b[3] - y) * k)];
    const m = tf(motion);
    const cut = [m[0] < 40 && '左', m[1] < 40 && '上', m[2] > 1880 && '右'].filter(Boolean);
    return { zoom: +r2(k), frame: [x, y, w, h], motion: m, cut };
  });
}

export function framingPreview(P, flags) {
  const src = flags.file ? path.resolve(flags.file) : path.join(P.project, 'work', 'rough.mp4');
  if (!fs.existsSync(src)) throw new Error(`找不到 ${rel(src)} → 先完成「剪乾淨」產生 work/rough.mp4，或用 --file 指定影片`);
  const info = probeMedia(src);
  if (!info.hasVideo || !info.duration) throw new Error(`${rel(src)} 讀不到影像或長度`);
  const ts = speakerTimes(info.duration);
  const frames = ts.map((t) => frame1080(src, t));
  const W = 1920, H = 1080;
  const { mean, bbox } = motionStats(frames, W, H);
  if (!bbox) throw new Error('8 格之間幾乎沒有動作，量不到講者範圍：請看 work/場地照-8格.jpg 手動決定 frame');
  const content = contentBox(mean, W, H);
  // 動作範圍的下緣常包到桌面倒影：只取到內容範圍的 90%，頭頂與左右照量到的
  const motion = [bbox[0], bbox[1], bbox[2], Math.min(bbox[3], content[1] + (content[3] - content[1]) * 0.9)];
  const zooms = (flags.zooms ? String(flags.zooms).split(',').map(Number) : [1, 1.15, 1.3]).filter((z) => z >= 1 && z <= 2);
  const cands = framingCandidates(motion, content, zooms.length ? zooms : [1, 1.15, 1.3]);
  for (const c of cands) c.upscale = +r2((c.zoom * 1920) / (info.width || 1920));   // 來源像素被放大幾倍（> 3 會明顯變軟）
  // 預覽圖：每個倍率一格（用中間那一格畫面，不用平均圖，比較看得清楚）
  const pw = 640, ph = 360, gap = 10, bar = 30;
  const c = canvas(cands.length * pw + (cands.length + 1) * gap, ph + bar + 2 * gap, [11, 16, 32]);
  const pick = frames[Math.floor(frames.length / 2)];
  cands.forEach((cd, i) => {
    const x0 = gap + i * (pw + gap), [fx, fy, fw, fh] = cd.frame;
    const out = Buffer.alloc(pw * ph * 3);
    for (let y = 0; y < ph; y++) {
      const sy = Math.min(H - 1, Math.floor(fy + ((y + 0.5) * fh) / ph));
      for (let x = 0; x < pw; x++) {
        const sx = Math.min(W - 1, Math.floor(fx + ((x + 0.5) * fw) / pw));
        const si = (sy * W + sx) * 3, di = (y * pw + x) * 3;
        out[di] = pick[si]; out[di + 1] = pick[si + 1]; out[di + 2] = pick[si + 2];
      }
    }
    const panel = { w: pw, h: ph, data: out };
    const s = pw / 1920, m = cd.motion.map((v) => Math.round(v * s));
    rectOutline(panel, [Math.max(0, m[0]), Math.max(0, m[1]), Math.min(pw, m[2]), Math.min(ph, m[3])], [255, 140, 0], 2);
    blit(c, panel, x0, gap + bar);
    fillRect(c, x0, gap, pw, bar, cd.cut.length ? [90, 20, 30] : [30, 39, 64]);
    text(c, `${cd.zoom.toFixed(2)}x  ${cd.frame.join(',')}`, x0 + 8, gap + 5, 3, [255, 212, 0]);
  });
  const file = path.join(P.project, 'work', '構圖預覽.jpg');
  writeJpg(c, file, 2);
  const cards = flags.cards ? cardsPreview(P, flags, src, info, cands) : null;
  return { src, srcSize: [info.width, info.height], times: ts, motion, content, cands, file, cards };
}

// 套卡預覽的示意段落（秒數是 24 秒靜態短片上的絕對秒數）＋各段完成態的截圖時間
const CARD_SCENES = [
  { id: 'c1', scene: 'key-point', from: 0.4, to: 6.0, slots: { lead: '下方字卡', key: '重點會疊在這個位置' } },
  { id: 'c2', scene: 'side-panel', from: 6.4, to: 15.0, slots: { eyebrow: '半畫面', title: '講者推到**右半邊**//左邊放重點',
    items: ['第一個重點 ｜icon=check', '第二個重點 ｜icon=check', '第三個重點 ｜icon=check'] } },
  { id: 'c3', scene: 'fs-list', from: 15.4, to: 23.6, slots: { title: '子母畫面',
    items: ['資訊卡占滿畫面 ｜icon=layout-template', '講者縮到右下角小窗 ｜icon=user', '適合清單、流程、對照 ｜icon=list-checks'] } },
];
const CARD_SHOTS = [{ label: 'overlay', at: 4.8 }, { label: 'side', at: 13.6 }, { label: 'pip', at: 22.6 }];

export function cardsPreview(P, flags, src, info, cands) {
  const tmp = path.join(P.project, 'work', '.framing-preview');
  fs.mkdirSync(tmp, { recursive: true });
  // 中間一格 → 24 秒靜態短片（沒有聲音）＋一則示意字幕
  const mid = path.join(tmp, 'mid.jpg');
  writeJpg({ w: 1920, h: 1080, data: frame1080(src, info.duration / 2) }, mid, 2);
  const still = path.join(tmp, 'still.mp4');
  let r = run('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-i', mid, '-t', '24', '-r', '30', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', still]);
  if (r.status !== 0) throw new Error(`做不出靜態短片：${tail(r.stderr)}`);
  const srt = path.join(tmp, 'sample.srt');
  fs.writeFileSync(srt, '1\n00:00:00,000 --> 00:00:24,000\n字幕會出現在這個位置\n');
  const build = path.join(HERE, 'build.mjs'), sfx = path.resolve(HERE, '..', '..', 'sfx');
  const rows = [];
  for (const cd of cands) {
    const dir = path.join(tmp, `z${cd.zoom.toFixed(2).replace('.', '')}`);
    fs.mkdirSync(dir, { recursive: true });
    const plan = { version: 1, ...(cd.zoom > 1.001 ? { frame: cd.frame } : {}), speakerBox: padBox(cd.motion), pipCrop: 'auto', scenes: CARD_SCENES };
    const planFile = path.join(tmp, `plan-${path.basename(dir)}.json`);
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 1));
    const args = [build, '--project', P.project, '--video', still, '--srt', srt, '--plan', planFile, '--out', dir, '--no-loudnorm', '--no-declick', '--force'];
    if (fs.existsSync(sfx)) args.push('--sfx', sfx);
    if (flags.template) args.push('--template', path.resolve(flags.template));
    r = run(process.execPath, args);
    if (r.status !== 0) throw new Error(`${cd.zoom}x 的示意 build 失敗：${tail(r.stdout + r.stderr, 600)}`);
    const shots = path.join(dir, 'shots');
    fs.rmSync(shots, { recursive: true, force: true });
    r = run('npx', ['hyperframes', 'snapshot', '--at', CARD_SHOTS.map((x) => x.at).join(','), '--no-end', '-o', 'shots'], { cwd: dir });
    const pngs = fs.existsSync(shots) ? fs.readdirSync(shots).filter((x) => /^frame-.*\.png$/.test(x)).sort() : [];
    if (pngs.length < CARD_SHOTS.length) throw new Error(`${cd.zoom}x 的示意截圖不完整：${tail(r.stdout + r.stderr)}`);
    rows.push({ cd, files: pngs.map((x) => path.join(shots, x)) });
  }
  // 拼表：列＝倍率、欄＝版面
  const cw = 640, ch = 360, gap = 10, bar = 30;
  const head = gap;   // 點陣字只有數字與少數符號，欄名寫在指令輸出裡（左到右：疊加／半畫面／子母畫面）
  const c = canvas(CARD_SHOTS.length * cw + (CARD_SHOTS.length + 1) * gap, head + rows.length * (ch + bar + gap) + gap, [11, 16, 32]);
  rows.forEach(({ cd, files }, i) => {
    const y = head + i * (ch + bar + gap);
    fillRect(c, gap, y, c.w - 2 * gap, bar, cd.cut.length ? [90, 20, 30] : [30, 39, 64]);
    text(c, `${cd.zoom.toFixed(2)}x  ${cd.frame.join(',')}`, gap + 8, y + 5, 3, [255, 212, 0]);
    files.forEach((f, k) => blit(c, { w: cw, h: ch, data: rawFrame(f, { width: cw, height: ch }) }, gap + k * (cw + gap), y + bar));
  });
  const file = path.join(P.project, 'work', '構圖預覽-套卡.jpg');
  writeJpg(c, file, 2);
  return { file, tmp };
}

function printFraming(P, r) {
  console.log(`專案：${rel(P.project)}\n來源：${rel(r.src)}（${r.srcSize[0]}×${r.srcSize[1]}）`);
  console.log(`講者動作範圍 [${r.motion.join(', ')}]（下緣只算到內容範圍 90%，避開桌面倒影）`);
  const [x1, y1, x2, y2] = r.content;
  console.log(x1 || y1 || x2 < 1920 || y2 < 1080 ? `偵測到黑邊：內容範圍 [${r.content.join(', ')}]，裁切框都在這裡面` : '四周沒有黑邊');
  console.log(`\n→ ${rel(r.file)}：每個倍率一格，橘框是講者動作範圍（裁切後）；紅底標題＝會切到手勢\n`);
  console.log('倍率｜frame（寫進 plan.json）｜講者動作範圍（裁切後）｜備註');
  for (const c of r.cands) {
    const notes = [];
    if (c.zoom === 1) notes.push('原樣，不裁切（不用寫 frame）');
    if (c.cut.length) notes.push(`⚠ 會切到${c.cut.join('、')}側手勢`);
    if (r.srcSize[0] < 1920) notes.push(`來源 ${r.srcSize[0]}px 寬，每個像素放大 ${c.upscale} 倍${c.upscale > 3.5 ? '，會明顯變軟' : ''}`);
    console.log(`${c.zoom.toFixed(2)}x｜[${c.frame.join(', ')}]｜[${c.motion.join(', ')}]｜${notes.join('；') || '—'}`);
  }
  if (r.cards) console.log(`\n→ ${rel(r.cards.file)}：套卡預覽，每一列是一個倍率，欄由左到右是「疊加（下方字卡）｜半畫面（側邊欄）｜子母畫面（全畫面清單＋右下小窗）」，用影片中間一格套目前的風格`);
  console.log('\n下一步：把使用者選的那一列 frame 寫進 plan.json 第一層（"frame": [x, y, w, h]），再跑 qc.mjs speaker 量講者框');
}

function printSpeaker(P, r) {
  console.log(`專案：${rel(P.project)}\n來源：${rel(r.src)}（${r.srcSize[0]}×${r.srcSize[1]}${r.scaled ? ' → 已等比放大成 1920×1080，圖上座標可直接寫進 speakerBox' : ''}）`);
  if (r.frame) console.log(`構圖裁切：照 plan.json 的 frame [${r.frame.join(', ')}] 裁切放大後量（座標是成片上的座標）`);
  console.log(`抽幀時間：${r.times.map(fmtT).join('、')}\n`);
  console.log(`→ ${rel(r.mapFile)}：疊影圖。橘色是動作掃過的地方，黃線每 100px 一條（粗線每 500px），數字是 1920×1080 的座標`);
  console.log(`→ ${rel(r.sheetFile)}：8 格總表，看每個時間點講者的姿勢`);
  if (r.suggest) console.log(`\n偵測到的動作範圍 [${r.bbox.join(', ')}]，外擴 40px 的青色建議框 speakerBox ≈ [${r.suggest.join(', ')}]（只是參考，一定要自己看圖）`);
  else console.log('\n8 格之間幾乎沒有動作，沒辦法自動估範圍，請看 8 格總表手動框');
  console.log('\n閱讀方式：');
  console.log('  1. 先看 8 格總表，確認講者位置沒有跳來跳去（有的話取最大範圍）');
  console.log('  2. 再看疊影圖：橘色最遠的手勢邊緣讀出 x1、x2，頭頂讀 y1，桌面或身體下緣讀 y2，四邊各外擴 40px');
  console.log('  3. 寫成 speakerBox: [x1, y1, x2, y2]；和青色建議框差很多時，以你看圖讀的為準');
}

// ---------- main ----------

export async function cli() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || !flags.cmd || flags.cmd === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  if (!['final', 'speaker', 'framing'].includes(flags.cmd)) throw new Error(`沒有「${flags.cmd}」這個指令：只有 final、speaker、framing（用 --help 看用法）`);
  const P = pathsFrom({ project: flags.project, template: flags.template });
  if (flags.cmd === 'final') {
    const r = finalCheck(P, flags);
    if (flags.json) {
      const f = r.facts;
      console.log(JSON.stringify({
        ok: r.ok, errors: r.errors, warnings: r.warnings, file: rel(r.file),
        checks: r.checks, format: { width: f.width, height: f.height, fps: f.fps, hasAudio: f.hasAudio },
        duration: { actual: f.dur, expected: f.expected }, loudness: f.loud ? { lufs: f.loud.i, truePeak: f.loud.tp } : null,
        freezes: f.freezes, blacks: f.blacks, silences: f.silences, sheet: r.sheet ? rel(r.sheet.file) : null,
      }, null, 2));
    } else printFinal(P, r);
    return r.ok ? 0 : 1;
  }
  if (flags.cmd === 'framing') { printFraming(P, framingPreview(P, flags)); return 0; }
  printSpeaker(P, speakerMaps(P, flags));
  return 0;
}

const isMain = () => {
  try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (isMain()) cli().then((code) => { process.exitCode = code; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });

#!/usr/bin/env node
/**
 * 品質檢查工具：完成影片驗收、講者動作範圍圖、構圖預覽、分鏡截圖、觀影總表（零依賴，只用 Node 22 與 ffmpeg／ffprobe；分鏡截圖與觀影總表另用 HyperFrames 的 Chrome）
 *
 *   node shared/template/tools/qc.mjs final --project projects/<專案> [--file <mp4>] [--json]
 *       完成影片驗收（預設檔案 output/final.mp4）。除了尺寸、30fps、音軌、長度，還抓「四項全過、內容卻壞」的問題：
 *         響度（整合響度 −15.5～−12.5 LUFS、true peak ≤ −1.0 dBTP）、畫面凍結（≥ 3 秒，章節轉場、全畫面段本來就靜止，已排除）、
 *         黑畫面（≥ 0.5 秒）、長時間沒聲音（≥ 4 秒）。凍結／黑畫面／無聲的時間會對到 plan.json 的段落 id。
 *         聲音還在講、畫面 ≥ 8 秒沒動（⚠，排除同上）；字還沒出現就被下一段蓋住（⚠）：這兩項只出文字，要看畫面用它印的 observe --from --to 只看那段。
 *         子母畫面段沒有講者小視窗（rough.mp4 全黑、專案又沒有聲音素材＝初剪壞了）是 ✖（直式叫「上下分割段沒有講者面板」，判準相同）。
 *         字幕（F8，照作者剪映）：抽 5 則中文字幕，量底板 y 956–1074 ± 4（build 好的頁面）與字高 71 ± 3（完成影片的白字），
 *         不合是 ⚠；字幕含「，」「。」、一則不到 0.6 秒也是 ⚠。直式：尺寸要 1080×1920、底板照 lib/canvas.mjs 的 caption.box（y 1291–1409）。
 *       另存總覽圖 output/qc/qc-sheet.jpg（每 10 秒一格，長片拉長間隔到最多 80 格、整片都有；最上面標主題 theme: light／dark），給人或 AI 快速掃一眼；
 *         直式每格 9:16，格上疊 unsafe[]（平台介面區）的紅色半透明框。
 *       預期長度跑 build.mjs --check --json 取得（rough.mp4 − cuts）。
 *       輸出 ✔／⚠／✖；有 ✖ 結束碼是 1，只有 ⚠ 是 0。--json 只印一個 JSON。
 *   node shared/template/tools/qc.mjs speaker --project projects/<專案> [--file <mp4>] [--write [--force]]
 *       --write：把青色建議框寫進 plan.json 的 speakerBox（已經有的不覆寫；--force 才覆寫）
 *       講者動作範圍圖：從 work/rough.mp4 平均抽 8 張，存
 *         work/場地照-動作範圍.jpg   疊影（平均）＋動作範圍上色＋青色建議框＋每 100px 座標格線
 *         work/場地照-8格.jpg        8 格總表（每格標時間）
 *       不是畫布尺寸（橫式 1920×1080、直式 1080×1920）的影片先等比放大（不足的邊補黑），圖上的座標直接就是 speakerBox 的座標。
 *       plan.json 有 frame（構圖裁切）時，先照 frame 裁切放大再量，座標就是裁切後完成影片上的座標。
 *   node shared/template/tools/qc.mjs framing --project projects/<專案> [--file <mp4>] [--zooms 1,1.15,1.3]
 *   node shared/template/tools/qc.mjs framing --project projects/<專案> --write   使用者說「用建議的」：把 ✔ 那一列寫進 plan.json（1.0 倍不寫）
 *       構圖預覽：量講者動作範圍、偵測四周黑邊，算出每個放大倍率的 16:9 裁切框（頭頂上方留 120px、講者水平置中），
 *       存 work/構圖預覽.jpg（每個倍率一格，橘框是講者動作範圍）並印出每個倍率的 frame 與會不會切到手勢。
 *       停點 ② 用剪輯台的構圖台（editor.mjs 印的「構圖台」網址）讓使用者拖框，拖好就自動寫進 plan.json 的 frame；
 *       使用者說「用建議的」就把建議那一列的 frame 寫進 plan.json 第一層（1.0 倍不寫）。之後再跑 speaker 量講者框。
 *       直式：候選是 9:16（1.0＝原畫面），垂直位置讓頭頂落在 y 380–520、下巴 ≤ 860（下巴用 work/face-landmarks.json，沒有就用動作範圍估），
 *       不合的倍率標 ⚠、不當建議。
 *       倍率表的「建議」欄：不切到手勢、來源像素放大 ≤ 3.5 倍的倍率裡最大的（只是建議，倍率由使用者在停點 ② 選）。
 *   node shared/template/tools/qc.mjs storyboard --project projects/<專案> [--only s05,s12] [--sheet] [--jobs N] [--verbose] [--json]
 *       --only：只重截這幾段（其他段的截圖不動；其他段的 ✖ 不擋；上次有拼圖就順便重做有動到的頁）。--sheet：另外拼成 work/storyboard-preview/sheet-NN.jpg（每頁 12 張，每格標時間、段 id、為什麼），印頁面清單；
 *       整支重截沒加 --sheet 時舊頁清掉（不留過期的圖）。
 *       --jobs：同時幾個截圖行程（預設 4，最多 8；張數少時自動少開）。還是範例原文的 custom 段不截（--only 指名的照截），印一行略過幾段。預設只印 ⚠ 與統計，--verbose 才印每張的表與貼上用的 markdown。
 *       每段的截圖清單與「為什麼」存在 work/storyboard-preview/shots.json（--json 也有：shots＝這次截的、allShots＝整支）。
 *       分鏡截圖：讀 build.mjs --check --json，每段在完成態截一張（段尾前 0.6 秒；讀動畫時間軸，還在退場或在動就往前）；
 *       動態 v2 的拍點各一張：抽屜抽出後 0.3 秒、焦點抬起後（漂浮、背景慢拉這類微動不算動畫）；
 *       條列逐條換的每組一張（進場動畫重疊的併一張，在那組進場完成後截）、
 *       錄影標註（紅框、標註、聚光燈、STEP、箭頭、放大鏡）每個到位時各一張。
 *       存成 work/storyboard-preview/<段 id>.png（多張時 <段 id>-1.png、-2.png…）；--verbose（或 --only）印出可貼進
 *       work/storyboard.md 的 ![s01](storyboard-preview/s01.png) 行。要先 build；plan.json 改過沒 build 會 ✖。
 *       錄影縮到原尺寸 < 60 %（直式只看橫的錄影）、沒有 moves 和 lens、> 3 秒 → ⚠ 介面字太小。
 *   node shared/template/tools/qc.mjs observe --project projects/<專案> [--from 60] [--to 120] [--file <mp4> --offset <秒>] [--json]
 *       預設不用跑：靜止與被蓋住 qc final 就會列（只出文字），它印的 --from --to 只看有問題的那段。
 *       觀影總表：從 output/final.mp4（或 --file 指定的測試片段）每 0.5 秒抽一格，拼成 work/observe/sheet-NN.jpg
 *       （6×8 格＝24 秒，每格下面印「時間｜段 id｜字幕」）；列出 ≥ 8 秒幾乎不變的靜止區間；
 *       每個段落起點與終點各做一條「前 0.5 秒到後 0.2 秒、每 0.1 秒一格」的接縫條帶 work/observe/seam-NN.jpg；
 *       拍點表 work/observe/beat-NN.jpg：和 storyboard 同一套取樣時刻（抽屜、焦點抬起、完成態、條列、標註），從完成影片抽格；
 *       索引在 work/observe/index.md（「小視窗」欄：子母畫面段有沒有講者小視窗）。--offset＝這個檔的第 0 秒是完成影片第幾秒（測試片段寫 build --test 的起點）。
 *       排版用 HyperFrames 的 Chrome（中文字），找不到會 ✖。直式格子是 9:16（總表 8×6 格＝24 秒、拍點 6 欄）。
 *
 * 長片：final 一次解碼算完偵測、靜止與總覽圖；observe 的抽格同時跑 6 個 ffmpeg、排版共用一個 Chrome。
 * --project：專案資料夾（projects/example，或只寫名稱 example）。測試用：--template <shared/template 資料夾>、--chrome <Chrome 執行檔>
 * --format landscape|portrait：蓋過版式（預設 plan.json "format" > 開工決策表「版式」> 主軌寬高比，lib/canvas.mjs）；每個指令第一行印「版式：…」（--json 不印）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pathsFrom, hasVoiceSource, build } from './build.mjs';
import { writeAtomic } from './lib/atomic.mjs';
import { run, probeMedia, rawFrame, writeJpg, lut3dFilter, blackDetect } from './lib/ff.mjs';
import { ensureLook } from './lib/look.mjs';
import { canvas, fillRect, blit, text, contactSheet, spawnAsync, pool } from './lib/raster.mjs';
import { parseSrt } from './lib/srt.mjs';
import { findChrome, findRuntime, openSession, openBrowser } from './lib/audit-browser.mjs';
import { gateCheck } from './lib/audit-rules.mjs';
import { hfArgs } from './lib/hf.mjs';
import { drawGrid } from './media.mjs';
import { canvasOf, resolveFormat, formatLine } from './lib/canvas.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Windows 的 npx 是 npx.cmd，要經過 shell 才叫得起來（其他平台不變）
const VALUE_FLAGS = ['project', 'template', 'file', 'zooms', 'from', 'to', 'offset', 'chrome', 'format', 'only', 'jobs'];
const r1 = (n) => Number(n).toFixed(1);
const r2 = (n) => Number(n).toFixed(2);
const r3 = (n) => +Number(n).toFixed(3);
// 工作區（目前資料夾）外的路徑印絕對路徑（cli-004 §1）
const rel = (p) => { const r = path.relative(process.cwd(), p); return !r ? '.' : r.startsWith('..') || path.isAbsolute(r) ? path.resolve(p) : r; };
const tail = (s, n = 400) => String(s ?? '').trim().slice(-n);

// 判斷門檻
export const LIMITS = { width: 1920, height: 1080, fps: 30, durTol: 0.1, lufsMin: -15.5, lufsMax: -12.5, tpMax: -1.0, freeze: 3, black: 0.5, silence: 4, sheetStep: 10, sheetMax: 80 };
// 併發：--jobs 預設與上限（storyboard 的截圖行程）；ffmpeg 抽格、Chrome 排版同時幾個
export const JOBS = { default: 4, max: 8, ffmpeg: 6, chrome: 4 };
export function jobsOf(v) {
  if (v == null) return JOBS.default;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > JOBS.max) throw new Error(`--jobs 要是 1–${JOBS.max} 的整數，現在是「${v}」→ 改成 1–${JOBS.max}，或不寫（預設 ${JOBS.default}）`);
  return n;
}

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`看不懂的參數「${a}」→ 參數都以 -- 開頭；用 node shared/template/tools/qc.mjs --help 看用法`);
    const [k, inline] = a.slice(2).split('=');
    if (VALUE_FLAGS.includes(k)) {
      const v = inline ?? rest[++i];
      if (v == null) throw new Error(`--${k} 後面要接值 → 在 --${k} 後面補上值（用 --help 看格式）`);
      flags[k] = v;
    } else if (['json', 'help', 'write', 'force', 'sheet', 'sample', 'verbose'].includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數 → 拿掉它；用 node shared/template/tools/qc.mjs --help 看有哪些參數`);
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

// ---------- 純函式：完成影片時間 ↔ rough.mp4 時間（cuts）、對到段落 ----------

const sortCuts = (cuts) => (cuts || []).filter((c) => Array.isArray(c) && c.length === 2).map(([a, b]) => [Number(a), Number(b)]).sort((x, y) => x[0] - y[0]);

// 完成影片第 o 秒 → rough.mp4 第幾秒（cuts 是 rough 時間）
export function finalToRough(o, cuts) {
  let acc = 0;
  for (const [a, b] of sortCuts(cuts)) {
    if (o > a - acc + 1e-9) acc += b - a; else break;
  }
  return r3(o + acc);
}

// rough.mp4 第 t 秒 → 完成影片第幾秒（落在被剪掉的區間時，對到剪接點）
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

// ---------- 子母畫面段的講者小視窗（F2）----------

// plan.json 的 scenes（讀不到就空陣列；格式錯誤由 build --check 報）
// 版式（009 FR-003）：--format > plan.json > 開工決策表 > 主軌；canvas＝lib/canvas.mjs 的畫布設定，line＝每個指令第一行印的「版式：…」
export function formatOf(P, flags = {}) {
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch { /* 還沒寫 plan.json */ }
  const r = resolveFormat({ projectDir: P.project, plan, flag: flags.format ?? null });
  return { ...r, canvas: canvasOf(r.format), line: formatLine(r) };
}

// 直式的「講者小視窗」叫「講者面板」、「子母畫面段」叫「上下分割段」（FR-090、FR-042），判準相同
export const panelWords = (portrait) => (portrait ? { win: '講者面板', seg: '上下分割段' } : { win: '講者小視窗', seg: '子母畫面段' });

export function planScenes(P) {
  try { const j = JSON.parse(fs.readFileSync(P.plan, 'utf8')); return Array.isArray(j.scenes) ? j.scenes : []; } catch { return []; }
}

// 照 plan.mjs 的規則，這段應該有講者小視窗嗎：全畫面家族（04）、layout "fullscreen" 的 custom、media；plan 寫 pip: false 的不算
export function wantsPip(it, seg = {}) {
  if (seg.pip === false) return false;
  return (it.type === 'scene' && it.family === 'fullscreen') || (it.type === 'custom' && !!it.opaque) || it.type === 'media';
}

const pipKind = (it) => (it.type === 'scene' ? String(it.label || '').replace(/^\S+\s+/, '') : it.type === 'custom' ? `全畫面情境動畫（${it.key ?? it.label}）` : `插入素材（${it.key ?? it.src ?? ''}）`);

// 每個應該有小視窗的段：小視窗看得到講者的區間、缺哪裡（完成影片秒數；缺口 < 0.3 秒不算）。
// black＝rough.mp4 全黑的區間（完成影片秒數）：小視窗開著、底片卻是黑的，也算沒有講者
export function pipCoverage(items, scenes = [], black = []) {
  const byId = new Map(scenes.map((g) => [g.id, g]));
  return (items || []).filter((it) => it.out && wantsPip(it, byId.get(it.id))).map((it) => {
    const pip = (it.out.pip || []).flatMap((p) => subtractRanges([p.start, p.end], black)).filter(([a, b]) => b - a > 0.05);
    const gaps = subtractRanges([it.out.start, it.out.end], pip).filter(([a, b]) => b - a >= 0.3);
    return { id: it.id, kind: pipKind(it), start: it.out.start, end: it.out.end, pip, gaps, state: !gaps.length ? '有' : !pip.length ? '無' : '部分' };
  });
}

const fmtT2 = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

// 相鄰 ≤ 0.1 秒的全黑區間併成一段（blackdetect 常每幾秒斷一格）
export function mergeRanges(ranges, gap = 0.1) {
  const out = [];
  for (const [a, b] of [...(ranges || [])].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a - last[1] <= gap) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}

// 應該有小視窗卻沒有、缺口落在 rough.mp4 的全黑區間，而專案沒有只有聲音的素材 → 初剪壞了（✖ 訊息）
// 全黑區間：--check --json 的 roughBlack（002：沒有聲音素材時 voiceOnly 是空的、小視窗照開）；舊版沒有這欄時用 voiceOnly（小視窗被拿掉）
export function pipMissing({ items, scenes = [], voiceOnly = [], roughBlack = [], cuts = [], hasVoice = false, project, portrait = false }) {
  if (hasVoice) return [];
  const { win } = panelWords(portrait);
  const black = mergeRanges(roughBlack?.length ? roughBlack : voiceOnly);
  const out = [];
  for (const c of pipCoverage(items, scenes, black.map(([a, b]) => [roughToFinal(a, cuts), roughToFinal(b, cuts)]))) {
    if (!c.gaps.length) continue;
    const hit = black.filter(([a, b]) => c.gaps.some(([x, y]) => finalToRough(x, cuts) < b - 1e-6 && finalToRough(y, cuts) > a + 1e-6));
    if (!hit.length) continue;
    const where = hit.map(([a, b]) => `${fmtT2(a)}–${fmtT2(b)}`).join('、');
    const head = c.state === '無' ? `${c.id} 是${c.kind}卻沒有${win}` : `${c.id} 是${c.kind}，${win}在 ${fmtT2(c.gaps[0][0])} 就沒了（段到 ${fmtT2(c.end)}）`;
    out.push({ id: c.id, msg: `${head}：work/rough.mp4 在 ${where} 是全黑（原始素材不是）→ 初剪壞了，跑 node shared/template/tools/media.mjs verify-rough --project ${project} 照它印的做` });
  }
  return out;
}

export const isChapterItem = (it) => it?.type === 'scene' && /^01(\s|$)/.test(String(it.label || ''));

// 段落顯示名：scene → "s03 全畫面流程"（拿掉 label 開頭的情境編號）；media → "m01 螢幕錄影"／"m01 圖片"
export function itemName(it) {
  if (!it) return '主軌講解';
  if (it.type === 'media') return `${it.id} ${it.kind === 'image' ? '圖片' : '螢幕錄影'}`;
  const name = String(it.label || '').replace(/^\S+\s+/, '');
  return `${it.id}${name ? ` ${name}` : ''}`;
}

// 完成影片的 [a, b] 對到哪一段：換成 rough 時間後，取重疊最多的段落；沒有重疊回 null
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

// 章節轉場、全畫面段（scene／custom）本來就靜止（模板不做微動）：凍結區間扣掉這些段（完成影片時間軸）；剩下 ≥ minDur 的才算；錄影段、講者滿版照查
// 有小視窗的全畫面段也扣：小視窗很小、講者停一下整張畫面就幾乎不變，31 分鐘的片子會報十幾則雜訊。講者底片凍結在滿版的地方查得到
const stillByDesign = (it) => isChapterItem(it) || (it?.opaque && (it.type === 'scene' || it.type === 'custom'));
const stillHoles = (items, cuts) => (items || []).filter(stillByDesign).map((it) => [roughToFinal(it.start, cuts) - 0.15, roughToFinal(it.shownEnd ?? it.end, cuts) + 0.15]);
export function freezeIssues(freezes, items, cuts = [], minDur = LIMITS.freeze) {
  const holes = stillHoles(items, cuts);
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
  // 尺寸照版式（FR-090）：f.canvas＝lib/canvas.mjs 的畫布（沒給就是橫式 1920×1080）
  const W = f.canvas?.W ?? L.width, H = f.canvas?.H ?? L.height;
  if (f.width !== W || f.height !== H) bad.push(`尺寸 ${f.width}×${f.height}（要 ${W}×${H}）`);
  if (!Number.isFinite(f.fps) || Math.abs(f.fps - L.fps) > 0.05 || f.vfr) bad.push(`影格率 ${f.fps}fps${f.vfr ? '（變動影格率）' : ''}（要固定 ${L.fps}fps）`);
  if (!f.hasAudio) bad.push('沒有音軌');
  if (bad.length) add('format', 'error', `格式不合：${bad.join('；')} → render 指令加 --fps 30，尺寸以 build 產生的 ${W}×${H} 為準，沒聲音就檢查 rough.mp4 有沒有音軌`);
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
  if (!fz.length) add('freeze', 'ok', `沒有 ≥ ${L.freeze} 秒的畫面凍結（章節轉場、無小視窗全畫面段已排除）`);
  for (const rg of fz) add('freeze', 'warn', `${rng(rg)} 畫面凍結 ${r1(rg[1] - rg[0])} 秒${where(rg)} → 看 qc-sheet.jpg 與該段起點截圖；螢幕錄影先確認素材有在動，重 render 該段；多半是 seek 卡住或素材本身靜止`);

  if (Array.isArray(f.pipMissing)) {
    const { win, seg } = panelWords(f.canvas?.format === 'portrait');
    if (!f.pipMissing.length) add('pip', 'ok', `${seg}都有${win}`);
    for (const m of f.pipMissing) add('pip', 'error', m.msg);
  }

  // 字幕（F8）：樣式量測與文字規則；沒有字幕檔時兩項都不判
  if (f.captionStyle) for (const c of captionStyleChecks(f.captionStyle, captionSpec(f.canvas))) add('captions', c.level, c.text);
  if (Array.isArray(f.cues) && f.cues.length) for (const c of captionTextChecks(f.cues)) add('captext', c.level, c.text);

  const bl = (f.blacks || []).filter(([a, b]) => b - a >= L.black - 1e-6);
  if (!bl.length) add('black', 'ok', `沒有 ≥ ${L.black} 秒的黑畫面`);
  for (const rg of bl) add('black', 'warn', `${rng(rg)} 黑畫面 ${r1(rg[1] - rg[0])} 秒${where(rg)} → 可能掉圖，或只有聲音的區間沒用 media 段蓋住；截該段確認`);

  const sl = (f.silences || []).filter(([a, b]) => b - a >= L.silence - 1e-6);
  if (!f.hasAudio) { /* 沒音軌已在格式判成 ✖ */ }
  else if (!sl.length) add('silence', 'ok', `沒有 ≥ ${L.silence} 秒的無聲區間`);
  for (const rg of f.hasAudio ? sl : []) add('silence', 'warn', `${rng(rg)} 沒有聲音 ${r1(rg[1] - rg[0])} 秒${where(rg)} → 可能是漏剪的停頓；刻意留白就不用理它`);

  // 靜止與被蓋住（從 observe、storyboard 併過來，只出文字；observe 不跑也抓得到）
  const peek = (a, b) => `node shared/template/tools/qc.mjs observe --project ${f.project ?? 'projects/<專案>'}${f.fileArg ?? ''} --from ${Math.max(0, Math.floor(a - 1))} --to ${f.dur ? Math.min(Math.ceil(b + 1), Math.floor(f.dur)) : Math.ceil(b + 1)}`;
  if (Array.isArray(f.stills)) {
    if (!f.stills.length) add('still', 'ok', `錄影、圖片段沒有聲音還在講、畫面卻 ≥ ${OBS.still} 秒沒動的區間`);
    for (const s of f.stills.slice(0, STILL_SHOW)) add('still', 'warn', `${rng([s.from, s.to])} 聲音還在講、畫面 ${r1(s.to - s.from)} 秒沒動（${s.id ?? '主軌講解'}${s.cue ? `｜${s.cue}` : ''}）→ 對照講解決定要不要補畫面（換段、加標註或情境動畫），刻意留白就不用理它；要看這段：${peek(s.from, s.to)}`);
    if (f.stills.length > STILL_SHOW) add('still', 'warn', `還有 ${f.stills.length - STILL_SHOW} 段畫面沒動（${f.stills.slice(STILL_SHOW).map((s) => fmtT(s.from)).join('、')}）→ 同上，--json 的 stills 有全部`);
  }
  if (Array.isArray(f.covered)) {
    if (!f.covered.length) add('covered', 'ok', '沒有字還沒出現就被下一段蓋住');
    for (const c of f.covered) add('covered', 'warn', `${c.msg}；要看這段：${peek(c.from, c.to)}`);
  }

  const errors = checks.filter((c) => c.level === 'error').length, warnings = checks.filter((c) => c.level === 'warn').length;
  return { checks, errors, warnings, ok: errors === 0 };
}

// final 只出文字的靜止區間：只看錄影、圖片段（畫面 ≥ 8 秒沒動，多半是素材沒對上講解）。講者畫面上有人在動，門檻附近不穩、15 分鐘片會報 7 段雜訊，凍結另外有 ≥ 3 秒的檢查；
// 字卡、模板本來就不做微動。扣掉沒有聲音的區間（silencedetect），剩下還 ≥ 8 秒、而且有字幕時超過一半時間有字幕（結尾配樂、片頭不算「在講」）才報 → [{ from, to, id, cue }]（完成影片秒數）
export const STILL_SHOW = 12;
export function stillIssues(runs, { items = [], cuts = [], cues = [], silences = [], segs = [], minDur = OBS.still } = {}) {
  const media = (items || []).filter((it) => (it.type === 'media' || it.key === 'media') && it.start != null && it.end != null).map((it) => [roughToFinal(it.start, cuts), roughToFinal(it.shownEnd ?? it.end, cuts)]);
  const out = [];
  for (const run of runs || []) for (const [ma, mb] of media) for (const [a, b] of subtractRanges([Math.max(run[0], ma), Math.min(run[1], mb)], silences || [])) {
    if (b - a < minDur - 1e-6) continue;
    if (cues.length) {
      const spoken = cues.reduce((sum, c) => sum + Math.max(0, Math.min(b, c.end) - Math.max(a, c.start)), 0);
      if (spoken < (b - a) * 0.5) continue;
    }
    const L = cellLabel(a, segs, cues);
    out.push({ from: a, to: b, id: L.id === '—' ? null : L.id, cue: L.n != null ? `#${L.n} ${L.text}` : null });
  }
  return out;
}

// ---------- 字幕（F8：照作者剪映量的樣式，dev/loop/feedback-r1-user.md「F8」）----------

// 底板（.cg > span 的黑底）y 956–1074、字高 71：剪映 size 7、y −0.88、黑底 0.7、思源黑體 Regular 76px
export const CAPTION = { top: 956, bottom: 1074, tol: 4, ink: 71, inkTol: 3, samples: 5, minChars: 4, minDur: 0.6, white: 150 };
const fmtNs = (list, k = 6) => list.slice(0, k).map((c) => `#${c.n}`).join('、') + (list.length > k ? '…' : '');

// 量哪幾則：只有中文（英數字高不一樣）、≥ 4 字、≥ 0.6 秒，平均分散取 n 則（多給備用：前面的看不到字幕就用後面的）
export function captionSamples(cues, n = CAPTION.samples) {
  const ok = (cues || []).filter((c) => { const t = String(c.text).replace(/\s+/g, ''); return t.length >= CAPTION.minChars && !/[A-Za-z0-9]/.test(t) && c.end - c.start >= CAPTION.minDur; });
  if (ok.length <= n * 2) return ok.map((c) => ({ n: c.n, text: c.text, at: r3((c.start + c.end) / 2) }));
  const pick = Array.from({ length: n * 2 }, (_, k) => ok[Math.round((k * (ok.length - 1)) / (n * 2 - 1))]);
  return [...new Set(pick)].map((c) => ({ n: c.n, text: c.text, at: r3((c.start + c.end) / 2) }));
}

// 完成影片一格（rgb24 1920×W）在底板裡的白字：min(r,g,b) ≥ 150 的像素一列 ≥ 2 個＝有字（底板把畫面壓到 ≤ 30%，畫面再白也到不了 150）
export function inkRows(rgb, W, H, plate, white = CAPTION.white) {
  const y0 = Math.max(0, Math.round(plate.top)), y1 = Math.min(H, Math.round(plate.bottom));
  const x0 = Math.max(0, Math.round(plate.left)), x1 = Math.min(W, Math.round(plate.right));
  let top = null, bottom = null;
  for (let y = y0; y < y1; y++) {
    let n = 0;
    for (let x = x0; x < x1 && n < 2; x++) { const i = (y * W + x) * 3; if (Math.min(rgb[i], rgb[i + 1], rgb[i + 2]) >= white) n++; }
    if (n >= 2) { if (top == null) top = y; bottom = y; }
  }
  return top == null ? null : { top, bottom, height: bottom - top + 1 };
}

// 直式（FR-090）：底板位置照 canvas.caption.box（字級、字高和橫式同一套，決定 2）；橫式＝CAPTION
export function captionSpec(cv = null) {
  if (cv?.format !== 'portrait') return CAPTION;
  return { ...CAPTION, top: cv.caption.box[1], bottom: cv.caption.box[3], ink: cv.caption.line };
}

// 量到的 [{ n, text, top, bottom, ink }] → ✔／⚠；error＝量不到的原因；C＝captionSpec(canvas)
export function captionStyleChecks(m, C = CAPTION) {
  if (m.error) return [{ level: 'warn', text: `量不到字幕樣式：${m.error}` }];
  const s = m.samples || [];
  if (!s.length) return [{ level: 'warn', text: '量不到字幕樣式：抽的字幕時間點畫面上都沒有字幕 → 看 qc-sheet.jpg 字幕有沒有出現' }];
  const bad = s.filter((x) => Math.abs(x.top - C.top) > C.tol || Math.abs(x.bottom - C.bottom) > C.tol || x.ink == null || Math.abs(x.ink - C.ink) > C.inkTol);
  if (!bad.length) return [{ level: 'ok', text: `字幕樣式照剪映（F8）：底板 y ${C.top}–${C.bottom}、字高 ${C.ink}（量 ${s.length} 則：${fmtNs(s)}）` }];
  const x = bad[0];
  return [{ level: 'warn', text: `字幕樣式和剪映（F8）不同：${fmtNs(bad)} 共 ${bad.length}／${s.length} 則；#${x.n}「${String(x.text).slice(0, 12)}」底板 y ${Math.round(x.top)}–${Math.round(x.bottom)}、字高 ${x.ink ?? '量不到'}（要 y ${C.top}–${C.bottom} ± ${C.tol}、字高 ${C.ink} ± ${C.inkTol}）→ 完成影片是 kit/captions.css 改版前 render 的就重新 build、render；重 render 還是這樣，回報維護者（shared/ 不要自己改）` }];
}

// 字幕文字（F8 第 4 點）：含「，」「。」→ ⚠；一則不到 0.6 秒 → ⚠（剪映最短 0.73 秒）
export function captionTextChecks(cues) {
  const out = [], punct = cues.filter((c) => /[，。]/.test(c.text)), short = cues.filter((c) => c.end - c.start < CAPTION.minDur - 1e-6);
  if (punct.length) out.push({ level: 'warn', text: `字幕 ${fmtNs(punct)} 共 ${punct.length} 則含句中標點「，」「。」，照 F8 不顯示 → 跑 srt-align 或在剪輯台改` });
  if (short.length) out.push({ level: 'warn', text: `字幕 ${fmtNs(short)} 共 ${short.length} 則不到 ${CAPTION.minDur} 秒（#${short[0].n} ${r2(short[0].end - short[0].start)} 秒）→ 在剪輯台併到相鄰那則或拉長` });
  if (!out.length) out.push({ level: 'ok', text: `字幕 ${cues.length} 則：沒有「，」「。」、每則 ≥ ${CAPTION.minDur} 秒` });
  return out;
}

// 頁面裡：現在看得到的那則字幕（.cg 沒被藏、不透明）的底板（span 的黑底）位置
function captionInPage() {
  for (const cg of document.querySelectorAll('.cg')) {
    const cs = getComputedStyle(cg);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) continue;
    const sp = cg.querySelector('span');
    const r = sp && sp.getBoundingClientRect();
    if (!r || r.height < 1) continue;
    return { id: cg.id, text: sp.textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }
  return null;
}

// 底板位置從 build 好的頁面量（HyperFrames runtime＋同一個 seek），字高從完成影片那一格的白字量
export async function measureCaptions(P, flags, file, cues, cv = null, session = null) {
  if (!cues?.length) return null;
  const W = cv?.W ?? 1920, H = cv?.H ?? 1080;
  if (!fs.existsSync(path.join(P.out, 'index.html'))) return { error: `還沒 build（找不到 work/hyperframes/index.html）→ 先跑 build.mjs 再重跑 qc final` };
  let S = session;
  try { S ||= await openSession({ dir: P.out, chrome: findChrome({ chrome: flags.chrome }), runtime: findRuntime({}).file, W, H }); } catch (e) { return { error: `開不了 HyperFrames 的 Chrome（${tail(e.message, 160)}）→ 跑 npx hyperframes browser ensure 後重跑` }; }
  const samples = [];
  try {
    for (const c of captionSamples(cues)) {
      if (samples.length >= CAPTION.samples) break;
      await S.seek(c.at);
      const box = await S.evaluate(`(${captionInPage.toString()})()`);
      if (!box) continue;
      let ink = null;
      try { ink = inkRows(rawFrame(file, { at: c.at, width: W, height: H }), W, H, box); } catch { /* 抽不到格就當量不到字高 */ }
      samples.push({ n: c.n, text: box.text, at: c.at, top: Math.round(box.top * 10) / 10, bottom: Math.round(box.bottom * 10) / 10, ink: ink?.height ?? null });
    }
  } finally { if (!session) await S.close(); }
  return { samples };
}

// plan.json 第一層的 theme（design-system §10）：只有 "dark" 是暗色，其他（沒寫、寫錯）是亮色
export function themeOf(P) {
  try { return JSON.parse(fs.readFileSync(P.plan, 'utf8')).theme === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

// ---------- final ----------

function expectedFromBuild(P, flags) {
  const { json: j, error } = checkJsonOf(P, flags);
  if (!j) return { error: `build --check --json 沒有輸出 JSON：${error}` };
  const black = { voiceOnly: j.voiceOnly || [], roughBlack: j.roughBlack || [] };
  if (!j.ok) return { error: `build --check 有 ✖：${(j.errors || []).slice(0, 2).join('；')}`, items: j.items || [], cuts: j.edit?.cuts || [], ...black };
  return { expected: j.outputDur, items: j.items || [], cuts: j.edit?.cuts || [], ...black };
}

// 凍結與黑畫面用每秒 10 格、一半解析度量（門檻是 3 秒、0.5 秒，不用 30 格全解析；實測 15 分鐘片快 5 倍以上，凍結的起點與全解析相同或差 < 0.1 秒）
const DETECT_VF = 'fps=10,scale=trunc(iw/4)*2:trunc(ih/4)*2:flags=area';

// 一次解碼算完：凍結、黑畫面、靜止區間的灰階（observe 同一套 96×54、每 0.5 秒）、總覽圖的格子、響度、無聲。
// 灰階與格子寫暫存檔（Windows 沒有 pipe:3），長片也只解碼一次。sheet＝qcSheetLayout 的結果；gray＝[寬, 高]。
// fps 用 round=up：第 k 格就是第 k×間隔秒那一格，和 -ss 抽到的一樣（round=down 會晚將近一格，間隔 15 秒就差 15 秒）
export function analyzeFinal(file, dur, hasAudio, { sheet = null, gray = OBS.gray } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-qc-'));
  try {
    const [gw, gh] = gray, gFile = path.join(tmp, 'gray.raw'), sFile = path.join(tmp, 'sheet.raw');
    const legs = sheet ? 3 : 2;
    const graph = [`[0:v]split=${legs}[d][g]${sheet ? '[s]' : ''}`,
      `[d]${DETECT_VF},freezedetect=n=-60dB:d=${LIMITS.freeze},blackdetect=d=${LIMITS.black}:pix_th=0.1:pic_th=0.98,nullsink`,
      `[g]fps=${1 / OBS.step}:round=up,scale=${gw}:${gh},format=gray[gray]`,
      ...(sheet ? [`[s]fps=1/${sheet.step}:round=up,scale=${sheet.cw}:${sheet.ch}:flags=bicubic,format=rgb24[tiles]`] : [])].join(';');
    const args = ['-y', '-hide_banner', '-nostats', '-i', file, '-filter_complex', graph, '-map', '[gray]', '-f', 'rawvideo', gFile];
    if (sheet) args.push('-map', '[tiles]', '-f', 'rawvideo', sFile);
    if (hasAudio) args.push('-map', '0:a:0', '-af', `ebur128=peak=true:framelog=quiet,silencedetect=n=-50dB:d=${LIMITS.silence}`, '-f', 'null', '-');
    const r = run('ffmpeg', args);
    if (r.status !== 0) throw new Error(`ffmpeg 分析失敗：${tail(r.stderr)} → 重跑一次；還是失敗就把這行回報`);
    const err = String(r.stderr);
    const gb = fs.readFileSync(gFile), grays = [];
    for (let o = 0; o + gw * gh <= gb.length; o += gw * gh) grays.push(gb.subarray(o, o + gw * gh));
    const frames = new Map();
    if (sheet) {
      const sb = fs.readFileSync(sFile), n = sheet.cw * sheet.ch * 3;
      sheet.times.forEach((t, k) => { if ((k + 1) * n <= sb.length && Math.abs(t - k * sheet.step) < 1e-6) frames.set(t, sb.subarray(k * n, (k + 1) * n)); });
    }
    return { freezes: parseFreeze(err, dur), blacks: parseBlack(err), silences: hasAudio ? parseSilence(err, dur) : [], loud: hasAudio ? parseLoudness(err) : null,
      statics: staticRuns(grays).map(([a, b]) => [a, Math.min(b, r3(dur))]), frames };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// 每 10 秒一格（加最後一格），拼成一張，每格標時間；長片（> 80 格）拉長間隔到整片都有（以前 13 分鐘之後就沒格子了），間隔取 5 秒的倍數
export const sheetStepOf = (dur) => (dur / LIMITS.sheetStep <= LIMITS.sheetMax ? LIMITS.sheetStep : Math.ceil(dur / LIMITS.sheetMax / 5) * 5);
export function sheetTimes(dur, step = sheetStepOf(dur)) {
  const ts = [];
  for (let t = 0; t < dur - 0.05; t += step) ts.push(r3(t));
  const last = r3(Math.max(0, dur - 0.3));
  if (!ts.length) ts.push(0);
  if (last - ts[ts.length - 1] > 3) ts.push(last);
  return ts;
}

// 總覽圖的版面：> 40 格改一列 8 格（直式 12 格）、每格小一半，長片的圖才不會太長，看圖工具縮小後還看得出來
export function qcSheetLayout(dur, cv = null) {
  const step = sheetStepOf(dur), times = sheetTimes(dur, step), portrait = cv?.format === 'portrait', many = times.length > 40;
  const [cw, ch, cols] = portrait ? (many ? [135, 240, 12] : [270, 480, 6]) : many ? [240, 135, 8] : [480, 270, 4];
  return { step, times, cw, ch, cols, portrait };
}

// 直式（FR-090）：每格 9:16（270×480，一列 6 格），格上疊 canvas.unsafe[]（平台介面區）的紅色半透明框，看字幕、卡片字有沒有進去
export function makeQcSheet(file, dur, outFile, theme = 'light', cv = null, { layout = null, frames = null } = {}) {
  const { step, times: ts, cw, ch, cols, portrait } = layout || qcSheetLayout(dur, cv);
  const gap = 10, bar = 30, head = 44, rows = Math.ceil(ts.length / cols);
  const c = canvas(cols * cw + (cols + 1) * gap, head + rows * (ch + bar) + (rows + 1) * gap, [11, 16, 32]);
  // 最上面標主題（plan.json 的 theme）：亮色、暗色兩版並排比對時分得出來
  fillRect(c, 0, 0, c.w, head, theme === 'dark' ? [12, 14, 18] : [243, 239, 234]);
  text(c, `theme: ${theme}${portrait ? '  9:16' : ''}`, gap + 4, 8, 4, theme === 'dark' ? [255, 212, 0] : [20, 20, 20]);
  ts.forEach((t, k) => {
    const x = gap + (k % cols) * (cw + gap), y = head + gap + Math.floor(k / cols) * (ch + bar + gap);
    let data = frames?.get(t) ?? null;   // final 一次解碼抽好的格子；沒有的（最後一格）才另外抽
    try { data ||= rawFrame(file, { at: t, width: cw, height: ch }); } catch { data = Buffer.alloc(cw * ch * 3); }
    blit(c, { w: cw, h: ch, data }, x, y + bar);
    if (portrait) {
      const k = cw / cv.W;
      for (const [x0, y0, x1, y1] of cv.unsafe) {
        const b = [x + Math.round(x0 * k), y + bar + Math.round(y0 * k), x + Math.round(x1 * k), y + bar + Math.round(y1 * k)];
        fillRect(c, b[0], b[1], b[2] - b[0], b[3] - b[1], [255, 40, 40], 0.3);
        rectOutline(c, b, [255, 60, 60], 2);
      }
    }
    fillRect(c, x, y, cw, bar, [30, 39, 64]);
    text(c, fmtT(t), x + 8, y + 5, 3, [255, 212, 0]);
  });
  writeJpg(c, outFile, 3);
  return { file: outFile, count: ts.length, times: ts, step, theme, ...(portrait ? { unsafe: cv.unsafe.length } : {}) };
}

export async function finalCheck(P, flags) {
  const file = flags.file ? path.resolve(flags.file) : path.join(P.project, 'output', 'final.mp4');
  if (!fs.existsSync(file)) throw new Error(`找不到完成影片 ${rel(file)} → 先 render（USAGE.md 2.7），或用 --file 指定 mp4`);
  const info = probeMedia(file);
  if (!info.hasVideo) throw new Error(`${rel(file)} 沒有影像 → 檔案壞了或不是影片`);
  const dur = info.duration;
  const fmt = formatOf(P, flags), cv = fmt.canvas, portrait = cv.format === 'portrait';
  const exp = expectedFromBuild(P, flags);
  const layout = qcSheetLayout(dur, cv);
  const det = analyzeFinal(file, dur, info.hasAudio, { sheet: layout, gray: obsLayout(cv).gray });
  // 子母畫面段沒有講者小視窗（F2）：專案沒有只有聲音的素材時才判（有的話，全黑本來就是旁白區間）
  const pipMiss = exp.voiceOnly && !hasVoiceSource(P.project)
    ? pipMissing({ items: exp.items, scenes: planScenes(P), voiceOnly: exp.voiceOnly, roughBlack: exp.roughBlack, cuts: exp.cuts, project: `projects/${path.basename(P.project)}`, portrait }) : null;
  // 字幕（F8）：rough.srt 換成完成影片秒數；量樣式要 build 好的頁面與 Chrome
  const cues = P.srt && fs.existsSync(P.srt) ? cuesToOut(parseSrt(fs.readFileSync(P.srt, 'utf8')), exp.cuts || []) : [];
  // 靜止區間（只有聲音還在講才報）與「字還沒出現就被蓋住」：從 observe、storyboard 併過來，只出文字
  const segs = (exp.items || []).length ? outOf(exp.items, exp.cuts || []).list : [];
  const stills = stillIssues(det.statics, { items: exp.items || [], cuts: exp.cuts || [], cues, silences: det.silences, segs });
  // 量字幕樣式、讀動畫時間軸共用一個頁面
  let S = null, covered = null;
  if (cues.length || segs.length) { try { if (fs.existsSync(path.join(P.out, 'index.html'))) S = await openSession({ dir: P.out, chrome: findChrome({ chrome: flags.chrome }), runtime: findRuntime({}).file, W: cv.W, H: cv.H }); } catch { S = null; } }
  let captionStyle = null;
  try {
    captionStyle = await measureCaptions(P, flags, file, cues, cv, S);
    if (S && segs.length) {
      const warn = [], motion = await shotMotion(P, segs, flags, S);
      covered = shotPlan(segs, exp.expected ?? Infinity, motion, fxLabels(P, exp.items, motion, warn)).covers.map((c) => ({ id: c.id, by: c.by, msg: c.msg, from: c.from, to: c.to }));
    }
  } finally { if (S) await S.close(); }
  const theme = themeOf(P);
  const { statics, frames, ...measured } = det;
  const facts = { width: info.width, height: info.height, fps: info.fps, vfr: info.vfr, hasAudio: info.hasAudio, dur, expected: exp.expected ?? null, items: exp.items || [], cuts: exp.cuts || [], pipMissing: pipMiss, cues, captionStyle, theme, canvas: cv, stills, covered, project: `projects/${path.basename(P.project)}`, fileArg: flags.file ? ` --file ${rel(file)} --offset 0` : '', ...measured };
  const verdict = judge(facts);
  if (exp.error) verdict.checks.splice(2, 0, { key: 'build', level: 'warn', text: `${exp.error} → 時間對不到段落、長度也沒有預期值，先修好專案再重跑 qc` }), verdict.warnings++;
  let sheet = null;
  try { sheet = makeQcSheet(file, dur, path.join(P.project, 'output', 'qc', 'qc-sheet.jpg'), theme, cv, { layout, frames }); } catch (e) {
    verdict.checks.push({ key: 'sheet', level: 'warn', text: `總覽圖產生失敗：${e.message}` }); verdict.warnings++;
  }
  return { file, fmt, facts, ...verdict, sheet };
}

const ICON = { ok: '✔', warn: '⚠', error: '✖' };

function printFinal(P, r) {
  if (r.fmt) console.log(r.fmt.line);
  console.log(`專案：${rel(P.project)}\n完成影片：${rel(r.file)}\n`);
  for (const c of r.checks) console.log(`${ICON[c.level]} ${c.text}`);
  if (r.sheet) console.log(`\n→ 總覽圖 ${rel(r.sheet.file)}（${r.sheet.count} 格，每 ${r.sheet.step} 秒一格，主題 ${r.sheet.theme}；打開掃一眼有沒有掉圖、卡住${r.sheet.unsafe ? '；直式每格 9:16，紅色半透明框是平台介面區（canvas unsafe），字幕、卡片字、角標不該進去' : ''}）`);
  console.log(`\n${r.errors ? `✖ ${r.errors} 項錯誤` : '✔ 沒有錯誤'}${r.warnings ? `、⚠ ${r.warnings} 項提醒` : ''}${r.errors ? ' → 先修好再交付' : r.warnings ? ' → 逐項確認是不是刻意的' : ' → 可以交付'}`);
}

// ---------- speaker ----------

// 抽一格，等比放進畫布 W×H（橫式 1920×1080、直式 1080×1920；不足補黑）；frame＝[x, y, w, h]（畫布座標）時再裁切放大回 W×H；lut＝講者調光的 .cube（接在 crop／scale 之後）
function frame1080(file, at, frame = null, lut = null, W = 1920, H = 1080) {
  const crop = frame ? `,crop=${frame[2]}:${frame[3]}:${frame[0]}:${frame[1]},scale=${W}:${H}:flags=lanczos` : '';
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black${crop}${lut ? `,${lut3dFilter(lut)}` : ''},format=rgb24`;
  const args = ['-v', 'error', '-ss', String(r3(at)), '-i', file, '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'];
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 28 });
  if (r.error) throw r.error.code === 'ENOENT' ? new Error('找不到 ffmpeg：先跑 npx hyperframes doctor') : r.error;
  if (r.status !== 0 || r.stdout.length !== W * H * 3) throw new Error(`抽不到第 ${r3(at)}s 的畫面：${tail(r.stderr?.toString())} → 確認影片能播放；檔案壞了就重新產生 work/rough.mp4`);
  return r.stdout;
}

// 抽格要跟完成影片一樣套講者 look（006 的 ensureLook，不 strict）：有 work/rough-look.mp4 就用它，沒有就退回 rough.mp4 並帶回 ⚠；
// plan.json 的 look 是 false、或用 --file 指定影片時不套
function lookFor(P, flags, src) {
  if (flags.file) return { src, lut: null, line: null, warns: [] };
  let plan = {};
  try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch { /* 還沒寫 plan.json：照 kit/look.json 的預設 */ }
  if (plan.look === false) return { src, lut: null, line: '畫面不套 look（plan.json 的 look 是 false）', warns: [] };
  const lk = ensureLook({ projectDir: P.project, plan, templateDir: P.templateDir, strict: false });
  const line = `畫面已套 look：底片 ${rel(lk.footage)}${lk.lut ? `＋講者調光 ${lk.key?.color ?? ''}` : '（不調光）'}（跟 build 一樣）`;
  return { src: lk.footage, lut: lk.lut, line, warns: lk.report.filter((x) => x.startsWith('⚠')) };
}

// 均勻抽 n 格；skip＝不抽的區間（只有聲音、全黑的地方：抽到黑畫面，動作範圍會變成整張）
export function speakerTimes(dur, n = 8, skip = []) {
  const keep = [];
  let t = 0;
  for (const [a, b] of [...skip].sort((x, y) => x[0] - y[0])) { if (a > t) keep.push([t, Math.min(a, dur)]); t = Math.max(t, b); }
  if (t < dur) keep.push([t, dur]);
  const L = keep.reduce((s, [a, b]) => s + Math.max(0, b - a), 0);
  if (!skip.length || L < 1) return Array.from({ length: n }, (_, i) => r3(Math.min(Math.max(0, dur - 0.1), (dur * (i + 0.5)) / n)));
  return Array.from({ length: n }, (_, i) => {
    let x = (L * (i + 0.5)) / n;
    for (const [a, b] of keep) { if (x <= b - a) return r3(Math.min(Math.max(0, b - 0.1), a + x)); x -= b - a; }
    return r3(dur - 0.1);
  });
}
// rough.mp4 全黑的區間（專案有只有聲音的素材時才算；和 build 共用快取）
function roughBlack(P, raw) {
  if (raw !== path.join(P.project, 'work', 'rough.mp4') || !hasVoiceSource(P.project)) return [];
  try { return blackDetect(raw, path.join(P.project, 'work', 'hyperframes', '.cache', 'blackdetect.json'), () => console.log('偵測 rough.mp4 只有聲音的區間（抽格要避開；第一次會花一點時間）…')); } catch { return []; }
}

const lum = (d, i) => (d[i] * 54 + d[i + 1] * 183 + d[i + 2] * 19) >> 8;

const MOTION_CORE = 0.1;
// 平均畫面＋動作範圍。回傳 { mean(rgb Buffer), dev(Uint8Array 每像素最大亮度偏差), bbox, core }
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
  // core：主要動作的範圍（每欄、每列的動作像素 ≥ 最多那一欄、那一列的 10%）；桌面反光、倒影、背景物只有零星像素，不會把框撐大。speaker 的建議框用它，framing 的切手勢判斷照舊用 bbox
  const span = (a, minN) => { let s = -1, e = -1; for (let i = 0; i < a.length; i++) if (a[i] >= minN) { if (s < 0) s = i; e = i; } return [s, e]; };
  const [cx1, cx2] = span(cols, Math.max(minPx, Math.max(...cols) * MOTION_CORE)), [cy1, cy2] = span(rows, Math.max(minPx, Math.max(...rows) * MOTION_CORE));
  const core = cx1 < 0 || cy1 < 0 ? null : [cx1, cy1, cx2, cy2];
  return { mean, dev, bbox: x1 < 0 || y1 < 0 ? null : [x1, y1, x2, y2], core };
}

export const padBox = (b, pad = 40, w = 1920, h = 1080) => [Math.max(0, b[0] - pad), Math.max(0, b[1] - pad), Math.min(w, b[2] + pad), Math.min(h, b[3] + pad)];

function rectOutline(c, [x1, y1, x2, y2], rgb, t = 4) {
  fillRect(c, x1, y1, x2 - x1, t, rgb); fillRect(c, x1, y2 - t, x2 - x1, t, rgb);
  fillRect(c, x1, y1, t, y2 - y1, rgb); fillRect(c, x2 - t, y1, t, y2 - y1, rgb);
}

export function speakerMaps(P, flags) {
  const raw = flags.file ? path.resolve(flags.file) : path.join(P.project, 'work', 'rough.mp4');
  if (!fs.existsSync(raw)) throw new Error(`找不到 ${rel(raw)} → 先完成「剪乾淨」產生 work/rough.mp4，或用 --file 指定影片`);
  const look = lookFor(P, flags, raw), src = look.src;
  const info = probeMedia(src);
  if (!info.hasVideo || !info.duration) throw new Error(`${rel(src)} 讀不到影像或長度 → 檔案壞了或不是影片，重新產生 work/rough.mp4 或用 --file 換一支`);
  const ts = speakerTimes(info.duration, 8, roughBlack(P, raw));
  const frame = planFrame(P);
  // 畫布尺寸照版式（FR-092）：直式 1080×1920，圖上的數字直接是 speakerBox 座標
  const fmt = formatOf(P, flags), { W, H } = fmt.canvas, portrait = fmt.format === 'portrait';
  const frames = ts.map((t) => frame1080(src, t, frame, look.lut, W, H));

  // 疊影圖：平均畫面；動作範圍上橘色，青色框是動作範圍外擴 40px 的建議框
  const { mean, dev, bbox, core } = motionStats(frames, W, H);
  const c = { w: W, h: H, data: Buffer.from(mean) };
  for (let p = 0; p < W * H; p++) {
    const a = Math.min(0.5, Math.max(0, (dev[p] - 25) / 100));
    if (a > 0) for (let k = 0; k < 3; k++) c.data[p * 3 + k] = Math.round(c.data[p * 3 + k] * (1 - a) + [255, 140, 0][k] * a);
  }
  const suggest = core ? padBox(core, 40, W, H) : null;
  if (suggest) rectOutline(c, suggest, [0, 229, 255], 3);
  drawGrid(c);
  const mapFile = path.join(P.project, 'work', '場地照-動作範圍.jpg');
  writeJpg(c, mapFile, 2);

  // 8 格總表：橫式 2 欄 × 4 列；直式 4 欄 × 2 列（每格 9:16）
  const [cw, ch, cols, rows] = portrait ? [360, 640, 4, 2] : [720, 405, 2, 4];
  const gap = 10, bar = 30;
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
  return { src, srcSize: [info.width, info.height], times: ts, mapFile, sheetFile, bbox: core, suggest, frame, look, scaled: info.width !== W || info.height !== H, fmt, W, H };
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

// 每個放大倍率的 16:9 裁切框：寬取 16 的倍數；講者水平置中；頭頂上方留 head px（完成影片座標）；夾在內容範圍裡
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

// 直式（FR-091）：每個倍率的 9:16 裁切框（寬取 18 的倍數，寬高都是偶數）；1.0＝原畫面（有黑邊時是內容範圍裡最大的 9:16）；
// 講者水平置中；垂直讓頭頂落在 canvas.framing.headTop（盡量放中間，但下巴要 ≤ chinMax），夾在內容範圍裡。
// chin＝下巴在畫布上的 y（006 的 face-landmarks.json；沒有就用動作範圍上緣＋框高 30% 估）。face＝頭頂／下巴不合的說明
export function framingCandidatesV(motion, content, zooms = [1, 1.15, 1.3], cv = canvasOf('portrait'), chin = null) {
  const { W } = cv, [hMin, hMax] = cv.framing.headTop, chinMax = cv.framing.chinMax;
  const [bx1, by1, bx2, by2] = motion, cx = (bx1 + bx2) / 2;
  const chinY = chin ?? by1 + 0.3 * (by2 - by1);
  const cw = content[2] - content[0], ch = content[3] - content[1];
  const maxW = Math.floor(Math.min(cw, (ch * 9) / 16) / 18) * 18;
  const clamp = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), hi));
  return zooms.map((z) => {
    const w = Math.max(18, Math.round(maxW / z / 18) * 18), h = (w * 16) / 9, k = W / w;
    const want = Math.max(hMin, Math.min((hMin + hMax) / 2, chinMax - (chinY - by1) * k));
    const x = clamp(cx - w / 2, content[0], content[2] - w), y = clamp(by1 - want / k, content[1], content[3] - h);
    const tf = (b) => [Math.round((b[0] - x) * k), Math.round((b[1] - y) * k), Math.round((b[2] - x) * k), Math.round((b[3] - y) * k)];
    const m = tf(motion), head = Math.round((by1 - y) * k), chinOut = Math.round((chinY - y) * k);
    const cut = [m[0] < 40 && '左', m[1] < 40 && '上', m[2] > W - 40 && '右'].filter(Boolean);
    const face = [];
    if (head < hMin || head > hMax) face.push(`頭頂在 y ${head}（要 ${hMin}–${hMax}）`);
    if (chinOut > chinMax) face.push(`下巴到 y ${chinOut}（要 ≤ ${chinMax}）`);
    return { zoom: +r2(k), frame: [x, y, w, h], motion: m, cut, head, chin: chinOut, face };
  });
}

// 下巴（mediapipe landmark 152）在畫布上的 y：work/face-landmarks.json 是 rough.mp4 的像素，照等比放進畫布換算；取各格的 90 百分位（低頭時最低的那幾格）。
// 沒有檔、沒偵測到臉（臉太小時 006 不存逐格點）→ null，改用動作範圍估
export function chinFromLandmarks(P, W, H) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(P.project, 'work', 'face-landmarks.json'), 'utf8'));
    const k = (j.points || []).indexOf(152), sw = j.source?.width, sh = j.source?.height;
    if (k < 0 || !sw || !sh) return null;
    const ys = (j.frames || []).filter((f) => Array.isArray(f?.p)).map((f) => f.p[2 * k + 1]).filter(Number.isFinite).sort((a, b) => a - b);
    if (!ys.length) return null;
    const sc = Math.min(W / sw, H / sh);
    return Math.round((H - sh * sc) / 2 + ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.9))] * sc);
  } catch { return null; }
}

// 構圖分析（qc framing 與剪輯台的構圖台共用）：量講者動作範圍、偵測黑邊、算每個倍率的裁切框與建議；不寫檔
export function framingAnalysis(P, flags = {}) {
  const raw = flags.file ? path.resolve(flags.file) : path.join(P.project, 'work', 'rough.mp4');
  if (!fs.existsSync(raw)) throw new Error(`找不到 ${rel(raw)} → 先完成「剪乾淨」產生 work/rough.mp4，或用 --file 指定影片`);
  const look = lookFor(P, flags, raw), src = look.src;
  const info = probeMedia(src);
  if (!info.hasVideo || !info.duration) throw new Error(`${rel(src)} 讀不到影像或長度 → 檔案壞了或不是影片，重新產生 work/rough.mp4 或用 --file 換一支`);
  const ts = speakerTimes(info.duration, 8, roughBlack(P, raw));
  const fmt = formatOf(P, flags), cv = fmt.canvas, portrait = fmt.format === 'portrait', { W, H } = cv;
  const frames = ts.map((t) => frame1080(src, t, null, look.lut, W, H));
  const { mean, bbox } = motionStats(frames, W, H);
  if (!bbox) throw new Error(`8 格之間幾乎沒有動作，量不到講者範圍 → 跑 node shared/template/tools/qc.mjs speaker --project projects/${path.basename(P.project)}，看 work/場地照-8格.jpg 手動決定 frame`);
  const content = contentBox(mean, W, H);
  // 動作範圍的下緣常包到桌面倒影：只取到內容範圍的 90%，頭頂與左右照量到的
  const motion = [bbox[0], bbox[1], bbox[2], Math.min(bbox[3], content[1] + (content[3] - content[1]) * 0.9)];
  const zooms = (flags.zooms ? String(flags.zooms).split(',').map(Number) : [1, 1.15, 1.3]).filter((z) => z >= 1 && z <= 2);
  const zl = zooms.length ? zooms : [1, 1.15, 1.3];
  const chin = portrait ? chinFromLandmarks(P, W, H) : null;
  const cands = portrait ? framingCandidatesV(motion, content, zl, cv, chin) : framingCandidates(motion, content, zl);
  for (const c of cands) c.upscale = +r2((c.zoom * W) / (info.width || W));   // 來源像素被放大幾倍（> 3 會明顯變軟）
  return { src, srcSize: [info.width, info.height], times: ts, motion, content, cands, suggestion: suggestZoom(cands), look, fmt, chin, chinFrom: chin == null ? null : 'face-landmarks', frames };
}

export function framingPreview(P, flags) {
  const r = framingAnalysis(P, flags), { cands, frames } = r, cv = r.fmt.canvas, portrait = r.fmt.format === 'portrait', { W, H } = cv;
  // 預覽圖：每個倍率一格（用中間那一格畫面，不用平均圖，比較看得清楚）；直式每格 9:16，青線＝頭頂範圍、洋紅線＝下巴上限
  const [pw, ph] = portrait ? [360, 640] : [640, 360], gap = 10, bar = 30;
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
    const s = pw / W, m = cd.motion.map((v) => Math.round(v * s));
    rectOutline(panel, [Math.max(0, m[0]), Math.max(0, m[1]), Math.min(pw, m[2]), Math.min(ph, m[3])], [255, 140, 0], 2);
    if (portrait) {
      for (const y of cv.framing.headTop) fillRect(panel, 0, Math.round(y * s) - 1, pw, 2, [0, 229, 255]);
      fillRect(panel, 0, Math.round(cv.framing.chinMax * s) - 1, pw, 2, [255, 64, 200]);
    }
    blit(c, panel, x0, gap + bar);
    fillRect(c, x0, gap, pw, bar, cd.cut.length || cd.face?.length ? [90, 20, 30] : [30, 39, 64]);
    text(c, `${cd.zoom.toFixed(2)}x  ${cd.frame.join(',')}`, x0 + 8, gap + 5, portrait ? 2 : 3, [255, 212, 0]);
  });
  const file = path.join(P.project, 'work', '構圖預覽.jpg');
  writeJpg(c, file, 2);
  const { frames: _, ...out } = r;
  return { ...out, file };
}

function printFraming(P, r) {
  const { W, H, framing } = r.fmt.canvas, portrait = r.fmt.format === 'portrait';
  console.log(r.fmt.line);
  console.log(`專案：${rel(P.project)}\n來源：${rel(r.src)}（${r.srcSize[0]}×${r.srcSize[1]}）`);
  if (r.look?.line) console.log(r.look.line);
  for (const w of r.look?.warns || []) console.log(w);
  console.log(`講者動作範圍 [${r.motion.join(', ')}]（下緣只算到內容範圍 90%，避開桌面倒影）`);
  const [x1, y1, x2, y2] = r.content;
  console.log(x1 || y1 || x2 < W || y2 < H ? `偵測到黑邊：內容範圍 [${r.content.join(', ')}]，裁切框都在這裡面` : '四周沒有黑邊');
  if (portrait) console.log(`直式構圖：頭頂要落在 y ${framing.headTop[0]}–${framing.headTop[1]}、下巴 ≤ ${framing.chinMax}（下巴${r.chinFrom ? '用 work/face-landmarks.json 量' : '沒有 face-landmarks.json，用動作範圍上緣＋框高 30% 估'}）`);
  console.log(`\n→ ${rel(r.file)}：每個倍率一格，橘框是講者動作範圍（裁切後）；紅底標題＝會切到手勢${portrait ? '或頭頂／下巴不在範圍；青線是頭頂範圍、洋紅線是下巴上限' : ''}\n`);
  console.log('倍率｜frame（寫進 plan.json）｜講者動作範圍（裁切後）｜備註｜建議');
  const sug = r.suggestion;
  for (const c of r.cands) {
    const notes = [];
    if (c.zoom === 1) notes.push('原樣，不裁切（不用寫 frame）');
    if (c.cut.length) notes.push(`⚠ 會切到${c.cut.join('、')}側手勢`);
    if (c.face?.length) notes.push(`⚠ ${c.face.join('、')}`);
    if (r.srcSize[0] < W) notes.push(`來源 ${r.srcSize[0]}px 寬，每個像素放大 ${c.upscale} 倍${c.upscale > 3.5 ? '，會明顯變軟' : ''}`);
    console.log(`${c.zoom.toFixed(2)}x｜[${c.frame.join(', ')}]｜[${c.motion.join(', ')}]｜${notes.join('；') || '—'}｜${Math.abs(c.zoom - sug.zoom) < 1e-6 ? '✔' : '—'}`);
  }
  const face = portrait ? '、頭頂／下巴不合' : '', faceOk = portrait ? '、頭頂／下巴在範圍內' : '';
  console.log(sug.none ? `建議：${sug.zoom.toFixed(2)}x（每個倍率都標了切到手勢${face}或放大超過 3.5 倍，選表上最小的；最後由使用者選）` : `建議：${sug.zoom.toFixed(2)}x（不切到手勢${faceOk}、來源像素放大 ≤ 3.5 倍的倍率裡最大的；最後由使用者選）`);
  console.log(`\n→ 下一步：開剪輯台，把它印的「構圖台」網址給使用者拖框（停點 ②，框一開始就是建議那一列）；使用者說「用建議的」就跑 qc.mjs framing --write，之後跑 qc.mjs speaker --write 量講者框`);
  console.log(`node shared/template/tools/editor.mjs --project ${rel(P.project)}`);
}

function printSpeaker(P, r) {
  console.log(r.fmt.line);
  console.log(`專案：${rel(P.project)}\n來源：${rel(r.src)}（${r.srcSize[0]}×${r.srcSize[1]}${r.scaled ? ` → 已等比放大成 ${r.W}×${r.H}，圖上座標可直接寫進 speakerBox` : ''}）`);
  if (r.look?.line) console.log(r.look.line);
  for (const w of r.look?.warns || []) console.log(w);
  if (r.frame) console.log(`構圖裁切：照 plan.json 的 frame [${r.frame.join(', ')}] 裁切放大後量（座標是完成影片上的座標）`);
  console.log(`抽格時間：${r.times.map(fmtT).join('、')}\n`);
  console.log(`→ ${rel(r.mapFile)}：疊影圖。橘色是動作掃過的地方，黃線每 100px 一條（粗線每 500px），數字是 ${r.W}×${r.H} 的座標`);
  console.log(`→ ${rel(r.sheetFile)}：8 格總表，看每個時間點講者的姿勢`);
  if (r.suggest) console.log(`\n偵測到的動作範圍 [${r.bbox.join(', ')}]，外擴 40px 的青色建議框 speakerBox ≈ [${r.suggest.join(', ')}]（只是參考，一定要自己看圖）`);
  else console.log('\n8 格之間幾乎沒有動作，沒辦法自動估範圍，請看 8 格總表手動框');
  console.log('\n閱讀方式：');
  console.log('  1. 先看 8 格總表，確認講者位置沒有跳來跳去（有的話取最大範圍）');
  console.log('  2. 再看疊影圖：橘色最遠的手勢邊緣讀出 x1、x2，頭頂讀 y1，桌面或身體下緣讀 y2，四邊各外擴 40px');
  console.log('  3. 寫成 speakerBox: [x1, y1, x2, y2]；和青色建議框差很多時，以你看圖讀的為準');
}

// qc.mjs speaker --write：把青色建議框寫進 plan.json；已經有 speakerBox 不覆寫（--force 才覆寫）。回傳 { wrote, box, reason }
export function writeSpeakerBox(P, suggest, { force = false } = {}) {
  if (!suggest) return { wrote: false, box: null, reason: 'none' };
  let plan = { version: 1 };
  if (fs.existsSync(P.plan)) {
    try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch (e) { throw new Error(`plan.json 不是合法的 JSON：${e.message} → 修好再跑`); }
  }
  if (plan.speakerBox && !force) return { wrote: false, box: plan.speakerBox, reason: 'exists' };
  plan.speakerBox = suggest;
  fs.mkdirSync(path.dirname(P.plan), { recursive: true });
  writeAtomic(P.plan, `${JSON.stringify(plan, null, 2)}\n`);
  return { wrote: true, box: suggest, reason: 'written' };
}

// 使用者說「用建議的」：把 ✔ 那一列寫進 plan.json 第一層（1.0 倍不寫，已有的 frame 拿掉）
export function writeFrame(P, r) {
  const c = r.cands.find((x) => Math.abs(x.zoom - r.suggestion.zoom) < 1e-6);
  let plan = { version: 1 };
  if (fs.existsSync(P.plan)) {
    try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch (e) { throw new Error(`plan.json 不是合法的 JSON：${e.message} → 修好再跑`); }
  }
  const frame = c && c.zoom > 1 ? c.frame : null;
  if (frame) plan.frame = frame; else delete plan.frame;
  fs.mkdirSync(path.dirname(P.plan), { recursive: true });
  writeAtomic(P.plan, `${JSON.stringify(plan, null, 2)}\n`);
  return { frame, zoom: c?.zoom ?? 1 };
}

function printSpeakerWrite(P, w) {
  console.log('');
  if (w.reason === 'none') { console.log('✖ 沒有寫 speakerBox：8 格之間幾乎沒有動作，估不出範圍 → 看 8 格總表手動框，寫進 plan.json 第一層'); return; }
  if (w.reason === 'exists') console.log(`plan.json 已經有 speakerBox ${JSON.stringify(w.box)}，沒有覆寫（要換成建議框加 --force）`);
  else console.log(`✔ speakerBox ${JSON.stringify(w.box)} 已寫進 ${rel(P.plan)}`);
  console.log('建議框已經含手勢範圍，不用開圖確認；之後 --review 的拼圖看到卡片擋到手勢或臉，才照 work/場地照-動作範圍.jpg 改 plan.json 的 speakerBox');
  console.log('→ 下一步：拿分鏡素材（字幕編號、章節、情境對照、plan.json 寫法）');
  console.log(`node shared/template/tools/build.mjs --project ${rel(P.project)} --scaffold`);
}

// ---------- build --check --json（storyboard／observe／final 共用）----------

// → { json } 或 { error, stderr }（error＝沒有輸出 JSON）
export function checkJsonOf(P, flags) {
  const args = [path.join(HERE, 'build.mjs'), '--project', P.project, '--check', '--json'];
  if (flags.template) args.push('--template', path.resolve(flags.template));
  if (flags.format) args.push('--format', String(flags.format));
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* 下面處理 */ }
  return j ? { json: j } : { error: tail(r.stderr, 200), stderr: r.stderr };
}

// items[].out（完成影片秒數，contracts/check-json.md §3.1）；002 還沒加的時候用 start／end＋cuts 推算（每段只有起迄）
export function outOf(items, cuts = []) {
  let fallback = false;
  const list = (items || []).map((it) => {
    if (it.out && Number.isFinite(it.out.start)) return { id: it.id, type: it.type, opaque: !!it.opaque, ...it.out, lists: it.out.lists || [], annotations: it.out.annotations || null };
    fallback = true;
    return { id: it.id, type: it.type, opaque: !!it.opaque, start: roughToFinal(it.start, cuts), end: roughToFinal(it.shownEnd ?? it.end, cuts), lists: [], annotations: null };
  });
  return { list, fallback };
}

// ---------- storyboard（分鏡截圖，cli-004 §2）----------

export const SHOT = { tail: 0.6, listGap: 0.1, listReady: 0.9, listWin: 0.3, settle: 0.1, join: 0.05, ann: 0.1, annUntil: 0.35, merge: 0.3, short: 0.7, startPad: 0.1, endPad: 0.05, drawer: 0.3 };
const ANN_ORDER = ['marks', 'callouts', 'spot', 'steps', 'arrows', 'lens'];

// 一段的動畫時間軸（完成影片秒數 [[起, 迄, 種類, 字]]）→ 連續在動的區塊 [{ s, e, enter }]
// 種類：'enter'（淡入、遮罩揭開、長出）｜'drawer'（抽屜抽出，也算進場）｜'focus'（焦點抬起）｜'refocus'（其他焦點變化：壓暗、回均衡、鏡頭）｜'exit'｜'change'；
// 微動（kit 標 role: 'micro' 的漂浮、虛線流動、背景慢拉）在頁面裡就濾掉了。相隔 ≤ 0.05 秒的併成一塊；比整段還長的（循環動畫）不算
const isEnter = (k) => k === 'enter' || k === 'drawer';
export function motionBlocks(tw, segLen = Infinity) {
  const list = (tw || []).filter(([a, b]) => b - a <= segLen + 0.5).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b, k] of list) {
    const last = out[out.length - 1];
    const rf = k === 'refocus' || k === 'focus';
    if (last && a <= last.e + SHOT.join) { last.e = Math.max(last.e, b); last.enter ||= isEnter(k); last.refocus &&= rf; } else out.push({ s: a, e: b, enter: isEnter(k), refocus: rf });
  }
  return out;
}

// 完成態：段尾前 0.6 秒；最後一塊動畫是退場（前面還有動畫、這塊裡沒有進場，也不是只有焦點變化：03 側邊欄推回、fx 收尾）→ 退場前 0.1 秒；
// 那一刻還在動 → 往前退到那塊動畫開始前 0.1 秒；整段都在動（循環動畫）→ 照段尾前 0.6 秒
export function doneAt(g, tw) {
  const target = g.end - SHOT.tail, base = `完成態（段尾前 ${SHOT.tail} 秒）`;
  if (!tw) return { at: target, why: base };
  const B = motionBlocks(tw, g.end - g.start), L = B[B.length - 1];
  const cap = L && B.length >= 2 && !L.enter && !L.refocus && L.s - SHOT.settle < target ? L.s - SHOT.settle : target;
  let t = cap, why = cap < target ? '完成態（退場前 0.1 秒）' : base;
  for (let k = 0; k < B.length; k++) {
    const b = B.find((x) => t > x.s + 1e-6 && t < x.e - 1e-6);
    if (!b) break;
    t = b.s - SHOT.settle; why = '完成態（動畫停住的最後一刻）';
  }
  if (t < g.start + SHOT.startPad) return { at: r3(cap), why: `${cap < target ? '退場前 0.1 秒' : `段尾前 ${SHOT.tail} 秒`}（整段都在動，沒有停住的畫面）` };
  return { at: r3(t), why };
}

// 時間軸上最後一個進場（opacity 由透明到不透明、或遮罩揭開）→ { end, text }；沒有時 null
export function lastEnter(tw, segLen = Infinity) {
  let best = null;
  for (const [a, b, k, text] of tw || []) if (isEnter(k) && b - a <= segLen + 0.5 && (!best || b > best.end)) best = { end: b, text: text || '' };
  return best;
}

// 動態 v2 的拍點（specs/010-motion-v2/design-system.md §12）：抽屜抽出完成後 0.3 秒；焦點抬起（P.spot 的 active）那一拍的動畫都跑完後 0.1 秒。
// 「那一拍的動畫」＝在拍點起點 −0.05～+0.3 秒之間開始的動畫（例：抽屜＋0.12 逐字彈出）；下一拍開始前 0.1 秒為止
export function beatShots(g, tw) {
  const list = (tw || []).filter(([a, b]) => b - a <= g.end - g.start + 0.5);
  const ready = (s) => Math.max(...list.filter(([x]) => x >= s - SHOT.join && x <= s + SHOT.listWin).map(([, y]) => y));
  const beats = list.filter(([, , k]) => k === 'drawer' || k === 'focus').sort((x, y) => x[0] - y[0]);
  return beats.map(([a, b, k, text], i) => {
    const r = ready(a), q = text ? `「${text}」` : '';
    let at = k === 'drawer' ? Math.max(b + SHOT.drawer, r) : r + SHOT.settle;
    const next = beats[i + 1];
    if (next && at > next[0] - SHOT.settle) at = Math.max(b, next[0] - SHOT.settle);
    return { at: r3(at), start: a, ready: r, why: k === 'drawer' ? `抽屜抽出後 ${SHOT.drawer} 秒${q ? `：${q}` : ''}` : `焦點抬起${q ? `：${q}` : ''}`, need: { end: r, label: q || (k === 'drawer' ? '抽屜' : '焦點') } };
  });
}

// 每段截哪幾張：一般段是完成態（doneAt）；條列逐條換的每組一張（進場動畫重疊的幾條併一組，在這組進場完成後截）；
// 錄影標註每個到位 +0.1 秒（相距 < 0.3 秒併成一張，取晚的）。motion＝Map(id → 時間軸)，沒有時用估的（條列進場 0.9 秒）
// only＝Set(段 id)：只排這幾段（段 id 不在裡面的照樣算「被蓋住」）。covers＝warnings 裡「被蓋住」的結構版（final 用）
export function shotPlan(segs, outputDur = Infinity, motion = null, labels = null, only = null) {
  const shots = [], warnings = [], covers = [];
  const end = Number.isFinite(outputDur) ? outputDur : Infinity;
  for (const g of segs) {
    if (only && !only.has(g.id)) continue;
    const lo = g.start + SHOT.startPad, hi = Math.min(end - SHOT.endPad, g.end);
    const fit = (t) => r3(Math.min(Math.max(t, lo), Math.max(lo, hi)));
    let list = [];
    if (g.end - g.start < SHOT.short) list = [{ at: (g.start + g.end) / 2, why: '段很短，截中點' }];
    else if (g.lists?.length) {
      // 每組的進場完成時刻：時間軸上 [第一條 − 0.05, 最後一條 + 0.3] 開始的動畫都跑完；沒有時間軸用最後一條 + 0.9 秒估
      const tw = motion?.get(g.id) || null;
      const readyOf = (a, b) => {
        const ends = (tw || []).filter(([x]) => x >= a - SHOT.join && x <= b + SHOT.listWin).map(([, y]) => y);
        return ends.length ? Math.max(...ends) : b + SHOT.listReady;
      };
      // 下一條在這組進場完成前就開始了 → 一起出現的，併成一組
      const L = [...g.lists].sort((a, b) => a - b), groups = [];
      L.forEach((t, k) => {
        const q = groups[groups.length - 1];
        if (q && t < q.ready - 1e-6) { q.last = t; q.b = k + 1; q.ready = readyOf(q.first, t); } else groups.push({ first: t, last: t, a: k + 1, b: k + 1, ready: readyOf(t, t) });
      });
      const done = doneAt(g, tw);
      list = groups.map((q, j) => {
        const at = Math.max(q.ready, j + 1 < groups.length ? Math.min(groups[j + 1].first - SHOT.listGap, done.at) : done.at);
        const why = q.a === q.b ? `第 ${q.a} 條` : `第 ${q.a}–${q.b} 條`;
        return { at, why, need: { end: q.ready, label: why } };
      });
    } else if (g.annotations && ANN_ORDER.some((k) => g.annotations[k]?.length)) {
      const ev = [];
      for (const k of ANN_ORDER) for (const a of g.annotations[k] || []) {
        const cap = (t) => Math.min(t, a.until != null ? a.until - SHOT.annUntil : Infinity, g.end - SHOT.endPad);
        const label = a.text != null ? `${k}[${a.i}]「${a.text}」到位` : `${k}[${a.i}] 到位`;
        ev.push({ at: cap(a.ready + SHOT.ann), why: label });
        for (const p of a.path || []) ev.push({ at: cap(p.ready + SHOT.ann), why: `${k}[${a.i}].path[${p.k}] 到位` });
      }
      ev.sort((a, b) => a.at - b.at);
      for (const x of ev) {
        const last = list[list.length - 1];
        if (last && x.at - last.at < SHOT.merge) { last.at = x.at; last.why = x.why; } else list.push({ ...x });
      }
    } else if (labels?.has(g.id)) list = [{ at: labels.get(g.id), why: '完成態（動畫的 done 標記）' }];
    else {
      // 完成態不早於最後一個進場完成（例：07 的 key 綁 #N@詞，在段尾附近才揭開）
      const tw = motion?.get(g.id) || null, d = doneAt(g, tw), le = lastEnter(tw, g.end - g.start);
      const need = le && { end: le.end, label: le.text ? `「${le.text}」` : '最後一個進場' };
      const done = le && le.end > d.at ? { at: le.end, why: '完成態（最後一個進場完成）', need } : { ...d, need };
      // v2 拍點（抽屜、焦點抬起）各一張；最後一拍之後畫面沒再變（沒有新的動畫開始）→ 完成態併進最後一拍，不重複截
      const beats = beatShots(g, tw), last = beats[beats.length - 1];
      const changed = last && (tw || []).some(([a, b]) => a > last.ready + 1e-6 && a < done.at - 1e-6 && b - a <= g.end - g.start + 0.5);
      list = beats.map(({ at, why, need: n }) => ({ at, why, need: n }));
      if (!last || (changed && done.at - last.at >= SHOT.merge)) list.push(done);
      else if (done.at > last.at + 1e-6 && !changed) list[list.length - 1].why += '（完成態）';
    }
    // 被下一段不透明的段（子母畫面、全幕）蓋住：截在蓋住前 0.1 秒；那時最後一個進場還沒完成 → ⚠（觀眾看不到那個字）
    const cov = segs.filter((x) => x !== g && x.opaque && x.start > g.start + SHOT.join && x.start < g.end - SHOT.join).sort((a, b) => a.start - b.start)[0];
    if (cov) for (const x of list) {
      if (x.at <= cov.start - SHOT.settle + 1e-6) continue;
      x.at = cov.start - SHOT.settle;
      const need = x.need?.end;
      if (need != null && need > x.at + 1e-6) {
        const what = x.need.label;
        const msg = `${g.id} 的${what}在 ${fmtT2(need)} 才完整出現，但 ${cov.id} 在 ${fmtT2(cov.start)} 就蓋住了，觀眾看不到 → ${g.id} 的那個拍點綁早一點的詞（#N@詞），或 ${cov.id} 的 from 延後到 ${fmtT2(need + SHOT.tail)} 之後`;
        warnings.push(msg);
        covers.push({ id: g.id, by: cov.id, msg, from: r3(cov.start), to: r3(need) });
        x.why = `被 ${cov.id} 蓋住前 0.1 秒（${what}還沒出現）`;
      } else x.why = `被 ${cov.id} 蓋住前 0.1 秒`;
    }
    list.forEach((x, k) => shots.push({ id: g.id, file: list.length === 1 ? `${g.id}.png` : `${g.id}-${k + 1}.png`, at: fit(x.at), why: x.why }));
  }
  return { shots, warnings, covers };
}

// 頁面裡：#el-<id> 這段的時間軸 → { start（data-start）, tw: [[起, 迄, 種類]]（段內秒數）}；子合成還沒掛上時 null
function tweensInPage(id) {
  const host = document.getElementById('el-' + id);
  if (!host) return null;
  const T = window.__timelines || {};
  const ids = [host.getAttribute('data-composition-id'), ...Array.from(host.querySelectorAll('[data-composition-id]')).map((e) => e.getAttribute('data-composition-id'))];
  const compId = ids.find((k) => k && T[k] && typeof T[k].getChildren === 'function');
  if (!compId) return null;
  const tl = T[compId], num = (v) => (typeof v === 'number' ? v : parseFloat(v)), r3 = (n) => Math.round(n * 1000) / 1000;
  const tw = [];
  for (const t of tl.getChildren(true, true, false)) {
    let s = t.startTime();
    for (let p = t.parent; p && p !== tl; p = p.parent) s += p.startTime();
    const d = t.totalDuration();
    if (!(d > 0.002)) continue;
    // kit 的 P.* 每個 tween 帶 data { sc, role, fn }（003）：微動（漂浮、虛線流動、背景慢拉、≥ 2s 的鏡頭慢推）不是拍點，不算
    const v = t.vars || {}, s0 = v.startAt || {}, o0 = num(s0.opacity), o1 = num(v.opacity), tag = v.data && typeof v.data === 'object' ? v.data : {};
    if (tag.role === 'micro') continue;
    let kind = Number.isFinite(o0) && Number.isFinite(o1) ? (o0 < 0.2 && o1 >= 0.2 ? 'enter' : o0 >= 0.2 && o1 < 0.2 ? 'exit' : 'change') : 'change';
    // 遮罩揭開／擦掉（maskUp、reveal、P.wipe 的外擴 inset(-20% …)）：有一邊從 100% 走開＝揭開，走到 100%＝擦掉
    const c0 = typeof s0.clipPath === 'string' ? s0.clipPath : '', c1 = typeof v.clipPath === 'string' ? v.clipPath : '';
    if (kind === 'change' && c0 && c1) kind = /100%/.test(c0) && !/100%/.test(c1) ? 'enter' : !/100%/.test(c0) && /100%/.test(c1) ? 'exit' : kind;
    const el0 = (t.targets() || []).find((x) => x && x.nodeType === 1);
    const el = el0 && el0.hasAttribute('data-sc-ch') ? el0.parentElement : el0;   // P.chars 逐字：字取整句
    if (tag.fn === 'slide') kind = 'drawer';
    else if (tag.fn === 'slideOut') kind = 'exit';
    else if (tag.fn === 'grow') kind = 'enter';
    else if (tag.fn === 'spot' && el && !el.hasAttribute('data-sc-spot') && num(v.scale) > 1.001 && num(v.scale) > (Number.isFinite(num(s0.scale)) ? num(s0.scale) : 1) + 0.001) kind = 'focus';   // active 放大＋抬起
    else if (tag.role === 'focus' && kind === 'change') kind = 'refocus';   // 壓暗、回均衡、鏡頭推拉：不是退場
    tw.push([r3(s), r3(s + d), kind, kind !== 'change' && kind !== 'exit' && el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16) : '']);
  }
  const done = tl.labels && Number.isFinite(tl.labels.done) ? r3(tl.labels.done) : null;
  return { start: parseFloat(host.getAttribute('data-start')), tw, done };
}

// fx 的完成時刻：catalog.json 的 done 是 "label" 的卡（例 27 打字機：tween 不在時間軸上）用時間軸的 'done' 標記，其他照時間軸分析
function fxLabels(P, items, motion, warnings) {
  if (!motion) return null;
  let fx = [];
  try { fx = JSON.parse(fs.readFileSync(path.join(P.templateDir, 'fx', 'catalog.json'), 'utf8')).effects || []; } catch { /* 讀不到就不用標記 */ }
  const byLabel = new Set(fx.filter((e) => e.done === 'label').map((e) => String(e.id).padStart(2, '0')));
  const fxOf = new Map((items || []).filter((it) => it.type === 'fx').map((it) => [it.id, String(it.key ?? '').padStart(2, '0')]));
  const labels = new Map([...motion.labels].filter(([id]) => byLabel.has(fxOf.get(id))));
  const lost = [...fxOf].filter(([id, k]) => byLabel.has(k) && !labels.has(id)).map(([id]) => id);
  if (lost.length) warnings.push(`${lost.join('、')} 的 fx 時間軸沒有 'done' 標記：完成態照段尾前 ${SHOT.tail} 秒截 → 截到動畫中途就回報 003`);
  return labels;
}

// 每段的動畫時間軸（完成影片秒數）：用 003 audit 的同一個瀏覽器工作階段（HyperFrames runtime＋同一個 seek）
// → Map(id → [[起, 迄, 種類]])；時間軸有 'done' 標記的另記在 .labels（Map(id → 完成影片秒)）
// 頁面 __renderReady 之後子合成都掛上了，直接讀、不用 seek（長片每段省一次 seek）；還沒 ready 才照舊 seek 到那段再讀。session＝共用的頁面（不關它）
export async function shotMotion(P, segs, flags = {}, session = null) {
  const S = session || await openSession({ dir: P.out, chrome: findChrome({ chrome: flags.chrome }), runtime: findRuntime({}).file });
  const out = new Map(), labels = new Map();
  out.labels = labels;
  const src = tweensInPage.toString();
  const read = (id) => S.evaluate(`(${src})(${JSON.stringify(id)})`);
  try {
    const ready = await S.evaluate('window.__renderReady === true');
    for (const g of segs) {
      let r = await read(g.id);
      if (!r && !ready) for (const t of [g.start + 0.01, (g.start + g.end) / 2]) {
        await S.seek(r3(t));
        r = await read(g.id);
        if (r) break;
      }
      if (r) {
        const o = Number.isFinite(r.start) ? r.start : g.start;
        out.set(g.id, r.tw.map(([a, b, k, t]) => [r3(o + a), r3(o + b), k, t]));
        if (r.done != null) labels.set(g.id, r3(o + r.done));
      }
    }
  } finally { if (!session) await S.close(); }
  return out;
}

const STALE_RE = /^\w+?(?:-\d+)?\.png$/;

// 這次用的 build --check：和 CLI 同一份結果，另外帶 res（每段自己的 ✖、還是範例原文的段）
function checkInProcess(P, flags) {
  try {
    const r = build({ project: P.project, template: flags.template ? path.resolve(flags.template) : undefined, format: flags.format, check: true, json: true }, { log: () => {} });
    return { json: r.json, res: r.res };
  } catch (e) { return { error: tail(e.message, 200) }; }
}

// 截圖：把時間切成連續的幾塊，一塊一個 hyperframes snapshot 行程（各自開 Chrome，影片抽格也快）。回傳 Map(秒 → PNG 路徑)
const SNAP = { dir: '.storyboard-shots', perJob: 10 };
async function snapshotMany(P, times, jobs, pj) {
  const tmp = path.join(P.out, SNAP.dir);
  fs.rmSync(tmp, { recursive: true, force: true });
  const sorted = [...times].sort((a, b) => a - b);
  const k = Math.max(1, Math.min(jobs, Math.ceil(sorted.length / SNAP.perJob)));
  const size = Math.ceil(sorted.length / k);
  const chunks = Array.from({ length: k }, (_, i) => sorted.slice(i * size, (i + 1) * size)).filter((c) => c.length);
  const once = async (chunk, i) => {
    const r = await spawnAsync(process.execPath, hfArgs(['snapshot', '--at', chunk.join(','), '--no-end', '--keep', '-o', path.join(SNAP.dir, `p${i}`), '--json']), { cwd: P.out });
    const text = String(r.stdout);
    let sj = null;
    try { sj = JSON.parse(text.slice(text.indexOf('{'))); } catch { /* 下面處理 */ }
    return r.status === 0 && sj?.frames ? sj.frames : { fail: tail(r.stderr || text, 400) };
  };
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });
  let got;
  try {
    got = await pool(chunks, k, async (chunk, i) => {
      let f = await once(chunk, i);
      if (f.fail && k > 1) f = await once(chunk, i);   // 同時開好幾個 Chrome、機器忙時偶爾會失敗：這一塊再跑一次
      if (f.fail) throw new Error(`npx hyperframes snapshot 失敗：${f.fail} → 先跑 cd ${pj}/work/hyperframes && npx hyperframes check 看 runtime 錯誤`);
      return f;
    });
  } catch (e) { cleanup(); throw e; }
  const frames = got.flat(), out = new Map();
  for (const t of sorted) {
    const f = frames.find((x) => Math.abs(Number(x.time) - t) < 0.0005);
    const png = f && path.resolve(P.out, f.path);
    if (png && fs.existsSync(png)) out.set(t, png);
  }
  return { paths: out, jobs: chunks.length, cleanup };
}

// 分鏡拼圖：work/storyboard-preview/sheet-NN.jpg，每頁 12 張（直式也是 12 張：一列 6 格 × 2 列），每格標「時間｜段 id｜為什麼」。
// --only 時只重做有動到的頁（頁面內容變了、或含這次重截的段）；張數變少時多的頁清掉
export const SHEET = { per: 12, re: /^sheet-\d+\.jpg$/ };
const sheetPages = (shots) => Array.from({ length: Math.ceil(shots.length / SHEET.per) }, (_, k) => {
  const list = shots.slice(k * SHEET.per, (k + 1) * SHEET.per);
  return { n: k + 1, file: `sheet-${nn(k + 1)}.jpg`, ids: [...new Set(list.map((x) => x.id))], shots: list.map((x) => x.file), from: list[0].at, to: list[list.length - 1].at };
});
async function storyboardSheets(P, flags, dir, all, { changed = null, prev = null, L }) {
  const pages = sheetPages(all);
  const before = new Map((prev?.sheets || []).map((x) => [x.file, x]));
  const todo = pages.filter((pg) => {
    if (!changed) return true;
    const old = before.get(pg.file);
    return !old || !fs.existsSync(path.join(dir, pg.file)) || old.shots.join() !== pg.shots.join() || pg.ids.some((id) => changed.has(id));
  });
  if (todo.length) {
    const B = await openBrowser({ chrome: findChrome({ chrome: flags.chrome }) });
    const fontsCss = pathToFileURL(path.join(P.templateDir, 'kit', 'fonts.css')).href, name = path.basename(P.project);
    const [tw, th] = L.beatTile;
    try {
      await pool(todo, JOBS.chrome, async (pg) => {
        const list = all.slice((pg.n - 1) * SHEET.per, pg.n * SHEET.per);
        const page = contactSheet({ fontsCss, title: `分鏡拼圖 ${nn(pg.n)}／${nn(pages.length)}｜${name}｜${pg.ids[0]}–${pg.ids[pg.ids.length - 1]}`, cols: L.beatCols, tile: [tw, th],
          cells: list.map((x) => ({ src: pathToFileURL(path.join(dir, x.file)).href, time: fmtT2(x.at), id: x.id, text: x.why })) });
        const hf = path.join(dir, `.sheet-${nn(pg.n)}.html`), jpg = path.join(dir, pg.file);
        fs.writeFileSync(hf, page.html);
        try { await B.shot({ file: hf, out: jpg, width: page.width, height: page.height, quality: 85 }); } catch (e) { throw new Error(`Chrome 排版失敗（${pg.file}）：${e.message} → 重跑一次；還是失敗就回報這行`); } finally { fs.rmSync(hf, { force: true }); }
      });
    } finally { await B.close(); }
  }
  const keep = new Set(pages.map((x) => x.file));
  for (const f of fs.readdirSync(dir)) if (SHEET.re.test(f) && !keep.has(f)) fs.rmSync(path.join(dir, f), { force: true });
  return { pages, redone: todo.map((x) => x.file) };
}

// 回傳：{ dir, shots: [{ id, file, at, why, md }]（這次截的）, allShots（整支；--only 時合併上次 shots.json 其他段的）, manifest（shots.json 路徑）, sheets（有 --sheet 才有）, skipped（還是範例原文、沒截的段 id）, warnings, stale, cleared, segs, fmt, only }
export async function storyboardRun(P, flags) {
  const pj = `projects/${path.basename(P.project)}`;
  const c = checkInProcess(P, flags);
  if (!c.json) throw new Error(`build --check --json 沒有輸出 JSON：${c.error} → 先單獨跑 node shared/template/tools/build.mjs --project ${pj} --check 看錯誤`);
  const j = c.json;
  const fmt = formatOf(P, flags), portrait = fmt.format === 'portrait';
  const only = flags.only ? String(flags.only).split(',').map((x) => x.trim()).filter(Boolean) : null;
  const jobs = jobsOf(flags.jobs);
  // 子母畫面段沒有講者小視窗（F2）：初剪壞了就先別截，截到的都是錯的（--check 的「只有聲音的區間沒有畫面」多半也是同一個原因，所以先報這個）
  if (!hasVoiceSource(P.project)) {
    const miss = pipMissing({ items: j.items, scenes: planScenes(P), voiceOnly: j.voiceOnly, roughBlack: j.roughBlack, cuts: j.edit?.cuts || [], project: pj, portrait });
    if (miss.length) throw new Error(miss.map((m) => m.msg).join('\n✖ '));
  }
  // --only：其他段的 ✖ 不擋（和 audit --only 一樣）
  const gate = gateCheck(c.res, only);
  if (gate.fatal.length) throw new Error(`plan.json 有 ${gate.fatal.length} 個 ✖（第一個：${gate.fatal[0] ?? '?'}）→ 照 build.mjs --check 的 → 修好，再跑 build、再截圖`);
  const index = path.join(P.out, 'index.html');
  if (!fs.existsSync(index)) throw new Error(`還沒 build：找不到 ${pj}/work/hyperframes/index.html → 先跑 node shared/template/tools/build.mjs --project ${pj}`);
  const warnings = [];
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(P.out, '.build-manifest.json'), 'utf8')); } catch { /* 沒有就用 mtime */ }
  if (j.planHash && manifest?.planHash) {
    if (j.planHash !== manifest.planHash) throw new Error(`plan.json 在上次 build 之後改過 → 先跑 node shared/template/tools/build.mjs --project ${pj}，再截圖`);
  } else if (fs.existsSync(P.plan) && fs.statSync(P.plan).mtimeMs > fs.statSync(index).mtimeMs + 1) {
    warnings.push('plan.json 比 index.html 新：改過 plan.json 還沒 build 的話，截圖會是舊版 → 先跑 build.mjs');
  }
  const { list, fallback } = outOf(j.items, j.edit?.cuts || []);
  if (fallback) warnings.unshift('--check --json 還沒有 items[].out：每段只截一張完成態，條列與錄影標註不分張 → 002 更新 build.mjs 後自動恢復');
  if (only) {
    const ids0 = list.map((g) => g.id), bad = only.filter((id) => !ids0.includes(id));
    if (bad.length) throw new Error(`--only 的 ${bad.join('、')} 不在 plan.json（或整段被 edit.cuts 剪掉了）→ 現有：${ids0.slice(0, 30).join('、')}${ids0.length > 30 ? `…共 ${ids0.length} 段` : ''}`);
  }
  // 範例原文（剛複製、還沒做）：截到的是範例，沒有意義 → 跳過；--only 指名的照截
  const skipped = (c.res?.items || []).filter((it) => it.sample && !(only && only.includes(it.id))).map((it) => it.id);
  const targets = list.filter((g) => (only ? only.includes(g.id) : !skipped.includes(g.id)));
  const targetIds = new Set(targets.map((g) => g.id));
  warnings.push(...smallMediaWarnings(targets));
  let motion = null;
  if (targets.length) {
    try { motion = await shotMotion(P, targets, flags); } catch (e) { warnings.push(`讀不到動畫時間軸（${tail(e.message, 200)}）：完成態用段尾前 ${SHOT.tail} 秒、條列用進場後 ${SHOT.listReady} 秒估 → 截圖停在動畫中途就重跑一次`); }
  }
  const labels = fxLabels(P, (j.items || []).filter((it) => targetIds.has(it.id)), motion, warnings);
  // 整支的段都傳進去：沒截的段照樣算「被蓋住」
  const plan = shotPlan(list, j.outputDur ?? Infinity, motion, labels, targetIds);
  warnings.push(...plan.warnings);
  const shots = plan.shots;
  const dir = path.join(P.project, 'work', 'storyboard-preview');
  let snapJobs = 0;
  if (shots.length) {
    const snap = await snapshotMany(P, [...new Set(shots.map((s) => s.at))], jobs, pj);
    snapJobs = snap.jobs;
    const missing = shots.filter((s) => !snap.paths.has(s.at));
    if (missing.length) { snap.cleanup(); throw new Error(`snapshot 少了 ${missing.length} 張（${missing.map((s) => fmtT(s.at)).join('、')}）→ 重跑一次；還是少就回報這幾個時間`); }
    fs.mkdirSync(dir, { recursive: true });
    for (const s of shots) fs.copyFileSync(snap.paths.get(s.at), path.join(dir, s.file));
    snap.cleanup();
  }
  const mine = new Set(shots.map((s) => s.file));
  // 舊截圖：同一段這次張數變了（s20.png ↔ s20-1.png…）或這段變回範例原文 → 這次的取代它，直接清掉；plan.json 已經沒有的段 → ⚠ 留給使用者決定。--only 只動指名的段
  const ids = new Set(list.map((g) => g.id)), stale = [], cleared = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => STALE_RE.test(x) && !mine.has(x)).sort() : []) {
    const id = f.replace(/(?:-\d+)?\.png$/, '');
    if (!ids.has(id)) stale.push(f);
    else if (!only || targetIds.has(id)) { fs.rmSync(path.join(dir, f), { force: true }); cleared.push(f); }
  }
  for (const f of stale) warnings.push(`舊截圖 ${f} 不在這次的 plan.json 裡 → 不用就刪掉`);
  const withMd = (s) => ({ ...s, md: `![${s.file.replace(/\.png$/, '')}](storyboard-preview/${s.file})` });
  const outShots = shots.map(withMd);
  // shots.json：整支的截圖清單（--only 合併上次其他段的；拼圖、分鏡表都讀它）
  const mfFile = path.join(dir, 'shots.json');
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(mfFile, 'utf8')); } catch { /* 第一次 */ }
  const order = new Map(list.map((g, i) => [g.id, i]));
  const kept = only ? (prev?.shots || []).filter((s) => !targetIds.has(s.id) && order.has(s.id) && fs.existsSync(path.join(dir, s.file))) : [];
  const allShots = [...kept, ...outShots].sort((a, b) => order.get(a.id) - order.get(b.id) || a.at - b.at);
  // 拼圖不留過期的：--only 且上次有拼圖 → 有動到的頁自動重做（不用另外加 --sheet）；整支重截沒加 --sheet → 舊頁清掉
  let sheets = null;
  const sheetShots = flags.sample ? sampleShots(allShots, planScenes(P)) : allShots;
  if ((flags.sheet || (only && prev?.sheets?.length)) && allShots.length) sheets = await storyboardSheets(P, flags, dir, sheetShots, { changed: only ? targetIds : null, prev, L: obsLayout(fmt.canvas) });
  else if (!only && fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (SHEET.re.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  const pages = sheets ? sheets.pages : [];
  if (allShots.length) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(mfFile, `${JSON.stringify({ version: 1, planHash: j.planHash ?? null, shots: allShots, skipped, sheets: pages }, null, 1)}\n`);
  }
  return { dir, shots: outShots, allShots, manifest: allShots.length ? mfFile : null, sheets: sheets ? sheets.pages.map((pg) => ({ ...pg, redone: sheets.redone.includes(pg.file) })) : null, skipped, warnings, stale, cleared, segs: list.length, fmt, only, jobs: snapJobs, others: gate.others };
}

// 定稿只要看「會因段而異」的：內容設計動畫、錄影段每段一格，字卡與模板每一種看一格（版面由工具產生，同一種位置固定）
export function sampleShots(shots, scenes) {
  const kindOf = new Map((scenes || []).map((g) => [g.id, g.design ? `design:${g.id}` : g.type === 'media' ? `media:${g.id}` : String(g.template || g.scene || (g.fx != null ? `fx${g.fx}` : g.type || g.id))]));
  const lastOf = new Map();
  for (const x of shots) lastOf.set(x.id, x);   // 每段留最後一張（完成態）
  const seen = new Set(), keep = new Set();
  for (const x of shots) {
    const k = kindOf.get(x.id) ?? x.id;
    if (seen.has(k)) continue;
    seen.add(k);
    keep.add(lastOf.get(x.id));
  }
  return shots.filter((x) => keep.has(x));
}

// FR-082（US4-2）：錄影（--check --json 的 annotations.view；直式只有寬 > 高的錄影段才有）縮到原尺寸 < 0.6、沒有 moves 和 lens、> 3 秒 → 介面字太小
export const SMALL_MEDIA = { scale: 0.6, dur: 3 };
export function smallMediaWarnings(segs) {
  return (segs || []).filter((g) => { const v = g.annotations?.view; return v && v.scale < SMALL_MEDIA.scale && !v.moves && !v.lens && g.end - g.start > SMALL_MEDIA.dur; })
    .map((g) => g.annotations.view.landscape
      ? `${g.id} 的錄影只有原尺寸 ${Math.round(g.annotations.view.scale * 100)} %，介面字會太小 → 講解唸到畫面上的字（版號、路徑、網址、按鈕名）那句加放大鏡 lens 或 moves 推近；沒唸字就不用`
      : `${g.id} 的錄影在直式只有原尺寸 ${Math.round(g.annotations.view.scale * 100)} %，介面字會太小 → 加 moves 推近到操作區`);
}

// 預設只印 ✖、⚠ 與統計；每張截圖的表與貼上用的 markdown 加 --verbose（--only 只有幾張，照印）
function printStoryboard(P, r, { verbose = false } = {}) {
  if (r.fmt) console.log(r.fmt.line);
  console.log(`專案：${rel(P.project)}`);
  const note = [r.only ? `--only ${r.only.join(',')}` : `${r.segs} 段`, r.jobs > 1 ? `${r.jobs} 個行程併發` : ''].filter(Boolean).join('；');
  console.log(`截圖：${r.shots.length} 張（${note}${r.only ? '' : '；條列每組一張、錄影標註每個一張'}）`);
  if (r.skipped?.length) console.log(`略過 ${r.skipped.length} 段（還是範例原文、還沒做）：${r.skipped.join('、')}`);
  if (r.others) console.log(`其他段有 ${r.others} 個 ✖（不影響這段）`);
  const full = verbose || !!r.only;
  if (full) for (const s of r.shots) console.log(`${s.id}｜${fmtT(s.at)}｜${s.why}｜storyboard-preview/${s.file}`);
  for (const w of r.warnings) console.log(`⚠ ${w}`);
  if (r.cleared?.length) console.log(`清掉同一段的舊截圖（這次張數變了）：${r.cleared.join('、')}`);
  if (!r.shots.length) { console.log(r.skipped?.length ? '（每段都還是範例原文，沒有要截的）' : '（plan.json 沒有段落，沒有要截的）'); return; }
  if (full) {
    console.log('→ 貼進 work/storyboard.md（每段放在該節「截圖觀察」上面）：');
    for (const s of r.shots) console.log(s.md);
  }
  if (r.sheets?.length) {
    const redo = r.sheets.filter((x) => x.redone).map((x) => x.file);
    console.log(`→ 拼圖 ${r.sheets.length} 頁（每頁 ${SHEET.per} 張，每格標時間、段 id、為什麼）：${path.join(rel(r.dir), r.sheets[0].file)}${r.sheets.length > 1 ? ` … ${r.sheets[r.sheets.length - 1].file}` : ''}${r.only ? `；這次重做 ${redo.join('、') || '（沒有）'}` : ''}`);
    if (verbose) for (const x of r.sheets) console.log(`  ${x.file}｜${x.ids.join('、')}`);
  }
  console.log(`✔ ${r.shots.length} 張都存好了：${path.join(rel(r.dir), path.sep)}${full ? '' : `（每段的截圖、為什麼、貼上用的 markdown 在 ${path.join(rel(r.dir), 'shots.json')}；要印全表加 --verbose）`}`);
}

// ---------- observe（觀影總表，cli-004 §3）----------

export const OBS = { step: 0.5, cols: 6, rows: 8, tile: [320, 180], label: 44, title: 40, gray: [96, 54], diff: 2.0, still: 8, seamBefore: 0.5, seamAfter: 0.2, seamStep: 0.1, seamTile: [236, 133], seamMerge: 0.3, seamsPer: 10, beatTile: [472, 266], beatCols: 4, beatsPer: 16 };
// 直式（FR-093）：格子 9:16、一列放更多格（總表 8 欄 × 6 列，一張一樣 48 格＝24 秒；拍點 6 欄）；頁寬一樣 1920
export const OBS_V = { ...OBS, cols: 8, rows: 6, tile: [216, 384], gray: [54, 96], seamTile: [135, 240], beatTile: [270, 480], beatCols: 6, beatsPer: 18 };
export const obsLayout = (cv) => (cv?.format === 'portrait' ? OBS_V : OBS);

export function observeTimes(from, to, step = OBS.step) {
  const ts = [];
  for (let k = 0; from + k * step < to - 1e-6; k++) ts.push(r3(from + k * step));
  return ts;
}

// rough.srt 的字幕 → 完成影片秒數（落在 cuts 裡的整句拿掉）
export function cuesToOut(cues, cuts = []) {
  return cues.map((c) => ({ ...c, start: roughToFinal(c.start, cuts), end: roughToFinal(c.end, cuts) })).filter((c) => c.end - c.start > 0.05);
}

// 格子下面那一行：m:ss.s｜段 id｜字幕
export function cellLabel(t, segs = [], cues = []) {
  let seg = null;
  for (const g of segs) if (t >= g.start - 1e-6 && t < g.end - 1e-6 && (!seg || g.start > seg.start)) seg = g;
  const cue = cues.find((c) => t >= c.start - 1e-6 && t < c.end - 1e-6);
  return { time: fmtT(t), id: seg ? seg.id : '—', text: cue ? cue.text.replace(/\s*\n\s*/g, ' ') : '（無字幕）', n: cue?.n ?? null };
}

// 相鄰兩格平均絕對差 < diff、連續 ≥ min 秒 → [[起, 迄]]（秒數相對 from；迄＝最後一格再加一格）
export function staticRuns(grays, { step = OBS.step, diff = OBS.diff, min = OBS.still, from = 0 } = {}) {
  const runs = [];
  let a = 0;
  const close = (b) => { if ((b - a + 1) * step >= min - 1e-6) runs.push([r3(from + a * step), r3(from + (b + 1) * step)]); };
  for (let k = 1; k < grays.length; k++) {
    const p = grays[k - 1], q = grays[k];
    let s = 0;
    for (let i = 0; i < q.length; i++) s += Math.abs(q[i] - p[i]);
    if (s / q.length >= diff) { close(k - 1); a = k; }
  }
  if (grays.length) close(grays.length - 1);
  return runs;
}

// 接縫：每段的起點與終點，相距 < 0.3 秒併成一個；只留 [from + 0.5, to − 0.2] 裡的
export function seamList(segs, from, to) {
  const ev = [];
  for (const g of segs) { ev.push({ at: g.start, after: g.id }); ev.push({ at: g.end, before: g.id }); }
  ev.sort((a, b) => a.at - b.at);
  const out = [];
  for (const e of ev) {
    const last = out[out.length - 1];
    if (last && e.at - last.at < OBS.seamMerge) { if (e.after) last.after ??= e.after; if (e.before) last.before ??= e.before; continue; }
    out.push({ at: r3(e.at), before: e.before ?? null, after: e.after ?? null });
  }
  return out.filter((s) => s.at >= from + OBS.seamBefore - 1e-6 && s.at <= to - OBS.seamAfter + 1e-6).map((s, k) => ({ n: k + 1, ...s }));
}

// t（完成影片秒）在哪一張總表的第幾列第幾格
export function sheetCell(t, from, L = OBS) {
  const per = L.cols * L.rows * L.step, row = L.cols * L.step;
  const d = t - from, m = d - Math.floor(d / per + 1e-9) * per;
  return { sheet: Math.floor(d / per + 1e-9) + 1, r: Math.floor(m / row + 1e-9) + 1, c: Math.floor((m % row) / L.step + 1e-9) + 1 };
}

const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nn = (n) => String(n).padStart(2, '0');

function obsPage(fontsCss, w, h, body, extra = '', L = OBS) {
  const [tw, th] = L.tile;
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${fontsCss}"><style>
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#0B1020;color:#E8ECF5;font-family:var(--font-cjk),sans-serif}
.bar{height:40px;line-height:40px;padding:0 16px;font-size:20px;font-weight:700;background:#1E2740;color:#FFD400;white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(${L.cols},${tw}px);justify-content:space-between}
.cell{width:${tw}px;height:${th + L.label}px;overflow:hidden}.cell img{display:block;width:${tw}px;height:${th}px}
.lab{height:44px;padding:2px 6px;box-sizing:border-box;font-size:15px;line-height:20px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}
.lab b{color:#FFD400}.lab i{font-style:normal;color:#7FD3FF}
${extra}</style></head><body>${body}</body></html>`;
}

export async function observeRun(P, flags) {
  const pj = `projects/${path.basename(P.project)}`;
  const finalDefault = path.join(P.project, 'output', 'final.mp4');
  const file = flags.file ? path.resolve(flags.file) : finalDefault;
  if (!fs.existsSync(file)) throw new Error(`找不到完成影片 ${rel(file)} → 先 render（USAGE.md 2.7），或用 --file 指定 mp4`);
  const info = probeMedia(file);
  if (!info.hasVideo || !info.duration) throw new Error(`${rel(file)} 沒有影像 → 檔案壞了或不是影片`);
  const warnings = [];
  const offset = flags.offset != null ? Number(flags.offset) : 0;
  if (!Number.isFinite(offset) || offset < 0) throw new Error(`--offset 要是 ≥ 0 的秒數，現在是「${flags.offset}」→ 寫 build --test 的起點秒數，例如 --offset 41`);
  if (flags.file && path.resolve(flags.file) !== path.resolve(finalDefault) && flags.offset == null) warnings.push('沒寫 --offset：當成從完成影片 0 秒開始；測試片段要加 --offset <build --test 的起點>');
  const from = flags.from != null ? Number(flags.from) : offset;
  const to = flags.to != null ? Number(flags.to) : r3(offset + info.duration);
  if (!(Number.isFinite(from) && Number.isFinite(to) && from >= offset - 1e-6 && from < to && to <= offset + info.duration + 1e-6)) {
    throw new Error(`--from／--to 要是完成影片秒數，而且 ${r3(offset)} ≤ from < to ≤ ${r3(offset + info.duration)}（現在 from=${flags.from ?? from}、to=${flags.to ?? to}）→ 改成 ${r3(offset)}–${r3(offset + info.duration)} 之間、from < to 的完成影片秒數`);
  }
  const chrome = findChrome({ chrome: flags.chrome });
  const fmt = formatOf(P, flags), L = obsLayout(fmt.canvas), words = panelWords(fmt.format === 'portrait');
  const dir = path.join(P.project, 'work', 'observe');
  const tiles = path.join(dir, '.tiles');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^(sheet|seam|beat)-\d+\.jpg$/.test(f) || f === 'index.md') fs.rmSync(path.join(dir, f), { force: true });
  fs.rmSync(tiles, { recursive: true, force: true });
  fs.mkdirSync(tiles, { recursive: true });

  // 段落與字幕
  let segs = [], cuts = [];
  const c = checkJsonOf(P, flags);
  if (!c.json?.items?.length) warnings.push(`build --check --json ${c.json ? '有 ✖' : '沒有輸出'}：格子不標段 id、不做接縫條帶 → 先修好 plan.json 再重跑 observe`);
  else {
    if (!c.json.ok) warnings.push(`build --check 有 ✖（第一個：${c.json.errors?.[0] ?? '?'}）：段 id 照 plan.json 標，修好之前僅供參考`);
    cuts = c.json.edit?.cuts || []; segs = outOf(c.json.items, cuts).list;
  }
  // 測試片段（build --test 起點＝--offset）不含起點在它之前的段：格子不標它，免得「畫面和段落對不上」
  if (offset > 0) for (const g of segs.filter((x) => x.start < offset - 1e-6 && x.end > from)) warnings.push(`${g.id} 在 ${fmtT(g.start)} 就開始了，測試片段不含這段：格子不標它（要看這段，build --test 的起點改成 ${r3(g.start)}）`);
  if (offset > 0) segs = segs.filter((x) => x.start >= offset - 1e-6);
  // 子母畫面段有沒有講者小視窗（用 --check --json 判，不看圖）
  const blackOut = hasVoiceSource(P.project) ? [] : mergeRanges(c.json?.roughBlack?.length ? c.json.roughBlack : c.json?.voiceOnly || []).map(([a, b]) => [roughToFinal(a, cuts), roughToFinal(b, cuts)]);
  const pips = c.json?.items?.length ? pipCoverage(c.json.items, planScenes(P), blackOut).filter((x) => x.end > from && x.start < to && x.start >= offset - 1e-6) : [];
  for (const x of pips.filter((y) => y.state !== '有')) warnings.push(`${x.id} 是${x.kind}${x.state === '無' ? `卻沒有${words.win}` : `，${words.win}在 ${fmtT(x.gaps[0][0])} 就沒了`} → 跑 node shared/template/tools/qc.mjs final --project ${pj} 看原因`);
  let cues = [];
  if (P.srt && fs.existsSync(P.srt)) cues = cuesToOut(parseSrt(fs.readFileSync(P.srt, 'utf8')), cuts);
  else warnings.push('找不到 work/rough.srt：格子不印字幕');

  // 1. 抽格＋靜止區間的 96×54 灰階：同一次解碼
  const ts = observeTimes(from, to);
  const [tw, th] = L.tile, [gw, gh] = L.gray;
  const grayFile = path.join(tiles, 'gray.raw');
  let r = run('ffmpeg', ['-y', '-v', 'error', '-ss', String(r3(from - offset)), '-t', String(r3(to - from)), '-i', file,
    '-filter_complex', `[0:v]fps=${1 / OBS.step}:round=up,split=2[a][b];[a]scale=${tw}:${th}:flags=bicubic[t];[b]scale=${gw}:${gh},format=gray[g]`,
    '-map', '[t]', '-q:v', '4', path.join(tiles, 'c%05d.jpg'), '-map', '[g]', '-f', 'rawvideo', grayFile]);
  if (r.status !== 0) throw new Error(`抽格失敗（${path.basename(file)} ${fmtT(from)}–${fmtT(to)} 秒）：${tail(r.stderr, 400)} → 重跑一次；還是失敗就把這行回報`);
  const tileFiles = fs.readdirSync(tiles).filter((f) => /^c\d+\.jpg$/.test(f)).sort();
  // 2. 靜止區間
  const grayBuf = fs.readFileSync(grayFile), grays = [];
  for (let o = 0; o + gw * gh <= grayBuf.length; o += gw * gh) grays.push(grayBuf.subarray(o, o + gw * gh));
  const n = Math.min(ts.length, tileFiles.length || ts.length);
  const stat = staticRuns(grays.slice(0, n), { from }).map(([a, b]) => {
    const L = cellLabel(a, segs, cues);
    return { from: a, to: Math.min(b, to), id: L.id === '—' ? null : L.id, cue: L.n != null ? `#${L.n} ${L.text}` : null };
  });

  // 排版共用一個 Chrome（長片要排上百張，一張冷開一次太慢）；抽格同時跑幾個 ffmpeg
  const browser = await openBrowser({ chrome });
  const beats = [], beatFiles = [], seamFiles = [], sheets = [];
  let seams = [];
  try {
    // 3. 總表（Chrome 排版：中文字幕）
    const fontsCss = pathToFileURL(path.join(P.templateDir, 'kit', 'fonts.css')).href;
    const per = L.cols * L.rows;
    const name = path.basename(P.project);
    const layout = async (kind, k, html, H) => {
      const hf = path.join(tiles, `${kind}-${nn(k)}.html`), jpg = path.join(dir, `${kind}-${nn(k)}.jpg`);
      fs.writeFileSync(hf, html);
      try { await browser.shot({ file: hf, out: jpg, width: 1920, height: H, quality: 85 }); } catch (e) { throw new Error(`Chrome 排版失敗（${kind}-${nn(k)}）：${e.message} → 重跑一次；還是失敗就加 --from／--to 縮小範圍`); }
      return jpg;
    };
    const sheetPlan = [];
    for (let s0 = 0, k = 1; s0 < n; s0 += per, k++) sheetPlan.push({ s0, k });
    const madeSheets = await pool(sheetPlan, JOBS.chrome, async ({ s0, k }) => {
      const idx = Array.from({ length: Math.min(per, n - s0) }, (_, i) => s0 + i);
      const rows = Math.ceil(idx.length / L.cols), H = OBS.title + rows * (th + OBS.label);
      const a = ts[idx[0]], b = r3(ts[idx[idx.length - 1]] + OBS.step);
      const cells = idx.map((i) => {
        const L = cellLabel(ts[i], segs, cues);
        return `<div class="cell">${tileFiles[i] ? `<img src="${tileFiles[i]}">` : ''}<div class="lab"><b>${L.time}</b>｜<i>${escH(L.id)}</i>｜${escH(L.text)}</div></div>`;
      }).join('');
      const html = obsPage(fontsCss, 1920, H, `<div class="bar">觀影總表 ${nn(k)}｜${fmtT(a)}–${fmtT(b)}｜${escH(name)}｜每格 ${OBS.step} 秒</div><div class="grid">${cells}</div>`, '', L);
      return { file: await layout('sheet', k, html, H), from: a, to: b, cells: idx.length };
    });
    sheets.push(...madeSheets);

    // 4. 接縫條帶
    seams = segs.length ? seamList(segs, from, to) : [];
    const [sw, shh] = L.seamTile, seamRow = 30 + shh + 20;
    const nFrames = Math.round((OBS.seamBefore + OBS.seamAfter) / OBS.seamStep) + 1;
    await pool(seams, JOBS.ffmpeg, async (sm) => {
      const t0 = Math.max(offset, sm.at - OBS.seamBefore);
      const q = await spawnAsync('ffmpeg', ['-y', '-v', 'error', '-ss', String(r3(t0 - offset)), '-t', String(r3(sm.at + OBS.seamAfter + OBS.seamStep * 1.5 - t0)), '-i', file, '-vf', `fps=${1 / OBS.seamStep}:round=up,scale=${sw}:${shh}`, '-frames:v', String(nFrames), '-q:v', '4', path.join(tiles, `s${String(sm.n).padStart(3, '0')}-%02d.jpg`)]);
      if (q.status !== 0) throw new Error(`抽格失敗（${path.basename(file)} ${fmtT(t0)}–${fmtT(sm.at + OBS.seamAfter)} 秒）：${tail(q.stderr, 400)} → 重跑一次；還是失敗就把這行回報`);
      sm.t0 = r3(t0);
    });
    const tileNames = fs.readdirSync(tiles);
    for (const sm of seams) sm.frames = tileNames.filter((f) => f.startsWith(`s${String(sm.n).padStart(3, '0')}-`)).sort();
    const seamPlan = [];
    for (let s0 = 0, k = 1; s0 < seams.length; s0 += OBS.seamsPer, k++) seamPlan.push({ group: seams.slice(s0, s0 + OBS.seamsPer), k });
    const madeSeams = await pool(seamPlan, JOBS.chrome, async ({ group, k }) => {
      const H = group.length * seamRow;
      const rowsHtml = group.map((sm) => {
        const cells = sm.frames.map((f, i) => { const d = r3(sm.t0 + i * OBS.seamStep - sm.at); return `<div class="sc"><img src="${f}"><div class="sl">${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}</div></div>`; }).join('');
        return `<div class="row"><div class="st">接縫 ${sm.n}｜${fmtT(sm.at)}｜${escH(sm.before ?? '—')} → ${escH(sm.after ?? '—')}</div><div class="sr">${cells}</div></div>`;
      }).join('');
      const extra = `.row{height:${seamRow}px}.st{height:30px;line-height:30px;padding:0 12px;font-size:17px;font-weight:700;color:#FFD400;background:#1E2740}.sr{display:flex;gap:4px;padding-left:2px}.sc{width:${sw}px}.sc img{display:block;width:${sw}px;height:${shh}px}.sl{height:20px;line-height:20px;font-size:14px;text-align:center}`;
      const html = obsPage(fontsCss, 1920, H, rowsHtml, extra);
      const jpg = await layout('seam', k, html, H);
      group.forEach((sm, i) => { sm.file = jpg; sm.row = i + 1; });
      return jpg;
    });
    seamFiles.push(...madeSeams);

    // 5. 拍點表：和 storyboard 同一套取樣時刻（抽屜抽出後 0.3 秒、焦點抬起後、完成態、條列每組、錄影標註到位），從完成影片抽格
    if (segs.length) {
      // 只讀範圍裡的段（--from／--to 只看一段時不用讀整片）
      const inRange = segs.filter((g) => g.end > from && g.start < to), inIds = new Set(inRange.map((g) => g.id));
      let motion = null;
      if (!fs.existsSync(path.join(P.out, 'index.html'))) warnings.push(`還沒 build（找不到 ${pj}/work/hyperframes/index.html）：拍點用估的（完成態段尾前 ${SHOT.tail} 秒、條列進場後 ${SHOT.listReady} 秒）→ 先跑 build.mjs 再重跑 observe`);
      else if (inRange.length) {
        try { motion = await shotMotion(P, inRange, flags); } catch (e) { warnings.push(`讀不到動畫時間軸（${tail(e.message, 200)}）：拍點用估的 → 重跑一次`); }
      }
      const plan = shotPlan(segs, c.json?.outputDur ?? Infinity, motion, fxLabels(P, (c.json?.items || []).filter((it) => inIds.has(it.id)), motion, warnings), inIds);
      for (const w of plan.warnings) warnings.push(w);
      for (const s of plan.shots) if (s.at >= from - 1e-6 && s.at < to - 1e-6) beats.push({ n: beats.length + 1, id: s.id, at: s.at, why: s.why });
      const [bw, bh] = L.beatTile;
      await pool(beats, JOBS.ffmpeg, async (b) => {
        const q = await spawnAsync('ffmpeg', ['-y', '-v', 'error', '-ss', String(r3(b.at - offset)), '-i', file, '-frames:v', '1', '-vf', `scale=${bw}:${bh}:flags=bicubic`, '-q:v', '3', path.join(tiles, `b${String(b.n).padStart(3, '0')}.jpg`)]);
        if (q.status !== 0) throw new Error(`抽格失敗（${path.basename(file)} ${fmtT(b.at)}）：${tail(q.stderr, 400)} → 重跑一次；還是失敗就把這行回報`);
      });
      const extra = `.bgrid{display:grid;grid-template-columns:repeat(${L.beatCols},${bw}px);justify-content:space-between}.bc{width:${bw}px;height:${bh + 52}px;overflow:hidden}.bc img{display:block;width:${bw}px;height:${bh}px}.bc .lab{height:52px;font-size:17px;line-height:24px}`;
      const beatPlan = [];
      for (let s0 = 0, k = 1; s0 < beats.length; s0 += L.beatsPer, k++) beatPlan.push({ group: beats.slice(s0, s0 + L.beatsPer), k });
      const madeBeats = await pool(beatPlan, JOBS.chrome, async ({ group, k }) => {
        const rows = Math.ceil(group.length / L.beatCols), H = OBS.title + rows * (bh + 52);
        const cells = group.map((b) => `<div class="bc"><img src="b${String(b.n).padStart(3, '0')}.jpg"><div class="lab"><b>${fmtT2(b.at)}</b>｜<i>${escH(b.id)}</i>｜${escH(b.why)}</div></div>`).join('');
        const html = obsPage(fontsCss, 1920, H, `<div class="bar">拍點表 ${nn(k)}｜${escH(name)}｜和 storyboard 同一套取樣時刻，從完成影片抽格</div><div class="bgrid">${cells}</div>`, extra);
        const jpg = await layout('beat', k, html, H);
        group.forEach((b) => { b.file = jpg; });
        return jpg;
      });
      beatFiles.push(...madeBeats);
    }
  } finally { await browser.close(); }

  // 6. index.md
  const now = new Date(), stamp = `${now.getFullYear()}-${nn(now.getMonth() + 1)}-${nn(now.getDate())} ${nn(now.getHours())}:${nn(now.getMinutes())}`;
  const md = [`# 觀影總表（qc.mjs observe）`, '', `來源：${rel(file)}｜範圍 ${fmtT(from)}–${fmtT(to)}｜每 ${OBS.step} 秒一格｜產生時間 ${stamp}`, '', '## 總表', '',
    `| 檔案 | 範圍 | 格數 | 第 r 列第 c 格的時間 | ${fmt.format === 'portrait' ? '講者面板（上下分割段）' : '小視窗（子母畫面段）'} |`, '|---|---|---|---|---|',
    ...sheets.map((s) => {
      const p = pips.filter((x) => x.end > s.from && x.start < s.to).map((x) => `${x.id} ${x.state === '部分' ? `部分（${fmtT(x.gaps[0][0])} 起沒有）` : x.state}`);
      return `| ${path.basename(s.file)} | ${fmtT(s.from)}–${fmtT(s.to)} | ${s.cells} | ${fmtT(s.from)} ＋ ((r−1)×${L.cols} ＋ (c−1))×${OBS.step} 秒 | ${p.join('、') || '—'} |`;
    }),
    '', `## 靜止區間（≥ ${OBS.still} 秒幾乎不變）`, ''];
  if (stat.length) {
    md.push('| 起–迄 | 長度 | 段 | 起點那句字幕 | 在哪張 |', '|---|---|---|---|---|');
    for (const s of stat) { const w = sheetCell(s.from, from, L); md.push(`| ${fmtT(s.from)}–${fmtT(s.to)} | ${r1(s.to - s.from)} 秒 | ${s.id ?? '—'} | ${s.cue ?? '（無字幕）'} | sheet-${nn(w.sheet)}.jpg 第 ${w.r} 列第 ${w.c} 格起 |`); }
  } else md.push('沒有');
  md.push('', '## 拍點（和 storyboard 同一套取樣時刻）', '');
  if (beats.length) {
    md.push('| 序號 | 時間 | 段 | 拍點 | 在哪張 |', '|---|---|---|---|---|');
    for (const b of beats) md.push(`| ${b.n} | ${fmtT2(b.at)} | ${b.id} | ${b.why} | ${path.basename(b.file)} |`);
  } else md.push('沒有');
  md.push('', '## 接縫', '');
  if (seams.length) {
    md.push('| 序號 | 時間 | 前段 → 後段 | 在哪張 |', '|---|---|---|---|');
    for (const s of seams) md.push(`| ${s.n} | ${fmtT(s.at)} | ${s.before ?? '—'} → ${s.after ?? '—'} | ${path.basename(s.file)} 第 ${s.row} 列 |`);
  } else md.push('沒有');
  const indexFile = path.join(dir, 'index.md');
  fs.writeFileSync(indexFile, md.join('\n') + '\n');
  fs.rmSync(tiles, { recursive: true, force: true });
  return { file, info, fmt, L, from, to, sheets, seams, seamFiles, beats, beatFiles, static: stat, index: indexFile, warnings, noSeam: !segs.length ? '拿不到段落資料' : !seams.length ? '範圍內沒有段落接縫' : null };
}

function printObserve(P, r) {
  if (r.fmt) console.log(r.fmt.line);
  console.log(`專案：${rel(P.project)}`);
  console.log(`來源：${rel(r.file)}（${r.info.width}×${r.info.height}、${fmtT(r.info.duration)}）；範圍 ${fmtT(r.from)}–${fmtT(r.to)}，每 ${OBS.step} 秒一格`);
  for (const w of r.warnings) console.log(`⚠ ${w}`);
  const f = r.sheets.map((s) => path.basename(s.file));
  console.log(`→ ${path.join(rel(path.dirname(r.sheets[0].file)), f[0])}${f.length > 1 ? ` … ${f[f.length - 1]}` : ''}（${f.length} 張，每張 ${r.L.cols}×${r.L.rows} 格＝${r.L.cols * r.L.rows * OBS.step} 秒；格下印「時間｜段 id｜字幕」）`);
  if (r.seamFiles.length) {
    const g = r.seamFiles.map((x) => path.basename(x));
    console.log(`→ ${path.join(rel(path.dirname(r.seamFiles[0])), g[0])}${g.length > 1 ? ` … ${g[g.length - 1]}` : ''}（${r.seams.length} 個接縫，每個從前 ${OBS.seamBefore} 秒到後 ${OBS.seamAfter} 秒、每 ${OBS.seamStep} 秒一格）`);
  } else console.log(`（沒有接縫條帶：${r.noSeam}）`);
  if (r.beatFiles.length) {
    const g = r.beatFiles.map((x) => path.basename(x));
    console.log(`→ ${path.join(rel(path.dirname(r.beatFiles[0])), g[0])}${g.length > 1 ? ` … ${g[g.length - 1]}` : ''}（${r.beats.length} 個拍點：抽屜抽出後 ${SHOT.drawer} 秒、焦點抬起後、完成態、條列每組、錄影標註到位；和 storyboard 同一套時刻）`);
  }
  console.log(`→ ${rel(r.index)}（總表索引、靜止區間、拍點、接縫清單）`);
  if (r.static.length) for (const s of r.static) console.log(`⚠ 靜止 ${fmtT(s.from)}–${fmtT(s.to)}（${r1(s.to - s.from)} 秒）｜${s.id ?? '—'}｜${s.cue ?? '（無字幕）'} → 對照講解決定要不要補畫面（換段、加標註或情境動畫）；刻意留白就不用理它`);
  else console.log(`✔ 沒有 ≥ ${OBS.still} 秒幾乎不變的區間`);
  console.log('下一步：逐張看 sheet-NN.jpg、beat-NN.jpg 與 seam-NN.jpg；有問題照「[P0] 0:41.2（s05） 問題｜證據（sheet-02.jpg 第 3 列第 5 格）｜修法」回報');
}

// ---------- framing 的建議倍率 ----------

// 不切到手勢、（直式）頭頂／下巴在範圍內、來源像素放大 ≤ 3.5 倍的倍率裡最大的；全被排除時表上倍率最小的那一列（有黑邊時不一定是 1.00x）
export function suggestZoom(cands) {
  const ok = cands.filter((c) => !c.cut.length && !c.face?.length && !(c.upscale > 3.5));
  if (!ok.length) return { zoom: Math.min(...cands.map((c) => c.zoom)), none: true };
  return { zoom: Math.max(...ok.map((c) => c.zoom)), none: false };
}

// ---------- main ----------

export async function cli() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || !flags.cmd || flags.cmd === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  if (!['final', 'speaker', 'framing', 'storyboard', 'observe'].includes(flags.cmd)) throw new Error(`沒有「${flags.cmd}」這個指令：只有 final、speaker、framing、storyboard、observe → 改成這五個之一（用 --help 看用法）`);
  if (flags.cmd !== 'storyboard') for (const k of ['only', 'sheet', 'jobs']) if (flags[k] != null) throw new Error(`--${k} 只有 storyboard 用 → 拿掉 --${k}（observe 只看一段用 --from／--to）`);
  const P = pathsFrom({ project: flags.project, template: flags.template });
  if (flags.cmd === 'final') {
    const r = await finalCheck(P, flags);
    if (flags.json) {
      const f = r.facts;
      console.log(JSON.stringify({
        ok: r.ok, errors: r.errors, warnings: r.warnings, file: rel(r.file),
        checks: r.checks, format: { width: f.width, height: f.height, fps: f.fps, hasAudio: f.hasAudio },
        duration: { actual: f.dur, expected: f.expected }, loudness: f.loud ? { lufs: f.loud.i, truePeak: f.loud.tp } : null,
        freezes: f.freezes, blacks: f.blacks, silences: f.silences, stills: f.stills, covered: f.covered, sheet: r.sheet ? rel(r.sheet.file) : null, theme: f.theme,
        captions: f.captionStyle?.samples ?? null,
        canvas: { format: f.canvas.format, size: [f.canvas.W, f.canvas.H], source: r.fmt.source },
      }, null, 2));
    } else printFinal(P, r);
    return r.ok ? 0 : 1;
  }
  if (flags.cmd === 'framing') {
    const r = framingPreview(P, flags);
    if (!flags.write) { printFraming(P, r); return 0; }
    const w = writeFrame(P, r);
    console.log(w.frame ? `✓ plan.json 的 frame → [${w.frame.join(', ')}]（${w.zoom.toFixed(2)}x；建議倍率）` : '✓ 建議不裁切（1.00x）：plan.json 不寫 frame');
    return 0;
  }
  if (flags.cmd === 'storyboard') {
    const r = await storyboardRun(P, flags);
    if (flags.json) console.log(JSON.stringify({ ok: true, format: r.fmt.format, dir: rel(r.dir), shots: r.shots.map(({ id, file, at, why, md }) => ({ id, file, at, why, md })), warnings: r.warnings, stale: r.stale, cleared: r.cleared,
      only: r.only, skipped: r.skipped, others: r.others, manifest: r.manifest ? rel(r.manifest) : null, allShots: r.allShots.map(({ id, file, at, why, md }) => ({ id, file, at, why, md })),
      sheets: r.sheets ? r.sheets.map((x) => ({ file: x.file, ids: x.ids, shots: x.shots, redone: x.redone })) : null }, null, 2));
    else printStoryboard(P, r, { verbose: !!flags.verbose });
    return 0;
  }
  if (flags.cmd === 'observe') {
    const r = await observeRun(P, flags);
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, format: r.fmt.format, file: rel(r.file), from: r.from, to: r.to, step: OBS.step,
        sheets: r.sheets.map((s) => ({ file: rel(s.file), from: s.from, to: s.to, cells: s.cells })),
        seams: r.seams.map((s) => ({ n: s.n, at: s.at, before: s.before, after: s.after, file: rel(s.file), row: s.row })),
        beats: r.beats.map((b) => ({ n: b.n, id: b.id, at: b.at, why: b.why, file: rel(b.file) })),
        static: r.static, index: rel(r.index), warnings: r.warnings }, null, 2));
    } else printObserve(P, r);
    return 0;
  }
  const maps = speakerMaps(P, flags);
  printSpeaker(P, maps);
  if (flags.write) { const w = writeSpeakerBox(P, maps.suggest, { force: !!flags.force }); printSpeakerWrite(P, w); return w.reason === 'none' ? 1 : 0; }
  return 0;
}

const isMain = () => {
  try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (isMain()) cli().then((code) => { process.exitCode = code; }, (e) => {
  if (process.argv.includes('--json') && ['storyboard', 'observe'].includes(process.argv[2])) console.log(JSON.stringify({ ok: false, errors: e.message.split('\n✖ ') }));
  else console.error(`✖ ${e.message}`);
  process.exitCode = 1;
});

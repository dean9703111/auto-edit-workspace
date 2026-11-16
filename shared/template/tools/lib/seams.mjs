// 換段的畫面檢查（055 N5、N6）：在換段前後取幾格真的畫面（含底片，npx hyperframes snapshot），切成格子比亮度。
//   ⚠ seam-flash：頭尾兩格之間某一格在 ≥ 5% 面積突然變亮或變暗（前一段的底先淡掉露出底下的講者、下一段的底重跑擦入、壓暗的東西退場前先變回全亮）
//   ⚠ seam-cut  ：不透明的底（整張幕、疊加段的色塊）在一格之內消失、露出講者，之前 0.3 秒沒有淡出或擦開
// 錄影段的進出場、章節幕、kit 自己的版面轉場（小視窗移動、色帶）本來就照設定切、每一格都在動，這些換段不量。
//
//   seamList(items, { filmEnd, only })     → 換段清單 [{ t, a, b, cut }]（a／b：前後段 id，null＝只有講者）
//   frameTimes(t, fps)                     → 取格的時刻（完成影片秒數，照 fps 對齊換段前後那兩格）
//   captionBand(html, W, H)                → 字幕底板的上下緣 [y0, y1]（字幕每一句都在換，不量）
//   gridOf(buf, w, h, mask)                → 一格灰階縮圖（W/5×H/5）切成 40 px 的格子：{ m 平均亮度, sd 標準差 }
//   analyzeSeam(seam, frames, mask)        → [finding]（frames：frameTimes 的每個時刻 → gridOf；純函式，測試用）
//   seamLine(f)                            → ⚠ 那一行
//   checkSeams(P, { only, budget, jobs })  → { lines, findings, total, measured, cached, skipped, seconds }（真的截圖；同一個換段內容沒變就沿用上次）
//   seamsSync(P, ids, opts)                → versions.mjs finish 用：只量 ids 前後的換段，回傳 ⚠ 的行（子行程跑，量不了回 []）
//   seamsLines(P, opts)                    → build --review 用：全片（有時間上限、照優先順序抽樣），回傳 Promise<要印的行>
//
// CLI：node shared/template/tools/lib/seams.mjs --project projects/<專案> [--only s0101,x0103] [--budget 90] [--jobs 3] [--no-cache] [--json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hfArgs, hfLocal } from './hf.mjs';
import { pool } from './raster.mjs';
import { captureState, reviewHashes } from './incremental.mjs';
import { isMain } from './cli.mjs';
import { r3Round as r3 } from './time.mjs';

// ---------- 門檻（055；改了 SEAM.v 跟著加，快取就重算） ----------
export const SEAM = {
  v: 1,
  pre: -1.0,            // 頭一格：換段前 1 秒（段尾 1 秒內的退場都在這之後）
  mids: [-0.5, -0.38, -0.27, -0.17, -0.08],   // 換段前：段尾淡出、底先淡掉（閃一下常常只有 0.1–0.2 秒，取密一點）
  after: [0.15, 0.3],   // 換段後：下一段的底重跑擦入
  post: 0.6,            // 尾一格：換段後 0.6 秒（擦入、彈入大多做完了）
  scale: 5,             // 灰階縮圖：畫面 ÷ 5
  cell: 8,              // 格子：縮圖 8×8＝畫面 40×40 px
  tol: 24,              // 亮度（0–255）超出頭尾兩格的範圍多少才算「突然變」
  flatSd: 2,            // 格子裡亮度的標準差 < 2＝動畫畫的純色底（錄影、講者再暗的地方也有 3 以上的雜訊：段裡的特效、講者自己動不算）
  textureSd: 3,         // seam-cut：換段後那一格 ≥ 3＝露出來的是錄影（講者、背景）
  flashArea: 0.05,      // seam-flash：一格裡 ≥ 5% 面積突然變
  cutDelta: 30,         // seam-cut：換段那一格前後亮度差 > 30
  cutArea: 0.08,        // seam-cut：≥ 8% 面積是「純色的底一格內變成講者」
  cutGap: 0.3,          // seam-cut：之前 0.3 秒這些格子沒有變（沒有淡出或擦開）
  capPad: 12,           // 字幕底板上下多遮的 px
  secPerFrame: 0.8,     // 估時間：snapshot 一格約 0.8 秒（一個行程）
  startSec: 5,          // 每個 snapshot 行程開 Chrome、載頁約 5 秒
  jobs: 3,              // 同時幾個 snapshot 行程（機器核心少就少開）
  budget: 90,           // build --review：最多花幾秒量換段（量不完的下次接著量）
  finishBudget: 120,    // versions.mjs finish：只量改到的段，照樣設上限
};
const CACHE = path.join('work', '.cache', 'seams.json');

const r2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const isMedia = (x) => x?.type === 'media';
const isChapter = (x) => x?.key === 'chapter' || x?.family === 'chapter';
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
// 「9.35 秒」「1:02.35 」（後面直接接中文）；一段時間「9.17–9.33 秒」「1:02.17–1:02.33」
export const secLabel = (t) => (t >= 60 ? `${clock(t)} ` : `${r2(t)} 秒`);
const spanLabel = (a, b) => (b >= 60 ? `${clock(a)}–${clock(b)}` : a === b ? `${r2(a)} 秒` : `${r2(a)}–${r2(b)} 秒`);

// ---------- 換段清單 ----------

// kit 自己的版面轉場（講者小視窗移動、色帶滑進滑出、錄影段、章節幕）：每一格都在動、本來就照設定切，不量
export const KIT_IN = new Set(['wipe', 'wipeIn', 'swap', 'side', 'push', 'dive', 'band', 'media', 'chapter']);
export const KIT_OUT = new Set(['wipeOut', 'swap', 'retract', 'rise', 'side', 'push', 'dive', 'band', 'handoff', 'media']);
const txOf = (x, k) => x?.out?.tx?.[k] ?? null;

// items：build --check --json 的 items（out.start／out.end 是完成影片秒數；out.tx 是 plan 排的轉場）。filmEnd：最後一段的結束（之後是片尾，不量）
// 回傳 [{ t, a, b, cut }]：a／b 是前後段 id（null＝只有講者）；cut＝要不要量「硬切回講者」
export function seamList(items, { filmEnd = Infinity, only = null } = {}) {
  const segs = (items || []).filter((x) => Number.isFinite(x?.out?.start) && Number.isFinite(x?.out?.end) && x.out.end > x.out.start)
    .sort((p, q) => p.out.start - q.out.start);
  const coverAt = (t, not, side) => {
    const c = segs.filter((x) => x !== not && (side < 0 ? x.out.start < t - 0.01 && x.out.end >= t - 0.02 : x.out.start <= t + 0.02 && x.out.end > t + 0.01));
    return c.sort((p, q) => q.out.start - p.out.start)[0] || null;
  };
  const out = new Map();
  const add = (t, A, B) => {
    if (t <= 0.05 || t >= filmEnd - 0.05) return;
    if (isMedia(A) || isMedia(B)) return;   // 錄影段的進出場照 enter／exit 設定，kit 自己做
    if ((B && KIT_IN.has(txOf(B, 'in'))) || (A && KIT_OUT.has(txOf(A, 'out')))) return;
    const key = `${Math.round(t * 50)}|${A?.id ?? ''}|${B?.id ?? ''}`;
    if (out.has(key)) return;
    out.set(key, { t: r3(t), a: A?.id ?? null, b: B?.id ?? null, cut: !!A && !isChapter(A) && !isChapter(B) });
  };
  for (const x of segs) {
    add(x.out.start, coverAt(x.out.start, x, -1), x);
    add(x.out.end, x, coverAt(x.out.end, x, 1));
  }
  let list = [...out.values()].sort((p, q) => p.t - q.t);
  if (only) { const s = new Set(only); list = list.filter((m) => s.has(m.a) || s.has(m.b)); }
  return list;
}

// 取格的時刻都對齊 fps 的格（和 render 出來的那一格一樣）；換段前後那兩格：最後一格還在前一段（tb）、第一格已經換了（ta）
export function frameTimes(t, fps = 30, filmEnd = Infinity) {
  const k = Math.ceil(t * fps - 1e-6) - 1;
  const last = Number.isFinite(filmEnd) ? Math.ceil(filmEnd * fps - 1e-6) - 1 : Infinity;
  const at = (n) => r3(Math.max(0, Math.min(last, n)) / fps);
  const near = (d) => at(Math.round(r3((t + d) * fps)));
  const gap = SEAM.mids.reduce((p, d) => (Math.abs(d + SEAM.cutGap) < Math.abs(p + SEAM.cutGap) ? d : p));   // seam-cut 比的「之前 0.3 秒」那一格
  return { pre: near(SEAM.pre), mids: SEAM.mids.map(near), tb: at(k), ta: at(k + 1), after: SEAM.after.map(near), post: near(SEAM.post), gap: near(gap) };
}
const allTimes = (ft) => [ft.pre, ...ft.mids, ft.tb, ft.ta, ...ft.after, ft.post];

// ---------- 灰階格子 ----------

// 字幕底板（compositions/captions.html 的 root：data-cap 有 --cap-bottom／--cap-line／--cap-pad；沒有就是 kit/captions.css 的預設）
export function captionBand(html, W, H) {
  const s = String(html || '');
  const root = /<div[^>]*id="captions"[^>]*>/.exec(s)?.[0] || '';
  const px = (name) => { const m = new RegExp(`${name}:\\s*([\\d.]+)px`).exec(root); return m ? Number(m[1]) : null; };
  const portrait = H > W || /data-format="portrait"/.test(root);
  const bottom = /data-cap=/.test(root) && px('--cap-bottom') != null ? px('--cap-bottom') : portrait ? 511 : 6;
  const line = px('--cap-line') ?? 71;
  const pad = /--cap-pad:\s*([\d.]+)px\s+[\d.]+px\s+([\d.]+)px/.exec(root);
  const h = line + (pad ? Number(pad[1]) + Number(pad[2]) : 47);
  return [Math.max(0, H - bottom - h - SEAM.capPad), Math.min(H, H - bottom + SEAM.capPad)];
}

// 要量的格子（1＝量）：字幕那一條不量
export function maskOf(W, H, band) {
  const S = SEAM.scale * SEAM.cell, gw = Math.floor(W / S), gh = Math.floor(H / S);
  const mask = new Uint8Array(gw * gh).fill(1);
  if (band) for (let gy = 0; gy < gh; gy++) if (gy * S < band[1] && (gy + 1) * S > band[0]) mask.fill(0, gy * gw, (gy + 1) * gw);
  return { gw, gh, mask };
}

// buf：W/5×H/5 的 8 位元灰階（ffmpeg format=gray）
export function gridOf(buf, w, h) {
  const C = SEAM.cell, gw = Math.floor(w / C), gh = Math.floor(h / C);
  const m = new Float32Array(gw * gh), sd = new Float32Array(gw * gh), n = C * C;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let s = 0, q = 0;
    for (let y = 0; y < C; y++) { const row = (gy * C + y) * w + gx * C; for (let x = 0; x < C; x++) { const v = buf[row + x]; s += v; q += v * v; } }
    const mean = s / n;
    m[gy * gw + gx] = mean;
    sd[gy * gw + gx] = Math.sqrt(Math.max(0, q / n - mean * mean));
  }
  return { gw, gh, m, sd };
}

// ---------- 判斷 ----------

const ZH_V = ['上方', '中間', '下方'], ZH_H = ['左', '', '右'];
// 格子的位置 → 「畫面上方」「畫面左下」「整個畫面」
export function whereOf(cells, gw, gh) {
  if (!cells.length) return '畫面';
  let x0 = gw, x1 = 0, y0 = gh, y1 = 0, sx = 0, sy = 0;
  for (const i of cells) { const x = i % gw, y = Math.floor(i / gw); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sx += x; sy += y; }
  if ((x1 - x0 + 1) / gw > 0.7 && (y1 - y0 + 1) / gh > 0.6) return '整個畫面';
  const cx = sx / cells.length / gw, cy = sy / cells.length / gh;
  const v = ZH_V[Math.min(2, Math.floor(cy * 3))], hz = (x1 - x0 + 1) / gw > 0.6 ? '' : ZH_H[Math.min(2, Math.floor(cx * 3))];
  return hz ? `畫面${hz}${v === '中間' ? '側' : v.slice(0, 1)}` : `畫面${v}`;
}

// frames：Map(秒 → grid)；mask：maskOf 的 mask。回傳 0–2 個 finding
export function analyzeSeam(seam, frames, mask, ft, stats = null) {
  const get = (t) => frames.get(t);
  const A = get(ft.pre), B = get(ft.post);
  if (!A || !B) return [];
  const used = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) used.push(i);
  const N = used.length || 1, { gw, gh } = A;
  const out = [];
  // seam-flash：中間某一格超出頭尾兩格的亮度範圍（只看至少一頭是純色底的格子：講者自己動不算）
  const mids = [...ft.mids, ft.tb, ft.ta, ...ft.after].filter((t, i, a) => a.indexOf(t) === i && t > ft.pre && t < ft.post);
  let best = null;
  const hot = [];
  for (const t of mids) {
    const f = get(t);
    if (!f) continue;
    const hit = [];
    let up = 0, flatBoth = 0;
    for (const i of used) {
      if (Math.min(A.sd[i], B.sd[i]) >= SEAM.flatSd) continue;
      const lo = Math.min(A.m[i], B.m[i]) - SEAM.tol, hi = Math.max(A.m[i], B.m[i]) + SEAM.tol;
      if (f.m[i] > hi) up++; else if (f.m[i] >= lo) continue;
      hit.push(i);
      if (Math.max(A.sd[i], B.sd[i]) < SEAM.flatSd) flatBoth++;
    }
    const area = hit.length / N;
    if (area >= SEAM.flashArea / 2) hot.push(t);
    if (!best || area > best.area) best = { t, area, hit, up, flatBoth };
  }
  if (stats) stats.flash = best ? { area: r3(best.area), t: best.t } : null;
  if (best && best.area >= SEAM.flashArea) {
    out.push({
      code: 'seam-flash', t: seam.t, a: seam.a, b: seam.b, from: Math.min(...hot), to: Math.max(...hot), peak: best.t,
      area: r3(best.area), dir: best.up * 2 >= best.hit.length ? 'up' : 'down',
      reveal: best.flatBoth >= best.hit.length * 0.6, where: whereOf(best.hit, gw, gh),
    });
  }
  // seam-cut：換段那一格前是純色的底、後面變成有紋路的畫面（講者），而且之前 0.3 秒這些格子都沒動
  if (seam.cut && !out.length) {
    const fb = get(ft.tb), fa = get(ft.ta), fp = get(ft.gap);
    if (fb && fa && fp) {
      const hit = [];
      let sum = 0;
      for (const i of used) {
        if (fb.sd[i] >= SEAM.flatSd || fa.sd[i] < SEAM.textureSd) continue;
        if (Math.abs(fa.m[i] - fb.m[i]) <= SEAM.cutDelta) continue;
        if (Math.abs(fp.m[i] - fb.m[i]) > SEAM.tol / 2) continue;
        hit.push(i);
        sum += fb.m[i];
      }
      const area = hit.length / N;
      if (stats) stats.cut = r3(area);
      if (area >= SEAM.cutArea) {
        const lum = sum / hit.length;
        out.push({ code: 'seam-cut', t: seam.t, a: seam.a, b: seam.b, at: r3((ft.tb + ft.ta) / 2), area: r3(area), tone: lum < 70 ? '深色' : lum > 185 ? '淺色' : '有色', where: whereOf(hit, gw, gh) });
      }
    }
  }
  return out;
}

const pairOf = (f) => (f.a && f.b ? `${f.a}→${f.b}` : f.a ? `${f.a} 段尾` : `${f.b} 開頭`);
export function seamLine(f) {
  const pct = Math.round(f.area * 100);
  if (f.code === 'seam-cut') {
    return `⚠ ${f.a} 的${f.tone}底在 ${secLabel(f.t)}一格內消失、露出講者（${f.where}，約占 ${pct}%）→ 至少 0.3 秒淡出或擦開`;
  }
  const what = `${f.where}${f.dir === 'up' ? '變亮' : '變暗'}，約占 ${pct}%`;
  const fix = f.reveal ? '前後兩段同一個底色就讓底一直在，只淡出字和圖' : '退場從現在的樣子直接淡掉（壓暗的東西不要先變回全亮）；前後兩段同一個底色就讓底一直在，只淡出字和圖';
  return `⚠ ${pairOf(f)} ${secLabel(f.t)}換段前後畫面閃一下（${spanLabel(f.from, f.to)}，${what}）→ ${fix}`;
}

// ---------- 截圖 ----------

function compInfo(out) {
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const root = /<[^>]*data-composition-id="main"[^>]*>/.exec(html)?.[0] || '';
  const num = (k, d) => { const m = new RegExp(`${k}="([\\d.]+)"`).exec(root); return m ? Number(m[1]) : d; };
  let cap = '';
  try { cap = fs.readFileSync(path.join(out, 'compositions', 'captions.html'), 'utf8'); } catch { /* 沒有字幕 */ }
  const W = num('data-width', 1920), H = num('data-height', 1080);
  return { W, H, fps: num('data-fps', 30), band: cap ? captionBand(cap, W, H) : null };
}

function runAsync(cmd, args, { cwd, timeout, binary = false }) {
  return new Promise((resolve) => {
    const cp = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const out = [], err = [];
    let killed = false;
    const timer = timeout ? setTimeout(() => { killed = true; try { cp.kill('SIGKILL'); } catch { /* 已經結束 */ } }, timeout) : null;
    cp.stdout.on('data', (d) => out.push(d));
    cp.stderr.on('data', (d) => err.push(d));
    cp.once('error', (e) => { clearTimeout(timer); resolve({ status: 1, stdout: '', stderr: e.message, killed }); });
    cp.once('close', (status) => { clearTimeout(timer); const o = Buffer.concat(out); resolve({ status, stdout: binary ? o : o.toString(), stderr: Buffer.concat(err).toString(), killed }); });
  });
}

// 一塊一個 snapshot 行程（各自開 Chrome）；回傳 Map(秒 → PNG 絕對路徑)。逾時、失敗的那一塊就沒有
async function snapshotTimes(out, times, { jobs, deadline, dir }) {
  const sorted = [...new Set(times)].sort((a, b) => a - b);
  const k = Math.max(1, Math.min(jobs, sorted.length));
  const size = Math.ceil(sorted.length / k);
  const chunks = Array.from({ length: k }, (_, i) => sorted.slice(i * size, (i + 1) * size)).filter((c) => c.length);
  const got = new Map();
  await Promise.all(chunks.map(async (chunk, i) => {
    const left = deadline - Date.now();
    if (left < SEAM.startSec * 1000) return;
    const sub = `${dir}/p${i}`;
    const r = await runAsync(process.execPath, hfArgs(['snapshot', '--at', chunk.join(','), '--no-end', '--keep', '-o', sub, '--json']), { cwd: out, timeout: left });
    let j = null;
    try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { /* 下面當成沒有 */ }
    for (const f of j?.frames || []) {
      const p = path.resolve(out, f.path);
      if (fs.existsSync(p)) got.set(r3(Number(f.time)), p);
    }
  }));
  return got;
}

async function gridsOf(files, W, H) {
  const w = Math.floor(W / SEAM.scale), h = Math.floor(H / SEAM.scale);
  const entries = [...files.entries()];
  const grids = await pool(entries, Math.max(2, Math.min(6, os.cpus().length)), async ([t, f]) => {
    const r = await runAsync('ffmpeg', ['-v', 'error', '-i', f, '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { binary: true });
    return [t, r.status === 0 ? r.stdout : null];
  });
  return grids;
}

// ---------- 快取：同一個換段（前後段內容、時間都沒變）沿用上次的結果 ----------

function seamKeys(P, items, seams) {
  try {
    const state = captureState(P, { hf: hfLocal()?.version ?? '?' });
    const h = reviewHashes(state, items, { extra: { seam: SEAM } });
    if (!h) return null;
    return new Map(seams.map((m) => [m, sha(JSON.stringify([h.global, m.t, m.a, m.a ? h.segs[m.a] : null, m.b, m.b ? h.segs[m.b] : null]))]));
  } catch { return null; }
}

// 量哪幾個：先量有自己的底（內容設計動畫、整張幕）的換段，再照時間；預算不夠的留給下次
const weight = (m, byId) => [m.a, m.b].reduce((s, id) => { const x = byId.get(id); return s + (!x ? 0 : x.type === 'custom' ? 2 : x.opaque ? 1 : 0); }, 0);

// ---------- 主流程 ----------

export async function checkSeams(P, { only = null, budget = SEAM.budget, jobs = SEAM.jobs, cache = true, items = null, filmEnd = null, template = null, debug = false } = {}) {
  const t0 = Date.now();
  const res = { lines: [], findings: [], total: 0, measured: 0, cached: 0, skipped: 0, seconds: 0 };
  if (!items) {
    const { checkProject } = await import('./check-project.mjs');
    const j = checkProject(P.project, template ? { template } : {});
    if (!j?.ok) return { ...res, error: '檢查沒過，換段不量' };
    items = j.items || [];
  }
  if (!fs.existsSync(path.join(P.out, 'index.html'))) return { ...res, error: '還沒 build（沒有 index.html）' };
  const info = compInfo(P.out);
  const lastEnd = filmEnd ?? Math.max(0, ...items.map((x) => x?.out?.end ?? 0));
  const seams = seamList(items, { filmEnd: lastEnd, only });
  res.total = seams.length;
  if (!seams.length) return res;
  const cacheFile = path.join(P.project, CACHE);
  const store = cache ? readJson(cacheFile, {}) : {};
  const keys = cache ? seamKeys(P, items, seams) : null;
  const done = [], todo = [];
  for (const m of seams) {
    const hit = keys && store[keys.get(m)];
    if (hit) { done.push(...hit); res.cached++; } else todo.push(m);
  }
  // 預算：每個行程開頭約 5 秒，之後一格約 0.8 秒；幾個行程同時跑
  const byId = new Map(items.map((x) => [x.id, x]));
  const order = [...todo].sort((p, q) => weight(q, byId) - weight(p, byId) || p.t - q.t);
  const nJobs = Math.max(1, Math.min(jobs, Math.floor(os.cpus().length / 2) || 1));
  const room = Math.max(0, Math.floor(((budget - SEAM.startSec) * nJobs) / SEAM.secPerFrame));
  const pick = [];
  let frames = 0;
  for (const m of order) {
    const n = allTimes(frameTimes(m.t, info.fps, lastEnd)).length;
    if (frames + n > room && pick.length) continue;
    pick.push(m);
    frames += n;
  }
  res.skipped = todo.length - pick.length;
  const fresh = new Map();
  if (pick.length) {
    const dir = `.seam-shots-${process.pid}`;
    const abs = path.join(P.out, dir);
    try {
      const fts = new Map(pick.map((m) => [m, frameTimes(m.t, info.fps, lastEnd)]));
      const shots = await snapshotTimes(P.out, [...fts.values()].flatMap(allTimes), { jobs: nJobs, deadline: t0 + budget * 1000 + 30000, dir });
      const raw = await gridsOf(shots, info.W, info.H);
      const w = Math.floor(info.W / SEAM.scale), h = Math.floor(info.H / SEAM.scale);
      const grids = new Map(raw.filter(([, b]) => b && b.length >= w * h).map(([t, b]) => [t, gridOf(b, w, h)]));
      const { mask } = maskOf(info.W, info.H, info.band);
      for (const [m, ft] of fts) {
        if (!allTimes(ft).every((t) => grids.has(t))) { res.skipped++; continue; }
        const st = debug ? {} : null;
        const f = analyzeSeam(m, grids, mask, ft, st);
        if (st) (res.debug ||= []).push({ ...m, ...st });
        fresh.set(m, f);
        res.measured++;
        done.push(...f);
      }
    } finally { fs.rmSync(abs, { recursive: true, force: true }); }
  }
  if (cache && keys && fresh.size) {
    for (const [m, f] of fresh) store[keys.get(m)] = f;
    // 只留這次還在的換段（舊的鍵不會再對到）
    const live = new Set(seams.map((m) => keys.get(m)));
    for (const k of Object.keys(store)) if (!live.has(k)) delete store[k];
    try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, `${JSON.stringify(store)}\n`); } catch { /* 記不下來只是下次重量 */ }
  }
  res.findings = done.sort((p, q) => p.t - q.t);
  res.lines = res.findings.map(seamLine);
  res.seconds = Math.round((Date.now() - t0) / 100) / 10;
  return res;
}

// 摘要那一行：量了幾個、沿用幾個、沒量到幾個
export function seamSummary(r) {
  if (r.error) return `換段：沒有量（${r.error}）`;
  if (!r.total) return '';
  const parts = [`${r.total} 個`];
  if (r.cached) parts.push(`沿用上次 ${r.cached}`);
  if (r.measured) parts.push(`這次量 ${r.measured}（${r.seconds} 秒）`);
  if (r.skipped) parts.push(`沒量到 ${r.skipped}（超過時間上限，下次接著量）`);
  return `換段：${parts.join('、')}；閃一下、硬切 ⚠ ${r.findings.length}`;
}

const SELF = fileURLToPath(import.meta.url);
const cliArgs = (P, extra, template) => [SELF, '--project', P.project, ...(template ? ['--template', template] : P.templateArg || []), ...extra, '--json'];
const parseOut = (s) => { try { return JSON.parse(String(s).slice(String(s).indexOf('{'))); } catch { return null; } };

// versions.mjs finish（同步）：只量這一輪改到的段前後的換段。量不了（沒有 hyperframes、還沒 build、逾時）回 []，不擋 finish
export function seamsSync(P, ids, { budget = SEAM.finishBudget, template = null } = {}) {
  if (!ids?.length || !fs.existsSync(path.join(P.out || '', 'index.html')) || !hfLocal()?.cli) return [];
  const r = spawnSync(process.execPath, cliArgs(P, ['--only', ids.join(','), '--budget', String(budget)], template), { encoding: 'utf8', timeout: (budget + 60) * 1000, maxBuffer: 1 << 26 });
  const j = parseOut(r.stdout);
  return j?.lines || [];
}

// build --review（非同步，和 audit、拼圖一起跑）：全片，有時間上限；回傳要印的行（⚠ 和一行摘要）
export function seamsLines(P, { budget = SEAM.budget } = {}) {
  if (!fs.existsSync(path.join(P.out || '', 'index.html')) || !hfLocal()?.cli) return Promise.resolve([]);
  return runAsync(process.execPath, cliArgs(P, ['--budget', String(budget)]), { timeout: (budget + 90) * 1000 }).then((r) => {
    const j = parseOut(r.stdout);
    if (!j) return [];
    const sum = seamSummary(j);
    return [...j.lines, ...(sum ? [sum] : [])];
  });
}

// ---------- CLI ----------

async function main(argv) {
  const { pathsFrom } = await import('./project.mjs');
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    if (['json', 'no-cache', 'debug'].includes(k)) flags[k] = true; else flags[k] = v ?? argv[++i];
  }
  const P = pathsFrom(flags);
  const r = await checkSeams(P, {
    template: flags.template ? path.resolve(flags.template) : null,
    debug: !!flags.debug,
    only: flags.only ? String(flags.only).split(',').map((s) => s.trim()).filter(Boolean) : null,
    budget: flags.budget ? Number(flags.budget) : SEAM.budget,
    jobs: flags.jobs ? Number(flags.jobs) : SEAM.jobs,
    cache: !flags['no-cache'],
  });
  if (flags.json) { console.log(JSON.stringify(r)); return; }
  for (const l of r.lines) console.log(l);
  const s = seamSummary(r);
  if (s) console.log(s);
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });

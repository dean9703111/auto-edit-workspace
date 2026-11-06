#!/usr/bin/env node
/**
 * 剪輯：在瀏覽器裡裁剪、調聲音、改字幕和卡片文字、設轉場，存回 plan.json／rough.srt（給使用者與 AI 的說明：shared/template/EDITOR.md）
 *
 *   node shared/template/tools/editor.mjs --project projects/<專案>   啟動並印出網址（只綁 127.0.0.1；預設 port 4400，被佔用就往後找）
 *                                      同一個服務有四頁：剪輯 /（停點 ⑤；加 ?view=final 直接開在完成影片預覽＝停點 ④）、剪輯清單 /cuts（停點 ①）、構圖 /framing（停點 ②）、分鏡表 /storyboard（停點 ③）
 *                                      非互動的 shell（AI 執行）會自己轉到背景：印出網址就結束，不用加 & 或 nohup；
 *                                      在終端機裡執行則留在前景，按 Ctrl+C 關閉
 *   node shared/template/tools/editor.mjs --status [--project …]   查剪輯開著沒、網址是什麼
 *   node shared/template/tools/editor.mjs --stop [--project …]     關掉剪輯
 *   node shared/template/tools/editor.mjs --project … --requests-state generating --request-revision <版本> --ids s01,x02
 *                                      AI 逐段回報生成狀態；完成用 done（build、audit 後），失敗用 failed --message <原因>
 *   node shared/template/tools/editor.mjs --project … --design-request <需求 id> --design-state generating
 *                                      AI 背景生圖狀態；九張存檔後用 done，失敗用 failed --message <原因>，查詢用 --design-state status
 *
 * 選項：--port 4400、--open（順便開瀏覽器）、--foreground（一律前景）、--background（一律背景）；測試用：--template <shared/template 資料夾>
 * 剪輯只寫：plan.json 的 edit、media 段的 enter／exit／volume／from／to／in／anchor、任何段的 sfxVolume 與 sfx: null、
 * slots／vars 的文字值、第一層的 look（講者調光與瘦臉）、theme 與 frame（構圖：/framing 拖框；換框時 speakerBox、pipCrop 跟著換算），以及 work/rough.srt（字幕文字、時間、增刪；增刪時 plan.json 的句號一起重新對應）。
 * 剪輯清單頁只寫 work/cuts.md NG 表的「剪」欄（[x]／[ ]；沒有這一欄就加在最前面），有 work/rough.mp4 之後只能看。
 * 分鏡表頁只寫 work/storyboard.md 改到的那幾行（段落內容、表格的格與列、整段原始 Markdown）；製作進度的停點 ③ 通過之後只能看。
 * 存檔前比對 plan.json 與 rough.srt，被別人（AI）改過就兩個都不寫。構圖在還沒有 plan.json 時（停點 ②）只存 frame，會先建一個 { "version": 1 }（直式加 format）。
 * --project 的找法和 build.mjs 一樣。需要 Node 22 以上、ffmpeg／ffprobe。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathsFrom } from './build.mjs';
import { LIMITS, defaultEdit, sanitizeEdit, sanitizeSegments, applySave, writeSrt, parseSrtBlocks, visibleLen, resolveTime, checkSlots, checkVars } from './editor/server/write.mjs';
import * as subtitles from './editor/subtitles.mjs';
import { ensureLook, resolveLook, readKitLook, readState, statePaths, faceImage, lookNeedsRun, LOOK_LIMITS, isRunning, ensureBlendedLut, lookNextStep } from './lib/look.mjs';
import { footageVf, lut3dFilter } from './lib/ff.mjs';
import { CANVAS } from './lib/canvas.mjs';
import { resolveFormat, canvasOf } from './lib/canvas.mjs';
import { mediaFrame, SIDE } from './lib/media.mjs';
import { cutsState, saveCuts } from './editor/server/cuts.mjs';
import { storyboardState, saveStoryboard, storyboardImage } from './editor/server/storyboard.mjs';
import { startExport, cancelExport, exportState, exportBusy, exportFile } from './editor/server/export.mjs';
import { designState, designAsset, designPreviews, setDesignColor, uploadDesign, prepareDesignRequest, importDesignCandidate, restoreOriginalBackground, candidateAsset, applyDesign, discardDesign, removeReference, designRequestStatus, setDesignRequestStatus } from './editor/server/design.mjs';

export { LIMITS, defaultEdit, sanitizeEdit, sanitizeSegments, applySave, writeSrt, parseSrtBlocks, visibleLen, resolveTime, checkSlots, checkVars, subtitles };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(HERE, 'editor');
const BUILD = path.join(HERE, 'build.mjs');
const LOOK = path.join(HERE, 'look.mjs');
const AUDIT = path.join(HERE, 'audit.mjs');
const DEFAULT_PORT = 4400;
const PORT_TRIES = 20;
const PEAK_RATE = 100;          // 波形：每秒 100 個峰值
const PEAK_SR = 8000;           // 算波形時先降到 8 kHz 單聲道
const TARGET_LUFS = -14;        // 人聲標準化的目標響度
const THUMB_W = 160, THUMB_H = 90, THUMB_MAX = 400;   // 縮圖條：每格 160×90，一支影片最多 400 格
const VALUE_FLAGS = ['project', 'port', 'template', 'requests-state', 'request-revision', 'ids', 'message', 'round', 'design-state', 'design-request'];
const BOOL_FLAGS = ['stop', 'status', 'open', 'foreground', 'background', 'help'];

const r3 = (n) => +Number(n).toFixed(3);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const posix = (p) => p.split(path.sep).join('/');

// 只在啟動時記下已載入的後端版本；重複開啟時不沿用載著舊程式的服務。
export function editorRevision() {
  const files = [fileURLToPath(import.meta.url), BUILD, LOOK, path.join(HERE, 'brand.mjs'), path.join(HERE, 'caps.mjs'), path.join(HERE, 'media.mjs'),
    ...['lib', 'editor/server'].flatMap((dir) => fs.readdirSync(path.join(HERE, dir)).filter((f) => f.endsWith('.mjs')).sort().map((f) => path.join(HERE, dir, f))),
    path.join(UI_DIR, 'subtitles.mjs'), path.join(UI_DIR, 'text.mjs'), path.join(UI_DIR, 'storyboard-md.mjs')];
  const hash = crypto.createHash('sha256');
  for (const file of files) hash.update(path.relative(HERE, file)).update(fs.readFileSync(file));
  return hash.digest('hex').slice(0, 16);
}
export const SERVER_REVISION = editorRevision();

export function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`看不懂的參數「${a}」（用 --help 看用法）`);
    const eq = a.indexOf('=');
    const k = eq > 0 ? a.slice(2, eq) : a.slice(2);
    const inline = eq > 0 ? a.slice(eq + 1) : undefined;
    if (VALUE_FLAGS.includes(k)) {
      const v = inline ?? argv[++i];
      if (v == null) throw new Error(`--${k} 後面要接值`);
      flags[k] = v;
    } else if (BOOL_FLAGS.includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數（用 --help 看用法）`);
  }
  if (flags.port != null) {
    const p = Number(flags.port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error(`--port 要是 1–65535 的整數，現在是「${flags.port}」→ 例如 --port 4400`);
    flags.port = p;
  }
  return flags;
}

// ---------- 讀檔 ----------

function statOf(f) { try { return fs.statSync(f); } catch { return null; } }
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }

function readPlan(file) {
  const st = statOf(file);
  if (!st) return { exists: false, mtime: null, hash: null, data: null, error: null };
  const text = fs.readFileSync(file, 'utf8');
  let data = null, error = null;
  try { data = JSON.parse(text); } catch (e) { error = `plan.json 不是合法的 JSON：${e.message}`; }
  return { exists: true, mtime: st.mtimeMs, hash: sha(text), text, data, error };
}

function readSrt(file) {
  const st = statOf(file);
  if (!st) return { exists: false, mtime: null, hash: null, text: null, eol: null, cues: [] };
  const text = fs.readFileSync(file, 'utf8');
  const P = parseSrtBlocks(text);
  return { exists: true, mtime: st.mtimeMs, hash: sha(text), text, eol: P.eol === '\r\n' ? 'CRLF' : 'LF', cues: P.blocks.map(({ n, start, end, text: t }) => ({ n, start, end, text: t })) };
}

// 播放用的影片：work/hyperframes/assets/rough.mp4（build 重新編碼過，30fps、每秒一個關鍵影格，拖曳比較順）比較新就用它，否則用 work/rough.mp4
function pickVideo(P) {
  const asset = path.join(P.out, 'assets', 'rough.mp4');
  const a = statOf(asset), w = statOf(P.video);
  if (a && (!w || a.mtimeMs >= w.mtimeMs)) return asset;
  return w ? P.video : null;
}

const probeCache = new Map();
export function probeVideo(file) {
  const st = statOf(file);
  if (!st) return null;
  const key = `${file}:${st.size}:${st.mtimeMs}`;
  if (probeCache.has(key)) return probeCache.get(key);
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,avg_frame_rate', '-of', 'json', file], { encoding: 'utf8' });
  if (r.error) throw new Error(r.error.code === 'ENOENT' ? '找不到 ffprobe → 先跑 npx hyperframes doctor 安裝 ffmpeg，或確認 ffprobe 在 PATH 裡' : r.error.message);
  let info;
  try { info = JSON.parse(r.stdout); } catch { throw new Error(`ffprobe 讀不到 ${file}：${String(r.stderr).trim().slice(0, 200)}`); }
  const v = (info.streams || []).find((s) => s.codec_type === 'video');
  const [fn, fd] = String(v?.avg_frame_rate || '30/1').split('/').map(Number);
  const fps = fn && fd ? Math.round((fn / fd) * 1000) / 1000 : 30;
  const out = {
    dur: r3(Number(info.format?.duration) || 0), width: v?.width ?? null, height: v?.height ?? null,
    fps: fps > 0 && fps < 241 ? fps : 30, hasAudio: (info.streams || []).some((s) => s.codec_type === 'audio'),
  };
  probeCache.set(key, out);
  return out;
}

// ---------- 波形（ffmpeg 解成 8 kHz 單聲道，每 1/100 秒取最大振幅，0–1000 整數）----------

export function computePeaks(file, { rate = PEAK_RATE } = {}) {
  return new Promise((resolve, reject) => {
    const per = Math.max(1, Math.round(PEAK_SR / rate));
    const p = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', String(PEAK_SR), '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1']);
    const peaks = [];
    let carry = null, n = 0, max = 0, err = '';
    p.stdout.on('data', (buf) => {
      if (carry) { buf = Buffer.concat([carry, buf]); carry = null; }
      const len = buf.length - (buf.length % 2);
      if (len < buf.length) carry = buf.subarray(len);
      for (let i = 0; i < len; i += 2) {
        const v = Math.abs(buf.readInt16LE(i));
        if (v > max) max = v;
        if (++n === per) { peaks.push(Math.min(1000, Math.round((max / 32768) * 1000))); n = 0; max = 0; }
      }
    });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => reject(e.code === 'ENOENT' ? new Error('找不到 ffmpeg → 先跑 npx hyperframes doctor 安裝 ffmpeg') : e));
    p.on('close', (code) => {
      if (n > 0) peaks.push(Math.min(1000, Math.round((max / 32768) * 1000)));
      if (code !== 0 && !peaks.length) reject(new Error(`讀不到影片的聲音：${err.trim().slice(0, 200) || `ffmpeg 結束碼 ${code}`}`));
      else resolve({ rate, peaks, scale: 1000 });
    });
  });
}

// ---------- 響度（ffmpeg ebur128）：量主軌整體響度，剪掉的範圍不算 ----------

export function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostdin', ...args]);
    let err = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 2e6) err = err.slice(-1e6); });
    p.stdout.resume();
    p.on('error', (e) => reject(e.code === 'ENOENT' ? new Error('找不到 ffmpeg → 先跑 npx hyperframes doctor 安裝 ffmpeg') : e));
    p.on('close', (code) => resolve({ code, stderr: err }));
  });
}

export function parseLoudness(stderr) {
  const s = String(stderr);
  const i = s.lastIndexOf('Summary:');
  const tail = i >= 0 ? s.slice(i) : s;
  const I = tail.match(/I:\s*(-?[\d.]+|-inf)\s*LUFS/);
  const peak = tail.match(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/);
  const lra = tail.match(/LRA:\s*(-?[\d.]+)\s*LU/);
  const num = (m) => (m && m[1] !== '-inf' ? Number(m[1]) : null);
  return { integrated: num(I), truePeak: num(peak), lra: num(lra) };
}

export async function measureLoudness(file, cuts = []) {
  const keep = cuts.filter((c) => Array.isArray(c) && isNum(c[0]) && isNum(c[1]) && c[1] > c[0]);
  const sel = keep.length ? `aselect='not(${keep.map(([a, b]) => `between(t\\,${r3(a)}\\,${r3(b)})`).join('+')})',asetpts=N/SR/TB,` : '';
  const r = await runFfmpeg(['-i', file, '-map', '0:a:0', '-af', `${sel}ebur128=peak=true`, '-f', 'null', '-']);
  const out = parseLoudness(r.stderr);
  if (r.code !== 0 || out.integrated == null) throw new Error(`量不到響度：${r.stderr.trim().split('\n').slice(-2).join(' ').slice(0, 200) || `ffmpeg 結束碼 ${r.code}`}`);
  return out;
}

// ---------- 縮圖條（ffmpeg 抽格拼成一張 sprite，快取在 .editor/thumbs/）----------

// 每格的比例跟影片走（009 FR-120）：直拍 90×160，其他 160×90
export function thumbPlan(dur, { width = 16, height = 9 } = {}) {
  const interval = Math.max(1, Math.ceil((dur || 1) / THUMB_MAX));
  const count = Math.max(1, Math.ceil((dur || 1) / interval));
  const cols = Math.min(count, 20);
  const tall = height > width;
  return { interval, count, cols, rows: Math.ceil(count / cols), w: tall ? THUMB_H : THUMB_W, h: tall ? THUMB_W : THUMB_H };
}

async function makeThumbs(file, outFile, dur, dims) {
  const t = thumbPlan(dur, dims ?? undefined);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const tmp = `${outFile}.${process.pid}.tmp.jpg`;
  const vf = `fps=1/${t.interval}:round=down,scale=${t.w}:${t.h}:force_original_aspect_ratio=decrease,pad=${t.w}:${t.h}:(ow-iw)/2:(oh-ih)/2:color=black,tile=${t.cols}x${t.rows}`;
  const r = await runFfmpeg(['-y', ...(dur > 120 ? ['-skip_frame', 'nokey'] : []), '-i', file, '-an', '-vf', vf, '-frames:v', '1', '-q:v', '6', tmp]);
  if (r.code !== 0 || !statOf(tmp)) throw new Error(`做不出縮圖：${r.stderr.trim().split('\n').slice(-1)[0]?.slice(0, 200) || r.code}`);
  fs.renameSync(tmp, outFile);
  return t;
}

// ---------- 子處理程序：build.mjs ----------

function runNode(args, { cwd, onData } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }, windowsHide: true });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; onData?.(String(d)); });
    p.stderr.on('data', (d) => { stderr += d; onData?.(String(d)); });
    p.on('error', (e) => resolve({ code: -1, stdout, stderr: stderr + e.message }));
    p.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

export function issuesFromText(text) {
  const errors = [], warnings = [];
  for (const l of String(text).split(/\r?\n/)) {
    const s = l.trim();
    if (s.startsWith('✖')) errors.push(s.replace(/^✖\s*/, ''));
    else if (s.startsWith('⚠')) warnings.push(s.replace(/^⚠\s*/, ''));
  }
  return { errors, warnings };
}

// 降級用：build.mjs 還不支援 --json 時，從文字報告的表格（id｜情境｜起–迄｜長度｜音效時間｜警告）抓段落位置
export function itemsFromText(text, plan) {
  const segs = new Map((Array.isArray(plan?.scenes) ? plan.scenes : []).filter((x) => isObj(x) && x.id).map((x) => [String(x.id), x]));
  const sec = (m) => { const [mm, ss] = m.split(':'); return r3(Number(mm) * 60 + Number(ss)); };
  const items = [];
  for (const l of String(text).split(/\r?\n/)) {
    const m = l.match(/^\s*([^｜\s]+)｜([^｜]*)｜(\d+:\d+(?:\.\d+)?)–(\d+:\d+(?:\.\d+)?)｜[^｜]*｜[^｜]*｜?\s*(.*)$/);
    if (!m || !segs.has(m[1])) continue;
    const seg = segs.get(m[1]);
    const w = (m[5].match(/⚠\s*(\d+)/) || [])[1];
    // 有 edit.cuts 時表格是完成影片時間，rough 時間寫在「（rough 0:04.50–0:11.00）」裡；剪輯要的是 rough 時間
    const rough = l.match(/rough\s*(\d+:\d+(?:\.\d+)?)–(\d+:\d+(?:\.\d+)?)/);
    const [a, b] = rough ? [rough[1], rough[2]] : [m[3], m[4]];
    items.push({ id: m[1], type: seg.type ?? 'scene', label: m[2].trim(), start: sec(a), end: sec(b), warnings: w ? Number(w) : 0, ...(seg.src ? { src: seg.src } : {}) });
  }
  return items;
}

export function parseReport(stdout) {
  const s = String(stdout).trim();
  const tryParse = (x) => { try { const o = JSON.parse(x); return isObj(o) ? o : null; } catch { return null; } };
  let o = tryParse(s);
  if (!o) { const i = s.indexOf('{'), j = s.lastIndexOf('}'); if (i >= 0 && j > i) o = tryParse(s.slice(i, j + 1)); }
  return o && ('ok' in o || 'items' in o || 'errors' in o) ? o : null;
}

// ---------- HyperFrames 播放器（hyperframes-player＋runtime）：用工作區 node_modules 那一份（package.json 釘的版本），複製到 .editor/player/ ----------
// 不去 npx 快取挑最新版：快取裡常有別的版本，預覽會和 render 不一樣

export function findPlayer({ roots = [] } = {}) {
  for (const r of roots) {
    const nm = path.join(r, 'node_modules');
    const cand = [
      { player: path.join(nm, 'hyperframes', 'dist', 'hyperframes-player.global.js'), runtime: path.join(nm, 'hyperframes', 'dist', 'hyperframe.runtime.iife.js'), pkg: path.join(nm, 'hyperframes', 'package.json') },
      { player: path.join(nm, '@hyperframes', 'player', 'dist', 'hyperframes-player.global.js'), runtime: path.join(nm, '@hyperframes', 'core', 'dist', 'hyperframe.runtime.iife.js'), pkg: path.join(nm, '@hyperframes', 'player', 'package.json') },
    ];
    for (const c of cand) {
      if (statOf(c.player) && statOf(c.runtime)) return { ...c, version: readJson(c.pkg)?.version || '0.0.0' };
    }
  }
  return null;
}

function preparePlayer(ctx) {
  const dir = path.join(ctx.editorDir, 'player');
  const dst = { player: path.join(dir, 'hyperframes-player.global.js'), runtime: path.join(dir, 'hyperframe.runtime.iife.js'), info: path.join(dir, 'version.json') };
  try {
    const src = findPlayer({ roots: [ctx.P.root, ctx.P.out, ctx.P.project] });
    const have = readJson(dst.info);
    if (src && (!have || src.version !== have.version || !statOf(dst.player) || !statOf(dst.runtime))) {   // 版本不同就換（升級、降級都換）
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(src.player, dst.player);
      fs.copyFileSync(src.runtime, dst.runtime);
      fs.writeFileSync(dst.info, JSON.stringify({ version: src.version, from: path.dirname(src.player) }, null, 2) + '\n');
    }
    const info = readJson(dst.info);
    if (statOf(dst.player) && statOf(dst.runtime)) return { available: true, version: info?.version ?? null, file: dst.player, runtime: dst.runtime };
  } catch (e) {
    return { available: false, reason: `複製 HyperFrames 播放器失敗：${e.message}` };
  }
  return { available: false, reason: '找不到 HyperFrames 播放器（工作區的 node_modules/hyperframes）→ 在工作區根目錄跑 npm install，再重開剪輯' };
}

// ---------- HTTP ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.srt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};
const mimeOf = (f) => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

function safeJoin(base, rel) {
  const f = path.resolve(base, '.' + path.sep + rel);
  return f === base || f.startsWith(base + path.sep) ? f : null;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

// 靜態檔：支援 Range（<video> 拖曳要用）、ETag
export function sendFile(req, res, file, { type = mimeOf(file), transform = null } = {}) {
  const st = statOf(file);
  if (!st || !st.isFile()) return sendText(res, 404, '找不到檔案');
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}${transform ? '-t' : ''}"`;
  const base = { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: etag, 'Last-Modified': st.mtime.toUTCString() };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, base); return res.end(); }
  if (transform) {
    const body = Buffer.from(transform(fs.readFileSync(file, 'utf8')));
    res.writeHead(200, { ...base, 'Content-Length': body.length });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  const size = st.size;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    let start, end;
    if (m && (m[1] !== '' || m[2] !== '')) {
      if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
      else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
    }
    if (start == null || start > end || start >= size) {
      res.writeHead(416, { ...base, 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...base, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...base, 'Accept-Ranges': 'bytes', 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function injectRuntime(html) {
  const tag = '<script src="/hf/runtime.js"></script>';
  const h = html.match(/<head\b[^>]*>/i);
  if (h) return html.slice(0, h.index + h[0].length) + tag + html.slice(h.index + h[0].length);
  const x = html.match(/<html\b[^>]*>/i);
  return x ? html.slice(0, x.index + x[0].length) + tag + html.slice(x.index + x[0].length) : tag + html;
}

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('送來的資料太大'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s.trim()) return resolve({});
      try { resolve(JSON.parse(s)); } catch (e) { reject(Object.assign(new Error(`送來的不是合法的 JSON：${e.message}`), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

export function listenOnFreePort(server, start = DEFAULT_PORT, host = '127.0.0.1', tries = PORT_TRIES) {
  return new Promise((resolve, reject) => {
    let port = start;
    const attempt = () => {
      const onErr = (e) => {
        server.off('listening', onOk);
        if (e.code === 'EADDRINUSE' && port < Math.min(65535, start + tries - 1)) { port++; attempt(); }
        else reject(e.code === 'EADDRINUSE' ? new Error(`port ${start}–${port} 都被佔用了 → 加 --port 換一個，例如 --port 5400`) : e);
      };
      const onOk = () => { server.off('error', onErr); resolve(server.address().port); };
      server.once('error', onErr);
      server.once('listening', onOk);
      server.listen(port, host);
    };
    attempt();
  });
}

// ---------- 剪輯本體 ----------

function makeContext(P) {
  const work = path.join(P.project, 'work');
  return {
    P, work, editorDir: path.join(P.out, '.editor'),
    cutpointsFile: path.join(work, 'cutpoints.json'), mainJson: path.join(work, 'main.json'),
    stateFile: path.join(P.out, '.editor', 'server.json'), memoryFile: path.join(P.out, '.editor', 'memory.json'),
    schema: null, schemaJob: null, thumbs: new Map(), loud: new Map(),
    token: crypto.randomBytes(16).toString('hex'),
    port: null, url: null, player: { available: false, reason: '還沒檢查' },
    report: null, reportJob: null, peaks: null, peaksJob: null,
    build: { running: false, log: '', code: null, ok: null, startedAt: null, finishedAt: null },
    framingUpdate: null, framingJob: null, framingPending: false,
    exportJob: null, exportDeps: null,
    onShutdown: null,
  };
}

const relRoot = (ctx, f) => posix(path.relative(ctx.P.root, f));

function readCutpoints(file) {
  const j = readJson(file);
  const list = Array.isArray(j?.cuts) ? j.cuts : Array.isArray(j) ? j : [];
  return list.filter((c) => isObj(c) && isNum(c.at)).map((c) => ({ at: r3(c.at), kind: c.kind === 'ng' ? 'ng' : 'pause' }));
}

function reportKey(ctx) {
  const P = ctx.P;
  const parts = [P.plan, P.srt, P.video, path.join(P.out, 'assets', 'rough.mp4'), ctx.cutpointsFile, ctx.mainJson, BUILD, path.join(path.dirname(BUILD), 'lib', 'plan.mjs'),
    statePaths(P.project).state, path.join(P.templateDir, 'kit', 'look.json')]
    .map((f) => { const s = statOf(f); return s ? `${s.size}:${s.mtimeMs}` : '-'; });
  return parts.join('|');
}

async function getReport(ctx, { fresh = false } = {}) {
  const key = reportKey(ctx);
  if (!fresh && ctx.report && ctx.report.key === key) return ctx.report;
  if (ctx.reportJob && ctx.reportJob.key === key) return ctx.reportJob.promise;
  const P = ctx.P;
  const promise = (async () => {
    if (!statOf(P.plan)) return { key, report: null, error: `找不到 ${relRoot(ctx, P.plan)} → 請 AI 先寫 plan.json（格式見 shared/template/USAGE.md）`, issues: { errors: [], warnings: [] } };
    const r = await runNode([BUILD, '--project', P.project, '--template', P.templateDir, '--check', '--json'], { cwd: P.root });
    const report = parseReport(r.stdout);
    const text = `${r.stdout}\n${r.stderr}`;
    if (report) return { key, report, error: null, issues: { errors: report.errors || [], warnings: report.warnings || [] } };
    const items = itemsFromText(r.stdout, readPlan(P.plan).data);
    return {
      key, report: null, fallback: items.length ? { items } : null, log: text.trim().slice(-4000), issues: issuesFromText(text),
      error: 'build.mjs --check --json 沒有回傳報告（build.mjs 可能還沒更新到支援 --json，或檢查途中出錯）→ 段落位置暫時看不到；按「重新產生」看完整訊息，或請 AI 跑 build',
    };
  })();
  ctx.reportJob = { key, promise };
  const res = await promise;
  if (ctx.reportJob?.promise === promise) ctx.reportJob = null;
  if (reportKey(ctx) === key) ctx.report = res;
  return res;
}

async function getPeaks(ctx) {
  const file = pickVideo(ctx.P);
  if (!file) return { rate: PEAK_RATE, peaks: [], scale: 1000, error: '找不到 rough.mp4' };
  const st = statOf(file);
  const meta = { src: relRoot(ctx, file), size: st.size, mtimeMs: st.mtimeMs };
  const cacheFile = path.join(ctx.editorDir, 'waveform.json');
  if (ctx.peaks && ctx.peaks.src === meta.src && ctx.peaks.size === meta.size && ctx.peaks.mtimeMs === meta.mtimeMs) return ctx.peaks;
  const disk = readJson(cacheFile);
  if (disk && disk.src === meta.src && disk.size === meta.size && disk.mtimeMs === meta.mtimeMs && Array.isArray(disk.peaks)) return (ctx.peaks = disk);
  const jobKey = `${meta.src}:${meta.size}:${meta.mtimeMs}`;
  if (ctx.peaksJob?.key === jobKey) return ctx.peaksJob.promise;
  const promise = computePeaks(file).then((r) => {
    const data = { ...meta, ...r };
    try { fs.mkdirSync(ctx.editorDir, { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(data)); } catch { /* 快取寫不進去也沒關係 */ }
    ctx.peaks = data;
    return data;
  }, (e) => ({ ...meta, rate: PEAK_RATE, peaks: [], scale: 1000, error: e.message }));
  ctx.peaksJob = { key: jobKey, promise };
  const res = await promise;
  if (ctx.peaksJob?.promise === promise) ctx.peaksJob = null;
  return res;
}

// 情境與字卡動態的欄位定義（build.mjs --list --json）：屬性面板依它列文字欄位與字數上限
async function getSchema(ctx) {
  const P = ctx.P;
  const key = [BUILD, path.join(P.templateDir, 'scenes'), path.join(P.templateDir, 'fx', 'catalog.json')].map((f) => statOf(f)?.mtimeMs ?? '-').join('|');
  if (ctx.schema?.key === key) return ctx.schema;
  if (ctx.schemaJob?.key === key) return ctx.schemaJob.promise;
  const promise = runNode([BUILD, '--list', '--json', '--template', P.templateDir], { cwd: P.root }).then((r) => {
    let j = null;
    try { j = JSON.parse(r.stdout); } catch { j = null; }
    const data = j && Array.isArray(j.scenes) ? {
      key, error: null,
      scenes: j.scenes.map((x) => ({ key: x.key, no: x.no, num: x.num, dirName: x.dirName, zh: x.zh, aliases: x.aliases || [], slots: x.slots || {} })),
      fx: (j.fx || []).map((x) => ({ no: x.no, id: x.id, zh: x.zh, vars: x.vars || [] })),
      // 配樂（kind: "bgm"，例如 bgm-cylinder-five）不是音效，不列進音效清單
      sounds: Object.entries(j.sounds || {}).filter(([, v]) => v?.kind !== 'bgm').map(([k]) => k),
    } : { key, error: `讀不到 build.mjs --list --json（${(r.stderr || r.stdout).trim().slice(0, 200)}）→ 卡片文字欄位先用 plan.json 原本有的欄位`, scenes: [], fx: [], sounds: [] };
    ctx.schema = data;
    return data;
  });
  ctx.schemaJob = { key, promise };
  const res = await promise;
  if (ctx.schemaJob?.promise === promise) ctx.schemaJob = null;
  return res;
}

function readMemory(ctx) { const m = readJson(ctx.memoryFile); return isObj(m?.sfx) ? m.sfx : {}; }

// media 段素材的長度（拖曳裁剪時 in＋段長×速度不能超過它）
function mediaInfo(ctx, src) {
  if (!src) return null;
  const f = safeJoin(ctx.P.project, String(src));
  if (!f || !statOf(f)) return null;
  if (mediaKind(src) === 'image') return { dur: null, width: null, height: null };
  try { const v = probeVideo(f); return v ? { dur: v.dur, width: v.width, height: v.height, hasAudio: v.hasAudio } : null; } catch { return null; }
}

async function getThumbs(ctx, which) {
  const P = ctx.P;
  let file, name;
  if (which === 'main') { file = pickVideo(P); name = 'main'; }
  else {
    const seg = (readPlan(P.plan).data?.scenes || []).find((x) => isObj(x) && x.type === 'media' && x.id === which);
    if (!seg?.src || mediaKind(seg.src) === 'image') return { error: '沒有這支影片' };
    file = safeJoin(P.project, String(seg.src));
    name = `m-${sha(String(seg.src)).slice(0, 10)}`;
  }
  const st = file && statOf(file);
  if (!st) return { error: '找不到影片' };
  const pv = probeVideo(file), dur = pv?.dur || 0;
  const out = path.join(ctx.editorDir, 'thumbs', `${name}.jpg`);
  const metaFile = `${out}.json`;
  const sig = `${st.size}:${st.mtimeMs}`;
  const meta = readJson(metaFile);
  const ready = (m) => ({ ...m, url: `/editor-cache/thumbs/${name}.jpg?v=${sha(sig).slice(0, 8)}` });
  if (meta?.sig === sig && statOf(out)) return ready(meta);
  const job = ctx.thumbs.get(name);
  if (job?.sig === sig) return job.error ? { error: job.error } : { pending: true };
  const j = { sig, error: null };
  ctx.thumbs.set(name, j);
  makeThumbs(file, out, dur, pv?.width && pv?.height ? { width: pv.width, height: pv.height } : null).then((t) => {
    fs.writeFileSync(metaFile, JSON.stringify({ ...t, sig, dur }));
    ctx.thumbs.delete(name);
  }, (e) => { j.error = e.message; });
  return { pending: true };
}

function mediaKind(src) {
  const e = path.extname(String(src)).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(e) ? 'image' : 'video';
}

function builtInfo(ctx, plan) {
  const idx = statOf(path.join(ctx.P.out, 'index.html'));
  const design = statOf(path.join(ctx.P.project, 'work', 'design', 'applied.json'));
  return { built: !!idx, builtMtime: idx?.mtimeMs ?? null, stale: !!(idx && Math.max(plan.mtime || 0, design?.mtimeMs || 0) > idx.mtimeMs + 1) };
}

// 講者調光＋瘦臉（contracts/look.md §7.2）
function lookState(ctx, planData) {
  const P = ctx.P, plan = isObj(planData) ? planData : {};
  try {
    const kit = readKitLook(P.templateDir);
    const L = resolveLook({ plan, templateDir: P.templateDir });
    const lines = ensureLook({ projectDir: P.project, plan, templateDir: P.templateDir, strict: false }).report;
    let baked = null;
    if (pickVideo(P) === path.join(P.out, 'assets', 'rough.mp4')) {
      const k = readJson(path.join(P.out, '.cache', 'footage-audio.json'))?.key?.look;
      baked = isObj(k) ? { color: isNum(k.color) ? k.color : 0, slim: isNum(k.slim) ? k.slim : 0, beauty: isNum(k.beauty) ? k.beauty : 0 } : { color: 0, slim: 0, beauty: 0 };
    }
    const sum = readState(P.project).landmarks?.summary;
    return {
      kit: { color: kit.color, slim: kit.slim, beauty: kit.beauty }, plan: plan.look === undefined ? null : plan.look,
      effective: { color: L.color, slim: L.slim, beauty: L.beauty, source: L.source }, baked,
      limits: { color: LOOK_LIMITS.color, slim: LOOK_LIMITS.slim, beauty: LOOK_LIMITS.beauty, step: LOOK_LIMITS.step },
      landmarks: sum ? { ready: true, rate: sum.rate, medianFaceWidth: sum.medianFaceWidth, slimOk: sum.slimOk !== false, reason: sum.reason ?? null } : { ready: false },
      lines,
    };
  } catch (e) { return { error: e.message, limits: { color: LOOK_LIMITS.color, slim: LOOK_LIMITS.slim, beauty: LOOK_LIMITS.beauty, step: LOOK_LIMITS.step } }; }
}

// 構圖的瘦臉進度（打開瘦臉才偵測：按「偵測臉部」→ POST /api/look/run，之後每 2 秒 GET /api/look/status）
const LOOK_PHASE = { locate: '找臉', detect: '偵測臉部', render: '套用瘦臉、美顏', preview: '畫對照圖' };
function lookRunState(ctx) {
  const P = ctx.P, st = readState(P.project), run = st.run || null, running = isRunning(st);
  const plan = readPlan(P.plan).data;
  let line = '';
  if (running) {
    const p = run.total ? Math.floor((run.done / run.total) * 100) : 0;
    line = `${LOOK_PHASE[run.phase] || run.phase} ${p}%，剩約 ${Math.ceil((run.etaSec || 0) / 60)} 分`;
  } else if (run?.phase === 'failed') line = `上次失敗：${run.error}`;
  let next = null;
  try { next = lookNextStep({ projectDir: P.project, plan: isObj(plan) ? plan : {}, templateDir: P.templateDir }).note; } catch { next = null; }
  return { running, phase: run?.phase ?? null, line, next, look: lookState(ctx, plan) };
}
async function doLookRun(ctx) {
  const P = ctx.P;
  if (isRunning(readState(P.project))) return [200, { ok: true, already: true, ...lookRunState(ctx) }];
  const plan = readPlan(P.plan).data;
  const L = resolveLook({ plan: isObj(plan) ? plan : {}, templateDir: P.templateDir });
  if (!(L.slim > 0 || L.beauty > 0)) return [400, { error: 'noslim', message: '瘦臉、美顏都是關的，不用偵測 → 先打開瘦臉或美顏並儲存，再按「偵測臉部」' }];
  const r = await runNode([LOOK, 'run', '--project', P.project, '--template', P.templateDir, '--background'], { cwd: P.root });
  if (r.code !== 0) return [500, { error: 'look', message: (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join('\n') || `look.mjs run 結束碼 ${r.code}` }];
  return [200, { ok: true, ...lookRunState(ctx) }];
}

// 預覽參考圖（構圖「用這一格當預覽參考圖」）：rough.mp4 的第 t 秒，照構圖框裁切、縮放到畫布、套調光
//   → shared/template/preview/speaker-local.jpg（直式 speaker-v-local.jpg）。情境庫、風格預覽頁的講者改用它（kit/style-switch.js）；不進版控、不上官網
const refFile = (ctx, format) => path.join(ctx.previewDir || path.join(ctx.P.templateDir, 'preview'), format === 'portrait' ? 'speaker-v-local.jpg' : 'speaker-local.jpg');
function refInfo(ctx, format) {
  const f = refFile(ctx, format), st = statOf(f);
  return { exists: !!st, file: relRoot(ctx, f), mtime: st?.mtimeMs ?? null };
}
async function doRefFrame(ctx, body) {
  const P = ctx.P, src = path.join(P.project, 'work', 'rough.mp4');
  if (!statOf(src)) return [404, { error: 'novideo', message: `找不到 ${relRoot(ctx, src)}` }];
  const t = Number(body?.t), color = Number(body?.color ?? 0);
  if (!(t >= 0)) return [400, { error: 'invalid', message: 't 要是 ≥ 0 的秒數' }];
  if (!(color >= 0 && color <= 1)) return [400, { error: 'invalid', message: 'color 要在 0–1' }];
  const plan = readPlan(P.plan).data, cv = canvasInfo(P.project, plan), C = CANVAS[cv.format];
  const fr = Array.isArray(body?.frame) ? body.frame : null;
  let vf;
  try {
    const info = probeVideo(src), k = (info.width || C.W) / C.W, ev = (v) => Math.round((v * k) / 2) * 2;
    vf = footageVf({ crop: fr ? { x: ev(fr[0]), y: ev(fr[1]), w: ev(fr[2]), h: ev(fr[3]) } : null, canvas: C });
    if (!vf.some((s) => s.startsWith('scale='))) vf.push(`scale=${C.W}:${C.H}:flags=lanczos`);
    if (color > 0) {
      const L = resolveLook({ plan: { look: { color, slim: 0 } }, templateDir: P.templateDir });
      vf.push(lut3dFilter(ensureBlendedLut({ projectDir: P.project, lutFile: L.lutFile, color })));
    }
  } catch (e) { return [400, { error: 'invalid', message: e.message }]; }
  const out = refFile(ctx, cv.format), tmp = `${out}.${process.pid}.tmp.jpg`;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-ss', String(t), '-i', src, '-frames:v', '1', '-vf', vf.join(','), '-q:v', '3', tmp], { encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0 || !statOf(tmp)) {
    try { fs.unlinkSync(tmp); } catch { /* 沒產生 */ }
    return [500, { error: 'ffmpeg', message: r.error?.code === 'ENOENT' ? '找不到 ffmpeg → 先跑 npx hyperframes doctor 安裝 ffmpeg' : (r.stderr || '').trim().split('\n').slice(-2).join('\n') || '擷取畫面失敗' }];
  }
  fs.renameSync(tmp, out);
  return [200, { ok: true, t: r3(t), ref: refInfo(ctx, cv.format) }];
}

// 版式與畫布（009 FR-120）：和 build 同一套判斷（plan.json format > 製作進度.md「版式」> 主軌寬高比）；剪輯只讀，不寫 format
// media：插入素材的可見區 [x, y, w, h]（lib/media.mjs mediaFrame 的 view；panel＝直式有講者面板），即時模擬照這個放，和完成影片一樣不壓字幕帶
export function canvasInfo(projectDir, plan) {
  const r = resolveFormat({ projectDir, plan: isObj(plan) ? plan : null });
  const c = canvasOf(r.format);
  const media = { panel: mediaFrame(c, { panel: true }).view, full: mediaFrame(c, { panel: false }).view, side: r.format === 'portrait' ? null : { contain: SIDE.view, cover: SIDE.view } };
  return { format: r.format, source: r.detail, W: c.W, H: c.H, maxChars: c.caption.maxChars, captionBottom: c.caption.bottom, pip: c.pip.box, media };
}

// 構圖（停點 ②、之後在剪輯改構圖）：沒裁切的 work/rough.mp4＋qc.mjs framing 的分析（講者動作範圍、黑邊、各倍率的框、建議），照 rough.mp4 與版式快取
async function getFraming(ctx) {
  const P = ctx.P, src = path.join(P.project, 'work', 'rough.mp4'), st = statOf(src);
  if (!st) return [404, { error: 'novideo', message: `找不到 ${relRoot(ctx, src)} → 請 AI 先完成「剪乾淨」，產生 work/rough.mp4` }];
  const plan = readPlan(P.plan);
  const cv = canvasInfo(P.project, plan.data);
  const key = `${st.mtimeMs}:${st.size}:${cv.format}`;
  if (ctx.framing?.key !== key) {
    try {
      const { framingAnalysis } = await import('./qc.mjs');
      const a = framingAnalysis(P, {});
      const sug = a.cands.find((c) => Math.abs(c.zoom - a.suggestion.zoom) < 1e-6) || a.cands[0];
      ctx.framing = { key, data: { srcSize: a.srcSize, motion: a.motion, content: a.content, cands: a.cands, suggestion: { zoom: sug.zoom, frame: sug.frame, none: a.suggestion.none }, chin: a.chin, lookLine: a.look?.line ?? null } };
    } catch (e) { return [500, { error: 'framing', message: e.message }]; }
  }
  const c = canvasOf(cv.format);
  return [200, { ...ctx.framing.data, canvas: { format: cv.format, source: cv.source, W: c.W, H: c.H, caption: c.caption.box, card: c.lowerThird.rect, pip: c.pip.box, safe: c.regions.safe, headTop: c.framing.headTop, chinMax: c.framing.chinMax ?? null },
    video: { url: `/media/source.mp4?v=${Math.floor(st.mtimeMs).toString(36)}${st.size.toString(36)}` }, limits: LIMITS.frame,
    plan: { exists: plan.exists, hash: plan.hash, mtime: plan.mtime, error: plan.error, frame: Array.isArray(plan.data?.frame) ? plan.data.frame : null, speakerBox: plan.data?.speakerBox ?? null },
    look: lookRunState(ctx), ref: refInfo(ctx, cv.format),
    project: { name: path.basename(P.project) } }];
}

async function getState(ctx) {
  const P = ctx.P;
  const plan = readPlan(P.plan);
  const vfile = pickVideo(P);
  let video = null, videoError = null;
  if (vfile) {
    try {
      const info = probeVideo(vfile);
      const st = statOf(vfile);
      video = { ...info, file: relRoot(ctx, vfile), url: `/media/rough.mp4?v=${Math.floor(st.mtimeMs).toString(36)}${st.size.toString(36)}` };
    } catch (e) { videoError = e.message; }
  } else videoError = `找不到 ${relRoot(ctx, P.video)} → 請 AI 先完成「剪乾淨」，產生 work/rough.mp4`;
  const srt = readSrt(P.srt);
  const scenes = Array.isArray(plan.data?.scenes) ? plan.data.scenes : [];
  const media = scenes.filter((s) => isObj(s) && s.type === 'media' && s.id).map((s) => ({
    id: s.id, src: s.src ?? null, kind: mediaKind(s.src), url: s.src ? `/file/${String(s.src).split('/').map(encodeURIComponent).join('/')}` : null,
    enter: s.enter ?? null, exit: s.exit ?? null, volume: s.volume === undefined ? null : s.volume,
    in: isNum(s.in) ? s.in : 0, speed: isNum(s.speed) ? s.speed : 1, pip: s.pip !== false, fit: s.fit === 'cover' ? 'cover' : 'contain', side: !!s.side, note: s.note || '',
    info: mediaInfo(ctx, s.src),
  }));
  const rel = posix(path.relative(P.root, P.project));
  const rep = ctx.report && ctx.report.key === reportKey(ctx) ? ctx.report : null;
  const schema = ctx.schema ?? await getSchema(ctx).catch(() => null);
  return {
    app: { port: ctx.port, url: ctx.url },
    project: { name: path.basename(P.project), dir: rel },
    commands: {
      build: `node shared/template/tools/build.mjs --project ${rel}`,
      stop: `node shared/template/tools/editor.mjs --stop --project ${rel}`,
    },
    plan: { exists: plan.exists, file: relRoot(ctx, P.plan), mtime: plan.mtime, hash: plan.hash, error: plan.error, data: plan.data },
    srt: { exists: srt.exists, file: relRoot(ctx, P.srt), mtime: srt.mtime, hash: srt.hash, eol: srt.eol },
    edit: isObj(plan.data?.edit) ? plan.data.edit : null,
    look: lookState(ctx, plan.data),
    canvas: canvasInfo(P.project, plan.data),
    media, video, videoError, captions: srt.cues,
    cutpoints: readCutpoints(ctx.cutpointsFile),
    sfxMemory: readMemory(ctx),
    schema: schema ? { scenes: schema.scenes, fx: schema.fx, sounds: schema.sounds, error: schema.error } : null,
    report: rep ? { ready: true, data: rep.report, fallback: rep.fallback ?? null, error: rep.error, issues: rep.issues, log: rep.log ?? null } : { ready: false },
    requests: requestsInfo(P.project),
    preview: { player: { available: ctx.player.available, version: ctx.player.version ?? null, reason: ctx.player.reason ?? null }, composition: '/composition/index.html', ...builtInfo(ctx, plan) },
    build: { running: ctx.build.running },
    limits: LIMITS,
    targetLufs: TARGET_LUFS,
  };
}

const reportOut = (rep) => ({ ready: true, data: rep.report, fallback: rep.fallback ?? null, error: rep.error, issues: rep.issues, log: rep.log ?? null });

async function doSave(ctx, body, { deferBuild = false } = {}) {
  const P = ctx.P;
  const st = statOf(P.plan);
  // 構圖在停點 ②（分鏡表之前，還沒有 plan.json）只存 frame：先建一個只有 version（直式加 format）的 plan.json
  //   構圖每次都帶 frame（不裁切是 null），也可能一起帶講者調光、瘦臉（look）；剪輯只存 look 時沒有 frame，照舊走下面的完整存檔
  const frameOnly = isObj(body) && body.frame !== undefined && Object.keys(body).every((k) => k === 'base' || k === 'frame' || k === 'look');
  if (!st && !frameOnly) return [404, { error: 'noplan', message: `找不到 ${relRoot(ctx, P.plan)} → 請 AI 先寫 plan.json，剪輯才有地方存` }];
  const cv = canvasInfo(P.project, st ? readPlan(P.plan).data : null);
  const text = st ? fs.readFileSync(P.plan, 'utf8') : JSON.stringify({ version: 1, ...(cv.format === 'portrait' ? { format: 'portrait' } : {}) }, null, 2) + '\n';
  const base = isObj(body?.base) ? body.base : {};
  const hash = st ? sha(text) : null;
  const planConflict = (h, m) => (!st ? base.hash != null : base.hash != null ? base.hash !== h : base.mtime == null || base.mtime !== m);
  if (planConflict(hash, st?.mtimeMs)) {
    return [409, { error: 'conflict', file: 'plan', mtime: st.mtimeMs, hash,
      message: 'plan.json 在你打開剪輯之後被改過（通常是 AI 剛改了它）。為了不蓋掉那些修改，這次 plan.json 和字幕都沒有存 → 按「重新載入」拿最新的 plan.json，再存一次' }];
  }
  const srt = readSrt(P.srt);
  const wantSrt = Array.isArray(body?.srt?.ops) && body.srt.ops.length > 0;
  const srtConflict = (h) => ('srtHash' in base || wantSrt) && (base.srtHash ?? null) !== (h ?? null);
  if (srtConflict(srt.hash)) {
    return [409, { error: 'conflict', file: 'srt', hash: srt.hash,
      message: 'work/rough.srt（字幕）在你打開剪輯之後被改過（通常是 AI 剛改了字幕）。為了不蓋掉那些修改，這次 plan.json 和字幕都沒有存 → 按「重新載入」拿最新的字幕，再存一次（還沒存的字幕修改要重做）' }];
  }
  let videoDur = null;
  try { const v = pickVideo(P); if (v) videoDur = probeVideo(v)?.dur ?? null; } catch { videoDur = null; }
  const schema = await getSchema(ctx).catch(() => null);
  const memory = readMemory(ctx);
  const durCache = new Map();
  const mediaDur = (src) => { if (!durCache.has(src)) durCache.set(src, mediaInfo(ctx, src)?.dur ?? null); return durCache.get(src); };
  const r = applySave(text, body, { videoDur, srtText: srt.text, mediaDur, schema, memory, canvas: cv });
  if (r.errors.length) return [400, { error: 'invalid', errors: r.errors, message: r.errors.join('\n') }];
  // plan.json 與 rough.srt 一起寫：兩個都先寫暫存檔；rename 之前再比對一次，任一個被改過就兩個都不寫
  const writes = [];
  if (r.text != null) writes.push([P.plan, r.text]);
  if (!st && r.text != null) fs.mkdirSync(path.dirname(P.plan), { recursive: true });
  if (r.srtText != null) writes.push([P.srt, r.srtText]);
  const tmps = [];
  try {
    for (const [f, t] of writes) { const tmp = `${f}.editor-${process.pid}.tmp`; fs.writeFileSync(tmp, t); tmps.push([tmp, f]); }
    const st2 = statOf(P.plan), now = st2 ? fs.readFileSync(P.plan, 'utf8') : null, srt2 = readSrt(P.srt);
    if ((now == null ? null : sha(now)) !== hash || (srt2.hash ?? null) !== (srt.hash ?? null)) {
      for (const [tmp] of tmps) try { fs.unlinkSync(tmp); } catch { /* 已經不在 */ }
      return [409, { error: 'conflict', file: (now == null ? null : sha(now)) !== hash ? 'plan' : 'srt', mtime: st2?.mtimeMs, message: '存檔的同時 plan.json 或字幕被改過了，這次兩個都沒有存 → 按「重新載入」再存一次' }];
    }
    for (const [tmp, f] of tmps) fs.renameSync(tmp, f);
  } catch (e) {
    for (const [tmp] of tmps) try { fs.unlinkSync(tmp); } catch { /* 已經不在 */ }
    throw e;
  }
  if (JSON.stringify(r.memory || {}) !== JSON.stringify(memory)) {
    try { fs.mkdirSync(ctx.editorDir, { recursive: true }); fs.writeFileSync(ctx.memoryFile, JSON.stringify({ sfx: r.memory || {} }, null, 2) + '\n'); } catch { /* 記不住只影響「還原音效」 */ }
  }
  const nst = statOf(P.plan), nsrt = readSrt(P.srt);
  if (frameOnly) {
    const hash = nst ? sha(fs.readFileSync(P.plan, 'utf8')) : null;
    if (r.text != null) {
      ctx.framingUpdate = { hash, running: false, ok: null, message: null, finishedAt: null };
      // 停點 ② 尚未有完成影片時只存設定；已有完成影片就自動更新，關閉構圖分頁也會繼續。
      if (!deferBuild && builtInfo(ctx, readPlan(P.plan)).built) requestFramingBuild(ctx);
    }
    return [200, { ok: true, wrote: { plan: r.text != null, srt: false }, notes: r.notes || [], plan: { exists: !!nst, mtime: nst?.mtimeMs ?? null, hash, frame: Array.isArray(r.plan.frame) ? r.plan.frame : null, speakerBox: r.plan.speakerBox ?? null }, look: lookRunState(ctx), framingUpdate: ctx.framingUpdate }];
  }
  const rep = await getReport(ctx, { fresh: true });
  return [200, { ok: true, look: lookState(ctx, r.plan), wrote: { plan: r.text != null, srt: r.srtText != null }, plan: { mtime: nst.mtimeMs, hash: sha(fs.readFileSync(P.plan, 'utf8')), data: r.plan },
    srt: { mtime: nsrt.mtime, hash: nsrt.hash, eol: nsrt.eol }, captions: nsrt.cues, notes: r.notes || [], edit: r.edit ?? r.plan.edit ?? null, anchors: r.anchors || [], sfxMemory: r.memory || {},
    report: reportOut(rep) }];
}

async function doLoudness(ctx, body) {
  const file = pickVideo(ctx.P);
  if (!file) return [404, { error: 'novideo', message: '找不到 rough.mp4' }];
  const cuts = Array.isArray(body?.cuts) ? body.cuts.filter((c) => Array.isArray(c) && c.length === 2 && isNum(c[0]) && isNum(c[1])) : [];
  const st = statOf(file);
  const key = `${st.size}:${st.mtimeMs}:${JSON.stringify(cuts)}`;
  if (!ctx.loud.has(key)) ctx.loud.set(key, measureLoudness(file, cuts));
  try {
    const m = await ctx.loud.get(key);
    const gain = Math.round((TARGET_LUFS - m.integrated) * 10) / 10;
    return [200, { ok: true, ...m, target: TARGET_LUFS, suggest: Math.max(LIMITS.volume[0], Math.min(LIMITS.volume[1], gain)), raw: gain }];
  } catch (e) {
    ctx.loud.delete(key);
    return [500, { error: 'loudness', message: e.message }];
  }
}

// 剪輯改了卡片文字的段：build 成功後跑 audit --only 量版面，✖／⚠ 併進 issues（剪輯檢查清單標紅）
export function auditIssues(json) {
  const errors = [], warnings = [];
  let r;
  try { r = JSON.parse(json); } catch { return { errors: ['版面檢查（audit）沒有產出結果 → 請 AI 跑 audit.mjs --only 看原因'], warnings }; }
  for (const e of r.errors || []) errors.push(`版面檢查：${e}`);
  for (const w of r.warnings || []) warnings.push(`版面檢查：${w}`);
  for (const f of r.findings || []) (f.level === 'error' ? errors : warnings).push(`[${f.id}] 版面：${f.msg}${f.fix ? ` → ${f.fix}` : ''}`);
  return { errors, warnings };
}

// 修改單（剪輯左側「複製給 AI」）：整份覆寫 work/feedback/editor-requests.md；AI 聽到「照修改單改」就讀這個檔
// 修改單改完了沒：editor-requests.md 上次複製的時間與裡面的段；AI 照修改單改完，r<N>.md「改了哪幾段」每段寫一列
//   「- <段 id>：<做了什麼>」（auto-edit-review references/editor-requests.md）。比修改單新的 r<N>.md 寫到的段＝已改，剪輯標「已改」、可以點「看結果」
export function requestsInfo(project) {
  const fb = path.join(project, 'work', 'feedback'), file = path.join(fb, 'editor-requests.md');
  let at;
  try { at = fs.statSync(file).mtimeMs; } catch { return null; }
  const markdown = fs.readFileSync(file, 'utf8');
  const revision = sha(`${at}:${markdown}`);
  const ids = [...markdown.matchAll(/^## \d+\. (\S+)/gm)].map((m) => m[1]);
  const saved = readJson(path.join(fb, 'editor-requests-status.json'));
  const states = saved?.revision === revision && isObj(saved.states) ? saved.states : {};
  const rounds = fs.readdirSync(fb).filter((f) => /^r\d+\.md$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(fb, f)).mtimeMs }))
    .filter((x) => x.t > at).sort((a, b) => a.t - b.t);
  const done = {};
  for (const { f } of rounds) {
    const sec = fs.readFileSync(path.join(fb, f), 'utf8').split(/^## 改了哪幾段[ \t]*$/m)[1]?.split(/^## /m)[0] || '';
    for (const m of sec.matchAll(/^- (\S+?)：(.+)$/gm)) if (ids.includes(m[1])) done[m[1]] = { round: f.slice(0, -3), note: m[2].trim() };
  }
  // 有明確回報的段以 API 為準，避免回饋紀錄尚在撰寫就提早顯示完成。
  for (const id of ids) if (Object.hasOwn(states, id)) {
    if (states[id].state === 'done') done[id] = { round: states[id].round || done[id]?.round || 'AI', note: states[id].message || done[id]?.note || '生成完成，已通過 build、audit' };
    else delete done[id];
  }
  return { at: Math.round(at), revision, ids, done, states };
}

// AI 明確回報才顯示生成中；版本必填，舊任務不能改到使用者重新複製的修改單。
export function doRequestsStatus(ctx, body) {
  const q = requestsInfo(ctx.P.project);
  if (!q) return [404, { message: '還沒有修改單，請先在剪輯複製給 AI' }];
  if (body?.revision !== q.revision) return [409, { message: '修改單版本已更新，請重新讀取最新修改單' }];
  const { state, ids, message = '', round = '' } = body;
  if (!['generating', 'done', 'failed'].includes(state) || !Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string' || !q.ids.includes(id))
    || typeof message !== 'string' || message.length > 2000 || typeof round !== 'string' || round.length > 80) return [400, { message: '請提供有效的 state（generating／done／failed）、修改單段落 ids 與文字訊息' }];
  const now = Date.now();
  const states = { ...q.states, ...Object.fromEntries(ids.map((id) => [id, { state, message, round, at: now }])) };
  const file = path.join(ctx.P.project, 'work', 'feedback', 'editor-requests-status.json');
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ revision: q.revision, states }, null, 2) + '\n');
  fs.renameSync(`${file}.tmp`, file);
  return [200, { ok: true, requests: requestsInfo(ctx.P.project) }];
}

export function doRequests(ctx, body) {
  const md = body?.markdown;
  if (typeof md !== 'string' || !md.trim()) return [400, { error: 'empty', message: '修改單是空的' }];
  if (md.length > 200000) return [400, { error: 'toolong', message: '修改單太長（超過 20 萬字）' }];
  const dir = path.join(ctx.P.project, 'work', 'feedback');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'editor-requests.md');
  fs.writeFileSync(`${file}.tmp`, md.endsWith('\n') ? md : `${md}\n`);
  fs.renameSync(`${file}.tmp`, file);
  return [200, { ok: true, file: path.relative(ctx.P.root, file).split(path.sep).join('/'), requests: requestsInfo(ctx.P.project) }];
}

// 同時有手動產生或連續存構圖時排隊，最後一定用最新設定再產生一次。
function requestFramingBuild(ctx) {
  ctx.framingPending = true;
  ctx.framingUpdate.running = true;
  if (ctx.framingJob) return;
  ctx.framingJob = (async () => {
    while (ctx.framingPending) {
      while (ctx.build.running) await sleep(250);
      ctx.framingPending = false;
      const [, result] = await doBuild(ctx);
      Object.assign(ctx.framingUpdate, { ok: result.ok, message: result.ok ? null : result.message || '預覽更新失敗，請在剪輯按「重新產生」查看訊息', finishedAt: Date.now() });
    }
  })().catch((e) => {
    Object.assign(ctx.build, { running: false, ok: false, finishedAt: Date.now() });
    Object.assign(ctx.framingUpdate, { ok: false, message: e.message, finishedAt: Date.now() });
  }).finally(() => {
    ctx.framingUpdate.running = false;
    ctx.framingJob = null;
  });
}

async function doBuild(ctx, body = {}) {
  if (ctx.build.running) return [409, { error: 'busy', message: '已經在重新產生了，等它跑完' }];
  const P = ctx.P;
  const ids0 = new Set(((readPlan(P.plan).data || {}).scenes || []).filter(isObj).map((x) => String(x.id)));
  const auditIds = (Array.isArray(body?.audit) ? body.audit : []).map(String).filter((x) => ids0.has(x)).slice(0, 12);
  ctx.build = { running: true, log: '', code: null, ok: null, startedAt: Date.now(), finishedAt: null };
  // 瘦臉底片過期而且能跑：先跑 look.mjs run（偵測臉部＋套用瘦臉），成功才 build（contracts/cli-006.md §6）
  const planData = readPlan(P.plan).data;
  if (lookNeedsRun({ projectDir: P.project, plan: isObj(planData) ? planData : {}, templateDir: P.templateDir })) {
    ctx.build.log += '講者瘦臉：先偵測臉部、套用瘦臉（look.mjs run）…\n';
    const lr = await runNode([LOOK, 'run', '--project', P.project, '--template', P.templateDir], { cwd: P.root, onData: (s) => { ctx.build.log += s; } });
    if (lr.code !== 0) {
      Object.assign(ctx.build, { running: false, code: lr.code, ok: false, finishedAt: Date.now() });
      return [200, { ok: false, code: lr.code, log: ctx.build.log, issues: issuesFromText(ctx.build.log), seconds: r3((ctx.build.finishedAt - ctx.build.startedAt) / 1000) }];
    }
  }
  const r = await runNode([BUILD, '--project', P.project, '--template', P.templateDir], { cwd: P.root, onData: (s) => { ctx.build.log += s; } });
  const issues = issuesFromText(ctx.build.log);
  let audit = null;
  if (r.code === 0 && auditIds.length) {
    ctx.build.log += `\n量版面（audit --only ${auditIds.join(',')}）…\n`;
    const a = await runNode([AUDIT, '--project', P.project, '--only', auditIds.join(','), '--json'], { cwd: P.root });
    audit = { ids: auditIds, ...auditIssues(a.stdout) };
    ctx.build.log += audit.errors.length || audit.warnings.length ? [...audit.errors.map((x) => `✖ ${x}`), ...audit.warnings.map((x) => `⚠ ${x}`)].join('\n') + '\n' : `✓ ${auditIds.join('、')} 版面沒有問題\n`;
    issues.errors.push(...audit.errors); issues.warnings.push(...audit.warnings);
  }
  Object.assign(ctx.build, { running: false, code: r.code, ok: r.code === 0, finishedAt: Date.now() });
  ctx.report = null;
  ctx.player = preparePlayer(ctx);
  return [200, { ok: ctx.build.ok, code: r.code, log: ctx.build.log, issues, audit, seconds: r3((ctx.build.finishedAt - ctx.build.startedAt) / 1000) }];
}

function hostOk(ctx, req) {
  const h = String(req.headers.host || '');
  return h === `127.0.0.1:${ctx.port}` || h === `localhost:${ctx.port}`;
}
function postOk(ctx, req) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) return false;
  const o = req.headers.origin;
  return !o || o === `http://127.0.0.1:${ctx.port}` || o === `http://localhost:${ctx.port}`;
}

async function handle(ctx, req, res) {
  if (!hostOk(ctx, req)) return sendText(res, 403, '剪輯只接受 127.0.0.1 的連線');
  const u = new URL(req.url, 'http://127.0.0.1');
  let p;
  try { p = decodeURIComponent(u.pathname); } catch { return sendText(res, 400, '網址格式不對'); }
  const P = ctx.P;
  const isGet = req.method === 'GET' || req.method === 'HEAD';

  if (req.method === 'POST') {
    if (!postOk(ctx, req)) return sendJson(res, 403, { error: 'forbidden', message: '只接受剪輯頁面送來的 JSON' });
    let body;
    try { body = await readBody(req, p === '/api/design/upload' ? 18 * 1024 * 1024 : 4 * 1024 * 1024); } catch (e) { return sendJson(res, e.status || 400, { error: 'badbody', message: e.message }); }
    if (p.startsWith('/api/design/')) {
      try {
        if (p === '/api/design/request/status') return sendJson(res, 200, setDesignRequestStatus(ctx, body));
        const result = p === '/api/design/color' ? setDesignColor(ctx, body) : p === '/api/design/upload' ? await uploadDesign(ctx, body) : p === '/api/design/request' ? prepareDesignRequest(ctx, body) : p === '/api/design/import' ? await importDesignCandidate(ctx, body) : p === '/api/design/original' ? restoreOriginalBackground(ctx, body) : p === '/api/design/discard' ? discardDesign(ctx) : p === '/api/design/reference/remove' ? removeReference(ctx) : null;
        return result ? sendJson(res, 200, result) : sendJson(res, 404, { message: '找不到這個操作' });
      } catch (e) { return sendJson(res, e.status || 400, { message: e.message }); }
    }
    if (exportBusy(ctx) && ['/api/save', '/api/build', '/api/framing/save'].includes(p)) return sendJson(res, 409, { error: 'exporting', message: '正在輸出完成影片，等它跑完再存檔或重新產生（也可以先取消輸出）' });
    if (p === '/api/framing/save') {
      const { designId, ...frameBody } = body;
      if (designId && (ctx.designBusy || designState(ctx).draft?.id !== designId)) return sendJson(res, 409, { message: '背景正在更新，請等預覽完成後再儲存。' });
      const [status, result] = await doSave(ctx, frameBody, { deferBuild: !!designId });
      if (status === 200 && designId) {
        result.design = applyDesign(ctx, designId);
        ctx.framingUpdate = { hash: result.plan.hash, running: false, ok: null, message: null, finishedAt: null };
        if (builtInfo(ctx, readPlan(P.plan)).built) requestFramingBuild(ctx);
        result.framingUpdate = ctx.framingUpdate;
      }
      return sendJson(res, status, result);
    }
    if (p === '/api/cuts/save') {
      try { return sendJson(res, 200, saveCuts(ctx, body)); } catch (e) { return sendJson(res, e.status || 400, { message: e.message, ...(e.extra || {}) }); }
    }
    if (p === '/api/storyboard/save') {
      try { return sendJson(res, 200, saveStoryboard(ctx, body)); } catch (e) { return sendJson(res, e.status || 400, { message: e.message, ...(e.extra || {}) }); }
    }
    if (p === '/api/save') { const [s, o] = await doSave(ctx, body); return sendJson(res, s, o); }
    if (p === '/api/refframe') { const [s, o] = await doRefFrame(ctx, body); return sendJson(res, s, o); }
    if (p === '/api/look/run') { const [s, o] = await doLookRun(ctx); return sendJson(res, s, o); }
    if (p === '/api/build') { const [s, o] = await doBuild(ctx, body); return sendJson(res, s, o); }
    if (p === '/api/export') {
      const deps = { build: () => doBuild(ctx), report: () => getReport(ctx, { fresh: true }), requestStates: () => requestsInfo(P.project)?.states, ...(ctx.exportDeps || {}) };
      const [s, o] = startExport(ctx, deps);
      return sendJson(res, s, o);
    }
    if (p === '/api/export/cancel') { const [s, o] = cancelExport(ctx); return sendJson(res, s, o); }
    if (p === '/api/requests') { const [s, o] = doRequests(ctx, body); return sendJson(res, s, o); }
    if (p === '/api/requests/status') { const [s, o] = doRequestsStatus(ctx, body); return sendJson(res, s, o); }
    if (p === '/api/loudness') { const [s, o] = await doLoudness(ctx, body); return sendJson(res, s, o); }
    if (p === '/api/check') { const rep = await getReport(ctx, { fresh: true }); return sendJson(res, 200, reportOut(rep)); }
    if (p === '/api/shutdown') {
      if (req.headers['x-editor-token'] !== ctx.token) return sendJson(res, 403, { error: 'forbidden', message: 'token 不對' });
      sendJson(res, 200, { ok: true });
      setImmediate(() => ctx.onShutdown?.());
      return;
    }
    return sendJson(res, 404, { error: 'notfound', message: `沒有 ${p} 這個 API` });
  }
  if (!isGet) return sendText(res, 405, '不支援這個方法');

  if (p === '/' || p === '/index.html') return sendFile(req, res, path.join(UI_DIR, 'index.html'));
  if (p === '/api/requests/status') return sendJson(res, 200, { requests: requestsInfo(P.project) });
  if (p === '/api/export') return sendJson(res, 200, exportState(ctx));
  if (p.startsWith('/output/')) {
    const f = exportFile(ctx, p.slice('/output/'.length));
    return f && statOf(f) ? sendFile(req, res, f) : sendText(res, 404, '找不到檔案');
  }
  if (p === '/api/design/request/status') return sendJson(res, 200, designRequestStatus(ctx));
  if (p === '/framing' || p === '/framing.html') return sendFile(req, res, path.join(UI_DIR, 'framing.html'));
  if (p === '/cuts' || p === '/cuts.html') return sendFile(req, res, path.join(UI_DIR, 'cuts.html'));
  if (p === '/api/cuts') return sendJson(res, 200, cutsState(ctx));
  if (p === '/storyboard' || p === '/storyboard.html') return sendFile(req, res, path.join(UI_DIR, 'storyboard.html'));
  if (p === '/api/storyboard') return sendJson(res, 200, storyboardState(ctx));
  if (p.startsWith('/storyboard-preview/')) {
    const f = storyboardImage(ctx, p.slice('/storyboard-preview/'.length));
    return f ? sendFile(req, res, f) : sendText(res, 404, '找不到這張分鏡截圖');
  }
  if (p === '/api/design') {
    const format = canvasInfo(P.project, readPlan(P.plan).data).format;
    return sendJson(res, 200, { ...designState(ctx), format, previews: designPreviews(ctx, format) });
  }
  if (p.startsWith('/design/')) {
    const candidate = /^\/design\/request\/([a-f0-9-]{36})\/([ABC])\/(fs|side|ch)$/.exec(p);
    if (candidate) { const file = candidateAsset(ctx, candidate[1], candidate[2], candidate[3]); return file ? sendFile(req, res, file) : sendText(res, 404, '找不到候選背景'); }
    const m = /^\/design\/([a-f0-9-]{36}|draft|original)\/([\w.-]+)$/.exec(p);
    const file = m && designAsset(ctx, m[1], m[2]);
    return file ? sendFile(req, res, file) : sendText(res, 404, '找不到檔案');
  }
  if (p === '/gallery') { res.writeHead(302, { Location: '/gallery/' }); return res.end(); }
  if (p.startsWith('/gallery/')) {
    const rel = p.slice('/gallery/'.length) || 'index.html';
    // 情境庫唯讀：只供應預覽所需的靜態檔，不開放工具、文件或隱藏檔。
    if (rel.split('/').some((s) => s.startsWith('.'))) return sendText(res, 404, '找不到檔案');
    if (rel !== 'index.html' && !/^(?:(?:preview|kit|styles|gallery|fx)\/.*\.(?:html|css|js|json|jpg|jpeg|png|svg|webp|woff2?|ttf|mp4|wav)|bg(?:-[\w-]+)?\.jpg)$/i.test(rel)) return sendText(res, 404, '找不到檔案');
    const f = safeJoin(P.templateDir, rel);
    if (!f) return sendText(res, 404, '找不到檔案');
    const localSpeaker = /^preview\/speaker(-v)?-local\.jpg$/.exec(rel);
    if (localSpeaker) return sendFile(req, res, refFile(ctx, localSpeaker[1] ? 'portrait' : 'landscape'));
    if (rel === 'index.html') {
      const plan = readPlan(P.plan).data || {}, cv = canvasInfo(P.project, plan);
      const config = { project: path.basename(P.project), format: cv.format, style: plan.style || '', theme: plan.theme || 'light', ref: refInfo(ctx, cv.format),
        portraitPreviews: fs.readdirSync(path.join(P.templateDir, 'preview')).filter((n) => n.endsWith('-v.html')) };
      const script = `<script>window.__editorGallery=${JSON.stringify(config).replace(/</g, '\\u003c')};</script><script defer src="/editor/gallery.js"></script>`;
      // 專案風格與參考圖會變，不能沿用靜態 index.html 的 ETag。
      return sendText(res, 200, fs.readFileSync(f, 'utf8').replace('</head>', `${script}</head>`), 'text/html; charset=utf-8');
    }
    if (/^preview\/.*\.html$/.test(rel)) return sendFile(req, res, f, { transform: (html) => html.replace('</head>', '<script defer src="/editor/preview-bridge.js"></script></head>') });
    return sendFile(req, res, f);
  }
  if (p === '/api/ping') return sendJson(res, 200, { ok: true, app: 'auto-edit-editor', project: P.project, pid: process.pid, revision: SERVER_REVISION });
  if (p === '/api/state') return sendJson(res, 200, await getState(ctx));
  if (p === '/api/framing') { const [s, o] = await getFraming(ctx); return sendJson(res, s, o); }
  if (p === '/api/look/status') return sendJson(res, 200, lookRunState(ctx));
  if (p === '/api/thumbs') return sendJson(res, 200, await getThumbs(ctx, u.searchParams.get('src') || 'main'));
  if (p.startsWith('/editor-cache/thumbs/')) {
    const f = safeJoin(path.join(ctx.editorDir, 'thumbs'), p.slice('/editor-cache/thumbs/'.length));
    return f && f.endsWith('.jpg') ? sendFile(req, res, f) : sendText(res, 404, '找不到檔案');
  }
  if (p.startsWith('/sfx/')) {
    // 即時模擬播音效用：只開放 shared/sfx/ 的 .wav
    const name = p.slice('/sfx/'.length);
    if (!/^[\w-]+\.wav$/.test(name)) return sendText(res, 404, '找不到檔案');
    return sendFile(req, res, path.join(P.sfx, name));
  }
  if (p === '/api/report') { const rep = await getReport(ctx, { fresh: u.searchParams.has('fresh') }); return sendJson(res, 200, reportOut(rep)); }
  if (p === '/api/waveform') return sendJson(res, 200, await getPeaks(ctx));
  if (p === '/api/look/face') {
    try {
      const out = faceImage({ projectDir: P.project, t: Number(u.searchParams.get('t')) || 0, slim: Number(u.searchParams.get('slim')) || 0, beauty: Number(u.searchParams.get('beauty')) || 0, cache: (ctx.lookCache ??= {}) });
      if (Buffer.isBuffer(out)) { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'Content-Length': out.length }); return res.end(out); }
      return sendJson(res, 404, out);
    } catch (e) { return sendJson(res, 500, { error: 'look', message: e.message }); }
  }
  if (p === '/api/version') {
    const plan = readPlan(P.plan), srt = readSrt(P.srt);
    return sendJson(res, 200, { plan: { exists: plan.exists, mtime: plan.mtime, hash: plan.hash }, srt: { exists: srt.exists, hash: srt.hash }, ...builtInfo(ctx, plan), build: { running: ctx.build.running }, framingUpdate: ctx.framingUpdate, requests: requestsInfo(P.project) });
  }
  if (p === '/api/build') return sendJson(res, 200, { ...ctx.build, seconds: ctx.build.startedAt ? r3(((ctx.build.finishedAt || Date.now()) - ctx.build.startedAt) / 1000) : 0 });
  if (p.startsWith('/editor/')) {
    const f = safeJoin(UI_DIR, p.slice('/editor/'.length));
    return f ? sendFile(req, res, f) : sendText(res, 404, '找不到檔案');
  }
  if (p.startsWith('/kit/')) {
    const f = safeJoin(path.join(P.templateDir, 'kit'), p.slice('/kit/'.length));
    return f ? sendFile(req, res, f) : sendText(res, 404, '找不到檔案');
  }
  if (p === '/media/source.mp4') {
    // 構圖：沒裁切的初剪（build 編碼過的底片已經照 frame 裁過）
    const f = path.join(P.project, 'work', 'rough.mp4');
    return statOf(f) ? sendFile(req, res, f, { type: 'video/mp4' }) : sendText(res, 404, '找不到 work/rough.mp4');
  }
  if (p === '/media/main.mp4') {
    // 剪輯清單頁試聽：剪乾淨步驟 1 的主軌（時間和 cuts.md 的時間碼一樣）
    const f = path.join(P.project, 'work', 'main.mp4');
    return statOf(f) ? sendFile(req, res, f, { type: 'video/mp4' }) : sendText(res, 404, '找不到 work/main.mp4');
  }
  if (p === '/media/rough.mp4') {
    const f = pickVideo(P);
    return f ? sendFile(req, res, f, { type: 'video/mp4' }) : sendText(res, 404, '找不到 rough.mp4');
  }
  if (p.startsWith('/file/')) {
    // 只開放專案的 assets/screen/ 與 assets/images/（media 段的素材）
    const rel = p.slice('/file/'.length);
    const f = safeJoin(P.project, rel);
    const r = f && posix(path.relative(P.project, f));
    if (!r || !(r.startsWith('assets/screen/') || r.startsWith('assets/images/'))) return sendText(res, 403, '只能讀 assets/screen/ 與 assets/images/ 裡的檔案');
    return sendFile(req, res, f);
  }
  if (p === '/hf/player.js' || p === '/hf/runtime.js') {
    if (!ctx.player.available) return sendText(res, 404, ctx.player.reason || '找不到 HyperFrames 播放器');
    return sendFile(req, res, p === '/hf/player.js' ? ctx.player.file : ctx.player.runtime, { type: 'text/javascript; charset=utf-8' });
  }
  if (p.startsWith('/composition/')) {
    const rel = p.slice('/composition/'.length) || 'index.html';
    if (rel.split('/').some((s) => s.startsWith('.'))) return sendText(res, 404, '找不到檔案');
    let f = safeJoin(P.out, rel);
    if (!f) return sendText(res, 404, '找不到檔案');
    // 子合成（compositions/fx-*.html）用相對路徑載入 fx-kit.js，被播放器併進主文件後會變成根目錄的 fx-kit.js（npx hyperframes play 也一樣 404）：
    // 根目錄找不到、compositions/ 裡有同名檔就用它
    if (!statOf(f) && !rel.includes('/')) { const alt = path.join(P.out, 'compositions', rel); if (statOf(alt)) f = alt; }
    if (f.endsWith('.html') && ctx.player.available) return sendFile(req, res, f, { type: 'text/html; charset=utf-8', transform: injectRuntime });
    return sendFile(req, res, f);
  }
  if (p === '/favicon.ico') return sendFile(req, res, path.join(UI_DIR, 'favicon.svg'), { type: 'image/svg+xml' });
  if (p.startsWith('/api/')) return sendJson(res, 404, { error: 'notfound', message: '找不到這個功能，請重新啟動剪輯服務後再試。' });
  return sendText(res, 404, '找不到這個頁面');
}

// 啟動（測試直接呼叫；CLI 也走這裡）→ { url, port, server, ctx, close() }
// previewDir：預覽參考圖寫到哪（預設 shared/template/preview；測試指到暫存資料夾，不蓋掉使用者的參考圖）
export async function startEditor({ flags = {}, cwd = process.cwd(), port, writeState = true, previewDir = null, exportDeps = null } = {}) {
  const P = pathsFrom(flags, cwd);
  if (!P.project) throw new Error('要指定專案：加 --project projects/<專案>');
  if (!statOf(UI_DIR)) throw new Error(`找不到剪輯頁面 ${UI_DIR} → 確認 shared/template/tools/editor/ 還在`);
  const ctx = makeContext(P);
  ctx.previewDir = previewDir || path.join(P.templateDir, 'preview');
  ctx.exportDeps = exportDeps;
  const server = http.createServer((req, res) => {
    handle(ctx, req, res).catch((e) => { if (!res.headersSent) sendJson(res, 500, { error: 'internal', message: e.message }); else res.end(); });
  });
  server.keepAliveTimeout = 5000;
  ctx.port = await listenOnFreePort(server, port ?? flags.port ?? DEFAULT_PORT);
  ctx.url = `http://127.0.0.1:${ctx.port}/`;
  fs.mkdirSync(ctx.editorDir, { recursive: true });
  ctx.player = preparePlayer(ctx);
  if (writeState) fs.writeFileSync(ctx.stateFile, JSON.stringify({ pid: process.pid, port: ctx.port, url: ctx.url, project: P.project, token: ctx.token, startedAt: new Date().toISOString() }, null, 2) + '\n');
  // 先在背景算波形與檢查報告，頁面打開時通常已經好了
  getPeaks(ctx).catch(() => {});
  getReport(ctx).catch(() => {});
  getSchema(ctx).catch(() => {});
  let closed = false;
  const close = () => new Promise((resolve) => {
    if (closed) return resolve();
    closed = true;
    if (exportBusy(ctx)) cancelExport(ctx);
    if (writeState) { const s = readJson(ctx.stateFile); if (s?.pid === process.pid && s?.port === ctx.port) try { fs.unlinkSync(ctx.stateFile); } catch { /* 已經不在 */ } }
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
  return { url: ctx.url, port: ctx.port, server, ctx, close };
}

// ---------- CLI ----------

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

async function ping(url, ms = 1500) {
  try {
    const r = await fetch(new URL('api/ping', url), { signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// 狀態檔裡的剪輯還活著嗎（活著回狀態，死了順便清掉狀態檔）
export async function runningEditor(stateFile, project) {
  const s = readJson(stateFile);
  if (!s?.url || !s?.pid) return null;
  if (pidAlive(s.pid)) {
    const p = await ping(s.url);
    if (p?.app === 'auto-edit-editor' && (!project || path.resolve(p.project) === path.resolve(project))) return { ...s, revision: p.revision ?? null };
  }
  try { fs.unlinkSync(stateFile); } catch { /* 已經不在 */ }
  return null;
}

export async function stopEditor(stateFile, project) {
  const s = await runningEditor(stateFile, project);
  if (!s) return null;
  try {
    await fetch(new URL('api/shutdown', s.url), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-editor-token': s.token }, body: '{}', signal: AbortSignal.timeout(2000) });
  } catch { /* 下面再用 kill */ }
  for (let i = 0; i < 30 && pidAlive(s.pid) && await ping(s.url, 300); i++) await sleep(100);
  if (pidAlive(s.pid) && await ping(s.url, 300)) { try { process.kill(s.pid); } catch { /* 已經結束 */ } }
  try { fs.unlinkSync(stateFile); } catch { /* 已經不在 */ }
  return s;
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch { /* 開不了就算了，網址已經印出來 */ }
}

async function cli() {
  const argv = process.argv.slice(2);
  const flags = parseArgs(argv);
  if (flags.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  const P = pathsFrom(flags, process.cwd());
  const rel = (f) => posix(path.relative(process.cwd(), f)) || '.';
  const stateFile = path.join(P.out, '.editor', 'server.json');
  const self = posix(path.relative(process.cwd(), path.resolve(process.argv[1] || fileURLToPath(import.meta.url))));
  const stopCmd = `node ${self} --stop --project ${rel(P.project)}`;
  if (flags['design-state']) {
    try {
      const result = flags['design-state'] === 'status' ? designRequestStatus({ P }) : setDesignRequestStatus({ P }, { requestId: flags['design-request'], state: flags['design-state'], message: flags.message });
      console.log(JSON.stringify(result));
      return 0;
    } catch (e) { console.error(e.message); return 1; }
  }
  if (flags['requests-state']) {
    if (flags['requests-state'] === 'status') { console.log(JSON.stringify({ requests: requestsInfo(P.project) })); return 0; }
    const [status, result] = doRequestsStatus({ P }, { state: flags['requests-state'], revision: flags['request-revision'], ids: flags.ids?.split(','), message: flags.message, round: flags.round });
    console.log(JSON.stringify(result));
    return status === 200 ? 0 : 1;
  }
  if (flags.status) {
    const s = await runningEditor(stateFile, P.project);
    console.log(s ? `剪輯開著：${s.url}（專案 ${rel(P.project)}，pid ${s.pid}）` : `剪輯沒有開（專案 ${rel(P.project)}）`);
    return 0;
  }
  if (flags.stop) {
    const s = await stopEditor(stateFile, P.project);
    console.log(s ? `已關閉剪輯（${s.url}）` : `剪輯本來就沒有開（專案 ${rel(P.project)}）`);
    return 0;
  }
  let running = await runningEditor(stateFile, P.project);
  if (running && running.revision !== SERVER_REVISION) {
    console.log('剪輯服務已有新版，正在更新並重新啟動…');
    flags.port ??= running.port;
    await stopEditor(stateFile, P.project);
    running = null;
  }
  if (running) {
    console.log(`剪輯已經開著：${running.url}`);
    console.log(`剪輯清單：${new URL('cuts', running.url).href}`);
    console.log(`構圖：${new URL('framing', running.url).href}`);
    console.log(`分鏡表：${new URL('storyboard', running.url).href}`);
    console.log(`完成影片預覽：${new URL('?view=final', running.url).href}`);
    console.log(`專案：${rel(P.project)}（要重開先關掉：${stopCmd}）`);
    if (flags.open) openBrowser(running.url);
    return 0;
  }
  const background = !process.env.AUTO_EDIT_EDITOR_CHILD && (flags.background || (!flags.foreground && !process.stdout.isTTY));
  if (background) {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const logFile = path.join(path.dirname(stateFile), 'editor.log');
    const fd = fs.openSync(logFile, 'w');
    const args = [fileURLToPath(import.meta.url), ...argv.filter((a) => a !== '--background' && a !== '--open'), ...(flags.port && !argv.some((a) => a === '--port' || a.startsWith('--port=')) ? ['--port', String(flags.port)] : []), '--foreground'];
    const child = spawn(process.execPath, args, { cwd: process.cwd(), detached: true, stdio: ['ignore', fd, fd], windowsHide: true, env: { ...process.env, AUTO_EDIT_EDITOR_CHILD: '1' } });
    let exited = null;
    child.on('exit', (c) => { exited = c ?? 1; });
    child.unref();
    fs.closeSync(fd);
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      await sleep(120);
      const s = readJson(stateFile);
      if (s?.pid === child.pid && s.url) {
        console.log(`剪輯：${s.url}`);
        console.log(`剪輯清單：${new URL('cuts', s.url).href}`);
        console.log(`構圖：${new URL('framing', s.url).href}`);
        console.log(`分鏡表：${new URL('storyboard', s.url).href}`);
        console.log(`完成影片預覽：${new URL('?view=final', s.url).href}`);
        console.log(`專案：${rel(P.project)}`);
        console.log(`已在背景執行（log：${rel(logFile)}）。關閉：${stopCmd}`);
        if (flags.open) openBrowser(s.url);
        return 0;
      }
      if (exited !== null) break;
    }
    let tail = '';
    try { tail = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-8).join('\n'); } catch { /* 沒有 log */ }
    console.error(`✖ 剪輯沒有啟動成功${exited === null ? '（等了 20 秒）' : ''}${tail ? `：\n${tail}` : ''}`);
    return 1;
  }
  const ed = await startEditor({ flags });
  const shutdown = async () => { await ed.close(); process.exit(0); };
  ed.ctx.onShutdown = shutdown;
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  if (ed.port !== (flags.port ?? DEFAULT_PORT)) console.log(`port ${flags.port ?? DEFAULT_PORT} 被佔用，改用 ${ed.port}`);
  console.log(`剪輯：${ed.url}`);
  console.log(`剪輯清單：${new URL('cuts', ed.url).href}`);
  console.log(`構圖：${new URL('framing', ed.url).href}`);
  console.log(`分鏡表：${new URL('storyboard', ed.url).href}`);
  console.log(`完成影片預覽：${new URL('?view=final', ed.url).href}`);
  console.log(`專案：${rel(P.project)}`);
  console.log(ed.ctx.player.available ? `播放器：HyperFrames ${ed.ctx.player.version ?? ''}` : `播放器：不能用（${ed.ctx.player.reason}），只有即時模擬`);
  console.log(process.env.AUTO_EDIT_EDITOR_CHILD ? `背景執行中。關閉：${stopCmd}` : '按 Ctrl+C 關閉');
  if (flags.open) openBrowser(ed.url);
  return null;   // 留著讓 server 繼續跑
}

// 用 realpath 比對：從 symlink 路徑執行時（例如測試用的假工作區）也要跑得起來
const isMain = (() => {
  try { return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  cli().then((code) => { if (code != null) process.exitCode = code; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
}

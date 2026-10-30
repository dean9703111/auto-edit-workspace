#!/usr/bin/env node
/**
 * 素材工具：看螢幕錄影與圖片、讀座標、接主軌（零依賴，只用 Node 22 與 ffmpeg／ffprobe）
 *
 *   node shared/template/tools/media.mjs scan --project projects/<專案>
 *       列出 素材/螢幕錄影/、素材/圖片/ 每個檔（長度、解析度、fps、有沒有聲音）；
 *       影片抽「畫面變化」＋固定間隔的格子，拼成帶時間的 contact sheet：work/media/<檔名>/sheet-01.jpg …
 *       寫 work/media/index.md（給 AI 讀：每一格是素材的第幾秒）與 index.json
 *   node shared/template/tools/media.mjs frame --project projects/<專案> --src 素材/螢幕錄影/<檔名> --at 12.5 [--grid]
 *       截一張原尺寸畫面到 work/media/frames/；--grid 疊每 100px 一條、標數字的座標格線（plan.json 的 box／moves／lens 用這個座標）
 *   node shared/template/tools/media.mjs main --project projects/<專案> [--order 檔名1,檔名2,…]
 *       把 素材/真人錄影/ 與 素材/聲音/ 的檔照檔名排序（或 --order 的順序）接成 work/main.mp4：
 *       聲音檔配純黑畫面；解析度／fps 跟第一支真人錄影（沒有就 1920×1080 30fps）；聲音統一 48k AAC。
 *       同時寫 work/main.json：{ "clips": [{ "file", "kind": "camera"|"voice", "start", "end" }] }
 *       只有一支真人錄影時不用接，直接用它。
 *
 *   node shared/template/tools/media.mjs snap-srt --project projects/<專案> [--dry-run] [--below <dB>]
 *       把 work/rough.srt 每則字幕的起點對齊到實際開口的時間（逐字稿的時間碼只有整句，常比嘴巴早 1 秒左右）：
 *       用 ffmpeg 把 work/rough.mp4 的聲音解出來算能量包絡，門檻取這支音軌自己的「說話音量」與「底噪」之間（相對值，不寫死 dB；
 *       --below <dB> 可手動改成「說話音量減 dB」），找出說話區間；每則起點對齊到附近最接近的開口點（字幕比開口早 1.5 秒到晚 0.6 秒的範圍內，差超過 0.25 秒才動）；
 *       結尾拖進靜音超過 0.4 秒就收到說話結束＋0.15 秒。字幕不重疊、每則至少 0.6 秒、順序不變。
 *       寫回前先把原檔備份成 work/rough.srt.bak-<時間戳>（不刪任何檔）；--dry-run 只印調整表、不寫。
 *       只在「剪乾淨」做完字幕校正後跑一次；之後在剪輯台改的時間不要再跑它（會蓋掉）。build 不會自動執行它。
 *
 * --project：專案資料夾（projects/範例，或只寫名稱 範例）；沒寫時規則同 build.mjs。測試用：--template <shared/template 資料夾>
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathsFrom, projectLabel } from './build.mjs';
import { parseSrt } from './lib/srt.mjs';
import { run, probeMedia, rawFrame, writeJpg, blackDetect, VIDEO_EXT, IMAGE_EXT, AUDIO_EXT } from './lib/ff.mjs';
import { canvas, fillRect, blit, text, textWidth } from './lib/raster.mjs';

const VALUE_FLAGS = ['project', 'template', 'src', 'at', 'order', 'below'];
const r3 = (n) => +Number(n).toFixed(3);
const rel = (p) => path.relative(process.cwd(), p) || '.';
const posix = (p) => p.split(path.sep).join('/');
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const natural = (a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true, sensitivity: 'base' });

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
    } else if (['grid', 'help', 'dry-run'].includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數（用 --help 看用法）`);
  }
  return flags;
}

const listFiles = (dir, exts) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.') && exts.includes(path.extname(f).toLowerCase())).sort(natural) : []);

// ---------- scan ----------

const SHEET = { cols: 4, rows: 4, cell: 456, gap: 16, bar: 40, bg: [30, 39, 64], barBg: [11, 16, 32], ink: [255, 255, 255], mark: [255, 212, 0] };

function sceneTimes(file) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-sn', '-vf', "scale=320:-2,select='gt(scene,0.25)',showinfo", '-f', 'null', '-']);
  if (r.status !== 0) return [];
  return [...String(r.stderr).matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
}

// 抽哪幾格：畫面變化的地方（＋0.2 秒，等畫面穩定）優先，再用固定間隔補空白；最多 64 格
export function pickTimes(dur, scenes) {
  const step = Math.min(15, Math.max(1.5, dur / 24));
  const end = Math.max(0, dur - 0.2);
  const out = [{ t: 0, scene: false }];
  const near = (t, gap) => out.some((x) => Math.abs(x.t - t) < gap);
  for (const s of scenes) { const t = Math.min(end, s + 0.2); if (!near(t, 1)) out.push({ t: r3(t), scene: true }); }
  for (let t = step; t < end; t += step) if (!near(t, step / 2)) out.push({ t: r3(t), scene: false });
  if (end > 0.5 && !near(end, 1)) out.push({ t: r3(end), scene: false });
  out.sort((a, b) => a.t - b.t);
  while (out.length > 64) {
    let k = 1, best = Infinity;   // 拿掉離前一格最近的非畫面變化格
    for (let i = 1; i < out.length - 1; i++) { const g = out[i].t - out[i - 1].t + (out[i].scene ? 1000 : 0); if (g < best) { best = g; k = i; } }
    out.splice(k, 1);
  }
  return out;
}

function makeSheets(file, info, cells, outDir) {
  const tw = SHEET.cell, th = Math.max(2, Math.round((tw * info.height) / info.width / 2) * 2);
  const per = SHEET.cols * SHEET.rows;
  const sheets = [];
  for (let p = 0; p * per < cells.length; p++) {
    const part = cells.slice(p * per, (p + 1) * per);
    const rows = Math.ceil(part.length / SHEET.cols);
    const W = SHEET.gap + SHEET.cols * (tw + SHEET.gap), H = SHEET.gap + rows * (SHEET.bar + th + SHEET.gap);
    const c = canvas(W, H, SHEET.bg);
    part.forEach((cell, i) => {
      const x = SHEET.gap + (i % SHEET.cols) * (tw + SHEET.gap), y = SHEET.gap + Math.floor(i / SHEET.cols) * (SHEET.bar + th + SHEET.gap);
      fillRect(c, x, y, tw, SHEET.bar, SHEET.barBg);
      text(c, `#${cell.n} ${cell.label}`, x + 10, y + 6, 4, SHEET.ink);
      if (cell.scene) fillRect(c, x + tw - 26, y + 10, 16, 20, SHEET.mark);   // 黃色小方塊＝畫面變化的那一格
      blit(c, { w: tw, h: th, data: rawFrame(file, { at: cell.t, width: tw, height: th }) }, x, y + SHEET.bar);
    });
    const out = path.join(outDir, `sheet-${String(p + 1).padStart(2, '0')}.jpg`);
    writeJpg(c, out);
    sheets.push({ file: out, cells: part });
  }
  return sheets;
}

export function scan(P, { log = console.log } = {}) {
  const proj = P.project;
  const media = path.join(proj, 'work', 'media');
  fs.mkdirSync(media, { recursive: true });
  const projRel = projectLabel(P, proj);
  const entries = [];
  const used = new Set();
  for (const [dir, exts, kind] of [['螢幕錄影', VIDEO_EXT, 'video'], ['圖片', IMAGE_EXT, 'image']]) {
    for (const f of listFiles(path.join(proj, '素材', dir), exts)) {
      const src = `素材/${dir}/${f}`;
      const abs = path.join(proj, '素材', dir, f);
      let info;
      try { info = probeMedia(abs); } catch (e) { entries.push({ src, kind, error: e.message }); continue; }
      const e = { src, kind, duration: info.duration, width: info.width, height: info.height, fps: info.fps, vfr: info.vfr, hasAudio: info.hasAudio, sheets: [] };
      if (kind === 'video' && info.width) {
        let stem = path.basename(f, path.extname(f));
        if (used.has(stem)) stem = f;
        used.add(stem);
        const dirOut = path.join(media, stem);
        fs.mkdirSync(dirOut, { recursive: true });
        for (const old of fs.readdirSync(dirOut).filter((x) => /^sheet-\d+\.jpg$/.test(x))) fs.unlinkSync(path.join(dirOut, old));
        log(`掃描 ${src}（${info.duration}s）…`);
        const cells = pickTimes(info.duration, sceneTimes(abs)).map((c, i) => ({ ...c, n: i + 1, label: fmtT(c.t) }));
        e.sheets = makeSheets(abs, info, cells, dirOut).map((s) => ({ file: posix(path.relative(proj, s.file)), cells: s.cells.map(({ n, t, scene }) => ({ n, t, scene })) }));
      }
      entries.push(e);
    }
  }
  // 只有聲音的區間（有 rough.mp4 時一起列，AI 知道哪幾段一定要配素材）
  let voiceOnly = null;
  const rough = path.join(proj, 'work', 'rough.mp4');
  if (fs.existsSync(rough)) {
    try { voiceOnly = blackDetect(rough, path.join(proj, 'work', 'hyperframes', '.cache', 'blackdetect.json'), () => log('偵測 rough.mp4 只有聲音的區間…')); } catch { voiceOnly = null; }
  }
  const json = { project: projRel, scannedAt: new Date().toISOString(), files: entries, voiceOnly };
  fs.writeFileSync(path.join(media, 'index.json'), JSON.stringify(json, null, 2) + '\n');
  fs.writeFileSync(path.join(media, 'index.md'), indexMd(json));
  return json;
}

function indexMd(j) {
  const L = [`# 素材清單（media.mjs scan 產生，不要手改）`, '', `專案：${j.project}　掃描時間：${j.scannedAt}`, ''];
  const vids = j.files.filter((f) => f.kind === 'video'), imgs = j.files.filter((f) => f.kind === 'image');
  L.push('## 螢幕錄影', '');
  if (!vids.length) L.push('（素材/螢幕錄影/ 是空的）', '');
  else {
    L.push('| 檔案（plan.json 的 src） | 長度 | 解析度（座標範圍） | fps | 聲音 | contact sheet |', '|---|---|---|---|---|---|');
    for (const v of vids) {
      if (v.error) { L.push(`| ${v.src} | ✖ ${v.error} | | | | |`); continue; }
      L.push(`| ${v.src} | ${fmtT(v.duration)}（${v.duration}s） | ${v.width}×${v.height} | ${v.fps}${v.vfr ? '（VFR，build 會轉成 30fps）' : ''} | ${v.hasAudio ? '有' : '沒有'} | ${v.sheets.map((s) => `work/${s.file.replace(/^work\//, '')}（#${s.cells[0].n}–#${s.cells[s.cells.length - 1].n}）`).join('、')} |`);
    }
    L.push('');
    for (const v of vids.filter((x) => !x.error)) {
      L.push(`### ${v.src} 每一格的時間`, '', '格子左上角是格號與「分:秒」；右上角有黃色小方塊的格子＝畫面在這裡變了（切頁、開視窗、跳出選單）。', '');
      L.push('| 格 | 素材秒數（in） | 怎麼選的 |', '|---|---|---|');
      for (const s of v.sheets) for (const c of s.cells) L.push(`| #${c.n} | ${c.t} | ${c.scene ? '畫面變化' : '固定間隔'} |`);
      L.push('');
    }
  }
  L.push('## 圖片', '');
  if (!imgs.length) L.push('（素材/圖片/ 是空的）', '');
  else {
    L.push('| 檔案（plan.json 的 src） | 解析度（座標範圍） |', '|---|---|');
    for (const m of imgs) L.push(m.error ? `| ${m.src} | ✖ ${m.error} |` : `| ${m.src} | ${m.width}×${m.height} |`);
    L.push('');
  }
  if (j.voiceOnly) {
    L.push('## 只有聲音的區間（rough.mp4 全黑、沒有講者）', '');
    if (!j.voiceOnly.length) L.push('沒有。', '');
    else { L.push('這些區間一定要用 media 段（或不透明的全畫面情境）蓋住，build 才會過：', ''); for (const [a, b] of j.voiceOnly) L.push(`- rough.mp4 ${fmtT(a)}–${fmtT(b)}（${a}–${b}s，${r3(b - a)}s）`); L.push(''); }
  }
  L.push('## 怎麼用', '',
    '1. 打開每支錄影的 sheet，看每一格在做什麼操作；對照 `work/rough.srt`，找出口播在講那個操作的句子。',
    '2. 那一格的秒數＝plan.json media 段的 `in`（錄影從這裡開始播）；`from`／`to` 綁口播的句號。錄影比口播慢就用 `speed`（0.5–4）。',
    '3. 要框、要推近、要放大鏡時，用 `node shared/template/tools/media.mjs frame --project <專案> --src <檔案> --at <秒數> --grid` 截格線圖讀座標（素材原尺寸的像素）。',
    '4. 寫法與規則：`shared/template/USAGE.md` 第 5 節。', '');
  return L.join('\n');
}

// ---------- frame ----------

export function frame(P, { src, at = 0, grid = false } = {}) {
  if (!src) throw new Error('要寫 --src，例如 --src 素材/螢幕錄影/操作示範.mp4');
  const s = String(src).replace(/\\/g, '/');
  const abs = path.isAbsolute(s) ? s : path.join(P.project, ...s.split('/'));
  if (!fs.existsSync(abs)) throw new Error(`找不到 ${s}（路徑相對專案資料夾 ${rel(P.project)}，例如 素材/螢幕錄影/操作示範.mp4）`);
  const info = probeMedia(abs);
  if (!info.width) throw new Error(`${s} 讀不到畫面`);
  const t = Number(at) || 0;
  if (info.duration != null && t >= info.duration) throw new Error(`--at ${t} 超過素材長度 ${info.duration}s`);
  const c = { w: info.width, h: info.height, data: rawFrame(abs, { at: info.kind === 'image' ? 0 : t }) };
  if (grid) drawGrid(c);
  const stem = path.basename(abs, path.extname(abs));
  const out = path.join(P.project, 'work', 'media', 'frames', `${stem}${info.kind === 'image' ? '' : `-${r3(t)}s`}${grid ? '-grid' : ''}.jpg`);
  writeJpg(c, out, 2);
  return { file: out, width: info.width, height: info.height, kind: info.kind };
}

// 每 100px 一條線（每 500px 粗、亮一點），上緣與左緣標 x／y，每 500px 的線上再重複標一次（大圖縮小看也讀得到）
export function drawGrid(c) {
  const lw = c.w > 2400 ? 2 : 1;
  const sc = Math.max(2, Math.round(Math.max(c.w, c.h) / 900));
  const Y = [255, 212, 0], BG = [11, 16, 32];
  for (let x = 100; x < c.w; x += 100) fillRect(c, x - (lw >> 1), 0, lw, c.h, Y, x % 500 ? 0.35 : 0.75);
  for (let y = 100; y < c.h; y += 100) fillRect(c, 0, y - (lw >> 1), c.w, lw, Y, y % 500 ? 0.35 : 0.75);
  const label = (str, x, y) => {
    const w = textWidth(str, sc) + 2 * sc, h = 7 * sc + 2 * sc;
    const lx = Math.min(Math.max(0, x), c.w - w), ly = Math.min(Math.max(0, y), c.h - h);
    fillRect(c, lx, ly, w, h, BG, 0.85);
    text(c, str, lx + sc, ly + sc, sc, Y);
  };
  const rowsAt = [0, ...Array.from({ length: Math.floor((c.h - 1) / 500) }, (_, i) => (i + 1) * 500)];
  const colsAt = [0, ...Array.from({ length: Math.floor((c.w - 1) / 500) }, (_, i) => (i + 1) * 500)];
  // x 數字在橫線上方、y 數字在橫線下方，交叉點不會疊在一起
  for (let x = 100; x < c.w; x += 100) for (const ry of rowsAt) label(String(x), x + 2 * sc, ry ? ry - 11 * sc : 2 * sc);
  for (let y = 100; y < c.h; y += 100) for (const cx of colsAt) label(String(y), cx + 2 * sc, y + 2 * sc);
}

// ---------- main ----------

export function joinMain(P, { order = null, log = console.log } = {}) {
  const proj = P.project;
  const cams = listFiles(path.join(proj, '素材', '真人錄影'), VIDEO_EXT).map((f) => ({ name: f, file: `素材/真人錄影/${f}`, kind: 'camera' }));
  const voices = listFiles(path.join(proj, '素材', '聲音'), [...AUDIO_EXT, ...VIDEO_EXT]).map((f) => ({ name: f, file: `素材/聲音/${f}`, kind: 'voice' }));
  let list = [...cams, ...voices].sort((a, b) => natural(a.name, b.name));
  if (!list.length) throw new Error('素材/真人錄影/ 和 素材/聲音/ 都是空的：先把口播影片或旁白放進去');
  if (order) {
    const want = String(order).split(',').map((s) => s.trim()).filter(Boolean);
    const picked = want.map((w) => {
      const hit = list.find((x) => x.name === w || x.file === w.replace(/\\/g, '/'));
      if (!hit) throw new Error(`--order 的「${w}」找不到 → 現有：${list.map((x) => x.name).join('、')}`);
      return hit;
    });
    const left = list.filter((x) => !picked.includes(x));
    if (left.length) log(`⚠ 這些檔沒寫在 --order，不接進主軌：${left.map((x) => x.name).join('、')}`);
    list = picked;
  }
  if (list.length === 1 && list[0].kind === 'camera') {
    log(`只有一支真人錄影（${list[0].file}），不用接：轉逐字稿、auto-editor 直接用它。`);
    return null;
  }
  // 規格跟第一支真人錄影
  const first = list.find((x) => x.kind === 'camera');
  let W = 1920, H = 1080, F = 30;
  if (first) {
    const info = probeMedia(path.join(proj, ...first.file.split('/')));
    W = Math.floor((info.width || 1920) / 2) * 2; H = Math.floor((info.height || 1080) / 2) * 2;
    F = info.vfr || !info.fps || info.fps > 61 ? 30 : Math.round(info.fps * 100) / 100;
  }
  // 一次接完（concat filter）：每一段的畫面與聲音都裁／補到同一個長度，接縫不會越接越偏
  const inputs = [], chains = [], labels = [], clips = [];
  let t = 0;
  list.forEach((x, i) => {
    const abs = path.join(proj, ...x.file.split('/'));
    const info = probeMedia(abs);
    if (x.kind === 'voice' && !info.hasAudio) throw new Error(`${x.file} 沒有聲音軌`);
    const D = r3(Math.round(info.duration * F) / F);
    inputs.push('-i', abs);
    if (x.kind === 'camera') chains.push(`[${i}:v:0]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${F},format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=duration=${D},setpts=PTS-STARTPTS[v${i}]`);
    // 聲音檔配純黑畫面（build 靠 blackdetect 認出「只有聲音」的區間，一定要是合成的純黑）
    else chains.push(`color=c=black:s=${W}x${H}:r=${F}:d=${D},format=yuv420p,setpts=PTS-STARTPTS[v${i}]`);
    if (info.hasAudio) chains.push(`[${i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${D},asetpts=PTS-STARTPTS[a${i}]`);
    else chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${D},asetpts=PTS-STARTPTS[a${i}]`);
    labels.push(`[v${i}][a${i}]`);
    clips.push({ file: x.file, kind: x.kind, start: r3(t), end: r3(t + D) });
    t += D;
    log(`接主軌 ${i + 1}/${list.length}：${x.file}${x.kind === 'voice' ? '（聲音，配純黑畫面）' : ''}（${D}s）`);
  });
  const graph = `${chains.join(';')};${labels.join('')}concat=n=${list.length}:v=1:a=1[v][a]`;
  const mainFile = path.join(proj, 'work', 'main.mp4');
  log('轉檔中…');
  const r = run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', String(Math.round(F)), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', mainFile]);
  if (r.status !== 0) throw new Error(`接主軌失敗：${String(r.stderr).trim().slice(-400)}`);
  const json = { clips };
  fs.writeFileSync(path.join(proj, 'work', 'main.json'), JSON.stringify(json, null, 2) + '\n');
  return { file: mainFile, width: W, height: H, fps: F, duration: probeMedia(mainFile).duration, clips };
}

// ---------- snap-srt ----------

// 對齊參數（理由見 USAGE.md 3.4／AGENTS.md「剪乾淨」第 6 步；調整請連同 timing.test.mjs 一起看）
export const SNAP = {
  minSilence: 0.15,  // 短於這個的空檔算咬字間隙，不當成停頓（中文字與字之間常有 0.05–0.1 秒的低能量；實測 0.1 會把一句話切成碎片）
  minSpeech: 0.08,   // 短於這個的聲響（喀嗒、呼吸）不算說話
  early: 0.6,        // 開口點最多比字幕起點早這麼多（字幕偏晚的情況少見）
  late: 1.5,         // 開口點最多比字幕起點晚這麼多（症狀是字幕比嘴巴早約 1 秒；實測偏 1.0 秒再加上起點本來就落在句首前 0.2 秒，會到 1.2 秒，1.2 剛好壓線所以放到 1.5）
  tolerance: 0.25,   // 差在這以內不動（口播本來就有 0.1–0.2 秒的前導氣聲，不要為了零頭亂動）
  tailSilence: 0.4,  // 結尾拖進靜音超過這個秒數才收
  tailPad: 0.15,     // 收尾時留在說話結束後面的秒數
  minDur: 0.6,       // 每則至少這麼長
  lead: 0.03,        // 開口點往前留一點（輕子音的能量低於門檻，會晚一點點才算開口）
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
export function speechFromEnvelope(env, threshold, { minSilence = SNAP.minSilence, minSpeech = SNAP.minSpeech } = {}) {
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

// 純函式：cues ＋ 說話區間 → 新的 cues ＋ 調整表（測試直接餵合成資料）
//   cues：[{ n, start, end, text }]；speech：[[起, 迄], …]（照時間排序）
export function snapCues(cues, speech, opt = {}) {
  const o = { ...SNAP, ...opt };
  const onsets = speech.map(([a]) => a);
  const startOf = cues.map((c) => c.start);
  const prop = cues.map((c, i) => {
    // 起點已經落在某個開口點 tolerance 內 → 不動
    if (onsets.some((t) => Math.abs(t - c.start) <= o.tolerance)) return c.start;
    let best = null;
    for (const t of onsets) {
      const d = t - c.start;                      // 正＝開口比字幕晚（字幕偏早）
      if (d < -o.early || d > o.late) continue;
      if (best == null || Math.abs(d) < Math.abs(best - c.start)) best = t;
    }
    return best == null ? c.start : r3(Math.max(0, best - o.lead));
  });
  // 不重疊、每則至少 minDur、順序不變：動過的起點撞到鄰居就退回原值，直到沒有衝突
  for (let guard = 0; guard < cues.length + 2; guard++) {
    let bad = false;
    for (let i = 0; i + 1 < cues.length; i++) {
      if (prop[i + 1] - prop[i] >= o.minDur - 1e-6) continue;
      const mi = Math.abs(prop[i] - startOf[i]) > 1e-6, mj = Math.abs(prop[i + 1] - startOf[i + 1]) > 1e-6;
      if (mi) { prop[i] = startOf[i]; bad = true; } else if (mj) { prop[i + 1] = startOf[i + 1]; bad = true; }
    }
    if (!bad) break;
  }
  const speechEndBefore = (t) => {   // t 落在靜音裡時，前一段說話的結束點；t 在說話中回 null
    let prev = null;
    for (const [a, b] of speech) { if (t >= a && t <= b) return null; if (b <= t) prev = b; else break; }
    return prev;
  };
  const rows = cues.map((c, i) => {
    const next = cues[i + 1];
    const ns = prop[i];
    let ne = c.end;
    const adjacent = next && c.end >= next.start - 0.05;   // 原本就首尾相連：跟著下一則的新起點走，畫面上不會出現空檔
    if (adjacent) ne = prop[i + 1];
    else ne = Math.max(c.end, ns + o.minDur);
    // 結尾拖進靜音太久 → 收到說話結束＋tailPad（只收不延）
    const se = speechEndBefore(ne);
    if (se != null && se > ns && ne - se > o.tailSilence) ne = Math.min(ne, r3(se + o.tailPad));
    if (next) ne = Math.min(ne, prop[i + 1]);
    ne = r3(Math.max(ne, ns + o.minDur));
    if (next && ne > prop[i + 1] + 1e-6) ne = prop[i + 1];   // 極端：空檔不夠 minDur，寧可短也不重疊（前面的退回已盡量避免）
    return { n: c.n, text: c.text, start0: c.start, end0: c.end, start: r3(ns), end: r3(ne), dStart: r3(ns - c.start), dEnd: r3(ne - c.end) };
  });
  return { rows, cues: cues.map((c, i) => ({ ...c, start: rows[i].start, end: rows[i].end })), changed: rows.filter((r) => r.dStart !== 0 || r.dEnd !== 0) };
}

const stampSrt = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

// 只改時間行，文字、空行、換行風格、BOM 全部原樣保留
export function rewriteSrtTimes(text, rows) {
  const byN = new Map(rows.map((r) => [r.n, r]));
  const lines = String(text).split(/(\r?\n)/);   // 保留換行符
  let prevNum = null;
  for (let i = 0; i < lines.length; i += 2) {
    const ln = lines[i];
    const m = ln.match(/^(\s*)([\d:,.]+)(\s*-->\s*)([\d:,.]+)(.*)$/);
    if (m && prevNum != null && byN.has(prevNum)) {
      const r = byN.get(prevNum);
      lines[i] = `${m[1]}${stampSrt(r.start)}${m[3]}${stampSrt(r.end)}${m[5]}`;
      prevNum = null;
    } else if (/^\s*\d+\s*$/.test(ln.replace(/^﻿/, ''))) prevNum = Number(ln.replace(/^﻿/, '').trim());
  }
  return lines.join('');
}

export function snapSrt(P, { dryRun = false, below = null, log = console.log, now = new Date() } = {}) {
  const work = path.join(P.project, 'work');
  const srtFile = path.join(work, 'rough.srt'), mp4 = path.join(work, 'rough.mp4');
  if (!fs.existsSync(srtFile)) throw new Error(`找不到 ${rel(srtFile)} → 先照 AGENTS.md「剪乾淨」第 6 步產生 rough.srt`);
  if (!fs.existsSync(mp4)) throw new Error(`找不到 ${rel(mp4)} → 先剪出 work/rough.mp4（字幕的時間是對它的）`);
  if (below != null && !(Number(below) >= 5 && Number(below) <= 60)) throw new Error(`--below 要是 5–60 之間的 dB 數字（門檻＝說話音量減這個數字；不寫＝自動），現在是「${below}」`);
  const text = fs.readFileSync(srtFile, 'utf8');
  const cues = parseSrt(text);
  if (!cues.length) throw new Error(`${rel(srtFile)} 讀不到任何字幕`);
  const info = probeMedia(mp4);
  if (!info.hasAudio) throw new Error(`${rel(mp4)} 沒有聲音軌，沒辦法找開口時間`);
  const env = envelope(mp4);
  const th = pickThreshold(env.db, below == null ? null : Number(below));
  const speech = speechFromEnvelope(env, th.threshold);
  if (!speech.length) throw new Error(`用門檻 ${th.threshold} dB 找不到任何說話區間 → 試 --below 30（門檻放低）`);
  const res = snapCues(cues, speech, {});
  const T = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  log(`說話音量 ${r3(th.level)} dB、底噪 ${r3(th.floor)} dB → 開口門檻 ${th.threshold} dB${below == null ? '（相對這支音軌自動算）' : `（說話音量 −${below} dB，手動）`}；說話區間 ${speech.length} 段`);
  let backup = null;
  if (res.changed.length) {
    log('', '  則   起點（原 → 新）          差       結尾（原 → 新）          差');
    for (const r of res.changed) {
      const sg = (d) => (d === 0 ? '   —' : `${d > 0 ? '+' : '-'}${Math.abs(d).toFixed(2)}`);
      log(`  #${String(r.n).padEnd(3)} ${T(r.start0)} → ${T(r.start)}   ${sg(r.dStart).padStart(6)}    ${T(r.end0)} → ${T(r.end)}   ${sg(r.dEnd).padStart(6)}   ${r.text.slice(0, 14)}`);
    }
  }
  const moved = res.changed.filter((r) => r.dStart !== 0);
  const trimmed = res.changed.filter((r) => r.dEnd !== 0);
  log(`\n共 ${cues.length} 則：起點調整 ${moved.length} 則、結尾調整 ${trimmed.length} 則、不動 ${cues.length - res.changed.length} 則`);
  if (!res.changed.length) { log('字幕和開口時間都對得上，沒有寫任何檔。'); return { ...res, backup, written: false, threshold: th.threshold, speech }; }
  if (dryRun) { log('--dry-run：只印不寫，rough.srt 沒有動。'); return { ...res, backup, written: false, threshold: th.threshold, speech }; }
  const p2 = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
  backup = path.join(work, `rough.srt.bak-${ts}`);
  for (let k = 2; fs.existsSync(backup); k++) backup = path.join(work, `rough.srt.bak-${ts}-${k}`);
  fs.copyFileSync(srtFile, backup);
  fs.writeFileSync(srtFile, rewriteSrtTimes(text, res.rows));
  log(`已寫回 ${rel(srtFile)}；原檔備份在 ${rel(backup)}（要還原就把它複製回 rough.srt）`);
  log('→ 重跑 build 前先到剪輯台看一眼；之後不要再跑 snap-srt（會蓋掉你在剪輯台改的時間）。');
  return { ...res, backup, written: true, threshold: th.threshold, speech };
}

// ---------- CLI ----------

async function cli() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || !flags.cmd || flags.cmd === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  if (!['scan', 'frame', 'main', 'snap-srt'].includes(flags.cmd)) throw new Error(`沒有「${flags.cmd}」這個指令：只有 scan、frame、main、snap-srt（用 --help 看用法）`);
  const P = pathsFrom({ project: flags.project, template: flags.template });
  console.log(`專案：${rel(P.project)}`);
  if (flags.cmd === 'scan') {
    const j = scan(P);
    const v = j.files.filter((f) => f.kind === 'video'), im = j.files.filter((f) => f.kind === 'image');
    console.log(`\n螢幕錄影 ${v.length} 支、圖片 ${im.length} 張`);
    for (const f of j.files) console.log(f.error ? `✖ ${f.src}：${f.error}` : `- ${f.src}｜${f.kind === 'video' ? `${fmtT(f.duration)}｜` : ''}${f.width}×${f.height}${f.kind === 'video' ? `｜${f.hasAudio ? '有聲音' : '沒有聲音'}｜${f.sheets.map((s) => s.file).join('、')}` : ''}`);
    if (j.voiceOnly?.length) console.log(`只有聲音的區間（rough.mp4）：${j.voiceOnly.map(([a, b]) => `${fmtT(a)}–${fmtT(b)}`).join('、')} → 一定要用 media 段蓋住`);
    console.log(`\n→ 讀 ${rel(path.join(P.project, 'work', 'media', 'index.md'))}，打開 sheet 看每一格的畫面，對照字幕配對（USAGE.md 第 5 節）`);
    return 0;
  }
  if (flags.cmd === 'snap-srt') {
    snapSrt(P, { dryRun: !!flags['dry-run'], below: flags.below ?? SNAP.below });
    return 0;
  }
  if (flags.cmd === 'frame') {
    const r = frame(P, { src: flags.src, at: flags.at, grid: !!flags.grid });
    console.log(`→ ${rel(r.file)}（${r.width}×${r.height}；${flags.grid ? '格線每 100px 一條，數字是素材原尺寸的像素座標，box 寫 [x, y, w, h]' : '加 --grid 疊座標格線'}）`);
    return 0;
  }
  const r = joinMain(P, { order: flags.order });
  if (!r) return 0;
  console.log(`\n→ ${rel(r.file)}（${r.width}×${r.height}、${r.fps}fps、${r.duration}s）＋ ${rel(path.join(P.project, 'work', 'main.json'))}`);
  for (const c of r.clips) console.log(`  ${fmtT(c.start)}–${fmtT(c.end)}  ${c.kind === 'voice' ? '聲音' : '真人'}  ${c.file}`);
  return 0;
}

const isMain = () => {
  try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (isMain()) cli().then((code) => { process.exitCode = code; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });

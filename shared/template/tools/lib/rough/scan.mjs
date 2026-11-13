// 看素材：scan（contact sheet、事件、index.md）與 frame（截原尺寸畫面、座標格線）
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { spawnP, limiter } from '../proc.mjs';
import { canvas, fillRect, text, blit, textWidth } from '../raster.mjs';
import { writeJpg, blackDetect, VIDEO_EXT, probeMedia, IMAGE_EXT } from '../ff.mjs';
import { projectLabel } from '../project.mjs';
import { screenEvents, eventsMd } from '../events.mjs';
import { r3, escHtml, posix, listFiles, fmtT, rel } from './util.mjs';
import { parseClock } from './cuts.mjs';

// ---------- scan ----------

const SHEET = { cols: 4, rows: 4, cell: 456, gap: 16, bar: 40, bg: [30, 39, 64], barBg: [11, 16, 32], ink: [255, 255, 255], mark: [255, 212, 0] };

// contact sheet 優先取格的時間：事件變完、等待開始、捲動結束（ffmpeg 的 scene 分數在白底介面幾乎沒反應，改用 lib/events.mjs）
function sheetAnchors(ev) {
  if (!ev) return [];
  return [
    ...ev.events.map((e) => ({ t: e.settled, why: `${e.id} ${e.kind}` })),
    ...ev.waits.map((w) => ({ t: w.from, why: `${w.id} 等待開始` })),
    ...ev.scrolls.map((c) => ({ t: c.to, why: `${c.id} 捲完` })),
  ];
}

// 一格畫面 → rgb24（ff.mjs rawFrame 的非同步版，多格同時抽）
async function rawFrameAsync(file, { at = 0, width, height } = {}) {
  const args = ['-v', 'error'];
  if (at > 0) args.push('-ss', String(at));
  args.push('-i', file, '-frames:v', '1');
  if (width && height) args.push('-vf', `scale=${width}:${height}:flags=bicubic`);
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
  const r = await spawnP('ffmpeg', args, { binary: true });
  if (r.error) throw r.error.code === 'ENOENT' ? new Error('找不到 ffmpeg：先跑 npx hyperframes doctor') : r.error;
  if (r.status !== 0 || !r.stdout.length) throw new Error(`抽不到 ${path.basename(file)} 第 ${at}s 的畫面：${String(r.stderr).trim().slice(-300)}`);
  return r.stdout;
}

// 抽哪幾格：畫面變化的地方（＋0.2 秒，等畫面穩定）優先，再用固定間隔補空白；最多 64 格
export function pickTimes(dur, scenes) {
  const step = Math.min(15, Math.max(1.5, dur / 24));
  const end = Math.max(0, dur - 0.2);
  const out = [{ t: 0, scene: false }];
  const near = (t, gap) => out.some((x) => Math.abs(x.t - t) < gap);
  for (const s of [...scenes].map((x) => (typeof x === 'number' ? { t: x } : x)).sort((a, b) => a.t - b.t)) { const t = Math.min(end, s.t + 0.2); if (!near(t, 1)) out.push({ t: r3(t), scene: true, ...(s.why ? { why: s.why } : {}) }); }
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

export async function makeSheets(file, info, cells, outDir, lim) {
  const tw = SHEET.cell, th = Math.max(2, Math.round((tw * info.height) / info.width / 2) * 2);
  const per = SHEET.cols * SHEET.rows;
  const raws = await Promise.all(cells.map((cell) => lim(() => rawFrameAsync(file, { at: cell.t, width: tw, height: th }))));
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
      blit(c, { w: tw, h: th, data: raws[p * per + i] }, x, y + SHEET.bar);
    });
    const out = path.join(outDir, `sheet-${String(p + 1).padStart(2, '0')}.jpg`);
    writeJpg(c, out);
    sheets.push({ file: out, cells: part });
  }
  return sheets;
}

// 圖片的 contact sheet：每頁 12 張（4×3），每格上面標檔名。檔名多半有中文、點陣字畫不出來：先用點陣字標 #格號拼好，
// 有 HyperFrames 的 Chrome 再把標籤列蓋成「#格號 檔名」；沒有 Chrome 或截圖失敗時就留 #格號（index.md 有對照表）
export const IMG_SHEET = { cols: 4, rows: 3, cell: 456, h: 342, gap: 16, bar: 64 };
const sheetCss = '#1e2740';

async function imageThumb(file, lim) {
  const { cell: w, h } = IMG_SHEET;
  const graph = `color=c=0x1e2740:s=${w}x${h}:d=1[bg];[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=bicubic[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1`;
  const r = await lim(() => spawnP('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-filter_complex', graph, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { binary: true }));
  if (r.error || r.status !== 0 || r.stdout.length !== w * h * 3) throw new Error(`圖片縮圖失敗：${String(r.stderr).trim().slice(-200)}`);
  return r.stdout;
}

// Chrome 截本機 HTML（lib/raster.mjs htmlShot 的非同步版：掃素材時和 whisper、ffmpeg 同時跑）
async function chromeShot({ chrome, html, png, width, height, timeout = 60000 }) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-shot-'));
  try {
    const r = await new Promise((resolve) => {
      const cp = spawn(chrome, ['--headless', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1',
        `--window-size=${width},${height}`, '--virtual-time-budget=5000', `--user-data-dir=${userDir}`, `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore', windowsHide: true });
      const timer = setTimeout(() => cp.kill('SIGKILL'), timeout);
      cp.on('error', () => { clearTimeout(timer); resolve(false); });
      cp.on('exit', (code) => { clearTimeout(timer); resolve(code === 0 && fs.existsSync(png)); });
    });
    return r;
  } finally {
    for (let k = 0; k < 5; k++) { try { fs.rmSync(userDir, { recursive: true, force: true }); break; } catch { await new Promise((ok) => setTimeout(ok, 300)); } }
  }
}

export async function labelImageSheet({ chrome, file, cells, W, H, templateDir, tmp, page }) {
  const { cols, cell, h, gap, bar } = IMG_SHEET;
  const html = path.join(tmp, `p${page}.html`), png = path.join(tmp, `p${page}.png`);
  const labels = cells.map((c, i) => {
    const x = gap + (i % cols) * (cell + gap), y = gap + Math.floor(i / cols) * (bar + h + gap);
    return `<div class="l" style="left:${x}px;top:${y}px"><b>#${c.n}</b> ${escHtml(c.name)}</div>`;
  }).join('');
  fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(templateDir, 'kit', 'fonts.css')).href}">
<style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${sheetCss}}img{position:absolute;left:0;top:0;width:${W}px;height:${H}px}
.l{position:absolute;box-sizing:border-box;width:${cell}px;height:${bar}px;padding:4px 10px;background:#0b1020;color:#fff;font:600 22px/28px "Noto Sans TC",sans-serif;word-break:break-all;overflow:hidden}.l b{color:#ffd400}</style></head>
<body><img src="${pathToFileURL(file).href}">${labels}</body></html>`);
  if (!(await chromeShot({ chrome, html, png, width: W, height: H }))) return false;
  const r = await spawnP('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '3', file]);
  return !r.error && r.status === 0;
}

async function makeImageSheets(P, items, outDir, lim, chrome) {
  const { cols, rows, cell, h, gap, bar } = IMG_SHEET;
  const per = cols * rows;
  fs.mkdirSync(outDir, { recursive: true });
  for (const old of fs.readdirSync(outDir).filter((x) => /^sheet-\d+\.jpg$/.test(x))) fs.unlinkSync(path.join(outDir, old));
  const thumbs = await Promise.all(items.map((it) => imageThumb(it.abs, lim).catch(() => null)));
  const sheets = [];
  for (let p = 0; p * per < items.length; p++) {
    const part = items.slice(p * per, (p + 1) * per);
    const nRows = Math.ceil(part.length / cols);
    const W = gap + cols * (cell + gap), H = gap + nRows * (bar + h + gap);
    const c = canvas(W, H, SHEET.bg);
    part.forEach((it, i) => {
      const x = gap + (i % cols) * (cell + gap), y = gap + Math.floor(i / cols) * (bar + h + gap);
      fillRect(c, x, y, cell, bar, SHEET.barBg);
      text(c, `#${it.n}`, x + 10, y + 18, 4, SHEET.ink);
      const t = thumbs[p * per + i];
      if (t) blit(c, { w: cell, h, data: t }, x, y + bar);
    });
    const file = path.join(outDir, `sheet-${String(p + 1).padStart(2, '0')}.jpg`);
    writeJpg(c, file);
    sheets.push({ file, W, H, cells: part.map((it) => ({ n: it.n, src: it.src, name: path.basename(it.src) })) });
  }
  let labels = 'number';
  if (chrome) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'img-sheet-'));
    const two = limiter(2);
    try {
      const done = await Promise.all(sheets.map((sh, i) => two(() => labelImageSheet({ chrome, file: sh.file, cells: sh.cells, W: sh.W, H: sh.H, templateDir: P.templateDir, tmp, page: i + 1 }).catch(() => false))));
      if (done.every(Boolean)) labels = 'filename';
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  return { labels, sheets: sheets.map((sh) => ({ file: posix(path.relative(P.project, sh.file)), cells: sh.cells.map(({ n, src }) => ({ n, src })) })) };
}

async function probeImage(abs, lim) {
  const r = await lim(() => spawnP('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', abs]));
  if (r.error) throw r.error.code === 'ENOENT' ? new Error('找不到 ffprobe：先跑 npx hyperframes doctor 安裝 ffmpeg，或確認 ffprobe 在 PATH 裡') : r.error;
  const m = String(r.stdout).trim().match(/^(\d+),(\d+)/);
  if (r.status !== 0 || !m) throw new Error(`ffprobe 讀不到 ${path.basename(abs)}：${String(r.stderr).trim().slice(-200)}（檔案壞了，或不是影片／圖片）`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

// 找 HyperFrames 的 Chrome：找不到回 null（圖片 contact sheet 就只標 #格號）
export async function chromeOrNull() {
  try { return (await import('../audit-browser.mjs')).findChrome(); } catch { return null; }
}

// 背景跑 blackDetect（ff.mjs，同步、要解整支影片）：放到子行程跑完再讀快取，不擋住其他同時在跑的工作
export async function blackDetectBg(file, cacheFile) {
  const ff = new URL('../ff.mjs', import.meta.url).href;
  await spawnP(process.execPath, ['--input-type=module', '-e', `import { blackDetect } from ${JSON.stringify(ff)}; blackDetect(${JSON.stringify(file)}, ${JSON.stringify(cacheFile)});`]);
  return blackDetect(file, cacheFile);
}
export const blackCacheOf = (P) => path.join(P.project, 'work', 'hyperframes', '.cache', 'blackdetect.json');

// rough.mp4 做好之後更新 work/media/index.md 的「只有聲音的區間」（掃素材常在初剪之前；不重抽 contact sheet）
export function refreshVoiceOnly(P, voiceOnly) {
  const file = path.join(P.project, 'work', 'media', 'index.json');
  let json;
  try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return false; }
  json.voiceOnly = voiceOnly;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  fs.writeFileSync(path.join(P.project, 'work', 'media', 'index.md'), indexMd(json));
  return true;
}

// chrome：不傳＝自己找（找不到就只標 #格號）；false＝不用 Chrome
export async function scan(P, { log = () => {}, chrome } = {}) {
  const proj = P.project;
  const media = path.join(proj, 'work', 'media');
  fs.mkdirSync(media, { recursive: true });
  const projRel = projectLabel(P, proj);
  const lim = limiter();
  const used = new Set(['images', 'frames', 'notes']);   // work/media 底下工具自己的資料夾
  const videos = listFiles(path.join(proj, 'assets', 'screen'), VIDEO_EXT).map((f) => {
    let stem = path.basename(f, path.extname(f));
    if (used.has(stem)) stem = f;
    used.add(stem);
    return { f, stem };
  });
  const vidEntries = await Promise.all(videos.map(async ({ f, stem }) => {
    const src = `assets/screen/${f}`, abs = path.join(proj, 'assets', 'screen', f);
    let info;
    try { info = probeMedia(abs); } catch (e) { return { src, kind: 'video', error: e.message }; }
    const e = { src, kind: 'video', duration: info.duration, width: info.width, height: info.height, fps: info.fps, vfr: info.vfr, hasAudio: info.hasAudio, sheets: [] };
    if (!info.width) return e;
    const dirOut = path.join(media, stem);
    fs.mkdirSync(dirOut, { recursive: true });
    for (const old of fs.readdirSync(dirOut).filter((x) => /^sheet-\d+\.jpg$/.test(x))) fs.unlinkSync(path.join(dirOut, old));
    log(`掃描 ${src}（${info.duration}s）…`);
    try {
      let ev = null;
      try { ev = await lim(() => screenEvents(abs, info)); } catch (err) { log(`⚠ ${src} 畫面分析失敗：${err.message}`); }
      const cells = pickTimes(info.duration, sheetAnchors(ev)).map((c, i) => ({ ...c, n: i + 1, label: fmtT(c.t) }));
      e.sheets = (await makeSheets(abs, info, cells, dirOut, lim)).map((sh) => ({ file: posix(path.relative(proj, sh.file)), cells: sh.cells.map(({ n, t, scene, why }) => ({ n, t, scene, ...(why ? { why } : {}) })) }));
      const rows = e.sheets.flatMap((sh) => sh.cells.map((c) => ({ ...c, sheet: path.basename(sh.file) })));
      fs.writeFileSync(path.join(dirOut, 'events.md'), eventsMd({ src, info, ev, cells: rows }));
      fs.writeFileSync(path.join(dirOut, 'events.json'), `${JSON.stringify(ev ?? { events: [], waits: [], scrolls: [], failed: true })}\n`);
      e.events = { file: posix(path.relative(proj, path.join(dirOut, 'events.md'))), n: ev?.events.length ?? 0, waits: ev?.waits.length ?? 0, scrolls: ev?.scrolls.length ?? 0 };
    } catch (err) { e.error = err.message; }
    return e;
  }));
  const imgFiles = listFiles(path.join(proj, 'assets', 'images'), IMAGE_EXT);
  const imgEntries = await Promise.all(imgFiles.map(async (f) => {
    const src = `assets/images/${f}`, abs = path.join(proj, 'assets', 'images', f);
    try {
      const { width, height } = await probeImage(abs, lim);
      return { src, kind: 'image', duration: null, width, height, fps: null, vfr: false, hasAudio: false, sheets: [] };
    } catch (e) { return { src, kind: 'image', error: e.message }; }
  }));
  // 圖片 contact sheet（work/media/images/）：讀不到的圖不放
  const okImgs = imgEntries.filter((e) => !e.error).map((e, i) => ({ src: e.src, abs: path.join(proj, ...e.src.split('/')), n: i + 1 }));
  let images = { labels: 'number', sheets: [] };
  if (okImgs.length) {
    const ch = chrome === false ? null : chrome || await chromeOrNull();
    images = await makeImageSheets(P, okImgs, path.join(media, 'images'), lim, ch);
    for (const sh of images.sheets) for (const c of sh.cells) { const e = imgEntries.find((x) => x.src === c.src); if (e) { e.sheet = sh.file; e.cell = c.n; } }
  } else if (fs.existsSync(path.join(media, 'images'))) {
    for (const old of fs.readdirSync(path.join(media, 'images')).filter((x) => /^sheet-\d+\.jpg$/.test(x))) fs.unlinkSync(path.join(media, 'images', old));
  }
  const entries = [...vidEntries, ...imgEntries];
  // 只有聲音的區間（有 rough.mp4 時一起列，AI 知道哪幾段一定要配素材）
  let voiceOnly = null;
  const rough = path.join(proj, 'work', 'rough.mp4');
  if (fs.existsSync(rough)) {
    try { log('偵測 rough.mp4 只有聲音的區間…'); voiceOnly = await blackDetectBg(rough, blackCacheOf(P)); } catch { voiceOnly = null; }
  }
  // 已經接進主軌的邊錄邊講錄影：畫面由 screen-sync 蓋回，不用再配
  let narrated = [];
  try { narrated = (JSON.parse(fs.readFileSync(path.join(proj, 'work', 'main.json'), 'utf8')).clips || []).filter((c) => c.kind === 'screen').map((c) => c.file); } catch { narrated = []; }
  for (const e of entries) if (narrated.includes(e.src)) e.inMain = true;
  const skipped = (dir, exts) => (fs.existsSync(path.join(proj, 'assets', dir)) ? fs.readdirSync(path.join(proj, 'assets', dir)).filter((x) => !x.startsWith('.') && !exts.includes(path.extname(x).toLowerCase()) && fs.statSync(path.join(proj, 'assets', dir, x)).isFile()).map((x) => `assets/${dir}/${x}`) : []);
  const json = { project: projRel, scannedAt: new Date().toISOString(), files: entries, images, skipped: [...skipped('screen', VIDEO_EXT), ...skipped('images', IMAGE_EXT)], voiceOnly };
  fs.writeFileSync(path.join(media, 'index.json'), JSON.stringify(json, null, 2) + '\n');
  fs.writeFileSync(path.join(media, 'index.md'), indexMd(json));
  writeImageIndex(media, json);
  return json;
}

// 統計一行（scan 只印這行，細節在 index.md）
export function scanSummary(j, sec = null) {
  const v = j.files.filter((f) => f.kind === 'video'), im = j.files.filter((f) => f.kind === 'image');
  const bad = j.files.filter((f) => f.error).length;
  const vs = v.reduce((n, f) => n + (f.sheets?.length || 0), 0), is = j.images?.sheets?.length || 0;
  const parts = [`螢幕錄影 ${v.length} 支${vs ? `（contact sheet ${vs} 張）` : ''}`, `圖片 ${im.length} 張${is ? `（contact sheet ${is} 張${j.images.labels === 'filename' ? '' : '，沒有 Chrome：每格只標 #格號'}）` : ''}`];
  if (j.voiceOnly?.length) parts.push(`只有聲音的區間 ${j.voiceOnly.length} 段`);
  if (bad) parts.push(`✖ ${bad} 個讀不到`);
  if (j.skipped?.length) parts.push(`⚠ ${j.skipped.length} 個檔格式不支援`);
  return `素材：${parts.join('、')}${sec != null ? `（用 ${sec}s）` : ''} → 細節在 work/media/index.md`;
}

// 素材沒換就不用重掃（prep 開頭用）：index.json 比所有素材新、檔案清單一樣
export function scanFresh(P) {
  const file = path.join(P.project, 'work', 'media', 'index.json');
  let j, st;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); st = fs.statSync(file); } catch { return false; }
  if (!Array.isArray(j.images?.sheets)) return false;   // 舊版掃的：沒有圖片 contact sheet
  if ((j.files || []).some((f) => f.kind === 'video' && !f.error && f.width && !f.events)) return false;   // 舊版掃的：沒有 events.md
  const now = [...listFiles(path.join(P.project, 'assets', 'screen'), VIDEO_EXT).map((f) => `assets/screen/${f}`), ...listFiles(path.join(P.project, 'assets', 'images'), IMAGE_EXT).map((f) => `assets/images/${f}`)];
  const have = (j.files || []).map((f) => f.src);
  if (now.length !== have.length || now.some((x) => !have.includes(x))) return false;
  return now.every((x) => fs.statSync(path.join(P.project, ...x.split('/'))).mtimeMs <= st.mtimeMs);
}

// 圖片的解析度與所在格子（座標範圍）：圖片多的時候 index.md 只列 sheet，細節在這裡
const IMG_INLINE = 24;
const imageRows = (imgs) => ['| 檔案（plan.json 的 src） | 解析度（座標範圍） | contact sheet |', '|---|---|---|', ...imgs.map((m) => (m.error ? `| ${m.src} | ✖ ${m.error} | |` : `| ${m.src} | ${m.width}×${m.height} | ${m.sheet ? `${m.sheet} #${m.cell}` : ''} |`))];
function writeImageIndex(media, j) {
  const imgs = j.files.filter((f) => f.kind === 'image');
  if (imgs.length > IMG_INLINE) { fs.mkdirSync(path.join(media, 'images'), { recursive: true }); fs.writeFileSync(path.join(media, 'images', 'index.md'), ['# 圖片清單（media.mjs scan 產生，不要手改）', '', ...imageRows(imgs), ''].join('\n')); }
  else fs.rmSync(path.join(media, 'images', 'index.md'), { force: true });
}

function indexMd(j) {
  const L = [`# 素材清單（media.mjs scan 產生，不要手改）`, '', `專案：${j.project}　掃描時間：${j.scannedAt}`, ''];
  const vids = j.files.filter((f) => f.kind === 'video'), imgs = j.files.filter((f) => f.kind === 'image');
  L.push('## 螢幕錄影', '');
  if (!vids.length) L.push('（assets/screen/ 是空的）', '');
  else {
    L.push('每支錄影的事件（哪一秒切頁、開視窗、哪一塊變了、哪裡在等、哪裡在捲）和 contact sheet 每一格的秒數都在「細節」那一份：**要用哪支才讀哪支**。', '');
    L.push('| 檔案（plan.json 的 src） | 長度 | 解析度（座標範圍） | fps | 聲音 | 事件／等待／捲動 | 細節 |', '|---|---|---|---|---|---|---|');
    for (const v of vids) {
      if (v.error) { L.push(`| ${v.src} | ✖ ${v.error} | | | | | |`); continue; }
      L.push(`| ${v.src} | ${fmtT(v.duration)}（${v.duration}s） | ${v.width}×${v.height} | ${v.fps}${v.vfr ? '（VFR，build 會轉成 30fps）' : ''} | ${v.hasAudio ? '有' : '沒有'} | ${v.events ? `${v.events.n}／${v.events.waits}／${v.events.scrolls}` : '—'} | ${v.events?.file ?? ''}（sheet ${v.sheets.length} 張） |`);
    }
    L.push('');
    const inMain = vids.filter((v) => v.inMain);
    if (inMain.length) L.push(`已經接進主軌的邊錄邊講錄影：${inMain.map((v) => v.src).join('、')} → 畫面由 \`media.mjs screen-sync --write-plan\` 蓋回（plan.json 的 sync 段），不用再配；要標註就加在 sync 段上`, '');
  }
  L.push('## 圖片', '');
  if (!imgs.length) L.push('（assets/images/ 是空的）', '');
  else {
    const sheets = j.images?.sheets || [];
    if (sheets.length) L.push(`contact sheet：每頁 ${IMG_SHEET.cols * IMG_SHEET.rows} 張；${j.images.labels === 'filename' ? '每格上面是「#格號 檔名」' : `每格上面是 #格號，對照${imgs.length > IMG_INLINE ? ' work/media/images/index.md' : '下表'}（沒有 Chrome，檔名畫不上去）`}。`, '');
    if (imgs.length > IMG_INLINE) {
      const nameOf = (src) => path.basename(src);
      L.push('| contact sheet | 張數 | 範圍 |', '|---|---|---|');
      for (const sh of sheets) L.push(`| ${sh.file} | ${sh.cells.length} | ${nameOf(sh.cells[0].src)} … ${nameOf(sh.cells[sh.cells.length - 1].src)} |`);
      L.push('', '每張圖的解析度（座標範圍）：work/media/images/index.md', '');
    } else L.push(...imageRows(imgs), '');
  }
  if (j.skipped?.length) L.push('## 格式不支援（沒有掃）', '', ...j.skipped.map((x) => `- ${x} → 影片要 ${VIDEO_EXT.join('、')}，圖片要 ${IMAGE_EXT.join('、')}：轉檔後放回同一個資料夾再掃一次`), '');
  if (j.voiceOnly) {
    L.push('## 只有聲音的區間（rough.mp4 全黑、沒有講者）', '');
    if (!j.voiceOnly.length) L.push('沒有。', '');
    else { L.push('這些區間一定要用 media 段（或不透明的全畫面情境）蓋住，build 才會過：', ''); for (const [a, b] of j.voiceOnly) L.push(`- rough.mp4 ${fmtT(a)}–${fmtT(b)}（${a}–${b}s，${r3(b - a)}s）`); L.push(''); }
  }
  L.push('## 怎麼用', '',
    '1. 打開那支錄影的 `events.md`：照「事件」「等待」「捲動」的秒數找操作，不用整支看。要看畫面才開 sheet（圖片看 `work/media/images/sheet-NN.jpg`，一次看完，不用一張一張開）。對照 `work/rough.srt`，找出講解在講那個操作的句子。',
    '2. `events.md` 的「建議 in」＝plan.json media 段的 `in`、`retime` 第一點的 `src`；`from`／`to` 綁講解的句號。等待照表上的 `retime` 寫法壓短。',
    '3. 要框、要推近、要放大鏡：事件的框可以直接抄；其他的用 `node shared/template/tools/media.mjs frame --project <專案> --src <檔案> --at <秒數> --grid` 截格線圖讀座標（素材原尺寸的像素），`--box "x,y,w,h"` 把框畫上去確認。',
    '4. 寫法與規則：`shared/template/USAGE.md` 第 5 節。', '');
  return L.join('\n');
}

// ---------- frame ----------

// --at 12.5,30,47.2（也可以寫 1:03.5）→ [秒數]；不寫＝[0]
export function parseAtList(at) {
  if (at == null || at === '') return [0];
  const out = [];
  for (const raw of String(at).split(',').map((x) => x.trim()).filter(Boolean)) {
    const t = parseClock(raw);
    if (t == null) throw new Error(`--at 的「${raw}」看不懂 → 寫秒數，多個用逗號接：--at "12.5,30,47.2"`);
    if (!out.includes(t)) out.push(t);
  }
  return out.length ? out : [0];
}

// 一次截好幾個時間（auto-edit-screen 每個標註不用各跑一次）：同時截，回傳每張的 { file, at, width, height, kind }
// --box "x,y,w,h;x,y,w,h"：把候選框畫上去，一張圖確認位置對不對（框的那個東西那一刻真的在畫面上）
export function parseBoxes(v) {
  if (v == null) return [];
  const list = String(v).split(';').map((s) => s.trim()).filter(Boolean).map((s) => s.split(',').map(Number));
  if (!list.length || list.some((b) => b.length !== 4 || !b.every(Number.isFinite) || b[2] <= 0 || b[3] <= 0)) throw new Error(`--box 要寫 "x,y,w,h"（素材原尺寸的像素，多個用分號隔開），現在是 ${JSON.stringify(v)}`);
  return list;
}
const drawBox = (c, [x, y, w, h]) => {
  const lw = Math.max(3, Math.round(Math.max(c.w, c.h) / 500)), RED = [255, 40, 40];
  fillRect(c, x - lw, y - lw, w + 2 * lw, lw, RED); fillRect(c, x - lw, y + h, w + 2 * lw, lw, RED);
  fillRect(c, x - lw, y, lw, h, RED); fillRect(c, x + w, y, lw, h, RED);
};

export async function frames(P, { src, at = null, grid = false, box = null } = {}) {
  const boxes = parseBoxes(box);
  const times = parseAtList(at);
  if (!src) throw new Error('要寫 --src，例如 --src assets/screen/操作示範.mp4');
  const s = String(src).replace(/\\/g, '/');
  const abs = path.isAbsolute(s) ? s : path.join(P.project, ...s.split('/'));
  if (!fs.existsSync(abs)) throw new Error(`找不到 ${s}（路徑相對專案資料夾 ${rel(P.project)}，例如 assets/screen/操作示範.mp4）`);
  const info = probeMedia(abs);
  if (!info.width) throw new Error(`${s} 讀不到畫面`);
  if (info.duration != null) {
    const over = times.filter((t) => t >= info.duration);
    if (over.length) throw new Error(`--at ${over.join(',')} 超過素材長度 ${info.duration}s`);
  }
  const stem = path.basename(abs, path.extname(abs));
  const lim = limiter();
  return Promise.all((info.kind === 'image' ? [0] : times).map((t) => lim(async () => {
    const c = { w: info.width, h: info.height, data: await rawFrameAsync(abs, { at: t }) };
    if (grid) drawGrid(c);
    for (const b of boxes) drawBox(c, b);
    const out = path.join(P.project, 'work', 'media', 'frames', `${stem}${info.kind === 'image' ? '' : `-${r3(t)}s`}${grid ? '-grid' : ''}${boxes.length ? '-box' : ''}.jpg`);
    writeJpg(c, out, 2);
    return { file: out, at: t, width: info.width, height: info.height, kind: info.kind };
  })));
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

// 分類散落的素材（media.mjs sort）與開新專案（media.mjs new）。規則的出處：
//   .agents/skills/auto-edit-longform/references/sort-assets.md（決策表：由上往下，第一個符合的列）
//   .agents/skills/auto-edit-longform/references/new-project.md（四個素材資料夾、要告訴使用者的那段話）
// 弱模型照表一列一列跑 ffprobe、截圖、mv 很容易漏或搬錯；工具出計畫表、把要人眼判斷的拼成一張圖，搬的時候守住「不覆寫、不刪」。
//
//   planSort(project, { as })  → rows：[{ file（相對專案）, act: move|stay|look|pending, to, why, dst }]
//   sortCli(P, flags)          → media.mjs sort：預設只印計畫，--apply 才搬
//   newProject(root, name)     → media.mjs new
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { probeMedia, writeJpg, VIDEO_EXT, AUDIO_EXT } from './ff.mjs';
import { canvas, fillRect, blit, text } from './raster.mjs';
import { next, cmdLine } from './say.mjs';
import { IMG_SHEET, labelImageSheet, chromeOrNull } from './rough/scan.mjs';

export const KINDS = Object.freeze({ camera: 'assets/camera', voice: 'assets/voice', screen: 'assets/screen', images: 'assets/images' });
export const AS_KINDS = [...Object.keys(KINDS), 'script', 'skip'];
const IMAGE = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
// 影音檔才問 ffprobe（文件、程式檔直接算不認得，不用一個一個試）：ff.mjs 的清單＋手機、相機、錄音筆常見的幾種
const AV = [...new Set([...VIDEO_EXT, ...AUDIO_EXT, '.mkv', '.avi', '.mts', '.m2ts', '.3gp', '.wmv', '.flv', '.mpg', '.mpeg', '.aif', '.aiff', '.caf', '.amr', '.wma'])];
const TEXT = ['.md', '.txt'];
const SCREEN_NAME = /螢幕錄影|錄屏|screen[\s_-]*recording/i;
const SCRIPT = '講稿.md';
const SHEET_FILE = '分類-總表.jpg';
export const SORT_LAST = '分類沒問題後說「剪乾淨」；要改就說哪個檔案放哪裡';   // sort-assets.md 第 4 點：給使用者的話，不是指令

const posix = (p) => p.split(path.sep).join('/');
const relPath = (p) => posix(path.relative(process.cwd(), p)) || '.';
const extOf = (f) => path.extname(f).toLowerCase();
const natural = (a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true, sensitivity: 'base' });
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');

// 專案底下（含子資料夾）、不在 assets/、work/、output/ 裡的檔；點開頭的（.DS_Store、.hyperframes）不看，根目錄的 講稿.md 本來就在對的地方
function scatter(project) {
  const out = [];
  const walk = (dir, top) => {
    let names;
    try { names = fs.readdirSync(dir).sort(natural); } catch { return; }
    for (const name of names) {
      if (name.startsWith('.') || (top && ['assets', 'work', 'output'].includes(name))) continue;
      const abs = path.join(dir, name);
      let st, link = false;
      try { link = fs.lstatSync(abs).isSymbolicLink(); st = fs.statSync(abs); } catch { continue; }
      if (st.isDirectory()) { if (!link) walk(abs, false); }   // 捷徑指到的資料夾不往下走（可能繞回來）
      else if (st.isFile() && !(top && name === SCRIPT)) out.push(abs);
    }
  };
  walk(project, true);
  return out;
}

// 打開來是文字（不是空的、沒有 NUL）：講稿候選的最低門檻，是不是講稿內容要 AI 打開確認
function looksLikeText(abs) {
  try {
    const buf = fs.readFileSync(abs).subarray(0, 65536);
    return !buf.includes(0) && buf.toString('utf8').replace(/\s/g, '').length >= 10;
  } catch { return false; }
}

// sort-assets.md 的決策表，由上往下第一個符合的列
function judge(r, { hasScript, texts }) {
  const e = extOf(r.name);
  if (r.name.includes('場地照')) return { act: 'stay', why: '檔名有「場地照」：留在原地（工具會來這裡找）' };
  if (IMAGE.includes(e)) return { act: 'move', to: KINDS.images, why: `圖片（${e}）` };
  if (AV.includes(e)) {
    let info;
    try { info = probeMedia(r.abs); } catch (err) { return { act: 'pending', why: `ffprobe 讀不到（${String(err.message).split('：').pop().slice(0, 80)}）` }; }
    if (!info.hasVideo && info.hasAudio) return { act: 'move', to: KINDS.voice, why: 'ffprobe 只有聲音' };
    if (info.hasVideo && SCREEN_NAME.test(r.name)) return { act: 'move', to: KINDS.screen, why: '有畫面，檔名有「螢幕錄影／錄屏／Screen Recording」' };
    if (info.hasVideo) return { act: 'look', duration: info.duration, why: '有畫面，檔名看不出是真人還是操作畫面' };
    return { act: 'pending', why: 'ffprobe 找不到畫面也找不到聲音' };
  }
  if (TEXT.includes(e)) {
    if (hasScript) return { act: 'pending', why: '專案裡已經有 講稿.md' };
    if (texts.length > 1) return { act: 'pending', why: `講稿候選有 ${texts.length} 份（${texts.map((t) => t.file).join('、')}）→ 使用者說哪一份是講稿，就用 --as "<檔名>=script"` };
    if (!looksLikeText(r.abs)) return { act: 'pending', why: '打開不是文字，或是空的' };
    return { act: 'move', to: SCRIPT, why: `專案裡還沒有講稿.md、只有這一份 ${e}：改名成講稿.md（先打開確認是講稿；不是就加 --as "${r.name}=skip"）` };
  }
  return { act: 'pending', why: `不認得的檔案（${e || '沒有副檔名'}）` };
}

// --as "檔名=camera;raw/b.mp4=screen"：檔名寫相對專案的路徑或只寫檔名（同名的有好幾個就要寫路徑）
function parseAs(s, rows, project) {
  const out = [];
  for (const part of String(s ?? '').split(/[;；\n]/).map((x) => x.trim()).filter(Boolean)) {
    const i = part.lastIndexOf('=');
    if (i <= 0) throw new Error(`--as 看不懂「${part}」→ 寫成 --as "檔名=camera;檔名2=screen"`);
    const key = part.slice(0, i).trim().replace(/^["']|["']$/g, ''), kind = part.slice(i + 1).trim().toLowerCase();
    if (!AS_KINDS.includes(kind)) throw new Error(`--as 的「${part.slice(i + 1).trim()}」不是能用的分類 → 只有 ${AS_KINDS.join('、')}（script＝當講稿、skip＝不動）`);
    const abs = path.resolve(key), inProj = path.resolve(project, key);
    const hit = rows.filter((r) => r.file === posix(key) || r.name === key || r.abs === abs || r.abs === inProj);
    if (!hit.length) throw new Error(`--as 的「${key}」不是這次要分類的檔 → 寫表上的檔名：${rows.map((r) => r.file).join('、')}`);
    if (hit.length > 1) throw new Error(`「${key}」有 ${hit.length} 個同名的檔 → 寫相對專案的路徑：${hit.map((r) => r.file).join('、')}`);
    out.push([hit[0], kind]);
  }
  return out;
}

export function planSort(project, { as = null } = {}) {
  const rows = scatter(project).map((abs) => ({ abs, file: posix(path.relative(project, abs)), name: path.basename(abs) }));
  const hasScript = fs.existsSync(path.join(project, SCRIPT));
  const texts = rows.filter((r) => TEXT.includes(extOf(r.name)) && !r.name.includes('場地照'));
  for (const r of rows) Object.assign(r, judge(r, { hasScript, texts }));
  for (const [r, kind] of parseAs(as, rows, project)) {
    delete r.duration;
    Object.assign(r, kind === 'skip' ? { act: 'stay', to: null, why: '--as skip：不動' }
      : kind === 'script' ? { act: 'move', to: SCRIPT, why: '--as script：改名成講稿.md' }
        : { act: 'move', to: KINDS[kind], why: `--as ${kind}` });
  }
  // 目的地已經有同名檔、或這次有兩個檔要搬到同一個名稱：都不覆寫，列為待確認
  const taken = new Map();
  for (const r of rows) {
    if (r.act !== 'move') continue;
    const dst = r.to === SCRIPT ? path.join(project, SCRIPT) : path.join(project, r.to, r.name);
    const show = posix(path.relative(project, dst));
    if (fs.existsSync(dst)) Object.assign(r, { act: 'pending', to: null, why: `目的地已經有同名檔 ${show}：不覆寫` });
    else if (taken.has(dst)) Object.assign(r, { act: 'pending', to: null, why: `和 ${taken.get(dst)} 要搬到同一個名稱 ${show}：不覆寫` });
    else { taken.set(dst, r.file); r.dst = dst; }
  }
  return rows;
}

// 看圖用的那一格：片長一半的畫面，等比縮進格子（和圖片 contact sheet 同一套底色）
function midFrame(abs, duration, w, h) {
  const at = duration > 0 ? +(duration / 2).toFixed(3) : 0;
  const graph = `color=c=0x1e2740:s=${w}x${h}:d=1[bg];[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=bicubic[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1`;
  const r = spawnSync('ffmpeg', ['-v', 'error', ...(at > 0 ? ['-ss', String(at)] : []), '-i', abs, '-frames:v', '1', '-filter_complex', graph, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 26 });
  return !r.error && r.status === 0 && r.stdout?.length === w * h * 3 ? r.stdout : null;
}

// work/分類-總表.jpg：一張圖放全部要看的影片，每格上面標「#格號 檔名」（檔名要 HyperFrames 的 Chrome；沒有就只有格號，表上有對照）
async function lookSheet(P, looks) {
  const { cols, cell: w, h, gap, bar } = IMG_SHEET;
  const nRows = Math.ceil(looks.length / cols);
  const W = gap + cols * (w + gap), H = gap + nRows * (bar + h + gap);
  const c = canvas(W, H, [30, 39, 64]);
  looks.forEach((r, i) => {
    const x = gap + (i % cols) * (w + gap), y = gap + Math.floor(i / cols) * (bar + h + gap);
    fillRect(c, x, y, w, bar, [11, 16, 32]);
    text(c, `#${r.n}`, x + 10, y + 18, 4, [255, 255, 255]);
    const t = midFrame(r.abs, r.duration, w, h);
    if (t) blit(c, { w, h, data: t }, x, y + bar);
  });
  const file = path.join(P.project, 'work', SHEET_FILE);
  writeJpg(c, file);
  let named = false;
  const chrome = await chromeOrNull();
  if (chrome) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sort-sheet-'));
    try { named = await labelImageSheet({ chrome, file, cells: looks.map((r) => ({ n: r.n, name: r.file })), W, H, templateDir: P.templateDir, tmp, page: 1 }).catch(() => false); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  return { file, named };
}

const whereOf = (r) => (r.act === 'move' ? (r.to === SCRIPT ? SCRIPT : `${r.to}/`) : r.act === 'stay' ? '不動' : r.act === 'look' ? `看圖（第 ${r.n} 格）` : '待確認');

export async function sortCli(P, flags = {}, log = console.log) {
  const proj = P.project, pj = relPath(proj), apply = !!flags.apply;
  const rows = planSort(proj, { as: flags.as });
  if (apply) for (const d of [...Object.values(KINDS), 'work']) fs.mkdirSync(path.join(proj, d), { recursive: true });
  if (!rows.length) {
    log('✓ 沒有散落的檔案要分類（assets/、work/、output/ 以外沒有檔案）');
    log(next(SORT_LAST)[0]);
    return 0;
  }
  const looks = rows.filter((r) => r.act === 'look');
  looks.forEach((r, i) => { r.n = i + 1; });
  const sheet = looks.length ? await lookSheet(P, looks) : null;
  if (apply) {
    for (const r of rows) {
      if (r.act === 'look') { Object.assign(r, { act: 'pending', why: `看圖還沒回答（work/${SHEET_FILE} 第 ${r.n} 格）：看不出是真人還是操作畫面` }); continue; }
      if (r.act !== 'move') continue;
      if (fs.existsSync(r.dst)) { Object.assign(r, { act: 'pending', why: `目的地已經有同名檔 ${posix(path.relative(proj, r.dst))}：不覆寫` }); continue; }
      // 只用 rename（同一顆硬碟是瞬間的、不會留半個檔）；跨磁碟搬不動就列為待確認，不改成複製再刪
      try { fs.renameSync(r.abs, r.dst); r.moved = true; } catch (e) {
        Object.assign(r, { act: 'pending', why: e.code === 'EXDEV' ? `跨磁碟搬不動（和 ${r.to} 不在同一顆硬碟）：請使用者手動搬` : `搬不動（${e.code || e.message}）` });
      }
    }
  }
  const n = (act) => rows.filter((r) => r.act === act).length;
  const pend = rows.filter((r) => r.act === 'pending');
  log(apply ? `✓ 分類好了：搬了 ${rows.filter((r) => r.moved).length} 個、不動 ${n('stay')} 個、待確認 ${pend.length} 個`
    : `分類計畫（還沒搬，加 --apply 才搬）：要搬 ${n('move')} 個、不動 ${n('stay')} 個${looks.length ? `、看圖 ${looks.length} 支` : ''}、待確認 ${pend.length} 個`);
  log('| 檔案 | 搬到哪 | 依據 |');
  log('|---|---|---|');
  for (const r of rows) log(`| ${cell(r.file)} | ${cell(whereOf(r))} | ${cell(r.why)} |`);
  if (pend.length) {
    log(`待確認 ${pend.length} 個（不動，問使用者）：`);
    for (const r of pend) log(`- ${r.file}：${r.why}`);
  }
  if (apply) { log(next(SORT_LAST)[0]); return 0; }
  if (looks.length) log(`看圖 ${looks.length} 支：打開 ${relPath(sheet.file)}（每格上面是${sheet.named ? '格號和檔名' : '格號，對照表上的「第 N 格」'}）：拍到真人在講解＝camera、電腦或手機的操作畫面＝screen；看不出來就不寫（會列為待確認）`);
  if (!n('move') && !looks.length) { log(next(SORT_LAST)[0]); return 0; }
  for (const l of next(looks.length ? '看完圖照表搬：在這條後面加 --as "檔名=camera;檔名=screen"（看不出來的不寫）' : '照表搬',
    cmdLine('media.mjs', ['sort', '--project', pj, '--apply', ...(flags.as ? ['--as', flags.as] : [])]))) log(l);
  return 0;
}

// ---------- new：開新專案 ----------
export function newProject(root, name, log = console.log) {
  const n = String(name ?? '').trim().replace(/^projects[\\/]+/, '').replace(/[\\/]+$/, '');
  if (!n || !/^[^\\/:*?"<>|\s.][^\\/:*?"<>|]*$/.test(n)) throw new Error(`要寫新專案的資料夾名稱（不能有 / \\ : * ? " < > |，不能用點或空白開頭），現在是「${name ?? ''}」→ node shared/template/tools/media.mjs new <名稱>`);
  const dst = path.join(root, 'projects', n), p = `projects/${n}`;
  if (fs.existsSync(dst)) throw new Error(`${p} 已經有了 → 換一個名稱（不會動既有的專案）；要接著做這個專案就說「繼續」`);
  for (const d of Object.values(KINDS)) fs.mkdirSync(path.join(dst, d), { recursive: true });
  log(`✓ 新專案：${p}（assets/camera、voice、screen、images 四個空資料夾）`);
  log('各放什麼（照貼給使用者）：');
  log(`- 有畫面的講解 → ${p}/assets/camera/`);
  log(`- 只有聲音的旁白 → ${p}/assets/voice/（畫面會配螢幕錄影或圖片）`);
  log(`- 螢幕錄影 → ${p}/assets/screen/（邊錄邊講的也放這裡，會自動接進主軌）`);
  log(`- 截圖、照片 → ${p}/assets/images/`);
  log(`- 講稿 → 存成 ${p}/講稿.md`);
  log('- 只有開頭結尾露臉的片：開頭結尾的錄影放 assets/camera/、中間的旁白放 assets/voice/，檔名照順序編號（01-開場.mp4、02-中段.m4a、03-結語.mp4；順序不對，剪輯清單會照講稿提示），中間沒有講者的地方自動用全螢幕');
  log(next('素材放好後說「剪乾淨」')[0]);
  return 0;
}

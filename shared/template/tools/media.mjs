#!/usr/bin/env node
/**
 * 素材工具：看螢幕錄影與圖片、讀座標、接主軌（零依賴，只用 Node 22 與 ffmpeg／ffprobe）
 *
 *   node shared/template/tools/media.mjs scan --project projects/<專案>
 *       列出 assets/screen/、assets/images/ 每個檔（長度、解析度、fps、有沒有聲音）；
 *       影片抽「畫面變化」＋固定間隔的格子，拼成帶時間的 contact sheet：work/media/<檔名>/sheet-01.jpg …
 *       寫 work/media/index.md（給 AI 讀：每一格是素材的第幾秒）與 index.json
 *   node shared/template/tools/media.mjs frame --project projects/<專案> --src assets/screen/<檔名> --at 12.5 [--grid]
 *       截一張原尺寸畫面到 work/media/frames/；--grid 疊每 100px 一條、標數字的座標格線（plan.json 的 box／moves／lens 用這個座標）
 *   node shared/template/tools/media.mjs main --project projects/<專案> [--order 檔名1,檔名2,…]
 *       把 assets/camera/、assets/voice/，以及 assets/screen/ 裡邊錄邊講的螢幕錄影（有聲音的比例 20–95%：講話會停頓，背景音樂不會）照檔名排序
 *       （或 --order 的順序；--order 可以寫檔名或 assets/… 路徑，也能放進沒偵測到講解、但有音軌的螢幕錄影）接成 work/main.mp4：
 *       檔名後面加 @起-迄（秒，迄可省略＝到檔尾）只取那一段，同一支可以出現好幾次——補錄插進旁白中間：
 *       --order "a.mp4,旁白.mp3@0-577.7,補錄.aac@2.1-32.4,旁白.mp3@603.4-,b.mp4"
 *       聲音檔與螢幕錄影都只取聲音、配純黑畫面（螢幕錄影的畫面之後由 screen-sync 自動蓋回）；
 *       解析度／fps 跟第一支真人錄影（沒有就 1920×1080 30fps）；聲音統一 48k AAC。
 *       同時寫 work/main.json：{ "clips": [{ "file", "kind": "camera"|"voice"|"screen", "start", "end"[, "src": [起, 迄]] }] }（src＝有寫 @起-迄 時取的是素材哪一段）
 *       只有一支真人錄影時也轉一次（固定 fps、yuv420p）：auto-editor 直接剪手機原檔（VFR、yuvj420p），--cut-out 之後的畫面可能全黑。
 *       fps：原片在 29–31 之間、VFR 或沒有 fps 時用 30，其他照原片（例 25、60）。
 *
 *   node shared/template/tools/media.mjs ng-scan --project projects/<專案>
 *       找 NG（剪乾淨第 3–4 步）：讀 work/transcript.json（main.mp4 的詞級逐字稿），用講稿裡只出現一次的四字組當錨點對位置；
 *       講到講稿後面又跳回前面（接著往下講 ≥ 6 字）＝重講 → 前一次列成 NG 候選（留最後一次）；講稿找不到的話列「講稿外」；
 *       沒講稿時比相鄰句（停頓切句）。印 cuts.md 的 NG 表與章節空檔表（照抄），講稿每一行的開口時間寫 work/ng-scan.md。
 *   node shared/template/tools/media.mjs snap-srt --project projects/<專案> [--dry-run] [--below <dB>]
 *       把 work/rough.srt 每則字幕的起點對齊到實際開口的時間（逐字稿的時間碼只有整句，常比嘴巴早 1 秒左右）：
 *       用 ffmpeg 把 work/rough.mp4 的聲音解出來算能量包絡，門檻取這支音軌自己的「說話音量」與「底噪」之間（相對值，不寫死 dB；
 *       --below <dB> 可手動改成「說話音量減 dB」），找出說話區間；每則起點對齊到附近最接近的開口點（字幕比開口早 1.5 秒到晚 0.6 秒的範圍內，差超過 0.25 秒才動）；
 *       結尾拖進靜音超過 0.4 秒就收到說話結束＋0.15 秒。字幕不重疊、每則至少 0.6 秒、順序不變。
 *       寫回前先把原檔備份成 work/rough.srt.bak-<時間戳>（不刪任何檔）；--dry-run 只印調整表、不寫。
 *       只在「剪乾淨」做完字幕校正後跑一次；之後在影片編輯器改的時間不要再跑它（會蓋掉）。build 不會自動執行它。
 *   node shared/template/tools/media.mjs ng-snap --project projects/<專案> [--edit "audio:-20dB"] [--margin 0.15sec] [--src <原片>] [--v1 <檔>]
 *       讀 work/cuts.md 的 NG 表（表頭有「時間碼」「原因」）與章節空檔表（表頭有「章節」「第一句」），
 *       用 auto-editor 判斷原片的停頓（結果快取在 work/.cache/），把每段 NG 的起訖對齊到前後的停頓（±1 秒內），
 *       每章第一句前保留 3 秒停頓（--add-in），印出三行可以直接複製的 auto-editor 指令：--preview、輸出 work/rough.mp4、--export v1 -o work/cuts.v1.json。
 *       邊錄邊講的螢幕錄影（main.json kind "screen"）只剪 NG、停頓保留（停頓時畫面常在操作；整段 --add-in，扣掉 NG）。
 *       主軌有兩支以上、有 講稿.md、還沒初剪時，用 work/transcript.json 比對每支講的是講稿第幾行，順序和講稿不同就 ⚠ 並印建議的 --order。
 *       「待確認」欄有寫字的列不剪。原始停頓不到 3 秒的章節會 ⚠。除了下面說的自動轉 main.mp4，不寫 work/.cache/ 以外的檔。
 *       --src 不寫：用 work/main.mp4；還沒有、且只有一支真人錄影時，先自動跑 main 轉出 work/main.mp4（會寫 work/main.mp4、work/main.json）；
 *       --v1：用現成的 auto-editor --export v1 結果（不跑 auto-editor）。
 *       章節開口：先找包含表上時間的停頓；沒有就往後 6 秒內找第一個停頓的終點（再沒有才看表上時間前 0.6 秒內）。
 *   node shared/template/tools/media.mjs verify-rough --project projects/<專案>
 *       檢查初剪有沒有壞：blackdetect work/rough.mp4，每段黑畫面用 work/cuts.v1.json 換回原片同一秒、量原片亮度；
 *       原片不黑 → ✖ 並印重做的指令（結束碼 1）；原片也黑（或專案有只有聲音的素材）→ ✓ 列出區間。不寫檔。
 *   node shared/template/tools/media.mjs cutpoints --project projects/<專案> [--dry-run]
 *       讀 work/cuts.v1.json（auto-editor --export v1）與 work/rough.mp4 的 fps，算出每個剪接點在 rough.mp4 的秒數，
 *       和 work/cuts.md 的 NG 重疊的標 ng、其他標 pause，寫 work/cutpoints.json（舊檔內容不同時先備份成 .bak-<時間戳>）。
 *   node shared/template/tools/media.mjs screen-sync --project projects/<專案> [--write-plan] [--dry-run]
 *       邊錄邊講的螢幕錄影：讀 work/main.json（kind "screen"）與 work/cuts.v1.json，算出初剪後每段保留下來的片段
 *       在 rough.mp4 的起訖與錄影本身的秒數（in），寫 work/screen-sync.json（media 段 sync01、sync02…：畫面蓋回主軌、和聲音同步）。
 *       --write-plan：再寫進 work/hyperframes/plan.json（先換掉舊的 sync 段，plan.json 先備份 .sync-<時間戳>）；初剪重做過就再跑一次。
 *       --dry-run：只印表、不寫。秒數都由工具算，不要手改 sync 段的 from／to／in（影片編輯器拖邊緣會自動保持同步）。
 *   node shared/template/tools/media.mjs srt-align --project projects/<專案> [--dry-run] [--remap-plan] [--max 18]
 *       字幕重新斷句成完整語句（剪乾淨第 6 步，取代「手動斷句＋srt-split」）：
 *       有 講稿.md：字幕＝講稿每一行（# 標題、> 引言、含 ` 的說明行不算），時間用 work/transcript.json 的詞級時間做全域序列對齊
 *       （字元層級，允許錯字／多字／漏字）；沒講稿：work/rough.srt 每則依「，。！？；」切成子句。
 *       一行超過 18 字在「、，」處拆；同一口氣（停頓 ≤ 0.12 秒）或有一邊 ≤ 4 字、下一行不是「而、但、所以…」開頭的新句，合併後 ≤ 18 字就併；
 *       相鄰空檔 < 1 秒補滿；對不上的行用前後句內插（⚠ 列出）。字幕文字去掉「，。；：」，保留「、！？」。
 *       rough.mp4 聲音裡 ≥ 1.5 秒的停頓（章節前留的 3 秒、--add-in 保留的停頓）字幕不蓋：逐字稿常把字攤進停頓，
 *       起點落在停頓裡的挪到開口、終點拖進停頓的收到停頓起點（＋0.15 秒），build 才量得到章節前的空檔。
 *       沒有 transcript.json 時用 rough.srt 的整則時間按字數比例（⚠，之後跑 snap-srt）。
 *       寫回前先備份 work/rough.srt.align-<時間戳>；--dry-run 只印表。plan.json 已經用到 #N 時要加 --remap-plan（照時間換句號，plan.json 先備份 .align-<時間戳>）。
 *       每則字數上限（srt-align、srt-split 的 --max）預設照版式：橫式 18、直式 10（lib/canvas.mjs 的 caption.maxChars；直式時第一行印「版式：直式 → 每則最多 10 字」）。
 *   node shared/template/tools/media.mjs srt-split --project projects/<專案> [--max 18] [--dry-run]
 *       work/rough.srt 超過 18 字（全形 1、半形 0.5）的字幕拆成兩則以上：先斷在標點，再斷在空白，都沒有才斷在中間（會 ⚠）；
 *       時間依字數比例分配、首尾相接，句號重新連號。寫回前先備份 work/rough.srt.split-<時間戳>（.bak-<時間戳> 留給 snap-srt，status 靠它判斷 snap-srt 跑過沒有）。
 *       work/hyperframes/plan.json 已經用到句號（#N）時拒絕（改到影片編輯器分割，影片編輯器會一起重對 #N）。
 *   node shared/template/tools/media.mjs illus-lint --project projects/<專案> [--no-sheet]
 *       檢查專案自己畫的示意插圖元件 work/hyperframes/illus-local/*.svg（規則見 shared/template/kit/illus-style.md）：
 *       建議尺寸與狀態從 work/storyboard.md 的插圖清單讀（「新建 SVG」列寫「規格：<name>，建議尺寸 W×H，狀態 a／b」）；
 *       讀不到就只查不用尺寸的規則（⚠）；插圖清單列了新建 SVG 卻沒有檔 ✖。有 ✖ 結束碼 1。不改任何 SVG。
 *       順便拼 work/插圖清單.jpg（插圖清單用到的畫廊元件＋illus-local 的新元件，1:1 px，上亮色、下暗色；要 HyperFrames 的 Chrome）；--no-sheet 不拼。
 *
 * --project：專案資料夾（projects/example，或只寫名稱 example）；沒寫時規則同 build.mjs。測試用：--template <shared/template 資料夾>
 */
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import vm from 'node:vm';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathsFrom, projectLabel } from './build.mjs';
import { parseSrt, formatSrt } from './lib/srt.mjs';
import { visibleLen } from './lib/scenes.mjs';
import { textWidth as tw, normText } from './lib/time.mjs';
import { mapPlanTimes, refTime, fmtRef, parseRef } from './editor/subtitles.mjs';
import { run, probeMedia, rawFrame, writeJpg, blackDetect, transcriptFresh, noteTranscript, VIDEO_EXT, IMAGE_EXT, AUDIO_EXT } from './lib/ff.mjs';
import { canvas, fillRect, blit, text, textWidth } from './lib/raster.mjs';
import { lintIllusSvg } from './lib/illus-lint.mjs';
import { KIT_LINKS } from './lib/main.mjs';
import { resolveFormat, canvasOf } from './lib/canvas.mjs';

const VALUE_FLAGS = ['project', 'template', 'src', 'at', 'order', 'below', 'edit', 'margin', 'v1', 'max'];
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
    const eq = a.indexOf('=');   // --edit=audio:threshold=0.1：只在第一個 = 切
    const k = eq < 0 ? a.slice(2) : a.slice(2, eq), inline = eq < 0 ? undefined : a.slice(eq + 1);
    if (VALUE_FLAGS.includes(k)) {
      const v = inline ?? rest[++i];
      if (v == null) throw new Error(`--${k} 後面要接值`);
      flags[k] = v;
    } else if (['grid', 'help', 'dry-run', 'remap-plan', 'no-sheet', 'write-plan'].includes(k)) flags[k] = true;
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
  for (const [dir, exts, kind] of [['screen', VIDEO_EXT, 'video'], ['images', IMAGE_EXT, 'image']]) {
    for (const f of listFiles(path.join(proj, 'assets', dir), exts)) {
      const src = `assets/${dir}/${f}`;
      const abs = path.join(proj, 'assets', dir, f);
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
  // 已經接進主軌的邊錄邊講錄影：畫面由 screen-sync 蓋回，不用再配
  let narrated = [];
  try { narrated = (JSON.parse(fs.readFileSync(path.join(proj, 'work', 'main.json'), 'utf8')).clips || []).filter((c) => c.kind === 'screen').map((c) => c.file); } catch { narrated = []; }
  for (const e of entries) if (narrated.includes(e.src)) e.inMain = true;
  const json = { project: projRel, scannedAt: new Date().toISOString(), files: entries, voiceOnly };
  fs.writeFileSync(path.join(media, 'index.json'), JSON.stringify(json, null, 2) + '\n');
  fs.writeFileSync(path.join(media, 'index.md'), indexMd(json));
  return json;
}

function indexMd(j) {
  const L = [`# 素材清單（media.mjs scan 產生，不要手改）`, '', `專案：${j.project}　掃描時間：${j.scannedAt}`, ''];
  const vids = j.files.filter((f) => f.kind === 'video'), imgs = j.files.filter((f) => f.kind === 'image');
  L.push('## 螢幕錄影', '');
  if (!vids.length) L.push('（assets/screen/ 是空的）', '');
  else {
    L.push('| 檔案（plan.json 的 src） | 長度 | 解析度（座標範圍） | fps | 聲音 | contact sheet |', '|---|---|---|---|---|---|');
    for (const v of vids) {
      if (v.error) { L.push(`| ${v.src} | ✖ ${v.error} | | | | |`); continue; }
      L.push(`| ${v.src} | ${fmtT(v.duration)}（${v.duration}s） | ${v.width}×${v.height} | ${v.fps}${v.vfr ? '（VFR，build 會轉成 30fps）' : ''} | ${v.hasAudio ? '有' : '沒有'} | ${v.sheets.map((s) => `work/${s.file.replace(/^work\//, '')}（#${s.cells[0].n}–#${s.cells[s.cells.length - 1].n}）`).join('、')} |`);
    }
    L.push('');
    const inMain = vids.filter((v) => v.inMain);
    if (inMain.length) L.push(`已經接進主軌的邊錄邊講錄影：${inMain.map((v) => v.src).join('、')} → 畫面由 \`media.mjs screen-sync --write-plan\` 蓋回（plan.json 的 sync 段），不用再配；要標註就加在 sync 段上`, '');
    for (const v of vids.filter((x) => !x.error)) {
      L.push(`### ${v.src} 每一格的時間`, '', '格子左上角是格號與「分:秒」；右上角有黃色小方塊的格子＝畫面在這裡變了（切頁、開視窗、跳出選單）。', '');
      L.push('| 格 | 素材秒數（in） | 怎麼選的 |', '|---|---|---|');
      for (const s of v.sheets) for (const c of s.cells) L.push(`| #${c.n} | ${c.t} | ${c.scene ? '畫面變化' : '固定間隔'} |`);
      L.push('');
    }
  }
  L.push('## 圖片', '');
  if (!imgs.length) L.push('（assets/images/ 是空的）', '');
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
  if (!src) throw new Error('要寫 --src，例如 --src assets/screen/操作示範.mp4');
  const s = String(src).replace(/\\/g, '/');
  const abs = path.isAbsolute(s) ? s : path.join(P.project, ...s.split('/'));
  if (!fs.existsSync(abs)) throw new Error(`找不到 ${s}（路徑相對專案資料夾 ${rel(P.project)}，例如 assets/screen/操作示範.mp4）`);
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

// 主軌 fps：29–31（手機常見 29.92、29.97）、VFR、沒有 fps、超過 61 → 30；其他照原片取到小數 2 位
export const mainFps = (info) => (info.vfr || !info.fps || info.fps > 61 || Math.abs(info.fps - 30) < 1 ? 30 : Math.round(info.fps * 100) / 100);

// 螢幕錄影有沒有邊錄邊講：音軌不是靜音（silencedetect −35 dB、停 0.3 秒以上才算停頓）的比例在 min–max 之間就算有講解。
// 只有點擊聲的錄影通常 < 10%；背景音樂、持續的系統聲幾乎不停（> 95%）；講話會換氣停頓，約 40–90%。
// 判斷錯了在停點 ① 改 --order（寫進去＝接進主軌、拿掉＝當插入素材）
export const NARR = { noise: '-35dB', d: 0.3, min: 0.2, max: 0.95 };
export function narrationOf(file, info = probeMedia(file)) {
  if (!info.hasAudio || !(info.duration > 0)) return { narrated: false, ratio: 0, hasAudio: !!info.hasAudio };
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-sn', '-dn', '-af', `silencedetect=n=${NARR.noise}:d=${NARR.d}`, '-f', 'null', '-']);
  const err = String(r.stderr);
  let silent = 0, open = null;
  for (const m of err.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    if (m[1] === 'start') open = Math.max(0, Number(m[2]));
    else if (open != null) { silent += Number(m[2]) - open; open = null; }
  }
  if (open != null) silent += info.duration - open;   // 靜音一路到檔尾
  const ratio = r3(Math.min(1, Math.max(0, 1 - silent / info.duration)));
  return { narrated: ratio >= NARR.min && ratio <= NARR.max, ratio, hasAudio: true };
}

// 主軌的候選：真人錄影、聲音檔、有音軌的螢幕錄影（narrated＝偵測到講解，沒寫 --order 時才會自動接進主軌）
export function mainCandidates(proj) {
  const cams = listFiles(path.join(proj, 'assets', 'camera'), VIDEO_EXT).map((f) => ({ name: f, file: `assets/camera/${f}`, kind: 'camera' }));
  const voices = listFiles(path.join(proj, 'assets', 'voice'), [...AUDIO_EXT, ...VIDEO_EXT]).map((f) => ({ name: f, file: `assets/voice/${f}`, kind: 'voice' }));
  const screens = listFiles(path.join(proj, 'assets', 'screen'), VIDEO_EXT).map((f) => {
    const abs = path.join(proj, 'assets', 'screen', f), n = narrationOf(abs);
    return { name: f, file: `assets/screen/${f}`, kind: 'screen', narrated: n.narrated, ratio: n.ratio, hasAudio: n.hasAudio };
  }).filter((x) => x.hasAudio);
  return { cams, voices, screens };
}

export function joinMain(P, { order = null, log = console.log } = {}) {
  const proj = P.project;
  const { cams, voices, screens } = mainCandidates(proj);
  for (const x of screens) log(x.narrated
    ? `${x.file}：偵測到講解（有聲音 ${Math.round(x.ratio * 100)}%）→ 接進主軌，畫面之後由 screen-sync 蓋回`
    : `${x.file}：${x.ratio > NARR.max ? `聲音幾乎沒停（${Math.round(x.ratio * 100)}%，像背景音樂或系統聲音）` : `聲音只有 ${Math.round(x.ratio * 100)}%`}，當插入素材（要接進主軌就寫進 --order）`);
  const all = [...cams, ...voices, ...screens];
  let list = [...cams, ...voices, ...screens.filter((x) => x.narrated)].sort((a, b) => natural(a.name, b.name));
  if (!list.length) throw new Error('assets/camera/ 和 assets/voice/ 都是空的，assets/screen/ 也沒有邊錄邊講的錄影：先把口播影片或旁白放進去');
  if (order) {
    const want = String(order).split(',').map((s) => s.trim()).filter(Boolean);
    const picked = want.map((raw) => {
      // 檔名@起-迄：只取那一段（補錄插進旁白中間時，同一支旁白切成前後兩段）
      const m = raw.match(/^(.*)@(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)?$/);
      const w = m ? m[1].trim() : raw;
      const hits = all.filter((x) => x.name === w || x.file === w.replace(/\\/g, '/'));
      if (hits.length > 1) throw new Error(`--order 的「${w}」有 ${hits.length} 個同名檔（${hits.map((x) => x.file).join('、')}）→ 改寫成 assets/… 路徑`);
      if (!hits.length) throw new Error(`--order 的「${w}」找不到 → 現有：${all.map((x) => x.file).join('、')}`);
      if (!m) return hits[0];
      const a = Number(m[2]), b = m[3] != null ? Number(m[3]) : null;
      if (b != null && b <= a) throw new Error(`--order 的「${raw}」：迄要比起大（寫成 檔名@起-迄，秒數；迄不寫＝到檔尾）`);
      return { ...hits[0], range: [a, b] };
    });
    const left = list.filter((x) => !picked.some((p) => p.file === x.file));
    if (left.length) log(`⚠ 這些檔沒寫在 --order，不接進主軌：${left.map((x) => x.name).join('、')}`);
    list = picked;
  }
  if (list.length === 1 && list[0].kind === 'camera') log(`只有一支真人錄影（${list[0].file}）：轉成固定 fps 的 work/main.mp4（auto-editor 直接剪手機原檔，--cut-out 之後的畫面可能全黑），之後 ng-snap、auto-editor 都用它。`);
  // 規格跟第一支真人錄影
  const first = list.find((x) => x.kind === 'camera');
  let W = 1920, H = 1080, F = 30;
  if (first) {
    const info = probeMedia(path.join(proj, ...first.file.split('/')));
    W = Math.floor((info.width || 1920) / 2) * 2; H = Math.floor((info.height || 1080) / 2) * 2;
    F = mainFps(info);
  }
  // 一次接完（concat filter）：每一段的畫面與聲音都裁／補到同一個長度，接縫不會越接越偏
  const inputs = [], chains = [], labels = [], clips = [];
  let t = 0;
  list.forEach((x, i) => {
    const abs = path.join(proj, ...x.file.split('/'));
    const info = probeMedia(abs);
    if (x.kind !== 'camera' && !info.hasAudio) throw new Error(`${x.file} 沒有聲音軌`);
    let src = null;
    if (x.range) {
      const a = x.range[0], b = Math.min(x.range[1] ?? info.duration, info.duration);
      if (a >= info.duration || b - a < 0.1) throw new Error(`--order 的 ${x.file}@${a}-${x.range[1] ?? ''}：素材只有 ${r3(info.duration)}s，這一段是空的`);
      src = [r3(a), r3(b)];
    }
    const D = r3(Math.round((src ? src[1] - src[0] : info.duration) * F) / F);
    if (src) inputs.push('-ss', String(src[0]), '-t', String(r3(src[1] - src[0])));
    inputs.push('-i', abs);
    if (x.kind === 'camera') chains.push(`[${i}:v:0]scale=${W}:${H}:force_original_aspect_ratio=decrease:out_range=tv,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${F},format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=duration=${D},setpts=PTS-STARTPTS[v${i}]`);
    // 聲音檔、邊錄邊講的螢幕錄影配純黑畫面（build 靠 blackdetect 認出「只有聲音」的區間，一定要是合成的純黑；螢幕錄影的畫面由 screen-sync 蓋回）
    else chains.push(`color=c=black:s=${W}x${H}:r=${F}:d=${D},format=yuv420p,setpts=PTS-STARTPTS[v${i}]`);
    if (info.hasAudio) chains.push(`[${i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${D},asetpts=PTS-STARTPTS[a${i}]`);
    else chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${D},asetpts=PTS-STARTPTS[a${i}]`);
    labels.push(`[v${i}][a${i}]`);
    clips.push({ file: x.file, kind: x.kind, start: r3(t), end: r3(t + D), ...(src ? { src } : {}) });
    t += D;
    log(`接主軌 ${i + 1}/${list.length}：${x.file}${src ? `@${src[0]}–${src[1]}s` : ''}${x.kind === 'voice' ? '（聲音，配純黑畫面）' : x.kind === 'screen' ? '（邊錄邊講的螢幕錄影：取聲音、配純黑畫面）' : ''}（${D}s）`);
  });
  const graph = `${chains.join(';')};${labels.join('')}concat=n=${list.length}:v=1:a=1[v][a]`;
  const mainFile = path.join(proj, 'work', 'main.mp4');
  fs.mkdirSync(path.dirname(mainFile), { recursive: true });
  log(`轉檔中…（${W}×${H}、${F}fps；1080p 每 10 分鐘約 1–3 分鐘）`);
  const r = run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', String(Math.round(F)), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', mainFile]);
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
  if (!cues.length) throw new Error(`${rel(srtFile)} 讀不到任何字幕 → 照「剪乾淨」第 6 步重新轉出 rough.srt（格式：序號、00:00:01,000 --> 00:00:02,500、文字，中間空一行）`);
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
  log('→ 重跑 build 前先到影片編輯器看一眼；之後不要再跑 snap-srt（會蓋掉你在影片編輯器改的時間）。');
  return { ...res, backup, written: true, threshold: th.threshold, speech };
}

// ---------- 剪乾淨：work/cuts.md（停點 ① 的 NG 表與章節空檔表；specs/contracts/stop-points.md §1）----------
export const CUT = {
  ngWin: 1.0,        // NG 起訖往前後找停頓的範圍（逐字稿常比嘴巴早 1 秒左右，AGENTS.md 剪乾淨第 6 步）
  chKeep: 3.0,       // 章節第一句前保留的停頓（G01）
  early: 0.6, late: 1.5,   // 章節第一句的開口點：表上時間 −0.6 到 +1.5 秒內算「對得上」，不另外說明
  ahead: 6.0,        // 表上時間不在停頓裡時，往後找第一個停頓終點的範圍（逐字稿常把那一句的起點標在停頓裡、比開口早好幾秒）
  minKeep: 0.5,      // 保留區被 NG 吃到剩不到 0.5 秒就不保留
  ngKind: 0.3,       // cutpoints：剪掉的段和 NG 重疊 ≥ min(0.3 秒, NG 長度一半) 才算 ng
  edit: 'audio:-20dB', margin: '0.15sec',   // 剪乾淨的預設參數（G16：作者的停頓保留 0.3 秒）
};
const fmtC = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const secArg = (x) => `${+r3(x)}sec`;
const posixRel = (p) => posix(rel(p));

export function parseClock(s) {
  const t = String(s ?? '').trim().replace(/`/g, '');
  let m = t.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:[.,]\d+)?)$/);
  if (m) return r3(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3].replace(',', '.')));
  m = t.match(/^(\d+):(\d{1,2}(?:[.,]\d+)?)$/);
  if (m) return r3(Number(m[1]) * 60 + Number(m[2].replace(',', '.')));
  m = t.match(/^(\d+(?:\.\d+)?)\s*(?:s|sec)?$/);
  return m ? r3(Number(m[1])) : null;
}
export function parseRange(s) {
  const t = String(s ?? '').trim().replace(/`/g, '');
  for (const sep of ['-->', '–', '—', '~', '～', '-']) {
    const i = t.indexOf(sep);
    if (i <= 0) continue;
    const a = parseClock(t.slice(0, i)), b = parseClock(t.slice(i + sep.length));
    if (a != null && b != null) return [a, b];
  }
  return null;
}
const isRow = (l) => /^\s*\|.*\|\s*$/.test(l ?? '');
const isSepRow = (l) => /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*(:?-{3,}:?\s*)?\|?\s*$/.test(l ?? '');
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
const isPending = (v) => v != null && !['', '—', '–', '-', '否', '無'].includes(String(v).trim());

// → { ng: [{ row, start, end, text, pending, raw }], chapters: [{ row, title, first, t }], hasNg, hasChapters, errors }
export function parseCutsMd(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const out = { ng: [], chapters: [], hasNg: false, hasChapters: false, errors: [] };
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence || !isRow(lines[i]) || !isSepRow(lines[i + 1])) continue;
    const head = cells(lines[i]).map((h) => h.replace(/\s+/g, ''));
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && isRow(lines[j]); j++) rows.push(cells(lines[j]));
    i = j - 1;
    const col = (name) => head.findIndex((h) => h.includes(name));
    const iT = col('時間碼'), iR = col('原因'), iCh = col('章節'), iF = col('第一句');
    if (iT >= 0 && iR >= 0) {
      out.hasNg = true;
      const iC = col('內容'), iP = col('待確認');
      for (const r of rows) {
        const n = out.ng.length + 1;
        const range = parseRange(r[iT]);
        if (!range || !(range[0] < range[1])) { out.errors.push(`cuts.md NG 第 ${n} 列的時間碼「${r[iT] ?? ''}」看不懂 → 寫成 1:03.00–1:05.80（原片的起–迄）`); out.ng.push({ row: n, bad: true }); continue; }
        out.ng.push({ row: n, start: range[0], end: range[1], text: iC >= 0 ? r[iC] ?? '' : '', pending: iP >= 0 && isPending(r[iP]), raw: iP >= 0 ? r[iP] ?? '' : '' });
      }
    } else if (iCh >= 0 && iF >= 0 && iT >= 0) {
      out.hasChapters = true;
      for (const r of rows) {
        const n = out.chapters.length + 1;
        const t = parseRange(r[iT])?.[0] ?? parseClock(r[iT]);
        if (t == null) { out.errors.push(`cuts.md 章節空檔第 ${n} 列的時間碼「${r[iT] ?? ''}」看不懂 → 寫那一章第一句在原片的起點，例如 0:41.20`); continue; }
        out.chapters.push({ row: n, title: String(r[iCh] ?? '').replace(/^\d+[.、\s]*/, '').trim() || String(r[iCh] ?? ''), first: r[iF] ?? '', t });
      }
    }
  }
  out.ng = out.ng.filter((r) => !r.bad);
  return out;
}

// auto-editor --export v1：{ "version": "1", "source", "chunks": [[起始幀, 結束幀, 速度]] }（沒有 timebase，fps 由呼叫端給）
export function readV1(file) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { j = null; }
  if (!j || String(j.version) !== '1' || !Array.isArray(j.chunks)) throw new Error(`${posixRel(file)} 不是 auto-editor 的 v1 格式（要有 "version": "1" 和 "chunks"）→ 確認是 --export v1 產生的`);
  return j;
}
export const silencesOf = (v1, fps) => v1.chunks.filter((c) => c[2] >= 99999).map(([a, b]) => [r3(a / fps), r3(b / fps)]);

export function parseMargin(m) {
  const x = String(m ?? '').trim().match(/^(\d+(?:\.\d+)?)(?:sec|s)$/);
  if (!x) throw new Error(`--margin 要寫成秒數加 sec，例如 0.15sec（auto-editor 的純數字是格數），現在是「${m}」`);
  return Number(x[1]);
}

// NG 起訖吸到前後的停頓：起點用「包含它或最近的靜音段起點」、終點用「包含它或最近的靜音段終點」（±win 秒內）
// chapterSil＝章節開口用的停頓（chapterKeep 的 sil，可帶第 3 個值＝保留區起點）：終點「落在」這種停頓裡時改吸到保留區起點
// （沒帶就吸停頓起點），不吃掉章節的保留區；保留區前那段停頓本來就會被剪，一起剪才不會在兩個剪點之間留下一兩格的殘片
// （終點在停頓後面、NG 連下一句開頭一起剪時照常吸到停頓終點，由 ngSnap 報「吃掉章節的停頓」）
export function snapNg(rows, sil, win = CUT.ngWin, chapterSil = []) {
  const near = (x, idx) => {
    const inside = sil.find(([a, b]) => x >= a - 1e-9 && x <= b + 1e-9);
    if (inside) return inside;
    let best = null;
    for (const s of sil) { const d = Math.abs(s[idx] - x); if (d <= win + 1e-9 && (!best || d < best.d)) best = { s, d }; }
    return best ? best.s : null;
  };
  const chOf = (s) => chapterSil.find((c) => c && c[0] === s[0] && c[1] === s[1]);
  return rows.map((r) => {
    if (r.pending) return { ...r, skip: true };
    const sa = near(r.start, 0), sb = near(r.end, 1);
    const ch = sb && chOf(sb);
    const toChapter = !!(ch && r.end >= sb[0] - 1e-9 && r.end <= sb[1] + 1e-9);
    let a = sa ? sa[0] : r.start, b = sb ? (toChapter ? (ch[2] ?? sb[0]) : sb[1]) : r.end;
    let missStart = !sa, missEnd = !sb;
    if (toChapter && !(a < b)) { a = r.start; missStart = true; }
    if (!(a < b)) { a = r.start; b = r.end; missStart = missEnd = true; }
    return { ...r, a: r3(a), b: r3(b), missStart, missEnd, miss: missStart || missEnd, toChapter };
  });
}

// 章節第一句前保留 chKeep 秒：剪完的空檔＝前一句尾巴的 margin＋保留區＋開口前的 margin
// 開口＝這個停頓的終點：先找包含表上時間的停頓；沒有就往後 ahead 秒內第一個停頓終點；再沒有才找表上時間前 early 秒內的
export function chapterKeep(chs, sil, margin, opt = CUT) {
  return chs.map((c) => {
    const s = sil.find(([a, b]) => c.t >= a - 1e-9 && c.t <= b + 1e-9)
      || sil.find(([, b]) => b >= c.t - 1e-9 && b <= c.t + opt.ahead + 1e-9)
      || [...sil].reverse().find(([, b]) => b >= c.t - opt.early - 1e-9 && b < c.t);
    if (!s) return { ...c, none: true };
    const [a, b] = s;
    const pause = r3(b - a + 2 * margin);
    const enough = pause >= opt.chKeep - 1e-6;
    const keep = enough ? [r3(Math.max(0, b - (opt.chKeep - 2 * margin))), b] : [a, b];
    const early = r3(b + margin - c.t);
    return { ...c, sil: s, onset: r3(b + margin), early: early > opt.late + 1e-9 ? early : 0, pause, keep, short: !enough, gapAfter: r3(enough ? opt.chKeep : pause) };
  });
}

function mergeRanges(list) {
  const s = [...list].sort((x, y) => x[0] - y[0]), out = [];
  for (const r of s) { const l = out[out.length - 1]; if (l && r[0] <= l[1] + 1e-6) l[1] = Math.max(l[1], r[1]); else out.push([...r]); }
  return out;
}

export function aeCommand({ src, edit, margin, cutOut = [], addIn = [], tail = [] }) {
  return ['auto-editor', `"${src}"`, '--edit', `"${edit}"`, '--margin', margin,
    ...cutOut.flatMap(([a, b]) => ['--cut-out', `"${secArg(a)},${secArg(b)}"`]),
    ...addIn.flatMap(([a, b]) => ['--add-in', `"${secArg(a)},${secArg(b)}"`]), ...tail].join(' ');
}

// 原片：--src ＞ work/main.mp4 ＞（只有一支真人錄影）先跑 main 轉成 work/main.mp4（normalize: false 時直接用原檔）
function mainSource(P, src, { normalize = true, log = console.log } = {}) {
  if (src) {
    for (const p of [path.resolve(src), path.join(P.project, src)]) if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    throw new Error(`找不到 --src「${src}」→ 寫原片的路徑（例 projects/example/work/main.mp4）`);
  }
  const work = path.join(P.project, 'work');
  if (fs.existsSync(path.join(work, 'main.json')) && fs.existsSync(path.join(work, 'main.mp4'))) return path.join(work, 'main.mp4');
  const cams = listFiles(path.join(P.project, 'assets', 'camera'), VIDEO_EXT), voices = listFiles(path.join(P.project, 'assets', 'voice'), AUDIO_EXT);
  const screens = mainCandidates(P.project).screens.filter((x) => x.narrated);
  if (cams.length === 1 && !voices.length && !screens.length) {
    if (!normalize) return path.join(P.project, 'assets', 'camera', cams[0]);
    log('還沒有 work/main.mp4：先把原片轉成固定 fps（auto-editor 直接剪手機原檔，--cut-out 之後的畫面可能全黑）');
    fs.mkdirSync(work, { recursive: true });
    return joinMain(P, { log }).file;
  }
  if (cams.length + voices.length + screens.length > 1 || screens.length) throw new Error(`assets/camera/ 有 ${cams.length} 支${voices.length ? `、assets/voice/ 有 ${voices.length} 個` : ''}${screens.length ? `、assets/screen/ 有 ${screens.length} 支邊錄邊講的錄影` : ''}、又沒有 work/main.mp4 → 先跑 node shared/template/tools/media.mjs main --project ${posixRel(P.project)}（剪乾淨第 1 步）`);
  throw new Error(`找不到原片：assets/camera/ 是空的 → 把口播影片放進 ${posixRel(path.join(P.project, 'assets', 'camera'))}/`);
}

function aeSilence(P, src, { edit, margin, log }) {
  const dir = path.join(P.project, 'work', '.cache');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'ng-snap.v1.json'), keyFile = path.join(dir, 'ng-snap.key.json');
  const st = fs.statSync(src);
  const key = JSON.stringify({ src: path.basename(src), size: st.size, mtimeMs: Math.round(st.mtimeMs), edit, margin, v: 1 });
  try { if (fs.existsSync(out) && fs.readFileSync(keyFile, 'utf8').trim() === key) return { file: out, cached: true }; } catch { /* 沒有快取 */ }
  log('用 auto-editor 判斷原片的停頓（第一次會花一點時間，之後用快取）…');
  const args = [src, '--edit', edit, '--margin', margin, '--export', 'v1', '-o', out, '--no-open'];
  let r = spawnSync('auto-editor', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // Windows：裝成 auto-editor.cmd 包裝檔時不帶 shell 會 ENOENT，再用 shell 試一次（參數加引號）
  if (r.error && r.error.code === 'ENOENT' && process.platform === 'win32') r = spawnSync('auto-editor', args.map((x) => `"${x}"`), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: true });
  if (r.error && r.error.code === 'ENOENT') throw new Error('找不到 auto-editor → 照 setup/ 的手冊安裝；或用 --v1 給現成的 auto-editor --export v1 結果');
  if (r.status !== 0) {
    const last = String(r.stderr || r.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '（沒有訊息）';
    throw new Error(`auto-editor 失敗（結束碼 ${r.status}）：${last} → 用 auto-editor --help 對一下參數名稱（以安裝的版本為準）`);
  }
  fs.writeFileSync(keyFile, key + '\n');
  return { file: out, cached: false };
}

// [a, b] 扣掉 cuts（已排序、不重疊也可以）→ 剩下的區間
export function subtractRanges([a, b], cuts) {
  const out = [];
  let x = a;
  for (const [c, d] of mergeRanges(cuts)) {
    if (d <= x + 1e-6 || c >= b - 1e-6) continue;
    if (c > x + 1e-6) out.push([r3(x), r3(c)]);
    x = Math.max(x, d);
  }
  if (b > x + 1e-6) out.push([r3(x), r3(b)]);
  return out;
}

// work/main.json 的 clips（原片是 work/main.mp4 時才算數）
function mainClips(P, source) {
  if (path.resolve(source) !== path.join(P.project, 'work', 'main.mp4')) return [];
  try { return JSON.parse(fs.readFileSync(path.join(P.project, 'work', 'main.json'), 'utf8')).clips || []; } catch { return []; }
}

// 主軌順序照講稿：每支的逐字稿（落在那支時間內的詞）和講稿每一行比「兩個字一組」，命中 ≥ minHit 的行算這支講到的行；
// 位置＝那些行號的中位數。不管原本的順序（不用全域對齊：檔案排錯時全域對齊會對不起來）
export function scriptOrder(clips, words, lines, minHit = 0.6) {
  const pairs = (t) => { const cs = [...normText(t)], set = new Set(); for (let i = 0; i + 1 < cs.length; i++) set.add(cs[i] + cs[i + 1]); return set; };
  const L = lines.map(pairs);
  return clips.map((c, k) => {
    const B = pairs(words.filter((w) => w.start >= c.start - 0.05 && w.start < c.end).map((w) => w.text).join(''));
    const hits = [];
    L.forEach((set, i) => { if (set.size < 2) return; let h = 0; for (const g of set) if (B.has(g)) h++; if (h / set.size >= minHit) hits.push(i + 1); });
    return { ...c, k, lines: hits, pos: hits.length ? hits[Math.floor((hits.length - 1) / 2)] : null };
  });
}

// 建議順序：有位置的照位置排；對不到講稿的維持原本的前後、放最後
export function suggestOrder(rows) {
  return [...rows.filter((r) => r.pos != null).sort((a, b) => a.pos - b.pos || a.k - b.k), ...rows.filter((r) => r.pos == null)];
}

// ---------- ng-scan ----------
// 詞級逐字稿（main.mp4 的 work/transcript.json）對講稿：講稿裡只出現一次的四字組當錨點，每個錨點＝那一刻講到講稿的哪個字。
// 講稿位置往回跳（從新位置一路講回前一次講到的地方或重講 ≥ 20 字、前一次在 90 秒內）＝重講：前一次講到這個位置起、到重講開口前，列成 NG 候選（留最後一次）。
// 錨點之間空 ≥ 3 秒又有字的列「講稿外」。沒講稿：相鄰 3 句兩兩相像（兩字組重疊 ≥ 50%）的前一句列 NG 候選。章節（講稿 ##）第一句的開口時間印成章節空檔表。
export const NGSCAN = { gap: 0.3, backChars: 3, tol: 2, minLen: 0.6, maxBack: 90, confirm: 3, step: 15, redo: 20, outsideGap: 3, charSec: 0.22, similar: 0.5, window: 3 };
const pairsOf = (t) => { const cs = [...normText(t)], out = []; for (let i = 0; i + 1 < cs.length; i++) out.push(cs[i] + cs[i + 1]); return out; };

// 講稿 → { lines（口播行）, chapters: [{ title, line（第幾行，0 起）}] }（## 是章節；### 是段落標題，不算）
// 一段一段丟給 scriptLines 算行數：``` 區塊與 <!-- --> 註解的狀態要跟整份一起看，所以遇到 ## 才切段
export function scriptChapters(md) {
  const lines = scriptLines(md), chapters = [];
  let buf = [], n = 0, fence = false;
  for (const raw of String(md ?? '').split(/\r?\n/)) {
    const l = raw.trim();
    if (/^(```|~~~)/.test(l)) fence = !fence;
    const m = !fence && l.match(/^##\s+(.+)$/);
    if (m && !l.startsWith('###')) { n += scriptLines(buf.join('\n')).length; buf = []; chapters.push({ title: m[1].trim(), line: n }); continue; }
    buf.push(raw);
  }
  return { lines, chapters: chapters.filter((c) => c.line < lines.length) };
}

// words＝[{ text, start, end }]；bounds＝主軌換檔的秒數
export function utterances(words, bounds = []) {
  const out = [];
  let cur = null;
  for (const w of words) {
    const cross = cur && bounds.some((b) => cur.end <= b + 1e-6 && w.start >= b - 1e-6);
    if (!cur || w.start - cur.end >= NGSCAN.gap || cross || /[。！？!?]$/.test(cur.text)) { cur = { start: w.start, end: w.end, text: '' }; out.push(cur); }
    cur.text += w.text; cur.end = w.end;
  }
  return out.map((u) => ({ start: r3(u.start), end: r3(u.end), text: u.text }));
}

// 錨點：講稿裡只出現一次的四字組，在逐字稿裡出現＝那一刻講到講稿的那個位置（字元偏移）；前後 6 字內有另一個位置相符的錨點才算（擋掉巧合）
export function scriptAnchors(words, lines, n = 4) {
  const S = lines.map((l) => normText(l)).join(''), lineAt = [];
  lines.forEach((l, i) => { for (const _ of normText(l)) lineAt.push(i); });
  const count = new Map(), pos = new Map();
  for (let i = 0; i + n <= S.length; i++) { const g = S.slice(i, i + n); count.set(g, (count.get(g) || 0) + 1); pos.set(g, i); }
  const T = [];
  for (const w of words) { const cs = [...normText(w.text)]; cs.forEach((c, k) => T.push({ c, t: r3(w.start + (k / Math.max(1, cs.length)) * (w.end - w.start)) })); }
  const raw = [];
  for (let i = 0; i + n <= T.length; i++) { const g = T.slice(i, i + n).map((x) => x.c).join(''); if (count.get(g) === 1) raw.push({ i, t: T[i].t, s: pos.get(g) }); }
  const ok = raw.filter((a, k) => raw.slice(Math.max(0, k - 4), k + 5).some((b) => b !== a && Math.abs(b.i - a.i) <= 6 && Math.abs((b.s - a.s) - (b.i - a.i)) <= 1));
  return { S, lineAt, T, anchors: ok.map((a) => ({ ...a, line: lineAt[a.s] })) };
}

export function ngScanRows(words, { lines = null, bounds = [] } = {}) {
  const ng = [], outside = [];
  if (lines && lines.length) {
    const A = scriptAnchors(words, lines);
    const live = [];
    let far = -1;
    const all = A.anchors;
    // 從錨點 k 起一路往下講（相鄰錨點只往前一點點）的那一串：n＝接了幾個、reach＝講到哪
    const run = (k) => {
      let reach = all[k].s, n = 0;
      for (let j = k + 1; j < all.length && n < 40; j++) {
        const d = all[j].s - all[j - 1].s;
        if (d < -NGSCAN.tol || d > NGSCAN.step) break;
        reach = Math.max(reach, all[j].s); n++;
      }
      return { reach, n };
    };
    for (let ai = 0; ai < all.length; ai++) {
      const a = all[ai];
      // 往前大跳（中間有講稿外的話、或巧合撞到後面相似的字）：後面要接著往下講才算，不然當雜訊
      if (far >= 0 && a.s > far + NGSCAN.step && run(ai).n < NGSCAN.confirm) continue;
      if (a.s < far - NGSCAN.backChars) {
        // 往回跳要站得住：從新位置一路往下講，講回到前一次講到的地方、或重講了 ≥ 20 字（巧合只會往回幾個字就跳走）
        const r = run(ai);
        if (r.n < NGSCAN.confirm || !(r.reach >= far - NGSCAN.backChars || r.reach - a.s >= NGSCAN.redo)) continue;
        // 前一次講到這個位置的那個錨點起（最後一串在重講位置之後的錨點），到重講開口前，都是 NG
        let k = live.length;
        while (k > 0 && live[k - 1].s >= a.s) k--;
        if (a.t - live[k].t > NGSCAN.maxBack) continue;   // 前一次在 90 秒以前：不是重講，是講稿裡相似的另一句
        const gone = live.splice(k);
        const t0 = gone[0].t, t1 = a.t;
        if (t1 - t0 >= NGSCAN.minLen) {
          const text = A.T.filter((x) => x.t >= t0 - 1e-6 && x.t < t1).map((x) => x.c).join('');
          ng.push({ start: r3(t0), end: r3(t1), text: text.slice(0, 40), line: a.line + 1, again: r3(t1) });
        }
        far = live.length ? Math.max(...live.map((x) => x.s)) : -1;
      }
      live.push(a);
      far = Math.max(far, a.s);
    }
    // 講稿外：前後兩個錨點相距 ≥ 3 秒、中間有 ≥ 6 個字
    for (let k = 1; k < all.length; k++) {
      const a = all[k - 1], b = all[k];
      const mid = A.T.filter((x) => x.t > a.t + 0.3 && x.t < b.t - 0.3);
      if (b.t - a.t >= NGSCAN.outsideGap && mid.length >= 6) outside.push({ start: r3(mid[0].t), end: r3(mid[mid.length - 1].t), text: mid.map((x) => x.c).join('') });
    }
    // 每一行第一次（還算數的）開口時間
    const lineTime = new Map();
    for (const a of live) if (!lineTime.has(a.line)) lineTime.set(a.line, r3(Math.max(0, a.t - (a.s - A.S.indexOf(normText(lines[a.line]))) * NGSCAN.charSec)));
    return { ng: markCross(ng, bounds), outside, lineTime, anchors: A.anchors.length };
  }
  // 沒講稿：相鄰幾句兩兩相像 → 前一句
  const U = utterances(words, bounds);
  for (let i = 0; i < U.length; i++) {
    const S = new Set(pairsOf(U[i].text));
    if (S.size < 3) continue;
    for (let j = i + 1; j <= Math.min(U.length - 1, i + NGSCAN.window); j++) {
      const B = pairsOf(U[j].text), hit = B.filter((g) => S.has(g)).length;
      if (hit / Math.max(S.size, B.length) >= NGSCAN.similar) { ng.push({ start: U[i].start, end: U[j].start, text: U[i].text.slice(0, 40), line: null, again: U[j].start }); break; }
    }
  }
  return { ng: markCross(ng, bounds), outside, lineTime: new Map(), anchors: 0 };
}

// NG 跨過換檔點（前一支結尾＋下一支開頭）：換檔處的詞級時間常被拉長，下一支開頭的試講也常被併掉 → 標出換檔點，交使用者聽
function markCross(ng, bounds) {
  for (const g of ng) { const b = bounds.find((x) => x > g.start + 0.1 && x < g.end); if (b != null) g.cross = b; }
  return ng;
}

export function ngScan(P, { log = console.log } = {}) {
  const work = path.join(P.project, 'work');
  let words;
  try { words = JSON.parse(fs.readFileSync(path.join(work, 'transcript.json'), 'utf8')); } catch { throw new Error(`找不到 work/transcript.json → 先轉 main.mp4 的逐字稿（剪乾淨步驟 2）`); }
  if (!Array.isArray(words)) words = words.words || [];
  const clips = mainClips(P, path.join(work, 'main.mp4'));
  const total = clips.length ? clips[clips.length - 1].end : null, last = words.length ? words[words.length - 1].end : 0;
  if (total && last < total * 0.8) log(`⚠ work/transcript.json 只到 ${fmtC(last)}，main.mp4 長 ${fmtC(total)}：可能是 rough.mp4 的逐字稿（剪乾淨步驟 7 會覆蓋）→ 重轉 main.mp4 的逐字稿再跑`);
  const scriptFile = path.join(P.project, '講稿.md');
  const sc = fs.existsSync(scriptFile) ? scriptChapters(fs.readFileSync(scriptFile, 'utf8')) : null;
  const r = ngScanRows(words, { lines: sc?.lines || null, bounds: clips.slice(1).map((c) => c.start) });
  if (sc) {
    const md = ['# ng-scan（media.mjs ng-scan 產生）：講稿每一行在 main.mp4 第一次（NG 以外）開口的秒數', '', '| 行 | 時間 | 講稿 |', '|---|---|---|',
      ...sc.lines.map((l, i) => `| ${i + 1} | ${r.lineTime.has(i) ? fmtC(r.lineTime.get(i)) : '—'} | ${l} |`)];
    fs.writeFileSync(path.join(work, 'ng-scan.md'), md.join('\n') + '\n');
  }
  log(`逐字稿 ${words.length} 個詞${sc ? `；講稿 ${sc.lines.length} 行，對到 ${r.anchors} 個錨點（講稿裡只出現一次的四字組）；每一行的開口時間寫在 work/ng-scan.md` : '；沒有講稿：只比相鄰句'}`);
  log('');
  log(`NG 候選 ${r.ng.length} 列（${sc ? '講到講稿後面又跳回前面＝重講，留最後一次' : '相鄰句很像，留後面那句'}；照抄進 cuts.md 的 NG 表，拿不準的寫「待確認」）：`);
  log('| 時間碼 | 內容 | 原因 | 待確認 |');
  log('|---|---|---|---|');
  for (const g of r.ng) log(`| ${fmtC(g.start)}–${fmtC(g.end)} | ${g.text} | ${g.line ? `講稿第 ${g.line} 行在 ${fmtC(g.again)} 又講一次，留後面那次` : `${fmtC(g.again)} 又講一次，留後面那次`} | ${g.cross != null ? `跨過換檔點 ${fmtC(g.cross)}：換檔處逐字稿時間常不準、下一支開頭可能還有試講 → 請聽 ${fmtC(g.cross)} 之後確認從哪裡重講（終點改到那裡）` : '—'} |`);
  if (r.outside.length) {
    log('');
    log(`講稿外 ${r.outside.length} 處（講稿找不到的話：口誤、自言自語、臨場加的話，或 whisper 聽錯；聽了再決定，不確定就不剪）：`);
    for (const u of r.outside.slice(0, 20)) log(`  ${fmtC(u.start)}–${fmtC(u.end)}  ${u.text.slice(0, 40)}`);
    if (r.outside.length > 20) log(`  …還有 ${r.outside.length - 20} 處`);
  }
  if (sc?.chapters.length) {
    log('');
    log('章節空檔表（照抄進 cuts.md；時間碼是這一章第一句的開口秒數，ng-snap 會再往後找實際開口點）：');
    log('| 章節 | 第一句 | 時間碼 |');
    log('|---|---|---|');
    for (const c of sc.chapters) {
      let i = c.line;
      while (i < sc.lines.length && !r.lineTime.has(i)) i++;
      log(`| ${c.title} | ${sc.lines[c.line].slice(0, 16)} | ${i < sc.lines.length ? fmtC(r.lineTime.get(i)) : '（找不到 → 聽 main.mp4 補）'} |`);
    }
  }
  log('');
  log('→ 下一步：照抄進 work/cuts.md（NG 表、章節空檔表、需要你決定），再跑 ng-snap');
  log(`node shared/template/tools/media.mjs ng-snap --project ${posixRel(P.project)}`);
  return r;
}

export function ngSnap(P, { edit = CUT.edit, margin = CUT.margin, src = null, v1 = null, log = console.log } = {}) {
  const mSec = parseMargin(margin);
  const work = path.join(P.project, 'work');
  const cutsFile = path.join(work, 'cuts.md');
  if (!fs.existsSync(cutsFile)) throw new Error(`找不到 ${posixRel(cutsFile)} → 先照「剪乾淨」第 4 步列剪輯清單（停點 ① 的格式）`);
  const cm = parseCutsMd(fs.readFileSync(cutsFile, 'utf8'));
  if (cm.errors.length) throw new Error(cm.errors[0]);
  if (!cm.hasNg && !cm.hasChapters) throw new Error('work/cuts.md 裡找不到 NG 表（表頭要有「時間碼」和「原因」）也找不到章節空檔表（表頭要有「章節」和「第一句」）→ 照 AGENTS.md「剪乾淨」第 4 步與停點總表 ① 的格式補表再跑一次');
  const source = mainSource(P, src, { log });
  const info = probeMedia(source);
  const fps = info.fps || 30;
  let v1File = v1 ? path.resolve(v1) : null, cached = false;
  if (!v1File) ({ file: v1File, cached } = aeSilence(P, source, { edit, margin, log }));
  const sil = silencesOf(readV1(v1File), fps);
  const warnings = [], notes = [];
  const chs = chapterKeep(cm.chapters, sil, mSec);
  const snapped = snapNg(cm.ng, sil, CUT.ngWin, chs.filter((c) => !c.none).map((c) => [...c.sil, c.keep[0]]));
  let cutOut = mergeRanges(snapped.filter((r) => !r.skip).map((r) => [r.a, r.b]));
  for (const c of chs) {
    if (c.none || !c.keep) continue;
    for (const [a, b] of cutOut) {
      if (b <= c.keep[0] + 1e-6 || a >= c.keep[1] - 1e-6) continue;
      const ng = snapped.find((r) => !r.skip && r.a <= a + 1e-6 && r.b >= b - 1e-6) || snapped.find((r) => !r.skip && r.b >= c.keep[0]);
      if (a <= c.keep[0] + 1e-6 && b < c.keep[1] - CUT.minKeep) {
        c.keep = [r3(b), c.keep[1]];
        c.conflict = `⚠ NG 第 ${ng?.row ?? '?'} 列和章節 ${c.row} 的保留區重疊，保留區改從 ${fmtC(b)} 開始（剩 ${(c.keep[1] - c.keep[0]).toFixed(2)}s）→ 夠用就照下面的指令剪；想留滿 ${CUT.chKeep.toFixed(1)}s 就把 NG 第 ${ng?.row ?? '?'} 列的結尾往前移`;
      } else {
        c.dropped = true;
        c.conflict = `⚠ NG 第 ${ng?.row ?? '?'} 列吃掉章節 ${c.row} 的停頓，這章不保留 → 想留停頓就把 NG 第 ${ng?.row ?? '?'} 列的結尾往前移`;
      }
    }
  }
  // 邊錄邊講的螢幕錄影：整段保留（停頓時畫面常在操作），只剪 NG
  const clips = mainClips(P, source);
  const scrClips = clips.filter((c) => c.kind === 'screen');
  const scrKeep = scrClips.flatMap((c) => subtractRanges([c.start, c.end], cutOut));
  const addIn = mergeRanges([...chs.filter((c) => c.keep && !c.dropped).map((c) => c.keep), ...scrKeep]);
  const srcRel = posixRel(source), roughRel = posixRel(path.join(work, 'rough.mp4')), v1Rel = posixRel(path.join(work, 'cuts.v1.json'));

  log(`原片：${srcRel}（${fps}fps，${fmtC(info.duration ?? 0)}）；靜音判斷：${v1 ? `--v1 ${posixRel(v1File)}` : `auto-editor --edit "${edit}" --margin ${margin}（快取 work/.cache/ng-snap.v1.json）`}`);
  if (cm.hasNg) {
    const pend = snapped.filter((r) => r.skip).length;
    log(''); log(`NG：cuts.md ${snapped.length} 列 → 剪 ${cutOut.length} 段${pend ? `（${pend} 列待確認不剪）` : ''}`);
    log('  列  原始時間碼            對齊停頓後            內容');
    for (const r of snapped) {
      const orig = `${fmtC(r.start)}–${fmtC(r.end)}`;
      const after = r.skip ? '—' : `${fmtC(r.a)}–${fmtC(r.b)}`;
      const missWhat = r.missStart && r.missEnd ? '前後 1.0s 內沒有停頓，用原值' : r.missStart ? '起點前後 1.0s 內沒有停頓，起點用原值' : r.missEnd ? '終點前後 1.0s 內沒有停頓，終點用原值' : '';
      // 終點往後延到停頓末端：講清楚後一次（重講）從那裡才開口、不會被剪到（Sonnet 實測會把這種列誤標待確認）
      const later = !r.skip && !missWhat && !r.toChapter && r.b > r.end + 0.3 ? `；終點落在後一次開口（${fmtC(r.b)}）之前的停頓末端，後一次完整保留` : '';
      const note = r.skip ? '待確認，不剪' : missWhat ? `⚠ ${missWhat}` : r.toChapter ? '終點停在章節停頓前' : String(r.text).slice(0, 14) + later;
      log(`  ${String(r.row).padEnd(3)} ${orig.padEnd(20)} ${after.padEnd(21)} ${note}`);
      if (r.skip) warnings.push(`⚠ cuts.md NG 第 ${r.row} 列標了待確認（「${r.raw}」），不放進指令 → 使用者確認後把「待確認」欄清空再跑一次`);
      else if (missWhat) warnings.push(`⚠ NG 第 ${r.row} 列（${orig}）${missWhat} → 播 ${srcRel} 的 ${fmtT(Math.max(0, r.start - 1))}–${fmtT(r.end + 1)} 聽一下，切到字就把 cuts.md 的時間碼往停頓移`);
    }
  }
  if (cm.hasChapters) {
    log(''); log(`章節空檔：cuts.md ${chs.length} 章`);
    log('  章  第一句（表上 → 開口）   原始停頓   保留（原片）              剪完空檔');
    for (const c of chs) {
      if (c.none) {
        log(`  ${String(c.row).padEnd(3)} ${fmtC(c.t)} → —              —          —                        —`);
        warnings.push(`⚠ 章節 ${c.row}「${c.title}」第一句 ${fmtC(c.t)} 不在停頓裡、之後 ${CUT.ahead.toFixed(0)} 秒內也找不到停頓，不保留 → 播 ${srcRel} 的 ${fmtT(Math.max(0, c.t - 1))}–${fmtT(c.t + CUT.ahead)} 找那一句真正開口的時間，改 cuts.md 章節空檔表的時間碼再跑一次`);
        continue;
      }
      if (c.early) notes.push(`章節 ${c.row} 時間碼比開口早 ${c.early.toFixed(2)}s，已改用開口 ${fmtC(c.onset)}`);
      const keep = c.dropped ? '—' : `${fmtC(c.keep[0])}–${fmtC(c.keep[1])}${c.short ? '（整段）' : ''}`;
      log(`  ${String(c.row).padEnd(3)} ${`${fmtC(c.t)} → ${fmtC(c.onset)}`.padEnd(22)} ${`${c.pause.toFixed(2)}s`.padEnd(9)} ${keep.padEnd(24)} ${c.dropped ? '—' : `${c.gapAfter.toFixed(2)}s${c.short ? ' ⚠' : ''}`}`);
      if (c.short) warnings.push(`⚠ 章節 ${c.row}「${c.title}」原始停頓只有 ${c.pause.toFixed(2)}s（< ${CUT.chKeep.toFixed(1)}s），剪完只剩 ${c.pause.toFixed(2)}s，章節會壓到人聲 → 可以接受就照下面的指令剪（build 會從那一句起點蓋章節並提醒）；不行就請作者補錄停頓`);
      if (c.conflict) warnings.push(c.conflict);
    }
  }
  if (scrClips.length) {
    log(''); log(`邊錄邊講的螢幕錄影 ${scrClips.length} 支：只剪 NG、停頓保留（--add-in ${scrKeep.length} 段）`);
    for (const c of scrClips) log(`  ${fmtC(c.start)}–${fmtC(c.end)}  ${c.file}`);
  }
  // 主軌順序對講稿（還沒初剪、有講稿、transcript.json 是 main.mp4 轉的才比）
  const scriptFile = path.join(P.project, '講稿.md'), tjFile = path.join(work, 'transcript.json');
  if (clips.length > 1 && fs.existsSync(scriptFile) && fs.existsSync(tjFile) && !fs.existsSync(path.join(work, 'rough.mp4'))
    && fs.statSync(tjFile).mtimeMs >= fs.statSync(source).mtimeMs - 1000) {
    let words = null;
    try { words = JSON.parse(fs.readFileSync(tjFile, 'utf8')); } catch { words = null; }
    if (Array.isArray(words)) {
      const rows = scriptOrder(clips, words, scriptLines(fs.readFileSync(scriptFile, 'utf8')));
      const sug = suggestOrder(rows);
      log(''); log('主軌順序對講稿：');
      log('  順序  講稿行      檔');
      for (const r of rows) log(`  ${String(r.k + 1).padEnd(5)} ${(r.lines.length ? `${r.lines[0]}–${r.lines[r.lines.length - 1]}` : '對不到').padEnd(10)} ${r.file}`);
      for (const r of rows.filter((x) => x.pos == null)) warnings.push(`⚠ ${r.file} 對不到講稿的任何一行（講稿沒寫到的內容，或不是這集的錄音）→ 停點 ① 問使用者要不要接進主軌、放在哪裡`);
      if (sug.some((r, i) => r.k !== i)) {
        const list = sug.map((r) => r.file).join(',');
        warnings.push(`⚠ 主軌順序和講稿不同：照講稿應該是 ${sug.map((r) => r.name || path.basename(r.file)).join(' → ')} → 停點 ① 跟使用者確認；確認後跑 node shared/template/tools/media.mjs main --project ${posixRel(P.project)} --order "${list}"，再重做剪乾淨第 2–4 步`);
      }
    }
  }
  if (notes.length || warnings.length) { log(''); for (const w of [...notes, ...warnings]) log(w); }
  const base = { src: srcRel, edit, margin, cutOut, addIn };
  const commands = [
    aeCommand({ ...base, tail: ['--preview'] }),
    // --progress none：進度條每格一行，長片會灌爆 AI 的工具輸出（bench 實測 39KB 被截斷）
    aeCommand({ ...base, tail: ['-o', `"${roughRel}"`, '--no-open', '--progress', 'none'] }),
    aeCommand({ ...base, tail: ['--export', 'v1', '-o', `"${v1Rel}"`, '--progress', 'none'] }),
  ];
  for (const l of ['', '1. 先看會剪掉多少：', commands[0], '2. 沒問題就輸出初剪：', commands[1], '3. 再存剪接點（只寫 JSON，不轉檔）：', commands[2],
    `→ 然後跑 node shared/template/tools/media.mjs verify-rough --project ${posixRel(P.project)}（檢查初剪有沒有黑畫面），再跑 node shared/template/tools/media.mjs cutpoints --project ${posixRel(P.project)}`]) log(l);
  return { cutOut, addIn, rows: snapped, chapters: chs, commands, warnings, notes, fps, v1: v1File, src: source };
}

// ---------- 剪乾淨第 7 步：cuts.v1.json → work/cutpoints.json ----------
export function cutpointsFromV1(v1, fps, ngRanges = []) {
  const cuts = [], errors = [];
  let kept = 0, run = null, seenKeep = false;
  v1.chunks.forEach(([s, e, sp], i) => {
    if (sp >= 99999) { run = run ? [run[0], e] : [s, e]; return; }
    if (Math.abs(sp - 1) > 1e-9) { errors.push(`cuts.v1.json 第 ${i + 1} 段速度是 ${sp}（只能是 1 或 99999）→ 剪乾淨不要用變速，照 ng-snap 印的指令重剪`); return; }
    if (run && seenKeep) {
      const a = run[0] / fps, b = run[1] / fps;
      const ng = ngRanges.find((r) => { const ov = Math.min(b, r.end) - Math.max(a, r.start); return ov > 1e-6 && ov >= Math.min(CUT.ngKind, (r.end - r.start) * 0.5) - 1e-6; });
      cuts.push({ at: r3(kept / fps), kind: ng ? 'ng' : 'pause', src: [r3(a), r3(b)], ngRow: ng?.row ?? null });
    }
    run = null; seenKeep = true; kept += e - s;
  });
  return { cuts, keptFrames: kept, keptSec: r3(kept / fps), errors };
}

const stampNow = (now) => { const p2 = (n) => String(n).padStart(2, '0'); return `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`; };
function backupPath(file, now, tag = 'bak') {
  const ts = stampNow(now);
  let b = `${file}.${tag}-${ts}`;
  for (let k = 2; fs.existsSync(b); k++) b = `${file}.${tag}-${ts}-${k}`;
  return b;
}

export function cutpoints(P, { dryRun = false, log = console.log, now = new Date() } = {}) {
  const work = path.join(P.project, 'work');
  const v1File = [path.join(work, 'cuts.v1.json'), path.join(work, 'cuts.v1')].find((f) => fs.existsSync(f));
  if (!v1File) throw new Error('找不到 work/cuts.v1.json（也沒有 work/cuts.v1）→ 用剪乾淨第 5 步同樣的參數再跑一次 auto-editor，結尾改 --export v1 -o work/cuts.v1.json（ng-snap 印的第 3 行）');
  const v1 = readV1(v1File);
  const rough = path.join(work, 'rough.mp4');
  if (!fs.existsSync(rough)) throw new Error('找不到 work/rough.mp4 → 先照 ng-snap 印的第 2 行輸出初剪');
  const info = probeMedia(rough);
  const fps = info.fps || 30;
  const cutsFile = path.join(work, 'cuts.md');
  const cm = fs.existsSync(cutsFile) ? parseCutsMd(fs.readFileSync(cutsFile, 'utf8')) : null;
  const ng = cm ? cm.ng.filter((r) => !r.pending) : [];
  const res = cutpointsFromV1(v1, fps, ng);
  if (res.errors.length) throw new Error(res.errors[0]);
  log(`讀 ${posix(path.relative(P.project, v1File))}（${v1.chunks.length} 段）；fps ${fps}（work/rough.mp4）；${cm?.hasNg ? `NG 範圍讀 work/cuts.md（${cm.ng.length} 列）` : 'work/cuts.md 沒有 NG 表'}`);
  log('  #   rough.mp4   種類    原片剪掉的範圍');
  res.cuts.forEach((c, i) => log(`  ${String(i + 1).padEnd(3)} ${fmtC(c.at).padEnd(11)} ${c.kind.padEnd(7)} ${fmtC(c.src[0])}–${fmtC(c.src[1])}（${(c.src[1] - c.src[0]).toFixed(2)}s${c.ngRow ? `，NG 第 ${c.ngRow} 列` : ''}）`));
  const nNg = res.cuts.filter((c) => c.kind === 'ng').length;
  const dur = info.duration ?? 0;
  const diff = Math.round(Math.abs(res.keptSec - dur) * fps);
  log(`共 ${res.cuts.length} 個剪接點：NG ${nNg}、停頓 ${res.cuts.length - nNg}；保留 ${res.keptSec.toFixed(2)}s（${res.keptFrames} 格），rough.mp4 ${dur.toFixed(2)}s（差 ${diff} 格）`);
  const warnings = [];
  if (diff > 2) warnings.push(`⚠ cuts.v1.json 保留的長度 ${res.keptSec.toFixed(2)}s 和 rough.mp4 的 ${dur.toFixed(2)}s 差 ${diff} 格 → cuts.v1.json 可能不是這支 rough.mp4 的參數產生的；用剪乾淨第 5 步完全相同的參數重跑 --export v1`);
  if (!cm?.hasNg) warnings.push('⚠ 沒有 work/cuts.md 的 NG 表，剪接點全部標 pause → 沒有 NG 就不用管；有 NG 就照停點 ① 的格式補 NG 表再跑一次');
  for (const w of warnings) log(w);
  const outFile = path.join(work, 'cutpoints.json');
  const json = JSON.stringify({ cuts: res.cuts.map(({ at, kind }) => ({ at, kind })) }, null, 2) + '\n';
  let backup = null, written = false;
  if (dryRun) log('--dry-run：只印不寫，work/cutpoints.json 沒有動。');
  else if (fs.existsSync(outFile) && fs.readFileSync(outFile, 'utf8') === json) log('work/cutpoints.json 內容相同，沒有寫。');
  else {
    if (fs.existsSync(outFile)) { backup = backupPath(outFile, now); fs.copyFileSync(outFile, backup); }
    fs.writeFileSync(outFile, json);
    written = true;
    log(`已寫 work/cutpoints.json（影片編輯器與 build 的剪接點微淡化會讀它）${backup ? `；舊檔備份在 ${posix(path.relative(P.project, backup))}` : ''}`);
  }
  return { ...res, warnings, written, backup, file: outFile };
}

// ---------- 邊錄邊講的螢幕錄影：初剪後把錄影畫面蓋回主軌（screen-sync）----------
// cuts.v1.json 每個保留段 ∩ main.json 的 screen 段 → rough.mp4 的起訖＋錄影本身的秒數（in）；前後相接、錄影也連續的併成一段
export function screenSegments(clips, v1, fps) {
  const scr = clips.filter((c) => c.kind === 'screen');
  const out = [];
  let acc = 0;
  for (const [s, e, sp] of v1.chunks) {
    if (sp >= 99999) continue;
    const a = s / fps, b = e / fps;
    for (const c of scr) {
      const x = Math.max(a, c.start), y = Math.min(b, c.end);
      if (y - x <= 1e-6) continue;
      const from = acc + (x - a), to = from + (y - x), inn = x - c.start + (c.src ? c.src[0] : 0);
      const l = out[out.length - 1];
      if (l && l.src === c.file && Math.abs(l.to - from) < 1e-6 && Math.abs(l.in + (l.to - l.from) - inn) < 1e-3) l.to = to;
      else out.push({ src: c.file, from, to, in: inn });
    }
    acc += b - a;
  }
  return out.map((x, i) => ({ id: `sync${String(i + 1).padStart(2, '0')}`, type: 'media', src: x.src, from: r3(x.from), to: r3(x.to), in: r3(x.in) }));
}

export const SYNC_ID = /^sync\d+$/;

export function screenSync(P, { writePlan = false, dryRun = false, log = console.log, now = new Date() } = {}) {
  const work = path.join(P.project, 'work'), pj = posixRel(P.project);
  let clips = [];
  try { clips = JSON.parse(fs.readFileSync(path.join(work, 'main.json'), 'utf8')).clips || []; } catch { throw new Error(`找不到 work/main.json → 先跑 node shared/template/tools/media.mjs main --project ${pj}`); }
  if (!clips.some((c) => c.kind === 'screen')) { log('work/main.json 沒有邊錄邊講的螢幕錄影（kind "screen"）→ 不用跑 screen-sync'); return { segments: [], written: false }; }
  const v1File = [path.join(work, 'cuts.v1.json'), path.join(work, 'cuts.v1')].find((f) => fs.existsSync(f));
  if (!v1File) throw new Error('找不到 work/cuts.v1.json → 先照 ng-snap 印的第 3 行存剪接點（--export v1 -o work/cuts.v1.json）');
  const rough = path.join(work, 'rough.mp4');
  if (!fs.existsSync(rough)) throw new Error('找不到 work/rough.mp4 → 先照 ng-snap 印的第 2 行輸出初剪');
  const fps = probeMedia(rough).fps || 30;
  const durOf = new Map();
  const segments = [];
  for (const seg of screenSegments(clips, readV1(v1File), fps)) {
    if (!durOf.has(seg.src)) durOf.set(seg.src, probeMedia(path.join(P.project, ...seg.src.split('/'))).duration ?? Infinity);
    const room = r3(durOf.get(seg.src) - seg.in);   // 主軌把錄影長度補到整格，最後一段可能多出不到一格
    if (room <= 0) continue;
    if (seg.to - seg.from > room) seg.to = r3(seg.from + room);
    segments.push(seg);
  }
  segments.forEach((s, i) => { s.id = `sync${String(i + 1).padStart(2, '0')}`; });
  log(`邊錄邊講的螢幕錄影：${segments.length} 段（${posix(path.relative(P.project, v1File))}、rough.mp4 ${fps}fps）`);
  log('  id      rough.mp4             錄影從    檔');
  for (const s of segments) log(`  ${s.id.padEnd(7)} ${`${fmtC(s.from)}–${fmtC(s.to)}`.padEnd(21)} ${fmtC(s.in).padEnd(9)} ${s.src}`);
  if (dryRun) { log('--dry-run：只印不寫。'); return { segments, written: false }; }
  const outFile = path.join(work, 'screen-sync.json');
  fs.writeFileSync(outFile, JSON.stringify({ segments }, null, 2) + '\n');
  log(`已寫 work/screen-sync.json`);
  if (!writePlan) { log(`→ 寫好 plan.json 草稿後跑 node shared/template/tools/media.mjs screen-sync --project ${pj} --write-plan，把這幾段放進 plan.json`); return { segments, written: true, file: outFile }; }
  const planFile = path.join(work, 'hyperframes', 'plan.json');
  if (!fs.existsSync(planFile)) throw new Error('還沒有 work/hyperframes/plan.json → 先寫 plan.json 草稿，再加 --write-plan');
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const old = (plan.scenes || []).filter((x) => SYNC_ID.test(x.id || '')).length;
  plan.scenes = [...(plan.scenes || []).filter((x) => !SYNC_ID.test(x.id || '')), ...segments];
  const backup = backupPath(planFile, now, 'sync');
  fs.copyFileSync(planFile, backup);
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2) + '\n');
  log(`已寫進 plan.json：${old ? `換掉舊的 ${old} 段、` : ''}放進 ${segments.length} 段（備份 ${posix(path.relative(P.project, backup))}）→ 跑 build --check`);
  return { segments, written: true, file: outFile, plan: planFile, backup };
}

// ---------- 剪乾淨第 5 步之後：初剪有沒有壞（verify-rough）----------
// auto-editor 29.3.1 直接剪手機原檔（VFR、yuvj420p）時，--cut-out 之後的畫面可能全黑、聲音正常（2026-10 範例專案實測）
export const ROUGH = { d: 0.1, pixTh: 0.10, picTh: 0.98, gap: 0.1, dark: 32 };   // dark：原片 YAVG（0–255）低於這個值才算「原片也黑」

// rough.mp4 秒數 → 原片秒數（cuts.v1.json 的保留段依序接起來；超過保留總長就停在最後一格）
export function roughToSource(v1, fps, t) {
  let acc = 0, last = null;
  for (const [s, e, sp] of v1.chunks) {
    if (sp >= 99999) continue;
    const len = (e - s) / fps;
    if (t <= acc + len + 1e-9) return r3(s / fps + Math.max(0, t - acc));
    acc += len; last = e / fps;
  }
  return last == null ? null : r3(last);
}

// 相鄰 ≤ gap 秒的黑段併成一段（blackdetect 常每幾秒斷一格）
export function mergeBlack(ranges, gap = ROUGH.gap) {
  const out = [];
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const l = out[out.length - 1];
    if (l && a - l[1] <= gap + 1e-9) l[1] = Math.max(l[1], b); else out.push([a, b]);
  }
  return out;
}

function blackRanges(file) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-sn', '-dn', '-vf', `blackdetect=d=${ROUGH.d}:pix_th=${ROUGH.pixTh}:pic_th=${ROUGH.picTh}`, '-f', 'null', '-']);
  if (r.status !== 0) throw new Error(`ffmpeg 偵測黑畫面失敗：${String(r.stderr).trim().split(/\r?\n/).pop()}`);
  return [...String(r.stderr).matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)].map((m) => [r3(Number(m[1])), r3(Number(m[2]))]);
}

// 一格畫面的平均亮度（YAVG，0–255）
export function lumaAt(file, at) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(Math.max(0, at)), '-i', file, '-frames:v', '1', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-']);
  const m = String(r.stderr).match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return m ? Math.round(Number(m[1])) : null;
}

function hasVoiceSource(project) {
  if (listFiles(path.join(project, 'assets', 'voice'), [...AUDIO_EXT, ...VIDEO_EXT]).length) return true;
  try { return (JSON.parse(fs.readFileSync(path.join(project, 'work', 'main.json'), 'utf8')).clips || []).some((c) => c.kind === 'voice' || c.kind === 'screen'); } catch { return false; }
}

export function verifyRough(P, { log = console.log } = {}) {
  const work = path.join(P.project, 'work'), proj = posixRel(P.project);
  const rough = path.join(work, 'rough.mp4');
  if (!fs.existsSync(rough)) throw new Error('找不到 work/rough.mp4 → 先照 ng-snap 印的第 2 行輸出初剪');
  const v1File = [path.join(work, 'cuts.v1.json'), path.join(work, 'cuts.v1')].find((f) => fs.existsSync(f));
  if (!v1File) throw new Error('找不到 work/cuts.v1.json → 先跑 ng-snap 印的第 3 行（--export v1 -o work/cuts.v1.json），verify-rough 靠它換回原片的秒數');
  const v1 = readV1(v1File);
  let source = null;
  if (v1.source) {
    const root = path.resolve(P.project, '..', '..');
    source = [path.resolve(v1.source), path.resolve(root, v1.source), path.join(P.project, v1.source)].find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) || null;
  }
  if (!source) source = mainSource(P, null, { normalize: false });
  const info = probeMedia(rough), fps = info.fps || 30, dur = info.duration ?? 0;
  log(`初剪檢查：work/rough.mp4（${fmtC(dur)}，${fps}fps）對照原片 ${posixRel(source)}（用 ${posix(path.relative(P.project, v1File))} 換算秒數）`);
  const black = mergeBlack(blackRanges(rough));
  if (!black.length) { log('✓ work/rough.mp4 沒有黑畫面'); return { ok: true, black: [], rows: [], source }; }
  const voice = hasVoiceSource(P.project);
  const rows = black.map(([a, b]) => {
    const mid = r3((a + b) / 2), at = roughToSource(v1, fps, mid);
    const y = at == null ? null : lumaAt(source, at);
    const bad = y != null && y >= ROUGH.dark;
    return { start: a, end: b, at, luma: y, bad };
  });
  log('  黑畫面（rough.mp4）     長度      原片同位置   原片亮度   判定');
  for (const r of rows) log(`  ${`${fmtC(r.start)}–${fmtC(r.end)}`.padEnd(24)} ${`${(r.end - r.start).toFixed(2)}s`.padEnd(9)} ${(r.at == null ? '—' : fmtC(r.at)).padEnd(12)} ${String(r.luma ?? '—').padEnd(10)} ${r.bad ? '✖ 原片不黑' : '✓ 原片也黑'}`);
  const bad = rows.filter((r) => r.bad);
  if (!bad.length) {
    log(`✓ 黑畫面 ${rows.length} 段，原片同位置也是黑的${voice ? '（只有聲音的素材配的純黑）' : ''}：${rows.map((r) => `${fmtC(r.start)}–${fmtC(r.end)}`).join('、')}`);
    return { ok: true, black, rows, source };
  }
  const total = bad.reduce((s, r) => s + r.end - r.start, 0);
  log(`✖ work/rough.mp4 有 ${bad.length} 段黑畫面（共 ${total.toFixed(1)}s）原片同位置不黑 → 初剪壞了（auto-editor 直接剪手機原檔的已知問題）。剪輯清單不用改，照順序重做：`);
  for (const l of [
    `  1. node shared/template/tools/media.mjs main --project ${proj}`,
    `  2. node shared/template/tools/media.mjs ng-snap --project ${proj}   → 依序跑它印的三行 auto-editor 指令（原片會是 work/main.mp4）`,
    `  3. node shared/template/tools/media.mjs verify-rough --project ${proj}`,
    `  4. node shared/template/tools/media.mjs cutpoints --project ${proj}`,
    `  重做後 rough.mp4 長度和現在（${fmtC(dur)}）差 0.2 秒以內：work/rough.srt 照用；差更多：字幕照「剪乾淨」第 6 步重轉、校正。`,
  ]) log(l);
  return { ok: false, black, rows, source };
}

// ---------- 剪乾淨第 6 步：超過 18 字的字幕拆句 ----------
const PUNCT = '，。！？、；：,.!?;:';
const isAlnum = (c) => /[A-Za-z0-9]/.test(c || '');
function cutCandidates(t) {
  const tiers = [[], [], []];
  for (let k = 1; k < t.length; k++) {
    const L = t.slice(0, k).trimEnd(), R = t.slice(k).trimStart();
    if (!L || !R || PUNCT.includes(R[0])) continue;
    const prev = t[k - 1], next = t[k];
    let tier;
    if (PUNCT.includes(prev)) tier = 0;
    else if (/\s/.test(prev) || /\s/.test(next)) tier = 1;
    else if (!(isAlnum(prev) && isAlnum(next))) tier = 2;
    else continue;
    tiers[tier].push({ L, R, wl: visibleLen(L), wr: visibleLen(R), tier });
  }
  return tiers;
}
// → { parts: [字串], forced: 有沒有用到「沒有標點、斷在中間」 }
export function splitText(t, max = 18) {
  if (visibleLen(t) <= max) return { parts: [t], forced: false };
  const tiers = cutCandidates(t);
  const bal = (a, b) => Math.abs(a.wl - a.wr) - Math.abs(b.wl - b.wr);
  let pick = null;
  // 先挑「左右都放得下」的標點、再空白；都放不下時，有標點或空白就挑最平均的那個再遞迴；完全沒有才斷在中間
  for (const c of tiers.slice(0, 2)) { const ok = c.filter((x) => x.wl <= max && x.wr <= max).sort(bal); if (ok.length) { pick = ok[0]; break; } }
  if (!pick) for (const c of tiers.slice(0, 2)) if (c.length) { pick = [...c].sort(bal)[0]; break; }
  if (!pick && tiers[2].length) pick = [...tiers[2]].sort(bal)[0];
  if (!pick) return { parts: [t], forced: false };
  const a = splitText(pick.L, max), b = splitText(pick.R, max);
  return { parts: [...a.parts, ...b.parts], forced: pick.tier === 2 || a.forced || b.forced };
}

export function splitCues(cues, max = 18) {
  const out = [], changed = [];
  for (const c of cues) {
    const { parts, forced } = splitText(c.text, max);
    if (parts.length === 1) { out.push({ ...c }); continue; }
    const total = parts.reduce((s, p) => s + tw(p), 0) || 1;
    let t = c.start;
    const pieces = parts.map((p, i) => {
      const e = i === parts.length - 1 ? c.end : r3(t + (c.end - c.start) * tw(p) / total);
      const piece = { start: r3(t), end: e, text: p };
      t = e;
      return piece;
    });
    changed.push({ n: c.n, len: visibleLen(c.text), start: c.start, end: c.end, pieces, forced });
    out.push(...pieces);
  }
  return { cues: out.map((c, i) => ({ n: i + 1, start: c.start, end: c.end, text: c.text })), changed };
}

export function srtSplit(P, { max = 18, dryRun = false, log = console.log, now = new Date() } = {}) {
  const mx = Number(max);
  if (!(Number.isFinite(mx) && mx >= 8 && mx <= 40)) throw new Error(`--max 要是 8–40 的數字（預設 18，照 style.md 字幕每則最多 18 字），現在是「${max}」`);
  const work = path.join(P.project, 'work');
  const srtFile = path.join(work, 'rough.srt');
  if (!fs.existsSync(srtFile)) throw new Error('找不到 work/rough.srt → 先照剪乾淨第 6 步產生');
  const planFile = path.join(work, 'hyperframes', 'plan.json');
  if (fs.existsSync(planFile) && /"#\d+/.test(fs.readFileSync(planFile, 'utf8'))) throw new Error(`work/hyperframes/plan.json 已經用到句號（#N），拆句會讓後面的句號全部位移 → 改在影片編輯器分割字幕（影片編輯器會一起重對 plan.json 的 #N）：node shared/template/tools/editor.mjs --project ${posixRel(P.project)}`);
  const text = fs.readFileSync(srtFile, 'utf8');
  const cues = parseSrt(text);
  if (!cues.length) throw new Error('work/rough.srt 讀不到任何字幕 → 照「剪乾淨」第 6 步重新轉出 rough.srt');
  const res = splitCues(cues, mx);
  log(`work/rough.srt 共 ${cues.length} 則，超過 ${mx} 字 ${res.changed.length} 則`);
  if (!res.changed.length) { log(`沒有超過 ${mx} 字的字幕，沒有寫任何檔。`); return { ...res, written: false, backup: null }; }
  for (const c of res.changed) {
    log(`  #${c.n}（${c.len} 字）${fmtC(c.start)}–${fmtC(c.end)}`);
    c.pieces.forEach((p, i) => log(`      → ${p.text.padEnd(18, '　')}${fmtC(p.start)}–${fmtC(p.end)}${c.forced && i === c.pieces.length - 1 ? `   ⚠ 沒有標點，斷在第 ${visibleLen(c.pieces[0].text)} 字 → 到影片編輯器看斷得對不對` : ''}`));
  }
  let shift = 0;
  const shifts = [];
  for (const c of res.changed) { shift += c.pieces.length - 1; if (cues.some((x) => x.n > c.n)) shifts.push(`原 #${c.n + 1} 起往後 +${shift}`); }
  log(`拆完共 ${res.cues.length} 則${shifts.length ? `（${shifts.join('，')}）` : ''}`);
  if (dryRun) { log('--dry-run：只印不寫，rough.srt 沒有動。'); return { ...res, written: false, backup: null }; }
  const backup = backupPath(srtFile, now, 'split');
  fs.copyFileSync(srtFile, backup);
  fs.writeFileSync(srtFile, formatSrt(res.cues, { eol: text.includes('\r\n') ? '\r\n' : '\n', bom: text.startsWith('﻿') }));
  log(`已寫回 work/rough.srt；原檔備份在 ${posix(path.relative(P.project, backup))}（要還原就把它複製回 rough.srt）`);
  log('→ 接著跑 snap-srt（剪乾淨第 6 步）；之後要拆句請到影片編輯器分割，不要再跑 srt-split');
  return { ...res, written: true, backup };
}

// ---------- 剪乾淨第 6 步：字幕對講稿（srt-align，F8）----------
// 單位是完整語句：有講稿＝講稿每一行；沒講稿＝rough.srt 每則依「，。！？；」切成子句。時間用 work/transcript.json（詞級）做全域序列對齊。
export const ALIGN = { max: 18, breath: 0.12, short: 4, closeGap: 1.0, minQ: 0.34, minDur: 0.6, maxCells: 4e8, pause: 1.5, edge: 0.5, blip: 0.25 };   // pause：聲音停這麼久以上，字幕不蓋（keepPauses）；edge：字幕起點到停頓（停頓到終點）之間說話不到這麼久＝攤進停頓的尾巴；blip：短於這個的聲響不打斷停頓
const CJK_PUNCT_DROP = /[，。；：]/;
const isCjk = (c) => !!c && c.codePointAt(0) >= 0x2e80;

// 講稿.md → 口播行：去掉 # 標題、> 引言、``` 區塊、<!-- --> 註解、含 ` 的說明行、整行括號的舞台指示、分隔線、空行
export function scriptLines(md) {
  const out = [];
  let fence = false, comment = false;
  for (const raw of String(md ?? '').replace(/^﻿/, '').split(/\r?\n/)) {
    const l = raw.trim();
    if (/^(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    if (comment) { if (l.includes('-->')) comment = false; continue; }
    if (l.startsWith('<!--')) { if (!l.includes('-->')) comment = true; continue; }
    if (!l || l.startsWith('#') || l.startsWith('>') || l.includes('`') || /^[-*_]{3,}$/.test(l) || /^[（(].*[）)]$/.test(l)) continue;
    out.push(l);
  }
  return out;
}

// 顯示文字：去「，。；：」（半形 , ; : 不在數字中間時也去），保留「、！？」；拿掉標點後中英文之間補半形空格
export function displayText(s) {
  const ch = [...String(s ?? '').trim()];
  let out = '';
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    const drop = CJK_PUNCT_DROP.test(c) || (/[,;:]/.test(c) && !(/\d/.test(ch[i - 1] || '') && /\d/.test(ch[i + 1] || '')));
    if (!drop) { out += c; continue; }
    const prev = out.slice(-1), next = ch[i + 1] || '';
    if (prev && next && !/\s/.test(prev) && !/\s/.test(next) && (/[A-Za-z0-9]/.test(prev) || /[A-Za-z0-9]/.test(next))) out += ' ';
  }
  return out.replace(/\s+/g, ' ').replace(/\s+([、！？])/g, '$1').replace(/、+$/, '').trim();
}

// 一段文字的正規化字元（比對用）與它在原文的位置
function normChars(s) {
  const out = [];
  let pos = 0;
  for (const c of String(s)) {
    for (const n of normText(c)) out.push({ c: n, i: pos });
    pos += c.length;
  }
  return out;
}
// 逐字稿的字元：每個詞的時間平均分給它的字
function wordCharTimes(words) {
  const out = [];
  for (const w of words) {
    const cs = [...normText(w.text)];
    const d = (w.end - w.start) / (cs.length || 1);
    cs.forEach((c, k) => out.push({ c, a: w.start + k * d, b: w.start + (k + 1) * d }));
  }
  return out;
}
// 全域序列對齊（Needleman–Wunsch，字元層級；相同 0、替換 1、插入／刪除 1）→ A 每個字對到 B 的哪個字（-1＝沒對到）與是否相同
export function alignSeq(A, B) {
  const n = A.length, m = B.length;
  if ((n + 1) * (m + 1) > ALIGN.maxCells) throw new Error(`講稿 ${n} 字 × 逐字稿 ${m} 字太大，對齊會用掉太多記憶體 → 把講稿與影片分段處理`);
  const W = m + 1;
  const back = new Uint8Array((n + 1) * W);   // 0 對角、1 上（A 多出來）、2 左（B 多出來）
  let prev = new Int32Array(W), cur = new Int32Array(W);
  for (let j = 0; j <= m; j++) { prev[j] = j; back[j] = 2; }
  for (let i = 1; i <= n; i++) {
    cur[0] = i; back[i * W] = 1;
    const a = A[i - 1];
    for (let j = 1; j <= m; j++) {
      const d = prev[j - 1] + (a === B[j - 1] ? 0 : 1), u = prev[j] + 1, l = cur[j - 1] + 1;
      if (d <= u && d <= l) { cur[j] = d; back[i * W + j] = 0; } else if (u <= l) { cur[j] = u; back[i * W + j] = 1; } else { cur[j] = l; back[i * W + j] = 2; }
    }
    [prev, cur] = [cur, prev];
  }
  const map = new Int32Array(n).fill(-1), same = new Uint8Array(n);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const b = i > 0 && j > 0 ? back[i * W + j] : i > 0 ? 1 : 2;
    if (b === 0) { map[i - 1] = j - 1; same[i - 1] = A[i - 1] === B[j - 1] ? 1 : 0; i--; j--; } else if (b === 1) i--; else j--;
  }
  return { map, same, dist: prev[m] };
}

// 每一行的起迄：行裡對到的字的第一個起點、最後一個終點；相同字比例 < minQ 或沒有字對到＝對不上（之後內插）
export function alignLines(lines, words) {
  const L = lines.map((t) => normChars(t));
  const A = L.flatMap((cs) => cs.map((x) => x.c));
  const Bt = wordCharTimes(words);
  const { map, same } = alignSeq(A, Bt.map((x) => x.c));
  let k = 0;
  return lines.map((text, li) => {
    const cs = L[li].map((x) => { const j = map[k], s = same[k]; k++; return { i: x.i, t: j >= 0 ? Bt[j] : null, same: !!s }; });
    const hit = cs.filter((x) => x.t);
    const q = cs.length ? cs.filter((x) => x.same).length / cs.length : 0;
    const ok = hit.length > 0 && q >= ALIGN.minQ;
    return { text, chars: cs, q: r3(q), ok, start: ok ? r3(hit[0].t.a) : null, end: ok ? r3(hit[hit.length - 1].t.b) : null };
  });
}

// 換句的連接詞：下一行用這些開頭就是新的一句，不和上一行併
export const CONNECTIVE = /^(而|但|所以|因為|另外|如果|或者|然後|接著|最後|為了|現在|不過|可是|因此|於是|首先|其次|再來|那麼|當|雖然|只是|其實)/;
const SENT_END = /[。！？!?]$/;
const joinDisp = (a, b) => a + (/[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b) || (isCjk(a.slice(-1)) && /^[A-Za-z0-9]/.test(b)) || (/[A-Za-z0-9]$/.test(a) && isCjk(b[0])) ? ' ' : '') + b;

// 一行（或子句）原文第 r0–r1 個字（原文位置）的起迄：用對到的字；都沒對到就照字寬在整行時間內比例分
function spanTime(row, r0, r1) {
  const hit = row.chars.filter((x) => x.i >= r0 && x.i < r1 && x.t);
  if (hit.length) return [hit[0].t.a, hit[hit.length - 1].t.b];
  const total = tw(row.text) || 1, a = tw(row.text.slice(0, r0)) / total, b = tw(row.text.slice(0, r1)) / total;
  return [row.start + (row.end - row.start) * a, row.start + (row.end - row.start) * b];
}
// 超過 max 字的行拆開：先斷在「、，。！？；：」（兩邊都放得下、最平均），都沒有才斷在中段停頓最長的地方（forced）
function splitRow(row, max) {
  const disp = displayText(row.text);
  if (visibleLen(disp) <= max) return [{ ...row, disp, r0: 0, r1: row.text.length }];
  const t = row.text;
  const cand = [];
  for (let k = 1; k < t.length; k++) if (/[、，。！？；：,;!?]/.test(t[k - 1])) cand.push(k);
  const fits = (k) => visibleLen(displayText(t.slice(0, k))) <= max && visibleLen(displayText(t.slice(k))) <= max;
  const bal = (k) => Math.abs(tw(t.slice(0, k)) - tw(t.slice(k)));
  let k = cand.filter(fits).sort((x, y) => bal(x) - bal(y))[0] ?? [...cand].sort((x, y) => bal(x) - bal(y))[0];
  let forced = false;
  if (k == null) {
    // 沒有標點：在 30–70% 之間找相鄰兩個字時間差最大的地方（英數字中間不切）
    forced = true;
    let best = null;
    const cs = row.chars;
    for (let q = 1; q < cs.length; q++) {
      const pos = cs[q].i;
      if (pos < t.length * 0.3 || pos > t.length * 0.7 || (/[A-Za-z0-9]/.test(t[pos - 1]) && /[A-Za-z0-9]/.test(t[pos]))) continue;
      const g = cs[q].t && cs[q - 1].t ? cs[q].t.a - cs[q - 1].t.b : 0;
      if (!best || g > best.g + 1e-9 || (Math.abs(g - best.g) < 1e-9 && bal(pos) < bal(best.pos))) best = { pos, g };
    }
    k = best ? best.pos : Math.round(t.length / 2);
  }
  const mk = (a, b) => { const sub = { ...row, text: t.slice(a, b) }; return sub; };
  const [la, lb] = spanTime(row, 0, k), [ra, rb] = spanTime(row, k, t.length);
  const left = { ...mk(0, k), start: r3(la), end: r3(lb), chars: row.chars.filter((x) => x.i < k), forced };
  const right = { ...mk(k, t.length), start: r3(ra), end: r3(rb), chars: row.chars.filter((x) => x.i >= k).map((x) => ({ ...x, i: x.i - k })), forced };
  return [...splitRow(left, max), ...splitRow(right, max)].map((p) => ({ ...p, split: true, forced: p.forced || forced }));
}

// 對不上的行：在前後對得上的行之間照字寬內插
function interpolate(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].ok) continue;
    let j = i;
    while (j < rows.length && !rows[j].ok) j++;
    const lo = i > 0 ? rows[i - 1].end : 0;
    const run = rows.slice(i, j), total = run.reduce((s, r) => s + Math.max(tw(r.text), 1), 0);
    const hi = j < rows.length ? rows[j].start : lo + total * 0.25;
    let t = lo;
    for (const r of run) { const d = (hi - lo) * Math.max(tw(r.text), 1) / total; r.start = r3(t); r.end = r3(t + d); t += d; r.interp = true; }
    i = j - 1;
  }
  return rows;
}

// 字幕不蓋長停頓（純函式）：speech＝說話區間 [[起, 迄], …]，兩段之間空 ≥ ALIGN.pause 的是停頓。
// 起點落在停頓裡，或起點到停頓之間說話不到 ALIGN.edge 秒（上一句的尾巴、換氣）→ 挪到停頓終點（開口，往前留 SNAP.lead）；
// 終點落在停頓裡，或停頓到終點之間說話不到 ALIGN.edge 秒 → 收到停頓起點＋SNAP.tailPad。每則至少 ALIGN.minDur、不和下一則重疊。
export function keepPauses(cues, speech, { pause = ALIGN.pause, edge = ALIGN.edge } = {}) {
  const gaps = [];
  for (let i = 1; i < speech.length; i++) if (speech[i][0] - speech[i - 1][1] >= pause - 1e-9) gaps.push([speech[i - 1][1], speech[i][0]]);
  const talk = (x, y) => speech.reduce((t, [a, b]) => t + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  const out = cues.map((c) => ({ ...c }));
  let moved = 0;
  for (let i = 0; i < out.length; i++) {
    const c = out[i], next = out[i + 1];
    const gs = gaps.find(([a, b]) => c.start < b - 1e-6 && b < c.end && talk(c.start, a) < edge);
    const ge = gaps.find(([a, b]) => c.end > a + SNAP.tailPad + 1e-6 && a > c.start && talk(b, c.end) < edge);
    let s = c.start, e = c.end;
    if (gs) s = Math.max(gs[0], gs[1] - SNAP.lead);
    if (ge && ge[0] > s) e = ge[0] + SNAP.tailPad;
    if (e - s < ALIGN.minDur) e = s + ALIGN.minDur;
    if (next && e > next.start) e = Math.max(s + 0.01, next.start);
    if (Math.abs(s - c.start) > 1e-6 || Math.abs(e - c.end) > 1e-6) { c.start = r3(s); c.end = r3(e); moved++; }
  }
  return { cues: out, moved, pauses: gaps.length };
}

// 講稿行（或子句）＋逐字稿 → 字幕：對齊 → 內插 → 長行拆 → 同一口氣的短行併 → 相鄰空檔 < closeGap 補滿
// lines：[{ text, from?（講稿第幾行，1 起）, cue?（沒講稿時：原 rough.srt 第幾則）, start?, end?（沒有逐字稿時的比例時間）}]
export function alignCues(lines, words, { max = ALIGN.max } = {}) {
  let rows;
  if (words && words.length) {
    rows = alignLines(lines.map((l) => l.text), words).map((r, i) => {
      const l = lines[i];
      if (r.ok) return { ...l, ...r };
      // 沒講稿時子句本來就有 rough.srt 的比例時間：對不上就用它，不內插
      return l.start != null ? { ...l, chars: r.chars, q: r.q, ok: true, est: true } : { ...l, chars: r.chars, q: r.q, ok: false, start: null, end: null };
    });
  } else rows = lines.map((l) => ({ ...l, chars: [], q: 0, ok: l.start != null, est: l.start != null }));
  interpolate(rows);
  const parts = rows.flatMap((r) => splitRow(r, max).map((p) => ({ ...p, lines: [r.from ?? r.cue] })));
  const out = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    let ok = false;
    if (last && !last.interp && !p.interp && !last.split && !p.split && !SENT_END.test(last.text) && !CONNECTIVE.test(p.text)) {
      const joined = joinDisp(last.disp, p.disp);
      const breath = p.start - last.end <= ALIGN.breath + 1e-9;
      const short = (visibleLen(last.dispLast ?? last.disp) <= ALIGN.short || visibleLen(p.disp) <= ALIGN.short) && p.start - last.end < ALIGN.closeGap;
      ok = visibleLen(joined) <= max && (breath || short);
      if (ok) { last.disp = joined; last.dispLast = p.disp; last.text = p.text; last.end = p.end; last.lines.push(...p.lines); last.merged = (last.merged || 1) + 1; }
    }
    if (!ok) out.push({ ...p, lines: [...p.lines] });
  }
  for (let i = 0; i < out.length - 1; i++) {
    const g = out[i + 1].start - out[i].end;
    if (g < ALIGN.closeGap) out[i].end = out[i + 1].start;
  }
  const cues = out.map((c, i) => ({ n: i + 1, start: r3(c.start), end: r3(Math.max(c.end, c.start)), text: c.disp }));
  const info = out.map((c, i) => ({ n: i + 1, lines: c.lines, merged: c.merged || 1, split: !!c.split, forced: !!c.forced, interp: !!c.interp, q: c.q }));
  return { cues, info, rows };
}

// 沒講稿：rough.srt 每則依「，。！？；」切成子句，時間先照字寬在那一則裡比例分
export function clausesFromSrt(cues) {
  const out = [];
  for (const c of cues) {
    const parts = String(c.text).split(/(?<=[，。！？；]|[,;!?](?!\d))/).map((s) => s.trim()).filter(Boolean);
    const total = parts.reduce((s, p) => s + Math.max(tw(p), 0.5), 0) || 1;
    let t = c.start;
    for (const p of parts) { const d = (c.end - c.start) * Math.max(tw(p), 0.5) / total; out.push({ text: p, cue: c.n, start: r3(t), end: r3(t + d) }); t += d; }
  }
  return out;
}

// plan.json（含 outro.from）與情境動畫 P.at('#N…') 的句號照時間換到新字幕（srt-align 會重新斷句，句數會變）：
//   #N@詞 → 新字幕裡有這個詞、離舊句最近的那一句（詞找不到就退成時間 ⚠）；#Ne → 結尾 ±0.15 秒有新句結尾就 #Me；
//   其他 → 同一個秒數：±0.3 秒內有新句開頭就綁那一句，否則落在的那一句＋差。
//   段落有 anchor、from 是句首（#N）時：from 改綁含 anchor 的新句開頭（±3 秒內），整段的其他時間跟著平移；別段寫同一個 "#N" 的（例前一段的 to）也一起換，0 秒相接不會斷。
export function refMapper(oldCues, newCues, { overrides = new Map(), segShift = new Map() } = {}) {
  const notes = [];
  const byN = new Map(oldCues.map((c) => [c.n, c]));
  const at = (T) => newCues.find((c) => T >= c.start - 1e-6 && T < c.end - 1e-6) ?? newCues.find((c) => c.start >= T) ?? newCues[newCues.length - 1];
  const asTime = (T) => {
    const s0 = newCues.map((c) => ({ c, d: Math.abs(c.start - T) })).sort((x, y) => x.d - y.d)[0];
    const c = s0 && s0.d <= 0.3 ? s0.c : at(T);
    const off = r3(T - c.start);
    return { n: c.n, end: false, off: Math.abs(off) <= 0.1 ? 0 : off };
  };
  const map = (r, id) => {
    const o = byN.get(r.n);
    if (!o) return null;
    if (r.kw == null && !r.end && !r.off && overrides.has(`#${r.n}`)) return overrides.get(`#${r.n}`);
    if (r.kw != null) {
      const k = normText(r.kw);
      const near = (c) => (c.end > o.start - 1e-6 && c.start < o.end + 1e-6 ? 0 : Math.min(Math.abs(c.start - o.start), Math.abs(c.end - o.end)));
      const hit = newCues.filter((c) => k && normText(c.text).includes(k)).sort((x, y) => near(x) - near(y))[0];
      if (hit && near(hit) < 15) return { ...r, n: hit.n };
      const T = refTime(fmtRef(r), oldCues) ?? o.start;
      notes.push(`${id}：${fmtRef(r)} 的「${r.kw}」在新字幕找不到 → 改成時間 ${fmtRef(asTime(T))}（到影片編輯器或 plan.json 換成新字幕裡的詞）`);
      return asTime(T);
    }
    const T = (r.end ? o.end : o.start) + (r.off || 0) + (segShift.get(id) || 0);
    if (r.end) { const e = newCues.find((c) => Math.abs(c.end - T) < 0.15); if (e) return { n: e.n, end: true, off: 0 }; }
    return asTime(T);
  };
  return { map, notes, newCues };
}
const mapRefStr = (v, mp, id) => { const r = parseRef(v); if (!r) return v; const o = mp.map(r, id); return o ? fmtRef(o) : v; };
export function remapPlanByTime(plan, oldCues, newCues) {
  const overrides = new Map(), segShift = new Map();
  for (const seg of Array.isArray(plan?.scenes) ? plan.scenes : []) {
    const r = seg && typeof seg.anchor === 'string' && typeof seg.from === 'string' ? parseRef(seg.from) : null;
    const o = r && r.kw == null && !r.end && !r.off ? oldCues.find((c) => c.n === r.n) : null;
    const k = o ? normText(seg.anchor) : '';
    if (!k) continue;
    const hit = newCues.filter((c) => normText(c.text).includes(k)).sort((x, y) => Math.abs(x.start - o.start) - Math.abs(y.start - o.start))[0];
    if (!hit || Math.abs(hit.start - o.start) > 3) continue;
    overrides.set(`#${r.n}`, { n: hit.n, end: false, off: 0 });
    segShift.set(seg.id, hit.start - o.start);
  }
  const mp = refMapper(oldCues, newCues, { overrides, segShift });
  let out = mapPlanTimes(plan, (r, id) => mp.map(r, id));
  // 章節轉場的 at 只能寫 "#N"（該章第一句）：照時間換成 "#282-2.99" 這種時（字幕避開了章節前的停頓），收回成那一句
  if (Array.isArray(out?.scenes) && out.scenes.some((sg, i) => sg && typeof sg.at === 'string' && sg.at !== plan.scenes[i]?.at)) {
    out = { ...out, scenes: out.scenes.map((sg) => {
      const r = sg && typeof sg.at === 'string' ? parseRef(sg.at) : null;
      if (!r || (!r.end && !r.off && r.kw == null)) return sg;
      return { ...sg, at: `#${r.end ? r.n + 1 : r.n}` };
    }) };
  }
  if (out.outro && typeof out.outro === 'object' && typeof out.outro.from === 'string') {
    const v = mapRefStr(out.outro.from, mp, 'outro');
    if (v !== out.outro.from) out = { ...out, outro: { ...out.outro, from: v } };
  }
  return { plan: out, notes: mp.notes, mapper: mp };
}
// 情境動畫裡 P.at('#N…')、P.sfx('名', '#N…') 的字串字面值照同一個對應換掉：只換 <script> 裡、不在註解裡的（檔頭說明的範例不動，和 assemble.mjs scanCueRefs 同一個範圍）
export function remapCustomRefs(html, mapper, id) {
  const swap = (code) => code.replace(/(\bP\.at\(\s*)(['"])(#\d+[^'"\n]*)\2(?=\s*[,)])/g, (all, pre, q, ref) => `${pre}${q}${mapRefStr(ref, mapper, id)}${q}`)
    // P.sfx('名', '#N…'[, off]) 的 ref 也是句號（motion.md §5）
    .replace(/(\bP\.sfx\(\s*(['"])[a-z0-9-]+\2\s*,\s*)(['"])(#\d+[^'"\n]*)\3(?=\s*[,)])/g, (all, pre, q0, q, ref) => `${pre}${q}${mapRefStr(ref, mapper, id)}${q}`);
  const inScripts = (h) => h.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (all, open, body, close) =>
    open + body.split(/(\/\*[\s\S]*?\*\/|(?:^|(?<=\s))\/\/[^\n]*)/m).map((part, i) => (i % 2 ? part : swap(part))).join('') + close);
  // HTML 註解（檔頭說明裡也會寫「<script>」）整段不動
  return String(html).split(/(<!--[\s\S]*?-->)/).map((part, i) => (i % 2 ? part : inScripts(part))).join('');
}

const hasRefs = (planText) => /"#\d+/.test(planText);
const fmtS = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

export function srtAlign(P, { dryRun = false, remapPlan = false, max = ALIGN.max, log = console.log, now = new Date() } = {}) {
  const work = path.join(P.project, 'work');
  const srtFile = path.join(work, 'rough.srt'), tjFile = path.join(work, 'transcript.json'), roughFile = path.join(work, 'rough.mp4');
  const scriptFile = path.join(P.project, '講稿.md');
  const pj = posixRel(P.project);
  const transcribe = `npx hyperframes transcribe ${pj}/work/rough.mp4 -d ${pj}/work --model small --language zh --json --to srt -o ${pj}/work/rough.srt`;
  // 逐字稿：transcript.json（詞級）優先；沒有就用 rough.srt 的整則時間（按字數比例，之後要跑 snap-srt）
  let words = null, why = null;
  if (fs.existsSync(tjFile)) {
    try { words = JSON.parse(fs.readFileSync(tjFile, 'utf8')); } catch (e) { throw new Error(`work/transcript.json 不是合法的 JSON（${e.message}）→ 重轉：${transcribe}`); }
    if (!Array.isArray(words) || !words.every((w) => w && typeof w.text === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end))) throw new Error(`work/transcript.json 的格式不是 [{ text, start, end }] → 重轉：${transcribe}`);
    if (!transcriptFresh(tjFile, roughFile)) throw new Error(`work/transcript.json 比 work/rough.mp4 舊（不是這支初剪轉的）→ 重轉：${transcribe}`);
    if (fs.existsSync(roughFile)) noteTranscript(tjFile, roughFile);
  } else why = '沒有 work/transcript.json';
  const srtText = fs.existsSync(srtFile) ? fs.readFileSync(srtFile, 'utf8') : null;
  const oldCues = srtText ? parseSrt(srtText) : [];
  if (!words && !oldCues.length) throw new Error(`沒有 work/transcript.json，也沒有 work/rough.srt → 先轉逐字稿：${transcribe}`);
  if (!words) words = oldCues.map((c) => ({ text: c.text, start: c.start, end: c.end }));
  const hasScript = fs.existsSync(scriptFile);
  const lines = hasScript ? scriptLines(fs.readFileSync(scriptFile, 'utf8')).map((text, i) => ({ text, from: i + 1 })) : clausesFromSrt(oldCues);
  if (!lines.length) throw new Error(hasScript ? '講稿.md 讀不到口播行（# 標題、> 引言、含 ` 的說明行都不算）→ 一句一行寫進講稿.md' : 'work/rough.srt 讀不到任何字幕');
  const res = alignCues(lines, words, { max });
  const { info, rows } = res;
  let { cues } = res, pauseNote = null;
  // 字幕不蓋 rough.mp4 裡的長停頓（章節前的 3 秒）：用聲音的能量找停頓；整支有背景音樂分不出說話就跳過
  if (fs.existsSync(roughFile)) {
    try {
      const env = envelope(roughFile);
      const kp = keepPauses(cues, speechFromEnvelope(env, pickThreshold(env.db).threshold, { minSpeech: ALIGN.blip }));
      if (kp.moved) { cues = kp.cues; res.cues = cues; }
      pauseNote = `rough.mp4 有 ${kp.pauses} 個 ≥ ${ALIGN.pause} 秒的停頓，${kp.moved} 則字幕的起迄避開停頓`;
    } catch (e) { pauseNote = `⚠ 量不到 rough.mp4 的停頓（${e.message.slice(0, 60)}），字幕可能蓋到章節前的停頓`; }
  }
  // 表
  log(`字幕對${hasScript ? '講稿' : '子句'}：${hasScript ? `講稿.md ${lines.length} 行` : `work/rough.srt ${oldCues.length} 則 → ${lines.length} 個子句`}，時間用 ${why ? `work/rough.srt 的整則時間按字數比例（${why}）` : `work/transcript.json（${words.length} 個詞）全域對齊`}`);
  log('  則   起–迄                 長     字   字幕');
  for (const c of cues) {
    const f = info[c.n - 1];
    const tag = [f.merged > 1 ? `併 ${f.merged} 行` : '', f.split ? (f.forced ? '⚠ 拆（沒有標點）' : '拆') : '', f.interp ? '⚠ 內插' : ''].filter(Boolean).join('、');
    log(`  ${String(c.n).padEnd(4)} ${`${fmtS(c.start)}–${fmtS(c.end)}`.padEnd(21)} ${(c.end - c.start).toFixed(2).padStart(5)}  ${String(visibleLen(c.text)).padStart(2)}   ${c.text}${tag ? `   （${tag}${hasScript ? `；講稿第 ${f.lines.join('、')} 行` : ''}）` : ''}`);
  }
  const lens = cues.map((c) => visibleLen(c.text)), durs = cues.map((c) => c.end - c.start).sort((a, b) => a - b);
  const gaps = cues.slice(1).map((c, i) => c.start - cues[i].end).sort((a, b) => a - b);
  const med = (a) => (a.length ? a[Math.floor((a.length - 1) / 2)] : 0);
  log(`共 ${cues.length} 則（併 ${info.filter((f) => f.merged > 1).length} 次、拆出 ${info.filter((f) => f.split).length} 則）；平均 ${(lens.reduce((s, x) => s + x, 0) / (lens.length || 1)).toFixed(1)} 字、最長 ${Math.max(0, ...lens)} 字；每則中位 ${med(durs).toFixed(2)} 秒；相鄰空檔中位 ${med(gaps).toFixed(2)} 秒`);
  if (pauseNote) log(pauseNote);
  const warns = [];
  const bad = rows.filter((r) => !r.ok || r.interp);
  if (bad.length) warns.push(`⚠ ${bad.length} ${hasScript ? '行講稿' : '個子句'}在逐字稿裡對不上，時間用前後句內插：${bad.slice(0, 6).map((r) => `${hasScript ? `第 ${r.from} 行` : `#${r.cue}`}「${r.text}」`).join('、')}${bad.length > 6 ? '…' : ''} → 播 rough.mp4 那一段聽：沒講（剪掉了）就從字幕刪掉，有講就到影片編輯器調起迄`);
  const forced = info.filter((f) => f.forced);
  if (forced.length) warns.push(`⚠ ${forced.length} 則超過 ${max} 字又沒有「、，」可以斷，斷在中段停頓最長的地方：${forced.map((f) => `#${f.n}`).join('、')} → 到影片編輯器看斷得對不對`);
  const short = cues.filter((c) => c.end - c.start < ALIGN.minDur - 1e-9);
  if (short.length) warns.push(`⚠ ${short.length} 則不到 ${ALIGN.minDur} 秒：${short.slice(0, 8).map((c) => `#${c.n}「${c.text}」${(c.end - c.start).toFixed(2)}s`).join('、')} → 到影片編輯器和前後句合併`);
  if (why) warns.push(`⚠ ${why}：時間是整則按字數比例估的 → 寫回後要跑 node shared/template/tools/media.mjs snap-srt --project ${pj}（有 transcript.json 就不用）`);
  for (const w of warns) log(w);
  // plan.json 已經用到 #N
  const planFile = path.join(work, 'hyperframes', 'plan.json');
  const planText = fs.existsSync(planFile) ? fs.readFileSync(planFile, 'utf8') : null;
  const needRemap = planText != null && hasRefs(planText);
  if (dryRun) {
    log(`--dry-run：只印不寫。${needRemap ? `work/hyperframes/plan.json 已經用到句號（#N）→ 寫回時要加 --remap-plan（照時間把 #N 換到新句號，先備份 plan.json）` : '去掉 --dry-run 就寫回 work/rough.srt（原檔先備份成 rough.srt.align-<時間戳>）'}`);
    return { ...res, written: false, warnings: warns };
  }
  if (needRemap && !remapPlan) throw new Error(`work/hyperframes/plan.json 已經用到句號（#N），重新斷句後句號會全部位移 → 加 --remap-plan 再跑一次（照時間把 plan.json 的 #N 換到新句號，plan.json 先備份；之後分鏡表 storyboard.md 的句號會過期，以 plan.json 為準）`);
  let backup = null;
  if (srtText != null) { backup = backupPath(srtFile, now, 'align'); fs.copyFileSync(srtFile, backup); }
  const eol = srtText && srtText.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(srtFile, formatSrt(cues, { eol, bom: !!srtText && srtText.startsWith('﻿') }));
  log(`已寫回 work/rough.srt（${cues.length} 則）${backup ? `；原檔備份在 ${posix(path.relative(P.project, backup))}` : ''}`);
  let remap = null;
  if (needRemap) {
    const plan = JSON.parse(planText);
    remap = remapPlanByTime(plan, oldCues, cues);
    const pb = backupPath(planFile, now, 'align');
    fs.copyFileSync(planFile, pb);
    const indent = (planText.match(/\n([ \t]+)"/) || [, '  '])[1];
    let out = JSON.stringify(remap.plan, null, indent) + '\n';
    if (/\r\n/.test(planText)) out = out.replace(/\n/g, '\r\n');
    fs.writeFileSync(planFile, out);
    log(`plan.json 的句號照時間換到新字幕；原檔備份在 ${posix(path.relative(P.project, pb))}`);
    // 情境動畫（plan.json 的 custom 段）裡的 P.at('#N…')
    const hf = path.join(work, 'hyperframes');
    const srcs = [...new Set((remap.plan.scenes || []).filter((x) => x && x.type === 'custom' && typeof x.src === 'string').map((x) => x.src))];
    const touched = [];
    for (const src of srcs) {
      const file = path.join(hf, src);
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8'), next = remapCustomRefs(html, remap.mapper, src);
      if (next === html) continue;
      fs.copyFileSync(file, backupPath(file, now, 'align'));
      fs.writeFileSync(file, next);
      touched.push(src);
    }
    if (touched.length) log(`情境動畫的 P.at 句號一起換：${touched.join('、')}（各自備份 .align-<時間戳>）`);
    for (const n of remap.notes) log(`⚠ ${n}`);
  }
  log(hasScript
    ? `→ 字幕已經是講稿的字：只剩講稿本身的錯字要改（規則 4）；${why ? '接著跑 snap-srt' : '有 transcript.json，不用跑 snap-srt'}，再跑 media.mjs cutpoints`
    : `→ 照規則 4 校正錯字；${why ? '接著跑 snap-srt' : '有 transcript.json，不用跑 snap-srt'}，再跑 media.mjs cutpoints`);
  return { ...res, written: true, backup, remap, warnings: warns };
}

// ---------- illus-lint：專案自己畫的示意插圖元件（work/hyperframes/illus-local/*.svg） ----------

const mdCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const unTick = (s) => String(s).replace(/`/g, '');
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// work/storyboard.md 的插圖清單（`#### 插圖清單 <段 id>` 底下、表頭有「元件」「來源」兩欄的表；每段一張）。
// 舊名「素材清單」也認（表前最近的標題或上一行有這四個字就算）：
//   來源是「新建 SVG」的列 → local：name → { name, size: [w, h] | null, states, label }（「規格：<name>，建議尺寸 W×H，狀態 a／b」）
//   來源是「畫廊」的列 → gallery：[{ name, attrs, label }]（「怎麼來」的 data-illus="…" data-…="…"）；圖示組合的列不管
const ILLUS_LIST_TITLE = /插圖清單|素材清單/;
export function readIllusList(md) {
  const local = new Map(), gallery = [];
  const lines = String(md || '').split(/\r?\n/);
  let heading = '', prev = '';
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i])) {
      if (/^\s*#{1,6}\s/.test(lines[i])) heading = lines[i];
      if (lines[i].trim()) prev = lines[i];
      continue;
    }
    const head = mdCells(lines[i]), iSrc = head.findIndex((c) => /^來源/.test(c));
    const isList = iSrc >= 0 && head.some((c) => /^元件/.test(c)) && (ILLUS_LIST_TITLE.test(heading) || ILLUS_LIST_TITLE.test(prev));
    let j = i + 1;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      if (!isList) continue;
      const c = mdCells(lines[j]), row = c.join('｜'), src = c[iSrc] || '';
      if (/^[\s:-]*$/.test(c.join(''))) continue;
      if (/新建/.test(src)) {
        const name = (row.match(/規格[：:]\s*`?([a-z][A-Za-z0-9]*)/) || unTick(c[0]).match(/^([a-z][A-Za-z0-9]*)/) || [])[1];
        if (!name || local.has(name)) continue;
        const sz = row.match(/尺寸[^\d｜]*(\d+)\s*[×xX]\s*(\d+)/) || row.match(/(\d+)\s*[×xX]\s*(\d+)/);
        const st = ((row.match(/狀態[：:]?([^｜]*)/) || [])[1] || '').split('描述')[0].replace(/（[^）]*）|\([^)]*\)/g, '');
        const states = unTick(st).split(/[／/、,，;；\s]+/).map((s) => s.replace(/^\.?(il-)?/, '')).filter((s) => /^[a-z][\w-]*$/.test(s));
        local.set(name, { name, size: sz ? [+sz[1], +sz[2]] : null, states, label: unTick(c[0]) });
      } else if (/畫廊/.test(src)) {
        const attrs = Object.fromEntries([...row.matchAll(/data-([a-z][a-z-]*)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
        const name = attrs.illus || (unTick(c[0]).match(/^([a-z][A-Za-z0-9]*)/) || [])[1];
        delete attrs.illus;
        if (name) gallery.push({ name, attrs, label: unTick(c[0]) });
      }
    }
    i = j - 1;
  }
  return { local, gallery };
}

// 在 Node 跑 kit/illus.js（vm），借它自己的 mount 把 data-* 轉成 opts：回傳 (name, attrs) → SVG 字串（不認得的元件回 ''）
function illusInNode(kitDir) {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  sb.window = sb;
  sb.document = { querySelectorAll: () => [] };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(kitDir, 'illus.js'), 'utf8'), sb);
  return (name, attrs) => {
    const dataset = { illus: name };
    for (const [k, v] of Object.entries(attrs)) dataset[k.replace(/-([a-z])/g, (_, x) => x.toUpperCase())] = v;
    const el = { dataset, innerHTML: '', hasAttribute: (a) => a === 'data-illus', classList: { contains: () => false, add() {} } };
    sb.ILLUS.mount({ querySelectorAll: () => [el] });
    return el.innerHTML;
  };
}
const viewBoxSize = (svg) => { const m = String(svg).match(/viewBox="\s*0[\s,]+0[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/); return m ? [+m[1], +m[2]] : null; };

const IL_SHEET = { W: 1920, PAD: 40, GAP: 48, TOP: 92, LAB: 64, BG: { light: '#FEF7F3', dark: '#1A191C' }, INK: { light: '#141414', dark: '#F3EFEA' } };
const IL_MIME = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.json': 'application/json' };

// work/插圖清單.jpg：插圖清單用到的畫廊元件＋illus-local 的新元件，1:1 px、同底色；上一列亮色主題、下一列暗色主題（HyperFrames 的 Chrome 截圖）
async function illusSheet(P, { list, files, dir }) {
  const warns = [], items = [], seen = new Set();
  const kitDir = path.join(P.templateDir, 'kit');
  const svgOf = illusInNode(kitDir);
  for (const g of list.gallery) {
    const attr = [`data-illus="${escHtml(g.name)}"`, ...Object.entries(g.attrs).map(([k, v]) => `data-${k}="${escHtml(v)}"`)].join(' ');
    if (seen.has(attr)) continue;
    seen.add(attr);
    const vb = viewBoxSize(svgOf(g.name, g.attrs));
    if (!vb) { warns.push(['插圖清單', `畫廊沒有「${g.name}」這個元件`, '改成 shared/template/kit/illus-gallery.jpg 上的名稱，或把來源改成「新建 SVG」']); continue; }
    items.push({ w: vb[0], h: vb[1], label: g.label || g.name, how: `畫廊 ${attr}`, attr });
  }
  const nGallery = items.length, shown = new Set();
  for (const f of files) {
    const name = f.replace(/\.svg$/i, ''), vb = viewBoxSize(fs.readFileSync(path.join(dir, f), 'utf8')) || [200, 200];
    const spec = list.local.get(name), label = spec?.label || name, src = `data-illus-src="illus-local/${escHtml(f)}"`;
    items.push({ w: vb[0], h: vb[1], label, how: `新建 illus-local/${f}`, attr: src });
    // 插圖清單寫了狀態：每個狀態多一格（那個 .il-<狀態> 打開）
    for (const st of spec?.states || []) { shown.add(st); items.push({ w: vb[0], h: vb[1], label: `${label} .il-${st}`, how: `新建 illus-local/${f}（狀態 ${st}）`, attr: `${src} data-show="${st}"` }); }
  }
  if (!items.length) return { warns, sheet: null };
  // 排版在 Node 算好（每格寬＝元件寬與兩行標籤取大者），頁高固定，不用量
  let x = IL_SHEET.PAD, y = IL_SHEET.TOP, rowH = 0;
  const cells = [];
  for (const it of items) {
    const cw = Math.ceil(Math.max(it.w, tw(it.label) * 20, it.how.length * 8, 120));
    if (x > IL_SHEET.PAD && x + cw > IL_SHEET.W - IL_SHEET.PAD) { x = IL_SHEET.PAD; y += rowH + IL_SHEET.GAP; rowH = 0; }
    cells.push({ ...it, x, y });
    x += cw + IL_SHEET.GAP;
    rowH = Math.max(rowH, Math.ceil(it.h) + IL_SHEET.LAB);
  }
  const H = y + rowH + IL_SHEET.PAD;
  const page = (theme) => `<!doctype html><html lang="zh-Hant"${theme === 'dark' ? ' data-theme="dark"' : ''}><head><meta charset="utf-8">
${KIT_LINKS.map((l) => `<link rel="stylesheet" href="${l}">`).join('\n')}
<style>html,body{margin:0;width:${IL_SHEET.W}px;height:${H}px;overflow:hidden;background:${IL_SHEET.BG[theme]};color:${IL_SHEET.INK[theme]};font-family:var(--font-cjk,sans-serif)}
h2{position:absolute;left:${IL_SHEET.PAD}px;top:24px;margin:0;font-size:30px;font-weight:700}.cell{position:absolute}.box{position:relative}
.cell b{display:block;margin-top:12px;font-size:20px;font-weight:700;white-space:nowrap}.cell code{display:block;font:13px/1.5 ui-monospace,Menlo,monospace;opacity:.7;white-space:nowrap}
${[...shown].map((st) => `.box[data-show="${st}"] .il-${st}{opacity:1!important}`).join('')}</style></head><body>
<h2>${theme === 'dark' ? '暗色主題（data-theme="dark"）' : '亮色主題'}｜畫廊 ${nGallery} 個、新建 ${files.length} 個（1:1 px）</h2>
${cells.map((c) => `<div class="cell" style="left:${c.x}px;top:${c.y}px"><div class="box" style="width:${c.w}px;height:${c.h}px" ${c.attr}></div><b>${escHtml(c.label)}</b><code>${escHtml(c.how)}</code></div>`).join('\n')}
<script src="kit/illus.js"></script></body></html>`;
  const pages = {
    'sheet.html': `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}iframe{display:block;border:0;width:${IL_SHEET.W}px;height:${H}px}</style></head><body><iframe src="light.html"></iframe><iframe src="dark.html"></iframe></body></html>`,
    'light.html': page('light'), 'dark.html': page('dark'),
  };
  const { findChrome } = await import('./lib/audit-browser.mjs');
  const chrome = findChrome();
  if (!chrome) { warns.push(['插圖清單.jpg', '沒拼：找不到 HyperFrames 的 Chrome', '在工作區根目錄跑 npx -y hyperframes browser ensure，再跑一次 illus-lint']); return { warns, sheet: null }; }
  const roots = [['kit/', kitDir], ['illus-local/', dir]];
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, ''); } catch { res.writeHead(400); res.end(); return; }
    if (pages[p] != null) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(pages[p]); return; }
    for (const [pre, base] of roots) {
      if (!p.startsWith(pre)) continue;
      const f = path.resolve(base, p.slice(pre.length));
      if (f.startsWith(path.resolve(base) + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { 'Content-Type': IL_MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(f).pipe(res);
        return;
      }
    }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'illus-sheet-'));
  const png = path.join(tmp, 'sheet.png'), out = path.join(P.project, 'work', '插圖清單.jpg');
  try {
    await new Promise((resolve, reject) => {
      const cp = spawn(chrome, ['--headless', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', `--user-data-dir=${path.join(tmp, 'u')}`,
        '--virtual-time-budget=8000', `--screenshot=${png}`, `--window-size=${IL_SHEET.W},${2 * H}`, `http://127.0.0.1:${server.address().port}/sheet.html`], { stdio: 'ignore' });
      const timer = setTimeout(() => cp.kill('SIGKILL'), 120000);
      cp.on('error', reject);
      cp.on('exit', (code) => { clearTimeout(timer); code === 0 && fs.existsSync(png) ? resolve() : reject(new Error(`Chrome 截圖失敗（結束碼 ${code}）`)); });
    });
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '3', out], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg 轉 jpg 失敗：${r.stderr.trim()}`);
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { warns, sheet: { file: out, width: IL_SHEET.W, height: 2 * H, gallery: nGallery, local: files.length } };
}

// media.mjs illus-lint：每個 illus-local/*.svg 跑 lintIllusSvg（尺寸、狀態照插圖清單）；插圖清單的新建 SVG 沒有檔 ✖；順便拼 work/插圖清單.jpg
export async function illusLint(P, { sheet = true, log = console.log } = {}) {
  const work = path.join(P.project, 'work'), dir = path.join(work, 'hyperframes', 'illus-local'), sb = path.join(work, 'storyboard.md');
  const list = readIllusList(fs.existsSync(sb) ? fs.readFileSync(sb, 'utf8') : '');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.svg$/i.test(f) && !f.startsWith('.')).sort() : [];
  const findings = [];
  const add = (level, where, msg, fix) => findings.push({ level, where, msg, fix });
  for (const f of files) {
    const name = f.replace(/\.svg$/i, ''), spec = list.local.get(name);
    if (!spec?.size) add('warn', `illus-local/${f}`, `${name}：work/storyboard.md 的插圖清單${spec ? '這一列沒寫建議尺寸' : '沒有這個元件的「新建 SVG」列'}，這次只查不用尺寸${spec ? '' : '、狀態'}的規則`, `插圖清單那一列的「怎麼來」寫「規格：${name}，建議尺寸 W×H，狀態 a／b」（shared/template/kit/illus-style.md）`);
    for (const x of lintIllusSvg(fs.readFileSync(path.join(dir, f), 'utf8'), { name, size: spec?.size || undefined, states: spec?.states || [] })) add(x.level, `illus-local/${f}`, x.msg, x.fix);
  }
  for (const name of list.local.keys()) {
    if (!files.includes(`${name}.svg`)) add('error', '插圖清單', `新建 SVG「${name}」還沒有檔`, `照 shared/template/kit/illus-style.md 畫好，存成 work/hyperframes/illus-local/${name}.svg，再跑一次 illus-lint`);
  }
  const s = sheet ? await illusSheet(P, { list, files, dir }) : { warns: [], sheet: null };
  for (const [where, msg, fix] of s.warns) add('warn', where, msg, fix);
  log(files.length ? `illus-local：${files.length} 個 SVG（${rel(dir)}）` : 'illus-local：無');
  findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  for (const x of findings) log(`${x.level === 'error' ? '✖' : '⚠'} [${x.where}] ${x.msg} → ${x.fix}`);
  for (const f of files) if (!findings.some((x) => x.where === `illus-local/${f}`)) log(`✓ illus-local/${f}`);
  if (s.sheet) log(`插圖清單.jpg：${rel(s.sheet.file)}（${s.sheet.width}×${s.sheet.height}；畫廊 ${s.sheet.gallery} 個、新建 ${s.sheet.local} 個；上亮下暗）→ 打開看線粗、圓角、用色和畫廊元件是不是同一套`);
  const ne = findings.filter((x) => x.level === 'error').length, nw = findings.length - ne;
  log('');
  log(ne ? `未通過：${ne} 個錯誤（✖），${nw} 個提醒（⚠）。照 → 後面的改法改 SVG 或插圖清單，再跑一次 illus-lint。` : `通過：${files.length ? `${files.length} 個 SVG` : '沒有要查的 SVG'}，${nw} 個提醒（⚠）。`);
  return { ok: !ne, findings, files, sheet: s.sheet };
}

// ---------- CLI ----------

async function cli() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || !flags.cmd || flags.cmd === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  if (!['scan', 'frame', 'main', 'snap-srt', 'ng-scan', 'ng-snap', 'cutpoints', 'screen-sync', 'srt-split', 'srt-align', 'verify-rough', 'illus-lint'].includes(flags.cmd)) throw new Error(`沒有「${flags.cmd}」這個指令：只有 scan、frame、main、snap-srt、ng-scan、ng-snap、cutpoints、screen-sync、srt-align、srt-split、verify-rough、illus-lint（用 --help 看用法）`);
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
  if (flags.cmd === 'ng-scan') { ngScan(P); return 0; }
  if (flags.cmd === 'ng-snap') { ngSnap(P, { edit: flags.edit ?? CUT.edit, margin: flags.margin ?? CUT.margin, src: flags.src ?? null, v1: flags.v1 ?? null }); return 0; }
  if (flags.cmd === 'cutpoints') { cutpoints(P, { dryRun: !!flags['dry-run'] }); return 0; }
  if (flags.cmd === 'screen-sync') { screenSync(P, { writePlan: !!flags['write-plan'], dryRun: !!flags['dry-run'] }); return 0; }
  if (flags.cmd === 'verify-rough') return verifyRough(P).ok ? 0 : 1;
  if (flags.cmd === 'illus-lint') return (await illusLint(P, { sheet: !flags['no-sheet'] })).ok ? 0 : 1;
  // 每則字數上限照版式（009 FR-031：橫式 18、直式 12＝lib/canvas.mjs 的 caption.maxChars）；明寫 --max 時以參數為準
  const capMax = () => {
    if (flags.max != null) return flags.max;
    let plan = null;
    try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch { plan = null; }
    const f = resolveFormat({ projectDir: P.project, plan });
    const n = canvasOf(f.format).caption.maxChars;
    if (f.format === 'portrait') console.log(`版式：直式 → 每則最多 ${n} 字（來源：${f.detail}）`);
    return n;
  };
  if (flags.cmd === 'srt-align') { srtAlign(P, { dryRun: !!flags['dry-run'], remapPlan: !!flags['remap-plan'], max: capMax() }); return 0; }
  if (flags.cmd === 'srt-split') { srtSplit(P, { max: capMax(), dryRun: !!flags['dry-run'] }); return 0; }
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
  for (const c of r.clips) console.log(`  ${fmtT(c.start)}–${fmtT(c.end)}  ${c.kind === 'voice' ? '聲音' : c.kind === 'screen' ? '螢幕錄影（邊錄邊講）' : '真人'}  ${c.file}`);
  return 0;
}

const isMain = () => {
  try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (isMain()) cli().then((code) => { process.exitCode = code; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });

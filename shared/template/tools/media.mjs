#!/usr/bin/env node
/**
 * 素材工具：看螢幕錄影與圖片、讀座標、接主軌（零依賴，只用 Node 22 與 ffmpeg／ffprobe）
 *
 * 剪乾淨兩條指令（到停點 ① 一條、① 通過後一條；都在背景跑，前景最多等 9 分鐘，還沒好就印「再跑一次」）：
 *   node shared/template/tools/media.mjs prep --project projects/<專案> [--order a,b,…] [--format portrait|landscape] [--again] [--skip-stop] [--no-editor] [--wait <秒>] [--transcript <JSON>]
 *       一條指令到停點 ①：開工決策表 → main → 轉逐字稿＋掃素材（同時跑）→ ng-scan → 工具自己寫 work/cuts.md → ng-snap 預跑（⚠ 寫進「需要你決定」）→ 開剪輯台 → 停點紀錄 → 印停點那一行。
 *       轉逐字稿：停頓先剪掉再轉（whisper 碰到長停頓會把後面那句的時間攤進停頓），詞的時間換回 main.mp4，寫 work/transcript-main.json 與 work/transcript.json。
 *       每步印一行，細節在 work/.jobs/prep-detail.log。再跑一次：沒做完就接著做；cuts.md 還是最新的就不重寫（使用者勾的不會不見），只重開網址。
 *       --order：改主軌順序（重接、重轉、重寫 cuts.md，舊的備份 cuts.md.bak-<時間戳>）；--format：使用者說了「直式」「橫式」才加（開工決策表的版式）；--again：已經有 rough.mp4 時重來（rough.mp4 改名留著）；--skip-stop：使用者說「不用停」（待確認的列不剪、紀錄「略過」）；
 *       --transcript：用現成的詞級逐字稿 [{ text, start, end }]（main.mp4 的秒數），不跑 whisper。結束碼 0 做完、1 失敗、75 還在跑。
 *   node shared/template/tools/media.mjs rough --project projects/<專案> [--edit "audio:-20dB"] [--margin 0.15sec] [--said "<使用者原話>"] [--again] [--remap-plan] [--retranscribe] [--no-editor] [--wait <秒>] [--transcript <JSON>]
 *       ① 通過後一條指令到字幕與剪接點：讀 cuts.md → ng-snap → auto-editor（輸出 rough.mp4 與 --export v1 同時跑）→ verify-rough → 逐字稿 → srt-align → cutpoints → 有邊錄邊講的錄影就 screen-sync。遇第一個 ✖ 就停、印修法；剪掉比例過高會 ⚠。
 *       有講稿：work/transcript-main.json 照 cuts.v1.json 換算成 rough.mp4 時間軸（lib/transcript-map.mjs），不重轉（準確度和重轉一樣）；--retranscribe 才對 rough.mp4 再轉一次；逐字稿是直接轉整支 main.mp4（media.mjs transcribe）時也重轉。沒有講稿：對 rough.mp4 轉。
 *       --said：停點紀錄「通過」那一列的使用者原話；--again：初剪做完之後要重剪（字幕會重排）；參數和清單都沒變就不重新輸出影片。--transcript：用現成的詞級逐字稿（rough.mp4 的秒數）。
 *   node shared/template/tools/media.mjs transcribe --project projects/<專案> [--file <mp4>] [--wait <秒>]
 *       包住 hyperframes transcribe（工作區釘的版本；固定 --model small --language zh --json、寫 work/transcript.json；Mac 預設帶 GGML_METAL_BF16_DISABLE=1）。--file 不寫＝work/main.mp4（同時存一份 work/transcript-main.json）；
 *       --file 是 rough.mp4 時也寫 work/rough.srt（舊檔先備份 rough.srt.transcribe-<時間戳>）。只印一行結果。
 *
 *   node shared/template/tools/media.mjs scan --project projects/<專案>
 *       列出 assets/screen/、assets/images/ 每個檔（長度、解析度、fps、有沒有聲音）；
 *       影片比相鄰畫面找事件（切頁、開視窗、區塊變化）、等待、捲動，寫 work/media/<檔名>/events.md（給 AI 抄 in、retime 的 src、框）與 events.json；
 *       在事件之後＋固定間隔取格，拼成帶時間的 contact sheet：work/media/<檔名>/sheet-01.jpg …
 *       圖片每 12 張拼一頁 work/media/images/sheet-01.jpg …，每格標檔名（中文字要 HyperFrames 的 Chrome；沒有時每格只標 #格號，index.md 有對照）。
 *       寫 work/media/index.md（總表：每支錄影、每頁圖片一列）與 index.json；圖片多的時候每張的解析度在 work/media/images/index.md；同時跑多支，只印統計一行。
 *   node shared/template/tools/media.mjs frame --project projects/<專案> --src assets/screen/<檔名> --at 12.5[,30,47.2] [--grid] [--box "x,y,w,h"]
 *       截原尺寸畫面到 work/media/frames/（--at 可以一次給多個時間，同時截，每張印一行）；--grid 疊每 100px 一條、標數字的座標格線（plan.json 的 box／moves／lens 用這個座標）
 *   node shared/template/tools/media.mjs main --project projects/<專案> [--order 檔名1,檔名2,…]
 *       把 assets/camera/、assets/voice/，以及 assets/screen/ 裡邊錄邊講的螢幕錄影（有聲音的比例 20–95%：講話會停頓，背景音樂不會）照檔名排序
 *       （或 --order 的順序；--order 可以寫檔名或 assets/… 路徑，也能放進沒偵測到講解、但有音軌的螢幕錄影）接成 work/main.mp4：
 *       檔名後面加 @起-迄（秒，迄可省略＝到檔尾）只取那一段，同一支可以出現好幾次——補錄插進旁白中間：
 *       --order "a.mp4,旁白.mp3@0-577.7,補錄.aac@2.1-32.4,旁白.mp3@603.4-,b.mp4"
 *       聲音檔與螢幕錄影都只取聲音、配純黑畫面（螢幕錄影的畫面之後由 screen-sync 自動蓋回）；
 *       解析度／fps 跟第一支真人錄影（沒有就 1920×1080 30fps）；聲音統一 48k AAC。
 *       同時寫 work/main.json：{ "clips": [{ "file", "kind": "camera"|"voice"|"screen", "start", "end"[, "src": [起, 迄]] }][, "order": "--order 的原文"] }（src＝有寫 @起-迄 時取的是素材哪一段）
 *       只有一支真人錄影時也轉一次（固定 fps、yuv420p）：auto-editor 直接剪手機原檔（VFR、yuvj420p），--cut-out 之後的畫面可能全黑。
 *       fps：原片在 29–31 之間、VFR 或沒有 fps 時用 30，其他照原片（例 25、60）。
 *
 *   node shared/template/tools/media.mjs ng-scan --project projects/<專案>
 *       找 NG（剪乾淨第 3–4 步）：讀 work/transcript.json（main.mp4 的詞級逐字稿），用講稿裡只出現一次的四字組當錨點對位置；
 *       講到講稿後面又跳回前面（接著往下講 ≥ 6 字）＝重講 → 前一次列成 NG 候選（留最後一次）；講稿找不到的話列「講稿外」；
 *       沒講稿時比相鄰句（停頓切句）。印 cuts.md 的 NG 表（「剪」欄都是 [x]）與章節空檔表（照抄），講稿每一行的開口時間寫 work/ng-scan.md。
 *   node shared/template/tools/media.mjs snap-srt --project projects/<專案> [--dry-run] [--below <dB>]
 *       把 work/rough.srt 每則字幕的起點對齊到實際開口的時間（逐字稿的時間碼只有整句，常比嘴巴早 1 秒左右）：
 *       用 ffmpeg 把 work/rough.mp4 的聲音解出來算能量包絡，門檻取這支音軌自己的「說話音量」與「底噪」之間（相對值，不寫死 dB；
 *       --below <dB> 可手動改成「說話音量減 dB」），找出說話區間；每則起點對齊到附近最接近的開口點（字幕比開口早 1.5 秒到晚 0.6 秒的範圍內，差超過 0.25 秒才動）；
 *       結尾拖進靜音超過 0.4 秒就收到說話結束＋0.15 秒。字幕不重疊、每則至少 0.6 秒、順序不變。
 *       寫回前先把原檔備份成 work/rough.srt.bak-<時間戳>（不刪任何檔）；--dry-run 只印調整表、不寫。
 *       只在「剪乾淨」做完字幕校正後跑一次；之後在剪輯台改的時間不要再跑它（會蓋掉）。build 不會自動執行它。
 *   node shared/template/tools/media.mjs ng-snap --project projects/<專案> [--edit "audio:-20dB"] [--margin 0.15sec] [--src <原片>] [--v1 <檔>]
 *       讀 work/cuts.md 的 NG 表（表頭有「時間碼」「原因」）與章節空檔表（表頭有「章節」「第一句」），
 *       用 auto-editor 判斷原片的停頓（結果快取在 work/.cache/），把每段 NG 的起訖對齊到前後的停頓（±1 秒內），
 *       每章第一句前保留 3 秒停頓（--add-in），印出三行可以直接複製的 auto-editor 指令：--preview、輸出 work/rough.mp4、--export v1 -o work/cuts.v1.json。
 *       邊錄邊講的螢幕錄影（main.json kind "screen"）只剪 NG、停頓保留（停頓時畫面常在操作；整段 --add-in，扣掉 NG）。
 *       主軌有兩支以上、有 講稿.md、還沒初剪時，用 work/transcript.json 比對每支講的是講稿第幾行，順序和講稿不同就 ⚠ 並印建議的 --order。
 *       NG 表有「剪」欄時只剪勾了 [x] 的列（剪輯清單頁 editor.mjs /cuts 寫的）；沒有「剪」欄（舊格式）時「待確認」欄有寫字的列不剪。原始停頓不到 3 秒的章節會 ⚠。除了下面說的自動轉 main.mp4，不寫 work/.cache/ 以外的檔。
 *       --src 不寫：用 work/main.mp4；還沒有、且只有一支真人錄影時，先自動跑 main 轉出 work/main.mp4（會寫 work/main.mp4、work/main.json）；
 *       --v1：用現成的 auto-editor --export v1 結果（不跑 auto-editor）。
 *       章節開口：先找包含表上時間的停頓；沒有就往後 6 秒內找第一個停頓的終點（再沒有才看表上時間前 0.6 秒內）。
 *   node shared/template/tools/media.mjs verify-rough --project projects/<專案>
 *       檢查初剪有沒有壞：blackdetect work/rough.mp4，每段黑畫面用 work/cuts.v1.json 換回原片同一秒、量原片亮度；
 *       原片不黑 → ✖ 並印重做的指令（結束碼 1）；原片也黑（或專案有只有聲音的素材）→ ✓ 列出區間。不寫檔。
 *   node shared/template/tools/media.mjs cutpoints --project projects/<專案> [--dry-run]
 *       讀 work/cuts.v1.json（auto-editor --export v1）與 work/rough.mp4 的 fps，算出每個剪接點在 rough.mp4 的秒數，
 *       和 work/cuts.md 要剪的 NG 重疊的標 ng、其他標 pause，寫 work/cutpoints.json（舊檔內容不同時先備份成 .bak-<時間戳>）。
 *   node shared/template/tools/media.mjs screen-sync --project projects/<專案> [--write-plan] [--dry-run]
 *       邊錄邊講的螢幕錄影：讀 work/main.json（kind "screen"）與 work/cuts.v1.json，算出初剪後每段保留下來的片段
 *       在 rough.mp4 的起訖與錄影本身的秒數（in），寫 work/screen-sync.json（media 段 sync01、sync02…：畫面蓋回主軌、和聲音同步）。
 *       --write-plan：再寫進 work/hyperframes/plan.json（先換掉舊的 sync 段，plan.json 先備份 .sync-<時間戳>）；初剪重做過就再跑一次。
 *       --dry-run：只印表、不寫。秒數都由工具算，不要手改 sync 段的 from／to／in（剪輯台拖邊緣會自動保持同步）。
 *   node shared/template/tools/media.mjs srt-align --project projects/<專案> [--dry-run] [--remap-plan] [--max 18] [--verbose]
 *       預設只印有標記的列（併、拆、內插；最多 30 列，⚠ 優先）和統計；--verbose 才印每一則。
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
 *       work/hyperframes/plan.json 已經用到句號（#N）時拒絕（改到剪輯台分割，剪輯台會一起重對 #N）。
 *   node shared/template/tools/media.mjs illus-lint --project projects/<專案> [--no-sheet]
 *       檢查專案自己畫的示意插圖元件 work/hyperframes/illus-local/*.svg（規則見 shared/template/kit/illus-style.md）：
 *       建議尺寸與狀態從 work/storyboard.md 和 work/designs/*.md 的插圖清單讀（「新建 SVG」列寫「規格：<name>，建議尺寸 W×H，狀態 a／b」）；
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pathsFrom, projectLabel } from './build.mjs';
import { parseSrt, formatSrt } from './lib/srt.mjs';
import { visibleLen } from './lib/scenes.mjs';
import { textWidth as tw, normText, plainText } from './lib/time.mjs';
import { mapPlanTimes, refTime, fmtRef, parseRef } from './editor/subtitles.mjs';
import { run, probeMedia, writeJpg, blackDetect, transcriptFresh, noteTranscript, tmpFor, sweepTmp, decodeIssues, sdrChain, VIDEO_EXT, IMAGE_EXT, AUDIO_EXT } from './lib/ff.mjs';
import { canvas, fillRect, blit, text, textWidth } from './lib/raster.mjs';
import { spawnP, limiter } from './lib/proc.mjs';
import { readScript } from './lib/script-file.mjs';
import { writeAtomic } from './lib/atomic.mjs';
import { screenEvents, eventsMd, waitsInMain } from './lib/events.mjs';
import { lintIllusSvg } from './lib/illus-lint.mjs';
import { KIT_LINKS } from './lib/main.mjs';
import { SPEECH, ENV, envelope, pickThreshold, speechFromEnvelope } from './lib/speech.mjs';
export { ENV, envelope, pickThreshold, speechFromEnvelope };
import { resolveFormat, canvasOf } from './lib/canvas.mjs';

const VALUE_FLAGS = ['project', 'template', 'src', 'at', 'box', 'order', 'below', 'edit', 'margin', 'v1', 'max', 'file', 'wait', 'said', 'transcript', 'format'];
const BOOL_FLAGS = ['all', 'grid', 'help', 'dry-run', 'remap-plan', 'no-sheet', 'write-plan', 'again', 'skip-stop', 'no-editor', 'retranscribe', 'verbose'];
const r3 = (n) => +Number(n).toFixed(3);
const rel = (p) => path.relative(process.cwd(), p) || '.';
const posix = (p) => p.split(path.sep).join('/');
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const natural = (a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true, sensitivity: 'base' });

// --help：檔頭整段 8 千字，模型通常只要一條指令。預設印指令清單；media.mjs <指令> --help 印那一條；--help --all 印全部
export function helpText(raw, { cmd = null, all = false } = {}) {
  if (all) return raw;
  const lines = raw.split('\n');
  const isCmd = (l) => /^\s*node\s+\S*media\.mjs\b/.test(l);
  const nameOf = (l) => (l.match(/media\.mjs\s+([a-z][\w-]*)/) || [])[1] || '';
  if (cmd) {
    const out = [];
    let on = false;
    for (const l of lines) {
      if (isCmd(l)) on = nameOf(l) === cmd;
      else if (on && !/^\s/.test(l)) on = false;
      if (on) out.push(l);
    }
    if (out.length) return out.join('\n');
  }
  return [lines[0], '', ...lines.filter(isCmd).map((l) => l.trim().replace(/\s+\S*$/, (m) => (l.length > 170 ? ' …' : m))), '', '看一條指令的完整說明：node shared/template/tools/media.mjs <指令> --help；全部：--help --all'].join('\n');
}

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
    } else if (BOOL_FLAGS.includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數（用 --help 看用法）`);
  }
  return flags;
}

const listFiles = (dir, exts) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.') && exts.includes(path.extname(f).toLowerCase())).sort(natural) : []);

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

async function makeSheets(file, info, cells, outDir, lim) {
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

async function labelImageSheet({ chrome, file, cells, W, H, templateDir, tmp, page }) {
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
async function chromeOrNull() {
  try { return (await import('./lib/audit-browser.mjs')).findChrome(); } catch { return null; }
}

// 背景跑 blackDetect（ff.mjs，同步、要解整支影片）：放到子行程跑完再讀快取，不擋住其他同時在跑的工作
export async function blackDetectBg(file, cacheFile) {
  const ff = new URL('./lib/ff.mjs', import.meta.url).href;
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
    const abs = path.join(proj, 'assets', 'screen', f);
    let n;
    try { n = narrationOf(abs); } catch { n = { narrated: false, ratio: 0, hasAudio: false }; }   // 壞檔不擋主軌：素材掃描會列出來
    return { name: f, file: `assets/screen/${f}`, kind: 'screen', narrated: n.narrated, ratio: n.ratio, hasAudio: n.hasAudio };
  }).filter((x) => x.hasAudio);
  return { cams, voices, screens };
}

// 這支 main.mp4 是照什麼順序接的（work/main.json 的 order，有寫 --order 才有；prep 用來判斷要不要重接）
export function readMainOrder(proj) {
  try { return JSON.parse(fs.readFileSync(path.join(proj, 'work', 'main.json'), 'utf8')).order ?? null; } catch { return null; }
}

// 現成的 main.mp4 還能用嗎：順序沒變、素材沒比它新、沒有新的真人錄影／聲音檔、main.json 和影片長度對得起來
export function mainIsCurrent(P, order = null) {
  const proj = P.project, file = path.join(proj, 'work', 'main.mp4');
  let clips, st;
  try { clips = JSON.parse(fs.readFileSync(path.join(proj, 'work', 'main.json'), 'utf8')).clips; st = fs.statSync(file); } catch { return false; }
  if (!Array.isArray(clips) || !clips.length) return false;
  const was = readMainOrder(proj);
  if (order != null && String(order) !== was) return false;
  for (const c of clips) {
    try { if (fs.statSync(path.join(proj, ...c.file.split('/'))).mtimeMs > st.mtimeMs) return false; } catch { return false; }
  }
  if (was == null) {
    const now = [...listFiles(path.join(proj, 'assets', 'camera'), VIDEO_EXT).map((f) => `assets/camera/${f}`), ...listFiles(path.join(proj, 'assets', 'voice'), [...AUDIO_EXT, ...VIDEO_EXT]).map((f) => `assets/voice/${f}`)];
    if (now.some((f) => !clips.some((c) => c.file === f))) return false;
  }
  try {
    const m = probeMedia(file);
    if (Math.abs(m.duration - clips[clips.length - 1].end) >= 1 || m.hdr) return false;   // m.hdr：舊版接出來還標 HDR 的主軌，重接才會轉 SDR
  } catch { return false; }
  // 主軌方向和第一支真人錄影不一樣：舊版沒算旋轉標記接出來的（直拍變橫的＋黑邊），重接
  const cam = clips.find((c) => c.kind === 'camera');
  if (cam) {
    try {
      const a = probeMedia(path.join(proj, ...cam.file.split('/'))), b = probeMedia(file);
      if ((a.width < a.height) !== (b.width < b.height)) return false;
    } catch { return false; }
  }
  // 檔案壞了（以前中途被砍又重跑留下的）重接才救得回來：聲音解一次，31 分鐘也只要幾秒
  return !decodeIssues(run('ffmpeg', ['-hide_banner', '-nostats', '-v', 'error', '-i', file, '-vn', '-sn', '-dn', '-f', 'null', '-']).stderr).count;
}

// 螢幕錄影的判斷（照抄進 cuts.md 的主軌順序）
export function screenJudge(x) {
  return x.narrated
    ? `${x.file}：偵測到講解（有聲音 ${Math.round(x.ratio * 100)}%）→ 接進主軌，畫面之後由 screen-sync 蓋回`
    : `${x.file}：${x.ratio > NARR.max ? `聲音幾乎沒停（${Math.round(x.ratio * 100)}%，像背景音樂或系統聲音）` : `聲音只有 ${Math.round(x.ratio * 100)}%`}，當插入素材（要接進主軌就寫進 --order）`;
}

// 多條音軌（兩支麥、螢幕錄影＋麥克風）：第一條有聲音就用第一條；第一條是靜音就用最響的那條
export const SILENT_PEAK = -60;
export function pickAudioTrack(file, count) {
  if (!(count > 1)) return { track: 0, peaks: [] };
  const peaks = [];
  for (let k = 0; k < count; k++) {
    const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', `0:a:${k}`, '-af', 'volumedetect', '-f', 'null', '-']);
    const p = Number((String(r.stderr).match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1]);
    peaks.push(Number.isFinite(p) ? p : -Infinity);
  }
  if (peaks[0] > SILENT_PEAK) return { track: 0, peaks };
  const best = peaks.indexOf(Math.max(...peaks));
  return { track: peaks[best] > SILENT_PEAK ? best : 0, peaks };
}

// 來源檔完整嗎：傳輸中斷的檔標示的長度還在、資料只到一半，ffmpeg 結束碼還是 0。只解封裝不解碼；給了長度就先看最後 2 秒（4K 大檔放外接硬碟也不用整支讀一次），壞了才整支掃出資料到幾秒
const PARTIAL = /partial file|corrupt input packet|Packet corrupt/;
export function sourceEnd(file, duration = null) {
  const scan = (before = []) => String(run('ffmpeg', ['-hide_banner', '-nostdin', '-stats', ...before, '-i', file, '-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-f', 'null', '-']).stderr);
  if (duration > 4) {   // 資料沒到尾巴時，跳過去會什麼都讀不到（不一定印 partial file）
    const tail = scan(['-ss', String(r3(duration - 2))]);
    if (!PARTIAL.test(tail) && !/Output file is empty|time=N\/A\s+bitrate=N\/A speed=N\/A/.test(tail)) return { partial: false, end: null };
  }
  const err = scan();
  const m = [...err.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  return { partial: PARTIAL.test(err), end: m ? r3(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) : null };
}

export function joinMain(P, { order = null, log = console.log } = {}) {
  const proj = P.project;
  const { cams, voices, screens } = mainCandidates(proj);
  for (const x of screens) log(screenJudge(x));
  const all = [...cams, ...voices, ...screens];
  let list = [...cams, ...voices, ...screens.filter((x) => x.narrated)].sort((a, b) => natural(a.name, b.name));
  if (!list.length) {
    const other = ['camera', 'voice'].flatMap((d) => { try { return fs.readdirSync(path.join(proj, 'assets', d)).filter((n) => !n.startsWith('.')).map((n) => `assets/${d}/${n}`); } catch { return []; } });
    if (other.length) throw new Error(`${other.join('、')} 的格式不支援（影片收 ${VIDEO_EXT.join(' ')}，聲音收 ${AUDIO_EXT.join(' ')}）→ 轉成 mp4 或 m4a 放回去再跑`);
    throw new Error('assets/camera/ 和 assets/voice/ 都是空的，assets/screen/ 也沒有邊錄邊講的錄影：先把講解影片或旁白放進去');
  }
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
  } else {
    // 沒有真人（手機邊錄邊講、純旁白）：黑底照版式，不然直式專案會被「主軌是橫的」擋下
    let plan = null;
    try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch { plan = null; }
    if (resolveFormat({ projectDir: P.project, plan }).format === 'portrait') { W = 1080; H = 1920; }
  }
  // 一次接完（concat filter）：每一段的畫面與聲音都裁／補到同一個長度，接縫不會越接越偏
  const inputs = [], chains = [], labels = [], clips = [], warnings = [], noAudio = [];
  let anyHdr = false;
  let t = 0;
  list.forEach((x, i) => {
    const abs = path.join(proj, ...x.file.split('/'));
    const info = probeMedia(abs);
    if (x.kind !== 'camera' && !info.hasAudio) throw new Error(`${x.file} 沒有聲音軌`);
    if (x.kind === 'camera' && !info.hasAudio) noAudio.push(x.file);
    const whole = sourceEnd(abs, info.duration);
    if (whole.partial) warnings.push(`${x.file} 不完整：標示 ${r3(info.duration)} 秒，實際資料只到 ${whole.end ?? '?'} 秒（多半是複製或傳輸中斷）→ 從手機或相機重新複製一次再跑 prep --again；確定只要這一段就不用管`);
    const pick = info.hasAudio ? pickAudioTrack(abs, info.audioCount) : { track: 0, peaks: [] };
    if (pick.track) warnings.push(`${x.file} 有 ${info.audioCount} 條音軌，第 1 條是靜音，用第 ${pick.track + 1} 條（最大音量 ${pick.peaks[pick.track]} dB）→ 聲音不對就說`);
    else if (pick.peaks.length) log(`${x.file} 有 ${info.audioCount} 條音軌，用第 1 條（各條最大音量 ${pick.peaks.join('、')} dB）`);
    let src = null;
    if (x.range) {
      const a = x.range[0], b = Math.min(x.range[1] ?? info.duration, info.duration);
      if (a >= info.duration || b - a < 0.1) throw new Error(`--order 的 ${x.file}@${a}-${x.range[1] ?? ''}：素材只有 ${r3(info.duration)}s，這一段是空的`);
      src = [r3(a), r3(b)];
    }
    const D = r3(Math.round((src ? src[1] - src[0] : info.duration) * F) / F);
    if (src) inputs.push('-ss', String(src[0]), '-t', String(r3(src[1] - src[0])));
    inputs.push('-i', abs);
    // iPhone 預設錄 HDR（HLG）：先轉成 SDR BT.709，之後每一步都當一般影片（不然成品會變 HEVC HDR、render 慢好幾倍）
    const hdr = x.kind === 'camera' ? info.hdr : null;
    if (hdr) { anyHdr = true; log(`${x.file} 是 HDR（${hdr === 'hlg' ? 'HLG' : 'PQ'}）：轉成 SDR`); }
    if (x.kind === 'camera') chains.push(`[${i}:v:0]${hdr ? `${sdrChain(hdr)},` : ''}scale=${W}:${H}:force_original_aspect_ratio=decrease:out_range=tv,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${F}:start_time=0,format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=duration=${D},setpts=PTS-STARTPTS[v${i}]`);
    // 聲音檔、邊錄邊講的螢幕錄影配純黑畫面（build 靠 blackdetect 認出「只有聲音」的區間，一定要是合成的純黑；螢幕錄影的畫面由 screen-sync 蓋回）
    else chains.push(`color=c=black:s=${W}x${H}:r=${F}:d=${D},format=yuv420p,setpts=PTS-STARTPTS[v${i}]`);
    // first_pts＝0、fps 的 start_time＝0：音軌或畫面晚開始（素材的起點偏移）就補靜音、補第一格，不然音畫會差那麼多
    if (info.hasAudio) chains.push(`[${i}:a:${pick.track}]aresample=48000:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${D},asetpts=PTS-STARTPTS[a${i}]`);
    else chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${D},asetpts=PTS-STARTPTS[a${i}]`);
    labels.push(`[v${i}][a${i}]`);
    clips.push({ file: x.file, kind: x.kind, start: r3(t), end: r3(t + D), ...(src ? { src } : {}), ...(pick.track ? { audioTrack: pick.track } : {}) });
    t += D;
    log(`接主軌 ${i + 1}/${list.length}：${x.file}${src ? `@${src[0]}–${src[1]}s` : ''}${x.kind === 'voice' ? '（聲音，配純黑畫面）' : x.kind === 'screen' ? '（邊錄邊講的螢幕錄影：取聲音、配純黑畫面）' : ''}（${D}s）`);
  });
  if (noAudio.length === list.length) throw new Error(`${noAudio.join('、')} 沒有聲音軌 → 這個流程靠講話的聲音剪：確認錄影時有收音；聲音是另外錄的，就把聲音檔放 assets/voice/`);
  for (const f of noAudio) warnings.push(`${f} 沒有聲音軌，這段主軌是靜音的，逐字稿和字幕不會有內容`);
  const graph = `${chains.join(';')};${labels.join('')}concat=n=${list.length}:v=1:a=1[v][a]`;
  const mainFile = path.join(proj, 'work', 'main.mp4'), tmpFile = tmpFor(mainFile);   // 寫完才換上：中途被砍不會留下半支 main.mp4；檔名帶 pid：舊的 ffmpeg 還在寫也不會寫到同一個檔
  sweepTmp(path.dirname(mainFile));
  fs.mkdirSync(path.dirname(mainFile), { recursive: true });
  log(`轉檔中…（${W}×${H}、${F}fps；1080p 每 10 分鐘約 1–3 分鐘）`);
  const r = run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', String(Math.round(F)), '-pix_fmt', 'yuv420p', '-color_range', 'tv', ...(anyHdr ? ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'] : []), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', tmpFile]);
  if (r.status !== 0) { fs.rmSync(tmpFile, { force: true }); throw new Error(`接主軌失敗：${String(r.stderr).trim().slice(-400)}`); }
  fs.renameSync(tmpFile, mainFile);
  // 中段破損（標示長度對得上但解碼有錯）：結束碼還是 0，只有 stderr 看得到
  const broken = decodeIssues(r.stderr);
  if (broken.count && !warnings.some((w) => w.includes('不完整'))) warnings.push(`素材解碼有錯（${broken.count} 行，例：${broken.sample}）→ 畫面或聲音可能有破損，聽看 work/main.mp4；有問題就重新複製素材`);
  for (const w of warnings) log(`⚠ ${w}`);
  const json = { clips, ...(order != null ? { order: String(order) } : {}), ...(warnings.length ? { warnings } : {}) };
  fs.writeFileSync(path.join(proj, 'work', 'main.json'), JSON.stringify(json, null, 2) + '\n');
  return { file: mainFile, width: W, height: H, fps: F, duration: probeMedia(mainFile).duration, clips, warnings };
}

// ---------- snap-srt ----------

// 對齊參數（理由見 USAGE.md 3.4／AGENTS.md「剪乾淨」第 6 步；調整請連同 timing.test.mjs 一起看）
export const SNAP = {
  minSilence: SPEECH.minSilence,  // 短於這個的空檔算咬字間隙，不當成停頓（lib/speech.mjs，理由寫在那裡）
  minSpeech: SPEECH.minSpeech,    // 短於這個的聲響（喀嗒、呼吸）不算說話
  early: 0.6,        // 開口點最多比字幕起點早這麼多（字幕偏晚的情況少見）
  late: 1.5,         // 開口點最多比字幕起點晚這麼多（症狀是字幕比嘴巴早約 1 秒；實測偏 1.0 秒再加上起點本來就落在句首前 0.2 秒，會到 1.2 秒，1.2 剛好壓線所以放到 1.5）
  tolerance: 0.25,   // 差在這以內不動（講解本來就有 0.1–0.2 秒的前導氣聲，不要為了零頭亂動）
  tailSilence: 0.4,  // 結尾拖進靜音超過這個秒數才收
  tailPad: 0.15,     // 收尾時留在說話結束後面的秒數
  minDur: 0.6,       // 每則至少這麼長
  lead: 0.03,        // 開口點往前留一點（輕子音的能量低於門檻，會晚一點點才算開口）
};

// 能量包絡、門檻、說話區間（envelope、pickThreshold、speechFromEnvelope、ENV）搬到 lib/speech.mjs，build 的 #N@詞 對準開口也用同一套；這裡照舊匯出

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
  if (!fs.existsSync(srtFile)) throw new Error(`找不到 ${rel(srtFile)} → 先跑 node shared/template/tools/media.mjs rough --project <專案> 產生 rough.srt`);
  if (!fs.existsSync(mp4)) throw new Error(`找不到 ${rel(mp4)} → 先剪出 work/rough.mp4（字幕的時間是對它的）`);
  if (below != null && !(Number(below) >= 5 && Number(below) <= 60)) throw new Error(`--below 要是 5–60 之間的 dB 數字（門檻＝說話音量減這個數字；不寫＝自動），現在是「${below}」`);
  const text = fs.readFileSync(srtFile, 'utf8');
  const cues = parseSrt(text);
  if (!cues.length) throw new Error(`${rel(srtFile)} 讀不到任何字幕 → 跑 media.mjs rough --again 重新產生 rough.srt（格式：序號、00:00:01,000 --> 00:00:02,500、文字，中間空一行）`);
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
  writeAtomic(srtFile, rewriteSrtTimes(text, res.rows));
  log(`已寫回 ${rel(srtFile)}；原檔備份在 ${rel(backup)}（要還原就把它複製回 rough.srt）`);
  log('→ 重跑 build 前先到剪輯台看一眼；之後不要再跑 snap-srt（會蓋掉你在剪輯台改的時間）。');
  return { ...res, backup, written: true, threshold: th.threshold, speech };
}

// ---------- 剪乾淨：work/cuts.md（停點 ① 的 NG 表與章節空檔表；specs/contracts/stop-points.md §1）----------
export const CUT = {
  ngWin: 1.0,        // NG 起訖往前後找停頓的範圍（逐字稿常比嘴巴早 1 秒左右，AGENTS.md 剪乾淨第 6 步）
  chKeep: 3.0,       // 章節第一句前保留的停頓（G01）
  early: 0.6, late: 1.5,   // 章節第一句的開口點：表上時間 −0.6 到 +1.5 秒內算「對得上」，不另外說明
  ahead: 6.0,        // 表上時間不在停頓裡時，往後找第一個停頓終點的範圍（逐字稿常把那一句的起點標在停頓裡、比開口早好幾秒）
  longPause: 1.5,    // 表上時間前 early 秒內結束、這麼長的停頓＝就是這一章前面的停頓
  minKeep: 0.5,      // 保留區被 NG 吃到剩不到 0.5 秒就不保留
  ngKind: 0.3,       // cutpoints：剪掉的段和 NG 重疊 ≥ min(0.3 秒, NG 長度一半) 才算 ng
  edit: 'audio:-20dB', margin: '0.15sec',   // 剪乾淨的預設參數（G16：作者的停頓保留 0.3 秒）
};
// 小聲的錄音（旁白、領夾麥常見）：預設 -20dB 會把整支當成靜音（auto-editor：Timeline is empty）。
// 最大音量不到 -14 dB 時門檻跟著降，和正常錄音同樣的比例；31 分鐘的檔量一次約 3 秒
export function editForLevel(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const peak = Number((String(r.stderr).match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1]);
  if (!Number.isFinite(peak) || peak > -14) return { edit: CUT.edit, note: null };
  const db = Math.max(-50, Math.round(peak - 14));
  return { edit: `audio:${db}dB`, note: `這支錄音很小聲（最大音量 ${peak} dB），靜音門檻自動用 ${db}dB`, peak, silent: peak <= SILENT_PEAK };
}
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
// NG 表的「剪」欄（剪輯清單頁的勾選）：[x] 剪、[ ] 不剪
const isChecked = (v) => /^(\[\s*[xX✓✔]\s*\]|[xX✓✔✅])$/.test(String(v ?? '').trim());

// 「等待」表的列（邊錄邊講：畫面在等、又沒人講話）：和 NG 列同一種格式，剪輯清單頁不用改就能勾；原因欄以「等待」開頭，勾了留 WAIT_KEEP 秒快轉，其他剪掉
export const WAIT_RE = /^等待/;
export const WAIT_KEEP = 1.5;
// → { ng: [{ row, line, start, end, text, reason, pending, raw, cut, cutCol, wait? }], chapters: [{ row, title, first, t }], hasNg, hasChapters, hasCutCol, ngTables, errors }
// cut：有「剪」欄時看勾選；沒有「剪」欄（舊格式）時＝「待確認」欄沒寫字。ngTables：[{ head, iCut, lines }]（行號從 0 起，setCutChecks 用）
export function parseCutsMd(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const out = { ng: [], chapters: [], hasNg: false, hasChapters: false, hasCutCol: false, ngTables: [], errors: [] };
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence || !isRow(lines[i]) || !isSepRow(lines[i + 1])) continue;
    const at = i;
    const head = cells(lines[i]).map((h) => h.replace(/\s+/g, ''));
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && isRow(lines[j]); j++) rows.push(cells(lines[j]));
    i = j - 1;
    const col = (name) => head.findIndex((h) => h.includes(name));
    const iT = col('時間碼'), iR = col('原因'), iCh = col('章節'), iF = col('第一句');
    if (iT >= 0 && iR >= 0) {
      out.hasNg = true;
      const iC = col('內容'), iP = col('待確認'), iCut = head.indexOf('剪');
      if (iCut >= 0) out.hasCutCol = true;
      out.ngTables.push({ head: at, iCut, lines: rows.map((_, k) => at + 2 + k) });
      rows.forEach((r, k) => {
        const n = out.ng.length + 1, line = at + 2 + k;
        const range = parseRange(r[iT]);
        if (!range || !(range[0] < range[1])) { out.errors.push(`cuts.md NG 第 ${n} 列的時間碼「${r[iT] ?? ''}」看不懂 → 寫成 1:03.00–1:05.80（原片的起–迄）`); out.ng.push({ row: n, line, bad: true }); return; }
        const pending = iP >= 0 && isPending(r[iP]);
        out.ng.push({ row: n, line, start: range[0], end: range[1], text: iC >= 0 ? r[iC] ?? '' : '', reason: r[iR] ?? '', pending, raw: iP >= 0 ? r[iP] ?? '' : '',
          cut: iCut >= 0 ? isChecked(r[iCut]) : !pending, cutCol: iCut >= 0, ...(WAIT_RE.test(r[iR] ?? '') ? { wait: true } : {}) });
      });
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

// 剪輯清單頁勾選後寫回 cuts.md：checks＝{ NG 列號: true／false }，只改那幾列的「剪」欄，其他字不動。
// 沒有「剪」欄（舊格式）就在最前面加一欄，沒指定的列照原本會不會剪填 [x]／[ ]。
export function setCutChecks(text, checks) {
  const src = String(text);
  const bom = src.startsWith('﻿') ? '﻿' : '';
  const eol = /\r\n/.test(src) ? '\r\n' : '\n';
  const lines = src.replace(/^﻿/, '').split(/\r?\n/);
  const cm = parseCutsMd(src);
  const byLine = new Map(cm.ng.map((r) => [r.line, r]));
  const fmt = (cs) => `| ${cs.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`;
  const mark = (on) => (on ? '[x]' : '[ ]');
  const want = (r) => (r && Object.hasOwn(checks, r.row) ? !!checks[r.row] : r ? r.cut : true);
  for (const t of cm.ngTables) {
    if (t.iCut < 0) {
      lines[t.head] = fmt(['剪', ...cells(lines[t.head])]);
      lines[t.head + 1] = fmt(['---', ...cells(lines[t.head + 1])]);
      for (const li of t.lines) lines[li] = fmt([mark(want(byLine.get(li))), ...cells(lines[li])]);
      continue;
    }
    for (const li of t.lines) {
      const r = byLine.get(li);
      if (!r || !Object.hasOwn(checks, r.row)) continue;
      const cs = cells(lines[li]);
      while (cs.length <= t.iCut) cs.push('');
      cs[t.iCut] = mark(checks[r.row]);
      lines[li] = fmt(cs);
    }
  }
  return bom + lines.join(eol);
}

// auto-editor --export v1：{ "version": "1", "source", "chunks": [[起始格, 結束格, 速度]] }（沒有 timebase，fps 由呼叫端給）
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
    if (r.cut != null ? !r.cut : r.pending) return { ...r, skip: true };
    // 等待：本來就沒人講話，不用對齊停頓；留開頭 WAIT_KEEP 秒給 screen-sync 放快轉
    if (r.wait) return { ...r, a: r3(Math.min(r.end, r.start + WAIT_KEEP)), b: r3(r.end), missStart: false, missEnd: false, miss: false, toChapter: false };
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
// 開口＝這個停頓的終點：先找包含表上時間的停頓；再看表上時間前 early 秒內結束的長停頓（≥ longPause 秒，時間碼比開口晚一點點，不要跳到句中的小停頓）；
// 沒有就往後 ahead 秒內第一個停頓終點；再沒有才找表上時間前 early 秒內的
export function chapterKeep(chs, sil, margin, opt = CUT) {
  return chs.map((c) => {
    const s = sil.find(([a, b]) => c.t >= a - 1e-9 && c.t <= b + 1e-9)
      || [...sil].reverse().find(([a, b]) => b >= c.t - opt.early - 1e-9 && b < c.t && b - a >= opt.longPause - 1e-9)
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

export function aeArgs({ src, edit, margin, cutOut = [], addIn = [] }) {
  return [src, '--edit', edit, '--margin', margin, ...cutOut.flatMap(([a, b]) => ['--cut-out', `${secArg(a)},${secArg(b)}`]), ...addIn.flatMap(([a, b]) => ['--add-in', `${secArg(a)},${secArg(b)}`])];
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
  throw new Error(`找不到原片：assets/camera/ 是空的 → 把講解影片放進 ${posixRel(path.join(P.project, 'assets', 'camera'))}/`);
}

// auto-editor 失敗的訊息：「剪完什麼都不剩」不是參數打錯，要叫人看素材和清單
export function aeFailure(r, more = '') {
  const text = String(r.stderr || r.stdout || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
  const last = text.split(/\r?\n/).filter(Boolean).pop() || '（沒有訊息）';
  if (/Timeline is empty/.test(text)) return new Error(`auto-editor 剪完什麼都不剩（${last}）→ 看 work/cuts.md 有沒有勾到整段；沒有的話是素材太小聲或沒有聲音：聽聽 work/main.mp4，很小聲就加 --edit "audio:-30dB" 再跑一次`);
  return new Error(`auto-editor 失敗（結束碼 ${r.status}）：${last} → 用 auto-editor --help 對一下參數名稱（以安裝的版本為準）${more}`);
}

function aeSilenceCache(P, src, edit, margin) {
  const dir = path.join(P.project, 'work', '.cache');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'ng-snap.v1.json'), keyFile = path.join(dir, 'ng-snap.key.json');
  const st = fs.statSync(src);
  const key = JSON.stringify({ src: path.basename(src), size: st.size, mtimeMs: Math.round(st.mtimeMs), edit, margin, v: 1 });
  let hit = false;
  try { hit = fs.existsSync(out) && fs.readFileSync(keyFile, 'utf8').trim() === key; } catch { hit = false; }
  return { out, keyFile, key, hit };
}

// 同一份快取的非同步版：prep 轉逐字稿前先判斷停頓，同時還在掃素材
export async function aeSilenceAsync(P, src, { edit, margin, log = () => {} }) {
  const { out, keyFile, key, hit } = aeSilenceCache(P, src, edit, margin);
  if (hit) return { file: out, cached: true };
  log('用 auto-editor 判斷原片的停頓（第一次會花一點時間，之後用快取）…');
  const args = [src, '--edit', edit, '--margin', margin, '--export', 'v1', '-o', out, '--no-open'];
  let r = await spawnP('auto-editor', args, { tail: 4000 });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') r = await spawnP('auto-editor', args.map((x) => `"${x}"`), { tail: 4000, shell: true });
  if (r.error?.code === 'ENOENT') throw new Error('找不到 auto-editor → 照 setup/ 的手冊安裝；或用 --v1 給現成的 auto-editor --export v1 結果');
  if (r.status !== 0) throw aeFailure(r);
  fs.writeFileSync(keyFile, key + '\n');
  return { file: out, cached: false };
}

function aeSilence(P, src, { edit, margin, log }) {
  const { out, keyFile, key, hit } = aeSilenceCache(P, src, edit, margin);
  if (hit) return { file: out, cached: true };
  log('用 auto-editor 判斷原片的停頓（第一次會花一點時間，之後用快取）…');
  const args = [src, '--edit', edit, '--margin', margin, '--export', 'v1', '-o', out, '--no-open'];
  let r = spawnSync('auto-editor', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // Windows：裝成 auto-editor.cmd 包裝檔時不帶 shell 會 ENOENT，再用 shell 試一次（參數加引號）
  if (r.error && r.error.code === 'ENOENT' && process.platform === 'win32') r = spawnSync('auto-editor', args.map((x) => `"${x}"`), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: true });
  if (r.error && r.error.code === 'ENOENT') throw new Error('找不到 auto-editor → 照 setup/ 的手冊安裝；或用 --v1 給現成的 auto-editor --export v1 結果');
  if (r.status !== 0) throw aeFailure(r);
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

// 照這個順序重來一次的指令（@起-迄 帶回去）
export const orderArg = (rows) => rows.map((r) => (r.src ? `${r.file}@${r.src[0]}-${r.src[1]}` : r.file)).join(',');
export const orderCommand = (P, rows) => `node shared/template/tools/media.mjs prep --project ${posixRel(P.project)} --order "${orderArg(rows)}"`;

// 建議順序：有位置的照位置排；對不到講稿的維持原本的前後、放最後
export function suggestOrder(rows) {
  return [...rows.filter((r) => r.pos != null).sort((a, b) => a.pos - b.pos || a.k - b.k), ...rows.filter((r) => r.pos == null)];
}

// ---------- ng-scan ----------
// 詞級逐字稿（main.mp4 的 work/transcript.json）對講稿：講稿裡只出現一次的四字組當錨點，每個錨點＝那一刻講到講稿的哪個字。
// 講稿位置往回跳（從新位置一路講回前一次講到的地方或重講 ≥ 20 字、前一次在 90 秒內）＝重講：前一次講到這個位置起、到重講開口前，列成 NG 候選（留最後一次）。
// 錨點之間空 ≥ 3 秒又有字的列「講稿外」。沒講稿：相鄰 3 句兩兩相像（兩字組重疊 ≥ 50%）的前一句列 NG 候選。章節（講稿 ##）第一句的開口時間印成章節空檔表。
export const NGSCAN = { gap: 0.3, backChars: 3, tol: 2, minLen: 0.6, maxBack: 90, confirm: 3, step: 15, redo: 20, outsideGap: 3, charSec: 0.22, similar: 0.5, window: 3, stumble: 0.8, repeatMin: 3, repeatMinNoScript: 4, repeatMax: 40,
  offExtra: 6, offRatio: 0.5, offLong: 12 };   // 講稿外：逐字稿比講稿多 ≥ 6 字，而且講稿字數 ≤ 逐字稿一半（或多 ≥ 12 字）才算真的講稿外；字數接近＝whisper 聽錯
const pairsOf = (t) => { const cs = [...normText(t)], out = []; for (let i = 0; i + 1 < cs.length; i++) out.push(cs[i] + cs[i + 1]); return out; };

// 講稿 → { lines（講解行）, chapters: [{ title, line（第幾行，0 起）}] }（## 是章節；### 是段落標題，不算）
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
  for (const w of words) { const cs = [...normText(w.text)], os = [...plainText(w.text)]; cs.forEach((c, k) => T.push({ c, o: os[k], t: r3(w.start + (k / Math.max(1, cs.length)) * (w.end - w.start)) })); }
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
          const text = A.T.filter((x) => x.t >= t0 - 1e-6 && x.t < t1).map((x) => x.o).join('');
          ng.push({ start: r3(t0), end: r3(t1), text: text.slice(0, 40), line: a.line + 1, again: r3(t1) });
        }
        far = live.length ? Math.max(...live.map((x) => x.s)) : -1;
      }
      live.push(a);
      far = Math.max(far, a.s);
    }
    // 短的重講：前一次的錨點拿掉（不算講稿外、行的開口用後面那次）
    const again = scriptRepeats(A, live, ng);
    if (again.length) {
      ng.push(...again);
      ng.sort((x, y) => x.start - y.start);
      for (const g of again) for (let k = live.length - 1; k >= 0; k--) if (live[k].t >= g.start - 1e-6 && live[k].t < g.end - 1e-6) live.splice(k, 1);
    }
    outside.push(...outsideRows(A, live, ng));
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
      // 很像，或講到一半卡住（前一句 ≥ 4 字、幾乎整句是後一句的開頭）
      const a = [...normText(U[i].text)], b = [...normText(U[j].text)];
      let lead = 0;
      while (lead < a.length && lead < b.length && a[lead] === b[lead]) lead++;
      const stumble = a.length >= 4 && b.length > a.length && lead / a.length >= NGSCAN.stumble;
      if (hit / Math.max(S.size, B.length) >= NGSCAN.similar || stumble) { ng.push({ start: U[i].start, end: U[j].start, text: U[i].text.slice(0, 40), line: null, again: U[j].start }); break; }
    }
  }
  // 句子切得不準（卡住那次和上一句黏在一起）時比不出來：字元層級再看一次「緊接著重複」
  const T = [];
  for (const w of words) { const cs = [...normText(w.text)], os = [...plainText(w.text)]; cs.forEach((c, k) => T.push({ c, o: os[k], t: r3(w.start + (k / Math.max(1, cs.length)) * (w.end - w.start)) })); }
  ng.push(...selfRepeats(T, ng, { min: NGSCAN.repeatMinNoScript }));
  ng.sort((a, b) => a.start - b.start);
  return { ng: markCross(ng, bounds), outside, lineTime: new Map(), anchors: 0 };
}

// 講到一半卡住重講：逐字稿連續兩段幾乎一樣（whisper 兩次會聽錯同樣的字，比講稿穩）。錨點是四字組，前一次不到 8 字時跳不回來、抓不到，靠這個補。
// T＝逐字稿的字；ok(k, L)：這一段算不算（有講稿時看講稿這裡是不是本來就重複）；rowOf(k, L)：這一列的講稿行號
function selfRepeats(T, ng, { min = NGSCAN.repeatMin, ok = () => true, lineOf = () => null } = {}) {
  const n = T.length, chars = T.map((x) => x.c), out = [];
  const taken = (a, b) => ng.some((g) => a < g.end - 1e-6 && b > g.start + 1e-6);
  for (let k = 0; k + 2 * min <= n;) {
    let L = 0;
    for (let l = Math.min(NGSCAN.repeatMax, Math.floor((n - k) / 2)); l >= min; l--) {
      let miss = 0;
      for (let i = 0; i < l && miss <= Math.floor(l / 6); i++) if (chars[k + i] !== chars[k + l + i]) miss++;
      if (miss <= Math.floor(l / 6) && chars[k] === chars[k + l]) { L = l; break; }
    }
    if (!L) { k++; continue; }
    const t0 = T[k].t, t1 = T[k + L].t;
    if (t1 - t0 >= NGSCAN.minLen && !taken(t0, t1) && ok(k, L)) {
      out.push({ start: r3(t0), end: r3(t1), text: T.slice(k, k + L).map((x) => x.o ?? x.c).join(''), line: lineOf(k, L), again: r3(t1), repeat: L });
      k += L;
    } else k++;
  }
  return out;
}

// 有講稿：講稿這裡本來就重複（兩個錨點之間逐字稿沒有比講稿多字）就不算
function scriptRepeats(A, live, ng) {
  const { T, lineAt, S } = A, n = T.length;
  const around = (k, L) => {
    let before = null, after = null;
    for (const a of live) { if (a.i < k) before = a; else if (a.i >= k + 2 * L) { after = a; break; } }
    return { before, after };
  };
  return selfRepeats(T, ng, {
    ok: (k, L) => { const { before, after } = around(k, L); return ((after ? after.i : n) - (before ? before.i : 0)) - ((after ? after.s : S.length) - (before ? before.s : 0)) >= Math.ceil(L * 0.6); },
    lineOf: (k, L) => { const { before, after } = around(k, L); return lineAt[Math.min(after ? after.s : before ? before.s : 0, S.length - 1)] + 1; },
  });
}

// 兩個錨點之間（含片頭、片尾）逐字稿的字數 vs 講稿的字數：字數接近＝同一段話被 whisper 聽錯；講稿字數遠少＝真的多講了（real）。
// real 的列再用對齊找出多講的是哪幾個字（兩邊的字對得上的不算），時間碼才不會連講稿的話一起剪
function outsideRows(A, live, ng) {
  const { T, S, lineAt } = A, n = 4;   // 錨點是四字組
  if (!live.length) return [];
  const inNg = (t) => ng.some((g) => t >= g.start - 1e-6 && t < g.end - 1e-6);
  const spans = [{ i0: 0, i1: live[0].i, s0: 0, s1: live[0].s, gap: T.length ? T[live[0].i].t - T[0].t : 0 }];
  for (let k = 1; k < live.length; k++) {
    const a = live[k - 1], b = live[k];
    if (b.i - a.i > n) spans.push({ i0: a.i + n, i1: b.i, s0: a.s + n, s1: b.s, gap: b.t - a.t });
  }
  const last = live[live.length - 1];
  spans.push({ i0: last.i + n, i1: T.length, s0: last.s + n, s1: S.length, gap: T.length ? T[T.length - 1].t - last.t : 0 });
  const rows = [];
  for (const sp of spans) {
    const chars = T.slice(sp.i0, sp.i1).filter((x) => !inNg(x.t));
    const tChars = chars.length, sChars = Math.max(0, sp.s1 - sp.s0);
    if (!tChars) continue;
    const extra = tChars - sChars;
    const real = extra >= NGSCAN.offExtra && (sChars <= tChars * NGSCAN.offRatio || extra >= NGSCAN.offLong);
    if (!real && !(sp.gap >= NGSCAN.outsideGap && tChars >= 6)) continue;
    let piece = chars;
    if (real && sChars) {
      const { map, same } = alignSeq([...S.slice(sp.s0, sp.s1)], chars.map((x) => x.c));
      const hit = new Uint8Array(chars.length);
      map.forEach((j, i) => { if (j >= 0 && same[i]) hit[j] = 1; });
      // 最長一段對不上的字（中間夾 1 個碰巧相同的字也算同一段）
      let best = null, st = -1, end = -1;
      for (let k = 0; k <= chars.length; k++) {
        if (k < chars.length && (!hit[k] || (st >= 0 && k + 1 < chars.length && !hit[k + 1]))) { if (st < 0) st = k; if (!hit[k]) end = k; continue; }
        if (st >= 0 && (!best || end - st > best[1] - best[0])) best = [st, end];
        st = -1; end = -1;
      }
      if (best) piece = chars.slice(best[0], best[1] + 1);
    }
    const after = T[T.indexOf(piece[piece.length - 1]) + 1];
    const lastT = piece[piece.length - 1].t;
    rows.push({ start: r3(piece[0].t), end: r3(after ? Math.min(after.t, lastT + 1) : lastT + NGSCAN.charSec), text: piece.map((x) => x.o).join(''), tChars, sChars, real, line: lineAt[Math.min(Math.max(sp.s0, 0), S.length - 1)] + 1 });
  }
  return rows;
}

// 章節空檔表：每一章第一句的開口。第一句對不到錨點時，用後面第一個對到的行往回估（字數 × charSec），ng-snap 會再找實際開口
export function chapterRows(sc, lineTime) {
  // 影片第一句就是章節開頭：不放章節轉場，也不留空檔（片頭不要靜音）
  return sc.chapters.filter((c) => c.line > 0).map((c) => {
    let i = c.line;
    while (i < sc.lines.length && !lineTime.has(i)) i++;
    const first = sc.lines[c.line].slice(0, 16);
    if (i >= sc.lines.length) return { title: c.title, first, t: null };
    if (i === c.line) return { title: c.title, first, t: lineTime.get(i) };
    const before = sc.lines.slice(c.line, i).reduce((n, l) => n + [...normText(l)].length, 0);
    return { title: c.title, first, t: r3(Math.max(0, lineTime.get(i) - before * NGSCAN.charSec)), est: true };
  });
}

// NG 跨過換檔點（前一支結尾＋下一支開頭）：換檔處的詞級時間常被拉長，下一支開頭的試講也常被併掉 → 標出換檔點，交使用者聽
function markCross(ng, bounds) {
  for (const g of ng) { const b = bounds.find((x) => x > g.start + 0.1 && x < g.end); if (b != null) g.cross = b; }
  return ng;
}

export function ngScan(P, { log = console.log, words = null } = {}) {
  const work = path.join(P.project, 'work');
  if (!words) {
    try { words = JSON.parse(fs.readFileSync(path.join(work, 'transcript.json'), 'utf8')); } catch { throw new Error(`找不到 work/transcript.json → 先轉 main.mp4 的逐字稿（剪乾淨步驟 2）`); }
    if (!Array.isArray(words)) words = words.words || [];
  }
  const clips = mainClips(P, path.join(work, 'main.mp4'));
  const total = clips.length ? clips[clips.length - 1].end : null, last = words.length ? words[words.length - 1].end : 0;
  if (total && last < total * 0.8) log(`⚠ work/transcript.json 只到 ${fmtC(last)}，main.mp4 長 ${fmtC(total)}：可能是 rough.mp4 的逐字稿（剪乾淨步驟 7 會覆蓋）→ 重轉 main.mp4 的逐字稿再跑`);
  const scriptFile = path.join(P.project, '講稿.md');
  const sc = fs.existsSync(scriptFile) ? scriptChapters(readScript(scriptFile)) : null;
  const r = ngScanRows(words, { lines: sc?.lines || null, bounds: clips.slice(1).map((c) => c.start) });
  if (sc) {
    const md = ['# ng-scan（media.mjs ng-scan 產生）：講稿每一行在 main.mp4 第一次（NG 以外）開口的秒數', '', '| 行 | 時間 | 講稿 |', '|---|---|---|',
      ...sc.lines.map((l, i) => `| ${i + 1} | ${r.lineTime.has(i) ? fmtC(r.lineTime.get(i)) : '—'} | ${l} |`)];
    if (r.outside.length) md.push('', '## 講稿外判定（兩個錨點之間的字數）', '', '字數接近＝whisper 聽錯，不用管；講稿字數遠少＝真的多講，media.mjs prep 列進 cuts.md（不勾、待確認）。', '', '| 時間 | 逐字稿 | 字數（逐字稿／講稿） | 判定 |', '|---|---|---|---|',
      ...r.outside.map((u) => `| ${fmtC(u.start)}–${fmtC(u.end)} | ${u.text.replace(/\|/g, '\\|')} | ${u.tChars}／${u.sChars} | ${u.real ? '講稿外' : 'whisper 聽錯'} |`));
    fs.writeFileSync(path.join(work, 'ng-scan.md'), md.join('\n') + '\n');
  }
  log(`逐字稿 ${words.length} 個詞${sc ? `；講稿 ${sc.lines.length} 行，對到 ${r.anchors} 個錨點（講稿裡只出現一次的四字組）；每一行的開口時間寫在 work/ng-scan.md` : '；沒有講稿：只比相鄰句'}`);
  log('');
  log(`NG 候選 ${r.ng.length} 列（${sc ? '講到講稿後面又跳回前面＝重講，留最後一次' : '相鄰句很像，留後面那句'}；照抄進 cuts.md 的 NG 表，「剪」欄一律 [x]，拿不準的在「待確認」寫原因）：`);
  log('| 剪 | 時間碼 | 內容 | 原因 | 待確認 |');
  log('|---|---|---|---|---|');
  for (const g of r.ng) log(`| [x] | ${fmtC(g.start)}–${fmtC(g.end)} | ${g.text} | ${g.line ? `講稿第 ${g.line} 行在 ${fmtC(g.again)} 又講一次，留後面那次` : `${fmtC(g.again)} 又講一次，留後面那次`} | ${g.cross != null ? `跨過換檔點 ${fmtC(g.cross)}：換檔處逐字稿時間常不準、下一支開頭可能還有試講 → 請聽 ${fmtC(g.cross)} 之後確認從哪裡重講（終點改到那裡）` : '—'} |`);
  if (r.outside.length) {
    log('');
    log(`講稿外 ${r.outside.length} 處（講稿找不到的話：口誤、自言自語、臨場加的話，或 whisper 聽錯；聽了再決定，不確定就不剪）：`);
    for (const u of r.outside.slice(0, 20)) log(`  ${fmtC(u.start)}–${fmtC(u.end)}  ${u.text.slice(0, 40)}（逐字稿 ${u.tChars} 字／講稿 ${u.sChars} 字：${u.real ? '講稿外' : '字數接近，多半是 whisper 聽錯'}）`);
    if (r.outside.length > 20) log(`  …還有 ${r.outside.length - 20} 處`);
  }
  if (sc?.chapters.length) {
    log('');
    log('章節空檔表（照抄進 cuts.md；時間碼是這一章第一句的開口秒數，ng-snap 會再往後找實際開口點）：');
    log('| 章節 | 第一句 | 時間碼 |');
    log('|---|---|---|');
    for (const c of chapterRows(sc, r.lineTime)) log(`| ${c.title} | ${c.first} | ${c.t != null ? fmtC(c.t) : '（找不到 → 聽 main.mp4 補）'} |`);
  }
  log('');
  log('→ 下一步：照抄進 work/cuts.md（NG 表、章節空檔表、需要你決定），再跑 ng-snap');
  log(`node shared/template/tools/media.mjs ng-snap --project ${posixRel(P.project)}`);
  return { ...r, script: sc, clips, words };
}

export function ngSnap(P, { edit = CUT.edit, margin = CUT.margin, src = null, v1 = null, log = console.log } = {}) {
  const mSec = parseMargin(margin);
  const work = path.join(P.project, 'work');
  const cutsFile = path.join(work, 'cuts.md');
  if (!fs.existsSync(cutsFile)) throw new Error(`找不到 ${posixRel(cutsFile)} → 先跑 node shared/template/tools/media.mjs prep --project <專案> 列剪輯清單（停點 ① 的格式）`);
  const cm = parseCutsMd(fs.readFileSync(cutsFile, 'utf8'));
  if (cm.errors.length) throw new Error(cm.errors[0]);
  if (!cm.hasNg && !cm.hasChapters) throw new Error('work/cuts.md 裡找不到 NG 表（表頭要有「時間碼」和「原因」）也找不到章節空檔表（表頭要有「章節」和「第一句」）→ 跑 media.mjs prep --again 重寫，或照 auto-edit-rough 的 references/ng-rules.md 補表再跑一次');
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
    log(''); log(`NG：cuts.md ${snapped.length} 列 → 剪 ${cutOut.length} 段${pend ? `（${pend} 列${cm.hasCutCol ? '沒勾' : '待確認'}不剪）` : ''}`);
    log('  列  原始時間碼            對齊停頓後            內容');
    for (const r of snapped) {
      const orig = `${fmtC(r.start)}–${fmtC(r.end)}`;
      const after = r.skip ? '—' : `${fmtC(r.a)}–${fmtC(r.b)}`;
      const missWhat = r.missStart && r.missEnd ? '前後 1.0s 內沒有停頓，用原值' : r.missStart ? '起點前後 1.0s 內沒有停頓，起點用原值' : r.missEnd ? '終點前後 1.0s 內沒有停頓，終點用原值' : '';
      // 終點往後延到停頓末端：講清楚後一次（重講）從那裡才開口、不會被剪到（Sonnet 實測會把這種列誤標待確認）
      const later = !r.skip && !missWhat && !r.toChapter && r.b > r.end + 0.3 ? `；終點落在後一次開口（${fmtC(r.b)}）之前的停頓末端，後一次完整保留` : '';
      const note = r.skip ? (r.cutCol ? '沒勾，不剪' : '待確認，不剪') : missWhat ? `⚠ ${missWhat}` : r.toChapter ? '終點停在章節停頓前' : String(r.text).slice(0, 14) + later;
      log(`  ${String(r.row).padEnd(3)} ${orig.padEnd(20)} ${after.padEnd(21)} ${note}`);
      if (r.skip && !r.cutCol) warnings.push(`⚠ cuts.md NG 第 ${r.row} 列標了待確認（「${r.raw}」），不放進指令 → 使用者確認後把「待確認」欄清空再跑一次`);
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
      const rows = scriptOrder(clips, words, scriptLines(readScript(scriptFile)));
      const sug = suggestOrder(rows);
      log(''); log('主軌順序對講稿：');
      log('  順序  講稿行      檔');
      for (const r of rows) log(`  ${String(r.k + 1).padEnd(5)} ${(r.lines.length ? `${r.lines[0]}–${r.lines[r.lines.length - 1]}` : '對不到').padEnd(10)} ${r.file}`);
      for (const r of rows.filter((x) => x.pos == null)) warnings.push(`⚠ ${r.file} 對不到講稿的任何一行（講稿沒寫到的內容，或不是這集的錄音）→ 停點 ① 問使用者要不要接進主軌、放在哪裡`);
      if (sug.some((r, i) => r.k !== i)) {
        warnings.push(`⚠ 主軌順序和講稿不同：照講稿應該是 ${sug.map((r) => r.name || path.basename(r.file)).join(' → ')} → 停點 ① 跟使用者確認；要照講稿就跑 ${orderCommand(P, sug)}（重接、重轉、重寫 cuts.md）`);
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
  if (!v1File) throw new Error('找不到 work/cuts.v1.json（也沒有 work/cuts.v1）→ 用初剪同樣的參數再跑一次 auto-editor，結尾改 --export v1 -o work/cuts.v1.json（ng-snap 印的第 3 行）');
  const v1 = readV1(v1File);
  const rough = path.join(work, 'rough.mp4');
  if (!fs.existsSync(rough)) throw new Error('找不到 work/rough.mp4 → 先照 ng-snap 印的第 2 行輸出初剪');
  const info = probeMedia(rough);
  const fps = info.fps || 30;
  const cutsFile = path.join(work, 'cuts.md');
  const cm = fs.existsSync(cutsFile) ? parseCutsMd(fs.readFileSync(cutsFile, 'utf8')) : null;
  const ng = cm ? cm.ng.filter((r) => r.cut) : [];
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
    log(`已寫 work/cutpoints.json（剪輯台與 build 的剪接點微淡化會讀它）${backup ? `；舊檔備份在 ${posix(path.relative(P.project, backup))}` : ''}`);
  }
  return { ...res, warnings, written, backup, file: outFile };
}

// ---------- 邊錄邊講的螢幕錄影：初剪後把錄影畫面蓋回主軌（screen-sync）----------
// cuts.v1.json 每個保留段 ∩ main.json 的 screen 段 → rough.mp4 的起訖＋錄影本身的秒數（in）；前後相接、錄影也連續的併成一段
// waits：勾了的等待（main.mp4 的秒數 [起, 迄]）：留下來的 WAIT_KEEP 秒放一段快轉（retime），從等待開始一路快轉到等待結束，前後都接得上
export function screenSegments(clips, v1, fps, waits = []) {
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
      if (l && l.src === c.file && Math.abs(l.to - from) < 1e-6 && Math.abs(l.in + (l.to - l.from) - inn) < 1e-3) { l.to = to; l.mainTo = y; }
      else out.push({ src: c.file, from, to, in: inn, mainFrom: x, mainTo: y });
    }
    acc += b - a;
  }
  const segs = [];
  out.forEach((x, i) => {
    const nx = out[i + 1];
    const w = nx && nx.src === x.src ? waits.find(([a, b]) => Math.abs(x.mainTo - Math.min(b, a + WAIT_KEEP)) < 0.25 && Math.abs(nx.mainFrom - b) < 0.25) : null;
    if (w && x.to - x.from > 0.2) {
      const keep = Math.min(WAIT_KEEP, x.to - x.from), mid = x.to - keep;
      if (mid - x.from > 0.05) segs.push({ src: x.src, from: x.from, to: mid, in: x.in });
      segs.push({ src: x.src, from: Math.max(mid, x.from), to: x.to, retime: [{ at: '+0', src: r3(x.in + (x.to - x.from) - keep) }, { at: `+${r3(keep)}`, src: r3(nx.in) }] });
    } else segs.push({ src: x.src, from: x.from, to: x.to, in: x.in });
  });
  return segs.map((x, i) => ({ id: `sync${String(i + 1).padStart(2, '0')}`, type: 'media', src: x.src, from: r3(x.from), to: r3(x.to), ...(x.retime ? { retime: x.retime } : { in: r3(x.in) }) }));
}

// cuts.md 「等待」表：邊錄邊講的主軌裡，畫面在等（events.json）又沒人講話的區間（預設不勾）。words：main.mp4 的詞
export function waitRows(P, clips, words) {
  const eventsOf = (file) => {
    const stem = path.basename(file, path.extname(file));
    for (const d of [stem, path.basename(file)]) { try { return JSON.parse(fs.readFileSync(path.join(P.project, 'work', 'media', d, 'events.json'), 'utf8')); } catch { /* 換下一個 */ } }
    return null;
  };
  return waitsInMain(clips, words, eventsOf);
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
  let waits = [];
  try { waits = parseCutsMd(fs.readFileSync(path.join(work, 'cuts.md'), 'utf8')).ng.filter((r) => r.wait && r.cut).map((r) => [r.start, r.end]); } catch { waits = []; }
  for (const seg of screenSegments(clips, readV1(v1File), fps, waits)) {
    if (seg.retime) { segments.push(seg); continue; }
    if (!durOf.has(seg.src)) durOf.set(seg.src, probeMedia(path.join(P.project, ...seg.src.split('/'))).duration ?? Infinity);
    const room = r3(durOf.get(seg.src) - seg.in);   // 主軌把錄影長度補到整格，最後一段可能多出不到一格
    if (room <= 0) continue;
    if (seg.to - seg.from > room) seg.to = r3(seg.from + room);
    segments.push(seg);
  }
  segments.forEach((s, i) => { s.id = `sync${String(i + 1).padStart(2, '0')}`; });
  log(`邊錄邊講的螢幕錄影：${segments.length} 段（${posix(path.relative(P.project, v1File))}、rough.mp4 ${fps}fps）`);
  log('  id      rough.mp4             錄影從    檔');
  for (const s of segments) log(`  ${s.id.padEnd(7)} ${`${fmtC(s.from)}–${fmtC(s.to)}`.padEnd(21)} ${(s.retime ? `快轉 ${fmtC(s.retime[0].src)}–${fmtC(s.retime[1].src)}` : fmtC(s.in)).padEnd(9)} ${s.src}`);
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
  writeAtomic(planFile, JSON.stringify(plan, null, 2) + '\n');
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

// 黑畫面偵測本來就整支解碼一次：順便看解碼錯誤（聲音另外解一次，AAC 很快）。檔案壞了 ffmpeg 結束碼還是 0
function blackRanges(file) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-sn', '-dn', '-vf', `blackdetect=d=${ROUGH.d}:pix_th=${ROUGH.pixTh}:pic_th=${ROUGH.picTh}`, '-f', 'null', '-']);
  if (r.status !== 0) throw new Error(`ffmpeg 偵測黑畫面失敗：${String(r.stderr).trim().split(/\r?\n/).pop()}`);
  const a = run('ffmpeg', ['-hide_banner', '-nostats', '-v', 'error', '-i', file, '-vn', '-sn', '-dn', '-f', 'null', '-']);
  const v = decodeIssues(r.stderr), s = decodeIssues(a.stderr);
  return {
    ranges: [...String(r.stderr).matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)].map((m) => [r3(Number(m[1])), r3(Number(m[2]))]),
    decode: { count: v.count + s.count, sample: v.sample || s.sample },
  };
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
  log(`初剪檢查：work/rough.mp4（${fmtC(dur)}，${info.width}×${info.height}，${fps}fps）對照原片 ${posixRel(source)}（用 ${posix(path.relative(P.project, v1File))} 換算秒數）`);
  const scanned = blackRanges(rough);
  if (scanned.decode.count) {
    log(`✖ work/rough.mp4 解碼有錯（${scanned.decode.count} 行，例：${scanned.decode.sample}）→ 檔案壞了（多半是上一次被中途砍掉又重跑）：重新輸出初剪；還是有錯就先跑 node shared/template/tools/media.mjs main --project ${proj} 重接主軌，再重新輸出`);
    return { ok: false, decode: scanned.decode, black: [], rows: [], source };
  }
  const black = mergeBlack(scanned.ranges);
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
    `  重做後 rough.mp4 長度和現在（${fmtC(dur)}）差 0.2 秒以內：work/rough.srt 照用；差更多：字幕跑 media.mjs srt-align 重對。`,
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
  if (!fs.existsSync(srtFile)) throw new Error('找不到 work/rough.srt → 先跑 media.mjs rough 產生');
  const planFile = path.join(work, 'hyperframes', 'plan.json');
  if (fs.existsSync(planFile) && /"#\d+/.test(fs.readFileSync(planFile, 'utf8'))) throw new Error(`work/hyperframes/plan.json 已經用到句號（#N），拆句會讓後面的句號全部位移 → 改在剪輯台分割字幕（剪輯台會一起重對 plan.json 的 #N）：node shared/template/tools/editor.mjs --project ${posixRel(P.project)}`);
  const text = fs.readFileSync(srtFile, 'utf8');
  const cues = parseSrt(text);
  if (!cues.length) throw new Error('work/rough.srt 讀不到任何字幕 → 跑 media.mjs rough --again 重新產生');
  const res = splitCues(cues, mx);
  log(`work/rough.srt 共 ${cues.length} 則，超過 ${mx} 字 ${res.changed.length} 則`);
  if (!res.changed.length) { log(`沒有超過 ${mx} 字的字幕，沒有寫任何檔。`); return { ...res, written: false, backup: null }; }
  for (const c of res.changed) {
    log(`  #${c.n}（${c.len} 字）${fmtC(c.start)}–${fmtC(c.end)}`);
    c.pieces.forEach((p, i) => log(`      → ${p.text.padEnd(18, '　')}${fmtC(p.start)}–${fmtC(p.end)}${c.forced && i === c.pieces.length - 1 ? `   ⚠ 沒有標點，斷在第 ${visibleLen(c.pieces[0].text)} 字 → 到剪輯台看斷得對不對` : ''}`));
  }
  let shift = 0;
  const shifts = [];
  for (const c of res.changed) { shift += c.pieces.length - 1; if (cues.some((x) => x.n > c.n)) shifts.push(`原 #${c.n + 1} 起往後 +${shift}`); }
  log(`拆完共 ${res.cues.length} 則${shifts.length ? `（${shifts.join('，')}）` : ''}`);
  if (dryRun) { log('--dry-run：只印不寫，rough.srt 沒有動。'); return { ...res, written: false, backup: null }; }
  const backup = backupPath(srtFile, now, 'split');
  fs.copyFileSync(srtFile, backup);
  writeAtomic(srtFile, formatSrt(res.cues, { eol: text.includes('\r\n') ? '\r\n' : '\n', bom: text.startsWith('﻿') }));
  log(`已寫回 work/rough.srt；原檔備份在 ${posix(path.relative(P.project, backup))}（要還原就把它複製回 rough.srt）`);
  log('→ 接著跑 snap-srt；之後要拆句請到剪輯台分割，不要再跑 srt-split');
  return { ...res, written: true, backup };
}

// ---------- 剪乾淨第 6 步：字幕對講稿（srt-align，F8）----------
// 單位是完整語句：有講稿＝講稿每一行；沒講稿＝rough.srt 每則依「，。！？；」切成子句。時間用 work/transcript.json（詞級）做全域序列對齊。
export const ALIGN = { max: 18, breath: 0.12, short: 4, closeGap: 1.0, minQ: 0.34, minDur: 0.6, maxCells: 4e8, pause: 1.5, edge: 0.5, blip: 0.25 };   // pause：聲音停這麼久以上，字幕不蓋（keepPauses）；edge：字幕起點到停頓（停頓到終點）之間說話不到這麼久＝攤進停頓的尾巴；blip：短於這個的聲響不打斷停頓
const CJK_PUNCT_DROP = /[，。；：]/;
const isCjk = (c) => !!c && c.codePointAt(0) >= 0x2e80;

// 講稿.md → 講解行：去掉 # 標題、> 引言、``` 區塊、<!-- --> 註解、含 ` 的說明行、整行括號的舞台指示、分隔線、空行
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
// 沒有標點時可以斷的地方：詞的邊界（內建的中文斷詞，不切「動作」「剛剛」這種詞），不切英數字與 auto-edit 這種連字號，不切在開引號後面、收引號前面
const WORD_SEG = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh-Hant', { granularity: 'word' }) : null;
export function breakPoints(t) {
  const words = WORD_SEG ? [...WORD_SEG.segment(t)].map((x) => x.index) : [...t].map((_, i) => i);
  const ok = [];
  let depth = 0, at = 0;
  for (const pos of words) {
    for (; at < pos; at++) { if (/[「『（(]/.test(t[at])) depth++; else if (/[」』）)]/.test(t[at])) depth = Math.max(0, depth - 1); }
    if (pos <= 0 || pos >= t.length) continue;
    if (/[「『（(]/.test(t[pos - 1]) || /[」』）)、，。！？；：,;!?]/.test(t[pos])) continue;
    if (/[A-Za-z0-9.\-_/@+#]/.test(t[pos - 1]) && /[A-Za-z0-9.\-_/@+#]/.test(t[pos])) continue;
    ok.push({ pos, quoted: depth > 0, bad: breakBad(t, pos) });
  }
  return ok;
}

// 這個斷點唸起來順不順：2＝不要斷（「把每／一段」「9／支」「剪輯／的成本」「GitHub／上的」），1＝盡量不要（「剪輯的／成本」），
// −1＝天然的斷點（「剪掉了／六段」「我根據…」前面）。whisper 沒有明顯停頓時就靠這個
const ATTACH_RIGHT = /^(?:[的了著過們嗎呢吧啊喔嚕地得]|[上裡中下]的)/;
const ATTACH_LEFT = /(?:[把將被給跟和與及對向從在讓每這那該此各某其幾兩一二三四五六七八九十]|\d)$/;
const CLAUSE_START = /^(?:我|你|他|它|我們|把|讓|而|但|所以|因為|如果|然後|接著|就|才|再|也|還|都|可以|只要|不過|而且|另外)/;
export function breakBad(t, pos) {
  const l = t.slice(0, pos).trimEnd(), r = t.slice(pos).trimStart();
  if (ATTACH_RIGHT.test(r) || ATTACH_LEFT.test(l)) return 2;
  if (/的$/.test(l) || /[A-Za-z0-9]$/.test(l)) return 1;   // 「AI／工具」：英文和後面的中文通常是一個詞
  return CLAUSE_START.test(r) || /了$/.test(l) ? -1 : 0;
}

// 超過 max 字的行拆開：先斷在「、，。！？；：」（兩邊都放得下、最平均），都沒有才斷在中段停頓最長的詞邊界（forced）
export function splitRow(row, max) {
  const disp = displayText(row.text);
  if (visibleLen(disp) <= max) return [{ ...row, disp, r0: 0, r1: row.text.length }];
  const t = row.text;
  const cand = [];
  for (let k = 1; k < t.length; k++) if (/[、，。！？；：,;!?]/.test(t[k - 1])) cand.push(k);
  const fits = (k) => visibleLen(displayText(t.slice(0, k))) <= max && visibleLen(displayText(t.slice(k))) <= max;
  const bal = (k) => Math.abs(tw(t.slice(0, k)) - tw(t.slice(k)));
  let k = cand.filter(fits).sort((x, y) => bal(x) - bal(y))[0];
  if (k == null) {
    // 標點兩邊放不下：一邊夠長才用（「未來，我會分享更多…」斷在「未來」會多出一則兩個字的字幕，改找詞邊界）
    const c = [...cand].sort((x, y) => bal(x) - bal(y))[0];
    if (c != null && Math.min(visibleLen(displayText(t.slice(0, c))), visibleLen(displayText(t.slice(c)))) > 4) k = c;
  }
  let forced = false;
  if (k == null) {
    // 沒有標點：找詞邊界。先找引號外、中段（30–70%）的，再放寬範圍，最後才切引號裡面。
    // 排序：唸起來不順的（bad＝2）最後；明顯的停頓（≥ 0.15 秒）優先，越長越好；再比順不順、左右平均
    forced = true;
    let best = null;
    const byPos = new Map((row.chars || []).map((c, q) => [c.i, q]));
    const gapAt = (pos) => { const q = byPos.get(pos), c = q != null ? row.chars[q] : null, b = q ? row.chars[q - 1] : null; return c?.t && b?.t ? c.t.a - b.t.b : 0; };
    const points = breakPoints(t);
    const rank = (x) => [x.bad >= 2 ? 1 : 0, x.g >= 0.15 ? -x.g : 0, x.bad, bal(x.pos)];
    const better = (x, y) => { const a = rank(x), b = rank(y); for (let i = 0; i < a.length; i++) { if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] < b[i]; } return false; };
    for (const [lo, hi, quoted] of [[0.3, 0.7, false], [0.15, 0.85, false], [0.3, 0.7, true], [0.1, 0.9, true]]) {
      for (const { pos, quoted: q, bad } of points) {
        if (pos < t.length * lo || pos > t.length * hi || (q && !quoted)) continue;
        const x = { pos, bad, g: gapAt(pos) };
        if (!best || better(x, best)) best = x;
      }
      if (best && best.bad < 2) break;   // 這個範圍只有不順的斷點：再放寬找一次
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
      notes.push(`${id}：${fmtRef(r)} 的「${r.kw}」在新字幕找不到 → 改成時間 ${fmtRef(asTime(T))}（到剪輯台或 plan.json 換成新字幕裡的詞）`);
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

// remapFrom：句號對應用的舊字幕（rough.srt 剛被逐字稿蓋掉時給備份的內容）
export const ALIGN_SHOW = 30;   // 不加 --verbose 時最多印幾列有標記的
// 逐字稿在某一段聽錯時，那幾句的時間會擠在一起：前面幾句拉長、後面一句只剩零點幾秒（16 個字 0.24 秒）。
// 整段的總長是對的（前後句都對得上），照字數重分就回到正常語速。只動語速明顯不對的那幾句，跨過停頓不動。
// speech＝rough.mp4 說話的區間：這幾句的詞級時間不能信，句與句的交界再貼到 0.5 秒內最近的真實停頓
export function evenOutCrushed(cues, { fast = 2, slow = 1, ok = 1.5, minLen = 5, gap = ALIGN.closeGap, speech = null, reach = 0.5, minPause = 0.12 } = {}) {
  const cps = (c) => visibleLen(c.text) / Math.max(0.01, c.end - c.start);
  const med = [...cues.map(cps)].sort((a, b) => a - b)[Math.floor(cues.length / 2)] || 0;
  const out = cues.map((c) => ({ ...c })), fixed = [];
  if (!med) return { cues: out, fixed };
  const off = (c) => cps(c) < med * slow || cps(c) > med * fast;
  for (let i = 0; i < out.length; i++) {
    if (visibleLen(out[i].text) < minLen || cps(out[i]) <= med * fast) continue;
    let a = i, z = i;
    while (a > 0 && out[a].start - out[a - 1].end <= gap && off(out[a - 1])) a--;
    while (z < out.length - 1 && out[z + 1].start - out[z].end <= gap && off(out[z + 1])) z++;
    const span = out[z].end - out[a].start;
    let chars = 0;
    for (let k = a; k <= z; k++) chars += visibleLen(out[k].text);
    if (a === z || chars / span > med * ok) continue;   // 整段都太快：不是擠壓，留給 ⚠
    let t = out[a].start;
    for (let k = a; k <= z; k++) {
      const d = span * visibleLen(out[k].text) / chars;
      out[k].start = r3(t);
      out[k].end = r3(t + d);
      t += d;
    }
    for (let k = a + 1; speech && k <= z; k++) {
      const at = out[k].start;
      let best = null, far = reach;
      for (let j = 1; j < speech.length; j++) {
        const x = speech[j - 1][1], y = speech[j][0];
        if (y - x < minPause) continue;
        const d = at < x ? x - at : at > y ? at - y : 0;
        if (d < far) { far = d; best = y; }
      }
      if (best == null || best - out[k - 1].start < ALIGN.minDur || out[k].end - best < ALIGN.minDur) continue;
      // 句子中間也有停頓，貼錯了語速會不對：貼完兩句都要在正常語速內才算
      const rate = (c, s, e) => visibleLen(c.text) / (e - s);
      const sane = (x) => x >= med * 0.6 && x <= med * 1.6;
      if (!sane(rate(out[k - 1], out[k - 1].start, best)) || !sane(rate(out[k], best, out[k].end))) continue;
      out[k - 1].end = r3(best);
      out[k].start = r3(best);
    }
    fixed.push([out[a].n, out[z].n]);
    i = z;
  }
  return { cues: out, fixed };
}

export function srtAlign(P, { dryRun = false, remapPlan = false, max = ALIGN.max, verbose = false, remapFrom = null, log = console.log, now = new Date() } = {}) {
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
  const lines = hasScript ? scriptLines(readScript(scriptFile)).map((text, i) => ({ text, from: i + 1 })) : clausesFromSrt(oldCues);
  if (!lines.length) throw new Error(hasScript ? '講稿.md 讀不到講解行（# 標題、> 引言、含 ` 的說明行都不算）→ 一句一行寫進講稿.md' : 'work/rough.srt 讀不到任何字幕');
  const res = alignCues(lines, words, { max });
  const { info, rows } = res;
  let { cues } = res, pauseNote = null, speech = null;
  // 字幕不蓋 rough.mp4 裡的長停頓（章節前的 3 秒）：用聲音的能量找停頓；整支有背景音樂分不出說話就跳過
  if (fs.existsSync(roughFile)) {
    try {
      const env = envelope(roughFile);
      speech = speechFromEnvelope(env, pickThreshold(env.db).threshold, { minSpeech: ALIGN.blip });
      const kp = keepPauses(cues, speech);
      if (kp.moved) { cues = kp.cues; res.cues = cues; }
      pauseNote = `rough.mp4 有 ${kp.pauses} 個 ≥ ${ALIGN.pause} 秒的停頓，${kp.moved} 則字幕的起迄避開停頓`;
    } catch (e) { pauseNote = `⚠ 量不到 rough.mp4 的停頓（${e.message.slice(0, 60)}），字幕可能蓋到章節前的停頓`; }
  }
  const crushed = evenOutCrushed(cues, { speech });
  if (crushed.fixed.length) {
    cues = crushed.cues; res.cues = cues;
    log(`${crushed.fixed.map((f) => `#${f[0]}–#${f[1]}`).join('、')} 語速不對（逐字稿在那裡聽錯，幾句擠在一起）：照字數重分時間`);
  }
  // 表
  log(`字幕對${hasScript ? '講稿' : '子句'}：${hasScript ? `講稿.md ${lines.length} 行` : `work/rough.srt ${oldCues.length} 則 → ${lines.length} 個子句`}，時間用 ${why ? `work/rough.srt 的整則時間按字數比例（${why}）` : `work/transcript.json（${words.length} 個詞）全域對齊`}`);
  const rowOf = (c) => {
    const f = info[c.n - 1];
    const tag = [f.merged > 1 ? `併 ${f.merged} 行` : '', f.split ? (f.forced ? '⚠ 拆（沒有標點）' : '拆') : '', f.interp ? '⚠ 內插' : ''].filter(Boolean).join('、');
    return { tag, warn: tag.includes('⚠'), line: `  ${String(c.n).padEnd(4)} ${`${fmtS(c.start)}–${fmtS(c.end)}`.padEnd(21)} ${(c.end - c.start).toFixed(2).padStart(5)}  ${String(visibleLen(c.text)).padStart(2)}   ${c.text}${tag ? `   （${tag}${hasScript ? `；講稿第 ${f.lines.join('、')} 行` : ''}）` : ''}` };
  };
  const table = cues.map(rowOf);
  // 預設只印有標記的列（併、拆、內插），長片最多 ALIGN_SHOW 列、⚠ 優先；--verbose 才印全表
  const marked = verbose ? table : table.filter((x) => x.tag);
  const shown = verbose || marked.length <= ALIGN_SHOW ? marked : [...marked.filter((x) => x.warn), ...marked.filter((x) => !x.warn)].slice(0, ALIGN_SHOW).sort((a, b) => table.indexOf(a) - table.indexOf(b));
  if (shown.length) {
    log('  則   起–迄                 長     字   字幕');
    for (const x of shown) log(x.line);
  }
  if (shown.length < marked.length) log(`  …還有 ${marked.length - shown.length} 列有標記（加 --verbose 看每一則）`);
  else if (!verbose && table.length > marked.length) log(`  （其他 ${table.length - marked.length} 則沒有標記；加 --verbose 看每一則）`);
  const lens = cues.map((c) => visibleLen(c.text)), durs = cues.map((c) => c.end - c.start).sort((a, b) => a - b);
  const gaps = cues.slice(1).map((c, i) => c.start - cues[i].end).sort((a, b) => a - b);
  const med = (a) => (a.length ? a[Math.floor((a.length - 1) / 2)] : 0);
  const summary = `共 ${cues.length} 則（併 ${info.filter((f) => f.merged > 1).length} 次、拆出 ${info.filter((f) => f.split).length} 則）；平均 ${(lens.reduce((s, x) => s + x, 0) / (lens.length || 1)).toFixed(1)} 字、最長 ${Math.max(0, ...lens)} 字；每則中位 ${med(durs).toFixed(2)} 秒；相鄰空檔中位 ${med(gaps).toFixed(2)} 秒`;
  log(summary);
  if (pauseNote) log(pauseNote);
  const warns = [];
  const bad = rows.filter((r) => !r.ok || r.interp);
  if (bad.length) warns.push(`⚠ ${bad.length} ${hasScript ? '行講稿' : '個子句'}在逐字稿裡對不上，時間用前後句內插：${bad.slice(0, 6).map((r) => `${hasScript ? `第 ${r.from} 行` : `#${r.cue}`}「${r.text}」`).join('、')}${bad.length > 6 ? '…' : ''} → 播 rough.mp4 那一段聽：沒講（剪掉了）就從字幕刪掉，有講就到剪輯台調起迄`);
  const forced = info.filter((f) => f.forced);
  if (forced.length) log(`${forced.length} 則超過 ${max} 字又沒有「、，」可以斷，斷在中段停頓最長的詞邊界（不切詞、不切英文和引號）`);
  const short = cues.filter((c) => c.end - c.start < ALIGN.minDur - 1e-9);
  if (short.length) warns.push(`⚠ ${short.length} 則不到 ${ALIGN.minDur} 秒：${short.slice(0, 8).map((c) => `#${c.n}「${c.text}」${(c.end - c.start).toFixed(2)}s`).join('、')} → 到剪輯台和前後句合併`);
  if (why) warns.push(`⚠ ${why}：時間是整則按字數比例估的 → 寫回後要跑 node shared/template/tools/media.mjs snap-srt --project ${pj}（有 transcript.json 就不用）`);
  for (const w of warns) log(w);
  // plan.json 已經用到 #N
  const planFile = path.join(work, 'hyperframes', 'plan.json');
  const planText = fs.existsSync(planFile) ? fs.readFileSync(planFile, 'utf8') : null;
  const needRemap = planText != null && hasRefs(planText);
  if (dryRun) {
    log(`--dry-run：只印不寫。${needRemap ? `work/hyperframes/plan.json 已經用到句號（#N）→ 寫回時要加 --remap-plan（照時間把 #N 換到新句號，先備份 plan.json）` : '去掉 --dry-run 就寫回 work/rough.srt（原檔先備份成 rough.srt.align-<時間戳>）'}`);
    return { ...res, written: false, warnings: warns, summary };
  }
  if (needRemap && !remapPlan) throw new Error(`work/hyperframes/plan.json 已經用到句號（#N），重新斷句後句號會全部位移 → 加 --remap-plan 再跑一次（照時間把 plan.json 的 #N 換到新句號，plan.json 先備份；之後分鏡表 storyboard.md 的句號會過期，以 plan.json 為準）`);
  let backup = null;
  if (srtText != null) { backup = backupPath(srtFile, now, 'align'); fs.copyFileSync(srtFile, backup); }
  const eol = srtText && srtText.includes('\r\n') ? '\r\n' : '\n';
  writeAtomic(srtFile, formatSrt(cues, { eol, bom: !!srtText && srtText.startsWith('﻿') }));
  log(`已寫回 work/rough.srt（${cues.length} 則）${backup ? `；原檔備份在 ${posix(path.relative(P.project, backup))}` : ''}`);
  let remap = null;
  if (needRemap) {
    const plan = JSON.parse(planText);
    remap = remapPlanByTime(plan, remapFrom ?? oldCues, cues);
    const pb = backupPath(planFile, now, 'align');
    fs.copyFileSync(planFile, pb);
    const indent = (planText.match(/\n([ \t]+)"/) || [, '  '])[1];
    let out = JSON.stringify(remap.plan, null, indent) + '\n';
    if (/\r\n/.test(planText)) out = out.replace(/\n/g, '\r\n');
    writeAtomic(planFile, out);
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
  return { ...res, written: true, backup, remap, warnings: warns, summary };
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
  // 插圖清單：分鏡表＋內容設計動畫的鏡位腳本（work/designs/<段>.md；設計師自己新畫的元件寫在那裡）
  const dsDir = path.join(work, 'designs');
  const designMd = fs.existsSync(dsDir) ? fs.readdirSync(dsDir).filter((f) => /\.md$/.test(f)).sort().map((f) => fs.readFileSync(path.join(dsDir, f), 'utf8')) : [];
  const list = readIllusList([fs.existsSync(sb) ? fs.readFileSync(sb, 'utf8') : '', ...designMd].join('\n\n'));
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.svg$/i.test(f) && !f.startsWith('.')).sort() : [];
  const findings = [];
  const add = (level, where, msg, fix) => findings.push({ level, where, msg, fix });
  for (const f of files) {
    const name = f.replace(/\.svg$/i, ''), spec = list.local.get(name);
    if (!spec?.size) add('warn', `illus-local/${f}`, `${name}：work/storyboard.md、work/designs/*.md 的插圖清單${spec ? '這一列沒寫建議尺寸' : '沒有這個元件的「新建 SVG」列'}，這次只查不用尺寸${spec ? '' : '、狀態'}的規則`, `插圖清單那一列的「怎麼來」寫「規格：${name}，建議尺寸 W×H，狀態 a／b」（shared/template/kit/illus-style.md）`);
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

// 每則字數上限照版式（009 FR-031：橫式 18、直式 12＝lib/canvas.mjs 的 caption.maxChars）；明寫 --max 時以參數為準
export function captionMax(P, max = null, log = console.log) {
  if (max != null) return max;
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch { plan = null; }
  const f = resolveFormat({ projectDir: P.project, plan });
  const n = canvasOf(f.format).caption.maxChars;
  if (f.format === 'portrait') log(`版式：直式 → 每則最多 ${n} 字（來源：${f.detail}）`);
  return n;
}

async function cli() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || !flags.cmd || flags.cmd === '--help') { console.log(helpText(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, ''), { cmd: flags.cmd === '--help' ? null : flags.cmd, all: flags.all })); return 0; }
  if (!['prep', 'rough', 'transcribe', 'scan', 'frame', 'main', 'snap-srt', 'ng-scan', 'ng-snap', 'cutpoints', 'screen-sync', 'srt-split', 'srt-align', 'verify-rough', 'illus-lint'].includes(flags.cmd)) throw new Error(`沒有「${flags.cmd}」這個指令：只有 prep、rough、transcribe、scan、frame、main、snap-srt、ng-scan、ng-snap、cutpoints、screen-sync、srt-align、srt-split、verify-rough、illus-lint（用 --help 看用法）`);
  const P = pathsFrom({ project: flags.project, template: flags.template });
  if (!process.env.AUTO_EDIT_JOB) console.log(`專案：${rel(P.project)}`);   // 背景工作的子行程不重複印
  if (['prep', 'rough', 'transcribe', 'scan'].includes(flags.cmd)) return (await import('./lib/rough-flow.mjs')).flowCli(flags.cmd, P, flags);
  if (flags.cmd === 'ng-scan') { ngScan(P); return 0; }
  if (flags.cmd === 'ng-snap') { const mainF = path.join(P.project, 'work', 'main.mp4'); ngSnap(P, { edit: flags.edit ?? (fs.existsSync(mainF) ? editForLevel(mainF).edit : CUT.edit), margin: flags.margin ?? CUT.margin, src: flags.src ?? null, v1: flags.v1 ?? null }); return 0; }
  if (flags.cmd === 'cutpoints') { cutpoints(P, { dryRun: !!flags['dry-run'] }); return 0; }
  if (flags.cmd === 'screen-sync') { screenSync(P, { writePlan: !!flags['write-plan'], dryRun: !!flags['dry-run'] }); return 0; }
  if (flags.cmd === 'verify-rough') return verifyRough(P).ok ? 0 : 1;
  if (flags.cmd === 'illus-lint') return (await illusLint(P, { sheet: !flags['no-sheet'] })).ok ? 0 : 1;
  const capMax = () => captionMax(P, flags.max);
  if (flags.cmd === 'srt-align') { srtAlign(P, { dryRun: !!flags['dry-run'], remapPlan: !!flags['remap-plan'], max: capMax(), verbose: !!flags.verbose }); return 0; }
  if (flags.cmd === 'srt-split') { srtSplit(P, { max: capMax(), dryRun: !!flags['dry-run'] }); return 0; }
  if (flags.cmd === 'snap-srt') {
    snapSrt(P, { dryRun: !!flags['dry-run'], below: flags.below ?? SNAP.below });
    return 0;
  }
  if (flags.cmd === 'frame') {
    const list = await frames(P, { src: flags.src, at: flags.at, grid: !!flags.grid, box: flags.box });
    const tail = `${list[0].width}×${list[0].height}；${flags.box ? '紅框畫上去了：框的東西那一刻不在畫面上就換 at 或框；' : ''}${flags.grid ? '格線每 100px 一條，數字是素材原尺寸的像素座標，box 寫 [x, y, w, h]' : '加 --grid 疊座標格線'}`;
    if (list.length === 1) console.log(`→ ${rel(list[0].file)}（${tail}）`);
    else { for (const x of list) console.log(`→ ${rel(x.file)}`); console.log(`共 ${list.length} 張（${tail}）`); }
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

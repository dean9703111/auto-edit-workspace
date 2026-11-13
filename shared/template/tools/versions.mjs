#!/usr/bin/env node
/**
 * 段落版本與回饋輪：每一段（plan.json 的 id）留 v1、v2…，可以看預覽、並排比較、退回；一輪回饋（r<N>）的備份、紀錄、驗證一條指令做完（停點 ④ 之後用）
 *
 * ── 回饋輪（改一段只要：begin → 改 plan.json → finish → 看那張截圖）──
 *   node shared/template/tools/versions.mjs begin --project projects/<專案> --seg s05[,s06] --said "使用者原話" [--preview] [--json]
 *       開一輪回饋 r<N>（編號＝status.mjs 的「下一輪回饋編號」）：備份 work/hyperframes/plan.json.bak-r<N>、存改之前的版本、建 work/feedback/r<N>.md
 *       （原話、分類、改了哪幾段、驗證四節）、work/製作進度.md 回饋輪加一列（停點 ④ 在等回覆時也記使用者的回覆），最後只印這幾段在 plan.json 的原文與行號，
 *       不用讀整份 plan.json。r<N> 還沒 finish 時再跑一次＝同一輪加段（備份不重做；已經在這一輪的段不重存，只再印一次）。
 *       --said（舊寫法 --say 也收）：使用者原話。--preview：改之前的版本也出預覽.mp4（使用者要比較影片才加，一段約 25 秒；平常不 render，看完成影片預覽就好）。
 *   node shared/template/tools/versions.mjs begin --project projects/<專案> --requests [--seg s05,s06] [--said "照修改單改"]
 *       照剪輯台修改單改（work/feedback/editor-requests.md）：同上開一輪，另外把修改單上每一段在剪輯台標「生成中」（不用再跑 editor.mjs --requests-state）。
 *       不給 --seg＝修改單裡 plan.json 有的段；--said 不給＝「照修改單改」。修改單的 t<秒> 段（要新增的段）plan.json 沒有，不放進這一輪的段，
 *       新增好在 r<N>.md「改了哪幾段」寫一列「- t<秒>：新增 <段 id>，…」，finish 照這一列回報。
 *   node shared/template/tools/versions.mjs finish --project projects/<專案> [--preview] [--no-change] [--prerender] [--json]
 *       對這一輪做完：build（只印 ✖、⚠ 和六行摘要；沒改到的段的 ⚠ 只印數量）→ audit --only <改到的段> --shots（錄影段改用 snapshot --at 那段中間）→
 *       存改之後的版本 → 驗證與改法寫進 r<N>.md → 停點紀錄記 ④ 待回覆 → 印改到的段、✖／⚠、要看的那張截圖，最後是回報段（照貼，停點 ④ 那兩行在最後）。不跑全片 snapshot。
 *       有 ✖ 就停（結束碼 1，版本和停點都不記），改完再跑一次；連續 6 次沒過印「→ 停手」。finish 之後看截圖不對，改完也是再跑一次（使用者回覆之前都算同一輪）。
 *       改到的段存版本時，audit 拼好的完成態圖複製成那一版的 預覽.jpg（不 render）。
 *       begin --requests 開的這一輪：修改單上有改到的段在剪輯台標「已改完」，沒改到的標「失敗」（理由取 r<N>.md「改了哪幾段」那一列，沒有就寫「這段沒有改動」）。
 *       --preview：改之後的版本也出預覽.mp4，上一版也有預覽時出比較影片（使用者要比較影片才加）。--no-change：確定這輪不用改（不然段都和改之前一樣會 ✖）。
 *       --prerender：過了之後在背景低優先權先 render 整支（預設不做：預覽不用 render，說「輸出」才 render）。
 *
 * ── 版本 ──
 *   node shared/template/tools/versions.mjs save --project projects/<專案> --seg s12[,s08] [--preview]
 *       把這段現在的樣子存成下一版 work/versions/<段>/v<N>/：段落.json（plan.json 那一段）、動畫檔（src，或內容設計動畫的
 *       x-design-<段>.html、模板動畫的 <模板>-<段>.html）與用到的 illus-local/*.svg、拍點正本在 work/designs/ 的段（內容設計動畫、手改的模板段）的 鏡位腳本.md（work/designs/<段>.md）、
 *       分鏡.md（storyboard.md 那一節）。只存檔、不 render（一段不到 1 秒）。
 *       和某一版一模一樣就不另存（印「沒變」）；有已確認的提案（versions.mjs accept 過）就存進那一版。
 *       --preview：另外出 預覽.mp4（build --test＋render 這一段，6 秒的段約 25 秒）、預覽.jpg（預覽每 0.5 秒一格，最多 24 格）；
 *       上一個使用中的版本也有預覽時，再出 work/versions/<段>/比較-v<舊>-v<新>.mp4（左舊右新，上方標版本號，聲音用新版）。
 *   node shared/template/tools/versions.mjs new --project projects/<專案> --seg s12[,s08] --note "使用者原話"
 *       改版第一步：沒有開著的回饋輪就自己開一輪（原話用 --note，同 begin），先 save 現在的樣子（audit 拼圖比動畫新就附成 預覽.jpg，不 render），
 *       再開提案 work/versions/<段>/v<N+1>/分鏡.md（抄 storyboard.md 那一節，等 AI 改），自己記停點「③ 分鏡表（<段> v<N+1>）」待回覆，最後印停點 ③ 那兩行。
 *       已經有還沒做完的提案就沿用它。
 *   node shared/template/tools/versions.mjs accept --project projects/<專案> --seg s12[,s08] [--said "使用者原話"]
 *       使用者說「可以」之後：把提案 分鏡.md 的「## 分鏡」整節寫回 work/storyboard.md 那一段；內容設計段、手改模板段的動畫分鏡寫進 work/designs/<段>.md
 *       （拍點正本，audit 照它對拍），模板段記下確認的綁詞（finish 比對）。停點紀錄記「通過」，印出下一步。
 *   node shared/template/tools/versions.mjs use --project projects/<專案> --seg s12 --ver v1 [--said "使用者原話"]
 *       退回某一版：先 save 現在的樣子（不會弄丟），再把那一版的段落、動畫檔、svg、鏡位腳本、分鏡寫回 plan.json、compositions/、
 *       illus-local/、work/designs/、storyboard.md；沒做完的提案標成「放棄」。
 *       沒有開著的回饋輪：自己 begin → use → finish 一次做完（原話用 --said，沒給就寫「<段> 用 <版>」），印法和 finish 一樣（最後是停點 ④）。
 *       回饋輪開著：只換回去，接著跑 finish。
 *   node shared/template/tools/versions.mjs compare --project projects/<專案> --seg s12 [--a v1 --b v2]
 *       並排比較兩版（左 --a、右 --b；沒給＝目前用的版和最新的另一版，版號小的在左）：兩版各確定有 預覽.mp4（沒有才 build＋render 那一段，
 *       一段約 25 秒；要先暫時換成那一版），出 work/versions/<段>/比較-v<a>-v<b>.mp4，最後換回原本用的版（plan.json、動畫檔回到跑之前的內容），印比較影片的完整路徑。
 *   node shared/template/tools/versions.mjs list --project projects/<專案> [--seg s12] [--json]
 *       列出每段的版本、哪一版是目前的（和現在的 plan.json、x 檔一致）、比較影片。
 *
 * --project：同 build.mjs。版本只能用這支工具建、退回，不要手動複製或改 work/versions/ 裡的檔（分鏡.md 的提案除外）。
 * --no-preview：不 build、不 render（舊參數，現在每個指令預設就是這樣）。
 * 測試用：--template <shared/template 資料夾>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pathsFrom, loadLib } from './lib/project.mjs';
import { checkProject } from './lib/check-project.mjs';
import { hfArgs } from './lib/hf.mjs';
import { run, probeMedia, writeJpg } from './lib/ff.mjs';
import { canvas, text, textWidth, contactSheet as sheetPage, htmlShot } from './lib/raster.mjs';
import { findChrome } from './lib/audit-browser.mjs';
import { projArg } from './lib/look.mjs';
import { formatFinding } from './lib/audit-rules.mjs';
import { appendRound, appendStop, progressFile } from './lib/progress.mjs';
import { readStopLog } from './status.mjs';
import { markStoryboardWritten } from './lib/storyboard-state.mjs';
import { writeAtomic } from './lib/atomic.mjs';
import { designFileOf, fillFileOf } from './lib/custom-fill.mjs';
import { resetRuns } from './lib/flow.mjs';
import { STOP, stopLines } from './lib/stops.mjs';
import { report as reportLines, warn, next, cmdLine } from './lib/say.mjs';
import { mainTry, stopLine as stopHere } from './lib/tries.mjs';
import { saidOf, splitFlag, valueOf, oneOf, isMain } from './lib/cli.mjs';
import { runToolUntilDoneSync } from './lib/job.mjs';
import { isSummaryLine } from './lib/build-summary.mjs';
import { editorUrlsSync } from './lib/editor-urls.mjs';
import { requestsInfo, doRequestsStatus } from './editor/server/requests.mjs';
import { ensureBeatsV2, beatOwnerOf, beatSourceOf, beatBlocksOf, retireScript, refreshStoryboard, writeWholeTable, promisedOf, refList } from './lib/beat-source.mjs';
import { r3Round as r3, clock2 } from './lib/time.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIR = 'versions';
const META = '.meta.json';
const STATE = '.state.json';
export const PREVIEW = { tail: 0.5, fps: 2, maxCells: 24, bar: 64, labelScale: 6 };
const PLACEHOLDER = '（寫 1–5 條';
const VALUE_FLAGS = ['project', 'seg', 'note', 'ver', 'template', 'say', 'said', 'a', 'b'];
const BOOL_FLAGS = ['json', 'no-preview', 'preview', 'no-change', 'prerender', 'no-prerender', 'requests', 'help'];

const posix = (p) => p.split(path.sep).join('/');
// 工作區（目前資料夾）外的路徑印絕對路徑（同 qc.mjs）
const rel = (p) => { const r = path.relative(process.cwd(), p); return !r ? '.' : r.startsWith('..') || path.isAbsolute(r) ? path.resolve(p) : posix(r); };
const tail = (s, n = 300) => String(s ?? '').trim().slice(-n);
const r2 = (n) => Math.round(n * 100) / 100;
const hashOf = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const now = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const pj = (P) => projArg(rel(P.project));
const TOOL = 'node shared/template/tools/versions.mjs';
const firstErr = (r) => { const all = `${r.stderr || ''}\n${r.stdout || ''}`; return (all.split('\n').find((l) => l.startsWith('✖')) || tail(all, 160)).trim(); };
const finishCmd = (P) => cmdLine('versions.mjs', ['finish', '--project', rel(P.project)]);
// build 回 75＝底片還在背景編碼：同一條再跑會接著等（lib/job.mjs，有總上限）；等到上限還是 75 就補一行 ✖，呼叫端照一般的失敗處理
const BUILD_TIMEOUT = '✖ build 等到上限還沒做完（底片還在背景編碼）→ 看 work/.jobs/ 裡最新的 .log；還在動就同一條指令再跑一次，不動就停下來回報';
function buildSync(P, args, extra) {
  const r = runToolUntilDoneSync(path.join(HERE, 'build.mjs'), ['--project', P.project, ...args, ...extra]);
  return r.timedOut ? { ...r, stdout: `${r.stdout || ''}\n${BUILD_TIMEOUT}` } : r;
}

// ---------- storyboard.md 的一節：「### <id>｜…」到下一個 #、##、### 標題之前（#### 動畫分鏡、插圖清單算在裡面） ----------
export function findSection(md, id) {
  const ls = String(md).split('\n');
  const re = new RegExp(`^###\\s+${esc(id)}(?=$|[\\s｜|（(：:])`);
  const i = ls.findIndex((l) => re.test(l));
  if (i < 0) return null;
  let j = i + 1;
  while (j < ls.length && !/^#{1,3}\s/.test(ls[j])) j++;
  let k = j;
  while (k > i + 1 && !ls[k - 1].trim()) k--;
  return { start: i, end: k, text: ls.slice(i, k).join('\n') };
}

export function replaceSection(md, id, body) {
  const ls = String(md).split('\n');
  const s = findSection(md, id);
  const add = String(body).replace(/\s+$/, '').split('\n');
  if (s) { ls.splice(s.start, s.end - s.start, ...add); return ls.join('\n'); }
  const at = ls.findIndex((l) => /^##\s+需要我決定的事/.test(l));
  if (at >= 0) { ls.splice(at, 0, ...add, '', ''); return ls.join('\n'); }
  return `${String(md).replace(/\s+$/, '')}\n\n${add.join('\n')}\n`;
}

const headOf = (md) => { const i = md.search(/^## 分鏡\s*$/m); return i < 0 ? md : md.slice(0, i); };
export const bodyOf = (md) => { const m = md.match(/^## 分鏡\s*$/m); return m ? md.slice(m.index + m[0].length).replace(/^\s*\n/, '').replace(/\s+$/, '') : null; };
const sectionBlock = (snap) => `## 分鏡\n\n${snap.section ?? `（work/storyboard.md 沒有「### ${snap.id}」這一節）`}\n`;

// ---------- 這段現在的樣子 ----------
export function snapshotOf(P, id) {
  const plan = readJson(P.plan);
  if (!plan) throw new Error(`讀不到 ${rel(P.plan)} → 先跑 node shared/template/tools/build.mjs --project ${pj(P)} --check 看 plan.json 哪裡壞了`);
  const seg = (plan.scenes || []).find((s) => s && s.id === id);
  if (!seg) throw new Error(`plan.json 沒有「${id}」這一段 → 段 id 照 build.mjs --check 報告的第一欄（例 s12）；「1:10 那段」先對照報告的起–迄找 id`);
  const files = [];
  // 動畫檔：手寫的 src；內容設計動畫、模板動畫沒有 src，檔名照工具的規則（build 產生、設計師改的就是這支）
  const anim = seg.src || (seg.design ? designFileOf(seg) : seg.template ? fillFileOf(seg) : null);
  if (anim && (seg.type === 'custom' || seg.design || seg.template)) {
    const f = path.join(P.out, anim);
    if (fs.existsSync(f)) {
      const c = fs.readFileSync(f, 'utf8');
      files.push({ rel: posix(anim), store: path.basename(anim), content: c });
      for (const m of new Set([...c.matchAll(/illus-local\/[^"'`\s)]+?\.svg/g)].map((x) => x[0]))) {
        const s = path.join(P.out, m);
        if (fs.existsSync(s)) files.push({ rel: m, store: m, content: fs.readFileSync(s, 'utf8') });
      }
    }
  }
  // 拍點正本在 work/designs/ 的段（內容設計動畫、手改過的模板段，032 B6）：鏡位腳本也一起存，退回時才對得上
  if (seg.design || beatOwnerOf(P, seg).owner === 'script') {
    const d = path.join(P.project, 'work', 'designs', `${id}.md`);
    if (fs.existsSync(d)) files.push({ rel: `../designs/${id}.md`, store: '鏡位腳本.md', content: fs.readFileSync(d, 'utf8') });
  }
  const sb = path.join(P.project, 'work', 'storyboard.md');
  const section = fs.existsSync(sb) ? findSection(fs.readFileSync(sb, 'utf8'), id)?.text ?? null : null;
  const srt = fs.existsSync(P.srt) ? hashOf(fs.readFileSync(P.srt, 'utf8')) : null;
  const hash = hashOf([JSON.stringify(seg), ...files.map((x) => `${x.rel}\0${x.content}`)].join('\0'));
  // 不含鏡位腳本的雜湊（032 B6：accept 會把提案的表寫進鏡位腳本，「提案確認了、動畫還沒做」要只比段落和動畫檔）
  const animHash = hashOf([JSON.stringify(seg), ...files.filter((x) => x.store !== '鏡位腳本.md').map((x) => `${x.rel}\0${x.content}`)].join('\0'));
  return { id, seg, files, section, hash, animHash, srt };
}

export const segDir = (project, id) => path.join(project, 'work', DIR, id);

export function listVersions(project, id) {
  const d = segDir(project, id);
  let names = [];
  try { names = fs.readdirSync(d); } catch { /* 還沒有版本 */ }
  return names.map((n) => /^v(\d+)$/.exec(n)).filter(Boolean).map((m) => {
    const dir = path.join(d, m[0]);
    return { n: Number(m[1]), name: m[0], dir, meta: readJson(path.join(dir, META), {}) || {},
      complete: fs.existsSync(path.join(dir, '段落.json')), preview: fs.existsSync(path.join(dir, '預覽.mp4')) };
  }).sort((a, b) => a.n - b.n);
}
const pendingOf = (vers) => vers.find((v) => !v.complete && v.meta.state !== '放棄') || null;
const segIds = (project) => { try { return fs.readdirSync(path.join(project, 'work', DIR), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort(); } catch { return []; } };

const stateFile = (project) => path.join(project, 'work', DIR, STATE);
const readState = (project) => readJson(stateFile(project), {}) || {};
const writeState = (project, s) => writeJson(stateFile(project), s);

// status.mjs 用：storyboard.md 最後一次是被 accept／use 寫的（不是停點 ③ 還在改）
export function storyboardByVersions(project) {
  const t = readState(project).storyboardMtime;
  let m = null;
  try { m = fs.statSync(path.join(project, 'work', 'storyboard.md')).mtimeMs; } catch { return false; }
  return Number.isFinite(t) && Math.abs(m - t) < 1000;
}

// status.mjs 用：還沒做完的提案（提案＝等使用者確認；已確認＝accept 過、還沒 save）
export function pendingRevisions(project) {
  return segIds(project).map((id) => { const p = pendingOf(listVersions(project, id)); return p ? { id, v: p.n, state: p.meta.state || '提案' } : null; }).filter(Boolean);
}

function markStoryboard(P, md) {
  const f = path.join(P.project, 'work', 'storyboard.md');
  fs.writeFileSync(f, md);
  const st = readState(P.project);
  st.storyboardMtime = fs.statSync(f).mtimeMs;
  writeState(P.project, st);
  markStoryboardWritten(P, md);   // 工具自己寫的，不算「有改動還沒套回」
}

// 032 B6：storyboard.md 這幾段的動畫分鏡從正本重產（取代 022 的 syncDesignSheet：不比修改時間，正本一律贏）；寫回走 markStoryboard
// seed: false：退回、確認不建鏡位腳本（手改段在 build 時就建好了；退回的版本沒有就照那一版原樣，版本的雜湊才對得上）
const refreshSegs = (P, plan, ids, lib) => refreshStoryboard(P, plan, { lib, only: ids, seed: false, write: (t) => markStoryboard(P, t) });

function writeVersionFiles(dir, snap) {
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, '段落.json'), snap.seg);
  for (const f of snap.files) {
    const t = path.join(dir, ...f.store.split('/'));
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, f.content);
  }
}
const metaOf = (snap) => ({ hash: snap.hash, animHash: snap.animHash, srt: snap.srt, files: snap.files.map((f) => ({ rel: f.rel, store: f.store })) });

// ---------- 預覽：build --test 這一段 → render → 拼格 ----------
export function contactSheet(mp4, out, portrait = false) {
  const dur = probeMedia(mp4).duration || 1;
  const fps = Math.min(PREVIEW.fps, PREVIEW.maxCells / dur);
  const n = Math.max(1, Math.floor(dur * fps + 1e-6));
  const cols = portrait ? 6 : 4, rows = Math.ceil(n / cols), w = portrait ? 240 : 480;
  const r = run('ffmpeg', ['-y', '-v', 'error', '-i', mp4, '-vf', `fps=${fps.toFixed(3)},scale=${w}:-2,tile=${cols}x${rows}:padding=4:margin=4:color=white`, '-frames:v', '1', '-q:v', '3', out]);
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`拼不出 ${path.basename(out)}：${tail(r.stderr, 200)}`);
}

export function compareClip(a, b, out, labels) {
  const m = probeMedia(b);
  const hw = Math.round(m.width / 4) * 2, hh = Math.round(m.height / 4) * 2, bar = PREVIEW.bar, S = PREVIEW.labelScale;
  const lab = canvas(hw * 2, bar, [24, 24, 24]);
  labels.forEach((t, i) => text(lab, t, i * hw + Math.round((hw - textWidth(t, S)) / 2), Math.round((bar - 7 * S) / 2), S, [255, 255, 255]));
  const tmp = out.replace(/\.mp4$/, '.label.jpg');
  writeJpg(lab, tmp);
  const fc = `[0:v]scale=${hw}:${hh},setsar=1[l];[1:v]scale=${hw}:${hh},setsar=1[r];[l][r]hstack=inputs=2[s];[s]pad=iw:ih+${bar}:0:${bar}[p];[p][2:v]overlay=0:0:shortest=1,format=yuv420p[v]`;
  const args = ['-y', '-v', 'error', '-i', a, '-i', b, '-loop', '1', '-i', tmp, '-filter_complex', fc, '-map', '[v]'];
  if (m.hasAudio) args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '128k');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', out);
  const r = run('ffmpeg', args);
  fs.rmSync(tmp, { force: true });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`做不出 ${path.basename(out)}：${tail(r.stderr, 200)}`);
}

function makePreview(P, flags, id, dir, log) {
  const extra = flags.template ? ['--template', path.resolve(flags.template)] : [];
  const build = (args) => buildSync(P, args, extra);
  const again = '修好後再跑一次同一行（檔案已經存好，只會補預覽）';
  const fail = (why, fix) => { log(`⚠ ${id} 的預覽沒做：${why} → ${fix}`); return false; };
  const j = checkProject(P.project, flags.template ? { template: path.resolve(flags.template) } : {});   // 032：行程內，和 build --check --json 同一份
  if (!j.ok) return fail(`plan.json 有 ✖（${(j.errors || [])[0] ?? '?'}）`, `照 build.mjs --check 的 → 修好，${again}`);
  const o = (j.items || []).find((x) => x.id === id)?.out;
  if (!o || !Number.isFinite(o.start)) return fail('--check 找不到這段在完成影片的時間', again);
  const t0 = r2(o.start), len = r2(Math.max(0.5, Math.min(o.end - o.start + PREVIEW.tail, (j.outputDur ?? Infinity) - o.start)));
  const b = build(['--test', `${t0},${len}`]);
  if (b.status !== 0) return fail(`build 失敗（${firstErr(b)}）`, `照 build 印的 → 修好，${again}`);
  const mp4 = path.join(dir, '預覽.mp4');
  const r = spawnSync(process.execPath, hfArgs(['render', '-c', 'compositions/test-clip.html', '--quality', 'draft', '-o', posix(path.relative(P.out, mp4))]), { cwd: P.out, encoding: 'utf8', timeout: 900000, maxBuffer: 1 << 28 });
  if (r.status !== 0 || !fs.existsSync(mp4)) return fail(`render 失敗（${tail(r.stderr || r.stdout, 200)}）`, `先跑 (cd ${pj(P)}/work/hyperframes && npx hyperframes check) 看錯誤，${again}`);
  try { contactSheet(mp4, path.join(dir, '預覽.jpg'), j.format === 'portrait'); } catch (e) { log(`⚠ ${id}：${e.message}（預覽.mp4 已經好了，可以直接看）`); }
  return true;
}

// 這段有提案卡著、不能存：還沒確認、或確認了還沒做（回傳訊息，沒卡著回 null）
function proposalBlock(P, id, vers, snap) {
  const pend = pendingOf(vers);
  if (!pend) return null;
  // 已確認的提案：鏡位腳本是 accept 寫的，不算「做了」；只比段落和動畫檔（舊版本沒有 animHash：沒存鏡位腳本的 hash 就是它）
  const sameAnim = (v) => v.meta.hash === snap.hash || (pend.meta.state === '已確認' && (v.meta.animHash ?? v.meta.hash) === snap.animHash);
  const same = vers.find((v) => v.complete && sameAnim(v)) || null;
  const cur = same || vers.filter((v) => v.complete).at(-1);
  if (pend.meta.state !== '已確認') return `${id} 的 v${pend.n} 分鏡還在等使用者確認 → 使用者說「可以」先跑 ${TOOL} accept --project ${pj(P)} --seg ${id}；不改了就跑 ${TOOL} use --project ${pj(P)} --seg ${id} --ver v${cur?.n ?? 1}（提案標成放棄）`;
  if (same) return `${id} 還和 v${same.n} 一模一樣：v${pend.n} 的分鏡還沒做 → 照 auto-edit-motion 做完、build 之後再跑這一行`;
  return null;
}

// audit 拼的這段完成態（work/audit-shots/sheet-<段>.jpg）：比這段的動畫檔、plan.json 都新才算現在的樣子
export function freshSheet(P, id) {
  const f = path.join(P.project, 'work', 'audit-shots', `sheet-${id}.jpg`);
  if (!fs.existsSync(f)) return null;
  const t = fs.statSync(f).mtimeMs;
  let snap = null;
  try { snap = snapshotOf(P, id); } catch { return null; }
  const srcs = snap.files.filter((x) => x.rel.startsWith('compositions/')).map((x) => path.join(P.out, x.rel));
  for (const x of srcs.length ? srcs : [P.plan]) if (fs.existsSync(x) && fs.statSync(x).mtimeMs > t) return null;
  return f;
}

// ---------- save ----------
export function saveSeg(P, flags, id, log, opt = {}) {
  const snap = snapshotOf(P, id);
  const vers = listVersions(P.project, id);
  const same = vers.find((v) => v.complete && v.meta.hash === snap.hash) || null;
  const pend = pendingOf(vers);
  const blocked = proposalBlock(P, id, vers, snap);
  if (blocked) throw new Error(blocked);
  // 預設只存檔、不 render（看會動的樣子用完成影片預覽，瀏覽器即時播）；使用者要比較影片才加 --preview
  const wantPreview = !flags['no-preview'] && !!flags.preview;
  let target, created = false;
  if (pend) {
    writeVersionFiles(pend.dir, snap);
    const mdFile = path.join(pend.dir, '分鏡.md');
    const old = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, 'utf8') : `# ${id} v${pend.n}（改版）\n\n`;
    fs.writeFileSync(mdFile, headOf(old) + sectionBlock(snap));
    writeJson(path.join(pend.dir, META), { ...pend.meta, ...metaOf(snap), state: '完成', done: now() });
    target = { ...pend, complete: true };
    created = true;
  } else if (same) {
    target = same;
  } else {
    const n = (vers.at(-1)?.n ?? 0) + 1;
    const dir = path.join(segDir(P.project, id), `v${n}`);
    writeVersionFiles(dir, snap);
    const kind = opt.kind || '存檔';
    fs.writeFileSync(path.join(dir, '分鏡.md'), `# ${id} v${n}（${kind}）\n\n- 時間：${now()}${opt.note ? `\n- 原話：${opt.note}` : ''}\n\n${sectionBlock(snap)}`);
    writeJson(path.join(dir, META), { id, v: n, kind, state: '完成', time: now(), ...(opt.note ? { note: opt.note } : {}), ...metaOf(snap) });
    target = { n, name: `v${n}`, dir, complete: true, preview: false };
    created = true;
  }
  log(created ? `${id}：存成 v${target.n}（${rel(target.dir)}/）` : `${id}：沒變，目前就是 v${target.n}（${rel(target.dir)}/）`);
  // 預覽.jpg：audit 量這段時拼好的完成態（finish、new 傳進來），不用 render
  if (opt.still && fs.existsSync(opt.still)) {
    try { fs.copyFileSync(opt.still, path.join(target.dir, '預覽.jpg')); } catch { /* 沒圖照樣存版本 */ }
  }
  const mp4 = path.join(target.dir, '預覽.mp4');
  let previewOk = fs.existsSync(mp4);
  if (!previewOk && wantPreview) {
    previewOk = makePreview(P, flags, id, target.dir, log);
    if (previewOk) log(`  預覽：${rel(mp4)}（${probeMedia(mp4).duration} 秒）、預覽.jpg`);
  }
  // 比較：上一個使用中的版本 → 這一版
  const st = readState(P.project);
  st.live = st.live || {}; st.prev = st.prev || {};
  if (st.live[id] !== target.n) {
    st.prev[id] = st.live[id] ?? vers.filter((v) => v.complete && v.n < target.n).at(-1)?.n ?? null;
    st.live[id] = target.n;
    writeState(P.project, st);
  }
  let cmp = null;
  const pv = st.prev[id];
  const prev = pv != null && pv !== target.n ? listVersions(P.project, id).find((v) => v.n === pv && v.preview) : null;
  if (wantPreview && previewOk && prev) {
    cmp = path.join(segDir(P.project, id), `比較-v${prev.n}-v${target.n}.mp4`);
    if (!fs.existsSync(cmp)) {
      try { compareClip(path.join(prev.dir, '預覽.mp4'), mp4, cmp, [`v${prev.n}`, `v${target.n}`]); } catch (e) { log(`⚠ ${id}：${e.message} → 兩版的 預覽.mp4 都在，可以分開看`); cmp = null; }
    }
    if (cmp) log(`  比較：${rel(cmp)}（左 v${prev.n}、右 v${target.n}）`);
  }
  return { id, n: target.n, dir: target.dir, created, previewOk, cmp };
}

// ---------- new（改版提案） ----------
export function newProposal(P, flags, id, log, note = null) {
  const vers = listVersions(P.project, id);
  const pend = pendingOf(vers);
  if (pend) {
    log(`${id}：v${pend.n} 的提案已經在了（${pend.meta.state || '提案'}）→ 直接改 ${rel(path.join(pend.dir, '分鏡.md'))}`);
    return { id, n: pend.n, file: path.join(pend.dir, '分鏡.md'), reused: true };
  }
  const cur = saveSeg(P, flags, id, log, { still: freshSheet(P, id) });
  const n = Math.max(cur.n, ...listVersions(P.project, id).map((v) => v.n)) + 1;
  const dir = path.join(segDir(P.project, id), `v${n}`);
  const snap = snapshotOf(P, id);
  const look = ['預覽.mp4', '預覽.jpg'].filter((f) => fs.existsSync(path.join(cur.dir, f))).map((f) => `[v${cur.n}/${f}](../v${cur.n}/${f})`);
  const md = [`# ${id} v${n}（改版）`, '', `- 提案：${now()}`, ...(note ? [`- 原話：${note}`] : []),
    `- 現在的樣子：${look.length ? `${look.join('、')}；` : ''}會動的樣子在完成影片預覽（剪輯台）看 ${id} 那段`, '',
    '## 這版要改什麼', '', `- ${PLACEHOLDER}：和 v${cur.n} 差在哪、為什麼；動態只用 BEATS.md 語彙表的名稱）`, '', sectionBlock(snap)].join('\n');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '分鏡.md'), md);
  writeJson(path.join(dir, META), { id, v: n, kind: '改版', state: '提案', time: now(), ...(note ? { note } : {}) });
  log(`${id}：提案開好了 ${rel(path.join(dir, '分鏡.md'))}（現在的樣子是 v${cur.n}）`);
  return { id, n, file: path.join(dir, '分鏡.md'), reused: false };
}

// ---------- accept ----------
export function acceptProposal(P, id, log) {
  const pend = pendingOf(listVersions(P.project, id));
  if (!pend) throw new Error(`${id} 沒有等確認的提案 → 先跑 node shared/template/tools/versions.mjs new --project ${pj(P)} --seg ${id}`);
  const file = path.join(pend.dir, '分鏡.md');
  const md = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (md.includes(PLACEHOLDER)) throw new Error(`${rel(file)} 的「這版要改什麼」還是範本那一行 → 寫 1–5 條和上一版差在哪，給使用者看過再 accept`);
  const body = bodyOf(md);
  if (!body || !findSection(body, id)) throw new Error(`${rel(file)} 的「## 分鏡」底下找不到「### ${id}｜…」那一節 → 照 storyboard.md 的格式寫（標題、截圖觀察、#### 動畫分鏡 ${id}）`);
  const sbFile = path.join(P.project, 'work', 'storyboard.md');
  const sb = fs.existsSync(sbFile) ? fs.readFileSync(sbFile, 'utf8') : '';
  // 032 B6：拍點正本在 work/designs/ 的段，提案那張表寫進鏡位腳本（舊的備份到 .old/）；照 plan.json 產生的段記下提案確認的綁詞，finish 時比對
  const plan = readJson(P.plan), seg = (plan?.scenes || []).find((s) => s?.id === id) || null;
  const lib = seg ? loadLib(P.templateDir, P.project) : null;
  const own = seg ? beatOwnerOf(P, seg, { lib }) : { owner: 'none' };
  const block = beatBlocksOf(body, id), promised = promisedOf(body, id), extra = {};
  if (own.owner === 'script' && block) {
    writeWholeTable(P, id, block);
    log(`${id}：v${pend.n} 的動畫分鏡寫進 work/designs/${id}.md（拍點正本；舊的備份在 work/designs/.old/）`);
  } else if (own.owner === 'plan' && promised.length) extra.promised = promised;
  markStoryboard(P, replaceSection(sb, id, body));
  if (own.owner === 'script') refreshSegs(P, plan, [id], lib);   // 加上「拍點正本」那一行，storyboard.md 和正本一致
  resetRuns(P, [id]);   // 接著派人照新分鏡做：從第 1 次 audit 算起
  writeJson(path.join(pend.dir, META), { ...pend.meta, state: '已確認', accepted: now(), ...extra });
  log(`${id}：v${pend.n} 的分鏡寫回 work/storyboard.md（### ${id} 那一節）`);
  return { id, n: pend.n };
}

// ---------- use（退回） ----------
// 做完的那一版（use、compare 用；沒有就丟錯，附有哪幾版）
export function doneVersion(P, id, ver) {
  const want = Number(String(ver ?? '').replace(/^v/i, ''));
  const vers = listVersions(P.project, id);
  const t = vers.find((v) => v.n === want && v.complete);
  if (!t) throw new Error(`${id} 沒有做完的 v${Number.isFinite(want) ? want : ver}（有：${vers.filter((v) => v.complete).map((v) => v.name).join('、') || '無'}）→ 先跑 node shared/template/tools/versions.mjs list --project ${pj(P)} --seg ${id} 看有哪幾版`);
  return t;
}

export function useVersion(P, flags, id, ver, log) {
  const t = doneVersion(P, id, ver);
  const vers = listVersions(P.project, id);
  for (const v of vers) if (!v.complete && v.meta.state !== '放棄') { writeJson(path.join(v.dir, META), { ...v.meta, state: '放棄', dropped: now() }); log(`${id}：v${v.n} 的提案標成放棄`); }
  saveSeg(P, flags, id, log, { still: freshSheet(P, id) });
  const seg = readJson(path.join(t.dir, '段落.json'));
  const plan = readJson(P.plan);
  const i = (plan?.scenes || []).findIndex((s) => s && s.id === id);
  if (i < 0) throw new Error(`plan.json 沒有「${id}」這一段了 → 退回不了；要加回這段，照 v${t.n}/段落.json 手動放進 plan.json 的 scenes`);
  plan.scenes[i] = seg;
  writeAtomic(P.plan, JSON.stringify(plan, null, 2) + '\n');
  const restored = [];
  for (const f of t.meta.files || []) {
    const src = path.join(t.dir, ...f.store.split('/'));
    if (!fs.existsSync(src)) continue;
    const dst = path.join(P.out, ...f.rel.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    restored.push(path.basename(f.rel));
  }
  // 032 B6：退回的那一版動畫檔是照 plan.json 產生的（沒手改）→ 現在的鏡位腳本不再是正本，搬到 .old/（不然下次手改會沿用過期的表）
  const lib = loadLib(P.templateDir, P.project);
  if (beatOwnerOf(P, seg, { lib }).owner === 'plan' && !(t.meta.files || []).some((f) => f.store === '鏡位腳本.md')) {
    const old = retireScript(P, id);
    if (old) log(`${id}：v${t.n} 的動畫檔照 plan.json 產生，拍點回到 plan.json；原本的拍點表搬到 ${old}`);
  }
  const body = bodyOf(fs.existsSync(path.join(t.dir, '分鏡.md')) ? fs.readFileSync(path.join(t.dir, '分鏡.md'), 'utf8') : '');
  const sbFile = path.join(P.project, 'work', 'storyboard.md');
  if (body && findSection(body, id) && fs.existsSync(sbFile)) { markStoryboard(P, replaceSection(fs.readFileSync(sbFile, 'utf8'), id, body)); restored.push('storyboard.md 那一節'); }
  refreshSegs(P, plan, [id], lib);   // 那一節的動畫分鏡照退回後的正本重產（版本存的可能是舊格式）
  const st = readState(P.project);
  st.live = st.live || {}; st.prev = st.prev || {};
  if (st.live[id] !== t.n) { st.prev[id] = st.live[id] ?? null; st.live[id] = t.n; }
  writeState(P.project, st);
  log(`${id}：退回 v${t.n}：plan.json 這段${restored.length ? `、${restored.join('、')}` : ''}都換成 v${t.n} 的`);
  const srt = fs.existsSync(P.srt) ? hashOf(fs.readFileSync(P.srt, 'utf8')) : null;
  if (t.meta.srt && srt && t.meta.srt !== srt) log(`⚠ 字幕在 v${t.n} 之後改過，這段的句號（#N）可能對不上 → build --check 看「文字對時」，有 ✖ 照 → 改`);
  return { id, n: t.n };
}

// 沒有開著的回饋輪時的 use：begin → use → finish 一次做完（退回也是一輪回饋：備份、紀錄、驗證、停點 ④）；原話沒給就寫「<段> 用 <版>」
export function useAndFinish(P, flags, id, ver, log = console.log, steps = {}) {
  const v = `v${doneVersion(P, id, ver).n}`;   // 版本不對先擋：不要開了一輪才發現
  const b = beginRound(P, flags, [id], saidOf(flags) || `${id} 用 ${v}`, log);
  log(`回饋 ${b.round}：${id} 退回 ${v}（begin → use → finish 一次做完）`);
  useVersion(P, flags, id, ver, log);
  return finishRound(P, flags, log, steps);
}

// ---------- compare（並排比較兩版） ----------
// 預覽要 render 現在 plan.json 的樣子：那一版不是現在用的就暫時換上（plan.json 那段、動畫檔），做完全部換回跑之前的內容（逐位元組），
// 再 build 一次，完成影片預覽才會回到現在的樣子。測試可以換掉 steps。
const COMPARE_STEPS = {
  preview: (P, flags, id, dir, log) => makePreview(P, flags, id, dir, log),
  clip: (a, b, out, labels) => compareClip(a, b, out, labels),
  build(P, flags) {
    const extra = flags.template ? ['--template', path.resolve(flags.template)] : [];
    const r = buildSync(P, [], extra);   // 底片還在編碼：接著等
    return { ok: r.status === 0, err: firstErr(r) };
  },
};

export function compareVersions(P, flags, id, log = console.log, { a = null, b = null } = {}, steps = {}) {
  const S = { ...COMPARE_STEPS, ...steps };
  const cur = saveSeg(P, { ...flags, preview: false }, id, log);   // 現在的樣子先存（沒變就不另存）＝目前用的版
  const done = listVersions(P.project, id).filter((v) => v.complete);
  const live = done.find((v) => v.n === cur.n);
  let A, B;
  if (a || b) [A, B] = [doneVersion(P, id, a ?? cur.n), doneVersion(P, id, b ?? cur.n)];
  else {
    const other = done.filter((v) => v.n !== cur.n).at(-1);
    if (!other) throw new Error(`${id} 只有 v${cur.n} 一版，沒有可以比的 → 先改這段存出新的一版（回饋輪 begin → 改 → finish）`);
    [A, B] = [live, other].sort((x, y) => x.n - y.n);
  }
  if (A.n === B.n) throw new Error(`--a、--b 是同一版（v${A.n}）→ 換一版，或兩個都不給（比目前用的版和最新的另一版）`);
  const keep = new Map();   // 暫時換掉的檔 → 原本的內容（null＝原本沒有）
  const remember = (f) => { if (!keep.has(f)) keep.set(f, fs.existsSync(f) ? fs.readFileSync(f) : null); };
  const restore = () => { for (const [f, buf] of keep) { if (buf == null) fs.rmSync(f, { force: true }); else writeAtomic(f, buf); } keep.clear(); };
  let switched = false, made = false, ok = true;
  try {
    // 現在用的那一版先做（不用換）；另一版才暫時換上
    for (const v of B.n === cur.n ? [B, A] : [A, B]) {
      if (fs.existsSync(path.join(v.dir, '預覽.mp4'))) continue;
      if (v.n !== cur.n) {
        remember(P.plan);
        const plan = readJson(P.plan), i = (plan?.scenes || []).findIndex((s) => s?.id === id);
        if (i < 0) throw new Error(`plan.json 沒有「${id}」這一段了 → 比不了；要加回這段，照 v${v.n}/段落.json 手動放進 plan.json 的 scenes`);
        plan.scenes[i] = readJson(path.join(v.dir, '段落.json'));
        writeAtomic(P.plan, JSON.stringify(plan, null, 2) + '\n');
        for (const f of v.meta.files || []) {
          const src = path.join(v.dir, ...f.store.split('/')), dst = path.join(P.out, ...f.rel.split('/'));
          if (!fs.existsSync(src)) continue;
          remember(dst);
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
        }
        switched = true;
      }
      log(`${id} v${v.n}：沒有預覽，build＋render 這一段（一段約 25 秒）…`);
      if (!S.preview(P, flags, id, v.dir, log)) { ok = false; break; }
      log(`  預覽：${rel(path.join(v.dir, '預覽.mp4'))}`);
      made = true;
    }
  } finally {
    if (switched) {
      restore();
      log(`${id}：換回 v${cur.n}（plan.json、動畫檔都是跑之前的內容），build 一次讓完成影片預覽回到現在的樣子`);
      const r = S.build(P, flags);
      if (!r.ok) log(warn(`換回 v${cur.n} 之後 build 沒過（${r.err}）`, `跑 node shared/template/tools/build.mjs --project ${pj(P)} 看錯誤`));
    }
  }
  if (!ok) return { ok: false, a: A.n, b: B.n, file: null };
  const out = path.join(segDir(P.project, id), `比較-v${A.n}-v${B.n}.mp4`);
  if (made || !fs.existsSync(out)) {
    try { S.clip(path.join(A.dir, '預覽.mp4'), path.join(B.dir, '預覽.mp4'), out, [`v${A.n}`, `v${B.n}`]); } catch (e) { throw new Error(`${e.message} → 兩版的 預覽.mp4 都在（${rel(A.dir)}/、${rel(B.dir)}/），可以分開看`); }
  }
  log(`比較：${path.resolve(out)}（左 v${A.n}、右 v${B.n}，聲音用 v${B.n}）`);
  return { ok: true, a: A.n, b: B.n, file: path.resolve(out) };
}

// ---------- list ----------
export function listAll(P, only = null) {
  const ids = only?.length ? only : segIds(P.project);
  return ids.map((id) => {
    let cur = null;
    try { cur = snapshotOf(P, id).hash; } catch { /* plan.json 沒這段了 */ }
    const vers = listVersions(P.project, id).map((v) => ({ v: v.name, time: v.meta.time || '', kind: v.meta.kind || '存檔', state: v.meta.state || (v.complete ? '完成' : '提案'),
      note: v.meta.note || '', preview: v.preview, current: !!(cur && v.complete && v.meta.hash === cur), dir: rel(v.dir) }));
    let compares = [];
    try { compares = fs.readdirSync(segDir(P.project, id)).filter((f) => /^比較-v\d+-v\d+\.mp4$/.test(f)).sort(); } catch { /* 沒有 */ }
    return { id, versions: vers, compares };
  });
}

// ---------- 回饋輪（begin、finish）：一輪回饋的備份、紀錄、驗證都由工具做，AI 只改 plan.json 和看截圖 ----------
const ROUND_PH = '（versions.mjs finish 會填）';
const RULE_RE = /以後|每次|全部|一律|都要|都改/;
const STOP4 = STOP.final, STOP5 = STOP.editor;
export const ROUND = { maxExtra: 8, maxGlobal: 5, maxErrors: 20, lineCap: 300, sheetCells: 24, sheetGap: 4 };

const feedbackFile = (project, n) => path.join(project, 'work', 'feedback', `r${n}.md`);
const bakFile = (P, n) => path.join(P.out, `plan.json.bak-r${n}`);
const unquote = (s) => String(s ?? '').trim().replace(/^「([\s\S]*)」$/, '$1');
const cellOf = (s) => String(s ?? '').replace(/\|/g, '｜').replace(/\r?\n/g, ' ').trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const fmtT = clock2;
const srtHash = (P) => (fs.existsSync(P.srt) ? hashOf(fs.readFileSync(P.srt, 'utf8')) : null);
const lastStop = (project, stop) => { try { return readStopLog(fs.readFileSync(progressFile(project), 'utf8')).last.get(stop) || null; } catch { return null; } };
const setRound = (project, round) => { const st = readState(project); st.round = round; writeState(project, st); };

// 下一輪回饋的編號：work/feedback/r*.md 和 plan.json.bak-r* 的最大數字 ＋ 1（status.mjs 的「下一輪回饋編號」）
export function nextRound(project) {
  let max = 0;
  const scan = (dir, re) => { try { for (const f of fs.readdirSync(dir)) { const m = f.match(re); if (m) max = Math.max(max, Number(m[1])); } } catch { /* 還沒有資料夾 */ } };
  scan(path.join(project, 'work', 'feedback'), /^r(\d+)\.md$/);
  scan(path.join(project, 'work', 'hyperframes'), /^plan\.json\.bak-r(\d+)$/);
  return max + 1;
}

// 還沒 finish 的回饋輪：{ n, segs, before, say, open, … }；沒有回傳 null（status.mjs、begin 用）
export function openRound(project) {
  const r = readState(project).round;
  return r?.open && fs.existsSync(feedbackFile(project, r.n)) ? r : null;
}

// plan.json 裡 scenes 每一段的原文與行號（不重新排版）：照抄就能當 Edit 的 old_string；長片不用讀整份。
// → [{ id, from, to, text }]；text 從那一行的縮排開始（段前面同一行還有別的東西時從 { 開始）
export function sceneSlices(text) {
  const spans = [];
  let depth = 0, inStr = false, esc = false, strAt = -1, key = null, scenes = false, start = -1, line = 1, startLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') line++;
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') { inStr = false; if (depth === 1) key = text.slice(strAt + 1, i); }
      continue;
    }
    if (c === '"') { inStr = true; strAt = i; }
    else if (c === '{' || c === '[') {
      depth++;
      if (c === '[' && depth === 2 && key === 'scenes') scenes = true;
      else if (c === '{' && scenes && depth === 3) { start = i; startLine = line; }
    } else if (c === '}' || c === ']') {
      if (c === '}' && scenes && depth === 3) spans.push([start, i + 1, startLine, line]);
      if (c === ']' && scenes && depth === 2) break;
      depth--;
    }
  }
  return spans.map(([a, b, from, to]) => {
    const ls = text.lastIndexOf('\n', a) + 1, lead = text.slice(ls, a);
    let id = null;
    try { id = JSON.parse(text.slice(a, b)).id ?? null; } catch { /* 下面找不到這段就會報 */ }
    return { id, from, to, text: text.slice(/^\s*$/.test(lead) ? ls : a, b) };
  });
}

const sectionText = (md, title) => md.split(new RegExp(`^##\\s*${title}\\s*$`, 'm'))[1]?.split(/^##\s/m)[0] ?? '';
// r<N>.md 的一節：fn 拿到去掉頭尾空行的內容，回傳新的內容；沒有這一節就加在最後
function editSection(md, title, fn) {
  const ls = md.split('\n');
  const at = ls.findIndex((l) => new RegExp(`^##\\s*${title}\\s*$`).test(l.trim()));
  if (at < 0) return `${md.replace(/\s+$/, '')}\n\n## ${title}\n\n${fn([]).join('\n')}\n`;
  let end = at + 1;
  while (end < ls.length && !/^##\s/.test(ls[end])) end++;
  const body = ls.slice(at + 1, end);
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body[body.length - 1].trim()) body.pop();
  const next = ls.slice(end);
  return [...ls.slice(0, at + 1), '', ...fn(body), '', ...next].join('\n').replace(/\n+$/, '\n');
}

const ruleWord = (say) => RULE_RE.exec(say)?.[0] ?? null;
const classRows = (say, ids, first) => ids.map((id, i) => `| ${first + i} | ${clip(cellOf(say) || '（同一輪）', 40)} | ${ruleWord(say) ? '可能是規則，請確認' : '個案'} | ${id} | ${ROUND_PH} |`);
function feedbackSkeleton(n, say, ids) {
  const rule = ruleWord(say);
  return [`# 回饋 r${n}（${now()}）`, '', '## 原話', '', `「${say}」`, '', '## 分類', '',
    '| # | 原話節錄 | 規則／個案 | 改哪一段 | 改法 |', '|---|---|---|---|---|', ...classRows(say, ids, 1), '',
    `建議改規則：${rule ? `（原話有「${rule}」：這集照做，這裡寫一條建議，不改 shared/、AGENTS.md）` : '無'}`, '',
    '## 改了哪幾段', '', ROUND_PH, '', '## 驗證', '', ROUND_PH, ''].join('\n');
}
function feedbackAdd(md, say, ids) {
  let out = md;
  if (say) out = editSection(out, '原話', (b) => [...b, `「${say}」`]);
  if (ids.length) out = editSection(out, '分類', (b) => {
    const last = b.reduce((k, l, i) => (l.trim().startsWith('|') ? i : k), -1);
    const nRows = b.filter((l) => /^\|\s*\d+\s*\|/.test(l.trim())).length;
    return [...b.slice(0, last + 1), ...classRows(say, ids, nRows + 1), ...b.slice(last + 1)];
  });
  return out;
}

function updateRoundRow(project, name, segs, backup, file) {
  const f = progressFile(project);
  let text = null;
  try { text = fs.readFileSync(f, 'utf8'); } catch { /* 下面 appendRound 會建 */ }
  if (text != null) {
    const nl = text.includes('\r\n') ? '\r\n' : '\n', ls = text.split(/\r?\n/);
    const i = ls.findIndex((l) => new RegExp(`^\\|\\s*${name}\\s*\\|`).test(l.trim()));
    if (i >= 0) {
      const c = ls[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
      c[3] = segs.join('、');
      ls[i] = `| ${c.join(' | ')} |`;
      writeAtomic(f, ls.join(nl));   // 剪輯台、status.mjs 會同時讀寫製作進度：寫完才換上
      return;
    }
  }
  appendRound(project, { round: name, file, segs: segs.join('、'), backup });
}

// 開一輪（或接著這一輪）：備份、存改之前的版本、r<N>.md、製作進度.md；回傳要印的東西（只有這幾段）
export function beginRound(P, flags, idsIn, sayRaw, log = console.log) {
  const project = P.project;
  // begin --requests：照剪輯台修改單改。段號、版本從修改單讀，剪輯台那幾段由這裡標「生成中」（AI 不用另外跑 editor.mjs --requests-state）
  const rq = flags.requests ? requestsInfo(project) : null;
  if (flags.requests && !rq?.ids.length) throw new Error(`${rq ? '剪輯台修改單裡沒有段' : '還沒有剪輯台修改單（work/feedback/editor-requests.md）'} → 請使用者在剪輯台「修改單」選段後按「複製給 AI」；不是照修改單改就拿掉 --requests`);
  const say = unquote(sayRaw) || (rq ? '照修改單改' : '');
  let ids = [...idsIn];
  const text = (() => { try { return fs.readFileSync(P.plan, 'utf8'); } catch { return null; } })();
  if (text == null) throw new Error(`讀不到 ${rel(P.plan)} → 回饋輪是停點 ④ 之後用的；plan.json 還沒寫就先照 status.mjs 的下一步做`);
  let plan;
  try { plan = JSON.parse(text); } catch (e) { throw new Error(`${rel(P.plan)} 不是合法的 JSON（${e.message}）→ 先跑 node shared/template/tools/build.mjs --project ${pj(P)} --check 看哪裡壞了`); }
  const have = (plan.scenes || []).map((s) => s?.id).filter(Boolean);
  if (rq && !ids.length) {
    ids = rq.ids.filter((id) => have.includes(id));
    if (!ids.length) throw new Error(`修改單的段（${rq.ids.join('、')}）plan.json 都沒有（要新增的段）→ 加 --seg <它前一段的 id>，只用來開這一輪`);
  }
  const bad = ids.filter((id) => !have.includes(id));
  if (bad.length) throw new Error(`plan.json 沒有${bad.map((x) => `「${x}」`).join('、')}這一段 → 段 id 照 build.mjs --check 報告的第一欄（這份 plan.json 共 ${have.length} 段：${clip(have.slice(0, 12).join('、'), 90)}${have.length > 12 ? '…' : ''}）；「1:10 那段」先對照報告的起–迄找 id`);
  const cur = openRound(project);
  if (!cur && !say) throw new Error(`開新的一輪要記使用者原話 → 加 --say "<使用者原話>"`);
  const n = cur ? cur.n : nextRound(project), name = `r${n}`;
  const bak = bakFile(P, n);
  if (!fs.existsSync(bak)) fs.copyFileSync(P.plan, bak);
  const fresh = ids.filter((id) => !cur?.segs.includes(id));
  const before = { ...(cur?.before || {}) }, kept = [];
  for (const id of fresh) {
    const vers = listVersions(project, id), pend = pendingOf(vers);
    if (pend) {
      // versions.mjs new 已經把現在的樣子存好了：提案卡著，這裡不能也不用再存
      before[id] = vers.filter((v) => v.complete).at(-1)?.n ?? null;
      log(`${id}：有還沒做完的提案 v${pend.n}，改之前的樣子是 v${before[id] ?? '?'}`);
    } else before[id] = saveSeg(P, flags, id, log, { kind: `${name} 改之前`, note: say || null }).n;
    kept.push(id);
  }
  resetRuns(P, fresh);   // 這一輪要改的段：改的人從第 1 次 audit 算起
  // r<N>.md（「改了哪幾段」finish 才寫：剪輯台看到那一列就標「已改」）
  const file = feedbackFile(project, n), fileRel = `work/feedback/${name}.md`, bakRel = `work/hyperframes/${path.basename(bak)}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (cur && fs.existsSync(file)) fs.writeFileSync(file, feedbackAdd(fs.readFileSync(file, 'utf8'), say, fresh));
  else fs.writeFileSync(file, feedbackSkeleton(n, say, ids));
  const segs = [...(cur?.segs || []), ...fresh];
  if (cur) updateRoundRow(project, name, segs, bakRel, fileRel);
  else appendRound(project, { round: name, file: fileRel, segs: segs.join('、'), backup: bakRel });
  // 使用者回覆了停點 ④／⑤：記下來，等待時間才算得準（finish 再記 ④ 待回覆）
  if (say) {
    const s4 = lastStop(project, STOP4)?.state, s5 = lastStop(project, STOP5)?.state, waiting = (x) => ['待回覆', '修改後重停'].includes(x);
    if (s5 && waiting(s5)) appendStop(project, { stop: STOP5, state: '通過', said: say, back: fileRel });
    if (s4 === '待回覆' || (cur == null && s4 === '修改後重停')) appendStop(project, { stop: STOP4, state: '修改後重停', said: say, back: fileRel });
  }
  const requests = rq ? { revision: rq.revision, ids: rq.ids } : cur?.requests ?? null;
  setRound(project, { n, segs, before, say: [...(cur?.say || []), ...(say ? [say] : [])], open: true, time: cur?.time || now(), srt: cur?.srt ?? srtHash(P), rows: cur?.rows || {}, ...(requests ? { requests } : {}) });
  const all = sceneSlices(text);
  const blocks = ids.map((id) => {
    const s = all.find((x) => x.id === id), seg = plan.scenes.find((x) => x?.id === id);
    return { id, from: s?.from ?? null, to: s?.to ?? null, text: s?.text ?? JSON.stringify(seg, null, 2), seg, x: seg?.type === 'custom' && seg.src ? `work/hyperframes/${seg.src}` : null, v: before[id] ?? null };
  });
  const rule = ruleWord(say);
  // 剪輯台：修改單上每一段（含 plan.json 沒有的 t<秒>）標「生成中」；finish 再標已改完／失敗
  let rqOut = null;
  if (rq) {
    const [code, res] = doRequestsStatus({ P }, { state: 'generating', revision: rq.revision, ids: rq.ids, round: name });
    rqOut = { ids: rq.ids, missing: rq.ids.filter((id) => !have.includes(id)), marked: code === 200, message: code === 200 ? null : res?.message ?? null };
  }
  return { round: name, n, continued: !!cur, added: kept, segs, file: fileRel, backup: bakRel, say, rule, blocks, requests: rqOut };
}

function printBegin(P, r, log = console.log) {
  log(`回饋 ${r.round}${r.continued ? '（接著同一輪）' : ''}：${r.segs.join('、')}`);
  log(`備份：${r.backup}｜紀錄：${r.file}、work/製作進度.md`);
  if (r.rule) log(`⚠ 原話有「${r.rule}」：可能是規則 → 這集照做，${r.file}「建議改規則」寫一條，不改 shared/、AGENTS.md`);
  if (r.requests?.marked) log(`剪輯台修改單：${r.requests.ids.join('、')} 標成「生成中」（finish 會自己標已改完／失敗，不用跑 editor.mjs --requests-state）`);
  else if (r.requests) log(warn(`剪輯台修改單沒標成「生成中」：${r.requests.message || '不明原因'}`, '停下來重讀 work/feedback/editor-requests.md，問使用者要不要照新的改'));
  if (r.requests?.missing.length) log(warn(`修改單的 ${r.requests.missing.join('、')} plan.json 沒有`, `要新增的段（修改單寫「這裡現在沒有段落」）新增好在 ${r.file}「改了哪幾段」寫一列「- ${r.requests.missing[0]}：新增 <段 id>，<做了什麼>」再 finish；寫「plan.json 裡找不到這段」的不做，回報時問使用者是哪一段`));
  for (const b of r.blocks) {
    log('');
    log(`${b.id}（${rel(P.plan)}${b.from ? ` 第 ${b.from}–${b.to} 行` : ''}${b.x ? `；x 檔 ${b.x}` : ''}）`);
    log(b.text);
  }
  log('');
  for (const l of next('只改上面這幾段（情境動畫改 x 檔），改好跑下一行（build、audit、存版本、紀錄、停點都一次做完）', finishCmd(P))) log(l);
}

// 和 plan.json.bak-r<N> 比：哪幾段變了、第一層哪幾個欄位變了
export function planDiff(a, b) {
  const by = (p) => new Map((p?.scenes || []).filter((s) => s?.id).map((s) => [s.id, JSON.stringify(s)]));
  const A = by(a), B = by(b);
  const top = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => k !== 'scenes' && JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
  return { changed: [...B.keys()].filter((id) => A.has(id) && A.get(id) !== B.get(id)), added: [...B.keys()].filter((id) => !A.has(id)), removed: [...A.keys()].filter((id) => !B.has(id)), top };
}

// 這段改了什麼（寫進 r<N>.md）：slots.key「舊」→「新」、css.left 無 → "-120px"；最多 4 處
export function describeChange(a, b, max = 4) {
  const out = [];
  const val = (v) => (v === undefined ? '無' : typeof v === 'string' ? `「${clip(v.replace(/\s+/g, ' '), 24)}」` : v && typeof v === 'object' ? (Array.isArray(v) ? `${v.length} 項` : '{…}') : String(v));
  const walk = (x, y, at) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    // 整個物件是新加的（css、beats）：寫到裡面的欄位，比「css 無 → {…}」看得懂
    const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
    if (x === undefined && plain(y)) { walk({}, y, at); return; }
    if (y === undefined && plain(x)) { walk(x, {}, at); return; }
    const objs = x && y && typeof x === 'object' && typeof y === 'object' && Array.isArray(x) === Array.isArray(y);
    if (objs) {
      if (Array.isArray(x) && x.length !== y.length) { out.push(`${at}：${x.length} 項 → ${y.length} 項`); return; }
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], Array.isArray(x) ? `${at}[${k}]` : at ? `${at}.${k}` : k);
      return;
    }
    out.push(`${at} ${val(x)} → ${val(y)}`);
  };
  walk(a, b, '');
  return out.length > max ? `${out.slice(0, max).join('；')}；還有 ${out.length - max} 處` : out.join('；');
}

// build 的輸出 → 只留 ✖、⚠、六行摘要。長片別段的 ⚠ 只算數量（這輪沒改到，印了只會蓋掉要看的）
export function digestBuild(text, ids, allIds = []) {
  const mine = new Set(ids), all = new Set(allIds), errors = [], warns = [], global = [], summary = [];
  let other = 0;
  const seen = new Set();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || seen.has(l)) continue;
    if (l.startsWith('✖')) { seen.add(l); errors.push(clip(l, ROUND.lineCap)); continue; }
    if (l.startsWith('⚠')) {
      seen.add(l);
      const toks = l.match(/[A-Za-z0-9_-]+/g) || [];
      if (toks.some((t) => mine.has(t))) warns.push(clip(l, ROUND.lineCap));
      else if (toks.some((t) => all.has(t))) other++;
      else global.push(clip(l, ROUND.lineCap));
      continue;
    }
    if (isSummaryLine(l)) { seen.add(l); summary.push(l); }
  }
  return { errors, warns, global: global.slice(0, ROUND.maxGlobal), other: other + Math.max(0, global.length - ROUND.maxGlobal), summary };
}

export function digestAudit(r, ids = []) {
  const errors = (r?.errors || []).map((e) => `✖ ${e}`), warns = (r?.warnings || []).map((w) => `⚠ ${w}`);
  for (const f of r?.findings || []) (f.level === 'error' ? errors : warns).push(clip(formatFinding(f), ROUND.lineCap));
  const shots = (r?.shots || []).map((f) => {
    const base = path.basename(f), at = base.lastIndexOf('-');
    return { id: at > 0 ? base.slice(0, at) : null, file: path.resolve(f) };
  }).filter((s) => !ids.length || ids.includes(s.id));
  return { errors, warns, shots, sheets: (r?.sheets || []).map((x) => path.resolve(x.file ?? x)) };
}

// 每段留最後一張（完成態），有位置再平均補；總數不超過 max
export function pickShots(shots, max = ROUND.sheetCells) {
  const by = new Map();
  for (const s of shots) { if (!by.has(s.id)) by.set(s.id, []); by.get(s.id).push(s); }
  const per = Math.max(1, Math.floor(max / Math.max(1, by.size)));
  const out = [];
  for (const list of by.values()) {
    const k = Math.min(per, list.length);
    for (let i = 1; i <= k; i++) out.push(list[Math.ceil((i * list.length) / k) - 1]);
  }
  return out.slice(0, max);
}

// 截圖拼成一張（audit 的 jpg、snapshot 的 png 都可以）
export function shotSheet(files, out, portrait = false) {
  const n = files.length, cols = portrait ? 6 : 4, w = portrait ? 240 : 480, h = portrait ? 426 : 270, g = ROUND.sheetGap;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const args = ['-y', '-v', 'error'];
  for (const f of files) args.push('-i', f);
  const scaled = files.map((_, i) => `[${i}:v]scale=${w}:${h},setsar=1[c${i}]`).join(';');
  const layout = files.map((_, i) => `${(i % cols) * (w + g)}_${Math.floor(i / cols) * (h + g)}`).join('|');
  const fc = n === 1 ? `[0:v]scale=${w}:${h},setsar=1` : `${scaled};${files.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${n}:layout=${layout}:fill=white`;
  const r = run('ffmpeg', [...args, '-filter_complex', fc, '-frames:v', '1', '-q:v', '3', out]);
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`拼不出 ${path.basename(out)}：${tail(r.stderr, 200)}`);
  return out;
}

// 好幾段的截圖拼成一張、每格標段號與時間（要 Chrome）；檔名是 <段 id>-<秒>.jpg|png
export function labeledSheet(P, shots, out, portrait = false, title = '') {
  const chrome = findChrome({});
  const cols = portrait ? 6 : 4, tw = Math.floor((1920 - (cols - 1) * 8) / cols), th = Math.round(portrait ? (tw * 16) / 9 : (tw * 9) / 16);
  const cells = shots.map((x) => {
    const m = /-(\d+(?:\.\d+)?)\.\w+$/.exec(path.basename(x.file));
    return { src: pathToFileURL(x.file).href, time: m ? fmtT(Number(m[1])) : null, id: null, text: x.id };
  });
  const page = sheetPage({ fontsCss: pathToFileURL(path.join(P.templateDir, 'kit', 'fonts.css')).href, title, cols, tile: [tw, th], label: 34, fontSize: 20, cells });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const html = `${out}.html`, png = `${out}.png`;
  fs.writeFileSync(html, page.html);
  try {
    htmlShot({ chrome, file: html, out: png, width: page.width, height: page.height });
    const r = run('ffmpeg', ['-y', '-v', 'error', '-i', png, '-frames:v', '1', '-q:v', '3', out]);
    if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`拼不出 ${path.basename(out)}：${tail(r.stderr, 200)}`);
  } finally { fs.rmSync(html, { force: true }); fs.rmSync(png, { force: true }); }
  return out;
}

// 真的跑工具的步驟；測試可以換掉（finishRound 的 steps）
const REAL_STEPS = {
  build(P, flags) {
    const extra = flags.template ? ['--template', path.resolve(flags.template)] : [];
    // --table：長片預設把 ⚠ 併起來、最多 40 行；這裡要全部，才挑得出改到的段（digestBuild）
    const r = buildSync(P, ['--table'], extra);   // 底片還在編碼：接著等
    return { ok: r.status === 0, out: `${r.stdout || ''}\n${r.stderr || ''}` };
  },
  // 032：行程內的 checkProject（和 build --check --json 同一份；出錯也是 JSON、ok: false）
  check(P, flags) {
    return checkProject(P.project, flags.template ? { template: path.resolve(flags.template) } : {});
  },
  audit(P, flags, ids) {
    const extra = flags.template ? ['--template', path.resolve(flags.template)] : [];
    const r = spawnSync(process.execPath, [path.join(HERE, 'audit.mjs'), '--project', P.project, '--only', ids.join(','), '--shots', '--sheet', '--json', ...extra], { encoding: 'utf8', maxBuffer: 1 << 28 });
    let j = null;
    try { j = JSON.parse(r.stdout); } catch { /* 下面處理 */ }
    return j || { ok: false, errors: [`audit 沒有輸出（${tail(r.stderr || r.stdout, 200)}）→ 跑 node shared/template/tools/audit.mjs --project ${pj(P)} --only ${ids.join(',')} 看錯誤`], warnings: [], findings: [] };
  },
  // 錄影段 audit 不量：截那段中間那一格（不跑全片 snapshot）
  snapshot(P, list) {
    const tmp = '.round-shots', dir = path.join(P.project, 'work', 'audit-shots');
    fs.rmSync(path.join(P.out, tmp), { recursive: true, force: true });
    const r = spawnSync(process.execPath, hfArgs(['snapshot', '--at', list.map((x) => x.t).join(','), '--no-end', '--keep', '-o', tmp, '--json']), { cwd: P.out, encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 28 });
    let j = null;
    try { j = JSON.parse(String(r.stdout).slice(String(r.stdout).indexOf('{'))); } catch { /* 下面處理 */ }
    if (r.status !== 0 || !j?.frames) throw new Error(`npx hyperframes snapshot 失敗：${tail(r.stderr || r.stdout, 300)} → 先跑 (cd ${pj(P)}/work/hyperframes && npx hyperframes check) 看錯誤`);
    fs.mkdirSync(dir, { recursive: true });
    const out = list.map((x) => {
      const f = j.frames.find((z) => Math.abs(Number(z.time) - x.t) < 0.0005);
      if (!f || !fs.existsSync(path.resolve(P.out, f.path))) throw new Error(`snapshot 少了 ${x.id}（${fmtT(x.t)}）那一張 → 再跑一次 finish；還是少就回報這個時間`);
      const to = path.join(dir, `${x.id}-${x.t.toFixed(2)}.png`);
      fs.copyFileSync(path.resolve(P.out, f.path), to);
      return { id: x.id, file: to };
    });
    fs.rmSync(path.join(P.out, tmp), { recursive: true, force: true });
    return out;
  },
  // 要看的那一張：有 Chrome 就每格標段號與時間，沒有就 ffmpeg 直接拼
  sheet(P, shots, out, portrait, title) {
    try { return labeledSheet(P, shots, out, portrait, title); } catch { return shotSheet(shots.map((x) => x.file), out, portrait); }
  },
  // 完成影片預覽的網址（剪輯台沒開就在背景開；editor.mjs --json 直接回網址，不比對它印的字）
  editor(P, flags) {
    return editorUrlsSync(P.project, { template: flags.template ? path.resolve(flags.template) : undefined })?.final ?? null;
  },
  // 使用者看預覽的時候先把整支 render 起來（低優先權、立刻返回；同 build --review）：說「輸出」就不用再等一個片長
  prerender(P, flags) {
    const f = path.join(HERE, 'deliver.mjs');
    const extra = flags.template ? ['--template', path.resolve(flags.template)] : [];
    spawnSync(process.execPath, [f, '--project', P.project, '--prerender', ...extra], { encoding: 'utf8', timeout: 15000 });
  },
};

// finish：驗證這一輪、存改之後的版本、寫紀錄、記停點 ④。有 ✖ 就停（什麼都不記），改完再跑一次
// 連續沒過的次數由工具數（lib/tries.mjs）：到上限在最後印「→ 停手」，AI 不用自己數工具呼叫
export function finishRound(P, flags = {}, log = console.log, steps = {}) {
  let r;
  try { r = finishOnce(P, flags, log, steps); } catch (e) {
    const t = mainTry(P.project, 'finish', false);
    if (t.stop) e.message += `\n${stopHere(t.n, 'versions.mjs finish ')}`;
    throw e;
  }
  const t = mainTry(P.project, 'finish', r.ok);
  if (t.stop) { r.halt = stopHere(t.n, 'versions.mjs finish '); log(r.halt); }
  return r;
}

// begin --requests 開的這一輪：修改單上每一段在剪輯台標「已改完」或「失敗」（AI 不用另外跑 editor.mjs --requests-state）
//   有改到（或拿掉）＝已改完；plan.json 沒有的段（要新增的 t<秒>）看 r<N>.md「改了哪幾段」有沒有那一列（不是「沒做」開頭）；
//   沒改到＝失敗，理由取 AI 在 r<N>.md 寫的那一列，沒有就寫「這段沒有改動」
const rowMap = (sec) => new Map([...String(sec).matchAll(/^- (\S+?)：(.+)$/gm)].map((m) => [m[1], m[2].trim()]));
function reportRequests(P, round, name, { auto, removed, aiRows, rows }) {
  const q = requestsInfo(P.project);
  if (!q || q.revision !== round.requests.revision) return { warn: warn('剪輯台修改單在這輪開始之後重新複製過（或被清空），剪輯台的狀態沒有改', '停下來重讀 work/feedback/editor-requests.md，問使用者要不要照新的改') };
  const done = [], failed = [];
  for (const id of round.requests.ids.filter((x) => q.ids.includes(x))) {
    let ok, msg;
    if (removed.includes(id)) { ok = true; msg = '這段從 plan.json 拿掉了'; }
    else if (id in auto) { ok = auto[id] != null; msg = ok ? rows.get(id) ?? auto[id] : aiRows.get(id) ?? '這段沒有改動'; }
    else { const row = rows.get(id); ok = !!row && !/^沒(做|有改)/.test(row); msg = row ?? '這段沒有改動'; }
    doRequestsStatus({ P }, { state: ok ? 'done' : 'failed', revision: q.revision, ids: [id], message: clip(msg, 300), round: name });
    (ok ? done : failed).push({ id, msg });
  }
  const line = `剪輯台修改單：${done.length ? `已改完 ${done.map((x) => x.id).join('、')}` : '沒有已改完的段'}${failed.length ? `；失敗 ${failed.map((x) => `${x.id}（${clip(x.msg, 30)}）`).join('、')}` : ''}`;
  return { done, failed, line };
}

function finishOnce(P, flags = {}, log = console.log, steps = {}) {
  const S = { ...REAL_STEPS, ...steps }, project = P.project;
  const round = readState(project).round;
  const beginCmd = `${TOOL} begin --project ${pj(P)} --seg <段 id> --say "<使用者原話>"`;
  if (!round || !fs.existsSync(feedbackFile(project, round.n))) throw new Error(`還沒有開回饋輪 → 先跑 ${beginCmd}`);
  const name = `r${round.n}`, fileRel = `work/feedback/${name}.md`, file = feedbackFile(project, round.n);
  if (!round.open && lastStop(project, STOP4)?.state !== '待回覆') throw new Error(`${name} 已經 finish 過，使用者也回覆了 → 新的修改開下一輪：${beginCmd}`);
  const plan = readJson(P.plan);
  if (!plan) throw new Error(`讀不到 ${rel(P.plan)} → 先跑 node shared/template/tools/build.mjs --project ${pj(P)} --check 看 plan.json 哪裡壞了`);
  const bak = readJson(bakFile(P, round.n));
  const notes = [];
  if (!bak) notes.push(`⚠ 找不到 ${path.basename(bakFile(P, round.n))}，比不出第一層和別段有沒有改`);
  const diff = planDiff(bak ?? plan, plan);
  const inPlan = new Set((plan.scenes || []).map((s) => s?.id));
  const removed = [...new Set([...round.segs.filter((id) => !inPlan.has(id)), ...diff.removed])];
  let extra = [...diff.changed, ...diff.added].filter((id) => !round.segs.includes(id));
  if (extra.length > ROUND.maxExtra) {
    notes.push(`⚠ 另外 ${extra.length} 段和備份不一樣（多半是重對句號）：${extra.slice(0, 6).join('、')}… → 這輪不驗證、不存版本；真的改了就先跑 begin --seg 指名`);
    extra = [];
  } else if (extra.length) notes.push(`⚠ 這輪也改到 ${extra.join('、')}（begin 沒寫）：一起驗證、存版本；改之前的樣子只在 ${path.basename(bakFile(P, round.n))}`);
  const ids = [...round.segs.filter((id) => inPlan.has(id)), ...extra];
  const info = ids.map((id) => {
    const snap = snapshotOf(P, id), vers = listVersions(project, id);
    const before = vers.find((v) => v.complete && v.n === round.before?.[id]) || null;
    return { id, snap, vers, before, same: !!before && before.meta.hash === snap.hash };
  });
  const srtChanged = !!round.srt && srtHash(P) !== round.srt;
  const report = { ok: false, round: name, segs: ids, errors: [], warnings: notes, summary: [], versions: [], shot: null, shots: [], stopLine: null, file: fileRel };
  const verifyNote = (lines) => { try { fs.writeFileSync(file, editSection(fs.readFileSync(file, 'utf8'), '驗證', () => lines)); } catch { /* r<N>.md 被刪了：下面照樣回報 */ } };
  const fail = (errors) => {
    report.errors = errors;
    log(`回饋 ${name}：${ids.join('、') || '（沒有段）'}`);
    for (const l of notes) log(l);
    for (const e of errors.slice(0, ROUND.maxErrors)) log(e);
    if (errors.length > ROUND.maxErrors) log(`（還有 ${errors.length - ROUND.maxErrors} 個 ✖ → 跑 node shared/template/tools/build.mjs --project ${pj(P)} --check 看全部）`);
    verifyNote([`- 上次 finish（${now()}）：✖ ${errors.length}，還沒過（改好再跑一次 finish）`]);
    for (const l of next('照 → 改好（這輪的備份和紀錄都還在），再跑下一行', finishCmd(P))) log(l);
    return report;
  };
  const same = info.filter((s) => s.same).map((s) => s.id);
  const anyChange = info.some((s) => !s.same) || diff.top.length || diff.added.length || removed.length || srtChanged;
  const blocks = info.map((s) => proposalBlock(P, s.id, s.vers, s.snap)).filter(Boolean).map((m) => `✖ ${m}`);
  if (blocks.length) return fail(blocks);
  if (!anyChange && !flags['no-change']) return fail([`✖ 這輪的段（${ids.join('、')}）都和改之前一樣 → 還沒改就先改 plan.json 或 x 檔再跑一次；確定不用改就加 --no-change（照樣記錄、停在停點 ④）`]);
  if (anyChange && same.length) notes.push(`⚠ ${same.join('、')} 和改之前一樣：要改的話還沒改到`);

  // 1. build
  const b = S.build(P, flags);
  const allIds = (plan.scenes || []).map((s) => s?.id).filter(Boolean);
  const dg = digestBuild(b.out, ids, allIds);
  report.summary = dg.summary;
  if (!b.ok || dg.errors.length) return fail(dg.errors.length ? dg.errors : [`✖ build 失敗：${tail(b.out, 300)} → 跑 node shared/template/tools/build.mjs --project ${pj(P)} 看錯誤`]);
  // 032 B6：改到的段，storyboard.md 的動畫分鏡從正本重產（存版本的 分鏡.md 才是現在的拍）；
  // 照 plan.json 產生的段，提案確認的拍（promised）和現在 slots 產生的不同 → ⚠（以前靠 audit 拿 storyboard.md 那張表比出來）
  const lib = loadLib(P.templateDir, P.project);
  const rf = refreshSegs(P, plan, ids, lib);
  if (rf.line) notes.push(rf.line);
  for (const s of info) {
    const pv = s.vers.find((v) => !v.complete && v.meta.state === '已確認' && Array.isArray(v.meta.promised));
    const seg = (plan.scenes || []).find((x) => x?.id === s.id);
    if (!pv || !seg) continue;
    const bs = beatSourceOf(P, seg, { lib, seed: false });
    if (bs.owner !== 'plan') continue;
    const cur = refList(bs.sheet);
    if (JSON.stringify(cur) !== JSON.stringify(pv.meta.promised)) {
      notes.push(warn(`${s.id}：v${pv.n} 提案確認的拍是 ${pv.meta.promised.join('、') || '—'}，現在 plan.json 產生的是 ${cur.join('、') || '—'}`, `照提案改 slots；模板做不到就交給子代理手改動畫檔（拍點會移到 work/designs/${s.id}.md）`));
    }
  }
  const chk = S.check(P, flags);
  if (chk.ok === false) return fail((chk.errors || []).map((e) => `✖ ${e}`));
  const items = new Map((chk.items || []).map((x) => [x.id, x]));
  const cutAway = ids.filter((id) => !items.has(id));
  if (cutAway.length) notes.push(`⚠ ${cutAway.join('、')} 整段被 edit.cuts 剪掉了，沒有畫面可以看`);
  const media = ids.filter((id) => items.get(id)?.type === 'media'), toAudit = ids.filter((id) => items.has(id) && !media.includes(id));

  // 2. audit（只量改到的段）；錄影段 snapshot 那段中間
  const au = toAudit.length ? digestAudit(S.audit(P, flags, toAudit), toAudit) : { errors: [], warns: [], shots: [], sheets: [] };
  if (au.errors.length) return fail(au.errors);
  let snaps = [];
  if (media.length) {
    try { snaps = S.snapshot(P, media.map((id) => { const o = items.get(id).out; return { id, t: r3((o.start + o.end) / 2) }; })); } catch (e) { return fail([`✖ ${e.message}`]); }
  }

  // 3. 改之後的版本
  const savedLog = [], joined = (round.say || []).join('；') || null;
  const sheetOf = (id) => au.sheets.find((f) => path.basename(f) === `sheet-${id}.jpg`) || null;
  const saved = new Map(info.map((s) => [s.id, saveSeg(P, flags, s.id, (l) => savedLog.push(l), { kind: `${name} 改之後`, note: joined, still: sheetOf(s.id) })]));
  for (const l of savedLog) if (l.startsWith('⚠')) notes.push(l);

  // 4. 要看的那張截圖
  const portrait = chk.format === 'portrait';
  const order = (s) => ids.indexOf(s.id);
  const allShots = [...au.shots, ...snaps].sort((x, y) => order(x) - order(y));
  // 只有一段：audit 已經拼好（每格標時間與取樣種類）；好幾段：拼成一張，不用開好幾張圖
  let shot = !snaps.length && au.sheets.length === 1 && fs.existsSync(au.sheets[0]) ? au.sheets[0] : null;
  const picked = shot ? allShots : pickShots(allShots);
  if (!shot && picked.length) {
    try { shot = S.sheet(P, picked, path.join(project, 'work', 'audit-shots', `${name}-sheet.jpg`), portrait, `回饋 ${name}｜${ids.join('、')}`); } catch (e) { notes.push(`⚠ ${e.message} → 下面的截圖一張一張看`); }
  }
  const counts = [...new Set(picked.map((s) => s.id))].map((id) => `${id} ${picked.filter((s) => s.id === id).length} 張`).join('、');
  const looseShots = shot ? [] : picked.map((s) => rel(s.file));

  // 5. r<N>.md：分類的改法、改了哪幾段、驗證
  const auto = {}, verText = {};
  for (const s of info) {
    const v = saved.get(s.id);
    if (s.same) { auto[s.id] = null; continue; }
    const beforeSeg = s.before ? readJson(path.join(s.before.dir, '段落.json')) : bak?.scenes?.find((x) => x?.id === s.id) ?? null;
    const parts = [];
    const d = beforeSeg ? describeChange(beforeSeg, s.snap.seg) : '新的段';
    if (d) parts.push(d);
    const changedFiles = s.snap.files.filter((f) => !s.before || (() => { try { return fs.readFileSync(path.join(s.before.dir, ...f.store.split('/')), 'utf8') !== f.content; } catch { return true; } })()).map((f) => path.basename(f.rel));
    if (changedFiles.length) parts.push(`${changedFiles.join('、')} 改了`);
    auto[s.id] = parts.join('；') || '改了';
    verText[s.id] = `${s.before ? `v${s.before.n} → ` : '→ '}v${v.n}${v.cmp ? `，比較：${rel(v.cmp)}` : ''}`;
  }
  const prevAuto = round.rows || {};
  const stripVer = (t) => t.replace(/（(?:v\d+ )?→ v\d+[^）]*）$/, '');
  let md = fs.readFileSync(file, 'utf8');
  const aiRows = rowMap(sectionText(md, '改了哪幾段'));   // 下面會換掉沒改的段那一列：AI 先寫的理由（「沒做，…」）留給剪輯台的失敗理由
  const classed =new Set([...sectionText(md, '分類').matchAll(/^\|\s*\d+\s*\|[^|]*\|[^|]*\|\s*(\S+?)\s*\|/gm)].map((m) => m[1]));
  md = feedbackAdd(md, '', [...ids, ...removed].filter((id) => !classed.has(id)));   // begin 沒寫的段也要有一列
  md = editSection(md, '分類', (body) => body.map((l) => {
    if (!l.trim().startsWith('|')) return l;
    const c = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
    const isRemoved = removed.includes(c[3]);
    if (c.length < 5 || !(c[3] in auto || isRemoved)) return l;
    // 只換工具寫的：範本那一行、上次自動填的；AI 自己寫的改法不蓋
    if (![ROUND_PH, '沒有改', cellOf(prevAuto[c[3]] ?? ROUND_PH)].includes(c[4])) return l;
    c[4] = isRemoved ? '這段從 plan.json 拿掉了' : cellOf(auto[c[3]] ?? '沒有改');
    return `| ${c.join(' | ')} |`;
  }));
  md = editSection(md, '改了哪幾段', (body) => {
    const lines = body.filter((l) => l.trim() !== ROUND_PH);
    const put = (id, fresh, keepText) => {
      const i = lines.findIndex((l) => new RegExp(`^- ${esc(id)}(：| )`).test(l));
      if (i < 0) { lines.push(fresh); return; }
      const m = lines[i].match(/^- \S+?：(.*)$/), old = m ? stripVer(m[1]) : null;
      lines[i] = keepText && old != null && old !== prevAuto[id] ? `- ${id}：${old}（${keepText}）` : fresh;
    };
    for (const s of info) {
      // 沒改到：AI 先寫了「- <段>：沒做，<理由>」就留著（剪輯台修改單的失敗理由），沒寫才由工具填
      if (auto[s.id] == null) { if (!/^沒做/.test(aiRows.get(s.id) ?? '')) put(s.id, `- ${s.id} 沒有改（和改之前一樣）`, null); }
      else put(s.id, `- ${s.id}：${auto[s.id]}（${verText[s.id]}）`, verText[s.id]);
    }
    for (const id of removed) put(id, `- ${id}：這段從 plan.json 拿掉了`, null);
    if (diff.top.length) put('全片', `- 全片：plan.json 第一層 ${diff.top.join('、')} 改了`, null);
    if (srtChanged) put('字幕', '- 字幕：work/rough.srt 改了', null);
    return lines;
  });
  const nW = dg.warns.length + dg.global.length + dg.other, nAuW = au.warns.length;
  md = editSection(md, '驗證', () => [
    `- build（${now()}）：✖ 0、⚠ ${nW}${dg.other ? `（其中 ${dg.other} 則是沒改到的段）` : ''}`,
    ...(toAudit.length ? [`- audit --only ${toAudit.join(',')}：✖ 0、⚠ ${nAuW}`] : []),
    ...(media.length ? [`- 錄影段 snapshot：${media.join('、')}`] : []),
    ...(shot ? [`- 截圖：${rel(shot)}（${counts}）`] : looseShots.map((f) => `- 截圖：${f}`)),
  ]);
  fs.writeFileSync(file, md);

  // 6. 停點 ④ 待回覆（上一列已經是待回覆就不重複記：finish 之後自己看圖再改的情況）
  if (lastStop(project, STOP4)?.state !== '待回覆') appendStop(project, { stop: STOP4, state: '待回覆', back: fileRel });
  setRound(project, { ...round, segs: ids, open: false, finished: now(), rows: Object.fromEntries(Object.entries(auto).filter(([, v]) => v != null)) });
  const url = S.editor(P, flags);
  if (!url) notes.push(`⚠ 剪輯台沒開起來，拿不到完成影片預覽網址 → 跑 node shared/template/tools/editor.mjs --project ${pj(P)}，把它印的「完成影片預覽：」網址填進停點那一行`);
  const stopLine = stopLines.final(url || '<完成影片預覽網址>');
  if (flags.prerender) S.prerender(P, flags);
  const rq = round.requests ? reportRequests(P, round, name, { auto, removed, aiRows, rows: rowMap(sectionText(md, '改了哪幾段')) }) : null;
  if (rq?.warn) notes.push(rq.warn);

  // 印
  report.ok = true;
  Object.assign(report, { warnings: [...notes, ...dg.warns, ...dg.global, ...au.warns], stopLine, shot: shot ? rel(shot) : null, shots: looseShots,
    versions: info.map((s) => ({ id: s.id, before: s.before?.n ?? null, after: saved.get(s.id).n, compare: saved.get(s.id).cmp ? rel(saved.get(s.id).cmp) : null })),
    ...(rq && !rq.warn ? { requests: { done: rq.done.map((x) => x.id), failed: rq.failed } } : {}) });
  log(`回饋 ${name}：${ids.join('、')}${removed.length ? `；拿掉 ${removed.join('、')}` : ''}`);
  for (const l of notes) log(l);
  log(`build：✖ 0、⚠ ${dg.warns.length + dg.global.length}${dg.other ? `（另外 ${dg.other} 則是沒改到的段，這輪不用管；要看全部跑 build.mjs --check）` : ''}`);
  for (const l of [...dg.warns, ...dg.global]) log(l);
  for (const l of dg.summary) log(l);
  if (toAudit.length) log(`audit --only ${toAudit.join(',')}：✖ 0、⚠ ${au.warns.length}`);
  for (const l of au.warns) log(l);
  if (media.length) log(`錄影段（audit 不量）：${media.map((id) => { const o = items.get(id).out; return `${id} 截 ${fmtT((o.start + o.end) / 2)}`; }).join('、')}`);
  log(`版本：${info.map((s) => { const a = saved.get(s.id).n; return s.same ? `${s.id} v${a}（沒變）` : `${s.id} ${s.before ? `v${s.before.n} → ` : '→ '}v${a}`; }).join('；')}`);
  for (const l of savedLog) if (/^\s+(預覽|比較)：/.test(l)) log(l.trim());
  if (flags.preview) for (const s of info) { const v = saved.get(s.id); if (!s.same && !v.cmp) log(`（${s.id} 沒有比較影片：改之前的版本沒有預覽；要比較就 begin、finish 都加 --preview）`); }
  log(`紀錄：${fileRel}、work/製作進度.md（④ 待回覆）`);
  if (shot) log(`要看的截圖：${rel(shot)}（由左到右、由上到下：${counts}）`);
  else if (looseShots.length) { log('要看的截圖：'); for (const f of looseShots) log(`  ${f}`); }
  else log('要看的截圖：沒有（這輪沒有畫面上的段）');
  if (rq?.line) log(rq.line);
  log('看上面那張截圖（字有沒有擋臉、壓字幕、跑版）：不對就改好再跑一次 finish（同一輪）；對了就照貼下面的回報段');
  // 回報段（auto-edit-review「回報格式」）：工具知道的都填好；要 AI 判斷的（⚠ 的理由、拼圖有沒有 FAIL）留在那一行
  const shownW = dg.warns.length + dg.global.length;
  const lines = [
    `預覽好了（回饋 ${name}）：${ids.length} 段 ${ids.join('、')}${removed.length ? `；拿掉 ${removed.join('、')}` : ''}；build ✖ 0、⚠ ${shownW}；audit ✖ 0、⚠ ${au.warns.length}${shownW + au.warns.length ? '（⚠ 逐項寫：改了／保留的理由）' : ''}`,
    ...(dg.summary.length ? [dg.summary.join('；')] : []),
    shot || looseShots.length ? `拼圖：${shot ? rel(shot) : `上面列的 ${looseShots.length} 張`}（看完把 FAIL 的段與問題寫在這一行；沒有就寫「沒有 FAIL」）` : '拼圖：這輪沒有畫面上的段',
    '請看字幕有沒有對到嘴；說「輸出」才 render。',
    ...(rq?.line ? [`${rq.line}（剪輯台的修改單可以按「清空修改單」）`] : []),
    ...info.map((s) => (auto[s.id] == null ? `${s.id}：沒有改（和改之前一樣）` : `${s.id}：${auto[s.id]}（${verText[s.id]}）`)),
  ];
  for (const l of reportLines(lines, { stop: stopLine })) log(l);
  return report;
}

// ---------- CLI ----------
export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!/^--[\w-]/.test(a)) throw new Error(`看不懂的參數「${a}」→ 用 --help 看用法`);
    const [k, inline] = splitFlag(a);
    if (VALUE_FLAGS.includes(k)) {
      try { [flags[k], i] = valueOf(rest, i, k, inline); } catch (e) { throw new Error(`${e.message} → 用 --help 看用法`); }
    } else if (BOOL_FLAGS.includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數 → 用 --help 看用法`);
  }
  // 互相矛盾的一對（子指令本身是位置參數，不會撞）
  oneOf(flags, ['preview', 'no-preview']);
  oneOf(flags, ['prerender', 'no-prerender']);
  return flags;
}

export function cli(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help')) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  const flags = parseArgs(argv);
  const CMDS = ['begin', 'finish', 'save', 'new', 'accept', 'use', 'list', 'compare'];
  if (!CMDS.includes(flags.cmd)) throw new Error(`沒有「${flags.cmd}」這個指令：只有 ${CMDS.join('、')} → 改成其中一個（用 --help 看用法）`);
  const P = pathsFrom(flags);
  // 032 B6：拍點正本的遷移（每個專案第一次自動做一次）
  if (P.project) for (const l of ensureBeatsV2(P, { lib: () => loadLib(P.templateDir, P.project) }).lines) if (!flags.json) console.log(l);
  const ids = String(flags.seg || '').split(/[,，、\s]+/).filter(Boolean);
  if (!['list', 'finish'].includes(flags.cmd) && !(flags.cmd === 'begin' && flags.requests) && !ids.length) throw new Error(`${flags.cmd} 要加 --seg <段 id>（例 --seg s12，好幾段用逗號 --seg s08,s12）`);
  const log = (s) => console.log(s);
  const segCmd = (sub) => cmdLine('versions.mjs', [sub, '--project', rel(P.project), '--seg', ids.join(',')]);
  if (flags.cmd === 'begin') {
    const r = beginRound(P, flags, ids, saidOf(flags), flags.json ? () => {} : log);
    if (flags.json) console.log(JSON.stringify({ ...r, project: pj(P) }, null, 2));
    else printBegin(P, r, log);
    return 0;
  }
  if (flags.cmd === 'finish') {
    const r = finishRound(P, flags, flags.json ? () => {} : log);
    if (flags.json) console.log(JSON.stringify({ ...r, project: pj(P) }, null, 2));
    return r.ok ? 0 : 1;
  }
  if (flags.cmd === 'list') {
    const all = listAll(P, ids);
    if (flags.json) { console.log(JSON.stringify({ project: pj(P), segs: all }, null, 2)); return 0; }
    if (!all.length) { log('還沒有任何段落版本（停點 ④ 之後的回饋輪、改版才會建立）'); return 0; }
    for (const s of all) {
      log(s.id);
      if (!s.versions.length) log('  （沒有版本）');
      for (const v of s.versions) log(`  ${v.v}  ${v.time.padEnd(16)}  ${v.kind}${v.state !== '完成' ? `（${v.state}）` : ''}${v.preview ? '  預覽.mp4' : ''}${v.current ? '  ← 目前' : ''}${v.note ? `  ${v.note}` : ''}`);
      for (const c of s.compares) log(`  比較：${rel(path.join(segDir(P.project, s.id), c))}`);
    }
    return 0;
  }
  if (flags.cmd === 'save') { for (const id of ids) saveSeg(P, flags, id, log); return 0; }
  if (flags.cmd === 'new') {
    const note = flags.note || saidOf(flags) || null;
    // 改版也是一輪回饋：沒開輪就自己開（同 begin：備份、存改之前的版本、r<N>.md），做完一樣跑 finish
    if (!openRound(P.project)) {
      if (!note) throw new Error('沒有開著的回饋輪：new 會自己開一輪，要記使用者原話 → 加 --note "<使用者原話>"');
      const b = beginRound(P, flags, ids, note, log);
      log(`回饋 ${b.round}：開好了（${b.segs.join('、')}；備份 ${b.backup}），改版做完跑 finish 一起驗證`);
    }
    const r = ids.map((id) => newProposal(P, flags, id, log, note));
    const label = `${STOP.storyboard}（${r.map((x) => `${x.id} v${x.n}`).join('、')}）`;
    const prev = lastStop(P.project, STOP.storyboard);   // 停點紀錄照「③ 分鏡表」歸類，label 才是整格的字
    if (!(prev?.label === label && prev.state === '待回覆')) log(`停點紀錄：${appendStop(P.project, { stop: label, state: '待回覆', back: r.map((x) => `work/versions/${x.id}/v${x.n}/分鏡.md`).join('、') })}`);
    log('→ 改每份 分鏡.md 的「這版要改什麼」（1–5 條）和「## 分鏡」（動畫分鏡表頭照抄、動態只用 BEATS.md 語彙），改好就回覆使用者（停點已經記好），回覆的最後兩行照抄下面兩行');
    log(stopLines.revise(label, r.map((x) => rel(x.file))));
    return 0;
  }
  if (flags.cmd === 'accept') {
    const done = ids.map((id) => acceptProposal(P, id, log));
    const row = appendStop(P.project, { stop: `${STOP.storyboard}（${done.map((x) => `${x.id} v${x.n}`).join('、')}）`, state: '通過', said: unquote(saidOf(flags)), back: 'work/storyboard.md' });
    log(`停點紀錄：${row}`);
    const round = openRound(P.project);
    for (const l of next(`照 auto-edit-motion 做 ${ids.join('、')}（x 檔已經在就用 edit 接著改，不要整份重寫；情境換了先改 plan.json 這段的 src、layout）${round ? `，做完跑下一行（build、audit、存版本、紀錄一次做完，不 render；這是回饋 r${round.n}）` : '，build、audit --only 都 0 個 ✖ 之後跑下一行'}：`, round ? finishCmd(P) : segCmd('save'))) log(l);
    return 0;
  }
  if (flags.cmd === 'use') {
    if (ids.length !== 1) throw new Error('use 一次只退回一段 → --seg 只寫一個段 id');
    if (!flags.ver) throw new Error('use 要加 --ver（例 --ver v1）→ 先跑 versions.mjs list 看有哪幾版');
    if (!openRound(P.project)) {
      const r = useAndFinish(P, flags, ids[0], flags.ver, flags.json ? () => {} : log);
      if (flags.json) console.log(JSON.stringify({ ...r, project: pj(P) }, null, 2));
      return r.ok ? 0 : 1;
    }
    useVersion(P, flags, ids[0], flags.ver, log);
    for (const l of next('這是回饋輪的一部分，跑下一行（build、audit、紀錄、停點 ④ 一次做完）：', finishCmd(P))) log(l);
    return 0;
  }
  if (flags.cmd === 'compare') {
    if (ids.length !== 1) throw new Error('compare 一次比一段 → --seg 只寫一個段 id');
    const r = compareVersions(P, flags, ids[0], log, { a: flags.a ?? null, b: flags.b ?? null });
    return r.ok ? 0 : 1;
  }
  return 0;
}

if (isMain(import.meta.url)) { try { process.exitCode = cli(); } catch (e) { console.error(`✖ ${e.message}`); process.exitCode = 1; } }

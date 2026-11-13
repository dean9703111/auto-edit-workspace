#!/usr/bin/env node
/**
 * 專案進度：做到哪一步、下一條指令、哪個停點在等回覆；也負責寫 work/製作進度.md（--mark、--init）
 *
 *   node shared/template/tools/status.mjs --project projects/<專案> [--json]
 *       只讀檔（不寫任何檔；版式要看主軌時用 ffprobe 讀寬高；主軌只有螢幕錄影時用 ffmpeg 判斷有沒有邊錄邊講）。印出：
 *         版式：<直式 1080×1920｜橫式 1920×1080>（來源：…）   （lib/canvas.mjs 的 resolveFormat：plan.json > 開工決策表 > 主軌寬高比）
 *         專案：<路徑>
 *         目前在：<階段>            例：剪好看／停點 ③ 分鏡表（待回覆）
 *         Skill：<對應的 Skill 與步驟>
 *         下一個停點：<① 剪輯清單｜② 構圖｜③ 分鏡表｜④ 完成影片預覽｜無>
 *         待回覆停點：<停點名稱，用「、」接｜無>
 *         下一輪回饋編號：r<N>      （work/feedback/ 的 r*.md、plan.json.bak-r* 的最大編號 ＋ 1）
 *         依據：<判斷用到的檔案與停點紀錄>
 *         講者：⚠ …                 （只有 shared/setting.json 還沒設定或格式不對時才印：提醒設定講者資料，lib/speaker.mjs）
 *         摘要：⚠ …                 （有初剪、還沒寫或格式不對的 work/摘要.md 時才印；不擋流程，lib/summary.mjs）
 *         偏好：…                   （有 shared/偏好.md「照做」的規則、或各專案回饋裡有還沒問過使用者的「以後都…」時才印；見 --prefs）
 *         素材：⚠ …                 （assets/、講稿.md 和 media.mjs prep 記的清單 work/.jobs/assets-manifest.json 比，有檔被改過或不見了才印；多出新檔不算、舊專案沒有清單不印）
 *         Skill：⚠ …                （裝好的 Skill 和 .agents/skills/ 不一樣才印，附重裝指令 node setup/install-skills.mjs；--init 也印）
 *       最後幾行是要做的事：
 *         沒有停點在等：「→ 下一步：<說明>」，下面每一行都是可以整行複製執行的指令（好幾行就依序跑）；這一步是 AI 自己做的事（寫分鏡表）就沒有指令
 *         有停點在等：「使用者回覆「…」：」和回覆後要跑的指令（縮排兩格）、一行「等使用者回覆：…」，最後兩行是 AGENTS.md 格式的「⏸ 停點 …」「請回：…」；
 *                     網址要剪輯台：開著就直接填好，沒開就先印「⏸ 停點 …<網址>…」，再印「→ 下一步」和開剪輯台的指令
 *   node shared/template/tools/status.mjs --project projects/<專案> --mark "<停點>" --state <待回覆|通過|修改後重停|略過> [--said "使用者原話"] [--back "寫回哪裡"] [--json]
 *       work/製作進度.md 的停點紀錄加一列（時間工具蓋、只新增不改舊列），印那一列。<停點> 可以寫「② 構圖」「②」「構圖」「③ 分鏡表（s12 v2）」。
 *       ② 通過或略過時，開工決策表的「構圖」一起填（plan.json frame 的倍率，或「不裁切」）。
 *   node shared/template/tools/status.mjs --project projects/<專案> --init [--format portrait|landscape] [--json]
 *       建 work/製作進度.md，自動填開工決策表（主軌種類、版式、有沒有講稿、有沒有螢幕錄影／圖片、長度、有沒有業配段）；已經有這個檔就只補空的欄。
 *       --format：使用者說了「直式」「短影片」「橫式」「長片」才加（會蓋掉已經寫的版式；plan.json 已經有了就連它的 format 一起改，印「✓ plan.json：format＝…」）；
 *       沒加就看 ffprobe 主軌寬高。media.mjs prep 也呼叫這個（initProgress）。
 *   node shared/template/tools/status.mjs --project projects/<專案> --timeline [--json]
 *       時間軸：各階段產物第一次出現（建立時間）與最後修改的時間，加上 work/製作進度.md 停點紀錄的時間，
 *       算出總時長、等使用者回覆的時間、AI 在做事的時間，和最久的幾段（找「哪裡花最久」用；舊專案也能看）。
 *   node shared/template/tools/status.mjs --prefs
 *       跨集偏好（不用 --project）：列出 shared/偏好.md 已經照做的規則，和各專案 work/feedback/r<N>.md「建議改規則」裡還沒問過使用者的（編號 a1、a2…）。
 *       有還沒問的就照印的 → 做：把那幾條唸給使用者，問哪幾條以後每一集都照做。
 *   node shared/template/tools/status.mjs --prefs-add "a1,a3"｜"<一句規則>"
 *       使用者說要照做的那幾條寫進 shared/偏好.md「照做」（也可以直接寫一句規則）。之後每一集寫分鏡、改段落前都要讀這個檔。
 *   node shared/template/tools/status.mjs --prefs-skip "a2"      使用者說不要的那幾條記進「不採用」，下次不再問。
 *   node shared/template/tools/status.mjs --prefs-drop "2"       把「照做」的第 2 條拿掉（使用者說不要了）。
 *   node shared/template/tools/status.mjs --project projects/<專案> --summary
 *       驗 work/摘要.md（影片摘要：300 字內，一到兩句描述＋2–6 個列點；初剪完成後 AI 寫，生成這一集的背景圖時參考）。印 ✓ 或 ✖ 與怎麼改。
 *   node shared/template/tools/status.mjs --agents 6
 *       子代理一次最多派幾個（1–16，預設 10；不用 --project）：寫進 shared/setting.json，之後工具印的派工那一行都照這個數字。
 *       使用者說「子代理一次派 6 個」「子代理只能開 2 個」時跑；1＝一次只派一個。
 *
 * 判斷依據：work/ 裡各階段產物在不在、工具做完一步時記的標記 work/.jobs/state.json（lib/progress.mjs markStep：srt-align、snap-srt、screen-sync、
 * map-merge、merge-drafts、storyboard、apply-storyboard、build、qc；記了那一步就比它記下的檔案內容，例：plan.json 在上次 build 之後改過＝要重 build），
 * 沒記過的步驟（舊專案）照舊看備份檔在不在、修改時間先後（例：storyboard.md 比 plan.json 新＝還在分鏡表；
 * storyboard.md 是 versions.mjs accept／use 寫的不算），以及 work/製作進度.md 的「## 停點紀錄」表（同一個停點以最後一列為準，
 * 狀態「待回覆」「修改後重停」＝卡在這裡；改版的停點寫「③ 分鏡表（s12 v2）」）。work/versions/ 有沒做完的改版提案時，目前在印「改版／…」；
 * 回饋輪開著（versions.mjs begin 之後、finish 之前）時印「回饋輪 r<N>…」；背景工作（work/.jobs/）還在跑時，下一步是同一條指令（會接著等）。
 * 沒有講者的專案（hasCamera 是 false：主軌全是聲音或邊錄邊講的螢幕錄影，rough.mp4 全黑）跳過 ② 構圖和講者框。
 * ② 構圖：還沒給使用者看印 build.mjs --framing；在等回覆印 --framing-done（「用建議的」加 --use suggested）；② 通過還沒量講者框也印 --framing-done。
 * assets/screen、assets/images 有檔、work/media/notes/ 還沒有每個素材的筆記時，先做素材盤點（排在 ② 之前）。
 * 要派子代理做動畫時（③ 通過、動畫還沒做），「→ 下一步」上面先印「→ 派工：…」，下面每一行（縮排兩格）是一則照抄給子代理的派工訊息。
 * --json：只印一個 JSON（project、stage、at、skill、next、cmd、cmds、dispatch、nextStop、waiting、stopLine、after、needEditor、round、job、camera、feedback、evidence、format、formatSource、speaker、summary；
 * cmd＝cmds 的第一條，沒有指令時是 null；dispatch＝{ note, msgs }（派工的說明與那幾則訊息），沒有要派工時是 null；speaker＝set／off／unset／bad；
 * summary＝work/摘要.md 的檢查（和文字模式「摘要：⚠ …」同一個判斷）：還沒有初剪（work/rough.srt）是 null，否則 { state: ok／none／bad, chars, errors, line }，line＝那一行 ⚠（ok 時是 null））。
 * --said（舊寫法 --say 也收）。--mark、--init、--timeline、--summary、--prefs、--prefs-add、--prefs-skip、--prefs-drop、--agents 一次只能用一個。
 * --project：同 build.mjs。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findProject } from './lib/project.mjs';
import { VIDEO_EXT, AUDIO_EXT, probeMedia } from './lib/ff.mjs';
import { lookNextStep, projArg } from './lib/look.mjs';
import { narrationOf, mainCandidates } from './lib/rough/main-track.mjs';
import { resolveFormat, formatLine, formatErrors, probeDims, canvasOf } from './lib/canvas.mjs';
import { pendingRevisions, storyboardByVersions, nextRound, openRound } from './versions.mjs';
import { readSpeaker, SET_CMD } from './lib/speaker.mjs';
import { agentLimit, saveAgentLimit, SETTINGS_FILE } from './lib/agents.mjs';
import { readSummary, SUMMARY_MAX } from './lib/summary.mjs';
import { ensureProgress, setFact, appendStop, progressFile, STOP_STATES, readSteps, stepChanged } from './lib/progress.mjs';
import { storyboardDirty } from './lib/storyboard-state.mjs';
import { jobState } from './lib/job.mjs';
import { untouchedSample } from './lib/plan.mjs';
import { designFileOf, isBlankDesign } from './lib/custom-fill.mjs';
import { readPrefs, prefsFile, prefKey } from './lib/prefs.mjs';
import { STOP, stopLines } from './lib/stops.mjs';
import { writeAtomic } from './lib/atomic.mjs';
import { next, dispatch, cmdLine } from './lib/say.mjs';
import { splitFlag, valueOf, oneOf, saidOf, isMain } from './lib/cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STOPS = [STOP.cuts, STOP.framing, STOP.storyboard, STOP.final, STOP.editor, STOP.bg];
const NEWER = 1000;   // 修改時間差 1 秒以內視為同時（同一次 build 寫出的檔）
const WAIT_STATES = ['待回覆', '修改後重停'];   // 「修改後重停」＝改好又停下來等回覆
const TOOLS = 'node shared/template/tools';
const SCREEN_RE = /\.(mp4|mov|m4v|webm|mkv)$/i, IMAGE_RE = /\.(jpe?g|png|webp|heic)$/i;   // 和 build --scaffold 數素材同一套

const posix = (p) => p.split(path.sep).join('/');
const stat = (f) => { try { return fs.statSync(f); } catch { return null; } };
const files = (dir, exts) => { try { return fs.readdirSync(dir).filter((f) => !f.startsWith('.') && exts.includes(path.extname(f).toLowerCase())); } catch { return []; } };

// work/製作進度.md 的「## 停點紀錄」：| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |；同一停點以最後一列為準
export function readStopLog(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s*停點紀錄\s*$/.test(l.trim()));
  if (at < 0) return { found: false, last: new Map(), rows: [] };
  let i = at + 1;
  while (i < lines.length && !/^\s*\|/.test(lines[i])) { if (/^##\s/.test(lines[i])) return { found: false, last: new Map(), rows: [] }; i++; }
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const head = cells(lines[i] || '');
  const iT = head.findIndex((h) => h.includes('時間')), iS = head.findIndex((h) => h.includes('停點')), iV = head.findIndex((h) => h.includes('狀態'));
  if (iT < 0 || iS < 0 || iV < 0) return { found: true, bad: true, last: new Map(), rows: [] };
  const rows = [], last = new Map();
  for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
    const c = cells(lines[j]);
    const stop = STOPS.find((s) => c[iS]?.startsWith(s.slice(0, 1))) || null;
    if (!stop) continue;
    // 舊專案的紀錄寫「④ Studio 預覽」：印成現在的名稱（018）
    const row = { time: c[iT], stop, label: (c[iS] || stop).replace('④ Studio 預覽', '④ 完成影片預覽'), state: c[iV], line: j + 1 };
    rows.push(row);
    last.set(stop, row);
  }
  return { found: true, last, rows };
}

// ---------- 時間軸（--timeline）----------
// 產物照「第一次出現」排（birthtime；檔案系統不給就用修改時間），停點紀錄照表上的時間；
// 等待＝停點「待回覆」到同一個停點下一列的時間，其餘算 AI 在做事（含 render、轉檔這類等工具跑的時間）
// 沒記「通過」、後面又有產物的停點：用下一個產物的時間估（estimated），不算進 AI 在做事；後面沒有產物才是「還在等」
export const TIMELINE_FILES = [
  ['work/main.mp4', '接主軌（剪乾淨開始）'], ['work/cuts.md', '剪輯清單（停點 ①）'], ['work/rough.mp4', '初剪'],
  ['work/rough.srt', '字幕'], ['work/cutpoints.json', '剪接點'], ['work/screen-sync.json', '螢幕錄影同步'],
  ['work/rough-look.mp4', '瘦臉底片'], ['work/構圖預覽.jpg', '構圖分析（停點 ②）'], ['work/hyperframes/plan.json', 'plan.json'],
  ['work/分鏡素材.md', '開始排分鏡'], ['work/分鏡素材/index.json', '開始排分鏡'], ['work/drafts/_merged.json', '合併分鏡草稿'], ['work/storyboard.md', '分鏡表（停點 ③）'], ['work/hyperframes/index.html', 'build'],
  ['output/test-clips/test-clip.mp4', '測試片段'], ['output/final.mp4', '完成影片'], ['output/qc/qc-sheet.jpg', '驗收'],
];
const born = (st) => (st.birthtimeMs > 0 && st.birthtimeMs <= st.mtimeMs + 1000 ? st.birthtimeMs : st.mtimeMs);
const hm = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const stamp = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const parseStamp = (t) => { const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/.exec(String(t || '').trim()); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null; };

// 停點紀錄只記到分：停下來前後 2 分鐘內出現的檔是這次停下來之前做的，不算使用者回覆了
const STOP_SETTLE = 2 * 60 * 1000;
export function projectTimeline(project) {
  const ev = [];
  const add = (rel, label) => { try { const st = fs.statSync(path.join(project, rel)); ev.push({ t: born(st), last: st.mtimeMs, what: rel, label, kind: 'file' }); } catch { /* 還沒有這個檔 */ } };
  for (const [rel, label] of TIMELINE_FILES) add(rel, label);
  // 情境動畫：每支 x-*.html 第一次出現
  try {
    const dir = path.join(project, 'work', 'hyperframes', 'compositions');
    for (const n of fs.readdirSync(dir).filter((x) => /^x-.*\.html$/.test(x))) add(`work/hyperframes/compositions/${n}`, '情境動畫');
  } catch { /* 沒有情境動畫 */ }
  // 停點紀錄
  const waits = [];
  let openStops = false;
  try {
    const sl = readStopLog(fs.readFileSync(path.join(project, 'work', '製作進度.md'), 'utf8'));
    let open = new Map();
    for (const r of sl.rows) {
      const t = parseStamp(r.time);
      if (t == null) continue;
      ev.push({ t, last: t, what: r.label, label: r.state, kind: 'stop' });
      const o = open.get(r.stop);
      if (o != null && r.state !== '待回覆') { waits.push({ stop: r.label, ms: t - o, since: o }); open.delete(r.stop); }
      if (WAIT_STATES.includes(r.state)) open.set(r.stop, t);
    }
    for (const [stop, t] of open) waits.push({ stop, ms: null, since: t });
    openStops = true;
  } catch { /* 沒有製作進度.md */ }
  ev.sort((a, b) => a.t - b.t || (a.kind === 'stop') - (b.kind === 'stop'));
  if (!ev.length) return { events: [], total: 0, wait: 0, work: 0, waits, longest: [] };
  if (openStops) for (const w of waits) {
    if (w.ms != null) continue;
    const next = ev.find((e) => e.kind === 'file' && e.t > w.since + STOP_SETTLE);
    if (next) { w.ms = next.t - w.since; w.estimated = true; }
  }
  const total = ev[ev.length - 1].t - ev[0].t, wait = waits.reduce((n, w) => n + (w.ms || 0), 0);
  // 最久的幾段只算 AI 的時間：扣掉落在等使用者回覆裡的部分
  const waitRanges = waits.filter((w) => w.ms != null && w.since != null).map((w) => [w.since, w.since + w.ms]);
  const aiMs = (a, b) => waitRanges.reduce((n, [x, y]) => n - Math.max(0, Math.min(b, y) - Math.max(a, x)), b - a);
  const gaps = ev.slice(1).map((e, i) => ({ from: ev[i], to: e, ms: aiMs(ev[i].t, e.t) })).filter((g) => g.ms > 0).sort((a, b) => b.ms - a.ms).slice(0, 3);
  return { events: ev, total, wait, work: Math.max(0, total - wait), waits, longest: gaps };
}

function printTimeline(label, tl) {
  console.log(`專案：${label}`);
  if (!tl.events.length) { console.log('時間軸：還沒有任何產物'); return; }
  console.log('時間軸（產物第一次出現的時間；括號是最後修改；⏸ 是停點紀錄）');
  let prev = tl.events[0].t;
  for (const e of tl.events) {
    const d = `+${hm(e.t - prev)}`.padStart(6);
    console.log(e.kind === 'stop' ? `  ${stamp(e.t)} ${d}  ⏸ ${e.what}｜${e.label}` : `  ${stamp(e.t)} ${d}  ${e.what}  ${e.label}${e.last - e.t > 60000 ? `（最後修改 ${stamp(e.last)}）` : ''}`);
    prev = e.t;
  }
  console.log(`總時長 ${hm(tl.total)}；等使用者回覆 ${hm(tl.wait)}；AI 在做事 ${hm(tl.work)}（含等工具跑，例如轉檔、render）`);
  if (tl.waits.length) console.log(`停點等待：${tl.waits.map((w) => `${w.stop} ${w.ms == null ? '還在等' : `${w.estimated ? '約 ' : ''}${hm(w.ms)}${w.estimated ? '（沒記「通過」，用下一個產物的時間估）' : ''}`}`).join('、')}`);
  console.log(`最久的幾段：${tl.longest.map((g) => `${g.from.kind === 'stop' ? g.from.what : g.from.what.replace(/^work\/(hyperframes\/)?/, '')} → ${g.to.kind === 'stop' ? g.to.what : g.to.what.replace(/^work\/(hyperframes\/)?/, '')} ${hm(g.ms)}`).join('、')}`);
}

// 指令裡的專案路徑：工作區裡寫相對路徑，外面寫絕對路徑
const labelOf = (project) => { const r = path.relative(process.cwd(), project); return !r ? '.' : r.startsWith('..') || path.isAbsolute(r) ? posix(path.resolve(project)) : posix(r); };

// 有沒有講者畫面：work/main.json 的 clips 有 camera；還沒接主軌就看 assets/camera/。
// 主軌全是聲音或邊錄邊講的螢幕錄影（都配純黑畫面）＝沒有講者，不用 ② 構圖和講者框；部分區間才是聲音的混用專案是 true，照常走 ②
export function hasCamera(project) {
  try {
    const clips = JSON.parse(fs.readFileSync(path.join(project, 'work', 'main.json'), 'utf8')).clips;
    if (Array.isArray(clips) && clips.length) return clips.some((c) => (c.kind ?? (String(c.file ?? '').startsWith('assets/camera/') ? 'camera' : '')) === 'camera');
  } catch { /* 還沒有 main.json */ }
  return files(path.join(project, 'assets', 'camera'), VIDEO_EXT).length > 0;
}

// 素材盤點還缺哪幾個素材：assets/screen、assets/images 的檔，在 work/media/notes/ 還沒有筆記的。
// <檔名>.json、<去掉副檔名>.json 都算；每批圖片共用一份筆記時，筆記裡寫到檔名就算
export function inventoryTodo(project) {
  const list = (d, re) => { try { return fs.readdirSync(path.join(project, 'assets', d)).filter((f) => !f.startsWith('.') && re.test(f)); } catch { return []; } };
  const assets = [...list('screen', SCREEN_RE), ...list('images', IMAGE_RE)];
  if (!assets.length) return [];
  const dir = path.join(project, 'work', 'media', 'notes');
  let notes = [];
  try { notes = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { /* 還沒開始盤點 */ }
  const names = new Set(notes.map((f) => f.slice(0, -5)));
  const text = notes.map((f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } }).join('\n');
  return assets.filter((a) => !names.has(a) && !names.has(a.replace(/\.[^.]+$/, '')) && !text.includes(a));
}

// 剪輯台開著就回傳各頁網址（只看 server.json 和 pid，不連線）；沒開回傳 null
export function editorUrls(project, out = path.join(project, 'work', 'hyperframes')) {
  let s = null;
  try { s = JSON.parse(fs.readFileSync(path.join(out, '.editor', 'server.json'), 'utf8')); } catch { return null; }
  if (!s?.url || !s?.pid) return null;
  try { process.kill(s.pid, 0); } catch (e) { if (e.code !== 'EPERM') return null; }
  try { const at = (p) => new URL(p, s.url).href; return { main: s.url, cuts: at('cuts'), framing: at('framing'), storyboard: at('storyboard'), final: at('?view=final') }; } catch { return null; }
}

// 背景工作還在跑，或做完了結果還沒印（lib/job.mjs）：下一步是同一條指令，會接著等或印結果，不會重跑
const WAITED_JOBS = ['prep', 'rough', 'transcribe', 'deliver'];   // prepare、prerender 是順便在背景做的，不擋流程
function pendingJob(project) {
  for (const name of WAITED_JOBS) {
    const st = jobState(project, name);
    const unread = (st.state === 'done' || st.state === 'failed') && st.reported === false && !st.died;
    if (st.state !== 'running' && !unread) continue;
    if (!Array.isArray(st.argv) || !st.argv.length) continue;
    const [tool, ...rest] = st.argv;
    const quote = (a) => (/[\s"'&|;()<>$`]/.test(a) ? `"${a}"` : a);
    const toolRel = path.isAbsolute(tool) ? posix(path.relative(process.cwd(), tool)) : tool;
    return { name, state: st.state, cmd: `node ${quote(toolRel)} ${rest.map(quote).join(' ')}`.trim() };
  }
  return null;
}

// 動畫還沒做的段：x 檔不在、還是範例原文，或內容設計動畫還是占位（模板段由 build 產生，不算）
function motionTodo(project, plan) {
  const customDir = path.join(HERE, '..', 'custom'), out = path.join(project, 'work', 'hyperframes');
  return (plan?.scenes || []).filter((s) => {
    if (s?.design) {
      let html = '';
      try { html = fs.readFileSync(path.join(out, designFileOf(s)), 'utf8'); } catch { return true; }
      return isBlankDesign(html);
    }
    if (s?.type !== 'custom' || s.template || !s.src) return false;
    const f = path.join(out, s.src);
    return !fs.existsSync(f) || untouchedSample(f, customDir);
  }).map((s) => s.id);
}

// ---------- 開工決策表（--init；media.mjs prep 也呼叫）----------
const WAIT_MAIN = '待主軌素材';
const AD_RE = /業配|贊助|優惠碼/;

// 開工決策表現在的值（給回報用）
export function readFacts(project) {
  const facts = {};
  let lines = [];
  try { lines = fs.readFileSync(progressFile(project), 'utf8').split(/\r?\n/); } catch { return facts; }
  const at = lines.findIndex((l) => /^##\s*開工決策表\s*$/.test(l.trim()));
  if (at < 0) return facts;
  let i = at + 1;
  while (i < lines.length && !lines[i].trim().startsWith('|')) { if (/^##\s/.test(lines[i])) return facts; i++; }
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const head = cells(lines[i] || ''), iK = head.indexOf('欄'), iV = head.indexOf('值');
  if (iK < 0 || iV < 0) return facts;
  for (let j = i + 2; j < lines.length && lines[j].trim().startsWith('|'); j++) { const c = cells(lines[j]); if (c[iK]) facts[c[iK]] = c[iV] ?? ''; }
  return facts;
}

// 主軌有哪些檔：接過主軌看 work/main.json，還沒接看 assets（邊錄邊講的螢幕錄影要跑 ffmpeg 判斷）
function mainFiles(project, warnings) {
  try {
    const clips = JSON.parse(fs.readFileSync(path.join(project, 'work', 'main.json'), 'utf8')).clips;
    if (Array.isArray(clips) && clips.length) return clips.map((c) => ({ file: c.file, kind: c.kind ?? 'camera', dur: Number.isFinite(c.end - c.start) ? c.end - c.start : null }));
  } catch { /* 還沒接主軌 */ }
  try {
    const { cams, voices, screens } = mainCandidates(project);
    return [...cams, ...voices, ...screens.filter((x) => x.narrated)].map((x) => ({ file: x.file, kind: x.kind, dur: null }));
  } catch (e) {
    warnings.push(`判斷不出螢幕錄影有沒有邊錄邊講（${e.message}）→ 主軌先算真人錄影和聲音，media.mjs main 會再判斷一次`);
    return [...files(path.join(project, 'assets', 'camera'), VIDEO_EXT).map((f) => ({ file: `assets/camera/${f}`, kind: 'camera', dur: null })),
      ...files(path.join(project, 'assets', 'voice'), [...AUDIO_EXT, ...VIDEO_EXT]).map((f) => ({ file: `assets/voice/${f}`, kind: 'voice', dur: null }))];
  }
}

// 只有真人／真人＋聲音（混用）／只有聲音，並寫各幾支；邊錄邊講的螢幕錄影在主軌裡只取聲音，算聲音那一邊
export function mainKindText(clips) {
  if (!clips.length) return WAIT_MAIN;
  const n = (k) => clips.filter((c) => c.kind === k).length, cam = n('camera'), voice = n('voice'), screen = n('screen');
  const parts = [cam ? `真人 ${cam} 支` : '', voice ? `聲音 ${voice} 支` : '', screen ? `邊錄邊講的螢幕錄影 ${screen} 支` : ''].filter(Boolean).join('、');
  const tail = clips.length > 1 ? '（多支：停點 ① 確認順序）' : `（${clips[0].file}）`;
  if (cam && !voice && !screen) return `只有真人：${parts}${tail}`;
  if (cam) return `真人＋聲音（混用）：${parts}${tail}`;
  return `只有聲音：${parts}${tail}`;
}

export function initProgress(project, { format = null } = {}) {
  const warnings = [];
  const P = (...p) => path.join(project, ...p);
  const clips = mainFiles(project, warnings);
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(P('work', 'hyperframes', 'plan.json'), 'utf8')); } catch { plan = null; }
  // 版式：--format（使用者說的）> plan.json > 已經寫的 > 主軌寬高比；還沒有主軌不寫（寫了之後放直拍素材會對不上）
  const fmt = resolveFormat({ projectDir: project, plan, flag: format });
  const zh = fmt.format === 'portrait' ? '直式' : '橫式';
  let fmtText = null;
  if (fmt.source === 'flag') fmtText = `${zh}（使用者指定）`;
  else if (fmt.source === 'plan') fmtText = `${zh}（plan.json 的 format）`;
  else if (fmt.source === 'media') fmtText = `${zh}（主軌 ${fmt.detail}${/\d×\d/.test(fmt.detail) ? (fmt.format === 'portrait' ? '，寬 < 高' : '，寬 ≥ 高') : ''}；使用者沒指定）`;
  else if (fmt.source === 'default') {
    if (!clips.length) fmtText = WAIT_MAIN;
    else if (clips.some((c) => c.kind === 'camera')) fmtText = '待確認（ffprobe 讀不到主軌的寬高）';
    else fmtText = '橫式（主軌沒有畫面，配純黑 1920×1080；使用者沒指定）';
  }
  // 長度
  let lenText = WAIT_MAIN;
  if (clips.length) {
    let sum = 0, bad = null;
    if (fs.existsSync(P('work', 'main.mp4'))) { try { sum = probeMedia(P('work', 'main.mp4')).duration || 0; } catch (e) { bad = e.message; } }
    else for (const c of clips) {
      if (c.dur != null) { sum += c.dur; continue; }
      try { sum += probeMedia(P(...String(c.file).split('/'))).duration || 0; } catch (e) { bad = e.message; break; }
    }
    if (bad) { lenText = '待確認（ffprobe 讀不到長度）'; warnings.push(bad); }
    else lenText = `${Math.round(sum * 10) / 10}${clips.length > 1 && !fs.existsSync(P('work', 'main.mp4')) ? '（各支相加）' : ''}`;
  }
  // 講稿、業配
  let script = null;
  try { script = fs.readFileSync(P('講稿.md'), 'utf8'); } catch { script = null; }
  const adWord = script == null ? null : AD_RE.exec(script)?.[0] ?? null;
  const count = (d, re) => { try { return fs.readdirSync(P('assets', d)).filter((f) => !f.startsWith('.') && re.test(f)).length; } catch { return 0; } };
  const nScreen = count('screen', SCREEN_RE), nImage = count('images', IMAGE_RE);
  const facts = {
    主軌種類: mainKindText(clips),
    ...(fmtText ? { 版式: fmtText } : {}),
    有沒有講稿: script == null ? '沒有' : '有（講稿.md）',
    '有沒有螢幕錄影／圖片': nScreen || nImage ? [nScreen ? `螢幕錄影 ${nScreen} 支` : '', nImage ? `圖片 ${nImage} 張` : ''].filter(Boolean).join('、') : '沒有',
    '長度（秒）': lenText,
    有沒有業配段: script == null ? '未知（沒有講稿）' : adWord ? `可能有，待確認（講稿提到「${adWord}」）` : '沒有',
    構圖: '待停點 ②',
  };
  const { file, created } = ensureProgress(project, facts);
  // ensureProgress 只補空的、「待…」的欄。使用者說了版式就照改；上次看還沒有的素材、講稿現在有了也更新（這幾個值是工具自己寫的，不是誰決定的）
  if (format != null && !created) setFact(project, '版式', fmtText);
  if (!created) {
    const now = readFacts(project);
    for (const [k, stale] of [['有沒有講稿', '沒有'], ['有沒有螢幕錄影／圖片', '沒有'], ['有沒有業配段', '未知（沒有講稿）']]) if (now[k] === stale && facts[k] !== stale) setFact(project, k, facts[k]);
  }
  let dims = null;
  const firstCam = clips.find((c) => c.kind === 'camera');
  if (firstCam) dims = fs.existsSync(P('work', 'main.mp4')) ? probeDims(P('work', 'main.mp4')) : probeDims(P(...String(firstCam.file).split('/')));
  // 還沒有 plan.json 時不比「plan.json 沒寫 format」（寫 plan.json 時才要加）
  warnings.push(...formatErrors({ projectDir: plan ? project : null, plan, format: fmt.format, dims }));
  return { file, created, facts: readFacts(project), warnings };
}

// 「②」「構圖」「② 構圖」「③ 分鏡表（s12 v2）」「分鏡表（s12 v2）」「④ Studio 預覽」→ 停點紀錄的寫法
export function normalizeStop(input) {
  const s = String(input ?? '').trim();
  for (const name of STOPS) {
    const [mark, zh] = name.split(' ');
    if (s === mark || s === zh || s === name) return name;
    if (s.startsWith(`${name}（`)) return s;
    if (s.startsWith(`${zh}（`)) return `${mark} ${s}`;
    if (s.startsWith(mark)) return name;
  }
  throw new Error(`看不懂的停點「${input}」→ 只有 ${STOPS.join('、')}（改版寫「③ 分鏡表（s12 v2）」）`);
}

export function markStop(project, { stop, state, said = '', back = '' }) {
  if (!stop) throw new Error('--mark 要寫哪一個停點 → 例 --mark "② 構圖"');
  if (!state) throw new Error(`--mark 要加 --state → 只有 ${STOP_STATES.join('、')}`);
  if (!STOP_STATES.includes(state)) throw new Error(`沒有「${state}」這個狀態 → 只有 ${STOP_STATES.join('、')}`);
  const name = normalizeStop(stop);
  const row = appendStop(project, { stop: name, state, said: String(said ?? '').trim().replace(/^「([\s\S]*)」$/, '$1'), back });
  // ② 通過：開工決策表的「構圖」跟著填
  if (name === '② 構圖' && ['通過', '略過'].includes(state)) {
    let plan = null;
    try { plan = JSON.parse(fs.readFileSync(path.join(project, 'work', 'hyperframes', 'plan.json'), 'utf8')); } catch { /* 還沒有 plan.json：不裁切 */ }
    const C = canvasOf(resolveFormat({ projectDir: project, plan }).format);
    setFact(project, '構圖', Array.isArray(plan?.frame) && plan.frame[2] > 0 ? `${(C.W / plan.frame[2]).toFixed(2)} 倍` : '不裁切');
  }
  return row;
}

export function projectStatus(project) {
  const P = (...p) => path.join(project, ...p);
  const W = (...p) => P('work', ...p);
  const ev = [];
  const has = (f) => !!stat(f);
  const newer = (a, b) => { const sa = stat(a), sb = stat(b); return !!(sa && sb && sa.mtimeMs - sb.mtimeMs > NEWER); };
  const label = labelOf(project), A = projArg(label);
  const tool = (t, tail = '') => `${TOOLS}/${t} --project ${A}${tail}`;
  const inProject = (rel) => projArg(`${label}/${rel}`);
  // 主軌素材：接過主軌就看 work/main.json；還沒接就數真人錄影、聲音檔，都沒有才判斷邊錄邊講的螢幕錄影（要跑 ffmpeg）
  let mainJson = null;
  try { mainJson = JSON.parse(fs.readFileSync(W('main.json'), 'utf8')); } catch { mainJson = null; }
  const scrMain = !!mainJson?.clips?.some((c) => c.kind === 'screen');
  const mains = mainJson?.clips?.length || (files(P('assets', 'camera'), VIDEO_EXT).length + files(P('assets', 'voice'), [...AUDIO_EXT, ...VIDEO_EXT]).length)
    || files(P('assets', 'screen'), VIDEO_EXT).filter((f) => { try { return narrationOf(P('assets', 'screen', f)).narrated; } catch { return false; } }).length;
  const camera = hasCamera(project);
  const plan = W('hyperframes', 'plan.json'), index = W('hyperframes', 'index.html'), story = W('storyboard.md'), finalMp4 = P('output', 'final.mp4'), sheet = P('output', 'qc', 'qc-sheet.jpg');
  const workFiles = (() => { try { return fs.readdirSync(W()); } catch { return []; } })();
  // 032 C10：工具做完一步記在 work/.jobs/state.json（lib/progress.mjs markStep）。記過的步驟照標記判斷（複製專案、雲端同步後修改時間會亂）；
  // 沒記過（舊專案、還沒接上標記的工具）照舊看備份檔在不在、誰的修改時間比較新
  const steps = readSteps(project)?.steps ?? {};
  const changedSince = (step, rel) => stepChanged(project, steps[step], rel);   // true／false；這一步沒記過或沒記這個檔＝null
  const marks = (step, rel) => Object.hasOwn(steps[step]?.inputs ?? {}, rel);
  const MARKED = '（work/.jobs/state.json）';
  // srt-align 跑過＝有 rough.srt.align-*；snap-srt 跑過＝有 rough.srt.bak-*（srt-split 的備份叫 rough.srt.split-*，不算；A-02）
  // F8：有 transcript.json 時 srt-align 已經是詞級時間，snap-srt 不用跑；只有沒有 transcript.json 才要 snap-srt
  const aligned = !!steps['srt-align'] || workFiles.some((f) => f.startsWith('rough.srt.align-'));
  const snapped = !!steps['snap-srt'] || workFiles.some((f) => f.startsWith('rough.srt.bak-'));
  const words = has(W('transcript.json'));
  let planJson = null;
  try { planJson = has(plan) ? JSON.parse(fs.readFileSync(plan, 'utf8')) : null; } catch { planJson = null; }
  // build 前講者調光瘦臉好了沒：照 006 的 lookNextStep（look.mjs status／run 的最後兩行用同一個判斷，C-01）
  let lookTodo = null;
  if (has(W('rough.mp4'))) {
    try { const pl = has(plan) ? JSON.parse(fs.readFileSync(plan, 'utf8')) : {}; const ns = lookNextStep({ projectDir: project, plan: pl }); if (!ns.done) lookTodo = ns; } catch { /* plan.json 壞了：build 會報 */ }
  }
  // 停點紀錄
  const logFile = W('製作進度.md');
  const sl = has(logFile) ? readStopLog(fs.readFileSync(logFile, 'utf8')) : { found: false, last: new Map(), rows: [] };
  if (sl.bad) ev.push('work/製作進度.md 停點紀錄的表頭看不懂（要有 時間、停點、狀態），略過');
  const logged = (s) => sl.last.has(s);
  const passed = (s) => ['通過', '略過'].includes(sl.last.get(s)?.state);
  const mark = (stop, state, extra = '') => `${TOOLS}/status.mjs --project ${A} --mark "${stop}" --state ${state}${extra}`;
  const SAID = ' --said "<使用者原話>"';

  // 各階段的指令
  // ② 構圖（032 A2）：--framing 量構圖、開構圖台、記 ② 待回覆；--framing-done 記 ② 通過、量講者框、切章（瘦臉過期會先重跑）
  const prep = tool('media.mjs prep'), rough = tool('media.mjs rough'), editor = tool('editor.mjs'), framing = tool('build.mjs', ' --framing'), framingDone = tool('build.mjs', ' --framing-done'), scaffold = tool('build.mjs', ' --scaffold'), mapMerge = tool('build.mjs', ' --map-merge'), merge = tool('build.mjs', ' --merge-drafts'), storyCmd = tool('build.mjs', ' --storyboard'), apply = tool('build.mjs', ' --apply-storyboard'), review = tool('build.mjs', ' --review'), deliver = tool('deliver.mjs');
  const begin = `${TOOLS}/versions.mjs begin --project ${A} --seg <段 id> --say "<使用者原話>"`, finish = `${TOOLS}/versions.mjs finish --project ${A}`;
  const afterRough = camera ? '② 構圖' : '③ 分鏡表';
  const bgNote = '長片在背景跑；印「再跑一次同一條指令」就再跑同一行，會接著等，不會重跑';
  const motion = passed('③ 分鏡表') || !sl.rows.length ? motionTodo(project, planJson) : [];

  // 分鏡表之前（S9）：② → 量講者框 → 分鏡素材 → 每章草稿 → 合併 → 鏡位腳本 → 分鏡表；沒有講者的專案跳過前兩個
  const boxed = !!planJson?.speakerBox;
  let pack = null;
  try { pack = JSON.parse(fs.readFileSync(W('分鏡素材', 'index.json'), 'utf8')); } catch { pack = null; }
  const partKeys = (pack?.parts || []).map((x) => x.key).filter(Boolean);
  const draftMissing = partKeys.filter((k) => !has(W('drafts', `${k}.json`)));
  const mergedAt = stat(W('drafts', '_merged.json'))?.mtimeMs ?? 0;
  // 合併過：記過 merge-drafts 就看每份草稿在合併之後有沒有改過；沒記過看 _merged.json 是不是比每份草稿新
  const draftsMerged = steps['merge-drafts'] ? partKeys.every((k) => changedSince('merge-drafts', `work/drafts/${k}.json`) === false)
    : mergedAt > 0 && partKeys.every((k) => (stat(W('drafts', `${k}.json`))?.mtimeMs ?? Infinity) <= mergedAt + NEWER);
  const merged = !!pack && Array.isArray(planJson?.scenes) && planJson.scenes.length > 0 && draftsMerged;
  const designMissing = (planJson?.scenes || []).filter((x) => x?.design && !has(W('designs', `${x.id}.md`))).map((x) => x.id);
  // 語意地圖（specs/024，index.json 有 semanticMap 的包）：第一回合地圖 → --map-merge 全片校正通過（_map.json 比每份地圖新）→ 第二回合草稿
  const mapFlow = !!pack?.semanticMap && draftMissing.length > 0;
  const mapMissing = mapFlow ? partKeys.filter((k) => !has(W('drafts', `${k}.map.md`))) : [];
  let mapOk = false;
  if (steps['map-merge']) mapOk = !!steps['map-merge'].passed && partKeys.every((k) => changedSince('map-merge', `work/drafts/${k}.map.md`) === false);
  else try { const st = JSON.parse(fs.readFileSync(W('drafts', '_map.json'), 'utf8')); mapOk = !!st.passed && partKeys.every((k) => (stat(W('drafts', `${k}.map.md`))?.mtimeMs ?? Infinity) <= (stat(W('drafts', '_map.json'))?.mtimeMs ?? 0) + NEWER); } catch { mapOk = false; }
  const list8 = (a) => `${a.slice(0, 8).join('、')}${a.length > 8 ? '…' : ''}`;
  const s9 = camera && !logged('② 構圖') && !boxed && !pack
    ? { at: '剪好看／停點 ② 構圖（構圖台還沒給使用者看）', skill: 'auto-edit-storyboard 步驟 3', next: '量構圖、開構圖台、記停點 ②，一條指令做完；把它印的回報段（構圖台網址、建議那一行、work/look-preview.jpg）貼給使用者，停下來', stop: '② 構圖', cmds: [framing] }
    : camera && !boxed
      ? { at: '剪好看／② 通過，量講者框', skill: 'auto-edit-storyboard 步驟 4', next: '量講者框、產生分鏡素材，一條指令做完（瘦臉過期會先重跑；印「還在跑」就再跑同一條）', stop: '③ 分鏡表', cmds: [framingDone] }
      : !pack
        ? { at: camera ? '剪好看／產生分鏡素材' : '剪好看／產生分鏡素材（沒有講者：跳過 ② 構圖和講者框）', skill: 'auto-edit-storyboard 步驟 4', next: '產生 work/分鏡素材/（共用.md、語意.md、每章一份 chNN.md）', stop: '③ 分鏡表', cmds: [scaffold] }
        : mapFlow && mapMissing.length
          ? { at: `剪好看／第一回合：語意地圖（還缺 ${list8(mapMissing)}）`, skill: 'auto-edit-storyboard 步驟 5', next: `${partKeys.length > 1 ? '一份派一個子代理寫 work/drafts/<份>.map.md，同一則回覆一次派出（派工：auto-edit-storyboard 的 references/chapter-worker.md 第一回合）' : '照 work/分鏡素材/語意.md 寫 work/drafts/ch01.map.md'}；還缺 ${list8(mapMissing)}。全部寫好才跑下一行（合併地圖、全片校正）`, stop: '③ 分鏡表', cmds: [mapMerge] }
          : mapFlow && !mapOk
            ? { at: '剪好看／全片校正語意地圖', skill: 'auto-edit-storyboard 步驟 5（references/director.md）', next: '跑下一行；沒通過就只讀 work/分鏡素材/語意地圖.md，照它開頭的三件事改各份的地圖（挑 A、統一標法）、寫視覺語言.md，再跑一次', stop: '③ 分鏡表', cmds: [mapMerge] }
            : draftMissing.length
          ? { at: `剪好看／${mapFlow ? '第二回合：' : ''}寫分鏡草稿（還缺 ${list8(draftMissing)}）`, skill: 'auto-edit-storyboard 步驟 5', next: `${partKeys.length > 1 ? `一份派一個子代理寫 work/drafts/<份>.json，同一則回覆一次派出（派工：auto-edit-storyboard 的 references/chapter-worker.md${mapFlow ? ' 第二回合；能接續第一回合的子代理就接續' : ''}）` : '照 work/分鏡素材/ 的 共用.md 和那一份寫 work/drafts/<份>.json'}；還缺 ${list8(draftMissing)}。全部寫好才跑下一行合併`, stop: '③ 分鏡表', cmds: [merge] }
          : !merged
            ? { at: '剪好看／合併分鏡草稿', skill: 'auto-edit-storyboard 步驟 5', next: '合併 work/drafts/ 成 plan.json 的 scenes', stop: '③ 分鏡表', cmds: [merge] }
            : { at: '剪好看／產生分鏡表', skill: designMissing.length ? 'auto-edit-storyboard 步驟 6–7' : 'auto-edit-storyboard 步驟 7', next: designMissing.length ? `內容設計動畫一段派一個設計師子代理寫鏡位腳本，同一則回覆一次派出（派工：auto-edit-motion 的 references/design.md）：${list8(designMissing)}；全部回來才跑下一行（build、截圖、產生分鏡表、停在停點 ③）` : '截圖、產生分鏡表、開分鏡表頁、記停點 ③，一條指令做完', stop: '③ 分鏡表', cmds: [storyCmd] };

  // 停點 ③：確認了就套回 plan.json；還沒給使用者看就產生分鏡表（--storyboard 會記 ③ 待回覆）
  const s10 = passed('③ 分鏡表')
    ? { at: '剪好看／③ 通過，把分鏡表的修改套回 plan.json', skill: 'auto-edit-storyboard 步驟 8', next: '把網頁改的字、音效、金句套回 plan.json', stop: '④ 完成影片預覽', cmds: [apply] }
    : { at: '剪好看／停點 ③ 分鏡表', skill: 'auto-edit-storyboard 步驟 7', next: '截圖、產生分鏡表、開分鏡表頁、記停點 ③，一條指令做完', stop: '③ 分鏡表', cmds: [storyCmd] };
  // --apply-storyboard 沒改到字時 plan.json 的時間不變：看它記下的時間，套過之後沒再改就不算「比 plan.json 新」
  let sbRec = null;
  try { sbRec = JSON.parse(fs.readFileSync(W('hyperframes', '.cache', 'storyboard.json'), 'utf8')); } catch { /* 舊專案沒有這個檔 */ }
  const sbAt = Number(sbRec?.at) || 0;
  const storyApplied = passed('③ 分鏡表') && has(story) && sbAt >= stat(story).mtimeMs;
  // 分鏡表還沒套回：記過 storyboard／apply-storyboard 就看「沒套回過、套回之後又整份重產、或有人改過」。有人改過先看 storyboard-state 的雜湊
  // （--review、回饋輪這些工具照正本重寫時會同步記，不算改過）；沒有雜湊紀錄才看套回時記的指紋。沒記過標記看 storyboard.md 是不是比 plan.json 新
  const storyMarked = !!(steps.storyboard || steps['apply-storyboard']);
  const applied = steps['apply-storyboard'];
  const edited = () => (sbRec?.hash ? storyboardDirty({ project, out: W('hyperframes') }) : changedSince('apply-storyboard', 'work/storyboard.md') !== false);
  const storyNewer = () => (storyMarked
    ? has(story) && (!applied || String(steps.storyboard?.at ?? '') > String(applied.at) || edited())
    : newer(story, plan));
  const storyPending = () => storyNewer() && !storyboardByVersions(project) && (storyMarked || !storyApplied);
  // build 過之後 plan.json 有沒有改過；final.mp4 驗收過之後有沒有換過；初剪重做之後螢幕錄影同步要不要重算（沒記過照舊比修改時間）
  const planStale = () => changedSince('build', 'work/hyperframes/plan.json') ?? newer(plan, index);
  const finalStale = () => changedSince('qc', 'output/final.mp4') ?? newer(finalMp4, sheet);
  const syncStale = () => changedSince('screen-sync', 'work/cuts.v1.json') ?? newer(W('cuts.v1.json'), W('screen-sync.json'));
  const noStopYet = sl.rows.length > 0 && !logged('③ 分鏡表') && !logged('④ 完成影片預覽') && !logged('⑤ 剪輯台');

  // 定稿（--review：build、audit、完成態拼圖、開預覽、記 ④ 待回覆），或（④ 通過）輸出
  const s12 = passed('④ 完成影片預覽')
    ? { at: '輸出／④ 通過', skill: 'auto-edit-deliver', next: `輸出完成影片：測試片段、整支 render、驗收，一條指令做完（${bgNote}）`, stop: '無', cmds: [deliver] }
    : { at: '剪好看／定稿，停點 ④ 完成影片預覽', skill: 'auto-edit-review 流程 A', next: 'build、audit、完成態拼圖、開完成影片預覽、記停點 ④，一條指令做完；有 ✖ 照 → 改了再跑一次。之後打開它印的拼圖，只找 FAIL（REVIEW.md §2），都修好才把停點那兩行貼給使用者', stop: '④ 完成影片預覽', cmds: [review] };

  // 素材盤點（排在 ② 之前：看素材是機器和子代理的事，不用等使用者）
  const inv = !has(story) ? inventoryTodo(project) : [];
  const scanned = has(W('media', 'index.md'));
  const invNext = `素材盤點：每支錄影、每批圖片派一個子代理寫 work/media/notes/<檔名>.json（auto-edit-screen 步驟 1）${scanned ? '' : '；先跑下一行產生素材清單與 contact sheet'}。還缺 ${inv.length} 個：${inv.slice(0, 8).join('、')}${inv.length > 8 ? '…' : ''}`;

  const T = [
    ['S0', () => mains === 0, '開新專案（還沒有主軌素材）', 'auto-edit-longform 的 references/new-project.md', '把講解放進 assets/camera/（有畫面）或 assets/voice/（只有聲音）；邊錄邊講的螢幕錄影放 assets/screen/ 也算；講稿存成 講稿.md', '無', 'assets/camera/ 與 assets/voice/ 都沒有檔，assets/screen/ 也沒有邊錄邊講的錄影', []],
    // 一律先接主軌才能到 ①（多支主軌的順序在 ① 一起問，改了順序再重接）；prep 一條指令做到 ①（會記 ① 待回覆）
    ['S1', () => !has(W('main.mp4')) && !has(W('cuts.md')) && !has(W('rough.mp4')), '剪乾淨／接主軌', 'auto-edit-rough 步驟 1', `接主軌、轉逐字稿、找 NG、寫 work/cuts.md、開剪輯清單頁、記停點 ①，一條指令做完（${bgNote}）`, '① 剪輯清單', `主軌有 ${mains} 個檔、沒有 work/main.mp4`, [prep]],
    ['S2', () => !has(W('cuts.md')), '剪乾淨／轉逐字稿、找 NG', 'auto-edit-rough 步驟 1', `轉逐字稿、找 NG、寫 work/cuts.md、開剪輯清單頁、記停點 ①，一條指令做完（${bgNote}）`, '① 剪輯清單', '沒有 work/cuts.md', [prep]],
    ['S3', () => !has(W('rough.mp4')), passed('① 剪輯清單') ? '剪乾淨／① 通過，輸出初剪' : '剪乾淨／停點 ① 剪輯清單', passed('① 剪輯清單') ? 'auto-edit-rough 步驟 2' : 'auto-edit-rough 步驟 1',
      passed('① 剪輯清單') ? `照 cuts.md 的「剪」欄輸出初剪、驗證、字幕、剪接點，一條指令做完（${bgNote}）` : `重開剪輯清單頁、記停點 ①（cuts.md 不會重寫，使用者勾的都留著；${bgNote}）`,
      '① 剪輯清單', '有 work/cuts.md、沒有 work/rough.mp4', passed('① 剪輯清單') ? [rough] : [prep]],
    // 下面幾個是 media.mjs rough 中途被打斷的狀態：再跑一次會接著做（它會先看哪幾步做完了）；rough.mp4、rough.srt、cutpoints.json 都在時 rough 算做完，才用單支指令
    ['S4', () => !has(W('rough.srt')), '剪乾淨／字幕', 'auto-edit-rough 步驟 2', `接著做字幕、剪接點（${bgNote}）`, afterRough, '有 work/rough.mp4、沒有 work/rough.srt', [rough]],
    ['S5', () => !aligned && !has(plan), '剪乾淨／字幕斷句', 'auto-edit-rough 步驟 2', has(W('cutpoints.json')) ? '跑 media.mjs srt-align --dry-run 看斷句表，合理再去掉 --dry-run；之後只改錯字' : `接著做字幕斷句、剪接點（${bgNote}）`, afterRough, '沒有 work/rough.srt.align-*（srt-align 還沒跑）', [has(W('cutpoints.json')) ? tool('media.mjs srt-align', ' --dry-run') : rough]],
    ['S6', () => !words && !snapped, '剪乾淨／字幕對齊', 'auto-edit-rough 步驟 2', '跑 media.mjs snap-srt --dry-run，看表合理再去掉 --dry-run（只跑一次）', afterRough, '沒有 work/transcript.json（字幕時間是整句按字數估的）、也沒有 work/rough.srt.bak-*（snap-srt 還沒跑；srt-split 的備份叫 rough.srt.split-*，不算）', [tool('media.mjs snap-srt', ' --dry-run')]],
    ['S7', () => !has(W('cutpoints.json')), '剪乾淨／剪接點', 'auto-edit-rough 步驟 2', `接著做剪接點（${bgNote}）`, afterRough, '沒有 work/cutpoints.json', [rough]],
    ['S7s', () => scrMain && (!has(W('screen-sync.json')) || syncStale()), '剪乾淨／螢幕錄影同步', 'auto-edit-rough 步驟 2', '跑 media.mjs screen-sync（邊錄邊講的螢幕錄影：算出初剪後每段在錄影的秒數；寫好 plan.json 草稿後再加 --write-plan）', afterRough, has(W('screen-sync.json')) ? (marks('screen-sync', 'work/cuts.v1.json') ? `work/cuts.v1.json 在上次螢幕錄影同步之後改過（初剪重做過）${MARKED}` : 'work/cuts.v1.json 比 work/screen-sync.json 新（初剪重做過）') : 'work/main.json 有邊錄邊講的螢幕錄影、還沒有 work/screen-sync.json', [tool('media.mjs screen-sync')]],
    ['S7m', () => inv.length > 0, '剪好看／素材盤點', 'auto-edit-screen 步驟 1', invNext, afterRough, `assets/screen、assets/images 有 ${inv.length} 個素材在 work/media/notes/ 還沒有筆記`, scanned ? [] : [tool('media.mjs scan')]],
    ['S8', () => camera && !has(W('構圖預覽.jpg')), '剪好看／構圖', 'auto-edit-storyboard 步驟 3', '量構圖、開構圖台、記停點 ②，一條指令做完；把它印的回報段（構圖台網址、建議那一行、work/look-preview.jpg）貼給使用者，停下來。初剪好了就接這一步，不用等使用者說「剪好看」；使用者明說只要「剪乾淨」才停在初剪', '② 構圖', `沒有 work/構圖預覽.jpg${lookTodo ? `；講者調光瘦臉還沒好（look.mjs 的下一步：${lookTodo.step}）` : ''}`, [framing]],
    ['S9', () => !has(story), s9.at, s9.skill, s9.next, s9.stop, '沒有 work/storyboard.md', s9.cmds],
    ['S10', () => !has(plan) || storyPending() || noStopYet, s10.at, s10.skill, s10.next, s10.stop, has(plan) ? (storyNewer() ? (storyMarked ? `work/storyboard.md 產生或改過之後還沒套回 plan.json${MARKED}` : 'work/storyboard.md 比 work/hyperframes/plan.json 新') : '停點紀錄還沒有 ③') : '沒有 work/hyperframes/plan.json', s10.cmds],
    ['S11', () => !has(index) || planStale(), s12.at, s12.skill, s12.next, s12.stop, `${has(index) ? (marks('build', 'work/hyperframes/plan.json') ? `plan.json 在上次 build 之後改過${MARKED}` : 'plan.json 比 index.html 新') : '沒有 work/hyperframes/index.html'}${lookTodo ? `；講者調光瘦臉還沒好（look.mjs 的下一步：${lookTodo.step}）` : ''}`, s12.cmds],
    ['S12', () => !has(finalMp4), s12.at, s12.skill, s12.next, s12.stop, '沒有 output/final.mp4', s12.cmds],
    ['S13', () => !has(sheet) || finalStale(), '交付／驗收', 'auto-edit-deliver', `跑驗收（內容沒變不會重新 render；${bgNote}）`, '無', has(sheet) ? (marks('qc', 'output/final.mp4') ? `final.mp4 在上次驗收之後換過${MARKED}` : 'final.mp4 比 qc-sheet.jpg 新') : '沒有 output/qc/qc-sheet.jpg', [deliver]],
    ['S14', () => true, '完成', 'auto-edit-review 流程 B', `等使用者的修改要求：要改一段就跑 ${begin}`, '無', '完成影片與驗收截圖都在', []],
  ];
  const hit = T.find(([, cond]) => cond());
  let [stage, , at, skill, next, nextStop, why, cmds] = hit;
  ev.push(why);
  // 構圖預覽（S8）與 build（S11）前，講者調光瘦臉還沒好 → 下一步直接用 lookNextStep 的說明＋指令（指令單獨一行，C-01）
  if (lookTodo && ['S8', 'S11'].includes(stage)) { next = lookTodo.note; cmds = [lookTodo.cmd]; }
  // ③ 通過後動畫還沒做：內容設計動畫、照範例改的 x 檔都一段一個子代理（派工訊息走「→ 派工：」，不放在「→ 下一步」下面）
  let toDispatch = null;
  if (['S11', 'S12'].includes(stage) && motion.length && !passed('④ 完成影片預覽')) {
    at = `剪好看／做動畫（還沒做：${list8(motion)}）`;
    skill = 'auto-edit-motion 步驟 1–2';
    // 接手時主代理沒看過 --apply-storyboard 印的派工行：這裡照印同樣的行，不讓主代理自己寫派工訊息
    const isDz = (id) => planJson?.scenes?.find((s) => s.id === id)?.design, scripted = (id) => fs.existsSync(W(path.join('designs', `${id}.md`)));
    const dz = motion.filter(isDz), lines = [
      [dz.filter(scripted), `你是設計師，負責 ${A} 的內容設計動畫 <段>。鏡位腳本已經寫好：照 .agents/skills/auto-edit-motion/references/design.md 做動畫（第 2 節）。`],
      [dz.filter((id) => !scripted(id)), `你是設計師，負責 ${A} 的內容設計動畫 <段>。照 .agents/skills/auto-edit-motion/references/design.md 寫鏡位腳本、接著做動畫（不用等確認）。`],
      [motion.filter((id) => !isDz(id)), '照 .agents/skills/auto-edit-motion/references/worker-brief.md 改 <段> 的動畫檔。'],
    ].filter(([ids]) => ids.length).map(([ids, l]) => `（${ids.join('、')}）${l}`);
    toDispatch = { note: `做 ${motion.length} 段動畫：一段派一個子代理，同一則回覆一次派出（一次最多 ${agentLimit(path.resolve(HERE, '..', '..'))} 個，回來再派下一批）；派工訊息只送下面對應的那一行（換掉 <段>，不要另外加要求）`, msgs: lines };
    next = `${motion.length} 段動畫照上面「→ 派工：」派出，全部回來才跑下一行`;
    nextStop = '④ 完成影片預覽';
    cmds = [review];
    ev.push(`plan.json 的 ${list8(motion)} 動畫還沒做（x 檔不在、還是範例原文，或內容設計動畫還是占位）`);
  }
  // 改版（停點 ④ 之後）：work/versions/<段>/v<N>/ 只有提案 分鏡.md、還沒存進做好的檔
  const round = openRound(project);
  const revs = round || ['S11', 'S12', 'S13', 'S14'].includes(stage) ? pendingRevisions(project) : [];
  if (revs.length || round) toDispatch = null;
  if (revs.length) {
    const names = revs.map((r) => `${r.id} v${r.v}`).join('、'), ids = revs.map((r) => r.id).join(',');
    const done = revs.every((r) => r.state === '已確認');
    at = `改版／${names}（${done ? '分鏡已確認，還沒做完' : '分鏡還沒給使用者確認'}）`;
    skill = done ? 'auto-edit-review references/revise.md 第 2–3 步、auto-edit-motion' : 'auto-edit-review references/revise.md 第 1 步';
    next = done ? `照 auto-edit-motion 做 ${names.replace(/ v\d+/g, '')}${round ? '，做完跑下一行' : `，build、audit --only 都 0 個 ✖ 之後跑下一行（存進 v${revs[0].v}、出比較影片），再開完成影片預覽`}`
      : `寫好 work/versions/<段>/v<N>/分鏡.md 的「這版要改什麼」和「## 分鏡」，跑下一行記停點，停在停點 ③（${names}）`;
    cmds = done ? [round ? finish : `${TOOLS}/versions.mjs save --project ${A} --seg ${ids}`] : [mark(`③ 分鏡表（${names}）`, '待回覆')];
    nextStop = done ? '④ 完成影片預覽' : '③ 分鏡表';
    ev.push(`work/versions/ 有沒做完的改版：${revs.map((r) => `${r.id}/v${r.v}（${r.state}）`).join('、')}`);
  } else if (round) {
    at = `回饋輪 r${round.n}／${list8(round.segs)}（還沒 finish）`;
    skill = 'auto-edit-review 流程 B';
    next = `改 plan.json 的 ${list8(round.segs)}（情境動畫改 x 檔；忘了原文就再跑一次 versions.mjs begin --seg 那幾段，會再印），改好跑下一行（build、audit、存版本、紀錄、停點都一次做完）`;
    cmds = [finish];
    nextStop = '④ 完成影片預覽';
    ev.push(`回饋輪 r${round.n} 還沒 finish（work/feedback/r${round.n}.md）`);
  }
  // 背景工作還在跑：下一步就是同一條指令
  const job = pendingJob(project);
  if (job) {
    toDispatch = null;
    at = `${at}（背景工作 ${job.name} ${job.state === 'running' ? '還在跑' : '做完了，結果還沒看'}）`;
    next = `再跑一次同一條指令會${job.state === 'running' ? '接著等' : '印出結果'}，不會重跑（work/.jobs/${job.name}.log）`;
    cmds = [job.cmd];
    ev.push(`work/.jobs/${job.name}.json 是 ${job.state}`);
  }
  // 停點在等：蓋過上面（回饋輪開著時，④ ⑤ 已經回覆過了，不算在等）
  const roundBusy = (r) => !!round && ['④ 完成影片預覽', '⑤ 剪輯台'].includes(r.stop);
  const waitRows = [...sl.last.values()].filter((r) => WAIT_STATES.includes(r.state) && !roundBusy(r));
  const waiting = waitRows.map((r) => r.label);
  const w = [...waitRows].sort((a, b) => b.line - a.line)[0];
  let stopLine = null, after = [], needEditor = false;
  if (w) {
    const phase = ['① 剪輯清單'].includes(w.stop) ? '剪乾淨' : ['⑥ 背景預覽'].includes(w.stop) ? '換風格' : ['⑤ 剪輯台'].includes(w.stop) ? '剪輯台' : '剪好看';
    at = `${phase}／停點 ${w.label}（待回覆）`;
    nextStop = w.stop;
    cmds = [];
    toDispatch = null;
    const rev = w.stop === '③ 分鏡表' ? [...w.label.matchAll(/([A-Za-z0-9-]+) v(\d+)/g)] : [];
    const urls = editorUrls(project);
    const u = (k, zh) => urls?.[k] ?? `<${zh}>`;
    const redo = () => mark(w.stop, '修改後重停', SAID);
    if (rev.length) {
      const ids = rev.map((m) => m[1]).join(',');
      skill = 'auto-edit-review 流程 D（references/revise.md 第 1–2 步）';
      next = `等使用者看 ${rev.map((m) => `work/versions/${m[1]}/v${m[2]}/分鏡.md`).join('、')}；回覆「可以」後跑 versions.mjs accept --seg ${ids}，再照 auto-edit-motion 做（要改就改那份 分鏡.md 再停一次）`;
      stopLine = stopLines.revise(w.label, rev.map((m) => `work/versions/${m[1]}/v${m[2]}/分鏡.md`));
      after = [{ when: '回覆「可以」', cmds: [`${TOOLS}/versions.mjs accept --project ${A} --seg ${ids} --say "<使用者原話>"`] }, { when: '要改的拍：改那份 分鏡.md，重貼停點', cmds: [mark(w.label, '修改後重停', SAID)] }];
    } else {
      const table = {
        '① 剪輯清單': {
          skill: 'auto-edit-rough 步驟 1–2', urlKey: 'cuts',
          next: '等使用者在剪輯清單頁（editor.mjs 印的「剪輯清單：」網址）勾好後回覆；回覆後先重新讀 cuts.md（只剪「剪」欄是 [x] 的列），再輸出初剪',
          line: () => stopLines.cuts(u('cuts', '剪輯清單網址')),
          after: [{ when: '回覆「可以」「改好了」（工具照 cuts.md 的「剪」欄剪，會記 ① 通過）', cmds: [`${rough}${SAID}`] }, { when: '指名要改的列：改 work/cuts.md 那一列的「剪」，重貼停點（改主軌順序、補錄照 auto-edit-rough「停點」那張表）', cmds: [redo()] }],
        },
        '② 構圖': {
          skill: 'auto-edit-storyboard 步驟 3–4', urlKey: 'framing',
          next: '等使用者在構圖台拖好框（自動存，剪輯台直接寫進 plan.json 的 frame）後回覆；回覆後跑對應的那一條：記 ② 通過、量講者框、產生分鏡素材，一條指令做完（印「還在跑」就再跑同一條）',
          line: () => stopLines.framing(u('framing', '構圖台網址'), { look: has(W('look-preview.jpg')) }),
          after: [{ when: '回覆「調好了」', cmds: [`${framingDone}${SAID}`] }, { when: '回覆「用建議的」', cmds: [`${framingDone} --use suggested${SAID}`] }, { when: '回覆倍率（例「1.3 倍」）', cmds: [`${framingDone} --use <倍率>${SAID}`] }],
        },
        '③ 分鏡表': {
          skill: 'auto-edit-storyboard 步驟 7–8', urlKey: 'storyboard',
          next: '等使用者在分鏡表頁（editor.mjs 印的「分鏡表：」網址）改好後回覆；回覆「可以」或「改好了」就跑 --apply-storyboard：有「想換成」「補充說明」的段照它印的重做、重截再停一次，都沒有才記 ③ 通過',
          line: () => stopLines.storyboard(u('storyboard', '分鏡表網址')),
          after: [{ when: '回覆「可以」「改好了」（工具讀 work/storyboard.md：有「想換成」「補充說明」就印要求、照它印的改；沒有才套回 plan.json、記 ③ 通過）', cmds: [`${apply}${SAID}`] }, { when: '指名要改（「s05 換成側邊欄」）：改 plan.json 那段，重截那幾段、重貼停點', cmds: [`${storyCmd} --only <段 id>`] }],
        },
        '④ 完成影片預覽': {
          skill: 'auto-edit-review 流程 A、B', urlKey: 'final',
          next: '等使用者看完成影片預覽（editor.mjs 印的「完成影片預覽：」網址）；要改就開一輪回饋，說可以就輸出完成影片',
          line: () => stopLines.final(u('final', '完成影片預覽網址')),
          after: [{ when: '回覆「可以了，輸出完成影片」（deliver 會記 ④ 通過）', cmds: [`${deliver} --said "<使用者原話>"`] }, { when: '指名段＋具體改法（「s05 往左移」「照修改單改」）', cmds: [begin] }, { when: '指名段但只說要更好（「s12 重新設計」；new 沒開輪會自己開、自己記停點）', cmds: [`${TOOLS}/versions.mjs new --project ${A} --seg <段 id> --note "<使用者原話>"`] }, { when: '「s12 用 v1」「退回上一版」（use 沒開輪會一次做完）', cmds: [`${TOOLS}/versions.mjs use --project ${A} --seg <段 id> --ver v<N> --said "<使用者原話>"`] }],
        },
        '⑤ 剪輯台': {
          skill: 'auto-edit-review 流程 C', urlKey: 'main',
          next: '等使用者在剪輯台調完說「調好了」；之後重新讀 plan.json 與 rough.srt 再定稿',
          line: () => stopLines.editor(u('main', '剪輯台網址')),
          after: [{ when: '回覆「調好了」（先重新讀 plan.json 與 rough.srt）', cmds: [mark(w.stop, '通過', SAID), review] }, { when: '「照修改單改」（讀 work/feedback/editor-requests.md）', cmds: [begin] }],
        },
        '⑥ 背景預覽': {
          skill: 'auto-edit-style 步驟 2–4', urlKey: null,
          next: '等使用者看三張背景圖；說可以才複製進 shared/template/',
          line: () => stopLines.bg('<暫存資料夾>'),
          after: [{ when: '回覆「可以」（再照 auto-edit-style 把圖放進 shared/template/）', cmds: [mark(w.stop, '通過', SAID)] }],
        },
      }[w.stop];
      skill = table.skill;
      next = table.next;
      stopLine = table.line();
      after = table.after;
      needEditor = !!table.urlKey && !urls;
      if (needEditor) cmds = [editor];
    }
    ev.unshift(`work/製作進度.md 停點紀錄最後一列「${w.time}｜${w.label}｜${w.state}」`);
  }
  return { project, stage, at, skill, next, cmd: cmds[0] ?? null, cmds, dispatch: toDispatch, nextStop, waiting, stopLine, after, needEditor, round: round ? `r${round.n}` : null, job: job?.name ?? null, camera, feedback: `r${nextRound(project)}`, evidence: ev };
}

// 預設輸出的最後幾行：要做的事（→ 下一步＋指令；有停點在等時，回覆後要跑的指令＋停點那兩行）
// 「→ 下一步」下面只放指令；停點在等（剪輯台開著）時停點那兩行是最後兩行（和 report() 回報段一致），上面一行是一般說明
export function actionLines(s) {
  if (!s.stopLine) return [...(s.dispatch ? dispatch(s.dispatch.note, ...s.dispatch.msgs) : []), ...next(s.next, ...s.cmds)];
  const L = [];
  for (const a of s.after) { L.push(`使用者${a.when}：`); for (const c of a.cmds) L.push(`  ${c}`); }
  if (s.needEditor) return [...L, s.stopLine, ...next('剪輯台沒開：跑下一行拿網址，把上面那兩行的 <…網址> 換成它印的，貼給使用者（回覆最後兩行是那個停點），然後等回覆', ...s.cmds)];
  return [...L, '等使用者回覆：回覆的最後兩行照抄下面這兩行', s.stopLine];
}

// ---------- 跨集偏好（025）：各專案回饋輪的「建議改規則」→ 使用者確認 → shared/偏好.md ----------
export { readPrefs, prefsFile };
const PREFS_HEAD = ['# 剪輯偏好', '', '使用者說過「以後都…」、而且確認每一集都照做的規則。由 status.mjs --prefs-add 寫，不要手動改別的地方；寫分鏡、改段落前先讀「照做」這一節。', ''];
function writePrefs(root, prefs) {
  const row = (x) => `- ${x.text}${x.from ? `（${x.from}）` : ''}`;
  const L = [...PREFS_HEAD, '## 照做', '', ...(prefs.keep.length ? prefs.keep.map(row) : ['（還沒有）']), '', '## 不採用', '', ...(prefs.skip.length ? prefs.skip.map(row) : ['（還沒有）']), ''];
  writeAtomic(prefsFile(root), L.join('\n'));
}
// 各專案 work/feedback/r<N>.md 的「建議改規則：…」（同一行，或下面接著的「- 」列）；「無」和工具留的提示（原話有…）不算
export function collectRuleNotes(root) {
  const out = [], dir = path.join(root, 'projects');
  let names = [];
  try { names = fs.readdirSync(dir).sort(); } catch { return out; }
  for (const name of names) {
    const fb = path.join(dir, name, 'work', 'feedback');
    let files = [];
    try { files = fs.readdirSync(fb).filter((f) => /^r\d+\.md$/.test(f)).sort((a, b) => Number(a.slice(1, -3)) - Number(b.slice(1, -3))); } catch { continue; }
    for (const f of files) {
      const ls = fs.readFileSync(path.join(fb, f), 'utf8').split(/\r?\n/);
      const at = ls.findIndex((l) => /^建議改規則[：:]/.test(l.trim()));
      if (at < 0) continue;
      const texts = [ls[at].trim().replace(/^建議改規則[：:]\s*/, '')];
      for (let i = at + 1; i < ls.length && /^\s*-\s+/.test(ls[i]); i++) texts.push(ls[i].replace(/^\s*-\s+/, ''));
      for (const t of texts.map((x) => x.trim()).filter((x) => x && x !== '無' && !/^（(原話有|沒有寫)/.test(x))) out.push({ text: t, project: name, round: f.slice(0, -3), from: `projects/${name} ${f.slice(0, -3)}` });
    }
  }
  return out;
}
// 還沒問過使用者的：不在「照做」也不在「不採用」，同一句只留第一次出現的
export function pendingPrefs(root, prefs = readPrefs(root)) {
  const known = new Set([...prefs.keep, ...prefs.skip].map((x) => prefKey(x.text))), seen = new Set(), out = [];
  for (const n of collectRuleNotes(root)) { const k = prefKey(n.text); if (!k || known.has(k) || seen.has(k)) continue; seen.add(k); out.push({ ...n, id: `a${out.length + 1}` }); }
  return out;
}
const PREFS_CMD = 'node shared/template/tools/status.mjs';
export function prefsLines(root) {
  const prefs = readPrefs(root), pend = pendingPrefs(root, prefs);
  const L = [`偏好（shared/偏好.md「照做」）：${prefs.keep.length} 條`];
  prefs.keep.forEach((x, i) => L.push(`  ${i + 1}. ${x.text}${x.from ? `（${x.from}）` : ''}`));
  L.push(`還沒問過使用者的「以後都…」：${pend.length} 條${pend.length ? '（各專案 work/feedback/ 的「建議改規則」）' : ''}`);
  for (const x of pend) L.push(`  ${x.id}. ${x.text}（${x.from}）`);
  // 編號一律加雙引號：PowerShell 會把逗號拆開
  if (pend.length) L.push(...next('把上面這幾條唸給使用者，問哪幾條以後每一集都照做；要照做的跑第一行、不要的跑第二行（編號用逗號隔開，這兩行的編號換成他說的）', cmdLine('status.mjs', ['--prefs-add', { raw: `"${pend.map((x) => x.id).join(',')}"` }]), cmdLine('status.mjs', ['--prefs-skip', { raw: `"${pend[0].id}"` }])));
  return L;
}
const today = () => { const d = new Date(), q = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${q(d.getMonth() + 1)}-${q(d.getDate())}`; };
// what＝'add'｜'skip'；arg＝"a1,a3"（--prefs 印的編號）或一句規則
export function prefsApply(root, what, arg) {
  const prefs = readPrefs(root), pend = pendingPrefs(root, prefs), to = what === 'add' ? prefs.keep : prefs.skip;
  const ids = String(arg ?? '').split(/[,，\s]+/).filter(Boolean);
  let items;
  if (ids.length && ids.every((x) => /^a\d+$/i.test(x))) {
    items = ids.map((id) => { const x = pend.find((p) => p.id === id.toLowerCase()); if (!x) throw new Error(`沒有 ${id} 這一條 → 先跑 ${PREFS_CMD} --prefs 看編號（編號每次重排）`); return { text: x.text, from: `${x.from}，${today()}` }; });
  } else {
    const text = String(arg ?? '').trim();
    if (!text) throw new Error(`要寫編號（a1,a3）或一句規則 → 例 ${PREFS_CMD} --prefs-${what} "a1,a3"`);
    items = [{ text, from: `使用者說的，${today()}` }];
  }
  const added = [];
  for (const it of items) { if ([...prefs.keep, ...prefs.skip].some((x) => prefKey(x.text) === prefKey(it.text))) continue; to.push(it); added.push(it); }
  writePrefs(root, prefs);
  return { added, prefs };
}
export function prefsDrop(root, arg) {
  const prefs = readPrefs(root), n = Number(arg);
  if (!Number.isInteger(n) || n < 1 || n > prefs.keep.length) throw new Error(`「照做」沒有第 ${arg} 條（現在 ${prefs.keep.length} 條）→ 先跑 ${PREFS_CMD} --prefs 看編號`);
  const [gone] = prefs.keep.splice(n - 1, 1);
  writePrefs(root, prefs);
  return { gone, prefs };
}

const SUMMARY_HOW = `讀 work/rough.srt，寫 ${SUMMARY_MAX} 字內的影片摘要（一到兩句描述＋2–6 個列點；格式見 .agents/skills/auto-edit-rough/SKILL.md 步驟 3）`;
const VALUE_FLAGS = ['project', 'mark', 'state', 'said', 'say', 'back', 'format', 'prefs-add', 'prefs-skip', 'prefs-drop', 'agents'];
const BOOL_FLAGS = ['help', 'json', 'timeline', 'init', 'prefs', 'summary'];
// 一次只能做一件（--state、--said、--back 跟著 --mark；--format 跟著 --init；--json、--project 是修飾）
const MODES = ['mark', 'init', 'timeline', 'summary', 'prefs', 'prefs-add', 'prefs-skip', 'prefs-drop', 'agents'];
export function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [k, inline] = /^--[\w-]/.test(a) ? splitFlag(a) : [null];
    if (BOOL_FLAGS.includes(k) && inline === undefined) { flags[k] = true; continue; }
    if (!VALUE_FLAGS.includes(k)) throw new Error(`沒有 ${a} 這個參數（用 --help 看用法）`);
    try { [flags[k], i] = valueOf(argv, i, k, inline); } catch (e) { throw new Error(`${e.message}（用 --help 看用法）`); }
  }
  oneOf(flags, MODES);
  return flags;
}

// ---------- 032：別的工具提供的檢查（素材清單 A10、Skill 安裝 D3、plan.json 設定 A9③）----------
// 檔還不在、或沒有那個函式（舊版、升級到一半）就跳過那一項，不讓 status 壞掉
async function optionalFn(file, name) {
  try { const m = await import(pathToFileURL(file).href); return typeof m[name] === 'function' ? m[name] : null; } catch { return null; }
}

// A10：assets/、講稿.md 和 media.mjs prep 記的清單比（diff＝lib/assets-manifest.mjs 的 diffManifest；null＝舊專案沒有清單，不印）
export function assetsWarnLine(diff, label) {
  const changed = diff?.changed || [], missing = diff?.missing || [];
  if (!changed.length && !missing.length) return null;
  const few = (a, what) => (a.length > 3 ? `${a.slice(0, 3).join('、')} 等 ${a.length} 個${what}` : `${a.join('、')} ${what}`);
  const what = [changed.length ? few(changed, '被改過') : '', missing.length ? few(missing, '不見了') : ''].filter(Boolean).join('；');
  return `素材：⚠ ${what}（和 media.mjs prep 記的清單比）→ 素材只能讀，不要再動它；問使用者是不是故意換的，是的話要照新素材重剪就跑 ${TOOLS}/media.mjs prep --project ${projArg(label)} --again`;
}

// D3：裝好的 Skill 和 .agents/skills/ 對不上（r＝setup/install-skills.mjs 的 checkInstalled()；實測 5–25 毫秒，每次 status 都跑）。
// 第一筆自己帶「→ 怎麼改」（例：同名不是它裝的）就用它的，沒帶就是重裝指令
export function skillsWarnLine(r) {
  if (!r || r.ok !== false) return null;
  const s = (r.stale || []).filter(Boolean).map((x) => String(x).replace(/^✖\s*/, ''));
  const first = s[0] ?? '裝好的 Skill 和 .agents/skills/ 不一樣', i = first.indexOf('→');
  const head = i < 0 ? first : first.slice(0, i).trim(), own = i < 0 ? '' : first.slice(i + 1).trim();
  const fix = !own ? 'node setup/install-skills.mjs' : own.includes('install-skills.mjs') ? own : `${own}，再跑 node setup/install-skills.mjs`;
  return `Skill：⚠ ${head}${s.length > 1 ? `…（共 ${s.length} 處）` : ''} → ${fix}`;
}

async function skillsLine(root) {
  const check = await optionalFn(path.join(root, 'setup', 'install-skills.mjs'), 'checkInstalled');
  if (!check) return null;
  try { return skillsWarnLine(await check()); } catch { return null; }
}

async function assetsLine(project, label) {
  const diff = await optionalFn(path.join(HERE, 'lib', 'assets-manifest.mjs'), 'diffManifest');
  if (!diff) return null;
  try { return assetsWarnLine(await diff(project), label); } catch { return null; }
}

// A9③：--init --format 時 plan.json 已經有了就一起改 format（不然開工決策表和 plan.json 兩個來源對不上）
export async function initFormat(project, flag) {
  if (flag == null || !fs.existsSync(path.join(project, 'work', 'hyperframes', 'plan.json'))) return null;
  const format = resolveFormat({ flag }).format;
  const setPlan = await optionalFn(path.join(HERE, 'lib', 'plan-set.mjs'), 'setPlan');
  if (!setPlan) return null;
  try { return { changes: await setPlan(project, { format }) }; } catch (e) { return { error: String(e.message).startsWith('✖') ? e.message : `✖ ${e.message}` }; }
}

async function cli() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  const root = path.resolve(HERE, '..', '..', '..');
  // 子代理一次最多派幾個：不看專案
  if (flags.agents != null) { const r = saveAgentLimit(path.join(root, 'shared'), flags.agents); console.log(`✓ 子代理一次最多派 ${r.n} 個（寫進 shared/${SETTINGS_FILE}；之後工具印的派工那一行都照這個數字）`); return 0; }
  // 跨集偏好：不看專案
  if (flags['prefs-add'] != null || flags['prefs-skip'] != null) {
    const what = flags['prefs-add'] != null ? 'add' : 'skip';
    const r = prefsApply(root, what, flags[`prefs-${what}`]);
    console.log(r.added.length ? `✓ ${what === 'add' ? '以後每一集都照做' : '不採用、下次不再問'}：${r.added.map((x) => `「${x.text}」`).join('、')}（寫進 shared/偏好.md）` : '這幾條已經記過了，沒有新增');
    for (const l of prefsLines(root)) console.log(l);
    return 0;
  }
  if (flags['prefs-drop'] != null) { const r = prefsDrop(root, flags['prefs-drop']); console.log(`✓ 拿掉了：「${r.gone.text}」`); for (const l of prefsLines(root)) console.log(l); return 0; }
  if (flags.prefs) { for (const l of prefsLines(root)) console.log(l); return 0; }
  const project = findProject(flags, root);
  const label = labelOf(project);
  if (flags.mark != null || flags.state != null) {
    const row = markStop(project, { stop: flags.mark, state: flags.state, said: saidOf(flags), back: flags.back });
    if (flags.json) console.log(JSON.stringify({ project: label, row }, null, 2));
    else console.log(row);
    return 0;
  }
  if (flags.init) {
    const pf = await initFormat(project, flags.format);   // 先改 plan.json，initProgress 比對版式時才是新的
    if (pf?.error) { console.log(pf.error); return 1; }
    const r = initProgress(project, { format: flags.format ?? null });
    const after = projectStatus(project);
    if (flags.json) { console.log(JSON.stringify({ project: label, file: posix(path.relative(process.cwd(), r.file)), created: r.created, facts: r.facts, warnings: r.warnings, ...(pf ? { plan: pf.changes } : {}) }, null, 2)); return 0; }
    console.log(`製作進度：${posix(path.relative(process.cwd(), r.file))}（${r.created ? '新建' : '已經有，只補空的欄'}）`);
    for (const c of pf?.changes || []) console.log(`✓ plan.json：${c.key}＝${c.to}（原本 ${c.from ?? '沒寫'}）`);
    for (const [k, v] of Object.entries(r.facts)) console.log(`${k}：${v || '（空）'}`);
    for (const w of r.warnings) console.log(`⚠ ${w}`);
    const sk = await skillsLine(root);
    if (sk) console.log(sk);
    for (const l of actionLines(after)) console.log(l);
    return 0;
  }
  if (flags.timeline) {
    const tl = projectTimeline(project);
    if (flags.json) console.log(JSON.stringify({ project: label, ...tl, events: tl.events.map((e) => ({ ...e, at: stamp(e.t) })) }, null, 2));
    else printTimeline(label, tl);
    return 0;
  }
  if (flags.summary) {
    const sm = readSummary(project);
    if (sm.state === 'none') { console.log(`✖ 還沒有 ${label}/work/摘要.md → ${SUMMARY_HOW}`); return 1; }
    if (sm.state === 'bad') { for (const e of sm.errors) console.log(`✖ 摘要：${e}`); return 1; }
    console.log(`✓ 摘要：${sm.chars} 字（${label}/work/摘要.md；生成這一集的背景圖時會參考，使用者可以在構圖台取消勾選）`);
    return 0;
  }
  const s = projectStatus(project);
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(path.join(project, 'work', 'hyperframes', 'plan.json'), 'utf8')); } catch { plan = null; }
  const fmt = resolveFormat({ projectDir: project, plan });
  const sp = readSpeaker(path.join(root, 'shared', 'template'));
  const sm = fs.existsSync(path.join(project, 'work', 'rough.srt')) ? readSummary(project) : null;
  const smLine = sm?.state === 'none' ? `摘要：⚠ 還沒寫 work/摘要.md（生成背景圖時參考）→ ${SUMMARY_HOW}，寫完跑 node shared/template/tools/status.mjs --project ${label} --summary`
    : sm?.state === 'bad' ? `摘要：⚠ work/摘要.md ${sm.errors[0]}` : null;
  // --json 的 summary：和上面那一行同一個判斷（一鍵檢查不用自己看檔在不在）
  const summary = sm ? { state: sm.state, chars: sm.chars, errors: sm.errors, line: smLine } : null;
  if (flags.json) { console.log(JSON.stringify({ ...s, project: label, format: fmt.format, formatSource: fmt.source, speaker: sp.state, summary }, null, 2)); return 0; }
  const spLine = sp.state === 'unset' ? `講者：⚠ 還沒設定（14 講者介紹會用示範人物林大寶）→ 跟使用者要姓名與頭銜後跑 ${SET_CMD}；不放講者介紹跑 node shared/template/tools/brand.mjs speaker off`
    : sp.state === 'bad' ? `講者：⚠ shared/setting.json ${sp.error} → ${SET_CMD}` : null;
  const pf = readPrefs(root), pfPend = pendingPrefs(root, pf).length;
  const pfLine = pfPend ? `偏好：⚠ 有 ${pfPend} 條「以後都…」還沒問使用者（照做 ${pf.keep.length} 條）→ 回報時問他，指令：${PREFS_CMD} --prefs` : pf.keep.length ? `偏好：${pf.keep.length} 條（shared/偏好.md；寫分鏡、改段落前先讀）` : null;
  const asLine = await assetsLine(project, label), skLine = await skillsLine(root);
  for (const l of [formatLine(fmt), `專案：${label}`, `目前在：${s.at}`, `Skill：${s.skill}`, `下一個停點：${s.nextStop}`, `待回覆停點：${s.waiting.length ? s.waiting.join('、') : '無'}`, `下一輪回饋編號：${s.feedback}`, `依據：${s.evidence.join('；')}`, ...(spLine ? [spLine] : []), ...(smLine ? [smLine] : []), ...(pfLine ? [pfLine] : []), ...(asLine ? [asLine] : []), ...(skLine ? [skLine] : []), ...actionLines(s)]) console.log(l);
  return 0;
}

if (isMain(import.meta.url)) cli().then((code) => { process.exitCode = code; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });

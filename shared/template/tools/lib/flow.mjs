// 排分鏡的流程指令（build.mjs 的 --scaffold、--check-draft、--merge-drafts、--storyboard、--apply-storyboard、--review 都走這裡）。
// 把「模型一步一步下指令、手寫分鏡表」變成工具一次做完；模型只負責判斷與設計。零依賴。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSrt } from './srt.mjs';
import { textWidth, parseTime, cueSeconds, wordTime } from './time.mjs';
import { ICON_ALIAS } from './icon-alias.mjs';
import { probeDuration } from './ff.mjs';
import { canvasOf, resolveFormat } from './canvas.mjs';
import { alignOutline, scriptOutline, splitParts, renderCommon, renderSnippets, renderPart, renderSemantic, designTarget, designTargetOf, designEligible, designCap, semanticTypes, situationRows } from './scaffold.mjs';
import { readPrefs } from './prefs.mjs';
import { agentLimit } from './agents.mjs';
const agentsOf = (P) => agentLimit(path.resolve(P.templateDir, '..'));   // 子代理一次最多派幾個（shared/setting.json；預設 10）
import { parseMap, checkMap, mapOptions, mergeMaps, designVsMap, rowSeconds } from './semantic-map.mjs';
import { RHYTHM, MODE_ZH, modeOfHead, layoutFindings, layoutPlanLine } from './layout-rhythm.mjs';
import { listFillSpecs, designFileOf, illusNames, isBlankDesign, blankFor } from './custom-fill.mjs';
import { renderStoryboard, renderSection, applyStoryboard, parseDesign, isDesignPick, designPlan, designPlanLine, chapterOfFn, tidyDecide } from './storyboard-gen.mjs';
import { appendStop, lastStopOf, markStep } from './progress.mjs';
import { bumpTry, resetTry, mainTry, stopLine, lastBeat } from './tries.mjs';
import { STOP, stopLines } from './stops.mjs';
import { fail, cmdLine, next, dispatch, report as reportBlock } from './say.mjs';   // --review 裡 report 是 audit 報告的區域變數，所以改名
import { saidOf } from './cli.mjs';
import { jobState, runToolUntilDoneSync } from './job.mjs';
import { isSummaryLine } from './build-summary.mjs';
import { editorUrlsSync } from './editor-urls.mjs';
import { assetUsage } from './media.mjs';
import { floorRules } from './audit-rules.mjs';
import { readSpeaker } from './speaker.mjs';
import { sbHash as sha, storyboardDirty, recordStoryboard } from './storyboard-state.mjs';
import { readScript } from './script-file.mjs';
import { writeAtomic } from './atomic.mjs';
import { captureState, reviewHashes } from './incremental.mjs';
import { formatFinding } from './audit-rules.mjs';
import { hfLocal } from './hf.mjs';
import { KINDS as FIX_KINDS } from './autofix.mjs';
import { spokenAt } from './plan.mjs';
import { moodTarget, MOOD_KINDS, insertMoods } from './moods.mjs';
import { beatBlock, beatSourceOf, refreshStoryboard, applyBeatEdits, recordWritten } from './beat-source.mjs';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join('/') || '.';
const readOpt = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const tool = (name, args, opts = {}) => spawnSync(process.execPath, [path.join(TOOLS, name), ...args], { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
// 真的產生檔案的 build：底片要重新編碼時走背景工作，等太久結束碼 75（再跑一次會接著等，不會重跑）；總等待有上限（lib/job.mjs）
const buildTool = (args) => runToolUntilDoneSync(path.join(TOOLS, 'build.mjs'), args);
// 產生的階段（合併草稿、分鏡表套回）寫完 plan.json 就跑 build.mjs --autofix：工具知道答案的 ⚠／✖ 先修掉（lib/autofix.mjs），
// 不用留給使用者在剪輯台看到；剪輯台的更新預覽不跑（使用者改的時間要算數）。跑不完不擋流程，印一行就好。
// 回傳修好幾處（plan.json 沒改＝0；回報段的「自動修好 N 處」用）
function autofixStep(P, extra = []) {
  const before = readOpt(P.plan);
  const r = tool('build.mjs', ['--project', P.project, '--autofix', ...extra, ...(P.templateArg || [])]);
  const out = (r.stdout || '').trim();
  if (out) console.log(out);
  if (r.status !== 0 && !out) console.log(`⚠ 自動修正沒有跑完（${(r.stderr || '').trim().split('\n').pop() || `結束碼 ${r.status}`}）→ 不影響這一步；之後可以再跑 build.mjs --project ${rel(P.project)} --autofix`);
  return readOpt(P.plan) !== before ? Number(out.match(/自動修好 (\d+) 處/)?.[1]) || 1 : 0;
}
const clock = (t) => { const m = Math.floor(t / 60); return `${m}:${String(Math.floor(t - m * 60)).padStart(2, '0')}`; };
const cueOf = (s) => Number(String(s?.from || s?.at || '').match(/^#(\d+)/)?.[1] ?? 0);

// C1：子行程的 ✖。build 有的印在 stdout、有的是 throw 由 build.mjs 最後的 catch 印在 stderr，兩邊都要看
//（只看 stdout 時會只印「✖ build 沒過」卻沒有 ✖）。spawnSync 的 { stdout, stderr }、runAsync 的 { out, err } 都收
export function failLines(r) {
  const text = `${r?.stdout ?? r?.out ?? ''}\n${r?.stderr ?? r?.err ?? ''}`;
  return text.split('\n').map((l) => l.trim()).filter((l) => /^(✖|\w*Error\b)/.test(l));
}
// 連 ✖ 都沒有（例如被系統砍掉）：至少印最後一行，不要只有一句「沒過」
const failOrTail = (r) => {
  const ls = failLines(r);
  if (ls.length) return ls;
  const tail = `${r?.stderr ?? r?.err ?? ''}\n${r?.stdout ?? r?.out ?? ''}`.split('\n').map((l) => l.trim()).filter(Boolean).pop();
  return [fail(tail || `結束碼 ${r?.status ?? r?.code}`)];
};

// A4：主代理的指令連續沒過幾次由工具數（lib/tries.mjs），到上限在最後印「→ 停手」；結束碼 75（還在跑）不算
function endTry(P, name, code) {
  if (code === 75 || !P?.project) return code;
  const t = mainTry(P.project, name, code === 0);
  if (t.stop) console.log(stopLine(t.n, `build.mjs --${name} `));
  return code;
}

// B7：工具改了 AI 寫的檔（草稿、大綱、地圖），AI 手上的那份就舊了，要再改先重新讀（不然寫回去會被擋或蓋掉工具補的值）
const changedLine = (f) => `已改檔：${rel(f)}（要再改先重新讀）`;

// B5：派工的那一刻記下來（work/.jobs/dispatch.json：{ <段>: { n: 第幾次, at: 毫秒 } }），--design-status 從這一刻起算有沒有進度
const dispatchFile = (P) => path.join(P.project, 'work', '.jobs', 'dispatch.json');
export const readDispatch = (P) => readJson(dispatchFile(P), null) || {};
// 內容設計動畫的派工那幾行（--apply-storyboard、build.mjs --to-design 共用，派工訊息只有這一份）：記下派工的時間，回傳要印的行
// ③ 勾選才改成內容設計動畫的段還沒有鏡位腳本：同一個設計師先寫腳本、接著做動畫（使用者已經在 ③ 決定要做，不再停）
export function dispatchLines(P, ids) {
  if (!ids.length) return [];
  recordDispatch(P, ids);
  const noScript = ids.filter((id) => !fs.existsSync(path.join(designsDir(P), `${id}.md`))), withScript = ids.filter((id) => !noScript.includes(id));
  const msgs = [];
  if (withScript.length) msgs.push(`${noScript.length ? `（${withScript.join('、')}）` : ''}你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。鏡位腳本已經寫好：照 .agents/skills/auto-edit-motion/references/design.md 做動畫（第 2 節）。`);
  if (noScript.length) msgs.push(`${withScript.length ? `（${noScript.join('、')}）` : ''}你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。照 .agents/skills/auto-edit-motion/references/design.md 寫鏡位腳本、接著做動畫（不用等確認）。`);
  return dispatch(`內容設計動畫一段派一個設計師，同一則回覆一次派出（一次最多 ${agentsOf(P)} 個，回來再派下一批）：${ids.join('、')}。派工訊息只送下面這一行（換掉 <段>，不要另外加要求）：`, ...msgs);
}
export function recordDispatch(P, ids, { redo = false, now = Date.now() } = {}) {
  if (!ids.length || !P?.project) return;
  const j = readDispatch(P);
  // 重派：之前一定派過一次（舊專案沒有紀錄也一樣），所以至少是第 2 次
  for (const id of ids) j[id] = { n: Math.max(j[id]?.n || 0, redo ? 1 : 0) + 1, at: now };
  try { fs.mkdirSync(path.dirname(dispatchFile(P)), { recursive: true }); writeAtomic(dispatchFile(P), `${JSON.stringify(j, null, 2)}\n`); } catch { /* 只是提示，不影響派工 */ }
}

const packDir = (P) => path.join(P.project, 'work', '分鏡素材');
const draftsDir = (P) => path.join(P.project, 'work', 'drafts');
const designsDir = (P) => path.join(P.project, 'work', 'designs');
const briefsDir = (P) => path.join(P.project, 'work', 'briefs');
const sbFile = (P) => path.join(P.project, 'work', 'storyboard.md');
// 字卡與模板的寫法（--scaffold 產生，--spec、--map、--outline 讀）：工具用的資料，檔名開頭有點、不列在分鏡素材裡
// （026：以前叫 寫法.md，4 萬多字，寫草稿的人會整份 cat 進來）。舊專案只有 寫法.md 也讀得到
export const SPEC_FILE = '.spec.md';
const specMdOf = (P) => readOpt(path.join(packDir(P), SPEC_FILE)) || readOpt(path.join(packDir(P), '寫法.md'));

function mainKinds(P) {
  const main = readJson(path.join(P.project, 'work', 'main.json'));
  const clips = main?.clips || [];
  const count = (k) => clips.filter((c) => c.kind === k).length;
  const listDir = (d) => { try { return fs.readdirSync(path.join(P.project, 'assets', d)).filter((n) => !n.startsWith('.')).length; } catch { return 0; } };
  const camera = clips.length ? count('camera') : listDir('camera');
  const voice = clips.length ? count('voice') : listDir('voice');
  const screen = clips.length ? count('screen') : 0;
  const parts = [camera && `真人 ${camera} 支`, voice && `聲音 ${voice} 支`, screen && `邊錄邊講的螢幕錄影 ${screen} 支`].filter(Boolean);
  return { hasCamera: camera > 0, kinds: parts.join('＋') || '—' };
}

function readNotes(P) {
  const dir = path.join(P.project, 'work', 'media', 'notes');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files.sort()) {
    const v = readJson(path.join(dir, f));
    if (Array.isArray(v)) out.push(...v);
    else if (v) out.push(v);
  }
  // 已經接進主軌的邊錄邊講錄影畫面由 screen-sync 蓋回，不用再配
  let narrated = [];
  try { narrated = (JSON.parse(fs.readFileSync(path.join(P.project, 'work', 'main.json'), 'utf8')).clips || []).filter((c) => c.kind === 'screen').map((c) => c.file); } catch { narrated = []; }
  return out.filter((n) => n && n.file && !narrated.includes(n.file));
}

// 長片的 ⚠ 很多是同一句話換段號：同一類 ≥ 3 段併成一行（字卡蓋到講者框這種 156 段的片子就有 40 則，會把真正要處理的蓋掉）
export function groupWarnings(list) {
  const groups = new Map(), order = [];
  for (const w of list) {
    const m = String(w).match(/^\[([\w-]+)[^\]]*\]\s*/);
    const key = (m ? String(w).slice(m[0].length) : String(w)).replace(/\d+(\.\d+)?/g, '#');
    if (!m) { order.push({ raw: w }); continue; }
    if (!groups.has(key)) { const g = { all: [], ids: [], rest: String(w).slice(m[0].length) }; groups.set(key, g); order.push(g); }
    const g = groups.get(key);
    g.all.push(w); g.ids.push(m[1]);
  }
  return order.flatMap((x) => {
    if (x.raw != null) return [x.raw];
    if (x.all.length < 3) return x.all;
    const shown = x.ids.slice(0, 6).join('、');
    return [`[${shown}${x.ids.length > 6 ? `…共 ${x.ids.length} 段` : ''}] ${x.rest}`];
  });
}

// ---------- --scaffold ----------

// 小節角標最多 12 字：「痛點：錄完要檢查，檔案還要傳」→「錄完要檢查」（取冒號後面、逗號前面，還是太長才硬切）
const SECTION_MAX = 12;
export function shortSection(title) {
  let t = String(title).trim();
  if (textWidth(t) <= SECTION_MAX) return t;
  // 「STEP 3｜…」的編號要留著；切不短就照原文，--check 會 ⚠ 請人縮（不要切在詞中間）
  if (/^(STEP|Step|步驟|第)\s*\S*\s*[：:｜|]/.test(t)) return t;
  const after = t.split(/[：:｜|]/).pop().trim();
  if (after && textWidth(after) >= 3) t = after;
  const head = t.split(/[，,、。]/)[0].trim();
  if (textWidth(t) > SECTION_MAX && head && textWidth(head) >= 3) t = head;
  return t;
}

// 第一次 build 要重新編碼整支底片（30 分鐘片約 5 分鐘）：構圖定了就先在背景做，寫草稿時不用等
export function startPrepare(P, flags = {}) {
  if (!fs.existsSync(P.plan)) return null;
  return tool('build.mjs', ['--project', P.project, '--prepare', ...(flags.template ? ['--template', flags.template] : [])]);
}

export function runScaffold(P, flags, { loadLib, slotSummary, voiceOnlyOf }) {
  if (!P.project) throw new Error('--scaffold 要指定專案 → 加 --project projects/<專案>');
  if (!fs.existsSync(P.srt)) throw new Error(`找不到字幕 ${rel(P.srt)} → 先完成「剪乾淨」的字幕步驟（media.mjs rough）`);
  if (!fs.existsSync(P.video)) throw new Error(`找不到影片 ${rel(P.video)} → 先完成「剪乾淨」產生 work/rough.mp4`);
  let plan = {};
  const raw = readOpt(P.plan);
  try { plan = JSON.parse(raw || '{}'); } catch (e) { throw new Error(`plan.json 不是合法的 JSON：${e.message} → 修好再跑`); }
  // 純聲音專案沒有經過構圖台：這裡先把 plan.json 建起來
  if (!raw) { fs.mkdirSync(path.dirname(P.plan), { recursive: true }); plan = { version: 1 }; writeAtomic(P.plan, `${JSON.stringify(plan, null, 2)}\n`); }
  const cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  const fmt = resolveFormat({ projectDir: P.project, plan, flag: flags.format ?? null });
  const lib = loadLib(P.templateDir, P.project);
  fs.mkdirSync(path.join(P.out, '.cache'), { recursive: true });
  const count = (d, re) => { try { return fs.readdirSync(path.join(P.project, 'assets', d)).filter((n) => re.test(n)).length; } catch { return 0; } };
  const scriptMd = fs.existsSync(path.join(P.project, '講稿.md')) ? readScript(path.join(P.project, '講稿.md')) : '';
  const outline = alignOutline(scriptOutline(scriptMd), cues);
  const videoDur = probeDuration(P.video);
  let breaks = [];   // 剪乾淨時剪過停頓的地方（work/cutpoints.json）：分份的切點優先落在這裡
  try { breaks = (JSON.parse(readOpt(path.join(P.project, 'work', 'cutpoints.json')) || '{}').cuts || []).filter((c) => c.kind === 'pause').map((c) => Number(c.at)).filter(Number.isFinite); } catch { /* 沒有就照字幕的空檔切 */ }
  const parts = splitParts({ cues, outline, breaks });
  const { hasCamera, kinds } = mainKinds(P);
  const input = {
    project: rel(P.project), format: { label: `${fmt.format === 'portrait' ? '直式' : '橫式'} ${canvasOf(fmt.format).W}×${canvasOf(fmt.format).H}`, portrait: fmt.format === 'portrait' },
    videoDur, cues, scriptMd, plan, outline, parts, hasCamera, kinds,
    scenes: lib.scenes.map((s) => ({ ...s, summary: slotSummary(s) })).filter((s) => hasCamera || ['chapter', 'fullscreen'].includes(s.family)),
    // 直式不提供的（規格 portrait: none）、沒有講者時疊在講者上的（layout: overlay）不列，寫分鏡的人就不會挑到
    fillSpecs: listFillSpecs(lib.customDir).filter((f) => !(fmt.format === 'portrait' && f.portrait === 'none') && (hasCamera || f.layout !== 'overlay')).map((f) => ({ ...f, floors: floorRules(readOpt(path.join(lib.customDir, `${f.template}.html`))) })),
    illus: illusNames(path.join(P.templateDir, 'kit')), speaker: readSpeaker(P.templateDir), fx: lib.fx,
    situationsMd: readOpt(path.join(P.templateDir, 'SITUATIONS.md')), beatsMd: readOpt(path.join(P.templateDir, 'BEATS.md')), styleMd: readOpt(path.join(P.templateDir, '..', 'style.md')),
    voiceOnly: voiceOnlyOf(P, P.video), notes: readNotes(P),
    prefs: readPrefs(path.resolve(P.templateDir, '..', '..')).keep.map((x) => x.text),   // 使用者確認過每一集都照做的規則（shared/偏好.md）
    assets: { screen: count('screen', /\.(mp4|mov|m4v|webm|mkv)$/i), images: count('images', /\.(jpe?g|png|webp|heic)$/i) },
  };
  const dir = packDir(P);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^ch\d+\.md$/.test(f)) fs.unlinkSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, '共用.md'), renderCommon(input));
  fs.writeFileSync(path.join(dir, SPEC_FILE), renderSnippets(input));
  try { fs.unlinkSync(path.join(dir, '寫法.md')); } catch { /* 舊版的檔，沒有就算了 */ }
  fs.writeFileSync(path.join(dir, '語意.md'), renderSemantic(input));
  for (const part of parts) fs.writeFileSync(path.join(dir, `${part.key}.md`), renderPart(part, input));
  const sections = outline.filter((x) => x.level === 3).map((x) => ({ at: `#${x.n}`, name: shortSection(x.title) }));
  // semanticMap：這一包走語意地圖（specs/024：第一回合地圖 → --map-merge 全片校正 → 第二回合草稿）；舊的包沒有這個欄位，照舊直接寫草稿
  fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify({ parts, sections, videoDur, hasCamera, semanticMap: true }, null, 2)}\n`);
  fs.mkdirSync(draftsDir(P), { recursive: true });
  startPrepare(P, flags);
  const target = designTarget(videoDur);
  console.log(`→ ${rel(dir)}/：共用.md、語意.md＋${parts.length} 份（${parts.map((p) => `${p.key} ${p.chars} 字 ${clock(p.seconds)}`).join('、')}）；${cues.length} 句字幕`);
  console.log(`內容設計動畫候選：約三成的段（全片估計 ${target} 段左右，最多 ${designCap(target)} 段）：第一回合各份在語意地圖提名 A，主代理全片挑；停點 ③ 使用者勾了才做。底片在背景預先處理`);
  const again = cmdLine('build.mjs', ['--project', rel(P.project), '--map-merge']);
  if (parts.length > 1) {
    for (const l of dispatch(`（第一回合：語意地圖）一份派一個子代理，同一則回覆一次派出（一次最多 ${agentsOf(P)} 個，回來再派下一批）；派工訊息照抄，換掉 <份>：`,
      `你只負責 ${rel(P.project)} 的分鏡 <份> 這一份（全片 ${parts.length} 份：${parts.map((p) => p.key).join('、')}，其他份有別的子代理，不要碰）第一回合：語意地圖。照 .agents/skills/auto-edit-storyboard/references/chapter-worker.md 做。`)) console.log(l);
    console.log('全部回來後合併地圖、全片校正：');
    console.log(again);
  } else for (const l of next(`照 .agents/skills/auto-edit-storyboard/references/chapter-worker.md 的第一回合寫 ${rel(draftsDir(P))}/ch01.map.md，寫完合併地圖、全片校正：`, again)) console.log(l);
}

// ---------- 語意地圖（specs/024）：--map 驗一份、--map-merge 合併＋全片校正 ----------

const mapFile = (P, key) => path.join(draftsDir(P), `${key}.map.md`);
const mapState = (P) => path.join(draftsDir(P), '_map.json');
function mapContext(P) {
  const idx = readJson(path.join(packDir(P), 'index.json'));
  const md = readOpt(path.join(P.templateDir, 'SITUATIONS.md'));
  const cues = fs.existsSync(P.srt) ? parseSrt(fs.readFileSync(P.srt, 'utf8')) : [];
  const syncSpans = (readJson(path.join(P.project, 'work', 'screen-sync.json'))?.segments || []).map((x) => [Number(x.from), Number(x.to)]).filter(([x, y]) => y > x);
  return { idx, parts: idx?.parts || [], types: semanticTypes(md), sitRows: situationRows(md), cues, syncSpans };
}
const mapsHash = (P, parts) => sha(parts.map((p) => readOpt(mapFile(P, p.key))).join('\n---\n'));
// 全片校正通過了、之後地圖沒再改：第二回合才開始
// .spec.md 這個名稱的模板最短要幾秒（和 --outline「只有 N 秒，至少要 M 秒」同一個算法）
export function minOfSpec(list, name) {
  const e = list.find((x) => x.name === name);
  if (!e) return 0;
  try { return minSecondsOf(e, snippetOf(e)) || 0; } catch { return 0; }
}
// .spec.md 寫的「項目全用上時段長至少 N 秒」
export function fullOfSpec(list, name) {
  const t = list.find((x) => x.name === name)?.text || '';
  return Number(t.match(/項目全用上時段長至少 ([\d.]+) 秒/)?.[1] || 0);
}
export function mapPassed(P, parts) {
  const st = readJson(mapState(P));
  return !!st?.passed && st.hash === mapsHash(P, parts);
}
// 這一份的地圖（第二回合 --outline、--check-draft 對候選用）；沒有地圖就是舊流程
function mapRowsOf(P, key) {
  const md = readOpt(mapFile(P, key));
  if (!md) return null;
  const { types } = mapContext(P);
  return checkMap(parseMap(md), { types }).rows;
}

export function mapCmd(P, key0) {
  const key = String(key0).replace(/\.map\.md$/, '').split('/').pop();
  const ctx = mapContext(P);
  const part = ctx.parts.find((p) => p.key === key);
  if (!ctx.idx) { console.log(`✖ 還沒有 ${rel(packDir(P))}/index.json → 先跑 node shared/template/tools/build.mjs --project ${rel(P.project)} --scaffold`); return 1; }
  if (!part) { console.log(`✖ 沒有「${key}」這一份 → 照 ${rel(packDir(P))}/ 的 chNN.md 寫（${ctx.parts.map((p) => p.key).join('、')}）`); return 1; }
  const md = readOpt(mapFile(P, key));
  if (!md) { console.log(`✖ 找不到地圖 → 照 ${rel(packDir(P))}/語意.md 寫到 ${rel(mapFile(P, key))}（一組句子一行：句號範圍 | 語意 | 級 | 在講什麼 | 特徵或 A 的理由），再跑這條`); return 1; }
  const { errors, warns, rows } = checkMap(parseMap(md), { part, cues: ctx.cues, types: ctx.types, syncSpans: ctx.syncSpans });
  for (const m of errors) console.log(`✖ ${m}`);
  for (const m of warns) console.log(`⚠ ${m}`);
  const nth = runCount(P, `map:${key}`);
  if (errors.length) { console.log(`未通過：${errors.length} 個 ✖、${warns.length} 個 ⚠ → 改 ${rel(mapFile(P, key))}，再跑一次`); if (nth >= CHECK_TRY_MAX) console.log(`→ 停手：這一份的地圖已經檢查 ${nth} 次還有 ✖。不要再改，把上面還在的 ✖ 原文回報主代理。`); return 1; }
  const n = (t) => rows.filter((r) => r.tier === t).length;
  console.log(`地圖通過：${rows.length} 行（A ${n('A')}、B ${n('B')}、C ${n('C')}），${warns.length} 個 ⚠${nth >= 2 && warns.length ? '。可以交件，⚠ 不用再修' : ''}`);
  if (mapPassed(P, ctx.parts)) {
    console.log('第二回合：每一行可以用的模板（照語意縮好、只列這一行秒數放得下的，名稱直接寫進大綱的模板欄，括號裡是什麼句子用它、不要抄進大綱；名稱後面有 ＊＝這一行放不下它全部的項目，照用、項目少寫幾個；欄位到填骨架時才用 --spec 查）：');
    const specMd = specMdOf(P);
    const list = specEntries(specMd);
    // 字卡動態的候選：.spec.md 列的那幾張（已經照版式篩過）和它們「適合的語意」
    const fx = [...specMd.matchAll(/^\*\*fx (\d{2}) ([^*]+)\*\*：.*?；適合的語意：([^；]+)；/gm)].map((m) => ({ id: m[1], zh: m[2].trim(), sem: m[3].split('、').map((x) => x.trim()) }));
    // 027 版面節奏：有講者的橫式才排（只有聲音沒有講者可看；直式是上下分割，另外一套）
    const rhythmOn = ctx.idx?.hasCamera !== false && resolveFormat({ projectDir: P.project, plan: readJson(P.plan) || {} }).format !== 'portrait';
    const startOf = (r) => ctx.cues.find((c) => c.n === r.a)?.start ?? 0, secsOf = (r) => rowSeconds(r, ctx.cues);
    const modeOf = (name) => modeOfHead(list.find((e) => e.name === name)?.text);
    const opts = mapOptions(rows, ctx.sitRows, list.map((e) => e.name), { secsOf, minOf: (name) => minOfSpec(list, name), fullOf: (name) => fullOfSpec(list, name), fx, ...(rhythmOn ? { modeOf, startOf } : {}) });
    if (opts.plan) console.log(`  版面安排（工具照規則排好了，照行首標的版面挑模板）：${layoutPlanLine(rows, opts.plan, { startOf, secsOf })}\n  規則：開頭 ${RHYTHM.intro} 秒用字卡（講者滿版露臉，卡疊在講者上）讓觀眾先認識講者；${MODE_ZH.pip}一次連續 ≥ ${RHYTHM.pip} 秒、${MODE_ZH.half} ≥ ${RHYTHM.half} 秒，中間不切回講者，畫面才不會一直晃。`);
    for (const l of opts) console.log(`  ${l}`);
    for (const l of next(`照地圖寫大綱 ${rel(draftsDir(P))}/${key}.outline.md（模板從上面挑；地圖上是 A 的段寫候選構想，其他寫 —），再跑：`, cmdLine('build.mjs', ['--project', rel(P.project), '--outline', key]))) console.log(l);
  } else console.log('→ 第一回合完成：照 chapter-worker.md 回報一行，等主代理全片校正後的第二回合（不要先寫大綱）');
  return 0;
}

export const mapMergeCmd = (P) => endTry(P, 'map-merge', mapMergeRun(P));
function mapMergeRun(P) {
  const ctx = mapContext(P);
  if (!ctx.idx) { console.log(`✖ 還沒有 ${rel(packDir(P))}/index.json → 先跑 node shared/template/tools/build.mjs --project ${rel(P.project)} --scaffold`); return 1; }
  const missing = ctx.parts.filter((p) => !fs.existsSync(mapFile(P, p.key))).map((p) => p.key);
  if (missing.length) { console.log(`✖ 還沒有地圖：${missing.join('、')} → 等那幾份的子代理寫完（${rel(draftsDir(P))}/<份>.map.md），再跑這條`); return 1; }
  const rowsByKey = new Map(), bad = [];
  for (const p of ctx.parts) {
    const c = checkMap(parseMap(readOpt(mapFile(P, p.key))), { part: p, cues: ctx.cues, types: ctx.types, syncSpans: ctx.syncSpans });
    for (const m of c.errors) bad.push(`${p.key}：${m}`);
    rowsByKey.set(p.key, c.rows);
  }
  if (bad.length) { for (const m of bad) console.log(`✖ ${m}`); console.log(`未通過：${bad.length} 個 ✖ → 把原文交回那一份的子代理（或自己改那一行），再跑一次`); fs.rmSync(mapState(P), { force: true }); markStep(P.project, 'map-merge', { passed: false }); return 1; }
  const vision = path.join(packDir(P), '視覺語言.md');
  const m = mergeMaps(ctx.parts, rowsByKey, { videoDur: ctx.idx.videoDur || 0, hasVision: fs.existsSync(vision), visionFile: rel(vision) });
  const out = path.join(packDir(P), '語意地圖.md');
  fs.writeFileSync(out, m.md);
  for (const x of m.errors) console.log(`✖ ${x}`);
  for (const x of m.warns) console.log(`⚠ ${x}`);
  const nth = runCount(P, 'map-merge');
  const head = `${rel(out)}：${m.stats.rows} 行（A ${m.stats.A}、B ${m.stats.B}、C ${m.stats.C}；A 預算約 ${m.stats.target}、最多 ${m.stats.cap}）`;
  if (m.errors.length) {
    fs.rmSync(mapState(P), { force: true });
    markStep(P.project, 'map-merge', { passed: false });
    console.log(`未通過：${head}`);
    for (const l of next(`（主代理全片校正，只讀 ${rel(out)}，不讀字幕）照上面的 ✖ 和那份檔開頭的三件事改各份的地圖、寫視覺語言.md，再跑：`, cmdLine('build.mjs', ['--project', rel(P.project), '--map-merge']))) console.log(l);
    return 1;
  }
  writeAtomic(mapState(P), `${JSON.stringify({ passed: true, at: new Date().toISOString(), hash: mapsHash(P, ctx.parts), ...m.stats }, null, 2)}\n`);
  markStep(P.project, 'map-merge', { passed: true });
  console.log(`語意地圖通過：${head}${m.warns.length && nth < 2 ? '。⚠ 看一輪：照 → 改那幾行再跑一次就好' : ''}`);
  const merge = cmdLine('build.mjs', ['--project', rel(P.project), '--merge-drafts']);
  if (ctx.parts.length > 1) {
    for (const l of dispatch(`（第二回合：照地圖寫草稿）能接續子代理就請第一回合那個子代理接著做，不能就重派；同一則回覆一次派出（一次最多 ${agentsOf(P)} 個，回來再派下一批）；派工訊息照抄，換掉 <份>：`,
      `你只負責 ${rel(P.project)} 的分鏡 <份> 這一份（全片 ${ctx.parts.length} 份：${ctx.parts.map((p) => p.key).join('、')}，其他份有別的子代理，不要碰）第二回合：照語意地圖寫草稿。照 .agents/skills/auto-edit-storyboard/references/chapter-worker.md 做。`)) console.log(l);
    console.log('全部回來後合併：');
    console.log(merge);
  } else for (const l of next(`照 .agents/skills/auto-edit-storyboard/references/chapter-worker.md 的第二回合寫 ${rel(draftsDir(P))}/ch01.json，寫完合併：`, merge)) console.log(l);
  return 0;
}

// ---------- 查規格（--spec、--icons、--words、--show）：用到才查，不用讀整份文件或原始碼 ----------

// .spec.md 的一項：**名稱** 開頭到下一項之前
export function specEntries(md) {
  const out = [];
  let cur = null;
  for (const l of String(md).split('\n')) {
    const m = l.match(/^\*\*([^*]+)\*\*/);
    if (m) { cur = { name: m[1], lines: [l] }; out.push(cur); continue; }
    if (/^#{1,3}\s/.test(l)) { cur = null; continue; }
    if (cur) cur.lines.push(l);
  }
  return out.map((x) => ({ name: x.name, text: x.lines.join('\n').trim() }));
}

// --spec key-point,x-scene：一次查好幾個（逗號隔開），不用一個跑一次
export function specCmd(P, name) {
  const md = specMdOf(P);
  if (!md) { console.log(`✖ 還沒有分鏡素材（${rel(packDir(P))}/）→ 先跑 node shared/template/tools/build.mjs --project ${rel(P.project)} --scaffold`); return 1; }
  const names = String(name).split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
  if (names.length > 1) return names.map((n, i) => { if (i) console.log(''); return specOne(md, n); }).some(Boolean) ? 1 : 0;
  return specOne(md, name);
}
// 印給寫草稿的人看：時間下限的秒數不印（026：看到數字就會先心算每一拍放不放得下，其實 --outline、--check-draft 會用實際時間說）
export const specShown = (text) => String(text).replace(/^時間下限[^\n]*$/m, '拍綁在講到那個東西的詞上，一拍一句（同一句講到的併成一拍）；放不放得下 `--check-draft` 會說，不用先算。');
function specOne(md, name) {
  const list = specEntries(md), q = String(name).trim().toLowerCase();
  const exact = list.filter((x) => x.name.toLowerCase().split(/\s+/).includes(q) || x.name.toLowerCase() === q);
  const hits = exact.length ? exact : list.filter((x) => x.text.split('\n')[0].toLowerCase().includes(q));
  if (!hits.length) { console.log(`找不到「${name}」。可以查：${list.map((x) => x.name).join('、')}`); return 1; }
  for (const h of hits.slice(0, 3)) console.log(specShown(h.text));
  if (hits.length > 3) console.log(`（還有 ${hits.length - 3} 項符合：${hits.slice(3).map((x) => x.name).join('、')}）`);
  return 0;
}

// 常用詞對 lucide 名稱：圖示有 1,500 多個，不要整份印

export function iconsCmd(words, { loadLib, templateDir }) {
  const names = loadLib(templateDir).icons.names;
  for (const w of String(words).split(/[,，、\s]+/).filter(Boolean)) {
    const q = (ICON_ALIAS[w] || w).toLowerCase();
    const hits = names.filter((n) => n.includes(q)).sort((a, b) => (a === q ? -1 : b === q ? 1 : a.length - b.length)).slice(0, 8);
    console.log(`${w}：${hits.join('、') || '找不到 → 換一個英文關鍵字（例 phone、cloud）'}`);
  }
  return 0;
}

// 一句的字幕與逐字稿（whisper 聽成什麼）：挑 @詞 用
// --words 12、--words 28-41、--words 3,7：一次查好幾句，不用一句跑一次
export function wordsCmd(P, ref) {
  const cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  const list = [];
  for (const part of String(ref).split(/[,，]/)) {
    const m = part.trim().replace(/@.*$/, '').match(/^#?(\d+)(?:\s*[-–]\s*#?(\d+))?$/);
    if (!m) { console.log(`✖ --words 要寫句號，例 12、28-41、3,7，現在是「${part.trim()}」`); return 1; }
    for (let n = +m[1]; n <= +(m[2] ?? m[1]); n++) list.push(n);
  }
  const tj = readJson(path.join(P.project, 'work', 'transcript.json'));
  const words = Array.isArray(tj) ? tj : tj?.words || tj?.segments?.flatMap((s) => s.words || []) || [];
  for (const n of list) {
    const c = cues.find((x) => x.n === n);
    if (!c) { console.log(`✖ 字幕沒有第 ${n} 句（共 ${cues.length} 句）`); return 1; }
    const hit = words.filter((w) => (w.start ?? 0) < c.end && (w.end ?? 0) > c.start).map((w) => String(w.text ?? w.word ?? '').trim()).filter(Boolean);
    console.log(`#${c.n}（${c.start.toFixed(2)}–${c.end.toFixed(2)}）字幕：${c.text}｜逐字稿聽到：${hit.join(' ') || '（沒有詞級逐字稿）'}`);
  }
  return 0;
}

// 只看一段 plan：不用整份讀 plan.json（156 段的片子 10 萬字）
// 032 B6：custom 段後面接著印現在的動畫分鏡和它的正本在哪（子代理改動畫前用它看拍；storyboard.md 那張只是副本）
export function showCmd(P, id, { loadLib } = {}) {
  const plan = readJson(P.plan);
  const ids = String(id).split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  const segs = (plan?.scenes || []).filter((s) => ids.includes(s.id));
  if (!segs.length) { console.log(`✖ plan.json 沒有「${id}」→ 段 id 看 build.mjs --check 的報告`); return 1; }
  let lib;
  const libNow = () => (lib ??= loadLib ? loadLib(P.templateDir, P.project) : null);
  for (const s of segs) {
    console.log(JSON.stringify(s, null, 1));
    if (s?.type !== 'custom') continue;
    const b = beatSourceOf(P, s, { lib: libNow() });
    if (b.seeded) console.log(b.seeded);
    if (b.owner === 'none') continue;
    console.log(`動畫分鏡（正本：${b.file}）：${b.md ? '' : '還沒有表'}`);
    if (b.md) console.log(b.md.trim());
  }
  return 0;
}

// ---------- --outline：先寫分段大綱（一段一行），工具檢查段長、相鄰模板、接縫、候選數量，再產生要填的草稿骨架 ----------
// 大綱 work/drafts/<份>.outline.md：每段一行「id | from | to | 模板 | 在講什麼 | 候選構想（沒有寫 —）」
// 拆兩步是為了讓寫草稿的模型只做判斷：先定段落和模板（工具馬上說放不放得下），再填畫面上的字；欄位、起訖、anchor 都由工具寫好
export function parseOutline(md) {
  const rows = [];
  for (const l of String(md).split('\n')) {
    if (!l.includes('|')) continue;
    const c = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
    if (c.length < 4 || /^:?-+:?$/.test(c[0]) || /^(id|段)$/i.test(c[0])) continue;
    rows.push({ id: c[0], from: c[1], to: c[2], tpl: c[3], say: c[4] || '', idea: /^(—|-|–|無)?$/.test(c[5] || '') ? '' : c[5] });
  }
  return rows;
}
function findSpec(list, q) {
  const s = String(q).trim().toLowerCase().replace(/^custom\s+/, '');
  return list.find((x) => { const n = x.name.toLowerCase(); return n === s || n.split(/\s+/).includes(s) || n.startsWith(`${s} `); }) || null;
}
// 這一條的範例 JSON；字卡動態（fx）沒有範例，照第一行的「vars：名稱（說明）、…」組一個
export const snippetOf = (entry) => {
  const m = entry.text.match(/```json\n([\s\S]*?)\n```/);
  if (m) { try { return JSON.parse(m[1]); } catch { return null; } }
  const fx = entry.name.match(/^fx (\d+)/), vars = entry.text.split('\n')[0].match(/vars[：:]\s*(.+)$/);
  if (!fx) return null;
  const v = {};
  for (const x of (vars?.[1] || '').split('、')) { const k = x.match(/^\s*([A-Za-z]+)（(.*)）\s*$/); if (k) v[k[1]] = `<${k[2]}>`; }
  return { type: 'fx', fx: Number(fx[1]), from: '#N', to: '#Me', vars: v };
};
// 這個模板最短要幾秒：字卡看第一行的「最短／固定 N 秒」；模板動畫照「時間下限」和最少的項目數估
export function floorsOf(entry) {
  const f = entry.text.match(/時間下限[^：\n]*：([^\n]+)/);
  if (!f) return null;
  const num = (re) => Number(f[1].match(re)?.[1] ?? 0);
  return { open: num(/第一拍離段頭 ≥ (\d+(?:\.\d+)?)/), gap: num(/拍與拍 ≥ (\d+(?:\.\d+)?)/), end: num(/最後一拍到段尾 ≥ (\d+(?:\.\d+)?)/) };
}
export function minSecondsOf(entry, snip) {
  const m = entry.text.split('\n')[0].match(/(?:最短|固定) (\d+(?:\.\d+)?) 秒/);
  if (m) return Number(m[1]);
  const f = floorsOf(entry);
  if (!f) return 0;
  const n = Math.max(1, Object.values(snip?.slots || {}).find(Array.isArray)?.length || 1);
  return Math.round((f.open + f.end + f.gap * (n - 1)) * 10) / 10;
}
// 拍可以綁的句子：第一拍離段頭、最後一拍到段尾的下限換成句號範圍，寫草稿的人挑詞時不用算秒數
export function beatWindow(cues, a, z, f) {
  if (!f || !(f.open || f.end)) return null;
  const lo = a + f.open - 0.3, hi = z - f.end + 0.3;
  const max = hi > lo ? 1 + Math.floor((hi - lo) / (f.gap || 2.5) + 1e-6) : 0;   // 照拍距最多放幾拍
  const ok = cues.filter((c) => c.start >= lo && c.start <= hi);   // 那句一開口就已經離段頭夠遠、也還沒進段尾
  if (ok.length) { const z2 = ok[ok.length - 1]; return { first: ok[0].n, last: z2.n, lastHead: z2.end > hi + 0.3, max }; }
  const span = cues.filter((c) => c.end > lo && c.start < hi);       // 段很短：只有某句的中段落在範圍裡
  return span.length ? { first: span[0].n, last: span[span.length - 1].n, mid: true, max: 1 } : { first: null, last: null, max: 0 };
}
// 還沒填的佔位：<…>、#N、#Me、#N@詞（骨架和範例都用這幾種）
export function placeholders(segs) {
  const out = [];
  const walk = (v, where) => {
    if (typeof v === 'string') { if (/^<[^<>]*>$/.test(v.trim()) || /^#(N|Me)(@詞)?$/.test(v.trim())) out.push(`${where}（${v}）`); return; }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, where ? `${where}.${k}` : k);
  };
  for (const s of segs || []) walk(Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'id')), s.id || '?');
  return out;
}
// ---------- 工具代填（FR-105～107）：at:auto 照卡上的字在字幕找講到的詞；中文圖示換英文；why 預設模板用途 ----------
const AUTO = 'auto';
const str = (v) => (typeof v === 'string' && v.trim() && !/^<[^<>]*>$/.test(v.trim()) ? v : null);
const AT_KEY = /^at$|At$/, AT_ALIAS = { fix: 'sol' };
// 這一格的時間跟著哪幾個字：項目自己的 text／label／title；x-scene 的拍＝這拍新出現的那個元件的標籤；beats.<欄位>At＝slots.<欄位>（或 <欄位>Text、<欄位>Head）
export function autoSource(seg, obj, key, { raw = false } = {}) {
  const val = (v) => (raw ? (typeof v === 'string' && v.trim() ? v : null) : str(v));
  const slots = seg.slots || {};
  if (key === 'at') {
    for (const k of ['text', 'label', 'title', 'name']) if (val(obj[k])) return obj[k];
    const one = Array.isArray(obj.in) && obj.in.length === 1 ? obj.in[0] : null;
    const part = one && (slots.parts || []).find((x) => x && x.id === one);
    return part ? val(part.label) : null;
  }
  const base = key.slice(0, -2), names = [base, `${base}Text`, `${base}Head`, AT_ALIAS[base]].filter(Boolean);
  for (const o of obj === seg.beats ? [slots] : [obj, slots]) {
    for (const k of names) if (val(o[k])) return o[k];
    if (Array.isArray(o[base]) && val(o[base][0]?.text)) return o[base][0].text;
  }
  return null;
}
function eachField(seg, fn) {
  const walk = (v, where) => {
    if (Array.isArray(v)) { v.forEach((x, i) => (x && typeof x === 'object' ? walk(x, `${where}[${i}]`) : null)); return; }
    for (const [k, x] of Object.entries(v)) {
      if (x && typeof x === 'object') walk(x, where ? `${where}.${k}` : k);
      else fn(v, k, x, where ? `${where}.${k}` : k);
    }
  };
  for (const [k, x] of Object.entries(seg)) if (k !== 'story' && x && typeof x === 'object') walk(x, k);
}
// 骨架：有字可以對的時間格寫 auto（模型不用挑詞）
export function markAuto(seg) {
  let n = 0;
  eachField(seg, (obj, k, x) => { if (AT_KEY.test(k) && x === '#N@詞' && autoSource(seg, obj, k, { raw: true })) { obj[k] = AUTO; n++; } });
  return n;
}
const cueN = (ref) => Number(String(ref ?? '').match(/^#(\d+)/)?.[1]);
// --check-draft、--merge-drafts：auto → #N@詞（只在這段的句號範圍找）；中文圖示 → 英文。回傳 { filled, icons, failed }
// 只收有把握的：卡上的字在這段的字幕裡講得到（2 字的卡整個對到、3 字以上至少連續 3 字），而且比上一格晚（項目照講的順序出現、不會兩拍同時）。
// 改寫過的字對不到就交回給寫草稿的人挑詞（2026-11-09 實測：放寬到 2 字、可以往回找會有 1/3 差 2–5 秒、兩拍撞在同一個詞）
function findSpoken(text, cues, a, z, after) {
  const len = [...String(text).replace(/\s+/g, '')].length;
  const hit = spokenAt(text, cues, { near: after, from: a.start - 0.01, to: z.start + 0.01, minMatch: Math.min(3, Math.max(2, len)) });
  return hit && hit.sec > after + 0.3 ? hit : null;
}
export function resolveAuto(segs, cues) {
  const filled = [], icons = [], failed = [];
  const secOf = (ref) => { const p = parseTime(ref); if (p.error || p.kind !== 'cue') return null; const r = cueSeconds(p, cues); return r.error ? null : r.sec; };
  for (const seg of segs || []) {
    const a = cues.find((c) => c.n === cueN(seg.from ?? seg.at)), z = cues.find((c) => c.n === cueN(seg.to)) || a;
    let after = (a?.start ?? 0) - 1;
    const order = [];   // 這段的時間格照順序：{ where, ref }（ref＝null 是對不到的）
    eachField(seg, (obj, k, x, where) => {
      if (typeof x === 'string' && /^(icon|obj)$|Icon$/.test(k) && /[\u4e00-\u9fff]/.test(x) && ICON_ALIAS[x.trim()]) {
        obj[k] = ICON_ALIAS[x.trim()]; icons.push(`圖示「${x.trim()}」→ ${obj[k]}`); return;
      }
      if (!AT_KEY.test(k) || typeof x !== 'string') return;
      if (x !== AUTO) { const t = secOf(x); if (t != null) after = Math.max(after, t); order.push({ where, ref: x }); return; }   // 自己寫的詞：後面的格接在它後面
      const text = autoSource(seg, obj, k);
      const hit = text && a ? findSpoken(text, cues, a, z, after) : null;
      if (hit) { obj[k] = `#${hit.n}@${hit.kw}`; after = hit.sec; filled.push(`${seg.id}.${where}`); order.push({ where, ref: obj[k] }); }
      else order.push({ where, ref: null, text });
    });
    // 對不到的一次全列：寫的詞要落在前一格和後一格之間，順序才不會倒
    order.forEach((o, i) => {
      if (o.ref) return;
      const prev = order.slice(0, i).reverse().find((x) => x.ref), next = order.slice(i + 1).find((x) => x.ref);
      const span = prev && next ? `，要在 ${prev.ref} 和 ${next.ref} 之間` : next ? `，要比下一格 ${next.ref} 早` : prev ? `，要比上一格 ${prev.ref} 晚` : '';
      failed.push(`${seg.id}.${o.where}：${o.text ? `「${o.text}」在這段（${seg.from ?? seg.at}–${seg.to ?? ''}）的字幕裡對不到、或比上一格早` : '旁邊沒有字可以對'} → 改寫成 #N@詞（講到它的那句字幕裡連續 2–4 個字${span}；不合適就把相鄰那格也自己寫）`);
    });
  }
  return { filled, icons, failed };
}
// 這個模板的用途（.spec.md 那一條第一行冒號後、第一個句點或分號前）：骨架的 story.why 預設值
export const purposeOf = (entry) => String(entry?.text || '').split('\n')[0].replace(/^\*\*[^*]+\*\*(（[^）]*）)?[：:]\s*/, '').split(/[；。]/)[0].trim().slice(0, 40);

const OVERLAP_OK = ['chapter-tag'];   // 章節角標可以和別段重疊：不算接縫、不算相鄰重複（講者介紹不行，會報「一段只放一個情境」）
// 開場的章節（角標或轉場）和講者介紹綁同一句是常態（032 實跑：「s0101（到 #2e）和 s0102（從 #1）重疊 4.1 秒」是 01 章節＋14 講者介紹）：不報重疊
const introPair = (a, b) => [a, b].includes('speaker') && [a, b].some((k) => k === 'chapter' || k === 'chapter-tag');

// 骨架裡有幾格時間（at、…At）：寫草稿的人照範例的項目數填，就是幾拍
export function beatCount(snip) {
  let n = 0;
  const walk = (v, top) => {
    if (Array.isArray(v)) { v.forEach((x) => walk(x, false)); return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) { if (typeof x === 'string' && AT_KEY.test(k) && !(top && k === 'at')) n++; else walk(x, false); }
  };
  walk(snip, true);
  return n;
}
// 詞級逐字稿（和 --words、brief 讀同一份）：#N@詞 的時間照它算，和 --check 一樣
function withWords(P, cues) {
  const tj = readJson(path.join(P.project, 'work', 'transcript.json'));
  const w = (Array.isArray(tj) ? tj : tj?.words || []).filter((x) => x && typeof x.text === 'string' && Number.isFinite(+x.start) && Number.isFinite(+x.end));
  const lastC = cues.length ? cues[cues.length - 1].end : 0;
  if (w.length && Math.abs(Math.max(...w.map((x) => +x.end)) - lastC) <= 2) cues.words = w.map((x) => ({ text: x.text, start: +x.start, end: +x.end })).sort((x, y) => x.start - y.start);
  return cues;
}
// n 拍各自可以綁的字：照下限把段內可以放拍的範圍平均分給 n 拍、拍與拍之間留足拍距，每一拍在自己的範圍裡挑哪個都不會撞到別拍
// 回傳每一拍 ['#12「上傳雲端」', '#13（整句）']（詞從框起來的字開始）；沒有就是空陣列
export function beatWords(cues, a, z, f, n) {
  const lo = a + (f.open || 0), hi = z - (f.end || 0), g = f.gap || 2.5;
  const slack = hi - lo - (n - 1) * g;
  if (!(n > 0) || slack < 0) return [];
  const w = slack / n;
  const timeOf = (c, kw) => { const p = parseTime(`#${c.n}@${kw}`); if (p.error) return null; const r = cueSeconds(p, cues); return r.error ? null : r.sec; };
  return Array.from({ length: n }, (_, k) => {
    const s = lo + k * (w + g), e = s + w, out = [];
    for (const c of cues) {
      if (c.end < s - 1 || c.start > e) continue;
      const chs = [...c.text], ok = chs.map(() => false);
      for (let i = 0; i < chs.length; i++) {
        if (!/[\p{L}\p{N}]/u.test(chs[i])) continue;
        const asc = /[A-Za-z0-9]/.test(chs[i]);
        if (asc && i > 0 && /[A-Za-z0-9]/.test(chs[i - 1])) continue;   // 英數從詞頭開始
        let j = i + 1;
        if (asc) while (j < chs.length && /[A-Za-z0-9]/.test(chs[j])) j++; else if (j < chs.length && /[\p{L}\p{N}]/u.test(chs[j]) && !/[A-Za-z0-9]/.test(chs[j])) j++;
        const t = timeOf(c, chs.slice(i, j).join(''));
        // 中文只標詞頭那個字（詞從它開始就過）；英數整個詞一起標
        if (t != null && t >= s - 1e-6 && t <= e + 1e-6) for (let q = i; q < (asc ? j : i + 1); q++) ok[q] = true;
      }
      const letters = chs.filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
      if (letters && chs.every((ch, i) => ok[i] || !/[\p{L}\p{N}]/u.test(ch))) { out.push(`#${c.n}（整句）`); continue; }
      let i = 0;
      while (i < chs.length) {
        if (!ok[i]) { i++; continue; }
        let j = i;
        while (j < chs.length && (ok[j] || (!/[\p{L}\p{N}]/u.test(chs[j]) && ok[j + 1]))) j++;
        out.push(`#${c.n}「${chs.slice(i, j).join('').trim()}」`);
        i = j;
      }
    }
    return out.slice(0, 4);
  });
}

export function outlineCmd(P, file) {
  const key = String(file).replace(/\.outline\.md$|\.json$/, '').split('/').pop();
  const src = [path.resolve(String(file)), path.join(draftsDir(P), `${key}.outline.md`)].find((x) => { try { return fs.statSync(x).isFile() && x.endsWith('.outline.md'); } catch { return false; } });
  if (!src) { console.log(`✖ 找不到大綱 → 寫到 ${rel(draftsDir(P))}/${key}.outline.md（每段一行：id | from | to | 模板 | 在講什麼 | 候選構想），再跑這條`); return 1; }
  const md = specMdOf(P);
  if (!md) { console.log(`✖ 還沒有分鏡素材（${rel(packDir(P))}/）→ 先跑 node shared/template/tools/build.mjs --project ${rel(P.project)} --scaffold`); return 1; }
  const rows = parseOutline(fs.readFileSync(src, 'utf8'));
  if (!rows.length) { console.log(`✖ ${rel(src)} 沒有讀到任何一行（格式：id | from | to | 模板 | 在講什麼 | 候選構想）`); return 1; }
  const list = specEntries(md), cues = withWords(P, parseSrt(fs.readFileSync(P.srt, 'utf8')));
  const part = (readJson(path.join(packDir(P), 'index.json'))?.parts || []).find((p) => p.key === key);
  const secOf = (ref) => { const p = parseTime(ref); if (p.error || p.kind !== 'cue') return null; const r = cueSeconds(p, cues); return r.error ? null : r.sec; };
  const errors = [], warns = [], hints = [], ids = new Set();
  // 段與段之間的空檔直接接上（每句都要有畫面；常見是 to 寫成「講到第 N 句」）：前一段的 to 改成下一段的 from，段長、拍點都照接好的算。
  // 邊錄邊講（work/screen-sync.json）蓋住的空檔本來就不排，不接
  const syncSpans = (readJson(path.join(P.project, 'work', 'screen-sync.json'))?.segments || []).map((x) => [Number(x.from), Number(x.to)]).filter(([x, y]) => y > x);
  const kindOfRow = (r) => { const e = findSpec(list, r.tpl), s = e && snippetOf(e); return s ? s.scene || s.template || (s.type === 'media' ? 'media' : e.name) : null; };
  const joined = [], seq = rows.filter((r) => !OVERLAP_OK.includes(kindOfRow(r)));
  for (let i = 1; i < seq.length; i++) {
    const p = seq[i - 1], s = seq[i], z = secOf(p.to), a = secOf(s.from);
    if (z == null || a == null || a - z <= 0.5 || syncSpans.some(([x, y]) => x < a && y > z)) continue;
    joined.push(`${p.id} ${p.to}→${s.from}`);
    p.to = s.from;
  }
  const segs = rows.map((r) => {
    const entry = findSpec(list, r.tpl), snip = entry && snippetOf(entry);
    if (!entry || !snip) { errors.push(`${r.id}：不認得模板「${r.tpl}」→ 寫 --map 印的名稱（例 key-point、x-scene、fx 29、media）`); return null; }
    if (ids.has(r.id)) errors.push(`${r.id}：id 重複`);
    ids.add(r.id);
    const a = secOf(r.from), z = secOf(r.to);
    if (a == null || z == null) { errors.push(`${r.id}：起訖「${r.from}」–「${r.to}」看不懂或字幕沒有那句 → 寫 #N、#Ne、#N@詞`); return null; }
    const n = Number(String(r.from).match(/^#(\d+)/)?.[1]);
    if (part && (n < part.firstN || n > part.lastN)) errors.push(`${r.id}：起點 #${n} 不在這一份的範圍（#${part.firstN}–#${part.lastN}）`);
    const kind = snip.scene || snip.template || (snip.type === 'media' ? 'media' : entry.name);
    const need = minSecondsOf(entry, snip), D = Math.round((z - a) * 10) / 10;
    if (D <= 0) errors.push(`${r.id}：結尾 ${r.to} 不在起點 ${r.from} 之後`);
    else if (need && D < need - 0.05) warns.push(`${r.id}（${entry.name}）只有 ${D} 秒，至少要 ${need} 秒 → 併進前後一句，或換一個短一點的模板`);
    const f = floorsOf(entry), win = D > 0 ? beatWindow(cues, a, z, f) : null;
    if (win && !win.first) warns.push(`${r.id}（${entry.name}）放不下任何一拍 → 併進前後一句，或換字卡`);
    else if (win) {
      const where = win.mid ? `#${win.first} 講到一半之後的詞` : `#${win.first}–#${win.last}${win.lastHead ? `（#${win.last} 只用前半句）` : ''}的詞`;
      hints.push(`${r.id}：拍綁在 ${where}，最多 ${win.max} 拍（相鄰兩拍挑不同句的詞；項目比拍多就幾項併一拍；秒數不用算，放不下 --check-draft 會說改哪一格）`);
      // B4：每一拍直接列「選了不會 ✖、⚠」的字（下限、拍距、段尾都過得了），寫草稿的人照挑就好
      const n = Math.min(win.max, beatCount(snip));
      const per = n ? beatWords(cues, a, z, f, n) : [];
      if (per.length) hints.push(`  照 ${n} 拍排，詞的第一個字在「」裡就過得了下限、拍距、段尾：${per.map((p, i) => `第 ${i + 1} 拍 ${p.length ? p.join('、') : '沒有剛好的詞（少一拍，或段頭往前提）'}`).join('｜')}`);
    }
    return { r, entry, snip, kind, a, z };
  });
  const ok = segs.filter(Boolean);
  const main = ok.filter((s) => !OVERLAP_OK.includes(s.kind));
  // 027 版面節奏：開頭 30 秒字卡、半螢幕 ≥ 15 秒、子母畫面 ≥ 45 秒（有講者的橫式）。大綱這一步就擋，骨架產生之後才換模板要重填
  if ((readJson(path.join(packDir(P), 'index.json'))?.hasCamera !== false) && resolveFormat({ projectDir: P.project, plan: readJson(P.plan) || {} }).format !== 'portrait') {
    const lay = main.map((x) => ({ id: x.r.id, start: x.a, end: x.z, from: x.r.from, to: x.r.to, mode: x.snip?.type === 'fx' && x.snip?.bg ? 'pip' : modeOfHead(x.entry.text) })).map((x) => (x.mode === 'full' ? { ...x, mode: null } : x));
    for (const f of layoutFindings(lay)) errors.push(`版面節奏：${f.msg} → ${f.fix}`);
  }
  for (let i = 1; i < main.length; i++) {
    const p = main[i - 1], s = main[i];
    if (s.kind === p.kind && s.kind !== 'media') warns.push(`${s.r.id} 和前一段 ${p.r.id} 都用 ${s.entry.name} → 換一個模板或併成一段`);
    const gap = Math.round((s.a - p.z) * 10) / 10;   // 比實際秒數：#5e 接 #6 算接上
    if (gap > 0.5) warns.push(`${p.r.id} 結尾（${p.r.to}）到 ${s.r.id} 起點（${s.r.from}）空了 ${gap} 秒 → 前一段的 to 寫下一段的 from`);
    else if (gap < -0.5 && !introPair(p.kind, s.kind)) warns.push(`${p.r.id}（到 ${p.r.to}）和 ${s.r.id}（從 ${s.r.from}）重疊 ${-gap} 秒 → 前一段的 to 寫下一段的 from`);
  }
  const tags = ok.filter((s) => s.kind === 'chapter-tag');
  if (tags.length > 1) warns.push(`章節角標放了 ${tags.length} 段（${tags.map((s) => s.r.id).join('、')}）→ 一章只放第一段；小節名稱 build 會自動換到角標上，不用另排`);
  const mapRows = mapRowsOf(P, key);
  if (mapRows) warns.push(...designVsMap(ok.map((s) => ({ id: s.r.id, n: Number(String(s.r.from).match(/^#(\d+)/)?.[1] ?? 0), idea: !!s.r.idea })), mapRows));
  else {
    const eligible = ok.filter((s) => s.kind !== 'media' && !OVERLAP_OK.includes(s.kind)).length;
    const picks = ok.filter((s) => s.r.idea).length, target = designTargetOf(eligible), cap = designCap(target);
    if (target && picks < target) warns.push(`內容設計動畫候選 ${picks} 段，${eligible} 段的三成約 ${target} 段 → 在最值得設計的段寫候選構想`);
    if (cap && picks > cap) warns.push(`內容設計動畫候選 ${picks} 段，最多 ${cap} 段 → 留最值得的`);
  }
  for (const m of errors) console.log(`✖ ${m}`);
  for (const m of warns) console.log(`⚠ ${m}`);
  if (joined.length) console.log(`✓ 段與段之間的空檔自動接上 ${joined.length} 處（前一段的 to 改成下一段的 from；骨架照接好的寫，大綱不用改）：${joined.join('、')}`);
  if (errors.length) { console.log(`未通過：${errors.length} 個 ✖ → 改 ${rel(src)}，再跑一次`); return 1; }
  // 產生骨架：已經填過的段（同 id、同模板）留著填好的內容，只更新起訖和在講什麼
  const out = path.join(draftsDir(P), `${key}.json`);
  const old = new Map((readJson(out)?.segments || []).map((s) => [s.id, s]));
  const prev = readJson(out) || {};
  const anchorOf = (ref) => { const p = parseTime(ref); if (p.kw) return p.kwFull; const c = cues.find((x) => x.n === p.n); return c ? [...c.text].slice(0, 6).join('') : ''; };
  const draftSegs = ok.map(({ r, entry, snip, kind }) => {
    const keep = old.get(r.id), same = keep && (keep.scene || keep.template || (keep.type === 'media' ? 'media' : null)) === kind;
    const seg = { ...JSON.parse(JSON.stringify(snip)), ...(same ? keep : {}), id: r.id };
    if ('at' in snip && !('from' in snip)) seg.at = r.from; else { seg.from = r.from; seg.to = r.to; }
    if ('anchor' in seg || 'from' in seg) seg.anchor = anchorOf(r.from);
    markAuto(seg);
    const st = same ? keep.story || {} : {};
    seg.story = { ...st, say: r.say || st.say || '<講解在講什麼>', why: st.why || purposeOf(entry) || '<為什麼這樣呈現>' };
    if (r.idea) { seg.story.designIdea = r.idea; seg.story.designWhy = st.designWhy || '<為什麼值得設計>'; } else { delete seg.story.designIdea; delete seg.story.designWhy; }
    return seg;
  });
  const draft = { chapter: prev.chapter || key.replace(/^ch/, ''), ...prev, segments: draftSegs };
  for (const k of ['icons', 'quotes', 'moods', 'decide']) if (!draft[k]) draft[k] = k === 'icons' ? {} : [];
  fs.mkdirSync(draftsDir(P), { recursive: true });
  const before = readOpt(out), text = `${JSON.stringify(draft, null, 2)}\n`;
  writeAtomic(out, text);
  const holes = placeholders(draftSegs);
  const autos = draftSegs.reduce((n, sg) => { let k = 0; eachField(sg, (o, kk, x) => { if (x === AUTO) k++; }); return n + k; }, 0);
  console.log(`草稿骨架：${rel(out)}（${draftSegs.length} 段，要填 ${holes.length} 格；起訖、anchor、欄位都寫好了，${autos} 格時間寫 auto 由工具對${old.size ? '，填過的段留著' : ''}）`);
  if (before && before !== text) console.log(changedLine(out));   // 填過的草稿被骨架更新了（起訖、anchor、auto）
  if (hints.length) { console.log('模板動畫的拍綁哪幾句（照這個挑詞就不用算秒數）：'); for (const h of hints) console.log(`  ${h}`); }
  for (const l of next(`只改 ${rel(out)} 裡的 <…>（畫面上的字，<> 裡是字數上限）、#N@詞（講到那個東西的詞）；寫 auto 的時間不用動（工具照卡上的字找講到的地方），why 已經寫了模板用途、要改再改；金句寫 quotes、情緒點寫 moods（chNN.md 寫了要幾個）、拿不定寫 decide。改完驗：`,
    cmdLine('build.mjs', ['--project', rel(P.project), '--check-draft', key]))) console.log(l);
  return 0;
}

// ---------- --check-draft：只驗一份草稿，不受別章影響 ----------

// 草稿路徑：照抄文件的 work/drafts/ch01.json、projects/X/work/...、只寫 ch01 都找得到（指令一律在工作區根目錄跑）
function draftPath(P, file) {
  const f = String(file);
  const tries = [path.resolve(f), path.join(P.project, f), path.join(draftsDir(P), f), path.join(draftsDir(P), `${f}.json`)];
  return tries.find((x) => { try { return fs.statSync(x).isFile(); } catch { return false; } }) || null;
}

// 026 檢查次數的上限由工具數：同一份（地圖、草稿）檢查到第 CHECK_TRY_MAX 次還有 ✖ 就印「停手」，子代理不用自己數工具呼叫
export const CHECK_TRY_MAX = 5;
// 同一份、同一段第幾次檢查（⚠ 只修一輪：第 2 次起 0 個 ✖ 就可以交件，不要一直追 ⚠）
// C2：一個 key 一個檔（lib/tries.mjs）：好幾個子代理同時驗收各自的段，不會互相蓋掉次數（以前全部擠在 check-runs.json）
export const triesDir = (P) => path.join(P.out, '.cache', 'tries');
const legacyRuns = (P) => path.join(P.out, '.cache', 'check-runs.json');
export function runCount(P, key) {
  return bumpTry(triesDir(P), key);
}

// 換人接手這一段（重派、改版確認、回饋輪開始、③ 勾成內容設計動畫）就歸零：新的人第一次 0 個 ✖ 不該就印「可以交件」
export function resetRuns(P, ids) {
  const hit = new Set(resetTry(triesDir(P), ids.flatMap((id) => [`audit:${id}`, `audit-try:${id}`])).map((k) => k.replace(/^audit(-try)?:/, '')));
  // 舊版的 check-runs.json（升級前就在做的專案）：還有這幾段的次數就一起清
  const j = readJson(legacyRuns(P), null);
  const old = j ? ids.filter((id) => j[`audit:${id}`] != null || j[`audit-try:${id}`] != null) : [];
  if (old.length) {
    for (const id of old) { delete j[`audit:${id}`]; delete j[`audit-try:${id}`]; hit.add(id); }
    try { writeAtomic(legacyRuns(P), JSON.stringify(j)); } catch { /* 只是提示，不影響檢查 */ }
  }
  return ids.filter((id) => hit.has(id));
}

// --check 只 ⚠、audit 是 ✖ 的兩條（lib/audit-rules.mjs「開場還沒做完第一拍就到了」「拍在段尾之後」）：草稿階段當 ✖
export const AUDIT_FAIL = /動畫分鏡：(第一拍 \S+ 在段內 |第 \S+ 拍 .*在段尾淡出之後)/;
// resolveAuto 的「s0102.slots.items[0].at」→ 那一格現在的值
function valueAt(segs, where) {
  const [id, ...rest] = String(where).split('.');
  let v = (segs || []).find((s) => s?.id === id);
  for (const k of rest.join('.').split(/\.|\[(\d+)\]/).filter((x) => x != null && x !== '')) v = v?.[k];
  return v;
}

export function checkDraft(P, file) {
  const abs = draftPath(P, file);
  if (!abs) { console.log(`✖ 找不到草稿「${file}」→ 寫完存到 ${rel(draftsDir(P))}/<份>.json，再跑這條`); return 1; }
  let draft;
  try { draft = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { console.log(`✖ ${rel(abs)} 不是合法的 JSON：${e.message}（JSON 不能有註解、最後一項後面不能有逗號）`); return 1; }
  const segs = draft.segments;
  if (!Array.isArray(segs)) { console.log(`✖ ${rel(abs)} 沒有 segments 陣列`); return 1; }
  const holes = placeholders(segs);
  if (holes.length) {
    for (const h of holes.slice(0, 15)) console.log(`✖ 還沒填：${h}`);
    console.log(`未通過：${holes.length} 格還沒填${holes.length > 15 ? `（只列前 15 格）` : ''} → 換成畫面上的字（<> 裡是字數上限）或講到的詞（#N@詞），再跑一次`);
    return 1;
  }
  // B7：檢查只讀、不改草稿（寫草稿的人接著改同一個檔會被擋：「file changed after this session last read it」）。
  // auto 對到的詞、換好的圖示只印出來，--merge-drafts 才寫進草稿；下面的檢查用補好的那一份（記憶體裡）
  const au = resolveAuto(segs, parseSrt(fs.readFileSync(P.srt, 'utf8')));
  if (au.filled.length) {
    const shown = au.filled.slice(0, 12).map((w) => `${w} → ${valueAt(segs, w)}`);
    console.log(`auto 對到 ${au.filled.length} 格（合併時才寫進草稿，草稿不用改）：${shown.join('、')}${au.filled.length > 12 ? '…' : ''}`);
  }
  for (const m of au.icons) console.log(`合併時會換：${m}（草稿不用改）`);
  if (au.failed.length) {
    for (const m of au.failed.slice(0, 15)) console.log(`✖ ${m}`);
    console.log(`未通過：${au.failed.length} 格 auto 對不到字幕 → 照上面改，再跑一次`);
    return 1;
  }
  const base = readJson(P.plan, { version: 1 });
  const tmp = path.join(P.out, '.cache', `draft-${path.basename(abs)}`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({ ...base, scenes: segs, sections: undefined, moods: Array.isArray(draft.moods) ? draft.moods : undefined }));
  // 合併時工具會自動修的（文字對時、小重疊、≤ 3 秒的空檔…，lib/autofix.mjs）先在暫存檔修掉，只回報剩下要自己改的；草稿本身不動
  let autoFixed = [];
  const fx = tool('build.mjs', ['--project', P.project, '--plan', tmp, '--autofix', '--json', ...(P.templateArg || [])]);
  try { const o = JSON.parse(fx.stdout); if (o.fixes?.length && o.plan) { autoFixed = o.fixes; fs.writeFileSync(tmp, JSON.stringify(o.plan)); } } catch { /* 修不了就照原樣檢查 */ }
  const r = tool('build.mjs', ['--project', P.project, '--plan', tmp, '--check', '--json', ...(P.templateArg || [])]);
  let j;
  try { j = JSON.parse(r.stdout); } catch { console.log(`✖ 檢查沒有跑完：${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' ')}`); return 1; }
  const ids = new Set(segs.map((s) => s.id));
  const mine = (m) => { const x = String(m).match(/^\[([\w-]+)/); return !x || ids.has(x[1]); };
  // 只留這一份自己要處理的：全片才看得出來的（空檔、音效密度）、主代理處理的（小節合併時寫、字幕到剪輯台改、設計師之後做）不算
  const skip = /沒有畫面的區間|音效稀疏|音效密度|還沒排段落|只有聲音的區間|講稿有 \d+ 個小節|字幕不到|內容設計動畫還沒做|還沒設定講者|前的空檔只有/;
  const covers = (m) => { const x = String(m).match(/大約會蓋到講者框 (\d+)%/); return x && Number(x[1]) < 40 && !String(m).includes('臉'); };
  const parts = readJson(path.join(packDir(P), 'index.json'))?.parts || [];
  const part = parts.find((p) => p.key === path.basename(abs, '.json'));
  // B4：同一條規則草稿階段和定稿（audit）同一個等級：第一拍來不及做完開場、拍落在段尾淡出之後，audit 都是 ✖，草稿就先擋
  const errors = [...j.errors.filter((m) => mine(m) && !skip.test(m)), ...j.warnings.filter((m) => mine(m) && !skip.test(m) && AUDIT_FAIL.test(m))];
  const warns = j.warnings.filter((m) => mine(m) && !skip.test(m) && !covers(m) && !AUDIT_FAIL.test(m));   // 蓋到講者 < 40% 又沒碰到臉：--storyboard 的截圖才看得出擋到哪
  if (part) {
    const missing = segs.filter((s) => !s.story?.say).map((s) => s.id);
    if (missing.length) warns.unshift(`這幾段沒有 story.say（分鏡表要用）：${missing.join('、')}`);
    const mapRows = mapRowsOf(P, part.key);
    if (mapRows) warns.unshift(...designVsMap(segs.map((s) => ({ id: s.id, n: cueOf(s), idea: !!(s.design || isDesignPick(s)) })), mapRows));
    else {
      const designs = segs.filter((s) => s.design || isDesignPick(s)).length;
      const eligible = segs.filter(designEligible).length;
      const target = part.target ? designTargetOf(eligible) : 0, cap = designCap(target);
      if (target && designs > cap) warns.unshift(`內容設計動畫候選 ${designs} 段，這一份 ${eligible} 段最多 ${cap} 段 → 留最值得的 ${cap} 段，其他拿掉 story.designIdea`);
      if (target && designs < target) warns.unshift(`內容設計動畫候選 ${designs} 段，這一份 ${eligible} 段的三成約 ${target} 段 → 挑最值得設計的時刻，在那段的 story 寫 designIdea、designWhy（共用.md 第 4 節）；真的沒有就在 decide 寫原因`);
    }
    for (const s of segs) { const n = cueOf(s); if (n && (n < part.firstN || n > part.lastN)) warns.push(`${s.id} 的起點 #${n} 不在這一份的範圍（#${part.firstN}–#${part.lastN}）`); }
    // 情緒點（moods）：數量、範圍、推近次數；欄位與詞對不對得上由 build --check 報（moods[i]…）
    const mt = moodTarget(part.seconds ?? (part.end - part.start));
    const moods = Array.isArray(draft.moods) ? draft.moods : [];
    if (draft.moods !== undefined && !Array.isArray(draft.moods)) errors.push('moods 要是陣列，例 "moods": [{ "at": "#12@千萬不要", "kind": "pain" }]');
    else if (moods.length < mt.low) warns.push(`情緒點 ${moods.length} 個，這一份約 ${mt.target} 個 → 從 chNN.md 的「情緒點」候選挑講者情緒最強的詞，寫進 moods（{ "at": "#N@詞", "kind": "${Object.keys(MOOD_KINDS).join('／')}" }）；真的沒有就在 decide 寫原因`);
    else if (moods.length > mt.cap) warns.push(`情緒點 ${moods.length} 個，這一份最多 ${mt.cap} 個 → 留情緒最強的，其他拿掉（太多會一直有音效）`);
    for (const [i, m] of moods.entries()) { const n = Number(String(m?.at ?? '').match(/^#(\d+)/)?.[1]); if (n && (n < part.firstN || n > part.lastN)) warns.push(`moods[${i}] 的 #${n} 不在這一份的範圍（#${part.firstN}–#${part.lastN}）`); }
    const zs = moods.filter((m) => m?.zoom === true).length;
    if (zs > mt.zoomCap) warns.push(`推近（zoom）${zs} 次，這一份最多 ${mt.zoomCap} 次 → 只留金句、反轉最強的那幾個`);
    const tags = segs.filter((s) => s.scene === 'chapter-tag').map((s) => (j.items || []).find((x) => x.id === s.id)).filter(Boolean);
    for (const u of j.uncovered || []) {
      const [a, b] = Array.isArray(u) ? u : [u.from ?? u.start, u.to ?? u.end];
      if (!(b > part.start + 0.01 && a < part.end - 0.01) || tags.some((t) => t.start < b && t.end > a)) continue;   // 章節角標那段本來就讓講者露臉
      warns.push(`沒有畫面的區間 ${clock(a)}–${clock(b)} → 前一段的 to 寫下一段的 from（0 秒相接），或補一段字卡`);
    }
    // 只看這一份的範圍：草稿只有這一章的段，主軌後面的旁白當然還沒蓋
    // 邊錄邊講的螢幕錄影（work/screen-sync.json）合併後由 media.mjs screen-sync --write-plan 蓋回，草稿不用排：扣掉那幾段（rough.mp4 秒數）
    const syncSpans = (readJson(path.join(P.project, 'work', 'screen-sync.json'))?.segments || []).map((x) => [Number(x.from), Number(x.to)]).filter(([x, y]) => y > x);
    const minus = (span) => subtractSpans(span, syncSpans);
    for (const v of j.voiceUncovered || []) {
      const [a0, b0] = Array.isArray(v) ? v : [v.from ?? v.start, v.to ?? v.end];
      for (const [a, b] of minus([Math.max(a0, part.start), Math.min(b0, part.end)])) {
      if (b - a <= 0.1) continue;
      const over = (j.items || []).filter((x) => !x.opaque && ids.has(x.id) && x.start < b - 0.05 && x.end > a + 0.05).map((x) => x.id);
      const line = `只有聲音的區間 ${clock(a)}–${clock(b)} 沒被蓋住 → ${over.length ? `${over.join('、')} 疊在講者上，這裡沒有講者，換成全畫面模板（共用.md 第 3 節的替換表）或內容設計動畫` : '加 media 段或不透明全幕，或把前一段的 to 接到下一段的 from'}`;
      if (b - a > 1) errors.push(line); else warns.push(line);
      }
    }
  }
  for (const m of errors) console.log(`✖ ${m}`);
  for (const m of warns) console.log(`⚠ ${m}`);
  if (autoFixed.length) {
    const n = {};
    for (const f of autoFixed) n[f.kind] = (n[f.kind] || 0) + 1;
    console.log(`合併時工具會自動修 ${autoFixed.length} 處（${Object.entries(n).map(([k, v]) => `${FIX_KINDS[k] || k} ${v}`).join('、')}），草稿不用改`);
  }
  const nth = runCount(P, `draft:${path.basename(abs)}`);
  console.log(errors.length ? `未通過：${errors.length} 個 ✖、${warns.length} 個 ⚠` : `通過：${segs.length} 段，${warns.length} 個 ⚠${nth >= 2 && warns.length ? '。可以交件，⚠ 不用再修' : ''}`);
  if (errors.length && nth >= CHECK_TRY_MAX) console.log(`→ 停手：這一份已經檢查 ${nth} 次還有 ✖。不要再改，把上面還在的 ✖ 原文回報主代理。`);
  return errors.length ? 1 : 0;
}

// ---------- 內容設計動畫：派工用的資料 ----------

const sfxList = (P) => {
  const sfx = readJson(path.join(P.templateDir, 'kit', 'sfx.json'), {});
  return Object.entries(sfx).filter(([, v]) => v?.kind === 'sfx').map(([k, v]) => `${k}（${v.zh || k}）`).join('、');
};

// 這段的畫布：工具知道有沒有講者，直接寫給設計師，不用他猜
function canvasNote(seg, item, plan = {}) {
  if (seg.layout === 'overlay') {
    const head = '## 畫布：疊在講者畫面上\n\n沒有底圖，講者就是背景，內容不要擋臉。y ≥ 920 是字幕。';
    const sb = plan.speakerBox;
    if (!Array.isArray(sb) || sb.length !== 4 || plan.format === 'portrait') return head;
    // 和 audit「壓到講者」量的是同一個框（內容設計動畫段不是半畫面，不加 sideShift）
    const [x0, y0, x1, y1] = sb.map(Math.round);
    const zones = [x0 - 120 >= 300 ? `左邊 x 120–${x0}` : null, 1800 - x1 >= 300 ? `右邊 x ${x1}–1800` : null].filter(Boolean);
    return `${head}\n\n講者框 x ${x0}–${x1}、y ${y0}–${y1}（audit 照這個框量「壓到講者」）。${zones.length ? `內容放在${zones.join('，或')}，y 40–900。` : '講者框左右都不到 300 寬：內容放小、只壓到身體，不要擋臉。'}`;
  }
  const it = item?.out || {};
  const badge = it.badgeBox ? `右上角小節角標 x ${Math.round(it.badgeBox[0])}–${Math.round(it.badgeBox[2])}、y ${Math.round(it.badgeBox[1])}–${Math.round(it.badgeBox[3])}` : '';
  if (it.wide) return `## 畫布：全螢幕（這段沒有講者）\n\n內容用滿 x 120–1800、y 40–900，左右和縮到 87% 的螢幕錄影對齊（錄影在 x 125–1796、y 0–940），接到錄影不會跳。不用留小視窗；撐開整個寬度，不要擠在左邊。\n\n不能碰：y ≥ 920（字幕）${badge ? `、${badge}（這個角落空著，別的元素離它至少 16）` : ''}。底是純色，沒有背景圖。`;
  const [zx0, zy0, zx1, zy1] = canvasOf('landscape').pip.zone, pz = `x ${zx0}–${zx1}、y ${zy0}–${zy1}`;
  return `## 畫布：右下有講者小視窗\n\n主內容 x 120–1300、y 150–858。不能碰：小視窗 ${pz}；y ≥ 920（字幕）${badge ? `、${badge}` : ''}。`;
}

// brief 的字幕：段內的句子寫「從這段起點算的秒數」，設計師不用自己累加句長（累加會漏掉句間停頓，和段長對不上，就會整份重排）
// opts.words（詞級逐字稿）有給：句子裡插 ⟨N⟩＝講到這裡是段內第 N 秒，挑詞時看得到它在哪一秒，不用猜、不用另外查
// opts.end（這段幾秒）有給：最後一句超過段尾就寫到段尾、註明後半句在下一段（026：段長和句尾對不上時設計師會回頭找 plan）
export function tickText(c, t0, words, end = Infinity) {
  const chs = [...c.text];
  const total = textWidth(c.text) || 1;
  let acc = 0, prev = c.start;
  const at = chs.map((ch, i) => {
    const prop = c.start + (acc / total) * (c.end - c.start);
    acc += textWidth(ch);
    const kw = chs.slice(i, i + 2).join('');
    const real = words?.length && !/[\s\p{P}\p{S}]/u.test(ch) ? wordTime(words, c, kw, { guess: prop, pad: 0.3 }) : null;
    const t = Math.min(c.end, Math.max(prev, real != null && Math.abs(real - prop) < 1.5 ? real : prop));   // 不往回走；逐字稿對到別的地方（差太多）就用字數比例
    prev = t;
    return t - t0;
  });
  let next = Math.max(1, Math.floor(Math.max(0, c.start - t0)) + 1), out = '';
  chs.forEach((ch, i) => {
    while (i > 0 && at[i] >= next - 1e-6 && next < Math.min(end, c.end - t0) - 0.2) { out += `⟨${next}⟩`; next += 1; }
    if (at[i] >= next - 1e-6) next = Math.floor(at[i]) + 1;
    out += ch;
  });
  return out;
}
export function briefCueLines(cues, a, z, t0, { words = null, end = null } = {}) {
  return cues.filter((c) => c.n >= a - 3 && c.n <= z + 2).map((c) => {
    if (c.n < a || c.n > z) return `（前後文）#${c.n}（${(c.end - c.start).toFixed(1)} 秒）${c.text}`;
    const e = c.end - t0, cut = end != null && e > end + 0.25;
    return `#${c.n}（段內 ${Math.max(0, c.start - t0).toFixed(1)}–${(cut ? end : e).toFixed(1)} 秒）${words ? tickText(c, t0, words, end ?? Infinity) : c.text}${cut ? `（這段在 ${end.toFixed(1)} 秒結束，這句後面是下一段）` : ''}`;
  });
}

// brief 的拍點：把 audit 量的三件事換成這一段的秒數，設計師不用從通則推（026：規則寫成通則時，短的段排不進去，
// 設計師會花大半時間心算或去翻 audit 原始碼）。數字的來源（lib/audit-rules.mjs）：
//   完成態停太短 ⚠：兩拍之間要靜止 ≥ HOLD_MIN（1.2 秒）→ 一拍的動作約 1 秒，兩拍相隔 gap 秒就夠
//   最後一幕太短 ⚠：最後一個動作做完到淡出（段尾前 FADE 秒）要停 ≥ TAIL_MIN（1.5 秒）→ 最後一拍在段尾前 end 秒最從容
//   拍在段尾之後 ✖：P.at 落在淡出之後看不到 → 最晚在段尾前 FADE 秒
export const BRIEF_BEAT = { open: 1.5, gap: 2.5, end: 3, fade: 0.5 };
export function beatAdvice(secs) {
  const D = Number(secs);
  if (!Number.isFinite(D) || D <= 0) return '';
  const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
  const lo = BRIEF_BEAT.open, hi = D - BRIEF_BEAT.end, latest = f1(Math.max(0, D - BRIEF_BEAT.fade));
  const late = `最關鍵的詞比這晚也照樣綁它（那一拍的動作做短一點，audit 的「最後一幕太短」⚠ 留著），但不能晚於 ${latest} 秒：那之後畫面已經在淡出，看不到`;
  if (hi < lo + 0.5) return `這段只有 ${f1(D)} 秒：第 0 拍之後放 1 拍，綁這段最關鍵的那個詞。${late.replace('最關鍵的詞比這晚也照樣綁它', '它靠近段尾也照樣綁')}。`;
  const max = 1 + Math.floor((hi - lo) / BRIEF_BEAT.gap + 1e-6);
  return `第 0 拍之後放得下 ${max} 拍${max > 1 ? `，兩拍相隔 ${BRIEF_BEAT.gap} 秒以上` : ''}。第一拍在 ${f1(lo)} 秒之後（前面留給開場），最後一拍在 ${f1(hi)} 秒前最從容；${late}。`;
}

// brief 的視覺語言：只帶和這一段有關的（026：整份貼進每一段，六成是別段的事）。
// 「這集在講」、配色整段留；主題只留句號範圍蓋到這一段的（其他只列名稱）；「其他段的方向」只留蓋到這一段的列。
// 主題都沒寫句號（對不出哪個有關）就全部留。
export function visionFor(md, a, z) {
  const text = String(md || '').replace(/^#\s.*\n/, '').trim();
  if (!text) return '';
  const hits = (line) => [...line.matchAll(/#(\d+)(?:\s*[–-]\s*#?(\d+))?/g)].some((m) => { const x = +m[1], y = +(m[2] ?? m[1]); return x <= z && y >= a; });
  const secs = text.split(/\n(?=##\s)/);
  const out = [];
  for (const sec of secs) {
    const [head, ...rest] = sec.split('\n');
    if (!/^##\s/.test(head)) { out.push(sec.trim()); continue; }
    const bullets = rest.filter((l) => /^\s*[-*]\s/.test(l));
    if (/主題/.test(head) && bullets.length && bullets.some((l) => /#\d/.test(l))) {
      const mine = bullets.filter(hits), other = bullets.filter((l) => !hits(l)).map((l) => l.match(/\*\*(.+?)\*\*/)?.[1]).filter(Boolean);
      if (mine.length) out.push(`## 這一段用到的主題\n\n${mine.join('\n')}`);
      if (other.length) out.push(`全片另外的主題（這一段不在它們的範圍，想呼應才用）：${other.join('、')}`);
    } else if (/其他段|各段/.test(head)) {
      const mine = bullets.filter(hits);
      if (mine.length) out.push(`## 這一段的方向\n\n${mine.join('\n')}`);
    } else out.push(sec.trim());
  }
  return out.filter(Boolean).join('\n\n').replace(/^##\s/gm, '### ');   // brief 裡是「這集的視覺語言」底下的小節
}

// 這段用到的插圖元件：模板段看 slots.parts，內容設計動畫看做好的動畫檔（設計師不能讀別段的檔，brief 直接寫給他，相鄰段才畫得一樣）
export function illusUsed(P, seg) {
  const out = [];
  const name = (n, orient) => (orient ? `${n}（${orient}）` : n);
  const walk = (parts) => { for (const x of parts || []) { if (Array.isArray(x?.parts)) walk(x.parts); else if (x?.illus) out.push(name(x.illus, x.opts?.orient)); } };
  walk(seg?.slots?.parts);
  const html = seg?.design && P?.out ? readOpt(path.join(P.out, designFileOf(seg))) : '';
  if (html && !isBlankDesign(html)) {
    for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<[^>]*\bdata-illus(?:-src)?="([^"]+)"[^>]*>/g)) {
      out.push(name(m[1].replace(/^illus-local\//, '').replace(/\.svg$/i, ''), m[0].match(/\bdata-orient="([^"]+)"/)?.[1]));
    }
  }
  return [...new Set(out)];
}

function writeBriefs(P, plan, cues, { items: given = null, onlyMissing = false } = {}) {
  let segs = (plan.scenes || []).filter((s) => s.design);
  if (onlyMissing) segs = segs.filter((s) => !fs.existsSync(path.join(briefsDir(P), `${s.id}.md`)));
  if (!segs.length) return [];
  let items = new Map();
  if (given) items = new Map(given.map((x) => [x.id, x]));
  else try { items = new Map((checkJson(P).items || []).map((x) => [x.id, x])); } catch { /* 算不出來就用字幕估 */ }
  fs.mkdirSync(briefsDir(P), { recursive: true });
  fs.mkdirSync(designsDir(P), { recursive: true });
  if (!cues.words) {   // 詞級逐字稿（和 --words 讀同一份）：字幕裡標得出每一秒講到哪
    const tj = readJson(path.join(P.project, 'work', 'transcript.json'));
    const w = (Array.isArray(tj) ? tj : tj?.words || []).filter((x) => x && typeof x.text === 'string' && Number.isFinite(+x.start) && Number.isFinite(+x.end));
    const lastC = cues.length ? cues[cues.length - 1].end : 0;
    if (w.length && Math.abs(Math.max(...w.map((x) => +x.end)) - lastC) <= 2) cues.words = w.map((x) => ({ text: x.text, start: +x.start, end: +x.end })).sort((x, y) => x.start - y.start);
  }
  const ordered = (plan.scenes || []);
  return segs.map((s) => {
    const a = cueOf(s), z = Number(String(s.to || s.from || '').match(/^#(\d+)/)?.[1] ?? a);
    const idx = ordered.indexOf(s);
    const near = (seg) => {
      if (!seg) return '無';
      const il = illusUsed(P, seg);
      return `${seg.id}（${seg.design ? '內容設計動畫' : seg.template || seg.scene || seg.type}${seg.story?.idea ? `：${seg.story.idea}` : ''}）${il.length ? `；插圖：${il.join('、')}（同一個東西用同一個名稱、朝向）` : ''}`;
    };
    const inside = cues.filter((c) => c.n >= a && c.n <= z);
    const it = items.get(s.id);
    const secs = it?.start != null && it?.end != null ? (it.end - it.start).toFixed(1) : inside.length ? (inside[inside.length - 1].end - inside[0].start).toFixed(1) : '?';
    // 段起點用字幕的時間軸算（和下面的句子同一個基準；from 寫 #N@詞 時就是那個詞的時間）
    const fromSec = (() => { const t = parseTime(String(s.from || '')); if (t?.error || t?.n == null) return null; const r = cueSeconds(t, cues); return r.error ? null : r.sec; })();
    const t0 = fromSec ?? it?.start ?? inside[0]?.start ?? 0;
    const lines = briefCueLines(cues, a, z, t0, { words: cues.words?.length ? cues.words : null, end: Number.isFinite(+secs) ? +secs : null });
    const vision = visionFor(readOpt(path.join(packDir(P), '視覺語言.md')), a, z);
    const beat = beatAdvice(secs);
    const body = `# ${s.id} 內容設計動畫\n\n段落：${s.from}–${s.to}（#Ne＝第 N 句結尾，#N@詞＝第 N 句講到那個詞；這段 ${secs} 秒）\n構想（草稿寫的，可以推翻）：${s.story?.idea || '—'}\n為什麼值得設計：${s.story?.why || '—'}\n前一段：${near(ordered[idx - 1])}\n後一段：${near(ordered[idx + 1])}\n\n${canvasNote(s, it, plan)}\n\n## 字幕（段內秒數＝從這段起點算；這段到 ${secs} 秒${cues.words?.length ? '；⟨2⟩＝講到這裡是段內第 2 秒' : ''}）\n\n${lines.join('\n')}${beat ? `\n\n## 拍點\n\n${beat}` : ''}\n\n## 音效（音效拍點欄只能寫這些名稱，或 —）\n\n${sfxList(P)}${vision ? `\n\n## 這集的視覺語言（全片一致用；只列和這一段有關的）\n\n${vision}` : ''}\n\n鏡位腳本寫到：work/designs/${s.id}.md\n動畫檔：work/hyperframes/${designFileOf(s)}\n`;
    const f = path.join(briefsDir(P), `${s.id}.md`);
    fs.writeFileSync(f, body);
    return { id: s.id, brief: rel(f) };
  });
}

// build／--check 用：內容設計動畫段沒有 work/briefs/<段>.md（修改單、改版直接把模板段改成 design: true）就補寫一份，設計師才有畫布和段內秒數
// items 用 build 剛算好的（jsonItems），不另外跑 --check（避免遞迴）；已經有的 brief 不動
export function ensureBriefs(P, plan, items) {
  if (!P?.project || !P.srt || !fs.existsSync(P.srt)) return [];
  if (!(plan.scenes || []).some((s) => s.design)) return [];
  try { return writeBriefs(P, plan, parseSrt(fs.readFileSync(P.srt, 'utf8')), { items, onlyMissing: true }); } catch { return []; }
}

// ---------- --merge-drafts ----------

const backupStamp = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
export function backupPlan(file, tag = 'merge') {
  let b = `${file}.bak-${tag}-${backupStamp()}`;
  for (let k = 2; fs.existsSync(b); k++) b = `${file}.bak-${tag}-${backupStamp()}-${k}`;
  fs.copyFileSync(file, b);
  return b;
}

export const mergeDrafts = (P, flags = {}, deps = {}) => endTry(P, 'merge-drafts', mergeRun(P, flags, deps));
function mergeRun(P, flags, deps) {
  const dir = draftsDir(P);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^ch\d+\.json$/.test(f)).sort(); } catch { /* 沒有 */ }
  if (!files.length) { console.log(`✖ ${rel(dir)} 沒有草稿（chNN.json）→ 先照 work/分鏡素材/ 寫`); return 1; }
  const parts = readJson(path.join(packDir(P), 'index.json'))?.parts || [];
  const missing = parts.map((p) => p.key).filter((k) => !files.includes(`${k}.json`));
  const segs = [], ends = [], icons = {}, quotes = [], moods = [], decide = [], problems = [], warns = [];
  let hasMoods = false;
  let cuesMemo = null;
  const mergeCues = () => (cuesMemo ||= parseSrt(fs.readFileSync(P.srt, 'utf8')));
  for (const f of files) {
    const d = readJson(path.join(dir, f));
    if (!d || !Array.isArray(d.segments)) { problems.push(`${f} 讀不到 segments → 修好 JSON 再跑`); continue; }
    const au = resolveAuto(d.segments, mergeCues());
    // 合併時才落地（--check-draft 只印）；改了 AI 寫的檔就說一聲
    if (au.filled.length || au.icons.length) { writeAtomic(path.join(dir, f), `${JSON.stringify(d, null, 2)}\n`); console.log(changedLine(path.join(dir, f))); }
    if (au.filled.length) warns.push(`${f}：自動補 ${au.filled.length} 格時間（auto → #N@詞）`);
    for (const m of au.icons) warns.push(`${f}：自動換${m}`);
    for (const m of au.failed) problems.push(`${f} ${m}`);
    segs.push(...d.segments);
    const last = [...d.segments].sort((x, y) => cueOf(x) - cueOf(y)).pop();
    if (last) ends.push(last);
    for (const [k, v] of Object.entries(d.icons || {})) { if (icons[k] && icons[k] !== v) warns.push(`圖示不一致：「${k}」有 ${icons[k]} 和 ${v} → 全集用同一個（這次用 ${icons[k]}）`); else icons[k] = v; }
    quotes.push(...(d.quotes || []));
    if (Array.isArray(d.moods)) { hasMoods = true; moods.push(...d.moods); }
    decide.push(...(d.decide || []));
  }
  const seen = new Set();
  for (const s of segs) { if (seen.has(s.id)) problems.push(`段 id「${s.id}」重複 → 照 chNN.md 寫的開頭改`); seen.add(s.id); }
  if (missing.length) warns.push(`還沒有草稿的份：${missing.join('、')}`);
  for (const p of problems) console.log(`✖ ${p}`);
  if (problems.length) return 1;
  segs.sort((a, b) => cueOf(a) - cueOf(b));
  // 分章的交界：各份只看得到自己的字幕，前一份的最後一段接到下一份的第一段（style.md「連續覆蓋」）；差超過 2 句就留給 --check 報
  const joined = [];
  for (const [i, a] of ends.entries()) {
    const k = segs.indexOf(a), b = segs[k + 1];
    if (!b || i === ends.length - 1 || !a.to || !b.from || a.scene === 'chapter-tag') continue;
    const gap = cueOf(b) - Number(String(a.to).match(/^#(\d+)/)?.[1] ?? 0);
    if (gap >= 0 && gap <= 2 && String(a.to) !== String(b.from)) { a.to = b.from; joined.push(`${a.id}→${b.id}`); }
  }
  const planText = readOpt(P.plan);
  let plan = { version: 1 };
  if (planText.trim()) {
    try { plan = JSON.parse(planText); } catch (e) { console.log(`✖ plan.json 不是合法的 JSON（${e.message}）→ 修好再合併（合併只換 scenes，frame、speakerBox 這些都要留著）`); return 1; }
  }
  // 分鏡表套回、剪輯台、回饋輪的改動都只在 plan.json，草稿沒有：段落在上次合併之後改過，再合併就會蓋掉
  const mergedFile = path.join(dir, '_merged.json');
  if (Array.isArray(plan.scenes) && plan.scenes.length && !flags.force && readJson(mergedFile)?.scenesHash !== sha(JSON.stringify(plan.scenes))) {
    console.log('✖ plan.json 的段落在上次合併之後改過（分鏡表套回、剪輯台、回饋輪的改動都只在 plan.json，草稿沒有）→ 再合併會把這些改動蓋掉。要改段落就改 plan.json；確定不要那些改動才加 --force（會先備份）');
    return 1;
  }
  // 邊錄邊講的螢幕錄影（work/screen-sync.json，media.mjs screen-sync 算好的 sync01…）：草稿不排，合併時照帶進來，不用另外 --write-plan
  const syncSegs = (readJson(path.join(P.project, 'work', 'screen-sync.json'))?.segments || []).filter((x) => /^sync\d+$/.test(x?.id || ''));
  plan.scenes = [...segs.filter((x) => !/^sync\d+$/.test(x?.id || '')), ...syncSegs];
  if (syncSegs.length) console.log(`邊錄邊講的螢幕錄影 ${syncSegs.length} 段（work/screen-sync.json）一起放進 plan.json`);
  const idx = readJson(path.join(packDir(P), 'index.json'));
  if (idx?.sections?.length && plan.sections === undefined) plan.sections = idx.sections;
  // 情緒點：各份的 moods 照句號排好，整份換掉（分鏡表停點 ③ 改的是 plan.json；再合併會蓋掉，和 scenes 一樣）
  if (hasMoods) {
    const nOf = (m) => Number(String(m?.at ?? '').match(/^#(\d+)/)?.[1] ?? 0);
    const sorted = [...moods].sort((a, b) => nOf(a) - nOf(b));
    plan = insertMoods(plan, sorted);
  }
  const planNext = `${JSON.stringify(plan, null, 2)}\n`;
  if (planText.trim() && planText !== planNext) backupPlan(P.plan);
  writeAtomic(P.plan, planNext);
  const fixedN = autofixStep(P);
  if (fixedN) plan = readJson(P.plan) || plan;
  fs.writeFileSync(mergedFile, `${JSON.stringify({ icons, quotes, ...(hasMoods ? { moods: [...moods].sort((a, b) => Number(String(a?.at ?? '').match(/^#(\\d+)/)?.[1] ?? 0) - Number(String(b?.at ?? '').match(/^#(\\d+)/)?.[1] ?? 0)) } : {}), decide, scenesHash: sha(JSON.stringify(plan.scenes)) }, null, 2)}\n`);
  markStep(P.project, 'merge-drafts');
  const cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  const designs = writeBriefs(P, plan, cues);
  for (const w of new Set(warns)) console.log(`⚠ ${w}`);
  const r = tool('build.mjs', ['--project', P.project, '--check', ...(P.templateArg || [])]);
  const lines = (r.stdout || '').split('\n');
  for (const l of failLines(r)) console.log(l);
  // 和 --check-draft 同一個等級（AUDIT_FAIL）：第一拍來不及做完開場、拍落在段尾淡出之後，--check 只 ⚠、audit 是 ✖；合併就先擋，不產生分鏡表、不停 ③
  let auditFail = [];
  try { auditFail = (JSON.parse(tool('build.mjs', ['--project', P.project, '--check', '--json', ...(P.templateArg || [])]).stdout).warnings || []).filter((m) => AUDIT_FAIL.test(m)); } catch { /* 讀不到就照文字版的結果 */ }
  for (const m of auditFail) console.log(`✖ ${m}`);
  const summary = lines.filter((l) => /^(通過|未通過)：/.test(l)).pop();
  const videoDur = idx?.videoDur ?? 0;
  const target = videoDur >= 60 ? designTargetOf((plan.scenes || []).filter(designEligible).length) : 0;
  if (joined.length) console.log(`接起分章交界的空檔：${joined.join('、')}`);
  const cap = designCap(target);
  const picks = (plan.scenes || []).filter(isDesignPick).length + designs.length;
  // 走語意地圖的包：候選數量在 --map-merge 全片定過了，這裡只對照地圖上的 A
  const mapA = idx?.semanticMap && parts.every((p) => fs.existsSync(mapFile(P, p.key))) ? parts.reduce((n, p) => n + (mapRowsOf(P, p.key) || []).filter((r) => r.tier === 'A').length, 0) : null;
  const note = mapA != null ? `（語意地圖上 A ${mapA} 段）` : `${picks < target ? `（⚠ 約三成的段是 ${target} 個候選）` : ''}${picks > cap ? `（⚠ 上限 ${cap} 段 → 留最值得的，其他在草稿拿掉 designIdea 再合併）` : ''}`;
  console.log(`合併：${segs.length} 段（${files.length} 份）；內容設計動畫候選 ${picks} 段（停點 ③ 勾了才做）${designs.length ? `，其中 ${designs.length} 段已經指定要做` : ''}${note}`);
  if (hasMoods) console.log(`情緒點 ${moods.length} 個（${Object.entries(MOOD_KINDS).map(([k, v]) => `${v.zh} ${moods.filter((m) => m?.kind === k).length}`).join('、')}；推近 ${moods.filter((m) => m?.zoom === true).length} 次）`);
  if (summary) console.log(auditFail.length && /^通過：/.test(summary) ? `未通過：${auditFail.length} 個 ✖（第一拍來不及做完開場、拍落在段尾淡出之後：--check 只 ⚠，audit 會擋，合併就先擋）` : summary);
  if (r.status !== 0 || auditFail.length) { for (const l of next('照 ✖ 改（改那一份 work/drafts/chNN.json，再合併一次）', cmdLine('build.mjs', ['--project', rel(P.project), '--merge-drafts']))) console.log(l); return 1; }
  const todo = designs.filter((d) => !fs.existsSync(path.join(designsDir(P), `${d.id}.md`)));
  const sbCmd = cmdLine('build.mjs', ['--project', rel(P.project), '--storyboard']);
  if (todo.length) {
    recordDispatch(P, todo.map((d) => d.id));
    for (const l of dispatch(`內容設計動畫一段派一個設計師寫鏡位腳本，同一則回覆一次派出（一次最多 ${agentsOf(P)} 個，回來再派下一批）：${todo.map((d) => d.id).join('、')}。派工訊息只送下面這一行（換掉 <段>，不要另外加要求）：`,
      `你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。照 .agents/skills/auto-edit-motion/references/design.md 只寫鏡位腳本（第 1 節），寫完就回報。`)) console.log(l);
    console.log('全部回來後產生分鏡表：');
    console.log(sbCmd);
  } else if (deps.loadLib && !flags['no-storyboard']) {
    // 合併過了、沒有要先寫的鏡位腳本：直接接著產生分鏡表（主代理少一個回合；停點 ③ 那一行在最後）
    console.log('合併通過，接著產生分鏡表（同 --storyboard）：');
    return storyboardRun(P, {}, deps, { fixed: fixedN });
  } else for (const l of next('截圖、產生分鏡表，停在停點 ③', sbCmd)) console.log(l);
  return 0;
}

// ---------- --storyboard ----------

function loadDesigns(P, plan) {
  const out = new Map();
  for (const s of plan.scenes || []) {
    if (!s.design) continue;
    const md = readOpt(path.join(designsDir(P), `${s.id}.md`));
    if (!md) continue;
    const d = parseDesign(md, s.id);
    d.done = !isBlankDesign(readOpt(path.join(P.out, designFileOf(s))));
    out.set(s.id, d);
  }
  return out;
}

function checkJson(P) {
  const r = tool('build.mjs', ['--project', P.project, '--check', '--json', ...(P.templateArg || [])]);
  try { return JSON.parse(r.stdout); } catch { throw new Error(`build --check 沒有輸出 JSON：${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' ')}`); }
}

function genContext(P, plan, j, shotsList, lib) {
  const cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  const shots = new Map();
  for (const s of shotsList || []) { if (!shots.has(s.id)) shots.set(s.id, []); shots.get(s.id).push(s); }
  const merged = readJson(path.join(draftsDir(P), '_merged.json'), {});
  const parts = readJson(path.join(packDir(P), 'index.json'))?.parts || [];
  // 032 B6：每個 custom 段的動畫分鏡從正本產生（模板段＝slots，手寫段＝work/designs/<段>.md）
  const sbText = readOpt(sbFile(P));
  const beats = new Map((plan.scenes || []).filter((s) => s?.type === 'custom' && s.id).map((s) => [s.id, beatBlock(P, s, { lib, sbText })]));
  return {
    project: path.basename(P.project), plan, merged, parts, cues, shots, moodTimes: j.moods || [],
    items: new Map((j.items || []).map((x) => [x.id, x])), voiceOnly: j.voiceOnly || [],
    scenes: lib.scenes, specs: new Map(listFillSpecs(lib.customDir).map((f) => [f.template, f])), designs: loadDesigns(P, plan), beats,
  };
}

// 剪輯台那一頁（storyboard、final…）的網址：沒開就在背景開，網址直接拿（lib/editor-urls.mjs），不從 editor.mjs 印的字比對；開不起來回 null
function startEditor(P, page) {
  return editorUrlsSync(P.project)?.[page] || null;
}

// A8：有講者的專案，② 構圖沒通過、plan.json 沒有 speakerBox 就不產生分鏡表（--check 只 ⚠ 沒寫 speakerBox，
// 到 ③ 的截圖才發現字卡全壓到臉、講者右移算錯，要整份重截）。回傳要印的行；過了回 null
export function framingGate(P, plan) {
  if (!mainKinds(P).hasCamera) return null;
  const st = lastStopOf(P.project, STOP.framing)?.state;
  const passed = ['通過', '略過'].includes(st), boxed = Array.isArray(plan?.speakerBox) && plan.speakerBox.length === 4;
  if (passed && boxed) return null;
  const pj = rel(P.project), out = [];
  if (!passed) out.push(fail(`停點 ② 構圖還沒通過（work/製作進度.md 的 ② ${st ? `最後是「${st}」` : '沒有紀錄'}），分鏡表的截圖要用定好的框`, st ? '使用者回覆構圖之後跑下一步那一條（記 ② 通過、量講者框）' : '先開構圖台給使用者看（下一步那一條）'));
  if (!boxed) out.push(fail('plan.json 沒有 speakerBox（講者框），字卡會不會壓到講者、講者右移都量不出來', '跑下一步那一條（量講者框）'));
  // ② 一條做完的指令（lib/framing-flow.mjs）：還沒給使用者看過構圖台 → --framing（會停在 ②）；看過了 → --framing-done（記 ② 通過、量講者框、切章）
  if (!st) out.push(...next('開構圖台、停在停點 ②；使用者回覆後照它印的下一步做', cmdLine('build.mjs', ['--project', pj, '--framing'])));
  else out.push(...next('記 ② 通過、量講者框（分鏡素材已經切好、框沒變就不會重切章），再產生分鏡表',
    cmdLine('build.mjs', ['--project', pj, '--framing-done', ...(passed ? [] : ['--said', '<使用者原話>'])]), cmdLine('build.mjs', ['--project', pj, '--storyboard'])));
  return out;
}

export const storyboardCmd = (P, flags, deps) => endTry(P, 'storyboard', storyboardRun(P, flags, deps));
function storyboardRun(P, flags, { loadLib }, { fixed = null } = {}) {
  const lib = loadLib(P.templateDir, P.project);
  const plan = readJson(P.plan);
  if (!plan?.scenes) { console.log('✖ plan.json 還沒有 scenes → 先照 work/分鏡素材/ 寫草稿、跑 --merge-drafts'); return 1; }
  const only = flags.only ? String(flags.only).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : null;
  // B2：③ 已經通過之後只重截幾段（回饋輪、改版）：不再記 ③ 待回覆、不印停點，使用者不用再確認一次
  const passed = !!only && lastStopOf(P.project, STOP.storyboard)?.state === '通過';
  const file = sbFile(P);
  if (!only && storyboardDirty(P) && !flags.force) {
    console.log('✖ work/storyboard.md 在上次產生之後有人改過（網頁或手動）→ 停點 ③ 還在等使用者回覆：重貼停點 ③ 那一行，等他說「可以」「改好了」再跑 --apply-storyboard（它會把改動套回 plan.json、記 ③ 通過）；使用者確定不要網頁上的改動才加 --force 重產生');
    return 1;
  }
  const gate = passed ? null : framingGate(P, plan);
  if (gate) { for (const l of gate) console.log(l); return 1; }
  const b = buildTool(['--project', P.project, ...(P.templateArg || [])]);
  if (b.status !== 0) { for (const l of failOrTail(b)) console.log(l); console.log('✖ build 沒過 → 照 ✖ 改 plan.json'); return 1; }
  const q = tool('qc.mjs', ['storyboard', '--project', P.project, '--json', '--sheet', ...(only ? ['--only', only.join(',')] : []), ...(P.templateArg || [])]);
  let shots;
  try { shots = JSON.parse(q.stdout); } catch { console.log(`✖ 截圖沒有跑完：${(q.stderr || q.stdout).trim().split('\n').slice(-3).join(' ')}`); return 1; }
  const j = checkJson(P);
  const ctx = genContext(P, plan, j, shots.shots, lib);
  let md;
  if (only && fs.existsSync(file)) {
    md = fs.readFileSync(file, 'utf8');
    for (const id of only) {
      const seg = plan.scenes.find((s) => s.id === id);
      if (!seg) { console.log(`⚠ plan.json 沒有 ${id}，跳過`); continue; }
      const ls = md.split('\n');
      const re = new RegExp(`^###\\s+${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s｜|（(：:])`);
      const i = ls.findIndex((l) => re.test(l));
      const body = renderSection(seg, ctx).trimEnd().split('\n');
      if (i < 0) { console.log(`⚠ 分鏡表沒有 ${id} 這一節：整份重新產生`); md = renderStoryboard(ctx); break; }
      let k = i + 1;
      while (k < ls.length && !/^#{1,3}\s/.test(ls[k])) k++;
      while (k > i + 1 && !ls[k - 1].trim()) k--;
      ls.splice(i, k - i, ...body);
      md = ls.join('\n');
    }
  } else md = renderStoryboard(ctx);
  fs.writeFileSync(file, md);
  recordStoryboard(P, md);
  if (!passed) markStep(P.project, 'storyboard');   // ③ 通過後只重截幾段的不記：那幾節是照 plan.json 重產的，不算「還沒套回」
  const url = passed ? null : startEditor(P, 'storyboard') || 'work/storyboard.md';
  if (!passed) appendStop(P.project, { stop: STOP.storyboard, state: '待回覆' });
  const warn = groupWarnings((j.warnings || []).filter((w) => !/還是範例原文|內容設計動畫還沒做/.test(w)));
  for (const e of j.errors || []) console.log(`✖ ${e}`);
  for (const w of warn.slice(0, 20)) console.log(`⚠ ${w}`);
  if (warn.length > 20) console.log(`（還有 ${warn.length - 20} 個 ⚠：build.mjs --check 看全部）`);
  const designs = plan.scenes.filter((s) => s.design).length;
  console.log(`分鏡表：${rel(file)}（${plan.scenes.length} 段，模板 ${plan.scenes.filter((s) => s.template).length}、內容設計動畫 ${designs}；截圖 ${shots.shots?.length ?? 0} 張${shots.sheets?.length ? `，拼圖 ${shots.sheets.length} 頁` : ''}）`);
  if (passed) { console.log(`③ 已經通過：只重截 ${only.join('、')}（分鏡表那${only.length > 1 ? '幾' : '一'}節換新），不用再停點 ③ 給使用者確認`); return 0; }
  const ideas = [...ctx.designs.entries()].map(([id, d]) => `${id}：${String(d.concept || '').slice(0, 40)}`).filter((x) => !x.endsWith('：'));
  if (ideas.length) console.log(`內容設計動畫概念（回報給使用者）：\n  ${ideas.slice(0, 40).join('\n  ')}`);
  const dp = designPlan(plan.scenes, { items: ctx.items, partOf: chapterOfFn(ctx.parts) });
  if (dp.cands.length) console.log(`內容設計動畫候選 ${dp.cands.length} 段，${designPlanLine(dp)}（回報給使用者這一句；想一開始就專門設計的段，在分鏡表「需要我決定的事」勾起來）：\n  ${dp.cands.slice(0, 40).map((c) => `${dp.on.has(c.id) ? '☑' : '☐'} ${c.id}：${String(plan.scenes.find((s) => s.id === c.id).story.designIdea).slice(0, 40)}`).join('\n  ')}`);
  // A3：回報段（auto-edit-storyboard「回報格式」到停點 ③ 的樣板，數字工具填好）；停點那兩行只在這裡出現一次
  const media = plan.scenes.filter((s) => s.type === 'media').length, tpl = plan.scenes.length - media - designs;
  const moods = Array.isArray(plan.moods) ? plan.moods.length : 0, quotes = (ctx.merged?.quotes || []).length;
  const unc = (j.uncovered || []).map((u) => (Array.isArray(u) ? u : [u.from ?? u.start, u.to ?? u.end])).filter(([a, z]) => z > a);
  const uncLine = unc.length ? `${unc.slice(0, 4).map(([a, z]) => `${clock(a)}–${clock(z)}`).join('、')}${unc.length > 4 ? `…共 ${unc.length} 段` : ''}` : '無';
  const asks = tidyDecide(ctx.merged?.decide || [], { cues: ctx.cues }).ask.filter((x) => !/結尾.*配樂/.test(x)).slice(0, 2);
  const outro = plan.outro ? `結尾配樂：${plan.outro.music || '（沒寫曲名）'}${plan.outro.from ? `，從 ${plan.outro.from} 起` : ''}，要換嗎` : '結尾要不要配樂：要的話從哪一句起';
  const lines = [
    `分鏡表好了：${plan.scenes.length} 段（模板 ${tpl}、media ${media}${designs ? `、內容設計動畫 ${designs}` : ''}），內容設計動畫候選 ${dp.cands.length} 段，金句候選 ${quotes} 則，情緒點 ${moods} 個`,
    `內容設計動畫：${designPlanLine(dp)}；候選 ${dp.cands.length} 段，看分鏡表`,
    `驗證：build --check → ✖ ${(j.errors || []).length}、⚠ ${warn.length}${fixed != null ? `（自動修好 ${fixed} 處）` : ''}；沒有畫面的區間：${uncLine}`,
    `要你決定：${[...asks, outro].map((x, i) => `${i + 1}. ${x}`).join('；')}`,
  ];
  for (const l of reportBlock(lines, { stop: stopLines.storyboard(url) })) console.log(l);
  return 0;
}

// ---------- --apply-storyboard ----------

export const applyCmd = (P, flags, deps) => endTry(P, 'apply-storyboard', applyRun(P, flags, deps));
function applyRun(P, flags, { loadLib }) {
  const lib = loadLib(P.templateDir, P.project);
  const plan = readJson(P.plan);
  const file = sbFile(P);
  if (!plan?.scenes || !fs.existsSync(file)) { console.log('✖ 還沒有 work/storyboard.md 或 plan.json 的 scenes → 先跑 --storyboard'); return 1; }
  const sbMd = fs.readFileSync(file, 'utf8');
  const r = applyStoryboard(sbMd, plan, { scenes: lib.scenes, specs: new Map(listFillSpecs(lib.customDir).map((f) => [f.template, f])) });
  // 032 B6：表上改的動畫分鏡寫回正本（手寫段寫回 work/designs/<段>.md；模板段不收，印 ⚠）。這次才勾成內容設計動畫的段，表上那張是模板的拍，不收
  const beat = applyBeatEdits(P, sbMd, plan, r.plan, { lib, skip: r.designs || [] });
  if (r.changed) {
    fs.copyFileSync(P.plan, `${P.plan}.bak-storyboard`);
    writeAtomic(P.plan, `${JSON.stringify(r.plan, null, 2)}\n`);
  }
  for (const c of [...r.changes, ...beat.changes]) console.log(`改：${c}`);
  if (!r.changes.length && !beat.changes.length) console.log('分鏡表沒有改到文字、音效或金句');
  for (const w of beat.warnings) console.log(w);
  // 定稿（沒有要求要改的段）：工具知道答案的 ⚠ 自動修掉；使用者在分鏡表改過音效的段，音效不動
  let fixed = false;
  if (!r.requests.length) {
    const keep = [...new Set(r.changes.filter((c) => /^\S+ 音效：/.test(c)).map((c) => c.split(' ')[0]))];
    fixed = autofixStep(P, keep.length ? ['--keep-sfx', keep.join(',')] : []);
  }
  // 接下來設計師要跑 audit（子代理不跑 build）：這裡先 build，他們才量得到最新的 index.html
  if ((r.changed || fixed) && !r.requests.length) buildTool(['--project', P.project, ...(P.templateArg || [])]);
  for (const u of r.unmatched) console.log(`⚠ ${u}`);
  for (const a of r.answers || []) console.log(`作者回答${a.q ? `（${a.q}）` : ''}：${a.text} → 照做（章名、講者、配樂寫進 plan.json 或 brand.mjs speaker）`);
  if (!r.requests.length) {
    const fresh = (r.plan.scenes || []).filter((s) => s.design && !fs.existsSync(path.join(designsDir(P), `${s.id}.md`))).map((s) => s.id);
    resetRuns(P, fresh);
  }
  // 032 B6：動畫分鏡整份從正本重產（剛勾成內容設計動畫的段換成「拍點正本」那一行，等設計師寫；模板段被手改的表換回 slots 產生的）。
  // 改動剛套回，分鏡表本來就是 dirty，所以 force；最後一律記下來（recordWritten：記的時間不早於檔的修改時間）
  refreshStoryboard(P, readJson(P.plan) || r.plan, { lib, force: true, write: (t) => writeAtomic(file, t) });
  recordWritten(P, fs.readFileSync(file, 'utf8'));
  const pj = rel(P.project);
  if (r.requests.length) {
    for (const q of r.requests) console.log(`要求：${q.id} ${q.label}：${q.text}`);
    const ids = [...new Set(r.requests.map((q) => q.id))];
    for (const l of next('照要求改那幾段（換情境就改 plan.json 那段的 template／scene／slots；內容設計動畫改 work/designs/<段>.md），跑下面那一條重截那幾段，然後重貼停點 ③ 等使用者回覆（這次的「可以」不算，還不要派設計師）；使用者再說「可以」才重跑 --apply-storyboard，派工訊息到那時候才會印',
      cmdLine('build.mjs', ['--project', pj, '--storyboard', '--only', ids.join(',')]))) console.log(l);
    return 0;
  }
  appendStop(P.project, { stop: STOP.storyboard, state: '通過', said: saidOf(flags) || '', back: 'plan.json' });
  markStep(P.project, 'apply-storyboard');
  const cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  const planNow = fixed ? readJson(P.plan) || r.plan : r.plan;
  const designs = writeBriefs(P, planNow, cues);
  const todo = designs.filter((d) => isBlankDesign(readOpt(path.join(P.out, designFileOf(planNow.scenes.find((x) => x.id === d.id))))));
  const review = cmdLine('build.mjs', ['--project', pj, '--review']);
  if (todo.length) {
    for (const l of dispatchLines(P, todo.map((d) => d.id))) console.log(l);
    console.log('全部回來後定稿：');
    console.log(review);
  } else for (const l of next('定稿，停在停點 ④', review)) console.log(l);
  return 0;
}

// ---------- --design-status：內容設計動畫做到哪（主代理等設計師時看；沒進度超過 20 分鐘就重派） ----------

// [x, y] 扣掉 spans 裡每一段，剩下的區間（依序）
export const subtractSpans = ([x, y], spans = []) => spans.reduce((acc, [p, q]) => acc.flatMap(([u, w]) => (q <= u || p >= w ? [[u, w]] : [[u, Math.min(w, p)], [Math.max(u, q), w]].filter(([m, n]) => n - m > 1e-6))), y > x ? [[x, y]] : []);
// --design-canvas <段[,段]>：內容設計動畫的空白畫布不見了（被搬走、刪掉）就補一份；已經有內容的不動。
// 加 --reset（主代理要整段從頭重做時）：舊的動畫檔和鏡位腳本備份到 work/designs/.old/，畫布換回空白
// （026：重派時主代理自己把檔搬走，設計師找不到畫布，各花 5–15 次呼叫翻原始碼）
export function designCanvasCmd(P, ids, { reset = false } = {}) {
  const plan = readJson(P.plan);
  const customDir = path.join(P.templateDir, 'custom');
  let bad = 0;
  const reset0 = [];
  for (const id of String(ids).split(/[,，]/).map((x) => x.trim()).filter(Boolean)) {
    const seg = (plan?.scenes || []).find((x) => x?.id === id && x.design);
    if (!seg) { console.log(`✖ ${id} 不是內容設計動畫段（plan.json 裡沒有這個 id，或沒有 "design": true）`); bad++; continue; }
    const abs = path.join(P.out, designFileOf(seg)), cur = fs.existsSync(abs) ? readOpt(abs) : null;
    const script = path.join(designsDir(P), `${id}.md`);
    if (cur != null && !isBlankDesign(cur) && !reset) { console.log(`${id}：動畫檔已經有內容，沒有動 → 用 edit 接著改`); continue; }
    if (cur != null && isBlankDesign(cur) && !(reset && fs.existsSync(script))) { console.log(`${id}：已經是空白畫布（${rel(abs)}）`); continue; }
    if (reset) {
      const old = path.join(designsDir(P), '.old'), stamp = backupStamp();
      fs.mkdirSync(old, { recursive: true });
      if (cur != null && !isBlankDesign(cur)) fs.copyFileSync(abs, path.join(old, `${id}-${stamp}.html`));
      if (fs.existsSync(script)) fs.renameSync(script, path.join(old, `${id}-${stamp}.md`));
      resetRuns(P, [id]);
      reset0.push(id);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, blankFor(customDir, seg));
    console.log(`✓ ${id}：空白畫布 ${rel(abs)}${reset ? `（舊的備份在 ${rel(path.join(designsDir(P), '.old'))}/）` : ''}`);
  }
  // 整段從頭重做＝接著重派：從這一刻起算有沒有進度（舊動畫檔的時間不算）
  recordDispatch(P, reset0, { redo: true });
  return bad ? 1 : 0;
}

export const DESIGN_STALL_MIN = 20;   // 建議初值：一段約 12 分鐘（shared/style.md），20 分鐘還是空白畫布多半是卡住或被中斷
// 舊版的重派時間（032 之前 --design-status 寫的）：專案還留著就照樣讀；新的都記在 work/.jobs/dispatch.json
const redispatchFile = (P) => path.join(P.out, '.cache', 'design-redispatch.json');
export function designStatus(P, now = Date.now()) {
  const plan = readJson(P.plan);
  const sent = readJson(redispatchFile(P), null) || {}, disp = readDispatch(P);
  const mt = (f) => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : null);
  const ago = (t) => (t == null ? null : Math.max(0, Math.round((now - t) / 60000)));
  return (plan?.scenes || []).filter((s) => s?.design).map((s) => {
    const html = path.join(P.out, designFileOf(s)), script = path.join(designsDir(P), `${s.id}.md`);
    const brief = path.join(P.project, 'work', 'briefs', `${s.id}.md`), sheet = path.join(P.project, 'work', 'audit-shots', `sheet-${s.id}.jpg`);
    const blank = isBlankDesign(readOpt(html)), hasScript = fs.existsSync(script);
    // B5：最後活動＝這次派工、之後的驗收心跳（audit --only 每跑一次碰一下）、動畫檔或鏡位腳本的修改時間，取最新；
    // 派工之前的舊時間被派工時間蓋過，不會一重派就被判卡住
    const d = disp[s.id], re = Number(d?.at) || Number(sent[s.id]) || 0, again = d ? d.n >= 2 : !!sent[s.id];
    const sentAt = Math.max(mt(brief) ?? 0, re) || null, beat = lastBeat(P.project, s.id);
    const last = Math.max(blank ? Math.max(sentAt ?? 0, mt(script) ?? 0) : mt(html) ?? 0, re, beat) || null;
    const audited = !blank && mt(sheet) != null && mt(sheet) >= mt(html);
    const state = !blank ? `動畫做了（最後改動 ${ago(mt(html))} 分鐘前）${audited ? '，audit 0 個 ✖ 的拼圖是最新的' : ''}`
      : hasScript ? `腳本寫好、動畫還沒動手（腳本 ${ago(mt(script))} 分鐘前）` : `還沒動手（${again ? '重派' : '派出'} ${ago(sentAt) ?? '?'} 分鐘）`;
    // 卡住：空白畫布從派出（或腳本寫好）起 20 分鐘沒動；或動畫做了一半，最後改動 20 分鐘前、之後沒有 audit 過（拼圖比檔舊）
    const stalled = last != null && ago(last) >= DESIGN_STALL_MIN && (blank || !audited);
    const since = d ? `第 ${d.n} 次派工 ${ago(re)} 分鐘、最後活動 ${ago(last)} 分鐘前` : '';
    return { id: s.id, blank, script: hasScript, audited, idle: ago(last), state, stalled, since };
  });
}
export function designStatusCmd(P) {
  const list = designStatus(P);
  if (!list.length) { console.log('沒有內容設計動畫段（plan.json 沒有 "design": true）'); return 0; }
  console.log(`內容設計動畫 ${list.length} 段：`);
  for (const d of list) console.log(`  ${d.id}：${d.state}${d.since ? `｜${d.since}` : ''}${d.stalled ? `　⚠ 超過 ${DESIGN_STALL_MIN} 分鐘沒進度` : ''}`);
  const stalled = list.filter((d) => d.stalled);
  if (stalled.length) {
    resetRuns(P, stalled.map((d) => d.id));   // 新派的設計師從第 1 次 audit 算起
    recordDispatch(P, stalled.map((d) => d.id), { redo: true });   // 之後從重派起算（不然新設計師還沒寫檔，下一次查又被判卡住）
    const started = stalled.filter((d) => !d.blank), noScript = stalled.filter((d) => d.blank && !d.script), withScript = stalled.filter((d) => d.blank && d.script);
    const tag = (g) => (stalled.length > g.length ? `（${g.map((d) => d.id).join('、')}）` : '');
    const msgs = [];
    if (started.length) msgs.push(`${tag(started)}你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。動畫檔已經有內容：照 .agents/skills/auto-edit-motion/references/design.md 第 2 節用 edit 接著改，不要整份重寫；跑 audit，0 個 ✖ 就交。`);
    if (withScript.length) msgs.push(`${tag(withScript)}你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。鏡位腳本已經寫好：照 .agents/skills/auto-edit-motion/references/design.md 做動畫（第 2 節）。`);
    if (noScript.length) msgs.push(`${tag(noScript)}你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。照 .agents/skills/auto-edit-motion/references/design.md 寫鏡位腳本、接著做動畫（不用等確認）。`);
    for (const l of dispatch(`停掉原本負責 ${stalled.map((d) => d.id).join('、')} 的設計師，重派（同一則回覆一次派出，派工訊息只送下面這一行，換掉 <段>，不要另外加要求）：`, ...msgs)) console.log(l);
  } else if (list.every((d) => d.audited)) { for (const l of next('全部做好了，定稿：', cmdLine('build.mjs', ['--project', rel(P.project), '--review']))) console.log(l); }
  else for (const l of next('還在做，等設計師回覆（不要用 sleep 迴圈等）')) console.log(l);
  return 0;
}

// ---------- --review：build＋audit＋完成態拼圖，停在 ④ ----------

const runAsync = (name, args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(TOOLS, name), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { err += d; });
  c.on('close', (code) => resolve({ code, out, err }));
});

// --review 重用：內容的雜湊沒變的段，沿用上次的量測和截圖（長片整支重量、重截要一分多鐘，回饋輪通常只改幾段）
const reviewCache = (P) => path.join(P.project, 'work', '.cache', 'review-state.json');
function treeSig(dir, rel = '') {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(path.join(dir, rel)).sort(); } catch { return out; }
  for (const n of names) {
    if (n.startsWith('.')) continue;
    const r = rel ? `${rel}/${n}` : n;
    let st;
    try { st = fs.statSync(path.join(dir, r)); } catch { continue; }
    if (st.isDirectory()) out.push(...treeSig(dir, r)); else out.push(`${r}:${st.size}:${Math.floor(st.mtimeMs)}`);
  }
  return out;
}
// 現在每段的雜湊；讀不懂、--check 有 ✖ 回 null（整支重做）。模板和工具（shared/template 整包）、plan 除了 scenes 以外的欄、看不看全部拼圖都算進共用的雜湊
// （export 給測試：032 B6 驗「只改 storyboard.md 的動畫分鏡不重量」）
export function reviewNow(P, flags = {}) {
  try {
    const j = JSON.parse(tool('build.mjs', ['--project', P.project, '--check', '--json', ...(P.templateArg || [])]).stdout);
    if (!j.ok) return null;
    const plan = readJson(P.plan) || {}, { scenes = [], ...rest } = plan;
    // 032 B6：拍點只看正本。模板段的拍在段落 JSON 裡（slots）；手寫段（內容設計動畫、手改模板段）的拍在 work/designs/<段>.md，全文算進去。
    // storyboard.md 是副本，不算（只改它的動畫分鏡不用重量）
    const sheets = {};
    for (const s of scenes) if (s?.id) { const d = readOpt(path.join(designsDir(P), `${s.id}.md`)); if (d) sheets[s.id] = d; }
    const state = captureState(P, { hf: hfLocal()?.version ?? '?' });
    const h = reviewHashes(state, j.items || [], { scenes, sheets, readComp: (f) => readOpt(path.join(P.out, f)), extra: { tpl: P.templateDir ? treeSig(P.templateDir) : [], plan: rest, format: j.format, sample: !flags['all-sheets'] } });
    return h && { ...h, customs: (j.items || []).filter((x) => x.type === 'custom').map((x) => x.id) };
  } catch { return null; }
}
// 和上次比：要重做哪幾段；不能重用（第一次、共用的變了、段被拿掉、變太多、上次的截圖不在了）回 null
function reviewDelta(P, cur) {
  const last = readJson(reviewCache(P));
  if (!cur || last?.v !== 1 || last.global !== cur.global || Object.keys(last.segs || {}).some((id) => !(id in cur.segs))) return null;
  const ids = Object.keys(cur.segs), changed = ids.filter((id) => last.segs[id] !== cur.segs[id]);
  if (changed.length > ids.length / 2) return null;
  const dir = path.join(P.project, 'work', 'storyboard-preview'), shots = readJson(path.join(dir, 'shots.json'));
  if (!shots?.sheets?.length || !shots.shots?.every((s) => fs.existsSync(path.join(dir, s.file))) || !shots.sheets.every((s) => fs.existsSync(path.join(dir, s.file)))) return null;
  return { changed, last, shots };
}
// 開工前先把這輪要重做的段從紀錄拿掉：中途失敗、有 ✖ 都不算數，下次照樣重做（截圖可能已經換掉，舊雜湊對不上實際的圖）
function writeReviewCache(P, state) {
  fs.mkdirSync(path.dirname(reviewCache(P)), { recursive: true });
  writeAtomic(reviewCache(P), `${JSON.stringify(state)}\n`);
}
function dropReviewCache(P, delta) {
  try {
    if (!delta) { fs.rmSync(reviewCache(P), { force: true }); return; }
    const segs = { ...delta.last.segs };
    for (const id of delta.changed) delete segs[id];
    writeReviewCache(P, { ...delta.last, segs });
  } catch { /* 記不下來：下次比不到就整支重做 */ }
}

// 素材帳本：assets/screen/、assets/images/ 用了幾支、哪些沒用到
export function assetUsageLine(project, scenes) {
  const u = assetUsage(project, scenes);
  if (!u.screen.total && !u.images.total) return '';
  const names = [...u.screen.unused, ...u.images.unused];
  const head = [u.screen.total ? `錄影用了 ${u.screen.used}／${u.screen.total} 支` : '', u.images.total ? `圖片用了 ${u.images.used}／${u.images.total} 張` : ''].filter(Boolean).join('、');
  return `素材：${head}${names.length ? `；沒用到：${names.slice(0, 8).join('、')}${names.length > 8 ? `…還有 ${names.length - 8} 個` : ''}` : ''}`;
}

export const reviewCmd = async (P, flags, deps = {}) => endTry(P, 'review', await reviewRun(P, flags, deps));
async function reviewRun(P, flags, { loadLib } = {}) {
  const P2 = `--project ${rel(P.project)}`;
  const review = cmdLine('build.mjs', ['--project', rel(P.project), '--review']);
  if (storyboardDirty(P)) {
    console.log('✖ work/storyboard.md 有改動還沒套回 plan.json（網頁或手動改的），現在定稿會漏掉那些改動');
    for (const l of next('把改動套回 plan.json；確定不要那些改動才用 --storyboard --force 重新產生分鏡表', cmdLine('build.mjs', ['--project', rel(P.project), '--apply-storyboard']))) console.log(l);
    return 1;
  }
  const b = buildTool(['--project', P.project, ...(P.templateArg || [])]);
  const bl = (b.stdout || '').split('\n');
  // build 的六行摘要怎麼認只有 lib/build-summary.mjs 一份（build 改字頭時那裡跟著改）
  const six = bl.filter(isSummaryLine);
  for (const l of six) console.log(l);
  const usage = assetUsageLine(P.project, readJson(P.plan)?.scenes);
  if (usage) console.log(usage);
  if (b.status !== 0) { for (const l of failOrTail(b)) console.log(l); console.log('✖ build 沒過 → 照 ✖ 改 plan.json，再跑一次'); return 1; }
  const blanks = (readJson(P.plan)?.scenes || []).filter((x) => x?.design && isBlankDesign(readOpt(path.join(P.out, designFileOf(x))))).map((x) => x.id);
  if (blanks.length) {
    console.log(`✖ 內容設計動畫還沒做：${blanks.join('、')} → 一段派一個設計師，派工訊息只送 ${cmdLine('status.mjs', ['--project', rel(P.project)])} 印的那一行，全部回來再跑一次`);
    console.log(review);
    return 1;
  }
  // 032 B6：分鏡表的動畫分鏡從正本重產（③ 之後改過 slots、work/designs/ 的段跟上；網頁改到一半的上面已經擋掉）。拍有變的段印出來、放進回報段
  const beatsLine = refreshStoryboard(P, readJson(P.plan), { lib: loadLib ? loadLib(P.templateDir, P.project) : undefined }).line;
  if (beatsLine) console.log(beatsLine);
  // 內容沒變的段沿用上次的量測和截圖；第一次、kit／模板／plan 共用的欄變了就整支重做（--no-reuse 也是）
  const cur = flags['no-reuse'] ? null : reviewNow(P, flags);
  const delta = reviewDelta(P, cur);
  dropReviewCache(P, delta);
  const redo = delta ? delta.changed.filter((id) => cur.customs.includes(id)) : null;
  const qcArgs = ['storyboard', '--project', P.project, '--json', '--sheet', ...(flags['all-sheets'] ? [] : ['--sample']), ...(P.templateArg || [])];
  const auArgs = ['--project', P.project, '--json', ...(P.templateArg || [])];
  const [au0, qc0] = await Promise.all([
    redo && !redo.length ? null : runAsync('audit.mjs', [...auArgs, ...(redo ? ['--review', '--only', redo.join(',')] : [])]),
    delta && !delta.changed.length ? null : runAsync('qc.mjs', [...qcArgs, ...(delta ? ['--only', delta.changed.join(',')] : [])]),
  ]);
  if (delta) console.log(`沿用上次的量測和截圖：這次重做 ${delta.changed.length} 段（${delta.changed.slice(0, 8).join('、')}${delta.changed.length > 8 ? '…' : ''}），其他 ${Object.keys(cur.segs).length - delta.changed.length} 段內容沒變`);
  let au = au0, report = null;
  const readReport = () => { report = null; if (au) { try { report = JSON.parse(au.out); } catch { /* 下面當成沒有跑完 */ } } };
  readReport();
  // 只量幾段時別段不擋；這裡別段有 ✖ 就不對勁（它們上次是過的）：整支再量一次，和沒有重用時一樣擋
  const wholeAudit = redo?.length && report?.others?.errors;
  if (wholeAudit) { au = await runAsync('audit.mjs', auArgs); readReport(); }
  const fresh = {};
  for (const f of report?.findings || []) (fresh[f.id] ||= []).push(formatFinding(f));
  const kept = delta && !wholeAudit ? Object.entries(delta.last.findings || {}).filter(([id]) => !redo.includes(id)) : [];
  const keptWarn = delta && !wholeAudit ? (delta.last.warnings || []).filter((w) => !redo.some((id) => w.includes(id))) : [];   // 講到重量那段的不留
  const auWarn = [...new Set([...keptWarn, ...(report?.warnings || [])])];
  const al = [
    ...(au && !report ? [`✖ audit 沒有跑完：${(au.err || au.out || '').trim().split('\n').slice(-1)[0] || `結束代碼 ${au.code}`}`] : []),
    ...(report?.errors || []).map((e) => `✖ ${e}`), ...auWarn.map((w) => `⚠ ${w}`),
    ...kept.flatMap(([, lines]) => lines), ...Object.values(fresh).flat(),
  ];
  const aE = al.filter((l) => /^\s*✖/.test(l)), aW = al.filter((l) => /^\s*⚠/.test(l));
  for (const l of aE) console.log(l.trim());
  const aWg = groupWarnings(aW.map((l) => l.trim().replace(/^⚠\s*/, '')));
  for (const l of aWg.slice(0, 20)) console.log(`⚠ ${l}`);
  if (aWg.length > 20) console.log(`（還有 ${aWg.length - 20} 類 ⚠：audit.mjs ${P2} 看全部）`);
  let shots = null;
  if (delta && !delta.changed.length) shots = delta.shots;
  else {
    let qc = qc0;
    try { shots = JSON.parse(qc.out); } catch { /* 下面重試或報 */ }
    if (delta && !shots?.sheets?.length) {   // 只重截幾段沒成功：整支再來一次
      qc = await runAsync('qc.mjs', qcArgs);
      shots = null;
      try { shots = JSON.parse(qc.out); } catch { /* 下面報 */ }
    }
    if (!shots) console.log(`⚠ 完成態拼圖沒有跑完：${(qc.err || qc.out).trim().split('\n').slice(-1)[0] || ''}`);
  }
  console.log(`audit：✖ ${aE.length}、⚠ ${aWg.length}`);
  if (shots?.sheets?.length) {
    const dir = rel(path.join(P.project, 'work', 'storyboard-preview'));
    console.log(`完成態拼圖 ${shots.sheets.length} 頁（${flags['all-sheets'] ? '全部' : '每種模板 1 格＋全部內容設計動畫；同一種模板版面固定，要全部看加 --all-sheets'}；同一則回覆一次打開，照 REVIEW.md 只找 FAIL）：`);
    for (const s of shots.sheets) console.log(`  ${dir}/${s.file || s}`);
  }
  if (aE.length) { for (const l of next('照 ✖ 的 → 改（情境動畫段的 ✖ 原文交回做那段的子代理），改完再跑一次', review)) console.log(l); return 1; }
  // 都過了才記
  if (cur && shots?.sheets?.length) { try { writeReviewCache(P, { v: 1, global: cur.global, segs: cur.segs, warnings: auWarn, findings: { ...Object.fromEntries(kept), ...fresh } }); } catch { /* 記不下來只是下次整支重做 */ } }
  const url = startEditor(P, 'final') || `（editor.mjs 沒有開起來：跑 ${cmdLine('editor.mjs', ['--project', rel(P.project)])}）`;
  appendStop(P.project, { stop: STOP.final, state: '待回覆' });
  // 使用者看預覽的時候先把整支 render 起來（低優先權），說「輸出」就不用再等一個片長
  // 預覽只是把 HTML 疊在影片上，不用 render；使用者說「輸出」才 render（要先在背景算才加 --prerender）
  if (fs.existsSync(path.join(TOOLS, 'deliver.mjs')) && flags.prerender) tool('deliver.mjs', ['--project', P.project, '--prerender', ...(P.templateArg || [])], { timeout: 15000 });
  // 026：分鏡表上沒勾的內容設計動畫候選（現在用模板）。看完預覽不滿意才專門設計，所以在這裡提醒一次有哪幾段可以做
  const later = (readJson(P.plan)?.scenes || []).filter(isDesignPick);
  const laterLine = later.length ? `${later.slice(0, 8).map((x) => `${x.id}（${String(x.story.designIdea).slice(0, 24)}${String(x.story.designIdea).length > 24 ? '…' : ''}）`).join('、')}${later.length > 8 ? `…共 ${later.length} 段` : ''} → 想要哪一段更好，說「<段> 重新設計」` : '';
  if (later.length) console.log(`還可以專門設計的段（現在是模板，回報給使用者這一句）：${laterLine}`);
  // A3：回報段（auto-edit-review「回報格式」的樣板，數字工具填好；拼圖要看過才知道有沒有 FAIL，留一行給 AI 補）
  const nSegs = (readJson(P.plan)?.scenes || []).length;
  const sheetDir = rel(path.join(P.project, 'work', 'storyboard-preview'));
  const sheetFiles = (shots?.sheets || []).map((s) => `${sheetDir}/${s.file || s}`);
  const lines = [
    `預覽好了：${nSegs} 段；audit ✖ 0、⚠ ${aWg.length}${aWg.length ? '（⚠ 逐項補：改了／保留的理由）' : ''}`,
    six.length ? six.join('；') : '',
    sheetFiles.length ? `拼圖：${sheetFiles[0]}${sheetFiles.length > 1 ? ` 等 ${sheetFiles.length} 頁` : ''}（看完把 FAIL 的段與問題寫在這一行；沒有就寫「沒有 FAIL」）` : '拼圖：沒有跑完（看上面的 ⚠）',
    '請看字幕有沒有對到嘴；說「輸出」才 render。',
    later.length ? `還可以專門設計的段：${laterLine}` : '',
    beatsLine || '',
  ];
  for (const l of reportBlock(lines, { stop: stopLines.final(url) })) console.log(l);
  return 0;
}

export { jobState };

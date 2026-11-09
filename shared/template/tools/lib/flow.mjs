// 排分鏡的流程指令（build.mjs 的 --scaffold、--check-draft、--merge-drafts、--storyboard、--apply-storyboard、--review 都走這裡）。
// 把「模型一步一步下指令、手寫分鏡表」變成工具一次做完；模型只負責判斷與設計。零依賴。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSrt } from './srt.mjs';
import { textWidth, parseTime, cueSeconds } from './time.mjs';
import { ICON_ALIAS } from './icon-alias.mjs';
import { probeDuration } from './ff.mjs';
import { canvasOf, resolveFormat } from './canvas.mjs';
import { alignOutline, scriptOutline, splitParts, renderCommon, renderSnippets, renderPart, designTarget, designTargetOf, designEligible, designCap } from './scaffold.mjs';
import { listFillSpecs, designFileOf, illusNames, isBlankDesign } from './custom-fill.mjs';
import { renderStoryboard, renderSection, applyStoryboard, parseDesign, isDesignPick, designPlan, designPlanLine, chapterOfFn } from './storyboard-gen.mjs';
import { appendStop } from './progress.mjs';
import { jobState } from './job.mjs';
import { assetUsage } from './media.mjs';
import { floorRules } from './audit-rules.mjs';
import { readSpeaker } from './speaker.mjs';
import { sbHash as sha, storyboardDirty, recordStoryboard } from './storyboard-state.mjs';
import { readScript } from './script-file.mjs';
import { writeAtomic } from './atomic.mjs';
import { captureState, reviewHashes } from './incremental.mjs';
import { parseBeatSheets, parseIllusLists } from './audit-beats.mjs';
import { formatFinding } from './audit-rules.mjs';
import { hfLocal } from './hf.mjs';
import { KINDS as FIX_KINDS } from './autofix.mjs';
import { spokenAt } from './plan.mjs';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join('/') || '.';
const readOpt = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const tool = (name, args, opts = {}) => spawnSync(process.execPath, [path.join(TOOLS, name), ...args], { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
// 真的產生檔案的 build：底片要重新編碼時走背景工作，等太久結束碼 75（再跑一次會接著等，不會重跑）
const buildTool = (args) => { let r; do { r = tool('build.mjs', args); } while (r.status === 75); return r; };
// 產生的階段（合併草稿、分鏡表套回）寫完 plan.json 就跑 build.mjs --autofix：工具知道答案的 ⚠／✖ 先修掉（lib/autofix.mjs），
// 不用留給使用者在剪輯台看到；剪輯台的更新預覽不跑（使用者改的時間要算數）。跑不完不擋流程，印一行就好。回傳 plan.json 有沒有改
function autofixStep(P, extra = []) {
  const before = readOpt(P.plan);
  const r = tool('build.mjs', ['--project', P.project, '--autofix', ...extra, ...(P.templateArg || [])]);
  const out = (r.stdout || '').trim();
  if (out) console.log(out);
  if (r.status !== 0 && !out) console.log(`⚠ 自動修正沒有跑完（${(r.stderr || '').trim().split('\n').pop() || `結束碼 ${r.status}`}）→ 不影響這一步；之後可以再跑 build.mjs --project ${rel(P.project)} --autofix`);
  return readOpt(P.plan) !== before;
}
const clock = (t) => { const m = Math.floor(t / 60); return `${m}:${String(Math.floor(t - m * 60)).padStart(2, '0')}`; };
const cueOf = (s) => Number(String(s?.from || s?.at || '').match(/^#(\d+)/)?.[1] ?? 0);

const packDir = (P) => path.join(P.project, 'work', '分鏡素材');
const draftsDir = (P) => path.join(P.project, 'work', 'drafts');
const designsDir = (P) => path.join(P.project, 'work', 'designs');
const briefsDir = (P) => path.join(P.project, 'work', 'briefs');
const sbFile = (P) => path.join(P.project, 'work', 'storyboard.md');

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
  const lib = loadLib(P.templateDir);
  fs.mkdirSync(path.join(P.out, '.cache'), { recursive: true });
  const count = (d, re) => { try { return fs.readdirSync(path.join(P.project, 'assets', d)).filter((n) => re.test(n)).length; } catch { return 0; } };
  const scriptMd = fs.existsSync(path.join(P.project, '講稿.md')) ? readScript(path.join(P.project, '講稿.md')) : '';
  const outline = alignOutline(scriptOutline(scriptMd), cues);
  const videoDur = probeDuration(P.video);
  const parts = splitParts({ cues, outline, videoDur });
  const { hasCamera, kinds } = mainKinds(P);
  const input = {
    project: rel(P.project), format: { label: `${fmt.format === 'portrait' ? '直式' : '橫式'} ${canvasOf(fmt.format).W}×${canvasOf(fmt.format).H}`, portrait: fmt.format === 'portrait' },
    videoDur, cues, scriptMd, plan, outline, parts, hasCamera, kinds,
    scenes: lib.scenes.map((s) => ({ ...s, summary: slotSummary(s) })).filter((s) => hasCamera || ['chapter', 'fullscreen'].includes(s.family)),
    fillSpecs: listFillSpecs(lib.customDir).map((f) => ({ ...f, floors: floorRules(readOpt(path.join(lib.customDir, `${f.template}.html`))) })),
    illus: illusNames(path.join(P.templateDir, 'kit')), speaker: readSpeaker(P.templateDir), fx: lib.fx,
    situationsMd: readOpt(path.join(P.templateDir, 'SITUATIONS.md')), beatsMd: readOpt(path.join(P.templateDir, 'BEATS.md')), styleMd: readOpt(path.join(P.templateDir, '..', 'style.md')),
    voiceOnly: voiceOnlyOf(P, P.video), notes: readNotes(P),
    assets: { screen: count('screen', /\.(mp4|mov|m4v|webm|mkv)$/i), images: count('images', /\.(jpe?g|png|webp|heic)$/i) },
  };
  const dir = packDir(P);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^ch\d+\.md$/.test(f)) fs.unlinkSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, '共用.md'), renderCommon(input));
  fs.writeFileSync(path.join(dir, '寫法.md'), renderSnippets(input));
  for (const part of parts) fs.writeFileSync(path.join(dir, `${part.key}.md`), renderPart(part, input));
  const sections = outline.filter((x) => x.level === 3).map((x) => ({ at: `#${x.n}`, name: shortSection(x.title) }));
  fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify({ parts, sections, videoDur, hasCamera }, null, 2)}\n`);
  fs.mkdirSync(draftsDir(P), { recursive: true });
  startPrepare(P, flags);
  const target = designTarget(videoDur);
  console.log(`→ ${rel(dir)}/：共用.md、寫法.md＋${parts.length} 份（${parts.map((p) => `${p.key} ${clock(p.seconds)}`).join('、')}）；${cues.length} 句字幕`);
  console.log(`內容設計動畫候選：約三成的段（全片估計 ${target} 段左右；先照常套模板，停點 ③ 使用者勾了才做）；底片在背景預先處理`);
  if (videoDur >= 300 && !fs.existsSync(path.join(dir, '視覺語言.md'))) {
    console.log(`→ 先派一個導演寫 ${rel(dir)}/視覺語言.md（全片共用的視覺主題、挑哪幾段當內容設計動畫候選，上限 ${designCap(target)} 段）；派工訊息照抄：`);
    console.log(`  你是這集的導演，負責 ${rel(P.project)} 的視覺語言。照 .agents/skills/auto-edit-storyboard/references/director.md 做。`);
    console.log('→ 回來之後：');
  }
  if (parts.length > 1) {
    console.log(`→ 下一步：一份派一個子代理，同一則回覆一次派出（一次最多 4 個，回來再派下一批）；派工訊息照抄，換掉 <份>：`);
    console.log(`  你負責 ${rel(P.project)} 的分鏡草稿 <份>（${parts.map((p) => p.key).join('、')}）。照 .agents/skills/auto-edit-storyboard/references/chapter-worker.md 做。`);
    console.log('全部回來後合併：');
  } else console.log(`→ 下一步：照 .agents/skills/auto-edit-storyboard/references/chapter-worker.md 寫 ${rel(draftsDir(P))}/ch01.json，寫完合併：`);
  console.log(`node shared/template/tools/build.mjs --project ${rel(P.project)} --merge-drafts`);
}

// ---------- 查規格（--spec、--icons、--words、--show）：用到才查，不用讀整份文件或原始碼 ----------

// 寫法.md 的一項：**名稱** 開頭到下一項之前
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
  const md = readOpt(path.join(packDir(P), '寫法.md'));
  if (!md) { console.log(`✖ 還沒有 ${rel(packDir(P))}/寫法.md → 先跑 node shared/template/tools/build.mjs --project ${rel(P.project)} --scaffold`); return 1; }
  const names = String(name).split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
  if (names.length > 1) return names.map((n, i) => { if (i) console.log(''); return specOne(md, n); }).some(Boolean) ? 1 : 0;
  return specOne(md, name);
}
function specOne(md, name) {
  const list = specEntries(md), q = String(name).trim().toLowerCase();
  const exact = list.filter((x) => x.name.toLowerCase().split(/\s+/).includes(q) || x.name.toLowerCase() === q);
  const hits = exact.length ? exact : list.filter((x) => x.text.split('\n')[0].toLowerCase().includes(q));
  if (!hits.length) { console.log(`找不到「${name}」。可以查：${list.map((x) => x.name).join('、')}`); return 1; }
  for (const h of hits.slice(0, 3)) console.log(h.text);
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
export function showCmd(P, id) {
  const plan = readJson(P.plan);
  const ids = String(id).split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  const segs = (plan?.scenes || []).filter((s) => ids.includes(s.id));
  if (!segs.length) { console.log(`✖ plan.json 沒有「${id}」→ 段 id 看 build.mjs --check 的報告`); return 1; }
  for (const s of segs) console.log(JSON.stringify(s, null, 1));
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
// 這個模板的用途（寫法.md 那一條第一行冒號後、第一個句點或分號前）：骨架的 story.why 預設值
export const purposeOf = (entry) => String(entry?.text || '').split('\n')[0].replace(/^\*\*[^*]+\*\*(（[^）]*）)?[：:]\s*/, '').split(/[；。]/)[0].trim().slice(0, 40);

const OVERLAP_OK = ['chapter-tag'];   // 章節角標可以和別段重疊：不算接縫、不算相鄰重複（講者介紹不行，會報「一段只放一個情境」）
export function outlineCmd(P, file) {
  const key = String(file).replace(/\.outline\.md$|\.json$/, '').split('/').pop();
  const src = [path.resolve(String(file)), path.join(draftsDir(P), `${key}.outline.md`)].find((x) => { try { return fs.statSync(x).isFile() && x.endsWith('.outline.md'); } catch { return false; } });
  if (!src) { console.log(`✖ 找不到大綱 → 寫到 ${rel(draftsDir(P))}/${key}.outline.md（每段一行：id | from | to | 模板 | 在講什麼 | 候選構想），再跑這條`); return 1; }
  const md = readOpt(path.join(packDir(P), '寫法.md'));
  if (!md) { console.log(`✖ 還沒有 ${rel(packDir(P))}/寫法.md → 先跑 node shared/template/tools/build.mjs --project ${rel(P.project)} --scaffold`); return 1; }
  const rows = parseOutline(fs.readFileSync(src, 'utf8'));
  if (!rows.length) { console.log(`✖ ${rel(src)} 沒有讀到任何一行（格式：id | from | to | 模板 | 在講什麼 | 候選構想）`); return 1; }
  const list = specEntries(md), cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  const part = (readJson(path.join(packDir(P), 'index.json'))?.parts || []).find((p) => p.key === key);
  const secOf = (ref) => { const p = parseTime(ref); if (p.error || p.kind !== 'cue') return null; const r = cueSeconds(p, cues); return r.error ? null : r.sec; };
  const errors = [], warns = [], hints = [], ids = new Set();
  const segs = rows.map((r) => {
    const entry = findSpec(list, r.tpl), snip = entry && snippetOf(entry);
    if (!entry || !snip) { errors.push(`${r.id}：不認得模板「${r.tpl}」→ 寫寫法.md 裡的名稱（例 key-point、x-scene、fx 29、media）`); return null; }
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
      hints.push(`${r.id}：拍綁在 ${where}，最多 ${win.max} 拍（第一拍離段頭 ≥ ${f.open} 秒、最後一拍到段尾 ≥ ${f.end} 秒、拍與拍 ≥ ${f.gap} 秒；項目比拍多就幾項併一拍）`);
    }
    return { r, entry, snip, kind, a, z };
  });
  const ok = segs.filter(Boolean);
  const main = ok.filter((s) => !OVERLAP_OK.includes(s.kind));
  for (let i = 1; i < main.length; i++) {
    const p = main[i - 1], s = main[i];
    if (s.kind === p.kind && s.kind !== 'media') warns.push(`${s.r.id} 和前一段 ${p.r.id} 都用 ${s.entry.name} → 換一個模板或併成一段`);
    const gap = Math.round((s.a - p.z) * 10) / 10;   // 比實際秒數：#5e 接 #6 算接上
    if (gap > 0.5) warns.push(`${p.r.id} 結尾（${p.r.to}）到 ${s.r.id} 起點（${s.r.from}）空了 ${gap} 秒 → 前一段的 to 寫下一段的 from`);
    else if (gap < -0.5) warns.push(`${p.r.id}（到 ${p.r.to}）和 ${s.r.id}（從 ${s.r.from}）重疊 ${-gap} 秒 → 前一段的 to 寫下一段的 from`);
  }
  const tags = ok.filter((s) => s.kind === 'chapter-tag');
  if (tags.length > 1) warns.push(`章節角標放了 ${tags.length} 段（${tags.map((s) => s.r.id).join('、')}）→ 一章只放第一段；小節名稱 build 會自動換到角標上，不用另排`);
  const eligible = ok.filter((s) => s.kind !== 'media' && !OVERLAP_OK.includes(s.kind)).length;
  const picks = ok.filter((s) => s.r.idea).length, target = designTargetOf(eligible), cap = designCap(target);
  if (target && picks < target) warns.push(`內容設計動畫候選 ${picks} 段，${eligible} 段的三成約 ${target} 段 → 在最值得設計的段寫候選構想`);
  if (cap && picks > cap) warns.push(`內容設計動畫候選 ${picks} 段，最多 ${cap} 段 → 留最值得的`);
  for (const m of errors) console.log(`✖ ${m}`);
  for (const m of warns) console.log(`⚠ ${m}`);
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
  for (const k of ['icons', 'quotes', 'decide']) if (!draft[k]) draft[k] = k === 'icons' ? {} : [];
  fs.mkdirSync(draftsDir(P), { recursive: true });
  writeAtomic(out, `${JSON.stringify(draft, null, 2)}\n`);
  const holes = placeholders(draftSegs);
  const autos = draftSegs.reduce((n, sg) => { let k = 0; eachField(sg, (o, kk, x) => { if (x === AUTO) k++; }); return n + k; }, 0);
  console.log(`草稿骨架：${rel(out)}（${draftSegs.length} 段，要填 ${holes.length} 格；起訖、anchor、欄位都寫好了，${autos} 格時間寫 auto 由工具對${old.size ? '，填過的段留著' : ''}）`);
  if (hints.length) { console.log('模板動畫的拍綁哪幾句（照這個挑詞就不用算秒數）：'); for (const h of hints) console.log(`  ${h}`); }
  console.log(`→ 下一步：只改 ${rel(out)} 裡的 <…>（畫面上的字，<> 裡是字數上限）、#N@詞（講到那個東西的詞）；寫 auto 的時間不用動（工具照卡上的字找講到的地方），why 已經寫了模板用途、要改再改；金句寫 quotes、拿不定寫 decide。改完驗：`);
  console.log(`node shared/template/tools/build.mjs --project ${rel(P.project)} --check-draft ${key}`);
  return 0;
}

// ---------- --check-draft：只驗一份草稿，不受別章影響 ----------

// 草稿路徑：照抄文件的 work/drafts/ch01.json、projects/X/work/...、只寫 ch01 都找得到（指令一律在工作區根目錄跑）
function draftPath(P, file) {
  const f = String(file);
  const tries = [path.resolve(f), path.join(P.project, f), path.join(draftsDir(P), f), path.join(draftsDir(P), `${f}.json`)];
  return tries.find((x) => { try { return fs.statSync(x).isFile(); } catch { return false; } }) || null;
}

// 同一份、同一段第幾次檢查（⚠ 只修一輪：第 2 次起 0 個 ✖ 就可以交件，不要一直追 ⚠）
export function runCount(P, key) {
  const f = path.join(P.out, '.cache', 'check-runs.json');
  const j = readJson(f, {});
  j[key] = (j[key] || 0) + 1;
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(j)); } catch { /* 只是提示，不影響檢查 */ }
  return j[key];
}

// 換人接手這一段（重派、改版確認、回饋輪開始、③ 勾成內容設計動畫）就歸零：新的人第一次 0 個 ✖ 不該就印「可以交件」
export function resetRuns(P, ids) {
  const f = path.join(P.out, '.cache', 'check-runs.json');
  const j = readJson(f, null);
  if (!j) return [];
  const hit = ids.filter((id) => j[`audit:${id}`] != null);
  if (!hit.length) return [];
  for (const id of hit) delete j[`audit:${id}`];
  try { fs.writeFileSync(f, JSON.stringify(j)); } catch { /* 只是提示，不影響檢查 */ }
  return hit;
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
  const au = resolveAuto(segs, parseSrt(fs.readFileSync(P.srt, 'utf8')));
  if (au.filled.length || au.icons.length) {
    writeAtomic(abs, `${JSON.stringify(draft, null, 2)}\n`);
    if (au.filled.length) console.log(`自動補 ${au.filled.length} 格時間（auto → #N@詞，寫回 ${rel(abs)}）`);
    for (const m of au.icons) console.log(`自動換：${m}`);
  }
  if (au.failed.length) {
    for (const m of au.failed.slice(0, 15)) console.log(`✖ ${m}`);
    console.log(`未通過：${au.failed.length} 格 auto 對不到字幕 → 照上面改，再跑一次`);
    return 1;
  }
  const base = readJson(P.plan, { version: 1 });
  const tmp = path.join(P.out, '.cache', `draft-${path.basename(abs)}`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({ ...base, scenes: segs, sections: undefined }));
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
  const errors = j.errors.filter((m) => mine(m) && !skip.test(m));
  const warns = j.warnings.filter((m) => mine(m) && !skip.test(m) && !covers(m));   // 蓋到講者 < 40% 又沒碰到臉：--storyboard 的截圖才看得出擋到哪
  if (part) {
    const missing = segs.filter((s) => !s.story?.say).map((s) => s.id);
    if (missing.length) warns.unshift(`這幾段沒有 story.say（分鏡表要用）：${missing.join('、')}`);
    const designs = segs.filter((s) => s.design || isDesignPick(s)).length;
    const eligible = segs.filter(designEligible).length;
    const target = part.target ? designTargetOf(eligible) : 0, cap = designCap(target);
    if (target && designs > cap) warns.unshift(`內容設計動畫候選 ${designs} 段，這一份 ${eligible} 段最多 ${cap} 段 → 留最值得的 ${cap} 段，其他拿掉 story.designIdea`);
    if (target && designs < target) warns.unshift(`內容設計動畫候選 ${designs} 段，這一份 ${eligible} 段的三成約 ${target} 段 → 挑最值得設計的時刻，在那段的 story 寫 designIdea、designWhy（共用.md 第 4 節）；真的沒有就在 decide 寫原因`);
    for (const s of segs) { const n = cueOf(s); if (n && (n < part.firstN || n > part.lastN)) warns.push(`${s.id} 的起點 #${n} 不在這一份的範圍（#${part.firstN}–#${part.lastN}）`); }
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
  return `## 畫布：右下有講者小視窗\n\n主內容 x 120–1300、y 150–858。不能碰：小視窗 x 1424–1888、y 581–951；y ≥ 920（字幕）${badge ? `、${badge}` : ''}。`;
}

// brief 的字幕：段內的句子寫「從這段起點算的秒數」，設計師不用自己累加句長（累加會漏掉句間停頓，和段長對不上，就會整份重排）
export function briefCueLines(cues, a, z, t0) {
  return cues.filter((c) => c.n >= a - 3 && c.n <= z + 2).map((c) => (c.n >= a && c.n <= z
    ? `#${c.n}（段內 ${Math.max(0, c.start - t0).toFixed(1)}–${(c.end - t0).toFixed(1)} 秒）${c.text}`
    : `（前後文）#${c.n}（${(c.end - c.start).toFixed(1)} 秒）${c.text}`));
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
    const lines = briefCueLines(cues, a, z, it?.start ?? inside[0]?.start ?? 0);
    const vision = readOpt(path.join(packDir(P), '視覺語言.md')).trim();
    const body = `# ${s.id} 內容設計動畫\n\n段落：${s.from}–${s.to}（#Ne＝第 N 句結尾，#N@詞＝第 N 句講到那個詞；這段 ${secs} 秒）\n構想（草稿寫的，可以推翻）：${s.story?.idea || '—'}\n為什麼值得設計：${s.story?.why || '—'}\n前一段：${near(ordered[idx - 1])}\n後一段：${near(ordered[idx + 1])}\n\n${canvasNote(s, it, plan)}\n\n## 字幕（段內秒數＝從這段起點算；這段到 ${secs} 秒）\n\n${lines.join('\n')}\n\n## 音效（音效拍點欄只能寫這些名稱，或 —）\n\n${sfxList(P)}${vision ? `\n\n## 這集的視覺語言（跟著這份走，全片才一致）\n\n${vision.replace(/^#+\s.*\n/, '').trim()}` : ''}\n\n鏡位腳本寫到：work/designs/${s.id}.md\n動畫檔：work/hyperframes/${designFileOf(s)}\n`;
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

export function mergeDrafts(P, flags = {}, deps = {}) {
  const dir = draftsDir(P);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^ch\d+\.json$/.test(f)).sort(); } catch { /* 沒有 */ }
  if (!files.length) { console.log(`✖ ${rel(dir)} 沒有草稿（chNN.json）→ 先照 work/分鏡素材/ 寫`); return 1; }
  const parts = readJson(path.join(packDir(P), 'index.json'))?.parts || [];
  const missing = parts.map((p) => p.key).filter((k) => !files.includes(`${k}.json`));
  const segs = [], ends = [], icons = {}, quotes = [], decide = [], problems = [], warns = [];
  let cuesMemo = null;
  const mergeCues = () => (cuesMemo ||= parseSrt(fs.readFileSync(P.srt, 'utf8')));
  for (const f of files) {
    const d = readJson(path.join(dir, f));
    if (!d || !Array.isArray(d.segments)) { problems.push(`${f} 讀不到 segments → 修好 JSON 再跑`); continue; }
    const au = resolveAuto(d.segments, mergeCues());
    if (au.filled.length || au.icons.length) writeAtomic(path.join(dir, f), `${JSON.stringify(d, null, 2)}\n`);
    if (au.filled.length) warns.push(`${f}：自動補 ${au.filled.length} 格時間（auto → #N@詞）`);
    for (const m of au.icons) warns.push(`${f}：自動換${m}`);
    for (const m of au.failed) problems.push(`${f} ${m}`);
    segs.push(...d.segments);
    const last = [...d.segments].sort((x, y) => cueOf(x) - cueOf(y)).pop();
    if (last) ends.push(last);
    for (const [k, v] of Object.entries(d.icons || {})) { if (icons[k] && icons[k] !== v) warns.push(`圖示不一致：「${k}」有 ${icons[k]} 和 ${v} → 全集用同一個（這次用 ${icons[k]}）`); else icons[k] = v; }
    quotes.push(...(d.quotes || []));
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
  const planNext = `${JSON.stringify(plan, null, 2)}\n`;
  if (planText.trim() && planText !== planNext) backupPlan(P.plan);
  writeAtomic(P.plan, planNext);
  if (autofixStep(P)) plan = readJson(P.plan) || plan;
  fs.writeFileSync(mergedFile, `${JSON.stringify({ icons, quotes, decide, scenesHash: sha(JSON.stringify(plan.scenes)) }, null, 2)}\n`);
  const cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  const designs = writeBriefs(P, plan, cues);
  for (const w of new Set(warns)) console.log(`⚠ ${w}`);
  const r = tool('build.mjs', ['--project', P.project, '--check', ...(P.templateArg || [])]);
  const lines = (r.stdout || '').split('\n');
  for (const l of lines) if (l.startsWith('✖')) console.log(l);
  const summary = lines.filter((l) => /^(通過|未通過)：/.test(l)).pop();
  const videoDur = idx?.videoDur ?? 0;
  const target = videoDur >= 60 ? designTargetOf((plan.scenes || []).filter(designEligible).length) : 0;
  if (joined.length) console.log(`接起分章交界的空檔：${joined.join('、')}`);
  const cap = designCap(target);
  const picks = (plan.scenes || []).filter(isDesignPick).length + designs.length;
  console.log(`合併：${segs.length} 段（${files.length} 份）；內容設計動畫候選 ${picks} 段（停點 ③ 勾了才做）${designs.length ? `，其中 ${designs.length} 段已經指定要做` : ''}${picks < target ? `（⚠ 約三成的段是 ${target} 個候選）` : ''}${picks > cap ? `（⚠ 上限 ${cap} 段 → 留最值得的，其他在草稿拿掉 designIdea 再合併）` : ''}`);
  if (summary) console.log(summary);
  if (r.status !== 0) { console.log('→ 下一步：照 ✖ 改（改那一份 work/drafts/chNN.json，再合併一次）'); console.log(`node shared/template/tools/build.mjs --project ${rel(P.project)} --merge-drafts`); return 1; }
  const todo = designs.filter((d) => !fs.existsSync(path.join(designsDir(P), `${d.id}.md`)));
  if (todo.length) {
    console.log(`→ 下一步：內容設計動畫一段派一個設計師寫鏡位腳本，同一則回覆一次派出（一次最多 4 個，回來再派下一批）：${todo.map((d) => d.id).join('、')}。派工訊息照抄，換掉 <段>：`);
    console.log(`  你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。照 .agents/skills/auto-edit-motion/references/design-script.md 寫鏡位腳本。`);
    console.log('全部回來後產生分鏡表：');
  } else if (deps.loadLib && !flags['no-storyboard']) {
    // 合併過了、沒有要先寫的鏡位腳本：直接接著產生分鏡表（主代理少一個回合；停點 ③ 那一行在最後）
    console.log('合併通過，接著產生分鏡表（同 --storyboard）：');
    return storyboardCmd(P, {}, deps);
  } else console.log('→ 下一步：截圖、產生分鏡表，停在停點 ③');
  console.log(`node shared/template/tools/build.mjs --project ${rel(P.project)} --storyboard`);
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
  return {
    project: path.basename(P.project), plan, merged, parts, cues, shots,
    items: new Map((j.items || []).map((x) => [x.id, x])), voiceOnly: j.voiceOnly || [],
    scenes: lib.scenes, specs: new Map(listFillSpecs(lib.customDir).map((f) => [f.template, f])), designs: loadDesigns(P, plan),
  };
}

function startEditor(P, label) {
  const r = tool('editor.mjs', ['--project', P.project]);
  const m = (r.stdout || '').match(new RegExp(`${label}[：:]\\s*(\\S+)`));
  return m ? m[1] : null;
}

export function storyboardCmd(P, flags, { loadLib }) {
  const lib = loadLib(P.templateDir);
  const plan = readJson(P.plan);
  if (!plan?.scenes) { console.log('✖ plan.json 還沒有 scenes → 先照 work/分鏡素材/ 寫草稿、跑 --merge-drafts'); return 1; }
  const only = flags.only ? String(flags.only).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : null;
  const file = sbFile(P);
  if (!only && storyboardDirty(P) && !flags.force) {
    console.log('✖ work/storyboard.md 在上次產生之後有人改過（網頁或手動）→ 停點 ③ 還在等使用者回覆：重貼停點 ③ 那一行，等他說「可以」「改好了」再跑 --apply-storyboard（它會把改動套回 plan.json、記 ③ 通過）；使用者確定不要網頁上的改動才加 --force 重產生');
    return 1;
  }
  const b = buildTool(['--project', P.project, ...(P.templateArg || [])]);
  if (b.status !== 0) { for (const l of (b.stdout + b.stderr).split('\n')) if (/^✖|Error/.test(l)) console.log(l); console.log('✖ build 沒過 → 照 ✖ 改 plan.json'); return 1; }
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
  const url = startEditor(P, '分鏡表') || 'work/storyboard.md';
  appendStop(P.project, { stop: '③ 分鏡表', state: '待回覆' });
  const warn = groupWarnings((j.warnings || []).filter((w) => !/還是範例原文|內容設計動畫還沒做/.test(w)));
  for (const e of j.errors || []) console.log(`✖ ${e}`);
  for (const w of warn.slice(0, 20)) console.log(`⚠ ${w}`);
  if (warn.length > 20) console.log(`（還有 ${warn.length - 20} 個 ⚠：build.mjs --check 看全部）`);
  const designs = plan.scenes.filter((s) => s.design).length;
  console.log(`分鏡表：${rel(file)}（${plan.scenes.length} 段，模板 ${plan.scenes.filter((s) => s.template).length}、內容設計動畫 ${designs}；截圖 ${shots.shots?.length ?? 0} 張${shots.sheets?.length ? `，拼圖 ${shots.sheets.length} 頁` : ''}）`);
  const ideas = [...ctx.designs.entries()].map(([id, d]) => `${id}：${String(d.concept || '').slice(0, 40)}`).filter((x) => !x.endsWith('：'));
  if (ideas.length) console.log(`內容設計動畫概念（回報給使用者）：\n  ${ideas.slice(0, 40).join('\n  ')}`);
  const dp = designPlan(plan.scenes, { items: ctx.items, partOf: chapterOfFn(ctx.parts) });
  if (dp.cands.length) console.log(`內容設計動畫候選 ${dp.cands.length} 段，${designPlanLine(dp)}（回報給使用者這一句：在分鏡表「需要我決定的事」取消勾就照現在的版面）：\n  ${dp.cands.slice(0, 40).map((c) => `${dp.on.has(c.id) ? '☑' : '☐'} ${c.id}：${String(plan.scenes.find((s) => s.id === c.id).story.designIdea).slice(0, 40)}`).join('\n  ')}`);
  console.log(`⏸ 停點 ③ 分鏡表｜請看：${url}｜請回：改好後說「可以」，或要改的地方`);
  return 0;
}

// ---------- --apply-storyboard ----------

// ③ 勾成內容設計動畫的段：storyboard.md 那張「#### 動畫分鏡 <段>」是模板的拍，換成一行指到鏡位腳本
// （不留標題：留著會被當成一張空表；拿掉後 audit 就照 work/designs/<段>.md 對拍）
export function dropBeatSheets(md, ids) {
  if (!ids.length) return md;
  const want = new Set(ids), lines = md.split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^####\s*動畫分鏡\s+([^\s（(]+)/);
    if (!h || !want.has(h[1])) { out.push(lines[i]); continue; }
    out.push(`動畫分鏡：改成內容設計動畫，鏡位腳本看 work/designs/${h[1]}.md（設計師寫）`, '');
    let j = i + 1;
    while (j < lines.length && !/^#{1,4}\s/.test(lines[j])) j++;
    i = j - 1;
  }
  return out.join('\n');
}

export function applyCmd(P, flags, { loadLib }) {
  const lib = loadLib(P.templateDir);
  const plan = readJson(P.plan);
  const file = sbFile(P);
  if (!plan?.scenes || !fs.existsSync(file)) { console.log('✖ 還沒有 work/storyboard.md 或 plan.json 的 scenes → 先跑 --storyboard'); return 1; }
  const r = applyStoryboard(fs.readFileSync(file, 'utf8'), plan, { scenes: lib.scenes, specs: new Map(listFillSpecs(lib.customDir).map((f) => [f.template, f])) });
  if (r.changed) {
    fs.copyFileSync(P.plan, `${P.plan}.bak-storyboard`);
    writeAtomic(P.plan, `${JSON.stringify(r.plan, null, 2)}\n`);
  }
  for (const c of r.changes) console.log(`改：${c}`);
  if (!r.changes.length) console.log('分鏡表沒有改到文字、音效或金句');
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
    const md = fs.readFileSync(file, 'utf8'), next = dropBeatSheets(md, fresh);
    if (next !== md) writeAtomic(file, next);
    resetRuns(P, fresh);
  }
  recordStoryboard(P, fs.readFileSync(file, 'utf8'));
  const P2 = `--project ${rel(P.project)}`;
  if (r.requests.length) {
    for (const q of r.requests) console.log(`要求：${q.id} ${q.label}：${q.text}`);
    const ids = [...new Set(r.requests.map((q) => q.id))];
    console.log('→ 下一步：照要求改那幾段（換情境就改 plan.json 那段的 template／scene／slots；內容設計動畫改 work/designs/<段>.md），重截那幾段、重貼停點 ③');
    console.log(`node shared/template/tools/build.mjs ${P2} --storyboard --only ${ids.join(',')}`);
    return 0;
  }
  appendStop(P.project, { stop: '③ 分鏡表', state: '通過', said: flags.said || '', back: 'plan.json' });
  const cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  const planNow = fixed ? readJson(P.plan) || r.plan : r.plan;
  const designs = writeBriefs(P, planNow, cues);
  const todo = designs.filter((d) => isBlankDesign(readOpt(path.join(P.out, designFileOf(planNow.scenes.find((x) => x.id === d.id))))));
  // ③ 勾選才改成內容設計動畫的段還沒有鏡位腳本：同一個設計師先寫腳本、接著做動畫（使用者已經在 ③ 決定要做，不再停）
  const noScript = todo.filter((d) => !fs.existsSync(path.join(designsDir(P), `${d.id}.md`)));
  const withScript = todo.filter((d) => !noScript.includes(d));
  if (todo.length) {
    console.log(`→ 下一步：內容設計動畫一段派一個設計師，同一則回覆一次派出（一次最多 4 個，回來再派下一批）：${todo.map((d) => d.id).join('、')}。派工訊息照抄，換掉 <段>：`);
    if (withScript.length) console.log(`  ${noScript.length ? `（${withScript.map((d) => d.id).join('、')}）` : ''}你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。照 .agents/skills/auto-edit-motion/references/design-build.md 做動畫。`);
    if (noScript.length) console.log(`  ${withScript.length ? `（${noScript.map((d) => d.id).join('、')}）` : ''}你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。先照 .agents/skills/auto-edit-motion/references/design-script.md 寫鏡位腳本（不用等確認），寫完接著照 design-build.md 做動畫。`);
    console.log('全部回來後定稿：');
  } else console.log('→ 下一步：定稿，停在停點 ④');
  console.log(`node shared/template/tools/build.mjs ${P2} --review`);
  return 0;
}

// ---------- --design-status：內容設計動畫做到哪（主代理等設計師時看；沒進度超過 20 分鐘就重派） ----------

// [x, y] 扣掉 spans 裡每一段，剩下的區間（依序）
export const subtractSpans = ([x, y], spans = []) => spans.reduce((acc, [p, q]) => acc.flatMap(([u, w]) => (q <= u || p >= w ? [[u, w]] : [[u, Math.min(w, p)], [Math.max(u, q), w]].filter(([m, n]) => n - m > 1e-6))), y > x ? [[x, y]] : []);
export const DESIGN_STALL_MIN = 20;   // 建議初值：一段約 12 分鐘（shared/style.md），20 分鐘還是空白畫布多半是卡住或被中斷
export function designStatus(P, now = Date.now()) {
  const plan = readJson(P.plan);
  const mt = (f) => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : null);
  const ago = (t) => (t == null ? null : Math.max(0, Math.round((now - t) / 60000)));
  return (plan?.scenes || []).filter((s) => s?.design).map((s) => {
    const html = path.join(P.out, designFileOf(s)), script = path.join(designsDir(P), `${s.id}.md`);
    const brief = path.join(P.project, 'work', 'briefs', `${s.id}.md`), sheet = path.join(P.project, 'work', 'audit-shots', `sheet-${s.id}.jpg`);
    const blank = isBlankDesign(readOpt(html)), hasScript = fs.existsSync(script);
    const last = blank ? Math.max(mt(brief) ?? 0, mt(script) ?? 0) || null : mt(html);
    const audited = !blank && mt(sheet) != null && mt(sheet) >= mt(html);
    const state = !blank ? `動畫做了（最後改動 ${ago(last)} 分鐘前）${audited ? '，audit 0 個 ✖ 的拼圖是最新的' : ''}`
      : hasScript ? `腳本寫好、動畫還沒動手（腳本 ${ago(mt(script))} 分鐘前）` : `還沒動手（派出 ${ago(mt(brief)) ?? '?'} 分鐘）`;
    // 卡住：空白畫布從派出（或腳本寫好）起 20 分鐘沒動；或動畫做了一半，最後改動 20 分鐘前、之後沒有 audit 過（拼圖比檔舊）
    const stalled = last != null && ago(last) >= DESIGN_STALL_MIN && (blank || !audited);
    return { id: s.id, blank, script: hasScript, audited, idle: ago(last), state, stalled };
  });
}
export function designStatusCmd(P) {
  const list = designStatus(P);
  if (!list.length) { console.log('沒有內容設計動畫段（plan.json 沒有 "design": true）'); return 0; }
  console.log(`內容設計動畫 ${list.length} 段：`);
  for (const d of list) console.log(`  ${d.id}：${d.state}${d.stalled ? `　⚠ 超過 ${DESIGN_STALL_MIN} 分鐘沒進度` : ''}`);
  const stalled = list.filter((d) => d.stalled);
  if (stalled.length) {
    resetRuns(P, stalled.map((d) => d.id));   // 新派的設計師從第 1 次 audit 算起
    console.log(`→ 下一步：停掉原本負責 ${stalled.map((d) => d.id).join('、')} 的設計師，重派（同一則回覆一次派出，派工訊息照抄，換掉 <段>）：`);
    const started = stalled.filter((d) => !d.blank), noScript = stalled.filter((d) => d.blank && !d.script), withScript = stalled.filter((d) => d.blank && d.script);
    const tag = (g) => (stalled.length > g.length ? `（${g.map((d) => d.id).join('、')}）` : '');
    if (started.length) console.log(`  ${tag(started)}你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。動畫檔已經有內容：照 .agents/skills/auto-edit-motion/references/design-build.md 用 edit 接著改，不要整份重寫；跑 audit，0 個 ✖ 就交。`);
    if (withScript.length) console.log(`  ${tag(withScript)}你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。照 .agents/skills/auto-edit-motion/references/design-build.md 做動畫。先 write 骨架就跑 audit，之後只用 edit 補。`);
    if (noScript.length) console.log(`  ${tag(noScript)}你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。先照 .agents/skills/auto-edit-motion/references/design-script.md 寫鏡位腳本（不用等確認），寫完接著照 design-build.md 做動畫。`);
  } else if (list.every((d) => d.audited)) console.log(`→ 下一步：全部做好了，定稿：\nnode shared/template/tools/build.mjs --project ${rel(P.project)} --review`);
  else console.log('→ 下一步：還在做，等設計師回覆（不要用 sleep 迴圈等）');
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
function reviewNow(P, flags) {
  try {
    const j = JSON.parse(tool('build.mjs', ['--project', P.project, '--check', '--json', ...(P.templateArg || [])]).stdout);
    if (!j.ok) return null;
    const plan = readJson(P.plan) || {}, { scenes = [], ...rest } = plan;
    const sb = readOpt(sbFile(P)), bs = parseBeatSheets(sb), il = parseIllusLists(sb);
    const noLine = (v) => JSON.parse(JSON.stringify(v ?? null, (k, x) => (k === 'line' ? undefined : x)));   // 行號會隨前面的段變
    const sheets = {};
    for (const s of scenes) if (s?.id) sheets[s.id] = [noLine(bs.get(s.id)), noLine(il.get(s.id)), readOpt(path.join(designsDir(P), `${s.id}.md`))];
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

export async function reviewCmd(P, flags) {
  const P2 = `--project ${rel(P.project)}`;
  if (storyboardDirty(P)) {
    console.log('✖ work/storyboard.md 有改動還沒套回 plan.json（網頁或手動改的），現在定稿會漏掉那些改動');
    console.log('→ 下一步：把改動套回 plan.json；確定不要那些改動才用 --storyboard --force 重新產生分鏡表');
    console.log(`node shared/template/tools/build.mjs ${P2} --apply-storyboard`);
    return 1;
  }
  const b = buildTool(['--project', P.project, ...(P.templateArg || [])]);
  const bl = (b.stdout || '').split('\n');
  const SIX = /^(人聲響度|音效比例|剪接點微淡化|講者調光|講者瘦臉|結尾配樂)/;
  for (const l of bl) if (SIX.test(l)) console.log(l);
  const usage = assetUsageLine(P.project, readJson(P.plan)?.scenes);
  if (usage) console.log(usage);
  if (b.status !== 0) { for (const l of bl) if (l.startsWith('✖')) console.log(l); console.log('✖ build 沒過 → 照 ✖ 改 plan.json，再跑一次'); return 1; }
  const blanks = (readJson(P.plan)?.scenes || []).filter((x) => x?.design && isBlankDesign(readOpt(path.join(P.out, designFileOf(x))))).map((x) => x.id);
  if (blanks.length) {
    console.log(`✖ 內容設計動畫還沒做：${blanks.join('、')} → 一段派一個設計師（.agents/skills/auto-edit-motion/references/design-build.md），全部回來再跑一次`);
    console.log(`node shared/template/tools/build.mjs ${P2} --review`);
    return 1;
  }
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
  if (aE.length) { console.log('→ 下一步：照 ✖ 的 → 改（情境動畫段的 ✖ 原文交回做那段的子代理），改完再跑一次'); console.log(`node shared/template/tools/build.mjs ${P2} --review`); return 1; }
  // 都過了才記
  if (cur && shots?.sheets?.length) { try { writeReviewCache(P, { v: 1, global: cur.global, segs: cur.segs, warnings: auWarn, findings: { ...Object.fromEntries(kept), ...fresh } }); } catch { /* 記不下來只是下次整支重做 */ } }
  const url = startEditor(P, '完成影片預覽') || '（editor.mjs 沒有開起來：跑 node shared/template/tools/editor.mjs ' + P2 + '）';
  appendStop(P.project, { stop: '④ 完成影片預覽', state: '待回覆' });
  // 使用者看預覽的時候先把整支 render 起來（低優先權），說「輸出」就不用再等一個片長
  // 預覽只是把 HTML 疊在影片上，不用 render；使用者說「輸出」才 render（要先在背景算才加 --prerender）
  if (fs.existsSync(path.join(TOOLS, 'deliver.mjs')) && flags.prerender) tool('deliver.mjs', ['--project', P.project, '--prerender', ...(P.templateArg || [])], { timeout: 15000 });
  console.log(`⏸ 停點 ④ 完成影片預覽｜請看：${url}｜請回：要改的段落（例：s05 往左移）或「可以了，輸出完成影片」`);
  return 0;
}

export { jobState };

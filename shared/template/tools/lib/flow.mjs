// 排分鏡的流程指令（build.mjs 的 --scaffold、--check-draft、--merge-drafts、--storyboard、--apply-storyboard、--review 都走這裡）。
// 把「模型一步一步下指令、手寫分鏡表」變成工具一次做完；模型只負責判斷與設計。零依賴。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSrt } from './srt.mjs';
import { textWidth } from './time.mjs';
import { probeDuration } from './ff.mjs';
import { canvasOf, resolveFormat } from './canvas.mjs';
import { alignOutline, scriptOutline, splitParts, renderCommon, renderSnippets, renderPart, designTarget, designCap, DESIGN_EVERY } from './scaffold.mjs';
import { listFillSpecs, designFileOf, illusNames, isBlankDesign } from './custom-fill.mjs';
import { renderStoryboard, renderSection, applyStoryboard, parseDesign } from './storyboard-gen.mjs';
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
  console.log(`內容設計動畫目標：全片至少 ${target} 段（每 ${DESIGN_EVERY / 60} 分鐘 1 段）；底片在背景預先處理`);
  if (videoDur >= 300 && !fs.existsSync(path.join(dir, '視覺語言.md'))) {
    console.log(`→ 先派一個導演寫 ${rel(dir)}/視覺語言.md（全片共用的視覺主題、指定哪幾段做內容設計動畫，上限 ${designCap(target)} 段）；派工訊息照抄：`);
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

export function specCmd(P, name) {
  const md = readOpt(path.join(packDir(P), '寫法.md'));
  if (!md) { console.log(`✖ 還沒有 ${rel(packDir(P))}/寫法.md → 先跑 node shared/template/tools/build.mjs --project ${rel(P.project)} --scaffold`); return 1; }
  const list = specEntries(md), q = String(name).trim().toLowerCase();
  const exact = list.filter((x) => x.name.toLowerCase().split(/\s+/).includes(q) || x.name.toLowerCase() === q);
  const hits = exact.length ? exact : list.filter((x) => x.text.split('\n')[0].toLowerCase().includes(q));
  if (!hits.length) { console.log(`找不到「${name}」。可以查：${list.map((x) => x.name).join('、')}`); return 1; }
  for (const h of hits.slice(0, 3)) console.log(h.text);
  if (hits.length > 3) console.log(`（還有 ${hits.length - 3} 項符合：${hits.slice(3).map((x) => x.name).join('、')}）`);
  return 0;
}

// 常用詞對 lucide 名稱：圖示有 1,500 多個，不要整份印
const ICON_ALIAS = { 手機: 'smartphone', 電腦: 'laptop', 筆電: 'laptop', 螢幕: 'monitor', 雲端: 'cloud', 雲: 'cloud', 影片: 'video', 攝影機: 'video', 相機: 'camera', 字幕: 'captions', 聲音: 'volume', 音效: 'volume', 麥克風: 'mic', 剪刀: 'scissors', 剪輯: 'scissors', 資料夾: 'folder', 檔案: 'file', 下載: 'download', 上傳: 'upload', 設定: 'settings', 安裝: 'download', 鎖: 'lock', 權限: 'shield', 保護: 'shield', 打勾: 'check', 勾: 'check', 完成: 'circle-check', 警告: 'triangle-alert', 注意: 'triangle-alert', 時間: 'clock', 計時: 'timer', 人: 'user', 使用者: 'user', 團隊: 'users', 星: 'star', 重點: 'star', 燈泡: 'lightbulb', 想法: 'lightbulb', 搜尋: 'search', 連結: 'link', 網頁: 'globe', 程式: 'code', 終端機: 'terminal', 書: 'book', 說明書: 'book-open', 筆記: 'notebook', 清單: 'list-checks', 播放: 'play', 暫停: 'pause', 電池: 'battery', 額度: 'gauge', 速度: 'gauge', 機器人: 'bot', AI: 'bot', 畫面: 'image', 圖片: 'image', 訊息: 'message-circle', 聊天: 'message-circle', 錢: 'wallet', 目標: 'target', 火箭: 'rocket', 工具: 'wrench', 垃圾桶: 'trash-2', 刪除: 'trash-2', 複製: 'copy', 分享: 'share-2', 按讚: 'thumbs-up' };

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

export function checkDraft(P, file) {
  const abs = draftPath(P, file);
  if (!abs) { console.log(`✖ 找不到草稿「${file}」→ 寫完存到 ${rel(draftsDir(P))}/<份>.json，再跑這條`); return 1; }
  let draft;
  try { draft = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { console.log(`✖ ${rel(abs)} 不是合法的 JSON：${e.message}（JSON 不能有註解、最後一項後面不能有逗號）`); return 1; }
  const segs = draft.segments;
  if (!Array.isArray(segs)) { console.log(`✖ ${rel(abs)} 沒有 segments 陣列`); return 1; }
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
    const designs = segs.filter((s) => s.design).length;
    const cap = designCap(part.target);
    if (part.target && designs > cap) warns.unshift(`內容設計動畫 ${designs} 段，這一份最多 ${cap} 段（一段比模板貴很多）→ 留最值得的 ${cap} 段，其他改模板或字卡`);
    if (part.target && designs < part.target) warns.unshift(`內容設計動畫 ${designs} 段，這一份目標至少 ${part.target} 段 → 挑最值得設計的時刻提名（共用.md 第 4 節）；真的沒有就在 decide 寫原因`);
    for (const s of segs) { const n = cueOf(s); if (n && (n < part.firstN || n > part.lastN)) warns.push(`${s.id} 的起點 #${n} 不在這一份的範圍（#${part.firstN}–#${part.lastN}）`); }
    const tags = segs.filter((s) => s.scene === 'chapter-tag').map((s) => (j.items || []).find((x) => x.id === s.id)).filter(Boolean);
    for (const u of j.uncovered || []) {
      const [a, b] = Array.isArray(u) ? u : [u.from ?? u.start, u.to ?? u.end];
      if (!(b > part.start + 0.01 && a < part.end - 0.01) || tags.some((t) => t.start < b && t.end > a)) continue;   // 章節角標那段本來就讓講者露臉
      warns.push(`沒有畫面的區間 ${clock(a)}–${clock(b)} → 前一段的 to 寫下一段的 from（0 秒相接），或補一段字卡`);
    }
    // 只看這一份的範圍：草稿只有這一章的段，主軌後面的旁白當然還沒蓋
    for (const v of j.voiceUncovered || []) {
      const [a0, b0] = Array.isArray(v) ? v : [v.from ?? v.start, v.to ?? v.end];
      const a = Math.max(a0, part.start), b = Math.min(b0, part.end);
      if (b - a <= 0.1) continue;
      const over = (j.items || []).filter((x) => !x.opaque && ids.has(x.id) && x.start < b - 0.05 && x.end > a + 0.05).map((x) => x.id);
      const line = `只有聲音的區間 ${clock(a)}–${clock(b)} 沒被蓋住 → ${over.length ? `${over.join('、')} 疊在講者上，這裡沒有講者，換成全畫面模板（共用.md 第 3 節的替換表）或內容設計動畫` : '加 media 段或不透明全幕，或把前一段的 to 接到下一段的 from'}`;
      if (b - a > 1) errors.push(line); else warns.push(line);
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
function canvasNote(seg, item) {
  if (seg.layout === 'overlay') return '## 畫布：疊在講者畫面上\n\n沒有底圖，講者就是背景，內容不要擋臉。y ≥ 920 是字幕。';
  const it = item?.out || {};
  const badge = it.badgeBox ? `右上角小節角標 x ${Math.round(it.badgeBox[0])}–${Math.round(it.badgeBox[2])}、y ${Math.round(it.badgeBox[1])}–${Math.round(it.badgeBox[3])}` : '';
  if (it.wide) return `## 畫布：全螢幕（這段沒有講者）\n\n內容用滿 x 120–1800、y 40–900，左右和縮到 87% 的螢幕錄影對齊（錄影在 x 125–1796、y 0–940），接到錄影不會跳。不用留小視窗；撐開整個寬度，不要擠在左邊。\n\n不能碰：y ≥ 920（字幕）${badge ? `、${badge}（這個角落空著，別的元素離它至少 16）` : ''}。底是純色，沒有背景圖。`;
  return `## 畫布：右下有講者小視窗\n\n主內容 x 120–1300、y 150–858。不能碰：小視窗 x 1424–1888、y 581–951；y ≥ 920（字幕）${badge ? `、${badge}` : ''}。`;
}

function writeBriefs(P, plan, cues) {
  let items = new Map();
  try { items = new Map((checkJson(P).items || []).map((x) => [x.id, x])); } catch { /* 算不出來就用字幕估 */ }
  const segs = (plan.scenes || []).filter((s) => s.design);
  if (!segs.length) return [];
  fs.mkdirSync(briefsDir(P), { recursive: true });
  fs.mkdirSync(designsDir(P), { recursive: true });
  const ordered = (plan.scenes || []);
  return segs.map((s) => {
    const a = cueOf(s), z = Number(String(s.to || s.from || '').match(/^#(\d+)/)?.[1] ?? a);
    const idx = ordered.indexOf(s);
    const near = (seg) => (seg ? `${seg.id}（${seg.design ? '內容設計動畫' : seg.template || seg.scene || seg.type}${seg.story?.idea ? `：${seg.story.idea}` : ''}）` : '無');
    const lines = cues.filter((c) => c.n >= a - 3 && c.n <= z + 2).map((c) => `${c.n >= a && c.n <= z ? '' : '（前後文）'}#${c.n}（${(c.end - c.start).toFixed(1)} 秒）${c.text}`);
    const inside = cues.filter((c) => c.n >= a && c.n <= z);
    const it = items.get(s.id);
    const secs = it?.start != null && it?.end != null ? (it.end - it.start).toFixed(1) : inside.length ? (inside[inside.length - 1].end - inside[0].start).toFixed(1) : '?';
    const vision = readOpt(path.join(packDir(P), '視覺語言.md')).trim();
    const body = `# ${s.id} 內容設計動畫\n\n段落：${s.from}–${s.to}（#Ne＝第 N 句結尾，#N@詞＝第 N 句講到那個詞；這段 ${secs} 秒）\n構想（提名者寫的，可以推翻）：${s.story?.idea || '—'}\n為什麼值得設計：${s.story?.why || '—'}\n前一段：${near(ordered[idx - 1])}\n後一段：${near(ordered[idx + 1])}\n\n${canvasNote(s, it)}\n\n## 字幕\n\n${lines.join('\n')}\n\n## 音效（音效拍點欄只能寫這些名稱，或 —）\n\n${sfxList(P)}${vision ? `\n\n## 這集的視覺語言（跟著這份走，全片才一致）\n\n${vision.replace(/^#+\s.*\n/, '').trim()}` : ''}\n\n鏡位腳本寫到：work/designs/${s.id}.md\n動畫檔：work/hyperframes/${designFileOf(s)}\n`;
    const f = path.join(briefsDir(P), `${s.id}.md`);
    fs.writeFileSync(f, body);
    return { id: s.id, brief: rel(f) };
  });
}

// ---------- --merge-drafts ----------

const backupStamp = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
export function backupPlan(file, tag = 'merge') {
  let b = `${file}.bak-${tag}-${backupStamp()}`;
  for (let k = 2; fs.existsSync(b); k++) b = `${file}.bak-${tag}-${backupStamp()}-${k}`;
  fs.copyFileSync(file, b);
  return b;
}

export function mergeDrafts(P, flags = {}) {
  const dir = draftsDir(P);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^ch\d+\.json$/.test(f)).sort(); } catch { /* 沒有 */ }
  if (!files.length) { console.log(`✖ ${rel(dir)} 沒有草稿（chNN.json）→ 先照 work/分鏡素材/ 寫`); return 1; }
  const parts = readJson(path.join(packDir(P), 'index.json'))?.parts || [];
  const missing = parts.map((p) => p.key).filter((k) => !files.includes(`${k}.json`));
  const segs = [], ends = [], icons = {}, quotes = [], decide = [], problems = [], warns = [];
  for (const f of files) {
    const d = readJson(path.join(dir, f));
    if (!d || !Array.isArray(d.segments)) { problems.push(`${f} 讀不到 segments → 修好 JSON 再跑`); continue; }
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
  plan.scenes = segs;
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
  const target = designTarget(videoDur);
  if (joined.length) console.log(`接起分章交界的空檔：${joined.join('、')}`);
  const cap = designCap(target);
  console.log(`合併：${segs.length} 段（${files.length} 份）；內容設計動畫 ${designs.length} 段${videoDur >= 180 && designs.length < target ? `（⚠ 建議至少 ${target} 段，品質靠這些段）` : ''}${designs.length > cap ? `（⚠ 上限 ${cap} 段：一段設計比模板多用很多額度 → 留最值得的，其他在草稿改模板再合併；使用者要多做才放寬）` : ''}`);
  if (summary) console.log(summary);
  if (r.status !== 0) { console.log('→ 下一步：照 ✖ 改（改那一份 work/drafts/chNN.json，再合併一次）'); console.log(`node shared/template/tools/build.mjs --project ${rel(P.project)} --merge-drafts`); return 1; }
  const todo = designs.filter((d) => !fs.existsSync(path.join(designsDir(P), `${d.id}.md`)));
  if (todo.length) {
    console.log(`→ 下一步：內容設計動畫一段派一個設計師寫鏡位腳本，同一則回覆一次派出（一次最多 4 個，回來再派下一批）：${todo.map((d) => d.id).join('、')}。派工訊息照抄，換掉 <段>：`);
    console.log(`  你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。照 .agents/skills/auto-edit-motion/references/design-script.md 寫鏡位腳本。`);
    console.log('全部回來後產生分鏡表：');
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
    console.log('✖ work/storyboard.md 在上次產生之後有人改過（網頁或手動）→ 先跑 --apply-storyboard 把改動套回 plan.json；確定不要那些改動才加 --force');
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
  console.log(`⏸ 停點 ③ 分鏡表｜請看：${url}｜請回：改好後說「可以」，或要改的地方`);
  return 0;
}

// ---------- --apply-storyboard ----------

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
  if (todo.length) {
    console.log(`→ 下一步：內容設計動畫一段派一個設計師做動畫，同一則回覆一次派出（一次最多 4 個，回來再派下一批）：${todo.map((d) => d.id).join('、')}。派工訊息照抄，換掉 <段>：`);
    console.log(`  你是設計師，負責 ${rel(P.project)} 的內容設計動畫 <段>。照 .agents/skills/auto-edit-motion/references/design-build.md 做動畫。`);
    console.log('全部回來後定稿：');
  } else console.log('→ 下一步：定稿，停在停點 ④');
  console.log(`node shared/template/tools/build.mjs ${P2} --review`);
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
  if (fs.existsSync(path.join(TOOLS, 'deliver.mjs')) && !flags['no-prerender']) tool('deliver.mjs', ['--project', P.project, '--prerender', ...(P.templateArg || [])], { timeout: 15000 });
  console.log(`⏸ 停點 ④ 完成影片預覽｜請看：${url}｜請回：要改的段落（例：s05 往左移）或「可以了，輸出完成影片」`);
  return 0;
}

export { jobState };

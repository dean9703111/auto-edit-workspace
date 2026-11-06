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
import { alignOutline, scriptOutline, splitParts, renderCommon, renderSnippets, renderPart, designTarget, DESIGN_EVERY } from './scaffold.mjs';
import { listFillSpecs, designFileOf, illusNames, isBlankDesign } from './custom-fill.mjs';
import { renderStoryboard, renderSection, applyStoryboard, parseDesign } from './storyboard-gen.mjs';
import { appendStop } from './progress.mjs';
import { jobState } from './job.mjs';
import { floorRules } from './audit-rules.mjs';
import { readSpeaker } from './speaker.mjs';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join('/') || '.';
const readOpt = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const tool = (name, args, opts = {}) => spawnSync(process.execPath, [path.join(TOOLS, name), ...args], { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
const clock = (t) => { const m = Math.floor(t / 60); return `${m}:${String(Math.floor(t - m * 60)).padStart(2, '0')}`; };
const cueOf = (s) => Number(String(s?.from || s?.at || '').match(/^#(\d+)/)?.[1] ?? 0);

const packDir = (P) => path.join(P.project, 'work', '分鏡素材');
const draftsDir = (P) => path.join(P.project, 'work', 'drafts');
const designsDir = (P) => path.join(P.project, 'work', 'designs');
const briefsDir = (P) => path.join(P.project, 'work', 'briefs');
const sbFile = (P) => path.join(P.project, 'work', 'storyboard.md');
const sbState = (P) => path.join(P.out, '.cache', 'storyboard.json');
const sha = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return String(h); };

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
  return out.filter((n) => n && n.file);
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
  const after = t.split(/[：:｜|]/).pop().trim();
  if (after) t = after;
  if (textWidth(t) > SECTION_MAX) t = t.split(/[，,、。]/)[0].trim() || t;
  while (textWidth(t) > SECTION_MAX) t = t.slice(0, -1);
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
  if (!raw) { fs.mkdirSync(path.dirname(P.plan), { recursive: true }); plan = { version: 1 }; fs.writeFileSync(P.plan, `${JSON.stringify(plan, null, 2)}\n`); }
  const cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  const fmt = resolveFormat({ projectDir: P.project, plan, flag: flags.format ?? null });
  const lib = loadLib(P.templateDir);
  fs.mkdirSync(path.join(P.out, '.cache'), { recursive: true });
  const count = (d, re) => { try { return fs.readdirSync(path.join(P.project, 'assets', d)).filter((n) => re.test(n)).length; } catch { return 0; } };
  const scriptMd = readOpt(path.join(P.project, '講稿.md'));
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
  if (parts.length > 1) console.log(`→ 下一步：一份派一個子代理，同一則回覆一次派出（派工：auto-edit-storyboard 的 references/chapter-worker.md），全部回來後合併`);
  else console.log('→ 下一步：照 共用.md 和 ch01.md 寫 work/drafts/ch01.json，寫完合併');
  console.log(`node shared/template/tools/build.mjs --project ${rel(P.project)} --merge-drafts`);
}

// ---------- --check-draft：只驗一份草稿，不受別章影響 ----------

export function checkDraft(P, file) {
  const abs = path.resolve(file);
  const draft = readJson(abs);
  if (!draft) { console.log(`✖ ${rel(abs)} 讀不到或不是合法的 JSON（JSON 不能有註解、最後一項後面不能有逗號）`); return 1; }
  const segs = draft.segments;
  if (!Array.isArray(segs)) { console.log(`✖ ${rel(abs)} 沒有 segments 陣列`); return 1; }
  const base = readJson(P.plan, { version: 1 });
  const tmp = path.join(P.out, '.cache', `draft-${path.basename(abs)}`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({ ...base, scenes: segs, sections: undefined }));
  const r = tool('build.mjs', ['--project', P.project, '--plan', tmp, '--check', '--json', ...(P.templateArg || [])]);
  let j;
  try { j = JSON.parse(r.stdout); } catch { console.log(`✖ 檢查沒有跑完：${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' ')}`); return 1; }
  const ids = new Set(segs.map((s) => s.id));
  const mine = (m) => { const x = String(m).match(/^\[([\w-]+)/); return !x || ids.has(x[1]); };
  // 只留這一份自己要處理的：全片才看得出來的（空檔、音效密度）、主代理處理的（小節合併時寫、字幕到剪輯台改、設計師之後做）不算
  const skip = /沒有畫面的區間|音效稀疏|音效密度|還沒排段落|只有聲音的區間|講稿有 \d+ 個小節|字幕不到|內容設計動畫還沒做|還沒設定講者|前的空檔只有/;
  const covers = (m) => { const x = String(m).match(/大約會蓋到講者框 (\d+)%/); return x && Number(x[1]) < 40; };
  const parts = readJson(path.join(packDir(P), 'index.json'))?.parts || [];
  const part = parts.find((p) => p.key === path.basename(abs, '.json'));
  const errors = j.errors.filter((m) => mine(m) && !skip.test(m));
  const warns = j.warnings.filter((m) => mine(m) && !skip.test(m) && !covers(m));   // 蓋到講者 < 40%：--storyboard 的截圖才看得出擋到哪
  if (part) {
    const missing = segs.filter((s) => !s.story?.say).map((s) => s.id);
    if (missing.length) warns.unshift(`這幾段沒有 story.say（分鏡表要用）：${missing.join('、')}`);
    const designs = segs.filter((s) => s.design).length;
    if (part.target && designs < part.target) warns.unshift(`內容設計動畫 ${designs} 段，這一份目標至少 ${part.target} 段 → 挑最值得設計的時刻提名（共用.md 第 4 節）；真的沒有就在 decide 寫原因`);
    for (const s of segs) { const n = cueOf(s); if (n && (n < part.firstN || n > part.lastN)) warns.push(`${s.id} 的起點 #${n} 不在這一份的範圍（#${part.firstN}–#${part.lastN}）`); }
    const tags = segs.filter((s) => s.scene === 'chapter-tag').map((s) => (j.items || []).find((x) => x.id === s.id)).filter(Boolean);
    for (const u of j.uncovered || []) {
      const [a, b] = Array.isArray(u) ? u : [u.from ?? u.start, u.to ?? u.end];
      if (!(b > part.start + 0.01 && a < part.end - 0.01) || tags.some((t) => t.start < b && t.end > a)) continue;   // 章節角標那段本來就讓講者露臉
      warns.push(`沒有畫面的區間 ${clock(a)}–${clock(b)} → 前一段的 to 寫下一段的 from（0 秒相接），或補一段字卡`);
    }
    for (const v of j.voiceUncovered || []) { const [a, b] = Array.isArray(v) ? v : [v.from ?? v.start, v.to ?? v.end]; if (b > part.start && a < part.end) errors.push(`只有聲音的區間 ${clock(a)}–${clock(b)} 沒被蓋住 → 加 media 段或不透明全幕`); }
  }
  for (const m of errors) console.log(`✖ ${m}`);
  for (const m of warns) console.log(`⚠ ${m}`);
  console.log(errors.length ? `未通過：${errors.length} 個 ✖、${warns.length} 個 ⚠` : `通過：${segs.length} 段，${warns.length} 個 ⚠`);
  return errors.length ? 1 : 0;
}

// ---------- 內容設計動畫：派工用的資料 ----------

const sfxList = (P) => {
  const sfx = readJson(path.join(P.templateDir, 'kit', 'sfx.json'), {});
  return Object.entries(sfx).filter(([, v]) => v?.kind === 'sfx').map(([k, v]) => `${k}（${v.zh || k}）`).join('、');
};

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
    const body = `# ${s.id} 內容設計動畫\n\n段落：${s.from}–${s.to}（#Ne＝第 N 句結尾，#N@詞＝第 N 句講到那個詞；這段 ${secs} 秒）\n構想（提名者寫的，可以推翻）：${s.story?.idea || '—'}\n為什麼值得設計：${s.story?.why || '—'}\n前一段：${near(ordered[idx - 1])}\n後一段：${near(ordered[idx + 1])}\n\n## 字幕\n\n${lines.join('\n')}\n\n## 音效（音效拍點欄只能寫這些名稱，或 —）\n\n${sfxList(P)}\n\n鏡位腳本寫到：work/designs/${s.id}.md\n動畫檔：work/hyperframes/${designFileOf(s)}\n`;
    const f = path.join(briefsDir(P), `${s.id}.md`);
    fs.writeFileSync(f, body);
    return { id: s.id, brief: rel(f) };
  });
}

// ---------- --merge-drafts ----------

export function mergeDrafts(P) {
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
  const plan = readJson(P.plan, { version: 1 });
  if (fs.existsSync(P.plan)) fs.copyFileSync(P.plan, `${P.plan}.bak-merge`);
  plan.scenes = segs;
  const idx = readJson(path.join(packDir(P), 'index.json'));
  if (idx?.sections?.length && plan.sections === undefined) plan.sections = idx.sections;
  fs.writeFileSync(P.plan, `${JSON.stringify(plan, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, '_merged.json'), `${JSON.stringify({ icons, quotes, decide }, null, 2)}\n`);
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
  console.log(`合併：${segs.length} 段（${files.length} 份）；內容設計動畫 ${designs.length} 段${videoDur >= 180 && designs.length < target ? `（⚠ 建議至少 ${target} 段，品質靠這些段）` : ''}`);
  if (summary) console.log(summary);
  if (r.status !== 0) { console.log('→ 下一步：照 ✖ 改（改那一份 work/drafts/chNN.json，再合併一次）'); console.log(`node shared/template/tools/build.mjs --project ${rel(P.project)} --merge-drafts`); return 1; }
  const todo = designs.filter((d) => !fs.existsSync(path.join(designsDir(P), `${d.id}.md`)));
  if (todo.length) {
    console.log(`→ 下一步：內容設計動畫一段派一個設計師子代理寫鏡位腳本（同一則回覆一次派出，派工：auto-edit-motion 的 references/design-brief.md）：${todo.map((d) => d.id).join('、')}；全部回來後產生分鏡表`);
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
  const last = readJson(sbState(P), {});
  if (!only && fs.existsSync(file) && last.hash && sha(fs.readFileSync(file, 'utf8')) !== last.hash && !flags.force) {
    console.log('✖ work/storyboard.md 在上次產生之後有人改過（網頁或手動）→ 先跑 --apply-storyboard 把改動套回 plan.json；確定不要那些改動才加 --force');
    return 1;
  }
  const b = tool('build.mjs', ['--project', P.project, ...(P.templateArg || [])]);
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
  fs.mkdirSync(path.dirname(sbState(P)), { recursive: true });
  fs.writeFileSync(sbState(P), JSON.stringify({ hash: sha(md), at: Date.now() }));
  const url = startEditor(P, '分鏡表') || 'work/storyboard.md';
  appendStop(P.project, { stop: '③ 分鏡表', state: '待回覆' });
  const warn = groupWarnings((j.warnings || []).filter((w) => !/還是範例原文|內容設計動畫還沒做/.test(w)));
  for (const e of j.errors || []) console.log(`✖ ${e}`);
  for (const w of warn.slice(0, 20)) console.log(`⚠ ${w}`);
  if (warn.length > 20) console.log(`（還有 ${warn.length - 20} 個 ⚠：build.mjs --check 看全部）`);
  const designs = plan.scenes.filter((s) => s.design).length;
  console.log(`分鏡表：${rel(file)}（${plan.scenes.length} 段，模板 ${plan.scenes.filter((s) => s.template).length}、內容設計動畫 ${designs}；截圖 ${shots.shots?.length ?? 0} 張${shots.sheets?.length ? `，拼圖 ${shots.sheets.length} 頁` : ''}）`);
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
    fs.writeFileSync(P.plan, `${JSON.stringify(r.plan, null, 2)}\n`);
    // 接下來設計師要跑 audit（子代理不跑 build）：這裡先 build，他們才量得到最新的 index.html
    if (!r.requests.length) tool('build.mjs', ['--project', P.project, ...(P.templateArg || [])]);
  }
  for (const c of r.changes) console.log(`改：${c}`);
  if (!r.changes.length) console.log('分鏡表沒有改到文字、音效或金句，plan.json 不用動');
  for (const u of r.unmatched) console.log(`⚠ ${u}`);
  fs.writeFileSync(sbState(P), JSON.stringify({ hash: sha(fs.readFileSync(file, 'utf8')), at: Date.now() }));
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
  const designs = writeBriefs(P, r.plan, cues);
  const todo = designs.filter((d) => isBlankDesign(readOpt(path.join(P.out, designFileOf(r.plan.scenes.find((x) => x.id === d.id))))));
  if (todo.length) {
    console.log(`→ 下一步：內容設計動畫一段派一個設計師子代理做動畫（同一則回覆一次派出，派工：auto-edit-motion 的 references/design-brief.md 第二階段）：${todo.map((d) => d.id).join('、')}；全部回來後跑`);
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

export async function reviewCmd(P, flags) {
  const P2 = `--project ${rel(P.project)}`;
  const b = tool('build.mjs', ['--project', P.project, ...(P.templateArg || [])]);
  const bl = (b.stdout || '').split('\n');
  const SIX = /^(人聲響度|音效比例|剪接點微淡化|講者調光|講者瘦臉|結尾配樂)/;
  for (const l of bl) if (SIX.test(l)) console.log(l);
  if (b.status !== 0) { for (const l of bl) if (l.startsWith('✖')) console.log(l); console.log('✖ build 沒過 → 照 ✖ 改 plan.json，再跑一次'); return 1; }
  const blanks = (readJson(P.plan)?.scenes || []).filter((x) => x?.design && isBlankDesign(readOpt(path.join(P.out, designFileOf(x))))).map((x) => x.id);
  if (blanks.length) {
    console.log(`✖ 內容設計動畫還沒做：${blanks.join('、')} → 一段派一個設計師（auto-edit-motion 的 references/design-brief.md「階段二」），全部回來再跑一次`);
    console.log(`node shared/template/tools/build.mjs ${P2} --review`);
    return 1;
  }
  const [au, qc] = await Promise.all([
    runAsync('audit.mjs', ['--project', P.project, ...(P.templateArg || [])]),
    runAsync('qc.mjs', ['storyboard', '--project', P.project, '--json', '--sheet', ...(P.templateArg || [])]),
  ]);
  const al = (au.out || '').split('\n');
  const aE = al.filter((l) => /^\s*✖/.test(l)), aW = al.filter((l) => /^\s*⚠/.test(l));
  for (const l of aE) console.log(l.trim());
  const aWg = groupWarnings(aW.map((l) => l.trim().replace(/^⚠\s*/, '')));
  for (const l of aWg.slice(0, 20)) console.log(`⚠ ${l}`);
  if (aWg.length > 20) console.log(`（還有 ${aWg.length - 20} 類 ⚠：audit.mjs ${P2} 看全部）`);
  let shots = null;
  try { shots = JSON.parse(qc.out); } catch { console.log(`⚠ 完成態拼圖沒有跑完：${(qc.err || qc.out).trim().split('\n').slice(-1)[0] || ''}`); }
  console.log(`audit：✖ ${aE.length}、⚠ ${aW.length}`);
  if (shots?.sheets?.length) { console.log(`完成態拼圖 ${shots.sheets.length} 頁（同一則回覆一次打開，照 REVIEW.md 只找 FAIL）：`); for (const s of shots.sheets) console.log(`  ${s.file || s}`); }
  if (aE.length) { console.log('→ 下一步：照 ✖ 的 → 改（情境動畫段的 ✖ 原文交回做那段的子代理），改完再跑一次'); console.log(`node shared/template/tools/build.mjs ${P2} --review`); return 1; }
  const url = startEditor(P, '完成影片預覽') || '（editor.mjs 沒有開起來：跑 node shared/template/tools/editor.mjs ' + P2 + '）';
  appendStop(P.project, { stop: '④ 完成影片預覽', state: '待回覆' });
  // 使用者看預覽的時候先把整支 render 起來（低優先權），說「輸出」就不用再等一個片長
  if (fs.existsSync(path.join(TOOLS, 'deliver.mjs')) && !flags['no-prerender']) tool('deliver.mjs', ['--project', P.project, '--prerender', ...(P.templateArg || [])], { timeout: 15000 });
  console.log(`⏸ 停點 ④ 完成影片預覽｜請看：${url}｜請回：要改的段落（例：s05 往左移）或「可以了，輸出完成影片」`);
  return 0;
}

export { jobState };

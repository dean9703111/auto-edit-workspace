// 032 B6：拍點只存一處（specs/032-arch-optimizations/beats-single-source.md）。零依賴。
// 每段一個正本（原則：誰改得到動畫檔，誰就改得到那段的正本）：
//   owner 'plan'   模板段、動畫檔是工具照 slots 產生的 → plan.json 那段的 slots（＋ custom/<模板>.fill.json 的 sheet 樣板）
//   owner 'script' 內容設計動畫、手改過的模板段、舊專案手寫 src → work/designs/<段>.md 的「#### 動畫分鏡 <段>」（＋插圖清單）
//   owner 'none'   字卡、字卡動態、media → 沒有動畫分鏡
// storyboard.md 的動畫分鏡、版本的 分鏡.md 都是副本，由工具從正本重產；讀拍點的工具（audit、build --check、autofix、--review、versions）只讀正本，不比修改時間。
//
//   beatOwnerOf(P, seg, { lib })                         → { owner, why: 'template'|'design'|'hand'|'src'|null }
//   beatSourceOf(P, seg, { lib, seed, sbText })          → { owner, why, file, md, sheet, list, seeded }（手改模板段第一次被發現時建 work/designs/<段>.md，seeded＝要印的那一行）
//   beatBlock(P, seg, ctx)                               → storyboard.md 那段要放的 markdown（拍點正本那一行＋動畫分鏡＋插圖清單；沒有就 ''；null＝先不動）
//   refreshBeatTables(md, segs, blockOf, { only })       → { md, changed }：純文字，每段 ### 底下的動畫分鏡、插圖清單換成 blockOf(seg)，其他行不動
//   refreshStoryboard(P, plan, { lib, only, write, force, seed }) → { changed, skipped, line }：寫回 storyboard.md（使用者在網頁改到一半就不寫）
//   recordWritten(P, text)                               → 工具寫完 storyboard.md 記雜湊（時間不早於檔的修改時間，status.mjs 才不會以為回到 ③）
//   writeWholeTable(P, id, block)                        → 整張表寫進鏡位腳本（舊的備份到 work/designs/.old/；versions accept 也用）
//   attachBeats({ plan, P, lib, prune })                 → { notes }：build 在 materializeFills 之後呼叫，照 owner 設 __sheet、__beatOwner；正式 build 把孤兒鏡位腳本搬到 .old/
//   applyBeatEdits(P, md, before, after, { lib, skip })  → { changes, warnings }：--apply-storyboard 把分鏡表上改的動畫分鏡寫回正本（只有 owner script 收）
//   migrateBeats(P, { lib, dryRun })、ensureBeatsV2(P, { lib }) → 舊專案一次性遷移（.cache/beats-v2.json 記做過）
//   promisedOf(md, id)、refList(sheet)                   → 提案確認的綁詞清單（versions accept／finish 比對用）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillStateOf, readFillSpec, renderSheet } from './custom-fill.mjs';
import { parseBeatSheets, parseIllusLists } from './audit-beats.mjs';
import { writeAtomic } from './atomic.mjs';
import { storyboardDirty, recordStoryboard } from './storyboard-state.mjs';
import { applyStoryboardEdit } from '../editor/storyboard-md.mjs';
import { warn } from './say.mjs';

const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readOpt = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isCustom = (s) => !!s && typeof s === 'object' && (s.type === 'custom' || s.design === true) && !!s.id;   // 內容設計動畫漏寫 type 也算
const def = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true });
const stampOf = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

// P＝build.mjs 的 pathsFrom（out＝work/hyperframes）；工作資料夾一律從 out 推（測試用 --out 也對）
export const workDirOf = (P) => path.dirname(P.out);
export const designsDirOf = (P) => path.join(workDirOf(P), 'designs');
export const scriptRel = (id) => `work/designs/${id}.md`;
export const scriptFileOf = (P, id) => path.join(designsDirOf(P), `${id}.md`);
const sbFileOf = (P) => path.join(workDirOf(P), 'storyboard.md');
// 沒有 loadLib 的呼叫端（versions、--show）：只有 customDir 也能判斷（沒有圖示就只比 .cache/custom-fill.json 的雜湊）
export const libOf = (P, lib) => (lib?.customDir ? lib : { customDir: path.join(P?.templateDir || TEMPLATE, 'custom') });
const specOf = (lib, t) => { try { return t ? readFillSpec(lib.customDir, t) : null; } catch { return null; } };
const sheetOfSpec = (spec, seg) => { try { return spec ? renderSheet(spec, seg.slots, seg.id) : null; } catch { return null; } };

// ---------- 正本在哪 ----------

export function beatOwnerOf(P, seg, { lib } = {}) {
  if (!isCustom(seg)) return { owner: 'none', why: null };
  if (seg.design) return { owner: 'script', why: 'design' };
  if (seg.template) {
    const st = seg.__fillState ?? fillStateOf({ seg, outDir: P.out, lib: libOf(P, lib) });
    return st === 'hand' ? { owner: 'script', why: 'hand' } : { owner: 'plan', why: 'template' };
  }
  if (typeof seg.src === 'string' && seg.src) return { owner: 'script', why: 'src' };
  return { owner: 'none', why: null };
}

// ---------- markdown 裡的「#### 動畫分鏡 <段>」「#### 插圖清單 <段>」區塊 ----------

const blockHead = (id) => new RegExp(`^####\\s*(?:動畫分鏡|插圖清單|素材清單)\\s+${esc(id)}(?=$|\\s|[（(])`);
const OWNER_LINE = /^- 拍點正本：/;
const OLD_LINE = /^動畫分鏡：改成內容設計動畫/;   // 032 之前 dropBeatSheets 留下的那一行

// 標題＋空行＋表格算一塊（表格後面的說明不算：那是人寫的，換表時不能吃掉）→ [[起, 迄)]
function blockRanges(lines, id) {
  const re = blockHead(id), out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j < lines.length && lines[j].trim().startsWith('|')) { while (j < lines.length && lines[j].trim().startsWith('|')) j++; } else j = i + 1;
    out.push([i, j]);
    i = j - 1;
  }
  return out;
}

// 從一份 markdown（storyboard.md、鏡位腳本、提案的 分鏡.md）抄出這段的動畫分鏡＋插圖清單
export function beatBlocksOf(md, id) {
  const lines = String(md || '').split(/\r?\n/);
  return blockRanges(lines, id).map(([a, b]) => lines.slice(a, b).join('\n').trimEnd()).join('\n\n');
}

// lines 裡這段的動畫分鏡、插圖清單、「拍點正本」那一行換成 block（'' ＝拿掉），其他行一個字都不動；區塊前後各留一個空行
function swapBlocks(lines, id, block) {
  const drop = new Set();
  for (const [a, b] of blockRanges(lines, id)) for (let k = a; k < b; k++) drop.add(k);
  lines.forEach((l, k) => { if (OWNER_LINE.test(l) || OLD_LINE.test(l)) drop.add(k); });
  const add = block ? String(block).replace(/\s+$/, '').split('\n') : [];
  if (!drop.size && !add.length) return lines.slice();
  const first = drop.size ? Math.min(...drop) : -1, last = drop.size ? Math.max(...drop) : -1, rest = [];
  let pos = -1;
  lines.forEach((l, k) => { if (k === first) pos = rest.length; if (!drop.has(k)) rest.push(l); });
  // 這一節最後面留幾個空行（區塊在最後時照原樣留給下一節）：原本區塊後面的空行；沒有舊區塊＝接在最後的空行之前
  let trail = 0;
  for (let k = last + 1; last >= 0 && k < lines.length && !lines[k].trim(); k++) trail++;
  if (pos < 0) { pos = rest.length; while (pos > 0 && !rest[pos - 1].trim()) pos--; trail = rest.length - pos; }
  let a = pos, b = pos;
  while (a > 0 && !rest[a - 1].trim()) a--;
  while (b < rest.length && !rest[b].trim()) b++;
  const before = rest.slice(0, a), after = rest.slice(b), end = after.length ? [] : Array(trail).fill('');
  const lead = before.length ? [''] : rest.slice(0, pos);   // 區塊前面沒有別的行：標題下原本的空行照留
  if (!add.length) return [...before, ...(before.length && after.length ? [''] : before.length ? [] : lead), ...after, ...end];
  return [...before, ...lead, ...add, ...(after.length ? ['', ...after] : end)];
}

// ---------- 正本的內容 ----------

// 手改過的模板段（或舊專案手寫 src）第一次被發現：建 work/designs/<段>.md。表先抄 storyboard.md 那張（舊專案、照它改的子代理），
// 沒有才照目前的 slots 產生。檔已經在就不動（平行的 audit 同時發現也只會有一份）。回傳要印的那一行（不是 ⚠）
export function seedScript(P, seg, { lib, sbText } = {}) {
  const f = scriptFileOf(P, seg.id);
  if (fs.existsSync(f)) return null;
  let table = beatBlocksOf(sbText ?? readOpt(sbFileOf(P)), seg.id), from = '分鏡表';
  if (!parseBeatSheets(table).get(seg.id) && seg.template) {
    const s = sheetOfSpec(specOf(libOf(P, lib), seg.template), seg);
    if (s) { table = s.trim(); from = ' plan.json 的 slots '; }
  }
  if (!parseBeatSheets(table).get(seg.id)) return null;
  const head = seg.template
    ? `概念：模板 ${seg.template} 手改（拍點改下面這張表；plan.json 這段 slots 的綁詞不再生效）`
    : `概念：手寫動畫 ${seg.src}（拍點改下面這張表）`;
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, `${head}\n\n${table.trim()}\n`, { flag: 'wx' });
  } catch { return null; }
  return seg.template ? `${seg.id} 的動畫檔手改過：拍點改 ${scriptRel(seg.id)}（工具剛照${from}建好）` : `${seg.id} 是手寫的動畫檔：拍點改 ${scriptRel(seg.id)}（工具剛照${from}建好）`;
}

// 不再是正本的鏡位腳本搬到 work/designs/.old/<段>-<時間>.md（不刪：可以從那裡退回）；回傳搬到哪（相對專案）
export function retireScript(P, id, { now = new Date() } = {}) {
  const f = scriptFileOf(P, id);
  if (!fs.existsSync(f)) return null;
  const dir = path.join(designsDirOf(P), '.old');
  fs.mkdirSync(dir, { recursive: true });
  let to = path.join(dir, `${id}-${stampOf(now)}.md`);
  for (let k = 2; fs.existsSync(to); k++) to = path.join(dir, `${id}-${stampOf(now)}-${k}.md`);
  fs.renameSync(f, to);
  return `work/designs/.old/${path.basename(to)}`;
}

export function beatSourceOf(P, seg, { lib, seed = true, sbText } = {}) {
  const { owner, why } = beatOwnerOf(P, seg, { lib });
  const out = { owner, why, file: null, md: null, sheet: null, list: null, seeded: null };
  if (owner === 'plan') {
    const md = sheetOfSpec(specOf(libOf(P, lib), seg.template), seg), sheet = md ? parseBeatSheets(md).get(seg.id) ?? null : null;
    if (sheet) sheet.src = `plan.json 照 ${seg.template} 的分鏡樣板產生的表`;
    return { ...out, file: 'plan.json', md, sheet };
  }
  if (owner !== 'script') return out;
  if (seed && why !== 'design' && !fs.existsSync(scriptFileOf(P, seg.id))) out.seeded = seedScript(P, seg, { lib, sbText });
  const text = readOpt(scriptFileOf(P, seg.id));
  const sheet = text ? parseBeatSheets(text).get(seg.id) ?? null : null;
  if (sheet) sheet.src = scriptRel(seg.id);
  return { ...out, file: scriptRel(seg.id), md: beatBlocksOf(text, seg.id) || null, sheet, list: text ? parseIllusLists(text).get(seg.id) ?? null : null };
}

// null＝這段先不動（手改模板段、手寫 src 段還沒有鏡位腳本，seed: false 或建不出來）；內容設計段沒有鏡位腳本＝只有「拍點正本」那一行（等設計師寫）
export function beatBlock(P, seg, { lib, seed = true, sbText } = {}) {
  const s = beatSourceOf(P, seg, { lib, seed, sbText });
  if (s.owner === 'plan') return s.md ? s.md.trim() : '';
  if (s.owner !== 'script') return '';
  if (!s.md && s.why !== 'design' && !fs.existsSync(scriptFileOf(P, seg.id))) return null;
  return [`- 拍點正本：${s.file}`, s.md ? s.md.trim() : ''].filter(Boolean).join('\n\n');
}

// ---------- storyboard.md 的動畫分鏡從正本重產 ----------

export function refreshBeatTables(md, segs, blockOf, { only = null } = {}) {
  const eol = String(md).includes('\r\n') ? '\r\n' : '\n';
  let lines = String(md).split(/\r?\n/);
  const want = only ? new Set(only) : null, changed = [];
  for (const seg of segs || []) {
    if (!seg?.id || (want && !want.has(seg.id))) continue;
    const re = new RegExp(`^###\\s+${esc(seg.id)}(?=$|[\\s｜|（(：:])`);
    const i = lines.findIndex((l) => re.test(l));
    if (i < 0) continue;
    const block = blockOf(seg);
    if (block == null) continue;   // null＝這段不動
    let j = i + 1;
    while (j < lines.length && !/^#{1,3}\s/.test(lines[j])) j++;
    const region = lines.slice(i + 1, j), next = swapBlocks(region, seg.id, block);
    if (next.join('\n') === region.join('\n')) continue;
    lines = [...lines.slice(0, i + 1), ...next, ...lines.slice(j)];
    changed.push(seg.id);
  }
  return { md: lines.join(eol), changed };
}

export const DIRTY_LINE = '分鏡表有改動還沒套回，動畫分鏡這次沒更新';

// 工具寫完 storyboard.md 馬上記：at 不能比檔的修改時間早（status.mjs 用 at ≥ mtime 判斷「套過了」；Date.now() 是整數毫秒，mtime 有小數，同一毫秒寫完會差一點點）
export function recordWritten(P, text) {
  let m = 0;
  try { m = fs.statSync(sbFileOf(P)).mtimeMs; } catch { /* 沒有檔就用現在 */ }
  recordStoryboard(P, text, { at: Math.ceil(Math.max(Date.now(), m)) });
}

// write(md)：怎麼寫回（預設 writeAtomic＋recordWritten，status.mjs 才不會以為又回到 ③；versions 傳自己的 markStoryboard）
// seed: false＝不建鏡位腳本（versions：退回的版本沒有鏡位腳本就照原樣，不然版本的雜湊會變）
export function refreshStoryboard(P, plan, { lib, only = null, write = null, force = false, seed = true } = {}) {
  const file = sbFileOf(P);
  if (!fs.existsSync(file) || !Array.isArray(plan?.scenes)) return { changed: [], skipped: 'none', line: null };
  if (!force && storyboardDirty(P)) return { changed: [], skipped: 'dirty', line: DIRTY_LINE };
  const md = fs.readFileSync(file, 'utf8');
  const r = refreshBeatTables(md, plan.scenes, (seg) => beatBlock(P, seg, { lib, seed, sbText: md }), { only });
  if (r.md !== md) (write || ((t) => { writeAtomic(file, t); recordWritten(P, t); }))(r.md);
  return { changed: r.changed, skipped: null, line: r.changed.length ? `分鏡表的動畫分鏡跟著正本更新：${r.changed.join('、')}` : null };
}

// ---------- build：照 owner 設 __sheet ----------

// materializeFills 之後呼叫：owner plan 的 __sheet 就是 materializeFills 照 slots 算的；owner script 換成鏡位腳本那張（手改段沒有就建）。
// prune（正式 build，不是 --check）：owner plan 的段還留著 work/designs/<段>.md＝動畫檔回到工具產生了（刪掉手改的檔重 build、退回沒手改的版），
// 搬到 .old/，不然下次手改會沿用過期的表。--check 不搬（子代理的 audit 也跑 --check，不能動別段的檔）
export function attachBeats({ plan, P, lib, prune = false }) {
  const notes = [];
  let sb = null;
  const sbText = () => (sb ??= readOpt(sbFileOf(P)));
  for (const seg of Array.isArray(plan?.scenes) ? plan.scenes : []) {
    if (!isCustom(seg)) continue;
    const own = beatOwnerOf(P, seg, { lib });
    def(seg, '__beatOwner', own.owner);
    if (own.owner === 'plan') {
      if (prune && fs.existsSync(scriptFileOf(P, seg.id))) notes.push(`${seg.id} 的動畫檔回到照 plan.json 產生：舊的拍點表搬到 ${retireScript(P, seg.id)}`);
      continue;
    }
    if (own.owner !== 'script') continue;
    const s = beatSourceOf(P, seg, { lib, seed: true, sbText: sbText() });
    def(seg, '__sheet', s.md || undefined);
    if (s.seeded) { notes.push(s.seeded); def(seg, '__beatNote', s.seeded); }
  }
  return { notes };
}

// ---------- 比對兩張表 ----------

const fmtOff = (off) => (off ? `${off > 0 ? '+' : '−'}${Math.abs(off)}` : '');
export const refList = (sheet) => (sheet?.rows || []).filter((r) => !r.note).flatMap((r) => r.refs.map((x) => `${x.ref}${fmtOff(x.off)}`));
export const promisedOf = (md, id) => refList(parseBeatSheets(md).get(id));
const said = (r) => String(r.said || '').replace(/[`\s]/g, '');
const sameShape = (a, b) => !!a && !!b && a.rows.length === b.rows.length && a.rows.every((r, i) => said(r) === said(b.rows[i]));
const rowText = (r) => [r.beat, said(r), r.what, (r.moves || []).join('、'), r.focus, r.sfx, r.illus ?? '', r.pos ?? ''].map((x) => String(x ?? '').replace(/\s+/g, ''));
const sameSheet = (a, b) => sameShape(a, b) && a.rows.every((r, i) => JSON.stringify(rowText(r)) === JSON.stringify(rowText(b.rows[i])));
function refDiff(a, b) {
  const x = refList(a), y = refList(b);
  if (JSON.stringify(x) === JSON.stringify(y)) return null;
  const da = [], db = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) { if (x[i]) da.push(x[i]); if (y[i]) db.push(y[i]); }
  return { a: da, b: db };
}
// 綁詞寫在 slots 的哪個欄位（⚠ 訊息要說改哪裡）：openAt、items[2].at、beats[1].at
function slotPathOf(slots, ref) {
  const hit = [];
  const walk = (v, p) => {
    if (typeof v === 'string') { if (v === ref) hit.push(p); return; }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
  };
  walk(slots || {}, '');
  return hit[0] || null;
}

// 把 storyboard.md 那段（或改版提案 分鏡.md 那段）的表整張寫進鏡位腳本（舊的先備份到 .old/，回傳備份檔）；鏡位腳本裡沒有表就接在最後
export function writeWholeTable(P, id, sbBlock) {
  const f = scriptFileOf(P, id), text = readOpt(f);
  let backup = null;
  if (text) {
    const dir = path.join(designsDirOf(P), '.old');
    fs.mkdirSync(dir, { recursive: true });
    backup = path.join(dir, `${id}-${stampOf()}.md`);
    for (let k = 2; fs.existsSync(backup); k++) backup = path.join(dir, `${id}-${stampOf()}-${k}.md`);
    fs.copyFileSync(f, backup);
  }
  const lines = text ? text.split(/\r?\n/) : [];
  const next = text ? swapBlocks(lines, id, sbBlock).join(text.includes('\r\n') ? '\r\n' : '\n') : `${sbBlock.trim()}\n`;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  writeAtomic(f, next);
  return backup;
}

// --apply-storyboard：分鏡表上改到的動畫分鏡寫回正本（032 B6 §4.4）。before＝套回前的 plan（分鏡表是照它產生的），after＝套回後
//   owner script：列數、「講到」都一樣 → 只把「畫面上出現什麼」不同的格子寫回鏡位腳本同一格；其他地方也不同（主代理手改）→ 整張收進鏡位腳本
//   owner plan：不收（拍是 slots 產生的）。分鏡表在上次產生後被改過才 ⚠：字不同叫他在「畫面文字」改；拍不同列出兩邊的綁詞
// skip：這次才勾成內容設計動畫的段（分鏡表上那張是模板的拍，不是正本）
export function applyBeatEdits(P, md, before, after, { lib, skip = [] } = {}) {
  const changes = [], warnings = [];
  const sheets = parseBeatSheets(md), dirty = storyboardDirty(P);
  const was = new Map((before?.scenes || []).filter(isCustom).map((s) => [s.id, s]));
  for (const seg of (after?.scenes || []).filter(isCustom)) {
    const sb = sheets.get(seg.id);
    if (!sb || skip.includes(seg.id)) continue;
    const own = beatOwnerOf(P, seg, { lib });
    if (own.owner === 'script') {
      const f = scriptFileOf(P, seg.id), text = readOpt(f), d = text ? parseBeatSheets(text).get(seg.id) : null;
      if (d && sameSheet(d, sb)) continue;
      const cellsOnly = d && sameShape(d, sb) && sb.rows.every((r, i) => { const x = rowText(r), y = rowText(d.rows[i]); return x.every((v, k) => k === 2 || v === y[k]); });
      if (cellsOnly) {
        let t = text;
        sb.rows.forEach((r, i) => {
          const dr = d.rows[i];
          if (String(r.what).trim() === String(dr.what).trim()) return;
          t = applyStoryboardEdit(t, { op: 'cell', line: dr.line - 1, col: 2, text: r.what });
          changes.push(`${seg.id} 動畫分鏡第 ${dr.beat} 拍「${dr.what}」→「${r.what}」（寫回 ${scriptRel(seg.id)}）`);
        });
        if (t !== text) writeAtomic(f, t);
        continue;
      }
      writeWholeTable(P, seg.id, beatBlocksOf(md, seg.id));
      changes.push(`${seg.id} 整張動畫分鏡寫回 ${scriptRel(seg.id)}`);
      continue;
    }
    if (own.owner !== 'plan' || !dirty) continue;
    const old = was.get(seg.id) || seg;
    const gm = sheetOfSpec(specOf(libOf(P, lib), old.template), old), g = gm ? parseBeatSheets(gm).get(seg.id) : null;
    if (!g || sameSheet(g, sb)) continue;
    if (sameShape(g, sb)) { warnings.push(warn(`${seg.id} 的動畫分鏡照 plan.json 產生，表上改的字不會生效`, '要改字在「畫面文字」那一行改')); continue; }
    const pairs = [];
    for (let i = 0; i < Math.max(sb.rows.length, g.rows.length); i++) {
      const x = sb.rows[i], y = g.rows[i];
      if (x && y && said(x) === said(y)) continue;
      pairs.push(`第 ${(x || y).beat} 拍 ${x ? refList({ rows: [x] })[0] || x.said || '—' : '—'}（表）／${y ? refList({ rows: [y] })[0] || y.said || '—' : '—'}（slots）`);
    }
    const ref = pairs.length ? (refList({ rows: [g.rows.find((y, i) => !sb.rows[i] || said(sb.rows[i]) !== said(y)) || g.rows[0]] })[0]) : null;
    const key = (ref && slotPathOf(old.slots, ref.replace(/[+−].*$/, ''))) || '綁詞';
    warnings.push(warn(`${seg.id} 的動畫分鏡是照 plan.json 的 slots 產生的，表上手改的拍不會生效：${pairs.slice(0, 4).join('；')}${pairs.length > 4 ? `…共 ${pairs.length} 拍` : ''}`,
      `改 plan.json 這段 slots 的 ${key}，再跑 build.mjs --storyboard --only ${seg.id}`));
  }
  return { changes, warnings };
}

// ---------- 舊專案遷移（032 B6 §4.8） ----------

// 每個 custom 段：owner plan 的表和 slots 不同只印一行（不寫檔）；手改模板段、手寫 src 段沒有鏡位腳本就建（表抄 storyboard.md）；
// 內容設計動畫 storyboard.md 那張比 designs 新又不同，照 022 的規則讓 storyboard.md 那張贏最後一次（舊的備份 .old/）；沒有 designs 就建。
// 只動 work/designs/，不寫 storyboard.md（③ 待回覆、使用者正在網頁改的專案不受影響）
export function migrateBeats(P, { lib, dryRun = false } = {}) {
  const plan = readJson(P.plan), lines = [], moved = [];
  if (!Array.isArray(plan?.scenes)) return { lines, moved };
  const sbFile = sbFileOf(P), sbText = readOpt(sbFile), sheets = parseBeatSheets(sbText);
  const sbTime = sbText ? fs.statSync(sbFile).mtimeMs : 0;
  const L = typeof lib === 'function' ? lib() : lib;
  for (const seg of plan.scenes.filter(isCustom)) {
    const own = beatOwnerOf(P, seg, { lib: L }), sb = sheets.get(seg.id), f = scriptFileOf(P, seg.id), has = fs.existsSync(f);
    if (own.owner === 'plan') {
      const gm = sb && sheetOfSpec(specOf(libOf(P, L), seg.template), seg), g = gm ? parseBeatSheets(gm).get(seg.id) : null;
      const d = g && refDiff(sb, g);
      if (d) lines.push(`${seg.id}：分鏡表的拍（${d.a.join('、') || '—'}）和 plan.json（${d.b.join('、') || '—'}）不同，之後以 plan.json 為準，分鏡表下次產生時更新`);
      continue;
    }
    if (own.owner !== 'script' || (has && own.why !== 'design')) continue;
    if (own.why === 'hand' || own.why === 'src') {
      if (own.why === 'src' && !sb) continue;   // 沒表的手寫 src 段照舊報「沒有動畫分鏡」
      if (dryRun) { lines.push(`${seg.id}：會建 ${scriptRel(seg.id)}（${sb ? '表抄分鏡表那張' : '表照 plan.json 的 slots'}）`); continue; }
      const note = seedScript(P, seg, { lib: L, sbText });
      if (note) { lines.push(note); moved.push(seg.id); }
      continue;
    }
    if (!sb) continue;
    const block = beatBlocksOf(sbText, seg.id);
    if (!has) {
      if (dryRun) { lines.push(`${seg.id}：會建 ${scriptRel(seg.id)}（表抄分鏡表那張）`); continue; }
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, `概念：${String(seg.story?.idea || '').replace(/\s*\n\s*/g, ' ') || '（還沒寫）'}\n\n${block}\n`);
      lines.push(`${seg.id}：建 ${scriptRel(seg.id)}（表抄分鏡表那張；之後拍點改這份）`);
      moved.push(seg.id);
      continue;
    }
    const d = parseBeatSheets(readOpt(f)).get(seg.id);
    if ((d && sameSheet(d, sb)) || fs.statSync(f).mtimeMs >= sbTime) continue;
    if (dryRun) { lines.push(`${seg.id}：分鏡表那張比 ${scriptRel(seg.id)} 新，會寫進鏡位腳本（舊的備份到 work/designs/.old/）`); continue; }
    const bak = writeWholeTable(P, seg.id, block);
    lines.push(`${seg.id}：分鏡表那張比鏡位腳本新，寫進 ${scriptRel(seg.id)}（舊的備份在 ${path.relative(path.dirname(workDirOf(P)), bak).split(path.sep).join('/')}）`);
    moved.push(seg.id);
  }
  return { lines, moved };
}

export const beatsMarkOf = (P) => path.join(P.out, '.cache', 'beats-v2.json');
// 每個專案自動跑一次（build、audit、versions 開頭呼叫）；lib 可以是函式（標記在就不用載）
export function ensureBeatsV2(P, { lib } = {}) {
  if (!P?.out || !P.plan) return { ran: false, lines: [] };
  const mark = beatsMarkOf(P);
  if (fs.existsSync(mark) || !fs.existsSync(P.plan)) return { ran: false, lines: [] };
  let r;
  try { r = migrateBeats(P, { lib }); } catch (e) { return { ran: false, lines: [warn(`拍點正本的遷移沒做完：${e.message}`, '下次跑 build 會再試；要手動看就跑 build.mjs --migrate-beats --dry-run')] }; }
  try { fs.mkdirSync(path.dirname(mark), { recursive: true }); fs.writeFileSync(mark, `${JSON.stringify({ at: new Date().toISOString(), moved: r.moved })}\n`); } catch { /* 記不下來：下次再跑一次，結果一樣 */ }
  return { ran: true, lines: r.lines };
}

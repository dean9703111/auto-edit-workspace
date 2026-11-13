// work/製作進度.md 的讀寫（工具自己記，不用 AI 手動 Read＋Edit）。零依賴。
//   progressFile(project)                    → 路徑
//   ensureProgress(project, facts = {})      → 沒有檔就建；回傳 { file, created }。facts：開工決策表的值（見 FACT_ROWS）
//   setFact(project, name, value)            → 改開工決策表某一欄的值（欄不存在就加一列）
//   appendStop(project, { stop, state, said, back, when }) → 停點紀錄加一列（時間由工具蓋，不用 AI 查）；回傳那一列
//                                            同一個停點的最後一列已經是同一個狀態、這次又沒帶 said：不重複加，回傳原本那一列
//   lastStopOf(project, stop)                → 這個停點（含「③ 分鏡表（s12 v2）」這種改版）最後一列 { label, state }；沒有回 null
//   appendRound(project, { round, file, segs, backup, when })  → 回饋輪加一列
//   formatStamp(date)                        → 'YYYY-MM-DD HH:MM'
//
// 步驟標記（032 C10）：工具做完一步就記在 work/.jobs/state.json，status.mjs 照它判斷做到哪，不再靠「備份檔在不在」「誰的修改時間比較新」
// （複製專案、雲端同步之後修改時間會亂）。格式 { version: 1, steps: { <步驟>: { at, inputs: { <相對路徑>: <內容指紋|null> }, …info } } }
//   markStep(project, step, info = {})       → 記這一步做完了（同一步再記就蓋掉）；inputs 照 STEP_INPUTS 自己算指紋（info.inputs 給相對路徑陣列就用它），
//                                            info 其他欄照存（例 map-merge 的 { passed }）；回傳那一筆
//   readSteps(project)                       → { version, steps }；沒有檔、壞掉、版本不對回 null（＝舊專案，status 照舊推）
//   stepChanged(project, rec, rel)           → rec（readSteps().steps 的一筆）記的 rel 和現在不一樣：true／false；rec 沒記 rel 回 null
//   fileSig(project, rel)                    → 檔案內容的指紋（大檔只讀頭尾各 1 MB＋大小）；沒有這個檔回 null
//   STEP_INPUTS                              → 每一步記哪幾個檔（步驟名就是各工具要傳的 step）
import fs from 'node:fs';
import crypto from 'node:crypto';
import { writeAtomic } from './atomic.mjs';
import path from 'node:path';

export const FACT_ROWS = ['主軌種類', '版式', '有沒有講稿', '有沒有螢幕錄影／圖片', '長度（秒）', '有沒有業配段', '構圖'];
export const STOP_STATES = ['待回覆', '通過', '修改後重停', '略過'];
const pad = (n) => String(n).padStart(2, '0');
export const formatStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const progressFile = (project) => path.join(project, 'work', '製作進度.md');
const cellOf = (s) => String(s ?? '').replace(/\|/g, '｜').replace(/\r?\n/g, ' ').trim();

function skeleton(project, facts = {}) {
  const rows = FACT_ROWS.map((k) => `| ${k} | ${cellOf(facts[k] ?? '')} |`).join('\n');
  return `# 製作進度：${path.basename(project)}

<!-- 工具維護（status.mjs --mark、media.mjs prep…）；標題不要改：status.mjs 讀「## 停點紀錄」那張表。 -->

## 開工決策表

| 欄 | 值 |
|---|---|
${rows}

## 停點紀錄

| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |
|---|---|---|---|---|

## 回饋輪

| 輪 | 時間 | 檔案 | 改了哪幾段 | 備份 |
|---|---|---|---|---|
`;
}

export function ensureProgress(project, facts = {}) {
  const file = progressFile(project);
  if (fs.existsSync(file)) {
    for (const [k, v] of Object.entries(facts)) if (v != null && v !== '') setFact(project, k, v, { onlyEmpty: true });
    return { file, created: false };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, skeleton(project, facts));
  return { file, created: true };
}

// 找某一節底下的第一張表：回傳 { lines, nl, head（表頭行號）, cols, end（最後一列行號）}；找不到回傳 null
function tableOf(text, title) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^##\\s*${title}\\s*$`).test(l.trim()));
  if (at < 0) return null;
  let head = at + 1;
  while (head < lines.length && !lines[head].trim().startsWith('|')) { if (/^##\s/.test(lines[head])) return null; head++; }
  if (head + 1 >= lines.length) return null;
  const cols = lines[head].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  let end = head + 1;
  while (end + 1 < lines.length && lines[end + 1].trim().startsWith('|')) end++;
  return { lines, nl, head, cols, end };
}

export function setFact(project, name, value, { onlyEmpty = false } = {}) {
  const file = progressFile(project);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return false; }
  const t = tableOf(text, '開工決策表');
  if (!t) return false;
  const iK = t.cols.findIndex((c) => c === '欄'), iV = t.cols.findIndex((c) => c === '值');
  if (iK < 0 || iV < 0) return false;
  for (let i = t.head + 2; i <= t.end; i++) {
    const cells = t.lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells[iK] !== name) continue;
    if (onlyEmpty && cells[iV] && !/^待/.test(cells[iV])) return false;
    cells[iV] = cellOf(value);
    t.lines[i] = `| ${cells.join(' | ')} |`;
    writeAtomic(file, t.lines.join(t.nl));
    return true;
  }
  const cells = t.cols.map(() => '');
  cells[iK] = name; cells[iV] = cellOf(value);
  t.lines.splice(t.end + 1, 0, `| ${cells.join(' | ')} |`);
  writeAtomic(file, t.lines.join(t.nl));
  return true;
}

const rowCells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
// 停點紀錄表裡、停點欄以 stop 開頭的最後一列（「③ 分鏡表」也認「③ 分鏡表（s12 v2）」；「⑥ 背景預覽」不會認到「⑥ 配樂試聽」）
function lastRowOf(t, stop) {
  const iS = t.cols.findIndex((c) => c.includes('停點')), iV = t.cols.findIndex((c) => c.includes('狀態'));
  if (iS < 0 || iV < 0) return null;
  const want = cellOf(stop);
  for (let i = t.end; i >= t.head + 2; i--) {
    const c = rowCells(t.lines[i]);
    if (String(c[iS] || '').startsWith(want)) return { label: c[iS], state: c[iV], line: t.lines[i] };
  }
  return null;
}

export function lastStopOf(project, stop) {
  let text;
  try { text = fs.readFileSync(progressFile(project), 'utf8'); } catch { return null; }
  const t = tableOf(text, '停點紀錄');
  const r = t && lastRowOf(t, stop);
  return r ? { label: r.label, state: r.state } : null;
}

export function appendStop(project, { stop, state, said = '', back = '', when = new Date() }) {
  if (!STOP_STATES.includes(state)) throw new Error(`停點狀態只能是 ${STOP_STATES.join('、')}，現在是「${state}」`);
  if (!stop) throw new Error('要寫是哪一個停點（例 ① 剪輯清單）');
  ensureProgress(project);
  const file = progressFile(project);
  const text = fs.readFileSync(file, 'utf8');
  const t = tableOf(text, '停點紀錄');
  if (!t) throw new Error(`${file} 找不到「## 停點紀錄」那張表 → 把表頭補回去：| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |`);
  // 同一條指令重跑（例 --storyboard 改完再截一次）不要一直疊「待回覆」：最後一列已經是這個停點、這個狀態，又沒有新的原話，就不加
  const last = said ? null : lastRowOf(t, stop);
  if (last && last.label === cellOf(stop) && last.state === state) return last.line;
  const iT = t.cols.findIndex((c) => c.includes('時間')), iS = t.cols.findIndex((c) => c.includes('停點')), iV = t.cols.findIndex((c) => c.includes('狀態'));
  const iSay = t.cols.findIndex((c) => c.includes('原話')), iBack = t.cols.findIndex((c) => c.includes('寫回'));
  const cells = t.cols.map(() => '—');
  cells[iT] = formatStamp(when); cells[iS] = cellOf(stop); cells[iV] = state;
  if (iSay >= 0 && said) { const s = cellOf(said); cells[iSay] = `「${s.length > 40 ? `${s.slice(0, 40)}…` : s}」`; }
  if (iBack >= 0 && back) cells[iBack] = cellOf(back);
  const row = `| ${cells.join(' | ')} |`;
  t.lines.splice(t.end + 1, 0, row);
  writeAtomic(file, t.lines.join(t.nl));
  return row;
}

// ---------- 步驟標記（work/.jobs/state.json）----------
export const STEPS_VERSION = 1;
export const stepsFile = (project) => path.join(project, 'work', '.jobs', 'state.json');
const draftFiles = (project, re) => { try { return fs.readdirSync(path.join(project, 'work', 'drafts')).filter((f) => re.test(f)).sort().map((f) => `work/drafts/${f}`); } catch { return []; } };
// 每一步記哪幾個檔：status 拿現在的內容和記下來的比，對不上＝那個檔在這一步之後改過（這一步要重做）
export const STEP_INPUTS = {
  'srt-align': () => ['work/rough.srt'],                          // media.mjs srt-align 寫回 rough.srt 之後
  'snap-srt': () => ['work/rough.srt'],                           // media.mjs snap-srt 寫回 rough.srt 之後
  'screen-sync': () => ['work/cuts.v1.json'],                     // media.mjs screen-sync 寫完 screen-sync.json：初剪重做（cuts.v1.json 變了）就要重算
  'map-merge': (p) => draftFiles(p, /\.map\.md$/),                // build.mjs --map-merge（info 帶 { passed }）：哪一份地圖改過就要重新校正
  'merge-drafts': (p) => draftFiles(p, /^[^_.].*\.json$/),        // build.mjs --merge-drafts：哪一份草稿改過就要重新合併
  storyboard: () => ['work/hyperframes/plan.json', 'work/storyboard.md'],   // build.mjs --storyboard 寫完 storyboard.md
  'apply-storyboard': () => ['work/storyboard.md'],               // build.mjs --apply-storyboard 真的套回 plan.json（記 ③ 通過）時；之後有沒有人改過，status 看 storyboard-state 的雜湊（工具照正本重寫的不算）
  build: () => ['work/hyperframes/plan.json'],                    // build 寫完 index.html（一般 build、--storyboard、--review）：plan.json 之後改過＝要重 build
  qc: () => ['output/final.mp4'],                                 // deliver.mjs／qc.mjs final 寫完 qc-sheet.jpg：final.mp4 之後換過＝要重新驗收
};
const BIG = 4 * 1024 * 1024, EDGE = 1024 * 1024;
export function fileSig(project, rel) {
  const f = path.join(project, ...rel.split('/'));
  let st;
  try { st = fs.statSync(f); } catch { return null; }
  if (!st.isFile()) return null;
  const h = crypto.createHash('sha1');
  if (st.size <= BIG) { h.update(fs.readFileSync(f)); return `sha1:${h.digest('hex')}`; }
  // 大檔（完成影片）：整支讀太慢，讀頭尾各 1 MB＋大小；重新 render 一定會變
  const fd = fs.openSync(f, 'r');
  try {
    const buf = Buffer.alloc(EDGE);
    for (const at of [0, st.size - EDGE]) { const n = fs.readSync(fd, buf, 0, EDGE, at); h.update(buf.subarray(0, n)); }
  } finally { fs.closeSync(fd); }
  return `edge:${st.size}:${h.digest('hex')}`;
}
export function readSteps(project) {
  try {
    const s = JSON.parse(fs.readFileSync(stepsFile(project), 'utf8'));
    return s && s.version === STEPS_VERSION && s.steps && typeof s.steps === 'object' && !Array.isArray(s.steps) ? s : null;
  } catch { return null; }
}
export function markStep(project, step, info = {}) {
  if (!step || typeof step !== 'string') throw new Error('markStep 要寫是哪一步（例 \'build\'）');
  const { inputs, ...rest } = info || {};
  const rels = Array.isArray(inputs) ? inputs : (STEP_INPUTS[step]?.(project) ?? []);
  const rec = { at: new Date().toISOString(), inputs: Object.fromEntries(rels.map((r) => [r, fileSig(project, r)])), ...rest };
  const cur = readSteps(project) || { version: STEPS_VERSION, steps: {} };
  cur.steps[step] = rec;
  fs.mkdirSync(path.dirname(stepsFile(project)), { recursive: true });
  writeAtomic(stepsFile(project), `${JSON.stringify(cur, null, 2)}\n`);
  return rec;
}
export function stepChanged(project, rec, rel) {
  if (!rec?.inputs || !Object.hasOwn(rec.inputs, rel)) return null;
  return fileSig(project, rel) !== rec.inputs[rel];
}

export function appendRound(project, { round, file: f = '', segs = '', backup = '', when = new Date() }) {
  ensureProgress(project);
  const file = progressFile(project);
  const text = fs.readFileSync(file, 'utf8');
  const t = tableOf(text, '回饋輪');
  if (!t) return null;
  const row = `| ${cellOf(round)} | ${formatStamp(when)} | ${cellOf(f)} | ${cellOf(segs)} | ${cellOf(backup)} |`;
  t.lines.splice(t.end + 1, 0, row);
  writeAtomic(file, t.lines.join(t.nl));
  return row;
}

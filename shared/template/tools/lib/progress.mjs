// work/製作進度.md 的讀寫（工具自己記，不用 AI 手動 Read＋Edit）。零依賴。
//   progressFile(project)                    → 路徑
//   ensureProgress(project, facts = {})      → 沒有檔就建；回傳 { file, created }。facts：開工決策表的值（見 FACT_ROWS）
//   setFact(project, name, value)            → 改開工決策表某一欄的值（欄不存在就加一列）
//   appendStop(project, { stop, state, said, back, when }) → 停點紀錄加一列（時間由工具蓋，不用 AI 查）；回傳那一列
//   appendRound(project, { round, file, segs, backup, when })  → 回饋輪加一列
//   formatStamp(date)                        → 'YYYY-MM-DD HH:MM'
import fs from 'node:fs';
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

export function appendStop(project, { stop, state, said = '', back = '', when = new Date() }) {
  if (!STOP_STATES.includes(state)) throw new Error(`停點狀態只能是 ${STOP_STATES.join('、')}，現在是「${state}」`);
  if (!stop) throw new Error('要寫是哪一個停點（例 ① 剪輯清單）');
  ensureProgress(project);
  const file = progressFile(project);
  const text = fs.readFileSync(file, 'utf8');
  const t = tableOf(text, '停點紀錄');
  if (!t) throw new Error(`${file} 找不到「## 停點紀錄」那張表 → 把表頭補回去：| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |`);
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

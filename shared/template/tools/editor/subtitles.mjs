// 字幕的修改、新增、分割、合併、刪除，以及 plan.json 句號重新對應（純函式，沒有 I/O；剪輯頁面與 server 共用這一份）
//
// 時間寫法含 "#N@詞"（詞在第 N 句的位置；規則同 lib/time.mjs，找詞與字數算法放在 text.mjs 兩邊對照測試）
//
// 字幕 cue：{ n, start, end, text, src? }（n＝句號；src＝原檔第幾個區塊，寫回時沒改的句子原封不動）
// 操作 op（照順序重播；n／after 是「做這一步的當下」的句號）：
//   { op: 'set',    n, start?, end?, text? }     改文字／起訖時間（句號不變）
//   { op: 'split',  n, at, pos? }                在 at 秒、文字第 pos 個字的地方切成兩句（pos 不寫＝照時間比例找最近的標點）
//   { op: 'insert', after, start, end, text }    在第 after 句後面新增一句（after＝0：放在最前面）；只能放在 ≥ 0.5 秒的空檔
//   { op: 'merge',  n }                          第 n 句和第 n+1 句合成一句
//   { op: 'delete', n, bind? }                   刪掉第 n 句；plan.json 有時間綁到它時 bind 要是 'prev'（改綁前一句）或 'next'（改綁後一句）
//
// 句號重新對應（契約第 5 節）：句數一變就把字幕重新編號 1…N，plan.json 的時間欄位（任何物件的 from／to／at／until、
// beats 的值、清單項目的 at，含「#N±秒」）照新句號改寫；slots／vars 的文字一律不動。
//   分割第 k 句：#k 不變、#ke → #(k+1)e、> k 的 +1
//   在第 k 句後新增：> k 的 +1
//   合併 k、k+1：#(k+1) → #k+（k+1 起點 − k 起點）、#ke → #k+（k 結尾 − k 起點）、#(k+1)e → #ke、> k+1 的 −1
//   刪除第 k 句：#k／#ke 改綁 #(k−1)／#(k−1)e（前一句）或原本的 #(k+1)／#(k+1)e（後一句），> k 的 −1
// 起點那句的 anchor 本來對得上、改完對不上了 → 換成新起點那句的開頭幾個字。

import { findKw, textWidth } from './text.mjs';

export const RULES = Object.freeze({ minGap: 0.5, minHalf: 0.3, minCue: 0.3, capMax: 18 });
const EPS = 0.0005;
const r3 = (n) => Math.round(n * 1000) / 1000;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const STRUCT = new Set(['split', 'insert', 'merge', 'delete']);

// ---------- 時間寫法 ----------

const REF = /^#(\d+)(e?)\s*(?:([+-])\s*(\d+(?:\.\d+)?))?$/;
const REF_KW = /^#(\d+)(e?)@(.+)$/;   // "#12@詞"、"#12e@詞"、"#12@詞+0.2"（規則同 lib/time.mjs）
export function parseRef(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(REF_KW);
  if (m) {
    const tail = m[3].trim();
    const o = tail.match(/^(.+?)\s*([+-])\s*(\d+(?:\.\d+)?)$/);
    if (!tail) return null;
    return { n: Number(m[1]), end: m[2] === 'e', off: o ? (o[2] === '-' ? -1 : 1) * Number(o[3]) : 0, off0: o ? (o[2] === '-' ? -1 : 1) * Number(o[3]) : 0, kw: o ? o[1] : tail, kwFull: tail };
  }
  m = s.match(REF);
  return m ? { n: Number(m[1]), end: m[2] === 'e', off: m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0 } : null;
}
export function fmtRef({ n, end, off = 0, kw, kwFull, off0 }) {
  const o = r3(off);
  if (kw != null) {
    // 秒數沒動就原樣寫回整串（詞本身有 +／- 時才不會被拆壞）
    if (kwFull != null && Math.abs(o - (off0 ?? o)) < EPS) return `#${n}${end ? 'e' : ''}@${kwFull}`;
    return `#${n}${end ? 'e' : ''}@${kw}${o ? `${o > 0 ? '+' : '-'}${String(r3(Math.abs(o)))}` : ''}`;
  }
  return `#${n}${end ? 'e' : ''}${o ? `${o > 0 ? '+' : '-'}${String(r3(Math.abs(o)))}` : ''}`;
}
const sameRef = (a, b) => a.n === b.n && a.end === b.end && Math.abs((a.off || 0) - (b.off || 0)) < EPS && a.kw === b.kw;

// "#N"、"#Ne"、"#N±秒"、"#N@詞" 或秒數 → 秒數（字幕沒有那一句、或那一句沒有這個詞回 null）
export function refTime(v, cues) {
  if (isNum(v)) return v;
  const r = parseRef(v);
  if (!r) return null;
  const c = cues.find((q) => q.n === r.n);
  if (!c) return null;
  if (r.kw != null) {
    let hit = findKw(c.text, r.kwFull), off = 0;
    if (!hit && r.kw !== r.kwFull) { hit = findKw(c.text, r.kw); off = r.off; }
    if (!hit) return null;
    const total = textWidth(c.text);
    return r3(c.start + (total > 0 ? textWidth(c.text.slice(0, hit.i + (r.end ? hit.len : 0))) / total : 0) * (c.end - c.start) + off);
  }
  return r3((r.end ? c.end : c.start) + r.off);
}

// ---------- 比對（跟 build.mjs 的 anchor 檢查同一種正規化）----------

export function norm(s) {
  return String(s).replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}
// 句子開頭幾個字（anchor 用）：斷在 3–10 字之間的第一個標點，否則取前 8 個字
export function anchorFor(text) {
  const chars = [...String(text).trim()];
  for (let i = 3; i <= Math.min(10, chars.length - 1); i++) if (/[\p{P}\s]/u.test(chars[i])) return chars.slice(0, i).join('').trim();
  return chars.slice(0, 8).join('').replace(/[\p{P}\s]+$/u, '').trim() || chars.slice(0, 8).join('');
}

// 分割的預設文字位置：照時間比例，往最近的標點後面靠（±4 字內）
export function splitPos(text, frac) {
  const chars = [...String(text)];
  if (chars.length < 2) return 1;
  const base = Math.min(chars.length - 1, Math.max(1, Math.round(chars.length * frac)));
  for (let d = 0; d <= 4; d++) {
    for (const p of [base + d, base - d]) if (p >= 1 && p <= chars.length - 1 && /[\p{P}\s]/u.test(chars[p - 1])) return p;
  }
  return base;
}
const joinText = (a, b) => (/[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? `${a} ${b}` : `${a}${b}`);

// ---------- 能不能做（按鈕停用時的原因）----------

export function gapAround(cues, after, videoDur = null) {
  const k = after === 0 ? -1 : cues.findIndex((c) => c.n === after);
  if (after !== 0 && k < 0) return null;
  const prev = cues[k] || null, next = cues[k + 1] || null;
  const lo = prev ? prev.end : 0;
  const hi = next ? next.start : isNum(videoDur) ? videoDur : lo + 5;
  return { lo: r3(lo), hi: r3(hi), gap: r3(hi - lo), prev, next };
}
export function canInsert(cues, after, videoDur = null) {
  const g = gapAround(cues, after, videoDur);
  if (!g) return { ok: false, why: `字幕沒有第 ${after} 句` };
  if (g.gap < RULES.minGap - EPS) return { ok: false, why: `${g.prev ? `第 ${g.prev.n} 句` : '開頭'}和${g.next ? `第 ${g.next.n} 句` : '結尾'}之間只有 ${g.gap.toFixed(2)} 秒空檔（要 ≥ ${RULES.minGap} 秒才能新增）`, ...g };
  return { ok: true, ...g };
}
export function canSplit(cue, at) {
  if (!cue) return { ok: false, why: '先選一句字幕' };
  if (!isNum(at) || at <= cue.start + EPS || at >= cue.end - EPS) return { ok: false, why: `播放頭不在第 ${cue.n} 句裡（把播放頭移到要切開的地方）` };
  if (at - cue.start < RULES.minHalf - EPS || cue.end - at < RULES.minHalf - EPS) return { ok: false, why: `切開後有一半不到 ${RULES.minHalf} 秒（前 ${(at - cue.start).toFixed(2)} 秒、後 ${(cue.end - at).toFixed(2)} 秒）` };
  if ([...cue.text.trim()].length < 2) return { ok: false, why: '這句只有一個字，不能再切' };
  return { ok: true };
}
export function canMerge(cues, n) {
  const k = cues.findIndex((c) => c.n === n);
  if (k < 0) return { ok: false, why: `字幕沒有第 ${n} 句` };
  if (k === cues.length - 1) return { ok: false, why: '這是最後一句，後面沒有可以合併的句子' };
  return { ok: true };
}

// ---------- 單一步驟：字幕 ----------

const renumber = (list) => list.map((c, j) => (c.n === j + 1 ? c : { ...c, n: j + 1 }));
const cleanText = (s) => String(s ?? '').replace(/\s*\r?\n\s*/g, ' ').trim();

export function applyCueOp(cues, op, { videoDur = null } = {}) {
  const fail = (why) => ({ cues, error: why });
  if (!isObj(op) || typeof op.op !== 'string') return fail('字幕操作要寫成 { "op": "set|split|insert|merge|delete", … }');
  const where = (n) => `第 ${n} 句字幕`;
  if (op.op === 'insert') {
    if (!Number.isInteger(op.after) || op.after < 0) return fail('新增字幕要寫 after（放在第幾句後面，0＝最前面）');
    const g = canInsert(cues, op.after, videoDur);
    if (!g.ok) return fail(`不能新增字幕：${g.why}`);
    if (!isNum(op.start) || !isNum(op.end)) return fail('新增的字幕要有 start、end（秒數）');
    if (op.start < g.lo - EPS || op.end > g.hi + EPS) return fail(`新增的字幕 ${r3(op.start)}–${r3(op.end)} 秒會壓到前後句（空檔是 ${g.lo}–${g.hi} 秒）`);
    if (op.end - op.start < RULES.minCue - EPS) return fail(`新增的字幕至少要 ${RULES.minCue} 秒`);
    const text = cleanText(op.text);
    if (!text) return fail('新增的字幕不能是空的');
    const k = op.after === 0 ? -1 : cues.findIndex((c) => c.n === op.after);
    const list = [...cues.slice(0, k + 1), { n: 0, start: r3(op.start), end: r3(op.end), text }, ...cues.slice(k + 1)];
    return { cues: renumber(list), error: null };
  }
  const k = cues.findIndex((c) => c.n === op.n);
  if (k < 0) return fail(`字幕沒有第 ${op.n} 句`);
  const c = cues[k];
  if (op.op === 'set') {
    for (const key of Object.keys(op)) if (!['op', 'n', 'start', 'end', 'text'].includes(key)) return fail(`${where(c.n)}不能改「${key}」→ 只能改 text、start、end`);
    const start = op.start ?? c.start, end = op.end ?? c.end;
    if (!isNum(start) || !isNum(end) || start < 0) return fail(`${where(c.n)}的時間要是秒數（現在 ${start}–${end}）`);
    const timeChanged = Math.abs(start - c.start) > EPS || Math.abs(end - c.end) > EPS;
    if (timeChanged && end - start < RULES.minCue - EPS) return fail(`${where(c.n)}至少要 ${RULES.minCue} 秒（現在 ${r3(end - start)} 秒）`);
    if (end <= start) return fail(`${where(c.n)}的結束要晚於開始`);
    const prev = cues[k - 1], next = cues[k + 1];
    if (timeChanged && prev && start < prev.end - EPS) return fail(`${where(c.n)}的開始（${r3(start)}s）比上一句的結束（${prev.end}s）還早 → 字幕不能重疊`);
    if (timeChanged && next && end > next.start + EPS) return fail(`${where(c.n)}的結束（${r3(end)}s）比下一句的開始（${next.start}s）還晚 → 字幕不能重疊`);
    if (timeChanged && isNum(videoDur) && end > videoDur + 0.05) return fail(`${where(c.n)}的結束（${r3(end)}s）超過影片長度 ${videoDur}s`);
    const text = op.text === undefined ? c.text : cleanText(op.text);
    if (!text) return fail(`${where(c.n)}的文字不能是空的 → 不要的句子用「刪除」`);
    const list = cues.slice();
    list[k] = { ...c, start: r3(start), end: r3(end), text };
    return { cues: list, error: null };
  }
  if (op.op === 'split') {
    const chk = canSplit(c, op.at);
    if (!chk.ok) return fail(`不能分割${where(c.n)}：${chk.why}`);
    const chars = [...c.text];
    const pos = op.pos == null ? splitPos(c.text, (op.at - c.start) / (c.end - c.start)) : op.pos;
    if (!Number.isInteger(pos) || pos < 1 || pos > chars.length - 1) return fail(`不能分割${where(c.n)}：文字位置要在第 1–${chars.length - 1} 個字之間`);
    const a = chars.slice(0, pos).join('').trim(), b = chars.slice(pos).join('').trim();
    if (!a || !b) return fail(`不能分割${where(c.n)}：切開後有一半沒有文字`);
    const list = [...cues.slice(0, k), { n: c.n, start: c.start, end: r3(op.at), text: a }, { n: 0, start: r3(op.at), end: c.end, text: b }, ...cues.slice(k + 1)];
    return { cues: renumber(list), error: null };
  }
  if (op.op === 'merge') {
    const chk = canMerge(cues, c.n);
    if (!chk.ok) return fail(`不能合併${where(c.n)}：${chk.why}`);
    const d = cues[k + 1];
    const list = [...cues.slice(0, k), { n: c.n, start: c.start, end: d.end, text: joinText(c.text, d.text) }, ...cues.slice(k + 2)];
    return { cues: renumber(list), error: null };
  }
  if (op.op === 'delete') {
    if (cues.length <= 1) return fail('只剩一句字幕，不能刪');
    return { cues: renumber([...cues.slice(0, k), ...cues.slice(k + 1)]), error: null };
  }
  return fail(`看不懂的字幕操作「${op.op}」→ 只能是 set、split、insert、merge、delete`);
}

// ---------- 單一步驟：句號重新對應 ----------

// 一個時間 ref 在這一步之後變成什麼（cues＝這一步之前的字幕）
export function remapRef(ref, op, cues) {
  if (!STRUCT.has(op.op)) return ref;
  const idx = cues.findIndex((c) => c.n === ref.n);
  if (idx < 0) return ref;                     // 本來就對不到的句號：不動（build 會報錯）
  if (ref.kw != null) return remapKwRef(ref, op, cues, idx);
  const at = (i, end = ref.end, off = ref.off) => ({ n: i + 1, end, off });
  if (op.op === 'split') {
    const k = cues.findIndex((c) => c.n === op.n);
    if (idx === k && ref.end) return at(k + 1);
    return at(idx > k ? idx + 1 : idx);
  }
  if (op.op === 'insert') {
    const k = op.after === 0 ? -1 : cues.findIndex((c) => c.n === op.after);
    return at(idx > k ? idx + 1 : idx);
  }
  if (op.op === 'merge') {
    const k = cues.findIndex((c) => c.n === op.n);
    const a = cues[k], b = cues[k + 1];
    if (idx === k + 1) return ref.end ? at(k, true) : at(k, false, ref.off + (b.start - a.start));
    if (idx === k && ref.end) return at(k, false, ref.off + (a.end - a.start));
    return at(idx > k + 1 ? idx - 1 : idx);
  }
  // delete
  const k = cues.findIndex((c) => c.n === op.n);
  if (idx === k) return op.bind === 'prev' ? at(k - 1) : at(k);
  return at(idx > k ? idx - 1 : idx);
}

// "#N@詞" 的句號重新對應：詞跟著文字走，不是跟著時間走
//   分割第 k 句：詞在前半就留 #k、在後半改 #(k+1)；詞跨在切口上留 #k（build 找不到會報 ✖）
//   合併 k、k+1：兩句的詞都改綁 #k（合併後的原文包含兩句，詞的位置照整句重算；同一個詞前後句都有時會綁到前面那個）
//   刪除第 k 句：綁在被刪那句的詞拿掉詞，退成一般的 #k（再依 bind 綁前／後一句）
function remapKwRef(ref, op, cues, idx) {
  const keep = (i, extra = {}) => ({ ...ref, n: i + 1, ...extra });
  const k = op.op === 'insert' ? (op.after === 0 ? -1 : cues.findIndex((c) => c.n === op.after)) : cues.findIndex((c) => c.n === op.n);
  if (op.op === 'insert') return keep(idx > k ? idx + 1 : idx);
  if (op.op === 'split') {
    if (idx !== k) return keep(idx > k ? idx + 1 : idx);
    const c = cues[k], pos = op.pos ?? splitPos(c.text, (op.at - c.start) / (c.end - c.start));
    const hit = findKw(c.text, ref.kwFull) || findKw(c.text, ref.kw);
    return keep(hit && hit.i >= [...c.text].slice(0, pos).join('').length ? k + 1 : k);
  }
  if (op.op === 'merge') {
    if (idx === k + 1) return keep(k);
    return keep(idx > k + 1 ? idx - 1 : idx);
  }
  // delete
  if (idx === k) {
    const o = remapRef({ n: ref.n, end: false, off: 0 }, op, cues);
    return { n: o.n, end: ref.end, off: 0 };
  }
  return keep(idx > k ? idx - 1 : idx);
}

const TIME_KEYS = new Set(['from', 'to', 'at', 'until']);
const SKIP_KEYS = new Set(['vars', 'note', 'anchor', 'css', 'src', 'label', 'id', 'type', 'scene', 'fx', 'layout', 'sfx']);
const ATTRS_TAIL = /\s*[｜|]\s*((?:[\w.-]+=(?:"[^"]*"|\S+)\s*)+)$/;
const ATTR_AT = /(^|\s|[｜|])at=(?:"([^"]*)"|(\S+))/;   // at="#12@Claude Code"（有空格的詞要加引號）

function mapTimeValue(v, fn) {
  const r = parseRef(v);
  if (!r) return v;
  const o = fn(r);
  return !o || sameRef(o, r) ? v : fmtRef(o);
}
// 清單項目寫成字串時，at 寫在「｜at=#19」裡
function mapAttrAt(s, fn) {
  const m = String(s).match(ATTRS_TAIL);
  if (!m) return s;
  const head = s.slice(0, m.index), tail = s.slice(m.index);
  const t2 = tail.replace(ATTR_AT, (all, pre, qv, bare) => (qv !== undefined ? `${pre}at="${mapTimeValue(qv, fn)}"` : `${pre}at=${mapTimeValue(bare, fn)}`));
  return t2 === tail ? s : head + t2;
}
function mapItem(item, fn) {
  if (typeof item === 'string') return mapAttrAt(item, fn);
  if (!isObj(item)) return item;
  let out = null;
  for (const [k, v] of Object.entries(item)) {
    if (!TIME_KEYS.has(k)) continue;
    const nv = mapTimeValue(v, fn);
    if (nv !== v) { out ??= { ...item }; out[k] = nv; }
  }
  return out ?? item;
}
function mapSlots(slots, fn) {
  let out = null;
  for (const [k, v] of Object.entries(slots)) {
    let nv = v;
    if (Array.isArray(v)) { const a = v.map((x) => mapItem(x, fn)); if (a.some((x, i) => x !== v[i])) nv = a; }
    else if (isObj(v)) nv = mapItem(v, fn);             // 例如 QA 的 "a": { "text": "…", "at": "#14" }
    if (nv !== v) { out ??= { ...slots }; out[k] = nv; }  // 文字（字串）一律不動，裡面寫了「#1」也一樣
  }
  return out ?? slots;
}
function mapSeg(o, fn) {
  if (Array.isArray(o)) { const a = o.map((x) => mapSeg(x, fn)); return a.some((x, i) => x !== o[i]) ? a : o; }
  if (!isObj(o)) return o;
  let out = null;
  for (const [k, v] of Object.entries(o)) {
    let nv = v;
    if (TIME_KEYS.has(k)) nv = mapTimeValue(v, fn);
    else if (k === 'beats' && isObj(v)) {
      const b = Object.fromEntries(Object.entries(v).map(([bk, bv]) => [bk, mapTimeValue(bv, fn)]));
      nv = Object.keys(b).some((bk) => b[bk] !== v[bk]) ? b : v;
    } else if (k === 'slots' && isObj(v)) nv = mapSlots(v, fn);
    else if (SKIP_KEYS.has(k) || k === 'edit') nv = v;
    else if (v && typeof v === 'object') nv = mapSeg(v, fn);   // media 的 moves／marks／lens
    if (nv !== v) { out ??= { ...o }; out[k] = nv; }
  }
  return out ?? o;
}
// fn(ref, segId) → 新 ref（或 null＝不動）；沒變的物件原樣回傳（=== 比得出來）
export function mapPlanTimes(plan, fn) {
  if (!isObj(plan) || !Array.isArray(plan.scenes)) return plan;
  const scenes = plan.scenes.map((s) => mapSeg(s, (r) => fn(r, isObj(s) ? s.id : null)));
  return scenes.some((s, i) => s !== plan.scenes[i]) ? { ...plan, scenes } : plan;
}
export function remapPlan(plan, op, cuesBefore) {
  if (!STRUCT.has(op.op)) return plan;
  return mapPlanTimes(plan, (r) => remapRef(r, op, cuesBefore));
}
// plan.json 裡綁到第 n 句（#n、#ne、含 ±秒）的地方 → [{ id, ref }]
export function refsTo(plan, n) {
  const hits = [];
  mapPlanTimes(plan, (r, id) => { if (r.n === n) hits.push({ id, ref: fmtRef(r) }); return null; });
  return hits;
}

const startRefOf = (seg) => parseRef(seg?.from ?? seg?.at);
export function fixAnchors(planBefore, planAfter, cuesBefore, cuesAfter) {
  if (!Array.isArray(planAfter?.scenes)) return { plan: planAfter, changed: [] };
  const changed = [];
  const scenes = planAfter.scenes.map((s, i) => {
    const b = planBefore?.scenes?.[i];
    if (!isObj(s) || typeof s.anchor !== 'string' || !s.anchor.trim()) return s;
    const rb = startRefOf(b), ra = startRefOf(s);
    if (!rb || !ra) return s;
    const cb = cuesBefore.find((c) => c.n === rb.n), ca = cuesAfter.find((c) => c.n === ra.n);
    const na = norm(s.anchor);
    if (!cb || !ca || !na || !norm(cb.text).includes(na) || norm(ca.text).includes(na)) return s;
    const anchor = anchorFor(ca.text);
    if (!anchor || anchor === s.anchor) return s;
    changed.push(s.id);
    return { ...s, anchor };
  });
  return { plan: changed.length ? { ...planAfter, scenes } : planAfter, changed };
}

// ---------- 整串重播 ----------

// cues0＋plan0＋ops → { cues, plan, errors, structural, anchors }
export function replay(cues0, plan0, ops, { videoDur = null } = {}) {
  let cues = cues0, plan = plan0;
  const errors = [], anchors = new Set();
  let structural = false;
  if (!Array.isArray(ops)) return { cues, plan, errors: ['srt.ops 要是陣列'], structural, anchors: [] };
  for (const [j, op] of ops.entries()) {
    if (isObj(op) && op.op === 'delete') {
      const refs = refsTo(plan, op.n);
      const k = cues.findIndex((c) => c.n === op.n);
      if (refs.length) {
        const list = refs.map((x) => `${x.id}（${x.ref}）`).join('、');
        if (!['prev', 'next'].includes(op.bind)) { errors.push(`第 ${op.n} 句字幕有 plan.json 的時間綁著：${list} → 刪除前要選改綁到前一句（bind: "prev"）或後一句（bind: "next"）`); break; }
        if (op.bind === 'prev' && k === 0) { errors.push(`第 ${op.n} 句是第一句，沒有前一句可以改綁 → 改綁後一句`); break; }
        if (op.bind === 'next' && k === cues.length - 1) { errors.push(`第 ${op.n} 句是最後一句，沒有後一句可以改綁 → 改綁前一句`); break; }
      }
    }
    const r = applyCueOp(cues, op, { videoDur });
    if (r.error) { errors.push(ops.length > 1 ? `第 ${j + 1} 個字幕操作：${r.error}` : r.error); break; }
    let next = plan;
    if (STRUCT.has(op.op)) { structural = true; next = remapPlan(plan, op, cues); }
    const fx = fixAnchors(plan, next, cues, r.cues);
    fx.changed.forEach((id) => anchors.add(id));
    plan = fx.plan;
    cues = r.cues;
  }
  return { cues, plan, errors, structural, anchors: [...anchors] };
}

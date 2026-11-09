// 情境動畫填資料（custom-fill）：套模板不用手改 HTML。plan.json 寫 { "type": "custom", "template": "x-process", "slots": {…} }，
// build／--check 從 shared/template/custom/<模板>.html 產生 compositions/<模板>-<段 id>.html，畫面、綁句、站數都由資料決定。
// 手改過的產生檔不會被蓋掉（要重新產生就刪掉它）。零依賴。
//
// 規格檔 custom/<模板>.fill.json：
//   { "template": "x-process", "prefix": "xproc", "beat": "A", "layout": "fullscreen", "when": "什麼時候用（一句話）",
//     "slots": { "<名稱>": { "label": "…", "type": "text|number|icon|at|enum|list", "max": 10, "required": true, "with": ["<一組要一起寫的欄位>"],（number 也可以寫 min、max）
//                "const": "RING"（把 script 的 const RING = …; 換成這個值）, "ref": "T{n}"（at：換掉 Tn = P.at('…') 的句號）,
//                list：{ "min": 3, "maxItems": 4, "item": { "text": {…}, "icon": {…}, "at": { "type": "at", "ref": "T{n}" } } } } },
//     "sample": {…}（和模板原文相同的值，測試用它驗證標記沒有改到模板）,
//     "sheet": [ { "beat": "0", "at": "段起點", "show": "…{title}…", "moves": "…", "focus": "…", "sfx": "—" },
//                { "each": "items", "beat": "{n}", "at": "`{at}`", "show": "站 {n}「{text}」", … }, … ] }
//
// 模板 HTML 裡的標記（只處理 <template> 裡面；模板本身仍然可以單獨開、單獨預覽）：
//   data-fill="title"、data-fill="items.1.text"   這個元素的內容換成值（文字會跳脫；icon 換成 SVG）。元素裡不能再有同名標籤
//   行尾 // @if n>=4、<!-- @if n>=4 -->、/* @if n>=4 */   條件不成立就刪掉這一行（n＝第一個清單的項數；也可以寫清單名 items>=4、slots 名 sub、!sub，用 && 連接）
//   // @if n>=4 {  …  // @}（HTML：<!-- @if n>=4 { --> … <!-- @} -->）   整段
//   行尾 // @sub n==3: const ALL = '…';   條件成立就把整行換成冒號後面（可以用 {{title}}、{{title|json}}、{{n}}；多個條件用 @@ 隔開）
//
// 匯出：
//   listFillSpecs(customDir)、readFillSpec(customDir, name)
//   validateSlots(spec, slots, { icons }) → errors[]
//   fillTemplate({ spec, html, id, slots, icons, rename, keepIcons, illus }) → { name, file, html, errors }
//   renderSheet(spec, slots, id) → 「#### 動畫分鏡 <id>」那一節（markdown）
//   materializeFills({ plan, outDir, lib, prune }) → { errors, warnings, written }：把 plan 裡的模板段、內容設計動畫段變成檔案（會在 seg 上寫 src、layout）
//   expandIcons(html, icons) → { html, missing }：<span data-icon="名稱"></span> 填成 SVG
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { textWidth } from './time.mjs';
import { BEAT_HEADER, BEAT_HEADER_ILLUS } from './audit-beats.mjs';
import { rewriteIfSame, withLock } from './atomic.mjs';
import { iconHint } from './icon-alias.mjs';

const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

// ---------- 規格檔 ----------

export function readFillSpec(customDir, name) {
  try { return JSON.parse(fs.readFileSync(path.join(customDir, `${name}.fill.json`), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`custom/${name}.fill.json 不是合法的 JSON：${e.message}`); }
}

export function listFillSpecs(customDir) {
  let files = [];
  try { files = fs.readdirSync(customDir).filter((f) => /^x-[\w-]+\.fill\.json$/.test(f)).sort(); } catch { return []; }
  return files.map((f) => readFillSpec(customDir, f.replace(/\.fill\.json$/, ''))).filter(Boolean);
}

const firstList = (spec) => Object.entries(spec.slots || {}).find(([, d]) => d.type === 'list')?.[0] || null;

// 'items.1.text' → 值（清單的索引從 1 開始）
function valueAt(slots, p) {
  let v = slots;
  for (const k of String(p).split('.')) {
    if (v == null) return undefined;
    v = Array.isArray(v) ? v[Number(k) - 1] : v[k];
  }
  return v;
}

function declAt(spec, p) {
  const parts = String(p).split('.');
  let d = spec.slots?.[parts[0]];
  if (parts.length > 1 && d?.type === 'list') d = parts[2] ? d.item?.[parts[2]] : d.item;
  return d || null;
}

// ---------- 檢查 slots ----------

export function validateSlots(spec, slots, { icons } = {}) {
  const errors = [];
  const s = isObj(slots) ? slots : {};
  const known = Object.keys(spec.slots || {});
  for (const k of Object.keys(s)) if (!known.includes(k)) errors.push(`slots 沒有「${k}」（${spec.template} 可用：${known.join('、')}）`);
  const one = (label, d, v) => {
    if (v == null || v === '') { if (d.required) errors.push(`${label}：必填${d.label ? `（${d.label}）` : ''}`); return; }
    const t = d.type || 'text';
    if (t === 'text' || t === 'rich') {
      const w = textWidth(String(v).replace(/\*\*/g, ''));
      if (d.max != null && w > d.max) errors.push(`${label}「${v}」${w} 字，上限 ${d.max} → 縮文案，不縮字`);
    } else if (t === 'number') {
      const num = Number(v);
      if (!Number.isFinite(num)) errors.push(`${label}：要是數字，現在是「${v}」`);
      else if (d.min != null && num < d.min) errors.push(`${label}：最小 ${d.min}，現在是 ${v}`);
      else if (d.max != null && num > d.max) errors.push(`${label}：最大 ${d.max}，現在是 ${v}`);
    } else if (t === 'icon') {
      if (icons && !icons.get(String(v))) errors.push(`${label}：找不到圖示「${v}」（kit/icons.json；${iconHint(v, icons.names || [])}）`);
    } else if (t === 'at') {
      if (typeof v !== 'string' || !/^#\d+/.test(v)) errors.push(`${label}：要寫句號（#N、#N@詞），現在是「${v}」`);
    } else if (t === 'enum') {
      if (!(d.options || []).includes(v)) errors.push(`${label}：要是 ${(d.options || []).join('／')} 其中之一，現在是「${v}」`);
    }
  };
  for (const [k, d] of Object.entries(spec.slots || {})) {
    const v = s[k];
    if (d.type === 'list') {
      if (v == null) { if (d.required) errors.push(`slots.${k}：必填（${d.min ?? 1}–${d.maxItems ?? '?'} 項）`); continue; }
      if (!Array.isArray(v)) { errors.push(`slots.${k}：要寫成陣列`); continue; }
      if (d.min != null && v.length < d.min) errors.push(`slots.${k}：至少 ${d.min} 項，現在 ${v.length} 項`);
      if (d.maxItems != null && v.length > d.maxItems) errors.push(`slots.${k}：最多 ${d.maxItems} 項，現在 ${v.length} 項 → 拆成兩段，或改用別的情境`);
      v.forEach((it, i) => {
        if (!isObj(it)) { errors.push(`slots.${k}[${i}]：要是物件`); return; }
        for (const f of Object.keys(it)) if (!d.item?.[f]) errors.push(`slots.${k}[${i}] 沒有「${f}」（可用：${Object.keys(d.item || {}).join('、')}）`);
        for (const [f, fd] of Object.entries(d.item || {})) one(`slots.${k}[${i}].${f}`, fd, it[f]);
      });
    } else {
      one(`slots.${k}`, d, v);
      // with：選填的一組要一起寫（有 pill 就要有 pillAt），不然範例的舊句號會留在檔裡
      if (v != null && v !== '') for (const other of d.with || []) if (s[other] == null || s[other] === '') errors.push(`slots.${k} 有寫，slots.${other} 也要寫（兩個一組）`);
    }
  }
  return errors;
}

// ---------- 條件與替換 ----------

function evalCond(expr, ctx) {
  return String(expr).split('&&').every((raw) => {
    const c = raw.trim();
    const m = c.match(/^([\w.]+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const a = Number(ctx(m[1])), b = Number(m[3]);
      return m[2] === '>=' ? a >= b : m[2] === '<=' ? a <= b : m[2] === '==' ? a === b : m[2] === '!=' ? a !== b : m[2] === '>' ? a > b : a < b;
    }
    if (c === '1' || c === 'always') return true;
    if (c.startsWith('!')) return !ctx(c.slice(1).trim());
    return !!ctx(c);
  });
}

const TAIL = /(?:\/\/|<!--|\/\*)\s*@(if|sub)\s+(.+?)\s*(?:-->|\*\/)?\s*$/;
const OPEN = /^\s*(?:\/\/|<!--|\/\*)\s*@if\s+(.+?)\s*\{\s*(?:-->|\*\/)?\s*$/;
const CLOSE = /^\s*(?:\/\/|<!--|\/\*)\s*@\}\s*(?:-->|\*\/)?\s*$/;

function subst(text, slots, ctx) {
  return String(text).replace(/\{\{\s*([\w.]+)(?:\|(json|text))?\s*\}\}/g, (_, p, f) => {
    const v = p === 'n' ? ctx('n') : valueAt(slots, p);
    return f === 'json' ? JSON.stringify(v ?? null) : f === 'text' ? esc(v ?? '') : String(v ?? '');
  });
}

function processLines(body, slots, ctx) {
  const out = [];
  const stack = [];
  for (const line of body.split('\n')) {
    let m;
    if ((m = line.match(OPEN))) { stack.push(evalCond(m[1], ctx)); continue; }
    if (CLOSE.test(line)) { stack.pop(); continue; }
    if (stack.includes(false)) continue;
    m = line.match(TAIL);
    if (!m) { out.push(line); continue; }
    const head = line.slice(0, m.index).replace(/\s+$/, '');
    if (m[1] === 'if') { if (evalCond(m[2], ctx)) out.push(head); continue; }
    let replaced = null;
    for (const alt of m[2].split(/\s*@@\s*/)) {
      const a = alt.match(/^(.+?):\s(.*)$/);
      if (a && evalCond(a[1], ctx)) { replaced = a[2]; break; }
    }
    if (replaced == null) out.push(head);
    else out.push(`${(line.match(/^\s*/) || [''])[0]}${subst(replaced, slots, ctx)}`);
  }
  return out.join('\n');
}

function fillElements(body, spec, slots, { icons, keepIcons }, errors) {
  return body.replace(/<([a-zA-Z][\w-]*)((?:\s[^<>]*?)?)\sdata-fill="([^"]+)"([^<>]*)>([\s\S]*?)<\/\1>/g, (all, tag, a, key, b, inner) => {
    const d = declAt(spec, key);
    const open = `<${tag}${a}${b}>`;
    if (!d) { errors.push(`模板標記 data-fill="${key}" 在 ${spec.template}.fill.json 找不到對應的欄位`); return all; }
    const v = valueAt(slots, key);
    if (v == null || v === '') {
      if (d.type === 'icon' && keepIcons) return `${open}${inner}</${tag}>`;
      errors.push(`data-fill="${key}" 沒有值：選填欄位要用 @if 包住`);
      return all;
    }
    if (d.type === 'icon') {
      if (keepIcons) return `${open}${inner}</${tag}>`;
      const svg = icons?.get(String(v));
      if (!svg) return `${open}${inner}</${tag}>`;   // validateSlots 已經報過
      return `${open}${svg}</${tag}>`;
    }
    return `${open}${esc(v)}</${tag}>`;
  });
}

// 找 Tn = P.at('…') 或 Tn = P.sfx('音效', '…') 裡現在的句號
function refLiteral(body, name) {
  const re = new RegExp(`\\b${reEsc(name)}\\s*=\\s*P\\.(?:at\\(\\s*'([^']+)'|sfx\\(\\s*'[^']+'\\s*,\\s*'([^']+)')`);
  const m = body.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

function applyRefs(body, spec, slots, errors) {
  const map = new Map();
  const add = (d, v, n) => {
    if (!d?.ref || v == null) return;
    const name = d.ref.replace('{n}', n);
    const old = refLiteral(body, name);
    if (!old) { errors.push(`模板裡找不到 ${name} = P.at('…')（${spec.template}.fill.json 的 ref）`); return; }
    map.set(old, String(v));
  };
  for (const [k, d] of Object.entries(spec.slots || {})) {
    if (d.type === 'list') {
      (slots[k] || []).forEach((it, i) => { for (const [f, fd] of Object.entries(d.item || {})) if (fd.type === 'at') add(fd, it?.[f], i + 1); });
    } else if (d.type === 'at') add(d, slots[k], '');
  }
  if (!map.size) return body;
  const re = new RegExp(`'(${[...map.keys()].sort((a, b) => b.length - a.length).map(reEsc).join('|')})'`, 'g');
  return body.replace(re, (_, old) => `'${String(map.get(old)).replace(/'/g, "\\'")}'`);
}

// const NAME = <任何值>;（括號配對，可以跨行）
function replaceConst(body, name, value, errors) {
  const re = new RegExp(`\\bconst\\s+${reEsc(name)}\\s*=\\s*`);
  const m = re.exec(body);
  if (!m) { errors.push(`模板裡找不到 const ${name} = …（fill.json 的 const）`); return body; }
  let i = m.index + m[0].length, depth = 0, quote = null;
  for (; i < body.length; i++) {
    const c = body[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if ((c === ';' || c === ',' || c === '\n') && depth === 0) break;
  }
  return `${body.slice(0, m.index + m[0].length)}${JSON.stringify(value)}${body.slice(i)}`;
}

function applyConsts(body, spec, slots, errors) {
  let out = body;
  for (const [k, d] of Object.entries(spec.slots || {})) {
    if (!d.const) continue;
    let v = slots[k];
    if (v == null) continue;
    if (d.type === 'number') v = Number(v);
    if (d.type === 'list' && d.toArray) v = v.map((it) => d.toArray.map((f) => it?.[f] ?? null));
    if (d.type === 'list' && d.pluck) v = v.map((it) => it?.[d.pluck]);
    out = replaceConst(out, d.const, v, errors);
  }
  return out;
}

// ---------- 示意動畫 x-scene：元件清單與拍都是資料 ----------

const ILLUS_SMALL = { badge: [96, 96], recPill: [232, 70], bookmark: [220, 72], progress: [320, 28] };
let illusVm = null;

// 元件的原始比例：直接問 kit/illus.js（第一次載入後快取）
function illusRatio(kitDir, name, opts = {}) {
  if (!illusVm) {
    const sandbox = { document: { querySelectorAll: () => [] }, console };
    sandbox.window = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(kitDir, 'illus.js'), 'utf8'), sandbox);
    illusVm = sandbox;
  }
  const fn = illusVm.window?.ILLUS?.[name];
  if (typeof fn !== 'function') return null;
  try {
    const m = String(fn(opts)).match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  } catch { return null; }
}

export function illusNames(kitDir) {
  illusRatio(kitDir, 'phone');
  return Object.keys(illusVm?.window?.ILLUS || {}).filter((k) => !['textWidth', 'register', 'mount'].includes(k));
}

const even8 = (v) => Math.max(8, Math.round(v / 8) * 8);
const even2 = (v) => Math.max(2, Math.round(v / 2) * 2);

// 元件大小：照「主角是圖」的規則（style.md「示意動畫」、x-scene 檔頭）：一列幾個主角就有多寬；不用模型自己算
function partSize(part, { mains, twoRows }, kitDir) {
  if (part.w && part.h) return [part.w, part.h];
  if (ILLUS_SMALL[part.illus]) return ILLUS_SMALL[part.illus];
  const ratio = part.illus ? illusRatio(kitDir, part.illus, part.opts || {}) : null;
  const [rw, rh] = ratio || [part.w || 220, part.h || 160];
  const maxW = mains <= 1 ? 560 : mains === 2 ? 420 : mains === 3 ? 272 : 208;   // 內容區 1176 扣掉間距與左右內距 48
  const maxH = twoRows ? 300 : 420;   // 內容區 580 扣掉上下內距 80、標籤 48
  const s = Math.min(maxW / rw, maxH / rh);
  return [even8(rw * s), even2(rh * s)];
}

function flatParts(parts, out = []) {
  for (const p of parts || []) { if (Array.isArray(p.parts)) flatParts(p.parts, out); else out.push(p); }
  return out;
}

export function validateScene(slots, { kitDir, icons, outDir } = {}) {
  const errors = [];
  const s = isObj(slots) ? slots : {};
  if (!s.title) errors.push('slots.title：必填（標題，≤ 10 字）');
  else if (textWidth(s.title) > 10) errors.push(`slots.title「${s.title}」${textWidth(s.title)} 字，上限 10 → 縮文案`);
  if (!Array.isArray(s.parts) || !s.parts.length) errors.push('slots.parts：至少一個元件（例 { "id": "phone", "illus": "phone", "opts": { "screen": "blank" }, "label": "手機" }）');
  if (!Array.isArray(s.beats) || !s.beats.length) errors.push('slots.beats：至少一拍（例 { "at": "#12@手機", "in": ["phone"], "focus": "phone" }）');
  if (errors.length) return errors;
  const parts = flatParts(s.parts), ids = new Set();
  const names = kitDir ? illusNames(kitDir) : null;
  for (const p of parts) {
    if (!p.id || !/^[a-zA-Z][\w]*$/.test(p.id)) errors.push(`parts：id 要是英文開頭的英數字，現在是「${p.id}」`);
    if (ids.has(p.id)) errors.push(`parts：id「${p.id}」重複`);
    ids.add(p.id);
    if (p.label && textWidth(p.label) > 10) errors.push(`parts.${p.id} 的標籤「${p.label}」${textWidth(p.label)} 字，上限 10`);
    if (p.illus && names && !names.includes(p.illus)) errors.push(`parts.${p.id}：畫廊沒有「${p.illus}」（可用：${names.join('、')}）→ 改用圖示（icon；查名稱：node shared/template/tools/build.mjs --project projects/<專案> --icons <中文名稱>）`);
    if (p.icon && icons && !icons.get(String(p.icon))) errors.push(`parts.${p.id}：找不到圖示「${p.icon}」（kit/icons.json；${iconHint(p.icon, icons.names || [])}）`);
    if (p.src && outDir && !fs.existsSync(path.join(outDir, p.src))) errors.push(`parts.${p.id}：找不到 ${p.src} → 先照 shared/template/kit/illus-style.md 畫好放在 work/hyperframes/illus-local/`);
    if (!p.illus && !p.icon && !p.src && !p.wave) errors.push(`parts.${p.id}：要有 illus、icon、src 或 wave 其中一個`);
  }
  const need = (id, where) => { if (!ids.has(id)) errors.push(`${where}：parts 裡沒有「${id}」`); };
  const rowIds = (s.parts || []).filter((p) => !(p.row && p.row !== 1) && !Array.isArray(p.parts)).map((p) => p.id);
  for (const l of s.links || []) {
    const m = String(l).split(/[>-]/);
    if (m.length !== 2) { errors.push(`links：「${l}」要寫成 a>b（有箭頭）或 a-b（沒箭頭）`); continue; }
    m.forEach((x) => need(x, `links「${l}」`));
    const [i, j] = m.map((x) => rowIds.indexOf(x));
    if (i >= 0 && j >= 0 && Math.abs(i - j) > 1) errors.push(`links：「${l}」中間隔著別的元件，線會穿過去 → 接相鄰的元件，或調整 parts 的順序（第二列用 "row": 2）`);
  }
  s.beats.forEach((b, i) => {
    const w = `beats[${i}]`;
    if (typeof b.at !== 'string' || !/^#\d+/.test(b.at)) errors.push(`${w}.at：要寫句號（#N@詞），現在是「${b.at}」`);
    for (const id of b.in || []) need(id, `${w}.in`);
    if (b.state) { if (!Array.isArray(b.state) || b.state.length !== 3) errors.push(`${w}.state：要寫 [元件, 舊狀態, 新狀態]`); else need(b.state[0], `${w}.state`); }
    if (b.move) { if (!Array.isArray(b.move) || b.move.length < 2) errors.push(`${w}.move：要寫 [元件, 目標元件, "left"｜"right"]`); else { need(b.move[0], `${w}.move`); need(b.move[1], `${w}.move`); } }
    if (b.focus) need(b.focus, `${w}.focus`);
    if (b.check) need(b.check, `${w}.check`);
    if (b.wave) need(b.wave, `${w}.wave`);
    if (b.count) need(Array.isArray(b.count) ? b.count[0] : b.count.part, `${w}.count`);
    for (const id of b.dim || []) need(id, `${w}.dim`);
    if (b.line) { const m = String(b.line).split(/[>-]/); if (m.length !== 2) errors.push(`${w}.line：要寫 a-b`); else { need(m[0], `${w}.line`); need(m[1], `${w}.line`); } }
    if (b.sfx && !/^[a-z0-9-]+$/.test(b.sfx)) errors.push(`${w}.sfx：音效名只有小寫英數字與 -`);
  });
  return errors;
}

const sid = (id) => `xsc-${id}`;

function scenePartHtml(p, ctx) {
  if (Array.isArray(p.parts)) {
    const inner = p.parts.map((x) => scenePartHtml(x, ctx)).join('\n');
    return `<div id="${sid(p.id || 'group')}" data-slot data-layout="${p.layout || 'col'}" data-gap="${p.gap || 'md'}">\n${inner}\n</div>`;
  }
  const cls = ['xsc-it', p.pre && 'xsc-pre', p.stand && 'xsc-stand', p.side && 'xsc-side'].filter(Boolean).join(' ');
  const row = p.row && p.row !== 1 ? ` data-row="${p.row}"` : '';
  const label = p.label ? `<b class="xsc-lbl sc-w700">${esc(p.label)}</b>` : '';
  let body;
  if (p.wave) body = '<div class="xsc-wv"></div>';
  else if (p.icon) body = `<span class="sc-icon" style="--d:${p.w || 128}px;--i:${Math.round((p.w || 128) * 0.56)}px">${ctx.icons?.get(String(p.icon)) || ''}</span>`;
  else {
    const [w, h] = partSize(p, ctx, ctx.kitDir);
    const opts = Object.entries(p.opts || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
    body = p.src ? `<div data-illus-src="${esc(p.src)}"${opts} style="width:${w}px;height:${h}px"></div>` : `<div data-illus="${esc(p.illus)}"${opts} style="width:${w}px;height:${h}px"></div>`;
  }
  return `<div id="${sid(p.id)}" class="${cls}" data-slot${row}>${body}${label}</div>`;
}

// 拍裡提到的元件還沒進場就補進那一拍的 in；從頭到尾沒提到的放第一拍。忘了寫 in 不該變成一段壞掉的動畫
export function normalizeBeats(s) {
  const parts = flatParts(s.parts), entered = new Set(parts.filter((p) => p.pre).map((p) => p.id));
  const beats = (s.beats || []).map((b) => ({ ...b, in: [...(b.in || [])] }));
  for (const b of beats) {
    const line = b.line ? String(b.line).split(/[>-]/) : [];
    const count = b.count ? [Array.isArray(b.count) ? b.count[0] : b.count.part] : [];
    for (const id of [...line, b.move?.[0], b.move?.[1], b.state?.[0], b.focus, b.wave, ...count].filter(Boolean)) if (!entered.has(id) && !b.in.includes(id)) b.in.push(id);
    for (const id of b.in) entered.add(id);
    if (b.check) entered.add(b.check);
  }
  const left = parts.filter((p) => !entered.has(p.id)).map((p) => p.id);
  if (left.length && beats.length) beats[0].in.push(...left);
  return { ...s, beats };
}

function sceneBeatCode(s) {
  const lines = [];
  s.beats.forEach((b, i) => {
    const t = `T${i + 1}`;
    const q = String(b.at).replace(/'/g, "\\'");
    lines.push(`    const ${t} = P.at('${q}');${b.sfx ? `   P.sfx('${b.sfx}', '${q}');` : ''}`);
  });
  lines.push('    const BEATS = [');
  s.beats.forEach((b, i) => {
    const o = [];
    if (b.in?.length) o.push(`in: ${JSON.stringify(b.in.map(sid)).replace(/"/g, "'")}`);
    if (b.state) o.push(`state: ['${sid(b.state[0])}', '${b.state[1]}', '${b.state[2]}']`);
    if (b.line) { const [x, y] = String(b.line).split(/[>-]/); o.push(`line: '${sid(x)}-${sid(y)}'`); }
    if (b.move) o.push(`move: ['${sid(b.move[0])}', '${sid(b.move[1])}', '${b.move[2] || 'left'}']`);
    if (b.count) { const c = Array.isArray(b.count) ? b.count : [b.count.part, b.count.from, b.count.to, b.count.prefix]; o.push(`count: ['#${sid(c[0])} ${c[4] || '.il-time'}', ${Number(c[1] ?? 0)}, ${Number(c[2] ?? 0)}, ${JSON.stringify(c[3] ?? '').replace(/"/g, "'")}]`); }
    if (b.wave) o.push(`wave: '${sid(b.wave)}'`);
    if (b.check) o.push(`check: '${sid(b.check)}'`);
    if (b.focus) o.push(`focus: '${sid(b.focus)}'`);
    if (b.dim?.length) o.push(`dim: ${JSON.stringify(b.dim.map(sid)).replace(/"/g, "'")}`);
    lines.push(`      [T${i + 1}, { ${o.join(', ')} }],`);
  });
  lines.push('    ];');
  for (const a of s.after || []) lines.push(`    ${a}`);
  return lines.join('\n');
}

function fillScene(html, slots, { icons, kitDir }) {
  const s = normalizeBeats(slots);
  const parts = flatParts(s.parts);
  const topRow = (s.parts || []).filter((p) => !(p.row && p.row !== 1));
  const mains = Math.max(1, topRow.filter((p) => !(ILLUS_SMALL[p.illus]) && !p.side).length);
  const twoRows = (s.parts || []).some((p) => p.row && p.row !== 1) || (s.parts || []).some((p) => Array.isArray(p.parts));
  const ctx = { mains, twoRows, kitDir, icons };
  let out = html;
  out = out.replace(/(<!-- ══ DATA 1[^\n]*\n)[\s\S]*?(\n?[ \t]*<!-- ══ DATA 1 到這裡)/, (_, a, b) => `${a}${(s.parts || []).map((p) => `        ${scenePartHtml(p, ctx)}`).join('\n')}\n${b.replace(/^\n/, '')}`);
  out = out.replace(/(\/\/ ══ DATA 2[^\n]*\n)[\s\S]*?(\n?[ \t]*\/\/ ══ DATA 2 到這裡)/, (_, a, b) => `${a}${sceneBeatCode(s)}\n${b.replace(/^\n/, '')}`);
  const links = (s.links || []).map((l) => { const arrow = String(l).includes('>'); const [x, y] = String(l).split(/[>-]/); return `${sid(x)}${arrow ? '>' : '-'}${sid(y)}`; }).join(' ');
  out = out.replace(/(<svg id="xsc-lines" data-links=")[^"]*(")/, `$1${links}$2`);
  if (s.layout) out = out.replace(/(<div id="xsc-stage" data-layout=")[^"]*(")/, `$1${esc(s.layout)}$2`);
  // 元件少又窄（人、直拿的手機）：間距拉開，整組撐到內容區六成寬，連接線才看得到、畫面不會只擠在中間
  const row = topRow.filter((p) => !Array.isArray(p.parts));
  const widths = row.map((p) => (p.illus || p.src ? partSize(p, ctx, kitDir)[0] : p.w || 128));
  const stretch = row.length >= 2 && row.length === topRow.length ? Math.min(320, ((1176 * 0.6) - widths.reduce((a, b) => a + b, 0)) / (row.length - 1)) : 0;
  const gap = s.gap || (stretch > 96 ? String(even8(stretch)) : null);
  if (gap) out = out.replace(/(<div id="xsc-stage"[^>]*data-gap=")[^"]*(")/, `$1${esc(gap)}$2`);
  if (s.route) {
    out = out.replace('class="xsc-floor"', 'class="xsc-floor xsc-route" data-stops');
    out = out.replace('<!-- <div class="xsc-here" data-layout-ignore></div> -->', '<div class="xsc-here" data-layout-ignore></div>');
  }
  void parts;
  return out;
}

// ---------- 產生 ----------

export function fillTemplate({ spec, html, id, slots, icons, rename = true, keepIcons = false, kitDir, outDir }) {
  const errors = [];
  const s = isObj(slots) ? slots : {};
  const name = `${spec.template}-${id}`;
  errors.push(...(spec.generator === 'scene' ? validateScene(s, { kitDir, icons, outDir }) : validateSlots(spec, s, { icons })));
  if (errors.length) return { name, file: `compositions/${name}.html`, html: null, errors };
  const m = html.match(/(<template\b[^>]*>)([\s\S]*)(<\/template>)/i);
  if (!m) return { name, file: null, html: null, errors: [`custom/${spec.template}.html 沒有 <template>`] };
  const list = firstList(spec);
  const ctx = (k) => {
    if (k === 'n') return list ? (s[list] || []).length : 0;
    const v = valueAt(s, k);
    return Array.isArray(v) ? v.length : v;
  };
  let body = m[2];
  if (spec.generator === 'scene') body = fillScene(body, s, { icons, kitDir });
  body = processLines(body, s, ctx);
  body = fillElements(body, spec, s, { icons, keepIcons }, errors);
  body = applyRefs(body, spec, s, errors);
  body = applyConsts(body, spec, s, errors);
  for (const left of ['@if', '@sub', 'data-fill=']) if (body.includes(left)) errors.push(`模板還有沒處理到的標記 ${left}（通常是標記寫錯）`);
  let out = html.slice(0, m.index) + m[1] + body + m[3] + html.slice(m.index + m[0].length);
  if (rename) {
    out = out.replace(new RegExp(`(?<![\\w-])${reEsc(spec.template)}(?=(?:-template)?(?![\\w-]))`, 'g'), name);
    // 前面可以是連字號：連接線的 id 是 <上一站>-<下一站>（xproc-n1-xproc-n2），兩段都要換
    if (spec.prefix) {
      out = out.replace(new RegExp(`(?<!\\w)${reEsc(spec.prefix)}-`, 'g'), `${spec.prefix}${id}-`);
      const inner = (out.match(/<template\b[^>]*>([\s\S]*)<\/template>/i) || [])[1] || '';
      if (new RegExp(`(?<!\\w)${reEsc(spec.prefix)}-`).test(inner)) errors.push(`模板裡還有舊前綴 ${spec.prefix}-`);
    }
    // data-cues-sample 只給範例單獨開檔用；產生的檔用真的字幕，留著只會誤導
    out = out.replace(/\s*data-cues-sample='[^']*'/, '');
  }
  return { name, file: `compositions/${name}.html`, html: out, errors };
}

// 把模板的標記拿掉（比對「sample 填回去＝模板原文」用，也給測試用）
export function stripMarkers(html) {
  const m = html.match(/(<template\b[^>]*>)([\s\S]*)(<\/template>)/i);
  if (!m) return html;
  const lines = [];
  for (const line of m[2].split('\n')) {
    if (OPEN.test(line) || CLOSE.test(line)) continue;
    const t = line.match(TAIL);
    lines.push(t ? line.slice(0, t.index).replace(/\s+$/, '') : line);
  }
  const body = lines.join('\n').replace(/\sdata-fill="[^"]+"/g, '');
  return html.slice(0, m.index) + m[1] + body + m[3] + html.slice(m.index + m[0].length);
}

// ---------- 動畫分鏡 ----------

const fmtCell = (s) => String(s ?? '—').replace(/\|/g, '｜').replace(/\r?\n/g, ' ').trim() || '—';

function fillRow(tpl, vars) {
  return String(tpl ?? '').replace(/\{([\w.]+)\}/g, (all, k) => {
    const v = k.split('.').reduce((o, p) => (o == null ? o : o[p]), vars);
    return v == null ? all : String(v);
  });
}

function sceneSheet(s, id) {
  const parts = flatParts(s.parts), byId = new Map(parts.map((p) => [p.id, p]));
  const nameOf = (x) => byId.get(x)?.label || x;
  const row1 = (s.parts || []).filter((p) => !(p.row && p.row !== 1));
  const place = (x) => {
    const p = byId.get(x);
    if (!p) return '—';
    if (p.row && p.row !== 1) return 'panelTop｜row2 1／1';
    const k = row1.findIndex((q) => q.id === x || flatParts(q.parts || []).some((y) => y.id === x));
    return `panelTop｜row ${k < 0 ? 1 : k + 1}／${row1.length}`;
  };
  const illusOf = (x, state) => {
    const p = byId.get(x);
    if (!p) return '—';
    if (p.wave || p.icon) return '—';
    const o = state || Object.values(p.opts || {}).join(', ');
    return `\`${p.illus || p.src}\`${o ? `（${o}）` : ''}`;
  };
  const rows = [['0', '段起點', `場景骨架：面板＋標題「${s.title}」`, '開場（依前段）；＋0.5 逐字上浮（標題）', '標題', '—', '—', 'panelTop']];
  s.beats.forEach((b, i) => {
    const show = [], moves = [];
    let lead = null, st = null;
    for (const x of b.in || []) { show.push(`${nameOf(x)}（標籤「${byId.get(x)?.label ?? '—'}」）`); moves.push(`彈出（${nameOf(x)}）`, '＋0.14 逐字上浮（標籤）'); lead = lead || x; }
    if (b.line) { show.push('連接線'); moves.push('＋0.7 描線（連接線）'); }
    if (b.state) { show.push(`${nameOf(b.state[0])}換成 ${b.state[2]}`); moves.push('淡入（新狀態）', '淡出（舊狀態）', `漣漪（${nameOf(b.state[0])}）`); lead = lead || b.state[0]; st = b.state[2]; }
    if (b.move) { show.push(`${nameOf(b.move[0])}走到${nameOf(b.move[1])}旁邊`); moves.push(`游標移動（${nameOf(b.move[0])}）`); lead = lead || b.move[0]; }
    if (b.count) { show.push('數字跑動'); moves.push('數字滾動'); }
    if (b.check) { show.push(`結果徽章「${byId.get(b.check)?.label ?? ''}」`); moves.push('彈出（徽章）', '＋0.3 描圈打勾'); lead = lead || b.check; }
    if (b.wave) { show.push('聲紋跳動'); lead = lead || b.wave; }
    if (b.focus) { moves.push(`聚焦（${nameOf(b.focus)}）`); lead = b.focus; }
    if (b.dim?.length) moves.push(`退焦（${b.dim.map(nameOf).join('、')}）`);
    rows.push([String(i + 1), `\`${b.at}\``, show.join('；') || '—', moves.join('；') || '—', lead ? nameOf(lead) : '—', b.sfx || '—', lead ? illusOf(lead, st) : '—', lead ? place(lead) : '—']);
  });
  rows.push(['收', '最後一拍＋2.0', '全部（完成態停到段尾）', '回均衡', '整體', '—', '—', '—']);
  const head = [...BEAT_HEADER, ...BEAT_HEADER_ILLUS];
  return `#### 動畫分鏡 ${id}\n\n| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(fmtCell).join(' | ')} |`).join('\n')}\n`;
}

export function renderSheet(spec, slots, id) {
  const s = isObj(slots) ? slots : {};
  if (spec.generator === 'scene') return sceneSheet(s, id);
  if (!Array.isArray(spec.sheet) || !spec.sheet.length) return null;
  const list = firstList(spec), items = list ? s[list] || [] : [];
  const last = items[items.length - 1] || {};
  const rows = [];
  const push = (r, vars) => {
    // if 看得到這一項自己的欄位（each 的列）、也看得到整段的 slots
    if (r.if && !evalCond(r.if, (k) => {
      if (k === 'n') return items.length;
      const own = vars?.[k];
      if (own !== undefined) return Array.isArray(own) ? own.length : own;
      const v = valueAt(s, k);
      return Array.isArray(v) ? v.length : v;
    })) return;
    rows.push([r.beat, r.at, r.show, r.moves, r.focus, r.sfx ?? '—'].map((c) => fmtCell(fillRow(c, vars))));
  };
  for (const r of spec.sheet) {
    if (r.each) {
      const all = s[r.each] || [], from = r.from ?? 1, to = r.to ?? all.length;
      let k = 0;
      all.forEach((it, i) => {
        if (i + 1 < from || i + 1 > to) return;
        const beat = typeof r.beat === 'number' ? String(r.beat + k) : r.beat;   // 數字＝每一項遞增
        k++;
        push({ ...r, beat }, { ...s, ...it, n: i + 1, i, prev: all[i - 1] || {}, last: all[all.length - 1] || {} });
      });
    } else push(r, { ...s, n: items.length, last });
  }
  return `#### 動畫分鏡 ${id}\n\n| ${BEAT_HEADER.join(' | ')} |\n|${BEAT_HEADER.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n`;
}

// ---------- plan.json → 檔案 ----------

export const fillFileOf = (seg) => `compositions/${seg.template}-${seg.id}.html`;
export const designFileOf = (seg) => `compositions/x-design-${seg.id}.html`;

// 內容設計動畫還沒做：占位那個元素（data-design-blank）還在。不要比對構想文字：寫草稿時構想可能又改過
export const isBlankDesign = (html) => !html || /<[a-zA-Z][^<>]*\sdata-design-blank\b/.test(String(html));

// 拿掉構想文字後的樣子：比較兩份空白畫布是不是只差構想
const blankShape = (html) => String(html).replace(/(<[a-zA-Z][^<>]*\sdata-design-blank\b[^<>]*>\s*<span[^<>]*>)[\s\S]*?(<\/span>)/, '$1$2');

// 內容設計動畫的空白畫布：整個檔還是空白就跟著最新的構想更新；設計師動手之後工具不再覆寫
function blankFor(customDir, seg) {
  const html = fs.readFileSync(path.join(customDir, '_blank.html'), 'utf8');
  const idea = String(seg.story?.idea || '內容設計動畫（製作中）');
  // 疊在講者上的（layout: "overlay"）不要底圖
  return (seg.layout === 'overlay' ? html.replace(/\s*<div class="sc-surface-fs fill"><\/div>/, '') : html)
    .replace('內容設計動畫（製作中）', esc(idea))
    .replace(/x-design/g, `x-design-${seg.id}`)
    .replace(/(?<![\w-])xd-/g, `xd${seg.id}-`);
}

// <span data-icon="scissors"></span>：build 把 SVG 填進去，設計師不用去 icons.json 挖（586 KB）；已經填過的不動
export function expandIcons(html, icons) {
  const missing = [];
  const out = String(html).replace(/<([a-zA-Z][\w-]*)([^<>]*\sdata-icon="([^"]+)"[^<>]*)>\s*<\/\1>/g, (all, tag, attrs, name) => {
    const svg = icons?.get(name);
    if (!svg) { missing.push(name); return all; }
    return `<${tag}${attrs}>${svg}</${tag}>`;
  });
  return { html: out, missing };
}

export function materializeFills({ plan, outDir, lib, prune = false, kitDir = null }) {
  const errors = [], warnings = [], written = [];
  const all = Array.isArray(plan?.scenes) ? plan.scenes.filter((x) => x && x.type === 'custom') : [];
  const segs = all.filter((x) => x.template);
  const cacheFile = path.join(outDir, '.cache', 'custom-fill.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
  const live = new Set();
  const kit = kitDir || path.join(path.dirname(lib.customDir), 'kit');
  for (const seg of segs) {
    const where = `[${seg.id} custom ${seg.template}]`;
    const fail = (msgs) => { Object.defineProperty(seg, '__fillErrors', { value: msgs, enumerable: false, configurable: true }); };
    if (!seg.id) continue;
    if (seg.src) { errors.push(`${where} template 和 src 只能寫一個：template 由工具產生檔案，src 是手寫的檔`); fail(['template 和 src 只能寫一個']); continue; }
    const spec = readFillSpec(lib.customDir, seg.template);
    const file = fillFileOf(seg);
    seg.src = file;
    if (!spec) {
      const have = listFillSpecs(lib.customDir).map((x) => x.template);
      const msg = `template「${seg.template}」沒有填資料規格（custom/${seg.template}.fill.json）→ 可用：${have.join('、') || '無'}；要自由設計就複製範例、改寫 src`;
      fail([msg]); continue;
    }
    if (seg.layout == null) seg.layout = spec.layout || 'fullscreen';
    const html = fs.readFileSync(path.join(lib.customDir, `${seg.template}.html`), 'utf8');
    const r = fillTemplate({ spec, html, id: seg.id, slots: seg.slots, icons: lib.icons, kitDir: kit, outDir });
    if (r.errors.length) { fail(r.errors); continue; }
    Object.defineProperty(seg, '__sheet', { value: renderSheet(spec, seg.slots, seg.id), enumerable: false, configurable: true });
    live.add(file);
    const abs = path.join(outDir, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    let cur = null;
    try { cur = fs.readFileSync(abs, 'utf8'); } catch { cur = null; }
    if (cur === r.html) { cache[file] = sha(r.html); continue; }
    if (cur != null && cache[file] && sha(cur) !== cache[file]) {
      warnings.push(`${where} ${file} 手改過，這次 slots 的改動沒有套用 → 要照 slots 重新產生就刪掉這個檔`);
      continue;
    }
    if (cur != null && !cache[file]) {
      warnings.push(`${where} ${file} 已經有了（不是工具產生的），沒有覆寫 → 要照 slots 重新產生就刪掉這個檔`);
      continue;
    }
    fs.writeFileSync(abs, r.html);
    cache[file] = sha(r.html);
    written.push(file);
  }
  // 內容設計動畫：design: true 的段
  for (const seg of all.filter((x) => x.design && x.id)) {
    const where = `[${seg.id} custom 內容設計動畫]`;
    if (seg.src && seg.src !== designFileOf(seg)) { errors.push(`${where} design 不用寫 src（工具固定用 ${designFileOf(seg)}）`); continue; }
    if (seg.template) { errors.push(`${where} design 和 template 只能選一個：要套模板就拿掉 design，要專門設計就拿掉 template`); continue; }
    const file = designFileOf(seg);
    seg.src = file;
    if (seg.layout == null) seg.layout = 'fullscreen';
    const blank = blankFor(lib.customDir, seg);
    const abs = path.join(outDir, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    let cur = null;
    try { cur = fs.readFileSync(abs, 'utf8'); } catch { cur = null; }
    if (isBlankDesign(cur)) {
      // 只有整個檔還是空白（只差構想文字）才更新；設計師寫到一半、占位還沒刪的檔絕對不能蓋（別段的 audit 也會跑到這裡）
      if (cur == null) { fs.writeFileSync(abs, blank); written.push(file); }
      else if (cur !== blank && blankShape(cur) === blankShape(blank) && rewriteIfSame(abs, cur, blank)) written.push(file);   // 設計師可能剛好在存：內容變了就不寫
      Object.defineProperty(seg, '__blank', { value: true, enumerable: false, configurable: true });
    }
    live.add(file);
  }
  // 所有情境動畫檔：data-icon 填成 SVG
  for (const seg of all) {
    if (!seg.src) continue;
    const abs = path.join(outDir, seg.src);
    let cur;
    try { cur = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (!cur.includes('data-icon="')) continue;
    const r = expandIcons(cur, lib.icons);
    for (const m of r.missing) errors.push(`[${seg.id} custom] 找不到圖示「${m}」（kit/icons.json；${iconHint(m, lib.icons?.names || [])}）→ 換一個名稱；查名稱：node shared/template/tools/build.mjs --project ${path.relative(process.cwd(), path.resolve(outDir, '..', '..')) || '.'} --icons ${m}`);
    if (r.html !== cur) rewriteIfSame(abs, cur, r.html);   // 每條 --check 都會跑到別段的檔，那段的子代理可能剛好在存：內容變了就不寫，下次再展開
  }
  if (prune) {
    for (const [file, h] of Object.entries(cache)) {
      if (live.has(file)) continue;
      const abs = path.join(outDir, file);
      try { if (sha(fs.readFileSync(abs, 'utf8')) === h) fs.unlinkSync(abs); } catch { /* 已經不在了 */ }
      delete cache[file];
    }
  }
  if (segs.length || Object.keys(cache).length) {
    // 平行的子代理都會跑 --check：讀、併、寫要鎖起來（不鎖會掉別人剛寫的，那段之後就被當成手改過的檔）；內容沒變不寫，要寫就先寫暫存檔再換名，別人才不會讀到寫一半的檔
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    withLock(`${cacheFile}.lock`, () => {
      let old = null;
      try { old = fs.readFileSync(cacheFile, 'utf8'); } catch { old = null; }
      if (!prune && old) { try { cache = { ...JSON.parse(old), ...cache }; } catch { /* 壞檔就用這次的 */ } }   // 別的子代理剛寫的不要蓋掉
      const next = JSON.stringify(cache, null, 2);
      if (old !== next) {
        const tmp = `${cacheFile}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, next);
        fs.renameSync(tmp, cacheFile);
      }
    });
  }
  return { errors, warnings, written };
}

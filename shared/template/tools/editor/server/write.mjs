// 剪輯台的寫入規則（純函式，沒有 I/O）：驗證存檔內容、只改允許的欄位、保留 plan.json 與 rough.srt 原本的排版
//
//   sanitizeEdit(edit, { videoDur })                  → { edit, errors }
//   sanitizeSegments(segments, plan, ctx)             → { updates: [[id, set, del]], memory, errors }
//   applySave(planText, body, ctx)                     → { text, srtText, plan, edit, cues, memory, errors }（要寫的新內容；null＝不用寫）
//   sanitizeLook(v)                                    → { look, errors }（第一層 look：講者調光與瘦臉；null＝恢復預設）
//   sanitizeFrame(v, { W, H })                         → { frame, errors }（第一層 frame：構圖台的裁切框；null＝不裁切）
//   remapToFrame(rect, from, to, { W, H }, kind)       → 換框時 speakerBox（'box'）／pipCrop（'rect'）換算成新框裡同一塊畫面
//   sanitizeTheme(v)                                   → { theme, errors }（第一層 theme："light"｜"dark"；null＝拿掉＝亮色；specs/010-motion-v2/design-system.md §10）
//   parseSrtBlocks(text) / writeSrt(srtText, cues)     → rough.srt 讀寫（保留 CRLF／LF、BOM；沒改的句子原封不動）
//   字幕增刪與句號重新對應的規則在 ../subtitles.mjs（頁面也用同一份）
import { replay, parseRef, refTime, RULES } from '../subtitles.mjs';
import { visibleLen, richPlain, splitItem, parseAttrs, findSceneDef, findFxDef } from '../text.mjs';
import { LOOK_LIMITS } from '../../lib/look.mjs';

export { visibleLen, richPlain };

export const LIMITS = Object.freeze({
  volume: [-60, 12], fade: [0, 10], dipDur: [0.05, 2], speed: [0.5, 4], minMedia: 1, capMax: 18,
  joinTypes: ['none', 'dip', 'punch'], enterExit: ['cut', 'fade', 'slide', 'zoom'],
  editKeys: ['cuts', 'fadeIn', 'fadeOut', 'volume', 'gains', 'joins'], volumeKeys: ['voice', 'sfx', 'media'],
  joinKeys: ['at', 'type', 'dur'], gainKeys: ['from', 'to', 'db'],
  segCommon: ['sfxVolume', 'sfx'], segMedia: ['enter', 'exit', 'volume', 'from', 'to', 'in', 'anchor'], segScene: ['slots'], segFx: ['vars'],
  bodyKeys: ['base', 'edit', 'media', 'segments', 'srt', 'look', 'theme', 'frame'],
  themes: ['light', 'dark'],
  frame: { maxZoom: 2, upscaleWarn: 3.5, edge: 40 },   // 構圖台：最多放大 2 倍；來源像素放大超過 3.5 倍會變軟；講者動作範圍離邊 < 40px＝切到手勢
  srt: RULES,
});

const r3 = (n) => +Number(n).toFixed(3);
const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function defaultEdit() {
  return { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, gains: [], joins: [] };
}

// ---------- edit ----------

export function sanitizeEdit(edit, { videoDur = null } = {}) {
  const errors = [];
  if (!isObj(edit)) return { edit: null, errors: ['edit 要是物件 → 例如 { "cuts": [[12.0, 14.5]], "fadeIn": 0.5 }'] };
  for (const k of Object.keys(edit)) if (!LIMITS.editKeys.includes(k)) errors.push(`edit 不能有「${k}」→ 只能寫 ${LIMITS.editKeys.join('、')}`);
  const out = defaultEdit();
  const inVideo = (b) => (videoDur != null ? Math.min(r3(b), r3(videoDur)) : r3(b));
  if (edit.cuts != null) {
    if (!Array.isArray(edit.cuts)) errors.push('edit.cuts 要是陣列 → [[起點, 終點], …]（rough.mp4 的秒數）');
    else {
      const list = [];
      edit.cuts.forEach((c, i) => {
        if (!Array.isArray(c) || c.length !== 2 || !isNum(c[0]) || !isNum(c[1])) { errors.push(`edit.cuts 第 ${i + 1} 項要寫成 [起點, 終點]（秒數），現在是 ${JSON.stringify(c)}`); return; }
        const a = Math.max(0, r3(c[0])), b = inVideo(c[1]);
        if (!(b > a)) { errors.push(`edit.cuts 第 ${i + 1} 項 ${JSON.stringify(c)} 的終點要大於起點，而且要在影片範圍內`); return; }
        list.push([a, b]);
      });
      list.sort((x, y) => x[0] - y[0]);
      for (const c of list) {
        const last = out.cuts[out.cuts.length - 1];
        if (last && c[0] <= last[1] + 0.0005) last[1] = Math.max(last[1], c[1]);
        else out.cuts.push(c);
      }
      const total = out.cuts.reduce((s, [a, b]) => s + b - a, 0);
      if (videoDur != null && total > videoDur - 0.5) errors.push('edit.cuts 幾乎把整支影片都剪掉了 → 成片至少要留 0.5 秒');
    }
  }
  for (const k of ['fadeIn', 'fadeOut']) {
    if (edit[k] == null) continue;
    if (!isNum(edit[k]) || edit[k] < LIMITS.fade[0] || edit[k] > LIMITS.fade[1]) errors.push(`edit.${k} 要是 ${LIMITS.fade[0]}–${LIMITS.fade[1]} 的秒數，現在是 ${JSON.stringify(edit[k])}`);
    else out[k] = r2(edit[k]);
  }
  if (edit.volume != null) {
    if (!isObj(edit.volume)) errors.push('edit.volume 要是物件 → { "voice": 0, "sfx": 0, "media": 0 }（dB）');
    else for (const [k, v] of Object.entries(edit.volume)) {
      if (!LIMITS.volumeKeys.includes(k)) { errors.push(`edit.volume 不能有「${k}」→ 只能寫 voice、sfx、media`); continue; }
      if (!isNum(v) || v < LIMITS.volume[0] || v > LIMITS.volume[1]) errors.push(`edit.volume.${k} 要是 −60～+12 的 dB 數字，現在是 ${JSON.stringify(v)}`);
      else out.volume[k] = r1(v);
    }
  }
  if (edit.gains != null) {
    if (!Array.isArray(edit.gains)) errors.push('edit.gains 要是陣列 → [{ "from": 41.2, "to": 44.0, "db": 4 }]（rough.mp4 的秒數）');
    else {
      const list = [];
      edit.gains.forEach((g, i) => {
        const where = `edit.gains 第 ${i + 1} 項`;
        if (!isObj(g)) { errors.push(`${where}要是物件 → { "from": 41.2, "to": 44.0, "db": 4 }`); return; }
        for (const k of Object.keys(g)) if (!LIMITS.gainKeys.includes(k)) errors.push(`${where}不能有「${k}」→ 只能寫 from、to、db`);
        if (!isNum(g.from) || !isNum(g.to)) { errors.push(`${where}的 from／to 要是秒數`); return; }
        const a = Math.max(0, r3(g.from)), b = inVideo(g.to);
        if (!(b > a)) { errors.push(`${where}的 to 要大於 from，而且要在影片範圍內`); return; }
        if (!isNum(g.db) || g.db < LIMITS.volume[0] || g.db > LIMITS.volume[1]) { errors.push(`${where}的 db 要是 −60～+12 的數字，現在是 ${JSON.stringify(g.db)}`); return; }
        list.push({ from: a, to: b, db: r1(g.db) });
      });
      list.sort((x, y) => x.from - y.from);
      for (let i = 1; i < list.length; i++) if (list[i].from < list[i - 1].to - 0.0005) errors.push(`edit.gains 的範圍重疊了（${list[i - 1].from}–${list[i - 1].to} 和 ${list[i].from}–${list[i].to}）→ 範圍不可以重疊`);
      out.gains = list.filter((g) => g.db !== 0);
    }
  }
  if (edit.joins != null) {
    if (!Array.isArray(edit.joins)) errors.push('edit.joins 要是陣列 → [{ "at": 秒數, "type": "dip" }]');
    else edit.joins.forEach((j, i) => {
      const where = `edit.joins 第 ${i + 1} 項`;
      if (!isObj(j)) { errors.push(`${where}要是物件 → { "at": 12.0, "type": "dip" }`); return; }
      for (const k of Object.keys(j)) if (!LIMITS.joinKeys.includes(k)) errors.push(`${where}不能有「${k}」→ 只能寫 at、type、dur`);
      if (!isNum(j.at) || j.at < 0 || (videoDur != null && j.at > videoDur + 0.001)) { errors.push(`${where}的 at 要是影片範圍內的秒數，現在是 ${JSON.stringify(j.at)}`); return; }
      if (!LIMITS.joinTypes.includes(j.type)) { errors.push(`${where}的 type 要是 none、dip、punch，現在是 ${JSON.stringify(j.type)}`); return; }
      if (j.dur != null && (!isNum(j.dur) || j.dur < LIMITS.dipDur[0] || j.dur > LIMITS.dipDur[1])) { errors.push(`${where}的 dur 要是 ${LIMITS.dipDur[0]}–${LIMITS.dipDur[1]} 秒，現在是 ${JSON.stringify(j.dur)}`); return; }
      if (j.type === 'none') return;
      const o = { at: r3(j.at), type: j.type };
      if (j.type === 'dip') o.dur = r3(j.dur ?? 0.3);
      const dup = out.joins.findIndex((x) => Math.abs(x.at - o.at) < 0.05);
      if (dup >= 0) out.joins[dup] = o; else out.joins.push(o);
    });
    out.joins.sort((a, b) => a.at - b.at);
  }
  return { edit: out, errors };
}

// ---------- 時間（只認剪輯台會寫的寫法：#N、#Ne、#N±秒、秒數）----------

export function resolveTime(v, cues) {
  if (isNum(v)) return v;
  return cues ? refTime(v, cues) : null;   // refTime 認 #N、#Ne、#N±秒、#N@詞
}
function segRange(seg, cues) {
  const s = resolveTime(seg.from, cues);
  if (s == null) return null;
  let e = seg.to != null ? resolveTime(seg.to, cues) : isNum(seg.duration) ? s + seg.duration : null;
  return e == null ? null : [s, e];
}

// ---------- 動畫文字（slots／vars）：只改文字值，結構不變 ----------

const TEXT_TYPES = new Set(['text', 'rich']);
const isTextDecl = (d) => !d || !d.type || TEXT_TYPES.has(d.type);

function checkList(where, o, n, def, errors) {
  if (!Array.isArray(n)) { errors.push(`${where} 要維持清單（陣列）`); return; }
  const min = def?.min ?? (def ? 0 : Math.min(1, o.length));
  if (n.length > o.length) { errors.push(`${where} 有 ${n.length} 項，比原本多（原本 ${o.length} 項）→ 剪輯台不能加項目，要加請寫進修改單給 AI`); return; }
  if (n.length < min) errors.push(`${where} 有 ${n.length} 項，至少要 ${min} 項`);
  const objs = o.filter(isObj);
  const itemDef = def?.item || null;
  const textKey = (k) => (itemDef ? itemDef[k] && isTextDecl(itemDef[k]) : k !== 'icon' && k !== 'at');
  const keyUnion = new Set(objs.flatMap((x) => Object.keys(x)));
  const valuesOf = (k) => new Set(objs.filter((x) => k in x).map((x) => JSON.stringify(x[k])));
  // 字串項目「文字 ｜icon=x at=#3」：｜後面的屬性只能沿用原本出現過的值（圖示、時間不能在剪輯台改）
  const strAttrs = o.filter((x) => typeof x === 'string').map((x) => parseAttrs(splitItem(x).tail));
  const attrValues = (k) => new Set(strAttrs.filter((a) => k in a).map((a) => a[k]));
  n.forEach((it, i) => {
    const w = `${where} 第 ${i + 1} 項`;
    if (typeof it === 'string') {
      if (objs.length && !o.some((x) => typeof x === 'string')) { errors.push(`${w} 要維持原本的格式（物件）`); return; }
      for (const [k, v] of Object.entries(parseAttrs(splitItem(it).tail))) {
        if (!attrValues(k).has(v)) errors.push(`${w} 的「${k}=${v}」不是原本就有的值 → 剪輯台只改文字，圖示和時間請 AI 改`);
      }
      return;
    }
    if (!isObj(it)) { errors.push(`${w} 要是文字或物件`); return; }
    if (!objs.length) { errors.push(`${w} 要維持原本的格式（文字）`); return; }
    for (const [k, v] of Object.entries(it)) {
      if (!keyUnion.has(k)) { errors.push(`${w} 不能新增「${k}」→ 剪輯台只改文字，結構請 AI 改`); continue; }
      if (textKey(k)) { if (typeof v !== 'string') errors.push(`${w} 的 ${k} 要是文字`); continue; }
      if (!valuesOf(k).has(JSON.stringify(v))) errors.push(`${w} 的「${k}」不是文字，只能沿用原本的值（例如圖示）`);
    }
  });
}

export function checkSlots(id, orig = {}, next, sceneDef) {
  const errors = [];
  const where = `段 ${id} 的 slots`;
  if (!isObj(next)) return [`${where} 要是物件`];
  const ko = Object.keys(orig).sort(), kn = Object.keys(next).sort();
  if (!same(ko, kn)) return [`${where} 的欄位不能增減（原本：${ko.join('、') || '無'}；送來：${kn.join('、') || '無'}）→ 剪輯台只改文字，要加欄位請 AI 改`];
  for (const k of ko) {
    const o = orig[k], n = next[k], def = sceneDef?.slots?.[k];
    if (same(o, n)) continue;
    if (typeof o === 'string' && isTextDecl(def)) { if (typeof n !== 'string') errors.push(`${where}.${k} 要是文字`); continue; }
    if (Array.isArray(o) && (!def || def.type === 'list')) { checkList(`${where}.${k}`, o, n, def, errors); continue; }
    // 寫成物件的文字欄位（例如 QA 的 "a": { "text": "…", "at": "#14" }）：只能改 text
    if (isObj(o) && isTextDecl(def)) {
      if (!isObj(n) || !same(Object.keys(o).sort(), Object.keys(n).sort())) { errors.push(`${where}.${k} 要維持原本的欄位（${Object.keys(o).join('、')}）`); continue; }
      for (const kk of Object.keys(o)) {
        if (kk === 'text' || kk === 'value') { if (typeof n[kk] !== 'string') errors.push(`${where}.${k}.${kk} 要是文字`); }
        else if (!same(o[kk], n[kk])) errors.push(`${where}.${k}.${kk} 不是文字，剪輯台不能改 → 請 AI 改`);
      }
      continue;
    }
    errors.push(`${where}.${k} 不是文字（${def?.type || typeof o}），剪輯台不能改 → 請 AI 改`);
  }
  return errors;
}

export function checkVars(id, orig = {}, next, fxDef) {
  const where = `段 ${id} 的 vars`;
  if (!isObj(next)) return [`${where} 要是物件`];
  const ko = Object.keys(orig).sort(), kn = Object.keys(next).sort();
  if (!same(ko, kn)) return [`${where} 的欄位不能增減（原本：${ko.join('、') || '無'}；送來：${kn.join('、') || '無'}）→ 剪輯台只改文字，要加欄位請 AI 改`];
  const errors = [];
  for (const k of ko) {
    const def = fxDef?.vars?.find((v) => v.id === k);
    const text = def ? def.type === 'string' : typeof orig[k] === 'string' && !['accent', 'bg'].includes(k);
    if (text) { if (typeof next[k] !== 'string') errors.push(`${where}.${k} 要是文字`); }
    else if (!same(orig[k], next[k])) errors.push(`${where}.${k} 不是文字（${def?.type || typeof orig[k]}），剪輯台不能改 → 請 AI 改`);
  }
  return errors;
}

// ---------- 每段的欄位（media 時間與進出場、音效、文字）----------

// ctx：{ cues, videoDur, mediaDur(src) → 秒數或 null, schema: { scenes: [...], fx: [...] }（build.mjs --list --json）, memory: { [id]: { had, value } } }
export function sanitizeSegments(segments, plan, ctx = {}) {
  const errors = [], updates = [];
  const memory = { ...(ctx.memory || {}) };
  if (segments == null) return { updates, memory, errors };
  if (!isObj(segments)) return { updates, memory, errors: ['segments 要是物件 → { "m01": { "enter": "fade" } }'] };
  const list = Array.isArray(plan?.scenes) ? plan.scenes : [];
  const byId = new Map(list.filter((s) => isObj(s) && s.id).map((s) => [String(s.id), s]));
  const cues = ctx.cues || [];
  for (const [id, v] of Object.entries(segments)) {
    const seg = byId.get(id);
    if (!seg) { errors.push(`找不到段「${id}」→ plan.json 裡沒有這個 id`); continue; }
    const type = seg.type ?? 'scene';
    const allowed = [...LIMITS.segCommon, ...(type === 'media' ? LIMITS.segMedia : []), ...(type === 'scene' ? LIMITS.segScene : []), ...(type === 'fx' ? LIMITS.segFx : [])];
    if (!isObj(v)) { errors.push(`段 ${id} 要是物件`); continue; }
    const set = {}, del = [];
    for (const [k, val] of Object.entries(v)) {
      if (!allowed.includes(k)) { errors.push(`段 ${id}（${type}）不能改「${k}」→ 剪輯台只能改 ${allowed.join('、')}，其他欄位請 AI 改`); continue; }
      if (k === 'sfxVolume') {
        if (val === null || val === 0) del.push('sfxVolume');
        else if (!isNum(val) || val < LIMITS.volume[0] || val > LIMITS.volume[1]) errors.push(`段 ${id} 的 sfxVolume 要是 −60～+12 的 dB 數字，現在是 ${JSON.stringify(val)}`);
        else set.sfxVolume = r1(val);
      } else if (k === 'sfx') {
        if (val === null) {
          if (seg.sfx !== null) memory[id] = { had: 'sfx' in seg, value: seg.sfx ?? null };
          set.sfx = null;
        } else if (isObj(val) && val.restore === true && Object.keys(val).length === 1) {
          if (seg.sfx === null) {
            const m = memory[id];
            if (m?.had && m.value != null) set.sfx = m.value; else del.push('sfx');
            delete memory[id];
          }
        } else errors.push(`段 ${id} 的 sfx 只能設成 null（靜音）或 { "restore": true }（還原 AI 原本寫的音效）`);
      } else if (k === 'enter' || k === 'exit') {
        if (!LIMITS.enterExit.includes(val)) errors.push(`段 ${id} 的 ${k} 要是 ${LIMITS.enterExit.join('、')}，現在是 ${JSON.stringify(val)}`);
        else set[k] = val;
      } else if (k === 'volume') {
        if (val === null) set.volume = null;
        else if (!isNum(val) || val < LIMITS.volume[0] || val > LIMITS.volume[1]) errors.push(`段 ${id} 的 volume 要是 null（靜音）或 −60～+12 的 dB 數字，現在是 ${JSON.stringify(val)}`);
        else set.volume = r1(val);
      } else if (k === 'from' || k === 'to') {
        if (same(val, seg[k])) { set[k] = val; continue; }
        if (isNum(val)) {
          if (val < 0 || (ctx.videoDur != null && val > ctx.videoDur + 0.01)) errors.push(`段 ${id} 的 ${k} 要在影片範圍內（0–${ctx.videoDur}），現在是 ${val}`);
          else set[k] = r2(val);
        } else if (parseRef(val)) {
          const n = parseRef(val).n;
          if (!cues.some((c) => c.n === n)) errors.push(`段 ${id} 的 ${k}「${val}」：字幕沒有第 ${n} 句`);
          else if (refTime(val, cues) == null) errors.push(`段 ${id} 的 ${k}「${val}」：第 ${n} 句字幕裡找不到這個詞（原文：${cues.find((c) => c.n === n).text}）`);
          else set[k] = val;
        } else errors.push(`段 ${id} 的 ${k} 要是 "#N"、"#Ne"、"#N+秒"、"#N@詞" 或秒數，現在是 ${JSON.stringify(val)}`);
      } else if (k === 'in') {
        if (!isNum(val) || val < 0) errors.push(`段 ${id} 的 in 要是 0 以上的秒數，現在是 ${JSON.stringify(val)}`);
        else set.in = r2(val);
      } else if (k === 'anchor') {
        if (val === null) del.push('anchor');
        else if (typeof val !== 'string' || !val.trim() || val.length > 40) errors.push(`段 ${id} 的 anchor 要是 1–40 字的文字，或 null（拿掉）`);
        else set.anchor = val;
      } else if (k === 'slots') {
        const e = checkSlots(id, seg.slots || {}, val, findSceneDef(ctx.schema?.scenes, seg.scene));
        if (e.length) errors.push(...e); else set.slots = val;
      } else if (k === 'vars') {
        const e = checkVars(id, seg.vars || {}, val, findFxDef(ctx.schema?.fx, seg.fx));
        if (e.length) errors.push(...e); else set.vars = val;
      }
    }
    // media：改了 from／to／in 就檢查段長與素材長度
    if (type === 'media' && ('from' in set || 'to' in set || 'in' in set)) {
      if ('to' in set && 'duration' in seg) del.push('duration');
      const next = { ...seg, ...set };
      if (del.includes('duration')) delete next.duration;
      const rg = segRange(next, cues);
      if (rg) {
        const len = rg[1] - rg[0];
        if (len < LIMITS.minMedia - 0.01) errors.push(`段 ${id} 只剩 ${r2(len)} 秒 → 插入素材最短 ${LIMITS.minMedia} 秒`);
        const srcDur = ctx.mediaDur?.(seg.src);
        const speed = isNum(next.speed) ? next.speed : 1;
        const start = isNum(next.in) ? next.in : 0;
        if (srcDur != null && start + len * speed > srcDur + 0.05) errors.push(`段 ${id}：素材從 ${r2(start)} 秒開始播 ${r2(len)} 秒${speed !== 1 ? `（×${speed}）` : ''}，超過素材長度 ${r2(srcDur)} 秒 → 縮短這段或把起點往前`);
        if (start < 0) errors.push(`段 ${id} 的 in 不能小於 0`);
      }
    }
    updates.push([id, set, del]);
  }
  return { updates, memory, errors };
}

// ---------- plan.json 的寫法：只改動到的地方，其他文字（AI 的排版）原封不動 ----------

function detectIndent(text) {
  const m = text.match(/\n([ \t]+)["}\]]/);
  return m ? m[1] : '  ';
}
function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (isObj(v)) { const e = Object.entries(v); return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}'; }
  return JSON.stringify(v) ?? 'null';
}
function pretty(v, ind, level = 0, max = 100) {
  const one = inline(v);
  if ((!Array.isArray(v) && !isObj(v)) || ind.length * level + one.length <= max) return one;
  const pad = ind.repeat(level), inner = ind.repeat(level + 1);
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + pretty(x, ind, level + 1, max)).join(',\n')}\n${pad}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${pretty(x, ind, level + 1, max)}`).join(',\n')}\n${pad}}`;
}
// 掃 JSON 文字：某個物件／陣列每個 key（或元素）的值在文字裡的位置
function scanJson(text, start) {
  let i = start;
  const n = text.length;
  const ws = () => { while (i < n && ' \t\r\n'.includes(text[i])) i++; };
  const str = () => { const a = i++; while (i < n && text[i] !== '"') { if (text[i] === '\\') i++; i++; } i++; return text.slice(a, i); };
  const value = () => {
    ws();
    const a = i, c = text[i];
    if (c === '"') { str(); return [a, i]; }
    if (c === '{' || c === '[') {
      let depth = 0;
      while (i < n) {
        const ch = text[i];
        if (ch === '"') { str(); continue; }
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') { depth--; if (depth === 0) { i++; return [a, i]; } }
        i++;
      }
      throw new Error('JSON 沒有收尾');
    }
    while (i < n && !' \t\r\n,}]'.includes(text[i])) i++;
    return [a, i];
  };
  ws();
  const open = text[i];
  if (open !== '{' && open !== '[') return null;
  i++;
  const entries = [];
  for (;;) {
    ws();
    if (text[i] === '}' || text[i] === ']') return { entries, close: i };
    const keyStart = i;
    let key = null;
    if (open === '{') { key = JSON.parse(str()); ws(); if (text[i++] !== ':') return null; }
    const [vs, ve] = value();
    entries.push({ key, keyStart, start: vs, end: ve });
    ws();
    if (text[i] === ',') { i++; continue; }
    if (text[i] === '}' || text[i] === ']') return { entries, close: i };
    return null;
  }
}
// 第一層 look（contracts/look.md §7.1）：{ color, slim } 兩個都要有、beauty（美顏 0–1）選填；null＝拿掉（回到 kit/look.json 預設）
export function sanitizeLook(v) {
  if (v === null) return { look: null, errors: [] };
  if (!isObj(v)) return { look: undefined, errors: ['look 要是 { "color": 0–1, "slim": 0–1.2 } 或 null（恢復預設）'] };
  const errors = [];
  for (const k of Object.keys(v)) if (!['color', 'slim', 'beauty'].includes(k)) errors.push(`look 不能有「${k}」→ 只能寫 color、slim、beauty`);
  const [c0, c1] = LOOK_LIMITS.color, [s0, s1] = LOOK_LIMITS.slim;
  if (!isNum(v.color) || v.color < c0 || v.color > c1) errors.push(`look.color 要是 ${c0}–${c1} 的數字，現在是 ${JSON.stringify(v.color)}`);
  if (!isNum(v.slim) || v.slim < s0 || v.slim > s1) errors.push(`look.slim 要是 ${s0}–${s1} 的數字，現在是 ${JSON.stringify(v.slim)}`);
  const [b0, b1] = LOOK_LIMITS.beauty;
  if ('beauty' in v && (!isNum(v.beauty) || v.beauty < b0 || v.beauty > b1)) errors.push(`look.beauty 要是 ${b0}–${b1} 的數字，現在是 ${JSON.stringify(v.beauty)}`);
  return errors.length ? { look: undefined, errors } : { look: { color: r2(v.color), slim: r2(v.slim), ...(v.beauty > 0 ? { beauty: r2(v.beauty) } : {}) }, errors };
}
// 第一層 theme（design-system §10）：亮／暗；不寫＝亮色
export function sanitizeTheme(v) {
  if (v === null) return { theme: null, errors: [] };
  if (LIMITS.themes.includes(v)) return { theme: v, errors: [] };
  return { theme: undefined, errors: [`theme 只能是 "light"（亮，預設）或 "dark"（暗），現在是 ${JSON.stringify(v)}`] };
}
// 構圖裁切 frame＝[x, y, w, h]（畫布座標，cv＝{ W, H }）或 null（不裁切）：寬高比和畫布一樣（差 1% 內）、整個在畫布裡、最多放大 maxZoom 倍；整個畫面＝null
export function sanitizeFrame(v, cv) {
  if (v === null) return { frame: null, errors: [] };
  if (!cv) return { frame: undefined, errors: ['不知道畫布尺寸，不能存 frame → 重新載入構圖台'] };
  const { W, H } = cv;
  if (!Array.isArray(v) || v.length !== 4 || !v.every(isNum)) return { frame: undefined, errors: [`frame 要是 [x, y, w, h]（${W}×${H} 座標）或 null（不裁切），現在是 ${JSON.stringify(v)}`] };
  const [x, y, w, h] = v.map((n) => Math.round(n));
  const errors = [];
  if (x < 0 || y < 0 || x + w > W || y + h > H) errors.push(`frame 要整個在畫面裡（x 0–${W}、y 0–${H}），現在是 [${x}, ${y}, ${w}, ${h}]`);
  if (w < W / LIMITS.frame.maxZoom - 1) errors.push(`frame 最多放大 ${LIMITS.frame.maxZoom} 倍（寬至少 ${Math.ceil(W / LIMITS.frame.maxZoom)}），現在寬 ${w}`);
  if (!(h > 0) || Math.abs(w / h - W / H) > 0.01 * (W / H)) errors.push(`frame 的寬高比要和畫面一樣（${W}:${H}），現在是 ${w}×${h}`);
  if (errors.length) return { frame: undefined, errors };
  return { frame: w >= W && h >= H ? null : [x, y, w, h], errors };
}
// speakerBox［x1, y1, x2, y2］、pipCrop［x, y, w, h］是裁切後畫面的座標：換框時換算成新框裡的同一塊畫面（from／to 是舊／新 frame，null＝整個畫面）。
// speakerBox 夾在畫面裡；pipCrop 出界就交回 "auto"（用 speakerBox 算）
export function remapToFrame(rect, from, to, cv, kind = 'box') {
  const { W, H } = cv, F0 = from || [0, 0, W, H], F1 = to || [0, 0, W, H];
  const X = (v) => ((F0[0] + (v * F0[2]) / W) - F1[0]) * (W / F1[2]), Y = (v) => ((F0[1] + (v * F0[3]) / H) - F1[1]) * (H / F1[3]);
  if (kind === 'box') {
    const cl = (v, hi) => Math.round(Math.min(Math.max(v, 0), hi));
    return [cl(X(rect[0]), W), cl(Y(rect[1]), H), cl(X(rect[2]), W), cl(Y(rect[3]), H)];
  }
  const x1 = X(rect[0]), y1 = Y(rect[1]), x2 = X(rect[0] + rect[2]), y2 = Y(rect[1] + rect[3]);
  if (x1 < -0.5 || y1 < -0.5 || x2 > W + 0.5 || y2 > H + 0.5) return 'auto';
  return [Math.round(Math.max(0, x1)), Math.round(Math.max(0, y1)), Math.round(x2 - x1), Math.round(y2 - y1)];
}
// 第一層的 look／theme：null＝拿掉；原本有就原地換；沒有就插在 edit（沒有 edit 就 scenes）前面
function withTop(plan, key, value) {
  if (value === null) { const o = { ...plan }; delete o[key]; return o; }
  if (key in plan) return { ...plan, [key]: value };
  const out = {};
  for (const [k, v] of Object.entries(plan)) {
    if ((k === 'edit' || k === 'scenes') && !(key in out)) out[key] = value;
    out[k] = v;
  }
  if (!(key in out)) out[key] = value;
  return out;
}

function surgicalText(planText, next, { edit, segIdx, look, theme, frame, speakerBox, pipCrop }) {
  const ind = detectIndent(planText);
  const nl = /\r\n/.test(planText) ? '\r\n' : '\n';
  const fix = (s) => s.replace(/\n/g, nl);
  const top = scanJson(planText, 0);
  if (!top) return null;
  const ops = [];
  if (edit) {
    const e = top.entries.find((x) => x.key === 'edit');
    const val = fix(pretty(next.edit, ind, 1));
    if (e) ops.push([e.start, e.end, val]);
    else {
      const sc = top.entries.find((x) => x.key === 'scenes');
      if (sc) ops.push([sc.keyStart, sc.keyStart, `"edit": ${val},${nl}${ind}`]);
      else if (top.entries.length) { const last = top.entries[top.entries.length - 1]; ops.push([last.end, last.end, `,${nl}${ind}"edit": ${val}`]); }
      else ops.push([top.close, top.close, `${nl}${ind}"edit": ${val}${nl}`]);
    }
  }
  // 第一層的單一鍵（theme、look）：拿掉／原地換／插在 edit（或 scenes）前面。
  // 同一個位置插好幾個時，後推的會排在前面：照 edit → theme → look 的順序推，文字順序才會和 withTop 的物件順序（look、theme、edit）一樣
  const topKey = (key, value) => {
    const k = top.entries.findIndex((x) => x.key === key);
    if (value === null) {
      if (k >= 0) {
        // 吃掉前一個值後面的「,＋空白」到這個值的結尾：後面的換行與縮排留給下一個鍵（FR-043：只有這一段消失）
        const e = top.entries[k], nx = top.entries[k + 1], pv = top.entries[k - 1];
        if (pv) ops.push([pv.end, e.end, '']);
        else if (nx) ops.push([e.keyStart, nx.keyStart, '']);
        else ops.push([e.keyStart, e.end, '']);
      }
      return;
    }
    const val = inline(next[key]);
    if (k >= 0) ops.push([top.entries[k].start, top.entries[k].end, val]);
    else {
      const at = top.entries.find((x) => x.key === 'edit') || top.entries.find((x) => x.key === 'scenes');
      if (at) ops.push([at.keyStart, at.keyStart, `"${key}": ${val},${nl}${ind}`]);
      else if (top.entries.length) { const last = top.entries[top.entries.length - 1]; ops.push([last.end, last.end, `,${nl}${ind}"${key}": ${val}`]); }
      else ops.push([top.close, top.close, `${nl}${ind}"${key}": ${val}${nl}`]);
    }
  };
  if (frame !== undefined) topKey('frame', frame);
  if (theme !== undefined) topKey('theme', theme);
  if (look !== undefined) topKey('look', look);
  if (speakerBox !== undefined) topKey('speakerBox', speakerBox);
  if (pipCrop !== undefined) topKey('pipCrop', pipCrop);
  if (segIdx.length) {
    const sc = top.entries.find((x) => x.key === 'scenes');
    const arr = sc && scanJson(planText, sc.start);
    if (!arr) return null;
    arr.entries.forEach((el, k) => {
      const seg = next.scenes[k];
      if (!isObj(seg) || !segIdx.includes(k)) return;
      const orig = planText.slice(el.start, el.end);
      ops.push([el.start, el.end, orig.includes('\n') ? fix(pretty(seg, ind, 2)) : inline(seg)]);
    });
  }
  let out = planText;
  for (const [a, b, t] of ops.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + t + out.slice(b);
  try { return JSON.stringify(JSON.parse(out)) === JSON.stringify(next) ? out : null; } catch { return null; }
}
function withEdit(plan, edit) {
  if ('edit' in plan) return { ...plan, edit };
  const out = {};
  for (const [k, v] of Object.entries(plan)) {
    if (k === 'scenes' && !('edit' in out)) out.edit = edit;
    out[k] = v;
  }
  if (!('edit' in out)) out.edit = edit;
  return out;
}

// 目前的 plan.json／rough.srt 文字＋存檔內容 → { text, srtText, plan, edit, cues, memory, anchors, errors }
//   text／srtText 為 null＝那個檔不用改
//   順序：字幕操作（重播 srt.ops，順便把 plan.json 的句號重新對應）→ edit → 各段欄位（頁面送來的是「新句號」底下的值）
// ctx：{ videoDur, srtText, mediaDur, schema, memory }
export function applySave(planText, body, ctx = {}) {
  if (!isObj(body)) return { errors: ['要送 JSON 物件 → { "base": {…}, "edit": {…}, "segments": {…}, "srt": { "ops": […] } }'] };
  const errors = [];
  for (const k of Object.keys(body)) if (!LIMITS.bodyKeys.includes(k)) errors.push(`剪輯台只能寫 plan.json 的 edit、段落的允許欄位與字幕，不能寫「${k}」→ 其他欄位請 AI 改 plan.json`);
  let plan;
  try { plan = JSON.parse(planText); } catch (e) { return { errors: [`plan.json 不是合法的 JSON：${e.message} → 請 AI 先修好 plan.json 再存`] }; }
  if (!isObj(plan)) return { errors: ['plan.json 最外層要是物件 → 請 AI 檢查 plan.json'] };
  // 字幕
  const srtIn = ctx.srtText != null ? parseSrtBlocks(ctx.srtText) : null;
  let cues = srtIn ? srtIn.blocks.map(({ n, start, end, text }, i) => ({ n, start, end, text, src: i })) : [];
  const cues0 = cues;
  let planR = plan, anchors = [], srtChanged = false, structural = false;
  if (body.srt != null) {
    const ops = isObj(body.srt) ? body.srt.ops : null;
    for (const k of Object.keys(isObj(body.srt) ? body.srt : {})) if (k !== 'ops') errors.push(`srt 只能寫 ops，不能寫「${k}」`);
    if (!Array.isArray(ops)) errors.push('srt 要寫成 { "ops": [ { "op": "set", "n": 3, "text": "…" }, … ] }');
    else if (ops.length) {
      if (!srtIn) errors.push('找不到 work/rough.srt → 沒有字幕可以改（請 AI 先完成剪乾淨的轉字幕）');
      else {
        const r = replay(cues, plan, ops, { videoDur: ctx.videoDur ?? null });
        errors.push(...r.errors);
        if (!r.errors.length) { cues = r.cues; planR = r.plan; anchors = r.anchors; structural = r.structural; srtChanged = true; }
      }
    }
  }
  let edit = null;
  if (body.edit !== undefined) {
    const r = sanitizeEdit(body.edit, ctx);
    errors.push(...r.errors);
    edit = r.edit;
  }
  // media（v1 的寫法）併進 segments
  let segments = body.segments;
  if (body.media != null) {
    if (!isObj(body.media)) errors.push('media 要是物件 → { "m01": { "enter": "fade" } }');
    else {
      const mediaIds = new Set((planR.scenes || []).filter((s) => isObj(s) && s.type === 'media').map((s) => String(s.id)));
      for (const id of Object.keys(body.media)) if (!mediaIds.has(id)) errors.push(`找不到 media 段「${id}」→ 剪輯台只能改 plan.json 裡 type: "media" 的段（現有：${[...mediaIds].join('、') || '沒有'}）`);
      segments = { ...body.media, ...(isObj(segments) ? segments : {}) };
    }
  }
  const s = sanitizeSegments(segments, planR, { ...ctx, cues });
  errors.push(...s.errors);
  let look;
  if (body.look !== undefined) {
    const r = sanitizeLook(body.look);
    errors.push(...r.errors);
    look = r.look;
    if (look === null ? !('look' in plan) : same(look, plan.look)) look = undefined;   // 沒變就不動
  }
  let theme;
  if (body.theme !== undefined) {
    const r = sanitizeTheme(body.theme);
    errors.push(...r.errors);
    theme = r.theme;
    // 沒變就不動：值一樣、拿掉本來就沒有的、本來沒寫（＝亮）又選亮
    if (theme === null ? !('theme' in plan) : plan.theme === theme || (theme === 'light' && !('theme' in plan))) theme = undefined;
  }
  let frame;
  if (body.frame !== undefined) {
    const r = sanitizeFrame(body.frame, ctx.canvas);
    errors.push(...r.errors);
    frame = r.frame;
    if (frame === null ? !('frame' in plan) : same(frame, plan.frame)) frame = undefined;   // 沒變就不動
  }
  if (errors.length) return { errors };
  let next = edit ? withEdit(planR, edit) : planR;
  if (look !== undefined) next = withTop(next, 'look', look);
  if (theme !== undefined) next = withTop(next, 'theme', theme);
  // 換框：speakerBox、pipCrop 是裁切後的座標，跟著換算（不用重量）
  const notes = [];
  let speakerBox, pipCrop;
  if (frame !== undefined) {
    next = withTop(next, 'frame', frame);
    const old = Array.isArray(plan.frame) ? plan.frame : null;
    if (Array.isArray(plan.speakerBox) && plan.speakerBox.length === 4 && plan.speakerBox.every(isNum)) {
      speakerBox = remapToFrame(plan.speakerBox, old, frame, ctx.canvas, 'box');
      if (same(speakerBox, plan.speakerBox)) speakerBox = undefined;
      else { next = withTop(next, 'speakerBox', speakerBox); notes.push(`speakerBox 跟著新的框換算：[${plan.speakerBox.join(', ')}] → [${speakerBox.join(', ')}]`); }
    }
    if (Array.isArray(plan.pipCrop) && plan.pipCrop.length === 4 && plan.pipCrop.every(isNum)) {
      pipCrop = remapToFrame(plan.pipCrop, old, frame, ctx.canvas, 'rect');
      if (same(pipCrop, plan.pipCrop)) pipCrop = undefined;
      else { next = withTop(next, 'pipCrop', pipCrop); notes.push(pipCrop === 'auto' ? 'pipCrop 換算後超出畫面，改回 "auto"（用 speakerBox 算）' : `pipCrop 跟著新的框換算：[${plan.pipCrop.join(', ')}] → [${pipCrop.join(', ')}]`); }
    }
  }
  const changed = s.updates.filter(([, set, del]) => Object.keys(set).length || del.length);
  if (changed.length) {
    next = { ...next, scenes: next.scenes.map((seg) => {
      const u = isObj(seg) && changed.find(([id]) => id === String(seg.id));
      if (!u) return seg;
      const o = { ...seg, ...u[1] };
      for (const k of u[2]) delete o[k];
      return o;
    }) };
  }
  // plan.json：有變的段（剪輯台改的＋句號重新對應的）才重寫
  const segIdx = (next.scenes || []).map((seg, i) => (same(seg, plan.scenes?.[i]) ? -1 : i)).filter((i) => i >= 0);
  let text = null;
  if (edit || segIdx.length || look !== undefined || theme !== undefined || frame !== undefined) {
    try { text = surgicalText(planText, next, { edit, segIdx, look, theme, frame, speakerBox, pipCrop }); } catch { text = null; }
    if (text == null) {
      text = JSON.stringify(next, null, detectIndent(planText)) + '\n';
      if (/\r\n/.test(planText)) text = text.replace(/\n/g, '\r\n');
    }
    if (text === planText) text = null;
  }
  const srtText = srtChanged ? writeSrt(ctx.srtText, cues, { renumber: structural }) : null;
  return { text, srtText: srtText === ctx.srtText ? null : srtText, plan: next, edit, cues: srtChanged ? cues.map(({ n, start, end, text: t }) => ({ n, start, end, text: t })) : cues0.map(({ n, start, end, text: t }) => ({ n, start, end, text: t })), memory: s.memory, anchors, notes, errors: [] };
}

// ---------- rough.srt ----------

const toSec = (stamp) => {
  const [h, m, rest] = stamp.trim().split(':');
  const [s, ms = '0'] = rest.split(/[,.]/);
  return +(Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0').slice(0, 3)) / 1000).toFixed(3);
};
export function srtStamp(t) {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

// 解析成區塊（保留原文，沒改的句子原封不動寫回）；cues 跟 lib/srt.mjs 的 parseSrt 一樣
export function parseSrtBlocks(text) {
  const raw = String(text);
  const bom = raw.startsWith('﻿');
  const body = bom ? raw.slice(1) : raw;
  const eol = /\r\n/.test(body) ? '\r\n' : '\n';
  const trailing = /\r?\n$/.test(body);
  const blocks = [];
  for (const block of body.trim().split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) continue;
    const n = Number(lines[0].trim());
    const m = lines[1].match(/([\d:,.]+)\s*-->\s*([\d:,.]+)/);
    if (!Number.isInteger(n) || !m) continue;
    blocks.push({ n, start: toSec(m[1]), end: toSec(m[2]), text: lines.slice(2).join(' ').trim(), lines: lines.slice(2), timing: lines[1], raw: block.replace(/\r?\n/g, eol) });
  }
  blocks.sort((a, b) => a.n - b.n);
  return { bom, eol, trailing, blocks };
}

// cues（src＝原檔第幾個區塊）→ rough.srt 新內容：沒改的區塊原封不動，句號、時間、文字有改的才重寫那一行
export function writeSrt(srtText, cues, { renumber = false } = {}) {
  const P = parseSrtBlocks(srtText ?? '');
  const out = cues.map((c, i) => {
    const n = renumber ? i + 1 : c.n;
    const b = c.src != null ? P.blocks[c.src] : null;
    if (b && b.n === n && b.start === c.start && b.end === c.end && b.text === c.text) return b.raw;
    const timing = b && b.start === c.start && b.end === c.end ? b.timing : `${srtStamp(c.start)} --> ${srtStamp(c.end)}`;
    const textPart = b && b.text === c.text ? b.lines.join(P.eol) : c.text;
    return `${n}${P.eol}${timing}${P.eol}${textPart}`;
  });
  return (P.bom ? '﻿' : '') + out.join(P.eol + P.eol) + (P.trailing || !srtText ? P.eol : '');
}

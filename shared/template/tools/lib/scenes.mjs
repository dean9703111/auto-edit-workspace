// 情境庫：載入 scene.json＋template、圖示、字數計算、單段解析（slots／beats／清單時間／規則）
// 移植自 hyperframes-scenes scripts/lib/scenes-lib.mjs；輸入改成 plan.json 的物件，時間在這裡就換成「相對本段起點的秒數」。
//
//   loadScenes(templateDir)          → scene[]（依 no 排序；scene.template = { style, body, timeline }）
//   findScene(scenes, ref)           → key／中文名／別名／編號／資料夾名都認；沒有回 null
//   suggestScenes(scenes, ref)       → 相近名稱（錯誤訊息用）
//   loadIcons(templateDir)           → { names, get(name) → svg|null }
//   loadFx(templateDir)              → [{ no, slug, file, zh, en, category, when, bg, vars:[{id,type,label,default,options}] }]
//   motionConsts(kitDir)             → { OUT, BEAT, HOLD_END, IN, READ, DRIFT, PUSH }
//   visibleLen / richHtml / richPlain
//   resolveScene({ scene, seg, cues, icons, consts, t0, D, where }) → { ctx, beats, listTimes, tone, errors, warnings }
//   sampleSeg(scene)                 → 用 scene.sample 組成 plan.json 形式的一段（預覽頁、測試用）

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseTime, cueSeconds, r3 } from './time.mjs';

// ---------- 載入 ----------

function splitTemplate(text) {
  const out = { style: '', body: '', timeline: '' };
  const parts = text.split(/<!--\s*@(style|body|timeline)\s*-->/);
  for (let i = 1; i < parts.length; i += 2) out[parts[i]] = parts[i + 1].replace(/^\r?\n/, '').replace(/\s+$/, '') + '\n';
  return out;
}

export function loadScenes(templateDir) {
  const root = path.join(templateDir, 'scenes');
  const scenes = [];
  if (!existsSync(root)) return scenes;
  for (const name of readdirSync(root).sort()) {
    const dir = path.join(root, name);
    const jf = path.join(dir, 'scene.json');
    if (!statSync(dir).isDirectory() || !existsSync(jf)) continue;
    const json = JSON.parse(readFileSync(jf, 'utf8'));
    const tf = path.join(dir, 'template.html');
    scenes.push({ ...json, dirName: name, num: name.split('-')[0], dir, template: splitTemplate(existsSync(tf) ? readFileSync(tf, 'utf8') : '') });
  }
  return scenes.sort((a, b) => a.num.localeCompare(b.num, 'en', { numeric: true }));
}

export function findScene(scenes, ref) {
  const raw = String(ref ?? '').trim();
  const r = raw.toLowerCase();
  if (!r) return null;
  return scenes.find((s) => s.key?.toLowerCase() === r || s.zh === raw || (s.aliases || []).some((a) => a === raw || a.toLowerCase() === r)
    || s.dirName?.toLowerCase() === r || s.num.toLowerCase() === r || String(s.no).toLowerCase() === r) || null;
}

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
export function nearest(query, names, k = 3) {
  const q = String(query).toLowerCase();
  return [...new Set(names)].map((n) => ({ n, s: (n.toLowerCase().includes(q) || q.includes(n.toLowerCase()) ? 0 : 100) + lev(q, n.toLowerCase()) }))
    .sort((a, b) => a.s - b.s).slice(0, k).map((x) => x.n);
}
export const suggestScenes = (scenes, ref) => nearest(ref, scenes.flatMap((s) => [s.key, s.zh, ...(s.aliases || [])].filter(Boolean)));

// 圖示的每個形狀都帶 class="stroke-draw" pathLength="1"，模板可以用 P.icon／P.stroke 把線「描出來」；
// 沒有呼叫描線的模板照常是完整的線（虛線只在描線那幾拍由 GSAP 設定，描完設回 none）。
export function loadIcons(templateDir) {
  const f = path.join(templateDir, 'kit', 'icons.json');
  const map = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  const clean = (svg) => String(svg).replace(/<!--[\s\S]*?-->/g, '').trim()
    .replace(/<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs.replace(/\s+(?:class|width|height)\s*=\s*"[^"]*"/g, '')}>`)
    .replace(/<(path|rect|circle|ellipse|line|polyline|polygon)\b/g, '<$1 class="stroke-draw" pathLength="1"')
    .replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').replace(/\s+>/g, '>');
  return {
    names: Object.keys(map),
    get: (name) => (Object.prototype.hasOwnProperty.call(map, name) ? clean(map[name]) : null),
  };
}

export function loadFx(templateDir) {
  const dir = path.join(templateDir, 'fx');
  const cf = path.join(dir, 'catalog.json');
  if (!existsSync(cf)) return [];
  const cat = JSON.parse(readFileSync(cf, 'utf8'));
  return (cat.effects || []).map((e) => {
    const file = path.join(dir, e.file);
    let vars = [];
    if (existsSync(file)) {
      const m = readFileSync(file, 'utf8').match(/data-composition-variables='([\s\S]*?)'/);
      if (m) { try { vars = JSON.parse(m[1]); } catch { vars = []; } }
    }
    return { no: Number(e.id), id: e.id, slug: e.slug, file, fileName: path.basename(e.file), zh: e.zh, en: e.en, category: e.category, when: e.when, bg: e.bg, tag: e.tag, sfx: e.sfx ?? null, vars };
  });
}

export function motionConsts(kitDir) {
  const c = { OUT: 0.4, BEAT: 0.15, HOLD_END: 1.5, IN: 0.5, READ: 1.2, DRIFT: 16, PUSH: 0.7 };
  const f = path.join(kitDir, 'scene-motion.js');
  if (existsSync(f)) {
    const t = readFileSync(f, 'utf8');
    for (const k of Object.keys(c)) {
      const m = t.match(new RegExp(`\\b${k}\\s*[:=]\\s*([\\d.]+)`));
      if (m) c[k] = Number(m[1]);
    }
  }
  return c;
}

// ---------- 文字 ----------

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const richPlain = (s) => String(s).replace(/\*\*/g, '').replace(/(?<!:)\/\//g, '');
export function visibleLen(s) {
  let n = 0;
  for (const ch of richPlain(s)) n += ch.codePointAt(0) >= 0x20 && ch.codePointAt(0) <= 0x7e ? 0.5 : 1;
  return Math.round(n);
}
export function richHtml(s) {
  return escHtml(s).replace(/\*\*(.+?)\*\*/g, '<span class="sc-kw">$1</span>').replace(/(?<!:)\/\//g, '<br>');
}

// 「值 ｜k=v k2=v2」→ { value, attrs }（scene.json 的 sample 寫法，plan.json 也接受）
const ATTR_RE = /[\w.-]+=(?:"[^"]*"|\S+)/;
const ATTRS_TAIL = new RegExp(`\\s*[｜|]\\s*((?:${ATTR_RE.source}\\s*)+)$`);
export function parseValue(raw) {
  let rest = String(raw).trim();
  const attrs = {};
  const tm = rest.match(ATTRS_TAIL);
  if (tm) {
    const re = /([\w.-]+)=("([^"]*)"|\S+)/g;
    let m;
    while ((m = re.exec(tm[1]))) attrs[m[1]] = m[3] !== undefined ? m[3] : m[2];
    rest = rest.slice(0, tm.index).trim();
  }
  return { value: rest, attrs };
}

// ---------- 運算式 ----------

// scene.json 的 beat 預設值是 JS 運算式（可引用 {{其他 beat}}、D、P.*），在這裡直接算成數字
function evalExpr(expr, vars, D, P) {
  const src = String(expr).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`引用了還沒定義的時間點 {{${k}}}`);
    return `(${vars[k]})`;
  });
  // eslint-disable-next-line no-new-func
  const v = new Function('D', 'P', `"use strict"; return (${src});`)(D, P);
  if (!Number.isFinite(v)) throw new Error(`運算式算不出數字：${expr}`);
  return r3(v);
}

// ---------- 單段解析 ----------

const fieldDecls = (decl) => {
  const it = decl.item || decl.fields;
  if (!it) return { text: { type: 'text' } };
  if (Array.isArray(it)) return Object.fromEntries(it.map((k) => [k, { type: 'text' }]));
  return it;
};

const limitText = (decl) => {
  const p = [];
  if (decl.max != null) p.push(`≤ ${decl.max} 字`);
  if (decl.maxLines != null) p.push(`最多 ${decl.maxLines} 行`);
  if (decl.maxLine != null) p.push(`每行 ≤ ${decl.maxLine}`);
  return p.join('、');
};

// opts: { scene, seg, cues, icons, consts, t0（本段起點，絕對秒）, D, where（錯誤訊息前綴）}
export function resolveScene(opts) {
  const { scene, seg, cues = [], icons, consts: P, t0 = 0, D } = opts;
  const where = opts.where || `[${seg.id || '?'} ${scene.key}]`;
  const errors = [], warnings = [];
  const err = (m) => errors.push(`${where} ${m}`);
  const warn = (m) => warnings.push(`${where} ${m}`);
  const slotDecls = scene.slots || {};
  const beatDecls = scene.beats || {};
  const slots = seg.slots || {};
  const beatsIn = seg.beats || {};

  // 相對本段起點的秒數
  const relTime = (v, what) => {
    const t = parseTime(v);
    if (t.error) { err(`${what}：${t.error}`); return null; }
    if (t.kind === 'abs') { err(`${what}：at／beats 不能寫絕對秒數「${t.raw}」，改成 "+${t.sec}"（本段起點後幾秒）或 "#N"（綁字幕句）`); return null; }
    if (t.kind === 'rel') return r3(t.off);
    const c = cueSeconds(t, cues);
    if (c.error) { err(`${what}：${c.error}`); return null; }
    return r3(c.sec - t0);
  };

  for (const k of Object.keys(slots)) {
    if (!(k in slotDecls)) err(`slots.${k}：這個情境沒有這個欄位（可用：${Object.keys(slotDecls).join('、') || '無'}）`);
  }
  for (const k of Object.keys(beatsIn)) {
    if (!(k in beatDecls)) err(`beats.${k}：這個情境沒有這個時間點（可用：${Object.keys(beatDecls).join('、') || '無'}）`);
  }

  const ctx = {};
  const plainView = {};
  const beatOverride = {};

  const processValue = (key, decl, value, out, label) => {
    const t = decl.type || 'text';
    if (t === 'text' || t === 'rich') {
      const s = String(value);
      const len = visibleLen(s);
      if (decl.max != null && len > decl.max) err(`${label}：「${richPlain(s)}」${len} 字，上限 ${decl.max} → 縮成 ${decl.max} 字以內（全形 1、半形 0.5；不縮字級）`);
      if (decl.maxLine != null || decl.maxLines != null) {
        const lines = s.split('//');
        if (decl.maxLines != null && lines.length > decl.maxLines) err(`${label}：${lines.length} 行，最多 ${decl.maxLines} 行 → 少用一個 //`);
        if (decl.maxLine != null) lines.forEach((ln, i) => { const l = visibleLen(ln); if (l > decl.maxLine) err(`${label}：第 ${i + 1} 行「${richPlain(ln)}」${l} 字，每行上限 ${decl.maxLine} → 縮文案或用 // 換斷行位置（斷在語意處）`); });
      }
      if (t === 'rich') { out[key] = richHtml(s); out[`${key}_text`] = richPlain(s); out[`${key}_len`] = len; }
      else { out[key] = s; out[`${key}_len`] = len; }
      // 每一行的字數（// 斷行），給 scene.json 的 rules 用（例：有圖示時每行上限要少幾字）
      out[`${key}_lines`] = s.split('//').map((ln) => visibleLen(ln));
    } else if (t === 'icon') {
      const name = String(value).trim();
      // "none"：不放圖示（只有非必填的圖示欄位可以；模板用 {{#icon}}…{{/icon}} 包住圖示）
      if (name === 'none' && !decl.required) { out[key] = ''; return; }
      const svg = icons?.get(name);
      if (!svg) { err(`${label}：找不到圖示「${value}」（kit/icons.json；相近：${nearest(String(value), icons?.names || []).join('、')}）`); out[key] = ''; }
      else out[key] = svg;
    } else if (t === 'enum') {
      const o = decl.options || [];
      if (!o.includes(value)) err(`${label}：要是 ${o.join('／')} 其中之一，現在是「${value}」`);
      out[key] = value;
      for (const x of o) if (x === value) out[`${key}_${x}`] = true;
    } else out[key] = String(value);
  };

  // --- 一般 slot ---
  for (const [key, decl] of Object.entries(slotDecls)) {
    if ((decl.type || 'text') === 'list') continue;
    let v = slots[key];
    const label = `slots.${key}（${decl.label || key}）`;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const bn = decl.beat || (`${key}At` in beatDecls ? `${key}At` : key in beatDecls ? key : null);
      if (v.at != null) { if (bn) beatOverride[bn] = { v: v.at, what: `${label}.at` }; else warn(`${label}.at：這個欄位沒有對應的時間點，已忽略`); }
      v = v.text ?? v.value;
    }
    if (Array.isArray(v)) { err(`${label}：要寫字串，不是陣列`); continue; }
    if (v === undefined || v === null || v === '') {
      // toneDefault：依語氣換預設值（例：07 重點的圖示 warn＝警示、good＝打勾），沒寫 tone 才用 default
      const td = decl.toneDefault && ['warn', 'good'].includes(seg.tone) ? decl.toneDefault[seg.tone] : undefined;
      if (td !== undefined) v = String(td);
      else if (decl.default !== undefined && !Array.isArray(decl.default)) v = String(decl.default);
      else if (decl.required) { err(`${label}：必填，沒有寫${limitText(decl) ? `（${limitText(decl)}）` : ''}`); continue; }
      else continue;
    }
    processValue(key, decl, v, ctx, label);
    // 圖示在 rules 裡是「有沒有放」：寫 "none" 的是空字串，不是字面的 "none"
    plainView[key] = typeof ctx[`${key}_text`] === 'string' ? ctx[`${key}_text`] : decl.type === 'icon' ? (ctx[key] ? String(v) : '') : String(v);
  }

  // --- beats（依 scene.json 宣告順序；數字＝相對本段起點秒數）---
  const beats = {};
  for (const [name, decl] of Object.entries(beatDecls)) {
    const label = `beats.${name}（${decl.label || name}）`;
    let t = null;
    const ov = beatsIn[name] != null ? { v: beatsIn[name], what: label } : beatOverride[name];
    if (ov) t = relTime(ov.v, ov.what);
    else if (decl.default != null) {
      try { t = evalExpr(decl.default, beats, D, P); } catch (e) { err(`${label}：${e.message}`); }
    } else err(`${label}：沒有預設值，要在 beats 寫時間`);
    beats[name] = t ?? 0;
  }
  const beatNames = Object.keys(beatDecls);
  const lastBeat = beatNames.length ? beats[beatNames[beatNames.length - 1]] : 0;

  // --- 清單 ---
  const listTimes = {};
  for (const [key, decl] of Object.entries(slotDecls)) {
    if ((decl.type || 'text') !== 'list') continue;
    const label = `slots.${key}（${decl.label || key}）`;
    let given = slots[key];
    if (given !== undefined && !Array.isArray(given)) { err(`${label}：要寫成陣列，例如 ["第一項", "第二項"]`); given = []; }
    if ((given === undefined || given.length === 0) && Array.isArray(decl.default)) given = decl.default;
    given = given || [];
    const min = decl.min ?? 0, maxItems = decl.maxItems ?? Infinity;
    if (given.length < min) err(`${label}：至少 ${min} 項，現在 ${given.length} 項`);
    if (given.length > maxItems) err(`${label}：最多 ${maxItems} 項，現在 ${given.length} 項 → 拆成兩段或換情境`);
    const fields = fieldDecls(decl);
    const fkeys = Object.keys(fields);
    const atTpl = scene.lists?.[key]?.at ?? '{{__last}} + 0.5 + {{i}} * 0.5';
    const times = [];
    ctx[key] = given.map((raw, i) => {
      const il = `${label}[${i}]`;
      const item = {};
      const given2 = {};
      let at = null;
      if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) {
          if (k === 'at') at = v;
          else if (fkeys.includes(k)) given2[k] = v;
          else if (k === 'value') given2[fkeys[0]] = v;
          else err(`${il}.${k}：沒有這個欄位（可用：${[...fkeys, 'at'].join('、')}）`);
        }
      } else {
        const pv = parseValue(String(raw ?? ''));
        if (fkeys.length >= 2 && / \/ /.test(pv.value)) {
          const cols = pv.value.split(/ \/ /).map((s) => s.trim());
          if (cols.length > fkeys.length) err(`${il}：分了 ${cols.length} 欄，最多 ${fkeys.length} 欄`);
          cols.slice(0, fkeys.length).forEach((c, j) => { given2[fkeys[j]] = c; });
        } else if (pv.value !== '') given2[fkeys[0]] = pv.value;
        for (const [k, v] of Object.entries(pv.attrs)) {
          if (k === 'at') at = v;
          else if (fkeys.includes(k)) given2[k] = v;
          else item[k] = v;
        }
      }
      for (const fk of fkeys) {
        const f = fields[fk];
        let v = given2[fk];
        if (v === undefined || v === '') {
          if (f.default !== undefined) v = String(f.default);
          else if (f.required) { err(`${il}：缺「${f.label || fk}」`); continue; }
          else continue;
        }
        processValue(fk, f, v, item, `${il}.${fk}`);
      }
      let t;
      if (at != null) t = relTime(at, `${il}.at`);
      else {
        try { t = evalExpr(atTpl, { ...beats, __last: lastBeat, i, n: i + 1 }, D, P); } catch (e) { err(`${il}：${e.message}`); }
      }
      t = t ?? 0;
      item.at = t;
      times.push(t);
      return item;
    });
    listTimes[key] = times;
    // 選填的項目圖示：同一組清單每一項都要有，或全部不放（作者規則「同一組清單每一條都要有圖示」）；
    // 模板用 {{#<清單>HasIcon}} 切換「圖示版」與「沒有圖示的原版」
    for (const [fk, f] of Object.entries(fields)) {
      if ((f.type || 'text') !== 'icon' || f.required || f.default !== undefined) continue;
      const have = ctx[key].filter((it) => it[fk]).length;
      if (have > 0 && have < ctx[key].length) err(`${label}：只有 ${have}／${ctx[key].length} 項有圖示 → 同一組清單每一項都要有圖示，或全部不放`);
      ctx[`${key}HasIcon`] = have > 0 && have === ctx[key].length;
    }
    if (scene.key === 'fs-compare' && given.some((g) => g && typeof g === 'object' && g.at != null)) warn(`${label}：全畫面對照的單項 at 不生效（整欄一起進），改寫 beats.leftAt／beats.rightAt`);
  }

  // --- 語氣 ---
  let tone = seg.tone ?? null;
  if (tone != null) {
    if (!['warn', 'good'].includes(tone)) { err(`tone：只能是 "warn" 或 "good"，現在是「${tone}」`); tone = null; }
    else if (!scene.tone && !slotDecls.tone) { warn(`tone：這個情境不支援語氣，已忽略`); tone = null; }
  }

  // --- 數值檢查 ---
  if (D != null && D > 0) {
    const seq = (arr, what) => {
      let p = -Infinity;
      arr.forEach(([nm, t]) => { if (t < p - 1e-6) err(`${what}${nm}（${t}s）比前一個（${p}s）還早，順序倒了 → 改成遞增`); p = Math.max(p, t); });
    };
    seq(beatNames.map((n) => [`beats.${n}`, beats[n]]), '');
    for (const [k, ts] of Object.entries(listTimes)) {
      seq(ts.map((t, i) => [`slots.${k}[${i}].at`, t]), '');
      if (beatNames.length && ts.length && ts[0] < lastBeat - 1e-6) warn(`slots.${k}[0].at：第 ${ts[0]}s 出現，比 beats.${beatNames[beatNames.length - 1]}（第 ${lastBeat}s）還早，會在標題前冒出來 → 第一項不寫 at（用預設），或寫 "+${lastBeat}" 之後的時間`);
    }
    const limit = r3(D - P.OUT - 0.6);
    const all = [...beatNames.map((n) => [`beats.${n}`, beats[n]]), ...Object.entries(listTimes).flatMap(([k, ts]) => ts.map((t, i) => [`slots.${k}[${i}].at`, t]))];
    let last = 0;
    for (const [nm, t] of all) {
      if (t < -1e-6) err(`${nm}：在本段起點前 ${r3(-t)}s → 時間點要在本段範圍內（from 之後）`);
      if (t > limit + 1e-6) err(`${nm}：在本段第 ${t}s，晚於 D−0.4−0.6 = ${limit}s（段長 ${D}s，完成態至少要停 0.6s）→ 把 to 往後延到至少第 ${r3(t + P.OUT + 0.6)}s，或把這個時間點提早`);
      last = Math.max(last, t);
    }
    if (all.length && D - P.OUT - last < P.HOLD_END - 1e-6) warn(`最後一個內容在第 ${last}s，到退場只停 ${r3(D - P.OUT - last)}s，建議 ≥ ${P.HOLD_END}s（把 to 往後延）`);
    for (const [name, decl] of Object.entries(beatDecls)) {
      if (!decl.min) continue;
      let lim;
      try { lim = evalExpr(decl.min, beats, D, P); } catch { continue; }
      if (beats[name] < lim - 1e-6) err(`beats.${name}（${decl.label || name}）：第 ${beats[name]}s 太早，至少要第 ${lim}s（留給前一個內容讀完）`);
    }
  }

  // --- scene.json rules ---
  for (const rule of scene.rules || []) {
    try {
      const view = { ...ctx, ...plainView, profile: 'course', yt: false, course: true };
      // eslint-disable-next-line no-new-func
      const hit = new Function('v', 'D', `with (v) { return (${rule.if}); }`)(view, D);
      if (hit) (rule.error ? err : warn)(rule.error || rule.warn || `規則觸發：${rule.if}`);
    } catch (e) { warn(`scene.json 規則「${rule.if}」無法執行：${e.message}`); }
  }

  return { ctx, beats, listTimes, tone, errors, warnings };
}

// ---------- sample ----------

// scene.json 的 sample → plan.json 形式（beats 的數字視為「本段起點後幾秒」）
export function sampleSeg(scene) {
  const s = scene.sample || {};
  const beats = {};
  for (const [k, v] of Object.entries(s.beats || {})) beats[k] = typeof v === 'number' ? `+${v}` : String(v).replace(/^@/, '').replace(/^(\d)/, '+$1');
  return { id: 'pv', scene: scene.key, slots: s.slots || {}, beats, duration: s.duration ?? scene.duration?.fixed ?? scene.duration?.default ?? 6 };
}

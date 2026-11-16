// 055 N4：手改過（build 不覆寫）的情境動畫檔 compositions/<段>-<情境>.html，plan.json 的起點或段長改了 → 檔裡的秒數照起點差平移、const D 換新段長
//
// 情境檔裡的秒數是 build 產生時照「講到那個詞的時間 − 段起點」算好寫死的；手改過的檔 build 不覆寫，起點改了這些秒數就全部晚（或早）了。
// 工具產生的檔頭記下產生時的段起點與段長（<!-- auto-edit: id=… scene=… t0=12.3 d=7.516 hash=… -->），build 遇到手改檔就照起點差平移：
//   P.<動作>(sel, <秒>, …)、tl.<補間>(…, <秒>)、const X = <秒>（含陣列 [<秒>, …]、Math.max／min 裡的秒數）、P.at(<秒>)；
//   const D、P.end(<段長>)、root 的 data-duration 換成新段長。和工具這次產生的檔同一個呼叫、同一個秒數的（段頭進場 0.3 秒這類跟著段走的）不動。
// 認不出的寫法（-0.2 + x 這類，數字不在最前面）→ ✖、整個檔不動，給行號與「怎麼改」。沒有 t0= 的舊檔：用 const D 和現在段長推算，再拿工具這次產生的檔對一次
// （綁詞的秒數都差同一個數＝起點動了那麼多；都一樣＝起點沒動、只改段長），推不出來就 ✖。
//
//   withTimes(html, t0, d) → 檔頭加上（或換掉）t0=、d=（雜湊不變：檔頭那一行不算在雜湊裡）
//   readTimes(html) → { t0, d }（沒有就是 null）
//   shiftHand({ hand, fresh, t0, d, id, file, where }) → { html（要寫回的內容；null＝不用動）, line（報告一行）, errors[] }
import { r3 } from './time.mjs';

const EPS = 1e-3, TOL = 2e-3;
// 舊檔推算時，段頭這幾秒內和工具產生的一樣的秒數當成進場（跟著段走），不算「已經手動改好」（情境模板的段頭進場最晚 0.6 秒）
const ENTER_MAX = 0.6;
const STAMP = /^(<!-- auto-edit: )(.*?)( hash=[0-9a-f]{8} -->)/m;
const fmtS = (n) => String(r3(n));
const signed = (n) => `${n < 0 ? '−' : '+'}${fmtS(Math.abs(n))}`;

export function withTimes(html, t0, d) {
  const m = String(html).slice(0, 600).match(STAMP);
  if (!m) return html;
  const info = m[2].replace(/\s+t0=\S+/, '').replace(/\s+d=\S+/, '') + ` t0=${fmtS(t0)} d=${fmtS(d)}`;
  return html.slice(0, m.index) + m[1] + info + m[3] + html.slice(m.index + m[0].length);
}

export function readTimes(html) {
  const m = String(html).slice(0, 600).match(STAMP);
  if (!m) return null;
  const t0 = m[2].match(/(?:^|\s)t0=(-?[\d.]+)/), d = m[2].match(/(?:^|\s)d=([\d.]+)/);
  return t0 && d ? { t0: Number(t0[1]), d: Number(d[1]) } : null;
}

// 註解、字串的內容換成空白（長度不變、引號留著）：選擇器裡的 :nth-child(1) 不會被當成括號或秒數
function blank(src) {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const j = src.indexOf('\n', i); const e = j < 0 ? n : j; out += ' '.repeat(e - i); i = e; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; out += src.slice(i, e).replace(/[^\n]/g, ' '); i = e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += c + src.slice(i + 1, Math.min(j, n)).replace(/[^\n]/g, ' ') + (j < n ? c : '');
      i = j + 1;
      continue;
    }
    out += c; i++;
  }
  return out;
}
const OPEN = '([{', CLOSE = ')]}';
function closeOf(b, open) {
  let dep = 0;
  for (let i = open; i < b.length; i++) {
    if (OPEN.includes(b[i])) dep++;
    else if (CLOSE.includes(b[i]) && --dep === 0) return i;
  }
  return -1;
}
function splitArgs(b, from, to) {
  const out = [];
  let dep = 0, s = from;
  for (let i = from; i < to; i++) {
    if (OPEN.includes(b[i])) dep++;
    else if (CLOSE.includes(b[i])) dep--;
    else if (b[i] === ',' && dep === 0) { out.push([s, i]); s = i + 1; }
  }
  out.push([s, to]);
  return out;
}
const trimR = (b, s, e) => { while (s < e && /\s/.test(b[s])) s++; while (e > s && /\s/.test(b[e - 1])) e--; return [s, e]; };

// 第幾個參數是秒數：P 的動作預設第 2 個；這幾個是第 3 個；P.at 第 1 個；tl 的補間照 GSAP
const P_AT = { swap: 2, axis: 2, focus: 2, spot: 2, rack: 2, along: 2, at: 0, sfx: 1 };
const P_NONE = new Set(['dur', 'region', 'prev', 'pushEase', 'end', 'U', 'V2']);
const TL_AT = { to: 2, from: 2, set: 2, fromTo: 3, add: 1, addLabel: 1, addPause: 0, call: 3 };
const SAFE = new Set(['P', 'D', 'Math', 'gsap', 'tl', 'this', 'window', 'document']);

// 一段 script 裡跟時間有關的數字：slots（可以平移的秒數，key 用來和工具產生的檔對）、D（段長）、ends（P.end(<秒>)）、odd（認不出的寫法）
function scanScript(src, base) {
  const b = blank(src), slots = [], odd = [], ends = [], bases = new Set();
  let D = null;
  const classify = (s0, e0, key) => {
    const [s, e] = trimR(b, s0, e0);
    if (s >= e) return;
    const t = b.slice(s, e);
    let m;
    if ((m = /^Math\s*\.\s*(max|min)\s*\(/.exec(t))) {
      const open = s + m[0].length - 1;
      if (closeOf(b, open) === e - 1) { splitArgs(b, open + 1, e - 1).forEach(([x, y], k) => classify(x, y, `${key}|${m[1]}${k}`)); return; }
    }
    if (t[0] === '(' && closeOf(b, s) === e - 1) { classify(s + 1, e - 1, key); return; }
    if ((m = /^(\d+(?:\.\d+)?|\.\d+)(?![\w.])/.exec(t))) {
      const rest = t.slice(m[0].length).trimStart();
      if (!rest || /^[+-]/.test(rest)) { slots.push({ key, s: base + s, e: base + s + m[0].length, v: Number(m[0]) }); return; }   // 3.846、3.846 + 0.15
      if (/^[*/]/.test(rest)) return;   // 0.5 * D：比例，不是秒數
      odd.push(base + s); return;
    }
    if ((m = /^([A-Za-z_$][\w$]*)/.exec(t))) { bases.add(m[1]); return; }   // T0 + 0.15、rowAt[i]、D - 0.8、P.at('#3')：看它的宣告
    if (/^['"`]/.test(t)) return;   // '<'、'+=0.2'、標籤：相對位置
    if (/\d/.test(t)) odd.push(base + s);
  };
  // 呼叫
  const seen = new Map();
  const CALL = /\b(P|tl)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = CALL.exec(b))) {
    const obj = m[1], fn = m[2], open = m.index + m[0].length - 1, close = closeOf(b, open);
    if (close < 0) continue;
    const args = splitArgs(b, open + 1, close);
    const first = (() => { const [s, e] = trimR(b, args[0][0], args[0][1]); return src.slice(s, e).replace(/\s+/g, ' '); })();
    const tag = `${obj}.${fn}|${fn === 'at' ? '' : first}`;
    const occ = (seen.get(tag) || 0) + 1;
    seen.set(tag, occ);
    if (obj === 'P' && fn === 'end' && args.length) {
      const [s, e] = trimR(b, args[0][0], args[0][1]);
      if (/^(\d+(?:\.\d+)?)$/.test(b.slice(s, e))) ends.push({ s: base + s, e: base + e, v: Number(b.slice(s, e)) });
      continue;
    }
    const at = obj === 'P' ? (P_NONE.has(fn) ? null : P_AT[fn] ?? 1) : TL_AT[fn] ?? null;
    if (at == null || args.length <= at) continue;
    classify(args[at][0], args[at][1], `call|${tag}|${occ}`);
  }
  // 宣告：const X = <秒> / [<秒>, …]；只看被當成秒數用到的名字（間接的也算）
  const decls = new Map();
  const DECL = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  while ((m = DECL.exec(b))) {
    const s = m.index + m[0].length;
    let dep = 0, e = s;
    for (; e < b.length; e++) {
      const c = b[e];
      if (OPEN.includes(c)) dep++;
      else if (CLOSE.includes(c)) { if (dep === 0) break; dep--; }
      else if (dep === 0 && (c === ';' || c === '\n' || c === ',')) break;
    }
    if (!decls.has(m[1])) decls.set(m[1], [s, e]);
  }
  const dd = decls.get('D');
  if (dd) { const [s, e] = trimR(b, dd[0], dd[1]); if (/^\d+(?:\.\d+)?$/.test(b.slice(s, e))) D = { s: base + s, e: base + e, v: Number(b.slice(s, e)) }; }
  const done = new Set();
  for (let guard = 0; guard < 50; guard++) {
    const todo = [...bases].filter((x) => !done.has(x) && !SAFE.has(x) && decls.has(x));
    if (!todo.length) break;
    for (const name of todo) {
      done.add(name);
      const [s, e] = trimR(b, ...decls.get(name));
      if (b[s] === '[' && closeOf(b, s) === e - 1) splitArgs(b, s + 1, e - 1).forEach(([x, y], k) => classify(x, y, `decl|${name}|${k}`));
      else classify(s, e, `decl|${name}`);
    }
  }
  return { slots, odd, ends, D };
}

// 整份檔：<script>（不含 src= 的）裡的數字，加上 root 的 data-duration
function scan(html) {
  const out = { slots: [], odd: [], ends: [], D: null, dur: null };
  const RE = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = RE.exec(html))) {
    const base = m.index + m[0].indexOf('>') + 1;
    const r = scanScript(m[1], base);
    out.slots.push(...r.slots); out.odd.push(...r.odd); out.ends.push(...r.ends);
    if (r.D && !out.D) out.D = r.D;
  }
  const t = html.indexOf('<template');
  const dm = /\sdata-duration="(\d+(?:\.\d+)?)"/.exec(html.slice(Math.max(0, t)));
  if (dm) { const s = Math.max(0, t) + dm.index + dm[0].indexOf('"') + 1; out.dur = { s, e: s + dm[1].length, v: Number(dm[1]) }; }
  return out;
}
const lineOf = (html, pos) => html.slice(0, pos).split('\n').length;

export function shiftHand({ hand, fresh, t0, d, id = '?', file = '', where = null }) {
  const W = where || `[${id}]`, stamp = readTimes(hand);
  const H = scan(hand), F = scan(fresh || '');
  const fv = new Map(F.slots.map((x) => [x.key, x.v]));
  const dOld = stamp?.d ?? H.D?.v ?? H.dur?.v ?? null;
  const dChanged = dOld != null && Math.abs(dOld - d) >= EPS;
  let shift;
  if (stamp) shift = r3(t0 - stamp.t0);
  else {
    // 舊檔（檔頭沒有起點）：和工具這次產生的檔比，綁詞的秒數差多少
    const matched = H.slots.filter((x) => fv.has(x.key));
    const diffs = matched.filter((x) => Math.abs(x.v - fv.get(x.key)) >= EPS).map((x) => r3(x.v - fv.get(x.key)));
    const fixed = matched.some((x) => Math.abs(x.v - fv.get(x.key)) < EPS && x.v > ENTER_MAX);   // 有綁詞的秒數已經是新起點的
    if (!diffs.length || !dChanged) shift = 0;   // 秒數都和工具產生的一樣（起點沒動或已經改好）；段長也沒變＝當作沒動
    else if (!fixed && diffs.every((x) => Math.abs(x - r3(dOld - d)) < TOL)) shift = r3(dOld - d);   // 迄點沒動、起點晚了 dOld − d
    else {
      return { html: null, line: null, errors: [`${W} ${file} 手改過、檔頭沒有記起點（舊版產生的），段長從 ${fmtS(dOld)} 改成 ${fmtS(d)} 秒，裡面綁詞的秒數和這次產生的差 ${[...new Set([...(fixed ? [0] : []), ...diffs])].slice(0, 3).map((x) => (x ? signed(x) : '0')).join('、')} 秒，認不出起點動了多少`
        + ` → 起點晚了幾秒就把綁講到那個詞的秒數各減幾秒、const D 改成 ${fmtS(d)}（改好再跑 build 就不會再報）；或刪掉這個檔重產（build 照 plan.json 產生）`] };
    }
  }
  const moved = Math.abs(shift) >= EPS;
  if (!moved && !dChanged) return { html: stamp ? null : withTimes(hand, t0, d), line: null, errors: [] };   // 舊檔補記檔頭，下次照它算
  // 有認不出的寫法：整個檔不動（只動一部分的話，下次 build 檔頭已經是新起點，就不會再提醒那幾行）
  if (moved && H.odd.length) {
    const lines = [...new Set(H.odd.map((p) => lineOf(hand, p)))];
    return { html: null, line: null, errors: [`${W} ${file} 手改過，段起點從 ${fmtS(t0 - shift)} 改成 ${fmtS(t0)} 秒，第 ${lines.slice(0, 6).join('、')} 行的秒數寫法認不出，整個檔的秒數都沒跟著動`
      + ` → 那幾行改成數字開頭的寫法（例 3.8 + x）再跑 build，會自動照新起點平移；或自己把綁詞的秒數各${shift > 0 ? '減' : '加'} ${fmtS(Math.abs(shift))}、檔頭的 t0= 改成 ${fmtS(t0)}；或刪掉這個檔重產（build 照 plan.json 產生）`] };
  }
  const reps = [];
  let kept = 0, n = 0, clamped = 0;
  if (moved) {
    for (const x of H.slots) {
      if (fv.has(x.key) && Math.abs(fv.get(x.key) - x.v) < EPS) { kept++; continue; }   // 和工具產生的一樣：段頭進場這類跟著段走的秒數
      const v = r3(x.v - shift);
      if (v < 0) clamped++;
      reps.push([x.s, x.e, fmtS(Math.max(0, v))]); n++;
    }
  }
  if (dChanged) {
    if (H.D) reps.push([H.D.s, H.D.e, fmtS(d)]);
    for (const x of H.ends) if (Math.abs(x.v - dOld) < EPS) reps.push([x.s, x.e, fmtS(d)]);
    if (H.dur && Math.abs(H.dur.v - dOld) < EPS) reps.push([H.dur.s, H.dur.e, fmtS(d)]);
  }
  let html = hand;
  for (const [s, e, t] of reps.sort((a, b) => b[0] - a[0])) html = html.slice(0, s) + t + html.slice(e);
  html = withTimes(html, t0, d);
  const parts = [];
  if (moved) parts.push(`照新起點平移 ${signed(-shift)} 秒（${n} 處${kept ? `；和這次產生的一樣的 ${kept} 處不動` : ''}${clamped ? `；${clamped} 處早於段頭，放在 0 秒` : ''}）`);
  if (dChanged) parts.push(`段長 ${fmtS(dOld)} → ${fmtS(d)} 秒（const D${H.ends.length ? '、P.end' : ''}${H.dur ? '、data-duration' : ''} 一起換）`);
  return { html, line: `${id} 手改過的動畫檔 ${file} ${parts.join('；')}`, errors: [] };
}

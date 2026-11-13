// 產生時自動修（--merge-drafts、--apply-storyboard 之後自動跑；AI 也可以手動跑 build.mjs --autofix）：
// 工具已經知道答案的機械修法，一處一處「試套 → 重跑檢查 → 那一則消失、沒有新的 ✖／⚠、全片的量沒變差才留，否則退回」。
// 剪輯台的「更新預覽」、--check、--review 都不跑：使用者在剪輯台改的時間要算數（AGENTS.md 規則 10）。
//
//   autofixPlan(plan, check, { only, keepSfx, passes }) → { plan, fixes: [{ kind, id, what }], result, tried }
//     check(plan) → { errors, warnings, res }：build.mjs 的 build(flags, { resolver: true }).check（resolvePlan＋講者檢查，不寫檔）
//     only：只改這些段（回饋輪只修 AI 這輪改的段，別段使用者改過的不動）；keepSfx：這些段的音效不拿掉（分鏡表上使用者改過的）
//     不會改傳進來的 plan；fixes 照套用的順序
//   summaryLines(fixes) → 第一行「自動修好 N 處：文字對時 8、…」，之後逐條「  文字對時：s0102 title：from 改成 "#7@MiniMax"」
//   shiftTime(v, d)：時間寫法往後挪 d 秒（"#49e" → "#49e+0.25"、"#130@這次會裝" → "#130@這次會裝+0.3"、12.5 → 12.75）
//
// 修法（kind）：
//   textSync  文字對時 ⚠／✖：照 textSyncIssues 的欄位寫 "#N@詞"（beats.X、slots.f[i].at、from）。from 會挪動整段起點：
//             前一段原本 0 秒相接的 to 一起改成同一個值，anchor 不在新的那一句就換成那一句的開頭；整個挪過去不行（例：前一段是
//             內容設計動畫，段尾放不下）就只挪到差 0.45 秒。講到的秒數是用字數估的（逐字稿找不到那個詞）不改
//   overlap   兩個透明情境重疊 ≤ 0.5 秒：前一段的 to 改成後一段的 from；不行（前一段有最短長度）就把後一段的 from 改成前一段的 to
//   firstAt   清單第一項比標題那一拍早：拿掉那個 at（用預設）；不行就改成標題那一拍
//   gap       連續覆蓋（rhythm 不是 spaced）時兩段之間空 ≤ 3 秒（沒有畫面的區間、講者會閃一下）：前一段的 to 接到後一段的 from；
//             前一段是章節（長度固定）就把後一段的 from 提早接上。空檔裡有章節角標（刻意露臉）、後一段是錄影（會和講話對不上）不修
//   hold      最後一個內容到退場停不到 1.5 秒：後面有空就 to 往後延（不能壓到下一段）；後一段 0 秒相接就連後一段的 from 一起延
//   sfx       一分鐘超過 2 顆主音效（工具自動拿掉之後還超過＝都是段上寫明的）：照 lib/audio.mjs 的優先序拿掉最不重要、最後面的那顆
//             （寫 "sfx": null；章節音效與 keepSfx 不動）
//   merge     動畫分鏡的相鄰兩拍只隔不到範例的最小拍距：後一拍改綁前一拍的詞（同一句講到的兩個東西放同一拍）；不行就前一拍改綁後一拍的詞
//             （拍和詞的對應看這段的動畫分鏡 __sheet；寫在 at／…At 欄的才改）
//   tail      動畫分鏡的最後一拍到段尾不夠範例的下限（最後一幕太短）：和 hold 一樣把 to 往後延（後一段 0 秒相接就一起延它的 from）
// 每一處都要過：目標那一則消失、✖／⚠ 沒有多（只差秒數的算同一則）、沒有畫面的區間／#N@詞 估的個數／音效太密／音效稀疏沒變多、
// 段數沒變少、透明字卡沒有被整張幕蓋住更久（延長、挪動不能把下一張卡的開頭藏在幕底下）。
// 不能自動修的（#N@詞 估的、音效稀疏、蓋到講者這類要看畫面的）照舊報。

import { parseTime, r3 } from './time.mjs';
import { norm, cueByN } from './srt.mjs';
import { textSyncIssues } from './plan.mjs';
import { parseValue } from './scenes.mjs';
import { KEEP_FIRST, SFX_RULES } from './audio.mjs';
import { parseBeatSheets } from './audit-beats.mjs';

export const KINDS = { textSync: '文字對時', overlap: '重疊', firstAt: '清單第一項比標題早', gap: '空檔', hold: '停留太短', sfx: '音效太密', merge: '拍距不足（併拍）', tail: '最後一幕太短' };
const ORDER = Object.keys(KINDS);
const OVERLAP_MAX = 0.5, GAP_MAX = 3, HOLD_STEP = 0.05, NEAR = 0.45, EPS = 0.002;

// 同一則提醒只是秒數、句號、百分比變了不算新的：數字換成 #（段號 s0101 這種前面接英文字的不換）
export const issueKey = (s) => String(s).replace(/(?<![A-Za-z0-9_])\d+(?:\.\d+)?/g, '#');
// 全片一則的提醒：內容（哪幾段、哪幾秒）會跟著時間變，改成比數量（metrics）
const GLOBAL = [[/^沒有畫面的區間/, 'uncovered'], [/^#N@詞 有/, 'approx'], [/^音效密度：/, 'dense'], [/^音效稀疏：/, 'sparse']];
function bag(list) {
  const m = new Map();
  for (const s of list || []) {
    const g = GLOBAL.find(([re]) => re.test(s));
    const k = g ? `@${g[1]}` : issueKey(s);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
// 透明字卡在整張幕底下開始、被蓋住的秒數（幕的圖層比卡高）：延長前一段、挪動起點時不能讓下一張卡的開頭藏在幕底下
function hiddenSec(items) {
  let sum = 0;
  for (const t of items) {
    if (t.opaque || t.key === 'chapter-tag') continue;
    let h = 0;
    for (const x of items) {
      if (x === t || !x.opaque || (x.z ?? 30) <= (t.z ?? 20) || x.start > t.start + EPS || x.end <= t.start + EPS) continue;
      h = Math.max(h, Math.min(x.end, t.end) - t.start);
    }
    sum += h;
  }
  return sum;
}
function metrics(res) {
  const unc = res?.uncovered || [];
  return {
    uncovered: unc.length, uncoveredLen: unc.reduce((t, u) => t + u.len, 0),
    approx: res?.cuesOut?.approx?.size || 0,
    dense: (res?.sfxBudget?.dense || []).reduce((t, d) => t + d.n, 0),
    sparse: (res?.sfxBudget?.sparse || []).length,
    items: res?.items?.length || 0,
    hidden: hiddenSec(res?.items || []),
  };
}
const withBags = (r) => ({ ...r, bags: { errors: bag(r.errors), warnings: bag(r.warnings) } });
const countKey = (r, k) => (r.bags.errors.get(k) || 0) + (r.bags.warnings.get(k) || 0);

// 改過的 plan 要比原本好：目標那一則消失、沒有多出 ✖／⚠、全片的量沒變差
function acceptable(b, a, gone) {
  if (!gone(a, b)) return false;
  for (const [k, n] of a.bags.errors) if (n > (b.bags.errors.get(k) || 0)) return false;
  for (const [k, n] of a.bags.warnings) if (n > (b.bags.warnings.get(k) || 0)) return false;
  const mb = metrics(b.res), ma = metrics(a.res);
  return !(ma.uncovered > mb.uncovered || ma.uncoveredLen > mb.uncoveredLen + 1e-3 || ma.approx > mb.approx
    || ma.dense > mb.dense || ma.sparse > mb.sparse || ma.items < mb.items || ma.hidden > mb.hidden + 1e-3);
}

// ---------- 改 plan 的小工具 ----------

const segOf = (plan, id) => (plan.scenes || []).find((s) => s && s.id === id) || null;
// 加新欄位時放在 after 後面（plan.json 的欄位順序照文件：id、scene、from、to…）
function put(seg, key, value, after = 'from') {
  if (key in seg || !(after in seg)) { seg[key] = value; return; }
  const entries = Object.entries(seg);
  for (const k of Object.keys(seg)) delete seg[k];
  for (const [k, v] of entries) { seg[k] = v; if (k === after) seg[key] = value; }
}
function setTo(seg, v) {
  if (!seg) return false;
  put(seg, 'to', v);
  delete seg.duration;
  return true;
}
// from 換到別句之後，anchor（起點那一句的開頭幾個字，用來發現句號位移）不在新的那一句就換成那一句的開頭
function fixAnchor(seg, cues) {
  if (!seg || seg.anchor == null) return;
  const t = parseTime(seg.from);
  if (t.error || t.kind !== 'cue') return;
  const c = cueByN(cues, t.n);
  if (!c || norm(c.text).includes(norm(seg.anchor))) return;
  seg.anchor = [...String(c.text).replace(/^[\s，。、！？,.!?]+/, '')].slice(0, 8).join('').trim();
}
export function shiftTime(v, d) {
  const t = parseTime(v);
  if (t.error || t.kind === 'rel') return null;
  if (t.kind === 'abs') return typeof v === 'number' ? r3(t.sec + d) : String(r3(t.sec + d));
  const off = r3((t.off || 0) + d);
  const base = `#${t.n}${t.end ? 'e' : ''}${t.kw != null ? `@${t.kw}` : ''}`;
  return Math.abs(off) < 1e-9 ? base : `${base}${off > 0 ? '+' : '-'}${Math.abs(off)}`;
}
// to 往後延 d 秒：有 to 改 to，有 duration 改 duration，都沒寫（情境預設長度）就寫 duration
function extend(seg, it, d) {
  if (!seg) return false;
  if (seg.to != null) { const v = shiftTime(seg.to, d); if (v == null) return false; seg.to = v; return true; }
  if (seg.duration != null) { if (typeof seg.duration !== 'number') return false; seg.duration = r3(seg.duration + d); return true; }
  put(seg, 'duration', r3((it.planEnd ?? it.end) - it.start + d));
  return true;
}
// 清單第 i 項的 at：物件寫 at 欄；字串寫「值 ｜at=…」（scenes.mjs parseValue 的寫法）。v＝null 是拿掉
function setItemAt(seg, key, i, v) {
  const list = seg?.slots?.[key];
  if (!Array.isArray(list) || i >= list.length) return false;
  const x = list[i];
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    if (v == null) { if (!('at' in x)) return false; delete x.at; } else x.at = v;
    return true;
  }
  if (typeof x !== 'string') return false;
  const pv = parseValue(x);
  if (v == null) { if (!('at' in pv.attrs)) return false; delete pv.attrs.at; } else pv.attrs.at = v;
  const tail = Object.entries(pv.attrs).map(([k, val]) => `${k}=${/[\s"]/.test(val) ? `"${String(val).replace(/"/g, '')}"` : val}`).join(' ');
  list[i] = tail ? `${pv.value} ｜${tail}` : pv.value;
  return true;
}
const fmtV = (v) => JSON.stringify(v);
// 段裡寫時間的欄（at、…At）值是 from 的，全部改成 to；回傳改了幾格。兩個值都要還在段裡才改
// （兩個值都在才換：已經併過的不會再來回併）
function swapRef(seg, from, to) {
  const hits = [];
  let other = 0;
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach((x) => (x && typeof x === 'object' ? walk(x) : null)); return; }
    for (const [k, x] of Object.entries(v)) {
      if (x && typeof x === 'object') walk(x);
      else if (k === 'at' || /At$/.test(k)) { if (x === from) hits.push([v, k]); else if (x === to) other++; }
    }
  };
  for (const [k, x] of Object.entries(seg || {})) if (k !== 'story' && x && typeof x === 'object') walk(x);
  if (!other) return 0;
  for (const [v, k] of hits) v[k] = to;
  return hits.length;
}

// ---------- 候選修法（照 res 現在的提醒算；套用時只動 plan 的複本）----------

function candidates(cur, opt) {
  const res = cur.res || {};
  const items = res.items || [];
  const cues = res.cuesOut || [];
  const byId = new Map(items.map((x) => [x.id, x]));
  const ok = (...ids) => !opt.only || ids.every((id) => opt.only.has(id));
  const out = [];
  const msgGone = (msg) => { const k = issueKey(msg); return (a, b) => countKey(a, k) < countKey(b, k); };
  const endOf = (x) => x.planEnd ?? x.end;
  const shown = items.filter((x) => x.key !== 'chapter-tag');
  // 0 秒相接：plan 寫的結束點（換卡自動延長之前）＝這段起點
  const joinedBefore = (it) => shown.filter((p) => p !== it && Math.abs(endOf(p) - it.start) <= EPS);
  // 接到這段起點要寫什麼：照它的 from；章節（at 是那一句，實際從空檔中間開始）寫 rough.mp4 的秒數
  const roughSec = (t) => r3(res.tm && !res.tm.identity ? res.tm.unmapStart(t) : t);
  const startValue = (x) => (x.seg?.from != null ? x.seg.from : roughSec(x.start));
  const endValue = (x) => (x.seg?.to != null && x.seg.duration == null ? x.seg.to : roughSec(endOf(x)));
  // 起點可以挪的段：錄影挪了會和講話對不上、章節的位置是工具排的
  const movable = (x) => x?.seg && x.seg.from != null && ['scene', 'fx', 'custom'].includes(x.type) && x.key !== 'chapter' && x.key !== 'chapter-tag';
  const setFrom = (pl, id, v) => { const s = segOf(pl, id); if (!s || v == null) return false; s.from = v; fixAnchor(s, cues); return true; };

  // textSync
  for (const it of items) {
    if (!it.seg) continue;
    for (const x of textSyncIssues(it, cues)) {
      if (!x.real || !x.fix) continue;
      const v = `#${x.n}@${x.kw}`, msg = `文字對時：${x.msg}`, base = { kind: 'textSync', id: it.id, gone: msgGone(msg) };
      if (x.fix === 'from') {
        const before = joinedBefore(it), prev = before.filter((p) => p.key !== 'chapter' && p.seg);
        if (prev.length !== before.length || !ok(it.id, ...prev.map((p) => p.id))) continue;
        const also = prev.length ? `（${prev.map((p) => p.id).join('、')} 的 to 一起改，維持 0 秒相接）` : '';
        const move = (pl, nv) => { if (!setFrom(pl, it.id, nv)) return false; for (const p of prev) if (!setTo(segOf(pl, p.id), nv)) return false; return true; };
        out.push({ ...base, key: `ts|${it.id}|${x.field}`, apply: (pl) => (move(pl, v) ? `${it.id} ${x.field}：from 改成 ${fmtV(v)}${also}` : null) });
        // 整個挪過去不行（前一段放不下）：挪到只差 NEAR 秒（文字對時的目標是差 ≤ 0.5 秒）
        const step = r3(x.diff - Math.sign(x.diff) * NEAR);
        if (Math.abs(step) > 0.04) {
          out.push({ ...base, key: `ts|${it.id}|${x.field}|near`, apply: (pl) => {
            const nv = shiftTime(segOf(pl, it.id)?.from, -step);
            return move(pl, nv) ? `${it.id} ${x.field}：from 改成 ${fmtV(nv)}（${step > 0 ? '提早' : '延後'} ${Math.abs(step)}s，和講到「${x.kw}」差 ${NEAR}s 以內）${also}` : null;
          } });
        }
      } else if (x.fix.startsWith('beats.')) {
        const b = x.fix.slice(6);
        if (!ok(it.id)) continue;
        out.push({ ...base, key: `ts|${it.id}|${x.field}`, apply: (pl) => {
          const s = segOf(pl, it.id);
          if (!s) return null;
          s.beats = { ...(s.beats && typeof s.beats === 'object' ? s.beats : {}), [b]: v };
          return `${it.id} ${x.field}：beats.${b} 改成 ${fmtV(v)}`;
        } });
      } else {
        const m = x.fix.match(/^slots\.(\w+)\[(\d+)\]\.at$/);
        if (!m || !ok(it.id)) continue;
        out.push({ ...base, key: `ts|${it.id}|${x.field}`, apply: (pl) => (setItemAt(segOf(pl, it.id), m[1], Number(m[2]), v) ? `${it.id} ${x.field}：at 改成 ${fmtV(v)}` : null) });
      }
    }
  }

  const each = (re, fn) => { for (const it of items) for (const w of it.warnings || []) { const m = String(w).match(re); if (m) fn(it, m, w); } };

  // overlap：[b] 和 a 時間重疊 Xs → 一段只放一個情境
  each(/^\[(\S+)[^\]]*\] 和 (\S+) 時間重疊 ([\d.]+)s → 一段只放一個情境/, (b, m, w) => {
    const a = byId.get(m[2]), ov = Number(m[3]);
    if (!a?.seg || !b.seg || ov > OVERLAP_MAX + 1e-9) return;
    const gone = msgGone(w);
    if (a.key !== 'chapter' && b.seg.from != null && ok(a.id)) {
      const v = b.seg.from;
      out.push({ kind: 'overlap', id: a.id, key: `ov|${a.id}|${b.id}|to`, gone, apply: (pl) => (setTo(segOf(pl, a.id), v) ? `${a.id} 的 to 改成 ${b.id} 的起點 ${fmtV(v)}（原本重疊 ${ov}s）` : null) });
    }
    if (movable(b) && ok(b.id)) {
      const v = endValue(a);
      out.push({ kind: 'overlap', id: b.id, key: `ov|${a.id}|${b.id}|from`, gone, apply: (pl) => (setFrom(pl, b.id, v) ? `${b.id} 的 from 改成 ${a.id} 的結尾 ${fmtV(v)}（原本重疊 ${ov}s）` : null) });
    }
  });

  // firstAt：slots.k[0].at 比 beats.X 還早
  each(/^\[(\S+)[^\]]*\] slots\.(\w+)\[0\]\.at：第 ([\d.]+)s 出現，比 beats\.(\w+)（第 ([\d.]+)s）還早/, (it, m, w) => {
    if (!it.seg || !ok(it.id)) return;
    const key = m[2], head = Number(m[5]), gone = msgGone(w);
    out.push({ kind: 'firstAt', id: it.id, key: `fa|${it.id}|${key}|drop`, gone, apply: (pl) => (setItemAt(segOf(pl, it.id), key, 0, null) ? `${it.id} slots.${key}[0]：拿掉 at（照預設，跟在 beats.${m[4]} 之後）` : null) });
    out.push({ kind: 'firstAt', id: it.id, key: `fa|${it.id}|${key}|head`, gone, apply: (pl) => (setItemAt(segOf(pl, it.id), key, 0, `+${head}`) ? `${it.id} slots.${key}[0]：at 改成 "+${head}"（和 beats.${m[4]} 同一拍）` : null) });
  });

  // gap：沒有畫面的區間 ≤ 3 秒、講者會閃一下 → 前一段的 to 接到後一段的 from（前一段是章節就把後一段提早）
  if (res.rhythm !== 'spaced') {
    const tags = items.filter((x) => x.key === 'chapter-tag');
    for (const u of res.uncovered || []) {
      if (u.len > GAP_MAX + 1e-9 || tags.some((t) => t.start < u.end - EPS && t.end > u.start + EPS)) continue;   // 章節角標那段本來就讓講者露臉
      const prev = shown.filter((x) => Math.abs(x.end - u.start) <= EPS).sort((a, b) => b.end - a.end)[0];
      const next = shown.filter((x) => Math.abs(x.start - u.end) <= EPS)[0];
      if (!prev?.seg || !next?.seg) continue;
      const gone = (a) => !(a.res?.uncovered || []).some((x) => x.start < u.end - EPS && x.end > u.start + EPS);
      if (prev.key !== 'chapter' && ok(prev.id)) {
        const v = startValue(next);
        out.push({ kind: 'gap', id: prev.id, key: `gap|${prev.id}|${next.id}`, gone, apply: (pl) => (setTo(segOf(pl, prev.id), v) ? `${prev.id} 的 to 接到 ${next.id} 的起點 ${fmtV(v)}（原本空 ${u.len}s 沒有畫面）` : null) });
      } else if (prev.key === 'chapter' && movable(next) && ok(next.id)) {
        const d = r3(next.start - u.start);
        out.push({ kind: 'gap', id: next.id, key: `gap|${prev.id}|${next.id}|early`, gone, apply: (pl) => {
          const nv = shiftTime(segOf(pl, next.id)?.from, -d);
          return setFrom(pl, next.id, nv) ? `${next.id} 的 from 提早 ${d}s 改成 ${fmtV(nv)}，接在章節 ${prev.id} 後面（原本空 ${u.len}s 沒有畫面）` : null;
        } });
      }
    }
    each(/^\[(\S+)[^\]]*\] 和前一段 (\S+) 之間只空 ([\d.]+)s，講者會閃一下/, (it, m, w) => {
      const prev = byId.get(m[2]);
      if (!prev?.seg || prev.key === 'chapter' || !ok(prev.id)) return;
      const v = startValue(it);
      out.push({ kind: 'gap', id: prev.id, key: `flash|${prev.id}|${it.id}`, gone: msgGone(w), apply: (pl) => (setTo(segOf(pl, prev.id), v) ? `${prev.id} 的 to 接到 ${it.id} 的起點 ${fmtV(v)}（原本空 ${m[3]}s，講者會閃一下）` : null) });
    });
  }

  // hold：最後一個內容在第 Xs，到退場只停 Ys，建議 ≥ Zs → 後面有空就延 to；後一段 0 秒相接就一起延它的 from
  const extendTo = (kind, it, d, gone, why) => {
    const end = endOf(it);
    const inWay = items.filter((x) => x !== it && x.start > it.start + EPS && x.start >= end - EPS && x.start < end + d - EPS);
    if (!inWay.length) {
      out.push({ kind, id: it.id, key: `${kind}|${it.id}|extend`, gone, apply: (pl) => (extend(segOf(pl, it.id), it, d) ? `${it.id}：to 往後延 ${d}s（${why}）` : null) });
      return;
    }
    if (!inWay.every((n) => Math.abs(n.start - end) <= EPS && movable(n)) || !ok(it.id, ...inWay.map((n) => n.id))) return;
    out.push({ kind, id: it.id, key: `${kind}|${it.id}|shift`, gone, apply: (pl) => {
      if (!extend(segOf(pl, it.id), it, d)) return null;
      for (const n of inWay) if (!setFrom(pl, n.id, shiftTime(segOf(pl, n.id)?.from, d))) return null;
      return `${it.id}：to 往後延 ${d}s，${inWay.map((n) => n.id).join('、')} 的 from 一起延（維持 0 秒相接）`;
    } });
  };
  const stepUp = (need, got) => r3(Math.ceil((need - got) / HOLD_STEP - 1e-6) * HOLD_STEP);
  each(/^\[(\S+)[^\]]*\] 最後一個內容在第 ([\d.]+)s，到退場只停 ([\d.]+)s，建議 ≥ ([\d.]+)s/, (it, m, w) => {
    if (!it.seg || !ok(it.id)) return;
    const d = stepUp(Number(m[4]), Number(m[3]));
    if (!(d > 0) || d > GAP_MAX) return;
    extendTo('hold', it, d, msgGone(w), '最後一個內容多停一下');
  });

  // tail（B4）：動畫分鏡「最後一拍 …到段尾只剩 Ys，範例檔頭【D 下限】要 ≥ Zs」→ 和 hold 一樣延 to
  each(/^\[(\S+)[^\]]*\] 動畫分鏡：最後一拍 \S+（[^）]*）到段尾只剩 ([\d.]+)s，範例檔頭【D 下限】要 ≥ ([\d.]+)s/, (it, m, w) => {
    if (!it.seg || !ok(it.id)) return;
    const d = stepUp(Number(m[3]), Number(m[2]));
    if (!(d > 0) || d > GAP_MAX) return;
    extendTo('tail', it, d, msgGone(w), `最後一拍到段尾要 ≥ ${m[3]}s`);
  });

  // merge（B4）：動畫分鏡「第 A 拍（…）到第 B 拍（…）只隔 Xs」→ 兩拍綁同一個詞（同一句講到的兩個東西放同一拍）
  each(/^\[(\S+)[^\]]*\] 動畫分鏡：第 (\S+) 拍（[^）]*）到第 (\S+) 拍（[^）]*）只隔 ([\d.]+)s/, (it, m, w) => {
    // 032 B6：拍點正本不在 slots 的段（內容設計動畫、手改過的模板段，表在 work/designs/）：綁詞不在 slots，swapRef 改不到，不出候選
    if (!it.seg || !ok(it.id) || m[2] === m[3] || (it.seg.__beatOwner ?? 'plan') !== 'plan') return;
    let sheet = null;
    try { sheet = it.seg.__sheet ? parseBeatSheets(it.seg.__sheet).get(it.seg.id) : null; } catch { sheet = null; }
    const refOf = (beat) => sheet?.rows.find((r) => r.beat === beat && !r.start && r.refs?.length)?.refs[0]?.ref;
    // 兩拍綁同一個詞就不會再拍距不足：build.mjs 的 checkerOf 每次照當下的 slots 重算 __sheet，所以等那則提醒消失才收
    const a = refOf(m[2]), b = refOf(m[3]), gone = msgGone(w);
    if (!a || !b || a === b) return;
    out.push({ kind: 'merge', id: it.id, key: `mg|${it.id}|${m[3]}|early`, gone, apply: (pl) => (swapRef(segOf(pl, it.id), b, a) ? `${it.id}：第 ${m[3]} 拍併進第 ${m[2]} 拍（${fmtV(b)} 改成 ${fmtV(a)}；原本只隔 ${m[4]}s）` : null) });
    out.push({ kind: 'merge', id: it.id, key: `mg|${it.id}|${m[2]}|late`, gone, apply: (pl) => (swapRef(segOf(pl, it.id), a, b) ? `${it.id}：第 ${m[2]} 拍併進第 ${m[3]} 拍（${fmtV(a)} 改成 ${fmtV(b)}；原本只隔 ${m[4]}s）` : null) });
  });

  // sfx：同一分鐘超過 2 顆主音效（工具自動拿掉之後還超過的，都是段上寫明的）
  const rank = (n) => { const i = KEEP_FIRST.indexOf(n); return i < 0 ? KEEP_FIRST.length : i; };
  for (const dm of res.sfxBudget?.dense || []) {
    const list = items.filter((x) => x.seg && x.sfx && dm.ids.includes(x.id) && x.sfx.at >= dm.from - 1e-6 && x.sfx.at < dm.to - 1e-6
      && x.sfx.name !== 'chapter' && x.key !== 'chapter' && !opt.keepSfx.has(x.id) && x.seg.sfx !== null && ok(x.id))
      .sort((a, b) => rank(b.sfx.name) - rank(a.sfx.name) || b.sfx.at - a.sfx.at);
    const gone = (a) => ((a.res?.sfxBudget?.dense || []).find((x) => x.from === dm.from)?.n || 0) < dm.n;
    for (const x of list) {
      out.push({ kind: 'sfx', id: x.id, key: `sfx|${x.id}|${dm.from}`, gone, apply: (pl) => {
        const s = segOf(pl, x.id);
        if (!s) return null;
        put(s, 'sfx', null, 'to');
        return `${x.id}：拿掉音效 ${x.sfx.name}（"sfx": null；${Math.floor(dm.from / 60)}:00–${Math.floor(dm.to / 60)}:00 有 ${dm.n} 顆主音效，任一分鐘最多 ${SFX_RULES.perMinute} 顆）`;
      } });
    }
  }
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

// ---------- 主流程 ----------

export function autofixPlan(plan0, check, { only = null, keepSfx = [], passes = 3 } = {}) {
  const opt = { only: only ? new Set(only) : null, keepSfx: new Set(keepSfx || []) };
  let plan = structuredClone(plan0);
  const run = (pl) => { try { return withBags(check(pl)); } catch { return null; } };
  let cur = run(plan);
  if (!cur) return { plan, fixes: [], result: null, tried: 0 };
  const fixes = [];
  let tried = 0;
  for (let pass = 0; pass < passes; pass++) {
    const rejected = new Set();
    let progressed = false;
    for (let guard = 0; guard < 1000; guard++) {
      const list = candidates(cur, opt).filter((c) => !rejected.has(c.key));
      let took = false;
      for (const c of list) {
        const next = structuredClone(plan);
        let what = null;
        try { what = c.apply(next); } catch { what = null; }
        rejected.add(c.key);
        if (!what) continue;
        tried++;
        const r = run(next);
        if (r && acceptable(cur, r, c.gone)) { plan = next; cur = r; fixes.push({ kind: c.kind, id: c.id, what }); took = progressed = true; break; }
      }
      if (!took) break;
    }
    if (!progressed) break;
  }
  return { plan, fixes, result: cur, tried };
}

export function summaryLines(fixes) {
  if (!fixes.length) return ['自動修正：沒有工具能自己修的提醒'];
  const n = {};
  for (const f of fixes) n[f.kind] = (n[f.kind] || 0) + 1;
  return [`自動修好 ${fixes.length} 處：${ORDER.filter((k) => n[k]).map((k) => `${KINDS[k]} ${n[k]}`).join('、')}`, ...fixes.map((f) => `  ${KINDS[f.kind]}：${f.what}`)];
}

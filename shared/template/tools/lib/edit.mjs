// plan.json 第一層 edit（影片編輯器寫的設定）：檢查、正規化、rough.mp4 秒數 ↔ 成片秒數的對應
//
//   normalizeEdit(edit, { videoDur, cutpoints }) → { edit, errors, warnings, active }
//     edit＝{ cuts:[[a,b]…]（排序合併後）, fadeIn, fadeOut, volume:{ voice, sfx, media }, gains:[{ from, to, db }], joins:[{ at, type, dur }] }
//     active＝有任何會改變輸出的設定（沒有 edit、或全是預設值時 false → 輸出和沒寫 edit 一模一樣）
//   timeMap(cuts, videoDur) → { cuts, keep, outDur, identity, map(t), unmapStart(o), unmapEnd(o), joinsOut }
//     map：rough 秒數 → 成片秒數（落在 cut 裡的點收到 cut 的起點）
//     unmapStart／unmapEnd：成片秒數 → rough 秒數（剛好在接點上時：Start 取接點後、End 取接點前）
//   remapCues(cues, tm) → 成片時間的字幕（整句被剪掉的長度變 0，字幕產生器會略過）
//   dB(x) → 線性增益

import { r3 } from './time.mjs';

export const EDIT_KEYS = ['cuts', 'fadeIn', 'fadeOut', 'volume', 'gains', 'joins'];
export const VOLUME_KEYS = ['voice', 'sfx', 'media'];
export const JOIN_TYPES = ['none', 'dip', 'punch'];
export const DIP = 0.3;          // dip 預設長度
export const PUNCH = 1.08;       // punch 放大倍率
export const JOIN_TOL = 0.1;     // joins.at 要對到剪接點的容許誤差
export const dB = (x) => Math.pow(10, (x || 0) / 20);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

export const DEFAULT_EDIT = () => ({ cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, gains: [], joins: [] });

export function normalizeEdit(edit, { videoDur, cutpoints = [] } = {}) {
  const errors = [], warnings = [];
  const out = DEFAULT_EDIT();
  if (edit == null) return { edit: out, errors, warnings, active: false };
  const err = (m) => errors.push(`edit.${m}`);
  const warn = (m) => warnings.push(`edit.${m}`);
  if (typeof edit !== 'object' || Array.isArray(edit)) {
    errors.push('edit 要是一個物件，例如 { "cuts": [[12.0, 14.5]], "fadeIn": 0.5 }（影片編輯器會自動寫，手寫時照 shared/template/USAGE.md 第 6 節）');
    return { edit: out, errors, warnings, active: false };
  }
  for (const k of Object.keys(edit)) if (!EDIT_KEYS.includes(k)) err(`${k}：沒有這個欄位（可用：${EDIT_KEYS.join('、')}）`);

  // --- cuts ---
  if (edit.cuts != null) {
    if (!Array.isArray(edit.cuts)) err('cuts 要寫成陣列，例如 [[12.0, 14.5], [30.2, 31.0]]（rough.mp4 的秒數）');
    else {
      const list = [];
      edit.cuts.forEach((c, i) => {
        if (!Array.isArray(c) || c.length !== 2 || !c.every(isNum)) { err(`cuts[${i}] 要寫成 [起, 迄] 兩個秒數，現在是 ${JSON.stringify(c)}`); return; }
        let [a, b] = c;
        if (a < 0 || b <= a) { err(`cuts[${i}]：[${a}, ${b}] 起點要 ≥ 0、迄點要大於起點`); return; }
        if (videoDur != null && a >= videoDur) { err(`cuts[${i}]：起點 ${a}s 超過 rough.mp4 長度 ${videoDur}s`); return; }
        if (videoDur != null && b > videoDur) b = videoDur;
        list.push([r3(a), r3(b)]);
      });
      list.sort((x, y) => x[0] - y[0]);
      for (const c of list) {
        const last = out.cuts[out.cuts.length - 1];
        if (last && c[0] <= last[1] + 1e-6) {
          if (c[0] < last[1] - 1e-6) warn(`cuts：[${c[0]}, ${c[1]}] 和 [${last[0]}, ${last[1]}] 重疊，已合併`);
          last[1] = Math.max(last[1], c[1]);
        } else out.cuts.push([...c]);
      }
      const removed = out.cuts.reduce((s, [a, b]) => s + b - a, 0);
      if (videoDur != null && videoDur - removed < 1) err(`cuts 幾乎剪掉整支影片（剩 ${r3(videoDur - removed)}s）→ 檢查 cuts 的秒數`);
    }
  }
  const outDur = videoDur != null ? r3(videoDur - out.cuts.reduce((s, [a, b]) => s + b - a, 0)) : null;

  // --- 淡入淡出 ---
  for (const k of ['fadeIn', 'fadeOut']) {
    if (edit[k] == null) continue;
    if (!isNum(edit[k]) || edit[k] < 0 || edit[k] > 10) { err(`${k} 要是 0–10 的秒數，現在是 ${JSON.stringify(edit[k])}`); continue; }
    out[k] = r3(edit[k]);
  }
  if (outDur != null && out.fadeIn + out.fadeOut > outDur) err(`fadeIn＋fadeOut（${r3(out.fadeIn + out.fadeOut)}s）比成片長度 ${outDur}s 還長 → 縮短淡入淡出`);

  // --- 音量 ---
  if (edit.volume != null) {
    if (typeof edit.volume !== 'object' || Array.isArray(edit.volume)) err('volume 要寫成物件，例如 { "voice": 0, "sfx": -3, "media": 0 }（dB）');
    else for (const [k, v] of Object.entries(edit.volume)) {
      if (!VOLUME_KEYS.includes(k)) { err(`volume.${k}：沒有這個欄位（可用：voice＝主軌人聲、sfx＝全部音效、media＝有開聲音的插入素材）`); continue; }
      if (!isNum(v) || v < -60 || v > 12) { err(`volume.${k} 要是 −60～+12 的 dB 數字，現在是 ${JSON.stringify(v)}`); continue; }
      out.volume[k] = r3(v);
    }
  }

  // --- 局部音量（只調主軌人聲的某一段，疊在 volume.voice 上）---
  if (edit.gains != null) {
    if (!Array.isArray(edit.gains)) err('gains 要寫成陣列，例如 [{ "from": 41.2, "to": 44.0, "db": 4 }]（rough.mp4 的秒數）');
    else {
      const list = [];
      edit.gains.forEach((g, i) => {
        if (!g || typeof g !== 'object' || Array.isArray(g)) { err(`gains[${i}] 要是物件 { "from": 秒數, "to": 秒數, "db": 數字 }`); return; }
        for (const k of Object.keys(g)) if (!['from', 'to', 'db'].includes(k)) err(`gains[${i}].${k}：沒有這個欄位（可用：from、to、db）`);
        if (!isNum(g.from) || !isNum(g.to) || g.from < 0 || g.to <= g.from) { err(`gains[${i}]：from／to 要是 rough.mp4 的秒數，而且 to 大於 from，現在是 ${JSON.stringify([g.from, g.to])}`); return; }
        if (!isNum(g.db) || g.db < -60 || g.db > 12) { err(`gains[${i}].db 要是 −60～+12 的 dB 數字，現在是 ${JSON.stringify(g.db)}`); return; }
        if (videoDur != null && g.from >= videoDur) { err(`gains[${i}]：from ${g.from}s 超過 rough.mp4 長度 ${videoDur}s`); return; }
        list.push({ i, from: r3(g.from), to: r3(videoDur != null ? Math.min(g.to, videoDur) : g.to), db: r3(g.db) });
      });
      list.sort((a, b) => a.from - b.from);
      for (let k = 1; k < list.length; k++) {
        const a = list[k - 1], b = list[k];
        if (b.from < a.to - 1e-6) err(`gains[${b.i}]（${b.from}–${b.to}s）和 gains[${a.i}]（${a.from}–${a.to}s）範圍重疊 → 一段時間只能有一個局部音量，合併成一個或錯開`);
      }
      out.gains = list.map(({ from, to, db }) => ({ from, to, db }));
    }
  }

  // --- 接點轉場 ---
  if (edit.joins != null) {
    if (!Array.isArray(edit.joins)) err('joins 要寫成陣列，例如 [{ "at": 12.0, "type": "dip" }]');
    else {
      const points = [...out.cuts.flatMap(([a, b]) => [a, b]), ...cutpoints.map((c) => c.at).filter(isNum)];
      const seen = new Map();
      edit.joins.forEach((j, i) => {
        if (!j || typeof j !== 'object' || Array.isArray(j)) { err(`joins[${i}] 要是物件 { "at": 秒數, "type": "dip" }`); return; }
        for (const k of Object.keys(j)) if (!['at', 'type', 'dur'].includes(k)) err(`joins[${i}].${k}：沒有這個欄位（可用：at、type、dur）`);
        if (!isNum(j.at) || j.at < 0) { err(`joins[${i}].at 要是 rough.mp4 的秒數，現在是 ${JSON.stringify(j.at)}`); return; }
        const type = j.type ?? 'none';
        if (!JOIN_TYPES.includes(type)) { err(`joins[${i}].type 只能是 "none"、"dip"（過黑）或 "punch"（放大跳接），現在是 ${JSON.stringify(j.type)}`); return; }
        let dur = type === 'dip' ? DIP : 0;
        if (j.dur != null) {
          if (!isNum(j.dur) || j.dur <= 0 || j.dur > 2) { err(`joins[${i}].dur 要是 0–2 的秒數，現在是 ${JSON.stringify(j.dur)}`); return; }
          dur = r3(j.dur);
        }
        let at = r3(j.at);
        const near = points.length ? points.reduce((b, p) => (Math.abs(p - at) < Math.abs(b - at) ? p : b)) : null;
        if (near != null && Math.abs(near - at) <= JOIN_TOL + 1e-9) at = r3(near);
        else warn(`joins[${i}]：at ${at}s 不在剪接點上${near != null ? `（最近的是 ${near}s）` : '（work/cutpoints.json 不存在、也沒有 cuts）'} → 改成 work/cutpoints.json 的剪接點或 cuts 的邊界（誤差 ${JOIN_TOL}s 內）`);
        if (out.cuts.some(([a, b]) => at > a + 1e-6 && at < b - 1e-6)) { warn(`joins[${i}]：at ${at}s 在剪掉的範圍裡，已略過`); return; }
        if (videoDur != null && at > videoDur) { err(`joins[${i}].at ${at}s 超過 rough.mp4 長度 ${videoDur}s`); return; }
        if (seen.has(at)) warn(`joins[${i}]：和 joins[${seen.get(at)}] 在同一個接點（${at}s），只留後面這個`);
        seen.set(at, i);
        out.joins = out.joins.filter((x) => x.at !== at);
        out.joins.push(type === 'dip' ? { at, type, dur } : { at, type });
      });
      out.joins.sort((a, b) => a.at - b.at);
    }
  }
  const active = out.cuts.length > 0 || out.fadeIn > 0 || out.fadeOut > 0 || out.joins.some((j) => j.type !== 'none') || out.gains.some((g) => g.db !== 0) || VOLUME_KEYS.some((k) => out.volume[k] !== 0);
  return { edit: out, errors, warnings, active };
}

export function timeMap(cuts = [], videoDur = Infinity) {
  const keep = [];
  let t = 0;
  for (const [a, b] of cuts) { if (a > t) keep.push([t, a]); t = Math.max(t, b); }
  if (t < videoDur) keep.push([t, videoDur]);
  // 每個保留段在成片的起點
  let acc = 0;
  const segs = keep.map(([a, b]) => { const s = { a, b, o: acc }; acc += b - a; return s; });
  const outDur = r3(acc);
  const map = (x) => {
    let removed = 0;
    for (const [a, b] of cuts) {
      if (x <= a) break;
      removed += Math.min(x, b) - a;
    }
    return r3(x - removed);
  };
  const unmap = (o, preferNext) => {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], e = s.o + (s.b - s.a);
      if (preferNext ? o < e - 1e-9 : o <= e + 1e-9) return r3(s.a + Math.max(0, o - s.o));
    }
    const last = segs[segs.length - 1];
    return last ? r3(last.b) : r3(o);
  };
  // 成片裡的接點（cut 收起來的位置；片頭片尾的 cut 只是裁掉，不算接點）
  const joinsOut = cuts.filter(([a, b]) => a > 1e-6 && b < videoDur - 1e-6).map(([a]) => map(a));
  return {
    cuts, keep, outDur, identity: !cuts.length, map, joinsOut,
    unmapStart: (o) => unmap(o, true), unmapEnd: (o) => unmap(o, false),
  };
}

export function remapCues(cues, tm) {
  if (tm.identity) return cues;
  return cues.map((c) => ({ ...c, start: tm.map(c.start), end: tm.map(c.end) }));
}

// 成片區間 [s, e] 在接點（cut 收起來的位置）切開 → [{ s, e, ms }]（ms＝這一塊在 rough.mp4 的起點）
export function splitAtJoins(s, e, tm, extra = []) {
  const pts = [...new Set([...tm.joinsOut, ...extra])].filter((p) => p > s + 1e-6 && p < e - 1e-6).sort((a, b) => a - b);
  const bounds = [s, ...pts, e];
  const out = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = r3(bounds[i]), b = r3(bounds[i + 1]);
    if (b - a < 1e-3) continue;
    out.push({ s: a, e: b, ms: tm.unmapStart(a) });
  }
  return out;
}

// 區間相減：[s, e] 扣掉 holes（都已排序），回傳剩下的區間
export function subtract([s, e], holes) {
  let parts = [[s, e]];
  for (const [ha, hb] of holes) {
    const next = [];
    for (const [a, b] of parts) {
      if (hb <= a || ha >= b) { next.push([a, b]); continue; }
      if (ha > a) next.push([a, ha]);
      if (hb < b) next.push([hb, b]);
    }
    parts = next;
  }
  return parts.map(([a, b]) => [r3(a), r3(b)]).filter(([a, b]) => b - a > 1e-3);
}

export const fmtT = fmt;

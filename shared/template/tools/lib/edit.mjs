// plan.json 第一層 edit（剪輯台寫的設定）：檢查、正規化、rough.mp4 秒數 ↔ 完成影片秒數的對應
//
//   normalizeEdit(edit, { videoDur, cutpoints }) → { edit, errors, warnings, active }
//     edit＝{ cuts:[[a,b]…]（排序合併後）, fadeIn, fadeOut, volume:{ voice, sfx, media }, gains:[{ from, to, db }], joins:[{ at, type, dur }],
//             sfx?:[{ at, sound, db?, trimIn?, trimOut? }]（050 作者在剪輯台自己加的音效，照 at 排；一顆都沒有就沒有這個鍵；065 trimIn／trimOut＝裁掉音效檔的前段／後段秒數）,
//             sfxAdjust?:[{ id, shift?, trimIn?, trimOut? }]（065 AI 配的音效在剪輯台拖過、裁過的：id 見 SFX_ADJUST_ID；照 id 排；全是 0 的拿掉）,
//             level?:true（人聲大小聲拉平：重新編碼底片時先拉平再調響度；關著就沒有這個鍵） }
//     active＝有任何會改變輸出的設定（沒有 edit、或全是預設值時 false → 輸出和沒寫 edit 一模一樣；sfx 不算：它只多幾顆音效，底片照舊）
//   timeMap(cuts, videoDur) → { cuts, keep, outDur, identity, map(t), unmapStart(o), unmapEnd(o), joinsOut }
//     map：rough 秒數 → 完成影片秒數（落在 cut 裡的點收到 cut 的起點）
//     unmapStart／unmapEnd：完成影片秒數 → rough 秒數（剛好在接點上時：Start 取接點後、End 取接點前）
//   remapCues(cues, tm) → 完成影片時間的字幕（整句被剪掉的長度變 0，字幕產生器會略過）
//   dB(x) → 線性增益

import { r3, clock2 } from './time.mjs';

export const EDIT_KEYS = ['cuts', 'fadeIn', 'fadeOut', 'volume', 'gains', 'joins', 'sfx', 'sfxAdjust', 'level'];
export const VOLUME_KEYS = ['voice', 'sfx', 'media'];
export const SFX_NAME = /^[a-z][a-z0-9-]*$/;   // 音效名稱＝檔名（shared/sfx、shared/sfx-local 的 <名稱>.wav）
// 065 音效拖曳、裁前後：AI 配的那一顆用 id 指（"s05"＝s05 的主音效、"s05:ding"＝s05 的第一顆附加 ding、"s05:ding:2"＝第二顆、"mood:3"＝plan.json moods 第 3 個情緒點）
export const SFX_ADJUST_ID = /^(?:[a-z][a-z0-9_]*(?::[a-z][a-z0-9-]*(?::[1-9]\d*)?)?|mood:[1-9]\d*)$/i;
export const SFX_ADJUST_KEYS = ['id', 'shift', 'trimIn', 'trimOut'];
export const SFX_TRIM_MAX = 10;    // 裁前、裁後各最多幾秒
export const SFX_SHIFT_MAX = 600;  // 位移最多幾秒（拖到別段、拖出影片 build 會 ⚠ 並略過位移）
export const SFX_MIN_LEN = 0.1;    // 裁完至少要留幾秒
export const SFX_TRIM_FADE = 0.01; // 裁過的那一端加多少秒淡入／淡出（避免爆音）
const trimOk = (v) => v == null || (isNum(v) && v >= 0 && v <= SFX_TRIM_MAX);
export const JOIN_TYPES = ['none', 'dip', 'punch'];
export const DIP = 0.3;          // dip 預設長度
export const PUNCH = 1.08;       // punch 放大倍率
export const JOIN_TOL = 0.1;     // joins.at 要對到剪接點的容許誤差
export const dB = (x) => Math.pow(10, (x || 0) / 20);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const fmt = clock2;

export const DEFAULT_EDIT = () => ({ cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, gains: [], joins: [] });

export function normalizeEdit(edit, { videoDur, cutpoints = [] } = {}) {
  const errors = [], warnings = [];
  const out = DEFAULT_EDIT();
  if (edit == null) return { edit: out, errors, warnings, active: false };
  const err = (m) => errors.push(`edit.${m}`);
  const warn = (m) => warnings.push(`edit.${m}`);
  if (typeof edit !== 'object' || Array.isArray(edit)) {
    errors.push('edit 要是一個物件，例如 { "cuts": [[12.0, 14.5]], "fadeIn": 0.5 }（剪輯台會自動寫，手寫時照 shared/template/USAGE.md 第 6 節）');
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
  if (outDur != null && out.fadeIn + out.fadeOut > outDur) err(`fadeIn＋fadeOut（${r3(out.fadeIn + out.fadeOut)}s）比完成影片長度 ${outDur}s 還長 → 縮短淡入淡出`);

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

  // --- 自己加的音效（050：作者在剪輯台任意時間放的；這裡只看格式，名稱在不在這台機器的音效清單由 plan.mjs 查）---
  if (edit.sfx != null) {
    if (!Array.isArray(edit.sfx)) err('sfx 要寫成陣列，例如 [{ "at": 41.2, "sound": "ding" }]（rough.mp4 的秒數；剪輯台的音效軌按右鍵「在這裡加音效」會自動寫）');
    else {
      const list = [];
      edit.sfx.forEach((s, i) => {
        if (!s || typeof s !== 'object' || Array.isArray(s)) { err(`sfx[${i}] 要是物件 { "at": 秒數, "sound": "音效名稱" }`); return; }
        for (const k of Object.keys(s)) if (!['at', 'sound', 'db', 'trimIn', 'trimOut'].includes(k)) err(`sfx[${i}].${k}：沒有這個欄位（可用：at、sound、db、trimIn、trimOut）`);
        if (!isNum(s.at) || s.at < 0) { err(`sfx[${i}].at 要是 rough.mp4 的秒數，現在是 ${JSON.stringify(s.at)}`); return; }
        if (typeof s.sound !== 'string' || !SFX_NAME.test(s.sound)) { err(`sfx[${i}].sound 要是音效名稱（例 "ding"；跑 build.mjs --list 看有哪些），現在是 ${JSON.stringify(s.sound)}`); return; }
        if (s.db != null && (!isNum(s.db) || s.db < -60 || s.db > 12)) { err(`sfx[${i}].db 要是 −60～+12 的 dB 數字（這一顆的音量，不寫＝預設），現在是 ${JSON.stringify(s.db)}`); return; }
        for (const k of ['trimIn', 'trimOut']) if (!trimOk(s[k])) { err(`sfx[${i}].${k} 要是 0–${SFX_TRIM_MAX} 的秒數（裁掉音效檔的${k === 'trimIn' ? '前' : '後'}段，不寫＝不裁），現在是 ${JSON.stringify(s[k])}`); return; }
        if (videoDur != null && s.at > videoDur) { err(`sfx[${i}]：at ${s.at}s 超過 rough.mp4 長度 ${videoDur}s → 在剪輯台把這顆音效移除或往前拖`); return; }
        list.push({ at: r3(s.at), sound: s.sound, ...(s.db ? { db: r3(s.db) } : {}), ...(s.trimIn > 0 ? { trimIn: r3(s.trimIn) } : {}), ...(s.trimOut > 0 ? { trimOut: r3(s.trimOut) } : {}) });
      });
      list.sort((a, b) => a.at - b.at);
      if (list.length) out.sfx = list;
    }
  }
  // --- AI 配的音效拖過、裁過（065）：這裡只看格式；對不對得到那一顆、有沒有拖出那一段、裁完夠不夠長由 plan.mjs 查（要知道音效在哪、檔有多長）---
  if (edit.sfxAdjust != null) {
    if (!Array.isArray(edit.sfxAdjust)) err('sfxAdjust 要寫成陣列，例如 [{ "id": "s05", "shift": 0.4, "trimOut": 0.3 }]（剪輯台拖曳、裁剪 AI 配的音效會自動寫）');
    else {
      const byId = new Map();
      edit.sfxAdjust.forEach((a, i) => {
        if (!a || typeof a !== 'object' || Array.isArray(a)) { err(`sfxAdjust[${i}] 要是物件 { "id": "s05", "shift": 秒數, "trimIn": 秒數, "trimOut": 秒數 }`); return; }
        for (const k of Object.keys(a)) if (!SFX_ADJUST_KEYS.includes(k)) err(`sfxAdjust[${i}].${k}：沒有這個欄位（可用：${SFX_ADJUST_KEYS.join('、')}）`);
        if (typeof a.id !== 'string' || !SFX_ADJUST_ID.test(a.id)) { err(`sfxAdjust[${i}].id 要指到一顆音效："<段>"（主音效）、"<段>:<音效>"、"<段>:<音效>:<第幾顆>"（附加音效）或 "mood:<第幾個情緒點>"，現在是 ${JSON.stringify(a.id)}`); return; }
        if (a.shift != null && (!isNum(a.shift) || Math.abs(a.shift) > SFX_SHIFT_MAX)) { err(`sfxAdjust[${i}].shift 要是 −${SFX_SHIFT_MAX}～+${SFX_SHIFT_MAX} 的秒數（往後拖是正、往前是負），現在是 ${JSON.stringify(a.shift)}`); return; }
        for (const k of ['trimIn', 'trimOut']) if (!trimOk(a[k])) { err(`sfxAdjust[${i}].${k} 要是 0–${SFX_TRIM_MAX} 的秒數，現在是 ${JSON.stringify(a[k])}`); return; }
        if (byId.has(a.id)) warn(`sfxAdjust[${i}]：和 sfxAdjust[${byId.get(a.id).i}] 都是 ${a.id}，只留後面這個`);
        const o = { id: a.id, ...(a.shift ? { shift: r3(a.shift) } : {}), ...(a.trimIn > 0 ? { trimIn: r3(a.trimIn) } : {}), ...(a.trimOut > 0 ? { trimOut: r3(a.trimOut) } : {}) };
        byId.set(a.id, { i, o });
      });
      const list = [...byId.values()].map((x) => x.o).filter((o) => Object.keys(o).length > 1).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (list.length) out.sfxAdjust = list;
    }
  }
  // --- 人聲大小聲拉平（只影響重新編碼底片；不算 active：時間、剪接都不變）---
  if (edit.level != null) {
    if (typeof edit.level !== 'boolean') err(`level 要是 true（拉平人聲大小聲）或 false，現在是 ${JSON.stringify(edit.level)}`);
    else if (edit.level) out.level = true;
  }
  const active =out.cuts.length > 0 || out.fadeIn > 0 || out.fadeOut > 0 || out.joins.some((j) => j.type !== 'none') || out.gains.some((g) => g.db !== 0) || VOLUME_KEYS.some((k) => out.volume[k] !== 0);
  return { edit: out, errors, warnings, active };
}

export function timeMap(cuts = [], videoDur = Infinity) {
  const keep = [];
  let t = 0;
  for (const [a, b] of cuts) { if (a > t) keep.push([t, a]); t = Math.max(t, b); }
  if (t < videoDur) keep.push([t, videoDur]);
  // 每個保留段在完成影片的起點
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
  // 完成影片裡的接點（cut 收起來的位置；片頭片尾的 cut 只是裁掉，不算接點）
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

// 完成影片區間 [s, e] 在接點（cut 收起來的位置）切開 → [{ s, e, ms }]（ms＝這一塊在 rough.mp4 的起點）
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

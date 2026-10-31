// 剪輯台的時間換算與 edit 處理（純函式，沒有 DOM）
// 所有時間都是 rough.mp4 的秒數（剪之前），「成片時間」＝扣掉前面 cuts 之後的秒數。

export const r3 = (n) => Math.round(n * 1000) / 1000;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const JOIN_TOL = 0.1;          // joins.at 對到剪接點的容許誤差（契約 3.2：±0.1s）
export const PUNCH_SCALE = 1.08;
export const DIP_DEFAULT = 0.3;
export const MEDIA_TRANS = 0.5;       // 即時模擬裡 media 進出場的長度（示意）

export const TC_FPS = 30;              // 時間碼 HH:MM:SS:FF 用 30fps
export function defaultEdit() {
  return { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, gains: [], joins: [] };
}

export function mergeCuts(cuts) {
  const list = cuts.filter((c) => Array.isArray(c) && c[1] > c[0]).map(([a, b]) => [r3(a), r3(b)]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const c of list) {
    const last = out[out.length - 1];
    if (last && c[0] <= last[1] + 0.0005) last[1] = Math.max(last[1], c[1]);
    else out.push([c[0], c[1]]);
  }
  return out;
}

export function normEdit(e) {
  const d = defaultEdit();
  if (!e || typeof e !== 'object') return d;
  const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  const db = (v) => clamp(num(v, 0), -60, 12);
  return {
    cuts: mergeCuts(Array.isArray(e.cuts) ? e.cuts : []),
    fadeIn: clamp(num(e.fadeIn, 0), 0, 10), fadeOut: clamp(num(e.fadeOut, 0), 0, 10),
    volume: { voice: db(e.volume?.voice), sfx: db(e.volume?.sfx), media: db(e.volume?.media) },
    gains: (Array.isArray(e.gains) ? e.gains : []).filter((g) => g && typeof g.from === 'number' && typeof g.to === 'number' && g.to > g.from)
      .map((g) => ({ from: r3(g.from), to: r3(g.to), db: db(g.db) })).sort((a, b) => a.from - b.from),
    joins: (Array.isArray(e.joins) ? e.joins : []).filter((j) => j && typeof j.at === 'number' && ['dip', 'punch'].includes(j.type))
      .map((j) => (j.type === 'dip' ? { at: r3(j.at), type: 'dip', dur: num(j.dur, DIP_DEFAULT) } : { at: r3(j.at), type: 'punch' }))
      .sort((a, b) => a.at - b.at),
  };
}

export const cutTotal = (cuts) => cuts.reduce((s, [a, b]) => s + (b - a), 0);

// rough → 成片
export function outOf(t, cuts) {
  let o = t;
  for (const [a, b] of cuts) {
    if (t <= a) break;
    o -= Math.min(t, b) - a;
  }
  return o;
}
// 成片 → rough（落在剪接處時回傳剪掉範圍的終點）
export function roughOf(o, cuts) {
  let r = o;
  for (const [a, b] of cuts) {
    if (r >= a - 1e-6) r += b - a;
    else break;
  }
  return r;
}
export function cutIndexAt(t, cuts) {
  for (let i = 0; i < cuts.length; i++) if (t >= cuts[i][0] - 1e-6 && t < cuts[i][1] - 1e-6) return i;
  return -1;
}

export function fmt(t, digits = 2) {
  if (t == null || !Number.isFinite(t)) return '—';
  const neg = t < 0;
  t = Math.abs(t);
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60;
  const s = (t % 60).toFixed(digits).padStart(digits ? digits + 3 : 2, '0');
  return `${neg ? '−' : ''}${h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')}:${s}`;
}
// 時間碼 HH:MM:SS:FF（30fps）
export function fmtTC(t, fps = TC_FPS) {
  if (t == null || !Number.isFinite(t)) return '--:--:--:--';
  const f = Math.max(0, Math.round(t * fps));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(f / (3600 * fps)))}:${p(Math.floor(f / (60 * fps)) % 60)}:${p(Math.floor(f / fps) % 60)}:${p(f % fps)}`;
}
// 「00:01:23:10」「1:23」「1:23.5」「83.5」→ 秒
export function parseTC(str, fps = TC_FPS) {
  const s = String(str).trim().replace(/[：]/g, ':').replace(/[．]/g, '.');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(':');
  if (parts.some((x) => !/^\d+(\.\d+)?$/.test(x))) return null;
  const n = parts.map(Number);
  if (n.length === 4) return n[0] * 3600 + n[1] * 60 + n[2] + n[3] / fps;
  if (n.length === 3) return n[0] * 3600 + n[1] * 60 + n[2];
  if (n.length === 2) return n[0] * 60 + n[1];
  return null;
}
export const fmtSec = (s) => `${(Math.round(s * 100) / 100).toFixed(2)} 秒`;
export const fmtDb = (db) => (db <= -60 ? '靜音' : `${db > 0 ? '+' : ''}${(Math.round(db * 10) / 10).toFixed(db % 1 ? 1 : 0)} dB`);
export const fmtDbShort = (db) => (db == null ? '靜音' : db <= -60 ? '−∞' : `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(Math.round(db * 10) / 10)}`);
// 某個時間點人聲範圍音量（edit.gains）的 dB
export function gainAt(t, gains) {
  for (const g of gains) if (t >= g.from && t < g.to) return g.db;
  return 0;
}
export const dbToGain = (db) => (db == null ? 1 : db <= -60 ? 0 : Math.pow(10, db / 20));

// 剪接點：使用者剪掉的範圍（at＝起點）＋ work/cutpoints.json 的剪接點（剪乾淨時 auto-editor 剪掉的地方）；落在 cut 裡面的拿掉
// 片頭、片尾的裁剪（從 0 開始或剪到結尾）不算剪接點：前面或後面沒有畫面可以接
export function joinPoints(edit, cutpoints = [], dur = null) {
  const pts = [];
  edit.cuts.forEach(([a, b], i) => { if (a > 0.001 && (dur == null || b < dur - 0.001)) pts.push({ at: a, end: b, kind: 'cut', cut: i }); });
  for (const c of cutpoints) {
    if (pts.some((p) => Math.abs(p.at - c.at) <= JOIN_TOL || (p.kind === 'cut' && Math.abs(p.end - c.at) <= JOIN_TOL))) continue;
    if (cutIndexAt(c.at, edit.cuts) >= 0) continue;
    pts.push({ at: c.at, end: c.at, kind: c.kind === 'ng' ? 'ng' : 'pause' });
  }
  return pts.sort((x, y) => x.at - y.at);
}
export function joinFor(edit, p) {
  return edit.joins.find((j) => Math.abs(j.at - p.at) <= JOIN_TOL || (p.end != null && Math.abs(j.at - p.end) <= JOIN_TOL)) || null;
}
// cuts 改過之後：對不到任何剪接點的 joins 拿掉
export function cleanJoins(edit, cutpoints, dur = null) {
  const pts = joinPoints(edit, cutpoints, dur);
  edit.joins = edit.joins.filter((j) => pts.some((p) => Math.abs(j.at - p.at) <= JOIN_TOL || Math.abs(j.at - p.end) <= JOIN_TOL));
  return edit;
}

// 某個成片時間點的效果：黑色遮罩、聲音包絡、放大倍率
export function effectsAt(o, ctx) {
  const { edit, outDur, joinOuts } = ctx;
  let black = 0, audio = 1, scale = 1;
  if (edit.fadeIn > 0 && o < edit.fadeIn) { const a = 1 - Math.max(0, o) / edit.fadeIn; black = Math.max(black, a); audio = Math.min(audio, 1 - a); }
  if (edit.fadeOut > 0 && o > outDur - edit.fadeOut) { const a = clamp((o - (outDur - edit.fadeOut)) / edit.fadeOut, 0, 1); black = Math.max(black, a); audio = Math.min(audio, 1 - a); }
  for (let i = 0; i < joinOuts.length; i++) {
    const j = joinOuts[i];
    if (j.type === 'dip') {
      const half = (j.dur || DIP_DEFAULT) / 2;
      const d = Math.abs(o - j.o);
      if (d < half) black = Math.max(black, 1 - d / half);
    } else if (j.type === 'punch' && o >= j.o - 1e-4 && o < j.next) scale = PUNCH_SCALE;
  }
  return { black, audio, scale };
}

// 把剪接點換成成片時間（effectsAt 用）：每個 join 記住下一個剪接點在哪（punch 放大到那裡結束）
export function joinOutTimes(edit, points, outDur) {
  const outs = points.map((p) => ({ p, o: outOf(p.at, edit.cuts) }));
  const res = [];
  outs.forEach(({ p, o }, i) => {
    const j = joinFor(edit, p);
    if (!j) return;
    let next = outDur;
    for (let k = i + 1; k < outs.length; k++) if (outs[k].o > o + 0.05) { next = outs[k].o; break; }
    res.push({ o, type: j.type, dur: j.dur, next });
  });
  return res;
}

// 吸附：找最近的候選時間（px 門檻由呼叫端換算成秒）
export function snapTime(t, candidates, tol) {
  let best = t, bd = tol;
  for (const c of candidates) { const d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } }
  return best;
}

// 講者調光的即時預覽（contracts/look.md §7.4；係數出自 04 §3）：CSS filter 近似 LUT。
// 播的影片已經 bake 了 baked（assets/rough.mp4 的戳記），就用比值「從 baked 改到 color」；一樣時回 'none'
export const LOOK_CSS = { b: 0.0825, k: 0.02, s: 0.071 };
export function lookCss(color, baked = 0) {
  const c = Number(color) || 0, b = Number(baked) || 0;
  if (Math.abs(c - b) < 1e-6) return 'none';
  const f = (k) => Math.round(((1 + k * c) / (1 + k * b)) * 10000) / 10000;
  return `brightness(${f(LOOK_CSS.b)}) contrast(${f(LOOK_CSS.k)}) saturate(${f(LOOK_CSS.s)})`;
}

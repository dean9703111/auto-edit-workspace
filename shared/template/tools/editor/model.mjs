// 剪輯的時間換算與 edit 處理（純函式，沒有 DOM）
// 所有時間都是 rough.mp4 的秒數（剪之前），「完成影片時間」＝扣掉前面 cuts 之後的秒數。

export const r3 = (n) => Math.round(n * 1000) / 1000;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const JOIN_TOL = 0.1;          // joins.at 對到剪接點的容許誤差（契約 3.2：±0.1s）
export const PUNCH_SCALE = 1.08;
export const DIP_DEFAULT = 0.3;
export const MEDIA_TRANS = 0.5;       // 即時模擬裡 media 進出場的長度（示意）

export const TC_FPS = 30;              // 時間碼 HH:MM:SS:FF 用 30fps
// 精修用的時間：分:秒:格（1:23:10；一小時以上 1:02:03:10）。平常看分秒用 fmt
export function fmtFine(t) {
  const f = Math.round(Math.max(0, t || 0) * TC_FPS);
  const s = Math.floor(f / TC_FPS), m = Math.floor(s / 60), h = Math.floor(m / 60);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${h ? `${h}:${p2(m % 60)}` : m}:${p2(s % 60)}:${p2(f % TC_FPS)}`;
}
export function defaultEdit() {
  return { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, gains: [], joins: [], sfx: [], sfxAdjust: [], level: false };   // sfx：自己加的音效（050）；sfxAdjust：AI 配的音效拖過、裁過的（065）；這兩個存檔時一筆都沒有就不寫；level：人聲大小聲拉平，關著不寫
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
    sfx: sortOwnSfx((Array.isArray(e.sfx) ? e.sfx : []).filter((x) => x && typeof x.at === 'number' && x.at >= 0 && typeof x.sound === 'string' && x.sound)
      .map((x) => ownSfx(x.at, x.sound, x.db, x))),
    sfxAdjust: (Array.isArray(e.sfxAdjust) ? e.sfxAdjust : []).filter((a) => a && typeof a.id === 'string' && a.id)
      .reduce((list, a) => setAdj({ sfxAdjust: list }, a.id, a).sfxAdjust, []),
    level: e.level === true,   // 人聲大小聲拉平（存檔時關著就不寫）
  };
}

// 自己加的音效（edit.sfx，050）：{ at（rough.mp4 秒數，那一刻聽到）, sound, db?, trimIn?, trimOut? }；db 0＝預設音量、不裁＝0，都不寫
export const ownSfx = (at, sound, db = 0, trim = null) => {
  const v = clamp(Math.round((Number(db) || 0) * 10) / 10, -60, 12), ti = trimNum(trim?.trimIn), to = trimNum(trim?.trimOut);
  return { at: r3(at), sound, ...(v ? { db: v } : {}), ...(ti ? { trimIn: ti } : {}), ...(to ? { trimOut: to } : {}) };
};

// ---------- 音效拖曳、裁前後（065）----------
// AI 配的音效（段落的主音效、附加音效、動畫拍點、等待卡、情緒點）拖過、裁過的記在 edit.sfxAdjust：[{ id, shift?, trimIn?, trimOut? }]
//   id＝檢查報告每一顆的 key（"s05"、"s05:ding"、"s05:ding:2"、"mood:3"）；shift＝往後幾秒（rough.mp4 時間軸）；trimIn／trimOut＝裁掉檔案的前段／後段
// 自己加的（edit.sfx）裁前後一樣寫在那一顆的 trimIn／trimOut；改時間照舊改 at
export const SFX_MIN = 0.1;      // 裁完至少留幾秒（和 lib/edit.mjs 的 SFX_MIN_LEN 同一個數字；頁面不載 lib/edit.mjs）
export const SFX_TRIM_MAX = 10;  // 裁前、裁後各最多幾秒（同 lib/edit.mjs）
const trimNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0.0005 ? clamp(r3(v), 0, SFX_TRIM_MAX) : 0);
export const adjOf = (edit, id) => (id && Array.isArray(edit?.sfxAdjust) ? edit.sfxAdjust.find((a) => a.id === id) || null : null);
// 改一顆的覆寫（patch 裡沒寫的欄位照舊；0＝拿掉那個欄位，全拿掉＝整筆拿掉＝還原）；照 id 排，回傳 edit
export function setAdj(edit, id, patch) {
  const list = (edit.sfxAdjust ||= []);
  const i = list.findIndex((a) => a.id === id), old = i >= 0 ? list[i] : { id };
  const shift = 'shift' in patch ? (Number.isFinite(patch.shift) ? r3(patch.shift) : 0) : old.shift || 0;
  const ti = 'trimIn' in patch ? trimNum(patch.trimIn) : old.trimIn || 0, to = 'trimOut' in patch ? trimNum(patch.trimOut) : old.trimOut || 0;
  const o = { id, ...(Math.abs(shift) > 0.0005 ? { shift } : {}), ...(ti ? { trimIn: ti } : {}), ...(to ? { trimOut: to } : {}) };
  if (i >= 0) list.splice(i, 1);
  if (Object.keys(o).length > 1) list.push(o);
  list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return edit;
}
// 一顆音效在時間軸上的範圍：file＝檔案的起點（rough.mp4 秒數，沒拖之前是 base）、len＝裁之前能播幾秒（不知道＝null）、a＝{ shift, trimIn, trimOut }
//   → { file, start（開始響）, dur（播幾秒；不知道長度＝null）, off（從檔案第幾秒播）, trimIn, trimOut }
export function sfxSpan(file, len, a = null) {
  const ti = a?.trimIn || 0, to = a?.trimOut || 0, f = r3(file + (a?.shift || 0));
  return { file: f, start: r3(f + ti), dur: len != null ? r3(Math.max(SFX_MIN, len - ti - to)) : null, off: ti, trimIn: ti, trimOut: to };
}
export const sortOwnSfx = (list) => list.sort((a, b) => a.at - b.at);   // 就地排：拖曳中的那一顆還是同一個物件
// 這顆音效在時間軸上從哪裡開始播、多大聲：at 是聽到的那一刻（峰值），檔案要提早 peak 秒開始（build 再晚 1 格，這裡不算）
// conf＝/api/state 的 schema.sfx 那一筆（volume、peak）；找不到（清單還沒到、這台機器沒有這顆）時當 0.5 倍、峰值 0
export function ownSfxView(s, conf, globalDb = 0) {
  const db = 20 * Math.log10(conf?.volume > 0 ? conf.volume : 0.5) + (s.db || 0) + globalDb;
  return { start: r3(Math.max(0, s.at - (conf?.peak || 0))), db: Math.round(db * 10) / 10 };
}

export const cutTotal = (cuts) => cuts.reduce((s, [a, b]) => s + (b - a), 0);

// rough → 完成影片
export function outOf(t, cuts) {
  let o = t;
  for (const [a, b] of cuts) {
    if (t <= a) break;
    o -= Math.min(t, b) - a;
  }
  return o;
}
// 完成影片 → rough（落在剪接處時回傳剪掉範圍的終點）
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
  const neg = t < 0, k = 10 ** digits;
  t = Math.round(Math.abs(t) * k) / k;   // 先進位再拆，才不會出現 0:60
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60;
  const s = (t % 60).toFixed(digits).padStart(digits ? digits + 3 : 2, '0');
  return `${neg ? '−' : ''}${h ? `${h}:${String(m).padStart(2, '0')}` : String(m)}:${s}`;
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

// 某個完成影片時間點的效果：黑色遮罩、聲音包絡、放大倍率
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

// 把剪接點換成完成影片時間（effectsAt 用）：每個 join 記住下一個剪接點在哪（punch 放大到那裡結束）
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

// ---------- 背景音樂（057）----------
// 時間軸「背景音樂」軌畫什麼。report＝build --check --json 的 bed（undefined＝檢查報告還沒好）；server＝/api/state 的 bed（plan.json 與工作區預設，報告還沒好時先用）
//   kind：none＝沒有背景音樂、off＝這一集寫了不配、wait＝有曲子，位置等檢查報告、short＝影片太短沒鋪、on＝畫一條（帶 report 的範圍、淡入淡出、壓低的區間；muted＝靜音，畫暗的）
export const BED_TEXT = { none: '沒有背景音樂', off: '這一集不配' };
// bed.volume 的範圍（dB）：0＝曲庫檔原本的音量，最小值＝靜音（完成影片不放）。和 lib/music.mjs 的 BED.volume 同一組數字（頁面不能載 lib/music.mjs）
export const BED_VOL = Object.freeze([-40, 6]);
export const bedMutedAt = (v) => v <= BED_VOL[0];
export function bedLane(report, server) {
  if (report !== undefined) {
    if (!report) return { kind: 'none', text: BED_TEXT.none };
    if (!report.music) return { kind: 'off', text: BED_TEXT.off };
    if (report.short) return { kind: 'short', music: report.music, text: `${report.music}：影片太短，沒有鋪背景音樂` };
    return { ...report, kind: 'on', ducks: report.ducked && Array.isArray(report.ducks) ? report.ducks : [] };
  }
  if (server?.off) return { kind: 'off', text: BED_TEXT.off };
  if (!server?.music) return { kind: 'none', text: BED_TEXT.none };
  return { kind: 'wait', music: server.music, text: `${server.music}（位置等檢查報告）` };
}
// 音量滑桿能不能拖：有曲子才能（沒有、這一集不配都灰掉）
export const bedHasMusic = (lane) => ['on', 'wait', 'short'].includes(lane?.kind);
// 即時試聽要補幾 dB：上一次 build 的 wav 已經混了那時的 bed.volume，只補現在和那時的差；
// 重新 build 之後差＝0，不會疊兩次。built＝/api/state 的 bed.built（沒有＝還沒做進預覽，回 0）。靜音由呼叫端處理（增益 0）
export const bedLiveDb = (volume = 0, built = null) => (built ? volume - (built.volume || 0) : 0);
// 完成影片第 o 秒的淡入淡出（0–1）：照 build 算好的 outStart／outEnd／fadeIn／fadeOut
export function bedFadeAt(o, b) {
  if (!b || !(o >= b.outStart) || !(o <= b.outEnd)) return 0;
  const fi = b.fadeIn > 0 ? (o - b.outStart) / b.fadeIn : 1, fo = b.fadeOut > 0 ? (b.outEnd - o) / b.fadeOut : 1;
  return clamp(Math.min(fi, fo, 1), 0, 1);
}

// ---------- 片尾（076）----------
// 片尾卡接在影片後面，rough.mp4 沒有那幾秒：時間軸在結尾多畫 dur 秒，播放頭可以走進去看。
// report＝build --check --json 整份（undefined＝檢查報告還沒好）；server＝/api/state 的 end（上一次 build 做進預覽的，報告還沒好時先用）
//   endingLane → { dur, quote（金句，沒有＝''）, image（示意圖的網址，沒有＝null） }；沒有片尾卡＝null
export function endingLane(report, server) {
  const built = server?.ending || null;
  const e = report !== undefined ? report?.ending : built;
  if (!e || !(e.dur > 0)) return null;
  const quote = Array.isArray(e.quote) ? e.quote.join('，') : typeof e.quote === 'string' ? e.quote : '';
  // 082 行：報告的 quoteLines（作者分的行裡有逗號，不能再用逗號切）＞上次 build 的＞舊報告照逗號切
  const lines = Array.isArray(e.quoteLines) && e.quoteLines.length ? e.quoteLines : Array.isArray(built?.quote) && built.quote.length ? built.quote : quote ? quote.split('，') : [];
  return { dur: r3(e.dur), quote, image: built?.image || null, lines, manual: !!e.quoteManual };
}
//   outroLane → { music, outStart, outEnd（完成影片秒數，含片尾卡那幾秒）, fadeIn, fadeOut, relDb, auto }；沒有片尾配樂（或舊的報告沒有範圍）＝null
export function outroLane(report, server) {
  if (report !== undefined) {
    const o = report?.outro;
    if (!o?.music || !(o.outEnd > o.outStart)) return null;
    return { music: o.music, outStart: o.outStart, outEnd: o.outEnd, fadeIn: o.fadeIn || 0, fadeOut: o.fadeOut || 0, relDb: typeof o.relDb === 'number' ? o.relDb : null, auto: !!o.auto };
  }
  const b = server?.outro;
  return b?.music && b.dur > 0 ? { music: b.music, outStart: b.at || 0, outEnd: r3((b.at || 0) + b.dur), fadeIn: b.fadeIn || 0, fadeOut: b.fadeOut || 0, relDb: null, auto: false } : null;
}
// 背景音樂軌沒有底樂時寫的那一行：有片尾配樂就說它在最後（不然寫「沒有背景音樂」，右邊卻畫著一條）
export const bedNoneText = (lane, outro) => (outro && lane?.kind === 'none' ? '整支沒有鋪背景音樂，只有片尾配樂（在最後）' : lane?.text || '');

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

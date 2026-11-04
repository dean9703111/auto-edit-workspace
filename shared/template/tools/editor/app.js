// 剪輯主程式：載入狀態、以選取為中心的屬性面板、時間軸操作（裁剪、分割、音量線、字幕）、復原、儲存、重新產生、鍵盤
import {
  defaultEdit, normEdit, mergeCuts, cutTotal, outOf, cutIndexAt, joinPoints, joinFor, cleanJoins, joinOutTimes,
  fmt, fmtTC, parseTC, fmtSec, fmtDb, fmtDbShort, clamp, r3, dbToGain, gainAt, JOIN_TOL, DIP_DEFAULT, TC_FPS, lookCss,
} from './model.mjs';
import { applyCueOp, remapPlan, fixAnchors, refsTo, refTime, replay, canInsert, canSplit, canMerge, gapAround, splitPos, anchorFor, parseRef, RULES } from './subtitles.mjs';
import { visibleLen, richPlain, lineLens, splitItem, joinItem, parseAttrs, findSceneDef, findFxDef } from './text.mjs';
import { Timeline, LANES, TRACK_NAMES } from './timeline.js';
import { SimPreview, PlayerPreview } from './preview.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const r2 = (n) => Math.round(n * 100) / 100;
const TRANS = [['cut', '直接切'], ['fade', '淡入淡出'], ['slide', '滑入滑出'], ['zoom', '縮放']];
const JOIN_TYPES = [['none', '無'], ['dip', '過黑'], ['punch', '放大']];
const KIND_ZH = { cut: '你剪掉的範圍', ng: 'NG 重錄（剪乾淨時剪掉）', pause: '停頓（剪乾淨時剪掉）' };
const TYPE_ZH = { scene: '資訊卡', fx: '字卡動態', custom: '自訂動畫', media: '插入素材' };
const SEG_KEYS = { common: ['sfxVolume', 'sfx'], media: ['enter', 'exit', 'volume', 'from', 'to', 'in', 'anchor'], scene: ['slots'], fx: ['vars'] };
const COACH_KEY = 'auto-edit-editor.coach.v2';

// ---------- 狀態 ----------
const app = {
  server: null, dur: 0, fps: 30,
  plan0: null, cues0: [], scenes: [], cues: [], srtOps: [],
  edit: defaultEdit(), savedEdit: defaultEdit(), base: null, sfxMemory: {},
  splits: [], sel: { a: null, b: null }, selection: null, selLane: null,
  report: null, reportReady: false, auditIssues: null, requests: [], items: [], itemsView: [], animRows: 1, itemsHint: '檢查中…', sfxView: [], pieces: [], points: [],
  voiceOnly: [], voiceUncovered: [], uncovered: [], look: null, savedLook: null, lookPrev: {}, lookCss: 'none', theme: 'light', savedTheme: 'light', cutpoints: [], peaks: null, peaksHint: '波形計算中…', thumbs: {}, snapOn: true, tool: 'select',
  tracks: { anim: {}, media: {}, main: {}, cap: {}, voice: {}, sfx: {} },
  undoStack: [], redoStack: [], savedSnap: '', lastCoalesce: null, gesture: null, busy: false, building: false,
  t: 0, mode: 'sim', stopAt: null, outDur: 0, ver: 0, drawRequested: true, rate: 0, loud: null,
  // 畫布（009 FR-120）：/api/state 的 canvas（server 用 lib/canvas.mjs 算）；還沒載入時當橫式
  canvas() { return this.server?.canvas || { format: 'landscape', W: 1920, H: 1080, maxChars: RULES.capMax }; },
};
window.__editor = app;
const capMax = () => app.canvas().maxChars;
let rqLoaded = false;   // 除錯與實測用

// ---------- 小工具 ----------
async function api(method, url, body) {
  try {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { message: '連不到剪輯（可能已經關掉了）→ 請 AI 重新啟動剪輯後重新整理頁面' } };
  }
}
function toast(msg, kind = 'ok', ms = 3200, { busy = false, actions = [] } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${busy ? 'busy' : kind}`;
  el.innerHTML = `<div class="msg"><span class="t"></span>${busy ? '<div class="bar"></div>' : ''}</div>`;
  el.querySelector('.t').textContent = msg;
  for (const [label, fn] of actions) { const b = document.createElement('button'); b.className = 'small'; b.textContent = label; b.addEventListener('click', () => { fn(); el.remove(); }); el.append(b); }
  $('#toasts').append(el);
  if (ms > 0) setTimeout(() => el.remove(), ms);
  return { el, set: (m) => { el.querySelector('.t').textContent = m; }, close: () => el.remove() };
}
function banner(html, kind = '', buttons = []) {
  const b = $('#banner');
  if (!html) { b.hidden = true; b.innerHTML = ''; return; }
  b.className = `banner ${kind}`;
  b.innerHTML = `<span class="grow">${html}</span>`;
  for (const [label, fn, cls] of buttons) { const btn = document.createElement('button'); btn.textContent = label; btn.className = cls || 'small'; btn.addEventListener('click', fn); b.append(btn); }
  b.hidden = false;
}
const frameSnap = (t) => r3(Math.round(t * app.fps) / app.fps);
const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 私密視窗等：不記也沒關係 */ } },
};
const sceneById = (id) => app.scenes.find((s) => isObj(s) && s.id === id) || null;
const savedSceneById = (id) => (app.plan0?.scenes || []).find((s) => isObj(s) && s.id === id) || null;
const segType = (sc) => sc?.type ?? 'scene';
app.mediaSeg = (id) => app.server?.media.find((m) => m.id === id) || null;
app.requestDraw = () => { app.drawRequested = true; };
app.isCutRange = (a, b) => app.edit.cuts.some(([x, y]) => a >= x - 0.01 && b <= y + 0.01);
app.captionAt = (t) => {
  const c = app.cues;
  let lo = 0, hi = c.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].end <= t) lo = m + 1; else if (c[m].start > t) hi = m - 1; else return c[m]; }
  return null;
};
app.gapAt = (t) => {
  const k = app.cues.findIndex((c) => c.start > t);
  const after = k < 0 ? (app.cues.length ? app.cues[app.cues.length - 1].n : 0) : k === 0 ? 0 : app.cues[k - 1].n;
  const g = canInsert(app.cues, after, app.dur);
  return g.ok ? { after, lo: g.lo, hi: g.hi } : null;
};
app.trackLocked = (k) => !!app.tracks[k]?.lock;
app.trackMuted = (k) => (k === 'voice' || k === 'sfx' || k === 'media') && app.edit.volume[k] <= -60;
app.isSelected = (kind, id) => app.selection?.kind === kind && app.selection.id === id;
app.headTail = () => {
  const c = app.edit.cuts;
  return { head: c.length && c[0][0] <= 0.001 ? c[0][1] : 0, tail: c.length && c[c.length - 1][1] >= app.dur - 0.001 ? c[c.length - 1][0] : app.dur };
};
app.nextPointAfter = (p) => {
  const o = outOf(p.at, app.edit.cuts);
  for (const q of app.points) if (q !== p && outOf(q.at, app.edit.cuts) > o + 0.05) return q.at;
  return app.dur;
};
let fxCache = null;
app.fxCtx = () => {
  if (!fxCache || fxCache.ver !== app.ver) fxCache = { ver: app.ver, edit: app.edit, outDur: app.outDur, joinOuts: joinOutTimes(app.edit, app.points, app.outDur) };
  return fxCache;
};
let snapCache = null;
app.snapCandidates = () => {
  if (!snapCache || snapCache.ver !== app.ver) {
    const c = [];
    for (const q of app.cues) { c.push({ t: q.start, kind: 'cueStart', n: q.n }, { t: q.end, kind: 'cueEnd', n: q.n }); }
    for (const [a, b] of app.edit.cuts) c.push({ t: a, kind: 'cut' }, { t: b, kind: 'cut' });
    for (const p of app.points) if (p.kind !== 'cut') c.push({ t: p.at, kind: 'point' });
    for (const it of app.itemsView) c.push({ t: it.start, kind: 'item' }, { t: it.end, kind: 'item' });
    for (const t of app.splits) c.push({ t, kind: 'split' });
    snapCache = { ver: app.ver, list: c };
  }
  const extra = app.gesture ? [] : [{ t: app.t, kind: 'play' }];   // 拖曳時預覽會跟著邊緣走，播放頭不當吸附點
  if (app.sel.a != null) extra.push({ t: app.sel.a, kind: 'item' });
  if (app.sel.b != null) extra.push({ t: app.sel.b, kind: 'item' });
  return snapCache.list.concat(extra);
};

// ---------- 快照、復原 ----------
const editableScenes = () => app.scenes;
const snapshot = () => JSON.stringify({ edit: app.edit, scenes: editableScenes(), ops: app.srtOps, cues: app.cues, splits: app.splits, look: app.look, theme: app.theme });
const dirtySnap = () => JSON.stringify({ edit: app.edit, scenes: editableScenes(), ops: app.srtOps, look: app.look, theme: app.theme });
const isDirty = () => app.savedSnap !== '' && dirtySnap() !== app.savedSnap;

function normalize() {
  app.edit.cuts = mergeCuts(app.edit.cuts);
  cleanJoins(app.edit, app.cutpoints, app.dur);
  app.edit.gains = app.edit.gains.filter((g) => g.to - g.from >= 0.05).sort((a, b) => a.from - b.from);
  app.splits = [...new Set(app.splits.map(r3))].filter((t) => t > 0.001 && t < app.dur - 0.001 && cutIndexAt(t, app.edit.cuts) < 0 && !app.edit.cuts.some(([a, b]) => Math.abs(t - a) < 0.01 || Math.abs(t - b) < 0.01)).sort((a, b) => a - b);
}
function mutate(fn, { coalesce = null, inspector = false } = {}) {
  if (app.busy) { toast('儲存中，等一下再改', 'warn', 1500); return false; }
  const before = snapshot();
  const now = performance.now();
  const merge = coalesce && app.lastCoalesce?.key === coalesce && now - app.lastCoalesce.t < 1500;
  const res = fn();
  if (res === false) return false;
  normalize();
  if (snapshot() === before) return false;
  if (!merge) { app.undoStack.push(before); if (app.undoStack.length > 300) app.undoStack.shift(); }
  app.redoStack = [];
  app.lastCoalesce = coalesce ? { key: coalesce, t: now } : null;
  changed({ inspector });
  return true;
}
// 拖曳：開始時記快照，過程中直接改，放開時一次進復原清單
app.gestureBegin = () => { app.gesture = snapshot(); };
app.gestureEnd = (commit = true) => {
  const before = app.gesture;
  app.gesture = null;
  if (!before) return;
  if (!commit) { restore(before); return; }
  normalize();
  if (snapshot() !== before) { app.undoStack.push(before); app.redoStack = []; app.lastCoalesce = null; }
  changed({ inspector: true });
};
function restore(s) {
  const o = JSON.parse(s);
  app.edit = normEdit(o.edit);
  app.scenes = o.scenes; app.srtOps = o.ops; app.cues = o.cues; app.splits = o.splits || []; app.look = o.look ?? null; app.theme = o.theme ?? app.savedTheme;
  app.lastCoalesce = null;
  if (app.selection?.kind === 'cue' && !app.cues.some((c) => c.n === app.selection.id)) app.selection = null;
  changed({ inspector: true });
}
function undo() { if (!app.undoStack.length) return; app.redoStack.push(snapshot()); restore(app.undoStack.pop()); toast('已復原', 'ok', 1200); }
function redo() { if (!app.redoStack.length) return; app.undoStack.push(snapshot()); restore(app.redoStack.pop()); toast('已重做', 'ok', 1200); }

// ---------- 衍生資料（時間軸畫的東西）----------
function recompute() {
  app.ver++;
  app.points = joinPoints(app.edit, app.cutpoints, app.dur);
  app.outDur = Math.max(0, app.dur - cutTotal(app.edit.cuts));
  // 主軌片段：0、結尾、分割點、剪掉範圍的邊緣隔開
  const bs = [...new Set([0, app.dur, ...app.splits, ...app.edit.cuts.flat()].map(r3))].filter((t) => t >= 0 && t <= app.dur).sort((a, b) => a - b);
  app.pieces = [];
  for (let i = 0; i < bs.length - 1; i++) { const a = bs[i], b = bs[i + 1]; if (b - a > 0.001 && cutIndexAt((a + b) / 2, app.edit.cuts) < 0) app.pieces.push({ a, b, key: a.toFixed(3) }); }
  // 段落：檢查報告的位置（rough 秒數），本機改過的照新時間平移
  const list = [];
  const reportItems = app.items.length ? app.items : localItems();
  for (const it of reportItems) {
    const sc = sceneById(it.id), sb = savedSceneById(it.id);
    const o = { ...it, vend: it.shownEnd ?? it.end };
    if (sc && sb) {
      const ds = (refTime(sc.from ?? sc.at, app.cues) ?? 0) - (refTime(sb.from ?? sb.at, app.cues0) ?? 0);
      if (segType(sc) === 'media') {
        const s = refTime(sc.from, app.cues);
        let e = sc.to != null ? refTime(sc.to, app.cues) : Number.isFinite(sc.duration) ? (s ?? 0) + sc.duration : null;
        if (s != null) { o.start = r3(s); o.end = r3(e ?? s + (it.end - it.start)); o.vend = o.end; }
      } else if (Number.isFinite(ds) && Math.abs(ds) > 1e-4) {
        o.start = r3(it.start + ds);
        const de = sc.to != null && sb.to != null ? (refTime(sc.to, app.cues) ?? 0) - (refTime(sb.to, app.cues0) ?? 0) : ds;
        o.end = r3(it.end + (Number.isFinite(de) ? de : ds)); o.vend = r3(o.vend + (Number.isFinite(de) ? de : ds));
      } else if (sc.to != null && sb.to != null) {
        const de = (refTime(sc.to, app.cues) ?? 0) - (refTime(sb.to, app.cues0) ?? 0);
        if (Number.isFinite(de) && Math.abs(de) > 1e-4) { o.end = r3(it.end + de); o.vend = r3(o.vend + de); }
      }
      o.ds = Number.isFinite(ds) ? ds : 0;
      o.textDirty = !same(sc.slots, sb.slots) || !same(sc.vars, sb.vars);
    }
    if (o.type === 'media' && sc) {
      const m = app.mediaSeg(o.id);
      Object.assign(o, { in: Number.isFinite(sc.in) ? sc.in : 0, speed: Number.isFinite(sc.speed) ? sc.speed : 1, volume: sc.volume === undefined ? null : sc.volume,
        enter: sc.enter ?? null, exit: sc.exit ?? null, mediaKind: m?.kind || 'video', srcName: String(sc.src || '').split('/').pop(), srcDur: m?.info?.dur ?? null });
    }
    o.inCut = app.edit.cuts.some(([a, b]) => o.start < b && o.end > a);
    list.push(o);
  }
  list.sort((a, b) => a.start - b.start);
  const ends = [];
  for (const it of list) {
    if (it.type === 'media') continue;
    let r = ends.findIndex((e) => e <= it.start + 0.001);
    if (r < 0) { r = ends.length; ends.push(0); }
    ends[r] = it.vend ?? it.end;
    it.row = r;
  }
  app.animRows = Math.max(1, Math.min(3, ends.length));
  app.itemsView = list;
  // 音效標記
  const sv = [];
  for (const it of list) {
    const sc = sceneById(it.id), sb = savedSceneById(it.id);
    const savedMuted = sb?.sfx === null;
    const curMuted = sc?.sfx === null;
    const savedSegDb = Number.isFinite(sb?.sfxVolume) ? sb.sfxVolume : 0, curSegDb = Number.isFinite(sc?.sfxVolume) ? sc.sfxVolume : 0;
    const dGlobal = app.edit.volume.sfx - app.savedEdit.volume.sfx;
    (it.sfx || []).forEach((m, j) => {
      const main = j === 0 && !savedMuted;
      const db = m.db == null ? null : m.db - savedSegDb + curSegDb + dGlobal;
      sv.push({ id: `${it.id}:${j}`, segId: it.id, name: m.name, at: r3(m.at + (it.ds || 0)), main, muted: main && curMuted, db, gain: db == null ? 0 : dbToGain(db) });
    });
    if (savedMuted && sc && app.sfxMemory[it.id] && !sv.some((m) => m.segId === it.id && m.main)) {
      // 存檔時已經靜音：在段落開頭放一顆灰色標記，點了可以取消靜音
      const mem = app.sfxMemory[it.id];
      sv.push({ id: `${it.id}:muted`, segId: it.id, name: mem?.value || '音效', at: it.start, main: true, muted: curMuted, db: null, gain: 0, ghost: true });
    }
  }
  app.sfxView = sv.sort((a, b) => a.at - b.at);
}
// 檢查報告讀不到時：照 plan.json 自己算段落位置（章節轉場、預設長度不準，只是示意）
function localItems() {
  const out = [];
  for (const sc of app.plan0?.scenes || []) {
    if (!isObj(sc) || !sc.id) continue;
    const s = refTime(sc.from ?? sc.at, app.cues0);
    if (s == null) continue;
    let e = sc.to != null ? refTime(sc.to, app.cues0) : Number.isFinite(sc.duration) ? s + sc.duration : s + (sc.at && !sc.from ? 2.5 : 5);
    if (e == null || e <= s) e = s + 3;
    const type = segType(sc);
    const def = type === 'scene' ? findSceneDef(app.server?.schema?.scenes, sc.scene) : type === 'fx' ? findFxDef(app.server?.schema?.fx, sc.fx) : null;
    out.push({ id: sc.id, type, label: type === 'media' ? String(sc.src || '').split('/').pop() : def ? `${def.no ?? ''} ${def.zh}` : String(sc.scene ?? sc.fx ?? ''), start: r3(s), end: r3(e), sfx: [], warnings: 0, local: true });
  }
  return out;
}

function changed({ inspector = false } = {}) {
  recompute();
  updateLookCss();
  if (app.selection && !selectionExists(app.selection)) app.selection = null;
  renderHeader(); renderTimes(); renderStatus(); renderHeads(); renderCapButtons();
  if (inspector) renderInspector();
  timeline.invalidate();
}
function selectionExists(s) {
  switch (s.kind) {
    case 'cue': return app.cues.some((c) => c.n === s.id);
    case 'item': case 'media': return app.itemsView.some((it) => it.id === s.id);
    case 'cut': return !!app.edit.cuts[s.id];
    case 'gain': return !!app.edit.gains[s.id];
    case 'piece': return app.pieces.some((p) => p.key === s.id);
    case 'join': return app.points.some((p) => Math.abs(p.at - s.id) < 1e-6);
    case 'sfx': return app.sfxView.some((m) => m.segId === s.id);
    default: return true;
  }
}
app.select = (sel, { lane = null } = {}) => {
  app.selection = sel;
  if (lane) app.selLane = lane;
  if (sel && sel.kind !== 'range') app.sel = { a: null, b: null };
  renderInspector(); renderHeads(); renderCapButtons(); renderStatus(); renderRequests();
  timeline.invalidate();
};

// ---------- 主軌：裁剪、分割 ----------
app.setSelection = (a, b, { live = false } = {}) => {
  app.sel = { a: a == null ? null : frameSnap(a), b: b == null ? null : frameSnap(b) };
  if (app.sel.a != null && app.sel.b != null && app.sel.b > app.sel.a) app.selection = { kind: 'range', id: 'range' };
  else if (app.selection?.kind === 'range') app.selection = null;
  if (!live) { renderInspector(); renderStatus(); }
  timeline.invalidate();
};
const selValid = () => app.sel.a != null && app.sel.b != null && app.sel.b - app.sel.a >= 1 / app.fps - 1e-6;
function setIn() { const a = frameSnap(app.t); app.setSelection(a, app.sel.b != null && app.sel.b > a ? app.sel.b : null); }
function setOut() { const b = frameSnap(app.t); app.setSelection(app.sel.a != null && app.sel.a < b ? app.sel.a : null, b); }
function cutRange(a, b) {
  b = Math.min(b, app.dur);
  if (b - a > app.dur - 0.6) { toast('不能把整支影片都剪掉', 'err'); return; }
  if (b - a < 1 / app.fps) return;
  mutate(() => { app.edit.cuts.push([r3(a), r3(b)]); });
  app.sel = { a: null, b: null };
  const i = app.edit.cuts.findIndex(([x, y]) => x <= a + 1e-6 && y >= b - 1e-6);
  app.select(i >= 0 ? { kind: 'cut', id: i } : null);
  toast(`已剪掉 ${fmtSec(b - a)}（⌘／Ctrl＋Z 可以復原）`);
}
function restoreCut(i) {
  const c = app.edit.cuts[i];
  if (!c) return;
  mutate(() => { app.edit.cuts.splice(i, 1); });
  app.select(null);
  toast(`已恢復 ${fmt(c[0])}–${fmt(c[1])}`);
}
function splitMain(t = app.t) {
  t = frameSnap(t);
  if (cutIndexAt(t, app.edit.cuts) >= 0) { toast('播放頭在剪掉的範圍裡，不用再切', 'warn'); return; }
  if (t <= 0.01 || t >= app.dur - 0.01) { toast('播放頭在開頭或結尾，沒有東西可以切', 'warn'); return; }
  if (app.splits.some((x) => Math.abs(x - t) < 0.01)) { toast('這裡已經切開了', 'warn', 1500); return; }
  mutate(() => { app.splits.push(t); });
  toast('已在播放頭切開主軌：點選要拿掉的那段，按 Delete', 'ok', 3500);
}

// ---------- 字幕 ----------
function pushSrtOp(op) {
  const last = app.srtOps[app.srtOps.length - 1];
  if (op.op === 'set' && last?.op === 'set' && last.n === op.n) Object.assign(last, op);
  else app.srtOps.push(op);
}
function doSrtOp(op, { quiet = false } = {}) {
  const r = applyCueOp(app.cues, op, { videoDur: app.dur });
  if (r.error) { toast(r.error, 'err', 5000); return false; }
  return mutate(() => {
    const before = { scenes: app.scenes };
    const after = remapPlan(before, op, app.cues);
    const fx = fixAnchors(before, after, app.cues, r.cues);
    app.scenes = fx.plan.scenes;
    app.cues = r.cues;
    pushSrtOp({ ...op });
    if (fx.changed.length && !quiet) toast(`${fx.changed.join('、')} 的 anchor 已換成新起點那句的開頭`, 'ok', 3500);
  }, { inspector: true });
}
const selectedCue = () => (app.selection?.kind === 'cue' ? app.cues.find((c) => c.n === app.selection.id) : null);
function capSplitInfo(c = selectedCue() || app.captionAt(app.t)) {
  if (!c) return { ok: false, why: '先點一句字幕，或把播放頭移到要切的那句', cue: null };
  const at = frameSnap(app.t);
  const chk = canSplit(c, at);
  return { ...chk, cue: c, at };
}
function splitCue() {
  const info = capSplitInfo();
  if (!info.ok) { toast(info.why, 'warn', 4000); return; }
  const ta = $('#capText');
  let pos = null;
  if (ta && app.selection?.kind === 'cue' && app.selection.id === info.cue.n && ta.dataset.caret) {
    const p = Number(ta.dataset.caret);
    const len = [...info.cue.text].length;
    const cp = [...ta.value.slice(0, p)].length;
    if (cp > 0 && cp < len) pos = cp;
  }
  if (pos == null) pos = splitPos(info.cue.text, (info.at - info.cue.start) / (info.cue.end - info.cue.start));
  if (doSrtOp({ op: 'split', n: info.cue.n, at: info.at, pos })) {
    const c = app.cues[app.cues.findIndex((q) => q.n === info.cue.n)];
    app.select({ kind: 'cue', id: c.n }, { lane: 'cap' });
    toast(`已把第 ${info.cue.n} 句在 ${fmtTC(info.at)} 切成兩句，後面的句號都 +1（plan.json 已跟著改）`, 'ok', 4000);
  }
}
function mergeCue(c = selectedCue()) {
  if (!c) { toast('先點一句字幕', 'warn'); return; }
  const chk = canMerge(app.cues, c.n);
  if (!chk.ok) { toast(chk.why, 'warn'); return; }
  if (doSrtOp({ op: 'merge', n: c.n })) { app.select({ kind: 'cue', id: c.n }, { lane: 'cap' }); toast(`已合併第 ${c.n}、${c.n + 1} 句`, 'ok'); }
}
function insertInfo(where = 'after', c = selectedCue()) {
  if (!c) {
    const g = app.gapAt(app.t);
    return g ? { ok: true, after: g.after, lo: g.lo, hi: g.hi } : { ok: false, why: '播放頭所在的地方沒有 ≥ 0.5 秒的空檔（新增字幕只能放在兩句之間的空檔）' };
  }
  const after = where === 'after' ? c.n : c.n - 1;
  const g = canInsert(app.cues, after, app.dur);
  return g.ok ? { ok: true, after, lo: g.lo, hi: g.hi } : { ok: false, why: g.why };
}
function insertCue(where = 'after', c = selectedCue(), at = null) {
  const info = at != null ? (() => { const g = app.gapAt(at); return g ? { ok: true, ...g } : { ok: false, why: '這裡沒有 ≥ 0.5 秒的空檔' }; })() : insertInfo(where, c);
  if (!info.ok) { toast(info.why, 'warn', 4000); return; }
  const margin = info.hi - info.lo >= 0.8 ? 0.05 : 0;
  let start = info.lo + margin;
  if (at != null && at - 0.2 > start && at + RULES.minCue < info.hi) start = at - 0.2;
  const end = Math.min(info.hi - margin, start + 3);
  if (doSrtOp({ op: 'insert', after: info.after, start: r3(start), end: r3(end), text: '新字幕' })) {
    const n = info.after + 1;
    app.select({ kind: 'cue', id: n }, { lane: 'cap' });
    app.seek(start + 0.01);
    setTimeout(() => openCapEditor(n), 30);
  }
}
let pendingDelete = null;
function deleteCue(c = selectedCue()) {
  if (!c) { toast('先點一句字幕', 'warn'); return; }
  if (app.cues.length <= 1) { toast('只剩一句字幕，不能刪', 'warn'); return; }
  const refs = refsTo({ scenes: app.scenes }, c.n);
  if (!refs.length) { finishDelete(c, 'next'); return; }
  const k = app.cues.findIndex((q) => q.n === c.n);
  pendingDelete = c;
  $('#delTitle').textContent = `刪除第 ${c.n} 句字幕`;
  $('#delMsg').innerHTML = `「${esc(c.text)}」有 plan.json 的時間綁著。刪掉之前，這些時間要改綁到前一句或後一句（不能留下對不到的句號）：`;
  $('#delRefs').innerHTML = refs.map((r) => `<li>· <b>${esc(r.id)}</b>（${esc(r.ref)}）</li>`).join('');
  const prev = app.cues[k - 1], next = app.cues[k + 1];
  $('#delPrev').disabled = !prev; $('#delNext').disabled = !next;
  $('#delPrev').textContent = prev ? `改綁到前一句（#${prev.n}「${prev.text.slice(0, 10)}…」），再刪除` : '沒有前一句';
  $('#delNext').textContent = next ? `改綁到後一句（#${next.n}「${next.text.slice(0, 10)}…」），再刪除` : '沒有後一句';
  $('#dlgDelete').showModal();
}
function finishDelete(c, bind) {
  const k = app.cues.findIndex((q) => q.n === c.n);
  if (doSrtOp({ op: 'delete', n: c.n, bind })) {
    const nx = app.cues[Math.min(k, app.cues.length - 1)];
    app.select(nx ? { kind: 'cue', id: nx.n } : null, { lane: 'cap' });
    toast(`已刪除第 ${c.n} 句，後面的句號都 −1（plan.json 已跟著改）`, 'ok', 3500);
  }
}
function setCue(n, patch, { coalesce = null } = {}) {
  const c = app.cues.find((q) => q.n === n);
  if (!c) return false;
  const op = { op: 'set', n, ...patch };
  const r = applyCueOp(app.cues, op, { videoDur: app.dur });
  if (r.error) { toast(r.error, 'err', 4000); return false; }
  return mutate(() => {
    const before = { scenes: app.scenes };
    const fx = fixAnchors(before, before, app.cues, r.cues);
    app.scenes = fx.plan.scenes;
    app.cues = r.cues;
    pushSrtOp(op);
  }, { coalesce });
}
// 時間軸上直接改字
function openCapEditor(n) {
  const c = app.cues.find((q) => q.n === n);
  if (!c) return;
  if (app.trackLocked('cap')) { toast('字幕軌已鎖定', 'warn'); return; }
  timeline.ensureVisible(c.start, false);
  timeline.draw();
  const ed = $('#capEditor');
  const xa = Math.max(0, timeline.xOf(c.start)), xb = Math.min(timeline.cssW, timeline.xOf(c.end));
  ed.style.left = `${xa}px`; ed.style.top = `${timeline.L.cap[0] + 3}px`;
  ed.style.width = `${Math.max(220, xb - xa)}px`;
  ed.value = c.text; ed.dataset.n = String(n); ed.hidden = false;
  ed.focus(); ed.select();
}
function closeCapEditor(commit) {
  const ed = $('#capEditor');
  if (ed.hidden) return;
  ed.hidden = true;
  const n = Number(ed.dataset.n);
  const c = app.cues.find((q) => q.n === n);
  if (commit && c && ed.value.trim() && ed.value.trim() !== c.text) { setCue(n, { text: ed.value }); renderInspector(); }
  else if (commit && !ed.value.trim()) toast('字幕不能是空的；不要這句請按 Delete 刪除', 'warn');
}

// ---------- 段落欄位 ----------
function setSeg(id, patch, opts = {}) {
  return mutate(() => {
    const i = app.scenes.findIndex((s) => isObj(s) && s.id === id);
    if (i < 0) return false;
    const o = { ...app.scenes[i] };
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete o[k]; else o[k] = v; }
    app.scenes = app.scenes.slice(); app.scenes[i] = o;
  }, opts);
}
function toggleSfxMute(segId) {
  const sc = sceneById(segId);
  if (!sc) return;
  if (sc.sfx === null) {
    const sb = savedSceneById(segId);
    const mem = app.sfxMemory[segId];
    // 還原：存檔前靜音的照原值還原；存檔後靜音的照伺服器記住的值（沒記到就拿掉 sfx＝情境預設音效）
    const orig = sb && sb.sfx !== null ? (('sfx' in sb) ? sb.sfx : undefined) : mem?.had ? mem.value : undefined;
    setSeg(segId, { sfx: orig }, { inspector: true });
    toast(`${segId} 的音效已取消靜音`, 'ok', 1800);
  } else { setSeg(segId, { sfx: null }, { inspector: true }); toast(`${segId} 的音效已靜音（Delete／雙擊可以切換）`, 'ok', 1800); }
}

// ---------- 播放 ----------
const engine = () => (app.mode === 'player' ? player : sim);
app.seek = (t) => {
  app.t = clamp(t, 0, app.dur || t);
  engine().seek(app.t);
  if (!app.selection) refreshFaces();
  app.stopAt = null;
  renderTimes();
  app.requestDraw();
};
function stopShuttle() { if (app.shuttle) { clearInterval(app.shuttle); app.shuttle = null; } app.rate = 0; sim.v.playbackRate = 1; renderRate(); }
function togglePlay() {
  const e = engine();
  stopShuttle();
  if (e.playing) e.pause(); else { app.stopAt = null; e.play(); }
}
function playFrom(t, stopAt = null) { stopShuttle(); app.seek(Math.max(0, t)); engine().play(); app.stopAt = stopAt; }
function step(d) { stopShuttle(); engine().pause(); app.seek(app.t + d); }
function shuttle(dir) {
  const e = engine();
  if (dir > 0) {
    if (app.shuttle) { clearInterval(app.shuttle); app.shuttle = null; }
    app.rate = app.rate > 0 ? Math.min(4, app.rate * 2) : 1;
    if (app.mode === 'sim') sim.v.playbackRate = app.rate;
    if (!e.playing) e.play();
  } else {
    e.pause();
    app.rate = app.rate < 0 ? Math.max(-4, app.rate * 2) : -1;
    if (!app.shuttle) app.shuttle = setInterval(() => { const nt = app.t + app.rate / 30; if (nt <= 0) { app.seek(0); stopShuttle(); } else app.seek(nt); }, 1000 / 30);
  }
  renderRate();
}
function renderRate() { const el = $('#rate'); el.hidden = !app.rate || app.rate === 1; el.textContent = `${app.rate > 0 ? '▶' : '◀'} ${Math.abs(app.rate)}×`; }
function editPoints() {
  const s = new Set([0, app.dur, ...app.points.map((p) => p.at), ...app.edit.cuts.flat(), ...app.splits, ...app.itemsView.flatMap((it) => [it.start, it.end])].map(r3));
  return [...s].sort((a, b) => a - b);
}
function jumpPoint(dir) {
  const pts = editPoints();
  const t = dir > 0 ? pts.find((x) => x > app.t + 0.01) : [...pts].reverse().find((x) => x < app.t - 0.01);
  if (t != null) { step(0); app.seek(t); timeline.ensureVisible(t); }
}
app.onEnded = () => renderPlay();
app.onVideoError = (m) => { $('#stageEmpty').hidden = false; $('#stageEmpty').innerHTML = `<div><b>播不了影片</b>${esc(m)}</div>`; };
app.onPlayerReady = () => { renderMode(); if (app.pendingFocus != null) { player.seek(app.pendingFocus); app.t = app.pendingFocus; app.pendingFocus = null; } };
app.onPlayerError = (m) => {
  toast(`成片預覽出錯：${m}`, 'err', 6000);
  banner(`成片預覽（HyperFrames 播放器）出錯：${esc(m)}。可以先用「即時模擬」，或請 AI 用 Studio 檢查。`, 'error', [['改用即時模擬', () => { banner(''); setMode('sim'); }]]);
};

// 音量表
let meterPeak = -120, meterHold = -120, holdT = 0, clipT = 0, clipCount = 0, clipToastT = 0;
function drawMeter() {
  const cv = $('#meterCanvas');
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height;
  const db = engine().peakDb?.() ?? null;
  const now = performance.now();
  meterPeak = db == null ? Math.max(-120, meterPeak - 2) : Math.max(db, meterPeak - 1.2);
  if (meterPeak > meterHold || now - holdT > 1200) { meterHold = meterPeak; holdT = now; }
  if (db != null && db > 0) { clipT = now; clipCount++; }
  $('#meterClip').classList.toggle('on', now - clipT < 1500);
  if (db != null && db > 0 && clipCount > 6 && now - clipToastT > 8000) { clipToastT = now; clipCount = 0; toast('音量超過 0 dB，成片會爆音 → 把人聲或音效調小一點（點時間軸空白處看「整支影片」的音量）', 'warn', 5000); }
  const y = (d) => H - 4 - (clamp(d, -48, 6) + 48) / 54 * (H - 8);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#0B1020'; g.fillRect(0, 0, W, H);
  const top = y(meterPeak);
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, '#2FB36B'); grad.addColorStop(0.68, '#4ADE9B'); grad.addColorStop(0.8, '#FFD400'); grad.addColorStop(0.89, '#FF8A3D'); grad.addColorStop(0.9, '#FF5A5F'); grad.addColorStop(1, '#FF5A5F');
  g.fillStyle = grad; g.fillRect(6, top, W - 12, H - 4 - top);
  g.fillStyle = meterHold > 0 ? '#FF5A5F' : '#fff'; g.fillRect(6, y(meterHold) - 1, W - 12, 2);
  g.font = '700 9px system-ui'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const d of [0, -6, -18]) { g.fillStyle = d === 0 ? '#FF5A5F' : 'rgba(255,255,255,0.55)'; g.fillRect(0, y(d), 5, 1); g.fillRect(W - 5, y(d), 5, 1); g.fillText(String(d), W - 1, y(d) - 6); }
}

let lastShown = '';
function frame() {
  const e = engine();
  e.tick();
  const t = e.time;
  if (Number.isFinite(t) && Math.abs(t - app.t) > 1e-4 && !app.shuttle) { app.t = t; app.drawRequested = true; }
  if (app.stopAt != null && e.playing && app.t >= app.stopAt) { e.pause(); app.stopAt = null; }
  if (e.playing && $('#follow').checked) timeline.ensureVisible(app.t);
  const shown = `${app.t.toFixed(3)}|${e.playing}`;
  if (shown !== lastShown) { lastShown = shown; renderTimes(); renderPlay(); }
  if (app.drawRequested) { app.drawRequested = false; timeline.draw(); }
  drawMeter();
  requestAnimationFrame(frame);
}

async function setMode(m, { focus = null } = {}) {
  if (m === app.mode && focus == null) return;
  const pv = app.server?.preview;
  if (m === 'player') {
    if (!pv?.player?.available) { toast(pv?.player?.reason || '成片預覽不能用', 'warn', 6000); return; }
    if (!pv.built) { toast('還沒有成片可以預覽 → 先按「重新產生」', 'warn', 5000); return; }
    stopShuttle();
    sim.pause(); sim.hide(true);
    $('#playerHost').hidden = false;
    app.mode = 'player';
    renderMode();
    try {
      app.pendingFocus = focus;
      await player.mount(`${pv.composition}?v=${Math.floor(pv.builtMtime || 0)}`);
      player.seek(focus ?? app.t);
    } catch (err) {
      toast(`成片預覽載入失敗：${err.message}，改用即時模擬`, 'err', 6000);
      return setMode('sim');
    }
  } else {
    player.pause(); player.unmount();
    $('#playerHost').hidden = true;
    sim.hide(false);
    app.mode = 'sim';
    sim.seek(app.t);
    renderMode();
  }
}

// ---------- 載入 ----------
async function loadState({ keep = null } = {}) {
  const r = await api('GET', '/api/state');
  if (!r.ok || !r.data) {
    setSaveState('error', '連不到剪輯');
    $('#stageEmpty').hidden = false;
    $('#stageEmpty').innerHTML = `<div><b>連不到剪輯</b>${esc(r.data?.message || '')}</div>`;
    return false;
  }
  const s = r.data;
  const prevVideo = app.server?.video?.url;
  app.server = s;
  app.base = { mtime: s.plan.mtime, hash: s.plan.hash, srtHash: s.srt?.hash ?? null };
  app.fps = s.video?.fps || 30;
  app.dur = s.video?.dur || 0;
  app.plan0 = s.plan.data || { scenes: [] };
  app.cues0 = s.captions || [];
  app.cutpoints = s.cutpoints || [];
  app.sfxMemory = s.sfxMemory || {};
  app.savedEdit = normEdit(s.edit);
  app.edit = clone(app.savedEdit);
  app.savedLook = normLook(app.plan0.look);
  app.look = clone(app.savedLook);
  app.savedTheme = normTheme(app.plan0.theme);
  app.theme = app.savedTheme;
  app.scenes = clone(Array.isArray(app.plan0.scenes) ? app.plan0.scenes : []);
  app.cues = clone(app.cues0);
  app.srtOps = [];
  app.savedSnap = dirtySnap();
  if (keep) {
    // 保留使用者的調整：edit 整個沿用；字幕操作在字幕沒被改過時重播；段落欄位照 id 套回去
    app.edit = normEdit(keep.edit);
    if ('look' in keep) app.look = keep.look;
    if ('theme' in keep) app.theme = keep.theme;
    if (keep.ops?.length && keep.srtHash === app.base.srtHash) {
      const rr = replay(app.cues0, { scenes: app.scenes }, keep.ops, { videoDur: app.dur });
      if (!rr.errors.length) { app.cues = rr.cues; app.scenes = rr.plan.scenes; app.srtOps = keep.ops; } else toast(`字幕的修改套不上最新的檔案，已放棄：${rr.errors[0]}`, 'warn', 6000);
    } else if (keep.ops?.length) toast('字幕檔被改過，你還沒存的字幕修改已放棄（要重做）', 'warn', 6000);
    for (const [id, patch] of Object.entries(keep.segs || {})) {
      const i = app.scenes.findIndex((x) => isObj(x) && x.id === id);
      if (i < 0) continue;
      const o = { ...app.scenes[i] };
      for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete o[k]; else o[k] = v; }
      app.scenes[i] = o;
    }
  } else { app.undoStack = []; app.redoStack = []; app.splits = []; }
  document.title = `剪輯｜${s.project.name}`;
  $('#projName').textContent = `${s.project.dir}　·　${s.plan.file.split('/').slice(-3).join('/')}`;
  $('#studioCmd').textContent = s.commands.studio;
  if (s.video) {
    $('#stageEmpty').hidden = true;
    sim.load(s.video.url);
    if (prevVideo && prevVideo !== s.video.url) { app.peaks = null; sim.resetMedia(); app.thumbs = {}; }
  } else {
    $('#stageEmpty').hidden = false;
    $('#stageEmpty').innerHTML = `<div><b>還沒有影片可以剪</b>${esc(s.videoError || '')}</div>`;
  }
  if (!s.plan.exists) banner(`找不到 <code>${esc(s.plan.file)}</code>：剪輯存檔會寫進它 → 請 AI 先完成分鏡、寫好 plan.json，再重新整理這一頁。現在可以先看影片，但不能儲存。`, 'error');
  else if (s.plan.error) banner(`${esc(s.plan.error)} → 請 AI 修好 plan.json 再重新整理。`, 'error');
  else if (s.schema?.error) banner(esc(s.schema.error), '');
  else if (!keep) banner('');
  timeline.setDuration(app.dur);
  applyCanvas();
  renderOverlays();
  if (s.report.ready) applyReport(s.report); else { app.itemsHint = '檢查中…（第一次可能要幾秒）'; fetchReport(); }
  changed({ inspector: true });
  renderMode();
  // 修改單：第一次載入讀這個專案存在瀏覽器的清單與開關；之後重新載入（AI 改了 plan.json）只重畫
  if (!rqLoaded) { rqLoaded = true; rqLoad(); let o = false; try { o = localStorage.getItem('editor-requests-open') === '1'; } catch { /* 預設收起 */ } setRequestsOpen(o); }
  else renderRequests();
  if (!app.peaks) fetchPeaks();
  loadThumbs();
  sim.preloadSfx?.(s.schema?.sounds || []);
  return true;
}
async function fetchReport(fresh = false) {
  const r = await api('GET', `/api/report${fresh ? '?fresh=1' : ''}`);
  if (r.ok && r.data) { applyReport(r.data); changed({ inspector: true }); }
}
async function fetchPeaks() {
  app.peaksHint = '波形計算中…';
  const r = await api('GET', '/api/waveform');
  if (r.ok && r.data) { app.peaks = r.data.peaks?.length ? r.data : null; app.peaksHint = r.data.error ? `沒有波形：${r.data.error}` : '這支影片沒有聲音'; }
  else app.peaksHint = '波形讀取失敗';
  app.peakMax = null;
  renderHeads();
  timeline.invalidate();
}
async function loadThumbs() {
  const want = ['main', ...(app.server?.media || []).filter((m) => m.url).map((m) => m.id)];
  for (const id of want) {
    if (app.thumbs[id]?.img) continue;
    const m = id === 'main' ? null : app.mediaSeg(id);
    if (m?.kind === 'image') {
      const img = new Image();
      img.onload = () => { app.thumbs[id] = { img }; timeline.invalidate(); };
      img.src = m.url;
      continue;
    }
    pollThumb(id, 0);
  }
}
async function pollThumb(id, n) {
  const r = await api('GET', `/api/thumbs?src=${encodeURIComponent(id)}`);
  if (!r.ok || !r.data || r.data.error) return;
  if (r.data.pending) { if (n < 120) setTimeout(() => pollThumb(id, n + 1), 1000); return; }
  const img = new Image();
  img.onload = () => { app.thumbs[id] = { img, meta: r.data }; timeline.invalidate(); };
  img.src = r.data.url;
}
function applyReport(rep) {
  app.report = rep;
  app.saveErrors = null;
  const d = rep?.data;
  app.reportReady = !!d;
  app.items = (d?.items || rep?.fallback?.items || []).filter((it) => Number.isFinite(it.start) && Number.isFinite(it.end))
    .map((it) => ({ id: it.id, type: it.type || 'scene', label: it.label || '', start: it.start, end: it.end, shownEnd: Number.isFinite(it.shownEnd) ? it.shownEnd : null, src: it.src || null, warnings: it.warnings || 0, sfx: Array.isArray(it.sfx) ? it.sfx : [] }));
  app.voiceOnly = Array.isArray(d?.voiceOnly) ? d.voiceOnly.filter((v) => Array.isArray(v) && v.length === 2) : [];
  // 002 的 check-json：voiceUncovered＝只有聲音、沒被蓋住（紅色斜線）；uncovered＝沒有任何卡片或素材的口播（灰色斜線）
  const spans = (arr) => (Array.isArray(arr) ? arr.filter((v) => Number.isFinite(v?.start) && Number.isFinite(v?.end) && v.end > v.start).map((v) => [v.start, v.end, v.level || null]) : []);
  app.voiceUncovered = spans(d?.voiceUncovered);
  app.uncovered = spans(d?.uncovered);
  if (Array.isArray(d?.cutpoints) && d.cutpoints.length) app.cutpoints = d.cutpoints.filter((c) => Number.isFinite(c?.at)).map((c) => ({ at: c.at, kind: c.kind === 'ng' ? 'ng' : 'pause' }));
  if (!app.dur && d?.videoDur) { app.dur = d.videoDur; timeline.setDuration(app.dur); }
  app.itemsHint = d || rep?.fallback ? 'plan.json 裡還沒有資訊卡或字卡動態' : '看不到段落位置：檢查報告讀不到（點左下角的檢查結果）';
  renderCheck();
}

// ---------- 儲存與重新產生 ----------
function setSaveState(state, text) { const el = $('#saveState'); el.dataset.state = state; el.querySelector('.txt').textContent = text; }
function renderHeader() {
  const canSave = !!app.server?.plan?.exists && !app.server?.plan?.error;
  const dirty = isDirty();
  $('#btnSave').disabled = !canSave || !dirty || app.busy;
  $('#btnUndo').disabled = !app.undoStack.length;
  $('#btnRedo').disabled = !app.redoStack.length;
  $('#btnBuild').disabled = app.busy || app.building || !canSave;
  if (app.busy || !app.server) return;
  if (!canSave) setSaveState('error', app.server.plan.exists ? 'plan.json 有錯' : '沒有 plan.json');
  else if (dirty) setSaveState('dirty', '有修改還沒儲存');
  else setSaveState('saved', '已儲存');
}
function editForSave() {
  const e = app.edit;
  return { cuts: e.cuts.map(([a, b]) => [r3(a), r3(b)]), fadeIn: e.fadeIn, fadeOut: e.fadeOut, volume: { ...e.volume }, gains: e.gains.map((g) => ({ ...g })), joins: e.joins.map((j) => ({ ...j })) };
}
// 跟「存檔時的 plan.json＋目前的字幕操作」比，哪些段落欄位改了
function segmentDiff() {
  const base = app.srtOps.length ? replay(app.cues0, { scenes: app.plan0.scenes || [] }, app.srtOps, { videoDur: app.dur }).plan.scenes : app.plan0.scenes || [];
  const out = {}, raw = {};
  app.scenes.forEach((sc, i) => {
    if (!isObj(sc) || !sc.id) return;
    const b = base[i] || {};
    const type = segType(sc);
    const keys = [...SEG_KEYS.common, ...(type === 'media' ? SEG_KEYS.media : []), ...(type === 'scene' ? SEG_KEYS.scene : []), ...(type === 'fx' ? SEG_KEYS.fx : [])];
    const d = {}, rd = {};
    for (const k of keys) {
      if (same(sc[k], b[k])) continue;
      rd[k] = sc[k];
      if (k === 'sfx') d.sfx = sc.sfx === null ? null : { restore: true };
      else if (sc[k] === undefined) { if (k === 'sfxVolume' || k === 'anchor') d[k] = null; }
      else d[k] = sc[k];
    }
    if (Object.keys(d).length) out[sc.id] = d;
    if (Object.keys(rd).length) raw[sc.id] = rd;
  });
  return { segments: out, raw };
}
async function save({ auto = false } = {}) {
  if (app.busy) return false;
  if (!app.server?.plan?.exists || app.server.plan.error) { toast('plan.json 不存在或有錯，沒辦法存', 'err'); return false; }
  closeCapEditor(true);
  const { segments } = segmentDiff();
  const textChanged = Object.entries(segments).filter(([, d]) => 'slots' in d || 'vars' in d).map(([id]) => id);
  const body = { base: { ...app.base }, edit: editForSave() };
  if (Object.keys(segments).length) body.segments = segments;
  if (app.srtOps.length) body.srt = { ops: app.srtOps };
  if (!same(app.look, app.savedLook)) body.look = app.look ? { color: r2(app.look.color), slim: r2(app.look.slim), ...(app.look.beauty > 0 ? { beauty: r2(app.look.beauty) } : {}) } : null;   // 美顏 0＝關，不寫
  if (app.theme !== app.savedTheme) body.theme = app.theme;
  app.busy = true;
  setSaveState('busy', '儲存中…');
  renderHeader();
  const tt = toast('儲存中…', 'ok', 0, { busy: true });
  const r = await api('POST', '/api/save', body);
  tt.close();
  app.busy = false;
  if (r.status === 409) {
    renderHeader();
    setSaveState('error', r.data?.file === 'srt' ? '字幕檔被改過' : 'plan.json 被改過');
    $('#conflictMsg').textContent = r.data?.message || '檔案被改過了';
    app.conflictFile = r.data?.file;
    $('#dlgConflict').showModal();
    return false;
  }
  if (!r.ok) {
    renderHeader();
    setSaveState('error', '沒有存成功');
    app.saveErrors = r.data?.errors || [r.data?.message || `儲存失敗（${r.status}）`];
    renderCheck(); openIssues();
    toast('沒有存成功，原因在左下角的檢查清單', 'err', 5000);
    return false;
  }
  const d = r.data;
  app.base = { mtime: d.plan.mtime, hash: d.plan.hash, srtHash: d.srt?.hash ?? null };
  Object.assign(app.server.plan, { mtime: d.plan.mtime, hash: d.plan.hash, data: d.plan.data });
  app.server.srt = { ...app.server.srt, ...d.srt };
  app.plan0 = d.plan.data;
  app.cues0 = d.captions || [];
  app.sfxMemory = d.sfxMemory || {};
  app.savedEdit = normEdit(d.edit || body.edit);
  app.edit = clone(app.savedEdit);
  app.savedLook = normLook(app.plan0.look);
  app.look = clone(app.savedLook);
  app.savedTheme = normTheme(app.plan0.theme);
  app.theme = app.savedTheme;
  if (d.look) app.server.look = d.look;
  app.scenes = clone(app.plan0.scenes || []);
  app.cues = clone(app.cues0);
  app.srtOps = [];
  app.savedSnap = dirtySnap();
  app.undoStack = []; app.redoStack = [];
  if (app.selection?.kind === 'cue' && !app.cues.some((c) => c.n === app.selection.id)) app.selection = null;
  if (app.server.preview.built) app.server.preview.stale = true;
  if (d.report) applyReport(d.report);
  changed({ inspector: true });
  renderMode();
  const errs = d.report?.issues?.errors?.length || 0;
  const what = [d.wrote?.plan && 'plan.json', d.wrote?.srt && '字幕'].filter(Boolean).join('、') || 'plan.json';
  toast(errs ? `已存到 ${what}，但檢查有 ${errs} 個錯誤（點左下角看）` : `已存到 ${what}`, errs ? 'warn' : 'ok', errs ? 5000 : 2600);
  if (textChanged.length && !auto && !errs) {
    const id = textChanged[0];
    const it = app.itemsView.find((x) => x.id === id);
    toast('卡片文字改了：自動重新產生，好了會切到成片預覽', 'ok', 3000);
    runBuild({ focus: it ? it.start + 0.4 : null, focusId: id, audit: textChanged });
  }
  return true;
}
async function runBuild({ focus = null, focusId = null, audit = [] } = {}) {
  if (app.busy || app.building) return;
  if (isDirty() && !(await save({ auto: true }))) return;
  app.building = true;
  renderHeader();
  const t0 = performance.now();
  const tt = toast('重新產生中…', 'ok', 0, { busy: true });
  const poll = setInterval(async () => {
    const s = await api('GET', '/api/build');
    const last = String(s.data?.log || '').trim().split('\n').pop() || '';
    tt.set(`重新產生中…（${Math.round((performance.now() - t0) / 1000)} 秒）${last ? `　${last.slice(0, 40)}` : ''}`);
  }, 800);
  const r = await api('POST', '/api/build', audit.length ? { audit } : {});
  clearInterval(poll);
  tt.close();
  app.building = false;
  const d = r.data || {};
  app.auditIssues = d.audit || null;
  const iss = d.issues || { errors: [], warnings: [] };
  $('#logText').textContent = d.log || d.message || '';
  $('#logIssues').innerHTML = issueItems(iss.errors, iss.warnings, 30);
  await loadState({ keep: isDirty() ? keepState() : null });
  if (r.ok && d.ok) {
    $('#logTitle').textContent = '✓ 重新產生好了'; $('#logSub').textContent = `花了 ${Math.round(d.seconds || 0)} 秒。`; $('#logWrap').open = false;
    const au = d.audit;
    if (au?.errors.length) { renderCheck(); openIssues(); toast(`重新產生好了，但 ${au.ids.join('、')} 改字後版面有 ${au.errors.length} 個錯誤（左下角檢查清單）：改短或改回原本的字`, 'err', 8000); }
    else toast(`重新產生好了（${Math.round(d.seconds || 0)} 秒）${au ? `，${au.ids.join('、')} 版面${au.warnings.length ? `有 ${au.warnings.length} 個提醒` : '沒問題'}` : ''}${focusId ? `，切到成片預覽看 ${focusId}` : ''}`, 'ok', 3500, { actions: [['訊息', () => $('#dlgLog').showModal()]] });
    if (focus != null) {
      if (app.server.preview.player.available) { await setMode('player', { focus }); app.seek(focus); if (focusId) app.select({ kind: segType(sceneById(focusId)) === 'media' ? 'media' : 'item', id: focusId }); }
      else toast('找不到 HyperFrames 播放器，沒辦法切到成片預覽（只能用即時模擬）', 'warn', 5000);
    } else if (app.mode === 'player' && app.server.preview.built) {
      try { await player.mount(`${app.server.preview.composition}?v=${Math.floor(app.server.preview.builtMtime || 0)}`); player.seek(app.t); } catch { setMode('sim'); }
    }
  } else {
    $('#logTitle').textContent = '✖ 沒有產生成功'; $('#logSub').textContent = d.message || '照下面的訊息修改（看不懂就整段貼給 AI）。'; $('#logWrap').open = true;
    toast('重新產生失敗', 'err', 8000, { actions: [['看訊息', () => $('#dlgLog').showModal()]] });
  }
  renderHeader();
}
function keepState() {
  const { raw } = segmentDiff();
  return { edit: clone(app.edit), segs: raw, ops: clone(app.srtOps), srtHash: app.base?.srtHash ?? null,
    ...(!same(app.look, app.savedLook) ? { look: clone(app.look) } : {}),
    ...(app.theme !== app.savedTheme ? { theme: app.theme } : {}) };
}

// 外部改了 plan.json／rough.srt（通常是 AI）
async function pollVersion() {
  if (app.busy || app.building || app.pollingVersion || !app.server) return;
  app.pollingVersion = true;
  try {
    const r = await api('GET', '/api/version');
    if (!r.ok || !r.data) { setSaveState('error', '連不到剪輯'); return; }
    const v = r.data;
    const pv = app.server.preview;
    const rebuilt = v.built && pv.builtMtime !== v.builtMtime;
    if (pv.built !== v.built || pv.stale !== v.stale || pv.builtMtime !== v.builtMtime) { pv.built = v.built; pv.stale = v.stale; pv.builtMtime = v.builtMtime; renderMode(); }
    if (JSON.stringify(v.requests ?? null) !== JSON.stringify(app.server.requests ?? null)) { app.server.requests = v.requests ?? null; renderRequests(); }
    const changedOut = (v.plan.hash && app.base && v.plan.hash !== app.base.hash) || ((v.srt?.hash ?? null) !== (app.base?.srtHash ?? null));
    const framing = v.framingUpdate;
    const fromFraming = framing?.hash === v.plan.hash && (v.srt?.hash ?? null) === (app.base?.srtHash ?? null);
    const key = `${v.plan.hash}|${v.srt?.hash}`;
    if (changedOut && !$('#dlgConflict').open && app.noticed !== key) {
      if (fromFraming) { await loadState({ keep: isDirty() ? keepState() : null }); toast('已套用構圖設定', 'ok', 2600); }
      else if (!isDirty()) { await loadState(); toast('plan.json／字幕有更新（可能是 AI 改的），已重新載入', 'ok', 4500); }
      else {
        banner('plan.json 或字幕剛被改過（可能是 AI 改的），而你有還沒存的調整。', 'error', [
          ['重新載入，保留我的調整', async () => { banner(''); await loadState({ keep: keepState() }); toast('已載入最新的檔案，你的調整還在，記得再按一次儲存', 'warn', 5000); }, 'small primary'],
          ['重新載入，放棄我的調整', async () => { banner(''); await loadState(); }, 'small'],
        ]);
        app.noticed = key;
      }
    }
    if (framing?.running && !app.framingToast) app.framingToast = toast('構圖已儲存，正在更新預覽…', 'ok', 0, { busy: true });
    if (framing && !framing.running) {
      app.framingToast?.close(); app.framingToast = null;
      if (framing.finishedAt && app.framingFinished !== framing.finishedAt) {
        app.framingFinished = framing.finishedAt;
        toast(framing.ok ? '構圖已套用，預覽已更新' : framing.message || '構圖已儲存，但預覽更新失敗，請按「重新產生」查看訊息', framing.ok ? 'ok' : 'err', 6000);
      }
    }
    if (rebuilt && (!changedOut || fromFraming || !isDirty())) {
      await loadState({ keep: isDirty() ? keepState() : null });
      if (app.mode === 'player') {
        try { await player.mount(`${app.server.preview.composition}?v=${Math.floor(app.server.preview.builtMtime || 0)}`); player.seek(app.t); }
        catch { setMode('sim'); }
      } else sim.seek(app.t);
    }
  } finally { app.pollingVersion = false; }
}

// ---------- 畫面：時間、狀態列、軌頭 ----------
function renderTimes() {
  if (document.activeElement !== $('#tcInput')) $('#tc').textContent = fmtTC(app.t);
  $('#tcDur').textContent = fmtTC(app.dur);
  $('#tcOut').textContent = cutIndexAt(app.t, app.edit.cuts) >= 0 ? '（剪掉）' : fmtTC(outOf(app.t, app.edit.cuts));
  $('#tcOutDur').textContent = fmtTC(app.outDur);
}
function renderPlay() { const p = engine().playing || !!app.shuttle; const b = $('#btnPlay'); b.textContent = p ? '❚❚' : '▶'; b.setAttribute('aria-label', p ? '暫停' : '播放'); }
function renderStatus() {
  const rep = app.report;
  const au = app.saveErrors ? null : app.auditIssues;
  const errs = app.saveErrors ? app.saveErrors.length : (rep?.issues?.errors?.length || 0) + (au?.errors.length || 0);
  const warns = app.saveErrors ? 0 : (rep?.issues?.warnings?.length || 0) + (au?.warnings.length || 0);
  $('#stIssues .e').textContent = `✖ ${errs}`; $('#stIssues .e').classList.toggle('has', !!errs);
  $('#stIssues .w').textContent = `⚠ ${warns}`; $('#stIssues .w').classList.toggle('has', !!warns);
  const vu = app.voiceUncovered.length;
  $('#stHint').textContent = vu ? `⚠ ${vu} 段只有聲音、沒被素材蓋住（主軌紅色斜線）` : '';
  $('#stOut').textContent = `成片 ${fmt(app.outDur, 1)}${app.edit.cuts.length ? `（剪掉 ${fmtSec(cutTotal(app.edit.cuts))}）` : ''}`;
  $('#stZoom').textContent = `縮放 ${timeline.zoomPct()}%　吸附${app.snapOn ? '開' : '關'}`;
  const s = app.selection;
  $('#stSel').textContent = s ? `已選：${selLabel(s)}` : '';
}
function selLabel(s) {
  switch (s.kind) {
    case 'cue': return `字幕 #${s.id}`;
    case 'item': case 'media': return s.id;
    case 'cut': return '剪掉的範圍';
    case 'piece': return '主軌片段';
    case 'range': return `範圍 ${fmtSec(app.sel.b - app.sel.a)}`;
    case 'join': return '剪接點';
    case 'gain': return '人聲範圍音量';
    case 'sfx': return `${s.id} 的音效`;
    default: return '';
  }
}
function voicePeakMax() {
  if (app.peakMax != null && app.peakMaxVer === app.ver) return app.peakMax;
  const P = app.peaks;
  let m = -Infinity;
  if (P?.peaks?.length) {
    const sc = P.scale || 1000;
    for (let i = 0; i < P.peaks.length; i++) {
      const t = i / P.rate;
      if (!P.peaks[i] || cutIndexAt(t, app.edit.cuts) >= 0) continue;
      const db = 20 * Math.log10(P.peaks[i] / sc) + app.edit.volume.voice + gainAt(t, app.edit.gains);
      if (db > m) m = db;
    }
  }
  app.peakMax = Number.isFinite(m) ? m : null; app.peakMaxVer = app.ver;
  return app.peakMax;
}
function renderHeads() {
  const el = $('#tlHeads');
  if (!el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = LANES.map(([k, h], i) => {
      const hh = h + 1;
      if (k === 'ov' || k === 'ruler') return `<div class="th" style="height:${hh}px" data-lane="${k}">${k === 'ruler' ? '<span class="nm"><small>時間</small></span>' : ''}</div>`;
      const vol = ['media', 'voice', 'sfx'].includes(k);
      return `<div class="th" style="height:${hh}px" data-lane="${k}">
        <span class="nm">${TRACK_NAMES[k]}<small data-sub></small></span>
        ${k === 'voice' ? '<span class="warnico" data-clipwarn hidden data-tip="">!</span>' : ''}
        ${vol ? `<input class="db" type="number" step="0.5" min="-60" max="12" data-db="${k}" aria-label="${TRACK_NAMES[k]}音量（dB）" data-tip="${TRACK_NAMES[k]}整條軌的音量（dB），−60＝靜音">
        <button class="mute" data-mute="${k}" data-tip="靜音（M）：這條軌整條不出聲，成片也一樣">M</button>` : ''}
        ${k !== 'anim' ? `<button class="lock" data-lock="${k}" data-tip="鎖定：避免不小心拖到這條軌">🔒</button>` : ''}
      </div>`;
    }).join('');
  }
  for (const k of ['media', 'voice', 'sfx']) {
    const inp = el.querySelector(`[data-db="${k}"]`);
    if (document.activeElement !== inp) inp.value = String(app.edit.volume[k]);
    el.querySelector(`[data-mute="${k}"]`).classList.toggle('on', app.trackMuted(k));
  }
  for (const b of el.querySelectorAll('[data-lock]')) b.classList.toggle('on', app.trackLocked(b.dataset.lock));
  for (const th of el.querySelectorAll('.th')) th.classList.toggle('sel', th.dataset.lane === app.selLane);
  const capSub = el.querySelector('[data-lane="cap"] [data-sub]');
  if (capSub) capSub.textContent = app.cues.length ? ` ${app.cues.length} 句` : '';
  const pk = voicePeakMax();
  const warn = el.querySelector('[data-clipwarn]');
  if (warn) { warn.hidden = !(pk != null && pk > 0); warn.dataset.tip = pk != null && pk > 0 ? `可能爆音：人聲最大峰值 ${fmtDb(r2(pk))}（超過 0 dB）→ 把人聲往下調，或用「人聲標準化」` : ''; }
}
function renderCapButtons() {
  const c = selectedCue();
  const set = (id, st) => { const b = $(id); b.classList.toggle('is-disabled', !st.ok); b.dataset.why = st.ok ? '' : st.why; };
  set('#capAdd', insertInfo('after'));
  set('#capSplit', capSplitInfo());
  set('#capMerge', c ? canMerge(app.cues, c.n) : { ok: false, why: '先點一句字幕' });
  set('#capDel', c ? (app.cues.length > 1 ? { ok: true } : { ok: false, why: '只剩一句字幕' }) : { ok: false, why: '先點一句字幕' });
}
// 預覽框照畫布：比例（CSS 變數 --cw／--ch）、字幕圖層的位置、即時模擬的講者小窗（直式是下半的講者面板）
function applyCanvas() {
  const c = app.canvas(), box = $('#stageBox');
  box.style.setProperty('--cw', String(c.W));
  box.style.setProperty('--ch', String(c.H));
  box.dataset.format = c.format;
  if (c.captionBottom != null) $('#simCaption').style.bottom = `${c.captionBottom}px`;
  if (Array.isArray(c.pip)) {
    const [x, y, w, h] = c.pip, pip = $('#simPip');
    Object.assign(pip.style, { left: `${(x / c.W) * 100}%`, top: `${(y / c.H) * 100}%`, width: `${(w / c.W) * 100}%`, height: `${(h / c.H) * 100}%` });
    if (pip.width !== w) pip.width = w;
    if (pip.height !== h) pip.height = h;
  }
  sim.fitCaps();
}
function renderOverlays() {
  const sb = app.plan0?.speakerBox, { W, H } = app.canvas();
  const ov = $('#ovSpeaker');
  if (Array.isArray(sb) && sb.length === 4) {
    const [x1, y1, x2, y2] = sb;
    Object.assign(ov.style, { left: `${(x1 / W) * 100}%`, top: `${(y1 / H) * 100}%`, width: `${((x2 - x1) / W) * 100}%`, height: `${((y2 - y1) / H) * 100}%` });
    $('#btnSpeaker').classList.remove('is-disabled');
  } else $('#btnSpeaker').classList.add('is-disabled');
  ov.hidden = !(app.showSpeaker && Array.isArray(sb));
  $('#ovSafe').hidden = !app.showSafe;
  $('#btnSafe').setAttribute('aria-pressed', String(!!app.showSafe));
  $('#btnSpeaker').setAttribute('aria-pressed', String(!!app.showSpeaker));
}
function issueItems(errors = [], warnings = [], limit = 300) {
  const one = (s, cls, sym) => {
    const id = (String(s).match(/^\[([A-Za-z_][\w]*)/) || [])[1];
    const i = s.indexOf('→');
    const body = i >= 0 ? `${esc(s.slice(0, i))}<span class="fix">→ ${esc(s.slice(i + 1).trim())}</span>` : esc(s);
    return `<li class="${cls}"${id ? ` data-id="${esc(id)}"` : ''}><span class="sym">${sym}</span>${body}</li>`;
  };
  const all = [...errors.map((s) => one(s, 'err', '✖')), ...warnings.map((s) => one(s, 'warn', '⚠'))];
  return all.slice(0, limit).join('') + (all.length > limit ? `<li>…還有 ${all.length - limit} 則</li>` : '');
}
function renderCheck() {
  const rep = app.report;
  const sum = $('#checkSummary'), list = $('#checkList');
  let errors = [], warnings = [];
  if (app.saveErrors) { errors = app.saveErrors; sum.innerHTML = '<b class="err-ink">沒有存成功</b>：剪輯送出的設定有問題（通常是數字超出範圍或字幕重疊）。'; }
  else if (!rep) sum.innerHTML = '<span class="mute">檢查中…</span>';
  else {
    errors = rep.issues?.errors || []; warnings = rep.issues?.warnings || [];
    const d = rep.data;
    if (d) sum.innerHTML = errors.length ? `<b class="err-ink">${errors.length} 個錯誤</b>、${warnings.length} 個提醒。錯誤要先改好才能產生成片；點一則跳到那一段。`
      : `<span class="ok-ink">✓ 通過</span>：${(d.items || []).length} 段、${warnings.length} 個提醒${Number.isFinite(d.outputDur) ? `；成片 ${fmt(d.outputDur, 1)}` : ''}。點一則跳到那一段。`;
    else sum.innerHTML = `<b class="warn-ink">${rep.fallback ? '簡易檢查' : '讀不到檢查報告'}</b>：${esc(rep.error || '')}${rep.log ? `<details><summary>訊息</summary><pre>${esc(rep.log)}</pre></details>` : ''}`;
  }
  // 剛在剪輯改字的段：重新產生後量的版面（audit），放最前面
  const au = app.saveErrors ? null : app.auditIssues;
  if (au && (au.errors.length || au.warnings.length)) {
    errors = [...au.errors, ...errors]; warnings = [...au.warnings, ...warnings];
    sum.innerHTML = `<b class="${au.errors.length ? 'err-ink' : 'warn-ink'}">剛改字的 ${esc(au.ids.join('、'))} 版面有 ${au.errors.length + au.warnings.length} 個問題</b>：改短一點或改回原本的字；要重新排版請寫進修改單給 AI。<br>${sum.innerHTML}`;
  }
  list.innerHTML = issueItems(errors, warnings) || (rep?.data ? '<li class="mute">沒有任何錯誤或提醒</li>' : '');
  renderStatus();
}
function openIssues() { $('#issuesPop').hidden = false; }
function renderMode() {
  const pv = app.server?.preview;
  const avail = !!pv?.player?.available, built = !!pv?.built;
  const pbtn = $('.seg [data-mode="player"]');
  pbtn.classList.toggle('is-disabled', !avail || !built);
  pbtn.dataset.tip = !avail ? `成片預覽不能用：${pv?.player?.reason || ''}（已退回即時模擬）` : !built ? '還沒有成片：先按「重新產生」' : '播上一次「重新產生」的完整成片（資訊卡、字幕、音效都有）';
  for (const b of $$('.seg button')) b.classList.toggle('on', b.dataset.mode === app.mode);
  const note = $('#modeNote');
  if (app.mode === 'player') {
    note.innerHTML = `<b>成片預覽</b>：上一次重新產生的完整成片。${pv?.stale ? '<span class="warn-ink">⚠ 之後又改過，按「重新產生」更新。</span>' : ''}`;
  } else {
    note.innerHTML = `<b>即時模擬</b>：粗剪＋你現在的設定（含音效、音量）；卡片要「重新產生」後在成片預覽看。${!avail ? `<span class="mute">（找不到 HyperFrames 播放器，只能用即時模擬）</span>` : ''}`;
  }
}

// ---------- 主題（亮／暗；plan.json 第一層 "theme"，specs/010-motion-v2/design-system.md §10）----------
// 不寫＝亮色。成片預覽在切換時直接改播放器 iframe 的 <html data-theme>（build 也是寫在主合成的 <html>），不用重新產生就看得到配色
const normTheme = (v) => (v === 'dark' ? 'dark' : 'light');
function inspTheme() {
  // 用屬性面板的 .seg-btns（不能用 .seg：預覽模式切換會把所有 .seg button 的 on 重設）
  const b = (v, label, tip) => `<button class="${app.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}" aria-pressed="${app.theme === v}" data-tip="${esc(tip)}">${label}</button>`;
  return `<section class="ip-sec"><h3>主題</h3>
    <div class="seg-btns theme-seg" role="group" aria-label="主題">${b('light', '亮', '米白底、白卡（預設）')}${b('dark', '暗', '石墨黑底、玻璃卡')}</div>
    <p class="ip-note">卡片、全幕和下方字卡的配色。「成片預覽」馬上換色看；存檔後按「重新產生」才會進成片（即時模擬沒有卡片，看不出差別）。</p>
  </section>`;
}

// ---------- 講者（調光、瘦臉、美顏；contracts/look.md §7）----------
const lookKit = () => ({ beauty: 0, ...(app.server?.look?.kit || { color: 0.8, slim: 0.6 }) });
const LOOK_ON = { color: 0.8, slim: 0.6, beauty: 0.5 };   // 「打開」時沒有上一次的值、kit 也是 0 → 用這個
// plan.json 的 look → 剪輯的值（null＝沒寫，用 kit 預設；false＝兩個都 0）
function normLook(v) {
  if (v === undefined || v === null) return null;
  if (v === false) return { color: 0, slim: 0, beauty: 0 };
  if (!isObj(v)) return null;
  const k = lookKit();
  return { color: Number.isFinite(v.color) ? v.color : k.color, slim: Number.isFinite(v.slim) ? v.slim : k.slim, beauty: Number.isFinite(v.beauty) ? v.beauty : (k.beauty || 0) };
}
const lookEff = () => app.look || { ...lookKit() };
const lookOut = (k, v) => (k === 'color' ? (v > 0 ? `${Number(v).toFixed(2)}（剪映 ${Math.round(v * 100)}）` : '關') : (v > 0 ? Number(v).toFixed(2) : '關'));
function updateLookCss() { app.lookCss = lookCss(lookEff().color, app.server?.look?.baked?.color ?? 0); }
let faceTimer = null;
// 前／後對照圖：面板重畫時先放上一次拿到的圖（格子固定大小、不會先縮再撐開），新圖到了再換
const faceShown = { before: { url: '', src: '' }, after: { url: '', src: '' } };
const faceSrc = (k) => (faceShown[k].src ? ` src="${faceShown[k].src}"` : '');
function refreshFaces(delay = 300) {
  clearTimeout(faceTimer);
  faceTimer = setTimeout(() => {
    const box = $('#lookFaces');
    if (!box || app.selection) return;
    const lm = app.server?.look?.landmarks;
    if (!lm?.ready || lm.slimOk === false) return;
    const t = r3(app.t), e = lookEff(), s = r2(e.slim), bt = r2(e.beauty || 0);
    for (const img of box.querySelectorAll('img')) {
      const k = img.dataset.k, after = k === 'after';
      const url = `/api/look/face?t=${t}&slim=${after ? s : 0}${after && bt > 0 ? `&beauty=${bt}` : ''}`;
      if (faceShown[k].url === url) continue;
      faceShown[k].url = url;
      // 格子一直在（固定大小）；新圖到了才換掉舊圖；這一格沒有臉就印一行原因、留著舊圖
      fetch(url).then(async (r) => {
        if (faceShown[k].url !== url) return;   // 已經有更新的請求
        if (r.ok) {
          const u = URL.createObjectURL(await r.blob());
          if (faceShown[k].src) URL.revokeObjectURL(faceShown[k].src);
          faceShown[k].src = u;
          const cur = $('#lookFaces');
          const el = cur?.querySelector(`img[data-k="${k}"]`);
          if (el) el.src = u;
          const msg = cur?.querySelector('.look-msg');
          if (msg) msg.textContent = '';
        } else { const j = await r.json().catch(() => ({})); const msg = $('#lookFaces .look-msg'); if (msg) msg.textContent = j.message || '這一格看不到臉'; }
      }).catch(() => {});
    }
    for (const img of box.querySelectorAll('img')) img.style.filter = app.lookCss;
  }, delay);
}
function inspLook() {
  const L = app.server?.look;
  if (!L) return '';
  if (L.error) return `<section class="ip-sec"><h3>講者</h3><p class="ip-warn">${esc(L.error)}</p></section>`;
  const e = { beauty: 0, ...lookEff() }, lim = { beauty: [0, 1], ...(L.limits || { color: [0, 1], slim: [0, 1.2], step: 0.05 }) }, kit = lookKit();
  const row = (k, label, max, tip) => `<div class="ip-slider wide" data-tip="${esc(tip)}"><label>${label}</label><input type="range" data-f="look.${k}" min="0" max="${max}" step="${lim.step}" value="${e[k]}"><output data-out="look.${k}" class="${e[k] !== kit[k] ? 'changed' : ''}">${lookOut(k, e[k])}</output></div>`;
  const lm = L.landmarks || {};
  // 略過瘦臉（small／noface／rate）時只印一行原因，不放前後對照（重跑也一樣會略過）
  const skip = {
    small: `畫面裡的臉太小（臉寬約 ${Math.round(lm.medianFaceWidth || 0)} px），瘦臉看不出來，成片只調光。`,
    noface: '抽樣 12 格都沒偵測到臉，這支只調光；確定畫面裡有講者，請 AI 跑 look.mjs run --force。',
    rate: `只有 ${Math.round((lm.rate || 0) * 100)}% 的格偵測到臉（不到 80%），自動關掉瘦臉，成片只調光；請 AI 看 work/look-preview.jpg。`,
  };
  const faces = !lm.ready ? '<p class="ip-note">瘦臉的前後對照要先偵測臉部：請 AI 跑 look.mjs run。</p>'
    : lm.slimOk === false ? `<p class="ip-note">${esc(skip[lm.reason] || '這支略過瘦臉，成片只調光。')}</p>`
      : `<div id="lookFaces" class="look-faces"><figure><img data-k="before" alt="原本"${faceSrc('before')}><figcaption>前</figcaption></figure><figure><img data-k="after" alt="瘦臉後"${faceSrc('after')}><figcaption>後（瘦臉 ${lookOut('slim', e.slim)}${e.beauty > 0 ? `、美顏 ${lookOut('slim', e.beauty)}` : ''}）</figcaption></figure><p class="look-msg ip-note"></p></div>`;
  setTimeout(() => refreshFaces(0), 0);
  return `<section class="ip-sec"><h3>講者</h3>
    ${row('color', '調光', lim.color[1], '亮一點、膚色紅潤一點（剪映「智能調色」）；拖的時候畫面馬上變，是近似效果，成片會更準')}
    ${row('slim', '瘦臉', lim.slim[1], '臉頰到下巴的輪廓往內收；改了要按「重新產生」才會套進成片（長片第一次要幾分鐘）')}
    ${row('beauty', '美顏', lim.beauty[1], '磨皮、膚色提亮、淡化黑眼圈，越往右越明顯（0＝關）；和瘦臉一起做進底片，改了要按「重新產生」才會套進成片；即時模擬看不到，看下面「後」那張臉')}
    <div class="ip-btns"><button class="small" data-act="lookOn" data-k="color">調光${e.color > 0 ? '關掉' : '打開'}</button><button class="small" data-act="lookOn" data-k="slim">瘦臉${e.slim > 0 ? '關掉' : '打開'}</button><button class="small" data-act="lookOn" data-k="beauty">美顏${e.beauty > 0 ? '關掉' : '打開'}</button><button class="small" data-act="lookReset"${app.look ? '' : ' disabled'} data-tip="回到每支影片共用的設定（shared/template/kit/look.json：調光 ${kit.color}、瘦臉 ${kit.slim}、美顏 ${kit.beauty}）">恢復預設</button></div>
    ${faces}
    ${(L.lines || []).map((l) => `<p class="ip-note">${esc(l)}</p>`).join('')}
  </section>`;
}

// ---------- 屬性面板 ----------
const fmtTime = (v) => (typeof v === 'string' ? v : Number.isFinite(v) ? `${r2(v)} 秒` : '—');
const sliderRow = (label, f, v, { min = -60, max = 12, step = 0.5, out, def = 0, tip = '' } = {}) => `<div class="ip-slider"${tip ? ` data-tip="${esc(tip)}"` : ''}><label>${label}</label><input type="range" data-f="${f}" min="${min}" max="${max}" step="${step}" value="${v ?? def}"><output data-out="${f}" class="${(v ?? def) !== def ? 'changed' : ''}">${out}</output></div>`;
function renderInspector() {
  const s = app.selection;
  let kind = '整支影片', title = '整支影片的設定', chip = '', body = '';
  if (!s) body = inspWhole();
  else if (s.kind === 'cue') { const c = app.cues.find((q) => q.n === s.id); kind = '字幕'; title = `第 ${s.id} 句`; body = inspCue(c); }
  else if (s.kind === 'item' || s.kind === 'media') {
    const it = app.itemsView.find((x) => x.id === s.id), sc = sceneById(s.id);
    const type = segType(sc) || it?.type;
    kind = TYPE_ZH[type] || '段落'; chip = `var(--c-${type})`; title = `${s.id}　${it?.label || ''}`;
    body = type === 'media' ? inspMedia(it, sc) : inspItem(it, sc);
  } else if (s.kind === 'cut') { kind = '剪掉的範圍'; title = rangeTitle(...app.edit.cuts[s.id]); body = inspCut(s.id); }
  else if (s.kind === 'piece') { const p = app.pieces.find((q) => q.key === s.id); kind = '主軌片段'; title = rangeTitle(p.a, p.b); body = inspRange(p.a, p.b, true); }
  else if (s.kind === 'range') { kind = '選取範圍'; title = rangeTitle(app.sel.a, app.sel.b); body = inspRange(app.sel.a, app.sel.b, false); }
  else if (s.kind === 'join') { const p = app.points.find((q) => Math.abs(q.at - s.id) < 1e-6); kind = '剪接點（轉場）'; title = `${fmtTC(p.at)}　${KIND_ZH[p.kind]}`; body = inspJoin(p); }
  else if (s.kind === 'gain') { const g = app.edit.gains[s.id]; kind = '人聲範圍音量'; title = rangeTitle(g.from, g.to); body = inspGain(s.id); }
  else if (s.kind === 'sfx') { const it = app.itemsView.find((x) => x.id === s.id); kind = '音效'; title = `${s.id}　${it?.label || ''}`; body = inspSfxOnly(it, sceneById(s.id)); }
  $('#inspKind').innerHTML = `${chip ? `<span class="chip" style="background:${chip}"></span>` : ''}${esc(kind)}`;
  $('#inspTitle').textContent = title;
  $('#inspBody').innerHTML = body;
  $('#inspBody').scrollTop = 0;
}
const rangeTitle = (a, b) => `${fmtTC(a)} – ${fmtTC(b)}（${fmtSec(b - a)}）`;
function inspWhole() {
  const e = app.edit;
  const lookSec = inspTheme() + inspLook();
  const pk = voicePeakMax();
  const L = app.loud;
  const longCaps = app.cues.filter((c) => visibleLen(c.text) > capMax()).length;
  return `${lookSec}<section class="ip-sec"><h3>聲音</h3>
    ${sliderRow('人聲', 'vol.voice', e.volume.voice, { out: fmtDb(e.volume.voice), tip: '講者的聲音（主軌）整條的音量' })}
    ${sliderRow('音效', 'vol.sfx', e.volume.sfx, { out: fmtDb(e.volume.sfx), tip: '全部音效一起調' })}
    ${sliderRow('素材原聲', 'vol.media', e.volume.media, { out: fmtDb(e.volume.media), tip: '插入素材有開原聲的才算' })}
    <div class="ip-btns"><button data-act="loud" data-tip="量整支人聲的響度（剪掉的範圍不算），把人聲音量調到 YouTube 常用的 ${app.server?.targetLufs ?? -14} LUFS">🔊 人聲標準化（${app.server?.targetLufs ?? -14} LUFS）</button></div>
    ${L ? `<div class="ip-result">${L.error ? `<span class="err-ink">${esc(L.error)}</span>` : `量到 <b>${L.integrated} LUFS</b>（峰值 ${L.truePeak ?? '—'} dBFS）→ 人聲設成 <b>${fmtDb(L.suggest)}</b>${L.raw !== L.suggest ? `（要 ${fmtDb(L.raw)}，超出範圍）` : ''}`}</div>` : ''}
    ${pk != null && pk > 0 ? `<p class="ip-warn">⚠ 可能爆音：人聲最大峰值 ${fmtDb(r2(pk))} → 把人聲往下調，或用「人聲標準化」</p>` : ''}
    <p class="ip-note">只調某一段的人聲：在時間軸拖曳選一段範圍，再按「調整這段人聲音量」，或直接拖範圍裡的黃線。</p>
  </section>
  <section class="ip-sec"><h3>淡入淡出</h3>
    ${sliderRow('開頭淡入', 'fadeIn', e.fadeIn, { min: 0, max: 5, step: 0.1, out: e.fadeIn ? `${e.fadeIn.toFixed(1)} 秒` : '不淡', def: 0 })}
    ${sliderRow('結尾淡出', 'fadeOut', e.fadeOut, { min: 0, max: 5, step: 0.1, out: e.fadeOut ? `${e.fadeOut.toFixed(1)} 秒` : '不淡', def: 0 })}
  </section>
  <section class="ip-sec"><h3>轉場（${app.points.length} 個剪接點、${e.joins.length} 個有轉場）</h3>
    <div class="ip-btns"><button class="small" data-act="bulk" data-v="none">全部無</button><button class="small" data-act="bulk" data-v="dip">全部過黑</button><button class="small" data-act="bulk" data-v="alt" data-tip="第 2、4、6… 個剪接點放大：口播跳接時一近一遠">交替放大</button></div>
    <p class="ip-note">點主軌上緣的菱形可以單獨設定：空心＝無、白＝過黑、黃＝放大。</p>
  </section>
  <section class="ip-sec"><h3>剪掉的範圍（成片 ${fmt(app.outDur, 1)}）</h3>
    <ol class="cut-list">${e.cuts.length ? e.cuts.map(([a, b], i) => `<li data-i="${i}"><span class="rng" data-act="gocut" data-i="${i}">${fmtTC(a)} – ${fmtTC(b)}</span><span class="dim">${fmtSec(b - a)}</span><button class="small ghost" data-act="restore" data-i="${i}">恢復</button></li>`).join('') : '<li class="empty">還沒有剪掉任何範圍</li>'}</ol>
  </section>
  <section class="ip-sec"><h3>字幕</h3>
    <div class="ip-row"><span class="k">句數</span><span class="v">${app.cues.length} 句${longCaps ? `，<span class="warn-ink">${longCaps} 句超過 ${capMax()} 字</span>` : ''}${app.server?.srt?.eol ? `<span class="dim">　（${app.server.srt.eol} 換行）</span>` : ''}</span></div>
    <div class="ip-btns"><button class="small" data-act="find">尋找與取代</button></div>
  </section>`;
}
function inspCue(c) {
  if (!c) return '';
  const len = visibleLen(c.text);
  const refs = refsTo({ scenes: app.scenes }, c.n);
  const sp = capSplitInfo(c), mg = canMerge(app.cues, c.n);
  const insA = insertInfo('after', c), insB = insertInfo('before', c);
  const btn = (act, label, st, cls = 'small') => `<button class="${cls}${st.ok ? '' : ' is-disabled'}" data-act="${act}" data-why="${esc(st.ok ? '' : st.why)}" data-tip="${esc(st.ok ? '' : st.why)}">${label}</button>`;
  return `<section class="ip-sec">
    <div class="field"><div class="fl"><span>文字</span><span class="cnt ${len > capMax() ? 'warn' : ''}" id="capCnt">${len > capMax() ? '⚠ ' : ''}${len} 字${len > capMax() ? `（建議 ≤ ${capMax()}）` : ''}</span></div>
      <textarea id="capText" class="cap" rows="2" data-n="${c.n}">${esc(c.text)}</textarea>
      <div class="hint">分割＝在播放頭的時間、文字游標的位置切成兩句。</div></div>
    <div class="ip-row"><label>開始</label><input class="tcv" data-f="capStart" value="${fmtTC(c.start)}" data-tip="時:分:秒:格，或直接打秒數"></div>
    <div class="ip-row"><label>結束</label><input class="tcv" data-f="capEnd" value="${fmtTC(c.end)}"></div>
    <div class="ip-row"><span class="k">長度</span><span class="v">${fmtSec(c.end - c.start)}</span></div>
    <div class="ip-btns">
      ${btn('capSplit', '✂ 分割（B）', sp)}${btn('capMerge', '與下一句合併', mg)}<button class="small danger" data-act="capDel">刪除</button>
    </div>
    <div class="ip-btns">${btn('capInsBefore', '＋ 前面新增', insB)}${btn('capInsAfter', '＋ 後面新增', insA)}<button class="small ghost" data-act="capPlay">▶ 播這句</button></div>
  </section>
  <section class="ip-sec"><h3>綁在這句的時間</h3>
    ${refs.length ? `<ul class="ref-list">${refs.map((r) => `<li>· <b>${esc(r.id)}</b>　${esc(r.ref)}</li>`).join('')}</ul><p class="ip-note">分割、合併、刪除時，這些句號會自動跟著改。</p>` : '<p class="ip-note">沒有卡片或插入素材綁在這句。</p>'}
  </section>`;
}
function sfxSection(it, sc) {
  if (!sc) return '';
  const marks = app.sfxView.filter((m) => m.segId === sc.id);
  const muted = sc.sfx === null;
  const v = Number.isFinite(sc.sfxVolume) ? sc.sfxVolume : 0;
  const mem = app.sfxMemory[sc.id];
  return `<section class="ip-sec"><h3>音效</h3>
    ${marks.length ? `<div class="chips">${marks.map((m) => `<span class="chip-t">${m.main ? '主' : '附加'}・${esc(m.name)}${m.muted ? '（靜音）' : ''} ${fmtTC(m.at).slice(3)}</span>`).join('')}</div>` : `<p class="ip-note">${app.reportReady ? '這段沒有音效' : '音效位置要等檢查報告'}</p>`}
    <div class="ip-btns"><button class="small toggle${muted ? ' on' : ''}" data-act="sfxMute" aria-pressed="${muted}">${!muted ? '🔈 靜音主音效' : mem || savedSceneById(sc.id)?.sfx !== null ? '🔇 主音效已靜音（按一下還原）' : '🔇 AI 設定這段不放主音效（按一下加回情境預設音效）'}</button></div>
    ${muted && mem?.had && mem.value ? `<p class="ip-note">還原會換回 AI 原本寫的「${esc(mem.value)}」。</p>` : ''}
    ${sliderRow('這段音量', 'sfxVolume', v, { out: fmtDb(v), tip: '這段的主音效和附加音效一起調（疊在整支的音效音量上）' })}
  </section>`;
}
function inspSfxOnly(it, sc) { return `${sfxSection(it, sc)}<section class="ip-sec"><div class="ip-btns"><button class="small" data-act="selItem" data-id="${esc(sc?.id)}">看這段的其他屬性</button></div></section>`; }
function inspItem(it, sc) {
  if (!sc) return '<p class="ip-note">plan.json 裡找不到這段</p>';
  const type = segType(sc);
  const def = type === 'scene' ? findSceneDef(app.server?.schema?.scenes, sc.scene) : type === 'fx' ? findFxDef(app.server?.schema?.fx, sc.fx) : null;
  const pv = app.server?.preview;
  return `<section class="ip-sec">
    <div class="ip-row"><span class="k">時間</span><span class="v tcv">${it ? `${fmtTC(it.start)} – ${fmtTC(it.end)}` : '—'}</span></div>
    <div class="ip-row"><span class="k">plan.json</span><span class="v"><code>${esc(fmtTime(sc.from ?? sc.at))}</code> → <code>${esc(fmtTime(sc.to ?? (sc.duration != null ? `+${sc.duration} 秒` : '預設長度')))}</code></span></div>
    <div class="ip-btns"><button class="small ghost" data-act="playItem">▶ 播這段</button>${pv?.player?.available && pv?.built ? '<button class="small ghost" data-act="playerItem">在成片預覽看</button>' : ''}<button class="small ghost" data-act="rqOpen" data-tip="換動畫、加字、重新排版：寫進右側修改單給 AI">✎ 寫進修改單</button></div>
  </section>
  <section class="ip-sec"><h3>文字${def ? `（${esc(def.zh)}）` : ''}</h3>${type === 'custom' ? '<p class="ip-note">自訂動畫的文字寫在它自己的 HTML 裡，請 AI 改。</p>' : textFields(sc, def, type)}
    <p class="ip-note">${type === 'scene' ? '<code>**詞**</code> 套主色、<code>//</code> 換行（只有標「可強調」的欄位）。' : ''}${type !== 'custom' ? '切到成片預覽，打字時畫面上的字會跟著換（還沒有動畫）；存檔後自動重新產生、量版面，字太長擠到或超出會紅字列在左下角檢查清單。清單只能刪項目。' : ''}要加項目、換動畫、重新排版：寫進右側修改單給 AI。</p>
  </section>
  ${sfxSection(it, sc)}`;
}
// 只准改短或改錯字：上限＝min(模板上限, 原本字數)；加字請寫進修改單（server/write.mjs 也會擋）
function cnt(v, decl) {
  const n = visibleLen(v);
  const max = decl?.max;
  const lines = decl?.maxLine ? lineLens(v) : null;
  const overLine = lines && lines.some((x) => x > decl.maxLine);
  const overLines = decl?.maxLines && lines && lines.length > decl.maxLines;
  const over = (max != null && n > max) || overLine || overLines;
  const txt = `${over ? '✖ ' : ''}${n}${max != null ? `／${max}` : ''} 字${overLine ? `（每行 ≤ ${decl.maxLine}）` : ''}${overLines ? `（最多 ${decl.maxLines} 行）` : ''}`;
  return { over, txt };
}
function textInput(path, v, decl, label) {
  const c = cnt(v, decl);
  const rich = decl?.type === 'rich';
  const long = (decl?.max ?? 0) > 16 || String(v).length > 16;
  const p = esc(JSON.stringify(path));
  return `<div class="field"><div class="fl"><span>${esc(label)}${rich ? ' <span class="chip-t">可強調</span>' : ''}</span><span class="cnt${c.over ? ' over' : ''}" data-cnt='${p}'>${c.txt}</span></div>
    ${long ? `<textarea rows="2" data-path='${p}' data-decl='${esc(JSON.stringify(decl || {}))}'>${esc(v)}</textarea>` : `<input data-path='${p}' data-decl='${esc(JSON.stringify(decl || {}))}' value="${esc(v)}">`}</div>`;
}
const isTextDecl = (d) => !d || !d.type || d.type === 'text' || d.type === 'rich';
const savedAt = (id, path) => path.reduce((x, k) => (x == null ? x : x[k]), savedSceneById(id));
function textFields(sc, def, type) {
  if (type === 'fx') {
    const vars = sc.vars || {};
    const keys = Object.keys(vars);
    if (!keys.length) return '<p class="ip-note">這段沒有寫 vars（用模板預設文字）；要改請跟 AI 說。</p>';
    return keys.map((k) => {
      const vd = def?.vars?.find((x) => x.id === k);
      const text = vd ? vd.type === 'string' : typeof vars[k] === 'string' && !['accent', 'bg'].includes(k);
      return text ? textInput(['vars', k], String(vars[k]), null, vd?.label || k) : `<div class="ip-row"><span class="k">${esc(vd?.label || k)}</span><span class="v"><code>${esc(JSON.stringify(vars[k]))}</code> <span class="dim">（請 AI 改）</span></span></div>`;
    }).join('');
  }
  const slots = sc.slots || {};
  const keys = Object.keys(slots);
  if (!keys.length) return '<p class="ip-note">這段沒有寫 slots（用模板預設文字）；要改請跟 AI 說。</p>';
  return keys.map((k) => {
    const decl = def?.slots?.[k];
    const v = slots[k];
    const label = decl?.label || k;
    if (typeof v === 'string' && isTextDecl(decl)) return textInput(['slots', k], v, decl, label);
    if (isObj(v) && typeof v.text === 'string' && isTextDecl(decl)) return textInput(['slots', k, 'text'], v.text, decl, `${label}${v.at ? `（${v.at} 出現）` : ''}`);
    if (Array.isArray(v) && (!decl || decl.type === 'list')) return listField(k, v, decl, label);
    return `<div class="ip-row"><span class="k">${esc(label)}</span><span class="v"><code>${esc(JSON.stringify(v))}</code> <span class="dim">（請 AI 改）</span></span></div>`;
  }).join('');
}
function listField(k, arr, decl, label) {
  const itemDecl = decl?.item || { text: { type: 'text' } };
  const fkeys = Object.keys(itemDecl);
  const textKeys = fkeys.filter((f) => isTextDecl(itemDecl[f]));
  const min = decl?.min ?? 1;
  const rows = arr.map((it, i) => {
    let cols = '', meta = '';
    if (typeof it === 'string') {
      const sp = splitItem(it, fkeys.length);
      const a = parseAttrs(sp.tail);
      cols = (fkeys.length >= 2 ? fkeys : [fkeys[0]]).filter((f) => isTextDecl(itemDecl[f])).map((f, j) => {
        const idx = fkeys.indexOf(f);
        const val = sp.cols[idx] ?? (fkeys.length >= 2 ? '' : sp.cols[0]);
        const od = itemDecl[f];
        const c = cnt(val, od);
        return `<input data-list='${esc(JSON.stringify({ k, i, col: idx, nf: fkeys.length }))}' data-decl='${esc(JSON.stringify(od || {}))}' value="${esc(val)}" placeholder="${esc(itemDecl[f]?.label || f)}" aria-label="${esc(`${label} 第 ${i + 1} 項`)}"><div class="cnt${c.over ? ' over' : ''}" data-cnt='${esc(JSON.stringify({ k, i, col: idx }))}'>${c.txt}</div>`;
      }).join('');
      meta = Object.entries(a).map(([x, y]) => `<span class="chip-t">${esc(x)}＝${esc(y)}</span>`).join('');
    } else if (isObj(it)) {
      cols = textKeys.filter((f) => f in it || itemDecl[f]?.required).map((f) => {
        const val = String(it[f] ?? '');
        const od = itemDecl[f];
        const c = cnt(val, od);
        return `<input data-path='${esc(JSON.stringify(['slots', k, i, f]))}' data-decl='${esc(JSON.stringify(od || {}))}' value="${esc(val)}" placeholder="${esc(itemDecl[f]?.label || f)}" aria-label="${esc(`${label} 第 ${i + 1} 項`)}"><div class="cnt${c.over ? ' over' : ''}" data-cnt='${esc(JSON.stringify(['slots', k, i, f]))}'>${c.txt}</div>`;
      }).join('');
      meta = Object.entries(it).filter(([x]) => !textKeys.includes(x)).map(([x, y]) => `<span class="chip-t">${esc(x)}＝${esc(typeof y === 'string' ? y : JSON.stringify(y))}</span>`).join('');
    }
    return `<div class="list-item"><span class="no">${i + 1}</span><div class="cols">${cols}${meta ? `<div class="chips meta">${meta}</div>` : ''}</div>
      <button class="small ghost${arr.length <= min ? ' is-disabled' : ''}" data-act="listDel" data-k="${esc(k)}" data-i="${i}" data-why="${arr.length <= min ? `至少要 ${min} 項` : ''}" data-tip="刪除這一項${arr.length <= min ? `（至少要 ${min} 項）` : ''}" aria-label="刪除第 ${i + 1} 項">✕</button></div>`;
  }).join('');
  return `<div class="field"><div class="fl"><span>${esc(label)}</span><span class="cnt">${arr.length} 項（至少 ${min} 項）</span></div>
    <div class="list-items">${rows}</div></div>`;
}
function inspMedia(it, sc) {
  if (!sc) return '';
  const m = app.mediaSeg(sc.id);
  const isImg = m?.kind === 'image';
  const vol = sc.volume === undefined ? null : sc.volume;
  const srcDur = m?.info?.dur;
  const len = it ? it.end - it.start : null;
  const used = it && !isImg ? (sc.in || 0) + len * (sc.speed || 1) : null;
  const opt = (v) => TRANS.map(([k, l]) => `<option value="${k}"${(v ?? 'fade') === k ? ' selected' : ''}>${l}${k === 'fade' && v == null ? '（預設）' : ''}</option>`).join('');
  return `<section class="ip-sec">
    <div class="ip-row"><span class="k">素材</span><span class="v" style="word-break:break-all">${esc(sc.src || '（沒有寫 src）')}<span class="dim">　${isImg ? '圖片' : `影片${srcDur ? ` ${fmtSec(srcDur)}` : ''}`}</span></span></div>
    <div class="ip-btns"><button class="small ghost" data-act="playItem">▶ 播這段</button><button class="small ghost" data-act="rqOpen" data-tip="換錄影、加標註、推近、改成動畫：寫進右側修改單給 AI">✎ 寫進修改單</button></div>
  </section>
  <section class="ip-sec"><h3>時間（拖時間軸上的左右邊緣也可以）</h3>
    <div class="ip-row"><span class="k">起點</span><span class="v"><code>${esc(fmtTime(sc.from))}</code>　<span class="tcv">${it ? fmtTC(it.start) : ''}</span></span></div>
    <div class="ip-row"><span class="k">終點</span><span class="v"><code>${esc(fmtTime(sc.to ?? (sc.duration != null ? `+${sc.duration} 秒` : '—')))}</code>　<span class="tcv">${it ? fmtTC(it.end) : ''}</span></span></div>
    <div class="ip-row"><span class="k">長度</span><span class="v">${len != null ? fmtSec(len) : '—'}</span></div>
    ${isImg ? '' : `<div class="ip-row"><label for="mIn">素材入點</label><span class="v"><input id="mIn" type="number" data-f="mediaIn" min="0" step="0.1" value="${r2(sc.in || 0)}" style="width:90px"> 秒<span class="dim">　速度 ×${sc.speed || 1}</span></span></div>
    ${used != null && srcDur ? `<p class="${used > srcDur + 0.05 ? 'ip-err' : 'ip-note'}">用到素材 ${r2(sc.in || 0)}–${r2(used)} 秒（素材共 ${r2(srcDur)} 秒）${used > srcDur + 0.05 ? ' ✖ 超過素材長度' : ''}</p>` : ''}`}
    ${sc.anchor ? `<div class="ip-row"><span class="k">anchor</span><span class="v">「${esc(sc.anchor)}」</span></div>` : ''}
  </section>
  ${isImg ? '' : `<section class="ip-sec"><h3>原聲</h3>
    <div class="ip-btns"><button class="small toggle${vol != null ? ' on' : ''}" data-act="mediaVolOn" aria-pressed="${vol != null}">${vol != null ? '🔈 保留原聲' : '🔇 原聲靜音（按一下保留）'}</button></div>
    ${vol != null ? sliderRow('原聲音量', 'mediaVol', vol, { out: fmtDb(vol) }) : ''}
  </section>`}
  <section class="ip-sec"><h3>進場／出場</h3>
    <div class="ip-row"><label>進場</label><select data-f="enter">${opt(sc.enter)}</select></div>
    <div class="ip-row"><label>出場</label><select data-f="exit">${opt(sc.exit)}</select></div>
  </section>
  ${sfxSection(it, sc)}
  <p class="ip-note">要換素材、運鏡、紅框、放大鏡，請跟 AI 說。</p>`;
}
function inspCut(i) {
  const [a, b] = app.edit.cuts[i];
  const p = app.points.find((q) => q.kind === 'cut' && Math.abs(q.at - a) < 1e-6);
  return `<section class="ip-sec">
    <div class="ip-row"><span class="k">長度</span><span class="v">${fmtSec(b - a)}</span></div>
    <div class="ip-btns"><button class="small" data-act="restore" data-i="${i}">恢復這段（Delete）</button><button class="small ghost" data-act="tryCut" data-i="${i}" data-tip="從接點前 2 秒播到後 2 秒">▶ 試聽接點</button></div>
    <p class="ip-note">拖紅色範圍的左右邊緣可以微調。</p>
  </section>${p ? `<section class="ip-sec"><h3>這個接點的轉場</h3>${joinButtons(p)}</section>` : ''}`;
}
function inspRange(a, b, piece) {
  return `<section class="ip-sec">
    <div class="ip-row"><span class="k">入點</span><span class="v tcv">${fmtTC(a)}</span></div>
    <div class="ip-row"><span class="k">出點</span><span class="v tcv">${fmtTC(b)}</span></div>
    <div class="ip-row"><span class="k">長度</span><span class="v">${fmtSec(b - a)}</span></div>
    <div class="ip-btns"><button class="small danger" data-act="cutSel">✂ 剪掉這段（Delete）</button><button class="small ghost" data-act="playSel">▶ 播放</button></div>
    <div class="ip-btns"><button class="small" data-act="gainSel" data-tip="在這個範圍加一條人聲音量線，可以單獨調大聲或小聲">🔊 調整這段人聲音量</button></div>
    ${piece ? '<p class="ip-note">這段是用分割（B）切出來的。剪掉之後播放會直接跳過。</p>' : '<p class="ip-note">按 I／O 可以用播放頭設入點、出點。</p>'}
  </section>`;
}
function joinButtons(p) {
  const j = joinFor(app.edit, p);
  const type = j?.type || 'none';
  return `<div class="seg-btns">${JOIN_TYPES.map(([v, l]) => `<button data-act="join" data-v="${v}" class="${v === type ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${type === 'dip' ? `<div class="ip-row"><label>過黑長度</label><span class="v"><input type="number" data-f="joinDur" min="0.05" max="2" step="0.05" value="${j.dur ?? DIP_DEFAULT}" style="width:80px"> 秒</span></div>` : ''}
    <p class="ip-note">過黑＝很快變黑再亮（換段落）；放大＝接點後畫面放大 1.08 倍到下一個剪接點（口播跳接常用）。</p>
    <div class="ip-btns"><button class="small ghost" data-act="tryJoin">▶ 試看這個接點</button></div>`;
}
function inspJoin(p) { return `<section class="ip-sec"><h3>轉場</h3>${joinButtons(p)}</section>`; }
function inspGain(i) {
  const g = app.edit.gains[i];
  return `<section class="ip-sec">
    ${sliderRow('音量', 'gainDb', g.db, { out: fmtDb(g.db), tip: '這段人聲比整條的人聲音量再加減多少' })}
    <div class="ip-row"><span class="k">實際</span><span class="v">${fmtDb(r2(app.edit.volume.voice + g.db))}（人聲 ${fmtDb(app.edit.volume.voice)} ${g.db >= 0 ? '＋' : '−'} ${Math.abs(g.db)} dB）</span></div>
    <div class="ip-btns"><button class="small danger" data-act="gainDel">刪除這段音量調整（Delete）</button><button class="small ghost" data-act="gainPlay">▶ 播放</button></div>
    <p class="ip-note">在時間軸上拖黃線調大小、拖兩端的圓點調範圍。</p>
  </section>`;
}

// 屬性面板的事件
function setPath(obj, path, v) {
  const o = clone(obj);
  let cur = o;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = v;
  return o;
}
// 邊打字邊看：成片預覽（播放器 iframe）裡這段的舊字直接換成新字（靜態：逐字動畫、精確版面要存檔後重新產生）。
//   froms＝畫面上可能的舊字（上一次打的、上次存檔的）；找最深一層字剛好相同的元素換掉，播放頭不在這段就跳到完成態
const livePlain = (s) => richPlain(s).replace(/\s+/g, '');
function livePatch(id, froms, to, rich) {
  if (app.mode !== 'player' || !player.ready) return;
  let host = null;
  try { host = player.p?.iframeElement?.contentDocument?.getElementById(`el-${id}`) || null; } catch { /* 不同源時讀不到 */ }
  if (!host) return;
  for (const from of froms) {
    const want = typeof from === 'string' ? livePlain(from) : '';
    if (!want) continue;
    const hits = [...host.querySelectorAll('*')].filter((e) => livePlain(e.textContent) === want && ![...e.children].some((c) => livePlain(c.textContent) === want));
    if (!hits.length) continue;
    for (const e of hits) {
      if (rich) e.innerHTML = esc(to).replace(/\*\*(.+?)\*\*/g, '<span class="sc-kw">$1</span>').replace(/(?<!:)\/\//g, '<br>');
      else e.textContent = to;
    }
    const it = app.itemsView.find((x) => x.id === id);
    if (it && (app.t < it.start || app.t > it.end)) app.seek(Math.max(it.start, it.end - 0.6));
    return;
  }
}
function onInspInput(e) {
  const el = e.target;
  const s = app.selection;
  const f = el.dataset.f;
  const num = Number(el.value);
  const outEl = (k) => $(`#inspBody [data-out="${k}"]`);
  if (f?.startsWith('vol.')) { const k = f.slice(4); mutate(() => { app.edit.volume[k] = num; }, { coalesce: f }); outEl(f).textContent = fmtDb(num); outEl(f).classList.toggle('changed', num !== 0); app.loud = null; return; }
  if (f === 'look.color' || f === 'look.slim' || f === 'look.beauty') {
    const k = f.slice(5);
    mutate(() => { app.look = { ...lookEff(), [k]: r2(num) }; }, { coalesce: f });
    outEl(f).textContent = lookOut(k, num); outEl(f).classList.toggle('changed', r2(num) !== lookKit()[k]);
    return;
  }
  if (f === 'fadeIn' || f === 'fadeOut') { mutate(() => { app.edit[f] = num; }, { coalesce: f }); outEl(f).textContent = num ? `${num.toFixed(1)} 秒` : '不淡'; return; }
  if (f === 'sfxVolume' && s) { setSeg(s.id, { sfxVolume: num === 0 ? undefined : num }, { coalesce: `sfxv-${s.id}` }); outEl(f).textContent = fmtDb(num); return; }
  if (f === 'mediaVol' && s) { setSeg(s.id, { volume: num }, { coalesce: `mv-${s.id}` }); outEl(f).textContent = fmtDb(num); return; }
  if (f === 'gainDb' && s) { mutate(() => { app.edit.gains[s.id].db = num; }, { coalesce: `g-${s.id}` }); outEl(f).textContent = fmtDb(num); return; }
  if (el.id === 'capText') {
    const n = Number(el.dataset.n);
    const len = visibleLen(el.value);
    $('#capCnt').textContent = `${len > capMax() ? '⚠ ' : ''}${len} 字${len > capMax() ? `（建議 ≤ ${capMax()}）` : ''}`;
    $('#capCnt').classList.toggle('warn', len > capMax());
    if (el.value.trim()) setCue(n, { text: el.value }, { coalesce: `cap-${n}` });
    return;
  }
  if (el.dataset.path && s) {
    const path = JSON.parse(el.dataset.path);
    const sc = sceneById(s.id);
    const top = path[0];
    const prev = path.reduce((x, k) => (x == null ? x : x[k]), sc);
    const next = setPath(sc[top] || {}, path.slice(1), el.value);
    setSeg(s.id, { [top]: next }, { coalesce: `txt-${s.id}-${el.dataset.path}` });
    const decl = JSON.parse(el.dataset.decl || '{}');
    livePatch(s.id, [prev, savedAt(s.id, path)], el.value, decl.type === 'rich');
    const c = cnt(el.value, decl);
    const ce = el.nextElementSibling?.classList.contains('cnt') ? el.nextElementSibling : el.closest('.field')?.querySelector('.fl .cnt');
    if (ce) { ce.textContent = c.txt; ce.classList.toggle('over', c.over); }
    return;
  }
  if (el.dataset.list && s) {
    const L = JSON.parse(el.dataset.list);
    const sc = sceneById(s.id);
    const arr = clone(sc.slots[L.k]);
    const sp = splitItem(arr[L.i], L.nf);
    const cols = sp.cols.slice();
    while (cols.length <= L.col) cols.push('');
    const prev = cols[L.col];
    cols[L.col] = el.value;
    arr[L.i] = joinItem(L.nf >= 2 ? cols : [cols[0]], sp.tail);
    setSeg(s.id, { slots: { ...sc.slots, [L.k]: arr } }, { coalesce: `txt-${s.id}-${L.k}-${L.i}-${L.col}` });
    const decl = JSON.parse(el.dataset.decl || '{}'), saved = savedAt(s.id, ['slots', L.k, L.i]);
    livePatch(s.id, [prev, typeof saved === 'string' ? splitItem(saved, L.nf).cols[L.col] : null], el.value, decl.type === 'rich');
    const c = cnt(el.value, decl);
    const ce = el.nextElementSibling;
    if (ce?.classList.contains('cnt')) { ce.textContent = c.txt; ce.classList.toggle('over', c.over); }
  }
}
function onInspChange(e) {
  const el = e.target, f = el.dataset.f, s = app.selection;
  if (f === 'enter' || f === 'exit') setSeg(s.id, { [f]: el.value }, { inspector: true });
  else if (f === 'mediaIn') {
    const v = Math.max(0, Number(el.value) || 0);
    const it = app.itemsView.find((x) => x.id === s.id), m = app.mediaSeg(s.id);
    if (it && m?.info?.dur && v + (it.end - it.start) * (it.speed || 1) > m.info.dur + 0.05) { toast(`素材從 ${v} 秒開始播會超過素材長度 ${m.info.dur} 秒`, 'err'); renderInspector(); return; }
    setSeg(s.id, { in: r2(v) }, { inspector: true });
  } else if (f === 'capStart' || f === 'capEnd') {
    const t = parseTC(el.value);
    if (t == null) { toast('看不懂這個時間：寫成 00:00:12:05 或 12.2', 'warn'); renderInspector(); return; }
    setCue(s.id, f === 'capStart' ? { start: r3(t) } : { end: r3(t) });
    renderInspector();
  } else if (f === 'joinDur') {
    const p = app.points.find((q) => Math.abs(q.at - (s.kind === 'join' ? s.id : app.edit.cuts[s.id]?.[0])) < 1e-6);
    if (p) setJoin(p, 'dip', Number(el.value) || DIP_DEFAULT);
  } else if (el.id === 'capText' || el.dataset.path || el.dataset.list) renderCapButtons();
  if (f === 'look.slim' || f === 'look.color' || f === 'look.beauty') { renderInspector(); refreshFaces(0); }
  if (el.type === 'range') el.blur();
}
function onInspClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.classList.contains('is-disabled')) { if (b.dataset.why) toast(b.dataset.why, 'warn', 3500); return; }
  const act = b.dataset.act, s = app.selection;
  const it = s ? app.itemsView.find((x) => x.id === s.id) : null;
  switch (act) {
    case 'loud': return normalizeVoice();
    case 'rqOpen': setRequestsOpen(true); setTimeout(() => $('#rqNote')?.focus(), 20); return;
    case 'lookOn': {
      const k = b.dataset.k, cur = lookEff();
      if (cur[k] > 0) { app.lookPrev[k] = cur[k]; mutate(() => { app.look = { ...cur, [k]: 0 }; }, { inspector: true }); }
      else mutate(() => { app.look = { ...cur, [k]: app.lookPrev[k] || lookKit()[k] || LOOK_ON[k] }; }, { inspector: true });
      return refreshFaces(0);
    }
    case 'lookReset': mutate(() => { app.look = null; }, { inspector: true }); return refreshFaces(0);
    case 'theme': mutate(() => { app.theme = normTheme(b.dataset.v); }, { inspector: true }); return;
    case 'bulk': return bulkJoins(b.dataset.v);
    case 'restore': return restoreCut(Number(b.dataset.i));
    case 'gocut': { const c = app.edit.cuts[Number(b.dataset.i)]; app.select({ kind: 'cut', id: Number(b.dataset.i) }); app.seek(c[0]); timeline.ensureVisible(c[0], false); return; }
    case 'tryCut': { const c = app.edit.cuts[Number(b.dataset.i)]; return playFrom(c[0] - 2, c[1] + 2); }
    case 'find': return openFind();
    case 'capSplit': return splitCue();
    case 'capMerge': return mergeCue();
    case 'capDel': return deleteCue();
    case 'capInsAfter': return insertCue('after');
    case 'capInsBefore': return insertCue('before');
    case 'capPlay': { const c = selectedCue(); if (c) playFrom(c.start, c.end); return; }
    case 'playItem': if (it) playFrom(it.start, it.end); return;
    case 'playerItem': if (it) setMode('player', { focus: it.start + 0.3 }); return;
    case 'sfxMute': return toggleSfxMute(s.id);
    case 'selItem': { const sc = sceneById(b.dataset.id); return app.select({ kind: segType(sc) === 'media' ? 'media' : 'item', id: b.dataset.id }); }
    case 'mediaVolOn': { const sc = sceneById(s.id); return setSeg(s.id, { volume: sc.volume == null ? 0 : null }, { inspector: true }); }
    case 'listDel': return listDel(b.dataset.k, Number(b.dataset.i));
    case 'cutSel': return deleteSelection();
    case 'playSel': return s.kind === 'piece' ? (() => { const p = app.pieces.find((q) => q.key === s.id); playFrom(p.a, p.b); })() : playFrom(app.sel.a, app.sel.b);
    case 'gainSel': return addGainForSelection();
    case 'join': { const p = s.kind === 'join' ? app.points.find((q) => Math.abs(q.at - s.id) < 1e-6) : app.points.find((q) => q.kind === 'cut' && Math.abs(q.at - app.edit.cuts[s.id][0]) < 1e-6); if (p) setJoin(p, b.dataset.v); renderInspector(); return; }
    case 'tryJoin': { const p = s.kind === 'join' ? app.points.find((q) => Math.abs(q.at - s.id) < 1e-6) : app.points.find((q) => q.kind === 'cut' && Math.abs(q.at - app.edit.cuts[s.id][0]) < 1e-6); if (p) playFrom(p.at - 2, p.end + 2); return; }
    case 'gainDel': mutate(() => { app.edit.gains.splice(s.id, 1); }); app.select(null); return;
    case 'gainPlay': { const g = app.edit.gains[s.id]; return playFrom(g.from, g.to); }
    default:
  }
}
function listDel(k, i) {
  const s = app.selection, sc = sceneById(s.id);
  const arr = clone(sc.slots[k]);
  arr.splice(i, 1);
  setSeg(s.id, { slots: { ...sc.slots, [k]: arr } }, { inspector: true });
}
function setJoin(p, type, dur) {
  mutate(() => {
    app.edit.joins = app.edit.joins.filter((j) => !(Math.abs(j.at - p.at) <= JOIN_TOL || Math.abs(j.at - p.end) <= JOIN_TOL));
    if (type === 'dip') app.edit.joins.push({ at: r3(p.at), type: 'dip', dur: r3(clamp(dur ?? DIP_DEFAULT, 0.05, 2)) });
    else if (type === 'punch') app.edit.joins.push({ at: r3(p.at), type: 'punch' });
    app.edit.joins.sort((x, y) => x.at - y.at);
  }, { inspector: true });
}
function bulkJoins(kind) {
  if (!app.points.length) { toast('目前沒有剪接點', 'warn'); return; }
  mutate(() => {
    if (kind === 'none') app.edit.joins = [];
    else if (kind === 'dip') app.edit.joins = app.points.map((p) => ({ at: r3(p.at), type: 'dip', dur: DIP_DEFAULT }));
    else if (kind === 'alt') app.edit.joins = app.points.filter((_, i) => i % 2 === 1).map((p) => ({ at: r3(p.at), type: 'punch' }));
  }, { inspector: true });
}
async function normalizeVoice() {
  const tt = toast('量人聲響度中…', 'ok', 0, { busy: true });
  const r = await api('POST', '/api/loudness', { cuts: app.edit.cuts });
  tt.close();
  if (!r.ok) { app.loud = { error: r.data?.message || '量不到響度' }; renderInspector(); return; }
  app.loud = r.data;
  mutate(() => { app.edit.volume.voice = r.data.suggest; }, { inspector: true });
  toast(`人聲 ${r.data.integrated} LUFS → 調 ${fmtDb(r.data.suggest)}，達到 ${r.data.target} LUFS`, 'ok', 4000);
}
function addGainForSelection() {
  let a, b;
  if (app.selection?.kind === 'piece') { const p = app.pieces.find((q) => q.key === app.selection.id); a = p.a; b = p.b; } else { a = app.sel.a; b = app.sel.b; }
  if (a == null || b == null || b - a < 0.1) { toast('先在時間軸拖曳選一段範圍', 'warn'); return; }
  if (app.edit.gains.some((g) => g.from < b - 0.0005 && g.to > a + 0.0005)) { toast('這個範圍和已有的人聲音量調整重疊 → 先刪掉或縮小舊的', 'warn', 4000); return; }
  mutate(() => { app.edit.gains.push({ from: r3(a), to: r3(b), db: 3 }); });
  const i = app.edit.gains.findIndex((g) => Math.abs(g.from - a) < 0.001);
  app.sel = { a: null, b: null };
  app.select({ kind: 'gain', id: i }, { lane: 'voice' });
  toast('已加一段人聲音量 +3 dB：拖黃線調大小', 'ok', 3000);
}
function deleteSelection() {
  const s = app.selection;
  if (!s && selValid()) return cutRange(app.sel.a, app.sel.b);
  if (!s) { toast('先選一個東西：點主軌片段、字幕、剪掉的範圍或音效，或拖曳選範圍', 'warn', 3500); return; }
  switch (s.kind) {
    case 'piece': { const p = app.pieces.find((q) => q.key === s.id); return cutRange(p.a, p.b); }
    case 'range': return cutRange(app.sel.a, app.sel.b);
    case 'cut': return restoreCut(s.id);
    case 'cue': return deleteCue();
    case 'gain': mutate(() => { app.edit.gains.splice(s.id, 1); }); return app.select(null);
    case 'sfx': return toggleSfxMute(s.id);
    case 'join': { const p = app.points.find((q) => Math.abs(q.at - s.id) < 1e-6); if (p) setJoin(p, 'none'); return; }
    case 'media': case 'item': toast('剪輯不刪卡片和插入素材 → 要拿掉請跟 AI 說；只想暫時不要它的聲音，可以把音效或原聲靜音', 'warn', 4500); return;
    default:
  }
}

// ---------- 時間軸互動（timeline.js 呼叫）----------
const snapT = (t, e, opts) => timeline.snap(t, e, opts);
function lockedToast(lane) { toast(`「${TRACK_NAMES[lane]}」軌已鎖定 → 點軌頭的 🔒 解鎖`, 'warn', 2500); }
app.tlClick = (h, e) => {
  const lane = h.lane;
  app.selLane = lane;
  if (app.tool === 'split' && (lane === 'main' || lane === 'voice')) { splitMain(snapT(h.t, e).t); return; }
  if (app.tool === 'split' && lane === 'cap' && h.cue) { app.seek(h.t); app.select({ kind: 'cue', id: h.cue.n }, { lane }); splitCue(); return; }
  app.seek(h.t);
  switch (h.kind) {
    case 'item': return app.select({ kind: 'item', id: h.item.id }, { lane });
    case 'media': case 'mediaL': case 'mediaR': case 'mediaVol': return app.select({ kind: 'media', id: h.item.id }, { lane });
    case 'join': return app.select({ kind: 'join', id: h.point.at }, { lane });
    case 'cut': case 'cutEdge': return app.select({ kind: 'cut', id: h.cutIndex ?? h.cut.i }, { lane });
    case 'piece': return app.select({ kind: 'piece', id: h.piece.key }, { lane });
    case 'cue': case 'capEdge': return app.select({ kind: 'cue', id: h.cue.n }, { lane });
    case 'gainVol': case 'gainEdge': case 'gainBody': return app.select({ kind: 'gain', id: h.gain }, { lane });
    case 'sfx': return app.select({ kind: 'sfx', id: h.sfx.segId }, { lane });
    default: return app.select(null, { lane });
  }
};
app.tlDouble = (h) => {
  if (h.kind === 'cue') openCapEditor(h.cue.n);
  else if (h.kind === 'gap') { if (app.trackLocked('cap')) return lockedToast('cap'); insertCue('after', null, h.t); }
  else if (h.kind === 'sfx') toggleSfxMute(h.sfx.segId);
  else if (h.kind === 'item' || h.kind === 'media') { const it = h.item; app.seek(it.start); }
};
app.tlTip = (h) => {
  const lk = app.trackLocked(h.lane) ? '\n🔒 這條軌已鎖定' : '';
  switch (h.kind) {
    case 'item': return `${h.item.id}｜${TYPE_ZH[h.item.type] || ''} ${h.item.label}\n${fmtTC(h.item.start)} – ${fmtTC(h.item.end)}${h.item.warnings ? `\n⚠ ${h.item.warnings} 個提醒` : ''}\n點一下在右邊改文字`;
    case 'media': return `${h.item.id}｜${h.item.srcName}\n${fmtTC(h.item.start)} – ${fmtTC(h.item.end)}（${fmtSec(h.item.end - h.item.start)}）\n拖中間移動、拖兩邊裁剪${lk}`;
    case 'mediaL': return `拖曳裁剪起點（素材內容不跑）${lk}`;
    case 'mediaR': return `拖曳裁剪終點${lk}`;
    case 'mediaVol': return `原聲音量 ${h.item.volume == null ? '靜音' : fmtDb(h.item.volume)}：上下拖${lk}`;
    case 'head': return `拖進來裁掉片頭${lk}`;
    case 'tail': return `拖進來裁掉片尾${lk}`;
    case 'cutEdge': return `拖曳調整剪掉的範圍${lk}`;
    case 'cut': { const [a, b] = app.edit.cuts[h.cutIndex]; return `剪掉 ${fmtTC(a)} – ${fmtTC(b)}（${fmtSec(b - a)}）\n點選後按 Delete 恢復`; }
    case 'join': { const j = joinFor(app.edit, h.point); return `剪接點 ${fmtTC(h.point.at)}（${KIND_ZH[h.point.kind]}）\n轉場：${(JOIN_TYPES.find(([v]) => v === (j?.type || 'none')) || [])[1]}　點一下更改`; }
    case 'piece': return `主軌片段 ${fmtTC(h.piece.a)} – ${fmtTC(h.piece.b)}\n點選後按 Delete 剪掉；拖曳選範圍${app.voiceOnly.some(([a, b]) => h.t >= a && h.t <= b) ? '\n這裡只有聲音（沒有講者畫面）' : ''}`;
    case 'cue': return `#${h.cue.n}　${h.cue.text}\n${fmtTC(h.cue.start)} – ${fmtTC(h.cue.end)}　${visibleLen(h.cue.text)} 字\n雙擊直接改字`;
    case 'capEdge': return `拖曳調整第 ${h.cue.n} 句的${h.edge ? '結束' : '開始'}時間${lk}`;
    case 'gap': return `空檔 ${fmtSec(h.gap.hi - h.gap.lo)}：雙擊新增一句字幕`;
    case 'gainVol': return `這段人聲 ${fmtDb(app.edit.gains[h.gain].db)}：上下拖${lk}`;
    case 'gainEdge': return `拖曳調整範圍${lk}`;
    case 'voiceVol': return `人聲音量 ${fmtDb(app.edit.volume.voice)}：上下拖整條${selValid() && h.t >= app.sel.a && h.t <= app.sel.b ? '\n（在選取範圍裡拖＝只調這一段）' : ''}${lk}`;
    case 'voiceBody': return '拖曳選一段範圍（剪掉或單獨調音量）';
    case 'sfx': return `${h.sfx.segId} 的${h.sfx.main ? '主' : '附加'}音效「${h.sfx.name}」${h.sfx.muted ? '（靜音）' : h.sfx.db != null ? ` ${fmtDb(r2(h.sfx.db))}` : ''}\n上下拖調這段音量、雙擊靜音${lk}`;
    default: return null;
  }
};
app.tlDown = (h, e) => {
  const lane = h.lane;
  if (app.tool === 'split') return null;
  const editKinds = ['mediaL', 'mediaR', 'media', 'mediaVol', 'head', 'tail', 'cutEdge', 'capEdge', 'gainVol', 'gainEdge', 'voiceVol', 'sfx'];
  if (editKinds.includes(h.kind) && app.trackLocked(lane)) { return { move: () => null, up: (moved) => { if (moved) lockedToast(lane); } }; }
  switch (h.kind) {
    case 'mediaL': case 'mediaR': case 'media': return dragMedia(h, e);
    case 'mediaVol': return dragMediaVol(h);
    case 'head': case 'tail': return dragHeadTail(h.kind);
    case 'cutEdge': return dragCutEdge(h.cut.i, h.cut.edge);
    case 'capEdge': return dragCapEdge(h.cue, h.edge);
    case 'gainVol': return dragGainVol(h.gain);
    case 'gainEdge': return dragGainEdge(h.gain, h.edge);
    case 'voiceVol': return selValid() && h.t >= app.sel.a && h.t <= app.sel.b ? dragNewGain() : dragVoiceVol();
    case 'sfx': return dragSfx(h.sfx);
    case 'piece': case 'voiceBody': case 'cut': case 'gainBody': return dragRange(h.t, e);
    default: return null;
  }
};
function dragRange(t0, e0) {
  const s0 = snapT(t0, e0).t;
  return {
    move(t, y, e) {
      const s = snapT(t, e, { exclude: [] }).t;
      app.setSelection(Math.min(s0, s), Math.max(s0, s), { live: true });
      return `${fmtTC(app.sel.a)} – ${fmtTC(app.sel.b)}（${fmtSec(app.sel.b - app.sel.a)}）`;
    },
    up(moved) { if (moved) { app.setSelection(app.sel.a, app.sel.b); renderCapButtons(); } },
  };
}
function dragMedia(h, e0) {
  const id = h.item.id, sc0 = clone(sceneById(id)), it = h.item;
  const mode = h.kind === 'mediaL' ? 'L' : h.kind === 'mediaR' ? 'R' : 'M';
  const speed = Number.isFinite(sc0.speed) ? sc0.speed : 1, in0 = Number.isFinite(sc0.in) ? sc0.in : 0;
  const srcDur = it.mediaKind === 'image' ? null : it.srcDur;
  const s0 = it.start, e0t = it.end, grab = h.t;
  const isImg = it.mediaKind === 'image';
  app.gestureBegin();
  app.select({ kind: 'media', id }, { lane: 'media' });
  const refFor = (snap, kindWanted) => (snap && (snap.kind === 'cueStart' || snap.kind === 'cueEnd') ? `#${snap.n}${snap.kind === 'cueEnd' ? 'e' : ''}` : null);
  return {
    move(t, y, e) {
      let ns = s0, ne = e0t, fromRef = null, toRef = null;
      if (mode === 'L') {
        const r = snapT(t, e, { exclude: [s0] });
        ns = r.t;
        const lo = Math.max(0, isImg ? 0 : s0 - in0 / speed), hi = e0t - 1;
        if (ns < lo || ns > hi) { ns = clamp(ns, lo, hi); timeline.snapLine = null; } else fromRef = refFor(r.snap);
      } else if (mode === 'R') {
        const r = snapT(t, e, { exclude: [e0t] });
        ne = r.t;
        const hi = Math.min(app.dur, srcDur ? s0 + (srcDur - in0) / speed : Infinity), lo = s0 + 1;
        if (ne < lo || ne > hi) { ne = clamp(ne, lo, hi); timeline.snapLine = null; } else toRef = refFor(r.snap);
      } else {
        const dt = t - grab;
        const len = e0t - s0;
        let cs = s0 + dt;
        const rs = snapT(cs, e, { exclude: [s0, e0t] });
        if (rs.snap) { cs = rs.t; fromRef = refFor(rs.snap); }
        else { const re = snapT(cs + len, e, { exclude: [s0, e0t] }); if (re.snap) { cs = re.t - len; toRef = refFor(re.snap); } }
        if (cs < 0 || cs + len > app.dur) { cs = clamp(cs, 0, app.dur - len); fromRef = null; toRef = null; timeline.snapLine = null; }
        ns = cs; ne = cs + len;
      }
      ns = r2(ns); ne = r2(ne);
      const sc = { ...sceneById(id) };
      if (mode !== 'R') {
        if (fromRef && Math.abs((refTime(fromRef, app.cues) ?? -1) - ns) < 0.006) { sc.from = fromRef; const n = parseRef(fromRef).n; const c = app.cues.find((q) => q.n === n); sc.anchor = c ? anchorFor(c.text) : undefined; if (!sc.anchor) delete sc.anchor; }
        else { sc.from = ns; delete sc.anchor; }
      }
      if (mode !== 'L') {
        if (toRef && Math.abs((refTime(toRef, app.cues) ?? -1) - ne) < 0.006) sc.to = toRef; else sc.to = ne;
        delete sc.duration;
      } else if (sc.to == null && Number.isFinite(sc.duration)) { sc.to = r2(e0t); delete sc.duration; }
      if (mode === 'L' && !isImg) sc.in = r2(Math.max(0, in0 + (ns - s0) * speed));
      const i = app.scenes.findIndex((x) => x.id === id);
      app.scenes = app.scenes.slice(); app.scenes[i] = sc;
      recompute();
      const edgeT = mode === 'R' ? ne - 1 / app.fps : ns;
      app.seek(edgeT);
      const d = (ne - ns) - (e0t - s0);
      const lab = mode === 'L' ? `起點 ${fmtTC(ns)}${fromRef ? `（${fromRef}）` : ''}` : mode === 'R' ? `終點 ${fmtTC(ne)}${toRef ? `（${toRef}）` : ''}` : `${fmtTC(ns)} – ${fmtTC(ne)}${fromRef ? `（${fromRef}）` : toRef ? `（${toRef}）` : ''}`;
      return `${lab}\n長度 ${fmtSec(ne - ns)}${Math.abs(d) > 0.004 ? `（${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} 秒）` : ''}${mode === 'L' && !isImg ? `\n素材從 ${r2(sc.in)} 秒開始` : ''}`;
    },
    up(moved) { app.gestureEnd(moved); },
    cancel() { app.gestureEnd(false); },
  };
}
function dragMediaVol(h) {
  const id = h.item.id;
  app.gestureBegin();
  app.select({ kind: 'media', id }, { lane: 'media' });
  return {
    move(t, y) {
      const db = timeline.dbOfY('media', y) - app.edit.volume.media;
      const v = db <= -59.5 ? null : clamp(r2(db), -60, 12);
      const i = app.scenes.findIndex((x) => x.id === id);
      app.scenes = app.scenes.slice(); app.scenes[i] = { ...app.scenes[i], volume: v };
      recompute();
      return `原聲 ${v == null ? '靜音' : fmtDb(v)}`;
    },
    up(moved) { app.gestureEnd(moved); },
  };
}
function dragHeadTail(which) {
  app.gestureBegin();
  let idx = null;
  return {
    move(t, y, e) {
      const r = snapT(t, e);
      const minLeft = 0.5;
      if (which === 'head') {
        const tail = app.headTail().tail;
        const nt = frameSnap(clamp(r.t, 1 / app.fps, tail - minLeft));
        if (idx == null) { if (app.edit.cuts.length && app.edit.cuts[0][0] <= 0.001) idx = 0; else { app.edit.cuts.unshift([0, nt]); idx = 0; } }
        app.edit.cuts[idx][1] = Math.max(nt, app.edit.cuts[idx][0] + 1 / app.fps);
        recompute();
        app.seek(nt);
        return `片頭裁到 ${fmtTC(nt)}（剪掉 ${fmtSec(nt)}）`;
      }
      const head = app.headTail().head;
      const nt = frameSnap(clamp(r.t, head + minLeft, app.dur - 1 / app.fps));
      const last = app.edit.cuts.length - 1;
      if (idx == null) { if (last >= 0 && app.edit.cuts[last][1] >= app.dur - 0.001) idx = last; else { app.edit.cuts.push([nt, r3(app.dur)]); idx = app.edit.cuts.length - 1; } }
      app.edit.cuts[idx][0] = Math.min(nt, app.edit.cuts[idx][1] - 1 / app.fps);
      recompute();
      app.seek(Math.max(0, nt - 1 / app.fps));
      return `片尾裁到 ${fmtTC(nt)}（剪掉 ${fmtSec(app.dur - nt)}）`;
    },
    up(moved) { app.gestureEnd(moved); if (moved) app.select({ kind: 'cut', id: which === 'head' ? 0 : app.edit.cuts.length - 1 }, { lane: 'main' }); },
  };
}
function dragCutEdge(i, edge) {
  app.gestureBegin();
  app.select({ kind: 'cut', id: i }, { lane: 'main' });
  return {
    move(t, y, e) {
      const c = app.edit.cuts[i];
      if (!c) return null;
      const r = snapT(t, e, { exclude: [c[edge]] });
      const min = 1 / app.fps;
      const nt = frameSnap(clamp(r.t, 0, app.dur));
      if (edge === 0) { const v = Math.min(nt, c[1] - min); for (const j of app.edit.joins) if (Math.abs(j.at - c[0]) <= JOIN_TOL) j.at = v; c[0] = v; }
      else c[1] = Math.max(nt, c[0] + min);
      recompute();
      app.seek(edge === 0 ? Math.max(0, c[0] - min) : c[1]);
      return `剪掉 ${fmtTC(c[0])} – ${fmtTC(c[1])}（${fmtSec(c[1] - c[0])}）`;
    },
    up(moved) { app.gestureEnd(moved); },
  };
}
function dragCapEdge(cue, edge) {
  const n = cue.n;
  app.gestureBegin();
  app.select({ kind: 'cue', id: n }, { lane: 'cap' });
  const k = app.cues.findIndex((q) => q.n === n);
  const prev = app.cues[k - 1], next = app.cues[k + 1];
  return {
    move(t, y, e) {
      const c = app.cues[k];
      const r = snapT(t, e, { exclude: [edge ? c.end : c.start] });
      let v = frameSnap(r.t);
      if (edge === 0) v = clamp(v, prev ? prev.end : 0, c.end - RULES.minCue);
      else v = clamp(v, c.start + RULES.minCue, next ? next.start : app.dur);
      const op = { op: 'set', n, ...(edge === 0 ? { start: r3(v) } : { end: r3(v) }) };
      const res = applyCueOp(app.cues, op, { videoDur: app.dur });
      if (res.error) return res.error;
      app.cues = res.cues;
      pushSrtOp(op);
      recompute();
      app.seek(edge === 0 ? v : Math.max(0, v - 1 / app.fps));
      const cc = app.cues[k];
      return `第 ${n} 句 ${fmtTC(cc.start)} – ${fmtTC(cc.end)}（${fmtSec(cc.end - cc.start)}）`;
    },
    up(moved) { app.gestureEnd(moved); },
  };
}
function dragVoiceVol() {
  app.gestureBegin();
  return {
    move(t, y) { const v = clamp(timeline.dbOfY('voice', y), -60, 12); app.edit.volume.voice = v; recompute(); renderHeads(); return `人聲 ${fmtDb(v)}`; },
    up(moved) { app.gestureEnd(moved); },
  };
}
function dragGainVol(i) {
  app.gestureBegin();
  app.select({ kind: 'gain', id: i }, { lane: 'voice' });
  return {
    move(t, y) { const v = clamp(r2(timeline.dbOfY('voice', y) - app.edit.volume.voice), -60, 12); app.edit.gains[i].db = Math.round(v * 2) / 2; recompute(); return `這段人聲 ${fmtDb(app.edit.gains[i].db)}`; },
    up(moved) { app.gestureEnd(moved); },
  };
}
function dragNewGain() {
  const a = app.sel.a, b = app.sel.b;
  if (app.edit.gains.some((g) => g.from < b - 0.0005 && g.to > a + 0.0005)) { toast('這個範圍和已有的人聲音量調整重疊', 'warn'); return null; }
  app.gestureBegin();
  app.edit.gains.push({ from: r3(a), to: r3(b), db: 0 });
  app.edit.gains.sort((x, y) => x.from - y.from);
  const i = app.edit.gains.findIndex((g) => Math.abs(g.from - a) < 0.001);
  app.sel = { a: null, b: null };
  return {
    move(t, y) { const v = clamp(r2(timeline.dbOfY('voice', y) - app.edit.volume.voice), -60, 12); app.edit.gains[i].db = Math.round(v * 2) / 2; recompute(); return `這段人聲 ${fmtDb(app.edit.gains[i].db)}`; },
    up(moved) { app.gestureEnd(moved); app.select({ kind: 'gain', id: i }, { lane: 'voice' }); },
  };
}
function dragGainEdge(i, edge) {
  app.gestureBegin();
  app.select({ kind: 'gain', id: i }, { lane: 'voice' });
  return {
    move(t, y, e) {
      const g = app.edit.gains[i];
      const r = snapT(t, e, { exclude: [edge ? g.to : g.from] });
      const prev = app.edit.gains[i - 1], next = app.edit.gains[i + 1];
      const v = frameSnap(r.t);
      if (edge === 0) g.from = clamp(v, prev ? prev.to : 0, g.to - 0.1); else g.to = clamp(v, g.from + 0.1, next ? next.from : app.dur);
      recompute();
      return `${fmtTC(g.from)} – ${fmtTC(g.to)}（${fmtSec(g.to - g.from)}）`;
    },
    up(moved) { app.gestureEnd(moved); },
  };
}
function dragSfx(m) {
  const id = m.segId;
  const sc = sceneById(id);
  const v0 = Number.isFinite(sc?.sfxVolume) ? sc.sfxVolume : 0;
  let y0 = null;
  app.gestureBegin();
  return {
    move(t, y) {
      if (y0 == null) y0 = y;
      const v = clamp(Math.round((v0 + (y0 - y) / 2) * 2) / 2, -60, 12);
      const i = app.scenes.findIndex((x) => x.id === id);
      const o = { ...app.scenes[i] };
      if (v === 0) delete o.sfxVolume; else o.sfxVolume = v;
      app.scenes = app.scenes.slice(); app.scenes[i] = o;
      recompute();
      return `${id} 的音效 ${fmtDb(v)}（這段的主音效＋附加音效）`;
    },
    up(moved) { app.gestureEnd(moved); if (moved) app.select({ kind: 'sfx', id }, { lane: 'sfx' }); },
  };
}

// ---------- 尋找與取代 ----------
function openFind() { $('#dlgFind').showModal(); $('#findText').focus(); renderFind(); }
function findMatches() {
  const q = $('#findText').value;
  if (!q) return [];
  return app.cues.filter((c) => c.text.includes(q));
}
function renderFind() {
  const q = $('#findText').value, rp = $('#replText').value;
  const list = findMatches();
  $('#findCount').textContent = q ? (list.length ? `找到 ${list.length} 句` : '沒有找到') : '輸入要找的字';
  $('#findAll').disabled = !list.length || rp === q;
  const hl = (s) => esc(s).split(esc(q)).join(`<mark>${esc(q)}</mark>`);
  $('#findList').innerHTML = list.slice(0, 200).map((c) => `<li data-n="${c.n}"><span class="n">#${c.n}</span>${hl(c.text)}${rp !== q ? `<br><span class="n">→</span>${esc(c.text).split(esc(q)).join(`<ins>${esc(rp)}</ins>`)}` : ''}</li>`).join('');
}
function replaceAll() {
  const q = $('#findText').value, rp = $('#replText').value;
  const list = findMatches();
  if (!list.length) return;
  const bad = list.find((c) => !c.text.split(q).join(rp).trim());
  if (bad) { toast(`第 ${bad.n} 句取代後會變成空的 → 不要的句子用「刪除」`, 'err'); return; }
  mutate(() => {
    for (const c of list) {
      const op = { op: 'set', n: c.n, text: c.text.split(q).join(rp) };
      const r = applyCueOp(app.cues, op, { videoDur: app.dur });
      if (r.error) continue;
      const before = { scenes: app.scenes };
      app.scenes = fixAnchors(before, before, app.cues, r.cues).plan.scenes;
      app.cues = r.cues;
      app.srtOps.push(op);
    }
  }, { inspector: true });
  toast(`已取代 ${list.length} 句（⌘／Ctrl＋Z 可以復原）`);
  renderFind();
}

// ---------- 元件 ----------
const sim = new SimPreview({ root: $('#sim'), video: $('#simVideo'), black: $('#simBlack'), caption: $('#simCaption'), capLayer: $('#simCapLayer'), cutBadge: $('#simCutBadge'), hint: $('#simHint'), media: $('#simMedia'), pip: $('#simPip') }, app);
const player = new PlayerPreview($('#playerHost'), app);
const timeline = new Timeline($('#tlCanvas'), $('#tlTip'), app);
Object.assign(app, { timeline, sim, player, applyReport: (r) => { applyReport(r); changed({ inspector: true }); }, save, runBuild, splitMain, splitCue, insertCue, mergeCue, deleteCue, setCue, toggleSfxMute, normalizeVoice, deleteSelection, undo, redo, openCapEditor, closeCapEditor, setMode, recompute, changed });
app.onZoom = () => { const z = $('#zoom'); if (document.activeElement !== z) z.value = String(Math.round(timeline.zoom01() * 1000)); renderStatus(); };

// 工具與按鈕
function setTool(t) { app.tool = t; $('#toolSelect').classList.toggle('on', t === 'select'); $('#toolSplit').classList.toggle('on', t === 'split'); $('#tlCanvas').classList.toggle('razor', t === 'split'); $('#stHint').textContent = t === 'split' ? '分割工具：在主軌或人聲上點一下＝在那裡切開（按 V 回到選取）' : ''; }
function toggleSnap() { app.snapOn = !app.snapOn; $('#btnSnap').classList.toggle('on', app.snapOn); $('#btnSnap').setAttribute('aria-pressed', String(app.snapOn)); renderStatus(); toast(`吸附${app.snapOn ? '開' : '關'}`, 'ok', 1000); }
function bladeKey() {
  if (app.selection?.kind === 'cue' || app.selLane === 'cap') splitCue(); else splitMain();
}
document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.closest('#inspBody') && !b.closest('dialog')) b.blur(); });
const capBtn = (id, fn) => $(id).addEventListener('click', (e) => { const b = e.currentTarget; if (b.classList.contains('is-disabled')) { toast(b.dataset.why, 'warn', 3500); return; } fn(); });
$('#btnPlay').addEventListener('click', togglePlay);
$('#btnPrevFrame').addEventListener('click', () => step(-1 / app.fps));
$('#btnNextFrame').addEventListener('click', () => step(1 / app.fps));
$('#btnHome').addEventListener('click', () => { step(0); app.seek(0); timeline.ensureVisible(0); });
$('#btnEnd').addEventListener('click', () => { step(0); app.seek(app.dur); timeline.ensureVisible(app.dur); });
$('#btnJ').addEventListener('click', () => shuttle(-1));
$('#btnL').addEventListener('click', () => shuttle(1));
$('#btnIn').addEventListener('click', setIn);
$('#btnOut').addEventListener('click', setOut);
$('#btnSave').addEventListener('click', () => save());
$('#btnBuild').addEventListener('click', () => runBuild());
$('#btnUndo').addEventListener('click', undo);
$('#btnRedo').addEventListener('click', redo);
$('#btnHelp').addEventListener('click', () => $('#dlgHelp').showModal());
$('#helpClose').addEventListener('click', () => $('#dlgHelp').close());
$('#logClose').addEventListener('click', () => $('#dlgLog').close());
$('#toolSelect').addEventListener('click', () => setTool('select'));
$('#toolSplit').addEventListener('click', () => setTool(app.tool === 'split' ? 'select' : 'split'));
$('#btnSnap').addEventListener('click', toggleSnap);
capBtn('#capAdd', () => insertCue('after'));
capBtn('#capSplit', splitCue);
capBtn('#capMerge', () => mergeCue());
capBtn('#capDel', () => deleteCue());
$('#capFind').addEventListener('click', openFind);
$('#btnSafe').addEventListener('click', () => { app.showSafe = !app.showSafe; renderOverlays(); });
$('#btnSpeaker').addEventListener('click', (e) => { if (e.currentTarget.classList.contains('is-disabled')) { toast('plan.json 沒有寫 speakerBox（講者框）', 'warn'); return; } app.showSpeaker = !app.showSpeaker; renderOverlays(); });
$('#btnFull').addEventListener('click', () => { const s = $('#stage'); if (document.fullscreenElement) document.exitFullscreen(); else s.requestFullscreen?.().catch(() => toast('瀏覽器不讓這頁全螢幕', 'warn')); });
for (const b of $$('.seg button')) b.addEventListener('click', () => { if (b.classList.contains('is-disabled')) { toast(b.dataset.tip, 'warn', 5000); return; } setMode(b.dataset.mode); });
$('#stIssues').addEventListener('click', () => { const p = $('#issuesPop'); p.hidden = !p.hidden; });
$('#btnRecheck').addEventListener('click', async () => { app.report = null; app.saveErrors = null; renderCheck(); await fetchReport(true); toast('檢查完了', 'ok', 1500); });
$('#checkList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const it = app.itemsView.find((x) => x.id === li.dataset.id);
  if (!it) { toast(`時間軸上找不到 ${li.dataset.id}`, 'warn'); return; }
  app.seek(it.start); timeline.ensureVisible(it.start, false);
  app.select({ kind: it.type === 'media' ? 'media' : 'item', id: it.id });
  $('#issuesPop').hidden = true;
});
document.addEventListener('pointerdown', (e) => { if (!$('#issuesPop').hidden && !e.target.closest('#issuesPop') && !e.target.closest('#stIssues')) $('#issuesPop').hidden = true; });
$('#conflictKeep').addEventListener('click', async () => { $('#dlgConflict').close(); banner(''); await loadState({ keep: keepState() }); toast('已載入最新的檔案，你的調整還在，再按一次「儲存」', 'warn', 5000); });
$('#conflictDrop').addEventListener('click', async () => { $('#dlgConflict').close(); banner(''); await loadState(); toast('已載入最新的檔案'); });
$('#conflictCancel').addEventListener('click', () => $('#dlgConflict').close());
$('#delPrev').addEventListener('click', () => { $('#dlgDelete').close(); if (pendingDelete) finishDelete(pendingDelete, 'prev'); pendingDelete = null; });
$('#delNext').addEventListener('click', () => { $('#dlgDelete').close(); if (pendingDelete) finishDelete(pendingDelete, 'next'); pendingDelete = null; });
$('#delCancel').addEventListener('click', () => { $('#dlgDelete').close(); pendingDelete = null; });
$('#findText').addEventListener('input', renderFind);
$('#replText').addEventListener('input', renderFind);
$('#findAll').addEventListener('click', replaceAll);
$('#findClose').addEventListener('click', () => $('#dlgFind').close());
$('#findList').addEventListener('click', (e) => { const li = e.target.closest('li[data-n]'); if (!li) return; const c = app.cues.find((q) => q.n === Number(li.dataset.n)); if (c) { app.seek(c.start); timeline.ensureVisible(c.start, false); app.select({ kind: 'cue', id: c.n }, { lane: 'cap' }); } });
$('#coachClose').addEventListener('click', () => { $('#coach').hidden = true; storage.set(COACH_KEY, '1'); });
// 屬性面板
$('#inspBody').addEventListener('input', onInspInput);
$('#inspBody').addEventListener('change', onInspChange);
$('#inspBody').addEventListener('click', onInspClick);
$('#inspBody').addEventListener('dblclick', (e) => { const r = e.target.closest('input[type="range"]'); if (!r) return; r.value = r.dataset.f === 'fadeIn' || r.dataset.f === 'fadeOut' ? '0' : '0'; r.dispatchEvent(new Event('input', { bubbles: true })); });
const caretTrack = (e) => { if (e.target.id === 'capText') e.target.dataset.caret = String(e.target.selectionStart); };
for (const ev of ['keyup', 'click', 'select']) $('#inspBody').addEventListener(ev, caretTrack);
// 軌頭
$('#tlHeads').addEventListener('click', (e) => {
  const m = e.target.closest('[data-mute]'), l = e.target.closest('[data-lock]');
  if (m) {
    const k = m.dataset.mute;
    mutate(() => {
      if (app.trackMuted(k)) app.edit.volume[k] = app.tracks[k].prev ?? 0;
      else { app.tracks[k].prev = app.edit.volume[k]; app.edit.volume[k] = -60; }
    }, { inspector: true });
    toast(`${TRACK_NAMES[k]}${app.trackMuted(k) ? '已靜音（成片也不會有）' : '取消靜音'}`, 'ok', 1500);
  } else if (l) { const k = l.dataset.lock; app.tracks[k].lock = !app.tracks[k].lock; renderHeads(); timeline.invalidate(); }
  else { const th = e.target.closest('.th'); if (th && TRACK_NAMES[th.dataset.lane]) { app.selLane = th.dataset.lane; renderHeads(); timeline.invalidate(); } }
});
// 軌頭的 dB：上下拖＝調整（每 2px 0.5 dB），點一下＝輸入數字
$('#tlHeads').addEventListener('pointerdown', (e) => {
  const inp = e.target.closest('input.db');
  if (!inp || e.button !== 0) return;
  const k = inp.dataset.db, y0 = e.clientY, v0 = app.edit.volume[k];
  let moved = false;
  const mv = (ev) => {
    if (!moved && Math.abs(ev.clientY - y0) < 3) return;
    if (!moved) { moved = true; app.gestureBegin(); inp.blur(); }
    ev.preventDefault();
    app.edit.volume[k] = clamp(Math.round((v0 + (y0 - ev.clientY) / 4) * 2) / 2, -60, 12);
    inp.value = String(app.edit.volume[k]);
    recompute(); timeline.invalidate();
  };
  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) { app.gestureEnd(true); renderHeads(); } };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
});
$('#tlHeads').addEventListener('change', (e) => {
  const k = e.target.dataset.db; if (!k) return;
  const v = clamp(Number(e.target.value) || 0, -60, 12);
  mutate(() => { app.edit.volume[k] = v; }, { inspector: true });
  e.target.blur();
});
// 時間碼
$('#tc').addEventListener('click', () => { const i = $('#tcInput'); i.hidden = false; $('#tc').hidden = true; i.value = fmtTC(app.t); i.focus(); i.select(); });
$('#tcInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const t = parseTC(e.target.value); if (t == null) toast('看不懂這個時間：寫成 00:01:23:10、1:23 或 83.5', 'warn'); else { step(0); app.seek(t); timeline.ensureVisible(t, false); } e.target.blur(); }
  else if (e.key === 'Escape') e.target.blur();
  e.stopPropagation();
});
$('#tcInput').addEventListener('blur', () => { $('#tcInput').hidden = true; $('#tc').hidden = false; renderTimes(); });
// 時間軸上的字幕編輯框
$('#capEditor').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeCapEditor(true); } else if (e.key === 'Escape') { e.preventDefault(); closeCapEditor(false); } e.stopPropagation(); });
$('#capEditor').addEventListener('blur', () => closeCapEditor(true));
// 縮放
$('#zoom').addEventListener('input', (e) => timeline.setZoom01(Number(e.target.value) / 1000));
$('#zoom').addEventListener('change', (e) => e.target.blur());
$('#zoomIn').addEventListener('click', () => timeline.zoomTo(timeline.pps * 1.6));
$('#zoomOut').addEventListener('click', () => timeline.zoomTo(timeline.pps / 1.6));
$('#zoomFit').addEventListener('click', () => timeline.fit());
// 提示（data-tip；停用的按鈕也看得到原因）
let tipTimer = null, tipEl = null;
document.addEventListener('pointerover', (e) => {
  const el = e.target.closest('[data-tip], [data-why]');
  if (el === tipEl) return;
  tipEl = el; clearTimeout(tipTimer); $('#tipBox').hidden = true;
  if (!el) return;
  const txt = (el.classList.contains('is-disabled') && el.dataset.why) ? `${el.dataset.tip && el.dataset.tip !== el.dataset.why ? `${el.dataset.tip}\n` : ''}不能用：${el.dataset.why}` : el.dataset.tip;
  if (!txt) return;
  tipTimer = setTimeout(() => {
    const box = $('#tipBox');
    box.textContent = txt; box.style.whiteSpace = 'pre-line'; box.hidden = false;
    const r = el.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = `${clamp(r.left + r.width / 2 - w / 2, 6, innerWidth - w - 6)}px`;
    box.style.top = `${r.bottom + 6 + h > innerHeight ? r.top - h - 6 : r.bottom + 6}px`;
  }, 380);
});
document.addEventListener('pointerdown', () => { clearTimeout(tipTimer); $('#tipBox').hidden = true; tipEl = null; });

// 鍵盤
// ---------- 修改單（右側抽屜）：選段 → 點想怎麼改、寫描述（直接存）→ 累積多段 → 複製一行指令給 AI（待改的完整內容存 work/feedback/editor-requests.md）----------
// 剪輯只能改字、刪清單項目；要加項目、換動畫、重新排版都寫在這裡，AI 照「照剪輯修改單改」直接改（每段一個子代理）
// 一段一筆 { id, tags, note, t（最後改的時間）, done?: { round, note } }：有勾或有描述才算一筆；改了就變回待改
const RQ_TAGS = {
  anim: ['流程更細節', '以圖像展示為主', '文字少一點', '畫出關係（箭頭、引線）', '換一種動畫', '動作慢一點', '跟講的話對齊', '更有質感'],
  media: ['標註更清楚', '推近到操作區', '加步驟清單', '換成動畫', '換一段錄影', '跟講的話對齊'],
};
const rqKey = () => `editor-requests:${app.server?.project?.dir || ''}`;
const rqKind = (sc) => (segType(sc) === 'media' ? 'media' : 'anim');
let rqClearArm = false, rqMarks = '';
function rqLoad() {
  try { const v = JSON.parse(localStorage.getItem(rqKey()) || '[]'); app.requests = Array.isArray(v) ? v.filter((x) => isObj(x) && x.id) : []; } catch { app.requests = []; }
}
function rqStore() { try { localStorage.setItem(rqKey(), JSON.stringify(app.requests)); } catch { /* 無痕視窗：只留在這個分頁 */ } }
function rqSegOf(sel) { return sel && (sel.kind === 'item' || sel.kind === 'media' || sel.kind === 'sfx') ? sel.id : null; }
// 一段的資訊：名稱、動畫是什麼、成片時間、plan.json 的起訖、對應字幕
function rqInfo(id) {
  const it = app.itemsView.find((x) => x.id === id), sc = sceneById(id);
  if (!sc) return null;
  const type = segType(sc);
  const def = type === 'scene' ? findSceneDef(app.server?.schema?.scenes, sc.scene) : type === 'fx' ? findFxDef(app.server?.schema?.fx, sc.fx) : null;
  const what = type === 'scene' ? `資訊卡 ${sc.scene}${def?.zh ? `（${def.zh}）` : ''}`
    : type === 'fx' ? `字卡動態 ${sc.fx}${def?.zh ? `（${def.zh}）` : ''}`
    : type === 'custom' ? `自訂動畫${sc.layout ? `（${sc.layout}）` : ''}`
    : `${app.mediaSeg(id)?.kind === 'image' ? '圖片' : '螢幕錄影'} ${String(sc.src || '').split('/').pop()}`;
  // 修改單寫從工作區根目錄起算的路徑（AI 在根目錄執行，不用猜相對誰）：custom 的 src 相對 work/hyperframes，media 的 src 相對專案
  const pd = app.server?.project?.dir || '';
  const file = !sc.src ? null : type === 'custom' ? `${pd}/work/hyperframes/${sc.src}` : type === 'media' ? `${pd}/${sc.src}` : null;
  const subs = it ? app.cues.filter((c) => c.end > it.start + 0.05 && c.start < it.end - 0.05) : [];
  return { id, it, sc, type, label: it?.label || '', what, file, out: it ? [outOf(it.start, app.edit.cuts), outOf(it.end, app.edit.cuts)] : null,
    span: `${fmtTime(sc.from ?? sc.at)} → ${fmtTime(sc.to ?? (sc.duration != null ? `+${sc.duration} 秒` : '預設長度'))}`, subs };
}
const rqMs = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;   // 分:秒.十分之一（給 AI 看，不用格數）
const rqTime = (inf) => (inf.out ? `${rqMs(inf.out[0])}–${rqMs(inf.out[1])}` : '—');
// 已送出＝這段在 editor-requests.md 裡，而且複製之後沒再改過
const rqSent = (r) => { const q = app.server?.requests; return !r.done && !!q && q.ids.includes(r.id) && q.at > (r.t || 0); };
// 改完了沒：伺服器讀 r<N>.md「改了哪幾段」（比 editor-requests.md 新的才算）；送出後沒再改過的段才算數。
// 記在瀏覽器（r.done）：下次複製只送待改的，修改單檔換掉了也還記得哪些改完
function rqSync() {
  const q = app.server?.requests;
  if (!q) return;
  let ch = false;
  for (const r of app.requests) {
    const d = rqSent(r) ? q.done[r.id] : null;
    if (d) { r.done = { round: d.round, note: d.note }; ch = true; }
  }
  if (ch) rqStore();
}
const rqPending = () => app.requests.filter((r) => !r.done);
// 時間軸標記（timeline.js 畫）：✎ 待改、✓ 已改完
app.rqMark = (id) => { const r = app.requests.find((x) => x.id === id); return r ? (r.done ? 'done' : 'todo') : null; };
// 直接存：點標籤或打字就寫進清單；勾選和描述都清空就拿掉；改過的已改完段變回待改
function rqEdit(id, fn) {
  let r = app.requests.find((x) => x.id === id);
  const made = !r;
  if (made) { r = { id, tags: [], note: '' }; app.requests.push(r); }
  fn(r); r.t = Date.now(); delete r.done;
  if (!r.tags.length && !r.note.trim()) app.requests = app.requests.filter((x) => x !== r);
  else if (made) toast(`${id} 加進修改單（待改 ${rqPending().length} 段）`, 'ok', 1800);
  rqStore();
}
function rqStateHtml(id) {
  const r = app.requests.find((x) => x.id === id);
  if (!r) return '<p class="ip-note">點一個想怎麼改、或寫描述，就會存進修改單（不用按儲存）。</p>';
  const del = `<button class="small ghost" data-rq="del" data-id="${esc(id)}">拿掉這段</button>`;
  if (r.done) return `<div class="rq-state done"><div><span class="rq-done">✓ 已改完（${esc(r.done.round)}）</span><div class="what">${esc(r.done.note)}</div><p class="ip-note">再點標籤或改描述＝變回待改，下次複製會再送。</p></div>
    <div class="ip-btns"><button class="small primary" data-rq="result" data-id="${esc(id)}">▶ 看結果</button>${del}</div></div>`;
  return `<div class="rq-state"><span class="ip-note">${rqSent(r) ? '已送出，等 AI 改' : '待改：已存進修改單'}</span>${del}</div>`;
}
function rqTopHtml(id) {
  const inf = id ? rqInfo(id) : null;
  if (!inf) return '<p class="ip-note">在時間軸點一段動畫或螢幕錄影，在這裡點想怎麼改、或自己寫（直接存）；可以累積很多段，最後一起複製給 AI。</p>';
  const on = app.requests.find((x) => x.id === id)?.tags || [];
  return `<div class="rq-seg"><div class="t">${esc(inf.id)}　${esc(inf.label)}</div><div class="m">${esc(inf.what)}<br>成片 ${rqTime(inf)}</div></div>
    ${inf.subs.length ? `<ul class="rq-subs">${inf.subs.map((c) => `<li><span class="n">#${c.n}</span>${esc(c.text)}</li>`).join('')}</ul>` : '<p class="ip-note">這段時間沒有字幕</p>'}
    <div class="rq-tags" role="group" aria-label="想怎麼改">${RQ_TAGS[rqKind(inf.sc)].map((t) => `<button class="toggle small${on.includes(t) ? ' on' : ''}" data-rq="tag" data-t="${esc(t)}" aria-pressed="${on.includes(t)}">${esc(t)}</button>`).join('')}</div>
    <textarea id="rqNote" rows="4" placeholder="自己描述（選填）：例如「三個步驟改成手機畫面一步步亮起」">${esc(app.requests.find((x) => x.id === id)?.note || '')}</textarea>
    <div id="rqState">${rqStateHtml(id)}</div>`;
}
function rqListsHtml(cur) {
  const pend = rqPending(), done = app.requests.filter((r) => r.done);
  const lab = (r) => { const i = rqInfo(r.id); return i ? esc(i.label) : '<span class="gone">plan.json 裡找不到這段</span>'; };
  const go = (r) => `<button class="small ghost" data-rq="go" data-id="${esc(r.id)}" data-tip="跳到這段">↗</button>`;
  const del = (r) => `<button class="small ghost" data-rq="del" data-id="${esc(r.id)}" data-tip="從修改單拿掉" aria-label="拿掉 ${esc(r.id)}">✕</button>`;
  const pi = pend.map((r) => `<li class="rq-item${r.id === cur ? ' cur' : ''}"><div class="h"><b>${esc(r.id)}</b><span class="lab">${lab(r)}</span>${rqSent(r) ? '<span class="rq-sent" data-tip="已複製給 AI，等它改完">已送出</span>' : ''}${go(r)}${del(r)}</div>
    ${r.tags.length ? `<div class="chips">${r.tags.map((t) => `<span class="chip-t">${esc(t)}</span>`).join('')}</div>` : ''}${r.note.trim() ? `<div class="note">${esc(r.note.trim())}</div>` : ''}</li>`).join('');
  const di = done.map((r) => `<li class="rq-item done${r.id === cur ? ' cur' : ''}"><div class="h"><b>✓ ${esc(r.id)}</b><span class="lab">${lab(r)}</span><span class="rq-done">${esc(r.done.round)}</span>
    <button class="small primary" data-rq="result" data-id="${esc(r.id)}" data-tip="切到成片預覽，跳到這段開頭">▶ 看結果</button>${del(r)}</div><div class="what" data-tip="${esc(r.done.note)}">${esc(r.done.note)}</div></li>`).join('');
  return `<section class="ip-sec"><h3>待改（${pend.length}）</h3>${pi ? `<ul class="rq-list">${pi}</ul>` : `<p class="ip-note">${done.length ? '都改完了' : '還沒有'}</p>`}</section>`
    + (di ? `<section class="ip-sec"><h3>已改完（${done.length}）</h3><ul class="rq-list">${di}</ul></section>` : '');
}
function renderRequests() {
  rqSync();
  const pend = rqPending();
  $('#rqCount').textContent = pend.length ? String(pend.length) : '';
  const marks = app.requests.map((r) => `${r.id}${r.done ? '✓' : '✎'}`).join();
  if (marks !== rqMarks) { rqMarks = marks; timeline.invalidate(); }
  const open = !$('#requests').hidden;
  $('#btnRequests').setAttribute('aria-pressed', String(open));
  if (!open) return;
  const id = rqSegOf(app.selection), top = $('#rqTop');
  // 正在打描述：不重畫輸入框（會丟游標、打斷注音），只更新狀態列
  if (document.activeElement?.id === 'rqNote' && top.dataset.id === (id || '')) $('#rqState').innerHTML = rqStateHtml(id);
  else { top.dataset.id = id || ''; top.innerHTML = rqTopHtml(id); }
  $('#rqLists').innerHTML = rqListsHtml(id);
  $('#rqFoot').innerHTML = `<button class="primary${pend.length ? '' : ' is-disabled'}" data-rq="copy" data-why="${app.requests.length ? '沒有待改的段（已改完的不會再送）' : '修改單是空的'}">複製給 AI（${pend.length} 段待改）</button>
    <p class="ip-note">只送待改的段。複製的是一行指令；完整內容存在 ${esc(app.server?.project?.dir || '')}/work/feedback/editor-requests.md，AI 會讀這個檔。</p>
    ${app.requests.length ? `<button class="small ghost" data-rq="clear">${rqClearArm ? '再按一次清空' : '清空修改單'}</button>` : ''}`;
}
// 複製給 AI 的只有這一行（待改的完整內容存在 editor-requests.md，AI 讀檔）
const rqCommand = () => `照剪輯修改單改這 ${rqPending().length} 段（${app.server?.project?.dir || ''}/work/feedback/editor-requests.md）：直接做，不用先出提案；每段派一個子代理平行改，全部回來後 build、audit，停在停點 ④。`;
function rqMarkdown() {
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
  const L = ['# 剪輯修改單', '', rqCommand(), '',
    `（${stamp} 從剪輯複製）`];
  rqPending().forEach((r, k) => {
    const i = rqInfo(r.id);
    L.push('', `## ${k + 1}. ${r.id}${i?.label ? `　${i.label}` : ''}`);
    if (!i) { L.push('- plan.json 裡找不到這段（可能被改名或刪掉了）'); }
    else L.push(`- 動畫：${i.what}`, ...(i.file ? [`- 檔案：${i.file}`] : []), `- 成片時間：${rqTime(i)}（${app.server?.project?.dir || ''}/work/hyperframes/plan.json：${i.span}）`);
    if (r.tags.length) L.push(`- 要改：${r.tags.join('、')}`);
    if (r.note.trim()) L.push(`- 描述：${r.note.trim().replace(/\s*\n\s*/g, '／')}`);
    if (i?.subs.length) { L.push('- 對應字幕：'); for (const c of i.subs) L.push(`  - #${c.n} ${c.text}`); }
  });
  return L.join('\n') + '\n';
}
// 先存檔（完整修改單），存成功才複製那一行指令：存失敗時剪貼簿不會指到舊檔
async function rqCopy() {
  const n = rqPending().length;
  const r = await api('POST', '/api/requests', { markdown: rqMarkdown() });
  const saved = r.ok ? r.data?.file : null;
  if (!saved) { toast(`修改單存檔失敗：${r.data?.message || r.status}`, 'err', 7000); return; }
  const cmd = rqCommand();
  let copied = false;
  try { await navigator.clipboard.writeText(cmd); copied = true; } catch {
    const ta = document.createElement('textarea'); ta.value = cmd; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    ta.remove();
  }
  if (copied) toast(`${n} 段存到 ${saved}，指令已複製 → 貼給 AI`, 'ok', 6000);
  else toast(`${n} 段存到 ${saved}，但沒辦法寫進剪貼簿 → 跟 AI 說「照剪輯修改單改」`, 'warn', 7000);
}
function onRqClick(e) {
  const b = e.target.closest('[data-rq]');
  if (!b) return;
  if (b.classList.contains('is-disabled')) { if (b.dataset.why) toast(b.dataset.why, 'warn', 3000); return; }
  const act = b.dataset.rq;
  if (act !== 'clear') rqClearArm = false;
  if (act === 'tag') {
    const id = $('#rqTop').dataset.id, t = b.dataset.t;
    if (!id) return;
    rqEdit(id, (r) => { r.tags = r.tags.includes(t) ? r.tags.filter((x) => x !== t) : [...r.tags, t]; });
    renderRequests();
    return;
  }
  if (act === 'del') { app.requests = app.requests.filter((x) => x.id !== b.dataset.id); rqStore(); renderRequests(); return; }
  if (act === 'go') {
    const it = app.itemsView.find((x) => x.id === b.dataset.id);
    if (!it) { toast('plan.json 裡找不到這段', 'warn'); return; }
    app.select({ kind: it.type === 'media' ? 'media' : 'item', id: it.id }); app.seek(it.start + 0.05);
    return;
  }
  if (act === 'result') {
    const it = app.itemsView.find((x) => x.id === b.dataset.id);
    if (!it) { toast('plan.json 裡找不到這段', 'warn'); return; }
    app.select({ kind: it.type === 'media' ? 'media' : 'item', id: it.id });
    return setMode('player', { focus: it.start + 0.05 });
  }
  if (act === 'copy') return rqCopy();
  if (act === 'clear') {
    if (!rqClearArm) { rqClearArm = true; renderRequests(); return; }
    rqClearArm = false; app.requests = []; rqStore(); renderRequests();
  }
}
function setRequestsOpen(open) {
  $('#requests').hidden = !open;
  $('#workspace').classList.toggle('with-rq', open);
  try { localStorage.setItem('editor-requests-open', open ? '1' : '0'); } catch { /* 只是記住開關 */ }
  renderRequests();
}
$('#rqBody').addEventListener('click', onRqClick);
$('#rqFoot').addEventListener('click', onRqClick);
$('#rqBody').addEventListener('input', (e) => {
  const id = $('#rqTop').dataset.id;
  if (e.target.id !== 'rqNote' || !id) return;
  rqEdit(id, (r) => { r.note = e.target.value; });
  renderRequests();
});
$('#btnRequests').addEventListener('click', () => setRequestsOpen($('#requests').hidden));
$('#btnRqClose').addEventListener('click', () => setRequestsOpen(false));

document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox'].includes(e.target.type));
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && k === 's') { e.preventDefault(); save(); return; }
  if (mod && k === 'f' && !document.querySelector('dialog[open]')) { e.preventDefault(); openFind(); return; }
  if (mod && (k === 'z' || k === 'y') && !typing) { e.preventDefault(); if (k === 'y' || e.shiftKey) redo(); else undo(); return; }
  if (mod && k === 'b' && !typing) { e.preventDefault(); bladeKey(); return; }
  if (typing || mod || e.altKey) return;
  if (document.querySelector('dialog[open]') || !$('#coach').hidden) return;
  switch (k) {
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'k': stopShuttle(); engine().pause(); break;
    case 'j': shuttle(-1); break;
    case 'l': shuttle(1); break;
    case 'ArrowLeft': e.preventDefault(); step(e.shiftKey ? -1 : -1 / app.fps); break;
    case 'ArrowRight': e.preventDefault(); step(e.shiftKey ? 1 : 1 / app.fps); break;
    case 'ArrowUp': e.preventDefault(); jumpPoint(-1); break;
    case 'ArrowDown': e.preventDefault(); jumpPoint(1); break;
    case 'i': setIn(); break;
    case 'o': setOut(); break;
    case 'v': setTool('select'); break;
    case 'b': bladeKey(); break;
    case 's': toggleSnap(); break;
    case 'f': $('#btnFull').click(); break;
    case 'Enter': if (selectedCue()) { e.preventDefault(); openCapEditor(selectedCue().n); } break;
    case 'Delete': case 'Backspace': e.preventDefault(); deleteSelection(); break;
    case 'Escape': app.sel = { a: null, b: null }; app.select(null); setTool('select'); $('#issuesPop').hidden = true; break;
    case '+': case '=': timeline.zoomTo(timeline.pps * 1.6); break;
    case '-': case '_': timeline.zoomTo(timeline.pps / 1.6); break;
    case 'z': if (e.shiftKey) timeline.fit(); break;
    case '?': $('#dlgHelp').showModal(); break;
    case 'Home': e.preventDefault(); step(0); app.seek(0); timeline.ensureVisible(0); break;
    case 'End': e.preventDefault(); step(0); app.seek(app.dur); timeline.ensureVisible(app.dur); break;
    default: return;
  }
});
window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

// ---------- 開始 ----------
(async () => {
  renderCheck(); renderMode();
  await loadState();
  requestAnimationFrame(frame);
  setInterval(pollVersion, 2500);
  if (!storage.get(COACH_KEY)) $('#coach').hidden = false;
})();

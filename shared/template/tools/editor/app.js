// 剪輯台主程式：載入狀態、以選取為中心的屬性面板、時間軸操作（裁剪、分割、音量線、字幕）、復原、自動存檔、更新預覽、鍵盤
import { groupIssues, issueId, hideKey, plainText, splitHidden } from './issues.mjs';
import {
  defaultEdit, normEdit, mergeCuts, cutTotal, outOf, cutIndexAt, joinPoints, joinFor, cleanJoins, joinOutTimes,
  fmt, fmtTC, fmtFine, parseTC, fmtSec, fmtDb, fmtDbShort, clamp, r3, dbToGain, gainAt, JOIN_TOL, DIP_DEFAULT, TC_FPS, lookCss,
} from './model.mjs';
import { applyCueOp, remapPlan, fixAnchors, refsTo, refTime, replay, canInsert, canSplit, canMerge, gapAround, splitPos, anchorFor, parseRef, RULES } from './subtitles.mjs';
import { visibleLen, richPlain, lineLens, splitItem, joinItem, parseAttrs, findSceneDef, findFxDef } from './text.mjs';
import { Timeline, LANES, TRACK_NAMES } from './timeline.js';
import { SPEEDS, speedLabel, modelOf, fieldsOf, knotsOf, zoneAt, cutAt, setRate, freezeAt, joinAt, isPlain, trimModel } from './speed.mjs';
import { transitionOf, speedSummary } from './motion.mjs';
import { SimPreview, PlayerPreview } from './preview.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const r2 = (n) => Math.round(n * 100) / 100;
const TRANS = [['cut', '直接切'], ['fade', '淡入淡出'], ['slide', '滑入滑出'], ['zoom', '縮放'], ['whip', '甩鏡']];
const JOIN_TYPES = [['none', '無'], ['dip', '過黑'], ['punch', '放大']];
const KIND_ZH = { cut: '你剪掉的範圍', ng: 'NG 重錄（剪乾淨時剪掉）', pause: '停頓（剪乾淨時剪掉）' };
// 給人看的名詞只有三個：字卡（模板版面）、動畫、素材（錄影、圖片）。修改單給 AI 的那一行才寫內部名稱（rqInfo 的 what）
const TYPE_ZH = { scene: '字卡', fx: '字卡', custom: '動畫', media: '素材' };
const SEG_KEYS = { common: ['sfxVolume', 'sfx'], media: ['enter', 'exit', 'volume', 'from', 'to', 'in', 'out', 'speed', 'hold', 'retime', 'anchor'], scene: ['slots'], custom: ['slots'], fx: ['vars'] };
// 初剪預覽：plan.json 在了、還沒排段落。可以看字幕、改字；卡片和動畫要等分鏡
const roughStage = () => !!app.server?.plan?.exists && !app.server.plan.error && !app.scenes.some(isObj);
const SPEED_KEYS = ['in', 'out', 'speed', 'hold', 'retime'];   // 畫面速度的欄位：拿掉要明講（寫 null）
const COACH_KEY = 'auto-edit-editor.coach.v2';
const COACH_FINAL_KEY = 'auto-edit-editor.coach-final.v1';
const COACH_ROUGH_KEY = 'auto-edit-editor.coach-rough.v1';
const AUTOSAVE_MS = 1000;   // 停手多久就自動存
const CHECK_MS = 4000;      // 存檔後多久跑檢查（長片一次要 9 秒，連續改的時候不要一直跑）

// ---------- 狀態 ----------
const app = {
  server: null, dur: 0, fps: 30,
  plan0: null, cues0: [], scenes: [], cues: [], srtOps: [],
  edit: defaultEdit(), savedEdit: defaultEdit(), base: null, sfxMemory: {}, canStash: false,
  splits: [], sel: { a: null, b: null }, selection: null, selLane: null,
  report: null, reportReady: false, auditIssues: null, hiddenChecks: new Set(), requests: [], items: [], itemsView: [], animRows: 1, itemsHint: '檢查中…', sfxView: [], moodView: [], pieces: [], points: [],
  voiceOnly: [], voiceUncovered: [], uncovered: [], look: null, savedLook: null, lookPrev: {}, lookCss: 'none', theme: 'light', savedTheme: 'light', cutpoints: [], peaks: null, peaksHint: '波形計算中…', thumbs: {}, snapOn: true, tool: 'select',
  tracks: { anim: {}, media: {}, main: {}, cap: {}, voice: {}, sfx: {} },
  undoStack: [], redoStack: [], savedSnap: '', lastCoalesce: null, gesture: null, busy: false, building: false,
  side: 'insp', t: 0, mode: 'sim', stopAt: null, outDur: 0, ver: 0, drawRequested: true, rate: 0, loud: null,
  // 畫布（009 FR-120）：/api/state 的 canvas（server 用 lib/canvas.mjs 算）；還沒載入時當橫式
  canvas() { return this.server?.canvas || { format: 'landscape', W: 1920, H: 1080, maxChars: RULES.capMax }; },
};
window.__editor = app;
const capMax = () => app.canvas().maxChars;
let rqLoaded = false;   // 除錯與實測用

// ---------- 小工具 ----------
async function api(method, url, body, { keepalive = false } = {}) {
  try {
    const r = await fetch(url, { method, keepalive, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { message: '連不到剪輯台（可能已經關掉了）→ 請 AI 重新啟動剪輯台後重新整理頁面' } };
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
// 一段在講什麼：時間軸、段落清單、現在這段都用這一句，不用檔名
const segTitle = (sc) => String(sc?.story?.say || sc?.story?.idea || '').trim();
const customDef = (sc) => app.server?.schema?.custom?.find((x) => x.template === sc?.template) || null;
// 這段是什麼：內容設計動畫、模板動畫：主體四周貼標籤、自訂動畫（AI 手寫的）
const customKind = (sc) => (sc?.design ? '動畫（為這段設計）' : sc?.template ? `動畫：${customDef(sc)?.zh || sc.template}` : '動畫');
// 時間綁在哪裡的白話：第 12 句、第 12 句結尾、第 12 句講到「手機」
function refZh(v) {
  if (typeof v !== 'string') return Number.isFinite(v) ? `${r2(v)} 秒` : '—';
  const m = /^#(\d+)(e?)(?:@(.+?))?(?:([+-])([\d.]+))?$/.exec(v);
  if (!m) return v;
  return `第 ${m[1]} 句${m[2] ? '結尾' : ''}${m[3] ? `講到「${m[3]}」` : ''}${m[4] ? `${m[4] === '+' ? '後' : '前'} ${m[5]} 秒` : ''}`;
}
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
// 快照記著它是對哪一版檔案算的（base）：自動存檔之後檔案已經往前走，復原時要先把檔案換回那一版
const snapshot = () => JSON.stringify({ base: app.base, edit: app.edit, scenes: editableScenes(), ops: app.srtOps, cues: app.cues, splits: app.splits, look: app.look, theme: app.theme });
const dirtySnap = () => JSON.stringify({ edit: app.edit, scenes: editableScenes(), ops: app.srtOps, look: app.look, theme: app.theme });
const isDirty = () => app.savedSnap !== '' && dirtySnap() !== app.savedSnap;

function normalize() {
  app.edit.cuts = mergeCuts(app.edit.cuts);
  cleanJoins(app.edit, app.cutpoints, app.dur);
  app.edit.gains = app.edit.gains.filter((g) => g.to - g.from >= 0.05).sort((a, b) => a.from - b.from);
  app.splits = [...new Set(app.splits.map(r3))].filter((t) => t > 0.001 && t < app.dur - 0.001 && cutIndexAt(t, app.edit.cuts) < 0 && !app.edit.cuts.some(([a, b]) => Math.abs(t - a) < 0.01 || Math.abs(t - b) < 0.01)).sort((a, b) => a - b);
}
// 復原、重做正在換檔案（等伺服器那一下）：先不收新的修改，不然回應到了會被換掉、重做也拿不回來
const historyBlocked = () => { if (!app.historyBusy) return false; toast('正在復原，等一下再改', 'warn', 1500); return true; };
function mutate(fn, { coalesce = null, inspector = false } = {}) {
  if (historyBlocked()) return false;
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
// 復原、重做：一次一步，照順序（換檔案要等伺服器）
let historyQueue = Promise.resolve();
const sameBase = (a, b) => !!a && !!b && a.hash === b.hash && (a.srtHash ?? null) === (b.srtHash ?? null);
async function stepHistory(from, to, done) {
  await savePromise;
  if (!from().length) return;
  if (app.gesture) { toast('放開滑鼠再復原', 'warn', 2000); return; }
  const target = from().pop(), o = JSON.parse(target);
  let here = snapshot();
  if (!sameBase(o.base, app.base)) {
    clearTimeout(saveTimer);
    app.busy = true;
    app.historyBusy = true;
    setSaveState('busy', '復原中…');
    let r;
    try { r = await api('POST', '/api/restore', { base: app.base, to: o.base }); } finally { app.busy = false; app.historyBusy = false; }
    // 等回應時還是動到了（例如中文選字剛好送出）：算進「回到這裡」，重做拿得回來，不會憑空不見
    here = snapshot();
    if (!r.ok) {
      // 檔案被別人改過、或版本已經不在：這一步（和更早的）回不去。其他（輸出中、一時連不到）等一下還能再按
      if (r.status === 410 || r.data?.error === 'conflict') from().length = 0;
      else from().push(target);
      renderHeader();
      toast(r.data?.message || '這一步回不去了', 'warn', 5000);
      return;
    }
    applySaved(r.data);
    app.saveSeq++;
    if (app.server?.preview?.built) app.server.preview.stale = true;
    scheduleCheck();
  }
  to().push(here);
  restore(target);
  renderMode();
  toast(done, 'ok', 1200);
}
const historyFailed = (e) => { app.busy = false; renderHeader(); toast(`復原沒有成功：${e.message}`, 'err', 5000); };
function undo() { historyQueue = historyQueue.then(() => stepHistory(() => app.undoStack, () => app.redoStack, '已復原')).catch(historyFailed); return historyQueue; }
function redo() { historyQueue = historyQueue.then(() => stepHistory(() => app.redoStack, () => app.undoStack, '已重做')).catch(historyFailed); return historyQueue; }

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
      o.enterNow = same(sc.enter, sb?.enter) ? it.enter ?? null : sc.enter ?? null;
      o.exitNow = same(sc.exit, sb?.exit) ? it.exit ?? null : sc.exit ?? null;
      Object.assign(o, { in: Number.isFinite(sc.in) ? sc.in : 0, speed: Number.isFinite(sc.speed) ? sc.speed : 1, volume: sc.volume === undefined ? null : sc.volume,
        enter: sc.enter ?? null, exit: sc.exit ?? null, mediaKind: m?.kind || 'video', srcName: String(sc.src || '').split('/').pop(), srcDur: m?.info?.dur ?? null,
        knots: speedDirty(sc, sb) || !same(sc.from, sb?.from) || !same(sc.to, sb?.to) ? knotsOf(speedModel(sc, o.end - o.start, o.start, null), m?.info?.dur ?? null) : it.out?.annotations?.knots ?? null,
        pipShift: it.out?.pipShift ?? null });
    }
    o.inCut = app.edit.cuts.some(([a, b]) => o.start < b && o.end > a);
    o.title = segTitle(sc) || segFallback(sc, o);
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
// 這段沒有寫在講什麼時的名稱：不露檔名（x-design-d0101.html）和版型編號（07 重點字卡）
function segFallback(sc, o) {
  if (o.type === 'media') return o.srcName || o.label;
  if (o.type === 'custom') return sc?.template ? customDef(sc)?.zh || '動畫' : '動畫';
  return String(o.label || '').replace(/^\s*\S*\d\S*\s+/, '') || TYPE_ZH[o.type] || '';
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

// 正在屬性面板打字：不重畫（會丟游標、打斷注音）
function typingInInspector() {
  const a = document.activeElement;
  return !!a && $('#inspBody').contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['range', 'checkbox'].includes(a.type)));
}
function changed({ inspector = false } = {}) {
  recompute();
  if (timeline.setAnimRows(app.animRows)) rebuildHeads();
  updateLookCss();
  if (app.selection && !selectionExists(app.selection)) app.selection = null;
  renderHeader(); renderTimes(); renderStatus(); renderHeads(); renderCapButtons();
  if (inspector && !typingInInspector()) renderInspector();
  renderSideSoon();
  timeline.invalidate();
  if (isDirty()) scheduleAutosave();
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
  renderInspector(); renderHeads(); renderCapButtons(); renderStatus(); renderRequests(); renderSideSoon();
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
function tipMotion(it) {
  const tr = transitionOf(it), sp = speedSummary(it.knots);
  return `${tr.inText || tr.outText ? `\n進場 ${tr.inText || '—'}｜出場 ${tr.outText || '—'}` : ''}${sp ? `\n畫面速度：${sp}` : ''}`;
}
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
  // 已經送出去存的那幾步不能再改（存好就從清單拿掉了）
  if (op.op === 'set' && last?.op === 'set' && last.n === op.n && app.srtOps.length > (app.opsInFlight || 0)) Object.assign(last, op);
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
    if (fx.changed.length && !quiet) toast(`${fx.changed.join('、')} 的出現時間已跟著字幕調整`, 'ok', 3500);
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
    toast(`已把第 ${info.cue.n} 句在 ${fmt(info.at, 1)} 切成兩句`, 'ok', 3000);
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
  $('#delMsg').innerHTML = `「${esc(c.text)}」有字卡、動畫或素材的時間綁著。刪掉之前，這些時間要改綁到前一句或後一句：`;
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
    toast(`已刪除第 ${c.n} 句（⌘／Ctrl＋Z 可以復原）`, 'ok', 3000);
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
let videoWait = null;
app.onVideoError = (m) => {
  if (videoWait) return;
  const show = (html) => { $('#stageEmpty').hidden = false; $('#stageEmpty').innerHTML = html; };
  const check = async () => {
    const r = await api('GET', '/api/state');
    const v = r.ok ? r.data?.video : null;
    // 處理好的版本出來了（網址會變）：換上去，接著看同一個位置
    if (v?.url && v.url !== app.server?.video?.url) {
      videoWait = null;
      app.server.video = v;
      $('#stageEmpty').hidden = true;
      sim.load(v.url);
      app.seek(app.t);
      return;
    }
    if (v?.preparing) {
      show('<div><b>影片處理中</b>好了會自動接上；字幕可以先改</div>');
      videoWait = setTimeout(check, 3000);
      return;
    }
    videoWait = null;
    show(`<div><b>播不了影片</b>${esc(m)}</div>`);
  };
  videoWait = setTimeout(check, 0);
};
app.onPlayerReady = () => { renderMode(); if (app.pendingFocus != null) { player.seek(app.pendingFocus); app.t = app.pendingFocus; app.pendingFocus = null; } };
app.onPlayerBlocked = () => toast('瀏覽器擋住了自動播放的聲音：在頁面上點一下，再按播放', 'warn', 5000);
app.onPlayerError = (m) => {
  toast(`完成影片預覽出錯：${m}`, 'err', 6000);
  banner(`完成影片預覽出錯：${esc(m)}。可以先用「快速試聽」；一直出錯就請 AI 檢查播放器（npm install 後重開剪輯台）。`, 'error', [['改用快速試聽', () => { banner(''); setMode('sim'); }]]);
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
  if (db != null && db > 0 && clipCount > 6 && now - clipToastT > 8000) { clipToastT = now; clipCount = 0; toast('音量超過 0 dB，完成影片會爆音 → 把人聲或音效調小一點（點時間軸空白處看「整支影片」的音量）', 'warn', 5000); }
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

let lastShown = '', lastStrip = '';
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
  if (shown !== lastStrip) { lastStrip = shown; tickSpeedStrip(); }
  drawMeter();
  requestAnimationFrame(frame);
}

async function setMode(m, { focus = null } = {}) {
  if (m === app.mode && focus == null) return;
  const pv = app.server?.preview;
  if (m === 'player') {
    if (!pv?.player?.available) { toast(pv?.player?.reason || '完成影片預覽不能用', 'warn', 6000); return; }
    if (!pv.built) { toast('還沒有完成影片可以預覽 → 先按「更新預覽」', 'warn', 5000); return; }
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
      toast(`完成影片預覽載入失敗：${err.message}，改用快速試聽`, 'err', 6000);
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
  // 面板裡的分鏡截圖只在快速試聽放（完成影片預覽已經看得到畫面）
  if (app.selection && !typingInInspector()) renderInspector();
}

// ---------- 載入 ----------
// keep：回應到了才算（等回應的時候可能又改了東西），回傳要保留的調整或 null
// waitSave：平常要等存檔做完再讀；存檔自己要重新載入（構圖頁剛存過）時不能等自己，不然會一直卡在「儲存中…」
// framing：只是構圖頁存了框和調光，字幕和字卡的字沒變：正在打的欄位不用關
async function loadState({ keep = null, waitSave = true, framing = false } = {}) {
  // 存檔途中讀到的是舊內容：等存完；等回應時又存了一次就再讀一次
  let r = null;
  for (let i = 0; i < 6; i++) {
    if (waitSave) await savePromise;
    const seq = app.saveSeq;
    r = await api('GET', '/api/state');
    if (seq === app.saveSeq && (!waitSave || !app.busy)) break;
  }
  if (!r.ok || !r.data) {
    setSaveState('error', '連不到剪輯台');
    $('#stageEmpty').hidden = false;
    $('#stageEmpty').innerHTML = `<div><b>連不到剪輯台</b>${esc(r.data?.message || '')}</div>`;
    return false;
  }
  const s = r.data;
  const prevVideo = app.server?.video?.url;
  // 檔案沒變（只是更新預覽、重新讀一次）：復原清單留著；檔案被別人改過：舊快照對不上，不能再回去
  const sameFiles = sameBase(app.base, { hash: s.plan.hash, srtHash: s.srt?.hash ?? null });
  // 檔案被別人改過：正在打的欄位是舊內容，不能接著寫回去（下一個字會把整格舊字蓋回去）；正在拖的也一樣。
  // 先離開欄位再算要保留的調整：中文選字在離開時才送出，那個字也要算進去
  if (!sameFiles && app.base) {
    if (!framing) {
      closeCapEditor(false);
      const a = document.activeElement;
      if (a?.matches?.('.cue-edit, #capText') || typingInInspector()) a.blur();
    }
    app.gesture = null;
  }
  const kept = keep ? keep() : null;
  app.saveBlocked = false;
  app.server = s;
  app.hiddenChecks = new Set(Array.isArray(s.hiddenChecks) ? s.hiddenChecks : []);
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
  if (kept) applyKept(kept);
  if (!sameFiles) { app.undoStack = []; app.redoStack = []; if (!kept) app.splits = []; }
  document.title = `剪輯台｜${s.project.name}`;
  $('#projName').textContent = s.project.name;
  $('#projName').title = s.project.dir;
  if (s.video) {
    $('#stageEmpty').hidden = true;
    sim.load(s.video.url);
    if (prevVideo && prevVideo !== s.video.url) { app.peaks = null; sim.resetMedia(); app.thumbs = {}; }
  } else {
    $('#stageEmpty').hidden = false;
    $('#stageEmpty').innerHTML = `<div><b>還沒有影片可以剪</b>${esc(s.videoError || '')}</div>`;
  }
  if (!s.plan.exists) banner('分鏡還沒做好：現在可以先看影片，但改了存不起來。請 AI 先完成分鏡，再重新整理這一頁。', 'error');
  else if (s.plan.error) banner(`分鏡檔有錯：${esc(s.plan.error)} → 請 AI 修好再重新整理。`, 'error');
  else if (s.video && roughStage()) renderRoughBanner();
  else if (s.schema?.error) banner(esc(s.schema.error), '');
  else if (!kept) banner('');
  timeline.setDuration(app.dur);
  applyCanvas();
  renderOverlays();
  if (s.report.ready) applyReport(s.report); else { app.itemsHint = '檢查中…（第一次可能要幾秒）'; fetchReport(); }
  changed({ inspector: true });
  renderMode();
  renderSpeakerWarn();
  renderPrerender(s.prerender);
  syncOutsideBuild(s.build, null);
  // 修改單：第一次載入讀這個專案存在瀏覽器的清單與開關；之後重新載入（AI 改了 plan.json）只重畫
  // 初剪預覽是來校字幕的：開在字幕分頁，不是主題和調光
  if (!rqLoaded) { rqLoaded = true; rqLoad(); let o = false; try { o = localStorage.getItem('editor-requests-open') === '1'; } catch { /* 預設收起 */ } setSide(roughStage() ? 'cues' : o ? 'rq' : 'insp', { open: false }); }
  else renderRequests();
  renderFlowHere();
  if (!app.peaks) fetchPeaks();
  pollExport();   // 順便更新「已輸出過」：內容改過就不算最新
  loadThumbs();
  sim.preloadSfx?.(s.schema?.sounds || []);
  // 工具更新後還沒重開的剪輯（舊版服務）狀態裡沒有 unsaved，也不認得存檔的 saveId、keep（會整筆拒收）：這時就不帶
  app.canStash = 'unsaved' in s;
  offerUnsaved(s.unsaved);
  return true;
}
// 拿掉的欄位在記憶體裡是 undefined，送到伺服器存著要換成記號（JSON 沒有 undefined）
const DEL = { $del: 1 };
const isDel = (v) => isObj(v) && v.$del === 1 && Object.keys(v).length === 1;
const keepForWire = (k) => ({ ...k, segs: Object.fromEntries(Object.entries(k.segs || {}).map(([id, p]) => [id, Object.fromEntries(Object.entries(p).map(([f, v]) => [f, v === undefined ? DEL : v]))])) });
// 保留使用者的調整：edit 只蓋使用者改過的那幾項（別的是 AI 剛改的，要留著）；字幕操作在字幕沒被改過時重播；段落欄位照 id 套回去
function applyKept(kept) {
  app.edit = normEdit({ ...app.savedEdit, ...(kept.edit || {}) });
  if ('look' in kept) app.look = kept.look;
  if ('theme' in kept) app.theme = kept.theme;
  if (kept.ops?.length && kept.srtHash === app.base.srtHash) {
    const rr = replay(app.cues0, { scenes: app.scenes }, kept.ops, { videoDur: app.dur });
    if (!rr.errors.length) { app.cues = rr.cues; app.scenes = rr.plan.scenes; app.srtOps = kept.ops; } else toast(`字幕的修改套不上最新的檔案，已放棄：${rr.errors[0]}`, 'warn', 6000);
  } else if (kept.ops?.length) toast('字幕檔被改過，那次沒存的字幕修改套不回去（要重做）', 'warn', 6000);
  for (const [id, patch] of Object.entries(kept.segs || {})) {
    const i = app.scenes.findIndex((x) => isObj(x) && x.id === id);
    if (i < 0 || !isObj(patch)) continue;
    const o = { ...app.scenes[i] };
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || isDel(v)) delete o[k]; else o[k] = v; }
    app.scenes[i] = o;
  }
}
// 上次關頁時正在存的那一筆被擋下來（檔案剛好被 AI 或構圖頁改過、正在輸出）：伺服器替關掉的頁面留著，這裡問要不要套回去
const UNSAVED_WHY = { conflict: '那時分鏡或字幕剛好被改過（可能是 AI 或構圖頁）', exporting: '那時正在輸出完成影片', invalid: '那次的修改有問題，伺服器沒有收' };
const unsavedSkip = new Set();
const forgetUnsaved = (id) => { unsavedSkip.add(id); api('POST', '/api/unsaved', { clear: id }); };
function offerUnsaved(u) {
  if (!u?.id || !isObj(u.keep) || unsavedSkip.has(u.id) || !app.server?.plan?.exists || app.server.plan.error) return;
  const when = new Date(u.at || Date.now());
  const segs = Object.keys(u.keep.segs || {}), ops = u.keep.ops?.length || 0;
  const what = [segs.length ? `${segs.slice(0, 4).join('、')}${segs.length > 4 ? ` 等 ${segs.length} 段` : ''}` : '', ops ? `${ops} 處字幕` : '', Object.keys(u.keep.edit || {}).length || 'look' in u.keep || 'theme' in u.keep ? '剪輯設定' : ''].filter(Boolean).join('、');
  // 不管套不套，伺服器那份都丟掉：套回去之後修改在這一頁上，照一般的自動存檔走（關頁沒存到會問）
  const done = () => { forgetUnsaved(u.id); banner(''); if (app.server?.video && roughStage()) renderRoughBanner(); };
  banner(`上次關掉這一頁時，最後一次修改沒存進去（${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}${what ? `，${esc(what)}` : ''}）：${UNSAVED_WHY[u.reason] || '那次沒存成功'}。要套回去嗎？`, 'error', [
    ['套回去（會自動存）', () => { done(); applyKept(u.keep); changed({ inspector: true }); toast('已套回去，會自動存', 'ok', 4000); }, 'small primary'],
    ['不要', done, 'small'],
  ]);
}
function renderRoughBanner() { banner('初剪預覽：字幕已經疊在畫面上，一邊聽一邊看。看到錯字，點右邊那一句直接改，會自動存。字卡和動畫要等分鏡做好才會出現。'); }
async function fetchReport(fresh = false) {
  const r = await api('GET', `/api/report${fresh ? '?fresh=1' : ''}`);
  if (r.ok && r.data) { applyReport(r.data); changed({ inspector: true }); tryDeepLink(); }
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
function applyReport(rep0) {
  // 初剪預覽：還沒排段落，「沒有畫面」「還沒排段落」這些是之後的事，現在只留跟字幕有關的
  const rough = roughStage();
  const onlyCaps = (list) => (list || []).filter((x) => /字幕/.test(String(x)));
  const rep = rough && rep0?.issues ? { ...rep0, issues: { errors: onlyCaps(rep0.issues.errors), warnings: onlyCaps(rep0.issues.warnings) } } : rep0;
  app.report = rep;
  app.saveErrors = null;
  const d = rep?.data;
  app.reportReady = !!d;
  app.items = (d?.items || rep?.fallback?.items || []).filter((it) => Number.isFinite(it.start) && Number.isFinite(it.end))
    .map((it) => ({ id: it.id, type: it.type || 'scene', label: it.label || '', start: it.start, end: it.end, shownEnd: Number.isFinite(it.shownEnd) ? it.shownEnd : null, src: it.src || null, warnings: it.warnings || 0, sfx: Array.isArray(it.sfx) ? it.sfx : [], out: it.out || null, enter: it.enter ?? null, exit: it.exit ?? null }));   // out、enter、exit：實際的轉場和畫面速度，介面要照這個顯示
  app.voiceOnly = Array.isArray(d?.voiceOnly) ? d.voiceOnly.filter((v) => Array.isArray(v) && v.length === 2) : [];
  // 情緒點（plan.json moods，023）：音效軌上看得到，改在分鏡表或跟 AI 說（不屬於任何一段，這裡不拖不靜音）
  app.moodView = Array.isArray(d?.moods) ? d.moods.filter((m) => Number.isFinite(m?.at)).map((m) => ({ ...m, zh: MOOD_ZH[m.kind] || m.kind })) : [];
  // 002 的 check-json：voiceUncovered＝只有聲音、沒被蓋住（紅色斜線）；uncovered＝沒有任何卡片或素材的講解（灰色斜線）
  const spans = (arr) => (Array.isArray(arr) ? arr.filter((v) => Number.isFinite(v?.start) && Number.isFinite(v?.end) && v.end > v.start).map((v) => [v.start, v.end, v.level || null]) : []);
  app.voiceUncovered = spans(d?.voiceUncovered);
  app.uncovered = spans(d?.uncovered);
  if (rough) { app.voiceUncovered = []; app.uncovered = []; }
  if (Array.isArray(d?.cutpoints) && d.cutpoints.length) app.cutpoints = d.cutpoints.filter((c) => Number.isFinite(c?.at)).map((c) => ({ at: c.at, kind: c.kind === 'ng' ? 'ng' : 'pause' }));
  if (!app.dur && d?.videoDur) { app.dur = d.videoDur; timeline.setDuration(app.dur); }
  app.itemsHint = rough ? '分鏡做好後，字卡和動畫會排在這裡' : d || rep?.fallback ? '還沒有字卡或動畫' : '看不到段落位置：檢查報告讀不到（點左下角的檢查結果）';
  renderCheck();
}

// ---------- 自動存檔與更新預覽 ----------
function setSaveState(state, text) { const el = $('#saveState'); el.dataset.state = state; el.querySelector('.txt').textContent = text; }
// ---------- 輸出完成影片（019）：按鈕 → 伺服器跑更新預覽、測試片段、整支、驗收；視窗關掉照樣繼續 ----------
let exportTimer = null;
// 長時間的等待一律寫到分：459 秒沒有人算得出來
const fmtWait = (sec) => { const s = Math.max(0, Math.round(sec || 0)); return s < 60 ? `${s} 秒` : s < 600 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${Math.round(s / 60)} 分鐘`; };
const baseTitle = () => `剪輯台｜${app.server?.project?.name ?? ''}`;
function notifyDone(text) {
  if (!document.hidden) return;
  try { if (window.Notification?.permission === 'granted') new Notification(text, { icon: '/editor/favicon.svg' }); } catch { /* 不能通知也沒關係，分頁標題和頁面上都有寫 */ }
}
const fmtSize = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`);
const optText = (o) => (o ? `${o.resolution === '4k' ? '4K' : '1080p'}、${o.captions === 'off' ? '字幕不燒進影片（另存 output/final.srt）' : '字幕燒進影片'}` : '');
// 視窗三個樣子：開始前選畫素與字幕（setup）→ 輸出中看整體進度 → 輸出好了引導打開資料夾
function renderExport(s) {
  const setup = !!app.exportSetup && !s.running;
  const at = s.steps.findIndex((x) => x.id === s.step);
  const done = !s.running && s.ok === true;
  $('#exportSetup').hidden = !setup;
  $('#exportProgress').hidden = !s.running;
  $('#exportResult').hidden = setup || !done || !s.final?.exists;
  $('#exportSteps').hidden = setup;
  $('#exportIssues').hidden = setup;
  $('#exportLogWrap').hidden = setup || !s.started;
  $('#exportStart').hidden = !setup;
  $('#exportClose').textContent = setup ? '取消' : '關閉';
  $('#exportClose').classList.toggle('primary', !setup && !done);
  $('#exportCancel').hidden = !s.running;
  // 輸出好了：主要動作是打開資料夾（檔案在哪），播放、驗收截圖放旁邊
  const ok = done && !!s.final?.exists && !setup;
  $('#exportReveal').hidden = !ok;
  $('#exportVideo').hidden = !ok || !s.final?.url;
  $('#exportSheet').hidden = !ok || !s.final?.sheetUrl;
  app.finalLinks = { video: s.final?.url || null, sheet: s.final?.sheetUrl || null };
  if (setup) {
    const c = app.canvas(), portrait = c.format === 'portrait';
    $('#exportTitle').textContent = '輸出完成影片';
    $('#exRes1080').textContent = `1080p（${portrait ? '1080×1920' : '1920×1080'}）`;
    $('#exRes4k').textContent = `4K（${portrait ? '2160×3840' : '3840×2160'}）`;
    const opts = exportChoice();
    const plain = opts.resolution === '1080p' && opts.captions === 'burn';
    $('#exportSub').textContent = plain && app.outDur > 0 ? `先做 4 秒測試片段確認有聲音，再輸出整支並驗收；整支大約要片長的 2 倍（這支約 ${fmtWait(app.outDur * 2)}）。` : '先做 4 秒測試片段確認有聲音，再輸出整支並驗收。';
    const pre = app.prerender;
    $('#exportSetupNote').textContent = opts.resolution === '4k' ? '4K 要整支重新輸出，時間會比 1080p 久好幾倍，磁碟也要留比較多暫存空間（不夠會先告訴你）。'
      : !plain && pre?.fresh && pre.state !== 'none' ? '背景先算好的是 1080p、字幕燒進影片；選了別的就要整支重新輸出。' : '';
    return;
  }
  const pct = s.overall ?? 0;
  $('#exportTitle').textContent = s.running ? '正在輸出完成影片…' : s.canceled ? '已取消輸出' : s.ok ? '✓ 完成影片輸出好了' : s.started ? '✖ 沒有輸出成功' : '輸出完成影片';
  $('#exportBarFill').style.width = `${pct}%`;
  $('#exportPct').textContent = `${pct}%`;
  $('.export-bar').setAttribute('aria-valuenow', String(pct));
  const left = s.eta != null ? `還要約 ${fmtWait(s.eta)}` : s.options?.resolution === '4k' ? '4K 會比 1080p 久好幾倍' : `整支大約要片長的 2 倍（這支約 ${fmtWait((app.outDur || 0) * 2)}）`;
  // 標題已經寫「完成影片輸出好了」：下面那行不再重複（伺服器的訊息給 AI 讀，開頭照樣有）
  const msg = done ? (s.message || '').replace(/^完成影片輸出好了[，,]\s*(但)?/, '').replace(/（[^（）]*）$/, '') : s.message || '';
  $('#exportSub').textContent = s.running ? `${s.options ? `${optText(s.options)}。` : ''}已經 ${fmtWait(s.seconds)}，${left}。可以關掉這個視窗繼續看別的，按上方按鈕再打開；不要關閉剪輯台。` : msg;
  if (ok) {
    $('#exportFile').textContent = s.final.file;
    $('#exportFileMeta').textContent = [s.final.size ? fmtSize(s.final.size) : '', optText(s.options)].filter(Boolean).join('｜');
  }
  $('#exportSteps').innerHTML = s.steps.map((x, i) => {
    const state = done || (s.started && i < at) ? 'done' : i === at ? (s.running ? 'now' : s.canceled ? 'todo' : 'bad') : 'todo';
    const mark = { done: '✓', now: '…', bad: '✖', todo: '·' }[state];
    return `<li class="${state}"><span class="sym">${mark}</span>${esc(x.label)}${x.id === 'render' && state === 'now' && s.percent != null ? `（${s.percent}%）` : ''}</li>`;
  }).join('');
  $('#exportIssues').innerHTML = issueItems(s.errors, s.warnings, 30);
  $('#exportLog').textContent = s.log || '';
  if (!s.running && s.started && !s.ok && !s.canceled) $('#exportLogWrap').open = true;
  const btn = $('#btnExport');
  btn.textContent = s.running ? `輸出中 ${pct}%` : exportLabel();
  document.title = s.running ? `輸出中 ${pct}%｜${baseTitle()}` : baseTitle();
}
function exportChoice() {
  return { resolution: $('input[name="exRes"]:checked')?.value || '1080p', captions: $('input[name="exCaps"]:checked')?.value || 'burn' };
}
// 按鈕順便講背景先算到哪：算好了按下去只要跑驗收
function exportLabel() {
  const pre = app.prerender;
  if (app.exporting || !pre?.fresh) return '輸出完成影片';
  return pre.state === 'done' ? '輸出完成影片（已先算好）' : pre.state === 'running' ? `輸出完成影片（背景已算 ${pre.percent ?? 0}%）` : '輸出完成影片';
}
function renderPrerender(pre) {
  const was = app.prerender;
  app.prerender = pre || { state: 'none' };
  if (!app.exporting) $('#btnExport').textContent = exportLabel();
  $('#btnExport').dataset.tip = app.prerender.fresh && app.prerender.state !== 'none'
    ? '背景已經先在輸出這一版，按下去接著等或直接用；只改幾段會自動補上，改動大（換主題、片長變了…）才要重新輸出'
    : '輸出完成影片：先做 4 秒測試片段確認有聲音，再輸出整支並驗收（沒存的會先存）';
  // 存檔讓背景那份白算了（只改幾段不算，會自動補上）：講清楚，不要等到按輸出才發現要從頭等
  if (was?.fresh && was.state !== 'none' && !app.prerender.fresh) toast('內容改動比較大，背景先算的完成影片不能用了：按「輸出完成影片」時會重新輸出', 'warn', 8000);
}
async function pollExport() {
  const r = await api('GET', '/api/export');
  if (!r.ok || !r.data) { clearInterval(exportTimer); exportTimer = null; app.exporting = false; renderHeader(); return; }
  const s = r.data;
  renderExport(s);
  if (JSON.stringify(s.final ?? null) !== JSON.stringify(app.finalInfo ?? null)) { app.finalInfo = s.final; renderMode(); }
  if (s.running) {
    if (!app.exporting) { app.exporting = true; renderHeader(); }
    exportTimer ??= setInterval(pollExport, 1000);
    return;
  }
  clearInterval(exportTimer); exportTimer = null;
  if (app.exporting) {
    app.exporting = false;
    renderHeader();
    if (isDirty()) scheduleAutosave(0);   // 輸出中改的，現在可以存了
    if (!$('#dlgExport').open) toast(s.ok ? '完成影片輸出好了' : s.canceled ? '已取消輸出' : '輸出沒有成功', s.ok ? 'ok' : 'err', s.ok ? 6000 : 8000, { actions: [['看結果', () => $('#dlgExport').showModal()]] });
    notifyDone(s.ok ? '完成影片輸出好了' : s.canceled ? '已取消輸出' : '完成影片沒有輸出成功');
    fetchReport();
  }
}
// 按「輸出完成影片」：輸出中就打開進度；不然先打開選擇（畫素、字幕），按「開始輸出」才真的開始
async function startExportFlow() {
  if (app.exporting) { await pollExport(); $('#dlgExport').showModal(); return; }
  if (app.building) return;
  app.exportSetup = true;
  const r = await api('GET', '/api/export');
  renderExport(r.ok && r.data ? r.data : { steps: [], running: false });
  if (!$('#dlgExport').open) $('#dlgExport').showModal();
  $('#exportStart').focus();
}
async function beginExport({ confirmSpeaker = false } = {}) {
  if (app.exporting || app.building) return;
  await savePromise;
  if (isDirty() && !(await save())) return;
  const r = await api('POST', '/api/export', { ...exportChoice(), ...(confirmSpeaker ? { confirmSpeaker: true } : {}) });
  if (r.status === 409 && r.data?.error === 'speaker') { $('#dlgExport').close(); openSpeakerDialog(r.data.speaker, { exporting: true }); return; }
  if (!r.ok) { toast(r.data?.message || '不能輸出', 'err', 6000); return; }
  app.exportSetup = false;
  try { if (window.Notification?.permission === 'default') Notification.requestPermission().catch?.(() => {}); } catch { /* 瀏覽器不支援通知 */ }
  $('#exportLogWrap').open = false;
  app.exporting = true;
  renderHeader();
  renderExport(r.data);
  if (!$('#dlgExport').open) $('#dlgExport').showModal();
  exportTimer ??= setInterval(pollExport, 1000);
}
// ---------- 講者：畫面上還是示範人物時，頂端常駐提醒；輸出前一定跳這張確認卡 ----------
let speakerForExport = false;
function renderSpeakerWarn() {
  const sp = app.server?.speaker, btn = $('#btnSpeakerWarn');
  btn.hidden = !sp?.needed;
  if (sp?.needed) btn.dataset.tip = `講者介紹（${sp.segments.join('、')}）現在會顯示示範人物「${sp.demo}」。點這裡填你的姓名與頭銜`;
}
function openSpeakerDialog(sp, { exporting = false } = {}) {
  speakerForExport = exporting;
  if (sp && app.server) app.server.speaker = sp;
  const cur = app.server?.speaker || sp;
  renderSpeakerWarn();
  $('#spkTitle').textContent = `畫面上的講者是示範人物「${cur.demo}」`;
  $('#spkMsg').textContent = `講者介紹（${cur.segments.join('、')}）還沒設定你的姓名，${exporting ? '現在輸出，影片裡會寫' : '現在畫面上寫的是'}「${cur.demo}」和「${cur.demoTitles.join('、')}」。`;
  const shot = $('#spkShot');
  shot.hidden = !cur.shot;
  if (cur.shot) shot.src = cur.shot;
  const L = cur.limits;
  $('#spkName').placeholder = `最多 ${L.name} 字`;
  $('#spkTitles').placeholder = `最多 ${L.maxTitles} 個，用頓號分開，每個最多 ${L.titles} 字`;
  $('#spkErr').hidden = true;
  $('#spkSave').textContent = exporting ? '存好，繼續輸出' : '存好';
  const anyway = $('#spkAnyway');
  anyway.hidden = !exporting;
  anyway.textContent = `照樣輸出（影片裡是${cur.demo}）`;
  $('#dlgSpeaker').showModal();
}
async function saveSpeakerFromDialog() {
  const r = await api('POST', '/api/speaker', { name: $('#spkName').value, titles: $('#spkTitles').value });
  if (!r.ok) { const e = $('#spkErr'); e.textContent = r.data?.message || '沒有存到'; e.hidden = false; return; }
  app.server.speaker = r.data.speaker;
  renderSpeakerWarn();
  $('#dlgSpeaker').close();
  if (speakerForExport) { beginExport(); return; }
  toast('講者存好了：更新預覽後就會換上', 'ok', 4000);
  if (app.server?.preview?.built) runBuild();
}
// 不能按的按鈕要講為什麼：用 is-disabled（滑鼠移上去看得到原因、點了也會講），不用 disabled
function setOff(sel, why) {
  const b = $(sel);
  b.classList.toggle('is-disabled', !!why);
  b.setAttribute('aria-disabled', String(!!why));
  b.dataset.why = why || '';
}
const lastBuildText = () => { const s = app.server?.build?.seconds; return s > 0 ? `（上次花 ${fmtWait(s)}）` : ''; };
function renderHeader() {
  const canSave = !!app.server?.plan?.exists && !app.server?.plan?.error;
  const dirty = isDirty(), rough = roughStage(), pv = app.server?.preview;
  $('#btnUndo').disabled = !app.undoStack.length;
  $('#btnRedo').disabled = !app.redoStack.length;
  const buildingHere = app.building || !!app.buildOutside;   // 別的分頁或構圖頁也在更新預覽：這一頁也不能再按
  const noPlan = !app.server ? '載入中…' : !app.server.plan.exists ? '分鏡還沒做好' : app.server.plan.error ? '分鏡檔有錯，請 AI 修好' : '';
  setOff('#btnBuild', rough ? '分鏡做好才能用：現在還沒有字卡和動畫' : noPlan || (buildingHere ? '正在更新，等它跑完' : app.exporting ? '正在輸出完成影片' : ''));
  $('#btnBuild').textContent = buildingHere ? '更新中…' : '更新預覽';
  $('#btnBuild').dataset.tip = `把修改做進完成影片預覽${lastBuildText()}。通常幾十秒；換了構圖或瘦臉要重新處理底片，長片要十幾分鐘`;
  setOff('#btnExport', app.exporting ? '' : rough ? '分鏡做好才能輸出' : noPlan || (buildingHere ? '正在更新預覽，等它跑完' : ''));
  // 主要按鈕只有一個：預覽不是最新的＝更新預覽；是最新的＝輸出
  const needBuild = !rough && canSave && !buildingHere && !app.exporting && (!pv?.built || pv?.stale || dirty);
  $('#btnBuild').classList.toggle('primary', needBuild);
  $('#btnExport').classList.toggle('primary', app.exporting || (!needBuild && !rough && canSave && !!pv?.built));
  if (app.busy || !app.server) return;
  if (app.saveBlocked) return;
  if (app.saveOffline) return;
  if (!canSave) setSaveState('error', app.server.plan.exists ? '分鏡檔有錯，請 AI 修' : '分鏡還沒做好');
  else if (app.exporting && dirty) setSaveState('dirty', '輸出完會自動存');
  else if (dirty) setSaveState('dirty', '自動存檔中…');
  else setSaveState('saved', '已自動存檔');
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
    const keys = [...SEG_KEYS.common, ...(type === 'media' ? SEG_KEYS.media : []), ...(type === 'scene' ? SEG_KEYS.scene : []), ...(type === 'custom' && sc.template ? SEG_KEYS.custom : []), ...(type === 'fx' ? SEG_KEYS.fx : [])];
    const d = {}, rd = {};
    for (const k of keys) {
      if (same(sc[k], b[k])) continue;
      rd[k] = sc[k];
      if (k === 'sfx') d.sfx = sc.sfx === null ? null : { restore: true };
      else if (sc[k] === undefined) { if (k === 'sfxVolume' || k === 'anchor' || SPEED_KEYS.includes(k)) d[k] = null; }
      else d[k] = sc[k];
    }
    if (Object.keys(d).length) out[sc.id] = d;
    if (Object.keys(rd).length) raw[sc.id] = rd;
  });
  return { segments: out, raw };
}
// 自動存檔：改了什麼停手一秒就存。拖曳中、中文選字中先等；存失敗不會丟，留在頁面上
let saveTimer = null, savePromise = Promise.resolve(), checkTimer = null;
function scheduleAutosave(delay = AUTOSAVE_MS) {
  if (app.saveBlocked || !app.server?.plan?.exists || app.server.plan.error) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autosaveNow, delay);
}
function autosaveNow() {
  if (!isDirty() || app.saveBlocked || app.exporting) return;
  if (app.gesture || app.composing || app.busy) { scheduleAutosave(400); return; }
  save();
}
// 切回對話、關分頁之前先存：不能等那一秒
function flushNow() {
  closeCapEditor(true);   // 時間軸上正在打的字也算
  if (!isDirty() || app.saveBlocked || app.exporting || app.gesture || app.busy) return;
  clearTimeout(saveTimer);
  save();
}
// 把伺服器回來的檔案內容當成新的基準。keepLocal＝存檔途中又改了東西：畫面上的留著，已經送出去的字幕操作算進基準
function applySaved(d, { keepLocal = false, sentOps = 0, fallbackEdit = null } = {}) {
  app.base = { mtime: d.plan.mtime, hash: d.plan.hash, srtHash: d.srt?.hash ?? null };
  Object.assign(app.server.plan, { mtime: d.plan.mtime, hash: d.plan.hash, data: d.plan.data });
  app.server.srt = { ...app.server.srt, ...d.srt };
  app.plan0 = d.plan.data;
  app.cues0 = d.captions || [];
  app.sfxMemory = d.sfxMemory || {};
  app.savedEdit = normEdit(d.edit || fallbackEdit);
  app.savedLook = normLook(app.plan0.look);
  app.savedTheme = normTheme(app.plan0.theme);
  if (d.look) app.server.look = d.look;
  if (keepLocal) {
    app.srtOps = app.srtOps.slice(sentOps);
    // 正在拖的快照也要換基準：沒拖動就放開會還原成快照，不能把已經存好的字幕操作再送一次
    if (app.gesture) { const g = JSON.parse(app.gesture); g.ops = g.ops.slice(sentOps); g.base = app.base; app.gesture = JSON.stringify(g); }
    app.savedSnap = JSON.stringify({ edit: app.savedEdit, scenes: app.plan0.scenes || [], ops: [], look: app.savedLook, theme: app.savedTheme });
    return;
  }
  app.edit = clone(app.savedEdit);
  app.look = clone(app.savedLook);
  app.theme = app.savedTheme;
  app.scenes = clone(app.plan0.scenes || []);
  app.cues = clone(app.cues0);
  app.srtOps = [];
  app.savedSnap = dirtySnap();
  app.lastCoalesce = null;
  if (app.selection?.kind === 'cue' && !app.cues.some((c) => c.n === app.selection.id)) app.selection = null;
}
async function save({ notify = false } = {}) {
  clearTimeout(saveTimer);
  if (app.busy) await savePromise;
  if (!app.server?.plan?.exists || app.server.plan.error) { if (notify) toast('分鏡檔不存在或有錯，沒辦法存：請 AI 修好', 'err'); return false; }
  if (notify) closeCapEditor(true);
  if (!isDirty()) { if (notify) toast('都存好了', 'ok', 1500); return true; }
  const job = saveOnce({ notify });
  savePromise = job.catch(() => {});
  return job;
}
let saveIds = 0;
async function saveOnce({ notify, retry = 0 }) {
  const { segments } = segmentDiff();
  const textChanged = Object.entries(segments).filter(([, d]) => 'slots' in d || 'vars' in d).map(([id]) => id);
  const saveId = `${Date.now().toString(36)}-${++saveIds}-${Math.random().toString(36).slice(2, 8)}`;
  const body = { quick: true, base: { ...app.base }, edit: editForSave(), ...(app.canStash ? { saveId } : {}) };
  if (Object.keys(segments).length) body.segments = segments;
  if (app.srtOps.length) body.srt = { ops: app.srtOps };
  if (!same(app.look, app.savedLook)) body.look = app.look ? { color: r2(app.look.color), slim: r2(app.look.slim), ...(app.look.beauty > 0 ? { beauty: r2(app.look.beauty) } : {}) } : null;   // 美顏 0＝關，不寫
  if (app.theme !== app.savedTheme) body.theme = app.theme;
  const sentSnap = dirtySnap(), sentOps = app.srtOps.length;
  app.busy = true;
  app.inFlight = true;
  app.opsInFlight = sentOps;
  setSaveState('busy', '儲存中…');
  renderHeader();
  // keepalive：送出去之後才關頁或換頁，這次存檔照樣會完成（瀏覽器限 64 KB）。連同這次改了什麼（keep）一起送：
  // 萬一頁面關掉之後才被擋下來（檔案剛好被改過、正在輸出），伺服器替它留著，下次打開問要不要套回去。太大的不送，關頁時會問
  const wire = app.canStash ? { ...body, keep: keepForWire(keepState()) } : body;
  app.sentSafe = new Blob([JSON.stringify(wire)]).size < 60000;
  app.sentSnap = sentSnap;
  const r = await api('POST', '/api/save', app.sentSafe ? wire : body, { keepalive: app.sentSafe });
  app.inFlight = false;
  app.opsInFlight = 0;
  // 被擋下來（409）要先問清楚是誰改的：這段期間還算存檔中，自動存檔、檢查版本不能插進來
  const settle = () => { app.busy = false; };
  if (!(r.status === 409 && r.data?.error === 'conflict')) settle();
  app.saveOffline = r.status === 0;
  // 頁面還開著，自己會處理：伺服器替關掉的頁面留的那份用不到（重新載入時也別拿來問）
  if (r.data?.stashed) forgetUnsaved(saveId);
  if (r.status === 0) {
    // 連不到服務：修改還在頁面上，連回來自動補存
    setSaveState('error', '連不到剪輯台，修改還留在這一頁');
    scheduleAutosave(5000);
    return false;
  }
  if (r.status === 409 && r.data?.error === 'exporting') {
    app.exporting = true;
    renderHeader();
    exportTimer ??= setInterval(pollExport, 1000);
    return false;
  }
  if (r.status === 409) {
    // 是構圖頁剛存的（同一個服務，只動構圖）：不是別人改的，載入新的、保留手上的修改，馬上再存一次。
    // 載入不能等「這一輪存檔做完」（loadState 平常會等），等的就是自己，會一直卡在「儲存中…」
    try {
      const ver = await api('GET', '/api/version');
      const fr = ver.data?.framingUpdate;
      if (ver.ok && fr?.hash && fr.hash === ver.data.plan?.hash && (ver.data.srt?.hash ?? null) === (app.base?.srtHash ?? null)) {
        const loaded = await loadState({ keep: keepState, waitSave: false, framing: true });
        settle();
        if (loaded && isDirty() && retry < 2) return saveOnce({ notify, retry: retry + 1 });
        renderHeader();
        return loaded && !isDirty();
      }
    } finally { settle(); }
    app.saveBlocked = true;
    renderHeader();
    setSaveState('error', r.data?.file === 'srt' ? '字幕檔被改過，這次沒有存' : '分鏡被改過，這次沒有存');
    $('#conflictMsg').textContent = '分鏡或字幕在你打開這一頁之後被改過（通常是 AI 剛改的）。為了不蓋掉那些修改，這次沒有存。';
    app.conflictFile = r.data?.file;
    if (!$('#dlgConflict').open) $('#dlgConflict').showModal();
    return false;
  }
  if (!r.ok) {
    renderHeader();
    setSaveState('error', '沒有存成功');
    app.saveErrors = r.data?.errors || [r.data?.message || `儲存失敗（${r.status}）`];
    renderCheck(); openIssues();
    toast('沒有存成功，修改還留在頁面上；原因寫在「檢查」分頁', 'err', 5000);
    return false;
  }
  const d = r.data;
  app.saveSeq = (app.saveSeq || 0) + 1;
  app.saveErrors = null;
  // 檢查還沒回來之前，時間軸上的段停在現在算好的位置（不會因為基準換了跳回去）
  const views = new Map(app.itemsView.map((v) => [v.id, v]));
  app.items = app.items.map((it) => {
    const v = views.get(it.id);
    return v ? { ...it, start: v.start, end: v.end, shownEnd: it.shownEnd != null ? v.vend : null, sfx: (it.sfx || []).map((m) => ({ ...m, at: r3(m.at + (v.ds || 0)) })) } : it;
  });
  // 存檔途中又改了（或正在拖曳）：畫面上的留著，下一輪再存
  const keepLocal = dirtySnap() !== sentSnap || !!app.gesture;
  applySaved(d, { keepLocal, sentOps, fallbackEdit: body.edit });
  for (const id of textChanged) app.pendingAudit.add(id);
  if (app.server.preview.built) app.server.preview.stale = true;
  changed({ inspector: false });
  renderMode();
  if (notify) toast('存好了', 'ok', 1500);
  scheduleCheck();
  return true;
}
// 存檔不等檢查（長片要 9 秒）：停手幾秒才跑，同時只跑一個；好了更新左下角，有錯才提醒
function scheduleCheck(delay = CHECK_MS) { clearTimeout(checkTimer); app.checking = true; renderStatus(); checkTimer = setTimeout(checkAfterSave, delay); }
async function checkAfterSave() {
  if (app.checkRunning) { app.checkAgain = true; return; }
  app.checkRunning = true;
  app.checkAgain = false;
  const r = await api('GET', '/api/report?fresh=1');
  app.checkRunning = false;
  if (app.checkAgain) { scheduleCheck(500); return; }
  app.checking = false;
  pollExport();
  if (r.ok && r.data) {
    applyReport(r.data);
    changed({ inspector: false });
    const errs = r.data.issues?.errors?.length || 0;
    if (errs) toast(`檢查有 ${errs} 個錯誤（點左下角看）`, 'warn', 5000);
  } else renderStatus();
}
// 按「更新預覽」：改過字的段做完會量版面，播放頭帶到第一段。
// 要量哪幾段等存完再算：改完字不到一秒就按，那一段是這次存檔才記上的，不能漏掉
function buildFromButton() { return runBuild({ fromButton: true }); }
async function runBuild({ focus = null, focusId = null, audit = [], fromButton = false } = {}) {
  if (app.building) return;
  await savePromise;
  if (isDirty() && !(await save())) return;
  if (fromButton) {
    audit = [...app.pendingAudit];
    const it = audit.length ? app.itemsView.find((x) => x.id === audit[0]) : null;
    focus = it ? it.start + 0.4 : null; focusId = it?.id ?? null;
  }
  app.building = true;
  renderHeader();
  const t0 = performance.now();
  const tt = toast('更新預覽中…', 'ok', 0, { busy: true });
  const poll = setInterval(async () => {
    const s = await api('GET', '/api/build');
    tt.set(buildProgress(s.data, (performance.now() - t0) / 1000));
  }, 800);
  const r = await api('POST', '/api/build', audit.length ? { audit } : {});
  clearInterval(poll);
  tt.close();
  app.building = false;
  if (r.status === 409 && r.data?.error === 'busy') { app.buildOutside = true; renderHeader(); toast('已經在更新了，等它跑完', 'warn', 3000); return; }
  const d = r.data || {};
  app.auditIssues = d.audit || null;
  const iss = d.issues || { errors: [], warnings: [] };
  $('#logText').textContent = d.log || d.message || '';
  $('#logIssues').innerHTML = issueItems(iss.errors, iss.warnings, 30);
  await loadState({ keep: keepIfDirty });
  if (r.ok && d.ok) {
    for (const id of audit) app.pendingAudit.delete(id);   // 只拿掉這次量過的：更新途中又改字的段，留到下一次
    $('#logTitle').textContent = '✓ 預覽更新好了'; $('#logSub').textContent = `花了 ${fmtWait(d.seconds)}。`; $('#logWrap').open = false;
    const au = d.audit;
    const auErr = au ? splitHidden(au.errors, [], app.hiddenChecks).errors : [];
    if (auErr.length) { renderCheck(); openIssues(); toast(`預覽更新好了，但 ${au.ids.join('、')} 改字後版面有 ${auErr.length} 個錯誤（「檢查」分頁）：改短或改回原本的字`, 'err', 8000); }
    else toast(`預覽更新好了（${fmtWait(d.seconds)}）${au ? `，${au.ids.join('、')} 版面${au.warnings.length ? `有 ${au.warnings.length} 個提醒` : '沒問題'}` : ''}${focusId ? `，切到完成影片預覽看 ${focusId}` : ''}`, 'ok', 3500, { actions: [['訊息', () => $('#dlgLog').showModal()]] });
    if (focus != null) {
      if (app.server.preview.player.available) { await setMode('player', { focus }); app.seek(focus); if (focusId) app.select({ kind: segType(sceneById(focusId)) === 'media' ? 'media' : 'item', id: focusId }); }
      else toast('找不到播放器，沒辦法切到完成影片預覽（只能用快速試聽）', 'warn', 5000);
    } else if (app.mode === 'player' && app.server.preview.built) {
      try { await player.mount(`${app.server.preview.composition}?v=${Math.floor(app.server.preview.builtMtime || 0)}`); player.seek(app.t); } catch { setMode('sim'); }
    } else if (app.server.preview.built && app.server.preview.player.available) await setMode('player');   // 第一次做好：直接看成品
  } else {
    $('#logTitle').textContent = '✖ 預覽沒有更新成功'; $('#logSub').textContent = d.message || '照下面的訊息修改（看不懂就整段貼給 AI）。'; $('#logWrap').open = true;
    toast('預覽沒有更新成功', 'err', 8000, { actions: [['看訊息', () => $('#dlgLog').showModal()]] });
  }
  renderHeader();
}
// 更新預覽的進度文字：現在做哪一步、已經多久、上次花多久；不把工具的訊息原樣貼給使用者
function buildProgress(b, seconds) {
  const lead = `${b?.phase || '更新預覽中'}…（已經 ${fmtWait(seconds)}${b?.phase === '重新處理影片底片' && b.slowSeconds ? `，上次花 ${fmtWait(b.slowSeconds)}` : ''}）`;
  return b?.phase === '重新處理影片底片' && !b.slowSeconds ? `${lead}長片要十幾分鐘` : lead;
}
function keepState() {
  const { raw } = segmentDiff();
  const edit = {};
  for (const k of Object.keys(app.edit)) if (!same(app.edit[k], app.savedEdit[k])) edit[k] = clone(app.edit[k]);
  return { edit, segs: raw, ops: clone(app.srtOps), srtHash: app.base?.srtHash ?? null,
    ...(!same(app.look, app.savedLook) ? { look: clone(app.look) } : {}),
    ...(app.theme !== app.savedTheme ? { theme: app.theme } : {}) };
}
const keepIfDirty = () => (isDirty() ? keepState() : null);

// 別的地方（構圖頁、別的分頁）正在更新預覽：這一頁的按鈕也要鎖，並講清楚在等什麼、等多久了
function syncOutsideBuild(b, framing) {
  const running = !!b?.running && !app.building;
  if (running !== !!app.buildOutside) { app.buildOutside = running; renderHeader(); }
  if (!running) {
    app.outsideToast?.close(); app.outsideToast = null;
    return;
  }
  const lead = framing?.running ? '正在把構圖做進預覽：' : '正在更新預覽：';
  app.outsideToast ??= toast(lead, 'ok', 0, { busy: true });
  app.outsideToast.set(`${lead}${buildProgress(b, b.seconds)}`);
}

// 外部改了 plan.json／rough.srt（通常是 AI）
async function pollVersion() {
  if (app.busy || app.building || app.pollingVersion || !app.server) return;
  app.pollingVersion = true;
  const seq = app.saveSeq;
  try {
    const r = await api('GET', '/api/version');
    if (!r.ok || !r.data) { setSaveState('error', '連不到剪輯台'); return; }
    if (seq !== app.saveSeq || app.busy) return;   // 等回應的時候自己存了檔：這份版本資訊已經舊了，不是別人改的
    const v = r.data;
    if (app.saveOffline) { app.saveOffline = false; renderHeader(); }
    const pv = app.server.preview;
    const rebuilt = v.built && pv.builtMtime !== v.builtMtime;
    if (pv.built !== v.built || pv.stale !== v.stale || pv.builtMtime !== v.builtMtime) { pv.built = v.built; pv.stale = v.stale; pv.builtMtime = v.builtMtime; renderMode(); }
    if (JSON.stringify(v.requests ?? null) !== JSON.stringify(app.server.requests ?? null)) { app.server.requests = v.requests ?? null; renderRequests(); }
    renderPrerender(v.prerender);
    syncOutsideBuild(v.build, v.framingUpdate);
    const changedOut = (v.plan.hash && app.base && v.plan.hash !== app.base.hash) || ((v.srt?.hash ?? null) !== (app.base?.srtHash ?? null));
    const framing = v.framingUpdate;
    const fromFraming = framing?.hash === v.plan.hash && (v.srt?.hash ?? null) === (app.base?.srtHash ?? null);
    const key = `${v.plan.hash}|${v.srt?.hash}`;
    if (changedOut && !$('#dlgConflict').open && app.noticed !== key) {
      if (fromFraming) { await loadState({ keep: keepIfDirty, framing: true }); toast('已套用構圖設定', 'ok', 2600); }
      else if (!isDirty()) { await loadState(); toast('分鏡或字幕有更新（可能是 AI 改的），已重新載入', 'ok', 4500); }
      else {
        banner('分鏡或字幕剛被改過（可能是 AI 改的），而你有還沒存的調整。', 'error', [
          ['重新載入，保留我的調整', async () => { banner(''); await loadState({ keep: keepState }); toast('已載入最新的檔案，你的調整還在，會自動存', 'ok', 5000); }, 'small primary'],
          ['重新載入，放棄我的調整', async () => { banner(''); await loadState(); }, 'small'],
        ]);
        app.noticed = key;
      }
    }
    if (framing && !framing.running) {
      if (framing.finishedAt && app.framingFinished !== framing.finishedAt) {
        app.framingFinished = framing.finishedAt;
        toast(framing.ok ? '構圖已套用，預覽已更新' : framing.message || '構圖存好了，但預覽更新失敗，請按「更新預覽」查看訊息', framing.ok ? 'ok' : 'err', 6000);
      }
    }
    // 播放器放的不是最新那一版就換上去。比網址，不能只看 builtMtime 有沒有變：
    // 上面的 loadState 如果剛好在 build 做完時讀到新時間，下一輪就看不出變過，播放器會一直停在舊的
    const stalePlayer = () => app.mode === 'player' && v.built && !v.build?.running && player.p && player.p.getAttribute('src') !== `${app.server.preview.composition}?v=${Math.floor(app.server.preview.builtMtime || 0)}`;
    if (rebuilt && (!changedOut || fromFraming || !isDirty())) {
      await loadState({ keep: keepIfDirty });
      if (app.mode !== 'player') sim.seek(app.t);
    }
    if (stalePlayer() && (!changedOut || fromFraming || !isDirty())) {
      try { await player.mount(`${app.server.preview.composition}?v=${Math.floor(app.server.preview.builtMtime || 0)}`); player.seek(app.t); }
      catch { setMode('sim'); }
    }
  } finally { app.pollingVersion = false; }
}

// ---------- 畫面：時間、狀態列、軌頭 ----------
// 平常看分秒；格數小一號放旁邊，精修才要看
function tcHtml(t) {
  const m = /^(.*):(\d\d)$/.exec(fmtFine(t));
  return m ? `${m[1]}<small>:${m[2]}</small>` : esc(fmtFine(t));
}
let tcShown = '';
function renderTimes() {
  if (document.activeElement !== $('#tcInput')) { const h = tcHtml(app.t); if (h !== tcShown) { tcShown = h; $('#tc').innerHTML = h; } }
  $('#tcDur').textContent = fmt(app.dur, 0);
  const anyCut = app.edit.cuts.length > 0;
  $('.tc-out').hidden = !anyCut;   // 沒剪掉東西時兩個時間一樣，不用印兩次
  if (anyCut) {
    $('#tcOut').textContent = cutIndexAt(app.t, app.edit.cuts) >= 0 ? '（剪掉）' : fmt(outOf(app.t, app.edit.cuts), 0);
    $('#tcOutDur').textContent = fmt(app.outDur, 0);
  }
  renderNow();
}
function renderPlay() { const p = engine().playing || !!app.shuttle; const b = $('#btnPlay'); b.textContent = p ? '❚❚' : '▶'; b.setAttribute('aria-label', p ? '暫停' : '播放'); }
function renderStatus() {
  const { errors: es, warnings: ws } = currentIssues();
  const counts = groupIssues(es, ws).counts;
  const errs = counts.errors, warns = counts.author;   // ⚠＝要作者看的件數（同類合併）；給 AI 的細節不算
  $('#stIssues .e').textContent = `✖ ${errs}`; $('#stIssues .e').classList.toggle('has', !!errs);
  $('#stIssues .w').textContent = `⚠ ${warns}`; $('#stIssues .w').classList.toggle('has', !!warns);
  const vu = app.voiceUncovered.length;
  $('#stHint').textContent = app.checking ? '檢查中…（可以繼續改）' : vu ? `⚠ ${vu} 段只有聲音、沒被素材蓋住（主軌紅色斜線）` : '';
  $('#stOut').textContent = `完成影片 ${fmt(app.outDur, 0)}${app.edit.cuts.length ? `（剪掉 ${fmtSec(cutTotal(app.edit.cuts))}）` : ''}`;
  $('#stZoom').textContent = `時間軸一屏 ${fmtSpan(timeline.span())}　吸附${app.snapOn ? '開' : '關'}`;
  const s = app.selection;
  $('#stSel').textContent = s ? `已選：${selLabel(s)}` : '';
}
const fmtSpan = (sec) => (sec >= 90 ? `${Math.round(sec / 60)} 分鐘` : `${Math.round(sec)} 秒`);
function selLabel(s) {
  switch (s.kind) {
    case 'cue': return `字幕第 ${s.id} 句`;
    case 'item': case 'media': return s.id;
    case 'cut': return '剪掉的範圍';
    case 'piece': return '主軌片段';
    case 'range': return `範圍 ${fmtSec(app.sel.b - app.sel.a)}`;
    case 'join': return '剪接點';
    case 'gain': return '人聲範圍音量';
    case 'sfx': return `${s.id} 的音效`;
    case 'gap': return '沒有字卡的講解';
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
const ICON_MUTE = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M2 6v4h2.5L8 13V3L4.5 6H2z"/><path stroke="currentColor" stroke-width="1.5" d="M10.5 6l3.5 4m0-4l-3.5 4" fill="none"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M5 7V5a3 3 0 0 1 6 0v2"/><rect x="3.5" y="7" width="9" height="7" rx="1.5" fill="currentColor"/></svg>';
function renderHeads() {
  const el = $('#tlHeads');
  if (!el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = (timeline.lanes || LANES).map(([k, h], i) => {
      const hh = h + 1;
      if (k === 'ov' || k === 'ruler') return `<div class="th" style="height:${hh}px" data-lane="${k}">${k === 'ruler' ? '<span class="nm"><small>時間</small></span>' : ''}</div>`;
      const vol = ['media', 'voice', 'sfx'].includes(k);
      return `<div class="th" style="height:${hh}px" data-lane="${k}">
        <span class="nm">${TRACK_NAMES[k]}<small data-sub></small></span>
        ${k === 'voice' ? '<span class="warnico" data-clipwarn hidden data-tip="">!</span>' : ''}
        ${vol ? `<input class="db" type="number" step="0.5" min="-60" max="12" data-db="${k}" aria-label="${TRACK_NAMES[k]}音量（dB）" data-tip="${TRACK_NAMES[k]}整條軌的音量（dB），−60＝靜音">
        <button class="mute" data-mute="${k}" aria-label="${TRACK_NAMES[k]}靜音" data-tip="靜音：這條軌整條不出聲，完成影片也一樣">${ICON_MUTE}</button>` : ''}
        ${k !== 'anim' ? `<button class="lock" data-lock="${k}" aria-label="鎖定${TRACK_NAMES[k]}軌" data-tip="鎖定：避免不小心拖到這條軌">${ICON_LOCK}</button>` : ''}
      </div>`;
    }).join('');
  }
  for (const k of ['media', 'voice', 'sfx']) {
    const inp = el.querySelector(`[data-db="${k}"]`);
    if (document.activeElement !== inp) inp.value = String(app.edit.volume[k]);
    el.querySelector(`[data-mute="${k}"]`).classList.toggle('on', app.trackMuted(k));
  }
  for (const b of el.querySelectorAll('[data-lock]')) { const on = app.trackLocked(b.dataset.lock); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  for (const th of el.querySelectorAll('.th')) th.classList.toggle('sel', th.dataset.lane === app.selLane);
  const capSub = el.querySelector('[data-lane="cap"] [data-sub]');
  if (capSub) capSub.textContent = app.cues.length ? ` ${app.cues.length} 句` : '';
  const pk = voicePeakMax();
  const warn = el.querySelector('[data-clipwarn]');
  if (warn) { warn.hidden = !(pk != null && pk > 0); warn.dataset.tip = pk != null && pk > 0 ? `可能爆音：人聲最大峰值 ${fmtDb(r2(pk))}（超過 0 dB）→ 把人聲往下調，或用「人聲標準化」` : ''; }
}
function renderCapButtons() {
  const st = insertInfo('after'), b = $('#capAdd');
  b.classList.toggle('is-disabled', !st.ok);
  b.dataset.why = st.ok ? '' : st.why;
}
// 預覽框照畫布：比例（CSS 變數 --cw／--ch）、字幕圖層的位置、即時模擬的講者小視窗（直式是下半的講者面板）
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
// 錯誤一則一則列；提醒照 issues.mjs 歸併成白話，給 AI 的收起來（原文可以整份複製）
const hideBtn = (raws) => `<button class="small chk-hide" data-chk-hide="${esc(JSON.stringify([...new Set(raws.map(hideKey))]))}" title="藏起來、不算進錯誤和提醒數；下面「已隱藏」可以還原">判斷錯了，隱藏</button>`;
function errorItem(s, { hide = false } = {}) {
  const id = issueId(s);
  const head = s.replace(/^\[[^\]]*\]\s*/, '');
  const j = head.indexOf('→');
  // 版面檢查（改字後量的）：問題寫白話（拿掉 CSS 選擇器），改法是寫給 AI 的，收起來
  const layout = /^版面/.test(head);
  const what = layout ? plainText(j >= 0 ? head.slice(0, j) : head).trim() : (j >= 0 ? head.slice(0, j) : head);
  const fix = j >= 0 ? head.slice(j + 1).trim() : '';
  const body = !fix ? esc(what) : layout ? `${esc(what)}<details class="chk-fix"><summary>給 AI 的改法</summary><span class="fix">${esc(fix)}</span></details>` : `${esc(what)}<span class="fix">→ ${esc(fix)}</span>`;
  return `<li class="err"${id ? ` data-id="${esc(id)}"` : ''}><span class="sym">✖</span>${id ? `<b class="chk-id">${esc(id)}</b> ` : ''}${body}${hide ? hideBtn([s]) : ''}</li>`;
}
function groupItem(g, { hide = false } = {}) {
  const many = g.ids.length > 1;
  const one = g.ids.length === 1 ? ` data-id="${esc(g.ids[0])}"` : '';
  const action = g.action === 'speaker' ? ' data-chk-act="speaker"' : '';
  const ids = many ? `<div class="chk-ids">${g.ids.slice(0, 80).map((id) => `<button class="chk-seg" data-seg="${esc(id)}">${esc(id)}</button>`).join('')}</div>` : '';
  // 字幕的問題：列出是哪幾句，點了跳過去（只有一句時整列都能點）
  const cue1 = g.cues?.length === 1 ? ` data-chk-cue="${g.cues[0]}"` : '';
  const cues = g.cues?.length ? `<div class="chk-ids">${g.cues.slice(0, 80).map((n) => `<button class="chk-seg" data-chk-cue="${n}">#${n}</button>`).join('')}</div>` : '';
  return `<li class="warn"${one}${action}${cue1}><span class="sym">⚠</span><b>${esc(g.title)}</b>${g.hint ? `<div class="chk-hint">${esc(g.hint)}</div>` : ''}${ids}${cues}${hide ? hideBtn(g.raw) : ''}</li>`;
}
function issueItems(errors = [], warnings = [], limit = 300, { hide = false } = {}) {
  const G = groupIssues(errors, warnings);
  const all = [...G.errors.map((s) => errorItem(s, { hide })), ...G.author.map((g) => groupItem(g, { hide }))];
  const ai = G.ai.length ? `<li class="chk-ai"><details><summary>給 AI 的細節（${G.counts.ai} 則）</summary><ul class="chk-ailist">${G.ai.map((g) => `<li><b>${esc(g.title)}</b>${g.ids.length ? `<span class="mute">　${esc(g.ids.slice(0, 8).join('、'))}${g.ids.length > 8 ? '…' : ''}</span>` : ''}</li>`).join('')}</ul><button class="small" data-chk-copy>複製原文給 AI</button></details></li>` : '';
  return all.slice(0, limit).join('') + (all.length > limit ? `<li>…還有 ${all.length - limit} 則</li>` : '') + ai;
}
// 作者按「判斷錯了，隱藏」的不算進錯誤、提醒數（hidden 另外列，可以還原）；存檔失敗的錯誤不能藏
function currentIssues() {
  const rep = app.report, au = app.saveErrors ? null : app.auditIssues;
  if (app.saveErrors) return { errors: app.saveErrors, warnings: [], hidden: [] };
  return splitHidden([...(au?.errors || []), ...(rep?.issues?.errors || [])], [...(au?.warnings || []), ...(rep?.issues?.warnings || [])], app.hiddenChecks);
}
function hiddenItems(hidden) {
  if (!hidden?.length) return '';
  const n = hidden.reduce((t, h) => t + h.n, 0);
  return `<li class="chk-hidden"><details><summary>已隱藏 ${n} 則（你判斷是錯的）</summary><ul class="chk-hiddenlist">${hidden.map((h) => `<li><span class="mute">${h.level === 'error' ? '✖' : '⚠'}</span> ${h.id ? `<b>${esc(h.id)}</b> ` : ''}${esc(h.text)}${h.n > 1 ? `<span class="mute">（同類 ${h.n} 則）</span>` : ''} <button class="small" data-chk-unhide="${esc(h.key)}">還原</button></li>`).join('')}</ul></details></li>`;
}
async function setHidden(keys, on) {
  const next = new Set(app.hiddenChecks);
  for (const k of keys) { if (on) next.add(k); else next.delete(k); }
  app.hiddenChecks = next;
  renderCheck();
  const r = await api('POST', '/api/check/hidden', { keys: [...next] });
  if (!r.ok) toast(`沒存到：${r.data?.message || '連不到剪輯台'}（重新整理後會再出現）`, 'warn', 5000);
  else toast(on ? '已隱藏，不算進錯誤數；在「已隱藏」裡可以還原' : '已還原', 'ok', 3000);
}
function renderCheck() {
  const rep = app.report;
  const sum = $('#checkSummary'), list = $('#checkList');
  const { errors, warnings, hidden } = currentIssues();
  const G = groupIssues(errors, warnings);
  // 給段落清單和時間軸用：只標作者要看的（給 AI 的細節不標）
  app.authorFlags = new Set([...G.errors.map(issueId).filter(Boolean), ...G.author.flatMap((g) => g.ids)]);
  if (app.saveErrors) sum.innerHTML = '<b class="err-ink">沒有存成功</b>：你的修改還留在頁面上，改好下面的問題就會自動存。';
  else if (!rep) sum.innerHTML = '<span class="mute">檢查中…</span>';
  else {
    const d = rep.data;
    const look = G.author.length ? `有 ${G.author.length} 件事可以看一下（不改也能輸出）。` : '沒有要你處理的事。';
    // 初剪還沒排段落：不寫「0 段」
    const facts = [(d.items || []).length ? `${d.items.length} 段` : '', Number.isFinite(d.outputDur) ? `完成影片 ${fmt(d.outputDur, 0)}` : ''].filter(Boolean).join('、');
    if (d) sum.innerHTML = errors.length ? `<b class="err-ink">${errors.length} 個錯誤</b>要先改好才能更新預覽；點一則跳到那一段。`
      : `<span class="ok-ink">✓ 可以輸出</span>${facts ? `：${facts}` : ''}。${look}`;
    else sum.innerHTML = `<b class="warn-ink">${rep.fallback ? '簡易檢查' : '讀不到檢查報告'}</b>：${esc(rep.error || '')}${rep.log ? `<details><summary>訊息</summary><pre>${esc(rep.log)}</pre></details>` : ''}`;
  }
  // 剛在剪輯台改字的段：重新產生後量的版面（audit），放最前面
  const au0 = app.saveErrors ? null : app.auditIssues;
  const au = au0 && { ids: au0.ids, ...splitHidden(au0.errors, au0.warnings, app.hiddenChecks) };
  if (au && (au.errors.length || au.warnings.length)) {
    sum.innerHTML = `<b class="${au.errors.length ? 'err-ink' : 'warn-ink'}">剛改字的 ${esc(au.ids.join('、'))} 版面有 ${au.errors.length + au.warnings.length} 個問題</b>：改短一點或改回原本的字；要重新排版請寫進修改單給 AI。<br>${sum.innerHTML}`;
  }
  list.innerHTML = (issueItems(errors, warnings, 300, { hide: !app.saveErrors }) || (rep?.data ? '<li class="mute">沒有任何錯誤或提醒</li>' : '')) + hiddenItems(hidden);
  renderStatus();
  // 分頁上分清楚：✖＝要先改才能輸出，⚠＝看一下就好
  const tab = $('.side-tabs [data-side="issues"]');
  tab.textContent = errors.length ? `檢查 ✖${errors.length}` : G.author.length ? `檢查 ⚠${G.author.length}` : '檢查';
  timeline.invalidate();
}
function openIssues() { setSide('issues'); }
function renderMode() {
  const pv = app.server?.preview;
  const avail = !!pv?.player?.available, built = !!pv?.built;
  const pbtn = $('.seg [data-mode="player"]');
  pbtn.classList.toggle('is-disabled', !avail || !built);
  pbtn.dataset.tip = !avail ? `完成影片預覽不能用：${pv?.player?.reason || ''}（已退回快速試聽）` : !built ? '還沒有完成影片：先按「更新預覽」' : '看完整的成品：字卡、動畫、字幕、音效都有';
  for (const b of $$('.seg button')) { const on = b.dataset.mode === app.mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
  const note = $('#modeNote');
  const fin = app.finalInfo;
  if (roughStage()) note.innerHTML = '';   // 上面的提示已經講了
  else if (app.mode === 'player') {
    note.innerHTML = pv?.stale || isDirty() ? `<span class="warn-ink">有新修改</span>，按「更新預覽」才看得到${esc(lastBuildText())}`
      : fin?.exists && !fin.stale ? `已輸出過：<a href="${esc(fin.url)}" target="_blank" rel="noopener">播放完成影片</a>` : '';
  } else {
    note.innerHTML = !avail ? '<span class="mute">找不到播放器，只能用快速試聽</span>'
      : !built ? `按「更新預覽」做一次，就看得到字卡和動畫${esc(lastBuildText())}` : '這裡沒有字卡和動畫，看完整畫面請切到完成影片預覽';
  }
  renderHeader();
}
// 流程列要知道這一頁現在是字幕預覽，不是完成影片
function renderFlowHere() {
  const here = roughStage() ? 'rough' : '';
  if (document.body.dataset.flowHere !== here) { document.body.dataset.flowHere = here; window.dispatchEvent(new Event('flow-here')); }
  renderNext();
}
// 頂列常駐的下一步：看片、調整做完要去哪裡
let flowNow = null;
window.addEventListener('flow-state', (e) => { flowNow = e.detail; renderNext(); });
function renderNext() {
  const el = $('#next');
  if (!el || !app.server) return;
  const waitingFinal = flowNow?.stop?.startsWith('④'), waitingEditor = flowNow?.stop?.startsWith('⑤');
  const html = !app.server.plan.exists || app.server.plan.error ? ''
    : roughStage() ? '校完不用回報，<b>AI 會接著做</b>'
      : waitingFinal || (!waitingEditor && new URLSearchParams(location.search).get('view') === 'final') ? '沒問題按<b>輸出完成影片</b>；要改就寫修改單'
        : '調好後回對話說「<b>調好了</b>」';
  if (el.innerHTML !== html) { el.innerHTML = html; el.title = el.textContent; }
  el.hidden = !html;
}

// ---------- 主題（亮／暗；plan.json 第一層 "theme"，specs/010-motion-v2/design-system.md §10）----------
// 不寫＝亮色。完成影片預覽在切換時直接改播放器 iframe 的 <html data-theme>（build 也是寫在主合成的 <html>），不用重新產生就看得到配色
const normTheme = (v) => (v === 'dark' ? 'dark' : 'light');
function inspTheme() {
  // 用屬性面板的 .seg-btns（不能用 .seg：預覽模式切換會把所有 .seg button 的 on 重設）
  const b = (v, label, tip) => `<button class="${app.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}" aria-pressed="${app.theme === v}" data-tip="${esc(tip)}">${label}</button>`;
  return `<div class="seg-btns theme-seg" role="group" aria-label="主題">${b('light', '亮', '米白底、白卡（預設）')}${b('dark', '暗', '石墨黑底、玻璃卡')}</div>
    <p class="ip-note">字卡和全畫面動畫的配色。在完成影片預覽馬上看得到；按「更新預覽」才會做進去。</p>`;
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
const lookOut = (k, v) => (v > 0 ? Number(v).toFixed(2) : '關');
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
  if (L.error) return `<p class="ip-warn">${esc(L.error)}</p>`;
  const e = { beauty: 0, ...lookEff() }, lim = { beauty: [0, 1], ...(L.limits || { color: [0, 1], slim: [0, 1.2], step: 0.05 }) }, kit = lookKit();
  // 和構圖頁一樣：左邊勾選開關，右邊滑桿調強度
  const row = (k, label, max, tip) => `<div class="ip-slider look" data-tip="${esc(tip)}"><label><input type="checkbox" data-look-on="${k}"${e[k] > 0 ? ' checked' : ''} aria-label="${label}開關"> ${label}</label><input type="range" data-f="look.${k}" aria-label="${label}強度" min="0" max="${max}" step="${lim.step}" value="${e[k]}"><output data-out="look.${k}" class="${e[k] !== kit[k] ? 'changed' : ''}">${lookOut(k, e[k])}</output></div>`;
  const lm = L.landmarks || {};
  // 略過瘦臉（small／noface／rate）時只印一行原因，不放前後對照（重跑也一樣會略過）
  const skip = {
    small: `畫面裡的臉太小（臉寬約 ${Math.round(lm.medianFaceWidth || 0)} px），瘦臉看不出來，完成影片只調光。`,
    noface: '抽樣 12 格都沒偵測到臉，這支只調光；確定畫面裡有講者，請 AI 重新偵測臉部。',
    rate: `只有 ${Math.round((lm.rate || 0) * 100)}% 的格偵測到臉（不到 80%），自動關掉瘦臉，完成影片只調光；請 AI 看 work/look-preview.jpg。`,
  };
  const faces = !lm.ready ? '<p class="ip-note">要看瘦臉的前後對照，先到「構圖」頁按「偵測臉部」（長片要二、三十分鐘，在背景跑）。</p>'
    : lm.slimOk === false ? `<p class="ip-note">${esc(skip[lm.reason] || '這支略過瘦臉，完成影片只調光。')}</p>`
      : `<div id="lookFaces" class="look-faces"><figure><img data-k="before" alt="原本"${faceSrc('before')}><figcaption>前</figcaption></figure><figure><img data-k="after" alt="瘦臉後"${faceSrc('after')}><figcaption>後（瘦臉 ${lookOut('slim', e.slim)}${e.beauty > 0 ? `、美顏 ${lookOut('slim', e.beauty)}` : ''}）</figcaption></figure><p class="look-msg ip-note"></p></div>`;
  setTimeout(() => refreshFaces(0), 0);
  return `${row('color', '調光', lim.color[1], '亮一點、膚色紅潤一點（剪映「智能調色」）；拖的時候畫面馬上變，是近似效果，完成影片會更準')}
    ${row('slim', '瘦臉', lim.slim[1], '臉頰到下巴的輪廓往內收；按「更新預覽」才會做進去（長片第一次要幾分鐘）')}
    ${row('beauty', '美顏', lim.beauty[1], '磨皮、膚色提亮、淡化黑眼圈，越往右越明顯；和瘦臉一起做進底片，按「更新預覽」才會做進去；快速試聽看不到，看下面「後」那張臉')}
    <div class="ip-btns"><button class="small" data-act="lookReset"${app.look ? '' : ' disabled'} data-tip="回到每支影片共用的設定（調光 ${kit.color}、瘦臉 ${kit.slim}、美顏 ${kit.beauty}）">恢復預設</button></div>
    ${faces}`;
}

// ---------- 屬性面板 ----------
const fmtTime = (v) => (typeof v === 'string' ? v : Number.isFinite(v) ? `${r2(v)} 秒` : '—');
const sliderRow = (label, f, v, { min = -60, max = 12, step = 0.5, out, def = 0, tip = '' } = {}) => `<div class="ip-slider"${tip ? ` data-tip="${esc(tip)}"` : ''}><label>${label}</label><input type="range" aria-label="${esc(label)}" data-f="${f}" min="${min}" max="${max}" step="${step}" value="${v ?? def}"><output data-out="${f}" class="${(v ?? def) !== def ? 'changed' : ''}">${out}</output></div>`;
// 整支影片的設定一項一區，可以收起來；標題帶現在的值，收著也看得到（開合記著，重畫不會跳回去）
const FOLD_OPEN = { look: true, sound: true };
app.folds = {};
const foldSec = (key, title, body) => `<details class="ip-sec ip-fold" data-ipfold="${key}"${(app.folds[key] ?? FOLD_OPEN[key] ?? false) ? ' open' : ''}><summary>${esc(title)}</summary>${body}</details>`;
function renderInspector() {
  const s = app.selection;
  let kind = '整支影片', title = '整支影片的設定', chip = '', body = '';
  if (!s) body = inspWhole();
  else if (s.kind === 'cue') { const c = app.cues.find((q) => q.n === s.id); kind = '字幕'; title = `第 ${s.id} 句`; body = inspCue(c); }
  else if (s.kind === 'item' || s.kind === 'media') {
    const it = app.itemsView.find((x) => x.id === s.id), sc = sceneById(s.id);
    const type = segType(sc) || it?.type;
    kind = type === 'custom' ? customKind(sc) : (TYPE_ZH[type] || '段落'); chip = `var(--c-${type})`; title = it?.title || s.id;
    kind = `${kind}　${it ? `${fmt(outOf(it.start, app.edit.cuts), 0)}–${fmt(outOf(it.end, app.edit.cuts), 0)}　` : ''}${s.id}`;
    body = type === 'media' ? inspMedia(it, sc) : inspItem(it, sc);
  } else if (s.kind === 'cut') { kind = '剪掉的範圍'; title = rangeTitle(...app.edit.cuts[s.id]); body = inspCut(s.id); }
  else if (s.kind === 'piece') { const p = app.pieces.find((q) => q.key === s.id); kind = '主軌片段'; title = rangeTitle(p.a, p.b); body = inspRange(p.a, p.b, true); }
  else if (s.kind === 'range') { kind = '選取範圍'; title = rangeTitle(app.sel.a, app.sel.b); body = inspRange(app.sel.a, app.sel.b, false); }
  else if (s.kind === 'join') { const p = app.points.find((q) => Math.abs(q.at - s.id) < 1e-6); kind = '剪接點（轉場）'; title = `${fmt(p.at, 1)}　${KIND_ZH[p.kind]}`; body = inspJoin(p); }
  else if (s.kind === 'gain') { const g = app.edit.gains[s.id]; kind = '人聲範圍音量'; title = rangeTitle(g.from, g.to); body = inspGain(s.id); }
  else if (s.kind === 'sfx') { const it = app.itemsView.find((x) => x.id === s.id); kind = `音效　${s.id}`; title = it?.title || s.id; body = inspSfxOnly(it, sceneById(s.id)); }
  else if (s.kind === 'gap') { const g = gapInfo(s.id); kind = '沒有字卡的講解'; title = rangeTitle(g.start, g.end); body = `<section class="ip-sec"><p class="ip-note">這段只有講者，沒有字卡或動畫。想加畫面就寫進修改單；留給講者不用管。</p><div class="ip-btns"><button class="small" data-act="gapReq">✎ 這裡想加畫面</button></div></section>`; }
  $('#inspKind').innerHTML = `${chip ? `<span class="chip" style="background:${chip}"></span>` : ''}${esc(kind)}`;
  $('#inspTitle').textContent = title;
  $('#inspBody').innerHTML = body;
  $('#inspBody').scrollTop = 0;
}
const rangeTitle = (a, b) => `${fmt(a, 1)} – ${fmt(b, 1)}（${fmtSec(b - a)}）`;
function inspWhole() {
  const e = app.edit;
  const pk = voicePeakMax();
  const L = app.loud;
  const longCaps = app.cues.filter((c) => visibleLen(c.text) > capMax()).length;
  const lookNow = lookEff();
  const lookLabel = [lookNow.color > 0 && '調光', lookNow.slim > 0 && '瘦臉', lookNow.beauty > 0 && '美顏'].filter(Boolean).join('、') || '都關';
  return `${foldSec('look', `講者：${lookLabel}`, inspLook())}${foldSec('sound', `聲音：人聲 ${fmtDb(e.volume.voice)}`, `
    ${sliderRow('人聲', 'vol.voice', e.volume.voice, { out: fmtDb(e.volume.voice), tip: '講者的聲音（主軌）整條的音量' })}
    ${sliderRow('音效', 'vol.sfx', e.volume.sfx, { out: fmtDb(e.volume.sfx), tip: '全部音效一起調' })}
    ${sliderRow('素材原聲', 'vol.media', e.volume.media, { out: fmtDb(e.volume.media), tip: '素材有開原聲的才算' })}
    <div class="ip-btns"><button data-act="loud" data-tip="量整支人聲的音量（剪掉的範圍不算），調到 YouTube 常用的標準（${app.server?.targetLufs ?? -14} LUFS）">把人聲調到 YouTube 標準音量</button></div>
    ${L ? `<div class="ip-result">${L.error ? `<span class="err-ink">${esc(L.error)}</span>` : `量到 <b>${L.integrated} LUFS</b>（峰值 ${L.truePeak ?? '—'} dBFS）→ 人聲設成 <b>${fmtDb(L.suggest)}</b>${L.raw !== L.suggest ? `（要 ${fmtDb(L.raw)}，超出範圍）` : ''}`}</div>` : ''}
    ${pk != null && pk > 0 ? `<p class="ip-warn">⚠ 可能爆音：人聲最大峰值 ${fmtDb(r2(pk))} → 把人聲往下調，或按上面的標準音量</p>` : ''}
    <p class="ip-note">只調某一段的人聲：在時間軸拖曳選一段範圍，再按「調整這段人聲音量」，或直接拖範圍裡的黃線。</p>`)}
  ${foldSec('theme', `主題：${app.theme === 'dark' ? '暗' : '亮'}`, inspTheme())}
  ${foldSec('fade', `淡入淡出：${e.fadeIn || e.fadeOut ? `${e.fadeIn ? `開頭 ${e.fadeIn.toFixed(1)} 秒` : ''}${e.fadeIn && e.fadeOut ? '、' : ''}${e.fadeOut ? `結尾 ${e.fadeOut.toFixed(1)} 秒` : ''}` : '不淡'}`, `
    ${sliderRow('開頭淡入', 'fadeIn', e.fadeIn, { min: 0, max: 5, step: 0.1, out: e.fadeIn ? `${e.fadeIn.toFixed(1)} 秒` : '不淡', def: 0 })}
    ${sliderRow('結尾淡出', 'fadeOut', e.fadeOut, { min: 0, max: 5, step: 0.1, out: e.fadeOut ? `${e.fadeOut.toFixed(1)} 秒` : '不淡', def: 0 })}`)}
  ${foldSec('joins', `轉場：${app.points.length} 個剪接點、${e.joins.length} 個有轉場`, `
    <div class="ip-btns"><button class="small" data-act="bulk" data-v="none">全部無</button><button class="small" data-act="bulk" data-v="dip">全部過黑</button><button class="small" data-act="bulk" data-v="alt" data-tip="第 2、4、6… 個剪接點放大：講解跳接時一近一遠">交替放大</button></div>
    <p class="ip-note">點主軌上緣的菱形可以單獨設定：空心＝無、白＝過黑、黃＝放大。</p>`)}
  ${foldSec('cuts', `剪掉的範圍：${e.cuts.length ? `${e.cuts.length} 段，共 ${fmtSec(cutTotal(e.cuts))}` : '沒有'}`, `
    <ol class="cut-list">${e.cuts.length ? e.cuts.map(([a, b], i) => `<li data-i="${i}"><span class="rng" data-act="gocut" data-i="${i}">${fmt(a, 1)} – ${fmt(b, 1)}</span><span class="dim">${fmtSec(b - a)}</span><button class="small ghost" data-act="restore" data-i="${i}">恢復</button></li>`).join('') : '<li class="empty">還沒有剪掉任何範圍</li>'}</ol>`)}
  ${foldSec('caps', `字幕：${app.cues.length} 句${longCaps ? `，${longCaps} 句太長` : ''}`, `
    <div class="ip-row"><span class="k">句數</span><span class="v">${app.cues.length} 句${longCaps ? `，<span class="warn-ink">${longCaps} 句超過 ${capMax()} 字</span>` : ''}</span></div>
    <div class="ip-btns"><button class="small" data-act="find">尋找與取代</button></div>`)}`;
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
      <div class="hint">直接打字就會改，自動存。分割＝在播放頭的時間、文字游標的位置切成兩句。</div></div>
    <div class="ip-row"><label>開始</label><input class="tcv" aria-label="這句開始的時間" data-f="capStart" value="${fmtTC(c.start)}" data-tip="時:分:秒:格，或直接打秒數"></div>
    <div class="ip-row"><label>結束</label><input class="tcv" aria-label="這句結束的時間" data-f="capEnd" value="${fmtTC(c.end)}" data-tip="時:分:秒:格，或直接打秒數"></div>
    <div class="ip-row"><span class="k">長度</span><span class="v">${fmtSec(c.end - c.start)}</span></div>
    <div class="ip-btns">
      ${btn('capSplit', '✂ 分割（B）', sp)}${btn('capMerge', '與下一句合併', mg)}<button class="small danger" data-act="capDel">刪除</button>
    </div>
    <div class="ip-btns">${btn('capInsBefore', '＋ 前面新增', insB)}${btn('capInsAfter', '＋ 後面新增', insA)}<button class="small ghost" data-act="capPlay">▶ 播這句</button></div>
  </section>
  <section class="ip-sec"><h3>綁在這句的時間</h3>
    ${refs.length ? `<ul class="ref-list">${refs.map((r) => `<li>· <b>${esc(r.id)}</b>　${esc(r.ref)}</li>`).join('')}</ul><p class="ip-note">分割、合併、刪除時，這些句號會自動跟著改。</p>` : '<p class="ip-note">沒有字卡、動畫或素材綁在這句。</p>'}
  </section>`;
}
function sfxSection(it, sc) {
  if (!sc) return '';
  const marks = app.sfxView.filter((m) => m.segId === sc.id);
  const muted = sc.sfx === null;
  const v = Number.isFinite(sc.sfxVolume) ? sc.sfxVolume : 0;
  const mem = app.sfxMemory[sc.id];
  return `<section class="ip-sec"><h3>音效</h3>
    ${marks.length ? `<div class="chips">${marks.map((m) => `<span class="chip-t">${m.main ? '主' : '附加'}・${esc(m.name)}${m.muted ? '（靜音）' : ''} ${fmt(m.at, 1)}</span>`).join('')}</div>` : `<p class="ip-note">${app.reportReady ? '這段沒有音效' : '音效位置要等檢查報告'}</p>`}
    <div class="ip-btns"><button class="small toggle${muted ? ' on' : ''}" data-act="sfxMute" aria-pressed="${muted}">${!muted ? '靜音主音效' : mem || savedSceneById(sc.id)?.sfx !== null ? '主音效已靜音（按一下還原）' : 'AI 設定這段不放主音效（按一下加回預設音效）'}</button></div>
    ${muted && mem?.had && mem.value ? `<p class="ip-note">還原會換回 AI 原本寫的「${esc(mem.value)}」。</p>` : ''}
    ${sliderRow('這段音量', 'sfxVolume', v, { out: fmtDb(v), tip: '這段的主音效和附加音效一起調（疊在整支的音效音量上）' })}
  </section>`;
}
function inspSfxOnly(it, sc) { return `${sfxSection(it, sc)}<section class="ip-sec"><div class="ip-btns"><button class="small" data-act="selItem" data-id="${esc(sc?.id)}">看這段的其他屬性</button></div></section>`; }
// 這段實際的進場、出場（工具照前後段決定的）
function transitionRows(it) {
  const tr = it && transitionOf(it);
  if (!tr?.inText && !tr?.outText) return '';
  return `<section class="ip-sec" id="txSec"><h3>進場／出場</h3>
    <div class="ip-row"><span class="k">進場</span><span class="v">${esc(tr.inText || '—')}</span></div>
    <div class="ip-row"><span class="k">出場</span><span class="v">${esc(tr.outText || '—')}</span></div>
    <p class="ip-note">工具照前後段自動決定。想換寫進修改單。</p></section>`;
}
function inspItem(it, sc) {
  if (!sc) return '<p class="ip-note">找不到這段（可能被 AI 改名或刪掉了）</p>';
  const type = segType(sc);
  const def = type === 'scene' ? findSceneDef(app.server?.schema?.scenes, sc.scene) : type === 'fx' ? findFxDef(app.server?.schema?.fx, sc.fx) : null;
  const pv = app.server?.preview;
  // 快速試聽看不到字卡和動畫：面板放分鏡表的截圖，選了才知道它長什麼樣
  const shot = app.mode !== 'player' ? `<a class="ip-shot" href="/storyboard-preview/${encodeURIComponent(sc.id)}.png" target="_blank" rel="noopener" title="放大看"><img src="/storyboard-preview/${encodeURIComponent(sc.id)}.png" alt="${esc(sc.id)} 的畫面"></a>` : '';
  return `<section class="ip-sec">${shot}
    <div class="ip-row"><span class="k">綁在</span><span class="v">${esc(refZh(sc.from ?? sc.at))} → ${esc(sc.to != null ? refZh(sc.to) : sc.duration != null ? `${sc.duration} 秒後` : '預設長度')}</span></div>
    <div class="ip-btns">${pv?.player?.available && pv?.built && app.mode !== 'player' ? '<button class="small primary" data-act="playerItem">在完成影片預覽看</button>' : ''}<button class="small ghost" data-act="playItem">▶ 播這段</button><button class="small ghost" data-act="rqOpen" data-tip="換動畫、加字、重新排版：寫進右側修改單給 AI">✎ 寫進修改單</button></div>
  </section>
  <section class="ip-sec"><h3>文字${def ? `（${esc(def.zh)}）` : ''}</h3>${type !== 'custom' ? textFields(sc, def, type) : sc.template ? templateFields(sc) : '<p class="ip-note">這段動畫的字畫在動畫裡，要改請寫進修改單。</p>'}
    <p class="ip-note">${type === 'scene' ? '<code>**詞**</code> 套主色、<code>//</code> 換行（只有標「可強調」的欄位）。' : ''}${type !== 'custom' ? '在完成影片預覽打字，畫面上的字會跟著換；按「更新預覽」才會做進去並量版面，字太長會列在「檢查」分頁。清單只能刪項目。' : sc.template ? '按「更新預覽」才會做進去並量版面，字太長會列在「檢查」分頁。' : ''}要加項目、換動畫、重新排版：寫進修改單給 AI。</p>
  </section>
  ${transitionRows(it)}
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
  if (!keys.length) return '<p class="ip-note">這段用模板預設的文字；要改請寫進修改單。</p>';
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
// 模板動畫的字（和分鏡表同一份欄位）：只有畫面上的字，圖示、時間不顯示；清單不能增刪
function templateFields(sc) {
  const def = customDef(sc), slots = sc.slots || {}, out = [];
  if (def?.generator === 'scene') {
    if (typeof slots.title === 'string') out.push(textInput(['slots', 'title'], slots.title, def.slots?.title, def.slots?.title?.label || '標題'));
    const walk = (parts, base) => (parts || []).forEach((p, i) => {
      if (Array.isArray(p.parts)) walk(p.parts, [...base, i, 'parts']);
      else if (typeof p.label === 'string') out.push(textInput([...base, i, 'label'], p.label, null, `元件 ${p.id ?? i + 1}`));
    });
    walk(slots.parts, ['slots', 'parts']);
  } else if (def) {
    for (const [k, d] of Object.entries(def.slots)) {
      const v = slots[k];
      if (d.type === 'list' && Array.isArray(v)) {
        v.forEach((it, i) => {
          const lb = `${d.label || k} ${i + 1}`;
          if (typeof it === 'string') out.push(textInput(['slots', k, i], it, null, lb));
          else if (isObj(it)) for (const [f, fd] of Object.entries(d.item || {})) if (isTextDecl(fd) && typeof it[f] === 'string' && it[f]) out.push(textInput(['slots', k, i, f], it[f], fd, f === 'text' ? lb : `${lb} ${fd.label || f}`));
        });
      } else if (isTextDecl(d) && typeof v === 'string' && v) out.push(textInput(['slots', k], v, d, d.label || k));
    }
  }
  return out.join('') || '<p class="ip-note">這段沒有可以直接改的字；要改請寫進修改單。</p>';
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
  const K = it?.knots?.length >= 2 ? it.knots : null;
  const used = it && !isImg ? (K ? K[K.length - 1][1] : (sc.in || 0) + len * (sc.speed || 1)) : null;
  const srcIn = K ? K[0][1] : (sc.in || 0);
  const speedNote = !K ? `×${sc.speed || 1}` : sc.hold != null ? '定格' : K.length === 2 ? `×${r2((K[1][1] - K[0][1]) / (K[1][0] - K[0][0]))}` : K.slice(1).map((k, i) => { const dt = k[0] - K[i][0], sp = (k[1] - K[i][1]) / dt; return `${r2(dt)} 秒${sp === 0 ? '定格' : ` ×${r2(sp)}`}`; }).join('、');
  const opt = (v, more = []) => [...TRANS, ...more].map(([k, l]) => `<option value="${k}"${(v ?? 'fade') === k ? ' selected' : ''}>${l}${k === 'fade' && v == null ? '（預設）' : ''}</option>`).join('');
  return `<section class="ip-sec">
    <div class="ip-row"><span class="k">素材</span><span class="v" style="word-break:break-all">${esc(sc.src || '（沒有寫 src）')}<span class="dim">　${isImg ? '圖片' : `影片${srcDur ? ` ${fmtSec(srcDur)}` : ''}`}</span></span></div>
    <div class="ip-btns"><button class="small ghost" data-act="playItem">▶ 播這段</button><button class="small ghost" data-act="rqOpen" data-tip="換錄影、加標註、推近、改成動畫：寫進右側修改單給 AI">✎ 寫進修改單</button></div>
  </section>
  <section class="ip-sec"><h3>時間（拖時間軸上的左右邊緣也可以）</h3>
    <div class="ip-row"><span class="k">起點</span><span class="v"><span class="tcv">${it ? fmt(it.start, 1) : ''}</span>　<span class="dim">${esc(refZh(sc.from))}</span></span></div>
    <div class="ip-row"><span class="k">終點</span><span class="v"><span class="tcv">${it ? fmt(it.end, 1) : ''}</span>　<span class="dim">${esc(sc.to != null ? refZh(sc.to) : sc.duration != null ? `${sc.duration} 秒後` : '—')}</span></span></div>
    <div class="ip-row"><span class="k">長度</span><span class="v">${len != null ? fmtSec(len) : '—'}</span></div>
    ${isImg ? '' : `<div class="ip-row"><label for="mIn">素材入點</label><span class="v">${sc.retime || sc.hold != null || sc.out != null ? `${r2(srcIn)} 秒` : `<input id="mIn" type="number" data-f="mediaIn" min="0" step="0.1" value="${r2(sc.in || 0)}" style="width:90px"> 秒`}<span class="dim">　速度 ${esc(speedNote)}</span></span></div>
    ${used != null && srcDur ? `<p class="${used > srcDur + 0.05 ? 'ip-err' : 'ip-note'}">用到素材 ${r2(srcIn)}–${r2(used)} 秒（素材共 ${r2(srcDur)} 秒）${used > srcDur + 0.05 ? ' ✖ 超過素材長度' : ''}</p>` : ''}`}
  </section>
  ${isImg || !it ? '' : speedSection(it, sc)}
  ${isImg ? '' : `<section class="ip-sec"><h3>原聲</h3>
    ${sc.retime || sc.hold != null ? '<p class="ip-note">變速、定格的段不保留原聲。</p>' : `<div class="ip-btns"><button class="small toggle${vol != null ? ' on' : ''}" data-act="mediaVolOn" aria-pressed="${vol != null}">${vol != null ? '保留原聲（按一下靜音）' : '原聲靜音（按一下保留）'}</button></div>
    ${vol != null ? sliderRow('原聲音量', 'mediaVol', vol, { out: fmtDb(vol) }) : ''}`}
  </section>`}
  <section class="ip-sec"><h3>進場／出場</h3>
    <div class="ip-row"><label>進場</label><select aria-label="進場" data-f="enter">${opt(sc.enter, [...(isImg ? [['tape', '紙膠帶貼上']] : []), ...(sc.fit === 'cover' ? [] : [['tilt', '斜躺擺平']])])}</select></div>
    <div class="ip-row"><label>出場</label><select aria-label="出場" data-f="exit">${opt(sc.exit)}</select></div>
    ${it ? (() => { const tr = transitionOf(it); return `<p class="ip-note" id="txNow">現在實際：${esc(tr.inText)}進場、${esc(tr.outText)}出場（接在別的整張幕後面時，工具會自動調整）。</p>`; })() : ''}
  </section>
  ${mediaNotes(it, sc)}
  ${sfxSection(it, sc)}`;
}
// ---------- 畫面速度：段內分區，每區一個倍速（editor/speed.mjs）---------- 講話的時間不變，只改畫面走多快
const speedAt = (at, start) => { const t = noteTime(at, { start }); return t == null ? null : t - start; };
function speedModel(sc, len, start, knots) { return modelOf(sc, len, { knots, resolveAt: (at) => speedAt(at, start) }); }
function speedDirty(sc, sb) { return SPEED_KEYS.some((k) => !same(sc[k], sb?.[k])); }
// 切開的點：前後還是同一個速度時 plan.json 寫不出來（同速就是同一區），先記在這裡，選了速度才真的寫進去
const speedCuts = {};
function speedNow(it, sc) {
  let m = speedModel(sc, it.end - it.start, it.start, it.knots);
  for (const t of speedCuts[it.id] || []) m = cutAt(m, t) || m;
  return m;
}
// 播放頭在這段裡的段內秒；不在這段就當段起點
function speedT(it) { return app.t >= it.start && app.t < it.end ? app.t - it.start : 0; }
function speedSection(it, sc) {
  const len = it.end - it.start;
  const model = speedNow(it, sc);
  const inside = app.t >= it.start && app.t < it.end;
  const cur = zoneAt(model, speedT(it));
  const strip = model.zones.map((z) => {
    const cls = z.rate === 0 ? 'hold' : z.rate > 1 ? 'fast' : z.rate < 1 ? 'slow' : 'plain';
    return `<button class="sp-zone sp-${cls}" data-act="spZone" data-t="${it.start + z.from}" style="flex:${Math.max(0.01, z.to - z.from)} 1 0" data-tip="${esc(`${fmtSec(z.to - z.from)} ${speedLabel(z.rate)}`)}"><span>${esc(speedLabel(z.rate))}</span></button>`;
  }).join('');
  const rates = SPEEDS.map((r) => `<button class="small toggle${cur.rate === r ? ' on' : ''}" data-act="spRate" data-r="${r}" aria-pressed="${cur.rate === r}">${esc(speedLabel(r))}</button>`).join('');
  const hasNotes = NOTE_KINDS.some(([k]) => Array.isArray(sc[k]) && sc[k].length);
  return `<section class="ip-sec" id="speedSec"><h3>畫面速度</h3>
    <div class="sp-strip" id="spStrip" data-start="${it.start}" data-len="${len}">${strip}<i class="sp-head" id="spHead"${inside ? '' : ' hidden'} style="left:${(speedT(it) / len) * 100}%"></i></div>
    <div class="ip-btns" id="spRates" aria-label="播放頭這一區的速度">${rates}</div>
    <div class="ip-btns">
      <button class="small ghost" data-act="spCut" data-tip="在播放頭切開，前後可以用不同速度">✂ 在這裡切開</button>
      <button class="small ghost" data-act="spFreeze" data-tip="畫面停在播放頭這一格 2 秒">⏸ 定格 2 秒</button>
      ${model.zones.length > 1 ? '<button class="small ghost" data-act="spJoin" data-tip="拿掉最靠近播放頭的切點">併掉切點</button>' : ''}
      ${isPlain(model) ? '' : '<button class="small ghost" data-act="spReset">恢復原速</button>'}
    </div>
    <p class="ip-note">選的是播放頭所在的那一區。講話的時間不變，只改畫面走多快。${hasNotes ? '變速後看一下紅框、說明卡還對不對得上畫面。' : ''}</p>
  </section>`;
}
function applySpeed(id, next, it, sc) {
  if (!next) return false;
  const dur = app.mediaSeg(id)?.info?.dur ?? null;
  const patch = fieldsOf(next, { dur, oldRetime: sc.retime, resolveAt: (at) => speedAt(at, it.start) });
  if (patch.retime || patch.hold != null) patch.volume = undefined;   // 變速、定格不保留原聲（不然 --check 會 ⚠）
  const end = next.start + next.zones.reduce((s, z) => s + (z.to - z.from) * z.rate, 0);
  if (dur != null && end > dur + 0.05) toast(`素材只到 ${r2(dur)} 秒，用完會停在最後一格`, 'warn', 3500);
  setSeg(id, patch, { inspector: true });
  return true;
}
function speedAction(act, b, s) {
  const it = app.itemsView.find((x) => x.id === s.id), sc = sceneById(s.id);
  if (!it || !sc) return;
  const model = speedNow(it, sc), t = speedT(it);
  if (act === 'spZone') { app.seek(Number(b.dataset.t)); return; }
  if (act === 'spReset') { delete speedCuts[it.id]; applySpeed(s.id, { start: model.start, zones: [{ from: 0, to: it.end - it.start, rate: 1 }] }, it, sc); return; }
  if (act === 'spRate') { const r = Number(b.dataset.r); if (!applySpeed(s.id, setRate(model, t, r), it, sc)) renderInspector(); return; }
  if (act === 'spJoin') {
    const next = joinAt(model, t);
    if (!next) return;
    // 併掉的切點如果還沒寫進 plan.json，從暫存拿掉就好
    const gone = model.zones.slice(1).map((z) => z.from).filter((f) => !next.zones.some((z) => Math.abs(z.from - f) < 1e-3));
    speedCuts[it.id] = (speedCuts[it.id] || []).filter((c) => !gone.some((f) => Math.abs(f - c) < 1e-3));
    if (!applySpeed(s.id, next, it, sc) || same(fieldsOf(next), fieldsOf(speedModel(sc, it.end - it.start, it.start, it.knots)))) renderInspector();
    return;
  }
  if (!(app.t >= it.start && app.t < it.end)) { toast('先把播放頭移到這一段裡', 'warn'); return; }
  const next = act === 'spCut' ? cutAt(model, t) : freezeAt(model, t, 2);
  if (!next) { toast(act === 'spCut' ? '離切點太近：每一區至少 0.3 秒' : '這一區已經是定格', 'warn'); return; }
  if (act === 'spCut') { speedCuts[it.id] = [...(speedCuts[it.id] || []), r3(t)]; renderInspector(); return; }
  applySpeed(s.id, next, it, sc);
}
// 播放頭移動時，面板上的速度條跟著走（不用重畫整個面板）
function tickSpeedStrip() {
  const strip = document.getElementById('spStrip');
  if (!strip) return;
  const start = Number(strip.dataset.start), len = Number(strip.dataset.len), head = document.getElementById('spHead');
  const inside = app.t >= start && app.t < start + len;
  if (head) { head.hidden = !inside; if (inside) head.style.left = `${((app.t - start) / len) * 100}%`; }
  const it = app.selection?.kind === 'media' ? app.itemsView.find((x) => x.id === app.selection.id) : null, sc = it && sceneById(it.id);
  if (!it || !sc) return;
  const cur = zoneAt(speedNow(it, sc), inside ? app.t - start : 0);
  document.querySelectorAll('#spRates button').forEach((x) => { const on = Number(x.dataset.r) === cur.rate; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
}

// 錄影段上有哪些標註：點一則跳到那個時間。這些要在完成影片預覽才看得到；要改寫進修改單
const NOTE_KINDS = [['moves', '運鏡'], ['marks', '紅框'], ['callouts', '說明卡'], ['steps', '步驟'], ['arrows', '箭頭'], ['lens', '放大鏡'], ['spot', '聚光燈'], ['redact', '打碼']];
function noteTime(v, it) {
  if (Number.isFinite(v)) return it.start + v;
  const rel = /^\+([\d.]+)$/.exec(String(v ?? ''));
  return rel ? it.start + Number(rel[1]) : v == null ? it.start : refTime(v, app.cues);
}
function mediaNotes(it, sc) {
  if (!it) return '';
  const rows = [];
  for (const [k, zh] of NOTE_KINDS) {
    for (const n of Array.isArray(sc[k]) ? sc[k] : []) {
      const t = noteTime(n?.at, it);
      if (t != null) rows.push({ t, zh, text: String(n?.text || n?.label || '').trim() });
    }
  }
  rows.sort((a, b) => a.t - b.t);
  return `<section class="ip-sec"><h3>標註${rows.length ? `（${rows.length}）` : ''}</h3>
    ${rows.length ? `<ul class="note-list">${rows.map((r) => `<li><button class="small ghost" data-act="seekAt" data-t="${r.t}"><span class="tcv">${mmssOf(outOf(r.t, app.edit.cuts))}</span> ${esc(r.zh)}${r.text ? `：${esc(r.text)}` : ''}</button></li>`).join('')}</ul>` : '<p class="ip-note">這段沒有紅框、說明卡或運鏡。</p>'}
    <p class="ip-note">標註在完成影片預覽才看得到。要加或要改標註：寫進修改單。</p></section>`;
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
    <div class="ip-row"><span class="k">入點</span><span class="v tcv">${fmtFine(a)}</span></div>
    <div class="ip-row"><span class="k">出點</span><span class="v tcv">${fmtFine(b)}</span></div>
    <div class="ip-row"><span class="k">長度</span><span class="v">${fmtSec(b - a)}</span></div>
    <div class="ip-btns"><button class="small danger" data-act="cutSel">✂ 剪掉這段（Delete）</button><button class="small ghost" data-act="playSel">▶ 播放</button></div>
    <div class="ip-btns"><button class="small" data-act="gainSel" data-tip="在這個範圍加一條人聲音量線，可以單獨調大聲或小聲">調整這段人聲音量</button></div>
    ${piece ? '<p class="ip-note">這段是用分割（B）切出來的。剪掉之後播放會直接跳過。</p>' : '<p class="ip-note">按 I／O 可以用播放頭設入點、出點。</p>'}
  </section>`;
}
function joinButtons(p) {
  const j = joinFor(app.edit, p);
  const type = j?.type || 'none';
  return `<div class="seg-btns">${JOIN_TYPES.map(([v, l]) => `<button data-act="join" data-v="${v}" class="${v === type ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${type === 'dip' ? `<div class="ip-row"><label>過黑長度</label><span class="v"><input type="number" data-f="joinDur" min="0.05" max="2" step="0.05" value="${j.dur ?? DIP_DEFAULT}" style="width:80px"> 秒</span></div>` : ''}
    <p class="ip-note">過黑＝很快變黑再亮（換段落）；放大＝接點後畫面放大 1.08 倍到下一個剪接點（講解跳接常用）。</p>
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
// 邊打字邊看：完成影片預覽（播放器 iframe）裡這段的舊字直接換成新字（靜態：逐字動畫、精確版面要存檔後重新產生）。
//   找的順序：這個欄位上次換過的元素（清空再打也找得到）→ 效果標了 data-live="<變數>" 的那一格（數字滾輪這種一位一格的，整格換成字）
//   → froms（畫面上可能的舊字：上一次打的、上次存檔的）最深一層字剛好相同的元素，不找 data-live 格子裡面（「1」會對到滾輪的一格）。
//   播放頭不在這段就跳到完成態
const livePlain = (s) => richPlain(s).replace(/\s+/g, '');
function livePatch(id, froms, to, rich, path = []) {
  if (app.mode !== 'player' || !player.ready) return;
  let host = null;
  try { host = player.p?.iframeElement?.contentDocument?.getElementById(`el-${id}`) || null; } catch { /* 不同源時讀不到 */ }
  if (!host) return;
  const key = JSON.stringify(path), field = path[0] === 'vars' && path.length === 2 ? String(path[1]) : '';
  let hits = path.length ? [...host.querySelectorAll(`[data-live-key="${CSS.escape(key)}"]`)] : [];
  if (!hits.length && field) hits = [...host.querySelectorAll(`[data-live="${CSS.escape(field)}"]`)];
  for (const from of froms) {
    if (hits.length) break;
    const want = typeof from === 'string' ? livePlain(from) : '';
    if (!want) continue;
    hits = [...host.querySelectorAll('*')].filter((e) => !e.closest('[data-live]') && livePlain(e.textContent) === want && ![...e.children].some((c) => livePlain(c.textContent) === want));
  }
  if (!hits.length) return;
  for (const e of hits) {
    if (path.length) e.dataset.liveKey = key;
    if (rich) e.innerHTML = esc(to).replace(/\*\*(.+?)\*\*/g, '<span class="sc-kw">$1</span>').replace(/(?<!:)\/\//g, '<br>');
    else e.textContent = to;
  }
  const it = app.itemsView.find((x) => x.id === id);
  if (it && (app.t < it.start || app.t > it.end)) app.seek(Math.max(it.start, it.end - 0.6));
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
    livePatch(s.id, [prev, savedAt(s.id, path)], el.value, decl.type === 'rich', path);
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
    livePatch(s.id, [prev, typeof saved === 'string' ? splitItem(saved, L.nf).cols[L.col] : null], el.value, decl.type === 'rich', ['slots', L.k, L.i, L.col]);
    const c = cnt(el.value, decl);
    const ce = el.nextElementSibling;
    if (ce?.classList.contains('cnt')) { ce.textContent = c.txt; ce.classList.toggle('over', c.over); }
  }
}
function onInspChange(e) {
  const el = e.target, f = el.dataset.f, s = app.selection;
  if (el.dataset.lookOn) {
    const k = el.dataset.lookOn, cur = lookEff();
    if (el.checked) mutate(() => { app.look = { ...cur, [k]: app.lookPrev[k] || lookKit()[k] || LOOK_ON[k] }; }, { inspector: true });
    else { app.lookPrev[k] = cur[k]; mutate(() => { app.look = { ...cur, [k]: 0 }; }, { inspector: true }); }
    return refreshFaces(0);
  }
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
    case 'gapReq': setRequestsOpen(true); break;
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
    case 'seekAt': { const t = Number(b.dataset.t); app.seek(t); timeline.ensureVisible(t, false); if (app.server?.preview?.built && app.mode !== 'player' && app.server.preview.player?.available) setMode('player', { focus: t }); return; }
    case 'playerItem': if (it) setMode('player', { focus: it.start + 0.3 }); return;
    case 'sfxMute': return toggleSfxMute(s.id);
    case 'selItem': { const sc = sceneById(b.dataset.id); return app.select({ kind: segType(sc) === 'media' ? 'media' : 'item', id: b.dataset.id }); }
    case 'spZone': case 'spRate': case 'spCut': case 'spFreeze': case 'spJoin': case 'spReset': return speedAction(act, b, s);
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
  toast(`人聲調了 ${fmtDb(r.data.suggest)}，達到 YouTube 常用的音量`, 'ok', 4000);
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
    case 'media': case 'item': toast('字卡、動畫和素材不能在這裡刪 → 要拿掉請寫進修改單；只想不要它的聲音，可以把音效或原聲靜音', 'warn', 4500); return;
    default:
  }
}

// ---------- 時間軸互動（timeline.js 呼叫）----------
const snapT = (t, e, opts) => timeline.snap(t, e, opts);
function lockedToast(lane) { toast(`「${TRACK_NAMES[lane]}」軌已鎖定 → 點軌頭的鎖頭解鎖`, 'warn', 2500); }
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
    case 'noCard': return app.select({ kind: 'gap', id: gapId(h.span[0]) }, { lane });
    default: return app.select(null, { lane });
  }
};
app.tlDouble = (h) => {
  if (h.kind === 'cue') openCapEditor(h.cue.n);
  else if (h.kind === 'gap') { if (app.trackLocked('cap')) return lockedToast('cap'); insertCue('after', null, h.t); }
  else if (h.kind === 'sfx') toggleSfxMute(h.sfx.segId);
  else if (h.kind === 'item' || h.kind === 'media') { const it = h.item; app.seek(it.start); }
};
const MOOD_ZH = { quote: '金句', turn: '反轉', pain: '痛點', win: '解法', land: '落定' };
app.tlTip = (h) => {
  const lk = app.trackLocked(h.lane) ? '\n這條軌已鎖定' : '';
  switch (h.kind) {
    case 'item': return `${h.item.title || h.item.id}\n${h.item.type === 'custom' ? customKind(sceneById(h.item.id)) : TYPE_ZH[h.item.type] || ''}　${fmt(h.item.start, 1)} – ${fmt(h.item.end, 1)}　${h.item.id}${tipMotion(h.item)}${app.authorFlags?.has(h.item.id) ? '\n⚠ 有事情要看（「檢查」分頁）' : ''}\n點一下看這段能改什麼`;
    case 'noCard': return `這裡只有講者，沒有字卡\n${fmt(h.span[0], 1)} – ${fmt(h.span[1], 1)}\n點一下可以寫進修改單：這裡想加畫面`;
    case 'media': return `${h.item.srcName}　${h.item.id}\n${fmt(h.item.start, 1)} – ${fmt(h.item.end, 1)}（${fmtSec(h.item.end - h.item.start)}）${tipMotion(h.item)}\n拖中間移動、拖兩邊裁剪${lk}`;
    case 'mediaL': return `拖曳裁剪起點（素材內容不跑）${lk}`;
    case 'mediaR': return `拖曳裁剪終點${lk}`;
    case 'mediaVol': return `原聲音量 ${h.item.volume == null ? '靜音' : fmtDb(h.item.volume)}：上下拖${lk}`;
    case 'head': return `拖進來裁掉片頭${lk}`;
    case 'tail': return `拖進來裁掉片尾${lk}`;
    case 'cutEdge': return `拖曳調整剪掉的範圍${lk}`;
    case 'cut': { const [a, b] = app.edit.cuts[h.cutIndex]; return `剪掉 ${fmt(a, 1)} – ${fmt(b, 1)}（${fmtSec(b - a)}）\n點選後按 Delete 恢復`; }
    case 'join': { const j = joinFor(app.edit, h.point); return `剪接點 ${fmt(h.point.at, 1)}（${KIND_ZH[h.point.kind]}）\n轉場：${(JOIN_TYPES.find(([v]) => v === (j?.type || 'none')) || [])[1]}　點一下更改`; }
    case 'piece': return `主軌片段 ${fmt(h.piece.a, 1)} – ${fmt(h.piece.b, 1)}\n點選後按 Delete 剪掉；拖曳選範圍${app.voiceOnly.some(([a, b]) => h.t >= a && h.t <= b) ? '\n這裡只有聲音（沒有講者畫面）' : ''}`;
    case 'cue': return `第 ${h.cue.n} 句　${h.cue.text}\n${fmt(h.cue.start, 1)} – ${fmt(h.cue.end, 1)}　${visibleLen(h.cue.text)} 字\n雙擊直接改字`;
    case 'capEdge': return `拖曳調整第 ${h.cue.n} 句的${h.edge ? '結束' : '開始'}時間${lk}`;
    case 'gap': return `空檔 ${fmtSec(h.gap.hi - h.gap.lo)}：雙擊新增一句字幕`;
    case 'gainVol': return `這段人聲 ${fmtDb(app.edit.gains[h.gain].db)}：上下拖${lk}`;
    case 'gainEdge': return `拖曳調整範圍${lk}`;
    case 'voiceVol': return `人聲音量 ${fmtDb(app.edit.volume.voice)}：上下拖整條${selValid() && h.t >= app.sel.a && h.t <= app.sel.b ? '\n（在選取範圍裡拖＝只調這一段）' : ''}${lk}`;
    case 'voiceBody': return '拖曳選一段範圍（剪掉或單獨調音量）';
    case 'mood': return `情緒點：${h.mood.zh}${h.mood.sfx ? `　音效「${h.mood.sfx}」` : h.mood.off ? '（不出聲）' : `（讓位給更強的音效${h.mood.dropped ? `，原本是 ${h.mood.dropped}` : ''}）`}${h.mood.zoom ? '　講者推近' : ''}\n要改：分鏡表的「情緒點」勾選表，或跟 AI 說（寫進修改單）`;
    case 'sfx': return `${h.sfx.segId} 的${h.sfx.main ? '主' : '附加'}音效「${h.sfx.name}」${h.sfx.muted ? '（靜音）' : h.sfx.db != null ? ` ${fmtDb(r2(h.sfx.db))}` : ''}\n上下拖調這段音量、雙擊靜音${lk}`;
    default: return null;
  }
};
app.tlDown = (h, e) => {
  const lane = h.lane;
  if (app.tool === 'split') return null;
  const editKinds = ['mediaL', 'mediaR', 'media', 'mediaVol', 'head', 'tail', 'cutEdge', 'capEdge', 'gainVol', 'gainEdge', 'voiceVol', 'sfx'];
  if (editKinds.includes(h.kind) && app.trackLocked(lane)) { return { move: () => null, up: (moved) => { if (moved) lockedToast(lane); } }; }
  if (editKinds.includes(h.kind) && app.historyBusy) { historyBlocked(); return { move: () => null, up: () => {} }; }
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
      return `${fmtFine(app.sel.a)} – ${fmtFine(app.sel.b)}（${fmtSec(app.sel.b - app.sel.a)}）`;
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
  const speedy = sc0.retime != null || sc0.hold != null;   // 有變速、定格：裁剪時畫面內容不跑、每一區的速度不變
  const model0 = speedy ? speedModel(sc0, e0t - s0, s0, it.knots) : null;
  const rate0 = model0?.zones[0].rate ?? speed;
  app.gestureBegin();
  app.select({ kind: 'media', id }, { lane: 'media' });
  const refFor = (snap, kindWanted) => (snap && (snap.kind === 'cueStart' || snap.kind === 'cueEnd') ? `#${snap.n}${snap.kind === 'cueEnd' ? 'e' : ''}` : null);
  return {
    move(t, y, e) {
      let ns = s0, ne = e0t, fromRef = null, toRef = null;
      if (mode === 'L') {
        const r = snapT(t, e, { exclude: [s0] });
        ns = r.t;
        const lo = Math.max(0, isImg ? 0 : speedy ? (rate0 > 0 ? s0 - model0.start / rate0 : 0) : s0 - in0 / speed), hi = e0t - 1;
        if (ns < lo || ns > hi) { ns = clamp(ns, lo, hi); timeline.snapLine = null; } else fromRef = refFor(r.snap);
      } else if (mode === 'R') {
        const r = snapT(t, e, { exclude: [e0t] });
        ne = r.t;
        const hi = Math.min(app.dur, srcDur && !speedy ? s0 + (srcDur - in0) / speed : Infinity), lo = s0 + 1;
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
      let srcFrom = null;
      if (speedy && mode !== 'M') {
        const m = trimModel(model0, ns - s0, ne - ns);
        srcFrom = m.start;
        for (const [k, v] of Object.entries(fieldsOf(m, { dur: srcDur }))) { if (v === undefined) delete sc[k]; else sc[k] = v; }
      } else if (mode === 'L' && !isImg) { sc.in = r2(Math.max(0, in0 + (ns - s0) * speed)); srcFrom = sc.in; }
      const i = app.scenes.findIndex((x) => x.id === id);
      app.scenes = app.scenes.slice(); app.scenes[i] = sc;
      recompute();
      const edgeT = mode === 'R' ? ne - 1 / app.fps : ns;
      app.seek(edgeT);
      const d = (ne - ns) - (e0t - s0);
      const lab = mode === 'L' ? `起點 ${fmtFine(ns)}${fromRef ? `（第 ${parseRef(fromRef).n} 句）` : ''}` : mode === 'R' ? `終點 ${fmtFine(ne)}${toRef ? `（第 ${parseRef(toRef).n} 句）` : ''}` : `${fmtFine(ns)} – ${fmtFine(ne)}${fromRef ? `（第 ${parseRef(fromRef).n} 句）` : toRef ? `（第 ${parseRef(toRef).n} 句）` : ''}`;
      return `${lab}\n長度 ${fmtSec(ne - ns)}${Math.abs(d) > 0.004 ? `（${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} 秒）` : ''}${mode === 'L' && !isImg && srcFrom != null ? `\n素材從 ${r2(srcFrom)} 秒開始` : ''}`;
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
        return `片頭裁到 ${fmtFine(nt)}（剪掉 ${fmtSec(nt)}）`;
      }
      const head = app.headTail().head;
      const nt = frameSnap(clamp(r.t, head + minLeft, app.dur - 1 / app.fps));
      const last = app.edit.cuts.length - 1;
      if (idx == null) { if (last >= 0 && app.edit.cuts[last][1] >= app.dur - 0.001) idx = last; else { app.edit.cuts.push([nt, r3(app.dur)]); idx = app.edit.cuts.length - 1; } }
      app.edit.cuts[idx][0] = Math.min(nt, app.edit.cuts[idx][1] - 1 / app.fps);
      recompute();
      app.seek(Math.max(0, nt - 1 / app.fps));
      return `片尾裁到 ${fmtFine(nt)}（剪掉 ${fmtSec(app.dur - nt)}）`;
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
      return `剪掉 ${fmtFine(c[0])} – ${fmtFine(c[1])}（${fmtSec(c[1] - c[0])}）`;
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
      return `第 ${n} 句 ${fmtFine(cc.start)} – ${fmtFine(cc.end)}（${fmtSec(cc.end - cc.start)}）`;
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
      return `${fmtFine(g.from)} – ${fmtFine(g.to)}（${fmtSec(g.to - g.from)}）`;
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
app.pendingAudit = new Set();   // 改過字、還沒更新預覽的段：更新時量版面
app.saveSeq = 0;
Object.assign(app, { loadState, keepIfDirty, timeline, sim, player, applyReport: (r) => { applyReport(r); changed({ inspector: true }); }, save, runBuild, splitMain, splitCue, insertCue, mergeCue, deleteCue, setCue, toggleSfxMute, normalizeVoice, deleteSelection, undo, redo, openCapEditor, closeCapEditor, setMode, recompute, changed });
app.onZoom = () => { const z = $('#zoom'); if (document.activeElement !== z) z.value = String(Math.round(timeline.zoom01() * 1000)); renderStatus(); };

// 工具與按鈕
function setTool(t) { app.tool = t; for (const [id, name] of [['#toolSelect', 'select'], ['#toolSplit', 'split']]) { const b = $(id), on = t === name; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } $('#tlCanvas').classList.toggle('razor', t === 'split'); $('#stHint').textContent = t === 'split' ? '分割工具：在主軌或人聲上點一下＝在那裡切開（按 V 回到選取）' : ''; }
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
capBtn('#btnBuild', buildFromButton);
capBtn('#btnExport', () => startExportFlow());
$('#btnSpeakerWarn').addEventListener('click', () => openSpeakerDialog(null));
$('#spkSave').addEventListener('click', saveSpeakerFromDialog);
$('#spkAnyway').addEventListener('click', () => { $('#dlgSpeaker').close(); beginExport({ confirmSpeaker: true }); });
$('#spkCancel').addEventListener('click', () => $('#dlgSpeaker').close());
$('#exportClose').addEventListener('click', () => $('#dlgExport').close());
$('#dlgExport').addEventListener('close', () => { app.exportSetup = false; });
$('#exportStart').addEventListener('click', () => beginExport());
for (const el of document.querySelectorAll('#exportSetup input')) el.addEventListener('change', () => renderExport({ steps: [], running: false }));
$('#exportVideo').addEventListener('click', () => { if (app.finalLinks?.video) window.open(app.finalLinks.video, '_blank', 'noopener'); });
$('#exportSheet').addEventListener('click', () => { if (app.finalLinks?.sheet) window.open(app.finalLinks.sheet, '_blank', 'noopener'); });
for (const sel of ['#logIssues', '#exportIssues']) $(sel).addEventListener('click', (e) => {
  const dlg = e.target.closest('dialog');
  if (e.target.closest('[data-chk-copy]')) { copyIssues(); return; }
  if (e.target.closest('summary, .chk-ai')) return;
  const cue = e.target.closest('[data-chk-cue]');
  if (cue) { dlg.close(); goToCue(Number(cue.dataset.chkCue)); return; }
  const li = e.target.closest('li'), seg = e.target.closest('[data-seg]');
  if (li?.dataset.chkAct === 'speaker') { dlg.close(); openSpeakerDialog(null); return; }
  const id = seg?.dataset.seg || li?.dataset.id;
  if (id) { dlg.close(); goToSeg(id); }
});
$('#exportReveal').addEventListener('click', async () => { const r = await api('POST', '/api/export/reveal', {}); if (!r.ok) toast(r.data?.message || '打不開資料夾', 'err', 5000); });
$('#exportCancel').addEventListener('click', async () => { const r = await api('POST', '/api/export/cancel', {}); if (!r.ok) toast(r.data?.message || '取消失敗', 'err', 5000); await pollExport(); });
pollExport();
$('#btnUndo').addEventListener('click', undo);
$('#btnRedo').addEventListener('click', redo);
$('#btnHelp').addEventListener('click', () => $('#dlgHelp').showModal());
$('#helpClose').addEventListener('click', () => $('#dlgHelp').close());
$('#logClose').addEventListener('click', () => $('#dlgLog').close());
$('#toolSelect').addEventListener('click', () => setTool('select'));
$('#toolSplit').addEventListener('click', () => setTool(app.tool === 'split' ? 'select' : 'split'));
$('#btnSnap').addEventListener('click', toggleSnap);
capBtn('#capAdd', () => insertCue('after'));
$('#capFind').addEventListener('click', openFind);
$('#btnSafe').addEventListener('click', () => { app.showSafe = !app.showSafe; renderOverlays(); });
$('#btnSpeaker').addEventListener('click', (e) => { if (e.currentTarget.classList.contains('is-disabled')) { toast('這支還沒量講者框：請 AI 量', 'warn'); return; } app.showSpeaker = !app.showSpeaker; renderOverlays(); });
$('#btnFull').addEventListener('click', () => { const s = $('#stage'); if (document.fullscreenElement) document.exitFullscreen(); else s.requestFullscreen?.().catch(() => toast('瀏覽器不讓這頁全螢幕', 'warn')); });
for (const b of $$('.seg button')) b.addEventListener('click', () => { if (b.classList.contains('is-disabled')) { toast(b.dataset.tip, 'warn', 5000); return; } setMode(b.dataset.mode); });
$('#stIssues').addEventListener('click', () => setSide('issues'));
$('#btnRecheck').addEventListener('click', async () => { app.report = null; app.saveErrors = null; renderCheck(); await fetchReport(true); toast('檢查完了', 'ok', 1500); });
function goToSeg(id, { show = false } = {}) {
  const it = app.itemsView.find((x) => x.id === id);
  if (!it) { toast(`時間軸上找不到 ${id}`, 'warn'); return; }
  app.seek(it.start); timeline.reveal(it.start, it.end);
  app.select({ kind: it.type === 'media' ? 'media' : 'item', id: it.id });
  // 從檢查結果點過來：要看的是畫面（有沒有擋到臉），不是只有聲音的快速試聽
  const pv = app.server?.preview;
  if (show && app.mode !== 'player' && pv?.built && pv?.player?.available) setMode('player', { focus: it.start + 0.3 });
}
// 從檢查結果點字幕句號：跳到那一句、選起來，打開「屬性」（合併、拉長都在那裡）
function goToCue(n) {
  const c = app.cues.find((x) => x.n === n);
  if (!c) { toast(`找不到第 ${n} 句字幕（可能已經改過，按「重新檢查」）`, 'warn'); return; }
  app.seek(c.start); timeline.reveal(c.start, c.end);
  app.select({ kind: 'cue', id: n }, { lane: 'cap' });
  setSide('insp');
}
// 複製原文給 AI：作者不用看懂，貼過去 AI 就知道要修什麼
async function copyIssues() {
  const { errors, warnings } = currentIssues();
  const text = `檢查結果（照 → 修，不用問我）：\n${[...errors.map((x) => `✖ ${x}`), ...groupIssues([], warnings).ai.flatMap((g) => g.raw.map((x) => `⚠ ${x}`))].join('\n')}`;
  try { await navigator.clipboard.writeText(text); toast('已複製，貼給 AI', 'ok', 2500); }
  catch { toast('瀏覽器不讓複製：請 AI 跑 build.mjs --check 看檢查結果', 'warn', 5000); }
}
$('#checkList').addEventListener('click', (e) => {
  const hb = e.target.closest('[data-chk-hide]');
  if (hb) { setHidden(JSON.parse(hb.dataset.chkHide), true); return; }
  const ub = e.target.closest('[data-chk-unhide]');
  if (ub) { setHidden([ub.dataset.chkUnhide], false); return; }
  if (e.target.closest('[data-chk-copy]')) { copyIssues(); return; }
  if (e.target.closest('summary, .chk-ai')) return;
  const cue = e.target.closest('[data-chk-cue]');
  if (cue) { goToCue(Number(cue.dataset.chkCue)); return; }
  const seg = e.target.closest('[data-seg]');
  if (seg) { goToSeg(seg.dataset.seg, { show: true }); return; }
  const li = e.target.closest('li');
  if (li?.dataset.chkAct === 'speaker') { openSpeakerDialog(null); return; }
  if (li?.dataset.id) goToSeg(li.dataset.id, { show: true });
});
$('#conflictKeep').addEventListener('click', async () => { $('#dlgConflict').close(); banner(''); await loadState({ keep: keepState }); toast('已載入最新的檔案，你的調整還在，會自動存', 'ok', 5000); });
$('#conflictDrop').addEventListener('click', async () => { $('#dlgConflict').close(); banner(''); await loadState(); toast('已載入最新的檔案'); });
$('#conflictCancel').addEventListener('click', () => $('#dlgConflict').close());
$('#delPrev').addEventListener('click', () => { $('#dlgDelete').close(); if (pendingDelete) finishDelete(pendingDelete, 'prev'); pendingDelete = null; });
$('#delNext').addEventListener('click', () => { $('#dlgDelete').close(); if (pendingDelete) finishDelete(pendingDelete, 'next'); pendingDelete = null; });
$('#delCancel').addEventListener('click', () => { $('#dlgDelete').close(); pendingDelete = null; });
$('#findText').addEventListener('input', renderFind);
$('#replText').addEventListener('input', renderFind);
$('#findAll').addEventListener('click', replaceAll);
$('#findClose').addEventListener('click', () => $('#dlgFind').close());
$('#findList').addEventListener('click', (e) => { const li = e.target.closest('li[data-n]'); if (!li) return; const c = app.cues.find((q) => q.n === Number(li.dataset.n)); if (c) { app.seek(c.start); timeline.reveal(c.start, c.end); app.select({ kind: 'cue', id: c.n }, { lane: 'cap' }); } });
$('#coachClose').addEventListener('click', () => { $('#coach').hidden = true; storage.set(COACH_KEY, '1'); });
$('#coachFinalClose').addEventListener('click', () => { $('#coachFinal').hidden = true; storage.set(COACH_FINAL_KEY, '1'); });
$('#coachRoughClose').addEventListener('click', () => { $('#coachRough').hidden = true; storage.set(COACH_ROUGH_KEY, '1'); });
// 屬性面板
$('#inspBody').addEventListener('input', onInspInput);
$('#inspBody').addEventListener('change', onInspChange);
$('#inspBody').addEventListener('click', onInspClick);
$('#inspBody').addEventListener('toggle', (e) => { const k = e.target.dataset?.ipfold; if (k) { app.folds[k] = e.target.open; if (k === 'look' && e.target.open) refreshFaces(0); } }, true);
// 這段沒有分鏡截圖（AI 改過段、還沒截）：把位子收起來，不留破圖
$('#inspBody').addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.closest('.ip-shot')?.remove(); }, true);
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
    toast(`${TRACK_NAMES[k]}${app.trackMuted(k) ? '已靜音（完成影片也不會有）' : '取消靜音'}`, 'ok', 1500);
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
  if (e.key === 'Enter') { const seg = app.itemsView.find((x) => x.id.toLowerCase() === e.target.value.trim().toLowerCase()); const t = seg ? null : parseTC(e.target.value); if (seg) goToSeg(seg.id); else if (t == null) toast('看不懂：寫時間（1:23、00:01:23:10）或段號（x0410）', 'warn'); else { step(0); app.seek(t); timeline.ensureVisible(t, false); } e.target.blur(); }
  else if (e.key === 'Escape') e.target.blur();
  e.stopPropagation();
});
$('#tcInput').addEventListener('blur', () => { $('#tcInput').hidden = true; $('#tc').hidden = false; tcShown = ''; renderTimes(); });
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
  const txt = (el.classList.contains('is-disabled') && el.dataset.why) ? `現在不能用：${el.dataset.why}` : el.dataset.tip;
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
// 剪輯台只能改字、刪清單項目；要加項目、換動畫、重新排版都寫在這裡，AI 照「照剪輯台修改單改」直接改（每段一個子代理）
// 一段一筆 { id, tags, note, t（最後改的時間）, done?: { round, note } }：有勾或有描述才算一筆；改了就變回待改
const RQ_TAGS = {
  anim: ['流程更細節', '以圖像展示為主', '文字少一點', '畫出關係（箭頭、引線）', '換一種動畫', '動作慢一點', '跟講的話對齊', '更有質感'],
  media: ['播太快', '播太慢', '標註更清楚', '推近到操作區', '加步驟清單', '換成動畫', '換一段錄影', '跟講的話對齊'],
  gap: ['加一張字卡', '加一段動畫', '放錄影或圖片'],
};
const rqKey = () => `editor-requests:${app.server?.project?.dir || ''}`;
const rqKind = (sc) => (!sc ? 'gap' : segType(sc) === 'media' ? 'media' : 'anim');
let rqClearArm = false, rqMarks = '';
function rqLoad() {
  try { const v = JSON.parse(localStorage.getItem(rqKey()) || '[]'); app.requests = Array.isArray(v) ? v.filter((x) => isObj(x) && x.id) : []; } catch { app.requests = []; }
}
function rqStore() { try { localStorage.setItem(rqKey(), JSON.stringify(app.requests)); } catch { /* 無痕視窗：只留在這個分頁 */ } }
function rqSegOf(sel) { return sel && (sel.kind === 'item' || sel.kind === 'media' || sel.kind === 'sfx' || sel.kind === 'gap') ? sel.id : null; }
// 沒有卡片的講解也能寫進修改單：段號用 t＋起點秒數
const gapId = (t) => `t${Math.floor(t)}`;
function gapInfo(id) {
  const at = Number(id.slice(1));
  const span = app.uncovered.find(([a, b]) => at >= Math.floor(a) && at < b);
  const start = span ? span[0] : at, end = span ? span[1] : at + 5;
  return { start, end, subs: app.cues.filter((c) => c.end > start + 0.05 && c.start < end - 0.05) };
}
// 一段的資訊：名稱、動畫是什麼、完成影片時間、plan.json 的起訖、對應字幕
function rqInfo(id) {
  const it = app.itemsView.find((x) => x.id === id), sc = sceneById(id);
  if (!sc && /^t\d+$/.test(id)) {
    const g = gapInfo(id);
    return { id, it: { start: g.start, end: g.end }, sc: null, type: 'gap', gap: true, label: '這裡只有講者，想加畫面', what: '沒有卡片的講解（想加畫面）', shown: '這裡只有講者', file: null, out: [outOf(g.start, app.edit.cuts), outOf(g.end, app.edit.cuts)], span: `${fmtTC(g.start)} → ${fmtTC(g.end)}`, subs: g.subs };
  }
  if (!sc) return null;
  const type = segType(sc);
  const def = type === 'scene' ? findSceneDef(app.server?.schema?.scenes, sc.scene) : type === 'fx' ? findFxDef(app.server?.schema?.fx, sc.fx) : null;
  const what = type === 'scene' ? `資訊卡 ${sc.scene}${def?.zh ? `（${def.zh}）` : ''}`
    : type === 'fx' ? `字卡動態 ${sc.fx}${def?.zh ? `（${def.zh}）` : ''}`
    : type === 'custom' ? (sc.template ? `模板動畫 ${sc.template}（${customDef(sc)?.zh || ''}）` : customKind(sc))
    : `${app.mediaSeg(id)?.kind === 'image' ? '圖片' : '螢幕錄影'} ${String(sc.src || '').split('/').pop()}`;
  // 修改單寫從工作區根目錄起算的路徑（AI 在根目錄執行，不用猜相對誰）：custom 的 src 相對 work/hyperframes，media 的 src 相對專案
  const pd = app.server?.project?.dir || '';
  const file = !sc.src ? null : type === 'custom' ? `${pd}/work/hyperframes/${sc.src}` : type === 'media' ? `${pd}/${sc.src}` : null;
  const subs = it ? app.cues.filter((c) => c.end > it.start + 0.05 && c.start < it.end - 0.05) : [];
  const shown = type === 'custom' ? customKind(sc) : type === 'media' ? `素材：${String(sc.src || '').split('/').pop()}` : `字卡${def?.zh ? `：${def.zh}` : ''}`;
  return { id, it, sc, type, label: it?.title || it?.label || '', what, shown, file, out: it ? [outOf(it.start, app.edit.cuts), outOf(it.end, app.edit.cuts)] : null,
    span: `${fmtTime(sc.from ?? sc.at)} → ${fmtTime(sc.to ?? (sc.duration != null ? `+${sc.duration} 秒` : '預設長度'))}`, subs };
}
const rqMs = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;   // 分:秒.十分之一（給 AI 看，不用格數）
const rqTime = (inf) => (inf.out ? `${rqMs(inf.out[0])}–${rqMs(inf.out[1])}` : '—');
// 存檔、剪貼簿複製、AI 生成是三件事，只有 API 的回報代表 AI 已開始。
const rqExported = (r) => { const q = app.server?.requests; return !r.done && !!q && q.ids.includes(r.id) && q.at >= (r.t || 0); };
const rqProgress = (r) => rqExported(r) ? app.server.requests.states?.[r.id] : null;
function rqStatus(r) {
  const p = rqProgress(r);
  if (p?.state === 'generating') return { label: '生成中', detail: p.message || 'AI 正在生成這一段', cls: 'generating' };
  if (p?.state === 'failed') return { label: '生成失敗', detail: p.message || '請查看 AI 回報的原因後重試', cls: 'failed' };
  if (rqExported(r)) return r.copiedRevision === app.server.requests.revision
    ? { label: '已複製', detail: '已複製，請貼給 AI', cls: '' }
    : { label: '已存檔', detail: '修改單已存檔，請複製指令貼給 AI', cls: '' };
  return { label: '', detail: '待改：已存進修改單', cls: '' };
}
// 改完了沒：伺服器讀 r<N>.md「改了哪幾段」（比 editor-requests.md 新的才算）；送出後沒再改過的段才算數。
// 記在瀏覽器（r.done）：下次複製只送待改的，修改單檔換掉了也還記得哪些改完
function rqSync() {
  const q = app.server?.requests;
  if (!q) return;
  let ch = false;
  for (const r of app.requests) {
    const d = rqExported(r) ? q.done[r.id] : null;
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
  fn(r); r.t = Date.now(); delete r.done; delete r.copiedRevision;
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
  const status = rqStatus(r);
  return `<div class="rq-state ${status.cls}" role="status"><span class="ip-note">${esc(status.detail)}</span>${del}</div>`;
}
function rqTopHtml(id) {
  const inf = id ? rqInfo(id) : null;
  if (!inf) return '<p class="ip-note">在時間軸或「段落」分頁點一段，在這裡點想怎麼改、或自己寫（直接存）；可以累積很多段，最後一起複製給 AI。</p>';
  const on = app.requests.find((x) => x.id === id)?.tags || [];
  // 對應字幕預設收起：選項比字幕重要，小視窗也要一眼看到
  return `<div class="rq-seg"><div class="t">${esc(inf.it?.title || inf.label)}</div><div class="m">${esc(inf.shown)}<br>完成影片 ${rqTime(inf)}　${esc(inf.id)}</div></div>
    ${inf.subs.length ? `<details class="rq-subwrap"><summary>這段的字幕（${inf.subs.length} 句）</summary><ul class="rq-subs">${inf.subs.map((c) => `<li><span class="n">#${c.n}</span>${esc(c.text)}</li>`).join('')}</ul></details>` : '<p class="ip-note">這段時間沒有字幕</p>'}
    <div class="rq-tags" role="group" aria-label="想怎麼改">${RQ_TAGS[rqKind(inf.sc)].map((t) => `<button class="toggle small${on.includes(t) ? ' on' : ''}" data-rq="tag" data-t="${esc(t)}" aria-pressed="${on.includes(t)}">${esc(t)}</button>`).join('')}</div>
    <textarea id="rqNote" rows="4" placeholder="自己描述（選填）：例如「三個步驟改成手機畫面一步步亮起」">${esc(app.requests.find((x) => x.id === id)?.note || '')}</textarea>
    <div id="rqState">${rqStateHtml(id)}</div>`;
}
function rqListsHtml(cur) {
  const pend = rqPending(), done = app.requests.filter((r) => r.done);
  const lab = (r) => { const i = rqInfo(r.id); return i ? esc(i.label) : '<span class="gone">找不到這段（可能被 AI 改名或刪掉了）</span>'; };
  const go = (r) => `<button class="small ghost" data-rq="go" data-id="${esc(r.id)}" data-tip="跳到這段">↗</button>`;
  const del = (r) => `<button class="small ghost" data-rq="del" data-id="${esc(r.id)}" data-tip="從修改單拿掉" aria-label="拿掉 ${esc(r.id)}">✕</button>`;
  const badge = (r) => { const s = rqStatus(r); return s.label ? `<span class="rq-sent ${s.cls}" role="status" data-tip="${esc(s.detail)}">${s.label}</span>` : ''; };
  const failedWhy = (r) => { const st = rqStatus(r); return st.cls === 'failed' ? `<div class="what err-ink">${esc(st.detail)}</div>` : ''; };
  const pi = pend.map((r) => `<li class="rq-item${r.id === cur ? ' cur' : ''}"><div class="h"><b>${esc(r.id)}</b><span class="lab">${lab(r)}</span>${badge(r)}${go(r)}${del(r)}</div>${failedWhy(r)}
    ${r.tags.length ? `<div class="chips">${r.tags.map((t) => `<span class="chip-t">${esc(t)}</span>`).join('')}</div>` : ''}${r.note.trim() ? `<div class="note">${esc(r.note.trim())}</div>` : ''}</li>`).join('');
  const di = done.map((r) => `<li class="rq-item done${r.id === cur ? ' cur' : ''}"><div class="h"><b>✓ ${esc(r.id)}</b><span class="lab">${lab(r)}</span><span class="rq-done">${esc(r.done.round)}</span>
    <button class="small primary" data-rq="result" data-id="${esc(r.id)}" data-tip="切到完成影片預覽，跳到這段開頭">▶ 看結果</button>${del(r)}</div><div class="what" data-tip="${esc(r.done.note)}">${esc(r.done.note)}</div></li>`).join('');
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
  const tab = $('.side-tabs [data-side="rq"]');
  tab.textContent = pend.length ? `修改單 ${pend.length}` : '修改單';
  if (!open) return;
  const id = rqSegOf(app.selection), top = $('#rqTop');
  // 正在打描述：不重畫輸入框（會丟游標、打斷注音），只更新狀態列
  if (document.activeElement?.id === 'rqNote' && top.dataset.id === (id || '')) $('#rqState').innerHTML = rqStateHtml(id);
  else { top.dataset.id = id || ''; top.innerHTML = rqTopHtml(id); }
  $('#rqLists').innerHTML = rqListsHtml(id);
  $('#rqFoot').innerHTML = `<button class="primary${pend.length ? '' : ' is-disabled'}" data-rq="copy" data-why="${app.requests.length ? '沒有待改的段（已改完的不會再送）' : '修改單是空的'}">複製給 AI（${pend.length} 段待改）</button>
    <p class="ip-note" data-tip="完整內容存在 ${esc(app.server?.project?.dir || '')}/work/feedback/editor-requests.md">複製後貼給 AI；AI 開始改之後，這段會顯示「生成中」。</p>
    ${app.requests.length ? `<button class="small ghost" data-rq="clear">${rqClearArm ? '再按一次清空' : '清空修改單'}</button>` : ''}`;
}
// 複製給 AI 的只有這一行（待改的完整內容存在 editor-requests.md，AI 讀檔）
const rqCommand = (revision, pending = rqPending()) => {
  const project = app.server?.project?.dir || '';
  const cli = `node shared/template/tools/editor.mjs --project ${JSON.stringify(project)}`;
  const progress = `${revision ? '' : `先用 ${cli} --requests-state status 取得這份修改單的 revision；`}開始處理時用 ${cli} --requests-state generating --request-revision ${revision || '<剛讀取的 revision>'} --ids ${pending.map((r) => r.id).join(',')} 回報狀態；build、audit 通過後用同一指令把 generating 換成 done（可加 --round rN --message 描述），失敗則換成 failed --message 原因；逐段回報可調整 --ids，版本衝突就停下重新讀取修改單。`;
  return `照剪輯台修改單改這 ${pending.length} 段（${project}/work/feedback/editor-requests.md）：照 auto-edit-review 流程 F 做（.agents/skills/auto-edit-review/references/editor-requests.md），不用先出提案，停在停點 ④。${progress}`;
};
function rqMarkdown() {
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
  const L = ['# 剪輯台修改單', '', rqCommand(), '',
    `（${stamp} 從剪輯台複製）`];
  rqPending().forEach((r, k) => {
    const i = rqInfo(r.id);
    L.push('', `## ${k + 1}. ${r.id}${i?.label ? `　${i.label}` : ''}`);
    if (!i) { L.push('- plan.json 裡找不到這段（可能被改名或刪掉了）'); }
    else L.push(`- 動畫：${i.what}`, ...(i.file ? [`- 檔案：${i.file}`] : []), `- 完成影片時間：${rqTime(i)}（${app.server?.project?.dir || ''}/work/hyperframes/plan.json：${i.span}）`);
    if (i?.gap) L.push('- 這裡現在沒有段落：照時間和字幕新增一段（段號自己取），不是改既有的段；回報狀態時用上面的段號');
    if (r.tags.length) L.push(`- 要改：${r.tags.join('、')}`);
    if (r.note.trim()) L.push(`- 描述：${r.note.trim().replace(/\s*\n\s*/g, '／')}`);
    if (i?.subs.length) { L.push('- 對應字幕：'); for (const c of i.subs) L.push(`  - #${c.n} ${c.text}`); }
  });
  return L.join('\n') + '\n';
}
// 先存檔（完整修改單），存成功才複製那一行指令：存失敗時剪貼簿不會指到舊檔
async function rqCopy() {
  const n = rqPending().length;
  const submitted = rqPending().map((r) => ({ ...r }));
  const snapshot = new Map(rqPending().map((r) => [r.id, r.t]));
  const r = await api('POST', '/api/requests', { markdown: rqMarkdown() });
  const saved = r.ok ? r.data?.file : null;
  if (!saved) { toast(`修改單存檔失敗：${r.data?.message || r.status}`, 'err', 7000); return; }
  app.server.requests = r.data.requests;
  // 複製等待期間若有編輯，保留原本那批的段與版本，不把新需求誤標成已複製。
  const cmd = rqCommand(r.data.requests.revision, submitted);
  let copied = false;
  try { await navigator.clipboard.writeText(cmd); copied = true; } catch {
    const ta = document.createElement('textarea'); ta.value = cmd; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    ta.remove();
  }
  if (copied) {
    for (const item of app.requests) if (snapshot.has(item.id) && snapshot.get(item.id) === item.t) item.copiedRevision = r.data.requests.revision;
    rqStore();
    toast(`${n} 段存到 ${saved}，指令已複製 → 貼給 AI`, 'ok', 6000);
  }
  else toast(`${n} 段存到 ${saved}，但沒辦法寫進剪貼簿 → 跟 AI 說「照剪輯台修改單改」`, 'warn', 7000);
  renderRequests();
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
    if (/^t\d+$/.test(b.dataset.id) && !sceneById(b.dataset.id)) { const g = gapInfo(b.dataset.id); app.seek(g.start); timeline.ensureVisible(g.start, false); app.select({ kind: 'gap', id: b.dataset.id }); return; }
    const it = app.itemsView.find((x) => x.id === b.dataset.id);
    if (!it) { toast('找不到這段（可能被 AI 改名或刪掉了）', 'warn'); return; }
    app.select({ kind: it.type === 'media' ? 'media' : 'item', id: it.id }); app.seek(it.start + 0.05); timeline.ensureVisible(it.start, false);
    return;
  }
  if (act === 'result') {
    if (/^t\d+$/.test(b.dataset.id) && !sceneById(b.dataset.id)) return setMode('player', { focus: gapInfo(b.dataset.id).start });
    const it = app.itemsView.find((x) => x.id === b.dataset.id);
    if (!it) { toast('找不到這段（可能被 AI 改名或刪掉了）', 'warn'); return; }
    app.select({ kind: it.type === 'media' ? 'media' : 'item', id: it.id });
    return setMode('player', { focus: it.start + 0.05 });
  }
  if (act === 'copy') return rqCopy();
  if (act === 'clear') {
    if (!rqClearArm) { rqClearArm = true; renderRequests(); return; }
    rqClearArm = false; app.requests = []; rqStore(); renderRequests();
  }
}
function setRequestsOpen(open) { setSide(open ? 'rq' : 'insp', { open }); }
// 視窗窄時右側面板變抽屜：平常收起來，影片和時間軸都看得到
function setDrawer(open) {
  $('#inspector').classList.toggle('open', open);
  $('#btnSide').setAttribute('aria-pressed', String(open));
}
// 視窗矮時時間軸變薄，把高度留給影片；使用者也可以自己拖預覽和時間軸中間那條線（記在這個瀏覽器）
const LANE_KEY = 'auto-edit-editor.lane-scale';
function rebuildHeads() { $('#tlHeads').dataset.built = ''; renderHeads(); timeline.invalidate(); }
function fitLayout() {
  if (timeline.setCompact(window.innerHeight < 860)) rebuildHeads();
}
{
  const saved = Number(storage.get(LANE_KEY));
  if (saved > 0) timeline.setScale(saved);
  const grip = $('#tlResize');
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const y0 = e.clientY, h0 = timeline.totalH, s0 = timeline.scale;
    const mv = (ev) => { if (timeline.setScale(s0 * Math.max(0.2, (h0 + (y0 - ev.clientY)) / h0))) rebuildHeads(); };
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); storage.set(LANE_KEY, String(timeline.scale)); };
    grip.addEventListener('pointermove', mv);
    grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('dblclick', () => { timeline.setScale(1); rebuildHeads(); storage.set(LANE_KEY, '1'); });
  grip.addEventListener('keydown', (e) => {
    const d = { ArrowUp: 1.1, ArrowDown: 1 / 1.1 }[e.key];
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    if (timeline.setScale(timeline.scale * d)) { rebuildHeads(); storage.set(LANE_KEY, String(timeline.scale)); }
  });
}

// ---------- 右側面板：屬性、段落、字幕、修改單同一欄切換 ----------
let sideTimer = null;
function setSide(name, { open = true } = {}) {
  app.side = name;
  if (open) setDrawer(true);
  const panes = { insp: '#sideInsp', segs: '#sideSegs', cues: '#sideCues', rq: '#requests', issues: '#sideIssues' };
  for (const [k, sel] of Object.entries(panes)) $(sel).hidden = k !== name;
  for (const b of $$('.side-tabs [data-side]')) { const on = b.dataset.side === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
  try { localStorage.setItem('editor-requests-open', name === 'rq' ? '1' : '0'); } catch { /* 只是記住開關 */ }
  renderRequests();
  renderSide();
}
function renderSideSoon() { if (!sideTimer) sideTimer = setTimeout(() => { sideTimer = null; renderSide(); }, 60); }
function renderSide() { if (app.side === 'segs') renderSegList(); else if (app.side === 'cues') renderCueList(); }
const mmssOf = (t) => { const s = Math.max(0, Math.floor(t)), m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
const parseClock = (q) => { const m = /^(\d+):(\d{1,2})$/.exec(q.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const segKind = (it) => (sceneById(it.id)?.design ? 'design' : it.type);
const isChapter = (sc) => segType(sc) === 'scene' && findSceneDef(app.server?.schema?.scenes, sc.scene)?.key === 'chapter';

function renderSegList() {
  const q = $('#segSearch').value.trim().toLowerCase(), at = parseClock(q);
  const sel = rqSegOf(app.selection);
  const out = [];
  let shown = 0, lastCh = null;
  for (const it of app.itemsView) {
    const sc = sceneById(it.id);
    const outT = outOf(it.start, app.edit.cuts);
    if (sc && isChapter(sc)) lastCh = sc.slots?.title ? `${sc.slots.title}${sc.slots.sub ? `　${sc.slots.sub}` : ''}` : it.id;
    const hit = !q || (at != null ? at >= outT && at < outOf(it.end, app.edit.cuts) : `${it.id} ${it.title} ${segCues(it)}`.toLowerCase().includes(q));
    if (!hit) continue;
    if (lastCh && !q) { out.push(`<li class="side-ch">${esc(lastCh)}</li>`); lastCh = null; }
    const mark = app.rqMark?.(it.id);
    const isSel = sel === it.id;
    // 主標是時間＋在講什麼；段號放最後，跟 AI 說要改哪段時才用得到。⚠ 只標作者要看的
    out.push(`<li class="side-row k-${segKind(it)}${isSel ? ' sel' : ''}" data-seg="${esc(it.id)}"><span class="t">${mmssOf(outT)}</span><span class="x">${esc(it.title)}${it.type === 'media' && speedSummary(it.knots) ? `<small class="sp-note">${esc(speedSummary(it.knots))}</small>` : ''}</span><span class="i">${esc(it.id)}</span><span class="m">${mark === 'todo' ? '✎' : mark === 'done' ? '✓' : app.authorFlags?.has(it.id) ? '⚠' : ''}</span>${isSel ? `<div class="side-acts"><button class="small" data-seg-act="insp">看屬性</button><button class="small" data-seg-act="req">✎ 寫進修改單</button>${app.server?.preview?.built && app.mode !== 'player' ? '<button class="small" data-seg-act="final">在完成影片預覽看</button>' : ''}</div>` : ''}</li>`);
    shown++;
  }
  $('#segList').innerHTML = out.join('') || '<li class="side-ch">沒有符合的段</li>';
  $('#segCount').textContent = q ? `找到 ${shown} 段` : `${shown} 段`;
  markNowRow(true);
}
const segCues = (it) => app.cues.filter((c) => c.end > it.start + 0.05 && c.start < it.end - 0.05).map((c) => c.text).join(' ');

let cueEditing = null;   // 字幕分頁正在改哪一句（點那句才進去，離開輸入框就清掉）
function renderCueList() {
  const raw = $('#cueSearch').value.trim(), q = raw.toLowerCase(), n = /^#?(\d+)$/.exec(raw)?.[1];
  const sel = app.selection?.kind === 'cue' ? app.selection.id : null;
  const list = app.cues.filter((c) => !q || (n ? c.n === Number(n) : c.text.toLowerCase().includes(q)));
  const max = capMax();
  // 正在這一頁改字：不重畫，不然游標會跑掉
  if (document.activeElement?.classList.contains('cue-edit')) return;
  // 正在改的那一句：字原地換成輸入框（不多一行）；離開就換回字
  $('#cueList').innerHTML = list.map((c) => {
    const isSel = sel === c.n, over = visibleLen(c.text) > max;
    const text = cueEditing === c.n ? `<input class="cue-edit${over ? ' over' : ''}" value="${esc(c.text)}" data-orig="${esc(c.text)}" aria-label="改第 ${c.n} 句字幕">` : `<span class="x${over ? ' over' : ''}">${esc(c.text)}</span>`;
    return `<li class="side-row cue${isSel ? ' sel' : ''}" data-cue="${c.n}"><span class="t">${mmssOf(outOf(c.start, app.edit.cuts))}</span>${text}</li>`;
  }).join('') || '<li class="side-ch">沒有符合的字幕</li>';
  $('#cueCount').textContent = q ? `找到 ${list.length} 句` : `${list.length} 句`;
  markNowRow(true);
}

// ---------- 現在播到哪一段 ----------
let nowKey = null, nowRowKey = null;
function currentSeg(t) {
  // 差一格內也算（跳段時播放頭會對齊到格，可能落在起點前一點）；同類疊在一起時算最後開始的那段
  const on = app.itemsView.filter((it) => t >= it.start - 0.034 && t < (it.shownEnd ?? it.end));
  const rank = (it) => (it.type === 'media' ? 0 : it.type === 'custom' ? 1 : it.type === 'scene' ? 2 : 3);
  return on.sort((a, b) => rank(a) - rank(b) || b.start - a.start)[0] || null;
}
function renderNow() {
  const seg = currentSeg(app.t);
  const gap = seg ? null : app.uncovered.find(([a, b]) => app.t >= a && app.t < b);
  const voice = !seg && !gap && app.voiceOnly.some(([a, b]) => app.t >= a && app.t < b);
  const key = seg ? `s:${seg.id}:${seg.title}` : gap ? `g:${gap[0]}` : voice ? 'voice' : 'none';
  markNowRow();
  if (key === nowKey) return;
  nowKey = key;
  const bar = $('#nowBar');
  if (seg) bar.innerHTML = `<span class="k">現在</span><span class="x" title="${esc(seg.title)}">${esc(seg.title)}</span><button class="i small ghost" data-now="go" data-tip="選這段，看能改什麼">${esc(seg.id)}</button><button class="small" data-now="req">✎ 這段想改</button>`;
  else if (gap) bar.innerHTML = `<span class="k">現在</span><span class="x">這裡只有講者，沒有字卡</span><button class="small" data-now="gap">✎ 這裡想加畫面</button>`;
  else bar.innerHTML = `<span class="k">現在</span><span class="x">${voice ? '這裡只有聲音' : '這裡只有講者'}</span>`;
}
function markNowRow(force = false) {
  if (app.side !== 'segs' && app.side !== 'cues') return;
  const isSeg = app.side === 'segs';
  const id = isSeg ? currentSeg(app.t)?.id : app.cues.find((c) => app.t >= c.start && app.t < c.end)?.n;
  const key = `${app.side}:${id}`;
  if (!force && key === nowRowKey) return;
  nowRowKey = key;
  const list = isSeg ? $('#segList') : $('#cueList');
  list.querySelector('.side-row.now')?.classList.remove('now');
  if (id == null) return;
  const row = list.querySelector(isSeg ? `[data-seg="${CSS.escape(String(id))}"]` : `[data-cue="${id}"]`);
  if (row) { row.classList.add('now'); if (engine().playing || force) row.scrollIntoView({ block: 'nearest' }); }
}
function neighborSeg(dir) {
  const list = app.itemsView;
  if (!list.length) return;
  const cur = currentSeg(app.t);
  const i = cur ? list.indexOf(cur) : list.findIndex((it) => it.start > app.t) - (dir > 0 ? 1 : 0);
  const next = list[Math.max(0, Math.min(list.length - 1, i + dir))];
  if (next) goToSeg(next.id);
}
$('.side-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-side]'); if (b) setSide(b.dataset.side); });
$('#btnSide').addEventListener('click', () => setDrawer(!$('#inspector').classList.contains('open')));
$('#btnSideClose').addEventListener('click', () => setDrawer(false));
window.addEventListener('resize', fitLayout);
$('#segSearch').addEventListener('input', renderSegList);
$('#cueSearch').addEventListener('input', renderCueList);
for (const id of ['#segSearch', '#cueSearch']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; renderSide(); e.target.blur(); } if (e.key === 'Enter') { e.preventDefault(); const r = e.target.closest('.side-pane').querySelector('.side-row'); r?.click(); } });
$('#segList').addEventListener('click', (e) => {
  const row = e.target.closest('[data-seg]');
  if (!row) return;
  const id = row.dataset.seg, act = e.target.closest('[data-seg-act]')?.dataset.segAct;
  if (act === 'insp') { setSide('insp'); return; }
  if (act === 'req') { setRequestsOpen(true); return; }
  const it = app.itemsView.find((x) => x.id === id);
  if (act === 'final' && it) { setMode('player', { focus: it.start + 0.05 }); return; }
  goToSeg(id);
});
$('#cueList').addEventListener('click', (e) => {
  const row = e.target.closest('[data-cue]');
  if (!row || e.target.matches('.cue-edit')) return;
  const n = Number(row.dataset.cue), c = app.cues.find((x) => x.n === n);
  if (!c) return;
  app.seek(c.start); timeline.reveal(c.start, c.end);
  app.select({ kind: 'cue', id: n }, { lane: 'cap' });
  cueEditing = n;
  renderCueList();
  const i = $('#cueList .cue-edit');
  i?.focus(); i?.setSelectionRange(i.value.length, i.value.length);
});
// 字幕分頁改字：打一個字就算數（會自動存），和屬性面板一樣；只是點進來沒打字，什麼都不會寫。Esc 回到點進來時的字
const liveCue = (i) => { const n = Number(i.closest('[data-cue]').dataset.cue); if (i.value.trim()) setCue(n, { text: i.value }, { coalesce: `cap-${n}` }); };
$('#cueList').addEventListener('input', (e) => { if (e.target.matches('.cue-edit') && !e.isComposing) liveCue(e.target); });
$('#cueList').addEventListener('compositionend', (e) => { if (e.target.matches('.cue-edit')) liveCue(e.target); });
$('#cueList').addEventListener('keydown', (e) => {
  if (!e.target.matches('.cue-edit')) return;
  const i = e.target;
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); i.blur(); renderCueList(); }
  if (e.key === 'Escape') { if (i.value !== i.dataset.orig) { i.value = i.dataset.orig; liveCue(i); } i.blur(); renderCueList(); }
  e.stopPropagation();
});
$('#cueList').addEventListener('focusout', (e) => {
  if (!e.target.matches('.cue-edit')) return;
  const i = e.target;
  if (!i.value.trim()) { i.value = i.dataset.orig; liveCue(i); toast('字幕不能是空的，已經回到原本的字；不要這句請到「屬性」刪除', 'warn'); }
  cueEditing = null;   // 點別處、Enter、Esc 都會走到這裡：離開編輯，那句換回一般的字
  renderSideSoon();
});
$('#nowBar').addEventListener('click', (e) => {
  const act = e.target.closest('[data-now]')?.dataset.now;
  if (!act) return;
  if (act === 'gap') { const g = app.uncovered.find(([a, b]) => app.t >= a && app.t < b); if (g) app.select({ kind: 'gap', id: gapId(g[0]) }); setRequestsOpen(true); return; }
  const seg = currentSeg(app.t);
  if (!seg) return;
  app.select({ kind: seg.type === 'media' ? 'media' : 'item', id: seg.id });
  if (act === 'req') setRequestsOpen(true);
  else if (app.side === 'rq') renderRequests(); else setSide(app.side === 'segs' ? 'segs' : 'insp');
});

// 分鏡表的「在預覽看」、AI 給的網址：?seg=x0410 或 ?t=12:30 打開就停在那裡
function tryDeepLink() {
  const p = new URLSearchParams(location.search), seg = p.get('seg'), t = p.get('t');
  if (app.deepLinked || (!seg && !t)) return;
  if (seg) {
    if (!app.itemsView.some((x) => x.id === seg)) { if (app.reportReady) { app.deepLinked = true; toast(`找不到 ${seg}（可能被 AI 改名或刪掉了）`, 'warn', 5000); } return; }
    app.deepLinked = true;
    goToSeg(seg);
    return;
  }
  const at = parseTC(t);
  app.deepLinked = true;
  if (at != null) { app.seek(at); timeline.reveal(at, at); }
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

document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox'].includes(e.target.type));
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && k === 's') { e.preventDefault(); save({ notify: true }); return; }
  if (mod && k === 'f' && !document.querySelector('dialog[open]')) { e.preventDefault(); openFind(); return; }
  if (mod && (k === 'z' || k === 'y') && !typing) { e.preventDefault(); if (k === 'y' || e.shiftKey) redo(); else undo(); return; }
  if (mod && k === 'b' && !typing) { e.preventDefault(); bladeKey(); return; }
  if (typing || mod || e.altKey) return;
  if (document.querySelector('dialog[open]') || !$('#coach').hidden || !$('#coachFinal').hidden || !$('#coachRough').hidden) return;
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
    case '[': neighborSeg(-1); break;
    case ']': neighborSeg(1); break;
    case 'f': $('#btnFull').click(); break;
    case 'Enter': if (selectedCue()) { e.preventDefault(); openCapEditor(selectedCue().n); } break;
    case 'Delete': case 'Backspace': e.preventDefault(); deleteSelection(); break;
    case 'Escape': app.sel = { a: null, b: null }; app.select(null); setTool('select'); break;
    case '+': case '=': timeline.zoomTo(timeline.pps * 1.6); break;
    case '-': case '_': timeline.zoomTo(timeline.pps / 1.6); break;
    case 'z': if (e.shiftKey) timeline.fit(); break;
    case '?': $('#dlgHelp').showModal(); break;
    case 'Home': e.preventDefault(); step(0); app.seek(0); timeline.ensureVisible(0); break;
    case 'End': e.preventDefault(); step(0); app.seek(app.dur); timeline.ensureVisible(app.dur); break;
    default: return;
  }
});
document.addEventListener('compositionstart', () => { app.composing = true; });
document.addEventListener('compositionend', () => { app.composing = false; });
// 切回對話、關分頁：馬上存，不等那一秒。沒存到才擋關頁
document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
window.addEventListener('pagehide', flushNow);
window.addEventListener('beforeunload', (e) => {
  flushNow();
  // 最新的修改已經送出去（keepalive），換頁、關頁都會存好，不用問。只有真的存不到才問
  const sent = app.inFlight && app.sentSafe && dirtySnap() === app.sentSnap && !app.saveOffline && !app.saveErrors;
  if (isDirty() && !sent) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- 開始 ----------
(async () => {
  fitLayout();
  renderCheck(); renderMode();
  await loadState();
  requestAnimationFrame(frame);
  setInterval(pollVersion, 2500);
  // 有成品就開在完成影片預覽：來這裡多半是要看片。?view=sim 才開快速試聽；還沒做過、沒有播放器時留在快速試聽（?view=final 會講原因）
  const view = new URLSearchParams(location.search).get('view'), pv = app.server?.preview;
  if (view === 'final' || (view !== 'sim' && pv?.built && pv?.player?.available)) await setMode('player');
  if (roughStage()) { if (!storage.get(COACH_ROUGH_KEY)) $('#coachRough').hidden = false; }
  else if (app.mode === 'player') { if (!storage.get(COACH_FINAL_KEY)) $('#coachFinal').hidden = false; }
  else if (!storage.get(COACH_KEY)) $('#coach').hidden = false;
  tryDeepLink();
})();

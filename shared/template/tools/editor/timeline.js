// 時間軸（canvas）：照疊放順序由上到下——總覽、時間尺、動畫（資訊卡／字卡動態）、插入素材、主軌畫面、字幕、人聲、音效
// 這裡只管畫圖、點到什麼（hit test）、吸附；點下去／拖曳要做什麼由 app.js 的 app.tl* 決定。
import { fmt, fmtTC, fmtSec, fmtDb, clamp, cutIndexAt, joinFor, dbToGain, gainAt } from './model.mjs';
import { speedLabel } from './speed.mjs';
import { transitionOf } from './motion.mjs';

// 片段第 t 秒對到素材第幾秒（變速、定格照 knots）
function srcOf(it, t) {
  const K = it.knots?.length >= 2 ? it.knots : null;
  if (!K) return (it.in || 0) + (t - it.start) * (it.speed || 1);
  const d = t - it.start;
  let i = 0;
  while (i < K.length - 2 && d >= K[i + 1][0]) i++;
  const rate = (K[i + 1][1] - K[i][1]) / Math.max(1e-6, K[i + 1][0] - K[i][0]);
  return K[i][1] + Math.max(0, d - K[i][0]) * rate;
}

export const LANES = [['ov', 12], ['ruler', 22], ['anim', 36], ['media', 42], ['main', 46], ['cap', 28], ['voice', 56], ['sfx', 28]];
// 視窗矮的時候軌道變薄，把高度留給影片（筆電、左右分割視窗）
export const LANES_COMPACT = [['ov', 10], ['ruler', 18], ['anim', 30], ['media', 24], ['main', 30], ['cap', 22], ['voice', 30], ['sfx', 20]];
export const TRACK_NAMES = { anim: '動畫', media: '插入素材', main: '主軌畫面', cap: '字幕', voice: '人聲', sfx: '音效' };
const PAD = 10;
const MAX_PPS = 600;
const C = {
  bg: '#070B14', lane: '#0B1020', lane2: '#0D1426', sep: 'rgba(255,255,255,0.07)', text: '#FFFFFF', mute: 'rgba(255,255,255,0.66)', dim: 'rgba(255,255,255,0.38)',
  wave: 'rgba(160,200,255,0.70)', waveHot: '#FF5A5F', cut: 'rgba(7,11,20,0.72)', cutLine: '#FF5A5F', sel: 'rgba(255,212,0,0.16)', selLine: '#FFD400',
  play: '#FFD400', voice: 'rgba(255,255,255,0.22)', band: '#FFD400', bandDim: 'rgba(255,212,0,0.55)',
  scene: '#3B82F6', fx: '#C792EA', custom: '#2FB36B', media: '#FF8A3D', cap: '#1E2740', capSel: '#2B3A63', sfx: '#4ADE9B',
};
const DB_TOP = 12, DB_BOT = -30;     // 音量線的上下界（−30 以下畫在底線，標「靜音」）

export class Timeline {
  constructor(canvas, tip, app) {
    this.cv = canvas; this.tip = tip; this.app = app;
    this.ctx = canvas.getContext('2d');
    this.off = document.createElement('canvas');
    this.dur = 0; this.pps = 50; this.t0 = 0; this.fitPps = 50;
    this.staticDirty = true; this.drag = null; this.hover = null; this.snapLine = null;
    this.compact = false;
    this.layoutLanes();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement);
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', () => { this.drag?.h?.cancel?.(); this.drag = null; this.snapLine = null; this.invalidate(); });
    canvas.addEventListener('dblclick', (e) => { const { x, y: yy } = this.local(e); const h = this.hit(x, yy); this.app.tlDouble?.(h, this.tOf(x), e); });
    canvas.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = null; this.tip.hidden = true; this.app.requestDraw(); } });
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.resize();
  }

  layoutLanes() {
    this.lanes = this.compact ? LANES_COMPACT : LANES;
    this.L = {};
    let y = 0;
    for (const [k, h] of this.lanes) { this.L[k] = [y, y + h]; y += h + 1; }
    this.totalH = y;
  }
  setCompact(on) {
    if (this.compact === on) return false;
    this.compact = on;
    this.layoutLanes();
    this.resize();
    return true;
  }

  // ---------- 座標 ----------
  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssW = Math.max(200, r.width); this.cssH = this.totalH;
    for (const c of [this.cv, this.off]) { c.width = Math.round(this.cssW * dpr); c.height = Math.round(this.cssH * dpr); }
    this.cv.style.height = `${this.cssH}px`;
    this.dpr = dpr;
    const keep = this.pps <= this.fitPps * 1.0001;
    this.fitPps = this.dur > 0 ? (this.cssW - PAD * 2) / this.dur : 50;
    if (keep || this.pps < this.fitPps) this.pps = this.fitPps;
    this.clampView();
    this.invalidate();
  }
  setDuration(d) {
    this.dur = d || 0;
    this.fitPps = this.dur > 0 ? (this.cssW - PAD * 2) / this.dur : 50;
    if (this.pps < this.fitPps || !this._init) { this.pps = this.fitPps; this.t0 = 0; this._init = true; }
    this.clampView();
    this.invalidate();
  }
  span() { return (this.cssW - PAD * 2) / this.pps; }
  clampView() { this.t0 = clamp(this.t0, 0, Math.max(0, this.dur - this.span())); }
  xOf(t) { return PAD + (t - this.t0) * this.pps; }
  tOf(x) { return clamp(this.t0 + (x - PAD) / this.pps, 0, this.dur); }
  zoomPct() { return Math.round((this.pps / this.fitPps) * 100); }
  zoom01() { const m = Math.max(this.fitPps * 1.0001, MAX_PPS); return Math.log(this.pps / this.fitPps) / Math.log(m / this.fitPps); }
  setZoom01(v, anchorT = null) { const m = Math.max(this.fitPps * 1.0001, MAX_PPS); this.zoomTo(this.fitPps * Math.pow(m / this.fitPps, clamp(v, 0, 1)), anchorT); }
  zoomTo(pps, anchorT = null) {
    const at = anchorT ?? this.app.t;
    const ax = clamp(this.xOf(at), PAD, this.cssW - PAD);
    this.pps = clamp(pps, this.fitPps, Math.max(this.fitPps, MAX_PPS));
    this.t0 = at - (ax - PAD) / this.pps;
    this.clampView();
    this.invalidate();
    this.app.onZoom?.();
  }
  fit() { this.pps = this.fitPps; this.t0 = 0; this.invalidate(); this.app.onZoom?.(); }
  ensureVisible(t, page = true) {
    const s = this.span();
    if (t < this.t0 || t > this.t0 + s) { this.t0 = page ? t - s * 0.1 : t - s / 2; this.clampView(); this.invalidate(); }
  }
  invalidate() { this.staticDirty = true; this.app.requestDraw(); }
  laneAt(y) { for (const [k] of LANES) if (y >= this.L[k][0] && y <= this.L[k][1]) return k; return null; }
  local(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  // 音量線：dB ↔ y（車道內）
  yOfDb(lane, db) {
    const [a, b] = this.L[lane];
    const top = a + 6, bot = b - 6;
    if (db == null || db <= DB_BOT) return bot;
    return bot - ((clamp(db, DB_BOT, DB_TOP) - DB_BOT) / (DB_TOP - DB_BOT)) * (bot - top);
  }
  dbOfY(lane, y) {
    const [a, b] = this.L[lane];
    const top = a + 6, bot = b - 6;
    const db = DB_BOT + ((bot - clamp(y, top, bot)) / (bot - top)) * (DB_TOP - DB_BOT);
    return db <= DB_BOT + 0.25 ? -60 : Math.round(db * 2) / 2;
  }

  // ---------- 吸附 ----------
  // 回傳 { t, snap }；snap＝吸到的候選 { t, kind, n? }。按住 Alt 或吸附關閉時不吸。
  snap(t, e, { exclude = [], tol = 8 } = {}) {
    const A = this.app;
    this.snapLine = null;
    if (!A.snapOn || e?.altKey) return { t, snap: null };
    let best = null, bd = tol / this.pps;
    for (const c of A.snapCandidates()) {
      if (exclude.some((x) => Math.abs(x - c.t) < 1e-6)) continue;
      const d = Math.abs(c.t - t);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { this.snapLine = best; return { t: best.t, snap: best }; }
    return { t, snap: null };
  }

  // ---------- 繪圖 ----------
  draw() {
    if (!this.cssW) return;
    if (this.staticDirty) { this.drawStatic(); this.staticDirty = false; }
    const g = this.ctx, d = this.dpr, L = this.L, A = this.app;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.drawImage(this.off, 0, 0);
    g.setTransform(d, 0, 0, d, 0, 0);
    if (this.dur > 0) {
      const ox = PAD + (A.t / this.dur) * (this.cssW - PAD * 2);
      g.fillStyle = C.play; g.fillRect(ox - 1, L.ov[0], 2, L.ov[1] - L.ov[0]);
    }
    if (this.hover && !this.drag && this.hover.x > PAD) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(Math.round(this.hover.x), L.ruler[0], 1, this.cssH - L.ruler[0]); }
    if (this.snapLine) {
      const x = Math.round(this.xOf(this.snapLine.t)) + 0.5;
      g.strokeStyle = '#FFD400'; g.lineWidth = 1; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(x, L.ruler[0]); g.lineTo(x, this.cssH); g.stroke(); g.setLineDash([]);
      g.font = '700 10px "Noto Sans TC", system-ui, sans-serif'; g.textBaseline = 'top';
      const lab = { cueStart: `#${this.snapLine.n} 開頭`, cueEnd: `#${this.snapLine.n} 結尾`, play: '播放頭', cut: '剪接', point: '剪接點', item: '段落邊緣', split: '分割點' }[this.snapLine.kind] || '吸附';
      const w = g.measureText(lab).width + 8;
      g.fillStyle = '#FFD400'; g.fillRect(x + 2, L.ruler[0] + 1, w, 13);
      g.fillStyle = '#0B1020'; g.fillText(lab, x + 6, L.ruler[0] + 2);
    }
    const x = this.xOf(A.t);
    if (x >= 0 && x <= this.cssW) {
      g.fillStyle = C.play;
      g.fillRect(Math.round(x) - 1, L.ruler[0], 2, this.cssH - L.ruler[0]);
      g.beginPath(); g.moveTo(x - 6, L.ruler[0]); g.lineTo(x + 6, L.ruler[0]); g.lineTo(x + 6, L.ruler[0] + 6); g.lineTo(x, L.ruler[0] + 12); g.lineTo(x - 6, L.ruler[0] + 6); g.closePath(); g.fill();
    }
  }

  drawStatic() {
    const A = this.app, g = this.off.getContext('2d'), d = this.dpr, L = this.L;
    g.setTransform(d, 0, 0, d, 0, 0);
    const W = this.cssW, H = this.cssH;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const t1 = this.t0 + this.span() + PAD / this.pps;
    const vis = (a, b) => b >= this.t0 - PAD / this.pps && a <= t1;
    const X = (t) => this.xOf(t);
    const font = (px, w = 400) => `${w} ${px}px "Noto Sans TC", system-ui, sans-serif`;
    const clipRect = (x, y, w, h, fn) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); fn(); g.restore(); };
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
    // 片段兩端的白色斜角＝有轉場（滑上去的提示寫是哪一種）
    const txWedge = (xa, xb, y, h, tr) => {
      const w = Math.min(14, (xb - xa) / 3);
      if (w < 4) return;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      if (tr.showIn) { g.beginPath(); g.moveTo(xa, y); g.lineTo(xa + w, y); g.lineTo(xa, y + h); g.closePath(); g.fill(); }
      if (tr.showOut) { g.beginPath(); g.moveTo(xb, y); g.lineTo(xb - w, y); g.lineTo(xb, y + h); g.closePath(); g.fill(); }
    };
    const hatch = (a, b, y0, y1, color, gap = 7) => {
      const xa = Math.max(0, X(a)), xb = Math.min(W, X(b));
      if (xb <= xa) return;
      clipRect(xa, y0, xb - xa, y1 - y0, () => {
        g.strokeStyle = color; g.lineWidth = 1.2; g.beginPath();
        for (let x = xa - (y1 - y0) - (xa % gap); x < xb; x += gap) { g.moveTo(x, y1); g.lineTo(x + (y1 - y0), y0); }
        g.stroke();
      });
    };
    for (const [k] of LANES) {
      if (k === 'ov' || k === 'ruler') continue;
      g.fillStyle = A.selLane === k ? '#0F1830' : C.lane; g.fillRect(0, L[k][0], W, L[k][1] - L[k][0]);
      g.fillStyle = C.sep; g.fillRect(0, L[k][1], W, 1);
      if (A.trackLocked?.(k)) hatch(this.t0, t1, L[k][0], L[k][1], 'rgba(255,255,255,0.05)', 10);
    }
    // 影片範圍外
    if (this.dur > 0) {
      const xe = X(this.dur);
      if (xe < W) { g.fillStyle = '#05080F'; g.fillRect(xe, L.anim[0], W - xe, H - L.anim[0]); }
    }

    // ---- 總覽 ----
    g.fillStyle = '#0E1528'; g.fillRect(0, L.ov[0], W, L.ov[1] - L.ov[0]);
    if (this.dur > 0) {
      const OX = (t) => PAD + (t / this.dur) * (W - PAD * 2);
      for (const it of A.itemsView) { g.fillStyle = C[it.type] || C.scene; g.fillRect(OX(it.start), L.ov[0] + 2, Math.max(1, OX(it.end) - OX(it.start)), 3); }
      for (const [a, b] of A.edit.cuts) { g.fillStyle = 'rgba(224,32,42,0.9)'; g.fillRect(OX(a), L.ov[0] + 6, Math.max(1.5, OX(b) - OX(a)), 5); }
      g.strokeStyle = 'rgba(255,212,0,0.85)'; g.lineWidth = 1;
      g.strokeRect(OX(this.t0) + 0.5, L.ov[0] + 0.5, Math.max(4, OX(Math.min(this.dur, this.t0 + this.span())) - OX(this.t0) - 1), L.ov[1] - L.ov[0] - 1);
    }

    // ---- 時間尺 ----
    g.fillStyle = '#0A0F1D'; g.fillRect(0, L.ruler[0], W, L.ruler[1] - L.ruler[0]);
    const steps = [1 / 30, 2 / 30, 5 / 30, 10 / 30, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200];
    const step = steps.find((s) => s * this.pps >= 80) || 1800;
    const minor = step / (step >= 60 ? 6 : step === 15 ? 3 : step < 1 ? 2 : 5);
    g.fillStyle = C.dim;
    for (let t = Math.floor(this.t0 / minor) * minor; t <= t1; t += minor) { const x = X(t); if (x >= 0) g.fillRect(Math.round(x), L.ruler[1] - 4, 1, 4); }
    g.font = font(10.5); g.textBaseline = 'top';
    for (let t = Math.floor(this.t0 / step) * step; t <= t1; t += step) {
      const x = X(t); if (x < 0) continue;
      g.fillStyle = C.mute; g.fillRect(Math.round(x), L.ruler[0] + 3, 1, L.ruler[1] - L.ruler[0] - 3);
      g.fillText(step < 1 ? fmtTC(t).slice(3) : fmt(t, 0), x + 4, L.ruler[0] + 4);
    }
    // 入點／出點
    const s = A.sel;
    if (s.a != null || s.b != null) {
      g.fillStyle = 'rgba(255,212,0,0.35)';
      if (s.a != null && s.b != null && s.b > s.a) g.fillRect(X(s.a), L.ruler[1] - 5, X(s.b) - X(s.a), 5);
    }

    // ---- 動畫（資訊卡／字卡動態／自訂）----
    // 修改單標記：✎ 待改（白底）、✓ 已改完（深底綠勾）；畫在段的右端
    const rqBadge = (x, y, st) => {
      g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fillStyle = st === 'done' ? '#0B1020' : '#FFFFFF'; g.fill();
      if (st === 'done') { g.strokeStyle = C.sfx; g.lineWidth = 1.5; g.stroke(); }
      g.fillStyle = st === 'done' ? C.sfx : '#0B1020'; g.font = font(9.5, 800); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(st === 'done' ? '✓' : '✎', x, y + 0.5); g.textAlign = 'left';
    };
    const anim = A.itemsView.filter((it) => it.type !== 'media');
    const nRows = Math.max(1, Math.min(3, A.animRows || 1));
    const rh = (L.anim[1] - L.anim[0] - 4) / nRows;
    for (const it of anim) {
      if (!vis(it.start, it.end)) continue;
      const row = Math.min(nRows - 1, it.row || 0);
      const y = L.anim[0] + 2 + row * rh, h = rh - 2;
      const xa = X(it.start), xb = X(it.vend ?? it.end);
      const col = C[it.type] || C.scene;
      g.globalAlpha = it.inCut ? 0.4 : 1;
      rr(xa, y, Math.max(3, xb - xa), h, 4); g.fillStyle = col; g.fill();
      g.globalAlpha = 1;
      if (it.textDirty) { g.fillStyle = '#FFD400'; g.beginPath(); g.arc(Math.max(xa + 6, Math.min(xb - 6, xa + 6)), y + 5, 3, 0, Math.PI * 2); g.fill(); }
      txWedge(xa, xb, y, h, transitionOf(it));
      if (A.isSelected('item', it.id)) { g.strokeStyle = '#fff'; g.lineWidth = 2; rr(xa + 1, y + 1, Math.max(2, xb - xa - 2), h - 2, 3); g.stroke(); }
      if (it.warnings) { g.fillStyle = '#FFD400'; g.fillRect(xa, y + h - 3, Math.max(3, xb - xa), 3); }
      const rq = xb - xa > 22 ? A.rqMark?.(it.id) : null;
      if (rq) rqBadge(xb - 10, y + h / 2, rq);
      if (xb - xa > 26) clipRect(xa + 3, y, xb - xa - 6 - (rq ? 16 : 0), h, () => {
        g.fillStyle = it.type === 'custom' ? '#0B1020' : '#fff'; g.font = font(h > 18 ? 11.5 : 10.5, 700); g.textBaseline = 'middle';
        g.fillText(`${it.id}　${it.title || it.label || ''}`, Math.max(xa, 0) + 6, y + h / 2 + 0.5);
      });
    }
    if (!anim.length) { g.font = font(11.5); g.fillStyle = C.dim; g.textBaseline = 'middle'; g.fillText(A.itemsHint || '沒有資訊卡或字卡動態', PAD + 6, (L.anim[0] + L.anim[1]) / 2); }
    // 沒有任何卡片、動畫或素材的講解（002 check-json 的 uncovered）：灰色斜線
    for (const [a, b] of A.uncovered || []) if (vis(a, b)) hatch(a, b, L.anim[0] + 2, L.anim[1] - 2, 'rgba(160,170,190,0.35)', 8);

    // ---- 插入素材 ----
    const mediaItems = A.itemsView.filter((it) => it.type === 'media');
    for (const it of mediaItems) {
      if (!vis(it.start, it.end)) continue;
      const [y0, y1] = L.media;
      const xa = X(it.start), xb = X(it.end), y = y0 + 3, h = y1 - y0 - 6;
      rr(xa, y, Math.max(3, xb - xa), h, 4); g.fillStyle = '#2A1A0E'; g.fill();
      clipRect(xa, y, Math.max(3, xb - xa), h, () => this.drawMediaThumbs(g, it, xa, xb, y, h));
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(xa, y, Math.max(3, xb - xa), h);
      txWedge(xa, xb, y, h, transitionOf(it));
      const sel = A.isSelected('media', it.id);
      g.strokeStyle = sel ? '#fff' : C.media; g.lineWidth = sel ? 2 : 1.5; rr(xa + 0.75, y + 0.75, Math.max(2, xb - xa - 1.5), h - 1.5, 4); g.stroke();
      // 裁剪把手
      if (sel || this.hover?.mediaId === it.id) {
        g.fillStyle = C.media;
        for (const [xx, dir] of [[xa, 1], [xb, -1]]) { g.fillRect(dir > 0 ? xx : xx - 5, y, 5, h); g.fillStyle = '#0B1020'; g.fillRect(dir > 0 ? xx + 2 : xx - 3, y + h / 2 - 6, 1, 12); g.fillStyle = C.media; }
      }
      const rq = xb - xa > 22 ? A.rqMark?.(it.id) : null;
      if (rq) rqBadge(xb - 11, y + 10, rq);
      if (xb - xa > 40) clipRect(xa + 6, y, xb - xa - 12 - (rq ? 16 : 0), h, () => {
        g.font = font(10.5, 700); g.textBaseline = 'top'; g.fillStyle = '#fff';
        g.shadowColor = '#000'; g.shadowBlur = 3;
        g.fillText(`${it.id}　${it.srcName || ''}`, xa + 8, y + 3);
        g.shadowBlur = 0;
      });
      // 原聲音量線
      if (it.mediaKind !== 'image') {
        const vol = it.volume;
        const yy = this.yOfDb('media', vol == null ? null : vol + A.edit.volume.media);
        g.strokeStyle = vol == null ? 'rgba(255,255,255,0.45)' : C.band; g.lineWidth = 1.5;
        if (vol == null) g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(xa + 5, yy); g.lineTo(xb - 5, yy); g.stroke(); g.setLineDash([]);
        if (xb - xa > 70) { g.font = font(10, 700); g.textBaseline = 'bottom'; g.fillStyle = vol == null ? C.mute : C.band; g.fillText(vol == null ? '原聲：靜音' : `原聲 ${fmtDb(vol)}`, xb - 82, yy - 2); }
      }
      if (it.inCut) hatch(it.start, it.end, y, y + h, 'rgba(255,90,95,0.35)', 6);
    }
    if (!mediaItems.length) { g.font = font(11.5); g.fillStyle = C.dim; g.textBaseline = 'middle'; g.fillText('沒有插入的螢幕錄影或圖片', PAD + 6, (L.media[0] + L.media[1]) / 2); }

    // ---- 主軌畫面 ----
    {
      const [y0, y1] = L.main;
      const y = y0 + 3, h = y1 - y0 - 6;
      const xa = X(0), xb = X(this.dur);
      clipRect(Math.max(0, xa), y, Math.min(W, xb) - Math.max(0, xa), h, () => this.drawMainThumbs(g, y, h));
      g.fillStyle = 'rgba(7,11,20,0.25)'; g.fillRect(Math.max(0, xa), y, Math.min(W, xb) - Math.max(0, xa), h);
      for (const [a, b] of A.voiceOnly) if (vis(a, b)) {
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(X(a), y, X(b) - X(a), h);
        hatch(a, b, y, y + h, C.voice, 8);
        if (X(b) - X(a) > 70) { g.font = font(10.5, 700); g.fillStyle = 'rgba(255,255,255,0.8)'; g.textBaseline = 'bottom'; g.fillText('只有聲音', X(a) + 5, y + h - 3); }
      }
      // 只有聲音、沒被素材蓋住（002 check-json 的 voiceUncovered）：紅色斜線
      for (const [a, b] of A.voiceUncovered || []) if (vis(a, b)) {
        hatch(a, b, y, y + h, 'rgba(255,90,95,0.85)', 5);
        if (X(b) - X(a) > 90) { g.font = font(10.5, 700); g.fillStyle = '#FF8A8E'; g.textBaseline = 'top'; g.fillText('沒被蓋住', X(a) + 5, y + 3); }
      }
      // 片段（分割點、剪掉的範圍隔開）
      for (const p of A.pieces) {
        if (!vis(p.a, p.b)) continue;
        if (A.isSelected('piece', p.key)) { g.strokeStyle = '#FFD400'; g.lineWidth = 2; g.strokeRect(X(p.a) + 1, y + 1, X(p.b) - X(p.a) - 2, h - 2); }
      }
      for (const t of A.splits) { const x = X(t); if (x < -2 || x > W + 2) continue; g.fillStyle = '#fff'; g.fillRect(Math.round(x) - 1, y, 2, h); g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.closePath(); g.fill(); }
      // 片頭片尾把手
      g.fillStyle = '#FFFFFF';
      const hs = A.headTail();
      for (const [t, dir] of [[hs.head, 1], [hs.tail, -1]]) { const xx = X(t); if (xx < -6 || xx > W + 6) continue; g.globalAlpha = 0.9; g.fillRect(dir > 0 ? xx : xx - 4, y, 4, h); g.globalAlpha = 1; }
    }
    // 剪掉的範圍（主軌、字幕、人聲一起）
    A.edit.cuts.forEach(([a, b], i) => {
      if (!vis(a, b)) return;
      const xa = X(a), xb = X(b), y0 = L.main[0], y1 = L.voice[1];
      g.fillStyle = C.cut; g.fillRect(xa, y0, xb - xa, y1 - y0);
      hatch(a, b, L.main[0] + 3, L.main[1] - 3, 'rgba(255,90,95,0.55)', 6);
      hatch(a, b, L.voice[0], L.voice[1], 'rgba(255,90,95,0.30)', 8);
      const sel = A.isSelected('cut', i);
      g.fillStyle = sel ? '#FFFFFF' : C.cutLine;
      for (const xx of [xa, xb]) g.fillRect(Math.round(xx) - (sel ? 1 : 0.5), y0, sel ? 3 : 1.5, y1 - y0);
      if (xb - xa > 46) { g.font = font(10.5, 700); g.fillStyle = '#FF8A8E'; g.textBaseline = 'top'; g.fillText(`✂ ${fmtSec(b - a)}`, xa + 5, L.main[0] + 6); }
    });
    // 開頭淡入、結尾淡出（照實際秒數畫斜角）
    {
      const e = A.edit, [y0, y1] = L.main, h = y1 - y0;
      const first = e.cuts[0]?.[0] <= 0 ? e.cuts[0][1] : 0;
      const lastCut = e.cuts[e.cuts.length - 1];
      const last = lastCut && lastCut[1] >= A.dur - 1e-3 ? lastCut[0] : A.dur;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      if (e.fadeIn > 0) { const a = X(first), b = X(first + e.fadeIn); g.beginPath(); g.moveTo(a, y0); g.lineTo(b, y0); g.lineTo(a, y1); g.closePath(); g.fill(); }
      if (e.fadeOut > 0) { const a = X(last - e.fadeOut), b = X(last); g.beginPath(); g.moveTo(a, y0); g.lineTo(b, y0); g.lineTo(b, y1); g.closePath(); g.fill(); }
    }
    // 剪接點與轉場（主軌上緣的菱形）
    for (const p of A.points) {
      const x = X(p.at);
      if (x < -8 || x > W + 8) continue;
      if (p.kind !== 'cut') { g.strokeStyle = p.kind === 'ng' ? 'rgba(255,138,142,0.75)' : 'rgba(125,180,255,0.75)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(Math.round(x) + 0.5, L.main[0]); g.lineTo(Math.round(x) + 0.5, L.main[1]); g.stroke(); g.setLineDash([]); }
      const j = joinFor(A.edit, p);
      const type = j?.type || 'none';
      const yy = L.main[0] + 7, r = A.isSelected('join', p.at) ? 7 : 5.5;
      g.beginPath(); g.moveTo(x, yy - r); g.lineTo(x + r, yy); g.lineTo(x, yy + r); g.lineTo(x - r, yy); g.closePath();
      if (type === 'dip') { g.fillStyle = '#FFFFFF'; g.fill(); } else if (type === 'punch') { g.fillStyle = '#FFD400'; g.fill(); }
      else { g.fillStyle = '#0B1020'; g.fill(); g.strokeStyle = p.kind === 'cut' ? '#FF8A8E' : 'rgba(255,255,255,0.8)'; g.lineWidth = 1.3; g.stroke(); }
      if (type === 'punch' && j) { const nx = A.nextPointAfter(p); g.fillStyle = 'rgba(255,212,0,0.6)'; g.fillRect(x, yy + 6, Math.max(0, Math.min(W, X(nx)) - x), 2); }
    }

    // ---- 字幕 ----
    {
      const [y0, y1] = L.cap;
      const y = y0 + 3, h = y1 - y0 - 6;
      g.font = font(11.5);
      for (const c of A.cues) {
        if (!vis(c.start, c.end)) continue;
        const xa = X(c.start), xb = X(c.end);
        const sel = A.isSelected('cue', c.n);
        const dead = A.isCutRange(c.start, c.end);
        rr(xa + 0.5, y, Math.max(2, xb - xa - 1), h, 3);
        g.fillStyle = sel ? C.capSel : dead ? 'rgba(255,90,95,0.10)' : C.cap; g.fill();
        if (sel) { g.strokeStyle = '#FFD400'; g.lineWidth = 1.5; g.stroke(); }
        const long = c.len > 18;
        if (long) { g.fillStyle = '#FFD400'; g.fillRect(xa + 1, y + h - 2, Math.max(2, xb - xa - 2), 2); }
        if (xb - xa > 18) clipRect(xa + 3, y, xb - xa - 6, h, () => {
          g.fillStyle = dead ? 'rgba(255,255,255,0.35)' : sel ? '#fff' : C.mute; g.textBaseline = 'middle';
          g.fillText(`${long ? '⚠ ' : ''}${c.text}`, xa + 5, y + h / 2 + 0.5);
        });
      }
      if (!A.cues.length) { g.fillStyle = C.dim; g.textBaseline = 'middle'; g.fillText(A.srtMissing ? '沒有 work/rough.srt' : '沒有字幕', PAD + 6, (y0 + y1) / 2); }
      // 可以新增字幕的空檔（滑鼠移過去時）
      const gp = this.hover?.gap;
      if (gp) { g.strokeStyle = 'rgba(255,212,0,0.7)'; g.setLineDash([3, 3]); g.lineWidth = 1; g.strokeRect(X(gp.lo) + 2, y + 1, X(gp.hi) - X(gp.lo) - 4, h - 2); g.setLineDash([]); }
    }

    // ---- 人聲（波形＋音量線）----
    {
      const [y0, y1] = L.voice;
      const mid = (y0 + y1) / 2 + 4, half = (y1 - y0) / 2 - 8;
      const P = A.peaks;
      const base = A.edit.volume.voice, gains = A.edit.gains;
      if (P && P.peaks.length) {
        const rate = P.rate, pk = P.peaks, sc = P.scale || 1000;
        for (let x = Math.max(0, Math.floor(X(0))); x < Math.min(W, X(this.dur)); x++) {
          const ta = this.t0 + (x - PAD) / this.pps, tb = ta + 1 / this.pps;
          const i0 = Math.floor(ta * rate), i1 = Math.max(i0 + 1, Math.ceil(tb * rate));
          let m = 0;
          for (let i = i0; i < i1 && i < pk.length; i++) if (pk[i] > m) m = pk[i];
          const a = (m / sc) * dbToGain(base + gainAt(ta, gains));
          const db = a > 0 ? 20 * Math.log10(a) : -100;
          const hgt = clamp((db + 48) / 48, 0, 1) * half;
          if (hgt < 0.5) continue;
          g.fillStyle = a >= 1 ? C.waveHot : cutIndexAt(ta, A.edit.cuts) >= 0 ? 'rgba(255,90,95,0.35)' : C.wave;
          g.fillRect(x, mid - hgt, 1, hgt * 2);
        }
      } else { g.font = font(11.5); g.fillStyle = C.dim; g.textBaseline = 'middle'; g.fillText(A.peaksHint || '波形計算中…', PAD + 6, mid); }
      // 音量線：整條是人聲音量（volume.voice），範圍音量（gains）往上／往下一段
      const xs = Math.max(0, X(0)), xe = Math.min(W, X(this.dur));
      g.strokeStyle = C.bandDim; g.lineWidth = 1.5;
      g.beginPath();
      let cur = xs;
      const segs = gains.filter((gg) => vis(gg.from, gg.to));
      const yBase = this.yOfDb('voice', base);
      g.moveTo(xs, yBase);
      for (const gg of segs) {
        const ga = Math.max(xs, X(gg.from)), gb = Math.min(xe, X(gg.to)), yg = this.yOfDb('voice', base + gg.db);
        g.lineTo(ga, yBase); g.lineTo(ga, yg); g.lineTo(gb, yg); g.lineTo(gb, yBase); cur = gb;
      }
      g.lineTo(xe, yBase); g.stroke();
      for (const [i, gg] of gains.entries()) {
        if (!vis(gg.from, gg.to)) continue;
        const ga = X(gg.from), gb = X(gg.to), yg = this.yOfDb('voice', base + gg.db);
        const sel = A.isSelected('gain', i);
        g.fillStyle = sel ? 'rgba(255,212,0,0.18)' : 'rgba(255,212,0,0.08)'; g.fillRect(ga, y0 + 2, gb - ga, y1 - y0 - 4);
        g.strokeStyle = C.band; g.lineWidth = sel ? 2.5 : 2; g.beginPath(); g.moveTo(ga, yg); g.lineTo(gb, yg); g.stroke();
        g.fillStyle = C.band; for (const xx of [ga, gb]) { g.beginPath(); g.arc(xx, yg, 3.5, 0, Math.PI * 2); g.fill(); }
        if (gb - ga > 50) { g.font = font(10.5, 700); g.textBaseline = 'bottom'; g.fillText(fmtDb(gg.db), ga + 5, yg - 3); }
      }
      if (Math.abs(base) > 0.05 && X(this.dur) - xs > 80) { g.font = font(10.5, 700); g.textBaseline = 'bottom'; g.fillStyle = C.bandDim; g.fillText(`人聲 ${fmtDb(base)}`, Math.max(xs, 0) + 6, yBase - 2); }
    }

    // ---- 選取範圍（主軌、字幕、人聲）----
    if (s.a != null && s.b != null && s.b > s.a && vis(s.a, s.b)) {
      const xa = X(s.a), xb = X(s.b), y0 = L.main[0], y1 = L.voice[1];
      g.fillStyle = C.sel; g.fillRect(xa, y0, xb - xa, y1 - y0);
      g.fillStyle = C.selLine; g.fillRect(Math.round(xa) - 1, y0, 2, y1 - y0); g.fillRect(Math.round(xb) - 1, y0, 2, y1 - y0);
      g.font = font(10, 700); g.textBaseline = 'top';
      g.fillRect(xa, y0, 14, 13); g.fillRect(xb - 14, y0, 14, 13);
      g.fillStyle = '#0B1020'; g.fillText('入', xa + 2, y0 + 1); g.fillText('出', xb - 12, y0 + 1);
    }

    // ---- 音效 ----
    {
      const [y0, y1] = L.sfx;
      const y = y0 + 4, h = y1 - y0 - 8;
      let any = false;
      for (const m of A.sfxView) {
        if (!vis(m.at - 1, m.at + 1)) continue;
        any = true;
        const x = X(m.at);
        const w = Math.max(12, Math.min(70, 0.6 * this.pps));
        const sel = A.isSelected('sfx', m.segId);
        rr(x, y, w, h, 3);
        g.fillStyle = m.muted ? 'rgba(255,255,255,0.08)' : m.main ? 'rgba(74,222,155,0.30)' : 'rgba(74,222,155,0.16)'; g.fill();
        g.strokeStyle = sel ? '#FFD400' : m.muted ? 'rgba(255,255,255,0.35)' : C.sfx; g.lineWidth = sel ? 2 : 1; g.stroke();
        // 音量條（0 dB 在中間偏上）
        if (!m.muted && m.db != null) { const k = clamp((m.db + 40) / 52, 0, 1); g.fillStyle = C.sfx; g.fillRect(x + 2, y + h - 2 - k * (h - 4), 3, k * (h - 4)); }
        if (w > 20) clipRect(x + 6, y, w - 8, h, () => {
          g.font = font(10, 700); g.textBaseline = 'middle'; g.fillStyle = m.muted ? C.dim : '#fff';
          g.fillText(m.muted ? `🔇 ${m.name}` : m.name, x + 7, y + h / 2 + 0.5);
        });
        if (m.muted) { g.strokeStyle = 'rgba(255,90,95,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 2, y + h - 2); g.lineTo(x + w - 2, y + 2); g.stroke(); }
      }
      if (!any && !A.sfxView.length) { g.font = font(11.5); g.fillStyle = C.dim; g.textBaseline = 'middle'; g.fillText(A.reportReady ? '沒有音效' : '音效位置：檢查報告出來後才看得到', PAD + 6, (y0 + y1) / 2); }
    }
  }

  drawMainThumbs(g, y, h) {
    const T = this.app.thumbs?.main;
    if (!T?.img || !T.meta) {
      // 第一次開要算縮圖（長片 10–20 秒）：講一聲，不要讓人以為壞了
      g.font = '400 11.5px "Noto Sans TC", system-ui, sans-serif'; g.fillStyle = C.dim; g.textBaseline = 'middle';
      g.fillText('縮圖產生中…（第一次開要等一下）', PAD + 6, y + h / 2);
      return;
    }
    const { interval, cols, w, h: th, count } = T.meta;
    const tw = (h * w) / th;
    const ta = Math.max(0, this.t0 - 1), tb = Math.min(this.dur, this.t0 + this.span() + 1);
    const step = Math.max(interval, tw / this.pps);
    for (let t = Math.floor(ta / step) * step; t < tb; t += step) {
      const i = Math.min(count - 1, Math.floor(t / interval));
      try { g.drawImage(T.img, (i % cols) * w, Math.floor(i / cols) * th, w, th, this.xOf(t), y, Math.min(tw, (step) * this.pps + 0.5), h); } catch { /* 圖還沒載好 */ }
    }
  }
  drawMediaThumbs(g, it, xa, xb, y, h) {
    const T = this.app.thumbs?.[it.id];
    if (!T?.img) return;
    if (it.mediaKind === 'image') {
      const iw = T.img.naturalWidth || 16, ih = T.img.naturalHeight || 9;
      const tw = (h * iw) / ih;
      for (let x = xa; x < xb; x += tw) try { g.drawImage(T.img, x, y, tw, h); } catch { /* 圖還沒載好 */ }
      return;
    }
    if (!T.meta) return;
    const { interval, cols, w, h: th, count } = T.meta;
    const tw = (h * w) / th;
    for (let x = Math.max(xa, -tw); x < Math.min(xb, this.cssW + tw); x += tw) {
      const t = this.tOf(x);
      const src = srcOf(it, t);
      const i = clamp(Math.floor(src / interval), 0, count - 1);
      try { g.drawImage(T.img, (i % cols) * w, Math.floor(i / cols) * th, w, th, x, y, tw, h); } catch { /* 圖還沒載好 */ }
    }
    // 速度色帶：定格灰、快轉橘、減速藍；原速不畫
    const K = it.knots?.length >= 2 ? it.knots : null;
    for (let i = 1; K && i < K.length; i++) {
      const rate = (K[i][1] - K[i - 1][1]) / Math.max(1e-6, K[i][0] - K[i - 1][0]);
      if (Math.abs(rate - 1) < 1e-3) continue;
      g.fillStyle = rate === 0 ? '#9AA0A6' : rate > 1 ? '#F6630F' : '#4C8BF5';
      const x0 = this.xOf(it.start + K[i - 1][0]), x1 = this.xOf(it.start + K[i][0]);
      g.fillRect(x0, y + h - 5, Math.max(2, x1 - x0 - 1), 5);
      if (x1 - x0 > 34) {
        g.font = '700 10px system-ui'; g.textBaseline = 'bottom'; g.textAlign = 'left'; g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 3;
        g.fillText(speedLabel(Math.round(rate * 1000) / 1000), x0 + 3, y + h - 6);
        g.shadowBlur = 0;
      }
    }
  }

  // ---------- 點到什麼 ----------
  hit(x, y) {
    const A = this.app, lane = this.laneAt(y), t = this.tOf(x), L = this.L;
    const h = { lane, t, x, y };
    if (!lane || lane === 'ov' || lane === 'ruler') return h;
    const near = (tt, px = 6) => Math.abs(this.xOf(tt) - x) <= px;
    if (lane === 'anim') {
      const nRows = Math.max(1, Math.min(3, A.animRows || 1));
      const row = Math.floor((y - L.anim[0] - 2) / ((L.anim[1] - L.anim[0] - 4) / nRows));
      let best = null;
      for (const it of A.itemsView) if (it.type !== 'media' && t >= it.start - 2 / this.pps && t <= (it.vend ?? it.end) + 2 / this.pps && (Math.min(nRows - 1, it.row || 0) === row || !best)) best = it;
      if (best) { h.kind = 'item'; h.item = best; }
      else {
        // 斜線：沒有任何卡片的講解。點得到才能在修改單寫「這裡想加畫面」
        const span = (A.uncovered || []).find(([a, b]) => t >= a && t < b);
        if (span) { h.kind = 'noCard'; h.span = span; }
      }
      return h;
    }
    if (lane === 'media') {
      for (const it of A.itemsView) {
        if (it.type !== 'media') continue;
        const xa = this.xOf(it.start), xb = this.xOf(it.end);
        if (x < xa - 6 || x > xb + 6) continue;
        h.item = it;
        if (it.mediaKind !== 'image' && Math.abs(y - this.yOfDb('media', it.volume == null ? null : it.volume + A.edit.volume.media)) <= 5 && x > xa + 6 && x < xb - 6) h.kind = 'mediaVol';
        else if (Math.abs(x - xa) <= 7 && (xb - xa > 18 || x < (xa + xb) / 2)) h.kind = 'mediaL';
        else if (Math.abs(x - xb) <= 7) h.kind = 'mediaR';
        else h.kind = 'media';
        return h;
      }
      return h;
    }
    if (lane === 'main') {
      if (y <= L.main[0] + 14) {
        let best = null, bd = 8;
        for (const p of A.points) { const d = Math.abs(this.xOf(p.at) - x); if (d < bd) { bd = d; best = p; } }
        if (best) { h.kind = 'join'; h.point = best; return h; }
      }
      const ht = A.headTail();
      if (near(ht.head, 7) && ht.head < this.dur - 0.05) { h.kind = 'head'; return h; }
      if (near(ht.tail, 7) && ht.tail > 0.05) { h.kind = 'tail'; return h; }
    }
    if (lane === 'main' || lane === 'cap' || lane === 'voice') {
      let best = null, bd = 6;
      A.edit.cuts.forEach(([a, b], i) => { for (const [tt, edge] of [[a, 0], [b, 1]]) { const d = Math.abs(this.xOf(tt) - x); if (d < bd) { bd = d; best = { i, edge }; } } });
      if (best && lane !== 'cap') { h.kind = 'cutEdge'; h.cut = best; return h; }
      const ci = cutIndexAt(t, A.edit.cuts);
      if (ci >= 0 && lane === 'main') { h.kind = 'cut'; h.cutIndex = ci; return h; }
    }
    if (lane === 'main') {
      const p = A.pieces.find((q) => t >= q.a && t < q.b);
      if (p) { h.kind = 'piece'; h.piece = p; }
      return h;
    }
    if (lane === 'cap') {
      for (const c of A.cues) {
        if (near(c.start, 5) && c.start > 0.0001) { h.kind = 'capEdge'; h.cue = c; h.edge = 0; }
        if (near(c.end, 5)) { h.kind = 'capEdge'; h.cue = c; h.edge = 1; }
        if (h.kind) {
          // 兩句相接時，滑鼠在哪一邊就拉哪一句
          if (h.edge === 1 && x > this.xOf(c.end)) { const nx = A.cues.find((q) => q.n === c.n + 1); if (nx && Math.abs(nx.start - c.end) < 0.001) { h.cue = nx; h.edge = 0; } }
          return h;
        }
      }
      const c = A.cues.find((q) => t >= q.start && t < q.end);
      if (c) { h.kind = 'cue'; h.cue = c; return h; }
      const g = A.gapAt(t);
      if (g) { h.kind = 'gap'; h.gap = g; }
      return h;
    }
    if (lane === 'voice') {
      const base = A.edit.volume.voice;
      for (const [i, gg] of A.edit.gains.entries()) {
        const ga = this.xOf(gg.from), gb = this.xOf(gg.to), yg = this.yOfDb('voice', base + gg.db);
        if (Math.abs(x - ga) <= 6 && Math.abs(y - yg) <= 12) { h.kind = 'gainEdge'; h.gain = i; h.edge = 0; return h; }
        if (Math.abs(x - gb) <= 6 && Math.abs(y - yg) <= 12) { h.kind = 'gainEdge'; h.gain = i; h.edge = 1; return h; }
        if (x > ga && x < gb) {
          h.gain = i;
          h.kind = Math.abs(y - yg) <= 6 ? 'gainVol' : 'gainBody';
          return h;
        }
      }
      if (Math.abs(y - this.yOfDb('voice', base)) <= 5) { h.kind = 'voiceVol'; return h; }
      h.kind = 'voiceBody';
      return h;
    }
    if (lane === 'sfx') {
      let best = null, bd = 9999;
      for (const m of A.sfxView) {
        const xa = this.xOf(m.at), w = Math.max(12, Math.min(70, 0.6 * this.pps));
        if (x >= xa - 3 && x <= xa + w + 3) { const d = Math.abs(x - xa); if (d < bd) { bd = d; best = m; } }
      }
      if (best) { h.kind = 'sfx'; h.sfx = best; }
      return h;
    }
    return h;
  }

  cursorFor(h) {
    if (!h.lane) return 'default';
    if (h.lane === 'ov') return 'pointer';
    if (this.app.tool === 'split' && h.lane !== 'ruler') return 'crosshair';
    if (h.lane === 'ruler') return 'ew-resize';
    const locked = this.app.trackLocked?.(h.lane);
    switch (h.kind) {
      case 'mediaL': case 'mediaR': case 'head': case 'tail': case 'cutEdge': case 'capEdge': case 'gainEdge': return locked ? 'not-allowed' : 'col-resize';
      case 'mediaVol': case 'gainVol': case 'voiceVol': return locked ? 'not-allowed' : 'ns-resize';
      case 'media': return locked ? 'pointer' : 'grab';
      case 'item': case 'join': case 'cue': case 'cut': case 'sfx': return 'pointer';
      case 'gap': return 'copy';
      default: return h.lane === 'main' || h.lane === 'voice' ? 'crosshair' : 'default';
    }
  }

  // ---------- 滑鼠 ----------
  down(e) {
    if (e.button !== 0 || !this.dur) return;
    const { x, y } = this.local(e);
    const h = this.hit(x, y);
    try { this.cv.setPointerCapture(e.pointerId); } catch { /* 合成事件沒有真的指標 */ }
    this.app.closePopovers?.();
    if (h.lane === 'ov') { this.drag = { mode: 'ov' }; this.ovMove(x); return; }
    if (h.lane === 'ruler') { this.drag = { mode: 'scrub' }; this.app.seek(this.tOf(x)); return; }
    if (!h.lane) return;
    const handler = this.app.tlDown?.(h, e);   // app 回傳 { move(t, y, e) → 提示文字, up(moved, e), cancel() } 或 null
    this.drag = { mode: 'h', h: handler, hit: h, x0: x, y0: y, moved: false };
  }
  ovMove(x) {
    const t = clamp(((x - PAD) / (this.cssW - PAD * 2)) * this.dur, 0, this.dur);
    this.t0 = t - this.span() / 2;
    this.clampView();
    this.invalidate();
  }
  move(e) {
    const { x, y } = this.local(e);
    const D = this.drag;
    if (D) {
      if (D.mode === 'ov') return this.ovMove(x);
      if (D.mode === 'scrub') return this.app.seek(this.tOf(x));
      if (!D.moved && Math.abs(x - D.x0) < 3 && Math.abs(y - D.y0) < 3) return;
      D.moved = true;
      if (D.h?.move) {
        const tip = D.h.move(this.tOf(x), y, e, x);
        this.showTip(tip, x, y);
        this.autoScroll(x);
        this.invalidate();
      }
      return;
    }
    const h = this.hit(x, y);
    const prevMedia = this.hover?.mediaId, prevGap = this.hover?.gap;
    this.hover = { x, y, mediaId: h.item?.type === 'media' ? h.item.id : null, gap: h.kind === 'gap' ? h.gap : null };
    if (prevMedia !== this.hover.mediaId || prevGap?.lo !== this.hover.gap?.lo) this.invalidate();
    this.cv.style.cursor = this.cursorFor(h);
    this.showTip(this.app.tlTip?.(h), x, y);
    this.app.requestDraw();
  }
  up(e) {
    const D = this.drag;
    this.drag = null;
    const hadSnap = !!this.snapLine;
    this.snapLine = null;
    this.tip.hidden = true;
    if (hadSnap) this.invalidate();
    if (!D || D.mode !== 'h') return;
    D.h?.up?.(D.moved, e);
    if (!D.moved) this.app.tlClick?.(D.hit, e);
    this.invalidate();
  }
  showTip(text, x, y) {
    if (!text) { this.tip.hidden = true; return; }
    this.tip.textContent = text;
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    this.tip.style.left = `${clamp(x + 14, 4, this.cssW - tw - 4)}px`;
    this.tip.style.top = `${clamp(y > this.cssH / 2 ? y - th - 12 : y + 16, 2, this.cssH - th - 2)}px`;
  }
  autoScroll(x) {
    if (x > this.cssW - 24) { this.t0 += 14 / this.pps; this.clampView(); this.invalidate(); }
    else if (x < 24) { this.t0 -= 14 / this.pps; this.clampView(); this.invalidate(); }
  }
  wheel(e) {
    if (!this.dur) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { const { x } = this.local(e); this.zoomTo(this.pps * Math.exp(-e.deltaY * 0.0025), this.tOf(x)); }
    else {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      this.t0 += d / this.pps;
      this.clampView();
      this.invalidate();
    }
  }
}

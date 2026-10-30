// type: "media"：插入螢幕錄影或圖片（plan.json 的一段）
//
//   checkMediaSeg(seg, { projectDir, probe, err, warn }) → media 描述（src、種類、素材資訊、in／speed／fit／volume／enter／exit）或 null
//   resolveMedia(it, { cues, tm, pipAt, err, warn })     段落時間定案後：畫面位置、錄影片段（cut 會切開）、運鏡、紅框、放大鏡
//   mediaJobs(it)                                          build 要準備的素材檔（轉檔、複製、放大鏡逐幀）
//   mediaParts(it, { off, lim, base, nextTrack, mediaDb, edit, outDur }) → { html, tl[] }（主合成用；off＝--test 起點）
//
// 座標一律是素材本身的像素（media.mjs frame --grid 讀）；畫面上的位置由這裡換算。
// 錄影 <video> 放在主合成（root），不放子合成（pitfalls §38）；放大鏡用逐幀 JPG 畫進 <canvas>，不用第二個 <video>。

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseTime, cueSeconds, r3, FPS } from './time.mjs';
import { probeMedia, VIDEO_EXT, IMAGE_EXT } from './ff.mjs';
import { splitAtJoins, dB } from './edit.mjs';

export const MEDIA_KEYS = ['id', 'type', 'src', 'from', 'to', 'duration', 'anchor', 'in', 'speed', 'fit', 'pip', 'volume', 'enter', 'exit', 'kenburns', 'moves', 'marks', 'lens', 'sfx', 'sfxVolume', 'note'];
export const MEDIA_DIRS = ['素材/螢幕錄影/', '素材/圖片/'];
export const TRANSITIONS = ['cut', 'fade', 'slide', 'zoom'];
export const ENTER = { cut: 0, fade: 0.5, slide: 0.6, zoom: 0.5 };
export const EXIT = { cut: 0, fade: 0.5, slide: 0.6, zoom: 0.4 };
// contain：放在字幕帶上方（y 0–940，和作者錄影段「可見區不碰字幕帶」同理）；cover：鋪滿 1920×1080
export const VIEW = { contain: [0, 0, 1920, 940], cover: [0, 0, 1920, 1080] };
export const PIP_ZONE = [1424, 581, 1888, 951];   // 子母畫面外框禁入區 x1, y1, x2, y2
const CAPTION_Y = 920;
const MAX_FILE = [3840, 2160];
const MARK = { pad: 6, sw: 4, draw: 0.4, out: 0.3, min: 0.5, hold: 1, max: 2, rx: 6 };
const LENS = { delay: 0.28, pop: 0.6, back: 0.32, fade: 0.1, min: 1.2, zoom: 2, maxW: 1600, maxH: 720, cx: 960, cy: 450, border: 3, pad: 10, dflt: 3 };
const MOVE = { dur: 1, warnZoom: 4 };
const KB = 1.05;
const DECLICK = 0.02;

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const n3 = (x) => String(r3(x));
const even = (x) => Math.max(2, Math.floor(x / 2) * 2);
const inter = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const ascii = (s) => s.normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 24) || 'media';

function listDir(projectDir, dir) {
  const abs = path.join(projectDir, ...dir.split('/').filter(Boolean));
  return fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => !f.startsWith('.')).map((f) => `${dir}${f}`) : [];
}

// ---------- 第一輪：欄位檢查（時間還沒定案）----------

export function checkMediaSeg(seg, { projectDir, probe = probeMedia, err, warn }) {
  const src = typeof seg.src === 'string' ? seg.src.trim().replace(/\\/g, '/').replace(/^\.\//, '') : '';
  if (!src || !MEDIA_DIRS.some((d) => src.startsWith(d)) || src.split('/').includes('..')) {
    err(`src 要寫專案資料夾裡 素材/螢幕錄影/ 或 素材/圖片/ 底下的檔案，例如 "素材/螢幕錄影/操作示範.mp4"，現在是 ${JSON.stringify(seg.src)}`);
    return null;
  }
  const ext = path.extname(src).toLowerCase();
  const kind = VIDEO_EXT.includes(ext) ? 'video' : IMAGE_EXT.includes(ext) ? 'image' : null;
  if (!kind) { err(`src：「${ext || '沒有副檔名'}」不支援 → 影片用 ${VIDEO_EXT.join(' ')}，圖片用 ${IMAGE_EXT.join(' ')}`); return null; }
  if (!projectDir) { err('media 段要知道專案資料夾：build 加 --project projects/<專案>'); return null; }
  const abs = path.join(projectDir, ...src.split('/'));
  if (!fs.existsSync(abs)) {
    const have = MEDIA_DIRS.flatMap((d) => listDir(projectDir, d));
    err(`src：找不到 ${src} → 檔名要和專案的 素材/ 資料夾裡一模一樣（現有：${have.join('、') || '素材/螢幕錄影/、素材/圖片/ 都是空的'}）`);
    return null;
  }
  let info;
  try { info = probe(abs); } catch (e) { err(`src：${e.message}`); return null; }
  if (!info.width || !info.height) { err(`src：${src} 讀不到畫面（不是影片或圖片）`); return null; }
  if (kind === 'video' && !(info.duration > 0)) { err(`src：${src} 讀不到影片長度`); return null; }

  const m = { src, abs, kind, ext, info, in: 0, speed: 1, fit: 'contain', volume: null, enter: 'fade', exit: 'fade', kenburns: kind === 'image' };
  if (seg.in != null) {
    if (kind === 'image') warn('in：圖片沒有起點，已忽略');
    else if (!isNum(seg.in) || seg.in < 0) err(`in 要是 ≥ 0 的秒數（錄影從第幾秒開始播），現在是 ${JSON.stringify(seg.in)}`);
    else if (seg.in >= info.duration) err(`in：第 ${seg.in}s 已經超過錄影長度 ${info.duration}s`);
    else m.in = r3(seg.in);
  }
  if (seg.speed != null) {
    if (kind === 'image') warn('speed：圖片沒有速度，已忽略');
    else if (!isNum(seg.speed) || seg.speed < 0.5 || seg.speed > 4) err(`speed 要是 0.5–4 的數字（2＝兩倍速），現在是 ${JSON.stringify(seg.speed)}`);
    else m.speed = seg.speed;
  }
  if (seg.fit != null) {
    if (!['contain', 'cover'].includes(seg.fit)) err(`fit 只能是 "contain"（整張看得到，放在字幕帶上方）或 "cover"（鋪滿畫面、多的裁掉），現在是 ${JSON.stringify(seg.fit)}`);
    else m.fit = seg.fit;
  }
  if (seg.pip != null && typeof seg.pip !== 'boolean') err(`pip 只能寫 true（右下角子母畫面露臉，預設）或 false（整段不露臉），現在是 ${JSON.stringify(seg.pip)}`);
  if (seg.volume != null) {
    if (!isNum(seg.volume) || seg.volume < -60 || seg.volume > 12) err(`volume 要寫 null（靜音，預設）或 −60～+12 的 dB 數字（保留素材原聲），現在是 ${JSON.stringify(seg.volume)}`);
    else if (kind === 'image' || !info.hasAudio) warn(`volume：${kind === 'image' ? '圖片' : `${src} 本身`}沒有聲音，已忽略`);
    else m.volume = r3(seg.volume);
  }
  for (const k of ['enter', 'exit']) {
    if (seg[k] == null) continue;
    if (!TRANSITIONS.includes(seg[k])) err(`${k} 只能是 ${TRANSITIONS.map((x) => `"${x}"`).join('、')}，現在是 ${JSON.stringify(seg[k])}`);
    else m[k] = seg[k];
  }
  if (seg.kenburns != null) {
    if (typeof seg.kenburns !== 'boolean') err(`kenburns 只能寫 true 或 false，現在是 ${JSON.stringify(seg.kenburns)}`);
    else m.kenburns = seg.kenburns;
  }
  for (const k of ['moves', 'marks', 'lens']) if (seg[k] != null && !Array.isArray(seg[k])) err(`${k} 要寫成陣列（[{ … }, { … }]）`);
  // 轉檔尺寸（只縮不放；yuv420p 要偶數）
  const fsx = Math.min(1, MAX_FILE[0] / info.width, MAX_FILE[1] / info.height);
  m.file = kind === 'video' ? { w: even(info.width * fsx), h: even(info.height * fsx) } : { w: info.width, h: info.height };
  m.file.sx = m.file.w / info.width; m.file.sy = m.file.h / info.height;
  return m;
}

// ---------- 第二輪：時間定案後 ----------

export function resolveMedia(it, { cues, tm, pipAt = () => false, err, warn }) {
  const m = it.media, seg = it.seg;
  const s = it.start, e = it.end;
  const W = m.info.width, H = m.info.height;

  // 畫面位置（stage 座標＝沒有運鏡時的 1920×1080 畫面座標）
  const [vx, vy, vw, vh] = VIEW[m.fit];
  const k0 = m.fit === 'cover' ? Math.max(vw / W, vh / H) : Math.min(vw / W, vh / H);
  const dw = Math.round(W * k0), dh = Math.round(H * k0);
  const G = m.geo = { kx: dw / W, ky: dh / H, left: Math.round(vx + (vw - dw) / 2), top: Math.round(vy + (vh - dh) / 2), width: dw, height: dh };
  const VIEWH = m.fit === 'cover' ? 1080 : 940;
  const toStage = ([x, y, w, h]) => [G.left + x * G.kx, G.top + y * G.ky, w * G.kx, h * G.ky];

  // 錄影片段：接點（cut）切開，檔案的第 t 秒＝素材的第 t×speed 秒
  if (m.kind === 'video') {
    const r0 = tm.unmapStart(s);
    const fileDur = m.info.duration / m.speed;
    const pieces = splitAtJoins(s, e, tm).map((p) => ({ s: p.s, e: p.e, fms: r3(m.in / m.speed + (p.ms - r0)) }));
    const [rs, re] = it.rough0 || [r0, tm.unmapEnd(e)];
    const need = r3(m.in + (re - rs) * m.speed);
    if (need > m.info.duration + 1 / FPS + 1e-6) {
      err(`素材 ${m.src} 長 ${m.info.duration}s；從第 ${m.in}s 起播 ${r3(re - rs)}s${m.speed !== 1 ? `（×${m.speed}）` : ''} 要用到第 ${need}s → to 提早、in 改小，或 speed 改小`);
    }
    m.pieces = [];
    for (const p of pieces) {
      const room = r3(fileDur - 1 / FPS - p.fms);
      if (room <= 0.05) continue;
      m.pieces.push({ s: p.s, e: r3(Math.min(p.e, p.s + room)), fms: p.fms });
    }
  }

  // 時間：#N／#Ne／+秒（本段起點後）
  const tAt = (v, what) => {
    const t = parseTime(v);
    if (t.error) { err(`${what}：${t.error}`); return null; }
    if (t.kind === 'abs') { err(`${what}：不能寫絕對秒數「${t.raw}」，改成 "+${t.sec}"（本段起點後幾秒）或 "#N"（綁字幕句）`); return null; }
    if (t.kind === 'rel') return r3(s + t.off);
    const c = cueSeconds(t, cues);
    if (c.error) { err(`${what}：${c.error}`); return null; }
    return c.sec;
  };
  const inSeg = (t, what) => {
    if (t < s - 1e-6 || t > e + 1e-6) { err(`${what}（${fmt(t)}）不在這段 ${fmt(s)}–${fmt(e)} 裡 → 改成這段範圍內的句號或 +秒數`); return false; }
    return true;
  };
  const boxOf = (b, what) => {
    if (!Array.isArray(b) || b.length !== 4 || !b.every(isNum) || b[2] <= 0 || b[3] <= 0) {
      err(`${what} 要寫 [x, y, w, h]（素材本身的像素座標，用 media.mjs frame --grid 截格線圖讀），現在是 ${JSON.stringify(b)}`);
      return null;
    }
    const [x, y, w, h] = b;
    if (x < -2 || y < -2 || x + w > W + 2 || y + h > H + 2) {
      err(`${what} [${b.join(', ')}] 超出素材範圍 ${W}×${H} → 座標是素材原尺寸的像素（不是 1920×1080 的畫面座標），用 media.mjs frame --grid 重讀`);
      return null;
    }
    const cx = Math.max(0, x), cy = Math.max(0, y);
    return [cx, cy, Math.min(W, x + w) - cx, Math.min(H, y + h) - cy];
  };
  const keysOk = (o, what, keys) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) { err(`${what} 要是物件`); return false; }
    let ok = true;
    for (const k of Object.keys(o)) if (!keys.includes(k)) { err(`${what}.${k}：沒有這個欄位（可用：${keys.join('、')}）`); ok = false; }
    return ok;
  };

  // --- 運鏡 ---
  const ID = { z: 1, x: 0, y: 0 };
  const camFor = (box) => {
    const [X, Y, Wd, Ht] = toStage(box);
    let z = Math.min(1920 / Wd, 940 / Ht);
    if (z < 1) z = 1;
    let tx = 960 - z * (X + Wd / 2), ty = 470 - z * (Y + Ht / 2);
    const mw = z * G.width, mh = z * G.height;
    tx = mw >= 1920 ? Math.min(-z * G.left, Math.max(1920 - z * (G.left + G.width), tx)) : (1920 - mw) / 2 - z * G.left;
    ty = mh >= VIEWH ? Math.min(-z * G.top, Math.max(VIEWH - z * (G.top + G.height), ty)) : (VIEWH - mh) / 2 - z * G.top;
    return { z: +z.toFixed(4), x: +tx.toFixed(1), y: +ty.toFixed(1) };
  };
  m.cams = [];
  let prev = ID, prevEnd = -Infinity;
  (seg.moves || []).forEach((mv, i) => {
    const what = `moves[${i}]`;
    if (!keysOk(mv, what, ['at', 'to', 'dur'])) return;
    const at = tAt(mv.at, `${what}.at`);
    if (at == null || !inSeg(at, `${what}.at`)) return;
    let dur = MOVE.dur;
    if (mv.dur != null) {
      if (!isNum(mv.dur) || mv.dur < 0.2 || mv.dur > 5) { err(`${what}.dur 要是 0.2–5 的秒數，現在是 ${JSON.stringify(mv.dur)}`); return; }
      dur = mv.dur;
    }
    let to;
    if (mv.to === 'full') to = ID;
    else {
      const box = boxOf(mv.to, `${what}.to`);
      if (!box) return;
      to = camFor(box);
      const [, , Wd, Ht] = toStage(box);
      const want = Math.min(1920 / Wd, 940 / Ht);
      if (want < 1) warn(`${what}.to 的框比畫面還大，推不近（已維持原大小）→ 框小一點，或寫 "full"`);
      else if (want > MOVE.warnZoom) warn(`${what}.to 要放大 ${r3(want)} 倍，畫面會糊 → 框大一點，或改用放大鏡 lens`);
    }
    if (at < prevEnd - 1e-6) { err(`${what}.at（${fmt(at)}）在上一個運鏡還沒結束（${fmt(prevEnd)}）時開始 → 往後挪，或把上一個的 dur 改短`); return; }
    if (at + dur > e + 1e-6) { warn(`${what} 在段尾之後才結束，dur 已縮成 ${r3(e - at)}s`); dur = r3(e - at); }
    if (dur < 0.2) return;
    m.cams.push({ t0: at, dur: r3(dur), from: prev, to });
    prev = to; prevEnd = at + dur;
  });
  m.kb = m.kenburns && !m.cams.length;
  if (m.kenburns && m.cams.length && seg.kenburns === true) warn('kenburns：有 moves 時不做慢推（Ken Burns），已忽略');
  const kbTo = m.kbTo = { z: KB, x: +((G.left + G.width / 2) * (1 - KB)).toFixed(1), y: +((G.top + G.height / 2) * (1 - KB)).toFixed(1) };
  const camAt = (t) => {
    if (m.kb) { const p = Math.min(1, Math.max(0, (t - s) / Math.max(0.001, e - s))); return { z: 1 + (KB - 1) * p, x: kbTo.x * p, y: kbTo.y * p }; }
    let c = ID;
    for (const mv of m.cams) {
      if (t < mv.t0) break;
      if (t >= mv.t0 + mv.dur) { c = mv.to; continue; }
      const p = (t - mv.t0) / mv.dur;
      return { z: mv.from.z + (mv.to.z - mv.from.z) * p, x: mv.from.x + (mv.to.x - mv.from.x) * p, y: mv.from.y + (mv.to.y - mv.from.y) * p };
    }
    return c;
  };
  const toScreen = (r, c) => [c.x + c.z * r[0], c.y + c.z * r[1], c.z * r[2], c.z * r[3]];
  const moving = (a, b) => m.kb ? false : m.cams.some((mv) => mv.t0 < b - 1e-6 && mv.t0 + mv.dur > a + 1e-6);

  // --- 紅框 ---
  const marks = [];
  (seg.marks || []).forEach((mk, i) => {
    const what = `marks[${i}]`;
    if (!keysOk(mk, what, ['at', 'until', 'box'])) return;
    const at = tAt(mk.at, `${what}.at`);
    if (at == null || !inSeg(at, `${what}.at`)) return;
    let until = mk.until != null ? tAt(mk.until, `${what}.until`) : e;
    if (until == null) return;
    const box = boxOf(mk.box, `${what}.box`);
    if (!box) return;
    if (until > e) until = e;
    if (until <= at + 1e-6) { err(`${what}.until（${fmt(until)}）要晚於 at（${fmt(at)}）`); return; }
    if (until - at < MARK.min - 1e-6) { warn(`${what} 只停 ${r3(until - at)}s（< ${MARK.min}s，閃一下就不見），已拿掉 → 要留就把 until 往後延`); return; }
    marks.push({ i, at, until, box });
  });
  if (marks.length) {
    const last = marks.reduce((a, b) => (b.until > a.until ? b : a));
    if (last.until < e - 1e-6) last.until = r3(Math.min(e, last.until + MARK.hold));   // 段尾最後一框講完再多停 1s
  }
  const crowded = new Set();
  for (const a of marks) {
    const n = marks.filter((b) => b.at <= a.at + 1e-6 && b.until > a.at + 1e-6).length;
    if (n > MARK.max && !crowded.has(n)) { crowded.add(n); err(`marks：${fmt(a.at)} 同時有 ${n} 個紅框（最多 ${MARK.max} 個）→ 位置相近的合成一個大框，或錯開 at／until`); }
  }
  m.marks = marks.map((mk, n) => {
    const c = camAt(mk.at);
    const [X, Y, Wd, Ht] = toStage(mk.box);
    const off = (MARK.pad + MARK.sw / 2) / c.z;
    const one = Math.abs(c.z - 1) < 1e-6;
    const q = (v) => (one ? Math.round(v) : +v.toFixed(2));
    const rect = [q(X - off), q(Y - off), q(Wd + 2 * off), q(Ht + 2 * off)];
    const scr = toScreen(rect, c);
    const sb = [scr[0], scr[1], scr[0] + scr[2], scr[1] + scr[3]];
    if (pipAt(mk.at) && inter(sb, PIP_ZONE) > 0) warn(`marks[${mk.i}] 在畫面上會被右下角的子母畫面擋住 → 這段寫 "pip": false，或用 moves 把那一塊推到畫面中間`);
    else if (sb[3] > CAPTION_Y) warn(`marks[${mk.i}] 壓到字幕區（畫面 y > ${CAPTION_Y}）→ 用 moves 把那一塊往上推，或換 fit`);
    if (sb[0] < 0 || sb[2] > 1920 || sb[1] < 0) warn(`marks[${mk.i}] 有一部分在畫面外（運鏡推太近）→ 調整 moves 或紅框的時間`);
    return { id: `mmk-${it.id}-${n + 1}`, at: mk.at, until: mk.until, rect, sw: +(MARK.sw / c.z).toFixed(3), rx: +(MARK.rx / c.z).toFixed(2) };
  });

  // --- 放大鏡 ---
  m.lenses = [];
  const frameSnap = (t) => r3(s + Math.round((t - s) * FPS) / FPS);
  (seg.lens || []).forEach((ln, i) => {
    const what = `lens[${i}]`;
    if (!keysOk(ln, what, ['at', 'until', 'box', 'zoom'])) return;
    let la = tAt(ln.at, `${what}.at`);
    if (la == null || !inSeg(la, `${what}.at`)) return;
    let lb = ln.until != null ? tAt(ln.until, `${what}.until`) : la + LENS.dflt;
    if (lb == null) return;
    lb = Math.min(lb, e);
    la = frameSnap(la); lb = frameSnap(lb);
    if (lb - la < LENS.min - 1e-6) { err(`${what} 只有 ${r3(lb - la)}s，放大鏡至少要 ${LENS.min}s（彈出 0.6＋縮回 0.32＋看清楚的時間）→ until 往後延`); return; }
    const box = boxOf(ln.box, `${what}.box`);
    if (!box) return;
    let zoom = LENS.zoom;
    if (ln.zoom != null) {
      if (!isNum(ln.zoom) || ln.zoom < 1.2 || ln.zoom > 4) { err(`${what}.zoom 要是 1.2–4 的倍數（預設 2），現在是 ${JSON.stringify(ln.zoom)}`); return; }
      zoom = ln.zoom;
    }
    if (m.lenses.some((o) => o.la < lb - 1e-6 && o.lb > la + 1e-6)) { err(`${what} 和前一個放大鏡時間重疊 → 一次只放一個，錯開 at／until`); return; }
    if (moving(la, lb)) warn(`${what} 期間有運鏡，鏡片位置是用 ${fmt(la)} 那一刻的畫面算的 → 運鏡和放大鏡錯開`);
    const c = camAt(la);
    const R = toScreen(toStage(box), c);
    let Cw = R[2] * zoom, Ch = R[3] * zoom;
    const f = Math.min(1, LENS.maxW / Cw, LENS.maxH / Ch);
    if (f < 1) {
      Cw *= f; Ch *= f;
      if (zoom * f < 1.2) warn(`${what}.box 太大，放大鏡只能放大 ${r3(zoom * f)} 倍 → 只框要看清的那一小塊（或改用 moves 推近）`);
    }
    Cw = even(Cw); Ch = even(Ch);
    const ow = Cw + 2 * (LENS.border + LENS.pad), oh = Ch + 2 * (LENS.border + LENS.pad);
    let left = Math.round(LENS.cx - ow / 2), top = Math.round(LENS.cy - oh / 2);
    top = Math.max(40, Math.min(top, 900 - oh));
    const box2 = () => [left, top, left + ow, top + oh];
    if ([la, (la + lb) / 2, lb - 0.01].some((t) => pipAt(t)) && inter(box2(), PIP_ZONE) > 0) {
      if (1320 - ow >= 40) left = 1320 - ow;
      else warn(`${what} 的鏡片會壓到子母畫面 → 這段寫 "pip": false，或 zoom 改小`);
    }
    const ocx = left + ow / 2, ocy = top + oh / 2;
    const back = { x: +(R[0] + R[2] / 2 - ocx).toFixed(2), y: +(R[1] + R[3] / 2 - ocy).toFixed(2), scaleX: +(R[2] / Cw).toFixed(5), scaleY: +(R[3] / Ch).toFixed(5) };
    // 逐幀：第 k 張＝成片 la＋k/30 那一格的錄影
    const N = Math.max(1, Math.round((lb - la) * FPS));
    const ranges = [];
    if (m.kind === 'video') {
      for (let k = 0; k < N; k++) {
        const t = la + k / FPS;
        const p = m.pieces.find((x) => t < x.e - 1e-6) || m.pieces[m.pieces.length - 1];
        if (!p) break;
        const ft = r3(p.fms + Math.max(0, t - p.s));
        const lastR = ranges[ranges.length - 1];
        if (lastR && lastR.piece === p) lastR.frames++;
        else ranges.push({ piece: p, at: ft, frames: 1 });
      }
    }
    const crop = [box[0] * m.file.sx, box[1] * m.file.sy, box[2] * m.file.sx, box[3] * m.file.sy];
    m.lenses.push({
      id: `${it.id}-l${m.lenses.length + 1}`, la, lb, N, R: R.map((v) => +v.toFixed(2)), C: [Cw, Ch], outer: [left, top, ow, oh], back,
      crop, ranges: ranges.map(({ at, frames }) => ({ at, frames })), map: null, urls: null,
    });
  });
}

// ---------- build 要準備的檔 ----------

export function mediaJobs(it) {
  const m = it.media;
  const st = fs.statSync(m.abs);
  const stem = ascii(path.basename(m.src, m.ext));
  const sig = { src: m.abs, size: st.size, mtimeMs: Math.round(st.mtimeMs) };
  const jobs = { main: null, lenses: [] };
  if (m.kind === 'video') {
    const key = { ...sig, speed: m.speed, w: m.file.w, h: m.file.h, v: 1 };
    const h = createHash('sha1').update(JSON.stringify(key)).digest('hex').slice(0, 8);
    jobs.main = { type: 'video', rel: `assets/media/${stem}-${h}.mp4`, key, speed: m.speed, keepAudio: !!m.info.hasAudio, w: m.file.w, h: m.file.h };
  } else {
    const h = createHash('sha1').update(JSON.stringify(sig)).digest('hex').slice(0, 8);
    jobs.main = { type: 'image', rel: `assets/media/${stem}-${h}${m.ext === '.jpeg' ? '.jpg' : m.ext}`, key: sig };
  }
  m.asset = jobs.main.rel;
  for (const L of m.lenses || []) {
    const key = { main: jobs.main.rel, ranges: L.ranges, crop: L.crop.map((v) => +v.toFixed(2)), size: L.C, image: m.kind === 'image', v: 1 };
    jobs.lenses.push({ lens: L, dir: `assets/media/${L.id}`, key });
  }
  return jobs;
}

// ---------- 主合成 ----------

const vol = (db) => +Math.min(3.98, Math.max(0, dB(db))).toFixed(3);

export function mediaParts(it, { off = 0, lim = Infinity, base = '', nextTrack, mediaDb = 0, edit = null, outDur = Infinity }) {
  const m = it.media, id = it.id;
  const sh = (t) => n3(t - off);
  const s = it.start, e = Math.min(it.end, lim);
  const G = m.geo;
  const tl = [];
  const html = [];
  const style = `left:${G.left}px;top:${G.top}px;width:${G.width}px;height:${G.height}px`;
  html.push(`  <div id="el-${id}" class="mlayer" style="z-index:${it.z}">`);
  html.push(`    <div id="mbg-${id}" class="clip mbg sc-surface-fs" data-start="${sh(s)}" data-duration="${n3(e - s)}" data-track-index="${nextTrack()}"></div>`);
  html.push(`    <div id="mst-${id}" class="mstage" data-layout-allow-overflow>`);
  if (m.kind === 'video') {
    const audio = m.volume != null && m.info.hasAudio;
    const enterD = it.enterFx === 'cut' ? DECLICK : ENTER[it.enterFx];
    const exitD = it.exitFx === 'cut' ? DECLICK : EXIT[it.exitFx];
    const pcs = m.pieces.filter((p) => p.s < lim - 1e-6);
    pcs.forEach((p, n) => {
      const pe = Math.min(p.e, lim);
      let attrs = audio ? ` data-has-audio="true" data-volume="${vol(m.volume + mediaDb)}"` : ' muted';
      if (audio) {
        let fi = n === 0 ? enterD : DECLICK, fo = n === pcs.length - 1 && pe >= it.end - 1e-6 ? exitD : DECLICK;
        if (edit?.fadeIn && p.s < edit.fadeIn) fi = Math.max(fi, edit.fadeIn - p.s);
        if (edit?.fadeOut && pe > outDur - edit.fadeOut) fo = Math.max(fo, pe - (outDur - edit.fadeOut));
        attrs += ` data-fade-in="${n3(Math.min(fi, pe - p.s))}" data-fade-out="${n3(Math.min(fo, pe - p.s))}"`;
      }
      html.push(`      <video id="mv-${id}${n ? `-${n + 1}` : ''}" src="${base}${m.asset}" data-start="${sh(p.s)}" data-duration="${n3(pe - p.s)}" data-media-start="${n3(p.fms)}"
             data-track-index="${nextTrack()}"${attrs} playsinline style="${style}"></video>`);
    });
  } else {
    html.push(`      <img id="mi-${id}" class="clip mimg" src="${base}${m.asset}" alt="" data-start="${sh(s)}" data-duration="${n3(e - s)}" data-track-index="${nextTrack()}" style="${style}">`);
  }
  if (m.marks.length) {
    html.push(`      <svg id="mmk-${id}" class="clip mmarks" data-start="${sh(s)}" data-duration="${n3(e - s)}" data-track-index="${nextTrack()}" viewBox="0 0 1920 1080" data-layout-allow-overlap>`);
    for (const mk of m.marks) html.push(`        <rect id="${mk.id}" class="mmark" x="${mk.rect[0]}" y="${mk.rect[1]}" width="${mk.rect[2]}" height="${mk.rect[3]}" rx="${mk.rx}" pathLength="1" style="stroke-width:${mk.sw}px"/>`);
    html.push('      </svg>');
  }
  html.push('    </div>');
  for (const L of m.lenses) {
    if (L.la >= lim - 1e-6) continue;
    const [left, top, ow, oh] = L.outer;
    const R = L.R;
    const ts = `data-start="${sh(L.la)}" data-duration="${n3(Math.min(L.lb, lim) - L.la)}"`;
    // 外層不計時（巢狀的計時 div 會被 lint 當成要拆子合成）；壓暗層、描框、鏡片各自計時
    html.push(`    <div id="mlz-${L.id}" class="mlz">`);
    html.push(`      <div id="mdim-${L.id}" class="clip mdim" ${ts} data-track-index="${nextTrack()}"></div>`);
    html.push(`      <svg id="mlg-${L.id}" class="clip mlreg" ${ts} data-track-index="${nextTrack()}" viewBox="0 0 1920 1080"><rect id="mlr-${L.id}" x="${Math.round(R[0] - 4)}" y="${Math.round(R[1] - 4)}" width="${Math.round(R[2] + 8)}" height="${Math.round(R[3] + 8)}" rx="6" pathLength="1"/></svg>`);
    // 鏡片不計時：CSS 預設 opacity 0，時間軸自己淡入淡出（計時 div 裡放 canvas 會被 lint 當成要拆子合成）
    html.push(`      <div id="mlens-${L.id}" class="mlens" data-layout-allow-overlap style="left:${left}px;top:${top}px;width:${ow}px;height:${oh}px"><canvas id="mlc-${L.id}" width="${L.C[0]}" height="${L.C[1]}"></canvas></div>`);
    html.push(`      <div id="mlsrc-${L.id}" class="mlsrc">${(L.urls || []).map((u) => `<img src="${base}${u}" alt="">`).join('')}</div>`);
    html.push('    </div>');
  }
  html.push('  </div>');

  // --- 進出場（整層＋子母畫面）---
  const pipSel = (it.pipIds || []).join(', ');
  const layer = `#el-${id}`;
  const both = pipSel ? `${layer}, ${pipSel}` : layer;
  const fullEnd = it.end <= lim + 1e-6;
  const ent = it.enterFx, ext = it.exitFx;
  if (ent === 'fade') tl.push(`tl.fromTo('${both}', { opacity: 0 }, { opacity: 1, duration: ${ENTER.fade}, ease: 'sine.out' }, ${sh(s)});`);
  else if (ent === 'slide') {
    tl.push(`tl.fromTo('${layer}', { x: 1920 }, { x: 0, duration: ${ENTER.slide}, ease }, ${sh(s)});`);
    if (pipSel) tl.push(`tl.fromTo('${pipSel}', { opacity: 0 }, { opacity: 1, duration: ${ENTER.fade}, ease: 'sine.out' }, ${sh(s)});`);
  } else if (ent === 'zoom') {
    tl.push(`tl.fromTo('${layer}', { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: ${ENTER.zoom}, ease: 'power2.out' }, ${sh(s)});`);
    if (pipSel) tl.push(`tl.fromTo('${pipSel}', { opacity: 0 }, { opacity: 1, duration: ${ENTER.fade}, ease: 'sine.out' }, ${sh(s)});`);
  }
  if (fullEnd) {
    // 出場一律 immediateRender:false（同一個屬性進場時已經補間過，見 pitfalls §22）
    const pipOut = () => { if (pipSel) tl.push(`tl.fromTo('${pipSel}', { opacity: 1 }, { opacity: 0, duration: ${EXIT.fade}, ease: 'sine.in', immediateRender: false }, ${sh(it.end - EXIT.fade)});`); };
    if (ext === 'fade') tl.push(`tl.fromTo('${both}', { opacity: 1 }, { opacity: 0, duration: ${EXIT.fade}, ease: 'sine.in', immediateRender: false }, ${sh(it.end - EXIT.fade)});`);
    else if (ext === 'slide') { tl.push(`tl.fromTo('${layer}', { x: 0 }, { x: -1920, duration: ${EXIT.slide}, ease, immediateRender: false }, ${sh(it.end - EXIT.slide)});`); pipOut(); }
    else if (ext === 'zoom') { tl.push(`tl.fromTo('${layer}', { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.96, duration: ${EXIT.zoom}, ease: 'power2.in', immediateRender: false }, ${sh(it.end - EXIT.zoom)});`); pipOut(); }
  }

  // --- 運鏡（全部掛在 paused timeline：seek 到哪裡都一樣）---
  const st = `#mst-${id}`;
  const cam = (c) => `{ x: ${c.x}, y: ${c.y}, scale: ${c.z} }`;
  if (m.kb) tl.push(`tl.fromTo('${st}', { x: 0, y: 0, scale: 1 }, { x: ${m.kbTo.x}, y: ${m.kbTo.y}, scale: ${KB}, duration: ${n3(it.end - s)}, ease: 'none', force3D: false }, ${sh(s)});`);
  m.cams.forEach((mv, n) => {
    tl.push(`tl.fromTo('${st}', ${cam(mv.from)}, { x: ${mv.to.x}, y: ${mv.to.y}, scale: ${mv.to.z}, duration: ${n3(mv.dur)}, ease: 'power2.inOut', force3D: false${n ? ', immediateRender: false' : ''} }, ${sh(mv.t0)});`);
  });

  // --- 紅框：描線 0.4s → 描完閉環（pitfalls §50）→ 退場淡出 0.3s ---
  for (const mk of m.marks) {
    tl.push(`tl.fromTo('#${mk.id}', { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: ${MARK.draw}, ease: 'power2.inOut' }, ${sh(mk.at)});`);
    tl.push(`tl.set('#${mk.id}', { strokeDasharray: 'none' }, ${sh(mk.at + MARK.draw)});`);
    tl.push(`tl.fromTo('#${mk.id}', { opacity: 1 }, { opacity: 0, duration: ${MARK.out}, ease: 'sine.in', immediateRender: false }, ${sh(mk.until - MARK.out)});`);
  }

  // --- 放大鏡（motion-recipes §7）---
  for (const L of m.lenses) {
    if (L.la >= lim - 1e-6) continue;
    const b = L.back;
    const back = `{ x: ${b.x}, y: ${b.y}, scaleX: ${b.scaleX}, scaleY: ${b.scaleY} }`;
    const home = '{ x: 0, y: 0, scaleX: 1, scaleY: 1 }';
    const p0 = L.la + LENS.delay;
    tl.push(`tl.fromTo('#mlr-${L.id}', { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: 0.4, ease: 'power2.inOut' }, ${sh(L.la)});`);
    tl.push(`tl.fromTo('#mlr-${L.id}', { opacity: 1 }, { opacity: 0, duration: 0.3, ease: 'sine.in', immediateRender: false }, ${sh(p0)});`);
    tl.push(`tl.fromTo('#mdim-${L.id}', { opacity: 0 }, { opacity: 0.5, duration: 0.3, ease: 'sine.out' }, ${sh(p0)});`);
    tl.push(`tl.fromTo('#mlens-${L.id}', { opacity: 0 }, { opacity: 1, duration: 0.05, ease: 'none' }, ${sh(p0)});`);
    tl.push(`tl.fromTo('#mlens-${L.id}', ${back}, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: ${LENS.pop}, ease: 'back.out(1.4)', force3D: false }, ${sh(p0)});`);
    tl.push(`tl.fromTo('#mlens-${L.id}', ${home}, { x: ${b.x}, y: ${b.y}, scaleX: ${b.scaleX}, scaleY: ${b.scaleY}, duration: ${LENS.back}, ease: 'power2.in', force3D: false, immediateRender: false }, ${sh(L.lb - LENS.back)});`);
    tl.push(`tl.fromTo('#mlens-${L.id}', { opacity: 1 }, { opacity: 0, duration: ${LENS.fade}, ease: 'none', immediateRender: false }, ${sh(L.lb - LENS.fade)});`);
    tl.push(`tl.fromTo('#mdim-${L.id}', { opacity: 0.5 }, { opacity: 0, duration: ${LENS.back}, ease: 'sine.in', immediateRender: false }, ${sh(L.lb - LENS.back)});`);
    tl.push(`MediaKit.lens(tl, '#mlc-${L.id}', '#mlsrc-${L.id} img', ${JSON.stringify(L.map || [0])}, ${sh(L.la)}, ${n3(L.lb - L.la)});`);
  }
  return { html: html.join('\n'), tl };
}

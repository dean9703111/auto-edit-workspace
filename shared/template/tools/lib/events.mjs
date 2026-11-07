// 螢幕錄影的畫面事件（media.mjs scan 用）：哪一秒切頁、開視窗、哪一塊變了、哪裡在等、哪裡在捲。零依賴，只用 Node 與 ffmpeg。
//
//   screenEvents(file, { duration, width, height }) → Promise<{ fps, events, waits, scrolls, ms }>
//     events：[{ id: 'e01', t, settled, kind, box, in }]   t＝開始變的秒數；settled＝變完的秒數（contact sheet 在這之後取格）；in＝建議的起播秒數（t − 0.5）
//     waits： [{ id: 'w01', from, to, kind, box, speed }]  ≥ 3 秒畫面沒有大變化；speed＝壓成 1.5 秒要幾倍
//     scrolls：[{ id: 's01', from, to, px, box }]          px＞0 往下捲
//   analyzer(meta) → { push(gray 一格), end() → 同上 }   測試直接餵畫面用
//   eventsMd({ src, info, ev, cells }) → work/media/<檔>/events.md 全文
//   waitsInMain(clips, words, eventsOf) → 邊錄邊講的主軌裡，畫面在等、又沒人講話的區間（media.mjs prep 寫進 cuts.md 的「等待」表）
//
// 為什麼不用 ffmpeg 的 scene 分數：白底介面切頁、開視窗分數都很低（實測 7 個真實變化只標到 2 個）。這裡直接比相鄰兩格哪些格子變了。
// 門檻寧可多報：表上多一列只是多看一眼，少一列就找不到那個操作。

import { spawn } from 'node:child_process';

export const EV = {
  long: 960,        // 分析尺寸（長邊）
  cell: 4,          // 分析畫面每 4 px 一格
  diff: 18,         // 灰階差超過這個才算變（壓縮雜訊約 ±10）
  gap: 2,           // 相隔 2 格以內算同一塊
  small: 0.035,     // 寬、高都小於長邊的 3.5%：游標、打字、小圖示，不算事件
  region: 0.0005,   // 一塊的面積至少占畫面 0.05% 才算
  settle: 0.4,      // 這麼久沒有新變化＝變完了
  maxEvent: 3,      // 一直在變（播影片）：3 秒切一個事件
  persist: 0.6,     // 格子長期有 60% 的時間在變（時鐘、會動的圖示）：不算事件
  persistSec: 8,
  local: 0.25,      // 同一個地方最近一直在變（轉圈、百分比、播影片）：也不算事件
  localSec: 1.2,
  page: 0.45, pageNet: 0.02, pageAll: 0.25, block: 0.02,   // 換頁：框 ≥ 45% 且變化 ≥ 2%，或變化 ≥ 25%；區塊變化：框 ≥ 2%
  scrollBox: 0.03, scrollRatio: 0.5, scrollMin: 0.015,     // 捲動：變化的框 ≥ 3%；對齊之後差異 < 一半；總位移 ≥ 高度 1.5%
  bucket: 0.5,      // 等待：每 0.5 秒算一次
  newCells: 0.0008, // 這 0.5 秒碰到、之前 2 秒沒碰過的格子 ≤ 0.08%：沒有東西在走（游標移動會一直碰到新格子，轉圈、進度條不會）
  minWait: 3, waitTo: 1.5,
  scrimRatio: 0.15, scrimShare: 0.6, scrimAll: 0.3, dialog: 0.01,   // 背景整片變暗／變亮：開關視窗，留下來的差異才是視窗本身
  leadIn: 0.5,
};

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const pad2 = (n) => String(n).padStart(2, '0');

// 長片每一格都要解碼，取樣少一點；5 分鐘內的片子每 0.1 秒看一次
export const sampleFps = (dur) => (dur <= 600 ? 10 : dur <= 1800 ? 6 : 4);

export function analysisSize(width, height) {
  const k = EV.long / Math.max(width, height);
  const even = (v) => Math.max(2, Math.round(v * k / 2) * 2);
  return { w: even(width), h: even(height) };
}

export function analyzer({ width, height, fps, w, h, ignore = [] }) {
  const K = width / w, KY = height / h;
  const cell = EV.cell, CW = Math.ceil(w / cell), CH = Math.ceil(h / cell), cells = CW * CH;
  const FULL = width * height, LONG = Math.max(width, height);
  const px = cell * cell * K * KY;
  const smallSide = LONG * EV.small, regionArea = FULL * EV.region;
  const ema = new Float32Array(cells), alpha = 1 / Math.max(1, fps * EV.persistSec);
  const near = new Float32Array(cells), beta = 1 / Math.max(1, fps * EV.localSec);
  const skip = new Uint8Array(cells);   // 不看的區域（素材像素 [x,y,w,h]）
  for (const [x, y, W, H] of ignore) for (let cy = Math.floor(y / KY / cell); cy <= Math.min(CH - 1, Math.floor((y + H) / KY / cell)); cy++) for (let cx = Math.floor(x / K / cell); cx <= Math.min(CW - 1, Math.floor((x + W) / K / cell)); cx++) skip[cy * CW + cx] = 1;
  const seen = new Uint8Array(cells);
  const stack = new Int32Array(cells);
  const events = [], waits = [], scrolls = [];
  let prev = null, frame = 0;
  let open = null, scroll = null;

  const diffCells = (a, b, th = EV.diff) => {
    const m = new Uint8Array(cells);
    let n = 0;
    for (let y = 0; y < h; y++) {
      const row = (y >> 2) * CW, o = y * w;
      for (let x = 0; x < w; x++) {
        const d = a[o + x] - b[o + x];
        if (d > th || d < -th) { const c = row + (x >> 2); if (!m[c] && !skip[c]) { m[c] = 1; n++; } }
      }
    }
    return { m, n };
  };
  const comps = (m) => {
    seen.fill(0);
    const out = [];
    for (let i = 0; i < cells; i++) {
      if (!m[i] || seen[i]) continue;
      let sp = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
      stack[sp++] = i; seen[i] = 1;
      while (sp) {
        const c = stack[--sp], cy = Math.floor(c / CW), cx = c - cy * CW;
        n++;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        for (let dy = -EV.gap; dy <= EV.gap; dy++) for (let dx = -EV.gap; dx <= EV.gap; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
          const q = ny * CW + nx;
          if (m[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
        }
      }
      out.push({ cx: x0, cy: y0, cw: x1 - x0 + 1, ch: y1 - y0 + 1, n });
    }
    return out;
  };
  const isRegion = (c) => {
    const W = c.cw * cell * K, H = c.ch * cell * KY;
    return (W > smallSide || H > smallSide) && c.n * px >= regionArea;
  };
  const boxOf = (list) => {
    const x0 = Math.min(...list.map((c) => c.cx)), y0 = Math.min(...list.map((c) => c.cy));
    const x1 = Math.max(...list.map((c) => c.cx + c.cw)), y1 = Math.max(...list.map((c) => c.cy + c.ch));
    return { cx: x0, cy: y0, cw: x1 - x0, ch: y1 - y0 };
  };
  const toSource = (b) => {
    const x = Math.max(0, Math.round(b.cx * cell * K)), y = Math.max(0, Math.round(b.cy * cell * KY));
    return [x, y, Math.min(width - x, Math.round(b.cw * cell * K)), Math.min(height - y, Math.round(b.ch * cell * KY))];
  };

  // 捲動：框裡的內容整片上下移。先縮一半再比（位移常落在半格上，縮小後文字才對得起來）
  const halfOf = (f) => {
    const W2 = w >> 1, H2 = h >> 1, o = new Int16Array(W2 * H2);
    for (let y = 0; y < H2; y++) { const a = y * 2 * w, b = a + w, c = y * W2; for (let x = 0; x < W2; x++) { const q = x * 2; o[c + x] = f[a + q] + f[a + q + 1] + f[b + q] + f[b + q + 1]; } }
    return o;
  };
  // a、b 在框裡最對得起來的上下位移（半尺寸的 px，＞0＝內容往上跑）；對不起來回 null
  const bestShift = (a, b, box, maxShare) => {
    const W2 = w >> 1, H2 = h >> 1;
    const x0 = Math.floor(box.cx * cell / 2), y0 = Math.floor(box.cy * cell / 2), W = Math.min(Math.floor(box.cw * cell / 2), W2 - x0), H = Math.min(Math.floor(box.ch * cell / 2), H2 - y0);
    if (H < 20 || W < 30) return null;
    const A = halfOf(a), B = halfOf(b);
    const sad = (d, cap = Infinity) => {
      let s = 0, n = 0;
      const y1 = Math.min(H, H - d);
      for (let y = Math.max(0, -d); y < y1; y += 2) {
        const oa = (y0 + y + d) * W2 + x0, ob = (y0 + y) * W2 + x0;
        for (let x = 0; x < W; x += 3) { const e = A[oa + x] - B[ob + x]; s += e < 0 ? -e : e; n++; }
        if (n > 400 && s / n > cap) return Infinity;
      }
      return n ? s / n : Infinity;
    };
    const s0 = sad(0);
    if (s0 < 1) return null;
    const maxD = Math.floor(H * maxShare);
    let best = 0, low = s0 * EV.scrollRatio;
    for (let d = -maxD; d <= maxD; d++) { if (!d) continue; const v = sad(d, low); if (v < low) { low = v; best = d; } }
    return best || null;
  };

  // 背景整片變暗或變亮（新 ≈ 舊 × r）：開、關視窗。沒辦法用 r 解釋的地方才是視窗本身
  const scrimOf = (a, b, netFrac) => {
    if (netFrac < EV.scrimAll) return null;
    const ratios = [];
    for (let y = 0; y < h; y += 2) { const o = y * w; for (let x = 0; x < w; x += 2) { const u = a[o + x], v = b[o + x], e = u - v; if ((e > EV.diff || e < -EV.diff) && u > 40 && v > 40) ratios.push(v / u); } }
    if (ratios.length < 100) return null;
    ratios.sort((p, q) => p - q);
    const r = ratios[ratios.length >> 1];
    if (Math.abs(r - 1) < EV.scrimRatio) return null;
    const share = ratios.filter((v) => Math.abs(v / r - 1) < 0.15).length / ratios.length;
    if (share < EV.scrimShare) return null;
    const m = new Uint8Array(cells);
    for (let y = 0; y < h; y++) { const o = y * w, row = (y >> 2) * CW; for (let x = 0; x < w; x++) { const e = a[o + x] * r - b[o + x]; if (e > 24 || e < -24) m[row + (x >> 2)] = 1; } }
    const big = comps(m).filter((c) => c.n * px >= FULL * EV.dialog);
    return { r, box: big.length ? toSource(boxOf([big.sort((p, q) => q.n - p.n)[0]])) : null };
  };

  const closeEvent = (cur, t) => {
    const e = open; open = null;
    const { m, n } = diffCells(e.before, cur);
    const list = comps(m).filter(isRegion);
    if (!list.length) return;   // 變了又變回去（滑過去的反白）
    const box = boxOf(list), src = toSource(box);
    const netFrac = n / cells, boxFrac = (src[2] * src[3]) / FULL;
    const scrim = scrimOf(e.before, cur, netFrac);
    let kind, out = src;
    if (scrim) { kind = scrim.r < 1 ? '開視窗' : '關視窗'; if (scrim.box) out = scrim.box; }
    else if (netFrac >= EV.pageAll || (boxFrac >= EV.page && netFrac >= EV.pageNet)) kind = '換頁';
    else if (boxFrac >= EV.block) kind = '區塊變化';
    else kind = '小變化';
    events.push({ t: r2(e.t0), settled: r2(t), kind, box: out, in: r1(Math.max(0, e.t0 - EV.leadIn)) });
  };
  // 總位移：捲完的畫面和捲之前的畫面直接比（一格一格加會被長得很像的表格列騙）；捲太遠、沒有重疊才用加總
  const closeScroll = (cur) => {
    const s = scroll; scroll = null;
    if (!s) return;
    const net = cur ? bestShift(s.before, cur, s.box, 0.85) : null;
    const total = net ? net * 2 * KY : s.sum;
    if (Math.abs(total) < height * EV.scrollMin) return;
    scrolls.push({ from: r2(s.from), to: r2(s.to), px: Math.round(total), box: toSource(s.box) });
  };

  // 等待：每 0.5 秒看一次「有沒有大變化」「有沒有新碰到的格子」（游標在走就會有）
  const perBucket = Math.max(1, Math.round(EV.bucket * fps));
  let bu = { frames: 0, active: 0, busy: false, cellsSet: new Uint8Array(cells) };
  const touched = new Float32Array(cells).fill(-1e6);   // 每一格最後一次變的秒數
  let run = null, bucketStart = 0;
  const flushRun = (end) => {
    const r = run; run = null;
    if (!r || end - r.from < EV.minWait) return;
    const list = comps(r.touched);
    const share = r.active / Math.max(1, r.frames);
    waits.push({ from: r1(r.from), to: r1(end), kind: share >= 0.6 ? '畫面在轉' : share <= 0.1 ? '靜止' : '小動作', box: list.length ? toSource(boxOf(list)) : null, speed: r1((end - r.from) / EV.waitTo) });
  };
  const endBucket = (t) => {
    let fresh = 0;
    const now = bu.cellsSet;
    for (let i = 0; i < cells; i++) if (now[i]) { if (t - touched[i] > 2 + EV.bucket) fresh++; touched[i] = t; }
    const calm = !bu.busy && fresh <= cells * EV.newCells;
    if (calm) {
      if (!run) run = { from: bucketStart, frames: 0, active: 0, touched: new Uint8Array(cells), miss: 0, end: bucketStart };
      run.frames += bu.frames; run.active += bu.active; run.miss = 0; run.end = t;
      for (let i = 0; i < cells; i++) if (now[i] && ema[i] < EV.persist) run.touched[i] = 1;
    } else if (run && !bu.busy && run.miss < 1) run.miss++;   // 只有一下下（游標動一下）：還算同一段等待
    else flushRun(run ? run.end : bucketStart);
    bu = { frames: 0, active: 0, busy: false, cellsSet: new Uint8Array(cells) };
    bucketStart = t;
  };

  const push = (cur) => {
    if (prev) {
      const t = frame / fps;
      const { m, n } = diffCells(prev, cur);
      // 一直在變的格子（時鐘、轉圈、百分比、播影片）：不算事件。捲動不濾：捲的時候每一格都在變
      const f = new Uint8Array(cells), g = new Uint8Array(cells);
      let nf = 0, ng = 0;
      for (let i = 0; i < cells; i++) {
        const on = m[i] ? 1 : 0;
        if (on) {
          bu.cellsSet[i] = 1;
          if (ema[i] < EV.persist) { g[i] = 1; ng++; if (near[i] < EV.local) { f[i] = 1; nf++; } }
        }
        ema[i] += alpha * (on - ema[i]);
        near[i] += beta * (on - near[i]);
      }
      bu.frames++;
      if (ng) bu.active++;   // 時鐘那種一直在變的不算「畫面在動」
      const regions = nf ? comps(f).filter(isRegion) : [];
      let isScroll = false;
      const wide = ng ? comps(g).filter(isRegion) : [];
      if (wide.length) {
        const box = boxOf(wide);
        if (box.cw * box.ch * px >= FULL * EV.scrollBox) {
          const d = bestShift(prev, cur, box, 0.4);
          if (d) {
            isScroll = true;
            if (open) closeEvent(prev, t - 1 / fps);
            if (!scroll) scroll = { from: t - 1 / fps, to: t, sum: 0, box, before: Uint8Array.from(prev) };
            scroll.sum += d * 2 * KY; scroll.to = t;
            scroll.box = boxOf([scroll.box, box]);
          }
        }
      }
      if (regions.length || isScroll) bu.busy = true;
      if (scroll && !isScroll && t - scroll.to > 0.35) closeScroll(cur);
      if (!isScroll) {
        if (regions.length) {
          if (!open) open = { t0: t, last: t, before: Uint8Array.from(prev) };
          open.last = t;
          if (t - open.t0 >= EV.maxEvent) { closeEvent(cur, t); open = { t0: t, last: t, before: Uint8Array.from(cur) }; }
        } else if (open && t - open.last >= EV.settle - 1e-6) closeEvent(cur, t);
      }
      if (open) bu.busy = true;
      if (frame % perBucket === 0) endBucket(t);
      prev.set(cur);
    } else prev = Uint8Array.from(cur);
    frame++;
  };
  const end = () => {
    const t = Math.max(0, frame - 1) / fps;
    if (open && prev) closeEvent(prev, t);
    closeScroll(prev);
    if (bu.frames) endBucket(t);
    flushRun(run ? run.end : t);
    events.sort((a, b) => a.t - b.t);
    events.forEach((e, i) => { e.id = `e${pad2(i + 1)}`; });
    waits.forEach((e, i) => { e.id = `w${pad2(i + 1)}`; });
    scrolls.forEach((e, i) => { e.id = `s${pad2(i + 1)}`; });
    return { fps, events, waits, scrolls };
  };
  return { push, end };
}

export function screenEvents(file, { duration, width, height, ignore = [] }) {
  const fps = sampleFps(duration ?? 0);
  const { w, h } = analysisSize(width, height);
  const A = analyzer({ width, height, fps, w, h, ignore });
  const size = w * h;
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const cp = spawn('ffmpeg', ['-hide_banner', '-nostats', '-v', 'error', '-i', file, '-an', '-sn', '-vf', `fps=${fps},scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let buf = Buffer.alloc(0), err = '';
    cp.stdout.on('data', (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      let o = 0;
      while (buf.length - o >= size) { A.push(buf.subarray(o, o + size)); o += size; }
      buf = o ? buf.subarray(o) : buf;
    });
    cp.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-2000); });
    cp.on('error', reject);
    cp.on('close', (code) => {
      if (code !== 0) { reject(new Error(`ffmpeg 分析畫面失敗：${err.trim().slice(-200)}`)); return; }
      resolve({ ...A.end(), ms: Date.now() - t0 });
    });
  });
}

const retimeHint = (w) => `{"at":"#N","src":${w.from}},{"at":"#N+${EV.waitTo}","src":${w.to}}`;
const scrollText = (s) => `${s.px > 0 ? '往下' : '往上'} ${Math.abs(s.px)} px`;
const KIND_NOTE = { 畫面在轉: '轉圈、進度條', 靜止: '畫面沒動', 小動作: '小動作（可能在打字，確定只是在等才快轉）' };
// 長片的表不要太長：事件先拿掉小變化，等待留最長的（完整的在 events.json）
const EV_ROWS = { events: 250, waits: 100, scrolls: 60 };
function limited(list, max, keep) {
  if (list.length <= max) return { rows: list, cut: 0 };
  const rows = [...list].sort(keep).slice(0, max).sort((a, b) => (a.t ?? a.from) - (b.t ?? b.from));
  return { rows, cut: list.length - rows.length };
}
const EV_RANK = { 換頁: 0, 開視窗: 0, 關視窗: 1, 區塊變化: 2, 小變化: 3 };

export function eventsMd({ src, info, ev, cells = [] }) {
  const L = [`# ${src} 的畫面事件（media.mjs scan 產生，不要手改）`, ''];
  L.push(`${info.width}×${info.height}、${r1(info.duration ?? 0)} 秒。框是素材原尺寸的像素，直接抄進 \`moves\`、\`marks\`、\`lens\`；準不準用 \`media.mjs frame --at <秒> --box "x,y,w,h"\` 看一張圖確認。`, '');
  if (ev) {
    L.push('## 事件', '', '`建議 in`＝media 段的 `in`、`retime` 第一點的 `src`（事件前 0.5 秒，先看到操作前的畫面）。', '');
    if (ev.events.length) {
      const e = limited(ev.events, EV_ROWS.events, (a, b) => (EV_RANK[a.kind] ?? 9) - (EV_RANK[b.kind] ?? 9) || a.t - b.t);
      L.push('| id | 秒 | 種類 | 框 [x,y,w,h] | 建議 in |', '|---|---|---|---|---|');
      for (const x of e.rows) L.push(`| ${x.id} | ${x.t} | ${x.kind} | [${x.box.join(',')}] | ${x.in} |`);
      if (e.cut) L.push('', `（還有 ${e.cut} 個比較小的變化沒列，完整的在 events.json）`);
    } else L.push('（這支錄影沒有大變化）');
    L.push('', '## 等待（可以快轉或剪掉）', '');
    if (ev.waits.length) {
      const w = limited(ev.waits, EV_ROWS.waits, (a, b) => (b.to - b.from) - (a.to - a.from));
      L.push(`\`retime\` 這樣寫，例 ${ev.waits[0].id}：\`${retimeHint(ev.waits[0])}\`（講到 #N 時從等待開始，${EV.waitTo} 秒後到等待結束；× 欄是壓成 ${EV.waitTo} 秒的倍數）。`, '');
      L.push('| id | 秒 | 長度 | 畫面 | 在動的地方 | 倍數 |', '|---|---|---|---|---|---|');
      for (const x of w.rows) L.push(`| ${x.id} | ${x.from}–${x.to} | ${r1(x.to - x.from)}s | ${KIND_NOTE[x.kind] || x.kind} | ${x.box ? `[${x.box.join(',')}]` : '—'} | ×${x.speed} |`);
      if (w.cut) L.push('', `（還有 ${w.cut} 段比較短的等待沒列，完整的在 events.json）`);
    } else L.push('（沒有 3 秒以上的等待）');
    L.push('', '## 捲動', '');
    if (ev.scrolls.length) {
      const c = limited(ev.scrolls, EV_ROWS.scrolls, (a, b) => Math.abs(b.px) - Math.abs(a.px));
      L.push('| id | 秒 | 位移 | 框 [x,y,w,h] |', '|---|---|---|---|');
      for (const x of c.rows) L.push(`| ${x.id} | ${x.from}–${x.to} | ${scrollText(x)} | [${x.box.join(',')}] |`);
      if (c.cut) L.push('', `（還有 ${c.cut} 次比較短的捲動沒列，完整的在 events.json）`);
    } else L.push('（沒有捲動）');
    L.push('');
  } else L.push('（畫面分析失敗，只有固定間隔的格子；重跑 media.mjs scan）', '');
  if (cells.length) {
    L.push('## Contact sheet 每一格的秒數', '', '每格左上角是「#格號 分:秒」；右上角有黃色小方塊＝事件剛發生完。', '', '| sheet | 格 | 素材秒數 | 怎麼選的 |', '|---|---|---|---|');
    for (const c of cells) L.push(`| ${c.sheet} | #${c.n} | ${c.t} | ${c.why || '固定間隔'} |`);
    L.push('');
  }
  return L.join('\n');
}

// 邊錄邊講：main.mp4 的時間裡，畫面在等（events.json 的 waits）又沒人講話的區間。
// clips：main.json 的 clips；words：[{ start, end }]（main.mp4 的秒數）；eventsOf(file) → { waits } 或 null
export const WAIT_TALK = { minGap: 3, pad: 0.3 };
export function waitsInMain(clips, words, eventsOf) {
  const out = [];
  const spoken = (words || []).filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end)).map((w) => [w.start - WAIT_TALK.pad, w.end + WAIT_TALK.pad]).sort((a, b) => a[0] - b[0]);
  for (const c of clips || []) {
    if (c.kind !== 'screen') continue;
    const ev = eventsOf(c.file);
    if (!ev?.waits?.length) continue;
    const off = c.start - (c.src ? c.src[0] : 0);
    for (const w of ev.waits) {
      // 素材秒數 → main.mp4 的秒數；有 @起-迄 時只算取到的那段
      const a = Math.max(c.start, w.from + off), b = Math.min(c.end, w.to + off);
      if (b - a < WAIT_TALK.minGap) continue;
      let at = a;
      for (const [s, e] of spoken) {
        if (e <= at) continue;
        if (s >= b) break;
        if (s - at >= WAIT_TALK.minGap) out.push({ start: r2(at), end: r2(s), file: c.file, kind: w.kind, id: w.id });
        at = Math.max(at, e);
      }
      if (b - at >= WAIT_TALK.minGap) out.push({ start: r2(at), end: r2(b), file: c.file, kind: w.kind, id: w.id });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

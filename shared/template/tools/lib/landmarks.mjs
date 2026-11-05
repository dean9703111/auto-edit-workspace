// 臉部 landmark 偵測：HyperFrames 的 chrome-headless-shell ＋ MediaPipe Tasks Vision（CPU），Node 只用內建 http＋WebSocket（CDP）
// 契約：specs/contracts/look.md §5.1、§6.1、§6.2
//
//   openDetector({ vendorDir, chrome })            → { locate(frames), detect(...), close() }（同一個 Chrome 先找臉再逐格偵測）
//   detectLandmarks({ video, every, detector, onProgress }) → { frames, black, msPerFrame, … }（座標換回來源像素）
//   locateFaces({ video, times, detector })         → [{ t, fw, center, n } | null]
//   PAGE_HTML                                        頁面原始碼（測試可以讀）

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { findChrome } from './audit-browser.mjs';
import { POINTS, DETECT_W, ROI_SCALE, ROI_SIZE, SEARCH_GAP, DETECT_CFG, probeVideo } from './look.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (n) => Math.round(n * 10) / 10;

// ---------- 頁面（在 Chrome 裡跑；沒有任何 ${} 插值，設定由 __lmStart(cfg) 傳進來） ----------

export const PAGE_HTML = `<!doctype html><meta charset="utf-8"><body><script type="module">
import { FilesetResolver, FaceLandmarker } from '/tv/vision_bundle.mjs';
const report = (u, body) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
let lm;
try {
  const files = await FilesetResolver.forVisionTasks('/tv/wasm');
  const cfg0 = await (await fetch('/config')).json();
  lm = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/model.task', delegate: 'CPU' }, runningMode: 'IMAGE',
    numFaces: cfg0.numFaces, minFaceDetectionConfidence: cfg0.minFaceDetectionConfidence, minFacePresenceConfidence: cfg0.minFacePresenceConfidence });
} catch (e) { window.__lmError = String(e && e.message || e); }
let ms = 0, calls = 0;
const fwOf = (L) => Math.hypot(L[234][0] - L[454][0], L[234][1] - L[454][1]);
const centerOf = (L) => [(L[1][0] + L[168][0]) / 2, (L[1][1] + L[168][1]) / 2];
async function detectRect(img, sx, sy, side, roiSize) {
  sx = Math.round(sx); sy = Math.round(sy); side = Math.max(16, Math.round(side));
  const bmp = await createImageBitmap(img, sx, sy, side, side, { resizeWidth: roiSize, resizeHeight: roiSize, resizeQuality: 'high' });
  const t = performance.now(); const r = lm.detect(bmp); ms += performance.now() - t; calls++;
  bmp.close();
  return r.faceLandmarks.map((L) => L.map((p) => [sx + p.x * side, sy + p.y * side]));
}
const largest = (faces) => faces.reduce((a, b) => (!a || fwOf(b) > fwOf(a) ? b : a), null);
async function search(img, w, h, roiSize) {
  const all = []; let n = 0;
  for (const f of [0.4, 0.8]) {
    const side = Math.round(f * h), st = Math.max(1, Math.round(side / 2));
    const xs = [], ys = [];
    for (let x = 0; x + side <= w; x += st) xs.push(x); if (!xs.length || xs[xs.length - 1] + side < w) xs.push(Math.max(0, w - side));
    for (let y = 0; y + side <= h; y += st) ys.push(y); if (!ys.length || ys[ys.length - 1] + side < h) ys.push(Math.max(0, h - side));
    for (const y of ys) for (const x of xs) { const fs = await detectRect(img, x, y, side, roiSize); n = Math.max(n, fs.length); all.push(...fs); }
  }
  const side = Math.max(w, h), fs = await detectRect(img, (w - side) / 2, (h - side) / 2, side, roiSize);
  n = Math.max(n, fs.length); all.push(...fs);
  return { face: largest(all), n };
}
function pack(L, n, pts) {
  const p = []; for (const i of pts) p.push(L[i][0], L[i][1]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of L) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  return { p, b: [x0, y0, x1, y1], n };
}
async function frameImage(url) {
  const r = await fetch(url);
  if (r.status === 204) return null;
  if (r.headers.get('x-black') === '1') return 0;
  const w = +r.headers.get('x-w'), h = +r.headers.get('x-h');
  return new ImageData(new Uint8ClampedArray(await r.arrayBuffer()), w, h);
}
window.__lmLocate = async (count, cfg) => {
  const out = [];
  for (let k = 0; k < count; k++) {
    const img = await frameImage('/locate?k=' + k);
    if (!img) { out.push(img); continue; }
    const s = await search(img, img.width, img.height, cfg.roiSize);
    out.push(s.face ? { fw: fwOf(s.face), c: centerOf(s.face), n: s.n } : null);
  }
  return out;
};
window.__lmStart = (cfg) => { (async () => {
  try {
    let prev = null, nextSearch = 0, batch = [];
    for (let i = 0; ; i += cfg.every) {
      const img = await frameImage('/frame?i=' + i);
      if (img === null) break;
      let res = null;
      if (img === 0) res = 0;
      else {
        const w = img.width, h = img.height;
        let face = null, n = 0;
        if (prev) {
          let side = Math.min(cfg.roiScale * prev.fw, w, h);
          const sx = Math.min(Math.max(0, prev.c[0] - side / 2), w - side), sy = Math.min(Math.max(0, prev.c[1] - side / 2), h - side);
          const fs = await detectRect(img, sx, sy, side, cfg.roiSize);
          face = largest(fs); n = fs.length;
        }
        if (!face && i >= nextSearch) { const s = await search(img, w, h, cfg.roiSize); face = s.face; n = s.n; if (!face) nextSearch = i + cfg.searchGap; }
        if (face) { prev = { fw: fwOf(face), c: centerOf(face) }; res = pack(face, n, cfg.points); } else prev = null;
      }
      batch.push([i, res]);
      if (batch.length >= 30) { await report('/result', batch); batch = []; }
    }
    if (batch.length) await report('/result', batch);
    await report('/done', { msPerCall: calls ? ms / calls : 0, calls });
  } catch (e) { await report('/error', { message: String(e && e.stack || e) }); }
})(); return true; };
window.__lmReady = true;
</script>`;

// ---------- Chrome 與 CDP（最小版，同 lib/audit-browser.mjs 的 launchChrome／cdpClient；003 匯出後可以換成 import） ----------

function launchChrome(chrome, userDir) {
  const args = ['--headless', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
    '--mute-audio', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'];
  const cp = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => { cp.kill(); reject(new Error(`Chrome 15 秒內沒有啟動（${chrome}）：${buf.trim().slice(-300)}`)); }, 15000);
    cp.once('error', (e) => { clearTimeout(timer); reject(new Error(`開不了 Chrome（${chrome}）：${e.message} → npx hyperframes browser ensure`)); });
    cp.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome 啟動就結束了（exit ${code}）：${buf.trim().slice(-300)}`)); });
    cp.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); cp.removeAllListeners('exit'); resolve({ cp, ws: m[1] }); }
    });
  });
}

function cdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map(), listeners = [];
    ws.addEventListener('open', () => resolve({
      send(method, params = {}, sessionId, timeout = 30000) {
        return new Promise((res, rej) => {
          const i = ++id;
          const timer = setTimeout(() => { pending.delete(i); rej(new Error(`Chrome 沒有回應（${method} 超過 ${timeout / 1000}s）`)); }, timeout);
          pending.set(i, { res, rej, timer });
          ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
      },
      on(fn) { listeners.push(fn); },
      close() { try { ws.close(); } catch { /* 已經關了 */ } },
    }));
    ws.addEventListener('error', () => reject(new Error(`連不上 Chrome 的 DevTools（${wsUrl}）`)));
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString());
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer);
        if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
      } else for (const fn of listeners) fn(m);
    });
  });
}

// ---------- 全黑判斷（每 8×8 取一點，contracts/look.md §6.2-4） ----------

export function isBlackRgba(buf, w, h) {
  let dark = 0, total = 0;
  for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) {
    const o = (y * w + x) * 4;
    if (((54 * buf[o] + 183 * buf[o + 1] + 19 * buf[o + 2]) >> 8) <= 5) dark++;
    total++;
  }
  return total > 0 && dark / total >= 0.998;
}

// ---------- 偵測器 ----------

const MIME = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.task': 'application/octet-stream' };

// 處理程序被砍（逾時、Ctrl+C）時 close() 沒機會刪暫存 profile：開新的之前，清掉超過 1 天的舊 look-lm-*（只動自己的前綴；審查 C-13）
export function sweepStaleProfiles(dir = os.tmpdir(), maxAgeMs = 24 * 3600 * 1000, now = Date.now()) {
  let n = 0;
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return 0; }
  for (const name of names) {
    if (!name.startsWith('look-lm-')) continue;
    const p = path.join(dir, name);
    try { if (fs.statSync(p).isDirectory() && now - fs.statSync(p).mtimeMs > maxAgeMs) { fs.rmSync(p, { recursive: true, force: true }); n++; } } catch { /* 別的處理程序正在用或已經刪了 */ }
  }
  return n;
}

export async function openDetector({ vendorDir, chrome, log = () => {} } = {}) {
  const exe = findChrome({ chrome });
  sweepStaleProfiles();
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-lm-'));
  const H = { frame: null, locate: null, result: null, done: null, error: null, touch: () => {} };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    H.touch();
    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* */ }
        res.writeHead(204); res.end();
        const fn = { '/result': H.result, '/done': H.done, '/error': H.error }[u.pathname];
        if (fn) fn(body);
      });
      return;
    }
    if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(PAGE_HTML); }
    if (u.pathname === '/config') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(DETECT_CFG)); }
    if (u.pathname === '/frame' && H.frame) return H.frame(Number(u.searchParams.get('i')), res);
    if (u.pathname === '/locate' && H.locate) return H.locate(Number(u.searchParams.get('k')), res);
    let f = null;
    if (u.pathname === '/model.task') f = path.join(vendorDir, 'face_landmarker.task');
    else if (u.pathname === '/tv/vision_bundle.mjs') f = path.join(vendorDir, 'vision_bundle.mjs');
    else if (/^\/tv\/wasm\/vision_wasm_internal\.(js|wasm)$/.test(u.pathname)) f = path.join(vendorDir, 'wasm', path.basename(u.pathname));
    if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', r); });
  const base = `http://127.0.0.1:${server.address().port}/`;
  let proc = null, cdp = null, sessionId = null;
  const pageErrors = [];
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try { cdp?.close(); } catch { /* */ }
    if (proc && proc.exitCode == null) { proc.kill(); await Promise.race([new Promise((r) => proc.once('exit', r)), sleep(3000)]); }
    server.close();
    for (let k = 0; k < 5; k++) { try { fs.rmSync(userDir, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  };
  try {
    const l = await launchChrome(exe, userDir);
    proc = l.cp;
    cdp = await cdpClient(l.ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
    cdp.on((m) => {
      if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '頁面錯誤');
    });
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: base }, sessionId);
    const evalJs = async (expr, timeout = 30000) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId, timeout);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || '頁面錯誤');
      return r.result?.value;
    };
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs('window.__lmError ? "ERR:" + window.__lmError : !!window.__lmReady');
      if (typeof v === 'string' && v.startsWith('ERR:')) throw new Error(`Chrome 載不了 MediaPipe（${v.slice(4).split('\n')[0]}）`);
      if (v === true) break;
      if (pageErrors.length) throw new Error(`Chrome 載不了 MediaPipe（${String(pageErrors[0]).split('\n')[0]}）`);
      if (Date.now() - t0 > 60000) throw new Error('Chrome 載不了 MediaPipe（60 秒內沒有載入完成）');
      await sleep(200);
    }
    log(`  Chrome 載入 MediaPipe：${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
    return { exe, H, evalJs, pageErrors, close };
  } catch (e) { await close(); throw e; }
}

// ffmpeg 解碼成 RGBA（detectW 寬），一格一格交給 onFrame(i, buf)；回傳 { stop, done }
function decodeRgba(video, { fps, w, h, scale }, onFrame) {
  const vf = [`fps=${fps}`, ...(scale ? [`scale=${w}:${h}:flags=area`] : []), 'format=rgba'].join(',');
  const dec = spawn('ffmpeg', ['-v', 'error', '-i', video, '-an', '-sn', '-dn', '-vf', vf, '-f', 'rawvideo', 'pipe:1'], { windowsHide: true });
  const FS = w * h * 4;
  let cur = Buffer.allocUnsafe(FS), off = 0, n = 0, err = '';
  dec.stderr.on('data', (d) => { err += d; });
  dec.stdout.on('data', (chunk) => {
    let p = 0;
    while (p < chunk.length) {
      const k = Math.min(FS - off, chunk.length - p); chunk.copy(cur, off, p, p + k); off += k; p += k;
      if (off < FS) break;
      onFrame(n++, cur); cur = Buffer.allocUnsafe(FS); off = 0;
    }
  });
  const done = new Promise((resolve) => dec.on('close', (code) => resolve({ code, err: err.trim().slice(-300), frames: n })));
  return { proc: dec, done, pause: () => dec.stdout.pause(), resume: () => dec.stdout.resume() };
}

const detectSize = (W, H) => {
  const dw = Math.min(W, DETECT_W);
  return { w: dw, h: dw === W ? H : Math.max(2, Math.round((H * dw) / W / 2) * 2), scale: dw !== W };
};

// 找臉：在 times（秒）各抽一格，多尺度格子找最大的臉；座標換回來源像素
export async function locateFaces({ video, times, detector }) {
  const V = probeVideo(video), D = detectSize(V.width, V.height), k = V.width / D.w;
  const frames = times.map((t) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', `scale=${D.w}:${D.h}:flags=area,format=rgba`, '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 1 << 28 });
    return r.status === 0 && r.stdout.length === D.w * D.h * 4 ? r.stdout : null;
  });
  detector.H.locate = (i, res) => {
    const b = frames[i];
    if (!b) { res.writeHead(204); return res.end(); }
    if (isBlackRgba(b, D.w, D.h)) { res.writeHead(200, { 'x-black': '1' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'x-w': String(D.w), 'x-h': String(D.h) }); res.end(b);
  };
  const out = await detector.evalJs(`window.__lmLocate(${times.length}, ${JSON.stringify({ roiSize: ROI_SIZE })})`, 300000);
  return out.map((o, i) => (o ? { t: times[i], fw: o.fw * k, center: [o.c[0] * k, o.c[1] * k], n: o.n } : o === 0 ? 0 : null));
}

// 逐格偵測：回傳 frames（null／0／{ p, b, n }，來源像素、一位小數；--every 2 的奇數格先不填，由呼叫端內插）
export async function detectLandmarks({ video, every = 1, detector, onProgress = () => {} }) {
  const V = probeVideo(video), D = detectSize(V.width, V.height), k = V.width / D.w;
  const total = V.frames;
  const frames = [], black = [];
  const queue = [];        // [i, buf]
  let ended = false, waiting = null, lastTouch = Date.now(), done = null, failed = null, received = 0;
  const t0 = Date.now();
  const dec = decodeRgba(video, { fps: V.fps, w: D.w, h: D.h, scale: D.scale }, (i, buf) => {
    black[i] = isBlackRgba(buf, D.w, D.h);
    queue.push([i, buf]);
    if (queue.length > 8) dec.pause();
    if (waiting) { const w = waiting; waiting = null; w(); }
  });
  dec.done.then((r) => { ended = true; if (r.code !== 0 && !failed) failed = `ffmpeg 解碼失敗：${r.err}`; if (waiting) { const w = waiting; waiting = null; w(); } });
  detector.H.touch = () => { lastTouch = Date.now(); };
  detector.H.frame = async (i, res) => {
    for (;;) {
      while (queue.length && queue[0][0] < i) queue.shift();
      if (queue.length <= 8) dec.resume();
      if (queue.length && queue[0][0] === i) break;
      if (ended) { res.writeHead(204); return res.end(); }
      await new Promise((r) => { waiting = r; });
    }
    const [, buf] = queue.shift();
    if (queue.length <= 8) dec.resume();
    if (black[i]) { res.writeHead(200, { 'x-black': '1' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'x-w': String(D.w), 'x-h': String(D.h) }); res.end(buf);
  };
  detector.H.result = (batch) => {
    for (const [i, r] of batch || []) {
      frames[i] = r && typeof r === 'object' ? { p: r.p.map((v) => r1(v * k)), b: r.b.map((v) => r1(v * k)), n: r.n } : r;
      received = Math.max(received, i + 1);
    }
    onProgress({ done: Math.min(received, total), total, elapsed: (Date.now() - t0) / 1000 });
  };
  const finished = new Promise((resolve) => {
    detector.H.done = (b) => { done = b || {}; resolve(); };
    detector.H.error = (b) => { failed = `Chrome 載不了 MediaPipe（${String(b?.message || '頁面錯誤').split('\n')[0]}）`; resolve(); };
  });
  await detector.evalJs(`window.__lmStart(${JSON.stringify({ every, roiScale: ROI_SCALE, roiSize: ROI_SIZE, searchGap: SEARCH_GAP, points: POINTS })})`);
  const watchdog = new Promise((resolve) => {
    const iv = setInterval(() => {
      if (done || failed) { clearInterval(iv); return resolve(); }
      if (detector.pageErrors.length) { failed = `Chrome 載不了 MediaPipe（${String(detector.pageErrors[0]).split('\n')[0]}）`; clearInterval(iv); return resolve(); }
      if (Date.now() - lastTouch > 30000) { failed = `Chrome 30 秒沒有回應（偵測停在第 ${received} 格）→ 重跑一次；第二次失敗就停下來回報（附 work/.look/run.log）`; clearInterval(iv); return resolve(); }
    }, 500);
  });
  await Promise.race([finished, watchdog]);
  if (failed) { try { dec.proc.kill(); } catch { /* */ } throw new Error(failed); }
  const d = await dec.done;
  const n = Math.max(d.frames, frames.length);
  for (let i = 0; i < n; i++) {
    if (black[i]) frames[i] = 0;
    else if (frames[i] === undefined) frames[i] = null;
  }
  frames.length = n;
  return { frames, black, msPerFrame: done.msPerCall || 0, calls: done.calls || 0, elapsedSec: (Date.now() - t0) / 1000, detectWidth: D.w, video: V };
}

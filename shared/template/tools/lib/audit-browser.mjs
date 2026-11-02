// audit.mjs 的瀏覽器端（零依賴：Node 22 內建 http、child_process、WebSocket）
//
//   findChrome({ chrome })        → HyperFrames 自己下載的 chrome-headless-shell 路徑
//                                   找法：--chrome → ~/.cache/hyperframes/chrome（Mac／Windows 同一處）→ npx hyperframes browser path
//   findRuntime({ runtime })      → HyperFrames 的 hyperframe.runtime.iife.js（工作區 node_modules 那一份＝package.json 釘的版本，和 render 同一版）
//   openSession({ dir, chrome, runtime }) → { seek(t), measure(opts), motion({ hostId, compId }), cueErrors(), errors, close() }
//     起一個只給這次用的 http server 送 work/hyperframes/（index.html 回傳時注入 runtime，檔案本身不改），
//     開 headless Chrome（--remote-debugging-port），用 CDP 載頁、等 __playerReady，之後用 __player.renderSeek 跳時間。
//     這和 npx hyperframes snapshot／check 用的是同一個 runtime 與同一個 seek，子合成的載入、顯示時間、巢狀時間軸都照 HyperFrames 的做法。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { pageSeekSource, pageMeasureSource, pageMotionSource } from './audit-page.mjs';
import { hfLocal, HF_MISSING } from './hf.mjs';

const WIN = process.platform === 'win32';
const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const dirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(p, d.name)); } catch { return []; } };
// 版號比較：152.0.7977.30 這種多段數字
export const cmpVer = (a, b) => {
  const pa = String(a).match(/\d+/g)?.map(Number) || [], pb = String(b).match(/\d+/g)?.map(Number) || [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? -1) - (pb[i] ?? -1); if (d) return d; }
  return 0;
};
// npx 在 Windows 是 npx.cmd，Node 22 起要 shell 才能跑 .cmd
const npx = (args, timeout = 60000) => spawnSync('npx', args, { encoding: 'utf8', shell: WIN, timeout });

// ---------- Chrome ----------

export function chromeCandidates(home = os.homedir(), env = process.env) {
  const roots = [path.join(home, '.cache', 'hyperframes', 'chrome', 'chrome-headless-shell')];
  if (env.LOCALAPPDATA) roots.push(path.join(env.LOCALAPPDATA, 'hyperframes', 'chrome', 'chrome-headless-shell'));
  const exe = WIN ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  const out = [];
  for (const r of roots) {
    for (const v of dirs(r).sort((a, b) => cmpVer(path.basename(b), path.basename(a)))) {   // mac_arm-152.0.7977.30 → 新的在前
      for (const inner of dirs(v)) if (exists(path.join(inner, exe))) out.push(path.join(inner, exe));
    }
  }
  return out;
}

export function findChrome({ chrome } = {}) {
  if (chrome) {
    if (!exists(chrome)) throw new Error(`--chrome 指的 ${chrome} 不存在`);
    return chrome;
  }
  const c = chromeCandidates();
  if (c.length) return c[0];
  const r = npx(['hyperframes', 'browser', 'path']);
  const line = String(r.stdout || '').trim().split(/\r?\n/).map((s) => s.trim()).reverse().find((s) => exists(s));
  if (line) return line;
  throw new Error('找不到 HyperFrames 的 Chrome → 先跑 npx hyperframes browser ensure（會下載到 ~/.cache/hyperframes/chrome），或用 --chrome <路徑> 指定');
}

// ---------- HyperFrames runtime ----------

const RUNTIME = path.join('dist', 'hyperframe.runtime.iife.js');

// 只用工作區 node_modules 那一份（package.json 釘的版本），不去 npx 快取挑最新版：audit 量到的要和 render 出來的一樣
export function findRuntime({ runtime, root } = {}) {
  if (runtime) {
    if (!exists(runtime)) throw new Error(`--runtime 指的 ${runtime} 不存在`);
    return { file: runtime, version: '?' };
  }
  const hf = hfLocal(root);
  const file = hf && path.join(hf.dir, RUNTIME);
  if (!file || !exists(file)) throw new Error(`找不到 HyperFrames 的 runtime（${RUNTIME}）：${HF_MISSING}`);
  return { file, version: hf.version };
}

// ---------- 小型 http server ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};
// 影片與音效量版面用不到：回 404（不讀整支 rough.mp4，也不讓 Chrome 解碼）
const SKIP_MEDIA = new Set(['.mp4', '.mov', '.m4v', '.webm', '.wav', '.mp3', '.m4a', '.aac', '.ogg']);
export const RUNTIME_URL = '/__audit_hf_runtime.js';

export function injectRuntime(html) {
  const tag = `<script src="${RUNTIME_URL}"></script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`) : `${tag}\n${html}`;
}

export function startServer(dir, runtimeFile) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
    if (p === RUNTIME_URL) { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' }); fs.createReadStream(runtimeFile).pipe(res); return; }
    if (p === '/' || p === '') p = '/index.html';
    const f = path.resolve(root, '.' + p);
    if ((f !== root && !f.startsWith(root + path.sep)) || !exists(f)) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(f).toLowerCase();
    if (SKIP_MEDIA.has(ext)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (p === '/index.html') res.end(injectRuntime(fs.readFileSync(f, 'utf8')));
    else fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---------- CDP ----------

function cdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = [];
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
        const p = pending.get(m.id);
        pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
      } else for (const fn of listeners) fn(m);
    });
  });
}

function launchChrome(chrome, userDir, W = 1920, H = 1080) {
  const args = ['--headless', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--mute-audio', '--disable-extensions', '--disable-background-networking', '--disable-sync',
    '--force-device-scale-factor=1', `--window-size=${W},${H}`, 'about:blank'];
  const cp = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// W／H：視窗大小（009 直式量 overlay 用 1080×1920；預設 1920×1080）
export async function openSession({ dir, chrome, runtime, readyTimeout = 60000, W = 1920, H = 1080 }) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-audit-'));
  const { server, port } = await startServer(dir, runtime);
  let proc = null, cdp = null;
  const errors = [];
  const close = async () => {
    try { cdp?.close(); } catch { /* 忽略 */ }
    if (proc && proc.exitCode == null) {
      proc.kill();
      await Promise.race([new Promise((r) => proc.once('exit', r)), sleep(3000)]);
    }
    server.close();
    // Chrome 剛結束時 Windows 可能還鎖著檔，刪不掉就留在暫存資料夾
    for (let k = 0; k < 5; k++) { try { fs.rmSync(userDir, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  };
  try {
    const l = await launchChrome(chrome, userDir, W, H);
    proc = l.cp;
    cdp = await cdpClient(l.ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p, timeout) => cdp.send(m, p, sessionId, timeout);
    cdp.on((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails || {};
        errors.push({ text: d.exception?.description?.split('\n')[0] || d.text || '（不明錯誤）', url: d.url || '', line: d.lineNumber });
      }
      // 子合成的 script 出錯時，HyperFrames runtime 會接住、改印 console.error("[HyperFrames] composition script error: <id> …")
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        const text = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').split('\n')[0].trim();
        if (text) errors.push({ text, url: '', line: null });
      }
    });
    await S('Runtime.enable');
    await S('Page.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const evaluate = async (expression, timeout = 30000) => {
      const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text);
      return r.result.value;
    };
    await S('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
    const t0 = Date.now();
    for (;;) {
      let st = null;
      try { st = await evaluate('({ ready: window.__playerReady === true, err: window.__hfStartupError ? String(window.__hfStartupError.message || window.__hfStartupError) : null })', 5000); } catch { st = null; }
      if (st?.err) throw new Error(`HyperFrames runtime 啟動失敗：${st.err}`);
      if (st?.ready) break;
      if (Date.now() - t0 > readyTimeout) throw new Error(`頁面 ${readyTimeout / 1000} 秒內沒有就緒（window.__playerReady）→ 先跑 npx hyperframes check 看有沒有 runtime 錯誤`);
      await sleep(100);
    }
    await evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
    return {
      errors,
      async seek(t) { await evaluate(pageSeekSource(t)); },
      async measure(opts) { return evaluate(pageMeasureSource(opts)); },
      // 003：custom 段的時間軸（第一次 seek 之後才有）與 P.at 記下的綁句錯誤（specs/contracts/cues.md §4.4）
      async motion(opts) { return evaluate(pageMotionSource(opts)); },
      async cueErrors() { return evaluate('(window.__cueErrors || []).slice()'); },
      evaluate,
      async screenshot(file) {
        const r = await S('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      },
      close,
    };
  } catch (e) {
    await close();
    throw e;
  }
}

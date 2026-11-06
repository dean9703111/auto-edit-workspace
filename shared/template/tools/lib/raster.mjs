// 極簡點陣繪圖（rgb24 Buffer）：contact sheet、座標格線圖用。
// 不靠 ffmpeg 的 drawtext（要 freetype／fontconfig，Windows 與部分 Homebrew 版本沒有），數字用內建 5×7 點陣字。
//
//   canvas(w, h, rgb)                     → { w, h, data }
//   fillRect(c, x, y, w, h, rgb, alpha)   填色（alpha < 1 時和底色混合）
//   blit(c, src, x, y)                    貼上另一張 { w, h, data }
//   text(c, str, x, y, scale, rgb)        畫字（只有 0-9 : . # - , / 空白，與 qc-sheet 的「theme: light／dark」用到的小寫字母、versions 比較影片的 v）
//   textWidth(str, scale)
//   htmlShot({ chrome, file, out, width, height })  Chrome 截本機 HTML 成 PNG（要印中文字時用：背景圖；要排很多張用 audit-browser.mjs 的 openBrowser().shot）
//   spawnAsync(cmd, args)                  非同步跑外部程式（ffmpeg 併發用）→ { status, stdout: Buffer, stderr: string }
//   poolOn(workers, items, fn)             併發：每個 worker 一次做一項，items 照順序取；結果照 items 的順序回傳（fn(worker, item, i)）
//   pool(items, limit, fn)                 同上，沒有 worker 物件，只限制同時幾個（fn(item, i)）
//   contactSheet({ fontsCss, title, cells, cols, tile, ... })  拼圖頁 → { html, width, height }；cells＝[{ src, time, id, text }]（格下印「時間｜id｜text」）

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const GLYPHS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  's': ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
  'a': ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  'd': ['00001', '00001', '01101', '10011', '10001', '10001', '01111'],
  'e': ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  'g': ['00000', '01111', '10001', '10001', '01111', '00001', '01110'],
  'h': ['10000', '10000', '10110', '11001', '10001', '10001', '10001'],
  'i': ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
  'k': ['10000', '10000', '10010', '10100', '11000', '10100', '10010'],
  'l': ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  'm': ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  'r': ['00000', '00000', '10110', '11001', '10000', '10000', '10000'],
  't': ['01000', '01000', '11110', '01000', '01000', '01001', '00110'],
  'v': ['00000', '00000', '10001', '10001', '10001', '01010', '00100'],
  'x':['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export function canvas(w, h, rgb = [0, 0, 0]) {
  const data = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { data[i * 3] = rgb[0]; data[i * 3 + 1] = rgb[1]; data[i * 3 + 2] = rgb[2]; }
  return { w, h, data };
}

export function fillRect(c, x, y, w, h, rgb, alpha = 1) {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(c.w, Math.round(x + w)), y1 = Math.min(c.h, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * c.w + xx) * 3;
      for (let k = 0; k < 3; k++) c.data[i + k] = alpha >= 1 ? rgb[k] : Math.round(c.data[i + k] * (1 - alpha) + rgb[k] * alpha);
    }
  }
}

export function blit(c, src, x, y) {
  for (let yy = 0; yy < src.h; yy++) {
    const ty = y + yy;
    if (ty < 0 || ty >= c.h) continue;
    const x0 = Math.max(0, -x), x1 = Math.min(src.w, c.w - x);
    if (x1 <= x0) continue;
    src.data.copy(c.data, (ty * c.w + x + x0) * 3, (yy * src.w + x0) * 3, (yy * src.w + x1) * 3);
  }
}

export const textWidth = (str, scale = 1) => String(str).length * 6 * scale - scale;

export function text(c, str, x, y, scale = 1, rgb = [255, 255, 255]) {
  let cx = x;
  for (const ch of String(str)) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) if (g[r][col] === '1') fillRect(c, cx + col * scale, y + r * scale, scale, scale, rgb);
    cx += 6 * scale;
  }
}

// ---------- Chrome 截本機 HTML（中文字靠 kit/fonts.css；點陣字畫不出來的東西用這個）----------

// chrome＝lib/audit-browser.mjs 的 findChrome() 回傳的執行檔；file＝本機 .html；out＝要寫的 .png（視窗大小＝截圖大小）
export function htmlShot({ chrome, file, out, width, height, timeout = 60000 }) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-shot-'));
  try {
    fs.rmSync(out, { force: true });
    const r = spawnSync(chrome, ['--headless', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
      '--force-device-scale-factor=1', `--window-size=${width},${height}`, '--virtual-time-budget=5000', `--user-data-dir=${userDir}`,
      `--screenshot=${out}`, pathToFileURL(file).href], { encoding: 'utf8', timeout, maxBuffer: 1 << 26 });
    if (r.error) throw new Error(r.error.code === 'ENOENT' ? `找不到 Chrome：${chrome}` : r.error.message);
    if (r.status !== 0 || !fs.existsSync(out)) throw new Error(String(r.stderr || r.stdout || `結束碼 ${r.status}`).trim().slice(-300));
    return out;
  } finally {
    // Windows 上 Chrome 剛結束時可能還鎖著資料夾：重試 5 次、每次 300ms
    for (let k = 0; k < 5; k++) { try { fs.rmSync(userDir, { recursive: true, force: true }); break; } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); } }
  }
}

// ---------- 併發 ----------

export function spawnAsync(cmd, args, { cwd, input } = {}) {
  return new Promise((resolve) => {
    const cp = spawn(cmd, args, { cwd, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'], windowsHide: true });
    const out = [], err = [];
    cp.stdout.on('data', (d) => out.push(d));
    cp.stderr.on('data', (d) => err.push(d));
    cp.once('error', (e) => resolve({ status: 1, stdout: Buffer.alloc(0), stderr: e.code === 'ENOENT' ? `找不到 ${cmd}` : e.message, error: e }));
    cp.once('close', (status) => resolve({ status, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString() }));
    if (input != null) cp.stdin.end(input);
  });
}

export async function poolOn(workers, items, fn) {
  const out = new Array(items.length);
  let next = 0, failed = null;
  await Promise.all(workers.map(async (w) => {
    while (next < items.length && !failed) {
      const i = next++;
      try { out[i] = await fn(w, items[i], i); } catch (e) { failed ||= e; }
    }
  }));
  if (failed) throw failed;
  return out;
}

export const pool = (items, limit, fn) => poolOn(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, (_, i) => i), items, (_, it, i) => fn(it, i));

// ---------- 拼圖頁（openBrowser().shot 排成圖）----------

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// tile＝每格畫面的 [寬, 高]；label＝格下文字高（兩行）；width＝整頁寬。回傳的 height 剛好放下所有列
export function contactSheet({ fontsCss, title = '', cells, cols, tile, label = 52, width = 1920, fontSize = 17 }) {
  const [tw, th] = tile, bar = title ? 40 : 0, rows = Math.ceil(cells.length / cols), height = bar + rows * (th + label);
  const body = cells.map((c) => `<div class="c"><img src="${esc(c.src)}"><div class="l">${c.time != null ? `<b>${esc(c.time)}</b>｜` : ''}${c.id != null ? `<i>${esc(c.id)}</i>｜` : ''}${esc(c.text)}</div></div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8">${fontsCss ? `<link rel="stylesheet" href="${esc(fontsCss)}">` : ''}<style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#0B1020;color:#E8ECF5;font-family:var(--font-cjk),sans-serif}
.bar{height:40px;line-height:40px;padding:0 16px;font-size:20px;font-weight:700;background:#1E2740;color:#FFD400;white-space:nowrap;overflow:hidden}
.g{display:grid;grid-template-columns:repeat(${cols},${tw}px);justify-content:space-between}
.c{width:${tw}px;height:${th + label}px;overflow:hidden}.c img{display:block;width:${tw}px;height:${th}px}
.l{height:${label}px;padding:2px 6px;box-sizing:border-box;font-size:${fontSize}px;line-height:${Math.floor((label - 4) / 2)}px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}
.l b{color:#FFD400}.l i{font-style:normal;color:#7FD3FF}
</style></head><body>${bar ? `<div class="bar">${esc(title)}</div>` : ''}<div class="g">${body}</div></body></html>`;
  return { html, width, height };
}

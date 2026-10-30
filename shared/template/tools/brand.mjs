#!/usr/bin/env node
/**
 * 換主色：node shared/template/tools/brand.mjs "#1B7F4B"
 *
 *   1. 寫入 kit/brand.css 的 --brand
 *   2. 算 --brand-ink：主色對 #0B1020 對比 ≥ 4.5 用 #0B1020，否則用 #FFFFFF（印出對比值）
 *   3. 算 --brand-text：主色對 #0B1020 對比 ≥ 4.5 直接用主色，否則逐步混白直到 ≥ 4.5
 *   4. 主色色相在紅色範圍（340°–20°）時警告：會和警示紅撞色
 *   5. 重畫 kit/pip-frame.png（子母畫面外框跟著主色變；Node 內建 zlib 寫 PNG，不需要 Python）
 *
 * 測試用：--kit <kit 資料夾>（預設是 tools 旁邊的 ../kit）、--no-frame（不重畫外框）
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEEP = '#0B1020';

// ---------- 顏色 ----------

export function parseHex(s) {
  const m = String(s).trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (!m) throw new Error(`色碼要寫成 #RRGGBB（例如 "#1B7F4B"），現在是「${s}」`);
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
export function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export function hue([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return null;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function brandColors(input) {
  const brand = parseHex(input);
  const deep = parseHex(DEEP);
  const c = contrast(brand, deep);
  const ink = c >= 4.5 ? DEEP : '#FFFFFF';
  const inkContrast = contrast(brand, parseHex(ink));
  let text = brand, mixed = 0;
  while (contrast(text, deep) < 4.5 && mixed < 100) {
    mixed += 5;
    text = brand.map((v) => v + (255 - v) * mixed / 100);
  }
  const h = hue(brand);
  const sat = Math.max(...brand) - Math.min(...brand);
  return {
    brand: toHex(brand), ink, inkContrast: +inkContrast.toFixed(2), text: toHex(text), textContrast: +contrast(text, deep).toFixed(2),
    mixed, brandContrast: +c.toFixed(2), reddish: h != null && sat > 40 && (h >= 340 || h <= 20),
  };
}

export function rewriteBrandCss(css, { brand, ink, text }) {
  const set = (src, name, val) => {
    const re = new RegExp(`(--${name}\\s*:\\s*)#[0-9a-fA-F]{3,8}`);
    if (!re.test(src)) throw new Error(`brand.css 找不到 --${name}，檔案格式被改過：請從 shared/template 重新取一份 brand.css`);
    return src.replace(re, `$1${val}`);
  };
  return set(set(set(css, 'brand', brand), 'brand-ink', ink), 'brand-text', text);
}

// ---------- PNG ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;   // filter: None
    rgba.copy ? rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4) : raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 子母畫面外框 ----------

// 照 hyperframes-scenes make-pip-frame.py：本體 1344,630–1856,918；由外而內 3px 白 alpha 0.4 描邊（外圓角 15）→ 6px 主色環（圓角 12）
// → 內縮 3px 的 #141414 環（圓角 6）→ 挖空本體（圓角 3）。4 倍超取樣畫好，再用 Lanczos-3（預乘 alpha）縮回 1×，和 PIL 的 LANCZOS 相同做法。
export function drawPipFrame(color, { box = [1344, 630, 1856, 918], W = 1920, H = 1080 } = {}) {
  const ring = parseHex(color);
  const K = 4;
  const [x1, y1, x2, y2] = box;
  const layers = [
    [[x1 - 9, y1 - 9, x2 + 9, y2 + 9], 15, [255, 255, 255, 102]],
    [[x1 - 6, y1 - 6, x2 + 6, y2 + 6], 12, [...ring, 255]],
    [[x1, y1, x2, y2], 6, [20, 20, 20, 255]],
    [[x1 + 3, y1 + 3, x2 - 3, y2 - 3], 3, [0, 0, 0, 0]],
  ];
  // 輸出區域（外框 ±8px），超取樣區域再各加 3px（Lanczos 支撐範圍 3 個輸出像素）
  const ox0 = x1 - 17, oy0 = y1 - 17, ox1 = x2 + 17, oy1 = y2 + 17;
  const sx0 = (ox0 - 3) * K, sy0 = (oy0 - 3) * K, sw = (ox1 - ox0 + 6) * K, sh = (oy1 - oy0 + 6) * K;
  const sup = new Float64Array(sw * sh * 4);   // 預乘 alpha
  const inside = (px, py, [bx1, by1, bx2, by2], r) => {
    // PIL rounded_rectangle([x1k, y1k, x2k-1, y2k-1], radius=rk)：用像素中心判斷，四角是半徑 rk 的圓
    const X1 = bx1 * K, Y1 = by1 * K, X2 = bx2 * K, Y2 = by2 * K, R = r * K;
    const cx = px + 0.5, cy = py + 0.5;
    if (cx < X1 || cx > X2 || cy < Y1 || cy > Y2) return false;
    const qx = cx < X1 + R ? X1 + R : cx > X2 - R ? X2 - R : cx;
    const qy = cy < Y1 + R ? Y1 + R : cy > Y2 - R ? Y2 - R : cy;
    return (cx - qx) ** 2 + (cy - qy) ** 2 <= R * R;
  };
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      let px = null;
      for (const [b, r, c] of layers) if (inside(sx0 + i, sy0 + j, b, r)) px = c;   // ImageDraw 直接覆寫，不混色
      if (!px) continue;
      const o = (j * sw + i) * 4, a = px[3] / 255;
      sup[o] = px[0] * a; sup[o + 1] = px[1] * a; sup[o + 2] = px[2] * a; sup[o + 3] = px[3];
    }
  }
  // Lanczos-3 係數（PIL precompute_coeffs：center=(x+0.5)*scale，支撐 3*scale）
  const lanczos = (x) => { if (x === 0) return 1; if (x <= -3 || x >= 3) return 0; const p = Math.PI * x; return (3 * Math.sin(p) * Math.sin(p / 3)) / (p * p); };
  const coeffs = (outStart, n, inStart) => Array.from({ length: n }, (_, k) => {
    const center = (outStart + k + 0.5) * K;
    const lo = Math.floor(center - 3 * K + 0.5), hi = Math.floor(center + 3 * K + 0.5);
    const ws = [];
    let sum = 0;
    for (let x = lo; x < hi; x++) { const w = lanczos((x - center + 0.5) / K); ws.push([x - inStart, w]); sum += w; }
    return ws.map(([x, w]) => [x, w / sum]);
  });
  const ow = ox1 - ox0, oh = oy1 - oy0;
  const cx = coeffs(ox0, ow, sx0), cy = coeffs(oy0, oh, sy0);
  const clip8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  // 水平
  const tmp = new Float64Array(ow * sh * 4);
  for (let j = 0; j < sh; j++) for (let k = 0; k < ow; k++) {
    const o = (j * ow + k) * 4;
    for (const [x, w] of cx[k]) { if (x < 0 || x >= sw) continue; const s = (j * sw + x) * 4; for (let c = 0; c < 4; c++) tmp[o + c] += sup[s + c] * w; }
    for (let c = 0; c < 4; c++) tmp[o + c] = clip8(tmp[o + c]);
  }
  // 垂直＋還原預乘
  const out = Buffer.alloc(W * H * 4);
  for (let k = 0; k < oh; k++) for (let i = 0; i < ow; i++) {
    const v = [0, 0, 0, 0];
    for (const [y, w] of cy[k]) { if (y < 0 || y >= sh) continue; const s = (y * ow + i) * 4; for (let c = 0; c < 4; c++) v[c] += tmp[s + c] * w; }
    const a = clip8(v[3]);
    const o = ((oy0 + k) * W + ox0 + i) * 4;
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) out[o + c] = a === 255 ? clip8(v[c]) : Math.min(255, Math.floor((255 * clip8(v[c])) / a));
    out[o + 3] = a;
  }
  return encodePng(out, W, H);
}

// ---------- CLI ----------

export function applyBrand(color, { kitDir = path.resolve(HERE, '..', 'kit'), frame = true } = {}) {
  const c = brandColors(color);
  const cssPath = path.join(kitDir, 'brand.css');
  if (!fs.existsSync(cssPath)) throw new Error(`找不到 ${cssPath}`);
  fs.writeFileSync(cssPath, rewriteBrandCss(fs.readFileSync(cssPath, 'utf8'), c));
  if (frame) fs.writeFileSync(path.join(kitDir, 'pip-frame.png'), drawPipFrame(c.brand));
  return c;
}

function cli() {
  const args = process.argv.slice(2);
  let kitDir, frame = true, color = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--kit') kitDir = path.resolve(args[++i]);
    else if (args[i] === '--no-frame') frame = false;
    else if (args[i] === '--help') { console.log('用法：node shared/template/tools/brand.mjs "#1B7F4B"'); return 0; }
    else color = args[i];
  }
  if (!color) { console.error('✖ 要給一個色碼，例如：node shared/template/tools/brand.mjs "#1B7F4B"'); return 1; }
  const c = applyBrand(color, { kitDir, frame });
  console.log(`--brand      ${c.brand}（對深底 ${DEEP} 對比 ${c.brandContrast}）`);
  console.log(`--brand-ink  ${c.ink}（主色底上的字，對比 ${c.inkContrast}${c.inkContrast < 4.5 ? ' ⚠ 低於 4.5，主色太中間調，標籤字可能不好讀' : ''}）`);
  console.log(`--brand-text ${c.text}（深底上的主色字，對比 ${c.textContrast}${c.mixed ? `；主色太暗，已混 ${c.mixed}% 白色` : ''}）`);
  if (c.reddish) console.log('⚠ 主色是紅色系：會和警示紅（踩雷、注意）撞色，觀眾分不出哪個是警告。建議換別的顏色');
  if (frame) console.log('已重畫 kit/pip-frame.png（子母畫面外框）');
  console.log('接著重跑 node shared/template/tools/build.mjs，成片就會換色；預覽頁 shared/template/index.html 重新整理即可');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = cli(); } catch (e) { console.error(`✖ ${e.message}`); process.exitCode = 1; }
}

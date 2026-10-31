#!/usr/bin/env node
/**
 * 換主色：node shared/template/tools/brand.mjs "#1B7F4B"
 *
 *   1. 寫入 kit/brand.css 的 --brand
 *   2. 算 --brand-ink：主色對 #0B1020 對比 ≥ 4.5 用 #0B1020，否則用 #FFFFFF（印出對比值）
 *   3. 算 --brand-text：主色對 #0B1020 與暗色主題最亮的暗底 #1B1F26 對比都 ≥ 4.5 直接用主色，否則逐步混白直到 ≥ 4.5
 *   3b. 暗色主題（plan.json "theme": "dark"）跟著主色變的 token：kit/scene.css 用 color-mix(var(--brand)) 推，
 *       這裡算出同樣的值印出來，並檢查標題列白字（大字 ≥ 3）、暗底主色字（≥ 4.5）
 *   4. 主色色相在紅色範圍（340°–20°）時警告：會和警示紅撞色
 *   5. 重畫 kit/pip-frame.png（子母畫面外框跟著主色變；Node 內建 zlib 寫 PNG，不需要 Python）
 *      與 kit/pip-frame-v.png（直式講者面板：1080×1920 透明，y 897–903 一條主色分隔線；009 FR-130）
 *
 * 測試用：--kit <kit 資料夾>（預設是 tools 旁邊的 ../kit）、--no-frame（不重畫外框）
 *
 * 背景圖（HTML 路線）：node shared/template/tools/brand.mjs bg --html <檔.html> --kind fs|side|ch [--out <資料夾>]
 *   用 HyperFrames 的 Chrome 把 HTML 截成 bg-<kind>.jpg，疊留空區框、量留空區乾不乾淨，三張到齊做並排預覽 preview.jpg。
 *   不寫 shared/template/：使用者同意後才複製（AGENTS.md「換風格」）。完整用法：--help
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEEP = '#0B1020';
// 暗色主題的底色（specs/010-motion-v2/design-system.md §10、kit/scene.css :root[data-theme="dark"]）
export const DARK = { base: '#0C0E12', card: '#13161C', bar: '#15181E', lt: '#121418', node: '#1B1F26' };

// ---------- 顏色 ----------

export function parseHex(s) {
  const m = String(s).trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (!m) throw new Error(`色碼要寫成 #RRGGBB（例如 "#1B7F4B"），現在是「${s}」→ 改成 # 加 6 位 16 進位數字；給的是顏色名稱就先換成色碼`);
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
  // 深底上的主色字：亮色主題的深底與暗色主題最亮的暗底（節點 #1B1F26）都要 ≥ 4.5
  const dark = parseHex(DARK.node), worst = (t) => Math.min(contrast(t, deep), contrast(t, dark));
  let text = brand, mixed = 0;
  while (worst(text) < 4.5 && mixed < 100) {
    mixed += 5;
    text = brand.map((v) => v + (255 - v) * mixed / 100);
  }
  const h = hue(brand);
  const sat = Math.max(...brand) - Math.min(...brand);
  return {
    brand: toHex(brand), ink, inkContrast: +inkContrast.toFixed(2), text: toHex(text), textContrast: +worst(text).toFixed(2),
    mixed, brandContrast: +c.toFixed(2), reddish: h != null && sat > 40 && (h >= 340 || h <= 20),
  };
}

// 暗色主題跟著主色變的 token（design-system.md §10；scene.css 用同樣的 color-mix 比例）：
// 標題列 主色 92%＋黑 → 主色 22%＋#15181E、錯位底板 主色 55%＋#121418、節點底 主色 20%＋#13161C、光暈球 主色 38%；
// barInk＝標題列左端（最亮處）白字對比（大字標準 ≥ 3）、textOnDark＝--brand-text 對暗色節點底、keyInk＝重點抽屜（主色底）上的字
export const mixRgb = (a, b, p) => a.map((v, i) => v * p + b[i] * (1 - p));
export function darkTokens(input) {
  const c = brandColors(input), brand = parseHex(c.brand), white = [255, 255, 255];
  const bar0 = mixRgb(brand, [0, 0, 0], 0.92), bar1 = mixRgb(brand, parseHex(DARK.bar), 0.22);
  return {
    bar: [toHex(bar0), toHex(bar1)], barInk: +contrast(bar0, white).toFixed(2),
    plate: toHex(mixRgb(brand, parseHex(DARK.lt), 0.55)), tint: toHex(mixRgb(brand, parseHex(DARK.card), 0.2)),
    textOnDark: +contrast(parseHex(c.text), parseHex(DARK.node)).toFixed(2), keyInk: c.inkContrast,
  };
}

export function rewriteBrandCss(css, { brand, ink, text }) {
  const set = (src, name, val) => {
    const re = new RegExp(`(--${name}\\s*:\\s*)#[0-9a-fA-F]{3,8}`);
    if (!re.test(src)) throw new Error(`brand.css 找不到 --${name}，檔案格式被改過 → 從 git 還原 shared/template/kit/brand.css 再重跑`);
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
export function drawPipFrame(color, { box = [1424, 594, 1856, 918], W = 1920, H = 1080 } = {}) {
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

// ---------- 背景圖：HTML 路線（brand.mjs bg，cli-004 §5）----------

// 每種版面的尺寸與留空區 [x1, y1, x2, y2]（出處：USAGE-reference R9.2、R4.1；ch 是建議初值）
export const BG_KINDS = {
  fs: { w: 1920, h: 1080, zh: '全畫面與插入素材', zones: [
    { name: '全畫面主卡', color: 'red', zh: '紅', rect: [120, 150, 1380, 862] },
    { name: '子母畫面', color: 'blue', zh: '藍', rect: [1424, 581, 1888, 951] },
    { name: '字幕帶', color: 'yellow', zh: '黃', rect: [0, 920, 1920, 1080] }] },
  side: { w: 960, h: 1080, zh: '側邊欄面板', zones: [{ name: '側邊欄文字區', color: 'red', zh: '紅', rect: [0, 86, 816, 864] }] },
  ch: { w: 1920, h: 1080, zh: '章節轉場', zones: [{ name: '章名卡', color: 'red', zh: '紅', rect: [160, 260, 1760, 870] }] },
};
export const BG_DECOR = { lumDiff: 40, maxRatio: 0.005 };   // 和框內中位亮度差 > 40 的像素占比 > 0.5% 就提醒（建議初值）

// 截圖前接上 kit 的字型與主色、固定頁面大小；相對路徑照原 HTML 所在資料夾解析
export function injectHead(html, { baseUrl, links = [], w, h }) {
  const add = `<base href="${baseUrl}">${links.map((u) => `<link rel="stylesheet" href="${u}">`).join('')}<style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}</style>`;
  const m = html.match(/<head\b[^>]*>/i);
  return m ? html.replace(m[0], `${m[0]}${add}`) : `<meta charset="utf-8">${add}${html}`;
}

// 框內「裝飾」像素的占比：亮度和框內中位數差 > th 的像素數 ÷ 框內像素數（rgb＝rgb24 Buffer）
export function decorRatio(rgb, W, H, [x1, y1, x2, y2], th = BG_DECOR.lumDiff) {
  const hist = new Uint32Array(256);
  const L = (i) => Math.round(0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2]);
  let n = 0;
  for (let y = Math.max(0, y1); y < Math.min(H, y2); y++) for (let x = Math.max(0, x1); x < Math.min(W, x2); x++) { hist[L((y * W + x) * 3)]++; n++; }
  if (!n) return 0;
  let acc = 0, med = 0;
  while (med < 255 && acc + hist[med] < n / 2) acc += hist[med++];
  let off = 0;
  for (let v = 0; v < 256; v++) if (Math.abs(v - med) > th) off += hist[v];
  return off / n;
}

const shown = (p, root) => { const r = path.relative(root, p); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p; };

export async function renderBg({ html, kind, out, chrome, kitDir }) {
  const { run, probeMedia, rawFrame } = await import('./lib/ff.mjs');
  const { htmlShot } = await import('./lib/raster.mjs');
  const K = BG_KINDS[kind];
  const htmlAbs = path.resolve(html);
  const src = fs.readFileSync(htmlAbs, 'utf8');
  fs.mkdirSync(out, { recursive: true });
  const render = path.join(out, `.bg-${kind}.render.html`), raw = path.join(out, `raw-${kind}.png`), jpg = path.join(out, `bg-${kind}.jpg`), zones = path.join(out, `zones-${kind}.jpg`);
  fs.writeFileSync(render, injectHead(src, { baseUrl: `${pathToFileURL(path.dirname(htmlAbs)).href}/`, links: [pathToFileURL(path.join(kitDir, 'fonts.css')).href, pathToFileURL(path.join(kitDir, 'brand.css')).href], w: K.w, h: K.h }));
  try {
    try { htmlShot({ chrome, file: render, out: raw, width: K.w, height: K.h }); } catch (e) { throw new Error(`Chrome 截圖失敗：${e.message} → 先用瀏覽器打開這個 HTML 看有沒有錯，或跑 npx hyperframes browser ensure`); }
  } finally { fs.rmSync(render, { force: true }); }
  let r = run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-q:v', '2', jpg]);
  if (r.status !== 0) throw new Error(`轉 JPG 失敗：${String(r.stderr).trim().slice(-300)} → 重跑一次；還是失敗就把這行回報`);
  const info = probeMedia(jpg);
  if (info.width !== K.w || info.height !== K.h) throw new Error(`截出來是 ${info.width}×${info.height}，不是 ${K.w}×${K.h} → 回報這一行（Chrome 版本：${chrome}）`);
  const boxes = K.zones.map((z) => `drawbox=x=${z.rect[0]}:y=${z.rect[1]}:w=${z.rect[2] - z.rect[0]}:h=${z.rect[3] - z.rect[1]}:color=${z.color}@0.8:t=4`).join(',');
  r = run('ffmpeg', ['-y', '-v', 'error', '-i', jpg, '-vf', boxes, '-q:v', '2', zones]);
  if (r.status !== 0) throw new Error(`疊留空區框失敗：${String(r.stderr).trim().slice(-300)} → 重跑一次；還是失敗就把這行回報`);
  const px = rawFrame(jpg, { width: K.w, height: K.h });
  const decor = K.zones.map((z) => ({ ...z, ratio: decorRatio(px, K.w, K.h, z.rect) }));
  return { kind, jpg, zones, raw, decor, external: /\bhttps?:\/\//i.test(src) };
}

export async function makePreview(out) {
  const { run } = await import('./lib/ff.mjs');
  const f = (k, p) => path.join(out, `${p}-${k}.jpg`);
  const need = ['fs', 'side', 'ch'];
  const missing = need.filter((k) => !fs.existsSync(f(k, 'bg')) || !fs.existsSync(f(k, 'zones')));
  if (missing.length) return { missing };
  const file = path.join(out, 'preview.jpg');
  const ins = [...need.map((k) => f(k, 'bg')), ...need.map((k) => f(k, 'zones'))].flatMap((x) => ['-i', x]);
  const fc = '[0]scale=640:360[a];[1]scale=320:360[b];[2]scale=640:360[c];[3]scale=640:360[d];[4]scale=320:360[e];[5]scale=640:360[f];[a][b][c]hstack=3[top];[d][e][f]hstack=3[bot];[top][bot]vstack';
  const r = run('ffmpeg', ['-y', '-v', 'error', ...ins, '-filter_complex', fc, '-q:v', '2', file]);
  if (r.status !== 0) throw new Error(`並排預覽失敗：${String(r.stderr).trim().slice(-300)} → 重跑一次；還是失敗就把這行回報`);
  return { file, missing: [] };
}

const BG_HELP = `換主色與背景圖（零依賴，只用 Node 22、ffmpeg 與 HyperFrames 的 Chrome）

  node shared/template/tools/brand.mjs "#1B7F4B"
      換主色：寫 kit/brand.css 的 --brand、算 --brand-ink／--brand-text 的對比（≥ 4.5）、
      紅色系警告、重畫子母畫面外框 kit/pip-frame.png 與直式講者面板分隔線 kit/pip-frame-v.png。

  node shared/template/tools/brand.mjs bg --html <檔.html> --kind fs|side|ch [--out <資料夾>]
      背景圖的 HTML 路線：用 Chrome 把 HTML 截成 bg-<kind>.jpg（fs 1920×1080、side 960×1080、ch 1920×1080），
      另存疊上留空區框的 zones-<kind>.jpg；三張都在時產生並排預覽 preview.jpg。
      HTML 裡顏色用 var(--brand)、字型用 var(--font-cjk)（工具自動接上 kit/brand.css 與 kit/fonts.css）。
      輸出在 --out（預設 HTML 所在的資料夾），不能在 shared/template/ 裡；使用者看過 preview.jpg 同意後，
      才把 bg-*.jpg 複製進 shared/template/。

測試用：--kit <kit 資料夾>、--no-frame（換主色時不重畫外框）、--chrome <chrome 路徑>`;

const inside = (child, parent) => {
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const r = path.relative(real(parent), real(child));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

async function bgCli(args) {
  const o = {};
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (['--html', '--kind', '--out', '--kit', '--chrome'].includes(k)) {
      if (args[i + 1] == null) throw new Error(`${k} 後面要接值 → 在 ${k} 後面補上值（用 node shared/template/tools/brand.mjs bg --help 看格式）`);
      o[k.slice(2)] = args[++i];
    } else throw new Error(`brand.mjs bg 看不懂「${k}」→ 照這個用法改：node shared/template/tools/brand.mjs bg --html <檔.html> --kind fs|side|ch [--out <資料夾>]`);
  }
  if (!Object.hasOwn(BG_KINDS, o.kind ?? '')) throw new Error(`--kind 只能是 fs（1920×1080，全畫面與插入素材）、side（960×1080，側邊欄面板）、ch（1920×1080，章節轉場），現在是「${o.kind ?? ''}」→ 改成 fs、side 或 ch`);
  if (!o.html || !/\.html?$/i.test(o.html) || !fs.existsSync(o.html)) throw new Error(`--html 要指一個 .html 檔，找不到「${o.html ?? ''}」→ 先把背景圖做成 .html 檔（USAGE-reference.md R9.3），再用 --html 指它的路徑`);
  const kitDir = o.kit ? path.resolve(o.kit) : path.resolve(HERE, '..', 'kit');
  const templateDir = path.dirname(kitDir);
  const out = path.resolve(o.out ?? path.dirname(path.resolve(o.html)));
  if (inside(out, templateDir)) throw new Error(`輸出資料夾不能在 shared/template/ 裡（${out}）→ 先放暫存資料夾，使用者看過 preview.jpg 同意後再複製`);
  const { findChrome } = await import('./lib/audit-browser.mjs');
  const chrome = findChrome({ chrome: o.chrome });
  const root = path.resolve(templateDir, '..', '..');
  const K = BG_KINDS[o.kind];
  console.log(`背景圖（HTML 路線）：${shown(path.resolve(o.html), root)} → ${o.kind}（${K.w}×${K.h}）`);
  console.log(`Chrome：${chrome}`);
  const r = await renderBg({ html: o.html, kind: o.kind, out, chrome, kitDir });
  console.log(`→ ${shown(r.jpg, root)}（${K.w}×${K.h} ✔）`);
  const zh = (z) => `${z.zh}＝${z.name} ${z.rect[0] === 0 && z.rect[2] === K.w ? '' : `x ${z.rect[0]}–${z.rect[2]}、`}y ${z.rect[1]}–${z.rect[3]}`;
  console.log(`→ ${shown(r.zones, root)}（${K.zones.map(zh).join('；')}）`);
  if (r.external) console.log('⚠ HTML 裡有網路網址（http／https）：離線或沒有網路時會載不到 → 圖片、字型改用本機檔案');
  const bad = r.decor.filter((z) => z.ratio > BG_DECOR.maxRatio);
  if (bad.length) for (const z of bad) console.log(`⚠ ${z.zh}框（${z.name}）裡有 ${(z.ratio * 100).toFixed(z.ratio < 0.01 ? 2 : 1)}% 的像素是裝飾（和框內中位亮度差 > ${BG_DECOR.lumDiff}）→ 裝飾移到框外，重跑這個指令`);
  else console.log(`✔ 留空區乾淨（${K.zones.map((z) => z.zh).join('、')}框裡沒有裝飾）`);
  const pv = await makePreview(out);
  if (pv.missing.length) { console.log(`還沒做：${pv.missing.join('、')} → 各寫一個 HTML，跑 ${pv.missing.map((k) => `--kind ${k}`).join('、')}（三張都有才產生 preview.jpg）`); return 0; }
  console.log(`→ ${shown(pv.file, root)}（三張並排：上排原圖、下排疊留空區框，1600×720）`);
  console.log('下一步：把 preview.jpg 給使用者看，停下來等同意；同意後才複製進 shared/template/：');
  for (const k of ['fs', 'side', 'ch']) {
    const f = path.join(out, `bg-${k}.jpg`);
    console.log(process.platform === 'win32' ? `  Windows：Copy-Item "${f}" "shared\\template\\bg-${k}.jpg"` : `  Mac：cp "${f}" "shared/template/bg-${k}.jpg"`);
  }
  return 0;
}

// ---------- CLI ----------

// 直式講者面板（009 FR-130）：1080×1920 透明，y 897–903 一條 6px 主色線（上半資訊面板／下半講者面板的分隔線，canvas.mjs pip.frame）
export function drawPipFrameV(color, { W = 1080, H = 1920, line = [897, 903] } = {}) {
  const [r, g, b] = parseHex(color);
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = line[0]; y < line[1]; y++) for (let x = 0; x < W; x++) rgba.set([r, g, b, 255], (y * W + x) * 4);
  return encodePng(rgba, W, H);
}

export function applyBrand(color, { kitDir = path.resolve(HERE, '..', 'kit'), frame = true } = {}) {
  const c = brandColors(color);
  const cssPath = path.join(kitDir, 'brand.css');
  if (!fs.existsSync(cssPath)) throw new Error(`找不到 ${cssPath} → 從 git 還原 shared/template/kit/brand.css 再重跑`);
  fs.writeFileSync(cssPath, rewriteBrandCss(fs.readFileSync(cssPath, 'utf8'), c));
  if (frame) {
    fs.writeFileSync(path.join(kitDir, 'pip-frame.png'), drawPipFrame(c.brand));
    fs.writeFileSync(path.join(kitDir, 'pip-frame-v.png'), drawPipFrameV(c.brand));
  }
  return c;
}

async function cli() {
  const args = process.argv.slice(2);
  if (args[0] === 'bg') return bgCli(args.slice(1));
  let kitDir, frame = true, color = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--kit') kitDir = path.resolve(args[++i]);
    else if (args[i] === '--no-frame') frame = false;
    else if (args[i] === '--help') { console.log(BG_HELP); return 0; }
    else color = args[i];
  }
  if (!color) { console.error('✖ 要給一個色碼 → 例如：node shared/template/tools/brand.mjs "#1B7F4B"；背景圖用 brand.mjs bg --html <檔> --kind fs|side|ch'); return 1; }
  const c = applyBrand(color, { kitDir, frame });
  console.log(`--brand      ${c.brand}（對深底 ${DEEP} 對比 ${c.brandContrast}）`);
  console.log(`--brand-ink  ${c.ink}（主色底上的字，對比 ${c.inkContrast}${c.inkContrast < 4.5 ? ' ⚠ 低於 4.5，主色太中間調，標籤字可能不好讀' : ''}）`);
  console.log(`--brand-text ${c.text}（深底上的主色字，對 ${DEEP} 與暗色主題 ${DARK.node} 最低對比 ${c.textContrast}${c.mixed ? `；主色太暗，已混 ${c.mixed}% 白色` : ''}）`);
  const d = darkTokens(c.brand);
  console.log(`暗色主題（plan.json "theme": "dark"）跟著換：標題列 ${d.bar[0]}→${d.bar[1]}、錯位底板 ${d.plate}、節點底 ${d.tint}（kit/scene.css 自動推，不用改）`);
  if (d.barInk < 3) console.log(`⚠ 暗色主題標題列的白字對比只有 ${d.barInk}（大字要 ≥ 3）：主色太亮，暗色主題的標題看不清楚 → 換深一點的主色，或這支影片用亮色主題`);
  if (c.reddish) console.log('⚠ 主色是紅色系：會和警示紅（踩雷、注意）撞色，觀眾分不出哪個是警告。建議換別的顏色');
  if (frame) console.log('已重畫 kit/pip-frame.png（子母畫面外框）與 kit/pip-frame-v.png（直式講者面板分隔線）');
  console.log('接著重跑 node shared/template/tools/build.mjs，成片就會換色；預覽頁 shared/template/index.html 重新整理即可');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().then((code) => { process.exitCode = code; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
}

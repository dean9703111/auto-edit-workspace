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
 * 風格包（shared/template/styles/<名稱>/：主色＋外框＋背景圖一包，lib/styles.mjs）：
 *   brand.mjs list                     列出風格包，標出工作區目前用的是哪一包
 *   brand.mjs use <名稱> [--force]     把那一包複製進 shared/template/（之後每一集預設用它）；目前的設定不屬於任何包時先自動存成「原本-<YYYYMMDD>」
 *                                      （同名就加 -2），印存在哪、怎麼換回來；--force＝不存直接蓋
 *   brand.mjs pack <名稱> [--color "#RRGGBB"] [--bg <資料夾>] [--note "說明"]
 *                                      建一包：不給 --color／--bg 就把 shared/template/ 目前的主色與背景存成一包；
 *                                      給了就照色碼算 brand.css、畫外框，背景圖從 --bg 資料夾拿 bg-*.jpg（不動 shared/template/ 目前的設定）
 *   單集換包不用這支：plan.json 寫 "style": "<名稱>"
 *
 * 講者資料（shared/setting.json，不進版控；14 講者介紹的姓名、頭銜，15 金句的出處；lib/speaker.mjs）：
 *   brand.mjs speaker                                   看目前的設定
 *   brand.mjs speaker --name "林大寶" --titles "影音創作者,科技部落客" [--short "大寶"]
 *                                                       設定（頭銜 1–3 個，用逗號或「、」分開；--short 是金句出處，不給＝姓名）
 *   brand.mjs speaker off                               關閉：不放講者介紹
 *
 * 片尾模板（shared/setting.json 的 ending，素材在 shared/brand/，都不進版控；lib/ending.mjs）：
 *   brand.mjs ending                                    看目前的設定
 *   brand.mjs ending <圖檔> [--seconds 9.9] [--subscribe <動畫檔>|none] [--no-quote|--quote]
 *                                                       設定：影片結束後接片尾卡（這張圖＋片尾金句），講到「訂閱」那句放訂閱動畫；
 *                                                       檔案複製進 shared/brand/。只改一項就只給那一個旗標（例 --seconds 8）
 *   brand.mjs ending off                                關掉片尾（拿掉設定；shared/brand/ 的檔留著）
 *
 * 背景圖（輸出都在暫存資料夾，不寫 shared/template/：使用者同意後才 pack --bg、use；auto-edit-style 步驟 2–4）：
 *   brand.mjs bg --tmp                                                    開一個暫存資料夾、印完整路徑
 *   brand.mjs bg --html <檔.html> --kind fs|side|ch [--out <資料夾>]       HTML 路線：用 HyperFrames 的 Chrome 截成 bg-<kind>.jpg，
 *                                                                         疊留空區框、量留空區乾不乾淨，三張到齊做並排預覽 preview.jpg
 *   brand.mjs bg --image <圖> --kind fs|side|ch [--dark] --out <資料夾>    使用者的圖：縮放裁切成那一種的尺寸、zones 圖、量留空區（同一套量法）
 *   brand.mjs bg --verify <資料夾>                                        三張（和 -dark）尺寸、zones、preview.jpg，最後印停點 ⑥ 那兩行
 *   完整用法：--help
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listPacks, packsJs, samePack, copyIfDiff, templatePathOf, PACK_KIT, PACK_BG, STYLES_DIR, DEFAULT_PACK } from './lib/styles.mjs';
import { readSpeaker, validateSpeaker, SPEAKER_FILE, SET_CMD } from './lib/speaker.mjs';
import { readSettings, writeSetting } from './lib/settings.mjs';
import { readEndingSetting, ENDING, BRAND_DIR } from './lib/ending.mjs';
import { ok, warn, fail, next, cmdLine, report } from './lib/say.mjs';
import { splitFlag, valueOf, oneOf, isMain } from './lib/cli.mjs';
import { stopLines } from './lib/stops.mjs';
import { CANVAS } from './lib/canvas.mjs';

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
// 本體與畫布尺寸照 lib/canvas.mjs（032 C7：子母畫面的框只寫在那裡）；box 是 [x1, y1, x2, y2]
const PIP_L = CANVAS.landscape.pip.box, PIP_V = CANVAS.portrait.pip.box;
export function drawPipFrame(color, { box = [PIP_L[0], PIP_L[1], PIP_L[0] + PIP_L[2], PIP_L[1] + PIP_L[3]], W = CANVAS.landscape.W, H = CANVAS.landscape.H } = {}) {
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
    { name: '子母畫面', color: 'blue', zh: '藍', rect: [...CANVAS.landscape.pip.zone] },   // 禁入區（lib/canvas.mjs 的 pip.zone）
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
  const { run, probeMedia } = await import('./lib/ff.mjs');
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
  const r = run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-q:v', '2', jpg]);
  if (r.status !== 0) throw new Error(`轉 JPG 失敗：${String(r.stderr).trim().slice(-300)} → 重跑一次；還是失敗就把這行回報`);
  const info = probeMedia(jpg);
  if (info.width !== K.w || info.height !== K.h) throw new Error(`截出來是 ${info.width}×${info.height}，不是 ${K.w}×${K.h} → 回報這一行（Chrome 版本：${chrome}）`);
  const decor = await zonesOf({ jpg, kind, zones });
  return { kind, jpg, zones, raw, decor, external: /\bhttps?:\/\/(?!www\.w3\.org\/)/i.test(src) };
}

// 疊留空區框存成 zones 圖、量每個框裡的裝飾占比：HTML、使用者的圖、--verify 三條路同一套量法
export async function zonesOf({ jpg, kind, zones }) {
  const { run, rawFrame } = await import('./lib/ff.mjs');
  const K = BG_KINDS[kind];
  const boxes = K.zones.map((z) => `drawbox=x=${z.rect[0]}:y=${z.rect[1]}:w=${z.rect[2] - z.rect[0]}:h=${z.rect[3] - z.rect[1]}:color=${z.color}@0.8:t=4`).join(',');
  const r = run('ffmpeg', ['-y', '-v', 'error', '-i', jpg, '-vf', boxes, '-q:v', '2', zones]);
  if (r.status !== 0) throw new Error(`疊留空區框失敗：${String(r.stderr).trim().slice(-300)} → 重跑一次；還是失敗就把這行回報`);
  const px = rawFrame(jpg, { width: K.w, height: K.h });
  return K.zones.map((z) => ({ ...z, ratio: decorRatio(px, K.w, K.h, z.rect) }));
}

// 量完的那幾行：框裡有裝飾 ⚠（附 fix），都乾淨 ✓
export function decorLines(kind, decor, fix) {
  const K = BG_KINDS[kind];
  const bad = decor.filter((z) => z.ratio > BG_DECOR.maxRatio);
  if (!bad.length) return [ok(`留空區乾淨（${K.zones.map((z) => z.zh).join('、')}框裡沒有裝飾）`)];
  return bad.map((z) => `⚠ ${z.zh}框（${z.name}）裡有 ${(z.ratio * 100).toFixed(z.ratio < 0.01 ? 2 : 1)}% 的像素是裝飾（和框內中位亮度差 > ${BG_DECOR.lumDiff}）→ ${fix}`);
}

// 使用者給的圖（或其他路線尺寸不對的圖）：縮放到蓋滿、從中間裁成這一種的尺寸（image-routing.md 第 1 節就是叫這一條：brand.mjs bg --image）；dark＝存成 bg-<kind>-dark.jpg
export async function cropBg({ image, kind, dark = false, out }) {
  const { run, probeMedia } = await import('./lib/ff.mjs');
  const K = BG_KINDS[kind], sfx = dark ? '-dark' : '';
  fs.mkdirSync(out, { recursive: true });
  const jpg = path.join(out, `bg-${kind}${sfx}.jpg`), zones = path.join(out, `zones-${kind}${sfx}.jpg`);
  const r = run('ffmpeg', ['-y', '-v', 'error', '-i', path.resolve(image), '-vf', `scale=${K.w}:${K.h}:force_original_aspect_ratio=increase,crop=${K.w}:${K.h}`, '-frames:v', '1', '-q:v', '2', jpg]);
  if (r.status !== 0) throw new Error(`縮放裁切失敗：${String(r.stderr).trim().slice(-300)} → 確認「${image}」是圖片（jpg、png、webp；HEIC 先轉成 jpg），再跑一次`);
  const info = probeMedia(jpg);
  if (info.width !== K.w || info.height !== K.h) throw new Error(`裁出來是 ${info.width}×${info.height}，不是 ${K.w}×${K.h} → 回報這一行`);
  return { kind, dark, jpg, zones, decor: await zonesOf({ jpg, kind, zones }) };
}

// 停點 ⑥ 之前的總驗證：亮色三張一定要有、暗色（-dark）有就一起驗；尺寸、zones 圖、並排預覽
export async function verifyBg(dir) {
  const { probeMedia } = await import('./lib/ff.mjs');
  const kinds = Object.keys(BG_KINDS), errors = [], warnings = [], rows = [];
  for (const sfx of ['', '-dark']) {
    const have = kinds.filter((k) => fs.existsSync(path.join(dir, `bg-${k}${sfx}.jpg`)));
    if (!sfx && have.length < kinds.length) errors.push(`少了 ${kinds.filter((k) => !have.includes(k)).map((k) => `bg-${k}.jpg`).join('、')} → 三張都要有（brand.mjs bg 的 --html 或 --image 做那一種）`);
    if (sfx && have.length && have.length < kinds.length) warnings.push(`暗色只有 ${have.map((k) => `bg-${k}-dark.jpg`).join('、')} → 暗色三張都要有，或都拿掉（沿用目前的暗色）`);
    for (const kind of have) {
      const K = BG_KINDS[kind], file = path.join(dir, `bg-${kind}${sfx}.jpg`), m = probeMedia(file);
      if (m.width !== K.w || m.height !== K.h) { errors.push(`bg-${kind}${sfx}.jpg 是 ${m.width}×${m.height}，要 ${K.w}×${K.h} → 用 brand.mjs bg --image <那張圖> --kind ${kind}${sfx ? ' --dark' : ''} --out <這個資料夾> 裁成對的尺寸`); continue; }
      rows.push({ kind, dark: !!sfx, file, decor: await zonesOf({ jpg: file, kind, zones: path.join(dir, `zones-${kind}${sfx}.jpg`) }) });
    }
  }
  if (errors.length) return { errors, warnings, rows, previews: [] };
  const previews = [(await makePreview(dir)).file];
  if (rows.filter((r) => r.dark).length === kinds.length) previews.push((await makePreview(dir, '-dark')).file);
  return { errors, warnings, rows, previews };
}

// sfx：'-dark' 時拼暗色三張，存成 preview-dark.jpg
export async function makePreview(out, sfx = '') {
  const { run } = await import('./lib/ff.mjs');
  const f = (k, p) => path.join(out, `${p}-${k}${sfx}.jpg`);
  const need = ['fs', 'side', 'ch'];
  const missing = need.filter((k) => !fs.existsSync(f(k, 'bg')) || !fs.existsSync(f(k, 'zones')));
  if (missing.length) return { missing };
  const file = path.join(out, `preview${sfx}.jpg`);
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

  node shared/template/tools/brand.mjs list
      列出風格包（shared/template/styles/<名稱>/：主色＋外框＋背景圖），標出工作區目前用的那一包。
  node shared/template/tools/brand.mjs use <名稱> [--force]
      把那一包複製進 shared/template/（每一集預設用它；只換一集就在 plan.json 寫 "style": "<名稱>"）。
      目前的主色與背景不屬於任何包時，先自動存成「原本-<YYYYMMDD>」（同名已經有就加 -2、-3…）再換，印存在哪、怎麼換回來；
      --force＝不存，直接蓋掉。
  node shared/template/tools/brand.mjs pack <名稱> [--color "#RRGGBB"] [--bg <資料夾>] [--note "說明"]
      建一包：只給名稱＝把 shared/template/ 目前的主色與背景存成一包；給 --color 就照色碼算 brand.css、畫外框；
      給 --bg 就從那個資料夾拿 bg-fs.jpg、bg-side.jpg、bg-ch.jpg（和 -dark 三張，有的話）。不會改 shared/template/ 目前的設定。

  node shared/template/tools/brand.mjs speaker
      看講者資料（shared/setting.json：14 講者介紹的姓名、頭銜，15 金句的出處）。
  node shared/template/tools/brand.mjs speaker --name "林大寶" --titles "影音創作者,科技部落客" [--short "大寶"]
      設定講者（頭銜 1–3 個，用逗號或「、」分開；--short 是金句出處，不給＝姓名；只改頭銜就只給 --titles）。
  node shared/template/tools/brand.mjs speaker off
      關閉：不放講者介紹。

  node shared/template/tools/brand.mjs ending
      看片尾模板的設定（shared/setting.json 的 ending；素材在 shared/brand/，不進版控）。
  node shared/template/tools/brand.mjs ending <圖檔> [--seconds 9.9] [--subscribe <動畫檔>|none] [--no-quote|--quote]
      設定片尾：影片結束後接 --seconds 秒的片尾卡（黑底、這張圖置中、右邊打出片尾金句；金句取講稿最後的 > 引言，
      沒有就用最後一張金句字卡），講到「訂閱」那句放訂閱動畫（gif／webm／mov）。檔案複製進 shared/brand/。
      只改一項就只給那個旗標（例 brand.mjs ending --seconds 8）；--no-quote＝片尾卡只放圖。直式、剪映素材不放。
  node shared/template/tools/brand.mjs ending off
      關掉片尾（拿掉設定，shared/brand/ 的檔留著）。某一集不要：build.mjs --set ending=false

  背景圖（三張：fs 1920×1080、side 960×1080、ch 1920×1080；暗色是 bg-<kind>-dark.jpg）。輸出都先放暫存資料夾，
  不能在 shared/template/ 裡；使用者看過 preview.jpg 同意（停點 ⑥）後，用 pack --bg 存成風格包、use 套用，不要自己複製。

  node shared/template/tools/brand.mjs bg --tmp
      開一個新的暫存資料夾，印完整路徑（後面指令的 <暫存資料夾> 都換成它）。
  node shared/template/tools/brand.mjs bg --html <檔.html> --kind fs|side|ch [--out <資料夾>]
      HTML 路線：用 Chrome 把 HTML 截成 bg-<kind>.jpg，另存疊上留空區框的 zones-<kind>.jpg、量留空區乾不乾淨；
      三張都在時產生並排預覽 preview.jpg。HTML 裡顏色用 var(--brand)、字型用 var(--font-cjk)
      （工具自動接上 kit/brand.css 與 kit/fonts.css）。--out 預設是 HTML 所在的資料夾。
  node shared/template/tools/brand.mjs bg --image <圖> --kind fs|side|ch [--dark] --out <資料夾>
      使用者給的圖（或其他路線尺寸不對的圖）：縮放到蓋滿、從中間裁成那一種的尺寸，存成 bg-<kind>.jpg
      （--dark 存成 bg-<kind>-dark.jpg），另存 zones 圖、量留空區（和 HTML 路線同一套量法）。--out 一定要寫。
  node shared/template/tools/brand.mjs bg --verify <資料夾>
      停點 ⑥ 之前跑：三張（和 -dark 三張，有的話）尺寸對不對、重做 zones 圖、量留空區、產生並排預覽 preview.jpg
      （暗色三張齊了另出 preview-dark.jpg），最後印停點 ⑥ 那兩行（完整路徑）。尺寸不對、少一張 ✖，結束碼 1。

測試用：--kit <kit 資料夾>、--no-frame（換主色時不重畫外框）、--chrome <chrome 路徑>
旗標也可以寫成 --旗標=值（只在第一個 = 切，例 --note="a=b"）；要值的旗標後面沒接值（或接著另一個旗標）✖。`;

const inside = (child, parent) => {
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const r = path.relative(real(parent), real(child));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

// 四組子指令共用的參數寫法（lib/cli.mjs）：--旗標=值 只在第一個 = 切；缺值、或下一個是另一個旗標就 ✖，附各自的「→ 怎麼改」
function takeValue(args, i, k, inline, fix) {
  try { return valueOf(args, i, k, inline); } catch (e) { throw new Error(`${e.message} → ${fix}`); }
}

async function bgCli(args) {
  const o = {};
  for (let i = 0; i < args.length; i++) {
    const [k, inline] = String(args[i]).startsWith('--') ? splitFlag(args[i]) : [null];
    if (['html', 'image', 'verify', 'kind', 'out', 'kit', 'chrome'].includes(k)) [o[k], i] = takeValue(args, i, k, inline, `在 --${k} 後面補上值（用 node shared/template/tools/brand.mjs bg --help 看格式）`);
    else if (['dark', 'tmp', 'help'].includes(k)) o[k] = true;
    else throw new Error(`brand.mjs bg 看不懂「${args[i]}」→ 照這個用法改：node shared/template/tools/brand.mjs bg --html <檔.html> --kind fs|side|ch [--out <資料夾>]（其他用法：--help）`);
  }
  if (o.help) { console.log(BG_HELP); return 0; }
  const mode = oneOf(o, ['tmp', 'verify', 'image', 'html']);
  if (mode === 'tmp') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-'));
    console.log(ok(`暫存資料夾：${dir}`));
    console.log('後面指令裡的 <暫存資料夾> 都換成上面這個完整路徑（每條指令是新的 shell，變數不會留著）；回報與停點 ⑥ 也寫它');
    return 0;
  }
  const kitDir = o.kit ? path.resolve(o.kit) : path.resolve(HERE, '..', 'kit');
  const templateDir = path.dirname(kitDir);
  const root = path.resolve(templateDir, '..', '..');
  if (mode === 'verify') return bgVerifyCli(path.resolve(o.verify), templateDir, root);
  if (o.dark && mode !== 'image') throw new Error('--dark 只能和 --image 一起用（HTML 路線還不能做暗色）→ 暗色背景用 mmx 或使用者的圖，再跑 brand.mjs bg --image <圖> --kind <種類> --dark --out <暫存資料夾>');
  if (!Object.hasOwn(BG_KINDS, o.kind ?? '')) throw new Error(`--kind 只能是 fs（1920×1080，全畫面與插入素材）、side（960×1080，側邊欄面板）、ch（1920×1080，章節轉場），現在是「${o.kind ?? ''}」→ 改成 fs、side 或 ch`);
  if (mode === 'image') return bgImageCli(o, templateDir, root);
  if (!o.html || !/\.html?$/i.test(o.html) || !fs.existsSync(o.html)) throw new Error(`--html 要指一個 .html 檔，找不到「${o.html ?? ''}」→ 先把背景圖做成 .html 檔（USAGE-reference.md R9.3），再用 --html 指它的路徑`);
  const out = path.resolve(o.out ?? path.dirname(path.resolve(o.html)));
  if (inside(out, templateDir)) throw new Error(`輸出資料夾不能在 shared/template/ 裡（${out}）→ 先放暫存資料夾，使用者看過 preview.jpg 同意後再複製`);
  const { findChrome } = await import('./lib/audit-browser.mjs');
  const chrome = findChrome({ chrome: o.chrome });
  const K = BG_KINDS[o.kind];
  console.log(`背景圖（HTML 路線）：${shown(path.resolve(o.html), root)} → ${o.kind}（${K.w}×${K.h}）`);
  console.log(`Chrome：${chrome}`);
  const r = await renderBg({ html: o.html, kind: o.kind, out, chrome, kitDir });
  console.log(`→ ${shown(r.jpg, root)}（${K.w}×${K.h} ✓）`);
  console.log(`→ ${shown(r.zones, root)}（${zonesText(o.kind)}）`);
  if (r.external) console.log('⚠ HTML 裡有網路網址（http／https）：離線或沒有網路時會載不到 → 圖片、字型改用本機檔案');
  for (const l of decorLines(o.kind, r.decor, '裝飾移到框外，重跑這個指令')) console.log(l);
  const pv = await makePreview(out);
  if (pv.missing.length) { console.log(`還沒做：${pv.missing.join('、')} → 各寫一個 HTML，跑 ${pv.missing.map((k) => `--kind ${k}`).join('、')}（三張都有才產生 preview.jpg）`); return 0; }
  console.log(`→ ${shown(pv.file, root)}（三張並排：上排原圖、下排疊留空區框，1600×720）`);
  console.log('下一步：把 preview.jpg 給使用者看，停下來等同意（停點 ⑥）。同意後照 auto-edit-style 步驟 4 存成風格包再套用，不要自己複製進 shared/template/：');
  console.log(`  node shared/template/tools/brand.mjs pack <包名> --bg "${shown(out, root)}"`);
  console.log('  node shared/template/tools/brand.mjs use <包名>');
  return 0;
}

// zones 圖每個框是什麼（印在 zones 圖那一行）
const zonesText = (kind) => {
  const K = BG_KINDS[kind];
  return K.zones.map((z) => `${z.zh}＝${z.name} ${z.rect[0] === 0 && z.rect[2] === K.w ? '' : `x ${z.rect[0]}–${z.rect[2]}、`}y ${z.rect[1]}–${z.rect[3]}`).join('；');
};

// bg --image：使用者的圖裁成一種；同一個亮／暗還缺哪幾種就印同一張圖接著裁的指令，三種齊了就接 --verify
async function bgImageCli(o, templateDir, root) {
  if (!o.image || !fs.existsSync(o.image) || !fs.statSync(o.image).isFile()) throw new Error(`--image 要指一張圖，找不到「${o.image ?? ''}」→ 寫使用者那張圖的路徑（jpg、png、webp）`);
  if (!o.out) throw new Error(`--image 一定要寫 --out <資料夾> → 先跑 node shared/template/tools/brand.mjs bg --tmp 開一個暫存資料夾（不要寫進素材資料夾或 shared/template/）`);
  const out = path.resolve(o.out);
  if (inside(out, templateDir)) throw new Error(`輸出資料夾不能在 shared/template/ 裡（${out}）→ 先放暫存資料夾，使用者看過 preview.jpg 同意後再複製`);
  const K = BG_KINDS[o.kind], dark = !!o.dark, sfx = dark ? '-dark' : '';
  console.log(`背景圖（使用者的圖）：${shown(path.resolve(o.image), root)} → ${o.kind}${dark ? '（暗色）' : ''}（${K.w}×${K.h}，縮放到蓋滿、從中間裁切）`);
  const r = await cropBg({ image: o.image, kind: o.kind, dark, out });
  console.log(`→ ${shown(r.jpg, root)}（${K.w}×${K.h} ✓）`);
  console.log(`→ ${shown(r.zones, root)}（${zonesText(o.kind)}）`);
  for (const l of decorLines(o.kind, r.decor, '圖在框裡有東西，字卡會疊在上面：問使用者要不要換一張；說照用就照用（回報寫進去）')) console.log(l);
  const missing = Object.keys(BG_KINDS).filter((k) => !fs.existsSync(path.join(out, `bg-${k}${sfx}.jpg`)));
  const L = missing.length
    ? next(`${dark ? '暗色' : ''}還沒做 ${missing.join('、')}：同一張圖接著裁（要用別張圖就換掉 --image 那一段）`, ...missing.map((k) => cmdLine('brand.mjs', ['bg', '--image', path.resolve(o.image), '--kind', k, ...(dark ? ['--dark'] : []), '--out', out])))
    : next('三種都有了：驗證尺寸、出並排預覽、印停點 ⑥', cmdLine('brand.mjs', ['bg', '--verify', out]));
  for (const l of L) console.log(l);
  return 0;
}

// bg --verify：停點 ⑥ 之前的總驗證；最後兩行是停點 ⑥（完整路徑）
async function bgVerifyCli(dir, templateDir, root) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`--verify 要指放背景圖的資料夾，找不到「${dir}」→ 寫 brand.mjs bg 的 --out 那個資料夾`);
  if (inside(dir, templateDir)) throw new Error(`--verify 的資料夾不能在 shared/template/ 裡（${dir}）→ 驗暫存資料夾；風格包的圖用 brand.mjs list 看`);
  const v = await verifyBg(dir);
  for (const w of v.warnings) console.log(warn(w));
  if (v.errors.length) { for (const e of v.errors) console.log(fail(e)); return 1; }
  const lines = [];
  for (const r of v.rows) {
    const K = BG_KINDS[r.kind];
    lines.push(`${path.basename(r.file)} ${K.w}×${K.h} ✓`);
    for (const l of decorLines(r.kind, r.decor, '重做那一張（裝飾移到框外）或換一張；使用者看過說可以就照用')) lines.push(`  ${l}`);
  }
  for (const l of lines) console.log(l);
  for (const f of v.previews) console.log(`→ ${shown(f, root)}（三張並排：上排原圖、下排疊留空區框，1600×720）`);
  const dirty = v.rows.filter((r) => r.decor.some((z) => z.ratio > BG_DECOR.maxRatio)).map((r) => path.basename(r.file));
  const rep = [`三張背景：${v.rows.filter((r) => !r.dark).map((r) => `${path.basename(r.file)} ${BG_KINDS[r.kind].w}×${BG_KINDS[r.kind].h}`).join('、')}（${dir}）`,
    ...(v.rows.some((r) => r.dark) ? [`暗色：${v.rows.filter((r) => r.dark).map((r) => path.basename(r.file)).join('、')}${v.previews[1] ? `（並排 ${path.basename(v.previews[1])}）` : ''}`] : []),
    dirty.length ? `留空區：⚠ ${dirty.join('、')} 框裡有裝飾（上面有每一張的比例）` : '留空區：乾淨'];
  for (const l of report(rep, { stop: stopLines.bg(dir) })) console.log(l);
  return 0;
}

// ---------- 風格包（list／use／pack）----------

const templateOf = (kitDir) => path.dirname(kitDir ?? path.resolve(HERE, '..', 'kit'));
const BG_SIZE = { fs: [1920, 1080], side: [960, 1080], ch: [1920, 1080] };

export function writePacksJs(templateDir) {
  const f = path.join(templateDir, STYLES_DIR, 'styles.js');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, packsJs(listPacks(templateDir)));
  return f;
}

// 目前 shared/template/ 是哪一包（每個檔逐位元組一樣）；都不是回 null
export function currentPack(templateDir) {
  return listPacks(templateDir).find((p) => samePack(templateDir, path.join(templateDir, STYLES_DIR, p.dir)))?.dir ?? null;
}

// 「原本-20261113」已經有了就用「原本-20261113-2」、「-3」…
export function freePackName(templateDir, base) {
  const taken = (n) => fs.existsSync(path.join(templateDir, STYLES_DIR, n));
  if (!taken(base)) return base;
  let i = 2;
  while (taken(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

export function usePack(templateDir, name, { force = false, now = new Date() } = {}) {
  const packs = listPacks(templateDir);
  const p = packs.find((x) => x.dir === name);
  if (!p) throw new Error(`找不到風格包「${name}」→ 現有：${packs.map((x) => x.dir).join('、') || '（沒有）'}；看清單：node shared/template/tools/brand.mjs list`);
  const cur = currentPack(templateDir);
  // 目前的主色與背景不屬於任何包：直接換會弄丟，先自動存成「原本-<YYYYMMDD>」（AI 不用自己記得先 pack）；--force＝確定不要了，不存
  let saved = null;
  if (!cur && !force) {
    saved = freePackName(templateDir, `原本-${ymd(now)}`);
    makePack(templateDir, saved, { note: `換成「${name}」之前自動存的` });
    writePacksJs(templateDir);
  }
  const dir = path.join(templateDir, STYLES_DIR, name);
  const changed = [];
  for (const f of p.files) if (copyIfDiff(path.join(dir, f), path.join(templateDir, templatePathOf(f)))) changed.push(templatePathOf(f));
  // 這包沒有暗色背景：留著舊的會變成「亮色是新包、暗色是舊包」→ 提醒
  const noDark = PACK_BG.filter((f) => f.endsWith('-dark.jpg') && !p.files.includes(f));
  return { from: cur, saved, pack: p, changed, noDark };
}

export function makePack(templateDir, name, { color = null, bg = null, note = '', kitDir = path.join(templateDir, 'kit') } = {}) {
  if (!name || /[\\/]/.test(name) || name.startsWith('.')) throw new Error(`風格包名稱「${name ?? ''}」不能有 / 或 \\，也不能用 . 開頭 → 換一個名稱，例如「深綠」`);
  const dir = path.join(templateDir, STYLES_DIR, name);
  if (fs.existsSync(dir)) throw new Error(`風格包「${name}」已經有了（shared/template/${STYLES_DIR}/${name}/）→ 換一個名稱，或先刪掉那個資料夾`);
  const files = [];
  const put = (f, buf) => { fs.writeFileSync(path.join(dir, f), buf); files.push(f); };
  let brand;
  if (bg) {
    const src = path.resolve(bg);
    if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) throw new Error(`--bg 要指一個資料夾（裡面放 bg-fs.jpg、bg-side.jpg、bg-ch.jpg），找不到「${bg}」`);
    const need = ['bg-fs.jpg', 'bg-side.jpg', 'bg-ch.jpg'].filter((f) => !fs.existsSync(path.join(src, f)));
    if (need.length) throw new Error(`--bg 的資料夾少了 ${need.join('、')} → 三張都要有（尺寸 fs 1920×1080、side 960×1080、ch 1920×1080；brand.mjs bg 會產生這三張）`);
  }
  fs.mkdirSync(dir, { recursive: true });
  try {
    if (color) {
      const c = brandColors(color);
      brand = c.brand;
      put('brand.css', rewriteBrandCss(fs.readFileSync(path.join(kitDir, 'brand.css'), 'utf8'), c));
      put('pip-frame.png', drawPipFrame(c.brand));
      put('pip-frame-v.png', drawPipFrameV(c.brand));
    } else {
      for (const f of PACK_KIT) if (fs.existsSync(path.join(kitDir, f))) put(f, fs.readFileSync(path.join(kitDir, f)));
      brand = (fs.readFileSync(path.join(kitDir, 'brand.css'), 'utf8').match(/--brand\s*:\s*(#[0-9a-fA-F]{6})/) || [])[1]?.toUpperCase() ?? null;
    }
    const bgDir = bg ? path.resolve(bg) : (color ? null : templateDir);
    if (bgDir) for (const f of PACK_BG) if (fs.existsSync(path.join(bgDir, f))) put(f, fs.readFileSync(path.join(bgDir, f)));
    fs.writeFileSync(path.join(dir, 'style.json'), JSON.stringify({ name, brand, note }, null, 2) + '\n');
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  return { dir, brand, files };
}

async function packCli(cmd, args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (!String(args[i]).startsWith('--')) { o._.push(args[i]); continue; }
    const [k, inline] = splitFlag(args[i]);
    if (['color', 'bg', 'note', 'kit'].includes(k)) [o[k], i] = takeValue(args, i, k, inline, '看用法：node shared/template/tools/brand.mjs --help');
    else if (k === 'force') o.force = true;
    else throw new Error(`brand.mjs ${cmd} 沒有 --${k} 這個參數 → 看用法：node shared/template/tools/brand.mjs --help`);
  }
  const kitDir = o.kit ? path.resolve(o.kit) : undefined;
  const templateDir = templateOf(kitDir);
  if (cmd === 'list') {
    const packs = listPacks(templateDir), cur = currentPack(templateDir);
    if (!packs.length) { console.log(`還沒有風格包（shared/template/${STYLES_DIR}/）→ 把目前的存起來：node shared/template/tools/brand.mjs pack ${DEFAULT_PACK}`); return 0; }
    console.log(`風格包（shared/template/${STYLES_DIR}/）：`);
    for (const p of packs) {
      const dark = PACK_BG.filter((f) => f.endsWith('-dark.jpg')).every((f) => p.files.includes(f));
      console.log(`  ${p.dir === cur ? '●' : '○'} ${p.dir}　主色 ${p.brand ?? '—'}　背景 ${p.files.filter((f) => f.startsWith('bg-')).length} 張${dark ? '（含暗色）' : ''}${p.note ? `　${p.note}` : ''}`);
    }
    console.log(cur ? `工作區目前用：${cur}（● 那一包）` : '工作區目前的主色或背景不屬於任何包 → 要留著就存起來：node shared/template/tools/brand.mjs pack <新名稱>');
    console.log('換整個工作區：brand.mjs use <名稱>；只換一集：plan.json 寫 "style": "<名稱>"；預覽：打開 shared/template/index.html 上方的「風格」');
    return 0;
  }
  const name = o._[0];
  if (!name || o._.length > 1) throw new Error(`brand.mjs ${cmd} 要接一個風格包名稱 → 例：node shared/template/tools/brand.mjs ${cmd} ${DEFAULT_PACK}`);
  if (cmd === 'use') {
    const r = usePack(templateDir, name, { force: !!o.force });
    if (r.saved) console.log(ok(`原本的主色與背景不屬於任何包，先存成風格包「${r.saved}」（shared/template/${STYLES_DIR}/${r.saved}/）；要換回來：node shared/template/tools/brand.mjs use ${r.saved}`));
    console.log(`換成風格包「${name}」（原本：${r.from ?? (r.saved ? `不屬於任何包，已存成「${r.saved}」` : '不屬於任何包')}）：${r.changed.length ? r.changed.map((f) => `shared/template/${f}`).join('、') : '檔案都一樣，沒有變'}`);
    if (r.noDark.length) console.log(`⚠ 這包沒有暗色背景（${r.noDark.join('、')}），shared/template/ 留著原本的；暗色主題的集數背景會對不上主色 → 補進 shared/template/${STYLES_DIR}/${name}/ 再 use 一次`);
    console.log('接著重跑 node shared/template/tools/build.mjs，完成影片就會換；預覽頁 shared/template/index.html 重新整理即可');
    return 0;
  }
  const r = makePack(templateDir, name, { color: o.color ?? null, bg: o.bg ?? null, note: o.note ?? '', kitDir });
  const js = writePacksJs(templateDir);
  console.log(`建好風格包「${name}」：shared/template/${STYLES_DIR}/${name}/（主色 ${r.brand ?? '—'}；${r.files.join('、')}）`);
  const bad = [];
  if (fs.existsSync(path.join(r.dir, 'bg-fs.jpg'))) {
    const { probeMedia } = await import('./lib/ff.mjs');
    for (const [k, [w, h]] of Object.entries(BG_SIZE)) for (const f of [`bg-${k}.jpg`, `bg-${k}-dark.jpg`]) {
      if (!fs.existsSync(path.join(r.dir, f))) continue;
      const m = probeMedia(path.join(r.dir, f));
      if (m.width !== w || m.height !== h) bad.push(`${f} 是 ${m.width}×${m.height}（要 ${w}×${h}）`);
    }
  }
  if (bad.length) console.log(`⚠ 背景圖尺寸不對：${bad.join('、')} → 照 USAGE-reference.md R9.2 縮放裁切後放進這一包`);
  if (o.color && !o.bg) console.log(`⚠ 這包只有主色、沒有背景圖：用的時候背景會沿用 shared/template/ 目前的 → 要配套的背景，用 brand.mjs bg 做三張再 --bg <資料夾>`);
  console.log(`情境庫的風格清單已更新：${path.relative(process.cwd(), js)}`);
  console.log(`用法：整個工作區 node shared/template/tools/brand.mjs use ${name}；只換一集 plan.json 寫 "style": "${name}"`);
  return 0;
}

// ---------- 講者資料 ----------

export function writeSpeaker(templateDir, data) {
  return writeSetting(path.resolve(templateDir, '..'), 'speaker', data);
}

function speakerCli(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (!String(args[i]).startsWith('--')) { o._.push(args[i]); continue; }
    const [k, inline] = splitFlag(args[i]);
    if (['name', 'titles', 'short', 'kit'].includes(k)) [o[k], i] = takeValue(args, i, k, inline, `例：${SET_CMD}`);
    else throw new Error(`brand.mjs speaker 沒有 --${k} 這個參數 → 例：${SET_CMD}`);
  }
  const templateDir = templateOf(o.kit ? path.resolve(o.kit) : undefined);
  const where = `shared/${SPEAKER_FILE}`;
  if (o._[0] === 'off') {
    writeSpeaker(templateDir, { off: true });
    console.log(`已關閉講者介紹（${where}：{ "off": true }）：之後 plan.json 用到 14 講者介紹，--check 會擋下來`);
    console.log(`要再打開：${SET_CMD}`);
    return 0;
  }
  if (o._.length) throw new Error(`brand.mjs speaker 只認得 off → 例：${SET_CMD}`);
  if (o.name == null && o.titles == null && o.short == null) {
    const sp = readSpeaker(templateDir);
    if (sp.state === 'set') console.log(`講者：${sp.name}（金句出處：${sp.short}）｜頭銜：${sp.titles.join('、')}｜${where}`);
    else if (sp.state === 'off') console.log(`講者介紹：關閉（${where}）`);
    else if (sp.state === 'bad') console.log(`✖ ${where}：${sp.error}`);
    else console.log(`⚠ 還沒設定講者：14 講者介紹會用示範人物「林大寶」`);
    if (sp.state !== 'set') console.log(`→ 設定：${SET_CMD}；不放講者介紹：node shared/template/tools/brand.mjs speaker off`);
    return sp.state === 'bad' ? 1 : 0;
  }
  const cur = readSpeaker(templateDir);
  const name = o.name ?? (cur.state === 'set' ? cur.name : '');
  const titles = o.titles != null ? o.titles.split(/[,，、]/).map((t) => t.trim()).filter(Boolean) : (cur.state === 'set' ? cur.titles : []);
  const short = o.short ?? (o.name == null && cur.state === 'set' && cur.short !== cur.name ? cur.short : null);
  const errs = validateSpeaker({ name, short, titles });
  if (errs.length) { console.error(`✖ 講者資料不對：${errs.join('；')} → 例：${SET_CMD}`); return 1; }
  writeSpeaker(templateDir, { name, ...(short && short !== name ? { short } : {}), titles });
  console.log(`已設定講者（${where}，不進版控）：${name}｜頭銜：${titles.join('、')}｜金句出處：${short || name}`);
  console.log('之後 plan.json 的 14 講者介紹不寫 name、titles 就用這份；已經 build 過的專案重跑 build.mjs 就會換');
  return 0;
}

// ---------- 片尾模板（033）----------

const END_CMD = 'node shared/template/tools/brand.mjs ending <圖檔> [--subscribe <動畫檔>]';
// 放進 shared/brand/：已經在裡面就不動；同名不同內容不蓋（請使用者改檔名）
function intoBrand(sharedDir, file, exts, what) {
  const src = path.resolve(process.cwd(), String(file));
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`找不到${what} ${file} → 寫檔案的路徑，例 ${END_CMD}`);
  if (!exts.includes(path.extname(src).toLowerCase())) throw new Error(`${what}要是 ${exts.join(' ')}，${path.basename(src)} 不是`);
  const dir = path.join(sharedDir, BRAND_DIR), dst = path.join(dir, path.basename(src));
  if (path.resolve(src) === path.resolve(dst)) return path.basename(dst);
  if (fs.existsSync(dst) && !fs.readFileSync(dst).equals(fs.readFileSync(src))) throw new Error(`shared/${BRAND_DIR}/ 已經有另一個 ${path.basename(src)} → 把檔名改一下再設定（不蓋掉原本的檔）`);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
  return path.basename(dst);
}

function endingCli(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (!String(args[i]).startsWith('--')) { o._.push(args[i]); continue; }
    const [k, inline] = splitFlag(args[i]);
    if (['seconds', 'subscribe', 'kit'].includes(k)) [o[k], i] = takeValue(args, i, k, inline, `例：${END_CMD}`);
    else if (k === 'quote' || k === 'no-quote') o.quote = k === 'quote';
    else throw new Error(`brand.mjs ending 沒有 --${k} 這個參數 → 例：${END_CMD}；關掉：brand.mjs ending off`);
  }
  const sharedDir = path.resolve(templateOf(o.kit ? path.resolve(o.kit) : undefined), '..');
  const cur = readSettings(sharedDir).data.ending;
  if (o._[0] === 'off') {
    if (o._.length > 1 || o.seconds != null || o.subscribe != null || o.quote != null) throw new Error('brand.mjs ending off 後面不用再寫別的');
    writeSetting(sharedDir, 'ending', undefined);
    console.log(ok(`已關掉片尾（拿掉 shared/setting.json 的 ending；shared/${BRAND_DIR}/ 的檔留著）`));
    console.log(`要再打開：${END_CMD}`);
    return 0;
  }
  if (o._.length > 1) throw new Error(`brand.mjs ending 只收一張圖 → 例：${END_CMD}`);
  if (!o._.length && o.seconds == null && o.subscribe == null && o.quote == null) {
    const e = readEndingSetting(sharedDir);
    if (!e) { console.log(`片尾：沒設定（預設沒有）→ 設定：${END_CMD}`); return 0; }
    console.log(`片尾卡：${e.image ? `${path.basename(e.image)}，${e.seconds} 秒，${e.quote ? '右邊放片尾金句（講稿最後的 > 引言，沒有就用最後一張金句字卡）' : '只放圖'}` : '沒有'}｜訂閱動畫：${e.subscribe ? path.basename(e.subscribe) : '沒有'}｜shared/setting.json、shared/${BRAND_DIR}/`);
    for (const p of e.problems) console.log(`⚠ ${p}`);
    return e.problems.length ? 1 : 0;
  }
  const want = { ...(cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {}) };
  if (o._.length) want.image = intoBrand(sharedDir, o._[0], ['.jpg', '.jpeg', '.png', '.webp'], '片尾圖');
  if (o.subscribe != null) want.subscribe = o.subscribe === 'none' ? undefined : intoBrand(sharedDir, o.subscribe, ['.gif', '.webm', '.mov', '.mp4'], '訂閱動畫');
  if (o.seconds != null) {
    const n = Number(o.seconds);
    if (!(n >= ENDING.min && n <= ENDING.max)) throw new Error(`--seconds 要是 ${ENDING.min}–${ENDING.max} 秒（剪映是 ${ENDING.seconds}），現在是 ${o.seconds}`);
    want.seconds = Math.round(n * 30) / 30 === n ? n : Math.round(n * 30) / 30;   // 對齊影格（30fps），完成影片才能逐格接
  }
  if (o.quote != null) want.quote = o.quote;
  if (!want.image && !want.subscribe) throw new Error(`還沒有片尾圖也沒有訂閱動畫 → 至少給一個：${END_CMD}`);
  const clean = Object.fromEntries(Object.entries({ image: want.image, seconds: want.seconds ?? ENDING.seconds, quote: want.quote ?? true, subscribe: want.subscribe }).filter(([, v]) => v !== undefined));
  writeSetting(sharedDir, 'ending', clean);
  const e = readEndingSetting(sharedDir);
  console.log(ok(`已設定片尾（shared/setting.json，不進版控）：${clean.image ? `片尾卡 ${clean.image} ${clean.seconds} 秒${clean.quote ? '＋片尾金句' : '（只放圖）'}` : '沒有片尾卡'}｜訂閱動畫：${clean.subscribe || '沒有'}`));
  for (const p of e?.problems || []) console.log(`⚠ ${p}`);
  console.log('之後每一集 build 就會放（直式、剪映素材不放）；某一集不要：build.mjs --project projects/<專案> --set ending=false');
  return 0;
}

// ---------- CLI ----------

// 直式講者面板（009 FR-130）：1080×1920 透明，y 897–903 一條 6px 主色線（上半資訊面板／下半講者面板的分隔線，canvas.mjs pip.frame）
export function drawPipFrameV(color, { W = CANVAS.portrait.W, H = CANVAS.portrait.H, line = [PIP_V[1] - 3, PIP_V[1] + 3] } = {}) {
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
  if (['list', 'use', 'pack'].includes(args[0])) return packCli(args[0], args.slice(1));
  if (args[0] === 'speaker') return speakerCli(args.slice(1));
  if (args[0] === 'ending') return endingCli(args.slice(1));
  let kitDir, frame = true, color = null;
  for (let i = 0; i < args.length; i++) {
    if (!String(args[i]).startsWith('--')) { color = args[i]; continue; }
    const [k, inline] = splitFlag(args[i]);
    if (k === 'kit') { let v; [v, i] = takeValue(args, i, k, inline, '寫 kit 資料夾的路徑（測試用；平常不用寫）'); kitDir = path.resolve(v); }
    else if (k === 'no-frame') frame = false;
    else if (k === 'help') { console.log(BG_HELP); return 0; }
    else throw new Error(`brand.mjs 沒有 --${k} 這個參數 → 換主色：node shared/template/tools/brand.mjs "#1B7F4B"（其他用法：--help）`);
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
  console.log('接著重跑 node shared/template/tools/build.mjs，完成影片就會換色；預覽頁 shared/template/index.html 重新整理即可');
  return 0;
}

// 經 symlink 執行也算（lib/cli.mjs 的 isMain 用 realpath 比）：以前直接比路徑，從 symlink 跑什麼都不做
if (isMain(import.meta.url)) {
  cli().then((code) => { process.exitCode = code; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
}

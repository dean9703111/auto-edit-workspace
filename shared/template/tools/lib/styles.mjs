// 風格包（零依賴）：shared/template/styles/<名稱>/ 一包＝主色＋子母畫面外框＋背景圖
//
//   一包的檔（都選填，缺的退回 shared/template/ 目前那一份）：
//     style.json      { "name", "brand": "#RRGGBB", "note" }（brand.mjs pack 寫）
//     brand.css       kit/brand.css 的同格式三行（--brand／--brand-ink／--brand-text）
//     pip-frame.png、pip-frame-v.png   子母畫面外框、直式講者面板分隔線
//     bg-fs.jpg、bg-side.jpg、bg-ch.jpg（＋暗色 bg-*-dark.jpg）
//
//   listPacks(templateDir)            → [{ dir, name, brand, note, files }]（照資料夾名排序，「預設」排第一）
//   packDir(templateDir, name)        → 絕對路徑；找不到丟錯（列出現有的包）
//   PACK_KIT／PACK_BG                 → 一包裡放進 kit/ 的檔、背景圖檔名
//   packsJs(packs)                    → styles/styles.js 的內容（情境庫 index.html 用 <script> 讀，file:// 也能開）
//   samePack(templateDir, dir)        → 目前 shared/template/ 的主色、外框、背景圖是不是和這一包逐位元組相同
import fs from 'node:fs';
import path from 'node:path';

export const STYLES_DIR = 'styles';
export const DEFAULT_PACK = '預設';
export const PACK_KIT = ['brand.css', 'pip-frame.png', 'pip-frame-v.png'];
export const PACK_BG = ['bg-fs.jpg', 'bg-side.jpg', 'bg-ch.jpg', 'bg-fs-dark.jpg', 'bg-side-dark.jpg', 'bg-ch-dark.jpg'];
// 一包的檔在 shared/template/ 的位置（brand.mjs use 複製用）
export const templatePathOf = (f) => (PACK_KIT.includes(f) ? path.join('kit', f) : f);

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export function listPacks(templateDir) {
  const root = path.join(templateDir, STYLES_DIR);
  if (!fs.existsSync(root)) return [];
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name);
  dirs.sort((a, b) => (a === DEFAULT_PACK ? -1 : b === DEFAULT_PACK ? 1 : a.localeCompare(b, 'zh-Hant')));
  return dirs.map((dir) => {
    const j = readJson(path.join(root, dir, 'style.json')) || {};
    const files = [...PACK_KIT, ...PACK_BG].filter((f) => fs.existsSync(path.join(root, dir, f)));
    return { dir, name: j.name || dir, brand: j.brand || null, note: j.note || '', files };
  });
}

export function packDir(templateDir, name) {
  const n = String(name ?? '').trim();
  const list = listPacks(templateDir).map((p) => p.dir);
  if (!n || n.includes('/') || n.includes('\\') || n.startsWith('.') || !list.includes(n)) {
    throw new Error(`找不到風格包「${n}」→ 現有：${list.join('、') || `（shared/template/${STYLES_DIR}/ 是空的）`}；新的風格包用 node shared/template/tools/brand.mjs pack <名稱> 建`);
  }
  return path.join(templateDir, STYLES_DIR, n);
}

export function packsJs(packs) {
  const rows = packs.map(({ dir, name, brand, note, files }) => ({ dir, name, brand, note, dark: PACK_BG.filter((f) => f.endsWith('-dark.jpg')).every((f) => files.includes(f)) }));
  return `// brand.mjs 產生，不要手改：情境庫（index.html）的風格切換讀這份\nwindow.STYLE_PACKS = ${JSON.stringify(rows, null, 2)};\n`;
}

export function samePack(templateDir, dir) {
  for (const f of [...PACK_KIT, ...PACK_BG]) {
    const a = path.join(dir, f), b = path.join(templateDir, templatePathOf(f));
    if (!fs.existsSync(a)) continue;
    if (!fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b))) return false;
  }
  return true;
}

// 內容不同才複製（主色換包時 brand.css 大小常常一樣，不能只看大小與時間）
export function copyIfDiff(src, dst) {
  if (fs.existsSync(dst) && fs.readFileSync(src).equals(fs.readFileSync(dst))) return false;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
}

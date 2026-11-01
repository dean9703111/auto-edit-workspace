#!/usr/bin/env node
// 組 GitHub Pages 官網（作者維護用；剪片時不要跑）。只用 Node 22 內建模組。
//
//   node dev/tools/build-site.mjs [--out <資料夾>]     預設 _site（.github/workflows/pages.yml 用同一支）
//
// 網站根目錄＝dev/site/ 的首頁；情境庫與音效照 repo 的路徑放（shared/template/、shared/sfx/），
// 情境庫裡的 ../sfx/、../../NOTICE.md 這些相對連結才連得到。shared/template/ 的 tools/、vendor/ 不上網站。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const i = process.argv.indexOf('--out');
const out = path.resolve(WS, i > 0 && process.argv[i + 1] ? process.argv[i + 1] : '_site');
const MARK = '.nojekyll';   // 也是「這個資料夾是本工具產生的」記號：沒有它又不是空資料夾就不清空
const fail = (msg) => { process.stderr.write(`✖ ${msg}\n`); process.exit(1); };

if (WS === out || WS.startsWith(out + path.sep)) fail(`--out ${out} 是工作區或它的上層 → 換一個新資料夾，例如 _site`);
if (fs.existsSync(out) && fs.readdirSync(out).length && !fs.existsSync(path.join(out, MARK))) fail(`${out} 已經有檔案、不是這支工具產生的 → 換一個空資料夾`);
fs.rmSync(out, { recursive: true, force: true });

const TPL = path.join(WS, 'shared', 'template');
const SKIP = new Set(['tools', 'vendor']);
fs.cpSync(path.join(WS, 'dev', 'site'), out, { recursive: true });
fs.cpSync(TPL, path.join(out, 'shared', 'template'), { recursive: true, filter: (src) => !SKIP.has(path.relative(TPL, src).split(path.sep)[0]) });
fs.cpSync(path.join(WS, 'shared', 'sfx'), path.join(out, 'shared', 'sfx'), { recursive: true });
for (const f of ['NOTICE.md', 'LICENSE']) fs.copyFileSync(path.join(WS, f), path.join(out, f));
fs.writeFileSync(path.join(out, MARK), '');   // GitHub Pages 不跑 Jekyll（底線開頭的檔案才不會被略過）

const show = (p) => (p.startsWith(WS + path.sep) ? path.relative(WS, p) : p);
let n = 0, bytes = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } };
walk(out);
console.log(`✔ 官網組好：${show(out)}（${n} 個檔、${(bytes / 1048576).toFixed(1)} MB）`);
console.log(`→ 本機預覽：用靜態伺服器開 ${show(out)}（例：python3 -m http.server -d ${show(out)} 8765），直接雙擊 index.html 的話 iframe 預覽可能被瀏覽器擋`);

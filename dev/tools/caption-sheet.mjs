// 重截 shared/template/gallery/caption-styles.jpg（情境庫「換成自己的風格」的字幕樣式一覽、官網；1280×720）
//   node dev/tools/caption-sheet.mjs
// 左邊五種樣式（講者畫面／全畫面動畫的淺底輪流），右邊六種字體（深底白字）。字幕的 CSS、字型和 build 同一套（kit/captions.css、lib/caption-style.mjs）；
// 字體在 shared/template/kit/fonts/（跟著 repo）。改了 captions.css、換了主色（主色底那一列）之後重跑。
// 要 HyperFrames 的 Chrome（npx hyperframes browser ensure）與 ffmpeg。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TPL = path.join(ROOT, 'shared', 'template'), KIT = path.join(TPL, 'kit');
const OUT = path.join(TPL, 'gallery', 'caption-styles.jpg');
const lib = (f) => import(pathToFileURL(path.join(TPL, 'tools', 'lib', f)).href);
const { findChrome } = await lib('audit-browser.mjs');
const C = await lib('caption-style.mjs');

const SAY = '一個小時剪好 AI 字幕';
const looks = Object.keys(C.CAP_LOOKS).map((look) => ({ style: { ...C.CAP_DEFAULT, look }, label: C.CAP_LOOKS[look].zh }));
const fonts = Object.keys(C.CAP_FONTS).map((font) => ({ style: { ...C.CAP_DEFAULT, font, weight: 400 }, label: C.CAP_FONTS[font].zh }));

const kit = pathToFileURL(KIT).href + '/';
const photo = pathToFileURL(path.join(TPL, 'preview', 'speaker.jpg')).href;
const face = fonts.map((f) => C.captionFontFace(f.style, `${kit}fonts/`)).filter(Boolean).join('\n');
// 每一格當成一個小畫面：captions.css 的 .cg 是 absolute 貼底，字幕就排在格子底部
const cell = (it, h, bg) => `<div class="cell" style="height:${h}px;${bg}"><b>${it.label}</b><div class="layer"${C.captionRootAttrs(it.style)}><div class="cg"><span>${SAY}</span></div></div></div>`;
const left = looks.map((it, i) => cell(it, 216, i % 2 ? 'background:#FFF8F2' : `background:url(${photo}) center 35%/cover`)).join('');
const right = fonts.map((it) => cell(it, 180, `background:url(${photo}) center 35%/cover`)).join('');
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<link rel="stylesheet" href="${kit}fonts.css"><link rel="stylesheet" href="${kit}brand.css"><link rel="stylesheet" href="${kit}captions.css">
<style>${face}
html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #111; }
.grid { display: grid; grid-template-columns: 960px 960px; }
.cell { position: relative; overflow: hidden; border-bottom: 2px solid #111; box-sizing: border-box; }
.cell > b { position: absolute; left: 20px; top: 16px; z-index: 2; font: 700 30px/1 var(--font-cjk); color: #fff; background: rgba(0, 0, 0, 0.55); padding: 8px 14px; border-radius: 6px; }
.layer { position: absolute; inset: 0; }
.layer .cg { bottom: 8px; }
.col { border-right: 2px solid #111; }
</style></head><body><div class="grid"><div class="col">${left}</div><div>${right}</div></div></body></html>`;
// 頁面用 file:// 開，字型與 CSS 直接讀 kit/（--allow-file-access-from-files）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-sheet-'));
const page = path.join(tmp, 'sheet.html'), png = path.join(tmp, 'sheet.png');
fs.writeFileSync(page, html);
await new Promise((resolve, reject) => {
  const cp = spawn(findChrome(), ['--headless', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', `--user-data-dir=${path.join(tmp, 'u')}`,
    '--allow-file-access-from-files', '--virtual-time-budget=6000', '--window-size=1920,1080', `--screenshot=${png}`, pathToFileURL(page).href], { stdio: 'ignore' });
  cp.on('error', reject);
  cp.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Chrome exit ${code}`))));
});
const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', png, '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '3', OUT]);
if (r.status !== 0) throw new Error(String(r.stderr));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`✓ ${path.relative(ROOT, OUT)}（${Math.round(fs.statSync(OUT).size / 1024)} KB）`);

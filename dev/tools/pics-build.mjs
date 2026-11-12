#!/usr/bin/env node
/**
 * 圖庫產生器（作者維護用，剪片時不用）：dev/pics/catalog.tsv → shared/template/kit/pics/
 *
 *   node dev/tools/pics-build.mjs --tabler <Tabler Icons 的 icons/outline 資料夾> [--check] [--sheet <png>]
 *
 * 來源是免費開源的線條圖示（24 格、只有線）：Tabler Icons（MIT，https://github.com/tabler/tabler-icons，
 * 取得：在暫存資料夾跑 npm pack @tabler/icons 再解開，icons/outline 就是）和工作區已經有的 Lucide（ISC，kit/icons.json）。
 * 每一張換成工作區的線稿畫風（kit/illus-style.md）：封閉的形狀補白色主體（--il-body）、底下一層往右下錯開的主色淡影（--il-accent-soft）、
 * 線條一律 --il-line 4px、不隨縮放變粗。先畫所有填色、再畫所有線，填色不會蓋掉線。
 *
 *   --check   只檢查清單（來源找不找得到、id 有沒有重複、欄位有沒有空），不寫檔；找不到的來源印出名稱相近的
 *   --sheet   另外把全部圖拼成一張總覽圖（給人看畫風有沒有跑掉）
 * 輸出：kit/pics/catalog.json、<類別>.json、<類別>/<id>.svg、LICENSE-tabler.txt、kit/pics-gallery.html。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const KIT = path.join(ROOT, 'shared', 'template', 'kit');
const OUT = path.join(KIT, 'pics');
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const tablerDir = flag('--tabler'), checkOnly = args.includes('--check'), sheet = flag('--sheet');
if (!tablerDir || !fs.existsSync(tablerDir)) { console.log('用法：node dev/tools/pics-build.mjs --tabler <Tabler Icons 的 icons/outline 資料夾> [--check] [--sheet <png>]'); process.exit(2); }
const LUCIDE = JSON.parse(fs.readFileSync(path.join(KIT, 'icons.json'), 'utf8'));
const tablerNames = fs.readdirSync(tablerDir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4));

// ---------- 清單 ----------
const cats = [], errors = [];
let cur = null;
fs.readFileSync(path.join(ROOT, 'dev', 'pics', 'catalog.tsv'), 'utf8').split('\n').forEach((raw, i) => {
  const ln = raw.trim();
  if (!ln) return;
  const head = ln.match(/^#\s*([a-z][\w-]*)\|([^|]+)\|(.+)$/);
  if (head) { cur = { id: head[1], zh: head[2].trim(), when: head[3].trim(), items: [] }; cats.push(cur); return; }
  if (ln.startsWith('#')) return;
  const c = ln.split('|').map((x) => x.trim());
  if (c.length !== 5 || c.some((x) => !x || x === '—')) { errors.push(`第 ${i + 1} 行要 5 欄（id|來源|中文名|使用時機|關鍵字）、不能空：${ln}`); return; }
  if (!cur) { errors.push(`第 ${i + 1} 行前面沒有類別列`); return; }
  const [id, src, zh, when, tags] = c;
  if (!/^[a-z][a-z0-9-]*$/.test(id)) errors.push(`第 ${i + 1} 行 id「${id}」只能用小寫英數與 -`);
  cur.items.push({ id, src: src === '=' ? id : src, zh, when, tags: tags.split('、').map((t) => t.trim()).filter(Boolean), line: i + 1 });
});
const all = cats.flatMap((c) => c.items.map((it) => Object.assign(it, { cat: c.id })));
const seen = new Map();
for (const it of all) { if (seen.has(it.id)) errors.push(`id「${it.id}」重複（第 ${seen.get(it.id)}、${it.line} 行）`); seen.set(it.id, it.line); }

// ---------- 來源 ----------
function sourceOf(it) {
  if (it.src.startsWith('lucide:')) { const k = it.src.slice(7); return LUCIDE[k] ? { svg: LUCIDE[k], from: `lucide:${k}` } : null; }
  const f = path.join(tablerDir, `${it.src}.svg`);
  return fs.existsSync(f) ? { svg: fs.readFileSync(f, 'utf8'), from: `tabler:${it.src}` } : null;
}
for (const it of all) {
  it.source = sourceOf(it);
  if (it.source) continue;
  const key = it.src.replace(/^lucide:/, '').split('-')[0];
  const near = (it.src.startsWith('lucide:') ? Object.keys(LUCIDE) : tablerNames).filter((n) => n.includes(key)).slice(0, 12);
  errors.push(`第 ${it.line} 行 ${it.id}：來源「${it.src}」找不到${near.length ? ` → 相近的：${near.join('、')}` : ''}`);
}
if (errors.length) { for (const e of errors) console.log(`✖ ${e}`); console.log(`共 ${errors.length} 個問題；${all.length} 個項目、${cats.length} 類`); process.exit(1); }
console.log(`✓ 清單：${all.length} 個項目、${cats.length} 類（${cats.map((c) => `${c.id} ${c.items.length}`).join('、')}）`);
if (checkOnly) process.exit(0);

// ---------- 換畫風 ----------
const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
function arcNums(s) {   // 弧線的兩個旗標可能黏在一起（0 01-2 2）
  const out = []; let i = 0;
  const num = () => { const m = /^[\s,]*(-?\d*\.?\d+(?:e[-+]?\d+)?)/i.exec(s.slice(i)); if (!m) return null; i += m[0].length; return Number(m[1]); };
  const flg = () => { const m = /^[\s,]*([01])/.exec(s.slice(i)); if (!m) return null; i += m[0].length; return Number(m[1]); };
  for (;;) { const a = [num(), num(), num(), flg(), flg(), num(), num()]; if (a.some((v) => v == null)) break; out.push(...a); }
  return out;
}
function pathInfo(d) {   // 一條 path：是不是「一筆畫完、頭尾相接」（可以補填色），外框多大（只看端點，夠用來排大小）
  const segs = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) || [];
  let x = 0, y = 0, cur = null; const subs = [];
  for (const seg of segs) {
    const c = seg[0], U = c.toUpperCase(), rel = c !== U;
    if (U === 'Z') { if (cur) { cur.closed = true; [x, y] = cur.pts[0]; } continue; }
    const nums = U === 'A' ? arcNums(seg.slice(1)) : (seg.slice(1).match(NUM) || []).map(Number);
    const n = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }[U];
    for (let i = 0; i + n <= nums.length; i += n) {
      const a = nums.slice(i, i + n); let nx = x, ny = y;
      if (U === 'H') nx = rel ? x + a[0] : a[0]; else if (U === 'V') ny = rel ? y + a[0] : a[0];
      else { nx = rel ? x + a[n - 2] : a[n - 2]; ny = rel ? y + a[n - 1] : a[n - 1]; }
      if (U === 'M' && i === 0) { cur = { pts: [[nx, ny]], closed: false }; subs.push(cur); } else if (cur) cur.pts.push([nx, ny]);
      x = nx; y = ny;
    }
  }
  let area = 0;
  for (const s of subs) {
    const a = s.pts[0], b = s.pts[s.pts.length - 1];
    if (s.pts.length >= 3 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.02) s.closed = true;
    const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
    area += (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  }
  return { closed: subs.length === 1 && subs[0].closed, area };
}
const GEO = { path: ['d'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points'], polygon: ['points'] };
function shapesOf(svg) {
  const out = [];
  for (const m of svg.replace(/<svg\b[^>]*>/, '').matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*?)\/?>/g)) {
    const [, tag, attrs] = m;
    if (/\bstroke="none"/.test(attrs)) continue;   // Tabler 每張第一條是透明的外框
    const a = {};
    for (const k of GEO[tag]) { const v = attrs.match(new RegExp(`(?:^|\\s)${k}="([^"]*)"`)); if (v) a[k] = v[1].replace(/\s+/g, ' ').trim(); }
    const geo = Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ');
    let closed = false, area = 0;
    if (tag === 'path') ({ closed, area } = pathInfo(a.d || ''));
    else if (tag === 'circle') { closed = true; area = (2 * Number(a.r || 0)) ** 2; }
    else if (tag === 'ellipse') { closed = true; area = 4 * Number(a.rx || 0) * Number(a.ry || 0); }
    else if (tag === 'rect') { closed = true; area = Number(a.width || 0) * Number(a.height || 0); }
    else if (tag === 'polygon') closed = true;
    out.push({ tag, geo, closed, area });
  }
  return out;
}
const LINE = 'stroke="var(--il-line)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"';
export function convert(svg) {
  const shapes = shapesOf(svg), closed = shapes.filter((s) => s.closed).sort((a, b) => b.area - a.area);
  const L = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" fill="none">'];
  if (closed.length) L.push(`  <g class="il-shade" transform="translate(2.2 2.2)">${closed.map((s) => `<${s.tag} ${s.geo} fill="var(--il-accent-soft)"/>`).join('')}</g>`);
  L.push('  <g transform="translate(1 1)">');
  for (const s of closed) L.push(`    <${s.tag} ${s.geo} fill="var(--il-body)"/>`);
  for (const s of shapes) L.push(`    <${s.tag} ${s.geo} ${LINE}/>`);
  L.push('  </g>', '</svg>', '');
  return L.join('\n');
}

// ---------- 寫檔 ----------
const keep = new Set(['catalog.json', 'LICENSE-tabler.txt', 'README.md']);
fs.mkdirSync(OUT, { recursive: true });
for (const c of cats) {
  const dir = path.join(OUT, c.id);
  fs.mkdirSync(dir, { recursive: true });
  const want = new Set(c.items.map((it) => `${it.id}.svg`));
  for (const f of fs.readdirSync(dir)) if (!want.has(f)) fs.unlinkSync(path.join(dir, f));   // 清單拿掉的項目，檔案跟著拿掉
  const items = c.items.map((it) => {
    fs.writeFileSync(path.join(dir, `${it.id}.svg`), convert(it.source.svg));
    return { id: it.id, zh: it.zh, when: it.when, tags: it.tags, file: `${c.id}/${it.id}.svg`, from: it.source.from };
  });
  fs.writeFileSync(path.join(OUT, `${c.id}.json`), `${JSON.stringify({ id: c.id, zh: c.zh, when: c.when, items }, null, 1)}\n`);
  keep.add(`${c.id}.json`); keep.add(c.id);
}
for (const f of fs.readdirSync(OUT)) if (!keep.has(f)) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });   // 拿掉的類別
fs.writeFileSync(path.join(OUT, 'catalog.json'), `${JSON.stringify({
  version: 1, count: all.length,
  how: '先看 categories 的 when 決定翻哪一類，再讀那一類的 <id>.json 挑項目（看 when、tags）；或用工具找：node shared/template/tools/build.mjs --pics 手機,雲端',
  mount: '<div data-illus-src="kit/pics/<類別>/<id>.svg" style="width:320px;height:320px"></div>',
  sources: [
    { name: 'Tabler Icons', license: 'MIT', url: 'https://github.com/tabler/tabler-icons', file: 'LICENSE-tabler.txt' },
    { name: 'Lucide', license: 'ISC', url: 'https://lucide.dev', file: '../LICENSE-lucide.txt' },
  ],
  categories: cats.map((c) => ({ id: c.id, zh: c.zh, when: c.when, count: c.items.length, index: `${c.id}.json` })),
}, null, 1)}\n`);
const lic = path.resolve(tablerDir, '..', '..', 'LICENSE');
if (fs.existsSync(lic)) fs.copyFileSync(lic, path.join(OUT, 'LICENSE-tabler.txt'));
else if (!fs.existsSync(path.join(OUT, 'LICENSE-tabler.txt'))) console.log(`⚠ 找不到 Tabler 的 LICENSE（${lic}）→ 手動放一份到 kit/pics/LICENSE-tabler.txt`);

// ---------- 圖庫頁（給人看；官網的情境庫連過來） ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (c, it) => fs.readFileSync(path.join(OUT, c.id, `${it.id}.svg`), 'utf8').trim();
const page = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>圖庫：${all.length} 個常用物件的線稿</title>
<link rel="stylesheet" href="fonts.css">
<link rel="stylesheet" href="brand.css">
<link rel="stylesheet" href="theme.css">
<link rel="stylesheet" href="scene.css">
<link rel="stylesheet" href="illus.css">
<style>
  html, body { width: auto; height: auto; overflow: visible; }   /* kit 的樣式是給 1920×1080 的畫面用的，這一頁要能照視窗寬度排、能捲 */
  body { margin: 0; padding: 40px 48px 80px; box-sizing: border-box; max-width: 100vw; background: color-mix(in srgb, var(--brand) 5%, #fff); color: #141414; font-family: "Noto Sans TC", system-ui, sans-serif; }
  :root[data-theme="dark"] body { background: #0E1014; color: #F3EFEA; }
  h1 { margin: 0 0 8px; font-size: 32px; }
  .lead { margin: 0 0 12px; font-size: 17px; line-height: 1.7; opacity: 0.8; max-width: 1100px; }
  .bar { display: flex; gap: 12px; align-items: center; margin: 20px 0 8px; position: sticky; top: 0; padding: 12px 0; background: inherit; z-index: 2; }
  .bar input { flex: none; width: 360px; padding: 10px 14px; font: inherit; font-size: 17px; border: 2px solid currentColor; border-radius: 10px; background: transparent; color: inherit; }
  .bar button { padding: 10px 14px; font: inherit; font-size: 15px; border: 2px solid currentColor; border-radius: 10px; background: transparent; color: inherit; cursor: pointer; }
  nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 24px; }
  nav a { padding: 6px 12px; border-radius: 999px; border: 1px solid currentColor; color: inherit; text-decoration: none; font-size: 15px; opacity: 0.85; }
  h2 { margin: 40px 0 4px; font-size: 24px; } h2 code { font-size: 16px; opacity: 0.6; margin-left: 8px; }
  .when { margin: 0 0 16px; opacity: 0.75; font-size: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
  .pic { padding: 14px 12px 12px; border-radius: 14px; background: color-mix(in srgb, currentColor 4%, transparent); text-align: center; cursor: pointer; border: 2px solid transparent; }
  .pic:hover { border-color: var(--brand); }
  .pic .il { width: 112px; height: 112px; margin: 0 auto 8px; } .pic svg { width: 112px; height: 112px; display: block; }
  .pic b { display: block; font-size: 17px; } .pic code { display: block; font-size: 13px; opacity: 0.6; margin: 2px 0 6px; }
  .pic p { margin: 0; font-size: 13px; line-height: 1.5; opacity: 0.8; }
  .pic[hidden] { display: none; }
  #toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); padding: 10px 18px; border-radius: 10px; background: #141414; color: #fff; font-size: 15px; opacity: 0; pointer-events: none; }
</style>
</head>
<body>
<h1>圖庫：${all.length} 個常用物件的線稿</h1>
<p class="lead">講解提到一個具體的東西（手機、雲端、獎盃、行李箱…）時，先到這裡找現成的圖，不用每次重畫。每一張都附「什麼時候用」。點一張會複製它的寫法。AI 用工具找：<code>node shared/template/tools/build.mjs --pics 手機,雲端</code>（不帶詞印目錄）。</p>
<p class="lead">來源：<a href="https://github.com/tabler/tabler-icons">Tabler Icons</a>（MIT）與 <a href="https://lucide.dev">Lucide</a>（ISC）的線條圖示，換成這個工作區的線稿畫風：白色主體、墨線、主色淡影，會跟著主色與亮暗主題變。</p>
<div class="bar"><input id="q" type="search" placeholder="找圖：手機、雲端、獎盃…" aria-label="找圖"><button id="theme" type="button">切換亮色／暗色</button><span id="n"></span></div>
<nav>${cats.map((c) => `<a href="#${c.id}">${esc(c.zh)} ${c.items.length}</a>`).join('')}</nav>
${cats.map((c) => `<section id="${c.id}"><h2>${esc(c.zh)}<code>${c.id}</code></h2><p class="when">${esc(c.when)}</p><div class="grid">
${c.items.map((it) => `<div class="pic" data-k="${esc([it.id, it.zh, ...it.tags].join(' ').toLowerCase())}" data-src="kit/pics/${c.id}/${it.id}.svg"><div class="il">${inline(c, it)}</div><b>${esc(it.zh)}</b><code>${it.id}</code><p>${esc(it.when)}</p></div>`).join('\n')}
</div></section>`).join('\n')}
<div id="toast"></div>
<script>
  var pics = Array.prototype.slice.call(document.querySelectorAll('.pic')), q = document.getElementById('q'), n = document.getElementById('n'), toast = document.getElementById('toast');
  function filter() { var k = q.value.trim().toLowerCase(), c = 0; pics.forEach(function (p) { var ok = !k || p.getAttribute('data-k').indexOf(k) >= 0; p.hidden = !ok; if (ok) c++; }); n.textContent = k ? c + ' 個符合' : ''; }
  q.addEventListener('input', filter);
  document.getElementById('theme').addEventListener('click', function () { var r = document.documentElement; r.setAttribute('data-theme', r.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); });
  pics.forEach(function (p) { p.addEventListener('click', function () {
    var t = '<div data-illus-src="' + p.getAttribute('data-src') + '" style="width:320px;height:320px"></div>';
    try { navigator.clipboard.writeText(t); } catch (e) {}
    toast.textContent = '已複製：' + t; toast.style.opacity = 1; setTimeout(function () { toast.style.opacity = 0; }, 1600);
  }); });
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(KIT, 'pics-gallery.html'), page);
console.log(`✓ 寫好 ${path.relative(ROOT, OUT)}/（${all.length} 張）與 ${path.relative(ROOT, path.join(KIT, 'pics-gallery.html'))}`);

if (sheet) {
  const { htmlShot } = await import(path.join(ROOT, 'shared', 'template', 'tools', 'lib', 'raster.mjs'));
  const { findChrome } = await import(path.join(ROOT, 'shared', 'template', 'tools', 'lib', 'audit-browser.mjs'));
  const cols = 20, cell = 92, rows = Math.ceil(all.length / cols);
  const tmp = path.join(KIT, '.pics-sheet.html');
  fs.writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8">${['brand.css', 'theme.css', 'scene.css', 'illus.css'].map((f) => `<link rel="stylesheet" href="${f}">`).join('')}
<style>body{margin:0;padding:16px;background:color-mix(in srgb,var(--brand) 5%,#fff);display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:4px}div{width:${cell}px;height:${cell}px}svg{width:${cell - 12}px;height:${cell - 12}px;margin:6px;display:block}</style></head>
<body>${cats.flatMap((c) => c.items.map((it) => `<div>${inline(c, it)}</div>`)).join('')}</body></html>`);
  htmlShot({ chrome: findChrome({}), file: tmp, out: path.resolve(sheet), width: 32 + cols * (cell + 4), height: 32 + rows * (cell + 4) });
  fs.unlinkSync(tmp);
  console.log(`✓ 總覽圖 ${path.resolve(sheet)}`);
}

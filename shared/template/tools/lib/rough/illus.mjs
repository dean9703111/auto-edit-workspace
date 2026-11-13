// illus-lint／illus-show：專案自己畫的示意插圖元件
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { textWidth as tw } from '../time.mjs';
import { KIT_LINKS } from '../main.mjs';
import { lintIllusSvg } from '../illus-lint.mjs';
import { escHtml, rel } from './util.mjs';

// ---------- illus-lint：專案自己畫的示意插圖元件（work/hyperframes/illus-local/*.svg） ----------

const mdCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const unTick = (s) => String(s).replace(/`/g, '');

// work/storyboard.md 的插圖清單（`#### 插圖清單 <段 id>` 底下、表頭有「元件」「來源」兩欄的表；每段一張）。
// 舊名「素材清單」也認（表前最近的標題或上一行有這四個字就算）：
//   來源是「新建 SVG」的列 → local：name → { name, size: [w, h] | null, states, label }（「規格：<name>，建議尺寸 W×H，狀態 a／b」）
//   來源是「畫廊」的列 → gallery：[{ name, attrs, label }]（「怎麼來」的 data-illus="…" data-…="…"）；圖示組合的列不管
const ILLUS_LIST_TITLE = /插圖清單|素材清單/;
export function readIllusList(md) {
  const local = new Map(), gallery = [];
  const lines = String(md || '').split(/\r?\n/);
  let heading = '', prev = '';
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i])) {
      if (/^\s*#{1,6}\s/.test(lines[i])) heading = lines[i];
      if (lines[i].trim()) prev = lines[i];
      continue;
    }
    const head = mdCells(lines[i]), iSrc = head.findIndex((c) => /^來源/.test(c));
    const isList = iSrc >= 0 && head.some((c) => /^元件/.test(c)) && (ILLUS_LIST_TITLE.test(heading) || ILLUS_LIST_TITLE.test(prev));
    let j = i + 1;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      if (!isList) continue;
      const c = mdCells(lines[j]), row = c.join('｜'), src = c[iSrc] || '';
      if (/^[\s:-]*$/.test(c.join(''))) continue;
      if (/新建/.test(src)) {
        const name = (row.match(/規格[：:]\s*`?([a-z][A-Za-z0-9]*)/) || unTick(c[0]).match(/^([a-z][A-Za-z0-9]*)/) || [])[1];
        if (!name || local.has(name)) continue;
        const sz = row.match(/尺寸[^\d｜]*(\d+)\s*[×xX]\s*(\d+)/) || row.match(/(\d+)\s*[×xX]\s*(\d+)/);
        const st = ((row.match(/狀態[：:]?([^｜]*)/) || [])[1] || '').split('描述')[0].replace(/（[^）]*）|\([^)]*\)/g, '');
        const states = unTick(st).split(/[／/、,，;；\s]+/).map((s) => s.replace(/^\.?(il-)?/, '')).filter((s) => /^[a-z][\w-]*$/.test(s));
        local.set(name, { name, size: sz ? [+sz[1], +sz[2]] : null, states, label: unTick(c[0]) });
      } else if (/畫廊/.test(src)) {
        const attrs = Object.fromEntries([...row.matchAll(/data-([a-z][a-z-]*)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
        const name = attrs.illus || (unTick(c[0]).match(/^([a-z][A-Za-z0-9]*)/) || [])[1];
        delete attrs.illus;
        if (name) gallery.push({ name, attrs, label: unTick(c[0]) });
      }
    }
    i = j - 1;
  }
  return { local, gallery };
}

// 在 Node 跑 kit/illus.js（vm），借它自己的 mount 把 data-* 轉成 opts：回傳 (name, attrs) → SVG 字串（不認得的元件回 ''）
function illusInNode(kitDir) {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  sb.window = sb;
  sb.document = { querySelectorAll: () => [] };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(kitDir, 'illus.js'), 'utf8'), sb);
  const svgOf = (name, attrs) => {
    const dataset = { illus: name };
    for (const [k, v] of Object.entries(attrs)) dataset[k.replace(/-([a-z])/g, (_, x) => x.toUpperCase())] = v;
    const el = { dataset, innerHTML: '', hasAttribute: (a) => a === 'data-illus', classList: { contains: () => false, add() {} } };
    sb.ILLUS.mount({ querySelectorAll: () => [el] });
    return el.innerHTML;
  };
  // 畫廊有哪些元件（illus-show 找不到時列給它看）：ILLUS 上除了 mount、register、textWidth 這幾個方法都是元件
  svgOf.names = Object.keys(sb.ILLUS).filter((k) => typeof sb.ILLUS[k] === 'function' && !['mount', 'register', 'textWidth'].includes(k));
  return svgOf;
}

// media.mjs illus-show：印畫廊元件的 SVG（派工訊息貼參考；取代 illus-worker.md 那段 node -e）。opts＝"screen=rec;bars=5"（也收 {screen:'rec'} 的寫法）
export function illusShow(templateDir, name, opts = '') {
  const svgOf = illusInNode(path.join(templateDir, 'kit'));
  if (!name) throw new Error(`要寫元件名 → node shared/template/tools/media.mjs illus-show <元件>；有：${svgOf.names.join('、')}`);
  if (!svgOf.names.includes(name)) throw new Error(`畫廊沒有「${name}」這個元件 → 元件名照 shared/template/kit/illus-gallery.jpg 每格下面的寫法；有：${svgOf.names.join('、')}`);
  const attrs = {};
  for (const part of String(opts || '').trim().replace(/^\{|\}$/g, '').split(/[;,]/).map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^([A-Za-z][\w-]*)\s*[=:]\s*(.*)$/);
    if (!m) throw new Error(`--opts 看不懂「${part}」→ 寫成 "screen=rec"，多個用 ; 隔開`);
    attrs[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  const svg = svgOf(name, attrs);
  if (!svg) throw new Error(`「${name}」畫不出來（opts：${opts || '無'}）→ 拿掉 --opts 再試；還是不行就回報這行`);
  return svg;
}
const viewBoxSize = (svg) => { const m = String(svg).match(/viewBox="\s*0[\s,]+0[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/); return m ? [+m[1], +m[2]] : null; };

const IL_SHEET = { W: 1920, PAD: 40, GAP: 48, TOP: 92, LAB: 64, BG: { light: '#FEF7F3', dark: '#1A191C' }, INK: { light: '#141414', dark: '#F3EFEA' } };
const IL_MIME = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.json': 'application/json' };

// work/插圖清單.jpg：插圖清單用到的畫廊元件＋illus-local 的新元件，1:1 px、同底色；上一列亮色主題、下一列暗色主題（HyperFrames 的 Chrome 截圖）
async function illusSheet(P, { list, files, dir, out = path.join(P.project, 'work', '插圖清單.jpg') }) {
  const warns = [], items = [], seen = new Set();
  const kitDir = path.join(P.templateDir, 'kit');
  const svgOf = illusInNode(kitDir);
  for (const g of list.gallery) {
    const attr = [`data-illus="${escHtml(g.name)}"`, ...Object.entries(g.attrs).map(([k, v]) => `data-${k}="${escHtml(v)}"`)].join(' ');
    if (seen.has(attr)) continue;
    seen.add(attr);
    const vb = viewBoxSize(svgOf(g.name, g.attrs));
    if (!vb) { warns.push(['插圖清單', `畫廊沒有「${g.name}」這個元件`, '改成 shared/template/kit/illus-gallery.jpg 上的名稱，或把來源改成「新建 SVG」']); continue; }
    items.push({ w: vb[0], h: vb[1], label: g.label || g.name, how: `畫廊 ${attr}`, attr });
  }
  const nGallery = items.length, shown = new Set();
  for (const f of files) {
    const name = f.replace(/\.svg$/i, ''), vb = viewBoxSize(fs.readFileSync(path.join(dir, f), 'utf8')) || [200, 200];
    const spec = list.local.get(name), label = spec?.label || name, src = `data-illus-src="illus-local/${escHtml(f)}"`;
    items.push({ w: vb[0], h: vb[1], label, how: `新建 illus-local/${f}`, attr: src });
    // 插圖清單寫了狀態：每個狀態多一格（那個 .il-<狀態> 打開）
    for (const st of spec?.states || []) { shown.add(st); items.push({ w: vb[0], h: vb[1], label: `${label} .il-${st}`, how: `新建 illus-local/${f}（狀態 ${st}）`, attr: `${src} data-show="${st}"` }); }
  }
  if (!items.length) return { warns, sheet: null };
  // 排版在 Node 算好（每格寬＝元件寬與兩行標籤取大者），頁高固定，不用量
  let x = IL_SHEET.PAD, y = IL_SHEET.TOP, rowH = 0;
  const cells = [];
  for (const it of items) {
    const cw = Math.ceil(Math.max(it.w, tw(it.label) * 20, it.how.length * 8, 120));
    if (x > IL_SHEET.PAD && x + cw > IL_SHEET.W - IL_SHEET.PAD) { x = IL_SHEET.PAD; y += rowH + IL_SHEET.GAP; rowH = 0; }
    cells.push({ ...it, x, y });
    x += cw + IL_SHEET.GAP;
    rowH = Math.max(rowH, Math.ceil(it.h) + IL_SHEET.LAB);
  }
  const H = y + rowH + IL_SHEET.PAD;
  const page = (theme) => `<!doctype html><html lang="zh-Hant"${theme === 'dark' ? ' data-theme="dark"' : ''}><head><meta charset="utf-8">
${KIT_LINKS.map((l) => `<link rel="stylesheet" href="${l}">`).join('\n')}
<style>html,body{margin:0;width:${IL_SHEET.W}px;height:${H}px;overflow:hidden;background:${IL_SHEET.BG[theme]};color:${IL_SHEET.INK[theme]};font-family:var(--font-cjk,sans-serif)}
h2{position:absolute;left:${IL_SHEET.PAD}px;top:24px;margin:0;font-size:30px;font-weight:700}.cell{position:absolute}.box{position:relative}
.cell b{display:block;margin-top:12px;font-size:20px;font-weight:700;white-space:nowrap}.cell code{display:block;font:13px/1.5 ui-monospace,Menlo,monospace;opacity:.7;white-space:nowrap}
${[...shown].map((st) => `.box[data-show="${st}"] .il-${st}{opacity:1!important}`).join('')}</style></head><body>
<h2>${theme === 'dark' ? '暗色主題（data-theme="dark"）' : '亮色主題'}｜畫廊 ${nGallery} 個、新建 ${files.length} 個（1:1 px）</h2>
${cells.map((c) => `<div class="cell" style="left:${c.x}px;top:${c.y}px"><div class="box" style="width:${c.w}px;height:${c.h}px" ${c.attr}></div><b>${escHtml(c.label)}</b><code>${escHtml(c.how)}</code></div>`).join('\n')}
<script src="kit/illus.js"></script></body></html>`;
  const pages = {
    'sheet.html': `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}iframe{display:block;border:0;width:${IL_SHEET.W}px;height:${H}px}</style></head><body><iframe src="light.html"></iframe><iframe src="dark.html"></iframe></body></html>`,
    'light.html': page('light'), 'dark.html': page('dark'),
  };
  const { findChrome } = await import('../audit-browser.mjs');
  const chrome = findChrome();
  if (!chrome) { warns.push(['插圖清單.jpg', '沒拼：找不到 HyperFrames 的 Chrome', '在工作區根目錄跑 npx -y hyperframes browser ensure，再跑一次 illus-lint']); return { warns, sheet: null }; }
  const roots = [['kit/', kitDir], ['illus-local/', dir]];
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, ''); } catch { res.writeHead(400); res.end(); return; }
    if (pages[p] != null) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(pages[p]); return; }
    for (const [pre, base] of roots) {
      if (!p.startsWith(pre)) continue;
      const f = path.resolve(base, p.slice(pre.length));
      if (f.startsWith(path.resolve(base) + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { 'Content-Type': IL_MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(f).pipe(res);
        return;
      }
    }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'illus-sheet-'));
  const png = path.join(tmp, 'sheet.png');
  try {
    await new Promise((resolve, reject) => {
      const cp = spawn(chrome, ['--headless', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', `--user-data-dir=${path.join(tmp, 'u')}`,
        '--virtual-time-budget=8000', `--screenshot=${png}`, `--window-size=${IL_SHEET.W},${2 * H}`, `http://127.0.0.1:${server.address().port}/sheet.html`], { stdio: 'ignore' });
      const timer = setTimeout(() => cp.kill('SIGKILL'), 120000);
      cp.on('error', reject);
      cp.on('exit', (code) => { clearTimeout(timer); code === 0 && fs.existsSync(png) ? resolve() : reject(new Error(`Chrome 截圖失敗（結束碼 ${code}）`)); });
    });
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '3', out], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg 轉 jpg 失敗：${r.stderr.trim()}`);
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { warns, sheet: { file: out, width: IL_SHEET.W, height: 2 * H, gallery: nGallery, local: files.length } };
}

// media.mjs illus-lint：每個 illus-local/*.svg 跑 lintIllusSvg（尺寸、狀態照插圖清單）；插圖清單的新建 SVG 沒有檔 ✖；順便拼 work/插圖清單.jpg
// --only 拼圖的比例尺：線粗、圓角、用色要和這幾個畫廊元件看起來是同一套
const IL_REF = ['phone', 'laptop', 'cloud'].map((name) => ({ name, attrs: {}, label: `畫廊 ${name}（比對用）` }));
export async function illusLint(P, { sheet = true, only = null, states = null, log = console.log } = {}) {
  // --states：派工的規格寫了哪些狀態（插圖清單可能還沒寫這一列）；只對 --only 那一個檔有意義
  const want = states == null ? [] : String(states).split(/[／/、,，;；\s]+/).map((s) => s.replace(/^\.?(il-)?/, '')).filter(Boolean);
  if (states != null && !only) throw new Error('--states 要和 --only 一起用 → node shared/template/tools/media.mjs illus-lint --project <專案> --only <名稱> --states a,b');
  const badState = want.find((s) => !/^[a-z][\w-]*$/.test(s));
  if (badState) throw new Error(`--states 的「${badState}」不是狀態名 → 小寫英文開頭，多個用逗號隔開（例 --states led,warn）`);
  const work = path.join(P.project, 'work'), dir = path.join(work, 'hyperframes', 'illus-local'), sb = path.join(work, 'storyboard.md');
  // 插圖清單：分鏡表＋內容設計動畫的鏡位腳本（work/designs/<段>.md；設計師自己新畫的元件寫在那裡）
  const dsDir = path.join(work, 'designs');
  const designMd = fs.existsSync(dsDir) ? fs.readdirSync(dsDir).filter((f) => /\.md$/.test(f)).sort().map((f) => fs.readFileSync(path.join(dsDir, f), 'utf8')) : [];
  const list = readIllusList([fs.existsSync(sb) ? fs.readFileSync(sb, 'utf8') : '', ...designMd].join('\n\n'));
  let files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.svg$/i.test(f) && !f.startsWith('.')).sort() : [];
  const one = only ? String(only).replace(/^.*illus-local\//, '').replace(/\.svg$/i, '') : null;
  if (one) {
    if (!files.includes(`${one}.svg`)) {
      log(`✖ 找不到 ${rel(path.join(dir, `${one}.svg`))} → 照 shared/template/kit/illus-style.md 畫好存成這個檔，再跑一次（--only 寫檔名，不含 .svg）`);
      return { ok: false, findings: [], files: [], sheet: null };
    }
    files = [`${one}.svg`];
  }
  const findings = [];
  const add = (level, where, msg, fix) => findings.push({ level, where, msg, fix });
  for (const f of files) {
    const name = f.replace(/\.svg$/i, ''), spec = list.local.get(name);
    const st = [...new Set([...(spec?.states || []), ...want])];
    if (!spec?.size) add('warn', `illus-local/${f}`, `${name}：work/storyboard.md、work/designs/*.md 的插圖清單${spec ? '這一列沒寫建議尺寸' : '沒有這個元件的「新建 SVG」列'}，這次只查不用尺寸${spec || want.length ? '' : '、狀態'}的規則`, `插圖清單那一列的「怎麼來」寫「規格：${name}，建議尺寸 W×H，狀態 a／b」（shared/template/kit/illus-style.md）`);
    for (const x of lintIllusSvg(fs.readFileSync(path.join(dir, f), 'utf8'), { name, size: spec?.size || undefined, states: st })) add(x.level, `illus-local/${f}`, x.msg, x.fix);
  }
  // 拼圖也要看得到 --states 的每個狀態
  if (one && want.length) {
    const spec = list.local.get(one);
    list.local.set(one, { name: one, size: null, label: one, ...spec, states: [...new Set([...(spec?.states || []), ...want])] });
  }
  for (const name of list.local.keys()) {
    if (one && name !== one) continue;
    if (!files.includes(`${name}.svg`)) add('error', '插圖清單', `新建 SVG「${name}」還沒有檔`, `照 shared/template/kit/illus-style.md 畫好，存成 work/hyperframes/illus-local/${name}.svg，再跑一次 illus-lint`);
  }
  const s = !sheet ? { warns: [], sheet: null }
    : one ? await illusSheet(P, { list: { ...list, gallery: IL_REF }, files, dir, out: path.join(work, `插圖清單-${one}.jpg`) })
      : await illusSheet(P, { list, files, dir });
  for (const [where, msg, fix] of s.warns) add('warn', where, msg, fix);
  log(files.length ? `illus-local：${files.length} 個 SVG（${rel(dir)}）` : 'illus-local：無');
  findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  for (const x of findings) log(`${x.level === 'error' ? '✖' : '⚠'} [${x.where}] ${x.msg} → ${x.fix}`);
  for (const f of files) if (!findings.some((x) => x.where === `illus-local/${f}`)) log(`✓ illus-local/${f}`);
  if (s.sheet) log(`${path.basename(s.sheet.file)}：${rel(s.sheet.file)}（${s.sheet.width}×${s.sheet.height}；畫廊 ${s.sheet.gallery} 個、新建 ${s.sheet.local} 個；上亮下暗）→ 打開看線粗、圓角、用色和畫廊元件是不是同一套`);
  const ne = findings.filter((x) => x.level === 'error').length, nw = findings.length - ne;
  log('');
  log(ne ? `未通過：${ne} 個錯誤（✖），${nw} 個提醒（⚠）。照 → 後面的改法改 SVG 或插圖清單，再跑一次 illus-lint。` : `通過：${files.length ? `${files.length} 個 SVG` : '沒有要查的 SVG'}，${nw} 個提醒（⚠）。`);
  return { ok: !ne, findings, files, sheet: s.sheet };
}

#!/usr/bin/env node
// README 與官網的三張說明圖（作者維護用；剪片時不要跑）。只寫 dev/site/guides/，不讀寫使用者專案。
//
//   node dev/tools/docs-figures.mjs
//
//   layout-rhythm.svg   版面節奏：開頭 30 秒字卡 → 半螢幕一次至少 15 秒 → 子母畫面一次至少 45 秒（數字讀 lib/layout-rhythm.mjs 的 RHYTHM）
//   speaker-side.svg    講者在左、中、右時，字卡和半螢幕面板各放哪一邊（照 lib/speaker-side.mjs 的 sideLayout 算）
//   pics.jpg            圖庫一覽：每一類挑幾張，下面標中文名（要 HyperFrames 的 Chrome；沒有就跳過）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const WS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS = path.join(WS, 'shared', 'template', 'tools'), KIT = path.join(WS, 'shared', 'template', 'kit');
const OUT = path.join(WS, 'dev', 'site', 'guides');
const { RHYTHM } = await import(path.join(TOOLS, 'lib', 'layout-rhythm.mjs'));
const { sideLayout } = await import(path.join(TOOLS, 'lib', 'speaker-side.mjs'));
const { CANVAS } = await import(path.join(TOOLS, 'lib', 'canvas.mjs'));
const { loadPics } = await import(path.join(TOOLS, 'lib', 'pics.mjs'));

const C = { bg: '#090D17', card: '#121A2B', line: '#2D3950', text: '#F4F5F8', muted: '#B6C1D5', orange: '#FF791F', green: '#82D9B0', frame: '#0B111E', skin: '#C3CEDF', paper: '#F6ECE0' };
const t = (x, y, s, size = 24, fill = C.text, weight = 500, anchor = 'start') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${s}</text>`;
const box = (x, y, w, h, fill = C.card, r = 16, stroke = C.line) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
const svg = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title"><title id="title">${title}</title><rect width="100%" height="100%" rx="24" fill="${C.bg}"/><g font-family="'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif">${body}</g></svg>\n`;
// 一個人（頭＋肩）：cx＝中心、by＝底、s＝大小
const person = (cx, by, s) => `<circle cx="${cx}" cy="${by - s * 1.55}" r="${s * 0.42}" fill="${C.skin}"/><path d="M${cx - s * 0.95} ${by}q0 -${s} ${s * 0.95} -${s}t${s * 0.95} ${s}z" fill="${C.skin}"/>`;
// 小畫面（16:9）：mode＝card｜half｜pip；side＝講者在哪一邊（left｜center｜right）
function frame(x, y, w, mode, side = 'center') {
  const h = Math.round(w * 9 / 16), k = w / 1920;
  const W = 1920, box0 = side === 'left' ? [280, 220, 760, 1000] : side === 'right' ? [1160, 220, 1640, 1000] : [720, 220, 1200, 1000];
  const sl = sideLayout(box0, CANVAS.landscape, {});
  let b = box(x, y, w, h, '#1B2940', 10);
  const clip = `c${Math.round(x)}-${Math.round(y)}`;
  b += `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/></clipPath><g clip-path="url(#${clip})">`;
  if (mode === 'card') {
    b += person(x + sl.cx * k, y + h, h * 0.42);
    const cw = 0.4 * w, cx = sl.cardSide === 'right' ? x + w - cw - 0.06 * w : x + 0.06 * w;
    b += box(cx, y + h * 0.56, cw, h * 0.24, C.paper, 6, 'none') + box(cx + 10, y + h * 0.56 + 10, cw * 0.38, 9, C.orange, 3, 'none') + `<path d="M${cx + 10} ${y + h * 0.56 + 34}h${cw - 20}" stroke="#A8A093" stroke-width="4" stroke-linecap="round"/>`;
  } else if (mode === 'half') {
    const pw = w / 2, px = sl.panelSide === 'right' ? x + pw : x;
    const shift = sl.shift * k;
    b += person(x + sl.cx * k + shift, y + h, h * 0.42);
    b += `<rect x="${px}" y="${y}" width="${pw}" height="${h}" fill="${C.paper}"/><rect x="${sl.panelSide === 'right' ? px : px + pw - 5}" y="${y}" width="5" height="${h}" fill="${C.orange}"/>`;
    for (let i = 0; i < 3; i++) b += `<circle cx="${px + 22}" cy="${y + h * 0.3 + i * h * 0.2}" r="7" fill="${C.orange}"/><path d="M${px + 38} ${y + h * 0.3 + i * h * 0.2}h${pw - 62 - i * 14}" stroke="#A8A093" stroke-width="4" stroke-linecap="round"/>`;
  } else {
    b += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F4EADC"/>`;
    b += box(x + 0.06 * w, y + 0.16 * h, 0.6 * w, 0.62 * h, '#FFFFFF', 6, 'none') + box(x + 0.06 * w, y + 0.16 * h, 0.6 * w, 0.16 * h, C.orange, 6, 'none');
    for (let i = 0; i < 3; i++) b += `<rect x="${x + 0.1 * w + i * 0.18 * w}" y="${y + 0.44 * h}" width="${0.13 * w}" height="${0.22 * h}" rx="5" fill="#E8DFD2"/>`;
    const pw = 0.24 * w, ph = pw * 0.72, px = x + w - pw - 0.03 * w, py = y + h - ph - 0.05 * h;
    b += box(px, py, pw, ph, '#1B2940', 5, C.orange) + person(px + pw / 2, py + ph, ph * 0.4);
  }
  return `${b}</g>`;
}

// ---------- 版面節奏 ----------
function rhythm(mobile = false) {
  const w = mobile ? 440 : 1320, pad = 32;
  let b = t(pad, 50, '畫面不亂跳：版面節奏', mobile ? 30 : 38, C.text, 800) + t(pad, 84, '切進去就待夠久，不會馬上又切回來', mobile ? 19 : 23, C.muted);
  const parts = [
    ['card', `開頭 ${RHYTHM.intro} 秒`, '字卡為主', '講者滿版露臉，先讓觀眾認識你'],
    ['half', `一次至少 ${RHYTHM.half} 秒`, '半螢幕', '講者讓到一邊，另一半放條列重點'],
    ['pip', `一次至少 ${RHYTHM.pip} 秒`, '子母畫面', '動畫佔滿畫面，講者縮成小視窗'],
  ];
  if (mobile) {
    parts.forEach(([mode, rule, name, desc], i) => {
      const y = 112 + i * 330;
      b += box(24, y, 392, 306) + frame(44, y + 20, 352, mode) + t(44, y + 250, name, 26, C.text, 800) + t(396, y + 250, rule, 20, C.orange, 700, 'end') + t(44, y + 284, desc, 17, C.muted);
    });
    return svg(w, 112 + 3 * 330 + 60, '版面節奏：開頭三十秒字卡、半螢幕至少十五秒、子母畫面至少四十五秒', b + t(pad, 112 + 3 * 330 + 24, '太短的段，AI 會併進前後或改回字卡', 18, C.green));
  }
  parts.forEach(([mode, rule, name, desc], i) => {
    const x = pad + i * 426;
    b += box(x, 116, 392, 318) + frame(x + 20, 136, 352, mode) + t(x + 20, 368, name, 28, C.text, 800) + t(x + 372, 368, rule, 21, C.orange, 700, 'end') + t(x + 20, 404, desc, 18, C.muted);
  });
  // 時間軸：0:00 – 2:00 的一個例子
  const x0 = pad, x1 = w - pad, y = 506, total = 120, X = (s) => x0 + (x1 - x0) * s / total;
  b += t(pad, 482, '一支片的前兩分鐘可能長這樣', 21, C.muted);
  const blocks = [[0, 30, 'card', '字卡'], [30, 80, 'pip', '子母畫面 50 秒'], [80, 98, 'half', '半螢幕 18 秒'], [98, 120, 'card', '字卡']];
  for (const [a, z, mode, label] of blocks) {
    const fill = mode === 'pip' ? C.orange : mode === 'half' ? '#38577D' : '#26344C';
    b += `<rect x="${X(a) + 2}" y="${y}" width="${X(z) - X(a) - 4}" height="56" rx="10" fill="${fill}"/>` + t((X(a) + X(z)) / 2, y + 36, label, 21, mode === 'pip' ? C.bg : C.text, 700, 'middle');
  }
  for (const s of [0, 30, 60, 90, 120]) b += `<path d="M${X(s)} ${y + 62}v10" stroke="${C.muted}" stroke-width="2"/>` + t(X(s), y + 98, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 18, C.muted, 500, s === 0 ? 'start' : s === 120 ? 'end' : 'middle');
  b += t(pad, y + 140, '排不到這個長度的段，AI 會併進前後的段，或改回疊在講者上的字卡；檢查時不合會列出來', 20, C.green);
  return svg(w, y + 172, '版面節奏：開頭三十秒字卡、半螢幕至少十五秒、子母畫面至少四十五秒', b);
}

// ---------- 講者位置 ----------
function sides(mobile = false) {
  const w = mobile ? 440 : 1320, pad = 32;
  let b = t(pad, 50, '講者站哪邊，版面跟著換', mobile ? 30 : 38, C.text, 800) + t(pad, 84, '量一次講者的位置，字卡和面板自動放到另一邊', mobile ? 18 : 23, C.muted);
  const rows = [['left', '講者在左', '字卡靠右；面板從右邊出來'], ['center', '講者在中間', '字卡靠左；面板在左，講者往右讓'], ['right', '講者在右', '字卡靠左；面板在左，講者幾乎不用動']];
  rows.forEach(([side, name, desc], i) => {
    const x = mobile ? 24 : pad + i * 426, y = mobile ? 112 + i * 470 : 116, fw = 170;
    b += box(x, y, 392, mobile ? 446 : 446);
    b += t(x + 20, y + 44, name, 27, C.text, 800) + t(x + 20, y + 76, desc, 17, C.muted);
    b += frame(x + 20, y + 100, 352, 'card', side) + t(x + 20, y + 100 + 198 + 26, '字卡', 18, C.green, 700);
    b += frame(x + 20 + 0, y + 336, fw, 'half', side) + frame(x + 20 + fw + 12, y + 336, fw, 'pip', side);
    b += t(x + 20, y + 336 + 96 + 2, '', 1);
  });
  const h = mobile ? 112 + 3 * 470 + 20 : 116 + 446 + 60;
  if (!mobile) b += t(pad, h - 24, '下排左：半螢幕；右：子母畫面（小視窗固定在右下）。可以在設定裡指定左、中、右，蓋到臉時檢查會擋下來', 19, C.green);
  return svg(w, h, '講者在左、中、右時，字卡與半螢幕面板的位置', b);
}

fs.mkdirSync(OUT, { recursive: true });
const written = [];
for (const [name, fn] of [['layout-rhythm', rhythm], ['speaker-side', sides]]) {
  fs.writeFileSync(path.join(OUT, `${name}.svg`), fn(false));
  fs.writeFileSync(path.join(OUT, `${name}-mobile.svg`), fn(true));
  written.push(`${name}.svg`, `${name}-mobile.svg`);
}

// ---------- 圖庫一覽 ----------
const lib = loadPics(KIT);
if (lib) {
  const { htmlShot } = await import(path.join(TOOLS, 'lib', 'raster.mjs'));
  const { findChrome } = await import(path.join(TOOLS, 'lib', 'audit-browser.mjs'));
  let chrome = null;
  try { chrome = findChrome({}); } catch { chrome = null; }
  if (chrome) {
    const per = 6, cols = 12;
    const cells = lib.cats.flatMap((c) => lib.items.filter((x) => x.cat === c.id).slice(0, per));
    const rows = Math.ceil(cells.length / cols), cw = 124, chh = 150, W = 48 + cols * cw, H = 150 + rows * chh + 28;
    const tmp = path.join(KIT, '.pics-figure.html');
    fs.writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8">${['fonts.css', 'brand.css', 'theme.css', 'scene.css', 'illus.css'].map((f) => `<link rel="stylesheet" href="${f}">`).join('')}
<style>
  body { margin: 0; width: ${W}px; height: ${H}px; box-sizing: border-box; padding: 28px 24px; background: color-mix(in srgb, var(--brand) 5%, #fff); color: #141414; font-family: "Noto Sans TC", sans-serif; overflow: hidden; }
  h1 { margin: 0 0 6px; font-size: 34px; font-weight: 900; } p { margin: 0 0 20px; font-size: 19px; opacity: 0.75; }
  .g { display: grid; grid-template-columns: repeat(${cols}, ${cw}px); }
  .c { height: ${chh}px; text-align: center; font-size: 17px; font-weight: 700; } .c svg { width: 92px; height: 92px; display: block; margin: 8px auto 6px; }
</style></head><body><h1>圖庫：${lib.items.length} 個常用物件的線稿</h1><p>分 ${lib.cats.length} 類，每一張都寫了什麼時候用；顏色跟著主色與亮暗主題</p>
<div class="g">${cells.map((it) => `<div class="c">${fs.readFileSync(path.join(KIT, 'pics', it.file), 'utf8')}${it.zh}</div>`).join('')}</div></body></html>`);
    const png = path.join(OUT, 'pics.png');
    htmlShot({ chrome, file: tmp, out: png, width: W, height: H });
    fs.unlinkSync(tmp);
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', png, '-q:v', '3', path.join(OUT, 'pics.jpg')], { encoding: 'utf8' });
    fs.unlinkSync(png);
    if (r.status === 0) written.push('pics.jpg'); else console.log(`⚠ pics.jpg 沒做出來：${r.stderr}`);
    const dimFile = path.join(OUT, 'dimensions.json'), dims = JSON.parse(fs.readFileSync(dimFile, 'utf8'));
    dims.pics = { width: W, height: H };
    fs.writeFileSync(dimFile, `${JSON.stringify(dims, null, 2)}\n`);
  } else console.log('⚠ 找不到 Chrome，pics.jpg 跳過（npx hyperframes browser ensure）');
}
console.log(`✓ dev/site/guides/：${written.join('、')}`);

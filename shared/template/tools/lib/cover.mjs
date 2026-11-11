// 封面圖（025）：從剪好的影片抓一格講者，去背後排成三種版型的封面，一個標題出三張讓使用者挑。
// 橫式專案 1920×1080（YouTube 縮圖）；直式專案 1080×1920，標題和臉都放在中間 3:4（1080×1440）裡，動態牆裁成 3:4 也看得到。
//
//   parseTitle('讓 AI 幫你|*剪片*') → [[{ t, hi }]]：| 換行，*詞* 是要強調的詞
//   lineEm(line)                     → 這一行有幾個字寬（全形 1、半形 0.56）
//   fitSize(lines, w, h, max)        → 放得進 w×h 的字級（px）
//   place({ CW, CH, ar, NW, NH, box, tx, ty, zoom, maxTop }) → { left, top, width, height }：畫面放大 zoom 倍後，講者框中心對到 tx、頭頂對到 ty
//   coverHtml({ layout, format, title, kicker, frame, cutout, ar, speakerBox, kit }) → html（layout：a 人物跳出、b 色塊分割、c 底部標題）
//   candidateTimes(dur, n)           → 候選格的時間
//   makeCovers({ project, templateDir, root, title, kicker, at, log, remove }) → { files, at, cutout, sheet }
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { probeMedia } from './ff.mjs';
import { htmlShot } from './raster.mjs';
import { matteWeights, MATTE } from './matte.mjs';

export const COVER = { layouts: ['a', 'b', 'c'], names: { a: '人物跳出', b: '色塊分割', c: '底部標題' }, lines: 3, lineMax: 9, candidates: 8 };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export function parseTitle(s) {
  return String(s || '').split('|').map((l) => l.trim()).filter(Boolean).map((l) => {
    const out = [];
    l.split(/(\*[^*]+\*)/).filter(Boolean).forEach((p) => out.push(/^\*[^*]+\*$/.test(p) ? { t: p.slice(1, -1), hi: true } : { t: p, hi: false }));
    return out;
  });
}
export const lineEm = (line) => [...line.map((p) => p.t).join('')].reduce((s, ch) => s + (/[\u0000-ÿ]/.test(ch) ? (ch === ' ' ? 0.3 : 0.56) : 1), 0) + line.filter((p) => p.hi).length * 0.3;
export function fitSize(lines, w, h, max) {
  const em = Math.max(1, ...lines.map(lineEm));
  return Math.floor(Math.min(max, w / em, h / (lines.length * 1.24)));
}

export function place({ CW, CH, ar, NW, NH, box, tx, ty = null, zoom = 1, maxTop = 0 }) {
  const width = Math.max(CW, CH * ar) * zoom, height = width / ar;
  const cx = box ? (box[0] + box[2]) / 2 / NW : 0.5, top0 = box ? box[1] / NH : 0.1;
  return {
    left: r1(clamp(tx - cx * width, CW - width, 0)),
    top: r1(ty == null ? (CH - height) / 2 : clamp(ty - top0 * height, CH - height, maxTop)),   // maxTop > 0：畫面可以往下推、上面留給標題（直式）
    width: r1(width), height: r1(height),
  };
}

const titleHtml = (lines) => lines.map((l) => `<div class="ln">${l.map((p) => (p.hi ? `<em>${esc(p.t)}</em>` : esc(p.t))).join('')}</div>`).join('');

// 講者框是「橫的 1920×1080／直的 1080×1920」座標；ar＝那一格的寬高比
export function coverHtml({ layout, format = 'landscape', title, kicker = '', frame, cutout = null, ar = 16 / 9, speakerBox = null, kit }) {
  const V = format === 'portrait', CW = V ? 1080 : 1920, CH = V ? 1920 : 1080;
  const NW = ar >= 1 ? 1920 : 1080, NH = ar >= 1 ? 1080 : 1920;
  const lines = parseTitle(title);
  const right = speakerBox ? (speakerBox[0] + speakerBox[2]) / 2 / NW < 0.5 : false;   // 講者在左 → 字放右邊
  const SAFE = V ? { x: 70, y: 240 + 50, w: CW - 140, h: 1440 - 100 } : { x: 90, y: 70, w: CW - 180, h: CH - 140 };
  // 講者框（含手勢外擴）放大到佔畫面高度的 frac：廣角拍的講者在封面上才夠大
  const zoomFor = (frac, lo, hi) => (speakerBox ? clamp(frac * CH / ((speakerBox[3] - speakerBox[1]) / NH * Math.max(CW, CH * ar) / ar), lo, hi) : lo);
  let img, text, size, extra = '';
  if (layout === 'c') {
    img = V ? place({ CW, CH, ar, NW, NH, box: speakerBox, tx: CW / 2, ty: 420, zoom: 1 }) : place({ CW, CH, ar, NW, NH, box: speakerBox, tx: CW / 2, zoom: 1 });
    const h = V ? 520 : 400;
    text = { x: SAFE.x, y: SAFE.y + SAFE.h - h, w: SAFE.w, h };
    size = fitSize(lines, text.w, text.h - (kicker ? 70 : 0), V ? 150 : 170);
  } else if (V) {
    img = place({ CW, CH, ar, NW, NH, box: speakerBox, tx: CW / 2, ty: 860, zoom: zoomFor(0.6, 1.08, 1.6), maxTop: 420 });
    const head = speakerBox ? img.top + speakerBox[1] / NH * img.height : 860;   // 標題只用到頭頂上面那一塊，不壓到臉
    text = { x: SAFE.x, y: SAFE.y, w: SAFE.w, h: clamp(head - SAFE.y + 60, 300, 640) };
    size = fitSize(lines, text.w, text.h - (kicker ? 70 : 0), 240);
    if (layout === 'b') extra = `<div class="panel" style="left:0;top:0;width:${CW}px;height:${text.y + text.h + 60}px;clip-path:polygon(0 0,100% 0,100% 88%,0 100%)"></div><div class="stripe" style="left:0;top:${text.y + text.h + 60 - 110}px;width:${CW}px;height:130px;clip-path:polygon(0 80%,100% 0,100% 16%,0 96%)"></div>`;
  } else {
    const tw = 900;
    img = place({ CW, CH, ar, NW, NH, box: speakerBox, tx: right ? CW * 0.27 : CW * 0.73, ty: 60, zoom: zoomFor(1.05, 1.22, 1.9) });
    text = { x: right ? CW - SAFE.x - tw : SAFE.x, y: SAFE.y, w: tw, h: SAFE.h };
    size = fitSize(lines, text.w, text.h - (kicker ? 80 : 0), 210);
    if (layout === 'b') {
      const pw = tw + SAFE.x + 110;
      extra = right
        ? `<div class="panel" style="right:0;top:0;width:${pw}px;height:${CH}px;clip-path:polygon(14% 0,100% 0,100% 100%,0 100%)"></div><div class="stripe" style="right:${pw - 160}px;top:0;width:170px;height:${CH}px;clip-path:polygon(88% 0,100% 0,12% 100%,0 100%)"></div>`
        : `<div class="panel" style="left:0;top:0;width:${pw}px;height:${CH}px;clip-path:polygon(0 0,100% 0,86% 100%,0 100%)"></div><div class="stripe" style="left:${pw - 160}px;top:0;width:170px;height:${CH}px;clip-path:polygon(88% 0,100% 0,12% 100%,0 100%)"></div>`;
    }
  }
  const pos = `left:${img.left}px;top:${img.top}px;width:${img.width}px;height:${img.height}px`;
  const cut = cutout && layout !== 'c' ? `<img class="cut" src="${esc(cutout)}" style="${pos}" alt="">` : '';
  const shade = layout === 'a'
    ? (V ? `linear-gradient(180deg, rgba(8,10,14,1) 0%, rgba(8,10,14,1) ${Math.round(Math.max(0, img.top) / CH * 100)}%, rgba(8,10,14,.8) ${Math.round((text.y + text.h) / CH * 100)}%, rgba(8,10,14,.25) 100%)`
      : `linear-gradient(${right ? 270 : 90}deg, rgba(8,10,14,.94) 0%, rgba(8,10,14,.8) 42%, rgba(8,10,14,.15) 75%)`)
    : layout === 'c' ? 'linear-gradient(180deg, rgba(8,10,14,0) 45%, rgba(8,10,14,.9) 82%)' : 'none';
  const align = !V && right && layout !== 'c' ? 'right' : 'left';
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="UTF-8">
<link rel="stylesheet" href="${esc(kit)}/fonts.css"><link rel="stylesheet" href="${esc(kit)}/brand.css">
<style>
  html, body { margin: 0; background: #0b0d12; }
  #cover { position: relative; width: ${CW}px; height: ${CH}px; overflow: hidden; font-family: "Noto Sans TC", "Google Sans Flex", sans-serif; }
  #cover img { position: absolute; max-width: none; }
  .bg { ${layout === 'a' && cut ? 'filter: blur(16px) brightness(.62) saturate(.75);' : ''} }
  .cut { filter: drop-shadow(5px 0 0 #fff) drop-shadow(-5px 0 0 #fff) drop-shadow(0 5px 0 #fff) drop-shadow(0 -5px 0 #fff) drop-shadow(0 24px 40px rgba(0,0,0,.55)); }
  .shade { position: absolute; inset: 0; background: ${shade}; }
  .panel { position: absolute; background: #0e1118; }
  .stripe { position: absolute; background: var(--brand); }
  .text { position: absolute; left: ${text.x}px; top: ${text.y}px; width: ${text.w}px; height: ${text.h}px; display: flex; flex-direction: column; justify-content: ${layout === 'c' ? 'flex-end' : V ? 'flex-start' : 'center'}; align-items: ${align === 'right' ? 'flex-end' : 'flex-start'}; text-align: ${align}; }
  .kicker { font-size: ${V ? 44 : 46}px; font-weight: 800; line-height: 1; color: var(--brand-ink); background: var(--brand); padding: 12px 22px 14px; border-radius: 10px; margin-bottom: 26px; letter-spacing: .02em; }
  .ln + .ln { margin-top: ${Math.round(size * 0.06)}px; }
  .ln { font-size: ${size}px; font-weight: 900; line-height: 1.16; color: #fff; white-space: nowrap; letter-spacing: -.01em; -webkit-text-stroke: ${Math.max(6, Math.round(size * 0.07))}px #0b0d12; paint-order: stroke fill; text-shadow: 0 8px 26px rgba(0,0,0,.5); }
  .ln em { font-style: normal; color: var(--brand-ink); background: var(--brand); -webkit-text-stroke: 0; text-shadow: none; display: inline-block; line-height: 1.12; padding: 0 .12em .03em; margin: 0 .03em; border-radius: .08em; }
</style></head>
<body><div id="cover" data-layout="${layout}" data-format="${format}">
  <img class="bg" src="${esc(frame)}" style="${pos}" alt="">
  <div class="shade"></div>
  ${extra}
  ${cut}
  <div class="text">${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}${titleHtml(lines)}</div>
</div></body></html>
`;
}

export const candidateTimes = (dur, n = COVER.candidates) => Array.from({ length: n }, (_, i) => Math.round(dur * (0.08 + 0.84 * i / (n - 1)) * 10) / 10);

function grab(video, at, out, scale = null) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(at), '-i', video, '-frames:v', '1', ...(scale ? ['-vf', `scale=${scale}:-2`] : []), '-q:v', '2', out], { encoding: 'utf8' });
  return r.status === 0 && fs.existsSync(out);
}
function defaultRemove(root) {
  return (img, out) => {
    const r = spawnSync('npx', ['hyperframes', 'remove-background', img, '-o', out], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, shell: process.platform === 'win32' });
    return r.status === 0 && fs.existsSync(out) && fs.statSync(out).size > 0;
  };
}

export function titleProblems(title) {
  const lines = parseTitle(title), out = [];
  if (!lines.length) out.push('沒有標題 → --title "第一行|第二行"（| 換行，*詞* 是要強調的詞）');
  if (lines.length > COVER.lines) out.push(`標題 ${lines.length} 行，最多 ${COVER.lines} 行 → 封面在手機上只有拇指大，刪到剩最重要的一句`);
  for (const l of lines) if (lineEm(l) > COVER.lineMax + 0.5) out.push(`「${l.map((p) => p.t).join('')}」有 ${Math.round(lineEm(l))} 個字寬，一行最多 ${COVER.lineMax} → 用 | 拆成兩行，或刪字`);
  return out;
}

export function makeCovers({ project, templateDir, root, title, kicker = '', at = null, format = null, chrome, log = console.log, remove = null }) {
  const bad = titleProblems(title);
  if (bad.length) throw new Error(bad.join('\n'));
  const video = [path.join(project, 'work', 'rough.mp4'), path.join(project, 'work', 'main.mp4')].find((f) => fs.existsSync(f));
  if (!video) throw new Error('這個專案還沒有 work/rough.mp4 → 先「剪乾淨」，再做封面');
  const info = probeMedia(video), dur = info.duration, ar = info.width / info.height;
  let plan = {};
  try { plan = JSON.parse(fs.readFileSync(path.join(project, 'work', 'hyperframes', 'plan.json'), 'utf8')); } catch { plan = {}; }
  const fmt = format || plan.format || (ar < 1 ? 'portrait' : 'landscape');
  const dir = path.join(project, 'work', 'cover'), outDir = path.join(project, 'output', 'cover');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });

  // 候選格（8 格拼成一張，給人挑表情）
  const times = candidateTimes(dur), sheet = path.join(dir, 'candidates.jpg');
  const ins = times.flatMap((t) => ['-ss', String(t), '-i', video]);
  const half = times.length / 2, lab = (a, z) => times.slice(a, z).map((_, i) => `[s${a + i}]`).join('');
  const graph = times.map((_, i) => `[${i}:v]scale=480:-2[s${i}]`).join(';') + `;${lab(0, half)}hstack=${half}[r0];${lab(half, times.length)}hstack=${half}[r1];[r0][r1]vstack`;
  const sh = spawnSync('ffmpeg', ['-y', '-v', 'error', ...ins, '-filter_complex', graph, '-frames:v', '1', '-q:v', '3', sheet], { encoding: 'utf8' });
  const useAt = at != null ? Number(at) : times[2];
  if (!(useAt >= 0 && useAt < dur)) throw new Error(`--at ${at} 不在影片裡（0–${Math.floor(dur)} 秒）→ 看 ${path.relative(root, sheet)} 挑一格`);

  const frame = path.join(dir, 'frame.jpg'), cutFile = path.join(dir, 'cutout.png');
  if (!grab(video, useAt, frame)) throw new Error(`抓不出 ${useAt} 秒那一格 → 跑 ffmpeg -version 確認 ffmpeg 能用`);
  fs.rmSync(cutFile, { force: true });
  let cutout = false, note = '';
  if (remove || matteWeights().cached) cutout = (remove || defaultRemove(root))(frame, cutFile);
  else note = `去背模型還沒下載（約 ${MATTE.sizeMb} MB）：這次的封面講者沒有去背、沒有白邊 → 要的話先問使用者，同意就跑 node shared/template/tools/media.mjs matte-setup 再重做`;
  if (!cutout && !note) note = '這一格去背失敗：封面講者沒有白邊 → 換一格（--at）再試';

  const kit = pathToFileURL(path.join(templateDir, 'kit')).href;
  const V = fmt === 'portrait', W = V ? 1080 : 1920, H = V ? 1920 : 1080, files = [];
  for (const layout of COVER.layouts) {
    const html = path.join(dir, `cover-${layout}.html`), png = path.join(dir, `cover-${layout}.png`), jpg = path.join(outDir, `cover-${layout}.jpg`);
    fs.writeFileSync(html, coverHtml({ layout, format: fmt, title, kicker, frame: 'frame.jpg', cutout: cutout ? 'cutout.png' : null, ar, speakerBox: Array.isArray(plan.speakerBox) ? plan.speakerBox : null, kit }));
    htmlShot({ chrome, file: html, out: png, width: W, height: H });
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', png, '-vf', `crop=${W}:${H}:0:0`, '-q:v', '2', jpg], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`存不出 ${path.basename(jpg)}：${String(r.stderr).trim().slice(-200)} → 跑 ffmpeg -version 確認 ffmpeg 能用`);
    fs.rmSync(png, { force: true });
    files.push(jpg);
  }
  const relp = (f) => path.relative(root, f).split(path.sep).join('/');
  log(`✓ 封面 3 張（${V ? '直式 1080×1920，標題和臉在中間 3:4 裡' : '橫式 1920×1080'}；用 ${useAt} 秒那一格${cutout ? '、講者已去背' : ''}）`);
  COVER.layouts.forEach((l, i) => log(`  ${l} ${COVER.names[l]}：${relp(files[i])}`));
  if (note) log(`⚠ ${note}`);
  if (sh.status === 0) log(`→ 想換表情：看 ${relp(sheet)}（左上到右下是 ${times.join('、')} 秒），再跑同一條加 --at <秒>`);
  return { files, at: useAt, cutout, sheet: sh.status === 0 ? sheet : null, format: fmt };
}

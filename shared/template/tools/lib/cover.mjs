// 封面圖（025、090）：一支影片出三張不同情境的封面讓使用者挑。內容是資料（work/cover/cover.json），版面由這裡排，改字不用重寫 HTML。
// 橫式專案 1920×1080（YouTube 縮圖）：左邊標題、右邊主視覺、底部重點；不放頻道名、講者名（品牌不上封面）。
// 直式專案 1080×1920：標題在上、主視覺在下，都放在中間 3:4（y 240–1680）裡，動態牆裁成 3:4 也看得到。
//
// 三個情境（COVER.scenes）：
//   cutout 去背＋內容：講者去背站前面，後面一張內容卡（影片的某一格，或一張圖）
//   mock   情境模擬  ：警示框 alert／對話 chat／前後對照 compare／一張圖 image
//   icon   大塊圖示  ：圖示 icon（kit/icons.json）／圖庫 pic（kit/pics）／一張圖 image
//
//   parseTitle('讓 AI 幫你|*剪片*') → [[{ t, hi }]]：| 換行，*詞* 是要強調的詞
//   lineEm(line)                     → 這一行有幾個字寬（全形 1、半形 0.56）
//   fitSize(lines, w, h, max)        → 放得進 w×h 的字級（px，每行一樣大）
//   fitLines(lines, w, h, max)       → 每一行各自撐到 w（上限 max），合計高度不超過 h
//   place({ CW, CH, ar, NW, NH, box, tx, ty, zoom, maxTop }) → { left, top, width, height }
//   coverProblems(scene, c, ctx)     → 這一張的內容哪裡不合（字太長、缺內容、找不到圖）
//   coverHtml({ scene, format, cover, … }) → html
//   coverPrompt({ project, format, scenes, title, at, hasFinal }) → 給 AI 的封面指令（封面台「複製封面指令」和 --brief 印的是同一段）
//   coverBrief({ project, templateDir, root, title }) → 照專案現況組出那一段（封面台存過的情境與描述照用）
//   readCover(project)／writeCover(project, data)
//   coverInfo({ project, root })     → 封面台要的狀態（候選格、三張的內容與成品）
//   makeCovers({ project, templateDir, root, chrome, only, set, log, remove }) → { files, at, cutout, sheet, format }
//   pickCover(project, scene)        → 選定的那一張複製成 output/cover/cover.jpg
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { probeMedia } from './ff.mjs';
import { htmlShot } from './raster.mjs';
import { matteWeights, MATTE } from './matte.mjs';

export const COVER = {
  scenes: ['cutout', 'mock', 'icon'],
  names: { cutout: '去背＋內容', mock: '情境模擬', icon: '大塊圖示' },
  notes: {
    cutout: '講者去背站在前面，後面放這支影片的內容（成品畫面、螢幕錄影，或一張生成的場景）',
    mock: '把觀眾會遇到的情境做成畫面（跳出來的警示框、一段對話，或前後對照的兩張卡）',
    icon: '一個大圖示或物件當主視覺，一眼看懂這支影片在講什麼',
  },
  mocks: ['alert', 'chat', 'compare', 'image'],
  lines: 3, lineMax: 9, candidates: 8,
  kicker: 14, sub: 18, chips: 4, chip: 9,
  alert: { title: 10, body: 28, button: 5 }, chat: { bubble: 22 }, compare: { title: 6, row: 7 },
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const posix = (f) => f.split(path.sep).join('/');

export function parseTitle(s) {
  return String(s || '').split('|').map((l) => l.trim()).filter(Boolean).map((l) => {
    const out = [];
    l.split(/(\*[^*]+\*)/).filter(Boolean).forEach((p) => out.push(/^\*[^*]+\*$/.test(p) ? { t: p.slice(1, -1), hi: true } : { t: p, hi: false }));
    return out;
  });
}
const strEm = (s) => [...String(s ?? '')].reduce((n, ch) => n + (/[\u0000-ÿ]/.test(ch) ? (ch === ' ' ? 0.3 : 0.56) : 1), 0);
export const lineEm = (line) => strEm(line.map((p) => p.t).join('')) + line.filter((p) => p.hi).length * 0.3;
export function fitSize(lines, w, h, max) {
  const em = Math.max(1, ...lines.map(lineEm));
  return Math.floor(Math.min(max, w / em, h / (lines.length * 1.24)));
}
// 每一行各自撐到 w：字少的行自然變大，層次來自字數。LH＝一行佔的高度（含行距）
const LH = 1.22;
export function fitLines(lines, w, h, max) {
  const raw = lines.map((l) => Math.min(max, w / Math.max(1, lineEm(l))));
  const k = Math.min(1, h / Math.max(1, raw.reduce((s, z) => s + z * LH, 0)));
  return raw.map((z) => Math.floor(z * k));
}

export function place({ CW, CH, ar, NW, NH, box, tx, ty = null, zoom = 1, maxTop = 0 }) {
  const width = Math.max(CW, CH * ar) * zoom, height = width / ar;
  const cx = box ? (box[0] + box[2]) / 2 / NW : 0.5, top0 = box ? box[1] / NH : 0.1;
  return {
    left: r1(clamp(tx - cx * width, CW - width, 0)),
    top: r1(ty == null ? (CH - height) / 2 : clamp(ty - top0 * height, CH - height, maxTop)),
    width: r1(width), height: r1(height),
  };
}

export function titleProblems(title) {
  const lines = parseTitle(title), out = [];
  if (!lines.length) out.push('沒有標題 → title 寫 "第一行|第二行"（| 換行，*詞* 是要強調的詞）');
  if (lines.length > COVER.lines) out.push(`標題 ${lines.length} 行，最多 ${COVER.lines} 行 → 封面在手機上只有拇指大，刪到剩最重要的一句`);
  for (const l of lines) if (lineEm(l) > COVER.lineMax + 0.5) out.push(`「${l.map((p) => p.t).join('')}」有 ${Math.round(lineEm(l))} 個字寬，一行最多 ${COVER.lineMax} → 用 | 拆成兩行，或刪字`);
  return out;
}

// ---------- 內容檢查 ----------

const chipOf = (c) => (typeof c === 'string' ? { icon: '', text: c } : { icon: String(c?.icon || ''), text: String(c?.text || '') });
const long = (label, s, max) => (strEm(s) > max + 0.5 ? [`${label}「${s}」有 ${Math.round(strEm(s))} 個字寬，最多 ${max} → 刪字`] : []);
// ctx：{ icons（kit/icons.json 的名稱集合）, exists(相對專案的路徑), hasPic(類別/id), duration }
export function coverProblems(scene, c, ctx = {}) {
  const out = [], exists = ctx.exists || (() => true), icons = ctx.icons || null;
  if (!COVER.scenes.includes(scene)) return [`沒有「${scene}」這個情境 → 用 ${COVER.scenes.join('、')}`];
  if (!c || typeof c !== 'object') return [`${COVER.names[scene]}還沒有內容 → 在 cover.json 的 covers.${scene} 寫 title 和這個情境的內容`];
  out.push(...titleProblems(c.title));
  if (c.kicker) out.push(...long('小標', c.kicker, COVER.kicker));
  if (c.sub) out.push(...long('副標', c.sub, COVER.sub));
  const chips = (c.chips || []).map(chipOf);
  if (chips.length > COVER.chips) out.push(`底部重點 ${chips.length} 個，最多 ${COVER.chips} 個 → 留最重要的 ${COVER.chips} 個`);
  for (const ch of chips) {
    out.push(...long('底部重點', ch.text, COVER.chip));
    if (ch.icon && icons && !icons.has(ch.icon)) out.push(`找不到圖示「${ch.icon}」（kit/icons.json） → 換一個有的，或不寫 icon`);
  }
  const img = (label, p) => (p && !exists(p) ? [`${label}找不到 ${p} → 路徑從專案資料夾寫起（例 work/cover/plate.png）`] : []);
  if (scene === 'cutout') {
    const b = c.behind;
    if (b?.image) out.push(...img('後面的內容', b.image));
    else if (b && b.at != null && !(Number(b.at) >= 0 && (ctx.duration == null || Number(b.at) < ctx.duration))) out.push(`behind.at ${b.at} 不在影片裡${ctx.duration != null ? `（0–${Math.floor(ctx.duration)} 秒）` : ''} → 換一個秒數`);
  }
  if (scene === 'mock') {
    const m = c.mock;
    if (!m || !COVER.mocks.includes(m.kind)) out.push(`情境模擬要寫 mock.kind → ${COVER.mocks.join('、')} 選一個（alert 警示框、chat 對話、compare 前後對照、image 一張圖）`);
    else if (m.kind === 'alert') {
      if (!m.title) out.push(`警示框沒有 title → 寫跳出來的那一句（最多 ${COVER.alert.title} 個字寬）`);
      out.push(...long('警示框標題', m.title || '', COVER.alert.title), ...long('警示框內文', m.body || '', COVER.alert.body));
      if ((m.buttons || []).length > 2) out.push('警示框最多 2 個按鈕 → 留 2 個');
      for (const b of m.buttons || []) out.push(...long('按鈕', b, COVER.alert.button));
    } else if (m.kind === 'chat') {
      const bs = m.bubbles || [];
      if (bs.length < 1 || bs.length > 3) out.push(`對話要 1–3 則，現在 ${bs.length} 則 → 留最有戲的 2–3 則`);
      for (const b of bs) out.push(...long('對話', b?.text || '', COVER.chat.bubble));
    } else if (m.kind === 'compare') {
      for (const k of ['left', 'right']) {
        const s = m[k];
        if (!s?.title) { out.push(`前後對照少了 ${k}.title → 兩邊各寫一個標題（最多 ${COVER.compare.title} 個字寬）和 1–3 列`); continue; }
        out.push(...long('對照卡標題', s.title, COVER.compare.title));
        if ((s.rows || []).length > 3) out.push(`對照卡「${s.title}」有 ${(s.rows || []).length} 列，最多 3 列 → 刪到 3 列`);
        for (const r of s.rows || []) out.push(...long('對照卡的列', r, COVER.compare.row));
      }
    } else if (!m.image) out.push('mock.kind 是 image 卻沒有 mock.image → 寫圖片路徑（例 work/cover/plate-mock.png）');
    else out.push(...img('情境的圖', m.image));
  }
  if (scene === 'icon') {
    if (c.image) out.push(...img('主視覺的圖', c.image));
    else if (c.pic) { if (ctx.hasPic && !ctx.hasPic(c.pic)) out.push(`找不到圖庫的「${c.pic}」（kit/pics/<類別>/<id>.svg） → 用 node shared/template/tools/build.mjs --pics <關鍵字> 找`); }
    else if (c.icon) { if (icons && !icons.has(c.icon)) out.push(`找不到圖示「${c.icon}」（kit/icons.json） → 換一個有的`); }
    else out.push('大塊圖示還沒有主視覺 → 寫 icon（kit/icons.json 的名稱）、pic（圖庫的 類別/id）或 image（圖片路徑）其中一個');
  }
  return out;
}

// ---------- 版面 ----------

const GEO = {
  // 橫式：四邊留 MX／MY；有底部重點時，標題與主視覺用上面那一塊（上下置中），沒有就用到底
  landscape: { CW: 1920, CH: 1080, text: { x: 84, y: 64, w: 960 }, vis: { x: 1100, y: 64, w: 736 }, bottom: 1016, chipsTop: 872, chipsH: 144, chipsGap: 50, titleMax: 250 },
  portrait: { CW: 1080, CH: 1920, text: { x: 70, y: 280, w: 940 }, vis: { x: 70, y: 850, w: 940 }, bottom: 1680, textH: 520, titleMax: 215 },
};

const titleHtml = (lines, sizes) => lines.map((l, i) => `<div class="ln" style="font-size:${sizes[i]}px">${l.map((p) => (p.hi ? `<em>${esc(p.t)}</em>` : esc(p.t))).join('')}</div>`).join('');
const svgOf = (icons, name) => (icons && icons[name] ? icons[name] : '');

// 講者（去背圖或原圖）放進 box：講者框的高度畫成 hs，框的中心對到 cx、底對到 by
function speakerImg({ src, NW, NH, sbox, hs, cx, by, cls }) {
  const b = sbox || [NW * 0.25, NH * 0.08, NW * 0.75, NH];
  const k = hs / Math.max(1, b[3] - b[1]);
  return `<img class="${cls}" src="${esc(src)}" style="left:${r1(cx - (b[0] + b[2]) / 2 * k)}px;top:${r1(by - b[3] * k)}px;width:${r1(NW * k)}px;height:${r1(NH * k)}px" alt="">`;
}

function mockHtml(m, box, icons, V) {
  const fit = (bw, bh) => Math.min(box.w / bw, box.h / bh);
  if (m.kind === 'image') return `<img class="mk-img" src="${esc(m.src)}" alt="">`;
  if (m.kind === 'alert') {
    const k = fit(660, 560);
    const btns = (m.buttons || []).map((b) => `<span>${esc(b)}</span>`).join('');
    return `<div class="mk mk-alert" style="width:660px;transform:scale(${r1(k * 100) / 100})"><div class="ic">${svgOf(icons, 'triangle-alert')}</div><div class="t">${esc(m.title)}</div>${m.body ? `<div class="b">${esc(m.body)}</div>` : ''}${btns ? `<div class="btns">${btns}</div>` : ''}</div>`;
  }
  if (m.kind === 'chat') {
    const bs = m.bubbles || [], maxW = Math.round(box.w * 0.9), gap = 30, PAD = 1.6;   // PAD＝泡泡左右內距（em）
    const linesAt = (z, t) => Math.max(1, Math.ceil(strEm(t) / Math.max(1, Math.floor(maxW / z - PAD))));
    const heightAt = (z) => bs.reduce((h, b) => h + linesAt(z, b.text) * z * 1.3 + z * 1.28 + gap, -gap);
    let size = Math.min(76, Math.floor(maxW / (Math.max(1, ...bs.map((b) => strEm(b.text))) * 1.08 + PAD)));   // 最長那一則剛好一行（英數字比估的寬，留 8%）
    const one = size >= 46;   // 一行放得完就不折行；放不完用大一點的字折成兩行
    if (!one) size = 60;
    while (size > 36 && heightAt(size) > box.h) size -= 2;
    return `<div class="mk-chat" style="width:${box.w}px;gap:${gap}px;font-size:${size}px">${bs.map((b) => `<div class="bb ${b.me ? 'me' : 'ai'}" style="${one ? 'white-space:nowrap' : `max-width:${maxW}px`}">${esc(b.text)}</div>`).join('')}</div>`;
  }
  // compare：左右並排，或上下疊（中間的箭頭跟著轉）——挑放進主視覺區之後比較大的那一種
  const nl = (m.left?.rows || []).length, nr = (m.right?.rows || []).length;
  const side = { w: 780, h: 121 + Math.max(1, nl, nr) * 88 + 30 }, stack = { w: 660, h: (132 + nl * 104 + 32) + (132 + nr * 104 + 32) + 120 };
  const ks = fit(side.w, side.h), kt = fit(stack.w, stack.h);
  const T = kt * kt * stack.w * stack.h > ks * ks * side.w * side.h, k = T ? kt : ks;
  const card = (c, cls) => `<div class="cd ${cls}"><div class="h">${esc(c.title)}</div>${(c.rows || []).map((r) => `<div class="rw">${esc(r)}</div>`).join('')}</div>`;
  return `<div class="mk mk-cmp ${T ? 'stack' : 'side'}" style="width:${T ? stack.w : side.w}px;transform:scale(${r1(k * 100) / 100})">${card(m.left, 'before')}<div class="ar">${svgOf(icons, T ? 'arrow-down' : 'arrow-right')}</div>${card(m.right, 'after')}</div>`;
}

// frame／cutout／behind／image 都是可以直接放進 src 的路徑；sbox＝講者框（橫的 1920×1080／直的 1080×1920 座標），ar＝講者那一格的寬高比
export function coverHtml({ scene, format = 'landscape', cover, frame = null, cutout = null, behind = null, behindAr = 16 / 9, image = null, picSvg = null, ar = 16 / 9, speakerBox = null, icons = null, kit }) {
  const V = format === 'portrait', G = GEO[V ? 'portrait' : 'landscape'], { CW, CH } = G;
  const NW = ar >= 1 ? 1920 : 1080, NH = ar >= 1 ? 1080 : 1920;
  const lines = parseTitle(cover.title);
  const chips = V ? [] : (cover.chips || []).map(chipOf).filter((c) => c.text).slice(0, COVER.chips);
  const bottom = V ? G.bottom : chips.length ? G.chipsTop - G.chipsGap : G.bottom;
  const kickerSize = V ? 60 : 60, subSize = V ? 50 : 54;
  const textH = (V ? G.textH : bottom - G.text.y) - (cover.kicker ? kickerSize * 1.5 : 0) - (cover.sub ? subSize * 1.7 : 0);
  const sizes = fitLines(lines, G.text.w, textH, G.titleMax);
  const vis = { x: G.vis.x, y: G.vis.y, w: G.vis.w, h: bottom - G.vis.y };

  let visual = '';
  if (scene === 'cutout') {
    // 內容卡在後、講者在前：橫式卡靠右上、講者站右下；直式卡在上、講者從底部站起來蓋住卡的下緣
    const cw = V ? vis.w : vis.w - 40, ch = Math.min(cw / behindAr, V ? 620 : vis.h - 60), cardW = ch * behindAr;
    const card = behind ? `<div class="card" style="left:${r1(V ? vis.x + (vis.w - cardW) / 2 : vis.x + vis.w - cardW)}px;top:${vis.y}px;width:${r1(cardW)}px;height:${r1(ch)}px"><img src="${esc(behind)}" alt=""></div>` : '';
    // 講者框最下面那一截通常是桌面和桌上的東西（去背去不乾淨）：往下推 CUT，讓它落在裁切線外
    const CUT = 0.2, hs = V ? (behind ? 1000 : 1120) : Math.min(behind ? 640 : 760, vis.h * 1.1), by = (V ? CH : bottom) + hs * CUT;
    const cx = V ? CW / 2 : behind ? vis.x + vis.w * 0.36 : vis.x + vis.w / 2;
    const clip = V ? `left:0;top:${vis.y - 60}px;width:${CW}px;height:${CH - vis.y + 60}px` : `left:${vis.x - 70}px;top:${vis.y - 40}px;width:${CW - vis.x + 70}px;height:${bottom - vis.y + 40}px`;
    const ox = V ? 0 : vis.x - 70, oy = V ? vis.y - 60 : vis.y - 40;
    const who = cutout
      ? speakerImg({ src: cutout, NW, NH, sbox: speakerBox, hs, cx: cx - ox, by: by - oy, cls: 'cut' })
      : frame ? speakerImg({ src: frame, NW, NH, sbox: speakerBox, hs, cx: cx - ox, by: by - oy, cls: 'raw' }) : '';
    visual = `${card}<div class="who${cutout ? '' : ' boxed'}" style="${clip}">${who}</div>`;
  } else if (scene === 'mock') {
    const m = cover.mock.kind === 'image' ? { kind: 'image', src: image } : cover.mock;
    visual = `<div class="vis" style="left:${vis.x}px;top:${vis.y}px;width:${vis.w}px;height:${vis.h}px">${mockHtml(m, vis, icons, V)}</div>`;
  } else {
    const side = Math.round(Math.min(vis.w, vis.h) * 0.86);
    const inner = image ? `<img class="mk-img" src="${esc(image)}" alt="">`
      : `<div class="tile" style="width:${side}px;height:${side}px">${picSvg || svgOf(icons, cover.icon)}</div>`;
    visual = `<div class="vis" style="left:${vis.x}px;top:${vis.y}px;width:${vis.w}px;height:${vis.h}px">${inner}</div>`;
  }

  // 底部重點：字級一起縮到放得下一列
  let chipsHtml = '';
  if (chips.length) {
    const rowW = CW - G.text.x * 2, gap = 24, pad = 28;
    const em = chips.reduce((s, c) => s + strEm(c.text) + (c.icon ? 1.35 : 0), 0);
    const size = Math.floor(Math.min(68, (rowW - gap * (chips.length - 1) - pad * 2 * chips.length) / em));
    chipsHtml = `<div class="chips" style="left:${G.text.x}px;top:${G.chipsTop}px;width:${rowW}px;height:${G.chipsH}px;gap:${gap}px;font-size:${size}px">${chips.map((c) => `<div class="chip" style="padding:0 ${pad}px">${c.icon ? svgOf(icons, c.icon) : ''}<span>${esc(c.text)}</span></div>`).join('')}</div>`;
  }

  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="UTF-8">
<link rel="stylesheet" href="${esc(kit)}/fonts.css"><link rel="stylesheet" href="${esc(kit)}/brand.css">
<style>
  html, body { margin: 0; background: #000; }
  #cover { position: relative; width: ${CW}px; height: ${CH}px; overflow: hidden; background: ${V ? '#070707' : '#000'}; font-family: "Noto Sans TC", "Google Sans Flex", sans-serif; --plain: ${V ? '#FFFFFF' : '#FFE600'}; }
  #cover img { max-width: none; }
  .text { position: absolute; left: ${G.text.x}px; top: ${G.text.y}px; width: ${G.text.w}px; ${V ? '' : `height: ${bottom - G.text.y}px; `}display: flex; flex-direction: column; justify-content: ${V ? 'flex-start' : 'center'}; align-items: ${V ? 'center' : 'flex-start'}; text-align: ${V ? 'center' : 'left'}; }
  .kicker { font-size: ${kickerSize}px; font-weight: 800; line-height: 1.2; color: #fff; margin-bottom: ${Math.round(kickerSize * 0.3)}px; white-space: nowrap; }
  .ln { font-weight: 900; line-height: ${LH}; color: var(--plain); white-space: nowrap; letter-spacing: -.01em; }
  .ln em { font-style: normal; color: var(--brand-ink); background: var(--brand); display: inline-block; line-height: 1.12; padding: 0 .14em .04em; margin: 0 .01em; border-radius: .14em; }
  .sub { font-size: ${subSize}px; font-weight: 700; line-height: 1.3; color: #E6E6E6; margin-top: ${Math.round(subSize * 0.4)}px; white-space: nowrap; }
  .card { position: absolute; box-sizing: border-box; border: 6px solid var(--brand); border-radius: 26px; overflow: hidden; background: #111; }
  .card img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .who { position: absolute; overflow: hidden; }
  .who img { position: absolute; }
  .who .cut { filter: drop-shadow(5px 0 0 #fff) drop-shadow(-5px 0 0 #fff) drop-shadow(0 5px 0 #fff) drop-shadow(0 -5px 0 #fff); }
  .vis { position: absolute; display: flex; align-items: center; justify-content: center; }
  .mk { flex: none; transform-origin: center; }
  .mk-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 26px; display: block; }
  .tile { flex: none; border-radius: 22%; background: var(--brand); color: var(--brand-ink); display: flex; align-items: center; justify-content: center; --il-line: var(--brand-ink); --il-body: rgba(255,255,255,.2); --il-accent-soft: rgba(255,255,255,.36); }
  .tile svg { width: 62%; height: 62%; stroke-width: 1.9; }
  .mk-alert { box-sizing: border-box; background: #F2F2F5; border-radius: 52px; text-align: center; padding-top: 52px; overflow: hidden; }
  .mk-alert .ic { width: 104px; height: 104px; margin: 0 auto 26px; border-radius: 26px; background: #FF3B30; color: #fff; display: flex; align-items: center; justify-content: center; }
  .mk-alert .ic svg { width: 64px; height: 64px; stroke-width: 2.4; }
  .mk-alert .t { font-size: 58px; font-weight: 900; line-height: 1.25; color: #111; padding: 0 40px; }
  .mk-alert .b { font-size: 38px; font-weight: 600; line-height: 1.45; color: #555; padding: 14px 56px 0; }
  .mk-alert .btns { display: flex; margin-top: 44px; border-top: 3px solid #D2D2D8; }
  .mk-alert .btns span { flex: 1; padding: 30px 0 34px; font-size: 44px; font-weight: 800; color: #0A7AFF; }
  .mk-alert .btns span + span { border-left: 3px solid #D2D2D8; }
  .mk-chat { flex: none; display: flex; flex-direction: column; }
  .mk-chat .bb { box-sizing: border-box; text-wrap: balance; padding: .6em .8em .68em; border-radius: .88em; font-weight: 800; line-height: 1.3; color: #fff; }
  .mk-chat .ai { align-self: flex-start; background: #232B36; border-bottom-left-radius: .24em; }
  .mk-chat .me { align-self: flex-end; background: var(--brand); color: var(--brand-ink); border-bottom-right-radius: .24em; }
  .mk-cmp { display: flex; align-items: center; justify-content: space-between; }
  .mk-cmp.stack { flex-direction: column; align-items: stretch; }
  .mk-cmp.stack .cd { width: auto; padding-bottom: 32px; }
  .mk-cmp.stack .h { font-size: 56px; padding: 22px 30px 26px; }
  .mk-cmp.stack .rw { font-size: 52px; padding: 26px 30px 0; }
  .mk-cmp.stack .ar { align-self: center; width: 88px; height: 88px; margin: 16px 0; }
  .mk-cmp .cd { width: 336px; background: #fff; border-radius: 30px; overflow: hidden; padding-bottom: 30px; }
  .mk-cmp .h { font-size: 46px; font-weight: 900; color: #fff; padding: 24px 26px 28px; white-space: nowrap; }
  .mk-cmp .before .h { background: #E5484D; } .mk-cmp .after .h { background: #12A594; }
  .mk-cmp .rw { font-size: 40px; font-weight: 800; color: #111; padding: 28px 26px 0; white-space: nowrap; }
  .mk-cmp .ar { flex: none; width: 96px; height: 96px; border-radius: 50%; background: #FFD400; color: #111; display: flex; align-items: center; justify-content: center; }
  .mk-cmp .ar svg { width: 60px; height: 60px; stroke-width: 3; }
  .chips { position: absolute; display: flex; }
  .chip { flex: 1 1 auto; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: .35em; border: 3px solid color-mix(in srgb, var(--brand) 78%, #1a1f27); border-radius: 26px; background: #11161D; color: #fff; font-weight: 800; white-space: nowrap; box-shadow: 0 0 14px color-mix(in srgb, var(--brand) 60%, transparent), 0 0 46px color-mix(in srgb, var(--brand) 42%, transparent), inset 0 0 30px color-mix(in srgb, var(--brand) 16%, transparent); }
  .chip svg { width: 1em; height: 1em; color: var(--brand-text); stroke-width: 2.4; flex: none; }
</style></head>
<body><div id="cover" data-scene="${scene}" data-format="${format}">
  ${visual}
  <div class="text">${cover.kicker ? `<div class="kicker">${esc(cover.kicker)}</div>` : ''}${titleHtml(lines, sizes)}${cover.sub ? `<div class="sub">${esc(cover.sub)}</div>` : ''}</div>
  ${chipsHtml}
</div></body></html>
`;
}

// ---------- 給 AI 的指令 ----------

// 給 AI 的封面指令：整段貼過去就能做，不用另外翻文件
export function coverPrompt({ project, format, scenes, title, at, hasFinal }) {
  const V = format === 'portrait', on = scenes.filter((s) => s.on);
  const dir = `${project}/work/cover`;
  return `做這支影片的封面（專案 ${project}，${V ? '直式 1080×1920' : '橫式 1920×1080'}）。內容寫進 ${dir}/cover.json，由工具排版出圖；不要自己寫封面的 HTML。

要做 ${on.length} 張，一個情境一張：
${on.map((s, i) => `${i + 1}. ${COVER.names[s.id]}（covers.${s.id}）：${s.note}`).join('\n')}
${title ? `標題使用者已經指定：「${title}」，每一張都用這一句，不改字。` : `標題每一張各想一組：同一支影片換 ${on.length} 種說法，不要 ${on.length} 張同一句。先讀 ${project}/work/摘要.md（沒有就讀 ${project}/講稿.md），挑觀眾最在意的結果或數字。`}

cover.json 的寫法（已經有的欄位保留，只改 covers 裡要做的那幾張）：
{ "at": ${at}, "covers": { ${on.map((s) => `"${s.id}": { … }`).join(', ')} } }
- 每一張都有：title（最多 ${COVER.lines} 行、一行最多 ${COVER.lineMax} 個字寬；| 換行，*詞* 套主色底，整行包起來就是一整塊色塊，一張最多一塊）、kicker（標題上面的小字，選填，最多 ${COVER.kicker} 個字寬）、sub（標題下面一行，選填，最多 ${COVER.sub} 個字寬）${V ? '' : `、chips（底部重點，最多 ${COVER.chips} 個、每個最多 ${COVER.chip} 個字寬；2–3 個短的字最大：{ "icon": "<kit/icons.json 的名稱>", "text": "…" }）`}。
${on.some((s) => s.id === 'cutout') ? `- covers.cutout 多一個 behind（講者後面那張內容）：{ "at": <秒> } 取${hasFinal ? '完成影片' : '初剪'}那一秒的畫面，挑一眼看得出這支在做什麼的一格（動畫、螢幕錄影）；{ "image": "work/cover/<檔名>.png" } 放一張圖；null 不放。講者用最上層 "at" 那一秒（表情候選在 ${dir}/candidates.jpg，使用者已經選了 ${at} 秒，不要改）。\n` : ''}${on.some((s) => s.id === 'mock') ? `- covers.mock 多一個 mock（四選一）：{ "kind": "alert", "title": "…", "body": "…", "buttons": ["…", "…"] } 跳出來的警示框（title 最多 ${COVER.alert.title} 個字寬、body 最多 ${COVER.alert.body}、按鈕最多 2 個各 ${COVER.alert.button}）；{ "kind": "chat", "bubbles": [{ "me": true, "text": "…" }, { "text": "…" }] } 一段對話（1–3 則、每則最多 ${COVER.chat.bubble} 個字寬，me 是觀眾自己）；{ "kind": "compare", "left": { "title": "…", "rows": ["…"] }, "right": { "title": "…", "rows": ["…"] } } 前後對照（title 最多 ${COVER.compare.title} 個字寬；各 1–3 列、每列最多 ${COVER.compare.row} 個字寬）；{ "kind": "image", "image": "work/cover/<檔名>.png" } 一張圖。\n` : ''}${on.some((s) => s.id === 'icon') ? `- covers.icon 多一個主視覺（三選一）：icon（kit/icons.json 的名稱）、pic（圖庫的「類別/id」，用 node shared/template/tools/build.mjs --pics <關鍵字> 找）、image（一張圖的路徑）。\n` : ''}- 要用到圖（behind.image、mock 的 image、icon 的 image）時：先在工作區根目錄執行 node shared/template/tools/caps.mjs，照它最後印的「這次生圖走」那條路生成（指令在它指到的那一節）。圖不含文字、標誌、介面；底色純黑（#000）；存成 PNG 放 ${dir}/。那條路是 HTML 時不另外畫圖，mock 和 icon 用上面現成的元件。

出圖（在工作區根目錄）：
node shared/template/tools/media.mjs cover --project ${project}
印 ✖ 就照 → 改 cover.json 再跑同一條。出完把每一張打開看一次（字有沒有被切、主視覺有沒有壓到字），回報每一張的路徑，請使用者到封面台挑一張。
`;
}

// ---------- 檔案 ----------

export const coverDir = (project) => path.join(project, 'work', 'cover');
export const coverOut = (project) => path.join(project, 'output', 'cover');
export const coverFile = (project) => path.join(coverDir(project), 'cover.json');
export const coverJpg = (project, scene) => path.join(coverOut(project), `cover-${scene}.jpg`);
export function readCover(project) {
  const d = read(coverFile(project));
  return d && typeof d === 'object' ? { ...d, covers: d.covers && typeof d.covers === 'object' ? d.covers : {} } : { covers: {} };
}
export function writeCover(project, data) {
  fs.mkdirSync(coverDir(project), { recursive: true });
  const f = coverFile(project);
  fs.writeFileSync(f + '.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(f + '.tmp', f);
}

export const candidateTimes = (dur, n = COVER.candidates, from = 0) => Array.from({ length: n }, (_, i) => Math.round((from + dur * (0.08 + 0.84 * i / (n - 1))) * 10) / 10);
// 091 有好幾段講者畫面（主軌是幾段鏡頭，中間夾螢幕錄影或只有聲音）時以第一段為主：建議的幾格、預設那一格都從第一段鏡頭裡挑。
// work/main.json 的 kind: camera（main.mp4 的秒數）照 work/cuts.v1.json 留下來的片段換成 rough.mp4 的秒數，第一段還留著（≥ 2 秒）的 → [起, 迄]；
// 第一段整段被剪掉就用下一段。全部都是鏡頭、沒有鏡頭、換不出來（沒有 cuts.v1.json、格式不對）都回 null＝整支照舊
export function firstCameraSpan(project, video = sourceVideo(project)) {
  const clips = read(path.join(project, 'work', 'main.json'))?.clips;
  if (!Array.isArray(clips)) return null;
  const cams = clips.filter((c) => c?.kind === 'camera' && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start).sort((a, b) => a.start - b.start);
  if (!cams.length || cams.length === clips.length) return null;   // 全部都是鏡頭＝一整段講者，不用挑
  if (video && path.basename(video) === 'main.mp4') { const cam = cams.find((c) => c.end - c.start >= 2); return cam ? [cam.start, cam.end] : null; }
  const v1 = read(path.join(project, 'work', 'cuts.v1.json'));
  if (!Array.isArray(v1?.chunks)) return null;
  const [num, den] = String(v1.timebase || '30/1').split('/').map(Number);
  const fps = num / (den || 1);
  if (!(fps > 0)) return null;
  for (const cam of cams) {
    let out = 0, a = null, b = null;
    for (const ch of v1.chunks) {
      const [s, e, sp] = (Array.isArray(ch) ? ch : []).map(Number);
      if (!(e > s) || !(sp > 0) || sp >= 99999) continue;   // auto-editor 的 99999＝剪掉
      const ts = s / fps, te = e / fps, lo = Math.max(ts, cam.start), hi = Math.min(te, cam.end);
      if (hi > lo) { if (a == null) a = out + (lo - ts) / sp; b = out + (hi - ts) / sp; }
      out += (te - ts) / sp;
    }
    if (a != null && b - a >= 2) return [Math.round(a * 10) / 10, Math.round(b * 10) / 10];
  }
  return null;
}
export const coverSource = (project) => sourceVideo(project);   // 091 封面台的時間軸播這一支
const sourceVideo = (project) => [path.join(project, 'work', 'rough.mp4'), path.join(project, 'work', 'main.mp4')].find((f) => fs.existsSync(f)) || null;
const finalVideo = (project) => [path.join(project, 'output', 'final.mp4'), path.join(project, 'work', 'final-prerender.mp4')].find((f) => fs.existsSync(f)) || null;

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
const planOf = (project) => read(path.join(project, 'work', 'hyperframes', 'plan.json')) || {};
function formatOf(project, plan, ar) { return plan.format || (ar < 1 ? 'portrait' : 'landscape'); }

// 候選格（給人挑表情）：一格一張小圖，另外拼一張總表。影片沒換就不重抓
function candidates(project, video, dur) {
  const span = firstCameraSpan(project, video), [from, to] = span ? [span[0], Math.min(span[1], dur)] : [0, dur];   // 091 好幾段講者時從第一段挑
  const dir = coverDir(project), times = candidateTimes(to - from, COVER.candidates, from), meta = read(path.join(dir, 'candidates.json'));
  const key = `${fs.statSync(video).mtimeMs}:${times.join(',')}`, sheet = path.join(dir, 'candidates.jpg');
  const files = times.map((_, i) => path.join(dir, `cand-${i + 1}.jpg`));
  if (meta?.key !== key || !files.every((f) => fs.existsSync(f))) {
    times.forEach((t, i) => grab(video, t, files[i], 480));
    const half = times.length / 2, lab = (a, z) => files.slice(a, z).map((_, i) => `[${a + i}:v]`).join('');
    spawnSync('ffmpeg', ['-y', '-v', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${lab(0, half)}hstack=${half}[r0];${lab(half, times.length)}hstack=${half}[r1];[r0][r1]vstack`, '-frames:v', '1', '-q:v', '3', sheet], { encoding: 'utf8' });
    fs.writeFileSync(path.join(dir, 'candidates.json'), JSON.stringify({ key, times }));
  }
  return { times, files, sheet: fs.existsSync(sheet) ? sheet : null };
}

// 091 封面台每 2.5 秒問一次狀態：影片沒換（大小、修改時間一樣）就不再跑 ffprobe
const probeMemo = new Map();
function probeCached(video) {
  const st = fs.statSync(video), key = `${st.size}:${st.mtimeMs}`, hit = probeMemo.get(video);
  if (hit?.key === key) return hit.info;
  const info = probeMedia(video);
  probeMemo.set(video, { key, info });
  return info;
}
// 封面台要的狀態：不出圖，只讀現況（候選格沒有才抓）
export function coverInfo({ project, templateDir = null }) {
  const video = sourceVideo(project);
  if (!video) return { ready: false, message: '這個專案還沒有 work/rough.mp4 → 先「剪乾淨」，再做封面' };
  const info = probeCached(video), plan = planOf(project), data = readCover(project);
  fs.mkdirSync(coverDir(project), { recursive: true });
  const cand = candidates(project, video, info.duration);
  const mt = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return null; } };
  return {
    ready: true, format: formatOf(project, plan, info.width / info.height), duration: info.duration,
    at: data.at ?? cand.times[2], times: cand.times,
    covers: Object.fromEntries(COVER.scenes.map((s) => [s, { data: data.covers[s] || null, mtime: mt(coverJpg(project, s)) }])),
    pick: data.pick && mt(path.join(coverOut(project), 'cover.jpg')) ? data.pick : null,
    request: data.request || null, hasFinal: !!finalVideo(project),
  };
}

export function coverBrief({ project, templateDir, root, title = null }) {
  const info = coverInfo({ project, templateDir });
  if (!info.ready) throw new Error(info.message);
  const req = info.request || {};
  const scenes = COVER.scenes.map((id) => ({ id, on: req.scenes?.[id]?.on !== false, note: req.scenes?.[id]?.note || COVER.notes[id] }));
  if (readCover(project).at == null) writeCover(project, { ...readCover(project), at: info.at });   // 指令裡寫的那一格先記下來，出圖用同一格
  return coverPrompt({ project: posix(path.relative(root, project)), format: info.format, scenes, title: title ?? req.title ?? '', at: info.at, hasFinal: info.hasFinal });
}

export function pickCover(project, scene) {
  const src = coverJpg(project, scene);
  if (!COVER.scenes.includes(scene) || !fs.existsSync(src)) throw new Error(`${COVER.names[scene] || scene}那一張還沒出圖 → 先出圖再選`);
  fs.copyFileSync(src, path.join(coverOut(project), 'cover.jpg'));
  writeCover(project, { ...readCover(project), pick: scene });
  return path.join(coverOut(project), 'cover.jpg');
}

// set：指令列給的 { title, kicker, at }（title 只寫進「去背＋內容」那一張：只有它不用另外想內容）；only：只出這幾張
export function makeCovers({ project, templateDir, root, chrome, only = null, set = null, format = null, log = console.log, remove = null }) {
  const video = sourceVideo(project);
  if (!video) throw new Error('這個專案還沒有 work/rough.mp4 → 先「剪乾淨」，再做封面');
  const info = probeMedia(video), dur = info.duration, ar = info.width / info.height, plan = planOf(project);
  const fmt = format || formatOf(project, plan, ar), V = fmt === 'portrait';
  const dir = coverDir(project), outDir = coverOut(project);
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });
  const relp = (f) => posix(path.relative(root, f));

  const data = readCover(project);
  if (set?.title != null) data.covers.cutout = { ...(data.covers.cutout || {}), title: set.title, ...(set.kicker != null ? { kicker: set.kicker } : {}) };
  if (set?.at != null) data.at = Number(set.at);
  if (set?.title != null || set?.at != null) writeCover(project, data);

  const cand = candidates(project, video, dur);
  const useAt = data.at ?? cand.times[2];
  if (!(useAt >= 0 && useAt < dur)) throw new Error(`at ${useAt} 不在影片裡（0–${Math.floor(dur)} 秒） → 看 ${cand.sheet ? relp(cand.sheet) : '候選格'} 挑一格`);

  const scenes = COVER.scenes.filter((s) => data.covers[s] && (!only || only.includes(s)));
  if (!scenes.length) throw new Error(only ? `cover.json 裡沒有 ${only.join('、')} 的內容 → 先寫 covers.<情境>` : `還沒有封面內容 → 在 ${relp(coverFile(project))} 寫 covers.cutout／mock／icon（每一張要有 title），或先用 --title "第一行|*強調詞*" 出「去背＋內容」那一張`);

  const iconsAll = read(path.join(templateDir, 'kit', 'icons.json')) || {};
  const ctx = { icons: new Set(Object.keys(iconsAll)), duration: dur, exists: (p) => fs.existsSync(path.resolve(project, p)), hasPic: (p) => /^[\w-]+\/[\w-]+$/.test(p) && fs.existsSync(path.join(templateDir, 'kit', 'pics', `${p}.svg`)) };
  const bad = scenes.flatMap((s) => coverProblems(s, data.covers[s], ctx).map((m) => `${COVER.names[s]}：${m}`));
  if (bad.length) throw new Error(bad.join('\n'));

  // 講者那一格＋去背：同一格做過就不重做
  const frame = path.join(dir, 'frame.jpg'), cutFile = path.join(dir, 'cutout.png'), fm = read(path.join(dir, 'frame.json'));
  const fkey = `${fs.statSync(video).mtimeMs}:${useAt}`;
  let cutout = false, note = '';
  if (scenes.includes('cutout')) {
    if (fm?.key !== fkey || !fs.existsSync(frame)) {
      if (!grab(video, useAt, frame)) throw new Error(`抓不出 ${useAt} 秒那一格 → 跑 ffmpeg -version 確認 ffmpeg 能用`);
      fs.rmSync(cutFile, { force: true });
    }
    if (fm?.key === fkey && fm.cutout && fs.existsSync(cutFile)) cutout = true;
    else if (remove || matteWeights().cached) cutout = (remove || defaultRemove(root))(frame, cutFile);
    else note = `去背模型還沒下載（約 ${MATTE.sizeMb} MB）：這次「去背＋內容」的講者沒有去背 → 要的話先問使用者，同意就跑 node shared/template/tools/media.mjs matte-setup 再重做`;
    if (!cutout && !note) note = '這一格去背失敗：講者沒有去背 → 換一格（--at）再試';
    fs.writeFileSync(path.join(dir, 'frame.json'), JSON.stringify({ key: fkey, at: useAt, cutout }));
  }

  const kit = pathToFileURL(path.join(templateDir, 'kit')).href;
  const url = (p) => pathToFileURL(path.resolve(project, p)).href;
  const W = V ? 1080 : 1920, H = V ? 1920 : 1080, files = [];
  for (const scene of scenes) {
    const c = data.covers[scene], extra = {};
    if (scene === 'cutout') {
      const b = c.behind === undefined ? (finalVideo(project) ? {} : null) : c.behind;   // 沒寫 behind：有成品就放成品的一格
      if (b?.image) { extra.behind = url(b.image); const m = probeMedia(path.resolve(project, b.image)); extra.behindAr = m?.width && m?.height ? m.width / m.height : 16 / 9; }
      else if (b) {
        const src = b.from === 'rough' ? video : finalVideo(project) || video, sInfo = probeMedia(src);
        const t = b.at != null ? Number(b.at) : Math.round(sInfo.duration * 0.45 * 10) / 10;
        if (!grab(src, Math.min(t, Math.max(0, sInfo.duration - 0.1)), path.join(dir, 'behind.jpg'))) throw new Error(`抓不出後面那張內容（${relp(src)} 的 ${t} 秒） → 換一個秒數`);
        extra.behind = 'behind.jpg'; extra.behindAr = sInfo.width / sInfo.height;
      }
    }
    if (scene === 'mock' && c.mock.kind === 'image') extra.image = url(c.mock.image);
    if (scene === 'icon') {
      if (c.image) extra.image = url(c.image);
      else if (c.pic) extra.picSvg = fs.readFileSync(path.join(templateDir, 'kit', 'pics', `${c.pic}.svg`), 'utf8');
    }
    const html = path.join(dir, `cover-${scene}.html`), png = path.join(dir, `cover-${scene}.png`), jpg = coverJpg(project, scene);
    fs.writeFileSync(html, coverHtml({ scene, format: fmt, cover: c, frame: 'frame.jpg', cutout: cutout ? 'cutout.png' : null, ar, speakerBox: Array.isArray(plan.speakerBox) ? plan.speakerBox : null, icons: iconsAll, kit, ...extra }));
    htmlShot({ chrome, file: html, out: png, width: W, height: H });
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', png, '-vf', `crop=${W}:${H}:0:0`, '-q:v', '2', jpg], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`存不出 ${path.basename(jpg)}：${String(r.stderr).trim().slice(-200)} → 跑 ffmpeg -version 確認 ffmpeg 能用`);
    fs.rmSync(png, { force: true });
    files.push(jpg);
  }
  log(`✓ 封面 ${files.length} 張（${V ? '直式 1080×1920，標題和主視覺在中間 3:4 裡' : '橫式 1920×1080'}${scenes.includes('cutout') ? `；講者用 ${useAt} 秒那一格${cutout ? '、已去背' : ''}` : ''}）`);
  scenes.forEach((s, i) => log(`  ${COVER.names[s]}：${relp(files[i])}`));
  const missing = COVER.scenes.filter((s) => !data.covers[s]);
  if (missing.length && !only) log(`  還沒有內容、沒出圖：${missing.map((s) => COVER.names[s]).join('、')}`);
  if (note) log(`⚠ ${note}`);
  if (cand.sheet && scenes.includes('cutout')) log(`→ 想換表情：看 ${relp(cand.sheet)}（左上到右下是 ${cand.times.join('、')} 秒），再跑同一條加 --at <秒>`);
  return { files, scenes, at: useAt, cutout, sheet: cand.sheet, format: fmt };
}

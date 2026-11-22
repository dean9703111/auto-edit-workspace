// 082 片尾金句的字、位置、大小（lib/ending.mjs、editor.mjs、剪輯台頁面共用；頁面從 /editor/ending-layout.mjs 載，所以不能 import node 的東西）
//
//   plan.json  "ending": { "quote": "…", "x": 1300, "y": 575, "size": 48, "w": 580, "lineSpacing": 0.07, "gap": 1 }   x、y＝金句框左上角（畫布 px），size＝字級（px），
//              w＝框寬（px；沒寫＝預設寬跟著字級等比例），lineSpacing＝行間距（剪映的單位：行高＝字級 ×（1.448＋行間距）），
//              gap＝段與段之間空幾行（0–2，可以有小數）；沒寫＝QUOTE 的預設
//   JY、jySize、jyWidth           剪映的單位（剪輯台照剪映的數字顯示）：字號 7＝48 px、固定寬度 290＝580 px
//   QUOTE                         預設（照作者剪映的定剪：書封右邊，字 48、行高 73、框寬 580、段與段之間空一行）
//   QUOTE_SIZE、QUOTE_LS、QUOTE_GAP 字級、行間距、段落間距（行）的範圍
//   quoteParse(text, { auto })    → { lines, manual }。字裡有換行（或 //）＝作者自己分的段（manual）：一段一個區塊，標點照打的留著，太長照框寬自動換行；
//                                 沒有換行（講稿的 > 引言、舊的 plan.json）照剪映的定剪：逗點處分段、拿掉句尾的句號
//   quoteLines(text)              quoteParse(text).lines
//   quoteBox(o, q)                { left, top, size, width, line, gap, manual }：行高＝字級 ×（1.448＋行間距）；gap＝段落間距（px）；q＝quoteParse 的結果
//   quoteRows(lines, box)         估總行數（照框寬自動換行，不含段落間距）
//   quoteHeight(lines, box)       整段的高（px，含段落間距）
//   quoteFits(lines, box, { W, H }) → null｜'下緣'｜'右緣'（超出畫面的哪一邊）
//   clampQuotePos(o, { W, H }, q) x、y、w 夾在畫面裡（框的左上角不出去，框不超出右緣）
import { richPlain } from './text.mjs';

// 剪映的定剪（jianying-editing scripts/tpl_ending_quote.json）：字號 7（×0.887）、行間距 0.07、固定寬度 290、段與段之間一個空行 → 48 px、行高 73、寬 580
//   行高＝字級 ×（JY.em＋行間距）：思源黑體（Source Han Sans／Noto Sans TC）一行本來的高是 1.448 個字，48 ×（1.448＋0.07）＝72.9 ≈ 73
export const JY = Object.freeze({ em: 1.448, perPx: 7 / 48, widthPerPx: 0.5 });
export const jySize = (px) => Math.round(px * JY.perPx * 10) / 10;   // 字級 px → 剪映字號
export const jyWidth = (px) => Math.round(px * JY.widthPerPx);        // 框寬 px → 剪映固定寬度
export const QUOTE = Object.freeze({ at: 0.633, type: 5.23, fade: 0.5, left: 1300, top: 575, width: 580, size: 48, line: 73, lineSpacing: 0.07, gap: 1 });
export const QUOTE_SIZE = Object.freeze({ min: 24, max: 120 });
export const QUOTE_LS = Object.freeze({ min: 0, max: 1 });    // 行間距（剪映的單位）
export const QUOTE_GAP = Object.freeze({ min: 0, max: 2 });   // 段落間距（段與段之間空幾行）
export const QUOTE_KEYS = ['x', 'y', 'size', 'w', 'lineSpacing', 'gap'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

//   auto＝講稿的 > 引言、金句字卡（不是作者為片尾打的字）：一律照剪映的定剪分（換行也當分段）
export function quoteParse(text, { auto = false } = {}) {
  const t = richPlain(String(text ?? '').replace(/\/\//g, '\n').replace(/\r/g, ''));
  if (!auto && t.includes('\n')) return { lines: t.split('\n').map((s) => s.trim()).filter(Boolean), manual: true };
  return { lines: t.split(/[，,\n]+/).map((s) => s.trim().replace(/[。.]+$/, '')).filter(Boolean), manual: false };
}
export const quoteLines = (text) => quoteParse(text).lines;

// 行間距（剪映的單位）：夾在範圍裡、取到 0.01
export const quoteLineSpacing = (v) => (isNum(v) ? Math.round(clamp(v, QUOTE_LS.min, QUOTE_LS.max) * 100) / 100 : QUOTE.lineSpacing);
// 段落間距（行）：夾在範圍裡、取到 0.05
export const quoteGap = (v) => (isNum(v) ? Math.round(clamp(v, QUOTE_GAP.min, QUOTE_GAP.max) * 20) / 20 : QUOTE.gap);
// 框寬：預設照字級等比例（一行放的字數不變）；寫了 w 就固定，最窄兩個字
export const quoteDefaultWidth = (size) => Math.round(QUOTE.width * (size / QUOTE.size));

export function quoteBox(o = {}, q = null) {
  const size = Math.round(clamp(isNum(o?.size) ? o.size : QUOTE.size, QUOTE_SIZE.min, QUOTE_SIZE.max));
  const line = Math.round(size * (JY.em + quoteLineSpacing(o?.lineSpacing)));
  return {
    left: Math.round(isNum(o?.x) ? o.x : QUOTE.left), top: Math.round(isNum(o?.y) ? o.y : QUOTE.top),
    size, width: isNum(o?.w) ? Math.round(Math.max(size * 2, o.w)) : quoteDefaultWidth(size), line, gap: Math.round(line * quoteGap(o?.gap)), manual: !!q?.manual,
  };
}

// 一行放幾個字（全形 1、半形 0.55）；每段照框寬換行
export const quotePerLine = (box) => Math.max(1, Math.floor(box.width / box.size));
export function quoteRows(lines, box) {
  const per = box.width / box.size;
  return lines.reduce((n, p) => n + Math.max(1, Math.ceil([...p].reduce((w, ch) => w + (ch.codePointAt(0) <= 0x7e ? 0.55 : 1), 0) / per - 1e-9)), 0);
}
export const quoteHeight = (lines, box) => quoteRows(lines, box) * box.line + Math.max(0, lines.length - 1) * box.gap;
export const quoteMaxRows = (box, H) => Math.max(0, Math.floor((H - box.top) / box.line));

export function quoteFits(lines, box, { W, H }) {
  if (box.left + box.width > W) return '右緣';
  if (lines.length && box.top + quoteHeight(lines, box) > H) return '下緣';
  return null;
}

export function clampQuotePos(o, { W, H }, q = null) {
  const b = quoteBox(o, q), w = Math.min(b.width, W);
  const r = { x: Math.round(clamp(b.left, 0, Math.max(0, W - w))), y: Math.round(clamp(b.top, 0, Math.max(0, H - b.line))), size: b.size };
  if (isNum(o?.w)) r.w = w;
  return r;
}

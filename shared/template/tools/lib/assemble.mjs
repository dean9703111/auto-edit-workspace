// 情境模板 → 子合成檔 compositions/<id>-<key>.html（規格 §B.3 外殼與 7 條組裝規則）
//
//   assembleScene({ scene, ctx, beats, id, D, tone, exitFade, chapter, css, chtag, prev }) → { html, compId, file, parts }
//     prev＝前一段是什麼（speaker／fullscreen／pip，plan.mjs 的 it.prev）→ root 的 data-prev，模板選進場用（motion.md §3.1）
//     parts = { style, body, timeline }（已加前綴與範圍，預覽頁共用）
//   prefixIds({ style, body, timeline }, prefix) → 同形物件＋ids（body 的 id 全部加前綴，style／timeline 的 #id 一起換；data-links 的元件 id 與產生的線 id 也換）
//   scopeCss(css, scopeSel)        → 每個頂層規則的每個選擇器前加 scopeSel（有 @ 規則就丟錯）
//   checkRefs(parts, rootId)       → style／timeline 裡找不到的 #id 清單（自檢）
//   stampHash(html, info) / verifyHash(text)   檔頭第二行雜湊註解（保護手改）
//   readCustom(file)               → { compId, errors, refs }（第二層 x-*.html 的基本檢查；refs＝scanCueRefs 的結果）
//   scanCueRefs(html)              → string[]：<template> 裡 <script> 的 P.at('…') 與 P.sfx(名, '…') 的 ref 字面值（去掉註解、去重、照出現順序；specs/contracts/cues.md §3.2、motion.md §5）
//   scanSfxCues(html)              → [{ name, ref, off }]：P.sfx('success', '#38@兩支', 0.2) 的靜態解析（motion.md §5 的 regex；build 做成 <audio>）

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { render } from './mustache.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- 雜湊 ----------

// Studio（0.8.216）一打開就會在每個 html 元素蓋上 data-hf-id（記在 .hyperframes/hf-ids-stamped.json），
// 這不算手改：算雜湊前先拿掉，否則開過 preview 後每次 build 都會被當成手改擋下
export const hashOf = (text) => createHash('sha1').update(text.replace(/ data-hf-id="[^"]*"/g, '')).digest('hex').slice(0, 8);
const STAMP_RE = /^<!-- auto-edit: (.*?) hash=([0-9a-f]{8}) -->\r?\n/m;
export function stampHash(html, info) {
  const nl = html.indexOf('\n');
  const line = `<!-- auto-edit: ${info} hash=${hashOf(html)} -->\n`;
  return html.slice(0, nl + 1) + line + html.slice(nl + 1);
}
export function verifyHash(text) {
  const m = text.slice(0, 600).match(STAMP_RE);
  if (!m) return { stamped: false, ok: false };
  const rest = text.slice(0, m.index) + text.slice(m.index + m[0].length);
  return { stamped: true, ok: hashOf(rest) === m[2], info: m[1] };
}

// ---------- CSS ----------

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// 依頂層逗號切選擇器（括號內的逗號不切，例如 :has(a, b)）
function splitSelectors(sel) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

export function scopeCss(css, scopeSel) {
  const src = stripComments(css);
  let out = '', i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) { if (src.slice(i).trim()) throw new Error(`CSS 結尾有多餘的文字：「${src.slice(i).trim().slice(0, 40)}」`); break; }
    const sel = src.slice(i, open).trim();
    if (sel.startsWith('@')) throw new Error(`情境 CSS 不支援 @ 規則（${sel.split(/\s/)[0]}）：請改成一般選擇器`);
    let depth = 1, j = open + 1;
    while (j < src.length && depth > 0) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
    if (depth !== 0) throw new Error(`CSS 大括號沒有成對：「${sel.slice(0, 40)}」`);
    const block = src.slice(open, j);
    if (/\{[^{}]*\{/.test(block)) throw new Error(`情境 CSS 不支援巢狀規則：「${sel.slice(0, 40)}」`);
    const sels = splitSelectors(sel).map((s) => (s === scopeSel || s.startsWith(`${scopeSel} `) || s.startsWith(`${scopeSel}:`) || s.startsWith(`${scopeSel}.`) ? s : `${scopeSel} ${s}`));
    out += `${sels.join(', ')} ${block.trim()}\n`;
    i = j;
  }
  return out;
}

// ---------- id 前綴 ----------

const selectorIds = (css) => [...stripComments(css).replace(/\{[^{}]*\}/g, '\n').matchAll(/#([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
const bodyIds = (body) => [...body.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);

// data-links="a>b c-d"（kit/scene-layout.js）：拆成兩個元件 id（「-」從左找第一個兩邊都是 id 的位置）；產生的線 id＝<a>-<b>、箭頭頭 <a>-<b>-head
const splitLink = (pair, idset) => {
  const k = pair.indexOf('>');
  if (k > 0) return { a: pair.slice(0, k), sep: '>', b: pair.slice(k + 1) };
  for (let i = pair.indexOf('-'); i > 0; i = pair.indexOf('-', i + 1)) if (idset.has(pair.slice(0, i)) && idset.has(pair.slice(i + 1))) return { a: pair.slice(0, i), sep: '-', b: pair.slice(i + 1) };
  return null;
};
const linkPairs = (body, idset) => [...body.matchAll(/data-links="([^"]*)"/g)].flatMap((m) => m[1].trim().split(/\s+/).filter(Boolean).map((p) => splitLink(p, idset)).filter(Boolean));
const linkIdsOf = (body) => linkPairs(body, new Set(bodyIds(body))).flatMap(({ a, b }) => [`${a}-${b}`, `${a}-${b}-head`]);

// 要加前綴的 id＝body 的 id ∪ 模板 style 選擇器用到的 id（選填元素沒出現時 style 仍會寫到，例：側邊欄 :has(#sItem4)、沒有眉標時的 #sEyebrow）
export function prefixIds({ style, css = '', body, timeline }, prefix) {
  const ids0 = [...new Set([...bodyIds(body), ...selectorIds(style)])], idset = new Set(ids0);
  const map = new Map(ids0.map((id) => [id, `${prefix}${id}`]));
  // data-links 產生的線 id：兩邊各自加前綴（<p><a>-<p><b>），timeline 的 '#a-b'、'#a-b-head' 跟著換
  const links = linkPairs(body, idset);
  for (const { a, b } of links) { map.set(`${a}-${b}`, `${prefix}${a}-${prefix}${b}`); map.set(`${a}-${b}-head`, `${prefix}${a}-${prefix}${b}-head`); }
  const ids = [...map.keys()];
  const re = ids.length ? new RegExp(`#(${ids.map(reEsc).sort((x, y) => y.length - x.length).join('|')})(?![\\w-])`, 'g') : null;
  const replaceRefs = (text) => (re ? text.replace(re, (m, id) => `#${map.get(id)}`) : text);
  const b = body.replace(/(?<![\w-])id="([^"]+)"/g, (m, id) => `id="${map.get(id)}"`)
    .replace(/(href|xlink:href)="#([^"]+)"/g, (m, at, id) => (map.has(id) ? `${at}="#${map.get(id)}"` : m))
    .replace(/url\(#([\w-]+)\)/g, (m, id) => (map.has(id) ? `url(#${map.get(id)})` : m))
    .replace(/data-links="([^"]*)"/g, (m, v) => `data-links="${v.trim().split(/\s+/).filter(Boolean).map((p) => { const l = splitLink(p, idset); return l ? `${map.get(l.a)}${l.sep}${map.get(l.b)}` : p; }).join(' ')}"`);
  let t = replaceRefs(timeline);
  // 字串串接的選擇器：'#s' + i、'#n' + i、'#it' + i
  t = t.replace(/(['"])#([\w-]+)\1(\s*\+)/g, (m, q, head, plus) => {
    if (head.startsWith(prefix)) return m;
    return ids.some((id) => id.startsWith(head)) ? `${q}#${prefix}${head}${q}${plus}` : m;
  });
  return { style: replaceRefs(style), css: replaceRefs(css), body: b, timeline: t };
}

// 自檢：plan.json css 的 #id 要是這個情境有的元素；timeline 字串裡的 #id 要在 body 找得到
export function checkRefs({ style, css = '', body, timeline }, rootId) {
  const inBody = new Set([rootId, ...bodyIds(body), ...linkIdsOf(body)]);   // data-links 產生的線（執行時才有 path）也算
  const known = new Set([...inBody, ...selectorIds(style)]);
  const missing = new Set();
  for (const id of selectorIds(css)) if (!known.has(id)) missing.add(id);
  for (const lit of timeline.matchAll(/(['"])((?:(?!\1).)*)\1/g)) {
    for (const m of lit[2].matchAll(/#([A-Za-z_][\w-]*)/g)) {
      // 串接的前綴（'#s05-s' + i）：有 id 以它開頭就算找得到
      const concat = /^\s*\+/.test(timeline.slice(lit.index + lit[0].length)) && m.index + m[0].length === lit[2].length;
      if (inBody.has(m[1]) || (concat && [...inBody].some((id) => id.startsWith(m[1])))) continue;
      missing.add(m[1]);
    }
  }
  return [...missing];
}

// ---------- 附件：章節角標 ----------

function chtagParts(chapter, fullscreen, portrait = false) {
  // 直式（canvas.mjs 的 badge）：疊加情境的角標在左上 x 60、y 250；全畫面家族的子合成仍是 1920×1080（舞台縮放），位置不變
  const pos = fullscreen ? 'left: 1424px; top: 150px; width: 432px;' : portrait ? 'left: 60px; top: 250px;' : 'right: 96px; top: 56px;';
  return {
    style: `#cBadge { position: absolute; ${pos} }\n`,
    body: `<div id="cBadge" class="sc-chtag">\n  <div class="sc-chtag__shell"><span class="sc-chtag__num">${esc(chapter.num)}</span></div>\n  <div class="sc-chtag__band"><span class="sc-chtag__name">${esc(chapter.name)}</span></div>\n</div>\n`,
    timeline: `P.drift('#cBadge', 0, { dx: P.DRIFT });\nP.in('#cBadge .sc-chtag__num, #cBadge .sc-chtag__name', P.BEAT);\n`,
  };
}

// ---------- 子合成 ----------

const indent = (s, n) => s.replace(/\s+$/, '').split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');
const num = (x) => String(+Number(x).toFixed(3));

// SceneMotion 的 els() 用全域 gsap 查選擇器，跨不到 runtime 的子合成範圍：
// 先用 inline script 的 document（runtime 已限縮在這個子合成內）把選擇器換成元素陣列再交給 P。
export const SCOPE_P = `[ 'in', 'out', 'drift', 'reveal', 'rise', 'maskUp', 'sideIn', 'sideOut' ].forEach(function (k) { var f = P[k]; P[k] = function (s) { var a = Array.prototype.slice.call(arguments); a[0] = $q(s); return f.apply(P, a); }; });
[ 'swap', 'axis' ].forEach(function (k) { var f = P[k]; P[k] = function (s1, s2) { var a = Array.prototype.slice.call(arguments); a[0] = $q(s1); a[1] = $q(s2); return f.apply(P, a); }; });`;

// format＝"portrait"（009）：@style-portrait 接在 @style 後面；body 的 data-layout-portrait="X" 換掉 data-layout（12 的直式排法）。
// 橫式把 data-layout-portrait 拿掉，輸出和沒有這兩樣時逐位元組相同
export function sceneParts({ scene, ctx, beats, id, D, tone, exitFade = true, chapter = null, css = '', chtag = false, format = 'landscape' }) {
  const portrait = format === 'portrait';
  const compId = `${id}-${scene.key}`;
  const prefix = `${id}-`;
  const shared = {
    seg: { id: compId, dir: compId, title: '' }, D: num(D), tone: tone || '', tone_warn: tone === 'warn', tone_good: tone === 'good',
    exitFade: exitFade !== false, theme: 'channel', chapter, bg: {}, profile: 'course', yt: false, course: true,
  };
  const beatStr = Object.fromEntries(Object.entries(beats).map(([k, v]) => [k, num(v)]));
  const view = { ...ctx, ...beatStr, ...shared };
  for (const [k, v] of Object.entries(ctx)) if (Array.isArray(v)) view[k] = v.map((it) => ({ ...it, at: num(it.at) }));
  let style = render(scene.template.style, view);
  if (portrait && scene.template.stylePortrait) style += render(scene.template.stylePortrait, view);
  let body = render(scene.template.body, view);
  body = portrait ? body.replace(/\sdata-layout="[^"]*"(\s[^>]*?)?\sdata-layout-portrait="([^"]*)"/g, (m, mid = '', v) => ` data-layout="${v}"${mid}`)
    : body.replace(/\sdata-layout-portrait="[^"]*"/g, '');
  let timeline = render(scene.template.timeline, view);
  if (chtag && chapter) {
    const p = chtagParts(chapter, scene.family === 'fullscreen', portrait);
    style += p.style; body += p.body; timeline += p.timeline;
    if (shared.exitFade && scene.family !== 'fullscreen') timeline += `P.out('#cBadge', D - P.OUT);\n`;
  }
  const pre = prefixIds({ style, css, body, timeline }, prefix);
  const missing = checkRefs(pre, compId);
  if (missing.length) {
    const hint = selectorIds(style).concat(bodyIds(body)).filter((x, i, a) => a.indexOf(x) === i).map((x) => `#${x}`).join('、');
    throw new Error(`id 前綴自檢失敗：${missing.map((x) => `#${x.startsWith(prefix) ? x.slice(prefix.length) : x}`).join('、')} 在這個情境裡找不到 → plan.json 的 css 只能用這些 id：${hint}`);
  }
  const scoped = scopeCss(pre.style + (pre.css ? `${pre.css}\n` : ''), `#${compId}`);
  const surface = scene.surface && scene.surface !== 'side' ? `<div class="sc-surface-${scene.surface} fill"></div>\n` : '';
  return { compId, prefix, style: scoped, body: surface + `<div id="${prefix}aWrap" class="fill">\n${indent(pre.body, 2)}\n</div>\n`, timeline: pre.timeline };
}

// 直式：疊加情境（scene.json "portrait": "move"）的子合成是 1080×1920；舞台縮放的（"stage"：01、04 家族）仍是 1920×1080，由主合成的 host 縮放
export function assembleScene(opts) {
  const { scene, id, D, tone, prev } = opts;
  const p = sceneParts(opts);
  const [cw, ch] = opts.format === 'portrait' && scene.portrait === 'move' ? [1080, 1920] : [1920, 1080];
  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="UTF-8"><title>${esc(`${id} ${scene.zh}`)}</title></head>
<body>
<template id="${p.compId}-template">
  <style>
    #${p.compId} { position: absolute; inset: 0; }
    #${p.compId} .fill { position: absolute; inset: 0; }
${indent(p.style, 4)}
  </style>
  <div id="${p.compId}" data-composition-id="${p.compId}" data-width="${cw}" data-height="${ch}" data-duration="${num(D)}" data-scene="${scene.key}"${tone ? ` data-tone="${tone}"` : ''}${prev ? ` data-prev="${prev}"` : ''}>
${indent(p.body, 4)}
  </div>
  <script>
  (function () {
    var $q = function (s) { return typeof s === 'string' ? Array.prototype.slice.call(document.querySelectorAll(s)) : s; };
    const tl = gsap.timeline({ paused: true });
    const P = SceneMotion(tl, document.getElementById('${p.compId}'));
${indent(SCOPE_P, 4)}
    const D = ${num(D)};
${indent(p.timeline, 4)}
    P.end(D);
    window.__timelines['${p.compId}'] = tl;
  })();
  </script>
</template>
</body>
</html>
`;
  return { html: stampHash(html, `id=${id} scene=${scene.key}`), compId: p.compId, file: `compositions/${p.compId}.html`, parts: p };
}

// ---------- 第二層（AI 手寫 x-*.html）----------

export function readCustom(file, expectId) {
  const errors = [];
  if (!existsSync(file)) return { errors: [`找不到 ${file}：先寫好這支子合成（<template> 格式，見 shared/template/USAGE-reference.md 的 R7），再登記到 plan.json`] };
  const text = readFileSync(file, 'utf8');
  const tpl = text.match(/<template[^>]*>([\s\S]*)<\/template>/i);
  if (!tpl) errors.push('沒有 <template>：子合成的 style、畫面與 script 都要包在 <template> 裡');
  const inner = tpl ? tpl[1] : text;
  const m = inner.match(/data-composition-id="([^"]+)"/);
  const compId = m ? m[1] : null;
  if (!compId) errors.push('<template> 裡找不到 data-composition-id');
  else if (compId !== expectId) errors.push(`data-composition-id 是「${compId}」，要和檔名一致改成「${expectId}」`);
  if (compId && !new RegExp(`__timelines\\[\\s*['"]${reEsc(compId)}['"]\\s*\\]`).test(inner)) errors.push(`script 沒有登記 window.__timelines['${compId}']`);
  if (/<head>[\s\S]*<style/i.test(text.split(/<template/i)[0])) errors.push('<style> 放在 <head> 會被丟掉，要放進 <template>');
  for (const s of scanBadCueRefs(text)) errors.push(s.startsWith('P.sfx')
    ? `${s}：音效名與 ref 要寫成字串字面值、off 寫數字（例 P.sfx('success', '#38@兩支')、P.sfx('ding', '#41', 0.2)；音效名只有小寫英數字與 -），build 才排得出音效 → 不要用變數或 + 組字串`
    : `${s}：ref 要寫成字串字面值（例 P.at('#18@逐字稿')、P.at('#18', 0.3)），build 才算得到秒數 → 不要用變數或 + 組字串`);
  return { compId, errors, refs: scanCueRefs(text), sfx: scanSfxCues(text) };
}

const scriptBodies = (html) => {
  const tpl = String(html).match(/<template[^>]*>([\s\S]*)<\/template>/i);
  const inner = tpl ? tpl[1] : String(html);
  return [...inner.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(([, body]) => body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1'));
};
// 第一個參數不是「完整的字串字面值」（後面直接接 , 或 )）也不是數字的 P.at(…)：例 P.at('#9' + '9')、P.at(ref)。回傳原文片段（B-11）
export function scanBadCueRefs(html) {
  const out = [];
  for (const code of scriptBodies(html)) {
    for (const m of code.matchAll(/\bP\.at\(\s*/g)) {
      const rest = code.slice(m.index + m[0].length);
      if (/^(['"])[^'"\n]*\1\s*[,)]/.test(rest) || /^-?\d/.test(rest)) continue;
      const snip = `P.at(${rest.split(/[)\n]/)[0].trim()})`;
      if (!out.includes(snip)) out.push(snip);
    }
    for (const m of code.matchAll(/\bP\.sfx\(/g)) {
      const rest = code.slice(m.index);
      if (new RegExp(`^${SFX_RE.source}`).test(rest)) continue;
      const snip = `P.sfx(${code.slice(m.index + m[0].length).split(/[)\n]/)[0].trim()})`;
      if (!out.includes(snip)) out.push(snip);
    }
  }
  return out;
}
// motion.md §5 的原始碼 regex：P.sfx('名', 'ref'[, off])，名＝小寫英數字與 -，ref／off 都是字面值
export const SFX_RE = /\bP\.sfx\(\s*(['"])([a-z0-9-]+)\1\s*,\s*(['"])([^'"\n]+)\3\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?\)/g;
export function scanSfxCues(html) {
  const out = [];
  for (const code of scriptBodies(html)) for (const m of code.matchAll(SFX_RE)) out.push({ name: m[2], ref: m[4], off: m[5] != null ? Number(m[5]) : 0 });
  return out;
}

// 情境動畫綁句：只看 <template> 裡的 <script>；/* */ 與 //（行首或空白後面才算，避開字串裡的 http://）註解先拿掉。
// 第一個參數是完整的字串字面值（後面直接接 , 或 )）才收（'#18'、"#18@逐字稿"；寫錯的 '3.2' 也收，讓 plan 報 ✖）；
// 用變數或 + 組的不收，readCustom 用 scanBadCueRefs 報 ✖
export function scanCueRefs(html) {
  const out = [];
  for (const code of scriptBodies(html)) {
    for (const m of code.matchAll(/\bP\.at\(\s*(['"])([^'"\n]*)\1\s*(?=[,)])/g)) if (!out.includes(m[2])) out.push(m[2]);
    for (const m of code.matchAll(SFX_RE)) if (!out.includes(m[4])) out.push(m[4]);
  }
  return out;
}

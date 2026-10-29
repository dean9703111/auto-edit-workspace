// 情境模板 → 子合成檔 compositions/<id>-<key>.html（規格 §B.3 外殼與 7 條組裝規則）
//
//   assembleScene({ scene, ctx, beats, id, D, tone, exitFade, chapter, css, chtag }) → { html, compId, file, parts }
//     parts = { style, body, timeline }（已加前綴與範圍，預覽頁共用）
//   prefixIds({ style, body, timeline }, prefix) → 同形物件＋ids（body 的 id 全部加前綴，style／timeline 的 #id 一起換）
//   scopeCss(css, scopeSel)        → 每個頂層規則的每個選擇器前加 scopeSel（有 @ 規則就丟錯）
//   checkRefs(parts, rootId)       → style／timeline 裡找不到的 #id 清單（自檢）
//   stampHash(html, info) / verifyHash(text)   檔頭第二行雜湊註解（保護手改）
//   readCustom(file)               → { compId, errors }（第二層 x-*.html 的基本檢查）

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

// 要加前綴的 id＝body 的 id ∪ 模板 style 選擇器用到的 id（選填元素沒出現時 style 仍會寫到，例：側邊欄 :has(#sItem4)、沒有眉標時的 #sEyebrow）
export function prefixIds({ style, css = '', body, timeline }, prefix) {
  const ids = [...new Set([...bodyIds(body), ...selectorIds(style)])];
  const map = new Map(ids.map((id) => [id, `${prefix}${id}`]));
  const re = ids.length ? new RegExp(`#(${ids.map(reEsc).sort((x, y) => y.length - x.length).join('|')})(?![\\w-])`, 'g') : null;
  const replaceRefs = (text) => (re ? text.replace(re, (m, id) => `#${map.get(id)}`) : text);
  const b = body.replace(/(?<![\w-])id="([^"]+)"/g, (m, id) => `id="${map.get(id)}"`)
    .replace(/(href|xlink:href)="#([^"]+)"/g, (m, at, id) => (map.has(id) ? `${at}="#${map.get(id)}"` : m))
    .replace(/url\(#([\w-]+)\)/g, (m, id) => (map.has(id) ? `url(#${map.get(id)})` : m));
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
  const inBody = new Set([rootId, ...bodyIds(body)]);
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

function chtagParts(chapter, fullscreen) {
  const pos = fullscreen ? 'left: 1344px; top: 150px; width: 512px;' : 'right: 96px; top: 56px;';
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

export function sceneParts({ scene, ctx, beats, id, D, tone, exitFade = true, chapter = null, css = '', chtag = false }) {
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
  let body = render(scene.template.body, view);
  let timeline = render(scene.template.timeline, view);
  if (chtag && chapter) {
    const p = chtagParts(chapter, scene.family === 'fullscreen');
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

export function assembleScene(opts) {
  const { scene, id, D, tone } = opts;
  const p = sceneParts(opts);
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
  <div id="${p.compId}" data-composition-id="${p.compId}" data-width="1920" data-height="1080" data-duration="${num(D)}" data-scene="${scene.key}"${tone ? ` data-tone="${tone}"` : ''}>
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
  if (!existsSync(file)) return { errors: [`找不到 ${file}：先寫好這支子合成（<template> 格式，見 ref/template/USAGE-reference.md 的 R7），再登記到 plan.json`] };
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
  return { compId, errors };
}

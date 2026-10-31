// 示意插圖 SVG 的風格檢查（純函式、零相依）：專案自己畫的元件（work/hyperframes/illus-local/<name>.svg）
// 要和 kit/illus.js 的內建元件同一個畫法。規則出處：shared/template/kit/illus-style.md。
//
//   lintIllusSvg(svgText, { name, size, states }) → findings[]
//     name    元件名（只用在訊息裡，例 'router'）
//     size    建議尺寸：[w, h]、{ w, h } 或 '220x120'／'220×120'；有給才檢查 viewBox 比例
//     states  狀態名陣列（例 ['led', 'warn']）：每個都要有 <g class="il-<狀態>">，預設 opacity 0
//   finding＝{ level: 'error'|'warn', rule, msg, fix }（和 audit 的 finding 同欄位，由 media.mjs／audit 接線時補 id、檔名）
//
// 檢查：描邊寬只在 {4, 3, 2} 且 non-scaling-stroke、顏色只用 --il-* token、只用基本形狀（沒有 text／image／漸層／濾鏡…）、
//       沒有 id、viewBox＝0 0 W H 且比例和建議尺寸一致、狀態群組存在。

export const IL_TOKENS = ['--il-body', '--il-inner', '--il-line', '--il-sub', '--il-accent', '--il-on-accent', '--il-accent-soft', '--il-warn', '--il-good', '--il-alt'];
export const STROKE_WIDTHS = [4, 3, 2];
export const SHAPES = ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path'];
const ALLOWED = new Set(['svg', 'g', 'title', 'desc', ...SHAPES]);
const WHY_NOT = {
  text: '字由 HTML 寫在元件旁邊（≤ 10 字），SVG 裡不放字', tspan: '字由 HTML 寫', textPath: '字由 HTML 寫',
  image: '不用點陣圖，畫成線條', foreignObject: '不嵌 HTML', script: '不放程式', style: '不內嵌 CSS（顏色寫屬性 var(--il-*)）',
  linearGradient: '不用漸層，用實色 token', radialGradient: '不用漸層，用實色 token', pattern: '不用填充圖樣',
  filter: '不用濾鏡、光暈、陰影', mask: '不用遮罩，直接畫形狀', clipPath: '不用裁切，直接畫形狀',
  use: '不引用別的形狀，直接畫', symbol: '不用 symbol，直接畫', defs: '不用 defs（漸層、濾鏡都不准）', marker: '箭頭直接用 polygon 畫',
};
const COLOR_PROPS = ['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color'];
const STYLE_OK = new Set(['opacity', 'transform-box', 'transform-origin', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'vector-effect']);
const BAD_ATTRS = ['filter', 'mask', 'clip-path', 'href', 'xlink:href'];
const PATH_NUMS_MAX = 80;
const RATIO_TOL = 0.02;

function parseSize(size) {
  if (size == null) return null;
  if (Array.isArray(size)) return { w: +size[0], h: +size[1] };
  if (typeof size === 'object') return { w: +size.w, h: +size.h };
  const m = String(size).match(/^\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*$/i);
  return m ? { w: +m[1], h: +m[2] } : null;
}
function parseAttrs(s) {
  const a = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[m[1]] = m[2] ?? m[3];
  return a;
}
function parseStyle(s) {
  const o = {};
  for (const part of String(s || '').split(';')) {
    const i = part.indexOf(':');
    if (i > 0) o[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return o;
}
// 極簡 XML 樹：只認元素（註解、<?xml?>、DOCTYPE、CDATA 先拿掉）；結構錯回 { error }
function parseTree(text) {
  const src = String(text).replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const root = { tag: '#root', attrs: {}, kids: [] };
  const stack = [root];
  for (const m of src.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g)) {
    const [, close, tag, rest, self] = m;
    if (close) {
      const top = stack.pop();
      if (!top || top.tag !== tag) return { error: `</${tag}> 對不到開頭的 <${top ? top.tag : '?'}>` };
      continue;
    }
    const node = { tag, attrs: parseAttrs(rest), kids: [] };
    stack[stack.length - 1].kids.push(node);
    if (!self) stack.push(node);
  }
  if (stack.length !== 1) return { error: `<${stack[stack.length - 1].tag}> 沒有關起來` };
  return { root };
}

export function lintIllusSvg(svgText, { name = '', size, states = [] } = {}) {
  const out = [];
  const who = name ? `${name}：` : '';
  const err = (rule, msg, fix) => out.push({ level: 'error', rule, msg: who + msg, fix });
  const warn = (rule, msg, fix) => out.push({ level: 'warn', rule, msg: who + msg, fix });

  const t = parseTree(svgText);
  if (t.error) { err('illus-parse', `SVG 解析不了（${t.error}）`, '照 kit/illus-style.md 的範例重寫，每個元素都要關起來（<rect … /> 或 <g>…</g>）'); return out; }
  const tops = t.root.kids;
  if (tops.length !== 1 || tops[0].tag !== 'svg') { err('illus-root', `最外層要是一個 <svg>（現在是 ${tops.map((n) => `<${n.tag}>`).join('、') || '空的'}）`, '整個檔只有一個 <svg viewBox="0 0 W H" fill="none">…</svg>'); return out; }
  const svg = tops[0];

  // viewBox
  const vb = (svg.attrs.viewBox || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[0] !== 0 || vb[1] !== 0 || vb[2] <= 0 || vb[3] <= 0) {
    err('illus-viewbox', `viewBox 要是「0 0 寬 高」（現在是「${svg.attrs.viewBox ?? '沒寫'}」）`, 'viewBox 貼齊圖形外框、從 0 0 開始，寬高＝素材清單的建議尺寸');
  } else {
    const want = parseSize(size);
    if (want && want.w > 0 && want.h > 0) {
      const r = vb[2] / vb[3], rw = want.w / want.h;
      if (Math.abs(r - rw) / rw > RATIO_TOL) err('illus-ratio', `viewBox ${vb[2]}×${vb[3]} 的比例 ${r.toFixed(2)} 和建議尺寸 ${want.w}×${want.h}（${rw.toFixed(2)}）差超過 ${RATIO_TOL * 100}%`, `把 viewBox 和圖形改成 ${want.w}×${want.h}；或先改素材清單的建議尺寸`);
      else if (Math.abs(vb[2] - want.w) > 1 || Math.abs(vb[3] - want.h) > 1) warn('illus-size', `viewBox ${vb[2]}×${vb[3]} 不等於建議尺寸 ${want.w}×${want.h}（比例對，但描邊粗細會和內建元件不一致）`, `座標照 ${want.w}×${want.h} 畫（viewBox 單位＝1 px）`);
    }
  }

  const tokenRe = new RegExp(`^var\\(\\s*(${IL_TOKENS.join('|')})\\s*\\)$`);
  const colorOk = (v) => v === 'none' || tokenRe.test(String(v).trim());
  let shapes = 0;
  const seen = new Set();
  const once = (key, f) => { if (!seen.has(key)) { seen.add(key); f(); } };

  const walk = (node, inh) => {
    const tag = node.tag, a = node.attrs, st = parseStyle(a.style);
    if (!ALLOWED.has(tag)) {
      const why = WHY_NOT[tag] || (tag.startsWith('fe') ? WHY_NOT.filter : '只用 g、rect、circle、ellipse、line、polyline、polygon、path');
      once(`el:${tag}`, () => err('illus-element', `不能用 <${tag}>`, why));
      return;
    }
    if (a.id != null) once('id', () => err('illus-id', `有 id="${a.id}"（同一個元件會掛好幾次，id 會撞）`, '拿掉 id；要動的部分用 class="il-<名稱>"'));
    for (const k of BAD_ATTRS) if (a[k] != null) once(`attr:${k}`, () => err('illus-attr', `不能寫 ${k}="${a[k]}"`, k.includes('href') ? '不引用外部或別的形狀，直接畫' : '不用濾鏡、遮罩、裁切，直接畫形狀'));
    for (const k of Object.keys(a)) if (/^on/i.test(k)) once(`attr:${k}`, () => err('illus-attr', `不能寫事件屬性 ${k}`, '拿掉；動畫由 timeline 做'));
    for (const k of Object.keys(st)) if (!STYLE_OK.has(k)) once(`style:${k}`, () => err('illus-style', `style 不能寫 ${k}`, 'style 只寫 opacity（狀態預設 0）、transform-box、transform-origin；顏色寫 fill／stroke 屬性'));
    for (const p of COLOR_PROPS) {
      for (const v of [a[p], st[p]]) {
        if (v == null || colorOk(v)) continue;
        once(`color:${p}:${v}`, () => err('illus-color', `${p}="${v}" 不是 token`, `顏色只寫 none 或 var(${IL_TOKENS.slice(0, 3).join(')、var(')})…（kit/illus-style.md 的 token 表）`));
      }
    }
    const raw = Object.entries(a).filter(([k]) => k !== 'style' && !COLOR_PROPS.includes(k)).map(([, v]) => v).join(' ');
    const lit = raw.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|color-mix)\(/i);
    if (lit) once(`lit:${lit[0]}`, () => err('illus-color', `寫死了色碼「${lit[0]}」`, '顏色只寫在 fill／stroke，值用 var(--il-*)'));

    const stroke = st.stroke ?? a.stroke ?? inh.stroke;
    const width = st['stroke-width'] ?? a['stroke-width'] ?? inh.width;
    if (SHAPES.includes(tag)) {
      shapes++;
      if (stroke != null && stroke !== 'none') {
        const w = parseFloat(String(width ?? '1').replace(/px$/, ''));
        if (!STROKE_WIDTHS.includes(w)) once(`sw:${width}`, () => err('illus-stroke', `描邊寬 ${width ?? '沒寫（預設 1）'} 不在 4／3／2`, '外框 4、內部零件 3、細節 2；有描邊的形狀都要寫 stroke-width'));
        const ve = st['vector-effect'] ?? a['vector-effect'];
        if (ve !== 'non-scaling-stroke') once(`ve:${tag}`, () => err('illus-stroke', `有描邊的 <${tag}> 沒寫 vector-effect="non-scaling-stroke"`, '每個有描邊的形狀都加 vector-effect="non-scaling-stroke"（vector-effect 不會從 <g> 繼承）'));
      }
      if (tag === 'path') {
        const nums = (String(a.d || '').match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).length;
        if (nums > PATH_NUMS_MAX) once(`path:${nums}`, () => warn('illus-path', `有一條 path 用了 ${nums} 個數字（> ${PATH_NUMS_MAX}），太細`, '示意圖只畫輪廓：拆成 rect／circle／line，或減少節點'));
      }
    }
    for (const k of node.kids) walk(k, { stroke, width });
  };
  walk(svg, {});
  if (shapes === 0) err('illus-empty', '沒有任何形狀', '至少畫一個 rect／circle／path…');

  // 狀態群組
  const groups = [];
  const collect = (n) => { if (n.tag === 'g') groups.push(n); n.kids.forEach(collect); };
  collect(svg);
  for (const s of states) {
    const cls = `il-${s}`;
    const g = groups.find((n) => String(n.attrs.class || '').split(/\s+/).includes(cls));
    if (!g) { err('illus-state', `缺狀態群組 <g class="${cls}">`, `把「${s}」狀態要多畫的形狀包進 <g class="${cls}" style="opacity:0">…</g>`); continue; }
    const op = parseStyle(g.attrs.style).opacity ?? g.attrs.opacity;
    if (op == null || parseFloat(op) !== 0) warn('illus-state', `狀態群組 .${cls} 預設不是 opacity 0`, `寫成 <g class="${cls}" style="opacity:0">，底圖畫「沒有狀態」的樣子，動畫時再 P.in 打開`);
  }
  return out;
}

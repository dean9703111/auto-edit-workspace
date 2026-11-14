// 字幕子合成 compositions/captions.html（規格 §B.4）
//
//   buildCaptions(cues, { duration, offset, compId, blackout, canvas, style }) → { html, file, compId, shown, items, style }
//     items＝畫面上實際顯示的字幕 [{ n, text, a, b, spans: [[起, 迄]] }]（剪映素材的 字幕.srt 照這份寫）
//     duration  主合成長度（秒）；超過的字幕截掉
//     offset    測試片段的起點（--test）：所有字幕往前平移 offset 秒，落在 [0, duration) 外的略過
//     blackout  [[起, 迄]]（完成影片秒數，章節轉場的 2.5 秒）：這些時間不放字幕，被切到的字幕提早收或晚出現（spec FR-007）
//     canvas    lib/canvas.mjs 的版式設定（預設橫式）：直式時 root 1080×1920、帶 data-format="portrait"（kit/captions.css 換位置）
//     style     035 字幕樣式（lib/caption-style.mjs；不給或預設＝F8，輸出和以前逐位元相同）：root 多 data-cap 與 --cap-* 變數
//   captionWarnings(cues, canvas, style)  → 字數／寬度警告（--check 也印）；字數與寬度上限讀 canvas.caption.maxChars／maxW（橫式 18／1840、直式 10／834），估寬照字級
//
// 每則字幕 <div class="cg" id="cg-N"><span>…</span></div>，初始 opacity:0; visibility:hidden（inline，captions.css 沒寫），
// tl.set 開、tl.set 硬關；同一時間只顯示一則（前一則截到下一則起點）；0 秒開頭的挪到 0.1。

import { stampHash } from './assemble.mjs';
import { visibleLen } from './scenes.mjs';
import { r3 } from './time.mjs';
import { subtract } from './edit.mjs';
import { captionGeom, captionRootAttrs, isDefaultStyle } from './caption-style.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 估寬（F8，kit/captions.css）：Noto Sans TC 76px 全形 76、半形約 0.52 em（40）、空白約 0.25 em（19），無字距，左右內距 37
export const CAPTION = { font: 76, half: 40, space: 19, pad: 74, maxW: 1840, maxChars: 18, minDur: 0.6 };
// g＝lib/caption-style.mjs 的 captionGeom（035：字級改了照比例估）；不給＝76 px
export const captionWidth = (text, g = null) => {
  const m = g ? { font: g.size, space: g.space, half: g.half, pad: g.padW } : CAPTION;
  let w = 0;
  for (const ch of String(text)) { const c = ch.codePointAt(0); w += c >= 0x2e80 || (c >= 0xff00 && c <= 0xffef) ? m.font : ch === ' ' ? m.space : m.half; }
  return Math.round(w + m.pad);
};

// 字幕不顯示的句中標點（F8：剪映 437 則只有「、！？」）
const MID_PUNCT = /[，。；：]/;
const listN = (xs) => `${xs.slice(0, 8).map((c) => `#${c.n}`).join('、')}${xs.length > 8 ? ` 等 ${xs.length} 則` : ''}`;
export function captionWarnings(cues, canvas = null, style = null) {
  const out = [];
  const lim = canvas?.format === 'portrait' ? canvas.caption : CAPTION;
  const g = isDefaultStyle(style) ? null : captionGeom(style, canvas);
  for (const c of cues) {
    const len = visibleLen(c.text);
    const w = captionWidth(c.text, g);
    if (len > lim.maxChars) out.push(`字幕 #${c.n}「${c.text}」${len} 字，超過 ${lim.maxChars} 字 → 在 rough.srt 拆成兩則（斷在標點處）`);
    else if (w > lim.maxW) out.push(`字幕 #${c.n} 估寬 ${w}px，超過 ${lim.maxW}px → 在 rough.srt 拆句`);
  }
  const punct = cues.filter((c) => MID_PUNCT.test(c.text));
  if (punct.length) out.push(`字幕含句中標點「，。；：」：${listN(punct)} → 字幕不顯示這四種標點（保留「、！？」），跑 media.mjs srt-align 或在剪輯台改`);
  const short = cues.filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end - c.start < CAPTION.minDur - 1e-9);
  if (short.length) out.push(`字幕不到 ${CAPTION.minDur} 秒：${listN(short)} → 在剪輯台和前後句合併，或把起迄拉長`);
  return out;
}

export function buildCaptions(cues, { duration, offset = 0, compId = 'captions', blackout = [], canvas = null, style = null }) {
  const portrait = canvas?.format === 'portrait';
  const items = [];
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  sorted.forEach((c, i) => {
    let a = c.start - offset;
    let b = c.end - offset;
    const next = sorted[i + 1];
    if (next) b = Math.min(b, next.start - offset);   // 同時只顯示一則
    b = Math.min(b, duration);
    if (a < 0.1) a = 0.1;                               // 0 秒就出現看起來像殘留
    if (b - a < 0.05) return;
    if (!blackout.length) { items.push({ n: c.n, text: c.text, a: r3(a), b: r3(b), spans: [[r3(a), r3(b)]] }); return; }
    const spans = subtract([a, b], blackout.map(([x, y]) => [x - offset, y - offset])).filter(([x, y]) => y - x >= 0.05).map(([x, y]) => [r3(x), r3(y)]);
    if (spans.length) items.push({ n: c.n, text: c.text, a: spans[0][0], b: spans[spans.length - 1][1], spans });
  });
  const divs = items.map((it) => `    <div class="cg" id="cg-${it.n}" style="opacity:0;visibility:hidden"><span>${esc(it.text)}</span></div>`).join('\n');
  const sets = items.flatMap((it) => it.spans.map(([a, b]) => `    tl.set('#cg-${it.n}', { opacity: 1, visibility: 'visible' }, ${a});\n    tl.set('#cg-${it.n}', { opacity: 0, visibility: 'hidden' }, ${b});`)).join('\n');
  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="UTF-8"><title>字幕</title></head>
<body>
<template id="${compId}-template">
  <style>
    #${compId} { position: absolute; inset: 0; pointer-events: none; }
  </style>
  <div id="${compId}" data-composition-id="${compId}" data-width="${portrait ? canvas.W : 1920}" data-height="${portrait ? canvas.H : 1080}"${portrait ? ' data-format="portrait"' : ''}${style ? captionRootAttrs(style, canvas) : ''} data-duration="${r3(duration)}" data-layout-allow-caption-zone>
${divs}
  </div>
  <script>
  (function () {
    const tl = gsap.timeline({ paused: true });
${sets}
    tl.set({}, {}, ${r3(duration)});
    window.__timelines['${compId}'] = tl;
  })();
  </script>
</template>
</body>
</html>
`;
  return { html: stampHash(html, `captions=${items.length}`), file: `compositions/${compId}.html`, compId, shown: items.length, items, style: isDefaultStyle(style) ? null : style };
}

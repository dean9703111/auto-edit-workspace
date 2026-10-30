// 字幕子合成 compositions/captions.html（規格 §B.4）
//
//   buildCaptions(cues, { duration, offset, compId }) → { html, file, compId, shown, warnings }
//     duration  主合成長度（秒）；超過的字幕截掉
//     offset    測試片段的起點（--test）：所有字幕往前平移 offset 秒，落在 [0, duration) 外的略過
//   captionWarnings(cues)  → 字數／寬度警告（--check 也印）
//
// 每則字幕 <div class="cg" id="cg-N"><span>…</span></div>，初始 opacity:0; visibility:hidden（inline，captions.css 沒寫），
// tl.set 開、tl.set 硬關；同一時間只顯示一則（前一則截到下一則起點）；0 秒開頭的挪到 0.1。

import { stampHash } from './assemble.mjs';
import { visibleLen } from './scenes.mjs';
import { r3 } from './time.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 估寬：Noto Sans TC 54px 全形 54、半形約 0.55 em，字距 1，左右內距 24
export const captionWidth = (text) => {
  let w = 0;
  for (const ch of String(text)) { const c = ch.codePointAt(0); w += (c >= 0x2e80 || (c >= 0xff00 && c <= 0xffef) ? 54 : ch === ' ' ? 15 : 30) + 1; }
  return Math.round(w + 48);
};

export function captionWarnings(cues) {
  const out = [];
  for (const c of cues) {
    const len = visibleLen(c.text);
    const w = captionWidth(c.text);
    if (len > 18) out.push(`字幕 #${c.n}「${c.text}」${len} 字，超過 18 字 → 在 rough.srt 拆成兩則（斷在標點處）`);
    else if (w > 1600) out.push(`字幕 #${c.n} 估寬 ${w}px，超過 1600px → 在 rough.srt 拆句`);
  }
  return out;
}

export function buildCaptions(cues, { duration, offset = 0, compId = 'captions' }) {
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
    items.push({ n: c.n, text: c.text, a: r3(a), b: r3(b) });
  });
  const divs = items.map((it) => `    <div class="cg" id="cg-${it.n}" style="opacity:0;visibility:hidden"><span>${esc(it.text)}</span></div>`).join('\n');
  const sets = items.map((it) => `    tl.set('#cg-${it.n}', { opacity: 1, visibility: 'visible' }, ${it.a});\n    tl.set('#cg-${it.n}', { opacity: 0, visibility: 'hidden' }, ${it.b});`).join('\n');
  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="UTF-8"><title>字幕</title></head>
<body>
<template id="${compId}-template">
  <style>
    #${compId} { position: absolute; inset: 0; pointer-events: none; }
  </style>
  <div id="${compId}" data-composition-id="${compId}" data-width="1920" data-height="1080" data-duration="${r3(duration)}" data-layout-allow-caption-zone>
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
  return { html: stampHash(html, `captions=${items.length}`), file: `compositions/${compId}.html`, compId, shown: items.length };
}

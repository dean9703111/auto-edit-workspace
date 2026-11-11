// 第二層情境動畫（shared/template/custom/x-*.html）的預覽頁（零依賴；build.mjs --gallery 呼叫，寫到 shared/template/preview/x-*.html）
//
//   buildCustomPreview({ name, html, pipStyle, kitLinks }) → string（獨立頁，不是 HF 合成）
//     name      檔名去掉 .html（x-process）；html 是 custom 檔全文，要有 <template id="<name>-template">
//     pipStyle  子母畫面裡講者底圖的位置（lib/pip.mjs 的 pipGeometry().style）；kitLinks＝lib/main.mjs 的 KIT_LINKS（呼叫端傳，本檔不 import 002 的模組）
//   頁面骨架同 lib/main.mjs 的 buildPreview（舞台、speaker.jpg、#pip／#pipf、fit()、背景圖）。#scene 裡直接放 <template> 的內容，
//   它的 <script> 在頁面解析時執行、建好 window.__timelines[name]；沒有 window.__cues，P.at 讀 root 的 data-cues-sample。
//   外層時間軸：整段淡入淡出 0.5 秒（build 對 fullscreen custom 做的事）、重播間隔 1.2 秒；?t=秒數 停在那一刻；
//   父頁協定同 buildPreview：hf-preview-ready（cues 是 []，情境動畫沒有預設音效）、hf-preview-replay → hf-preview-started。
//   009 直式（format: 'portrait'，FR-073）：舞台 1080×1920；#scene 照 canvas.mjs 的 stageTransform('fs') 縮進上半面板（和 build 直式的全畫面 custom 一樣），
//   底下 1080×1920 的 .sc-surface-fs 底（#bd），下半是講者面板示意（pip.box、speaker-v.jpg cover；沒有就用 speaker.jpg）＋ kit/pip-frame-v.png。
//   檔名建議 x-<名稱>-v.html（呼叫端決定）。

import { CANVAS, stageTransform } from './canvas.mjs';
import { stripMarkers } from './custom-fill.mjs';

const FADE = 0.5;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildCustomPreview({ name, html, pipStyle, kitLinks = [], format = 'landscape' }) {
  if (!/^x-[\w-]+$/.test(String(name || ''))) throw new Error(`預覽頁的名稱要是 x-<名稱>，現在是「${name}」`);
  const m = stripMarkers(String(html)).match(new RegExp(`<template id="${name}-template"[^>]*>([\\s\\S]*)</template>`, 'i'));   // 填空標記是給工具看的，預覽頁不用
  if (!m) throw new Error(`custom/${name}.html 沒有 <template id="${name}-template">`);
  const title = (String(html).match(/<title>([^<]*)<\/title>/i) || [])[1] || name;
  const st = pipStyle || { left: 0, top: 0, width: 432, height: 324 };
  const overlay = !/sc-surface-fs/.test(m[1]);   // layout: "overlay" 的模板沒有滿版底：疊在講者示意圖上、不放子母畫面
  if (format === 'portrait') return portraitPage({ name, title, body: m[1], kitLinks });
  if (format !== 'landscape') throw new Error(`format 只能是 "landscape" 或 "portrait"（現在是 ${JSON.stringify(format)}）`);
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${title}｜預覽`)}</title>
<!-- build.mjs --gallery 產生（tools/lib/custom-preview.mjs）：custom/${name}.html 的 <template> 原樣放進來，時間用 root 的 data-cues-sample；改 custom 檔後重跑 --gallery -->
${kitLinks.map((l) => `<link rel="stylesheet" href="../${l}">`).join('\n')}
<script src="../kit/style-switch.js"></script>
<script src="../kit/gsap.min.js"></script>
<script src="../kit/scene-motion.js"></script>
<script src="../kit/illus.js"></script>
<script src="../kit/scene-layout.js"></script>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; transform-origin: 0 0; }
  #footage { position: absolute; inset: 0; }
  #footage img { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }
  #scene { position: absolute; inset: 0; z-index: 30; }
  #cut { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; z-index: 35; }   /* 講者去背圖（有 preview/speaker-cutout.png 才有）：疊在 overlay 動畫上面，示意「講者站在動畫前面」的模板 */
  #pip { position: absolute; left: 1424px; top: 594px; width: 432px; height: 324px; overflow: hidden; border-radius: 6px; z-index: 40; }
  #pip img { position: absolute; left: ${st.left}px; top: ${st.top}px; width: ${st.width}px; height: ${st.height}px; }
  #pipf { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; z-index: 41; }
  .sc-surface-fs { background-image: url("../bg-fs.jpg"), var(--sc-fs-pattern); background-size: cover, 1920px 1080px; background-position: center, 0 0; background-repeat: no-repeat; }
</style>
<script>window.__timelines = window.__timelines || {};</script>
</head>
<body>
<div id="stage">
  <div id="footage"><img src="speaker.jpg" alt=""></div>
  <div id="scene">
${m[1]}
  </div>
${overlay ? '  <img id="cut" src="speaker-cutout.png" alt="" onerror="this.remove()">\n' : ''}${overlay ? '' : `  <div id="pip"><img src="speaker.jpg" alt=""></div>
  <img id="pipf" src="../kit/pip-frame.png" alt="">
`}</div>
${playerScript(name, overlay ? '#scene' : '#scene, #pip, #pipf', 1920, 1080)}
</body>
</html>
`;
}

// 外層時間軸與父頁協定（橫式、直式共用；直式只換舞台大小與淡入淡出的對象）
const playerScript = (name, sel, W, H) => `<script>
(function () {
  var stage = document.getElementById('stage');
  function fit() { var s = Math.min(window.innerWidth / ${W}, window.innerHeight / ${H}); stage.style.transform = 'scale(' + s + ')'; }
  window.addEventListener('resize', fit); fit();
  var key = ${JSON.stringify(name)};
  var start = function () {
    var inner = window.__timelines[key];
    if (!inner) { document.title = key + '｜script 出錯（看 console）'; return; }
    var D = inner.duration();
    var tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
    tl.fromTo('${sel}', { opacity: 0 }, { opacity: 1, duration: ${FADE}, ease: 'sine.out' }, 0);
    tl.add(inner.paused(false), 0);
    tl.to('${sel}', { opacity: 0, duration: ${FADE}, ease: 'sine.in' }, Math.max(${FADE}, D - ${FADE}));
    // 截圖用：網址加 ?t=秒數 就停在那一刻（例：x-process.html?t=13.9）
    var t = Number(new URLSearchParams(location.search).get('t'));
    if (t > 0) tl.pause(t);
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'hf-preview-replay') return;
      tl.restart();
      (e.source || parent).postMessage({ type: 'hf-preview-started', key: key }, '*');
    });
    parent.postMessage({ type: 'hf-preview-ready', key: key, duration: Math.round(D * 1000) / 1000, cues: [] }, '*');
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
</script>`;

function portraitPage({ name, title, body, kitLinks }) {
  const C = CANVAS.portrait, tr = stageTransform('fs', C);
  const [px, py, pw, ph] = C.pip.box;
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${title}｜直式預覽`)}</title>
<!-- build.mjs --gallery 產生（tools/lib/custom-preview.mjs，format: portrait）：custom/${name}.html 的 <template> 原樣放進來，舞台縮放 ${tr.s} 倍進上半面板（直式只顯示 x ${tr.window[0]}–${tr.window[2]}、y ${tr.window[1]}–${tr.window[3]}）；改 custom 檔後重跑 --gallery -->
${kitLinks.map((l) => `<link rel="stylesheet" href="../${l}">`).join('\n')}
<script src="../kit/style-switch.js"></script>
<script src="../kit/gsap.min.js"></script>
<script src="../kit/scene-motion.js"></script>
<script src="../kit/illus.js"></script>
<script src="../kit/scene-layout.js"></script>
<script>window.__regions = ${JSON.stringify(C.regions)};</script>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #stage { position: absolute; left: 0; top: 0; width: ${C.W}px; height: ${C.H}px; overflow: hidden; background: #000; transform-origin: 0 0; }
  #footage { position: absolute; inset: 0; }
  #footage img, #pip img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 20%; }
  #bd { position: absolute; inset: 0; z-index: 29; }
  #scene { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; z-index: 30; ${tr.css} }
  #pip { position: absolute; left: ${px}px; top: ${py}px; width: ${pw}px; height: ${ph}px; overflow: hidden; z-index: 40; }
  #pipf { position: absolute; left: 0; top: 0; width: ${C.W}px; height: ${C.H}px; z-index: 41; }
  #pv-label { position: absolute; left: 24px; top: ${py + 24}px; z-index: 42; padding: 6px 16px; border-radius: 8px; background: rgba(0, 0, 0, 0.55); color: #fff; font: 700 28px/40px system-ui, sans-serif; }
  .sc-surface-fs { background-image: url("../bg-fs.jpg"), var(--sc-fs-pattern); background-size: cover, 1920px 1080px; background-position: center, 0 0; background-repeat: no-repeat; }
</style>
<script>window.__timelines = window.__timelines || {};</script>
</head>
<body>
<div id="stage">
  <div id="footage"><img src="speaker-v.jpg" onerror="this.onerror=null;this.src='speaker.jpg'" alt=""></div>
  <div id="bd" class="sc-surface-fs"></div>
  <div id="scene">
${body}
  </div>
  <div id="pip"><img src="speaker-v.jpg" onerror="this.onerror=null;this.src='speaker.jpg'" alt=""></div>
  <img id="pipf" src="../kit/pip-frame-v.png" alt="">
  <div id="pv-label">講者面板（示意）</div>
</div>
${playerScript(name, '#bd, #scene, #pip, #pipf, #pv-label', C.W, C.H)}
</body>
</html>
`;
}

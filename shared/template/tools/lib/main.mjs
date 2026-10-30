// 主合成 index.html／test.html（規格 §B.2、§B.6）與情境預覽頁 preview/NN-key.html（§F.3）
//
//   buildMain({ items, videoDur, captions, pip, sideShift, bg, test, footage, editFx }) → { html, skipped }
//     items     resolvePlan().items（起點排序；已有 compId／file／start／end／fade 資訊；media 段由 lib/media.mjs 產生）
//     videoDur  成片長度（有 edit.cuts 時已扣掉剪掉的範圍）
//     footage／editFx  resolvePlan() 的同名欄位（沒有 edit 時是 null，輸出和舊版逐位元組相同）
//     captions  { compId, file }
//     pip       pipGeometry() 結果
//     test      { t0, len }：產生測試片段（root 長度＝len，底片 data-media-start＝t0，全部平移 −t0）
//   buildPreview({ scene, parts, D, sub, pipStyle, cues }) → html（獨立頁，不是 HF 合成；cues＝[{ sound, at, volume? }] 畫面事件秒數，給父頁排音效）

import { r3 } from './time.mjs';
import { SCOPE_P } from './assemble.mjs';
import { mediaParts } from './media.mjs';

const FADE = 0.5;
const PUSH = 0.7;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrJson = (o) => JSON.stringify(o).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
const n3 = (x) => String(r3(x));
const indent = (s, n) => s.replace(/\s+$/, '').split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');

export const KIT_LINKS = ['kit/fonts.css', 'kit/brand.css', 'kit/scene.css', 'kit/theme.css', 'kit/captions.css'];

export function bgCss(prefix) {
  return `.sc-surface-fs, .sc-surface-ch { background-image: url("${prefix}bg.jpg"); background-size: cover; background-position: center; }
.sc-surface-side { background-image: url("${prefix}bg.jpg"); background-size: 1920px auto; background-position: 0 50%; }`;
}

export function buildMain({ items, videoDur, captions, pip, sideShift = 480, bg = false, test = null, footage = null, editFx = null }) {
  const t0 = test ? test.t0 : 0;
  // 測試片段放在 compositions/test-clip.html（放在專案根目錄會被 lint 當成第二個 root：multiple_root_compositions，
  // 正式 render 還可能重複播音）。data-composition-src 以專案根目錄為準，其他相對路徑以檔案位置為準，所以 kit／assets 前面加 ../
  const base = test ? '../' : '';
  // root 不用 id="root"：字卡動態（fx-*.html）子合成的根就叫 #root，主合成寫 #root { background:#000 } 會套到它身上、把底片整個蓋黑
  const rootId = test ? 'test-root' : 'main-root';
  const DUR = test ? r3(Math.min(test.len, videoDur - t0)) : videoDur;
  const skipped = [];
  // 測試片段：只收起點落在 [t0, t0+len) 的段；起點在 t0 之前、還在播的段略過並回報
  const list = [];
  for (const it of items) {
    if (!test) { list.push({ ...it, s: it.start, e: it.end, fullEnd: true }); continue; }
    if (it.start >= t0 - 1e-6 && it.start < t0 + DUR) list.push({ ...it, s: r3(it.start - t0), e: r3(Math.min(it.end - t0, DUR)), fullEnd: it.end - t0 <= DUR + 1e-6 });
    else if (it.start < t0 && it.end > t0) skipped.push(it);
  }
  let track = 2;
  const hosts = [], pips = [], tl = [];
  const footTweens = [];
  const hasMedia = list.some((it) => it.type === 'media');
  const hasLens = list.some((it) => it.type === 'media' && it.media.lenses?.length);
  for (const it of list) {
    const d = r3(it.e - it.s);
    // 子母畫面：只有聲音的區間不放、接點（cut）切開；沒有這些時就是整段一支（和舊版相同）
    const pieces = [];
    if (it.pip) {
      for (const p of it.pipPieces || [{ s: it.start, e: it.end, ms: it.start }]) {
        const s = test ? r3(p.s - t0) : p.s;
        const e = test ? r3(Math.min(p.e - t0, DUR)) : p.e;
        if (s >= DUR - 1e-6 || e - s < 1e-3) continue;
        pieces.push({ s, d: r3(e - s), ms: p.ms, sfx: pieces.length ? `-${pieces.length + 1}` : '' });
      }
    }
    const group = [`#el-${it.id}`];
    const pipIds = pieces.flatMap((p) => [`#pip-${it.id}${p.sfx}`, `#pipf-${it.id}${p.sfx}`]);
    if (it.type === 'media') {
      const mp = mediaParts({ ...it, pipIds }, { off: t0, lim: t0 + DUR, base, nextTrack: () => track++, mediaDb: editFx?.mediaDb ?? 0, edit: editFx, outDur: videoDur });
      hosts.push(mp.html);
      tl.push(...mp.tl);
    } else {
      const varAttr = it.type === 'fx' ? `\n       data-variable-values='${attrJson(it.vars)}'` : '';
      hosts.push(`  <div id="el-${it.id}" data-composition-id="${it.compId}" data-composition-src="${it.file}"${varAttr}
       data-start="${n3(it.s)}" data-duration="${n3(d)}" data-track-index="${track++}" data-width="1920" data-height="1080" style="z-index:${it.z}"></div>`);
    }
    for (const p of pieces) {
      const st = pip.style;
      pips.push(`  <div class="pip" id="pip-${it.id}${p.sfx}" data-layout-allow-overflow>
    <video id="pipv-${it.id}${p.sfx}" src="${base}assets/rough.mp4" data-start="${n3(p.s)}" data-duration="${n3(p.d)}" data-media-start="${n3(p.ms)}"
           data-track-index="${track++}" muted playsinline style="left:${st.left}px;top:${st.top}px;width:${st.width}px;height:${st.height}px"></video>
  </div>
  <img id="pipf-${it.id}${p.sfx}" class="clip pip-frame" src="${base}kit/pip-frame.png" alt=""
       data-start="${n3(p.s)}" data-duration="${n3(p.d)}" data-track-index="${track++}">`);
    }
    group.push(...pipIds);
    if (it.opaque && it.type !== 'media') {
      const g = group.join(', ');
      if (it.fadeIn) tl.push(`tl.fromTo('${g}', { opacity: 0 }, { opacity: 1, duration: ${FADE}, ease: 'sine.out' }, ${n3(it.s)});`);
      if (it.fadeOut && it.fullEnd) tl.push(`tl.to('${g}', { opacity: 0, duration: ${FADE}, ease: 'sine.in' }, ${n3(Math.max(it.s, it.e - FADE))});`);
    }
    if (it.side && sideShift > 0) {
      footTweens.push({ at: it.s, kind: 'in' });
      if (it.exitFade && it.fullEnd) footTweens.push({ at: r3(it.e - PUSH), kind: 'out' });
      else if (it.footageReset != null && it.footageReset - t0 < DUR) footTweens.push({ at: r3(it.footageReset - t0), kind: 'reset' });
    }
  }
  // 側邊欄：底片層右移 sideShift，和面板 P.sideIn 同一條 9 點曲線、0.7 秒（§B.6）
  footTweens.sort((a, b) => a.at - b.at).forEach((f, i) => {
    const ir = i === 0 ? '' : ', immediateRender: false';
    if (f.kind === 'in') tl.push(`tl.fromTo('#footage', { x: 0 }, { x: ${sideShift}, duration: ${PUSH}, ease${ir} }, ${n3(f.at)});`);
    else if (f.kind === 'out') tl.push(`tl.fromTo('#footage', { x: ${sideShift} }, { x: 0, duration: ${PUSH}, ease${ir} }, ${n3(f.at)});`);
    else tl.push(`tl.set('#footage', { x: 0 }, ${n3(f.at)});`);
  });

  // 剪輯台（edit）：punch 放大跳接、dip 過黑、整支淡入淡出（畫面用 GSAP；聲音在 <video>／<audio> 的 data-fade-*）
  const overlays = [];
  let footCss = '';
  if (editFx) {
    if (editFx.punches.length) footCss = `    #footage { transform-origin: ${editFx.origin}; }\n`;
    for (const p of editFx.punches) {
      const a = r3(p.a - t0), b = r3(p.b - t0);
      if (b <= 0 || a >= DUR) continue;
      tl.push(`tl.set('#footage', { scale: ${editFx.scale} }, ${n3(Math.max(0, a))});`);
      if (b < DUR) tl.push(`tl.set('#footage', { scale: 1 }, ${n3(b)});`);
    }
    let dips = 0;
    for (const dp of editFx.dips) {
      const h = r3(dp.dur / 2), a = r3(dp.at - h - t0);
      if (a < 0 || a >= DUR) continue;
      tl.push(`tl.fromTo('#edit-dip', { opacity: 0 }, { opacity: 1, duration: ${h}, ease: 'sine.in', immediateRender: false }, ${n3(a)});`);
      tl.push(`tl.fromTo('#edit-dip', { opacity: 1 }, { opacity: 0, duration: ${h}, ease: 'sine.out', immediateRender: false }, ${n3(a + h)});`);
      dips++;
    }
    if (dips) overlays.push('  <div id="edit-dip"></div>');
    let fades = 0;
    if (editFx.fadeIn > 0 && t0 < editFx.fadeIn) {
      tl.push(`tl.fromTo('#edit-fade', { opacity: ${n3(1 - t0 / editFx.fadeIn)} }, { opacity: 0, duration: ${n3(editFx.fadeIn - t0)}, ease: 'none' }, 0);`);
      fades++;
    }
    if (editFx.fadeOut > 0) {
      const st = r3(videoDur - editFx.fadeOut - t0);
      if (st < DUR) {
        const from = st >= 0 ? 0 : r3(-st / editFx.fadeOut);
        tl.push(`tl.fromTo('#edit-fade', { opacity: ${from} }, { opacity: 1, duration: ${n3(editFx.fadeOut + Math.min(0, st))}, ease: 'none'${fades ? ', immediateRender: false' : ''} }, ${n3(Math.max(0, st))});`);
        fades++;
      }
    }
    if (fades) overlays.push('  <div id="edit-fade"></div>');
  }
  const needCss = hasMedia || overlays.length > 0;

  const sfx = [];
  for (const it of items) {
    const cues = [[`sfx-${it.id}`, it.sfx], ...(it.sfxExtra || []).map((c, n) => [`sfx-${it.id}-e${n + 1}`, c])];
    for (const [id, c] of cues) {
      if (!c) continue;
      const at = r3(c.at - t0);
      if (at < 0 || at >= DUR) continue;
      sfx.push(`  <audio id="${id}" src="${base}assets/sfx/${c.name}.wav" data-start="${n3(at)}" data-track-index="${track++}" data-volume="${c.volume}"></audio>`);
    }
  }
  // 底片：沒有 edit 時整支一個 <video>；有 cuts／dip 時切成幾支（data-media-start 跳過剪掉的範圍）
  let footVideo;
  if (!footage) {
    footVideo = `    <video id="rough" src="${base}assets/rough.mp4" data-start="0" data-duration="${n3(DUR)}"${test ? ` data-media-start="${n3(t0)}"` : ''}
           data-track-index="0" data-has-audio="true" playsinline></video>`;
  } else {
    const v = [];
    for (const c of footage.clips) {
      const s = Math.max(c.s, t0), e = Math.min(c.e, t0 + DUR);
      if (e - s < 1e-3) continue;
      const fi = Math.abs(s - c.s) < 1e-6 && c.fadeIn > 0 ? ` data-fade-in="${n3(c.fadeIn)}"` : '';
      const fo = Math.abs(e - c.e) < 1e-6 && c.fadeOut > 0 ? ` data-fade-out="${n3(c.fadeOut)}"` : '';
      const vol = c.volume != null ? ` data-volume="${c.volume}"` : '';
      v.push(`    <video id="rough${v.length ? `-${v.length + 1}` : ''}" src="${base}assets/rough.mp4" data-start="${n3(s - t0)}" data-duration="${n3(e - s)}" data-media-start="${n3(c.ms + (s - c.s))}"
           data-track-index="0" data-has-audio="true"${vol}${fi}${fo} playsinline></video>`);
    }
    footVideo = v.join('\n');
  }
  const capTrack = track++;
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=1920, height=1080">
  <title>${test ? `測試片段 ${t0}s 起 ${DUR}s` : '成片'}</title>
  <script src="${base}kit/gsap.min.js"></script>
${KIT_LINKS.map((l) => `  <link rel="stylesheet" href="${base}${l}">`).join('\n')}${needCss ? `\n  <link rel="stylesheet" href="${base}kit/media.css">` : ''}
  <script src="${base}kit/scene-motion.js"></script>${hasLens ? `\n  <script src="${base}kit/media.js"></script>` : ''}
  <style>
    body { margin: 0; background: #000; }
    #${rootId} { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #000; }
    #footage { position: absolute; inset: 0; z-index: 0; }
${footCss}    #footage video { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }
    /* 子母畫面本體 x 1344–1856、y 630–918（512×288），和 scene-catalog／pip-frame.png 同一組數字 */
    .pip { position: absolute; left: 1344px; top: 630px; width: 512px; height: 288px; overflow: hidden; border-radius: 6px; z-index: 40; }
    .pip video { position: absolute; }
    .pip-frame { z-index: 41; }
${bg ? indent(bgCss(`${base}assets/`), 4) + '\n' : ''}  </style>
</head>
<body>
<!-- build.mjs 產生；要改請改 plan.json 再重跑 build（手改會被雜湊保護擋下）-->
<div id="${rootId}" data-composition-id="${test ? 'test-clip' : 'main'}" data-start="0" data-duration="${n3(DUR)}" data-width="1920" data-height="1080" data-fps="30">

  <!-- L0 底片 -->
  <div id="footage">
${footVideo}
  </div>

  <!-- L1／L2 情境與字卡動態（z-index：一般 20、不透明 30、透明字卡動態 50）-->
${hosts.join('\n')}

  <!-- 子母畫面：靜音主軌複本＋外框 png -->
${pips.join('\n')}

  <!-- L3 字幕 -->
  <div id="el-captions" data-composition-id="${captions.compId}" data-composition-src="${captions.file}"
       data-track-kind="captions" data-start="0" data-duration="${n3(DUR)}" data-track-index="${capTrack}"
       data-width="1920" data-height="1080" style="z-index:60"></div>
${overlays.length ? `\n  <!-- 剪輯台：dip 過黑（字幕下面）、整支淡入淡出（連字幕一起）-->\n${overlays.join('\n')}\n` : ''}
  <!-- L4 音效 -->
${sfx.join('\n')}
</div>
<script>
(function () {
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  const ease = SceneMotion.pushEase;
${indent(tl.join('\n'), 2)}
  tl.set({}, {}, ${n3(DUR)});
  window.__timelines['${test ? 'test-clip' : 'main'}'] = tl;
})();
</script>
</body>
</html>
`;
  return { html, skipped, duration: DUR };
}

// ---------- 預覽頁（--gallery）----------

export function buildPreview({ scene, parts, D, sub, pipStyle, cues = [] }) {
  const opaque = ['fullscreen', 'chapter'].includes(scene.family);
  const pip = scene.family === 'fullscreen';
  const side = scene.key === 'side-panel';
  const tl = [];
  if (opaque) {
    tl.push(`tl.fromTo('#scene${pip ? ', #pip, #pipf' : ''}', { opacity: 0 }, { opacity: 1, duration: ${FADE}, ease: 'sine.out' }, 0);`);
    tl.push(`tl.to('#scene${pip ? ', #pip, #pipf' : ''}', { opacity: 0, duration: ${FADE}, ease: 'sine.in' }, ${n3(D - FADE)});`);
  }
  if (side) {
    tl.push(`tl.fromTo('#footage', { x: 0 }, { x: 480, duration: ${PUSH}, ease: SceneMotion.pushEase }, 0);`);
    tl.push(`tl.fromTo('#footage', { x: 480 }, { x: 0, duration: ${PUSH}, ease: SceneMotion.pushEase, immediateRender: false }, ${n3(D - PUSH)});`);
  }
  const st = pipStyle;
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${scene.num} ${scene.zh}｜預覽`)}</title>
<!-- build.mjs --gallery 產生：用 scene.json 的 sample 填模板，講者是 speaker.jpg；換主色或放 ../bg.jpg 後重新整理就會更新 -->
${KIT_LINKS.map((l) => `<link rel="stylesheet" href="../${l}">`).join('\n')}
<script src="../kit/gsap.min.js"></script>
<script src="../kit/scene-motion.js"></script>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; transform-origin: 0 0; }
  #footage { position: absolute; inset: 0; }
  #footage img { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }
  .fill { position: absolute; inset: 0; }
  #scene { position: absolute; inset: 0; z-index: ${opaque ? 30 : 20}; }
  #pip { position: absolute; left: 1344px; top: 630px; width: 512px; height: 288px; overflow: hidden; border-radius: 6px; z-index: 40; }
  #pip img { position: absolute; left: ${st.left}px; top: ${st.top}px; width: ${st.width}px; height: ${st.height}px; }
  #pipf { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; z-index: 41; }
  #cap { z-index: 60; }
  /* 背景圖：有 ../bg.jpg 就蓋在底紋上，沒有就只顯示底紋（不必重新產生預覽頁） */
  .sc-surface-fs { background-image: url("../bg.jpg"), var(--sc-fs-pattern); background-size: cover, 1920px 1080px; background-position: center, 0 0; background-repeat: no-repeat; }
  .sc-surface-ch { background-image: url("../bg.jpg"), var(--sc-ch-pattern); background-size: cover, 1920px 1080px; background-position: center, 0 0; background-repeat: no-repeat; }
  .sc-surface-side { background-image: url("../bg.jpg"), var(--sc-side-pattern); background-size: 1920px auto, 960px 1080px; background-position: 0 50%, 0 0; background-repeat: no-repeat; }
${indent(parts.style, 2)}
</style>
</head>
<body>
<div id="stage">
  <div id="footage"><img src="speaker.jpg" alt=""></div>
  <div id="scene">
    <div id="${parts.compId}" class="fill">
${indent(parts.body, 6)}
    </div>
  </div>
${pip ? `  <div id="pip"><img src="speaker.jpg" alt=""></div>\n  <img id="pipf" src="../kit/pip-frame.png" alt="">\n` : ''}  <div class="cg" id="cap"><span>${esc(sub || '')}</span></div>
</div>
<script>
window.__PREVIEW = ${JSON.stringify({ key: scene.key, duration: r3(D), cues: [...cues].sort((a, b) => a.at - b.at) })};
</script>
<script>
(function () {
  var stage = document.getElementById('stage');
  function fit() { var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080); stage.style.transform = 'scale(' + s + ')'; }
  window.addEventListener('resize', fit); fit();
  var $q = function (s) { return typeof s === 'string' ? Array.prototype.slice.call(document.querySelectorAll(s)) : s; };
  var start = function () {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
    var pv = window.__PREVIEW;
    const P = SceneMotion(tl, document.getElementById('${parts.compId}'));
${indent(SCOPE_P, 4)}
    const D = ${n3(D)};
${indent(parts.timeline, 4)}
${indent(tl.join('\n'), 4)}
    P.end(D);
    // 截圖用：網址加 ?t=秒數 就停在那一刻（例：03-side-panel.html?t=3）
    var t = Number(new URLSearchParams(location.search).get('t'));
    if (t > 0) tl.pause(t);
    // 重播協定：父頁（音效預覽）送 hf-preview-replay → 從頭播，並回 hf-preview-started
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'hf-preview-replay') return;
      tl.restart();
      (e.source || parent).postMessage({ type: 'hf-preview-started', key: pv.key }, '*');
    });
    parent.postMessage({ type: 'hf-preview-ready', key: pv.key, duration: pv.duration, cues: pv.cues }, '*');
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
</script>
</body>
</html>
`;
}

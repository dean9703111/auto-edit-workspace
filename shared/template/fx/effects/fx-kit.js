/*
 * fx-kit.js — text-motion-cards 共用工具
 *
 * 每個 effects/fx-XX-*.html 在 <template> 內用 <script src="fx-kit.js"></script> 載入，
 * 之後的 inline script 才用 window.FXKit。這支是外部 script，HyperFrames 不會幫它做
 * 子合成作用域，所以這裡一律只吃「元素」與「已讀好的變數」，不自己查 DOM、不讀 getVariables()。
 *
 * 只放每個效果都會用到的東西：底色 token、安全區、時長、字級估算、拆字、亂數。
 */
(function () {
  if (window.FXKit) return;

  // 1920×1080 的內容安全區：頂 120（品牌橫幅）、底 870（剪映字幕），左右各留 120
  const SAFE = { top: 120, bottom: 870, left: 120, right: 1800, w: 1680, h: 750, cx: 960, cy: 495 };

  const CSS = `
.fx-stage { position: absolute; inset: 0; overflow: hidden; background: var(--fx-bg);
  color: var(--fx-ink); font-family: "Noto Sans TC", sans-serif; font-weight: 900; line-height: 1; }
.fx-stage[data-bg="dark"]   { --fx-bg: #232733; --fx-ink: #ffffff; --fx-sub: rgba(255,255,255,0.5);
  --fx-hi: var(--accent); --fx-fill: var(--accent); --fx-on-fill: #14161c; --fx-panel: #14161c; --fx-scrim: none; }
.fx-stage[data-bg="light"]  { --fx-bg: var(--fx-light-bg, #f3efe6); --fx-ink: #14161c; --fx-sub: rgba(20,22,28,0.45);
  --fx-hi: var(--accent); --fx-fill: var(--accent); --fx-on-fill: #14161c; --fx-panel: #14161c; --fx-scrim: none; }
.fx-stage[data-bg="accent"] { --fx-bg: var(--accent); --fx-ink: #14161c; --fx-sub: rgba(20,22,28,0.5);
  --fx-hi: #ffffff; --fx-fill: #14161c; --fx-on-fill: #ffffff; --fx-panel: #14161c; --fx-scrim: none; }
.fx-stage[data-bg="none"]   { --fx-bg: transparent; --fx-ink: #ffffff; --fx-sub: rgba(255,255,255,0.72);
  --fx-hi: var(--accent); --fx-fill: rgba(16,18,25,0.97); --fx-on-fill: var(--accent); --fx-panel: rgba(16,18,25,0.97);
  --fx-scrim: 0 2px 5px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.95); }
.fx-safe { position: absolute; left: ${SAFE.left}px; top: ${SAFE.top}px; width: ${SAFE.w}px; height: ${SAFE.h}px;
  display: flex; align-items: center; justify-content: center; }
.fx-ch { display: inline-block; white-space: pre; }
`;
  const style = document.createElement('style');
  style.setAttribute('data-fx-kit', '');
  style.textContent = CSS;
  document.head.appendChild(style);

  // 字寬估算（em）：CJK／全形 1、大寫與數字 0.68、其他半形 0.56、空白 0.3。
  // 不量字型、不等字型載入，結果可重現；只用來壓字級上限，寧可估寬。
  function emWidth(text) {
    let w = 0;
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      if (ch === ' ') w += 0.3;
      else if (c >= 0x2e80) w += 1;
      else if (/[A-Z0-9]/.test(ch)) w += 0.68;
      else w += 0.56;
    }
    return w;
  }

  // 設計字級 design（px），文字放不進 maxWidth 時等比縮小；tracking 是字距（em／字）
  function fitSize(text, design, maxWidth = SAFE.w, tracking = 0) {
    const n = [...String(text)].length;
    const w = emWidth(text) + tracking * n;
    return Math.max(1, Math.min(design, Math.floor(maxWidth / Math.max(w, 0.01))));
  }

  // 把 el 的內容換成逐字 <span class="fx-ch">，回傳 span 陣列
  function splitChars(el, text, cls = '') {
    el.textContent = '';
    return [...String(text)].map((ch) => {
      const s = document.createElement('span');
      s.className = 'fx-ch' + (cls ? ' ' + cls : '');
      s.textContent = ch;
      el.appendChild(s);
      return s;
    });
  }

  // "A|B|C"（半形 | 或全形 ｜）→ ['A','B','C']，去空白、去空項
  function list(str) {
    return String(str ?? '').split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
  }

  // 可重現亂數：同一個 seed 每次 render 都一樣
  function rng(seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : hash(String(seed));
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  // 宿主（data-composition-src 那個 div）的 data-duration 就是這張字卡的播放長度；
  // render／snapshot 編譯後宿主屬性會改名成 data-composition-file，兩個都要認。
  // 找不到時用效果自己的預設週期
  function slotDuration(el, fallback) {
    const host = el.closest('[data-composition-src], [data-composition-file]');
    const d = parseFloat(host && host.getAttribute('data-duration'));
    return d > 0 ? d : fallback;
  }

  // 每個效果的起手式：套底色、算時長
  //   const v = window.__hyperframes.getVariables();   ← 一定要在效果自己的 inline script 讀（有作用域）
  //   const { D } = FXKit.setup(stage, v, 3);
  function setup(stage, v, defaultDuration) {
    stage.setAttribute('data-bg', v.bg || 'dark');
    return { D: slotDuration(stage, defaultDuration), bg: stage.getAttribute('data-bg') };
  }

  window.FXKit = { SAFE, emWidth, fitSize, splitChars, list, rng, slotDuration, setup };
})();

// audit.mjs 在瀏覽器裡跑的量測（零依賴）：這個檔的函式會被 toString() 送進頁面執行，不能用到函式外的任何變數。
//
//   pageSeekSource(t)            → 一段 JS：用 HyperFrames runtime 的 __player.renderSeek 跳到第 t 秒，等字型與兩格
//   pageMeasureSource(opts)      → 一段 JS：量 #<hostId> 底下每個元素，回傳原始量測（判定在 audit-rules.mjs 做）
//     opts＝{ hostId, W, H, unstage, keepAllow }（unstage：009 直式舞台縮放的段，先拿掉 stage transform 再量，見 unstageInPage；
//       keepAllow：056 字卡動態，host 的 data-layout-allow-overflow 留著）
//   pageFxDoneSource({ hostId, D, kind }) → 一段 JS：字卡動態的完成態（段內秒數；fxDoneInPage）
//     回傳 { host: { start, duration, visible }, els: [ … ], moving: N }，els 每一項：
//       { i, tag, desc: { id, cls, text, near }, rect:[l,t,r,b], inner:[l,t,r,b], text:bool, textRect, inkRect, fontSize, scale,
//         painted:bool, box:bool（可當「容器」的有底有框盒）, media:bool, full:bool, bg:bool（背景層）, shaped:bool（斜邊／旋轉縮放）,
//         clipX, clipY, sw, cw, sh, ch,
//         constraint（最近的容器在 els 的索引；-1＝畫布）, clips:[祖先中會裁切的 els 索引], moving:bool,
//         allowOverflow, allowCaption,
//         ── 003 版面規則（只給 custom 判）──
//         pos, title（標題列）, pad:[左,上,右,下], bw:[左,上,右,下], round（圓形）, kit（kit 元件）, frame（底色 alpha ≥ 0.3／背景圖／框線 ≥ 1px 且 alpha ≥ 0.15）,
//         own:[[l,t,r,b]…]（自己的文字行框＋流內的 svg／img＋巢狀框外框；不穿過 absolute 子層）, chars（自己的文字非空白字數）,
//         ownFont:{ fs, lh }（自己的文字裡字級最大的那一行）, centered, allowOverlap, allowSlack, allowTight, widthShared, parentInnerW, alpha,
//         shapeRect（svg：裡面形狀的聯集，連接線圖層用它，不用整個 svg 的框）, anc:[所有有記錄的祖先，近的在前],
//         il（011：kit/illus.js 掛的 .il>svg；rect／shapeRect 已四邊外擴描邊 2px）, ilName（那個元件的 data-illus 名） }
//       disp（display）、allowUneven、allowRepeat、justify（055：卡片寬度、重複的詞、置中）
//     另回傳 illus：host 裡 .il 元件的個數（judgeIllus 只量有元件的段）
//     055 另回傳 bigText：字級 ≥ 120 的最內層區塊 [{ desc, fs, lines（排成幾行）, br（<br> 個數）, ws, moving, rect, allowOverflow }]（大字自己斷行）；
//       glyphs：字級 ≥ 120 的每個字 [{ ch, r, moving, alpha, near }]（去背段比對講者遮罩）；
//       lines：svg 裡只描邊的形狀每 8px 一點 [{ svg（els 索引）, tag, id, pts:[[x,y]…], closed, moving }]（線穿過字或卡片）
//     另回傳 tops：custom root 與 .fill 直接底下的元素 [{ desc, pos, w, h, parent }]（給「未定位頂層」）
//   collectMotionInPage({ hostId, compId }) → 不 seek，讀 window.__timelines[compId] 的每個 tween：
//     { D, marks, tweens: [{ start, end, kind: 'enter'|'exit'|'draw'|'change', call, role, fn, targets: [{ key, parentKey, desc, chain, emph, box, il, line }] }] }；
//     il＝目標是示意元件（.il）或包著元件、line＝不在 .il／.sc-icon 裡的 svg 線（連接線）；
//     call／role／fn＝SceneMotion 打在 tween data 的「第幾個 P.* 呼叫／enter｜focus｜accent｜micro／方法名」（motion.md §4；舊 kit 沒有就是 null）；
//     逐字的 span[data-sc-ch] 併回字所在的元素；
//     時間軸不存在回 null。kind 只認 fromTo（SceneMotion 全部是 fromTo）：opacity 起點 < 0.2 ≤ 終點＝enter、反過來＝exit、
//     strokeDashoffset＝draw、clip-path 由 100% 揭開到 inset(0)＝enter，v2 的 P.wipe／P.slide＝enter、P.wipeOut／P.slideOut＝exit（看 tween data 的 fn），其他＝change。up＝目標從看不見變看得見或變亮：enter、draw、opacity 變大、
//     scale／scaleX／scaleY 從 0 長出來（P.bar 的刪除線、進度條）；位移、換數字、退場、降亮度都不算；
//     targets[].all＝目標（含子孫）全部的字（前 40 個字，055 卡上的字比講的晚用）；targets[].say＝目標自己（含子孫）的字；亮框（emph）沒字，取它亮起的那一項（最近一層有字的祖先）；刪除線、底線這類沒疊滿的線是 ''；
//     那一層有兩塊以上的字也是 ''（給「綁句對不上」比對字幕）。emph＝疊在父層上、四邊差 ≤ 8px、面積 ≥ 父層 80%（亮框）
//   判斷「動畫進行中」：所有 window.__timelines 底下 0 < progress < 1 的 tween，它的目標與目標的子孫都算在動（量到的是暫態，不判定）。
//   退出標記和 hyperframes check 一樣：data-layout-ignore（整個不量）、data-layout-allow-overflow（不判撐破／裁切）、
//   data-layout-allow-caption-zone（不判字幕區）。

export function seekInPage(t) {
  return (async () => {
    const p = window.__player;
    if (!p || typeof p.renderSeek !== 'function') throw new Error('頁面沒有 __player.renderSeek（HyperFrames runtime 沒載入）');
    p.renderSeek(t, { exact: true });
    if (typeof window.__hfWaitForSeekCompletion === 'function') await window.__hfWaitForSeekCompletion({ videoFrames: false });
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return true;
  })();
}

export function measureInPage({ hostId, W, H }) {
  const host = document.getElementById(hostId);
  if (!host) return { missingHost: true };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'META', 'LINK', 'BR', 'WBR']);
  const r2 = (n) => Math.round(n * 100) / 100;
  const box = (r) => [r2(r.left), r2(r.top), r2(r.right), r2(r.bottom)];
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const alpha = (c) => {
    const m = String(c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return c && c !== 'transparent' ? 1 : 0;
    const parts = m[1].includes(',') ? m[1].split(',') : m[1].split('/');
    const a = parts.length > 3 || m[1].includes('/') ? parts[parts.length - 1].trim() : '1';
    return a.endsWith('%') ? px(a) / 100 : px(a);
  };
  const clipVal = (v) => !!v && v !== 'visible' && v !== 'clip visible';

  // 動畫進行中的元素
  const moving = new Set();
  const seen = new Set();
  for (const tl of Object.values(window.__timelines || {})) {
    if (!tl || typeof tl.getChildren !== 'function') continue;
    let kids = [];
    try { kids = tl.getChildren(true, true, false); } catch { kids = []; }
    for (const tw of kids) {
      if (seen.has(tw)) continue;
      seen.add(tw);
      let p = 0, d = 0;
      try { p = tw.progress(); d = tw.duration(); } catch { continue; }
      if (!(d > 0 && p > 1e-6 && p < 1 - 1e-6)) continue;
      if (tw.data && tw.data.role === 'micro') continue;   // v2 微動（idle／flow／ambient／慢推）整段都在跑，不算「進行中」（motion.md §4）
      for (const tg of tw.targets()) if (tg && tg.nodeType === 1) moving.add(tg);
    }
  }
  const isMoving = (el) => { for (let n = el; n && n !== host.parentElement; n = n.parentElement) if (moving.has(n)) return true; return false; };

  const opacityChain = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) { const v = parseFloat(getComputedStyle(n).opacity); if (Number.isFinite(v)) o *= v; } return o; };
  // clip-path 把元素裁到看不見（遮罩浮字還沒浮出、P.reveal 還沒揭開）：
  // inset() 直接算剩下的框；其他形狀在框內取 15 個點，用 elementsFromPoint（會穿過蓋在上面的字幕層）測試有沒有打到
  const insetBox = (c, r) => {
    const m = String(c).match(/^inset\(([^)]*?)(?:\s+round\s[^)]*)?\)/);
    if (!m) return null;
    const v = m[1].trim().split(/\s+/);
    const [t, rt, b, l] = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]];
    const len = (s, base) => (String(s).endsWith('%') ? (px(s) / 100) * base : px(s));
    return [r.left + len(l, r.width), r.top + len(t, r.height), r.right - len(rt, r.width), r.bottom - len(b, r.height)];
  };
  const clippedAway = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n).clipPath;
      if (!c || c === 'none') continue;
      const nr = n.getBoundingClientRect();
      const ib = insetBox(c, nr);
      if (ib) { if (ib[2] - ib[0] <= 0.5 || ib[3] - ib[1] <= 0.5) return true; continue; }
      if (nr.width <= 0.5 || nr.height <= 0.5) return true;
      let hit = false;
      for (const fx of [0.05, 0.25, 0.5, 0.75, 0.95]) for (const fy of [0.25, 0.5, 0.75]) {
        if (document.elementsFromPoint(nr.left + nr.width * fx, nr.top + nr.height * fy).some((h) => h === n || n.contains(h))) hit = true;
      }
      if (!hit) return true;
    }
    return false;
  };
  const visible = (el, r) => {
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true })) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (opacityChain(el) < 0.2) return false;
    if (r.width <= 0.5 || r.height <= 0.5) return false;
    return !clippedAway(el);
  };
  const ownText = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join('').replace(/\s+/g, ' ').trim();
  const lineRects = (el) => {
    const out = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !(n.textContent || '').trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) out.push(r);
      rg.detach && rg.detach();
    }
    return out;
  };
  const union = (rs) => rs.length ? [Math.min(...rs.map((r) => r.left)), Math.min(...rs.map((r) => r.top)), Math.max(...rs.map((r) => r.right)), Math.max(...rs.map((r) => r.bottom))].map(r2) : null;
  // 字形墨跡的上下緣（line box 會比字形高，裁切要看墨跡）：canvas measureText 的 font／actual bounding box 換算
  const canvas = document.createElement('canvas').getContext('2d');
  const ink = (el, cs, rs) => {
    if (!canvas || !rs.length) return null;
    canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = canvas.measureText(ownText(el));
    const fh = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
    if (!(fh > 0)) return null;
    return union(rs.map((r) => {
      const k = r.height / fh;
      const top = r.top + (m.fontBoundingBoxAscent - m.actualBoundingBoxAscent) * k;
      const bottom = r.bottom - (m.fontBoundingBoxDescent - m.actualBoundingBoxDescent) * k;
      return { left: r.left, right: r.right, top, bottom: Math.max(top, bottom) };
    }));
  };
  const clsOf = (el) => {
    const c = typeof el.className === 'string' ? el.className : el.className && el.className.baseVal || '';
    return c.split(/\s+/).filter(Boolean).slice(0, 2).join('.');
  };
  const nearId = (el) => { for (let n = el.parentElement; n && n !== host; n = n.parentElement) if (n.id) return n.id; return ''; };
  // 003：底框夠明顯（文字框的判定）、自己的文字（不穿過 absolute 子層與巢狀的有底框元素）
  const SIDES = ['Left', 'Top', 'Right', 'Bottom'];
  const lhOf = (cs) => { const v = parseFloat(cs.lineHeight); return Number.isFinite(v) ? v : 1.2 * px(cs.fontSize); };
  const paintedCs = (cs) => alpha(cs.backgroundColor) > 0.05 || (cs.backgroundImage && cs.backgroundImage !== 'none') || SIDES.some((k) => px(cs[`border${k}Width`]) > 0 && cs[`border${k}Style`] !== 'none');
  const frameCs = (cs) => alpha(cs.backgroundColor) >= 0.3 || (cs.backgroundImage && cs.backgroundImage !== 'none') || SIDES.some((k) => px(cs[`border${k}Width`]) >= 1 && cs[`border${k}Style`] !== 'none' && alpha(cs[`border${k}Color`]) >= 0.15);
  const ownContent = (el) => {
    const rects = [];
    let chars = 0, font = null;
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c.nodeType === 3) {
          const s = c.textContent || '';
          if (!s.trim()) continue;
          const pcs = getComputedStyle(c.parentElement);
          const fs = px(pcs.fontSize), lh = lhOf(pcs);
          // .sc-opt 光學置中（padding-bottom＝--opt，字往上提一半）：先還原位移再量行框
          let shift = 0;
          for (let n = c.parentElement; n && n !== el.parentElement; n = n.parentElement) if (n.classList && n.classList.contains('sc-opt')) { shift = px(getComputedStyle(n).paddingBottom) / 2; break; }
          chars += Array.from(s.replace(/\s+/g, '')).length;
          if (!font || fs > font.fs) font = { fs, lh: Math.round(lh * 100) / 100 };
          const rg = document.createRange();
          rg.selectNodeContents(c);
          for (const r of rg.getClientRects()) {
            if (r.width <= 0.5 || r.height <= 0.5) continue;
            const half = (lh - r.height) / 2;   // 行框＝行高：上下各加（或減）半個 leading
            rects.push([r2(r.left), r2(r.top - half + shift), r2(r.right), r2(r.bottom + half + shift)]);
          }
          rg.detach && rg.detach();
        } else if (c.nodeType === 1) {
          if (SKIP.has(c.tagName)) continue;
          const ccs = getComputedStyle(c);
          if (ccs.display === 'none' || ccs.position === 'absolute' || ccs.position === 'fixed') continue;
          const ctag = c.tagName.toLowerCase();
          if (['svg', 'img', 'video', 'canvas'].includes(ctag) || paintedCs(ccs)) {
            const r = c.getBoundingClientRect();
            if (r.width > 0.5 && r.height > 0.5) rects.push(box(r));
            continue;
          }
          walk(c);
        }
      }
    };
    walk(el);
    return { rects, chars, font };
  };
  const SHAPES = 'path, circle, rect, ellipse, line, polyline, polygon';
  const shapeRect = (svg) => {
    // v2 原語插進 svg 的零件（彗星頭與光暈）不算：光暈半徑是線寬的 2.6 倍，會把線的範圍往上撐到標題列（間距不足誤報）
    const rs = Array.from(svg.querySelectorAll(SHAPES)).filter((n) => !n.closest(V2_PARTS)).map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 || r.height > 0);
    return rs.length ? union(rs) : null;
  };

  const all = [host, ...host.querySelectorAll('*')];
  const idx = new Map(), elOf = new Map();
  const V2_PARTS = '.sc-comet, .sc-ripple, .sc-spot, .sc-sheen, .sc-mk, .sc-strike';
  const els = [];
  for (const el of all) {
    if (SKIP.has(el.tagName)) continue;
    const tag = el.tagName.toLowerCase();
    // SVG 只量根 <svg>（裡面的 path 是圖示的線，不是版面）
    if (el instanceof SVGElement && tag !== 'svg') continue;
    if (el.closest('[data-layout-ignore], [data-layout-check="ignore"]')) continue;
    if (el.closest(V2_PARTS)) continue;   // v2 原語自動插的零件（彗星頭、漣漪、焦點亮框、光澤、螢光筆、劃線、光暈、浮塵）不是版面
    const r = el.getBoundingClientRect();
    if (el !== host && !visible(el, r)) continue;
    const cs = getComputedStyle(el);
    const text = el === host ? '' : ownText(el);
    const rs = text ? lineRects(el) : [];
    const bw = [px(cs.borderLeftWidth), px(cs.borderTopWidth), px(cs.borderRightWidth), px(cs.borderBottomWidth)];
    const hasBorder = bw.some((v, k) => v > 0 && cs[['borderLeftStyle', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle'][k]] !== 'none');
    const hasBg = alpha(cs.backgroundColor) > 0.05 || (cs.backgroundImage && cs.backgroundImage !== 'none');
    const radius = px(cs.borderTopLeftRadius) + px(cs.borderTopRightRadius) + px(cs.borderBottomLeftRadius) + px(cs.borderBottomRightRadius);
    const padSum = px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.paddingTop) + px(cs.paddingBottom);
    const painted = el !== host && (hasBg || hasBorder);
    const full = r.width >= W * 0.95 && r.height >= H * 0.95;
    // 背景層：滿版底、.fill、模板的 sc-surface-*、從畫面頂撐到底的面板（03 側邊欄 960×1080）——不算「內容」
    const cl = typeof el.className === 'string' ? el.className : '';
    const bg = full || /(^|\s)(fill|sc-surface(-[\w-]+)?)(\s|$)/.test(cl) || (painted && r.height >= H * 0.95);
    // 不是正方向的形狀（clip-path 多邊形斜板、skew／rotate／scale）：邊是斜的，外框的小數不代表直邊會糊
    let shaped = false;
    for (let n = el; n && n !== host.parentElement; n = n.parentElement) {
      const ns = getComputedStyle(n);
      if (n === el && ns.clipPath && ns.clipPath !== 'none' && !/^inset\(/.test(ns.clipPath)) { shaped = true; break; }
      const m = ns.transform && ns.transform !== 'none' ? ns.transform.match(/matrix\(([^)]+)\)/) : null;
      if (ns.transform && ns.transform !== 'none' && (!m || (() => { const [a, b, c, d] = m[1].split(',').map(Number); return Math.abs(a - 1) > 1e-3 || Math.abs(b) > 1e-3 || Math.abs(c) > 1e-3 || Math.abs(d - 1) > 1e-3; })())) { shaped = true; break; }
    }
    const clipX = el !== host && tag !== 'svg' && clipVal(cs.overflowX || cs.overflow);
    const clipY = el !== host && tag !== 'svg' && clipVal(cs.overflowY || cs.overflow);
    const media = ['img', 'svg', 'video', 'canvas'].includes(tag);
    const isBox = el !== host && !full && (clipX || clipY || el.hasAttribute('data-layout-boundary') || (painted && (padSum + bw.reduce((a, b) => a + b, 0) + radius) > 0));
    if (!text && !painted && !media && !isBox) { idx.set(el, -2); continue; }   // 純排版用的 wrapper：不記，但祖先鏈照樣往上找
    const i = els.length;
    idx.set(el, i);
    elOf.set(i, el);
    const off = el.offsetWidth || 0;
    // 011 示意插圖（kit/illus.js 掛的 .il>svg）：overflow visible、4px 描邊一半在 viewBox 外 → 量的框四邊外擴 2px（契約 illus.md §5.5）
    const il = tag === 'svg' && !!el.parentElement && el.parentElement.classList.contains('il');
    const grow2 = (b) => (il && b ? [r2(b[0] - 2), r2(b[1] - 2), r2(b[2] + 2), r2(b[3] + 2)] : b);
    const own = el === host ? { rects: [], chars: 0, font: null } : ownContent(el);
    const pcs = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const op = el.offsetParent;
    const opInner = op ? (() => { const s = getComputedStyle(op); return op.clientWidth - px(s.paddingLeft) - px(s.paddingRight); })() : W;
    els.push({
      i, tag,
      // 描述：id／class／前 10 個字（容器自己沒有字時，有 id 就不附裡面的字，沒 id 才附上當線索）
      desc: { id: el.id || '', cls: clsOf(el), text: (text || (el.id ? '' : (el.textContent || '').replace(/\s+/g, ' ').trim())).slice(0, 10), near: el.id ? '' : nearId(el) },
      rect: grow2(box(r)),
      il,
      ilName: il ? el.parentElement.getAttribute('data-illus') || '' : '',
      inner: [r2(r.left + bw[0]), r2(r.top + bw[1]), r2(r.right - bw[2]), r2(r.bottom - bw[3])],
      text: !!text && rs.length > 0,
      textRect: rs.length ? union(rs) : null,
      inkRect: rs.length ? ink(el, cs, rs) : null,
      fontSize: px(cs.fontSize),
      scale: off > 0 && tag !== 'svg' ? r2(r.width / off) : 1,
      // 056：自己或祖先有立體轉動（matrix3d，例 fx-19 圓柱的 rotateY）：字寬被透視壓窄，字級改看字高的縮放（取寬高比例較大的）
      ...((() => { if (!(off > 0) || tag === 'svg' || !text) return null; for (let n = el; n && n !== host; n = n.parentElement) if (/^matrix3d/.test(getComputedStyle(n).transform || '')) return { fscale: r2(Math.max(r.width / off, el.offsetHeight > 0 ? r.height / el.offsetHeight : 0)) }; return null; })()),
      // v2 微動（P.idle 寫 CSS translate／scale）：自己或祖先正在漂浮、呼吸，位置是小數不代表寫錯（半像素邊不判）
      micro: (() => { for (let n = el; n && n !== host; n = n.parentElement) { const c = getComputedStyle(n); if ((c.translate && c.translate !== 'none') || (c.scale && c.scale !== 'none')) return true; } return false; })(),
      whiteSpace: cs.whiteSpace,
      painted, box: isBox, media, full, bg, shaped, clipX, clipY,
      sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight,
      constraint: -1, clips: [], parent: -1,
      moving: isMoving(el),
      // data-layout-allow-overflow="self"：只有標的那個元素自己不判（例：會推出畫面的側邊欄面板），裡面的文字照樣判撐破／裁切
      allowOverflow: (() => { const a = el.closest('[data-layout-allow-overflow], [data-layout-bleed]'); return !!a && (a === el || a.getAttribute('data-layout-allow-overflow') !== 'self'); })(),
      allowCaption: !!el.closest('[data-layout-allow-caption-zone]'),
      host: el === host,
      // 003 版面規則
      pos: cs.position,
      title: el.matches('.sc-wcard__bar, .sc-pill, [data-audit-title]'),
      pad: [px(cs.paddingLeft), px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom)].map(r2),
      bw: bw.map(r2),
      round: Math.abs(r.width - r.height) <= 2 && px(cs.borderTopLeftRadius) >= r.width / 2 - 0.5,
      kit: el.matches('.sc-wcard__bar, .sc-pill, .sc-num, .sc-icon'),
      frame: el !== host && frameCs(cs),
      own: own.rects, chars: own.chars, ownFont: own.font,
      centered: cs.textAlign === 'center' || (/flex/.test(cs.display) && (/column/.test(cs.flexDirection) ? cs.alignItems === 'center' : cs.justifyContent === 'center')),
      allowOverlap: !!el.closest('[data-layout-allow-overlap]'),
      allowSlack: !!el.closest('[data-layout-allow-slack]'),
      allowTight: !!el.closest('[data-layout-allow-tight]'),
      widthShared: !!el.closest('[data-width-shared]') || !!(pcs && /grid/.test(pcs.display)),
      parentInnerW: r2(opInner),
      alpha: r2(opacityChain(el)),
      shapeRect: tag === 'svg' ? grow2(shapeRect(el)) : null,
      // 055：卡片寬度不一致（data-allow-uneven）、同一個詞出現兩次（data-allow-repeat）、置中（data-justify、display）
      disp: cs.display,
      allowUneven: !!el.closest('[data-allow-uneven]'),
      allowRepeat: !!el.closest('[data-allow-repeat]'),
      justify: (() => { const j = el.closest('[data-justify]'); return j ? j.getAttribute('data-justify') || '' : ''; })(),
    });
  }
  // 055 C04：大字（字級 ≥ 120）排成幾行、寫了幾個 <br>（最內層、自己是區塊、裡面有字的元素；字可以在 inline-block 的子層裡）
  const BIG = 120, INLINE = new Set(['inline', 'inline-block', 'contents', 'none']);
  const bigCand = [];
  for (const el of all) {
    if (el === host || SKIP.has(el.tagName) || el instanceof SVGElement || el.closest('[data-layout-ignore], [data-layout-check="ignore"]') || el.closest(V2_PARTS)) continue;
    const cs = getComputedStyle(el);
    if (px(cs.fontSize) < BIG || INLINE.has(cs.display) || !(el.textContent || '').trim()) continue;
    bigCand.push(el);
  }
  const bigText = [];
  for (const el of bigCand) {
    if (bigCand.some((o) => o !== el && el.contains(o))) continue;
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    // 字都還沒出現（一個字一個 span、逐字進場前）不算
    if (![el, ...el.querySelectorAll('*')].some((x) => Array.from(x.childNodes).some((c) => c.nodeType === 3 && (c.textContent || '').trim()) && opacityChain(x) >= 0.2)) continue;
    const cs = getComputedStyle(el), rg = document.createRange();
    rg.selectNodeContents(el);
    const rs = Array.from(rg.getClientRects()).filter((x) => x.width > 0.5 && x.height > 0.5).sort((a, b) => a.top - b.top);
    rg.detach && rg.detach();
    const hs = rs.map((x) => x.height).sort((a, b) => a - b), mh = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
    const rows = [];
    for (const x of rs) { const c = (x.top + x.bottom) / 2; if (!rows.length || Math.abs(c - rows[rows.length - 1]) > 0.5 * mh) rows.push(c); }
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join('').replace(/\s+/g, ' ').trim();
    bigText.push({ desc: { id: el.id || '', cls: clsOf(el), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 12), near: el.id ? '' : nearId(el) }, own: !!own,
      fs: px(cs.fontSize), lines: rows.length, br: el.querySelectorAll('br').length, ws: cs.whiteSpace, moving: isMoving(el), rect: box(r),
      allowOverflow: !!el.closest('[data-layout-allow-overflow], [data-layout-bleed]') });
  }
  // 055 C05：大字逐字的框（去背段比對講者遮罩用；字級 ≥ 120，最多 300 個字）
  const glyphs = [];
  const tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n && glyphs.length < 300; n = tw.nextNode()) {
    const p = n.parentElement, s = n.textContent || '';
    if (!p || !s.trim() || SKIP.has(p.tagName) || p instanceof SVGElement || p.closest('[data-layout-ignore], [data-layout-check="ignore"]') || p.closest(V2_PARTS)) continue;
    const pcs = getComputedStyle(p);
    if (px(pcs.fontSize) < BIG || !visible(p, p.getBoundingClientRect())) continue;
    const mv = isMoving(p), a = r2(opacityChain(p)), near = p.id || nearId(p);
    if (canvas) canvas.font = `${pcs.fontStyle} ${pcs.fontWeight} ${pcs.fontSize} ${pcs.fontFamily}`;
    let k = 0;
    for (const ch of s) {
      if (ch.trim()) {
        const cr = document.createRange();
        cr.setStart(n, k); cr.setEnd(n, k + ch.length);
        const r = cr.getBoundingClientRect();
        if (r.width > 0.5 && r.height > 0.5) {
          // 字框上下是字型的 ascent＋descent（比字形高很多）：換成墨跡的上下緣
          let t = r.top, b = r.bottom;
          const mt = canvas ? canvas.measureText(ch) : null, fh = mt ? mt.fontBoundingBoxAscent + mt.fontBoundingBoxDescent : 0;
          if (fh > 0) { const q = r.height / fh; t = r.top + (mt.fontBoundingBoxAscent - mt.actualBoundingBoxAscent) * q; b = Math.max(t, r.bottom - (mt.fontBoundingBoxDescent - mt.actualBoundingBoxDescent) * q); }
          glyphs.push({ ch, r: [r2(r.left), r2(t), r2(r.right), r2(b)], moving: mv, alpha: a, near });
        }
      }
      k += ch.length;
    }
  }
  // 055 C03：自己畫的線（svg 裡只有描邊、沒有填色的 path／circle／line…，長 ≥ 40px）每 8px 取一點（套 getScreenCTM 換成畫面座標）
  const lines = [];
  for (const e of els) {
    if (e.tag !== 'svg' || e.il) continue;
    const svg = elOf.get(e.i);
    if (!svg || svg.closest('.il, .sc-icon, [data-layout-allow-overlap]')) continue;
    for (const sh of svg.querySelectorAll('path, circle, ellipse, line, polyline, polygon, rect')) {
      if (sh.closest(V2_PARTS) || sh.closest('defs, clipPath, mask, marker, pattern, symbol')) continue;
      const scs = getComputedStyle(sh);
      if (scs.display === 'none' || scs.visibility === 'hidden' || !scs.stroke || scs.stroke === 'none' || alpha(scs.stroke) < 0.2 || px(scs.strokeWidth) <= 0) continue;
      if (scs.fill && scs.fill !== 'none' && alpha(scs.fill) >= 0.05) continue;   // 有填色的是圖形，不是線
      if (opacityChain(sh) < 0.2) continue;
      let len = 0, m = null;
      try { len = sh.getTotalLength(); m = sh.getScreenCTM(); } catch { continue; }
      if (!m || !(len > 0)) continue;
      const k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
      if (len * k < 40) continue;
      const nn = Math.min(400, Math.max(2, Math.ceil((len * k) / 8))), pts = [];
      for (let j = 0; j <= nn; j++) { const p = sh.getPointAtLength((len * j) / nn); const q = new DOMPoint(p.x, p.y).matrixTransform(m); pts.push([r2(q.x), r2(q.y)]); }
      const closed = /^(circle|ellipse|polygon|rect)$/i.test(sh.tagName) || Math.hypot(pts[0][0] - pts[nn][0], pts[0][1] - pts[nn][1]) < 2;
      lines.push({ svg: e.i, tag: sh.tagName.toLowerCase(), id: sh.id || '', pts, closed, moving: isMoving(sh) });
    }
  }
  // 祖先關係：最近的容器（自己就是有底有框盒時算自己，和 hyperframes check 的 nearestConstraint 一樣）、所有會裁切的祖先
  for (const e of els) {
    if (e.host) continue;
    const el = all.find((x) => idx.get(x) === e.i);
    for (let n = el.parentElement; n; n = n.parentElement) {
      const k = idx.get(n);
      if (k == null) break;
      if (k >= 0 && !els[k].host) { e.parent = k; break; }
      if (n === host) break;
    }
    for (let n = el; n && n !== host; n = n.parentElement) {
      const k = idx.get(n);
      if (k >= 0 && els[k].box) { e.constraint = k; break; }
    }
    for (let n = el.parentElement; n && n !== host; n = n.parentElement) {
      const k = idx.get(n);
      if (k >= 0 && (els[k].clipX || els[k].clipY)) e.clips.push(k);
    }
    // 003：所有有記錄的祖先（近的在前）；中間隔著沒記錄的層（高 0 的 wrapper、看不見的層）也照樣往上找
    e.anc = [];
    for (let n = el.parentElement; n && n !== host; n = n.parentElement) { const k = idx.get(n); if (k >= 0 && !els[k].host) e.anc.push(k); }
  }
  // 未定位頂層：custom root 與 .fill 直接底下的元素。runtime 掛載後會拿掉 root 的 data-composition-id，
  // 所以 root 用「host 直接底下、不是 style／script 的元素」找
  const tops = [];
  const roots = new Set([...host.children].filter((c) => !SKIP.has(c.tagName)));
  for (const r of [...host.querySelectorAll('[data-composition-id], .fill')]) roots.add(r);
  for (const root of roots) {
    for (const c of root.children) {
      if (SKIP.has(c.tagName)) continue;
      const ccs = getComputedStyle(c), rr = c.getBoundingClientRect();
      if (ccs.display === 'none') continue;
      tops.push({ desc: { id: c.id || '', cls: clsOf(c), text: c.id ? '' : (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 10), near: c.id ? '' : nearId(c) },
        // runtime 掛上後 root 的 id／data-composition-id 會被拿掉：host 直接底下那層印成 root（<comp>）
        parent: { id: root.id || '', cls: clsOf(root), text: '', near: '', root: root.parentElement === host ? host.getAttribute('data-composition-id') || '?' : '' },
        pos: ccs.position, w: r2(rr.width), h: r2(rr.height) });
    }
  }
  const hcs = getComputedStyle(host);
  return {
    tops,
    host: { start: Number(host.getAttribute('data-start')), duration: Number(host.getAttribute('data-duration')), visible: hcs.display !== 'none' && hcs.visibility !== 'hidden', opacity: opacityChain(host), children: host.children.length },
    els: els.filter((e) => !e.host),
    bigText, glyphs, lines,
    moving: moving.size,
    illus: host.querySelectorAll('.il').length,   // 011：有示意插圖元件的段才跑 judgeIllus
  };
}

// 003：custom 段的時間軸（不 seek；offset* 是版面值，不受 transform 與目前時間影響）
export function collectMotionInPage({ hostId, compId }) {
  const tl = (window.__timelines || {})[compId];
  const host = document.getElementById(hostId);
  if (!tl || !host || typeof tl.getChildren !== 'function') return null;
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const keyOf = (el) => {
    const path = [];
    for (let n = el; n && n !== host; n = n.parentElement) { const p = n.parentElement; if (!p) return null; path.unshift(Array.prototype.indexOf.call(p.children, n)); }
    return path.join('/');
  };
  const clsOf = (el) => {
    const c = typeof el.className === 'string' ? el.className : el.className && el.className.baseVal || '';
    return c.split(/\s+/).filter(Boolean).slice(0, 2).join('.');
  };
  const nearId = (el) => { for (let n = el.parentElement; n && n !== host; n = n.parentElement) if (n.id) return n.id; return ''; };
  const descOf = (el) => {
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join('').replace(/\s+/g, ' ').trim();
    return { id: el.id || '', cls: clsOf(el), text: (own || (el.id ? '' : (el.textContent || '').replace(/\s+/g, ' ').trim())).slice(0, 10), near: el.id ? '' : nearId(el) };
  };
  const chainOf = (el) => { const out = []; for (let n = el.parentElement; n && n !== host; n = n.parentElement) out.push(keyOf(n)); return out; };
  // 這個元素「說的字」：自己（含子孫）的字；亮框（emph）本身沒字，算它亮起的那一項（最近一層有字的祖先，停在 custom root 之前）。
  // 刪除線、底線、進度條疊在別人的字上但沒疊滿，回 ''：它出現時字早就在畫面上（008 x-fix 劃掉痛點的誤報）。
  // 那一層裡有兩塊以上各自的字（卡片、整個內容區）就不是一個站名，回 ''（不比）；字裡夾的關鍵詞 span 算同一塊
  const ownText = (n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && (c.textContent || '').trim());
  const blocksOf = (n) => {
    let k = ownText(n) ? 1 : 0;
    const walk = (e, inText) => { for (const c of e.children) { const o = ownText(c); if (o && !inText) k++; walk(c, inText || o); } };
    walk(n, ownText(n));
    return k;
  };
  const sayOf = (el, emph) => {
    for (let n = el; n && n !== host && n.parentElement !== host; n = emph ? n.parentElement : null) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) return blocksOf(n) > 1 ? '' : t.slice(0, 40);
    }
    return '';
  };
  const emphOf = (t) => {
    const p = t.parentElement;
    if (!p || t.offsetParent !== p || !(p.offsetWidth > 0)) return false;
    return Math.abs(t.offsetLeft) <= 8 && Math.abs(t.offsetTop) <= 8 && t.offsetWidth * t.offsetHeight >= 0.8 * p.offsetWidth * p.offsetHeight;
  };
  const num = (v) => (typeof v === 'number' ? v : parseFloat(v));
  const FN_KIND = { wipe: 'enter', slide: 'enter', grow: 'enter', wipeOut: 'exit', slideOut: 'exit' };   // v2 擦開／抽屜（clip 用 −20% 留邊、xPercent 位移，看不出 opacity）
  // 起點、終點：fromTo 是 startAt → vars；直接寫 GSAP 的 tl.from（內容設計動畫照 hyperframes skill 寫）vars 是起點、終點是元素本來的樣子
  const endsOf = (tw) => {
    const v = tw.vars || {};
    if (!v.runBackwards || v.startAt) return { s0: v.startAt || {}, v1: v };
    const v1 = {};
    if ('opacity' in v) v1.opacity = 1;
    if ('clipPath' in v) v1.clipPath = 'inset(0% 0% 0% 0%)';
    for (const k of ['scale', 'scaleX', 'scaleY']) if (k in v) v1[k] = 1;
    if ('strokeDashoffset' in v) v1.strokeDashoffset = 0;
    return { s0: v, v1 };
  };
  const classify = (tw, dat) => {
    if (dat && FN_KIND[dat.fn]) return FN_KIND[dat.fn];
    const { s0, v1: v } = endsOf(tw);
    if ('strokeDashoffset' in v) return 'draw';
    const o0 = num(s0.opacity), o1 = num(v.opacity);
    if (Number.isFinite(o0) && Number.isFinite(o1)) {
      if (o0 < 0.2 && o1 >= 0.2) return 'enter';
      if (o0 >= 0.2 && o1 < 0.2) return 'exit';
    }
    if (typeof s0.clipPath === 'string' && /100%/.test(s0.clipPath) && /^inset\(\s*0%?\s+0%?\s+0%?\s+0%?\s*\)$/.test(String(v.clipPath || ''))) return 'enter';
    return 'change';
  };
  const tweens = [];
  let kids = [];
  try { kids = tl.getChildren(true, true, false); } catch { kids = []; }
  let rawN = 0;
  for (const tw of kids) {
    let s = tw.startTime();
    for (let p = tw.parent; p && p !== tl; p = p.parent) s += p.startTime();
    const e = s + tw.totalDuration();
    if (e - s <= 0.002) continue;
    // 逐字（P.chars 的 span[data-sc-ch]）併回字所在的元素：一行字算一個新元素（design-system.md §13）
    // data-links 的箭頭頭（kit/scene-layout.js 的 <a>-<b>-head）是線描完的一部分，跟著線本體算，不是新元素
    const raw = (tw.targets() || []).filter((t) => t && t.nodeType === 1 && host.contains(t) && !(t.hasAttribute && t.hasAttribute('data-link-head')));
    const targets = [...new Set(raw.map((t) => (t.hasAttribute && t.hasAttribute('data-sc-ch') ? t.parentElement.closest(':not([data-sc-ch])') || t : t)))];
    if (!targets.length) continue;
    let dat = tw.data;
    for (let p = tw.parent; !(dat && dat.sc) && p && p !== tl; p = p.parent) dat = p.data;
    const kind = classify(tw, dat);
    const { s0: start0, v1: v } = endsOf(tw), o0 = num(start0.opacity), o1 = num(v.opacity);
    // 直接寫的 GSAP tween（沒有 SceneMotion 的 data）：一個 tween＝一次呼叫，stagger 帶的一組只算一個新元素（同 P.* 呼叫）
    const raw0 = !(dat && (dat.sc || dat.fn || dat.role)) ? `gsap#${rawN++}` : null;
    // 出現、亮起、描線、從 0 長出來算；位移、換數字、淡掉、降亮度、0 → 0（聚焦時沒輪到的亮框）不算
    const sc = (o) => ['scale', 'scaleX', 'scaleY'].map((k) => num(o[k])).filter(Number.isFinite);
    const sc0 = sc(start0), sc1 = sc(v);
    const grow = sc0.length > 0 && Math.min(...sc0) <= 0.01 && (!sc1.length || Math.min(...sc1) > 0.01);
    const up = Number.isFinite(o0) && Number.isFinite(o1) ? o1 > o0 + 1e-3 : kind === 'enter' || kind === 'draw' || grow;
    tweens.push({ start: r3(s), end: r3(e), kind, up, call: dat && dat.sc ? dat.sc : raw0, role: dat && dat.role ? dat.role : null, fn: dat && dat.fn ? dat.fn : null, targets: targets.map((t) => {
      const svgShape = t instanceof SVGElement && t.tagName.toLowerCase() !== 'svg';
      const emph = !svgShape && emphOf(t);
      return { key: keyOf(t), parentKey: t.parentElement ? keyOf(t.parentElement) : null, desc: descOf(t), chain: chainOf(t), say: sayOf(t, emph),
        all: svgShape ? '' : (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),   // 055 N7：目標整塊的字（卡片裡分好幾塊也接起來）
        emph, box: svgShape ? null : [t.offsetLeft, t.offsetTop, t.offsetWidth, t.offsetHeight],
        // 011：il＝目標是示意元件或包著元件；line＝元件與圖示以外的線（連接線）
        il: !svgShape && !!(t.matches && (t.matches('.il') || t.querySelector('.il'))), line: svgShape && !t.closest('.il, .sc-icon') };
    }) });
  }
  const marks = ((window.SceneMotion && window.SceneMotion.marks) || {})[compId] || [];
  return { D: r3(tl.duration()), marks: marks.map((m) => ({ ref: m.ref, t: m.t })), tweens };
}

// 送進頁面的程式碼字串
export const pageSeekSource = (t) => `(${seekInPage.toString()})(${JSON.stringify(t)})`;
// 009 直式：舞台縮放的段（host 帶 stage transform＋data-layout-allow-overflow）量之前先拿掉 host 與祖先的 transform、host 的 allow-overflow，
// 量完還原 → 量到的是子合成座標（1920×1080，host 在 0,0），規則照橫式判；不能用到函式外的變數（toString 送進頁面）
export function unstageInPage(fn, opts) {
  const host = document.getElementById(opts.hostId);
  const undo = [];
  if (opts.unstage && host) {
    for (let n = host; n && n !== document.documentElement; n = n.parentElement) {
      const t = getComputedStyle(n).transform;
      if (n !== host && (!t || t === 'none')) continue;
      undo.push([n, n.style.getPropertyValue('transform'), n.style.getPropertyPriority('transform')]);
      n.style.setProperty('transform', 'none', 'important');
    }
    // 056：字卡動態（keepAllow）保留 host 的 data-layout-allow-overflow：飛出畫面、捲軸框外藏起來的字是特效本身（和橫式一樣不判撐破、裁切、超出畫面）
    if (!opts.keepAllow && host.hasAttribute('data-layout-allow-overflow')) { undo.push([host, null, host.getAttribute('data-layout-allow-overflow')]); host.removeAttribute('data-layout-allow-overflow'); }
  }
  try {
    const m = fn(opts);
    // 帶 id 的絕對定位元素的擺位外框（暫時拿掉 host 裡寫在 style 上的 transform／translate／scale／rotate 再量，量完還原；相對 host＝子合成座標）：
    // portrait-window 量擺位，P.cam 鏡頭推、聚焦放大、抬起、漂浮（GSAP 與 P.* 都寫在 style 上）不算；CSS 檔裡寫的 transform（例：轉 −90 度的柱）是擺位，保留
    if (opts.unstage && host && m && !m.missingHost) {
      const PROPS = ['transform', 'translate', 'scale', 'rotate'];
      const saved = [];
      for (const el of host.querySelectorAll('*')) {
        if (!el.style) continue;
        for (const k of PROPS) {
          const v = el.style.getPropertyValue(k);
          if (!v || v === 'none') continue;
          saved.push([el, k, el.style.getPropertyValue(k), el.style.getPropertyPriority(k)]);
          el.style.setProperty(k, 'none', 'important');
        }
      }
      const boxes = {}, cams = {}, r2 = (n) => Math.round(n * 100) / 100;
      try {
        const h = host.getBoundingClientRect();
        const lbox = (el) => { const r = el.getBoundingClientRect(); return [r.left - h.left, r.top - h.top, r.right - h.left, r.bottom - h.top]; };
        for (const el of host.querySelectorAll('[id]')) {
          if (getComputedStyle(el).position !== 'absolute') continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 || r.height > 0) boxes[el.id] = lbox(el).map(r2);
        }
        // portrait-cam：時間軸裡每一個 P.cam（tween 的 data.fn＝'cam'）的終值（x、y、scale，原點照 transformOrigin），
        // 把鏡頭容器和它裡面帶 id 的絕對定位元素的擺位外框換算過去，每個容器記最遠的外框與最大倍率
        for (const tl of Object.values(window.__timelines || {})) {
          if (!tl || typeof tl.getChildren !== 'function') continue;
          let kids = [];
          try { kids = tl.getChildren(true, true, false); } catch (e) { kids = []; }
          for (const tw of kids) {
            if (!tw || !tw.data || tw.data.fn !== 'cam' || !tw.vars || typeof tw.targets !== 'function') continue;
            const s = Number.isFinite(+tw.vars.scale) ? +tw.vars.scale : 1, dx = +tw.vars.x || 0, dy = +tw.vars.y || 0;
            for (const c of tw.targets()) {
              if (!(c instanceof Element) || !host.contains(c) || c.closest('[data-layout-allow-overflow]')) continue;
              // 原點照 tween 的 transformOrigin（P.cam 橫式 50% 50%、直式舞台 50% 0%）；只認 % 與 px
              const B = lbox(c), org = String(tw.vars.transformOrigin || '50% 50%').trim().split(/\s+/);
              const at_ = (v, a, b) => { const n = parseFloat(v); if (!Number.isFinite(n)) return { left: a, top: a, center: (a + b) / 2, right: b, bottom: b }[v] ?? (a + b) / 2; return /%$/.test(v) ? a + (b - a) * n / 100 : a + n; };
              const cx = at_(org[0] || '50%', B[0], B[2]), cy = at_(org[1] || '50%', B[1], B[3]);
              const key = c.id || (c.className && String(c.className)) || c.tagName.toLowerCase();
              const k = cams[key] || (cams[key] = { box: null, scale: 1 });
              k.scale = Math.max(k.scale, s);
              for (const el of [c, ...c.querySelectorAll('[id]')]) {
                if (el !== c && (getComputedStyle(el).position !== 'absolute' || el.closest('[data-layout-allow-overflow]'))) continue;
                const b = lbox(el);
                if (!(b[2] - b[0] > 0 || b[3] - b[1] > 0)) continue;
                const t = [cx + s * (b[0] - cx) + dx, cy + s * (b[1] - cy) + dy, cx + s * (b[2] - cx) + dx, cy + s * (b[3] - cy) + dy];
                k.box = k.box ? [Math.min(k.box[0], t[0]), Math.min(k.box[1], t[1]), Math.max(k.box[2], t[2]), Math.max(k.box[3], t[3])] : t;
              }
            }
          }
        }
        for (const k of Object.values(cams)) if (k.box) k.box = k.box.map(r2);
      } finally {
        for (const [el, k, v, p] of saved.reverse()) { if (v) el.style.setProperty(k, v, p); else el.style.removeProperty(k); }
      }
      m.layoutBoxes = boxes;
      m.camBoxes = cams;
    }
    return m;
  } finally {
    for (const [n, v, p] of undo.reverse()) {
      if (v === null) n.setAttribute('data-layout-allow-overflow', p);
      else if (v) n.style.setProperty('transform', v, p);
      else n.style.removeProperty('transform');
    }
  }
}
export const pageMeasureSource = (opts) => (opts.unstage ? `(${unstageInPage.toString()})(${measureInPage.toString()}, ${JSON.stringify(opts)})` : `(${measureInPage.toString()})(${JSON.stringify(opts)})`);
export const pageMotionSource = (opts) => `(${collectMotionInPage.toString()})(${JSON.stringify(opts)})`;

// 056：字卡動態的完成態（fx/catalog.json effects[].done）→ 段內秒數；null＝找不到（照舊段尾前 0.6 秒）
//   時間軸上有 label 'done' 就用它（catalog 寫 "label" 的卡）；"timeline"＝最後一塊動畫停住的那一刻：段尾前 0.35 秒內還在跑的補間是收尾退場，
//   取它開始前 0.1 秒（和 dev/056/compare.mjs、盤點的截圖同一套）；整段都在動回 null
export function fxDoneInPage({ hostId, D, kind }) {
  const host = document.getElementById(hostId), comp = host && host.getAttribute('data-composition-id');
  const tl = comp && window.__timelines && window.__timelines[comp];
  if (!tl) return null;
  if (tl.labels && tl.labels.done != null) return tl.labels.done;
  if (kind === 'label' || typeof tl.getChildren !== 'function') return null;
  const iv = [];
  const walk = (t, off) => { for (const c of t.getChildren(false, true, true)) { const s = off + c.startTime(), e = s + c.totalDuration(); if (c.getChildren) walk(c, s); else if (c.totalDuration() > 0.05) iv.push([s, e]); } };
  walk(tl, 0);
  const exitAt = iv.filter(([s, e]) => e >= D - 0.35 && s > 0.3).reduce((m, [s]) => Math.min(m, s), D);
  return exitAt < D - 0.3 && exitAt > 0.6 ? exitAt - 0.1 : null;
}
export const pageFxDoneSource = (opts) => `(${fxDoneInPage.toString()})(${JSON.stringify(opts)})`;

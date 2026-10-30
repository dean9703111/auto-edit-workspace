// audit.mjs 在瀏覽器裡跑的量測（零依賴）：這個檔的函式會被 toString() 送進頁面執行，不能用到函式外的任何變數。
//
//   pageSeekSource(t)            → 一段 JS：用 HyperFrames runtime 的 __player.renderSeek 跳到第 t 秒，等字型與兩幀
//   pageMeasureSource(opts)      → 一段 JS：量 #<hostId> 底下每個元素，回傳原始量測（判定在 audit-rules.mjs 做）
//     opts＝{ hostId, W, H }
//     回傳 { host: { start, duration, visible }, els: [ … ], moving: N }，els 每一項：
//       { i, tag, desc: { id, cls, text, near }, rect:[l,t,r,b], inner:[l,t,r,b], text:bool, textRect, inkRect, fontSize, scale,
//         painted:bool, box:bool（可當「容器」的有底有框盒）, media:bool, full:bool, bg:bool（背景層）, shaped:bool（斜邊／旋轉縮放）,
//         clipX, clipY, sw, cw, sh, ch,
//         constraint（最近的容器在 els 的索引；-1＝畫布）, clips:[祖先中會裁切的 els 索引], moving:bool,
//         allowOverflow, allowCaption }
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

  const all = [host, ...host.querySelectorAll('*')];
  const idx = new Map();
  const els = [];
  for (const el of all) {
    if (SKIP.has(el.tagName)) continue;
    const tag = el.tagName.toLowerCase();
    // SVG 只量根 <svg>（裡面的 path 是圖示的線，不是版面）
    if (el instanceof SVGElement && tag !== 'svg') continue;
    if (el.closest('[data-layout-ignore], [data-layout-check="ignore"]')) continue;
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
    const off = el.offsetWidth || 0;
    els.push({
      i, tag,
      // 描述：id／class／前 10 個字（容器自己沒有字時，有 id 就不附裡面的字，沒 id 才附上當線索）
      desc: { id: el.id || '', cls: clsOf(el), text: (text || (el.id ? '' : (el.textContent || '').replace(/\s+/g, ' ').trim())).slice(0, 10), near: el.id ? '' : nearId(el) },
      rect: box(r),
      inner: [r2(r.left + bw[0]), r2(r.top + bw[1]), r2(r.right - bw[2]), r2(r.bottom - bw[3])],
      text: !!text && rs.length > 0,
      textRect: rs.length ? union(rs) : null,
      inkRect: rs.length ? ink(el, cs, rs) : null,
      fontSize: px(cs.fontSize),
      scale: off > 0 && tag !== 'svg' ? r2(r.width / off) : 1,
      whiteSpace: cs.whiteSpace,
      painted, box: isBox, media, full, bg, shaped, clipX, clipY,
      sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight,
      constraint: -1, clips: [], parent: -1,
      moving: isMoving(el),
      allowOverflow: !!el.closest('[data-layout-allow-overflow], [data-layout-bleed]'),
      allowCaption: !!el.closest('[data-layout-allow-caption-zone]'),
      host: el === host,
    });
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
  }
  const hcs = getComputedStyle(host);
  return {
    host: { start: Number(host.getAttribute('data-start')), duration: Number(host.getAttribute('data-duration')), visible: hcs.display !== 'none' && hcs.visibility !== 'hidden', opacity: opacityChain(host), children: host.children.length },
    els: els.filter((e) => !e.host),
    moving: moving.size,
  };
}

// 送進頁面的程式碼字串
export const pageSeekSource = (t) => `(${seekInPage.toString()})(${JSON.stringify(t)})`;
export const pageMeasureSource = (opts) => `(${measureInPage.toString()})(${JSON.stringify(opts)})`;

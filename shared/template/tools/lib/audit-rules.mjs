// audit.mjs 的判定規則（純函式，零依賴；瀏覽器量到的原始資料 → ✖／⚠ 訊息）
//
//   pickItems(items, { only, all })   → { list, skipped, errors }  要量哪幾段（預設只量 custom；--all 加上情境與字卡動態；media 不量）
//   sampleTimes(item)                 → [{ t, kind: 'mid'|'done' }]  中點、完成態（段尾前 0.6 秒）
//   judgeSample(meas, ctx)            → findings[]  一個時間點、一段的判定
//   mergeFindings(list)               → 同一段、同一規則、同一元素只留一筆（時間合併）
//   customDuration(html)              → custom 檔裡寫的 data-duration（R7.2 第 4 步要和段長一致）
//   formatFinding(f)／fmtT(t)／descText(desc)
//
// 座標一律是 1920×1080 的畫面像素（頁面就是 1920×1080、deviceScaleFactor 1，getBoundingClientRect 直接就是畫面座標）。
// 矩形寫成 [左, 上, 右, 下]。只判「靜止」的元素：正在補間（0 < progress < 1）的元素和它的子孫不判，避免把進場暫態當破版。

import { PIP_ZONE } from './media.mjs';

export const CANVAS = [1920, 1080];
export const CAPTION_Y = 920;       // 字幕區從 y 920 起（R4.1；check --caption-zone 的 y0=0.852）
export const CONTENT_BOTTOM = 870;  // 內容區下緣（R4.1），改法建議移到這條線以上
export const FS_RIGHT = 1380;       // 全畫面主內容右緣上限（R4.1、R7.2）
export { PIP_ZONE };                // 子母畫面外框禁入區（lib/media.mjs，和 build 同一組數字）
export const DONE_BEFORE = 0.6;     // 完成態＝段尾前 0.6 秒（完成態至少停 0.6s，USAGE 4.2）
export const MIN_FONT = 30;         // 字太小的門檻（R8.5 的下限是正文 52、標籤 38；30 以下一定看不清）
export const SPEAKER_WARN = 0.02;   // custom 與用 css 移過位的段：蓋到講者框 ≥ 2% 就提醒（四邊已外擴 40px，碰到邊不算；R8.17）
export const SPEAKER_WARN_TEMPLATE = 0.15;   // 沒移位的情境模板：和 build --check 的碰撞提醒同一個門檻（R4.1）
export const SUBPIXEL = 0.2;        // 邊緣離整數 px ≥ 0.2 才算半像素（0.05 這種量測尾數不會糊）
export const TOL = 2;               // 一般容許誤差（px），和 hyperframes check 的預設 tolerance 相同

const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;
export const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

// ---------- 段落與取樣 ----------

export function pickItems(items, { only = null, all = false } = {}) {
  const errors = [], skipped = [];
  let list;
  if (only && only.length) {
    const want = only.map((s) => String(s).trim()).filter(Boolean);
    for (const id of want) if (!items.some((x) => x.id === id)) errors.push(`--only 的 ${id} 不在 plan.json（或整段被 edit.cuts 剪掉了）→ 現有：${items.map((x) => x.id).join('、') || '（沒有段落）'}`);
    list = items.filter((x) => want.includes(x.id));
  } else {
    list = items.filter((x) => all ? ['scene', 'custom'].includes(x.type) : x.type === 'custom');
    // 字卡動態是刻意飛出畫面、裁一半、縮成小字的特效（模板用 FXKit.fitSize 保證文字放得下），--all 不量；要量就用 --only 指名
    const fx = all ? items.filter((x) => x.type === 'fx') : [];
    if (fx.length) skipped.push(`${fx.map((x) => x.id).join('、')}（字卡動態：特效本來就會飛出畫面或裁切，版面由模板保證；真的要量就用 --only 指名）`);
  }
  for (const it of list) if (it.type === 'media') skipped.push(`${it.id}（插入素材：錄影畫面不是版面，紅框與放大鏡由 build 檢查）`);
  return { list: list.filter((x) => x.type !== 'media'), skipped, errors };
}

// 壓到講者的門檻：custom 與用 css 移位的段要完全避開（R8.17），沒移位的模板照 build 的 15%
export const speakerWarnOf = (item) => (item.type === 'custom' || (item.seg && item.seg.css) ? SPEAKER_WARN : SPEAKER_WARN_TEMPLATE);

export function sampleTimes(item) {
  const s = item.start, e = item.end, D = e - s;
  const mid = r3(s + D / 2);
  const done = r3(Math.max(s + Math.min(0.5, D / 2), e - DONE_BEFORE));
  return done - mid > 0.1 ? [{ t: mid, kind: 'mid' }, { t: done, kind: 'done' }] : [{ t: done, kind: 'done' }];
}

export const layoutOf = (item) => (item.type === 'custom' ? item.seg?.layout || (item.opaque ? 'fullscreen' : 'overlay') : item.opaque ? 'fullscreen' : 'overlay');
export const pipOnAt = (item, t) => !!item.pip && (item.pipPieces || [{ s: item.start, e: item.end }]).some((p) => t >= p.s - 1e-6 && t < p.e);

// ---------- 矩形 ----------

export const area = (r) => (r ? Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]) : 0);
export function intersect(a, b) {
  if (!a || !b) return null;
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] - r[0] > 0 && r[3] - r[1] > 0 ? r : null;
}
// a 超出 b 多少（只回傳超過容許值的邊）；tolY 給垂直方向另一個容許值
export function overflowOf(a, b, tol = TOL, tolY = tol) {
  const o = {};
  if (b[0] - a[0] > tol) o.left = r1(b[0] - a[0]);
  if (a[2] - b[2] > tol) o.right = r1(a[2] - b[2]);
  if (b[1] - a[1] > tolY) o.top = r1(b[1] - a[1]);
  if (a[3] - b[3] > tolY) o.bottom = r1(a[3] - b[3]);
  return Object.keys(o).length ? o : null;
}
export function shiftBox(box, dx) { return box ? [box[0] + dx, box[1], box[2] + dx, box[3]] : null; }
// 一組矩形的聯集落在 box 裡的面積比例（4px 格點取樣；矩形最多幾十個，夠快也夠準）
export function coverRatio(rects, box, step = 4) {
  if (!box || !rects.length) return 0;
  const rs = rects.map((r) => intersect(r, box)).filter(Boolean);
  if (!rs.length) return 0;
  let hit = 0, n = 0;
  for (let y = box[1] + step / 2; y < box[3]; y += step) {
    for (let x = box[0] + step / 2; x < box[2]; x += step) {
      n++;
      if (rs.some((r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3])) hit++;
    }
  }
  return n ? hit / n : 0;
}
// 邊緣離整數 px 的距離 ≥ SUBPIXEL 的邊
export function subpixelEdges(rect, th = SUBPIXEL) {
  const names = ['left', 'top', 'right', 'bottom'];
  const out = {};
  rect.forEach((v, k) => { const d = Math.abs(v - Math.round(v)); if (d >= th - 1e-9) out[names[k]] = Math.round(v * 100) / 100; });
  return Object.keys(out).length ? out : null;
}

// ---------- 元素描述 ----------

export function descText(d) {
  if (!d) return '（不明元素）';
  const head = d.id ? `#${d.id}` : `${d.near ? `#${d.near} ` : ''}${d.cls ? `.${d.cls}` : '<元素>'}`;
  const text = d.text ? `「${d.text}${d.text.length >= 10 ? '…' : ''}」` : '';
  return `${head}${text}`;
}
// 當「容器」講的時候：有 id 就只寫 id（容器的文字是裡面所有子元素的字，寫出來反而看不懂）
export const boxDesc = (d) => (d && d.id ? { ...d, text: '' } : d);
const elKey = (d) => `${d?.id || ''}|${d?.near || ''}|${d?.cls || ''}|${d?.text || ''}`;
const sides = (o) => Object.entries(o).map(([k, v]) => `${{ left: '左', right: '右', top: '上', bottom: '下' }[k]}邊 ${v}px`).join('、');

// ---------- 判定 ----------

// ctx＝{ item, t, kind, layout, pipOn, speakerBox, sideShift, W, H }
export function judgeSample(meas, ctx) {
  const out = [];
  const W = ctx.W ?? CANVAS[0], H = ctx.H ?? CANVAS[1];
  const base = { id: ctx.item.id, label: ctx.item.label, t: ctx.t, kind: ctx.kind };
  const push = (level, rule, e, msg, fix, data = {}) => out.push({ ...base, level, rule, el: e ? e.desc : null, msg, fix, data });
  if (!meas || meas.missingHost) {
    push('error', 'missing', null, `index.html 裡沒有 #el-${ctx.item.id}`, '先跑 node shared/template/tools/build.mjs --project projects/<專案>，再重跑 audit');
    return out;
  }
  const els = meas.els || [];
  const byI = new Map(els.map((e) => [e.i, e]));
  const canvasBox = [0, 0, W, H];
  // 這個元素在畫面上看得到的部分（被會裁切的祖先切掉的不算）
  const visible = (e, r) => {
    let v = r;
    for (const k of e.clips || []) { const c = byI.get(k); if (!c) continue; v = intersect(v, [c.clipX ? c.inner[0] : -1e9, c.clipY ? c.inner[1] : -1e9, c.clipX ? c.inner[2] : 1e9, c.clipY ? c.inner[3] : 1e9]); if (!v) return null; }
    return v;
  };
  // 文字用墨跡的上下緣（line box 比字形高）、line box 的左右緣
  const textBox = (e) => (e.inkRect ? [e.textRect[0], e.inkRect[1], e.textRect[2], e.inkRect[3]] : e.textRect);
  const content = [];
  for (const e of els) {
    if (e.full || e.bg) continue;   // 背景層（滿版底、從頂撐到底的面板）不算內容
    if (e.text && e.textRect) { const v = visible(e, textBox(e)); if (v) content.push({ e, r: v }); }
    if (e.painted || e.media) { const v = visible(e, e.rect); if (v) content.push({ e, r: v }); }
  }
  const still = (e) => !e.moving;

  // ✖ 文字撐破容器／被裁掉
  const seen = new Set();
  for (const e of els) {
    if (!e.text || !e.textRect || !still(e) || e.allowOverflow) continue;
    const C = e.constraint >= 0 ? byI.get(e.constraint) : null;
    if (C) {
      const clips = C.clipX || C.clipY;
      const T = clips ? textBox(e) : e.textRect;
      const o = overflowOf(T, C.inner, TOL, clips ? TOL : Math.max(TOL, 0.2 * e.fontSize));
      if (o) {
        const self = C.i === e.i;
        const where = self ? '自己的框' : `容器 ${descText(boxDesc(C.desc))}`;
        const hz = (o.left || 0) + (o.right || 0), vt = (o.top || 0) + (o.bottom || 0);
        const needW = Math.ceil(C.rect[2] - C.rect[0] + hz), needH = Math.ceil(C.rect[3] - C.rect[1] + vt);
        const fix = [];
        if (hz) fix.push(`縮短文字，或把${self ? '它' : ` ${descText(boxDesc(C.desc))} `}的寬度加到 ≥ ${needW}px（整數）${e.whiteSpace === 'nowrap' ? '；要換行就拿掉 nowrap、用 <br> 斷在語意處並加高' : ''}`);
        if (vt) fix.push(`${self ? '它' : '容器'}的高度加到 ≥ ${needH}px（或拿掉固定 height），加高後確認下方元素沒被擠到`);
        fix.push('不要縮字級（R8.5）');
        push('error', clips ? 'clipped' : 'overflow', e, `${clips ? `文字被${where}裁掉` : `文字撐破${where}`}：${descText(e.desc)} 超出${sides(o)}`, fix.join('；'), { overflow: o, text: T, box: C.inner });
        seen.add(e.i);
      }
    }
    // 自己會裁切（overflow:hidden）而內容比框大
    if (!seen.has(e.i) && (e.clipX || e.clipY) && ((e.clipX && e.sw - e.cw > TOL) || (e.clipY && e.sh - e.ch > TOL))) {
      const o = {};
      if (e.clipX && e.sw - e.cw > TOL) o.right = e.sw - e.cw;
      if (e.clipY && e.sh - e.ch > TOL) o.bottom = e.sh - e.ch;
      push('error', 'clipped', e, `文字被自己的框裁掉：${descText(e.desc)} 內容比框多${sides(o)}`, `${o.right ? `寬度加到 ≥ ${e.sw}px` : ''}${o.right && o.bottom ? '、' : ''}${o.bottom ? `高度加到 ≥ ${e.sh}px` : ''}（或拿掉固定寬高），或縮短文字；不要縮字級（R8.5）`, { overflow: o });
      seen.add(e.i);
    }
    // 外層會裁切的祖先把字切掉（最近的容器以外的那幾層）
    if (!seen.has(e.i)) {
      for (const k of e.clips || []) {
        if (k === e.constraint) continue;
        const K = byI.get(k);
        if (!K || !still(K) || K.allowOverflow) continue;
        const o = overflowOf(textBox(e), [K.clipX ? K.inner[0] : -1e9, K.clipY ? K.inner[1] : -1e9, K.clipX ? K.inner[2] : 1e9, K.clipY ? K.inner[3] : 1e9]);
        if (!o) continue;
        push('error', 'clipped', e, `文字被 ${descText(boxDesc(K.desc))} 裁掉：${descText(e.desc)} 超出${sides(o)}`, `把 ${descText(boxDesc(K.desc))} 加大（寬 ≥ ${Math.ceil(K.rect[2] - K.rect[0] + (o.left || 0) + (o.right || 0))}px、高 ≥ ${Math.ceil(K.rect[3] - K.rect[1] + (o.top || 0) + (o.bottom || 0))}px），或把這段字移進框內、縮短文字`, { overflow: o });
        seen.add(e.i);
        break;
      }
    }
  }
  // ✖ 內容（卡片、清單項目、圖示、圖片）被固定寬高的框裁掉（字已經報過被裁的元素不重複報）
  for (const K of els) {
    if (!(K.clipX || K.clipY) || !still(K) || K.allowOverflow) continue;
    let worst = null;
    for (const d of els) {
      if (d === K || seen.has(d.i) || !(d.painted || d.media) || !still(d) || d.allowOverflow || !(d.clips || []).includes(K.i)) continue;
      const o = overflowOf(d.rect, [K.clipX ? K.inner[0] : -1e9, K.clipY ? K.inner[1] : -1e9, K.clipX ? K.inner[2] : 1e9, K.clipY ? K.inner[3] : 1e9]);
      if (!o) continue;
      const m = Math.max(...Object.values(o));
      if (!worst || m > worst.m) worst = { d, o, m };
    }
    if (worst) {
      const { d, o } = worst;
      const needH = Math.ceil(K.rect[3] - K.rect[1] + (o.top || 0) + (o.bottom || 0)), needW = Math.ceil(K.rect[2] - K.rect[0] + (o.left || 0) + (o.right || 0));
      push('error', 'clipped', K, `內容被裁掉：${descText(boxDesc(K.desc))}（${Math.round(K.rect[2] - K.rect[0])}×${Math.round(K.rect[3] - K.rect[1])}，overflow 會裁切）裡的 ${descText(d.desc)} 超出${sides(o)}`,
        `${o.top || o.bottom ? `高度加到 ≥ ${needH}px` : ''}${(o.top || o.bottom) && (o.left || o.right) ? '、' : ''}${o.left || o.right ? `寬度加到 ≥ ${needW}px` : ''}（或拿掉固定寬高），加大後重跑 audit 確認沒撞到其他元素；或減少內容`, { overflow: o });
    }
  }
  // ✖ 超出畫面
  for (const { e, r } of content) {
    if (!still(e) || e.allowOverflow) continue;
    const o = overflowOf(r, canvasBox);
    if (o) push('error', 'canvas', e, `超出畫面：${descText(e.desc)} 超出${sides(o)}`, '把它移回 1920×1080 以內，或縮小容器／縮短文字', { overflow: o, rect: r });
  }
  // ✖ 進字幕區（y ≥ 920）
  for (const { e, r } of content) {
    if (!still(e) || e.allowCaption) continue;
    if (r[3] > CAPTION_Y + 0.5 && r[1] < H) {
      const up = Math.ceil(r[3] - CONTENT_BOTTOM);
      push('error', 'caption', e, `進字幕區：${descText(e.desc)} 下緣 y=${Math.round(r[3])}（字幕區 y ≥ ${CAPTION_Y}）`, `整組往上移 ≥ ${up}px，讓下緣 ≤ ${CONTENT_BOTTOM}（內容區 y 120–${CONTENT_BOTTOM}，R4.1），或縮短內容`, { rect: r });
    }
  }
  // ✖ 壓到子母畫面（全畫面版型、這一刻有子母畫面）
  if (ctx.layout === 'fullscreen' && ctx.pipOn) {
    for (const { e, r } of content) {
      if (!still(e)) continue;
      const x = intersect(r, PIP_ZONE);
      if (!x || x[2] - x[0] <= 1 || x[3] - x[1] <= 1) continue;
      const left = Math.ceil(r[2] - FS_RIGHT);
      push('error', 'pip', e, `壓到子母畫面：${descText(e.desc)} x ${Math.round(r[0])}–${Math.round(r[2])}、y ${Math.round(r[1])}–${Math.round(r[3])}，進到禁入區 x ${PIP_ZONE[0]}–${PIP_ZONE[2]}、y ${PIP_ZONE[1]}–${PIP_ZONE[3]}`,
        `全畫面主內容右緣 ≤ ${FS_RIGHT}（R7.2）：縮寬或左移 ≥ ${left}px；這段不需要露臉就在 plan.json 寫 "pip": false`, { rect: r });
    }
  }
  // ⚠ 壓到講者（透明疊在講者上的版型）
  if (ctx.layout === 'overlay' && ctx.speakerBox) {
    const box = shiftBox(ctx.speakerBox, ctx.item.side ? ctx.sideShift || 0 : 0);
    const rs = content.filter(({ e }) => still(e)).map(({ r }) => r);
    const ratio = coverRatio(rs, box);
    if (ratio >= (ctx.speakerWarn ?? SPEAKER_WARN)) {
      // 依最外層的區塊分組（清單裡的每一項都算在清單上），面積大的在前
      const rootOf = (e) => { let x = e; while (x.parent >= 0 && byI.get(x.parent)) x = byI.get(x.parent); return x; };
      const groups = new Map();
      for (const { e, r } of content) {
        if (!still(e)) continue;
        const a = area(intersect(r, box));
        if (!a) continue;
        const g = rootOf(e);
        groups.set(g, (groups.get(g) || 0) + a);
      }
      const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
      const who = top.slice(0, 2).map((g) => descText(boxDesc(g.desc))).join('、');
      push('warn', 'speaker', top[0], `壓到講者：內容蓋到講者框 ${Math.round(ratio * 100)}%（speakerBox ${JSON.stringify(box)}${ctx.item.side ? `，已加 sideShift ${ctx.sideShift}` : ''}）；主要是 ${who}`,
        `移到講者框外（例：右緣 ≤ ${box[0]}，或左緣 ≥ ${box[2]}）；用 snapshot 看有沒有擋到臉與手勢，擋到就移位或改 layout: "fullscreen"，只壓到身體就保留、交 Studio 時點名`, { ratio: r3(ratio), box });
    }
  }
  // ⚠ 字太小
  for (const e of els) {
    if (!e.text || !still(e)) continue;
    const size = e.fontSize * (e.scale > 0 && e.scale < 1 ? e.scale : 1);
    if (size < MIN_FONT) push('warn', 'font', e, `字太小：${descText(e.desc)} ${r1(size)}px（< ${MIN_FONT}px）`, '正文 ≥ 52px、標籤 ≥ 38px（R8.5）；放不下就縮文案，不縮字', { size: r1(size) });
  }
  // ⚠ 半像素邊（卡片、框線）
  for (const e of els) {
    if (!e.painted || e.full || e.shaped || !still(e)) continue;
    if (e.rect[2] - e.rect[0] < 16 || e.rect[3] - e.rect[1] < 16) continue;
    const s = subpixelEdges(e.rect);
    if (s) push('warn', 'subpixel', e, `半像素邊：${descText(e.desc)} 邊緣 ${Object.entries(s).map(([k, v]) => `${{ left: 'left', top: 'top', right: 'right', bottom: 'bottom' }[k]}=${v}`).join('、')}，直邊與框線會糊`, '寬高、left／top 寫整數 px；flex 平分（flex: 1）算出小數時改寫死寬度，或調 gap／padding 讓總寬整除（R8.4）', { edges: s });
  }
  return out;
}

// 同一段、同一規則、同一元素：只留一筆，時間合併（中點與完成態都有時，訊息取完成態那一筆）
export function mergeFindings(list) {
  const map = new Map();
  for (const f of list) {
    const k = `${f.id}|${f.rule}|${elKey(f.el)}`;
    const cur = map.get(k);
    if (!cur) { map.set(k, { ...f, at: [f.t] }); continue; }
    if (!cur.at.includes(f.t)) cur.at.push(f.t);
    if (f.kind === 'done' && cur.kind !== 'done') Object.assign(cur, { ...f, at: cur.at });
  }
  return [...map.values()].map((f) => ({ ...f, at: [...f.at].sort((a, b) => a - b) }));
}

export function formatFinding(f) {
  const mark = f.level === 'error' ? '✖' : '⚠';
  const at = (f.at || [f.t]).filter((t) => t != null).map(fmtT).join('、');
  return `${mark} [${f.id} ${f.label}] ${at ? `${at} ` : ''}${f.msg} → ${f.fix}`;
}

// custom 檔的 data-duration（root 上那個）與 const D
export function customDuration(html) {
  const tpl = String(html).match(/<template[^>]*>([\s\S]*)<\/template>/i);
  const inner = tpl ? tpl[1] : String(html);
  const m = inner.match(/data-composition-id="[^"]+"[^>]*?data-duration="([\d.]+)"|data-duration="([\d.]+)"[^>]*?data-composition-id="/);
  const d = m ? Number(m[1] ?? m[2]) : null;
  const c = inner.match(/const\s+D\s*=\s*([\d.]+)\s*;/);
  return { duration: Number.isFinite(d) ? d : null, constD: c ? Number(c[1]) : null };
}

// audit.mjs 的判定規則（純函式，零依賴；瀏覽器量到的原始資料 → ✖／⚠ 訊息）
//
//   pickItems(items, { only, all })   → { list, skipped, errors }  要量哪幾段（預設只量 custom；--all 加上情境與字卡動態；media 不量）
//   sampleTimes(item)                 → [{ t, kind: 'mid'|'done' }]  中點、完成態（段尾前 0.6 秒）
//   judgeSample(meas, ctx)            → findings[]  一個時間點、一段的判定
//   mergeFindings(list)               → 同一段、同一規則、同一元素只留一筆（時間合併）
//   customDuration(html)              → custom 檔裡寫的 data-duration、const D；autoEnd＝結尾寫 P.end()／用 P.dur()（長度自動等於段長）
//   ── 003（只判 custom）──
//   judgeLayout(meas, ctx)            → findings[]  未定位頂層、標題壓到內容／間距、區塊重疊、nowrap 餘裕、右側空白、垂直平衡、內距、行高
//   judgeMotion(motion, ctx)          → { findings, notes }  同一秒新元素、間隔、完成態停留、最後一幕、拍在段尾之後（motion＝collectMotionInPage 的結果）
//   floorFindings({ item, html, cuesOut, file, tpl }) → findings[]  custom 檔頭【D 下限】的第一拍與段長；tpl＝範例原檔：這兩種下限被改小或刪掉 ⚠
//   fontShrinkFindings({ item, html, tpl, file }) → findings[]  字級比範例小 ⚠（元素用 id／class 去掉前綴對回範例）
//   rootSelectorFindings({ item, html, file }) → findings[]  P.* 的選擇器從最外層 id 開始（'#x-rack .card'）✖：build 後最外層的 id 被拿掉，kit 找不到元素
//   stillTimes(motion, item)          → [{ t, kind: 'still' }]  每個 ≥ 0.4 秒的靜止區間取中點（每段最多 8 個）
//   cueFindings(errors, items)        → { findings, warnings }  window.__cueErrors → 綁句失敗 ✖
//   formatFinding(f)／fmtT(t)／descText(desc)
//   ── 009 直式（只在 format: "portrait" 時用；canvas.mjs 的 CANVAS.portrait）──
//   stageKindOf(item)                 → 'fs'｜'ch'｜'fx'｜null  舞台縮放的段（全畫面 custom 與 04 家族、01、字卡動態）；null＝直式原生（overlay）
//   portraitPlan(item, canvas, regions) → { unstage, W, H, stage?, geo? }  這段怎麼量：舞台段拿掉 stage transform 量子合成座標，原生段用 1080×1920 量
//
// 座標一律是 1920×1080 的畫面像素（頁面就是 1920×1080、deviceScaleFactor 1，getBoundingClientRect 直接就是畫面座標）。
// 矩形寫成 [左, 上, 右, 下]。只判「靜止」的元素：正在補間（0 < progress < 1）的元素和它的子孫不判，避免把進場暫態當破版。

import { PIP_ZONE } from './media.mjs';
import { CANVAS as CANVASES, stageTransform } from './canvas.mjs';
import { parseTime, cueSeconds, r3Round as r3, clock2 } from './time.mjs';

export const CANVAS = [1920, 1080];
export const CAPTION_Y = 920;       // 字幕區從 y 920 起（R4.1；check --caption-zone 的 y0=0.852）
export const CONTENT_BOTTOM = 870;  // 內容區下緣（R4.1），改法建議移到這條線以上
export const FS_RIGHT = 1380;       // 全畫面主內容右緣上限（R4.1、R7.2）
export { PIP_ZONE };                // 子母畫面外框禁入區（lib/media.mjs，和 build 同一組數字）
export const DONE_BEFORE = 0.6;     // 完成態＝段尾前 0.6 秒（完成態至少停 0.6s，USAGE 4.2）
export const MIN_FONT = 30;         // 字太小的門檻（R8.5 的下限是正文 52、標籤 38；30 以下一定看不清）
export const SPEAKER_WARN = 0.02;   // custom 與用 css 移過位的段：蓋到講者框 ≥ 2% 就提醒（四邊已外擴 40px，碰到邊不算；R8.17）
export const SPEAKER_WARN_TEMPLATE = 0.4;    // 沒移位的情境模板：蓋到講者框 ≥ 40%（手勢多半會被擋）才提醒；和 build --check 的碰撞提醒同一個門檻（R4.1）
export const FACE_WARN = 0.05;      // 不管哪種段：蓋到臉的位置（faceZone）≥ 5% 就提醒。模板固定的版位只壓到講者框下半身（身體）不報
export const SUBPIXEL = 0.2;        // 邊緣離整數 px ≥ 0.2 才算半像素（0.05 這種量測尾數不會糊）
export const TOL = 2;               // 一般容許誤差（px），和 hyperframes check 的預設 tolerance 相同
// 003 版面（R8 #6、OV＝作者 overlay 規範）與節奏（style.md〈節奏〉、TR/v3）；標「初值」的是本線訂的、可依實測調
export const TITLE_GAP_MIN = 24, TITLE_GAP_GOAL = 40;   // 標題到內容：< 24 ⚠，目標 40（OV/AW:L77、R8 #6）
export const NOWRAP_MIN = 7;                            // nowrap 文字到框的餘裕（OV/SKILL.md:132）
export const SLACK_MAX = 80, CENTER_TOL = 8, STRIP_TOL = 16;   // 右側空白上限（OV/SKILL.md:140）；置中容許、撐滿父層的橫條（初值）
// 全螢幕段（沒有講者）的內容設計動畫：左右和縮到 87% 的錄影對齊（錄影 x 125–1796、y 0–940），上下 y 112–900（角標底 96 之下、字幕 920 之上）
export const FULL = { x: [120, 1800], y: [112, 900], top: 40, tall: 640, cx: 960, off: 160, minW: 1100 };
// 內容設計動畫的完成態要把主內容區用起來（2026-11-11 MiniMax 試跑：照元件表的下限尺寸擺，手機 120×250，畫面大半是空的）
//   PIP＝右下有講者小視窗時的主內容區；FILL_MIN＝內容蓋到的面積（20px 格子，重疊只算一次）佔主內容區的比例下限；HERO＝最大那個插圖的長邊下限
export const DESIGN = { PIP: [120, 150, 1300, 858], CELL: 20, FILL_MIN: 0.3, HERO: 300 };
export const VBAL_MAX = 40, CONTENT_TOP = 120;          // 垂直平衡（OV/AW:L218）；內容區 y 120–870（R4.1）
export const PAD_X = [24, 0.45], PAD_Y = [14, 0.28];    // 內距門檻 max(24, 0.45×字級)、max(14, 0.28×字級)（R8 #6）
export const LH_MIN = 1.25, LH_SKIP_FONT = 100;         // 行高 ≥ 1.25×字級（OV/PS:L27）；字級 ≥ 100 的數字不判
export const DENSITY_MAX = 2, DENSITY_WIN = 1.0;        // 任何 1 秒內新元素 ≤ 2（TR/v3:L12-13）
export const STAGGER_MIN = 0.12;                        // 新元素間隔 ≥ 0.12s（TR/v3:L12-13；文件建議 0.15）
export const HOLD_MIN = 1.2, TAIL_MIN = 1.5;            // 完成態停留、最後一幕（定案；P.READ／P.HOLD_END）
export const MERGE_WIN = 0.6, SWAP_WIN = 0.15, EMPH_PX = 8, BUSY_GAP = 0.05, STILL_MIN = 0.4, STILL_MAX = 8;   // 初值；STILL_MIN 出自 OV/AW:L215

const r1 = (n) => Math.round(n * 10) / 10;
export const fmtT = clock2;

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
  // 範例原文（剛複製、還沒做）不量；--only 指名的照量（量範例本身時用）
  const named = !!(only && only.length);
  if (!named) for (const it of list) if (it.sample) skipped.push(`${it.id}（${it.file} 還是範例原文、還沒做 → 照 auto-edit-motion 改完再量）`);
  return { list: list.filter((x) => x.type !== 'media' && (named || !x.sample)), skipped, errors };
}

// --only 的 build --check 怎麼算（平行工人互相不擋）：其他段的 ✖ 不影響指名段的量測，只算個數；指名段自己的 ✖ 與全域的 ✖ 才擋。
// 沒有 --only：每個 ✖ 都擋。res＝resolvePlan 的結果（allItems 含排不上時間軸的段，it.errors 是那段自己的 ✖）→ { fatal: [訊息], others: 個數, otherIds: [段 id] }
export function gateCheck(res, only = null) {
  const errors = res?.errors || [];
  if (!only || !only.length) return { fatal: [...errors], others: 0, otherIds: [] };
  const want = new Set(only), of = new Map(), items = res.allItems || res.items || [], known = new Set(items.map((it) => it.id));
  for (const it of items) {
    if (want.has(it.id)) continue;
    for (const e of it.errors || []) of.set(e, it.id ?? '?');
  }
  // 不在 it.errors 但寫明是哪一段的（[s14 speaker] … 這種，build 另外查的）：一樣算那一段的
  for (const e of errors) {
    const id = String(e).match(/^\[([^\s\]]+)/)?.[1];
    if (id && known.has(id) && !want.has(id) && !of.has(e)) of.set(e, id);
  }
  const fatal = errors.filter((e) => !of.has(e));
  const hit = errors.filter((e) => of.has(e));
  return { fatal, others: hit.length, otherIds: [...new Set(hit.map((e) => of.get(e)))] };
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
// ---------- 009 直式 ----------
// 舞台縮放（FR-022、FR-023、FR-051、FR-070）：全畫面 custom 與 04 家族 → fs、01 章節 → ch、字卡動態 → fx；其他段直式原生（FR-072）
// 情境看 scene.json 的 "portrait"（"stage"＝縮放；"move"／"none"＝原生），沒寫就照編號（01、04 家族）；01 用 ch 舞台，其他 fs
export function stageKindOf(item) {
  if (item.type === 'fx') return 'fx';
  if (item.type === 'custom') return layoutOf(item) === 'fullscreen' ? 'fs' : null;
  const sc = item.scene && typeof item.scene === 'object' ? item.scene : { no: item.scene };
  const no = String(sc.no || sc.num || '');
  if (sc.portrait ? sc.portrait !== 'stage' : !/^0(1|4)/.test(no)) return null;
  return /^01/.test(no) ? 'ch' : 'fs';
}
// regions＝頁面的 window.__regions（build 直式注入）；有 captions 就用它當字幕保留帶，沒有用 canvas 的 caption.zone
export function portraitPlan(item, canvas = CANVASES.portrait, regions = null) {
  const kind = stageKindOf(item);
  if (kind) {
    const st = stageTransform(kind, canvas, { clear: kind === 'fx' && item.seg?.bg === 'none' });
    // view＝舞台在直式畫面上看得到的範圍（子合成座標）：左右到畫布邊、上到 unsafe 頂帶下緣、下到講者面板頂（01 沒有面板：到 unsafe 底帶上緣）
    const top = canvas.unsafe.find((u) => u[1] <= 0)?.[3] ?? 0, bot = kind === 'fs' ? canvas.pip.box[1] : canvas.unsafe.find((u) => u[3] >= canvas.H && u[0] <= 0)?.[1] ?? canvas.H;
    const r1_ = (n) => Math.round(n * 10) / 10;
    const view = [Math.max(0, r1_(-st.tx / st.s)), Math.max(0, r1_((top - st.ty) / st.s)), Math.min(CANVAS[0], r1_((canvas.W - st.tx) / st.s)), Math.min(CANVAS[1], r1_((bot - st.ty) / st.s))];
    return { unstage: true, W: CANVAS[0], H: CANVAS[1], stage: { kind, s: st.s, window: kind === 'fx' ? null : st.window, view: kind === 'fx' ? null : view, minFont: canvas.minTextPx } };
  }
  const c = regions && Array.isArray(regions.captions) ? [regions.captions[0], regions.captions[1], regions.captions[0] + regions.captions[2], regions.captions[1] + regions.captions[3]] : canvas.caption.zone;
  return { unstage: false, W: canvas.W, H: canvas.H, geo: { captionY: c[1], captionEnd: c[3], contentBottom: canvas.lowerThird.rect[3], unsafe: canvas.unsafe, minFont: canvas.minTextPx } };
}
const UNSAFE_ZH = (u, W, H) => (u[1] <= 0 ? `上方 ${u[3]}px` : u[3] >= H && u[0] <= 0 ? `下方 ${H - u[1]}px` : '右側按鈕列');

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
// 臉的位置（估）：speakerBox＝頭、身體、手勢外擴 pad；頭頂＝上緣＋pad，下巴≈頭頂＋內框高 30%（qc.mjs framing 沒有 landmark 時同一個估法），
// 左右以框的中線為準各一個頭高，四邊再外擴 pad（同 speakerBox 的口徑）
export function faceZone(box, pad = 40) {
  if (!box) return null;
  const [x1, y1, x2, y2] = box;
  const top = y1 + pad, chin = top + 0.3 * Math.max(0, y2 - pad - top), head = chin - top, cx = (x1 + x2) / 2;
  return [Math.max(x1, cx - head - pad), y1, Math.min(x2, cx + head + pad), Math.min(y2, chin + pad)];
}
// 蓋到講者要不要提醒：ratio＝蓋到講者框的比例、face＝蓋到臉的位置的比例、th＝講者框的門檻（模板 SPEAKER_WARN_TEMPLATE、custom 與 css 移位 SPEAKER_WARN）
export const coverWarn = (ratio, face, th = SPEAKER_WARN_TEMPLATE) => ratio >= th - 1e-9 || face >= FACE_WARN - 1e-9;
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
  // 009 直式：geo＝原生段的幾何（字幕保留帶、unsafe、字級下限）；stage＝舞台縮放的段（量的是子合成座標，另判舞台窗與縮放後的字級）
  const G = ctx.geo || {}, ST = ctx.stage || null;
  const captionY = G.captionY ?? CAPTION_Y, captionEnd = G.captionEnd ?? Infinity, contentBottom = G.contentBottom ?? CONTENT_BOTTOM;
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
      const clipBox = [K.clipX ? K.inner[0] : -1e9, K.clipY ? K.inner[1] : -1e9, K.clipX ? K.inner[2] : 1e9, K.clipY ? K.inner[3] : 1e9];
      const o = overflowOf(d.rect, clipBox);
      if (!o) continue;
      // 整個在框外＝藏著等滑進來（P.slide 的抽屜），不是被裁掉一半
      if (d.rect[2] <= clipBox[0] + 0.5 || d.rect[0] >= clipBox[2] - 0.5 || d.rect[3] <= clipBox[1] + 0.5 || d.rect[1] >= clipBox[3] - 0.5) continue;
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
    if (o) push('error', 'canvas', e, `超出畫面：${descText(e.desc)} 超出${sides(o)}`, `把它移回 ${W}×${H} 以內，或縮小容器／縮短文字`, { overflow: o, rect: r });
  }
  // ✖ 進字幕區（橫式 y ≥ 920；直式原生段 y 1280–1420）
  for (const { e, r } of content) {
    if (!still(e) || e.allowCaption) continue;
    if (r[3] > captionY + 0.5 && r[1] < Math.min(H, captionEnd)) {
      const up = Math.ceil(r[3] - contentBottom);
      if (ctx.geo) push('error', 'caption', e, `進字幕區：${descText(e.desc)} y ${Math.round(r[1])}–${Math.round(r[3])}（直式字幕保留帶 y ${captionY}–${captionEnd}）`, `整組往上移 ≥ ${up}px，讓下緣 ≤ ${contentBottom}（直式下方字卡的下緣），或縮短內容`, { rect: r });
      else push('error', 'caption', e, `進字幕區：${descText(e.desc)} 下緣 y=${Math.round(r[3])}（字幕區 y ≥ ${CAPTION_Y}）`, `整組往上移 ≥ ${up}px，讓下緣 ≤ ${CONTENT_BOTTOM}（內容區 y 120–${CONTENT_BOTTOM}，R4.1），或縮短內容`, { rect: r });
    }
  }
  // ✖ 直式：進到平台介面蓋住的區域（unsafe[]：上方、下方、右側按鈕列）
  for (const u of G.unsafe || []) {
    for (const { e, r } of content) {
      if (!still(e) || e.allowOverflow) continue;
      const x = intersect(r, u);
      if (!x || x[2] - x[0] <= 1 || x[3] - x[1] <= 1) continue;
      push('error', 'unsafe', e, `直式會被平台介面蓋住：${descText(e.desc)} x ${Math.round(r[0])}–${Math.round(r[2])}、y ${Math.round(r[1])}–${Math.round(r[3])}，進到${UNSAFE_ZH(u, W, H)}（x ${u[0]}–${u[2]}、y ${u[1]}–${u[3]}）`,
        '移進 x 60–940、y 240–1240（直式的安全區；右側 x 940 以右留給平台按鈕），或縮小容器／縮短文字', { rect: r, unsafe: u });
    }
  }
  // ✖ 直式：舞台縮放的段只顯示舞台窗（fs [120,130,1300,880]、ch [160,260,1760,870]），帶 id 的絕對定位元素超出就會被切到（FR-071）
  if (ST && ST.window) {
    const [x0, y0, x1, y1] = ST.window;
    for (const e of els) {
      if (!e.desc || !e.desc.id || e.pos !== 'absolute' || !still(e) || e.bg || e.full || e.allowOverflow) continue;
      // 量擺位（版面外框，不含 transform）：P.cam 鏡頭推、聚焦放大是暫時的，不算擺位超出
      const lb = meas.layoutBoxes && meas.layoutBoxes[e.desc.id];
      const r = lb || visible(e, e.rect);
      if (!r || r[2] - r[0] <= 0 || r[3] - r[1] <= 0) continue;
      const o = overflowOf(r, ST.window);
      if (!o) continue;
      push('error', 'portrait-window', e, `${ST.kind === 'ch' ? '直式時會被切到' : '直式時會被切到或壓到講者面板'}：${descText(e.desc)} x ${Math.round(r[0])}–${Math.round(r[2])}、y ${Math.round(r[1])}–${Math.round(r[3])}，超出舞台窗 x ${x0}–${x1}、y ${y0}–${y1}（${sides(o)}）`,
        `內容留在 x ${x0}–${x1}、y ${y0}–${y1}（直式只顯示這一塊，縮 ${ST.s} 倍放進上半面板）；刻意出血的裝飾標 data-layout-allow-overflow`, { overflow: o, rect: r, window: ST.window });
    }
  }
  // ✖ 壓到子母畫面（全畫面版型、這一刻有子母畫面）
  // ⚠ 直式：P.cam 鏡頭推（每一個停點的倍率與往焦點帶的位移）把鏡頭容器推出舞台看得到的範圍（只在完成態判一次，每個容器一則）
  if (ST && ST.view && ctx.kind === 'done' && meas.camBoxes) {
    const [v0, v1, v2, v3] = ST.view;
    for (const [key, c] of Object.entries(meas.camBoxes)) {
      if (!c || !c.box) continue;
      const o = overflowOf(c.box, ST.view);
      if (!o) continue;
      const SIDE = { right: '右緣', left: '左緣', top: '上緣', bottom: '下緣' };
      const cut = Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${SIDE[k]}會切掉 ${Math.ceil(v)}px`).join('、');
      const d = { id: /^[A-Za-z][\w-]*$/.test(key) ? key : '', cls: /^[A-Za-z][\w-]*$/.test(key) ? '' : key, text: '', near: '' };
      out.push({ ...base, level: 'warn', rule: 'portrait-cam', el: d, msg: `鏡頭推時${cut}：${descText(d)}（P.cam 最大 ${c.scale} 倍；直式看得到 x ${Math.round(v0)}–${Math.round(v2)}、y ${Math.round(v1)}–${Math.round(v3)}）`,
        fix: '內容群縮小一級（data-gap 改小一級或字級 −4），或這段不用 P.cam（shared/style.md「直式」）', data: { overflow: o, box: c.box, view: ST.view, scale: c.scale } });
    }
  }
  if (ctx.layout === 'fullscreen' && ctx.pipOn && !ctx.geo && !ST) {
    for (const { e, r } of content) {
      if (!still(e)) continue;
      const x = intersect(r, PIP_ZONE);
      if (!x || x[2] - x[0] <= 1 || x[3] - x[1] <= 1) continue;
      const left = Math.ceil(r[2] - FS_RIGHT);
      push('error', 'pip', e, `壓到子母畫面：${descText(e.desc)} x ${Math.round(r[0])}–${Math.round(r[2])}、y ${Math.round(r[1])}–${Math.round(r[3])}，進到禁入區 x ${PIP_ZONE[0]}–${PIP_ZONE[2]}、y ${PIP_ZONE[1]}–${PIP_ZONE[3]}`,
        `全畫面主內容右緣 ≤ ${FS_RIGHT}（R7.2）：縮寬或左移 ≥ ${left}px；這段不需要露臉就在 plan.json 寫 "pip": false`, { rect: r });
    }
  }
  // ✖ 壓到右上角的小節角標（全畫面段：角標常駐，內容用滿畫面時最容易撞到）
  if (ctx.layout === 'fullscreen' && ctx.badgeBox && !ctx.geo && !ST) {
    const b = ctx.badgeBox;
    for (const { e, r } of content) {
      if (!still(e)) continue;
      const x = intersect(r, b);
      if (!x || x[2] - x[0] <= 1 || x[3] - x[1] <= 1) continue;
      push('error', 'badge', e, `壓到右上角的小節角標：${descText(e.desc)} x ${Math.round(r[0])}–${Math.round(r[2])}、y ${Math.round(r[1])}–${Math.round(r[3])}，角標在 x ${Math.round(b[0])}–${Math.round(b[2])}、y ${Math.round(b[1])}–${Math.round(b[3])}`,
        `往下移到 y ≥ ${Math.ceil(b[3]) + 16}，或往左移到右緣 ≤ ${Math.floor(b[0]) - 16}`, { rect: r, badge: b });
    }
  }
  // ⚠ 壓到講者（透明疊在講者上的版型）
  if (ctx.layout === 'overlay' && ctx.speakerBox) {
    const box = shiftBox(ctx.speakerBox, ctx.item.side ? ctx.sideShift || 0 : 0);
    const rs = content.filter(({ e }) => still(e)).map(({ r }) => r);
    const ratio = coverRatio(rs, box), face = coverRatio(rs, faceZone(box));
    if (coverWarn(ratio, face, ctx.speakerWarn ?? SPEAKER_WARN)) {
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
      // 027：蓋到臉（臉的位置 ≥ FACE_WARN）是 ✖，一定要移開；只壓到身體、手勢還是 ⚠
      push(face >= FACE_WARN ? 'error' : 'warn', 'speaker', top[0], `${face >= FACE_WARN ? '蓋到講者的臉' : '壓到講者'}：內容蓋到講者框 ${Math.round(ratio * 100)}%${face >= FACE_WARN ? `、臉的位置 ${Math.round(face * 100)}%` : ''}（speakerBox ${JSON.stringify(box)}${ctx.item.side ? `，已加 sideShift ${ctx.sideShift}` : ''}）；主要是 ${who}`,
        `移到講者框外（例：右緣 ≤ ${box[0]}，或左緣 ≥ ${box[2]}）；用 snapshot 看有沒有擋到臉與手勢，擋到就移位或改 layout: "fullscreen"，只壓到身體就保留、給使用者看預覽時點名`, { ratio: r3(ratio), face: r3(face), box });
    }
  }
  // ⚠ 字太小
  for (const e of els) {
    if (!e.text || !still(e)) continue;
    const size = e.fontSize * (e.scale > 0 && e.scale < 1 ? e.scale : 1);
    if (ST) {
      const shown = size * ST.s;
      if (shown < ST.minFont) push('warn', 'font', e, `字太小：${descText(e.desc)} 直式縮 ${ST.s} 倍後 ${r1(shown)}px（< ${ST.minFont}px）`, `直式要寫 ≥ ${Math.ceil(ST.minFont / ST.s)}px（縮放前）；正文 ≥ 52px、標籤 ≥ 38px（R8.5）；放不下就縮文案，不縮字`, { size: r1(shown) });
      continue;
    }
    const min = G.minFont ?? MIN_FONT;
    if (size < min) push('warn', 'font', e, `字太小：${descText(e.desc)} ${r1(size)}px（< ${min}px）`, '正文 ≥ 52px、標籤 ≥ 38px（R8.5）；放不下就縮文案，不縮字', { size: r1(size) });
  }
  // ⚠ 半像素邊（卡片、框線）
  for (const e of els) {
    if (!e.painted || e.full || e.shaped || !still(e)) continue;
    if (e.micro || (e.scale && Math.abs(e.scale - 1) > 0.005)) continue;   // 漂浮中、鏡頭推、聚焦放大中的元素（v2）：邊一定是小數，不是寫錯
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
  const code = [...inner.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const autoEnd = /\bP\.end\(\s*\)/.test(code) || /\bP\.dur\(\s*\)/.test(code);
  return { duration: Number.isFinite(d) ? d : null, constD: c ? Number(c[1]) : null, autoEnd };
}

// ====================== 003：custom 的版面規則 ======================

// a 是不是 d 的祖先：用量測端的 anc（中間隔著高 0 的 wrapper 也算得到）；舊資料沒有 anc 時照 parent 鏈
export const isAnc = (byI, a, d) => { if (d && d.anc) return d.anc.includes(a.i); for (let x = d; x && x.parent >= 0; ) { if (x.parent === a.i) return true; x = byI.get(x.parent); } return false; };
const ancsOf = (byI, e) => (e.anc ? e.anc.map((k) => byI.get(k)).filter(Boolean) : (() => { const out = []; for (let x = byI.get(e.parent); x; x = byI.get(x.parent)) out.push(x); return out; })());
const clipTo = (byI, e, r) => {
  let v = r;
  for (const k of e.clips || []) { const c = byI.get(k); if (!c) continue; v = intersect(v, [c.clipX ? c.inner[0] : -1e9, c.clipY ? c.inner[1] : -1e9, c.clipX ? c.inner[2] : 1e9, c.clipY ? c.inner[3] : 1e9]); if (!v) return null; }
  return v;
};
// 元素畫在畫面上的範圍：svg 用裡面形狀的聯集（連接線圖層的框是整個內容區，不代表畫了什麼）
const drawnRect = (e) => (e.tag === 'svg' && e.shapeRect ? e.shapeRect : e.rect);
// 文字：左右用行框、上下用墨跡（大字級的行框比字形高很多）
const inkBox = (e) => (e.inkRect ? [e.textRect[0], e.inkRect[1], e.textRect[2], e.inkRect[3]] : e.textRect);
const unionOf = (rs) => (rs.length ? [Math.min(...rs.map((r) => r[0])), Math.min(...rs.map((r) => r[1])), Math.max(...rs.map((r) => r[2])), Math.max(...rs.map((r) => r[3]))] : null);
const bwOf = (e) => e.bw || [0, 0, 0, 0];
const padOf = (e) => e.pad || [0, 0, 0, 0];
const ri = (n) => Math.round(n);

// ctx＝{ item, t, kind, layout }（和 judgeSample 相同）
export function judgeLayout(meas, ctx) {
  const out = [];
  if (!meas || meas.missingHost || !ctx.item || ctx.item.type !== 'custom') return out;
  const base = { id: ctx.item.id, label: ctx.item.label, t: ctx.t, kind: ctx.kind };
  const push = (level, rule, el, msg, fix, data = {}) => out.push({ ...base, level, rule, el, msg, fix, data });
  const els = meas.els || [];
  const byI = new Map(els.map((e) => [e.i, e]));
  const shown = (e) => !e.moving && (e.alpha ?? 1) >= 0.05;
  const parentPainted = (e) => ancsOf(byI, e).find((x) => x.painted) || null;
  // 疊在父層上的一層（亮框、底色）：四邊離父層 ≤ 8px，算父層的一部分
  const anchorOf = (e) => { const p = ancsOf(byI, e)[0]; return p && [0, 1, 2, 3].every((k) => Math.abs(e.rect[k] - p.rect[k]) <= EMPH_PX) ? p : e; };
  const textBoxes = els.filter((e) => shown(e) && e.frame && (e.own || []).length && e.chars > 0);

  // ✖ 未定位頂層
  for (const tp of meas.tops || []) {
    if (['absolute', 'fixed'].includes(tp.pos) || !(tp.w > 0 && tp.h > 0)) continue;
    const pn = tp.parent && tp.parent.root ? `root（${tp.parent.root}）` : descText(boxDesc(tp.parent));
    push('error', 'unpositioned', tp.desc, `未定位頂層：${descText(tp.desc)} 直接放在 ${pn} 底下，position 是 ${tp.pos}（會照文件順序往下排，換字或加元素就跑位）`,
      '幫它寫 position: absolute 和整數 px 的 left、top（R7.3 骨架），或把它移進已經定位的卡片裡', { pos: tp.pos });
  }

  // ✖ 標題壓到內容／⚠ 間距不足
  for (const T of els) {
    if (!T.title || !shown(T)) continue;
    const C = parentPainted(T);
    const cand = els.filter((e) => e !== T && shown(e) && !e.bg && (e.text || e.painted || e.media) && (!C || isAnc(byI, C, e)) && !isAnc(byI, T, e));
    let best = null;
    for (const e of cand) {
      const r = clipTo(byI, e, e.text && !e.painted && !e.media ? inkBox(e) : drawnRect(e));
      if (!r || r[1] < T.rect[1] - 0.5 || r[2] <= T.rect[0] || r[0] >= T.rect[2]) continue;
      if (!best || r[1] < best.r[1]) best = { e, r };
    }
    if (!best) continue;
    const gap = best.r[1] - T.rect[3];
    if (gap < -TOL) {
      const n = Math.ceil(-gap);
      push('error', 'title-overlap', T.desc, `標題壓到內容：${descText(boxDesc(T.desc))} 下緣 y=${ri(T.rect[3])}，${descText(best.e.desc)} 上緣 y=${ri(best.r[1])}（重疊 ${n}px）`,
        `內容整組往下移 ≥ ${TITLE_GAP_GOAL + n}px，讓間距到 ${TITLE_GAP_GOAL}px（下面每一層一起移）；底部空間不夠就把標題往上、內容往下分攤（R8 #6）`, { gap: r1(gap) });
    } else if (gap < TITLE_GAP_MIN - 1e-6) {
      const g = Math.max(0, ri(gap));
      push('warn', 'title-gap', T.desc, `間距不足：${descText(boxDesc(T.desc))} 到 ${descText(best.e.desc)} 只有 ${g}px（< ${TITLE_GAP_MIN}px；目標 ≥ ${TITLE_GAP_GOAL}px）`,
        `內容整組往下移 ${TITLE_GAP_GOAL - g}px（下面每一層一起移，移完確認下緣 ≤ ${CONTENT_BOTTOM}）（R8 #6）`, { gap: r1(gap) });
    }
  }

  // ⚠ 區塊重疊：有底框的區塊與圖片（svg 線稿不算區塊）
  const blocks = els.filter((e) => shown(e) && !e.bg && !e.full && !e.allowOverlap && (e.painted || (e.media && e.tag !== 'svg')));
  for (let a = 0; a < blocks.length; a++) for (let b = a + 1; b < blocks.length; b++) {
    const A = blocks[a], B = blocks[b];
    const a0 = anchorOf(A), b0 = anchorOf(B);
    if (a0 === b0 || isAnc(byI, a0, B) || isAnc(byI, b0, A) || isAnc(byI, A, B) || isAnc(byI, B, A)) continue;
    const ra = clipTo(byI, A, A.rect), rb = clipTo(byI, B, B.rect);
    const x = intersect(ra, rb);
    if (!x || x[2] - x[0] <= TOL || x[3] - x[1] <= TOL) continue;
    push('warn', 'overlap', A.desc, `區塊重疊：${descText(boxDesc(A.desc))} 和 ${descText(boxDesc(B.desc))} 重疊 ${ri(x[2] - x[0])}×${ri(x[3] - x[1])}px`,
      '把其中一個移開，至少隔 24px；box 交疊但畫面上沒碰到時看 snapshot；刻意疊的（例：通知疊在介面上）在其中一個加 data-layout-allow-overlap，並在回報寫理由', { with: B.desc });
  }

  // ⚠ 內距不足／行高不足（文字框）
  const padReported = new Set();
  for (const e of textBoxes) {
    if (e.round || e.kit || e.allowTight || e.chars <= 2) continue;
    const u = unionOf(e.own), bw = bwOf(e);
    const fs = e.ownFont ? e.ownFont.fs : e.fontSize;
    const L = u[0] - (e.rect[0] + bw[0]), T = u[1] - (e.rect[1] + bw[1]), R = (e.rect[2] - bw[2]) - u[2], B = (e.rect[3] - bw[3]) - u[3];
    const x = Math.max(PAD_X[0], PAD_X[1] * fs), y = Math.max(PAD_Y[0], PAD_Y[1] * fs);
    const tol = TOL;   // 2px（量測端已還原 .sc-opt 的光學位移；圖示＋字直排時整組仍會被 --opt 撐高幾 px）
    const shortX = L < x - tol || R < x - tol, shortY = T < y - tol || B < y - tol;
    if (shortX || shortY) {
      const w = e.rect[2] - e.rect[0], h = e.rect[3] - e.rect[1];
      const needW = Math.ceil(w + Math.max(0, x - L) + Math.max(0, x - R)), needH = Math.ceil(h + Math.max(0, y - T) + Math.max(0, y - B));
      const fix = [shortX ? `寬度加到 ≥ ${needW}px` : '', shortY ? `高度加到 ≥ ${needH}px` : ''].filter(Boolean).join('、');
      push('warn', 'padding', e.desc, `內距不足：${descText(boxDesc(e.desc))} 裡的文字 左 ${ri(L)}、右 ${ri(R)}、上 ${ri(T)}、下 ${ri(B)}px（字級 ${ri(fs)}px：左右要 ≥ ${ri(x)}px、上下要 ≥ ${ri(y)}px）`,
        `${fix}（整數），或縮短文字；不要縮字級（R8 #6）`, { L: r1(L), R: r1(R), T: r1(T), B: r1(B), x: r1(x), y: r1(y) });
      padReported.add(e.i);
    }
    if (e.ownFont && fs < LH_SKIP_FONT && e.ownFont.lh / fs < LH_MIN - 1e-6 && B < y + 4) {
      push('warn', 'line-height', e.desc, `行高不足：${descText(boxDesc(e.desc))} line-height ${r1(e.ownFont.lh)}px／字級 ${ri(fs)}px＝${(e.ownFont.lh / fs).toFixed(2)}（< ${LH_MIN}），下內距只有 ${ri(B)}px`,
        `改用 kit 的字級 class（.sc-t${ri(fs)} 的行高已經 ≥ ${LH_MIN} 倍），或 line-height 寫 ≥ ${Math.ceil(LH_MIN * fs)}px（R8 #6）`, { lh: e.ownFont.lh, fs });
    }
  }

  // ⚠ nowrap 餘裕不足
  for (const e of els) {
    if (!shown(e) || e.whiteSpace !== 'nowrap' || !e.text || !e.textRect || e.allowOverflow) continue;
    const C = e.painted ? e : parentPainted(e);
    if (!C || padReported.has(C.i) || C.full || C.bg) continue;
    const bw = bwOf(C);
    const gl = e.textRect[0] - (C.rect[0] + bw[0]), gr = (C.rect[2] - bw[2]) - e.textRect[2];
    const m = Math.min(gl, gr);
    if (m < 0 || m >= NOWRAP_MIN - 1e-6) continue;
    const w = Math.ceil(C.rect[2] - C.rect[0] + 2 * (NOWRAP_MIN - m));
    // 文字靠一邊（左右餘裕差 > 2px）時加寬只會撐大另一邊，餘裕不變（MiniMax 照「加寬」改了三輪，門檻跟著漲）：改叫加那一邊的 padding
    const side = Math.abs(gl - gr) > 2 ? (gl < gr ? 'left' : 'right') : null;
    const fix = side ? `${side === 'left' ? '左' : '右'}邊只剩 ${r1(m)}px：padding-${side} 再加 ${Math.ceil(NOWRAP_MIN - m)}px（整數；文字靠${side === 'left' ? '左' : '右'}，加寬框沒有用），或縮短文字；不要縮字級（R8 #5）`
      : `容器寬度加到 ≥ ${w}px（整數），或縮短文字；不要縮字級（R8 #5）`;
    push('warn', 'nowrap', e.desc, `nowrap 餘裕不足：${descText(e.desc)} 離 ${C === e ? '自己' : descText(boxDesc(C.desc))} 的框只剩 ${r1(m)}px（< ${NOWRAP_MIN}px）`,
      fix, { m: r1(m) });
  }

  // ⚠ 右側空白過多（同一欄 left 與寬相同的一起算，取最小）
  const groups = new Map();
  for (const e of textBoxes) {
    if (e.kit || e.allowSlack || e.widthShared) continue;
    const w = e.rect[2] - e.rect[0];
    if (!(w < (e.parentInnerW ?? 1e9) - STRIP_TOL)) continue;   // 撐滿父層的橫條不算
    const u = unionOf(e.own), bw = bwOf(e), pd = padOf(e);
    const right = (e.rect[2] - bw[2] - pd[2]) - u[2], left = u[0] - (e.rect[0] + bw[0] + pd[0]);
    if (e.centered && Math.abs(right - left) <= CENTER_TOL) continue;
    const k = `${ri(e.rect[0])}|${ri(w)}`;
    const g = groups.get(k) || [];
    g.push({ e, right });
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    const min = g.reduce((a, b) => (b.right < a.right ? b : a));
    if (min.right <= SLACK_MAX + 1e-6) continue;
    push('warn', 'slack', min.e.desc, `右側空白過多：${descText(boxDesc(min.e.desc))} 內容最右緣到框內緣 ${ri(min.right)}px（> ${SLACK_MAX}px）${g.length > 1 ? `（同一欄 ${g.length} 個一起算，取最小）` : ''}`,
      '框寬改 width: max-content（或改成整數 px 的「內容寬＋右內距」）；同一欄要等寬就讓它們 left 和 width 相同；左右並排要等寬加 data-width-shared；刻意留白加 data-layout-allow-slack（R8 #6）', { right: r1(min.right) });
  }

  // ⚠ 垂直不平衡（全畫面）
  if (ctx.layout === 'fullscreen') {
    const rs = [];
    for (const e of els) {
      if (!shown(e) || e.bg || e.full) continue;
      if (e.text && e.textRect) { const v = clipTo(byI, e, inkBox(e)); if (v) rs.push(v); }
      if (e.painted || e.media) { const v = clipTo(byI, e, drawnRect(e)); if (v) rs.push(v); }
    }
    const U = unionOf(rs);
    // 009 直式舞台縮放的段：內容區＝舞台窗的上下（y 130–880），其他照 R4.1 的 120–870
    const [CT, CB] = ctx.contentY || [CONTENT_TOP, CONTENT_BOTTOM];
    if (U) {
      const up = U[1] - CT, down = CB - U[3], diff = up - down;
      // 全螢幕的內容設計動畫：已經撐滿上下（畫布允許 y 40–900，角標左邊可以用到頂）就不算不平衡
      const filled = ctx.item.wide && ctx.item.seg?.design && U[3] - U[1] >= FULL.tall && U[1] >= FULL.top - 1 && U[3] <= FULL.y[1] + 1;
      if (!filled && Math.abs(diff) > VBAL_MAX + 1e-6) {
        const k = Math.abs(Math.round((down - up) / 2)), dir = diff < 0 ? 1 : -1, each = Math.round((up + down) / 2);
        // 032 B8：印移完的目標（內容 y 幾到幾、上下留白各幾 px），照抄就能改；內容設計動畫的畫布有舞台容器，放進去就自動置中
        const goal = each >= 0 ? `上下留白各 ${each}px` : `上下各超出 ${-each}px（內容比內容區高，先縮小再置中）`;
        const stage = ctx.item.seg?.design ? `；畫布有 #xd${ctx.item.id}-stage 舞台的，內容放進舞台就自動上下置中` : '';
        push('warn', 'vbalance', null, `垂直不平衡：內容 y ${ri(U[1])}–${ri(U[3])}，上留白 ${ri(up)}px、下留白 ${ri(down)}px（內容區 y ${CT}–${CB}，差 ${ri(Math.abs(diff))}px，超過 ${VBAL_MAX}px）`,
          `整組往${diff < 0 ? '下' : '上'}移 ${k}px（每個頂層元素的 top 都 ${diff < 0 ? '+' : '−'}${k}）→ 移完內容在 y ${ri(U[1] + dir * k)}–${ri(U[3] + dir * k)}，${goal}${stage}`, { up: r1(up), down: r1(down), move: dir * k, target: each });
      }
    }
    // ⚠ 全螢幕的內容設計動畫：沒有講者，畫面可以用滿，還擠在一邊或太小就是沒用到（舊習慣是左邊 1180、右邊留給小視窗）
    if (U && ctx.kind === 'done' && ctx.item.wide && ctx.item.seg?.design) {
      const w = U[2] - U[0], off = (U[0] + U[2]) / 2 - FULL.cx;
      if (Math.abs(off) > FULL.off) push('warn', 'full-side', null, `內容偏${off < 0 ? '左' : '右'}：這段沒有講者，畫面可以用到 x ${FULL.x[0]}–${FULL.x[1]}，內容在 x ${ri(U[0])}–${ri(U[2])}，${off < 0 ? '右' : '左'}邊空著`,
        '把內容拉開或放大，撐滿整個寬度；不用留小視窗的位置', { box: U });
      else if (w < FULL.minW) push('warn', 'full-small', null, `內容太小：這段沒有講者，畫面可以用到 x ${FULL.x[0]}–${FULL.x[1]}，內容只佔 ${ri(w)}px 寬`,
        `主角放大或多放一點對照，內容寬度至少 ${FULL.minW}px`, { box: U });
    }
    // ⚠ 內容設計動畫：畫面太空、主角太小（觀眾多半用手機看；直式舞台縮放的段不量）
    if (ctx.kind === 'done' && ctx.item.seg?.design && !ctx.contentY) {
      const Z = ctx.item.wide ? [FULL.x[0], FULL.y[0], FULL.x[1], FULL.y[1]] : DESIGN.PIP;
      const ils = els.filter((e) => shown(e) && e.il);
      const boxes = [...rs, ...ils.map((e) => e.shapeRect || e.rect)];
      const C = DESIGN.CELL, nx = Math.ceil((Z[2] - Z[0]) / C), ny = Math.ceil((Z[3] - Z[1]) / C);
      const hit = new Uint8Array(nx * ny);
      for (const r of boxes) {
        const x0 = Math.max(0, Math.floor((r[0] - Z[0]) / C)), x1 = Math.min(nx, Math.ceil((r[2] - Z[0]) / C));
        const y0 = Math.max(0, Math.floor((r[1] - Z[1]) / C)), y1 = Math.min(ny, Math.ceil((r[3] - Z[1]) / C));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hit[y * nx + x] = 1;
      }
      const k = hit.reduce((a, v) => a + v, 0) / Math.max(1, nx * ny);
      const hero = Math.max(0, ...ils.map((e) => Math.max(e.rect[2] - e.rect[0], e.rect[3] - e.rect[1])));
      if (boxes.length && k < DESIGN.FILL_MIN) push('warn', 'design-sparse', null, `畫面太空：完成態的內容只蓋到主內容區（x ${Z[0]}–${Z[2]}、y ${Z[1]}–${Z[3]}）的 ${Math.round(k * 100)}%（< ${DESIGN.FILL_MIN * 100}%）`,
        '主角放大到長邊 300–480px、配角 ≥ 180px、標籤字 36–44px，位置跟著拉開；不要多加東西湊滿（design.md「大小」）', { fill: Math.round(k * 1000) / 1000 });
      else if (ils.length && hero < DESIGN.HERO) push('warn', 'design-hero', null, `主角太小：最大的插圖長邊只有 ${ri(hero)}px（< ${DESIGN.HERO}px）`,
        '這一段在講的那個物件放大到長邊 300–480px（寬高照比例一起改），其他元件的位置跟著讓開（design.md「大小」）', { hero: ri(hero) });
    }
  }
  return out;
}

// ====================== 003：custom 的節奏規則 ======================

const boxOverlap = (a, b) => {
  if (!a || !b) return 0;
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]), h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1, Math.min(a[2] * a[3], b[2] * b[3]));
};
// 新元素：進場、不是亮框、不是同位置換內容、不是跟著祖先 0.3 秒內一起出現；
// v2：同一個 P.* 呼叫（stagger 群組、逐字）只算最早那一個（design-system.md §13），微動（role micro）不算
export const isMicro = (tw) => tw && tw.role === 'micro';
// 完成態停留、最後一幕只看進場與焦點補間（design-system.md §13）：強調（漣漪、光澤、重拍、螢光筆）也不算
const holdTweens = (motion) => ((motion && motion.tweens) || []).filter((tw) => !isMicro(tw) && tw.role !== 'accent');
export function motionUnits(motion) {
  const tws = ((motion && motion.tweens) || []).filter((tw) => !tw.role || tw.role === 'enter');   // 焦點、強調、微動不是新元素
  const enters = [], exits = [];
  for (const tw of tws) for (const tg of tw.targets) {
    if (tw.kind === 'enter' && !tg.emph) enters.push({ t: tw.start, tg, call: tw.call || null });
    if (tw.kind === 'exit') exits.push({ t: tw.start, tg });
  }
  const swapped = (u) => exits.some((x) => x.tg.key !== u.tg.key && x.tg.parentKey === u.tg.parentKey && Math.abs(x.t - u.t) <= SWAP_WIN + 1e-6 && boxOverlap(x.tg.box, u.tg.box) >= 0.5);
  const kept = [];
  for (const u of enters.filter((x) => !swapped(x)).sort((a, b) => a.t - b.t)) {
    if (kept.some((k) => (u.tg.chain || []).includes(k.tg.key) && u.t - k.t >= -1e-6 && u.t - k.t <= MERGE_WIN + 1e-6)) continue;
    if (kept.some((k) => k.tg.key === u.tg.key && Math.abs(k.t - u.t) < 1e-6)) continue;
    if (u.call && kept.some((k) => k.call === u.call)) continue;
    kept.push(u);
  }
  return kept;
}
// 忙碌段：微動（idle／flow／慢推，role micro）整段都在跑，不算（完成態停留、最後一幕、畫面沒有變化、靜止取樣都用這個）
export function busySpans(motion, { hold = false } = {}) {
  const spans = (hold ? holdTweens(motion) : ((motion && motion.tweens) || []).filter((tw) => !isMicro(tw))).map((tw) => [tw.start, tw.end]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of spans) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + BUSY_GAP) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

// ctx＝{ item, fadeOut }；回傳 { findings, notes }，時間一律換成完成影片秒數（item.start ＋ 段內秒數）
export function judgeMotion(motion, ctx) {
  const findings = [], notes = [];
  const it = ctx.item;
  if (!it || it.type !== 'custom') return { findings, notes };
  if (!motion) { notes.push(`${it.id}：讀不到 window.__timelines['${it.compId || '?'}']，節奏不檢查`); return { findings, notes }; }
  const at = (t) => r3(it.start + t);
  const base = { id: it.id, label: it.label, kind: 'motion' };
  const push = (rule, el, t, msg, fix, data = {}) => findings.push({ ...base, level: 'warn', rule, el, t: at(t), msg, fix, data });
  const units = motionUnits(motion);
  // 段長以 plan.json 為準：動作排到段尾之後時 timeline 會變長，用它量就會量到段外的畫面
  const D = it.D || Number(motion.D) || 0;

  // 同一秒新元素太多：只報最擠的那一窗
  let worst = null;
  for (const u of units) {
    const win = units.filter((v) => v.t >= u.t - 1e-6 && v.t < u.t + DENSITY_WIN - 1e-6);
    if (win.length > DENSITY_MAX && (!worst || win.length > worst.length)) worst = win;
  }
  if (worst) {
    push('density', worst[0].tg.desc, worst[0].t, `同一秒新元素太多：${fmtT(at(worst[0].t))}–${fmtT(at(worst[0].t + DENSITY_WIN))} 出現 ${worst.length} 個（${worst.map((u) => descText(u.tg.desc)).join('、')}；上限 ${DENSITY_MAX} 個）`,
      '錯開到每 0.5 秒 1 個（stagger: 0.5），或各自綁到講到它的那句（P.at）；同一張卡裡的東西跟著卡一起出現就好，不用各自進場', { n: worst.length });
  }
  // 間隔太短
  for (let k = 1; k < units.length; k++) {
    const d = units[k].t - units[k - 1].t;
    if (d > 0.001 && d < STAGGER_MIN - 1e-6) {
      push('stagger', units[k].tg.desc, units[k].t, `間隔太短：${descText(units[k - 1].tg.desc)} 和 ${descText(units[k].tg.desc)} 只差 ${d.toFixed(2)}s 出現（< ${STAGGER_MIN}s）`,
        '沒有句子可綁時逐條錯開 ≥ 0.15s，或用同一個時間一起出現；最好各自綁講到它的那句（P.at）', { d: r3(d) });
    }
  }
  const busy = busySpans(motion, { hold: true });
  // 完成態停太短：兩個綁句點之間最長的靜止
  const seen = new Set();
  const marks = (motion.marks || []).filter((m) => m.t > 1e-6 && m.t < D - 1e-6 && !seen.has(m.t) && seen.add(m.t)).sort((a, b) => a.t - b.t);
  if (!marks.length) notes.push(`${it.id}：沒有 P.at 綁句，完成態停留不檢查（照 R7.3 用 P.at 綁句才會檢查）`);
  for (let i = 0; i + 1 < marks.length; i++) {
    const a = marks[i].t, b = marks[i + 1].t;
    // 窗 [a, b) 裡忙碌段以外最長的一段（忙碌段先裁到窗內；拍前就開始的動作算到它結束為止）
    let q = 0, cur = a;
    for (const x of busy) {
      if (x[1] <= a || x[0] >= b) continue;
      q = Math.max(q, Math.max(a, x[0]) - cur);
      cur = Math.max(cur, Math.min(b, x[1]));
    }
    q = Math.max(q, b - cur);
    if (q < HOLD_MIN - 1e-6) {
      const ref = (m) => (typeof m.ref === 'number' ? String(m.ref) : `'${m.ref}'`);
      push('hold', null, a, `完成態停太短：P.at(${ref(marks[i])})（${fmtT(at(a))}）這一拍到下一拍 P.at(${ref(marks[i + 1])})（${fmtT(at(b))}）之間，畫面最長只靜止 ${Math.max(0, q).toFixed(2)}s（新資訊要停 ≥ ${HOLD_MIN}s）`,
        '下一拍綁晚一點的句子，或把這一拍的動作提早、縮短；只是同一件事的中間步驟就不要另外綁句，用「上一拍 + 秒數」接（中間步驟可以只停 0.6s）', { q: r3(Math.max(0, q)) });
    }
  }
  // 拍在段尾之後（✖）：P.at 落在淡出（沒有淡出就是段尾）之後，播出時看不到
  const fade0 = D - (ctx.fadeOut ? 0.5 : 0), lateSeen = new Set();
  for (const m of motion.marks || []) {
    if (m.t < fade0 - 1e-6 || lateSeen.has(`${m.ref}|${m.t}`)) continue;
    lateSeen.add(`${m.ref}|${m.t}`);
    const ref = typeof m.ref === 'number' ? String(m.ref) : `'${m.ref}'`;
    findings.push({ ...base, level: 'error', rule: 'late', el: null, t: at(m.t),
      msg: `拍在段尾之後，看不到：P.at(${ref}) 在 ${fmtT(at(m.t))}，這段 ${fmtT(at(fade0))} 就開始${ctx.fadeOut ? '淡出' : '結束'}`,
      fix: '這一拍改綁這段裡講到的詞，或刪掉這一拍（分鏡表一起改）；那個詞真的在段尾之後才講，回報主代理決定延長這段的 to 還是把這一拍移到下一段',
      data: { ref: m.ref, t: r3(m.t) } });
  }
  // 最後一幕太短
  let end0 = fade0, how = ctx.fadeOut ? '淡出' : '結束';
  const closing = holdTweens(motion).filter((tw) => tw.kind === 'exit' && tw.end >= end0 - BUSY_GAP);
  if (closing.length) { end0 = Math.min(...closing.map((tw) => tw.start)); how = '退場'; }
  const before = holdTweens(motion).filter((tw) => tw.start < end0 - 1e-6);
  if (before.length) {
    const last = Math.max(...before.map((tw) => Math.min(tw.end, end0)));
    const q = end0 - last;
    if (q < TAIL_MIN - 1e-6) {
      const need = r3(TAIL_MIN - q).toFixed(2);
      push('tail', null, last, `最後一幕太短：最後一個動作在 ${fmtT(at(last))} 結束，${fmtT(at(end0))} 就開始${how}，只停 ${q.toFixed(2)}s（< ${TAIL_MIN}s）`,
        `plan.json 這段的 to 往後延 ≥ ${need}s，或把最後一拍提早 ${need}s`, { q: r3(q) });
    }
  }
  return { findings, notes };
}

// 靜止取樣：忙碌段之間 ≥ 0.4 秒的空檔取中點（0 到第一個動作、最後一個動作到完成態也算），最多 8 個（取最長的），和中點／完成態差 < 0.1 秒的不重複
export function stillTimes(motion, item) {
  if (!motion || !item) return [];
  const D = item.D || Number(motion.D) || (item.end - item.start);
  const stop = D - DONE_BEFORE;
  const busy = busySpans(motion);
  const gaps = [];
  let cur = 0;
  for (const [s, e] of busy) { if (s - cur >= STILL_MIN) gaps.push([cur, s]); cur = Math.max(cur, e); }
  if (stop - cur >= STILL_MIN) gaps.push([cur, stop]);
  const fixed = sampleTimes(item).map((x) => x.t);
  return gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, STILL_MAX)
    .map(([a, b]) => r3(item.start + (a + b) / 2))
    .filter((t) => !fixed.some((f) => Math.abs(f - t) < 0.1))
    .sort((a, b) => a - b).map((t) => ({ t, kind: 'still' }));
}

// ====================== 003 P2：畫面沒有變化（講解在講、畫面不動） ======================

export const STATIC_MAX = 6, STATIC_CUE_MIN = 0.3;   // 連續 > 6s 沒有任何補間；字幕句和這段重疊 ≥ 0.3s 才算「在講」
// 忙碌段（任何補間：進場、點亮、焦點切換、描線、數字變化、位移）以外 > STATIC_MAX 秒的空檔（0 到第一個動作、最後一個動作到結束或淡出也算），
// 那段時間有字幕句在講 → 一個空檔一則 ⚠；建議綁的句子＝空檔裡開頭、離空檔中點最近的那句（沒有就取重疊的句子裡離中點最近的）
export function staticFindings(motion, { item, cuesOut = [] } = {}) {
  const out = [];
  if (!motion || !item || item.type !== 'custom') return out;
  const D = item.D || Number(motion.D) || (item.end - item.start);
  const stop = D - (item.fadeOut ? 0.5 : 0);
  const gaps = [];
  let cur = 0;
  for (const [s, e] of busySpans(motion)) { if (s - cur > STATIC_MAX + 1e-6) gaps.push([cur, s]); cur = Math.max(cur, e); }
  if (stop - cur > STATIC_MAX + 1e-6) gaps.push([cur, stop]);
  for (const [a, b] of gaps) {
    const A = item.start + a, B = item.start + b;
    const cs = cuesOut.filter((c) => Math.min(c.end, B) - Math.max(c.start, A) >= STATIC_CUE_MIN).sort((x, y) => x.n - y.n);
    if (!cs.length) continue;
    const mid = (A + B) / 2, inside = cs.filter((c) => c.start >= A);
    const pick = (inside.length ? inside : cs).reduce((p, c) => (Math.abs(c.start - mid) < Math.abs(p.start - mid) ? c : p));
    const span = cs.length > 1 ? `#${cs[0].n}–#${cs[cs.length - 1].n}` : `#${cs[0].n}`;
    out.push({ id: item.id, label: item.label, level: 'warn', rule: 'static', el: null, t: r3(A), kind: 'motion',
      msg: `畫面沒有變化：${item.id} 在 ${fmtT(A)}–${fmtT(B)} 畫面 ${(b - a).toFixed(1)}s 沒有變化（講解 ${span} 在講；上限 ${STATIC_MAX}s）`,
      fix: `補一拍綁 P.at('#${pick.n}@詞')（詞換成 #${pick.n} 講到的站名、項目、數字，讓那一刻有東西出現、亮起或換數字），或在 #${pick.n} 拆成兩段`,
      data: { from: r3(A), to: r3(B), q: r3(b - a), cues: cs.map((c) => c.n), pick: pick.n } });
  }
  return out;
}

// ====================== 003 r2：綁句對不上（F4 文字對時） ======================

export const CUE_WIN = 0.35, SAY_MIN = 2, SAY_MAX = 12;   // 拍點後 0.35s 內出現的字；2–12 字才比（更長的是整張卡、提示詞，不是站名）
const normSay = (s) => String(s).replace(/\*\*/g, '').replace(/[\s\p{P}\p{S}]/gu, '');
const subsOf = (t, L) => { const a = [...t], out = []; for (let i = 0; i + L <= a.length; i++) out.push(a.slice(i, i + L).join('')); return out; };
// 比對單位：數字、英文整個詞比（「一年翻 100 倍」的 100 不會比到字幕的 200；AI 不會比到 AIR），中文（漢字、假名）取連續 2–4 字；
// 數字去千分位逗號、至少 2 位，英文不分大小寫、至少 2 個字母
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu;
const tokensOf = (s) => {
  const t = String(s).replace(/\*\*/g, ''), raw = new Map();
  const keep = (k, r) => { if (k.length >= 2 && !raw.has(k)) raw.set(k, r); };
  for (const m of t.matchAll(/\d[\d,.]*\d|\d/g)) keep(m[0].replace(/,/g, ''), m[0]);
  for (const m of t.matchAll(/[A-Za-z][A-Za-z0-9+#]*/g)) keep(m[0].toLowerCase(), m[0]);
  return { raw, cjk: (t.match(CJK) || []).join('|') };
};
const hasPiece = (tok, x) => (/^[\da-z]/.test(x) ? tok.raw.has(x) : tok.cjk.includes(x));
// 一段字 → 由強到弱三層：[數字＋英文＋4 字中文, 3 字中文, 2 字中文]
const piecesOf = (s) => {
  const tok = tokensOf(s), runs = tok.cjk ? tok.cjk.split('|') : [];
  const cjk = (L) => [...new Set(runs.flatMap((r) => subsOf(r, L)))];
  return [[...tok.raw.keys(), ...cjk(4)], cjk(3), cjk(2)];
};

// custom 檔的 const X = P.at('<ref>'…) → { ref: 'X' }（訊息裡寫「T2 改 …」用）
export function atNames(html) {
  const out = {};
  for (const m of String(html).matchAll(/\b([A-Z][A-Z0-9_]*)\s*=\s*P\.at\(\s*(['"])([^'"\n]+)\2/g)) if (!(m[3] in out)) out[m[3]] = m[1];
  return out;
}

// ---------- 字級比範例小 ----------
// 撐破容器時縮字級繞過去最常見；規則是縮文案或加寬容器，不縮字級（auto-edit-motion 退路表）
// 元素對回範例：id 或第一個非 sc- 的 class 去掉前綴（xtl-c1 → c1、xtla-lab → lab；改名四處會換前綴）；字級看 sc-tNN、style 的 font-size、<style> 裡最後一個選擇器的 font-size
export function fontSizes(html) {
  const out = new Map();
  const put = (own, px) => {
    if (!own || !own.includes('-') || !(px > 0)) return;
    const key = own.replace(/^[^-]+-/, '');
    if (!out.has(key) || px < out.get(key).px) out.set(key, { px, own });
  };
  const body = String(html).replace(/<!--[\s\S]*?-->/g, '');
  for (const m of body.matchAll(/<[a-zA-Z][\w-]*\b([^<>]*)>/g)) {
    const a = m[1];
    const cls = ((a.match(/\bclass\s*=\s*"([^"]*)"/) || [])[1] || '').split(/\s+/).filter(Boolean);
    const px = [...cls.map((c) => (c.match(/^sc-t(\d+)$/) || [])[1]), (a.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/) || [])[1]].filter(Boolean).map(Number);
    if (px.length) put((a.match(/\bid\s*=\s*"([^"]+)"/) || [])[1] || cls.find((c) => !/^sc-/.test(c)), Math.min(...px));
  }
  for (const st of body.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const r of st[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const fs = r[2].match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/);
      if (!fs) continue;
      for (const sel of r[1].split(',')) {
        const last = (sel.trim().split(/[\s>+~]+/).pop() || '').match(/[#.]([\w-]+)(?![\s\S]*[#.][\w-])/);
        if (last && !/^sc-/.test(last[1])) put(last[1], Number(fs[1]));
      }
    }
  }
  return out;
}
export function fontShrinkFindings({ item, html = '', tpl = '', file = '' } = {}) {
  const out = [];
  if (!item || item.type !== 'custom' || !tpl) return out;
  const a = fontSizes(html), b = fontSizes(tpl);
  for (const [key, x] of a) {
    const y = b.get(key);
    if (!y || x.px >= y.px) continue;
    out.push({ id: item.id, label: item.label, kind: 'motion', el: null, level: 'warn', rule: 'font-shrink', t: null,
      msg: `字級比範例小：${file || item.label} 的 ${x.own} 是 ${x.px}px，範例是 ${y.px}px`,
      fix: '字級改回範例；字放不下就縮短文案（只留關鍵詞）或加寬容器，不要縮字級', data: { key, px: x.px, tpl: y.px } });
  }
  return out;
}

// ---------- P.* 的選擇器不能從最外層 id 開始 ----------
// HyperFrames 0.9 把子合成插進完成影片時，最外層那個 <div id="x-…" data-composition-id> 的 id 會被拿掉（換成宿主 el-<段>）。
// CSS、動畫檔自己的 document.querySelector*、GSAP 字串都會被 HyperFrames 換到宿主，照樣找得到（舊原語 P.in／P.stroke… 走 GSAP，也找得到，
// 而且留著 #<最外層 id> 才不會選到同一支範例在另一段的元素）；
// v2 原語用 root.querySelectorAll 直接查（KIT_ROOT_QUERY）→ '#x-rack .card' 找不到：pop／dim 這類靜靜沒有動畫，
// rack／spot 這類會丟錯、整段動畫消失（2026-11-09 在 snapshot 實測）。只擋這幾個，改法是拿掉開頭的 #<最外層 id>（root 底下查，不會跨段）
export const KIT_ROOT_QUERY = new Set(['chars', 'marker', 'strike', 'stamp', 'punch', 'ripple', 'comet', 'draw', 'along', 'fly', 'tape', 'hinge', 'wave', 'spin', 'flow', 'idle', 'spot', 'cam', 'grow', 'sheen', 'wipe', 'wipeOut', 'slide', 'slideOut', 'dim', 'rack', 'pop', 'stick', 'peel']);
export function rootSelectorFindings({ item, html = '', file = '' } = {}) {
  const out = [];
  if (!item || !html) return out;
  const roots = [...String(html).matchAll(/<[a-z][^>]*\bid="([^"]+)"[^>]*\bdata-composition-id=|<[a-z][^>]*\bdata-composition-id="[^"]*"[^>]*\bid="([^"]+)"/g)].map((m) => m[1] || m[2]);
  if (!roots.length) return out;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bad = new RegExp(`(?:^|,)\\s*#(${roots.map(esc).join('|')})(?=[\\s>+~.:\\[])`);
  const seen = new Set();
  for (const sc of String(html).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const code = sc[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
    const consts = {};
    for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`\n]*)\2/g)) consts[m[1]] = m[3];
    for (const m of code.matchAll(/\bP\.([A-Za-z]+)\(([^;\n]*)/g)) {
      if (!KIT_ROOT_QUERY.has(m[1])) continue;
      const strs = [...m[2].matchAll(/(['"`])([^'"`\n]*)\1/g)].map((x) => x[2]);
      for (const id of m[2].match(/\b[A-Za-z_$][\w$]*\b/g) || []) if (id in consts) strs.push(consts[id]);
      const hit = strs.find((x) => bad.test(x));
      if (!hit) continue;
      const root = hit.match(bad)[1], key = `${m[1]}|${hit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fixed = hit.split(',').map((x) => x.trim().replace(new RegExp(`^#${esc(root)}\\s*>?\\s*`), '')).join(', ');
      out.push({ id: item.id, label: item.label, kind: 'motion', el: null, level: 'error', rule: 'root-selector', t: null,
        msg: `${file || item.label} 的 P.${m[1]} 選擇器 '${hit}' 從最外層的 #${root} 開始：完成影片裡最外層的 id 會被拿掉，P.* 找不到元素（沒有動畫；P.rack、P.spot 會讓整段動畫消失）`,
        fix: `拿掉開頭的 #${root}，寫 '${fixed}'（P.${m[1]} 只在這支動畫裡面找，不會選到別段）或元素自己的 id`, data: { method: m[1], selector: hit, root } });
    }
  }
  return out;
}

// ---------- 範例檔頭【D 下限】 ----------
// 「T1 ≥ 3.1」「T2 ≥ T1 + 3.0」「D ≥ T4 + 5.2」→ [{ lhs, rhs, k }]（括號裡的說明、「3 點時改看 …」都不算）
// 最後一拍到段尾：檔頭多半寫 5.2（講完 2.6 秒回均衡…）。P.end 的 settleTail 段太短時會把回均衡往前挪（講完 1 秒＋0.6 秒＋最後一幕 1.5 秒＋淡出 0.75 秒），
// 所以真正的下限是這個數字；寫太大，寫草稿的人會以為模板放不下，全部退回字卡
export const FLOOR_TAIL = 3.9;
export function floorRules(html) {
  const sec = String(html).match(/【D 下限】([\s\S]*?)(?=【|-->)/);
  if (!sec) return [];
  let s = sec[1];
  for (let k = 0; k < 3; k++) s = s.replace(/（[^（）]*）|\([^()]*\)/g, '');
  return [...s.matchAll(/\b([A-Z][A-Z0-9]*)\s*≥\s*(?:([A-Z][A-Z0-9]*)\s*[+＋]\s*)?(\d+(?:\.\d+)?)/g)].map((m) => ({ lhs: m[1], rhs: m[2] || null, k: m[1] === 'D' && m[2] ? Math.min(Number(m[3]), FLOOR_TAIL) : Number(m[3]) }));
}

// script 裡的 const X = P.at('<ref>'[, off])／P.at(<秒>[, off]) → { X: { ref, off } }（只看 <script>，註解不算；檔頭說明裡寫的「<script>」不是 script）
export function atConsts(html) {
  const out = {};
  for (const sc of String(html).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const code = sc[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
    for (const m of code.matchAll(/\b([A-Z][A-Z0-9_]*)\s*=\s*P\.at\(\s*(?:(['"])([^'"\n]+)\2|(\d+(?:\.\d+)?))\s*(?:,\s*([-+]?\d+(?:\.\d+)?)\s*)?\)/g)) {
      if (!(m[1] in out)) out[m[1]] = { ref: m[3] != null ? m[3] : Number(m[4]), off: m[5] ? Number(m[5]) : 0 };
    }
  }
  return out;
}

// 【D 下限】只驗兩種：拍點常數的秒數照 P.at 的算法（cuesOut＝build --check 的完成影片秒數字幕），D＝plan.json 這段的長度
//   第一拍（「T1 ≥ 3.1」）不夠 ✖：開場的主卡、骨架還沒做完，站就先出來（其他規則都量不到開場）
//   段長（「D ≥ T4 + 5.2」）不夠 ⚠：回均衡這類排在最後一拍之後的動作會落到段外（最後一幕太短只量段內）
//   拍距（「T2 ≥ T1 + 3.0」）不驗：完成態停太短量的是實際的靜止時間，比檔頭的算式準
//   用到的名字有一個不是 P.at（3 點版刪掉的 T4、沒用的 ALL）那條就不驗；換了開場，檔頭那一行要改成新的下限
export const FLOOR_TOL = 0.05;
export const FLOOR_SOFT = 0.3;   // 第一拍只差這麼一點：開場和第一拍重疊看不出來，⚠ 就好（--check 也是差 > 0.3 才報）
export function floorFindings({ item, html = '', cuesOut = [], file = '', tpl = '' } = {}) {
  const out = [];
  if (!item || item.type !== 'custom') return out;
  const rules = floorRules(html);
  // 檔頭下限被改小或刪掉（和範例原檔比；只比 audit 會驗的開場、段長兩種）：可能真的壓短了開場，也可能只改數字讓檢查不報，要讓主代理看得到
  if (tpl) {
    const kinds = (rs) => ({ open: rs.find((r) => !r.rhs && r.lhs !== 'D') || null, end: rs.filter((r) => r.lhs === 'D' && r.rhs).sort((x, y) => x.k - y.k)[0] || null });
    const a = kinds(rules), b = kinds(floorRules(tpl));
    const txt = (r) => `${r.lhs} ≥ ${r.rhs ? `${r.rhs} + ` : ''}${r.k}`;
    for (const [what, x, y] of [['開場', a.open, b.open], ['段長', a.end, b.end]]) {
      if (!y || (x && x.k >= y.k - 1e-6)) continue;
      out.push({ id: item.id, label: item.label, kind: 'motion', el: null, level: 'warn', rule: 'floor-edited', t: null,
        msg: `檔頭【D 下限】的${what}下限改過：範例是「${txt(y)}」，${file || item.label} ${x ? `改成「${txt(x)}」` : '刪掉了'}`,
        fix: '回報寫明改了什麼、開場或收尾怎麼跟著壓短（主代理看截圖確認）；動畫沒跟著改，就把檔頭改回範例的數字', data: { what, tpl: txt(y), now: x ? txt(x) : null } });
    }
  }
  if (!rules.length) return out;
  const consts = atConsts(html), T = { D: item.D || (item.end - item.start) };
  for (const [name, { ref, off }] of Object.entries(consts)) {
    let t;
    if (typeof ref === 'number') t = ref + off;
    else {
      const p = parseTime(ref);
      if (p.error || p.kind !== 'cue') continue;
      const r = cueSeconds(p, cuesOut);
      if (r.error) continue;
      t = r.sec + off - item.start;
    }
    T[name] = Math.max(0, r3(t));
  }
  const lit = (n) => { const c = consts[n]; return `P.at(${typeof c.ref === 'number' ? c.ref : `'${c.ref}'`}${c.off ? `, ${c.off}` : ''})`; };
  const name = file || item.label;
  const base = { id: item.id, label: item.label, kind: 'motion', el: null };
  for (const r of rules) {
    const a = T[r.lhs], b = r.rhs ? T[r.rhs] : 0;
    if (a == null || b == null || r.lhs === r.rhs || (r.rhs && r.lhs !== 'D')) continue;
    const need = r3(b + r.k), short = r3(need - a);
    if (short <= FLOOR_TOL) continue;
    const rule = `${r.lhs} ≥ ${r.rhs ? `${r.rhs} + ` : ''}${r.k}`, data = { rule, need, got: a, short };
    if (r.lhs === 'D') {
      out.push({ ...base, level: 'warn', rule: 'floor', t: r3(item.start + b),
        msg: `段尾不夠：這段長 ${a.toFixed(2)}s，${name} 檔頭【D 下限】要 ${rule}＝${need.toFixed(2)}s（${r.rhs} 在 ${fmtT(item.start + b)}）`,
        fix: `${r.rhs} 改綁早一點的詞，或刪掉最後一拍（分鏡表一起改）；都不行就回報，請主代理把 plan.json 這段的 to 往後延 ≥ ${short.toFixed(2)}s`, data });
    } else if (!r.rhs) {
      out.push({ ...base, level: short <= FLOOR_SOFT ? 'warn' : 'error', rule: 'floor', t: r3(item.start + a),
        msg: `開場還沒做完第一拍就到了：${r.lhs} = ${lit(r.lhs)} 在段內 ${a.toFixed(2)}s（${fmtT(item.start + a)}），${name} 檔頭【D 下限】要 ${rule}（差 ${short.toFixed(2)}s）`,
        fix: `把開場（script 裡 ${r.lhs} 之前、寫固定秒數的那幾行）壓到 ${r.lhs} 之前做完，再把檔頭這一行改成新的下限；${short <= 0.5 ? `也可以給 ${r.lhs} 加第二個參數晚 ${short.toFixed(2)}s（還在講到後 0.5s 內）；` : ''}都不行就回報，請主代理把這段的 from 提早 ${short.toFixed(2)}s`, data });
    }
  }
  return out;
}

// motion（collectMotionInPage）＋ cuesOut（build --check 的完成影片秒數字幕，有 text）→ ⚠ cue-text
// 每個 P.at('#N')／P.at('#N@詞') 拍點：拍點後 CUE_WIN 秒內從看不見變看得見的字（站名、項目；audit-page 的 up／say），數字與英文整個詞、中文取 2–4 字，
// 有一個字在第 N 句講到就過；都沒有、而這段的另一句 #M 有 → 一拍報一則「在 #M 才講到」（取句號離 N 最近的）；都找不到不報
export function cueTextFindings(motion, { item, cuesOut = [], names = {} } = {}) {
  const out = [];
  if (!motion || !item || item.type !== 'custom') return out;
  const segCues = cuesOut.filter((c) => c.end > item.start && c.start < item.end);
  const done = new Set();
  for (const mk of motion.marks || []) {
    const m = typeof mk.ref === 'string' && mk.ref.match(/^#(\d+)(?:@(.+))?$/);
    if (!m || done.has(`${mk.ref}|${mk.t}`)) continue;
    done.add(`${mk.ref}|${mk.t}`);
    const N = Number(m[1]);
    const cueN = cuesOut.find((c) => c.n === N);
    if (!cueN) continue;
    const tokN = tokensOf(cueN.text);
    // 這一拍出現的字（同一拍常常還有總覽剛好進場的別站：只要有一個字在第 N 句講到，這一拍就算對上）
    const cands = [];
    for (const tw of motion.tweens || []) {
      if (!tw.up || tw.start < mk.t - 0.05 || tw.start > mk.t + CUE_WIN) continue;
      for (const tg of tw.targets) {
        const raw = String(tg.say || '').trim(), T = normSay(raw), len = [...T].length;
        if (len >= SAY_MIN && len <= SAY_MAX && !cands.some((c) => c.T === T)) cands.push({ raw, T, len, tg, tiers: piecesOf(raw) });
      }
    }
    const inN = (c) => c.tiers.some((xs) => xs.some((x) => hasPiece(tokN, x)));
    if (!cands.length || cands.some(inN)) continue;
    let best = null;
    const others = segCues.filter((q) => q.n !== N).map((q) => ({ q, tok: tokensOf(q.text) }));
    for (const c of cands) {
      for (const xs of c.tiers) {
        let hit = null;
        for (const x of xs) {
          const cs = others.filter((o) => hasPiece(o.tok, x)).sort((a, b) => Math.abs(a.q.n - N) - Math.abs(b.q.n - N));
          if (cs.length && (!hit || Math.abs(cs[0].q.n - N) < Math.abs(hit.q.n - N))) hit = { q: cs[0].q, x: cs[0].tok.raw.get(x) || x };
        }
        if (hit) { if (!best || Math.abs(hit.q.n - N) < Math.abs(best.q.n - N)) best = { ...hit, c }; break; }
      }
    }
    if (!best) continue;
    const name = names[mk.ref];
    const t = r3(item.start + mk.t);
    out.push({ id: item.id, label: item.label, level: 'warn', rule: 'cue-text', el: best.c.tg.desc, t, kind: 'motion',
      msg: `綁句對不上：「${best.c.raw.slice(0, SAY_MAX)}」在 #${best.q.n} 才講到、不是 #${N}（${name ? `${name} = ` : ''}P.at('${mk.ref}')，${fmtT(t)} 出現；#${best.q.n}「${best.q.text.slice(0, 16)}」）`,
      fix: `${name ? `${name} 改` : '改成'} P.at('#${best.q.n}@${best.x}')（"@詞" 寫成字串字面值，改完重跑這條 audit，不用 build；字幕那句真的是別的意思就不用改）`,
      data: { ref: mk.ref, from: N, to: best.q.n, word: best.x } });
  }
  return out;
}

// window.__cueErrors（specs/contracts/cues.md §4.4）→ 綁句失敗 ✖；對不到段的 → warnings
export function cueFindings(errors, items) {
  const findings = [], warnings = [];
  const seen = new Set();
  for (const raw of errors || []) {
    const s = String(raw);
    if (seen.has(s)) continue;
    seen.add(s);
    const m = s.match(/^(\S+) (P\.(?:at|dur)\(.*?\))：(.*)$/);
    const it = m && (items || []).find((x) => x.type === 'custom' && (x.id === m[1] || x.compId === m[1]));
    if (!it) { warnings.push(`頁面 cue 錯誤：${s}`); continue; }
    const why = m[3].split(' → ')[0];   // 原因原文自帶的 → 改法拿掉，只留 audit 的 fix（一行一個改法）
    const fix = /^字幕沒有第/.test(why) ? '改成這段範圍內的句號（node shared/template/tools/build.mjs --project projects/<專案> --words <起>-<迄> 看每句的號碼），改完重跑這條 audit'
      : /^「@詞」/.test(why) ? "把 ref 寫成字串字面值 P.at('#N@詞')（不要用變數組字串），用 --words 確認那一句有這個詞，改完重跑這條 audit"
      : '重跑 node shared/template/tools/build.mjs --project projects/<專案>（子代理把這行交回主代理）；還是沒有就檢查 plan.json 這段的 src 是不是這支檔';
    findings.push({ id: it.id, label: it.label, level: 'error', rule: 'cue', el: null, at: [], t: null, kind: 'done',
      msg: `綁句失敗：${it.file || it.compId} 的 ${m[2]}：${why}`, fix, data: { call: m[2] } });
  }
  return { findings, warnings };
}

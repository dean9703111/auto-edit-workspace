// 011 示意動畫（x-scene，kit/illus.js 元件）的 audit 規則（specs/contracts/illus.md §4、§5；cli-003.md §2.3e）
//   ILLUS_BUILTIN                       kit/illus.js 的 20 個內建元件（dev/tests/audit.test.mjs 對 illus.js 的 COMP 逐項比）
//   illusOf(html)                       → { used: [data-illus 名], src: [data-illus-src 路徑], registered: [ILLUS.register 名] }
//   illusNameFindings({ item, html, file, local })  → ✖ 不認得的 data-illus（畫廊沒有、沒 register）、data-illus-src 不在 illus-local/
//   illusSrcOwners(text, items, htmlOf) → 頁面錯誤「[ILLUS] 讀不到 data-illus-src=…」是哪幾段（scriptErrors 用，升成那一段的 ✖）
//   judgeIllus(meas, ctx)               → 每個取樣時刻（只量有 .il 元件的段）：⚠ 標籤超過 10 字、⚠ 完成態插圖群太小、
//                                         ⚠ layout-row-align（段裡沒有 data-layout 時才量手排的元件；有就交給 audit-layout.mjs）
//   illusMotionFindings(motion, ctx)    → 時間軸：⚠ 同一個東西亮滅兩次以上（閃爍）、⚠ 連接線在元件還沒進場完就開始描
// 量版面時 .il>svg 的描邊外擴 2 px（illus.css 的 overflow: visible、描邊 4 px 一半在 viewBox 外）：audit-page.mjs 量 rect 時已加上 IL_STROKE
import { fmtT } from './audit-rules.mjs';

export const ILLUS_BUILTIN = ['phone', 'tripod', 'phoneTripod', 'laptop', 'monitor', 'cloud', 'personBust', 'personTop', 'desk', 'cone',
  'waveform', 'progress', 'energy', 'fileVideo', 'window', 'searchBar', 'badge', 'recPill', 'stopwatch', 'bookmark'];
export const IL_STROKE = 2;              // 描邊外擴（契約 §5.5）
export const LABEL_MAX = 10;             // 示意動畫的字只當標籤（ep2 hyperframes-overlay design-rules.md:9）
export const ALIGN_NEAR = [4, 16];       // 手排（不在 data-layout 裡）的兩個元件中線差 4–16 px ⚠ layout-row-align（012 併進版面規則；design-rules.md:87 同列同中線）
export const SMALL_MIN = 0.6;           // 插圖群外框 < 可用區（卡片內部扣掉標題列與內距）面積 60%：主角不是圖（2026-10-31 參考範例只佔一半，被嫌像字卡）。
                                        // 2026-11-04 主卡加高、情境動畫內距 72／64 後改用可用區：舊的「卡片內部 50%」等於要佔可用區 63%，加高後變 71%，逼插圖貼框
export const BLINK_MAX = 1;              // 同一個元素退場後再出現的次數上限（casebook.md:486 依序出現、不明滅閃爍）

const uniq = (a) => [...new Set(a)];
const codeOf = (html) => String(html || '').replace(/<!--[\s\S]*?-->/g, '');
export function illusOf(html) {
  const s = codeOf(html);
  const script = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  return {
    used: uniq([...s.matchAll(/\bdata-illus="([^"]+)"/g)].map((m) => m[1])),
    src: uniq([...s.matchAll(/\bdata-illus-src="([^"]+)"/g)].map((m) => m[1])),
    registered: uniq([...script.matchAll(/\bILLUS\.register\(\s*['"]([A-Za-z0-9]+)['"]/g)].map((m) => m[1])),
  };
}
export const localName = (src) => (String(src).match(/^illus-local\/([A-Za-z0-9]+)\.svg$/) || [])[1] || null;

// local＝work/hyperframes/illus-local/ 裡的 svg 檔名（不含 .svg）
export function illusNameFindings({ item, html, file = '', local = [] }) {
  const out = [];
  const { used, src, registered } = illusOf(html);
  const name = file || item.label;
  const base = { id: item.id, label: item.label, kind: 'illus', el: null, at: [], t: null };
  for (const n of used) {
    if (ILLUS_BUILTIN.includes(n) || registered.includes(n)) continue;
    out.push({ ...base, level: 'error', rule: 'illus-name', msg: `${name} 的 data-illus="${n}" 不是畫廊的元件，也沒有 ILLUS.register('${n}', …)（畫面上會是空的）`,
      fix: local.includes(n) ? `專案元件用 data-illus-src="illus-local/${n}.svg"，不是 data-illus` : `改成 shared/template/kit/illus-gallery.jpg 裡的元件名（大小寫照抄），或照 shared/template/kit/illus-style.md 畫成 work/hyperframes/illus-local/${n}.svg 再用 data-illus-src 掛`, data: { name: n } });
  }
  for (const s of src) {
    const n = localName(s);
    if (n && local.includes(n)) continue;
    out.push({ ...base, level: 'error', rule: 'illus-src', msg: `${name} 的 data-illus-src="${s}" ${n ? `在 work/hyperframes/illus-local/ 找不到 ${n}.svg` : '不是 illus-local/<名稱>.svg'}（畫面上會是空的）`,
      fix: n ? `照 shared/template/kit/illus-style.md 畫好存成 work/hyperframes/illus-local/${n}.svg（路徑相對主合成 index.html），或改用畫廊的元件 data-illus="…"` : '寫成 data-illus-src="illus-local/<名稱>.svg"（名稱小寫英文開頭、只用英數）', data: { src: s } });
  }
  return out;
}

// 頁面錯誤「[ILLUS] 讀不到 data-illus-src="X"」→ 用到 X 的段（htmlOf(item) 回那段 custom 檔原文）
export function illusSrcOwners(text, items, htmlOf) {
  const m = String(text).match(/\[ILLUS\][^"]*data-illus-src="([^"]+)"/);
  if (!m) return null;
  return { src: m[1], items: items.filter((it) => illusOf(htmlOf(it) || '').src.includes(m[1])) };
}

// 每個取樣時刻（judgeSample 之後；只量有 .il 元件的段）
export function judgeIllus(meas, ctx) {
  const out = [];
  if (!meas || meas.missingHost || !meas.illus || !ctx.item) return out;
  const base = { id: ctx.item.id, label: ctx.item.label, t: ctx.t, kind: ctx.kind };
  const push = (rule, el, msg, fix, data = {}) => out.push({ ...base, level: 'warn', rule, el, msg, fix, data });
  const els = (meas.els || []).filter((e) => !e.moving && (e.alpha ?? 1) >= 0.05);
  // ⚠ 字只當標籤：標題列以外的字 > 10 字（完整句子交給字幕）
  for (const e of els) {
    if (!e.text || e.title || !(e.chars > LABEL_MAX)) continue;
    push('illus-label', e.desc, `示意動畫的字太長：${e.desc.text || e.desc.id}…（${e.chars} 字，標籤 ≤ ${LABEL_MAX} 字）`, `縮成 ≤ ${LABEL_MAX} 字的關鍵詞，完整句子交給字幕；主角是圖`, { chars: e.chars });
  }
  // ⚠ layout-row-align（手排）：兩個元件（.il 的 svg）在同一列（上下範圍重疊）中線差 4–16 px，或同一欄差 4–16 px
  //   只看完成態（回均衡之後；拍中間的聚焦會把元件抬起 8–10 px）、不看正在漂浮的；段裡有 data-layout 容器時由 audit-layout.mjs 量
  const ils = ctx.kind === 'done' ? els.filter((e) => e.il && !e.micro) : [];
  const alignIls = ctx.hasLayout ? [] : ils;
  const mid = (r, k) => (r[k] + r[k + 2]) / 2;
  for (let a = 0; a < alignIls.length; a++) for (let b = a + 1; b < alignIls.length; b++) {
    const A = alignIls[a].rect, B = alignIls[b].rect;
    const rowOverlap = Math.min(A[3], B[3]) - Math.max(A[1], B[1]) > 0, colOverlap = Math.min(A[2], B[2]) - Math.max(A[0], B[0]) > 0;
    const dy = Math.abs(mid(A, 1) - mid(B, 1)), dx = Math.abs(mid(A, 0) - mid(B, 0));
    const near = (d) => d > ALIGN_NEAR[0] && d <= ALIGN_NEAR[1];
    const nm = (e) => e.desc.near || e.desc.id || '元件';
    if (rowOverlap && !colOverlap && near(dy)) push('layout-row-align', alignIls[b].desc, `同一列沒對齊：${nm(alignIls[a])} 和 ${nm(alignIls[b])} 的插圖中線差 ${dy.toFixed(1)}px`, '這幾個元件放進同一個 data-layout="row"，不要手寫 top（shared/style.md「版面」）', { dy });
    else if (colOverlap && !rowOverlap && near(dx)) push('layout-row-align', alignIls[b].desc, `同一欄沒對齊：${nm(alignIls[a])} 和 ${nm(alignIls[b])} 的插圖中線差 ${dx.toFixed(1)}px`, '這幾個元件放進同一個 data-layout="col"，不要手寫 left（shared/style.md「版面」）', { dx });
  }
  // ⚠ 插圖太小：完成態所有元件的外框聯集 < 可用區（最小的有底有框盒，扣掉標題列，再扣掉上下左右內距 --sc-pad-card／--sc-pad-card-y）面積的 SMALL_MIN
  const ilEls = ctx.kind === 'done' ? els.filter((e) => e.il) : [];   // 大小不受漂浮影響：漂浮中的元件也算（只有對齊才排除）
  // x-callout 的主體插圖（#xcall-obj；同一集用兩次時前綴會換，例 #xcsb-obj）四周是用引線接上的標籤（#xcall-t1…）：
  //   主角是「主體＋標籤」這一整組，標籤一起算
  const objOf = (e) => { const m = /^(xc[a-z]*)-obj$/.exec(e.desc?.id || e.desc?.near || ''); return m ? m[1] : null; };
  const pre = ilEls.map(objOf).find(Boolean);
  const tagRe = pre ? new RegExp('^' + pre + '-t\\d$') : null;
  const all = pre ? [...ilEls, ...els.filter((e) => !e.il && tagRe.test(e.desc?.id || ''))] : ilEls;
  if (all.length) {
    const U = [Math.min(...all.map((e) => e.rect[0])), Math.min(...all.map((e) => e.rect[1])), Math.max(...all.map((e) => e.rect[2])), Math.max(...all.map((e) => e.rect[3]))];
    const inside = (r, o) => r[0] <= o[0] + 1 && r[1] <= o[1] + 1 && r[2] >= o[2] - 1 && r[3] >= o[3] - 1;
    const area = (r) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
    const card = els.filter((e) => e.box && !e.il && !all.includes(e) && inside(e.rect, U)).sort((a, b) => area(a.rect) - area(b.rect))[0];
    if (card) {
      const titles = els.filter((e) => e.title && inside(card.rect, e.rect) && e.rect[3] <= U[1] + 1);
      const tt = titles.find((e) => e.titlePadY > 0), px = tt?.titlePadX > 0 ? tt.titlePadX : 48, py = tt?.titlePadY > 0 ? tt.titlePadY : 40;
      const top = Math.max(card.rect[1], ...titles.map((e) => e.rect[3]));
      const inner = [card.rect[0] + px, top + py, card.rect[2] - px, card.rect[3] - py];
      const k = area(U) / Math.max(1, area(inner));
      if (k < SMALL_MIN) push('illus-small', card.desc, `插圖太小：主角是圖，插圖群只佔可用區（卡片內部扣掉內距 ${px}／${py}）${Math.round(k * 100)}%（< ${SMALL_MIN * 100}%）`,
        '放大到內距以內撐開（情境動畫內容區左右留 72、上下留 64：1176×636 的內容區整組最多 1032×508，至少佔 60%；主角長邊 260–400px、標籤 28–32px），照 shared/style.md「示意動畫」', { ratio: Math.round(k * 1000) / 1000 });
    }
  }
  return out;
}

// 時間軸（collectMotionInPage 的 tweens；targets[].il＝目標是元件或包著元件、targets[].line＝元件與圖示以外的線）
export function illusMotionFindings(motion, { item } = {}) {
  const out = [];
  if (!motion || !item || !(motion.tweens || []).some((tw) => tw.targets.some((x) => x.il))) return out;
  const base = { id: item.id, label: item.label, kind: 'motion', el: null };
  const push = (rule, t, el, msg, fix, data = {}) => out.push({ ...base, level: 'warn', rule, t: Math.round((item.start + t) * 1000) / 1000, el, msg, fix, data });
  const tws = motion.tweens.filter((tw) => tw.role !== 'micro');
  // ⚠ 閃爍：同一個目標「出現 → 退場 → 再出現」超過 BLINK_MAX 次（狀態要依序換，不要亮滅來回）
  const life = new Map();
  for (const tw of [...tws].sort((a, b) => a.start - b.start)) {
    if ((tw.kind !== 'enter' && tw.kind !== 'exit') || tw.role === 'focus' || tw.role === 'accent') continue;   // 聚焦光、漣漪本來就會亮好幾次
    for (const x of tw.targets) {
      const L = life.get(x.key) || { on: false, back: 0, desc: x.desc, t: tw.start };
      if (tw.kind === 'exit' && L.on) L.on = false;
      else if (tw.kind === 'enter') { if (L.seen && !L.on) { L.back++; L.t = tw.start; } L.on = true; L.seen = true; }
      life.set(x.key, L);
    }
  }
  for (const L of life.values()) if (L.back > BLINK_MAX) push('illus-blink', L.t, L.desc, `${L.desc.id || L.desc.cls || '元素'} 亮滅 ${L.back + 1} 次（到 ${fmtT(item.start + L.t)}）`, '示意圖的狀態依序換（舊的退、新的進，一次一種），不要同一個東西閃好幾次；要強調用漣漪或重拍一次', { back: L.back });
  // ⚠ 先有節點再畫線：連接線開始描的時候，還有元件在進場
  const enters = tws.filter((tw) => tw.kind === 'enter' && tw.targets.some((x) => x.il));
  for (const tw of tws) {
    if (tw.kind !== 'draw' || !tw.targets.some((x) => x.line)) continue;
    const late = enters.find((e) => e.start < tw.start + 1e-3 && e.end > tw.start + 0.05);
    if (late) {
      const who = late.targets.find((x) => x.il);
      push('illus-line-first', tw.start, tw.targets[0].desc, `連接線 ${tw.targets[0].desc.id || tw.targets[0].desc.near || ''} 在 ${fmtT(item.start + tw.start)} 開始描，${who.desc.id || who.desc.near || '元件'} 還在進場（到 ${fmtT(item.start + late.end)}）`,
        `先讓兩端的元件進場完，線再從 ${fmtT(item.start + late.end)} 之後描（或把線綁到下一拍）`, { line: tw.start, node: late.end });
    }
  }
  return out;
}

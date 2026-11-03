// 012 版面系統的 audit 規則（specs/012-layout/brief.md §4；cli-003.md §2.3f）
//   輸入＝頁面裡 SceneLayout.measure(host) 的 JSON（kit/scene-layout.js）：每個 data-layout 容器的外框、slot（外框、錨點＝插圖、標籤）、
//   每條連接線的端點（data-links 產生的＋手寫的）。座標是版面座標（offset 鏈，不含 transform），所以聚焦放大、漂浮不會誤報；只量完成態。
//   data-layout="free" 只代表 helper 不排，六條照樣量（手排的檔也要過）。
//   走位（x-scene 的 move 用 P.morph 改 left/top）過的 slot 帶 home（排版時的外框）：等距、置中量 home；對齊、內距、標籤、連接線量完成態。
//   judgeLayoutRules(lay, { item, t }) → findings（訊息只指 shared/style.md「版面」）
export const ROW_WARN = 4, ROW_ERR = 16;        // layout-row-align：同列插圖中線 y 差 > 4 ⚠、> 16 ✖
export const GAP_DIFF = 8;                       // layout-gap：同列（欄）相鄰間距最大差
export const CENTER_X = 16, CENTER_Y = 24;       // layout-center：左右留白差、上下留白差（data-align=center）
// 內距跟著容器的 --sc-pad-card／--sc-pad-card-y（SceneLayout.measure 的 pad；情境動畫 x-* 72／64、字卡 48／40，kit/scene.css）
export const PAD_CARD = 48, PAD_CARD_Y = 40, GRID = 8;   // 沒量到 pad 時的預設；layout-center：data-justify="start"／"end" 時左（右）內距要＝pad ±--sc-grid
export const PAD_SLACK = 8;                      // layout-pad：內容群到內容區邊 < 內距 − 8 ⚠（字卡 40／32、情境動畫 64／56）
export const PAD_X = PAD_CARD - PAD_SLACK, PAD_Y = PAD_CARD_Y - PAD_SLACK;
export const LABEL_DIFF = 4;                     // layout-label：標籤中心對插圖中心
export const LABEL_ROW = 4;                      // layout-label-row：同一列標籤上緣差（row 預設底對齊）
export const LABEL_SIDE_ROW = 16;                // layout-label-row：側排元件（徽章＋右邊字）的標籤中心對同一列標籤中心（字在圖旁邊，容許寬一點）
export const LINK_MIN = 4, LINK_MAX = 32, LINK_MID = 8;   // layout-link：端點離外框、離邊中點
const STYLE = 'shared/style.md「版面」';

const r1 = (v) => Math.round(v * 10) / 10;
const cx = (b) => (b[0] + b[2]) / 2, cy = (b) => (b[1] + b[3]) / 2;
const vOver = (a, b) => Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0;
const hOver = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0;
// 依重疊分群（同列＝錨點上下範圍重疊；同欄＝左右範圍重疊）
function clusters(slots, over) {
  const g = slots.map((s, i) => i), find = (i) => (g[i] === i ? i : (g[i] = find(g[i])));
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) if (over(slots[i], slots[j])) g[find(i)] = find(j);
  const m = new Map();
  slots.forEach((s, i) => { const k = find(i); if (!m.has(k)) m.set(k, []); m.get(k).push(s); });
  return [...m.values()];
}
const rowsOf = (c) => (c.layout === 'row'
  ? [...c.slots.reduce((m, s) => m.set(s.row, [...(m.get(s.row) || []), s]), new Map()).values()]
  : clusters(c.slots, (a, b) => vOver(a.anchor, b.anchor) && !hOver(a.box, b.box)));
const colsOf = (c) => (c.layout === 'col' ? [c.slots] : c.layout === 'row' ? [] : clusters(c.slots, (a, b) => hOver(a.anchor, b.anchor) && !vOver(a.box, b.box)));
// 有標籤（插圖下面；橫排 side 不算；巢狀群組用裡面第一個有標籤的元件，例：手機＋掛在下面的 REC 膠囊）的 slot：row 預設底對齊，比標籤線，不比插圖中線
const hasLab = (s) => !!(s.label && !s.side && !s.anchor.every((v, k) => v === s.box[k]));
const sideLab = (s) => !!(s.label && s.side && !s.anchor.every((v, k) => v === s.box[k]));
const name = (s) => (s && s.id ? `#${s.id}` : '元件');
// 點到矩形的距離（在矩形裡＝0）
const rectDist = (p, b) => Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[2]), Math.max(b[1] - p[1], 0, p[1] - b[3]));
// 線段和矩形相交（矩形內縮 2px，貼邊不算）
function segHits(p, q, b) {
  const x0 = b[0] + 2, y0 = b[1] + 2, x1 = b[2] - 2, y1 = b[3] - 2;
  if (x1 <= x0 || y1 <= y0) return false;
  if (Math.max(p[0], q[0]) < x0 || Math.min(p[0], q[0]) > x1 || Math.max(p[1], q[1]) < y0 || Math.min(p[1], q[1]) > y1) return false;
  if (p[0] === q[0] || p[1] === q[1]) return true;   // 水平／垂直線段：外框重疊就是穿過
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [pp, qq] of [[-dx, p[0] - x0], [dx, x1 - p[0]], [-dy, p[1] - y0], [dy, y1 - p[1]]]) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const r = qq / pp;
    if (pp < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

export function judgeLayoutRules(lay, { item, t = null } = {}) {
  const out = [];
  if (!lay || !item || !(lay.containers || []).length) return out;
  const push = (level, rule, el, msg, fix, data = {}) => out.push({ id: item.id, label: item.label, level, rule, el: el ? { id: el } : null, at: [], t, kind: 'done', msg: `${msg}`, fix: `${fix}（${STYLE}）`, data });
  const parent = new Map();   // slot id → 所在容器 id（巢狀群組本身也是 slot）
  for (const c of lay.containers) for (const s of c.slots) if (s.id) parent.set(s.id, c.id);
  const ancestors = (id) => { const a = new Set(); for (let p = parent.get(id); p && !a.has(p); p = parent.get(p)) a.add(p); return a; };
  const allSlots = lay.containers.flatMap((c) => c.slots);

  for (const c of lay.containers) {
    const where = c.id ? `#${c.id}` : `data-layout="${c.layout}"`;
    // ── layout-row-align：同列的插圖中線
    let worst = null;
    for (const row of rowsOf(c)) for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) {
      if (hOver(row[i].box, row[j].box) || (c.align !== 'middle' && [row[i], row[j]].some((s) => hasLab(s) || sideLab(s)))) continue;
      const d = Math.abs(cy(row[i].anchor) - cy(row[j].anchor));
      if (d > ROW_WARN && (!worst || d > worst.d)) worst = { d, a: row[i], b: row[j] };
    }
    if (worst) push(worst.d > ROW_ERR ? 'error' : 'warn', 'layout-row-align', worst.b.id, `同一列沒對齊：${name(worst.a)} 和 ${name(worst.b)} 的插圖中線差 ${r1(worst.d)}px（${where}；> ${ROW_WARN}px ⚠、> ${ROW_ERR}px ✖）`,
      '這幾個元件放進同一個 data-layout="row"，不要手寫 top', { dy: r1(worst.d) });
    // ── layout-gap：同列（欄）相鄰間距（量排版時的位置：走位 move 之後的不算）
    const hb = (x) => x.home || x.box;
    for (const [list, ax] of [...rowsOf(c).map((r) => [r, 0]), ...colsOf(c).map((r) => [r, 1])]) {
      if (list.length < 3) continue;
      const s = [...list].sort((a, b) => hb(a)[ax] - hb(b)[ax]);
      const gaps = s.slice(1).map((x, k) => hb(x)[ax] - hb(s[k])[ax + 2]);
      const diff = Math.max(...gaps) - Math.min(...gaps);
      if (diff > GAP_DIFF) push('warn', 'layout-gap', s[0].id, `間距不一樣：${s.map(name).join('、')} 之間是 ${gaps.map(Math.round).join('／')}px（最大差 ${Math.round(diff)}px > ${GAP_DIFF}px；${where}）`,
        `同一${ax ? '欄' : '列'}用 data-layout 排，不要手寫 ${ax ? 'top' : 'left'}`, { gaps: gaps.map(r1) });
    }
    // ── layout-label-row：同一列有標籤的元件，標籤上緣在同一條線（data-align="middle" 是手動選中線，不量）
    if (c.align !== 'middle') for (const row of rowsOf(c)) {
      const ls = row.filter(hasLab);
      if (ls.length >= 2) {
        const lo = ls.reduce((p, q) => (q.label[1] < p.label[1] ? q : p)), hi = ls.reduce((p, q) => (q.label[1] > p.label[1] ? q : p)), d = hi.label[1] - lo.label[1];
        if (d > LABEL_ROW) push('warn', 'layout-label-row', hi.id, `同一列的標籤不在同一條線：${name(lo)} 和 ${name(hi)} 的標籤上緣差 ${r1(d)}px（${where}；> ${LABEL_ROW}px）`,
          '同一列的標籤要在同一條線：用 data-layout="row"（底對齊）', { d: r1(d) });
      }
      if (!ls.length) continue;
      const line = ls.reduce((v, s) => v + cy(s.label), 0) / ls.length;   // 直排標籤的中心線
      for (const s of row.filter(sideLab)) {
        const d = Math.abs(cy(s.label) - line);
        if (d > LABEL_SIDE_ROW) push('warn', 'layout-label-row', s.id, `同一列的標籤不在同一條線：側排的 ${name(s)} 標籤中心和其他標籤差 ${r1(d)}px（${where}；> ${LABEL_SIDE_ROW}px）`,
          '同一列的標籤要在同一條線：用 data-layout="row"（底對齊）', { d: r1(d), side: true });
      }
    }
    if (c.nested || !c.slots.length) continue;
    // ── layout-center／layout-pad：內容群（所有 slot 的外框聯集）在內容區裡；置中量排版時的位置（走位 move 之後的不算），內距量完成態
    const union = (bs) => [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
    const edges = (G) => [G[0] - c.box[0], c.box[2] - G[2], G[1] - c.box[1], c.box[3] - G[3]];
    const [hL, hR, hT, hB] = edges(union(c.slots.map((s) => s.home || s.box)));
    const J = c.justify || 'center', side = J === 'start' ? hL : J === 'end' ? hR : null;
    const padX = c.pad?.[0] > 0 ? c.pad[0] : PAD_CARD, padY = c.pad?.[1] > 0 ? c.pad[1] : PAD_CARD_Y, minX = padX - PAD_SLACK, minY = padY - PAD_SLACK;
    const cxBad = side != null ? Math.abs(side - padX) > GRID : Math.abs(hL - hR) > CENTER_X, cyBad = c.align !== 'top' && Math.abs(hT - hB) > CENTER_Y;
    if (cxBad || cyBad) push('warn', 'layout-center', null, side != null && cxBad
      ? `內容群沒${J === 'start' ? '靠左' : '靠右'}：${where} 裡${J === 'start' ? '左' : '右'}邊留白 ${Math.round(side)}px（data-justify="${J}" 要 ${padX}±${GRID}px）`
      : `內容群沒置中：${where} 裡左右留白 ${Math.round(hL)}／${Math.round(hR)}px${c.align !== 'top' ? `、上下 ${Math.round(hT)}／${Math.round(hB)}px` : ''}（差 > ${cxBad ? `${CENTER_X}px` : `${CENTER_Y}px`}）`,
      side != null && cxBad ? `data-justify="${J}" 交給 data-layout 排（${J === 'start' ? '左' : '右'}內距 ${padX}），不要手寫 left` : '內容群置中：用 data-layout；故意靠上寫 data-align="top"', { L: r1(hL), R: r1(hR), T: r1(hT), B: r1(hB) });
    const [L, R, T, B] = edges(union(c.slots.map((s) => s.box)));
    const padBad = Math.min(L, R) < minX || Math.min(T, B) < minY;
    if (padBad) push('warn', 'layout-pad', null, `內距不夠：內容群到 ${where} 邊 左 ${Math.round(L)}、右 ${Math.round(R)}、上 ${Math.round(T)}、下 ${Math.round(B)}px（左右 ≥ ${minX}、上下 ≥ ${minY}）`,
      `元件縮小或減少，內距至少 ${padX}／${padY}（${padX === PAD_CARD ? '字卡' : '情境動畫'}）`, { L: r1(L), R: r1(R), T: r1(T), B: r1(B) });
  }
  // ── layout-label：標籤中心對插圖中心
  for (const s of allSlots) {
    if (!s.label || s.nested || s.anchor.every((v, k) => v === s.box[k])) continue;
    const d = s.side ? Math.abs(cy(s.label) - cy(s.anchor)) : Math.abs(cx(s.label) - cx(s.anchor));
    if (d > LABEL_DIFF) push('warn', 'layout-label', s.id, `標籤沒對齊插圖：${name(s)} 的標籤中心和插圖中心${s.side ? '上下' : '左右'}差 ${r1(d)}px（> ${LABEL_DIFF}px）`,
      '標籤放在元件的 .xsc-it 裡，不要另外定位', { d: r1(d) });
  }
  // ── layout-link：連接線端點與路徑（data-links 產生的＋手寫的；端點量到元件外框，邊中點對插圖中線）
  for (const k of lay.links || []) {
    if (!k.boxA || !k.boxB || (k.pts || []).length < 2) continue;
    const bad = [], P0 = k.pts[0], P1 = k.pts[k.pts.length - 1], AA = k.anchorA || k.boxA, AB = k.anchorB || k.boxB;
    // 直線（兩點、水平或垂直）的另一軸對兩個錨點重疊段的正中（底對齊時高矮不同）；折線對各自的錨點中線
    const ov = (i) => [Math.max(AA[i], AB[i]), Math.min(AA[i + 2], AB[i + 2])];
    const mid = (i, a) => { const o = ov(i); return k.pts.length === 2 && P0[i] === P1[i] && o[1] > o[0] ? (o[0] + o[1]) / 2 : (a[i] + a[i + 2]) / 2; };
    for (const [p, b, a, who] of [[P0, k.boxA, AA, k.a], [P1, k.boxB, AB, k.b]]) {
      const d = rectDist(p, b);
      if (d < LINK_MIN || d > LINK_MAX) bad.push(`#${who} 端點離外框 ${r1(d)}px（${LINK_MIN}–${LINK_MAX}）`);
      const side = p[0] >= b[2] || p[0] <= b[0];
      const off = side ? Math.abs(p[1] - mid(1, a)) : Math.abs(p[0] - mid(0, a));
      if (off > LINK_MID) bad.push(`#${who} 端點離${side ? '左右' : '上下'}邊中點 ${r1(off)}px（±${LINK_MID}）`);
    }
    const skip = new Set([k.a, k.b, ...ancestors(k.a), ...ancestors(k.b)]);
    for (let i = 1; i < k.pts.length; i++) for (const s of allSlots) {
      if (!s.id || skip.has(s.id) || bad.some((x) => x.includes(`穿過 #${s.id}`))) continue;
      if (segHits(k.pts[i - 1], k.pts[i], s.box)) bad.push(`穿過 #${s.id}`);
    }
    if (bad.length) push('warn', 'layout-link', k.id, `連接線 #${k.id}${k.hand ? '（手寫）' : ''}：${bad.join('；')}`, '連接線用 data-links 產生，不要手寫 path', { problems: bad, hand: !!k.hand });
  }
  return out;
}

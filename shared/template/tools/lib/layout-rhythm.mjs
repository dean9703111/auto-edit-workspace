// 版面節奏（027）：人像口播的畫面不要一直切。作者 2026-11-12 定的三條：
//   1. 開頭 INTRO 秒以字卡為主（講者滿版露臉，卡疊在講者上），讓觀眾先認識講者
//   2. 半螢幕一次連續至少 HALF 秒
//   3. 子母畫面（講者縮成小視窗，含中間的全幕）一次連續至少 PIP 秒
// 這份是純函式：--check（lib/plan.mjs）、--outline、--map（lib/flow.mjs、lib/semantic-map.mjs）都用它，數字只有這一份。
//
//   modeOfHead(head)                      → 規格那一條第一行（.spec.md）是哪一種版面：card｜half｜pip｜full｜null
//   modeOfLayout(layout, key)             → --check 的 items[].layout（overlay｜side｜pip｜full）換成 card｜half｜pip｜null（章節幕不算）
//   layoutRuns(segs)                      → 連續同一種版面的區塊 [{ mode, start, end, ids }]（segs＝[{ id, start, end, mode }]，mode 是 null 的不算）
//   layoutFindings(segs, { voice })       → 違反三條規則的地方 [{ rule, ids, start, end, secs, msg, fix }]；voice＝只有聲音的區間（那裡本來就沒有講者，不算）
//                                           秒數比較留 TOL 秒容差；segs 帶了 from／to（大綱的句號）時，fix 寫可以照抄的改法（延哪一段的 to、併哪幾段）
//   planLayout(rows, { startOf, secsOf, modesOf }) → 每一行地圖該用哪一種版面 [{ mode, merge }]（照三條規則排；merge＝這一行沒有全畫面模板，併進前一段）
//   layoutPlanLine(rows, plan, { startOf, secsOf })  → 「0:00–0:31 字卡｜0:31–1:25 子母畫面（#15–#38）｜…」

export const RHYTHM = { intro: 30, half: 15, pip: 45, join: 1, absorb: 10 };
// 連續秒數差這麼一點不報（032 實跑：子母畫面 44.9 秒被 ✖，改大綱只為了湊 0.1 秒）
export const TOL = 0.5;
export const MODE_ZH = { card: '字卡', half: '半螢幕', pip: '子母畫面' };

const fmt = (t) => { const m = Math.floor(t / 60); return `${m}:${String(Math.floor(t - m * 60)).padStart(2, '0')}`; };
const r1 = (n) => Math.round(n * 10) / 10;

export function modeOfHead(head) {
  const h = String(head || '').split('\n')[0];
  if (/^\*\*media\*\*/.test(h)) return 'pip';
  if (/^\*\*fx \d/.test(h)) return 'card';                      // 字卡動態預設透明疊在講者上（寫 bg 才是整張幕）
  const tag = h.match(/^\*\*[^*]+\*\*（([^）]*)）/)?.[1] || '';
  if (/全幕/.test(tag)) return 'full';
  if (/半畫面|半螢幕/.test(tag)) return 'half';
  if (/子母畫面|全畫面/.test(tag)) return 'pip';
  if (/疊加|字卡/.test(tag)) return 'card';
  return null;
}

export const modeOfLayout = (layout, key = '') => (key === 'chapter' ? null : layout === 'overlay' ? 'card' : layout === 'side' ? 'half' : layout === 'pip' || layout === 'full' ? 'pip' : null);

export function layoutRuns(segs, { join = RHYTHM.join } = {}) {
  const runs = [];
  for (const s of [...segs].filter((x) => x.mode && x.end > x.start).sort((a, b) => a.start - b.start)) {
    const last = runs[runs.length - 1];
    if (last && last.mode === s.mode && s.start - last.end <= join + 1e-6) { last.end = Math.max(last.end, s.end); last.ids.push(s.id); }
    else runs.push({ mode: s.mode, start: s.start, end: s.end, ids: [s.id] });
  }
  return runs;
}

const inVoice = (a, b, voice) => voice.some(([x, y]) => Math.min(b, y) - Math.max(a, x) >= (b - a) * 0.6);

export function layoutFindings(segs, { voice = [], R = RHYTHM } = {}) {
  const out = [];
  const list = segs.filter((s) => s.mode && !inVoice(s.start, s.end, voice));
  // 1. 開頭 30 秒以字卡為主
  const early = list.filter((s) => s.mode !== 'card' && s.start < R.intro - 1e-6);
  if (early.length) {
    out.push({ rule: 'intro', ids: early.map((s) => s.id), start: early[0].start, end: early[early.length - 1].end, secs: null,
      msg: `開頭 ${R.intro} 秒要讓觀眾先認識講者：${early.map((s) => `${s.id}（${fmt(s.start)}，${MODE_ZH[s.mode]}）`).join('、')} 把講者縮小或推到一邊了`,
      fix: `這幾段換成疊在講者上的字卡（下方字卡、字卡動態、疊加的模板），或把起點延到 ${fmt(R.intro)} 之後` });
  }
  // 2、3. 半螢幕、子母畫面一次要連續夠久
  for (const run of layoutRuns(list)) {
    const need = run.mode === 'half' ? R.half : run.mode === 'pip' ? R.pip : 0, secs = r1(run.end - run.start);
    if (!need || secs >= need - TOL) continue;
    const ids = run.ids.length > 3 ? `${run.ids[0]}–${run.ids[run.ids.length - 1]}` : run.ids.join('、');
    const how = stretchFix(segs, run, need, R);
    out.push({ rule: run.mode, ids: run.ids, start: run.start, end: run.end, secs,
      msg: `${MODE_ZH[run.mode]}只連續 ${secs} 秒（${ids}，${fmt(run.start)}–${fmt(run.end)}），至少要 ${need} 秒：切進去馬上又切回講者，畫面會晃`,
      fix: how ? `${how}；不想併就把這幾段改成疊在講者上的字卡` : run.mode === 'pip'
        ? `把前後相鄰的段也換成全畫面的模板（或併成一段），讓子母畫面連續 ≥ ${need} 秒；湊不到就把這幾段改成疊在講者上的字卡`
        : `把這一段拉長到 ≥ ${need} 秒（併進前後一行），或改成疊在講者上的字卡` });
  }
  return out;
}

// 不夠長的區塊：往後（或往前）併最少幾段就夠長，寫成照抄就能改的一句（大綱的 from／to 是句號；沒帶就回 ''，用通用的說法）
//   往後：區塊最後一段的 to 改成被併那幾段最後一段的 to；往前：區塊第一段的 from 改成被併那一段的 from
//   不跨過章節、整張幕（mode 是 null 的段），往前不併進開頭的字卡區
function stretchFix(segs, run, need, R) {
  const all = [...segs].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const first = all.findIndex((s) => s.id === run.ids[0]), last = all.findIndex((s) => s.id === run.ids[run.ids.length - 1]);
  if (first < 0 || last < 0 || !all[first].from || !all[last].to) return '';
  const ok = (a, b) => b - a >= need - TOL;
  // 併到第 k 段之後，再過去緊接著的同一種版面的段會接成同一個區塊，一起算
  const reachFwd = (k) => { let e = all[k].end; for (let i = k + 1; i < all.length && all[i].mode === run.mode && all[i].start - e <= R.join + 1e-6; i++) e = Math.max(e, all[i].end); return e; };
  const reachBack = (k) => { let s = all[k].start; for (let i = k - 1; i >= 0 && all[i].mode === run.mode && s - all[i].end <= R.join + 1e-6; i--) s = Math.min(s, all[i].start); return s; };
  const tries = [];
  // 併段最多併 2 段（再多一段畫面要撐太久）；子母畫面另外可以把相鄰的段換成全畫面的模板（最多 3 段）
  for (let k = last + 1; k < all.length && k - last <= 3 && all[k].to && all[k].mode; k++) {
    const end = reachFwd(k);
    if (!ok(run.start, end)) continue;
    const eat = all.slice(last + 1, k + 1).map((s) => s.id), secs = r1(end - run.start);
    if (eat.length <= 2) tries.push({ n: eat.length, text: `把 ${all[last].id} 的 to 改成 ${all[k].to}（併進 ${eat.join('、')}，那${eat.length > 1 ? '幾' : '一'}行從大綱刪掉），${MODE_ZH[run.mode]}就連續 ${secs} 秒` });
    if (run.mode === 'pip') tries.push({ n: eat.length + 0.5, text: `把 ${eat.join('、')} 也換成全畫面的模板（照 --map 那一行〔子母畫面〕的模板），子母畫面就連續 ${secs} 秒` });
    break;
  }
  for (let k = first - 1; k >= 0 && first - k <= 3 && all[k].from && all[k].mode && all[k].start >= R.intro - 1e-6; k--) {
    const start = reachBack(k);
    if (!ok(start, run.end)) continue;
    const eat = all.slice(k, first).map((s) => s.id), secs = r1(run.end - start);
    if (eat.length <= 2) tries.push({ n: eat.length, text: `把 ${all[first].id} 的 from 改成 ${all[k].from}（併進 ${eat.join('、')}，那${eat.length > 1 ? '幾' : '一'}行從大綱刪掉），${MODE_ZH[run.mode]}就連續 ${secs} 秒` });
    if (run.mode === 'pip') tries.push({ n: eat.length + 0.5, text: `把 ${eat.join('、')} 也換成全畫面的模板（照 --map 那一行〔子母畫面〕的模板），子母畫面就連續 ${secs} 秒` });
    break;
  }
  return tries.sort((a, b) => a.n - b.n).slice(0, 2).map((x) => x.text).join('；或') || '';
}

// 每一行地圖該用哪一種版面。modesOf(row) → { any: [這一行的語意有哪幾種版面的模板], first: 首選模板的版面 }
//   不看這一行自己的秒數放不放得下：同一個區塊裡的行本來就可以併成一段（--map 會說併哪一行就放得下）
export function planLayout(rows, { startOf, secsOf, modesOf, R = RHYTHM } = {}) {
  const info = rows.map((r) => { const m = modesOf(r) || {}; return { t: startOf(r) ?? 0, d: secsOf(r) ?? 0, any: m.any || [], first: m.first ?? null }; });
  const n = info.length, plan = info.map(() => ({ mode: 'card', merge: false }));
  const can = (i) => info[i].any.includes('pip');
  let k = 0;
  while (k < n && info[k].t < R.intro - 1e-6) k++;             // 開頭 30 秒開始的行：字卡
  while (k < n) {
    if (!can(k)) { k++; continue; }
    // 從這一行往後長一個子母畫面區塊：有全畫面模板的行直接收；夾在中間、沒有全畫面模板的行（重點、轉場）連續合計 ≤ absorb 秒可以併進前一段
    let j = k, end = k, pend = [], pendSecs = 0;
    const merged = [];
    while (j < n) {
      if (can(j)) { merged.push(...pend); pend = []; pendSecs = 0; end = j; j++; }
      else if (pendSecs + info[j].d <= R.absorb + 1e-6) { pend.push(j); pendSecs += info[j].d; j++; }
      else break;
    }
    const span = info.slice(k, end + 1).reduce((s, x) => s + x.d, 0);
    const lead = info.slice(k, end + 1).reduce((s, x) => s + (x.first === 'pip' ? x.d : 0), 0);   // 首選就是全畫面模板的行有多少秒
    if (span >= R.pip - 0.05 && lead >= span * 0.5 - 0.05) for (let i = k; i <= end; i++) plan[i] = { mode: 'pip', merge: merged.includes(i) };
    k = end + 1;
  }
  // 半螢幕：字卡區裡，首選是半螢幕、而且這一行自己就夠 15 秒
  for (let i = 0; i < n; i++) if (plan[i].mode === 'card' && info[i].t >= R.intro - 1e-6 && info[i].first === 'half' && info[i].d >= R.half - 0.05) plan[i] = { mode: 'half', merge: false };
  return plan;
}

export function layoutPlanLine(rows, plan, { startOf, secsOf } = {}) {
  const blocks = [];
  rows.forEach((r, i) => {
    const a = startOf(r) ?? 0, b = a + (secsOf(r) ?? 0), last = blocks[blocks.length - 1];
    if (last && last.mode === plan[i].mode) { last.end = b; last.z = r.z; }
    else blocks.push({ mode: plan[i].mode, start: a, end: b, a: r.a, z: r.z });
  });
  return blocks.map((b) => `${fmt(b.start)}–${fmt(b.end)} ${MODE_ZH[b.mode]}${b.mode === 'card' ? '' : `（#${b.a}–#${b.z}）`}`).join('｜');
}

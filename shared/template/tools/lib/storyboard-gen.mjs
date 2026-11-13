// 分鏡表由工具產生：plan.json（段落與 story）＋ --check 的時間＋截圖清單 → work/storyboard.md；
// 使用者在網頁改完之後，applyStoryboard 把改動套回 plan.json（只動改到的欄位）。格式見 USAGE.md 2.3；解析在 editor/storyboard-md.mjs。零依賴。
//   textFields(seg, { scenes, specs })        → 這段「畫面文字」的欄位清單 [{ path, label, value }]，順序固定
//   renderSection(seg, ctx)                   → 一段（### <id>｜…）；ctx.beats（Map id → 正本的動畫分鏡，lib/beat-source.mjs 的 beatBlock）有這段就放它
//   renderStoryboard(ctx)                     → 整份 markdown
//   tidyDecide(list, { cues })                → { ask, ai }：「需要我決定的事」去重、白話；ask 問作者，ai 是 AI 自己能決定的
//   applyStoryboard(md, plan, { scenes, specs, cues }) → { plan, changes, requests, unmatched, answers, designs（這次勾成內容設計動畫的段）, changed }
//   isDesignPick(seg)、toDesign(seg)          → 內容設計動畫候選（story.designIdea）；勾了就換成 design 段
//   moodRows(ctx)                             → 分鏡表「情緒點」表的每一列（候選＝_merged.json 的 moods，☑＝plan.json 有）
import { parseStoryboard, isDecideSection } from '../editor/storyboard-md.mjs';
import { renderSheet } from './custom-fill.mjs';
import { MOOD_KINDS, insertMoods } from './moods.mjs';
import { parseTime, cueSeconds } from './time.mjs';

const clock = (t) => { if (t == null) return '—'; const r = Math.round(t * 100) / 100, m = Math.floor(r / 60); return `${m}:${(r - m * 60).toFixed(2).padStart(5, '0')}`; };
const cell = (s) => String(s ?? '').replace(/\|/g, '｜').replace(/\s*\r?\n\s*/g, ' ').trim();
const quote = (s) => String(s ?? '').replace(/[「」]/g, '');

const getPath = (o, p) => p.reduce((v, k) => (v == null ? v : v[k]), o);
const setPath = (o, p, val) => { let v = o; for (const k of p.slice(0, -1)) v = v[k]; v[p[p.length - 1]] = val; };

function declFields(prefix, label, d, value, out) {
  const t = d?.type || 'text';
  if (t === 'list') {
    (Array.isArray(value) ? value : []).forEach((it, i) => {
      const lb = `${d.label || label} ${i + 1}`;
      if (typeof it === 'string') { out.push({ path: [...prefix, i], label: lb, value: it }); return; }
      if (!it || typeof it !== 'object') return;
      for (const [f, fd] of Object.entries(d.item || {})) {
        if (!['text', 'rich'].includes(fd.type || 'text') || it[f] == null || it[f] === '') continue;
        out.push({ path: [...prefix, i, f], label: f === 'text' ? lb : `${lb} ${fd.label || f}`, value: it[f] });
      }
    });
    return;
  }
  if (['text', 'rich'].includes(t) && value != null && value !== '') out.push({ path: prefix, label: d.label || label, value });
}

// 畫面上看得到的字。順序固定，使用者改完靠順序對回 plan.json
// 分鏡表每段一行：素材怎麼用（8→19s ×1.52、定格、變速；運鏡 1、紅框 2、打碼 1）
function mediaUse(seg, item) {
  const a = item?.out?.annotations;
  const K = a?.knots;
  const r = (v) => Math.round(v * 100) / 100;
  let use = seg.in != null ? ` 從 ${seg.in} 秒` : '';
  if (K?.length >= 2) {
    if (seg.hold != null) use = `：定格在第 ${seg.hold} 秒`;
    else if (K.length === 2) { const sp = r((K[1][1] - K[0][1]) / Math.max(1e-6, K[1][0] - K[0][0])); use = `：第 ${r(K[0][1])}→${r(K[1][1])} 秒${sp !== 1 ? ` ×${sp}` : ''}`; }
    else use = `：第 ${r(K[0][1])}→${r(K[K.length - 1][1])} 秒，變速 ${K.slice(1).map((k, i) => { const sp = r((k[1] - K[i][1]) / Math.max(1e-6, k[0] - K[i][0])); return sp === 0 ? '定格' : `×${sp}`; }).join('→')}`;
  }
  const n = (x) => (Array.isArray(x) ? x.length : 0);
  const marks = [[n(seg.moves), '運鏡'], [n(seg.marks) + n(seg.callouts), '紅框'], [n(seg.arrows), '箭頭'], [n(seg.lens), '放大鏡'], [n(seg.spot), '聚光燈'], [n(seg.redact), '打碼']].filter(([c]) => c).map(([c, w]) => `${w} ${c}`);
  return `${use}${marks.length ? `（${marks.join('、')}）` : ''}`;
}

export function textFields(seg, { scenes = [], specs = new Map() } = {}) {
  const out = [];
  if (seg?.type === 'media') return out;
  if (seg?.type === 'fx') {
    for (const [k, v] of Object.entries(seg.vars || {})) if (typeof v === 'string' && v) out.push({ path: ['vars', k], label: k, value: v });
    return out;
  }
  if (seg?.type === 'custom') {
    if (!seg.template) return out;
    const spec = specs.get(seg.template);
    const s = seg.slots || {};
    if (spec?.generator === 'scene') {
      if (s.title) out.push({ path: ['slots', 'title'], label: '標題', value: s.title });
      const walk = (parts, base) => (parts || []).forEach((p, i) => {
        if (Array.isArray(p.parts)) walk(p.parts, [...base, i, 'parts']);
        else if (p.label) out.push({ path: [...base, i, 'label'], label: `元件 ${p.id}`, value: p.label });
      });
      walk(s.parts, ['slots', 'parts']);
      return out;
    }
    for (const [k, d] of Object.entries(spec?.slots || {})) declFields(['slots', k], k, d, s[k], out);
    return out;
  }
  const scene = scenes.find((x) => x.key === seg?.scene);
  for (const [k, d] of Object.entries(scene?.slots || {})) declFields(['slots', k], k, d, seg?.slots?.[k], out);
  return out;
}

const SFX_WORD = { default: '預設', none: '無' };
const sfxText = (seg) => (seg.sfx === undefined ? SFX_WORD.default : seg.sfx === null ? SFX_WORD.none : typeof seg.sfx === 'string' ? seg.sfx : seg.sfx?.name || SFX_WORD.default);

function cardLabel(seg, item) {
  if (seg.type === 'media') return `螢幕錄影或圖片 ${String(seg.src || '').split('/').pop()}`;
  if (seg.design) return '內容設計動畫';
  if (seg.type === 'custom') return `模板動畫 ${seg.template || String(seg.src || '').split('/').pop()}`;
  if (seg.type === 'fx') return `字卡動態 ${seg.fx}`;
  return item?.label || seg.scene || '';
}

const layoutOf = (item) => item?.layoutZh || '—';

// 內容設計動畫候選：草稿照常套模板，另外在 story 寫 designIdea（構想）、designWhy（為什麼值得設計）；③ 勾了才改成內容設計動畫
export const isDesignPick = (seg) => !seg.design && seg.type !== 'media' && !!String(seg.story?.designIdea || '').trim();
// 時間成本（建議初值，shared/style.md「內容設計動畫」）：一段約 12 分鐘、同時 4 段；建議先做的那幾段＝預估 ≤ 30 分鐘
export const DESIGN_MIN = 12, DESIGN_PAR = 4, DESIGN_BUDGET = 30;
export const designMinutes = (n) => Math.ceil(n / DESIGN_PAR) * DESIGN_MIN;
// 要勾的話建議先做哪幾段：各章輪流（章照出現順序），同一章段長的先；加到下一段會超過預算就停。cands＝[{ id, part, secs }]
export function defaultPicks(cands) {
  const parts = [];
  for (const c of cands) { let g = parts.find((x) => x.part === c.part); if (!g) parts.push(g = { part: c.part, list: [] }); g.list.push(c); }
  for (const g of parts) g.list.sort((a, b) => (b.secs || 0) - (a.secs || 0));
  const order = [];
  for (let i = 0; parts.some((g) => g.list[i]); i++) for (const g of parts) if (g.list[i]) order.push(g.list[i].id);
  const on = new Set();
  for (const id of order) { if (designMinutes(on.size + 1) > DESIGN_BUDGET) break; on.add(id); }
  return on;
}
// 026：預設都不勾（作者 2026-11-12：分鏡確認後先全部套模板合成，看完預覽不滿意的段再專門設計；
// 之前預設勾到 30 分鐘的預算，一開工就要等設計師做完才看得到第一版）。on＝預設勾的（空的）；suggest＝要勾的話建議先做哪幾段
export function designPlan(segs, { items = new Map(), partOf = () => '—' } = {}) {
  const cands = segs.filter(isDesignPick).map((s) => { const it = items.get(s.id); return { id: s.id, part: partOf(s), secs: it ? it.end - it.start : 0 }; });
  const suggest = defaultPicks(cands);
  return { cands, on: new Set(), suggest, minutes: 0, all: designMinutes(cands.length) };
}
export const designPlanLine = (d) => (d.on.size
  ? `勾了 ${d.on.size} 段（預估 ${d.minutes} 分鐘，${DESIGN_PAR} 段同時做）；全勾 ${d.cands.length} 段約 ${d.all} 分鐘`
  : `預設都不勾：先全部套模板出完成影片預覽（全勾 ${d.cands.length} 段約 ${d.all} 分鐘，${DESIGN_PAR} 段同時做）`);

const DESIGN_KEEP = ['id', 'from', 'to', 'duration', 'anchor', 'sfx', 'sfxExtra', 'pip', 'sfxVolume', 'note'];
export function toDesign(seg) {
  const out = { id: seg.id, type: 'custom', design: true };
  for (const k of DESIGN_KEEP.slice(1)) if (seg[k] !== undefined) out[k] = seg[k];
  out.story = { ...(seg.story?.say ? { say: seg.story.say } : {}), idea: seg.story.designIdea, why: seg.story.designWhy || seg.story.why || '' };
  return out;
}

// 01 這類只有 at 的段：顯示句號
function cueRange(seg, item) {
  if (seg.from) return `${seg.from}–${seg.to || ''}`.replace(/–$/, '');
  if (seg.at) return String(seg.at);
  return item ? clock(item.start) : '—';
}

export function renderSection(seg, ctx) {
  const { items = new Map(), cues = [], shots = new Map(), scenes = [], specs = new Map(), designs = new Map() } = ctx;
  const item = items.get(seg.id);
  const L = [];
  L.push(`### ${seg.id}｜${cueRange(seg, item)}｜${clock(item?.start)}–${clock(item?.end)}`, '');
  const n = Number(String(seg.from || seg.at || '').match(/^#(\d+)/)?.[1]);
  const c = cues.find((x) => x.n === n);
  L.push(`- 起點那句字幕：${c ? c.text : '—'}`);
  L.push(`- 版面：${layoutOf(item)}（${cardLabel(seg, item)}）`);
  const fields = textFields(seg, { scenes, specs });
  if (fields.length) L.push(`- 畫面文字：${fields.map((f) => `${f.label}「${quote(f.value)}」`).join('；')}`);
  if (seg.type === 'media' && seg.src) L.push(`- 素材：\`${seg.src}\`${mediaUse(seg, item)}`);
  L.push(`- 音效：${sfxText(seg)}`);
  const design = seg.design ? designs.get(seg.id) : null;
  if (seg.design) {
    L.push(`- 概念：${cell(design?.concept || seg.story?.idea || '（還沒寫鏡位腳本）')}`);
    if (design?.picture) L.push(`- 畫面：${cell(design.picture)}`);
  }
  if (seg.story?.why) L.push(`- 理由：${cell(seg.story.why)}`);
  if (isDesignPick(seg)) L.push(`- 可以改做內容設計動畫：${cell(seg.story.designIdea)}（要做就在「需要我決定的事」的候選表勾這段）`);
  L.push('');
  const pics = shots.get(seg.id) || [];
  for (const p of pics) L.push(p.md || `![${seg.id}](storyboard-preview/${p.file})`);
  if (pics.length) L.push('');
  L.push(`截圖觀察：${seg.design && !design?.done ? '動畫要在這張鏡位腳本確認後才做，所以還沒有畫面' : '無'}`, '');
  // 032 B6：ctx.beats（id → beat-source.mjs 的 beatBlock：正本的動畫分鏡＋插圖清單，手寫段多一行「- 拍點正本：…」）有這段就用它
  if (ctx.beats?.has?.(seg.id)) {
    const b = ctx.beats.get(seg.id);
    if (b) L.push(b.trim(), '');
  } else if (seg.design) {
    if (design?.sheet) L.push(design.sheet.trim(), '');
  } else if (seg.type === 'custom' && seg.template) {
    const spec = specs.get(seg.template);
    const sheet = spec ? renderSheet(spec, seg.slots, seg.id) : null;
    if (sheet) L.push(sheet.trim(), '');
  }
  return `${L.join('\n')}\n`;
}

const FOUR_LAYOUTS = `| 版面 | 畫面長什麼樣 | 用在 |
|---|---|---|
| 疊加 | 講者滿版，卡片疊在上面 | 06–15、02、05、透明字卡動態 |
| 半畫面 | 講者推到右半邊、左半邊面板 | 03 |
| 子母畫面 | 資訊卡占滿畫面、講者縮到右下角小視窗 | 04 家族、media、custom fullscreen |
| 全幕 | 不透明整張蓋住、沒有小視窗 | 01、字卡動態 bg dark／light／accent |`;

// 「需要我決定的事」是分章草稿各寫各的合起來的：同一件事問很多次，也混了寫給主代理的話（24 條裡講者問 6 次、章名問 5 次）。
// 這裡整理成給作者看的短清單：問作者的（ask）去重、把段號和句號換成時間與白話；AI 自己能決定的（ai）另外放，作者不用回答。
const TO_AI = /請主代理(?:決定|處理)|主代理決定|要對稱就告訴我|^(?:循環|重複)|是.*的重(?:複|講)|第二段.*是第一段的重複|測試(?:素材|循環)|未去重|不完全對稱/;
const IS_SPEAKER = /(姓名|頭銜|name|titles).{0,12}(待確認|沒給|沒寫|未寫|還沒|沒有)|(待確認|沒給).{0,12}(姓名|頭銜)|講者[：:]\s*(?:還沒|本章未|待確認)/;
const IS_CHAPTER = /章名/;
const NO_PREFIX = /^(?:\*\*)?(?:\d+\.\s*)?/;
const plainRefs = (text, cues = []) => {
  const at = (n, end) => { const c = cues.find((x) => x.n === Number(n)); return c ? clock(end ? c.end : c.start).replace(/\.\d+$/, '') : null; };
  return String(text)
    .replace(/#(\d+)e?\s*[–-]\s*#?(\d+)e?/g, (m, a, b) => (at(a) && at(b, true) ? `${at(a)}–${at(b, true)}` : m))
    .replace(/#(\d+)(e?)(?![\d@])/g, (m, n, e) => at(n, !!e) || m)
    .replace(/\bn=(\d+)/g, (m, n) => at(n) || m);
};
const plainWords = (text) => String(text)
  .replace(/請主代理問使用者[^。；]*[。；]?/g, '').replace(/，?請主代理問使用者/g, '').replace(/，?請主代理[^。；]*/g, '')
  .replace(/(?<![:\d.])\d{2}[a-d]?\s+(?=(?:章節|下方|重點|一般|標題|講者|金句|關鍵|兩側|半版|全畫面|字卡|Step|QA|Tips|總結))/g, '')
  .replace(/(金句|字卡)（\d{2}）/g, '$1').replace(/\s*\bx-[a-z][a-z-]*/g, '模板動畫').replace(/用 (?=重點字卡|一般字卡|標題條列|字卡)/g, '用')
  .replace(/（?name、titles[^）。；]*）?/g, '').replace(/（ch\d+\.md[^）]*）/g, '').replace(/shared\/講者\.json/g, '講者設定')
  .replace(/\s+([，。；：])/g, '$1').replace(/^[，。；：\s]+|[，；：\s]+$/g, '').trim();
export function tidyDecide(list, { cues = [] } = {}) {
  const ask = [], ai = [], chapters = new Set();
  let speaker = false, chapterAt = -1;
  const seen = new Set();
  for (const raw of list) {
    const d = String(raw ?? '').replace(NO_PREFIX, '').replace(/\*\*/g, '').trim();
    if (!d || seen.has(d)) continue;
    seen.add(d);
    if (IS_CHAPTER.test(d) && /自取|取自|待確認|請確認|沒有 ## 章名/.test(d)) {
      if (chapterAt < 0) { chapterAt = ask.length; ask.push(null); }
      for (const m of d.matchAll(/「([^」]{1,16})」/g)) if (!/^第\s*\d+\s*章$/.test(m[1])) chapters.add(m[1]);
      const tail = /(?:自取|取)[：:]\s*([^（(，。；]{2,16})/.exec(d) || /^章名[：:]\s*([^（(，。；]{2,16})(?=（)/.exec(d);
      if (tail && !/講稿|待確認/.test(tail[1])) chapters.add(tail[1].trim());
    } else if (IS_SPEAKER.test(d)) {
      if (!speaker) { speaker = true; ask.unshift('講者的姓名與頭銜還沒給：跟我說你要用的姓名和頭銜（現在畫面上是示範人物，每一集都會用同一組）'); if (chapterAt >= 0) chapterAt++; }
    } else if (TO_AI.test(d)) ai.push(plainRefs(d, cues));
    else {
      const t = plainWords(plainRefs(d, cues));
      if (t && !ask.includes(t)) ask.push(t);
    }
  }
  if (chapterAt >= 0) ask[chapterAt] = `這幾章的章名是 AI 取的，要改就告訴我${chapters.size ? `：${[...chapters].map((c) => `「${c}」`).join('、')}` : ''}`;
  return { ask, ai };
}

export const chapterOfFn = (parts = []) => (seg) => {
  const n = Number(String(seg.from || seg.at || '').match(/^#(\d+)/)?.[1]);
  const p = parts.find((x) => n >= x.firstN && n <= x.lastN);
  return p ? p.title : '—';
};

export function renderStoryboard(ctx) {
  const { project, plan, items = new Map(), merged = {}, parts = [], voiceOnly = [], designs = new Map() } = ctx;
  const segs = (plan.scenes || []).slice();
  const L = [`# 分鏡表：${project}（草稿）`, '', '## 四種版面', '', FOUR_LAYOUTS, ''];
  if (plan.speakerBox) L.push(`講者框 speakerBox＝${JSON.stringify(plan.speakerBox)}`, '');
  const icons = Object.entries(merged.icons || {});
  if (icons.length) L.push('## 本集圖示表', '', '| 物件 | 圖示 |', '|---|---|', ...icons.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`), '');
  const chapterOf = chapterOfFn(parts);
  L.push('## 總覽', '', '| 段 | 章 | 句號 | 時間碼 | 版面 | 卡片類型 | 一句話摘要 |', '|---|---|---|---|---|---|---|');
  for (const s of segs) {
    const it = items.get(s.id);
    L.push(`| ${s.id} | ${cell(chapterOf(s))} | ${cell(cueRange(s, it))} | ${clock(it?.start)}–${clock(it?.end)} | ${layoutOf(it)} | ${cell(cardLabel(s, it))} | ${cell(s.story?.say || s.story?.idea || '—')} |`);
  }
  L.push('');
  L.push('## 情境判定', '', '| 段 | 講解在講什麼 | 首選 | 為什麼這樣呈現 |', '|---|---|---|---|');
  for (const s of segs) L.push(`| ${s.id} | ${cell(s.story?.say || '—')} | ${cell(cardLabel(s, items.get(s.id)))} | ${cell(s.story?.why || '—')} |`);
  L.push('');
  const designCount = segs.filter((s) => s.design).length;
  if (designCount) {
    L.push(`內容設計動畫 ${designCount} 段：${segs.filter((s) => s.design).map((s) => `${s.id}${designs.get(s.id)?.concept ? `（${cell(designs.get(s.id).concept).slice(0, 18)}）` : ''}`).join('、')}`, '');
  }
  L.push('## 分段', '');
  for (const s of segs) L.push(renderSection(s, ctx));
  if (voiceOnly.length) {
    L.push('## 只有聲音的區間', '', '| 區間 | 用哪一段蓋住 |', '|---|---|');
    for (const r of voiceOnly) {
      const [a, b] = Array.isArray(r) ? r : [r.start, r.end];
      const by = [...items.values()].filter((x) => x.opaque && x.start < b && x.end > a).map((x) => x.id);
      L.push(`| ${clock(a)}–${clock(b)} | ${by.join('、') || '還沒蓋住'} |`);
    }
    L.push('');
  }
  L.push('## 需要我決定的事', '');
  const { ask, ai } = tidyDecide(merged.decide || [], { cues: ctx.cues });
  if (!plan.outro) ask.push('結尾要不要配樂：要的話告訴我從哪一句起');
  ask.forEach((d, i) => L.push(`${i + 1}. ${cell(d)}`));
  L.push('');
  if (ai.length) {
    L.push('### 給 AI 的備註（不用回答）', '');
    ai.forEach((d) => L.push(`- ${cell(d)}`));
    L.push('');
  }
  const dp = designPlan(segs, { items, partOf: chapterOf });
  if (dp.cands.length) {
    L.push('### 內容設計動畫候選（預設都不勾：先照現在的版面合成；勾 ☑ 的段才從空白畫布專門設計）', '', '| 段 | 時間碼 | 現在用 | 構想 | 為什麼值得設計 | 預估 | 要不要 ☐ |', '|---|---|---|---|---|---|---|');
    for (const c of dp.cands) {
      const s = segs.find((x) => x.id === c.id), it = items.get(s.id);
      L.push(`| ${s.id} | ${clock(it?.start)}–${clock(it?.end)} | ${cell(cardLabel(s, it))} | ${cell(s.story.designIdea)} | ${cell(s.story.designWhy || '—')} | ${DESIGN_MIN} 分鐘 | ${dp.on.has(s.id) ? '☑' : '☐'} |`);
    }
    L.push('', `${designPlanLine(dp)}。想一開始就專門設計的段才勾（${DESIGN_PAR} 段一批，每批約 ${DESIGN_MIN} 分鐘）；也可以先看完成影片預覽，不滿意再說「<段> 重新設計」`, '');
  }
  const mr = moodRows(ctx);
  if (mr.length) {
    L.push(`### ${MOOD_HEAD}`, '', '| 點 | 綁在 | 時間碼 | 情緒 | 音效 | 推近 | 要不要 ☐ |', '|---|---|---|---|---|---|---|');
    mr.forEach((m, i) => L.push(`| ${i + 1} | ${cell(m.at)} | ${clock(m.t)} | ${MOOD_KINDS[m.kind]?.zh || cell(m.kind)} | ${cell(m.sound)} | ${m.zoom === 'lost' ? '推不到（講者被蓋住或同一分鐘已推近）' : m.zoom ? '推近' : '—'} | ${m.on ? '☑' : '☐'} |`));
    L.push('', `☑ ${mr.filter((m) => m.on).length} 個／共 ${mr.length} 個；音效照情緒配（${Object.values(MOOD_KINDS).map((v) => `${v.zh} ${v.sound}`).join('、')}），同一分鐘模板的預設音效會讓位`, '');
  }
  L.push('### 金句候選（勾了才上，每集最多 6 則）', '', '| 候選 | 句號 | 原句 | 卡上文字（≤ 14 字） | 情緒（正／負／中） | 要不要 ☐ |', '|---|---|---|---|---|---|');
  (merged.quotes || []).forEach((q, i) => {
    const on = segs.some((s) => s.id === `q${String(i + 1).padStart(2, '0')}`);
    L.push(`| ${i + 1} | #${q.n} | ${cell(q.text)} | ${cell(q.card)} | ${cell(q.mood || '中')} | ${on ? '☑' : '☐'} |`);
  });
  L.push('');
  return `${L.join('\n')}\n`;
}

const SFX_RE = /^(.+)$/;
const MOOD_HEAD = '情緒點（音效照講者的情緒放；☑ 的點出聲，「推近」那幾個講者畫面同時爆衝推近；取消勾＝這個點不要）';
const ZH_KIND = Object.fromEntries(Object.entries(MOOD_KINDS).map(([k, v]) => [v.zh, k]));

// 情緒點表的列：候選（_merged.json 的 moods；沒有就用 plan.json 的）＋這次 plan.json 有沒有（☑）＋ --check --json 算出來的音效
export function moodRows(ctx) {
  const { plan = {}, merged = {}, cues = [], moodTimes = [] } = ctx;
  const inPlan = Array.isArray(plan.moods) ? plan.moods : [];
  const pool = Array.isArray(merged.moods) && merged.moods.length ? merged.moods : inPlan;
  const rows = [];
  const seen = new Set();
  for (const m of [...pool, ...inPlan]) {
    if (!m || typeof m.at !== 'string' || seen.has(m.at)) continue;
    seen.add(m.at);
    const k = inPlan.findIndex((x) => x?.at === m.at);
    const cur = k >= 0 ? inPlan[k] : m;
    const jt = k >= 0 ? moodTimes.find((x) => x.i === k) : null;
    let t = jt?.at ?? null;
    if (t == null) { const pt = parseTime(m.at); if (pt.kind === 'cue') { const c = cueSeconds(pt, cues); if (!c.error) t = c.sec; } }
    const sound = !jt ? (cur.sfx === null ? '不出聲' : cur.sfx || MOOD_KINDS[cur.kind]?.sound || '—') : jt.sfx || (jt.off ? '不出聲' : `讓位（${jt.dropped || MOOD_KINDS[cur.kind]?.sound || '—'}）`);
    // 寫了 zoom 但 build 推不到（講者被整張幕蓋住、同一分鐘已經推近、太靠近接點）→ 照實寫，不要讓人以為有推
    const zoom = cur.zoom === true ? (jt && !jt.zoom ? 'lost' : true) : false;
    rows.push({ at: m.at, kind: cur.kind, t, sound, zoom, on: k >= 0 });
  }
  const nOf = (a) => Number(String(a).match(/^#(\d+)/)?.[1] ?? 0);
  return rows.sort((a, b) => nOf(a.at) - nOf(b.at));
}

// 把網頁改到的東西套回 plan.json。回傳改了什麼；「想換成」「補充說明」不自動做，列出來給 AI
export function applyStoryboard(md, plan, { scenes = [], specs = new Map() } = {}) {
  const doc = parseStoryboard(md);
  const next = JSON.parse(JSON.stringify(plan));
  const byId = new Map((next.scenes || []).map((s) => [s.id, s]));
  const changes = [], requests = [], unmatched = [], answers = [];
  // 作者在「需要我決定的事」的回答：不改 plan.json，印給 AI 照做
  for (const sec of doc.sections) {
    if (sec.id || !isDecideSection(sec)) continue;
    let q = null;
    for (const b of sec.blocks) {
      if (b.type === 'heading') q = null;
      else if (b.type === 'item' && b.ordered) q = [b.label, b.value].filter(Boolean).join('：');
      else if (b.type === 'item' && (b.label === '回答' || b.label === '補充說明') && String(b.value).trim()) answers.push({ q: b.label === '回答' ? q : null, text: String(b.value).trim() });
    }
  }
  for (const sec of doc.sections) {
    if (!sec.id) continue;
    const seg = byId.get(sec.id);
    if (!seg) continue;
    const item = (label) => sec.blocks.find((b) => b.type === 'item' && b.label === label);
    const text = item('畫面文字');
    if (text) {
      const fields = textFields(seg, { scenes, specs });
      const now = [...String(text.value).matchAll(/「([^」]*)」/g)].map((m) => m[1]);
      if (now.length !== fields.length) unmatched.push(`${seg.id}：畫面文字有 ${now.length} 則，plan.json 有 ${fields.length} 個欄位 → 這段請 AI 照分鏡表手動改`);
      else {
        fields.forEach((f, i) => {
          if (quote(f.value) === now[i]) return;
          setPath(seg, f.path, now[i]);
          changes.push(`${seg.id} ${f.label}：「${f.value}」→「${now[i]}」`);
        });
      }
    }
    const sfx = item('音效');
    if (sfx) {
      const v = String(sfx.value).trim().match(SFX_RE)?.[1]?.split(/[（(\s]/)[0];
      const was = sfxText(seg);
      if (v && v !== was) {
        if (v === SFX_WORD.default) delete seg.sfx;
        else if (v === SFX_WORD.none) seg.sfx = null;
        else if (typeof seg.sfx === 'object' && seg.sfx) seg.sfx = { ...seg.sfx, name: v };
        else seg.sfx = v;
        changes.push(`${seg.id} 音效：${was} → ${v}`);
      }
    }
    for (const label of ['想換成', '補充說明']) {
      const b = item(label);
      if (b && String(b.value).trim()) requests.push({ id: seg.id, label, text: String(b.value).trim() });
    }
  }
  // 金句候選：☑ 的加一段、取消的拿掉
  for (const sec of doc.sections) {
    for (const b of sec.blocks) {
      if (b.type !== 'table' || !b.head.some((h) => h.startsWith('卡上文字'))) continue;
      const iN = b.head.indexOf('句號'), iCard = b.head.findIndex((h) => h.startsWith('卡上文字')), iOn = b.head.findIndex((h) => h.startsWith('要不要'));
      b.rows.forEach((r, k) => {
        const id = `q${String(k + 1).padStart(2, '0')}`, on = /☑/.test(r.cells[iOn] || '');
        const has = next.scenes.findIndex((s) => s.id === id);
        const n = String(r.cells[iN] || '').replace(/^#/, '');
        if (on && has < 0 && /^\d+$/.test(n)) {
          next.scenes.push({ id, scene: 'quote', from: `#${n}`, to: `#${n}e`, slots: { text: r.cells[iCard] }, story: { say: '金句（使用者勾選）', why: '使用者在分鏡表勾選' } });
          changes.push(`${id} 新增金句：#${n}「${r.cells[iCard]}」`);
        } else if (!on && has >= 0) {
          next.scenes.splice(has, 1);
          changes.push(`${id} 取消金句`);
        } else if (on && has >= 0 && next.scenes[has].slots?.text !== r.cells[iCard]) {
          changes.push(`${id} 金句文字：「${next.scenes[has].slots?.text}」→「${r.cells[iCard]}」`);
          next.scenes[has].slots.text = r.cells[iCard];
        }
      });
    }
  }
  // 內容設計動畫候選：☑ 的那段改成內容設計動畫（拿掉模板、字卡欄位，構想搬到 story.idea）
  const designs = [];
  for (const sec of doc.sections) {
    for (const b of sec.blocks) {
      if (b.type !== 'table' || !b.head.includes('構想') || !b.head.some((h) => h.includes('☐'))) continue;
      const iId = b.head.indexOf('段'), iOn = b.head.findIndex((h) => h.includes('☐'));
      for (const r of b.rows) {
        const id = String(r.cells[iId] || '').trim(), on = /☑/.test(r.cells[iOn] || '');
        const k = next.scenes.findIndex((s) => s.id === id);
        if (k < 0) continue;
        const seg = next.scenes[k];
        if (on && isDesignPick(seg)) {
          if (!seg.from || !seg.to) { unmatched.push(`${id}：沒有 from／to，改不成內容設計動畫 → 請 AI 先補起訖句`); continue; }
          next.scenes[k] = toDesign(seg);
          designs.push(id);
          changes.push(`${id} 改成內容設計動畫（使用者勾選）`);
        }
      }
    }
  }
  // 情緒點：☑ 的留在 plan.json 的 moods、取消的拿掉（候選留在 _merged.json，之後勾回來找得到）
  for (const sec of doc.sections) {
    for (const b of sec.blocks) {
      if (b.type !== 'table' || !b.head.includes('綁在') || !b.head.includes('情緒')) continue;
      const iAt = b.head.indexOf('綁在'), iKind = b.head.indexOf('情緒'), iZoom = b.head.indexOf('推近'), iOn = b.head.findIndex((h) => h.includes('☐'));
      const was = Array.isArray(next.moods) ? next.moods : [];
      const out = [];
      for (const r of b.rows) {
        const at = String(r.cells[iAt] || '').replace(/`/g, '').trim(), on = /☑/.test(r.cells[iOn] || '');
        if (!at.startsWith('#')) continue;
        const old = was.find((x) => x?.at === at);
        if (on) {
          const kind = ZH_KIND[String(r.cells[iKind] || '').trim()] || old?.kind;
          if (!kind) { unmatched.push(`情緒點 ${at}：看不懂情緒「${r.cells[iKind]}」→ 請 AI 照 plan.json 的 moods 手動改`); continue; }
          out.push(old ? { ...old, kind } : { at, kind, ...(/推近|推不到/.test(r.cells[iZoom] || '') ? { zoom: true } : {}) });
          if (!old) changes.push(`情緒點：加回 ${at}（${String(r.cells[iKind]).trim()}）`);
        } else if (old) changes.push(`情緒點：取消 ${at}（${MOOD_KINDS[old.kind]?.zh || old.kind}）`);
      }
      const nOf = (m) => Number(String(m.at).match(/^#(\d+)/)?.[1] ?? 0);
      out.sort((x, y) => nOf(x) - nOf(y));
      if (JSON.stringify(out) !== JSON.stringify(was)) next.moods = out;
    }
  }
  const cueOf = (s) => Number(String(s.from || s.at || '').match(/^#(\d+)/)?.[1] ?? 0);
  next.scenes = (next.scenes || []).map((s, i) => [s, i]).sort((a, b) => cueOf(a[0]) - cueOf(b[0]) || a[1] - b[1]).map(([s]) => s);
  return { plan: Array.isArray(next.moods) ? insertMoods(next, next.moods) : next, changes, requests, unmatched, answers, designs, changed: changes.length > 0 };
}

// 鏡位腳本檔 work/designs/<id>.md：第一段「概念：」「畫面：」，後面一張 #### 動畫分鏡 表
export function parseDesign(md, id) {
  const text = String(md || '');
  const concept = (text.match(/^概念[：:]\s*(.+)$/m) || [])[1] || '';
  const picture = (text.match(/^畫面[：:]\s*(.+)$/m) || [])[1] || '';
  const at = text.indexOf(`#### 動畫分鏡 ${id}`);
  const sheet = at >= 0 ? text.slice(at).trim() : '';
  return { concept, picture, sheet };
}

export { getPath };

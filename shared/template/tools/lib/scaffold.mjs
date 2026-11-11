// 分鏡素材（build.mjs --scaffold 產生 work/分鏡素材/）：排分鏡要查的東西收成共用.md＋每章一份 chNN.md，
// 長片可以一章一個子代理同時寫草稿，不用翻 USAGE／SITUATIONS／BEATS 全文，也不用寫 script 查逐字稿。純函式，不讀檔、不寫檔。
//   scriptOutline(md)                       → [{ level: 2|3, title, first }]：講稿的 ## 章、### 小節＋底下第一句
//   alignOutline(outline, cues)             → 每一項加 n（第幾句字幕）；對不到的拿掉
//   chapterSegments(chapters, cues, { videoDur, scenes }) → 可以直接貼的章節段＋字數過長的提醒
//   situationRows(md)                       → SITUATIONS.md §3 每列的 { line, say, layout, first, beat, sem }
//   semanticTypes(md)                       → SITUATIONS.md §1「語意類型」：[{ name, say, tier }]（語意地圖用，specs/024）
//   situationQuestions(md)／animationRules(md) → 定大類的四題、情境動畫三條判準
//   beatIndex(md)                           → BEATS.md 每個拍型的行號範圍
//   sceneSnippet(scene)                     → 這個情境最少要寫的 plan.json 一段（有 <…> 佔位）
//   splitParts({ cues, outline, breaks })   → 章節切成分工單位（照字數：太長的章再切、太小的份併起來）
//   designTarget(seconds)                   → 這一段時間估計幾段內容設計動畫候選（還不知道段數時用）
//   designTargetOf(n)、designEligible(seg)  → 寫好草稿後照實際段數算：約三成的段（media、章節段不算）
//   renderCommon(input)、renderSnippets(input)、renderPart(part, input) → 共用.md、寫法.md、chNN.md
import { normText, textWidth } from './time.mjs';
import { moodCandidates, moodTarget, MOOD_KINDS } from './moods.mjs';

export const CHAPTER_MIN_VIDEO = 180;   // 不到 3 分鐘的影片不用 01 章節轉場
const SKIP_LINE = (l) => l.startsWith('>') || l.startsWith('<!--') || l.includes('`') || /^[-*_]{3,}$/.test(l) || /^[（(].*[）)]$/.test(l);

export function scriptOutline(md) {
  const out = [];
  let fence = false, pending = [];   // ## 後面緊接 ### 很常見：兩個標題都從同一句開始
  for (const raw of String(md ?? '').replace(/^﻿/, '').split(/\r?\n/)) {
    const l = raw.trim();
    if (/^(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence || !l) continue;
    const m = l.match(/^(##|###)\s+(.+)$/);
    if (m) { const h = { level: m[1].length, title: m[2].trim(), first: null }; out.push(h); pending.push(h); continue; }
    if (l.startsWith('#')) { pending = []; continue; }
    if (pending.length && !SKIP_LINE(l)) { for (const h of pending) h.first = l; pending = []; }
  }
  return out.filter((x) => x.first);
}

export function alignOutline(outline, cues) {
  let from = 0, prev = null;
  const out = [];
  for (const x of outline) {
    if (prev && prev.first === x.first) { out.push({ ...x, n: prev.n }); continue; }   // 章與第一個小節同一句
    const key = normText(x.first).slice(0, 6);
    const k = key ? cues.findIndex((c, j) => j >= from && normText(c.text).includes(key)) : -1;
    if (k < 0) continue;
    from = k + 1;
    prev = { first: x.first, n: cues[k].n };
    out.push({ ...x, n: cues[k].n });
  }
  return out;
}

const pad2 = (i) => String(i).padStart(2, '0');
const limitOf = (scene, slot) => scene?.slots?.[slot]?.max ?? null;

// 章名：講稿寫「## 章名：這一章要做什麼」時，冒號後面就是副標
function splitTitle(title) {
  const raw = String(title).trim();
  const body = raw.replace(/^第?\s*[\d一二三四五六七八九十]+\s*[章.、．]\s*/, '').trim() || raw;   // 整個標題就是「第一章」：留著
  const m = body.match(/^(.+?)[：:]\s*(.+)$/);
  return m ? { name: m[1].trim(), sub: m[2].trim() } : { name: body, sub: '' };
}

export function chapterSegments(chapters, cues, { videoDur = 0, scenes = [] } = {}) {
  const useCard = videoDur >= CHAPTER_MIN_VIDEO;
  const byKey = (k) => scenes.find((s) => s.key === k);
  const warn = [];
  const fit = (scene, slot, text, label) => {
    const max = limitOf(scene, slot);
    if (max != null && textWidth(text) > max) warn.push(`${label}「${text}」${textWidth(text)} 字，上限 ${max} → 自己縮短`);
    return text;
  };
  // 影片第一句就是某一章的開頭（## 開場）：不放章節轉場，開場的勾子要先上，不能先來一張「CHAPTER 01」；章號從下一章算起
  const numbered = chapters.filter((c) => c.n !== cues[0]?.n);
  const segs = numbered.map((c, i) => {
    const { name, sub } = splitTitle(c.title), id = `c${pad2(i + 1)}`, num = pad2(i + 1);
    if (useCard) {
      const scene = byKey('chapter');
      return { id, scene: 'chapter', at: `#${c.n}`, slots: { num, title: fit(scene, 'title', name, `${id} 章名`), sub: sub ? fit(scene, 'sub', sub, `${id} 副標`) : '<≤12 字，這一章要做什麼>' } };
    }
    const scene = byKey('chapter-tag'), minD = scene?.duration?.min ?? 3.5;
    const k = cues.findIndex((x) => x.n === c.n);
    let e = k;
    while (e < cues.length - 1 && cues[e].end - cues[k].start < minD) e++;
    return { id, scene: 'chapter-tag', from: `#${c.n}`, to: `#${cues[e].n}e`, slots: { num, name: fit(scene, 'name', name, `${id} 章名`) } };
  });
  return { segs, warn, useCard };
}

export function situationRows(md) {
  const lines = String(md ?? '').split(/\r?\n/), rows = [];
  let on = false;
  lines.forEach((l, i) => {
    if (/^## 3\b/.test(l) || /^## 3\./.test(l)) { on = true; return; }
    if (/^## /.test(l)) on = false;
    if (!on || !l.startsWith('| ')) return;
    const cells = l.replace(/^\|\s*/, '').replace(/\s*\|\s*$/, '').split(/\s+\|\s+/);
    if (cells[0] === '句子長這樣') return;
    rows.push({ line: i + 1, say: cells[0] ?? '', layout: cells[1] ?? '', first: cells[2] ?? '', beat: cells[3] ?? '', avoid: cells[7] ?? '', sem: cells[9] ?? '' });
  });
  return rows;
}

// SITUATIONS.md §1「### 語意類型」那張表：語意地圖的封閉清單（名稱、什麼樣的句子、預設級）
export function semanticTypes(md) {
  const lines = String(md ?? '').split(/\r?\n/), out = [];
  const a = lines.findIndex((l) => /^### 語意類型/.test(l));
  if (a < 0) return out;
  for (let i = a + 1; i < lines.length && !/^#{2,3} /.test(lines[i]); i++) {
    if (!lines[i].startsWith('| ')) continue;
    const c = lines[i].replace(/^\|\s*/, '').replace(/\s*\|\s*$/, '').split(/\s+\|\s+/);
    if (c[0] === '語意' || /^-+$/.test(c[0])) continue;
    out.push({ name: c[0], say: c[1] ?? '', tier: (c[2] ?? 'B').trim() });
  }
  return out;
}

// SITUATIONS.md §1 第 1 步的四題（定大類）
export function situationQuestions(md) {
  const lines = String(md ?? '').split(/\r?\n/);
  const a = lines.findIndex((l) => /^1\. 分鏡表每一段/.test(l)), b = lines.findIndex((l, i) => i > a && /^2\. /.test(l));
  return a < 0 || b < 0 ? [] : lines.slice(a, b).map((l) => l.trim());
}

// style.md「情境動畫優先」的三條判準（退到字卡只能用這三條當理由）
export function animationRules(md) {
  const lines = String(md ?? '').split(/\r?\n/);
  const a = lines.findIndex((l) => /^## 情境動畫優先/.test(l));
  if (a < 0) return [];
  const out = [];
  for (let i = a + 1; i < lines.length && !/^## /.test(lines[i]); i++) {
    if (/^\s*- /.test(lines[i])) out.push(lines[i]);
    if (out.length >= 5) break;
  }
  return out;
}

export function beatIndex(md) {
  const lines = String(md ?? '').split(/\r?\n/), heads = [];
  lines.forEach((l, i) => { if (/^##+ /.test(l)) heads.push({ line: i + 1, text: l.replace(/^#+\s*/, '') }); });
  const ranged = heads.map((h, i) => ({ ...h, end: (heads[i + 1]?.line ?? lines.length + 1) - 1 }));
  return ranged.filter((h) => /^[A-I] /.test(h.text) || /^1\. /.test(h.text) || /^5\.[1-4] /.test(h.text));
}

const holder = (name, d) => {
  if (d.type === 'number') return '01';
  if (d.type === 'icon') return '<英文圖示名，例 smartphone>';
  if (d.type === 'illus') return '<畫廊元件>';
  return d.max != null ? `<≤${d.max} 字>` : `<${d.label || name}>`;
};

export function sceneSnippet(scene) {
  const slots = {};
  for (const [k, d] of Object.entries(scene.slots || {})) {
    if (!d.required) continue;
    if (d.type === 'list') {
      const item = d.item || { text: { type: 'text' } };
      const one = {};
      for (const [fk, fd] of Object.entries(item)) if (fd.required || fd.type === 'text' || fd.type === 'rich' || fd.type == null) one[fk] = holder(fk, fd);
      for (const [fk, fd] of Object.entries(item)) if (fd.type === 'icon' && fd.required) one[fk] = holder(fk, fd);
      const wholeList = /^\{\{\w+\}\}$/.test(String(scene.lists?.[k]?.at ?? ''));   // 整欄一起進（fs-compare）：時間寫在 beats
      slots[k] = Array.from({ length: Math.max(1, d.min ?? 1) }, () => (wholeList ? { ...one } : { ...one, at: '#N@詞' }));
    } else slots[k] = holder(k, d);
  }
  const beats = Object.fromEntries(Object.entries(scene.beats || {}).filter(([, b]) => /綁/.test(b.label || '')).map(([k]) => [k, '#N@詞']));
  const seg = scene.bindsSrt === false ? { id: 's01', scene: scene.key, at: '#N' } : { id: 's01', scene: scene.key, from: '#N', to: '#Me', anchor: '<起點那句的一小段原文>' };
  seg.slots = slots;
  if (Object.keys(beats).length) seg.beats = beats;
  return JSON.stringify(seg);
}

const FAMILY_LAYOUT = { chapter: '全幕', fullscreen: '子母畫面', panel: '半畫面', edge: '疊加', 'lower-third': '疊加' };
const cut = (s, n) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const clock = (t) => { const r = Math.round(t * 10) / 10, m = Math.floor(r / 60); return `${m}:${(r - m * 60).toFixed(1).padStart(4, '0')}`; };
const cell = (s) => String(s).replace(/\|/g, '｜').replace(/\s+/g, ' ').trim();
const rangeOf = (r) => (Array.isArray(r) ? r : [r.start, r.end]);

// 分章（specs/024）：照字數切，不照秒數：子代理要讀懂的是字，語速快慢不該改變一份的份量（數字定義在 shared/style.md「分章」）
export const PART_CHARS = 1000;      // 一份最多約 1,000 字（去標點、空白，約 13 段畫面）：比較弱的模型一份也填得完（2026-11-11 mmx 實測：868 字 3 次都填完，1,956 字 15 次只填完 1 次）
export const PART_MERGE_MAX = 1300;  // 太小的份併到相鄰那份，併完最多 1,300 字（多一點比多派一個子代理划算）
export const PART_MIN_CHARS = 300;   // 不到 300 字的份併到相鄰那份（一份就要一個子代理，太小不划算）
export const DESIGN_SHARE = 0.3;  // 內容設計動畫候選：約三成的段（其他七成套模板）
const SEG_SECONDS = 10;           // 估算用：一段平均約 10 秒（--scaffold 還不知道段數）
export const charsOf = (text) => String(text ?? '').replace(/[\s\p{P}\p{S}]/gu, '').length;

export const designTarget = (seconds) => (seconds < 60 ? 0 : Math.max(1, Math.round((seconds / SEG_SECONDS) * DESIGN_SHARE)));
export const designEligible = (s) => s.type !== 'media' && !['chapter-tag', 'speaker'].includes(s.scene);
export const designTargetOf = (n) => (n < 3 ? 0 : Math.max(1, Math.round(n * DESIGN_SHARE)));
// 上限：一段內容設計動畫比模板多用很多額度（實測 30 分鐘片首讀多 3 萬字、累積多 71 萬字），超過就挑最值得的
export const designCap = (target) => (target ? target + Math.max(1, Math.round(target / 3)) : 0);

// 章節切成分工單位：有 ## 照章切；一份超過 PART_CHARS 字就切成差不多大的幾份，切點先挑小節（###）開頭，再挑剪乾淨時剪過停頓的地方（breaks：講者本來就停了一下，不會切在一句話中間），都沒有才挑停頓最長的地方；
// 最後把不到 PART_MIN_CHARS 字的份併到相鄰那份（挑併起來比較小的一邊，併完不超過 PART_MERGE_MAX）
export function splitParts({ cues, outline = [], breaks = [] }) {
  if (!cues.length) return [];
  const chapters = outline.filter((x) => x.level === 2);
  const bounds = [];
  const idxOf = (n) => cues.findIndex((c) => c.n === n);
  if (chapters.length) {
    const first = idxOf(chapters[0].n);
    if (first > 0) bounds.push({ a: 0, title: '開場', chapter: null });
    // 第一句就是章節開頭（## 開場）：不放章節轉場，章號從下一章算起
    const intro = first === 0;
    chapters.forEach((c, i) => bounds.push({ a: idxOf(c.n), title: splitTitle(c.title).name, sub: splitTitle(c.title).sub, chapter: intro ? (i || null) : i + 1, chapterN: intro && !i ? null : c.n }));
  } else bounds.push({ a: 0, title: '', chapter: null });
  const cum = [0];
  for (const c of cues) cum.push(cum[cum.length - 1] + charsOf(c.text));
  const span = (a, z) => cum[z + 1] - cum[a];
  const sectionAt = outline.filter((x) => x.level === 3).map((x) => idxOf(x.n)).filter((k) => k > 0);
  const cutAt = (a, last) => {
    const total = span(a, last), goal = total / Math.ceil(total / PART_CHARS);
    let best = -1, d = Infinity;
    for (const k of sectionAt) {
      if (k <= a || k > last) continue;
      const s = span(a, k - 1);
      if (s < goal * 0.6 || s > PART_CHARS || Math.abs(s - goal) >= d) continue;
      d = Math.abs(s - goal); best = k;
    }
    if (best > 0) return best;
    const inWindow = (k) => { const s = span(a, k - 1); return s >= goal - 300 && s <= Math.min(PART_CHARS, goal + 300); };
    for (let k = a + 1; k <= last; k++) {
      if (!inWindow(k) || !breaks.some((t) => t >= cues[k - 1].end - 0.3 && t <= cues[k].start + 0.3)) continue;
      const far = Math.abs(span(a, k - 1) - goal);
      if (far < d) { d = far; best = k; }
    }
    if (best > 0) return best;
    let gap = -1;
    for (let k = a + 1; k <= last; k++) {
      if (!inWindow(k)) continue;
      const g = cues[k].start - cues[k - 1].end;
      if (g > gap) { gap = g; best = k; }
    }
    return best;
  };
  const raw = [];
  bounds.forEach((b, i) => {
    const last = i + 1 < bounds.length ? bounds[i + 1].a - 1 : cues.length - 1;
    let a = b.a, piece = 1;
    while (span(a, last) > PART_CHARS) {
      const k = cutAt(a, last);
      if (k < 0) break;
      raw.push({ ...b, a, z: k - 1, piece: piece++ });
      a = k;
    }
    raw.push({ ...b, a, z: last, piece: piece > 1 ? piece : 0 });
  });
  let list = raw.map((p) => ({
    a: p.a, z: p.z, chapter: p.chapter ?? null,
    titles: [p.title ? `${p.title}${p.piece ? `（${p.piece}）` : ''}` : ''],
    chapters: p.chapter && p.chapterN && p.piece <= 1 ? [{ chapter: p.chapter, chapterN: p.chapterN, title: p.title, sub: p.sub || '' }] : [],
  }));
  for (;;) {
    const i = list.findIndex((p, k) => span(p.a, p.z) < PART_MIN_CHARS && [list[k - 1], list[k + 1]].some((q) => q && span(Math.min(p.a, q.a), Math.max(p.z, q.z)) <= PART_MERGE_MAX));
    if (i < 0) break;
    const size = (q) => (q ? span(Math.min(list[i].a, q.a), Math.max(list[i].z, q.z)) : Infinity);
    const j = size(list[i - 1]) <= size(list[i + 1]) ? i - 1 : i + 1;
    const [x, y] = j < i ? [list[j], list[i]] : [list[i], list[j]];
    list.splice(Math.min(i, j), 2, { a: x.a, z: y.z, chapter: x.chapter ?? y.chapter, titles: [...x.titles, ...y.titles], chapters: [...x.chapters, ...y.chapters] });
  }
  return list.map((p, i) => {
    const key = `ch${String(i + 1).padStart(2, '0')}`;
    const start = cues[p.a].start, end = cues[p.z].end, ch = p.chapters[0];
    const names = p.titles.filter(Boolean);
    return { key, code: String(i + 1).padStart(2, '0'), title: names.length ? names.join('＋') : `第 ${i + 1} 份`, chapter: ch?.chapter ?? p.chapter, chapterN: ch?.chapterN ?? null, chapters: p.chapters, sub: ch?.sub || '', firstN: cues[p.a].n, lastN: cues[p.z].n, a: p.a, z: p.z, start, end, seconds: end - start, chars: span(p.a, p.z), target: designTarget(end - start) };
  });
}

const notesOf = (notes) => (Array.isArray(notes) ? notes : []);

// 素材候選：筆記裡的關鍵字對到哪一句就列在那一句。少見的詞比常見的詞準；每句、每一份都有配額，錄影和圖片分開算（圖片多的時候錄影才不會被擠掉）
const normKw = (s) => String(s ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
export const ASSET_QUOTA = { perCue: { video: 2, image: 1 }, perMoment: 2, video: (sec) => Math.max(8, Math.ceil(sec / 30)), image: (sec) => Math.max(6, Math.ceil(sec / 60)) };
export function assetsFor(part, cues, notes) {
  const moments = [];
  for (const n of notesOf(notes)) {
    for (const m of (n.moments?.length ? n.moments : [n])) {
      const kws = [...new Set((m.keywords || []).map(normKw).filter(Boolean))];
      if (kws.length) moments.push({ file: n.file, from: m.from ?? null, to: m.to ?? null, what: m.what || n.what || n.summary || '', kws, kind: String(n.file).startsWith('assets/images/') ? 'image' : 'video' });
    }
  }
  if (!moments.length) return [];
  const df = new Map();
  for (const m of moments) for (const k of m.kws) df.set(k, (df.get(k) || 0) + 1);
  const hits = [];
  for (let i = part.a; i <= part.z; i++) {
    const text = normKw(cues[i].text);
    moments.forEach((m, order) => {
      const hit = m.kws.filter((k) => text.includes(k));
      if (hit.length) hits.push({ n: cues[i].n, m, order, hit, score: hit.reduce((v, k) => v + Math.min(k.length, 4) / Math.sqrt(df.get(k)), 0) });
    });
  }
  hits.sort((a, b) => b.score - a.score || a.n - b.n || a.order - b.order);
  const quota = { video: ASSET_QUOTA.video(part.seconds ?? 0), image: ASSET_QUOTA.image(part.seconds ?? 0) };
  const used = new Map(), perCue = new Map(), total = { video: 0, image: 0 }, picked = [];
  for (const h of hits) {
    const k = h.m.kind, c = perCue.get(h.n) || { video: 0, image: 0 };
    if (total[k] >= quota[k] || c[k] >= ASSET_QUOTA.perCue[k] || (used.get(h.m) || 0) >= ASSET_QUOTA.perMoment) continue;
    total[k]++; c[k]++; perCue.set(h.n, c); used.set(h.m, (used.get(h.m) || 0) + 1);
    picked.push(h);
  }
  const byCue = new Map();
  for (const h of picked.sort((a, b) => a.n - b.n || (a.m.kind === 'video' ? -1 : 1))) { if (!byCue.has(h.n)) byCue.set(h.n, []); byCue.get(h.n).push(h); }
  return [...byCue.entries()].map(([n, items]) => ({ n, items }));
}

// input：{ project, format:{ label, portrait }, videoDur, cues, scriptMd, plan, scenes(含 summary), fillSpecs, situationsMd, beatsMd, styleMd, voiceOnly, assets:{ screen, images }, notes, hasCamera, kinds }
export function renderCommon(input) {
  const { project, format, videoDur, cues, plan = {}, situationsMd, beatsMd, voiceOnly = [], assets = { screen: 0, images: 0 }, notes = [], hasCamera = true, kinds = '', parts = [] } = input;
  const L = [];
  L.push(`# 分鏡素材（共用）：${project}（build.mjs --scaffold 產生，不要手改；字幕改過、工作區更新過都要重跑）`, '');
  L.push('排分鏡要查的東西都在這份和你那一章的 `chNN.md`。**照這兩份寫，不要整份讀 USAGE／SITUATIONS／BEATS，也不要寫 script 查逐字稿或秒數**；這裡沒寫的才照最後一節找那幾行。', '');
  L.push('## 1. 這支影片', '');
  L.push(`- 版式：${format?.label ?? '—'}；長度 ${clock(videoDur)}（${cues.length} 句字幕），分成 ${parts.length} 份寫`);
  L.push(`- 主軌：${kinds || (hasCamera ? '有講者' : '只有聲音')}${hasCamera ? '' : '。**沒有講者**：沒有疊加、子母畫面，每一段都要有畫面（media 或不透明全幕），全畫面段自動用全寬版型，字卡（06–15）不能用'}`);
  if (hasCamera) L.push(`- 講者框：${plan.speakerBox ? JSON.stringify(plan.speakerBox) : '還沒有 → 先跑 qc.mjs speaker --write'}；構圖：${plan.frame ? JSON.stringify(plan.frame) : '不裁切'}`);
  L.push(`- 章節：${videoDur >= CHAPTER_MIN_VIDEO ? `滿 ${CHAPTER_MIN_VIDEO} 秒，章節起點用 01 章節轉場（業配段不放）` : `不到 ${CHAPTER_MIN_VIDEO} 秒，不用 01；章節第一句放一段 02 章節角標（綁那句到下一句，例 \`#1\`–\`#2e\`）`}；\`chNN.md\` 有「章節段」就照第 7 節貼，不用自己寫。01、02 是情境代號，不是章號（章號寫在章節段的 \`slots.num\`，第一章是 01）；之後角標 build 自動常駐，不用再排；講稿沒有 \`##\` 章名就自己取 ≤ 10 字的章名，寫進 decide`);
  const sp = input.speaker;
  if (input.hasCamera) L.push(sp?.state === 'set' ? `- 講者：${sp.name}（14 講者介紹一集只排一次，只有第一份排，綁自我介紹那幾句；name、titles 不用寫，自動帶入）` : sp?.state === 'off' ? '- 講者：使用者不要講者介紹，不要排 14' : '- 講者：還沒設定。14 講者介紹一集只排一次，只有第一份排，綁自我介紹那幾句；name、titles 不要寫也不要編（設定後自動帶入），在 decide 寫「講者姓名、頭銜待確認」');
  L.push(`- 素材：螢幕錄影 ${assets.screen} 支、圖片 ${assets.images} 張${assets.screen || assets.images ? '（第 5 節）' : ''}`);
  if (input.prefs?.length) L.push(`- 使用者的偏好（每一集都照做；和下面的規則衝突時照這幾條）：${input.prefs.map((t, i) => `（${i + 1}）${t}`).join('；')}`);
  L.push(voiceOnly.length ? `- 只有聲音的區間（一定要被 media 段或不透明全幕蓋住）：${voiceOnly.map((r) => { const [a, b] = rangeOf(r); return `${clock(a)}–${clock(b)}`; }).join('、')}` : '- 只有聲音的區間：無');
  if (voiceOnly.length && hasCamera) L.push('- 這些區間沒有講者：不能用疊在講者上的字卡（06–15）和疊加的模板，全畫面段自動用全寬版型，內容設計動畫用全螢幕畫布');
  L.push('');

  L.push('## 2. 怎麼選：三條路', '');
  L.push('1. **有對得上的錄影或圖片** → media 段（第 5 節）。', '2. **內容設計動畫**（第 4 節）：這段值得專門為它設計畫面。', '3. **模板**：字卡與模板動畫，工具直接產出，不用另外做動畫。**相鄰兩段不要用同一個模板**（例：兩段 `x-process` 連著），換一個或併成一段。選模板只看第 3 節的對照表；寫法在 `寫法.md`，**寫完大綱、填骨架時才查，要哪一個就查哪一個，不用整份讀**：`build.mjs --project <專案> --spec x-process`（字卡寫 key，例 `key-point`）。', '');
  const questions = situationQuestions(situationsMd), rules = animationRules(input.styleMd);
  if (questions.length) L.push('定大類的四題：', '', ...questions, '');
  if (rules.length) L.push('退到字卡只能用這幾條當理由（「字卡比較簡單」「時間不夠」不是理由）：', '', ...rules, '');

  L.push('## 3. 情境對照表（句子對到哪一列就用它的「首選」）', '');
  L.push('要看「次選」「不要用在」：讀 `shared/template/SITUATIONS.md` 那一行（第一欄是行號），不用讀別行。', '');
  L.push('| 行 | 句子長這樣 | 首選 |', '|---|---|---|');
  for (const r of situationRows(situationsMd)) L.push(`| ${r.line} | ${cell(cut(r.say, 46))} | ${cell(cut(r.first, 34))} |`);
  L.push('');
  if (voiceOnly.length) {
    L.push('**沒有講者的句子**（`chNN.md` 開頭有列）不能用下方字卡和 12、13、14，底下是黑的。照這張換：', '');
    L.push('| 原本想用 | 換成 |', '|---|---|');
    L.push('| 06 一般字卡（定義、比喻） | `x-metaphor`、`x-callout` |');
    L.push('| 07 重點字卡、15 金句 | 字卡動態加 `"bg": "light"`（38 螢光筆、03 印章、27 打字機） |');
    L.push('| 08 Step 字卡 | `x-process`、04c `fs-flow` |');
    L.push('| 09 QA 字卡 | 字卡動態 26 翻轉卡片加 `"bg": "light"` |');
    L.push('| 10 Tips、11 總結、13 標題條列 | 04a `fs-list`（寫 `visual`）、`x-checklist` |');
    L.push('| 12 關鍵詞 | 04a `fs-list`、04b `fs-compare` |');
    L.push('');
  }

  L.push('## 4. 內容設計動畫候選（使用者在停點 ③ 勾了才做）', '');
  L.push('內容設計動畫是設計師子代理從空白畫布專門為一段設計的畫面，質感最好，但一段要多花不少時間，所以**先照常套模板或字卡，再把值得設計的段標成候選**：在那段的 `story` 加 `designIdea`（一句話構想）和 `designWhy`（為什麼值得設計）。使用者在分鏡表勾了，工具才把那段換成內容設計動畫；沒勾就用你寫的模板，所以模板那部分一樣要寫完整。', '');
  L.push('什麼時候標候選：親身經驗或小故事、比喻、因果與轉折（以前怎樣、後來發現）、抽象的道理、情緒高點、這集最想讓人記住的畫面。**只是在條列、走流程的段落不用標。**判斷方式：把字幕遮起來只看畫面，能不能看懂在講什麼；模板做不到就標。', '');
  L.push('```json', '{"id":"s0305","scene":"key-point","from":"#N","to":"#Me","anchor":"<起點那句的一小段原文>","slots":{…照模板寫完整…},"story":{"say":"<講解在講什麼>","why":"<為什麼用這個模板>","designIdea":"<一句話：畫面上發生什麼事、為什麼這樣畫。不要寫模板名稱>","designWhy":"<為什麼值得設計>"}}', '```', '');
  L.push(`哪幾段是候選：**照語意地圖上的 A**（第一回合各份提名、主代理全片挑好的，\`work/drafts/<份>.map.md\` 第 3 欄寫 A 的那幾行），不用自己再挑、不用湊數；覺得地圖漏了值得設計的，寫進 decide。段長至少 6 秒、講了 2 句以上才放得下（要有 \`from\`、\`to\`）。相鄰的候選不要用同一種畫面。不要自己寫 \`"design": true\`：那是使用者勾了之後工具換的。`, '');

  L.push('## 5. 螢幕錄影、圖片（media）', '');
  L.push('```json', '{"id":"m0301","type":"media","src":"assets/screen/<檔名>","from":"#N","to":"#Me","anchor":"<起點那句的一小段原文>","in":<素材第幾秒>}', '```', '');
  L.push('變速、定格、紅框、箭頭、運鏡、打碼的寫法：`node shared/template/tools/build.mjs --project projects/<專案> --spec media`。每個 media 段至少一個標註或運鏡。', '');
  if (assets.screen || assets.images) {
    L.push('**找素材照這個順序，不用整支看、不用一張一張開：**', '');
    L.push('1. 這一份可能對得上的素材列在 `chNN.md` 的「素材候選」（關鍵字對到哪一句）。', '2. 錄影的 `in`、`retime` 的 `src`、框都從那支的 `work/media/<檔名>/events.md` 抄：哪一秒切頁、開視窗、哪一塊變了、哪裡在等（可以快轉）、哪裡在捲都列好了。', '3. 候選沒有對到的：總表 `work/media/index.md`；找關鍵字 `grep -l "<詞>" work/media/notes/*.json`；要看畫面才開那支的 sheet（圖片 `work/media/images/`）。', '');
    if (!notesOf(notes).length) L.push('素材還沒盤點（`work/media/notes/` 是空的）：先照 `auto-edit-screen` 步驟 1 寫筆記。', '');
  }

  L.push('## 6. 時間怎麼寫', '');
  L.push('**秒數 build 自己算，不要查 `transcript.json`、不要自己算秒數。** 寫字幕裡有的詞就好，檢查對不上會告訴你改哪裡。', '**模板的「時間下限」（第一拍離段頭、拍與拍、最後一拍到段尾）也不用先算**：照講到的詞綁，`--check-draft` 用實際時間檢查，哪一拍太近、哪段太短會直接說，再照 → 改（同一句的併一拍、少一拍、段頭往前提）。字幕前面的時間只用來看段大概多長。', '');
  L.push('| 寫法 | 意思 |', '|---|---|', '| `#N`／`#Ne` | 第 N 句的起點／結尾 |', '| `#N+0.3`、`#Ne-0.2` | 再加減秒數 |', '| `#N@詞` | 第 N 句裡講到這個詞的時間（卡片主文字、每條項目、動畫站都綁這個） |', '| `+1.2` | 本段起點之後 1.2 秒（只能用在 at、beats） |', '');
  L.push('段的 `from` 綁這段第一句；JSON 不能有註解、最後一項後面不能有逗號。02 章節角標可以和別段重疊，不用接縫；其他段（含 14 講者介紹）一段接一段，不重疊（這段的 `to` 寫下一段的 `from`）。', '');

  L.push('## 7. 草稿格式', '');
  L.push('每一章寫一份 `work/drafts/chNN.json`，`story` 每段都要有（分鏡表由工具從這裡產生，不用另外寫）：', '');
  L.push('```json', '{"chapter":"03","segments":[{"id":"s0301","scene":"key-point","from":"#N","to":"#Me","anchor":"…","slots":{"key":"…"},"beats":{"keyAt":"#N@詞"},"story":{"say":"講解在講什麼","why":"為什麼這樣呈現"}}],"icons":{"剪輯清單":"scissors"},"quotes":[{"n":42,"text":"原句","card":"卡上文字（≤ 14 字）","mood":"正"}],"moods":[{"at":"#N@詞","kind":"pain"},{"at":"#M@詞","kind":"turn","zoom":true}],"decide":["拿不定、要使用者決定的事"]}', '```', '');
  L.push('骨架第一次填：Read 一次整份、填好用 Write 一次寫回（`auto` 格和其他欄位原樣保留）。`chNN.md` 有「章節段」就原樣貼進 segments 最前面（大綱不寫它；之後再跑 `--outline` 會洗掉，要重貼）。', '寫完先驗這一份（不會被別章影響）：`node shared/template/tools/build.mjs --project projects/<專案> --check-draft chNN`。之後只用 Edit 改它點名的那幾格。✖ 全修。⚠ 只修一輪：照 → 用 Edit 改那幾格（不要整份重寫），再跑同一條檢查一次就停，留下的 ⚠ 寫進 decide 或回報。印「通過」或「可以交件」都算過關。同一個 ✖ 改 2 次還在，停下來回報指令和 ✖ 原文。', '');
  L.push('金句只放 `quotes`（每份最多 2 則，挑最像翻轉句的），不要排成 15 金句字卡段（使用者勾了才上）；那幾句照常排在一般的段裡，和 quotes 重複沒關係。`mood` 寫 正、負、中 其中一個。同一個物件全集用同一個圖示：`icons` 寫你用的對應；圖示名寫錯 `--check-draft` 會列最接近的，不用先確認。', '');
  L.push(`**情緒點寫 \`moods\`**：音效照講者的情緒放，不照模板。挑講者情緒最強的那個詞，寫 \`{ "at": "#N@詞", "kind": "…" }\`，\`kind\` 只有五種：${Object.entries(MOOD_KINDS).map(([k, v]) => `\`${k}\` ${v.zh}（${v.sound}）`).join('、')}。約每分鐘 1 個（\`chNN.md\` 寫了這一份要幾個），工具會照強弱取捨、對齊詞的開口、把同一分鐘模板的預設音效拿掉，你不用算秒數也不用管上限。金句、反轉、數字落定那一下可以加 \`"zoom": true\`（講者畫面爆衝推近，約每分鐘最多 1 次），只在講者露臉的時候有效。`, '');

  L.push('## 8. 這裡沒寫才去查', '');
  L.push('| 要查什麼 | 去哪裡 |', '|---|---|');
  const six = String(situationsMd ?? '').split(/\r?\n/).findIndex((l) => /^## 6\b|^## 6\./.test(l));
  if (six >= 0) L.push(`| 整集看一次（開場三拍、前後呼應、判決句） | \`shared/template/SITUATIONS.md\` 第 ${six + 1} 行起 |`);
  L.push('| 結尾配樂、節奏、調光這些第一層欄位（outro、rhythm、look） | 不在草稿寫（合併只收 segments、icons、quotes、moods、decide）；要配就寫進 decide，主代理處理 |', '| 版面、字數、音效的規則 | `shared/style.md` 對應那一節 |', '');
  void beatsMd;
  return `${L.join('\n')}\n`;
}

// 寫法.md：每種字卡、每支模板動畫一節，開頭固定「**名稱**」，要哪個 grep 哪個
export function renderSnippets(input) {
  const { format, fillSpecs = [] } = input;
  const scenes = (input.scenes || []).filter((s) => !(format?.portrait && s.portrait === 'none'));
  const L = ['# 字卡與模板動畫的寫法（build.mjs --scaffold 產生）', '', '要哪一個查哪一個：`node shared/template/tools/build.mjs --project projects/<專案> --spec <名稱>`（例 `key-point`、`x-process`）。', ''];
  L.push('段的起訖可以切在句中：`"from": "#14@手機畫面"`、`"to": "#32@遇到"`；`#Ne` 是第 N 句結尾。卡片的 `beats` 綁卡上文字裡最先講到的詞。', '');
  L.push('**media**：螢幕錄影、圖片。一段講一個操作，至少一個標註或運鏡。時間寫法 `#N`、`#N@詞`、`#Ne`、`+3`（本段起點後 3 秒）。', '');
  L.push('```json', '{"id":"m0301","type":"media","src":"assets/screen/<檔名>","from":"#20","to":"#26e","anchor":"<起點那句的一小段原文>","in":8}', '```', '');
  L.push('先看 `work/media/<檔名>/events.md`：哪一秒切頁、開視窗、哪一塊變了（附框和建議的 `in`）、哪裡在等、哪裡在捲都列好了，`in`、`src`、`box` 照表抄。', '');
  L.push('時間（三選一，都不用自己算速度）：', '');
  L.push('- 同一段裡有快有慢有停（等待跳過、要點之前放慢、結果畫面停住）：`"retime":[{"at":"#20","src":8},{"at":"#21","src":19},{"at":"#22","src":31},{"at":"#24","src":31},{"at":"#26e","src":38}]`，講到 at 時錄影在第 src 秒，src 一樣＝定格。**不要拆成好幾段**：拆開運鏡和紅框會斷。');
  L.push('- 整段同一個速度：`"in":8,"out":19`（播完錄影第 8–19 秒）。');
  L.push('- 整段停在一個畫面講好幾句：`"hold":31`。', '');
  L.push('要看哪裡（`box` 是素材原尺寸的 `[x,y,w,h]`；事件表沒有的才跑 `media.mjs frame --project projects/<專案> --src "<檔名>" --at 12.5,18 --grid` 讀座標，寫好後加 `--box "x,y,w,h"` 看一次框的東西那一刻真的在畫面上）：', '');
  L.push('- 講「這一塊」→ 紅框：`"marks":[{"at":"#21","until":"#21e","box":[…]}]`；畫面會捲動時加 `"path":[{"at":"#22","box":[…]}]`。');
  L.push('- 講「這是什麼、按這個」→ 紅框加說明卡：`"callouts":[{"at":"#21","box":[…],"text":"設定"}]`。');
  L.push('- 目標很小 → 箭頭：`"arrows":[{"at":"#25","to":[x,y]}]`。字太小 → 放大鏡：`"lens":[{"at":"#26","box":[…],"zoom":2}]`。只看一塊 → 聚光燈：`"spot":[{"at":"#28","until":"#29","box":[…]}]`。');
  L.push('- 要點之前推近 → 運鏡：`"moves":[{"at":"#20","to":[…]},{"at":"#22","to":"full"}]`；說明卡、聚光燈、箭頭出現的期間不能運鏡。');
  L.push('- 一步一步的操作 → STEP 膠囊：`"steps":[{"at":"#20","text":"打開設定"}]`。');
  L.push('- 畫面露出金鑰、密碼、個資 → 打碼：`"redact":[{"box":[…]}]`（模糊燒進影片，框要蓋住那段時間它會出現的所有位置）。', '');
  L.push('圖示名是 lucide 的英文名稱（例 smartphone、laptop、video、cloud、check），寫錯 `--check-draft` 會報；找名稱：`build.mjs --project <專案> --icons 手機,雲端`。', '');
  L.push('## 字卡與全畫面', '');
  L.push('JSON 是最少要寫的欄位；`<…>` 換成內容，`#N@詞` 換成講到那個詞的句號和字幕原文裡的 2–4 個字。', '');
  for (const s of scenes) {
    const d = s.duration || {};
    L.push(`**${s.num} ${s.key}**（${s.zh}，${FAMILY_LAYOUT[s.family] ?? '疊加'}，${d.fixed != null ? `固定 ${d.fixed} 秒` : `最短 ${d.min} 秒`}）${s.when ? `：${s.when}` : ''}`, '');
    L.push('```json', sceneSnippet(s), '```');
    if (s.summary) L.push(`全部欄位（寫在 slots）：${s.summary}`);
    if (s.tone) L.push('語氣寫在段的第一層（和 slots 同層，不是 slots 裡）：`"tone": "warn"`、`"tone": "good"`');
    const rules = (s.rules || []).map((r) => r.error).filter(Boolean);
    if (rules.length) L.push(`限制：${rules.join('；')}`);
    L.push('');
  }

  const fx = (input.fx || []).filter((f) => !(format?.portrait && f.portrait === 'band'));
  if (fx.length) {
    L.push('## 字卡動態（fx）', '');
    L.push('寫法：`{"id":"s01","type":"fx","fx":29,"from":"#N","to":"#Me","vars":{"label":"做了","number":"29","unit":"支影片"}}`。`bg` 不寫＝透明疊在講者上；`dark`、`light`、`accent` 是不透明整張幕。`vars` 的值一律寫字串。透明的不能和下方字卡（06–11、13–15）同時出現。', '');
    for (const f of fx) {
      const vars = (f.vars || []).filter((v) => !['bg', 'accent'].includes(v.id)).map((v) => `${v.id}（${v.label}）`).join('、');
      L.push(`**fx ${f.id} ${f.zh}**：${f.when || ''}${f.sem?.length ? `；適合的語意：${f.sem.join('、')}` : ''}；vars：${vars || '—'}`);
    }
    L.push('');
  }

  L.push('## 模板動畫（填資料，工具直接產出，不用改 HTML）', '');
  L.push('寫了 `template`＋`slots` 就好，`from`／`to` 綁這段的第一句和最後一句。每項的 `at` 綁講到那個東西的詞。', '');
  L.push('**段太短、放不下「時間下限」時**：同一句講到的併同一拍或少一拍；段頭往前提（從前一句開始）。不要把段尾延進下一個話題。還是放不下就換字卡。', '');
  for (const f of fillSpecs) {
    L.push(`**${f.template}**（拍型 ${f.beat ?? '—'}）${f.when ? `：${f.when}` : ''}`, '');
    L.push('```json', fillSnippet(f), '```');
    const all = fillSummary(f);
    if (all) L.push(`全部欄位：${all}`);
    if (f.generator === 'scene' && input.illus?.length) L.push(`畫廊元件（illus）：${input.illus.join('、')}；螢幕類的狀態（opts.screen、state）：blank、video、play、rec、check、warn、shorts、qr、app。畫廊沒有的物件寫 \`icon\`（lucide 名稱，用 \`--icons 甲,乙\` 查），不要新畫 SVG`);
    const floor = floorLine(f.floors);
    if (floor) L.push(floor);
    L.push('');
  }

  return `${L.join('\n')}\n`;
}

// 模板檔頭的【D 下限】（audit-rules floorRules）→ 一行給寫草稿的人看；不然要等 --check-draft 報 ⚠ 才知道放不下
export function floorLine(rules) {
  if (!rules?.length) return '';
  const r1 = (v) => Math.round(v * 10) / 10;
  const open = rules.find((r) => !r.rhs && r.lhs !== 'D');
  const gaps = rules.filter((r) => r.rhs && r.lhs !== 'D').map((r) => r.k);
  const end = Math.max(0, ...rules.filter((r) => r.lhs === 'D' && r.rhs).map((r) => r.k));
  const minD = Math.max(0, ...rules.filter((r) => r.lhs === 'D' && !r.rhs).map((r) => r.k));
  const parts = [];
  if (open) parts.push(`第一拍離段頭 ≥ ${open.k} 秒`);
  if (gaps.length) { const a = Math.min(...gaps), b = Math.max(...gaps); parts.push(`拍與拍 ≥ ${a === b ? a : `${a}–${b}`} 秒`); }
  if (end) parts.push(`最後一拍到段尾 ≥ ${end} 秒`);
  const total = Math.max(r1((open?.k ?? 0) + gaps.reduce((x, y) => x + y, 0) + end), minD);
  return parts.length || minD ? `時間下限（\`--check-draft\` 會用實際時間算，不用自己算）：${parts.join('、')}${total ? `${parts.length ? '；' : ''}項目全用上時段長至少 ${total} 秒` : ''}` : '';
}

// 模板動畫的全部欄位（含選填）：寫草稿的人才知道有哪些可以用
export function fillSummary(f) {
  const lines = (f.lines || []).map((ln) => `；同一行：${(ln.slots || []).join('＋')} 加起來 ≤${ln.max}`).join('');
  return fillSummaryBody(f) + lines;
}
function fillSummaryBody(f) {
  if (f.generator === 'scene') return 'title（≤10）；parts 每個 { id, illus|icon|src|wave, opts, label ≤10, row, side, pre, stand, w, h }（也可以 { id, layout, gap, parts: […] } 疊成一組）；links ["a>b", "a-b"]；beats 每拍 { at, in, line, state, move, count, wave, check, focus, dim, sfx, peel }（state 寫 [元件 id, 原本的狀態, 換成的狀態]，例 ["b","blank","play"]＝b 的螢幕從 blank 換成 play；不換狀態就不寫）；route（路線圖）；sticker: true（貼紙風格：元件一張一張貼上，最後一拍可以寫 { at, peel: true } 整組撕走）';
  const limit = (d) => [d.required ? '必填' : '選填', d.max != null ? `≤${d.max}` : '', d.type === 'icon' ? '圖示名' : d.type === 'at' ? '#N@詞' : d.type === 'number' ? '數字' : d.type === 'enum' ? (d.options || []).join('／') : ''].filter(Boolean).join('、');
  return Object.entries(f.slots || {}).map(([k, d]) => {
    if (d.type !== 'list') return `${k}（${d.label ? `${d.label}：` : ''}${limit(d)}）`;
    const range = `${d.min ?? 1}–${d.maxItems ?? '?'} 項`;
    return `${k}（${d.label ? `${d.label}：` : ''}${d.required ? '必填' : '選填'}、${range}）每項 { ${Object.entries(d.item || {}).map(([fk, fd]) => `${fk}（${limit(fd)}）`).join(', ')} }`;
  }).join('；');
}

// 模板動畫的最少寫法（有 sample 就照它的結構，值換成佔位）
export function fillSnippet(f) {
  const holder2 = (name, d) => (d?.type === 'at' ? '#N@詞' : holder(name, d || {}));
  const slots = {};
  if (f.generator === 'scene') {
    slots.title = '<≤10 字>';
    slots.parts = [{ id: 'a', illus: '<畫廊元件>', opts: { screen: 'blank' }, label: '<≤10 字>' }, { id: 'b', illus: '<畫廊元件>', label: '<≤10 字>' }];
    slots.links = ['a>b'];
    slots.beats = [{ at: '#N@詞', in: ['a'], focus: 'a' }, { at: '#N@詞', in: ['b'], line: 'a-b', focus: 'b' }, { at: '#N@詞', state: ['b', 'blank', 'play'], focus: 'b' }];
  } else {
    for (const [k, d] of Object.entries(f.slots || {})) {
      if (!d.required) continue;
      if (d.type === 'list') {
        const one = {};
        for (const [fk, fd] of Object.entries(d.item || {})) if (fd.required) one[fk] = holder2(fk, fd);
        slots[k] = Array.from({ length: Math.max(1, d.min ?? 1) }, () => ({ ...one }));
      } else slots[k] = holder2(k, d);
    }
  }
  return JSON.stringify({ id: 'x0301', type: 'custom', template: f.template, from: '#N', to: '#Me', anchor: '<起點那句的一小段原文>', slots });
}

// 語意.md：第一回合（語意地圖）只要讀這份和自己那份 chNN.md，不讀共用.md、寫法.md
export function renderSemantic(input) {
  const { project, situationsMd, videoDur = 0, parts = [] } = input;
  const types = semanticTypes(situationsMd), target = designTarget(videoDur), cap = designCap(target);
  const L = [];
  L.push(`# 語意地圖（第一回合）：${project}（build.mjs --scaffold 產生，不要手改）`, '');
  L.push('第一回合只做一件事：讀你那份 `chNN.md` 的字幕，把句子分組、標語意和分級，寫成 `work/drafts/<份>.map.md`。**這一回合不挑模板、不讀 `共用.md`、`寫法.md`**：模板第二回合照地圖挑，工具會把每一行能用的模板縮好。', '');
  L.push('## 1. 分級：力氣花在觀眾注意力最高的地方', '');
  L.push('| 級 | 是什麼 | 畫面 |', '|---|---|---|');
  L.push('| A 亮點 | 開場、核心比喻、反轉、親身經歷或小故事、抽象的道理、這集最想讓人記住的畫面、結尾 | 內容設計動畫候選（停點 ③ 使用者勾了才做；第二回合照樣先套模板） |');
  L.push('| B 結構 | 步驟、流程、列舉、對比、數字、操作這些在講結構的句子 | 照語意套模板或螢幕錄影 |');
  L.push('| C 串場 | 轉場句、重複說明、小插曲、狀態句 | 最便宜的畫面：字卡動態（第二回合工具會照語意列兩張候選，每行不一樣，照它挑）、12 關鍵詞，或併進前後那一行（整支片不留沒有畫面的空白） |', '');
  L.push(`A 只是提名：第 5 欄寫一句理由，全片由主代理排序、挑預算內最好的（全片約 ${target} 段、最多 ${cap} 段；你這份的估計寫在 \`chNN.md\` 開頭，不用湊數）。判斷方式：把字幕遮起來只看畫面，模板做不到才提名；只是在條列、走流程的不提名。`, '');
  L.push('## 2. 語意類型（只能用這幾個名稱）', '');
  L.push('| 語意 | 什麼樣的句子 | 預設級 |', '|---|---|---|');
  for (const t of types) L.push(`| ${t.name} | ${cell(t.say)} | ${t.tier} |`);
  L.push('', '預設級是沒有特別理由時的分級；值得專門設計的任何一型都可以提名 A。金句不進地圖（第二回合寫 `quotes`）。', '');
  L.push('## 3. 地圖格式', '');
  L.push('一組句子一行：`句號範圍 | 語意 | 級 | 在講什麼 | 特徵或 A 的理由`', '');
  L.push('```', '#42–#49 | 步驟 | B | 安裝 MiniMax 的四個動作 | 項目 4', '#57–#68 | 情境／故事 | A | 把下載任務交給 AI，順便講 Git 是什麼 | 第一次看到 AI 代勞，整集的核心體驗', '#69–#71 | 轉場 | C | 下載完成 | —', '```', '');
  L.push('- 連續講同一件事的幾句併成一行：一行大約就是之後的一段畫面（通常 2–8 句），不要一句一行，也不要超過 10 句或 30 秒（話題換了就換行；`--map` 會 ⚠）。A 不要超過這一份行數的四成。', '- 行與行接起來：下一行從上一行最後一句的下一句開始；第一行從這一份第一句開始、最後一行到這一份最後一句。', '- 特徵只寫工具不知道的：幾個項目、是不是同一個主體（裝置、產品）、有沒有成對的數字；有沒有講者、有沒有素材工具知道，不用寫。', '- 對得上螢幕錄影或圖片（`chNN.md` 的「素材候選」）：語意照內容標（多半是操作），特徵寫「素材：<檔名>」。', '- 有 `work/screen-sync.json`（邊錄邊講）時，落在它的段裡的句子不用寫進地圖。', '');
  L.push(`寫完驗：\`node shared/template/tools/build.mjs --project ${project} --map <份>\`（${parts.length} 份：${parts.map((p) => p.key).join('、')}）。`, '');
  return `${L.join('\n')}\n`;
}

export function renderPart(part, input) {
  const { cues, videoDur, outline = [], voiceOnly = [], notes = [], scenes = [] } = input;
  const L = [];
  L.push(`# ${part.key}｜${part.title}（#${part.firstN}–#${part.lastN}e，${clock(part.start)}–${clock(part.end)}，${(part.seconds / 60).toFixed(1)} 分鐘）`, '');
  L.push(`你負責這一份，分兩回合（做法見 chapter-worker.md）：**第一回合**照 \`語意.md\` 寫語意地圖 \`work/drafts/${part.key}.map.md\`、跑 \`--map ${part.key}\`；**第二回合**（主代理全片校正之後）照地圖寫大綱 \`work/drafts/${part.key}.outline.md\`、跑 \`--outline ${part.key}\` 產生骨架，再填 \`work/drafts/${part.key}.json\`（格式見 \`共用.md\` 第 7 節）。段 id 開頭用 \`s${part.code}\`、\`x${part.code}\`、\`d${part.code}\`、\`m${part.code}\`，後面接兩位流水號，全片才不會撞號。`, '');
  if (part.target) L.push(`- **內容設計動畫候選**：第一回合在地圖上提名 A（這一份估計 ${part.target} 段左右，附理由；不是湊數），全片由主代理挑；第二回合只在地圖上是 A 的段寫候選構想。使用者在停點 ③ 勾了才做。`);
  const vo = voiceOnly.map(rangeOf).filter(([a, b]) => b > part.start && a < part.end);
  if (vo.length) L.push(`- **沒有講者的句子：${vo.map(([a, b]) => { const inside = cues.filter((c) => c.end > Math.max(a, part.start) && c.start < Math.min(b, part.end)); return inside.length ? `#${inside[0].n}–#${inside[inside.length - 1].n}` : `${clock(a)}–${clock(b)}`; }).join('、')}**。每一句都要被畫面蓋滿：用 media、全畫面模板（04 家族、\`layout\` 是 fullscreen 的 x-\*、有 \`bg\` 的字卡動態）或內容設計動畫（\`layout\` 寫 fullscreen）。字卡 06–15 和疊加的模板不能用，底下是黑的。有 \`work/screen-sync.json\`（邊錄邊講）時，開始時間落在它某一段 \`from\`–\`to\`（秒）裡的句子由 sync 段蓋，不用排。`);
  L.push('');
  const hits = assetsFor(part, cues, notes);
  if (hits.length) {
    const nv = hits.reduce((n, h) => n + h.items.filter((x) => x.m.kind === 'video').length, 0), ni = hits.reduce((n, h) => n + h.items.filter((x) => x.m.kind === 'image').length, 0);
    L.push(`## 素材候選（關鍵字對到的句子：錄影 ${nv} 筆、圖片 ${ni} 筆）`, '', '錄影的 `in`、`retime` 的 `src`、框從 `work/media/<檔名>/events.md` 抄。沒對到不代表沒有，`共用.md` 第 5 節有怎麼找。', '');
    const label = (x) => `${x.m.file}${x.m.from != null ? ` ${x.m.from}–${x.m.to} 秒` : ''}（${cut(x.m.what, 30)}）`;
    for (const h of hits) L.push(`- #${h.n}：${h.items.map(label).join('｜')}`);
    L.push('');
  }
  // 一份可能有好幾章（太小的章併在一起）：每章一段章節段，id 第二段起加 b、c…
  const chs = part.chapters || (part.chapter && part.chapterN ? [{ chapter: part.chapter, chapterN: part.chapterN, title: part.title, sub: part.sub }] : []);
  if (chs.length) {
    L.push(`章節段（不寫進大綱；骨架產生後原樣貼進 segments${chs.length > 1 || chs[0].chapterN !== part.firstN ? '，照句號排在那一章第一段前面' : ' 最前面'}，之後再跑 \`--outline\` 會洗掉，要重貼。那一章第一段的 \`from\` 寫同一句；章節空檔工具會處理，不用查）：`, '', '```json');
    const warn = [];
    chs.forEach((c, k) => {
      const seg = chapterSegments([{ n: c.chapterN, title: c.sub ? `${c.title}：${c.sub}` : c.title }], cues, { videoDur, scenes });
      L.push(JSON.stringify({ ...seg.segs[0], id: `c${part.code}${k ? String.fromCharCode(97 + k) : ''}`, slots: { ...seg.segs[0].slots, num: String(c.chapter).padStart(2, '0') } }));
      warn.push(...seg.warn);
    });
    L.push('```', '');
    for (const w of warn) L.push(`- ⚠ ${w}`);
    if (warn.length) L.push('');
  }
  // 情緒點候選（關鍵詞挑的提示）：挑不挑、標哪一類由寫草稿的人判斷
  const mt = moodTarget(part.seconds);
  const cand = moodCandidates(cues.slice(part.a, part.z + 1));
  L.push(`## 情緒點（\`moods\`：這一份約 ${mt.target} 個，最多 ${mt.cap} 個；推近最多 ${mt.zoomCap} 次）`, '');
  L.push(cand.length ? '關鍵詞對到的句子（只是提示：沒對到的情緒一樣可以標，對到但情緒不強的不用標）：' : '關鍵詞沒有對到句子：照講者語氣挑最強的那幾個詞。', '');
  for (const x of cand.slice(0, 15)) L.push(`- #${x.n} ${MOOD_KINDS[x.kind].zh}「${x.word}」：${cut(x.text, 28)}`);
  if (cand.length > 15) L.push(`- …還有 ${cand.length - 15} 句`);
  L.push('');
  const heads = new Map(outline.map((x) => [x.n, x]));
  // 一句一行、不用表格：長片這份少四分之一，子代理整段對話都帶著它
  L.push('## 字幕（句號就是 #N，後面是開始時間）', '');
  for (let i = part.a; i <= part.z; i++) {
    const c = cues[i], h = heads.get(c.n);
    if (h) L.push('', `${h.level === 2 ? '### 章' : '#### 小節'}：${h.title}`);
    L.push(`#${c.n} ${clock(c.start)} ${c.text}`);
  }
  L.push('');
  return `${L.join('\n')}\n`;
}

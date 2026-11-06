// 分鏡素材（build.mjs --scaffold 產生 work/分鏡素材.md）：排分鏡要查的東西收成一份，
// 不用翻 USAGE／SITUATIONS／BEATS 全文，也不用寫 script 查逐字稿。純函式，不讀檔、不寫檔。
//   scriptOutline(md)                       → [{ level: 2|3, title, first }]：講稿的 ## 章、### 小節＋底下第一句
//   alignOutline(outline, cues)             → 每一項加 n（第幾句字幕）；對不到的拿掉
//   chapterSegments(chapters, cues, { videoDur, scenes }) → 可以直接貼的章節段＋字數過長的提醒
//   situationRows(md)                       → SITUATIONS.md §3 每列的 { line, say, layout, first, beat }
//   situationQuestions(md)／animationRules(md) → 定大類的四題、情境動畫三條判準
//   beatIndex(md)                           → BEATS.md 每個拍型的行號範圍
//   sceneSnippet(scene)                     → 這個情境最少要寫的 plan.json 一段（有 <…> 佔位）
//   renderScaffold(input)                   → 整份 markdown
import { normText, textWidth } from './time.mjs';

export const CHAPTER_MIN_VIDEO = 180;   // 不到 3 分鐘的影片不用 01 章節轉場（AGENTS.md「開工」）
const SKIP_LINE = (l) => l.startsWith('>') || l.startsWith('<!--') || l.includes('`') || /^[-*_]{3,}$/.test(l) || /^[（(].*[）)]$/.test(l);

export function scriptOutline(md) {
  const out = [];
  let fence = false, cur = null;
  for (const raw of String(md ?? '').replace(/^﻿/, '').split(/\r?\n/)) {
    const l = raw.trim();
    if (/^(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence || !l) continue;
    const m = l.match(/^(##|###)\s+(.+)$/);
    if (m) { cur = { level: m[1].length, title: m[2].trim(), first: null }; out.push(cur); continue; }
    if (l.startsWith('#')) { cur = null; continue; }
    if (cur && cur.first == null && !SKIP_LINE(l)) cur.first = l;
  }
  return out.filter((x) => x.first);
}

export function alignOutline(outline, cues) {
  let from = 0;
  const out = [];
  for (const x of outline) {
    const key = normText(x.first).slice(0, 6);
    const k = key ? cues.findIndex((c, j) => j >= from && normText(c.text).includes(key)) : -1;
    if (k < 0) continue;
    from = k + 1;
    out.push({ ...x, n: cues[k].n });
  }
  return out;
}

const pad2 = (i) => String(i).padStart(2, '0');
const limitOf = (scene, slot) => scene?.slots?.[slot]?.max ?? null;

// 章名：講稿寫「## 章名：這一章要做什麼」時，冒號後面就是副標
function splitTitle(title) {
  const m = String(title).replace(/^第?\s*[\d一二三四五六七八九十]+\s*[章.、．]\s*/, '').match(/^(.+?)[：:]\s*(.+)$/);
  return m ? { name: m[1].trim(), sub: m[2].trim() } : { name: String(title).replace(/^第?\s*[\d一二三四五六七八九十]+\s*[章.、．]\s*/, '').trim(), sub: '' };
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
  const segs = chapters.map((c, i) => {
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
    rows.push({ line: i + 1, say: cells[0] ?? '', layout: cells[1] ?? '', first: cells[2] ?? '', beat: cells[3] ?? '' });
  });
  return rows;
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
  if (d.type === 'icon') return '<圖示名>';
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
      slots[k] = Array.from({ length: Math.max(1, d.min ?? 1) }, () => ({ ...one, at: '#N@詞' }));
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
const clock = (t) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
const cell = (s) => String(s).replace(/\|/g, '｜').replace(/\s+/g, ' ').trim();
const rangeOf = (r) => (Array.isArray(r) ? r : [r.start, r.end]);

// input：{ project, format:{ label, portrait }, videoDur, cues, scriptMd, plan, scenes(含 summary), customNames, situationsMd, beatsMd, voiceOnly, assets:{ screen, images } }
export function renderScaffold(input) {
  const { project, format, videoDur, cues, scriptMd, plan = {}, customNames = [], situationsMd, beatsMd, voiceOnly = [], assets = { screen: 0, images: 0 } } = input;
  const scenes = (input.scenes || []).filter((s) => !(format?.portrait && s.portrait === 'none'));
  const outline = alignOutline(scriptOutline(scriptMd), cues);
  const chapters = outline.filter((x) => x.level === 2);
  const first = chapters.length ? chapters[0].n : Infinity;
  const sections = outline.filter((x) => x.level === 3 && x.n >= first).map((x) => ({ at: `#${x.n}`, name: x.title }));
  const ch = chapterSegments(chapters, cues, { videoDur, scenes });
  const L = [];
  L.push(`# 分鏡素材：${project}（build.mjs --scaffold 產生，不要手改；字幕改過就重跑）`, '');
  L.push('排分鏡要查的東西都在這份。**照這份寫，不要整份讀 USAGE／SITUATIONS／BEATS，也不要寫 script 查逐字稿或秒數**；這裡沒寫的才照第 7 節找那一節。', '');

  L.push('## 1. 這支影片', '');
  L.push(`- 版式：${format?.label ?? '—'}；長度 ${clock(videoDur)}（${cues.length} 句字幕）`);
  L.push(`- 講者框：${plan.speakerBox ? JSON.stringify(plan.speakerBox) : '還沒有 → 先跑 qc.mjs speaker --write'}；構圖：${plan.frame ? JSON.stringify(plan.frame) : '不裁切'}`);
  L.push(`- 章節：${videoDur >= CHAPTER_MIN_VIDEO ? `滿 ${CHAPTER_MIN_VIDEO} 秒，用 01 章節轉場（業配段不放）` : `不到 ${CHAPTER_MIN_VIDEO} 秒，不用 01；章節起點放一段 02 章節角標`}；章節角標 build 自動常駐，不用另排`);
  L.push(`- 素材：螢幕錄影 ${assets.screen} 支、圖片 ${assets.images} 張${assets.screen || assets.images ? ' → 照 auto-edit-screen 配' : ''}`);
  if (voiceOnly.length) {
    L.push(`- 只有聲音的區間（一定要被 media 段或不透明全幕蓋住）：${voiceOnly.map((r) => {
      const [a, b] = rangeOf(r), inside = cues.filter((c) => c.end > a && c.start < b);
      return `${clock(a)}–${clock(b)}${inside.length ? `（#${inside[0].n}–#${inside[inside.length - 1].n}）` : ''}`;
    }).join('、')}`);
  } else L.push('- 只有聲音的區間：無');
  L.push('');

  L.push('## 2. 字幕（句號就是 plan.json 的 #N）', '');
  L.push('| #N | 時間 | 字幕 |', '|---|---|---|');
  const heads = new Map(outline.map((x) => [x.n, x]));
  for (const c of cues) {
    const h = heads.get(c.n);
    if (h) L.push(`| **${h.level === 2 ? '章' : '小節'}** | | **${cell(h.title)}** |`);
    L.push(`| #${c.n} | ${clock(c.start)} | ${cell(c.text)} |`);
  }
  L.push('');

  L.push('## 3. 可以直接貼的', '');
  if (ch.segs.length) {
    L.push('章節段（貼進 `scenes`）：', '', '```json', ...ch.segs.map((s) => `${JSON.stringify(s)},`), '```', '');
    for (const w of ch.warn) L.push(`- ⚠ ${w}`);
    if (ch.warn.length) L.push('');
  } else L.push('講稿沒有 `##` 章節（或對不到字幕）：章節自己看講解判斷，寫法照第 5 節的 chapter、chapter-tag。', '');
  if (sections.length) L.push('小節角標（貼進第一層；name 超過 12 字自己縮短）：', '', '```json', `"sections": ${JSON.stringify(sections)}`, '```', '');

  L.push('## 4. 挑情境（句子對到哪一列就用它的「首選」）', '');
  const questions = situationQuestions(situationsMd), rules = animationRules(input.styleMd);
  if (questions.length) L.push(...questions, '');
  if (rules.length) L.push('退到字卡只能用這幾條當理由（「字卡比較簡單」「時間不夠」不是理由）：', '', ...rules, '');
  L.push('要看「次選」「不要用在」：讀 `shared/template/SITUATIONS.md` 那一行（第一欄是行號），不用讀別行。', '');
  L.push('| 行 | 句子長這樣 | 版面 | 首選 | 拍型 |', '|---|---|---|---|---|');
  for (const r of situationRows(situationsMd)) L.push(`| ${r.line} | ${cell(cut(r.say, 46))} | ${cell(r.layout)} | ${cell(cut(r.first, 34))} | ${cell(r.beat)} |`);
  L.push('');

  L.push('## 5. 每種情境的 plan.json 寫法', '');
  L.push('JSON 是最少要寫的欄位；`<…>` 換成內容，`#N@詞` 換成講到那個詞的句號和字幕原文裡的 2–4 個字。', '');
  for (const s of scenes) {
    const d = s.duration || {};
    L.push(`### ${s.num} ${s.key}（${s.zh}，${FAMILY_LAYOUT[s.family] ?? '疊加'}，${d.fixed != null ? `固定 ${d.fixed} 秒` : `最短 ${d.min} 秒`}）`, '');
    if (s.when) L.push(`什麼時候用：${s.when}`, '');
    L.push('```json', sceneSnippet(s), '```', '');
    if (s.summary) L.push(`全部欄位：${s.summary}${s.tone ? '；tone: warn／good' : ''}`, '');
  }
  L.push('### 情境動畫（custom）', '');
  L.push('先複製範例：`shared/template/custom/x-<名稱>.html` → `work/hyperframes/compositions/x-<名稱>.html`；還沒改的範例 build 只 ⚠，不擋。', '');
  L.push('```json', '{"id":"x01","type":"custom","src":"compositions/x-<名稱>.html","layout":"fullscreen","from":"#N","to":"#Me","anchor":"<起點那句的一小段原文>"}', '```', '');
  if (customNames.length) L.push(`範例：${customNames.map((n) => `\`${n}\``).join('、')}`, '');
  L.push('### 螢幕錄影、圖片（media）', '');
  L.push('```json', '{"id":"m01","type":"media","src":"assets/screen/<檔名>","from":"#N","to":"#Me","anchor":"<起點那句的一小段原文>","in":0}', '```', '');

  L.push('## 6. 時間怎麼寫', '');
  L.push('**秒數 build 自己算，不要查 `transcript.json`、不要自己算秒數。** 寫字幕裡有的詞就好，`--check` 對不上會告訴你改哪裡。', '');
  L.push('| 寫法 | 意思 |', '|---|---|', '| `#N`／`#Ne` | 第 N 句的起點／結尾 |', '| `#N+0.3`、`#Ne-0.2` | 再加減秒數 |', '| `#N@詞` | 第 N 句裡講到這個詞的時間（卡片主文字、每條項目、動畫站都綁這個） |', '| `+1.2` | 本段起點之後 1.2 秒（只能用在 at、beats） |', '');
  L.push('段的 `from` 綁這段第一句；`id` 不能有 `-`，全檔唯一；JSON 不能有註解、最後一項後面不能有逗號。', '');

  L.push('## 7. 這裡沒寫才去查', '');
  L.push('| 要查什麼 | 去哪裡 |', '|---|---|');
  for (const b of beatIndex(beatsMd)) L.push(`| 動畫分鏡：${cell(b.text)} | \`shared/template/BEATS.md\` 第 ${b.line}–${b.end} 行 |`);
  const six = String(situationsMd ?? '').split(/\r?\n/).findIndex((l) => /^## 6\b|^## 6\./.test(l));
  if (six >= 0) L.push(`| 整集看一次（開場三拍、前後呼應、判決句） | \`shared/template/SITUATIONS.md\` 第 ${six + 1} 行起 |`);
  L.push('| 錄影段的 steps、moves、callouts | `shared/template/USAGE.md` 第 5 節 |', '| 第一層其他欄位（outro、rhythm、look） | `shared/template/USAGE.md` 3.2 |', '| 版面、字數、音效的規則 | `shared/style.md` 對應那一節 |', '');
  return `${L.join('\n')}\n`;
}

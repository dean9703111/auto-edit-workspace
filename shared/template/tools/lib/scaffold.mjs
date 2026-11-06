// 分鏡素材（build.mjs --scaffold 產生 work/分鏡素材/）：排分鏡要查的東西收成共用.md＋每章一份 chNN.md，
// 長片可以一章一個子代理同時寫草稿，不用翻 USAGE／SITUATIONS／BEATS 全文，也不用寫 script 查逐字稿。純函式，不讀檔、不寫檔。
//   scriptOutline(md)                       → [{ level: 2|3, title, first }]：講稿的 ## 章、### 小節＋底下第一句
//   alignOutline(outline, cues)             → 每一項加 n（第幾句字幕）；對不到的拿掉
//   chapterSegments(chapters, cues, { videoDur, scenes }) → 可以直接貼的章節段＋字數過長的提醒
//   situationRows(md)                       → SITUATIONS.md §3 每列的 { line, say, layout, first, beat }
//   situationQuestions(md)／animationRules(md) → 定大類的四題、情境動畫三條判準
//   beatIndex(md)                           → BEATS.md 每個拍型的行號範圍
//   sceneSnippet(scene)                     → 這個情境最少要寫的 plan.json 一段（有 <…> 佔位）
//   splitParts({ cues, outline, videoDur }) → 章節切成分工單位（沒有 ## 就照時間切；太長的章再切）
//   designTarget(seconds)                   → 這一段時間建議幾段內容設計動畫
//   renderCommon(input)、renderSnippets(input)、renderPart(part, input) → 共用.md、寫法.md、chNN.md
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

export const PART_MAX = 480;      // 一個分工單位最長 8 分鐘（一個子代理一次寫得完、又不用太久）
export const PART_TARGET = 300;   // 沒有章節時，大約每 5 分鐘切一份
export const DESIGN_EVERY = 120;  // 內容設計動畫：建議每 2 分鐘至少一段（建議初值）

export const designTarget = (seconds) => (seconds < 60 ? 0 : Math.max(1, Math.round(seconds / DESIGN_EVERY)));

// 在 [lo, hi] 秒之間找停頓最長的地方切開，回傳切點後第一句的索引
function bestCut(cues, from, to, lo, hi) {
  let best = -1, gap = -1;
  for (let k = from + 1; k <= to; k++) {
    if (cues[k].start < lo || cues[k].start > hi) continue;
    const g = cues[k].start - cues[k - 1].end;
    if (g > gap) { gap = g; best = k; }
  }
  return best;
}

export function splitParts({ cues, outline = [], videoDur = 0 }) {
  if (!cues.length) return [];
  const chapters = outline.filter((x) => x.level === 2);
  const bounds = [];
  const idxOf = (n) => cues.findIndex((c) => c.n === n);
  if (chapters.length) {
    const first = idxOf(chapters[0].n);
    if (first > 0) bounds.push({ a: 0, title: '開場', chapter: null });
    chapters.forEach((c, i) => bounds.push({ a: idxOf(c.n), title: splitTitle(c.title).name, sub: splitTitle(c.title).sub, chapter: i + 1, chapterN: c.n }));
  } else bounds.push({ a: 0, title: '', chapter: null });
  const parts = [];
  bounds.forEach((b, i) => {
    const last = i + 1 < bounds.length ? bounds[i + 1].a - 1 : cues.length - 1;
    // 太長就再切（章節內的切點挑停頓最長的地方）
    let a = b.a, piece = 1;
    const maxLen = chapters.length ? PART_MAX : PART_TARGET;
    while (cues[last].end - cues[a].start > maxLen * (chapters.length ? 1 : 1.3)) {
      const target = cues[a].start + maxLen * (chapters.length ? 0.75 : 1);
      const k = bestCut(cues, a, last, target - 60, target + 60);
      if (k < 0) break;
      parts.push({ ...b, a, z: k - 1, piece: piece++ });
      a = k;
    }
    parts.push({ ...b, a, z: last, piece: piece > 1 ? piece : 0 });
  });
  return parts.map((p, i) => {
    const key = `ch${String(i + 1).padStart(2, '0')}`;
    const start = cues[p.a].start, end = cues[p.z].end;
    const label = p.title ? `${p.title}${p.piece ? `（${p.piece}）` : ''}` : `第 ${i + 1} 份`;
    return { key, code: String(i + 1).padStart(2, '0'), title: label, chapter: p.chapter, chapterN: p.piece > 1 ? null : p.chapterN ?? null, sub: p.sub || '', firstN: cues[p.a].n, lastN: cues[p.z].n, a: p.a, z: p.z, start, end, seconds: end - start, target: designTarget(end - start) };
  });
}

const notesOf = (notes) => (Array.isArray(notes) ? notes : []);

// 素材筆記裡的關鍵字有出現在這一段字幕的，排前面
function assetsFor(part, cues, notes) {
  const text = cues.slice(part.a, part.z + 1).map((c) => c.text).join('');
  const out = [];
  for (const n of notesOf(notes)) {
    for (const m of (n.moments?.length ? n.moments : [n])) {
      const hit = (m.keywords || []).filter((k) => k && text.includes(k));
      if (hit.length) out.push({ file: n.file, from: m.from, to: m.to, what: m.what || n.summary || '', hit });
    }
  }
  return out.sort((x, y) => y.hit.length - x.hit.length).slice(0, 12);
}

// input：{ project, format:{ label, portrait }, videoDur, cues, scriptMd, plan, scenes(含 summary), fillSpecs, situationsMd, beatsMd, styleMd, voiceOnly, assets:{ screen, images }, notes, hasCamera, kinds }
export function renderCommon(input) {
  const { project, format, videoDur, cues, plan = {}, situationsMd, beatsMd, voiceOnly = [], assets = { screen: 0, images: 0 }, notes = [], hasCamera = true, kinds = '', parts = [] } = input;
  const L = [];
  L.push(`# 分鏡素材（共用）：${project}（build.mjs --scaffold 產生，不要手改；字幕改過就重跑）`, '');
  L.push('排分鏡要查的東西都在這份和你那一章的 `chNN.md`。**照這兩份寫，不要整份讀 USAGE／SITUATIONS／BEATS，也不要寫 script 查逐字稿或秒數**；這裡沒寫的才照最後一節找那幾行。', '');
  L.push('## 1. 這支影片', '');
  L.push(`- 版式：${format?.label ?? '—'}；長度 ${clock(videoDur)}（${cues.length} 句字幕），分成 ${parts.length} 份寫`);
  L.push(`- 主軌：${kinds || (hasCamera ? '有講者' : '只有聲音')}${hasCamera ? '' : '。**沒有講者**：沒有疊加、子母畫面，每一段都要有畫面（media 或不透明全幕），全畫面段自動用全寬版型，字卡（06–15）不能用'}`);
  if (hasCamera) L.push(`- 講者框：${plan.speakerBox ? JSON.stringify(plan.speakerBox) : '還沒有 → 先跑 qc.mjs speaker --write'}；構圖：${plan.frame ? JSON.stringify(plan.frame) : '不裁切'}`);
  L.push(`- 章節：${videoDur >= CHAPTER_MIN_VIDEO ? `滿 ${CHAPTER_MIN_VIDEO} 秒，章節起點用 01 章節轉場（業配段不放）` : `不到 ${CHAPTER_MIN_VIDEO} 秒，不用 01；章節起點放一段 02 章節角標`}；章節角標 build 自動常駐，不用另排；講稿沒有 \`##\` 章名就自己取 ≤ 10 字的章名，寫進 decide`);
  const sp = input.speaker;
  if (input.hasCamera) L.push(sp?.state === 'set' ? `- 講者：${sp.name}（14 講者介紹一集只排一次，只有第一份排；name、titles 不用寫，自動帶入）` : sp?.state === 'off' ? '- 講者：使用者不要講者介紹，不要排 14' : '- 講者：還沒設定。14 講者介紹一集只排一次，只有第一份排；name、titles 不要寫也不要編（設定後自動帶入），在 decide 寫「講者姓名、頭銜待確認」');
  L.push(`- 素材：螢幕錄影 ${assets.screen} 支、圖片 ${assets.images} 張${assets.screen || assets.images ? '（清單在第 5 節）' : ''}`);
  L.push(voiceOnly.length ? `- 只有聲音的區間（一定要被 media 段或不透明全幕蓋住）：${voiceOnly.map((r) => { const [a, b] = rangeOf(r); return `${clock(a)}–${clock(b)}`; }).join('、')}` : '- 只有聲音的區間：無', '');

  L.push('## 2. 怎麼選：三條路', '');
  L.push('1. **有對得上的錄影或圖片** → media 段（第 5 節）。', '2. **內容設計動畫**（第 4 節）：這段值得專門為它設計畫面。', '3. **模板**：字卡與模板動畫，工具直接產出，不用另外做動畫。寫法在 `寫法.md`，**要哪一個就查哪一個，不用整份讀**：`grep -A7 "x-process\\*\\*" work/分鏡素材/寫法.md`（字卡寫 key，例 `key-point`）。', '');
  const questions = situationQuestions(situationsMd), rules = animationRules(input.styleMd);
  if (questions.length) L.push('定大類的四題：', '', ...questions, '');
  if (rules.length) L.push('退到字卡只能用這幾條當理由（「字卡比較簡單」「時間不夠」不是理由）：', '', ...rules, '');

  L.push('## 3. 情境對照表（句子對到哪一列就用它的「首選」）', '');
  L.push('要看「次選」「不要用在」：讀 `shared/template/SITUATIONS.md` 那一行（第一欄是行號），不用讀別行。', '');
  L.push('| 行 | 句子長這樣 | 版面 | 首選 | 拍型 |', '|---|---|---|---|---|');
  for (const r of situationRows(situationsMd)) L.push(`| ${r.line} | ${cell(cut(r.say, 46))} | ${cell(r.layout)} | ${cell(cut(r.first, 34))} | ${cell(r.beat)} |`);
  L.push('');

  L.push('## 4. 內容設計動畫（這條路最提升質感，不要只挑模板）', '');
  L.push('不是套模板：這段內容值得專門為它設計一個畫面。**你在這裡只要提名、寫一句話的構想**，之後由設計師子代理專門想鏡位、從空白畫布做出來。', '');
  L.push('什麼時候提名：親身經驗或小故事、比喻、因果與轉折（以前怎樣、後來發現）、抽象的道理、情緒高點、這集最想讓人記住的畫面。**只是在條列、走流程的段落用模板就好。**判斷方式：把字幕遮起來只看畫面，能不能看懂在講什麼；模板做不到就提名。', '');
  L.push('```json', '{"id":"d0305","type":"custom","design":true,"from":"#N","to":"#Me","anchor":"<起點那句的一小段原文>","story":{"say":"<講解在講什麼>","idea":"<一句話：畫面上發生什麼事、為什麼這樣畫。不要寫模板名稱>","why":"<為什麼值得設計>"}}', '```', '');
  L.push(`建議數量：全片每 ${DESIGN_EVERY / 60} 分鐘至少 1 段，每一章 \`chNN.md\` 有寫這章的目標。段長至少 6 秒、講了 2 句以上才放得下。相鄰的內容設計動畫不要用同一種畫面。`, '');

  L.push('## 5. 螢幕錄影、圖片（media）', '');
  L.push('```json', '{"id":"m0301","type":"media","src":"assets/screen/<檔名>","from":"#N","to":"#Me","anchor":"<起點那句的一小段原文>","in":<素材第幾秒>}', '```', '');
  L.push('運鏡、紅框、說明卡、STEP：`shared/template/USAGE.md` 第 5 節；座標用 `media.mjs frame --at 秒,秒 --grid`。每個 media 段至少一個標註或運鏡。', '');
  if (notesOf(notes).length) {
    L.push('素材清單（`work/media/notes/`，看完整內容讀那個檔；要看畫面才開 `work/media/` 的 sheet）：', '', '| 素材 | 秒 | 內容 |', '|---|---|---|');
    for (const n of notesOf(notes)) {
      if (n.moments?.length) for (const m of n.moments) L.push(`| ${cell(n.file)} | ${m.from ?? '—'}–${m.to ?? '—'} | ${cell(cut(m.what || '', 60))} |`);
      else L.push(`| ${cell(n.file)} | — | ${cell(cut(n.what || n.summary || '', 60))} |`);
    }
    L.push('');
  } else if (assets.screen || assets.images) L.push('素材還沒盤點：看 `work/media/index.md` 與 sheet（圖片在 `work/media/images/`）。', '');

  L.push('## 6. 時間怎麼寫', '');
  L.push('**秒數 build 自己算，不要查 `transcript.json`、不要自己算秒數。** 寫字幕裡有的詞就好，檢查對不上會告訴你改哪裡。', '');
  L.push('| 寫法 | 意思 |', '|---|---|', '| `#N`／`#Ne` | 第 N 句的起點／結尾 |', '| `#N+0.3`、`#Ne-0.2` | 再加減秒數 |', '| `#N@詞` | 第 N 句裡講到這個詞的時間（卡片主文字、每條項目、動畫站都綁這個） |', '| `+1.2` | 本段起點之後 1.2 秒（只能用在 at、beats） |', '');
  L.push('段的 `from` 綁這段第一句；JSON 不能有註解、最後一項後面不能有逗號。', '');

  L.push('## 7. 草稿格式', '');
  L.push('每一章寫一份 `work/drafts/chNN.json`，`story` 每段都要有（分鏡表由工具從這裡產生，不用另外寫）：', '');
  L.push('```json', '{"chapter":"03","segments":[{"id":"s0301","scene":"key-point","from":"#N","to":"#Me","anchor":"…","slots":{"key":"…"},"beats":{"keyAt":"#N@詞"},"story":{"say":"講解在講什麼","row":"SITUATIONS 哪一列（題號＋句型）","why":"為什麼這樣呈現","notAnim":"字卡時：不符合哪一條判準；動畫不用寫"}}],"icons":{"剪輯清單":"scissors"},"quotes":[{"n":42,"text":"原句","card":"卡上文字（≤ 14 字）","mood":"正"}],"decide":["拿不定、要使用者決定的事"]}', '```', '');
  L.push('寫完先驗這一份（不會被別章影響）：`node shared/template/tools/build.mjs --project projects/<專案> --check-draft work/drafts/chNN.json`。✖ 全修，⚠ 照 → 改。', '');
  L.push('金句只放 `quotes`，不要直接排成段（使用者勾了才上）。同一個物件全集用同一個圖示：`icons` 寫你用的對應。', '');

  L.push('## 8. 這裡沒寫才去查', '');
  L.push('| 要查什麼 | 去哪裡 |', '|---|---|');
  const six = String(situationsMd ?? '').split(/\r?\n/).findIndex((l) => /^## 6\b|^## 6\./.test(l));
  if (six >= 0) L.push(`| 整集看一次（開場三拍、前後呼應、判決句） | \`shared/template/SITUATIONS.md\` 第 ${six + 1} 行起 |`);
  L.push('| 第一層其他欄位（outro、rhythm、look） | `shared/template/USAGE.md` 3.2 |', '| 版面、字數、音效的規則 | `shared/style.md` 對應那一節 |', '');
  void beatsMd;
  return `${L.join('\n')}\n`;
}

// 寫法.md：每種字卡、每支模板動畫一節，開頭固定「**名稱**」，要哪個 grep 哪個
export function renderSnippets(input) {
  const { format, fillSpecs = [] } = input;
  const scenes = (input.scenes || []).filter((s) => !(format?.portrait && s.portrait === 'none'));
  const L = ['# 字卡與模板動畫的寫法（build.mjs --scaffold 產生）', '', '要哪一個查哪一個：`grep -A7 "<名稱>\\*\\*" work/分鏡素材/寫法.md`（例 `key-point`、`x-process`）。', ''];
  L.push('段的起訖可以切在句中：`"from": "#14@手機畫面"`、`"to": "#32@遇到"`；`#Ne` 是第 N 句結尾。卡片的 `beats` 綁卡上文字裡最先講到的詞。', '');
  L.push('圖示名是 lucide 的英文名稱（例 smartphone、laptop、video、cloud、check），寫錯 `--check-draft` 會報；找名稱：`grep -o \'"[a-z0-9-]*phone[a-z0-9-]*":\' shared/template/kit/icons.json`。', '');
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
      L.push(`**fx ${f.id} ${f.zh}**：${f.when || ''}；vars：${vars || '—'}`);
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
    if (f.generator === 'scene' && input.illus?.length) L.push(`畫廊元件（illus）：${input.illus.join('、')}；螢幕類的狀態（opts.screen、state）：blank、video、play、rec、check、warn、shorts、qr、app`);
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
  return parts.length || minD ? `時間下限：${parts.join('、')}${total ? `${parts.length ? '；' : ''}項目全用上時段長至少 ${total} 秒` : ''}` : '';
}

// 模板動畫的全部欄位（含選填）：寫草稿的人才知道有哪些可以用
export function fillSummary(f) {
  if (f.generator === 'scene') return 'title（≤10）；parts 每個 { id, illus|icon|src|wave, opts, label ≤10, row, side, pre, stand, w, h }（也可以 { id, layout, gap, parts: […] } 疊成一組）；links ["a>b", "a-b"]；beats 每拍 { at, in, line, state, move, count, wave, check, focus, dim, sfx }；route（路線圖）';
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

export function renderPart(part, input) {
  const { cues, videoDur, outline = [], voiceOnly = [], notes = [], scenes = [] } = input;
  const L = [];
  L.push(`# ${part.key}｜${part.title}（#${part.firstN}–#${part.lastN}e，${clock(part.start)}–${clock(part.end)}，${(part.seconds / 60).toFixed(1)} 分鐘）`, '');
  L.push(`你負責這一份：寫 \`work/drafts/${part.key}.json\`（格式見 \`共用.md\` 第 7 節）。段 id 開頭用 \`s${part.code}\`、\`x${part.code}\`、\`d${part.code}\`、\`m${part.code}\`，後面接兩位流水號，全片才不會撞號。`, '');
  if (part.target) L.push(`- **內容設計動畫目標：至少 ${part.target} 段**（\`共用.md\` 第 4 節）。挑這一份裡最值得設計的時刻，不是湊數。`);
  const vo = voiceOnly.map(rangeOf).filter(([a, b]) => b > part.start && a < part.end);
  if (vo.length) L.push(`- 只有聲音的區間（一定要被 media 段或不透明全幕蓋住）：${vo.map(([a, b]) => { const inside = cues.filter((c) => c.end > a && c.start < b); return `${clock(a)}–${clock(b)}${inside.length ? `（#${inside[0].n}–#${inside[inside.length - 1].n}）` : ''}`; }).join('、')}`);
  const hits = assetsFor(part, cues, notes);
  if (hits.length) {
    L.push('- 可能對得上的素材：');
    for (const h of hits) L.push(`  - ${h.file}${h.from != null ? ` ${h.from}–${h.to} 秒` : ''}：${cut(h.what, 50)}（字幕有「${h.hit.join('、')}」）`);
  }
  L.push('');
  if (part.chapter && part.chapterN) {
    const seg = chapterSegments([{ n: part.chapterN, title: part.sub ? `${part.title}：${part.sub}` : part.title }], cues, { videoDur, scenes });
    const s = { ...seg.segs[0], id: `c${part.code}`, slots: { ...seg.segs[0].slots, num: String(part.chapter).padStart(2, '0') } };
    L.push('章節段（貼進 segments）：', '', '```json', JSON.stringify(s), '```', '');
    for (const w of seg.warn) L.push(`- ⚠ ${w}`);
    if (seg.warn.length) L.push('');
  }
  const heads = new Map(outline.map((x) => [x.n, x]));
  L.push('## 字幕（句號就是 #N）', '', '| #N | 時間 | 字幕 |', '|---|---|---|');
  for (let i = part.a; i <= part.z; i++) {
    const c = cues[i], h = heads.get(c.n);
    if (h) L.push(`| **${h.level === 2 ? '章' : '小節'}** | | **${cell(h.title)}** |`);
    L.push(`| #${c.n} | ${clock(c.start)} | ${cell(c.text)} |`);
  }
  L.push('');
  return `${L.join('\n')}\n`;
}

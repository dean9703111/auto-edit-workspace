// 062：整理這集的調整給 AI（work/feedback/learn.md），讓 AI 從使用者這一集怎麼改，整理出可以每一集照做的規則。
// 只讀不改：回饋輪 r<N>.md（原話、分類、建議改規則、改了哪幾段）、剪輯台手改（plan.json 的 edit、每段的音效與畫面速度、整支設定；
// rough.srt 和初剪字幕的差異）、改版紀錄（work/versions/：換模板、重新設計、退回）。同類的歸在一起、標出現次數；
// 已經在 shared/偏好.md 的規則標「已是規則」。
//   writeLearn({ root, project })   → { file, rel, md, line, counts }（寫 work/feedback/learn.md）
//   learnLine(projectRel)           → 剪輯台按鈕、deliver.mjs 回報、versions.mjs learn 印的同一行（貼給 AI 的）
//   readRules／rulesPage            → 候選規則（AI 寫的 learn-rules.json）→ 選擇頁 learn-choices.html（versions.mjs learn --page）
import fs from 'node:fs';
import path from 'node:path';
import { parseSrt } from './srt.mjs';
import { readPrefs, prefKey } from './prefs.mjs';
import { writeAtomic } from './atomic.mjs';

export const LEARN = { file: 'learn.md', rules: 'learn-rules.json', page: 'learn-choices.html', examples: 8, subs: 10, timeTol: 0.2, where: ['偏好', '改預設', '程式檢查'] };
const posix = (p) => p.split(path.sep).join('/');
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const r1 = (n) => Math.round(n * 10) / 10;
const ms = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const clip = (s, n = 60) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const PH = '（versions.mjs finish 會填）';
export const feedbackDir = (project) => path.join(project, 'work', 'feedback');
export const learnFile = (project) => path.join(feedbackDir(project), LEARN.file);
// projects/<專案>（測試的暫存專案也一樣寫）
export const projectRel = (root, project) => (path.basename(path.dirname(project)) === 'projects' ? `projects/${path.basename(project)}` : posix(path.relative(root, project)));

// 貼給 AI 的那一行（剪輯台「整理這集的調整給 AI」、deliver.mjs 輸出後的回報、versions.mjs learn 都印這一行）
export function learnLine(rel) {
  return `照這集的調整紀錄學我的習慣（${rel}/work/feedback/learn.md）：照 auto-edit-review 的 references/learn-habits.md 做，整理成候選規則、做成選擇頁給我勾，我勾了才寫進 shared/偏好.md。第一步跑 node shared/template/tools/versions.mjs learn --project ${JSON.stringify(rel)}`;
}

// ---------- 回饋輪 ----------
const sectionOf = (md, title) => md.split(new RegExp(`^##\\s*${title}\\s*$`, 'm'))[1]?.split(/^##\s/m)[0] ?? '';
// 原話：「…」一行一則；修改單那幾段是「- 修改單 s01（要改：A、B）：「…」」
function quotesOf(md, round) {
  const out = [];
  for (const l of sectionOf(md, '原話').split(/\r?\n/)) {
    const t = l.trim();
    const rq = /^- 修改單 (\S+?)(?:（要改：([^）]*)）)?：(?:「(.*)」|（沒寫描述）)$/.exec(t);
    if (rq) { out.push({ round, seg: rq[1], tags: (rq[2] || '').split('、').map((x) => x.trim()).filter(Boolean), text: (rq[3] || '').trim(), from: '修改單' }); continue; }
    const q = /^「(.*)」$/.exec(t);
    if (q && q[1].trim() && q[1].trim() !== '照修改單改') out.push({ round, seg: null, tags: [], text: q[1].trim(), from: '原話' });
  }
  return out;
}
// 分類表：| # | 原話節錄 | 規則／個案 | 改哪一段 | 改法 |
function rowsOf(md) {
  const out = [];
  for (const l of sectionOf(md, '分類').split(/\r?\n/)) {
    if (!/^\|\s*\d+\s*\|/.test(l.trim())) continue;
    const c = l.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    out.push({ quote: c[1] || '', kind: c[2] || '', seg: c[3] || '', how: c[4] === PH ? '' : c[4] || '' });
  }
  return out;
}
// 建議改規則句尾註明要怎麼防（feedback-round.md）：（文件）（程式檢查）（改預設）（已有檢查：…）
const LANDING = /\s*（(?:文件|程式檢查|改預設|已有檢查[^）]*)）\s*$/;
// 建議改規則：同一行，或下面接著的「- 」列（和 status.mjs 的 collectRuleNotes 同一種讀法）；「無」和工具留的提示不算
function rulesOf(md) {
  const ls = md.split(/\r?\n/), at = ls.findIndex((l) => /^建議改規則[：:]/.test(l.trim()));
  if (at < 0) return [];
  const texts = [ls[at].trim().replace(/^建議改規則[：:]\s*/, '')];
  for (let i = at + 1; i < ls.length && /^\s*-\s+/.test(ls[i]); i++) texts.push(ls[i].replace(/^\s*-\s+/, ''));
  return texts.map((x) => x.trim()).filter((x) => x && x !== '無' && !/^（(原話有|沒有寫)/.test(x));
}
function changedOf(md) {
  const out = [];
  for (const m of sectionOf(md, '改了哪幾段').matchAll(/^- (\S+?)：(.+)$/gm)) if (m[2].trim() !== PH) out.push({ seg: m[1], text: m[2].trim() });
  return out;
}
export function readRounds(project) {
  let files = [];
  try { files = fs.readdirSync(feedbackDir(project)).filter((f) => /^r\d+\.md$/.test(f)).sort((a, b) => Number(a.slice(1, -3)) - Number(b.slice(1, -3))); } catch { return []; }
  return files.map((f) => {
    const md = readText(path.join(feedbackDir(project), f)) || '', round = f.slice(0, -3);
    return { round, time: (/^# 回饋 r\d+（([^）]*)）/m.exec(md) || [])[1] || '', quotes: quotesOf(md, round), rows: rowsOf(md), rules: rulesOf(md), changed: changedOf(md) };
  });
}

// 原話的種類：照順序，第一個對到的算數（說法很多種，只求大致歸類；細分交給 AI）
export const KINDS = [
  ['聲音、音效', /音效|聲音|太吵|音量|配樂|底樂|大聲|小聲|安靜/],
  ['時間、節奏', /太快|太慢|慢一點|快一點|早一點|晚一點|提早|延後|節奏|跟講的話|對到|同步|停留|太久|太短|播太/],
  ['重新設計、換動畫', /重新設計|換一種|換個|換成動畫|更完善|重做|換模板|換一段/],
  ['錄影、標註', /錄影|標註|紅框|推近|放大鏡|操作區|步驟清單/],
  ['位置、版面', /左|右|上面|下面|置中|至中|位置|移到|往.邊|偏|擋到|蓋到|蓋住|重疊|對齊|靠|版面|框/],
  ['大小、比例', /太大|太小|大一點|小一點|放大|縮小|比例|撐滿|鋪滿/],
  ['字、文案', /字|文案|標題|句|縮短|太多|太長/],
  ['圖像、關係', /圖像|插圖|圖示|示意|箭頭|引線|關係|畫面/],
  ['內容、細節', /細節|流程|步驟|清楚|看不懂|完整/],
  ['顏色、質感', /顏色|色|質感|陰影|光暈|亮|暗|風格/],
  ['講者', /講者|臉|瘦|調光|美顏/],
];
export const kindOf = (text) => (KINDS.find(([, re]) => re.test(text)) || ['其他'])[0];

// ---------- 剪輯台手改（plan.json；剪輯台寫的欄位見 EDITOR.md「3. 剪輯台會寫哪些欄位」） ----------
const db = (v) => `${v > 0 ? '+' : ''}${r1(v)} dB`;
const LOOK_ZH = { color: '調光', slim: '瘦臉', beauty: '美顏', belly: '瘦小腹' };
export function planEdits(plan, memory = {}) {
  const L = { cut: [], seg: [], whole: [] };
  const e = isObj(plan?.edit) ? plan.edit : {};
  const cuts = Array.isArray(e.cuts) ? e.cuts.filter((c) => Array.isArray(c) && c[1] > c[0]) : [];
  const counts = { cuts: cuts.length };
  if (cuts.length) {
    const total = cuts.reduce((s, [a, b]) => s + (b - a), 0), head = cuts.find(([a]) => a <= 0.01);
    const longest = [...cuts].sort((x, y) => (y[1] - y[0]) - (x[1] - x[0])).slice(0, 3);
    L.cut.push(`剪掉 ${cuts.length} 處，共 ${r1(total)} 秒${head ? `（含片頭裁掉 ${r1(head[1])} 秒）` : ''}；最長：${longest.map(([a, b]) => `${ms(a)}–${ms(b)}（${r1(b - a)} 秒）`).join('、')}（rough.mp4 秒數）`);
  }
  if (e.fadeIn || e.fadeOut) L.cut.push(`淡入 ${e.fadeIn || 0} 秒、淡出 ${e.fadeOut || 0} 秒`);
  const vol = isObj(e.volume) ? e.volume : {};
  const vols = [['人聲', vol.voice], ['全部音效', vol.sfx], ['插入素材原聲', vol.media]].filter(([, v]) => Number.isFinite(v) && v !== 0);
  if (vols.length) L.cut.push(`音量：${vols.map(([k, v]) => `${k} ${db(v)}`).join('、')}`);
  if (Array.isArray(e.gains) && e.gains.length) L.cut.push(`人聲局部調音量 ${e.gains.length} 處（${e.gains.slice(0, 4).map((g) => `${ms(g.from)}–${ms(g.to)} ${db(g.db)}`).join('、')}${e.gains.length > 4 ? '…' : ''}）`);
  if (Array.isArray(e.joins) && e.joins.length) {
    const by = {};
    for (const j of e.joins) by[j.type] = (by[j.type] || 0) + 1;
    L.cut.push(`剪接點轉場：${Object.entries(by).map(([k, n]) => `${{ dip: '過黑', punch: '放大' }[k] || k} ${n} 個`).join('、')}`);
  }
  if (e.level) L.cut.push('拉平人聲大小聲：開');
  if (Array.isArray(e.sfx) && e.sfx.length) {
    const by = {};
    for (const s of e.sfx) by[s.sound] = (by[s.sound] || 0) + 1;
    L.cut.push(`自己加的音效 ${e.sfx.length} 顆：${Object.entries(by).map(([k, n]) => `${k}×${n}`).join('、')}`);
  }
  counts.edits = L.cut.length;
  // 整支設定
  if (isObj(plan?.look)) L.whole.push(`講者：${Object.entries(plan.look).filter(([, v]) => Number.isFinite(v) && v > 0).map(([k, v]) => `${LOOK_ZH[k] || k} ${v}`).join('、') || '都關'}`);
  if (plan?.theme === 'dark') L.whole.push('主題：暗色');
  if (isObj(plan?.captionStyle)) { const c = plan.captionStyle; L.whole.push(`字幕樣式：${[c.look, c.font, c.size != null ? `大小 ${c.size}` : '', c.weight != null ? `粗細 ${c.weight}` : '', c.lift ? `上下位置 ${c.lift}` : ''].filter(Boolean).join('、')}`); }
  if (Array.isArray(plan?.captionMarks) && plan.captionMarks.length) L.whole.push(`重點字幕 ${plan.captionMarks.length} 則`);
  if (isObj(plan?.bed) && Number.isFinite(plan.bed.volume) && plan.bed.volume !== 0) L.whole.push(`背景音樂 ${db(plan.bed.volume)}${plan.bed.volume <= -40 ? '（靜音）' : ''}`);
  // 每段：音效（換一顆、靜音，.editor/memory.json 記著原本的）、音量、錄影的畫面速度
  const scenes = (plan?.scenes || []).filter((s) => isObj(s) && s.id);
  const swapped = [], muted = [], vols2 = [], speed = [];
  for (const s of scenes) {
    const m = memory[s.id];
    if (isObj(m) && 'set' in m) swapped.push(`${s.id} ${typeof m.value === 'string' ? m.value : m.value?.name || '原本的'}→${typeof m.set === 'string' ? m.set : m.set?.name || '?'}`);
    else if (s.sfx === null && isObj(m)) muted.push(s.id);
    if (Number.isFinite(s.sfxVolume) && s.sfxVolume !== 0) vols2.push(`${s.id} ${db(s.sfxVolume)}`);
    if (s.type === 'media' && (Number.isFinite(s.speed) && s.speed !== 1 || s.hold != null || Array.isArray(s.retime))) speed.push(`${s.id} ${s.hold != null ? '定格' : Array.isArray(s.retime) ? '分區變速' : `×${s.speed}`}`);
  }
  if (swapped.length) L.seg.push(`換了音效 ${swapped.length} 段：${swapped.slice(0, LEARN.examples).join('、')}${swapped.length > LEARN.examples ? '…' : ''}`);
  if (muted.length) L.seg.push(`音效靜音 ${muted.length} 段：${muted.slice(0, LEARN.examples).join('、')}${muted.length > LEARN.examples ? '…' : ''}`);
  if (vols2.length) L.seg.push(`這段音效的音量 ${vols2.length} 段：${vols2.slice(0, LEARN.examples).join('、')}${vols2.length > LEARN.examples ? '…' : ''}`);
  if (speed.length) L.seg.push(`錄影改畫面速度 ${speed.length} 段：${speed.slice(0, LEARN.examples).join('、')}${speed.length > LEARN.examples ? '…' : ''}`);
  counts.segEdits = swapped.length + muted.length + vols2.length + speed.length;
  return { lines: L, counts };
}

// ---------- 字幕：rough.srt 和初剪字幕的差異 ----------
// 初剪字幕的底稿：srt-align 寫好時另存的 work/.cache/rough-first.srt；舊專案退回最早的 rough.srt.bak-*（snap-srt 改時間之前，字和初剪一樣）
export function srtBaseline(project) {
  const work = path.join(project, 'work'), first = path.join(work, '.cache', 'rough-first.srt');
  if (fs.existsSync(first)) return { file: first, label: 'work/.cache/rough-first.srt' };
  let baks = [];
  try { baks = fs.readdirSync(work).filter((f) => /^rough\.srt\.bak-/.test(f)).sort(); } catch { /* 沒有 work */ }
  return baks.length ? { file: path.join(work, baks[0]), label: `work/${baks[0]}` } : null;
}
const bare = (s) => String(s).replace(/[\s\p{P}\p{S}]/gu, '');
// 兩串字的 LCS 對齊（長片 400–900 則也只要幾 MB）→ [[i, j]]
function lcsPairs(a, b, eq) {
  const n = a.length, m = b.length, W = m + 1, T = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i * W + j] = eq(a[i], b[j]) ? T[(i + 1) * W + j + 1] + 1 : Math.max(T[(i + 1) * W + j], T[i * W + j + 1]);
  const out = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (eq(a[i], b[j])) { out.push([i, j]); i++; j++; } else if (T[(i + 1) * W + j] >= T[i * W + j + 1]) i++; else j++;
  }
  return out;
}
// 一則改字裡換掉的片段：「Cloud」→「Claude」、刪「的」、加「，」
function hunks(a, b) {
  const A = [...a], B = [...b], pairs = lcsPairs(A, B, (x, y) => x === y), out = [];
  let i = 0, j = 0;
  for (const [pi, pj] of [...pairs, [A.length, B.length]]) {
    const del = A.slice(i, pi).join('').trim(), ins = B.slice(j, pj).join('').trim();
    if (del || ins) out.push(del && ins ? `「${del}」→「${ins}」` : del ? `刪「${del}」` : `加「${ins}」`);
    i = pi + 1; j = pj + 1;
  }
  return out;
}
export function srtDiff(base, cur, { timeTol = LEARN.timeTol } = {}) {
  const S = { edited: [], split: [], merged: [], removed: [], added: [], resplit: 0, retimed: 0, subs: new Map() };
  if (base.length * cur.length > 9e6) return { ...S, tooLong: true };
  const pairs = lcsPairs(base, cur, (x, y) => x.text.trim() === y.text.trim());
  let i = 0, j = 0;
  const cat = (X) => bare(X.map((x) => x.text).join(''));
  const edit = (x, y) => { S.edited.push({ n: y.n, before: x.text, after: y.text }); for (const h of hunks(x.text, y.text)) S.subs.set(h, (S.subs.get(h) || 0) + 1); };
  // 從 X[a] 起接幾則，接起來（去掉標點空白）剛好等於 whole：回傳接到哪（不含）；接不到回 -1
  const joinTo = (X, a, whole) => { let acc = '', m = a; while (m < X.length && acc.length < whole.length && whole.startsWith(acc + bare(X[m].text))) acc += bare(X[m++].text); return acc === whole && m - a > 1 ? m : -1; };
  const gap = (bi, bj) => {
    const B = base.slice(i, bi), C = cur.slice(j, bj);
    // 整段字一樣、只是斷句不同：分割、合併、重新斷句
    if (B.length && C.length && cat(B) === cat(C) && !(B.length === C.length && B.every((x, k) => bare(x.text) === bare(C[k].text)))) {
      if (B.length === 1) S.split.push({ before: B[0], after: C });
      else if (C.length === 1) S.merged.push({ before: B, after: C[0] });
      else S.resplit++;
      return;
    }
    // 混在一起：逐則往下對（分割、合併、改字、刪掉、新增）
    let k = 0, l = 0;
    while (k < B.length && l < C.length) {
      const b = bare(B[k].text), c = bare(C[l].text);
      const sp = b === c ? -1 : joinTo(C, l, b);
      if (sp > 0) { S.split.push({ before: B[k], after: C.slice(l, sp) }); k++; l = sp; continue; }
      const mg = b === c ? -1 : joinTo(B, k, c);
      if (mg > 0) { S.merged.push({ before: B.slice(k, mg), after: C[l] }); k = mg; l++; continue; }
      if (B.length - k === C.length - l || [...b].filter((ch) => c.includes(ch)).length * 2 >= Math.max(b.length, c.length)) { edit(B[k], C[l]); k++; l++; continue; }
      if (B.length - k > C.length - l) S.removed.push(B[k++]); else S.added.push(C[l++]);
    }
    S.removed.push(...B.slice(k));
    S.added.push(...C.slice(l));
  };
  for (const [pi, pj] of pairs) {
    gap(pi, pj);
    if (Math.abs(base[pi].start - cur[pj].start) > timeTol || Math.abs(base[pi].end - cur[pj].end) > timeTol) S.retimed++;
    i = pi + 1; j = pj + 1;
  }
  gap(base.length, cur.length);
  return S;
}
function srtLines(project) {
  const b = srtBaseline(project), cur = readText(path.join(project, 'work', 'rough.srt'));
  if (!cur) return { lines: ['（沒有 work/rough.srt）'], count: 0 };
  if (!b) return { lines: ['（沒有初剪字幕的底稿，比不出手改了哪些字：之後重新對字幕（srt-align）會另存 work/.cache/rough-first.srt）'], count: 0 };
  const d = srtDiff(parseSrt(readText(b.file) || ''), parseSrt(cur));
  if (d.tooLong) return { lines: ['（字幕太多，比不完；只看回饋輪）'], count: 0 };
  const n = d.edited.length + d.split.length + d.merged.length + d.removed.length + d.added.length + d.resplit;
  const L = [`和 ${b.label} 比：改字 ${d.edited.length} 則、分割 ${d.split.length}、合併 ${d.merged.length}、刪掉 ${d.removed.length}、新增 ${d.added.length}${d.resplit ? `、重新斷句 ${d.resplit} 處` : ''}；只調時間（差超過 ${LEARN.timeTol} 秒）${d.retimed} 則`];
  const subs = [...d.subs].sort((x, y) => y[1] - x[1]).slice(0, LEARN.subs);
  if (subs.length) L.push(`常改的字：${subs.map(([h, c]) => `${h}${c > 1 ? `×${c}` : ''}`).join('、')}`);
  for (const e of d.edited.slice(0, LEARN.examples)) L.push(`例 #${e.n}：「${clip(e.before, 40)}」→「${clip(e.after, 40)}」`);
  for (const s of d.split.slice(0, 3)) L.push(`例 分割：「${clip(s.before.text, 40)}」→ ${s.after.length} 則`);
  for (const s of d.merged.slice(0, 3)) L.push(`例 合併：${s.before.length} 則 →「${clip(s.after.text, 40)}」`);
  return { lines: L, count: n };
}

// ---------- 改版紀錄（work/versions/<段>/v<N>/） ----------
const shapeOf = (seg) => (!isObj(seg) ? '?' : seg.design ? '內容設計動畫' : seg.template ? seg.template : seg.scene ? `資訊卡 ${seg.scene}` : seg.fx != null ? `字卡動態 ${seg.fx}` : seg.type === 'media' ? '錄影' : seg.type || '?');
export function versionsLog(project, rounds = []) {
  const dir = path.join(project, 'work', 'versions');
  let ids = [];
  try { ids = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort(); } catch { /* 沒有版本 */ }
  const swaps = [], redesigns = [], proposals = [];
  for (const id of ids) {
    const vers = fs.readdirSync(path.join(dir, id)).map((n) => /^v(\d+)$/.exec(n)).filter(Boolean).map((m) => {
      const d = path.join(dir, id, m[0]);
      return { n: Number(m[1]), meta: readJson(path.join(d, '.meta.json')) || {}, seg: readJson(path.join(d, '段落.json')) };
    }).sort((a, b) => a.n - b.n);
    let prev = null;
    for (const v of vers) {
      const round = (/^(r\d+)/.exec(v.meta.kind || '') || [])[1] || '';
      if (v.meta.kind === '改版') proposals.push({ id, v: v.n, state: v.meta.state || '提案', note: v.meta.note || '' });
      if (!v.seg) continue;
      if (prev) {
        const a = shapeOf(prev.seg), b = shapeOf(v.seg);
        if (a !== b) (b === '內容設計動畫' ? redesigns : swaps).push({ id, from: a, to: b, round });
      }
      prev = v;
    }
  }
  // 退回：「改了哪幾段」的版本往回走（finish 寫「（v3 → v1）」），或原話、改法寫了「退回 v1」「用 v1」
  const reverts = [];
  const add = (id, ver, round) => { if (id && !reverts.some((y) => y.id === id && y.ver === ver && y.round === round)) reverts.push({ id, ver, round }); };
  for (const r of rounds) {
    for (const c of r.changed) { const m = /（v(\d+) → v(\d+)）\s*$/.exec(c.text); if (m && Number(m[2]) < Number(m[1])) add(c.seg, `v${m[2]}`, r.round); }
    for (const w of r.rows) { const m = /(?:退回|用)\s*(v\d+)/.exec(`${w.quote} ${w.how}`); if (m) add(w.seg, m[1], r.round); }
  }
  return { segs: ids.length, swaps, redesigns, reverts, proposals };
}

// ---------- 組成 learn.md ----------
const stampOf = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
export function buildLearn({ root, project, now = new Date() }) {
  const rel = projectRel(root, project);
  const rounds = readRounds(project);
  const prefs = readPrefs(root);
  const keep = new Map(prefs.keep.map((x, i) => [prefKey(x.text), i + 1])), skip = new Set(prefs.skip.map((x) => prefKey(x.text)));
  const plan = readJson(path.join(project, 'work', 'hyperframes', 'plan.json')) || {};
  const memory = readJson(path.join(project, 'work', 'hyperframes', '.editor', 'memory.json'))?.sfx || {};
  const ed = planEdits(plan, isObj(memory) ? memory : {});
  const srt = srtLines(project);
  const ver = versionsLog(project, rounds);

  // 原話：同類歸在一起（類別照出現次數排），每則接上分類表那一段的改法
  const quotes = rounds.flatMap((r) => r.quotes.map((q) => {
    const row = r.rows.find((w) => q.seg && w.seg === q.seg) || (!q.seg && r.rows.length === 1 ? r.rows[0] : null);
    return { ...q, seg: q.seg || row?.seg || null, how: row?.how || '', kind: kindOf(q.text || q.tags.join('、')) };
  }));
  const byKind = new Map();
  for (const q of quotes) { if (!byKind.has(q.kind)) byKind.set(q.kind, []); byKind.get(q.kind).push(q); }
  const kinds = [...byKind].sort((a, b) => b[1].length - a[1].length);
  // 建議改規則：同一句歸一條，標出現次數與在哪幾輪；已經在偏好.md 的標出來
  const rules = new Map();
  for (const r of rounds) for (const t of r.rules) {
    const k = prefKey(t.replace(LANDING, ''));   // 句尾的「（文件）」「（程式檢查）」這類落點不算進規則本身
    if (!k) continue;
    if (!rules.has(k)) rules.set(k, { text: t, rounds: [] });
    rules.get(k).rounds.push(r.round);
  }
  const ruleList = [...rules.entries()].sort((a, b) => b[1].rounds.length - a[1].rounds.length);
  const tagCount = new Map();
  for (const q of quotes) for (const t of q.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);

  const counts = { rounds: rounds.length, quotes: quotes.length, rules: ruleList.length, known: ruleList.filter(([k]) => keep.has(k)).length,
    edits: ed.counts.edits + ed.counts.segEdits + ed.lines.whole.length, subtitles: srt.count, swaps: ver.swaps.length, redesigns: ver.redesigns.length, reverts: ver.reverts.length };
  const L = [`# 這集的調整紀錄（${rel}）`, '',
    `（${stampOf(now)} 由 versions.mjs learn 整理。給 AI：照 .agents/skills/auto-edit-review/references/learn-habits.md 把這份整理成候選規則，不要直接改 shared/）`, '',
    '## 一覽', '',
    `- 回饋輪：${rounds.length ? `${rounds.length} 輪（${rounds[0].round}–${rounds[rounds.length - 1].round}），原話 ${quotes.length} 則` : '沒有（沒開過回饋輪）'}`,
    `- 建議改規則：${ruleList.length} 條${counts.known ? `，其中 ${counts.known} 條已是規則` : ''}`,
    `- 剪輯台手改：剪接與聲音 ${ed.lines.cut.length} 項、每段 ${ed.counts.segEdits} 處、整支設定 ${ed.lines.whole.length} 項；字幕 ${srt.count} 處`,
    `- 改版：換模板 ${ver.swaps.length} 次、改成內容設計動畫 ${ver.redesigns.length} 段、退回 ${ver.reverts.length} 次（有版本的段 ${ver.segs} 段）`,
    '', '## 1. 使用者說過的話（同類歸在一起）', ''];
  if (!kinds.length) L.push('（沒有）', '');
  for (const [k, list] of kinds) {
    L.push(`### ${k}（${list.length} 次）`, '');
    for (const q of list) L.push(`- ${q.round}${q.seg ? ` ${q.seg}` : ''}：${q.text ? `「${clip(q.text, 80)}」` : '（沒寫描述）'}${q.tags.length ? `（要改：${q.tags.join('、')}）` : ''}${q.how ? ` → ${clip(q.how, 60)}` : ''}`);
    L.push('');
  }
  if (tagCount.size) L.push(`修改單勾的標籤：${[...tagCount].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join('、')}`, '');
  L.push('## 2. 建議改規則（各輪 r<N>.md 寫的）', '');
  if (!ruleList.length) L.push('（沒有）');
  for (const [k, r] of ruleList) {
    const mark = keep.has(k) ? `——已是規則（shared/偏好.md「照做」第 ${keep.get(k)} 條）` : skip.has(k) ? '——使用者說過不要（shared/偏好.md「不採用」）' : '';
    L.push(`- ${r.text}（${r.rounds.length} 次：${r.rounds.join('、')}）${mark}`);
  }
  L.push('', '## 3. 剪輯台手改', '', '### 剪接與聲音（plan.json 的 edit）', '', ...(ed.lines.cut.length ? ed.lines.cut.map((x) => `- ${x}`) : ['（沒有）']), '',
    '### 每段（音效、錄影速度）', '', ...(ed.lines.seg.length ? ed.lines.seg.map((x) => `- ${x}`) : ['（沒有）']), '',
    '### 整支設定', '', ...(ed.lines.whole.length ? ed.lines.whole.map((x) => `- ${x}`) : ['（沒有）']), '',
    '### 字幕（rough.srt）', '', ...srt.lines.map((x) => `- ${x}`), '',
    '## 4. 改版紀錄（work/versions/）', '');
  const vl = [
    ...ver.swaps.map((x) => `- 換模板：${x.id} ${x.from} → ${x.to}${x.round ? `（${x.round}）` : ''}`),
    ...ver.redesigns.map((x) => `- 重新設計：${x.id} ${x.from} → 內容設計動畫${x.round ? `（${x.round}）` : ''}`),
    ...ver.reverts.map((x) => `- 退回：${x.id} 用 ${x.ver}（${x.round}）`),
    ...ver.proposals.map((x) => `- 改版提案：${x.id} v${x.v}（${x.state}）${x.note ? `：「${clip(x.note, 50)}」` : ''}`),
  ];
  L.push(...(vl.length ? vl : ['（沒有）']), '');
  return { rel, md: `${L.join('\n')}\n`, line: learnLine(rel), counts };
}
export function writeLearn(o) {
  const r = buildLearn(o), file = learnFile(o.project);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, r.md);
  return { ...r, file, rel: `${r.rel}/work/feedback/${LEARN.file}`, project: r.rel };
}

// ---------- 候選規則 → 選擇頁（versions.mjs learn --page） ----------
// AI 寫 work/feedback/learn-rules.json：{ "rules": [{ "id": "L1", "text": "一句完整的話", "where": "偏好｜改預設｜程式檢查", "evidence": "r1 s05、r3 s14（2 次）", "now": "現行", "change": "建議", "cost": "代價" }] }
export function readRules(project) {
  const file = path.join(feedbackDir(project), LEARN.rules);
  const j = readJson(file);
  if (!j) throw new Error(`讀不到 ${LEARN.rules}（work/feedback/${LEARN.rules} 不存在或不是 JSON）→ 照 references/learn-habits.md 第 2 步寫好再跑`);
  const list = Array.isArray(j.rules) ? j.rules : [];
  const bad = [];
  if (!list.length) bad.push('rules 是空的');
  const seen = new Set();
  list.forEach((r, i) => {
    const at = `rules[${i}]`;
    if (!isObj(r)) { bad.push(`${at} 不是物件`); return; }
    if (!/^L\d+$/.test(String(r.id || ''))) bad.push(`${at}.id 要寫 L1、L2…（現在是「${r.id ?? ''}」）`);
    else if (seen.has(r.id)) bad.push(`${at}.id「${r.id}」重複了`);
    seen.add(r.id);
    if (!String(r.text || '').trim()) bad.push(`${at}.text 是空的（寫一句完整的話）`);
    if (!LEARN.where.includes(r.where)) bad.push(`${at}.where 要是 ${LEARN.where.join('／')}（現在是「${r.where ?? ''}」）`);
    if (!String(r.evidence || '').trim()) bad.push(`${at}.evidence 是空的（寫出自哪幾輪、哪幾段、幾次）`);
  });
  if (bad.length) throw new Error(`${LEARN.rules} 有 ${bad.length} 個問題：${bad.slice(0, 6).join('；')} → 改好再跑一次`);
  return list.map((r) => ({ id: r.id, text: String(r.text).trim(), where: r.where, evidence: String(r.evidence).trim(), now: String(r.now || '').trim(), change: String(r.change || '').trim(), cost: String(r.cost || '').trim() }));
}
export function rulesPage({ templateDir, project, rel, rules, now = new Date() }) {
  const tpl = fs.readFileSync(path.join(templateDir, 'site', 'choices.html'), 'utf8');
  const data = { v: 1, project: rel, file: `${rel}/work/feedback/${LEARN.rules}`, generated: stampOf(now), rules };
  const html = tpl.replace('/*__BRAND__*/', brandVars(templateDir)).replace('__SITE_DATA__', () => JSON.stringify(data).replace(/</g, '\\u003c'));
  const file = path.join(feedbackDir(project), LEARN.page);
  writeAtomic(file, html);
  return { file, data };
}
// 主色（kit/brand.css 的三個變數）：頁面跟著工作區的主色
export function brandVars(templateDir) {
  const css = readText(path.join(templateDir, 'kit', 'brand.css')) || '';
  return [...css.matchAll(/(--brand(?:-ink|-text)?)\s*:\s*([^;]+);/g)].map((m) => `${m[1]}: ${m[2].trim()};`).join(' ');
}

// 分鏡表由工具產生：plan.json（段落與 story）＋ --check 的時間＋截圖清單 → work/storyboard.md；
// 使用者在網頁改完之後，applyStoryboard 把改動套回 plan.json（只動改到的欄位）。格式見 USAGE.md 2.3；解析在 editor/storyboard-md.mjs。零依賴。
//   textFields(seg, { scenes, specs })        → 這段「畫面文字」的欄位清單 [{ path, label, value }]，順序固定
//   renderSection(seg, ctx)                   → 一段（### <id>｜…）
//   renderStoryboard(ctx)                     → 整份 markdown
//   applyStoryboard(md, plan, { scenes, specs, cues }) → { plan, changes, requests, unmatched, changed }
import { parseStoryboard } from '../editor/storyboard-md.mjs';
import { renderSheet } from './custom-fill.mjs';

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
  if (seg.type === 'media' && seg.src) L.push(`- 素材：\`${seg.src}\`${seg.in != null ? ` 從 ${seg.in} 秒` : ''}`);
  L.push(`- 音效：${sfxText(seg)}`);
  const design = seg.design ? designs.get(seg.id) : null;
  if (seg.design) {
    L.push(`- 概念：${cell(design?.concept || seg.story?.idea || '（還沒寫鏡位腳本）')}`);
    if (design?.picture) L.push(`- 畫面：${cell(design.picture)}`);
  }
  if (seg.story?.why) L.push(`- 理由：${cell(seg.story.why)}`);
  L.push('');
  const pics = shots.get(seg.id) || [];
  for (const p of pics) L.push(p.md || `![${seg.id}](storyboard-preview/${p.file})`);
  if (pics.length) L.push('');
  L.push(`截圖觀察：${seg.design && !design?.done ? '動畫要在這張鏡位腳本確認後才做，所以還沒有畫面' : '無'}`, '');
  if (seg.design) {
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

export function renderStoryboard(ctx) {
  const { project, plan, items = new Map(), merged = {}, parts = [], voiceOnly = [], designs = new Map() } = ctx;
  const segs = (plan.scenes || []).slice();
  const L = [`# 分鏡表：${project}（草稿）`, '', '## 四種版面', '', FOUR_LAYOUTS, ''];
  if (plan.speakerBox) L.push(`講者框 speakerBox＝${JSON.stringify(plan.speakerBox)}`, '');
  const icons = Object.entries(merged.icons || {});
  if (icons.length) L.push('## 本集圖示表', '', '| 物件 | 圖示 |', '|---|---|', ...icons.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`), '');
  const chapterOf = (seg) => {
    const n = Number(String(seg.from || seg.at || '').match(/^#(\d+)/)?.[1]);
    const p = parts.find((x) => n >= x.firstN && n <= x.lastN);
    return p ? p.title : '—';
  };
  L.push('## 總覽', '', '| 段 | 章 | 句號 | 時間碼 | 版面 | 卡片類型 | 一句話摘要 |', '|---|---|---|---|---|---|---|');
  for (const s of segs) {
    const it = items.get(s.id);
    L.push(`| ${s.id} | ${cell(chapterOf(s))} | ${cell(cueRange(s, it))} | ${clock(it?.start)}–${clock(it?.end)} | ${layoutOf(it)} | ${cell(cardLabel(s, it))} | ${cell(s.story?.say || s.story?.idea || '—')} |`);
  }
  L.push('');
  L.push('## 情境判定', '', '| 段 | 講解在講什麼 | SITUATIONS §3 哪一列 | 首選 | 為什麼不是動畫 |', '|---|---|---|---|---|');
  for (const s of segs) {
    const it = items.get(s.id);
    const isAnim = s.type === 'custom';
    L.push(`| ${s.id} | ${cell(s.story?.say || '—')} | ${cell(s.story?.row || (s.design ? '內容設計' : '—'))} | ${cell(cardLabel(s, it))} | ${isAnim || s.type === 'media' ? '—（做動畫）'.replace('—（做動畫）', s.type === 'media' ? '—（有素材）' : '—（做動畫）') : cell(s.story?.notAnim || '首選是字卡')} |`);
  }
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
  const decide = [...(merged.decide || [])];
  if (!plan.outro) decide.push('結尾要不要配樂：要的話告訴我從哪一句起');
  decide.forEach((d, i) => L.push(`${i + 1}. ${cell(d)}`));
  L.push('');
  L.push('### 金句候選（勾了才上，每集最多 6 則）', '', '| 候選 | 句號 | 原句 | 卡上文字（≤ 14 字） | 情緒（正／負／中） | 要不要 ☐ |', '|---|---|---|---|---|---|');
  (merged.quotes || []).forEach((q, i) => {
    const on = segs.some((s) => s.id === `q${String(i + 1).padStart(2, '0')}`);
    L.push(`| ${i + 1} | #${q.n} | ${cell(q.text)} | ${cell(q.card)} | ${cell(q.mood || '中')} | ${on ? '☑' : '☐'} |`);
  });
  L.push('');
  return `${L.join('\n')}\n`;
}

const SFX_RE = /^(.+)$/;

// 把網頁改到的東西套回 plan.json。回傳改了什麼；「想換成」「補充說明」不自動做，列出來給 AI
export function applyStoryboard(md, plan, { scenes = [], specs = new Map() } = {}) {
  const doc = parseStoryboard(md);
  const next = JSON.parse(JSON.stringify(plan));
  const byId = new Map((next.scenes || []).map((s) => [s.id, s]));
  const changes = [], requests = [], unmatched = [];
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
  const cueOf = (s) => Number(String(s.from || s.at || '').match(/^#(\d+)/)?.[1] ?? 0);
  next.scenes = (next.scenes || []).map((s, i) => [s, i]).sort((a, b) => cueOf(a[0]) - cueOf(b[0]) || a[1] - b[1]).map(([s]) => s);
  return { plan: next, changes, requests, unmatched, changed: changes.length > 0 };
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

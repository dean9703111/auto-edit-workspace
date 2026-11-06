// 分鏡表頁（停點 ③）：讀 /api/storyboard 畫每一段。使用者能動的只有：畫面上要呈現的文字、下拉選單（呈現方式、音效）、金句勾選、每段的補充說明；
// 都存回 work/storyboard.md（/api/storyboard/save 只動改到的那幾行）。AI 看到「想換成」「補充說明」會重做那一段（auto-edit-storyboard）。
const $ = (id) => document.getElementById(id);
const POLL_MS = 4000;   // 每 4 秒看一次 storyboard.md 有沒有變（AI 改檔、重截圖、停點 ③ 通過後變唯讀）
const CHECKED = /^(☑|☒|✅|✔|✓|\[x\]|x|v|要)$/i;
const WIDE_COL = /畫面上出現什麼|動態|怎麼來|講解在講什麼|一句話摘要|原句|為什麼不是動畫|SITUATIONS/;
const TEXT_COL = /^(畫面上出現什麼|卡上文字)/;
const QUOTED = /(「[^」]*」)/;
const OWN_ROW = new Set(['版面', '想換成', '音效', '補充說明']);   // 這幾個欄位有自己的控制項，不當一般文字列
const SHOWN_LABEL = { 起點那句字幕: '從這句開始', 理由: '為什麼這樣做' };   // 給使用者看的欄位（白話名稱）；其他收進「AI 的備註」
const BEAT_COLS = /^(拍|講到|畫面上出現什麼)/;   // 動畫分鏡只顯示這三欄，其他欄給工具和 AI 用，一樣留在檔案裡
const HIDDEN_GROUP = /^插圖清單/;                // 給 AI 畫圖用的清單，不顯示

let state = null;
let saving = Promise.resolve();
let pendingSaves = 0;
let stale = false;            // 有新內容要畫，但使用者正在打字：等離開欄位再畫
let domSig = null;            // 畫面上的行號是照哪個結構畫的；和 state.sig 不同就不能照行號寫
const folds = new Map();      // 使用者開合過的區塊，重畫後維持
const lost = [];              // 沒存到的文字：讓使用者可以複製回去

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const canEdit = () => state && !state.readOnly;
const typing = () => !!document.activeElement?.matches?.('.sb-edit, .sb-piece, .sb-note-box textarea');
const oneLine = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();

function setSave(kind, text) {
  const el = $('saveState');
  el.dataset.state = kind;
  el.querySelector('.txt').textContent = text;
}
const savedText = () => (state?.readOnly ? '只能看' : state?.exists ? `已存到 ${state.file}` : '等 AI 寫分鏡表');

// ---------- 要呈現的文字 ----------
function editable(value, attrs, label) {
  if (!canEdit()) return `<div class="sb-read">${inline(value)}</div>`;
  return `<div class="sb-edit${value ? '' : ' empty'}" data-raw="${esc(value)}" ${attrs} contenteditable="plaintext-only" role="textbox" aria-label="${esc(label)}">${inline(value)}</div>`;
}

// 「」裡面才是畫面上的字：只開放改這幾段，旁邊的欄位名、綁句工具在用，不能動
function friendlyFixed(p) {
  // 欄位代號（cards、lead）、綁句（綁 `#3@YouTube`）是工具在用的：不顯示，但存檔時原樣組回去；字數上限留著
  const limit = p.match(/各?\s*\d+\s*字以內|上限\s*\d+/)?.[0];
  if (/`|#\d|綁/.test(p)) return limit ? `<span class="sb-limit">${esc(limit.replace(/\s+/g, ' '))}</span>` : '';
  const text = p.replace(/[A-Za-z_][\w-]*/g, '').trim();
  return /[\u4e00-\u9fff]/.test(text) ? inline(text) : ' ';
}

function textField(value, attrs, label) {
  if (!canEdit() || !QUOTED.test(value)) return editable(value, attrs, label);
  const parts = value.split(QUOTED).filter((p) => p !== '').map((p) => {
    if (!QUOTED.test(p)) return `<span class="sb-fixed" data-raw="${esc(p)}">${friendlyFixed(p)}</span>`;
    const t = p.slice(1, -1);
    return `<span class="sb-fixed" data-raw="「"></span><span class="sb-piece" data-raw="${esc(t)}" contenteditable="plaintext-only" role="textbox" aria-label="${esc(label)}">${esc(t)}</span><span class="sb-fixed" data-raw="」"></span>`;
  }).join('');
  return `<div class="sb-pieces" data-raw="${esc(value)}" ${attrs}>${parts}</div>`;
}

// `#6@儲存`＋0.2 → 儲存＋0.2；`#14` → 第 14 句
const friendlyBind = (v) => v.replace(/`?#(\d+)e?@([^`]*)`?/g, '$2').replace(/`?#(\d+)e?`?/g, '第 $1 句');

function tableHtml(t) {
  const on = canEdit();
  const beats = t.head.some((h) => h.startsWith('畫面上出現什麼'));
  const cols = t.head.map((h, c) => ({ h, c })).filter(({ h }) => !beats || BEAT_COLS.test(h));
  const checkCol = t.head.findIndex((h) => h.includes('☐'));
  const head = cols.map(({ h }) => `<th scope="col">${inline(beats ? (h === '拍' ? '順序' : h.replace(/（.*$/, '')) : h)}</th>`).join('');
  const rows = t.rows.map((r) => `<tr>${cols.map(({ h, c }) => {
    const v = r.cells[c] ?? '';
    if (c === checkCol) return `<td class="check"><input type="checkbox" ${CHECKED.test(v) ? 'checked' : ''} ${on ? '' : 'disabled'} data-line="${r.line}" data-col="${c}" aria-label="${esc(h)}：${esc(r.cells[0] ?? '')}"></td>`;
    const cls = WIDE_COL.test(h) ? 'wide' : '';
    // 「收」那一拍是動畫的收尾，不是畫面上的字
    if (TEXT_COL.test(h) && r.cells[0] !== '收') return `<td class="${cls}">${textField(v, `data-line="${r.line}" data-col="${c}"`, h)}</td>`;
    return `<td class="${cls}"><div class="sb-read">${inline(beats ? friendlyBind(v) : v)}</div></td>`;
  }).join('')}</tr>`).join('');
  return `<div class="sb-tablewrap"><table class="sb-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function readRow(b, n) {
  const shown = SHOWN_LABEL[b.label] || b.label;
  const label = b.label ? `<span class="sb-label">${inline(shown)}</span>` : '';
  const row = `<div class="sb-field${b.label ? '' : ' nolabel'}">${label}<div class="sb-read">${inline(b.value)}</div></div>`;
  return b.ordered ? `<div class="sb-ordered"><span class="sb-mark">${n}.</span>${row}</div>` : row;
}

function blocksHtml(blocks) {
  let n = 0;
  return blocks.map((b) => {
    if (b.type !== 'item' || !b.ordered) n = 0;
    if ((b.type === 'item' || b.type === 'para') && OWN_ROW.has(b.label)) return '';
    if (b.type === 'item' && b.label === '畫面文字') return `<div class="sb-field"><span class="sb-label">畫面文字</span>${textField(b.value, `data-line="${b.line}"`, '畫面文字')}</div>`;
    if (b.type === 'item' || b.type === 'para') return readRow(b, b.ordered ? ++n : 0);
    if (b.type === 'table') return tableHtml(b);
    if (b.type === 'code') return `<pre class="sb-pre">${esc(b.lines.join('\n'))}</pre>`;
    if (b.type === 'heading') return `<h3 class="sb-subhead">${inline(b.text)}</h3>`;
    return '';
  }).join('');
}

function shotHtml(b) {
  return b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener" title="放大看 ${esc(b.alt)}"><img src="${esc(b.url)}" alt="${esc(b.alt)} 的分鏡截圖" loading="lazy"></a>` : `<div class="sb-noimg">截圖還沒產生<br>${esc(b.alt || b.src)}</div>`;
}

// ---------- 下拉選單 ----------
const fieldOf = (s, label) => s.blocks.find((b) => b.type === 'item' && b.label === label);
const allScenes = () => (state.options?.scenes || []).flatMap((g) => g.items);

// 目前這段用哪個情境：看總覽的「卡片類型」與「版面」那一行（x-process、14 講者介紹）
function currentScene(s) {
  const text = `${state.overview[s.id]?.card || ''} ${fieldOf(s, '版面')?.value || ''}`;
  const x = text.match(/x-[\w-]+/)?.[0];
  const no = text.match(/(?:^|[\s（(])(\d{2}[a-d]?)(?=\s)/)?.[1];
  return allScenes().find((i) => i.id === (x || no)) || null;
}

function sceneSelect(s) {
  const cur = currentScene(s), wish = fieldOf(s, '想換成')?.value || '';
  const chosen = allScenes().find((i) => i.value === wish) || cur;
  const here = state.overview[s.id]?.card || fieldOf(s, '版面')?.value || '';
  const groups = (state.options?.scenes || []).map((g) => `<optgroup label="${esc(`${g.name}：${g.hint}`)}">${g.items.map((i) => `<option value="${esc(i.value)}" ${i === chosen ? 'selected' : ''}>${esc(i.label)}${i === cur ? '（目前）' : ''}</option>`).join('')}</optgroup>`).join('');
  const unknown = !chosen ? `<option value="" selected>${esc(wish || here || '目前的呈現方式')}</option>` : '';
  const when = chosen?.when ? `<span class="sb-hint">${esc(chosen.when)}</span>` : '';
  const see = chosen?.preview ? `<a href="${esc(state.previewBase + chosen.preview)}" target="_blank" rel="noopener">看範例 ↗</a>` : '';
  const note = wish ? `<div class="sb-wish"><span>已選「${esc(chosen?.label || wish)}」。截圖還是現在的樣子，你說「可以」之後 AI 會照這個重做這段，再給你確認一次。</span>${canEdit() ? `<button type="button" data-cancel-wish="${esc(s.key)}" data-wish="${esc(wish)}">取消</button>` : ''}</div>` : '';
  return `<div class="sb-field"><span class="sb-label">呈現方式</span><div class="sb-select"><select data-scene="${esc(s.key)}" data-current="${esc(cur?.value || '')}" data-wish="${esc(wish)}" ${canEdit() ? '' : 'disabled'} aria-label="${esc(s.id)} 的呈現方式">${unknown}${groups}</select>${see}${when}${note}</div></div>`;
}

function sfxSelect(s) {
  const cur = fieldOf(s, '音效')?.value || '預設';
  const list = state.options?.sfx || [];
  const known = list.some((o) => o.value === cur);
  const opts = (known ? '' : `<option value="${esc(cur)}" selected>${esc(cur)}</option>`) + list.map((o) => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
  return `<div class="sb-field"><span class="sb-label">音效</span><div class="sb-select"><select data-sfx="${esc(s.key)}" data-raw="${esc(fieldOf(s, '音效')?.value || '')}" ${canEdit() ? '' : 'disabled'} aria-label="${esc(s.id)} 的音效">${opts}</select></div></div>`;
}

function noteBox(s, label, placeholder) {
  const v = fieldOf(s, '補充說明')?.value || '';
  if (!canEdit() && !v) return '';
  return `<div class="sb-note-box"><label for="note-${esc(s.key)}">${esc(label)}</label><textarea id="note-${esc(s.key)}" class="${v ? 'has-note' : ''}" data-note="${esc(s.key)}" data-raw="${esc(v)}" placeholder="${esc(placeholder)}" ${canEdit() ? '' : 'readonly'}>${esc(v)}</textarea></div>`;
}

// ---------- 一段 ----------
function groupsOf(blocks) {
  const groups = [];
  let cur = { heading: null, blocks: [] };
  for (const b of blocks) {
    if (b.type === 'heading') { groups.push(cur); cur = { heading: b, blocks: [] }; } else cur.blocks.push(b);
  }
  groups.push(cur);
  return groups;
}

function foldHtml(key, label, open, body, cls = 'sb-fold') {
  const isOpen = folds.has(key) ? folds.get(key) : open;
  return `<details class="${cls}" data-fold="${esc(key)}" ${isOpen ? 'open' : ''}><summary><span>${inline(label)}</span></summary>${body}</details>`;
}

function segHtml(s) {
  const o = state.overview[s.id] || {};
  const time = (s.title.match(/\d+:\d{2}(?:\.\d+)?[–-]\d+:\d{2}(?:\.\d+)?/) || [o.time || ''])[0];
  const name = o.summary || s.title.replace(s.id, '').replace(/^[\s｜|]+/, '');
  const scene = currentScene(s);
  const head = `<div class="sb-sechead"><span class="sb-id">${esc(s.id)}</span><h2>${inline(name)}</h2>${scene ? `<span class="sb-chip">${esc(scene.label)}</span>` : ''}${time ? `<span class="sb-chip time">${esc(time)}</span>` : ''}</div>`;
  const [first, ...rest] = groupsOf(s.blocks);
  const shots = first.blocks.filter((b) => b.type === 'image');
  const rows = first.blocks.filter((b) => b.type !== 'image');
  const by = (label) => rows.filter((b) => b.label === label);
  const backstage = rows.filter((b) => (b.type === 'item' || b.type === 'para') && !SHOWN_LABEL[b.label] && !OWN_ROW.has(b.label) && b.label !== '畫面文字');
  const fields = blocksHtml(by('起點那句字幕')) + sceneSelect(s) + blocksHtml(by('畫面文字')) + sfxSelect(s) + blocksHtml(by('理由'));
  const body = `<div class="sb-segbody${shots.length ? '' : ' noshot'}">${shots.length ? `<div class="sb-shots${shots.length > 1 ? ' many' : ''}">${shots.map(shotHtml).join('')}</div>` : ''}<div class="sb-fields">${fields}</div></div>`;
  const subs = rest.filter((g) => !HIDDEN_GROUP.test(g.heading.text)).map((g) => `<div class="sb-subgroup">${foldHtml(`${s.key}:${g.heading.text}`, g.heading.text.replace(/\s+\S+$/, ''), true, blocksHtml(g.blocks))}</div>`).join('');
  const notes = backstage.length ? `<div class="sb-subgroup">${foldHtml(`${s.key}:notes`, 'AI 的備註', false, `<div class="sb-fields">${blocksHtml(backstage)}</div>`)}</div>` : '';
  const note = noteBox(s, '不滿意這一段？寫下想怎麼改', '例如：這段不要放字卡，想看到手機和電腦兩個畫面對比。你說「可以」之後 AI 會照這裡調整。');
  return `<article class="sb-panel sb-sec" id="sec-${esc(s.key)}">${head}${body}${subs}${note}${notes}</article>`;
}

const isDecide = (s) => /需要.*決定/.test(s.title);

function otherHtml(s) {
  const decide = isDecide(s);
  const title = s.title || '開頭說明';
  const inner = `<div class="sb-fields">${blocksHtml(s.blocks)}</div>`;
  if (decide) {
    return `<section class="sb-panel sb-sec decide" id="sec-${esc(s.key)}"><div class="sb-sechead"><h2>${inline(title)}</h2></div>${inner}${noteBox(s, '在這裡回答', '例如：結尾要配樂，從最後一句開始。也可以在對話裡回覆 AI。')}</section>`;
  }
  if (!s.title) return `<section class="sb-panel sb-sec" id="sec-${esc(s.key)}">${foldHtml(s.key, '開頭說明', false, inner, 'sb-fold sb-ref')}</section>`;
  // 參考用的表（總覽、四種版面、圖示表、情境判定…）預設收起來
  return `<section class="sb-panel sb-sec" id="sec-${esc(s.key)}">${foldHtml(s.key, title, false, inner, 'sb-fold sb-ref')}</section>`;
}

function renderNav() {
  const s = state.sections;
  const seg = s.filter((x) => x.id);
  const plain = (x, cls = '') => `<li><a class="plain ${cls}" href="#sec-${esc(x.key)}">${esc(x.title || '開頭說明')}</a></li>`;
  const marked = (x) => (fieldOf(x, '想換成') || fieldOf(x, '補充說明') ? ' changed' : '');
  const segs = seg.map((x) => `<li><a class="${marked(x)}" href="#sec-${esc(x.key)}" title="${esc(state.overview[x.id]?.summary || x.title)}"><span class="sb-navid">${esc(x.id)}</span><span class="sb-navtxt">${esc(state.overview[x.id]?.summary || x.title.replace(x.id, ''))}</span></a></li>`);
  const decide = s.filter((x) => isDecide(x)).map((x) => plain(x, `decide${marked(x)}`));
  const refs = s.filter((x) => !x.id && x.title && !isDecide(x)).map((x) => plain(x, 'ref'));
  $('nav').innerHTML = [segs.join(''), decide.join(''), refs.join('')].filter(Boolean).join('<li class="sb-navgap" aria-hidden="true"></li>');
  $('nav').hidden = !s.length;
  watchSections();
}

function renderSummary() {
  const seg = state.sections.filter((x) => x.id);
  const wishes = seg.filter((x) => fieldOf(x, '想換成') || fieldOf(x, '補充說明')).length;
  const pick = state.sections.flatMap((x) => x.blocks).find((b) => b.type === 'table' && b.head.some((h) => h.includes('☐')));
  let picks = '';
  if (pick) {
    const col = pick.head.findIndex((h) => h.includes('☐'));
    picks = `，金句勾了 ${pick.rows.filter((r) => CHECKED.test(r.cells[col] ?? '')).length}／${pick.rows.length}`;
  }
  $('summary').textContent = seg.length ? `${seg.length} 段${wishes ? `，${wishes} 段要 AI 調整` : ''}${picks}` : '';
}

function renderBanner() {
  const out = [];
  if (state.readOnly) out.push('<p class="sb-banner">分鏡表已經確認（製作進度的停點 ③ 已通過），這一頁現在只能看。要改請在對話跟 AI 說段號，例如「s12 重新設計」，或打開剪輯台。</p>');
  for (const w of state.warnings || []) out.push(`<p class="sb-banner err">⚠ ${esc(w)}</p>`);
  if (lost.length) out.push(`<div class="sb-banner err">這些內容剛剛沒存到（檔案被改過），請複製後貼回去：${lost.map((t) => `<blockquote>${esc(t)}</blockquote>`).join('')}<button data-lost-clear>知道了</button></div>`);
  $('banner').innerHTML = out.join('');
}

function render() {
  stale = false;
  domSig = state.sig;
  $('projName').textContent = state.project;
  const empty = !state.exists ? 'AI 還在寫分鏡表，寫好後這一頁會自動更新。' : !state.sections.length ? 'work/storyboard.md 還沒有內容。' : '';
  $('empty').hidden = !empty;
  $('empty').textContent = empty;
  $('intro').hidden = !state.exists || !state.sections.length;
  $('hint').hidden = state.readOnly;
  // 閱讀順序：每一段 → 要決定的事 → 參考資料（檔案裡的順序不動）
  const rank = (s) => (s.id ? 0 : isDecide(s) ? 1 : 2);
  $('sections').innerHTML = [...state.sections].sort((a, b) => rank(a) - rank(b)).map((s) => (s.id ? segHtml(s) : otherHtml(s))).join('');
  renderBanner();
  renderNav();
  renderSummary();
  const next = $('next');
  next.hidden = !state.exists || state.readOnly;
  next.innerHTML = '都看完後回到對話，跟 AI 說「<b>可以</b>」。有選「想換成」或寫補充說明的段，AI 會先重做再給你確認。';
  if (!pendingSaves) setSave('saved', savedText());
}

// ---------- 存檔（一次存一個，照順序；每次都帶最新的 hash） ----------
function send(op, { onConflict, onNetwork } = {}) {
  pendingSaves++;
  setSave('busy', '儲存中…');
  saving = saving.then(async () => {
    try {
      const res = await fetch('/api/storyboard/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hash: state.hash, ...op }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        onConflict?.(body.message);
        if (body.state) state = body.state;
        else if (res.status === 409) state = await load();
        stale = true;
        setSave('error', body.message || '沒有存到');
        return false;
      }
      const shapeChanged = body.sig !== state.sig;
      state = body;
      renderBanner();
      renderSummary();
      if (shapeChanged) stale = true;
      return true;
    } catch {
      onNetwork?.();
      setSave('error', '連不到剪輯服務，請確認還開著');
      return false;
    } finally {
      pendingSaves--;
      if (!pendingSaves) {
        if ($('saveState').dataset.state !== 'error') setSave('saved', savedText());
        if (stale && !typing()) { const err = $('saveState').dataset.state === 'error' ? $('saveState').querySelector('.txt').textContent : null; render(); if (err) setSave('error', err); }
      }
    }
  });
  return saving;
}

// 離開欄位：整格（或整行）組回去，有變才存
function saveText(el) {
  const box = el.closest('.sb-pieces') || el;
  const pieces = box.classList.contains('sb-pieces');
  const value = pieces
    ? [...box.children].map((c) => (c.classList.contains('sb-piece') ? oneLine(c.textContent) : c.dataset.raw)).join('')
    : oneLine(el.textContent);
  const raw = box.dataset.raw;
  const typed = oneLine(el.textContent);
  if (!pieces) { el.innerHTML = inline(value); el.classList.toggle('empty', !value); }
  if (value === raw) return;
  // 畫面的行號已經過期（結構剛變、還沒重畫）：不照舊行號寫，把文字留給使用者
  if (domSig !== state.sig) { if (typed) lost.push(typed); stale = true; renderBanner(); return; }
  box.dataset.raw = value;
  el.classList.remove('unsaved');
  const line = Number(box.dataset.line);
  const op = box.dataset.col != null ? { op: 'cell', line, col: Number(box.dataset.col), text: value, expect: raw } : { op: 'text', line, text: value, expect: raw };
  send(op, {
    onConflict: () => { if (typed) lost.push(typed); },
    onNetwork: () => { box.dataset.raw = raw; el.classList.add('unsaved'); },   // 下次離開欄位再存一次
  });
}

function saveNote(t) {
  const value = oneLine(t.value), raw = t.dataset.raw;
  if (value === raw) return;
  t.dataset.raw = value;
  send({ op: 'field', key: t.dataset.note, label: '補充說明', value, expect: raw }, {
    onConflict: () => { if (value) lost.push(value); },
    onNetwork: () => { t.dataset.raw = raw; },
  });
}

// ---------- 事件 ----------
const secs = $('sections');
const EDIT = '.sb-edit, .sb-piece';
secs.addEventListener('focusin', (e) => {
  const el = e.target.closest(EDIT);
  if (!el || !el.isContentEditable) return;
  el.classList.remove('empty');
  // 有 `code`、**粗體** 時換回原文再改；純文字不動，游標留在點的地方
  if (el.textContent !== el.dataset.raw) {
    el.textContent = el.dataset.raw;
    const sel = getSelection();
    sel.selectAllChildren(el);
    sel.collapseToEnd();
  }
});
secs.addEventListener('focusout', (e) => {
  const el = e.target.closest(EDIT);
  if (el?.isContentEditable) saveText(el);
  if (e.target.matches('.sb-note-box textarea')) saveNote(e.target);
  setTimeout(() => { if (stale && !typing() && !pendingSaves) render(); }, 0);
});
secs.addEventListener('keydown', (e) => {
  const el = e.target.closest(EDIT);
  if (!el) return;
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); el.blur(); }
  if (e.key === 'Escape') {
    el.textContent = el.dataset.raw;
    el.blur();
  }
});
secs.addEventListener('change', async (e) => {
  const t = e.target;
  if (domSig !== state.sig) { render(); return; }
  if (t.matches('td.check input')) {
    send({ op: 'cell', line: Number(t.dataset.line), col: Number(t.dataset.col), text: t.checked ? '☑' : '☐' });
    return;
  }
  const refocus = (selector) => document.querySelector(selector)?.focus();
  if (t.dataset.scene) {
    // 選回目前的情境＝取消這個要求
    const value = t.value === t.dataset.current ? '' : t.value;
    await send({ op: 'field', key: t.dataset.scene, label: '想換成', value, expect: t.dataset.wish });
    refocus(`select[data-scene="${CSS.escape(t.dataset.scene)}"]`);
  } else if (t.dataset.sfx) {
    await send({ op: 'field', key: t.dataset.sfx, label: '音效', value: t.value, expect: t.dataset.raw });
    refocus(`select[data-sfx="${CSS.escape(t.dataset.sfx)}"]`);
  }
});
secs.addEventListener('click', (e) => {
  const t = e.target.closest('[data-cancel-wish]');
  if (t) send({ op: 'field', key: t.dataset.cancelWish, label: '想換成', value: '', expect: t.dataset.wish });
});
secs.addEventListener('toggle', (e) => {
  if (e.target.matches('details[data-fold]')) folds.set(e.target.dataset.fold, e.target.open);
}, true);
$('banner').addEventListener('click', (e) => {
  if (e.target.closest('[data-lost-clear]')) { lost.length = 0; renderBanner(); }
});

// ---------- 目錄跟著捲動 ----------
let observer = null;
function watchSections() {
  observer?.disconnect();
  observer = new IntersectionObserver((list) => {
    for (const en of list) {
      if (!en.isIntersecting) continue;
      document.querySelectorAll('#nav a.on').forEach((a) => a.classList.remove('on'));
      const a = document.querySelector(`#nav a[href="#${CSS.escape(en.target.id)}"]`);
      if (a) { a.classList.add('on'); a.scrollIntoView({ block: 'nearest' }); }
    }
  }, { rootMargin: '-10% 0px -80% 0px' });
  document.querySelectorAll('.sb-sec').forEach((el) => observer.observe(el));
}
$('nav').addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  const sec = a && document.getElementById(a.getAttribute('href').slice(1));
  const fold = sec?.querySelector(':scope > details[data-fold]');
  if (fold) fold.open = true;
});
// 破圖（截圖被 qc.mjs storyboard 換掉的瞬間）改顯示提示
secs.addEventListener('error', (e) => {
  if (e.target.tagName !== 'IMG') return;
  const box = document.createElement('div');
  box.className = 'sb-noimg';
  box.textContent = '截圖讀不到';
  e.target.closest('a')?.replaceWith(box);
}, true);

// ---------- 載入與同步 ----------
async function load() {
  const res = await fetch('/api/storyboard', { cache: 'no-store' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `HTTP ${res.status}`);
  return res.json();
}
async function refresh(first = false) {
  try {
    const next = await load();
    if (first || !state) { state = next; render(); if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView(); return; }
    // 打字中不換內容：畫面的行號要和 state.hash 是同一版，離開欄位時用舊 hash 存，檔案變過就會被擋下
    if (pendingSaves || typing() || (next.hash === state.hash && next.readOnly === state.readOnly)) return;
    state = next;
    render();
  } catch (e) {
    if (first) { $('empty').hidden = false; $('empty').textContent = `讀不到分鏡表：${e.message}`; }
    setSave('error', '連不到剪輯服務，請確認還開著');
  }
}
refresh(true);
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);

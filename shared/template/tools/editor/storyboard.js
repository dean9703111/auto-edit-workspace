// 分鏡表頁（停點 ③）：讀 /api/storyboard 畫每一段，點文字就能改，離開欄位就存（/api/storyboard/save 只動改到的那幾行）。
const $ = (id) => document.getElementById(id);
const POLL_MS = 4000;   // 每 4 秒看一次 storyboard.md 有沒有變（AI 改檔、重截圖、停點 ③ 通過後變唯讀）
const CHECKED = /^(☑|☒|✅|✔|✓|\[x\]|x|v|要)$/i;
const WIDE_COL = /畫面上出現什麼|動態|怎麼來|講解在講什麼|一句話摘要|原句|為什麼不是動畫|SITUATIONS/;

let state = null;
let saving = Promise.resolve();
let pendingSaves = 0;
let stale = false;            // 有新內容要畫，但使用者正在打字：等離開欄位再畫
let domSig = null;            // 畫面上的行號是照哪個結構畫的；和 state.sig 不同就不能照行號寫
const rawOpen = new Map();    // 正在用原始 Markdown 改的段：key → 目前的文字
const rawBase = new Map();    // 打開原始 Markdown 時這一段的內容（中途被改過就不蓋掉）
const folds = new Map();      // 使用者開合過的區塊，重畫後維持
const lost = [];              // 沒存到的文字：讓使用者可以複製回去

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const canEdit = () => state && !state.readOnly;
const typing = () => document.activeElement?.matches?.('.sb-edit') || rawOpen.size > 0;

function setSave(kind, text) {
  const el = $('saveState');
  el.dataset.state = kind;
  el.querySelector('.txt').textContent = text;
}
const savedText = () => (state?.readOnly ? '只能看' : state?.exists ? `已存到 ${state.file}` : '等 AI 寫分鏡表');

// ---------- 可編輯的文字 ----------
function editable(value, attrs, label) {
  const on = canEdit();
  return `<div class="sb-edit${value ? '' : ' empty'}" data-raw="${esc(value)}" ${attrs} ${on ? 'contenteditable="plaintext-only" role="textbox"' : ''} aria-label="${esc(label)}">${inline(value)}</div>`;
}

function tableHtml(t) {
  const on = canEdit();
  const checkCol = t.head.findIndex((h) => h.includes('☐'));
  const head = t.head.map((h) => `<th scope="col">${inline(h)}</th>`).join('') + (on ? '<th class="act" aria-label="操作"></th>' : '');
  const rows = t.rows.map((r) => {
    const tds = t.head.map((h, c) => {
      const v = r.cells[c] ?? '';
      if (c === checkCol) return `<td class="check"><input type="checkbox" ${CHECKED.test(v) ? 'checked' : ''} ${on ? '' : 'disabled'} data-line="${r.line}" data-col="${c}" aria-label="${esc(h)}：${esc(r.cells[0] ?? '')}"></td>`;
      return `<td class="${WIDE_COL.test(h) ? 'wide' : ''}">${editable(v, `data-line="${r.line}" data-col="${c}"`, h)}</td>`;
    }).join('');
    return `<tr>${tds}${on ? `<td class="act"><button class="sb-del" data-del="${r.line}" data-expect="${esc(r.cells.join('｜'))}" aria-label="刪除這一列" title="刪除這一列">✕</button></td>` : ''}</tr>`;
  }).join('');
  const add = on ? `<button class="sb-addrow" data-add="${t.rows.at(-1)?.line ?? t.sep}">＋ 加一列</button>` : '';
  return `<div class="sb-tablewrap"><table class="sb-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>${add}`;
}

function fieldHtml(b, n) {
  const box = editable(b.value, `data-line="${b.line}"`, b.label || '內容');
  if (b.ordered) return `<div class="sb-ordered"><span class="sb-mark">${n}.</span><div class="sb-field${b.label ? '' : ' nolabel'}">${b.label ? `<span class="sb-label">${inline(b.label)}</span>` : ''}${box}</div></div>`;
  return `<div class="sb-field${b.label ? '' : ' nolabel'}">${b.label ? `<span class="sb-label">${inline(b.label)}</span>` : ''}${box}</div>`;
}

function blocksHtml(blocks) {
  let n = 0;
  return blocks.map((b) => {
    if (b.type !== 'item' || !b.ordered) n = 0;
    if (b.type === 'item' || b.type === 'para') return fieldHtml(b, b.ordered ? ++n : 0);
    if (b.type === 'table') return tableHtml(b);
    if (b.type === 'code') return `<pre class="sb-pre">${esc(b.lines.join('\n'))}</pre>`;
    if (b.type === 'heading') return `<h3 class="sb-subhead">${inline(b.text)}</h3>`;
    if (b.type === 'image') return shotHtml(b);
    return '';
  }).join('');
}

function shotHtml(b) {
  const missing = `<div class="sb-noimg">截圖還沒產生<br>${esc(b.alt || b.src)}</div>`;
  return b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener" title="放大看 ${esc(b.alt)}"><img src="${esc(b.url)}" alt="${esc(b.alt)} 的分鏡截圖" loading="lazy"></a>` : missing;
}

// 一段切成：截圖＋欄位（第一個小標題之前）、每個小標題一組（動畫分鏡、插圖清單）
function groupsOf(blocks) {
  const groups = [];
  let cur = { heading: null, blocks: [] };
  for (const b of blocks) {
    if (b.type === 'heading') { groups.push(cur); cur = { heading: b, blocks: [] }; } else cur.blocks.push(b);
  }
  groups.push(cur);
  return groups;
}

function foldHtml(key, label, open, body, cls = 'sb-fold', extra = '') {
  const isOpen = folds.has(key) ? folds.get(key) : open;
  return `<details class="${cls}" data-fold="${esc(key)}" ${isOpen ? 'open' : ''}><summary><span>${inline(label)}</span>${extra}</summary>${body}</details>`;
}

function rawHtml(s) {
  const text = rawOpen.get(s.key);
  return `<div class="sb-rawbox" data-raw-box="${esc(s.key)}">
    <textarea rows="${Math.min(30, Math.max(6, text.split('\n').length + 1))}" aria-label="${esc(s.id || s.title)} 的原始 Markdown">${esc(text)}</textarea>
    <div class="sb-rawbar"><span>可以加減段落、清單和表格欄；第一行的標題和動畫分鏡的表頭請保留。</span><button data-raw-cancel="${esc(s.key)}">取消</button><button class="primary" data-raw-save="${esc(s.key)}">存回 work/storyboard.md</button></div>
  </div>`;
}

const rawBtn = (s) => (canEdit() && !rawOpen.has(s.key) ? `<button class="sb-rawbtn" data-raw-open="${esc(s.key)}">改原始 Markdown</button>` : '');

function segHtml(s) {
  const o = state.overview[s.id] || {};
  const time = (s.title.match(/\d+:\d{2}(?:\.\d+)?[–-]\d+:\d{2}(?:\.\d+)?/) || [o.time || ''])[0];
  const name = o.summary || s.title.replace(s.id, '').replace(/^[\s｜|]+/, '');
  const chips = [o.layout, o.card].filter(Boolean).map((c) => `<span class="sb-chip">${esc(c)}</span>`).join('');
  const head = `<div class="sb-sechead"><span class="sb-id">${esc(s.id)}</span><h2>${inline(name)}</h2>${chips}${time ? `<span class="sb-chip time">${esc(time)}</span>` : ''}${rawBtn(s)}</div>`;
  if (rawOpen.has(s.key)) return `<article class="sb-panel sb-sec" id="sec-${esc(s.key)}">${head}${rawHtml(s)}</article>`;
  const [first, ...rest] = groupsOf(s.blocks);
  const shots = first.blocks.filter((b) => b.type === 'image');
  const fields = first.blocks.filter((b) => b.type !== 'image');
  const body = `<div class="sb-segbody${shots.length ? '' : ' noshot'}">${shots.length ? `<div class="sb-shots${shots.length > 1 ? ' many' : ''}">${shots.map(shotHtml).join('')}</div>` : ''}<div class="sb-fields">${blocksHtml(fields)}</div></div>`;
  const subs = rest.map((g) => `<div class="sb-subgroup">${foldHtml(`${s.key}:${g.heading.text}`, g.heading.text, !/^插圖清單/.test(g.heading.text), blocksHtml(g.blocks))}</div>`).join('');
  return `<article class="sb-panel sb-sec" id="sec-${esc(s.key)}">${head}${body}${subs}</article>`;
}

const isDecide = (s) => /需要.*決定/.test(s.title);
const isOverview = (s) => s.blocks.some((b) => b.type === 'table' && b.head.includes('一句話摘要'));

function otherHtml(s) {
  const decide = isDecide(s);
  const title = s.title || '開頭說明';
  const inner = rawOpen.has(s.key) ? rawHtml(s) : `<div class="sb-fields">${blocksHtml(s.blocks)}</div>`;
  if (decide || isOverview(s)) {
    return `<section class="sb-panel sb-sec${decide ? ' decide' : ''}" id="sec-${esc(s.key)}"><div class="sb-sechead"><h2>${inline(title)}</h2>${rawBtn(s)}</div>${decide ? `<p class="sb-note">${canEdit() ? '可以直接改這裡，勾好金句，或在對話裡回覆 AI。' : '這幾項是當時要決定的事。'}</p>` : ''}${inner}</section>`;
  }
  if (rawOpen.has(s.key)) return `<section class="sb-panel sb-sec" id="sec-${esc(s.key)}"><div class="sb-sechead"><h2>${inline(title)}</h2></div>${inner}</section>`;
  // 開頭那幾行（講者框）直接顯示；參考用的表（四種版面、圖示表、情境判定…）預設收起來
  if (!s.title) return `<section class="sb-panel sb-sec sb-lead" id="sec-${esc(s.key)}">${inner}${rawBtn(s)}</section>`;
  return `<section class="sb-panel sb-sec" id="sec-${esc(s.key)}">${foldHtml(s.key, title, false, inner, 'sb-fold sb-ref', rawBtn(s))}</section>`;
}

function renderNav() {
  const s = state.sections;
  const seg = s.filter((x) => x.id);
  const plain = (x, cls = '') => `<li><a class="plain ${cls}" href="#sec-${esc(x.key)}">${esc(x.title || '開頭說明')}</a></li>`;
  const top = s.filter((x) => isDecide(x)).map((x) => plain(x, 'decide')).concat(s.filter((x) => isOverview(x)).map((x) => plain(x)));
  const segs = seg.map((x) => `<li><a href="#sec-${esc(x.key)}" title="${esc(state.overview[x.id]?.summary || x.title)}"><span class="sb-navid">${esc(x.id)}</span><span class="sb-navtxt">${esc(state.overview[x.id]?.summary || x.title.replace(x.id, ''))}</span></a></li>`);
  const refs = s.filter((x) => !x.id && x.title && !isDecide(x) && !isOverview(x)).map((x) => plain(x));
  $('nav').innerHTML = [top.join(''), segs.join(''), refs.join('')].filter(Boolean).join('<li class="sb-navgap" aria-hidden="true"></li>');
  $('nav').hidden = !s.length;
  watchSections();
}

function renderSummary() {
  const seg = state.sections.filter((x) => x.id);
  const beats = seg.filter((x) => x.blocks.some((b) => b.type === 'heading' && /^動畫分鏡/.test(b.text))).length;
  const pick = state.sections.flatMap((x) => x.blocks).find((b) => b.type === 'table' && b.head.some((h) => h.includes('☐')));
  let picks = '';
  if (pick) {
    const col = pick.head.findIndex((h) => h.includes('☐'));
    picks = `，金句勾了 ${pick.rows.filter((r) => CHECKED.test(r.cells[col] ?? '')).length}／${pick.rows.length}`;
  }
  $('summary').textContent = seg.length ? `${seg.length} 段，動畫 ${beats} 段${picks}` : '';
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
  $('sections').innerHTML = state.sections.map((s) => (s.id ? segHtml(s) : otherHtml(s))).join('');
  renderBanner();
  renderNav();
  renderSummary();
  const next = $('next');
  next.hidden = !state.exists || state.readOnly;
  next.innerHTML = '改好後回到對話，跟 AI 說「<b>可以</b>」；AI 會照這份內容製作。也可以直接說要改哪一段。';
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

function saveField(el) {
  const raw = el.dataset.raw;
  const value = el.textContent.replace(/\s*\n\s*/g, ' ').trim();
  el.innerHTML = inline(value);
  el.classList.toggle('empty', !value);
  if (value === raw) return;
  el.dataset.raw = value;
  el.classList.remove('unsaved');
  // 畫面的行號已經過期（結構剛變、還沒重畫）：不照舊行號寫，把文字留給使用者
  if (domSig !== state.sig) { lost.push(value); stale = true; renderBanner(); return; }
  const line = Number(el.dataset.line);
  const op = el.dataset.col != null ? { op: 'cell', line, col: Number(el.dataset.col), text: value, expect: raw } : { op: 'text', line, text: value, expect: raw };
  send(op, {
    onConflict: () => { if (value) lost.push(value); },
    onNetwork: () => { el.dataset.raw = raw; el.classList.add('unsaved'); },   // 下次離開欄位再存一次
  });
}

// ---------- 事件 ----------
const secs = $('sections');
secs.addEventListener('focusin', (e) => {
  const el = e.target.closest('.sb-edit');
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
  const el = e.target.closest('.sb-edit');
  if (el?.isContentEditable) saveField(el);
  setTimeout(() => { if (stale && !typing() && !pendingSaves) render(); }, 0);
});
secs.addEventListener('keydown', (e) => {
  const el = e.target.closest('.sb-edit');
  if (!el) return;
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); el.blur(); }
  if (e.key === 'Escape') { el.textContent = el.dataset.raw; el.blur(); }
});
secs.addEventListener('change', (e) => {
  if (e.target.matches('td.check input')) {
    const { line, col } = e.target.dataset;
    if (domSig !== state.sig) { render(); return; }
    send({ op: 'cell', line: Number(line), col: Number(col), text: e.target.checked ? '☑' : '☐' });
  }
});
secs.addEventListener('input', (e) => {
  const box = e.target.closest('[data-raw-box]');
  if (box) rawOpen.set(box.dataset.rawBox, e.target.value);
});
secs.addEventListener('toggle', (e) => {
  if (e.target.matches('details[data-fold]')) folds.set(e.target.dataset.fold, e.target.open);
}, true);
secs.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if ((t.dataset.add != null || t.dataset.del != null) && domSig !== state.sig) { render(); return; }
  if (t.dataset.add != null) { send({ op: 'addRow', line: Number(t.dataset.add) }); return; }
  if (t.dataset.del != null) {
    // 按兩次才刪：第一次變成「確定刪除」，3 秒沒按就還原
    if (!t.classList.contains('armed')) {
      t.classList.add('armed');
      t.textContent = '確定刪除';
      setTimeout(() => { t.classList.remove('armed'); t.textContent = '✕'; }, 3000);
      return;
    }
    t.disabled = true;
    send({ op: 'delRow', line: Number(t.dataset.del), expect: t.dataset.expect });
    return;
  }
  if (t.dataset.rawOpen != null) {
    const s = state.sections.find((x) => x.key === t.dataset.rawOpen);
    rawOpen.set(s.key, s.raw);
    rawBase.set(s.key, s.raw);
    render();
    document.querySelector(`[data-raw-box="${CSS.escape(s.key)}"] textarea`)?.focus();
    return;
  }
  if (t.dataset.rawCancel != null) { rawOpen.delete(t.dataset.rawCancel); rawBase.delete(t.dataset.rawCancel); render(); return; }
  if (t.dataset.rawSave != null) {
    const key = t.dataset.rawSave, text = rawOpen.get(key);
    const closeRaw = () => { rawOpen.delete(key); rawBase.delete(key); render(); };
    // 打開之後這一段被改過（AI 或別的存檔）：不蓋掉，把文字留給使用者
    if (state.sections.find((x) => x.key === key)?.raw !== rawBase.get(key)) { lost.push(text); closeRaw(); setSave('error', '這一段剛被改過，沒有存'); return; }
    t.disabled = true;
    let conflict = null;
    const ok = await send({ op: 'raw', key, text }, { onConflict: (m) => { conflict = m; } });
    if (ok) { closeRaw(); return; }
    t.disabled = false;
    if (conflict && /剛被改過/.test(conflict)) { lost.push(text); closeRaw(); setSave('error', conflict); }
  }
});
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

// 分鏡表頁（停點 ③）：讀 /api/storyboard 畫每一段。使用者能動的只有：畫面上要呈現的文字、下拉選單（呈現方式、音效）、金句勾選、每段的補充說明；
// 都存回 work/storyboard.md（/api/storyboard/save 只動改到的那幾行）。AI 看到「想換成」「補充說明」會重做那一段（auto-edit-storyboard）。
const $ = (id) => document.getElementById(id);
const POLL_MS = 4000;   // 每 4 秒看一次 storyboard.md 有沒有變（AI 改檔、重截圖、停點 ③ 通過後變唯讀）
const AUTOSAVE_MS = 800;   // 停手多久就自動存（打字中的欄位不用等離開）
const CHECKED = /^(☑|☒|✅|✔|✓|\[x\]|x|v|要)$/i;
const WIDE_COL = /畫面上出現什麼|動態|怎麼來|講解在講什麼|一句話摘要|原句|為什麼不是動畫|SITUATIONS/;
const TEXT_COL = /^(畫面上出現什麼|卡上文字)/;
const QUOTED = /(「[^」]*」)/;
const OWN_ROW = new Set(['版面', '想換成', '音效', '補充說明']);   // 這幾個欄位有自己的控制項，不當一般文字列
const SHOWN_LABEL = { 起點那句字幕: '從這句開始', 概念: '概念', 畫面: '畫面', 素材: '素材' };   // 給使用者看的欄位（白話名稱）；其他（包括「理由」，常常是 AI 排版的考量）收進「AI 的備註」
const NOT_DONE = /還沒有畫面/;                    // 「截圖觀察」寫這句＝內容設計動畫還沒做，截圖只是占位
const BEAT_COLS = /^(拍|講到|畫面上出現什麼)/;   // 動畫分鏡只顯示這三欄，其他欄給工具和 AI 用，一樣留在檔案裡
const HIDDEN_GROUP = /^插圖清單/;                // 給 AI 畫圖用的清單，不顯示
const GRID_FROM = 8;                             // 幾段以上預設開總覽（短片一路捲下去就看完了）
// 寫給做動畫的 AI 看的座標、尺寸（括號裡有數字的）：留在檔案裡，畫面上不顯示
const humanText = (s) => String(s ?? '').replace(/[（(][^（）()]*\d[^（）()]*[）)]/g, '').replace(/\s{2,}/g, ' ').trim();

let state = null;
let saving = Promise.resolve();
let pendingSaves = 0;
let stale = false;            // 有新內容要畫，但使用者正在打字：等離開欄位再畫
let domSig = null;            // 畫面上的行號是照哪個結構畫的；和 state.sig 不同就不能照行號寫
const folds = new Map();      // 使用者開合過的區塊，重畫後維持
const timers = new Map();     // 打字中的欄位 → 自動存的計時器
const failed = new Map();     // 沒存到的欄位（欄位代號 → { value, kind }）：文字留在欄位裡，重畫後放回去，連上服務後補存
let offline = false;          // 上一次連不到剪輯台
let composing = false;        // 中文輸入法選字中：這時不存、不重畫
const view = { mode: null, key: null };   // 總覽 grid、單段 one、逐段捲動 list；mode 第一次載入照段數決定

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const canEdit = () => state && !state.readOnly;
const typing = () => !!document.activeElement?.matches?.('.sb-edit, .sb-piece, .sb-note-box textarea, .sb-answer');
const oneLine = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();

function setSave(kind, text) {
  const el = $('saveState');
  el.dataset.state = kind;
  el.querySelector('.txt').textContent = text;
}
const savedText = () => (state?.readOnly ? '只能看' : state?.exists ? '已自動存檔' : '等 AI 寫分鏡表');

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
  const text = humanText(p).replace(/[A-Za-z_][\w-]*/g, '').trim();
  return /[\u4e00-\u9fff]/.test(text) ? inline(text) : ' ';
}

// 引號裡不一定是畫面上的字：「講到「雲端」」是講稿裡的話、「圖示「camera」」是圖示名稱，這兩種不開放改，也不標橘底
const quoteKind = (t, before) => (/講到\s*$/.test(before) ? 'speech' : /圖示\s*$/.test(before) || /^[a-z][\w-]*$/.test(t) ? 'icon' : 'text');

// beat＝動畫分鏡的一格：沒有引號的是動畫描述（不是畫面上的字），不標橘底，想改寫在這段的補充說明
function textField(value, attrs, label, { beat = false } = {}) {
  if (beat && (!QUOTED.test(value) || !canEdit())) return `<div class="sb-read sb-beat">${inline(humanText(value))}</div>`;
  if (!canEdit() || !QUOTED.test(value)) return editable(value, attrs, label);
  const list = value.split(QUOTED).filter((p) => p !== '');
  const parts = list.map((p, i) => {
    if (!QUOTED.test(p)) return `<span class="sb-fixed" data-raw="${esc(p)}">${friendlyFixed(p)}</span>`;
    const t = p.slice(1, -1), kind = quoteKind(t, list[i - 1] || '');
    if (kind === 'speech') return `<span class="sb-fixed" data-raw="${esc(p)}">${esc(p)}</span>`;
    if (kind === 'icon') return `<span class="sb-fixed" data-raw="${esc(p)}"></span>`;
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
  const overviewTable = t.head.includes('一句話摘要');
  const head = cols.map(({ h }) => `<th scope="col">${inline(beats ? (h === '拍' ? '順序' : h.replace(/（.*$/, '')) : h)}</th>`).join('');
  const rows = t.rows.map((r) => `<tr>${cols.map(({ h, c }) => {
    const v = r.cells[c] ?? '';
    if (h === '段' && overviewTable) return `<td><a class="sb-idlink" href="#sec-${esc(v)}">${esc(v)}</a></td>`;
    if (c === checkCol) return `<td class="check"><input type="checkbox" ${CHECKED.test(v) ? 'checked' : ''} ${on ? '' : 'disabled'} data-line="${r.line}" data-col="${c}" data-raw="${esc(v)}" aria-label="${esc(h)}：${esc(r.cells[0] ?? '')}"></td>`;
    const cls = WIDE_COL.test(h) ? 'wide' : '';
    // 「收」那一拍是動畫的收尾，不是畫面上的字
    if (TEXT_COL.test(h) && r.cells[0] !== '收') return `<td class="${cls}">${textField(v, `data-line="${r.line}" data-col="${c}"`, h, { beat: beats })}</td>`;
    return `<td class="${cls}"><div class="sb-read">${inline(beats ? friendlyBind(v) : v)}</div></td>`;
  }).join('')}</tr>`).join('');
  return `<div class="sb-tablewrap"><table class="sb-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function readRow(b, n) {
  const shown = SHOWN_LABEL[b.label] || b.label;
  const label = b.label ? `<span class="sb-label">${inline(shown)}</span>` : '';
  const row = `<div class="sb-field${b.label ? '' : ' nolabel'}">${label}<div class="sb-read">${inline(SHOWN_LABEL[b.label] ? humanText(b.value) : b.value)}</div></div>`;
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
  // 只能看的時候不要放選單：看起來能選，其實不能
  if (!canEdit()) return `<div class="sb-field"><span class="sb-label">呈現方式</span><div class="sb-read">${esc(chosen?.label || wish || here || '—')}</div></div>`;
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
  if (!canEdit()) return `<div class="sb-field"><span class="sb-label">音效</span><div class="sb-read">${esc(list.find((o) => o.value === cur)?.label || cur)}</div></div>`;
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
  const time = (s.title.match(/\d+:\d{2}(?:\.\d+)?[–-]\d+:\d{2}(?:\.\d+)?/) || [o.time || ''])[0].replace(/\.\d+/g, '');
  const name = o.summary || s.title.replace(s.id, '').replace(/^[\s｜|]+/, '');
  const scene = currentScene(s);
  const see = state.built ? `<a class="sb-see" href="/?view=final&seg=${encodeURIComponent(s.id)}" target="_blank" rel="noopener">在預覽看 ↗</a>` : '';
  // 主標是在講什麼；段號放最後，跟 AI 說要改哪段時才用得到
  const head = `<div class="sb-sechead"><h2>${inline(name)}</h2>${time ? `<span class="sb-chip time">${esc(time)}</span>` : ''}${scene ? `<span class="sb-chip">${esc(scene.label)}</span>` : ''}<span class="sb-id">${esc(s.id)}</span>${see}</div>`;
  const [first, ...rest] = groupsOf(s.blocks);
  const shots = first.blocks.filter((b) => b.type === 'image');
  const rows = first.blocks.filter((b) => b.type !== 'image');
  const by = (label) => rows.filter((b) => b.label === label);
  // 截圖觀察只有兩種內容：「無」、內容設計動畫還沒做。都不用放進 AI 的備註
  const observed = rows.find((b) => b.label === '截圖觀察');
  const notDone = NOT_DONE.test(observed?.value || '');
  const design = by('概念').length > 0;
  const backstage = rows.filter((b) => (b.type === 'item' || b.type === 'para') && !SHOWN_LABEL[b.label] && !OWN_ROW.has(b.label) && b.label !== '畫面文字' && !(b === observed && (notDone || /^無$/.test(b.value))));
  const fields = blocksHtml(by('起點那句字幕')) + sceneSelect(s) + blocksHtml(by('概念')) + blocksHtml(by('畫面')) + blocksHtml(by('畫面文字')) + blocksHtml(by('素材')) + sfxSelect(s);
  const shotBox = shots.length ? `<div class="sb-shots${shots.length > 1 ? ' many' : ''}${notDone ? ' pending' : ''}">${shots.map(shotHtml).join('')}${notDone ? '<span class="sb-pending">動畫還沒做：這張只是占位，你確認後 AI 才會做</span>' : ''}</div>` : '';
  const body = `<div class="sb-segbody${shots.length ? '' : ' noshot'}">${shotBox}<div class="sb-fields">${fields}</div></div>`;
  // 鏡位腳本是給做動畫的 AI 看的細節，預設收起：看概念和畫面就夠判斷，想改細節再打開
  const beatCount = (g) => g.blocks.find((b) => b.type === 'table')?.rows.length || 0;
  const subs = rest.filter((g) => !HIDDEN_GROUP.test(g.heading.text)).map((g) => `<div class="sb-subgroup">${foldHtml(`${s.key}:${g.heading.text}`, `${design ? '鏡位腳本' : g.heading.text.replace(/\s+\S+$/, '')}${beatCount(g) ? `（${beatCount(g)} 拍）` : ''}：給 AI 的細節，想看再打開`, false, blocksHtml(g.blocks))}</div>`).join('');
  const notes = backstage.length ? `<div class="sb-subgroup">${foldHtml(`${s.key}:notes`, 'AI 的備註', false, `<div class="sb-fields">${blocksHtml(backstage)}</div>`)}</div>` : '';
  const note = design
    ? noteBox(s, '這段動畫想怎麼改？', '例如：第 3 拍不要飛來飛去，改成兩個畫面並排。你說「可以」之後 AI 會照這裡重寫鏡位腳本。')
    : noteBox(s, '不滿意這一段？寫下想怎麼改', '例如：這段不要放字卡，想看到手機和電腦兩個畫面對比。你說「可以」之後 AI 會照這裡調整。');
  return `<article class="sb-panel sb-sec" id="sec-${esc(s.key)}">${head}${body}${subs}${note}${notes}</article>`;
}

const isDecide = (s) => /需要.*決定/.test(s.title);
// 這些不是要決定的事，是待補的素材和提醒：不算進「要你決定」，收在一起
const isNoteAsk = (q) => /^\s*(\*\*)?補錄[：:]|待補/.test(q);
const askText = (b) => [b.label, b.value].filter(Boolean).join('：');
const sectionTitle = (s) => (isDecide(s) ? (canEdit() ? '要你決定的事' : '當時的決定與提醒') : s.title);

// 一項一張卡：問題＋自己的回答欄，回答了就打勾；有多少沒回答一眼看得出來
const answerOf = (blocks, i) => { const b = blocks[i + 1]; return b?.type === 'item' && !b.ordered && b.label === '回答' ? b.value : ''; };
const askList = (s) => groupsOf(s.blocks)[0].blocks.map((b, i, all) => ({ b, answer: answerOf(all, i) })).filter((x) => x.b.type === 'item' && x.b.ordered);
function askHtml(s) {
  const list = askList(s);
  if (!list.length) return '<p class="sb-note">目前沒有要你決定的事。</p>';
  const item = ({ b, answer, i }) => `<li class="sb-ask${answer ? ' answered' : ''}"><div class="sb-ask-q"><span class="sb-ask-mark" aria-hidden="true">${answer ? '✓' : i + 1}</span><span>${inline(askText(b))}</span></div>${canEdit() || answer
    ? `<textarea class="sb-answer" rows="1" data-q="${i}" data-line="${b.line}" data-raw="${esc(answer)}" aria-label="回答第 ${i + 1} 項" placeholder="${canEdit() ? '在這裡回答；也可以在對話裡回覆 AI' : ''}" ${canEdit() ? '' : 'readonly'}>${esc(answer)}</textarea>` : ''}</li>`;
  const all = list.map((x, i) => ({ ...x, i })), asks = all.filter((x) => !isNoteAsk(askText(x.b))), notes = all.filter((x) => isNoteAsk(askText(x.b)));
  const main = asks.length ? `<ol class="sb-asks">${asks.map(item).join('')}</ol>` : '<p class="sb-note">目前沒有要你決定的事。</p>';
  const rest = notes.length ? foldHtml(`${s.key}:asknotes`, `待補的素材和提醒（${notes.length} 件，不用回答也可以往下做）`, false, `<ol class="sb-asks">${notes.map(item).join('')}</ol>`, 'sb-asknotes') : '';
  return main + rest;
}

function otherHtml(s) {
  const decide = isDecide(s);
  const title = sectionTitle(s) || '開頭說明';
  const inner = `<div class="sb-fields">${blocksHtml(s.blocks)}</div>`;
  if (decide) {
    const [first, ...rest] = groupsOf(s.blocks);
    const others = first.blocks.filter((b) => !(b.type === 'item' && (b.ordered || b.label === '回答' || b.label === '補充說明')));
    const groups = rest.map((g) => {
      const ai = /^給 AI/.test(g.heading.text);
      return `<div class="sb-subgroup">${foldHtml(`${s.key}:${g.heading.text}`, g.heading.text, !ai, `<div class="sb-fields">${blocksHtml(g.blocks)}</div>`)}</div>`;
    }).join('');
    return `<section class="sb-panel sb-sec decide" id="sec-${esc(s.key)}"><div class="sb-sechead"><h2>${inline(title)}</h2></div>${askHtml(s)}${others.length ? `<div class="sb-fields">${blocksHtml(others)}</div>` : ''}${noteBox(s, '其他想說的', '例如：片頭想多留兩秒。也可以在對話裡回覆 AI。')}${groups}</section>`;
  }
  if (!s.title) return `<section class="sb-panel sb-sec" id="sec-${esc(s.key)}">${foldHtml(s.key, '開頭說明', false, inner, 'sb-fold sb-ref')}</section>`;
  // 參考用的表（總覽、四種版面、圖示表、情境判定…）預設收起來
  return `<section class="sb-panel sb-sec" id="sec-${esc(s.key)}">${foldHtml(s.key, title, false, inner, 'sb-fold sb-ref')}</section>`;
}

// 給人看的名詞只有三個：動畫（內容設計動畫、模板動畫）、字卡、素材（錄影、圖片）
const kindOf = (s) => {
  const c = `${state.overview[s.id]?.card || ''} ${fieldOf(s, '版面')?.value || ''}`;
  return /內容設計|模板動畫|x-[a-z]/.test(c) ? 'anim' : /螢幕錄影|圖片/.test(c) ? 'media' : 'card';
};
const KIND_ZH = { anim: '動畫', media: '素材', card: '字卡' };
const hasWish = (s) => !!(fieldOf(s, '想換成') || fieldOf(s, '補充說明'));
const mmss = (t) => String(t || '').split(/[–-]/)[0].replace(/\.\d+$/, '');

function renderNav() {
  const s = state.sections;
  const seg = s.filter((x) => x.id);
  const plain = (x, cls = '') => `<li><a class="plain ${cls}" href="#sec-${esc(x.key)}">${esc(sectionTitle(x) || '開頭說明')}</a></li>`;
  const marked = (x) => (hasWish(x) ? ' changed' : '');
  const row = (x) => {
    const o = state.overview[x.id] || {};
    return `<li data-nav="${esc(x.id)}"><a class="${marked(x)} kind-${kindOf(x)}${reading.seen.has(x.id) ? ' seen' : ''}" href="#sec-${esc(x.key)}" title="${esc(`${mmss(o.time)}　${o.summary || x.title}　${x.id}`)}"><span class="sb-navid">${esc(mmss(o.time) || x.id)}</span><span class="sb-navtxt">${esc(o.summary || x.title.replace(x.id, ''))}</span></a></li>`;
  };
  // 照章分組：長片 150 多段一路平鋪找不到，目前這一章打開，其他收起來
  const chapters = [];
  for (const x of seg) {
    const name = state.overview[x.id]?.chapter || '';
    if (!chapters.length || chapters.at(-1).name !== name) chapters.push({ name, list: [] });
    chapters.at(-1).list.push(x);
  }
  const grouped = chapters.length > 1 && chapters.every((c) => c.name && c.name !== '—');
  const segs = grouped
    ? chapters.map((c, i) => `<li class="sb-navch-wrap"><details class="sb-navch" data-ch="${i}" ${i === 0 ? 'open' : ''}><summary><span class="sb-chname">${esc(c.name)}</span><span class="sb-chmeta">${esc(mmss(state.overview[c.list[0].id]?.time))}・${c.list.length} 段</span></summary><ul>${c.list.map(row).join('')}</ul></details></li>`).join('')
    : seg.map(row).join('');
  const decide = s.filter((x) => isDecide(x)).map((x) => plain(x, `decide${marked(x)}`));
  const refs = s.filter((x) => !x.id && x.title && !isDecide(x)).map((x) => plain(x, 'ref'));
  $('nav').innerHTML = [decide.join(''), segs, refs.join('')].filter(Boolean).join('<li class="sb-navgap" aria-hidden="true"></li>');
  $('nav').hidden = !s.length;
  watchSections();
}

function renderSummary() {
  const seg = state.sections.filter((x) => x.id);
  const wishes = seg.filter(hasWish).length;
  $('summary').textContent = seg.length ? `${seg.length} 段${wishes ? `，${wishes} 段要 AI 調整` : ''}` : '';
  renderTasks();
}

// ---------- 任務列：這一頁要做的事一眼看完 ----------
// 內容設計動畫候選（表頭有「構想」）：勾了才做
function designInfo() {
  const sec = state.sections.find(isDecide);
  const pick = sec?.blocks.find((b) => b.type === 'table' && b.head.includes('構想') && b.head.some((h) => h.includes('☐')));
  if (!pick) return null;
  const col = pick.head.findIndex((h) => h.includes('☐'));
  return { on: pick.rows.filter((r) => CHECKED.test(r.cells[col] ?? '')).length, total: pick.rows.length };
}
function quotesInfo() {
  const sec = state.sections.find(isDecide);
  const pick = sec?.blocks.find((b) => b.type === 'table' && b.head.some((h) => h.startsWith('卡上文字')) && b.head.some((h) => h.includes('☐')));
  if (!pick) return null;
  const col = pick.head.findIndex((h) => h.includes('☐'));
  const head = sec.blocks.filter((b) => b.type === 'heading').map((b) => b.text).find((t) => /金句/.test(t)) || '';
  return { on: pick.rows.filter((r) => CHECKED.test(r.cells[col] ?? '')).length, total: pick.rows.length, max: Number((/最多\s*(\d+)\s*則/.exec(head) || [])[1]) || 6 };
}
function renderTasks() {
  const box = $('tasks');
  if (!box || !state?.exists) { if (box) box.innerHTML = ''; return; }
  const seg = state.sections.filter((x) => x.id);
  if (seg.length < 2) { box.innerHTML = ''; return; }
  const out = [];
  const sec = state.sections.find(isDecide);
  const all = sec ? askList(sec) : [], asks = all.filter((a) => !isNoteAsk(askText(a.b))), notes = all.length - asks.length;
  // 已經確認（只能看）：沒有要做的事了，不放待辦
  if (asks.length && canEdit()) {
    const left = asks.filter((a) => !a.answer).length;
    out.push(`<a class="sb-task${left ? ' todo' : ' ok'}" href="#sec-${esc(sec.key)}"><b>${left ? `要你決定 ${left} 件` : '要決定的事都回答了'}</b><span>共 ${asks.length} 件</span></a>`);
  }
  if (notes && canEdit()) out.push(`<a class="sb-task" href="#sec-${esc(sec.key)}"><b>待補的素材和提醒 ${notes} 件</b><span>不用回答也可以往下做</span></a>`);
  const dz = canEdit() ? designInfo() : null;
  if (dz) out.push(`<a class="sb-task" href="#sec-${esc(sec.key)}" data-to-designs><b>內容設計動畫 ${dz.on}／${dz.total} 段</b><span>${dz.on ? '勾了的會從空白畫布設計，要多花時間' : '都沒勾：全部照現在的版面，最快'}</span></a>`);
  const q = canEdit() ? quotesInfo() : null;
  if (q) out.push(`<a class="sb-task${q.on > q.max ? ' over' : ''}" href="#sec-${esc(sec.key)}" data-to-quotes><b>金句 ${q.on}／最多 ${q.max}</b><span>${q.on > q.max ? `多了 ${q.on - q.max} 則，AI 只會上 ${q.max} 則` : `${q.total} 則候選`}</span></a>`);
  const wish = canEdit() ? seg.filter(hasWish) : [];
  if (wish.length) out.push(`<button class="sb-task" type="button" data-next-wish><b>你改了 ${wish.length} 段</b><span>點一下看下一段</span></button>`);
  const seenN = seg.filter((x) => reading.seen.has(x.id)).length;
  if (canEdit()) out.push(`<span class="sb-task static"><b>看過 ${seenN}／${seg.length}</b><span>${seenN >= seg.length ? '都看完了' : '只是提醒，不用全部看'}</span></span>`);
  if (reading.last && document.getElementById(`sec-${reading.last}`) && !box.dataset.resumed && !location.hash) out.push(`<a class="sb-task" href="#sec-${esc(reading.last)}" data-resume><b>接著看 ${esc(reading.last)}</b><span>上次看到這裡</span></a>`);
  box.innerHTML = out.join('');
}

// ---------- 找段、篩選、看過哪些（每個專案各記一份，只在這個瀏覽器）----------
const reading = { seen: new Set(), last: null, project: null };
function loadReading() {
  if (!state || reading.project === state.project) return;
  reading.project = state.project;
  try {
    reading.seen = new Set(JSON.parse(localStorage.getItem(`sb-seen:${state.project}`) || '[]'));
    reading.last = localStorage.getItem(`sb-last:${state.project}`);
  } catch { /* 私密視窗：不記也沒關係 */ }
  document.querySelectorAll('#nav li[data-nav] > a').forEach((a) => a.classList.toggle('seen', reading.seen.has(a.closest('li').dataset.nav)));
}
let seenTimer = null;
function markSeen(id) {
  clearTimeout(seenTimer);
  // 停留一下才算看過：拖捲軸一路飛過去不算
  seenTimer = setTimeout(() => {
    reading.last = id;
    reading.seen.add(id);
    document.querySelector(`#nav li[data-nav="${CSS.escape(id)}"] > a`)?.classList.add('seen');
    document.querySelector(`.sb-card[data-id="${CSS.escape(id)}"]`)?.classList.add('seen');
    try { localStorage.setItem(`sb-seen:${state.project}`, JSON.stringify([...reading.seen])); localStorage.setItem(`sb-last:${state.project}`, id); } catch { /* 同上 */ }
    renderTasks();
  }, 700);
}

const finder = { query: '', kind: 'all' };
const toSec = (t) => { const m = /^(\d+):(\d{1,2})(?:\.\d+)?$/.exec(String(t).trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function spanOf(s) { const [a, b] = String(state.overview[s.id]?.time || '').split(/[–-]/); return [toSec(a), toSec(b)]; }
const textOf = (s) => [s.id, state.overview[s.id]?.summary, state.overview[s.id]?.card, fieldOf(s, '起點那句字幕')?.value, fieldOf(s, '畫面文字')?.value, fieldOf(s, '概念')?.value].join(' ').toLowerCase();
function matches(s) {
  if (!s.id) return false;
  const k = finder.kind;
  if (k === 'changed' ? !hasWish(s) : k === 'unseen' ? reading.seen.has(s.id) : k !== 'all' && kindOf(s) !== k) return false;
  const q = finder.query.trim().toLowerCase();
  if (!q) return true;
  const at = toSec(q);
  if (at != null) { const [a, b] = spanOf(s); return a != null && b != null && at >= a && at < b + 1; }
  return q.split(/\s+/).every((w) => textOf(s).includes(w));
}
// ---------- 總覽、單段、逐段 ----------
const firstShot = (s) => groupsOf(s.blocks)[0].blocks.find((b) => b.type === 'image');
function cardHtml(s) {
  const o = state.overview[s.id] || {}, shot = firstShot(s);
  const pending = NOT_DONE.test(groupsOf(s.blocks)[0].blocks.find((b) => b.label === '截圖觀察')?.value || '');
  const say = o.summary || s.title.replace(s.id, '').replace(/^[\s｜|]+/, '');
  const portrait = state.format === 'portrait';
  const flag = hasWish(s) ? '<span class="flag wish">你改過</span>' : pending ? '<span class="flag">動畫還沒做</span>' : '';
  return `<a class="sb-card${reading.seen.has(s.id) ? ' seen' : ''}${portrait ? ' portrait' : ''}" href="#sec-${esc(s.key)}" data-id="${esc(s.id)}" title="${esc(`${say}（${s.id}）`)}"><div class="thumb">${shot?.url ? `<img src="${esc(shot.url)}" alt="" loading="lazy">` : '<span>還沒有截圖</span>'}${flag}</div><div class="txt"><div class="say">${inline(say)}</div><div class="meta"><span>${esc(mmss(o.time))}　${KIND_ZH[kindOf(s)]}</span><span>${esc(s.id)}</span></div></div></a>`;
}
function renderGrid() {
  const seg = state.sections.filter((x) => x.id);
  const groups = [];
  for (const s of seg) {
    const name = state.overview[s.id]?.chapter || '';
    if (!groups.length || groups.at(-1).name !== name) groups.push({ name, list: [] });
    groups.at(-1).list.push(s);
  }
  const named = groups.length > 1 && groups.every((g) => g.name && g.name !== '—');
  $('grid').innerHTML = groups.map((g) => `<section class="sb-gridsec">${named ? `<h2 class="sb-gridch">${esc(g.name)}<small>${esc(mmss(state.overview[g.list[0].id]?.time))}・${g.list.length} 段</small></h2>` : ''}<div class="sb-cards">${g.list.map(cardHtml).join('')}</div></section>`).join('');
}
const segList = () => state.sections.filter((x) => x.id && (!finderActive() || matches(x)));
const finderActive = () => !!finder.query.trim() || finder.kind !== 'all';
function setView(mode, key = null) {
  view.mode = mode;
  view.key = key;
  applyFinder();
  renderViews();
}
function renderViews() {
  const seg = state.sections.filter((x) => x.id);
  $('views').hidden = seg.length < GRID_FROM;
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === (view.mode === 'list' ? 'list' : 'grid'))));
  $('grid').hidden = view.mode !== 'grid' || !seg.length;
  $('oneBar').hidden = view.mode !== 'one';
  $('hint').dataset.base ??= $('hint').textContent;
  $('hint').textContent = `${view.mode === 'grid' ? '點一張看那一段。' : ''}${$('hint').dataset.base}`;
  // 單段看的時候：畫面留給這一段，上面的搜尋和任務列先收起來
  $('intro').hidden = !state.exists || !seg.length || view.mode === 'one';
  if (view.mode === 'one') {
    const list = segList(), i = list.findIndex((x) => x.key === view.key);
    $('onePos').textContent = i >= 0 ? `第 ${i + 1}／${list.length} 段` : '';
    document.querySelector('[data-one="prev"]').disabled = i <= 0;
    document.querySelector('[data-one="next"]').disabled = i < 0 || i >= list.length - 1;
  }
}
function openOne(key) {
  const s = state.sections.find((x) => x.key === key);
  if (!s) return;
  setView('one', key);
  window.scrollTo({ top: 0 });
  if (s.id) markSeen(s.id);
}
// 總覽、單段看的時候，連到一段（目錄、任務列、總覽的卡片、網址）＝打開那一段；連到要決定的事＝回總覽再捲過去
function goSection(key) {
  const s = state.sections.find((x) => x.key === key);
  if (!s) return false;
  if (view.mode === 'list') return false;
  if (s.id) { openOne(key); return true; }
  if (view.mode === 'one') setView('grid');
  const el = document.getElementById(`sec-${key}`);
  if (el) { const fold = el.querySelector(':scope > details[data-fold]'); if (fold) fold.open = true; el.scrollIntoView({ block: 'start' }); }
  return true;
}
function applyFinder() {
  const active = finderActive();
  let hits = 0;
  for (const s of state.sections) {
    const el = document.getElementById(`sec-${s.key}`);
    if (!el) continue;
    // 單段看的時候，那一段不套篩選（「還沒看的」看了就不算了，不能看到一半變空白）
    const show = !active || matches(s) || (view.mode === 'one' && s.key === view.key);
    // 總覽：每一段都收進卡片，「總覽」那張表也不用了。單段：只放那一段
    const inView = view.mode === 'list' ? true : view.mode === 'one' ? s.key === view.key : !s.id && s.title !== '總覽';
    el.hidden = !show || !inView;
    if (show && s.id) hits++;
    const li = s.id && document.querySelector(`#nav li[data-nav="${CSS.escape(s.id)}"]`);
    if (li) li.hidden = !show;
    const card = s.id && document.querySelector(`.sb-card[data-id="${CSS.escape(s.id)}"]`);
    if (card) card.hidden = !show;
  }
  document.querySelectorAll('.sb-gridsec').forEach((g) => { g.hidden = !g.querySelector('.sb-card:not([hidden])'); });
  if (active) document.querySelectorAll('#nav details.sb-navch').forEach((d) => { d.open = !!d.querySelector('li[data-nav]:not([hidden])'); d.closest('.sb-navch-wrap').hidden = !d.open; });
  else document.querySelectorAll('#nav .sb-navch-wrap').forEach((w) => { w.hidden = false; });
  const note = $('finderNote');
  if (note) note.innerHTML = active ? `${hits ? `找到 ${hits} 段` : '沒有符合的段'} <button type="button" data-finder-clear>清除</button>` : '';
  document.querySelectorAll('[data-kind-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kindFilter === finder.kind)));
}
function resetFinder() {
  finder.query = ''; finder.kind = 'all';
  if ($('finderInput')) $('finderInput').value = '';
  applyFinder();
}

function renderBanner() {
  const out = [];
  const eg = state.sections.find((x) => x.id)?.id || 's12';
  if (state.readOnly) out.push(`<p class="sb-banner">分鏡表已經確認，這一頁現在只能看。要改請在對話跟 AI 說段號，例如「${esc(eg)} 重新設計」，或到完成影片預覽寫修改單。</p>`);
  for (const w of state.warnings || []) out.push(`<p class="sb-banner err">⚠ ${esc(w)}</p>`);
  $('banner').innerHTML = out.join('');
  renderSpeaker();
}

// 講者還沒設定：畫面上會是示範人物。放在頁面最上面，表單只在狀態變了才重畫（不吃掉打到一半的字）
function renderSpeaker() {
  const box = $('speakerBox');
  if (!box) return;
  const sp = state?.speaker;
  if (!sp?.needed) { box.innerHTML = ''; return; }
  if (box.firstElementChild) return;
  const L = sp.limits || {};
  box.innerHTML = `<form class="sb-banner err sb-speaker" data-speaker-form>
    <div class="sb-speaker-msg"><b>畫面上的講者是示範人物「${esc(sp.demo)}」</b>：講者介紹（${esc((sp.segments || []).join('、'))}）還沒設定你的姓名。存好後每一集都會用這組資料；截圖要等 AI 更新才會換。</div>
    <label>姓名 <input name="name" autocomplete="off" placeholder="最多 ${esc(L.name)} 字"></label>
    <label>頭銜 <input name="titles" autocomplete="off" placeholder="最多 ${esc(L.maxTitles)} 個，用頓號分開"></label>
    <button type="submit" class="primary">存好</button>
    <span class="sb-speaker-err" role="alert"></span>
  </form>`;
}

// ---------- 沒存到的欄位：提醒固定在視窗右下角（捲到哪都看得到），文字留在欄位裡 ----------
const fieldKey = (el) => {
  if (el.matches('.sb-note-box textarea')) return `note:${el.dataset.note}`;
  if (el.matches('.sb-answer')) return `answer:${el.dataset.q}`;
  const sec = el.closest('.sb-sec');
  return `text:${sec?.id}:${[...(sec?.querySelectorAll('.sb-edit, .sb-piece') || [])].indexOf(el)}`;
};
function fieldOfKey(key) {
  const [kind, a, b] = key.split(':');
  if (kind === 'note') return document.querySelector(`.sb-note-box textarea[data-note="${CSS.escape(key.slice(5))}"]`);
  if (kind === 'answer') return document.querySelector(`.sb-answer[data-q="${CSS.escape(a)}"]`);
  return document.getElementById(a)?.querySelectorAll('.sb-edit, .sb-piece')[Number(b)] || null;
}
const typedOf = (el) => (el.matches('textarea') ? el.value : el.textContent);
function markFailed(el, kind) {
  failed.set(fieldKey(el), { value: typedOf(el), kind, sec: el.closest('.sb-sec')?.id });
  el.classList.add('unsaved');
  renderNotice();
}
function clearFailed(el) {
  if (failed.delete(fieldKey(el))) renderNotice();
  el.classList.remove('unsaved');
}
function renderNotice() {
  const n = $('notice');
  if (!n) return;
  if (!failed.size) { n.hidden = true; n.innerHTML = ''; return; }
  const items = [...failed.values()];
  const net = items.some((x) => x.kind === 'network');
  n.innerHTML = `<b>${items.length} 處還沒存到</b><p>${net
    ? '連不到剪輯台。文字還留在欄位裡，連上後會自動補存，先不要關掉這一頁。'
    : '分鏡表剛被 AI 改過，這幾處對不上。文字還留在欄位裡，看過後按「再存一次」。'}</p><div class="notice-actions"><button data-notice-go>到那一段</button>${net ? '' : '<button class="primary" data-notice-retry>再存一次</button>'}</div>`;
  n.hidden = false;
}
// 重畫之後把沒存到的文字放回欄位
function restoreFailed() {
  for (const [key, f] of failed) {
    const el = fieldOfKey(key);
    if (!el) continue;
    if (el.matches('textarea')) el.value = f.value; else el.textContent = f.value;
    el.classList.remove('empty');
    el.classList.add('unsaved');
  }
}
function retryFailed() {
  for (const key of [...failed.keys()]) {
    const el = fieldOfKey(key);
    if (el) saveField(el, { retry: true }); else { failed.delete(key); renderNotice(); }
  }
}

function render() {
  stale = false;
  domSig = state.sig;
  $('projName').textContent = state.project;
  const empty = !state.exists ? 'AI 還在寫分鏡表，寫好後這一頁會自動更新。' : !state.sections.length ? '分鏡表還沒有內容。' : '';
  $('empty').hidden = !empty;
  $('empty').textContent = empty;
  $('intro').hidden = !state.exists || !state.sections.length;
  $('hint').hidden = state.readOnly;
  // 閱讀順序：總覽（收起來，當索引）→ 每一段 → 要決定的事 → 參考資料（檔案裡的順序不動）
  const rank = (s) => (s.title === '總覽' ? -1 : s.id ? 0 : isDecide(s) ? 1 : 2);
  $('sections').innerHTML = [...state.sections].sort((a, b) => rank(a) - rank(b)).map((s) => (s.id ? segHtml(s) : otherHtml(s))).join('');
  // 第一次載入：段多的開總覽；網址指到某一段就直接打開
  const segs = state.sections.filter((x) => x.id);
  if (view.mode === null && state.sections.length) view.mode = segs.length >= GRID_FROM ? 'grid' : 'list';
  if (view.mode === 'one' && !segs.some((x) => x.key === view.key)) view.mode = 'grid';
  renderBanner();
  renderNav();
  renderSummary();
  const next = $('next');
  next.hidden = !state.exists || state.readOnly;
  next.innerHTML = '看完回對話說「<b>可以</b>」';
  next.title = '看完回到對話，跟 AI 說「可以」。有換呈現方式或寫補充說明的段，AI 會先重做再給你確認';
  restoreFailed();
  loadReading();
  renderGrid();
  applyFinder();
  renderViews();
  renderTasks();
  if (!pendingSaves && !failed.size) setSave('saved', savedText());
}

// ---------- 存檔（一次存一個，照順序；每次都帶最新的 hash） ----------
// makeOp 到真的送出時才算：前一次存檔可能讓行號變了（lineOf）
function send(makeOp, { onConflict, onNetwork, onDone } = {}) {
  pendingSaves++;
  setSave('busy', '儲存中…');
  saving = saving.then(async () => {
    try {
      // 檔案被 AI 改過（hash 對不上）：照最新的檔案自動再送一次；同一格也被改了（expect 對不上）才算衝突
      for (let attempt = 0; attempt < 2; attempt++) {
        const op = typeof makeOp === 'function' ? makeOp() : makeOp;
        if (!op || op.line === null) { onConflict?.('找不到這一行'); setSave('error', '分鏡表剛被 AI 改過，這一格對不上'); return false; }
        const res = await fetch('/api/storyboard/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hash: state.hash, ...op }) });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          const shapeChanged = body.sig !== state.sig;
          state = body;
          renderBanner();
          renderSummary();
          if (shapeChanged) stale = true;
          onDone?.();
          return true;
        }
        if (body.state) state = body.state;
        else if (res.status === 409) state = await load();
        stale = true;
        if (res.status !== 409 || attempt) {
          onConflict?.(body.message);
          setSave('error', body.message || '沒有存到');
          return false;
        }
      }
      return false;
    } catch {
      offline = true;
      onNetwork?.();
      setSave('error', '連不到剪輯台，請確認還開著');
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

// 畫面上的行號過期了（結構剛變、還沒重畫）：用同一段裡內容相同的那一格找回現在的行號
function lineOf(box) {
  if (domSig === state.sig) return Number(box.dataset.line);
  const sec = state.sections.find((x) => `sec-${x.key}` === box.closest('.sb-sec')?.id);
  if (!sec) return null;
  const raw = box.dataset.raw ?? '';
  if (box.dataset.col != null) {
    const col = Number(box.dataset.col), order = (box.closest('tr')?.rowIndex ?? 1) - 1;
    const rows = sec.blocks.filter((b) => b.type === 'table').flatMap((b) => b.rows.map((r, i) => ({ r, i }))).filter(({ r }) => (r.cells[col] ?? '') === raw);
    return (rows.find((x) => x.i === order) || rows[0])?.r.line ?? null;
  }
  return sec.blocks.find((b) => b.type === 'item' && b.label === '畫面文字' && b.value === raw)?.line ?? null;
}

// 組回整格（或整行）的內容，有變才存。typing＝還在打字：不動畫面、游標留在原處
function saveText(el, { typing: stillTyping = false } = {}) {
  const box = el.closest('.sb-pieces') || el;
  const pieces = box.classList.contains('sb-pieces');
  const value = pieces
    ? [...box.children].map((c) => (c.classList.contains('sb-piece') ? oneLine(c.textContent) : c.dataset.raw)).join('')
    : oneLine(el.textContent);
  const raw = box.dataset.raw;
  if (!pieces && !stillTyping) { el.innerHTML = inline(value); el.classList.toggle('empty', !value); }
  if (value === raw) { clearFailed(el); return; }
  box.dataset.raw = value;
  if (pieces) el.dataset.raw = oneLine(el.textContent);   // 再點進來時才不會換回舊字
  send(() => {
    // 行號過期時要用「改之前的內容」去找那一格
    box.dataset.raw = raw;
    const line = lineOf(box);
    box.dataset.raw = value;
    if (line == null) return null;
    return box.dataset.col != null ? { op: 'cell', line, col: Number(box.dataset.col), text: value, expect: raw } : { op: 'text', line, text: value, expect: raw };
  }, {
    onDone: () => clearFailed(el),
    onConflict: () => { box.dataset.raw = raw; markFailed(el, 'conflict'); },
    onNetwork: () => { box.dataset.raw = raw; markFailed(el, 'network'); },   // 連上後補存
  });
}

function saveNote(t) {
  const value = oneLine(t.value), raw = t.dataset.raw;
  if (value === raw) { clearFailed(t); return; }
  t.dataset.raw = value;
  t.classList.toggle('has-note', !!value);
  send({ op: 'field', key: t.dataset.note, label: '補充說明', value, expect: raw }, {
    onDone: () => clearFailed(t),
    onConflict: () => { t.dataset.raw = raw; markFailed(t, 'conflict'); },
    onNetwork: () => { t.dataset.raw = raw; markFailed(t, 'network'); },
  });
}

function saveAnswer(t) {
  const value = oneLine(t.value), raw = t.dataset.raw, index = Number(t.dataset.q);
  if (value === raw) { clearFailed(t); return; }
  t.dataset.raw = value;
  const li = t.closest('.sb-ask');
  const mark = (on) => { li.classList.toggle('answered', on); li.querySelector('.sb-ask-mark').textContent = on ? '✓' : index + 1; };
  mark(!!value);
  // 行號每次都照最新的檔案算（前面的項目回答了，後面的行號就變了）
  send(() => {
    const s = state.sections.find(isDecide);
    const line = s && askList(s)[index]?.b.line;
    return line == null ? null : { op: 'answer', line, text: value, expect: raw };
  }, {
    onDone: () => { clearFailed(t); renderSummary(); },
    onConflict: () => { t.dataset.raw = raw; mark(!!raw); markFailed(t, 'conflict'); },
    onNetwork: () => { t.dataset.raw = raw; mark(!!raw); markFailed(t, 'network'); },
  });
}

function saveField(el, { typing: stillTyping = false } = {}) {
  clearTimeout(timers.get(el));
  timers.delete(el);
  if (el.matches('.sb-note-box textarea')) saveNote(el);
  else if (el.matches('.sb-answer')) saveAnswer(el);
  else saveText(el, { typing: stillTyping });
}

// 打字時自動存：停手 0.8 秒就存，不用等離開欄位；選字中不存
function scheduleSave(el) {
  clearTimeout(timers.get(el));
  timers.set(el, setTimeout(() => {
    timers.delete(el);
    if (composing) { scheduleSave(el); return; }
    if (el.isConnected) saveField(el, { typing: document.activeElement === el });
  }, AUTOSAVE_MS));
}

// ---------- 事件 ----------
const secs = $('sections');
const EDIT = '.sb-edit, .sb-piece';
secs.addEventListener('focusin', (e) => {
  const el = e.target.closest(EDIT);
  if (!el || !el.isContentEditable) return;
  el.classList.remove('empty');
  // 有 `code`、**粗體** 時換回原文再改；純文字不動，游標留在點的地方（沒存到的文字留著，不換回去）
  if (el.textContent !== el.dataset.raw && !failed.has(fieldKey(el))) {
    el.textContent = el.dataset.raw;
    const sel = getSelection();
    sel.selectAllChildren(el);
    sel.collapseToEnd();
  }
  el.dataset.before = el.textContent;   // Esc 回到進來時的樣子（中間可能已經自動存過）
});
secs.addEventListener('focusout', (e) => {
  const el = e.target.closest(EDIT);
  if (el?.isContentEditable) saveField(el);
  if (e.target.matches('.sb-note-box textarea, .sb-answer')) saveField(e.target);
  setTimeout(() => { if (stale && !typing() && !pendingSaves && !composing) render(); }, 0);
});
const fitAnswer = (t) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; };
secs.addEventListener('input', (e) => {
  const el = e.target.closest?.(`${EDIT}, .sb-note-box textarea, .sb-answer`);
  if (el?.matches('.sb-answer')) fitAnswer(el);
  if (el && !e.isComposing) scheduleSave(el);
});
secs.addEventListener('compositionstart', () => { composing = true; });
secs.addEventListener('compositionend', (e) => {
  composing = false;
  const el = e.target.closest?.(`${EDIT}, .sb-note-box textarea, .sb-answer`);
  if (el) scheduleSave(el);
});
secs.addEventListener('keydown', (e) => {
  const el = e.target.closest(EDIT);
  if (!el) return;
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); el.blur(); }
  if (e.key === 'Escape') {
    el.textContent = el.dataset.before ?? el.dataset.raw;
    el.blur();
  }
});
secs.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.matches('td.check input')) {
    send(() => ({ op: 'cell', line: lineOf(t), col: Number(t.dataset.col), text: t.checked ? '☑' : '☐' }), {
      onDone: () => { t.dataset.raw = t.checked ? '☑' : '☐'; renderTasks(); },
      onConflict: () => { t.checked = !t.checked; },
      onNetwork: () => { t.checked = !t.checked; },   // 沒存到：勾選回到原本的樣子，畫面才和檔案一樣
    });
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
$('notice')?.addEventListener('click', (e) => {
  if (e.target.closest('[data-notice-retry]')) retryFailed();
  if (e.target.closest('[data-notice-go]')) {
    const f = [...failed.values()][0];
    if (f?.sec && !goSection(f.sec.replace(/^sec-/, ''))) document.getElementById(f.sec)?.scrollIntoView({ block: 'start' });
  }
});
$('speakerBox')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target, err = form.querySelector('.sb-speaker-err');
  err.textContent = '';
  let res = null, body = {};
  try {
    res = await fetch('/api/speaker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.elements.name.value, titles: form.elements.titles.value }) });
    body = await res.json().catch(() => ({}));
  } catch { err.textContent = '連不到剪輯台，請確認還開著'; return; }
  if (!res.ok) { err.textContent = body.message || '沒有存到'; return; }
  state.speaker = body.speaker;
  renderSpeaker();
});
// 還有沒存到的東西就提醒，不要讓使用者關掉分頁才發現
window.addEventListener('beforeunload', (e) => {
  if (pendingSaves || timers.size || failed.size) { e.preventDefault(); e.returnValue = ''; }
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
      if (a) {
        a.classList.add('on');
        const ch = a.closest('details.sb-navch');
        if (ch && !ch.open) { document.querySelectorAll('#nav details.sb-navch[open]').forEach((d) => { d.open = false; }); ch.open = true; }
        a.scrollIntoView({ block: 'nearest' });
      }
      const id = en.target.id.replace(/^sec-/, '');
      if (state.sections.some((x) => x.id === id)) markSeen(id);
    }
  }, { rootMargin: '-10% 0px -80% 0px' });
  document.querySelectorAll('.sb-sec').forEach((el) => observer.observe(el));
}
$('nav').addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  const sec = a && document.getElementById(a.getAttribute('href').slice(1));
  if (sec?.hidden && view.mode === 'list') resetFinder();   // 目錄點的段被篩掉了：先清掉篩選才跳得過去
  const fold = sec?.querySelector(':scope > details[data-fold]');
  if (fold) fold.open = true;
});
// 總覽、單段看的時候，連到一段＝打開那一段（目錄、任務列、卡片都走這裡）
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#sec-"]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
  if (goSection(a.getAttribute('href').slice(5))) e.preventDefault();
});
$('views')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b) { setView(b.dataset.view); window.scrollTo({ top: 0 }); }
});
function stepOne(d) {
  const list = segList(), i = list.findIndex((x) => x.key === view.key), next = list[i + d];
  if (next) openOne(next.key);
}
$('oneBar')?.addEventListener('click', (e) => {
  const act = e.target.closest('[data-one]')?.dataset.one;
  if (act === 'back') {
    const key = view.key;
    setView('grid');
    document.querySelector(`.sb-card[href="#sec-${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center' });
  } else if (act === 'prev') stepOne(-1);
  else if (act === 'next') stepOne(1);
});
$('finderInput')?.addEventListener('input', (e) => { finder.query = e.target.value; applyFinder(); });
$('finderInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); resetFinder(); e.target.blur(); return; }
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  const first = state.sections.find((s) => s.id && !document.getElementById(`sec-${s.key}`)?.hidden);
  if (first) document.getElementById(`sec-${first.key}`).scrollIntoView({ block: 'start' });
});
$('finder')?.addEventListener('click', (e) => {
  const k = e.target.closest('[data-kind-filter]');
  if (k) { finder.kind = k.dataset.kindFilter; applyFinder(); window.scrollTo({ top: 0 }); }
  if (e.target.closest('[data-finder-clear]')) resetFinder();
});
$('tasks')?.addEventListener('click', (e) => {
  if (e.target.closest('[data-resume]')) { $('tasks').dataset.resumed = '1'; resetFinder(); }
  // 「需要我決定的事」裡有兩張勾選表：照表頭找（內容設計動畫候選有「構想」，金句有「卡上文字」）
  const jump = e.target.closest('[data-to-quotes], [data-to-designs]');
  if (jump) {
    e.preventDefault();
    resetFinder();
    const want = jump.matches('[data-to-designs]') ? '構想' : '卡上文字';
    [...document.querySelectorAll('.sb-sec.decide .sb-table')].find((t) => [...t.querySelectorAll('th')].some((th) => th.textContent.startsWith(want)))?.scrollIntoView({ block: 'center' });
  }
  if (e.target.closest('a[href^="#"]')) resetFinder();
  if (e.target.closest('[data-next-wish]')) {
    resetFinder();
    const list = state.sections.filter((x) => x.id && hasWish(x));
    if (view.mode !== 'list') {
      const at = list.findIndex((x) => x.key === view.key);
      const after = list[at + 1] || list[0];
      if (after) openOne(after.key);
      return;
    }
    const y = window.scrollY + 80;
    const after = list.find((x) => document.getElementById(`sec-${x.key}`).offsetTop > y) || list[0];
    if (after) document.getElementById(`sec-${after.key}`).scrollIntoView({ block: 'start' });
  }
});
// 「/」跳到搜尋；單段看的時候 [ ] 換上一段、下一段，Esc 回總覽（在欄位裡打字時不算）
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (view.mode === 'one' && e.key === '[') { e.preventDefault(); stepOne(-1); return; }
  if (view.mode === 'one' && e.key === ']') { e.preventDefault(); stepOne(1); return; }
  if (view.mode === 'one' && e.key === 'Escape') { e.preventDefault(); setView('grid'); return; }
  if (e.key !== '/') return;
  e.preventDefault();
  if (view.mode === 'one') setView('grid');
  $('finderInput')?.focus();
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
    if (first || !state) {
      state = next;
      render();
      if (location.hash) { const key = location.hash.replace(/^#sec-/, ''); if (!goSection(key)) document.getElementById(location.hash.slice(1))?.scrollIntoView(); }
      return;
    }
    // 服務回來了：沒存到的補存，狀態列也要恢復，不然會一直寫連不到
    if (offline) {
      offline = false;
      if (!pendingSaves && !failed.size) setSave('saved', savedText());
      if (failed.size) { state = next; stale = next.sig !== domSig; retryFailed(); return; }
    }
    // 打字中不換內容：畫面的行號要和 state.hash 是同一版，離開欄位時用舊 hash 存，檔案變過就會被擋下
    if (pendingSaves || typing() || composing || (next.hash === state.hash && next.readOnly === state.readOnly)) return;
    state = next;
    render();
  } catch (e) {
    if (first) { $('empty').hidden = false; $('empty').textContent = `讀不到分鏡表：${e.message}`; }
    offline = true;
    setSave('error', '連不到剪輯台，請確認還開著');
  }
}
refresh(true);
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);

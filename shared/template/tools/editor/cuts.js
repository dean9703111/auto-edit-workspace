// 剪輯清單頁（停點 ①）：讀 /api/cuts 畫勾選清單，勾選即存（/api/cuts/save 只改 cuts.md 的「剪」欄），▶ 試聽 main.mp4 那一段。
const $ = (id) => document.getElementById(id);
const PAD = 1;          // 試聽時 NG 前後各多播 1 秒
const POLL_MS = 4000;   // 每 4 秒看一次 cuts.md 有沒有變（AI 照對話改檔、初剪輸出後變唯讀）

let state = null;
let clip = null;        // 正在試聽：{ row, s, e, a, b }
let saving = Promise.resolve();
let pendingSaves = 0;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

function setSave(kind, text) {
  const el = $('saveState');
  el.dataset.state = kind;
  el.querySelector('.txt').textContent = text;
}

// ---------- 少量 Markdown（表格、清單、段落、### 標題）：只用在 cuts.md 的其他段 ----------
function mdToHtml(md) {
  const lines = md.split('\n');
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
  const out = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (/^\s*\|/.test(l) && /^\s*\|?(\s*:?-{3,}:?\s*\|)+/.test(lines[i + 1] || '')) {
      const head = cells(l);
      const rows = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
      out.push(`<div class="ct-tablewrap"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]); i++) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else if (/^#{3,}\s+/.test(l)) {
      out.push(`<p><strong>${inline(l.replace(/^#+\s+/, ''))}</strong></p>`); i++;
    } else if (!l.trim() || /^\s*(```|~~~)/.test(l)) {
      i++;
    } else {
      const para = [];
      for (; i < lines.length && lines[i].trim() && !/^\s*(\||[-*]\s|\d+\.\s|#|```|~~~)/.test(lines[i]); i++) para.push(lines[i]);
      if (!para.length) { para.push(lines[i]); i++; }
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('');
}

// ---------- 畫面 ----------
function renderSummary() {
  const on = state.ng.filter((r) => r.cut);
  const sec = on.reduce((s, r) => s + (r.end - r.start), 0);
  $('summary').textContent = state.ng.length ? `勾了 ${on.length}／${state.ng.length} 列，約剪掉 ${sec.toFixed(1)} 秒` : '';
}

function rowHtml(r) {
  const off = !r.cut;
  return `<li class="ct-row${off ? ' off' : ''}${clip?.row === r.row ? ' playing' : ''}" data-row="${r.row}">
    <label class="ct-check" title="${off ? '保留（不剪）' : '剪掉'}"><input type="checkbox" ${r.cut ? 'checked' : ''} ${state.readOnly ? 'disabled' : ''} aria-label="第 ${r.row} 列要剪"></label>
    <button class="ct-play" ${state.video ? '' : 'disabled title="還沒有 work/main.mp4"'} aria-label="試聽第 ${r.row} 列">${clip?.row === r.row ? '■' : '▶'}</button>
    <div>
      <div class="ct-meta"><span class="ct-num">第 ${r.row} 列</span><span class="ct-time">${clock(r.start)}–${clock(r.end)}</span><span class="ct-dur">${(r.end - r.start).toFixed(1)} 秒</span><span class="ct-tag">${off ? '保留' : '剪掉'}</span></div>
      <div class="ct-text">${esc(r.text) || '<span class="ct-num">（沒有寫內容）</span>'}</div>
      ${r.reason ? `<div class="ct-reason">${esc(r.reason)}</div>` : ''}
      ${r.note ? `<div class="ct-note">⚠ AI 不確定：${esc(r.note)}　建議先試聽</div>` : ''}
    </div>
  </li>`;
}

// 只改這一列的狀態（不重畫，鍵盤焦點留在原處）
function syncRow(r) {
  const li = document.querySelector(`.ct-row[data-row="${r.row}"]`);
  if (!li) return;
  li.classList.toggle('off', !r.cut);
  li.classList.toggle('playing', clip?.row === r.row);
  const box = li.querySelector('input');
  box.checked = r.cut;
  li.querySelector('.ct-check').title = r.cut ? '剪掉' : '保留（不剪）';
  li.querySelector('.ct-tag').textContent = r.cut ? '剪掉' : '保留';
  li.querySelector('.ct-play').textContent = clip?.row === r.row ? '■' : '▶';
}

function render() {
  const s = state;
  $('projName').textContent = s.project;
  const banner = [];
  if (s.readOnly) banner.push('<p class="ct-banner">初剪已經輸出（work/rough.mp4），這份清單現在只能看。要重剪請在對話跟 AI 說。</p>');
  if (s.errors?.length) banner.push(`<p class="ct-banner err">${s.errors.map(esc).join('<br>')}</p>`);
  $('banner').innerHTML = banner.join('');
  $('hint').hidden = !s.ng.length || s.readOnly;
  $('rows').innerHTML = s.ng.map(rowHtml).join('');
  const empty = !s.exists ? 'AI 還在找要剪的地方，清單寫好後這一頁會自動更新。' : !s.ng.length ? '這支影片沒有要剪的 NG（停頓會自動去掉）。' : '';
  $('empty').hidden = !empty;
  $('empty').textContent = empty;
  renderSummary();
  $('sections').innerHTML = (s.sections || []).filter((x) => !x.ng && x.md).map((x) => {
    const decide = x.title.includes('需要你決定');
    const none = decide && /^[-*]\s*無\s*$/.test(x.md);
    return `<section class="ct-panel ct-sec${decide && !none ? ' decide' : ''}"><h3>${esc(x.title || '其他')}</h3>${decide && !none ? '<p class="ct-hint">這幾項請在對話裡回覆 AI。</p>' : ''}<div class="ct-md">${none ? '<p>沒有要你決定的事。</p>' : mdToHtml(x.md)}</div></section>`;
  }).join('');
  const next = $('next');
  next.hidden = !s.exists || s.readOnly;
  next.innerHTML = '勾好後回到對話，跟 AI 說「<b>可以</b>」；也可以直接說要改哪一列。';
  if (!pendingSaves) setSave('saved', s.readOnly ? '只能看' : s.exists ? `已存到 ${s.file}` : '等 AI 寫清單');
  if (s.video && $('video').dataset.src !== s.video.url) { $('video').src = s.video.url; $('video').dataset.src = s.video.url; }
}

// ---------- 勾選即存（一次存一個，照順序；cuts.md 被 AI 改過就重新載入） ----------
function toggle(row, on) {
  const r = state.ng.find((x) => x.row === row);
  if (!r) return;
  r.cut = on;
  syncRow(r);
  renderSummary();
  pendingSaves++;
  setSave('busy', '儲存中…');
  saving = saving.then(async () => {
    try {
      const res = await fetch('/api/cuts/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hash: state.hash, cut: { [row]: on } }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        state = body.state || await load();
        render();
        setSave('error', body.message || '沒有存到');
        return;
      }
      state = body;
      if (pendingSaves === 1) { state.ng.forEach(syncRow); renderSummary(); }
    } catch {
      setSave('error', '連不到剪輯服務，請確認還開著');
    } finally {
      pendingSaves--;
      if (!pendingSaves && $('saveState').dataset.state !== 'error') setSave('saved', `已存到 ${state.file}`);
    }
  });
}

// ---------- 試聽 ----------
const video = $('video');
function stop() {
  video.pause();
  const was = clip?.row;
  clip = null;
  const r = was != null && state.ng.find((x) => x.row === was);
  if (r) syncRow(r);
}
function drawBar() {
  if (!clip) return;
  const span = clip.b - clip.a || 1, t = video.currentTime;
  $('barNg').style.left = `${((clip.s - clip.a) / span) * 100}%`;
  $('barNg').style.width = `${((clip.e - clip.s) / span) * 100}%`;
  $('barHead').style.left = `${Math.min(100, Math.max(0, ((t - clip.a) / span) * 100))}%`;
  const inNg = t >= clip.s && t < clip.e;
  $('now').innerHTML = `第 ${clip.row} 列　<b>${clock(t)}</b>　${inNg ? '正在播<b>會剪掉的部分</b>' : t < clip.s ? '前 1 秒' : '後 1 秒'}`;
}
function tick() {
  if (!clip) return;
  if (video.currentTime >= clip.b || video.ended) { drawBar(); stop(); $('now').textContent = '播完了；再按 ▶ 重聽'; return; }
  drawBar();
  requestAnimationFrame(tick);
}
async function play(row) {
  const r = state.ng.find((x) => x.row === row);
  if (!r || !state.video) return;
  if (clip?.row === row) { stop(); $('now').textContent = '已停止'; return; }
  stop();
  if (video.readyState < 1) await new Promise((ok) => video.addEventListener('loadedmetadata', ok, { once: true }));
  const dur = Number.isFinite(video.duration) ? video.duration : r.end + PAD;
  clip = { row, s: r.start, e: r.end, a: Math.max(0, r.start - PAD), b: Math.min(dur, r.end + PAD) };
  $('barA').textContent = clock(clip.a);
  $('barB').textContent = clock(clip.b);
  syncRow(r);
  video.currentTime = clip.a;
  try { await video.play(); } catch (e) { clip = null; syncRow(r); $('now').textContent = `播不出來：${e.message}`; return; }
  requestAnimationFrame(tick);
}

// 還沒試聽時，畫面先停在第一段 NG 的開頭（不是黑畫面）
video.addEventListener('loadedmetadata', () => { if (!clip && state?.ng.length) video.currentTime = state.ng[0].start; });

$('rows').addEventListener('change', (e) => {
  const li = e.target.closest('.ct-row');
  if (li && e.target.type === 'checkbox') toggle(Number(li.dataset.row), e.target.checked);
});
$('rows').addEventListener('click', (e) => {
  const btn = e.target.closest('.ct-play');
  if (btn) play(Number(btn.closest('.ct-row').dataset.row));
});

// ---------- 載入與同步 ----------
async function load() {
  const res = await fetch('/api/cuts', { cache: 'no-store' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `HTTP ${res.status}`);
  return res.json();
}
async function refresh(first = false) {
  try {
    const next = await load();
    if (first || !state || (!pendingSaves && (next.hash !== state.hash || next.readOnly !== state.readOnly))) {
      state = next;
      render();
    }
  } catch (e) {
    if (first) { $('empty').hidden = false; $('empty').textContent = `讀不到剪輯清單：${e.message}`; }
    setSave('error', '連不到剪輯服務，請確認還開著');
  }
}
refresh(true);
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);

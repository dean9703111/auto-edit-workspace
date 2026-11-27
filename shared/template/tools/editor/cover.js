// 封面台（090）：挑講者的表情、勾情境寫描述、複製封面指令給 AI；出好的三張在右邊，改字按「重新出圖」，喜歡的按「選這張」。
// 狀態都在伺服器（/api/cover）；這一頁每 2.5 秒看一次有沒有新出的圖。正在打字的那一張不會被蓋掉。
const $ = (id) => document.getElementById(id);
const POLL_MS = 2500;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = null;
let sideReady = false;
const dirty = new Set();          // 有還沒送出的修改的那幾張
const message = new Map();        // 每一張下面那一行字：{ text, err }

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `剪輯台沒有回應（${r.status}）`);
  return j;
}
function setSave(kind, text) { const el = $('saveState'); el.dataset.state = kind; el.querySelector('.txt').textContent = text; }
function setStatus(text, err = false) { const el = $('status'); el.textContent = text; el.classList.toggle('err', err); }

// ---------- 左欄 ----------

// 091 講者那一格：一張預覽＋時間軸（取代原本 8 張候選照片；作者：「不需要有那麼多的照片顯示，而是出現時間軸讓人可以選擇用哪一張」）。
// 拖時間軸只換預覽（影片跳到那一秒），按「用這一格」才寫 cover.json（「去背＋內容」出過就重出）。建議的幾格是時間軸下面的小刻度。
// 每 2.5 秒看一次狀態，時間軸和刻度只在真的變了才動：拖到一半不會被拉回去，畫面也不會閃
const fmtAt = (t) => `${Number(t).toFixed(1)} 秒`;
// 不閃：影片藏起來只負責解碼，畫面畫在 canvas 上，新的那一格解好（seeked）才換，中間一直是上一格。
// 拖的時候一次只跳一格：上一次還沒跳完就只記最後要去的秒數，跳完再接著跳（不會一口氣排幾十次跳格）
let frameReady = false, seeking = false, want = null;
function drawFrame() {
  const v = $('frameVideo'), cv = $('frameCanvas');
  if (!v.videoWidth) return;
  if (cv.width !== v.videoWidth || cv.height !== v.videoHeight) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
  cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
  cv.dataset.at = v.currentTime.toFixed(1);
}
function pumpSeek() {
  const v = $('frameVideo');
  if (seeking || want == null || v.readyState < 1) return;
  const t = want;
  want = null;
  seeking = true;
  v.currentTime = t;
}
// 片長：伺服器給的（state.duration）；剪輯台是改版前啟動的（舊的伺服器沒有 duration、video）就用影片自己的長度，並提醒重新啟動
const durOf = () => Number(state.duration) || Number($('frameVideo').duration) || 0;
function renderFrame() {
  const v = $('frameVideo'), r = $('frameAt'), dur = Math.max(0.1, durOf());
  if (!frameReady) {
    v.addEventListener('seeked', () => { seeking = false; drawFrame(); pumpSeek(); });
    v.addEventListener('loadedmetadata', () => {
      // 舊的伺服器沒給片長：一開始的 max 不對，value 被夾小了 → 照影片的長度重設，換回封面用的那一格
      if (!state.duration) { r.max = String(Math.floor(Math.max(0.1, durOf()) * 10) / 10); r.value = String(state.at ?? 0); want = Number(r.value); renderFrame(); }
      pumpSeek();
    });
    if (!state.video || !state.duration) setStatus('剪輯台是更新前啟動的，時間軸先用舊的方式播；重新啟動剪輯台（node shared/template/tools/editor.mjs --stop，再開一次）比較穩。', true);
    v.addEventListener('error', () => { seeking = false; setStatus('講者預覽載入不了（影片解碼失敗）；時間軸照樣可以挑，按「用這一格」後封面會用那一秒。', true); });
    r.max = String(Math.floor(dur * 10) / 10);
    r.value = String(state.at ?? 0);
    want = Number(r.value);
    v.src = state.video || '/media/source.mp4';   // 舊的伺服器沒有 /cover/video
    frameReady = true;
  }
  const marks = $('frameMarks'), key = JSON.stringify([dur, state.candidates.map((x) => x.at)]);   // 片長變了刻度位置也要重算
  if (marks.dataset.key !== key) {
    marks.innerHTML = state.candidates.map((x) => `<button type="button" class="cv-mark" data-at="${x.at}" style="left:${(x.at / dur) * 100}%" aria-label="跳到建議的 ${x.at} 秒" title="建議：${x.at} 秒"></button>`).join('');
    marks.dataset.key = key;
  }
  for (const m of marks.querySelectorAll('.cv-mark')) m.classList.toggle('used', Number(m.dataset.at) === state.at);
  syncFrame();
}
// 預覽上的字、按鈕：現在看的這一格是不是用在封面的那一格
function syncFrame() {
  const t = Number($('frameAt').value), used = state.at != null && Math.abs(t - state.at) < 0.05;
  $('frameTime').textContent = fmtAt(t);
  $('frameNow').textContent = state.at != null ? `（封面用 ${fmtAt(state.at)}）` : '';
  const badge = $('frameBadge');
  badge.textContent = used ? '✓ 封面用這一格' : '預覽';
  badge.classList.toggle('used', used);
  $('frameUse').disabled = used;
}
function seekFrame(t) {
  $('frameAt').value = String(t);
  want = Number(t);
  pumpSeek();
  syncFrame();
}
function renderSide() {
  $('scenes').innerHTML = state.scenes.map((s) => `<div class="cv-scene${s.on ? '' : ' off'}" data-scene="${s.id}">
    <input type="checkbox" id="on-${s.id}" ${s.on ? 'checked' : ''}><label for="on-${s.id}">${esc(s.name)}</label>
    <textarea rows="2" maxlength="600" aria-label="${esc(s.name)}的描述" placeholder="${esc(s.preset)}">${esc(s.note)}</textarea></div>`).join('');
  $('title').value = state.title || '';
  if (state.prompt) showPrompt();
  sideReady = true;
}
function showPrompt() {
  $('promptBox').hidden = false;
  $('prompt').value = state.prompt;
  $('savedTo').textContent = `需求存在 ${state.savedTo}/request.md；出好的圖在 ${state.out}/`;
}
const requestBody = () => ({
  title: $('title').value.trim(),
  scenes: Object.fromEntries([...document.querySelectorAll('.cv-scene')].map((el) => [el.dataset.scene, { on: el.querySelector('input').checked, note: el.querySelector('textarea').value.trim() }])),
});

// ---------- 右邊三張 ----------

const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
function set(o, path, value) {
  const ks = path.split('.');
  let cur = o;
  ks.slice(0, -1).forEach((k, i) => { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; cur = cur[k]; });
  cur[ks.at(-1)] = value;
}
// 這一張可以直接改的字：共用的標題欄位＋這個情境自己的
function fieldsOf(scene, d) {
  const L = state.limits, out = [
    { path: 'kicker', label: `小標（標題上面，選填，最多 ${L.kicker} 個字寬）` },
    { path: 'title', label: `標題（| 換行、*詞* 套主色底；最多 ${L.lines} 行、一行 ${L.lineMax} 個字寬）` },
    { path: 'sub', label: '副標（標題下面，選填）' },
  ];
  if (scene === 'cutout') out.push({ path: 'behind.at', label: `後面那張內容取${state.hasFinal ? '完成影片' : '初剪'}的第幾秒（留空：工具自己挑）`, number: true, skip: !!d.behind?.image });
  if (scene === 'mock' && d.mock) {
    const m = d.mock;
    if (m.kind === 'alert') out.push({ path: 'mock.title', label: '警示框：標題' }, { path: 'mock.body', label: '警示框：內文' }, { path: 'mock.buttons.0', label: '按鈕 1' }, { path: 'mock.buttons.1', label: '按鈕 2' });
    if (m.kind === 'chat') (m.bubbles || []).forEach((b, i) => out.push({ path: `mock.bubbles.${i}.text`, label: `對話 ${i + 1}（${b.me ? '觀眾' : '對方'}）` }));
    if (m.kind === 'compare') for (const k of ['left', 'right']) {
      out.push({ path: `mock.${k}.title`, label: `${k === 'left' ? '左' : '右'}卡：標題` });
      (m[k]?.rows || []).forEach((_, i) => out.push({ path: `mock.${k}.rows.${i}`, label: `${k === 'left' ? '左' : '右'}卡：第 ${i + 1} 列` }));
    }
  }
  if (scene === 'icon' && !d.image && !d.pic) out.push({ path: 'icon', label: '圖示名稱（kit/icons.json）' });
  return out.filter((f) => !f.skip);
}
function formHtml(s) {
  const d = s.data, V = state.format === 'portrait';
  const fields = fieldsOf(s.id, d).map((f) => `<label>${esc(f.label)}<input type="text" data-path="${f.path}"${f.number ? ' data-number inputmode="decimal"' : ''} value="${esc(get(d, f.path) ?? '')}"></label>`).join('');
  const chips = V ? '' : `<label>底部重點（最多 ${state.limits.chips} 個，每個最多 ${state.limits.chip} 個字寬）<div class="cv-chips">${Array.from({ length: state.limits.chips }, (_, i) => { const c = (d.chips || [])[i]; return `<input type="text" data-chip="${i}" value="${esc(typeof c === 'string' ? c : c?.text ?? '')}">`; }).join('')}</div></label>`;
  return `${fields}${chips}<div class="cv-actions"><button class="small" data-act="render">重新出圖</button><button class="small primary" data-act="pick">選這張</button></div><p class="cv-msg" role="status"></p>`;
}
function renderCard(s) {
  let card = document.querySelector(`.cv-card[data-scene="${s.id}"]`);
  if (!card) {
    card = document.createElement('article');
    card.className = 'cv-panel cv-card'; card.dataset.scene = s.id;
    card.innerHTML = `<div class="cv-head"><h3>${esc(s.name)}</h3><small></small><span class="cv-tag" hidden>✓ 已選這張</span></div><div class="cv-shot"></div><div class="cv-form"></div>`;
    $('list').append(card);
  }
  card.classList.toggle('portrait', state.format === 'portrait');
  card.classList.toggle('picked', state.pick === s.id);
  card.querySelector('.cv-tag').hidden = state.pick !== s.id;
  card.querySelector('.cv-head small').textContent = s.on ? '' : '這次沒勾';
  const shot = card.querySelector('.cv-shot');
  if (s.image) { if (shot.dataset.src !== s.image) { shot.innerHTML = `<img src="${esc(s.image)}" alt="${esc(s.name)}的封面">`; shot.dataset.src = s.image; } }
  else if (shot.dataset.src !== '') { shot.innerHTML = `<div class="cv-empty">${s.data ? '內容寫好了，還沒出圖。按「重新出圖」。' : '還沒有這一張。左邊按「複製封面指令」貼給 AI。'}</div>`; shot.dataset.src = ''; }
  shot.classList.toggle('busy', !!state.job?.running && !!s.data);
  const form = card.querySelector('.cv-form'), sig = JSON.stringify(s.data);
  if (!s.data) { form.innerHTML = ''; form.dataset.sig = ''; }
  else if (!dirty.has(s.id) && form.dataset.sig !== sig) { form.innerHTML = formHtml(s); form.dataset.sig = sig; }
  const msg = card.querySelector('.cv-msg'), m = message.get(s.id);
  if (msg) { msg.textContent = m?.text || ''; msg.classList.toggle('err', !!m?.err); }
  const pick = card.querySelector('[data-act="pick"]');
  if (pick) pick.disabled = !s.image || !!state.job?.running;
}
function coverFrom(card, s) {
  const cover = JSON.parse(JSON.stringify(s.data || {}));
  card.querySelectorAll('[data-path]').forEach((el) => {
    const v = el.value.trim(), path = el.dataset.path;
    if (el.hasAttribute('data-number')) { if (v === '') { if (path === 'behind.at' && cover.behind) delete cover.behind.at; } else set(cover, path, Number(v)); }
    else set(cover, path, v);
  });
  const chips = [...card.querySelectorAll('[data-chip]')];
  if (chips.length) cover.chips = chips.map((el, i) => { const old = (s.data.chips || [])[i]; return { ...(typeof old === 'object' && old ? old : {}), text: el.value.trim() }; }).filter((c) => c.text);
  for (const k of ['kicker', 'sub']) if (cover[k] === '') cover[k] = null;
  if (Array.isArray(cover.mock?.buttons)) cover.mock.buttons = cover.mock.buttons.filter(Boolean);
  if (cover.behind && !Object.keys(cover.behind).length && s.data.behind && 'at' in s.data.behind) cover.behind = {};
  return cover;
}

// ---------- 套用狀態 ----------

function apply(next) {
  const first = !state;
  state = next;
  $('projName').textContent = `${next.project}${next.ready ? `・${next.format === 'portrait' ? '直式 1080×1920' : '橫式 1920×1080'}` : ''}`;
  if (!next.ready) { $('main').hidden = true; $('blocked').hidden = false; $('blocked').textContent = next.message.split(' → ').join('\n'); setSave('idle', '還不能做封面'); return; }
  $('main').hidden = false; $('blocked').hidden = true;
  if (!sideReady) renderSide();
  renderFrame();
  next.scenes.forEach(renderCard);
  if (next.job?.running) setSave('busy', '出圖中…');
  else if (next.job && next.job.ok === false) setSave('error', '出圖沒有成功');
  else setSave('saved', first ? '已載入' : '已是最新');
  if (next.job && !next.job.running && next.job.message) for (const s of next.scenes) if (!message.get(s.id)?.err && next.job.ok === false) message.set(s.id, { text: next.job.message, err: true });
}
async function refresh() {
  try { apply(await api('/api/cover')); }
  catch { setSave('error', '連不到剪輯台'); }
}

// ---------- 事件 ----------

$('frameAt').addEventListener('input', () => seekFrame($('frameAt').value));
$('frameMarks').addEventListener('click', (e) => { const m = e.target.closest('.cv-mark'); if (m) seekFrame(m.dataset.at); });
$('frameUse').addEventListener('click', async () => {
  const at = Math.round(Number($('frameAt').value) * 10) / 10;
  try { apply(await api('/api/cover/options', { at })); setStatus(`講者改用 ${fmtAt(at)}那一格${state.scenes.find((s) => s.id === 'cutout')?.image ? '，「去背＋內容」重出中' : ''}。`); }
  catch (err) { setStatus(err.message, true); }
});
$('scenes').addEventListener('change', (e) => { const row = e.target.closest('.cv-scene'); if (row && e.target.type === 'checkbox') row.classList.toggle('off', !e.target.checked); });
$('copy').addEventListener('click', async () => {
  try {
    apply(await api('/api/cover/request', requestBody()));
    showPrompt();
    let copied = false;
    try { await navigator.clipboard.writeText(state.prompt); copied = true; }
    catch { $('promptBox').open = true; $('prompt').focus(); $('prompt').select(); try { copied = document.execCommand('copy'); } catch { copied = false; } }
    setStatus(copied ? '已複製。貼給 AI，出好的圖會出現在右邊。' : '需求已存檔，但沒辦法自動複製：請手動複製下面那一段貼給 AI。', !copied);
  } catch (err) { setStatus(err.message, true); }
});
$('list').addEventListener('input', (e) => { const card = e.target.closest('.cv-card'); if (card) dirty.add(card.dataset.scene); });
$('list').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.closest('.cv-card')?.querySelector('[data-act="render"]')?.click(); });
$('list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]'), card = btn?.closest('.cv-card');
  if (!btn) return;
  const id = card.dataset.scene, s = state.scenes.find((x) => x.id === id);
  try {
    if (btn.dataset.act === 'render') {
      message.set(id, { text: '出圖中…' });
      const next = await api('/api/cover/edit', { scene: id, cover: coverFrom(card, s) });
      dirty.delete(id); message.set(id, { text: '' });
      apply(next);
    } else {
      apply(await api('/api/cover/pick', { scene: id }));
      message.set(id, { text: `已選：${state.out}/cover.jpg` });
      renderCard(state.scenes.find((x) => x.id === id));
    }
  } catch (err) { message.set(id, { text: err.message, err: true }); renderCard(s); }
});

await refresh();
setInterval(refresh, POLL_MS);

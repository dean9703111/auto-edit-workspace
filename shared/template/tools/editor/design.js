const $ = (id) => document.getElementById(id);
const kindNames = { fs: '全畫面', side: '側邊欄', ch: '章節' };
const notes = { fs: '全畫面資訊卡與情境動畫共用這張背景。', side: '側邊欄完成預覽 · 背景圖為 960 × 1080。', ch: '章節轉場使用這張背景，保留章名的留白。' };
let state = null, kind = 'fs', category = 'all', expanded = false, pending = null, reading = false, copiedRequestId = null, copyFailureId = null, refreshing = false, mutation = 0;
const frames = new Set();
const observer = new IntersectionObserver((entries) => { for (const e of entries) { e.target.previewVisible = e.isIntersecting; if (!e.isIntersecting) e.target.previewPlaying = false; send(e.target); } }, { rootMargin: '100px' });
function notify() { window.dispatchEvent(new Event('design-state')); }
window.designWorkbench = {
  get dirty() { return !!state?.dirty; }, get busy() { return !!pending || reading; },
  get saveId() { return state?.dirty ? state.draft.id : null; },
  flush: async () => { if (pending) await pending; },
  accept: (s) => { mutation++; state = { ...state, ...s }; render(); },
};
function error(e) { $('designError').textContent = e.message || String(e); }
function renderGenerationStatus() {
  const el = $('designGenerationStatus'), req = state?.request, progress = req?.progress;
  el.dataset.state = progress?.state || 'waiting';
  if (!req) { el.textContent = '複製指令貼給 AI，依指定風格生成 3 組、共 9 張。'; return; }
  const count = `${req.foundCount}/${req.expectedCount} 張已存檔`;
  if (progress?.state === 'generating') el.textContent = `生成中 · ${count}${progress.message ? ` · ${progress.message}` : ''}`;
  else if (progress?.state === 'failed') el.textContent = `生成失敗 · ${progress.message || '請查看 AI 回報的原因後重試'}（${count}）`;
  else if (progress?.state === 'done') el.textContent = `生成完成 · ${count}，請在上方選圖預覽。`;
  else if (copyFailureId === req.id) el.textContent = '指令已儲存，請手動複製展開的文字貼給 AI。';
  else if (copiedRequestId === req.id) el.textContent = `已複製，請貼給 AI；AI 回報開始後會顯示「生成中」。${req.foundCount ? `（${count}）` : ''}`;
  else el.textContent = `指令已儲存，請複製貼給 AI。${req.foundCount ? `（${count}）` : ''}`;
}
async function request(url, body) {
  const r = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const incompatible = r.status === 404 ? '剪輯台仍是舊版，請重新啟動服務後按「重新連接」。目前的構圖調整會保留。' : '剪輯台的回應格式不正確，請重新連接後再試。';
  if (!r.headers.get('content-type')?.includes('application/json')) throw new Error(incompatible);
  let data;
  try { data = await r.json(); } catch { throw new Error(incompatible); }
  if (!data || typeof data !== 'object') throw new Error(incompatible);
  if (!r.ok) throw new Error(data.message || '設定沒有儲存，請重試。'); return data;
}
async function transact(url, body) {
  if (pending) await pending;
  $('designError').textContent = '';
  mutation++;
  if (!['/api/design/request', '/api/design/import'].includes(url)) copiedRequestId = null;
  pending = request(url, body);
  render();
  try { state = { ...state, ...await pending }; mutation++; }
  finally { pending = null; render(); }
}
function designPayload() {
  if (!state) return null;
  const base = `/design/${state.draft.id || 'draft'}`;
  return { base, css: `${base}/brand.css?v=${state.draft.color.slice(1)}`, theme: state.theme, backgrounds: state.backgrounds };
}
function send(frame) {
  if (!state || !frame?.contentWindow) return;
  frame.contentWindow.postMessage({ type: 'design-preview', image: window.framingImage || null, design: designPayload(), playback: frame.previewVisible && frame.previewPlaying ? 'play' : 'still', completedAt: frame.completedAt ?? null, restart: frame.previewRestart || 0 }, location.origin);
}
function broadcast() { for (const frame of frames) if (frame.previewVisible) send(frame); }
window.addEventListener('framing-preview', broadcast);
window.addEventListener('message', (e) => { if (e.origin === location.origin && ['design-preview-ready', 'hf-preview-ready'].includes(e.data?.type)) { const frame = [...frames].find((f) => f.contentWindow === e.source); if (frame) send(frame); } });
function bindMotion(stage, frame) {
  stage.onmouseenter = () => { frame.previewPlaying = true; send(frame); };
  stage.onmouseleave = () => { frame.previewPlaying = false; send(frame); };
}
function frameFor(preview, at = null) {
  const frame = document.createElement('iframe'); frame.title = preview.title; frame.loading = 'lazy';
  frame.completedAt = at;
  const query = new URLSearchParams();
  if (state.theme === 'dark') query.set('theme', 'dark');
  if (at !== null) query.set('t', at);
  frame.src = `/gallery/preview/${preview.file}${query.size ? `?${query}` : ''}`;
  frame.addEventListener('load', () => send(frame)); frames.add(frame); observer.observe(frame); return frame;
}
function renderBackgroundPreview() {
  const sample = $('designBg').closest('.design-bg-sample'), stage = $('designBgComposite');
  const preview = kind === 'side' ? state.previews.find((p) => p.file.startsWith('03-')) : null;
  sample.dataset.kind = preview ? 'composite' : kind;
  sample.setAttribute('aria-label', preview ? '側邊欄完成預覽：資訊卡與講者實際位置' : `${kindNames[kind]}背景`);
  sample.querySelector('.design-bg-image').hidden = !!preview;
  stage.hidden = !preview;
  if (!preview || stage.dataset.file !== preview.file) {
    for (const frame of stage.querySelectorAll('iframe')) { observer.unobserve(frame); frames.delete(frame); }
    stage.replaceChildren(); delete stage.dataset.file;
  }
  if (preview && !stage.dataset.file) {
    const frame = frameFor(preview, 3.2); frame.loading = 'eager';
    bindMotion(stage, frame);
    const button = document.createElement('button'); button.className = 'design-bg-enlarge';
    button.setAttribute('aria-label', '放大側邊欄完成預覽'); button.innerHTML = '<span>放大預覽 ↗</span>';
    button.addEventListener('click', (e) => showPreview(preview, 3.2, e.pointerType === 'touch' || e.detail === 0));
    stage.append(frame, button); stage.dataset.file = preview.file;
  }
}
function showPreview(preview, at = null, playOnOpen = false) {
  $('designDialogTitle').textContent = preview.title;
  closeDialog();
  const stage = $('designDialogStage'); stage.style.aspectRatio = state.format === 'portrait' ? '9 / 16' : '16 / 9';
  const frame = frameFor(preview, at); frame.loading = 'eager'; frame.previewVisible = true; stage.append(frame); bindMotion(stage, frame);
  $('designDialog').showModal(); frame.previewPlaying = playOnOpen || stage.matches(':hover'); send(frame);
}
function renderPreviews() {
  for (const frame of $('designPreviews').querySelectorAll('iframe')) { observer.unobserve(frame); frames.delete(frame); }
  $('designPreviews').replaceChildren();
  const list = state.previews.filter((p) => category === 'all' || p.category === category);
  for (const preview of expanded ? list : list.slice(0, 6)) {
    const card = document.createElement('figure'); card.className = 'design-preview-card';
    const stage = document.createElement('div'); stage.className = 'design-preview-stage';
    if (state.format === 'portrait') stage.style.aspectRatio = '9 / 16';
    const frame = frameFor(preview); stage.append(frame); bindMotion(stage, frame);
    const button = document.createElement('button'); button.setAttribute('aria-label', `放大預覽 ${preview.title}`); button.innerHTML = '<span>放大預覽 ↗</span>'; button.addEventListener('click', (e) => showPreview(preview, null, e.pointerType === 'touch' || e.detail === 0)); stage.append(button);
    const caption = document.createElement('figcaption'), title = document.createElement('span'), badge = document.createElement('small');
    title.textContent = preview.title; badge.textContent = kindNames[preview.kind]; caption.append(title, badge); card.append(stage, caption); $('designPreviews').append(card);
  }
  $('showAllPreviews').hidden = list.length <= 6;
  $('showAllPreviews').textContent = expanded ? '收起，先看六個範例' : `展開全部 ${list.length} 個動畫`;
}
function render() {
  if (!state) return;
  const busy = !!pending || reading;
  for (const b of document.querySelectorAll('[data-kind]')) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
  for (const id of ['brandColor', 'brandHex', 'backgroundUpload', 'referenceUpload', 'designDirection', 'copyDesignPrompt', 'refreshDesignCandidates']) $(id).disabled = busy;
  for (const zone of document.querySelectorAll('label[for="backgroundUpload"], label[for="referenceUpload"]')) zone.setAttribute('aria-disabled', String(busy));
  for (const b of document.querySelectorAll('[data-brand]')) b.disabled = busy;
  $('copyDesignPrompt').textContent = copiedRequestId && copiedRequestId === state.request?.id ? '已複製，貼給 AI 生圖' : '複製生圖指令';
  // 影片摘要：有就可以勾（預設勾）、看得到內容；沒有就說明原因
  const sm = state.summary || { ready: false, text: '', note: '' };
  $('designUseSummary').disabled = busy || !sm.ready;
  $('designSummaryDetails').hidden = !sm.ready;
  $('designSummaryText').textContent = sm.text;
  $('designSummaryNote').hidden = sm.ready || !sm.note;
  $('designSummaryNote').textContent = sm.note;
  renderGenerationStatus();
  $('brandColor').value = state.draft.color;
  if (document.activeElement !== $('brandHex')) $('brandHex').value = state.draft.color;
  $('designState').textContent = busy ? '背景處理中' : state.dirty ? '自動套用中…' : '已套用的風格';
  $('designState').dataset.dirty = String(!!state.dirty);
  const bg = state.backgrounds.find((b) => b.kind === kind);
  renderBackgroundPreview();
  $('designBg').hidden = !bg?.exists; $('designBgEmpty').hidden = !!bg?.exists;
  if (bg?.exists && $('designBg').getAttribute('src') !== bg.url) $('designBg').src = bg.url;
  $('designKindNote').textContent = notes[kind];
  $('designRef').hidden = !state.reference;
  $('removeDesignRef').hidden = !state.reference; $('removeDesignRef').disabled = busy;
  $('discardDesign').hidden = !state.dirty; $('discardDesign').disabled = busy;
  $('designRefName').textContent = state.reference?.name || '拖入參考圖，或點選上傳';
  if (state.reference) $('designRef').src = state.reference.url;
  $('designPromptDetails').hidden = !state.request;
  $('refreshDesignCandidates').hidden = !state.request;
  if (state.request) {
    $('designRequestPath').textContent = `儲存於：${state.request.savedTo}`;
    $('designPrompt').value = state.request.prompt;
  }
  {
    const available = state.request?.candidates.filter((c) => c.backgrounds?.[kind]?.ready).length || 0;
    $('designRequestStatus').textContent = state.request ? `原本背景 + ${available}/3 張生成圖` : '選圖替換';
    $('designCandidates').replaceChildren();
    const original = state.originals?.find((b) => b.kind === kind);
    const candidates = [{ variant: 'original', backgrounds: { [kind]: { ready: true, thumb: original?.thumb } } }, ...(state.request?.candidates || [])];
    for (const candidate of candidates) {
      const isOriginal = candidate.variant === 'original', label = isOriginal ? '原本背景' : candidate.variant;
      const image = candidate.backgrounds?.[kind] || { ready: false, thumb: null };
      const selected = isOriginal ? !!original?.selected : !original?.selected && state.request?.selectedByKind?.[kind] === candidate.variant;
      const button = document.createElement('button'); button.disabled = busy || !image.ready;
      button.dataset.variant = candidate.variant;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${kindNames[kind]}${isOriginal ? label : `背景 ${label}`}${selected ? '，使用中' : '，點選替換'}`);
      if (image.thumb) {
        const sample = document.createElement('span'); sample.className = 'design-candidate-sample design-bg-sample'; sample.dataset.kind = kind;
        const background = document.createElement('span'); background.className = 'design-bg-image';
        const img = document.createElement('img'); img.src = image.thumb; img.alt = `${kindNames[kind]}背景 ${label}`; background.append(img);
        const speaker = document.createElement('span'); speaker.className = 'design-bg-speaker'; speaker.setAttribute('aria-hidden', 'true');
        sample.append(background, speaker); button.append(sample);
      }
      const title = document.createElement('span'), note = document.createElement('small');
      title.textContent = label; note.textContent = selected ? '使用中' : image.ready ? '點選替換' : '尚未生成';
      button.append(title, note);
      button.addEventListener('click', () => {
        if (!selected) transact(isOriginal ? '/api/design/original' : '/api/design/import', isOriginal ? { kind } : { requestId: state.request.id, variant: candidate.variant, kind }).catch(error);
      });
      $('designCandidates').append(button);
    }
  }
  broadcast(); notify();
}
async function color(value) {
  if (!/^#[\da-f]{6}$/i.test(value)) throw new Error('請輸入完整的六位色碼。');
  await transact('/api/design/color', { color: value });
}
$('brandColor').addEventListener('change', () => color($('brandColor').value).catch(error));
$('brandHex').addEventListener('change', () => color($('brandHex').value.trim()).catch(error));
for (const button of document.querySelectorAll('[data-brand]')) button.addEventListener('click', () => color(button.dataset.brand).catch(error));
for (const button of document.querySelectorAll('[data-kind]')) button.addEventListener('click', () => {
  kind = button.dataset.kind;
  for (const b of document.querySelectorAll('[data-kind]')) b.setAttribute('aria-pressed', String(b === button)); render();
});
for (const button of document.querySelectorAll('[data-category]')) button.addEventListener('click', () => {
  category = button.dataset.category; expanded = false;
  for (const b of document.querySelectorAll('[data-category]')) b.setAttribute('aria-pressed', String(b === button)); renderPreviews();
});
$('showAllPreviews').addEventListener('click', () => { expanded = !expanded; renderPreviews(); });
for (const id of ['designDirection', 'designDescription', 'designUseSummary']) $(id).addEventListener('input', () => { copiedRequestId = null; $('copyDesignPrompt').textContent = '複製生圖指令'; });
function dataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('讀不到圖片，請重新選擇。')); reader.readAsDataURL(file); }); }
async function uploadFile(file, role) {
  if (!state) throw new Error('設定還在載入，請稍後再上傳。');
  if (window.designWorkbench.busy) throw new Error('圖片正在處理，完成後再上傳下一張。');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error('請選擇 12 MB 以內的 JPG、PNG 或 WebP。');
  const uploadKind = kind;
  reading = true; render();
  try { await transact('/api/design/upload', { role, kind: uploadKind, name: file.name, image: await dataUrl(file) }); }
  finally { reading = false; render(); }
}
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
function bindUpload(inputId, role) {
  const input = $(inputId), zone = document.querySelector(`label[for="${inputId}"]`);
  let depth = 0;
  const reset = () => { depth = 0; zone.classList.remove('is-dragover'); };
  input.addEventListener('change', async () => {
    try { if (input.files[0]) await uploadFile(input.files[0], role); } catch (e) { error(e); }
    finally { input.value = ''; }
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); if (!input.disabled) input.click();
  });
  zone.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    if (!input.disabled) { depth++; zone.classList.add('is-dragover'); }
  });
  zone.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = input.disabled ? 'none' : 'copy';
  });
  zone.addEventListener('dragleave', () => { if (--depth <= 0) reset(); });
  zone.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation(); reset();
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length !== 1) { error(new Error('每次請拖入一張圖片檔，或點選上傳。')); return; }
    try { await uploadFile(files[0], role); } catch (err) { error(err); }
  });
}
bindUpload('backgroundUpload', 'background');
bindUpload('referenceUpload', 'reference');
// 檔案放在其他位置也不讓瀏覽器跳走；文字拖放仍沿用瀏覽器原本的操作。
document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', (e) => { if (hasFiles(e)) { e.preventDefault(); error(new Error('請將圖片拖到參考圖或背景上傳區。')); } });
$('copyDesignPrompt').addEventListener('click', async () => {
  try {
    copiedRequestId = null; copyFailureId = null;
    await transact('/api/design/request', { description: $('designDescription').value, direction: $('designDirection').value, useSummary: $('designUseSummary').checked });
    try {
      await navigator.clipboard.writeText(state.request.prompt);
      copiedRequestId = state.request.id;
      $('copyDesignPrompt').textContent = '已複製，貼給 AI 生圖';
    } catch {
      $('designPromptDetails').open = true;
      $('designPrompt').focus(); $('designPrompt').select();
      copyFailureId = state.request.id;
      $('designRequestStatus').textContent = '指令已儲存，請手動複製展開的文字。';
    }
    renderGenerationStatus();
  } catch (e) { error(e); }
});
async function refreshCandidates(silent = false) {
  if (!state?.request || pending || reading || refreshing) return;
  refreshing = true;
  try {
    const version = mutation;
    const data = await request('/api/design');
    if (pending || reading || version !== mutation) return;
    if (!silent) $('designError').textContent = '';
    const next = { ...state, ...data };
    if (JSON.stringify(next) !== JSON.stringify(state)) { state = next; render(); }
    if (!silent && !state.request?.candidates.some((c) => c.backgrounds?.[kind]?.ready)) $('designRequestStatus').textContent = '這類背景還沒有生成圖片。';
  } finally { refreshing = false; }
}
$('refreshDesignCandidates').addEventListener('click', () => refreshCandidates().catch(error));
window.addEventListener('focus', () => refreshCandidates(true).catch(() => {}));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCandidates(true).catch(() => {}); });
$('removeDesignRef').addEventListener('click', () => transact('/api/design/reference/remove', {}).catch(error));
$('discardDesign').addEventListener('click', () => transact('/api/design/discard', {}).catch(error));
function closeDialog() {
  for (const frame of $('designDialogStage').querySelectorAll('iframe')) { observer.unobserve(frame); frames.delete(frame); }
  $('designDialogStage').replaceChildren();
}
$('closeDesignDialog').addEventListener('click', () => $('designDialog').close());
$('designDialog').addEventListener('close', closeDialog);
$('replayDesign').addEventListener('click', () => { const f = $('designDialogStage').querySelector('iframe'); if (f) { f.previewPlaying = true; f.previewRestart = (f.previewRestart || 0) + 1; send(f); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) for (const frame of frames) { frame.previewPlaying = false; send(frame); } });
async function loadDesign() {
  $('retryDesign').disabled = true;
  try {
    state = await request('/api/design');
    if (state.request) {
      $('designDescription').value = state.request.description;
      $('designDirection').value = state.request.direction || 'auto';
      $('designUseSummary').checked = state.request.useSummary !== false;
    }
    $('designError').textContent = '';
    $('retryDesign').hidden = true;
    // 用過這一區（有生圖需求）或網址指到這裡：直接打開，不用再找
    if (state.request || location.hash === '#design') $('designWrap').open = true;
    render(); renderPreviews();
    window.dispatchEvent(new Event('framing-preview-request'));
  } catch (e) {
    $('designState').textContent = '動畫尚未載入';
    $('retryDesign').hidden = false;
    error(e);
  } finally { $('retryDesign').disabled = false; }
}
$('retryDesign').addEventListener('click', loadDesign);
await loadDesign();
setInterval(() => { if (!document.hidden) refreshCandidates(true).catch(() => {}); }, 2500);

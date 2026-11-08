// 構圖：在沒裁切的 work/rough.mp4 上拖一個鎖定比例（橫式 16:9、直式 9:16）的框，自動存成 plan.json 的 frame（畫布座標）。
// 右邊即時畫出裁切後的樣子＋字幕、下方字卡、子母畫面小視窗的位置；直式畫頭頂範圍與下巴上限。
// 分析（講者動作範圍、黑邊、建議的框）來自 GET /api/framing（qc.mjs framing 同一套）；存檔走 POST /api/save { base, frame, look }。
// 下面一起決定講者調光、瘦臉（plan.json 的 look；打開瘦臉才偵測臉：POST /api/look/run，GET /api/look/status 看進度），
// 和「用這一格當預覽參考圖」（POST /api/refframe → shared/template/preview/speaker-local.jpg，情境庫、風格預覽頁的講者改用它）。
import { lookCss } from './model.mjs';
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
// 講者動作範圍用黃色：框是主色（常常是橘色），兩個都橘的話分不出來
const ORANGE = '#FFD400', CYAN = '#00E5FF', MAGENTA = '#FF40C8';
const ACC = () => getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#FFD400';

let D = null;        // /api/framing 的回應
let F = null;        // 目前的框 { x, y, w }（h 由比例算）
let saved = null;    // plan.json 現在的 frame（null＝不裁切）
let drag = null;
let lastPreview = 0;
let framingImageTimer = null;
let look = { color: 0, slim: 0, beauty: 0 }, savedLook = { color: 0, slim: 0, beauty: 0 }, lookPrev = {}, poll = null, faceTimer = null;
const AUTOSAVE_MS = 1000;   // 停手多久就自動存
let touched = false, saveTimer = null, saving = null;   // touched：使用者動過（打開頁面還沒動，只是顯示，不寫檔；沒決定過構圖時例外，見 load）
let saveFail = null;   // 上一次沒存成功：{ sig（那時候的內容）}。沒再改就不重送（連不到另外等 5 秒重試），狀態也留著
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const sameLook = (a, b) => r2(a.color) === r2(b.color) && r2(a.slim) === r2(b.slim) && r2(a.beauty) === r2(b.beauty);
const faceOn = (l) => l.slim > 0 || l.beauty > 0;   // 瘦臉或美顏要偵測臉部、做底片

const W = () => D.canvas.W, H = () => D.canvas.H;
const portrait = () => D.canvas.format === 'portrait';
const STEP = () => (portrait() ? 18 : 16);            // 寬取 16（直式 18）的倍數，高才會是整數：16:9 → 9 的倍數、9:16 → 32 的倍數
const hOf = (w) => Math.round((w * H()) / W());
const bounds = () => D.content;                        // 內容範圍（扣掉黑邊）[x1, y1, x2, y2]
const maxW = () => { const [x1, y1, x2, y2] = bounds(); return Math.floor(Math.min(x2 - x1, ((y2 - y1) * W()) / H()) / STEP()) * STEP(); };
const minW = () => Math.min(maxW(), Math.ceil(W() / D.limits.maxZoom / STEP()) * STEP());
const clampN = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const fullFrame = () => ({ x: 0, y: 0, w: W() });
const isFull = (f) => f.w >= W();
const asArr = (f) => [Math.round(f.x), Math.round(f.y), f.w, hOf(f.w)];
const sameFrame = (a, b) => JSON.stringify(a ? asArr(a) : null) === JSON.stringify(b ? asArr(b) : null);
const fromArr = (a) => (Array.isArray(a) ? { x: a[0], y: a[1], w: a[2] } : fullFrame());

function clampFrame(f) {
  const [x1, y1, x2, y2] = bounds();
  const w = clampN(Math.round(f.w / STEP()) * STEP(), minW(), maxW()), h = hOf(w);
  return { x: Math.round(clampN(f.x, x1, x2 - w)), y: Math.round(clampN(f.y, y1, y2 - h)), w };
}

// ---------- 讀資料 ----------
async function load() {
  const r = await fetch('/api/framing');
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) { $('loading').textContent = j?.message || `讀不到構圖分析（HTTP ${r.status}）`; return; }
  D = j;
  saved = D.plan.frame ? fromArr(D.plan.frame) : null;
  // 決定過「不裁切」的留在原畫面。還沒決定過：一開始就是建議的框，也馬上存起來，使用者看到什麼完成影片就是什麼
  F = clampFrame(saved || (D.plan.decided ? fullFrame() : fromArr(D.suggestion.frame)));
  touched = !D.plan.decided && !D.plan.error;
  if (D.plan.error) { $('msg').className = 'fr-msg err'; $('msg').textContent = `分鏡檔有錯，這裡改的存不進去：${D.plan.error}\n→ 請 AI 修好再重新整理這一頁`; }
  $('projName').textContent = `${D.project.name}｜${portrait() ? '直式 9:16' : '橫式 16:9'}（${W()}×${H()}）`;
  $('stage').classList.toggle('portrait', portrait());
  $('stage').style.aspectRatio = `${W()} / ${H()}`;
  $('preview').classList.toggle('portrait', portrait());
  [$('preview').width, $('preview').height] = portrait() ? [360, 640] : [640, 360];
  $('overlay').setAttribute('viewBox', `0 0 ${W()} ${H()}`);
  $('zoom').min = (W() / maxW()).toFixed(2);
  $('zoom').max = (W() / minW()).toFixed(2);
  const v = $('video');
  v.src = D.video.url;
  v.addEventListener('loadedmetadata', () => { $('seek').max = String(v.duration || 1); v.currentTime = Math.min(v.duration / 2, 30); });
  for (const ev of ['loadeddata', 'seeked', 'timeupdate']) v.addEventListener(ev, () => { drawPreview(); showTime(); });
  v.addEventListener('play', () => { $('btnPlay').textContent = '❚❚'; tick(); });
  v.addEventListener('pause', () => { $('btnPlay').textContent = '▶'; });
  for (const ev of ['seeked', 'pause']) v.addEventListener(ev, () => refreshFaces());
  initLook();
  refNote();
  legend();
  renderUpdate();
  $('loading').hidden = true;
  $('main').hidden = false;
  render();
}

// ---------- 畫框 ----------
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}
function render() {
  const svg = $('overlay'), h = hOf(F.w), px = W() / ($('stage').getBoundingClientRect().width || W());
  svg.replaceChildren();
  el('path', { d: `M0 0H${W()}V${H()}H0Z M${F.x} ${F.y}h${F.w}v${h}h${-F.w}Z`, 'fill-rule': 'evenodd', fill: 'rgba(0,0,0,0.58)' }, svg);
  const [cx1, cy1, cx2, cy2] = bounds();
  if (cx1 > 0 || cy1 > 0 || cx2 < W() || cy2 < H()) el('rect', { x: cx1, y: cy1, width: cx2 - cx1, height: cy2 - cy1, fill: 'none', stroke: 'rgba(255,255,255,0.45)', 'stroke-dasharray': '6 6', 'vector-effect': 'non-scaling-stroke' }, svg);
  const [mx1, my1, mx2, my2] = D.motion;
  el('rect', { x: mx1, y: my1, width: mx2 - mx1, height: my2 - my1, fill: 'none', stroke: ORANGE, 'stroke-width': 2, 'stroke-dasharray': '8 5', 'vector-effect': 'non-scaling-stroke' }, svg);
  for (let i = 1; i < 3; i++) {
    el('line', { x1: F.x + (F.w * i) / 3, y1: F.y, x2: F.x + (F.w * i) / 3, y2: F.y + h, stroke: 'rgba(255,255,255,0.25)', 'vector-effect': 'non-scaling-stroke' }, svg);
    el('line', { x1: F.x, y1: F.y + (h * i) / 3, x2: F.x + F.w, y2: F.y + (h * i) / 3, stroke: 'rgba(255,255,255,0.25)', 'vector-effect': 'non-scaling-stroke' }, svg);
  }
  el('rect', { class: 'fr-box', x: F.x, y: F.y, width: F.w, height: h, fill: 'transparent', stroke: ACC(), 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke' }, svg);
  const hs = 16 * px;
  for (const [k, x, y] of [['nw', F.x, F.y], ['ne', F.x + F.w, F.y], ['sw', F.x, F.y + h], ['se', F.x + F.w, F.y + h]]) {
    el('rect', { class: `fr-handle ${k}`, 'data-h': k, x: x - hs / 2, y: y - hs / 2, width: hs, height: hs, fill: ACC(), stroke: '#000', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, svg);
  }
  const z = W() / F.w;
  $('zoom').value = z.toFixed(2);
  $('zoomOut').textContent = `${z.toFixed(2)}×`;
  drawPreview();
  facts();
  dirty();
}

// ---------- 右邊：完成影片看起來 ----------
function legend() {
  const chip = ([c, t]) => { const s = document.createElement('span'); s.innerHTML = `<i style="background:${c}"></i>`; s.append(t); return s; };
  const [cx1, cy1, cx2, cy2] = bounds(), bars = cx1 > 0 || cy1 > 0 || cx2 < W() || cy2 < H();
  $('stageLegend').replaceChildren(...[[ACC(), '裁切框（框外會切掉）'], [ORANGE, '講者動作範圍（虛線，不要切到）'], ...(bars ? [['rgba(255,255,255,0.6)', '影片實際範圍（外面是黑邊）']] : [])].map(chip));
  const items = [[ORANGE, '講者動作範圍'], ['rgba(255,255,255,0.8)', '字幕'], ['var(--accent)', '下方字卡']];
  if (!portrait()) items.push(['#3B82F6', '子母畫面小視窗']);
  else items.push([CYAN, '頭頂要在兩條線之間'], [MAGENTA, '下巴不超過這條線']);
  $('legend').replaceChildren(...items.map(chip));
}
function toOut(x, y) { const k = W() / F.w; return [(x - F.x) * k, (y - F.y) * k]; }
function drawPreview() {
  if (!D || !F) return;
  const cv = $('preview'), ctx = cv.getContext('2d'), cw = cv.width, ch = cv.height, v = $('video');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  if (v.videoWidth) {
    const s = Math.min(W() / v.videoWidth, H() / v.videoHeight), ox = (W() - v.videoWidth * s) / 2, oy = (H() - v.videoHeight * s) / 2;
    ctx.filter = lookCss(look.color, 0);   // 調光的近似效果（完成影片會更準）
    ctx.drawImage(v, (F.x - ox) / s, (F.y - oy) / s, F.w / s, hOf(F.w) / s, 0, 0, cw, ch);
    ctx.filter = 'none';
  }
  if (v.videoWidth) {
    const elapsed = performance.now() - lastPreview;
    if (!window.framingImage || elapsed >= 180) {
      clearTimeout(framingImageTimer); framingImageTimer = null;
      lastPreview = performance.now(); window.framingImage = cv.toDataURL('image/jpeg', .8);
      window.dispatchEvent(new Event('framing-preview'));
    } else if (framingImageTimer === null) {
      framingImageTimer = setTimeout(() => { framingImageTimer = null; drawPreview(); }, 181 - elapsed);
    }
  }
  const k = cw / W(), C = D.canvas;
  const rect = (r, style, dash, label, fill) => {
    const [x1, y1, x2, y2] = r.map((n) => n * k);
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x1, y1, x2 - x1, y2 - y1); }
    ctx.setLineDash(dash || []); ctx.strokeStyle = style; ctx.lineWidth = 1.5; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1); ctx.setLineDash([]);
    if (label) { ctx.fillStyle = style; ctx.font = '600 12px "Noto Sans TC", system-ui, sans-serif'; ctx.fillText(label, x1 + 6, y1 + 15); }
  };
  rect(C.caption, 'rgba(255,255,255,0.8)', null, '字幕', 'rgba(0,0,0,0.45)');
  rect(C.card, ACC(), [6, 4], '下方字卡');
  if (!portrait()) { const [x, y, w, h] = C.pip; rect([x, y, x + w, y + h], '#3B82F6', [6, 4], '子母畫面小視窗'); }
  else {
    ctx.fillStyle = CYAN; for (const y of C.headTop) ctx.fillRect(0, y * k - 1, cw, 2);
    ctx.fillStyle = MAGENTA; ctx.fillRect(0, C.chinMax * k - 1, cw, 2);
  }
  const [a, b] = toOut(D.motion[0], D.motion[1]), [c, d] = toOut(D.motion[2], D.motion[3]);
  rect([a, b, c, d], ORANGE, [5, 4]);
}
function tick() { drawPreview(); showTime(); if (!$('video').paused) requestAnimationFrame(tick); }
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function showTime() { const v = $('video'); $('time').textContent = `${mmss(v.currentTime || 0)} / ${mmss(v.duration || 0)}`; if (!drag) $('seek').value = String(v.currentTime || 0); }

// 放大倍率、畫質、手勢、直式的頭頂與下巴：和 qc.mjs framing 的倍率表同一套判斷
function facts() {
  const z = W() / F.w, up = (z * W()) / (D.srcSize[0] || W()), L = D.limits;
  const [m0, m1] = toOut(D.motion[0], D.motion[1]), [m2] = toOut(D.motion[2], D.motion[3]);
  const cut = [m0 < L.edge && '左', m1 < L.edge && '上', m2 > W() - L.edge && '右'].filter(Boolean);
  const rows = [
    ['放大', isFull(F) ? '不放大（原畫面）' : `${z.toFixed(2)} 倍`],
    ['畫質', up > L.upscaleWarn ? '會明顯變糊，框拉大一點' : '清楚', up > L.upscaleWarn],
    ['手勢', cut.length ? `會切到${cut.join('、')}側的手勢（黃色虛線超出框外）` : '都在框裡', cut.length > 0],
  ];
  if (portrait()) {
    const C = D.canvas, chinY = D.chin ?? D.motion[1] + 0.3 * (D.motion[3] - D.motion[1]);
    const head = Math.round(toOut(0, D.motion[1])[1]), chin = Math.round(toOut(0, chinY)[1]);
    rows.push(['頭頂', head < C.headTop[0] ? '太靠上，框往上移' : head > C.headTop[1] ? '太靠下，框往下移' : '在兩條藍線之間', head < C.headTop[0] || head > C.headTop[1]]);
    rows.push(['下巴', chin > C.chinMax ? '太低了，會擋到字卡，框往下移' : `沒超過粉紅線${D.chin == null ? '（用動作範圍估的）' : ''}`, chin > C.chinMax]);
  }
  const sugZ = D.suggestion.zoom;
  rows.push(['建議', `${sugZ.toFixed(2)} 倍${D.suggestion.none ? '（每個倍率都有問題，先選最小的）' : '（不切到手勢、也不會糊）'}`]);
  $('facts').replaceChildren(...rows.map(([k, v, bad]) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="k"></span><span class="v"></span>';
    li.querySelector('.k').textContent = k;
    const vv = li.querySelector('.v');
    vv.textContent = bad ? `⚠ ${v}` : v;
    if (bad != null) vv.className = `v ${bad ? 'bad' : 'ok'}`;
    return li;
  }));
}

// 要不要存：使用者動過才算（打開頁面時框和存檔不一樣，可能只是黑邊換算出來的差別，不寫檔）
const isDirty = () => !!F && !D.plan.error && ((touched && ((!D.plan.exists && !isFull(F)) || !sameFrame(F, saved || fullFrame()) || !sameLook(look, savedLook))) || !!window.designWorkbench?.dirty);
const sigNow = () => JSON.stringify([asArr(F), look, !!window.designWorkbench?.dirty]);
function dirty() {
  if (!F || saving) return;
  const d = isDirty();
  const s = $('saveState');
  if (saveFail) {
    if (d && saveFail.sig === sigNow()) return;   // 沒再改：錯誤訊息留著，不要每秒重送
    saveFail = null;
  }
  s.dataset.state = d ? 'dirty' : 'saved';
  s.querySelector('.txt').textContent = d ? '自動存檔中…' : saved ? '已自動存檔' : '已自動存檔 · 不裁切';
  if (d) scheduleSave();
}
function scheduleSave(delay = AUTOSAVE_MS) { clearTimeout(saveTimer); saveTimer = setTimeout(autosave, delay); }
function autosave() {
  if (!isDirty()) return;
  if (drag || saving || window.designWorkbench?.busy) { scheduleSave(400); return; }
  save();
}
// 切回對話、關分頁：馬上存，不等那一秒
function flushNow() { if (isDirty() && !drag && !saving && !window.designWorkbench?.busy) { clearTimeout(saveTimer); save(); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
window.addEventListener('pagehide', flushNow);
// 存檔用 keepalive：送出去之後才換頁、關頁也會存好，不用問。上一次沒存成功（連不到、被改過）才問；
// 存檔途中又拖了一下：最後那一下還沒送出去（要等這一輪回來才能送），關頁會丟掉，也要問
window.addEventListener('beforeunload', (e) => {
  flushNow();
  const unsent = !!saving && isDirty() && frameSig() !== sentSig;
  if ((saveFail && isDirty()) || unsent) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('design-state', dirty);
window.addEventListener('framing-preview-request', () => { lastPreview = 0; drawPreview(); });

// ---------- 拖曳 ----------
function toCanvas(e) {
  const r = $('overlay').getBoundingClientRect();
  return { x: ((e.clientX - r.left) * W()) / r.width, y: ((e.clientY - r.top) * H()) / r.height };
}
$('overlay').addEventListener('pointerdown', (e) => {
  if (!F) return;
  const p = toCanvas(e), h = hOf(F.w), k = e.target.dataset?.h;
  if (k) drag = { mode: 'resize', ax: k.includes('w') ? F.x + F.w : F.x, ay: k.includes('n') ? F.y + h : F.y, k };
  else if (p.x >= F.x && p.x <= F.x + F.w && p.y >= F.y && p.y <= F.y + h) drag = { mode: 'move', dx: p.x - F.x, dy: p.y - F.y };
  else return;
  touched = true;
  $('overlay').setPointerCapture(e.pointerId);
  $('stage').focus();
  e.preventDefault();
});
$('overlay').addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = toCanvas(e);
  if (drag.mode === 'move') { F = clampFrame({ x: p.x - drag.dx, y: p.y - drag.dy, w: F.w }); render(); return; }
  // 縮放：對角固定，寬取滑鼠到對角的距離（高照比例換算取大的），不超出內容範圍
  const [x1, y1, x2, y2] = bounds(), { ax, ay, k } = drag, r = W() / H();
  let w = Math.max(Math.abs(p.x - ax), Math.abs(p.y - ay) * r);
  w = Math.min(w, k.includes('w') ? ax - x1 : x2 - ax, (k.includes('n') ? ay - y1 : y2 - ay) * r);
  w = clampN(Math.floor(w / STEP()) * STEP(), minW(), maxW());
  F = clampFrame({ x: k.includes('w') ? ax - w : ax, y: k.includes('n') ? ay - hOf(w) : ay, w });
  render();
});
for (const ev of ['pointerup', 'pointercancel']) $('overlay').addEventListener(ev, () => { drag = null; });
$('stage').addEventListener('keydown', (e) => {
  const d = e.shiftKey ? 20 : 4, mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
  if (!mv || !F) return;
  touched = true;
  F = clampFrame({ x: F.x + mv[0], y: F.y + mv[1], w: F.w });
  render();
  e.preventDefault();
});
$('zoom').addEventListener('input', () => {
  const w = Math.round(W() / Number($('zoom').value) / STEP()) * STEP(), cx = F.x + F.w / 2, cy = F.y + hOf(F.w) / 2;
  touched = true;
  F = clampFrame({ x: cx - w / 2, y: cy - hOf(w) / 2, w });
  render();
});
window.addEventListener('resize', () => D && render());

// ---------- 播放 ----------
$('btnPlay').addEventListener('click', () => { const v = $('video'); if (v.paused) v.play(); else v.pause(); });
$('seek').addEventListener('input', () => { $('video').currentTime = Number($('seek').value); });

// ---------- 按鈕與存檔 ----------
$('btnSuggest').addEventListener('click', () => { touched = true; F = clampFrame(fromArr(D.suggestion.frame)); render(); });
$('btnFull').addEventListener('click', () => { touched = true; F = clampFrame({ ...fullFrame(), x: bounds()[0], y: bounds()[1], w: maxW() }); render(); });
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); clearTimeout(saveTimer); if (isDirty() && !saving) save(); } });

function save() {
  saving = saveOnce().finally(() => { saving = null; dirty(); });
  return saving;
}
// 正在存的是哪個框和調光：存檔途中又動了，關頁時才知道最後那一下沒送出去（背景設計有自己的忙碌狀態，不算在這裡）
const frameSig = () => JSON.stringify([asArr(F), look]);
let sentSig = null;
async function saveOnce() {
  const msg = $('msg'), state = $('saveState');
  sentSig = frameSig();
  state.dataset.state = 'busy'; state.querySelector('.txt').textContent = '儲存中…';
  const frame = isFull(F) ? null : asArr(F), lookNow = { ...look };
  let r, j;
  try {
    await window.designWorkbench?.flush();
    const body = { base: { hash: D.plan.hash }, frame, update: false };   // 自動存檔不帶起更新預覽：底片重新編碼很久，等使用者按
    if (window.designWorkbench?.saveId) body.designId = window.designWorkbench.saveId;
    if (!sameLook(look, savedLook)) body.look = { color: r2(look.color), slim: r2(look.slim), ...(look.beauty > 0 ? { beauty: r2(look.beauty) } : {}) };
    const post = () => fetch('/api/framing/save', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    r = await post();
    j = await r.json().catch(() => null);
    // plan.json 剛被改過：通常是剪輯台自動存，構圖只動 frame 和 look，不會蓋掉別的，拿最新的版本號再存一次。
    // 但如果被改的就是框或調光（AI 寫的），不能用舊的蓋回去：換成最新的，講一聲
    if (r.status === 409 && j?.error === 'conflict') {
      const now = await fetch('/api/framing').then((x) => x.json());
      if (JSON.stringify(now.plan.frame ?? null) !== JSON.stringify(D.plan.frame ?? null) || !sameLook(lookOf(now), savedLook)) { adoptRemote(now); return false; }
      body.base = { hash: now.plan.hash };
      r = await post();
      j = await r.json().catch(() => null);
    }
  } catch { j = { message: '連不到剪輯台，這次沒有存。你拖好的框還在，連上後會自動補存。' }; }
  if (!r?.ok) {
    if (j?.error === 'designbusy') { scheduleSave(800); return false; }   // 背景還在處理：等一下再存，不用講
    saveFail = { sig: sigNow() };
    state.dataset.state = 'error';
    if (j?.error === 'exporting') {
      state.dataset.state = 'dirty';
      state.querySelector('.txt').textContent = '輸出完會自動存';
      scheduleSave(5000);
      return false;
    }
    state.querySelector('.txt').textContent = !r ? '連不到剪輯台，修改還留在這一頁' : r.status === 409 ? '被別人改過，這次沒有存' : '沒有存';
    msg.className = 'fr-msg err';
    msg.textContent = `${j?.message || `存檔失敗（HTTP ${r?.status}）`}${r?.status === 409 ? '\n→ 重新整理這一頁拿最新的內容（你剛拖的框要重拖）' : ''}`;
    if (!r) scheduleSave(5000);   // 連回來自動補存
    return false;
  }
  saveFail = null;
  msg.className = 'fr-msg'; msg.textContent = '';
  if (j.design) window.designWorkbench?.accept(j.design);
  if (j.look) D.look = j.look;
  savedLook = lookNow;
  Object.assign(D.plan, { exists: j.plan.exists, hash: j.plan.hash, frame: j.plan.frame, speakerBox: j.plan.speakerBox, decided: true });
  if (j.preview) D.preview = j.preview;
  saved = j.plan.frame ? fromArr(j.plan.frame) : null;
  state.dataset.state = 'saved';
  renderUpdate();
  render();
  renderLook();
  return true;
}

// 框或調光被別人（AI）改過：換成最新的，手上這次沒存的不要了
const lookOf = (d) => { const e = d.look?.look?.effective || d.look?.look?.kit || {}; return { color: r2(e.color || 0), slim: r2(e.slim || 0), beauty: r2(e.beauty || 0) }; };
function adoptRemote(now) {
  Object.assign(D.plan, now.plan);
  D.look = now.look;
  saved = now.plan.frame ? fromArr(now.plan.frame) : null;
  F = clampFrame(saved || fullFrame());
  touched = false;
  saveFail = null;
  initLook();
  const msg = $('msg');
  msg.className = 'fr-msg err';
  msg.textContent = '構圖剛被改過（通常是 AI），這裡已經換成最新的框和調光；你剛才那一下沒有存，要的話再調一次。';
  $('saveState').dataset.state = 'saved';
  render();
}

// 已經有完成影片：新的構圖要更新預覽才看得到。看要不要按，不自動跑（底片重新編碼很久）
function renderUpdate() { $('updateBar').hidden = !(D.preview?.built && D.preview?.stale) || !!previewTimer; }
$('btnUpdate').addEventListener('click', async () => {
  $('btnUpdate').disabled = true;
  if (saving) await saving;
  if (isDirty() && !(await save())) { $('btnUpdate').disabled = false; return; }
  const msg = $('msg');
  let r, j;
  try {
    r = await fetch('/api/framing/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    j = await r.json().catch(() => null);
  } catch { j = { message: '連不到剪輯台，預覽沒有更新' }; }
  $('btnUpdate').disabled = false;
  if (!r?.ok) { msg.className = 'fr-msg err'; msg.textContent = j?.message || `沒有開始更新（HTTP ${r?.status}）`; return; }
  msg.className = 'fr-msg'; msg.textContent = '正在更新預覽，好了會直接套用，可以離開這一頁。';
  const wait = document.createElement('span');
  wait.id = 'previewWait';
  msg.append('\n', wait);
  watchPreview();
  renderUpdate();
});

let previewTimer = null;
function watchPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/version'), j = await r.json();
      const update = j.framingUpdate;
      if (!r.ok || !update) throw new Error('讀不到預覽更新狀態');
      if (update.running) {
        const b = j.build || {}, sec = Math.round(b.seconds || 0), wait = sec < 60 ? `${sec} 秒` : `${Math.floor(sec / 60)} 分鐘`;
        $('previewWait').textContent = `已經 ${wait}${b.slowSeconds ? `，上次花 ${Math.ceil(b.slowSeconds / 60)} 分鐘` : '，長片要十幾分鐘'}`;
        watchPreview();
        return;
      }
      previewTimer = null;
      D.preview = { built: j.built, stale: j.stale };   // 更新途中又拖了框的話，還是舊的，按鈕要留著
      renderUpdate();
      $('msg').className = update.ok ? 'fr-msg' : 'fr-msg err';
      $('msg').textContent = update.ok ? '預覽更新好了。' : `構圖存好了，但${update.message || '預覽更新失敗，請在剪輯台按「更新預覽」查看訊息'}`;
    } catch {
      previewTimer = null;
      $('msg').className = 'fr-msg err';
      $('msg').textContent = '構圖存好了，但讀不到預覽更新狀態：連不到剪輯台。請 AI 重新啟動後回剪輯台查看。';
    }
  }, 1000);
}

// ---------- 講者調光、瘦臉 ----------
function initLook() {
  const L = D.look?.look || {};
  const eff = L.effective || L.kit || { color: 0, slim: 0, beauty: 0 };
  look = { color: r2(eff.color || 0), slim: r2(eff.slim || 0), beauty: r2(eff.beauty || 0) };
  savedLook = { ...look };
  const lim = L.limits || { color: [0, 1], slim: [0, 1.2], beauty: [0, 1], step: 0.05 };
  for (const k of ['color', 'slim', 'beauty']) { $(k).max = String(lim[k][1]); $(k).step = String(lim.step); }
  renderLook();
  if (D.look?.running) startPoll();
}
const lookOut = (k, v) => (v > 0 ? v.toFixed(2) : '關');
function renderLook() {
  for (const k of ['color', 'slim', 'beauty']) { $(k).value = String(look[k]); $(`${k}On`).checked = look[k] > 0; $(`${k}Out`).textContent = lookOut(k, look[k]); }
  const S = D.look || {}, lm = S.look?.landmarks || {};
  const skip = { small: `畫面裡的臉太小（臉寬約 ${Math.round(lm.medianFaceWidth || 0)} px），瘦臉看不出來，完成影片只調光。`, noface: '抽樣都沒偵測到臉，這支只調光。', rate: `只有 ${Math.round((lm.rate || 0) * 100)}% 的格偵測到臉，自動關掉瘦臉，完成影片只調光。` };
  let note = '要開就勾選。調光拖滑桿，上面的畫面馬上變（近似效果，完成影片會更準）。';
  const on = [look.color > 0 && '調光', look.slim > 0 && '瘦臉', look.beauty > 0 && '美顏'].filter(Boolean);
  $('lookSummary').textContent = `講者調光、瘦臉、美顏：${on.length ? on.join('、') : '都關'}`;
  const needDetect = faceOn(look) && !lm.ready;
  if (S.running) note = `正在${S.line}（在背景跑，可以繼續拖框；好了下面會出現前後對照）`;
  else if (needDetect) note = `瘦臉、美顏要先偵測整支影片的臉，長片要二、三十分鐘（在背景跑）。${S.phase === 'failed' ? `${S.line}。` : ''}`;
  else if (faceOn(look) && lm.slimOk === false) note = skip[lm.reason] || '這支略過瘦臉，完成影片只調光。';
  else if (faceOn(look)) note = '下面是播放頭那一格的臉，左邊原本、右邊套用瘦臉、美顏後；換一格看就移動播放頭。';
  $('lookNote').textContent = note;
  $('btnDetect').hidden = !needDetect || !!S.running;
  const showFaces = faceOn(look) && lm.ready && lm.slimOk !== false;
  $('faces').hidden = !showFaces;
  if (showFaces) refreshFaces(0);
  drawPreview();
  dirty();
}
function refreshFaces(delay = 300) {
  clearTimeout(faceTimer);
  faceTimer = setTimeout(() => {
    if ($('faces').hidden) return;
    const t = Math.round(($('video').currentTime || 0) * 1000) / 1000, box = $('faces');
    for (const img of box.querySelectorAll('img')) {
      const after = img.dataset.k === 'after', url = `/api/look/face?t=${t}&slim=${after ? r2(look.slim) : 0}&beauty=${after ? r2(look.beauty) : 0}`;
      img.style.filter = lookCss(look.color, 0);
      if (img.dataset.url === url) continue;
      img.dataset.url = url;
      const fig = img.closest('figure');
      fetch(url).then(async (r) => {
        if (r.ok) { const u = URL.createObjectURL(await r.blob()); if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src); img.src = u; fig.classList.add('ok'); box.querySelector('.look-msg').textContent = ''; }
        else { const j = await r.json().catch(() => ({})); fig.classList.remove('ok'); box.querySelector('.look-msg').textContent = j.message || '這一格看不到臉，移動播放頭換一格'; }
      }).catch(() => fig.classList.remove('ok'));
    }
  }, delay);
}
function setLook(k, v) { touched = true; look = { ...look, [k]: r2(v) }; renderLook(); }
for (const k of ['color', 'slim', 'beauty']) {
  $(k).addEventListener('input', () => setLook(k, Number($(k).value)));
  $(`${k}On`).addEventListener('change', () => {
    if ($(`${k}On`).checked) setLook(k, lookPrev[k] || (k === 'color' ? 0.8 : k === 'slim' ? 0.6 : 0.5));
    else { lookPrev[k] = look[k]; setLook(k, 0); }
  });
}
function startPoll() {
  clearInterval(poll);
  poll = setInterval(async () => {
    const j = await fetch('/api/look/status').then((r) => r.json()).catch(() => null);
    if (!j) return;
    D.look = j;
    if (!j.running) clearInterval(poll);
    renderLook();
  }, 2000);
}
$('btnDetect').addEventListener('click', async () => {
  $('btnDetect').disabled = true;
  if (saving) await saving;
  if (isDirty() && !(await save())) { $('btnDetect').disabled = false; return; }
  const r = await fetch('/api/look/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const j = await r.json().catch(() => ({}));
  $('btnDetect').disabled = false;
  if (!r.ok) { $('msg').className = 'fr-msg err'; $('msg').textContent = j.message || `沒有開始偵測（HTTP ${r.status}）`; return; }
  D.look = j;
  renderLook();
  startPoll();
});

// ---------- 預覽參考圖 ----------
function refNote(t) {
  const R = D.ref || {};
  $('refNote').textContent = R.exists
    ? `已設${t != null ? `（${mmss(t)} 那一格）` : ''}：情境庫、風格預覽頁的講者用這張。換一格再按一次就更新。`
    : '還沒設：情境庫、風格預覽頁的講者是示範人物。選一格你自己的畫面（裁切、調光後的樣子）存起來，之後挑動畫和風格看到的就是你。';
}
async function captureReference() {
  $('btnRef').disabled = true;
  const t = $('video').currentTime || 0;
  try {
    const r = await fetch('/api/refframe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t, frame: isFull(F) ? null : asArr(F), color: r2(look.color) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `預覽參考圖沒有存（HTTP ${r.status}）`);
    D.ref = j.ref;
    refNote(t);
    return true;
  } catch (e) {
    $('msg').className = 'fr-msg err';
    $('msg').textContent = e.message;
    return false;
  } finally { $('btnRef').disabled = false; }
}
$('btnRef').addEventListener('click', captureReference);

load().catch((e) => { $('loading').textContent = `構圖載入失敗：${e.message}`; });
$('designWrap').addEventListener('toggle', () => { if ($('designWrap').open) { lastPreview = 0; drawPreview(); } });

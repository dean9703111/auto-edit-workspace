// 構圖台：在沒裁切的 work/rough.mp4 上拖一個鎖定比例（橫式 16:9、直式 9:16）的框，存成 plan.json 的 frame（畫布座標）。
// 框裡直接畫成片的字幕、下方字卡、子母畫面小窗的位置（直式畫頭頂範圍與下巴上限），不另外開一個預覽。
// 分析（講者動作範圍、黑邊、建議的框）來自 GET /api/framing（qc.mjs framing 同一套）；存檔走 POST /api/save { base, frame, look }。
// 右欄最上面決定講者調光、瘦臉、美顏（plan.json 的 look）：調光是影片上的 CSS 濾鏡（近似）；瘦臉、美顏在暫停時
// 把那一格算好的臉（GET /api/look/face?size=auto，X-Face-Box＝臉在原畫面的位置）疊回影片上；還沒偵測臉就 POST /api/look/run。
// 「用這一格當預覽參考圖」：POST /api/refframe → shared/template/preview/speaker-local.jpg（情境庫、風格預覽頁的講者改用它）。
import { lookCss } from './model.mjs';
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const ORANGE = '#FF8C00', CYAN = '#00E5FF', MAGENTA = '#FF40C8', GREEN = '#4ADE80';   // 下方字卡用綠色：主色常是橘色，和講者動作範圍分不開
const ACC = () => getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#FFD400';

// ?embed=1：在影片編輯器的對話框裡打開；?t=秒：從那一秒開始看（影片編輯器目前的位置）
const Q = new URLSearchParams(location.search), EMBED = Q.has('embed'), START_T = Number.isFinite(parseFloat(Q.get('t'))) ? Math.max(0, parseFloat(Q.get('t'))) : null;
let D = null;        // /api/framing 的回應
let F = null;        // 目前的框 { x, y, w }（h 由比例算）
let saved = null;    // plan.json 現在的 frame（null＝不裁切）
let drag = null;
let look = { color: 0, slim: 0, beauty: 0 }, savedLook = { color: 0, slim: 0, beauty: 0 }, lookPrev = {}, poll = null, faceTimer = null, faceSeq = 0, faceKey = null;
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
  F = clampFrame(saved || fromArr(D.suggestion.frame));
  $('projName').textContent = `${D.project.name}｜${portrait() ? '直式 9:16' : '橫式 16:9'}（${W()}×${H()}）`;
  $('stage').classList.toggle('portrait', portrait());
  $('stage').style.aspectRatio = `${W()} / ${H()}`;
  $('overlay').setAttribute('viewBox', `0 0 ${W()} ${H()}`);
  $('zoom').min = (W() / maxW()).toFixed(2);
  $('zoom').max = (W() / minW()).toFixed(2);
  const v = $('video');
  v.src = D.video.url;
  v.addEventListener('loadedmetadata', () => { $('seek').max = String(v.duration || 1); v.currentTime = START_T != null ? Math.min(START_T, v.duration || START_T) : Math.min(v.duration / 2, 30); });
  for (const ev of ['loadeddata', 'seeked', 'timeupdate']) v.addEventListener(ev, showTime);
  v.addEventListener('play', () => { $('btnPlay').textContent = '❚❚'; hidePatch(); tick(); });
  v.addEventListener('pause', () => { $('btnPlay').textContent = '▶'; });
  v.addEventListener('seeking', hidePatch);
  for (const ev of ['seeked', 'pause', 'loadeddata']) v.addEventListener(ev, () => refreshPatch());
  initLook();
  refNote();
  legend();
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
  guides(svg, px);
  el('rect', { class: 'fr-box', x: F.x, y: F.y, width: F.w, height: h, fill: 'transparent', stroke: ACC(), 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke' }, svg);
  const hs = 16 * px;
  for (const [k, x, y] of [['nw', F.x, F.y], ['ne', F.x + F.w, F.y], ['sw', F.x, F.y + h], ['se', F.x + F.w, F.y + h]]) {
    el('rect', { class: `fr-handle ${k}`, 'data-h': k, x: x - hs / 2, y: y - hs / 2, width: hs, height: hs, fill: ACC(), stroke: '#000', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, svg);
  }
  const z = W() / F.w;
  $('zoom').value = z.toFixed(2);
  $('zoomOut').textContent = `${z.toFixed(2)}×`;
  facts();
  dirty();
}

// ---------- 框裡：成片的字幕、字卡、小窗位置 ----------
function legend() {
  const items = [[ORANGE, '講者動作範圍'], ['rgba(255,255,255,0.8)', '字幕'], [GREEN, '下方字卡']];
  if (!portrait()) items.push(['#3B82F6', '子母畫面小窗']);
  else items.push([CYAN, '頭頂要在兩條線之間'], [MAGENTA, '下巴不超過這條線']);
  const tg = document.createElement('label');
  tg.innerHTML = '<input type="checkbox" id="guides" checked>顯示位置';
  tg.querySelector('input').addEventListener('change', render);
  $('legend').replaceChildren(tg, ...items.map(([c, t]) => { const s = document.createElement('span'); s.innerHTML = `<i style="background:${c}"></i>`; s.append(t); return s; }));
}
function toOut(x, y) { const k = W() / F.w; return [(x - F.x) * k, (y - F.y) * k]; }
// 成片畫布座標 → 這個畫面（框）裡的座標
function guides(svg, px) {
  if (!$('guides')?.checked) return;
  const k = F.w / W(), C = D.canvas, at = (x, y) => [F.x + x * k, F.y + y * k];
  const box = ([x1, y1, x2, y2], stroke, label, { dash = '', fill = 'none' } = {}) => {
    const [a, b] = at(x1, y1), [c, d] = at(x2, y2);
    el('rect', { x: a, y: b, width: c - a, height: d - b, fill, stroke, 'stroke-width': 1.5, 'stroke-dasharray': dash, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }, svg);
    if (label) el('text', { x: a + 6 * px, y: b + 15 * px, fill: stroke, 'font-size': 12 * px }, svg).textContent = label;
  };
  box(C.caption, 'rgba(255,255,255,0.85)', '字幕', { fill: 'rgba(0,0,0,0.35)' });
  box(C.card, GREEN, '下方字卡', { dash: '6 4' });
  if (!portrait()) { const [x, y, w, h] = C.pip; box([x, y, x + w, y + h], '#3B82F6', '子母畫面小窗', { dash: '6 4' }); return; }
  const hl = (y, stroke) => { const [a, b] = at(0, y), [c] = at(W(), y); el('line', { x1: a, y1: b, x2: c, y2: b, stroke, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }, svg); };
  for (const y of C.headTop) hl(y, CYAN);
  hl(C.chinMax, MAGENTA);
}
function tick() { showTime(); if (!$('video').paused) requestAnimationFrame(tick); }
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function showTime() { const v = $('video'); $('time').textContent = `${mmss(v.currentTime || 0)} / ${mmss(v.duration || 0)}`; if (!drag) $('seek').value = String(v.currentTime || 0); }

// 放大倍率、畫質、手勢、直式的頭頂與下巴：和 qc.mjs framing 的倍率表同一套判斷
function facts() {
  const z = W() / F.w, up = (z * W()) / (D.srcSize[0] || W()), L = D.limits;
  const [m0, m1] = toOut(D.motion[0], D.motion[1]), [m2] = toOut(D.motion[2], D.motion[3]);
  const cut = [m0 < L.edge && '左', m1 < L.edge && '上', m2 > W() - L.edge && '右'].filter(Boolean);
  const rows = [
    ['放大', `${z.toFixed(2)} 倍（框 ${F.w}×${hOf(F.w)}，在 ${W()}×${H()} 畫面上的 x ${Math.round(F.x)}、y ${Math.round(F.y)}）`],
    ['畫質', D.srcSize[0] < W() || z > 1 ? `來源每個像素放大 ${up.toFixed(2)} 倍${up > L.upscaleWarn ? `，超過 ${L.upscaleWarn} 倍會明顯變糊` : ''}` : '原尺寸，不放大', up > L.upscaleWarn],
    ['手勢', cut.length ? `會切到${cut.join('、')}側的手勢（橘框超出畫面）` : '講者動作範圍都在框裡', cut.length > 0],
  ];
  if (portrait()) {
    const C = D.canvas, chinY = D.chin ?? D.motion[1] + 0.3 * (D.motion[3] - D.motion[1]);
    const head = Math.round(toOut(0, D.motion[1])[1]), chin = Math.round(toOut(0, chinY)[1]);
    rows.push(['頭頂', `y ${head}（要在 ${C.headTop[0]}–${C.headTop[1]}）`, head < C.headTop[0] || head > C.headTop[1]]);
    rows.push(['下巴', `y ${chin}（要 ≤ ${C.chinMax}${D.chin == null ? '，用動作範圍估的' : ''}）`, chin > C.chinMax]);
  }
  const sugZ = D.suggestion.zoom;
  rows.push(['建議', `${sugZ.toFixed(2)} 倍${D.suggestion.none ? '（每個倍率都有問題，先選最小的）' : '（不切到手勢、不會太糊的倍率裡最大的）'}`]);
  $('facts').replaceChildren(...rows.map(([k, v, bad]) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="k"></span><span class="v"></span>';
    li.querySelector('.k').textContent = k;
    const vv = li.querySelector('.v');
    vv.textContent = bad ? `⚠ ${v}` : v;
    if (bad != null) vv.className = `v ${bad ? 'bad' : 'ok'}`;
    return li;
  }));
  $('note').textContent = D.plan.speakerBox
    ? '已經量過講者框：存檔時 speakerBox 會跟著新的框換算，不用重量。存好後影片編輯器的即時預覽馬上套用新的框，成片在背景重新產生。'
    : '存好後跟 AI 說「調好了」；不想調就說「用建議的」。';
}

function dirty() {
  const d = !sameFrame(F, saved || fullFrame()) || !sameLook(look, savedLook);
  const s = $('saveState');
  s.dataset.state = d ? 'dirty' : 'saved';
  s.querySelector('.txt').textContent = d ? (D.plan.exists || saved ? '還沒存' : '還沒存（plan.json 會新建）') : saved ? '已存' : '不裁切（plan.json 沒寫 frame）';
  $('btnSave').disabled = !d;
}

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
  F = clampFrame({ x: F.x + mv[0], y: F.y + mv[1], w: F.w });
  render();
  e.preventDefault();
});
$('zoom').addEventListener('input', () => {
  const w = Math.round(W() / Number($('zoom').value) / STEP()) * STEP(), cx = F.x + F.w / 2, cy = F.y + hOf(F.w) / 2;
  F = clampFrame({ x: cx - w / 2, y: cy - hOf(w) / 2, w });
  render();
});
window.addEventListener('resize', () => D && render());

// ---------- 播放 ----------
$('btnPlay').addEventListener('click', () => { const v = $('video'); if (v.paused) v.play(); else v.pause(); });
$('seek').addEventListener('input', () => { $('video').currentTime = Number($('seek').value); });

// ---------- 按鈕與存檔 ----------
$('btnSuggest').addEventListener('click', () => { F = clampFrame(fromArr(D.suggestion.frame)); render(); });
$('btnFull').addEventListener('click', () => { F = clampFrame({ ...fullFrame(), x: bounds()[0], y: bounds()[1], w: maxW() }); render(); });
$('btnSaved').addEventListener('click', () => { F = clampFrame(saved || fullFrame()); render(); });
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!$('btnSave').disabled) save({ back: true }); } });
$('btnSave').addEventListener('click', () => save({ back: true }));

// ---------- 在影片編輯器裡打開（/framing?embed=1）：存好就回去，關閉前提醒沒存的調整 ----------
if (EMBED) {
  $('btnBack').hidden = true;
  $('btnClose').hidden = false;
  $('btnSave').textContent = '儲存並回去';
  $('btnClose').addEventListener('click', requestClose);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); requestClose(); } });
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.source === parent && e.data?.type === 'framing-close-request') requestClose(); });
}
let closeArmed = null;
function requestClose() {
  const b = $('btnClose');
  if (!$('btnSave').disabled && !closeArmed) {
    b.textContent = '還沒存，再按一次放棄';
    b.classList.add('danger');
    closeArmed = setTimeout(() => { closeArmed = null; b.textContent = '關閉'; b.classList.remove('danger'); }, 4000);
    return;
  }
  parent.postMessage({ type: 'framing-close' }, location.origin);
}

async function save({ back = false } = {}) {
  $('btnSave').disabled = true;
  const msg = $('msg');
  msg.className = 'fr-msg'; msg.textContent = '儲存中…';
  const frame = isFull(F) ? null : asArr(F);
  let r, j;
  try {
    const body = { base: { hash: D.plan.hash }, frame };
    if (!sameLook(look, savedLook)) body.look = { color: r2(look.color), slim: r2(look.slim), ...(look.beauty > 0 ? { beauty: r2(look.beauty) } : {}) };
    r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    j = await r.json().catch(() => null);
  } catch (e) { j = { message: `連不到影片編輯器：${e.message}` }; }
  if (!r?.ok) {
    $('saveState').dataset.state = 'error';
    $('saveState').querySelector('.txt').textContent = r?.status === 409 ? 'plan.json 被改過' : '沒有存';
    msg.className = 'fr-msg err';
    msg.textContent = `${j?.message || `存檔失敗（HTTP ${r?.status}）`}${r?.status === 409 ? '\n→ 重新整理這一頁拿最新的 plan.json，再存一次' : ''}`;
    $('btnSave').disabled = false;
    return false;
  }
  const lookChanged = !sameLook(look, savedLook);
  if (j.look) D.look = j.look;
  savedLook = { ...look };
  Object.assign(D.plan, { exists: j.plan.exists, hash: j.plan.hash, frame: j.plan.frame, speakerBox: j.plan.speakerBox });
  saved = j.plan.frame ? fromArr(j.plan.frame) : null;
  if (j.rebuild) j.notes = [...(j.notes || []), '影片編輯器的即時預覽已經套用新的框；成片在背景重新產生，好了會自動換上（不用按「重新產生」）。'];
  msg.textContent = [j.wrote?.plan ? `已存進 plan.json：${frame ? `"frame": [${frame.join(', ')}]` : '不裁切（拿掉 frame）'}${lookChanged ? `、"look": { "color": ${r2(look.color)}, "slim": ${r2(look.slim)}${look.beauty > 0 ? `, "beauty": ${r2(look.beauty)}` : ''} }` : ''}` : '沒有變，不用存', ...(j.notes || [])].join('\n');
  render();
  renderLook();
  if (EMBED && back) parent.postMessage({ type: 'framing-saved', rebuild: !!j.rebuild }, location.origin);
  return true;
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
const lookOut = (k, v) => (v > 0 ? (k === 'color' ? `${v.toFixed(2)}（剪映 ${Math.round(v * 100)}）` : v.toFixed(2)) : '關');
const faceReady = () => { const lm = D.look?.look?.landmarks || {}; return faceOn(look) && lm.ready && lm.slimOk !== false; };
function renderLook() {
  for (const k of ['color', 'slim', 'beauty']) { $(k).value = String(look[k]); $(`${k}On`).checked = look[k] > 0; $(`${k}Out`).textContent = lookOut(k, look[k]); }
  const S = D.look || {}, lm = S.look?.landmarks || {};
  const skip = { small: `畫面裡的臉太小（臉寬約 ${Math.round(lm.medianFaceWidth || 0)} px），瘦臉看不出來，成片只調光。`, noface: '抽樣都沒偵測到臉，這支只調光。', rate: `只有 ${Math.round((lm.rate || 0) * 100)}% 的格偵測到臉，自動關掉瘦臉，成片只調光。` };
  let note = '要開就勾選，左邊畫面馬上套用（調光是近似效果，成片照 LUT 更準）。';
  const needDetect = faceOn(look) && !lm.ready;
  if (S.running) note = `正在${S.line}（在背景跑，可以繼續拖框；好了暫停時左邊的臉就是瘦臉、美顏後的樣子）`;
  else if (needDetect) note = `瘦臉、美顏要先偵測整支影片的臉，長片要十幾分鐘（在背景跑）。${S.phase === 'failed' ? `${S.line}。` : ''}`;
  else if (faceOn(look) && lm.slimOk === false) note = skip[lm.reason] || '這支略過瘦臉，成片只調光。';
  else if (faceOn(look)) note = '暫停時左邊畫面的臉就是瘦臉、美顏後的樣子（播放時只看得到調光）；按住「看原本」對照。存檔後影片編輯器會自動重新產生、套進成片（改了瘦臉、美顏要先套用，長片要幾分鐘）。';
  $('lookNote').textContent = note;
  $('btnDetect').hidden = !needDetect || !!S.running;
  $('btnOrig').hidden = !(look.color > 0 || faceReady());
  $('pic').style.filter = lookCss(look.color, 0);   // 調光的近似效果（臉的疊圖也在這一層，一起套）
  refreshPatch();
  dirty();
}
// 瘦臉、美顏：暫停時請伺服器算這一格的臉，疊回影片上同一個位置（邊緣淡出）；播放、換格就先拿掉
function hidePatch() { faceSeq++; clearTimeout(faceTimer); $('facePatch').hidden = true; faceKey = null; }
function refreshPatch(delay = 250) {
  const v = $('video');
  if (!faceReady() || !v.paused || v.seeking || !v.videoWidth) { hidePatch(); $('faceMsg').textContent = ''; return; }
  const t = Math.round((v.currentTime || 0) * 1000) / 1000, key = `${t}|${r2(look.slim)}|${r2(look.beauty)}`;
  if (key === faceKey) return;
  clearTimeout(faceTimer);
  const seq = ++faceSeq;
  faceTimer = setTimeout(async () => {
    const r = await fetch(`/api/look/face?t=${t}&slim=${r2(look.slim)}&beauty=${r2(look.beauty)}&size=auto`).catch(() => null);
    if (seq !== faceSeq) return;   // 之後又換了格或強度
    if (!r?.ok) {
      $('facePatch').hidden = true; faceKey = null;
      const j = r ? await r.json().catch(() => ({})) : {};
      $('faceMsg').textContent = j.message || '這一格看不到臉，換一格看';
      return;
    }
    const box = (r.headers.get('X-Face-Box') || '').split(',').map(Number), blob = await r.blob();
    if (seq !== faceSeq || box.length !== 3) return;
    const img = $('facePatch'), s = Math.min(W() / v.videoWidth, H() / v.videoHeight), ox = (W() - v.videoWidth * s) / 2, oy = (H() - v.videoHeight * s) / 2;
    Object.assign(img.style, { left: `${((ox + box[0] * s) / W()) * 100}%`, top: `${((oy + box[1] * s) / H()) * 100}%`, width: `${((box[2] * s) / W()) * 100}%`, height: `${((box[2] * s) / H()) * 100}%` });
    if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob);
    img.hidden = false; faceKey = key;
    $('faceMsg').textContent = '';
  }, delay);
}
const holdOrig = (on) => $('pic').classList.toggle('orig', on);
$('btnOrig').addEventListener('pointerdown', (e) => { holdOrig(true); $('btnOrig').setPointerCapture(e.pointerId); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) $('btnOrig').addEventListener(ev, () => holdOrig(false));
$('btnOrig').addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); holdOrig(true); } });
$('btnOrig').addEventListener('keyup', () => holdOrig(false));
function setLook(k, v) { look = { ...look, [k]: r2(v) }; renderLook(); }
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
  if (!$('btnSave').disabled && !(await save())) { $('btnDetect').disabled = false; return; }
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
$('btnRef').addEventListener('click', async () => {
  $('btnRef').disabled = true;
  const t = $('video').currentTime || 0;
  const r = await fetch('/api/refframe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t, frame: isFull(F) ? null : asArr(F), color: r2(look.color) }) });
  const j = await r.json().catch(() => ({}));
  $('btnRef').disabled = false;
  if (!r.ok) { $('msg').className = 'fr-msg err'; $('msg').textContent = j.message || `預覽參考圖沒有存（HTTP ${r.status}）`; return; }
  D.ref = j.ref;
  refNote(t);
});

load().catch((e) => { $('loading').textContent = `構圖台載入失敗：${e.message}`; });

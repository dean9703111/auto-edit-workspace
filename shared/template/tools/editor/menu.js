// 自己畫的選單（050）：時間軸的右鍵、鍵盤的 Shift＋F10／選單鍵、屬性面板的「換一顆音效…」都用這一支。
// 這裡只管長相、位置、鍵盤和什麼時候關；每一項做什麼由呼叫端給（app.js 的 ctxMenu），那邊每一項都是呼叫現有的動作。
//
//   openMenu({ x, y, items, head, focus, blocked })
//     x、y＝視窗座標（選單左上角對著它；放不下就往左、往上挪，不超出視窗）
//     focus＝用鍵盤開的：焦點放在第一項，關掉後回到原本有焦點的地方（滑鼠開的關掉後不留焦點，空白鍵照舊是播放）
//     blocked(原因)＝點了、按了灰掉的項目（呼叫端跳提示）
//   closeMenu()
//   項目：{ label, key?（右邊顯示的快捷鍵）, hint?（右邊的小字）, check?（true 打勾；有寫就是可以勾的項目）, off?（不能用的原因：有就灰掉，滑過去看得到）,
//           danger?, run?（執行；先關選單再跑）, sub?（子選單的項目，只有一層）, play?（▶ 或空白鍵試聽，不關選單） }
//         { sep: true }＝分隔線；{ group: '…' }＝一小行標題；{ note: '…' }＝一行說明（不能選）
// 鍵盤：↑ ↓ 選（Home／End 到頭尾）、Enter 執行、→ 開子選單、← 回上一層、Esc 關（子選單開著先關子選單）、Tab 關；
//       選單開著時按鍵不往外傳（剪輯台的空白鍵播放、Delete 刪除才不會跟著動）
// 關：Esc、點外面、在選單外面滾滑鼠、視窗失焦、視窗大小變了

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GAP = 6;   // 離視窗邊緣至少留這麼多

let root = null, sub = null;
let st = null;   // 開著時：{ items, back（關掉後焦點回到哪）, blocked, subAt（子選單是哪一項開的；-1＝沒開） }

function panel(id) {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'ctx-menu';
  el.setAttribute('role', 'menu');
  el.tabIndex = -1;   // 滑鼠開的時候焦點放在選單本身：方向鍵馬上能用，又不會先亮起第一項
  el.hidden = true;
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKey);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('contextmenu', (e) => e.preventDefault());   // 在選單上按右鍵不跳瀏覽器的選單
  document.body.append(el);
  return el;
}
function html(items, head) {
  return `${head ? `<div class="ctx-head" aria-hidden="true">${esc(head)}</div>` : ''}${items.map((it, i) => {
    if (it.sep) return '<div class="ctx-sep" role="separator"></div>';
    if (it.group) return `<div class="ctx-head" aria-hidden="true">${esc(it.group)}</div>`;
    if (it.note) return `<div class="ctx-note">${esc(it.note)}</div>`;
    const off = it.off ? ` aria-disabled="true" data-why="${esc(it.off)}"` : '';
    const role = it.check != null ? `role="menuitemcheckbox" aria-checked="${!!it.check}"` : 'role="menuitem"';
    return `<div class="ctx-item${it.off ? ' is-disabled' : ''}${it.danger ? ' danger' : ''}" ${role} tabindex="-1" data-i="${i}"${off}${it.sub ? ' aria-haspopup="menu" aria-expanded="false"' : ''}>`
      + `<span class="ck" aria-hidden="true">${it.check ? '✓' : ''}</span><span class="lb">${esc(it.label)}</span>`
      + `${it.hint ? `<span class="hint">${esc(it.hint)}</span>` : ''}${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}`
      // 試聽不是 <button>：按下去焦點留在這一項上（按鈕會把焦點搶走，鍵盤就不歸選單了）
      + `${it.play ? `<span class="ctx-play" role="button" data-play aria-label="試聽 ${esc(it.label)}" data-tip="先聽聽看（空白鍵）">▶</span>` : ''}`
      + `${it.sub ? '<span class="arr" aria-hidden="true">▸</span>' : ''}</div>`;
  }).join('')}`;
}
// 放在 (x, y)；放不下就往左、往上挪。alt＝子選單右邊放不下時改放的 x（母選單那一項的左邊）
function place(el, x, y, alt = null) {
  el.style.left = '0px'; el.style.top = '0px';
  el.hidden = false;
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = x;
  if (left + w > innerWidth - GAP) left = alt != null ? alt - w : innerWidth - GAP - w;
  el.style.left = `${Math.max(GAP, left)}px`;
  el.style.top = `${Math.max(GAP, Math.min(y, innerHeight - GAP - h))}px`;
}
// 用鍵盤在選的時候，選到的那一項多一圈焦點框；用滑鼠的時候只有底色（滑過去不用框）
const byKeys = (on) => { root.classList.toggle('kbd', on); sub.classList.toggle('kbd', on); };
const itemsOf = (el) => [...el.querySelectorAll('.ctx-item')];
const listOf = (el) => (el === sub ? st.items[st.subAt]?.sub || [] : st.items);
const focusItem = (el, i) => { const all = itemsOf(el); all[Math.max(0, Math.min(all.length - 1, i))]?.focus({ preventScroll: false }); };

function openSub(row, { focus = false } = {}) {
  const i = Number(row.dataset.i), it = st.items[i];
  if (!it?.sub || it.off) return;
  if (st.subAt !== i) {
    closeSub();
    st.subAt = i;
    sub.innerHTML = html(it.sub, null);
    row.setAttribute('aria-expanded', 'true');
    const r = row.getBoundingClientRect();
    place(sub, r.right - 4, r.top - 7, r.left + 4);
  }
  if (focus) (sub.querySelector('.ctx-item[aria-checked="true"]') || sub.querySelector('.ctx-item'))?.focus();
}
function closeSub({ focus = false } = {}) {
  if (!st || st.subAt < 0) return;
  const row = root.querySelector(`.ctx-item[data-i="${st.subAt}"]`);
  row?.setAttribute('aria-expanded', 'false');
  st.subAt = -1;
  sub.hidden = true;
  if (focus) row?.focus();
}

export function closeMenu() {
  if (!st) return;
  const held = root.contains(document.activeElement) || sub.contains(document.activeElement);
  const back = st.back;
  clearTimeout(subTimer);
  st = null;
  root.hidden = true; sub.hidden = true;
  if (!held) return;
  if (back?.isConnected) back.focus(); else document.activeElement.blur();
}
export function openMenu({ x, y, items, head = '', focus = false, blocked = null }) {
  if (!root) { root = panel('ctxMenu'); sub = panel('ctxSub'); }
  closeMenu();
  if (!items?.length) return;
  const a = document.activeElement;
  st = { items, blocked, subAt: -1, back: focus && a && a !== document.body ? a : null };
  root.innerHTML = html(items, head);
  place(root, x, y);
  byKeys(focus);
  if (focus) (root.querySelector('.ctx-item:not(.is-disabled)') || root.querySelector('.ctx-item') || root).focus();
  else root.focus({ preventScroll: true });
}

function run(el, row, { play = false } = {}) {
  const it = listOf(el)[Number(row.dataset.i)];
  if (!it) return;
  if (it.off) { st.blocked?.(it.off); return; }
  if (play && it.play) { it.play(); return; }
  if (it.sub) { openSub(row, { focus: true }); return; }
  closeMenu();
  it.run?.();
}
function onClick(e) {
  const row = e.target.closest('.ctx-item');
  if (!row || !st) return;
  run(e.currentTarget, row, { play: !!e.target.closest('[data-play]') });
}
// 滑鼠移到哪一項，哪一項就亮（＝有焦點，和鍵盤同一個樣子）；移到有子選單的那一項就展開。
// 移到母選單的別項不馬上收：從那一項斜著移到子選單會經過別項，等一下還在母選單上才收
let subTimer = null;
function onMove(e) {
  if (!st) return;
  if (e.currentTarget === sub) clearTimeout(subTimer);   // 已經移進子選單（就算停在邊上）：不收
  const row = e.target.closest('.ctx-item');
  if (!row || document.activeElement === row) return;
  byKeys(false);
  row.focus({ preventScroll: true });
  clearTimeout(subTimer);
  if (e.currentTarget !== root) return;
  if (row.hasAttribute('aria-haspopup')) openSub(row);
  else if (st.subAt >= 0) subTimer = setTimeout(() => { if (st && root.contains(document.activeElement)) closeSub(); }, 280);
}
function onKey(e) {
  if (!st || e.metaKey || e.ctrlKey || e.altKey) return;
  e.stopPropagation();
  byKeys(true);
  const el = e.currentTarget, all = itemsOf(el), at = all.indexOf(document.activeElement), row = all[at];
  const k = e.key;
  if (k === 'ArrowDown') focusItem(el, at + 1 >= all.length ? 0 : at + 1);
  else if (k === 'ArrowUp') focusItem(el, at <= 0 ? all.length - 1 : at - 1);
  else if (k === 'Home') focusItem(el, 0);
  else if (k === 'End') focusItem(el, all.length - 1);
  else if (k === 'Enter') { if (row) run(el, row); }
  else if (k === ' ') { if (row) run(el, row, { play: true }); }
  else if (k === 'ArrowRight') { if (el === root && row?.hasAttribute('aria-haspopup')) run(el, row); }
  else if (k === 'ArrowLeft') { if (el === sub) closeSub({ focus: true }); }
  else if (k === 'Escape') { if (el === sub) closeSub({ focus: true }); else closeMenu(); }
  else if (k === 'Tab') closeMenu();
  else return;   // 其他按鍵：不做事，也不往外傳（上面已經擋了）
  e.preventDefault();
}

const inside = (t) => !!st && t instanceof Node && (root.contains(t) || sub.contains(t));
// 點外面就關（包括在時間軸上再按一次右鍵：先關這一個，contextmenu 再開新的）
document.addEventListener('pointerdown', (e) => { if (st && !inside(e.target)) closeMenu(); }, true);
// 在選單外面滾滑鼠（時間軸、右側面板）就關；在選單裡面滾（音效清單很長）不關。
// 只看滾輪，不看 scroll 事件：播放時右邊的段落、字幕清單會自己跟著捲，那不是使用者在捲
document.addEventListener('wheel', (e) => { if (st && !inside(e.target)) closeMenu(); }, { capture: true, passive: true });
window.addEventListener('blur', () => closeMenu());
window.addEventListener('resize', () => closeMenu());

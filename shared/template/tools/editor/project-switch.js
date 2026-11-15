// 四頁共用的「切換影片」（039；044 改成自己畫的選單）：同時開著兩個以上專案的剪輯台時，頁首的專案名稱（#projName）本身變成切換鈕，
// 點了在下面展開清單（一列一支影片，這一支有勾），選了就到那個專案的同一頁。
// 只開一個、或讀不到 /api/editors（官網示範頁、舊服務）時頁首和原本一樣，專案名稱只是字。
// 專案名稱的字是各頁自己寫的（設 #projName 的 textContent），這裡只加屬性和旁邊的選單，不動它的字。
import { switchOptions, switchUrl } from './project-switch.mjs';

const POLL_MS = 10000;
const btn = document.getElementById('projName');
let last = '', menu = null, box = null;

const isOpen = () => !!menu && !menu.hidden;
const options = () => [...box.children];
function open({ focus = false } = {}) {
  menu.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  if (focus) (options().find((o) => o.getAttribute('aria-selected') === 'true') || options()[0])?.focus();
}
// focus：鍵盤收起來的，焦點回到切換鈕。滑鼠收起來的不留焦點在切換鈕或選單上，之後按空白鍵照舊是播放，不會又把選單打開
function close({ focus = false } = {}) {
  if (!isOpen()) return;
  const held = menu.contains(document.activeElement) || document.activeElement === btn;
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  if (focus) btn.focus();
  else if (held) document.activeElement.blur();
}

// 專案名稱變成切換鈕、旁邊放選單（收著）；setup 之後才有 menu
function setup() {
  if (menu) return;
  btn.classList.add('proj-switch');
  btn.setAttribute('role', 'button');
  btn.tabIndex = 0;
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'projList');
  btn.closest('.topbar')?.classList.add('has-switch');   // 多了箭頭放不下時頁首可以換行（editor.css）
  menu = document.createElement('div');
  menu.id = 'projMenu';
  menu.className = 'proj-menu';
  menu.hidden = true;
  menu.tabIndex = -1;   // 點到選單裡不是選項的地方，焦點留在選單裡
  menu.innerHTML = '<div class="proj-menu-head" aria-hidden="true">切換影片</div><div class="proj-list" id="projList" role="listbox" aria-label="切換影片"></div>';
  box = menu.lastChild;
  menu.addEventListener('click', onPick);
  menu.addEventListener('keydown', onMenuKey);
  btn.after(menu);
}
// 變回只是字
function teardown() {
  if (!menu) return;
  menu.remove();
  menu = box = null;
  btn.classList.remove('proj-switch');
  btn.closest('.topbar')?.classList.remove('has-switch');
  for (const a of ['role', 'tabindex', 'aria-haspopup', 'aria-expanded', 'aria-controls']) btn.removeAttribute(a);
}

function render(editors) {
  const list = switchOptions(editors);
  const key = JSON.stringify(list.map((e) => [e.name, e.url, !!e.current]));
  if (key === last) return;   // 清單沒變就不重畫：選單正打開時不會動
  last = key;
  if (!list.length) { teardown(); return; }
  setup();
  // 清單變了：選單開著就照樣開著，焦點留在同一支影片上
  const at = isOpen() ? document.activeElement?.dataset?.url : null;
  box.replaceChildren(...list.map((e) => {
    const o = document.createElement('div');
    o.className = 'proj-opt';
    o.setAttribute('role', 'option');
    o.setAttribute('aria-selected', String(!!e.current));
    o.tabIndex = -1;
    o.dataset.url = e.url;
    o.title = e.name;   // 名稱太長被 … 切掉時，滑過看得到全名
    o.innerHTML = '<span class="ck" aria-hidden="true"></span><span class="nm"></span>';
    o.firstChild.textContent = e.current ? '✓' : '';
    o.lastChild.textContent = e.name;
    return o;
  }));
  if (at) (options().find((o) => o.dataset.url === at) || btn).focus();
}

function onPick(e) {
  const o = e.target.closest('.proj-opt');
  if (!o) return;
  const here = o.getAttribute('aria-selected') === 'true';
  // 先收起來再換頁：按上一頁回來、或有東西沒存而留在這一頁時，選單是收著的，名稱還是這一支
  close({ focus: e.detail === 0 });   // detail 是 0＝鍵盤選的（onMenuKey 呼叫的 click()）
  if (!here) location.assign(switchUrl(location.href, o.dataset.url));
}
// 選單開著時鍵盤歸選單：上下鍵移動、Enter／空白選、Esc 收起來。其他按鍵不往外傳，剪輯台的快捷鍵（空白播放、Delete 刪除…）才不會跟著動
function onMenuKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  e.stopPropagation();
  const opts = options(), at = opts.indexOf(document.activeElement);
  const go = (i) => opts[Math.max(0, Math.min(opts.length - 1, i))].focus();
  if (e.key === 'ArrowDown') go(at + 1);
  else if (e.key === 'ArrowUp') go(at < 0 ? opts.length - 1 : at - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(opts.length - 1);
  else if (e.key === 'Enter' || e.key === ' ') opts[at]?.click();
  else if (e.key === 'Escape') close({ focus: true });
  else if (e.key === 'Tab') { close({ focus: true }); return; }   // 從切換鈕照常往下一個（Shift＋Tab 往上一個）走
  else return;
  e.preventDefault();
}

async function refresh() {
  try {
    const r = await fetch('/api/editors', { cache: 'no-store' });
    render(r.ok ? (await r.json()).editors : []);
  } catch { /* 這個剪輯台關了：留著上一次的選單，還能切到別支 */ }
}

if (btn) {
  btn.addEventListener('click', () => { if (menu) { if (isOpen()) close(); else open(); } });
  btn.addEventListener('keydown', (e) => {
    if (!menu || e.metaKey || e.ctrlKey || e.altKey) return;
    const toggle = e.key === 'Enter' || e.key === ' ';
    if (e.key === 'Tab') { close({ focus: true }); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (toggle && !isOpen())) open({ focus: true });
    else if ((toggle || e.key === 'Escape') && isOpen()) close({ focus: true });
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  // 點外面、切到別的視窗（包括點進預覽的播放器）就收起來
  document.addEventListener('pointerdown', (e) => { if (isOpen() && !menu.contains(e.target) && !btn.contains(e.target)) close(); }, true);
  window.addEventListener('blur', () => close());
  refresh();
  window.addEventListener('focus', refresh);
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
}

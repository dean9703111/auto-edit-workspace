// 四頁共用的流程列：① 剪輯清單 → ② 構圖 → ③ 分鏡表 → ④ 完成影片。放在每一頁的頁首，標出這一頁、走過的步驟、現在等你回覆的那一步。
// 讀不到 /api/flow（官網示範頁、舊服務）就不顯示，不影響頁面。
const PAGE = { '/cuts': 'cuts', '/cuts.html': 'cuts', '/framing': 'framing', '/framing.html': 'framing', '/storyboard': 'storyboard', '/storyboard.html': 'storyboard' };
const here = PAGE[location.pathname] || 'final';

// 主要按鈕的字色：照主色算白字或深字，對比至少 4.5（白字配橘色只有 3.1）
export function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (L + 0.05) >= 4.5 ? '#FFFFFF' : '#0B1020';
}
const ink = inkFor(getComputedStyle(document.documentElement).getPropertyValue('--brand'));
if (ink) document.documentElement.style.setProperty('--on-accent', ink);
const POLL_MS = 10000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WORD = { done: '已經確認', waiting: '等你回覆', none: '還沒走到' };

let last = '';
function render(flow) {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  let nav = document.getElementById('flowbar');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'flowbar';
    nav.className = 'flowbar';
    nav.setAttribute('aria-label', '製作流程');
    const after = bar.querySelector('.save-state');
    if (after) after.after(nav); else bar.append(nav);
  }
  const html = flow.steps.map((s) => {
    const on = s.id === here;
    const cls = [on ? 'on' : '', s.state, s.ready ? '' : 'off'].filter(Boolean).join(' ');
    const tip = `${s.no} ${s.label}：${s.ready ? WORD[s.state] : '還沒有內容'}`;
    const inner = `<span class="fb-no" aria-hidden="true">${s.state === 'done' ? '✓' : esc(s.no)}</span><span class="fb-label">${esc(s.label)}</span>`;
    // 還沒有內容的步驟不給點；這一頁自己也不用連
    if (on || !s.ready) return `<span class="fb-step ${cls}" title="${esc(tip)}"${on ? ' aria-current="step"' : ''}>${inner}</span>`;
    return `<a class="fb-step ${cls}" href="${esc(s.url)}" title="${esc(tip)}">${inner}</a>`;
  }).join('<span class="fb-sep" aria-hidden="true">›</span>');
  if (html !== last) { nav.innerHTML = html; last = html; }
}

async function refresh() {
  try {
    const r = await fetch('/api/flow', { cache: 'no-store' });
    if (r.ok) render(await r.json());
  } catch { /* 服務關了：留著上一次的樣子，存檔狀態另外會講 */ }
}
refresh();
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);

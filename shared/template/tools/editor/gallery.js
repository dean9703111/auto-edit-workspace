// 將既有情境庫接回目前專案；風格試看沿用情境庫，不寫 plan.json。
(() => {
  const config = window.__editorGallery;
  if (!config) return;
  const portrait = config.format === 'portrait';
  const bar = document.createElement('div');
  bar.className = 'wrap';
  Object.assign(bar.style, { padding: '16px', borderBottom: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 24px' });
  const back = document.createElement('a');
  back.href = '/framing'; back.textContent = '← 回構圖';
  back.addEventListener('click', (e) => {
    try {
      if (window.opener && !window.opener.closed && window.opener.location.origin === location.origin && window.opener.location.pathname === '/framing') {
        e.preventDefault(); window.opener.focus(); window.close();
      }
    } catch { /* 沒有原分頁時照連結開構圖 */ }
  });
  const title = document.createElement('strong');
  title.textContent = `${config.project}｜動畫預覽（選用）`;
  const note = document.createElement('span');
  note.style.color = 'var(--muted)';
  note.textContent = `${config.ref.exists ? '已套用你的構圖參考圖' : '目前使用示範講者'}；試看風格與背景不會改動本集設定。`;
  bar.append(back, title, note);
  document.body.prepend(bar);
  const home = document.querySelector('[data-home]');
  if (home) { home.href = '/'; home.textContent = '← 剪輯台'; }

  const pick = document.getElementById('stylePick');
  if (pick && [...pick.options].some((o) => o.value === config.style)) {
    pick.value = config.style;
    pick.dispatchEvent(new Event('change'));
  }
  const theme = document.getElementById('themeToggle');
  if (theme && (theme.getAttribute('aria-pressed') === 'true') !== (config.theme === 'dark')) theme.click();

  if (portrait) {
    const available = new Set(config.portraitPreviews);
    for (const frame of document.querySelectorAll('iframe[src^="preview/"]')) {
      const url = new URL(frame.getAttribute('src'), location.href);
      const name = url.pathname.split('/').pop().replace(/\.html$/, '-v.html');
      if (!available.has(name)) {
        const card = frame.closest('article');
        if (card) card.hidden = true;
        frame.remove();
        continue;
      }
      url.pathname = url.pathname.replace(/[^/]+$/, name);
      frame.setAttribute('src', `preview/${name}${url.search}`);
      const preview = frame.closest('.pv');
      if (preview) { preview.style.aspectRatio = '9 / 16'; preview.style.backgroundImage = 'none'; }
      const link = preview?.querySelector('a.open');
      if (link) link.setAttribute('href', `preview/${name}${url.search}`);
    }
    for (const section of document.querySelectorAll('section.block')) {
      const cards = [...section.querySelectorAll('article.card')];
      if (cards.length && cards.every((c) => c.hidden)) section.hidden = true;
    }
    note.textContent += ' 直式顯示目前已有直式版本的情境動畫。';
  }
  const previews = [...document.querySelectorAll('iframe[src^="preview/"]')];
  function motion(frame, play) {
    frame.previewPlaying = play;
    frame.contentWindow?.postMessage({ type: 'hf-preview-mode', playback: play ? 'play' : 'still' }, location.origin);
  }
  for (const frame of previews) {
    const stage = frame.closest('.pv') || frame;
    stage.addEventListener('mouseenter', () => motion(frame, true));
    stage.addEventListener('mouseleave', () => motion(frame, false));
    frame.addEventListener('load', () => motion(frame, !!frame.previewPlaying));
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !['design-preview-ready', 'hf-preview-ready'].includes(e.data?.type)) return;
    const frame = previews.find((f) => f.contentWindow === e.source);
    if (frame) motion(frame, !!frame.previewPlaying);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) for (const frame of previews) motion(frame, false); });
})();

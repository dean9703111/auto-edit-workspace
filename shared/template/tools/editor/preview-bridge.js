// 只在本機構圖預覽注入；共用動畫檔案保持原樣。
(() => {
  const brand = document.createElement('link'); brand.rel = 'stylesheet';
  const styles = document.createElement('style'); document.head.append(brand, styles);
  let currentImage = null;
  let playback = 'still', completedAt = null, restart = 0;
  const controlled = new Map();
  function applyPlayback() {
    if (!window.gsap) return;
    for (const tl of gsap.globalTimeline.getChildren(false, false, true)) {
      if (tl.repeat() === -1 && !controlled.has(tl)) {
        controlled.set(tl, { mode: null, restart: null, at: null });
      }
    }
    for (const [tl, previous] of controlled) {
      if (previous.mode === playback && previous.restart === restart && previous.at === completedAt) continue;
      if (playback === 'play') tl.repeat(-1).restart();
      else tl.repeat(0).pause(finishedTime(tl));
      Object.assign(previous, { mode: playback, restart, at: completedAt });
    }
  }
  // 各模板的退場時間不同；停在末尾前 1.8 秒，讓完成內容仍留在畫面上。
  function finishedTime(tl) { return Math.max(.01, Math.min(completedAt ?? tl.duration() - 1.8, tl.duration() - .01)); }
  function motion(data) {
    playback = data.playback === 'play' ? 'play' : 'still';
    completedAt = Number.isFinite(data.completedAt) ? data.completedAt : null;
    restart = data.restart || 0;
    applyPlayback();
  }
  const speakerImages = [...document.querySelectorAll('#footage img, #pip img')];
  new MutationObserver(() => { if (currentImage) for (const img of speakerImages) if (img.src !== currentImage) img.src = currentImage; }).observe(document.body, { attributes: true, attributeFilter: ['src'], subtree: true });
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== parent) return;
    if (e.data?.type === 'hf-preview-mode') { motion(e.data); return; }
    if (e.data?.type !== 'design-preview') return;
    motion(e.data);
    const { image, design } = e.data;
    if (image?.startsWith('data:image/jpeg;base64,')) {
      currentImage = image;
      for (const img of speakerImages) { img.onerror = null; img.src = image; }
    }
    if (design) {
      if (brand.getAttribute('href') !== design.css) brand.href = design.css;
      document.documentElement.dataset.theme = design.theme;
      const css = design.backgrounds.filter((b) => b.exists).map((b) => `html body .sc-surface-${b.kind}{background-image:url("${b.url}")!important;background-size:cover!important;background-position:center!important}`).join('\n');
      if (styles.textContent !== css) styles.textContent = css;
      for (const img of document.querySelectorAll('img[src*="pip-frame"]')) {
        const src = `${design.base}/${img.getAttribute('src').includes('-v.') ? 'pip-frame-v.png' : 'pip-frame.png'}`;
        if (img.getAttribute('src') !== src) img.src = src;
      }
    }
  });
  (document.fonts?.ready || Promise.resolve()).then(() => {
    applyPlayback();
    parent.postMessage({ type: 'design-preview-ready' }, location.origin);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { playback = 'still'; applyPlayback(); } });
  parent.postMessage({ type: 'design-preview-ready' }, location.origin);
})();

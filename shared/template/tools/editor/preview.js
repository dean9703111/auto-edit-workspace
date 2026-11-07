// 兩種預覽
//   SimPreview     播 rough.mp4，用 WebAudio 增益、黑色遮罩、CSS transform 即時模擬 cuts（播放時跳過）／音量（含範圍音量）／淡入淡出／dip／punch，
//                  插入素材（media 段）用疊在上面的 <video>／<img> 示意進出場與原聲，位置和完成影片同一個可見區（橫式 contain＝上方 1920×940，字幕帶空出來）；
//                  只有聲音、沒有插入素材的地方（底片是黑的）在中間寫是哪一段、去完成影片預覽看；音效照檢查報告的時間點播 shared/sfx 的 wav；
//                  全部聲音最後經過 AnalyserNode 給音量表
//   PlayerPreview  用 HyperFrames 的 <hyperframes-player> 播 work/hyperframes/index.html（上一次 build 的完整完成影片；時間是完成影片時間）
// 兩者對外都用 rough.mp4 的秒數（app.t）。
import { clamp, cutIndexAt, outOf, roughOf, effectsAt, dbToGain, gainAt, MEDIA_TRANS } from './model.mjs';

export class SimPreview {
  constructor(els, app) {
    this.el = els; this.app = app;
    this.v = els.video;
    this.audio = null;            // { ctx, voice, master, analyser, media: Map, sfxBus }
    this.mediaEls = new Map();
    this.sfxBuf = new Map();      // name → AudioBuffer | Promise | null
    this.lastSkip = 0; this.lastT = 0;
    // 字幕：直接用 kit/captions.css（完成影片的樣式與數字），排在畫布大小（app.canvas().W×H）的圖層裡，再整層縮到預覽的大小
    if (els.capLayer && typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.fitCaps()).observe(els.capLayer.parentElement);
      this.fitCaps();
    }
    this.v.addEventListener('ended', () => app.onEnded?.());
    this.v.addEventListener('error', () => app.onVideoError?.('瀏覽器播不了 rough.mp4（格式不支援或檔案壞了）'));
  }
  fitCaps() {
    const L = this.el.capLayer, w = L?.parentElement?.clientWidth || 0;
    if (w) L.style.transform = `scale(${w / (this.app.canvas?.().W || 1920)})`;
  }
  load(url) { if (this.v.getAttribute('src') !== url) { this.v.src = url; this.v.load(); } }
  get time() { return this.v.currentTime || 0; }
  get playing() { return !this.v.paused && !this.v.ended; }
  ensureAudio() {
    if (this.audio) { if (this.audio.ctx.state === 'suspended') this.audio.ctx.resume(); return; }
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(this.v);
      const voice = ctx.createGain(), master = ctx.createGain(), sfxBus = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(voice).connect(master);
      sfxBus.connect(master);
      master.connect(analyser).connect(ctx.destination);
      this.audio = { ctx, voice, master, analyser, sfxBus, media: new Map(), buf: new Float32Array(analyser.fftSize) };
    } catch { this.audio = null; }
  }
  // 音量表：最近一格的峰值（dBFS，> 0＝會爆音）
  peakDb() {
    if (!this.audio || !this.playing) return null;
    const { analyser, buf } = this.audio;
    analyser.getFloatTimeDomainData(buf);
    let m = 0;
    for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; }
    return m > 0 ? 20 * Math.log10(m) : -120;
  }
  play() {
    this.ensureAudio();
    const cuts = this.app.edit.cuts;
    const ci = cutIndexAt(this.v.currentTime, cuts);
    if (ci >= 0) this.v.currentTime = cuts[ci][1];
    if (this.v.ended || this.v.currentTime >= (this.v.duration || Infinity) - 0.02) this.v.currentTime = roughOf(0, cuts);
    this.lastT = this.v.currentTime;
    return this.v.play().catch(() => {});
  }
  pause() { this.v.pause(); for (const m of this.mediaEls.values()) if (m.el.tagName === 'VIDEO') m.el.pause(); }
  seek(t) { this.v.currentTime = clamp(t, 0, this.v.duration || t); this.lastT = this.v.currentTime; }
  hide(on) { this.el.root.hidden = on; if (on) this.pause(); }

  tick() {
    const A = this.app, v = this.v, E = A.edit;
    let t = v.currentTime || 0;
    if (this.playing) {
      const ci = cutIndexAt(t + 0.01, E.cuts);
      if (ci >= 0 && performance.now() - this.lastSkip > 60) {
        const end = E.cuts[ci][1];
        this.lastSkip = performance.now();
        if (end >= (v.duration || A.dur) - 0.03) { v.pause(); v.currentTime = Math.max(0, E.cuts[ci][0] - 0.001); }
        else v.currentTime = end;
        t = end;
      }
    }
    const inCut = cutIndexAt(t, E.cuts) >= 0;
    this.el.cutBadge.hidden = !inCut || this.playing;
    const o = outOf(t, E.cuts);
    const fx = effectsAt(o, A.fxCtx());
    this.el.black.style.opacity = String(fx.black);
    v.style.transform = fx.scale !== 1 ? `scale(${fx.scale})` : '';
    const lf = A.lookCss && A.lookCss !== 'none' ? A.lookCss : '';
    if (v.style.filter !== lf) v.style.filter = lf;
    // 人聲：軌道音量＋範圍音量＋淡入淡出
    const g = A.trackMuted('voice') ? 0 : dbToGain(E.volume.voice + gainAt(t, E.gains)) * fx.audio;
    if (this.audio) this.audio.voice.gain.setTargetAtTime(g, this.audio.ctx.currentTime, 0.015);
    else v.volume = clamp(g, 0, 1);
    if (this.audio) this.audio.sfxBus.gain.setTargetAtTime(A.trackMuted('sfx') ? 0 : fx.audio, this.audio.ctx.currentTime, 0.015);
    const cue = A.captionAt(t);
    const txt = cue ? cue.text : '';
    const span = this.el.caption.firstElementChild || this.el.caption;
    if (span.textContent !== txt) { span.textContent = txt; this.el.caption.classList.toggle('off', !txt); }
    const mediaOn = this.tickMedia(t, fx.audio);
    this.tickHint(t, mediaOn || inCut);
    this.tickSfx(t);
    this.lastT = t;
  }

  // 音效：播放中跨過標記的時間點就播（跳接、拖曳造成的大跳躍不算）
  tickSfx(t) {
    if (!this.playing || !this.audio) return;
    const a = this.lastT, b = t;
    if (!(b > a) || b - a > 0.3) return;
    for (const m of this.app.sfxView) {
      if (m.muted || m.at <= a || m.at > b || m.gain <= 0) continue;
      if (cutIndexAt(m.at, this.app.edit.cuts) >= 0) continue;
      const buf = this.sfxBuf.get(m.name);
      if (buf instanceof AudioBuffer) {
        const s = this.audio.ctx.createBufferSource(), gn = this.audio.ctx.createGain();
        s.buffer = buf; gn.gain.value = m.gain;
        s.connect(gn).connect(this.audio.sfxBus);
        s.start();
      } else if (buf === undefined) this.loadSfx(m.name);
    }
  }
  loadSfx(name) {
    if (this.sfxBuf.has(name) || !this.audio) return;
    this.sfxBuf.set(name, null);
    fetch(`/sfx/${encodeURIComponent(name)}.wav`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((ab) => this.audio.ctx.decodeAudioData(ab)).then((buf) => this.sfxBuf.set(name, buf), () => this.sfxBuf.set(name, false));
  }
  preloadSfx(names) { this.ensureAudio(); for (const n of names) this.loadSfx(n); }

  tickMedia(t, envelope) {
    const A = this.app;
    let active = null;
    for (const it of A.itemsView) if (it.type === 'media' && t >= it.start && t < it.end) { active = it; break; }
    for (const [id, m] of this.mediaEls) if (!active || active.id !== id) { m.wrap.style.opacity = '0'; if (m.el.tagName === 'VIDEO' && !m.el.paused) m.el.pause(); }
    const pip = this.el.pip;
    if (!active) { pip.style.display = 'none'; return false; }
    const seg = A.mediaSeg(active.id);
    if (!seg || !seg.url) { pip.style.display = 'none'; return false; }
    let m = this.mediaEls.get(active.id);
    if (!m) m = this.makeMedia(active.id, seg);
    const enter = active.enter || 'fade', exit = active.exit || 'fade';
    const di = t - active.start, de = active.end - t;
    let op = 1, tf = '';
    if (di < MEDIA_TRANS && enter !== 'cut') {
      const k = di / MEDIA_TRANS;
      if (enter === 'fade') op = k; else if (enter === 'slide') tf = `translateX(${(1 - k) * 100}%)`; else if (enter === 'zoom') { op = k; tf = `scale(${0.85 + 0.15 * k})`; } else if (enter === 'tape') { op = Math.min(1, k * 2); tf = `scale(${1.05 - 0.05 * k}) rotate(${3 * (1 - k)}deg)`; }
    }
    if (de < MEDIA_TRANS && exit !== 'cut') {
      const k = de / MEDIA_TRANS;
      if (exit === 'fade') op = Math.min(op, k); else if (exit === 'slide') tf = `translateX(${-(1 - k) * 100}%)`; else if (exit === 'zoom') { op = Math.min(op, k); tf = `scale(${0.85 + 0.15 * k})`; }
    }
    const showPip = seg.pip !== false && !A.voiceOnly.some(([a, b]) => t >= a && t < b);
    m.wrap.style.opacity = String(op);
    m.wrap.style.transform = tf;
    m.el.style.objectFit = seg.fit === 'cover' ? 'cover' : 'contain';
    this.placeMedia(m.el, seg.fit === 'cover' ? 'cover' : 'contain', showPip, seg.side);
    if (m.el.tagName === 'VIDEO') {
      // 段內秒 ↔ 素材秒：變速（retime）、定格（hold）、out 算出來的速度都在 knots 裡
      const K = active.knots?.length >= 2 ? active.knots : null;
      let i = 0;
      if (K) while (i < K.length - 2 && di >= K[i + 1][0]) i++;
      const rate = K ? (K[i + 1][1] - K[i][1]) / Math.max(1e-6, K[i + 1][0] - K[i][0]) : (active.speed || 1);
      const want = K ? K[i][1] + (clamp(di, K[i][0], K[i + 1][0]) - K[i][0]) * rate : (active.in || 0) + di * (active.speed || 1);
      if (Math.abs(m.el.currentTime - want) > (this.playing ? 0.35 : 0.04)) m.el.currentTime = Math.max(0, want);
      m.el.playbackRate = clamp(rate || 1, 0.25, 16);
      if (this.playing && rate > 0 && m.el.paused) m.el.play().catch(() => {});
      if ((!this.playing || rate === 0) && !m.el.paused) m.el.pause();
      const vol = active.volume;
      const gain = vol == null || A.trackMuted('media') ? 0 : dbToGain(vol) * dbToGain(A.edit.volume.media) * envelope;
      if (this.audio) {
        let node = this.audio.media.get(active.id);
        if (!node && vol != null) {
          try { const src = this.audio.ctx.createMediaElementSource(m.el); node = this.audio.ctx.createGain(); src.connect(node).connect(this.audio.master); this.audio.media.set(active.id, node); } catch { node = null; }
        }
        if (node) { node.gain.setTargetAtTime(gain, this.audio.ctx.currentTime, 0.015); m.el.muted = false; } else m.el.muted = true;
      } else { m.el.muted = vol == null; m.el.volume = clamp(gain, 0, 1); }
    }
    if (showPip) {
      pip.style.display = 'block';
      pip.style.opacity = String(op);
      // 小視窗的位置和完成影片一樣：橫式錄影段在錄影裡面（lib/media.mjs pipShift）
      const c = A.canvas?.();
      if (Array.isArray(c?.pip)) {
        const [dx, dy] = active.pipShift || [0, 0];
        pip.style.left = `${((c.pip[0] + dx) / c.W) * 100}%`;
        pip.style.top = `${((c.pip[1] + dy) / c.H) * 100}%`;
      }
      const g = pip.getContext('2d'), v = this.v;
      if (v.videoWidth) {
        const cw = pip.width, ch = pip.height, vr = v.videoWidth / v.videoHeight, cr = cw / ch;
        let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0;
        if (vr > cr) { sw = sh * cr; sx = (v.videoWidth - sw) / 2; } else { sh = sw / cr; sy = (v.videoHeight - sh) / 2; }
        g.filter = A.lookCss || 'none';   // 講者調光：子母畫面小視窗跟大畫面同色
        try { g.drawImage(v, sx, sy, sw, sh, 0, 0, cw, ch); } catch { /* 影片還沒準備好 */ }
        g.filter = 'none';
      }
    } else pip.style.display = 'none';
    return true;
  }
  // 插入素材的可見區＝完成影片的（/api/state canvas.media，lib/media.mjs mediaFrame 的 view；直式有講者面板時用 panel）
  placeMedia(el, fit, panel, side = false) {
    const c = this.app.canvas?.() || {}, V = (side && c.media?.side?.[fit]) || c.media?.[panel ? 'panel' : 'full']?.[fit];
    const W = c.W || 1920, H = c.H || 1080, [x, y, w, h] = Array.isArray(V) ? V : [0, 0, W, H];
    const css = `position:absolute;left:${(x / W) * 100}%;top:${(y / H) * 100}%;width:${(w / W) * 100}%;height:${(h / H) * 100}%;object-fit:${fit};`;
    if (el.style.cssText !== css) el.style.cssText = css;
  }
  // 只有聲音的地方：底片是黑的，卡片和情境動畫只在完成影片預覽畫 → 在中間寫是哪一段
  tickHint(t, covered) {
    const A = this.app, el = this.el.hint;
    if (!el) return;
    let txt = '';
    if (!covered && A.voiceOnly.some(([a, b]) => t >= a && t < b)) {
      let it = null;
      for (const x of A.itemsView) if (x.type !== 'media' && t >= x.start && t < (x.vend ?? x.end) && (!it || x.start >= it.start)) it = x;
      txt = it ? `${it.id}　${it.label || ''}\n這段只有聲音，畫面是卡片或情境動畫 → 切到「完成影片預覽」看` : '這段只有聲音（沒有講者畫面）';
    }
    if (el.textContent !== txt) { el.textContent = txt; el.style.whiteSpace = 'pre-line'; }
    el.hidden = !txt;
  }
  makeMedia(id, seg) {
    const wrap = document.createElement('div');
    wrap.className = 'sim-media-item';
    const el = document.createElement(seg.kind === 'image' ? 'img' : 'video');
    el.src = seg.url;
    if (el.tagName === 'VIDEO') { el.muted = true; el.playsInline = true; el.preload = 'auto'; }
    this.placeMedia(el, seg.fit === 'cover' ? 'cover' : 'contain', true, seg.side);
    wrap.append(el);
    this.el.media.append(wrap);
    const m = { wrap, el };
    this.mediaEls.set(id, m);
    return m;
  }
  resetMedia() { for (const m of this.mediaEls.values()) m.wrap.remove(); this.mediaEls.clear(); if (this.audio) this.audio.media.clear(); }
}

let playerScript = null;
function loadPlayerScript() {
  if (customElements.get('hyperframes-player')) return Promise.resolve();
  if (!playerScript) {
    playerScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/hf/player.js';
      s.onload = () => (customElements.get('hyperframes-player') ? resolve() : reject(new Error('載入了播放器檔案，但沒有 <hyperframes-player>')));
      s.onerror = () => reject(new Error('載不到 HyperFrames 播放器'));
      document.head.append(s);
    }).catch((e) => { playerScript = null; throw e; });
  }
  return playerScript;
}

export class PlayerPreview {
  constructor(host, app) {
    this.host = host; this.app = app;
    this.p = null; this.ready = false; this.outT = 0; this._playing = false; this.pendingSeek = null; this.failed = null;
  }
  // 完成影片時間 ↔ rough 時間：用 plan.json 目前存的 cuts（plan 在上次 build 之後又改過時，頁面會提醒「完成影片預覽是舊的」）
  get cuts() { return this.app.savedEdit.cuts; }
  get time() { return roughOf(this.outT, this.cuts); }
  get playing() { return this._playing; }
  peakDb() { return null; }
  async mount(src) {
    this.unmount();
    this.failed = null;
    await loadPlayerScript();
    const p = document.createElement('hyperframes-player');
    p.setAttribute('runtime-src', '/hf/runtime.js');
    p.setAttribute('src', src);
    p.addEventListener('ready', () => {
      this.ready = true;
      this.applyTheme();
      if (this.pendingSeek != null) { p.seek(this.pendingSeek); this.outT = this.pendingSeek; this.pendingSeek = null; }
      this.app.onPlayerReady?.(p.duration);
    });
    p.addEventListener('timeupdate', (e) => { const ct = e.detail?.currentTime; if (Number.isFinite(ct)) this.outT = ct; });
    for (const ev of ['error', 'playbackerror', 'runtimeprotocolerror']) {
      p.addEventListener(ev, (e) => { this.failed = e.detail?.message || e.detail?.reason || ev; this.app.onPlayerError?.(this.failed); });
    }
    this.host.append(p);
    this.p = p;
    this.ready = false;
  }
  unmount() { if (this.p) { try { this.p.pause(); } catch { /* 已經停了 */ } this.p.remove(); } this.p = null; this.ready = false; this._playing = false; }
  play() {
    if (!this.p) return;
    this._playing = true;
    const dur = this.p.duration || 0;
    if (dur && this.outT >= dur - 0.05) this.seekOut(0);
    try { this.p.play(); } catch { /* 播放器還沒好 */ }
  }
  pause() { this._playing = false; try { this.p?.pause(); } catch { /* 播放器還沒好 */ } }
  seekOut(o) {
    this.outT = Math.max(0, o);
    if (!this.p || !this.ready) { this.pendingSeek = this.outT; return; }
    try { this.p.seek(this.outT); } catch { this.pendingSeek = this.outT; }
  }
  seek(t) { this.seekOut(outOf(t, this.cuts)); }
  // 主題：改播放器 iframe 的 <html data-theme>（build 寫在主合成的 <html>；子合成在同一份 document，跟著變）
  applyTheme() {
    let root = null;
    try { root = this.p?.iframeElement?.contentDocument?.documentElement || null; } catch { /* 不同源時讀不到 */ }
    const want = this.app.theme === 'dark' ? 'dark' : 'light';
    if (root && root.getAttribute('data-theme') !== want) root.setAttribute('data-theme', want);
  }
  tick() {
    if (!this.p) return;
    this.applyTheme();
    const ct = this.p.currentTime;
    if (Number.isFinite(ct) && this.ready) this.outT = ct;
    const paused = this.p.paused;
    if (typeof paused === 'boolean' && this.ready) this._playing = !paused;
  }
}

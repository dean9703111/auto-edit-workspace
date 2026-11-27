// 兩種預覽
//   SimPreview     「快速試聽」：播 rough.mp4，用 WebAudio 增益、黑色遮罩、CSS transform 即時模擬 cuts（播放時跳過）／音量（含範圍音量）／淡入淡出／dip／punch，
//                  插入素材（media 段）用疊在上面的 <video>／<img> 示意進出場與原聲，位置和完成影片同一個可見區（橫式 contain＝上方 1920×940，字幕帶空出來；
//                  有錄影畫面框 screenFrame 時是那個框）；
//                  只有聲音、沒有插入素材的地方（底片是黑的）在中間寫是哪一段、去完成影片預覽看；音效照檢查報告的時間點播 shared/sfx 的 wav；
//                  背景音樂播上一次 build 混好的 wav（057：跟著完成影片時間走，音量只補滑桿和做進 wav 的差）；
//                  片尾（076）：片尾配樂和背景音樂一樣播上一次 build 烤好的那一段；影片播完接著走片尾卡那幾秒（rough.mp4 沒有這段，用自己的時鐘），
//                  畫面放片尾卡的示意（黑底、圖、金句照實際的時間淡入、打字、淡出），片尾配樂繼續播到結束；
//                  全部聲音最後經過 AnalyserNode 給音量表
//   PlayerPreview  用 HyperFrames 的 <hyperframes-player> 播 work/hyperframes/index.html（上一次 build 的完整完成影片；時間是完成影片時間）；
//                  058 聲音的滑桿（人聲、音效、素材原聲、背景音樂、範圍音量、各段音量）直接改播放器裡每個出聲元素的 data-volume，馬上聽得到
// 兩者對外都用 rough.mp4 的秒數（app.t）。
import { clamp, cutIndexAt, outOf, roughOf, effectsAt, dbToGain, gainAt, MEDIA_TRANS } from './model.mjs';
import { CAP_VARS, markWords } from '/lib/caption-style.mjs';
import { cjkSpace } from './text.mjs';
import { soundKind, liveScale } from './live-sound.mjs';

export class SimPreview {
  constructor(els, app) {
    this.el = els; this.app = app;
    this.v = els.video;
    this.audio = null;            // { ctx, voice, master, analyser, media: Map, sfxBus }
    this.mediaEls = new Map();
    this.sfxBuf = new Map();      // name → AudioBuffer | Promise | null
    this.bed = null;              // 057 背景音樂：{ url, el, node }
    this.outro = null;            // 076 片尾配樂：同上
    this.endT = null;             // 076 播放頭在片尾卡的第幾秒（null＝還在影片裡）
    this.endPlaying = false; this.endClock = 0;
    this.lastSkip = 0; this.lastT = 0;
    // 字幕：直接用 kit/captions.css（完成影片的樣式與數字），排在畫布大小（app.canvas().W×H）的圖層裡，再整層縮到預覽的大小
    if (els.capLayer && typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.fitCaps()).observe(els.capLayer.parentElement);
      this.fitCaps();
    }
    this.v.addEventListener('ended', () => { if (!this.enterEnd()) app.onEnded?.(); });
    this.v.addEventListener('error', () => app.onVideoError?.('瀏覽器播不了 rough.mp4（格式不支援或檔案壞了）'));
  }
  fitCaps() {
    const L = this.el.capLayer, w = L?.parentElement?.clientWidth || 0;
    if (w) L.style.transform = `scale(${w / (this.app.canvas?.().W || 1920)})`;
    if (w && this.el.endLayer) this.el.endLayer.style.transform = L.style.transform;   // 076 片尾卡的示意：同一個畫布大小的圖層
  }
  // ---------- 076 片尾卡那幾秒（rough.mp4 外面）----------
  get vdur() { return this.v.duration || this.app.dur || 0; }
  get endDur() { return this.app.endDur || 0; }
  // 影片播完（或片尾被剪掉、播到剪點）：有片尾卡就接著走，回傳 true
  enterEnd() {
    if (!(this.endDur > 0)) return false;
    this.endT = 0; this.endPlaying = true; this.endClock = performance.now();
    return true;
  }
  leaveEnd() { this.endT = null; this.endPlaying = false; }
  load(url) { if (this.v.getAttribute('src') !== url) { this.v.src = url; this.v.load(); } }
  get time() { return this.endT != null ? this.vdur + this.endT : this.v.currentTime || 0; }
  get playing() { return this.endPlaying || (!this.v.paused && !this.v.ended); }
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
    // 076 在片尾卡裡：接著走；已經到底就從頭播
    if (this.endT != null) {
      if (this.endT < this.endDur - 0.02) { this.endPlaying = true; this.endClock = performance.now(); return Promise.resolve(); }
      this.leaveEnd(); this.v.currentTime = 0;
    }
    const cuts = this.app.edit.cuts;
    const ci = cutIndexAt(this.v.currentTime, cuts);
    if (ci >= 0) this.v.currentTime = cuts[ci][1];
    if (this.v.ended || this.v.currentTime >= (this.v.duration || Infinity) - 0.02) this.v.currentTime = roughOf(0, cuts);
    this.lastT = this.v.currentTime;
    return this.v.play().catch(() => {});
  }
  pause() { this.endPlaying = false; this.v.pause(); for (const m of this.mediaEls.values()) if (m.el.tagName === 'VIDEO') m.el.pause(); this.bed?.el.pause(); this.outro?.el.pause(); }
  seek(t) {
    const d = this.vdur;
    if (this.endDur > 0 && d > 0 && t > d + 1e-3) {   // 076 拖進片尾卡：影片停在最後，時間照片尾卡的秒數
      if (!this.v.paused) this.v.pause();
      if (Math.abs(this.v.currentTime - d) > 0.05) this.v.currentTime = d;
      this.endT = clamp(t - d, 0, this.endDur); this.endClock = performance.now();
      this.lastT = d + this.endT;
      return;
    }
    const was = this.endPlaying;
    this.leaveEnd();
    this.v.currentTime = clamp(t, 0, this.v.duration || t); this.lastT = this.v.currentTime;
    if (was) this.v.play().catch(() => {});   // 播到片尾卡時往回拖：接著播影片
  }
  hide(on) { this.el.root.hidden = on; if (on) this.pause(); }

  tick() {
    const A = this.app, v = this.v, E = A.edit;
    if (this.endT != null) return this.tickEnd();
    this.showEnd(null);
    let t = v.currentTime || 0;
    if (this.playing) {
      const ci = cutIndexAt(t + 0.01, E.cuts);
      if (ci >= 0 && performance.now() - this.lastSkip > 60) {
        const end = E.cuts[ci][1];
        this.lastSkip = performance.now();
        if (end >= (v.duration || A.dur) - 0.03) { v.pause(); v.currentTime = Math.max(0, E.cuts[ci][0] - 0.001); if (this.enterEnd()) return this.tickEnd(); }   // 片尾被剪掉：播到剪點就接片尾卡
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
    // 091 只標幾個字：那幾個字包成 <em class="cw">（和完成影片同一支 markWords、同一份 kit/captions.css）
    const html = cue ? markWords(txt, A.wordsOf?.(cue.n) || []) : '';
    if (span._html !== html) { span.innerHTML = html; span._html = html; this.el.caption.classList.toggle('off', !txt); }
    this.el.caption.classList.toggle('cg--em', !!cue && !!A.isMark?.(cue.n));   // 038 重點字幕：和完成影片同一個 class（kit/captions.css）
    const mediaOn = this.tickMedia(t, fx.audio);
    this.tickHint(t, mediaOn || inCut);
    this.tickSfx(t);
    this.tickBed(t);
    this.lastT = t;
  }

  // 057 背景音樂：app.bedPlay() 給上一次 build 混好的 wav（完成影片時間）和要補的增益；rough 秒數照剪掉的範圍換成完成影片秒數再對齊
  // （跳過剪掉的範圍時完成影片時間是連續的，不用跳）。差超過 0.3 秒才重新對齊，拖播放頭也會跟上
  // 076 片尾配樂（app.outroPlay()）走同一套：兩條各自對齊、各自播
  tickBed(t) {
    this.tickMusic('bed', this.playing ? this.app.bedPlay?.() : null, t);
    this.tickMusic('outro', this.playing ? this.app.outroPlay?.() : null, t);
  }
  tickMusic(slot, b, t) {
    if (this[slot] && b && this[slot].url !== b.url) this.dropBed(slot);
    if (!b) { if (this[slot] && !this[slot].el.paused) this[slot].el.pause(); return; }
    const m = this[slot] || this.makeBed(b.url, slot), el = m.el;
    const o = outOf(t, this.app.edit.cuts) - b.at, end = Number.isFinite(b.dur) ? b.dur : el.duration;
    if (o < 0 || (Number.isFinite(end) && o >= end - 0.05)) { if (!el.paused) el.pause(); return; }
    if (m.node) m.node.gain.setTargetAtTime(b.gain, this.audio.ctx.currentTime, 0.015); else el.volume = clamp(b.gain, 0, 1);
    el.playbackRate = this.endT != null ? 1 : this.v.playbackRate || 1;
    try { if (el.paused || Math.abs(el.currentTime - o) > 0.3) el.currentTime = o; } catch { /* 還沒載到 metadata */ }
    if (el.paused) el.play().catch(() => {});
  }
  // 片尾卡那幾秒：自己的時鐘往前走，到底就停；畫面放示意，人聲、字幕、素材都收掉，音樂（片尾配樂、鋪到片尾的背景音樂）照完成影片時間繼續
  tickEnd() {
    const A = this.app, d = this.vdur, now = performance.now();
    if (!(this.endDur > 0)) { this.leaveEnd(); return; }   // 片尾卡拿掉了
    if (this.endPlaying) {
      this.endT = Math.min(this.endDur, this.endT + (now - this.endClock) / 1000);
      if (this.endT >= this.endDur - 1e-3) { this.endT = this.endDur; this.endPlaying = false; A.onEnded?.(); }
    }
    this.endClock = now;
    const t = d + this.endT;
    this.el.cutBadge.hidden = true;
    this.el.black.style.opacity = '1';
    this.el.caption.classList.add('off');
    for (const m of this.mediaEls.values()) { m.wrap.style.opacity = '0'; if (m.el.tagName === 'VIDEO' && !m.el.paused) m.el.pause(); }
    this.el.pip.style.display = 'none';
    if (this.el.hint) this.el.hint.hidden = true;
    if (this.audio) this.audio.voice.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.015);
    this.showEnd(this.endT);
    this.tickBed(t);
    this.lastT = t;
  }
  // 片尾卡的示意：tt＝片尾卡的第幾秒（null＝收起來）。時間照 lib/ending.mjs 的數字（/api/state 的 end.layout）：圖淡入、金句照選的文字動畫出來（077：打字機、淡入、逐行浮出、由左擦開、直接出現）、最後一起淡出
  showEnd(tt) {
    const box = this.el.end;
    if (!box) return;
    const c = tt == null ? null : this.app.endCard?.();
    if (!c) { if (!box.hidden) box.hidden = true; return; }
    const L = c.layout || {}, I = L.image || { at: 0.1, fade: 0.5, scale: 0.63 }, Q = L.quote || { at: 0.633, type: 5.23, left: 1300, top: 575, width: 580, size: 48, line: 73 };
    const M = L.motion || { fade: 0.8, rise: { dur: 0.6, gap: 0.5, y: 28 }, wipe: { dur: 0.9, gap: 0.6 } }, mo = c.motion || 'type', byLine = mo === 'rise' || mo === 'wipe';
    const key = JSON.stringify([c.image, c.lines, L, mo]);
    const q = this.el.endQuote;
    if (box.dataset.key !== key) {
      box.dataset.key = key; box.dataset.shown = '';
      const { W, H } = this.app.canvas?.() || { W: 1920, H: 1080 }, iw = Math.round(W * I.scale), ih = Math.round(H * I.scale);
      const img = this.el.endImg;
      if (c.image) { img.src = c.image; img.hidden = false; Object.assign(img.style, { left: `${Math.round((W - iw) / 2)}px`, top: `${Math.round((H - ih) / 2)}px`, width: `${iw}px`, height: `${ih}px` }); } else { img.removeAttribute('src'); img.hidden = true; }
      Object.assign(q.style, { left: `${Q.left}px`, top: `${Q.top}px`, width: `${Q.width}px`, fontSize: `${Q.size}px`, lineHeight: `${Q.line}px`, wordBreak: Q.manual ? 'normal' : 'break-all', overflowWrap: Q.manual ? 'anywhere' : '' });
      q.textContent = '';
      (c.lines || []).forEach((l, i) => {   // 一段一塊（lib/ending.mjs 一樣），段與段之間空 Q.gap px（段落間距）、太長照框寬換行；打字機再一個字一個 .ec
        const el = document.createElement('span');
        el.className = 'el'; el.style.display = 'block';
        if (i) el.style.marginTop = `${Q.gap ?? Q.line}px`;
        if (mo === 'type') for (const ch of l) { const sp = document.createElement('span'); sp.className = 'ec'; sp.textContent = ch; el.append(sp); }
        else el.textContent = l;
        q.append(el);
      });
    }
    const fade = I.fade || 0.5, out = clamp((c.dur - tt) / fade, 0, 1), q0 = tt - (Q.at || 0);
    this.el.endImg.style.opacity = String(Math.min(clamp((tt - (I.at || 0)) / fade, 0, 1), out));
    let qop = out;
    if (mo === 'type') {
      const chars = q.querySelectorAll('.ec'), n = chars.length;
      const type = Math.min(Q.type || 5.23, Math.max(1, c.dur - (Q.at || 0) - fade - 1)), shown = n ? Math.floor(clamp(q0 / type, 0, 1) * n + 1e-6) : 0;
      if (box.dataset.shown !== String(shown)) { box.dataset.shown = String(shown); chars.forEach((el, i) => { el.style.opacity = i < shown ? '1' : '0'; }); }
    } else if (mo === 'fade') qop = Math.min(out, clamp(q0 / M.fade, 0, 1));
    else if (byLine) {
      const els = q.querySelectorAll('.el'), R = M[mo], gap = mo === 'wipe' && els.length < 2 ? 0 : R.gap;
      els.forEach((el, i) => {
        const k = clamp((q0 - i * gap) / R.dur, 0, 1);
        if (mo === 'rise') { const e = 1 - (1 - k) * (1 - k); el.style.opacity = String(e); el.style.transform = `translateY(${((1 - e) * R.y).toFixed(1)}px)`; }
        else { const e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k); el.style.clipPath = `inset(0 ${(100 - e * 100).toFixed(1)}% 0 0)`; }
      });
    } else qop = q0 >= 0 ? out : 0;   // 直接出現
    q.style.opacity = String(qop);
    if (box.hidden) box.hidden = false;
  }
  makeBed(url, slot = 'bed') {
    const el = new Audio();
    el.preload = 'auto';
    el.src = url;
    let node = null;
    if (this.audio) {
      try { const src = this.audio.ctx.createMediaElementSource(el); node = this.audio.ctx.createGain(); node.gain.value = 0; src.connect(node).connect(this.audio.master); } catch { node = null; }
    }
    this[slot] = { url, el, node };
    return this[slot];
  }
  dropBed(slot = 'bed') {
    const m = this[slot];
    if (!m) return;
    m.el.pause();
    try { m.node?.disconnect(); } catch { /* 已經斷了 */ }
    m.el.removeAttribute('src'); m.el.load();
    this[slot] = null;
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
        const ctx = this.audio.ctx, s = ctx.createBufferSource(), gn = ctx.createGain();
        s.buffer = buf; gn.gain.value = m.gain;
        s.connect(gn).connect(this.audio.sfxBus);
        // 065 裁過前後的：從檔案第 off 秒播 len 秒，裁過的那一端 10 ms 淡入／淡出（和 build 一樣）
        const off = m.span?.trimIn || 0, len = m.span?.trimOut > 0 && m.len ? m.len : undefined, now = ctx.currentTime, F = 0.01;
        if (off > 0) { gn.gain.setValueAtTime(0, now); gn.gain.linearRampToValueAtTime(m.gain, now + F); }
        if (len) { gn.gain.setValueAtTime(m.gain, now + Math.max(F, len - F)); gn.gain.linearRampToValueAtTime(0, now + len); }
        s.start(now, off, len);
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
    let op = 1, tf = '', fl = '';
    // 甩鏡（whip）：橫向甩過＋拉長＋模糊，越靠近接縫越快越糊（示意）
    const whip = (k, dir) => { tf = `translateX(${dir * (1 - k) ** 3 * 100}%) scaleX(${1 + 0.15 * (1 - k)})`; fl = `blur(${Math.round(24 * (1 - k))}px)`; };
    if (di < MEDIA_TRANS && enter !== 'cut') {
      const k = di / MEDIA_TRANS;
      if (enter === 'fade') op = k; else if (enter === 'slide') tf = `translateX(${(1 - k) * 100}%)`; else if (enter === 'zoom') { op = k; tf = `scale(${0.85 + 0.15 * k})`; } else if (enter === 'tape') { op = Math.min(1, k * 2); tf = `scale(${1.05 - 0.05 * k}) rotate(${3 * (1 - k)}deg)`; }
      else if (enter === 'whip') whip(k, 1); else if (enter === 'tilt') { op = Math.min(1, k * 2); tf = `perspective(1800px) rotateX(${22 * (1 - k)}deg) rotateY(${-8 * (1 - k)}deg) scale(${0.94 + 0.06 * k})`; }
    }
    if (de < MEDIA_TRANS && exit !== 'cut') {
      const k = de / MEDIA_TRANS;
      if (exit === 'fade') op = Math.min(op, k); else if (exit === 'slide') tf = `translateX(${-(1 - k) * 100}%)`; else if (exit === 'zoom') { op = Math.min(op, k); tf = `scale(${0.85 + 0.15 * k})`; } else if (exit === 'whip') whip(k, -1);
    }
    const showPip = seg.pip !== false && !A.voiceOnly.some(([a, b]) => t >= a && t < b);
    m.wrap.style.opacity = String(op);
    m.wrap.style.transform = tf;
    m.wrap.style.filter = fl;
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
    // 061 錄影畫面框（canvas.media.frame）：素材放進框裡，圓角照完成影片（換成元素寬高的百分比，跟著預覽大小縮放）
    const r = !side && c.media?.frame && c.media.radius ? `border-radius:${(c.media.radius / w) * 100}% / ${(c.media.radius / h) * 100}%;` : '';
    const css = `position:absolute;left:${(x / W) * 100}%;top:${(y / H) * 100}%;width:${(w / W) * 100}%;height:${(h / H) * 100}%;object-fit:${fit};${r}`;
    if (el.style.cssText !== css) el.style.cssText = css;
  }
  // 字卡和動畫只在完成影片預覽畫：只有聲音的地方（底片是黑的）在中間寫是哪一段；有講者的地方在角落講一聲，不然選到動畫卻看不到，會以為壞了
  tickHint(t, covered) {
    const A = this.app, el = this.el.hint;
    if (!el) return;
    let it = null;
    for (const x of A.itemsView) if (x.type !== 'media' && t >= x.start && t < (x.vend ?? x.end) && (!it || x.start >= it.start)) it = x;
    const voice = !covered && A.voiceOnly.some(([a, b]) => t >= a && t < b);
    const where = A.server?.preview?.built ? '切到「完成影片預覽」看' : '按「更新預覽」後在完成影片預覽看';
    let txt = '';
    if (voice) txt = it ? `${it.title || it.label || it.id}\n這段的畫面是字卡或動畫 → ${where}` : '這段只有聲音（沒有講者畫面）';
    else if (it && !covered) txt = `這裡有${it.type === 'custom' ? '動畫' : '字卡'}，快速試聽看不到 → ${where}`;
    if (el.textContent !== txt) { el.textContent = txt; el.style.whiteSpace = 'pre-line'; }
    el.classList.toggle('corner', !voice);
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

// 055 N11：完成影片預覽播放時，沒有聲音的影片層（去背層 mattev-*、講者小視窗 pipv-*、錄影片段 mv-*）每一格對齊主時間（有聲音的講者底片）。
// HyperFrames 的播放器自己只在差 0.04 秒以上才微調播放速度、差 0.5 秒以上才跳，去背層常常差 1–3 格（人物重影）；
// 這裡用 requestVideoFrameCallback 看每一支「真的顯示出來的那一格」，和同一次畫面更新的底片那一格比，差超過 1 格就改 currentTime
// （每支影片記住上次跳完還差多少，下次一起補：解碼、顯示要時間）；剪點前 0.5 秒先把下一支 seek 到開頭。
// 有聲音的底片不動（它就是主時間，動了聲音會斷）。輸出完成影片不經過這裡（render 逐格抽影格，不會差）
export const LAYER_SYNC = { frames: 1, cooldownMs: 300, settleMs: 150, preroll: 0.5, maxLead: 0.3, vsyncMs: 20 };

// 058 聲音即時生效。HyperFrames 播放器每一格照元素的 data-volume 設它自己 Web Audio 圖裡的增益（GainNode），所以這裡改 data-volume，不改 el.volume
// （el.volume 每一格會被設回去；音效、背景音樂、走 Web Audio 的影片已經接在播放器自己的 AudioContext，從外面再接 createMediaElementSource 會丟 InvalidStateError）。
// 值＝build 寫的 data-volume ×（現在的值 − 做進去的值）換成的倍數（editor/live-sound.mjs liveScale；做進去的值＝/api/state 的 preview.sound）。
// 有聲音的影片（人聲、素材原聲）平常走原生播放，data-volume 到 1 就封頂；按播放之前把它們放進一個音量 1 的 audio group，
// 播放器就改走 Web Audio，調大也聽得到（data-volume 大於 1 的影片本來就走這條）。瀏覽器還沒允許播放聲音時不放（不能因為這樣變成沒聲音）
export const LIVE_GROUP = 'editor-live';
// 字幕 root（applyCaption、applyMarks）：HyperFrames 0.9 把子合成接進主文件時，root 的 id 換成 data-hf-authored-id，
// #captions 找不到（058 實測 0.9.28：字幕樣式、重點字幕在完成影片預覽原本沒有即時換），兩種都找
const CAP_ROOT = '#captions, #captions-test, [data-hf-authored-id="captions"], [data-hf-authored-id="captions-test"]';
const fmtVol = (v) => String(Math.round(Math.max(0, v) * 10000) / 10000);

export class PlayerPreview {
  constructor(host, app) {
    this.host = host; this.app = app;
    this.p = null; this.ready = false; this.outT = 0; this._playing = false; this.pendingSeek = null; this.failed = null;
    this.layers = null;
    this.sound = null;            // 058 { list: [{ el, k, raw, base, shown }] } | { fail: 原因 }
    this.live = null;             // 058 聲音即時生效：{ on: true } | { on: false, why }；null＝還沒載好
  }
  // 播放器裡的影片：data-start／duration／media-start 換算成完成影片時間（剪輯台的 build 都是 1 倍速，變速已經做進素材檔）
  scanLayers() {
    let doc = null;
    try { doc = this.p?.iframeElement?.contentDocument || null; } catch { /* 不同源時讀不到 */ }
    const root = doc?.querySelector('[data-composition-id="main"]');
    if (!root) return null;
    const fps = Number(root.dataset.fps) || this.app.fps || 30;
    const list = [...doc.querySelectorAll('video[data-start]')].map((el) => {
      const start = Number(el.dataset.start) || 0;
      const x = { el, start, end: start + (Number(el.dataset.duration) || Infinity), ms: Number(el.dataset.mediaStart) || 0,
        master: el.dataset.hasAudio === 'true' || !el.muted, shown: null, fix: 0, last: 0, check: false };
      // 顯示出來的那一格（完成影片時間）與那一次畫面更新的時間
      if (typeof el.requestVideoFrameCallback === 'function') {
        const cb = (_, md) => { if (x.dead) return; x.shown = { t: start + md.mediaTime - x.ms, at: md.expectedDisplayTime }; el.requestVideoFrameCallback(cb); };
        el.requestVideoFrameCallback(cb);
      }
      return x;
    });
    return { fps, list, win: doc.defaultView };
  }
  dropLayers() { for (const x of this.layers?.list || []) x.dead = true; this.layers = null; }
  syncLayers() {
    if (!this.p || !this.ready || !this._playing) return;
    const L = this.layers ||= this.scanLayers();
    if (!L?.list.length) return;
    const F = 1 / L.fps, now = performance.now();
    // 主時間：正在播的有聲音底片顯示的那一格；沒有（只有聲音、片尾）就用播放器的時鐘
    const m = L.list.find((x) => x.master && !x.el.paused && x.shown && x.shown.t >= x.start && x.shown.t < x.end);
    const t = m ? m.shown.t + (now - m.shown.at) / 1000 : L.win?.__player?.getTime?.();
    if (!Number.isFinite(t)) return;
    for (const x of L.list) {
      if (x.master) continue;
      const el = x.el;
      if (t >= x.start && t < x.end - F) {
        if (el.paused || el.seeking || el.readyState < 2 || !x.shown || !m) continue;
        // 同一次畫面更新的兩格比：這一支顯示的那一格比底片快（正）或慢（負）幾秒
        if (Math.abs(x.shown.at - m.shown.at) > LAYER_SYNC.vsyncMs) continue;
        const d = x.shown.t - m.shown.t;
        // 上次跳完過了一下還差多少：下次一起補（解碼、顯示要時間）
        if (x.check && now - x.last > LAYER_SYNC.settleMs) { x.fix = Math.min(LAYER_SYNC.maxLead, Math.max(-LAYER_SYNC.maxLead, x.fix - d)); x.check = false; }
        if (Math.abs(d) > LAYER_SYNC.frames * F + 1e-3 && now - x.last > LAYER_SYNC.cooldownMs) {
          try { el.currentTime = Math.max(0, el.currentTime - d + x.fix); x.last = now; x.check = true; } catch { /* 還不能跳 */ }
        }
      } else if (t < x.start && x.start - t <= LAYER_SYNC.preroll && el.paused && !el.seeking && Math.abs(el.currentTime - x.ms) > F / 2) {
        // 剪點前 0.5 秒：下一支先載好、停在第一格
        if (el.preload !== 'auto') el.preload = 'auto';
        try { el.currentTime = x.ms; } catch { /* 還沒載到 metadata */ }
      }
    }
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
      this.dropLayers();
      this.sound = null;   // 058 換了一支 index.html（更新預覽、換專案）：重新找出聲的元素、重新記 build 寫的 data-volume
      this.applySound();
      this.applyTheme();
      if (this.pendingSeek != null) { p.seek(this.pendingSeek); this.outT = this.pendingSeek; this.pendingSeek = null; }
      this.app.onPlayerReady?.(p.duration);
    });
    p.addEventListener('timeupdate', (e) => { const ct = e.detail?.currentTime; if (Number.isFinite(ct)) this.outT = ct; });
    for (const ev of ['error', 'playbackerror', 'runtimeprotocolerror']) {
      p.addEventListener(ev, (e) => {
        const d = e.detail || {}, er = d.error;
        // playbackerror 的原因在 detail.error（DOMException）：播放被暫停／換時間打斷是正常操作，不算出錯
        if (er?.name === 'AbortError') return;
        // 瀏覽器擋住沒點擊就播放的聲音：播放器沒壞，點一下再播（影片那邊播放器自己停了）
        if (er?.name === 'NotAllowedError') { if (d.source === 'video') this._playing = false; this.app.onPlayerBlocked?.(); return; }
        this.failed = d.message || d.reason || (er ? `${er.name || 'Error'} ${er.message || ''}`.trim() : ev);
        this.app.onPlayerError?.(this.failed);
      });
    }
    this.host.append(p);
    this.p = p;
    this.ready = false;
  }
  unmount() { if (this.p) { try { this.p.pause(); } catch { /* 已經停了 */ } this.p.remove(); } this.p = null; this.ready = false; this._playing = false; this.dropLayers(); this.sound = null; this.live = null; }
  play() {
    if (!this.p) return;
    this.routeSound();
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
  // 035 字幕樣式：改播放器 iframe 裡字幕 root 的 data-cap 與 --cap-* 變數（build 寫在 compositions/captions.html 的 root），
  // 字體另外宣告 @font-face（/kit/fonts/，剪輯台服務供應）；不用重新產生就看得到
  applyCaption() {
    let doc = null;
    try { doc = this.p?.iframeElement?.contentDocument || null; } catch { /* 不同源時讀不到 */ }
    const root = doc?.querySelector(CAP_ROOT);
    if (!root || !this.app.capPreview) return;
    const c = this.app.capPreview(), key = JSON.stringify([c.style, c.face]);   // face：有重點字幕時多帶粗體的字型檔（038）
    if (root.dataset.capKey === key) return;
    root.dataset.capKey = key;
    for (const k of CAP_VARS) root.style.removeProperty(k);
    if (c.root) { root.dataset.cap = c.root.look; for (const [k, v] of c.root.vars) root.style.setProperty(k, v); } else delete root.dataset.cap;
    let face = doc.getElementById('capFace');
    if (!face) { face = doc.createElement('style'); face.id = 'capFace'; doc.head.appendChild(face); }
    if (face.textContent !== c.face) face.textContent = c.face;
  }
  // 082 片尾金句：改播放器裡 #end-quote（lib/ending.mjs endingParts 寫的）的位置、字級、框寬、段落間距，不用重新產生。
  //   字和上次 build 的不一樣：把原本的字（文字動畫的對象）收起來，先放整段新的字（看得到、不跑動畫）；改回來再把原本的放回去，動畫照舊
  applyEnding() {
    let doc = null;
    try { doc = this.p?.iframeElement?.contentDocument || null; } catch { /* 不同源時讀不到 */ }
    const q = doc?.getElementById('end-quote'), live = q && this.app.endLive?.();
    if (!live) return;
    const key = JSON.stringify(live);
    if (q.dataset.endKey === key) return;
    q.dataset.endKey = key;
    const b = live.box;
    Object.assign(q.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, fontSize: `${b.size}px`, lineHeight: `${b.line}px`, wordBreak: b.manual ? 'normal' : 'break-all', overflowWrap: b.manual ? 'anywhere' : '' });
    const same = live.lines.length === live.built.length && live.lines.every((l, i) => l === live.built[i]);
    if (same) { if (q._built) { q.replaceChildren(...q._built); q._built = null; } }
    else {
      if (!q._built) q._built = [...q.childNodes];
      q.replaceChildren(...live.lines.map((l) => { const el = doc.createElement('span'); el.className = 'el'; el.style.display = 'block'; el.textContent = l; return el; }));
    }
    for (const el of q.querySelectorAll('.el + .el')) el.style.marginTop = `${b.gap}px`;   // 段落間距（一行一個 .el，lib/ending.mjs）
  }
  // 038 重點字幕：照剪輯台現在的標記切換播放器裡每一則字幕的 cg--em（build 寫在 compositions/captions.html 的 <div class="cg" id="cg-N">）。
  // 上次 build 之後才增刪、改字的那幾則（同一個句號的文字不一樣）不動：句號可能已經對不上，等「更新預覽」
  applyMarks() {
    const A = this.app;
    let doc = null;
    try { doc = this.p?.iframeElement?.contentDocument || null; } catch { /* 不同源時讀不到 */ }
    const root = doc?.querySelector(CAP_ROOT);
    if (!root || !A.markKey) return;
    const key = A.markKey();
    if (root.dataset.markKey === key) return;
    root.dataset.markKey = key;
    const text = new Map(A.cues.map((c) => [c.n, c.text]));
    for (const el of root.querySelectorAll('.cg')) {
      const n = Number(el.id.slice(3));
      if (cjkSpace(text.get(n) ?? '') === el.textContent) el.classList.toggle('cg--em', A.isMark(n));   // build 的字幕補過中英文之間的空格
    }
  }
  // r8 字幕只改字（作者：「調整字幕應該要直接變更吧？不需要按更新預覽」）：播放器裡那一則字幕直接換成剪輯台現在的字
  //   （build 寫在 compositions/captions.html 的 <div class="cg" id="cg-N"><span>…</span></div>）。每一則的時間和上次 build 一樣才換
  //   （app.textLive；分割、合併、改時間等「更新預覽」）；第一次換之前記下 build 做進去的那一份，對不上剪輯台的那幾則還原成它。
  // 091 只標幾個字也在這裡馬上換：那一則的字和剪輯台現在那一句一樣（句號對得上）時，照剪輯台現在標的字重包 <em class="cw">（整則重點的不包）
  applyText() {
    const A = this.app;
    let doc = null;
    try { doc = this.p?.iframeElement?.contentDocument || null; } catch { /* 不同源時讀不到 */ }
    const root = doc?.querySelector(CAP_ROOT);
    if (!root || !A.cues) return;
    const live = !!A.textLive?.(), key = `${live}|${A.ver}|${A.markKey?.() ?? ''}`;
    if (root.dataset.textKey === key) return;
    root.dataset.textKey = key;
    const text = new Map(A.cues.map((c) => [c.n, c.text]));
    for (const el of root.querySelectorAll('.cg')) {
      const span = el.querySelector('span');
      if (!span) continue;
      if (el.dataset.builtHtml == null) el.dataset.builtHtml = span.innerHTML;
      const built = doc.createElement('span');
      built.innerHTML = el.dataset.builtHtml;
      const n = Number(el.id.slice(3)), cur = text.get(n);
      const want = live && cur != null ? cjkSpace(cur) : built.textContent;
      const html = cur != null && cjkSpace(cur) === want ? markWords(want, A.isMark?.(n) ? [] : (A.wordsOf?.(n) || []).map(cjkSpace)) : el.dataset.builtHtml;
      if (span.innerHTML !== html) span.innerHTML = html;
    }
  }
  // 058 播放器裡會出聲、剪輯台管得到音量的元素（editor/live-sound.mjs soundKind 認得的 id；沒聲音的影片層不算）
  scanSound() {
    let doc = null;
    try { doc = this.p?.iframeElement?.contentDocument || null; } catch { /* 不同源時讀不到 */ }
    if (!doc?.querySelector('[data-composition-id="main"]')) return { fail: '讀不到播放器裡的聲音', at: performance.now() };
    const A = this.app, segIds = [...new Set([...(A.plan0?.scenes || []), ...(A.scenes || [])].map((s) => s?.id).filter((id) => typeof id === 'string'))];
    const list = [];
    for (const el of doc.querySelectorAll('audio[id], video[id]')) {
      if (el.tagName === 'VIDEO' && (el.hasAttribute('muted') || (el.dataset.hasAudio ?? 'true') !== 'true')) continue;
      const k = soundKind(el.id, segIds);
      if (!k) continue;
      const raw = el.getAttribute('data-volume'), v = Number.parseFloat(raw ?? '');
      list.push({ el, k, raw, base: Number.isFinite(v) ? v : 1, shown: raw });
    }
    return { list };
  }
  // 每一格：照現在的值改 data-volume（變了才寫）。人聲照那一支現在播到 rough.mp4 的第幾秒算範圍音量
  applySound() {
    if (!this.p || !this.ready) return;
    if (this.sound?.fail && performance.now() - this.sound.at > 1000) this.sound = null;   // 讀不到：過一秒再試
    const S = this.sound ||= this.scanSound(), A = this.app, built = A.server?.preview?.sound;
    const live = S.fail ? { on: false, why: S.fail } : !built ? { on: false, why: '這一版預覽沒有記做進去的音量，更新一次預覽就有（還是沒有就重新啟動剪輯台）' } : { on: true };
    if (JSON.stringify(live) !== JSON.stringify(this.live)) { this.live = live; A.onLiveSound?.(); }
    if (S.fail) return;
    const now = built ? A.soundNow?.() : null;
    for (const x of S.list) {
      let t = 0;
      if (x.k.kind === 'voice') {
        const st = Number(x.el.dataset.start) || 0, d = Number(x.el.dataset.duration);
        t = (Number(x.el.dataset.mediaStart) || 0) + clamp(this.outT - st, 0, Number.isFinite(d) ? Math.max(0, d - 1e-3) : Infinity);
      }
      const k = now ? liveScale(x.k, { built, now, t }) : null;
      const want = k == null || Math.abs(k - 1) < 1e-6 ? x.raw : fmtVol(x.base * k);
      if (want === x.shown) continue;
      if (want == null) x.el.removeAttribute('data-volume'); else x.el.setAttribute('data-volume', want);
      x.shown = want;
    }
  }
  // 按播放之前（使用者點了才會播）：有聲音的影片放進音量 1 的 audio group，走 Web Audio（播放器開始播的時候才決定每支走哪條路）
  routeSound() {
    if (!this.live?.on || navigator.userActivation?.hasBeenActive === false) return;
    for (const x of this.sound?.list || []) if (x.el.tagName === 'VIDEO' && !x.el.hasAttribute('data-audio-group')) x.el.setAttribute('data-audio-group', LIVE_GROUP);
  }
  tick() {
    if (!this.p) return;
    this.applySound();
    this.applyTheme();
    this.applyCaption();
    this.applyText();
    this.applyMarks();
    this.applyEnding();
    const ct = this.p.currentTime;
    if (Number.isFinite(ct) && this.ready) this.outT = ct;
    const paused = this.p.paused;
    if (typeof paused === 'boolean' && this.ready) this._playing = !paused;
    this.syncLayers();
  }
}

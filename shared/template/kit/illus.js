/* =====================================================================
 * illus.js  共用示意插圖元件（純 script，不是 ES module；零相依）
 *   來源：作者 agent-skills repo 的 esim ep2 illus.js。元件的幾何、class、opts 原樣搬，顏色改吃 token（kit/illus.css）。
 *   畫廊：kit/illus-gallery.html（亮／暗兩個主題並列，每個元件、每個狀態一格，標 data-* 寫法）；
 *         kit/illus-gallery.jpg 是同一頁的截圖（截圖當下的主色）。
 *   畫廊沒有的物件要自己畫：照 kit/illus-style.md 畫成 SVG，放 work/hyperframes/illus-local/<name>.svg（用法三）。
 *
 * 用法一（HTML 宣告，建議）：
 *   <div data-illus="phone" data-orient="portrait" data-screen="rec"
 *        style="width:120px;height:250px"></div>
 *   載入：<link rel="stylesheet" href="kit/illus.css">、<script src="kit/illus.js"></script>（timeline script 之前）。
 *   載入時會同步執行一次 ILLUS.mount()，所以同一份文件裡已經有的 [data-illus] 在 timeline 建立時 .il-* 子元素已存在。
 *   子合成（compositions/x-*.html）的內容是之後才插進文件的：script 第一行先
 *     ILLUS.mount(document.getElementById('<root id>'));
 *   再建 timeline。一定要傳自己的 root。
 *
 * 用法二（JS）：  el.innerHTML = ILLUS.phone({orient:'landscape', screen:'rec'})
 *
 * 用法三（專案自己的元件）：
 *   <div data-illus-src="illus-local/router.svg" style="width:220px;height:120px"></div>
 *     路徑相對主合成 index.html（work/hyperframes/），不是相對 compositions/。畫法照 kit/illus-style.md。
 *     mount 時「同步」讀檔（同步 XMLHttpRequest），讀完才往下建 timeline：和內建元件一樣，建 tween 前 .il-* 子元素就在，
 *     HyperFrames 任意時間 seek、render 每一格都一樣。不用非同步 fetch＋promise：HyperFrames 會等子合成的外部 <script src>，
 *     但不會等 script 裡的 promise，timeline 會在 SVG 到之前建好、tween 抓不到元素。
 *     同一個檔只讀一次（快取）。讀不到（檔案不在、用 file:// 直接開檔）→ console.error 一次，元素留空（audit 列成 ⚠ 頁面 JS 錯誤；動畫照跑，只是少這個圖）。
 *   ILLUS.register('router', function (o) { return '<svg …>…</svg>'; });   // 之後 data-illus="router"、ILLUS.router(o) 都能用
 *     名稱：小寫英文開頭的英數（camelCase）；和內建元件或 ILLUS 的方法同名會丟錯（不能蓋掉內建元件）。
 *
 * ILLUS.mount(root = document, {force})  把 root 底下還沒掛過的 [data-illus]／[data-illus-src] 換成 SVG，加 class "il"。
 *   已經掛過的跳過：同一份文件有好幾個子合成，重掛會把別段已經綁好 tween 的子元素換掉。
 *   要重畫（例：改了 data-screen）帶 {force:true}，那些元素的動畫狀態會重置。
 *   data-* 名稱即 opts 名稱：data-orient / data-screen / data-arrow / data-tone / data-bars
 *   / data-seed / data-color / data-angle / data-len / data-fill / data-kind / data-title
 *   / data-text / data-saved / data-sand。數字與布林（"true"）會自動轉型。
 * ILLUS.textWidth(str, fontSize) 估算文字寬（searchBar 游標位置用）。
 *
 * 通則
 *  - 尺寸由外層元素的 CSS width/height 決定，SVG 自動填滿並等比置中（meet）。
 *    viewBox 貼齊圖形外框，下列「建議尺寸」即 viewBox 單位（= 1:1 px）。
 *  - 所有描邊 vector-effect="non-scaling-stroke"：4 / 3 / 2 px，不隨縮放變粗細。
 *    例外：stopwatch 的 .il-sweep 為了 dashoffset 畫圈，描邊會隨縮放（用 pathLength=100）。
 *  - 子元素用 class 抓：gsap.to(el.querySelector('.il-rec'), {opacity:1}) 或
 *    gsap.to('#x .il-rec', ...)。要動的元素若有 style="opacity:0"，用 GSAP 動 opacity 即可。
 *  - 元件之間沒有 id，不會衝突。
 *  - 顏色只寫 token（fill／stroke 屬性＝var(--il-*)，值在 kit/illus.css，亮色 :root／暗色 :root[data-theme="dark"]）：
 *      主體 --il-body、內層/螢幕 --il-inner、描邊與白字 --il-line、次要線與字 --il-sub、
 *      重點 --il-accent（＝主色 --brand；下文寫「黃」的都是它）、主色底上的符號 --il-on-accent（＝--brand-ink）、
 *      紅 --il-warn（＝--sc-warn）、綠 --il-good（＝--sc-good）、personBust tone b 的衣服 --il-alt。
 *    亮色主題是白板線稿（白底＋墨線＋主色點綴）；暗色主題是黑板（石墨底＋淺色線）。
 *    要改某個子元素的顏色：el.setAttribute('fill', 'var(--il-warn)')（屬性，不寫色碼；整段都是這個色）。
 *    要隨時間變色（例：電量格變紅）不要補間顏色，畫兩組狀態群組、用 opacity 交叉淡化，任意 seek 才一樣。
 *
 * ---------------------------------------------------------------------
 * 螢幕狀態切換（phone / phoneTripod / laptop / monitor）
 *  所有狀態子元素都已畫好，只有 opts.screen 指定的那個 opacity:1，其餘 opacity:0。
 *  狀態 class：
 *    video  .il-content  人像剪影      play  .il-play  黃圓＋三角
 *    rec    .il-rec      紅點＋REC     check .il-check 綠勾徽章
 *    warn   .il-warn     紅三角驚嘆號  shorts .il-shorts 直式內容＋愛心／留言（僅 phone）
 *    qr     .il-qr       QR 方塊（僅 phone）   app .il-app 視窗列＋內容線（僅 laptop/monitor）
 *  切換範例： gsap.set(root.querySelectorAll('.il-screen ~ g'), {opacity:0});
 *             gsap.to(root.querySelector('.il-rec'), {opacity:1, duration:.2});
 *  （狀態群組都是 .il-screen 的後續兄弟 <g>；或直接逐個 class 動。）
 *
 * ---------------------------------------------------------------------
 * 元件清單（opts 預設值 | 子元素 class | 建議尺寸 px）
 *
 *  phone(opts)        orient: portrait*|landscape   screen: blank*|video|play|rec|check|warn|shorts|qr
 *                     .il-body .il-screen .il-content .il-play .il-rec .il-check .il-warn .il-shorts .il-qr
 *                     直式 120×250、橫式 250×120
 *  tripod()           .il-legs（三支腳）.il-tripod-head（雲台）                 140×180
 *  phoneTripod(opts)  opts 同 phone；子元素 = phone 的 + tripod 的
 *                     直式 140×360、橫式 260×300
 *  laptop(opts)       screen: blank*|play|video|warn|app（另也畫了 rec、check）
 *                     .il-screen .il-content .il-play .il-warn .il-app .il-rec .il-check     280×190
 *  monitor(opts)      同 laptop                                                    360×300
 *  cloud(opts)        arrow: none*|up|down          .il-arrow（黃箭頭；none 時 opacity:0 仍存在）  220×150
 *  personBust(opts)   tone: a*|b                    .il-head .il-talk（三條黃弧，預設 opacity:0）  160×170
 *  pgPerson(opts)     pose: stand*|walk|point   tone: a*|b|accent
 *                     全身象形人（頭、軀幹、手、腳，都是圓角線稿）；.il-head .il-torso .il-arms .il-legs、
 *                     .il-hi（主色版軀幹，預設 opacity:0；要「其中幾個人換主色」用 opacity 淡入，任意 seek 一樣）
 *                     walk＝邁步；point＝右手往右指。站在地面線上：插圖底＝腳底                          120×284
 *  personTop()        .il-head、.il-face（俯視人：肩膀橢圓＋正中頭圓＋黃色小三角＝面朝方向，預設朝下；要轉向用 CSS rotate 90 度倍數）  110×72
 *  desk()             .il-desk（桌面）.il-laptop（桌上俯視筆電）                    320×150
 *  stage()            .il-top（頂面）.il-front（正面，主色）.il-side（右側面）      960×180
 *                     2.5D 地台（斜投影的一塊厚板）：裝置的底邊站在頂面中線（插圖高的 1/3）上，字可以疊在正面（下面 60）上
 *  cone(opts)         angle: 50*（度） len: 300*（px） fill: false*|true
 *                     .il-cone。頂點在左邊中點、朝右張開；用 CSS rotate(90deg 倍數) 轉向。
 *                     viewBox 寬 = len+4、高 = 2·len·sin(angle/2)+4（依 opts 自動算）
 *                     fill=false 只有黃色虛線外框（12px 線、10px 隙）；true 加 --il-accent-soft（主色 16%）淡填色
 *  waveform(opts)     bars: 28*  seed: 1*  color: white*|yellow|red     .il-bar（每根圓角矩形，中線對稱）  360×90
 *                     white 的柱有深色 2px 描邊，淺色背景也看得到；動畫用 scaleY（transform-box 已設 fill-box）
 *  progress()         .il-track .il-fill（黃，預設滿；scaleX 0→1，origin 左側已設好）   320×28
 *  energy()           .il-body .il-cell（5 格綠；可 fill 改紅或 opacity 熄滅）          220×90
 *  fileVideo()        .il-play（黃三角）                                           100×120
 *  window(opts)       title: ''*   .il-title .il-content（空 <g>，內容區座標 x2..478、y48..298）  480×300
 *  searchBar(opts)    text: ''*    .il-text（32px 白字）.il-caret（游標直線，位置依預設文字估算）  640×84
 *                     文字起點 x=92、游標高 y24..60；改文字後自行移動 caret：x = 92 + ILLUS.textWidth(t,32) + 4
 *  badge(opts)        kind: check*|cross|warn       .il-badge                      72×72
 *  recPill()          .il-dot（紅點）.il-time（時間文字，tabular-nums）.il-label    200×60
 *  stopwatch()        .il-hand（指針）.il-sweep（外圈黃弧）.il-ticks               220×240
 *                     .il-hand 已設 transform-box:view-box + transform-origin 在圓心(110,135)，
 *                       GSAP：gsap.to('.il-hand',{rotation:360, svgOrigin:'110 135'})
 *                     .il-sweep：pathLength=100、dasharray 100、預設 dashoffset 100（空）→ 0 畫滿一圈，
 *                       GSAP：gsap.to('.il-sweep',{strokeDashoffset:0})，從 12 點鐘方向順時針
 *  hourglass(opts)    sand: top*|flow|bottom   .il-glass（玻璃）.il-sandtop（上面的沙）.il-sandbot（下面的沙堆）.il-stream（細流）  200×300
 *                     top＝沙都在上面（沙堆、細流 opacity:0）；flow＝流到一半（三個都看得到）；bottom＝流完（上面的沙、細流 opacity:0）
 *                     玻璃是上下對稱的兩個漏斗，壁是直的：沙用「等比縮放」就會一路貼著玻璃，不要只縮高度（會凸出玻璃外）。
 *                       上面的沙往腰部流光：gsap.to('.il-sandtop', { scale: 0, svgOrigin: '100 156.5', ease: 'none' })
 *                       下面的沙堆長出來：  gsap.fromTo('.il-sandbot', { opacity: 1, scale: 0 }, { scale: 1, svgOrigin: '100 276', ease: 'none' })
 *                       細流：流的時候 gsap.to('.il-stream', { opacity: 1, duration: 0.2 })，流完淡出
 *  bookmark(opts)     saved: false*|true    .il-off（書籤輪廓＋「儲存」）.il-on（黃書籤＋「已儲存」），
 *                     兩組都畫，未選的 opacity:0；用 opacity 切換                    220×72
 * ===================================================================== */
(function () {
  'use strict';

  // 顏色都是 kit/illus.css 的 token（瀏覽器的 SVG 屬性吃 var()；setAttribute 換色也照常蓋得過去）
  var BODY = 'var(--il-body)', INNER = 'var(--il-inner)', WHITE = 'var(--il-line)', YEL = 'var(--il-accent)',
      RED = 'var(--il-warn)', GRN = 'var(--il-good)', SUB = 'var(--il-sub)', PURPLE = 'var(--il-alt)',
      ON_YEL = 'var(--il-on-accent)', YEL_SOFT = 'var(--il-accent-soft)';
  var FONT = 'var(--font-cjk, sans-serif)';

  function n(v) { return +(+v).toFixed(2); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // 元素產生器。特殊 key：s=描邊寬（自動帶 round/non-scaling）、sc=描邊色、off=true 時 opacity:0
  function E(tag, a, inner) {
    a = a || {};
    var s = '';
    for (var k in a) {
      var v = a[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'sc' || k === 'off') continue;
      if (k === 's') {
        s += ' stroke="' + (a.sc || WHITE) + '" stroke-width="' + v +
          '" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"';
        continue;
      }
      s += ' ' + k + '="' + (typeof v === 'number' ? n(v) : v) + '"';
    }
    if (a.off) s += ' style="opacity:0"';
    return inner === undefined ? '<' + tag + s + '/>' : '<' + tag + s + '>' + inner + '</' + tag + '>';
  }
  function R(x, y, w, h, rx, a) {
    a = a || {};
    var o = { x: x, y: y, width: w, height: h, rx: rx };
    for (var k in a) o[k] = a[k];
    return E('rect', o);
  }
  function C(cx, cy, r, a) {
    var o = { cx: cx, cy: cy, r: r };
    for (var k in a) o[k] = a[k];
    return E('circle', o);
  }
  function P(d, a) {
    var o = { d: d };
    for (var k in a) o[k] = a[k];
    return E('path', o);
  }
  function L(x1, y1, x2, y2, a) {
    var o = { x1: x1, y1: y1, x2: x2, y2: y2 };
    for (var k in a) o[k] = a[k];
    return E('line', o);
  }
  function G(cls, inner, a) {
    var o = { 'class': cls };
    for (var k in (a || {})) o[k] = a[k];
    return E('g', o, inner);
  }
  function T(x, y, str, size, fill, cls, anchor) {
    return E('text', {
      x: x, y: y, 'font-size': size, 'font-family': FONT, 'font-weight': 700,
      fill: fill, 'text-anchor': anchor || 'start', 'class': cls
    }, esc(str));
  }
  function SVG(name, w, h, inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" class="il-svg" data-il="' + name +
      '" viewBox="0 0 ' + n(w) + ' ' + n(h) + '" preserveAspectRatio="xMidYMid meet" fill="none">' +
      inner + '</svg>';
  }
  function textWidth(str, size) {
    var w = 0;
    String(str == null ? '' : str).split('').forEach(function (ch) {
      w += ch.charCodeAt(0) > 255 ? size : size * 0.56;
    });
    return w;
  }

  /* ---------- 螢幕狀態（phone / laptop / monitor 共用） ---------- */
  function shouldersHead(cx, yb, u, sw) {
    var t = 0.26 * u, a = 0.36 * u;
    var d = 'M' + n(cx - a) + ',' + n(yb) + ' C' + n(cx - a) + ',' + n(yb - 0.22 * u) + ' ' +
      n(cx - 0.18 * u) + ',' + n(yb - t) + ' ' + n(cx) + ',' + n(yb - t) + ' C' +
      n(cx + 0.18 * u) + ',' + n(yb - t) + ' ' + n(cx + a) + ',' + n(yb - 0.22 * u) + ' ' +
      n(cx + a) + ',' + n(yb) + ' Z';
    return P(d, { fill: BODY, s: sw }) + C(cx, yb - t - 0.14 * u, 0.16 * u, { fill: BODY, s: sw });
  }
  function heart(x, y, s) {
    return P('M' + n(x) + ',' + n(y + s * 0.4) + ' C' + n(x - s * 0.7) + ',' + n(y - s * 0.05) + ' ' +
      n(x - s * 0.35) + ',' + n(y - s * 0.55) + ' ' + n(x) + ',' + n(y - s * 0.15) + ' C' +
      n(x + s * 0.35) + ',' + n(y - s * 0.55) + ' ' + n(x + s * 0.7) + ',' + n(y - s * 0.05) + ' ' +
      n(x) + ',' + n(y + s * 0.4) + ' Z', { fill: RED, s: 2 });
  }

  function stateParts(sx, sy, sw, sh) {
    var cx = sx + sw / 2, cy = sy + sh / 2, u = Math.min(sw, sh);
    return {
      video: ['il-content', function () {
        return shouldersHead(cx, cy + 0.28 * u, u, 3);
      }],
      play: ['il-play', function () {
        var r = 0.26 * u;
        return C(cx, cy, r, { fill: YEL }) +
          E('polygon', {
            points: n(cx - 0.08 * u) + ',' + n(cy - 0.13 * u) + ' ' + n(cx - 0.08 * u) + ',' +
              n(cy + 0.13 * u) + ' ' + n(cx + 0.15 * u) + ',' + n(cy),
            fill: ON_YEL, s: 3, sc: ON_YEL
          });
      }],
      rec: ['il-rec', function () {
        return C(sx + 0.14 * u, sy + 0.14 * u, 0.06 * u, { fill: RED }) +
          T(sx + 0.25 * u, sy + 0.14 * u + 0.05 * u, 'REC', 0.15 * u, WHITE);
      }],
      check: ['il-check', function () {
        var r = 0.24 * u;
        return C(cx, cy, r, { fill: GRN, s: 3 }) +
          P('M' + n(cx - 0.11 * u) + ',' + n(cy + 0.01 * u) + ' L' + n(cx - 0.03 * u) + ',' +
            n(cy + 0.09 * u) + ' L' + n(cx + 0.12 * u) + ',' + n(cy - 0.08 * u), { s: 4 });
      }],
      warn: ['il-warn', function () {
        return E('polygon', {
          points: n(cx) + ',' + n(cy - 0.28 * u) + ' ' + n(cx + 0.31 * u) + ',' + n(cy + 0.24 * u) +
            ' ' + n(cx - 0.31 * u) + ',' + n(cy + 0.24 * u), fill: RED, s: 3
        }) + L(cx, cy - 0.09 * u, cx, cy + 0.07 * u, { s: 4 }) +
          C(cx, cy + 0.155 * u, 2.5, { fill: WHITE });
      }],
      shorts: ['il-shorts', function () {
        var ch = Math.min(sh - 12, (sw - 12) * 16 / 9), cw = ch * 9 / 16;
        var x0 = cx - cw / 2, y0 = cy - ch / 2, ix = x0 + cw * 0.84;
        var s = R(x0, y0, cw, ch, 8, { fill: BODY, s: 2 });
        s += P('M' + n(x0 + cw * 0.14) + ',' + n(y0 + ch * 0.56) + ' C' + n(x0 + cw * 0.14) + ',' +
          n(y0 + ch * 0.44) + ' ' + n(x0 + cw * 0.28) + ',' + n(y0 + ch * 0.4) + ' ' + n(x0 + cw * 0.4) + ',' +
          n(y0 + ch * 0.4) + ' C' + n(x0 + cw * 0.52) + ',' + n(y0 + ch * 0.4) + ' ' + n(x0 + cw * 0.66) + ',' +
          n(y0 + ch * 0.44) + ' ' + n(x0 + cw * 0.66) + ',' + n(y0 + ch * 0.56) + ' Z', { fill: INNER, s: 2 });
        s += C(x0 + cw * 0.4, y0 + ch * 0.3, cw * 0.14, { fill: INNER, s: 2 });
        s += heart(ix, y0 + ch * 0.64, cw * 0.22);
        s += R(ix - cw * 0.1, y0 + ch * 0.74, cw * 0.2, cw * 0.15, 3, { fill: 'none', s: 2 });
        s += L(x0 + cw * 0.12, y0 + ch * 0.86, x0 + cw * 0.58, y0 + ch * 0.86, { s: 2, sc: SUB });
        s += L(x0 + cw * 0.12, y0 + ch * 0.92, x0 + cw * 0.4, y0 + ch * 0.92, { s: 2, sc: SUB });
        return s;
      }],
      qr: ['il-qr', function () {
        var q = 0.6 * u, c = q / 7, ox = cx - q / 2, oy = cy - q / 2, s = '';
        [[0, 0], [4, 0], [0, 4]].forEach(function (p) {
          s += R(ox + p[0] * c + 1, oy + p[1] * c + 1, 3 * c - 2, 3 * c - 2, 1, { fill: 'none', s: 2 });
          s += R(ox + (p[0] + 1) * c, oy + (p[1] + 1) * c, c, c, 0, { fill: WHITE });
        });
        [[3, 0], [3, 2], [5, 3], [6, 2], [3, 4], [4, 5], [6, 5], [5, 6], [3, 6], [2, 3], [0, 3], [4, 3], [6, 6]]
          .forEach(function (p) { s += R(ox + p[0] * c, oy + p[1] * c, c * 0.9, c * 0.9, 0, { fill: WHITE }); });
        return s;
      }],
      app: ['il-app', function () {
        var k = sh / 132, s = '';
        for (var i = 0; i < 3; i++) s += C(sx + (14 + i * 13) * k, sy + 13 * k, 4 * k, { fill: i === 0 ? RED : i === 1 ? YEL : GRN });
        s += L(sx, sy + 26 * k, sx + sw, sy + 26 * k, { s: 2, sc: SUB });
        var fr = [0.42, 0.3, 0.36, 0.24];
        fr.forEach(function (f, j) {
          var y = sy + (46 + j * 20) * k;
          s += L(sx + 0.07 * sw, y, sx + 0.07 * sw + f * sw, y, { s: 3, sc: SUB });
        });
        s += R(sx + 0.62 * sw, sy + 40 * k, 0.3 * sw, 60 * k, 4, { fill: INNER, s: 2 });
        return s;
      }]
    };
  }
  function screenStates(sx, sy, sw, sh, active, kinds) {
    var parts = stateParts(sx, sy, sw, sh);
    return kinds.map(function (k) {
      return G(parts[k][0], parts[k][1](), { off: k !== active });
    }).join('');
  }
  var PHONE_KINDS = ['video', 'play', 'rec', 'check', 'warn', 'shorts', 'qr'];
  var LAPTOP_KINDS = ['video', 'play', 'rec', 'check', 'warn', 'app'];

  /* ---------- phone ---------- */
  function phoneInner(o, ox, oy) {
    var L_ = o.orient === 'landscape';
    var W = L_ ? 250 : 120, H = L_ ? 120 : 250;
    var sx = L_ ? 16 : 10, sy = L_ ? 10 : 16, sw = L_ ? 218 : 100, sh = L_ ? 100 : 218;
    var s = R(2, 2, W - 4, H - 4, 20, { 'class': 'il-body', fill: BODY, s: 4 });
    s += R(sx, sy, sw, sh, 8, { 'class': 'il-screen', fill: INNER });
    s += screenStates(sx, sy, sw, sh, o.screen || 'blank', PHONE_KINDS);
    s += L_ ? C(9, 60, 3, { fill: INNER, s: 2 }) : C(60, 9, 3, { fill: INNER, s: 2 });
    return { w: W, h: H, html: '<g transform="translate(' + (ox || 0) + ',' + (oy || 0) + ')">' + s + '</g>' };
  }
  function phone(o) {
    o = o || {};
    var p = phoneInner(o);
    return SVG('phone', p.w, p.h, p.html);
  }

  /* ---------- tripod ---------- */
  function tripodInner(W, H) {
    var cx = W / 2, plateW = W * 0.54;
    var colH = Math.round((H - 26) * 0.42), hubY = 26 + colH, ly = hubY + 6, by = H - 2;
    var legs = E('polygon', { points: n(cx - 13) + ',' + ly + ' ' + n(cx - 3) + ',' + ly + ' 22,' + by + ' 8,' + by, fill: BODY, s: 3 }) +
      E('polygon', { points: n(cx + 3) + ',' + ly + ' ' + n(cx + 13) + ',' + ly + ' ' + n(W - 8) + ',' + by + ' ' + n(W - 22) + ',' + by, fill: BODY, s: 3 }) +
      E('polygon', { points: n(cx - 5) + ',' + ly + ' ' + n(cx + 5) + ',' + ly + ' ' + n(cx + 4) + ',' + by + ' ' + n(cx - 4) + ',' + by, fill: INNER, s: 3 });
    var s = G('il-legs', legs);
    s += R(cx - 6, 25, 12, colH + 2, 3, { fill: BODY, s: 3 });
    s += R(cx - 16, hubY, 32, 11, 3, { fill: INNER, s: 3 });
    s += G('il-tripod-head', R(cx - 12, 13, 24, 12, 3, { fill: INNER, s: 3 }) +
      R(cx - plateW / 2, 2, plateW, 11, 4, { fill: BODY, s: 4 }));
    return s;
  }
  function tripod() {
    return SVG('tripod', 140, 180, tripodInner(140, 180));
  }
  function phoneTripod(o) {
    o = o || {};
    var land = o.orient === 'landscape';
    var tr, ph;
    if (land) {
      tr = '<g transform="translate(60,116)">' + tripodInner(140, 184) + '</g>';
      ph = phoneInner(o, 5, 0);
      return SVG('phoneTripod', 260, 300, tr + ph.html);
    }
    tr = '<g transform="translate(0,246)">' + tripodInner(140, 114) + '</g>';
    ph = phoneInner(o, 10, 0);
    return SVG('phoneTripod', 140, 360, tr + ph.html);
  }

  /* ---------- laptop / monitor ---------- */
  function laptop(o) {
    o = o || {};
    var s = R(30, 2, 220, 156, 10, { fill: BODY, s: 4 });
    s += R(42, 14, 196, 132, 4, { 'class': 'il-screen', fill: INNER });
    s += screenStates(42, 14, 196, 132, o.screen || 'blank', LAPTOP_KINDS);
    s += P('M4,158 H276 V170 Q276,188 258,188 H22 Q4,188 4,170 Z', { fill: BODY, s: 4 });
    s += L(114, 160, 166, 160, { s: 3 });
    return SVG('laptop', 280, 190, s);
  }
  function monitor(o) {
    o = o || {};
    var s = E('polygon', { points: '160,212 200,212 207,276 153,276', fill: INNER, s: 4 });
    s += R(90, 274, 180, 22, 11, { fill: BODY, s: 4 });
    s += R(2, 2, 356, 214, 12, { fill: BODY, s: 4 });
    s += R(16, 16, 328, 170, 4, { 'class': 'il-screen', fill: INNER });
    s += screenStates(16, 16, 328, 170, o.screen || 'blank', LAPTOP_KINDS);
    s += L(170, 201, 190, 201, { s: 3 });
    return SVG('monitor', 360, 300, s);
  }

  /* ---------- cloud ---------- */
  function cloud(o) {
    o = o || {};
    var s = P('M52,146 C24,146 4,126 4,100 C4,76 22,58 46,56 C50,28 76,6 108,6 C138,6 160,22 168,44 C196,42 216,64 216,92 C216,122 194,146 164,146 Z', { fill: BODY, s: 4 });
    var pts = '110,58 138,90 122,90 122,124 98,124 98,90 82,90';
    var arrow = E('polygon', {
      points: pts, fill: YEL, s: 3, sc: YEL,
      transform: o.arrow === 'down' ? 'rotate(180 110 91)' : false
    });
    s += G('il-arrow', arrow, { off: o.arrow !== 'up' && o.arrow !== 'down' });
    return SVG('cloud', 220, 150, s);
  }

  /* ---------- persons ---------- */
  function personBust(o) {
    o = o || {};
    var cloth = o.tone === 'b' ? PURPLE : INNER;
    var s = R(66, 96, 28, 24, 4, { fill: BODY, s: 3 });
    s += P('M12,166 C12,128 40,112 80,112 C120,112 148,128 148,166 Z', { fill: cloth, s: 4 });
    s += C(80, 58, 44, { 'class': 'il-head', fill: BODY, s: 4 });
    var arcs = [10, 20, 30].map(function (r) {
      var x = 128 + r * 0.766, y1 = 58 - r * 0.643, y2 = 58 + r * 0.643;
      return P('M' + n(x) + ',' + n(y1) + ' A' + r + ',' + r + ' 0 0 1 ' + n(x) + ',' + n(y2), { s: 4, sc: YEL });
    }).join('');
    s += G('il-talk', arcs, { off: true });
    return SVG('personBust', 160, 170, s);
  }
  // 全身象形人：頭、軀幹、雙手、雙腳都是圓角線稿；照「頭 → 軀幹 → 手 → 腳」的順序畫（P.draw 照文件順序一筆一筆畫）
  function pgPerson(o) {
    o = o || {};
    var pose = o.pose || 'stand', cloth = o.tone === 'b' ? PURPLE : o.tone === 'accent' ? YEL : INNER;
    var rot = function (deg, x, y) { return deg ? 'rotate(' + deg + ' ' + x + ' ' + y + ')' : null; };
    var aL = pose === 'walk' ? 18 : 0, aR = pose === 'walk' ? -18 : pose === 'point' ? -100 : 0, lg = pose === 'walk' ? 14 : 0;
    var torso = 'M30,80 Q30,64 46,64 L74,64 Q90,64 90,80 L90,160 Q90,170 80,170 L40,170 Q30,170 30,160 Z';
    var s = C(60, 32, 26, { 'class': 'il-head', fill: BODY, s: 4 });
    s += P(torso, { 'class': 'il-torso', fill: cloth, s: 4 });
    s += G('il-hi', P(torso, { fill: YEL, s: 4 }) + C(60, 32, 26, { fill: BODY, s: 4 }), { off: true });
    s += G('il-arms', R(12, 70, 16, 86, 8, { fill: BODY, s: 4, transform: rot(aL, 20, 78) }) +
      R(92, 70, 16, 86, 8, { fill: BODY, s: 4, transform: rot(aR, 100, 78) }));
    s += G('il-legs', R(36, 168, 20, 112, 10, { fill: BODY, s: 4, transform: rot(lg, 46, 172) }) +
      R(64, 168, 20, 112, 10, { fill: BODY, s: 4, transform: rot(-lg, 74, 172) }));
    return SVG('pgPerson', 120, 284, s);
  }
  // 2.5D 地台：斜投影的厚板（頂面往右上斜 80、厚 60），頂面白底墨線、正面主色、側面淡主色
  function stage() {
    var s = P('M80,2 L958,2 L880,118 L2,118 Z', { 'class': 'il-top', fill: BODY, s: 4 });
    s += P('M880,118 L958,2 L958,62 L880,178 Z', { 'class': 'il-side', fill: INNER, s: 4 });
    s += P('M2,118 L880,118 L880,178 L2,178 Z', { 'class': 'il-front', fill: YEL, s: 4 });
    return SVG('stage', 960, 180, s);
  }
  function personTop() {
    // 俯視：肩膀橢圓、頭圓疊在正中央，下方小三角＝面朝方向（預設朝下／朝鏡頭）
    var s = E('ellipse', { cx: 55, cy: 34, rx: 51, ry: 22, fill: INNER, s: 4 });
    s += C(55, 34, 18, { 'class': 'il-head', fill: BODY, s: 4 });
    s += '<path class="il-face" d="M47 56 L63 56 L55 66 Z" fill="' + YEL + '" stroke="none"/>';
    return SVG('personTop', 110, 72, s);
  }

  /* ---------- desk ---------- */
  function desk() {
    var s = R(2, 2, 316, 146, 14, { 'class': 'il-desk', fill: INNER, s: 4 });
    var lap = R(112, 34, 96, 16, 3, { fill: BODY, s: 3 }) +
      R(106, 52, 108, 72, 6, { fill: BODY, s: 3 }) +
      L(120, 66, 200, 66, { s: 2, sc: SUB }) + L(120, 78, 200, 78, { s: 2, sc: SUB }) +
      L(120, 90, 200, 90, { s: 2, sc: SUB }) +
      R(142, 100, 36, 18, 3, { fill: 'none', s: 2 });
    s += G('il-laptop', lap);
    s += C(258, 46, 12, { fill: BODY, s: 3 });
    return SVG('desk', 320, 150, s);
  }

  /* ---------- cone ---------- */
  function cone(o) {
    o = o || {};
    var ang = +(o.angle || 50), len = +(o.len || 300);
    var half = ang * Math.PI / 360;
    var W = len + 4, H = 2 * len * Math.sin(half) + 4, cy = H / 2;
    var x1 = 2 + len * Math.cos(half), dy = len * Math.sin(half);
    var d = 'M2,' + n(cy) + ' L' + n(x1) + ',' + n(cy - dy) + ' A' + n(len) + ',' + n(len) + ' 0 0 1 ' +
      n(x1) + ',' + n(cy + dy) + ' Z';
    var fill = o.fill === true || o.fill === 'true';
    var s = P(d, {
      'class': 'il-cone', fill: fill ? YEL_SOFT : 'none', s: 4, sc: YEL,
      'stroke-dasharray': '12 10', 'stroke-linecap': 'butt'
    });
    // E() 先寫 stroke-linecap="round"，後寫的 butt 會被瀏覽器忽略重複屬性，故改用 style
    s = s.replace(' stroke-linecap="butt"', '').replace('<path ', '<path style="stroke-linecap:butt" ');
    return SVG('cone', W, H, s);
  }

  /* ---------- waveform ---------- */
  function rng(seed) {
    var a = (seed | 0) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function waveform(o) {
    o = o || {};
    var cnt = Math.max(1, Math.round(+o.bars || 28)), rand = rng(+o.seed || 1);
    var col = o.color === 'yellow' ? YEL : o.color === 'red' ? RED : WHITE;
    var slot = 360 / cnt, bw = Math.max(4, slot * 0.55), s = '';
    for (var i = 0; i < cnt; i++) {
      var env = 0.55 + 0.45 * Math.sin(Math.PI * (i + 0.5) / cnt);
      var h = Math.max(8, 84 * (0.18 + 0.82 * rand()) * env);
      s += E('rect', {
        'class': 'il-bar', x: i * slot + (slot - bw) / 2, y: 45 - h / 2, width: bw, height: h, rx: bw / 2,
        fill: col, s: 2, sc: BODY, style: 'transform-box:fill-box;transform-origin:center'
      });
    }
    return SVG('waveform', 360, 90, s);
  }

  /* ---------- progress / energy ---------- */
  function progress() {
    var s = R(2, 6, 316, 16, 8, { 'class': 'il-track', fill: INNER, s: 2 });
    s += R(5, 9, 310, 10, 5, {
      'class': 'il-fill', fill: YEL, style: 'transform-box:fill-box;transform-origin:left center'
    });
    return SVG('progress', 320, 28, s);
  }
  function energy() {
    var s = R(204, 28, 14, 34, 4, { fill: BODY, s: 4 });
    s += R(2, 8, 202, 74, 14, { 'class': 'il-body', fill: BODY, s: 4 });
    for (var i = 0; i < 5; i++) s += R(16 + i * 36, 22, 30, 46, 4, { 'class': 'il-cell', fill: GRN });
    return SVG('energy', 220, 90, s);
  }

  /* ---------- fileVideo ---------- */
  function fileVideo() {
    var s = P('M14,2 H62 L96,36 V108 Q96,118 86,118 H14 Q4,118 4,108 V12 Q4,2 14,2 Z', { fill: BODY, s: 4 });
    s += P('M62,2 L96,36 H72 Q62,36 62,26 Z', { fill: INNER, s: 3 });
    s += E('polygon', { 'class': 'il-play', points: '40,58 40,94 70,76', fill: YEL, s: 3, sc: YEL });
    return SVG('fileVideo', 100, 120, s);
  }

  /* ---------- window ---------- */
  function windowC(o) {
    o = o || {};
    var s = P('M2,48 V16 Q2,2 16,2 H464 Q478,2 478,16 V48 Z', { fill: BODY });
    s += P('M2,48 H478 V284 Q478,298 464,298 H16 Q2,298 2,284 Z', { fill: INNER });
    s += R(2, 2, 476, 296, 14, { fill: 'none', s: 4 });
    s += L(2, 48, 478, 48, { s: 3 });
    s += C(26, 25, 6, { fill: RED }) + C(46, 25, 6, { fill: YEL }) + C(66, 25, 6, { fill: GRN });
    s += T(240, 33, o.title || '', 22, SUB, 'il-title', 'middle');
    s += G('il-content', '');
    return SVG('window', 480, 300, s);
  }

  /* ---------- searchBar ---------- */
  function searchBar(o) {
    o = o || {};
    var txt = o.text == null ? '' : String(o.text);
    var cx = 92 + textWidth(txt, 32) + 4;
    var s = R(2, 2, 636, 80, 40, { fill: BODY, s: 4 });
    s += C(46, 39, 13, { s: 4 }) + L(56, 49, 66, 59, { s: 4 });
    s += T(92, 53, txt, 32, WHITE, 'il-text');
    s += L(cx, 24, cx, 60, { 'class': 'il-caret', s: 3 });
    return SVG('searchBar', 640, 84, s);
  }

  /* ---------- badge ---------- */
  function badge(o) {
    o = o || {};
    var k = o.kind || 'check', s;
    if (k === 'cross') {
      s = C(36, 36, 34, { fill: RED, s: 4 }) + P('M24,24 L48,48 M48,24 L24,48', { s: 4 });
    } else if (k === 'warn') {
      s = C(36, 36, 34, { fill: YEL, s: 4 }) + L(36, 19, 36, 40, { s: 4, sc: ON_YEL }) +
        C(36, 51, 3, { fill: ON_YEL });
    } else {
      s = C(36, 36, 34, { fill: GRN, s: 4 }) + P('M21,37 L31,47 L51,26', { s: 4 });
    }
    return SVG('badge', 72, 72, G('il-badge', s));
  }

  /* ---------- recPill ---------- */
  function recPill() {
    var s = R(2, 2, 196, 56, 28, { fill: BODY, s: 4 });
    s += C(34, 30, 8, { 'class': 'il-dot', fill: RED });
    s += T(52, 39, 'REC', 24, WHITE, 'il-label');
    s += E('text', {
      x: 112, y: 39, 'font-size': 24, 'font-family': FONT, 'font-weight': 700, fill: SUB,
      'class': 'il-time', style: 'font-variant-numeric:tabular-nums'
    }, '00:00');
    return SVG('recPill', 200, 60, s);
  }

  /* ---------- stopwatch ---------- */
  function stopwatch() {
    var s = R(92, 2, 36, 18, 4, { fill: BODY, s: 4 });
    s += R(100, 18, 20, 16, 3, { fill: INNER, s: 3 });
    s += C(110, 135, 103, { fill: BODY, s: 4 });
    s += C(110, 135, 90, { fill: 'none', s: 4, sc: INNER });
    var ticks = '';
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6, major = i % 3 === 0, r1 = major ? 58 : 66, r2 = 76;
      ticks += L(110 + r1 * Math.sin(a), 135 - r1 * Math.cos(a), 110 + r2 * Math.sin(a), 135 - r2 * Math.cos(a),
        { s: major ? 3 : 2 });
    }
    s += G('il-ticks', ticks);
    // sweep：刻意不用 non-scaling-stroke，pathLength=100 讓 dashoffset 100→0 剛好一圈
    s += E('circle', {
      'class': 'il-sweep', cx: 110, cy: 135, r: 90, fill: 'none', stroke: YEL, 'stroke-width': 4,
      pathLength: 100, 'stroke-dasharray': 100, 'stroke-dashoffset': 100,
      transform: 'rotate(-90 110 135)'
    });
    s += G('il-hand', L(110, 135, 110, 70, { s: 4 }),
      { style: 'transform-box:view-box;transform-origin:110px 135px' });
    s += C(110, 135, 7, { fill: BODY, s: 3 });
    return SVG('stopwatch', 220, 240, s);
  }

  /* ---------- hourglass ---------- */
  // 上下兩片底座＋一體成形的玻璃（兩個對稱的漏斗，肩膀是圓角、壁是直線，腰寬 16）。壁的延長線交在 (100,156.5)／(100,143.5)：
  // 沙以那一點等比縮放，邊緣剛好一直貼著玻璃壁。畫的順序：玻璃底色 → 沙 → 玻璃描邊（描邊蓋住沙的邊）→ 底座
  function hourglass(o) {
    o = o || {};
    var st = o.sand === 'flow' || o.sand === 'bottom' ? o.sand : 'top';
    var glass = 'M32 24L168 24L168 40Q168 50.1 154 72L108 144L108 156L154 228Q168 249.9 168 260L168 276L32 276L32 260Q32 249.9 46 228L92 156L92 144L46 72Q32 50.1 32 40Z';
    var s = P(glass, { fill: INNER });
    // 上面的沙：水平面 y=84，沿著壁到腰；flow 時縮到 0.62（以壁的交點為中心）
    s += P('M53.7 84L146.3 84L108 144L92 144Z', { 'class': 'il-sandtop', fill: YEL, off: st === 'bottom',
      transform: st === 'flow' ? 'translate(100 156.5) scale(0.62) translate(-100 -156.5)' : null });
    // 細流：腰到底
    s += R(98.5, 150, 3, 124, 1.5, { 'class': 'il-stream', fill: YEL, off: st !== 'flow' });
    // 下面的沙堆：貼著底、中間隆起；flow 時 0.7 倍（以底邊中點為中心）
    s += P('M46 276L154 276Q132 238 100 230Q68 238 46 276Z', { 'class': 'il-sandbot', fill: YEL, off: st === 'top',
      transform: st === 'flow' ? 'translate(100 276) scale(0.7) translate(-100 -276)' : null });
    s += P(glass, { 'class': 'il-glass', fill: 'none', s: 4 });
    s += R(16, 4, 168, 20, 8, { fill: BODY, s: 4 });
    s += R(16, 276, 168, 20, 8, { fill: BODY, s: 4 });
    return SVG('hourglass', 200, 300, s);
  }

  /* ---------- bookmark ---------- */
  function bookmark(o) {
    o = o || {};
    var saved = o.saved === true || o.saved === 'true';
    var icon = 'M36,20 H56 V52 L46,43 L36,52 Z';
    var s = R(2, 2, 216, 68, 34, { fill: BODY, s: 4 });
    s += G('il-off', P(icon, { fill: 'none', s: 3 }) + T(76, 47, '儲存', 30, WHITE), { off: saved });
    s += G('il-on', P(icon, { fill: YEL, s: 3, sc: YEL }) + T(76, 47, '已儲存', 30, WHITE), { off: !saved });
    return SVG('bookmark', 220, 72, s);
  }

  /* ---------- 註冊 / mount ---------- */
  var COMP = {
    phone: phone, tripod: tripod, phoneTripod: phoneTripod, laptop: laptop, monitor: monitor,
    cloud: cloud, personBust: personBust, pgPerson: pgPerson, personTop: personTop, desk: desk, stage: stage, cone: cone,
    waveform: waveform, progress: progress, energy: energy, fileVideo: fileVideo, window: windowC,
    searchBar: searchBar, badge: badge, recPill: recPill, stopwatch: stopwatch, hourglass: hourglass, bookmark: bookmark
  };
  var BUILTIN = Object.keys(COMP);
  var ILLUS = window.ILLUS = {};
  Object.keys(COMP).forEach(function (k) { ILLUS[k] = COMP[k]; });
  ILLUS.textWidth = textWidth;

  // 專案自己的元件（用法三）：不能蓋掉內建元件與 ILLUS 的方法
  ILLUS.register = function (name, fn) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(String(name))) throw new Error('[ILLUS] 元件名要小寫英文開頭、只用英數（camelCase）：' + name);
    if (typeof fn !== 'function') throw new Error('[ILLUS] register(' + name + ', fn)：fn 要是回傳 SVG 字串的函式');
    if (BUILTIN.indexOf(name) >= 0 || (ILLUS.hasOwnProperty(name) && !COMP.hasOwnProperty(name))) {
      throw new Error('[ILLUS] ' + name + ' 是內建元件或 ILLUS 的方法，不能覆蓋；換一個名字');
    }
    COMP[name] = fn;
    ILLUS[name] = fn;
    return ILLUS;
  };

  // data-illus-src：同步讀檔（理由見檔頭用法三），同一個網址只讀一次
  var SRC_CACHE = {};
  function readSvg(url) {
    if (SRC_CACHE.hasOwnProperty(url)) return SRC_CACHE[url];
    var txt = null;
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, false);
      x.send(null);
      if ((x.status === 200 || x.status === 0) && /<svg[\s>]/i.test(x.responseText || '')) txt = x.responseText;
    } catch (e) { txt = null; }
    SRC_CACHE[url] = txt;
    return txt;
  }
  function mountSrc(el) {
    var url = el.getAttribute('data-illus-src');
    var txt = readSvg(url);
    if (txt == null) {
      console.error('[ILLUS] 讀不到 data-illus-src="' + url + '"：檔案要放在 work/hyperframes/' + url +
        '（路徑相對主合成 index.html）；用 file:// 直接開檔也讀不到，要用 hyperframes preview／snapshot');
      el.innerHTML = '';
      el.classList.add('il');   // 算掛過：之後的 mount() 不再重報，{force:true} 才重試
      return;
    }
    el.innerHTML = txt.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim();
    el.classList.add('il');
  }

  var NUM = ['bars', 'seed', 'angle', 'len'], BOOL = ['fill', 'saved'];
  ILLUS.mount = function (root, opt) {
    root = root || document;
    var force = !!(opt && opt.force);
    root.querySelectorAll('[data-illus], [data-illus-src]').forEach(function (el) {
      if (!force && el.classList.contains('il')) return;
      if (el.hasAttribute('data-illus-src')) { mountSrc(el); return; }
      var name = el.dataset.illus;
      if (!COMP[name]) { console.warn('[ILLUS] unknown component: ' + name); return; }
      var o = {};
      for (var k in el.dataset) {
        if (k === 'illus') continue;
        var v = el.dataset[k];
        if (NUM.indexOf(k) >= 0) v = parseFloat(v);
        else if (BOOL.indexOf(k) >= 0) v = (v === 'true' || v === '' || v === '1');
        o[k] = v;
      }
      el.innerHTML = COMP[name](o);
      el.classList.add('il');
    });
  };

  ILLUS.mount();
})();

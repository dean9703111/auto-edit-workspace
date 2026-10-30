/* ==========================================================================
   動畫情境庫 動態 API（scene-motion.js）— window.SceneMotion
   作者定調：以淡入為底，只加「有理由的方向」；位移小、減速曲線（power2.out）、不回彈、同一時間只有一個方向在動。
   側邊欄面板推入是唯一的大位移。離場一律淡出（不反向飛走）。

   用法（段內，GSAP 之後載入）：
     const tl = gsap.timeline({ paused: true });
     const P = SceneMotion(tl);
     P.reveal('#gCard', 0);                       // 下方字卡外殼：遮罩由左往右揭開
     P.rise('#gCard .sc-lt__body', 0.15);        // 內容：淡入＋上漂 8
     P.out('#gCard', D - P.OUT).end(D);           // 整組淡出 0.4
     window.__timelines["seg06"] = tl;

   API（全部 seek-safe：只往 paused timeline 加 fromTo，絕對值、無隨機、無 repeat）
     P.in(sel, at, {dur, stagger})   淡入 opacity 0→1，IN 0.5s、sine.out；stagger＝同組依序間隔
     P.out(sel, at, {dur, stagger})  淡出 opacity 1→0，OUT 0.4s、sine.in（所有情境的離場）
     P.swap(outSel, inSel, at, {dur})原地交叉淡化：同一時間 out（0.4）＋ in（0.5）——同位置換內容、沒有順序（全畫面子版型）
     P.sideIn(sel, at)               側邊欄面板 x −960 → 0，PUSH 0.7s、ease＝P.pushEase
     P.sideOut(sel, at)              側邊欄面板 x 0 → −960，同上
     P.pushEase(p)                   與 tools/side_shift.py 相同的 9 點（steps=8）easeInOutSine 分段線性曲線：
                                     e_i ＝ −(cos(π·i/8) − 1)/2，i＝0..8，點間線性。剪映只能寫線性關鍵幀，兩邊用同一組點才逐幀一致
     P.end(dur)                      把時間軸撐到 root 長度（最後一個 tween 早於 root 時長時必加，pitfalls §41）

     ── v2 進場（依元件性質選；完成態一律 x／y＝0、clip 全開，回到整數 px 設計位置）──
     P.drift(sel, at, {dx, dur, stagger})  貼邊元件：從所貼的那一側小幅滑入＋淡入。dx 預設 +16（右側元件從右來）；
                                     左側元件傳 {dx: -16}。0.5s power2.out
     P.reveal(sel, at, {dur})        浮動卡外殼：clip-path inset 由左往右揭開＋淡入，卡本身不動。0.55s power2.out
                                     （sel 的盒子要包住所有可見層——.sc-lt 的外框盒本來就是聯集）
     P.rise(sel, at, {dy, dur, stagger})   內容／第二層新訊息：淡入＋上漂。dy 預設 8，0.5s power2.out
     P.maskUp(sel, at, {dur, stagger})     標題字：字從自己盒子的下緣「看不見的線」浮出（yPercent 100→0，
                                     同步把 clip-path 底部 100%→0%，視窗固定在完成位置），外框不動。0.6s power2.out
                                     sel 要是 block／flex item（inline 元素吃不到 transform）
     P.axis(outSel, inSel, at, {dur, dx, lag})  同位置換內容、有順序（Step 1→2、標題條列換條）：
                                     舊的往左淡出 12、新的從右淡入 12；0.45s power2.out，新的晚 0.1
     ── 圖示描線（作者規則「圖示先行」：圖示是這一拍的主角時，把線描出來，取代單純淡入）──
     P.stroke(sel, at, {dur, stagger, keepDash})  sel＝形狀元素（path／circle／rect／line…；build 貼的圖示已帶 class="stroke-draw" pathLength="1"，
                                     自己貼的 svg 沒有 pathLength 會自動補上）。
                                     strokeDashoffset 1→0，0.7s power2.inOut；stagger＝多個形狀依序描。起點另有 0.001s 的 opacity 0→1
                                     （round 線頭的零長度虛線會在起點留一個圓點）。描完那一拍 strokeDasharray 設回 none：Chrome 依 pathLength
                                     換算的虛線比實際路徑短一點，不設回去弧線終點會留缺口（作者：「最後一筆沒有閉環」）。之後還要反向擦掉的線帶 keepDash
     P.icon(sel, at, {dur, stagger})  sel＝圖示的容器（.sc-icon 或任何包住 <svg> 的元素）：每個容器的所有線同時描，多個容器依 stagger 錯開
                                     （stagger 預設 0＝一起描）。容器本身（圖示圓）先用 rise／in 進場，P.BEAT 後再描線
     P.check(sel, at, {dur})          圓環＋打勾：sel＝圖示容器（圖示用 circle-check 這類「圓＋勾」）。圓先描，勾晚 0.25s 描。
                                     只用在總結、回顧清單這種「完成／確認」的語意；流程圖的站不要用（作者：走過只換框色，不加打勾）
     ── v3 情境動畫語彙（第二層 custom 用；作者 hf-motion.js 的 morph／push／count／bar 對應版，同樣 seek-safe）──
     P.morph(sel, at, to, {from, dur, ease})  同一個容器變形：寬高或位置（width／height／left／top…任何數值屬性）從 from 補間到 to。
                                     0.7s、back.out(1.15)（過衝很小）。to 例 {width: 1100, height: 420}。要能往回 seek 就帶 from；
                                     連續多次變形時，後一次的 from 寫成前一次的 to。沒帶 from 時以「建立當下的值」當起點（只有第一次變形安全）
     P.push(sel, at, {to, from, origin, dur, ease})  慢速鏡頭推進：scale from→to（預設 1→1.4）、origin 預設 "50% 50%"、2.4s、sine.inOut。
                                     只用在全畫面；被縮放的元素（含祖先）不要設 will-change（文字會糊）；tween 已帶 force3D:false。
                                     推進後的座標＝origin＋scale×(靜止座標−origin)，要自己算有沒有出界（右緣 ≤ 1300 的全畫面主內容尤其注意）
     P.count(sel, at, {from, to, dur, decimals, prefix, suffix, comma, ease})  數字計數器：自訂 GSAP plugin（scCount）每次 render 直接寫元素的 textContent
                                     （不靠 onUpdate／proxy：HyperFrames 有的 seek 路徑 suppressEvents＝true，callback 不會跑）。
                                     預設 0→100、1.2s、power2.out；起點之前顯示 from、終點之後顯示 to，往回 seek 也對。
                                     自動加 font-variant-numeric: tabular-nums，數字寬度固定不抖；元素要放得下最寬的那個值（固定寬度＋置右／置中）
     P.bar(sel, at, {from, to, dur, ease})  量條長度：scaleX from→to（預設 0→1）、transform-origin 左緣、0.8s power2.out。
                                     to 可以大於 1＝「撐破」軌道（要讓條超出軌道，軌道不能 overflow:hidden）。條的圓角用小值（scaleX 會把圓角拉橫）
   常數：P.IN 0.5／P.OUT 0.4／P.STEP 0.35／P.HOLD 0.6／P.PUSH 0.7／P.SHIFT 480／P.SIDE 960
         P.DRIFT 16／P.RISE 8／P.AXIS 12／P.REVEAL 0.55／P.MASK 0.6／P.AXIS_DUR 0.45／P.AXIS_LAG 0.1
         P.STROKE 0.7（描線）／P.CHECK_LAG 0.25（打勾晚圓環多久）
         P.MORPH 0.7／P.ZOOM 2.4（鏡頭推進）／P.COUNT 1.2／P.BAR 0.8
         P.BEAT 0.15（外殼 → 內容）／P.READ 1.2（問句可讀後再停）／P.HOLD_END 1.5（最後完整內容最少停留）

   整數 px：SceneMotion(tl, root?) 會在字型載入後（傳 root 時只量 root 內的元素）把 .sc-lt__card、.sc-chtag__name、頭銜、[data-snap-width] 的寬度用右內距補成偶數整數 px
   （max-content 的字寬是小數，卡的右緣／右錨定角標的左緣會落在半像素）。v1 class 不受影響。

   seek-safe 的細節：同一元素第一次被 tween 的屬性用 immediateRender:true（進場前就是初始狀態），
   一個 tween 同時動多個屬性時，只有「每個屬性都是第一次」才 immediateRender；之後同一元素、同一屬性的 tween
   一律 immediateRender:false（pitfalls §22：第二段 fromTo 若 immediateRender 會在建立時把第一段的初始狀態蓋掉）。
   由本檔自動判斷，不必手寫。at 一律是秒數（數字）；綁口播時傳 T.at(句號)。
   ========================================================================== */
(function () {
  var KNOTS = 8;
  var E = [];
  for (var i = 0; i <= KNOTS; i++) E.push(-(Math.cos(Math.PI * i / KNOTS) - 1) / 2);

  function pushEase(p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    var x = p * KNOTS, k = Math.floor(x);
    return E[k] + (E[k + 1] - E[k]) * (x - k);
  }

  // v2 整數 px：字寬是小數，width:max-content 的卡會讓「右緣」（左錨定）或「左緣」（右錨定／置中）落在半像素，直邊與框線發糊。
  // 字型載入後把 v2 元件的寬度補成偶數整數 px（偶數 → 置中時左右緣也是整數）。只動 v2 class 與標了 data-snap-width 的元素；
  // document.fonts.ready 的回呼在 render／audit／shots 等它之前就先執行，seek 前版面已定。
  var SNAP_SEL = '.sc-lt__metaitem > span, .sc-lt__card, .sc-chtag__name, [data-snap-width]';
  // 每個範圍只量一次：傳了 root 就只量 root 內的元素（子合成陸續掛上，各自量自己的卡）；
  // 沒傳 root 時範圍是整份 document，只跑一次，和原本的全域旗標行為相同。
  var snapped = new WeakSet();
  function snapWidths(root) {
    var scope = root || document;
    if (snapped.has(scope)) return; snapped.add(scope);
    var run = function () {
      // 反向文件順序＝先子後父：內層補完寬度，外層（卡）再量，才不會被撐出內距。
      // 補的是內距（不寫死 width）：元素仍是 max-content，audit 不會把它當成「固定寬度＋nowrap」。
      Array.prototype.slice.call(scope.querySelectorAll(SNAP_SEL)).reverse().forEach(function (el) {
        el.style.paddingLeft = ''; el.style.paddingRight = '';
        var cs = getComputedStyle(el), w = el.getBoundingClientRect().width;
        var d = Math.ceil(w / 2 - 0.001) * 2 - w;
        if (d < 0.001) return;
        var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
        if (el.matches('.sc-lt__metaitem > span')) { el.style.paddingLeft = (pl + d / 2) + 'px'; el.style.paddingRight = (pr + d / 2) + 'px'; }
        else el.style.paddingRight = (pr + d) + 'px';   // 右側補：左錨定的卡內容線不動
      });
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run); else run();
  }

  // 數字計數 plugin（P.count 用）：值＝{from, to, decimals, comma, prefix, suffix}；render(ratio) 依緩動後的進度算出數字寫進 textContent
  var fmtCount = function (v, c) {
    var s = Number(v).toFixed(c.decimals);
    if (c.comma) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
    return c.prefix + s + c.suffix;
  };
  var registerCount = function () {
    if (typeof gsap === 'undefined' || gsap.plugins.scCount) return;
    gsap.registerPlugin({
      name: 'scCount',
      init: function (target, value) { this.t = target; this.c = value; },
      render: function (ratio, data) { data.t.textContent = fmtCount(data.c.from + (data.c.to - data.c.from) * ratio, data.c); }
    });
  };

  window.SceneMotion = function (tl, root) {
    registerCount();
    snapWidths(root);
    var IN = 0.5, OUT = 0.4, STEP = 0.35, HOLD = 0.6, PUSH = 0.7, SHIFT = 480, SIDE = 960;
    var DRIFT = 16, RISE = 8, AXIS = 12, REVEAL = 0.55, MASK = 0.6, AXIS_DUR = 0.45, AXIS_LAG = 0.1;
    var BEAT = 0.15, READ = 1.2, HOLD_END = 1.5;
    var STROKE = 0.7, CHECK_LAG = 0.25;
    var MORPH = 0.7, ZOOM = 2.4, COUNT = 1.2, BAR = 0.8;
    var EASE = 'power2.out';
    var SHAPES = 'path, circle, rect, ellipse, line, polyline, polygon';
    var seen = {};
    var els = function (sel) { return gsap.utils.toArray(sel); };
    // 同一元素同一屬性的第一個 tween 才 immediateRender
    var first = function (prop, el) {
      var s = seen[prop] || (seen[prop] = new Set());
      var f = !s.has(el); s.add(el); return f;
    };
    // 多屬性：每個屬性都是第一次才 immediateRender（先全部查完再登記）
    var firstAll = function (props, el) {
      var f = props.every(function (p) { return !(seen[p] && seen[p].has(el)); });
      props.forEach(function (p) { first(p, el); });
      return f;
    };

    var fade = function (sel, at, from, to, dur, ease, stagger) {
      els(sel).forEach(function (el, i) {
        tl.fromTo(el, { opacity: from }, { opacity: to, duration: dur, ease: ease, immediateRender: first('opacity', el) }, at + i * (stagger || 0));
      });
    };
    var push = function (sel, at, from, to) {
      els(sel).forEach(function (el) {
        tl.fromTo(el, { x: from }, { x: to, duration: PUSH, ease: pushEase, immediateRender: first('x', el) }, at);
      });
    };
    // 通用：from → to（多屬性），每個元素依 stagger 排開
    var move = function (sel, at, from, to, dur, ease, stagger) {
      var props = Object.keys(from);
      els(sel).forEach(function (el, i) {
        var t = { duration: dur, ease: ease, immediateRender: firstAll(props, el) };
        for (var k in to) t[k] = to[k];
        tl.fromTo(el, Object.assign({}, from), t, at + i * (stagger || 0));
      });
    };
    var opt = function (o, k, d) { return o && o[k] != null ? o[k] : d; };
    // 描線：每個形狀各自 tween（first() 才判斷得出同一元素第二次被描的 immediateRender）
    var draw = function (shapes, at, dur, stagger, keepDash) {
      shapes.forEach(function (el, i) {
        var t = at + i * (stagger || 0);
        // 第二層 custom 直接貼 icons.json 的 svg 時沒有 pathLength：補上，虛線 1 才等於整條線
        if (!el.hasAttribute('pathLength')) el.setAttribute('pathLength', '1');
        tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.001, ease: 'none', immediateRender: first('opacity', el) }, t);
        tl.fromTo(el, { strokeDasharray: 1, strokeDashoffset: 1 },
          { strokeDasharray: 1, strokeDashoffset: 0, autoRound: false, duration: dur, ease: 'power2.inOut',
            immediateRender: firstAll(['strokeDasharray', 'strokeDashoffset'], el) }, t);
        if (!keepDash) tl.set(el, { strokeDasharray: 'none' }, t + dur);
      });
    };
    // 數字格式：decimals 位小數、可選千分位，前後綴原樣接上
    var fmtNum = function (v, o) {
      var s = Number(v).toFixed(opt(o, 'decimals', 0));
      if (o && o.comma) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
      return opt(o, 'prefix', '') + s + opt(o, 'suffix', '');
    };
    var shapesIn = function (box) { return Array.prototype.slice.call(box.querySelectorAll(SHAPES)); };

    var P = {
      tl: tl, IN: IN, OUT: OUT, STEP: STEP, HOLD: HOLD, PUSH: PUSH, SHIFT: SHIFT, SIDE: SIDE,
      DRIFT: DRIFT, RISE: RISE, AXIS: AXIS, REVEAL: REVEAL, MASK: MASK, AXIS_DUR: AXIS_DUR, AXIS_LAG: AXIS_LAG,
      BEAT: BEAT, READ: READ, HOLD_END: HOLD_END, STROKE: STROKE, CHECK_LAG: CHECK_LAG,
      MORPH: MORPH, ZOOM: ZOOM, COUNT: COUNT, BAR: BAR,
      pushEase: pushEase,
      knots: E.slice(),
      in: function (sel, at, o) { o = o || {}; fade(sel, at, 0, 1, o.dur != null ? o.dur : IN, 'sine.out', o.stagger); return P; },
      out: function (sel, at, o) { o = o || {}; fade(sel, at, 1, 0, o.dur != null ? o.dur : OUT, 'sine.in', o.stagger); return P; },
      swap: function (outSel, inSel, at, o) {
        o = o || {};
        fade(outSel, at, 1, 0, o.dur != null ? o.dur : OUT, 'sine.in');
        fade(inSel, at, 0, 1, o.dur != null ? o.dur : IN, 'sine.out');
        return P;
      },
      sideIn: function (sel, at) { push(sel, at, -SIDE, 0); return P; },
      sideOut: function (sel, at) { push(sel, at, 0, -SIDE); return P; },
      end: function (dur) { tl.set({}, {}, dur); return P; },

      // ── v2 進場（§2.1）──
      drift: function (sel, at, o) {
        move(sel, at, { x: opt(o, 'dx', DRIFT), opacity: 0 }, { x: 0, opacity: 1 }, opt(o, 'dur', IN), EASE, opt(o, 'stagger', 0));
        return P;
      },
      reveal: function (sel, at, o) {
        move(sel, at, { clipPath: 'inset(0% 100% 0% 0%)', opacity: 0 }, { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }, opt(o, 'dur', REVEAL), EASE, 0);
        return P;
      },
      rise: function (sel, at, o) {
        move(sel, at, { y: opt(o, 'dy', RISE), opacity: 0 }, { y: 0, opacity: 1 }, opt(o, 'dur', IN), EASE, opt(o, 'stagger', 0));
        return P;
      },
      maskUp: function (sel, at, o) {
        move(sel, at, { yPercent: 100, clipPath: 'inset(0% 0% 100% 0%)' }, { yPercent: 0, clipPath: 'inset(0% 0% 0% 0%)' }, opt(o, 'dur', MASK), EASE, opt(o, 'stagger', 0));
        return P;
      },
      axis: function (outSel, inSel, at, o) {
        var d = opt(o, 'dur', AXIS_DUR), dx = opt(o, 'dx', AXIS);
        move(outSel, at, { x: 0, opacity: 1 }, { x: -dx, opacity: 0 }, d, EASE, 0);
        move(inSel, at + opt(o, 'lag', AXIS_LAG), { x: dx, opacity: 0 }, { x: 0, opacity: 1 }, d, EASE, 0);
        return P;
      },

      // ── v3 情境動畫語彙 ──
      morph: function (sel, at, to, o) {
        var props = Object.keys(to || {});
        els(sel).forEach(function (el) {
          var from = {};
          props.forEach(function (k) { from[k] = o && o.from && o.from[k] != null ? o.from[k] : gsap.getProperty(el, k); });
          var t = { duration: opt(o, 'dur', MORPH), ease: opt(o, 'ease', 'back.out(1.15)'), immediateRender: firstAll(props, el) };
          props.forEach(function (k) { t[k] = to[k]; });
          tl.fromTo(el, from, t, at);
        });
        return P;
      },
      push: function (sel, at, o) {
        var origin = opt(o, 'origin', '50% 50%');
        els(sel).forEach(function (el) {
          tl.fromTo(el, { scale: opt(o, 'from', 1), transformOrigin: origin },
            { scale: opt(o, 'to', 1.4), transformOrigin: origin, force3D: false, duration: opt(o, 'dur', ZOOM), ease: opt(o, 'ease', 'sine.inOut'),
              immediateRender: firstAll(['scale'], el) }, at);
        });
        return P;
      },
      count: function (sel, at, o) {
        var cfg = { from: opt(o, 'from', 0), to: opt(o, 'to', 100), decimals: opt(o, 'decimals', 0), comma: !!(o && o.comma),
                    prefix: opt(o, 'prefix', ''), suffix: opt(o, 'suffix', '') };
        els(sel).forEach(function (el) {
          el.style.fontVariantNumeric = 'tabular-nums';
          // 自訂 GSAP plugin：每次 render（含 suppressEvents 的 seek、immediateRender）都直接寫 textContent，不靠 onUpdate／proxy
          tl.to(el, { scCount: cfg, duration: opt(o, 'dur', COUNT), ease: opt(o, 'ease', 'power2.out'), immediateRender: first('scCount', el) }, at);
        });
        return P;
      },
      bar: function (sel, at, o) {
        move(sel, at, { scaleX: opt(o, 'from', 0), transformOrigin: '0% 50%' }, { scaleX: opt(o, 'to', 1) }, opt(o, 'dur', BAR), opt(o, 'ease', EASE), 0);
        return P;
      },

      // ── 圖示描線 ──
      stroke: function (sel, at, o) {
        draw(els(sel), at, opt(o, 'dur', STROKE), opt(o, 'stagger', 0), !!(o && o.keepDash));
        return P;
      },
      icon: function (sel, at, o) {
        var dur = opt(o, 'dur', STROKE), st = opt(o, 'stagger', 0);
        els(sel).forEach(function (box, i) { draw(shapesIn(box), at + i * st, dur, 0, false); });
        return P;
      },
      check: function (sel, at, o) {
        var dur = opt(o, 'dur', 0.45);
        els(sel).forEach(function (box) {
          var s = shapesIn(box);
          var ring = s.filter(function (el) { return el.tagName.toLowerCase() === 'circle'; });
          var rest = s.filter(function (el) { return ring.indexOf(el) < 0; });
          draw(ring, at, dur, 0, false);
          draw(rest, at + CHECK_LAG, Math.max(0.3, dur - 0.1), 0, false);
        });
        return P;
      },
    };
    return P;
  };
  window.SceneMotion.pushEase = pushEase;
  window.SceneMotion.knots = E.slice();
})();

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
   常數：P.IN 0.5／P.OUT 0.4／P.STEP 0.35／P.HOLD 0.6／P.PUSH 0.7／P.SHIFT 480／P.SIDE 960
         P.DRIFT 16／P.RISE 8／P.AXIS 12／P.REVEAL 0.55／P.MASK 0.6／P.AXIS_DUR 0.45／P.AXIS_LAG 0.1
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

  window.SceneMotion = function (tl, root) {
    snapWidths(root);
    var IN = 0.5, OUT = 0.4, STEP = 0.35, HOLD = 0.6, PUSH = 0.7, SHIFT = 480, SIDE = 960;
    var DRIFT = 16, RISE = 8, AXIS = 12, REVEAL = 0.55, MASK = 0.6, AXIS_DUR = 0.45, AXIS_LAG = 0.1;
    var BEAT = 0.15, READ = 1.2, HOLD_END = 1.5;
    var EASE = 'power2.out';
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

    var P = {
      tl: tl, IN: IN, OUT: OUT, STEP: STEP, HOLD: HOLD, PUSH: PUSH, SHIFT: SHIFT, SIDE: SIDE,
      DRIFT: DRIFT, RISE: RISE, AXIS: AXIS, REVEAL: REVEAL, MASK: MASK, AXIS_DUR: AXIS_DUR, AXIS_LAG: AXIS_LAG,
      BEAT: BEAT, READ: READ, HOLD_END: HOLD_END,
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
    };
    return P;
  };
  window.SceneMotion.pushEase = pushEase;
  window.SceneMotion.knots = E.slice();
})();

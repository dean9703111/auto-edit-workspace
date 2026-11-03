/* SceneLayout：版面 helper（specs/012-layout/brief.md §2；契約 specs/contracts/motion.md §8）
 *
 * 弱模型只寫宣告、不寫座標：
 *   <div id="xsc-stage" data-layout="row" data-gap="xl">          ← 容器（內容區）
 *     <div id="xsc-phone" class="xsc-it" data-slot>…</div>          ← 參與排版的元件（data-slot）
 *     <div id="xsc-ok" class="xsc-it xsc-side" data-slot data-row="2">…</div>
 *     <svg id="xsc-lines" data-links="xsc-phone>xsc-cloud"></svg>   ← 連接線（產生 <path id="xsc-phone-xsc-cloud">）
 *   </div>
 *
 *   data-layout  row（同列等距、底對齊＝有標籤的標籤同一條線、整列水平置中）／col（垂直等距、插圖中線 x 對齊）／
 *                cols-2（兩欄等寬，欄間 gap-lg）／grid-2x2（等寬等高格）／free（不排；audit 照樣量）
 *   data-gap     xxl（160，一對元件要拉開）／xl／lg／md／sm（--sc-gap-*）；none＝0（人站在桌子後面這種疊在一起的）
 *   data-justify start／center（預設）／end：橫向靠哪邊。最外層群組靠左（右）內距 --sc-pad-card、或置中；col 裡的元件左（右）邊對齊、或插圖中線對齊
 *   data-align   center（預設：群組在內容區上下置中）／top（靠上，上內距 --sc-pad-card-y）／middle（置中＋row 改成插圖中線對齊）
 *   data-row     row 排法的第幾列（列與列之間 gap-lg）
 *   data-slot    參與排版的元件；本身也有 data-layout 的＝巢狀群組（大小＝裡面排好的外框）
 *   data-links   a>b（有箭頭）、a-b（沒箭頭），空白隔開；線畫在兩個元件外框邊的中點之間，端點離外框 --sc-link-gap，
 *                箭頭頭 --sc-link-head（另一條 path <a>-<b>-head，本體描完時淡入）；同列水平、同欄垂直（直線在兩個插圖重疊段的正中）、其他 L 形（先水平再垂直）；path id＝<a>-<b>（P.stroke 用）
 *
 * 規則：mount 時算一次（ILLUS.mount 之後、SceneMotion(tl, root) 建立時自動跑；{force:true} 重排），不進 timeline，
 *   亂序 seek 不受影響；量版面用 offsetWidth／offsetHeight（祖先縮放、進場的 transform 都不算）；插圖描邊外擴 2px 不算進外框；
 *   群組起點貼齊 --sc-grid（8），組內位置是整數 px（等距與中線優先）；相鄰元件放大 SCALE_MAX（1.1）後也不互碰。
 *   元件的「錨點」＝它直接包著的插圖（[data-illus]／[data-illus-src]），沒有就是元件自己；中線對錨點。
 *   連接線端點在元件外框（含標籤）沿線方向的邊外 --sc-link-gap；直線的另一軸在兩個錨點重疊段的正中，L 形對各自錨點中線。
 *
 * API：SceneLayout.apply(root, {force})、SceneLayout.measure(root) → 給 audit（lib/audit-layout.mjs）的 JSON
 *      （容器、slot 外框／錨點／標籤、走位過的 slot 另帶排版時的外框 home、data-links 的線與手寫的連接線）、
 *      SceneLayout.box(el, ref) → el 相對 ref 的 [x, y, w, h]（版面座標，不含 transform）、SceneLayout.token(name)
 */
(function () {
  var DEF = { grid: 8, 'pad-card': 48, 'pad-card-y': 40, 'gap-xxl': 160, 'gap-xl': 96, 'gap-lg': 48, 'gap-md': 24, 'gap-sm': 16, 'link-gap': 12, 'link-head': 16 };
  var SCALE_MAX = 1.1;
  var GAP_DEFAULT = { row: 'xl', col: 'md', 'cols-2': 'lg', 'grid-2x2': 'lg' };
  // el：從這個元素讀（CSS 變數會繼承：情境動畫 x-* 的內距比字卡大，見 kit/scene.css）；沒給就讀 :root
  var token = function (name, el) {
    var v = NaN;
    try { v = parseFloat(getComputedStyle(el || document.documentElement).getPropertyValue('--sc-' + name)); } catch (e) { /* 沒有 document */ }
    return v >= 0 ? v : DEF[name];
  };
  var snap = function (v) { var g = token('grid') || 1; return Math.round(v / g) * g; };
  // 版面座標（offsetLeft 鏈，不含 transform；每一層 offsetParent 的框線 clientLeft／Top 要加回去，卡片 2px 框線才不會差 2px）
  var abs = function (el) {
    var x = 0, y = 0;
    for (var e = el; e; e = e.offsetParent) { x += e.offsetLeft || 0; y += e.offsetTop || 0; if (e.offsetParent) { x += e.offsetParent.clientLeft || 0; y += e.offsetParent.clientTop || 0; } }
    return [x, y];
  };
  // el 相對 ref 內容區（padding box，left／top 與 svg 的 0, 0 都從這裡算）的 [x, y, w, h]
  var box = function (el, ref) {
    var a = abs(el), b = ref ? abs(ref) : [0, 0];
    return [a[0] - b[0] - (ref ? ref.clientLeft || 0 : 0), a[1] - b[1] - (ref ? ref.clientTop || 0 : 0), el.offsetWidth, el.offsetHeight];
  };
  var kids = function (c) { return Array.prototype.filter.call(c.children, function (e) { return e.hasAttribute('data-slot') && e.offsetWidth + e.offsetHeight > 0; }); };
  var anchorOf = function (s) { return s.querySelector(':scope > [data-illus], :scope > [data-illus-src]') || s; };
  // 標籤＝class 有 lbl 的直接子元素（.xsc-lbl），沒有就取第一個有字的（插圖、子元件不算；掛在標籤下面的膠囊跟著標籤走，不另外算）
  var labelOf = function (s, a) {
    var k = Array.prototype.filter.call(s.children, function (e) { return e !== a && !e.hasAttribute('data-slot') && !e.matches('[data-illus], [data-illus-src]') && (e.textContent || '').trim(); });
    return k.filter(function (e) { return typeof e.className === 'string' && /lbl/.test(e.className); })[0] || k[0] || null;
  };
  var isSide = function (e) { var cs = getComputedStyle(e); return /flex/.test(cs.display) && /^row/.test(cs.flexDirection); };
  // 錨點與標籤；巢狀群組（例：手機＋下面掛的 REC 膠囊）看裡面第一個元件：它有標籤，群組就跟著那個標籤底對齊
  var keyOf = function (s) {
    if (!s.hasAttribute('data-layout')) { var a = anchorOf(s); return { a: a, l: a !== s ? labelOf(s, a) : null }; }
    var inner = s.querySelectorAll('[data-slot]');
    for (var i = 0; i < inner.length; i++) {
      if (inner[i].hasAttribute('data-layout')) continue;
      var a2 = anchorOf(inner[i]), l2 = a2 !== inner[i] && !isSide(inner[i]) ? labelOf(inner[i], a2) : null;
      return l2 ? { a: a2, l: l2 } : { a: s, l: null };
    }
    return { a: s, l: null };
  };
  var gapOf = function (c, kind) { var g = c.getAttribute('data-gap') || GAP_DEFAULT[kind] || 'md'; return g === 'none' || g === '0' ? 0 : token('gap-' + g); };
  var home = new WeakMap();   // helper 排的位置（之後被 P.morph 走位的元件，measure 另外回報排版時的外框）
  var ensurePos = function (el, p) { if (getComputedStyle(el).position === 'static') el.style.position = p; };

  // 一個容器裡排 slot：回傳 {w, h, pos: [[x, y]…]}（相對群組左上角）
  function arrange(c, kind, items) {
    var gap = gapOf(c, kind);
    var m = items.map(function (s) {
      var k = kind === 'row' ? keyOf(s) : { a: anchorOf(s), l: null }, a = k.a, b = a === s ? [0, 0, s.offsetWidth, s.offsetHeight] : box(a, s);
      // 標籤在右邊的元件（徽章＋字）在 col 裡整個置中，不是只有徽章對中線
      var side = isSide(s);
      return { el: s, w: s.offsetWidth, h: s.offsetHeight, cx: side && kind === 'col' ? s.offsetWidth / 2 : b[0] + b[2] / 2, cy: b[1] + b[3] / 2,
        bot: b[1] + b[3], ah: b[3], lab: kind === 'row' && a !== s && !side && !!k.l, sl: kind === 'row' && a !== s && side && !!k.l,
        lcy: k.l ? (function (q) { return q[1] + q[3] / 2; })(box(k.l, s)) : 0, row: Number(s.getAttribute('data-row')) || 1 };
    });
    var pos = m.map(function () { return [0, 0]; }), W = 0, H = 0;
    var room = function (list, key) {   // 相鄰兩個放大 SCALE_MAX 後不能碰到：間距至少 (a+b)×(S−1)/2
      var g = gap;
      for (var i = 1; i < list.length; i++) g = Math.max(g, Math.ceil((list[i - 1][key] + list[i][key]) * (SCALE_MAX - 1) / 2 - 1e-9));   // 1e-9：(a+b)×0.1/2 的浮點誤差（24.000000000000004 不要變 25）
      return g;
    };
    if (kind === 'row') {
      var rows = {};
      m.forEach(function (x, i) { (rows[x.row] = rows[x.row] || []).push(i); });
      var keys = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }), boxes = [];
      var middle = c.getAttribute('data-align') === 'middle';
      keys.forEach(function (r) {
        var idx = rows[r], list = idx.map(function (i) { return m[i]; }), g = room(list, 'w'), ys;
        var labs = list.filter(function (x) { return x.lab; });
        if (middle || !labs.length) {   // 插圖中線對齊（data-align="middle"，或這列都沒有標籤）
          var line = Math.max.apply(null, list.map(function (x) { return x.cy; }));
          ys = list.map(function (x) { return line - x.cy; });
        } else {   // 預設底對齊：有標籤的插圖底同高（標籤同一條線）；側排（徽章＋右邊字）的標籤中心落在那條標籤線；沒標籤的對齊最高那個有標籤插圖的中線
          var base = Math.max.apply(null, labs.map(function (x) { return x.bot; })), cl = base - Math.max.apply(null, labs.map(function (x) { return x.ah; })) / 2;
          var lline = Math.max.apply(null, labs.map(function (x) { return base - x.bot + x.lcy; }));
          ys = list.map(function (x) { return x.lab ? base - x.bot : x.sl ? lline - x.lcy : cl - x.cy; });
        }
        var y0 = Math.min.apply(null, ys), x = 0, bot = 0;
        idx.forEach(function (i, k) { pos[i] = [x, Math.round(ys[k] - y0)]; x += m[i].w + g; bot = Math.max(bot, pos[i][1] + m[i].h); });
        boxes.push({ idx: idx, w: x - g, h: bot });
      });
      var lg = token('gap-lg'), y = 0;
      W = Math.max.apply(null, boxes.map(function (b) { return b.w; }));
      boxes.forEach(function (b, k) {
        var dx = Math.round((W - b.w) / 2);
        b.idx.forEach(function (i) { pos[i] = [pos[i][0] + dx, pos[i][1] + y]; });
        y += b.h + (k < boxes.length - 1 ? lg : 0);
      });
      H = y;
    } else if (kind === 'col') {   // data-justify：center（預設，插圖中線對齊）／start（左邊對齊）／end（右邊對齊）
      var g2 = room(m, 'h'), line2 = Math.max.apply(null, m.map(function (x) { return x.cx; })), yy = 0, jc = c.getAttribute('data-justify') || 'center';
      var mw = Math.max.apply(null, m.map(function (x) { return x.w; }));
      m.forEach(function (x, i) { pos[i] = [jc === 'start' ? 0 : jc === 'end' ? mw - x.w : Math.round(line2 - x.cx), yy]; yy += x.h + g2; W = Math.max(W, pos[i][0] + x.w); });
      H = yy - g2;
    } else if (kind === 'cols-2' || kind === 'grid-2x2') {
      var cw = Math.max.apply(null, m.map(function (x) { return x.w; }));
      var ch = Math.max.apply(null, m.map(function (x) { return x.h; }));
      var gx = kind === 'cols-2' ? token('gap-lg') : gap, gy = kind === 'cols-2' ? token('gap-md') : gap;
      var nr = Math.ceil(m.length / 2), rh = [];
      for (var r = 0; r < nr; r++) rh.push(kind === 'grid-2x2' ? ch : Math.max(m[2 * r].h, m[2 * r + 1] ? m[2 * r + 1].h : 0));
      var top = 0;
      for (var r2 = 0; r2 < nr; r2++) {
        for (var k2 = 0; k2 < 2; k2++) {
          var i2 = 2 * r2 + k2; if (i2 >= m.length) break;
          pos[i2] = [k2 * (cw + gx) + Math.round((cw - m[i2].w) / 2), top + Math.round((rh[r2] - m[i2].h) / 2)];
        }
        top += rh[r2] + (r2 < nr - 1 ? gy : 0);
      }
      W = m.length > 1 ? 2 * cw + gx : cw; H = top;
    }
    return { w: W, h: H, pos: pos };
  }

  function layOne(c) {
    var kind = c.getAttribute('data-layout'), items = kids(c);
    var nested = c.hasAttribute('data-slot');
    if (kind === 'free' || !items.length) {
      if (nested && items.length) {   // 手排的巢狀群組：大小＝裡面元件的外框
        var w = 0, h = 0;
        items.forEach(function (s) { w = Math.max(w, s.offsetLeft + s.offsetWidth); h = Math.max(h, s.offsetTop + s.offsetHeight); });
        c.style.width = w + 'px'; c.style.height = h + 'px';
      }
      return;
    }
    if (!/^(row|col|cols-2|grid-2x2)$/.test(kind)) throw new Error('data-layout 要是 row／col／cols-2／grid-2x2／free，現在是 ' + kind);
    ensurePos(c, nested ? 'absolute' : 'relative');
    items.forEach(function (s) { s.style.position = 'absolute'; });
    var r = arrange(c, kind, items), ox = 0, oy = 0;
    if (nested) { c.style.width = r.w + 'px'; c.style.height = r.h + 'px'; }
    else {
      var CW = c.clientWidth, CH = c.clientHeight, top = c.getAttribute('data-align') === 'top', J = c.getAttribute('data-justify') || 'center';
      if (!/^(start|center|end)$/.test(J)) throw new Error('data-justify 要是 start／center／end，現在是 ' + J);
      ox = J === 'start' ? token('pad-card', c) : J === 'end' ? CW - r.w - token('pad-card', c) : snap((CW - r.w) / 2);
      oy = top ? token('pad-card-y', c) : snap((CH - r.h) / 2);
    }
    items.forEach(function (s, i) { s.style.left = (ox + r.pos[i][0]) + 'px'; s.style.top = (oy + r.pos[i][1]) + 'px'; home.set(s, [ox + r.pos[i][0], oy + r.pos[i][1]]); });
  }

  // 連接線：svg 疊在它的父元素上（0, 0、同大小）。端點在「元件外框」（slot，含標籤）沿線方向的邊外 --sc-link-gap，
  //   另一軸對「錨點」（插圖）的中線：水平線在插圖中線高度、不穿過底下的標籤；垂直線從標籤下面出發
  function linkPts(SA, AA, SB, AB, gap) {
    var e = function (q) { return { x0: q[0], y0: q[1], x1: q[0] + q[2], y1: q[1] + q[3], cx: q[0] + q[2] / 2, cy: q[1] + q[3] / 2 }; };
    var sa = e(SA), sb = e(SB), a = e(AA), b = e(AB);
    var over = function (p0, p1, q0, q1) { return Math.min(p1, q1) - Math.max(p0, q0); };
    if (over(a.y0, a.y1, b.y0, b.y1) > 0 && over(sa.x0, sa.x1, sb.x0, sb.x1) <= 0) {   // 同列：水平直線，y＝兩個插圖上下重疊段的正中（底對齊時＝矮的那個的中線）
      var y = Math.round((Math.max(a.y0, b.y0) + Math.min(a.y1, b.y1)) / 2);
      return b.cx > a.cx ? [[sa.x1 + gap, y], [sb.x0 - gap, y]] : [[sa.x0 - gap, y], [sb.x1 + gap, y]];
    }
    if (over(a.x0, a.x1, b.x0, b.x1) > 0 && over(sa.y0, sa.y1, sb.y0, sb.y1) <= 0) {   // 同欄：垂直直線，x＝左右重疊段的正中
      var x = Math.round((Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2);
      return b.cy > a.cy ? [[x, sa.y1 + gap], [x, sb.y0 - gap]] : [[x, sa.y0 - gap], [x, sb.y1 + gap]];
    }
    var sx = b.cx > a.cx ? sa.x1 + gap : sa.x0 - gap, sy = Math.round(a.cy), ex = Math.round(b.cx);   // L 形：先水平再垂直
    return [[sx, sy], [ex, sy], [ex, b.cy > a.cy ? sb.y0 - gap : sb.y1 + gap]];
  }
  function drawLinks(svg) {
    var spec = (svg.getAttribute('data-links') || '').trim();
    if (!spec) { svg.style.display = 'none'; return; }   // 沒有線：空的 svg 不佔版面（不然預設 300×150 會壓到標題列）
    var ref = svg.parentNode, gap = token('link-gap'), head = token('link-head'), ns = 'http://www.w3.org/2000/svg';
    var W = ref.clientWidth, H = ref.clientHeight;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.position = 'absolute'; svg.style.left = '0px'; svg.style.top = '0px'; svg.style.width = W + 'px'; svg.style.height = H + 'px';
    svg.style.overflow = 'visible';
    var doc = svg.ownerDocument;
    spec.split(/\s+/).forEach(function (pair) {
      // a>b 有箭頭；a-b 沒箭頭（id 本身也有「-」：從左到右找第一個兩邊都是元件 id 的「-」）
      var m = null, arrow = pair.indexOf('>') > 0;
      if (arrow) { var q = pair.split('>'); m = [pair, q[0], '>', q[1]]; }
      else for (var i = pair.indexOf('-'); i > 0 && !m; i = pair.indexOf('-', i + 1)) if (doc.getElementById(pair.slice(0, i)) && doc.getElementById(pair.slice(i + 1))) m = [pair, pair.slice(0, i), '-', pair.slice(i + 1)];
      var a = m && doc.getElementById(m[1]), b = m && doc.getElementById(m[3]);
      if (!a || !b) throw new Error('data-links 的「' + pair + '」找不到元件（寫成 元件id>元件id 或 元件id-元件id）');
      var pts = linkPts(box(a, ref), box(anchorOf(a), ref), box(b, ref), box(anchorOf(b), ref), gap), id = m[1] + '-' + m[3];
      var d = 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L');
      var mkPath = function (pid) {
        var el = doc.getElementById(pid);
        if (!el) { el = doc.createElementNS(ns, 'path'); el.setAttribute('id', pid); el.setAttribute('class', svg.getAttribute('data-link-class') || 'sc-link'); svg.appendChild(el); }
        return el;
      };
      var p = mkPath(id);   // 線本體（P.stroke／P.comet 走這條，終點＝箭尖）
      p.setAttribute('d', d);
      p.setAttribute('data-pts', JSON.stringify(pts));
      p.setAttribute('data-link', m[1] + ' ' + m[3]);
      var old = doc.getElementById(id + '-head');
      if (arrow) {   // 箭頭頭另一條 path（<a>-<b>-head）：本體被 P.stroke／P.comet 描的時候，描完那一刻淡入（scene-motion.js 的 draw）
        var e = pts[pts.length - 1], f = pts[pts.length - 2], len = Math.hypot(e[0] - f[0], e[1] - f[1]) || 1;
        var ux = (e[0] - f[0]) / len, uy = (e[1] - f[1]) / len, nx = -uy, ny = ux;
        var h = mkPath(id + '-head');
        h.setAttribute('d', 'M' + (e[0] - ux * head + nx * head) + ' ' + (e[1] - uy * head + ny * head) + ' L' + e[0] + ' ' + e[1] + ' L' + (e[0] - ux * head - nx * head) + ' ' + (e[1] - uy * head - ny * head));
        h.setAttribute('data-link-head', id);
      } else if (old) old.parentNode.removeChild(old);
    });
  }

  var done = new WeakSet();
  // 全寬版型（旁白段：整段沒有講者小窗的全畫面段）：build 在 host 寫 data-wide。主卡（寬 1180 的 .sc-wcard）拉寬 500 → 1680（右緣 1800）；
  // 卡裡的內容區（寬 ≈ 1176 的直接子元素）有 data-layout（free 以外）就一起加寬，由 SceneLayout 照新寬度重排（連接線跟著）；
  // free 或沒有 data-layout 的寬度不變、往右 250 置中（作者寫的座標照用）；row 的站距 xl 改 xxl；寫了 data-wide-keep 的不動（04a 清單：右邊放主視覺）；
  // 不是 .sc-wcard 的 1180 面板（介面模擬視窗）整塊置中。
  // apply 一開始做（排版照加寬後的寬度算；ILLUS.mount 之後的自動排版也會先經過這裡）
  var WIDE = { card: 1180, add: 500 };
  function widen(root) {
    if (!root || !root.closest || root.__scWide || !root.closest('[data-wide]')) return;
    root.__scWide = true;
    Array.prototype.forEach.call(root.querySelectorAll('.sc-wcard'), function (card) {
      if (Math.abs(card.offsetWidth - WIDE.card) > 4 || (card.parentElement && card.parentElement.closest('.sc-wcard'))) return;
      card.style.width = (card.offsetWidth + WIDE.add) + 'px';
      card.setAttribute('data-wide', '');   // 版型自己的全寬樣式掛在卡上（合成的 CSS 會加 #root 前綴，寫 [data-wide] #x 才對得到）
      Array.prototype.forEach.call(card.children, function (k) {
        var w = k.offsetWidth, lay = k.getAttribute('data-layout');
        if (k.classList.contains('sc-wcard__bar') || k.hasAttribute('data-wide-keep') || w < WIDE.card - 40) return;
        if (lay && lay !== 'free') {
          k.style.width = (w + WIDE.add) + 'px';
          if (lay === 'row' && (k.getAttribute('data-gap') || 'xl') === 'xl') k.setAttribute('data-gap', 'xxl');   // 站距拉開（96 → 160）
          Array.prototype.forEach.call(k.querySelectorAll(':scope > svg'), function (g) { if (Math.abs(g.getBoundingClientRect().width - w) < 2 || g.getAttribute('width') == String(w)) { g.style.width = (w + WIDE.add) + 'px'; } });
        } else k.style.marginLeft = (WIDE.add / 2) + 'px';
      });
    });
    // 不是主卡的同尺寸面板（例：x-ui-mock 的視窗，裡面是寫死座標的介面與游標）：寬度不動，整塊往右 250 置中
    Array.prototype.forEach.call(root.querySelectorAll(':scope > *, :scope > .fill > *'), function (el) {
      if (el.classList.contains('sc-wcard') || el.hasAttribute('data-wide-keep') || getComputedStyle(el).position !== 'absolute') return;
      if (Math.abs(el.offsetLeft - 120) <= 8 && Math.abs(el.offsetWidth - WIDE.card) <= 8) el.style.left = (el.offsetLeft + WIDE.add / 2) + 'px';
    });
  }

  function apply(root, o) {
    if (!root || !root.querySelectorAll) return;
    if (done.has(root) && !(o && o.force)) return;
    done.add(root);
    widen(root);
    var list = Array.prototype.slice.call(root.querySelectorAll('[data-layout]'));
    if (root.hasAttribute && root.hasAttribute('data-layout')) list.unshift(root);
    list.reverse().forEach(layOne);   // 反向文件順序＝先排裡面的群組，外面的才量得到它的大小
    Array.prototype.forEach.call(root.querySelectorAll('svg[data-links]'), drawLinks);
  }

  // 給 audit：每個容器的外框與 slot（錨點、標籤），每條線的端點；座標都相對 root（版面座標）
  function measure(root) {
    var out = { containers: [], links: [] };
    if (!root || !root.querySelectorAll) return out;
    var r4 = function (b) { return [b[0], b[1], b[0] + b[2], b[1] + b[3]]; };
    var list = Array.prototype.slice.call(root.querySelectorAll('[data-layout]'));
    list.forEach(function (c) {
      var cb = box(c, root);
      out.containers.push({
        id: c.id || null, layout: c.getAttribute('data-layout'), align: c.getAttribute('data-align') || 'center', justify: c.getAttribute('data-justify') || 'center', nested: c.hasAttribute('data-slot'),
        pad: [token('pad-card', c), token('pad-card-y', c)],   // 這個容器的內距（情境動畫 72／64、字卡 48／40）：audit 的內距門檻跟著它
        box: [cb[0] + c.clientLeft, cb[1] + c.clientTop, cb[0] + c.clientLeft + c.clientWidth, cb[1] + c.clientTop + c.clientHeight],
        slots: kids(c).map(function (s) {
          var k = keyOf(s), a = k.a, l = k.l, b = box(s, root), h = home.get(s);
          var o = { id: s.id || null, row: Number(s.getAttribute('data-row')) || 1, side: isSide(s),
            box: r4(b), anchor: r4(box(a, root)), label: l ? r4(box(l, root)) : null, nested: s.hasAttribute('data-layout') };
          if (h && (h[0] !== s.offsetLeft || h[1] !== s.offsetTop)) o.home = r4([b[0] + h[0] - s.offsetLeft, b[1] + h[1] - s.offsetTop, b[2], b[3]]);   // 走位過：排版時的外框
          return o;
        })
      });
    });
    var slotBoxes = function (A) { return A ? { box: r4(box(A, root)), anchor: r4(box(anchorOf(A), root)) } : { box: null, anchor: null }; };
    Array.prototype.forEach.call(root.querySelectorAll('svg path[data-link]'), function (p) {
      var R = p.ownerSVGElement.parentNode, o = box(R, root), ids = p.getAttribute('data-link').split(' ');
      o[0] += R.clientLeft || 0; o[1] += R.clientTop || 0;   // 線的座標從 svg 父元素的內容區算
      var pts = JSON.parse(p.getAttribute('data-pts') || '[]').map(function (q) { return [q[0] + o[0], q[1] + o[1]]; });
      var A = slotBoxes(root.ownerDocument.getElementById(ids[0])), B = slotBoxes(root.ownerDocument.getElementById(ids[1]));
      out.links.push({ id: p.id, a: ids[0], b: ids[1], pts: pts, boxA: A.box, anchorA: A.anchor, boxB: B.box, anchorB: B.anchor });
    });
    // 手寫的線（free 也量）：不在插圖裡、有描邊的 path／line／polyline，第一段子路徑兩端各離一個不同的元件 ≤ 48px 才算連接線
    //   端點認最近的元件；一樣近（巢狀群組和裡面的元件同一邊）認最內層的 data-slot 或插圖（.il）
    var slots = Array.prototype.slice.call(root.querySelectorAll('[data-layout] > [data-slot]'));
    if (slots.length < 2) return out;
    var rr = root.getBoundingClientRect(), k = root.offsetWidth ? rr.width / root.offsetWidth : 1;
    var dist = function (p, b) { return Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[2]), Math.max(b[1] - p[1], 0, p[1] - b[3])); };
    var sb = [];
    slots.forEach(function (s) { sb.push({ el: s, b: r4(box(s, root)) }); Array.prototype.forEach.call(s.querySelectorAll('.il'), function (e) { sb.push({ el: e, b: r4(box(e, root)) }); }); });
    var nearest = function (p) {
      var best = null;
      sb.forEach(function (x) { var d = dist(p, x.b); if (d <= 48 && (!best || d < best.d - 0.5 || (Math.abs(d - best.d) <= 0.5 && best.el.contains(x.el)))) best = { d: d, el: x.el }; });
      return best && best.el;
    };
    var slotOf = function (e) { return e.hasAttribute('data-slot') ? e : e.parentNode.closest('[data-slot]'); };
    var ends = function (e) { var s = slotOf(e); return { id: s && s.id || null, box: r4(box(e, root)), anchor: r4(box(e.hasAttribute('data-slot') ? anchorOf(e) : e, root)) }; };
    Array.prototype.forEach.call(root.querySelectorAll('svg path, svg line, svg polyline'), function (el, n) {
      if (el.hasAttribute('data-link') || el.closest('[data-illus], [data-illus-src], svg[data-links], [data-layout-ignore], [data-layout-check="ignore"]')) return;   // 退出標記比照 audit-page（例：時間軸刻意橫過每個點）
      if (getComputedStyle(el).stroke === 'none') return;
      var sub = el;
      if (el.tagName === 'path') {   // 第一段子路徑（箭頭頭常寫在同一個 path 的第二段）
        var d0 = (el.getAttribute('d') || '').trim().split(/(?=[Mm])/)[0];
        sub = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path'); sub.setAttribute('d', d0); el.parentNode.insertBefore(sub, el);
      }
      try {
        var len = sub.getTotalLength ? sub.getTotalLength() : 0;
        if (!(len >= 24)) return;
        var m = el.getScreenCTM(), pts = [];
        for (var i = 0, N = Math.max(2, Math.ceil(len / 8)); i <= N; i++) {
          var q = sub.getPointAtLength(len * i / N);
          pts.push([Math.round(((m.a * q.x + m.c * q.y + m.e) - rr.left) / k * 10) / 10, Math.round(((m.b * q.x + m.d * q.y + m.f) - rr.top) / k * 10) / 10]);
        }
        var A = nearest(pts[0]), B = nearest(pts[pts.length - 1]);
        if (!A || !B || slotOf(A) === slotOf(B) || A.contains(B) || B.contains(A)) return;
        var a = ends(A), b = ends(B);
        out.links.push({ id: el.id || ('line' + n), a: a.id, b: b.id, hand: true, pts: pts, boxA: a.box, anchorA: a.anchor, boxB: b.box, anchorB: b.anchor });
      } finally { if (sub !== el) sub.remove(); }
    });
    return out;
  }

  window.SceneLayout = { apply: apply, measure: measure, box: box, token: token, widen: widen, SCALE_MAX: SCALE_MAX };
  // ILLUS.mount 之後自動排一次（插圖換成 SVG 後大小才定）
  if (window.ILLUS && window.ILLUS.mount && !window.ILLUS.mount.__layout) {
    var mount = window.ILLUS.mount;
    window.ILLUS.mount = function (root) { var r = mount.apply(this, arguments); apply(root && root.nodeType === 9 ? root.body : root); return r; };
    window.ILLUS.mount.__layout = true;
  }
})();

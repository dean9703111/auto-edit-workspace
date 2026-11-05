/* 放大鏡逐格播放（pitfalls §38：放大鏡不用第二個 <video>，seek 會不同步）。
   build.mjs 把錄影那一段逐格裁成 JPG（同一張的去重），放在隱藏的 <img> 裡；
   這裡在 paused timeline 上補間一個 setter 屬性 f（格號），每次 seek 都同步 drawImage 到 <canvas>，任何 seek 順序都對得上。
   用法（主合成 script，build 產生）：MediaKit.lens(tl, '#mlc-m01-l1', '#mlsrc-m01-l1 img', [0,0,1,2,…], 起點秒數, 長度秒數); */
(function () {
  function lens(tl, canvasSel, imgSel, map, at, dur) {
    var cv = document.querySelector(canvasSel);
    if (!cv || !map || !map.length) return;
    var ctx = cv.getContext('2d');
    var imgs = Array.prototype.slice.call(document.querySelectorAll(imgSel));
    var f = 0, last = -1;
    function draw() {
      var k = Math.max(0, Math.min(map.length - 1, Math.floor(f + 1e-6)));
      var i = map[k], im = imgs[i];
      if (i === last || !im || !im.complete || !im.naturalWidth) return;
      ctx.drawImage(im, 0, 0, cv.width, cv.height);
      last = i;
    }
    // 圖還沒載入時先略過，載入後補畫目前這一格
    imgs.forEach(function (im) { if (!im.complete) im.addEventListener('load', function () { last = -1; draw(); }); });
    // 補間的目標一定要是元素（canvas 本身，格號掛成它的屬性）：目標是普通物件時，HyperFrames 的 renderSeek 之後畫面不再更新（requestAnimationFrame 不觸發，audit 報 Chrome 沒有回應）
    Object.defineProperty(cv, 'lensFrame', { configurable: true, get: function () { return f; }, set: function (v) { f = v; draw(); } });
    tl.fromTo(cv, { lensFrame: 0 }, { lensFrame: map.length, duration: dur, ease: 'none' }, at);
  }
  window.MediaKit = { lens: lens };
})();

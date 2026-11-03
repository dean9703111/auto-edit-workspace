/* 情境庫預覽頁的風格切換與講者示意圖（只有 preview/*.html 載；成片、Studio 都不載）
   網址 ?style=<風格包>&theme=dark：換成 ../styles/<風格包>/ 的主色、外框、背景圖，或換暗色主題（講者示意圖也換成暗色版）。
   情境庫 index.html 上方的「風格」「暗色」會改每個 iframe 的網址；沒有這兩個參數時只換講者示意圖（有 speaker-local.jpg 才換）。 */
(function () {
  var q = null;
  try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
  var style = q ? q.get('style') : null, dark = !!q && q.get('theme') === 'dark';
  // 講者示意：構圖台存過預覽參考圖（speaker-local.jpg、直式 speaker-v-local.jpg：創作者自己的畫面，不進版控）就用它，亮暗都一樣；
  // 沒有：亮色是白牆（speaker.jpg），暗色換書櫃版（speaker-dark.jpg；直式 speaker-v-dark.jpg，沒有就退回 speaker-dark.jpg）。每一頁都做（不管有沒有網址參數）
  var useLocal = function (img, src) {
    var probe = new Image();
    probe.onload = function () { img.onerror = null; img.setAttribute('src', src.replace('.jpg', '-local.jpg')); };
    if (dark) {
      img.onerror = function () { this.onerror = null; this.src = 'speaker-dark.jpg'; };
      img.setAttribute('src', src.replace('.jpg', '-dark.jpg'));
    }
    probe.src = src.replace('.jpg', '-local.jpg');
  };
  document.addEventListener('DOMContentLoaded', function () {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('src') || '';
      if (/^speaker(-v)?\.jpg$/.test(src)) useLocal(imgs[i], src);
    }
  });
  if (!style && !dark) return;
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  var root = style ? '../styles/' + encodeURIComponent(style) + '/' : '../';
  // 主色：同樣三個變數、載在後面就蓋過 kit/brand.css
  if (style) document.write('<link rel="stylesheet" href="' + root + 'brand.css">');
  var bg = function (k) {
    // 暗色那張疊在亮色那張上面：包裡沒有暗色背景時露出亮色
    var layers = [];
    if (dark) layers.push('url("' + root + 'bg-' + k + '-dark.jpg")');
    layers.push('url("' + root + 'bg-' + k + '.jpg")');
    var size = layers.map(function () { return 'cover'; }).join(', ');
    var pos = layers.map(function () { return 'center'; }).join(', ');
    return '.sc-surface-' + k + ' { background-image: ' + layers.join(', ') + ' !important; background-size: ' + size + ' !important; background-position: ' + pos + ' !important; background-repeat: no-repeat !important; }';
  };
  document.addEventListener('DOMContentLoaded', function () {
    var st = document.createElement('style');
    st.textContent = ['fs', 'side', 'ch'].map(bg).join('\n');
    document.head.appendChild(st);
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var m = style && (imgs[i].getAttribute('src') || '').match(/kit\/(pip-frame(?:-v)?\.png)$/);
      if (m) imgs[i].setAttribute('src', root + m[1]);
    }
  });
})();

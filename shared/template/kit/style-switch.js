/* 情境庫預覽頁的風格切換（只有 preview/*.html 載；成片、Studio 都不載）
   網址 ?style=<風格包>&theme=dark：換成 ../styles/<風格包>/ 的主色、外框、背景圖，或換暗色主題（講者示意圖也換成暗色版）。
   情境庫 index.html 上方的「風格」「暗色」會改每個 iframe 的網址；沒有這兩個參數時什麼都不做。 */
(function () {
  var q;
  try { q = new URLSearchParams(location.search); } catch (e) { return; }
  var style = q.get('style'), dark = q.get('theme') === 'dark';
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
      var src = imgs[i].getAttribute('src') || '';
      var m = style && src.match(/kit\/(pip-frame(?:-v)?\.png)$/);
      if (m) imgs[i].setAttribute('src', root + m[1]);
      // 講者示意：亮色是白牆（speaker.jpg），暗色換書櫃版（speaker-dark.jpg；直式 speaker-v-dark.jpg，沒有就退回 speaker-dark.jpg）
      if (dark && /^speaker(-v)?\.jpg$/.test(src)) {
        imgs[i].onerror = function () { this.onerror = null; this.src = 'speaker-dark.jpg'; };
        imgs[i].setAttribute('src', src.replace('.jpg', '-dark.jpg'));
      }
    }
  });
})();

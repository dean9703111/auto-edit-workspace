// 加快 render：HyperFrames 的 runtime 每次 seek 都查幾百次 document.querySelector('[data-composition-id…')（段數 × 整份 DOM），
// 長片每格多花十幾毫秒。合成都掛好（__renderReady）之後 DOM 不再增減，同一個 selector 的答案不會變，記起來就好。
// 只記這一種 selector；元素被拿掉（isConnected 是 false）就重查。畫面逐位元不變（實測 render 成品 md5 相同）。
(function () {
  var orig = Document.prototype.querySelector, memo = new Map();
  Document.prototype.querySelector = function (sel) {
    if (this === document && window.__renderReady === true && typeof sel === 'string' && sel.indexOf('[data-composition-id') === 0) {
      if (memo.has(sel)) { var v = memo.get(sel); if (v === null || v.isConnected) return v; }
      var r = orig.call(this, sel);
      memo.set(sel, r);
      return r;
    }
    return orig.call(this, sel);
  };
})();

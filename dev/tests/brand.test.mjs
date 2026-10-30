// brand.mjs：對比計算、brand.css 改寫、pip-frame.png 重畫（和原檔只差在圓角）、CLI
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, imp } from './helpers.mjs';

const { brandColors, rewriteBrandCss, drawPipFrame, contrast, parseHex } = await imp('brand.mjs');
const KIT = path.join(TEMPLATE, 'kit');

// 最小 PNG 解碼（8-bit RGBA、非交錯，五種 filter 都支援）
function decodePng(buf) {
  assert.equal(buf.readUInt32BE(0), 0x89504e47, '不是 PNG');
  let p = 8, w, h, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); assert.equal(data[8], 8); assert.equal(data[9], 6); assert.equal(data[12], 0); }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[dst + x - 4] : 0, b = y ? out[dst - stride + x] : 0, c = x >= 4 && y ? out[dst - stride + x - 4] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  return { w, h, px: out };
}

test('對比：淺主色用深字、深主色用白字並混白到 4.5', () => {
  const y = brandColors('#FFD400');
  assert.equal(y.ink, '#0B1020');
  assert.equal(y.text, '#FFD400');
  assert.equal(y.mixed, 0);
  const g = brandColors('#1B7F4B');
  assert.equal(g.ink, '#FFFFFF');
  assert.ok(g.inkContrast >= 4.5);
  assert.ok(g.mixed > 0);
  assert.ok(contrast(parseHex(g.text), parseHex('#0B1020')) >= 4.5);
  assert.equal(brandColors('#E53935').reddish, true);
  assert.equal(brandColors('#1B7F4B').reddish, false);
  assert.throws(() => brandColors('綠色'));
});

test('brand.css 只改 3 個變數，註解不動；格式被改過就報錯', () => {
  const css = fs.readFileSync(path.join(KIT, 'brand.css'), 'utf8');
  const out = rewriteBrandCss(css, brandColors('#1B7F4B'));
  assert.match(out, /--brand:\s+#1B7F4B;/);
  assert.match(out, /--brand-ink:\s+#FFFFFF;/);
  assert.equal(out.replace(/#[0-9A-Fa-f]{6}/g, ''), css.replace(/#[0-9A-Fa-f]{6}/g, ''));
  assert.throws(() => rewriteBrandCss(':root { --x: #000; }', brandColors('#1B7F4B')), /找不到 --brand/);
});

test('pip-frame.png：用原本的黃色重畫，和素材包原檔只差在四個圓角', () => {
  const mine = decodePng(drawPipFrame('#FFD400'));
  const orig = decodePng(fs.readFileSync(path.join(KIT, 'pip-frame.png')));
  assert.equal(mine.w, 1920); assert.equal(mine.h, 1080);
  assert.equal(orig.w, 1920); assert.equal(orig.h, 1080);
  // 外框最外圈是本體 1344,630–1856,918 往外 9px；圓角落在四角 16×16 內
  const X0 = 1335, X1 = 1865, Y0 = 621, Y1 = 927, R = 16;
  const inCorner = (x, y) => (x < X0 + R || x >= X1 - R) && (y < Y0 + R || y >= Y1 - R);
  let diffs = 0, outside = 0, maxEdge = 0;
  for (let y = 0; y < 1080; y++) for (let x = 0; x < 1920; x++) {
    const i = (y * 1920 + x) * 4;
    // 比合成到黑底後的顏色（alpha 很低的像素 RGB 本來就沒意義）
    let d = 0;
    for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(mine.px[i + k] * mine.px[i + 3] - orig.px[i + k] * orig.px[i + 3]) / 255);
    d = Math.max(d, Math.abs(mine.px[i + 3] - orig.px[i + 3]));
    if (d > 2) { diffs++; if (!inCorner(x, y)) { outside++; maxEdge = Math.max(maxEdge, d); } }
  }
  assert.equal(outside, 0, `圓角以外有 ${outside} 個像素不同（最大差 ${maxEdge}）`);
  assert.ok(diffs < 1000, `差異像素太多：${diffs}`);
});

test('pip-frame.png：換色後直邊是新主色、本體挖空、畫面其他地方全透明', () => {
  const { px } = decodePng(drawPipFrame('#1B7F4B'));
  const at = (x, y) => [...px.subarray((y * 1920 + x) * 4, (y * 1920 + x) * 4 + 4)];
  assert.deepEqual(at(1600, 627), [0x1B, 0x7F, 0x4B, 255]);   // 上緣主色環（本體上方 3–8px）
  assert.equal(at(1600, 700)[3], 0);                           // 本體挖空
  assert.equal(at(100, 100)[3], 0);                            // 畫面其他地方
});

test('CLI：寫進指定 kit 資料夾，印出對比與紅色系警告', () => {
  const kit = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-brand-'));
  fs.copyFileSync(path.join(KIT, 'brand.css'), path.join(kit, 'brand.css'));
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'brand.mjs'), '#E53935', '--kit', kit], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /紅色系/);
  assert.match(fs.readFileSync(path.join(kit, 'brand.css'), 'utf8'), /--brand:\s+#E53935;/);
  assert.ok(fs.existsSync(path.join(kit, 'pip-frame.png')));
  const bad = spawnSync(process.execPath, [path.join(TOOLS, 'brand.mjs'), '--kit', kit], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /要給一個色碼/);
});

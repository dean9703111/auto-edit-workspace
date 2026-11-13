// brand.mjs：對比計算、brand.css 改寫、pip-frame.png 重畫（和原檔只差在圓角）、CLI
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, imp, hasChrome, tmpDir, needs } from './helpers.mjs';

const { brandColors, rewriteBrandCss, drawPipFrame, drawPipFrameV, contrast, parseHex, darkTokens, DARK } = await imp('brand.mjs');
const KIT = path.join(TEMPLATE, 'kit');
const await_styles = await imp('lib/styles.mjs');

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

test('暗色主題跟著主色算（design-system §10）：標題列、錯位底板、節點底；--brand-text 對暗色節點底也 ≥ 4.5；太亮的主色標題列白字 < 3', () => {
  const o = darkTokens('#F6630F');
  assert.deepEqual([o.bar, o.plate, o.tint], [['#E25B0E', '#47291B'], '#8F3F13', '#402519']);   // 主色 92%＋黑 → 22%＋#15181E；55%＋#121418；20%＋#13161C
  assert.ok(o.barInk >= 3 && o.textOnDark >= 4.5);
  assert.ok(darkTokens('#FFD400').barInk < 3);                                                     // 黃色標題列白字看不清 → CLI 印 ⚠
  for (const c of ['#1B7F4B', '#2563EB', '#7C3AED']) {
    const t = parseHex(brandColors(c).text);
    assert.ok(contrast(t, parseHex('#0B1020')) >= 4.5 && contrast(t, parseHex(DARK.node)) >= 4.5, c);
  }
});

test('brand.css 只改 3 個變數，註解不動；格式被改過就出錯', () => {
  const css = fs.readFileSync(path.join(KIT, 'brand.css'), 'utf8');
  const out = rewriteBrandCss(css, brandColors('#1B7F4B'));
  assert.match(out, /--brand:\s+#1B7F4B;/);
  assert.match(out, /--brand-ink:\s+#FFFFFF;/);
  assert.equal(out.replace(/#[0-9A-Fa-f]{6}/g, ''), css.replace(/#[0-9A-Fa-f]{6}/g, ''));
  assert.throws(() => rewriteBrandCss(':root { --x: #000; }', brandColors('#1B7F4B')), /找不到 --brand/);
});

// 子母畫面本體 1424,594–1856,918（432×324，4:3；lib/main.mjs 的 .pip、lib/media.mjs 的 PIP_ZONE 同一組）
const PIP = [1424, 594, 1856, 918];
const KIT_BRAND = fs.readFileSync(path.join(KIT, 'brand.css'), 'utf8').match(/--brand:\s*(#[0-9A-Fa-f]{6})/)[1];

test('pip-frame.png：用 brand.css 目前的主色重畫，和 kit 裡的檔案一樣（容許四個圓角有差）', () => {
  const mine = decodePng(drawPipFrame(KIT_BRAND));
  const orig = decodePng(fs.readFileSync(path.join(KIT, 'pip-frame.png')));
  assert.equal(mine.w, 1920); assert.equal(mine.h, 1080);
  assert.equal(orig.w, 1920); assert.equal(orig.h, 1080);
  // 外框最外圈是本體往外 9px；圓角落在四角 16×16 內
  const X0 = PIP[0] - 9, X1 = PIP[2] + 9, Y0 = PIP[1] - 9, Y1 = PIP[3] + 9, R = 16;
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
  assert.deepEqual(at(1600, PIP[1] - 3), [0x1B, 0x7F, 0x4B, 255]);   // 上緣主色環（本體上方 1–6px）
  assert.equal(at(1600, 700)[3], 0);                                  // 本體挖空
  assert.equal(at(100, 100)[3], 0);                            // 畫面其他地方
});

test('pip-frame-v.png（009 FR-130）：1080×1920，y 897–903 是主色線，其他地方全透明', () => {
  const { w, h, px } = decodePng(drawPipFrameV('#1B7F4B'));
  assert.deepEqual([w, h], [1080, 1920]);
  const at = (x, y) => [...px.subarray((y * 1080 + x) * 4, (y * 1080 + x) * 4 + 4)];
  for (const y of [897, 900, 902]) for (const x of [0, 540, 1079]) assert.deepEqual(at(x, y), [0x1B, 0x7F, 0x4B, 255], `(${x}, ${y})`);
  for (const y of [0, 896, 903, 1919]) assert.equal(at(540, y)[3], 0, `y ${y} 要透明`);
});

test('CLI：寫進指定 kit 資料夾，印出對比與紅色系警告', () => {
  const kit = tmpDir(null, 'hf-brand-');
  fs.copyFileSync(path.join(KIT, 'brand.css'), path.join(kit, 'brand.css'));
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'brand.mjs'), '#E53935', '--kit', kit], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /紅色系/);
  assert.match(r.stdout, /暗色主題（plan\.json "theme": "dark"）跟著換：標題列 #[0-9A-F]{6}→#[0-9A-F]{6}、錯位底板 #[0-9A-F]{6}、節點底 #[0-9A-F]{6}/);
  assert.match(fs.readFileSync(path.join(kit, 'brand.css'), 'utf8'), /--brand:\s+#E53935;/);
  // 換主色後兩張外框都跟著重畫（009 FR-130）
  assert.match(r.stdout, /已重畫 kit\/pip-frame\.png（子母畫面外框）與 kit\/pip-frame-v\.png（直式講者面板分隔線）/);
  assert.deepEqual([...decodePng(fs.readFileSync(path.join(kit, 'pip-frame-v.png'))).px.subarray((900 * 1080 + 10) * 4, (900 * 1080 + 10) * 4 + 4)], [0xE5, 0x39, 0x35, 255]);
  const ring = [...decodePng(fs.readFileSync(path.join(kit, 'pip-frame.png'))).px.subarray(((PIP[1] - 3) * 1920 + 1600) * 4, ((PIP[1] - 3) * 1920 + 1600) * 4 + 4)];
  [0xE5, 0x39, 0x35, 255].forEach((v, k) => assert.ok(Math.abs(ring[k] - v) <= 2, `pip-frame.png 上緣主色環 ${ring} 要是 #E53935（Lanczos 縮圖容許 ±2）`));
  const y = spawnSync(process.execPath, [path.join(TOOLS, 'brand.mjs'), '#FFD400', '--kit', kit, '--no-frame'], { encoding: 'utf8' });
  assert.match(y.stdout, /⚠ 暗色主題標題列的白字對比只有 1\.7（大字要 ≥ 3）/);
  assert.ok(fs.existsSync(path.join(kit, 'pip-frame.png')));
  const bad = spawnSync(process.execPath, [path.join(TOOLS, 'brand.mjs'), '--kit', kit], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /要給一個色碼/);
});

// ---------- 004：背景圖 HTML 路線（brand.mjs bg，cli-004 §5）----------

const { injectHead, decorRatio, BG_KINDS } = await imp('brand.mjs');
const BRAND = path.join(TOOLS, 'brand.mjs');
const bg = (...args) => spawnSync(process.execPath, [BRAND, 'bg', ...args], { encoding: 'utf8' });

test('bg 的純函式：injectHead 插在 <head> 後面（沒有 head 就放最前面）；decorRatio 量留空區裡的裝飾占比', () => {
  const opt = { baseUrl: 'file:///tmp/x/', links: ['file:///k/fonts.css', 'file:///k/brand.css'], w: 960, h: 1080 };
  const a = injectHead('<html><head lang="zh"><title>t</title></head><body></body></html>', opt);
  assert.match(a, /^<html><head lang="zh"><base href="file:\/\/\/tmp\/x\/"><link rel="stylesheet" href="file:\/\/\/k\/fonts\.css"><link rel="stylesheet" href="file:\/\/\/k\/brand\.css"><style>html,body\{margin:0;width:960px;height:1080px;overflow:hidden\}<\/style><title>/);
  assert.match(injectHead('<div>x</div>', opt), /^<meta charset="utf-8"><base href="file:\/\/\/tmp\/x\/">.*<div>x<\/div>$/);
  const W = 1920, H = 1080, rgb = Buffer.alloc(W * H * 3, 0xF0);
  const main = BG_KINDS.fs.zones[0].rect;
  assert.equal(decorRatio(rgb, W, H, main), 0);
  for (let y = 500; y < 504; y++) for (let x = 0; x < W; x++) rgb.fill(0x30, (y * W + x) * 3, (y * W + x) * 3 + 3);
  const r = decorRatio(rgb, W, H, main);
  assert.ok(r > 0.005 && r < 0.006, `4px 橫線約 0.56%，現在 ${r}`);
  assert.deepEqual(Object.fromEntries(Object.entries(BG_KINDS).map(([k, v]) => [k, [v.w, v.h]])), { fs: [1920, 1080], side: [960, 1080], ch: [1920, 1080] });
});

test('bg 的 ✖：--kind 不對、--html 找不到、--out 在 shared/template 裡；--help 有 bg 用法；沒給色碼的提示', (t) => {
  const dir = tmpDir(t, 'hf-bg-');
  const html = path.join(dir, 'bg-fs.html');
  fs.writeFileSync(html, '<div></div>');
  let r = bg('--html', html, '--kind', 'xx');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✖ --kind 只能是 fs（1920×1080，全畫面與插入素材）、side（960×1080，側邊欄面板）、ch（1920×1080，章節轉場），現在是「xx」/);
  r = bg('--html', path.join(dir, 'nope.html'), '--kind', 'fs');
  assert.match(r.stderr, /✖ --html 要指一個 \.html 檔，找不到/);
  r = bg('--html', html, '--kind', 'fs', '--out', path.join(TEMPLATE, 'tmp-bg'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✖ 輸出資料夾不能在 shared\/template\/ 裡（.*）→ 先放暫存資料夾，使用者看過 preview\.jpg 同意後再複製/);
  assert.ok(!fs.existsSync(path.join(TEMPLATE, 'tmp-bg')));
  r = spawnSync(process.execPath, [BRAND, '--help'], { encoding: 'utf8' });
  assert.match(r.stdout, /node shared\/template\/tools\/brand\.mjs bg --html <檔\.html> --kind fs\|side\|ch \[--out <資料夾>\]/);
  r = spawnSync(process.execPath, [BRAND], { encoding: 'utf8' });
  assert.match(r.stderr, /要給一個色碼.*；背景圖用 brand\.mjs bg --html/);
});

test('bg：三種版面截成正確尺寸；留空區乾淨 ✓、有線 ⚠；三張到齊產生 1600×720 預覽；不寫 shared/template', { skip: !(await hasChrome()) && '沒有 HyperFrames 的 Chrome，略過', timeout: 120000 }, async (t) => {
  if (!(await needs(t, 'ffmpeg'))) return;
  const dir = tmpDir(t, 'hf-bg-');
  const mtimes = () => ['bg-fs.jpg', 'bg-side.jpg', 'bg-ch.jpg'].map((f) => (fs.existsSync(path.join(TEMPLATE, f)) ? fs.statSync(path.join(TEMPLATE, f)).mtimeMs : 0));
  const before = mtimes();
  const page = (k, extra = '') => { const f = path.join(dir, `bg-${k}.html`); fs.writeFileSync(f, `<!doctype html><html><head><style>body{background:#FBF4EA}${extra}</style></head><body><div class="d"></div></body></html>`); return f; };
  let r = bg('--html', page('fs', '.d{position:absolute;left:40px;top:40px;width:40px;height:40px;background:var(--brand)}'), '--kind', 'fs');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /bg-fs\.jpg（1920×1080 ✓）/);
  assert.match(r.stdout, /✓ 留空區乾淨（紅、藍、黃框裡沒有裝飾）/);
  assert.match(r.stdout, /還沒做：side、ch → 各寫一個 HTML，跑 --kind side、--kind ch/);
  r = bg('--html', page('side', '.d{position:absolute;left:0;top:500px;width:960px;height:4px;background:#333}'), '--kind', 'side');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /bg-side\.jpg（960×1080 ✓）/);
  assert.match(r.stdout, /⚠ 紅框（側邊欄文字區）裡有 0\.5\d% 的像素是裝飾（和框內中位亮度差 > 40）→ 裝飾移到框外，重跑這個指令/);
  r = bg('--html', page('ch'), '--kind', 'ch');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /preview\.jpg（三張並排：上排原圖、下排疊留空區框，1600×720）/);
  assert.match(r.stdout, /下一步：把 preview\.jpg 給使用者看，停下來等同意/);
  const dims = (f) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(dir, f)], { encoding: 'utf8' }).stdout.trim();
  assert.equal(dims('bg-fs.jpg'), '1920,1080');
  assert.equal(dims('bg-side.jpg'), '960,1080');
  assert.equal(dims('zones-ch.jpg'), '1920,1080');
  assert.equal(dims('preview.jpg'), '1600,720');
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.render.html')), '暫存的 render.html 要刪掉');
  assert.deepEqual(mtimes(), before, 'shared/template 的背景圖不能被改');
});

test('暗色底圖（T115，design-system §10）：shared/template/bg-{fs,side,ch}-dark.jpg 尺寸和亮色同一組；留空區裡只有光暈的邊（量到 fs 9.0%、side 3.0%、ch 1.9%，換圖變更雜就 fail）', async (t) => {
  if (!(await needs(t, 'ffmpeg'))) return;
  const { BG_KINDS, decorRatio } = await imp('brand.mjs');
  const { rawFrame } = await imp('lib/ff.mjs');
  const limit = { fs: 0.1, side: 0.035, ch: 0.025 };
  for (const k of ['fs', 'side', 'ch']) {
    const f = path.join(TEMPLATE, `bg-${k}-dark.jpg`), K = BG_KINDS[k];
    const dims = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
    assert.equal(dims, `${K.w},${K.h}`, f);
    const px = rawFrame(f, { width: K.w, height: K.h });
    for (const z of K.zones) {
      const r = decorRatio(px, K.w, K.h, z.rect);
      assert.ok(r <= limit[k], `bg-${k}-dark.jpg 的${z.name}框裡裝飾占 ${(r * 100).toFixed(1)}%（上限 ${limit[k] * 100}%）`);
    }
    // 暗色：留空區的中位亮度要低（石墨黑底），和亮色底分得開
    let sum = 0;
    for (let i = 0; i < px.length; i += 3) sum += px[i] + px[i + 1] + px[i + 2];
    assert.ok(sum / (px.length) < 60, `bg-${k}-dark.jpg 平均亮度 ${(sum / px.length).toFixed(1)}，不像暗色底`);
  }
});

// ---------- 風格包（list／use／pack）----------

function tmpTemplate() {
  const t = tmpDir(null, 'brand-pack-');
  fs.mkdirSync(path.join(t, 'kit'));
  for (const f of ['brand.css', 'pip-frame.png', 'pip-frame-v.png']) fs.copyFileSync(path.join(KIT, f), path.join(t, 'kit', f));
  for (const f of ['bg-fs.jpg', 'bg-side.jpg', 'bg-ch.jpg']) fs.copyFileSync(path.join(TEMPLATE, f), path.join(t, f));
  return t;
}
const brandCli = (t, ...args) => spawnSync(process.execPath, [path.join(TOOLS, 'brand.mjs'), ...args, '--kit', path.join(t, 'kit')], { encoding: 'utf8' });

test('風格包：pack 存目前的／照色碼建、styles.js、list 標目前那包、use 換檔、不屬於任何包時 use 先自動存起來、同名 ✖', async (ctx) => {
  if (!(await needs(ctx, 'ffmpeg'))) return;
  const t = tmpTemplate();
  let r = brandCli(t, 'pack', '甲', '--note', '原本的');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of ['brand.css', 'pip-frame.png', 'bg-fs.jpg']) assert.ok(fs.existsSync(path.join(t, 'styles', '甲', f)), f);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(t, 'styles', '甲', 'style.json'), 'utf8')), { name: '甲', brand: '#F6630F', note: '原本的' });
  r = brandCli(t, 'pack', '乙', '--color', '#2563EB');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /⚠ 這包只有主色、沒有背景圖/);
  assert.match(fs.readFileSync(path.join(t, 'styles', '乙', 'brand.css'), 'utf8'), /--brand:\s+#2563EB/);
  const sandbox = {};
  new Function('window', fs.readFileSync(path.join(t, 'styles', 'styles.js'), 'utf8'))(sandbox);
  assert.deepEqual(sandbox.STYLE_PACKS.map((p) => [p.dir, p.brand]), [['乙', '#2563EB'], ['甲', '#F6630F']]);
  assert.match(brandCli(t, 'list').stdout, /● 甲/);
  r = brandCli(t, 'use', '乙');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /換成風格包「乙」（原本：甲）：shared\/template\/kit\/brand\.css、/);
  assert.ok(fs.readFileSync(path.join(t, 'kit', 'brand.css')).equals(fs.readFileSync(path.join(t, 'styles', '乙', 'brand.css'))));
  assert.match(brandCli(t, 'list').stdout, /● 乙/);
  // 手改過、不屬於任何包 → use 先自動存成「原本-<YYYYMMDD>」再換（032 A9⑦）；--force 不存直接蓋
  fs.appendFileSync(path.join(t, 'kit', 'brand.css'), '\n/* 手改 */\n');
  r = brandCli(t, 'use', '甲');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /先存成風格包「原本-\d{8}」.*要換回來：node shared\/template\/tools\/brand\.mjs use 原本-\d{8}/);
  fs.appendFileSync(path.join(t, 'kit', 'brand.css'), '\n/* 手改 */\n');
  assert.equal(brandCli(t, 'use', '甲', '--force').status, 0);
  assert.equal(fs.readdirSync(path.join(t, 'styles')).filter((d) => d.startsWith('原本-')).length, 1, '--force 不存');
  assert.match(brandCli(t, 'pack', '甲').stderr, /風格包「甲」已經有了/);
  assert.match(brandCli(t, 'use', '丙').stderr, /找不到風格包「丙」/);
});

test('風格包：工作區附的「預設」和現在的 shared/template/ 一樣；「藍圖」亮暗六張背景尺寸對', async (t) => {
  if (!(await needs(t, 'ffmpeg'))) return;
  const { listPacks, samePack } = await_styles;
  const packs = listPacks(TEMPLATE);
  assert.deepEqual(packs.map((p) => p.dir), ['預設', '藍圖']);
  assert.ok(samePack(TEMPLATE, path.join(TEMPLATE, 'styles', '預設')), 'shared/template/ 的主色、外框、背景要和「預設」那包一樣（換過就 brand.mjs use 預設）');
  for (const p of packs) assert.equal(p.files.length, 9, `${p.dir}：${p.files.join('、')}`);
  for (const [f, w, h] of [['bg-fs', 1920, 1080], ['bg-side', 960, 1080], ['bg-ch', 1920, 1080]]) for (const s of ['', '-dark']) {
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(TEMPLATE, 'styles', '藍圖', `${f}${s}.jpg`)], { encoding: 'utf8' });
    assert.equal(r.stdout.trim(), `${w},${h}`, `${f}${s}.jpg`);
  }
});

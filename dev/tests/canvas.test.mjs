// lib/canvas.mjs（009 T002-V02）：橫式的值＝現在散在各檔的常數；直式的換算照 FR-011 與 spike（specs/009-vertical/plan.md D-1）；resolveFormat 四個來源
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { TEMPLATE, imp } from './helpers.mjs';

const C = await imp('lib/canvas.mjs');
const { CANVAS, canvasOf, stageTransform, stagePoint, regionsOf, regionsScript, resolveFormat, formatLine } = C;
const L = CANVAS.landscape, V = CANVAS.portrait;
const read = (f) => fs.readFileSync(path.join(TEMPLATE, f), 'utf8');

test('橫式＝現行常數（接線前後橫式輸出不變的保證）', async () => {
  const { FPS } = await imp('lib/time.mjs');
  const { CAPTION } = await imp('lib/captions.mjs');
  const { BADGE, FOOTPRINT } = await imp('lib/plan.mjs');
  const { VIEW, PIP_ZONE } = await imp('lib/media.mjs');
  const A = await imp('lib/audit-rules.mjs');
  assert.deepEqual([L.W, L.H, L.fps], [...A.CANVAS, FPS]);
  assert.deepEqual(L.textSafe, [[0, A.CONTENT_TOP, 1920, A.CONTENT_BOTTOM]]);
  assert.equal(L.minTextPx, A.MIN_FONT);
  // 字幕：lib/captions.mjs 的估寬常數、kit/captions.css 的樣式、字幕區 y 920
  assert.deepEqual([L.caption.font, L.caption.maxChars, L.caption.maxW], [CAPTION.font, CAPTION.maxChars, CAPTION.maxW]);
  const css = read('kit/captions.css');
  for (const x of [`font-size: ${L.caption.font}px`, `line-height: ${L.caption.line}px`, `font-weight: ${L.caption.weight}`, `padding: ${L.caption.pad.map((p) => `${p}px`).join(' ')}`, `bottom: ${L.caption.bottom}px`]) assert.ok(css.includes(x), x);
  const [, y0, , y1] = L.caption.box;
  assert.equal(y1, L.H - L.caption.bottom);
  assert.equal(y1 - y0, L.caption.pad[0] + L.caption.line + L.caption.pad[2]);
  assert.equal(L.caption.box[2] - L.caption.box[0], L.caption.maxW);
  assert.equal(L.caption.zone[1], A.CAPTION_Y);
  // 版面
  assert.deepEqual(L.lowerThird.rect, FOOTPRINT['lower-third'][0]);
  assert.deepEqual(L.centerCard.rect, FOOTPRINT.summary[0]);
  assert.deepEqual(L.badge.rect, BADGE.rect);
  assert.deepEqual(L.pip.zone, PIP_ZONE);
  assert.deepEqual(L.media.view, VIEW);
  const [px, py, pw, ph] = L.pip.box;
  assert.equal(pw / ph, L.pip.aspect);
  assert.ok(read('tools/lib/main.mjs').includes(`.pip { position: absolute; left: ${px}px; top: ${py}px; width: ${pw}px; height: ${ph}px;`));
  assert.deepEqual(Object.values(L.stage), [null, null, null]);
  // 具名區域＝kit/scene-motion.js 的 REGIONS（motion.md §1 橫式預設）
  const src = read('kit/scene-motion.js').match(/var REGIONS = (\{[^\n]*\});/);
  assert.ok(src, 'scene-motion.js 找不到 REGIONS');
  assert.deepEqual(regionsOf(L), JSON.parse(JSON.stringify(vm.runInNewContext(`(${src[1]})`))));
  assert.equal(regionsScript(L), '', '橫式不注入 window.__regions');
});

test('直式：FR-010 表＋決定節的值、矩形都在畫布內、區域和版面同一組數字', () => {
  assert.deepEqual([V.W, V.H, V.fps], [1080, 1920, 30]);
  assert.equal(canvasOf('portrait'), V);
  assert.equal(canvasOf(), L);
  assert.throws(() => canvasOf('square'), /format 只能是 "landscape" 或 "portrait"/);
  // 決定 1：分割線 y 900；決定 2（16:05 改）：字幕和橫式同一套（76 px、字重 400、無描邊、內距 24／37／23、行高 71＝底板 118），只差 10 字與位置（2026-10-31 改：12 字的底板會壓進右側平台按鈕區）；決定 3：角標左上 y 250
  assert.deepEqual(V.pip.box, [0, 900, 1080, 1020]);
  for (const k of ['font', 'line', 'weight', 'stroke', 'pad']) assert.deepEqual(V.caption[k], L.caption[k], `caption.${k} 和橫式相同`);
  assert.equal(V.caption.maxChars, 10);
  assert.deepEqual([V.caption.maxW, V.caption.box[0], V.caption.box[2]], [834, 123, 957], '10 × 76 ＋ 74 ＝ 834，置中 x 123–957');
  assert.ok(V.caption.box[2] - V.unsafe[2][0] <= 17, '最多只碰右側按鈕區邊緣 17 px');
  // 字幕帶 y 1280–1420（style.md「直式」）；底板 118 高置中在帶裡＝1291–1409；kit/captions.css 的直式規則照 bottom 擺
  assert.deepEqual(V.caption.zone, [0, 1280, 1080, 1420]);
  assert.equal(V.caption.box[1] - V.caption.zone[1], V.caption.zone[3] - V.caption.box[3]);
  assert.ok(read('kit/captions.css').includes(`[data-format="portrait"] .cg { bottom: ${V.caption.bottom}px; }`));
  assert.ok(V.caption.box[3] <= V.unsafe[1][1], '字幕框在平台介面（下方 unsafe）上面');
  assert.deepEqual([V.badge.side, V.badge.rect[1]], ['left', 250]);
  // 字幕框：底 = H − bottom；高 = 上下內距＋行高；寬 = maxW；臉（pip.face）在字幕框上方
  const [, cy0, , cy1] = V.caption.box;
  assert.equal(cy1, V.H - V.caption.bottom);
  assert.equal(cy1 - cy0, V.caption.pad[0] + V.caption.line + V.caption.pad[2]);
  assert.equal(V.caption.box[2] - V.caption.box[0], V.caption.maxW);
  assert.ok(V.pip.face[1] <= cy0);
  assert.ok(V.caption.maxChars * V.caption.font + 2 * V.caption.pad[1] <= V.caption.maxW);
  const inside = ([x0, y0, x1, y1]) => x0 >= 0 && y0 >= 0 && x1 <= V.W && y1 <= V.H && x0 < x1 && y0 < y1;
  for (const r of [...V.unsafe, ...V.textSafe, V.caption.box, V.caption.zone, V.lowerThird.rect, V.centerCard.rect, V.badge.rect, V.pip.zone, ...Object.values(V.media.view)]) assert.ok(inside(r), JSON.stringify(r));
  const xywh = ([x0, y0, x1, y1]) => [x0, y0, x1 - x0, y1 - y0];
  const R = regionsOf(V);
  assert.deepEqual(R.band, xywh(V.lowerThird.rect));
  assert.deepEqual(R.badge, xywh(V.badge.rect));
  assert.deepEqual(R.captions, xywh(V.caption.zone));
  assert.deepEqual(R.pip, V.pip.box);
  assert.deepEqual(R.panelBottom, V.pip.box);
  assert.deepEqual(R.panelTop, [0, 0, 1080, 900]);
  for (const k of Object.keys(L.regions)) assert.ok(k in R, `直式少了區域 ${k}`);
  // window.__regions：一行 <script>，JSON 可解析，和 regionsOf 相同
  const s = regionsScript(V);
  const m = s.match(/^<script>window\.__regions = (\{.*\});<\/script>$/);
  assert.ok(m, s);
  assert.deepEqual(JSON.parse(m[1]), R);
  R.band[0] = 999;
  assert.equal(V.regions.band[0], 60, 'regionsOf 回傳複本');
});

test('stageTransform（FR-011＋spike 三句）：fs＝translate(-61.7px, 129.825px) scale(0.8475)、資訊窗 1000×636；fx／ch；橫式 null', () => {
  assert.equal(stageTransform('fs', L), null);
  const fs1 = stageTransform('fs', V);
  assert.equal(fs1.css, 'transform: translate(-61.7px, 129.825px) scale(0.8475); transform-origin: 0 0;');
  assert.equal(fs1.attr, 'data-layout-allow-overflow');
  assert.deepEqual(fs1.window, [120, 130, 1300, 880], 'window 是 [x0, y0, x1, y1]');
  // X = to[0] + (x − window[0]) × s；spike 量到的 #xproc-lines（子合成 122,280）→ 主合成 41.695、367.125
  assert.deepEqual(stagePoint(fs1, [120, 130]), [40, 240]);
  assert.deepEqual(stagePoint(fs1, [122, 280]), [41.695, 367.125]);
  assert.deepEqual(fs1.rect.map(Math.round), [40, 240, 1040, 876]);
  assert.equal(Math.round(fs1.rect[2] - fs1.rect[0]), 1000);
  assert.equal(Math.round(fs1.rect[3] - fs1.rect[1]), 636);
  assert.ok(fs1.rect[3] <= V.pip.box[1], '資訊窗在分割線 y 900 之上');
  // fx：整張 1920×1080 縮 0.5625＝1080×607.5，水平置中；bg none 時放低（clear）
  const fx = stageTransform('fx', V), fxc = stageTransform('fx', V, { clear: true });
  assert.deepEqual([fx.tx, fx.ty, fx.s], [0, 416, 0.5625]);
  assert.deepEqual(fx.rect, [0, 416, 1080, 1023.5]);
  assert.equal(fxc.ty, 766);
  // ch：window 中心落在 (540, centerY 860)
  const ch = stageTransform('ch', V);
  assert.equal(ch.css, 'transform: translate(-60px, 506.875px) scale(0.625); transform-origin: 0 0;');
  assert.deepEqual([(ch.rect[0] + ch.rect[2]) / 2, (ch.rect[1] + ch.rect[3]) / 2], [540, 860]);
  // translate 取到小數 3 位
  for (const st of [fs1, fx, fxc, ch]) for (const n of [st.tx, st.ty]) assert.ok(/^-?\d+(\.\d{1,3})?$/.test(String(n)), String(n));
  assert.equal(stageTransform('nope', V), null);
  assert.deepEqual(stagePoint(null, [5, 6]), [5, 6]);
});

test('resolveFormat：--format > plan.json > 製作進度.md「版式」列 > 主軌寬高比（work/main.mp4 → 素材/真人錄影 第一支 → 素材/聲音 = 橫式）；formatLine', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-'));
  const calls = [];
  const probe = (f) => { calls.push(path.relative(dir, f)); return f.endsWith('main.mp4') ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 }; };
  const R = (o) => resolveFormat({ projectDir: dir, probe, ...o });
  assert.deepEqual(R({}), { format: 'landscape', source: 'default', detail: '預設' });
  fs.mkdirSync(path.join(dir, '素材', '聲音'), { recursive: true });
  fs.writeFileSync(path.join(dir, '素材', '聲音', 'a.m4a'), '');
  assert.deepEqual(R({}), { format: 'landscape', source: 'media', detail: '只有聲音（素材/聲音/）' });
  fs.mkdirSync(path.join(dir, '素材', '真人錄影'), { recursive: true });
  for (const f of ['b.mov', 'a.mp4', '.DS_Store']) fs.writeFileSync(path.join(dir, '素材', '真人錄影', f), '');
  assert.deepEqual(R({}), { format: 'landscape', source: 'media', detail: '素材/真人錄影/a.mp4 1920×1080' });
  fs.mkdirSync(path.join(dir, 'work'));
  fs.writeFileSync(path.join(dir, 'work', 'main.mp4'), '');
  assert.deepEqual(R({}), { format: 'portrait', source: 'media', detail: 'work/main.mp4 1080×1920' });
  assert.deepEqual(calls, ['素材/真人錄影/a.mp4', path.join('work', 'main.mp4')]);
  fs.writeFileSync(path.join(dir, 'work', '製作進度.md'), '## 開工決策表\n\n| 欄 | 值 |\n|---|---|\n| 版式 | 橫式（使用者說長片） |\n');
  assert.deepEqual(R({}), { format: 'landscape', source: 'progress', detail: 'work/製作進度.md' });
  assert.deepEqual(R({ plan: { format: 'portrait' } }), { format: 'portrait', source: 'plan', detail: 'plan.json' });
  assert.deepEqual(R({ plan: { format: 'square' } }).source, 'progress', 'plan 寫錯不採用（plan.mjs 另外 ✖）');
  assert.deepEqual(R({ plan: { format: 'portrait' }, flag: 'landscape' }), { format: 'landscape', source: 'flag', detail: '--format' });
  assert.equal(R({ flag: '直式' }).format, 'portrait');
  assert.throws(() => R({ flag: 'wide' }), /--format 只能是 landscape（橫式）或 portrait（直式），現在是 "wide"/);
  assert.deepEqual(resolveFormat({}), { format: 'landscape', source: 'default', detail: '預設' });
  assert.equal(formatLine({ format: 'portrait', detail: 'plan.json' }), '版式：直式 1080×1920（來源：plan.json）');
  assert.equal(formatLine({ format: 'landscape', detail: 'work/main.mp4 1920×1080' }), '版式：橫式 1920×1080（來源：work/main.mp4 1920×1080）');
});

test('probeDims：手機直拍（1920×1080＋rotation −90）轉回顯示方向 1080×1920', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-rot-'));
  const a = path.join(dir, 'a.mp4'), b = path.join(dir, 'b.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=192x108:rate=30', '-t', '0.2', '-c:v', 'libx264', '-preset', 'ultrafast', a]);
  assert.equal(r.status, 0, String(r.stderr));
  const r2 = spawnSync('ffmpeg', ['-y', '-v', 'error', '-display_rotation', '90', '-i', a, '-c', 'copy', b]);
  assert.equal(r2.status, 0, String(r2.stderr));
  assert.deepEqual(C.probeDims(a), { w: 192, h: 108 });
  assert.deepEqual(C.probeDims(b), { w: 108, h: 192 });
  assert.equal(C.probeDims(path.join(dir, 'nope.mp4')), null);
});

test('captionZoneArg（FR-032）、formatErrors（FR-004、決定 5）、字幕字數上限照版式（FR-031）', async () => {
  const { captionZoneArg, formatErrors } = await imp('lib/canvas.mjs');
  const { captionWarnings, buildCaptions } = await imp('lib/captions.mjs');
  assert.equal(captionZoneArg(L), 'x0=0;y0=0.852;x1=1;y1=1;severity=error');   // USAGE 2 第 8 步原本的值
  assert.equal(captionZoneArg(V), 'x0=0;y0=0.667;x1=1;y1=0.74;severity=error');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-err-'));
  fs.mkdirSync(path.join(d, 'work'));
  const prog = (v) => fs.writeFileSync(path.join(d, 'work', '製作進度.md'), `## 開工決策表\n\n| 欄 | 值 |\n|---|---|\n| 版式 | ${v} |\n`);
  assert.deepEqual(formatErrors({ projectDir: d, plan: {}, format: 'landscape', dims: { w: 1920, h: 1080 } }), []);
  prog('直式（短影片）');
  assert.match(formatErrors({ projectDir: d, plan: {}, format: 'portrait' })[0], /^work\/製作進度\.md 開工決策表「版式」是直式，plan\.json 沒寫 format → plan\.json 第一層加 "format": "portrait"/);
  prog('橫式（主軌 1920×1080）');
  assert.match(formatErrors({ projectDir: d, plan: { format: 'portrait' }, format: 'portrait' })[0], /^plan\.json 的 format 是 "portrait"（直式），work\/製作進度\.md 開工決策表「版式」是橫式 → 兩邊改成一樣/);
  assert.match(formatErrors({ format: 'landscape', dims: { w: 1080, h: 1920 } })[0], /^主軌是直的（1080×1920），版式是橫式 →/);
  assert.match(formatErrors({ format: 'portrait', dims: { w: 1920, h: 1080 } })[0], /^直式專案的主軌是橫的（1920×1080）→ 請提供直拍素材（寬 < 高）/);
  fs.rmSync(d, { recursive: true, force: true });
  // 字數：13 字橫式不報、直式報 10；10 字直式不報（估寬 834＝maxW）
  const c13 = [{ n: 1, text: '一二三四五六七八九十一二三', start: 1, end: 3 }];
  assert.deepEqual(captionWarnings([{ n: 2, text: '一二三四五六七八九十', start: 1, end: 3 }], V), []);
  assert.deepEqual(captionWarnings(c13), []);
  assert.deepEqual(captionWarnings(c13, L), []);
  assert.deepEqual(captionWarnings(c13, V), ['字幕 #1「一二三四五六七八九十一二三」13 字，超過 10 字 → 在 rough.srt 拆成兩則（斷在標點處）']);
  const cap = buildCaptions(c13, { duration: 5, canvas: V }).html;
  assert.match(cap, /data-width="1080" data-height="1920" data-format="portrait"/);
  assert.match(buildCaptions(c13, { duration: 5 }).html, /data-width="1920" data-height="1080" data-duration/);
});

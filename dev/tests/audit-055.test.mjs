// 055 包 A：作者回饋變成的 audit 檢查（specs/055-feedback-guards-impl/A.md）
//   假的量測資料驗判定（judgeFeedback、matteGlyphFindings、bindLateFindings），最後一個測試真的開 HyperFrames 的 Chrome
//   量大字斷行、逐字框、svg 線的取樣（找不到 Chrome 或 runtime 時略過）
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { imp, TEMPLATE } from './helpers.mjs';

const R = await imp('lib/audit-rules.mjs');
const B = await imp('lib/audit-browser.mjs');
const { CANVAS: C } = await imp('lib/canvas.mjs');
const tmps = [];
after(() => { for (const d of tmps) fs.rmSync(d, { recursive: true, force: true }); });

let n = 0;
const el = (o) => ({
  i: o.i ?? n++, tag: o.tag || 'div', desc: { id: '', cls: '', text: '', near: '', ...(o.desc || {}) },
  rect: o.rect, inner: o.inner || o.rect, text: !!o.textRect, textRect: o.textRect || null, inkRect: o.inkRect || null,
  fontSize: o.fontSize ?? 52, scale: 1, whiteSpace: 'normal', painted: !!o.painted, frame: o.frame ?? !!o.painted, box: !!o.painted, media: !!o.media,
  full: !!o.full, bg: !!o.bg, round: !!o.round, kit: false, clipX: !!o.clipX, clipY: !!o.clipY, constraint: -1, clips: o.clips || [], parent: o.parent ?? -1,
  anc: o.anc || [], moving: !!o.moving, alpha: o.alpha ?? 1, allowOverflow: !!o.allowOverflow, allowOverlap: !!o.allowOverlap, allowUneven: !!o.allowUneven,
  allowRepeat: !!o.allowRepeat, justify: o.justify || '', disp: o.disp || 'block', pad: o.pad || [0, 0, 0, 0], bw: [0, 0, 0, 0],
});
const item = (o = {}) => ({ id: 'x01', type: 'custom', label: 'custom x-design-x01.html', start: 10, end: 18, D: 8, seg: { layout: 'overlay', design: true }, ...o });
const pl = R.portraitPlan(item(), C.portrait);
const judge = (els, o = {}) => R.judgeFeedback({ els, ...(o.meas || {}) }, { item: item(o.item), t: 17.4, kind: o.kind || 'done', layout: o.layout || 'overlay', W: 1920, H: 1080, ...(o.ctx || {}) });
const rules = (f, r = null) => f.filter((x) => !r || x.rule === r).map((x) => `${x.level}:${x.rule}`);
const only = (f, r) => f.filter((x) => x.rule === r);

test('Q3：直式字級下限 48（CANVAS.portrait.minTextPx），縮放段寫字下限照縮放換算；053 全幕版用 full 舞台', () => {
  assert.equal(C.portrait.minTextPx, 48);
  assert.equal(C.landscape.minTextPx, 30, '橫式不變');
  assert.equal(pl.geo.minFont, 48);
  assert.equal(R.stageKindOf({ type: 'scene', full: true, scene: { no: '04a', portrait: 'stage' } }), 'full');
  const full = R.portraitPlan({ type: 'scene', full: true, scene: { no: '04a', portrait: 'stage' } }, C.portrait);
  assert.equal(full.stage.s, 0.5952);
  assert.equal(full.stage.view[3], 1024.5, '全幕版看得到的下緣是講者面板頂 y 900（換回子合成座標）');
  for (const [k, need] of [['fs', 57], ['ch', 77], ['full', 81]]) {
    const st = R.portraitPlan(k === 'ch' ? { type: 'scene', scene: { no: '01', portrait: 'stage' } } : k === 'full' ? { type: 'scene', full: true, scene: { no: '04a' } } : item({ opaque: true, seg: { layout: 'fullscreen' } }), C.portrait).stage;
    assert.equal(Math.ceil(st.minFont / st.s), need, k);
  }
});

test('C04 ✖ text-cut：allow-overflow 的大字超出畫面左右下緣、被裁切的祖先切掉照樣報；只頂到上緣（平台區）不報；沒 allow-overflow 的交給「超出畫面」', () => {
  const w = (o) => el({ fontSize: 300, allowOverflow: true, desc: { cls: 'xds-ch', near: 'xds-w2a', text: o.t }, rect: o.r, textRect: o.r, inkRect: o.r, ...o });
  const geo = { ctx: { W: 1080, H: 1920, geo: pl.geo } };
  const blk = { desc: { id: 'xds-w2a', cls: '', text: '每個都', near: '' }, fs: 300, lines: 1, br: 0, ws: 'nowrap', moving: false, rect: [-120, 300, 780, 600] };
  const f = judge([w({ t: '每', r: [-120, 300, 180, 600] }), w({ t: '個', r: [180, 300, 480, 600] }), w({ t: '都', r: [480, 300, 780, 600] })], { ...geo, meas: { bigText: [blk] } });
  assert.deepEqual(rules(f, 'text-cut'), ['error:text-cut'], '同一行的字併成一則');
  f.splice(0, f.length, ...only(f, 'text-cut'));
  assert.match(f[0].msg, /^大字被切掉：#xds-w2a「每個都」超出畫面左邊 120px（data-layout-allow-overflow 只放行字頂到上緣，不放行字被切）$/);
  assert.match(f[0].fix, /拆成兩行（<br> 斷在語意處），整句留在 x 0–1080 以內/);
  assert.deepEqual(rules(judge([w({ t: '新', r: [100, 60, 400, 360] })], geo), 'text-cut'), [], '頂到上緣（y < 240 的平台區）不算被切');
  assert.deepEqual(rules(judge([w({ t: '新', r: [100, -40, 400, 260] })], geo), 'text-cut'), [], '上緣超出也放行（只量左右下）');
  assert.deepEqual(rules(judge([w({ t: '新', r: [100, 1700, 400, 2000] })], geo), 'text-cut'), ['error:text-cut']);
  assert.deepEqual(rules(judge([w({ t: '新', r: [-50, 300, 250, 600], allowOverflow: false })], geo), 'text-cut'), [], '沒有 allow-overflow 的由 judgeSample「超出畫面」報');
  assert.deepEqual(rules(judge([w({ t: '新', r: [100, 300, 400, 600], moving: true })], geo)), [], '動畫中不判');
  // 被會裁切的祖先切掉
  const K = el({ i: 900, rect: [0, 0, 600, 500], painted: true, clipX: true, clipY: true, desc: { id: 'xds-box' } });
  const g = judge([K, w({ t: '新', r: [300, 100, 700, 400], clips: [900] })], geo);
  assert.match(only(g, 'text-cut')[0].msg, /被 #xds-box 裁掉，超出右邊 100px/);
  // 捲動清單捲走的列（整列在裁切框外，範本 x50）、跑馬燈／字牆（比畫面寬 1.5 倍，範本 x42）不算被切
  assert.deepEqual(rules(judge([K, w({ t: '01', r: [50, -900, 400, -800], clips: [900] })], geo), 'text-cut'), [], '捲走了');
  assert.deepEqual(rules(judge([w({ t: '剪輯師', r: [-40, 300, 5400, 600] })], geo), 'text-cut'), [], '跑馬燈');
  // 只量內容設計段：x-* 模板（custom、沒有 design）不量
  assert.deepEqual(rules(judge([w({ t: '新', r: [100, 1700, 400, 2000] })], { ...geo, item: { seg: { layout: 'overlay' } } })), [], '模板');
  assert.deepEqual(rules(judge([w({ t: '新', r: [100, 1700, 400, 2000] })], { item: { seg: { layout: 'overlay' } }, ctx: { ...geo.ctx, hand: true } }), 'text-cut'), ['error:text-cut'], '手改過的模板檔照量');
  // 直式縮放段：看得到的範圍（view）以外
  const fsPl = R.portraitPlan(item({ opaque: true, seg: { layout: 'fullscreen', design: true } }), C.portrait);
  const s = judge([w({ t: '大', r: [20, 300, 320, 600] })], { layout: 'fullscreen', ctx: { stage: fsPl.stage } });
  assert.match(only(s, 'text-cut')[0].msg, /超出畫面左邊 52\.8px/);
});

test('C04 ✖ unsafe：allow-overflow 的字只放行頂部平台區，下方與右側按鈕列照樣報', () => {
  const nj = (e) => R.judgeSample({ host: { start: 10 }, els: [e] }, { item: item(), t: 17.4, kind: 'done', layout: 'overlay', W: 1080, H: 1920, geo: pl.geo });
  const t = (r) => el({ rect: r, textRect: r, fontSize: 200, allowOverflow: true, desc: { id: 'big' } });
  assert.deepEqual(nj(t([100, 100, 900, 300])).filter((x) => x.rule === 'unsafe'), []);
  assert.equal(nj(t([100, 1400, 900, 1600])).filter((x) => x.rule === 'unsafe').length, 1);
  assert.deepEqual(nj(el({ rect: [100, 1400, 900, 1600], painted: true, allowOverflow: true })).filter((x) => x.rule === 'unsafe'), [], '裝飾（不是字）照舊放行');
});

test('C04 ⚠ text-wrap：字級 ≥ 120、沒有 nowrap、排出來的行數比 <br> 多', () => {
  const b = (o) => ({ desc: { id: 'xds-big', cls: '', text: '每個都要學？', near: '' }, fs: 240, lines: 2, br: 0, ws: 'normal', moving: false, rect: [0, 0, 1080, 500], ...o });
  const f = judge([], { meas: { bigText: [b()] } });
  assert.deepEqual(rules(f), ['warn:text-wrap']);
  assert.equal(f[0].msg, '大字自動換行：#xds-big「每個都要學？」排成 2 行（只寫了 0 個 <br>）');
  assert.equal(f[0].fix, '用 <br> 斷在語意處，或縮短、縮小一級');
  assert.deepEqual(rules(judge([], { meas: { bigText: [b({ br: 1 })] } })), [], '<br> 斷的不報');
  assert.deepEqual(rules(judge([], { meas: { bigText: [b({ ws: 'nowrap', lines: 1 })] } })), []);
  assert.deepEqual(rules(judge([], { meas: { bigText: [b({ moving: true })] } })), []);
});

test('C03 ⚠ line-cross：線的取樣點穿過字（外擴 4px）或卡片；線頭、線尾接著卡片（連接線）不算；圓（封閉）穿過就算', () => {
  const svg = el({ i: 500, tag: 'svg', rect: [0, 0, 1920, 1080], media: true, desc: { id: 'xd-orbit' } });
  const card = el({ i: 501, rect: [800, 400, 1200, 600], painted: true, desc: { id: 'xd-chat' } });
  const word = el({ i: 502, rect: [820, 420, 1000, 470], textRect: [820, 420, 1000, 470], parent: 501, anc: [501], desc: { text: '亂掉' } });
  const pts = (a, b, k = 40) => Array.from({ length: k + 1 }, (_, j) => [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  const f = judge([svg, card, word], { meas: { lines: [{ svg: 500, tag: 'path', id: 'orbit1', pts: pts([600, 500], [1400, 500]), closed: false, moving: false }] }, kind: 'still' });
  assert.deepEqual(rules(f, 'line-cross'), ['warn:line-cross'], '只量靜止的，不用等完成態');
  f.splice(0, f.length, ...only(f, 'line-cross'));
  assert.equal(f[0].msg, '線穿過字／卡片：#xd-orbit 的 <path id="orbit1"> 穿過 #xd-chat 1 處');
  assert.match(f[0].fix, /至少隔 24px.*data-layout-allow-overlap/);
  // 連接線：一端在卡片裡（線頭）不算
  assert.deepEqual(rules(judge([svg, card], { meas: { lines: [{ svg: 500, tag: 'line', id: '', pts: pts([1000, 500], [1600, 500]), closed: false, moving: false }] } })), []);
  // 圓：起點終點在一起，穿過卡片的那一段即使包含起點也算
  const circle = Array.from({ length: 81 }, (_, j) => [1000 + 300 * Math.cos((2 * Math.PI * j) / 80), 500 + 300 * Math.sin((2 * Math.PI * j) / 80)]);
  assert.deepEqual(rules(judge([svg, card], { meas: { lines: [{ svg: 500, tag: 'circle', id: '', pts: circle, closed: true, moving: false }] } })), [], '圓在卡片外面繞');
  // 卡片外擴 12px：線擦過卡角（短影片2 x0101 v2）算；沿著卡片底下走的地平線（短影片1 x0108）不算
  const graze = Array.from({ length: 81 }, (_, j) => [1000 + 290 * Math.cos((2 * Math.PI * j) / 80), 500 + 290 * Math.sin((2 * Math.PI * j) / 80)]);
  assert.deepEqual(rules(judge([svg, el({ i: 504, rect: [800, 400, 1200, 600], painted: true, desc: { id: 'xd-c2' } })], { meas: { lines: [{ svg: 500, tag: 'circle', id: '', pts: graze.map(([x, y]) => [x, y]), closed: true, moving: false }] } }), 'line-cross'), [], '離卡角 > 12px');
  const corner = Array.from({ length: 81 }, (_, j) => [1000 + 228 * Math.cos((2 * Math.PI * j) / 80), 500 + 228 * Math.sin((2 * Math.PI * j) / 80)]);
  assert.deepEqual(rules(judge([svg, card], { meas: { lines: [{ svg: 500, tag: 'circle', id: '', pts: corner, closed: true, moving: false }] } }), 'line-cross'), ['warn:line-cross'], '擦過卡角');
  assert.deepEqual(rules(judge([svg, card], { meas: { lines: [{ svg: 500, tag: 'line', id: 'ground', pts: pts([700, 606], [1300, 606]), closed: false, moving: false }] } }), 'line-cross'), [], '地平線');
  // 箭頭頭（總長 < 80px）本來就要碰目標框（範本 x02、x16）
  assert.deepEqual(rules(judge([svg, card], { meas: { lines: [{ svg: 500, tag: 'path', id: 'a-head', pts: [...pts([776, 482], [806, 500], 5), ...pts([806, 500], [776, 518], 5).slice(1)], closed: false, moving: false }] } }), 'line-cross'), [], '箭頭頭');
  assert.deepEqual(rules(judge([svg, card], { meas: { lines: [{ svg: 500, tag: 'path', id: 'long', pts: [...pts([736, 458], [806, 500], 10), ...pts([806, 500], [736, 542], 10).slice(1)], closed: false, moving: false }] } }), 'line-cross'), ['warn:line-cross'], '同樣的形狀放大（總長 > 80）照報');
  const big = el({ i: 503, rect: [1250, 450, 1400, 560], textRect: [1250, 450, 1400, 560], desc: { id: 'xd-lab', text: '流程' } });
  assert.match(judge([svg, big], { meas: { lines: [{ svg: 500, tag: 'circle', id: '', pts: circle, closed: true, moving: false }] } })[0].msg, /穿過 #xd-lab「流程」 1 處/);
  assert.deepEqual(rules(judge([svg, { ...card, allowOverlap: true }], { meas: { lines: [{ svg: 500, tag: 'path', id: '', pts: pts([600, 500], [1400, 500]), closed: false, moving: false }] } })), []);
  assert.deepEqual(rules(judge([svg, card], { meas: { lines: [{ svg: 500, tag: 'path', id: '', pts: pts([600, 500], [1400, 500]), closed: false, moving: true }] } })), [], '描線中不判');
});

test('N1 ⚠ card-space：有底色的卡（≥ 300×200）字只占 < 15%、字還能放大 ≥ 1.4 倍；圖示算內容；直式縮放段換成畫面 px', () => {
  const card = el({ i: 600, rect: [100, 100, 900, 600], painted: true, desc: { id: 'xd-card' }, pad: [40, 40, 40, 40] });
  const small = el({ i: 601, rect: [140, 140, 440, 200], textRect: [140, 140, 440, 200], fontSize: 48, parent: 600, anc: [600], desc: { text: '只要一句' } });
  const f = only(judge([card, small]), 'card-space');
  assert.deepEqual(rules(f), ['warn:card-space']);
  assert.match(f[0].msg, /^卡片空太多：#xd-card（800×500）裡的字只占 5%，旁邊大片空白$/);
  assert.match(f[0].fix, /^字可以放大到約 \d+px（最大的字現在 48px），或卡片縮小到貼著內容（內距 ≥ 24px）$/);
  const big = { ...small, rect: [140, 140, 860, 400], textRect: [140, 140, 860, 400], fontSize: 160 };
  assert.deepEqual(rules(judge([card, big]), 'card-space'), [], '字撐滿了');
  const icon = el({ i: 602, tag: 'svg', rect: [140, 220, 860, 560], media: true, parent: 600, anc: [600] });
  assert.deepEqual(rules(judge([card, small, icon]), 'card-space'), [], '圖示算內容');
  assert.deepEqual(rules(judge([card, small], { kind: 'mid' }), 'card-space'), [], '只量完成態');
  assert.deepEqual(rules(judge([{ ...card, rect: [100, 100, 380, 600] }, small]), 'card-space'), [], '寬 < 300 不量');
  assert.deepEqual(rules(judge([card])), [], '沒有字的卡（圖片卡）不量');
  // 直式縮放段：0.5952 倍時 800×500 → 476×298，照樣量；400×300 → 238×179 不量
  const full = R.portraitPlan({ type: 'scene', full: true, scene: { no: '04a' } }, C.portrait);
  assert.deepEqual(rules(judge([card, small], { layout: 'fullscreen', ctx: { stage: full.stage } }), 'card-space'), ['warn:card-space']);
  assert.deepEqual(rules(judge([{ ...card, rect: [100, 100, 500, 400] }, { ...small, rect: [140, 140, 200, 160], textRect: [140, 140, 200, 160] }], { layout: 'fullscreen', ctx: { stage: full.stage } }), 'card-space'), []);
});

test('N2 ⚠ sibling-width：同一個父層 ≥ 3 張同 class 的卡寬度差 > 10%；data-allow-uneven、高 < 100 的膠囊、兩張不報', () => {
  const P = el({ i: 700, rect: [100, 100, 1500, 800], desc: { id: 'xd-list' } });
  const c = (i, w, o = {}) => el({ i, rect: [100, 100 + 150 * (i - 700), 100 + w, 230 + 150 * (i - 700)], painted: true, parent: 700, anc: [700], desc: { cls: 'xd-item' }, ...o });
  const f = judge([P, c(701, 600), c(702, 600), c(703, 700)]);
  assert.deepEqual(rules(f), ['warn:sibling-width']);
  assert.equal(f[0].msg, '同一組卡片寬度不一致：#xd-list 底下 3 張 .xd-item 寬 600–700px');
  assert.equal(f[0].fix, '同寬（都改成 700px，取最寬的）；刻意不同寬加 data-allow-uneven');
  assert.deepEqual(rules(judge([P, c(701, 600), c(702, 600), c(703, 650)])), [], '差 8% 不報');
  assert.deepEqual(rules(judge([P, c(701, 600), c(702, 600), c(703, 700, { allowUneven: true })])), []);
  assert.deepEqual(rules(judge([P, c(701, 600), c(703, 700)])), [], '兩張不算一組');
  const pill = (i, w) => el({ i, rect: [100 + 300 * (i - 710), 100, 100 + 300 * (i - 710) + w, 170], painted: true, parent: 700, anc: [700], desc: { cls: 'xd-pill' } });
  assert.deepEqual(rules(judge([P, pill(710, 120), pill(711, 200), pill(712, 260)])), [], '膠囊（高 < 100）照字長');
  // 金字塔（一路變寬，短影片1 x0108）、照片牆（卡裡有圖片，主宣傳片 m0106）、模板（主宣傳片 s0104 關鍵詞）都不報
  assert.deepEqual(rules(judge([P, c(701, 480), c(702, 640), c(703, 800), c(704, 960)])), [], '金字塔');
  const img = el({ i: 799, rect: [110, 410, 690, 520], media: true, parent: 703, anc: [703, 700] });
  assert.deepEqual(rules(judge([P, c(701, 600), c(702, 700), c(703, 600), img]), 'sibling-width'), [], '照片牆');
  assert.deepEqual(rules(judge([P, c(701, 600), c(702, 600), c(703, 700)], { item: { type: 'scene' } })), [], '模板');
});

test('C06 ⚠ hcenter：色塊裡的內容群左右留白差 > max(24, 寬 4%)；data-justify 不報；直式疊加段整組離安全區中心 > 48', () => {
  const box = el({ i: 800, rect: [100, 100, 1100, 700], painted: true, desc: { id: 'xd-panel' } });
  const logo = (i, x) => el({ i, tag: 'img', rect: [x, 300, x + 120, 420], media: true, parent: 800, anc: [800] });
  const f = judge([box, logo(801, 140), logo(802, 280), logo(803, 420)]);
  assert.deepEqual(rules(f), ['warn:hcenter']);
  assert.equal(f[0].msg, '內容沒置中：#xd-panel 裡左 40、右 560px');
  assert.equal(f[0].fix, '整組往右移 260px（每個元素的 left +260）；刻意靠一邊加 data-justify="start"／"end"');
  assert.deepEqual(rules(judge([box, logo(801, 400), logo(802, 540), logo(803, 680)])), [], '置中');
  assert.deepEqual(rules(judge([{ ...box, justify: 'start' }, logo(801, 140), logo(802, 280), logo(803, 420)])), []);
  // 當成背景的側欄（高撐滿、寬不滿；主宣傳片 s0101 v4 左右兩塊）也是色塊；整張的底不算
  const side = el({ i: 810, rect: [0, 0, 486, 1080], painted: true, bg: true, desc: { id: 'xd-left' } });
  const bot = (x) => el({ i: 811, rect: [x, 400, x + 348, 700], painted: true, round: false, parent: 810, anc: [810], desc: { id: 'xd-bot' } });
  assert.equal(only(judge([side, bot(130)]), 'hcenter')[0].msg, '內容沒置中：#xd-left 裡左 130、右 8px');
  assert.deepEqual(rules(judge([side, bot(69)]), 'hcenter'), []);
  assert.deepEqual(rules(judge([{ ...side, rect: [0, 0, 1920, 1080], full: true }, bot(130)]), 'hcenter'), [], '整張的底');
  // 字靠左是排版（不管）；逐一出現的中途偏一邊不算（只量完成態）
  const para = el({ i: 804, rect: [140, 200, 500, 300], textRect: [140, 200, 500, 300], parent: 800, anc: [800], disp: 'inline-block', desc: { text: '一段左對齊的字' } });
  assert.deepEqual(rules(judge([box, para]), 'hcenter'), []);
  assert.deepEqual(rules(judge([box, logo(801, 140), logo(802, 280), logo(803, 420)], { kind: 'still' }), 'hcenter'), []);
  // 直式疊加段（原生 1080×1920）：標誌方陣 x 68–870，安全區 x 60–1020 的中心 540
  const tiles = [0, 1, 2, 3, 4, 5].map((k) => el({ i: 820 + k, rect: [68 + 136 * k, 660, 188 + 136 * k, 780], painted: true, desc: { cls: 'xds-tile' } }));
  const g = judge(tiles, { ctx: { W: 1080, H: 1920, geo: pl.geo } });
  assert.deepEqual(rules(g).filter((r) => r.endsWith('hcenter')), ['warn:hcenter']);
  assert.match(only(g, 'hcenter')[0].msg, /^內容沒置中：.xds-tile 等 6 個 x 68–868，中心 468；安全區 x 60–1020 的中心是 540（差 72px）$/);
  assert.match(only(g, 'hcenter')[0].fix, /^整組往右移 72px → 移完在 x 140–940/);
  assert.deepEqual(rules(judge(tiles.map((t) => ({ ...t, rect: [t.rect[0] + 72, t.rect[1], t.rect[2] + 72, t.rect[3]] })), { ctx: { W: 1080, H: 1920, geo: pl.geo } })).filter((r) => r.endsWith('hcenter')), []);
  assert.deepEqual(rules(judge(tiles)).filter((r) => r.endsWith('hcenter')), [], '橫式疊加段在講者旁邊，本來就不置中');
  // 圖左字右是一組（短影片1 s0101 積木＋「隨時會崩潰」）：字排在整組旁邊就算進去；疊在東西上面的大字不算（短影片4 s0101 標誌牆）
  const P = { ctx: { W: 1080, H: 1920, geo: pl.geo } };
  const bricks = [0, 1].map((k) => el({ i: 830 + k, rect: [80, 500 + 140 * k, 480, 620 + 140 * k], painted: true, desc: { cls: 'xds-brick' } }));
  const word = (i, r) => el({ i, rect: r, textRect: r, desc: { text: '隨時會崩潰' } });
  assert.deepEqual(rules(judge([...bricks, word(840, [540, 520, 1000, 640])], P), 'hcenter'), [], '旁邊的字');
  assert.deepEqual(rules(judge([...tiles, word(841, [200, 600, 960, 740])], P), 'hcenter'), ['warn:hcenter'], '疊在上面的大字');
});

test('C07 ⚠ dup-word（設計段）：兩個字元素有同一個詞；同一組並排的項目、data-allow-repeat、壓暗的、模板段不報', () => {
  const t = (i, text, o = {}) => el({ i, rect: [100, 100 * i, 600, 100 * i + 60], textRect: [100, 100 * i, 600, 100 * i + 60], desc: { id: `xd-${i}`, text }, ...o });
  const f = judge([t(1, '課程'), t(2, '加入課程')]);
  assert.deepEqual(rules(f), ['warn:dup-word']);
  assert.equal(f[0].msg, '同一個詞出現兩次：#xd-1「課程」 和 #xd-2「加入課程」 都有「課程」');
  assert.match(f[0].fix, /標籤換成別的詞.*data-allow-repeat/);
  assert.deepEqual(rules(judge([t(1, '行動'), t(2, '加入課程')])), []);
  assert.deepEqual(rules(judge([t(1, '課程'), t(8, '加入課程')])), [], '不是上下相鄰的兩行（標題和圖上的標籤）');
  assert.deepEqual(rules(judge([t(1, '課程', { allowRepeat: true }), t(2, '加入課程')])), []);
  assert.deepEqual(rules(judge([t(1, '課程', { alpha: 0.25 }), t(2, '加入課程')])), [], '壓暗的上一組不算');
  assert.deepEqual(rules(judge([t(1, '步驟一', { parent: 9, desc: { cls: 'xd-step', text: '步驟一' } }), t(2, '步驟二', { parent: 9, desc: { cls: 'xd-step', text: '步驟二' } })])), [], '同一組並排');
  assert.deepEqual(rules(judge([t(1, '很多人'), t(2, '用對的人')])), [], '「的人」這種虛字詞不算');
  assert.deepEqual(rules(judge([t(1, 'ChatGPT'), t(2, '用 chatgpt 寫')])), ['warn:dup-word'], '英文不分大小寫');
  assert.deepEqual(rules(judge([t(1, '課程'), t(2, '加入課程')], { item: { type: 'scene', seg: {} } })), [], '模板段由 --check 比 slots');
  assert.deepEqual([...R.wordsOf('AI 工作流 n8n')].sort(), ['n8n', '作流', '工作']);
});

test('C08 ⚠ text-heavy：疊在講者身上的段完成態 > 24 字（不算數字，英文一個詞算一字）；全畫面、直式縮放段不量', () => {
  const t = (i, text) => el({ i, rect: [100, 100 * i, 900, 100 * i + 60], textRect: [100, 100 * i, 900, 100 * i + 60], desc: { id: `xd-t${i}`, text } });
  const heavy = [t(1, '這一段放了很多很多字'), t(2, '每一行都在解釋細節'), t(3, '觀眾根本來不及讀完')];
  const f = judge(heavy);
  assert.deepEqual(rules(f), ['warn:text-heavy']);
  assert.equal(f[0].msg, '疊在講者身上的字太多：完成態 28 字（上限 24，不算數字）');
  assert.match(f[0].fix, /留一個大字或左右兩個對比，配圖示/);
  assert.deepEqual(rules(judge([t(1, '新工具'), t(2, '2026'), t(3, 'ChatGPT Claude')])), [], '一個大字＋標誌');
  assert.deepEqual(rules(judge(heavy, { layout: 'fullscreen' }), 'text-heavy'), []);
  assert.deepEqual(rules(judge(heavy, { ctx: { stage: { kind: 'fs', s: 0.8475, window: [120, 130, 1300, 880], view: [0, 0, 1920, 1080] } } }), 'text-heavy'), []);
  assert.deepEqual(rules(judge(heavy, { kind: 'mid' })), []);
});

test('C05 ⚠ matte-glyph：大字被講者擋 > 10% 算擋到；擋到 > 1 個字、或一個字 > 50% 報；data-matte-front 的洞不算', () => {
  // 1080×1920 畫面、遮罩 108×192（10px 一格）；講者：x 400–700、y 400 以下
  const mk = (holes = []) => { const w = 108, h = 192, data = new Uint8Array(w * h); for (let y = 40; y < h; y++) for (let x = 40; x < 70; x++) data[y * w + x] = 255; return { w, h, data, W: 1080, H: 1920, holes }; };
  const g = (ch, r) => ({ ch, r, moving: false, alpha: 1, near: 'xds-w2' });
  const ctx = { item: item(), t: 17.4, kind: 'done' };
  const f = R.matteGlyphFindings([g('每', [300, 200, 500, 500]), g('個', [500, 200, 700, 500]), g('都', [700, 200, 900, 500])], mk(), ctx);
  assert.deepEqual(rules(f), ['warn:matte-glyph']);
  assert.equal(f[0].msg, '大字被講者擋太多：「每」「個」2 個字被擋，「個」擋 33%（講者頭頂在 y 400）');
  assert.match(f[0].fix, /^字往上移到頭頂上方（被擋的字現在從 y 200 開始，下緣要在 y 400 以上），或左右移開；最多擋一個字、那個字最多擋一半$/);
  assert.deepEqual(rules(R.matteGlyphFindings([g('都', [600, 200, 800, 500])], mk(), ctx)), [], '只擋一個字、17%');
  assert.deepEqual(rules(R.matteGlyphFindings([g('學', [400, 300, 700, 600])], mk(), ctx)), ['warn:matte-glyph'], '一個字擋 > 50%');
  assert.deepEqual(rules(R.matteGlyphFindings([g('每', [300, 200, 500, 500]), g('個', [500, 200, 700, 500])], mk([[300, 0, 400, 1920]]), ctx)), [], '洞裡（字在講者前面）不算');
  assert.deepEqual(rules(R.matteGlyphFindings([g('每', [300, 200, 500, 500]), { ...g('個', [500, 200, 700, 500]), moving: true }], mk(), ctx)), [], '動畫中的字不算');
  assert.deepEqual(R.matteGlyphFindings([g('每', [300, 200, 500, 500])], null, ctx), [], '沒有遮罩（還沒 build）不量');
});

test('N7 ⚠ bind-late：綁 #N@詞、那一拍出現的字在第 N 句比詞更早就開始講，差 > 0.5 秒 → 綁到開頭那個詞', () => {
  const cues = [{ n: 46, text: '但真正用對的人很少', start: 10, end: 12.7 }];
  const mo = (ref, say) => ({ marks: [{ ref, t: 2.4 }], tweens: [{ start: 2.4, end: 2.8, kind: 'enter', up: true, targets: [{ desc: { id: 'xd-k', cls: '', text: say, near: '' }, say }] }] });
  const it = item({ start: 8.5, end: 16 });
  const f = R.bindLateFindings(mo('#46@少', '用對的人很少'), { item: it, cuesOut: cues, names: { '#46@少': 'T1' } });
  assert.deepEqual(rules(f), ['warn:bind-late']);
  assert.match(f[0].msg, /^卡上的字比講的晚：「用對的人很少」在 #46 講到「用對的人」（0:10\.\d\d）就開始了，T1 = P\.at\('#46@少'\) 晚 1\.\d\ds$/);
  assert.match(f[0].fix, /^綁 #46@用對的人：T1 改 P\.at\('#46@用對的人'\)/);
  assert.deepEqual(R.bindLateFindings(mo('#46@用對', '用對的人很少'), { item: it, cuesOut: cues }), [], '綁在開頭');
  assert.deepEqual(R.bindLateFindings(mo('#46@很少', '很少'), { item: it, cuesOut: cues }), [], '卡上只有「很少」：就是講到才出現');
  assert.deepEqual(R.bindLateFindings(mo('#46@人很', '的人很少'), { item: it, cuesOut: cues }), [], '「的人」差 < 0.5 秒（而且含虛字不當起點）');
  assert.deepEqual(R.bindLateFindings(mo('#46', '用對的人很少'), { item: it, cuesOut: cues }), [], '沒綁詞不量');
});

let chrome = null, runtime = null;
try { chrome = B.chromeCandidates()[0] || null; runtime = B.findRuntime({}).file; } catch { /* 沒裝 */ }

test('055 瀏覽器實量：大字斷行（bigText）、逐字墨跡框（glyphs）、svg 線取樣（lines）', { skip: !(chrome && runtime) && '找不到 HyperFrames 的 Chrome 或 runtime（先跑 npx hyperframes browser ensure）', timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-audit-055-'));
  tmps.push(dir);
  fs.mkdirSync(path.join(dir, 'kit'));
  fs.mkdirSync(path.join(dir, 'compositions'));
  fs.copyFileSync(path.join(TEMPLATE, 'kit', 'gsap.min.js'), path.join(dir, 'kit', 'gsap.min.js'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="UTF-8"><script src="kit/gsap.min.js"></script>
<style>body{margin:0;background:#000}#main-root{position:relative;width:1080px;height:1920px;overflow:hidden}</style></head><body>
<div id="main-root" data-composition-id="main" data-start="0" data-duration="4" data-width="1080" data-height="1920" data-fps="30">
  <div id="el-s01" data-composition-id="x-q" data-composition-src="compositions/x-q.html" data-start="0" data-duration="4" data-track-index="1" data-width="1080" data-height="1920" style="z-index:20"></div>
</div>
<script>(function(){ window.__timelines = window.__timelines || {}; const tl = gsap.timeline({ paused: true }); tl.set({}, {}, 4); window.__timelines['main'] = tl; })();</script>
</body></html>`);
  fs.writeFileSync(path.join(dir, 'compositions', 'x-q.html'), `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>x-q</title></head><body>
<template id="x-q-template">
  <style>
    #x-q { position: absolute; inset: 0; }
    #x-q #xq-wrap { position: absolute; left: 60px; top: 240px; width: 900px; font-size: 240px; line-height: 1; color: #fff; }
    #x-q #xq-br { position: absolute; left: 60px; top: 900px; width: 900px; font-size: 200px; line-height: 1; color: #fff; }
    #x-q #xq-card { position: absolute; left: 200px; top: 1300px; width: 400px; height: 200px; background: #0b1020; }
    #x-q #xq-svg { position: absolute; left: 0; top: 1200px; width: 1080px; height: 400px; }
  </style>
  <div id="x-q" data-matte="1" data-composition-id="x-q" data-width="1080" data-height="1920" data-duration="4">
    <div id="xq-wrap"><span>每個都要學？</span></div>
    <div id="xq-br">都要<br>學</div>
    <div id="xq-card"></div>
    <svg id="xq-svg" viewBox="0 0 1080 400"><path id="xq-line" d="M 0 200 L 1080 200" fill="none" stroke="#fff" stroke-width="4"/><circle cx="900" cy="300" r="40" fill="#f00"/></svg>
  </div>
  <script>(function () { const tl = gsap.timeline({ paused: true }); tl.set({}, {}, 4); window.__timelines['x-q'] = tl; })();</script>
</template></body></html>`);
  const S = await B.openSession({ dir, chrome, runtime, W: 1080, H: 1920 });
  try {
    await S.seek(2);
    const m = await S.measure({ hostId: 'el-s01', W: 1080, H: 1920 });
    const wrap = m.bigText.find((b) => b.desc.id === 'xq-wrap'), br = m.bigText.find((b) => b.desc.id === 'xq-br');
    assert.ok(wrap && wrap.lines >= 2 && wrap.br === 0, JSON.stringify(m.bigText));
    assert.deepEqual([br.lines, br.br], [2, 1]);
    const f = R.judgeFeedback(m, { item: { id: 's01', type: 'custom', label: 'x-q', start: 0, end: 4, seg: { design: true } }, t: 3.4, kind: 'done', layout: 'overlay', W: 1080, H: 1920, geo: pl.geo });
    assert.deepEqual(only(f, 'text-wrap').map((x) => x.el.id), ['xq-wrap']);
    // 逐字：每個字一格、上下是墨跡（比 240px 的字框矮）
    const g = m.glyphs.filter((x) => x.near === 'xq-wrap');
    assert.equal(g.map((x) => x.ch).join(''), '每個都要學？');
    assert.ok(g.every((x) => x.r[3] - x.r[1] < 240), g.map((x) => x.r).join(' / '));
    // 線：只描邊的 path 有取樣、有填色的 circle 不算；穿過 #xq-card
    assert.deepEqual(m.lines.map((l) => l.id), ['xq-line']);
    assert.deepEqual(m.lines[0].pts[0], [0, 1400]);
    assert.match(only(f, 'line-cross')[0].msg, /#xq-svg 的 <path id="xq-line"> 穿過 #xq-card 1 處/);
  } finally { await S.close(); }
});

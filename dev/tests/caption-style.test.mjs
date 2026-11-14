// 035 字幕樣式可調（specs/035-caption-style）：樣式、字體、大小、粗細；一組設定管整支影片的每一則字幕
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { imp, TEMPLATE } from './helpers.mjs';

const C = await imp('lib/caption-style.mjs');
const { CANVAS } = await imp('lib/canvas.mjs');
const portrait = { ...CANVAS.portrait, format: 'portrait' };

test('檢查：缺的補預設、錯的欄位／值 ✖、字體沒有的粗細換成最近的（notes 說明）、null＝拿掉', () => {
  assert.deepEqual(C.sanitizeCaptionStyle({}).style, C.CAP_DEFAULT);
  assert.deepEqual(C.sanitizeCaptionStyle({ look: 'outline' }).style, { ...C.CAP_DEFAULT, look: 'outline' });
  assert.equal(C.sanitizeCaptionStyle(null).style, null);
  const bad = C.sanitizeCaptionStyle({ look: 'neon', font: 'comic', size: 200, weight: 650, color: 'red' });
  assert.equal(bad.style, undefined);
  assert.equal(bad.errors.length, 5, bad.errors.join('\n'));
  assert.match(bad.errors.join('\n'), /look 只能是 "box"（深底白字）/);
  assert.match(bad.errors.join('\n'), /size 是字級（px），60–96/);
  const hu = C.sanitizeCaptionStyle({ font: 'huninn', weight: 900 });
  assert.equal(hu.style.weight, 400);
  assert.match(hu.notes[0], /jf open 粉圓沒有「特粗」\(900\)，用 400（一般）/);
  assert.equal(C.sanitizeCaptionStyle({ font: 'wenkai', weight: 500 }).style.weight, 400, '500 離 400 比較近');
  assert.equal(C.sanitizeCaptionStyle({ font: 'wenkai', weight: 900 }).style.weight, 700);
  assert.match(C.sanitizeCaptionStyle('outline').errors[0], /要寫成 \{ "look"/);
});

test('取用順序：這一集 plan.json captionStyle → shared/setting.json captions → F8；寫錯退回 F8 並報錯', () => {
  const plan = { captionStyle: { look: 'yellow' } }, settings = { captions: { look: 'outline', size: 84 } };
  assert.deepEqual(C.resolveCaptionStyle({ plan, settings }).style, { ...C.CAP_DEFAULT, look: 'yellow', size: 84 }, '這一集只寫 look：大小照預設');
  assert.equal(C.resolveCaptionStyle({ plan, settings }).from, 'plan');
  assert.deepEqual(C.resolveCaptionStyle({ plan: {}, settings }).style, { ...C.CAP_DEFAULT, look: 'outline', size: 84 });
  assert.equal(C.resolveCaptionStyle({ plan: {}, settings }).from, 'setting');
  const d = C.resolveCaptionStyle({});
  assert.deepEqual([d.from, d.isDefault], ['default', true]);
  const e = C.resolveCaptionStyle({ plan: { captionStyle: { size: 10 } }, settings });
  assert.equal(e.isDefault, true);
  assert.match(e.errors[0], /plan\.json captionStyle\.size/);
  assert.equal(C.resolveCaptionStyle({ plan: { captionStyle: { look: 'box' } } }).isDefault, true, '寫了但和預設一樣＝預設');
  assert.equal(C.resolveCaptionStyle({ plan: { captionStyle: { look: 'box', font: 'noto-sans', size: 76, weight: 400 } }, settings }).isDefault, true, '這一集明寫原本的樣子，不套預設');
  const bad = C.resolveCaptionStyle({ plan: {}, settings: { captions: { look: 'neon' } } });
  assert.deepEqual([bad.isDefault, bad.errors.length], [true, 1], '預設寫錯：退回 F8 並報錯');
});

test('幾何：76 px＝F8（橫式底板 y 956–1074、直式 1291–1409）；96 px 底板頂還在字幕區（≥ 920）；直式最大 76', () => {
  const g = C.captionGeom(C.CAP_DEFAULT);
  assert.deepEqual([g.size, g.line, g.pad, g.bottom, g.top, g.low], [76, 71, [24, 37, 23, 37], 6, 956, 1074]);
  const p = C.captionGeom(C.CAP_DEFAULT, portrait);
  assert.deepEqual([p.bottom, p.top, p.low], [511, 1291, 1409]);
  assert.equal(p.top, CANVAS.portrait.caption.box[1]);
  const big = C.captionGeom({ ...C.CAP_DEFAULT, size: 96 });
  assert.ok(big.top >= 920 && big.low === 1074, JSON.stringify(big));
  assert.ok(18 * big.size + big.padW <= 1840, '18 字還放得下');
  const bp = C.captionGeom({ ...C.CAP_DEFAULT, size: 96 }, portrait);
  assert.equal(bp.size, 76);
  const small = C.captionGeom({ ...C.CAP_DEFAULT, size: 60 }, portrait);
  assert.equal(small.size, 60);
  assert.equal(Math.round((small.top + small.low) / 2), 1350, '直式置中在字幕帶');
});

test('root 屬性：預設回空字串（輸出和以前一樣）；其他樣式帶 data-cap 和 CSS 變數；字體用另外的家族名＋思源黑體備援', () => {
  assert.equal(C.captionRootAttrs(C.CAP_DEFAULT), '');
  const a = C.captionRootAttrs({ look: 'outline', font: 'wenkai', size: 84, weight: 700 });
  assert.match(a, /^ data-cap="outline" style="/);
  assert.match(a, /--cap-family: &quot;LXGW WenKai TC&quot;, &quot;Noto Sans TC&quot;, sans-serif/);
  assert.match(a, /--cap-size: 84px; --cap-line: 78px; --cap-pad: 27px 41px 25px 41px; --cap-bottom: 6px; --cap-stroke: 10px/);
  assert.match(C.captionRootAttrs({ ...C.CAP_DEFAULT, weight: 700 }), /data-cap="box".*--cap-family: var\(--cap-font\)/);
});

test('字型檔：五個字體都在 kit/fonts（跟著 repo，有授權檔）；文楷照粗細只用那一個檔；宋體是可變字型；@font-face 指到 kit/fonts', () => {
  assert.deepEqual(C.fontFiles(C.CAP_DEFAULT), []);
  assert.equal(C.captionFontFace(C.CAP_DEFAULT), '');
  assert.deepEqual(C.fontFiles({ ...C.CAP_DEFAULT, font: 'wenkai', weight: 700 }).map((x) => x.file), ['LXGWWenKaiTC-Bold.ttf']);
  assert.deepEqual(C.fontFiles({ ...C.CAP_DEFAULT, font: 'noto-serif', weight: 900 }).map((x) => x.file), ['NotoSerifTC-VF.ttf']);
  assert.equal(C.captionFontFace({ ...C.CAP_DEFAULT, font: 'huninn' }), '@font-face { font-family: "Huninn"; src: url("kit/fonts/Huninn-Regular.ttf") format("truetype"); font-weight: 400; font-display: block; }');
  assert.equal(Object.keys(C.CAP_FONTS).length, 6, '思源黑體＋5 個開源字體');
  // build 複製 kit 時只留這一集選到的：另外的字型檔＋它們的授權檔；內建的 OFL-NotoSansTC.txt 不在裡面
  assert.ok(C.EXTRA_FONT_FILES.includes('OFL-LXGWWenKaiTC.txt') && C.EXTRA_FONT_FILES.includes('OFL-NotoSerifTC.txt'));
  assert.ok(!C.EXTRA_FONT_FILES.some((f) => /NotoSansTC|GoogleSansFlex|JetBrainsMono/.test(f)));
  for (const f of C.EXTRA_FONT_FILES) assert.ok(fs.statSync(path.join(TEMPLATE, 'kit', 'fonts', f)).size > 1000, `kit/fonts/${f} 要在 repo 裡`);
  assert.equal(C.describeCaptionStyle({ look: 'outline', font: 'wenkai', size: 84, weight: 700 }), '白字黑框、霞鶩文楷 84 px 粗');
});

test('上下位置：橫式 0–400（只能往上）、直式 ±350；幾何照 lift 移；超出範圍 ✖；換版式夾回範圍', () => {
  const up = C.captionGeom({ ...C.CAP_DEFAULT, lift: 120 });
  assert.deepEqual([up.bottom, up.top, up.low], [126, 836, 954]);
  const pd = C.captionGeom({ ...C.CAP_DEFAULT, lift: -100 }, portrait);
  assert.deepEqual([pd.bottom, pd.top, pd.low], [411, 1391, 1509]);
  assert.equal(C.captionGeom({ ...C.CAP_DEFAULT, lift: -100 }).bottom, 6, '橫式不能往下（已經貼底）');
  assert.deepEqual([C.clampLift(500, 'landscape'), C.clampLift(-80, 'landscape'), C.clampLift(-400, 'portrait'), C.clampLift(33.4, 'portrait')], [400, 0, -350, 33]);
  assert.match(C.sanitizeCaptionStyle({ lift: 900 }).errors[0], /lift 是字幕往上移幾 px.*橫式 0–400、直式 -350–350/);
  assert.match(C.captionRootAttrs({ ...C.CAP_DEFAULT, lift: 120 }), /^ data-cap="box".*--cap-bottom: 126px/, '只移位置也要帶變數');
  assert.equal(C.describeCaptionStyle({ ...C.CAP_DEFAULT, lift: -40 }), '深底白字、思源黑體 76 px 一般、往下 40 px');
  const r = C.resolveCaptionStyle({ plan: { captionStyle: { lift: -60 } }, format: 'landscape' });
  assert.equal(r.style.lift, 0);
  assert.match(r.notes[0], /橫式的字幕位置只能 0–400，-60 用 0/);
});

test('預設的上下位置：setting.json 的 captions.lift 橫式、直式分開記；這一集寫了就用這一集的', () => {
  const settings = { captions: { look: 'outline', lift: { landscape: 40, portrait: 200 } } };
  assert.equal(C.resolveCaptionStyle({ settings, format: 'landscape' }).style.lift, 40);
  assert.equal(C.resolveCaptionStyle({ settings, format: 'portrait' }).style.lift, 200);
  assert.equal(C.resolveCaptionStyle({ settings: { captions: { lift: { portrait: 200 } } }, format: 'landscape' }).isDefault, true, '只記直式：橫式照原位');
  assert.equal(C.resolveCaptionStyle({ plan: { captionStyle: { lift: 0 } }, settings, format: 'portrait' }).style.lift, 0);
  assert.equal(C.resolveCaptionStyle({ plan: { captionStyle: { size: 70 } }, settings, format: 'portrait' }).style.lift, 200, '這一集沒寫位置：照預設');
  const bad = C.resolveCaptionStyle({ settings: { captions: { lift: 120 } } });
  assert.match(bad.errors[0], /captions\.lift 要寫成 \{ "landscape": 0, "portrait": 120 \}/);
});

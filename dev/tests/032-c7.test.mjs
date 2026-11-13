// 032 C7：同一個數字只寫在主人那裡（lib/canvas.mjs 的畫布、子母畫面、字幕；lib/audio.mjs 的人聲響度）。
// 工具都改成匯入；kit/ 的 JS、CSS 和剪輯台的頁面模組匯入不了，這裡拿它們寫的數字和 canvas.mjs 對，不一致就紅。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { TEMPLATE, TOOLS, imp } from './helpers.mjs';

const read = (rel) => fs.readFileSync(path.join(TEMPLATE, rel), 'utf8');
const { CANVAS } = await imp('lib/canvas.mjs');
const L = CANVAS.landscape, V = CANVAS.portrait;

test('kit/scene-motion.js 的 REGIONS（子母畫面的框、字幕帶…）＝canvas.mjs 橫式的 regions', () => {
  const m = read('kit/scene-motion.js').match(/var REGIONS = (\{[^\n]*\});/);
  assert.ok(m, 'scene-motion.js 找不到 REGIONS');
  const R = JSON.parse(JSON.stringify(vm.runInNewContext(`(${m[1]})`)));
  assert.deepEqual(R, JSON.parse(JSON.stringify(L.regions)), '改 kit/scene-motion.js 的 REGIONS 或 lib/canvas.mjs 的 regions，兩邊要一樣');
  assert.deepEqual(R.pip, L.pip.box, 'REGIONS.pip＝子母畫面本體 pip.box');
});

test('kit/captions.css 的字幕樣式＝canvas.mjs 的 caption（橫式、直式的位置）', () => {
  const css = read('kit/captions.css');
  const want = [
    `bottom: ${L.caption.bottom}px`, `font-weight: ${L.caption.weight}`, `font-size: ${L.caption.font}px`, `line-height: ${L.caption.line}px`,
    `padding: ${L.caption.pad.map((p) => `${p}px`).join(' ')}`, `[data-format="portrait"] .cg { bottom: ${V.caption.bottom}px; }`,
  ];
  assert.deepEqual(want.filter((x) => !css.includes(x)), [], 'kit/captions.css 和 lib/canvas.mjs 的 caption 不一致');
  // 註解寫的直式每則字數＝程式的值
  assert.match(css, new RegExp(`每則最多 ${V.caption.maxChars} 字`));
});

test('kit/theme.css 的底紋尺寸＝畫布（全畫面、章節轉場 W×H；側邊欄半寬）', () => {
  const css = read('kit/theme.css');
  const size = (name) => { const m = css.match(new RegExp(`--sc-${name}-pattern:[^\\n]*?<svg[^>]*?width='(\\d+)' height='(\\d+)'`)); return m ? [Number(m[1]), Number(m[2])] : null; };
  assert.deepEqual(size('fs'), [L.W, L.H]);
  assert.deepEqual(size('ch'), [L.W, L.H]);
  assert.deepEqual(size('side'), [L.W / 2, L.H]);
});

test('剪輯台的字幕字數上限（頁面模組 editor/subtitles.mjs、server 的 write.mjs）＝橫式 caption.maxChars', async () => {
  const S = await imp('editor/subtitles.mjs');
  const W = await imp('editor/server/write.mjs');
  assert.equal(S.RULES.capMax, L.caption.maxChars);
  assert.equal(W.LIMITS.capMax, L.caption.maxChars);
  const { ALIGN } = await imp('media.mjs');
  assert.equal(ALIGN.max, L.caption.maxChars, 'srt-align 的 --max 預設＝橫式 caption.maxChars');
});

test('人聲響度：訊息裡的「−14 LUFS」從 lib/audio.mjs 的 LOUD 來', async () => {
  const { LOUD, LOUD_TEXT } = await imp('lib/audio.mjs');
  assert.equal(LOUD_TEXT, `−${-LOUD.I} LUFS`);
  for (const f of ['build.mjs', 'qc.mjs', 'editor.mjs']) {
    const src = fs.readFileSync(path.join(TOOLS, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    assert.ok(!/−14 LUFS|LUFS = -14/.test(src), `${f} 不要自己寫 −14：用 lib/audio.mjs 的 LOUD／LOUD_TEXT`);
  }
});

test('plan.mjs 原本自己寫的版面數字，canvas.mjs 的 LAYOUT 有同值的常數（footprint、badgeZones、pushOrigin、sideShift、直式 pipCropMinW）', async () => {
  const { LAYOUT } = await imp('lib/canvas.mjs');
  const { FOOTPRINT, BADGE } = await imp('lib/plan.mjs');
  const { sideLayout } = await imp('lib/speaker-side.mjs');
  const LL = LAYOUT.landscape, LV = LAYOUT.portrait;
  for (const k of ['keywords', 'two-sides']) assert.deepEqual(FOOTPRINT[k], LL.footprint[k], `FOOTPRINT.${k}`);
  assert.deepEqual(BADGE.zones, LL.badgeZones, 'BADGE.zones');
  assert.deepEqual(LV.badgeZones, {}, '直式沒有要隱藏角標的疊加情境');
  assert.deepEqual(LL.badgeZones['side-panel'], [[0, 0, L.W / 2, L.H]], '03 側邊欄面板＝左半');
  assert.deepEqual(LL.pushOrigin, [960, 400]);
  assert.deepEqual(LV.pushOrigin, [V.W / 2, Math.round(V.H * 0.37)], '直式＝plan.mjs 的 W / 2、round(H × 0.37)');
  assert.equal(LL.sideShift.max, L.W / 2);
  assert.equal(Math.abs(sideLayout(null, L).shift), LL.sideShift.center, '講者在中間（沒有框）時移的距離＝sideShift.center');
  assert.equal(LV.pipCropMinW, 540);
});

// 子母畫面的數字（本體 x 1424、禁入區 y 581…）只寫在 lib/canvas.mjs；還沒改的列在 PENDING（理由＝誰要改）
const PENDING = {
};
test('子母畫面的框和禁入區只寫在 lib/canvas.mjs（註解不算；還沒改的列在 PENDING）', () => {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (!e.name.endsWith('.mjs')) continue;
      const rel = path.relative(TOOLS, p).split(path.sep).join('/');
      if (rel === 'lib/canvas.mjs' || PENDING[rel]) continue;
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { const code = l.replace(/(^|[\s;,)])\/\/.*$/, ''); if (!/^\s*\*/.test(code) && /\b1424\b|\b581, 1888\b/.test(code)) hits.push(`${rel}:${i + 1}`); });   // 行尾的 // 註解不算
    }
  };
  walk(TOOLS);
  assert.deepEqual(hits, [], '改成從 lib/canvas.mjs 匯入（CANVAS.landscape.pip.box／pip.zone）');
});

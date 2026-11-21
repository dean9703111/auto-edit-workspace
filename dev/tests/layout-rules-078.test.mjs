// 078–081（minimax-ep1 作者勾的「加進程式」）：
//   078 上下置中扣掉上方的背景元素：kit/scene.css 把有全畫面底的橫式動畫整組往下 42 px（垂直平衡的量法在 audit.test.mjs）
//   079 有空位、字偏小：內容設計動畫完成態蓋不到主內容區一半、最大的字 < 56px → ⚠ design-roomy
//   081 網址要完整一行、畫面上 ≥ 40px → ⚠ url
//   080 片尾配樂只播的那一段比整首小聲就補回來（lib/music.mjs partBoostDb）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, imp, tmpDir, needs } from './helpers.mjs';

const R = await imp('lib/audit-rules.mjs');
const M = await imp('lib/music.mjs');
const { outroLine } = await imp('lib/plan.mjs');
const base = { tag: 'div', inner: null, painted: false, box: false, text: false, textRect: null, inkRect: null, fontSize: 52, scale: 1, whiteSpace: 'normal', media: false, full: false, bg: false,
  clipX: false, clipY: false, clips: [], parent: -1, anc: [], moving: false, alpha: 1, pad: [0, 0, 0, 0], bw: [0, 0, 0, 0], own: [], chars: 0 };
const el = (i, o) => ({ ...base, i, desc: { id: o.id || `e${i}`, cls: '', text: o.txt || '', near: '' }, inner: o.rect, ...o });
const lay = (els, seg = { layout: 'fullscreen', design: true }, kind = 'done') => R.judgeLayout({ host: { start: 10 }, els }, { item: { id: 'd01', type: 'custom', label: 'x', start: 10, end: 18, D: 8, seg }, t: 17.4, kind, layout: 'fullscreen' });
const rule = (fs_, r) => fs_.filter((f) => f.rule === r);

test('078 共用樣式：有全畫面底的橫式動畫整組往下 42 px；直式、沒有講者的全螢幕段不移；主內容區的數字跟著改', () => {
  const css = fs.readFileSync(path.join(TEMPLATE, 'kit', 'scene.css'), 'utf8');
  assert.ok(css.includes(':has(> .sc-surface-fs) > :not(.sc-surface-fs):not(.fill) { margin-top: var(--sc-vshift, 42px); }'));
  assert.match(css, /\[data-format="portrait"\]:has\(> \.sc-surface-fs\) > :not\(\.sc-surface-fs\):not\(\.fill\),\n\[data-wide\] :has\(> \.sc-surface-fs\)[^\n]*\{ margin-top: 0; \}/);
  assert.deepEqual([R.VBAL_Y, R.VBAL_BOTTOM_MAX, R.DESIGN.PIP], [[136, 956], 900, [120, 192, 1300, 900]]);
  // 往下移 42 之後：到角標下緣、到字幕底板上緣一樣多
  assert.equal(R.DESIGN.PIP[1] - R.VBAL_Y[0], R.VBAL_Y[1] - R.DESIGN.PIP[3]);
});

test('079 有空位、字偏小：蓋不到主內容區一半而且最大的字 < 56px 才提醒；字夠大、或已經用滿不提醒；只看完成態', () => {
  // 一張 760×420 的卡（主內容區 1180×708 的四成左右：過了「畫面太空」的 30%、不到一半）＋一行 40px 的字
  const small = [el(0, { rect: [200, 300, 960, 720], painted: true, box: true }), el(1, { rect: [220, 320, 520, 370], text: true, textRect: [220, 320, 520, 370], fontSize: 40, txt: '小字' })];
  const f = rule(lay(small), 'design-roomy');
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /^有空位、字偏小：完成態的內容只蓋到主內容區的 \d+%（< 50%），最大的字 40px（< 56px）/);
  assert.match(f[0].fix, /字和圖示一起放大 1\.2–1\.5 倍（主要文字 ≥ 56px）/);
  const bigText = [small[0], { ...small[1], fontSize: 64 }];
  assert.deepEqual(rule(lay(bigText), 'design-roomy'), []);
  const full = [el(0, { rect: [120, 192, 1300, 900], painted: true, box: true }), small[1]];
  assert.deepEqual(rule(lay(full), 'design-roomy'), []);
  assert.deepEqual(rule(lay(small, { layout: 'fullscreen', design: true }, 'still'), 'design-roomy'), []);
  assert.deepEqual(rule(lay(small, { layout: 'fullscreen' }), 'design-roomy'), [], '模板段不量（字級是模板定的）');
});

test('081 網址：折成兩行、畫面上小於 40px 都提醒；被縮小的照縮完的大小算；一般的字不管', () => {
  const url = (o) => el(0, { rect: [200, 400, 900, 460], text: true, textRect: [200, 400, 900, 450], fontSize: 44, txt: 'code.minimax.io/about', ...o });
  const run = (e) => R.judgeSample({ host: { start: 10 }, els: [e] }, { item: { id: 'd01', type: 'custom', label: 'x', start: 10, end: 18, D: 8, opaque: false, pip: false, seg: { layout: 'overlay' } }, t: 17.4, kind: 'done', layout: 'overlay', pipOn: false, speakerBox: null, sideShift: 0 }).filter((f) => f.rule === 'url');
  assert.deepEqual(run(url({})), []);
  assert.match(run(url({ fontSize: 36, textRect: [200, 400, 900, 440] }))[0].msg, /^網址太小：.* 畫面上 36px（< 40px）/);
  assert.match(run(url({ scale: 0.8 }))[0].msg, /畫面上 35\.2px/);
  assert.match(run(url({ textRect: [200, 400, 600, 500] }))[0].msg, /^網址折成兩行/);
  assert.deepEqual(run(url({ fontSize: 30, txt: '一般的小字' })), []);
  assert.deepEqual(run(url({ fontSize: 30, txt: '看 deanlin.net 的文章' })), [], '句子裡帶網址的不算（有空白）');
  assert.ok(R.URL_RE.test('deanlin.net') && R.URL_RE.test('code.minimax.io/about') && !R.URL_RE.test('版本 1.2') );
});

test('080 片尾配樂：只播的前奏比整首小聲就補回來（最多 12 dB、差不到 1.5 dB 不補）；報告行寫補了多少', async (t) => {
  if (!(await needs(t, 'ffmpeg'))) return;
  const dir = tmpDir(t, 'outro-part-');
  const f = path.join(dir, 'song.wav');
  // 前 20 秒小聲（−30 dBFS 左右）、後 40 秒大聲
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=60', '-af', "volume='if(lt(t,20),0.05,0.5)':eval=frame", '-ac', '2', f]);
  assert.equal(r.status, 0, String(r.stderr));
  const boost = M.partBoostDb(f, { from: 0, dur: 20 }, path.join(dir, '.cache'));
  assert.ok(boost >= 10 && boost <= M.PART_BOOST_MAX, `前奏小 20 dB：補到上限附近（${boost}）`);
  assert.equal(M.partBoostDb(f, { from: 0, dur: 20 }, path.join(dir, '.cache')), boost, '同一個檔、同一段讀快取');
  assert.ok(fs.existsSync(path.join(dir, '.cache', 'outro-part.json')));
  assert.equal(M.partBoostDb(f, { from: 25, dur: 30 }), 0, '播的那一段不比整首小聲：不補、也不壓');
  assert.equal(M.partBoostDb(path.join(dir, 'gone.wav'), { from: 0, dur: 20 }), 0);
  const outro = { music: 'song', source: 'plan.json', auto: false, relDb: -11, credit: null };
  assert.match(outroLine(outro, { aligned: 'from', at: 30, dur: 20, fadeIn: 3, fadeOut: 2, len: 60, boost: 9.2 }), /比人聲小 11\.0 dB；播的這一段比整首小聲，已補 9\.2 dB）$/);
  assert.ok(!outroLine(outro, { aligned: 'from', at: 30, dur: 20, fadeIn: 3, fadeOut: 2, len: 60 }).includes('已補'));
});

// audit.mjs：挑段、取樣時間、矩形換算、判定規則（用假的量測資料）、找 Chrome／runtime、注入 runtime 的 server；
// 最後一個測試真的開 HyperFrames 的 Chrome 量一支小合成（找不到 Chrome 或 runtime 時略過）
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { imp, TEMPLATE } from './helpers.mjs';

const R = await imp('lib/audit-rules.mjs');
const B = await imp('lib/audit-browser.mjs');
const HF = await imp('lib/hf.mjs');
const A = await imp('audit.mjs');
const tmps = [];
const tmp = (p = 'hf-audit-test-') => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); tmps.push(d); return d; };
after(() => { for (const d of tmps) fs.rmSync(d, { recursive: true, force: true }); });

// ---------- 假的量測資料 ----------
let n = 0;
const el = (o) => ({
  i: o.i ?? n++, tag: 'div', desc: { id: '', cls: '', text: '', near: '', ...(o.desc || {}) },
  rect: o.rect, inner: o.inner || o.rect, text: !!o.textRect, textRect: o.textRect || null, inkRect: o.inkRect || null,
  fontSize: o.fontSize ?? 52, scale: o.scale ?? 1, whiteSpace: o.whiteSpace || 'normal',
  painted: !!o.painted, box: !!o.box, media: !!o.media, full: !!o.full, bg: !!o.bg, shaped: !!o.shaped,
  clipX: !!o.clipX, clipY: !!o.clipY, sw: o.sw ?? 0, cw: o.cw ?? 0, sh: o.sh ?? 0, ch: o.ch ?? 0,
  constraint: o.constraint ?? -1, clips: o.clips || [], parent: o.parent ?? -1, moving: !!o.moving,
  allowOverflow: !!o.allowOverflow, allowCaption: !!o.allowCaption,
});
const item = (o = {}) => ({ id: 'x01', type: 'custom', label: 'custom x-a.html', start: 10, end: 18, D: 8, opaque: false, pip: false, seg: { layout: 'overlay' }, ...o });
const judge = (els, ctx = {}) => R.judgeSample({ host: { start: 10 }, els }, { item: item(ctx.item), t: 17.4, kind: 'done', layout: 'overlay', pipOn: false, speakerBox: null, sideShift: 0, ...ctx });
const rules = (fs_) => fs_.map((f) => `${f.level}:${f.rule}`);

// ---------- 挑段與取樣 ----------

test('pickItems：預設只量 custom；--all 加情境、不量字卡動態與 media；--only 指名', () => {
  const items = [{ id: 's01', type: 'scene' }, { id: 'x01', type: 'custom' }, { id: 'f1', type: 'fx' }, { id: 'm01', type: 'media' }];
  assert.deepEqual(R.pickItems(items).list.map((x) => x.id), ['x01']);
  const all = R.pickItems(items, { all: true });
  assert.deepEqual(all.list.map((x) => x.id), ['s01', 'x01']);
  assert.match(all.skipped.join(), /f1（字卡動態/);
  const only = R.pickItems(items, { only: ['f1', 'm01'] });
  assert.deepEqual(only.list.map((x) => x.id), ['f1']);
  assert.match(only.skipped.join(), /m01（插入素材/);
  assert.match(R.pickItems(items, { only: ['zz'] }).errors[0], /--only 的 zz 不在 plan\.json.*現有：s01、x01、f1、m01/);
  // 還是範例原文的 custom 段不量
  const sm = R.pickItems([{ id: 'x01', type: 'custom', sample: true, file: 'compositions/x-fix.html' }, { id: 'x02', type: 'custom' }]);
  assert.deepEqual(sm.list.map((x) => x.id), ['x02']);
  assert.match(sm.skipped.join(), /x01（compositions\/x-fix\.html 還是範例原文、還沒做/);
  // --only 指名的範例原文照量（量範例本身）
  assert.deepEqual(R.pickItems([{ id: 'x01', type: 'custom', sample: true, file: 'compositions/x-fix.html' }], { only: ['x01'] }).list.map((x) => x.id), ['x01']);
});

test('sampleTimes：中點＋段尾前 0.6 秒；太短只量完成態', () => {
  assert.deepEqual(R.sampleTimes({ start: 10, end: 18 }), [{ t: 14, kind: 'mid' }, { t: 17.4, kind: 'done' }]);
  assert.deepEqual(R.sampleTimes({ start: 2, end: 3 }), [{ t: 2.5, kind: 'done' }]);
  assert.equal(R.DONE_BEFORE, 0.6);
});

test('layoutOf／pipOnAt／speakerWarnOf', () => {
  assert.equal(R.layoutOf({ type: 'custom', seg: { layout: 'fullscreen' } }), 'fullscreen');
  assert.equal(R.layoutOf({ type: 'scene', opaque: true }), 'fullscreen');
  assert.equal(R.layoutOf({ type: 'scene', opaque: false }), 'overlay');
  const it = { pip: true, start: 0, end: 10, pipPieces: [{ s: 0, e: 4 }, { s: 6, e: 10 }] };
  assert.equal(R.pipOnAt(it, 3), true);
  assert.equal(R.pipOnAt(it, 5), false);   // 只有聲音的區間不放子母畫面
  assert.equal(R.pipOnAt({ ...it, pip: false }, 3), false);
  assert.equal(R.speakerWarnOf({ type: 'custom' }), R.SPEAKER_WARN);
  assert.equal(R.speakerWarnOf({ type: 'scene', seg: { css: '#gCard { left: 900px; }' } }), R.SPEAKER_WARN);
  assert.equal(R.speakerWarnOf({ type: 'scene', seg: {} }), R.SPEAKER_WARN_TEMPLATE);
});

// ---------- 矩形 ----------

test('矩形：intersect、overflowOf（垂直另一個容許值）、shiftBox', () => {
  assert.deepEqual(R.intersect([0, 0, 10, 10], [5, 5, 20, 20]), [5, 5, 10, 10]);
  assert.equal(R.intersect([0, 0, 10, 10], [10, 0, 20, 10]), null);
  assert.deepEqual(R.overflowOf([100, 100, 520, 200], [100, 100, 400, 200]), { right: 120 });
  assert.equal(R.overflowOf([100, 95, 400, 205], [100, 100, 400, 200], 2, 10), null);
  assert.deepEqual(R.overflowOf([99, 95, 400, 205], [100, 100, 400, 200], 2, 2), { top: 5, bottom: 5 });
  assert.deepEqual(R.shiftBox([750, 236, 1260, 880], 480), [1230, 236, 1740, 880]);
});

test('coverRatio：矩形聯集落在框裡的比例（重疊不重複算）', () => {
  const box = [0, 0, 96, 96];   // 4px 格點：24×24 格
  assert.equal(R.coverRatio([[0, 0, 48, 96]], box), 0.5);
  assert.equal(R.coverRatio([[0, 0, 48, 96], [0, 0, 48, 96]], box), 0.5);
  assert.equal(R.coverRatio([[0, 0, 48, 96], [48, 0, 96, 48]], box), 0.75);
  assert.equal(R.coverRatio([[200, 200, 300, 300]], box), 0);
  assert.equal(R.coverRatio([], box), 0);
});

test('subpixelEdges：離整數 ≥ 0.2 才算', () => {
  assert.deepEqual(R.subpixelEdges([120.5, 160, 720.5, 300]), { left: 120.5, right: 720.5 });
  assert.equal(R.subpixelEdges([120.05, 160, 465.05, 300]), null);   // 量測尾數不算
  assert.deepEqual(R.subpixelEdges([10, 10, 339.33, 210]), { right: 339.33 });
});

test('descText／boxDesc：id／class／前 10 個字', () => {
  assert.equal(R.descText({ id: 'xbad-title', cls: 'sc-t56', text: '這一行標題寫得太長太', near: '' }), '#xbad-title「這一行標題寫得太長太…」');
  assert.equal(R.descText({ id: '', cls: 'xbad-item.sc-t44', text: '第三項', near: 'xbad-list' }), '#xbad-list .xbad-item.sc-t44「第三項」');
  assert.equal(R.descText(R.boxDesc({ id: 'xbad-card', cls: '', text: '裡面的字', near: '' })), '#xbad-card');
  assert.equal(R.fmtT(75.5), '1:15.50');
});

// ---------- 判定 ----------

test('✖ 文字撐破容器：字超出最近的有底有框盒，改法寫出需要的寬度', () => {
  const card = el({ i: 0, rect: [120, 160, 720, 290], inner: [123, 163, 717, 287], painted: true, box: true, desc: { id: 'xbad-card' } });
  const title = el({ i: 1, rect: [155, 187, 1219, 267], textRect: [155, 187, 1219, 263], fontSize: 56, whiteSpace: 'nowrap', constraint: 0, desc: { id: 'xbad-title', text: '這一行標題寫得太長太' } });
  const f = judge([card, title]);
  const o = f.find((x) => x.rule === 'overflow');
  assert.ok(o, rules(f).join());
  assert.equal(o.level, 'error');
  assert.match(o.msg, /文字撐破容器 #xbad-card：#xbad-title「這一行標題寫得太長太…」 超出右邊 502px/);
  assert.match(o.fix, /寬度加到 ≥ 1102px.*nowrap.*不要縮字級/);
});

test('文字的 line box 比框高一點（字級 0.2 倍以內）不算撐破；動畫中的元素不判', () => {
  const tag = el({ i: 0, rect: [160, 620, 384, 700], painted: true, box: true });
  const t1 = el({ i: 1, rect: [160, 620, 384, 700], textRect: [216, 616, 328, 697], fontSize: 56, constraint: 0 });
  assert.deepEqual(judge([tag, t1]).filter((x) => x.rule === 'overflow'), []);
  const t2 = el({ i: 2, rect: [160, 620, 900, 700], textRect: [160, 620, 900, 697], constraint: 0, moving: true });
  assert.deepEqual(judge([tag, t2]).filter((x) => x.level === 'error'), []);
});

test('✖ 內容被裁掉：會裁切的固定高框裡，卡片超出下緣；字被自己的框裁掉', () => {
  const list = el({ i: 0, rect: [820, 300, 1340, 600], inner: [820, 300, 1340, 600], painted: true, box: true, clipX: true, clipY: true, desc: { id: 'xbad-list' } });
  const it3 = el({ i: 1, rect: [844, 528, 1316, 624], painted: true, box: true, clips: [0], textRect: [872, 555, 1132, 598], inkRect: [872, 560, 1132, 596], constraint: 1, desc: { cls: 'xbad-item', text: '第三項被切掉', near: 'xbad-list' } });
  const f = judge([list, it3]);
  const c = f.find((x) => x.rule === 'clipped');
  assert.ok(c, rules(f).join());
  assert.match(c.msg, /內容被裁掉：#xbad-list（520×300，overflow 會裁切）裡的 #xbad-list \.xbad-item「第三項被切掉」 超出下邊 24px/);
  assert.match(c.fix, /高度加到 ≥ 324px/);
  const self = el({ i: 5, rect: [0, 0, 300, 80], painted: true, box: true, clipX: true, clipY: true, sw: 420, cw: 300, sh: 80, ch: 80, textRect: [10, 10, 290, 70], constraint: 5 });
  assert.deepEqual(rules(judge([self])).filter((r) => r.startsWith('error')), ['error:clipped']);
});

test('✖ 進字幕區：下緣 > 920；背景層與 data-layout-allow-caption-zone 不算', () => {
  const note = el({ rect: [120, 860, 592, 935], painted: true, box: true, desc: { id: 'xbad-note' } });
  const f = judge([note]);
  const c = f.find((x) => x.rule === 'caption');
  assert.match(c.msg, /進字幕區：#xbad-note 下緣 y=935/);
  assert.match(c.fix, /往上移 ≥ 65px.*≤ 870/);
  assert.deepEqual(judge([el({ rect: [0, 0, 960, 1080], painted: true, bg: true })]).filter((x) => x.rule === 'caption'), []);
  assert.deepEqual(judge([el({ rect: [120, 860, 592, 935], painted: true, allowCaption: true })]).filter((x) => x.rule === 'caption'), []);
  assert.deepEqual(judge([el({ rect: [120, 700, 592, 920], painted: true })]).filter((x) => x.rule === 'caption'), []);
});

test('✖ 壓到子母畫面：只在全畫面、這一刻有子母畫面時判', () => {
  const card = el({ rect: [120, 150, 1680, 850], painted: true, box: true, desc: { id: 'xwide-card' } });
  const fs1 = judge([card], { layout: 'fullscreen', pipOn: true });
  const p = fs1.find((x) => x.rule === 'pip');
  assert.match(p.msg, /壓到子母畫面：#xwide-card x 120–1680、y 150–850，進到禁入區 x 1424–1888、y 581–951/);
  assert.match(p.fix, /右緣 ≤ 1380.*左移 ≥ 300px.*"pip": false/);
  assert.deepEqual(judge([card], { layout: 'fullscreen', pipOn: false }).filter((x) => x.rule === 'pip'), []);
  assert.deepEqual(judge([card], { layout: 'overlay', pipOn: true }).filter((x) => x.rule === 'pip'), []);
  // 在禁入區上方（y < 581）不算
  assert.deepEqual(judge([el({ rect: [1296, 380, 1616, 570], painted: true })], { layout: 'fullscreen', pipOn: true }).filter((x) => x.rule === 'pip'), []);
  assert.deepEqual(R.PIP_ZONE, [1424, 581, 1888, 951]);   // 和 lib/media.mjs、build 同一組（程式為準；specs/README.md 主代理裁決）
});

test('壓到講者：面積比例、依門檻（蓋到臉 ✖、只壓到身體 ⚠）；側邊欄加 sideShift；全畫面不判', () => {
  const sb = [750, 236, 1260, 880];
  const list = el({ i: 0, rect: [820, 300, 1340, 600], painted: true, desc: { id: 'xbad-list' } });
  const f = judge([list], { speakerBox: sb, speakerWarn: 0.02 });
  const s = f.find((x) => x.rule === 'speaker');
  assert.equal(s.level, 'error', '027：這一塊蓋到臉的位置（講者框上緣那 30%）→ ✖');
  assert.match(s.msg, /^蓋到講者的臉：內容蓋到講者框 \d+%、臉的位置 \d+%/);
  // 只壓到身體（臉的下面）：還是 ⚠
  const body = judge([el({ i: 5, rect: [820, 640, 1340, 860], painted: true, desc: { id: 'xbad-body' } })], { speakerBox: sb, speakerWarn: 0.02 }).find((x) => x.rule === 'speaker');
  assert.equal(body.level, 'warn');
  assert.match(body.msg, /^壓到講者：/);
  assert.equal(s.data.ratio, +R.coverRatio([[820, 300, 1340, 600]], sb).toFixed(3));
  assert.match(s.msg, /內容蓋到講者框 \d+%.*主要是 #xbad-list/);
  const small = el({ i: 1, rect: [700, 600, 790, 860], painted: true });   // 約 7%
  assert.ok(judge([small], { speakerBox: sb, speakerWarn: 0.02 }).some((x) => x.rule === 'speaker'));
  assert.ok(!judge([small], { speakerBox: sb, speakerWarn: 0.15 }).some((x) => x.rule === 'speaker'));
  // 03 側邊欄：講者被推到右邊，框跟著移
  const left = el({ i: 2, rect: [96, 150, 900, 860], painted: true });
  assert.ok(!judge([left], { speakerBox: sb, sideShift: 480, item: { side: true }, speakerWarn: 0.02 }).some((x) => x.rule === 'speaker'));
  assert.ok(judge([left], { speakerBox: sb, sideShift: 480, speakerWarn: 0.02 }).some((x) => x.rule === 'speaker'));
  assert.ok(!judge([list], { speakerBox: sb, layout: 'fullscreen' }).some((x) => x.rule === 'speaker'));
});

test('⚠ 字太小（含縮放）、⚠ 半像素邊（斜邊形狀與滿版不算）', () => {
  const tiny = el({ rect: [160, 420, 330, 456], textRect: [160, 420, 330, 456], fontSize: 24, desc: { id: 'xbad-tiny', text: '補充說明的小字' } });
  const w = judge([tiny]).find((x) => x.rule === 'font');
  assert.match(w.msg, /字太小：#xbad-tiny「補充說明的小字」 24px/);
  assert.ok(judge([el({ rect: [0, 0, 100, 40], textRect: [0, 0, 100, 40], fontSize: 52, scale: 0.5 })]).some((x) => x.rule === 'font'));
  assert.ok(!judge([el({ rect: [0, 0, 100, 60], textRect: [0, 0, 100, 60], fontSize: 52 })]).some((x) => x.rule === 'font'));
  const card = el({ rect: [120.5, 160, 720.5, 290], painted: true, desc: { id: 'xbad-card' } });
  assert.match(judge([card]).find((x) => x.rule === 'subpixel').msg, /left=120\.5、right=720\.5/);
  assert.ok(!judge([{ ...card, shaped: true }]).some((x) => x.rule === 'subpixel'));
  assert.ok(!judge([{ ...card, moving: true }]).some((x) => x.rule === 'subpixel'));
});

test('✖ 超出畫面；index.html 沒有這段', () => {
  const f = judge([el({ rect: [1700, 100, 2000, 200], textRect: [1700, 100, 2000, 200] })]);
  assert.match(f.find((x) => x.rule === 'canvas').msg, /超出右邊 80px/);
  const miss = R.judgeSample({ missingHost: true }, { item: item(), t: 1, kind: 'done' });
  assert.deepEqual(rules(miss), ['error:missing']);
});

test('mergeFindings：同一段同一規則同一元素只留一筆，時間合併、訊息取完成態', () => {
  const a = { id: 'x01', rule: 'overflow', el: { id: 'a' }, t: 14, kind: 'mid', msg: 'mid', level: 'error' };
  const b = { ...a, t: 17.4, kind: 'done', msg: 'done' };
  const c = { ...a, el: { id: 'b' } };
  const m = R.mergeFindings([a, b, c]);
  assert.equal(m.length, 2);
  assert.deepEqual(m[0].at, [14, 17.4]);
  assert.equal(m[0].msg, 'done');
  assert.match(R.formatFinding({ ...m[0], label: 'custom x-a.html', fix: '改法' }), /^✖ \[x01 custom x-a\.html\] 0:14\.00、0:17\.40 done → 改法$/);
  assert.match(R.formatFinding({ id: 'x01', label: 'L', level: 'warn', at: [], msg: 'm', fix: 'f' }), /^⚠ \[x01 L\] m → f$/);
});

test('customDuration／durationWarnings：data-duration 與 const D 要等於段長；結尾 P.end() 不帶參數就不檢查', () => {
  const html = '<template id="x-a-template"><div id="x-a" data-composition-id="x-a" data-width="1920" data-height="1080" data-duration="8"></div><script>const D = 8.6;</script></template>';
  assert.deepEqual(R.customDuration(html), { duration: 8, constD: 8.6, autoEnd: false });
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'compositions'));
  fs.writeFileSync(path.join(dir, 'compositions', 'x-a.html'), html);
  const w = A.durationWarnings([{ id: 'x01', type: 'custom', label: 'custom x-a.html', file: 'compositions/x-a.html', D: 8.6 }], dir);
  assert.equal(w.length, 1);
  assert.match(w[0].msg, /寫 data-duration 8，--check 報告的段長是 8\.6s/);
  assert.deepEqual(A.durationWarnings([{ id: 'x01', type: 'custom', file: 'compositions/x-a.html', D: 8 }], dir).length, 1);   // const D 8.6 ≠ 8
  assert.match(w[0].fix, /P\.end\(\)（不帶參數.*刪掉 const D/);
  // P.end() 不帶參數：長度跟著段長，不檢查；寫在註解裡的不算
  const auto = '<template id="x-b-template"><div id="x-b" data-composition-id="x-b" data-duration="8"></div><script>(function(){ const P = SceneMotion(tl, root); P.end(); })();</script></template>';
  assert.equal(R.customDuration(auto).autoEnd, true);
  fs.writeFileSync(path.join(dir, 'compositions', 'x-b.html'), auto);
  assert.deepEqual(A.durationWarnings([{ id: 'x02', type: 'custom', file: 'compositions/x-b.html', D: 12.5 }], dir), []);
  assert.equal(R.customDuration('<div data-composition-id="x-c" data-duration="8"></div><script>// P.end()\nP.end(8);</script>').autoEnd, false);
});

test('scriptErrors：子合成出錯對到那一段（✖），其他錯誤是 ⚠', () => {
  const items = [{ id: 'x03', compId: 'x-wide', file: 'compositions/x-wide.html', label: 'custom x-wide.html' }];
  const r = A.scriptErrors([{ text: '[HyperFrames] composition script error: x-wide ReferenceError: nope is not defined' }, { text: 'Uncaught TypeError: boom', url: 'http://127.0.0.1:1/kit/a.js', line: 3 }], items);
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].msg, /compositions\/x-wide\.html 的 script 出錯：ReferenceError: nope is not defined/);
  assert.match(r.warnings[0], /頁面 JS 錯誤：Uncaught TypeError: boom（kit\/a\.js:4）/);
});

// ---------- 003：custom 的版面規則（judgeLayout） ----------
// 量測端多給的欄位：title（標題列）、frame（自己有底或框的文字框）、own（自己的行框）、chars、ownFont、pad、bw、anc（全部祖先）…
const lel = (o) => ({ ...el(o), pad: o.pad || [0, 0, 0, 0], bw: o.bw || [0, 0, 0, 0], anc: o.anc || (o.parent != null && o.parent >= 0 ? [o.parent] : []),
  title: !!o.title, frame: !!o.frame, own: o.own || [], chars: o.chars ?? 0, ownFont: o.ownFont || null, round: !!o.round, kit: !!o.kit,
  centered: !!o.centered, widthShared: !!o.widthShared, parentInnerW: o.parentInnerW, alpha: o.alpha ?? 1, shapeRect: o.shapeRect || null, tag: o.tag || 'div',
  allowOverlap: !!o.allowOverlap, allowSlack: !!o.allowSlack, allowTight: !!o.allowTight });
const lay = (els, ctx = {}, extra = {}) => R.judgeLayout({ host: { start: 10 }, els, ...extra }, { item: item({ type: 'custom', ...(ctx.item || {}) }), t: 17.4, kind: 'done', layout: 'overlay', ...ctx });
const only = (fs_, rule) => fs_.filter((x) => x.rule === rule);

test('judgeLayout：只量 custom；✖ 未定位頂層（position 不是 absolute、有大小）', () => {
  assert.deepEqual(R.judgeLayout({ els: [] }, { item: item({ type: '06-concept' }), t: 1, kind: 'done' }), []);
  const tops = [{ pos: 'static', w: 600, h: 80, desc: { id: 'xbad-row' }, parent: { id: 'x-bad' } }, { pos: 'absolute', w: 600, h: 80, desc: { id: 'ok' } }, { pos: 'static', w: 0, h: 0, desc: { id: 'empty' } }];
  const f = only(lay([], {}, { tops }), 'unpositioned');
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'error');
  assert.match(f[0].msg, /未定位頂層：#xbad-row 直接放在 #x-bad 底下，position 是 static/);
  assert.match(f[0].fix, /position: absolute.*整數 px 的 left、top/);
  // runtime 掛上後 root 沒有 id／class：印成 root（<comp>）（r1 審查 B-03）
  const g = only(lay([], {}, { tops: [{ pos: 'static', w: 600, h: 80, desc: { id: 'xbad-loose' }, parent: { id: '', cls: '', text: '', near: '', root: 'x-bad' } }] }), 'unpositioned');
  assert.match(g[0].msg, /未定位頂層：#xbad-loose 直接放在 root（x-bad） 底下/);
});

test('judgeLayout：✖ 標題壓到內容、⚠ 間距不足（< 24px，目標 40px）、≥ 24px 不報', () => {
  const card = lel({ i: 0, rect: [40, 40, 1300, 800], painted: true, box: true, desc: { id: 'xt-card' } });
  const bar = lel({ i: 1, rect: [40, 40, 1300, 124], painted: true, title: true, parent: 0, desc: { cls: 'sc-wcard__bar', near: 'xt-card' } });
  const node = (top) => lel({ i: 2, rect: [80, top, 600, top + 200], painted: true, box: true, parent: 0, desc: { id: 'xt-node' } });
  const e = only(lay([card, bar, node(110)]), 'title-overlap');
  assert.equal(e[0].level, 'error');
  assert.match(e[0].msg, /標題壓到內容：#xt-card \.sc-wcard__bar 下緣 y=124，#xt-node 上緣 y=110（重疊 14px）/);
  assert.match(e[0].fix, /往下移 ≥ 54px，讓間距到 40px/);
  const w = only(lay([card, bar, node(134)]), 'title-gap');
  assert.equal(w[0].level, 'warn');
  assert.match(w[0].msg, /間距不足：.* 到 #xt-node 只有 10px（< 24px；目標 ≥ 40px）/);
  assert.match(w[0].fix, /往下移 30px/);
  assert.deepEqual(lay([card, bar, node(148)]).filter((x) => /^title/.test(x.rule)), []);
});

test('judgeLayout：⚠ 區塊重疊；疊在父層上的亮框、svg 線稿、data-layout-allow-overlap 不算', () => {
  const a = lel({ i: 0, rect: [100, 100, 500, 400], painted: true, box: true, desc: { id: 'xa' } });
  const b = lel({ i: 1, rect: [450, 350, 800, 600], painted: true, box: true, desc: { id: 'xb' } });
  const f = only(lay([a, b]), 'overlap');
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /區塊重疊：#xa 和 #xb 重疊 50×50px/);
  assert.deepEqual(only(lay([a, { ...b, allowOverlap: true }]), 'overlap'), []);
  const svg = lel({ i: 2, rect: [0, 0, 1300, 800], media: true, tag: 'svg' });
  assert.deepEqual(only(lay([a, svg]), 'overlap'), []);
  // 亮框（四邊離父層 ≤ 8px）和父層裡的圖示：算同一個區塊
  const ring = lel({ i: 3, rect: [96, 96, 504, 404], painted: true, parent: 0 });
  const icon = lel({ i: 4, rect: [150, 150, 250, 250], painted: true, parent: 0 });
  assert.deepEqual(only(lay([a, ring, icon]), 'overlap'), []);
});

test('judgeLayout：⚠ 內距不足（max(24, 0.45×字級)、max(14, 0.28×字級)）、⚠ 行高不足', () => {
  const box = (rect, lh = 72) => lel({ i: 0, rect, painted: true, box: true, frame: true, own: [[110, 110, 350, 160]], chars: 6, ownFont: { fs: 52, lh }, desc: { id: 'xp-box' } });
  const f = only(lay([box([100, 100, 400, 170])]), 'padding');
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /內距不足：#xp-box 裡的文字 左 10、右 50、上 10、下 10px（字級 52px：左右要 ≥ 24px、上下要 ≥ 15px）/);
  assert.match(f[0].fix, /寬度加到 ≥ 314px、高度加到 ≥ 80px/);
  assert.deepEqual(lay([box([80, 80, 380, 190])]).filter((x) => x.rule === 'padding' || x.rule === 'line-height'), []);
  // 圓形、kit 元件、≤ 2 字不判
  assert.deepEqual(only(lay([{ ...box([100, 100, 400, 170]), round: true }]), 'padding'), []);
  assert.deepEqual(only(lay([{ ...box([100, 100, 400, 170]), chars: 2 }]), 'padding'), []);
  const lh = only(lay([box([80, 80, 380, 176], 56)]), 'line-height');
  assert.equal(lh.length, 1);
  assert.match(lh[0].msg, /行高不足：#xp-box line-height 56px／字級 52px＝1\.08（< 1\.25），下內距只有 16px/);
  assert.match(lh[0].fix, /line-height 寫 ≥ 65px/);
});

test('judgeLayout：⚠ nowrap 餘裕不足（< 7px）', () => {
  const pill = lel({ i: 0, rect: [100, 90, 400, 170], painted: true, box: true, desc: { id: 'xn-pill' } });
  const t = (x0, x1) => lel({ i: 1, rect: [x0, 100, x1, 160], textRect: [x0, 100, x1, 160], whiteSpace: 'nowrap', parent: 0, desc: { id: 'xn-text', text: '不換行' } });
  const f = only(lay([pill, t(104, 396)]), 'nowrap');
  assert.match(f[0].msg, /nowrap 餘裕不足：#xn-text「不換行」 離 #xn-pill 的框只剩 4px（< 7px）/);
  assert.match(f[0].fix, /寬度加到 ≥ 306px/);
  assert.deepEqual(only(lay([pill, t(110, 390)]), 'nowrap'), []);
  // 文字靠左（左 6px、右 40px）：加寬沒用，改法要指 padding-left
  const g = only(lay([pill, t(106, 360)]), 'nowrap');
  assert.match(g[0].fix, /左邊只剩 6px：padding-left 再加 1px/);
  assert.doesNotMatch(g[0].fix, /寬度加到/);
});

test('judgeLayout：⚠ 右側空白過多（> 80px）；同一欄取最小、置中、撐滿父層、data-width-shared 不算', () => {
  const box = (i, own, o = {}) => lel({ i, rect: [40, 40 + i * 200, 640, 160 + i * 200], pad: [24, 0, 24, 0], painted: true, box: true, frame: true, own: [own(i)], chars: 6, ownFont: { fs: 52, lh: 72 }, desc: { id: `xs-${i}` }, ...o });
  const short = (i) => [64, 70 + i * 200, 400, 130 + i * 200], long = (i) => [64, 70 + i * 200, 560, 130 + i * 200];
  const f = only(lay([box(0, short)]), 'slack');
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /右側空白過多：#xs-0 內容最右緣到框內緣 216px（> 80px）/);
  assert.match(f[0].fix, /width: max-content/);
  assert.deepEqual(only(lay([box(0, short), box(1, long)]), 'slack'), []);   // 同一欄（left、寬相同）取最小：56px
  assert.deepEqual(only(lay([box(0, short, { widthShared: true })]), 'slack'), []);
  assert.deepEqual(only(lay([box(0, short, { parentInnerW: 600 })]), 'slack'), []);
  const mid = (i) => [216, 70, 464, 130];
  assert.deepEqual(only(lay([box(0, mid, { centered: true })]), 'slack'), []);
});

test('judgeLayout：⚠ 垂直不平衡（全畫面、內容區 y 120–870、上下留白差 > 40px）', () => {
  const blk = (y0, y1) => lel({ i: 0, rect: [40, y0, 1000, y1], painted: true, box: true });
  const f = only(lay([blk(120, 600)], { layout: 'fullscreen' }), 'vbalance');
  assert.match(f[0].msg, /垂直不平衡：內容 y 120–600，上留白 0px、下留白 270px（內容區 y 120–870，差 270px，超過 40px）/);
  assert.match(f[0].fix, /整組往下移 135px（每個頂層元素的 top 都 \+135）/);
  assert.deepEqual(only(lay([blk(200, 790)], { layout: 'fullscreen' }), 'vbalance'), []);
  assert.deepEqual(only(lay([blk(120, 600)]), 'vbalance'), []);   // overlay 不判
});

// ---------- 003：custom 的節奏規則（judgeMotion） ----------
let k = 0;
const tg = (o = {}) => ({ key: o.key || `k${k++}`, parentKey: o.parentKey || 'root', desc: { id: o.key || '', cls: '', text: '', near: '' }, chain: o.chain || [], emph: !!o.emph, box: o.box || [0, 0, 100, 100] });
const tw = (start, end, kind, targets) => ({ start, end, kind, targets: Array.isArray(targets) ? targets : [targets] });
const mo = (tweens, o = {}) => R.judgeMotion({ D: o.D ?? 8, marks: o.marks || [], tweens }, { item: item({ type: 'custom', compId: 'x-a' }), fadeOut: !!o.fadeOut });

test('motionUnits：亮框、同位置換內容、跟著祖先 0.3 秒內一起出現的不算新元素', () => {
  const card = tg({ key: 'card' });
  const units = R.motionUnits({ tweens: [
    tw(0, 0.5, 'enter', card), tw(0.2, 0.6, 'enter', tg({ key: 'title', chain: ['card'] })),   // 跟著卡片
    tw(2, 2.4, 'enter', tg({ key: 'ring', emph: true })),                                       // 亮框
    tw(3, 3.4, 'exit', tg({ key: 'old', parentKey: 'panel' })), tw(3.05, 3.5, 'enter', tg({ key: 'new', parentKey: 'panel' })),   // 換內容
    tw(4, 4.5, 'enter', tg({ key: 'note' })),
  ] });
  assert.deepEqual(units.map((u) => u.tg.key), ['card', 'note']);
  assert.deepEqual(R.busySpans({ tweens: [tw(0, 0.5, 'enter', card), tw(0.54, 1, 'draw', card), tw(2, 2.5, 'enter', card)] }), [[0, 1], [2, 2.5]]);
});

test('judgeMotion：⚠ 同一秒新元素太多（> 2）、⚠ 間隔太短（< 0.12s）', () => {
  const d = mo([tw(1, 1.4, 'enter', tg()), tw(1.3, 1.7, 'enter', tg()), tw(1.6, 2, 'enter', tg())], { marks: [{ ref: '#12', t: 1 }, { ref: '#13', t: 4 }] });
  const den = only(d.findings, 'density');
  assert.equal(den.length, 1);
  assert.match(den[0].msg, /同一秒新元素太多：0:11\.00–0:12\.00 出現 3 個.*上限 2 個/);
  assert.deepEqual(only(d.findings, 'stagger'), []);
  const s = mo([tw(1, 1.4, 'enter', tg({ key: 'a' })), tw(1.1, 1.5, 'enter', tg({ key: 'b' }))]);
  assert.match(only(s.findings, 'stagger')[0].msg, /間隔太短：#a 和 #b 只差 0\.10s 出現（< 0\.12s）/);
  assert.deepEqual(only(mo([tw(1, 1.4, 'enter', tg()), tw(1.15, 1.5, 'enter', tg())]).findings, 'stagger'), []);
});

test('judgeMotion：⚠ 完成態停太短（兩拍之間最長靜止 < 1.2s）；沒有 P.at 只記 note', () => {
  const T = [tw(1, 1.5, 'enter', tg()), tw(2, 2.5, 'enter', tg())];
  const h = mo(T, { marks: [{ ref: '#12', t: 1 }, { ref: '#13', t: 2 }] });
  const f = only(h.findings, 'hold');
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /完成態停太短：P\.at\('#12'\)（0:11\.00）這一拍到下一拍 P\.at\('#13'\)（0:12\.00）之間，畫面最長只靜止 0\.50s（新資訊要停 ≥ 1\.2s）/);
  assert.deepEqual(only(mo([tw(1, 1.5, 'enter', tg()), tw(3, 3.5, 'enter', tg())], { marks: [{ ref: '#12', t: 1 }, { ref: '#13', t: 3 }] }).findings, 'hold'), []);
  // 拍前就開始的動作：裁到窗內（1.0–1.8 忙、1.8–2.5 靜止 0.7s）
  assert.equal(only(mo([tw(0.5, 1.8, 'draw', tg())], { marks: [{ ref: 1, t: 1 }, { ref: 2.5, t: 2.5 }] }).findings, 'hold')[0].data.q, 0.7);
  assert.match(mo(T).notes.join(), /x01：沒有 P\.at 綁句，完成態停留不檢查/);
  assert.match(R.judgeMotion(null, { item: item({ type: 'custom', compId: 'x-a' }) }).notes.join(), /讀不到 window\.__timelines\['x-a'\]/);
});

test('judgeMotion：⚠ 最後一幕太短（最後一個動作到結束／淡出／收尾退場 < 1.5s）', () => {
  const f = only(mo([tw(6.5, 7, 'enter', tg())]).findings, 'tail');
  assert.match(f[0].msg, /最後一幕太短：最後一個動作在 0:17\.00 結束，0:18\.00 就開始結束，只停 1\.00s（< 1\.5s）/);
  assert.match(f[0].fix, /to 往後延 ≥ 0\.50s/);
  assert.deepEqual(only(mo([tw(5.5, 6, 'enter', tg())], { fadeOut: true }).findings, 'tail'), []);   // 淡出 7.5 − 6 = 1.5s
  assert.equal(only(mo([tw(5.5, 6.5, 'enter', tg())], { fadeOut: true }).findings, 'tail')[0].data.q, 1);
  // 收尾退場：從退場開始算
  const ex = mo([tw(5, 5.5, 'enter', tg()), tw(6.5, 8, 'exit', tg())]);
  assert.match(only(ex.findings, 'tail')[0].msg, /0:16\.50 就開始退場，只停 1\.00s/);
});

test('judgeMotion：✖ 拍在段尾之後（P.at 落在淡出／段尾之後）；段長以 plan.json 為準，不量段外', () => {
  // 排到段外的動作把 timeline 拉長到 9.5s；plan.json 這段是 8s（淡出從 7.5s 開始）
  const r = R.judgeMotion({ D: 9.5, marks: [{ ref: '#12@錄影', t: 2 }, { ref: '#14@上傳', t: 7.6 }], tweens: [tw(2, 2.5, 'enter', tg()), tw(7.6, 8.1, 'enter', tg())] },
    { item: item({ type: 'custom', compId: 'x-a' }), fadeOut: true });
  const f = only(r.findings, 'late');
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'error');
  assert.match(f[0].msg, /拍在段尾之後，看不到：P\.at\('#14@上傳'\) 在 0:17\.60，這段 0:17\.50 就開始淡出/);
  assert.deepEqual(only(r.findings, 'tail'), [], '最後一幕照 plan 的 8s 量（2.5 → 7.5），不是量到段外的 9.5s');
  assert.deepEqual(only(mo([tw(1, 1.5, 'enter', tg())], { marks: [{ ref: '#12', t: 1 }] }).findings, 'late'), []);
});

test('stillTimes：忙碌段之間 ≥ 0.4s 的空檔取中點，和中點／完成態差 < 0.1s 的不重複', () => {
  const it = item({ type: 'custom', start: 10, end: 18, D: 8 });
  const st = R.stillTimes({ D: 8, tweens: [tw(0, 0.5, 'enter', tg()), tw(3, 3.5, 'enter', tg()), tw(3.6, 3.7, 'change', tg())] }, it);
  assert.deepEqual(st, [{ t: 11.75, kind: 'still' }, { t: 15.55, kind: 'still' }]);
  // 中點 14（sampleTimes）附近的空檔不重複取
  assert.deepEqual(R.stillTimes({ D: 8, tweens: [tw(0, 3, 'enter', tg()), tw(5, 7.4, 'draw', tg())] }, it), []);
  assert.deepEqual(R.stillTimes(null, it), []);
});

test('cueFindings：__cueErrors → ✖ 綁句失敗（去重、對到段）；對不到段的是 ⚠', () => {
  const items = [{ id: 'x01', type: 'custom', compId: 'x-process', file: 'compositions/x-process.html', label: 'custom x-process.html' }];
  const e1 = "x01 P.at('#99')：字幕沒有第 99 句（window.__cues 有 40 句）";
  const e2 = "x-process P.at('#12@剪輯')：「@詞」沒有被 build 預先算到 → 把 ref 寫成字串字面值 P.at('#N@詞')，再跑 build";
  const r = R.cueFindings([e1, e1, e2, 'x-nope P.dur()：找不到'], items);
  assert.equal(r.findings.length, 2);
  assert.ok(r.findings.every((f) => f.level === 'error' && f.rule === 'cue' && f.id === 'x01'));
  assert.match(r.findings[0].msg, /綁句失敗：compositions\/x-process\.html 的 P\.at\('#99'\)：字幕沒有第 99 句/);
  assert.match(r.findings[0].fix, /改成這段範圍內的句號/);
  assert.match(r.findings[1].fix, /字串字面值/);
  assert.doesNotMatch(r.findings[1].msg, /→/, '原因自帶的 → 拿掉，一行只有 audit 的一個改法（r1 審查 B-04）');
  assert.deepEqual(r.warnings, ['頁面 cue 錯誤：x-nope P.dur()：找不到']);
});

// ---------- 003 r2：綁句對不上（F4） ----------
const CUES = [
  { n: 23, start: 40, end: 43, text: '而我過去的拍片流程，' }, { n: 24, start: 43, end: 46, text: '是先把影片備份，再下載到' },
  { n: 25, start: 46, end: 48, text: '**上傳雲端**之後才發現' }, { n: 26, start: 48, end: 50, text: '電腦。' }, { n: 90, start: 200, end: 203, text: '上傳雲端很慢' },
];
const ct = (marks, tweens, o = {}) => R.cueTextFindings({ D: 8, marks, tweens }, { item: item({ type: 'custom', start: 40, end: 50, ...(o.item || {}) }), cuesOut: CUES, names: o.names || {} });
const say = (text, o = {}) => ({ ...tg(o), say: text });

test('cueTextFindings：⚠ 站名在另一句才講到 → 建議 P.at(#M@詞)；同一句有、找不到、段外、淡掉的不報', () => {
  const tw1 = { start: 4, end: 4.5, kind: 'enter', up: true, targets: [say('上傳雲端', { key: 'xp-on2' })] };
  const f = ct([{ ref: '#24', t: 4 }], [tw1], { names: { '#24': 'T2' } });
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'warn');
  assert.equal(f[0].rule, 'cue-text');
  assert.match(f[0].msg, /綁句對不上：「上傳雲端」在 #25 才講到、不是 #24（T2 = P\.at\('#24'\)，0:44\.00 出現；#25「\*\*上傳雲端\*\*之後才發現」）/);
  assert.match(f[0].fix, /^T2 改 P\.at\('#25@上傳雲端'\)/);
  // @詞 ref 一樣比；沒有常數名時寫「改成」
  assert.match(ct([{ ref: '#24@備份', t: 4 }], [tw1])[0].fix, /^改成 P\.at\('#25@上傳雲端'\)/);
  // 同一句有（2 字子字串也算）→ 不報；同一拍另一個字（總覽剛好進場的別站）在第 N 句有 → 這一拍算對上
  assert.deepEqual(ct([{ ref: '#24', t: 4 }], [{ ...tw1, targets: [say('影片備份')] }]), []);
  assert.deepEqual(ct([{ ref: '#24', t: 4 }], [tw1, { start: 4, end: 4.5, kind: 'enter', up: true, targets: [say('影片備份')] }]), []);
  // 段裡找不到（#90 在段外）→ 不報
  assert.deepEqual(ct([{ ref: '#24', t: 4 }], [tw1], { item: { end: 46 } }), []);
  // 拍點後 0.35 秒以外、淡掉（up=false）、太長（整張卡）、太短（數字）、數字 ref、#Ne → 不比
  assert.deepEqual(ct([{ ref: '#24', t: 4 }], [{ ...tw1, start: 4.5 }]), []);
  assert.deepEqual(ct([{ ref: '#24', t: 4 }], [{ ...tw1, up: false }]), []);
  assert.deepEqual(ct([{ ref: '#24', t: 4 }], [{ ...tw1, targets: [say('上傳雲端之後才發現影片要重拍')] }]), []);
  assert.deepEqual(ct([{ ref: '#24', t: 4 }], [{ ...tw1, targets: [say('3')] }]), []);
  assert.deepEqual(ct([{ ref: 4, t: 4 }], [tw1]), []);
  assert.deepEqual(ct([{ ref: '#24e', t: 4 }], [tw1]), []);
  assert.deepEqual(R.cueTextFindings(null, { item: item({ type: 'custom' }) }), []);
});

test('cueTextFindings：數字、英文整個詞比（008 x-trend「100 倍」不比到「200」；AI 不比到 AIR），中文至少 2 字；建議的詞用字幕原文', () => {
  const C = [{ n: 151, start: 40, end: 43, text: '第一年只有 200 個用戶' }, { n: 152, start: 43, end: 46, text: '後來翻了一百倍' }, { n: 153, start: 46, end: 50, text: '現在 1,000 人、用 AIR 傳' }];
  const run = (txt, cues = C.slice(0, 2)) => R.cueTextFindings({ D: 8, marks: [{ ref: '#152@翻', t: 3 }], tweens: [{ start: 3, end: 3.5, kind: 'enter', up: true, targets: [say(txt)] }] }, { item: item({ type: 'custom', start: 40, end: 50 }), cuesOut: cues });
  assert.deepEqual(run('100 倍'), [], '00 不能比到 200');
  assert.deepEqual(run('AI 倍', C), [], 'AI 不能比到 AIR');
  assert.deepEqual(run('1000 人', C).map((f) => f.fix.match(/P\.at\('[^']+'\)/)[0]), ["P.at('#153@1,000')"], '數字去千分位比、建議用字幕原文');
  assert.deepEqual(run('一年 100 倍').map((f) => [f.data.to, f.data.word]), [[151, '一年']], '中文 2 字照樣比：「一年」在 #151');
});

test('atNames：const X = P.at(字面值) → { ref: X }', () => {
  assert.deepEqual(R.atNames("const T1 = P.at('#12@錄影'), T2 = P.at(\"#13\", 0.3);\nconst ALL = P.at('#15');"), { '#12@錄影': 'T1', '#13': 'T2', '#15': 'ALL' });
});

test('floorFindings（tpl）：開場、段長下限比範例小或刪掉 → ⚠ floor-edited；fontShrinkFindings：字級比範例小 → ⚠（id／class 去掉前綴對回範例）', () => {
  const head = (lines) => `<!--\n  【D 下限】\n${lines}\n  【版面】\n-->`;
  const tpl = head('  T1 ≥ 3.1（主卡）\n  T2 ≥ T1 + 3.0\n  D ≥ T2 + 5.2');
  const it = item({ type: 'custom', start: 0, end: 30, D: 30 });
  const ed = (html) => R.floorFindings({ item: it, html, tpl, file: 'x-tl-a.html' }).filter((f) => f.rule === 'floor-edited').map((f) => f.msg);
  assert.deepEqual(ed(tpl), []);
  assert.deepEqual(ed(head('  T1 ≥ 3.5\n  D ≥ T2 + 5.2')), [], '改大、刪拍距都不報（拍距不驗）');
  assert.deepEqual(ed(head('  T1 ≥ 0.5\n  D ≥ T2 + 5.2')), ['檔頭【D 下限】的開場下限改過：範例是「T1 ≥ 3.1」，x-tl-a.html 改成「T1 ≥ 0.5」']);
  assert.deepEqual(ed(head('  T2 ≥ T1 + 3.0')), ['檔頭【D 下限】的開場下限改過：範例是「T1 ≥ 3.1」，x-tl-a.html 刪掉了', '檔頭【D 下限】的段長下限改過：範例是「D ≥ T2 + 3.9」，x-tl-a.html 刪掉了']);
  const T = '<style>#x-timeline .xtl-cap { font-size: 52px; }</style><div id="xtl-c1" class="xtl-cap sc-t52"></div><span class="xtl-lab sc-t72 sc-w900">2019</span>';
  assert.deepEqual([...R.fontSizes(T)].map(([k, v]) => `${k}:${v.px}`), ['c1:52', 'lab:72', 'cap:52']);
  const shrink = (html) => R.fontShrinkFindings({ item: it, html, tpl: T, file: 'x-tl-a.html' }).map((f) => f.msg);
  assert.deepEqual(shrink(T.replace(/xtl-/g, 'xtla-')), [], '改名換前綴照樣對得上');
  assert.deepEqual(shrink(T.replace(/xtl-/g, 'xtla-').replace('sc-t72', 'sc-t52')), ['字級比範例小：x-tl-a.html 的 xtla-lab 是 52px，範例是 72px']);
  assert.deepEqual(shrink(T.replace('font-size: 52px', 'font-size: 44px')), ['字級比範例小：x-tl-a.html 的 xtl-cap 是 44px，範例是 52px']);
  assert.deepEqual(R.fontShrinkFindings({ item: it, html: T, tpl: '' }), [], '找不到範例不比');
});

test('floorFindings：檔頭【D 下限】第一拍不夠 ✖、段長不夠 ⚠；拍距不驗（完成態停太短實測）；用到的名字不是 P.at 的那條不驗；檔頭與註解裡的 P.at 不算', () => {
  const html = (consts) => `<!--
  【D 下限】
  T1 ≥ 3.1（主卡 0.3 秒長出；3 點時改看 D ≥ T3 + 5.2）
  T2 ≥ T1 + 3.0；T3 ≥ T2 + 3.0；T4 ≥ T3 + 3.0
  D ≥ T4 + 5.2（講完 2.6 秒回均衡；D＝plan.json 這段的長度）
  【綁句欄位】
  <script> 開頭的 T1 = P.at('#99')
  【版面】
-->
<script>
  // const T4 = P.at('#40');
  ${consts}
  P.end();
</script>`;
  assert.deepEqual(R.floorRules(html('')).map((r) => [r.lhs, r.rhs, r.k]), [['T1', null, 3.1], ['T2', 'T1', 3], ['T3', 'T2', 3], ['T4', 'T3', 3], ['D', 'T4', 3.9]]);
  assert.deepEqual(R.atConsts(html("const T1 = P.at('#35@問題', 0.4), T2 = P.at(3.2);")), { T1: { ref: '#35@問題', off: 0.4 }, T2: { ref: 3.2, off: 0 } });
  const cues = [{ n: 35, start: 72.17, end: 75, text: '但我們馬上就會遇到一個問題' }, { n: 38, start: 78.5, end: 81, text: '但如果要用兩支以上的手機' }, { n: 40, start: 83.5, end: 86, text: '時間不同步' }];
  const it = item({ type: 'custom', start: 70, end: 90, D: 20 });
  // 3 點：T1 離段起點 2.17s < 3.1 → ✖；T4 不是 P.at → T4、D 兩條不驗
  const open = R.floorFindings({ item: it, html: html("const T1 = P.at('#35'), T2 = P.at('#38'), T3 = P.at('#40', 0.2);"), cuesOut: cues, file: 'x-timeline.html' });
  assert.deepEqual(open.map((f) => [f.level, f.rule]), [['error', 'floor']]);
  assert.match(open[0].msg, /開場還沒做完第一拍就到了：T1 = P\.at\('#35'\) 在段內 2\.17s（1:12\.17），x-timeline\.html 檔頭【D 下限】要 T1 ≥ 3\.1（差 0\.93s）/);
  assert.match(open[0].fix, /from 提早 0\.93s/);
  assert.doesNotMatch(open[0].fix, /第二個參數/, '差 > 0.5s 不建議延後綁句');
  // 4 點：T4 − T3 不報（拍距交給完成態停太短）；檔頭寫 5.2，settleTail 會把回均衡往前挪，實際下限 3.9：D 20 < T4 + 3.9 = 20.9 → ⚠ 段尾不夠
  const tail = R.floorFindings({ item: it, html: html("const T1 = P.at('#35', 1), T2 = P.at('#38'), T3 = P.at('#40'), T4 = P.at(17);"), cuesOut: cues });
  assert.deepEqual(tail.map((f) => [f.level, f.data.rule]), [['warn', 'D ≥ T4 + 3.9']]);
  assert.match(tail[0].msg, /段尾不夠：這段長 20\.00s，.*要 D ≥ T4 \+ 3\.9＝20\.90s（T4 在 1:27\.00）/);
  assert.deepEqual(R.floorFindings({ item: it, html: '<script>const T1 = P.at(0.5);</script>', cuesOut: cues }), [], '沒有【D 下限】不驗');
});

test('--help：印出 ✖／⚠ 規則與門檻（禁入區、節奏數字和 audit-rules 相同）', () => {
  const r = spawnSync(process.execPath, [path.join(TEMPLATE, 'tools', 'audit.mjs'), '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const [x0, y0, x1, y1] = R.PIP_ZONE;
  assert.ok(r.stdout.includes(`x ${x0}–${x1}、y ${y0}–${y1}`));
  for (const s of ['未定位頂層', '標題壓到內容', '綁句失敗', `< ${R.TITLE_GAP_MIN}px`, `< ${R.STAGGER_MIN} 秒`, `< ${R.HOLD_MIN} 秒`, `< ${R.TAIL_MIN} 秒`, `> ${R.DENSITY_MAX} 個`]) assert.ok(r.stdout.includes(s), s);
  assert.ok(!r.stdout.includes('1344'));
  // 和 specs/contracts/cli-003.md §1 的程式碼區塊逐字相同（有規格檔時才比）
  const spec = path.join(TEMPLATE, '..', '..', 'specs', 'contracts', 'cli-003.md');
  if (fs.existsSync(spec)) {
    const sec = fs.readFileSync(spec, 'utf8').split(/^## 1/m)[1].split(/^## 2/m)[0];
    assert.equal(r.stdout.trimEnd(), sec.split('```')[1].replace(/^\w*\n/, '').trimEnd());
  }
});


test('parseArgs', () => {
  assert.deepEqual(A.parseArgs(['--project', 'projects/example', '--only=x01,s03', '--all', '--json']), { project: 'projects/example', only: 'x01,s03', all: true, json: true });
  assert.throws(() => A.parseArgs(['--bogus']), /沒有 --bogus/);
  assert.throws(() => A.parseArgs(['--only']), /--only 後面要接值/);
  assert.deepEqual(A.parseArgs(['--format', 'portrait']), { format: 'portrait' });
  assert.deepEqual(A.parseArgs(['--only', 'x01', '--shots']), { only: 'x01', shots: true });
  const txt = A.formatReport({ errors: [], warnings: [], notes: [], findings: [], segments: [], shots: ['projects/p/work/audit-shots/x01-3.00.jpg'] });
  assert.match(txt, /截圖 1 張[\s\S]*audit-shots\/x01-3\.00\.jpg/);
});

// ---------- 找 Chrome／runtime、server ----------

test('cmpVer：多段數字比大小', () => {
  assert.ok(B.cmpVer('0.8.220', '0.8.99') > 0);
  assert.ok(B.cmpVer('mac_arm-152.0.7977.30', 'mac_arm-150.0.1.2') > 0);
});

test('findRuntime 只用工作區 node_modules 那一份（npx 快取裡更新的版本不算）；沒裝就叫你 npm install；chromeCandidates 照 ~/.cache/hyperframes 的結構找', () => {
  const home = tmp(), root = tmp();
  const mk = (pkg, v) => {
    fs.mkdirSync(path.join(pkg, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ version: v, bin: { hyperframes: './bin/hyperframes.mjs' } }));
    fs.writeFileSync(path.join(pkg, 'dist', 'hyperframe.runtime.iife.js'), '//');
  };
  mk(path.join(root, 'node_modules', 'hyperframes'), '0.8.221');
  mk(path.join(home, '.npm', '_npx', 'aaa', 'node_modules', 'hyperframes'), '0.9.3');
  const rt = B.findRuntime({ root });
  assert.equal(rt.version, '0.8.221');
  assert.equal(rt.file, path.join(root, 'node_modules', 'hyperframes', 'dist', 'hyperframe.runtime.iife.js'));
  assert.throws(() => B.findRuntime({ root: tmp() }), /node_modules\/hyperframes）→ 在工作區根目錄跑 npm install/);
  assert.deepEqual(HF.hfArgs(['render', '-o', 'a.mp4'], root), [path.join(root, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs'), 'render', '-o', 'a.mp4']);
  assert.throws(() => HF.hfArgs(['render'], tmp()), /在工作區根目錄跑 npm install/);
  // 專案在工作區外面（外接硬碟）：work/hyperframes 放 node_modules/.bin/hyperframes 小腳本指到工作區那一版；在工作區裡面不放
  const outside = tmp();
  assert.equal(HF.hfShim(outside, root), true);
  assert.match(fs.readFileSync(path.join(outside, 'node_modules', '.bin', 'hyperframes'), 'utf8'), new RegExp(`exec ".*" "${path.join(root, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" "\\$@"`));
  assert.ok(fs.existsSync(path.join(outside, 'node_modules', '.bin', 'hyperframes.cmd')));
  assert.equal(HF.hfShim(outside, root), false, '內容沒變就不重寫');
  const inside = path.join(root, 'projects', 'p', 'work', 'hyperframes');
  fs.mkdirSync(inside, { recursive: true });
  assert.equal(HF.hfShim(inside, root), false);
  assert.ok(!fs.existsSync(path.join(inside, 'node_modules')));
  const exe = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  for (const v of ['mac_arm-150.0.1.2', 'mac_arm-152.0.7977.30']) {
    const d = path.join(home, '.cache', 'hyperframes', 'chrome', 'chrome-headless-shell', v, 'chrome-headless-shell-mac-arm64');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, exe), '');
  }
  const c = B.chromeCandidates(home, {});
  assert.equal(c.length, 2);
  assert.match(c[0], /152\.0\.7977\.30/);
});

test('startServer：index.html 注入 runtime（檔案不改）、影片回 404、不能跳出資料夾', async () => {
  const dir = tmp();
  const html = '<!doctype html><html><head><title>t</title></head><body></body></html>';
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'a.mp4'), 'x');
  const rt = path.join(tmp(), 'rt.js');
  fs.writeFileSync(rt, 'window.__rt = 1;');
  assert.match(B.injectRuntime(html), /<head><script src="\/__audit_hf_runtime\.js"><\/script>|<head>\n<script src="\/__audit_hf_runtime\.js"><\/script>/);
  const { server, port } = await B.startServer(dir, rt);
  try {
    const get = async (p) => { const r = await fetch(`http://127.0.0.1:${port}${p}`); return { s: r.status, t: await r.text() }; };
    const idx = await get('/index.html');
    assert.equal(idx.s, 200);
    assert.match(idx.t, /__audit_hf_runtime\.js/);
    assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), html);
    assert.equal((await get(B.RUNTIME_URL)).t, 'window.__rt = 1;');
    assert.equal((await get('/a.mp4')).s, 404);
    assert.equal((await get('/..%2F..%2Fetc%2Fpasswd')).s, 404);
  } finally { server.close(); }
});

// ---------- 真的開瀏覽器（找不到 HyperFrames 的 Chrome 或 runtime 就略過）----------

let chrome = null, runtime = null;
try { chrome = B.chromeCandidates()[0] || null; runtime = B.findRuntime({}).file; } catch { /* 沒裝 */ }

test('瀏覽器實量：HyperFrames runtime 載入子合成、renderSeek 到完成態、抓到撐破與進字幕區', { skip: !(chrome && runtime) && '找不到 HyperFrames 的 Chrome 或 runtime（先跑 npx hyperframes browser ensure）', timeout: 60000 }, async () => {
  const dir = tmp('hf-audit-page-');
  fs.mkdirSync(path.join(dir, 'kit'));
  fs.mkdirSync(path.join(dir, 'compositions'));
  for (const f of ['gsap.min.js', 'scene-motion.js']) fs.copyFileSync(path.join(TEMPLATE, 'kit', f), path.join(dir, 'kit', f));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="UTF-8"><script src="kit/gsap.min.js"></script><script src="kit/scene-motion.js"></script>
<style>body{margin:0;background:#000}#main-root{position:relative;width:1920px;height:1080px;overflow:hidden}</style></head><body>
<div id="main-root" data-composition-id="main" data-start="0" data-duration="4" data-width="1920" data-height="1080" data-fps="30">
  <div id="el-x01" data-composition-id="x-t" data-composition-src="compositions/x-t.html" data-start="0.5" data-duration="3" data-track-index="1" data-width="1920" data-height="1080" style="z-index:20"></div>
</div>
<script>(function(){ window.__timelines = window.__timelines || {}; const tl = gsap.timeline({ paused: true }); tl.set({}, {}, 4); window.__timelines['main'] = tl; })();</script>
</body></html>`);
  fs.writeFileSync(path.join(dir, 'compositions', 'x-t.html'), `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>x-t</title></head><body>
<template id="x-t-template">
  <style>
    #x-t { position: absolute; inset: 0; }
    #x-t #xt-card { position: absolute; left: 120px; top: 160px; width: 400px; padding: 20px; background: #0b1020; border: 4px solid #ffd400; border-radius: 12px; }
    #x-t #xt-title { white-space: nowrap; color: #fff; font-size: 56px; line-height: 64px; }
    #x-t #xt-note { position: absolute; left: 120px; top: 880px; width: 400px; height: 80px; background: #0b1020; border-radius: 10px; }
  </style>
  <div id="x-t" data-composition-id="x-t" data-width="1920" data-height="1080" data-duration="3">
    <div id="xt-card"><div id="xt-title">這一行一定會撐破卡片的標題</div></div>
    <div id="xt-note"></div>
    <div id="xt-loose" style="height:40px"></div>
    <div id="xt-a" style="position:absolute;left:700px;top:100px;width:200px;height:80px;background:#0b1020;color:#fff">上傳雲端<i id="xt-strike" style="position:absolute;left:0;top:38px;width:200px;height:4px;background:#fff"></i><i id="xt-ring" style="position:absolute;left:0;top:0;width:200px;height:80px;box-sizing:border-box;border:4px solid #ffd400"></i></div>
    <div id="xt-b" style="position:absolute;left:1000px;top:100px;width:200px;height:80px;background:#0b1020"></div>
  </div>
  <script>(function () { const tl = gsap.timeline({ paused: true }); tl.fromTo('#xt-card', { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0);
    tl.fromTo('#xt-a', { opacity: 0 }, { opacity: 1, duration: 0.4 }, 1); tl.fromTo('#xt-b', { opacity: 0 }, { opacity: 1, duration: 0.4 }, 1.1);
    tl.fromTo('#xt-strike', { scaleX: 0 }, { scaleX: 1, duration: 0.3 }, 2); tl.fromTo('#xt-ring', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.2); tl.fromTo('#xt-b', { x: 0 }, { x: 20, duration: 0.3 }, 2.4);
    tl.set({}, {}, 3); window.__timelines['x-t'] = tl; })();</script>
</template></body></html>`);
  const S = await B.openSession({ dir, chrome, runtime });
  try {
    // 004 的 qc.mjs 依賴這組介面（openSession({ dir, chrome, runtime })、findRuntime(opts).file）：不改名、不拿掉
    for (const k of ['seek', 'measure', 'motion', 'cueErrors', 'evaluate', 'screenshot', 'close']) assert.equal(typeof S[k], 'function', `session.${k}`);
    assert.ok(Array.isArray(S.errors));
    assert.equal(B.openSession.length, 1);
    assert.equal(typeof B.findRuntime({}).file, 'string');
    await S.seek(0.7);   // 淡入途中：卡片在動，不判
    const m0 = await S.measure({ hostId: 'el-x01', W: 1920, H: 1080 });
    assert.equal(m0.host.start, 0.5);
    assert.ok(m0.els.find((e) => e.desc.id === 'xt-card').moving);
    await S.seek(2.9);   // 完成態
    const m = await S.measure({ hostId: 'el-x01', W: 1920, H: 1080 });
    const card = m.els.find((e) => e.desc.id === 'xt-card');
    assert.deepEqual(card.rect, [120, 160, 568, 272]);
    assert.equal(card.moving, false);
    const f = R.judgeSample(m, { item: { id: 'x01', label: 'custom x-t.html', type: 'custom', start: 0.5, end: 3.5 }, t: 2.9, kind: 'done', layout: 'overlay', pipOn: false, speakerBox: null });
    assert.deepEqual([...new Set(f.filter((x) => x.level === 'error').map((x) => x.rule))].sort(), ['caption', 'overflow']);
    assert.match(f.find((x) => x.rule === 'overflow').msg, /文字撐破容器 #xt-card：#xt-title「這一行一定會撐破卡片…」/);
    assert.match(f.find((x) => x.rule === 'caption').msg, /#xt-note 下緣 y=960/);
    // 003：未定位頂層（root 直接底下、position: static）與節奏（0.1 秒間隔）
    const it = { id: 'x01', label: 'custom x-t.html', type: 'custom', compId: 'x-t', start: 0.5, end: 3.5, D: 3 };
    const lf = R.judgeLayout(m, { item: it, t: 2.9, kind: 'done', layout: 'overlay' });
    assert.deepEqual(lf.filter((x) => x.rule === 'unpositioned').map((x) => x.el.id), ['xt-loose']);
    const mot = await S.motion({ hostId: 'el-x01', compId: 'x-t' });
    assert.equal(mot.D, 3);
    assert.deepEqual(mot.tweens.map((t) => [t.start, t.kind, t.up]), [[0, 'enter', true], [1, 'enter', true], [1.1, 'enter', true], [2, 'change', true], [2.2, 'enter', true], [2.4, 'change', false]], '從 0 長出來算 up、位移不算');
    // 008 x-fix：刪除線（沒疊滿、自己沒字）不算出現「上傳雲端」；亮框（疊滿）算它亮起的那一項
    assert.equal(mot.tweens[3].targets[0].say, '', '刪除線不說字');
    assert.deepEqual([mot.tweens[4].targets[0].emph, mot.tweens[4].targets[0].say], [true, '上傳雲端']);
    assert.equal(mot.tweens[1].up, true);
    assert.equal(mot.tweens[1].targets[0].say, '上傳雲端', '目標自己的字（亮框這類沒字的取最近有字的祖先）');
    assert.match(R.judgeMotion(mot, { item: it }).findings.find((x) => x.rule === 'stagger').msg, /#xt-a「上傳雲端」 和 #xt-b 只差 0\.10s/);
    assert.deepEqual(await S.cueErrors(), []);
    assert.equal((await S.measure({ hostId: 'el-nope', W: 1920, H: 1080 })).missingHost, true);
  } finally { await S.close(); }
});

test('024 瀏覽器實量：直接寫 GSAP 的 tl.from 算進場；stagger 帶的一組算一個新元素', { skip: !(chrome && runtime) && '找不到 HyperFrames 的 Chrome 或 runtime（先跑 npx hyperframes browser ensure）', timeout: 60000 }, async () => {
  const dir = tmp('hf-audit-gsap-');
  fs.mkdirSync(path.join(dir, 'kit'));
  fs.mkdirSync(path.join(dir, 'compositions'));
  fs.copyFileSync(path.join(TEMPLATE, 'kit', 'gsap.min.js'), path.join(dir, 'kit', 'gsap.min.js'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="UTF-8"><script src="kit/gsap.min.js"></script>
<style>body{margin:0;background:#000}#main-root{position:relative;width:1920px;height:1080px;overflow:hidden}</style></head><body>
<div id="main-root" data-composition-id="main" data-start="0" data-duration="4" data-width="1920" data-height="1080" data-fps="30">
  <div id="el-g" data-composition-id="x-g" data-composition-src="compositions/x-g.html" data-start="0" data-duration="4" data-track-index="1" data-width="1920" data-height="1080"></div>
</div>
<script>(function(){ window.__timelines = window.__timelines || {}; const tl = gsap.timeline({ paused: true }); tl.set({}, {}, 4); window.__timelines['main'] = tl; })();</script>
</body></html>`);
  fs.writeFileSync(path.join(dir, 'compositions', 'x-g.html'), `<!doctype html><html><head><meta charset="UTF-8"></head><body>
<template id="x-g-template">
  <div id="x-g" data-composition-id="x-g" data-width="1920" data-height="1080" data-duration="4" style="position:absolute;inset:0">
    <div class="xg-row" style="position:absolute;left:120px;top:200px;width:300px;height:60px;background:#222">一</div>
    <div class="xg-row" style="position:absolute;left:120px;top:300px;width:300px;height:60px;background:#222">二</div>
    <div class="xg-row" style="position:absolute;left:120px;top:400px;width:300px;height:60px;background:#222">三</div>
    <div id="xg-c" style="position:absolute;left:600px;top:200px;width:300px;height:60px;background:#222">結論</div>
  </div>
  <script>(function () { const tl = gsap.timeline({ paused: true });
    tl.from('#x-g .xg-row', { opacity: 0, y: 20, duration: 0.4, stagger: 0.3 }, 0.5);
    tl.from('#xg-c', { opacity: 0, duration: 0.4 }, 2.5);
    tl.set({}, {}, 4); window.__timelines['x-g'] = tl; })();</script>
</template></body></html>`);
  const S = await B.openSession({ dir, chrome, runtime });
  try {
    const mot = await S.motion({ hostId: 'el-g', compId: 'x-g' });
    assert.deepEqual(mot.tweens.map((t) => [t.start, t.kind, t.up, t.targets.length]), [[0.5, 'enter', true, 3], [2.5, 'enter', true, 1]], 'tl.from 的 opacity 0 → 本來的樣子算進場');
    assert.deepEqual(R.motionUnits(mot).map((u) => u.t), [0.5, 2.5], '三列用同一個 tween 錯拍出現，只算一個新元素');
    const it = { id: 'g1', label: 'custom x-g.html', type: 'custom', compId: 'x-g', start: 0, end: 4, D: 4 };
    assert.equal(R.judgeMotion(mot, { item: it }).findings.filter((x) => x.rule === 'density').length, 0);
  } finally { await S.close(); }
});

// ---------- 009 直式（FR-071、FR-072）----------

test('009 直式：stageKindOf／portraitPlan（全畫面 custom 與 stage 情境縮放、01 用 ch、字卡動態 fx；其他原生 1080×1920，字幕帶讀 window.__regions）', async () => {
  const { CANVAS: C } = await imp('lib/canvas.mjs');
  assert.equal(R.stageKindOf(item({ opaque: true, seg: { layout: 'fullscreen' } })), 'fs');
  assert.equal(R.stageKindOf(item()), null);
  assert.equal(R.stageKindOf({ type: 'scene', opaque: true, scene: { no: '04c', portrait: 'stage' } }), 'fs');
  assert.equal(R.stageKindOf({ type: 'scene', opaque: true, scene: { no: '01', portrait: 'stage' } }), 'ch');
  assert.equal(R.stageKindOf({ type: 'scene', scene: { no: '06', portrait: 'move' } }), null);
  assert.equal(R.stageKindOf({ type: 'scene', opaque: true, scene: '04a' }), 'fs', 'scene.json 沒寫 portrait 照編號');
  assert.equal(R.stageKindOf({ type: 'fx' }), 'fx');
  const fs_ = R.portraitPlan(item({ opaque: true, seg: { layout: 'fullscreen' } }), C.portrait);
  assert.deepEqual(fs_, { unstage: true, W: 1920, H: 1080, stage: { kind: 'fs', s: 0.8475, window: [120, 130, 1300, 880], view: [72.8, 130, 1347.1, 908.8], minFont: 32 } }, 'view＝畫布左右緣、上 unsafe 線（y 240）、下講者面板頂（y 900）換回子合成座標');
  assert.equal(R.portraitPlan({ type: 'scene', opaque: true, scene: { no: '01', portrait: 'stage' } }, C.portrait).stage.s, 0.625);
  const ov = R.portraitPlan(item(), C.portrait);
  assert.deepEqual([ov.unstage, ov.W, ov.H, ov.geo.captionY, ov.geo.captionEnd, ov.geo.minFont], [false, 1080, 1920, 1280, 1420, 32]);
  assert.deepEqual(ov.geo.unsafe, C.portrait.unsafe);
  assert.deepEqual([R.portraitPlan(item(), C.portrait, { captions: [0, 1300, 1080, 100] }).geo.captionY, R.portraitPlan(item(), C.portrait, { captions: [0, 1300, 1080, 100] }).geo.captionEnd], [1300, 1400]);
});

test('009 直式：✖ portrait-window（帶 id 的絕對定位元素超出舞台窗；量擺位外框，鏡頭推不算；allow-overflow、沒 id、非絕對定位不算）、⚠ 字級 × 0.8475 < 32', () => {
  const st = { kind: 'fs', s: 0.8475, window: [120, 130, 1300, 880], minFont: 32 };
  const pj = (els, extra = {}) => R.judgeSample({ host: { start: 10 }, els, ...extra }, { item: item({ opaque: true, seg: { layout: 'fullscreen' } }), t: 17.4, kind: 'done', layout: 'fullscreen', pipOn: true, speakerBox: null, W: 1920, H: 1080, stage: st });
  const abs = (o) => ({ ...el(o), pos: 'absolute' });
  const out = abs({ rect: [1180, 300, 1380, 400], painted: true, desc: { id: 'xp-out' } });
  const f = pj([out]);
  assert.deepEqual(rules(f), ['error:portrait-window']);
  assert.match(f[0].msg, /^直式時會被切到或壓到講者面板：#xp-out x 1180–1380、y 300–400，超出舞台窗 x 120–1300、y 130–880（右邊 80px）/);
  assert.match(f[0].fix, /data-layout-allow-overflow/);
  assert.ok(!/specs\//.test(f[0].msg + f[0].fix));
  // 鏡頭推（transform）把外框推出窗：擺位外框（layoutBoxes）在窗內就不報；反過來擺位在窗外就報
  assert.deepEqual(rules(pj([out], { layoutBoxes: { 'xp-out': [1100, 300, 1290, 400] } })), []);
  assert.deepEqual(rules(pj([abs({ rect: [200, 300, 400, 400], painted: true, desc: { id: 'xp-in' } })], { layoutBoxes: { 'xp-in': [200, 860, 400, 960] } })), ['error:portrait-window']);
  assert.deepEqual(rules(pj([{ ...out, allowOverflow: true }])), []);
  assert.deepEqual(rules(pj([{ ...out, desc: { id: '' } }])), []);
  assert.deepEqual(rules(pj([{ ...out, pos: 'relative' }])), []);
  assert.deepEqual(rules(pj([{ ...out, bg: true }])), []);
  assert.deepEqual(rules(pj([abs({ rect: [1299, 300, 1301.5, 400], painted: true, desc: { id: 'xp-edge' } })])), [], '容許 2px');
  const ch = R.judgeSample({ host: { start: 10 }, els: [abs({ rect: [100, 300, 400, 400], painted: true, desc: { id: 'c-t' } })] }, { item: item(), t: 1, kind: 'done', layout: 'fullscreen', stage: { kind: 'ch', s: 0.625, window: [160, 260, 1760, 870], minFont: 32 } });
  assert.match(ch[0].msg, /^直式時會被切到：#c-t/);
  // 字級：36 × 0.8475 = 30.5 < 32 ⚠；38 不報；舞台段不量子母畫面
  const small = el({ rect: [200, 300, 500, 340], textRect: [200, 300, 500, 340], fontSize: 36, desc: { id: 'xp-s' } });
  assert.match(pj([small]).find((x) => x.rule === 'font').msg, /字太小：#xp-s 直式縮 0\.8475 倍後 30\.5px（< 32px）/);
  assert.match(pj([small]).find((x) => x.rule === 'font').fix, /直式要寫 ≥ 38px（縮放前）/);
  assert.ok(!pj([{ ...small, fontSize: 38 }]).some((x) => x.rule === 'font'));
  assert.ok(!pj([el({ rect: [1500, 700, 1700, 800], painted: true })]).some((x) => x.rule === 'pip'));
});

test('009 直式：⚠ portrait-cam（P.cam 每個停點換算的外框超出舞台看得到的範圍；只在完成態判、每個容器一則）、垂直平衡用舞台窗 y 130–880', () => {
  const st = { kind: 'fs', s: 0.8475, window: [120, 130, 1300, 880], view: [72.8, 130, 1347.1, 908.8], minFont: 32 };
  const pj = (extra, kind = 'done') => R.judgeSample({ host: { start: 10 }, els: [], ...extra }, { item: item({ opaque: true, seg: { layout: 'fullscreen' } }), t: 17.4, kind, layout: 'fullscreen', pipOn: false, speakerBox: null, W: 1920, H: 1080, stage: st });
  const f = pj({ camBoxes: { 'xproc-card': { box: [96.4, 124.8, 1374.6, 865.2], scale: 1.04 } } });
  assert.deepEqual(rules(f), ['warn:portrait-cam']);
  assert.equal(f[0].msg, '鏡頭推時右緣會切掉 28px、上緣會切掉 6px：#xproc-card（P.cam 最大 1.04 倍；直式看得到 x 73–1347、y 130–909）');
  assert.equal(f[0].fix, '內容群縮小一級（data-gap 改小一級或字級 −4），或這段不用 P.cam（shared/style.md「直式」）');
  assert.deepEqual(rules(pj({ camBoxes: { 'xproc-card': { box: [96.4, 150, 1323.6, 890.5], scale: 1.04 } } })), [], '直式推法（上緣中點為原點）在範圍內');
  assert.deepEqual(rules(pj({ camBoxes: { 'xproc-card': { box: [96.4, 124.8, 1374.6, 865.2], scale: 1.04 } } }, 'still')), [], '只在完成態判一次');
  assert.deepEqual(rules(pj({})), []);
  // 垂直平衡：舞台段內容區換成舞台窗（鏡頭推近時卡底 890 不算失衡）；橫式照 120–870
  const card = el({ rect: [96, 150, 1324, 890], painted: true, desc: { id: 'c' } });
  const lay = (ctx) => R.judgeLayout({ host: { start: 10 }, els: [card] }, { item: item({ opaque: true, seg: { layout: 'fullscreen' } }), t: 17.4, kind: 'still', layout: 'fullscreen', ...ctx }).filter((x) => x.rule === 'vbalance');
  assert.equal(lay({}).length, 1);
  assert.equal(lay({ contentY: [130, 880] }).length, 0);
});

test('009 直式原生段（overlay）：✖ 字幕保留帶 y 1280–1420、✖ unsafe（上方／下方／右側按鈕列）、超出畫面量 1080×1920、字級 < 32；橫式訊息不變', async () => {
  const { CANVAS: C } = await imp('lib/canvas.mjs');
  const pl = R.portraitPlan(item(), C.portrait);
  const nj = (els) => R.judgeSample({ host: { start: 10 }, els }, { item: item(), t: 17.4, kind: 'done', layout: 'overlay', pipOn: false, speakerBox: null, W: pl.W, H: pl.H, geo: pl.geo });
  const cap = nj([el({ rect: [100, 1150, 600, 1300], painted: true, desc: { id: 'g-card' } })]);
  assert.deepEqual(rules(cap), ['error:caption']);
  assert.match(cap[0].msg, /進字幕區：#g-card y 1150–1300（直式字幕保留帶 y 1280–1420）/);
  assert.match(cap[0].fix, /整組往上移 ≥ 60px，讓下緣 ≤ 1240/);
  assert.deepEqual(rules(nj([el({ rect: [100, 880, 900, 1240], painted: true })])), [], '下方字卡 y 880–1240 不報');
  const top = nj([el({ rect: [100, 150, 600, 300], painted: true, desc: { id: 'g-top' } })]);
  assert.deepEqual(rules(top), ['error:unsafe']);
  assert.match(top[0].msg, /直式會被平台介面蓋住：#g-top x 100–600、y 150–300，進到上方 240px（x 0–1080、y 0–240）/);
  assert.match(nj([el({ rect: [700, 900, 1000, 1000], painted: true })])[0].msg, /進到右側按鈕列（x 940–1080、y 840–1440）/);
  assert.match(nj([el({ rect: [100, 1500, 600, 1600], painted: true })]).find((x) => x.rule === 'unsafe').msg, /進到下方 480px/);
  assert.match(nj([el({ rect: [900, 300, 1200, 400], painted: true })]).find((x) => x.rule === 'canvas').fix, /移回 1080×1920 以內/);
  assert.match(nj([el({ rect: [100, 300, 600, 340], textRect: [100, 300, 600, 340], fontSize: 31 })]).find((x) => x.rule === 'font').msg, /31px（< 32px）/);
  // 橫式（沒有 geo／stage）訊息逐字不變
  assert.match(judge([el({ rect: [100, 880, 600, 960], painted: true, desc: { id: 'n' } })]).find((x) => x.rule === 'caption').msg, /^進字幕區：#n 下緣 y=960（字幕區 y ≥ 920）$/);
  assert.match(judge([el({ rect: [1700, 100, 2000, 200], textRect: [1700, 100, 2000, 200] })]).find((x) => x.rule === 'canvas').fix, /移回 1920×1080 以內/);
});

test('009 瀏覽器實量：直式 root 裡舞台縮放的 host（stage.fs transform＋allow-overflow）→ unstage 量子合成座標、量完還原；超窗 ✖、鏡頭推不算', { skip: !(chrome && runtime) && '找不到 HyperFrames 的 Chrome 或 runtime（先跑 npx hyperframes browser ensure）', timeout: 60000 }, async () => {
  const { CANVAS: C, stageTransform } = await imp('lib/canvas.mjs');
  const st = stageTransform('fs', C.portrait);
  const dir = tmp('hf-audit-portrait-');
  fs.mkdirSync(path.join(dir, 'kit'));
  fs.mkdirSync(path.join(dir, 'compositions'));
  fs.copyFileSync(path.join(TEMPLATE, 'kit', 'gsap.min.js'), path.join(dir, 'kit', 'gsap.min.js'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920"><script src="kit/gsap.min.js"></script>
<style>body{margin:0;background:#000}#main-root{position:relative;width:1080px;height:1920px;overflow:hidden}#el-x01{${st.css}}</style></head><body>
<div id="main-root" data-composition-id="main" data-start="0" data-duration="4" data-width="1080" data-height="1920" data-fps="30">
  <div id="el-x01" ${st.attr} data-composition-id="x-p" data-composition-src="compositions/x-p.html" data-start="0.5" data-duration="3" data-track-index="1" data-width="1920" data-height="1080" style="z-index:20"></div>
</div>
<script>(function(){ window.__timelines = window.__timelines || {}; const tl = gsap.timeline({ paused: true }); tl.set({}, {}, 4); window.__timelines['main'] = tl; })();</script>
</body></html>`);
  fs.writeFileSync(path.join(dir, 'compositions', 'x-p.html'), `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>x-p</title></head><body>
<template id="x-p-template">
  <style>
    #x-p { position: absolute; inset: 0; }
    #x-p #xp-card { position: absolute; left: 120px; top: 150px; width: 1180px; height: 712px; background: #0b1020; }
    #x-p #xp-cam { position: absolute; left: 820px; top: 300px; width: 300px; height: 200px; background: #334; }
    #x-p #xp-out { position: absolute; left: 1250px; top: 300px; width: 200px; height: 100px; background: #ffd400; }
    #x-p #xp-small { position: absolute; left: 60px; top: 40px; color: #fff; font-size: 36px; line-height: 48px; white-space: nowrap; }
  </style>
  <div id="x-p" data-composition-id="x-p" data-width="1920" data-height="1080" data-duration="3">
    <div id="xp-card"><div id="xp-small">小字</div><div id="xp-cam"></div></div>
    <div id="xp-out"></div>
  </div>
  <script>(function () { const tl = gsap.timeline({ paused: true }); tl.fromTo('#xp-card', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0);
    tl.to('#xp-card', { scale: 1.06, x: 80, transformOrigin: '50% 50%', duration: 0.4, data: { fn: 'cam' } }, 1); tl.set({}, {}, 3); window.__timelines['x-p'] = tl; })();</script>
</template></body></html>`);
  const S = await B.openSession({ dir, chrome, runtime, W: 1080, H: 1920 });
  try {
    assert.deepEqual(await S.evaluate('[innerWidth, innerHeight]'), [1080, 1920]);
    await S.seek(2.9);
    const pl = R.portraitPlan({ id: 'x01', type: 'custom', opaque: true, seg: { layout: 'fullscreen' } }, C.portrait);
    const m = await S.measure({ hostId: 'el-x01', W: pl.W, H: pl.H, unstage: true });
    const card = m.els.find((e) => e.desc.id === 'xp-card');
    assert.ok(card.rect[2] > 1300 + 20, `鏡頭推 1.06 倍：畫面外框超出 1300（${card.rect}）`);
    assert.deepEqual(m.layoutBoxes['xp-card'], [120, 150, 1300, 862], '擺位外框＝子合成座標、不含 transform');
    assert.deepEqual(m.layoutBoxes['xp-out'], [1250, 300, 1450, 400]);
    assert.equal(m.els.find((e) => e.desc.id === 'xp-out').allowOverflow, false, 'host 的 allow-overflow 量的時候拿掉');
    const f = R.judgeSample(m, { item: { id: 'x01', label: 'custom x-p.html', type: 'custom', start: 0.5, end: 3.5 }, t: 2.9, kind: 'done', layout: 'fullscreen', pipOn: false, speakerBox: null, W: pl.W, H: pl.H, stage: pl.stage });
    assert.deepEqual(f.filter((x) => x.level === 'error').map((x) => `${x.rule}:${x.el.id}`), ['portrait-window:xp-out']);
    // P.cam（data.fn＝'cam'）的終值：卡片 120–1300 以中心放大 1.06 倍再右移 80 → 右緣 1415.4，超出看得到的 1347.1
    assert.equal(m.camBoxes['xp-card'].scale, 1.06);
    assert.deepEqual(m.camBoxes['xp-card'].box, [164.6, 128.64, 1415.4, 883.36]);
    assert.equal(f.find((x) => x.rule === 'portrait-cam').msg, '鏡頭推時右緣會切掉 69px：#xp-card（P.cam 最大 1.06 倍；直式看得到 x 73–1347、y 130–909）', '上緣差 1.4px 在容許 2px 內');
    assert.match(f.find((x) => x.rule === 'font').msg, /#xp-small「小字」 直式縮 0\.8475 倍後 30\.5px/);
    // 量完還原：host 的 transform、allow-overflow、卡片的鏡頭推都回來
    assert.deepEqual(JSON.parse(await S.evaluate(`JSON.stringify([getComputedStyle(document.getElementById('el-x01')).transform, document.getElementById('el-x01').hasAttribute('data-layout-allow-overflow'), document.querySelector('#xp-card').style.transform])`)),
      [`matrix(${st.s}, 0, 0, ${st.s}, ${st.tx}, ${st.ty})`, true, 'translate(80px, 0px) scale(1.06, 1.06)']);
    const m2 = await S.measure({ hostId: 'el-x01', W: 1080, H: 1920 });
    assert.ok(m2.els.find((e) => e.desc.id === 'xp-out').rect[0] < 1080, '不 unstage：量到的是縮放後的畫布座標');
    assert.equal(m2.layoutBoxes, undefined);
  } finally { await S.close(); }
});

// ---------- 003 P2：畫面沒有變化（Sonnet 重跑範例：x05 一段綁 12 句、10 秒不動） ----------
test('staticFindings：連續 > 6s 沒有任何補間、那段有字幕句在講 → ⚠（建議綁空檔中間開頭的那句）；有句子但 ≤ 6s、沒人講、非 custom 不報', () => {
  const it = { id: 'x05', label: 'custom x-sync.html', type: 'custom', start: 72, end: 99, D: 27, fadeOut: true };
  const tw = (s, e) => ({ start: s, end: e, kind: 'enter', up: true, targets: [] });
  const cues = [{ n: 36, start: 72, end: 78, text: 'a' }, { n: 37, start: 78.2, end: 80.5, text: 'b' }, { n: 38, start: 80.6, end: 83.4, text: 'c' },
    { n: 39, start: 83.5, end: 86, text: 'd' }, { n: 40, start: 86.1, end: 88.2, text: 'e' }, { n: 41, start: 88.3, end: 99, text: 'f' }];
  const mo = { D: 27, marks: [], tweens: [tw(0.5, 3.35), tw(6, 6.5), tw(16.5, 17), tw(20, 21)] };
  const f = R.staticFindings(mo, { item: it, cuesOut: cues });
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].level, f[0].rule, f[0].t], ['warn', 'static', 78.5]);
  assert.equal(f[0].msg, '畫面沒有變化：x05 在 1:18.50–1:28.50 畫面 10.0s 沒有變化（講解 #37–#40 在講；上限 6s）');
  assert.equal(f[0].fix, "補一拍綁 P.at('#39@詞')（詞換成 #39 講到的站名、項目、數字，讓那一刻有東西出現、亮起或換數字），或在 #39 拆成兩段");
  assert.deepEqual(f[0].data.cues, [37, 38, 39, 40]);
  // 段尾：最後一個動作到淡出開始 > 6s 也算（D 27、淡出 26.5、最後動作 20 結束 → 6.5s）
  const tail = R.staticFindings({ D: 27, marks: [], tweens: [tw(0.5, 20)] }, { item: it, cuesOut: cues });
  assert.deepEqual(tail.map((x) => [x.data.from, x.data.to]), [[92, 98.5]]);
  assert.match(tail[0].fix, /P\.at\('#41@詞'\)/, '空檔裡沒有句子開頭 → 取重疊的那句');
  // 剛好 6s、沒有字幕（只重疊 0.2s）、不是 custom、沒有 motion → 不報
  assert.deepEqual(R.staticFindings({ D: 27, marks: [], tweens: [tw(0.5, 3), tw(9, 26.5)] }, { item: it, cuesOut: cues }), []);
  assert.deepEqual(R.staticFindings(mo, { item: it, cuesOut: [{ n: 1, start: 70, end: 78.7, text: 'x' }] }), []);
  assert.deepEqual(R.staticFindings(mo, { item: { ...it, type: 'scene' }, cuesOut: cues }), []);
  assert.deepEqual(R.staticFindings(null, { item: it, cuesOut: cues }), []);
});

// ---------- 010 motion v2：§13 的四條改法＋分鏡對齊（cli-003 §2.2 末段、§2.3d） ----------
test('v2：同一個 P.* 呼叫（data.sc）算 1 個新元素；微動（role micro）不算忙碌、不算最後一幕的動作', () => {
  const v = (start, end, kind, targets, call, role = 'enter') => ({ ...tw(start, end, kind, targets), call, role });
  // 錯拍彈出 4 站（同一呼叫，間隔 0.12）＋另一個呼叫：只算 2 個，不報 density／stagger
  const st = [0, 1, 2, 3].map((i) => v(1 + i * 0.12, 1.6 + i * 0.12, 'enter', tg({ key: `st${i}` }), 7));
  const units = R.motionUnits({ tweens: [...st, v(1.2, 1.7, 'enter', tg({ key: 'title' }), 8)] });
  assert.deepEqual(units.map((u) => u.tg.key), ['st0', 'title']);
  const idle = v(0.5, 8, 'change', tg({ key: 'card' }), 9, 'micro');
  assert.deepEqual(rules(mo([...st, idle], { D: 8, marks: [{ ref: '#1', t: 1 }, { ref: '#2', t: 4 }] }).findings), []);
  assert.deepEqual(R.busySpans({ tweens: [...st, idle] }), [[1, 1.96]]);
  // 沒有 data 的舊 tween 照舊算
  assert.deepEqual(R.busySpans({ tweens: [tw(0.5, 8, 'change', tg())] }), [[0.5, 8]]);
  // 最後一幕：只有微動跑到段尾 → 不報 tail；同樣的 tween 沒標 micro → 報
  assert.deepEqual(rules(mo([v(1, 1.5, 'enter', tg(), 1), idle], { D: 8 }).findings), []);
  assert.deepEqual(rules(mo([v(1, 1.5, 'enter', tg(), 1), { ...idle, role: null }], { D: 8 }).findings), ['warn:tail']);
  // 強調（漣漪、光澤）不算停留中的動作；焦點、強調不是新元素；卡片裡的東西 0.6 秒內跟著卡片出現不另算
  const marks2 = [{ ref: '#1', t: 1 }, { ref: '#2', t: 3.2 }];
  assert.deepEqual(rules(mo([v(1, 1.5, 'enter', tg(), 1), v(1.6, 2.5, 'change', tg(), 2, 'accent')], { D: 8, marks: marks2 }).findings), []);
  assert.deepEqual(rules(mo([v(1, 1.5, 'enter', tg(), 1), v(1.6, 2.5, 'change', tg(), 2, 'enter')], { D: 8, marks: marks2 }).findings), ['warn:hold']);
  const card2 = tg({ key: 'card2' });
  assert.deepEqual(R.motionUnits({ tweens: [v(0.3, 1.1, 'enter', card2, 1), v(0.85, 1.3, 'enter', tg({ key: 'ttl', chain: ['card2'] }), 2), v(1, 1.5, 'enter', tg({ key: 'glow' }), 3, 'focus')] }).map((u) => u.tg.key), ['card2']);
  // 畫面沒有變化：微動不算變化
  const it = { id: 'x05', label: 'custom x-sync.html', type: 'custom', start: 0, end: 20, D: 20 };
  const f = R.staticFindings({ D: 20, marks: [], tweens: [v(0.5, 1, 'enter', tg(), 1), v(1, 20, 'change', tg(), 2, 'micro')] }, { item: it, cuesOut: [{ n: 1, start: 0, end: 20, text: 'a' }] });
  assert.deepEqual(f.map((x) => x.rule), ['static']);
});

const BT = await imp('lib/audit-beats.mjs');
const SHEET = (rows, head = BT.BEAT_HEADER) => `## 分鏡\n\n#### 動畫分鏡 x05\n\n| ${head.join(' | ')} |\n|---|---|---|---|---|---|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n\n#### 動畫分鏡 x06\n\n沒有表\n`;
const bItem = { id: 'x05', label: 'custom x-sync.html', type: 'custom', start: 72, end: 99, D: 27 };
const bCues = [{ n: 35, start: 72.17, end: 75, text: '但我們馬上就會遇到一個問題' }, { n: 38, start: 78.5, end: 81, text: '但如果要用兩支以上的手機' }, { n: 40, start: 83.5, end: 86, text: '時間不同步' }];

test('分鏡對齊：parseBeatSheets／movesOf／refsOf 讀原型分鏡表的寫法', () => {
  const md = SHEET([
    ['0 換卡', '`#35`（72.17 s）「但我們…」', '主卡', '換卡不換景（新卡：擦開由下 0.8 s＋彈出）；＋0.35 逐字上浮（標題）；背景環境（自動）', '主卡標題', '`whoosh`'],
    ['1 骨架', '`#35`＋0.7（72.87 s）', '四站', '錯拍彈出（四站，間隔 0.12）；＋0.15 圖示描線（錯拍 0.12）', '均衡', '—'],
    ['3 準備', '`#38@兩支`−0.75，講 `#36`–`#37`', '', '彗星描線（−0.85）；到站：鏡頭跟焦點、聚焦（站 2）或漣漪', '', ''],
    ['6 站 3', '`#41@崩潰`', '', '同拍 5（連接線 2）', '', ''],
    ['（交棒）', '`#16@手機畫面`', '', '目前 build：整幕淡出 0.5 s', '', ''],
  ], ['拍', '講到（綁句）', '畫面上出現什麼', '動態（設計系統語彙）', '焦點（觀眾看哪）', '音效拍點']);
  const s = BT.parseBeatSheets(md);
  assert.deepEqual([...s.keys()], ['x05', 'x06']);
  assert.deepEqual([...BT.parseBeatSheets(md.replace('#### 動畫分鏡 x05', '#### 動畫分鏡 x05（r3 改：手機為主體）')).keys()], ['x05', 'x06'], '標題後面的括號備註不影響段 id');
  assert.equal(s.get('x06').header, null);
  const x = s.get('x05');
  assert.equal(x.line, 3);
  assert.deepEqual(x.rows.map((r) => r.refs), [[{ ref: '#35', off: 0 }], [{ ref: '#35', off: 0.7 }], [{ ref: '#38@兩支', off: -0.75 }], [{ ref: '#41@崩潰', off: 0 }], []]);
  assert.deepEqual(x.rows.map((r) => r.moves), [['換卡不換景', '逐字上浮', '背景環境'], ['錯拍彈出', '圖示描線'], ['彗星描線', '鏡頭跟焦點', '聚焦', '漣漪'], [], []]);
  assert.equal(x.rows[4].note, true);
  // 語彙：44 個（011 加游標移動、013 加蓋章、11-09 加換焦點；拿掉講者慢推、漂浮、虛線流動、背景環境），和給 AI 查的 shared/template/BEATS.md §2 逐列相同（名稱、「對應」欄第一個 P.*；沒寫 P.* 的是 build 內建）
  assert.equal(BT.VOCAB.length, 46);   // 025：加「貼上」「撕走」
  const beatsMd = fs.readFileSync(path.join(TEMPLATE, 'BEATS.md'), 'utf8').split(/^## 2\./m)[1].split(/^## 3\./m)[0];
  const table = [...beatsMd.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)].map((m) => [m[2].trim(), m[4].trim()]).filter(([n]) => n !== '名稱' && !/^-+$/.test(n));
  assert.deepEqual(table.map(([n, c]) => [n, (c.match(/P\.(\w+)/) || [])[1] || 'build']), BT.VOCAB.map((v) => [v.name, v.prim]));
  const spec = path.join(TEMPLATE, '..', '..', 'specs', '010-motion-v2', 'design-system.md');
  if (fs.existsSync(spec)) {
    const sec = fs.readFileSync(spec, 'utf8').split(/^### 14\.1/m)[1].split(/^### 14\.2/m)[0];
    // 講者慢推、漂浮：spec 之後拿掉（使用者 11-03：講者不要拉近拉遠；「出現的動畫窗都會輕微晃動」）；虛線流動、背景環境：使用者 11-06 拿掉微動；spec 是當時的設計紀錄、不改
    const names = [...sec.matchAll(/^\| ([^|]+) \| ([^|]+) \|/gm)].map((m) => m[2].trim()).filter((n) => n !== '名稱' && !/^-+$/.test(n) && !['講者慢推', '漂浮', '虛線流動', '背景環境'].includes(n));
    assert.deepEqual(names, BT.VOCAB.map((v) => v.name));
  }
  // 每個語彙對應的原語都在 kit 裡（build 內建的除外）
  const kit = fs.readFileSync(path.join(TEMPLATE, 'kit', 'scene-motion.js'), 'utf8');
  for (const v of BT.VOCAB) if (v.prim !== 'build') assert.match(kit, new RegExp(`\\b${v.prim}: function|\\bP\\.${v.prim} = function`), `${v.name} → P.${v.prim}`);
});

test('分鏡對齊：beatFindings ✖ 缺拍／多出來的 P.at／語彙不存在／表頭不對、⚠ 沒有分鏡與用了沒做的動作；同一個句號的幾拍算一組', () => {
  const sheet = (rows, head) => BT.parseBeatSheets(SHEET(rows, head)).get('x05');
  const run = (rows, marks, html = 'P.pop(); P.chars(); P.end();', head) => BT.beatFindings({ item: bItem, sheet: sheet(rows, head), marks, cuesOut: bCues, html, file: 'x-sync.html' });
  const ok = [['0', '`#35`', '主卡', '彈出（主卡）', '', ''], ['1', '`#35`＋0.7', '四站', '錯拍彈出（四站）', '', ''], ['2', '`#38@兩支`', '站 1', '逐字上浮', '', '']];
  const m35 = { ref: '#35', t: 0.17 }, m38 = { ref: '#38@兩支', t: 7.2 };   // #38@兩支 由 cuesOut 照字數比例算：79.542 → 段內 7.542；差 0.34 ≤ 0.5
  assert.deepEqual(run(ok, [m35, m38]), []);
  // 缺拍：#38 那一拍檔裡沒有 P.at
  const miss = run(ok, [m35]);
  assert.deepEqual(miss.map((f) => `${f.level}:${f.rule}`), ['error:beats-missing']);
  assert.equal(miss[0].msg, "分鏡第 2 拍 #38@兩支（1:19.54）在 x-sync.html 找不到對應的 P.at（最近的 P.at('#35') 差 7.37s，> 0.5s）");
  assert.equal(miss[0].fix, "在 script 開頭加 const T3 = P.at('#38@兩支')，照分鏡「動態」欄做這一拍；或把分鏡表這一列改成檔裡實際綁的句號");
  // 多出來的 P.at：#40 不在分鏡；#35 綁在 +3（離 #35 那組都 > 0.5）
  const extra = run(ok, [m35, m38, { ref: '#40', t: 11.5 }, { ref: '#35', t: 3.17 }]);
  assert.deepEqual(extra.map((f) => f.rule), ['beats-extra', 'beats-extra']);
  assert.equal(extra[0].msg, "x-sync.html 的 P.at('#40')（1:23.50）不在分鏡表");
  assert.match(extra[1].msg, /（分鏡表的 #35 在第 0、1 拍，差 > 0\.5s）$/);
  // 數字 ref 不比
  assert.deepEqual(run(ok, [m35, m38, { ref: 5, t: 5 }]), []);
  // 語彙不存在 → ✖，建議最接近的名稱
  const voc = run([['0', '`#35`', '', '彈跳出現；淡入', '', '']], [m35], 'P.in(); P.end();');
  assert.deepEqual(voc.map((f) => [f.rule, f.data.word]), [['beats-vocab', '彈跳出現']]);
  assert.match(voc[0].fix, /例如「彈出」/);
  // 026：內容設計動畫的動態欄一樣只能用語彙表的名稱（全片的動作語言靠它一致）
  assert.deepEqual(BT.beatFindings({ item: bItem, sheet: sheet([['0', '`#35`', '', '彈跳出現；淡入', '', '']]), marks: [m35], cuesOut: bCues, html: 'tl.from(); P.end();', file: 'compositions/x-design-x05.html' }).map((f) => f.rule), ['beats-vocab']);
  // 用了沒做的動作 → ⚠（每個原語一則；build 內建、背景環境有 P.end 不查）
  const prim = run([['0', '`#35`', '', '漣漪；聚焦；子母畫面飛入；背景環境', '', '']], [m35], 'P.spot(); P.end();');
  assert.deepEqual(prim.map((f) => `${f.level}:${f.rule}:${f.data.prim}`), ['warn:beats-prim:ripple']);
  // 表頭不對 → ✖ 一則，不再往下比；「焦點（觀眾看哪）」算對
  assert.deepEqual(run(ok, [], '', ['拍', '綁句', '畫面', '動態', '焦點', '音效']).map((f) => f.rule), ['beats-header']);
  assert.deepEqual(run(ok, [m35, m38], 'P.pop(); P.chars();', ['拍', '講到（綁句）', '畫面上出現什麼', '動態（設計系統語彙）', '焦點（觀眾看哪）', '音效拍點']), []);
  assert.deepEqual(BT.beatFindings({ item: bItem, sheet: BT.parseBeatSheets(SHEET([])).get('x06'), marks: [], cuesOut: bCues }).map((f) => f.rule), ['beats-header']);
  // 綁句算不出時間
  assert.deepEqual(run([['0', '`#99`', '', '', '', '']], []).map((f) => f.rule), ['beats-cue']);
  // 沒有分鏡
  const none = BT.noSheetFinding(bItem, 'x-sync.html');
  assert.deepEqual([none.level, none.rule, none.t], ['warn', 'beats-none', 72]);
  assert.equal(none.msg, '沒有動畫分鏡：work/storyboard.md 沒有「#### 動畫分鏡 x05」（x-sync.html）');
});

// ---------- 011 示意動畫（audit-illus.mjs、分鏡的段起點／八欄／插圖清單；cli-003 §2.3d 補充、§2.3e） ----------
const IL = await imp('lib/audit-illus.mjs');

test('011：ILLUS_BUILTIN＝kit/illus.js 的 22 個元件；illusOf 讀 data-illus／data-illus-src／ILLUS.register', () => {
  const js = fs.readFileSync(path.join(TEMPLATE, 'kit', 'illus.js'), 'utf8');
  const comp = js.match(/var COMP = \{([\s\S]*?)\};/)[1].match(/(\w+):/g).map((x) => x.slice(0, -1));
  assert.deepEqual(IL.ILLUS_BUILTIN, comp);
  const html = '<div data-illus="phone"></div><div data-illus="robot"></div><div data-illus-src="illus-local/router.svg"></div><script>ILLUS.register(\'robot\', function () {}); // ILLUS.register(\'ghost\'\n</script>';
  assert.deepEqual(IL.illusOf(html), { used: ['phone', 'robot'], src: ['illus-local/router.svg'], registered: ['robot'] });
  assert.equal(IL.localName('illus-local/sdCard.svg'), 'sdCard');
  assert.equal(IL.localName('router.svg'), null);
});

test('011：illusNameFindings ✖ 不認得的 data-illus、data-illus-src 檔不在 illus-local／路徑不對；scriptErrors 把 [ILLUS] 讀不到升成那一段的 ✖', () => {
  const it = { id: 'x07', label: 'custom x-net.html' };
  const html = '<div data-illus="laptop"></div><div data-illus="router"></div><div data-illus-src="illus-local/router.svg"></div><div data-illus-src="parts/sd.svg"></div>';
  const f = IL.illusNameFindings({ item: it, html, file: 'x-net.html', local: ['router'] });
  assert.deepEqual(f.map((x) => `${x.level}:${x.rule}:${x.data.name || x.data.src}`), ['error:illus-name:router', 'error:illus-src:parts/sd.svg']);
  assert.match(f[0].fix, /data-illus-src="illus-local\/router\.svg"/, 'illus-local 有檔時建議改用 data-illus-src');
  assert.deepEqual(IL.illusNameFindings({ item: it, html: '<div data-illus-src="illus-local/router.svg"></div>', local: [] }).map((x) => x.rule), ['illus-src']);
  assert.deepEqual(IL.illusNameFindings({ item: it, html: '<div data-illus="phone"></div>', local: [] }), []);
  const items = [{ id: 'x07', label: 'a', file: 'compositions/x-net.html', compId: 'x-net' }, { id: 'x08', label: 'b', file: 'compositions/x-b.html', compId: 'x-b' }];
  const htmlOf = (x) => (x.id === 'x07' ? '<div data-illus-src="illus-local/router.svg"></div>' : '');
  const r = A.scriptErrors([{ text: '[ILLUS] 讀不到 data-illus-src="illus-local/router.svg"：檔案要放在 work/hyperframes/illus-local/router.svg' }, { text: 'TypeError: x is null' }], items, htmlOf);
  assert.deepEqual(r.findings.map((x) => `${x.id}:${x.level}:${x.rule}`), ['x07:error:illus-src']);
  assert.equal(r.warnings.length, 1, '其他頁面錯誤照舊 ⚠');
});

test('011／012：judgeIllus ⚠ 標籤 > 10 字、完成態兩個手排元件中線差 4–16px（layout-row-align）、插圖太小；沒有 .il 元件、聚焦抬起中（非完成態）、漂浮中、段裡有 data-layout 時不量', () => {
  const svg = (id, rect, o = {}) => ({ ...el({ rect, media: true, desc: { id: '', near: id } }), tag: 'svg', il: true, ...o });
  const lbl = (text, chars) => ({ ...el({ rect: [0, 0, 400, 60], textRect: [0, 0, 400, 60], desc: { id: '', text } }), chars });
  const it = item({ id: 'x09' });
  const meas = (els) => ({ host: { start: 10 }, els, illus: 3 });
  const f = IL.judgeIllus(meas([svg('a', [100, 100, 300, 300]), svg('b', [400, 105, 600, 305]), svg('c', [700, 100, 900, 300]), lbl('一二三四五六七八九十十一', 11), lbl('符合需求', 4)]), { item: it, t: 17, kind: 'done' });
  assert.deepEqual(f.map((x) => `${x.rule}:${x.data.chars ?? x.data.dy}`), ['illus-label:11', 'layout-row-align:5', 'layout-row-align:5']);
  assert.deepEqual(IL.judgeIllus(meas([svg('a', [100, 100, 300, 300]), svg('b', [400, 108, 600, 308])]), { item: it, t: 14, kind: 'still' }), [], '拍中間聚焦會抬起 8px：只量完成態');
  assert.deepEqual(IL.judgeIllus(meas([svg('a', [100, 100, 300, 300]), svg('b', [400, 104, 600, 304], { micro: true })]), { item: it, t: 17, kind: 'done' }), []);
  assert.deepEqual(IL.judgeIllus(meas([svg('a', [100, 100, 300, 300]), svg('b', [400, 120, 600, 320]), svg('c', [700, 100, 900, 300])]), { item: it, t: 17, kind: 'done' }), [], '差 > 16px 是刻意錯開、≤ 4px 算對齊');
  assert.deepEqual(IL.judgeIllus(meas([svg('a', [100, 100, 300, 300]), svg('b', [400, 105, 600, 305])]), { item: it, t: 17, kind: 'done', hasLayout: true }), [], '段裡有 data-layout 容器：對齊交給 audit-layout.mjs（不重複報）');
  assert.deepEqual(IL.judgeIllus({ host: { start: 10 }, els: [lbl('一二三四五六七八九十十一', 11)], illus: 0 }, { item: it, t: 17, kind: 'done' }), [], '沒有 .il 元件的段不量');
  // ⚠ 插圖太小：元件聯集 < 卡片內部（扣標題列）面積 50%
  const card = { ...el({ rect: [120, 150, 1300, 858], desc: { id: 'xsc-card' } }), box: true };
  const ttl = { ...el({ rect: [176, 170, 600, 258], textRect: [176, 170, 600, 258], desc: { id: '', text: '標題' } }), title: true, chars: 2 };
  const small = IL.judgeIllus(meas([card, ttl, svg('a', [200, 400, 400, 600]), svg('b', [700, 420, 900, 620])]), { item: it, t: 17, kind: 'done' });
  assert.deepEqual(small.map((x) => x.rule), ['illus-small']);
  assert.match(small[0].fix, /shared\/style\.md/);
  assert.deepEqual(IL.judgeIllus(meas([card, ttl, svg('a', [150, 300, 700, 820]), svg('b', [760, 300, 1270, 820])]), { item: it, t: 17, kind: 'done' }).map((x) => x.rule), [], '佔 ≥ 50% 不報');
  // x-callout：主體插圖 #xcall-obj 只佔 10%，但四周的標籤（.xcall-tag）一起算就夠大，不報；沒有 #xcall-obj 時標籤不算
  const obj = { ...svg('', [620, 380, 812, 780]), desc: { id: 'xcall-obj', cls: 'il' } };
  const tag = (r, k, p = 'xcall') => ({ ...el({ rect: r, desc: { id: `${p}-t${k}`, cls: 'xcall-tag' } }), box: true });
  const tags = [tag([196, 330, 540, 442], 1), tag([892, 330, 1236, 442], 2), tag([196, 700, 540, 812], 3), tag([892, 700, 1236, 812], 4)];
  assert.deepEqual(IL.judgeIllus(meas([card, ttl, obj, ...tags]), { item: it, t: 17, kind: 'done' }).map((x) => x.rule), [], 'x-callout 主體＋標籤一起算');
  assert.deepEqual(IL.judgeIllus(meas([card, ttl, { ...obj, desc: { id: 'xsc-phone', cls: 'il' } }, ...tags]), { item: it, t: 17, kind: 'done' }).map((x) => x.rule), ['illus-small'], '不是 x-callout 的主體：標籤不算');
  const tagsB = [tag([196, 330, 540, 442], 1, 'xcsb'), tag([892, 330, 1236, 442], 2, 'xcsb'), tag([196, 700, 540, 812], 3, 'xcsb')];
  assert.deepEqual(IL.judgeIllus(meas([card, ttl, { ...obj, desc: { id: '', near: 'xcsb-obj', cls: '' } }, ...tagsB]), { item: it, t: 17, kind: 'done' }).map((x) => x.rule), [], '同一集第二支 x-callout 換了前綴（量到的是 .il 裡的 svg，near＝xcsb-obj）也一起算');
});

test('011：illusMotionFindings ⚠ 同一個元素亮滅兩次以上、連接線在元件進場中開始描；聚焦光不算閃爍', () => {
  const T = (start, end, kind, targets, role = 'enter') => ({ start, end, kind, role, targets });
  const node = { key: '0/1', desc: { id: 'xn-a' }, il: true }, scr = { key: '0/1/0/3', desc: { id: '', cls: 'il-rec' } }, line = { key: '0/0/0', desc: { id: 'xn-l1' }, line: true };
  const it = item({ id: 'x09', start: 10 });
  const mo = (tweens) => ({ D: 10, marks: [], tweens });
  const ok = mo([T(1, 1.55, 'enter', [node]), T(2.2, 2.7, 'draw', [line]), T(3, 3.5, 'enter', [scr]), T(5, 5.3, 'exit', [scr]), T(6, 6.5, 'enter', [scr])]);
  assert.deepEqual(IL.illusMotionFindings(ok, { item: it }), [], '狀態亮回一次可以；線在節點進場完之後');
  const bad = mo([T(1, 1.55, 'enter', [node]), T(1.3, 1.8, 'draw', [line]), T(3, 3.2, 'enter', [scr]), T(3.5, 3.7, 'exit', [scr]), T(4, 4.2, 'enter', [scr]), T(4.5, 4.7, 'exit', [scr]), T(5, 5.2, 'enter', [scr])]);
  const f = IL.illusMotionFindings(bad, { item: it });
  assert.deepEqual(f.map((x) => x.rule).sort(), ['illus-blink', 'illus-line-first']);
  assert.equal(f.find((x) => x.rule === 'illus-line-first').t, 11.3);
  const spot = mo([T(1, 1.55, 'enter', [node]), ...[3, 5, 7].flatMap((t) => [T(t, t + 0.4, 'enter', [scr], 'focus'), T(t + 1, t + 1.4, 'exit', [scr], 'focus')])]);
  assert.deepEqual(IL.illusMotionFindings(spot, { item: it }), [], '聚焦光（role focus）亮好幾次不算');
  assert.deepEqual(IL.illusMotionFindings(mo([T(1.3, 1.8, 'draw', [line])]), { item: it }), [], '沒有 .il 元件的段不量');
});

test('011：分鏡「段起點 #N」是隱含的一拍；八欄表頭；插圖元件白名單（— 不查）；游標移動；回均衡認 P.dim、退焦認 P.spot', () => {
  const H8 = [...BT.BEAT_HEADER, ...BT.BEAT_HEADER_ILLUS];
  const sheet8 = (rows) => BT.parseBeatSheets(`#### 動畫分鏡 x05\n\n| ${H8.join(' | ')} |\n|---|---|---|---|---|---|---|---|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n`).get('x05');
  const run = (rows, marks, html = 'P.pop(); P.chars(); P.spot(); P.morph(); P.end();', local = []) => BT.beatFindings({ item: bItem, sheet: sheet8(rows), marks, cuesOut: bCues, html, file: 'x-scene.html', local });
  const m38 = { ref: '#38@兩支', t: 7.2 };
  const rows = [['0', '段起點 `#35`', '主卡＋標題', '開場（依前段）；＋0.65 逐字上浮（標題）', '標題', '—', '—', 'panelTop'],
    ['1', '`#38@兩支`', '手機', '彈出（手機）；聚焦（手機）', '手機', 'tick', '`phoneTripod`（landscape, rec）、router', 'x 560–820'],
    ['2', '`#38@兩支`＋1.2', '人走過去', '游標移動（人）', '人', '—', '—（資料夾＋加號圖示）', '—'],
    ['收', '最後一拍＋2.0', '全部', '回均衡', '整體', '—', '—', '—']];
  assert.deepEqual(run(rows, [m38], undefined, ['router']), [], '段起點不用 P.at；router 在 illus-local；— 不查');
  assert.deepEqual(BT.parseBeatSheets(`#### 動畫分鏡 x05\n\n| ${H8.join(' | ')} |\n|---|---|---|---|---|---|---|---|\n| ${rows[1].join(' | ')} |\n`).get('x05').rows[0].illus, '`phoneTripod`（landscape, rec）、router');
  // 段起點的 #N 離段首 > 0.5 s 就照常要 P.at；沒寫「段起點」的 #35 也要
  assert.deepEqual(run([['0', '段起點 `#38`', '', '開場', '', '', '—', '']], [], 'P.pop(); P.end();').map((x) => x.rule), ['beats-missing']);
  assert.deepEqual(run([['0', '`#35`', '', '開場', '', '', '—', '']], [], 'P.pop(); P.end();').map((x) => x.rule), ['beats-missing']);
  // 白名單：畫廊沒有、沒 register、illus-local 沒有 → ✖；register 過的可以
  const bad = run([rows[1]], [m38]);
  assert.deepEqual(bad.map((x) => `${x.rule}:${x.data.name}`), ['beats-illus:router']);
  assert.match(bad[0].fix, /shared\/template\/kit\/illus-style\.md/);
  assert.deepEqual(run([rows[1]], [m38], "P.pop(); P.spot(); ILLUS.register('router', f);"), []);
  // 回均衡：沒有 P.spot、有 P.dim 也算做到
  assert.deepEqual(run([['收', '最後一拍＋2.0', '', '回均衡', '', '', '—', '']], [], 'P.dim(); P.end();'), []);
  assert.deepEqual(run([['收', '最後一拍＋2.0', '', '回均衡', '', '', '—', '']], [], 'P.end();').map((x) => `${x.rule}:${x.data.prim}`), ['beats-prim:spot']);
  // 退焦：聚焦組裡用 P.spot 的預覽態（dim 參數）也算做到
  assert.deepEqual(run([['收', '最後一拍＋2.0', '', '退焦（前一列 → 0.6）', '', '', '—', '']], [], 'P.spot(); P.end();'), []);
  assert.deepEqual(BT.illusNamesOf('`phoneTripod`（landscape, rec）、badge（check）；router／sdCard'), ['phoneTripod', 'badge', 'router', 'sdCard']);
});

test('分鏡沒寫的動作：檔裡有 P.spot／P.dim／P.idle／P.cam，分鏡一拍都沒寫 → ⚠ beats-unplanned（回均衡算 dim、退焦算 spot）', () => {
  const H8 = [...BT.BEAT_HEADER, ...BT.BEAT_HEADER_ILLUS];
  const sheet = (moves) => BT.parseBeatSheets(`#### 動畫分鏡 x05\n\n| ${H8.join(' | ')} |\n|---|---|---|---|---|---|---|---|\n| 1 | 段起點 \`#35\` | 主卡 | ${moves} | — | — | — | — |\n`).get('x05');
  const run = (moves, html) => BT.beatFindings({ item: bItem, sheet: sheet(moves), marks: [], cuesOut: bCues, html, file: 'x-callout.html' }).filter((f) => f.rule === 'beats-unplanned').map((f) => f.data.prim);
  // 分鏡寫退焦（範例原本是聚焦＋漂浮）：spot 由退焦涵蓋，漂浮沒寫 → 報 idle
  assert.deepEqual(run('彈出（主體）；退焦（其他標籤）', 'P.pop(); P.spot(); P.idle(); P.end();'), ['idle']);
  // 舊分鏡寫的漂浮（已拿掉的動作，VOCAB_RETIRED）：不報不在語彙表，也算寫了 P.idle
  assert.deepEqual(run('彈出（主體）；聚焦（主體）；漂浮（主體）', 'P.pop(); P.spot(); P.idle(); P.end();'), []);
  assert.deepEqual(run('彈出（主體）', '// P.cam(…) 註解不算\nP.pop(); P.cam(); P.end();'), ['cam']);
  assert.deepEqual(run('—', 'P.pop(); P.spot(); P.idle(); P.end();'), [], '動態欄整欄都是 — 不反向比');
  // 換焦點（P.rack）：分鏡寫了就不報；檔裡有、分鏡沒寫 → 報 rack；分鏡寫了、檔裡沒有 → ⚠ beats-prim
  assert.deepEqual(run('彈出（主體）；換焦點（主體）', 'P.pop(); P.rack(); P.end();'), []);
  assert.deepEqual(run('彈出（主體）', 'P.pop(); P.rack(); P.end();'), ['rack']);
  const prim = BT.beatFindings({ item: bItem, sheet: sheet('彈出（主體）；換焦點（主體）'), marks: [], cuesOut: bCues, html: 'P.pop(); P.end();', file: 'x-callout.html' }).filter((f) => f.rule === 'beats-prim');
  assert.deepEqual(prim.map((f) => `${f.data.word}:${f.data.prim}`), ['換焦點:rack']);
});

test('sheetPlanFindings（build --check）：拍序和講解相反；照範例【D 下限】第一拍、相鄰兩拍、最後一拍到段尾；差 ≤ 0.3s 不報', () => {
  const H = BT.BEAT_HEADER;
  const sheet = (rows) => BT.parseBeatSheets(`#### 動畫分鏡 x05\n\n| ${H.join(' | ')} |\n|---|---|---|---|---|---|\n${rows.map((r) => `| ${r} | — | 彈出 | — | — |`).join('\n')}\n`).get('x05');
  const it = { id: 'x05', where: '[x05 custom]', start: 70, end: 85, D: 15 };
  const tpl = R.floorRules('<!--\n  【D 下限】\n  T1 ≥ 2.0（主卡）\n  T2 ≥ T1 + 2.5；T3 ≥ T2 + 2.5\n  D ≥ T3 + 4.6\n  【版面】\n-->');
  // 拍序：#40 寫在 #38 前面
  const rev = BT.sheetPlanFindings({ item: it, sheet: sheet(['1 | `#35`', '2 | `#40`', '3 | `#38@兩支`']), cues: bCues });
  assert.deepEqual(rev.map((f) => f.msg.slice(0, 7)), ['拍序和講解相反']);
  assert.match(rev[0].msg, /第 3 拍 #38@兩支（1:19\.54）比上一拍第 2 拍 #40（1:23\.50）早講到/);
  // 照範例：第一拍 #35 在 2.17s ≥ 2.0；#35→#38 6.33s；#38 同句號的 ＋1.2 不算另一拍；#40 到段尾 15 − 13.5 = 1.5 < 3.9 → 報段尾
  const ok = BT.sheetPlanFindings({ item: it, sheet: sheet(['1 | `#35`', '2 | `#38`', '2b | `#38`＋1.2', '3 | `#40`']), cues: bCues, tplRules: tpl });
  assert.deepEqual(ok.map((f) => f.msg.slice(0, 4)), ['最後一拍']);
  assert.match(ok[0].msg, /到段尾只剩 1\.50s，範例檔頭【D 下限】要 ≥ 3\.9s/);
  // 第一拍太早、兩拍太近；段起點那一拍不算第一拍
  const it2 = { ...it, start: 71.5, D: 20 };
  const tight = BT.sheetPlanFindings({ item: it2, sheet: sheet(['0 | 段起點 `#35`', '1 | `#38`', '2 | `#40`']), cues: bCues, tplRules: tpl });
  assert.deepEqual(tight.map((f) => f.msg.slice(0, 3)), []);
  const close = BT.sheetPlanFindings({ item: { ...it, start: 77.5, D: 20 }, sheet: sheet(['1 | `#38`', '2 | `#38@兩支`', '3 | `#40`']), cues: bCues, tplRules: tpl });
  assert.deepEqual(close.map((f) => f.msg.slice(0, 3)), ['第一拍', '第 1'], '#38 → #38@兩支 是兩個綁句，只隔 1.04s');
  assert.match(close[0].msg, /第一拍 #38 在段內 1\.00s.*要 T1 ≥ 2/);
  assert.match(close[1].msg, /第 1 拍（1:18\.50）到第 2 拍（1:19\.54）只隔 1\.04s，範例檔頭【D 下限】相鄰兩拍至少 2\.5s/);
  // 「收」寫 ＋2.5 落在段尾淡出之後（段 70–85：#40 在 13.5s，＋2.5 → 16.0s > 14.5s）
  const late = BT.sheetPlanFindings({ item: it, sheet: sheet(['1 | `#35`', '2 | `#40`', '收 | `#40`＋2.5']), cues: bCues });
  assert.deepEqual(late.map((f) => f.msg), ['第 收 拍 #40＋2.5（1:26.00）在段尾淡出之後（這段到 1:25.00），看不到']);
});

test('011：插圖清單（舊名素材清單）✖ 來源不是三種、畫廊沒有、新建 SVG 還沒畫', () => {
  const md = '#### 插圖清單 x05\n\n| 元件 | 來源 | 怎麼來 |\n|---|---|---|\n| phoneTripod（landscape, rec） | 畫廊 | `data-illus="phoneTripod"` |\n| 資料夾＋加號 | 圖示組合 | folder＋plus |\n| router | 新建 SVG | 規格：router，建議尺寸 220×120，狀態 led／warn |\n| 路由器 | 新建SVG | 規格：`sdCard`，建議尺寸 120×80 |\n| robot | 畫廊 ✓ | data-illus="robot" |\n| 相片 | 生圖 | mmx |\n\n#### 素材清單 x06\n\n| 元件 | 來源 | 怎麼來 |\n|---|---|---|\n| cloud | 畫廊 | x |\n';
  const L = BT.parseIllusLists(md);
  assert.deepEqual([...L.keys()], ['x05', 'x06']);
  assert.deepEqual(L.get('x05').rows.map((r) => `${r.name}/${r.source}`), ['phoneTripod/畫廊', '資料夾/圖示組合', 'router/新建 SVG', 'sdCard/新建 SVG', 'robot/畫廊', '相片/生圖']);
  const f = BT.illusListFindings({ item: bItem, list: L.get('x05'), html: '', local: ['router'] });
  assert.deepEqual(f.map((x) => `${x.rule}:${x.data.name}`), ['illus-list:sdCard', 'illus-list:robot', 'illus-list:相片']);
  assert.deepEqual(BT.illusListFindings({ item: bItem, list: L.get('x06'), local: [] }), []);
});

// ---------- 012 版面（lib/audit-layout.mjs；cli-003 §2.3f）：用假的 SceneLayout.measure JSON，六條規則各一好一壞 ----------
const LA = await imp('lib/audit-layout.mjs');
test('012：judgeLayoutRules 六條各一好一壞（row-align／gap／center／pad／label／link）；free 照樣量；訊息只指 shared/style.md「版面」', () => {
  const it = item({ id: 'x10' });
  const slot = (id, box, o = {}) => ({ id, row: 1, side: false, box, anchor: box, label: null, nested: false, ...o });
  const cont = (slots, o = {}) => ({ id: 'stage', layout: 'row', align: 'center', nested: false, box: [0, 0, 1000, 500], slots, ...o });
  const three = (o = {}) => [slot('a', [100, 150, 300, 350]), slot('b', [400, 150, 600, 350], o.b || {}), slot('c', o.c || [700, 150, 900, 350])];
  const J = (containers, links = []) => LA.judgeLayoutRules({ containers, links }, { item: it, t: 9 });
  const R = (containers, links) => J(containers, links).map((f) => `${f.level}:${f.rule}`);
  assert.deepEqual(J([cont(three())]), [], '等距、同中線、置中、內距夠');
  // layout-row-align：> 4 ⚠、> 16 ✖；free 用重疊分群照樣量
  assert.deepEqual(R([cont(three({ b: { anchor: [400, 156, 600, 356] } }))]), ['warn:layout-row-align']);
  assert.deepEqual(R([cont(three({ b: { anchor: [400, 170, 600, 370] } }))]), ['error:layout-row-align']);
  assert.deepEqual(R([cont(three({ b: { anchor: [400, 156, 600, 356] } }), { layout: 'free' })]), ['warn:layout-row-align'], 'free 只代表 helper 不排');
  assert.deepEqual(R([cont(three({ b: { anchor: [400, 153, 600, 353] } }))]), [], '≤ 4px 算對齊');
  // layout-gap：同列（欄）相鄰間距最大差 > 8
  assert.deepEqual(R([cont(three({ c: [712, 150, 912, 350] }))]), ['warn:layout-gap'], '間距 100／112');
  assert.deepEqual(R([cont(three({ c: [706, 150, 906, 350] }))]), [], '間距 100／106：差 ≤ 8');
  const col = (g2) => cont([slot('p', [400, 60, 600, 160]), slot('q', [400, 184, 600, 284]), slot('r', [400, 284 + g2, 600, 384 + g2])], { layout: 'col', nested: true });
  assert.deepEqual(R([col(40)]), ['warn:layout-gap'], '欄：間距 24／40');
  assert.deepEqual(R([col(24)]), []);
  // layout-center：左右差 > 16；data-align=center 時上下差 > 24（top 不量上下）
  assert.deepEqual(R([cont(three().map((s) => ({ ...s, box: [s.box[0] + 40, s.box[1], s.box[2] + 40, s.box[3]], anchor: [s.box[0] + 40, s.box[1], s.box[2] + 40, s.box[3]] })))]), ['warn:layout-center'], '左 140／右 60');
  const up = three().map((s) => ({ ...s, box: [s.box[0], s.box[1] - 100, s.box[2], s.box[3] - 100], anchor: [s.box[0], s.box[1] - 100, s.box[2], s.box[3] - 100] }));
  assert.deepEqual(R([cont(up)]), ['warn:layout-center'], '上 50／下 250');
  assert.deepEqual(R([cont(up, { align: 'top' })]), [], 'data-align="top" 不量上下');
  const walked = three(); walked[2] = { ...walked[2], box: [424, 150, 624, 350], anchor: [424, 150, 624, 350], home: [700, 150, 900, 350] };
  assert.deepEqual(R([cont(walked)]), [], '走位（move）過的元件：置中量排版時的外框 home');
  assert.ok(R([cont(walked.map(({ home, ...x }) => x))]).includes('warn:layout-center'), '沒有 home＝手排的，照完成態量');
  // data-justify="start"／"end"（col 靠左、靠右）：左（右）留白要＝48±8，不比左右差
  const js = (x0, J) => cont([slot('a', [x0, 150, x0 + 200, 350]), slot('b', [x0, 374, x0 + 320, 474])], { layout: 'col', justify: J, box: [0, 0, 1000, 624] });
  assert.deepEqual(R([js(48, 'start')]), [], '靠左：左內距 48');
  assert.deepEqual(J([js(120, 'start')]).map((f) => `${f.rule}:${/沒靠左/.test(f.msg)}`), ['layout-center:true'], '靠左但左邊留白 120');
  assert.deepEqual(R([js(632, 'end')]), [], '靠右：右內距 48');
  // layout-pad：內容群到內容區邊 左右 < 40、上下 < 32
  assert.deepEqual(R([cont([slot('a', [20, 150, 220, 350]), slot('b', [320, 150, 520, 350]), slot('c', [620, 150, 820, 350])], { box: [0, 0, 840, 500] })]), ['warn:layout-pad'], '左右各 20');
  assert.deepEqual(R([cont([slot('a', [40, 150, 240, 350]), slot('b', [340, 150, 540, 350]), slot('c', [640, 150, 840, 350])], { box: [0, 0, 880, 500] })]), [], '左右各 40');
  // layout-label：標籤中心對插圖中心 > 4（橫排 side 量 y）
  const lab = (label, side = false) => cont([slot('a', [100, 150, 300, 350], { anchor: side ? [100, 218, 164, 282] : [100, 150, 300, 300], label, side })], { layout: 'free', box: [0, 0, 400, 500] });
  assert.deepEqual(R([lab([170, 316, 230, 350])]), []);
  assert.deepEqual(R([lab([180, 316, 240, 350])]), ['warn:layout-label'], '標籤中心 210、插圖中心 200');
  assert.deepEqual(R([lab([180, 230, 260, 270], true)]), []);
  assert.deepEqual(R([lab([180, 238, 260, 278], true)]), ['warn:layout-label'], '徽章＋字：上下差 8');
  // layout-label-row（第七條）：同一列有標籤的元件，標籤上緣差 > 4；有標籤的不比插圖中線；data-align="middle" 改比中線、不量標籤線
  const lr = (dy, o = {}) => cont([slot('a', [100, 150, 300, 390], { anchor: [100, 150, 300, 300], label: [170, 316, 230, 356] }), slot('b', [400, 210, 600, 390 + dy], { anchor: [400, 210, 600, 300 + dy], label: [470, 316 + dy, 530, 356 + dy] }), slot('c', [700, 150, 900, 390], { anchor: [700, 150, 900, 300], label: [770, 316, 830, 356] })], { box: [0, 0, 1000, 540], ...o });
  assert.deepEqual(R([lr(0)]), [], '底對齊：插圖高矮不同、標籤同一條線');
  assert.deepEqual(R([lr(3)]), [], '≤ 4px');
  const lrBad = J([lr(8)]);
  assert.deepEqual(lrBad.map((f) => `${f.level}:${f.rule}:${f.data.d}`), ['warn:layout-label-row:8']);
  assert.match(lrBad[0].fix, /^同一列的標籤要在同一條線：用 data-layout="row"（底對齊）（shared\/style\.md「版面」）$/);
  assert.deepEqual(R([lr(8, { align: 'middle' })]), ['error:layout-row-align'], 'middle＝手動選插圖中線：比中線、不比標籤線');
  const sd = (dy) => { const c = lr(0); c.slots[2] = slot('c', [700, 296 + dy, 900, 376 + dy], { side: true, anchor: [700, 296 + dy, 780, 376 + dy], label: [796, 316 + dy, 900, 356 + dy] }); return c; };
  assert.deepEqual(R([sd(12)]), [], '側排標籤中心差 12（≤ 16）');
  assert.deepEqual(J([sd(24)]).map((f) => `${f.rule}:${f.data.d}:${f.data.side}`), ['layout-label-row:24:true'], '側排標籤中心差 24');
  const grp = lr(8); grp.slots[1] = { ...grp.slots[1], nested: true };
  assert.deepEqual(R([grp]), ['warn:layout-label-row'], '巢狀群組（手機＋REC 膠囊）用裡面的標籤一起比');
  // layout-link：端點離外框 4–32、在邊中點 ±8（對插圖中線）、不穿過其他元件；手寫的線也量
  const A3 = three(), lk = (pts, o = {}) => ({ id: 'a-b', a: 'a', b: 'b', pts, boxA: A3[0].box, anchorA: A3[0].anchor, boxB: A3[1].box, anchorB: A3[1].anchor, ...o });
  assert.deepEqual(R([cont(A3)], [lk([[312, 250], [388, 250]])]), []);
  assert.deepEqual(R([cont(A3)], [lk([[340, 250], [388, 250]])]), ['warn:layout-link'], '端點離外框 40');
  assert.deepEqual(R([cont(A3)], [lk([[312, 270], [388, 270]])]), ['warn:layout-link'], '離邊中點 20');
  const through = J([cont(A3)], [lk([[312, 250], [688, 250]], { id: 'a-c', b: 'c', boxB: A3[2].box, anchorB: A3[2].anchor })]);
  assert.match(through[0].msg, /穿過 #b/);
  const hand = J([cont(A3)], [lk([[302, 250], [388, 250]], { id: 'line3', hand: true })]);
  assert.ok(hand.length === 1 && /（手寫）/.test(hand[0].msg) && /端點離外框 2px/.test(hand[0].msg), hand.map((f) => f.msg).join('\n'));
  // 031：沒有版面宣告的畫面（內容設計動畫，containers 是空的）也量手寫的連接線：設計師把座標寫死、線歪了要抓得到
  const free = J([], [lk([[300, 330], [400, 330]], { id: 'leadA', hand: true })]);
  assert.ok(free.length === 1 && /連接線 #leadA（手寫）/.test(free[0].msg) && /#a 端點離外框 0px/.test(free[0].msg) && /#b 端點離左右邊中點 80px/.test(free[0].msg), free.map((f) => f.msg).join('\n'));
  assert.deepEqual(J([], [lk([[312, 250], [388, 250]], { hand: true })]), [], '接在兩邊的邊中點、留了空隙：不提醒');
  assert.deepEqual(J([], []), []);
  // 訊息只指 shared/style.md「版面」
  const all = [...J([cont(three({ b: { anchor: [400, 170, 600, 370] }, c: [712, 150, 912, 350] }))]), ...through, ...hand, ...J([lab([180, 316, 240, 350])])];
  assert.deepEqual([...new Set(all.map((f) => f.rule))].sort(), ['layout-gap', 'layout-label', 'layout-link', 'layout-row-align']);
  for (const f of all) { assert.match(f.fix, /（shared\/style\.md「版面」）$/); assert.doesNotMatch(f.msg + f.fix, /specs\//); }
});

test('freshRefsScript：頁面設定 window.__cues 時，用 build --check 現算的 P.at 秒數蓋過上次 build 的（子代理新加的 #N@詞 不用等 build 就能量、能截圖）', async () => {
  const vm = await import('node:vm');
  const html = B.injectRuntime('<head></head>', B.freshRefsScript({ x01: { '#3@雲端': 5.2 } }));
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const win = {};
  vm.runInNewContext(js, { window: win, Object });
  win.__cues = { v: 1, cues: {}, segs: { x01: { start: 0, D: 9, refs: { '#2': 1 } }, x02: { refs: { '#9': 4 } } } };
  const plain = (o) => JSON.parse(JSON.stringify(o));   // vm 裡建的物件原型不同
  assert.deepEqual(plain(win.__cues.segs.x01.refs), { '#2': 1, '#3@雲端': 5.2 });
  assert.deepEqual(plain(win.__cues.segs.x02.refs), { '#9': 4 });
  assert.ok(!B.freshRefsScript({ x: { '#1@</script>': 1 } }).includes('@</script>'), '不能提早結束 script');
});

test('022 pickBeatSheet：storyboard 的表為準；內容設計動畫的 designs 比較新就用它（含插圖清單），訊息指到 designs 檔', () => {
  const head = '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |\n|---|---|---|---|---|---|';
  const sb = `### d1｜內容設計動畫\n\n#### 動畫分鏡 d1\n\n${head}\n| 1 | #1@舊 | 舊 | 彈出 | 均衡 | — |\n`;
  const dz = `概念：新\n\n#### 動畫分鏡 d1\n\n${head}\n| 1 | #1@新 | 新 | 彈出 | 均衡 | — |\n| 2 | #2@再 | 再 | 淡入 | 均衡 | — |\n\n#### 插圖清單 d1\n\n| 元件 | 來源 | 怎麼來 |\n|---|---|---|\n| router | 畫廊 | — |\n`;
  const sheets = BT.parseBeatSheets(sb);
  const old = BT.pickBeatSheet('d1', { sheets, design: { text: dz, newer: false } });
  assert.equal(old.sheet.rows[0].what, '舊');
  assert.equal(old.sheet.src, undefined);
  const neu = BT.pickBeatSheet('d1', { sheets, design: { text: dz, newer: true } });
  assert.deepEqual(neu.sheet.rows.map((r) => r.what), ['新', '再']);
  assert.equal(neu.sheet.src, 'work/designs/d1.md');
  assert.equal(neu.list.rows?.length ?? neu.list.length, 1);
  const only = BT.pickBeatSheet('d1', { sheets: new Map(), design: { text: dz, newer: false } });
  assert.equal(only.sheet.rows.length, 2, 'storyboard 沒有這張表就用 designs');
  assert.equal(BT.pickBeatSheet('d1', { sheets: new Map() }).sheet, null);
});

test('P.* 的選擇器從最外層 id 開始 ✖（完成影片裡最外層 id 被拿掉，root.querySelectorAll 找不到）；走 GSAP 的舊原語、註解、tl.to 不算；範例全部乾淨', () => {
  const item = { id: 'x01', label: 'x-rack' };
  const html = `<div id="x-rack" data-composition-id="x-rack"><div id="xr-1" class="card"></div></div><script>
    const ALL = '#x-rack .card';
    P.rack(ALL, '#xr-1', 1.5);                 // 透過常數
    P.pop('#xr-1, #x-rack > .b', 1);            // 選擇器清單的第二個
    P.dim('#x-rack .card', 2); P.dim('#x-rack .card', 3);   // 同一個寫法只報一次
    P.in('#x-rack .card', 1);                   // 走 GSAP，找得到（留著最外層 id 才不會選到別段）
    tl.to('#x-rack .card', { opacity: 0 }, 1);  // GSAP 字串，找得到
    // P.spot('#x-rack .card', 1);
    P.pop('#x-racks .z', 1);                    // 不是最外層 id
  </script>`;
  const f = R.rootSelectorFindings({ item, html, file: 'x-rack.html' });
  assert.deepEqual(f.map((x) => [x.level, x.rule, x.data.method, x.data.selector]), [
    ['error', 'root-selector', 'rack', '#x-rack .card'], ['error', 'root-selector', 'pop', '#xr-1, #x-rack > .b'], ['error', 'root-selector', 'dim', '#x-rack .card']]);
  assert.match(f[1].fix, /拿掉開頭的 #x-rack，寫 '#xr-1, \.b'/);
  // KIT_ROOT_QUERY 要和 kit 一致：用 q()（root.querySelectorAll）查的 P.* 方法
  const kit = fs.readFileSync(path.join(TEMPLATE, 'kit', 'scene-motion.js'), 'utf8');
  const defs = [...kit.matchAll(/\bP\.([a-zA-Z]+)\s*=\s*function\s*\([^)]*\)\s*\{/g)].map((m) => ({ name: m[1], at: m.index }));
  const usesQ = defs.filter((d, i) => /\bq\(/.test(kit.slice(d.at, i + 1 < defs.length ? defs[i + 1].at : kit.length))).map((d) => d.name).sort();
  assert.deepEqual([...R.KIT_ROOT_QUERY].sort(), usesQ);
  // 範例（複製到專案的起點）不能有這種寫法
  const dir = path.join(TEMPLATE, 'custom');
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    assert.deepEqual(R.rootSelectorFindings({ item: { id: n, label: n }, html: fs.readFileSync(path.join(dir, n), 'utf8'), file: n }).map((x) => x.msg), [], n);
  }
});

test('026 內容設計動畫：顏色寫死 ⚠（style、屬性、svg、GSAP 的顏色）；選擇器、P.at 的 #N 不算；模板檔不查', async () => {
  const A = await imp('lib/audit-illus.mjs');
  const html = `<template><!-- #abc 註解不算 --><style>#x-design-s1 #xds1-a { color: #fff; background: var(--brand); box-shadow: 0 2px 8px rgba(0,0,0,.2); } #x-design-s1 #face { fill: none; }</style>
<div id="xds1-a" style="border-color: #F6630F"></div><svg><path stroke="#111" fill="none"/></svg>
<script>const T1 = P.at('#131@詞'); tl.to('#xds1-a', { backgroundColor: '#00ff00' }, T1); P.sfx('ding', '#131@詞');</script></template>`;
  assert.deepEqual(A.colorLiterals(html), ['#fff', 'rgba(0,0,0,.2)', '#F6630F', '#111', '#00ff00']);
  const f = A.designColorFindings({ item: { id: 's1', label: 'x' }, html, file: 'compositions/x-design-s1.html' });
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'warn');
  assert.match(f[0].msg, /^顏色寫死：.*#fff、rgba\(0,0,0,\.2\)/);
  assert.match(f[0].fix, /var\(--brand-ink\)/);
  assert.deepEqual(A.designColorFindings({ item: { id: 's1', label: 'x' }, html, file: 'compositions/x-scene-s1.html' }), [], '模板檔不查（模板自己的檔由 dev 的檢查管）');
  assert.deepEqual(A.designColorFindings({ item: { id: 's1', label: 'x' }, html: '<style>#x-design-s1 .a { color: var(--sc-fs-ink); background: transparent; }</style>', file: 'x-design-s1.html' }), []);
});

test('026 內容設計動畫：旋轉了非 90 度 ⚠（CSS rotate、GSAP rotation）；90 的倍數、模板檔不算', async () => {
  const A = await imp('lib/audit-illus.mjs');
  const html = `<style>#x-design-s1 .a { transform: rotate(-4deg); } #x-design-s1 .b { transform: rotate(90deg); }</style><script>tl.to('.a', { rotation: 12, duration: 0.3 }, 1); tl.to('.b', { rotation: 180 }, 2);</script>`;
  assert.deepEqual(A.rotationLiterals(html), ['rotate(-4deg)', 'rotation: 12']);
  const f = A.designRotateFindings({ item: { id: 's1', label: 'x' }, html, file: 'compositions/x-design-s1.html' });
  assert.equal(f[0].rule, 'design-rotate');
  assert.equal(f[0].level, 'warn');
  assert.deepEqual(A.designRotateFindings({ item: { id: 's1', label: 'x' }, html, file: 'compositions/x-stamp-s1.html' }), []);
  assert.deepEqual(A.designRotateFindings({ item: { id: 's1', label: 'x' }, html: '<style>.b { transform: rotate(180deg); }</style>', file: 'x-design-s1.html' }), []);
});

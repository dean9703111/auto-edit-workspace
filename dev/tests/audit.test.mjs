// audit.mjs：挑段、取樣時間、矩形換算、判定規則（用假的量測資料）、找 Chrome／runtime、注入 runtime 的 server；
// 最後一個測試真的開 HyperFrames 的 Chrome 量一支小合成（找不到 Chrome 或 runtime 時略過）
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { imp, TEMPLATE } from './helpers.mjs';

const R = await imp('lib/audit-rules.mjs');
const B = await imp('lib/audit-browser.mjs');
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
  assert.match(p.msg, /壓到子母畫面：#xwide-card x 120–1680、y 150–850，進到禁入區 x 1344–1888、y 617–951/);
  assert.match(p.fix, /右緣 ≤ 1300.*左移 ≥ 380px.*"pip": false/);
  assert.deepEqual(judge([card], { layout: 'fullscreen', pipOn: false }).filter((x) => x.rule === 'pip'), []);
  assert.deepEqual(judge([card], { layout: 'overlay', pipOn: true }).filter((x) => x.rule === 'pip'), []);
  // 在禁入區上方（y < 617）不算
  assert.deepEqual(judge([el({ rect: [1296, 410, 1616, 610], painted: true })], { layout: 'fullscreen', pipOn: true }).filter((x) => x.rule === 'pip'), []);
  assert.deepEqual(R.PIP_ZONE, [1344, 617, 1888, 951]);
});

test('⚠ 壓到講者：面積比例、依門檻；側邊欄加 sideShift；全畫面不判', () => {
  const sb = [750, 236, 1260, 880];
  const list = el({ i: 0, rect: [820, 300, 1340, 600], painted: true, desc: { id: 'xbad-list' } });
  const f = judge([list], { speakerBox: sb, speakerWarn: 0.02 });
  const s = f.find((x) => x.rule === 'speaker');
  assert.equal(s.level, 'warn');
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

test('customDuration／durationWarnings：data-duration 與 const D 要等於段長', () => {
  const html = '<template id="x-a-template"><div id="x-a" data-composition-id="x-a" data-width="1920" data-height="1080" data-duration="8"></div><script>const D = 8.6;</script></template>';
  assert.deepEqual(R.customDuration(html), { duration: 8, constD: 8.6 });
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'compositions'));
  fs.writeFileSync(path.join(dir, 'compositions', 'x-a.html'), html);
  const w = A.durationWarnings([{ id: 'x01', type: 'custom', label: 'custom x-a.html', file: 'compositions/x-a.html', D: 8.6 }], dir);
  assert.equal(w.length, 1);
  assert.match(w[0].msg, /寫 data-duration 8，--check 報告的段長是 8\.6s/);
  assert.deepEqual(A.durationWarnings([{ id: 'x01', type: 'custom', file: 'compositions/x-a.html', D: 8 }], dir).length, 1);   // const D 8.6 ≠ 8
});

test('scriptErrors：子合成出錯對到那一段（✖），其他錯誤是 ⚠', () => {
  const items = [{ id: 'x03', compId: 'x-wide', file: 'compositions/x-wide.html', label: 'custom x-wide.html' }];
  const r = A.scriptErrors([{ text: '[HyperFrames] composition script error: x-wide ReferenceError: nope is not defined' }, { text: 'Uncaught TypeError: boom', url: 'http://127.0.0.1:1/kit/a.js', line: 3 }], items);
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].msg, /compositions\/x-wide\.html 的 script 出錯：ReferenceError: nope is not defined/);
  assert.match(r.warnings[0], /頁面 JS 錯誤：Uncaught TypeError: boom（kit\/a\.js:4）/);
});

test('parseArgs', () => {
  assert.deepEqual(A.parseArgs(['--project', 'projects/範例', '--only=x01,s03', '--all', '--json']), { project: 'projects/範例', only: 'x01,s03', all: true, json: true });
  assert.throws(() => A.parseArgs(['--bogus']), /沒有 --bogus/);
  assert.throws(() => A.parseArgs(['--only']), /--only 後面要接值/);
});

// ---------- 找 Chrome／runtime、server ----------

test('cmpVer／pickRuntime：挑最新版', () => {
  assert.ok(B.cmpVer('0.8.220', '0.8.99') > 0);
  assert.ok(B.cmpVer('mac_arm-152.0.7977.30', 'mac_arm-150.0.1.2') > 0);
  assert.equal(B.pickRuntime([{ version: '0.8.145', mtime: 9 }, { version: '0.8.220', mtime: 1 }, { version: '0.7.107', mtime: 5 }]).version, '0.8.220');
  assert.equal(B.pickRuntime([]), null);
});

test('runtimeCandidates／chromeCandidates：照 npx 快取與 ~/.cache/hyperframes 的結構找', () => {
  const home = tmp();
  for (const [h, v] of [['aaa', '0.8.145'], ['bbb', '0.8.220']]) {
    const pkg = path.join(home, '.npm', '_npx', h, 'node_modules', 'hyperframes');
    fs.mkdirSync(path.join(pkg, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ version: v }));
    fs.writeFileSync(path.join(pkg, 'dist', 'hyperframe.runtime.iife.js'), '//');
  }
  fs.mkdirSync(path.join(home, '.npm', '_npx', 'ccc', 'node_modules', 'other'), { recursive: true });
  const rt = B.runtimeCandidates(home, {});
  assert.deepEqual(rt.map((x) => x.version).sort(), ['0.8.145', '0.8.220']);
  assert.equal(B.pickRuntime(rt).version, '0.8.220');
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
try { chrome = B.chromeCandidates()[0] || null; runtime = B.pickRuntime(B.runtimeCandidates())?.file || null; } catch { /* 沒裝 */ }

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
  </div>
  <script>(function () { const tl = gsap.timeline({ paused: true }); tl.fromTo('#xt-card', { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0); tl.set({}, {}, 3); window.__timelines['x-t'] = tl; })();</script>
</template></body></html>`);
  const S = await B.openSession({ dir, chrome, runtime });
  try {
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
    assert.equal((await S.measure({ hostId: 'el-nope', W: 1920, H: 1080 })).missingHost, true);
  } finally { await S.close(); }
});

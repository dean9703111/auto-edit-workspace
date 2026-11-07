// lib/incremental.mjs：改一段不用整支重 render。什麼算局部、什麼一定整支；時間窗、精簡 index.html、只有聲音的合成；接回去（真的 ffmpeg）；--review 每段的雜湊；底片 stream copy 的判準；seek 查詢快取。
// 走 deliver.mjs 的實跑在最後一組（真的 render、對整支比逐格）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, TOOLS, imp, hasChrome } from './helpers.mjs';

const I = await imp('lib/incremental.mjs');
const FF = await imp('lib/ff.mjs');

const ffmpegOk = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const ffSkip = ffmpegOk ? false : '要 ffmpeg';

// build 產生的主合成長這樣（只留判定會看的部分）
function indexHtml({ film = 100, head = '', canvas = [1920, 1080], s1 = 10, s1Comp = 'compositions/s1.html', s2 = 50, tracks = 0, sfx = [['a', 10]], extra = '', tween = '', cues = { segs: { s1: { start: 10, D: 5 }, s2: { start: 50, D: 5 } }, cues: { 1: [10, 12], 2: [50, 52] } }, foot = `<video id="v0" src="assets/rough.mp4" data-start="0" data-duration="${film}" data-track-index="0" muted playsinline></video>`, chb = '第一章', bands = [] } = {}) {
  const audio = sfx.map(([n, at], i) => `<audio id="sfx${i}" src="assets/sfx/${n}.wav" data-start="${at}" data-track-index="${20 + i + tracks}" data-volume="0.5"></audio>`).join('\n');
  const bandEls = bands.map((_, i) => `<i id="tx${i}a"></i><i id="tx${i}b"></i>`).join('');
  const bandTl = bands.map((at, i) => `tl.fromTo('#tx${i}a', {x:0}, {x:100, duration:0.4}, ${at});`).join('\n');
  return `<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="kit/brand.css">${head}<script>window.__cues = ${JSON.stringify(cues)};</script></head>
<body>
<div id="main" data-composition-id="main" data-start="0" data-duration="${film}" data-width="${canvas[0]}" data-height="${canvas[1]}">
<div id="footage">${foot}</div>
<div id="chb">${chb}</div>
${bandEls}
<div id="el-s1" data-composition-id="s1" data-composition-src="${s1Comp}" data-start="${s1}" data-duration="5" data-track-index="${3 + tracks}"></div>
${extra}
<div id="el-s2" data-composition-id="s2" data-composition-src="compositions/s2.html" data-start="${s2}" data-duration="5" data-track-index="${4 + tracks}"></div>
<div id="el-captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${film}" data-track-index="9"></div>
${audio}
</div>
<script>
(function(){
const tl = gsap.timeline({ paused: true });
tl.fromTo('#el-s1', { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${s1});
tl.fromTo('#el-s2', { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${s2});
${bandTl}
${tween}
tl.set({}, {}, ${film});
window.__timelines['main'] = tl;
})();
</script>
</body></html>`;
}
const CAPTIONS = (list = [['第一句', 10, 12], ['第二句', 50, 52]], style = '.cg{color:#fff}') => `<template id="captions-template"><div data-composition-id="captions"><style>${style}</style>
${list.map(([t], i) => `<div class="cg" id="cg-${i}" style="opacity:0">${t}</div>`).join('\n')}
<script>
const tl = gsap.timeline({ paused: true });
${list.map(([, a, b], i) => `  tl.set('#cg-${i}', { opacity: 1 }, ${a});\n  tl.set('#cg-${i}', { opacity: 0 }, ${b});`).join('\n')}
</script></div></template>`;
const SIGS = { 'hyperframes.json': 'h', 'kit/brand.css': 'k', 'assets/rough.mp4': 'r', 'assets/sfx/a.wav': 'sa', 'assets/sfx/b.wav': 'sb', 'compositions/s1.html': 'c1', 'compositions/s2.html': 'c2', 'compositions/captions.html': 'cc' };
const state = (o = {}) => { const { sigs = {}, captions = CAPTIONS(), quality = 'looks', fps = 30, hf = '0.9.3', ...idx } = o; return { v: 1, quality, fps, hf, index: indexHtml(idx), captions, sigs: { ...SIGS, ...sigs } }; };

test('diffStates：內容一樣 → 沒有要重畫的', () => {
  const d = I.diffStates(state(), state());
  assert.equal(d.full, null);
  assert.deepEqual(d.ranges, []);
  assert.equal(d.audio, false);
});

test('diffStates：局部改動只重畫那段的時間', () => {
  // 改一段的合成檔
  let d = I.diffStates(state(), state({ sigs: { 'compositions/s1.html': 'c1x' } }));
  assert.equal(d.full, null);
  assert.deepEqual(d.ranges, [[10, 15]]);
  assert.equal(d.audio, false);
  assert.match(d.why.join('、'), /s1 改了/);
  // 只改一則字幕：那一則的時間
  d = I.diffStates(state(), state({ captions: CAPTIONS([['第一句改', 10, 12], ['第二句', 50, 52]]) }));
  assert.equal(d.full, null);
  assert.deepEqual(d.ranges, [[10, 12]]);
  // 只改音效：不重畫，只重混聲音
  d = I.diffStates(state(), state({ sfx: [['b', 10]] }));
  assert.equal(d.full, null);
  assert.deepEqual(d.ranges, []);
  assert.equal(d.audio, true);
  // 改時間：舊時段和新時段都要重畫
  d = I.diffStates(state(), state({ s1: 20, cues: { segs: { s1: { start: 20, D: 5 }, s2: { start: 50, D: 5 } }, cues: { 1: [10, 12], 2: [50, 52] } } }));
  assert.equal(d.full, null);
  assert.deepEqual(d.ranges, [[10, 15], [20, 25]]);
  // 新增一段：只有新段；後面的段 data-track-index 變號不算改動
  const add = `<div id="el-s9" data-composition-id="s9" data-composition-src="compositions/s9.html" data-start="30" data-duration="4" data-track-index="4"></div>`;
  d = I.diffStates(state(), state({ extra: add, tracks: 1, sigs: { 'compositions/s9.html': 'c9' } }));
  assert.equal(d.full, null);
  assert.deepEqual(d.ranges, [[30, 34]]);
  assert.match(d.why.join('、'), /s9 新增/);
  // 色帶編號隨前面的段變，不算改動；時間變才算
  d = I.diffStates(state({ bands: [40] }), state({ bands: [40] }));
  assert.deepEqual(d.ranges, []);
  d = I.diffStates(state({ bands: [40] }), state({ bands: [45] }));
  assert.equal(d.full, null);
  assert.deepEqual(d.ranges, [[40, 40.4], [45, 45.4]]);
});

test('diffStates：非局部改動一律整支，並給一行原因', () => {
  const cases = [
    ['kit', state({ sigs: { 'kit/brand.css': 'k2' } }), /kit\/brand\.css 變了/],
    ['主題／版式（head）', state({ head: '<link rel="stylesheet" href="kit/dark.css">' }), /版式、主題/],
    ['版式（畫布）', state({ canvas: [1080, 1920] }), /畫布/],
    ['片長', state({ film: 101 }), /片長變了/],
    ['畫質', state({ quality: 'high' }), /畫質/],
    ['fps', state({ fps: 60 }), /fps/],
    ['HyperFrames 版本', state({ hf: '0.9.4' }), /HyperFrames/],
    ['底片檔', state({ sigs: { 'assets/rough.mp4': 'r2' } }), /assets\/rough\.mp4 變了/],
    ['底片切段', state({ foot: '<video id="v0" src="assets/rough.mp4" data-start="0" data-duration="50" muted></video><video id="v1" src="assets/rough.mp4" data-start="50" data-duration="50" data-media-start="60" muted></video>' }), /底片的時間/],
    ['章節角標', state({ chb: '第二章' }), /章節角標/],
    ['字幕樣式', state({ captions: CAPTIONS(undefined, '.cg{color:#ff0}') }), /字幕的樣式/],
    ['底片運鏡', state({ tween: "tl.to('#footage', { scale: 1.2, duration: 1 }, 30);" }), /底片運鏡/],
    ['對不到段落的合成檔', state({ sigs: { 'compositions/nested.html': 'n' } }), /沒有對應的段落/],
    ['動畫改到不認得的元素', state({ tween: "tl.to('#ghost', { x: 1, duration: 1 }, 30);" }), /不認得/],
    ['背景圖', state({ sigs: { 'assets/bg.jpg': 'bg' } }), /assets\/bg\.jpg 變了/],
  ];
  for (const [name, b, re] of cases) {
    const d = I.diffStates(state(), b);
    assert.ok(d.full, `${name} 要整支`);
    assert.match(d.full, re, name);
  }
  assert.match(I.diffStates(null, state()).full, /沒有上次/);
  assert.match(I.diffStates({ ...state(), index: '<html>亂寫</html>' }, state()).full, /看不懂/);
});

test('diffStates：素材換內容——index 直接用的算那段；只有合成檔裡用的不知道影響到哪，整支；新增的檔不算', () => {
  const media = '<div id="el-m1" class="mlayer" data-start="30" data-duration="4"><video src="assets/media/a.mp4" data-start="30" data-duration="4" muted></video></div>';
  let d = I.diffStates(state({ extra: media, sigs: { 'assets/media/a.mp4': '1' } }), state({ extra: media, sigs: { 'assets/media/a.mp4': '2' } }));
  assert.equal(d.full, null);
  assert.deepEqual(d.ranges, [[30, 34]]);
  d = I.diffStates(state({ sigs: { 'assets/media/pic.jpg': '1' } }), state({ sigs: { 'assets/media/pic.jpg': '2' } }));
  assert.match(d.full, /pic\.jpg 換了內容/);
  d = I.diffStates(state(), state({ sigs: { 'assets/media/new.jpg': '1' } }));
  assert.equal(d.full, null);
  assert.deepEqual(d.ranges, []);
  // 線稿：新畫的沒有舊內容用到；重畫的不知道哪段用到
  d = I.diffStates(state(), state({ sigs: { 'illus-local/cat.svg': '1' } }));
  assert.equal(d.full, null);
  d = I.diffStates(state({ sigs: { 'illus-local/cat.svg': '1' } }), state({ sigs: { 'illus-local/cat.svg': '2' } }));
  assert.match(d.full, /cat\.svg/);
});

test('planWindows：擴到關鍵影格、重疊的併起來、太長的切開、不超出片尾', () => {
  const keys = Array.from({ length: 13 }, (_, i) => i * 10);   // 0, 10 … 120
  assert.deepEqual(I.planWindows([[12, 15]], keys, 125), [[10, 20]]);
  assert.deepEqual(I.planWindows([[12, 15], [18, 22]], keys, 125), [[10, 30]]);
  assert.deepEqual(I.planWindows([[12, 15], [45, 47]], keys, 125), [[10, 20], [40, 50]]);
  assert.deepEqual(I.planWindows([[121, 124]], keys, 125), [[120, 125]]);
  assert.deepEqual(I.planWindows([[0, 125]], keys, 125, { maxWindow: 50 }), [[0, 50], [50, 100], [100, 125]]);
  assert.deepEqual(I.planWindows([[10, 20]], keys, 125), [[10, 20]], '剛好在關鍵影格上不多擴');
  assert.deepEqual(I.planWindows([], keys, 125), []);
});

test('pruneIndex：窗外的段、音效拿掉；常駐的留著；root 拉長；底片節錄後媒體時間扣掉起點', () => {
  const html = indexHtml({ bands: [12, 80] });
  const r = I.pruneIndex(html, 8, 16);
  assert.match(r.html, /id="el-s1"/);
  assert.doesNotMatch(r.html, /id="el-s2"/);
  assert.doesNotMatch(r.html, /#el-s2/, '窗外段的動畫也拿掉');
  assert.match(r.html, /#el-s1/);
  assert.match(r.html, /id="chb"/);
  assert.match(r.html, /id="el-captions"/);
  assert.doesNotMatch(r.html, /<audio/);
  assert.match(r.html, new RegExp(`id="main"[^>]*data-duration="${I.MIN_ROOT_SEC}"`));
  assert.match(r.html, new RegExp(`tl\\.set\\(\\{\\}, \\{\\}, ${I.MIN_ROOT_SEC}\\)`));
  assert.match(r.html, /#tx0a/, '窗內的色帶留著');
  assert.doesNotMatch(r.html, /#tx1a/, '窗外的色帶拿掉');
  // 底片只留時間窗前後一點，時間基準不變
  const foot = /<video id="v0"[^>]*>/.exec(r.html)[0];
  assert.match(foot, /data-start="7"/);
  assert.match(foot, /data-duration="10"/);
  assert.match(foot, /data-media-start="7"/);
  assert.deepEqual(I.roughSpan(r.html), [7, 17]);
  const shifted = I.pruneIndex(html, 8, 16, { offset: 6.5 }).html;
  assert.match(/<video id="v0"[^>]*>/.exec(shifted)[0], /data-media-start="0\.5"/);
});

test('audioOnlyHtml：一支底片＋音效才做；片長一定整除；底片有切段、錄影帶聲音 → 交給整支', () => {
  const foot = '<video id="v0" src="assets/rough.mp4" data-start="0" data-duration="100" data-has-audio="true"></video>';
  const r = I.audioOnlyHtml(indexHtml({ foot }));
  assert.equal(r.fps, 30 / 30);
  assert.equal(r.frames, 100);
  assert.match(r.html, /<audio id="v0" src="\.\.\/assets\/rough\.mp4"/);
  assert.match(r.html, /<audio id="sfx0" src="\.\.\/assets\/sfx\/a\.wav"/);
  assert.match(r.html, /data-width="16"/);
  // 片長不是整數秒
  const odd = I.audioOnlyHtml(indexHtml({ foot: foot.replace('data-duration="100"', 'data-duration="100.5"'), film: 100.5 }));
  assert.equal(odd.fps, 2);
  assert.equal(odd.frames, 201);
  assert.equal(I.audioOnlyHtml(indexHtml({ foot: `${foot}<video src="assets/rough.mp4" data-start="50" data-duration="1" data-media-start="4" data-has-audio="true"></video>` })), null);
  assert.equal(I.audioOnlyHtml(indexHtml({ foot: foot.replace('<video ', '<video data-media-start="3" ') })), null);
});

// ---------- 接回去：真的 ffmpeg ----------

function encode(dst, seconds, seed, extra = []) {
  // 和 HyperFrames 的設定一樣：沒有 B 格、closed GOP、固定關鍵影格；seed 不同畫面不同
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=30,hue=h=${seed}`, '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', String(seconds), '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-bf', '0', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', ...extra, dst], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}
const runner = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 }); return Promise.resolve({ code: r.status, stdout: r.stdout, stderr: r.stderr }); };
const frameMd5 = (f, map = '0:v:0') => spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-map', map, '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').pop().trim());
const audioMd5 = (f) => spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:a:0', '-c', 'copy', '-f', 'md5', '-'], { encoding: 'utf8' }).stdout.trim();

test('spliceFinal：只有時間窗的畫面換掉，其他逐格相同；總格數、音軌不變；片段設定不同就不接', { skip: ffSkip }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-inc-splice-'));
  try {
    const base = path.join(root, 'base.mp4'), part = path.join(root, 'part.mp4'), dest = path.join(root, 'dest.mp4');
    encode(base, 10, 0);
    encode(part, 2, 90);
    const kf = await I.keyframesOf(runner, base);
    assert.deepEqual(kf.keys.map((k) => Math.round(k)), [0, 2, 4, 6, 8]);
    await I.spliceFinal({ base, dest, parts: [{ file: part, start: 4, end: 6 }], run: runner, fps: 30, tmp: root });
    const a = frameMd5(base), b = frameMd5(dest), p = frameMd5(part);
    assert.equal(b.length, a.length);
    assert.deepEqual(b.slice(0, 120), a.slice(0, 120));
    assert.deepEqual(b.slice(120, 180), p);
    assert.deepEqual(b.slice(180), a.slice(180));
    assert.equal(audioMd5(dest), audioMd5(base));
    // 片尾那段、換聲音
    const tail = path.join(root, 'tail.mp4'), dest2 = path.join(root, 'dest2.mp4'), other = path.join(root, 'other.mp4');
    encode(tail, 2, 180);
    encode(other, 10, 0, ['-af', 'volume=0.5']);
    await I.spliceFinal({ base, dest: dest2, parts: [{ file: tail, start: 8, end: 10 }], audio: other, run: runner, fps: 30, tmp: root });
    assert.deepEqual(frameMd5(dest2).slice(0, 240), a.slice(0, 240));
    assert.equal(audioMd5(dest2), audioMd5(other));
    // 編碼設定不同：SPS 對不上，丟例外（呼叫端退回整支）
    const bad = path.join(root, 'bad.mp4');
    encode(bad, 2, 0, ['-s', '160x90']);
    await assert.rejects(I.spliceFinal({ base, dest: path.join(root, 'dest3.mp4'), parts: [{ file: bad, start: 4, end: 6 }], run: runner, fps: 30, tmp: root }), /SPS/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('renderIncremental：舊檔和片長對不上、改太多 → 退回整支，不 render；render 失敗也退回整支', { skip: ffSkip }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-inc-render-'));
  try {
    const hfDir = path.join(root, 'hf'), base = path.join(root, 'base.mp4'), dest = path.join(root, 'dest.mp4');
    for (const d of ['compositions', 'kit', 'assets']) fs.mkdirSync(path.join(hfDir, d), { recursive: true });
    encode(base, 10, 0);
    fs.copyFileSync(base, path.join(hfDir, 'assets', 'rough.mp4'));
    const write = (film) => fs.writeFileSync(path.join(hfDir, 'index.html'), indexHtml({ film, s1: 1, s2: 5, cues: { segs: {}, cues: {} } }));
    let renders = 0;
    const render = async () => { renders++; return { code: 1, stderr: 'error: 故意失敗' }; };
    const opts = { hfDir, base, dest, run: runner, render };
    write(11);
    let r = await I.renderIncremental({ ...opts, diff: { ranges: [[1, 2]], audio: false, why: [] } });
    assert.match(r.full, /對不上/);
    write(10);
    r = await I.renderIncremental({ ...opts, diff: { ranges: [[0, 8]], audio: false, why: [] } });
    assert.match(r.full, /超過片長四成/);
    assert.equal(renders, 0);
    r = await I.renderIncremental({ ...opts, diff: { ranges: [[2, 3]], audio: false, why: ['x'] } });
    assert.match(r.full, /故意失敗/);
    assert.equal(renders, 1);
    assert.equal(fs.existsSync(dest), false);
    assert.equal(fs.existsSync(path.join(hfDir, I.AUDIO_COMP)), false, '暫時的聲音合成不留');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ---------- --review ----------

test('reviewHashes：只有時間重疊的段變；kit、字幕樣式變了共用的雜湊就變；認得合成檔用到的素材', () => {
  const items = [{ id: 's1', out: { start: 10, end: 15 } }, { id: 's2', out: { start: 50, end: 55 } }];
  const H = (o = {}, opts = {}) => I.reviewHashes(state(o), items, opts);
  const a = H();
  assert.ok(a.global && a.segs.s1 && a.segs.s2);
  assert.deepEqual(H(), a, '內容一樣，雜湊一樣');
  // 字幕、合成檔只動到那一段
  let b = H({ captions: CAPTIONS([['第一句改', 10, 12], ['第二句', 50, 52]]), sigs: { 'compositions/captions.html': 'cc2' } });
  assert.equal(b.global, a.global, '改一則字幕不算共用的改動');
  assert.notEqual(b.segs.s1, a.segs.s1);
  assert.equal(b.segs.s2, a.segs.s2);
  b = H({ sigs: { 'compositions/s2.html': 'c2x' } });
  assert.equal(b.global, a.global);
  assert.equal(b.segs.s1, a.segs.s1);
  assert.notEqual(b.segs.s2, a.segs.s2);
  // plan 那段、分鏡表那段
  b = H({}, { scenes: [{ id: 's1', slots: { key: '改' } }] });
  assert.notEqual(b.segs.s1, a.segs.s1);
  b = H({}, { sheets: { s2: ['分鏡'] } });
  assert.notEqual(b.segs.s2, a.segs.s2);
  // 共用的：kit、字幕樣式、底片、版式、模板
  for (const o of [{ sigs: { 'kit/brand.css': 'k2' } }, { captions: CAPTIONS(undefined, '.cg{color:#ff0}') }, { sigs: { 'assets/rough.mp4': 'r2' } }, { head: '<link rel="stylesheet" href="kit/dark.css">' }, { chb: '第二章' }]) assert.notEqual(H(o).global, a.global, JSON.stringify(o));
  assert.notEqual(H({}, { extra: { tpl: ['a:1:2'] } }).global, a.global);
  // 合成檔裡引用的素材換內容，那段就變；別段不變
  const readComp = (f) => (f === 'compositions/s1.html' ? '<img src="assets/media/p.jpg"><i data-illus-src="illus-local/cat.svg"></i>' : '');
  const c0 = H({ sigs: { 'assets/media/p.jpg': '1', 'illus-local/cat.svg': '1' } }, { readComp });
  const c1 = H({ sigs: { 'assets/media/p.jpg': '2', 'illus-local/cat.svg': '1' } }, { readComp });
  const c2 = H({ sigs: { 'assets/media/p.jpg': '1', 'illus-local/cat.svg': '2' } }, { readComp });
  assert.equal(c1.global, c0.global);
  assert.notEqual(c1.segs.s1, c0.segs.s1);
  assert.equal(c1.segs.s2, c0.segs.s2);
  assert.notEqual(c2.segs.s1, c0.segs.s1);
  assert.equal(I.reviewHashes({ index: '<html>亂寫</html>', sigs: {} }, items), null, '看不懂回 null，整支重做');
});

test('線稿（illus-local）算在內容裡：重畫了就要重新輸出，紀錄裡也有', async () => {
  const D = await imp('lib/deliver.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-inc-illus-'));
  try {
    const out = path.join(root, 'hf');
    fs.mkdirSync(path.join(out, 'illus-local'), { recursive: true });
    fs.writeFileSync(path.join(out, 'index.html'), '<html></html>');
    const P = { plan: path.join(out, 'plan.json'), srt: path.join(root, 'rough.srt'), out };
    fs.writeFileSync(P.plan, '{}');
    fs.writeFileSync(path.join(out, 'illus-local', 'cat.svg'), '<svg/>');
    const a = D.contentFingerprint(P), sig = I.captureState(P).sigs['illus-local/cat.svg'];
    assert.ok(sig);
    fs.writeFileSync(path.join(out, 'illus-local', 'cat.svg'), '<svg width="1"/>');
    assert.notEqual(D.contentFingerprint(P), a);
    assert.notEqual(I.captureState(P).sigs['illus-local/cat.svg'], sig);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ---------- 底片 stream copy ----------

test('footageCopyable：H.264、yuv420p、尺寸對、30fps、關鍵影格夠密才直接用；其他照舊重新編碼', { skip: ffSkip }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-inc-copy-'));
  const make = (name, { size = '1920x1080', rate = 30, g = 30, sec = 4, extra = [] } = {}) => {
    const f = path.join(root, `${name}.mp4`);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${rate}`, '-t', String(sec), '-c:v', 'libx264', '-preset', 'ultrafast', '-g', String(g), '-keyint_min', String(g), '-pix_fmt', 'yuv420p', ...extra, f], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return f;
  };
  try {
    assert.equal(FF.footageCopyable(make('ok')), true);
    assert.equal(FF.footageCopyable(make('size', { size: '1280x720' })), false);
    assert.equal(FF.footageCopyable(make('rate', { rate: 25, g: 25 })), false);
    assert.equal(FF.footageCopyable(make('gop', { g: 90, sec: 8 })), false, '關鍵影格太疏，seek 會凍結');
    assert.equal(FF.footageCopyable(make('hevc', { extra: ['-c:v', 'mpeg4'] })), false);
    assert.equal(FF.footageCopyable(make('pix', { extra: ['-pix_fmt', 'yuv444p'] })), false);
    assert.equal(FF.footageCopyable(path.join(root, '不存在.mp4')), false);
    // 直式
    const portrait = make('portrait', { size: '1080x1920' });
    assert.equal(FF.footageCopyable(portrait), false, '預設畫布是橫式');
    assert.equal(FF.footageCopyable(portrait, { W: 1080, H: 1920 }), true);
    // 實際流程：沒裁切 → 畫面逐格相同；有裁切 → 照舊重新編碼
    const src = make('src');
    const dst = path.join(root, 'dst.mp4'), crop = path.join(root, 'crop.mp4');
    const withAudio = path.join(root, 'with-audio.mp4');
    assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', '4', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', withAudio]).status, 0);
    FF.encodeFootage(withAudio, dst);
    assert.deepEqual(frameMd5(dst), frameMd5(src));
    FF.encodeFootage(withAudio, crop, { crop: { x: 0, y: 0, w: 960, h: 540 } });
    assert.notDeepEqual(frameMd5(crop), frameMd5(src));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ---------- seek 查詢快取 ----------

test('qsmemo：畫面準備好以後才記；只記 data-composition-id 的查詢；元素被換掉就重查', () => {
  const src = fs.readFileSync(path.join(TEMPLATE, 'kit', 'qsmemo.js'), 'utf8');
  let calls = 0, answer = { isConnected: true, name: 'a' };
  class Doc { querySelector(s) { calls++; return s === '#none' ? null : answer; } }
  const document = new Doc();
  const win = {};
  vm.runInNewContext(src, { window: win, document, Document: Doc, console });
  const q = '[data-composition-id="main"]';
  document.querySelector(q);
  document.querySelector(q);
  assert.equal(calls, 2, '還沒準備好：照常查（合成還在載入）');
  win.__renderReady = true;
  assert.equal(document.querySelector(q), answer);
  const n = calls;
  assert.equal(document.querySelector(q), answer);
  assert.equal(calls, n, '準備好之後不再掃 DOM');
  document.querySelector('.x');
  document.querySelector('.x');
  assert.equal(calls, n + 2, '別的查詢照常');
  answer.isConnected = false;
  answer = { isConnected: true, name: 'b' };
  assert.equal(document.querySelector(q).name, 'b', '元素被換掉就重查');
});

test('主合成的 <head> 載入 qsmemo（在 HyperFrames 的 runtime 之前就要包好）', () => {
  const main = fs.readFileSync(path.join(TOOLS, 'lib', 'main.mjs'), 'utf8');
  assert.match(main, /kit\/qsmemo\.js/);
  assert.ok(fs.existsSync(path.join(TEMPLATE, 'kit', 'qsmemo.js')));
});

// ---------- 實跑：走 deliver.mjs ----------

const chrome = await hasChrome();
const realSkip = !ffmpegOk || !chrome ? '要 ffmpeg 和 HyperFrames 的 Chrome' : false;
const DELIVER = path.join(TOOLS, 'deliver.mjs');
const STOP_LOG = ['# 製作進度', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', '| 2026-11-06 10:00 | ④ 完成影片預覽 | 待回覆 | — | — |', '', '## 回饋輪', ''].join('\n');
const WORKERS = { PRODUCER_MAX_WORKERS: '2' };

function realProject({ size = '640x360', film = 20 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-inc-real-'));
  const project = path.join(root, 'projects', 'demo'), work = path.join(project, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`, '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100', '-t', String(film), '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-keyint_min', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(work, 'rough.mp4')], { encoding: 'utf8' });
  assert.equal(ff.status, 0, ff.stderr);
  const stamp = (t) => `00:00:${String(Math.floor(t)).padStart(2, '0')},${String(Math.round((t % 1) * 1000)).padStart(3, '0')}`;
  const n = Math.floor((film - 1) / 3);
  fs.writeFileSync(path.join(work, 'rough.srt'), Array.from({ length: n }, (_, i) => `${i + 1}\n${stamp(1 + i * 3)} --> ${stamp(3.5 + i * 3)}\n第${i + 1}句字幕\n`).join('\n'));
  const scenes = [
    { id: 's01', scene: 'concept', from: 2, to: 6, slots: { text: '**第一段**：不會動' }, sfx: 'click' },
    { id: 's02', scene: 'concept', from: 13, to: 18, slots: { text: '**第二段**：會改' } },
  ];
  fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, speakerBox: [700, 200, 1220, 1000], look: { color: 0, slim: 0 }, check: { textSync: false }, scenes }));
  fs.writeFileSync(path.join(work, '製作進度.md'), STOP_LOG);
  return { root, project, work, out, plan: path.join(out, 'plan.json'), srt: path.join(work, 'rough.srt'), final: path.join(project, 'output', 'final.mp4') };
}
const cli = (R, args = []) => spawnSync(process.execPath, [DELIVER, '--project', R.project, ...args], { cwd: R.root, encoding: 'utf8', timeout: 540000, env: { ...process.env, ...WORKERS } });
const editPlan = (R, fn) => { const p = JSON.parse(fs.readFileSync(R.plan, 'utf8')); fn(p); fs.writeFileSync(R.plan, JSON.stringify(p)); };
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const same = (a, b, from, to) => assert.deepEqual(a.slice(from * 30, to * 30), b.slice(from * 30, to * 30));

test('實跑：改一段、字幕、音效都只重畫改到的（其他畫面逐格相同）；主題變了印一行原因、整支', { skip: realSkip, timeout: 1200000 }, () => {
  const R = realProject();
  try {
    let r = cli(R);
    ok(r);
    assert.ok(fs.existsSync(path.join(R.work, '.jobs', 'final-content.json')), '輸出時留下內容紀錄');
    assert.doesNotMatch(r.stdout, /只重畫改到的/);
    const v0 = frameMd5(R.final), a0 = audioMd5(R.final);
    assert.equal(v0.length, 20 * 30);

    // 改一段（13–18 秒）的文字：之前的畫面、聲音都不動
    editPlan(R, (p) => { p.scenes[1].slots.text = '**第二段**：改過了'; });
    r = cli(R);
    ok(r);
    assert.match(r.stdout, /只重畫改到的/);
    assert.match(r.stdout, /只重畫改到的地方，接回上一支/);
    assert.match(r.stdout, /✔ 完成影片/);
    const v1 = frameMd5(R.final);
    assert.equal(v1.length, v0.length);
    same(v1, v0, 0, 12);
    assert.notDeepEqual(v1.slice(14 * 30, 18 * 30), v0.slice(14 * 30, 18 * 30), '改到的那段真的換了');
    assert.equal(audioMd5(R.final), a0, '音效沒動：聲音逐位元相同');

    // 改一則字幕：只有那一則的時間
    const srt = fs.readFileSync(R.srt, 'utf8');
    fs.writeFileSync(R.srt, srt.replace('第5句字幕', '第五句字幕'));
    r = cli(R);
    ok(r);
    assert.match(r.stdout, /只重畫改到的/);
    const v2 = frameMd5(R.final);
    assert.equal(v2.length, v0.length);
    same(v2, v1, 0, 8);
    assert.notDeepEqual(v2.slice(13 * 30, 15 * 30), v1.slice(13 * 30, 15 * 30), '字幕真的換了');

    // 改音效：畫面逐格相同，只有聲音換
    editPlan(R, (p) => { p.scenes[0].sfx = 'ding'; });
    r = cli(R);
    ok(r);
    assert.match(r.stdout, /重混聲音/);
    assert.deepEqual(frameMd5(R.final), v2, '只換音效：畫面逐格相同');
    assert.notEqual(audioMd5(R.final), a0, '聲音換了');

    // 主題變了：一行原因、整支
    editPlan(R, (p) => { p.theme = 'dark'; });
    r = cli(R);
    ok(r);
    assert.match(r.stdout, /整支重新輸出：版式、主題/);
    assert.doesNotMatch(r.stdout, /只重畫改到的/);
    assert.equal(frameMd5(R.final).length, v0.length);
  } finally { fs.rmSync(R.root, { recursive: true, force: true }); }
});

test('實跑：預先 render 跑到一半存檔（局部）→ 不重開、跑完補上，輸出直接接手；改動以外的畫面和整支 render 逐格相同', { skip: realSkip, timeout: 1200000 }, async () => {
  const R = realProject();
  const preState = () => { try { return JSON.parse(fs.readFileSync(path.join(R.work, 'final-prerender.json'), 'utf8')); } catch { return null; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let r = cli(R, ['--prerender', '--workers', '2']);
    ok(r);
    for (let i = 0; i < 300 && !(preState()?.phase === 'render' && preState()?.fingerprint); i++) await sleep(500);
    const fp0 = preState()?.fingerprint, pid0 = preState()?.pid;
    assert.ok(fp0, '開始 render 了');

    // 使用者存檔：改一段，重新產生
    editPlan(R, (p) => { p.scenes[1].slots.text = '**第二段**：改過了'; });
    const b = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', R.project], { cwd: R.root, encoding: 'utf8' });
    assert.equal(b.status, 0, b.stdout + b.stderr);
    assert.equal(preState()?.state, 'running', '存檔不會把它收掉');
    // --review 又叫一次 --prerender：不重開
    r = cli(R, ['--prerender', '--workers', '2']);
    ok(r);
    assert.match(r.stdout, /只改了幾段，跑完會自動補上，不用重開/);
    assert.equal(preState()?.pid, pid0, '同一個背景工作');

    // 使用者說「輸出」：接著等、補上、接手，不再 render 一次
    r = cli(R);
    ok(r);
    assert.match(r.stdout, /跑完會自動補上這次的改動/);
    assert.match(r.stdout, /用預先 render 好的完成影片/);
    assert.match(r.stdout, /來源：預先 render/);
    assert.equal(preState(), null, '接手後狀態清掉');
    const patched = frameMd5(R.final), a1 = audioMd5(R.final);
    assert.equal(patched.length, 20 * 30);

    // 對整支 render：改動以外逐格相同、聲音逐位元相同
    r = cli(R, ['--force']);
    ok(r);
    const whole = frameMd5(R.final);
    assert.equal(whole.length, patched.length);
    let diff = [];
    for (let i = 0; i < whole.length; i++) if (whole[i] !== patched[i]) diff.push(i / 30);
    assert.ok(diff.every((t) => t >= 8 && t < 20), `不同的影格都在重畫的時間窗內：${diff[0]}–${diff[diff.length - 1]}`);
    assert.equal(audioMd5(R.final), a1);
  } finally {
    cli(R, ['--cancel']);
    fs.rmSync(R.root, { recursive: true, force: true });
  }
});

test('實跑：直式短片（底片直接用、不重新編碼）改一段也只重畫那段', { skip: realSkip, timeout: 900000 }, () => {
  const R = realProject({ size: '1080x1920', film: 30 });
  try {
    editPlan(R, (p) => { p.format = 'portrait'; p.speakerBox = [300, 500, 780, 1100]; p.scenes = [{ id: 's01', scene: 'concept', from: 2, to: 6, slots: { text: '**第一段**：不會動' } }, { id: 's02', scene: 'concept', from: 18, to: 23, slots: { text: '**第二段**：會改' } }]; });   // 片子太短或改動跨太多關鍵影格會退回整支（超過片長四成）
    let r = cli(R);
    ok(r);
    const v0 = frameMd5(R.final), a0 = audioMd5(R.final);
    const size = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', R.final], { encoding: 'utf8' }).stdout.trim();
    assert.equal(size, '1080,1920');
    assert.deepEqual(frameMd5(path.join(R.out, 'assets', 'rough.mp4')), frameMd5(path.join(R.work, 'rough.mp4')), '沒有裁切、調光：底片畫面逐格等於原檔');
    editPlan(R, (p) => { p.scenes[1].slots.text = '**第二段**：改過了'; });
    r = cli(R);
    ok(r);
    assert.match(r.stdout, /只重畫改到的/);
    const v1 = frameMd5(R.final);
    assert.equal(v1.length, v0.length);
    same(v1, v0, 0, 16);
    assert.notDeepEqual(v1.slice(19 * 30, 23 * 30), v0.slice(19 * 30, 23 * 30));
    assert.equal(audioMd5(R.final), a0);
    // 對整支 render：時間窗以外逐格相同、聲音逐位元相同
    r = cli(R, ['--force']);
    ok(r);
    const whole = frameMd5(R.final);
    assert.equal(whole.length, v1.length);
    same(whole, v1, 0, 16);
    assert.equal(audioMd5(R.final), a0);
  } finally { fs.rmSync(R.root, { recursive: true, force: true }); }
});

test('實跑：--review 內容沒變的段沿用上次的量測和截圖；改一段只重做那段；--no-reuse 全部重做、紀錄清掉', { skip: realSkip, timeout: 600000 }, () => {
  const R = realProject();
  const review = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', R.project, '--review', '--no-prerender', ...a], { cwd: R.root, encoding: 'utf8', timeout: 300000 });
  const pages = (out) => out.split('\n').filter((l) => /sheet-\d+\.jpg/.test(l));
  try {
    let r = review();
    ok(r);
    assert.doesNotMatch(r.stdout, /沿用上次/);
    assert.match(r.stdout, /audit：✖ 0/);
    const first = pages(r.stdout);
    assert.ok(first.length, '第一次有拼圖');

    r = review();
    ok(r);
    assert.match(r.stdout, /沿用上次的量測和截圖：這次重做 0 段/);
    assert.deepEqual(pages(r.stdout), first, '沒有重截，頁一樣');
    assert.match(r.stdout, /停點 ④/);

    editPlan(R, (p) => { p.scenes[1].slots.text = '**第二段**：改過了'; });
    r = review();
    ok(r);
    assert.match(r.stdout, /這次重做 1 段（s02）/);
    assert.match(r.stdout, /audit：✖ 0/);

    // 字幕改一則：那個時間的段才算變
    fs.writeFileSync(R.srt, fs.readFileSync(R.srt, 'utf8').replace('第5句字幕', '第五句字幕'));
    r = review();
    ok(r);
    assert.match(r.stdout, /這次重做 1 段（s02）/);

    r = review('--no-reuse');
    ok(r);
    assert.doesNotMatch(r.stdout, /沿用上次/);
    assert.equal(fs.existsSync(path.join(R.work, '.cache', 'review-state.json')), false, '全部重做時舊紀錄不留');

    // 模板（共用的）變了就整支重做：主題
    r = review();
    ok(r);
    editPlan(R, (p) => { p.theme = 'dark'; });
    r = review();
    ok(r);
    assert.doesNotMatch(r.stdout, /沿用上次/);
  } finally {
    spawnSync(process.execPath, [path.join(TOOLS, 'editor.mjs'), '--stop', '--project', R.project], { cwd: R.root, encoding: 'utf8', timeout: 30000 });
    fs.rmSync(R.root, { recursive: true, force: true });
  }
});


// 055 N4：手改過的情境動畫檔（build 不覆寫），段的起點或段長改了 → 秒數照起點差平移、const D 換新段長（lib/hand-shift.mjs、build.mjs）
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, imp, makeSrt, fixture } from './helpers.mjs';

const { withTimes, readTimes, shiftHand } = await imp('lib/hand-shift.mjs');
const { stampHash, verifyHash } = await imp('lib/assemble.mjs');

const tmps = [];
after(() => { for (const d of tmps) fs.rmSync(d, { recursive: true, force: true }); });

// 短影片4 s0104（r8 手改：三張卡單欄直排、P.icon 改成描 > svg、自己算好秒數）的時間碼部分
const KW = ({ t0, d, pops, icons, stamp = true }) => [
  '<!doctype html>',
  ...(stamp ? [`<!-- auto-edit: id=s0104 scene=keywords${t0 != null ? ` t0=${t0} d=${d}` : ''} hash=ebb6ff0e -->`] : []),
  '<html lang="zh-Hant"><body>',
  '<template id="s0104-keywords-template">',
  `  <div id="s0104-keywords" data-composition-id="s0104-keywords" data-width="1080" data-height="1920" data-duration="${d}" data-scene="keywords">`,
  '    <div id="s0104-kwList"><div>常用工具</div><div>專案背景資料</div><div>個人工作流</div></div>',
  '  </div>',
  '  <script>',
  '  (function () {',
  "    const tl = gsap.timeline({ paused: true });",
  "    const P = SceneMotion(tl, document.getElementById('s0104-keywords'));",
  `    const D = ${d};`,
  '    /* v2：逐條彈出（從下 28u、0.82 → 1，各綁 at）→ 0.15 後描線 → 段尾整組向左擦掉 */',
  ...pops.map((t, i) => `    P.pop('#s0104-kwList > :nth-child(${i + 1})', ${t}, { from: 0.82, dy: 28 });\n    P.icon('#s0104-kwList > :nth-child(${i + 1}) > svg', ${icons[i]});`),
  "    P.wipeOut('#s0104-kwList', D - 0.8, { dir: 'left' });",
  '    P.end(D);',
  "    window.__timelines['s0104-keywords'] = tl;",
  '  })();',
  '  </script>',
  '</template></body></html>', ''].join('\n');
// 工具這次照新起點產生的（P.icon 寫成 at + 0.15、選擇器沒有 > svg）
const FRESH = ({ t0, d, pops }) => KW({ t0, d, pops, icons: [] }).replace(/\n    P\.icon\([^\n]*/g, '').replace(/(P\.pop\('#s0104-kwList > :nth-child\((\d)\)', ([\d.]+), \{ from: 0\.82, dy: 28 \}\);)/g, "$1\n    P.icon('#s0104-kwList > :nth-child($2)', $3 + 0.15);");
const nums = (html, re) => [...html.matchAll(re)].map((m) => Number(m[1]));
const POPS = /P\.pop\('[^']+', ([\d.]+)/g, ICONS = /P\.icon\('[^']+', ([\d.]+)\)/g;

test('withTimes／readTimes：檔頭記起點與段長；雜湊不變（工具產生的檔照樣認得出沒手改）', () => {
  const html = stampHash('<!doctype html>\n<template id="a"><div>x</div></template>\n', 'id=s01 scene=concept');
  assert.equal(readTimes(html), null);
  const t = withTimes(html, 12.3456, 7.5);
  assert.match(t, /^<!doctype html>\n<!-- auto-edit: id=s01 scene=concept t0=12.346 d=7.5 hash=[0-9a-f]{8} -->\n/);
  assert.deepEqual(readTimes(t), { t0: 12.346, d: 7.5 });
  assert.deepEqual([verifyHash(t).ok, verifyHash(t).info], [true, 'id=s01 scene=concept t0=12.346 d=7.5']);
  assert.deepEqual(readTimes(withTimes(t, 13, 7)), { t0: 13, d: 7 }, '換掉舊的，不重複');
  assert.equal(withTimes('<!doctype html>\n<p>沒有檔頭</p>', 1, 2), '<!doctype html>\n<p>沒有檔頭</p>');
});

test('短影片4 r10：s0104 手改檔、from #17 → #17+0.5（迄點不動）→ 三個 P.pop、P.icon 各少 0.5 秒，const D、data-duration 換新段長', () => {
  const hand = KW({ t0: 10.5, d: 7.516, pops: [3.846, 4.716, 5.976], icons: [3.996, 4.866, 6.126] });
  const fresh = FRESH({ t0: 11, d: 7.016, pops: [3.346, 4.216, 5.476] });
  const r = shiftHand({ hand, fresh, t0: 11, d: 7.016, id: 's0104', file: 'compositions/s0104-keywords.html', where: '[s0104 keywords]' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(nums(r.html, POPS), [3.346, 4.216, 5.476]);
  assert.deepEqual(nums(r.html, ICONS), [3.496, 4.366, 5.626], '手改的 > svg（工具沒有這個呼叫）也平移');
  assert.match(r.html, /const D = 7\.016;/);
  assert.match(r.html, /data-duration="7\.016"/);
  assert.match(r.html, /P\.wipeOut\('#s0104-kwList', D - 0\.8/, 'D 相對的不動');
  assert.match(r.html, /\(1\)', 3\.346/, '選擇器裡的 (1) 不會被當成秒數');
  assert.deepEqual(readTimes(r.html), { t0: 11, d: 7.016 });
  assert.equal(r.line, 's0104 手改過的動畫檔 compositions/s0104-keywords.html 照新起點平移 −0.5 秒（6 處）；段長 7.516 → 7.016 秒（const D、data-duration 一起換）');
  // 再跑一次 build：檔頭已經是新起點，不再動
  assert.deepEqual(shiftHand({ hand: r.html, fresh, t0: 11, d: 7.016, id: 's0104' }), { html: null, line: null, errors: [] });
  // 起點提早：秒數加回去；早於段頭的放在 0
  const early = shiftHand({ hand, fresh, t0: 6, d: 12.516, id: 's0104' });
  assert.deepEqual(nums(early.html, POPS), [8.346, 9.216, 10.476]);
  const late = shiftHand({ hand, fresh, t0: 14.5, d: 3.516, id: 's0104' });
  assert.deepEqual(nums(late.html, POPS), [0, 0.716, 1.976]);
  assert.match(late.line, /2 處早於段頭，放在 0 秒/);
});

test('段頭進場這類跟著段走的秒數（和工具這次產生的一樣）不動；陣列、const T0、Math.max 裡的秒數照平移；認不出的寫法 ✖ 給行號與要減多少', () => {
  const SCRIPT = (rows, t0x, extra = '') => [
    '<!doctype html>', '<!-- auto-edit: id=s05 scene=fs-list t0=20 d=9 hash=00000000 -->', '<template id="t"><div id="s05-x" data-duration="9"></div><script>',
    'const tl = gsap.timeline({ paused: true }); const P = SceneMotion(tl, root);', 'const D = 9;',
    "if (P.prev() === 'fullscreen') { P.wipe('#s05-wCard', 0, { dir: 'up' }); } else P.grow('#s05-wCard', 0.3);",
    "P.chars('#s05-wCard .sc-opt', 0.5, { stagger: 0.035 });",
    `const rowAt = [${rows.join(', ')}];`,
    "for (let i = 1; i < rowAt.length; i++) P.dim('#s05-fRow' + i, rowAt[i], { to: 0.6 });",
    'const endAt = Math.min(rowAt[rowAt.length - 1] + 2.0, D - 1.6);',
    `const T0 = ${t0x} + (P.prev() === 'speaker' ? 0.35 : 0.1);`,
    "P.flip('#s05-card', Math.max(T0 + 0.9, 6.2 - P.FLIP_LEAD));",
    "P.dim('#s05-fRow1', endAt, { to: 1 });", extra,
    '</script></template>', ''].join('\n');
  const hand = SCRIPT([2.5, 4, 5.5], 3.2, "tl.to('#s05-x', { opacity: 0.25, duration: 0.3 }, 7.1);\nP.pop('#s05-hand', 1.25);");
  const fresh = SCRIPT([2, 3.5, 5], 2.7).replace('t0=20', 't0=20.5').replace('6.2 - P', '5.7 - P');
  const r = shiftHand({ hand, fresh, t0: 20.5, d: 9, id: 's05', file: 'compositions/s05-fs-list.html' });
  assert.deepEqual(r.errors, []);
  assert.match(r.html, /P\.grow\('#s05-wCard', 0\.3\)/, '段頭進場不動');
  assert.match(r.html, /P\.wipe\('#s05-wCard', 0,/);
  assert.match(r.html, /P\.chars\('#s05-wCard \.sc-opt', 0\.5,/);
  assert.match(r.html, /const rowAt = \[2, 3\.5, 5\];/);
  assert.match(r.html, /const T0 = 2\.7 \+/);
  assert.match(r.html, /Math\.max\(T0 \+ 0\.9, 5\.7 - P\.FLIP_LEAD\)/);
  assert.match(r.html, /\{ opacity: 0\.25, duration: 0\.3 \}, 6\.6\);/, '自己寫的 tl.to 也平移');
  assert.match(r.html, /P\.pop\('#s05-hand', 0\.75\);/);
  assert.match(r.html, /Math\.min\(rowAt\[rowAt\.length - 1\] \+ 2\.0, D - 1\.6\)/, '相對的偏移量不動');
  assert.match(r.line, /照新起點平移 −0\.5 秒（7 處；和這次產生的一樣的 3 處不動）$/);
  // 認不出的寫法：其他照平移，✖ 給行號
  const odd = shiftHand({ hand: hand.replace("P.pop('#s05-hand', 1.25);", "P.pop('#s05-hand', 1.25);\nP.rise('#s05-odd', -0.2 + x);"), fresh, t0: 20.5, d: 9, id: 's05', file: 'compositions/s05-fs-list.html', where: '[s05 fs-list]' });
  assert.equal(odd.errors.length, 1);
  assert.equal(odd.errors[0], '[s05 fs-list] compositions/s05-fs-list.html 手改過，段起點從 20 改成 20.5 秒，第 16 行的秒數寫法認不出，整個檔的秒數都沒跟著動 → 那幾行改成數字開頭的寫法（例 3.8 + x）再跑 build，會自動照新起點平移；或自己把綁詞的秒數各減 0.5、檔頭的 t0= 改成 20.5；或刪掉這個檔重產（build 照 plan.json 產生）');
  assert.equal(odd.html, null, '整個檔不動：下次 build 照樣報');
  const fixed = shiftHand({ hand: hand.replace("P.pop('#s05-hand', 1.25);", "P.pop('#s05-hand', 1.25);\nP.rise('#s05-odd', (3.8 + x));"), fresh, t0: 20.5, d: 9, id: 's05' });
  assert.deepEqual(fixed.errors, []);
  assert.match(fixed.html, /P\.rise\('#s05-odd', \(3\.3 \+ x\)\);/, '改成數字開頭就認得');
  // 起點沒動、只改段長：只換 D
  const dOnly = shiftHand({ hand, fresh: fresh.replace('t0=20.5', 't0=20'), t0: 20, d: 8, id: 's05' });
  assert.match(dOnly.html, /const D = 8;/);
  assert.match(dOnly.html, /const rowAt = \[2\.5, 4, 5\.5\];/);
  assert.equal(dOnly.line, 's05 手改過的動畫檔  段長 9 → 8 秒（const D、data-duration 一起換）');
});

test('沒有 t0= 的舊檔：和這次產生的比；綁詞的秒數都差「舊段長 − 新段長」＝起點動了 → 平移；都一樣（已經手動改好）→ 只換 D；差得不一致 → ✖', () => {
  const fresh = FRESH({ t0: 11, d: 7.016, pops: [3.346, 4.216, 5.476] });
  // r12 之前：檔還是照舊起點（D 7.516、秒數 3.846…）
  const before = KW({ d: 7.516, pops: [3.846, 4.716, 5.976], icons: [3.996, 4.866, 6.126] });
  const a = shiftHand({ hand: before, fresh, t0: 11, d: 7.016, id: 's0104', file: 'compositions/s0104-keywords.html' });
  assert.deepEqual(a.errors, []);
  assert.deepEqual(nums(a.html, POPS), [3.346, 4.216, 5.476]);
  assert.deepEqual(readTimes(a.html), { t0: 11, d: 7.016 }, '補記檔頭，下次照它算');
  // r12 之後（現在的短影片4）：秒數已經手動改好，只有 const D 還是舊的 → 只換 D，不會再減一次
  const now = KW({ d: 7.516, pops: [3.346, 4.216, 5.476], icons: [3.496, 4.366, 5.626] });
  const b = shiftHand({ hand: now, fresh, t0: 11, d: 7.016, id: 's0104', file: 'compositions/s0104-keywords.html' });
  assert.deepEqual(nums(b.html, POPS), [3.346, 4.216, 5.476]);
  assert.match(b.html, /const D = 7\.016;/);
  assert.equal(b.line, 's0104 手改過的動畫檔 compositions/s0104-keywords.html 段長 7.516 → 7.016 秒（const D、data-duration 一起換）');
  // 段長沒變：當作起點沒動，只補記檔頭
  const same = shiftHand({ hand: KW({ d: 7.016, pops: [3.346, 4.216, 5.476], icons: [3.496, 4.366, 5.626] }), fresh, t0: 11, d: 7.016, id: 's0104' });
  assert.deepEqual([same.line, same.errors, readTimes(same.html)], [null, [], { t0: 11, d: 7.016 }]);
  // 有的已經手動改好、有的還沒（差 0 和 0.5 混在一起）：認不出 → ✖，檔不動
  const mixed = KW({ d: 7.516, pops: [3.846, 4.216, 5.976], icons: [3.996, 4.366, 6.126] });
  const c = shiftHand({ hand: mixed, fresh, t0: 11, d: 7.016, id: 's0104', file: 'compositions/s0104-keywords.html', where: '[s0104 keywords]' });
  assert.equal(c.html, null);
  assert.equal(c.errors[0], '[s0104 keywords] compositions/s0104-keywords.html 手改過、檔頭沒有記起點（舊版產生的），段長從 7.516 改成 7.016 秒，裡面綁詞的秒數和這次產生的差 0、+0.5 秒，認不出起點動了多少 → 起點晚了幾秒就把綁講到那個詞的秒數各減幾秒、const D 改成 7.016（改好再跑 build 就不會再報）；或刪掉這個檔重產（build 照 plan.json 產生）');
});

// build.mjs：真的產生、手改、改起點、再 build
const ROUGH = () => fixture('hand-shift-rough-20s.mp4', (f) => spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
  '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', f]));
test('build：情境檔頭記 t0=、d=；手改檔在起點改了之後照平移（報告印一行、還是手改檔不被覆寫）；--force 照舊整個重產', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 && '沒有 ffmpeg', timeout: 180000 }, () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-hand-shift-'));
  tmps.push(p);
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  fs.mkdirSync(path.join(p, 'work', 'hyperframes'), { recursive: true });
  fs.copyFileSync(ROUGH(), path.join(p, 'work', 'rough.mp4'));
  fs.copyFileSync(ROUGH(), path.join(p, 'assets', 'camera', 'a.mp4'));
  fs.writeFileSync(path.join(p, 'work', 'rough.srt'), makeSrt({ n: 5 }));
  const planFile = path.join(p, 'work', 'hyperframes', 'plan.json');
  const plan = { version: 1, speakerBox: [700, 200, 1220, 1000], look: false, scenes: [
    { id: 's01', scene: 'keywords', from: '#1', to: '#3e', slots: { items: [{ text: '第一', at: '#2' }, { text: '第二', at: '#3' }] } },
  ] };
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2) + '\n');
  const B = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', p, ...a], { encoding: 'utf8' });
  let b = B();
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const f = path.join(p, 'work', 'hyperframes', 'compositions', 's01-keywords.html');
  const gen = fs.readFileSync(f, 'utf8');
  assert.deepEqual(readTimes(gen), { t0: 1, d: 10 }, '#1 起、#3e 止');
  const pops0 = nums(gen, POPS);
  assert.deepEqual(pops0, [3.5, 7]);
  // 手改：彈出改成 rise（工具沒有這個呼叫）
  fs.writeFileSync(f, gen.replace(/P\.pop\(/g, 'P.rise('));
  plan.scenes[0].from = '#1+0.5';
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2) + '\n');
  b = B();
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.match(b.stdout, /^s01 手改過的動畫檔 compositions\/s01-keywords\.html 照新起點平移 −0\.5 秒（\d+ 處.*）；段長 10 → 9\.5 秒/m);
  assert.match(b.stdout, /⚠ 這些檔被手改過，沒有覆寫：compositions\/s01-keywords\.html/);
  const after1 = fs.readFileSync(f, 'utf8');
  assert.deepEqual(nums(after1, /P\.rise\('[^']+', ([\d.]+)/g), [3, 6.5]);
  assert.deepEqual(readTimes(after1), { t0: 1.5, d: 9.5 });
  assert.match(after1, /const D = 9\.5;/);
  // 再 build 一次：不再動
  b = B();
  assert.equal(b.status, 0);
  assert.doesNotMatch(b.stdout, /照新起點平移/);
  assert.equal(fs.readFileSync(f, 'utf8'), after1);
  // --force：照 plan.json 重產（手改不見）
  b = B('--force');
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.deepEqual(nums(fs.readFileSync(f, 'utf8'), POPS), [3, 6.5]);
});

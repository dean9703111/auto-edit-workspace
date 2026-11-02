// 第二層範例（shared/template/custom/x-*.html，EXAMPLES 表列的每一支）：R7.3 骨架、檔頭 6 小節、data-cues-sample 與 D 下限、句號區段、只用 token 與 SceneMotion、
// x-process 連接線（data-links）、index.html ④ 情境動畫、custom-preview.mjs；最後把全部排進同一個暫存專案跑 --check → build → audit → 亂序 snapshot（FR-072）
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, imp, hasChrome } from './helpers.mjs';

const { readCustom } = await imp('lib/assemble.mjs');
const { buildCustomPreview } = await imp('lib/custom-preview.mjs');
const { textWidth } = await imp('lib/time.mjs');
const ICONS = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'icons.json'), 'utf8'));
const CUSTOM = path.join(TEMPLATE, 'custom');
const MOTION = fs.readFileSync(path.join(TEMPLATE, 'kit', 'scene-motion.js'), 'utf8');
const tmps = [];
after(() => { for (const d of tmps) fs.rmSync(d, { recursive: true, force: true }); });

// 前綴與句號區段（spec FR-024：互不重疊，整合測試才能放進同一份 rough.srt）；noIcon＝刻意不放圖示（x-checklist 的勾就是圖示，檔頭寫「這支沒有圖示」）
const EXAMPLES = {
  'x-process': { pre: 'xproc', range: [11, 15] }, 'x-metaphor': { pre: 'xmeta', range: [21, 25] }, 'x-before-after': { pre: 'xba', range: [31, 35] },
  'x-numbers': { pre: 'xn', range: [41, 44] }, 'x-warnings': { pre: 'xwarn', range: [51, 56] }, 'x-prompt': { pre: 'xprompt', range: [61, 65] },
  'x-ui-mock': { pre: 'xui', range: [71, 76], card: 'xui-win' }, 'x-architecture': { pre: 'xarch', range: [81, 87] }, 'x-branch': { pre: 'xbr', range: [91, 95] },
  // 008 動畫庫（句號區段照 spec 008 §0）
  'x-callout': { pre: 'xcall', range: [101, 105] }, 'x-stack': { pre: 'xstk', range: [111, 115] }, 'x-checklist': { pre: 'xchk', range: [121, 125], noIcon: true },
  'x-timeline': { pre: 'xtl', range: [131, 135] }, 'x-versus': { pre: 'xvs', range: [141, 145] }, 'x-trend': { pre: 'xtr', range: [151, 154] },
  'x-ring': { pre: 'xring', range: [161, 164] }, 'x-fix': { pre: 'xfix', range: [171, 175] },
  // 011 示意動畫（x-scene 骨架與兩段參考；主角是 kit/illus.js 的插圖元件，不放 .sc-icon）
  'x-scene': { pre: 'xsc', range: [181, 186], noIcon: true }, 'x-scene-example-rec': { pre: 'xscr', range: [191, 197], noIcon: true },
  'x-scene-example-outline': { pre: 'xsco', range: [201, 207], noIcon: true },
};
const COUNT = Object.keys(EXAMPLES).length;
const HEAD = ['適用的口播', '不要用在哪裡', '要改的地方', '綁句欄位', 'D 下限', '版面'];
const FOREACH1 = "[ 'in', 'out', 'drift', 'reveal', 'rise', 'maskUp', 'sideIn', 'sideOut', 'morph', 'push', 'count', 'bar', 'stroke', 'icon', 'check', 'type' ].forEach(";
const FOREACH2 = "[ 'swap', 'axis', 'focus' ].forEach(";
const norm = (s) => s.replace(/\s+/g, '').replace(/class="[^"]*"/g, '').replace(/(width|height)="[^"]*"/g, '');

function parse(id) {
  const file = path.join(CUSTOM, `${id}.html`);
  const text = fs.readFileSync(file, 'utf8');
  const tpl = text.match(/<template[^>]*>([\s\S]*)<\/template>/)[1];
  const css = tpl.match(/<style>([\s\S]*?)<\/style>/)[1];
  const body = tpl.slice(tpl.indexOf('</style>') + 8, tpl.indexOf('<script>'));
  const script = tpl.match(/<script>([\s\S]*?)<\/script>/)[1];
  const code = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');   // 去掉註解（檔頭與註解可以提到色碼、方法名）
  const head = text.slice(0, text.indexOf('<html'));
  const sample = JSON.parse(tpl.match(/data-cues-sample='([^']+)'/)[1]);
  return { file, text, tpl, css, body, script, code, head, sample };
}
// 用 sample 算 P.at(ref, off) 的秒數（和 scene-motion.js 的 sample 退路相同：#N＝開頭、#Ne＝結尾、#N@詞 查 refs、±秒數）
function atOf(sample, ref, off = 0) {
  if (typeof ref === 'number') return ref + off;
  if (sample.refs && ref in sample.refs) return sample.refs[ref] - (sample.start || 0) + off;
  const m = String(ref).match(/^#(\d+)(e)?([+-]\d+(?:\.\d+)?)?$/);
  if (!m || !sample.cues[m[1]]) return NaN;
  return sample.cues[m[1]][m[2] ? 1 : 0] - (sample.start || 0) + Number(m[3] || 0) + off;
}
// const X = P.at(...) 的宣告 → { X: 秒數 }
function beatsOf(p) {
  const out = {};
  for (const m of p.code.matchAll(/\b([A-Z][A-Z0-9]*)\s*=\s*P\.at\(\s*(?:'([^']*)'|([\d.]+))\s*(?:,\s*(-?[\d.]+)\s*)?\)/g)) out[m[1]] = atOf(p.sample, m[2] ?? Number(m[3]), Number(m[4] || 0));
  return out;
}
// 拍點＋由拍點推出來的常數（const B20 = A + 1.1;）
const PCONST = { BEAT: 0.15, STROKE: 0.7, READ: 1.2 };
function constsOf(p) {
  const out = beatsOf(p);
  for (const m of p.code.matchAll(/\bconst ([A-Z][A-Z0-9]*) = ([^;]+);/g)) {
    if (m[1] in out || !/^(?:[A-Z][A-Z0-9]*|P\.[A-Z_]+|\d+(?:\.\d+)?|[\s+\-*/()])+$/.test(m[2].trim())) continue;   // 只收算式（不收 const P = SceneMotion(…)）
    out[m[1]] = Function(...Object.keys(out), 'P', `return ${m[2]}`)(...Object.values(out), PCONST);
  }
  return out;
}
// 【D 下限】的 X ≥ Y + n／X ≥ n（「用 ALL 時」那種選用的跳過）
function lowerOf(p) {
  const sec = p.head.split('【D 下限】')[1].split('【版面】')[0];
  const out = [];
  for (const line of sec.split('\n')) {
    if (/^\s*用 \w+ 時/.test(line)) continue;
    for (const m of line.split('（')[0].matchAll(/\b([A-Z][A-Z0-9]*) ≥ (?:([A-Z][A-Z0-9]*) \+ )?(\d+(?:\.\d+)?)/g)) out.push({ x: m[1], y: m[2] || null, n: Number(m[3]) });
  }
  return out;
}

for (const [id, { pre, range, card, noIcon }] of Object.entries(EXAMPLES)) {
  const p = parse(id);

  test(`${id}：readCustom 過、R7.3 骨架（三處 id、$q、兩行 forEach、P.end()、timeline 登記）`, () => {
    const r = readCustom(p.file, id);
    assert.deepEqual(r.errors, [], r.errors.join('\n'));
    assert.equal(r.compId, id);
    assert.match(p.text, /<head><meta charset="UTF-8"><title>[^<]+<\/title><\/head>/);
    assert.ok(p.text.includes(`<template id="${id}-template">`));
    assert.ok(p.tpl.includes(`<div id="${id}" data-composition-id="${id}" data-width="1920" data-height="1080" data-duration="${p.sample.D}"`), 'root：三處 id 一致、data-duration＝sample 的 D');
    assert.doesNotMatch(p.tpl, new RegExp(`id="${id}"[^>]*class=`), 'root 不加 class');
    assert.ok(p.body.includes('<div class="sc-surface-fs fill"></div>'), '第一個子元素是滿版底');
    assert.ok(p.script.includes("var $q = function (s) { return typeof s === 'string' ? Array.prototype.slice.call(document.querySelectorAll(s)) : s; };"));
    assert.ok(p.script.includes(FOREACH1), '第一行 forEach（含 type）');
    assert.ok(p.script.includes(FOREACH2), '第二行 forEach（含 focus）');
    assert.ok(p.script.includes(`const P = SceneMotion(tl, document.getElementById('${id}'));`));
    assert.match(p.code, /\bP\.end\(\);/);
    assert.doesNotMatch(p.code, /\bP\.end\(\s*[\w.]+\s*\)|const D\s*=/, '不寫 const D、P.end 不帶參數（長度跟著 plan.json）');
    assert.ok(p.script.includes(`window.__timelines['${id}'] = tl;`));
    assert.doesNotMatch(p.text, /相減|填回.*data-duration|2 段 custom|一起進場|進場 0\.3–0\.5/, '舊說法（spec FR-021）');
  });

  test(`${id}：檔頭 6 小節照順序`, () => {
    const at = HEAD.map((k) => p.head.indexOf(`【${k}】`));
    assert.ok(at.every((i) => i >= 0), `缺：${HEAD.filter((_, k) => at[k] < 0).join('、')}`);
    assert.deepEqual([...at].sort((a, b) => a - b), at, '6 小節要照順序');
    assert.match(p.head, new RegExp(`${id}：.*layout: "fullscreen"`));
  });

  test(`${id}：data-cues-sample 涵蓋每個 P.at 字面值；句號都在 #${range[0]}–#${range[1]}`, () => {
    assert.equal(p.sample.start, 0);
    assert.ok(p.sample.D > 0);
    const refs = readCustom(p.file, id).refs;
    assert.ok(refs.length >= 2, '至少綁兩句');
    for (const ref of refs) assert.ok(Number.isFinite(atOf(p.sample, ref)), `${id}：sample 算不出 P.at('${ref}') → data-cues-sample 補上這一句${ref.includes('@') ? '（@詞 寫在 refs）' : ''}`);
    const nums = [...Object.keys(p.sample.cues).map(Number), ...refs.map((r) => Number(r.match(/^#(\d+)/)[1]))];
    for (const n of nums) assert.ok(n >= range[0] && n <= range[1], `${id}：#${n} 不在 #${range[0]}–#${range[1]}`);
    for (const [n, [a, b]] of Object.entries(p.sample.cues)) assert.ok(a >= 0 && b > a && b <= p.sample.D, `#${n} [${a}, ${b}] 要在 0–D 內`);
  });

  test(`${id}：【D 下限】可解析，sample 的拍點與 D 都滿足`, () => {
    const beats = { ...beatsOf(p), D: p.sample.D };
    const low = lowerOf(p);
    assert.ok(low.length >= 3 && low.some((c) => c.x === 'D'), `D 下限至少 3 條、含 D ≥ …（解析到 ${JSON.stringify(low)}）`);
    for (const { x, y, n } of low) {
      assert.ok(x in beats, `【D 下限】的 ${x} 在 script 裡沒有 const ${x} = P.at(…)`);
      const need = (y ? beats[y] : 0) + n;
      assert.ok(beats[x] + 1e-6 >= need, `${id}：${x} = ${beats[x]} < ${y ? `${y}(${beats[y]}) + ` : ''}${n}`);
    }
  });

  test(`${id}：id／class 加前綴 ${pre}-、CSS 全部在 #${id} 範圍內`, () => {
    for (const m of p.body.matchAll(/(?<![\w-])id="([^"]+)"/g)) assert.ok(m[1] === id || m[1].startsWith(`${pre}-`), `id 沒加前綴：${m[1]}`);
    for (const m of p.body.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) assert.ok(c.startsWith('sc-') || c === 'fill' || c.startsWith(`${pre}-`), `class 沒加前綴：${c}`);
    const rules = p.css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((x) => x.split('{')[0].trim()).filter(Boolean);
    assert.ok(rules.length > 3);
    for (const rule of rules) for (const sel of rule.split(',')) assert.ok(sel.trim().startsWith(`#${id}`), `選擇器沒加範圍：${sel}`);
  });

  test(`${id}：只用 SceneMotion 現有方法、不自己寫補間；0.5 秒前不動`, () => {
    const used = new Set([...p.code.matchAll(/\bP\.(\w+)\(/g)].map((m) => m[1]));
    assert.ok(used.has('at') && used.has('end'));
    for (const k of used) assert.match(MOTION, new RegExp(`\\b${k}: function|\\bP\\.${k} = `), `scene-motion.js 沒有 P.${k}`);   // P.region = REGION 這種直接指定也算
    assert.doesNotMatch(p.code, /gsap\.(to|from|fromTo|set)\(|\btl\.(to|from|fromTo|set)\(|setTimeout|Math\.random|requestAnimationFrame/);
    assert.doesNotMatch(p.css, /transition|animation/i, '無 CSS 動畫');
    // v2（design-system.md §13）：光暈、柔影、漸層只能用 --v2-* token，不寫字面值
    assert.doesNotMatch(p.css, /gradient\(|blur\(|drop-shadow\(/i, '漸層、模糊只能用 var(--v2-*)');
    for (const m of p.css.matchAll(/(?:^|[\s;{])((?:backdrop-)?filter|box-shadow)\s*:\s*([^;}]+)/g)) assert.match(m[2].trim(), /^(?:none|var\(--v2-[\w-]+\))$/, `${m[1]} 只能寫 none 或 var(--v2-*)：${m[2].trim()}`);
    // 每個 P.xxx(sel, at …) 的 at：數字、拍點常數或「常數 ± 數字／P.BEAT」
    const beats = constsOf(p);
    const ats = [];
    for (const m of p.code.matchAll(/\bP\.(?!at\b|end\b|dur\b|focus\b|swap\b|axis\b|sfx\b|spot\b)(\w+)\(\s*'[^']*'\s*,\s*([^,){]+)/g)) {
      const v = Function(...Object.keys(beats), 'P', `return ${m[2]}`)(...Object.values(beats), PCONST);
      assert.ok(Number.isFinite(v), `看不懂時間「${m[2]}」`);
      ats.push(v);
    }
    assert.ok(ats.length >= 5);
    // v2（BEATS.md §3「開場」）：主卡進場就是轉場，寫 const ENTER 的範例從 0 秒開始；其他照舊 0.5 秒前不動（build 的淡入）
    const v2Enter = /\bconst ENTER = (?:'(?:grow|swap)'|P\.prev\(\) === 'fullscreen' \? 'swap' : 'grow');/.test(p.code);   // 預設寫法（P.prev()），弱模型可手改成字面值
    assert.ok(Math.min(...ats) >= (v2Enter ? 0 : 0.5) - 1e-9, `最早的動畫在 ${Math.min(...ats)} 秒，${v2Enter ? '不能是負的' : '0.5 秒前不能動（build 的淡入）'}`);
  });

  test(`${id}：只用 token 顏色、不寫字型、座標整數 px、字級 ≥ 38`, () => {
    const css = p.css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css + p.body, /#[0-9a-fA-F]{3,8}\b(?![\w-])(?=[\s;,)"'])/, '有寫死的色碼');
    assert.doesNotMatch(css, /\brgba?\(|\bhsla?\(/);
    assert.doesNotMatch(css, /:\s*(white|black|red|yellow|blue|green)\b/i);
    assert.doesNotMatch(p.body, /style="[^"]*(color|background)/);
    assert.doesNotMatch(css, /font-family/);
    assert.doesNotMatch(css, /(?:^|[\s;{])(?:left|top|right|bottom|width|height|inset|margin[\w-]*|padding[\w-]*|gap|border(?:-[\w-]+)?)\s*:[^;]*\d\.\d+px/, '座標與尺寸一律整數 px（stroke-width 不算）');
    for (const m of p.body.matchAll(/class="[^"]*\bsc-t(\d+)\b/g)) assert.ok(Number(m[1]) >= 38, `字級 sc-t${m[1]} 低於標籤下限 38`);
  });

  test(`${id}：主卡右緣 ≤ 1300（避開子母畫面 x 1424 起）`, () => {
    const cid = card || `${pre}-card`;
    const box = p.css.match(new RegExp(`#${id} #${cid}\\s*\\{[^}]*\\}`));
    assert.ok(box, `找不到 #${cid}`);
    const left = Number(box[0].match(/left:\s*(\d+)px/)[1]), width = Number(box[0].match(/width:\s*(\d+)px/)[1]);
    assert.ok(left + width <= 1300, `主卡右緣 ${left + width} 超過 1300`);
  });

  test(`${id}：圖示是 icons.json 的原文（拿掉 class／width／height），每個都有 P.icon 描線`, () => {
    const icons = [...p.body.matchAll(/<span id="([^"]+)" class="[^"]*\bsc-icon\b[^"]*"[^>]*>(<svg[\s\S]*?<\/svg>)<\/span>/g)];
    if (noIcon) { assert.equal(icons.length, 0, '表上標 noIcon 的範例不放 .sc-icon'); assert.match(p.head, /這支沒有圖示/, '檔頭【要改的地方】要寫「這支沒有圖示」'); return; }
    assert.ok(icons.length >= 1, '概念要配圖示（R7.3 圖示先行）');
    assert.equal(icons.length, (p.body.match(/class="[^"]*\bsc-icon\b/g) || []).length, '每個 .sc-icon 都要有 id 並直接包 svg');
    const vals = Object.values(ICONS).map(norm);
    for (const [, iid, svg] of icons) {
      assert.ok(vals.includes(norm(svg)), `${iid} 的 svg 不是 icons.json 的原文`);
      assert.ok(p.code.includes(`#${iid}`), `${iid} 沒有被 P.icon 描線`);
    }
  });
}

test(`${COUNT} 支的句號區段互不重疊`, () => {
  const rs = Object.values(EXAMPLES).map((x) => x.range).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < rs.length; i++) assert.ok(rs[i][0] > rs[i - 1][1], `${rs[i - 1]} 和 ${rs[i]} 重疊`);
  assert.deepEqual(fs.readdirSync(CUSTOM).filter((f) => /^x-.*\.html$/.test(f)).map((f) => f.slice(0, -5)).sort(), Object.keys(EXAMPLES).sort(), 'custom/ 裡的範例和本表一致');
});

test('x-process：連接線用 data-links（n1>n2>n3>n4，kit/scene-layout.js 畫）、不手寫 path；彗星走產生的線本體（端點的 layout-link 第 7 條在整合測試量）', () => {
  const html = fs.readFileSync(path.join(CUSTOM, 'x-process.html'), 'utf8');
  const links = [...html.matchAll(/<svg[^>]*data-links="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links, ['xproc-n1>xproc-n2 xproc-n2>xproc-n3 xproc-n3>xproc-n4']);
  assert.doesNotMatch(html, /<path id="xproc-c\d"/, '連接線不再手寫 path（舊的 xproc-c1–c3）');
  const comets = [...html.matchAll(/P\.comet\('#([\w-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(comets, ['xproc-n1-xproc-n2', 'xproc-n2-xproc-n3', 'xproc-n3-xproc-n4']);
});

test(`index.html：④ 情境動畫分頁列出 ${COUNT} 支、#motion 沒有舊數字、音效清單排除 bgm`, () => {
  const html = fs.readFileSync(path.join(TEMPLATE, 'index.html'), 'utf8');
  assert.match(html, /<a href="#custom"><span class="n">④<\/span>情境動畫<\/a>/);
  const sec = html.match(/<section class="block" id="custom">([\s\S]*?)<\/section>/);
  assert.ok(sec, '要有 #custom 區塊');
  const ifr = [...sec[1].matchAll(/<iframe src="preview\/(x-[\w-]+)\.html"/g)].map((m) => m[1]).sort();
  assert.deepEqual(ifr, Object.keys(EXAMPLES).sort());
  assert.equal((sec[1].match(/版面：子母畫面/g) || []).length, COUNT);
  assert.doesNotMatch(html, /進場 0\.3–0\.5|露臉 3/);
  assert.match(html, /1 秒內新出現的元素 ≤ 2 個/);
  assert.doesNotMatch(html, /音效 12 種/);
  assert.match(html, /kind === 'bgm'/);
});

test('buildCustomPreview：template 內容原樣放進來、沒有 window.__cues、有 ?t= 與 hf-preview-ready／replay', () => {
  const html = fs.readFileSync(path.join(CUSTOM, 'x-process.html'), 'utf8');
  const out = buildCustomPreview({ name: 'x-process', html, pipStyle: { left: 1, top: 2, width: 300, height: 200 }, kitLinks: ['kit/brand.css'] });
  assert.ok(out.includes('data-cues-sample='));
  assert.ok(out.includes("window.__timelines['x-process'] = tl;"));
  assert.ok(out.includes('<link rel="stylesheet" href="../kit/brand.css">'));
  assert.ok(out.includes('../kit/scene-motion.js'));
  assert.doesNotMatch(out, /window\.__cues\s*=/);
  assert.match(out, /[?&]t=|URLSearchParams/);
  assert.ok(out.includes('hf-preview-ready') && out.includes('hf-preview-replay'));
  assert.throws(() => buildCustomPreview({ name: 'x-process', html: '<div></div>' }), /沒有 <template id="x-process-template">/);
  assert.throws(() => buildCustomPreview({ name: 'process', html }), /x-<名稱>/);
});

test('009 buildCustomPreview 直式（FR-073）：1080×1920 舞台、#scene 用 stage.fs 縮放、下半講者面板（pip.box、speaker-v.jpg 沒有就 speaker.jpg、pip-frame-v.png）、注入 window.__regions；橫式不變', async () => {
  const { CANVAS: C, stageTransform } = await imp('lib/canvas.mjs');
  const html = fs.readFileSync(path.join(CUSTOM, 'x-process.html'), 'utf8');
  const land = buildCustomPreview({ name: 'x-process', html, kitLinks: ['kit/brand.css'] });
  const out = buildCustomPreview({ name: 'x-process', html, kitLinks: ['kit/brand.css'], format: 'portrait' });
  const tr = stageTransform('fs', C.portrait), [px, py, pw, ph] = C.portrait.pip.box;
  assert.match(out, /#stage \{[^}]*width: 1080px; height: 1920px;/);
  assert.ok(out.includes(`#scene { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; z-index: 30; ${tr.css} }`));
  assert.ok(out.includes(`#pip { position: absolute; left: ${px}px; top: ${py}px; width: ${pw}px; height: ${ph}px;`));
  assert.ok(out.includes('src="../kit/pip-frame-v.png"') && out.includes('講者面板（示意）'));
  assert.ok(out.includes(`src="speaker-v.jpg" onerror="this.onerror=null;this.src='speaker.jpg'"`));
  assert.ok(out.includes(`window.__regions = ${JSON.stringify(C.portrait.regions)};`));
  assert.ok(out.includes('Math.min(window.innerWidth / 1080, window.innerHeight / 1920)'));
  assert.ok(out.includes("tl.fromTo('#bd, #scene, #pip, #pipf, #pv-label'"));
  // template 內容、父頁協定和橫式相同
  const body = (h) => h.slice(h.indexOf('<div id="scene">'), h.indexOf('<div id="pip">'));
  assert.equal(body(out).replace(/\s+/g, ' '), body(land).replace(/\s+/g, ' '));
  assert.ok(out.includes('hf-preview-ready') && out.includes('hf-preview-replay') && out.includes('URLSearchParams'));
  assert.ok(!land.includes('speaker-v.jpg') && !land.includes('__regions') && land.includes('#pip { position: absolute; left: 1424px; top: 594px;'));
  assert.throws(() => buildCustomPreview({ name: 'x-process', html, format: 'square' }), /format 只能是/);
});

// ---------- fx 字卡動態 40 張（003 r2）：宣告的變數都有用到、圖庫的「複製 plan 片段」照 plan.mjs 的寫法 ----------
const FXDIR = path.join(TEMPLATE, 'fx');
const FXCAT = JSON.parse(fs.readFileSync(path.join(FXDIR, 'catalog.json'), 'utf8'));
const KIT_VARS = new Set(['bg', 'accent']);   // bg 由 fx-kit 的 FXKit.setup 套、accent 由主色套，不在各檔程式裡讀
const fxDecl = (html) => JSON.parse(html.match(/data-composition-variables='([\s\S]*?)'/)[1]).map((v) => v.id);

test('fx 40 張：data-composition-variables 宣告的都有用到、程式讀的都有宣告（r1：fx 29 宣告 text 沒用、缺單位）', () => {
  assert.equal(FXCAT.effects.length, 40);
  const bad = [];
  for (const e of FXCAT.effects) {
    const html = fs.readFileSync(path.join(FXDIR, e.file), 'utf8');
    const decl = fxDecl(html);
    const code = (html.match(/<script>[\s\S]*?<\/script>/g) || []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
    assert.match(code, /const v = window\.__hyperframes\.getVariables\(\);/, `fx-${e.id}`);
    const used = new Set([...code.matchAll(/\bv\.(\w+)|\bv\[\s*['"](\w+)['"]\s*\]/g)].map((m) => m[1] || m[2]));
    for (const d of decl) if (!used.has(d) && !KIT_VARS.has(d)) bad.push(`fx-${e.id}：宣告了 ${d}，程式沒讀`);
    for (const u of used) if (!decl.includes(u)) bad.push(`fx-${e.id}：程式讀 v.${u}，沒有宣告`);
  }
  assert.deepEqual(bad, []);
  const f29 = fxDecl(fs.readFileSync(path.join(FXDIR, 'effects/fx-29-odometer.html'), 'utf8'));
  assert.deepEqual(f29.filter((x) => !KIT_VARS.has(x)), ['label', 'number', 'unit']);
});

test('fx catalog 的 done（完成態給截圖工具）：每張都有；時間軸上沒有補間的（fx 27 打字機）要用 label，檔裡有 tl.addLabel(\'done\'', () => {
  for (const e of FXCAT.effects) {
    assert.ok(['timeline', 'label'].includes(e.done), `fx-${e.id} 的 done 要是 "timeline" 或 "label"，現在是 ${JSON.stringify(e.done)}`);
    const code = fs.readFileSync(path.join(FXDIR, e.file), 'utf8');
    const tweens = (code.match(/\.(?:to|fromTo|from)\(/g) || []).length;
    if (!tweens) assert.equal(e.done, 'label', `fx-${e.id} 只有 tl.set，時間軸看不出完成態 → done 寫 "label" 並在檔裡 tl.addLabel('done', 秒數)`);
    if (e.done === 'label') assert.match(code, /tl\.addLabel\('done', /, `fx-${e.id}`);
  }
  assert.equal(FXCAT.effects.find((e) => e.id === '27').done, 'label');
});

test('fx 圖庫（fx/index.html）：複製的 plan 片段 vars 只有宣告過的欄位、bg 寫外層、不寫 accent；內嵌的程式碼和檔案相同', () => {
  const html = fs.readFileSync(path.join(FXDIR, 'index.html'), 'utf8');
  const unesc = (x) => x.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const cmds = [...html.matchAll(/data-act="copy" data-cmd="([^"]*)"/g)].map((m) => JSON.parse(unesc(m[1])));
  assert.equal(cmds.length, 40);
  for (const c of cmds) {
    const e = FXCAT.effects.find((x) => Number(x.id) === c.fx);
    assert.ok(e, `fx ${c.fx} 不在 catalog`);
    const decl = fxDecl(fs.readFileSync(path.join(FXDIR, e.file), 'utf8'));
    assert.equal(c.type, 'fx');
    for (const k of Object.keys(c.vars || {})) assert.ok(decl.includes(k) && !KIT_VARS.has(k), `fx ${c.fx} 的 vars.${k}：${KIT_VARS.has(k) ? '不用寫（plan.mjs 會 ✖）' : '沒有宣告'}`);
  }
  const data = JSON.parse(html.match(/<script type="application\/json" id="fx-data">([\s\S]*?)<\/script>/)[1]);
  for (const [id, v] of Object.entries(data.src)) assert.equal(v.code, fs.readFileSync(path.join(FXDIR, 'effects', v.name), 'utf8'), `fx ${id} 的「程式碼」和檔案不同`);
});

// ---------- 整合：全部排進同一個專案（spec FR-072；需要 ffmpeg 與 HyperFrames 的 Chrome） ----------
const has = (cmd, args) => { try { return spawnSync(cmd, args, { encoding: 'utf8' }).status === 0; } catch { return false; } };
const ffmpeg = has('ffmpeg', ['-version']);
const WS = path.resolve(TEMPLATE, '..', '..');
const node = (args, cwd = WS) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const stamp = (t) => { const ms = Math.round(t * 1000); const q = (n, w = 2) => String(n).padStart(w, '0'); return `${q(Math.floor(ms / 3600000))}:${q(Math.floor(ms / 60000) % 60)}:${q(Math.floor(ms / 1000) % 60)},${q(ms % 1000, 3)}`; };

// rough.srt 依 sample 產生：每支前面放一句開場（句號＝sample 第一句 − 1，不和綁句撞號；段從它開始），#N 起點＝段起點＋sample 秒數；
// @詞 放在句中：前面墊「嗯」（全形 1）或空白（半形 0.5），讓 build 照字數比例算出的時刻剛好 ≥ sample 的 refs（放句首會早到句首、拍點低於【D 下限】）
function cueText(n, word, a, b, ref) {
  const tail = `這一句是第 ${n} 句的字幕內容，用來對時間`;
  if (!word) return `第 ${n} 句字幕內容`;
  for (let j = 0; ; j++) {
    const pre = '嗯'.repeat(j >> 1) + (j & 1 ? ' ' : ''), text = pre + word + tail;
    if (a + textWidth(pre) / textWidth(text) * (b - a) >= ref - 1e-3) return text;
  }
}
function makeProject(dir, gap = 1.0) {
  for (const d of ['assets/camera', 'assets/voice', 'assets/screen', 'assets/images', 'work/hyperframes/compositions', 'output']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const srt = [], scenes = [], segs = [];
  let S = 1.0;
  for (const [k, [name]] of Object.entries(EXAMPLES).entries()) {
    const p = parse(name);
    const nums = Object.keys(p.sample.cues).map(Number).sort((a, b) => a - b);
    const wordOf = {};
    for (const ref of Object.keys(p.sample.refs || {})) { const m = ref.match(/^#(\d+)@(.+)$/); if (m) wordOf[m[1]] = m[2]; }
    const open = nums[0] - 1;
    srt.push({ a: S, b: S + p.sample.cues[nums[0]][0] - 0.3, text: `第 ${open} 句開場`, n: open });
    for (const [i, n] of nums.entries()) {
      const a = p.sample.cues[n][0], b = i === nums.length - 1 ? p.sample.D : p.sample.cues[n][1];
      srt.push({ n, a: S + a, b: S + b, text: cueText(n, wordOf[n], a, b, p.sample.refs?.[`#${n}@${wordOf[n]}`]) });
    }
    fs.copyFileSync(p.file, path.join(dir, 'work/hyperframes/compositions', `${name}.html`));
    const id = `x${String(k + 1).padStart(2, '0')}`;
    const seg = { id, type: 'custom', src: `compositions/${name}.html`, layout: 'fullscreen', from: `#${open}`, to: `#${nums[nums.length - 1]}e` };
    if (name === 'x-ui-mock') seg.clicks = ['#73@匯出'];
    scenes.push(seg);
    segs.push({ id, name, p, start: Math.round(S * 1000) / 1000 });
    S += p.sample.D + gap;
  }
  // 分鏡對齊（cli-003 §2.3d）：每支一張「#### 動畫分鏡 <段 id>」表，一個字串 P.at 一拍；動態欄寫 —（語彙另有單元測試）
  const HEAD = '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |\n|---|---|---|---|---|---|';
  fs.writeFileSync(path.join(dir, 'work/storyboard.md'), segs.map(({ id, p }) => {
    const rows = [...p.code.matchAll(/\bP\.at\(\s*'([^']+)'\s*(?:,\s*(-?[\d.]+)\s*)?\)/g)].map((m, k) => `| ${k + 1} | \`${m[1]}\`${m[2] && Number(m[2]) ? (Number(m[2]) > 0 ? `＋${m[2]}` : `−${-Number(m[2])}`) : ''} | 範例 | — | — | — |`);
    return `#### 動畫分鏡 ${id}\n\n${HEAD}\n${rows.join('\n')}\n`;
  }).join('\n'));
  fs.writeFileSync(path.join(dir, 'work/rough.srt'), srt.map((x) => `${x.n}\n${stamp(x.a)} --> ${stamp(x.b)}\n${x.text}\n`).join('\n'));   // 序號就是句號 #N（lib/srt.mjs）
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000',
    '-t', String(Math.ceil(S + 1)), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'work/rough.mp4')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  fs.writeFileSync(path.join(dir, 'work/cutpoints.json'), JSON.stringify({ cuts: [] }, null, 2));
  fs.writeFileSync(path.join(dir, 'work/hyperframes/plan.json'), JSON.stringify({ version: 1, speakerBox: [700, 200, 1220, 1000], look: { slim: 0 }, scenes }, null, 2));
  return segs;
}

const chrome = await hasChrome();
const md5 = (f) => spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'md5', '-'], { encoding: 'utf8' }).stdout.trim();

test(`整合：${COUNT} 支排進同一個專案 → --check 0 ✖ → build → audit 0 ✖、0 ⚠ → 亂序 snapshot 和照順序的一樣`, { skip: !(ffmpeg && chrome) && '需要 ffmpeg 與 HyperFrames 的 Chrome（npx hyperframes browser ensure）', timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-examples-'));
  tmps.push(dir);
  const segs = makeProject(dir);
  const BUILD = path.join(TEMPLATE, 'tools', 'build.mjs'), AUDIT = path.join(TEMPLATE, 'tools', 'audit.mjs');
  const chk = node([BUILD, '--project', dir, '--check']);
  assert.equal(chk.status, 0, chk.stdout + chk.stderr);
  assert.doesNotMatch(chk.stdout, /✖/, chk.stdout);
  const b = node([BUILD, '--project', dir]);
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const au = node([AUDIT, '--project', dir, '--json']);
  const r = JSON.parse(au.stdout);
  assert.equal(r.segments.length, COUNT);
  assert.deepEqual(r.findings.map((f) => `${f.level} ${f.id} ${f.rule} ${f.msg}`), [], '每支都要 0 ✖、0 ⚠');
  assert.equal(r.ok, true);
  // x-process 的 data-links 端點符合 layout-link（第 7 條）：完成態量 SceneLayout.measure，三條線兩端離站的外框 12（--sc-link-gap）、在邊中點 ±8
  const AB = await import(path.join(TEMPLATE, 'tools', 'lib', 'audit-browser.mjs'));
  const { judgeLayoutRules } = await import(path.join(TEMPLATE, 'tools', 'lib', 'audit-layout.mjs'));
  const xp = r.segments.find((sg) => /x-process\.html/.test(sg.label));
  const S = await AB.openSession({ dir: path.join(dir, 'work', 'hyperframes'), chrome: AB.findChrome({}), runtime: AB.findRuntime({}).file });
  try {
    await S.seek(xp.end - 0.6);
    const lay = JSON.parse(await S.evaluate(`JSON.stringify(window.SceneLayout.measure(document.getElementById('el-${xp.id}')))`));
    const rd = (p, b) => Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[2]), Math.max(b[1] - p[1], 0, p[1] - b[3]));
    assert.deepEqual(lay.links.map((k) => [k.id, Math.round(rd(k.pts[0], k.boxA)), Math.round(rd(k.pts.at(-1), k.boxB))]), [['xproc-n1-xproc-n2', 12, 12], ['xproc-n2-xproc-n3', 12, 12], ['xproc-n3-xproc-n4', 12, 12]]);
    assert.deepEqual(judgeLayoutRules(lay, { item: { id: xp.id }, t: 0 }).filter((f) => f.rule === 'layout-link'), []);
  } finally { await S.close(); }
  // segments[].motion（cli-003 §5）：units 是個數；marks、busy 是段內秒數
  for (const sg of r.segments) {
    const D = sg.end - sg.start;
    assert.equal(typeof sg.motion.units, 'number', sg.id);
    assert.ok(sg.motion.marks.length >= 2 && sg.motion.marks.every((m) => m.t >= 0 && m.t <= D), sg.id);
    assert.ok(sg.motion.busy.every(([a, b]) => a >= 0 && b <= D + 1e-6 && a <= b), `${sg.id} busy 要是段內秒數`);
  }
  // 亂序 snapshot（R7.6 第 3 步）：每支截完成態、第一拍 + 1、中間拍 + 1；亂序與照順序的截圖逐像素相同
  const times = [];
  for (const { start, p } of segs) {
    const bs = Object.values(beatsOf(p)).sort((x, y) => x - y);
    times.push(start + p.sample.D - 0.6, start + bs[0] + 1, start + bs[Math.floor(bs.length / 2)] + 1);
  }
  const ts = times.map((t) => Math.round(t * 100) / 100);
  const seq = [...ts].sort((x, y) => x - y), shuf = [...ts.filter((_, i) => i % 3 === 0).reverse(), ...ts.filter((_, i) => i % 3 !== 0)];
  const hf = path.join(dir, 'work', 'hyperframes');
  // 每次 snapshot 先截一格暖身（0.1 s，不比）：剛開的瀏覽器第一格的反鋸齒和之後的不同
  const WARM = 0.1;
  const snap = (at, out) => {
    const x = spawnSync('npx', ['hyperframes', 'snapshot', '--at', [WARM, ...at].join(','), '--no-end', '-o', out], { cwd: hf, encoding: 'utf8' });
    assert.equal(x.status, 0, x.stdout + x.stderr);
    return Object.fromEntries(fs.readdirSync(out).filter((f) => f.endsWith('.png')).map((f) => [f.match(/-at-([\d.]+)s\.png$/)[1], path.join(out, f)]).filter(([t]) => Number(t) !== WARM));
  };
  const A = snap(seq, path.join(dir, 'snap-seq')), B = snap(shuf, path.join(dir, 'snap-shuf'));
  assert.equal(Object.keys(A).length, ts.length);
  // 逐像素比：狀態錯（元素沒出現、位置或亮度不對）會有上千個色值不同；v2 聚焦放大過的圓角與光暈邊緣，Chrome 重畫時反鋸齒會差幾階（DOM 計算樣式完全相同），容許十萬分之一
  const rgb = (f) => spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 }).stdout;
  for (const t of Object.keys(A)) {
    if (md5(A[t]) === md5(B[t])) continue;
    const x = rgb(A[t]), y = rgb(B[t]);
    let bad = 0;
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 4) bad++;
    assert.ok(bad <= x.length * 1e-5, `${t}s：亂序 seek 和照順序 seek 的畫面不同（${bad} 個色值差 > 4，上限 ${Math.floor(x.length * 1e-5)}：只容許圓角、光暈邊緣的反鋸齒）`);
  }
});

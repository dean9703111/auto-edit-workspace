// 示意插圖元件（kit/illus.js、illus.css）與風格檢查（tools/lib/illus-lint.mjs）：node --test dev/tests/illus.test.mjs
//   - Node（vm）：20 個內建元件都產生 SVG、子元素 class 與狀態、只用 --il-* token、描邊 non-scaling、register 的規則
//   - lint：kit/illus-style.md 的範例要過；三個不合格樣本各自抓到該抓的規則
//   - 瀏覽器（HyperFrames 的 Chrome；沒有就略過）：真的載 scene.css＋theme.css＋brand.css＋illus.css 掛載，
//     兩個主題讀到的 fill／stroke 不同、主色跟著 --brand、data-illus-src 同步掛上、mount 不重掛
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { TEMPLATE, imp, hasChrome } from './helpers.mjs';

const KIT = path.join(TEMPLATE, 'kit');
const SRC = fs.readFileSync(path.join(KIT, 'illus.js'), 'utf8');
const CSS = fs.readFileSync(path.join(KIT, 'illus.css'), 'utf8');
const STYLE_MD = fs.readFileSync(path.join(KIT, 'illus-style.md'), 'utf8');
const { lintIllusSvg, IL_TOKENS } = await imp('lib/illus-lint.mjs');

// 元件表（和 specs/contracts/illus.md 同一份）：名稱 → [opts, viewBox 寬高, 子元素 class]
const PHONE_STATES = ['il-content', 'il-play', 'il-rec', 'il-check', 'il-warn', 'il-shorts', 'il-qr'];
const LAPTOP_STATES = ['il-content', 'il-play', 'il-rec', 'il-check', 'il-warn', 'il-app'];
const COMPONENTS = {
  phone: [{}, [120, 250], ['il-body', 'il-screen', ...PHONE_STATES]],
  tripod: [{}, [140, 180], ['il-legs', 'il-tripod-head']],
  phoneTripod: [{}, [140, 360], ['il-body', 'il-screen', ...PHONE_STATES, 'il-legs', 'il-tripod-head']],
  laptop: [{}, [280, 190], ['il-screen', ...LAPTOP_STATES]],
  monitor: [{}, [360, 300], ['il-screen', ...LAPTOP_STATES]],
  cloud: [{}, [220, 150], ['il-arrow']],
  personBust: [{}, [160, 170], ['il-head', 'il-talk']],
  personTop: [{}, [110, 72], ['il-head', 'il-face']],
  desk: [{}, [320, 150], ['il-desk', 'il-laptop']],
  cone: [{}, [304, 2 * 300 * Math.sin(25 * Math.PI / 180) + 4], ['il-cone']],
  waveform: [{}, [360, 90], ['il-bar']],
  progress: [{}, [320, 28], ['il-track', 'il-fill']],
  energy: [{}, [220, 90], ['il-body', 'il-cell']],
  fileVideo: [{}, [100, 120], ['il-play']],
  window: [{}, [480, 300], ['il-title', 'il-content']],
  searchBar: [{}, [640, 84], ['il-text', 'il-caret']],
  badge: [{}, [72, 72], ['il-badge']],
  recPill: [{}, [200, 60], ['il-dot', 'il-time', 'il-label']],
  stopwatch: [{}, [220, 240], ['il-hand', 'il-sweep', 'il-ticks']],
  bookmark: [{}, [220, 72], ['il-off', 'il-on']],
};
const NAMES = Object.keys(COMPONENTS);

function load() {
  const sb = { console };
  sb.window = sb;
  sb.document = { querySelectorAll: () => [] };   // 載入時的自動 mount：沒有元素
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  return sb.ILLUS;
}
const classesOf = (svg) => new Set([...svg.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
const groupOf = (svg, cls) => (svg.match(new RegExp(`<g class="${cls}"[^>]*>`)) || [null])[0];
const cssTokens = (block) => new Set([...block.matchAll(/(--il-[\w-]+)\s*:/g)].map((m) => m[1]));

test('20 個內建元件：都產生 SVG、viewBox＝建議尺寸、子元素 class 都在', () => {
  const I = load();
  const fns = Object.keys(I).filter((k) => typeof I[k] === 'function' && !['mount', 'register', 'textWidth'].includes(k));
  assert.deepEqual(fns.sort(), [...NAMES].sort(), '元件清單和契約不同（新增元件要一起改 specs/contracts/illus.md 與本測試）');
  for (const [name, [opts, [w, h], parts]] of Object.entries(COMPONENTS)) {
    const svg = I[name](opts);
    assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" class="il-svg" data-il="${name}" `), `${name} 不是 <svg> 開頭`);
    const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    assert.ok(vb, `${name} 沒有 viewBox`);
    assert.ok(Math.abs(+vb[1] - w) < 0.01 && Math.abs(+vb[2] - h) < 0.01, `${name} viewBox ${vb[1]}×${vb[2]}，期望 ${w}×${h}`);
    const cls = classesOf(svg);
    for (const c of parts) assert.ok(cls.has(c), `${name} 缺 .${c}`);
  }
  // 橫式與 opts 決定的尺寸
  assert.match(I.phone({ orient: 'landscape' }), /viewBox="0 0 250 120"/);
  assert.match(I.phoneTripod({ orient: 'landscape' }), /viewBox="0 0 260 300"/);
  assert.equal((I.waveform({ bars: 40 }).match(/class="il-bar"/g) || []).length, 40);
  assert.equal((I.energy().match(/class="il-cell"/g) || []).length, 5);
});

test('螢幕與開關狀態：指定的那個 opacity 1、其他 opacity 0', () => {
  const I = load();
  const on = (svg, cls) => { const g = groupOf(svg, cls); assert.ok(g, `缺 .${cls}`); return !/opacity:0/.test(g); };
  for (const [name, kinds] of [['phone', PHONE_STATES], ['phoneTripod', PHONE_STATES], ['laptop', LAPTOP_STATES], ['monitor', LAPTOP_STATES]]) {
    const map = { 'il-content': 'video', 'il-play': 'play', 'il-rec': 'rec', 'il-check': 'check', 'il-warn': 'warn', 'il-shorts': 'shorts', 'il-qr': 'qr', 'il-app': 'app' };
    for (const active of kinds) {
      const svg = I[name]({ screen: map[active] });
      for (const k of kinds) assert.equal(on(svg, k), k === active, `${name} screen=${map[active]}：.${k} 應該${k === active ? '亮' : '暗'}`);
    }
    for (const k of kinds) assert.equal(on(I[name]({}), k), false, `${name} 預設（blank）.${k} 應該暗`);
  }
  assert.equal(on(I.cloud({}), 'il-arrow'), false);
  assert.equal(on(I.cloud({ arrow: 'up' }), 'il-arrow'), true);
  assert.match(I.cloud({ arrow: 'down' }), /rotate\(180 110 91\)/);
  assert.equal(on(I.personBust({}), 'il-talk'), false);
  assert.equal(on(I.bookmark({ saved: true }), 'il-on'), true);
  assert.equal(on(I.bookmark({ saved: true }), 'il-off'), false);
  assert.equal(on(I.bookmark({}), 'il-on'), false);
  for (const k of ['check', 'cross', 'warn']) assert.ok(groupOf(I.badge({ kind: k }), 'il-badge'));
  assert.match(I.badge({ kind: 'cross' }), /fill="var\(--il-warn\)"/);
  assert.match(I.cone({ fill: true }), /fill="var\(--il-accent-soft\)"/);
  assert.match(I.cone({}), /class="il-cone" fill="none"/);
});

test('顏色只用 --il-* token（illus.css 亮暗兩組都有定義）；描邊都是 non-scaling（.il-sweep 例外）', () => {
  const I = load();
  const light = cssTokens(CSS.match(/:root\s*\{([\s\S]*?)\}/)[1]);
  const dark = cssTokens(CSS.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)[1]);
  assert.deepEqual([...light].sort(), [...IL_TOKENS].sort(), 'illus-lint 的 IL_TOKENS 要和 illus.css 的 :root 一致');
  for (const t of ['--il-body', '--il-inner', '--il-line', '--il-sub', '--il-alt']) assert.ok(dark.has(t), `暗色主題沒給 ${t}`);
  const all = [];
  for (const name of NAMES) for (const o of [{}, { orient: 'landscape', screen: 'play' }, { screen: 'warn' }, { color: 'yellow' }, { color: 'red' }, { kind: 'warn' }, { fill: true }, { tone: 'b' }, { saved: true }, { arrow: 'up' }]) all.push([name, I[name](o)]);
  for (const [name, svg] of all) {
    assert.doesNotMatch(svg, /#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/, `${name} 還有寫死的色碼`);
    for (const m of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
      const v = m[1];
      if (v === 'none') continue;
      const t = v.match(/^var\((--il-[\w-]+)\)$/);
      assert.ok(t && light.has(t[1]), `${name} 的顏色 ${v} 不是 illus.css 定義的 token`);
    }
    for (const m of svg.matchAll(/<(\w+)([^>]*\bstroke-width="[^"]+"[^>]*)>/g)) {
      if (/class="il-sweep"/.test(m[2])) continue;
      assert.match(m[2], /vector-effect="non-scaling-stroke"/, `${name} 的 <${m[1]}> 描邊沒有 non-scaling-stroke`);
      assert.match(m[2], /stroke-width="[234]"/, `${name} 的描邊寬不在 4／3／2：${m[2].match(/stroke-width="[^"]+"/)[0]}`);
    }
  }
  assert.match(I.stopwatch(), /class="il-sweep"[^>]*stroke="var\(--il-accent\)"/);
});

test('ILLUS.register：專案元件加得進來；不能蓋掉內建元件與方法、名稱要 camelCase', () => {
  const I = load();
  const fn = () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
  assert.equal(I.register('router', fn), I);
  assert.equal(I.router, fn);
  I.register('router', fn);   // 同一支 script 重跑：可以重新登記自己的元件
  for (const bad of ['phone', 'window', 'mount', 'register', 'textWidth']) assert.throws(() => I.register(bad, fn), /不能覆蓋/, `${bad} 應該被拒絕`);
  for (const bad of ['Router', 'my-router', '1router', '']) assert.throws(() => I.register(bad, fn), /camelCase/, `${bad} 應該被拒絕`);
  assert.throws(() => I.register('sdCard', '<svg/>'), /函式/);
});

// ---------- lint ----------
const ROUTER = STYLE_MD.match(/```svg\n([\s\S]*?)```/)[1];
const rules = (fs_) => fs_.map((f) => `${f.level}:${f.rule}`);

test('lint：illus-style.md 的 router 範例完全合格（含 4／3／2 描邊、狀態群組）', () => {
  assert.deepEqual(lintIllusSvg(ROUTER, { name: 'router', size: '220x120', states: ['led', 'warn'] }), []);
  assert.deepEqual(lintIllusSvg(ROUTER, { size: [220, 120] }), []);
  assert.deepEqual(lintIllusSvg(ROUTER, { size: { w: 220, h: 120 } }), []);
  // stroke-width 寫在 <g> 上會繼承；vector-effect 寫在形狀上
  const inherit = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" fill="none"><g stroke="var(--il-line)" stroke-width="3"><line x1="2" y1="2" x2="98" y2="48" vector-effect="non-scaling-stroke"/></g></svg>';
  assert.deepEqual(lintIllusSvg(inherit, { size: '100×50' }), []);
});

test('lint 不合格 1：寫死色碼、漸層', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <defs><linearGradient><stop offset="0" stop-color="#fff"/></linearGradient></defs>
  <rect x="2" y="2" width="96" height="96" rx="12" fill="#0B1020" stroke="var(--il-line)" stroke-width="4" vector-effect="non-scaling-stroke"/>
  <circle cx="50" cy="50" r="20" fill="var(--brand)"/>
  <path d="M10 10 L20 20" stroke="white" stroke-width="2" vector-effect="non-scaling-stroke"/>
</svg>`;
  const r = lintIllusSvg(svg, { name: 'box', size: '100x100' });
  const msgs = r.map((f) => f.msg).join('\n');
  assert.ok(rules(r).includes('error:illus-element'), msgs);
  assert.match(msgs, /<defs>/);
  assert.match(msgs, /fill="#0B1020" 不是 token/);
  assert.match(msgs, /fill="var\(--brand\)" 不是 token/, '只准 --il-*，連 --brand 也要經過 --il-accent');
  assert.match(msgs, /stroke="white" 不是 token/);
  assert.ok(r.every((f) => f.msg.startsWith('box：') && f.fix), '每則都有元件名與改法');
});

test('lint 不合格 2：描邊寬、沒有 non-scaling、文字、點陣、濾鏡屬性', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" fill="none">
  <rect x="2" y="2" width="116" height="56" rx="10" fill="var(--il-body)" stroke="var(--il-line)" stroke-width="5" vector-effect="non-scaling-stroke"/>
  <circle cx="20" cy="30" r="8" fill="var(--il-good)" stroke="var(--il-line)" stroke-width="3"/>
  <line x1="40" y1="30" x2="100" y2="30" stroke="var(--il-sub)"/>
  <text x="40" y="36" fill="var(--il-line)">路由器</text>
  <image href="router.png" width="10" height="10"/>
  <rect x="4" y="4" width="10" height="10" fill="var(--il-inner)" filter="url(#glow)" style="opacity:0;box-shadow:0 0 4px"/>
</svg>`;
  const r = lintIllusSvg(svg, { size: '120x60' });
  const msgs = r.map((f) => f.msg).join('\n');
  assert.match(msgs, /描邊寬 5 不在 4／3／2/);
  assert.match(msgs, /描邊寬 沒寫（預設 1）/);
  assert.match(msgs, /<circle> 沒寫 vector-effect/);
  assert.match(msgs, /不能用 <text>/);
  assert.match(msgs, /不能用 <image>/);
  assert.match(msgs, /不能寫 filter=/);
  assert.match(msgs, /style 不能寫 box-shadow/);
  assert.ok(r.every((f) => f.level === 'error'), msgs);
});

test('lint 不合格 3：viewBox 比例、缺狀態群組、id、狀態預設亮著、path 太細', () => {
  const pts = Array.from({ length: 50 }, (_, i) => `L${i * 4} ${i % 2 ? 10 : 20}`).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none">
  <rect id="body" x="2" y="2" width="196" height="196" rx="14" fill="var(--il-body)" stroke="var(--il-line)" stroke-width="4" vector-effect="non-scaling-stroke"/>
  <g class="il-warn"><circle cx="40" cy="40" r="7" fill="var(--il-warn)"/></g>
  <path d="M0 0 ${pts}" stroke="var(--il-sub)" stroke-width="2" vector-effect="non-scaling-stroke"/>
</svg>`;
  const r = lintIllusSvg(svg, { name: 'router', size: '220x120', states: ['led', 'warn'] });
  const msgs = r.map((f) => `${f.level} ${f.msg}`).join('\n');
  assert.match(msgs, /error router：viewBox 200×200 的比例 1\.00 和建議尺寸 220×120/);
  assert.match(msgs, /error router：缺狀態群組 <g class="il-led">/);
  assert.match(msgs, /error router：有 id="body"/);
  assert.match(msgs, /warn router：狀態群組 \.il-warn 預設不是 opacity 0/);
  assert.match(msgs, /warn router：有一條 path 用了 \d+ 個數字/);
  // 結構錯、不是 svg、viewBox 不從 0 0 開始
  assert.equal(lintIllusSvg('<svg viewBox="0 0 10 10"><g></svg>')[0].rule, 'illus-parse');
  assert.equal(lintIllusSvg('<div></div>')[0].rule, 'illus-root');
  assert.ok(rules(lintIllusSvg('<svg viewBox="5 5 10 10"><rect width="4" height="4" fill="var(--il-body)"/></svg>')).includes('error:illus-viewbox'));
  // 比例對但不是 1:1 → 只有 ⚠
  assert.deepEqual(rules(lintIllusSvg(ROUTER.replace('viewBox="0 0 220 120"', 'viewBox="0 0 220 120"'), { size: '440x240' })), ['warn:illus-size']);
});

// ---------- 瀏覽器：真的套 CSS、切主題、data-illus-src ----------
const chrome = await hasChrome();
const run = (args, timeout = 60000) => new Promise((resolve, reject) => {
  const cp = spawn(chrome, args);
  let out = '', err = '';
  const t = setTimeout(() => { cp.kill(); reject(new Error(`Chrome 超過 ${timeout / 1000}s`)); }, timeout);
  cp.stdout.on('data', (d) => { out += d; });
  cp.stderr.on('data', (d) => { err += d; });
  cp.on('error', (e) => { clearTimeout(t); reject(e); });
  cp.on('exit', (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(`Chrome exit ${code}：${err.slice(-400)}`)); });
});

test('瀏覽器：兩個主題讀到的 fill／stroke 不同、主色跟 --brand、data-illus-src 同步掛上、mount 不重掛', { skip: !chrome && '找不到 HyperFrames 的 Chrome（npx hyperframes browser ensure）', timeout: 120000 }, async () => {
  const { startServer } = await imp('lib/audit-browser.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'illus-test-'));
  const { server, port } = await (async () => {
    for (const f of ['scene.css', 'theme.css', 'brand.css', 'illus.css', 'illus.js']) fs.copyFileSync(path.join(KIT, f), path.join(dir, f));
    fs.mkdirSync(path.join(dir, 'illus-local'));
    fs.writeFileSync(path.join(dir, 'illus-local', 'router.svg'), `<?xml version="1.0" encoding="UTF-8"?>\n${ROUTER}`);
    const cells = NAMES.map((n) => `<div id="c-${n}" data-illus="${n}" style="width:${COMPONENTS[n][1][0]}px;height:${Math.round(COMPONENTS[n][1][1])}px"></div>`).join('\n');
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="scene.css"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="brand.css"><link rel="stylesheet" href="illus.css">
<style>html,body{width:auto;height:auto;overflow:visible}</style>
<script>window.__errs = []; console.error = function () { window.__errs.push([].slice.call(arguments).join(' ')); };</script></head><body>
${cells}
<div id="c-play" data-illus="phone" data-screen="play" style="width:120px;height:250px"></div>
<div id="r" data-illus-src="illus-local/router.svg" style="width:220px;height:120px"></div>
<div id="r2" data-illus-src="illus-local/router.svg" style="width:110px;height:60px"></div>
<div id="miss" data-illus-src="illus-local/nope.svg" style="width:50px;height:50px"></div>
<script src="illus.js"></script>
<script>
(function () {
  var out = { names: ${JSON.stringify(NAMES)}, comps: {} };
  // 1. 同步：illus.js 載入後、還沒有任何 await，data-illus-src 已經掛上
  out.src = { svg: !!document.querySelector('#r > svg'), led: !!document.querySelector('#r .il-led'), warn: !!document.querySelector('#r .il-warn'),
    il: document.getElementById('r').classList.contains('il'), r2: !!document.querySelector('#r2 .il-led'), missEmpty: document.getElementById('miss').innerHTML === '' };
  var paint = function (root) { return [].map.call(root.querySelectorAll('svg *'), function (n) { var c = getComputedStyle(n); return c.fill + '/' + c.stroke; }).join(';'); };
  var read = function () {
    var o = {};
    out.names.forEach(function (n) { var el = document.getElementById('c-' + n), svg = el.querySelector('svg'), bb = svg ? svg.getBBox() : null;
      o[n] = { svg: !!svg, il: el.classList.contains('il'), w: bb ? bb.width : 0, h: bb ? bb.height : 0, paint: paint(el) }; });
    var q = function (sel, p) { var e = document.querySelector(sel); return e ? getComputedStyle(e)[p] : null; };
    o.body = q('#c-phone .il-body', 'fill'); o.line = q('#c-phone .il-body', 'stroke'); o.inner = q('#c-phone .il-screen', 'fill');
    o.accent = q('#c-personTop .il-face', 'fill'); o.onAccent = q('#c-play .il-play polygon', 'fill'); o.fileTri = q('#c-fileVideo .il-play', 'fill');
    o.warn = q('#c-recPill .il-dot', 'fill'); o.good = q('#c-energy .il-cell', 'fill'); o.routerLed = q('#r .il-led circle', 'fill');
    o.routerBody = q('#r .il-body', 'fill'); o.font = q('#c-recPill .il-label', 'fontFamily');
    // 來源 token 的計算值（illus.css 接到哪個 token，就該讀到一樣的顏色）
    var probe = document.createElement('i'); document.body.appendChild(probe);
    o.tok = {};
    ['--sc-card-solid', '--sc-plate', '--sc-ink', '--v2-ink', '--brand', '--brand-ink', '--sc-warn', '--sc-good'].forEach(function (t) { probe.style.color = 'var(' + t + ')'; o.tok[t] = getComputedStyle(probe).color; });
    probe.remove();
    return o;
  };
  out.light = read();
  document.documentElement.setAttribute('data-theme', 'dark');
  out.dark = read();
  out.brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
  // 2. mount 不重掛（別段已綁好的 tween 不會失效）；force 才重畫
  var a = document.querySelector('#c-phone svg'), s1 = document.querySelector('#r svg');
  ILLUS.mount();
  out.idem = a === document.querySelector('#c-phone svg') && s1 === document.querySelector('#r svg');
  ILLUS.mount(document.getElementById('c-phone').parentNode, { force: true });
  out.forced = a !== document.querySelector('#c-phone svg');
  // 3. register 之後，後來插進文件的 data-illus 掛得上（子合成的做法：mount 自己的 root）
  ILLUS.register('dot', function (o) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle class="il-dot" cx="5" cy="5" r="4" fill="var(--il-good)"/></svg>'; });
  var host = document.createElement('div'); host.innerHTML = '<div id="d" data-illus="dot" style="width:10px;height:10px"></div><div id="p2" data-illus="phone" data-screen="rec"></div>';
  document.body.appendChild(host); ILLUS.mount(host);
  out.reg = !!document.querySelector('#d .il-dot') && !!document.querySelector('#p2 .il-rec');
  out.errs = window.__errs;
  var pre = document.createElement('pre'); pre.id = 'out'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
})();
</script></body></html>`);
    return startServer(dir, path.join(dir, 'illus.js'));
  })();
  try {
    const dom = await run(['--headless', '--no-first-run', `--user-data-dir=${path.join(dir, 'u')}`, '--dump-dom', `http://127.0.0.1:${port}/index.html`]);
    const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
    assert.ok(m, `頁面沒有跑完：${dom.slice(-500)}`);
    const out = JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    for (const n of NAMES) {
      for (const th of ['light', 'dark']) {
        const c = out[th][n];
        assert.ok(c.svg && c.il, `${n}（${th}）沒有掛上 svg`);
        assert.ok(c.w > 0 && c.h > 0, `${n}（${th}）的 svg 沒有大小`);
      }
      // 每個元件在兩個主題下讀到的顏色要不同；cone 只用主色（兩個主題相同，照設計）
      if (n === 'cone') assert.equal(out.light[n].paint, out.dark[n].paint);
      else assert.notEqual(out.light[n].paint, out.dark[n].paint, `${n} 兩個主題的 fill／stroke 一樣`);
    }
    const L = out.light, D = out.dark;
    // 亮色：主體＝--sc-card-solid、內層＝--sc-plate、描邊＝--sc-ink；暗色：主體＝--sc-card-solid（暗色值）、描邊＝--v2-ink、內層自己的石墨色
    assert.deepEqual([L.body, L.inner, L.line], [L.tok['--sc-card-solid'], L.tok['--sc-plate'], L.tok['--sc-ink']], '亮色主體／內層／描邊要接到 scene.css／theme.css 的 token');
    assert.deepEqual([D.body, D.line, D.inner], [D.tok['--sc-card-solid'], D.tok['--v2-ink'], 'rgb(38, 42, 51)'], '暗色主體／描邊要接到暗色 token，內層是 illus.css 的 #262A33');
    const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
    assert.ok(lum(L.body) < 0.15 && lum(L.inner) < 0.2 && lum(L.line) > 0.9, `亮色主題元件本體仍是深色、描邊白（${L.body}、${L.inner}、${L.line}）`);
    assert.ok(lum(D.body) < 0.15 && lum(D.line) > 0.85, `暗色主題：深色本體、淺描邊（${D.body}、${D.line}）`);
    for (const [th, o] of [['light', L], ['dark', D]]) {
      assert.equal(o.accent, o.tok['--brand'], `${th}：重點色要是 --brand`);
      assert.equal(o.onAccent, o.tok['--brand-ink'], `${th}：主色底上的符號要是 --brand-ink`);
      assert.equal(o.fileTri, o.tok['--brand'], `${th}：fileVideo 的播放三角是主色`);
      assert.equal(o.warn, o.tok['--sc-warn']);
      assert.equal(o.good, o.tok['--sc-good']);
      assert.equal(o.routerLed, o.tok['--sc-good'], 'data-illus-src 的 SVG 也吃 token');
    }
    assert.notEqual(out.light.routerBody, out.dark.routerBody);
    assert.deepEqual(out.src, { svg: true, led: true, warn: true, il: true, r2: true, missEmpty: true });
    assert.equal(out.idem, true, 'ILLUS.mount() 再跑一次不能換掉已經掛好的元素');
    assert.equal(out.forced, true, '{force:true} 要重畫');
    assert.equal(out.reg, true, 'register 的元件與後插入的 data-illus 要掛得上');
    // 讀不到的檔：載入時報一次；之後 mount() 不重報，{force:true} 重試再報一次
    assert.equal(out.errs.length, 2, `只有讀不到的那個檔要報錯：${JSON.stringify(out.errs)}`);
    for (const e of out.errs) assert.match(e, /\[ILLUS\] 讀不到 data-illus-src="illus-local\/nope\.svg"/);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

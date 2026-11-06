// 動態語彙（scene-motion.js）：在 Node 裡用真的 GSAP seek（含 suppressEvents＝true、往回 seek、起點之前）驗數值
//   - v3：P.morph／push／count／bar
//   - 綁句：P.at／P.dur／P.end()／P.marks（specs/contracts/cues.md v1 §6 的向量＋003 補充 E1–E6）
//   - P.focus（亂序 seek 和順序 seek 一致、出場從目前亮度開始）、P.type（DOM shim，只實作 spec FR-019 的 API）
//   範例檔（custom/x-*.html）的結構檢查在 examples.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { TEMPLATE } from './helpers.mjs';

const KIT = path.join(TEMPLATE, 'kit');
const MOTION_SRC = fs.readFileSync(path.join(KIT, 'scene-motion.js'), 'utf8');

// ---------- 在 Node 載入真的 GSAP 與 scene-motion.js（不需要瀏覽器；目標用普通物件）----------
const gsap = createRequire(path.join(KIT, 'x.js'))('./gsap.min.js').gsap;
gsap.timeline();   // 先喚醒內建 plugin（之後才有 window／document 的替身，免得 CSSPlugin 去呼叫 createElement）
// 這個測試檔是獨立的 Node 行程：把 gsap／window／document 掛在 globalThis 後直接執行 scene-motion.js
// （GSAP 的 lazy render 要有 window 才會在第一次 seek 時 flush，和瀏覽器行為一致）
Object.assign(globalThis, { gsap, window: globalThis, document: { querySelectorAll: () => [] } });
vm.runInThisContext(MOTION_SRC);
const mk = (root) => { const tl = gsap.timeline({ paused: true }); return { tl, P: globalThis.SceneMotion(tl, root) }; };
const seek = (tl, t, suppress) => tl.totalTime(t, suppress);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} 實際 ${a}，期望 ${b}`);

test('scene-motion：API 與常數存在，開頭 API 註解有記錄', () => {
  const { P } = mk();
  for (const k of ['morph', 'push', 'count', 'bar', 'at', 'dur', 'focus', 'type']) {
    assert.equal(typeof P[k], 'function', `缺 P.${k}`);
    assert.ok(MOTION_SRC.includes(`P.${k}(`), `開頭註解沒記錄 P.${k}`);
  }
  assert.ok(MOTION_SRC.includes('P.end()'), '開頭註解沒記錄 P.end()（不帶參數）');
  assert.ok(Array.isArray(P.marks));
  assert.doesNotMatch(MOTION_SRC, /T\.at\(句號\)/, '舊的「綁講解時傳 T.at(句號)」要刪掉');
  assert.deepEqual([P.MORPH, P.ZOOM, P.COUNT, P.BAR], [0.7, 2.4, 1.2, 0.8]);
  for (const c of ['P.MORPH', 'P.ZOOM', 'P.COUNT', 'P.BAR']) assert.ok(MOTION_SRC.includes(c), `常數註解沒寫 ${c}`);
  for (const k of ['in', 'out', 'swap', 'sideIn', 'sideOut', 'end', 'drift', 'reveal', 'rise', 'maskUp', 'axis', 'stroke', 'icon', 'check']) assert.equal(typeof P[k], 'function', `既有方法 P.${k} 不見了`);
});

test('scene-motion：不加 will-change、不用 Math.random／setTimeout／CSS transition／repeat', () => {
  const code = MOTION_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /will-?change|Math\.random|setTimeout|requestAnimationFrame|transition\s*:|repeat\s*:|yoyo/i);
  assert.match(code, /force3D: false/, '鏡頭推進要帶 force3D:false');
});

test('P.count：任意時間點 seek 數字正確（含 suppressEvents、往回 seek、起點之前與之後）', () => {
  for (const suppress of [true, false]) {
    const { tl, P } = mk();
    const el = { style: {}, textContent: 'x' };
    P.count(el, 1, { from: 0, to: 28, dur: 2, suffix: ' 段', ease: 'none' });
    P.end(8);
    const at = (t) => { seek(tl, t, suppress); return el.textContent; };
    assert.equal(at(0.2), '0 段');
    assert.equal(at(0.99), '0 段');
    assert.equal(at(2), '14 段');
    assert.equal(at(3), '28 段');
    assert.equal(at(7), '28 段');
    assert.equal(at(1.5), '7 段');
    assert.equal(at(0.2), '0 段');
    assert.equal(at(2.5), '21 段');
    assert.equal(at(0), '0 段');
    assert.equal(el.style.fontVariantNumeric, 'tabular-nums', '數字要用 tabular-nums 免得抖動');
  }
});

test('P.count：小數、前後綴、千分位；同一元素接續兩段計數', () => {
  const { tl, P } = mk();
  const a = { style: {}, textContent: '' }, b = { style: {}, textContent: '' };
  P.count(a, 0, { from: 0, to: 12.5, dur: 1, decimals: 1, prefix: '$', suffix: 'M', ease: 'none' });
  P.count(b, 0, { from: 0, to: 20, dur: 1, ease: 'none' });
  P.count(b, 1, { from: 20, to: 32, dur: 1, ease: 'none' });
  P.end(4);
  seek(tl, 0.001, true); assert.equal(a.textContent, '$0.0M'); assert.equal(b.textContent, '0');
  seek(tl, 0.5, true); assert.equal(a.textContent, '$6.3M'); assert.equal(b.textContent, '10');
  seek(tl, 1.5, true); assert.equal(b.textContent, '26');
  seek(tl, 3, true); assert.equal(a.textContent, '$12.5M'); assert.equal(b.textContent, '32');
  seek(tl, 0.5, true); assert.equal(b.textContent, '10');
  const c = { style: {}, textContent: '' };
  const m = mk();
  m.P.count(c, 0, { from: 0, to: 1234567, dur: 1, comma: true, ease: 'none' }); m.P.end(2);
  seek(m.tl, 1, true); assert.equal(c.textContent, '1,234,567');
});

test('P.morph：帶 from 時任何時間點 seek 都對；預設 0.7s power2.inOut 不過衝', () => {
  const { tl, P } = mk();
  const box = { width: 620, height: 300 };
  P.morph(box, 1, { height: 480 }, { from: { height: 620 }, dur: 1, ease: 'none' });
  P.morph(box, 3, { height: 100 }, { from: { height: 480 }, dur: 1, ease: 'none' });
  P.end(6);
  const h = (t) => { seek(tl, t, true); return box.height; };
  assert.equal(h(0.2), 620);
  assert.equal(h(1.5), 550);
  assert.equal(h(2.5), 480);
  assert.equal(h(3.5), 290);
  assert.equal(h(5), 100);
  assert.equal(h(1.5), 550);
  assert.equal(h(0.5), 620);
  assert.equal(box.width, 620, '沒列在 to 的屬性不動');
  // 預設：0.7s、power2.inOut，全程介於起訖之間（不過衝），中點剛好一半
  const m = mk(); const b2 = { width: 100 };
  m.P.morph(b2, 0, { width: 200 }, { from: { width: 100 } }); m.P.end(2);
  let prev = 100;
  for (let t = 0; t <= 1; t += 0.01) { seek(m.tl, t, true); assert.ok(b2.width >= prev - 1e-9 && b2.width <= 200, `t=${t.toFixed(2)} 寬 ${b2.width}`); prev = b2.width; }
  seek(m.tl, 0.35, true); near(b2.width, 150, '中點');
  seek(m.tl, 0.7, true); assert.equal(b2.width, 200);
  // 傳 ease 時照傳的
  const n = mk(); const b3 = { width: 100 };
  n.P.morph(b3, 0, { width: 200 }, { from: { width: 100 }, ease: 'back.out(1.15)' }); n.P.end(2);
  let peak = 0; for (let t = 0; t <= 1; t += 0.01) { seek(n.tl, t, true); peak = Math.max(peak, b3.width); }
  assert.ok(peak > 200, '自己傳 back.out 才會過衝');
});

test('P.push／P.bar：預設值與可超過 1（撐破）、往回 seek', () => {
  const { tl, P } = mk();
  const cam = {}, bar = {};
  P.push(cam, 1, { ease: 'none' });
  P.bar(bar, 1, { to: 1.5, dur: 1, ease: 'none' });
  P.end(8);
  seek(tl, 0.2, true); assert.equal(Number(cam.scale), 1); assert.equal(Number(bar.scaleX), 0);
  seek(tl, 1 + 1.2, true); assert.ok(Math.abs(cam.scale - 1.2) < 1e-9, `scale ${cam.scale}`);
  seek(tl, 2, true); assert.equal(bar.scaleX, 1.5);
  seek(tl, 7, true); assert.equal(cam.scale, 1.4);
  seek(tl, 1.5, true); assert.equal(bar.scaleX, 0.75);
  seek(tl, 0.2, true); assert.equal(Number(cam.scale), 1); assert.equal(Number(bar.scaleX), 0);
  assert.equal(cam.transformOrigin, '50% 50%');
  assert.equal(bar.transformOrigin, '0% 50%', '量條以左緣為原點');
});

test('既有方法行為不變：P.in／P.rise 的起點與終點值', () => {
  const { tl, P } = mk();
  const a = {}, b = {};
  P.in(a, 1); P.rise(b, 1); P.end(4);
  seek(tl, 0.2, true); assert.equal(Number(a.opacity), 0); assert.equal(Number(b.opacity), 0); assert.equal(Number(b.y), 8);
  seek(tl, 3, true); assert.equal(Number(a.opacity), 1); assert.equal(Number(b.opacity), 1); assert.equal(Number(b.y), 0);
  seek(tl, 0.5, true); assert.equal(Number(a.opacity), 0);
});

test('時間 < 0 當 0：綁句太早時 T - 0.9 變負，不會把前面排好的動畫往後推（P.tl 是原本的時間軸）', () => {
  const { tl, P } = mk();
  const a = {}, b = {};
  P.in(a, 1); P.in(b, -0.9); P.end(4);
  assert.equal(P.tl, tl);
  assert.equal(tl.getTweensOf(a)[0].startTime(), 1, '先排的不被推到 1.9');
  assert.equal(tl.getTweensOf(b)[0].startTime(), 0);
  assert.equal(tl.duration(), 4);
});

// ---------- 綁句：cues.md v1 §6 ----------
const CUES = { v: 1, cues: { 17: [40, 42.9], 18: [43.2, 45.6] },
  segs: { x01: { comp: 'x-process', start: 40, D: 14.5, refs: { '#18': 43.2, '#18@逐字稿': 44.4 } } } };
const SAMPLE = '{"start":40,"D":14.5,"cues":{"17":[40,42.9],"18":[43.2,45.6],"19":[46.2,48.4],"20":[49.2,51.8]}}';
// root 替身：getAttribute＋closest（有 host 時回 host）
const rootShim = ({ attrs = {}, host = null } = {}) => ({
  getAttribute: (k) => (k in attrs ? attrs[k] : null),
  closest: () => host,
  querySelectorAll: () => [],
});
const HOST = { id: 'el-x01' };
const fresh = (cues) => { delete globalThis.__cueErrors; if (cues) globalThis.__cues = structuredClone(cues); else delete globalThis.__cues; };
const errs = () => globalThis.__cueErrors || [];
const R2 = '「@詞」沒有被 build 預先算到 → 把 ref 寫成字串字面值 P.at(\'#N@詞\')，再跑 build';
const R3 = '找不到 window.__cues 也沒有 data-cues-sample → 用 build 產生的 index.html 看，或在 root 加 data-cues-sample';

test('P.at：cues.md §6 向量 #1–#11（注入的 window.__cues）', () => {
  fresh(CUES);
  const { tl, P } = mk(rootShim({ attrs: { 'data-composition-id': 'x-process', 'data-duration': '9' }, host: HOST }));
  const rows = [
    [['#18'], 3.2], [['#18', 0.2], 3.4], [['#18e'], 5.6], [['#18-0.3'], 2.9], [['#18@逐字稿'], 4.4],
    [['#17', -0.5], 0], [[3], 3],
  ];
  for (const [args, want] of rows) assert.equal(P.at(...args), want, `P.at(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  assert.deepEqual(errs(), [], '#1–#7 不推錯誤');
  assert.equal(P.at('#99'), 0);
  assert.deepEqual(errs(), ["x01 P.at('#99')：字幕沒有第 99 句（window.__cues 有 2 句）"]);
  assert.equal(P.at('#18@沒算到'), 0);
  assert.equal(errs()[1], `x01 P.at('#18@沒算到')：${R2}`);
  assert.equal(P.dur(), 14.5, '#10 注入的 D 優先於 root 的 data-duration');
  P.end();
  assert.equal(tl.duration(), 14.5, '#11 P.end() 不帶參數＝段長');
});

test('P.at：#12 預覽頁讀 data-cues-sample；#13 都沒有時回 0 並推第 3 種原因', () => {
  fresh();
  const a = mk(rootShim({ attrs: { 'data-composition-id': 'x-process', 'data-cues-sample': SAMPLE } }));
  assert.equal(a.P.at('#18'), 3.2);
  assert.equal(a.P.at('#20e'), 11.8);
  assert.equal(a.P.dur(), 14.5);
  assert.deepEqual(errs(), []);
  // 有 host 但 __cues 裡沒有這段 → 也走 sample
  globalThis.__cues = structuredClone(CUES);
  const a2 = mk(rootShim({ attrs: { 'data-composition-id': 'x-process', 'data-cues-sample': SAMPLE }, host: { id: 'el-x09' } }));
  assert.equal(a2.P.at('#19'), 6.2);
  fresh();
  const b = mk(rootShim({ attrs: { 'data-composition-id': 'x-process' } }));
  assert.equal(b.P.at('#18'), 0);
  assert.equal(b.P.at('#18', 0.4), 0.4, '退路回 max(0, off)');
  assert.deepEqual(errs(), [`x-process P.at('#18')：${R3}`]);
});

test('P.at：003 補充 E1–E6（型別錯丟錯、dur 退路、錯誤去重、marks）', () => {
  fresh(CUES);
  const root = rootShim({ attrs: { 'data-composition-id': 'x-process' }, host: HOST });
  const { P } = mk(root);
  assert.throws(() => P.at({}), (e) => e.message === "P.at 要傳句號字串或秒數，例如 P.at('#21')、P.at('#21@剪輯清單', 0.2)、P.at(3.2)；現在是 object");
  assert.throws(() => P.at('#18', NaN), (e) => e.message === "P.at('#18', NaN)：第二個參數要是秒數（數字），例如 0.2");
  assert.throws(() => P.at('#18', '0.2'), /第二個參數要是秒數/);
  // E5：同一則只推一次
  P.at('#99'); P.at('#99');
  assert.equal(errs().length, 1);
  // E3／E4：dur 退路
  fresh();
  assert.equal(mk(rootShim({ attrs: { 'data-composition-id': 'x-process', 'data-duration': '9' } })).P.dur(), 9);
  const none = mk(rootShim({ attrs: { 'data-composition-id': 'x-process' } }));
  assert.equal(none.P.dur(), 0);
  assert.deepEqual(errs(), ['x-process P.dur()：找不到 window.__cues、data-cues-sample，root 也沒有 data-duration → 用 build 產生的 index.html 看，或在 root 寫 data-duration']);
  // E6：marks
  fresh(CUES);
  const m = mk(root);
  m.P.at('#18'); m.P.at(5); m.P.at('#17', -0.5);
  assert.deepEqual(m.P.marks, [{ ref: '#18', t: 3.2 }, { ref: 5, t: 5 }, { ref: '#17', t: 0 }]);
  assert.equal(globalThis.SceneMotion.marks['x-process'], m.P.marks);
  mk(root);
  assert.deepEqual(globalThis.SceneMotion.marks['x-process'], [], '重建 SceneMotion 後換新陣列');
  // HyperFrames 掛載後會拿掉 root 的 data-composition-id：改用 host 上的、再不行用注入段的 comp（audit 讀 marks 要對得到）
  const hostOnly = mk(rootShim({ host: { id: 'el-x01', getAttribute: (k) => (k === 'data-composition-id' ? 'x-process' : null) } }));
  hostOnly.P.at('#18');
  assert.deepEqual(globalThis.SceneMotion.marks['x-process'], [{ ref: '#18', t: 3.2 }]);
  const segOnly = mk(rootShim({ host: HOST }));
  segOnly.P.at(2);
  assert.deepEqual(globalThis.SceneMotion.marks['x-process'], [{ ref: 2, t: 2 }], '注入段的 comp');
  // data-cues-sample 壞掉 → 建立時丟錯（audit 報 script ✖）
  fresh();
  assert.throws(() => mk(rootShim({ attrs: { 'data-composition-id': 'x-process', 'data-cues-sample': '{start:0' } })), /data-cues-sample 不是合法的 JSON（.+）；格式照 cues.md §5/);
  // 沒傳 root（舊寫法）照樣能用數字
  assert.equal(mk().P.at(2.5, 0.5), 3);
  fresh();
});

// ---------- P.focus ----------
const ITEM = (id) => { const ring = { opacity: 1 }; return { id, opacity: 1, ring, querySelector: () => ring }; };
const focusScene = () => {
  const { tl, P } = mk();
  const items = [ITEM('r1'), ITEM('r2'), ITEM('r3')];
  P.rise(items, 0.5, { stagger: 0.5 });
  P.focus(items, items[0], 3, { ring: '.on' });
  P.focus(items, items[1], 6, { ring: '.on' });
  P.focus(items, null, 9, { ring: '.on' });
  P.out(items[1], 11);
  P.end(13);
  return { tl, items };
};
const readFocus = ({ items }) => items.flatMap((x) => [Number(x.opacity), Number(x.ring.opacity)]).map((v) => Math.round(v * 1e6) / 1e6);

test('P.focus：亂序 seek 和順序 seek 結果相同，數值照預期', () => {
  const T = [0, 2, 3.2, 3.5, 6.2, 7, 9.2, 10, 11, 11.2, 12];
  const seq = focusScene(), want = {};
  for (const t of T) { seek(seq.tl, t, true); want[t] = readFocus(seq); }
  const shuffled = [7, 0, 12, 3.5, 11.2, 2, 9.2, 6.2, 10, 3.2, 11, 7, 0];
  const s = focusScene();
  for (const t of shuffled) { seek(s.tl, t, true); assert.deepEqual(readFocus(s), want[t], `t=${t}`); }
  // 預期值：[r1, 框1, r2, 框2, r3, 框3]
  assert.deepEqual(want[0], [0, 0, 0, 0, 0, 0], '進場前全 0（框第一次被碰到就設 0，CSS 不用先藏）');
  assert.deepEqual(want[2], [1, 0, 1, 0, 1, 0]);
  assert.deepEqual(want[3.2], [1, 0.5, 0.7, 0, 0.7, 0], '0.4s sine.inOut 的中點');
  assert.deepEqual(want[3.5], [1, 1, 0.4, 0, 0.4, 0]);
  assert.deepEqual(want[7], [0.4, 0, 1, 1, 0.4, 0]);
  assert.deepEqual(want[10], [1, 0, 1, 0, 1, 0], 'null＝全部恢復、框全滅');
  assert.deepEqual(want[11], [1, 0, 1, 0, 1, 0]);
  assert.deepEqual(want[12], [1, 0, 0, 0, 1, 0]);
});

test('P.focus：之後 P.out 從目前亮度淡出（不跳回 1）；倒著寫、active 不在組裡會丟錯', () => {
  const { tl, P } = mk();
  const items = [ITEM('a'), ITEM('b')];
  P.in(items, 0.5);
  P.focus(items, items[1], 2);
  P.out(items, 4, { dur: 1 });
  P.end(6);
  seek(tl, 4.001, true); assert.ok(Math.abs(items[0].opacity - 0.4) < 0.01, `a 從 0.4 開始淡，實際 ${items[0].opacity}`);
  assert.ok(items[1].opacity > 0.99);
  seek(tl, 3, true); near(items[0].opacity, 0.4);
  seek(tl, 5.5, true); assert.equal(Number(items[0].opacity), 0);
  const m = mk(); const g = [ITEM('x'), ITEM('y')];
  m.P.focus(g, g[0], 5);
  assert.throws(() => m.P.focus(g, g[1], 3), (e) => e.message === 'P.focus 要照時間先後寫：#x 在 5.4s 已經有亮度變化，這一行卻是 3s → 把這一行移到前面，或把時間改晚');
  assert.throws(() => m.P.out(g[0], 5.2), /P\.focus 要照時間先後寫：#x 在 5\.4s/);
  assert.throws(() => m.P.focus(g, { id: 'z' }, 8), (e) => e.message === 'P.focus 的第二個參數 #z 不在第一個參數那一組裡 → 改成那一組其中一個，或寫 null（全部恢復）');
  // 沒被 focus 過的元素行為不變
  const n = mk(); const c = {};
  n.P.in(c, 0.5); n.P.out(c, 0.6); n.P.end(2);
  seek(n.tl, 0.6, true); assert.equal(Number(c.opacity), 1, '沒記過亮度的元素出場仍從 1 開始');
});

test('P.spot：上一個焦點還在轉場就接到下一拍 → 接在它後面、不丟錯（丟錯整段會空白）；倒著寫才丟錯', () => {
  const { tl, P } = mk(); const g = [ITEM('a'), ITEM('b')];
  P.spot(g, g[0], 2);                       // 2–2.5 轉場
  P.spot(g, g[1], 2.3);                     // 兩拍只差 0.3 秒 → 從 2.5 開始
  P.end(4);
  seek(tl, 2.5, true); assert.ok(g[1].opacity < 0.5, `b 在 2.5 還是暗的，實際 ${g[1].opacity}`);
  seek(tl, 3.5, true); near(g[1].opacity, 1); near(g[0].opacity, 0.42);
  assert.throws(() => P.spot(g, g[0], 1), /P\.spot 要照時間先後寫：#a 在 2\.5s/);
});

// ---------- P.type：DOM shim（只實作 spec FR-019 的 API）----------
function makeDom() {
  const doc = {};
  class Text { constructor(v) { this.nodeType = 3; this.nodeValue = v; this.parentNode = null; this.ownerDocument = doc; } get textContent() { return this.nodeValue; } }
  class El {
    constructor(tag) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = []; this.parentNode = null; this.ownerDocument = doc; this.attrs = {}; this.style = { cssText: '' }; this.className = ''; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    hasAttribute(k) { return k in this.attrs; }
    insertBefore(n, ref) {
      if (n.parentNode) n.parentNode.removeChild(n);
      const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
      assert.ok(i >= 0, 'insertBefore 的參考節點不在這個元素裡');
      this.childNodes.splice(i, 0, n); n.parentNode = this; return n;
    }
    removeChild(n) { const i = this.childNodes.indexOf(n); assert.ok(i >= 0); this.childNodes.splice(i, 1); n.parentNode = null; return n; }
    get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
    set textContent(v) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; if (v !== '') this.insertBefore(new Text(String(v)), null); }
  }
  doc.createElement = (t) => new El(t);
  doc.createTextNode = (v) => new Text(v);
  // 小型解析器：只認 <tag attr="v">、</tag>、<br>
  const parse = (html) => {
    const root = new El('div'), stack = [root];
    for (const m of html.matchAll(/<\/(\w+)>|<(\w+)([^>]*)>|([^<]+)/g)) {
      const top = stack[stack.length - 1];
      if (m[1]) stack.pop();
      else if (m[2]) { const e = new El(m[2]); for (const a of m[3].matchAll(/(\w[\w-]*)="([^"]*)"/g)) { if (a[1] === 'class') e.className = a[2]; else e.setAttribute(a[1], a[2]); } top.insertBefore(e, null); if (m[2] !== 'br') stack.push(e); }
      else top.insertBefore(new Text(m[4]), null);
    }
    return root;
  };
  // 已打／未打／游標：依文件順序串起來
  const read = (el) => {
    let on = '', off = '', carets = [], order = '';
    const walk = (n, mode) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { if (mode === 'on') on += c.nodeValue; else if (mode === 'off') off += c.nodeValue; order += mode === 'on' ? c.nodeValue : ''; continue; }
        if (c.hasAttribute('data-sc-caret')) { carets.push(c); order += '|'; continue; }
        walk(c, c.hasAttribute('data-sc-on') ? 'on' : c.hasAttribute('data-sc-off') ? 'off' : mode);
      }
    };
    walk(el, null);
    return { on, off, carets, order };
  };
  const tags = (el) => el.childNodes.filter((c) => c.nodeType === 1 && !c.hasAttribute('data-sc-on') && !c.hasAttribute('data-sc-off') && !c.hasAttribute('data-sc-caret')).map((c) => c.tagName + (c.className ? '.' + c.className : ''));
  const count = (el, attr) => { let n = 0; const w = (x) => { for (const c of x.childNodes) if (c.nodeType === 1) { if (c.hasAttribute(attr)) n++; w(c); } }; w(el); return n; };
  return { parse, read, tags, count };
}

test('P.type：亂序 seek 已打字串正確、版面標記原位保留、已打＋未打＝原文、游標', () => {
  const D = makeDom();
  const el = D.parse('<div>幫我把<span class="sc-kw">表格</span><br>整理好</div>').childNodes[0];
  const { tl, P } = mk();
  P.type(el, 1);
  P.end(4);
  assert.equal(el.getAttribute('data-sc-type'), '8');
  const dur = Math.round((8 / 8.5) * 100) / 100;   // 0.94
  assert.equal(tl.getChildren()[0].duration(), dur);
  const at = (k) => 1 + ((k + 0.5) / 8) * dur;       // 第 k 個字打完、第 k+1 個還沒打的時刻
  const FULL = '幫我把表格整理好';
  const want = (k) => [...FULL].slice(0, k).join('');
  for (const [t, k] of [[3, 8], [0.2, 0], [at(3), 3], [at(2), 2], [at(0), 0], [at(5), 5], [3, 8], [0, 0]]) {
    seek(tl, t, true);
    const r = D.read(el);
    assert.equal(r.on, want(k), `t=${t.toFixed(3)} 已打`);
    assert.equal(r.on + r.off, FULL, '已打＋未打永遠等於原文');
    assert.deepEqual(D.tags(el), ['SPAN.sc-kw', 'BR'], '<span class="sc-kw"> 與 <br> 原位保留');
    if (k < 8) {
      assert.equal(r.carets.length, 1, '打字中有且只有一個游標');
      assert.match(r.carets[0].style.cssText, /width:0/); assert.match(r.carets[0].style.cssText, /margin-left:-4px/);
      assert.doesNotMatch(r.carets[0].style.cssText, /display:none/);
      assert.equal(r.order, want(k) + '|', '游標在已打最後一個字後面');
    } else assert.match(r.carets[0].style.cssText, /display:none/, '打完游標隱藏');
  }
  // 冪等：同一元素再 P.type 一次，不重包
  const spans = D.count(el, 'data-sc-on');
  P.type(el, 3, { dur: 1 });
  assert.equal(D.count(el, 'data-sc-on'), spans);
  assert.equal(el.getAttribute('data-sc-type'), '8');
});

test('P.type：cps、caret:false、空白跟著下一個字、只有空白的文字節點不動', () => {
  const D = makeDom();
  const box = D.parse('<div><span>ab cd</span>\n  <i></i></div>').childNodes[0];
  const { tl, P } = mk();
  P.type(box, 0.5, { cps: 4, caret: false });
  P.end(3);
  assert.equal(box.getAttribute('data-sc-type'), '4');
  assert.equal(tl.getChildren()[0].duration(), 1);
  seek(tl, 0.5 + 0.6, true);   // k＝floor(0.6×4)＝2
  assert.equal(D.read(box).on, 'ab');
  seek(tl, 0.5 + 0.8, true);   // k＝3：空白跟著 c 一起出現
  assert.equal(D.read(box).on, 'ab c');
  assert.equal(D.read(box).carets.length, 0);
  assert.equal(box.childNodes[1].nodeType, 3, '縮排的空白文字節點不動');
  // 沒有字：長度 0.001、什麼都不做
  const e = D.parse('<div><br></div>').childNodes[0];
  const m = mk(); m.P.type(e, 1); m.P.end(2);
  assert.equal(e.getAttribute('data-sc-type'), '0');
  seek(m.tl, 1.5, true); assert.deepEqual(D.tags(e), ['BR']);
});

// ---------- 動態 v2（specs/010-motion-v2/design-system.md §11；specs/contracts/motion.md） ----------
const V2_API = ['chars', 'wipe', 'wipeOut', 'slide', 'slideOut', 'pop', 'punch', 'dim', 'marker', 'strike', 'stamp', 'sheen', 'ripple', 'comet', 'flow', 'idle', 'spot', 'cam', 'grow', 'draw', 'along', 'fly', 'tape', 'hinge', 'wave', 'spin', 'sfx'];

test('v2：原語清單、開頭註解、時間與曲線表、區域、u', () => {
  const { P } = mk();
  for (const k of V2_API) {
    assert.equal(typeof P[k], 'function', `缺 P.${k}`);
    assert.ok(MOTION_SRC.includes(`P.${k}(`), `開頭註解沒記錄 P.${k}`);
  }
  const V = globalThis.SceneMotion.V2;
  assert.deepEqual([V.IN, V.SHELL, V.EMPH, V.OUT, V.MOVE, V.GROUP], [0.5, 0.6, 0.2, 0.3, 1.0, 0.12]);
  assert.deepEqual(V.EASE, { in: 'expo.out', emph: 'back.out(1.8)', move: 'power3.inOut', tx: 'expo.inOut', out: 'power2.in', idle: 'sine.out' });
  assert.deepEqual(V.CH, { rise: 0.03, pop: 0.035, drop: 0.045 });
  assert.equal(P.V2, V);
  assert.deepEqual(P.region('pip'), [1424, 594, 432, 324]);
  assert.throws(() => P.region('nope'), /沒有這個區域：nope/);
  globalThis.__regions = { pip: [10, 20, 30, 40] };
  try { assert.deepEqual(mk().P.region('pip'), [10, 20, 30, 40], 'window.__regions 蓋過橫式預設（009 直式）'); } finally { delete globalThis.__regions; }
  const root = (w, h) => ({ querySelectorAll: () => [], getAttribute: (k) => ({ 'data-width': w, 'data-height': h })[k] ?? null });
  assert.equal(mk(root('1920', '1080')).P.U, 1);
  assert.equal(mk(root('1080', '1920')).P.U, 1, '直式短邊也是 1080');
  assert.equal(mk(root('3840', '2160')).P.U, 2);
  // P.prev()（002 plan-fields.md §4）：root 的 data-prev → 預設 'speaker'；不認得的值也當 'speaker'
  const rp = (v) => ({ querySelectorAll: () => [], getAttribute: (k) => (k === 'data-prev' ? v : null) });
  assert.deepEqual(['fullscreen', 'pip', 'speaker', null, 'bogus'].map((v) => mk(rp(v)).P.prev()), ['fullscreen', 'pip', 'speaker', 'speaker', 'speaker']);
  assert.match(MOTION_SRC, /定調（v2/, '開頭定調照 design-system.md §0、§3（§13 第一列）');
});

test('v2：每個 P.* 呼叫的 tween 帶 data { sc, role, fn }；idle／flow／慢推是 micro；P.sfx 登記並回傳 P.at', () => {
  const root = { querySelectorAll: () => [], getAttribute: (k) => (k === 'data-cues-sample' ? '{"start":0,"D":8,"cues":{"3":[2,3.5]},"refs":{"#3@詞":2.6}}' : null) };
  const { tl, P } = mk(root);
  const a = { style: {} }, b = { style: {} };
  P.pop([a, b], 1, { stagger: 0.12 });
  P.dim([a], 2);
  P.flow([a], 0.5, { until: 6 });
  P.cam([b], 1, { scale: 1.04, dur: 6 });
  P.cam([b], 7, { scale: 1 });
  const t = P.sfx('click', '#3@詞', 0.1);
  near(t, 2.7);
  assert.deepEqual(P.sfxCues, [{ name: 'click', ref: '#3@詞', off: 0.1, t: 2.7 }]);
  assert.deepEqual(globalThis.SceneMotion.sfx['?'].at(-1), { name: 'click', ref: '#3@詞', off: 0.1, t: 2.7 });
  assert.ok(P.marks.some((m) => m.ref === '#3@詞' && Math.abs(m.t - 2.7) < 1e-9), 'P.sfx 也是一拍（marks）');
  assert.throws(() => P.sfx('', '#3'), /音效名/);
  const kids = tl.getChildren(true, true, false).map((k) => k.data);
  const pops = kids.filter((d) => d.fn === 'pop');
  assert.equal(pops.length, 2);
  assert.equal(pops[0].sc, pops[1].sc, '同一個 P.pop 呼叫（錯拍兩個元素）同一個 sc');
  assert.deepEqual([...new Set(kids.map((d) => `${d.fn}:${d.role}`))].sort(), ['cam:focus', 'cam:micro', 'dim:focus', 'flow:micro', 'pop:enter']);
});

// 009 直式：舞台縮放的 1920×1080 子合成座標還是橫式（不讀 window.__regions）；P.cam 不往焦點帶、以上緣中點推近（不切到畫布左右緣與上方 unsafe 線）
test('009 直式：STAGED（window.__regions＋root 寬 > 高）用橫式區域、P.cam {to} 不帶位移且原點 50% 0%；橫式與直式原生（1080×1920）照舊', () => {
  const root = (w, h) => ({ querySelectorAll: () => [], getAttribute: (k) => ({ 'data-width': w, 'data-height': h })[k] ?? null });
  const card = () => ({ style: {}, offsetLeft: 120, offsetTop: 150, offsetWidth: 1180, offsetHeight: 712, offsetParent: null });
  const tgt = { style: {}, offsetLeft: 900, offsetTop: 300, offsetWidth: 200, offsetHeight: 200, offsetParent: null };
  const camVars = (r) => {
    const { tl, P } = mk(r);
    P.cam([card()], 1, { to: [tgt], k: 0.12, scale: 1.04, dur: 0.9 });
    const tw = tl.getChildren(true, true, false).find((k) => k.data && k.data.fn === 'cam');
    return { x: tw.vars.x, y: tw.vars.y, scale: tw.vars.scale, org: tw.vars.transformOrigin, panelTop: P.region('panelTop') };
  };
  // 橫式（沒有 __regions）：往焦點帶 −k×s×(焦點中心 − 容器中心)，原點 50% 50%
  assert.deepEqual(camVars(root('1920', '1080')), { x: -51, y: -5, scale: 1.04, org: '50% 50%', panelTop: [120, 150, 1180, 708] });
  globalThis.__regions = { panelTop: [0, 0, 1080, 900], panelBottom: [0, 900, 1080, 1020], pip: [0, 900, 1080, 1020] };
  try {
    assert.deepEqual(camVars(root('1920', '1080')), { x: 0, y: 0, scale: 1.04, org: '50% 0%', panelTop: [120, 150, 1180, 708] }, '直式舞台縮放：橫式區域、只推近');
    assert.deepEqual(camVars(root('1080', '1920')), { x: -51, y: -5, scale: 1.04, org: '50% 50%', panelTop: [0, 0, 1080, 900] }, '直式原生（overlay 1080×1920）：讀 __regions、照常帶');
  } finally { delete globalThis.__regions; }
});

// 縮放過又回到 1 的元素停在 V2.REST：單位矩陣的元素在 Chrome 裡反鋸齒會跟著 seek 先後不同（聚焦「走過」、回均衡、逐字彈出，亂序截圖差 300+ 個色值）
test('v2：縮放過的元素回到 1 停在 V2.REST；第一個縮放補間的起點仍是 1', () => {
  const { tl, P } = mk();
  const REST = globalThis.SceneMotion.V2.REST;
  assert.ok(REST > 1 && REST < 1.001, 'REST 肉眼看不出');
  const a = { style: {} }, c = { style: {} };
  P.pop([a], 1);
  P.cam([c], 1, { scale: 1.04, dur: 1 }); P.cam([c], 3, { scale: 1, dur: 0.5 });
  seek(tl, 0.5); near(c.scale, 1, '第一個縮放補間之前');
  seek(tl, 2); near(a.scale, REST, '彈出落地');
  seek(tl, 4); near(c.scale, REST, '鏡頭回正');
  seek(tl, 0.5); near(c.scale, 1, '往回 seek 到第一個補間之前');
});

// T108：P.grow 在 seek 時量 DOM，render 的 worker／snapshot 從段前一格跳進長出期時合成還沒顯示（0 寬）→ transform 無效 → 截到原尺寸的卡
test('P.grow：目標框在掛載時量好；之後 seek 時量不到大小（合成還沒顯示）也照算，不寫出無效的 transform', () => {
  const el = { style: {}, offsetLeft: 120, offsetTop: 150, offsetWidth: 1180, offsetHeight: 708, offsetParent: null };
  const { tl, P } = mk();
  P.grow([el], 0.3);
  seek(tl, 0.7);
  const t0 = el.style.transform;
  assert.match(t0, /^translate\([\d.-]+px,[\d.-]+px\) scale\([\d.]+,[\d.]+\)$/);
  el.offsetWidth = 0; el.offsetHeight = 0;
  seek(tl, 0); seek(tl, 0.7);
  assert.equal(el.style.transform, t0, '和掛載時量的一樣');
  seek(tl, 2); assert.equal(el.style.transform, 'none');
});

// 亂序 seek 逐像素相同（brief 硬限制）：每個原語各自一區，亂序與照順序 seek 後，每區的計算樣式與整張截圖都要相同
const AB = await import(path.join(TEMPLATE, 'tools', 'lib', 'audit-browser.mjs'));
let chrome = null, runtime = null;
try { chrome = AB.chromeCandidates()[0] || null; runtime = AB.findRuntime({}).file; } catch { /* 沒裝 */ }
const V2_FIX = {
  chars: `<div id="t-chars" class="t-box" style="left:40px;top:40px;font-size:48px">逐字上浮</div><div id="t-charpop" style="left:300px;top:40px;font-size:48px">逐字彈出</div><div id="t-chardrop" style="left:560px;top:40px;font-size:48px">落下</div>`,
  wipe: `<div id="t-wipe" class="t-box" style="left:40px;top:140px"></div>`,
  slide: `<div style="position:absolute;left:260px;top:140px;width:200px;height:80px;overflow:hidden"><div id="t-slide" class="t-box" style="left:0;top:0"></div></div>`,
  pop: `<div id="t-pop" class="t-box" style="left:480px;top:140px"></div>`,
  punch: `<div id="t-punch" class="t-box" style="left:700px;top:140px"></div>`,
  dim: `<div id="t-dim" class="t-box" style="left:920px;top:140px"></div>`,
  marker: `<div id="t-marker" style="left:40px;top:260px;font-size:44px">螢光筆</div>`,
  strike: `<div id="t-strike" style="left:300px;top:260px;font-size:44px">劃掉這句</div><div id="t-wave" style="left:300px;top:330px;font-size:44px">波浪劃掉</div>`,
  stamp: `<div id="t-stamped" class="t-box" style="left:1160px;top:260px"></div><b id="t-stamp" class="sc-stamp" style="left:1190px;top:274px">過時</b>`,
  sheen: `<div id="t-sheen" class="t-box" style="left:560px;top:260px;overflow:hidden"></div>`,
  ripple: `<div id="t-ripple" style="left:820px;top:270px;width:60px;height:60px;border-radius:50%;background:#e06020"></div>`,
  comet: `<svg style="left:40px;top:380px;width:600px;height:80px;overflow:visible" viewBox="0 0 600 80"><path id="t-comet" d="M10 40 C 200 0, 400 80, 590 40" fill="none" stroke="#e06020" stroke-width="6"/></svg>`,
  flow: `<svg style="left:700px;top:380px;width:400px;height:40px" viewBox="0 0 400 40"><line id="t-flow" x1="0" y1="20" x2="400" y2="20" stroke="#333" stroke-width="4" stroke-dasharray="12 12"/></svg>`,
  idle: `<div id="t-idle" class="t-box" style="left:1160px;top:140px"></div>`,
  spot: `<div class="t-spot t-box" id="t-s1" style="left:40px;top:500px"></div><div class="t-spot t-box" id="t-s2" style="left:280px;top:500px"></div><div class="t-spot t-box" id="t-s3" style="left:520px;top:500px"></div>`,
  cam: `<div id="t-cam" style="left:800px;top:480px;width:500px;height:300px"><div id="t-camtarget" class="t-box" style="left:380px;top:200px"></div></div>`,
  grow: `<div id="t-grow" class="t-box" style="left:1360px;top:300px;width:300px;height:160px"></div>`,
  draw: `<svg id="t-draw" style="left:40px;top:820px;width:240px;height:200px" viewBox="0 0 240 200"><rect x="20" y="20" width="200" height="120" rx="12" fill="#fff" stroke="#141414" stroke-width="4"/><path d="M40 170 L200 170" fill="none" stroke="#e06020" stroke-width="6" stroke-linecap="round"/><circle cx="120" cy="80" r="20" fill="#e06020"/><text x="120" y="192" text-anchor="middle" font-size="18">標籤</text></svg>`,
  along: `<svg style="left:340px;top:820px;width:300px;height:160px" viewBox="0 0 300 160"><path id="t-alongpath" d="M10 150 L150 20 L290 150" fill="none" stroke="#333" stroke-width="3"/></svg><div id="t-along" style="left:330px;top:950px;width:40px;height:40px;border-radius:50%;background:#e06020"></div>`,
  fly: `<svg style="left:700px;top:820px;width:360px;height:160px;overflow:visible" viewBox="0 0 360 160"><path id="t-fly" d="M10 140 C 120 20, 240 20, 350 120" fill="none" stroke="#333" stroke-width="3"/></svg>`,
  tape: `<div id="t-tape" class="t-box" style="left:1120px;top:880px;width:220px;height:130px"></div>`,
  hinge: `<div id="t-hinge" class="t-box" style="left:1400px;top:760px;width:220px;height:70px"></div>`,
  wave: `<div id="t-wv" style="left:1400px;top:860px;width:260px;height:90px"></div>`,
  spin: `<div id="t-spin" style="left:1720px;top:880px;width:60px;height:60px;border-radius:50%;border:6px solid #ddd;border-top-color:#e06020"></div>`,
};
const V2_CODE = `
    P.chars('#t-chars', 0.5); P.chars('#t-charpop', 0.7, { mode: 'pop' }); P.chars('#t-chardrop', 0.9, { mode: 'drop' });
    P.wipe('#t-wipe', 0.5); P.wipeOut('#t-wipe', 4.5, { dir: 'right' });
    P.slide('#t-slide', 1.0); P.slideOut('#t-slide', 4.8);
    P.pop('#t-pop', 1.2);
    P.punch('#t-punch', 2.0);
    P.dim('#t-dim', 1.5); P.dim('#t-dim', 3.0, { to: 1 });
    P.marker('#t-marker', 1.6);
    P.strike('#t-strike', 1.8); P.strike('#t-wave', 2.0, { wave: true });
    P.stamp('#t-stamp', 2.4, { on: '#t-stamped' });
    P.sheen('#t-sheen', 2.2);
    P.ripple('#t-ripple', 2.4);
    P.comet('#t-comet', 1.0);
    P.flow('#t-flow', 0.5);
    P.idle('#t-idle', 1.0, { y: 6, scale: 0.05 });
    P.pop('.t-spot', 0.5, { stagger: 0.12 }); P.spot('.t-spot', 'none', 1.5); P.spot('.t-spot', '#t-s1', 2.0); P.spot('.t-spot', '#t-s2', 3.0, { done: '#t-s1' }); P.spot('.t-spot', null, 4.0);
    P.cam('#t-cam', 2.8, { to: '#t-camtarget', k: 0.12, scale: 1.04 }); P.cam('#t-cam', 4.2, { x: 0, y: 0, scale: 1 });
    P.grow('#t-grow', 0.3);
    P.draw('#t-draw', 0.6);
    P.along('#t-along', '#t-alongpath', 1.2); P.along('#t-along', '#t-alongpath', 3.0, { from: 1, to: 0.5 });
    P.fly('#t-fly', 1.0);
    P.tape('#t-tape', 2.0);
    P.hinge('#t-hinge', 1.4);
    P.wave('#t-wv', 0.5, { until: 4 });
    P.spin('#t-spin', 0.5, { until: 4 });
    P.sfx('click', '#1');
    P.end();`;

test('v2：每個原語亂序 seek 和照順序 seek 的計算樣式相同、整張截圖逐像素相同', { skip: !(chrome && runtime) && '找不到 HyperFrames 的 Chrome 或 runtime（npx hyperframes browser ensure）', timeout: 120000 }, async () => {
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-v2-motion-'));
  try {
    fs.mkdirSync(path.join(dir, 'kit')); fs.mkdirSync(path.join(dir, 'compositions'));
    for (const f of ['gsap.min.js', 'scene-motion.js', 'scene.css', 'brand.css']) fs.copyFileSync(path.join(KIT, f), path.join(dir, 'kit', f));
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="kit/brand.css"><link rel="stylesheet" href="kit/scene.css"><script src="kit/gsap.min.js"></script><script src="kit/scene-motion.js"></script>
<style>body{margin:0;background:#000}#main-root{position:relative;width:1920px;height:1080px;overflow:hidden}</style></head><body>
<div id="main-root" data-composition-id="main" data-start="0" data-duration="6" data-width="1920" data-height="1080" data-fps="30">
  <div id="el-x01" data-composition-id="x-v2" data-composition-src="compositions/x-v2.html" data-start="0" data-duration="6" data-track-index="1" data-width="1920" data-height="1080" style="z-index:20"></div>
</div>
<script>(function(){ window.__timelines = window.__timelines || {}; const tl = gsap.timeline({ paused: true }); tl.set({}, {}, 6); window.__timelines['main'] = tl; })();</script>
</body></html>`);
    fs.writeFileSync(path.join(dir, 'compositions', 'x-v2.html'), `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>x-v2</title></head><body>
<template id="x-v2-template">
  <style>#x-v2 { position: absolute; inset: 0; background: #f4efe8; } #x-v2 > div, #x-v2 > svg, #x-v2 div[id^="t-"] { position: absolute; } #x-v2 .t-box { width: 200px; height: 80px; background: #e06020; border-radius: 12px; } #x-v2 .sc-surface-fs { position: absolute; inset: 0; }</style>
  <div id="x-v2" data-composition-id="x-v2" data-width="1920" data-height="1080" data-duration="6" data-cues-sample='{"start":0,"D":6,"cues":{"1":[2,3]}}'>
    <div class="sc-surface-fs"></div>
    ${Object.values(V2_FIX).join('\n    ')}
  </div>
  <script>(function () { const tl = gsap.timeline({ paused: true }); const P = SceneMotion(tl, document.getElementById('x-v2'));${V2_CODE}
    window.__timelines['x-v2'] = tl; })();</script>
</template></body></html>`);
    const S = await AB.openSession({ dir, chrome, runtime });
    const ids = Object.fromEntries(Object.entries(V2_FIX).map(([k, h]) => [k, [...h.matchAll(/id="(t-[\w-]+)"/g)].map((m) => m[1])]));
    // 每區的狀態：區內每個元素（含原語自動插的零件）的計算樣式與 transform 屬性
    const stateOf = () => S.evaluate(`(() => { const ids = ${JSON.stringify(ids)}; const out = {};
      const keys = ['opacity', 'transform', 'clipPath', 'translate', 'scale', 'strokeDashoffset', 'strokeDasharray', 'visibility'];
      for (const [k, list] of Object.entries(ids)) { const parts = [];
        for (const id of list) { const el = document.getElementById(id); if (!el) { parts.push(id + ':missing'); continue; }
          const host = el.closest('svg') && el.tagName !== 'svg' ? el.closest('svg') : el;
          for (const n of [host, ...host.querySelectorAll('*')]) { const cs = getComputedStyle(n); parts.push(keys.map((p) => cs[p]).join('|') + '|' + (n.getAttribute('transform') || '') + '|' + (n.textContent || '').length); } }
        out[k] = parts.join(';'); }
      out.pen = [...document.querySelectorAll('.sc-pen')].map((n) => n.style.left + n.style.top + n.style.opacity).join(';');
      return out; })()`);
    const times = [0, 0.6, 1.1, 1.7, 2.3, 2.6, 3.1, 3.9, 4.6, 5.9];
    const shuffled = [3.9, 0.6, 5.9, 1.1, 4.6, 0, 2.6, 1.7, 3.1, 2.3];
    try {
      const A = {}, B2 = {};
      for (const t of times) { await S.seek(t); A[t] = { st: await stateOf() }; }
      for (const t of shuffled) { await S.seek(t); B2[t] = { st: await stateOf() }; }
      for (const k of [...Object.keys(V2_FIX), 'pen']) for (const t of times) assert.equal(B2[t].st[k], A[t].st[k], `P.${k}：${t}s 亂序 seek 和照順序不同`);
      // 原語真的有動：完成態和起點不同；背景不加光暈、浮塵；彗星頭起點在線頭
      for (const k of [...Object.keys(V2_FIX), 'pen']) assert.ok(times.some((t) => A[t].st[k] !== A[0].st[k]), `P.${k} 看起來沒有動`);
      assert.equal(await S.evaluate(`document.querySelectorAll('.sc-surface-fs .sc-amb, .sc-surface-fs .sc-dust').length`), 0);
      assert.equal(await S.evaluate(`document.querySelectorAll('[data-sc-ch]').length`), 10);
      assert.deepEqual(await S.evaluate(`(window.SceneMotion.sfx['x-v2'] || window.SceneMotion.sfx['?']).map((x) => [x.name, x.ref, x.t])`), [['click', '#1', 2]]);
      assert.deepEqual(await S.cueErrors(), []);
    } finally { await S.close(); }
    // 逐像素：用 HyperFrames 自己的 snapshot（和完成影片、examples.test 的亂序截圖同一條路；live 頁面的 CDP 截圖會因合成器快取差 1–14 階）
    const crypto = await import('node:crypto');
    const snap = (at, out) => {
      const x = spawnSync('npx', ['hyperframes', 'snapshot', '--at', at.join(','), '--no-end', '-o', out], { cwd: dir, encoding: 'utf8' });
      assert.equal(x.status, 0, x.stdout + x.stderr);
      return Object.fromEntries(fs.readdirSync(out).filter((f) => f.endsWith('.png')).map((f) => [f.match(/-at-([\d.]+)s\.png$/)[1], crypto.createHash('md5').update(fs.readFileSync(path.join(out, f))).digest('hex')]));
    };
    const PA = snap(times, path.join(dir, 'snap-seq')), PB = snap(shuffled, path.join(dir, 'snap-shuf'));
    assert.equal(Object.keys(PA).length, times.length);
    for (const t of Object.keys(PA)) assert.equal(PB[t], PA[t], `${t}s：整張截圖亂序與照順序不同`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 012 版面 helper（kit/scene-layout.js；specs/contracts/motion.md §8）：宣告式排版的幾何、連接線端點、手寫線的量法、亂序 seek 不影響
test('SceneLayout：row 等距、底對齊（標籤同一條線）、群組置中、第二列、巢狀 col、連接線端點；手寫線量得到；亂序 seek 版面不變', { skip: !(chrome && runtime) && '找不到 HyperFrames 的 Chrome 或 runtime（npx hyperframes browser ensure）', timeout: 120000 }, async () => {
  const os = await import('node:os');
  const { judgeLayoutRules } = await import(path.join(TEMPLATE, 'tools', 'lib', 'audit-layout.mjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-layout-'));
  try {
    fs.mkdirSync(path.join(dir, 'kit')); fs.mkdirSync(path.join(dir, 'compositions'));
    for (const f of ['gsap.min.js', 'scene-motion.js', 'scene-layout.js', 'scene.css', 'brand.css']) fs.copyFileSync(path.join(KIT, f), path.join(dir, 'kit', f));
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="kit/brand.css"><link rel="stylesheet" href="kit/scene.css"><script src="kit/gsap.min.js"></script><script src="kit/scene-motion.js"></script><script src="kit/scene-layout.js"></script>
<style>body{margin:0;background:#000}#main-root{position:relative;width:1920px;height:1080px;overflow:hidden}</style></head><body>
<div id="main-root" data-composition-id="main" data-start="0" data-duration="4" data-width="1920" data-height="1080" data-fps="30">
  <div id="el-x01" data-composition-id="x-lay" data-composition-src="compositions/x-lay.html" data-start="0" data-duration="4" data-track-index="1" data-width="1920" data-height="1080" style="z-index:20"></div>
</div>
<script>(function(){ window.__timelines = window.__timelines || {}; const tl = gsap.timeline({ paused: true }); tl.set({}, {}, 4); window.__timelines['main'] = tl; })();</script>
</body></html>`);
    const il = (w, h) => `<div class="t-il" data-illus="x" style="width:${w}px;height:${h}px"></div>`;
    fs.writeFileSync(path.join(dir, 'compositions', 'x-lay.html'), `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>x-lay</title></head><body>
<template id="x-lay-template">
  <style>#x-lay { position: absolute; inset: 0; background: #fff; } #x-lay .t-card { position: absolute; left: 120px; top: 100px; width: 1200px; height: 640px; }
    #x-lay .t-it { display: flex; flex-direction: column; align-items: center; gap: var(--sc-gap-sm); } #x-lay .t-side { flex-direction: row; }
    #x-lay .t-il { background: #e06020; border-radius: 8px; } #x-lay b { font-size: 32px; line-height: 40px; white-space: nowrap; }
    #x-lay .sc-link { stroke: #333; }</style>
  <div id="x-lay" data-composition-id="x-lay" data-width="1920" data-height="1080" data-duration="4" data-cues-sample='{"start":0,"D":4,"cues":{}}'>
    <div id="t-stage" class="t-card" data-layout="row" data-gap="xl">
      <div id="t-a" class="t-it" data-slot>${il(120, 80)}<b>甲</b></div>
      <div id="t-b" class="t-it" data-slot>${il(200, 140)}<b>乙乙乙乙乙乙乙</b></div>
      <div id="t-g" data-slot data-layout="col" data-gap="md">
        <div id="t-c" class="t-it" data-slot>${il(160, 100)}<b>丙</b></div>
        <div id="t-e" class="t-it t-side" data-slot>${il(64, 64)}<b>丁丁</b></div>
      </div>
      <div id="t-d" class="t-it" data-slot data-row="2">${il(96, 96)}<b>戊</b></div>
      <svg id="t-lines" data-links="t-a>t-b t-b>t-g t-b-t-d"></svg>
      <svg id="t-empty" data-links=""></svg>
    </div>
    <div id="t-free" data-layout="free" style="position:absolute;left:1400px;top:100px;width:444px;height:284px;border:2px solid #ccc">
      <div id="t-f1" data-slot style="position:absolute;left:40px;top:100px;width:120px;height:80px;background:#333"></div>
      <div id="t-fg" data-slot data-layout="free" style="position:absolute;left:280px;top:100px"><div id="t-f2" data-slot style="position:absolute;left:0;top:0;width:120px;height:80px;background:#333"></div></div>
      <svg style="position:absolute;left:0;top:0;width:440px;height:280px" viewBox="0 0 440 280"><path id="t-hand" d="M172 140 H268 M252 124 L268 140 L252 156" fill="none" stroke="#e06020" stroke-width="6"/></svg>
      <svg data-layout-ignore style="position:absolute;left:0;top:0;width:440px;height:280px" viewBox="0 0 440 280"><path id="t-axis" d="M172 118 H268" fill="none" stroke="#999" stroke-width="4"/></svg>
    </div>
    <div id="t-mix" data-layout="row" data-gap="md" style="position:absolute;left:1340px;top:400px;width:560px;height:360px">
      <div id="t-v1" class="t-it" data-slot>${il(80, 80)}<b>甲</b></div><div id="t-v2" class="t-it" data-slot>${il(120, 140)}<b>乙</b></div>
      <div id="t-sd" class="t-it t-side" data-slot>${il(48, 48)}<b>丙丙</b></div>
    </div>
    <div id="t-room" data-layout="row" data-gap="md" style="position:absolute;left:800px;top:780px;width:900px;height:200px">
      <div id="t-q1" data-slot style="width:240px;height:40px;background:#333"></div><div id="t-q2" data-slot style="width:240px;height:40px;background:#333"></div>
    </div>
    <div id="t-col" data-layout="col" data-justify="start" data-gap="xxl" style="position:absolute;left:120px;top:740px;width:600px;height:320px">
      <div id="t-k1" data-slot style="width:200px;height:40px;background:#333"></div><div id="t-k2" data-slot style="width:320px;height:40px;background:#333"></div>
    </div>
  </div>
  <script>(function () { const tl = gsap.timeline({ paused: true }); const P = SceneMotion(tl, document.getElementById('x-lay'));
    P.pop('#t-a', 0.2); P.pop('#t-b', 0.5); P.pop('#t-g', 0.8); P.pop('#t-d', 1.1);
    P.stroke('#t-a-t-b', 0.9, { dur: 0.4 }); P.stroke('#t-b-t-g', 1.2, { dur: 0.4 }); P.stroke('#t-b-t-d', 1.5, { dur: 0.4 });
    P.spot('#t-a, #t-b, #t-g', '#t-b', 2.0, { scale: 1.06, lift: -8 }); P.spot('#t-a, #t-b, #t-g', null, 3.0);
    P.end(4); window.__timelines['x-lay'] = tl; })();</script>
</template></body></html>`);
    const S = await AB.openSession({ dir, chrome, runtime });
    const state = () => S.evaluate(`JSON.stringify({ lay: SceneLayout.measure(document.getElementById('el-x01')),
      pos: [...document.querySelectorAll('#el-x01 [data-slot]')].map((e) => e.id + ':' + e.style.left + ',' + e.style.top),
      d: [...document.querySelectorAll('#t-lines path')].map((p) => p.id + ':' + p.getAttribute('d')) })`);
    const times = [0, 0.6, 1.3, 2.2, 2.6, 3.5], shuffled = [2.6, 0, 3.5, 1.3, 2.2, 0.6];
    try {
      const A = {}, B = {};
      for (const t of times) { await S.seek(t); A[t] = await state(); }
      for (const t of shuffled) { await S.seek(t); B[t] = await state(); }
      for (const t of times) assert.equal(B[t], A[t], `${t}s：亂序 seek 後版面（measure、left/top、線）和照順序不同`);
      for (const t of times) assert.equal(A[t], A[0], `${t}s：版面只在 mount 算一次，聚焦放大／抬起不改版面座標`);
      const { lay, pos } = JSON.parse(A[3.5]);
      const cx = (b) => (b[0] + b[2]) / 2, cy = (b) => (b[1] + b[3]) / 2;
      const st = lay.containers.find((c) => c.id === 't-stage'), sl = Object.fromEntries(st.slots.map((s) => [s.id, s]));
      // row：等距（gap-xl 96）；預設底對齊：有標籤的插圖底同高、標籤上緣同一條線；沒標籤的群組對齊最高那個有標籤插圖（t-b）的中線
      assert.deepEqual([sl['t-b'].box[0] - sl['t-a'].box[2], sl['t-g'].box[0] - sl['t-b'].box[2]], [96, 96]);
      assert.ok(Math.abs(sl['t-a'].anchor[3] - sl['t-b'].anchor[3]) <= 1 && Math.abs(sl['t-a'].label[1] - sl['t-b'].label[1]) <= 1, `標籤不在同一條線 ${JSON.stringify([sl['t-a'], sl['t-b']])}`);
      assert.ok(Math.abs(sl['t-g'].anchor[3] - sl['t-b'].anchor[3]) <= 1 && Math.abs(sl['t-g'].label[1] - sl['t-a'].label[1]) <= 1, '巢狀群組看裡面第一個元件（t-c）的標籤，一起底對齊');
      // 第二列：在第一列下方 gap-lg 48、水平置中
      const row1 = { x0: sl['t-a'].box[0], x1: sl['t-g'].box[2], y1: Math.max(...['t-a', 't-b', 't-g'].map((k) => sl[k].box[3])) };
      assert.equal(sl['t-d'].box[1] - row1.y1, 48);
      assert.ok(Math.abs(cx(sl['t-d'].box) - (row1.x0 + row1.x1) / 2) <= 1);
      // 群組在內容區置中（起點貼齊 8，左右、上下留白差 ≤ 8）、位置是 8 的倍數的群組起點
      const G = [Math.min(...st.slots.map((s) => s.box[0])), Math.min(...st.slots.map((s) => s.box[1])), Math.max(...st.slots.map((s) => s.box[2])), Math.max(...st.slots.map((s) => s.box[3]))];
      assert.ok(Math.abs((G[0] - st.box[0]) - (st.box[2] - G[2])) <= 8 && Math.abs((G[1] - st.box[1]) - (st.box[3] - G[3])) <= 8, `群組沒置中 ${JSON.stringify([G, st.box])}`);
      assert.equal((G[0] - st.box[0]) % 8, 0, '群組起點貼齊 --sc-grid');
      // 巢狀 col：gap-md 24；徽章＋字的橫排元件整個置中在插圖中線上
      const g = lay.containers.find((c) => c.id === 't-g'), gs = Object.fromEntries(g.slots.map((s) => [s.id, s]));
      assert.equal(gs['t-e'].box[1] - gs['t-c'].box[3], 24);
      assert.ok(Math.abs(cx(gs['t-e'].box) - cx(gs['t-c'].anchor)) <= 1);
      // 連接線：path id＝<a>-<b>；端點離元件外框 --sc-link-gap 12、在邊中點（對插圖中線，±1）；中線不同的同欄線折成 Z 形
      const rd = (p, b) => Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[2]), Math.max(b[1] - p[1], 0, p[1] - b[3]));
      const links = lay.links.filter((k) => !k.hand);
      assert.deepEqual(links.map((k) => k.id), ['t-a-t-b', 't-b-t-g', 't-b-t-d']);
      for (const k of links) {
        const A = k.anchorA, Bn = k.anchorB, h = k.pts[0][1] === k.pts.at(-1)[1], i = h ? 1 : 0;
        const ref = (Math.max(A[i], Bn[i]) + Math.min(A[i + 2], Bn[i + 2])) / 2;   // 直線：兩個插圖重疊段的正中
        assert.equal(k.pts.length, 2, `${k.id} 是直線`);
        for (const [p, b] of [[k.pts[0], k.boxA], [k.pts.at(-1), k.boxB]]) {
          assert.equal(rd(p, b), 12, `${k.id} 端點離外框`);
          assert.ok(Math.abs(p[i] - ref) <= 1, `${k.id} 端點不在重疊段正中 ${JSON.stringify([p, ref])}`);
        }
      }
      assert.equal(links[0].pts[0][1], Math.round(cy(sl['t-a'].anchor)), '底對齊、高矮不同：水平線在矮的那個（t-a）的中線');
      assert.equal(links[2].pts[0][0], links[2].pts[1][0], '上下兩列：垂直直線（不折線）');
      assert.ok(links[1].pts[0][0] === sl['t-b'].box[2] + 12, '水平線從元件外框（含較寬的標籤）出發，不是從插圖');
      // 手寫的線：第一段子路徑兩端各靠一個元件，換算成版面座標（free 容器 left 1400、top 100、框線 2px）；
      //   巢狀群組 t-fg 和 t-f2 同一邊：認最內層的 t-f2；元件外框也加回框線，端點離外框正好 12
      const hand = lay.links.find((k) => k.hand);
      assert.deepEqual(lay.links.filter((k) => k.hand).map((k) => k.id), ['t-hand'], 'data-layout-ignore 的 svg（例：時間軸橫軸）不當連接線量');
      // row 混合直排／側排：直排插圖底同高；側排（徽章＋右邊字）的標籤中心落在直排標籤的中心線
      const mx = Object.fromEntries(lay.containers.find((c) => c.id === 't-mix').slots.map((s) => [s.id, s]));
      assert.ok(Math.abs(mx['t-v1'].anchor[3] - mx['t-v2'].anchor[3]) <= 1, '直排插圖底同高');
      assert.ok(Math.abs(cy(mx['t-sd'].label) - cy(mx['t-v1'].label)) <= 1, `側排標籤中心要落在標籤線 ${JSON.stringify([mx['t-sd'].label, mx['t-v1'].label])}`);
      // room()：(240＋240)×(1.1−1)/2＝24.000000000000004 不能 ceil 成 25
      const qs = Object.fromEntries(lay.containers.find((c) => c.id === 't-room').slots.map((s) => [s.id, s]));
      assert.equal(qs['t-q2'].box[0] - qs['t-q1'].box[2], 24);
      assert.ok(hand && hand.a === 't-f1' && hand.b === 't-f2', `手寫線沒量到 ${JSON.stringify(lay.links)}`);
      assert.deepEqual([hand.pts[0], hand.pts.at(-1)].map((p) => p.map(Math.round)), [[1574, 242], [1670, 242]]);
      assert.deepEqual([rd(hand.pts[0], hand.boxA), rd(hand.pts.at(-1), hand.boxB)].map(Math.round), [12, 12]);
      // data-justify="start"：col 左邊對齊、群組左內距 --sc-pad-card 48；data-gap="xxl" 160
      const kc = lay.containers.find((c) => c.id === 't-col'), ks = Object.fromEntries(kc.slots.map((s) => [s.id, s]));
      assert.deepEqual([ks['t-k1'].box[0] - kc.box[0], ks['t-k2'].box[0] - kc.box[0], ks['t-k2'].box[1] - ks['t-k1'].box[3]], [48, 48, 160]);
      assert.equal(kc.justify, 'start');
      // 整份量測丟進 audit：六條規則都不報
      assert.deepEqual(judgeLayoutRules(lay, { item: { id: 'x01', label: 'x-lay' }, t: 3.5 }), []);
      assert.ok(pos.every((p) => /:\d+px,\d+px$/.test(p) || p.startsWith('t-f')), `slot 位置要是整數 px ${pos}`);
      assert.equal(await S.evaluate(`getComputedStyle(document.getElementById('t-empty')).display`), 'none', 'data-links 空的 svg 不佔版面（預設 300×150 會壓到標題列）');
      // 箭頭頭另一條 path（<a>-<b>-head）：本體只有一段子路徑（P.comet 停在箭尖）；P.stroke 描本體時，頭在描完那一刻淡入；沒箭頭的沒有頭
      assert.deepEqual(await S.evaluate(`['t-a-t-b', 't-a-t-b-head', 't-b-t-d-head'].map((id) => { const p = document.getElementById(id); return p ? (p.getAttribute('d').match(/M/g) || []).length + ':' + (p.getAttribute('data-link-head') || '') : null; })`), ['1:', '1:t-a-t-b', null]);
      const headOp = async (t) => { await S.seek(t); return S.evaluate(`getComputedStyle(document.getElementById('t-a-t-b-head')).opacity`); };
      assert.deepEqual([await headOp(2.2), await headOp(0.6), await headOp(1.0), await headOp(3.5)], ['1', '0', '0', '1'], '頭：描之前 0、描到 1.25 秒之後 1（亂序也一樣）');
      assert.deepEqual(await S.cueErrors(), []);
    } finally { await S.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SceneLayout 載入順序：主合成、畫廊、custom 預覽頁都是 scene-motion.js → illus.js → scene-layout.js（brief §2；002 的 build.test 只比到 illus.js）', async () => {
  const src = fs.readFileSync(path.join(TEMPLATE, 'tools', 'lib', 'main.mjs'), 'utf8');
  assert.equal([...src.matchAll(/kit\/illus\.js"><\/script>\n\s*<script src="[^"]*kit\/scene-layout\.js"><\/script>/g)].length, 2, '主合成 head 與畫廊 head 各一次，緊接在 illus.js 之後');
  const { buildCustomPreview } = await import(path.join(TEMPLATE, 'tools', 'lib', 'custom-preview.mjs'));
  const { KIT_LINKS } = await import(path.join(TEMPLATE, 'tools', 'lib', 'main.mjs'));
  const pv = buildCustomPreview({ name: 'x-a', html: '<template id="x-a-template"><div id="x-a"></div></template>', kitLinks: KIT_LINKS });
  const at = (s) => { const i = pv.indexOf(s); assert.ok(i > 0, `預覽頁沒有 ${s}`); return i; };
  assert.ok(at('src="../kit/scene-motion.js"') < at('src="../kit/illus.js"') && at('src="../kit/illus.js"') < at('src="../kit/scene-layout.js"'));
  assert.match(MOTION_SRC, /if \(window\.SceneLayout\) window\.SceneLayout\.apply\(root\);/, 'SceneMotion(tl, root) 建立時排一次');
});

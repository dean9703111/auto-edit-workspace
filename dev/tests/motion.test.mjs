// 動態語彙 v3（P.morph／push／count／bar）與兩支第二層範例（x-before-after／x-numbers）
//   - scene-motion.js：新 API 存在、在 Node 裡用真的 GSAP seek（含 suppressEvents＝true、往回 seek、起點之前）數字與數值都對
//   - 範例：照 R7.3 骨架（build 的 readCustom 會驗的那幾條＋id 前綴、CSS 範圍、token 顏色、P.end(D)、時間與版面規則）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { TEMPLATE, lib, imp, makeSrt } from './helpers.mjs';

const { readCustom } = await imp('lib/assemble.mjs');
const { resolvePlan } = await imp('lib/plan.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const KIT = path.join(TEMPLATE, 'kit');
const CUSTOM = path.join(TEMPLATE, 'custom');
const MOTION_SRC = fs.readFileSync(path.join(KIT, 'scene-motion.js'), 'utf8');
const ICONS = JSON.parse(fs.readFileSync(path.join(KIT, 'icons.json'), 'utf8'));

// ---------- 在 Node 載入真的 GSAP 與 scene-motion.js（不需要瀏覽器；目標用普通物件）----------
const gsap = createRequire(path.join(KIT, 'x.js'))('./gsap.min.js').gsap;
gsap.timeline();   // 先喚醒內建 plugin（之後才有 window／document 的替身，免得 CSSPlugin 去呼叫 createElement）
// 這個測試檔是獨立的 Node 行程：把 gsap／window／document 掛在 globalThis 後直接執行 scene-motion.js
// （GSAP 的 lazy render 要有 window 才會在第一次 seek 時 flush，和瀏覽器行為一致）
Object.assign(globalThis, { gsap, window: globalThis, document: { querySelectorAll: () => [] } });
vm.runInThisContext(MOTION_SRC);
const mk = () => { const tl = gsap.timeline({ paused: true }); return { tl, P: globalThis.SceneMotion(tl) }; };
const seek = (tl, t, suppress) => tl.totalTime(t, suppress);

test('scene-motion：新 API 與常數存在，開頭 API 註解有記錄', () => {
  const { P } = mk();
  for (const k of ['morph', 'push', 'count', 'bar']) {
    assert.equal(typeof P[k], 'function', `缺 P.${k}`);
    assert.ok(MOTION_SRC.includes(`P.${k}(`), `開頭註解沒記錄 P.${k}`);
  }
  assert.deepEqual([P.MORPH, P.ZOOM, P.COUNT, P.BAR], [0.7, 2.4, 1.2, 0.8]);
  for (const c of ['P.MORPH', 'P.ZOOM', 'P.COUNT', 'P.BAR']) assert.ok(MOTION_SRC.includes(c), `常數註解沒寫 ${c}`);
  // 既有方法都還在
  for (const k of ['in', 'out', 'swap', 'sideIn', 'sideOut', 'end', 'drift', 'reveal', 'rise', 'maskUp', 'axis', 'stroke', 'icon', 'check']) assert.equal(typeof P[k], 'function', `既有方法 P.${k} 不見了`);
});

test('scene-motion：不加 will-change、不用 Math.random／setTimeout／CSS transition', () => {
  const code = MOTION_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /will-?change|Math\.random|setTimeout|requestAnimationFrame|transition\s*:/i);
  assert.match(code, /force3D: false/, '鏡頭推進要帶 force3D:false');
});

test('P.count：任意時間點 seek 數字正確（含 suppressEvents、往回 seek、起點之前與之後）', () => {
  for (const suppress of [true, false]) {
    const { tl, P } = mk();
    const el = { style: {}, textContent: 'x' };
    P.count(el, 1, { from: 0, to: 28, dur: 2, suffix: ' 段', ease: 'none' });
    P.end(8);
    const at = (t) => { seek(tl, t, suppress); return el.textContent; };
    assert.equal(at(0.2), '0 段');         // 起點之前就是起點值（GSAP 的 immediateRender 是 lazy，第一次 seek 才寫入）
    assert.equal(at(0.99), '0 段');
    assert.equal(at(2), '14 段');          // 中途：ease none，1 秒＝一半
    assert.equal(at(3), '28 段');
    assert.equal(at(7), '28 段');          // 終點之後
    assert.equal(at(1.5), '7 段');         // 往回 seek
    assert.equal(at(0.2), '0 段');         // 往回超過起點
    assert.equal(at(2.5), '21 段');        // 再往前
    assert.equal(at(0), '0 段');
    assert.equal(el.style.fontVariantNumeric, 'tabular-nums', '數字要用 tabular-nums 免得抖動');
  }
});

test('P.count：小數、前後綴、千分位；同一元素接續兩段計數', () => {
  const { tl, P } = mk();
  const a = { style: {}, textContent: '' }, b = { style: {}, textContent: '' };
  P.count(a, 0, { from: 0, to: 12.5, dur: 1, decimals: 1, prefix: '$', suffix: 'M', ease: 'none' });
  P.count(b, 0, { from: 0, to: 20, dur: 1, ease: 'none' });
  P.count(b, 1, { from: 20, to: 32, dur: 1, ease: 'none' });   // 接續（同一元素第二次：immediateRender 要是 false，不能把第一段的起點蓋掉）
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

test('P.morph：帶 from 時任何時間點 seek 都對；連續變形後一次接前一次的終點', () => {
  const { tl, P } = mk();
  const box = { width: 620, height: 300 };
  P.morph(box, 1, { height: 480 }, { from: { height: 620 }, dur: 1, ease: 'none' });
  P.morph(box, 3, { height: 100 }, { from: { height: 480 }, dur: 1, ease: 'none' });
  P.end(6);
  const h = (t) => { seek(tl, t, true); return box.height; };
  assert.equal(h(0.2), 620);      // 第一段起點（第一次 seek 才寫入）
  assert.equal(h(1.5), 550);
  assert.equal(h(2.5), 480);
  assert.equal(h(3.5), 290);
  assert.equal(h(5), 100);
  assert.equal(h(1.5), 550);      // 往回
  assert.equal(h(0.5), 620);
  assert.equal(box.width, 620, '沒列在 to 的屬性不動');
  // 預設 0.7s、back.out(1.15)：過衝很小
  const m = mk(); const b2 = { width: 100 };
  m.P.morph(b2, 0, { width: 200 }, { from: { width: 100 } }); m.P.end(2);
  let peak = 0; for (let t = 0; t <= 1; t += 0.01) { seek(m.tl, t, true); peak = Math.max(peak, b2.width); }
  assert.ok(peak > 200 && peak < 215, `預設過衝要很小，實測最高 ${peak}`);
  seek(m.tl, 1, true); assert.equal(b2.width, 200);
});

test('P.push／P.bar：預設值與可超過 1（撐破）、往回 seek', () => {
  const { tl, P } = mk();
  const cam = {}, bar = {};
  P.push(cam, 1, { ease: 'none' });
  P.bar(bar, 1, { to: 1.5, dur: 1, ease: 'none' });
  P.end(8);
  seek(tl, 0.2, true); assert.equal(Number(cam.scale), 1); assert.equal(Number(bar.scaleX), 0);
  seek(tl, 1 + 1.2, true); assert.ok(Math.abs(cam.scale - 1.2) < 1e-9, `scale ${cam.scale}`);   // 預設 1→1.4、2.4s
  seek(tl, 2, true); assert.equal(bar.scaleX, 1.5);                                             // 超過 1
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

// ---------- 兩支範例 ----------
const EXAMPLES = { 'x-before-after': { pre: 'xba', card: 'xba-card', must: ['count', 'morph', 'bar', 'icon', 'swap'] },
                   'x-numbers': { pre: 'xn', card: 'xn-card', must: ['count', 'morph', 'bar', 'icon'] } };
const NEW = ['morph', 'push', 'count', 'bar'];
const norm = (s) => s.replace(/\s+/g, '').replace(/class="[^"]*"/g, '').replace(/(width|height)="[^"]*"/g, '');

for (const [id, ex] of Object.entries(EXAMPLES)) {
  const file = path.join(CUSTOM, `${id}.html`);
  const text = fs.readFileSync(file, 'utf8');
  const tpl = text.match(/<template[^>]*>([\s\S]*)<\/template>/)[1];
  const css = tpl.match(/<style>([\s\S]*?)<\/style>/)[1];
  const body = tpl.slice(tpl.indexOf('</style>') + 8, tpl.indexOf('<script>'));
  const script = tpl.match(/<script>([\s\S]*?)<\/script>/)[1];
  const code = script.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const D = Number(code.match(/const D = ([\d.]+);/)[1]);

  test(`${id}：readCustom 通過、R7.3 骨架（template、root id、不加 class、滿版底）`, () => {
    const r = readCustom(file, id);
    assert.deepEqual(r.errors, [], r.errors.join('\n'));
    assert.equal(r.compId, id);
    assert.match(text, /<head><meta charset="UTF-8"><title>[^<]+<\/title><\/head>/);
    assert.ok(tpl.includes(`<div id="${id}" data-composition-id="${id}" data-width="1920" data-height="1080" data-duration="`));
    assert.doesNotMatch(tpl, new RegExp(`id="${id}"[^>]*class=`));
    assert.ok(body.includes('<div class="sc-surface-fs fill"></div>'));
    assert.ok(body.indexOf('sc-surface-fs') < body.indexOf('sc-wcard'));
  });

  test(`${id}：id／class 加前綴、CSS 全在 #${id} 範圍內`, () => {
    for (const m of body.matchAll(/(?<![\w-])id="([^"]+)"/g)) assert.ok(m[1] === id || m[1].startsWith(`${ex.pre}-`), `id 沒加前綴：${m[1]}`);
    for (const m of body.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) assert.ok(c.startsWith('sc-') || c === 'fill' || c.startsWith(`${ex.pre}-`), `class 沒加前綴：${c}`);
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((x) => x.split('{')[0].trim()).filter(Boolean);
    assert.ok(rules.length > 5);
    for (const rule of rules) for (const sel of rule.split(',')) assert.ok(sel.trim().startsWith(`#${id}`), `選擇器沒加範圍：${sel}`);
  });

  test(`${id}：$q 與 forEach 兩行（新方法加進清單）、P.end(D)、D 與 data-duration 一致、timeline 登記`, () => {
    assert.ok(script.includes("var $q = function (s) { return typeof s === 'string' ? Array.prototype.slice.call(document.querySelectorAll(s)) : s; };"));
    const list = script.match(/\[([^\]]*)\]\.forEach\(function \(k\) \{ var f = P\[k\]; P\[k\] = function \(s\) \{/)[1];
    for (const k of ['in', 'out', 'drift', 'reveal', 'rise', 'maskUp', 'sideIn', 'sideOut', ...NEW]) assert.ok(list.includes(`'${k}'`), `forEach 清單缺 '${k}'`);
    assert.ok(script.includes("[ 'swap', 'axis' ].forEach("));
    assert.ok(script.includes(`SceneMotion(tl, document.getElementById('${id}'))`));
    assert.match(code, /P\.end\(D\);/);
    assert.equal(Number(tpl.match(/data-duration="([\d.]+)"/)[1]), D);
    assert.ok(script.includes(`window.__timelines['${id}'] = tl;`));
  });

  test(`${id}：用到該用的 P 方法、都存在於 kit、沒有自己寫補間／隨機／CSS 動畫`, () => {
    const used = new Set([...code.matchAll(/\bP\.(\w+)\(/g)].map((m) => m[1]));
    for (const k of ex.must) assert.ok(used.has(k), `沒用到 P.${k}`);
    const { P } = mk();
    for (const k of used) assert.equal(typeof P[k], 'function', `P.${k} 不存在`);
    assert.doesNotMatch(code, /gsap\.(to|from|fromTo)\(|setTimeout|Math\.random|requestAnimationFrame|\.onUpdate|onUpdate/);
    assert.doesNotMatch(css, /transition|animation|box-shadow|filter|blur|gradient|will-change/i, '硬邊、無光暈、無漸層、無 CSS 動畫、無 will-change');
  });

  test(`${id}：只用 token 顏色`, () => {
    const c = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(c + body, /#[0-9a-fA-F]{3,8}\b(?![\w-])(?=[\s;,)"'])/, '有寫死的色碼');
    assert.doesNotMatch(c, /\brgba?\(|\bhsla?\(/);
    assert.doesNotMatch(c, /:\s*(white|black|red|yellow|blue|green)\b/i);
    assert.doesNotMatch(body, /style="[^"]*(color|background)/);
    assert.doesNotMatch(c, /font-family/);
  });

  test(`${id}：版面：卡右緣 ≤ 1300、不進字幕區、整數 px、字級下限`, () => {
    const card = css.match(new RegExp(`#${ex.card}\\s*\\{[^}]*\\}`))[0];
    const left = +card.match(/left:\s*(\d+)px/)[1], width = +card.match(/width:\s*(\d+)px/)[1];
    const top = +card.match(/top:\s*(\d+)px/)[1], height = +card.match(/height:\s*(\d+)px/)[1];
    assert.ok(left + width <= 1300, `卡右緣 ${left + width} 超過 1300`);
    assert.ok(top + height <= 920, `卡底 ${top + height} 進了字幕區`);
    assert.doesNotMatch(css, /\d+\.\d+px/);
    for (const m of body.matchAll(/class="[^"]*\bsc-t(\d+)\b/g)) assert.ok(+m[1] >= 52, `字級 sc-t${m[1]} 低於正文下限 52`);
    // 撐開／變形後的寬度仍在卡內（卡內寬 1176，左右內距 56）
    for (const m of code.matchAll(/width:\s*(\d+)/g)) assert.ok(+m[1] <= 1064 + 8, `變形後寬度 ${m[1]} 超出卡內`);
  });

  test(`${id}：圖示是 icons.json 原文，每個圖示容器都有 P.icon 描線`, () => {
    const icons = [...body.matchAll(/<span id="([^"]+)" class="sc-icon[^"]*"[^>]*>(<svg[\s\S]*?<\/svg>)<\/span>/g)];
    assert.ok(icons.length >= 2);
    for (const [, iid, svg] of icons) {
      assert.ok(Object.values(ICONS).some((s) => norm(s) === norm(svg)), `${iid} 的 svg 不是 icons.json 的原文`);
      assert.ok(new RegExp(`P\\.icon\\('#${iid}'`).test(code), `${iid} 沒有被 P.icon 描線`);
    }
  });

  test(`${id}：0.5 秒前不動、最後一幕停 ≥ 1.5 秒、畫面文字 ≤ 10 字`, () => {
    const P = { BEAT: 0.15, COUNT: 1.2, MORPH: 0.7, BAR: 0.8, IN: 0.5, STROKE: 0.7 };
    const consts = {};   // 依序算出 const 數字（例 const B20 = A + 1.1;）
    for (const m of code.matchAll(/\bconst (\w+) = ([\w.\s+*-]+);/g)) if (m[1] !== 'tl' && m[1] !== 'P') consts[m[1]] = Function(...Object.keys(consts), 'P', `return ${m[2]}`)(...Object.values(consts), P);
    const names = Object.keys(consts);
    const ats = [], ends = [];
    for (const m of code.matchAll(/\bP\.(?!end)(\w+)\(\s*'[^']*'\s*,\s*(?:'[^']*'\s*,\s*)?([^,){]+)(?:[^;]*?\bdur:\s*([\d.]+))?/g)) {   // swap／axis 有兩個選擇器，at 是第三個參數
      const v = Function(...names, 'P', `return ${m[2].trim()}`)(...names.map((n) => consts[n]), P);
      assert.ok(Number.isFinite(v), `看不懂時間「${m[2]}」`);
      ats.push(v); ends.push(v + (m[3] ? Number(m[3]) : 0.7));
    }
    assert.ok(ats.length >= 8);
    assert.ok(Math.min(...ats) >= 0.5, `最早的動畫在 ${Math.min(...ats)} 秒，0.5 秒前不能動`);
    assert.ok(D - Math.max(...ends) >= 1.5, `最後動作 ${Math.max(...ends)} 秒結束，到 D＝${D} 不到 1.5 秒`);
    const texts = [...body.matchAll(/<(?:span|div)[^>]*class="[^"]*sc-t\d+[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s/g, ''));
    assert.ok(texts.length >= 3);
    for (const t of texts) assert.ok([...t].length <= 10, `「${t}」超過 10 字`);
  });

  test(`${id}：檔頭註解交代四件事`, () => {
    const head = text.slice(0, text.indexOf('<html'));
    for (const k of ['適用的口播', '不要用在哪裡', '要改的地方', '時間軸怎麼對到字幕句']) assert.ok(head.includes(k), `檔頭沒寫「${k}」`);
    assert.doesNotMatch(head, /<template|<style|data-composition-id/, '檔頭註解不能出現會干擾 build 解析的字串');
  });
}

test('兩支範例登記成 custom 段：build 的 resolvePlan 通過（fullscreen、接子母畫面）', async () => {
  const L = await lib();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-motion-'));
  fs.mkdirSync(path.join(dir, 'compositions'));
  for (const id of Object.keys(EXAMPLES)) fs.copyFileSync(path.join(CUSTOM, `${id}.html`), path.join(dir, 'compositions', `${id}.html`));
  const res = resolvePlan({
    plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes: [
      { id: 'x01', type: 'custom', src: 'compositions/x-numbers.html', layout: 'fullscreen', from: '#1', duration: 9 },
      { id: 'x02', type: 'custom', src: 'compositions/x-before-after.html', layout: 'fullscreen', from: '#4', duration: 10 },
    ] },
    cues: parseSrt(makeSrt({ n: 12 })), videoDur: 60, lib: L, outDir: dir,
  });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.items.map((x) => [x.id, x.D, x.opaque, x.pip]), [['x01', 9, true, true], ['x02', 10, true, true]]);
});

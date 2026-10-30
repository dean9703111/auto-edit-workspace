// 第二層範例（shared/template/custom/x-*.html）：照 R7.3 骨架、只用 token 顏色、只用 SceneMotion 現有方法、時間與版面規則
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATE, imp } from './helpers.mjs';

const { readCustom } = await imp('lib/assemble.mjs');
const ICONS = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'icons.json'), 'utf8'));
const CUSTOM = path.join(TEMPLATE, 'custom');
const MOTION = fs.readFileSync(path.join(TEMPLATE, 'kit', 'scene-motion.js'), 'utf8');

// 本檔負責的兩支範例（其他 x-*.html 由別的測試檔負責）
const EXAMPLES = { 'x-process': 'xproc', 'x-metaphor': 'xmeta' };
const METHODS = ['in', 'out', 'rise', 'reveal', 'drift', 'maskUp', 'swap', 'axis', 'icon', 'stroke', 'check', 'end'];
const norm = (s) => s.replace(/\s+/g, '').replace(/class="[^"]*"/g, '').replace(/(width|height)="[^"]*"/g, '');

for (const [id, pre] of Object.entries(EXAMPLES)) {
  const file = path.join(CUSTOM, `${id}.html`);
  const text = fs.readFileSync(file, 'utf8');
  const tpl = text.match(/<template[^>]*>([\s\S]*)<\/template>/)[1];
  const css = tpl.match(/<style>([\s\S]*?)<\/style>/)[1];
  const body = tpl.slice(tpl.indexOf('</style>') + 8, tpl.indexOf('<script>'));
  const script = tpl.match(/<script>([\s\S]*?)<\/script>/)[1];
  // 去掉註解再檢查寫法（檔頭註解可以提到色碼、方法名）
  const code = script.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  test(`${id}：build 的 readCustom 檢查通過、layout fullscreen 骨架`, () => {
    const r = readCustom(file, id);
    assert.deepEqual(r.errors, [], r.errors.join('\n'));
    assert.equal(r.compId, id);
    assert.match(text, /<head><meta charset="UTF-8"><title>[^<]+<\/title><\/head>/);
    assert.ok(tpl.includes(`<div id="${id}" data-composition-id="${id}" data-width="1920" data-height="1080" data-duration="`));
    assert.doesNotMatch(tpl, new RegExp(`id="${id}"[^>]*class=`), 'root 不加 class');
    assert.ok(body.includes('<div class="sc-surface-fs fill"></div>'), '第一個子元素是滿版底');
    assert.ok(body.indexOf('sc-surface-fs') < body.indexOf('sc-wcard'));
  });

  test(`${id}：id 加前綴、CSS 全部在 #${id} 範圍內`, () => {
    for (const m of body.matchAll(/(?<![\w-])id="([^"]+)"/g)) assert.ok(m[1] === id || m[1].startsWith(`${pre}-`), `id 沒加前綴：${m[1]}`);
    for (const m of body.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) assert.ok(c.startsWith('sc-') || c === 'fill' || c.startsWith(`${pre}-`), `class 沒加前綴：${c}`);
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((x) => x.split('{')[0].trim()).filter(Boolean);
    assert.ok(rules.length > 3);
    for (const rule of rules) for (const sel of rule.split(',')) assert.ok(sel.trim().startsWith(`#${id}`), `選擇器沒加範圍：${sel}`);
  });

  test(`${id}：$q 與 forEach 兩行照抄、P.end(D)、D 與 data-duration 一致、timeline 登記`, () => {
    assert.ok(script.includes("var $q = function (s) { return typeof s === 'string' ? Array.prototype.slice.call(document.querySelectorAll(s)) : s; };"));
    assert.ok(script.includes("[ 'in', 'out', 'drift', 'reveal', 'rise', 'maskUp', 'sideIn', 'sideOut', 'morph', 'push', 'count', 'bar', 'stroke', 'icon', 'check' ].forEach("));
    assert.ok(script.includes("[ 'swap', 'axis' ].forEach("));
    assert.match(script, /const P = SceneMotion\(tl, document\.getElementById\('x-[\w-]+'\)\);/);
    assert.ok(script.includes(`document.getElementById('${id}')`));
    assert.match(code, /P\.end\(D\);/);
    const D = Number(code.match(/const D = ([\d.]+);/)[1]);
    assert.equal(Number(tpl.match(/data-duration="([\d.]+)"/)[1]), D);
    assert.ok(script.includes(`window.__timelines['${id}'] = tl;`));
  });

  test(`${id}：只用 SceneMotion 現有方法，且 kit 裡真的有`, () => {
    const used = new Set([...code.matchAll(/\bP\.(\w+)\(/g)].map((m) => m[1]));
    assert.ok(used.size >= 4);
    for (const k of used) {
      assert.ok(METHODS.includes(k), `用了不在清單內的 P.${k}`);
      assert.match(MOTION, new RegExp(`\\b${k}: function`), `scene-motion.js 沒有 P.${k}`);
    }
    // 不自己寫補間：沒有 gsap.to／from／fromTo、setTimeout、Math.random、CSS transition
    assert.doesNotMatch(code, /gsap\.(to|from|fromTo)\(|setTimeout|Math\.random|requestAnimationFrame/);
    assert.doesNotMatch(css, /transition|animation|box-shadow|filter|blur|gradient/i, '硬邊、無光暈、無漸層、無 CSS 動畫');
  });

  test(`${id}：只用 token 顏色（沒有色碼、rgb、顏色字）`, () => {
    const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(cssNoComment + body, /#[0-9a-fA-F]{3,8}\b(?![\w-])(?=[\s;,)"'])/, '有寫死的色碼');
    assert.doesNotMatch(cssNoComment, /\brgba?\(|\bhsla?\(/);
    assert.doesNotMatch(cssNoComment, /:\s*(white|black|red|yellow|blue|green)\b/i);
    assert.doesNotMatch(body, /style="[^"]*(color|background)/);
    // 字型不寫字面名稱
    assert.doesNotMatch(cssNoComment, /font-family/);
  });

  test(`${id}：版面：主內容右緣 ≤ 1300、座標整數 px、字級下限、不放進字幕區`, () => {
    const card = css.match(/#xproc?-?\w*card\s*\{[^}]*\}|#xmeta-card\s*\{[^}]*\}/)[0];
    const left = Number(card.match(/left:\s*(\d+)px/)[1]), width = Number(card.match(/width:\s*(\d+)px/)[1]), top = Number(card.match(/top:\s*(\d+)px/)[1]);
    assert.ok(left + width <= 1300, `主卡右緣 ${left + width} 超過 1300（子母畫面禁入區 x 1344 起）`);
    assert.ok(top >= 0);
    // 內容區（body）高度 + 標題列 128 + 邊框 4 要在字幕區（y 920）之上
    const bodyH = Number(css.match(/#(?:xproc|xmeta)-body\s*\{[^}]*height:\s*(\d+)px/)[1]);
    assert.ok(top + 128 + bodyH + 4 <= 920, `卡片底 ${top + 128 + bodyH + 4} 進了字幕區`);
    assert.doesNotMatch(css, /\d+\.\d+px/, '座標與尺寸一律整數 px');
    for (const m of body.matchAll(/class="[^"]*\bsc-t(\d+)\b/g)) assert.ok(Number(m[1]) >= 52, `字級 sc-t${m[1]} 低於正文下限 52`);
    for (const m of css.matchAll(/(left|top|width|height):\s*(-?\d+)px/g)) assert.equal(Number(m[2]) % 1, 0);
  });

  test(`${id}：圖示是 icons.json 的原文（拿掉 class／width／height），且每個圖示容器都有描線`, () => {
    const icons = [...body.matchAll(/<span id="([^"]+)" class="sc-icon">(<svg[\s\S]*?<\/svg>)<\/span>/g)];
    assert.ok(icons.length >= 3);
    for (const [, iid, svg] of icons) {
      assert.ok(Object.values(ICONS).some((s) => norm(s) === norm(svg)), `${iid} 的 svg 不是 icons.json 的原文`);
      assert.ok(code.includes(`#${iid}`), `${iid} 沒有被 P.icon 描線`);
    }
  });

  test(`${id}：0.5 秒前不動、最後一幕停 ≥ 1.5 秒、文字 ≤ 10 字`, () => {
    // 每個 P.xxx(sel, at, …) 的 at：數字或 T 常數；取常數值後檢查
    const consts = Object.fromEntries([...code.matchAll(/\b(T\d)\s*=\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
    const D = Number(code.match(/const D = ([\d.]+);/)[1]);
    const ats = [];
    for (const m of code.matchAll(/\bP\.(?!end)(\w+)\(\s*'[^']*'\s*,\s*([^,){]+)/g)) {
      const expr = m[2].trim();
      const v = Function(...Object.keys(consts), 'P', `return ${expr}`)(...Object.values(consts), { STROKE: 0.7, BEAT: 0.15 });
      assert.ok(Number.isFinite(v), `看不懂時間「${expr}」`);
      ats.push(v);
    }
    assert.ok(ats.length >= 8);
    assert.ok(Math.min(...ats) >= 0.5, `最早的動畫在 ${Math.min(...ats)} 秒，0.5 秒前不能動`);
    const last = Math.max(...ats);
    assert.ok(D - 0.5 - (last + 0.5) >= 1.5, `最後一個動作 ${last} 秒進場，到淡出前不到 1.5 秒（D=${D}）`);
    // 畫面文字：每個節點／句子 ≤ 10 字
    const texts = [...body.matchAll(/<(?:span|div)[^>]*class="[^"]*(?:sc-t\d+)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>(?=\s*(?:<|$))/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s/g, ''));
    assert.ok(texts.length >= 4);
    for (const t of texts) assert.ok([...t].length <= 10, `「${t}」超過 10 字`);
  });

  test(`${id}：檔頭註解交代四件事`, () => {
    const head = text.slice(0, text.indexOf('<html'));
    for (const k of ['適用的口播', '不要用在哪裡', '要改的地方', '時間軸怎麼對到字幕句']) assert.ok(head.includes(k), `檔頭沒寫「${k}」`);
  });
}

test('x-process：連接線貼齊節點、離其他節點 ≥ 16px（用幾何檢查）', () => {
  const css = fs.readFileSync(path.join(CUSTOM, 'x-process.html'), 'utf8');
  const nodes = {};
  for (const m of css.matchAll(/#xproc-n(\d)\s*\{\s*left:\s*(\d+)px;\s*top:\s*(\d+)px;\s*\}/g)) nodes[m[1]] = { x: +m[2], y: +m[3] };
  const W = Number(css.match(/\.xproc-node\s*\{[^}]*width:\s*(\d+)px/)[1]), H = Number(css.match(/\.xproc-node\s*\{[^}]*height:\s*(\d+)px/)[1]);
  assert.equal(Object.keys(nodes).length, 4);
  const paths = [...css.matchAll(/<path id="xproc-c(\d)"[^>]* d="([^"]+)"/g)].map((m) => ({ n: +m[1], d: m[2].match(/-?[\d.]+/g).map(Number) }));
  assert.equal(paths.length, 3);
  const onEdge = (px, py, n) => { const { x, y } = nodes[n]; const inX = px >= x && px <= x + W, inY = py >= y && py <= y + H;
    return (inX && (py === y || py === y + H)) || (inY && (px === x || px === x + W)); };
  for (const { n, d } of paths) {
    assert.ok(onEdge(d[0], d[1], n), `c${n} 起點沒貼齊節點 ${n} 的邊`);
    assert.ok(onEdge(d[d.length - 2], d[d.length - 1], n + 1), `c${n} 終點沒貼齊節點 ${n + 1} 的邊`);
    // 取樣整條三次貝茲曲線，離其他節點（不含自己的起訖）≥ 16px（起訖兩端點附近 8px 內略過）
    const [x0, y0, x1, y1, x2, y2, x3, y3] = d;
    for (let i = 8; i <= 92; i++) {
      const t = i / 100, u = 1 - t;
      const px = u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3;
      const py = u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3;
      for (const k of Object.keys(nodes)) {
        const { x, y } = nodes[k];
        const dx = Math.max(x - px, 0, px - (x + W)), dy = Math.max(y - py, 0, py - (y + H));
        const dist = Math.hypot(dx, dy);
        if (+k !== n && +k !== n + 1) assert.ok(dist >= 16, `c${n} 離節點 ${k} 只有 ${dist.toFixed(1)}px`);
      }
    }
  }
});

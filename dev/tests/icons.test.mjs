// 圖示：描線用的標記、"none" 拿掉圖示、依語氣換預設圖示、清單圖示要嘛全有要嘛全無
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lib, imp, TEMPLATE } from './helpers.mjs';

const { resolveScene } = await imp('lib/scenes.mjs');
const L = await lib();
const scene = (k) => L.scenes.find((s) => s.key === k);
const run = (sc, slots, extra = {}) => resolveScene({ scene: sc, seg: { id: 's01', slots, ...extra }, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: 8 });

test('每個形狀都帶 class="stroke-draw" pathLength="1"，svg 本身不帶 class／width／height', () => {
  const svg = L.icons.get('circle-check');
  assert.ok(svg, 'icons.json 要有 circle-check');
  const shapes = svg.match(/<(path|rect|circle|ellipse|line|polyline|polygon)\b[^>]*>/g) || [];
  assert.ok(shapes.length >= 2);
  for (const s of shapes) assert.match(s, /class="stroke-draw" pathLength="1"/);
  assert.doesNotMatch(svg.match(/<svg\b[^>]*>/)[0], /\s(class|width|height)=/);
});

test('非必填的圖示寫 "none" → 不放圖示、不報錯；必填的寫 "none" → 找不到圖示', () => {
  const r = run(scene('concept'), { text: '概念', icon: 'none' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.ctx.icon, '');
  const r2 = run(scene('fs-flow'), { title: '流程', nodes: ['甲 ｜icon=none', '乙 ｜icon=folder', '丙 ｜icon=folder'] });
  assert.match(r2.errors.join('\n'), /找不到圖示「none」/);
});

// 用假的 scene 測 toneDefault 與清單規則，不綁定任何一個模板的欄位設計
const fake = {
  key: 'fake', num: '99', tone: true,
  slots: {
    icon: { type: 'icon', default: 'star', toneDefault: { warn: 'triangle-alert', good: 'circle-check' } },
    items: { type: 'list', min: 2, maxItems: 4, item: { text: { type: 'text', required: true }, icon: { type: 'icon' } } },
  },
  beats: {}, lists: {},
};

test('toneDefault：沒寫圖示時依 tone 挑預設；寫了就用寫的', () => {
  const pick = (tone, icon) => run(fake, { items: ['一', '二'], ...(icon ? { icon } : {}) }, tone ? { tone } : {}).ctx.icon;
  assert.equal(pick(null), L.icons.get('star'));
  assert.equal(pick('warn'), L.icons.get('triangle-alert'));
  assert.equal(pick('good'), L.icons.get('circle-check'));
  assert.equal(pick('warn', 'folder'), L.icons.get('folder'));
});

test('清單的選填圖示：全有 → itemsHasIcon；全無 → false；只有部分 → ✖', () => {
  const all = run(fake, { items: ['一 ｜icon=folder', '二 ｜icon=scissors'] });
  assert.deepEqual(all.errors, []);
  assert.equal(all.ctx.itemsHasIcon, true);
  const none = run(fake, { items: ['一', '二'] });
  assert.deepEqual(none.errors, []);
  assert.equal(none.ctx.itemsHasIcon, false);
  const part = run(fake, { items: ['一 ｜icon=folder', '二'] });
  assert.match(part.errors.join('\n'), /只有 1／2 項有圖示/);
});

// 加了圖示卡片會變寬：字數上限只在有圖示時收緊（scene.json 的 rules），沒圖示的舊 plan 照樣能用
const limits = [
  ['fs-list 無圖示 18 字', 'fs-list', { title: '清單', items: ['一二三四五六七八九十一二三四五六七八', '短', '短'] }, false],
  ['fs-list 有圖示 18 字', 'fs-list', { title: '清單', items: ['一二三四五六七八九十一二三四五六七八 ｜icon=check', '短 ｜icon=check', '短 ｜icon=check'] }, true],
  ['fs-compare 無圖示欄頭 6 字', 'fs-compare', { title: '對照', leftHead: '一二三四五六', left: ['a', 'b'], rightHead: '六字欄頭好長', right: ['c', 'd'] }, false],
  ['fs-compare 左欄有圖示 6 字', 'fs-compare', { title: '對照', leftHead: '一二三四五六', leftIcon: 'x', left: ['a', 'b'], rightHead: '短', right: ['c', 'd'] }, true],
  ['steps 無圖示 20 字', 'steps', { steps: ['一二三四五六七八九十一二三四五六七八九十', '短'] }, false],
  ['steps 有圖示 18 字', 'steps', { steps: ['一二三四五六七八九十一二三四五六七八 ｜icon=check', '短 ｜icon=check'] }, true],
  ['keywords 無圖示一行 5 字', 'keywords', { items: ['一二三四五', '短'] }, false],
  ['keywords 有圖示一行 5 字', 'keywords', { items: ['一二三四五 ｜icon=check', '短 ｜icon=check'] }, true],
  ['keywords 有圖示 4＋4 字', 'keywords', { items: ['一二三四//五六七八 ｜icon=check', '短 ｜icon=check'] }, false],
  ['key-point 預設圖示 前句 8 字', 'key-point', { lead: '一二三四五六七八', key: '重點' }, true],
  ['key-point "none" 前句 10 字', 'key-point', { icon: 'none', lead: '一二三四五六七八九十', key: '重點' }, false],
  ['summary 預設圖示 15＋15', 'summary', { text: '一二三四五六七八九十一二三四五//一二三四五六七八九十一二三四五' }, false],
  ['summary 預設圖示一行 16 字', 'summary', { text: '一二三四五六七八九十一二三四五六//短' }, true],
  ['summary "none" 18＋18', 'summary', { icon: 'none', text: '一二三四五六七八九十一二三四五六七八//一二三四五六七八九十一二三四五六七八' }, false],
];
for (const [name, key, slots, expectErr] of limits) {
  test(`有圖示才收緊字數：${name}`, () => {
    const r = run(scene(key), slots);
    assert.deepEqual(r.warnings.filter((w) => w.includes('無法執行')), [], '規則要能執行');
    if (expectErr) assert.ok(r.errors.length > 0, '應該報錯');
    else assert.deepEqual(r.errors, []);
  });
}

test('scene-motion.js 有 P.stroke／P.icon／P.check 與常數', () => {
  const src = fs.readFileSync(path.join(TEMPLATE, 'kit', 'scene-motion.js'), 'utf8');
  for (const k of ['stroke: function', 'icon: function', 'check: function', 'STROKE: STROKE', 'CHECK_LAG: CHECK_LAG']) assert.ok(src.includes(k), k);
  assert.match(src, /strokeDasharray: 'none'/, '描完要把虛線設回 none（閉環）');
});

// 第二層範例（custom/x-*.html）貼的圖示：svg 原文（拿掉 class／width／height）都能在 kit/icons.json 找到（spec 003 FR-073）
test('custom 範例的 .sc-icon 都是 icons.json 的原文（x-checklist、x-scene 系列刻意沒有圖示）', () => {
  // x-checklist：勾就是圖示；x-scene 系列：主角是 kit/illus.js 的插圖元件。examples.test 也檢查它們檔頭寫「這支沒有圖示」
  const NOICON = new Set(['x-checklist.html', 'x-scene.html', 'x-scene-example-rec.html', 'x-scene-example-outline.html']);
  const dir = path.join(TEMPLATE, 'custom');
  const raw = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'icons.json'), 'utf8'));
  const norm = (s) => s.replace(/\s+/g, '').replace(/class="[^"]*"/g, '').replace(/(width|height)="[^"]*"/g, '');
  const byNorm = new Map(Object.entries(raw).map(([k, v]) => [norm(v), k]));
  const files = fs.readdirSync(dir).filter((f) => /^x-.*\.html$/.test(f));
  assert.ok(files.length >= 9, `custom/ 只有 ${files.length} 支`);
  for (const f of files) {
    const tpl = fs.readFileSync(path.join(dir, f), 'utf8').match(/<template[^>]*>([\s\S]*)<\/template>/)[1];
    const svgs = [...tpl.matchAll(/<span id="([^"]+)" class="[^"]*\bsc-icon\b[^"]*"[^>]*>(<svg[\s\S]*?<\/svg>)<\/span>/g)];
    if (NOICON.has(f)) { assert.equal(svgs.length, 0, `${f} 刻意不放圖示`); continue; }
    assert.ok(svgs.length >= 1, `${f} 沒有圖示`);
    for (const [, id, svg] of svgs) assert.ok(byNorm.has(norm(svg)), `${f} #${id} 的 svg 不是 icons.json 的原文（到 kit/icons.json 找名稱，原文貼上）`);
  }
});

// 情緒點（plan.json moods，specs/023）：音效照情緒、模板預設讓位、取捨照強弱、講者爆衝推近
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { lib, imp, makeSrt, cueStart, cueEnd } from './helpers.mjs';

const { resolvePlan, jsonTop } = await imp('lib/plan.mjs');
const { buildMain } = await imp('lib/main.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const { validateMoods, moodCues, zoomSpans, moodCandidates, MOOD_KINDS, MOOD_ZOOM } = await imp('lib/moods.mjs');
const L = await lib();
const cues = parseSrt(makeSrt({ n: 80 }));
const VD = 284;
const F = 1 / 30;
const r3 = (x) => +x.toFixed(3);
const run = (scenes, moods, extra = {}) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes, ...(moods ? { moods } : {}), ...extra }, cues, videoDur: VD, lib: L, outDir: os.tmpdir() });
const byId = (res, id) => res.items.find((x) => x.id === id);
const kp = (id, from, extra = {}) => ({ id, scene: 'key-point', from, duration: 4, slots: { key: '重點' }, ...extra });

test('validateMoods：欄位、類別、音效名稱、zoom 都要對；寫對的沒有錯', () => {
  assert.deepEqual(validateMoods(undefined, L.sfx), []);
  assert.deepEqual(validateMoods([{ at: '#3@字幕', kind: 'pain' }, { at: '#5@字幕', kind: 'quote', sfx: null, zoom: true }, { at: '#6', kind: 'win', sfx: 'ding' }], L.sfx), []);
  const errs = validateMoods([{ at: '3', kind: 'pain' }, { at: '#3', kind: 'angry' }, { at: '#3', kind: 'win', sfx: 'boom' }, { at: '#3', kind: 'win', sfx: 'click' }, { at: '#3', kind: 'win', zoom: 'yes' }, { at: '#3', kind: 'win', when: 1 }], L.sfx);
  assert.equal(errs.length, 6, errs.join('\n'));
  assert.match(errs.join('\n'), /moods\[1\]\.kind 只能是 .*"pain"（痛點）/);
  assert.match(validateMoods({}, L.sfx)[0], /moods 要是陣列/);
  // plan.json 第一層認得 moods；寫錯一樣進 errors
  assert.match(run([], [{ at: '#3', kind: 'angry' }]).errors.join('\n'), /moods\[0\]\.kind/);
});

test('moodCues：五類各配一顆，峰值對齊詞的開口；sfx: null 不出聲但留著（推近用）', () => {
  const { list, errors } = moodCues([{ at: '#3@字幕', kind: 'land' }, { at: '#9', kind: 'turn', sfx: null }, { at: '#12', kind: 'pain', sfx: 'thunder' }], { cues, sfxConf: L.sfx, videoDur: VD });
  assert.deepEqual(errors, []);
  assert.equal(list[0].sfx.name, MOOD_KINDS.land.sound);
  assert.ok(list[0].event > cueStart(3) && list[0].event < cueEnd(3), '詞在句子中間');
  assert.equal(list[0].sfx.at, r3(Math.max(0, list[0].event - L.sfx.impact.peak + F)));
  assert.equal(list[1].sfx, null);
  assert.equal(list[1].sfxOff, true);
  assert.equal(list[2].sfx.name, 'thunder', '可以指定別顆');
  assert.match(moodCues([{ at: '#3@沒有這個詞', kind: 'land' }], { cues, sfxConf: L.sfx }).errors[0], /找不到詞/);
});

test('取捨：同一分鐘有情緒點，模板預設音效讓位；段上明寫的 sfx 最優先；沒有情緒點的分鐘照舊', () => {
  const res = run([
    kp('s01', '#2', { tone: 'warn' }),          // 0:04.5 預設 alert → 讓位
    kp('s02', '#8', { sfx: 'success' }),        // 0:25.5 明寫 → 留，旁邊的情緒點讓位
    kp('s03', '#20', { tone: 'good' }),         // 1:07.5 那一分鐘沒有情緒點 → 照舊
  ], [{ at: '#3@字幕', kind: 'land' }, { at: '#8@字幕', kind: 'pain' }]);
  assert.deepEqual(res.errors, []);
  assert.equal(byId(res, 's01').sfx, null);
  assert.equal(byId(res, 's01').sfxYield, true);
  assert.equal(byId(res, 's02').sfx.name, 'success');
  assert.equal(byId(res, 's03').sfx.name, 'success');
  assert.equal(res.moods[0].sfx.name, 'impact');
  assert.equal(res.moods[1].sfx, null, '和明寫的音效相距不到 3 秒');
  assert.match(res.warnings.join('\n'), /moods\[1\].*和 s02 明寫的音效只差/);
  assert.match(res.sfxBudget.lines.join('\n'), /情緒點：2 個（音效 1 顆、不出聲 1 個；模板預設音效讓位 1 顆）/);
});

test('取捨：3 秒內兩個情緒點留比較強的；一分鐘超過 2 顆照強弱拿（金句 > 痛點 > 落定）', () => {
  const near = run([], [{ at: '#2', kind: 'land' }, { at: '#2+1', kind: 'turn' }]);
  assert.equal(near.moods[0].sfx, null);
  assert.equal(near.moods[1].sfx.name, 'shine');
  const dense = run([], [{ at: '#2', kind: 'land' }, { at: '#5', kind: 'pain' }, { at: '#9', kind: 'quote' }]);
  assert.deepEqual(dense.moods.map((m) => m.sfx?.name ?? null), [null, 'alert', 'sparkle']);
  assert.match(dense.sfxBudget.lines.join('\n'), /moods\[0\].*每分鐘 2 顆的上限/);
});

test('每集上限：反轉超過 3 次，後面的 shine 換成 ding', () => {
  const res = run([], [2, 20, 38, 56].map((n) => ({ at: `#${n}`, kind: 'turn' })));
  assert.deepEqual(res.moods.map((m) => m.sfx.name), ['shine', 'shine', 'shine', 'ding']);
  assert.equal(res.moods[3].sfx.at, r3(Math.max(0, res.moods[3].event - L.sfx.ding.peak + F)), '換音效後重新對峰值');
});

test('音效稀疏：有用情緒點的專案提示補情緒點', () => {
  const res = run([], [{ at: '#2', kind: 'win' }]);
  assert.match(res.warnings.join('\n'), /音效稀疏.*moods 加一個點/);
});

test('zoomSpans：推到句尾、最多 2.5 秒、遇到接點提早收；講者被蓋住、同一分鐘第二次、太短的拿掉', () => {
  const mk = (n, kind = 'turn', zoom = true) => ({ i: n, where: `m${n}`, kind, event: cueStart(n) + 0.5, zoom, rank: MOOD_KINDS[kind].rank, n });
  const a = zoomSpans([mk(3)], { cues, videoDur: VD });
  assert.deepEqual(a.zooms.map((z) => [z.a, z.b, z.scale]), [[r3(cueStart(3) + 0.5), r3(cueStart(3) + 0.5 + MOOD_ZOOM.maxHold), 1.25]]);
  const cut = zoomSpans([mk(3)], { cues, videoDur: VD, cutPoints: [cueStart(3) + 1.5] });
  assert.equal(cut.zooms[0].b, r3(cueStart(3) + 1.5));
  const short = zoomSpans([mk(3)], { cues, videoDur: VD, cutPoints: [cueStart(3) + 0.9] });
  assert.equal(short.zooms.length, 0);
  assert.match(short.notes[0], /0\.8 秒內就有接點/);
  const hidden = zoomSpans([mk(3)], { cues, videoDur: VD, speakerVisible: () => false });
  assert.match(hidden.notes[0], /講者被整張幕/);
  const twice = zoomSpans([mk(2, 'land'), mk(6, 'quote')], { cues, videoDur: VD });
  assert.deepEqual(twice.zooms.map((z) => z.where), ['m6'], '同一分鐘留情緒比較強的');
});

test('build：情緒點音效進 index.html（sfx-mood<N>）；推近寫成 #footage 的 scale 補間，收的時候切回', () => {
  const res = run([], [{ at: '#3@字幕', kind: 'quote', zoom: true }, { at: '#30', kind: 'win' }]);
  assert.deepEqual(res.errors, []);
  assert.equal(res.zooms.list.length, 1);
  const z = res.zooms.list[0];
  assert.equal(z.base, 1);
  assert.equal(res.zooms.origin, '960px 440px', '講者框中心、上方 30%（臉）');
  const { html } = buildMain({ items: res.items, videoDur: VD, captions: null, pip: res.globals.pip, cues: res.cuesOut, moods: res.moods, zooms: res.zooms });
  assert.match(html, /<audio id="sfx-mood1" src="assets\/sfx\/sparkle\.wav"/);
  assert.match(html, /<audio id="sfx-mood2" src="assets\/sfx\/success\.wav"/);
  assert.ok(html.includes(`tl.fromTo('#footage', { scale: 1 }, { scale: 1.25, duration: 0.2, ease: 'expo.out', immediateRender: false }, ${z.a});`));
  assert.ok(html.includes(`tl.set('#footage', { scale: 1 }, ${z.b});`));
  assert.match(html, /#footage \{ transform-origin: 960px 440px; \}/);
  // --check --json 的 moods（剪輯台音效軌、分鏡表情緒點表讀這個）
  const top = jsonTop(res);
  assert.deepEqual(Object.keys(top.moods[0]), ['i', 'kind', 'at', 'outAt', 'sfx', 'dropped', 'off', 'zoom']);
  assert.deepEqual(top.moods.map((m) => [m.kind, m.sfx, m.zoom]), [['quote', 'sparkle', true], ['win', 'success', false]]);
  // 剪映分段（cut）：段落素材不帶情緒點音效
  const seg = buildMain({ items: res.items, videoDur: VD, captions: null, pip: res.globals.pip, moods: res.moods, zooms: res.zooms, cut: { kind: 'main' } });
  assert.doesNotMatch(seg.html, /sfx-mood/);
});

test('moodCandidates：字幕裡的痛點、解法、反轉、數字詞挑出來（詞是字幕裡連續的字）', () => {
  const cs = [{ n: 1, text: '千萬不要直接刪掉' }, { n: 2, text: '這樣就解決了' }, { n: 3, text: '沒想到它竟然會當機' }, { n: 4, text: '前後只花了一個小時' }, { n: 5, text: '大家好' }];
  const out = moodCandidates(cs);
  assert.deepEqual(out.map((x) => [x.n, x.kind, x.word]), [[1, 'pain', '千萬不要'], [2, 'win', '解決'], [3, 'turn', '沒想到'], [4, 'land', '一個小時']]);
  for (const x of out) assert.ok(cs.find((c) => c.n === x.n).text.includes(x.word));
});

test('分鏡表情緒點表：時間、音效照 --check --json；推不到照實寫；取消勾拿掉、勾回候選加回（moods 放在 scenes 前面）', async () => {
  const { moodRows, applyStoryboard } = await imp('lib/storyboard-gen.mjs');
  const plan = { version: 1, scenes: [], moods: [{ at: '#3@字幕', kind: 'land' }, { at: '#9', kind: 'turn', zoom: true }] };
  const merged = { moods: [...plan.moods, { at: '#20', kind: 'pain', zoom: true }] };
  const moodTimes = [{ i: 0, at: 7.5, sfx: null, dropped: 'impact', off: false, zoom: false }, { i: 1, at: 25, sfx: 'shine', off: false, zoom: false }];
  const rows = moodRows({ plan, merged, cues, moodTimes });
  assert.deepEqual(rows.map((r) => [r.at, r.t, r.sound, r.zoom, r.on]), [
    ['#3@字幕', 7.5, '讓位（impact）', false, true],
    ['#9', 25, 'shine', 'lost', true],
    ['#20', cueStart(20), 'alert', true, false],
  ]);
  const md = ['## 需要我決定的事', '', '### 情緒點', '', '| 點 | 綁在 | 時間碼 | 情緒 | 音效 | 推近 | 要不要 ☐ |', '|---|---|---|---|---|---|---|',
    '| 1 | #3@字幕 | 0:07.50 | 落定 | 讓位（impact） | — | ☐ |',
    '| 2 | #9 | 0:25.00 | 反轉 | shine | 推不到（講者被蓋住或同一分鐘已推近） | ☑ |',
    '| 3 | #20 | 1:07.00 | 痛點 | alert | 推近 | ☑ |', ''].join('\n');
  const out = applyStoryboard(md, plan);
  assert.deepEqual(out.plan.moods, [{ at: '#9', kind: 'turn', zoom: true }, { at: '#20', kind: 'pain', zoom: true }]);
  assert.deepEqual(Object.keys(out.plan), ['version', 'moods', 'scenes']);
  assert.ok(out.changes.some((c) => /取消 #3@字幕（落定）/.test(c)) && out.changes.some((c) => /加回 #20（痛點）/.test(c)), out.changes.join('\n'));
});

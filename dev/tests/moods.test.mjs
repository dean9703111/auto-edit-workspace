// 情緒點（plan.json moods，specs/023）：音效照情緒、模板預設讓位、取捨照強弱、講者爆衝推近
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
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

test('取捨（030）：模板的固定配對照常出聲，離情緒點不到 3 秒才讓；段上明寫的 sfx 最優先', () => {
  const res = run([
    kp('s01', '#2', { tone: 'warn' }),          // 0:04.5 預設 alert；同一分鐘有情緒點、但相距超過 3 秒 → 照常出聲（原本整分鐘讓位）
    kp('s02', '#8', { sfx: 'success' }),        // 0:25.5 明寫 → 留，旁邊的情緒點讓位
    kp('s03', '#20', { tone: 'good' }),         // 1:07.5 附近沒有情緒點 → 照舊
    kp('s04', '#12'),                           // 0:39.5 同一分鐘有情緒點、但相距超過 3 秒 → 照常出聲（重點卡配咚咚）
  ], [{ at: '#3@字幕', kind: 'land' }, { at: '#8@字幕', kind: 'pain' }]);
  assert.deepEqual(res.errors, []);
  assert.equal(byId(res, 's01').sfx.name, 'alert');
  assert.equal(byId(res, 's04').sfx.name, 'impact', '重點卡的固定配對是咚咚（作者的定剪用最多的一顆）');
  assert.equal(byId(res, 's02').sfx.name, 'success');
  assert.equal(byId(res, 's03').sfx.name, 'success');
  assert.equal(res.moods[0].sfx.name, 'impact');
  assert.equal(res.moods[1].sfx, null, '和明寫的音效相距不到 3 秒');
  assert.match(res.warnings.join('\n'), /moods\[1\].*和 s02 明寫的音效只差/);
  assert.match(res.sfxBudget.lines.join('\n'), /情緒點：2 個（音效 1 顆、不出聲 1 個；模板預設音效讓位 0 顆）/);
});

test('取捨：3 秒內兩個情緒點留比較強的；一分鐘超過 5 顆照強弱拿（金句 > 痛點 > 落定）', () => {
  const near = run([], [{ at: '#2', kind: 'land' }, { at: '#2+1', kind: 'turn' }]);
  assert.equal(near.moods[0].sfx, null);
  assert.equal(near.moods[1].sfx.name, 'ding', '055 Q4：反轉預設是丁（原本 shine）');
  const three = run([], [{ at: '#2', kind: 'land' }, { at: '#5', kind: 'pain' }, { at: '#9', kind: 'quote' }]);
  assert.deepEqual(three.moods.map((m) => m.sfx?.name ?? null), ['impact', 'alert', 'sparkle'], '一分鐘 3 顆現在留得住');
  const dense = run([], [{ at: '#2', kind: 'land' }, { at: '#4', kind: 'pain' }, { at: '#6', kind: 'quote' }, { at: '#8', kind: 'win' }, { at: '#10', kind: 'turn' }, { at: '#12', kind: 'land' }]);
  assert.deepEqual(dense.moods.map((m) => m.sfx?.name ?? null), ['impact', 'alert', 'sparkle', 'success', 'ding', null], '最弱的落定拿掉一顆（同一級留前面那個）');
  assert.equal(dense.moods.filter((m) => m.sfx).length, 5, '同一分鐘 6 個情緒點 → 留 5 顆');
  assert.match(dense.sfxBudget.lines.join('\n'), /每分鐘 5 顆的上限/);
});

test('030 反應音效：踩坑、解法不在動畫段裡打在句尾前 0.2 秒；落定、指定別顆的照舊對齊那個詞', () => {
  const res = run([], [{ at: '#3@字幕', kind: 'pain' }, { at: '#9@字幕', kind: 'win' }, { at: '#15@字幕', kind: 'land' }, { at: '#21@字幕', kind: 'pain', sfx: 'thunder' }]);
  assert.deepEqual(res.errors, []);
  assert.equal(res.moods[0].sfx.at, r3(cueEnd(3) - 0.2));
  assert.equal(res.moods[0].sfx.tail, true);
  assert.equal(res.moods[1].sfx.at, r3(cueEnd(9) - 0.2));
  assert.ok(res.moods[2].sfx.at < cueEnd(15) - 0.5 && !res.moods[2].sfx.tail, '落定對齊那個詞');
  assert.ok(!res.moods[3].sfx.tail, '打雷是氣氛，不挪到句尾');
});

test('每集上限：shine 超過 3 次，後面的 shine 換成 ding', () => {
  const res = run([], [2, 20, 38, 56].map((n) => ({ at: `#${n}`, kind: 'turn', sfx: 'shine' })));
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

test('031 自備角色（checkin、question、wow）：沒放的機器也能寫，改用內建的；放了就用自備的；tick 不能自己寫；超過每集上限的換回去', async () => {
  const { LOCAL_ROLES, sfxActual } = await imp('lib/sfx-local.mjs');
  assert.deepEqual(Object.keys(LOCAL_ROLES).sort(), ['checkin', 'question', 'tick', 'wow']);
  // 沒放：寫了不報錯
  assert.deepEqual(validateMoods([{ at: '#3', kind: 'win', sfx: 'checkin' }, { at: '#9', kind: 'pain', sfx: 'question' }, { at: '#12', kind: 'win', sfx: 'wow' }], L.sfx), []);
  assert.match(validateMoods([{ at: '#3', kind: 'win', sfx: 'tick' }], L.sfx)[0], /sfx 只能是/);
  assert.equal(sfxActual('checkin', L.sfx), 'success');
  assert.equal(sfxActual('question', L.sfx), null);
  assert.equal(sfxActual('ding', L.sfx), 'ding');
  assert.equal(sfxActual('boom', L.sfx), undefined);
  const a = moodCues([{ at: '#3', kind: 'win', sfx: 'checkin' }, { at: '#9', kind: 'pain', sfx: 'question' }], { cues, sfxConf: L.sfx, videoDur: VD });
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.list.map((x) => x.sfx.name), ['success', 'alert'], 'checkin → 完成音；question 沒有替代 → 照痛點配 alert');
  // 放了：用自備的，音量、對準點照它自己的
  const mine = { ...L.sfx, checkin: { kind: 'sfx', zh: '打卡成功', peak: 0.3, volume: 0.4, targetDb: -3.5, additive: false, maxPerVideo: 5, variants: [], local: true }, question: { kind: 'sfx', zh: '疑問', peak: 0.2, volume: 0.5, targetDb: -3, additive: false, maxPerVideo: 1, variants: [], local: true }, tick: { kind: 'sfx', zh: '秒針', peak: 0.37, volume: 1, targetDb: -16, additive: false, maxPerVideo: null, variants: [], local: true } };
  const b = moodCues([{ at: '#3', kind: 'win', sfx: 'checkin' }], { cues, sfxConf: mine, videoDur: VD });
  assert.equal(b.list[0].sfx.name, 'checkin');
  assert.equal(b.list[0].sfx.volume, 0.4);
  assert.equal(b.list[0].sfx.at, r3(cueStart(3) - 0.3 + F));
  assert.match(validateMoods([{ at: '#3', kind: 'win', sfx: 'tick' }], mine)[0], /sfx 只能是/, '放了 tick 也不能自己寫（工具自動配）');
  // question 一集最多一次：第二顆換成那個情緒點的類別音效
  const res = resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], moods: [{ at: '#3', kind: 'pain', sfx: 'question' }, { at: '#30', kind: 'pain', sfx: 'question' }], scenes: [] }, cues, videoDur: VD, lib: { ...L, sfx: mine }, outDir: os.tmpdir() });
  assert.deepEqual(res.errors ?? [], []);
  assert.deepEqual(res.moods.map((m) => m.sfx?.name), ['question', 'alert']);
});

test('031 段上寫自備角色：沒放改用內建的（question 不出聲）；tick 寫在段上 ✖', () => {
  const ok = run([kp('s01', '#3', { sfx: 'checkin' }), kp('s02', '#12', { sfx: 'question' }), kp('s03', '#20', { sfx: { name: 'wow', at: '#20' } })]);
  assert.deepEqual(ok.errors, []);
  assert.equal(byId(ok, 's01').sfx.name, 'success');
  assert.ok(!byId(ok, 's02').sfx, 'question 沒放、也沒有替代的：不出聲');
  assert.equal(byId(ok, 's03').sfx.name, 'success');
  const bad = run([kp('s01', '#3', { sfx: 'tick' })]);
  assert.match(bad.errors.join('\n'), /「tick」（秒針）是工具自動配的/);
});

// ---------- 055 k23、k24：情緒點和動畫音效 3 秒內只出一顆、同一顆不連響、疊在一起 ⚠、上限拿掉的列出來 ----------
const beatDir = (body) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'moods-055-'));
  fs.mkdirSync(path.join(out, 'compositions'), { recursive: true });
  fs.writeFileSync(path.join(out, 'compositions', 'x-beat.html'), `<template id="x-beat-template"><div id="x-beat" data-composition-id="x-beat" data-width="1920" data-height="1080"></div>
<script>
  const tl = gsap.timeline({ paused: true }); const P = SceneMotion(tl);
  ${body}
  window.__timelines["x-beat"] = tl;
</script></template>`);
  return out;
};
const runIn = (out, scenes, moods) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes, ...(moods ? { moods } : {}) }, cues, videoDur: VD, lib: L, outDir: out });
const xseg = (from, to, extra = {}) => ({ id: 'x01', type: 'custom', src: 'compositions/x-beat.html', layout: 'overlay', from, to, ...extra });

test('055 Q4：情緒點反轉的預設音效是丁（橫式直式都一樣）', () => {
  assert.equal(MOOD_KINDS.turn.sound, 'ding');
  const { list } = moodCues([{ at: '#3', kind: 'turn' }], { cues, sfxConf: L.sfx, videoDur: VD });
  assert.equal(list[0].sfx.name, 'ding');
  assert.equal(list[0].sfx.at, r3(Math.max(0, list[0].event - L.sfx.ding.peak + F)), '峰值照丁的對齊');
});

test('055 k23（054 D4）：情緒點和動畫 P.sfx 相距不到 3 秒 → 情緒點不出聲、推近照留、報告寫讓給誰；相距 3 秒以上照常', () => {
  const out = beatDir(`P.sfx('alert', '#5');`);
  const res = runIn(out, [xseg('#4', '#6e')], [{ at: '#5', kind: 'pain', zoom: true }, { at: '#20', kind: 'win' }]);
  assert.deepEqual(res.errors, []);
  assert.equal(res.moods[0].sfx, null, '同一刻的 alert 只響動畫那一顆');
  assert.equal(res.moods[0].dropped, 'alert');
  assert.equal(res.moods[1].sfx.name, 'success', '離動畫很遠的照常');
  assert.equal(res.items.find((x) => x.id === 'x01').sfxExtra.filter((c) => c.name === 'alert').length, 1);
  assert.ok(res.zooms.list.some((z) => z.i === 0), '推近照留');
  assert.ok(res.sfxBudget.lines.some((l) => /^情緒點讓給動畫音效：moods\[0\]（#5 痛點）→x01 的 alert（0:15\.00，相距 0 秒）（和動畫的 P\.sfx 相距不到 3 秒只出一顆；推近照留）$/.test(l)), res.sfxBudget.lines.join('\n'));
  // 動畫拍點在情緒點前 1 秒也一樣（短影片4：#5@焦慮 的情緒點和 P.sfx('alert', '#6@每個都要學')）
  const out2 = beatDir(`P.sfx('alert', '#5', 1);`);
  const r2 = runIn(out2, [xseg('#4', '#6e')], [{ at: '#5', kind: 'quote' }]);
  assert.equal(r2.moods[0].sfx, null);
  assert.equal(r2.moods[0].dropped, 'sparkle');
  // 相距剛好 3 秒以上：兩顆都留
  const out3 = beatDir(`P.sfx('alert', '#4');`);
  const r3x = runIn(out3, [xseg('#4', '#6e')], [{ at: '#5', kind: 'quote' }]);
  assert.equal(r3x.moods[0].sfx.name, 'sparkle', '相距 3.5 秒');
});

test('055 k23：同一顆非 additive 音效 3 秒內響兩次（不管來源）→ 拿掉後面那顆、⚠；click 不算', () => {
  const out = beatDir(`P.sfx('impact', '#5');\n  P.sfx('impact', '#5', 1.5);\n  P.sfx('click', '#5', 0.5);\n  P.sfx('click', '#5', 1);`);
  const res = runIn(out, [xseg('#4', '#6e')]);
  const x = res.items.find((i) => i.id === 'x01');
  assert.deepEqual(x.sfxExtra.map((c) => c.name), ['impact', 'click', 'click'], '後面那顆 impact 拿掉，點擊照留');
  assert.ok(res.warnings.some((w) => w === '[x01 custom] 的 impact（動畫的 P.sfx，0:16.50）和 x01 的 impact（0:15.00）相距 1.5 秒（< 3 秒），同一顆音效連響兩次，已拿掉後面這顆 → 兩顆都要就把其中一顆換成別的音效；不要這顆就在 compositions/x-beat.html 拿掉那個 P.sfx'), res.warnings.join('\n'));
});

test('055 k24（054 C19）：拿掉之後還有兩顆音效峰值相距 < 0.4 秒 → ⚠ 疊在一起；0.4 秒以上不報', async () => {
  const out = beatDir(`P.sfx('success', '#5');\n  P.sfx('alert', '#5', 0.2);`);
  const res = runIn(out, [xseg('#4', '#6e')]);
  const w = res.warnings.filter((x) => x.includes('兩顆音效疊在一起'));
  assert.equal(w.length, 1, res.warnings.join('\n'));
  assert.match(w[0], /^\[x01 custom\] 的 alert（動畫的 P\.sfx，0:15\.2\d）和 x01 的 success（動畫的 P\.sfx）只差 0\.2 秒，兩顆音效疊在一起 → 留一顆：在 compositions\/x-beat\.html 拿掉其中一個 P\.sfx$/);
  // deliver 的回報段也要帶（lib/build-summary.mjs isSfxWarn）
  const { isSfxWarn } = await imp('lib/build-summary.mjs');
  assert.ok(isSfxWarn(`⚠ ${w[0]}`));
  const ok = runIn(beatDir(`P.sfx('success', '#5');\n  P.sfx('alert', '#5', 0.5);`), [xseg('#4', '#6e')]);
  assert.ok(!ok.warnings.some((x) => x.includes('兩顆音效疊在一起')));
});

test('055 k23：每分鐘上限照實際出聲的算（讓位的情緒點不算）、拿掉的列出是哪一段哪一顆', () => {
  // 一分鐘內 6 顆動畫拍點（都不一樣、相距 ≥ 3 秒）：上限 5 → 拿掉一顆，報告列出來
  const body = [['impact', 2], ['success', 4], ['alert', 6], ['ding', 8], ['sparkle', 10], ['thunder', 12]].map(([n, k]) => `P.sfx('${n}', '#${k}');`).join('\n  ');
  const out = beatDir(body);
  const res = runIn(out, [xseg('#2', '#13e')]);
  assert.equal(res.items.find((i) => i.id === 'x01').sfxExtra.length, 5);
  const line = res.sfxBudget.lines.find((l) => l.startsWith('音效上限拿掉的：'));
  assert.match(line ?? '', /^音效上限拿掉的：x01 的 \w+ \d:\d\d\.\d\d（動畫拍點） → 想留哪一顆/, res.sfxBudget.lines.join('\n'));
  // 情緒點和動畫拍點同一刻：讓位之後只算一顆，不會再擠掉別的拍點（短影片2 x0107 的 impact 被吃掉）
  const five = [['impact', 2], ['success', 4], ['alert', 6], ['ding', 8], ['sparkle', 10]].map(([n, k]) => `P.sfx('${n}', '#${k}');`).join('\n  ');
  const r2 = runIn(beatDir(five), [xseg('#2', '#13e')], [{ at: '#2', kind: 'pain' }]);
  assert.equal(r2.moods[0].sfx, null);
  assert.equal(r2.items.find((i) => i.id === 'x01').sfxExtra.length, 5, '5 顆拍點都留著');
  assert.ok(!r2.sfxBudget.lines.some((l) => l.startsWith('音效上限拿掉的：')));
});

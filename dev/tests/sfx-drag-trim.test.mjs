// 065 音效拖曳換位置、裁前後（剪輯台時間軸）：
//   plan.json 的 edit.sfxAdjust（AI 配的那一顆：段落主音效、附加音效、動畫拍點、情緒點；用 id 指）與 edit.sfx 的 trimIn／trimOut（自己加的）
//   lib/edit.mjs 檢查格式、editor/server/write.mjs 存檔、lib/plan.mjs 套用（位移、裁切、擋下拖出那一段／裁太短／對不到的）、
//   --check --json 給剪輯台的 key／base／len、lib/main.mjs 寫 <audio> 的 data-start／data-media-start／data-duration／data-fade-*、還原＝拿掉覆寫、
//   頁面的 model（adjOf、setAdj、sfxSpan）、完成影片預覽要不要更新（liveStrip）。真的 render 量聲音在 sfx-drag-trim-mix.test.mjs（要 Chrome）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lib, imp, makeSrt, tmpDir, WORKSPACE } from './helpers.mjs';

const { normalizeEdit } = await imp('lib/edit.mjs');
const { resolvePlan, jsonItems, jsonTop } = await imp('lib/plan.mjs');
const { buildMain } = await imp('lib/main.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const { wavSeconds } = await imp('lib/sfx-local.mjs');
const { sanitizeEdit, applySave } = await imp('editor/server/write.mjs');
const M = await imp('editor/model.mjs');
const LS = await imp('editor/live-sound.mjs');
const L = await lib();
const cues = parseSrt(makeSrt({ n: 12 }));
const VD = 44, F = 1 / 30;
const r3 = (x) => +x.toFixed(3);
const SFX_DIR = path.join(WORKSPACE, 'shared', 'sfx');
const DING = wavSeconds(path.join(SFX_DIR, 'ding.wav'));

// s01（#1–#2e＝1–7.5 秒）明寫 ding；x01 動畫（#3–#5e＝8–18 秒）：clicks 兩顆、P.sfx 兩顆 ding（#3＝8 秒、#5＝15 秒）；情緒點在 #10（32.5 秒）
const outDir = tmpDir(null, 'sfx-drag-trim-');
fs.mkdirSync(path.join(outDir, 'compositions'));
fs.writeFileSync(path.join(outDir, 'compositions', 'x-beat.html'), `<template id="x-beat-template"><div id="x-beat" data-composition-id="x-beat" data-width="1920" data-height="1080"></div>
<script>
  const tl = gsap.timeline({ paused: true }); const P = SceneMotion(tl);
  P.sfx('ding', '#3');
  P.sfx('ding', '#5');
  window.__timelines["x-beat"] = tl;
</script></template>`);
const SCENES = [
  { id: 's01', scene: 'concept', from: '#1', to: '#2e', sfx: 'ding', slots: { text: '一般字卡' } },
  { id: 'x01', type: 'custom', src: 'compositions/x-beat.html', layout: 'overlay', from: '#3', to: '#5e', clicks: ['+1', '#4'] },
];
const MOODS = [{ at: '#10', kind: 'win' }];
const run = (edit, extra = {}) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], ...(edit !== undefined ? { edit } : {}), moods: MOODS, scenes: SCENES, ...extra }, cues, videoDur: VD, lib: L, outDir, sfxDir: SFX_DIR });
const byId = (res, id) => res.items.find((x) => x.id === id);
const cuesOf = (res) => [...res.items.flatMap((it) => [it.sfx, ...(it.sfxExtra || [])]), ...res.moods.map((m) => m.sfx)].filter(Boolean);
const cueOf = (res, key) => cuesOf(res).find((c) => c.key === key);
const html = (res, extra = {}) => buildMain({ items: res.items, videoDur: res.outDur, captions: null, pip: res.globals.pip, sideShift: res.globals.sideShift, footage: res.footage, editFx: res.editFx, moods: res.moods, userSfx: res.userSfx || [], ...extra }).html;
const audio = (h, id) => (h.match(new RegExp(`<audio id="${id}"[^>]*></audio>`)) || [null])[0];

test('normalizeEdit：sfxAdjust 照 id 排、同一顆留後面那筆（⚠）、全是 0 的拿掉；edit.sfx 的 trimIn／trimOut；格式錯 ✖；不算 active', () => {
  const r = normalizeEdit({
    sfx: [{ at: 5, sound: 'ding', trimIn: 0.10004, trimOut: 0 }],
    sfxAdjust: [{ id: 's02', shift: 0.5 }, { id: 'mood:1', trimOut: 0.2 }, { id: 's01', shift: 0 }, { id: 's02', shift: -0.25, trimIn: 0.05 }, { id: 'x01:ding:2', trimIn: 0.2 }],
  }, { videoDur: VD });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.edit.sfx, [{ at: 5, sound: 'ding', trimIn: 0.1 }], 'trimOut 0 不寫');
  assert.deepEqual(r.edit.sfxAdjust, [{ id: 'mood:1', trimOut: 0.2 }, { id: 's02', shift: -0.25, trimIn: 0.05 }, { id: 'x01:ding:2', trimIn: 0.2 }], '照 id 排；s01 全是 0 拿掉；s02 留後面那筆');
  assert.ok(r.warnings.some((w) => /sfxAdjust\[3\]：和 sfxAdjust\[0\] 都是 s02，只留後面這個/.test(w)), r.warnings.join('\n'));
  assert.equal(r.active, false, '只動音效：底片照舊');
  assert.ok(!('sfxAdjust' in normalizeEdit({ sfxAdjust: [] }, { videoDur: VD }).edit), '空的就沒有這個鍵');
  assert.ok(!('sfxAdjust' in normalizeEdit({ sfxAdjust: [{ id: 's01', shift: 0, trimIn: 0 }] }, { videoDur: VD }).edit));
  const bad = normalizeEdit({ sfxAdjust: [{ id: 's-1' }, { id: 's01', shift: 'x' }, { id: 's01', trimIn: -1 }, { id: 's01', extra: 1 }, { id: 'mood:0' }, 'x'], sfx: [{ at: 1, sound: 'ding', trimOut: 11 }] }, { videoDur: VD }).errors.join('\n');
  for (const re of [/sfxAdjust\[0\]\.id 要指到一顆音效/, /sfxAdjust\[1\]\.shift 要是 −600～\+600 的秒數/, /sfxAdjust\[2\]\.trimIn 要是 0–10 的秒數/, /sfxAdjust\[3\]\.extra：沒有這個欄位（可用：id、shift、trimIn、trimOut）/, /sfxAdjust\[4\]\.id 要指到一顆音效/, /sfxAdjust\[5\] 要是物件/, /sfx\[0\]\.trimOut 要是 0–10 的秒數/]) assert.match(bad, re);
  assert.match(normalizeEdit({ sfxAdjust: {} }, { videoDur: VD }).errors.join('\n'), /sfxAdjust 要寫成陣列/);
});

test('剪輯台存檔（sanitizeEdit／applySave）：sfxAdjust、trimIn／trimOut 寫回 plan.json 的 edit；裁到剩不到 0.1 秒擋下來；拿掉＝欄位不見、其他字不動', () => {
  const ctx = { videoDur: 40, schema: { sfx: [{ name: 'ding', volume: 0.733, peak: 0.01, seconds: DING }] }, memory: {} };
  const ok = sanitizeEdit({ sfx: [{ at: 5, sound: 'ding', trimIn: 0.1004, trimOut: 0 }], sfxAdjust: [{ id: 's02', shift: 0.4 }, { id: 's01', shift: 0, trimIn: 0 }] }, ctx);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.edit.sfx, [{ at: 5, sound: 'ding', trimIn: 0.1 }]);
  assert.deepEqual(ok.edit.sfxAdjust, [{ id: 's02', shift: 0.4 }]);
  assert.match(sanitizeEdit({ sfx: [{ at: 5, sound: 'ding', trimIn: 0.5, trimOut: 0.3 }] }, ctx).errors.join('\n'), /edit\.sfx 第 1 項裁到剩不到 0\.1 秒（檔案 0\.865 秒，前面裁 0\.5、後面裁 0\.3）/);
  const bad = sanitizeEdit({ sfxAdjust: [{ id: 'bad id' }, { id: 's01', shift: 700 }, { id: 's01', trimOut: 'x' }, { id: 's01', loop: 1 }] }, ctx).errors.join('\n');
  for (const re of [/edit\.sfxAdjust 第 1 項的 id 要指到一顆音效/, /第 2 項的 shift 要是 −600～\+600 的秒數/, /第 3 項的 trimOut 要是 0–10 的秒數/, /第 4 項不能有「loop」/]) assert.match(bad, re);
  const PLAN = `{\n  "version": 1,\n  "scenes": [\n    { "id": "s01", "scene": "concept", "from": "#1", "to": "#2e", "slots": { "text": "字卡" } }\n  ]\n}\n`;
  const a = applySave(PLAN, { edit: { sfx: [{ at: 5, sound: 'ding', trimOut: 0.2 }], sfxAdjust: [{ id: 's01', shift: -0.3, trimIn: 0.05 }] } }, ctx);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(Object.keys(a.plan.edit), ['cuts', 'fadeIn', 'fadeOut', 'volume', 'gains', 'joins', 'sfx', 'sfxAdjust']);
  assert.ok(a.text.includes('"sfxAdjust": [{ "id": "s01", "shift": -0.3, "trimIn": 0.05 }]'), a.text);
  assert.ok(a.text.includes('"sfx": [{ "at": 5, "sound": "ding", "trimOut": 0.2 }]'), a.text);
  // 還原（頁面拿掉覆寫）＝欄位不見，plan.json 除了 edit 那一塊一個字都沒變
  const b = applySave(a.text, { edit: { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, gains: [], joins: [] } }, ctx);
  assert.ok(!('sfxAdjust' in b.plan.edit) && !b.text.includes('sfxAdjust') && !b.text.includes('trimOut'));
  assert.equal(b.text.replace(/  "edit": \{[\s\S]*?\n  \},\n  /, '  '), PLAN);
});

test('build：每一顆音效有 id（主音效＝段 id、附加的＝段:名稱[:N]、情緒點＝mood:N）；--check --json 給 key、base（沒拖之前）、len（裁之前多長）', () => {
  const res = run();
  assert.deepEqual(res.errors, []);
  assert.equal(byId(res, 's01').sfx.key, 's01');
  assert.deepEqual(byId(res, 'x01').sfxExtra.map((c) => [c.key, c.event]), [['x01:click', 9], ['x01:click:2', 11.5], ['x01:ding', 8], ['x01:ding:2', 15]]);
  assert.equal(res.moods[0].sfx.key, 'mood:1');
  const j = jsonItems(res);
  const s01 = j.find((x) => x.id === 's01').sfx[0];
  assert.deepEqual([s01.key, s01.at, s01.base, s01.len], ['s01', r3(1 - L.sfx.ding.peak + F), r3(1 - L.sfx.ding.peak + F), DING]);
  assert.deepEqual(j.find((x) => x.id === 'x01').sfx.map((c) => c.key), ['x01:click', 'x01:click:2', 'x01:ding', 'x01:ding:2']);
  const mc = jsonTop(res).moods[0].cue;
  assert.deepEqual([mc.key, mc.name, mc.at === mc.base, mc.len > 0], ['mood:1', res.moods[0].sfx.name, true, true]);
});

test('build：拖過、裁過的照新的時間與長度混音（data-start＝開始響、data-media-start＝裁掉的前段、data-duration＝播多久、裁過的那一端 10 ms 淡入淡出）；裁過的不輪替變體', () => {
  const base = run();
  const res = run({ sfx: [{ at: 25, sound: 'ding', trimIn: 0.1, trimOut: 0.3 }], sfxAdjust: [{ id: 's01', shift: 0.5, trimOut: 0.3 }, { id: 'x01:ding:2', trimIn: 0.2 }, { id: 'mood:1', shift: -0.4 }] });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.warnings.filter((w) => /sfxAdjust|edit\.sfx/.test(w)), []);
  const b0 = cueOf(base, 's01').at, d0 = cueOf(base, 'x01:ding:2').at, m0 = cueOf(base, 'mood:1').at;
  const s01 = cueOf(res, 's01'), d2 = cueOf(res, 'x01:ding:2'), md = cueOf(res, 'mood:1');
  assert.deepEqual([s01.at, s01.dur, s01.from, s01.fadeIn, s01.fadeOut], [r3(b0 + 0.5), r3(DING - 0.3), undefined, undefined, 0.01], '主音效：往後 0.5 秒、裁掉後面 0.3 秒');
  assert.equal(s01.event, r3(cueOf(base, 's01').event + 0.5), '那一刻聽到的時間跟著移');
  assert.deepEqual([d2.at, d2.from, d2.dur, d2.fadeIn], [r3(d0 + 0.2), 0.2, r3(DING - 0.2), 0.01], '動畫拍點：裁掉前面 0.2 秒＝晚 0.2 秒開始響、從檔案第 0.2 秒播');
  assert.equal(md.at, r3(m0 - 0.4), '情緒點：往前 0.4 秒');
  const own = res.userSfx[0];
  assert.deepEqual([own.at, own.from, own.dur], [r3(25 - L.sfx.ding.peak + F + 0.1), 0.1, r3(DING - 0.4)], '自己加的：峰值照舊對齊 at，只是前後不播');
  const h = html(res);
  assert.equal(audio(h, 'sfx-s01'), `<audio id="sfx-s01" src="assets/sfx/ding.wav" data-start="${s01.at}" data-duration="${s01.dur}" data-fade-out="0.01" data-track-index="${audio(h, 'sfx-s01').match(/data-track-index="(\d+)"/)[1]}" data-volume="${s01.volume}"></audio>`);
  assert.match(audio(h, 'sfx-x01-e4'), new RegExp(`src="assets/sfx/ding\\.wav" data-start="${d2.at}" data-duration="${d2.dur}" data-media-start="0\\.2" data-fade-in="0\\.01" data-track`), '裁過的用本尊 ding.wav（變體長度不一樣）');
  assert.match(audio(html(base), 'sfx-x01-e4'), /src="assets\/sfx\/ding-\d\.wav"/, '沒裁的照舊輪替變體');
  assert.match(audio(h, 'sfx-mood1'), new RegExp(`data-start="${md.at}" data-track`), '只拖沒裁：不寫 data-duration');
  assert.match(audio(h, 'sfx-own1'), new RegExp(`data-start="${own.at}" data-duration="${own.dur}" data-media-start="0\\.1" data-fade-in="0\\.01" data-fade-out="0\\.01" data-track`));
  // 剪映素材：段落那一支照新的時間帶這顆音效
  const seg = html(res, { test: { t0: byId(res, 's01').start, len: byId(res, 's01').end - byId(res, 's01').start }, cut: { kind: 'seg', id: 's01' } });
  assert.match(audio(seg, 'sfx-s01'), new RegExp(`data-start="${r3(s01.at - byId(res, 's01').start)}" data-duration="${s01.dur}" data-fade-out="0\\.01"`));
});

test('build：有剪段時，位移照 rough.mp4 的時間軸算；--check --json 的 base 是沒拖之前、at 是拖之後（都是 rough 秒數）', () => {
  // 剪掉 [2.5, 3]（s01 裡面）：主音效在 rough 1.023，往後拖 2 秒＝rough 3.023 → 完成影片 2.523
  const res = run({ cuts: [[2.5, 3]], sfxAdjust: [{ id: 's01', shift: 2 }] });
  assert.deepEqual(res.errors, []);
  const c = cueOf(res, 's01');
  assert.equal(c.at, r3(1 - L.sfx.ding.peak + F + 2 - 0.5));
  const j = jsonItems(res).find((x) => x.id === 's01').sfx[0];
  assert.deepEqual([j.base, j.at], [r3(1 - L.sfx.ding.peak + F), r3(1 - L.sfx.ding.peak + F + 2)]);
});

test('build：拖出那一段、對不到任何一顆、裁到剩不到 0.1 秒 → ⚠ 並略過那一項（其他照套）', () => {
  const base = run();
  const res = run({ sfxAdjust: [{ id: 's01', shift: 30 }, { id: 'zz9', shift: 1 }, { id: 'x01:ding', trimIn: 0.5, trimOut: 0.4 }, { id: 'mood:1', shift: 100 }, { id: 'x01:click', shift: 0.5 }] });
  assert.deepEqual(res.errors, []);
  const w = res.warnings.join('\n');
  assert.match(w, /edit\.sfxAdjust 的 s01：往後移 30 秒會跑出 s01（0:01\.00–0:07\.50），已略過位移 → 在剪輯台拖回這一段裡/);
  assert.match(w, /edit\.sfxAdjust 的 zz9：對不到任何一顆音效（那段的音效或動畫改過了？），已略過/);
  assert.match(w, /edit\.sfxAdjust 的 x01:ding：裁完只剩 0 秒（ding 長 0\.865 秒），不到 0\.1 秒，已略過裁剪/);
  assert.match(w, /edit\.sfxAdjust 的 mood:1：往後移 100 秒會超出影片，已略過位移/);
  assert.equal(cueOf(res, 's01').at, cueOf(base, 's01').at);
  assert.equal(cueOf(res, 'x01:ding').dur, undefined);
  assert.equal(cueOf(res, 'x01:click').at, r3(cueOf(base, 'x01:click').at + 0.5), '其他照套');
});

test('build：「疊在一起」照拖過的新位置算（拖之前不報、拖到另一顆上才報）；還原＝拿掉覆寫，主合成和沒拖過一模一樣', () => {
  const base = run();
  const stack = /x01 custom\] 的 ding（動畫的 P\.sfx.*只差 0 秒，兩顆音效疊在一起/;
  assert.doesNotMatch(base.warnings.join('\n'), stack);
  const moved = run({ sfxAdjust: [{ id: 'x01:ding', shift: 7 }] });   // 8 秒那顆拖到 15 秒（另一顆 ding 上）
  assert.match(moved.warnings.join('\n'), stack);
  // 還原：sfxAdjust 拿掉（剪輯台存檔時一筆都沒有就不寫）、或全是 0
  for (const edit of [{}, { sfxAdjust: [] }, { sfxAdjust: [{ id: 's01', shift: 0, trimIn: 0, trimOut: 0 }] }]) assert.equal(html(run(edit)), html(base), JSON.stringify(edit));
  assert.notEqual(html(moved), html(base));
});

test('頁面的 model：adjOf／setAdj（合併、0＝拿掉、全拿掉＝整筆拿掉、照 id 排）、sfxSpan（開始響、播多久、從檔案第幾秒）、normEdit 帶 sfxAdjust 與裁切', () => {
  const e = M.defaultEdit();
  assert.deepEqual(e.sfxAdjust, []);
  M.setAdj(e, 's02', { shift: 0.5 });
  M.setAdj(e, 's01', { trimOut: 0.2 });
  M.setAdj(e, 's02', { trimIn: 0.10004 });
  assert.deepEqual(e.sfxAdjust, [{ id: 's01', trimOut: 0.2 }, { id: 's02', shift: 0.5, trimIn: 0.1 }]);
  assert.deepEqual(M.adjOf(e, 's02'), { id: 's02', shift: 0.5, trimIn: 0.1 });
  M.setAdj(e, 's02', { shift: 0, trimIn: 0 });
  assert.deepEqual(e.sfxAdjust, [{ id: 's01', trimOut: 0.2 }], '全拿掉＝還原');
  assert.equal(M.adjOf(e, 's02'), null);
  assert.deepEqual(M.sfxSpan(10, 0.865, { shift: 0.5, trimIn: 0.1, trimOut: 0.2 }), { file: 10.5, start: 10.6, dur: 0.565, off: 0.1, trimIn: 0.1, trimOut: 0.2 });
  assert.deepEqual(M.sfxSpan(10, null, null), { file: 10, start: 10, dur: null, off: 0, trimIn: 0, trimOut: 0 });
  const n = M.normEdit({ sfx: [{ at: 3, sound: 'ding', trimIn: 0.1, trimOut: 0 }], sfxAdjust: [{ id: 's09', shift: -1 }, { id: 'mood:2', trimIn: 0.05 }, { id: 's01' }, { shift: 1 }] });
  assert.deepEqual(n.sfx, [{ at: 3, sound: 'ding', trimIn: 0.1 }]);
  assert.deepEqual(n.sfxAdjust, [{ id: 'mood:2', trimIn: 0.05 }, { id: 's09', shift: -1 }]);
  assert.deepEqual(M.ownSfx(5, 'ding', 0, { trimIn: 0, trimOut: 0.3 }), { at: 5, sound: 'ding', trimOut: 0.3 });
});

test('完成影片預覽：拖過、裁過的動到時間，不算「只差聲音」（指紋變、要更新預覽）；空的 sfxAdjust 和沒寫一樣', () => {
  const p = { version: 1, edit: { cuts: [], sfx: [{ at: 5, sound: 'ding' }] }, scenes: [] };
  const fp = (plan) => JSON.stringify(LS.liveStrip(plan));
  assert.equal(fp({ ...p, edit: { ...p.edit, sfxAdjust: [] } }), fp(p));
  assert.notEqual(fp({ ...p, edit: { ...p.edit, sfxAdjust: [{ id: 's01', shift: 0.3 }] } }), fp(p));
  assert.notEqual(fp({ ...p, edit: { ...p.edit, sfx: [{ at: 5, sound: 'ding', trimIn: 0.1 }] } }), fp(p));
});

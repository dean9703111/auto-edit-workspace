// plan.json 的 edit（影片編輯器）：檢查與正規化、rough ↔ 成片時間對應、cuts 讓段落／字幕／音效重新對時間、
// 底片切片（data-media-start、data-fade-*、data-volume）、dip／punch／整支淡入淡出、gains、sfxVolume、--check --json 的時間換回 rough
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { lib, imp, makeSrt, cueStart, cueEnd } from './helpers.mjs';

const { normalizeEdit, timeMap, remapCues } = await imp('lib/edit.mjs');
const { resolvePlan, jsonItems } = await imp('lib/plan.mjs');
const { buildMain } = await imp('lib/main.mjs');
const { buildCaptions } = await imp('lib/captions.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const L = await lib();
const cues = parseSrt(makeSrt({ n: 12 }));
const VD = 44;
const run = (scenes, edit, extra = {}) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], ...(edit !== undefined ? { edit } : {}), scenes }, cues, videoDur: VD, lib: L, outDir: os.tmpdir(), ...extra });
const byId = (res, id) => res.items.find((x) => x.id === id);
const main = (res, test = null) => buildMain({ items: res.items, videoDur: res.outDur, captions: { compId: 'captions', file: 'compositions/captions.html' }, pip: res.globals.pip, sideShift: res.globals.sideShift, footage: res.footage, editFx: res.editFx, test }).html;
const SCENES = [
  { id: 's01', scene: 'concept', from: '#2', to: '#3e', sfx: 'ding', slots: { text: '一般字卡' } },   // 06 預設不配（2026-11-02），這裡自己配一顆驗音量
  { id: 's02', scene: 'fs-list', from: '#6', to: '#7e', slots: { title: '清單', items: ['一', '二', '三'] } },
];

test('沒有 edit、或 edit 全是預設值：主合成和沒寫 edit 時逐位元組相同', () => {
  const base = main(run(SCENES));
  assert.equal(main(run(SCENES, {})), base);
  assert.equal(main(run(SCENES, { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, gains: [], joins: [] })), base);
  assert.doesNotMatch(base, /media\.css|edit-fade|edit-dip|data-fade-in/);
  const r = normalizeEdit(undefined, { videoDur: VD });
  assert.equal(r.active, false);
  assert.deepEqual(r.edit, { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, gains: [], joins: [] });
});

test('normalizeEdit：cuts 排序合併、範圍與型別檢查、joins 對到剪接點（±0.1s 吸附，否則 ⚠）、gains 重疊 ✖', () => {
  const r = normalizeEdit({ cuts: [[20, 22], [10, 12], [11.5, 13]], fadeIn: 0.5, joins: [{ at: 10.05, type: 'dip' }, { at: 30, type: 'punch' }, { at: 21, type: 'dip' }] }, { videoDur: VD, cutpoints: [{ at: 30.02, kind: 'pause' }] });
  assert.deepEqual(r.edit.cuts, [[10, 13], [20, 22]]);
  assert.ok(r.warnings.some((w) => /重疊，已合併/.test(w)));
  assert.deepEqual(r.edit.joins, [{ at: 10, type: 'dip', dur: 0.3 }, { at: 30.02, type: 'punch' }]);
  assert.ok(r.warnings.some((w) => /joins\[2\]：at 21s 在剪掉的範圍裡/.test(w)));
  assert.equal(r.active, true);
  const far = normalizeEdit({ joins: [{ at: 15, type: 'dip' }] }, { videoDur: VD, cutpoints: [{ at: 12, kind: 'ng' }] });
  assert.ok(far.warnings.some((w) => /joins\[0\]：at 15s 不在剪接點上（最近的是 12s）/.test(w)));
  const bad = normalizeEdit({ cuts: [[5, 3]], fadeIn: -1, volume: { voice: 20, music: 0 }, joins: [{ at: 1, type: 'wipe' }], gains: [{ from: 1, to: 5, db: 3 }, { from: 4, to: 8, db: 1 }], extra: 1 }, { videoDur: VD });
  const all = bad.errors.join('\n');
  for (const re of [/edit\.extra：沒有這個欄位/, /cuts\[0\]：\[5, 3\]/, /fadeIn 要是 0–10/, /volume\.voice 要是 −60～\+12/, /volume\.music：沒有這個欄位/, /joins\[0\]\.type 只能是/, /gains\[1\].*和 gains\[0\].*範圍重疊/]) assert.match(all, re);
});

test('timeMap：rough → 成片（cut 裡的點收到 cut 起點）、成片 → rough（接點上 Start 取後、End 取前）', () => {
  const tm = timeMap([[10, 12], [20, 25]], VD);
  assert.equal(tm.outDur, 37);
  assert.equal(tm.map(5), 5);
  assert.equal(tm.map(11), 10);
  assert.equal(tm.map(15), 13);
  assert.equal(tm.map(30), 23);
  assert.equal(tm.unmapStart(10), 12);
  assert.equal(tm.unmapEnd(10), 10);
  assert.equal(tm.unmapStart(13), 15);
  assert.deepEqual(tm.joinsOut, [10, 18]);
  // 片頭片尾的 cut 只是裁掉，不算接點
  assert.deepEqual(timeMap([[0, 2], [40, 44]], VD).joinsOut, []);
  const c = remapCues(cues, tm);
  assert.equal(c.find((x) => x.n === 4).start, 10);   // 11.5 在 cut 裡
  assert.equal(c.find((x) => x.n === 5).start, cueStart(5) - 2);
});

test('cuts：段落與字幕重新對時間，整段被剪掉的段拿掉並 ⚠、部分重疊的裁短；成片長度＝rough − cuts', () => {
  // #4 是 11.5–14.5；剪掉 11–15 → #4 整句不見
  const res = run([...SCENES, { id: 's03', scene: 'concept', from: '#4', to: '#4e', slots: { text: '整段剪掉' } }], { cuts: [[11, 15]] });
  assert.deepEqual(res.errors, []);
  assert.equal(res.outDur, 40);
  assert.ok(!byId(res, 's03'));
  assert.ok(res.warnings.some((w) => /\[s03 concept\] 整段都在 edit\.cuts 剪掉的範圍裡，已拿掉/.test(w)));
  const s1 = byId(res, 's01');   // #2–#3e＝4.5–11.0：不受影響
  assert.equal(s1.start, cueStart(2));
  const s2 = byId(res, 's02');   // #6 起點 18.5 → 14.5
  assert.equal(s2.start, cueStart(6) - 4);
  assert.equal(s2.end, cueEnd(7) - 4);
  const cap = buildCaptions(res.cuesOut, { duration: res.outDur });
  assert.doesNotMatch(cap.html, /id="cg-4"/, '整句剪掉的字幕不顯示');
  assert.match(cap.html, /id="cg-5"/);
  // 部分重疊：s01 #2–#3e 裡剪掉 6–7
  const res2 = run(SCENES, { cuts: [[6, 7]] });
  assert.equal(byId(res2, 's01').D, cueEnd(3) - cueStart(2) - 1);
  assert.equal(byId(res2, 's01').cutTrim, 1);
  // --check --json 的時間換回 rough.mp4 秒數
  const j = jsonItems(res);
  assert.deepEqual(j.find((x) => x.id === 's02').start, cueStart(6));
  assert.deepEqual(j.find((x) => x.id === 's02').end, cueEnd(7));
  assert.equal(typeof j[0].sfx[0].volume, 'number');
  assert.equal(typeof j[0].sfx[0].db, 'number');
});

test('底片切片：cut 的地方換一支 <video>（data-media-start 跳過剪掉的範圍），接點兩側 0.02s 防爆音；子母畫面也跟著切', () => {
  const res = run(SCENES, { cuts: [[20, 21]] });
  const html = main(res);
  assert.match(html, /<video id="rough" src="assets\/rough\.mp4" data-start="0" data-duration="20" data-media-start="0"\s+data-track-index="0" data-has-audio="true" data-fade-out="0\.02" playsinline>/);
  assert.match(html, /<video id="rough-2" src="assets\/rough\.mp4" data-start="20" data-duration="23" data-media-start="21"\s+data-track-index="0" data-has-audio="true" data-fade-in="0\.02" playsinline>/);
  assert.match(html, /data-composition-id="main" data-start="0" data-duration="43"/);
  // s02（fs-list，有子母畫面）是 18.5–25.0 → 成片 18.5–24.0，cut 收在 20：子母畫面兩支
  assert.match(html, /<video id="pipv-s02" src="assets\/rough\.mp4" data-start="18\.5" data-duration="1\.5" data-media-start="18\.5"/);
  assert.match(html, /<video id="pipv-s02-2" src="assets\/rough\.mp4" data-start="20" data-duration="4" data-media-start="21"/);
  // 幕的進場（v2 色帶擦開）不含子母畫面；cut 切開的第二支接續（enter none、沒有 tween），最後一支在色帶收回時一起淡出（exit layer）
  assert.match(html, /tl\.fromTo\('#el-s02', \{ clipPath: 'inset\(0% 0% 0% 110\.4%\)' \}/);
  assert.doesNotMatch(html, /tl\.fromTo\('#pip-s02-2', \{ (x|opacity: 0)/, '第二支不飛入、不淡入');
  assert.match(html, /tl\.fromTo\('#pip-s02-2, #pipf-s02-2', \{ opacity: 1 \}, \{ opacity: 0, duration: 0\.3/);
  assert.deepEqual(byId(res, 's02').pipPieces.map((p) => [p.enter, p.exit]).slice(1), [['none', 'layer']]);
  assert.equal(byId(res, 's02').pipPieces[0].exit, 'none');
});

test('dip／punch／整支淡入淡出／volume／gains：畫面用 GSAP，聲音用原生 data-fade-*、data-volume', () => {
  const res = run(SCENES, { cuts: [[20, 21]], fadeIn: 0.5, fadeOut: 1, volume: { voice: -6, sfx: -6, media: 0 },
    gains: [{ from: 30, to: 32, db: 9 }], joins: [{ at: 20, type: 'dip', dur: 0.4 }, { at: 10, type: 'punch' }] }, { cutpoints: [{ at: 10, kind: 'pause' }, { at: 15, kind: 'ng' }] });
  assert.deepEqual(res.errors, []);
  const html = main(res);
  // dip：接點兩側各 0.2s；人聲在同一點淡出淡入
  assert.match(html, /tl\.fromTo\('#edit-dip', \{ opacity: 0 \}, \{ opacity: 1, duration: 0\.2, ease: 'sine\.in', immediateRender: false \}, 19\.8\);/);
  assert.match(html, /<div id="edit-dip"><\/div>/);
  assert.match(html, /id="rough"[^>]*\n[^>]*data-fade-in="0\.5" data-fade-out="0\.2"/);
  // punch：10 秒放大，到下一個接點（cutpoints 的 15）還原
  assert.match(html, /tl\.set\('#footage', \{ scale: 1\.08 \}, 10\);\n\s+tl\.set\('#footage', \{ scale: 1 \}, 15\);/);
  assert.match(html, /#footage \{ transform-origin: 960px 440px; \}/);
  // 整支淡入淡出：#edit-fade 在字幕上面
  assert.match(html, /tl\.fromTo\('#edit-fade', \{ opacity: 1 \}, \{ opacity: 0, duration: 0\.5, ease: 'none' \}, 0\);/);
  assert.match(html, /tl\.fromTo\('#edit-fade', \{ opacity: 0 \}, \{ opacity: 1, duration: 1, ease: 'none', immediateRender: false \}, 42\);/);
  assert.match(html, /<link rel="stylesheet" href="kit\/media\.css">/);
  // volume.voice −6 → 0.501；gains 30–32（成片 29–31）再 +9 → +3dB＝1.413，音量不同切開的地方不淡（不然聲音會掉一下）
  assert.match(html, /data-volume="0\.501"/);
  assert.match(html, /data-start="29" data-duration="2" data-media-start="30"\s+data-track-index="0" data-has-audio="true" data-volume="1\.413" playsinline/);
  // 音效：總增益 −6dB
  const ding = byId(res, 's01').sfx;
  assert.equal(ding.volume, +(L.sfx.ding.volume * Math.pow(10, -6 / 20)).toFixed(3));
});

test('sfxVolume：每段的音效音量（主音效＋附加音效），疊在預設上；超出範圍 ✖', () => {
  // 09 qa：主音效自己寫 impact、附加是答案的 ding（×0.8）
  const res = run([{ id: 's01', scene: 'qa', from: '#2', to: '#5e', sfx: 'impact', sfxVolume: -6, slots: { q: '問', a: '答' } }]);
  assert.deepEqual(res.errors, []);
  const s = byId(res, 's01');
  assert.equal(s.sfx.volume, +(L.sfx.impact.volume * Math.pow(10, -6 / 20)).toFixed(3));
  assert.ok(s.sfxExtra.length && s.sfxExtra.every((c) => c.volume < L.sfx.ding.volume * 0.8));
  const bad = run([{ id: 's01', scene: 'concept', from: '#2', to: '#3e', sfxVolume: 20, slots: { text: '一' } }]);
  assert.match(bad.errors.join('\n'), /sfxVolume 要是 −60～\+12 的 dB 數字/);
});

test('成片長度：cuts 不在格上時不會少掉最後一格（rough 已對齊到格，r3 誤差吸收掉）；報告寫 rough − cuts', async () => {
  const { formatReport } = await imp('lib/plan.mjs');
  const res = resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], edit: { cuts: [[1, 2.3]] }, scenes: [] }, cues, videoDur: 44.033, lib: L, outDir: os.tmpdir() });
  assert.equal(res.outDur, 42.733);
  assert.match(formatReport(res, { videoDur: 44.033 }), /影片長度 0:42\.73（42\.733s）＝ rough\.mp4 44\.033s − cuts 1\.3s（1 段）/);
});

test('--test 片段遇到 cut：底片片段照片段起點裁切、淡入淡出只留在原本的邊上', () => {
  const res = run(SCENES, { cuts: [[20, 21]], fadeOut: 1 });
  const t = buildMain({ items: res.items, videoDur: res.outDur, captions: { compId: 'captions-test', file: 'compositions/captions-test.html' }, pip: res.globals.pip, sideShift: 480, footage: res.footage, editFx: res.editFx, test: { t0: 18, len: 5 } }).html;
  assert.match(t, /<video id="rough" src="\.\.\/assets\/rough\.mp4" data-start="0" data-duration="2" data-media-start="18"/);
  assert.match(t, /<video id="rough-2" src="\.\.\/assets\/rough\.mp4" data-start="2" data-duration="3" data-media-start="21"/);
  assert.doesNotMatch(t, /edit-fade/, '片段沒碰到片尾，不放淡出');
});

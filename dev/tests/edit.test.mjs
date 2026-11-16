// plan.json 的 edit（剪輯台）：檢查與正規化、rough ↔ 完成影片時間對應、cuts 讓段落／字幕／音效重新對時間、
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

test('timeMap：rough → 完成影片（cut 裡的點收到 cut 起點）、完成影片 → rough（接點上 Start 取後、End 取前）', () => {
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

test('cuts：段落與字幕重新對時間，整段被剪掉的段拿掉並 ⚠、部分重疊的裁短；完成影片長度＝rough − cuts', () => {
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
  // s02（fs-list，有子母畫面）是 18.5–25.0 → 完成影片 18.5–24.0，cut 收在 20：子母畫面兩支
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
  // volume.voice −6 → 0.501；gains 30–32（完成影片 29–31）再 +9 → +3dB＝1.413，音量不同切開的地方不淡（不然聲音會掉一下）
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

test('完成影片長度：cuts 不在格上時不會少掉最後一格（rough 已對齊到格，r3 誤差吸收掉）；報告寫 rough − cuts', async () => {
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

// ---------- 050：使用者在剪輯台自己加的音效（edit.sfx）----------
const mainOwn = (res, extra = {}) => buildMain({ items: res.items, videoDur: res.outDur, captions: { compId: 'captions', file: 'compositions/captions.html' }, pip: res.globals.pip, sideShift: res.globals.sideShift, footage: res.footage, editFx: res.editFx, userSfx: res.userSfx || [], ...extra }).html;

test('edit.sfx：normalizeEdit 檢查格式、照時間排；一顆都沒有就沒有這個鍵（輸出和沒寫 edit 一樣）', () => {
  const r = normalizeEdit({ sfx: [{ at: 30.0004, sound: 'impact', db: -3 }, { at: 12.5, sound: 'ding', db: 0 }] }, { videoDur: VD });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.edit.sfx, [{ at: 12.5, sound: 'ding' }, { at: 30, sound: 'impact', db: -3 }], '照時間排；db 0 不寫');
  assert.equal(r.active, false, '只多幾顆音效：底片照舊，不算 active');
  assert.ok(!('sfx' in normalizeEdit({ sfx: [] }, { videoDur: VD }).edit));
  assert.ok(!('sfx' in normalizeEdit({}, { videoDur: VD }).edit));
  const bad = normalizeEdit({ sfx: [{ at: -1, sound: 'ding' }, { at: 3, sound: 'Ding!' }, { at: 4, sound: 'ding', db: 20 }, { at: 5, sound: 'ding', loop: true }, { at: 99, sound: 'ding' }, 'ding'] }, { videoDur: VD }).errors.join('\n');
  for (const re of [/edit\.sfx\[0\]\.at 要是 rough\.mp4 的秒數/, /edit\.sfx\[1\]\.sound 要是音效名稱/, /edit\.sfx\[2\]\.db 要是 −60～\+12/, /edit\.sfx\[3\]\.loop：沒有這個欄位（可用：at、sound、db）/, /edit\.sfx\[4\]：at 99s 超過 rough\.mp4 長度 44s/, /edit\.sfx\[5\] 要是物件/]) assert.match(bad, re);
  assert.match(normalizeEdit({ sfx: {} }, { videoDur: VD }).errors.join('\n'), /edit\.sfx 要寫成陣列/);
});

test('edit.sfx：build 混進音效（峰值對齊那一刻、吃 edit.volume.sfx 和自己的 db），不算進次數、密度與 3 秒間隔；報告多一行', async () => {
  const { formatReport } = await imp('lib/plan.mjs');
  // s01 的 ding 在 #2（4.5 秒）；自己加的三顆：緊貼著它的 impact（不到 3 秒）、20 秒的 ding（−6 dB）、30 秒的 success
  const base = run(SCENES);
  const res = run(SCENES, { volume: { voice: 0, sfx: -6, media: 0 }, sfx: [{ at: 5, sound: 'impact' }, { at: 20, sound: 'ding', db: -6 }, { at: 30, sound: 'success' }] });
  assert.deepEqual(res.errors, []);
  assert.ok(byId(res, 's01').sfx, '段上的主音效還在：自己加的不進 3 秒規則');
  assert.deepEqual(res.userSfx.map((c) => [c.i, c.name, c.event]), [[0, 'impact', 5], [1, 'ding', 20], [2, 'success', 30]]);
  const frame = 1 / 30, g6 = Math.pow(10, -6 / 20);
  assert.equal(res.userSfx[0].at, +(5 - L.sfx.impact.peak + frame).toFixed(3), '起播＝那一刻 − 峰值 ＋ 1 格');
  assert.equal(res.userSfx[0].volume, +(L.sfx.impact.volume * g6).toFixed(3), '吃 edit.volume.sfx');
  assert.equal(res.userSfx[1].volume, +(L.sfx.ding.volume * g6 * g6).toFixed(3), '再疊自己的 db');
  assert.deepEqual(res.sfxBudget.count, base.sfxBudget.count, '音效次數不算自己加的');
  const rep = formatReport(res, { videoDur: VD });
  assert.match(rep, /自己加的音效：3 顆（使用者在剪輯台加的 edit\.sfx；不算進上面的次數、密度，也不受 3 秒間隔限制）/);
  assert.doesNotMatch(formatReport(base, { videoDur: VD }), /自己加的音效/, '沒加就沒有這一行');
  assert.ok(!('userSfx' in base), '沒加：結果沒有這個鍵');
  const html = mainOwn(res);
  assert.match(html, new RegExp(`<audio id="sfx-own1" src="assets/sfx/impact\\.wav" data-start="${res.userSfx[0].at}" data-track-index="\\d+" data-volume="${res.userSfx[0].volume}"></audio>`));
  assert.equal((html.match(/id="sfx-own\d+"/g) || []).length, 3);
  assert.equal(mainOwn(base), main(base), '沒有自己加的音效：主合成一個字都不變');
  // 剪映素材：自己加的不屬於任何一段，只跟著主軌
  assert.doesNotMatch(mainOwn(res, { test: { t0: 0, len: res.outDur }, cut: { kind: 'seg', id: 's01' } }), /sfx-own/);
  assert.match(mainOwn(res, { test: { t0: 0, len: res.outDur }, cut: { kind: 'main' } }), /sfx-own1/);
});

test('edit.sfx：時間跟著 cuts 換到完成影片；落在剪掉的範圍就不出聲；這台機器沒有的名稱 ✖；算進「音效稀疏」的空檔', () => {
  const res = run(SCENES, { cuts: [[10, 14]], sfx: [{ at: 8, sound: 'ding' }, { at: 12, sound: 'ding' }, { at: 20, sound: 'ding' }] });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.userSfx.map((c) => [c.i, c.event]), [[0, 8], [2, 16]], '第 2 顆在剪掉的 10–14 裡；20 秒 → 完成影片 16 秒');
  assert.match(res.sfxBudget.lines.join('\n'), /自己加的音效：2 顆（.*；另外 1 顆落在剪掉的範圍裡，不出聲）/);
  const bad = run(SCENES, { sfx: [{ at: 8, sound: 'whoosh' }, { at: 9, sound: 'bgm-cylinder-five' }, { at: 10, sound: 'tick' }] });
  const all = bad.errors.join('\n');
  assert.match(all, /edit\.sfx\[0\]（rough 0:08\.00 的 whoosh）：這台機器沒有「whoosh」這顆音效（可用：.*ding.*）→ 在剪輯台對它按右鍵換一顆或移除/);
  assert.match(all, /edit\.sfx\[1\].*bgm-cylinder-five/);
  assert.match(all, /edit\.sfx\[2\].*tick/);
  // 音效稀疏：一支 150 秒的片只在開頭有一顆主音效；使用者在 60、115 秒各補一顆 → 空檔都不到 60 秒，不再叫 AI 補
  const long = (edit) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], ...(edit ? { edit } : {}), scenes: SCENES }, cues, videoDur: 150, lib: L, outDir: os.tmpdir() });
  assert.ok(long().warnings.some((w) => /音效稀疏/.test(w)));
  assert.ok(!long({ sfx: [{ at: 60, sound: 'ding' }, { at: 115, sound: 'ding' }] }).warnings.some((w) => /音效稀疏/.test(w)));
});

test('edit.level：true 才寫進 edit（不算 active，時間不變）；false 不寫；不是布林 ✖', () => {
  const on = normalizeEdit({ level: true }, { videoDur: VD });
  assert.equal(on.edit.level, true);
  assert.equal(on.active, false);
  assert.deepEqual(on.errors, []);
  assert.ok(!('level' in normalizeEdit({ level: false }, { videoDur: VD }).edit));
  assert.match(normalizeEdit({ level: 'yes' }, { videoDur: VD }).errors.join('\n'), /edit\.level 要是 true/);
});

test('055 k27：剪掉一段後字幕只剩不到 0.6 秒 ⚠（整則剪掉、本來就短的不報）；剪點兩邊還留超過 0.2 秒的停頓 ⚠ 並給新的 cuts', () => {
  const go = (cuts, pauses = null, words = null) => {
    const cs = parseSrt(makeSrt({ n: 12 }));
    if (pauses) cs.pauses = pauses;
    if (words) cs.words = words;
    return resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], edit: { cuts }, scenes: [] }, cues: cs, videoDur: VD, lib: L, outDir: os.tmpdir() });
  };
  const short = (r) => r.warnings.filter((w) => w.startsWith('字幕 #'));
  const seam = (r) => r.warnings.filter((w) => w.startsWith('剪點 '));
  // (a) #3（8–11）剪掉 8–10.6 → 只剩 0.4 秒（短影片4：#29 被 [33.52, 34.5] 剪到 0.48 秒）
  assert.deepEqual(short(go([[8, 10.6]])), ['字幕 #3「第 3 句字幕內容」剪掉一段（edit.cuts [8, 10.6]）後只剩 0.40 秒（< 0.6 秒）→ 在剪輯台把它併到相鄰那則，或把剪點收到字幕開頭（rough 0:08.00）']);
  assert.deepEqual(short(go([[7.5, 11.2]])), [], '整則剪掉的不報');
  assert.deepEqual(short(go([[8, 10]])), [], '剩 1 秒不報');
  assert.deepEqual(short(go([])), [], '沒有 cuts 不報');
  // (b) 停頓（人聲能量量的 cues.pauses，rough 秒數）
  assert.deepEqual(seam(go([[12, 13]], [[11.6, 11.95], [13, 13.25]])), [
    '剪點 0:12.00（edit.cuts [12, 13]）前面隔 0.05 秒還有 0.35 秒停頓 → 剪點的起點提早到 11.65（cuts 改成 [11.65, 13]），停頓跟著剪掉',
    '剪點 0:12.00（edit.cuts [12, 13]）後面還有 0.25 秒停頓 → 剪點的迄點延到 13.2（cuts 改成 [12, 13.2]），停頓跟著剪掉',
  ]);
  assert.deepEqual(seam(go([[12, 13]], [[11.85, 12.05], [13, 13.1]])), [], '剩 0.15、0.1 秒不報');
  // 短影片4 r10：cuts [33.6, 34.1] 剪剩一個字（0.16 秒）後面接 0.22 秒停頓 → 報；作者改成 [33.52, 34.5] → 不報
  const P4 = [[32.17, 32.44], [33.48, 33.64], [33.88, 34.14], [34.3, 34.52]].map(([a, b]) => [a - 22, b - 22]);
  assert.deepEqual(seam(go([[11.6, 12.1]], P4)), ['剪點 0:11.60（edit.cuts [11.6, 12.1]）後面隔 0.20 秒還有 0.22 秒停頓 → 剪點的迄點延到 12.47（cuts 改成 [11.6, 12.47]），剪剩的殘字和停頓跟著剪掉']);
  assert.deepEqual(seam(go([[11.52, 12.5]], P4)), []);
  // 片頭、片尾的 cut 只是裁掉，不是接點
  assert.deepEqual(seam(go([[0, 1]], [[1, 1.4]])), []);
  // 沒有停頓資料：用詞級逐字稿的空檔
  const words = [{ text: '甲', start: 11.2, end: 11.5 }, { text: '乙', start: 12.0, end: 12.3 }, { text: '丙', start: 13.4, end: 13.7 }];
  assert.deepEqual(seam(go([[12.4, 13]], null, words)), ['剪點 0:12.40（edit.cuts [12.4, 13]）後面還有 0.40 秒停頓 → 剪點的迄點延到 13.35（cuts 改成 [12.4, 13.35]），停頓跟著剪掉']);
});

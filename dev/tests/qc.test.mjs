// qc.mjs：解析 ffmpeg 輸出的純函式、cuts 時間換算、時間對段落、判定
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { imp, hasChrome, makeSrt, TEMPLATE, TOOLS } from './helpers.mjs';

const Q = await imp('qc.mjs');
const items = [
  { id: 's01', type: 'scene', label: '01 章節轉場', start: 0, end: 5 },
  { id: 's02', type: 'scene', label: '08 Step 字卡', start: 10, end: 20 },
  { id: 'm01', type: 'media', label: 'media a.mp4', kind: 'video', start: 60, end: 80, shownEnd: 81 },
];

test('parseFreeze：成對與凍到片尾', () => {
  const err = `[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 62.3
[freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 3.7
[freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 66
[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 100`;
  assert.deepEqual(Q.parseFreeze(err, 105), [[62.3, 66], [100, 105]]);
  assert.deepEqual(Q.parseFreeze(err), [[62.3, 66]]);
});

test('parseBlack／parseSilence', () => {
  assert.deepEqual(Q.parseBlack('[blackdetect @ 0x] black_start:10 black_end:11.5 black_duration:1.5'), [[10, 11.5]]);
  const s = 'silence_start: 3.2\nsilence_end: 8 | silence_duration: 4.8\nsilence_start: 20';
  assert.deepEqual(Q.parseSilence(s, 25), [[3.2, 8], [20, 25]]);
  assert.deepEqual(Q.parseSilence('silence_start: -0.001\nsilence_end: 5', 25), [[0, 5]]);
});

test('parseLoudness：取 Summary，-inf 變 null', () => {
  const err = `  Integrated loudness:\n    I:         -14.2 LUFS\n    Threshold: -24.3 LUFS\n  True peak:\n    Peak:       -1.8 dBFS`;
  assert.deepEqual(Q.parseLoudness(`Summary:\n\n${err}`), { i: -14.2, tp: -1.8, found: true });
  const silent = 'Summary:\n  Integrated loudness:\n    I:         -70.0 LUFS\n  True peak:\n    Peak:       -inf dBFS';
  assert.equal(Q.parseLoudness(silent).tp, null);
  assert.equal(Q.parseLoudness('').found, false);
});

test('finalToRough／roughToFinal 隨 cuts 換算', () => {
  const cuts = [[10, 12], [30, 31]];
  assert.equal(Q.finalToRough(5, cuts), 5);
  assert.equal(Q.finalToRough(15, cuts), 17);
  assert.equal(Q.finalToRough(40, cuts), 43);
  assert.equal(Q.roughToFinal(17, cuts), 15);
  assert.equal(Q.roughToFinal(11, cuts), 10);
  assert.equal(Q.roughToFinal(43, cuts), 40);
});

test('locateItem／itemName：取重疊最多的段落', () => {
  assert.equal(Q.locateItem([62, 66], items).id, 'm01');
  assert.equal(Q.locateItem([30, 33], items), null);
  assert.equal(Q.locateItem([12, 15], items).id, 's02');
  assert.equal(Q.itemName(items[1]), 's02 Step 字卡');
  assert.equal(Q.itemName(items[2]), 'm01 螢幕錄影');
  assert.equal(Q.itemName(null), '主軌口播');
  // cuts 剪掉前面 2 秒：成片 58–61 ＝ rough 60–63
  assert.equal(Q.locateItem([58, 61], items, [[0, 2]]).id, 'm01');
});

test('freezeIssues：章節轉場的凍結排除，其餘留下', () => {
  assert.deepEqual(Q.freezeIssues([[0, 5]], items), []);
  assert.deepEqual(Q.freezeIssues([[62, 66]], items), [[62, 66]]);
  assert.deepEqual(Q.freezeIssues([[0.5, 4]], items), []);
  assert.deepEqual(Q.freezeIssues([[62, 64.5]], items), []);
  assert.deepEqual(Q.subtractRanges([0, 10], [[2, 4], [8, 12]]), [[0, 2], [4, 8]]);
});

const base = { width: 1920, height: 1080, fps: 30, vfr: false, hasAudio: true, dur: 24, expected: 24, loud: { i: -14, tp: -2 }, freezes: [], blacks: [], silences: [], items, cuts: [] };

test('judge：全過、ok 為 true', () => {
  const r = Q.judge(base);
  assert.equal(r.ok, true); assert.equal(r.errors, 0); assert.equal(r.warnings, 0);
});

test('judge：格式與長度是 ✖，其餘是 ⚠', () => {
  assert.equal(Q.judge({ ...base, width: 1280, height: 720 }).errors, 1);
  assert.equal(Q.judge({ ...base, hasAudio: false }).errors, 1);
  assert.equal(Q.judge({ ...base, dur: 24.5 }).errors, 1);
  assert.equal(Q.judge({ ...base, dur: 24.08 }).errors, 0);
  const w = Q.judge({ ...base, loud: { i: -20, tp: -0.2 }, freezes: [[62.3, 66]], blacks: [[10, 10.3], [12, 13]], silences: [[30, 36]] });
  assert.equal(w.ok, true);
  assert.equal(w.warnings, 4);
  assert.match(w.checks.find((c) => c.key === 'freeze' && c.level === 'warn').text, /1:02\.3–1:06\.0 畫面凍結 3\.7 秒（m01 螢幕錄影）/);
  assert.equal(Q.judge({ ...base, loud: { i: -14, tp: -0.5 } }).warnings, 1);
});

test('sheetTimes／speakerTimes／padBox', () => {
  assert.deepEqual(Q.sheetTimes(24), [0, 10, 20, 23.7]);
  assert.deepEqual(Q.sheetTimes(5), [0, 4.7]);
  assert.equal(Q.speakerTimes(80).length, 8);
  assert.equal(Q.speakerTimes(80)[0], 5);
  // 只有聲音的區間不抽：0–10 秒有講者、10–70 全黑、70–80 有講者 → 8 格全落在 0–10、70–80
  const ts = Q.speakerTimes(80, 8, [[10, 70]]);
  assert.equal(ts.length, 8);
  assert.ok(ts.every((t) => t < 10 || t >= 70), JSON.stringify(ts));
  assert.deepEqual(Q.speakerTimes(80, 8, []), Q.speakerTimes(80));
  assert.deepEqual(Q.padBox([10, 100, 500, 1070]), [0, 60, 540, 1080]);
});

// ---------- 004：storyboard（分鏡截圖）、observe（觀影總表）、framing 建議欄 ----------

test('shotPlan（沒有時間軸）：一般段尾前 0.6 秒；條列每組一張（下一條在進場後 0.9 秒內開始的併成一組）；錄影標註到位 +0.1 秒、< 0.3 秒併成一張；短段截中點', () => {
  const ann = { marks: [{ i: 0, at: 61, until: 66, ready: 61.4, path: [{ k: 0, at: 63, ready: 63.4 }] }],
    callouts: [{ i: 0, at: 61.2, until: 64, ready: 62.05, side: 'left', text: '打開 API 設定' }], spot: [], steps: [{ i: 0, at: 60, ready: 60.5, n: 1, text: '新增專案', carry: false }], arrows: [], lens: [] };
  const { shots, warnings } = Q.shotPlan([
    { id: 's01', start: 1, end: 7.5, lists: [], annotations: null },
    { id: 's04', start: 30, end: 38, lists: [31, 32.6, 32.9], annotations: null },
    { id: 'm01', start: 60, end: 68, lists: [], annotations: ann },
    { id: 'x1', start: 70, end: 70.5, lists: [], annotations: null },
  ], 80);
  const at = (f) => shots.find((s) => s.file === f);
  assert.equal(at('s01.png').at, 6.9);
  assert.match(at('s01.png').why, /完成態（段尾前 0\.6 秒）/);
  assert.deepEqual(shots.filter((s) => s.id === 's04').map((s) => [s.file, s.at, s.why]), [['s04-1.png', 32.5, '第 1 條'], ['s04-2.png', 37.4, '第 2–3 條']]);
  assert.deepEqual(warnings, []);
  // m01：steps 60.6、marks 61.5、callouts 62.15、path 63.5（四個都相距 ≥ 0.3）
  assert.deepEqual(shots.filter((s) => s.id === 'm01').map((s) => [s.file, s.at]), [['m01-1.png', 60.6], ['m01-2.png', 61.5], ['m01-3.png', 62.15], ['m01-4.png', 63.5]]);
  assert.equal(at('m01-3.png').why, 'callouts[0]「打開 API 設定」到位');
  assert.equal(at('m01-4.png').why, 'marks[0].path[0] 到位');
  assert.equal(at('x1.png').at, 70.25);
  assert.equal(at('x1.png').why, '段很短，截中點');
  const merged = Q.shotPlan([{ id: 'm02', start: 0, end: 10, lists: [], annotations: { ...ann, steps: [], marks: [{ i: 0, at: 1, until: 9, ready: 1.4, path: [] }], callouts: [{ i: 0, at: 1, until: 9, ready: 1.5, text: 'A' }] } }], 20);
  assert.deepEqual(merged.shots.map((s) => [s.file, s.at, s.why]), [['m02.png', 1.6, 'callouts[0]「A」到位']]);
});

test('完成態看時間軸（B-01）：03 側邊欄退場前 0.1 秒、fx 29 數字停住的那段、條列在那組進場完成後、循環動畫照段尾前 0.6 秒', () => {
  // 03 側邊欄 1–11：項目進場 2.3–4.35，內容淡出＋面板推回 9.9–11 → 9.8（原本 10.4 截到空面板）
  const side = { id: 's03', start: 1, end: 11, lists: [2.3, 2.9, 3.5], annotations: null };
  const sideTw = [[1, 1.5, 'enter'], [1.2, 2.2, 'change'], [2.3, 2.8, 'enter'], [2.45, 3.15, 'change'], [2.9, 3.4, 'enter'], [3.05, 3.75, 'change'], [3.5, 4, 'enter'], [3.65, 4.35, 'change'], [9.9, 10.3, 'exit'], [10.3, 11, 'change']];
  // fx 29 數字計數 12–16.5：滾到 13.8 停住，15.2–15.7 滾回 0 → 15.1（原本 15.9 截到滾動中）
  const odo = { id: 's10', start: 12, end: 16.5, lists: [], annotations: null };
  const odoTw = [[12.3, 13.8, 'change'], [15.2, 15.7, 'change']];
  // 整段都在動（循環）→ 段尾前 0.6 秒；最後一塊有進場（條列最後一條）→ 不是退場
  const loop = { id: 's11', start: 20, end: 23, lists: [], annotations: null };
  const motion = new Map([['s03', sideTw], ['s10', odoTw], ['s11', [[20, 23, 'change']]]]);
  const { shots } = Q.shotPlan([side, odo, loop], 80, motion);
  assert.deepEqual(shots.map((x) => [x.file, x.at, x.why]), [
    ['s03.png', 9.8, '第 1–3 條'],
    ['s10.png', 15.1, '完成態（退場前 0.1 秒）'],
    ['s11.png', 22.4, '段尾前 0.6 秒（整段都在動，沒有停住的畫面）'],
  ]);
  assert.deepEqual(Q.doneAt(side, sideTw), { at: 9.8, why: '完成態（退場前 0.1 秒）' });
  assert.deepEqual(Q.doneAt({ start: 0, end: 6 }, [[0, 0.5, 'enter'], [5.6, 6, 'exit']]), { at: 5.4, why: '完成態（段尾前 0.6 秒）' });   // 一般 0.4 秒淡出不影響
  assert.deepEqual(Q.doneAt({ start: 0, end: 6 }, [[0, 0.5, 'enter'], [5.2, 5.5, 'change'], [5.6, 6, 'exit']]), { at: 5.1, why: '完成態（動畫停住的最後一刻）' });   // 那一刻還在動 → 退到那塊開始前
  // 條列：每組在這組的動畫都跑完後截；下一條在完成前就開始 → 併組
  const fs1 = { id: 's21', start: 120, end: 128, lists: [120.5, 124.6, 126.7], annotations: null };
  const fsTw = [[120.5, 121, 'enter'], [120.65, 121.35, 'change'], [124.6, 125.1, 'enter'], [124.75, 125.45, 'change'], [126.7, 127.2, 'enter'], [126.85, 127.55, 'change']];
  assert.deepEqual(Q.shotPlan([fs1], 200, new Map([['s21', fsTw]])).shots.map((x) => [x.file, x.at]), [['s21-1.png', 124.5], ['s21-2.png', 126.6], ['s21-3.png', 127.55]]);   // 最後一條 127.55 才進場完成，比段尾前 0.6 秒（127.4）晚 → 取晚的
  const tight = { ...fs1, lists: [124.6, 125.2] };   // 0.6 秒間隔、進場 0.85 秒 → 一組，在 126.05 之後
  assert.deepEqual(Q.shotPlan([tight], 200, new Map([['s21', [[124.6, 125.1, 'enter'], [124.75, 125.45, 'change'], [125.2, 125.7, 'enter'], [125.35, 126.05, 'change']]]])).shots.map((x) => [x.file, x.at, x.why]), [['s21.png', 127.4, '第 1–2 條']]);
  assert.deepEqual(Q.motionBlocks([[0, 1, 'enter'], [1.03, 2, 'change'], [3, 4, 'exit'], [0, 99, 'change']], 10), [{ s: 0, e: 2, enter: true, refocus: false }, { s: 3, e: 4, enter: false, refocus: false }]);
});

test('完成態不早於最後一個進場完成、不晚於被下一段不透明段蓋住前 0.1 秒；蓋住時還沒揭開 → ⚠', () => {
  const x01 = { id: 'x01', type: 'custom', opaque: true, start: 17.83, end: 32, lists: [], annotations: null };
  const s03 = { id: 's03', type: 'scene', opaque: false, start: 11.41, end: 18.33, lists: [], annotations: null };
  // key 18.1 才揭開（18.7 完成），x01 17.83 就蓋住 → 截 17.73、⚠
  let r = Q.shotPlan([s03, x01], 60, new Map([['s03', [[11.41, 11.96, 'enter', ''], [18.1, 18.7, 'enter', '節省時間的免費工具']]], ['x01', []]]));
  assert.deepEqual(r.shots.filter((x) => x.id === 's03').map((x) => [x.at, x.why]), [[17.73, '被 x01 蓋住前 0.1 秒（「節省時間的免費工具」還沒出現）']]);
  assert.deepEqual(r.warnings, ['s03 的「節省時間的免費工具」在 0:18.70 才完整出現，但 x01 在 0:17.83 就蓋住了，觀眾看不到 → s03 的那個拍點綁早一點的詞（#N@詞），或 x01 的 from 延後到 0:19.30 之後']);
  // key 16.38 揭開（16.98 完成）→ 段尾前 0.6 秒＝17.73，剛好在蓋住前，沒有 ⚠
  r = Q.shotPlan([s03, x01], 60, new Map([['s03', [[11.41, 11.96, 'enter', ''], [16.38, 16.98, 'enter', '節省時間的免費工具']]], ['x01', []]]));
  assert.deepEqual([r.shots[0].at, r.warnings], [17.73, []]);
  // 沒被蓋、key 在段尾前 0.6 秒之後才完成 → 等它完成
  r = Q.shotPlan([{ ...s03, end: 19 }], 60, new Map([['s03', [[11.41, 11.96, 'enter', ''], [18.1, 18.7, 'enter', 'k']]]]));
  assert.deepEqual([r.shots[0].at, r.shots[0].why], [18.7, '完成態（最後一個進場完成）']);
  assert.deepEqual(Q.lastEnter([[0, 1, 'enter', 'a'], [2, 3, 'change', ''], [1.5, 2.5, 'enter', 'b']]), { end: 2.5, text: 'b' });
});

test('子母畫面段沒有講者小窗（F2）：哪些段該有、缺口落在 rough 全黑才 ✖、有聲音素材不判、final 的 judge 印 ✖', () => {
  const it = (id, type, family, out, extra = {}) => ({ id, type, family, label: type === 'scene' ? '04a 全畫面清單' : 'x', key: 'x-tool-flow.html', opaque: true, out: { start: out[0], end: out[1], pip: out[2] || [] }, ...extra });
  const items = [
    it('s20', 'custom', 'custom', [112, 120.4, [{ start: 112, end: 116.1 }]]),
    it('s21', 'scene', 'fullscreen', [120.4, 128.8]),
    it('s22', 'fx', 'fx', [128.8, 133.9]),
    it('s23', 'scene', 'fullscreen', [133.9, 150.3]),
    it('m01', 'media', 'media', [150.3, 152], { opaque: true }),
    it('s30', 'custom', 'custom', [10, 20], { opaque: false }),
  ];
  const scenes = [{ id: 's23', pip: false }];
  assert.deepEqual(Q.pipCoverage(items, scenes).map((c) => [c.id, c.state]), [['s20', '部分'], ['s21', '無'], ['m01', '無']]);
  const voiceOnly = [[116.1, 119.5], [119.53, 153.5]];
  const miss = Q.pipMissing({ items, scenes, voiceOnly, project: 'projects/example' });
  assert.deepEqual(miss.map((m) => m.id), ['s20', 's21', 'm01']);
  assert.equal(miss[1].msg, 's21 是全畫面清單卻沒有講者小窗：work/rough.mp4 在 1:56.10–2:33.50 是全黑（原始素材不是）→ 初剪壞了，跑 node shared/template/tools/media.mjs verify-rough --project projects/example 照它印的做');
  assert.match(miss[0].msg, /^s20 是全畫面情境動畫（x-tool-flow\.html），講者小窗在 1:56\.10 就沒了（段到 2:00\.40）：/);
  assert.deepEqual(Q.pipMissing({ items, scenes, voiceOnly: [], project: 'p' }), [], '沒有全黑就不是初剪的問題');
  assert.deepEqual(Q.pipMissing({ items, scenes, voiceOnly, hasVoice: true, project: 'p' }), [], '有只有聲音的素材：全黑是旁白區間');
  assert.deepEqual(Q.mergeRanges([[1, 2], [2.05, 3], [5, 6]]), [[1, 3], [5, 6]]);
  // 002 之後：沒有聲音素材時 voiceOnly 是空的、小窗照開，全黑放在 roughBlack → 小窗開著但底片是黑的，一樣 ✖
  const lit = items.map((x) => (x.out && ['s20', 's21'].includes(x.id) ? { ...x, out: { ...x.out, pip: [{ start: x.out.start, end: x.out.end }] } } : x));
  const miss2 = Q.pipMissing({ items: lit, scenes, voiceOnly: [], roughBlack: [[116.1, 153.5]], project: 'projects/example' });
  assert.deepEqual(miss2.map((m) => m.id), ['s20', 's21', 'm01']);
  assert.equal(miss2[1].msg, miss[1].msg);
  const v = Q.judge({ ...base, pipMissing: miss });
  assert.equal(v.ok, false);
  assert.deepEqual(v.checks.filter((c) => c.key === 'pip').map((c) => c.level), ['error', 'error', 'error']);
  assert.equal(Q.judge({ ...base, pipMissing: [] }).checks.find((c) => c.key === 'pip').text, '子母畫面段都有講者小窗');
});

test('outOf：有 items[].out 就用；沒有時用 start／end＋cuts 推算（成片秒數）', () => {
  const a = Q.outOf([{ id: 's01', type: 'scene', start: 10, end: 20, out: { start: 9, end: 19, lists: [10], annotations: null } }], [[2, 3]]);
  assert.equal(a.fallback, false);
  assert.deepEqual([a.list[0].start, a.list[0].lists], [9, [10]]);
  const b = Q.outOf([{ id: 's01', type: 'scene', start: 10, end: 20, shownEnd: 21 }], [[2, 3]]);
  assert.equal(b.fallback, true);
  assert.deepEqual([b.list[0].start, b.list[0].end], [9, 20]);
});

test('observe 的純函式：時間格、格子標籤、字幕換成片秒數、靜止區間、接縫、在哪一格、建議倍率', () => {
  assert.deepEqual(Q.observeTimes(10, 12), [10, 10.5, 11, 11.5]);
  const segs = [{ id: 's01', start: 1, end: 7.5 }, { id: 'm01', start: 7.4, end: 14 }];
  const cues = Q.cuesToOut([{ n: 3, start: 8, end: 11, text: '第 3 句' }, { n: 4, start: 20, end: 22, text: '剪掉' }], [[19, 23]]);
  assert.deepEqual(cues.map((c) => c.n), [3]);
  assert.deepEqual(Q.cellLabel(9, segs, cues), { time: '0:09.0', id: 'm01', text: '第 3 句', n: 3 });
  assert.deepEqual(Q.cellLabel(7.45, segs, []), { time: '0:07.5', id: 'm01', text: '（無字幕）', n: null });   // 重疊時取最晚開始的
  const g = (v) => new Uint8Array(4).fill(v);
  const grays = [...Array.from({ length: 4 }, (_, k) => g(k * 50)), ...Array.from({ length: 20 }, () => g(200)), ...Array.from({ length: 4 }, (_, k) => g(k * 40))];
  assert.deepEqual(Q.staticRuns(grays, { from: 100 }), [[102, 112]]);   // 第 4–23 格（20 格＝10 秒）一樣
  assert.deepEqual(Q.staticRuns(grays.slice(0, 15), { from: 0 }), []);
  const seams = Q.seamList(segs, 0, 14);
  assert.deepEqual(seams.map((s) => [s.n, s.at, s.before, s.after]), [[1, 1, null, 's01'], [2, 7.4, 's01', 'm01']]);   // 14 在 to − 0.2 之外
  assert.deepEqual(Q.sheetCell(41.2, 0), { sheet: 2, r: 6, c: 5 });   // 第 2 張的 17.2 秒＝第 6 列（每列 3 秒）第 5 格
  assert.deepEqual(Q.suggestZoom([{ zoom: 1, cut: [], upscale: 1 }, { zoom: 1.15, cut: [], upscale: 1.15 }, { zoom: 1.3, cut: ['上'], upscale: 1.3 }]), { zoom: 1.15, none: false });
  assert.deepEqual(Q.suggestZoom([{ zoom: 1, cut: ['左'], upscale: 3 }, { zoom: 1.3, cut: [], upscale: 3.9 }]), { zoom: 1, none: true });
  // 有黑邊時表上最小的是 1.13x：全被排除就建議它（不是不在表上的 1.00x）
  assert.deepEqual(Q.suggestZoom([{ zoom: 1.13, cut: ['左'], upscale: 1.7 }, { zoom: 1.3, cut: ['左'], upscale: 2 }]), { zoom: 1.13, none: true });
});

// ---------- 需要 ffmpeg／Chrome／npx hyperframes 的端到端（找不到 Chrome 就略過）----------

const CHROME = await hasChrome();
// 這個檔建立的暫存資料夾（fixture 有影片＋build 產物，一個 30–200 MB）：全部跑完一起刪，不留在系統暫存
const TMP = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); TMP.push(d); return d; };
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });
const ffmpeg = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
function fixture() {
  const root = mkTmp('hf-qc-');
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'ding.wav'), path.join(root, 'shared', 'sfx', `${n}.wav`));
  const proj = path.join(root, 'projects', 'p1'), out = path.join(proj, 'work', 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(proj, 'work', 'rough.mp4')]);
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), makeSrt({ n: 3 }));   // #1 1–4、#2 4.5–7.5、#3 8–11
  const qc = (...args) => spawnSync(process.execPath, [path.join(TOOLS, 'qc.mjs'), ...args, '--project', 'projects/p1'], { encoding: 'utf8', cwd: root });
  const build = (...args) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), ...args, '--project', 'projects/p1'], { encoding: 'utf8', cwd: root });
  return { root, proj, out, qc, build };
}

test('storyboard：✖ 原文（plan 有 ✖、還沒 build）；build 後截圖存成段 id、印出貼上用的 markdown', { skip: !CHROME && '沒有 HyperFrames 的 Chrome，略過', timeout: 600000 }, () => {
  const F = fixture();
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, look: false, speakerBox: [400, 80, 900, 700], scenes: [{ id: 's01', scene: 'nope', from: '#1', to: '#1e' }] }));
  let r = F.qc('storyboard');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✖ plan\.json 有 1 個 ✖（第一個：.*nope.*）→ 照 build\.mjs --check 的 → 修好，再跑 build、再截圖/);
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, look: false, speakerBox: [400, 80, 900, 700], scenes: [
    { id: 's01', scene: 'key-point', from: '#1', to: '#2e', slots: { lead: '下方字卡', key: '重點在這裡' } },
    { id: 's02', scene: 'fs-list', from: '#3', to: 12, slots: { title: '清單', items: ['第一', '第二', '第三'] } }] }));
  r = F.qc('storyboard');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✖ 還沒 build：找不到 projects\/p1\/work\/hyperframes\/index\.html → 先跑 node shared\/template\/tools\/build\.mjs --project projects\/p1/);
  r = F.build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = F.qc('storyboard', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.ok(j.shots.length >= 2);
  const dir = path.join(F.proj, 'work', 'storyboard-preview');
  for (const s of j.shots) {
    assert.ok(fs.existsSync(path.join(dir, s.file)), s.file);
    assert.equal(s.md, `![${s.file.replace(/\.png$/, '')}](storyboard-preview/${s.file})`);
  }
  assert.ok(j.shots.some((s) => s.file === 's01.png'));
  assert.ok(!fs.existsSync(path.join(F.out, '.storyboard-shots')), '暫存截圖要刪掉');
  const t = F.qc('storyboard');
  // 07 已是 v2 模板（keyAt 抽屜＋逐字彈出）：截在抽屜抽出後 0.3 秒，之後畫面不變 → 併成完成態（時刻規則見「v2 拍點」兩則）
  const s01 = j.shots.find((s) => s.file === 's01.png');
  assert.equal(s01.why, '抽屜抽出後 0.3 秒：「重點在這裡」（完成態）');
  assert.ok(t.stdout.split('\n').includes(`s01｜${Q.fmtT(s01.at)}｜${s01.why}｜storyboard-preview/s01.png`), t.stdout);
  assert.match(t.stdout, /^!\[s01\]\(storyboard-preview\/s01\.png\)$/m);
  assert.match(t.stdout, /✔ \d+ 張都存好了：projects\/p1\/work\/storyboard-preview\//);
});

test('observe：每 0.5 秒一格的總表、靜止區間 6–16 秒、接縫條帶、index.md；其他檔不動；沒字幕只 ⚠', { skip: !CHROME && '沒有 HyperFrames 的 Chrome，略過', timeout: 300000 }, () => {
  const F = fixture();
  const clip = path.join(F.root, 'still22.mp4');
  ffmpeg(['-f', 'lavfi', '-i', "color=c=gray:s=1280x720:r=30:d=22,noise=alls=80:allf=t:enable='lt(t,6)+gte(t,16)'", '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip]);
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, look: false, speakerBox: [400, 80, 900, 700], rhythm: 'spaced', scenes: [{ id: 's01', scene: 'key-point', from: '#1', to: '#2e', slots: { lead: '下方字卡', key: '重點在這裡' } }] }));
  const dir = path.join(F.proj, 'work', 'observe');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'notes.txt'), '我的筆記');
  fs.writeFileSync(path.join(dir, 'sheet-09.jpg'), 'old');
  const r = F.qc('observe', '--file', clip, '--offset', '0', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.sheets.length, 1);
  assert.equal(j.sheets[0].cells, 44);
  const dims = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(dir, 'sheet-01.jpg')], { encoding: 'utf8' }).stdout.trim();
  assert.equal(dims, `1920,${40 + 8 * 224}`);
  assert.equal(j.static.length, 1);
  assert.ok(Math.abs(j.static[0].from - 6) <= 0.5 && Math.abs(j.static[0].to - 16) <= 0.5, JSON.stringify(j.static));
  assert.equal(j.static[0].id, 's01');
  assert.deepEqual(j.seams.map((s) => [s.at, s.before, s.after]), [[1, null, 's01'], [7.5, 's01', null]]);
  const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8');
  assert.match(md, /^\| 檔案 \| 範圍 \| 格數 \| 第 r 列第 c 格的時間 \| 小窗（子母畫面段） \|$/m);
  assert.match(md, /^\| sheet-01\.jpg \| 0:00\.0–0:22\.0 \| 44 \| 0:00\.0 ＋ \(\(r−1\)×6 ＋ \(c−1\)\)×0\.5 秒 \| — \|$/m);
  assert.match(md, /^\| 0:06\.0–0:16\.0 \| 10\.0 秒 \| s01 \| #2 第 2 句字幕內容 \| sheet-01\.jpg 第 3 列第 1 格起 \|$/m);
  assert.match(md, /^\| 2 \| 0:07\.5 \| s01 → — \| seam-01\.jpg 第 2 列 \|$/m);
  // 拍點表：和 storyboard 同一套時刻；還沒 build 讀不到時間軸 → 用估的（段尾前 0.6 秒）＋ ⚠
  assert.deepEqual(j.beats.map((b) => [b.n, b.id, b.at, b.why, path.basename(b.file)]), [[1, 's01', 6.9, '完成態（段尾前 0.6 秒）', 'beat-01.jpg']]);
  assert.ok(j.warnings.some((w) => /^還沒 build（找不到 projects\/p1\/work\/hyperframes\/index\.html）：拍點用估的/.test(w)), j.warnings.join('\n'));
  assert.match(md, /^\| 1 \| 0:06\.90 \| s01 \| 完成態（段尾前 0\.6 秒） \| beat-01\.jpg \|$/m);
  assert.ok(fs.existsSync(path.join(dir, 'beat-01.jpg')));
  assert.equal(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8'), '我的筆記');
  assert.ok(!fs.existsSync(path.join(dir, 'sheet-09.jpg')), '上次的總表要清掉');
  assert.ok(!fs.existsSync(path.join(dir, '.tiles')));
  const off = F.qc('observe', '--file', clip, '--offset', '3', '--to', '9');   // 測試片段從成片 3 秒起：s01（1 秒起）不在片段裡
  assert.equal(off.status, 0, off.stdout + off.stderr);
  assert.match(off.stdout, /⚠ s01 在 0:01\.0 就開始了，測試片段不含這段：格子不標它（要看這段，build --test 的起點改成 1）/);
  fs.rmSync(path.join(F.proj, 'work', 'rough.srt'));
  const t = F.qc('observe', '--file', clip, '--from', '2', '--to', '8');
  assert.equal(t.status, 0, t.stdout + t.stderr);
  assert.match(t.stdout, /⚠ 找不到 work\/rough\.srt：格子不印字幕/);
  assert.match(t.stdout, /⚠ 沒寫 --offset：當成從成片 0 秒開始/);
  const bad = F.qc('observe', '--file', clip, '--from', '30');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /✖ --from／--to 要是成片秒數，而且 0 ≤ from < to ≤ 22（現在 from=30、to=22）→ 改成 0–22 之間、from < to 的成片秒數/);
});

test('framing／speaker 抽格套 look：kit 預設（調光 LUT＋瘦臉退回 rough.mp4 的 ⚠）與 plan.look false 都不報錯；兩次的預覽圖不同', { timeout: 120000 }, () => {
  const F = fixture();
  const kit = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'look.json'), 'utf8'));
  const pv = path.join(F.proj, 'work', '構圖預覽.jpg');
  let r = F.qc('framing');   // 還沒有 plan.json：照 kit/look.json
  assert.equal(r.status, 0, r.stdout + r.stderr);
  if (kit.color > 0) {
    assert.match(r.stdout, /^畫面已套 look：底片 .*work\/rough\.mp4＋講者調光 [\d.]+（跟 build 一樣）$/m);
    assert.ok(fs.readdirSync(path.join(F.proj, 'work', '.look')).some((x) => x.endsWith('.cube')), '混合 LUT 要寫進 work/.look/');
  }
  if (kit.slim > 0) assert.match(r.stdout, /^⚠ .*瘦臉/m, '沒跑過 look.mjs run：退回 rough.mp4 並印 ⚠');
  const withLook = fs.readFileSync(pv);
  r = F.qc('speaker');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^畫面已套 look：/m);
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, look: false, speakerBox: [400, 80, 900, 700], scenes: [] }));
  r = F.qc('framing');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^畫面不套 look（plan\.json 的 look 是 false）$/m);
  assert.doesNotMatch(r.stdout, /^⚠ .*瘦臉/m);
  if (kit.color > 0) assert.ok(!withLook.equals(fs.readFileSync(pv)), '套 LUT 的預覽圖要跟不套的不同');
});

test('storyboard：rough.mp4 有一段全黑、專案沒有聲音素材 → 子母畫面段沒有小窗 ✖（不用 build、不截圖）；放了聲音素材就不判', { timeout: 120000 }, () => {
  const F = fixture();
  // 0–8 秒有畫面、8–12 秒全黑（聲音正常）
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:d=8', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:d=12',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(F.proj, 'work', 'rough.mp4')]);
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, look: false, speakerBox: [400, 80, 900, 700], scenes: [
    { id: 's01', scene: 'key-point', from: '#1', to: 8, slots: { lead: '下方字卡', key: '重點在這裡' } },
    { id: 's02', scene: 'fs-list', from: 8, to: 12, slots: { title: '清單', items: ['第一', '第二', '第三'] } }] }));
  const r = F.qc('storyboard');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /^✖ s02 是全畫面清單卻沒有講者小窗：work\/rough\.mp4 在 0:08\.\d\d–0:1\d\.\d\d 是全黑（原始素材不是）→ 初剪壞了，跑 node shared\/template\/tools\/media\.mjs verify-rough --project projects\/p1 照它印的做$/m);
  assert.ok(!fs.existsSync(path.join(F.proj, 'work', 'storyboard-preview')), '✖ 時不截圖');
  fs.mkdirSync(path.join(F.proj, 'assets', 'voice'), { recursive: true });
  fs.writeFileSync(path.join(F.proj, 'assets', 'voice', '旁白.m4a'), '');
  const t = F.qc('storyboard');
  assert.doesNotMatch(t.stderr, /沒有講者小窗/);
  assert.match(t.stderr, /✖ 還沒 build/);
});

test('storyboard：03 側邊欄截在退場前、fx 29 截在數字停住時；同一段張數變了，舊截圖自動清掉', { skip: !CHROME && '沒有 HyperFrames 的 Chrome，略過', timeout: 600000 }, () => {
  const F = fixture();
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, look: false, speakerBox: [400, 80, 900, 700], scenes: [
    { id: 's01', scene: 'side-panel', from: 1, to: 7, slots: { eyebrow: '流程', title: '三個重點', items: ['第一個重點 ｜icon=check', '第二個重點 ｜icon=check', '第三個重點 ｜icon=check'] } },
    { id: 's02', type: 'fx', fx: 29, bg: 'dark', from: 7.5, to: 11.5, vars: { label: '做了', number: '29', unit: '支影片' } }] }));
  const b = F.build();
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const dir = path.join(F.proj, 'work', 'storyboard-preview');
  fs.mkdirSync(dir, { recursive: true });
  for (const x of ['s01-1.png', 's01-2.png', 's09.png']) fs.writeFileSync(path.join(dir, x), 'old');
  const r = F.qc('storyboard', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  // 03：內容在 D − P.PUSH − P.OUT 開始淡出（kit 常數，template.html 第 50 行）→ 截在它前 0.1 秒；fx 29（4 秒）：7.8–9.3 滾到 29，10.7 開始滾回 0 → 10.6
  const kit = fs.readFileSync(path.join(TEMPLATE, 'kit', 'scene-motion.js'), 'utf8');
  const K = (name) => Number(kit.match(new RegExp(`[\\s,]${name} = ([0-9.]+)`))[1]);
  assert.deepEqual(j.shots.map((x) => [x.file, x.at]), [['s01.png', +(7 - K('PUSH') - K('OUT') - 0.1).toFixed(3)], ['s02.png', 10.6]]);
  assert.deepEqual(j.cleared, ['s01-1.png', 's01-2.png']);
  assert.deepEqual(j.stale, ['s09.png']);
  assert.ok(!fs.existsSync(path.join(dir, 's01-1.png')) && fs.existsSync(path.join(dir, 's09.png')));
});

test('storyboard：catalog 的 done 是 "label" 的 fx（27 打字機）截在時間軸的 done 標記：「自動剪輯」打完、還沒開始擦', { skip: !CHROME && '沒有 HyperFrames 的 Chrome，略過', timeout: 600000 }, () => {
  const F = fixture();
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, look: false, speakerBox: [400, 80, 900, 700], scenes: [
    { id: 's01', type: 'fx', fx: 27, from: 1, to: 6, vars: { text: '自動剪輯', alt: 'Auto Edit' } }] }));
  const b = F.build();
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const r = F.qc('storyboard', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [s] = JSON.parse(r.stdout).shots;
  assert.equal(s.why, '完成態（動畫的 done 標記）');
  // fx-27（D 5、4＋9 字）：0.4 s 起每字 0.1 s → 0.8 s 打完；停 1.05 s → 1.85 s 開始擦。標記要落在中間（成片再加起點 1 s）
  assert.ok(s.at > 1.8 && s.at < 2.85, `截圖時刻 ${s.at} 不在「打完、還沒擦」的 1.8–2.85 秒之間`);
  assert.ok(fs.existsSync(path.join(F.proj, 'work', 'storyboard-preview', 's01.png')));
});

// ---------- 動態 v2（specs/010-motion-v2）：新拍點、字幕樣式（F8）、主題 ----------

test('v2 拍點（純函式）：抽屜抽出完成 +0.3 秒；焦點抬起那拍跑完 +0.1 秒、不晚於下一拍前 0.1 秒；之後畫面沒變就併成完成態', () => {
  // 07 v2：卡片 11.41 擦開；keyAt 16.38 抽屜（0.5 秒）、+0.12 逐字彈出到 17.24、+0.55 光澤（accent）；段尾收回
  const g = { id: 's03', start: 11.41, end: 18.33, lists: [], annotations: null };
  const tw = [[11.41, 11.91, 'enter', '前句'], [16.38, 16.78, 'change', ''], [16.38, 16.88, 'drawer', '節省時間的免費工具'], [16.5, 17.24, 'enter', '節省時間的免費工具'], [16.93, 17.63, 'change', ''], [17.88, 18.16, 'exit', ''], [18.03, 18.33, 'exit', '']];
  assert.deepEqual(Q.shotPlan([g], 60, new Map([['s03', tw]])).shots.map((x) => [x.file, x.at, x.why]), [['s03.png', 17.24, '抽屜抽出後 0.3 秒：「節省時間的免費工具」（完成態）']]);
  // 焦點：兩站各一張；最後 spot(null) 回均衡 → 完成態另一張
  const x = { id: 'x01', start: 0, end: 10, lists: [], annotations: null };
  const xtw = [[0.3, 0.85, 'enter', 'A'], [0.5, 1.05, 'enter', 'B'], [1.5, 2, 'focus', 'A'], [1.5, 2, 'refocus', ''], [3, 3.5, 'focus', 'B'], [3, 3.5, 'refocus', ''], [6, 6.5, 'refocus', '']];
  assert.deepEqual(Q.shotPlan([x], 60, new Map([['x01', xtw]])).shots.map((s) => [s.file, s.at, s.why]), [
    ['x01-1.png', 2.1, '焦點抬起：「A」'], ['x01-2.png', 3.6, '焦點抬起：「B」'], ['x01-3.png', 9.4, '完成態（段尾前 0.6 秒）']]);
  // 下一拍 0.4 秒後就開始 → 截在下一拍前 0.1 秒
  assert.deepEqual(Q.beatShots(x, [[1, 1.5, 'focus', 'A'], [1.6, 2.1, 'focus', 'B']]).map((b) => b.at), [1.5, 2.2]);
  assert.deepEqual(Q.motionBlocks([[0, 0.5, 'drawer'], [1, 1.5, 'refocus']]), [{ s: 0, e: 0.5, enter: true, refocus: false }, { s: 1, e: 1.5, enter: false, refocus: true }]);
  // 最後一塊只有焦點變化（spot(null) 回均衡、P.dim）不是退場：完成態不往前截
  assert.deepEqual(Q.doneAt(x, xtw), { at: 9.4, why: '完成態（段尾前 0.6 秒）' });
  assert.deepEqual(Q.lastEnter([[0, 0.5, 'drawer', 'k'], [0.1, 0.3, 'focus', 'a']]), { end: 0.5, text: 'k' });
});

test('字幕樣式（F8，純函式）：取樣只挑中文 ≥ 4 字 ≥ 0.6 秒；白字列高；底板 956–1074 ± 4、字高 71 ± 3；「，。」與 < 0.6 秒 ⚠', () => {
  const cues = [{ n: 1, start: 0, end: 2, text: '大家好我是鼎淵' }, { n: 2, start: 2, end: 4, text: 'YouTube 頻道' }, { n: 3, start: 4, end: 4.4, text: '很短的一句話' }, { n: 4, start: 5, end: 7, text: '好' }, { n: 5, start: 8, end: 10, text: '免費的工具，' }];
  assert.deepEqual(Q.captionSamples(cues).map((c) => [c.n, c.at]), [[1, 1], [5, 9]]);
  // 合成一格：底板 956–1074 壓暗（白底 → 77），字 977–1047（71 列）是白色
  const W = 1920, H = 1080, rgb = Buffer.alloc(W * H * 3, 255);
  for (let y = 956; y < 1074; y++) rgb.fill(77, y * W * 3 + 600 * 3, y * W * 3 + 1300 * 3);
  for (let y = 977; y <= 1047; y++) rgb.fill(250, y * W * 3 + 700 * 3, y * W * 3 + 720 * 3);
  assert.deepEqual(Q.inkRows(rgb, W, H, { top: 956, bottom: 1074, left: 600, right: 1300 }), { top: 977, bottom: 1047, height: 71 });
  const ok = Q.captionStyleChecks({ samples: [{ n: 1, text: 'a', top: 956, bottom: 1074, ink: 70 }, { n: 5, text: 'b', top: 957.5, bottom: 1073, ink: 73 }] });
  assert.deepEqual(ok.map((c) => c.level), ['ok']);
  assert.match(ok[0].text, /底板 y 956–1074、字高 71（量 2 則：#1、#5）/);
  const old = Q.captionStyleChecks({ samples: [{ n: 1, text: '大家好我是鼎淵', top: 940, bottom: 1020, ink: 50 }] });   // 舊樣式 54px、距底 60
  assert.equal(old[0].level, 'warn');
  assert.match(old[0].text, /#1「大家好我是鼎淵」底板 y 940–1020、字高 50（要 y 956–1074 ± 4、字高 71 ± 3）→ 成片是 kit\/captions\.css 改版前 render 的就重新 build、render/);
  assert.match(Q.captionStyleChecks({ error: '還沒 build' })[0].text, /^量不到字幕樣式：還沒 build/);
  const t = Q.captionTextChecks(cues);
  assert.deepEqual(t.map((c) => c.level), ['warn', 'warn']);
  assert.match(t[0].text, /字幕 #5 共 1 則含句中標點「，」「。」，照 F8 不顯示 → 跑 srt-align 或在剪輯台改/);
  assert.match(t[1].text, /字幕 #3 共 1 則不到 0\.6 秒（#3 0\.40 秒）/);
  // judge：有量到才判，key 是 captions／captext
  const j = Q.judge({ width: 1920, height: 1080, fps: 30, hasAudio: true, dur: 10, expected: 10, loud: { i: -14, tp: -2 }, freezes: [], blacks: [], silences: [], items: [], cuts: [], cues, captionStyle: { samples: [] } });
  assert.deepEqual(j.checks.filter((c) => /^cap/.test(c.key)).map((c) => [c.key, c.level]), [['captions', 'warn'], ['captext', 'warn'], ['captext', 'warn']]);
  assert.equal(Q.judge({ width: 1920, height: 1080, fps: 30, hasAudio: true, dur: 10, expected: 10, loud: { i: -14, tp: -2 }, freezes: [], blacks: [], silences: [], items: [], cuts: [] }).checks.some((c) => /^cap/.test(c.key)), false);
});

test('主題：plan.json 的 theme（"dark" 才是暗色）；qc-sheet 最上面標 theme，暗色深底、亮色淺底', () => {
  const dir = mkTmp('hf-qc-theme-');
  const plan = path.join(dir, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ version: 1, theme: 'dark', scenes: [] }));
  assert.equal(Q.themeOf({ plan }), 'dark');
  fs.writeFileSync(plan, JSON.stringify({ version: 1, theme: 'Dark', scenes: [] }));
  assert.equal(Q.themeOf({ plan }), 'light');
  assert.equal(Q.themeOf({ plan: path.join(dir, 'nope.json') }), 'light');
  const mp4 = path.join(dir, 'a.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', mp4]);
  for (const th of ['dark', 'light']) {
    const out = path.join(dir, `qc-${th}.jpg`), r = Q.makeQcSheet(mp4, 3, out, th);
    assert.equal(r.theme, th);
    const d = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-vf', 'crop=8:8:1900:4', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
    const mean = [...d.stdout].reduce((a, b) => a + b, 0) / d.stdout.length;
    assert.ok(th === 'dark' ? mean < 40 : mean > 200, `${th} 的標題列亮度 ${mean}`);
  }
});

test('storyboard：v2 原語的拍點（P.spot 抬起、P.slide 抽屜）各截一張；P.idle 微動不算動畫；抽屜之後沒變就是完成態', { skip: !CHROME && '沒有 HyperFrames 的 Chrome，略過', timeout: 600000 }, () => {
  const F = fixture();
  fs.mkdirSync(path.join(F.out, 'compositions'), { recursive: true });
  fs.writeFileSync(path.join(F.out, 'compositions', 'x-v2.html'), `<!doctype html><html><head><meta charset="UTF-8"></head><body>
<template id="x-v2-template">
  <style>
    #x-v2 { position: absolute; inset: 0; }
    #x-v2 .row { position: absolute; left: 120px; width: 600px; height: 120px; background: #FFFFFF; color: #141414; font-size: 60px; }
    #x-v2 #a { top: 150px; } #x-v2 #b { top: 320px; }
    #x-v2 .drawer { position: absolute; left: 120px; top: 520px; width: 800px; height: 120px; overflow: hidden; }
    #x-v2 #slab { width: 800px; height: 120px; background: var(--brand); color: #FFFFFF; font-size: 60px; }
  </style>
  <div id="x-v2" data-composition-id="x-v2" data-width="1920" data-height="1080" data-duration="7">
    <div class="sc-surface-fs" style="position: absolute; inset: 0;"></div>
    <div class="row" id="a">第一站</div><div class="row" id="b">第二站</div>
    <div class="drawer"><div id="slab">抽屜重點</div></div>
  </div>
  <script>
  (function () {
    const tl = gsap.timeline({ paused: true });
    const P = SceneMotion(tl, document.getElementById('x-v2'));
    P.pop('#a', 0.3); P.pop('#b', 0.5);
    P.idle('#a, #b', 1.2);
    P.spot('#a, #b', '#a', 1.5);
    P.spot('#a, #b', '#b', 3.0);
    P.slide('#slab', 4.2);
    P.chars('#slab', 4.32, { mode: 'pop' });
    P.end();
    window.__timelines['x-v2'] = tl;
  })();
  </script>
</template></body></html>`);
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, look: false, check: { textSync: false }, speakerBox: [400, 80, 900, 700], scenes: [
    { id: 'x01', type: 'custom', src: 'compositions/x-v2.html', layout: 'fullscreen', from: 1, to: 8 }] }));
  const b = F.build();
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const r = F.qc('storyboard', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // 段起點 1 秒：a 抬起 1.5–2.0 → 3.1；b 抬起 3.0–3.5 → 4.6；抽屜 4.2–4.7、逐字到 4.91 → 4.7＋0.3＝6.0
  assert.deepEqual(JSON.parse(r.stdout).shots.map((x) => [x.file, x.at, x.why]), [
    ['x01-1.png', 3.1, '焦點抬起：「第一站」'], ['x01-2.png', 4.6, '焦點抬起：「第二站」'], ['x01-3.png', 6, '抽屜抽出後 0.3 秒：「抽屜重點」（完成態）']]);
});

test('暗色主題回歸（T115，fixture dev/tests/fixtures/theme-dark 的段落）：build 出 data-theme="dark" → render → qc final 量到字幕底板 956–1074、字高 71 ± 3，qc-sheet 標 theme: dark', { skip: !CHROME && '沒有 HyperFrames 的 Chrome，略過', timeout: 900000 }, () => {
  const F = fixture();
  const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'theme-dark', 'plan.json'), 'utf8'));
  const seg = (id) => FIX.scenes.find((s) => s.id === id);
  // 字幕只放中文（英數字高不同，qc 不拿來量）；段落用 fixture 的 concept 與 fs-list，壓進 12 秒
  fs.writeFileSync(path.join(F.proj, 'work', 'rough.srt'), '1\n00:00:01,000 --> 00:00:04,000\n暗色主題的字幕\n\n2\n00:00:04,500 --> 00:00:07,500\n深色底上的白字\n\n3\n00:00:08,000 --> 00:00:11,000\n這是第三句字幕\n');
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, theme: FIX.theme, look: false, check: { textSync: false }, speakerBox: FIX.speakerBox, scenes: [
    { ...seg('s01'), from: '#1', to: '#2' }, { ...seg('s03'), id: 's02', from: '#2', to: '#3e' }] }));
  const b = F.build();
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.match(fs.readFileSync(path.join(F.out, 'index.html'), 'utf8'), /<html data-theme="dark"[ >]/);
  const final = path.join(F.proj, 'output', 'final.mp4');
  fs.mkdirSync(path.dirname(final), { recursive: true });
  const rr = spawnSync('npx', ['hyperframes', 'render', '--quality', 'draft', '-o', final], { cwd: F.out, encoding: 'utf8', timeout: 600000, shell: process.platform === 'win32' });
  assert.ok(fs.existsSync(final), rr.stdout + rr.stderr);
  const r = F.qc('final', '--json');
  const j = JSON.parse(r.stdout);
  assert.equal(j.theme, 'dark');
  const cap = j.checks.find((c) => c.key === 'captions');
  assert.equal(cap?.level, 'ok', JSON.stringify(j.checks));
  assert.ok(j.captions.length >= 2 && j.captions.every((x) => Math.abs(x.top - 956) <= 4 && Math.abs(x.bottom - 1074) <= 4 && Math.abs(x.ink - 71) <= 3), JSON.stringify(j.captions));
  // qc-sheet 最上面的主題列是暗色底
  const d = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(F.proj, 'output', 'qc', 'qc-sheet.jpg'), '-vf', 'crop=8:8:1900:4', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
  assert.ok([...d.stdout].reduce((a, v) => a + v, 0) / d.stdout.length < 40);
});

// ---------- 009 直式（specs/009-vertical FR-082、FR-090–FR-093）----------

const { canvasOf } = await imp('lib/canvas.mjs');
const PORT = canvasOf('portrait');

test('直式 final（純函式）：尺寸照畫布 1080×1920；講者面板的用語；字幕底板照 canvas.caption.box', () => {
  const pb = { ...base, width: 1080, height: 1920, canvas: PORT };
  const ok = Q.judge(pb);
  assert.equal(ok.errors, 0, JSON.stringify(ok.checks));
  assert.equal(ok.checks.find((c) => c.key === 'format').text, '格式 1080×1920、30.00fps、有音軌');
  const land = Q.judge({ ...base, canvas: PORT });
  assert.match(land.checks.find((c) => c.key === 'format').text, /^格式不合：尺寸 1920×1080（要 1080×1920）.*尺寸以 build 產生的 1080×1920 為準/);
  assert.equal(Q.judge({ ...pb, pipMissing: [] }).checks.find((c) => c.key === 'pip').text, '上下分割段都有講者面板');
  const its = [{ id: 's02', type: 'scene', family: 'fullscreen', label: '04a 全畫面清單', start: 0, end: 10, out: { start: 0, end: 10, pip: [] } }];
  assert.match(Q.pipMissing({ items: its, voiceOnly: [[0, 10]], project: 'p', portrait: true })[0].msg, /^s02 是全畫面清單卻沒有講者面板：/);
  const C = Q.captionSpec(PORT);
  assert.deepEqual([C.top, C.bottom, C.ink], [1291, 1409, 71]);
  assert.equal(Q.captionSpec(canvasOf('landscape')), Q.CAPTION);
  assert.equal(Q.captionStyleChecks({ samples: [{ n: 1, text: '直式字幕', top: 1291, bottom: 1409, ink: 71 }] }, C)[0].level, 'ok');
  assert.equal(Q.captionStyleChecks({ samples: [{ n: 1, text: '直式字幕', top: 956, bottom: 1074, ink: 71 }] }, C)[0].level, 'warn');
});

test('直式 qc-sheet：每格 9:16（一列 6 格）、格上 unsafe[] 是紅色半透明框；橫式不畫', () => {
  const dir = mkTmp('hf-qc-sheet-v-');
  const mp4 = path.join(dir, 'v.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x808080:s=360x640:rate=30', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', mp4]);
  const out = path.join(dir, 'qc-sheet.jpg'), r = Q.makeQcSheet(mp4, 3, out, 'light', PORT);
  assert.equal(r.unsafe, 3);
  const px = (x, y) => [...spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-vf', `crop=4:4:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']).stdout.subarray(0, 3)];
  const dim = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout.trim();
  assert.equal(dim, `${6 * 270 + 7 * 10},${44 + 480 + 30 + 2 * 10}`);
  // 第一格：畫面在 x 10、y 84 起，縮 0.25 倍 → 上方 unsafe y 0–240 ＝ 格內 0–60；右側按鈕列 x 940–1080、y 840–1440 ＝ 格內 x 235–270、y 210–360
  const red = (p) => p[0] - p[1] > 30;
  assert.ok(red(px(140, 110)), `上方平台介面區要偏紅：${px(140, 110)}`);
  assert.ok(red(px(258, 84 + 280)), `右側按鈕列要偏紅：${px(258, 364)}`);
  assert.ok(red(px(140, 84 + 400)), `下方平台介面區要偏紅：${px(140, 484)}`);
  assert.ok(!red(px(140, 84 + 150)), `安全區不該變紅：${px(140, 234)}`);
  const land = Q.makeQcSheet(mp4, 3, path.join(dir, 'land.jpg'), 'light');
  assert.equal(land.unsafe, undefined);
});

test('直式 framing（純函式）：三個倍率的 9:16 框；1.0＝原畫面；放大時頭頂落在 380–520、下巴 ≤ 860；不合的不當建議', () => {
  const cands = Q.framingCandidatesV([300, 560, 780, 1640], [0, 0, 1080, 1920], [1, 1.15, 1.3], PORT);
  assert.deepEqual(cands.map((c) => c.zoom), [1, 1.15, 1.3]);
  assert.deepEqual(cands[0].frame, [0, 0, 1080, 1920]);
  for (const c of cands) assert.ok(Math.abs(c.frame[2] / c.frame[3] - 9 / 16) < 1e-9 && c.frame[2] % 2 === 0 && c.frame[3] % 2 === 0, `9:16 偶數寬高：${c.frame}`);
  assert.deepEqual(cands[0].face, ['頭頂在 y 560（要 380–520）', '下巴到 y 884（要 ≤ 860）']);   // 下巴沒有 landmarks：上緣＋框高 30%
  assert.deepEqual(cands.slice(1).map((c) => [c.frame, c.head, c.chin, c.face]), [[[72, 170, 936, 1664], 450, 824, []], [[126, 225, 828, 1472], 437, 860, []]]);
  for (const c of cands) c.upscale = c.zoom * 2;
  assert.deepEqual(Q.suggestZoom(cands), { zoom: 1.3, none: false });
  // landmarks 量到的下巴比較低（臉大）：1.3 倍頭頂退到 380 還是放不下 → ⚠
  const big = Q.framingCandidatesV([300, 560, 780, 1640], [0, 0, 1080, 1920], [1.3], PORT, 1000);
  assert.equal(big[0].head, 380);
  assert.deepEqual(big[0].face, ['下巴到 y 953（要 ≤ 860）']);
  // face-landmarks.json（rough.mp4 像素）→ 畫布：540×960 放大 2 倍，下巴取 90 百分位
  const proj = mkTmp('hf-qc-lm-');
  fs.mkdirSync(path.join(proj, 'work'));
  const k = 27, frame = (y) => { const p = new Array(116).fill(0); p[2 * k + 1] = y; return { p }; };
  fs.writeFileSync(path.join(proj, 'work', 'face-landmarks.json'), JSON.stringify({ version: 1, source: { width: 540, height: 960 }, points: Array.from({ length: 58 }, (_, i) => (i === k ? 152 : i)), frames: [frame(400), frame(410), null, frame(420), frame(430)] }));
  assert.equal(Q.chinFromLandmarks({ project: proj }, 1080, 1920), 860);
  assert.equal(Q.chinFromLandmarks({ project: os.tmpdir() }, 1080, 1920), null);
});

test('直式 framing／speaker（CLI）：第一行印版式；構圖預覽三格 9:16、表上三個倍率；動作範圍圖是 1080×1920', { timeout: 180000 }, () => {
  const F = fixture();
  // 540×960 的直拍：灰底上一個左右上下晃的白塊（講者）
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x404040:s=540x960:rate=30:d=12', '-f', 'lavfi', '-i', 'color=c=white:s=140x500:rate=30:d=12',
    '-filter_complex', "[0][1]overlay=x='200+40*sin(t*2)':y='300+20*sin(t*3)'", '-t', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(F.proj, 'work', 'rough.mp4')]);
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, format: 'portrait', look: false, scenes: [] }));
  let r = F.qc('framing');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = r.stdout.split('\n');
  assert.equal(lines[0], '版式：直式 1080×1920（來源：plan.json）');
  assert.match(r.stdout, /^直式構圖：頭頂要落在 y 380–520、下巴 ≤ 860（下巴沒有 face-landmarks\.json，用動作範圍上緣＋框高 30% 估）$/m);
  const rows = lines.filter((l) => /^\d\.\d\dx｜\[/.test(l));
  assert.deepEqual(rows.map((l) => l.slice(0, 5)), ['1.00x', '1.15x', '1.30x']);
  assert.match(rows[0], /^1\.00x｜\[0, 0, 1080, 1920\]｜/);
  assert.match(rows[0], /放大 2 倍/);
  const dims = (f) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
  assert.equal(dims(path.join(F.proj, 'work', '構圖預覽.jpg')), `${3 * 360 + 4 * 10},${640 + 30 + 2 * 10}`);
  assert.match(lines[lines.length - 3], /^→ 下一步：開剪輯台，把它印的「構圖台」網址給使用者拖框/, '下一步和橫式相同');
  assert.match(lines[lines.length - 2], /^node shared\/template\/tools\/editor\.mjs --project \S+$/, '指令單獨一行');
  r = F.qc('speaker');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.split('\n')[0], '版式：直式 1080×1920（來源：plan.json）');
  assert.match(r.stdout, /已等比放大成 1080×1920/);
  assert.match(r.stdout, /數字是 1080×1920 的座標/);
  assert.equal(dims(path.join(F.proj, 'work', '場地照-動作範圍.jpg')), '1080,1920');
  assert.equal(dims(path.join(F.proj, 'work', '場地照-8格.jpg')), `${4 * 360 + 5 * 10},${2 * (640 + 30) + 3 * 10}`);
});

test('直式 final（CLI）：1080×1920 成片格式 ✔、qc-sheet 9:16；同一支片在橫式專案 ✖ 尺寸', { timeout: 180000 }, () => {
  const F = fixture();
  const final = path.join(F.proj, 'output', 'final.mp4');
  fs.mkdirSync(path.dirname(final), { recursive: true });
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', final]);
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, format: 'portrait', look: false, scenes: [] }));
  let r = F.qc('final');
  assert.equal(r.stdout.split('\n')[0], '版式：直式 1080×1920（來源：plan.json）');
  assert.match(r.stdout, /^✔ 格式 1080×1920、30\.00fps、有音軌$/m);
  assert.match(r.stdout, /直式每格 9:16，紅色半透明框是平台介面區/);
  r = F.qc('final', '--json');
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.canvas, { format: 'portrait', size: [1080, 1920], source: 'plan' });
  const sheet = path.join(F.proj, 'output', 'qc', 'qc-sheet.jpg');
  assert.equal(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', sheet], { encoding: 'utf8' }).stdout.trim(), String(6 * 270 + 7 * 10));
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, look: false, scenes: [] }));
  r = F.qc('final');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^✖ 格式不合：尺寸 1080×1920（要 1920×1080）/m);
});

test('直式 storyboard ⚠（FR-082）：橫錄影縮到 < 60 %、沒有 moves、> 3 秒；observe 版面 9:16、一列 8 格', () => {
  const g = (o) => ({ id: 'm01', type: 'media', start: 10, end: 15, annotations: { view: { scale: 0.5625, moves: 0 } }, ...o });
  assert.deepEqual(Q.smallMediaWarnings([g()]), ['m01 的錄影在直式只有原尺寸 56 %，介面字會太小 → 加 moves 推近到操作區']);
  assert.deepEqual(Q.smallMediaWarnings([g({ annotations: { view: { scale: 0.5625, moves: 1 } } }), g({ end: 13 }), g({ annotations: { view: { scale: 0.84, moves: 0 } } }), g({ annotations: { marks: [] } })]), []);
  // 橫式也看（參考專案：retina 錄影縮到 0.47，介面字 8–10px）；有放大鏡就不提醒
  assert.match(Q.smallMediaWarnings([g({ annotations: { view: { scale: 0.47, moves: 0, lens: 0, landscape: true } } })])[0], /^m01 的錄影只有原尺寸 47 %，介面字會太小 → 口播唸到畫面上的字/);
  assert.deepEqual(Q.smallMediaWarnings([g({ annotations: { view: { scale: 0.47, moves: 0, lens: 1, landscape: true } } })]), []);
  const L = Q.obsLayout(PORT);
  assert.equal(Q.obsLayout(canvasOf('landscape')), Q.OBS);
  assert.deepEqual([L.cols, L.rows, L.tile, L.beatCols], [8, 6, [216, 384], 6]);
  assert.ok(L.cols * L.tile[0] <= 1920 && L.beatCols * L.beatTile[0] <= 1920 && Math.abs(L.tile[0] / L.tile[1] - 9 / 16) < 1e-9);
  assert.equal(L.cols * L.rows, Q.OBS.cols * Q.OBS.rows, '一張總表一樣 24 秒');
  assert.deepEqual(Q.sheetCell(10 + 4.5, 10, L), { sheet: 1, r: 2, c: 2 });
  assert.deepEqual(Q.sheetCell(10 + 4.5, 10), { sheet: 1, r: 2, c: 4 });
});

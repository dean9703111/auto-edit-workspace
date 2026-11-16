// 057 剪輯台的背景音樂：時間軸「背景音樂」軌、「整支 → 聲音 → 背景音樂」滑桿
//   這一軌畫什麼（editor/model.mjs bedLane）：有底樂、沒有底樂、這一集寫了不配（bed.music=none）
//   滑桿寫 plan.json 的 bed.volume（editor/server/write.mjs）：規則和 build.mjs --set bed.volume 一樣（第二輪：−40～+6，0＝曲庫檔原本的音量，−40＝靜音），超出範圍不寫
//   即時試聽只補差的 dB（bedLiveDb）、淡入淡出照 build 算的（bedFadeAt）；build --check --json 的 bed（lib/music.mjs bedJson、bedDucks）、build 那一行（bedLine）
//   軌頭的數字、靜音、鎖定在 editor-bed-ui.test.mjs（要瀏覽器）
//   服務：/api/state 的 bed、/api/waveform?src=bed、/api/save 帶 bed
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, imp, makeSrt, tmpDir, missingTools } from './helpers.mjs';

const { bedLane, bedHasMusic, bedLiveDb, bedFadeAt, BED_TEXT, BED_VOL, bedMutedAt } = await imp('editor/model.mjs');
const { applySave, sanitizeBed, LIMITS } = await imp('editor/server/write.mjs');
const M = await imp('lib/music.mjs');
const { timeMap } = await imp('lib/edit.mjs');

const ON = { music: 'bed-a', from: 'plan.json', volume: 0, relDb: -6, muted: false, ducked: true, start: 0, end: 120, outStart: 0, outEnd: 130, fadeIn: 2, fadeOut: 3, ducks: [[1, 40], [42, 119]] };

test('背景音樂軌：有底樂畫一條（範圍、淡入淡出、壓低照檢查報告）；沒有底樂、這一集不配各寫一行淡字；報告還沒好先看 plan.json', () => {
  // 檢查報告（build --check --json 的 bed）
  const on = bedLane(ON, { music: 'bed-a' });
  assert.equal(on.kind, 'on');
  assert.deepEqual([on.music, on.start, on.end, on.fadeIn, on.fadeOut, on.ducks], ['bed-a', 0, 120, 2, 3, [[1, 40], [42, 119]]]);
  assert.deepEqual(bedLane(null, { music: null }), { kind: 'none', text: '沒有背景音樂' });
  assert.deepEqual(bedLane({ music: null }, { music: null, off: true }), { kind: 'off', text: '這一集不配' });
  assert.deepEqual(BED_TEXT, { none: '沒有背景音樂', off: '這一集不配' });
  // 整段固定音量（這一集有剪段）：不畫壓低
  assert.deepEqual(bedLane({ ...ON, ducked: false, ducks: [] }).ducks, []);
  assert.deepEqual(bedLane({ ...ON, ducked: false }).ducks, [], 'ducked false 時就算有區間也不畫');
  assert.equal(bedLane({ music: 'bed-a', from: 'plan.json', volume: 0, relDb: -6, muted: false, ducked: false, short: true }).kind, 'short');
  // 靜音（bed.volume −40）：照樣畫一條（剪輯台畫暗的）
  assert.deepEqual([bedLane({ ...ON, volume: -40, muted: true }).kind, bedLane({ ...ON, volume: -40, muted: true }).muted], ['on', true]);
  // 報告還沒好（undefined）：先照 /api/state 的 bed
  assert.deepEqual(bedLane(undefined, { music: 'bed-a', off: false }), { kind: 'wait', music: 'bed-a', text: 'bed-a（位置等檢查報告）' });
  assert.equal(bedLane(undefined, { music: null, off: true }).kind, 'off');
  assert.equal(bedLane(undefined, { music: null, off: false }).kind, 'none');
  assert.equal(bedLane(undefined, null).kind, 'none');
  // 滑桿：有曲子才能拖
  assert.deepEqual(['on', 'wait', 'short', 'none', 'off'].map((kind) => bedHasMusic({ kind })), [true, true, true, false, false]);
});

test('即時試聽：只補音量與做進 wav 的差；重新 build 之後差＝0，不會疊兩次；淡入淡出照 build 的秒數；範圍和 build 同一組數字', () => {
  assert.equal(bedLiveDb(3, { volume: 0 }), 3);
  assert.equal(bedLiveDb(3, { volume: 3 }), 0, 'build 用新的 bed.volume 重混之後');
  assert.equal(bedLiveDb(-6, { volume: 6 }), -12);
  assert.equal(bedLiveDb(5, null), 0, '還沒做進預覽：沒有 wav 可以補');
  assert.deepEqual([...BED_VOL], M.BED.volume, '頁面的範圍（model.mjs）和 lib/music.mjs 同一組');
  assert.deepEqual([bedMutedAt(-40), bedMutedAt(-39), bedMutedAt(0)], [true, false, false], '−40＝靜音');
  assert.equal(bedFadeAt(-0.1, ON), 0);
  assert.equal(bedFadeAt(1, ON), 0.5);
  assert.equal(bedFadeAt(60, ON), 1);
  assert.equal(bedFadeAt(128.5, ON), 0.5);
  assert.equal(bedFadeAt(131, ON), 0);
});

const PLAN = `{
  "version": 1,
  "speakerBox": [700, 200, 1220, 1000],
  "bed": {
    "music": "bed-a"
  },
  "scenes": [
    { "id": "s01", "scene": "concept", "from": "#1", "to": "#2e", "slots": { "text": "字卡" } }
  ]
}
`;

test('滑桿寫 plan.json 的 bed.volume：−40～+6，0＝原本的音量（拿掉）；0、−40、+6 寫得進去；−41、+7、不是數字、多寫欄位都不寫；只動 bed 那一塊', () => {
  const a = applySave(PLAN, { bed: { volume: 3 } }, {});
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.plan.bed, { music: 'bed-a', volume: 3 });
  assert.equal(a.text, PLAN.replace('"bed": {\n    "music": "bed-a"\n  }', '"bed": { "music": "bed-a", "volume": 3 }'), '其他文字原封不動');
  const z = applySave(a.text, { bed: { volume: 0 } }, {});
  assert.deepEqual(z.plan.bed, { music: 'bed-a' }, '0＝預設，拿掉 volume');
  assert.equal(applySave(a.text, { bed: { volume: 3 } }, {}).text, null, '沒變就不寫');
  assert.deepEqual(LIMITS.bedVolume, [-40, 6]);
  for (const v of [-40, 6, -6.5]) assert.deepEqual(applySave(PLAN, { bed: { volume: v } }, {}).plan.bed, { music: 'bed-a', volume: v }, `${v} 可以`);
  assert.equal(applySave(PLAN, { bed: { volume: 0 } }, {}).text, null, '0＝原本的音量＝沒寫，不用動');
  for (const v of [-41, 7, 12, '3', null]) {
    const r = applySave(PLAN, { bed: { volume: v } }, {});
    assert.match(r.errors.join('\n'), /bed\.volume 要是 −40～\+6 的 dB 數字（0＝原本的音量，−40＝靜音）/, `${JSON.stringify(v)} 不行`);
    assert.equal(r.text, undefined, '有錯就整個不寫');
  }
  assert.match(applySave(PLAN, { bed: { volume: 3, music: 'bed-b' } }, {}).errors.join('\n'), /bed 只能調 volume，不能寫「music」/);
  assert.match(applySave(PLAN, { bed: 3 }, {}).errors.join('\n'), /bed 要寫成 \{ "volume": −40～\+6 \}/);
});

test('滑桿和 build.mjs --set bed.volume 同一套：用工作區預設的底樂時曲名一起寫；沒有底樂、這一集不配都擋下', () => {
  const noBed = PLAN.replace(/  "bed": \{\n    "music": "bed-a"\n  \},\n/, '');
  const d = applySave(noBed, { bed: { volume: -4 } }, { bedDefault: 'bed-d' });
  assert.deepEqual(d.errors, []);
  assert.deepEqual(d.plan.bed, { music: 'bed-d', volume: -4 }, '只寫音量會把預設的底樂關掉：曲名一起寫');
  assert.deepEqual(Object.keys(d.plan), ['version', 'speakerBox', 'bed', 'scenes'], '新的 bed 插在 scenes 前面');
  assert.equal(applySave(noBed, { bed: { volume: 0 } }, { bedDefault: 'bed-d' }).text, null, '預設的底樂、預設音量：沒變');
  assert.match(applySave(noBed, { bed: { volume: 3 } }, {}).errors.join('\n'), /這一集沒有背景音樂，bed\.volume 沒有對象/);
  const off = PLAN.replace('"music": "bed-a"', '"music": null');
  assert.match(applySave(off, { bed: { volume: 3 } }, { bedDefault: 'bed-d' }).errors.join('\n'), /這一集不配背景音樂/);
  assert.deepEqual(sanitizeBed({ volume: 2 }, { bed: { music: 'bed-a', volume: 5 } }).bed, { music: 'bed-a', volume: 2 });
});

test('build --check --json 的 bed：沒設定 null、不配 { music: null }、有鋪的範圍換成 rough.mp4 秒數；講話時壓低的區間扣掉 ≥ 1 秒的停頓；build 那一行照新刻度寫', () => {
  assert.equal(M.bedJson(null, null), null);
  assert.deepEqual(M.bedJson({ music: null }, null), { music: null });
  const bed = { music: 'bed-a', from: 'plan.json', volume: 0, relDb: -6 };
  assert.deepEqual(M.bedJson({ ...bed, volume: 2, relDb: -4 }, null), { music: 'bed-a', from: 'plan.json', volume: 2, relDb: -4, muted: false, ducked: false, short: true });
  const clip = M.bedPlan(bed, { outDur: 130 });
  const ducks = M.bedDucks([{ start: 1, end: 3 }, { start: 3.5, end: 10 }, { start: 12, end: 20 }]);
  assert.deepEqual(ducks, [[1, 10], [12, 20]], '字幕之間 0.5 秒的空檔不算回升，2 秒的算');
  assert.deepEqual(M.bedDucks([{ start: 1, end: 20 }], [[5, 5.4], [8, 9.5], [30, 40]]), [[1, 8], [9.5, 20]], '說話停頓：短的不算、字幕範圍外的不算');
  assert.deepEqual(M.bedDucks([]), []);
  // 沒剪段：rough 秒數＝完成影片秒數；片尾卡那段（120–130）在 rough.mp4 外面，end 停在主軌結尾
  const j = M.bedJson(bed, clip, { tm: timeMap([], 120), ducks });
  assert.deepEqual(j, { music: 'bed-a', from: 'plan.json', volume: 0, relDb: -6, muted: false, ducked: true, start: 0, end: 120, outStart: 0, outEnd: 130, fadeIn: 2, fadeOut: 3, ducks });
  assert.equal(M.bedJson({ ...bed, volume: -40, muted: true }, clip, { tm: timeMap([], 120), ducks }).muted, true, '靜音：範圍照樣給');
  // 有剪段：整段固定音量、不畫壓低；範圍換回 rough.mp4 秒數（剪掉的片頭 0–5）
  const k = M.bedJson(bed, M.bedPlan(bed, { outDur: 115 }), { tm: timeMap([[0, 5]], 120), ducked: false, ducks });
  assert.deepEqual([k.ducked, k.ducks, k.start, k.end, k.outEnd], [false, [], 5, 120, 115]);
  // build 印的那一行
  const c = M.bedPlan(bed, { outDur: 121 });
  assert.equal(M.bedLine(bed, c), '底樂：bed-a 鋪 0:00–2:01，音量 0 dB（原本的音量，約比人聲小 6 dB），講話時壓低 6 dB，淡入 2 秒、淡出 3 秒');
  assert.equal(M.bedLine({ ...bed, from: '工作區預設', volume: 3, relDb: -3 }, c, { ducked: false }), '底樂：bed-a（工作區預設） 鋪 0:00–2:01，音量 +3 dB（約比人聲小 3 dB），整段固定音量（這一集有剪輯台的剪段），淡入 2 秒、淡出 3 秒');
  assert.match(M.bedLine({ ...bed, volume: -40, muted: true }, c), /^底樂：bed-a 靜音（bed\.volume −40 dB＝靜音），完成影片不放/);
});

const noFf = await missingTools('ffmpeg');
test('服務：/api/state 的 bed（plan.json、工作區預設、上一次 build 做進去的 wav）、/api/waveform?src=bed、/api/save 帶 bed', { skip: noFf, timeout: 120000 }, async (t) => {
  const root = tmpDir(t, 'editor-bed-');
  const shared = path.join(root, 'shared');
  fs.mkdirSync(shared);
  fs.symlinkSync(TEMPLATE, path.join(shared, 'template'), 'dir');
  fs.writeFileSync(path.join(shared, 'setting.json'), JSON.stringify({ music: { bed: 'bed-d' } }));
  const proj = path.join(root, 'projects', 'alpha'), work = path.join(proj, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  const v = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=160x90:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(v.status, 0, String(v.stderr));
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 1 }));
  const planFile = path.join(out, 'plan.json');
  fs.writeFileSync(planFile, '{\n  "version": 1,\n  "scenes": []\n}\n');
  const { startEditor } = await imp('editor.mjs');
  const ed = await startEditor({ cwd: root, flags: { project: proj, template: path.join(shared, 'template') }, port: 0, writeState: false, speakerTemplate: path.join(shared, 'template') });
  t.after(() => ed.close());
  const get = async (p) => (await fetch(new URL(p, ed.url))).json();
  const save = async (body) => { const s = await get('/api/state'); const r = await fetch(new URL('/api/save', ed.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quick: true, base: { mtime: s.plan.mtime, hash: s.plan.hash }, ...body }) }); return { status: r.status, body: await r.json() }; };

  // plan.json 沒寫 bed：用工作區預設的底樂；還沒 build 過，沒有 wav
  let s = await get('/api/state');
  assert.deepEqual(s.bed, { music: 'bed-d', off: false, volume: 0, built: null });
  assert.match((await get('/api/waveform?src=bed')).error, /背景音樂還沒做進預覽/);
  // build 做進去的那一條（.cache/bed.json＋wav）
  const wav = path.join(out, 'assets', 'bed-bed-d-0123456789ab.wav');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000', '-t', '3', wav]).status, 0);
  // 第一輪的記錄（沒有 v：舊刻度）不算，免得即時試聽照舊刻度補差
  fs.mkdirSync(path.join(out, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(out, '.cache', 'bed.json'), JSON.stringify({ file: 'assets/bed-bed-d-0123456789ab.wav', music: 'bed-d', volume: 12, sfx: 0, at: 0, dur: 3 }));
  assert.equal((await get('/api/state')).bed.built, null);
  M.writeBedInfo(out, { file: 'assets/bed-bed-d-0123456789ab.wav', music: 'bed-d', volume: 0, at: 0, dur: 3 });
  s = await get('/api/state');
  assert.deepEqual({ ...s.bed.built, url: s.bed.built.url.replace(/\?v=\w+$/, '') }, { music: 'bed-d', volume: 0, at: 0, dur: 3, url: '/composition/assets/bed-bed-d-0123456789ab.wav' });
  const w = await get('/api/waveform?src=bed');
  assert.equal(w.rate, 25);
  assert.ok(Math.abs(w.peaks.length - 75) <= 1 && Math.max(...w.peaks) > 100, `波形 ${w.peaks.length} 格`);
  assert.equal((await fetch(new URL(s.bed.built.url, ed.url))).status, 200, '快速試聽播得到這條 wav');

  // 滑桿存檔：曲名一起寫；超出範圍 400、plan.json 不動
  let r = await save({ bed: { volume: 3 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(JSON.parse(fs.readFileSync(planFile, 'utf8')).bed, { music: 'bed-d', volume: 3 });
  assert.equal((await get('/api/state')).bed.volume, 3);
  const before = fs.readFileSync(planFile, 'utf8');
  r = await save({ bed: { volume: 7 } });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /bed\.volume 要是 −40～\+6 的 dB 數字（0＝原本的音量，−40＝靜音），現在是 7/);
  assert.equal(fs.readFileSync(planFile, 'utf8'), before);
  // 這一集不配：狀態寫 off，存音量 400
  fs.writeFileSync(planFile, '{\n  "version": 1,\n  "bed": { "music": null },\n  "scenes": []\n}\n');
  s = await get('/api/state');
  assert.deepEqual([s.bed.music, s.bed.off], [null, true]);
  r = await save({ bed: { volume: 2 } });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /這一集不配背景音樂/);
  // 這次 build 沒配：記錄拿掉
  M.writeBedInfo(out, null);
  assert.equal(M.readBedInfo(out), null);
  assert.equal((await get('/api/state')).bed.built, null);
});

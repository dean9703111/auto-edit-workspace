// 036（specs/036-shotcraft-more）：截圖欄位（type shot）、穿窗（"enter": "dive"）、本集地圖（"chapterMap": true）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lib, imp, makeSrt, tmpDir, needs } from './helpers.mjs';

const { resolvePlan, formatReport } = await imp('lib/plan.mjs');
const { buildMain } = await imp('lib/main.mjs');
const { sceneParts } = await imp('lib/assemble.mjs');
const { resolveScene, sampleSeg, mapScene, chapterMapCtx, MAP } = await imp('lib/scenes.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const { validateSlots } = await imp('lib/custom-fill.mjs');
const { isShotImage, isShotSeg, shotRel, shotSlots, checkShots, prepareShots } = await imp('lib/shots.mjs');
const L = await lib();
const cues = parseSrt(makeSrt({ n: 12 }));   // 第 N 句 (N−1)×3.5＋1 起、長 3 秒
const VD = 44;
const go = (scenes, { voiceOnly = [], ...extra } = {}) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes, ...extra }, cues, videoDur: VD, lib: L, outDir: os.tmpdir(), voiceOnly });
const byId = (res, id) => res.items.find((x) => x.id === id);
const list = (id, from, to, title = 'A') => ({ id, scene: 'fs-list', from, to, slots: { title, items: ['一', '二', '三'], visual: 'laptop' } });
const main = (res) => buildMain({ items: res.items, videoDur: VD, captions: null, pip: res.globals.pip, cues: res.cuesOut, moods: res.moods, zooms: res.zooms }).html;

// ---------- 截圖欄位 ----------

const SPEC = { template: 'x-t', slots: { pic: { type: 'shot', from: 'image' }, items: { type: 'list', item: { shot: { type: 'shot' }, label: { type: 'text' } } }, seg: { type: 'shot', from: 'segment' } } };

test('截圖欄位的值：圖片檔（assets/images、assets/screen 的 png jpg webp）或段 id；檔名只看值（同一個值同一個檔）', () => {
  assert.ok(isShotImage('assets/images/調光前.png') && isShotImage('assets/screen/a.WEBP') && isShotImage('assets/images/x/y.jpeg'));
  assert.ok(!isShotImage('assets/camera/a.png') && !isShotImage('assets/images/a.gif') && !isShotImage('s0106'));
  assert.ok(isShotSeg('s0106') && isShotSeg('c01') && !isShotSeg('assets/images/a.png') && !isShotSeg('01'));
  assert.equal(shotRel('s0106'), 'assets/shots/seg-s0106.jpg');
  const a = shotRel('assets/images/調光 前.png');
  assert.match(a, /^assets\/shots\/img-調光-前-[0-9a-f]{8}\.jpg$/);
  assert.equal(shotRel('assets/images/調光 前.png'), a);
  assert.notEqual(shotRel('assets/screen/調光 前.png'), a, '不同資料夾的同名檔不撞');
});

test('validateSlots：from image 只收圖片、from segment 只收段 id、沒寫兩種都收；shotSlots 把清單逐項展開', () => {
  const ok = { pic: 'assets/images/a.png', items: [{ shot: 's01', label: '一' }, { shot: 'assets/screen/b.jpg', label: '二' }], seg: 's02' };
  assert.deepEqual(validateSlots(SPEC, ok), []);
  const bad = validateSlots(SPEC, { pic: 's01', items: [{ shot: 'a.png', label: '一' }], seg: 'assets/images/a.png' });
  assert.equal(bad.length, 3, bad.join('\n'));
  assert.match(bad.join('\n'), /要寫圖片檔/);
  assert.match(bad.join('\n'), /要寫這一集前面某一段的 id/);
  assert.deepEqual(shotSlots(SPEC, ok), [
    { key: 'pic', value: 'assets/images/a.png', from: 'image' },
    { key: 'items[1].shot', value: 's01', from: 'any' },
    { key: 'items[2].shot', value: 'assets/screen/b.jpg', from: 'any' },
    { key: 'seg', value: 's02', from: 'segment' },
  ]);
});

const shotProject = (t) => {
  const dir = tmpDir(t);
  const customDir = path.join(dir, 'custom');
  fs.mkdirSync(customDir);
  fs.writeFileSync(path.join(customDir, 'x-t.fill.json'), JSON.stringify(SPEC));
  fs.mkdirSync(path.join(dir, 'assets', 'images'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'work', 'storyboard-preview'), { recursive: true });
  return { dir, lib: { customDir } };
};
const planWith = (slots) => ({ scenes: [{ id: 's01', scene: 'quote' }, { id: 's02', type: 'custom', template: 'x-t', slots }, { id: 's03', scene: 'quote' }] });

test('checkShots：檔不在、段不在、段在後面、種類不對 ✖；段還沒截圖 ⚠ 先放空白；有好幾張取最後一張', (t) => {
  const { dir, lib: l } = shotProject(t);
  fs.writeFileSync(path.join(dir, 'assets', 'images', 'a.png'), 'x');
  const bad = checkShots({ plan: planWith({ pic: 'assets/images/none.png', items: [{ shot: 's03' }, { shot: 's99' }, { shot: 's02' }], seg: 's01' }), lib: l, projectDir: dir });
  assert.equal(bad.errors.length, 4, bad.errors.join('\n'));
  assert.match(bad.errors[0], /\[s02 custom x-t\] slots\.pic：找不到 assets\/images\/none\.png/);
  assert.match(bad.errors[1], /items\[1\]\.shot：「s03」不在這一段前面/);
  assert.match(bad.errors[2], /items\[2\]\.shot：這一集沒有「s99」這一段/);
  assert.match(bad.errors[3], /items\[3\]\.shot：「s02」不在這一段前面/);
  assert.equal(bad.warnings.length, 1);
  assert.match(bad.warnings[0], /slots\.seg：「s01」還沒有截圖.*qc\.mjs storyboard/);
  assert.equal(bad.jobs.get('assets/shots/seg-s01.jpg').src, null, '還沒截圖：空白');

  const sb = path.join(dir, 'work', 'storyboard-preview');
  for (const f of ['s01.png', 's01-1.png', 's01-10.png', 's01-2.png']) fs.writeFileSync(path.join(sb, f), 'x');
  const good = checkShots({ plan: planWith({ pic: 'assets/images/a.png', items: [{ shot: 's01' }], seg: 's01' }), lib: l, projectDir: dir });
  assert.deepEqual([good.errors, good.warnings], [[], []]);
  assert.deepEqual([...good.jobs.keys()].sort(), [shotRel('assets/images/a.png'), 'assets/shots/seg-s01.jpg'].sort());
  assert.equal(good.jobs.get('assets/shots/seg-s01.jpg').src, path.join(sb, 's01-10.png'), '-N 照數字排，取最後一張');
  assert.equal(good.jobs.get('assets/shots/seg-s01.jpg').crop, true, '橫式切掉字幕帶');
  const mismatch = checkShots({ plan: planWith({ pic: 's01', seg: 'assets/images/a.png' }), lib: l, projectDir: dir });
  assert.equal(mismatch.errors.length, 2, mismatch.errors.join('\n'));
});

test('prepareShots：圖片縮到 1920×1080 以內、段的截圖切字幕帶成 960×540、沒截圖放空白；來源沒變不重做、沒用到的刪掉', async (t) => {
  if (!(await needs(t, 'ffmpeg'))) return;
  const dir = tmpDir(t), out = path.join(dir, 'out');
  const mk = (f, size) => assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=red:s=${size}`, '-frames:v', '1', f]).status, 0);
  const img = path.join(dir, 'a.png'), seg = path.join(dir, 's01.png');
  mk(img, '2400x1500'); mk(seg, '1920x1080');
  const dims = (f) => spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
  const jobs = new Map([['assets/shots/img-a.jpg', { kind: 'image', src: img, label: 'a' }], ['assets/shots/seg-s01.jpg', { kind: 'segment', src: seg, crop: true, label: 's01' }], ['assets/shots/seg-s02.jpg', { kind: 'segment', src: null, crop: true, label: 's02' }]]);
  const logs = [];
  assert.equal(prepareShots({ jobs, out, log: (m) => logs.push(m) }), 3);
  const sd = path.join(out, 'assets', 'shots');
  assert.deepEqual([dims(path.join(sd, 'img-a.jpg')), dims(path.join(sd, 'seg-s01.jpg')), dims(path.join(sd, 'seg-s02.jpg'))], ['1728,1080', '960,540', '960,540']);
  assert.ok(logs.some((l) => l.includes('還沒有截圖，先放空白')));
  const idx = fs.readFileSync(path.join(sd, 'index.json'), 'utf8');
  assert.equal(prepareShots({ jobs, out }), 0, '來源沒變不重做');
  assert.equal(fs.readFileSync(path.join(sd, 'index.json'), 'utf8'), idx);
  jobs.delete('assets/shots/img-a.jpg');
  assert.equal(prepareShots({ jobs, out }), 0);
  assert.ok(!fs.existsSync(path.join(sd, 'img-a.jpg')), '沒用到的舊檔刪掉');
});

// ---------- 穿窗 ----------

test('穿窗：後一段寫 "enter": "dive"、前後都是全畫面 → 前一段 txOut dive；相鄰兩個接縫不都穿窗、前一段不是全畫面 ⚠ 照舊；enter 寫別的 ✖', () => {
  const s2 = { ...list('s2', 15, 19.5, 'B'), enter: 'dive' }, s3 = { ...list('s3', 19.5, 24, 'C'), enter: 'dive' };
  const res = go([list('s1', 11, 15, 'A'), s2, s3], { voiceOnly: [[11, 24]] });
  assert.deepEqual(res.errors, []);
  const [a, b, c] = ['s1', 's2', 's3'].map((id) => byId(res, id));
  assert.deepEqual([a.txOut, b.txIn, b.txOut, c.txIn], ['dive', 'dive', 'swap', 'swap']);
  assert.ok(res.warnings.some((w) => /\[s3 .*enter "dive"：s2 已經是穿窗進來的/.test(w)), res.warnings.join('\n'));
  assert.match(formatReport(res), /穿窗 1（s2）/);
  const html = main(res);
  assert.match(html, /id="el-s1"[^>]*data-duration="5\.33"[^>]*scale: var\(--dz, 1\)/, '前一段多留 1.33 秒一起放大');
  assert.match(html, /id="el-s2"[^>]*clip-path: circle\(calc\(var\(--dR, 0px\) \/ var\(--dk, 1\)\)/);
  assert.match(html, /<div id="dvr-s2" class="clip" data-layout-ignore data-start="15" data-duration="1\.33"/);
  assert.ok(html.includes(`diveAt('s1', 4)`), '量前一段結尾那一刻');
  assert.ok(html.includes(`tl.fromTo('#el-s1', { '--dz': 1 }, { '--dz': 2.4, duration: 1.33, ease: 'power3.inOut', immediateRender: false }, 15);`));
  assert.ok(html.includes('function diveAt(id, t)'));

  const lt = go([{ id: 'q1', scene: 'quote', from: '#4', to: '#5e', slots: { text: '經驗變成資產' } }, { ...list('s2', 18.5, 24), enter: 'dive' }]);
  assert.ok(lt.warnings.some((w) => /前一段要是全畫面/.test(w)), lt.warnings.join('\n'));
  assert.equal(byId(lt, 's2').txIn === 'dive', false);

  const bad = go([list('s1', 11, 15), { ...list('s2', 15, 19.5), enter: 'zoom' }], { voiceOnly: [[11, 24]] });
  assert.ok(bad.errors.some((e) => /enter 只能寫 "dive"/.test(e)), bad.errors.join('\n'));
});

test('穿窗一集最多 3 次，第 4 次 ⚠ 照舊', () => {
  const segs = Array.from({ length: 8 }, (_, i) => ({ ...list(`s${i + 1}`, 11 + i * 4, 15 + i * 4, `T${i}`), ...(i % 2 ? { enter: 'dive' } : {}) }));
  const res = go(segs, { voiceOnly: [[11, 43]] });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(['s2', 's4', 's6', 's8'].map((id) => byId(res, id).txIn), ['dive', 'dive', 'dive', 'swap']);
  assert.ok(res.warnings.some((w) => /\[s8 .*一集最多穿窗 3 次/.test(w)), res.warnings.join('\n'));
});

// ---------- 本集地圖 ----------

const chapters = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, scene: 'chapter', at: `#${1 + i * 3}`, slots: { num: String(i + 1).padStart(2, '0'), title: `第${i + 1}章` } }));

test('本集地圖："chapterMap": true → 每個 01 換成地圖版（標籤寫第幾章）、不提醒副標；章數不在 3–8、直式 ⚠ 照舊；寫錯型別 ✖', () => {
  const res = go(chapters(3), { chapterMap: true });
  assert.deepEqual(res.errors, []);
  const [c1, c2, c3] = ['c1', 'c2', 'c3'].map((id) => byId(res, id));
  assert.deepEqual([c1.scene.mapOf, c2.label.endsWith('（本集地圖 2／3）'), c3.mapCtx.curNum, c3.mapCtx.total], ['chapter', true, '03', '03']);
  assert.ok(!res.items.some((x) => x.warnings.some((w) => w.includes('沒有副標'))), '地圖版不放副標');
  assert.ok(!Object.keys(c1).includes('mapCtx'), 'mapCtx 不進報告的 JSON');

  const plain = go(chapters(3));
  assert.ok(!byId(plain, 'c1').mapCtx && byId(plain, 'c1').warnings.some((w) => w.includes('沒有副標')));
  const two = go(chapters(2), { chapterMap: true });
  assert.ok(two.warnings.some((w) => /有 2 個 01 章節轉場，本集地圖要 3–8 章/.test(w)));
  assert.ok(!byId(two, 'c1').mapCtx);
  const tall = go(chapters(3), { chapterMap: true, format: 'portrait' });
  assert.ok(tall.warnings.some((w) => w.startsWith('chapterMap：直式不做本集地圖')), tall.warnings.join('\n'));
  assert.ok(!byId(tall, 'c1').mapCtx);
  const bad = go(chapters(3), { chapterMap: 'yes' });
  assert.ok(bad.errors.some((e) => e.startsWith('chapterMap 只能是 true')));
});

// 兩層相機（外層 cam0 靜態、裡層 P.cam 推 camX／camY／camS，原點都在 (mapOx, 540)）組起來，世界座標 (x, y) 在畫面上的位置
const onScreen = (m, x, y) => {
  const [, fx, fy, fs0] = m.cam0.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/).map(Number);
  const inner = (px, py, tx, ty, s) => [m.mapOx + tx + s * (px - m.mapOx), 540 + ty + s * (py - 540)];
  const [ax, ay] = inner(x, y, m.camX, m.camY, m.camS);
  return inner(ax, ay, fx, fy, fs0);
};

test('chapterMapCtx：鏡頭結束時這一章的站在 MAP.at；開始時上一章在同一個位置、第一章整張地圖在畫面裡；路線只描上一章 → 這一章', () => {
  const list8 = Array.from({ length: 8 }, (_, i) => ({ num: String(i + 1), title: `章${i + 1}` }));
  for (const k of [0, 3, 7]) {
    const m = chapterMapCtx(list8, k);
    const [x, y] = onScreen(m, m.stations[k].x, m.stations[k].y);
    assert.ok(Math.abs(x - MAP.at[0]) < 0.5 && Math.abs(y - MAP.at[1]) < 0.5, `k=${k}：(${x}, ${y})`);
    assert.deepEqual(m.stations.map((s) => (s.done ? 'd' : s.cur ? 'c' : 't')).join(''), 'd'.repeat(k) + 'c' + 't'.repeat(7 - k));
    assert.equal(m.first, k === 0);
    assert.equal(Boolean(m.pathNew), k > 0);
    assert.equal(Boolean(m.pathPrev), k > 1);
  }
  const m3 = chapterMapCtx(list8, 3);
  const fx = m3.cam0.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/).slice(1).map(Number);
  const startOf = (x, y) => [m3.mapOx + fx[0] + fx[2] * (x - m3.mapOx), 540 + fx[1] + fx[2] * (y - 540)];
  assert.deepEqual(startOf(m3.stations[2].x, m3.stations[2].y).map(Math.round), MAP.at, '開始：上一章在 MAP.at');
  const m0 = chapterMapCtx(list8, 0);
  const f0 = m0.cam0.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/).slice(1).map(Number);
  const xs = m0.stations.map((s) => m0.mapOx + f0[0] + f0[2] * (s.x - m0.mapOx));
  assert.ok(Math.min(...xs) > 120 && Math.max(...xs) < 1800, `第一章開始看得到整張地圖：${xs.map(Math.round)}`);
  assert.equal(m3.total, '08');
  assert.equal(m3.curNum, '04');
});

test('地圖版組得起來：站、路線兩層、章號牌（CHAPTER 02／03）、鏡頭推近；第一章不描路線', () => {
  const ch = L.scenes.find((s) => s.key === 'chapter');
  assert.ok(ch.hasMap);
  const seg = sampleSeg(ch);
  const r = resolveScene({ scene: ch, seg, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: seg.duration });
  assert.deepEqual(r.errors, []);
  const parts = (k) => sceneParts({ scene: mapScene(ch), ctx: { ...r.ctx, ...chapterMapCtx([{ num: '01', title: '開場' }, { num: '02', title: '多支手機' }, { num: '03', title: '收尾' }], k) }, beats: r.beats, id: 'pv', D: seg.duration, tone: null });
  const p = parts(1);
  assert.equal((p.body.match(/class="mp-st/g) || []).length, 3);
  assert.match(p.body, /class="mp-st is-done"/);
  assert.match(p.body, /class="mp-st is-cur" id="pv-mpCur"/);
  assert.match(p.body, /CHAPTER 02<b>／03<\/b>/);
  assert.equal((p.body.match(/class="mp-done mp-new"/g) || []).length, 2, '路線畫兩層（框線＋深線）');
  assert.doesNotMatch(p.body, />多支手機<\/span><\/span>/, '這一章的站不放站名（章名在下面）');
  assert.match(p.timeline, /P\.cam\('#pv-mpWorld', 0\.1, \{ x: [-\d.]+, y: [-\d.]+, scale: [\d.]+, dur: 1\.0 \}\)/);
  assert.match(p.timeline, /P\.stroke\('#pv-mpSvg \.mp-new', 0\.25/);
  assert.doesNotMatch(parts(0).timeline, /P\.stroke/, '第一章沒有上一章，不描路線');
});

// 插入素材（type: "media"）、只有聲音的區間（blackdetect）、--check --json、media.mjs（main／scan／frame）
// 測試素材全部用 ffmpeg lavfi 現場產生；假工作區的 shared/template 用 symlink 指到真的模板
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, makeSrt } from './helpers.mjs';

const BUILD = path.join(TOOLS, 'build.mjs');
const MEDIA = path.join(TOOLS, 'media.mjs');
let root, tpl, proj, out;

const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const probe = (f, entries) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
const node = (script, args, project = 'p1') => spawnSync(process.execPath, [script, ...args, '--template', tpl, '--project', `projects/${project}`], { encoding: 'utf8', cwd: root });
const build = (...args) => node(BUILD, args);
const checkJson = () => { const r = build('--check', '--json'); return { r, j: JSON.parse(r.stdout) }; };
const writePlan = (scenes, extra = {}) => fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, speakerBox: [100, 20, 220, 170], ...extra, scenes }, null, 2));
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const REC = '素材/螢幕錄影/操作示範.mp4';
const IMG = '素材/圖片/架構圖.png';

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-media-'));
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  tpl = path.join(root, 'shared', 'template');
  fs.symlinkSync(TEMPLATE, tpl, 'dir');
  for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'pop.wav'), path.join(root, 'shared', 'sfx', `${n}.wav`));
  proj = path.join(root, 'projects', 'p1');
  for (const d of ['真人錄影', '聲音', '螢幕錄影', '圖片']) fs.mkdirSync(path.join(proj, '素材', d), { recursive: true });
  out = path.join(proj, 'work', 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  const cam = (name, sec, src) => ff(['-f', 'lavfi', '-i', `${src}=size=320x180:rate=30`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', String(sec), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(proj, '素材', '真人錄影', name)]);
  cam('01-開場.mp4', 8, 'testsrc');
  cam('03-結尾.mp4', 6, 'smptebars');
  ff(['-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=44100', '-t', '4', '-c:a', 'aac', path.join(proj, '素材', '聲音', '02-旁白.m4a')]);
  // 螢幕錄影：640×400、25fps、關鍵幀稀疏（build 要轉成 30fps、每秒一個關鍵幀），有聲音
  ff(['-f', 'lavfi', '-i', 'testsrc=size=640x400:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '250', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(proj, ...REC.split('/'))]);
  ff(['-f', 'lavfi', '-i', 'color=c=0x3B82F6:s=800x500', '-frames:v', '1', path.join(proj, ...IMG.split('/'))]);
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), makeSrt({ n: 5 }));   // #5＝15–18
  fs.writeFileSync(path.join(proj, 'work', 'cutpoints.json'), JSON.stringify({ cuts: [{ at: 8, kind: 'pause' }, { at: 12, kind: 'ng' }] }));
});

test('media.mjs main：照檔名接主軌，聲音檔配純黑畫面，寫 work/main.json', () => {
  const r = node(MEDIA, ['main']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const main = path.join(proj, 'work', 'main.mp4');
  assert.ok(Math.abs(Number(probe(main, 'format=duration')) - 18) < 0.05);
  assert.equal(probe(main, 'stream=r_frame_rate').split('\n')[0], '30/1');
  const j = JSON.parse(fs.readFileSync(path.join(proj, 'work', 'main.json'), 'utf8'));
  assert.deepEqual(j.clips.map((c) => [c.file, c.kind, c.start, c.end]), [['素材/真人錄影/01-開場.mp4', 'camera', 0, 8], ['素材/聲音/02-旁白.m4a', 'voice', 8, 12], ['素材/真人錄影/03-結尾.mp4', 'camera', 12, 18]]);
  fs.copyFileSync(main, path.join(proj, 'work', 'rough.mp4'));
  // --order：只接指定的檔
  const o = node(MEDIA, ['main', '--order', '03-結尾.mp4,02-旁白.m4a']);
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stdout, /沒寫在 --order，不接進主軌：01-開場\.mp4/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(proj, 'work', 'main.json'), 'utf8')).clips[0].file, '素材/真人錄影/03-結尾.mp4');
  const bad = node(MEDIA, ['main', '--order', '沒有這個.mp4']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--order 的「沒有這個\.mp4」找不到/);
});

test('media.mjs main：只有一支真人錄影時不用接，不寫檔', () => {
  const p2 = path.join(root, 'projects', 'p2', '素材', '真人錄影');
  fs.mkdirSync(p2, { recursive: true });
  fs.copyFileSync(path.join(proj, '素材', '真人錄影', '01-開場.mp4'), path.join(p2, 'a.mp4'));
  const r = node(MEDIA, ['main'], 'p2');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /只有一支真人錄影.*不用接/);
  assert.ok(!fs.existsSync(path.join(root, 'projects', 'p2', 'work', 'main.mp4')));
  fs.rmSync(path.join(root, 'projects', 'p2'), { recursive: true });
});

test('只有聲音的區間：blackdetect 抓到 8–12；沒被蓋住超過 1 秒 ✖，訊息叫 AI 跑 media.mjs scan', () => {
  writePlan([]);
  const r = build('--check');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✖ 只有聲音的區間 0:08\.00–0:12\.00 有 4s 沒有畫面（全黑，講者不在）→ 跑 node shared\/template\/tools\/media\.mjs scan --project projects\/p1/);
  assert.ok(fs.existsSync(path.join(out, '.cache', 'blackdetect.json')), '偵測結果要快取');
  assert.ok(!fs.existsSync(path.join(out, 'index.html')), '--check 不產生專案');
});

test('--check --json：stdout 只有一個 JSON；格式照契約 3.3，時間是 rough.mp4 秒數', () => {
  writePlan([{ id: 's01', scene: 'concept', from: '#1', to: '#2e', sfxVolume: -6, slots: { text: '一般字卡' } }], { edit: { cuts: [[1.5, 2.5]], joins: [{ at: 8.05, type: 'dip' }] } });
  const { r, j } = checkJson();
  assert.equal(r.status, 1);   // 只有聲音的區間沒蓋住
  for (const k of ['ok', 'errors', 'warnings', 'videoDur', 'outputDur', 'voiceOnly', 'cutpoints', 'items', 'edit', 'paths']) assert.ok(k in j, `少了 ${k}`);
  assert.equal(j.ok, false);
  assert.equal(j.videoDur, 18);
  assert.equal(j.outputDur, 17);
  assert.deepEqual(j.voiceOnly, [[8, 12]]);
  assert.deepEqual(j.cutpoints, [{ at: 8, kind: 'pause' }, { at: 12, kind: 'ng' }]);
  assert.deepEqual(j.edit.joins, [{ at: 8, type: 'dip', dur: 0.3 }], 'joins 吸附到 cutpoints');
  const s = j.items[0];
  assert.deepEqual([s.id, s.type, s.start, s.end], ['s01', 'scene', 1, 7.5]);   // rough 秒數（#2e＝7.5；成片是 6.5）
  assert.equal(s.sfx[0].name, 'pop');
  assert.ok(s.sfx[0].volume > 0 && s.sfx[0].db < 0);
  assert.equal(j.paths.project, 'projects/p1');
  assert.equal(j.paths.plan, 'projects/p1/work/hyperframes/plan.json');
  // plan.json 壞掉時也只印 JSON
  fs.writeFileSync(path.join(out, 'plan.json'), '{ 壞掉');
  const bad = build('--check', '--json');
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).ok, false);
  assert.match(JSON.parse(bad.stdout).errors[0], /不是合法的 JSON/);
});

test('media.mjs scan：contact sheet、index.md／index.json（含只有聲音的區間）', () => {
  const r = node(MEDIA, ['scan']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dir = path.join(proj, 'work', 'media');
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const rec = j.files.find((f) => f.src === REC);
  assert.deepEqual([rec.kind, rec.width, rec.height, rec.hasAudio, rec.duration], ['video', 640, 400, true, 10]);
  assert.ok(rec.sheets.length >= 1 && rec.sheets[0].cells[0].t === 0);
  const sheet = path.join(proj, ...rec.sheets[0].file.split('/'));
  assert.ok(fs.existsSync(sheet));
  assert.equal(probe(sheet, 'stream=width'), '1904');
  assert.deepEqual(j.files.find((f) => f.src === IMG).width, 800);
  assert.deepEqual(j.voiceOnly, [[8, 12]]);
  const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8');
  assert.match(md, /\| 素材\/螢幕錄影\/操作示範\.mp4 \| 0:10\.0（10s） \| 640×400 \|/);
  assert.match(md, /rough\.mp4 0:08\.0–0:12\.0/);
});

test('media.mjs frame --grid：原尺寸截圖＋座標格線', () => {
  const r = node(MEDIA, ['frame', '--src', REC, '--at', '2.5', '--grid']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const f = path.join(proj, 'work', 'media', 'frames', '操作示範-2.5s-grid.jpg');
  assert.ok(fs.existsSync(f));
  assert.equal(probe(f, 'stream=width,height'), '640,400');
  const bad = node(MEDIA, ['frame', '--src', REC, '--at', '30']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--at 30 超過素材長度 10s/);
});

test('media 段欄位檢查：src、in＋段長、座標範圍、紅框同時 ≤ 2、放大鏡長度、和其他段的層級', () => {
  const m = (o) => ({ id: 'm01', type: 'media', src: REC, from: 7, to: 13, ...o });
  writePlan([m({ src: 'raw/a.mp4' })]);
  assert.match(checkJson().j.errors.join('\n'), /\[m01 media\] src 要寫專案資料夾裡 素材\/螢幕錄影\/ 或 素材\/圖片\/ 底下的檔案/);
  writePlan([m({ src: '素材/螢幕錄影/沒有.mp4' })]);
  assert.match(checkJson().j.errors.join('\n'), /src：找不到 素材\/螢幕錄影\/沒有\.mp4 → .*現有：素材\/螢幕錄影\/操作示範\.mp4/);
  writePlan([m({ in: 6 })]);
  assert.match(checkJson().j.errors.join('\n'), /素材 素材\/螢幕錄影\/操作示範\.mp4 長 10s；從第 6s 起播 6s 要用到第 12s → to 提早、in 改小，或 speed 改小/);
  writePlan([m({ marks: [{ at: '+0.5', box: [0, 0, 100, 100] }, { at: '+0.5', box: [200, 0, 100, 100] }, { at: '+1', box: [400, 0, 100, 100] }], lens: [{ at: '+2', until: '+2.5', box: [0, 0, 100, 50] }], moves: [{ at: '+1', to: [0, 0, 9999, 10] }], bogus: 1 })]);
  const e = checkJson().j.errors.join('\n');
  assert.match(e, /同時有 3 個紅框（最多 2 個）/);
  assert.match(e, /lens\[0\] 只有 0\.5s，放大鏡至少要 1\.2s/);
  assert.match(e, /moves\[0\]\.to \[0, 0, 9999, 10\] 超出素材範圍 640×400/);
  assert.match(e, /沒有「bogus」這個欄位（type=media 可用：/);
  // 透明的下方字卡在素材播放期間出現 → 會被蓋住 ✖；兩張不透明幕重疊 ✖
  writePlan([m({}), { id: 's01', scene: 'concept', from: '#3', to: '#3e', slots: { text: '被蓋住' } }, { id: 's02', scene: 'fs-list', from: 10, to: 16, slots: { title: '清單', items: ['一', '二', '三'] } }]);
  const e2 = checkJson().j.errors.join('\n');
  assert.match(e2, /\[s01 concept\] 在插入素材 m01（0:07\.00–0:13\.00）播放期間出現，會被素材蓋住看不到/);
  assert.match(e2, /\[s02 fs-list\] 和 m01 時間重疊 3s：整張幕/);
});

test('build：media 段蓋住只有聲音的區間；錄影轉 30fps＋每秒關鍵幀、放在主合成；子母畫面避開只有聲音的區間；紅框、運鏡、放大鏡', () => {
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 13, in: 1, volume: -6, sfx: 'whoosh',
    moves: [{ at: '+0.5', to: [0, 0, 320, 200], dur: 0.6 }, { at: '+3', to: 'full', dur: 0.6 }],
    marks: [{ at: '+1', until: '+2.5', box: [40, 40, 200, 100] }],
    lens: [{ at: '+4', until: '+5.5', box: [300, 150, 200, 100] }] }]);
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /m01｜media 操作示範\.mp4｜0:07\.00–0:13\.00｜6s｜whoosh/);
  assert.match(r.stdout, /只有聲音（rough\.mp4 0:08\.00–0:12\.00，4s）：已被 media 段或全畫面蓋住/);
  const html = read('index.html');
  const v = html.match(/<video id="mv-m01" src="(assets\/media\/[\w-]+\.mp4)" data-start="7" data-duration="6" data-media-start="1"\s+data-track-index="\d+" data-has-audio="true" data-volume="0\.501"/);
  assert.ok(v, '錄影 <video> 要在主合成、data-media-start＝in、原聲 −6dB');
  const asset = path.join(out, v[1]);
  assert.equal(probe(asset, 'stream=r_frame_rate').split('\n')[0], '30/1');
  const keys = spawnSync('ffprobe', ['-v', 'error', '-skip_frame', 'nokey', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', asset], { encoding: 'utf8' }).stdout.trim().split('\n');
  assert.ok(keys.length >= 9, `關鍵幀太少：${keys.length}`);
  // 子母畫面：7–8、12–13 兩支（8–12 只有聲音，不放）
  assert.match(html, /<video id="pipv-m01" src="assets\/rough\.mp4" data-start="7" data-duration="1" data-media-start="7"/);
  assert.match(html, /<video id="pipv-m01-2" src="assets\/rough\.mp4" data-start="12" data-duration="1" data-media-start="12"/);
  assert.match(html, /<rect id="mmk-m01-1" class="mmark"/);
  assert.match(html, /tl\.fromTo\('#mmk-m01-1', \{ strokeDashoffset: 1 \}, \{ strokeDashoffset: 0, autoRound: false, duration: 0\.4/);
  assert.match(html, /tl\.set\('#mmk-m01-1', \{ strokeDasharray: 'none' \}/);
  assert.match(html, /tl\.fromTo\('#mst-m01', \{ x: 0, y: 0, scale: 1 \}, \{ x: -?[\d.]+, y: -?[\d.]+, scale: [\d.]+, duration: 0\.6, ease: 'power2\.inOut', force3D: false \}, 7\.5\);/);
  assert.match(html, /MediaKit\.lens\(tl, '#mlc-m01-l1', '#mlsrc-m01-l1 img', \[[\d,]+\], 11, 1\.5\);/);
  assert.match(html, /<script src="kit\/media\.js"><\/script>/);
  const lensDir = path.join(out, 'assets', 'media', 'm01-l1');
  assert.ok(fs.readdirSync(lensDir).filter((f) => f.endsWith('.jpg')).length >= 1);
  assert.match(html, /<audio id="sfx-m01" src="assets\/sfx\/whoosh\.wav"/);
  // 再 build 一次：素材沒變就不重新轉檔
  const again = build();
  assert.doesNotMatch(again.stdout, /轉檔 素材/);
});

test('cut 穿過 media 段：錄影也跳過同一段（data-media-start 跳），圖片預設慢推；換掉素材後舊檔清掉', () => {
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 13, in: 1 }], { edit: { cuts: [[9, 10]] } });
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = read('index.html');
  assert.match(html, /<video id="mv-m01" src="assets\/media\/[\w-]+\.mp4" data-start="7" data-duration="2" data-media-start="1"/);
  assert.match(html, /<video id="mv-m01-2" src="assets\/media\/[\w-]+\.mp4" data-start="9" data-duration="3" data-media-start="4"/);   // rough 10 秒（cut 後）＝素材 1＋(10−7)＝4
  assert.match(html, /\s+data-track-index="\d+" muted playsinline/, 'volume 沒寫＝靜音');
  writePlan([{ id: 'm02', type: 'media', src: IMG, from: 7, to: 13, enter: 'slide' }]);
  const r2 = build();
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  const h2 = read('index.html');
  assert.match(h2, /<img id="mi-m02" class="clip mimg" src="assets\/media\/[\w-]+\.png"/);
  assert.match(h2, /tl\.fromTo\('#mst-m02', \{ x: 0, y: 0, scale: 1 \}, \{ x: -?[\d.]+, y: -?[\d.]+, scale: 1\.05, duration: 6, ease: 'none'/);
  assert.match(h2, /tl\.fromTo\('#el-m02', \{ x: 1920 \}, \{ x: 0, duration: 0\.6, ease \}, 7\);/);
  const left = fs.readdirSync(path.join(out, 'assets', 'media'));
  assert.ok(!left.some((f) => f.endsWith('.mp4') || f === 'm01-l1'), `沒用到的錄影與放大鏡逐幀要清掉：${left.join(', ')}`);
});

test('剪輯台的呼叫方式（--project 絕對路徑、cwd＝工作區根目錄）與只給路徑旗標：media 段都找得到專案資料夾', () => {
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 13 }]);
  const r = spawnSync(process.execPath, [BUILD, '--project', proj, '--template', tpl, '--check', '--json'], { encoding: 'utf8', cwd: root });
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true, j.errors.join('\n'));
  assert.doesNotMatch(j.errors.join('\n'), /要知道專案資料夾/);
  assert.equal(j.paths.project, 'projects/p1');
  // 沒有 --project、四個路徑旗標都給：從 --out 往上找到有 素材/ 的專案資料夾
  const w = path.join(proj, 'work');
  const r2 = spawnSync(process.execPath, [BUILD, '--template', tpl, '--plan', path.join(out, 'plan.json'), '--srt', path.join(w, 'rough.srt'), '--video', path.join(w, 'rough.mp4'), '--out', out, '--check', '--json'], { encoding: 'utf8', cwd: os.tmpdir() });
  const j2 = JSON.parse(r2.stdout);
  assert.equal(j2.ok, true, j2.errors.join('\n'));
});

test('剪輯台改過的 media 段：from／to 是秒數、沒有 anchor 照樣過；anchor 對不上照常提醒', () => {
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7.25, to: 12.9, in: 0.4 }]);
  const a = checkJson().j;
  assert.equal(a.ok, true, a.errors.join('\n'));
  assert.deepEqual([a.items[0].start, a.items[0].end], [7.25, 12.9]);
  assert.ok(!a.warnings.some((x) => /anchor/.test(x)));
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7.25, to: 12.9, anchor: '第 3 句' }]);   // 7.25 落在 #3（8–11）前面一點 → 對到 #3
  assert.ok(!checkJson().j.warnings.some((x) => /anchor/.test(x)));
  writePlan([{ id: 'm01', type: 'media', src: REC, from: '#3', to: 13, anchor: '沒有這句話' }]);
  assert.ok(checkJson().j.warnings.some((x) => /\[m01 media\] anchor「沒有這句話」不在 #3「第 3 句字幕內容」裡/.test(x)));
});

test('work/cutpoints.json 讀進 --check 與 build：joins 對在剪接點或 cut 邊界上不提醒，離太遠才 ⚠', () => {
  const m = { id: 'm01', type: 'media', src: REC, from: 7, to: 13 };
  writePlan([m], { edit: { cuts: [[2, 2.5]], joins: [{ at: 12, type: 'punch' }, { at: 2, type: 'dip' }, { at: 2.5, type: 'none' }] } });
  const { j } = checkJson();
  assert.equal(j.ok, true, j.errors.join('\n'));
  assert.ok(!j.warnings.some((x) => /不在剪接點上/.test(x)), j.warnings.join('\n'));
  assert.deepEqual(j.edit.joins, [{ at: 2, type: 'dip', dur: 0.3 }, { at: 2.5, type: 'none' }, { at: 12, type: 'punch' }]);
  writePlan([m], { edit: { joins: [{ at: 5, type: 'dip' }] } });
  assert.ok(checkJson().j.warnings.some((x) => /edit\.joins\[0\]：at 5s 不在剪接點上（最近的是 8s）/.test(x)));
  // build：punch 從 12（成片 11.5）放大到片尾，dip 在 cut 收起來的 2 秒
  writePlan([m], { edit: { cuts: [[2, 2.5]], joins: [{ at: 12, type: 'punch' }, { at: 2, type: 'dip' }] } });
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = read('index.html');
  assert.match(html, /tl\.set\('#footage', \{ scale: 1\.08 \}, 11\.5\);/);
  assert.match(html, /tl\.fromTo\('#edit-dip', \{ opacity: 0 \}, \{ opacity: 1, duration: 0\.15, ease: 'sine\.in', immediateRender: false \}, 1\.85\);/);
  assert.match(html, /data-composition-id="main" data-start="0" data-duration="17\.5"/, '成片長度＝rough 18 − cuts 0.5');
  // cutpoints.json 壞掉：⚠ 但照樣能檢查
  fs.writeFileSync(path.join(proj, 'work', 'cutpoints.json'), '{ 壞');
  assert.ok(checkJson().j.warnings.some((x) => /work\/cutpoints\.json 不是合法的 JSON/.test(x)));
  fs.writeFileSync(path.join(proj, 'work', 'cutpoints.json'), JSON.stringify({ cuts: [{ at: 8, kind: 'pause' }, { at: 12, kind: 'ng' }] }));
});

test('--check --json 的 items：end＝plan.json 寫的迄點，畫面上自動延長時另給 shownEnd；sfx 每顆帶 volume 與 db', () => {
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 12, sfx: 'whoosh', sfxVolume: -6 }, { id: 'm02', type: 'media', src: IMG, from: 12, to: 14, enter: 'slide' }]);
  const { j } = checkJson();
  assert.equal(j.ok, true, j.errors.join('\n'));
  const m1 = j.items.find((x) => x.id === 'm01');
  assert.equal(m1.end, 12);
  assert.equal(m1.shownEnd, 12.6, 'm02 用 slide 進場，m01 墊在底下 0.6 秒');
  assert.ok(!('shownEnd' in j.items.find((x) => x.id === 'm02')));
  const w = m1.sfx[0];
  assert.equal(w.name, 'whoosh');
  assert.equal(w.db, +(20 * Math.log10(w.volume)).toFixed(1));
  assert.ok(Math.abs(w.volume - 0.5 * Math.pow(10, -6 / 20)) < 0.002);
});

test('字卡動態：fx-kit.js 放在 compositions/ 與專案根目錄（render 以子合成位置解析、播放器以專案根解析）', () => {
  writePlan([{ id: 'x01', type: 'fx', fx: 1, from: '#1', to: '#1e', vars: { text: '測試' } }, { id: 'm01', type: 'media', src: REC, from: 7, to: 13 }]);
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const kit = fs.readFileSync(path.join(TEMPLATE, 'fx', 'effects', 'fx-kit.js'), 'utf8');
  assert.equal(read('fx-kit.js'), kit);
  assert.equal(read('compositions/fx-kit.js'), kit);
  assert.match(read('compositions/fx-01-word-burst.html'), /<script src="fx-kit\.js"><\/script>/);
  // 拿掉字卡動態：兩份都清掉
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 13 }]);
  assert.equal(build().status, 0);
  assert.ok(!fs.existsSync(path.join(out, 'fx-kit.js')) && !fs.existsSync(path.join(out, 'compositions', 'fx-kit.js')));
});

test('--list 提到 media 段的欄位；--list --json 有 media.fields', () => {
  const r = spawnSync(process.execPath, [BUILD, '--template', tpl, '--list'], { encoding: 'utf8', cwd: root });
  assert.match(r.stdout, /# 插入素材（"type": "media"/);
  assert.match(r.stdout, /\| marks \|/);
  const j = JSON.parse(spawnSync(process.execPath, [BUILD, '--template', tpl, '--list', '--json'], { encoding: 'utf8', cwd: root }).stdout);
  assert.ok(j.media.keys.includes('lens'));
  assert.ok(j.media.fields.some((f) => f.field === 'enter／exit'));
});

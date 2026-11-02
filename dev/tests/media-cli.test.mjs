// media.mjs 的指令（main／scan／frame、ng-snap／cutpoints／srt-split）與 build --check --json（002 擁有；從 media.test.mjs 搬來的部分照原樣）
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
const REC = 'assets/screen/操作示範.mp4';
const IMG = 'assets/images/架構圖.png';

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-media-'));
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  tpl = path.join(root, 'shared', 'template');
  fs.symlinkSync(TEMPLATE, tpl, 'dir');
  for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'ding.wav'), path.join(root, 'shared', 'sfx', `${n}.wav`));
  proj = path.join(root, 'projects', 'p1');
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(proj, 'assets', d), { recursive: true });
  out = path.join(proj, 'work', 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  const cam = (name, sec, src) => ff(['-f', 'lavfi', '-i', `${src}=size=320x180:rate=30`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', String(sec), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(proj, 'assets', 'camera', name)]);
  cam('01-開場.mp4', 8, 'testsrc');
  cam('03-結尾.mp4', 6, 'smptebars');
  ff(['-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=44100', '-t', '4', '-c:a', 'aac', path.join(proj, 'assets', 'voice', '02-旁白.m4a')]);
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
  assert.deepEqual(j.clips.map((c) => [c.file, c.kind, c.start, c.end]), [['assets/camera/01-開場.mp4', 'camera', 0, 8], ['assets/voice/02-旁白.m4a', 'voice', 8, 12], ['assets/camera/03-結尾.mp4', 'camera', 12, 18]]);
  fs.copyFileSync(main, path.join(proj, 'work', 'rough.mp4'));
  // --order：只接指定的檔
  const o = node(MEDIA, ['main', '--order', '03-結尾.mp4,02-旁白.m4a']);
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stdout, /沒寫在 --order，不接進主軌：01-開場\.mp4/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(proj, 'work', 'main.json'), 'utf8')).clips[0].file, 'assets/camera/03-結尾.mp4');
  const bad = node(MEDIA, ['main', '--order', '沒有這個.mp4']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--order 的「沒有這個\.mp4」找不到/);
});

test('media.mjs main：只有一支真人錄影也轉成固定 fps 的 work/main.mp4（auto-editor 剪手機原檔會黑畫面，F2）', () => {
  const p2 = path.join(root, 'projects', 'p2', 'assets', 'camera');
  fs.mkdirSync(p2, { recursive: true });
  // 29.92 fps 的手機檔 → 30 fps
  ff(['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=359/12', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuvj420p', '-c:a', 'aac', '-shortest', path.join(p2, 'a.mp4')]);
  const r = node(MEDIA, ['main'], 'p2');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /只有一支真人錄影（assets\/camera\/a\.mp4）：轉成固定 fps 的 work\/main\.mp4/);
  const main = path.join(root, 'projects', 'p2', 'work', 'main.mp4');
  assert.equal(probe(main, 'stream=r_frame_rate').split('\n')[0], '30/1');
  assert.equal(probe(main, 'stream=pix_fmt').split('\n')[0], 'yuv420p');
  const j = JSON.parse(fs.readFileSync(path.join(root, 'projects', 'p2', 'work', 'main.json'), 'utf8'));
  assert.deepEqual(j.clips.map((c) => [c.file, c.kind, c.start]), [['assets/camera/a.mp4', 'camera', 0]]);
  fs.rmSync(path.join(root, 'projects', 'p2'), { recursive: true });
});

test('--check --json：stdout 只有一個 JSON；格式照契約 3.3，時間是 rough.mp4 秒數', () => {
  writePlan([{ id: 's01', scene: 'concept', from: '#1', to: '#2e', sfx: 'ding', sfxVolume: -6, slots: { text: '一般字卡' } }], { edit: { cuts: [[1.5, 2.5]], joins: [{ at: 8.05, type: 'dip' }] } });
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
  assert.equal(s.sfx[0].name, 'ding');
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
  assert.match(md, /\| assets\/screen\/操作示範\.mp4 \| 0:10\.0（10s） \| 640×400 \|/);
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


// ---------- 剪乾淨的工具：cuts.md、ng-snap、cutpoints、srt-split（specs/contracts/cli-002.md §2–§4）----------
const mkProj = (name) => {
  const p = path.join(root, 'projects', name);
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  fs.mkdirSync(path.join(p, 'work'), { recursive: true });
  return p;
};
const clip = (file, sec) => ff(['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', String(sec), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
const listAll = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).sort();

test('cuts.md：兩張表用表頭辨認、四種時間寫法、待確認的列略過、程式碼區塊裡的表不算', async () => {
  const { parseCutsMd, parseRange } = await import(MEDIA);
  assert.deepEqual(parseRange('0:12.40–0:15.10'), [12.4, 15.1]);
  assert.deepEqual(parseRange('00:01:02,500 --> 00:01:03,000'), [62.5, 63]);
  assert.deepEqual(parseRange('1:00:00.5~1:00:01'), [3600.5, 3601]);
  assert.deepEqual(parseRange('12.5-13'), [12.5, 13]);
  const md = [
    '# 剪輯清單', '', '## NG', '', '| 時間碼 | 內容 | 原因 | 待確認 |', '|---|---|---|---|',
    '| 0:10.20–0:20.30 | 我們先來看 | 講錯重來 | |', '| 0:30.00–0:31.00 | 這個 | 卡住 | — |', '| 0:50.00–0:51.00 | 重複？ | 不確定 | 重複？ |', '',
    '```', '| 時間碼 | 內容 | 原因 |', '|---|---|---|', '| 9:00–9:01 | 範例 | 不算 |', '```', '',
    '## 章節空檔', '', '| 章節 | 第一句 | 時間碼 |', '|---|---|---|', '| 1 痛點 | 為什麼剪片這麼久 | 0:41.10 |', '| 2 解法 | 我的做法 | 1:00.00 |',
  ].join('\n');
  const j = parseCutsMd(md);
  assert.deepEqual(j.errors, []);
  assert.deepEqual(j.ng.map((r) => [r.row, r.start, r.end, r.pending]), [[1, 10.2, 20.3, false], [2, 30, 31, false], [3, 50, 51, true]]);
  assert.deepEqual(j.chapters.map((c) => [c.row, c.title, c.t]), [[1, '痛點', 41.1], [2, '解法', 60]]);
  assert.match(parseCutsMd('| 時間碼 | 內容 | 原因 |\n|---|---|---|\n| 1:03– | x | y |').errors[0], /NG 第 1 列的時間碼「1:03–」看不懂 → 寫成 1:03\.00–1:05\.80/);
});

// v1：30fps；停頓 10.0–12.667、20–23、37.3–41.0（章節 1 前）、59–59.9（章節 2 前，太短）
const V1 = { version: '1', source: 'a.mp4', chunks: [[0, 300, 1], [300, 380, 99999], [380, 600, 1], [600, 690, 99999], [690, 1119, 1], [1119, 1230, 99999], [1230, 1770, 1], [1770, 1797, 99999], [1797, 2000, 1]] };
const CUTS_MD = ['| 時間碼 | 內容 | 原因 | 待確認 |', '|---|---|---|---|', '| 0:10.20–0:20.30 | 我們先來看 | 講錯重來 | |', '| 0:30.00–0:31.00 | 這個 | 卡住 | |', '| 0:50.00–0:51.00 | 重複？ | 不確定 | 重複？ |', '',
  '| 章節 | 第一句 | 時間碼 |', '|---|---|---|', '| 1 痛點 | 為什麼 | 0:41.10 |', '| 2 解法 | 我的做法 | 1:00.00 |'].join('\n');

test('ng-snap：NG 吸附停頓、找不到停頓用原值 ⚠、章節保留 3 秒、停頓不足 ⚠、待確認不剪、三行指令一致、不寫 work/.cache 以外的檔', () => {
  const p = mkProj('pn');
  clip(path.join(p, 'assets', 'camera', 'a.mp4'), 1);
  fs.writeFileSync(path.join(p, 'work', 'cuts.md'), CUTS_MD);
  const v1 = path.join(root, 'pn.v1.json');
  fs.writeFileSync(v1, JSON.stringify(V1));
  const before = listAll(p);
  const r = node(MEDIA, ['ng-snap', '--v1', v1], 'pn');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // 只有一支真人錄影、還沒有 work/main.mp4 → 先自動轉成固定 fps 的 work/main.mp4（F2），其他不寫
  assert.deepEqual(listAll(p), [...before, path.join('work', 'main.json'), path.join('work', 'main.mp4')].sort(), '--v1 時只多 work/main.mp4、main.json');
  assert.match(r.stdout, /還沒有 work\/main\.mp4：先把原片轉成固定 fps/);
  const cmds = r.stdout.split('\n').filter((l) => l.startsWith('auto-editor '));
  assert.equal(cmds.length, 3);
  const args = '--edit "audio:-20dB" --margin 0.15sec --cut-out "10sec,23sec" --cut-out "30sec,31sec" --add-in "38.3sec,41sec" --add-in "59sec,59.9sec"';
  assert.equal(cmds[0], `auto-editor "projects/pn/work/main.mp4" ${args} --preview`);
  assert.equal(cmds[1], `auto-editor "projects/pn/work/main.mp4" ${args} -o "projects/pn/work/rough.mp4" --no-open`);
  assert.equal(cmds[2], `auto-editor "projects/pn/work/main.mp4" ${args} --export v1 -o "projects/pn/work/cuts.v1.json"`);
  assert.match(r.stdout, /→ 然後跑 node shared\/template\/tools\/media\.mjs verify-rough --project projects\/pn（檢查初剪有沒有黑畫面），再跑 node shared\/template\/tools\/media\.mjs cutpoints --project projects\/pn/);
  // 終點往後延到停頓末端（20.30 → 23.00）：說清楚後一次從 23.00 才開口、完整保留（弱模型才不會誤標待確認）
  assert.match(r.stdout, /1 {3}0:10\.20–0:20\.30\s+0:10\.00–0:23\.00\s+我們先來看；終點落在後一次開口（0:23\.00）之前的停頓末端，後一次完整保留\n/);
  assert.match(r.stdout, /⚠ NG 第 2 列（0:30\.00–0:31\.00）前後 1\.0s 內沒有停頓，用原值/);
  assert.match(r.stdout, /⚠ cuts\.md NG 第 3 列標了待確認（「重複？」），不放進指令/);
  assert.match(r.stdout, /⚠ 章節 2「解法」原始停頓只有 1\.20s（< 3\.0s）/);
  assert.match(r.stdout, /1 {3}0:41\.10 → 0:41\.15\s+4\.00s\s+0:38\.30–0:41\.00\s+3\.00s/);
  // margin 寫成純數字 ✖；沒有 cuts.md ✖
  const bad = node(MEDIA, ['ng-snap', '--v1', v1, '--margin', '4'], 'pn');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--margin 要寫成秒數加 sec，例如 0\.15sec/);
  fs.rmSync(path.join(p, 'work', 'cuts.md'));
  assert.match(node(MEDIA, ['ng-snap', '--v1', v1], 'pn').stderr, /找不到 projects\/pn\/work\/cuts\.md → 先照「剪乾淨」第 4 步/);
});

test('ng-snap：NG 連下一句開頭一起剪、吃掉章節的停頓 → 這章不保留並 ⚠；終點落在章節停頓裡 → 吸到停頓起點；多支主軌沒接 → ✖', async () => {
  const { snapNg, chapterKeep, silencesOf } = await import(MEDIA);
  const sil = silencesOf(V1, 30);
  assert.deepEqual(sil[2], [37.3, 41]);
  const [ng] = snapNg([{ row: 1, start: 37, end: 39 }], sil);
  assert.deepEqual([ng.a, ng.b], [37.3, 41]);
  const [ch] = chapterKeep([{ row: 1, title: 'x', t: 41.1 }], sil, 0.15);
  assert.deepEqual(ch.keep, [38.3, 41]);
  // A-05：終點落在章節停頓裡 → 吸到停頓起點，起點找不到停頓 → 只有起點用原值
  const [ng2] = snapNg([{ row: 1, start: 37, end: 39 }], sil, 1, [ch.sil]);
  assert.deepEqual([ng2.a, ng2.b, ng2.missStart, ng2.missEnd, ng2.toChapter], [37, 37.3, true, false, true]);
  const p = mkProj('pm');
  clip(path.join(p, 'assets', 'camera', 'a.mp4'), 1);
  clip(path.join(p, 'assets', 'camera', 'b.mp4'), 1);
  fs.writeFileSync(path.join(p, 'work', 'cuts.md'), '| 時間碼 | 內容 | 原因 |\n|---|---|---|\n| 0:37.00–0:41.90 | x | y |\n\n| 章節 | 第一句 | 時間碼 |\n|---|---|---|\n| 1 痛點 | z | 0:41.10 |\n');
  const v1 = path.join(root, 'pm.v1.json');
  fs.writeFileSync(v1, JSON.stringify(V1));
  assert.match(node(MEDIA, ['ng-snap', '--v1', v1], 'pm').stderr, /assets\/camera\/ 有 2 支、又沒有 work\/main\.mp4 → 先跑 node shared\/template\/tools\/media\.mjs main --project projects\/pm/);
  const r = node(MEDIA, ['ng-snap', '--v1', v1, '--src', 'projects/pm/assets/camera/a.mp4'], 'pm');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /⚠ NG 第 1 列吃掉章節 1 的停頓，這章不保留/);
  assert.ok(!/--add-in/.test(r.stdout));
});

test('cutpoints：保留段累加成 rough.mp4 秒數、和 NG 重疊的標 ng、片頭片尾不算、--dry-run 不寫、舊檔不同先備份、變速 ✖', () => {
  const p = mkProj('pc');
  clip(path.join(p, 'work', 'rough.mp4'), 143 / 30);
  fs.writeFileSync(path.join(p, 'work', 'cuts.md'), '| 時間碼 | 內容 | 原因 | 待確認 |\n|---|---|---|---|\n| 0:03.00–0:03.90 | 講錯 | 重來 | |\n');
  fs.writeFileSync(path.join(p, 'work', 'cuts.v1.json'), JSON.stringify({ version: '1', source: 't.mp4', chunks: [[0, 10, 99999], [10, 64, 1], [64, 75, 99999], [75, 90, 1], [90, 116, 99999], [116, 205, 1], [205, 230, 99999]] }));
  // 片頭 10 格、片尾 25 格剪掉：不算剪接點；保留 54+15+89＝158 格 ≠ rough 的 143 格 → ⚠
  let r = node(MEDIA, ['cutpoints', '--dry-run'], 'pc');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /⚠ cuts\.v1\.json 保留的長度 5\.27s 和 rough\.mp4 的 4\.77s 差 15 格/);
  assert.match(r.stdout, /--dry-run：只印不寫/);
  assert.ok(!fs.existsSync(path.join(p, 'work', 'cutpoints.json')));
  fs.writeFileSync(path.join(p, 'work', 'cuts.v1.json'), JSON.stringify({ version: '1', source: 't.mp4', chunks: [[0, 64, 1], [64, 75, 99999], [75, 90, 1], [90, 116, 99999], [116, 180, 1]] }));
  fs.writeFileSync(path.join(p, 'work', 'cutpoints.json'), '{ "cuts": [] }\n');
  r = node(MEDIA, ['cutpoints'], 'pc');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p, 'work', 'cutpoints.json'), 'utf8')), { cuts: [{ at: 2.133, kind: 'pause' }, { at: 2.633, kind: 'ng' }] });
  assert.match(r.stdout, /共 2 個剪接點：NG 1、停頓 1；保留 4\.77s（143 格），rough\.mp4 4\.77s（差 0 格）/);
  assert.equal(fs.readdirSync(path.join(p, 'work')).filter((f) => f.startsWith('cutpoints.json.bak-')).length, 1);
  assert.match(node(MEDIA, ['cutpoints'], 'pc').stdout, /內容相同，沒有寫/);
  fs.writeFileSync(path.join(p, 'work', 'cuts.v1.json'), JSON.stringify({ version: '1', chunks: [[0, 64, 1], [64, 75, 1.5]] }));
  const bad = node(MEDIA, ['cutpoints'], 'pc');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /cuts\.v1\.json 第 2 段速度是 1\.5（只能是 1 或 99999）/);
  fs.rmSync(path.join(p, 'work', 'cuts.v1.json'));
  assert.match(node(MEDIA, ['cutpoints'], 'pc').stderr, /找不到 work\/cuts\.v1\.json（也沒有 work\/cuts\.v1）/);
});

test('srt-split：標點優先、沒有標點斷在中間 ⚠、時間依字數比例首尾相接、句號連號、CRLF 原樣、備份；plan.json 用到句號 ✖', async () => {
  const { splitText } = await import(MEDIA);
  assert.deepEqual(splitText('接著我們把逐字稿丟進去，讓它幫我們找出 NG').parts, ['接著我們把逐字稿丟進去，', '讓它幫我們找出 NG']);
  assert.deepEqual(splitText('短句').parts, ['短句']);
  const long = splitText('一二三四五六七八九十，一二三四五六七八九十，一二三四五六七八九十');
  assert.ok(long.parts.length === 3 && !long.forced, JSON.stringify(long));
  const p = mkProj('ps');
  const srt = ['1', '00:00:01,000 --> 00:00:06,000', '接著我們把逐字稿丟進去，讓它幫我們找出 NG', '', '2', '00:00:06,500 --> 00:00:07,500', '短句', '', '3', '00:00:08,000 --> 00:00:12,200', '這一段沒有標點所以斷在中間的地方給大家看看', ''].join('\r\n');
  const file = path.join(p, 'work', 'rough.srt');
  fs.writeFileSync(file, srt);
  let r = node(MEDIA, ['srt-split', '--dry-run'], 'ps');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /共 3 則，超過 18 字 2 則/);
  assert.match(r.stdout, /⚠ 沒有標點，斷在第 10 字/);
  assert.equal(fs.readFileSync(file, 'utf8'), srt, '--dry-run 不寫');
  r = node(MEDIA, ['srt-split'], 'ps');
  assert.equal(r.status, 0, r.stderr);
  const out2 = fs.readFileSync(file, 'utf8');
  assert.ok(out2.includes('\r\n') && !/[^\r]\n/.test(out2), 'CRLF 原樣');
  const { parseSrt } = await import(path.join(TOOLS, 'lib', 'srt.mjs'));
  const cues = parseSrt(out2);
  assert.deepEqual(cues.map((c) => c.n), [1, 2, 3, 4, 5]);
  assert.deepEqual(cues.map((c) => c.text), ['接著我們把逐字稿丟進去，', '讓它幫我們找出 NG', '短句', '這一段沒有標點所以斷', '在中間的地方給大家看看']);
  assert.equal(cues[0].start, 1); assert.equal(cues[1].end, 6); assert.equal(cues[0].end, cues[1].start);
  assert.ok(Math.abs(cues[0].end - (1 + 5 * 12 / 20.5)) < 0.002, `比例分配：${cues[0].end}`);
  // 備份叫 rough.srt.split-<時間戳>：.bak-<時間戳> 留給 snap-srt（status 的 S6 靠它判斷，A-02）
  assert.equal(fs.readdirSync(path.join(p, 'work')).filter((f) => f.startsWith('rough.srt.bak-')).length, 0);
  const baks = fs.readdirSync(path.join(p, 'work')).filter((f) => f.startsWith('rough.srt.split-'));
  assert.equal(baks.length, 1);
  assert.equal(fs.readFileSync(path.join(p, 'work', baks[0]), 'utf8'), srt, '備份一字不差');
  assert.match(node(MEDIA, ['srt-split'], 'ps').stdout, /沒有超過 18 字的字幕，沒有寫任何檔/);
  fs.mkdirSync(path.join(p, 'work', 'hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(p, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, scenes: [{ id: 's01', scene: 'concept', from: '#3' }] }));
  fs.writeFileSync(file, srt);
  const bad = node(MEDIA, ['srt-split'], 'ps');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /plan\.json 已經用到句號（#N），拆句會讓後面的句號全部位移 → 改在剪輯台分割字幕/);
  assert.equal(fs.readFileSync(file, 'utf8'), srt);
});

// ---------- round 2：A-01 章節開口、A-07 --k=v、F2 verify-rough 與 build --check 的全黑 ✖ ----------
test('chapterKeep（A-01）：表上時間落在停頓中間 → 用這個停頓的終點當開口並說明；不在停頓裡就往後 6 秒內找', async () => {
  const { chapterKeep, CUT } = await import(MEDIA);
  const [c] = chapterKeep([{ row: 2, title: 'x', t: 5.3 }], [[5.167, 8.867]], 0.15);
  assert.ok(!c.none);
  assert.deepEqual([c.onset, c.early, c.keep], [9.017, 3.717, [6.167, 8.867]]);
  const [d] = chapterKeep([{ row: 2, title: 'x', t: 3 }], [[5.167, 8.867]], 0.15);
  assert.equal(d.onset, 9.017);
  const [e] = chapterKeep([{ row: 2, title: 'x', t: 1 }], [[5.167, 8.867]], 0.15);
  assert.ok(e.none, `超過 +${CUT.ahead}s 找不到`);
  const p = mkProj('pk');
  clip(path.join(p, 'assets', 'camera', 'a.mp4'), 1);
  fs.writeFileSync(path.join(p, 'work', 'cuts.md'), '| 章節 | 第一句 | 時間碼 |\n|---|---|---|\n| 1 痛點 | z | 0:38.00 |\n');
  const v1 = path.join(root, 'pk.v1.json');
  fs.writeFileSync(v1, JSON.stringify(V1));
  const r = node(MEDIA, ['ng-snap', '--v1', v1], 'pk');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /章節 1 時間碼比開口早 3\.15s，已改用開口 0:41\.15/);
  assert.match(r.stdout, /--add-in "38\.3sec,41sec"/);
});

test('parseArgs（A-07）：--key=value 只在第一個 = 切', async () => {
  const { parseArgs } = await import(MEDIA);
  assert.equal(parseArgs(['ng-snap', '--edit=audio:threshold=0.1']).edit, 'audio:threshold=0.1');
  assert.equal(parseArgs(['ng-snap', '--margin', '0.2sec']).margin, '0.2sec');
});

// 原片 8 秒；rough 6 秒＝彩條 2 秒＋全黑 2 秒＋彩條 2 秒（模擬 auto-editor 剪壞）；cuts.v1.json：保留 0–2、3–5、6–8 秒
function brokenRough(name, { blackSource = false } = {}) {
  const p = mkProj(name);
  const src = path.join(p, 'assets', 'camera', 'a.mp4');
  ff(['-f', 'lavfi', '-i', `${blackSource ? 'color=c=black:size=160x90:rate=30' : 'testsrc=size=160x90:rate=30'}`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src]);
  ff(['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=30:d=2', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=30:d=2', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:d=6',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(p, 'work', 'rough.mp4')]);
  fs.writeFileSync(path.join(p, 'work', 'cuts.v1.json'), JSON.stringify({ version: '1', source: `projects/${name}/assets/camera/a.mp4`, chunks: [[0, 60, 1], [60, 90, 99999], [90, 150, 1], [150, 180, 99999], [180, 240, 1]] }));
  return p;
}

test('verify-rough（F2）：rough 黑、原片同一秒不黑 → ✖＋重做指令（結束碼 1）；原片也黑 → ✓；不寫檔', async () => {
  const { roughToSource } = await import(MEDIA);
  const v1 = { chunks: [[0, 60, 1], [60, 90, 99999], [90, 150, 1]] };
  assert.equal(roughToSource(v1, 30, 1), 1);
  assert.equal(roughToSource(v1, 30, 3), 4);
  const p = brokenRough('pv');
  const before = listAll(p);
  const r = node(MEDIA, ['verify-rough'], 'pv');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /0:02\.00–0:04\.00\s+2\.00s\s+0:04\.00\s+\d+\s+✖ 原片不黑/, '黑段換回原片 4 秒（保留 0–2 接 3–5）');
  assert.match(r.stdout, /✖ work\/rough\.mp4 有 1 段黑畫面（共 2\.0s）原片同位置不黑 → 初剪壞了/);
  assert.match(r.stdout, /1\. node shared\/template\/tools\/media\.mjs main --project projects\/pv/);
  assert.match(r.stdout, /2\. node shared\/template\/tools\/media\.mjs ng-snap --project projects\/pv/);
  assert.deepEqual(listAll(p), before, 'verify-rough 不寫檔');
  const q = brokenRough('pq', { blackSource: true });
  const ok = node(MEDIA, ['verify-rough'], 'pq');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /✓ 黑畫面 1 段，原片同位置也是黑的：0:02\.00–0:04\.00/);
  assert.ok(q);
});

test('build --check（F2）：素材沒有純聲音檔、rough.mp4 卻有全黑區間 → ✖ 指向 verify-rough，不當成只有聲音（小窗照放）', () => {
  const p = brokenRough('pb');
  const hf = path.join(p, 'work', 'hyperframes');
  fs.mkdirSync(hf, { recursive: true });
  fs.writeFileSync(path.join(p, 'work', 'rough.srt'), makeSrt({ n: 2 }));
  fs.writeFileSync(path.join(hf, 'plan.json'), JSON.stringify({ version: 1, look: false, speakerBox: [40, 10, 120, 90], scenes: [{ id: 's01', scene: 'fs-list', from: 0.2, to: 5.8, slots: { title: '清單', items: ['甲', '乙', '丙'] } }] }));
  const r = node(BUILD, ['--check', '--json'], 'pb');
  const j = JSON.parse(r.stdout);
  assert.equal(r.status, 1);
  assert.deepEqual(j.errors, ['work/rough.mp4 在 0:02.00–0:04.00 是全黑，但素材沒有純聲音檔 → 初剪壞了：跑 node shared/template/tools/media.mjs verify-rough --project projects/pb']);
  assert.deepEqual(j.voiceOnly, []);
  assert.deepEqual(j.roughBlack, [[2, 4]]);
  assert.ok(j.items[0].out.pip.length > 0, '小窗照放');
});

// ---------- F8：srt-align（字幕＝講稿每一行，時間用 transcript.json 全域對齊）----------
// 把「實際講的話」切成兩字一詞、每字 0.2 秒；gap＝這一段前面停多久
const speak = (parts) => {
  const words = [];
  let t = 1;
  for (const [said, gap = 0] of parts) {
    t += gap;
    const cs = [...said.replace(/[\s，。！？、]/g, '')];
    for (let i = 0; i < cs.length; i += 2) { const w = cs.slice(i, i + 2).join(''); words.push({ text: w, start: +t.toFixed(3), end: +(t + 0.2 * [...w].length).toFixed(3) }); t += 0.2 * [...w].length; }
  }
  return words;
};
const SCRIPT_MD = ['# 示範稿', '這是 `assets/a.mp4` 的講稿（說明行，不唸）', '', '嗨！大家好，我是鼎淵', '歡迎來到工程師下班有約', '',
  '並且跟我一樣使用手機', '在固定的機位錄影', '', '### 第一段', '但用起來都不順手', '如果你打算拍 YouTube、Podcast、線上課程，或訪談節目', '這一行沒有講', '所以我乾脆'].join('\n');
// 錯字（鼎→頂、聲→身）、多講一個「那」、第 7 行沒講
const SAID = [['嗨大家好我是頂淵'], ['歡迎來到工程師下班有約', 0.3], ['那並且跟我一樣使用手機', 0.3], ['在固定的機位錄影'], ['但用起來都不順手', 0.3], ['如果你打算拍YouTubePodcast線上課程或訪談節目', 0.3], ['所以我乾脆', 0.6]];

test('F8 srt-align（純函式）：講稿行、顯示文字去「，。；：」、全域對齊扛錯字與多字、沒講的行內插 ⚠、長行在「、，」拆、同一口氣併、連接詞不併', async () => {
  const { scriptLines, displayText, alignCues, clausesFromSrt } = await import(MEDIA);
  const lines = scriptLines(SCRIPT_MD);
  assert.deepEqual(lines, ['嗨！大家好，我是鼎淵', '歡迎來到工程師下班有約', '並且跟我一樣使用手機', '在固定的機位錄影', '但用起來都不順手', '如果你打算拍 YouTube、Podcast、線上課程，或訪談節目', '這一行沒有講', '所以我乾脆']);
  assert.equal(displayText('嗨！大家好，我是鼎淵。'), '嗨！大家好我是鼎淵');
  assert.equal(displayText('用 Claude，Code 做：1,000 個、好嗎？'), '用 Claude Code 做 1,000 個、好嗎？');
  assert.equal(displayText('工具，AI 寫的'), '工具 AI 寫的');
  const { cues, info } = alignCues(lines.map((text, i) => ({ text, from: i + 1 })), speak(SAID));
  const texts = cues.map((c) => c.text);
  assert.equal(texts[0], '嗨！大家好我是鼎淵', '字是講稿的，不是逐字稿的錯字');
  assert.equal(cues[0].start, 1, '錯字也對得上：起點＝第一個詞');
  assert.ok(texts.includes('並且跟我一樣使用手機在固定的機位錄影'), '同一口氣、合併後 18 字 → 併');
  assert.ok(texts.includes('但用起來都不順手'), '「但」開頭是新的一句，不和上一行併');
  const split = info.filter((f) => f.split);
  assert.equal(split.length, 2, '24 字的行拆成兩則');
  for (const f of split) assert.ok(!f.forced);
  assert.ok(cues.every((c) => !/[，。；：]/.test(c.text) && c.text.length));
  const lost = info.find((f) => f.interp);
  assert.deepEqual(lost?.lines, [7], '沒講的那行標內插');
  assert.equal(texts.at(-1), '所以我乾脆');
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= cues[i - 1].end - 1e-9, '不重疊、照順序');
  // 相鄰空檔 < 1 秒補滿
  assert.ok(cues.slice(1).every((c, i) => c.start - cues[i].end < 1e-9));
  // 沒講稿：rough.srt 每則切成子句再併到 ≤ 18 字
  const cl = clausesFromSrt([{ n: 1, start: 0, end: 6, text: '我強烈建議你儲存這支影片，因為接下來要分享一個節省我超多時間的免費工具。' }]);
  assert.deepEqual(cl.map((c) => c.text), ['我強烈建議你儲存這支影片，', '因為接下來要分享一個節省我超多時間的免費工具。']);
  const nc = alignCues(cl, null);
  assert.equal(nc.cues[0].text, '我強烈建議你儲存這支影片');
  assert.equal(nc.cues.length, 3, '22 字的子句沒有標點 → 斷在中段（沒有逐字稿就沒有停頓可看）');
  assert.deepEqual(nc.info.slice(1).map((x) => x.forced), [true, true]);
});

test('F8 srt-align（CLI）：--dry-run 只印表；寫回備份 rough.srt.align-*；plan.json 用到 #N 沒加 --remap-plan ✖，加了照時間換句號並備份', () => {
  const p = mkProj('pal');
  fs.writeFileSync(path.join(p, '講稿.md'), SCRIPT_MD);
  fs.writeFileSync(path.join(p, 'work', 'transcript.json'), JSON.stringify(speak(SAID)));
  const old = '1\n00:00:01,000 --> 00:00:04,000\n嗨，大家好，我是頂淵，歡迎來到\n\n2\n00:00:04,000 --> 00:00:08,500\n工程師下班有約，那並且跟我一樣使用手\n\n3\n00:00:08,500 --> 00:00:12,000\n機在固定的機位錄影。\n';
  fs.writeFileSync(path.join(p, 'work', 'rough.srt'), old);
  let r = node(MEDIA, ['srt-align', '--dry-run'], 'pal');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /字幕對講稿：講稿\.md 8 行，時間用 work\/transcript\.json（\d+ 個詞）全域對齊/);
  assert.match(r.stdout, /並且跟我一樣使用手機在固定的機位錄影 {3}（併 2 行；講稿第 3、4 行）/);
  assert.match(r.stdout, /⚠ 1 行講稿在逐字稿裡對不上，時間用前後句內插：第 7 行「這一行沒有講」/);
  assert.equal(fs.readFileSync(path.join(p, 'work', 'rough.srt'), 'utf8'), old, '--dry-run 不寫');
  fs.mkdirSync(path.join(p, 'work', 'hyperframes'), { recursive: true });
  const planFile = path.join(p, 'work', 'hyperframes', 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify({ version: 1, scenes: [{ id: 's01', scene: 'concept', from: '#3', to: '#3e', slots: { text: '固定機位' } }, { id: 's02', scene: 'concept', from: '#2@工程師', to: '#2e' }] }, null, 2));
  r = node(MEDIA, ['srt-align'], 'pal');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /plan\.json 已經用到句號（#N），重新斷句後句號會全部位移 → 加 --remap-plan/);
  assert.equal(fs.readFileSync(path.join(p, 'work', 'rough.srt'), 'utf8'), old, '✖ 時不寫');
  r = node(MEDIA, ['srt-align', '--remap-plan'], 'pal');
  assert.equal(r.status, 0, r.stderr);
  const w = fs.readdirSync(path.join(p, 'work'));
  assert.ok(w.some((f) => /^rough\.srt\.align-\d{8}-\d{6}$/.test(f)));
  assert.ok(fs.readdirSync(path.join(p, 'work', 'hyperframes')).some((f) => /^plan\.json\.align-\d{8}-\d{6}$/.test(f)));
  const cues = parseSrtText(fs.readFileSync(path.join(p, 'work', 'rough.srt'), 'utf8'));
  assert.equal(cues[0].text, '嗨！大家好我是鼎淵');
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const n = cues.find((c) => c.text.startsWith('並且')).n;
  // 舊 #3（8.5 秒，「機在固定…」）落在新的第 n 句裡 → #n+差；#2@工程師 → 有「工程師」的新句
  assert.match(plan.scenes[0].from, new RegExp(`^#${n}\\+\\d`));
  assert.equal(plan.scenes[1].from, `#${cues.find((c) => c.text.includes('工程師')).n}@工程師`);
  assert.match(r.stdout, /有 transcript\.json，不用跑 snap-srt/);
});
test('F8 srt-align 重新對句號的三個坑：情境動畫只換 <script> 裡的 P.at／P.sfx 字串（檔頭註解含「<script>」、JS 註解、屬性都不動）；outro.from 也換；anchor 段整段平移、長度不變、前一段的 to 跟著接上', async () => {
  const { remapPlanByTime, remapCustomRefs, CONNECTIVE } = await import(MEDIA);
  const { refTime } = await import(path.join(TOOLS, 'editor', 'subtitles.mjs'));
  const oldCues = [
    { n: 1, start: 0, end: 2, text: '開場白' }, { n: 2, start: 2, end: 5, text: '第二句' },
    { n: 3, start: 5, end: 8, text: '重點來了這一段' }, { n: 4, start: 8, end: 12, text: '第四句很長' },
  ];
  const newCues = [
    { n: 1, start: 0, end: 1.5, text: '開場白' }, { n: 2, start: 1.5, end: 3, text: '第二句' }, { n: 3, start: 3, end: 5.4, text: '過場' },
    { n: 4, start: 5.4, end: 9, text: '重點來了這一段第四句' }, { n: 5, start: 9, end: 12, text: '很長的結尾' },
  ];
  const plan = { version: 1, outro: { music: 'outro-a', from: '#4' }, scenes: [
    { id: 's01', scene: 'concept', from: '#1', to: '#3' },
    { id: 's02', type: 'media', anchor: '重點來了', from: '#3', to: '#3+2.5' },
  ] };
  const { plan: np, mapper } = remapPlanByTime(plan, oldCues, newCues);
  const [s01, s02] = np.scenes;
  // 坑 4：anchor 段照錨點那句的新起點平移（5.0 → 5.4），長度 2.5 秒不變；前一段的 to 寫同一個 #3，跟著換成同一句，0 秒相接不斷開
  assert.equal(s02.from, '#4');
  assert.equal(s02.to, '#4+2.5');
  assert.equal(refTime(s02.to, newCues) - refTime(s02.from, newCues), 2.5);
  assert.equal(s01.to, s02.from);
  assert.equal(s01.from, '#1');
  // 坑 1：outro.from 也是句號（舊 #4＝8 秒 → 新第 4 句 +2.6）
  assert.equal(np.outro.from, '#4+2.6');
  assert.equal(refTime(np.outro.from, newCues), 8);
  assert.deepEqual(plan.scenes[1], { id: 's02', type: 'media', anchor: '重點來了', from: '#3', to: '#3+2.5' }, '不改原物件');
  // 坑 2、3：情境動畫只換 <script> 裡、不在註解裡的 P.at('#N…')；檔頭 HTML 註解（裡面寫了「<script>」）、JS 註解、屬性、一般字串都不動
  const html = `<!doctype html>
<!-- 情境動畫範例：在 <script> 裡寫 P.at('#3') 綁第 3 句（檔頭說明，不要改） -->
<html><body>
<div data-note="P.at('#3')"></div>
<script>
  // 範例：P.at('#3')
  /* 也可以 P.at("#3@重點") */
  const tl = P.timeline();
  tl.to('.a', { opacity: 1 }, P.at('#3'));
  tl.to('.b', { opacity: 1 }, P.at("#4", 0.2));
  const T = P.sfx('click', '#3', 0.1);
  const s = '#3';
</script>
</body></html>`;
  const want = html.replace(`P.at('#3'));`, `P.at('#4'));`).replace(`P.at("#4", 0.2)`, `P.at("#4+2.6", 0.2)`).replace(`P.sfx('click', '#3', 0.1)`, `P.sfx('click', '#4', 0.1)`);
  assert.notEqual(want, html);
  assert.equal(remapCustomRefs(html, mapper, 'x-demo'), want);
  // 連接詞清單：程式和文件（cli-002 §4.5、docs.md §9.1）一字不差，弱模型看文件就知道哪些不併
  const words = CONNECTIVE.source.replace(/^\^\(|\)$/g, '').split('|');
  assert.equal(words.length, 24);
  const WS = path.resolve(TOOLS, '..', '..', '..');
  for (const f of ['specs/contracts/cli-002.md', 'specs/002-pipeline-timing/docs.md']) {
    const md = fs.readFileSync(path.join(WS, f), 'utf8');
    assert.ok(md.includes(words.join('／')), `${f} 的連接詞清單和 media.mjs 的 CONNECTIVE 不同`);
  }
});
const parseSrtText = (t) => t.trim().split(/\n\s*\n/).map((b) => { const l = b.split('\n'); const [a, z] = l[1].split(' --> ').map((s) => { const [h, m, x] = s.split(':'); return +h * 3600 + +m * 60 + +x.replace(',', '.'); }); return { n: +l[0], start: a, end: z, text: l.slice(2).join(' ') }; });

// 插入素材（type: "media"）、只有聲音的區間（blackdetect）；media.mjs 的指令與 --check --json 的格式測試在 media-cli.test.mjs
// 測試素材全部用 ffmpeg lavfi 現場產生；假工作區的 shared/template 用 symlink 指到真的模板
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, makeSrt, hasChrome } from './helpers.mjs';

const BUILD = path.join(TOOLS, 'build.mjs');
const MEDIA = path.join(TOOLS, 'media.mjs');
const M = await import(new URL(`file://${path.join(TOOLS, 'lib', 'media.mjs')}`).href);
let root, tpl, proj, out;

const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const probe = (f, entries) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
const node = (script, args, project = 'p1') => spawnSync(process.execPath, [script, ...args, '--template', tpl, '--project', `projects/${project}`], { encoding: 'utf8', cwd: root });
const build = (...args) => node(BUILD, args);
const checkJson = () => { const r = build('--check', '--json'); return { r, j: JSON.parse(r.stdout) }; };
const writePlan = (scenes, extra = {}) => fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, look: false, speakerBox: [100, 20, 220, 170], ...extra, scenes }, null, 2));
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
  // 螢幕錄影：640×400、25fps、關鍵影格稀疏（build 要轉成 30fps、每秒一個關鍵影格），有聲音
  ff(['-f', 'lavfi', '-i', 'testsrc=size=640x400:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '250', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(proj, ...REC.split('/'))]);
  ff(['-f', 'lavfi', '-i', 'color=c=0x3B82F6:s=800x500', '-frames:v', '1', path.join(proj, ...IMG.split('/'))]);
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), makeSrt({ n: 5 }));   // #5＝15–18
  fs.writeFileSync(path.join(proj, 'work', 'cutpoints.json'), JSON.stringify({ cuts: [{ at: 8, kind: 'pause' }, { at: 12, kind: 'ng' }] }));
  // 主軌（8 秒真人＋4 秒只有聲音＋6 秒真人）：media.mjs main 接好當 rough.mp4（main／scan／frame 的測試在 media-cli.test.mjs）
  const r = node(MEDIA, ['main']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  fs.copyFileSync(path.join(proj, 'work', 'main.mp4'), path.join(proj, 'work', 'rough.mp4'));
});

test('只有聲音的區間：blackdetect 抓到 8–12；沒被蓋住超過 1 秒 ✖，訊息叫 AI 跑 media.mjs scan', () => {
  writePlan([]);
  const r = build('--check');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✖ 只有聲音的區間 0:08\.00–0:12\.00 有 4s 沒有畫面（全黑，講者不在）→ 跑 node shared\/template\/tools\/media\.mjs scan --project projects\/p1/);
  assert.ok(fs.existsSync(path.join(out, '.cache', 'blackdetect.json')), '偵測結果要快取');
  assert.ok(!fs.existsSync(path.join(out, 'index.html')), '--check 不產生專案');
});

test('media 段欄位檢查：src、in＋段長、座標範圍、紅框同時 ≤ 2、放大鏡長度、和其他段的層級', () => {
  const m = (o) => ({ id: 'm01', type: 'media', src: REC, from: 7, to: 13, ...o });
  writePlan([m({ src: 'raw/a.mp4' })]);
  assert.match(checkJson().j.errors.join('\n'), /\[m01 media\] src 要寫專案資料夾裡 assets\/screen\/ 或 assets\/images\/ 底下的檔案/);
  writePlan([m({ src: 'assets/screen/沒有.mp4' })]);
  assert.match(checkJson().j.errors.join('\n'), /src：找不到 assets\/screen\/沒有\.mp4 → .*現有：assets\/screen\/操作示範\.mp4/);
  writePlan([m({ in: 6 })]);
  assert.match(checkJson().j.errors.join('\n'), /素材 assets\/screen\/操作示範\.mp4 長 10s；從第 6s 起播 6s 要用到第 12s → to 提早、in 改小，或 speed 改小/);
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

test('build：media 段蓋住只有聲音的區間；錄影轉 30fps＋每秒關鍵影格、放在主合成；子母畫面避開只有聲音的區間；紅框、運鏡、放大鏡', () => {
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 13, in: 1, volume: -6, sfx: 'impact',
    moves: [{ at: '+0.5', to: [0, 0, 320, 200], dur: 0.6 }, { at: '+3', to: 'full', dur: 0.6 }],
    marks: [{ at: '+1', until: '+2.5', box: [40, 40, 200, 100] }],
    lens: [{ at: '+4', until: '+5.5', box: [300, 150, 200, 100] }] }]);
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /m01｜media 操作示範\.mp4｜0:07\.00–0:13\.00｜6s｜impact/);
  assert.match(r.stdout, /只有聲音（rough\.mp4 0:08\.00–0:12\.00，4s）：已被 media 段或全畫面蓋住/);
  const html = read('index.html');
  const v = html.match(/<video id="mv-m01" src="(assets\/media\/[\w-]+\.mp4)" data-start="7" data-duration="6" data-media-start="1"\s+data-track-index="\d+" data-has-audio="true" data-volume="0\.501"/);
  assert.ok(v, '錄影 <video> 要在主合成、data-media-start＝in、原聲 −6dB');
  const asset = path.join(out, v[1]);
  assert.equal(probe(asset, 'stream=r_frame_rate').split('\n')[0], '30/1');
  const keys = spawnSync('ffprobe', ['-v', 'error', '-skip_frame', 'nokey', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', asset], { encoding: 'utf8' }).stdout.trim().split('\n');
  assert.ok(keys.length >= 9, `關鍵影格太少：${keys.length}`);
  // 子母畫面：7–8、12–13 兩支（8–12 只有聲音，不放）
  assert.match(html, /<video id="pipv-m01" src="assets\/rough\.mp4" data-start="7" data-duration="1" data-media-start="7"/);
  assert.match(html, /<video id="pipv-m01-2" src="assets\/rough\.mp4" data-start="12" data-duration="1" data-media-start="12"/);
  assert.match(html, /<rect id="mmk-m01-1" class="mmark"/);
  assert.match(html, /tl\.fromTo\('#mmk-m01-1', \{ strokeDashoffset: 1 \}, \{ strokeDashoffset: 0, autoRound: false, duration: 0\.4/);
  assert.match(html, /tl\.set\('#mmk-m01-1', \{ strokeDasharray: 'none' \}/);
  assert.match(html, /tl\.fromTo\('#mst-m01', \{ x: 0, y: 0, scale: 1 \}, \{ x: -?[\d.]+, y: -?[\d.]+, scale: [\d.]+, duration: 0\.6, ease: 'power2\.inOut', force3D: false \}, 7\.5\);/);
  assert.match(html, /MediaKit\.lens\(tl, '#mlc-m01-l1', '#mlsrc-m01-l1 img', \[[\d,]+\], 11, 1\.5\);/);
  // 動態 v2：從講者進來（fade）→ 面板外框 mgr 從小視窗長出（段起點 +0.3）；運鏡層在外框裡抵回畫面座標
  assert.match(html, /<div id="mgr-m01" class="mgrow" style="left:(\d+)px;top:(\d+)px;width:\d+px;height:\d+px" data-layout-allow-overflow>\s+<div id="mst-m01" class="mstage" style="left:-?\1px;top:-?\2px"/);
  assert.match(html, /\{ const M = SceneMotion\(tl, document\.getElementById\('el-m01'\)\);\s+M\.grow\('#mgr-m01', 7\.3, \{ from: \[1255,591,432,324\] \}\);/);
  assert.match(html, /<script src="kit\/media\.js"><\/script>/);
  const lensDir = path.join(out, 'assets', 'media', 'm01-l1');
  assert.ok(fs.readdirSync(lensDir).filter((f) => f.endsWith('.jpg')).length >= 1);
  assert.match(html, /<audio id="sfx-m01" src="assets\/sfx\/impact\.wav"/);
  // 再 build 一次：素材沒變就不重新轉檔
  const again = build();
  assert.doesNotMatch(again.stdout, /轉檔 assets/);
});

test('子母畫面移進錄影：每種比例外框都離錄影邊 16；只碰到邊邊的留在原位；鋪滿不用移', () => {
  const { mediaGeometry, pipShift, pipRect } = M;
  const at = (w, h, fit = 'contain') => pipShift(mediaGeometry({ width: w, height: h }, fit));
  assert.deepEqual(at(1920, 1080), [-85, -3], '16:9：錄影 x 125–1796、y 0–940');
  assert.deepEqual(pipRect(at(1920, 1080)), [1339, 591, 432, 324]);
  assert.deepEqual(at(2560, 1600), [-169, -3], '16:10：錄影 x 208–1712');
  assert.deepEqual(at(2520, 1080), [0, -61], '比 16:9 更寬：左右滿版、上下有空，只往上移');
  assert.equal(at(1080, 1920), null, '手機直式：小視窗完全在錄影外面，不擋內容');
  assert.equal(at(1000, 1000), null, '正方形的圖：小視窗只碰到邊邊，移進去會蓋掉快一半的寬度');
  assert.equal(at(1920, 376), null, '很扁的橫幅：同理');
  assert.equal(at(1920, 1080, 'cover'), null, '鋪滿：本來就在裡面');
  for (const [w, h] of [[1920, 1080], [2560, 1600], [1440, 900], [3452, 2016], [1024, 768], [1250, 1000], [2520, 1080]]) {
    const G = mediaGeometry({ width: w, height: h }, 'contain'), [x, y, pw, ph] = pipRect(pipShift(G));
    assert.ok(x - 9 >= G.left && y - 9 >= G.top && x + pw + 9 <= G.left + G.width - 15 && y + ph + 9 <= G.top + G.height - 15, `${w}×${h}：外框要在錄影裡面`);
  }
});

test('子母畫面移進錄影：段的位置、回報；從全畫面段接過來滑進去、接回全畫面段滑回來；只有聲音之後接回來不滑', () => {
  const list = { title: '清單', items: ['一', '二', '三'] };
  writePlan([
    { id: 's01', scene: 'fs-list', from: 1, to: 5, slots: list },
    { id: 'm01', type: 'media', src: REC, from: 5, to: 13, in: 0 },   // 5–8 有講者、8–12 只有聲音、12–13 有講者
    { id: 's02', scene: 'fs-list', from: 13, to: 17, slots: list },
  ]);
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = read('index.html');
  assert.match(html, /<div class="pip" id="pip-m01" data-layout-allow-overflow style="left:1255px;top:591px">/);
  assert.match(html, /<div class="pip" id="pip-m01-2" data-layout-allow-overflow style="left:1255px;top:591px">/);
  assert.match(html, /<img id="pipf-m01" class="clip pip-frame"[^>]*style="position:absolute;left:-169px;top:-3px">/);
  assert.match(html, /<div class="pip" id="pip-s01" data-layout-allow-overflow>/, '全畫面段不動');
  assert.match(html, /tl\.fromTo\('#pip-m01, #pipf-m01', \{ x: 169, y: 3 \}, \{ x: 0, y: 0, duration: 0\.6, ease: 'power3\.inOut' \}, 5\);/);
  assert.match(html, /tl\.fromTo\('#pip-s02, #pipf-s02', \{ x: -169, y: -3 \}, \{ x: 0, y: 0, duration: 0\.6, ease: 'power3\.inOut' \}, 13\);/);
  assert.doesNotMatch(html, /tl\.fromTo\('#pip-m01-2, #pipf-m01-2', \{ x:/, '同一段裡位置一樣');
  const { j } = checkJson();
  assert.deepEqual(j.items.find((x) => x.id === 'm01').out.pipShift, [-169, -3]);
  assert.equal(j.items.find((x) => x.id === 's01').out.pipShift, null);
});

test('子母畫面移進錄影：從講者飛進來落在新位置；tape、鋪滿、不露臉的段不移', () => {
  const voice = { id: 'm02', type: 'media', src: REC, from: 8, to: 12, in: 0 };   // 蓋住只有聲音的 8–12，這段沒有小視窗
  const flyOf = (html) => { const m = html.match(/tl\.fromTo\('#pip-m01', \{ x: (-?[\d.]+), y: (-?[\d.]+), scale: ([\d.]+), transformOrigin: '0 0' \}, \{ x: 0, y: 0, scale: 1,/); assert.ok(m, '要從講者飛進來'); return m.slice(1).map(Number); };
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 5, to: 7.5, fit: 'cover' }, voice]);
  assert.equal(build().status, 0);
  const home = flyOf(read('index.html'));
  assert.doesNotMatch(read('index.html'), /id="pip-m01" data-layout-allow-overflow style=/, 'fit cover：小視窗本來就在錄影裡');
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 5, to: 7.5 }, voice]);
  assert.equal(build().status, 0);
  const moved = flyOf(read('index.html'));
  assert.deepEqual([+(moved[0] - home[0]).toFixed(3), +(moved[1] - home[1]).toFixed(3), moved[2]], [169, 3, home[2]], '起點照舊對齊講者，終點是新位置');
  writePlan([{ id: 'm01', type: 'media', src: IMG, from: 5, to: 7.5, enter: 'tape' }, voice]);
  assert.equal(build().status, 0);
  assert.doesNotMatch(read('index.html'), /id="pip-m01" data-layout-allow-overflow style=/, 'tape：圖片貼在全幕背景上，小視窗和全畫面段一樣在畫布右下');
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 5, to: 7.5, pip: false }, voice]);
  assert.equal(checkJson().j.items.find((x) => x.id === 'm01').out.pipShift, null);
});

test('子母畫面移進錄影：紅框看的是新位置', () => {
  // REC 640×400 → 畫面 x = 208 + 2.35·x：小視窗（禁入區）移到 x 1255–1719、y 578–948
  const warnsOf = (box) => {
    writePlan([{ id: 'm01', type: 'media', src: REC, from: 5, to: 7.5, marks: [{ at: '+0.5', until: '+2', box }] }, { id: 'm02', type: 'media', src: REC, from: 8, to: 12, in: 0 }]);
    return JSON.stringify(checkJson().j);
  };
  assert.match(warnsOf([456, 300, 50, 40]), /marks\[0\].*被右下角的子母畫面擋住/, '畫面 x 1280–1397：只有移過來才擋到');
  assert.doesNotMatch(warnsOf([380, 300, 50, 40]), /被右下角的子母畫面擋住/, '畫面 x 1101–1218：在小視窗左邊，沒擋到');
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
  assert.doesNotMatch(h2, /M\.grow\(/, 'enter: "slide" 照舊，不長出');
  const left = fs.readdirSync(path.join(out, 'assets', 'media'));
  assert.ok(!left.some((f) => f.endsWith('.mp4') || f === 'm01-l1'), `沒用到的錄影與放大鏡逐格要清掉：${left.join(', ')}`);
});

test('015 enter: "tape"：圖片縮小貼在全幕背景上（紙白邊、兩條膠帶），面板落下貼平；只給圖片、fit contain、只能當進場', () => {
  writePlan([{ id: 'm03', type: 'media', src: IMG, from: 7, to: 13, enter: 'tape' }]);
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = read('index.html');
  assert.match(h, /<div id="mbg-m03" class="clip mbg mbg--paper"/);
  assert.match(h, /<img id="mi-m03" class="clip mimg mimg--paper"/);
  const g = h.match(/<div id="mgr-m03" class="mgrow" style="left:(\d+)px;top:(\d+)px;width:(\d+)px;height:(\d+)px"/).slice(1).map(Number);
  assert.ok(g[0] >= 200 && g[1] >= 90 && g[0] + g[2] <= 1720 && g[1] + g[3] <= 880, `縮小到 TAPE.view 裡：${g}`);
  assert.equal((h.match(/class="mtape"/g) || []).length, 2, '兩條膠帶');
  assert.match(h, new RegExp(`<i id="mtp-m03-1" class="mtape" style="left:${g[0] - 36}px;top:${g[1] - 20}px;rotate:-34deg"`));
  assert.match(h, /tl\.fromTo\('#mgr-m03', \{ scale: 1\.05, rotation: 3 \}, \{ scale: 1, rotation: 0, duration: 0\.35/);
  assert.match(h, /tl\.fromTo\('#mtp-m03-2', \{ opacity: 0, scale: 1\.4 \}, \{ opacity: 1, scale: 1, duration: 0\.15, ease: 'power2\.out' \}, 7\.45\);/);
  for (const [seg, re] of [[{ src: REC, enter: 'tape' }, /enter "tape"（紙膠帶貼上）只給圖片用/], [{ src: IMG, enter: 'tape', fit: 'cover' }, /enter "tape" 要配 fit "contain"/], [{ src: IMG, exit: 'tape' }, /exit 只能是 "cut"、"fade"、"slide"、"zoom"/]]) {
    writePlan([{ id: 'm04', type: 'media', from: 7, to: 13, ...seg }]);
    const c = build('--check');
    assert.match(c.stdout + c.stderr, re);
  }
});

test('enter／exit "whip"：0.3 秒橫向甩進（右邊來、expo.out）、甩出（往左、expo.in），拉長＋模糊；到位拿掉 filter；不長出、不配音效', () => {
  writePlan([{ id: 'm05', type: 'media', src: REC, from: 5, to: 13, in: 0, enter: 'whip', exit: 'whip' }]);
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = read('index.html');
  assert.match(h, /tl\.fromTo\('#el-m05', \{ x: 1920, scaleX: 1\.15, filter: 'blur\(24px\)' \}, \{ x: 0, scaleX: 1, filter: 'blur\(0px\)', duration: 0\.3, ease: 'expo\.out' \}, 5\);/);
  assert.match(h, /tl\.set\('#el-m05', \{ filter: 'none' \}, 5\.3\);/);
  assert.match(h, /tl\.fromTo\('#el-m05', \{ x: 0, scaleX: 1, filter: 'blur\(0px\)' \}, \{ x: -1920, scaleX: 1\.15, filter: 'blur\(24px\)', duration: 0\.3, ease: 'expo\.in', immediateRender: false \}, 12\.7\);/);
  assert.doesNotMatch(h, /M\.grow\('#mgr-m05'/, 'whip 不從小視窗長出');
  assert.match(h, /tl\.fromTo\('#pip-m05, #pipf-m05', \{ opacity: 0 \}, \{ opacity: 1, duration: 0\.4, ease: 'sine\.out' \}, 5\);/, '小視窗原地淡入');
  assert.doesNotMatch(h, /tl\.fromTo\('#pip-m05', \{ x: /, '講者不整張飛過去（會蓋住甩鏡）');
  assert.doesNotMatch(h, /id="sfx-m05"/, '切到錄影不配音效');
  assert.match(r.stdout, /m05｜media 操作示範\.mp4｜0:05\.00–0:13\.00｜8s｜—/);
  // 前一段是不透明幕：墊在底下直到甩進完成（不露出講者），不報重疊；小視窗在接縫交棒、滑進錄影裡（不會同時有兩個）
  writePlan([{ id: 's01', scene: 'fs-list', from: 1, to: 5, slots: { title: '清單', items: ['一', '二', '三'] } }, { id: 'm05', type: 'media', src: REC, from: 5, to: 13, in: 0, enter: 'whip' }]);
  const { r: c, j } = checkJson();
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.equal(j.items.find((x) => x.id === 's01').out.end, 5.3);
  assert.equal(j.items.find((x) => x.id === 's01').out.pip.at(-1).end, 5);
  assert.deepEqual(j.errors, []);
  assert.equal(build().status, 0);
  assert.match(read('index.html'), /tl\.fromTo\('#pip-m05, #pipf-m05', \{ x: 169, y: 3 \}, \{ x: 0, y: 0, duration: 0\.6, ease: 'power3\.inOut' \}, 5\);/);
  // 錄影 → 從錄影擦入的幕（z 31）→ 甩進的錄影：錄影提到同一層、排在幕後面（進場那幾格不被幕蓋住）；再擦入的幕一樣是 31、排在更後面
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 0.5, to: 2.5, in: 0 }, { id: 's02', scene: 'fs-list', from: 2.5, to: 6.5, slots: { title: '清單', items: ['一', '二', '三'] } },
    { id: 'm03', type: 'media', src: REC, from: 6.5, to: 9, in: 3, enter: 'whip' }, { id: 's04', scene: 'fs-list', from: 9, to: 13, slots: { title: '再一張', items: ['一', '二', '三'] } }]);
  const bz = build();
  assert.equal(bz.status, 0, bz.stdout + bz.stderr);
  const hz = read('index.html'), z = (id) => Number(hz.match(new RegExp(`id="el-${id}"[^>]*?z-index:(\\d+)`, 's'))[1]);
  assert.deepEqual(['m01', 's02', 'm03', 's04'].map(z), [30, 31, 31, 31]);
  assert.ok(hz.indexOf('id="el-s02"') < hz.indexOf('id="el-m03"') && hz.indexOf('id="el-m03"') < hz.indexOf('id="el-s04"'), '同一層照時間先後排，後面的在上');
});

test('enter "tilt"：面板從透視斜躺擺平（錄影、圖片都可以）；只能當進場、要 fit contain', () => {
  writePlan([{ id: 'm06', type: 'media', src: REC, from: 5, to: 13, in: 0, enter: 'tilt' }]);
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = read('index.html');
  const g = h.match(/<div id="mgr-m06" class="mgrow" style="left:(\d+)px;top:(\d+)px;width:(\d+)px;height:(\d+)px"/).slice(1).map(Number);
  assert.match(h, new RegExp(`<div id="el-m06" class="mlayer" style="z-index:\\d+;perspective:1800px;perspective-origin:${Math.round(g[0] + g[2] / 2)}px ${Math.round(g[1] + g[3] / 2)}px">`), '透視在整層、消失點對準面板中心');
  assert.match(h, /tl\.fromTo\('#el-m06', \{ opacity: 0 \}, \{ opacity: 1, duration: 0\.25, ease: 'sine\.out' \}, 5\);/);
  assert.match(h, /tl\.fromTo\('#mgr-m06', \{ rotationX: 22, rotationY: -8, y: 40, scale: 0\.94, transformOrigin: '50% 100%' \}, \{ rotationX: 0, rotationY: 0, y: 0, scale: 1, transformOrigin: '50% 100%', duration: 0\.65, ease: 'power3\.out', force3D: false \}, 5\);/);
  assert.doesNotMatch(h, /M\.grow\('#mgr-m06'/);
  assert.doesNotMatch(h, /tl\.fromTo\('#pip-m06', \{ x: /, '小視窗原地淡入，講者不整張飛過去（會蓋住斜躺）');
  writePlan([{ id: 'm07', type: 'media', src: IMG, from: 7, to: 13, enter: 'tilt' }]);
  assert.equal(build('--check').status, 0, '圖片也可以');
  for (const [seg, re] of [[{ src: IMG, enter: 'tilt', fit: 'cover' }, /enter "tilt"（斜躺擺平）要配 fit "contain"（斜躺的是一塊面板；cover 鋪滿畫面，斜躺時四邊會露出黑底）→ 拿掉 fit 或換 enter/], [{ src: REC, exit: 'tilt' }, /exit 只能是 "cut"、"fade"、"slide"、"zoom"、"whip"，現在是 "tilt"/], [{ src: REC, enter: 'spin' }, /enter 只能是 "cut"、"fade"、"slide"、"zoom"、"whip"、"tape"、"tilt"/]]) {
    writePlan([{ id: 'm08', type: 'media', from: 7, to: 13, ...seg }]);
    const c = build('--check');
    assert.equal(c.status, 1, c.stdout + c.stderr);
    assert.match(c.stdout + c.stderr, re);
  }
});

test('out：速度＝(out−in)÷段長，段 ≤ 3 秒可快轉到 64 倍；hold：整段定格成一張圖（不慢推、標註照常）', () => {
  const m = (o) => ({ id: 'm01', type: 'media', src: REC, from: 7, to: 13, ...o });
  writePlan([m({ in: 1, out: 4 })]);
  let r = build('--check');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /素材 1s 起 ×0\.5/);
  writePlan([m({ to: 9, out: 9.9 })]);
  assert.match(checkJson().j.warnings.join('\n'), /out：×4\.95 快轉 2s（跳過等待）/);
  writePlan([m({ in: 0.5, to: 8, out: 9.9 })]);
  assert.match(checkJson().j.warnings.join('\n'), /out：×9\.4 快轉 1s/);
  writePlan([m({ out: 1 })]);
  assert.match(checkJson().j.errors.join('\n'), /out：素材 0–1s 只有 1s，放進 6s 的段要慢到 ×0\.167（下限 0\.5）/);
  writePlan([m({ out: 4, speed: 2 })]);
  assert.match(checkJson().j.errors.join('\n'), /out 和 speed 擇一/);
  writePlan([m({ hold: 2.5, in: 1, marks: [{ at: '+1', box: [40, 40, 200, 100] }] })]);
  assert.match(checkJson().j.warnings.join('\n'), /hold：定格不播放，in／out／speed／volume 已忽略/);
  r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /定格 assets\/screen\/操作示範\.mp4 第 2\.5s → assets\/media\/[\w-]+\.jpg/);
  const html = read('index.html');
  const img = html.match(/<img id="mi-m01" class="clip mimg" src="(assets\/media\/[\w-]+\.jpg)"/);
  assert.ok(img, '定格要放成 <img>');
  assert.doesNotMatch(html, /<video id="mv-m01"/);
  assert.doesNotMatch(html, /scale: 1\.05/, '定格不慢推');
  assert.match(html, /<rect id="mmk-m01-1" class="mmark"/);
  assert.equal(probe(path.join(out, img[1]), 'stream=width,height'), '640,400');
});

test('剪輯台的呼叫方式（--project 絕對路徑、cwd＝工作區根目錄）與只給路徑旗標：media 段都找得到專案資料夾', () => {
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 13 }]);
  const r = spawnSync(process.execPath, [BUILD, '--project', proj, '--template', tpl, '--check', '--json'], { encoding: 'utf8', cwd: root });
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true, j.errors.join('\n'));
  assert.doesNotMatch(j.errors.join('\n'), /要知道專案資料夾/);
  assert.equal(j.paths.project, 'projects/p1');
  // 沒有 --project、四個路徑旗標都給：從 --out 往上找到有 assets/ 的專案資料夾
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
  // build：punch 從 12（完成影片 11.5）放大到片尾，dip 在 cut 收起來的 2 秒
  writePlan([m], { edit: { cuts: [[2, 2.5]], joins: [{ at: 12, type: 'punch' }, { at: 2, type: 'dip' }] } });
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = read('index.html');
  assert.match(html, /tl\.set\('#footage', \{ scale: 1\.08 \}, 11\.5\);/);
  assert.match(html, /tl\.fromTo\('#edit-dip', \{ opacity: 0 \}, \{ opacity: 1, duration: 0\.15, ease: 'sine\.in', immediateRender: false \}, 1\.85\);/);
  assert.match(html, /data-composition-id="main" data-start="0" data-duration="17\.5"/, '完成影片長度＝rough 18 − cuts 0.5');
  // cutpoints.json 壞掉：⚠ 但照樣能檢查
  fs.writeFileSync(path.join(proj, 'work', 'cutpoints.json'), '{ 壞');
  assert.ok(checkJson().j.warnings.some((x) => /work\/cutpoints\.json 不是合法的 JSON/.test(x)));
  fs.writeFileSync(path.join(proj, 'work', 'cutpoints.json'), JSON.stringify({ cuts: [{ at: 8, kind: 'pause' }, { at: 12, kind: 'ng' }] }));
});

test('--check --json 的 items：end＝plan.json 寫的迄點，畫面上自動延長時另給 shownEnd；sfx 每顆帶 volume 與 db', () => {
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 12, sfx: 'impact', sfxVolume: -6 }, { id: 'm02', type: 'media', src: IMG, from: 12, to: 14, enter: 'slide' }]);
  const { j } = checkJson();
  assert.equal(j.ok, true, j.errors.join('\n'));
  const m1 = j.items.find((x) => x.id === 'm01');
  assert.equal(m1.end, 12);
  assert.equal(m1.shownEnd, 12.6, 'm02 用 slide 進場，m01 墊在底下 0.6 秒');
  assert.ok(!('shownEnd' in j.items.find((x) => x.id === 'm02')));
  const w = m1.sfx[0];
  assert.equal(w.name, 'impact');
  assert.equal(w.db, +(20 * Math.log10(w.volume)).toFixed(1));
  const base = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')).impact.volume;
  assert.ok(Math.abs(w.volume - base * Math.pow(10, -6 / 20)) < 0.002);
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

// ---------- 004：錄影標註（callouts／spot／steps／arrows／marks.path，契約 specs/contracts/media.md）----------

const MEDIA_LIB = await import(path.join(TOOLS, 'lib', 'media.mjs'));
const MEDIA_LIB_FRAMES = await import(path.join(TOOLS, 'media.mjs'));

test('標註幾何：§1.1 三組例題、stage 換算、卡片寬度估算', () => {
  const { mediaGeometry, toStage, cardWidth, textPx } = MEDIA_LIB;
  const g1 = mediaGeometry({ width: 3452, height: 2016 }, 'contain');
  assert.deepEqual([g1.width, g1.height, g1.left, g1.top], [1610, 940, 155, 0]);
  assert.equal(+g1.kx.toFixed(6), 0.466396);
  const g2 = mediaGeometry({ width: 2560, height: 1600 }, 'contain');
  assert.deepEqual([g2.width, g2.height, g2.left, g2.top, g2.kx], [1504, 940, 208, 0, 0.5875]);
  const g3 = mediaGeometry({ width: 1920, height: 1080 }, 'contain');
  assert.deepEqual([g3.width, g3.height, g3.left, +g3.kx.toFixed(6)], [1671, 940, 125, 0.870313]);
  assert.deepEqual(toStage(g2, [1700, 200, 400, 80]), [1206.75, 117.5, 235, 47]);
  assert.equal(textPx('打開 API 設定'), 280);
  assert.equal(cardWidth('打開 API 設定', true), 414);
  assert.equal(cardWidth('儲存', false), 148);
});

test('placeCallout：右邊超出安全區改放左邊；指定 right 放不下回報 alt；四邊都放不下', () => {
  const { placeCallout } = MEDIA_LIB;
  const R = [1198.75, 109.5, 251, 63];
  const p = placeCallout({ R, w: 414 });
  assert.equal(p.side, 'left');
  assert.deepEqual(p.card, [728.75, 93, 1142.75, 189]);
  assert.equal(p.anchor, 'right');
  assert.equal(p.x, 777);                     // CSS right＝1920 − 1142.75
  assert.equal(p.lead.d, 'M1199 141 L1143 141');
  const q = placeCallout({ R, w: 414, side: 'right' });
  assert.equal(q.side, undefined);
  assert.equal(q.alt, 'left');
  assert.match(q.fail.right[0], /超出安全區（x 40–1880、y 40–900；卡片 1506–1920, 93–189）/);
  const z = placeCallout({ R: [800, 400, 300, 100], w: 1900 });
  assert.equal(z.alt, null);
  assert.deepEqual(Object.keys(z.fail), ['right', 'left', 'bottom', 'top']);
  const b = placeCallout({ R: [800, 400, 300, 100], w: 200, avoid: [{ box: [1100, 300, 1880, 600], why: '壓到 callouts[0]' }] });
  assert.equal(b.side, 'left');
});

test('placeArrow：箭尖離目標 9px；出畫改方向；四周都擋住就失敗；紅框線上不能穿過', () => {
  const { placeArrow } = MEDIA_LIB;
  const P = [208 + 600 * 0.5875, 900 * 0.5875];
  const a = placeArrow({ P });
  assert.equal(a.ok, true);
  assert.equal(a.from, 'ne');
  assert.deepEqual(a.tip, [566.86, 522.39]);
  assert.deepEqual(a.tail, [651.72, 437.53]);
  assert.ok(Math.abs(Math.hypot(a.tip[0] - P[0], a.tip[1] - P[1]) - 9) < 0.02);
  const top = placeArrow({ P: [913, 117.5], from: 'n' });   // 往上 129px 會出安全區
  assert.equal(top.ok, true);
  assert.equal(top.alt, 'ne');
  assert.deepEqual(top.why.n, ['超出安全區']);
  const none = placeArrow({ P: [913, 11.75] });
  assert.equal(none.ok, false);
  const ring = placeArrow({ P: [960, 500], rings: [{ box: [900, 300, 1100, 600], why: '壓到紅框' }] });
  assert.equal(ring.ok, true, '整支在框裡面不算穿過框線');
  const cross = placeArrow({ P: [960, 500], rings: [{ box: [920, 460, 1000, 540], why: '壓到紅框' }] });
  assert.equal(cross.ok, false, '目標被小框框住時，箭頭一定穿過框線');
  assert.deepEqual([...new Set(Object.values(cross.why).flat())], ['壓到紅框']);
});

test('STEP 編號：整份累加、同字沿用；和前一段相接、同字時接續不重播', () => {
  const { checkMediaSeg, validateMedia, newStepState } = MEDIA_LIB;
  const st = newStepState();
  const run = (id, start, end, steps) => {
    const seg = { id, type: 'media', src: IMG, steps };
    const errs = [];
    const media = checkMediaSeg(seg, { projectDir: proj, err: (x) => errs.push(x), warn: () => {} });
    const it = { id, seg, media, start, end };
    const r = validateMedia(it, { cues: [], tm: null, steps: st, err: (x) => errs.push(x), warn: () => {} });
    assert.deepEqual(errs, []);
    return r;
  };
  const a = run('m01', 0, 5, [{ at: '+0', text: '新增專案' }, { at: '+2', text: '連接 Gmail' }]);
  assert.deepEqual(a.json.steps.map((x) => [x.n, x.carry, x.ready]), [[1, false, 0.5], [2, false, 2.45]]);
  assert.equal(a.summary, '慢推、STEP 2（第 1–2 步）');
  const b = run('m02', 5, 10, [{ at: '+0', text: '連接 Gmail' }, { at: '+2', text: '完成' }]);
  assert.deepEqual(b.json.steps.map((x) => [x.n, x.carry]), [[2, true], [3, false]]);
  const c = run('m03', 12, 16, [{ at: '+0', text: '新增專案' }]);
  assert.deepEqual(c.json.steps.map((x) => [x.n, x.carry]), [[1, false]], '同字沿用號碼；沒相接不接續');
});

test('build：說明卡、聚光燈、STEP、箭頭、紅框跟捲動的 DOM 與時間軸；沒有標註的段不產生', () => {
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 13,
    steps: [{ at: '+0', text: '打開設定' }, { at: '+2', text: '建立金鑰' }],
    marks: [{ at: '+0.2', until: '+2.2', box: [100, 200, 100, 50], path: [{ at: '+1', box: [100, 260, 100, 50], dur: 0.6 }] }],
    callouts: [{ at: '+0.5', until: '+3', box: [425, 50, 100, 20], text: '打開 API 設定', icon: 'settings' },
      { at: '+3.2', until: '+4.6', box: [40, 300, 100, 40], text: '儲存', quick: true }],
    spot: [{ at: '+3', until: '+5.2', box: [300, 250, 200, 100] }],
    arrows: [{ at: '+3.6', to: [300, 100] }] }]);
  const { r, j } = checkJson();
  assert.equal(r.status, 0, JSON.stringify(j.errors));
  const b = build();
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const html = read('index.html');
  assert.match(html, /<svg id="man-m01" class="clip mann" data-start="7" data-duration="6" data-track-index="\d+" viewBox="0 0 1920 1080" data-layout-allow-overlap>/);
  // STEP 膠囊在錄影可見區左上（錄影左緣 208＋32），不跨在錄影邊上
  assert.match(html, /<div id="msteps-m01" class="msteps" style="left:240px;top:40px">/);
  assert.match(html, /<rect id="mcb-m01-1" class="mcbox" x="1199" y="110" width="251" height="63" rx="6" pathLength="1"\/>/);
  assert.match(html, /<g id="mcl-m01-1" class="mclead"><path d="M1199 141 L1143 141" pathLength="1"\/><circle cx="1199" cy="141" r="5"\/><\/g>/);
  assert.match(html, /<div id="mcc-m01-1" class="mcard mcard--left" style="right:777px;top:93px"><span class="mic"><svg[^]*?<\/svg><\/span><span class="mtxt">打開 API 設定<\/span><\/div>/);
  assert.match(html, /<div id="mcc-m01-2" class="mcard mcard--right mcard--plain" style="left:601px;top:704px"><span class="mtxt">儲存<\/span><\/div>/);
  assert.match(html, /<g id="msp-m01-1" class="mspot"><mask id="mspm-m01-1">.*rx="12" fill="#000000"\/><\/mask><rect class="mspot-dim" width="1920" height="1080" mask="url\(#mspm-m01-1\)"\/><\/g>/);
  assert.match(html, /<g id="mar-m01-1" class="marrow"><line [^>]+\/><polygon points="[\d., ]+"\/><\/g>/);
  assert.match(html, /<div id="mcd-m01" class="clip mcards" data-start="7" data-duration="6" data-track-index="\d+" data-layout-allow-overlap>/);
  assert.match(html, /<div id="mstep-m01-1" class="mstep"><span class="mnum">1<\/span><span class="mtxt">打開設定<\/span><\/div>/);
  assert.match(html, /<div id="mstep-m01-2" class="mstep"><span class="mnum">2<\/span><span class="mtxt">建立金鑰<\/span><\/div>/);
  // 時間軸（契約 §6 原文）
  const lines = [
    "tl.fromTo('#mcb-m01-1', { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: 0.4, ease: 'power2.inOut' }, 7.5);",
    "tl.set('#mcb-m01-1', { strokeDasharray: 'none' }, 7.9);",
    "tl.set('#mcl-m01-1 circle', { opacity: 1 }, 7.8);",
    "tl.fromTo('#mcl-m01-1 path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: 0.25, ease: 'power1.inOut' }, 7.8);",
    "tl.set('#mcl-m01-1 path', { strokeDasharray: 'none' }, 8.05);",
    "tl.fromTo('#mcc-m01-1', { opacity: 0, x: -16, y: 0 }, { opacity: 1, x: 0, y: 0, duration: 0.4, ease: 'power2.out' }, 7.95);",
    "tl.fromTo('#mcb-m01-1, #mcl-m01-1, #mcc-m01-1', { opacity: 1 }, { opacity: 0, duration: 0.3, ease: 'sine.in', immediateRender: false }, 9.7);",
    "tl.set('#mcb-m01-2, #mcl-m01-2 path', { strokeDasharray: 'none' }, 10.2);",
    "tl.fromTo('#mcb-m01-2, #mcl-m01-2, #mcc-m01-2', { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' }, 10.2);",
    "tl.fromTo('#msp-m01-1', { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.inOut' }, 10);",
    "tl.fromTo('#msp-m01-1', { opacity: 1 }, { opacity: 0, duration: 0.4, ease: 'power1.inOut', immediateRender: false }, 11.8);",
    "tl.fromTo('#mar-m01-1', { opacity: 0, x: 8.49, y: -8.49 }, { opacity: 1, x: 0, y: 0, duration: 0.5, ease: 'power2.out' }, 10.6);",
    "tl.fromTo('#mar-m01-1', { opacity: 1 }, { opacity: 0, duration: 0.5, ease: 'sine.in', immediateRender: false }, 12.5);",
    "tl.fromTo('#msteps-m01', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }, 7);",
    "tl.set('#mstep-m01-1', { opacity: 1 }, 7);",
    "tl.fromTo('#mstep-m01-1', { opacity: 1 }, { opacity: 0, duration: 0.25, ease: 'power1.in', immediateRender: false }, 9);",
    "tl.fromTo('#mstep-m01-2', { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' }, 9.1);",
  ];
  for (const l of lines) assert.ok(html.includes(l), `時間軸少了：${l}`);
  assert.match(html, /tl\.fromTo\('#mmk-m01-1', \{ attr: \{ x: 435, y: 462, width: 251, height: 134 \} \}, \{ attr: \{ x: 435, y: 603, width: 251, height: 134 \}, duration: 0\.6, ease: 'power2\.inOut', immediateRender: false \}, 8\);/);
  // --check --json 的 items 現在還沒有 out（002 加）；validateMedia 的 json 直接在 lib 測
  // 沒有標註的段不產生標註容器
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 13 }]);
  assert.equal(build().status, 0);
  const plain = read('index.html');
  assert.doesNotMatch(plain, /class="clip mann"|class="clip mcards"/);
});

test('標註的 ✖／⚠ 訊息：每則都照契約原文、帶「→」改法', () => {
  const m = (o) => ({ id: 'm01', type: 'media', src: REC, from: 7, to: 13, ...o });
  const all = [];
  const run = (scenes, extra) => { writePlan(scenes, extra); const { j } = checkJson(); all.push(...j.errors.map((x) => ['✖', x]), ...j.warnings.map((x) => ['⚠', x])); return j; };
  const box = [0, 0, 10, 10];
  const j1 = run([m({
    marks: [{ at: '+0.2', until: '+2.5', box: [100, 200, 50, 50] }, { at: '+0.2', until: '+2.5', box: [300, 200, 50, 50] }],
    moves: [{ at: '+3.5', to: [0, 0, 320, 200] }],
    callouts: [{ at: '+0.5', until: '+1', box, text: '短' }, { at: '+0.5', box, text: '' }, { at: '+0.5', box, text: '這是一段超過十二個字的說明文字喔' },
      { at: '+0.5', box, text: '設定', icon: 'settingz' }, { at: '+0.5', box, text: '設定', side: 'middle' }, { at: '+0.5', box, text: '設定', quick: 'yes' },
      { at: '+0.5', until: '+3', box: [425, 50, 100, 20], text: '打開 API 設定', icon: 'settings', side: 'right' },
      { at: '+0.5', until: '+3', box, text: 'x', bogus: 1 }, { at: '+3', until: '+5.5', box: [0, 0, 50, 50], text: '看這裡' }] })]);
  const e1 = j1.errors.join('\n');
  assert.match(e1, /callouts\[0\] 完整可讀只有 -0\.65s（要 ≥ 1\.2s：卡片在 at＋0\.85s 到位、until 前 0\.3s 開始淡出）→ until 延到 0:09\.85 之後，或寫 "quick": true/);
  assert.match(e1, /callouts\[1\]\.text 要寫 1–12 字的說明（名詞或一句重點），現在是 ""/);
  assert.match(e1, /callouts\[2\]\.text「這是一段超過十二個字的說明文字喔」有 16 字（上限 12）→ 縮成名詞或一句重點，細節交給講解/);
  assert.match(e1, /callouts\[3\]\.icon：找不到圖示「settingz」（kit\/icons\.json；相近：settings/);
  assert.match(e1, /callouts\[4\]\.side 只能是 "right"、"left"、"top"、"bottom"/);
  assert.match(e1, /callouts\[5\]\.quick 只能寫 true/);
  assert.match(e1, /callouts\[6\] 的卡片放 right 會超出安全區（x 40–1880、y 40–900；卡片 1506–1920, 93–189） → 改 "side": "left"（放得下）/);
  assert.match(e1, /callouts\[7\]\.bogus：沒有這個欄位（可用：at、until、box、text、icon、side、quick）/);
  assert.match(e1, /callouts\[8\]（0:10\.00–0:12\.50）期間有運鏡 moves\[0\] → 標註期間畫面不能動/);
  assert.match(e1, /marks：0:07\.50 同時有 3 個紅框（最多 2 個）；callouts 的框也算在內 → 位置相近的合成一個大框/);

  const j2 = run([m({
    lens: [{ at: '+4', until: '+5.5', box: [300, 150, 200, 100] }],
    callouts: [{ at: '+3.5', until: '+6', box: [425, 50, 100, 20], text: '看這裡' }],
    spot: [{ at: '+0.5', until: '+1.5', box }, { at: '+1.6', until: '+3.8', box }, { at: '+2', until: '+4', box }, { at: '+3.9', until: '+6', box }],
    arrows: [{ at: '+0', to: 'x' }, { at: '+0', to: [700, 10] }, { at: '+0', to: [10, 10], from: 'up' }, { at: '+0', until: '+1', to: [10, 10] },
      { at: '+3.5', to: [100, 100] }, { at: '+0', until: '+2.5', to: [300, 200] }, { at: '+1', until: '+3.5', to: [300, 220] }],
    steps: [{ at: '+0', text: '' }, { at: '+0', text: '這一步的說明文字太長了啦喔' }, { at: '+1', text: 'A' }, { at: '+0.5', text: 'B' }, { at: '+1.5', text: 'C' }] })]);
  const e2 = j2.errors.join('\n'), w2 = j2.warnings.join('\n');
  assert.match(w2, /callouts\[0\] 和放大鏡 lens\[0\] 同時出現，卡片會被壓暗 → 錯開時間/);
  assert.match(e2, /spot\[0\] 只有 1s（要 ≥ 2s：淡入 0\.4＋停 1\.2＋淡出 0\.4）→ until 延到 0:09\.50 之後/);
  assert.match(e2, /spot\[2\] 和 spot\[1\] 時間重疊 → 一次只放一個聚光燈/);
  assert.match(e2, /spot\[3\] 和放大鏡 lens\[0\] 時間重疊（會壓暗兩層）→ 錯開，或只留一個/);
  assert.match(e2, /arrows\[0\]\.to 要寫 \[x, y\]/);
  assert.match(e2, /arrows\[1\]\.to \[700, 10\] 超出素材範圍 640×400 → 座標是素材原尺寸的像素/);
  assert.match(e2, /arrows\[2\]\.from 只能是 "n"、"ne"、"e"、"se"、"s"、"sw"、"w"、"nw"/);
  assert.match(e2, /arrows\[3\] 只有 1s（要 ≥ 2\.2s：淡入 0\.5＋停 1\.2＋淡出 0\.5）→ until 延到 0:09\.20 之後，或不寫 until/);
  assert.match(w2, /arrows\[4\] 在放大鏡 lens\[0\] 期間，已拿掉（放大鏡會蓋住）/);
  assert.match(e2, /arrows\[6\] 和 arrows\[5\] 時間重疊 → 一次只放一支箭頭/);
  assert.match(e2, /steps\[0\]\.text 要寫 1–12 字（這一步在做什麼）/);
  assert.match(e2, /steps\[1\]\.text「這一步的說明文字太長了啦喔」有 13 字（上限 12）→ 縮短/);
  assert.match(e2, /steps\[3\]\.at（0:07\.50）要晚於 steps\[2\]（0:08\.00）→ 照時間先後排列/);
  assert.match(e2, /steps\[4\] 和前一步只差 0\.5s（要 ≥ 1\.65s：換步 0\.45＋停 1\.2）→ 合併成一步，或把 at 往後挪到 0:09\.65 之後/);

  const j3 = run([m({ stepsSide: 'left',
    marks: [{ at: '+0', until: '+3', box: [0, 0, 40, 20] }],
    steps: [{ at: '+0', text: '第一步' }, { at: '+5', text: '第二步' }],
    arrows: [{ at: '+1', to: [300, 50], from: 'n' }, { at: '+3.5', to: [300, 5] }] })]);
  const e3 = j3.errors.join('\n'), w3 = j3.warnings.join('\n');
  assert.match(e3, /steps\[1\] 在段尾前 1s 才出現（要 ≥ 1\.65s）→ 提早 at，或移到下一段/);
  // 膠囊在錄影可見區左上（錄影 640×400 放成 1504×940、左緣 208 → x 240）；指定 left 才會壓到
  assert.match(w3, /STEP 膠囊（x 240–478、y 40–120）在 0:07\.00 壓到 marks\[0\] 的紅框 → 換 side／from/);
  // 沒寫 stepsSide：壓到紅框自動換到錄影右上（右緣 208＋1504−32）
  const j3b = run([m({ marks: [{ at: '+0', until: '+3', box: [0, 0, 40, 20] }], steps: [{ at: '+0', text: '第一步' }] })]);
  assert.doesNotMatch(j3b.warnings.join('\n'), /STEP 膠囊/, '換到右上就不會壓到');
  // 有小節角標（sections）：橫式錄影段右上角露出角標 → 膠囊不自動換到右上（留左邊照樣 ⚠）；紅框在角標底下 ⚠
  const tag = { id: 'c01', scene: 'chapter-tag', from: '#1', to: '#1e', slots: { num: '01', name: '測試' } };
  const j3c = run([tag, m({ marks: [{ at: '+0', until: '+3', box: [0, 0, 40, 20] }, { at: '+3.2', until: '+5', box: [600, 30, 40, 20] }], steps: [{ at: '+0', text: '第一步' }] })],
    { sections: [{ at: '#2', name: '第一節' }] });
  const w3c = j3c.warnings.join('\n');
  assert.match(w3c, /STEP 膠囊（x 240–478、y 40–120）在 0:07\.00 壓到 marks\[0\] 的紅框/, '右上有角標，膠囊留在左邊');
  assert.match(w3c, /marks\[1\] 的紅框在 0:10\.20 被右上角的小節角標（x 1452–1696、y 16–96）蓋住 → 用 moves 把那一塊推到畫面中間/);
  assert.match(e3, /arrows\[0\] 從 "n" 方向放會超出安全區 → 改 "from": "ne"（放得下）/);
  assert.match(w3, /arrows\[1\] 找不到不擋字的位置（超出安全區），已拿掉（作者規則：找不到位置就不放）→ 換一個 to/);

  const j4 = run([m({
    marks: [{ at: '+0', until: '+5', box: [100, 100, 50, 50], path: [{ at: '+0.2', box: [100, 120, 50, 50] }, { at: '+1', box: [100, 140, 50, 50], dur: 5 },
      { at: '+2', box: [100, 380, 50, 20] }, { at: '+2.2', box: [100, 150, 50, 50] }] }, { at: '+0', box: [300, 100, 50, 50], path: 'x' }] }),
  { id: 'm02', type: 'media', src: IMG, from: 13, to: 16, kenburns: true, callouts: [{ at: '+0.2', until: '+2.8', box: [100, 100, 200, 80], text: '架構' }] }]);
  const e4 = j4.errors.join('\n'), w4 = j4.warnings.join('\n');
  assert.match(e4, /marks\[0\]\.path\[0\]\.at（0:07\.20）要在紅框描完（0:07\.40）之後、/);
  assert.match(e4, /marks\[0\]\.path\[1\]\.dur 要是 0\.2–2 的秒數（預設 0\.4；跟捲動用錄影捲動的秒數），現在是 5/);
  assert.match(w4, /marks\[0\]\.path\[2\] 壓到字幕區（畫面 y > 920）/);
  assert.match(e4, /marks\[0\]\.path\[3\]\.at（0:09\.20）在上一次移動還沒結束（0:09\.40）時開始/);
  assert.match(e4, /marks\[1\]\.path 要寫成陣列/);
  assert.match(w4, /kenburns：有 callouts／spot／arrows 時不做慢推（標註要對準不動的畫面），已忽略/);

  const j5 = run([m({ callouts: [{ at: '+1', until: '+4', box: [425, 50, 100, 20], text: '跳一下' }] }),
    { id: 'm02', type: 'media', src: REC, from: 12, to: 15, fit: 'cover', pip: false, callouts: [{ at: '+0.2', until: '+2.8', box: [0, 0, 100, 15], text: '上面' }] }],
  { edit: { cuts: [[9, 10]] } });
  assert.match(j5.warnings.join('\n'), /callouts\[0\] 期間錄影有接點（0:09\.00，edit\.cuts 切開），畫面會跳、框可能對不上 → at／until 避開這個時間/);
  assert.match(j5.errors.join('\n'), /callouts\[0\]\.box 在畫面外（fit "cover" 裁掉了）→ 改 fit "contain"/);

  // FR-013：新訊息全部帶「→」；只有「放大鏡期間已拿掉」是告知。keysOk／boxOf 是 marks、moves、lens 共用的舊訊息（FR-014 不改）
  const mine = all.filter(([, x]) => /(callouts|spot|steps|arrows)\[\d+\]|\.path|STEP 膠囊|callouts 的框/.test(x) && !/沒有這個欄位（可用：|要寫 \[x, y, w, h\]/.test(x));
  assert.ok(mine.length >= 30, `新訊息太少：${mine.length}`);
  for (const [lv, x] of mine) if (!/已拿掉（放大鏡會蓋住）/.test(x)) assert.match(x, /→/, `${lv} 沒有改法：${x}`);
});

test('media 段的 clicks（contracts/sfx.md §5）：MEDIA_KEYS 認得；時間錯只報一次；一下一顆 click；sfxExtra false 關掉', () => {
  const m = (o) => ({ id: 'm01', type: 'media', src: REC, from: 7, to: 13, ...o });
  writePlan([m({ clicks: ['+0.5', '+9'] })]);
  const e = checkJson().j.errors.filter((x) => /clicks/.test(x));
  assert.deepEqual(e, ['[m01 media] clicks[1]（0:16.00）不在這段 0:07.00–0:13.00 裡 → 改成這段範圍內的句號或 +秒數']);
  // 絕對秒數：原文照 cli-005 §3.3（建議值＝寫的秒數 − 本段起點）
  writePlan([m({ steps: [{ at: 10.2, text: '新增專案' }] })]);
  assert.match(checkJson().j.errors.join('\n'), /steps\[0\]\.at：不能寫絕對秒數「10\.2」→ 改成 "\+3\.2"（本段起點後幾秒）或 "#N"（綁字幕句）/);
  writePlan([m({ clicks: ['+0.5', '+2'] })]);
  assert.equal(build().status, 0);
  const html = read('index.html');
  assert.match(html, /<audio id="sfx-m01-e1" src="assets\/sfx\/click\.wav"/);
  assert.match(html, /<audio id="sfx-m01-e2" src="assets\/sfx\/click\.wav"/);
  writePlan([m({ clicks: ['+0.5'], sfxExtra: false })]);
  assert.equal(build().status, 0);
  assert.doesNotMatch(read('index.html'), /sfx-m01-e1/);
  const f = MEDIA_LIB.MEDIA_FIELDS.find((r) => r[0] === 'clicks');
  assert.ok(f && /click 附加音效/.test(f[3]));
});

test('media 段的 sfx 寫 { name, at }：主音效放在那一刻（綁句或 +秒）；格式錯、不在段裡 ✖；字卡段也能用', () => {
  const m = (o) => ({ id: 'm01', type: 'media', src: REC, from: 7, to: 13, ...o });
  writePlan([m({ sfx: { name: 'success', at: '+2.5' } })]);
  let { j } = checkJson();
  assert.deepEqual(j.errors, []);
  const it = j.items.find((x) => x.id === 'm01');
  assert.equal(it.sfx[0].name, 'success');
  assert.ok(it.sfx[0].at > 9 && it.sfx[0].at <= 9.5, `音效要在 9.5 秒那一刻（扣掉音效本身的起音），現在是 ${it.sfx[0].at}`);
  writePlan([m({ sfx: { name: 'success', at: '+9' } })]);
  assert.match(checkJson().j.errors.join('\n'), /\[m01 media\] sfx\.at（0:16\.00）不在這段 0:07\.00–0:13\.00 裡/);
  writePlan([m({ sfx: { name: 'success' } })]);
  assert.match(checkJson().j.errors.join('\n'), /sfx 寫成物件時要有 name 和 at/);
  writePlan([m({ sfx: { name: 'nope', at: '+1' } })]);
  assert.match(checkJson().j.errors.join('\n'), /sfx\.name：只能是 /);
  // 字卡段也能寫 { name, at }：主音效放在那一刻（不是情境預設的拍點）
  writePlan([m(), { id: 's01', scene: 'concept', from: 2, to: 6, slots: { text: '字卡' }, sfx: { name: 'alert', at: '+3' } }]);
  ({ j } = checkJson());
  assert.deepEqual(j.errors, []);
  const s1 = j.items.find((x) => x.id === 's01');
  assert.equal(s1.sfx[0].name, 'alert');
  assert.ok(Math.abs(s1.sfx[0].at - 5) < 0.05, `音效要在 5 秒那一刻（扣掉起音、加一格），現在是 ${s1.sfx[0].at}`);
});

test('標註焦點（design-system §7）：後一個出現時前面還在的壓暗 0.5；最後一個出現後 2.6 s／段尾前 1.4 s／它收掉前 0.3 s 回均衡；同時出現、快收掉的不壓暗', () => {
  const ev = [{ sel: '#a', at: 8, until: 11 }, { sel: '#b', at: 9, until: 10.5 }];
  assert.deepEqual(M.focusPlan(ev, 13), [{ sel: '#a', at: 9, to: 0.5 }, { sel: '#a', at: 10.2, to: 1 }]);
  assert.deepEqual(M.focusPlan([{ sel: '#a', at: 8, until: 11 }, { sel: '#b', at: 8, until: 11 }], 13), []);
  assert.deepEqual(M.focusPlan([{ sel: '#a', at: 8, until: 9.2 }, { sel: '#b', at: 9, until: 10 }], 13), []);
  // 回均衡時 a 已經收掉 → 只壓暗、不回
  assert.deepEqual(M.focusPlan([{ sel: '#a', at: 8, until: 10 }, { sel: '#b', at: 9, until: 12.5 }], 13), [{ sel: '#a', at: 9, to: 0.5 }]);
  writePlan([{ id: 'm01', type: 'media', src: REC, from: 7, to: 13, marks: [{ at: '+1', until: '+4', box: [40, 40, 200, 100] }, { at: '+2', until: '+3.5', box: [300, 40, 200, 100] }] }]);
  const r = build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = read('index.html');
  assert.match(html, /<g id="fo-mmk-m01-1"><rect id="mmk-m01-1" class="mmark"/);
  assert.match(html, /M\.dim\('#fo-mmk-m01-1', 9, \{ to: 0\.5 \}\);\s+M\.dim\('#fo-mmk-m01-1', 10\.2, \{ to: 1 \}\);/);
});

// media.mjs illus-lint（specs/contracts/illus.md §6.1）：專案自己畫的示意插圖 work/hyperframes/illus-local/*.svg
const ROUTER_SVG = fs.readFileSync(path.join(TEMPLATE, 'kit', 'illus-style.md'), 'utf8').match(/```svg\n([\s\S]*?)```/)[1];
const illusProject = (name, { svgs = {}, storyboard = null } = {}) => {
  const work = path.join(root, 'projects', name, 'work');
  fs.mkdirSync(work, { recursive: true });
  if (Object.keys(svgs).length) fs.mkdirSync(path.join(work, 'hyperframes', 'illus-local'), { recursive: true });
  for (const [f, txt] of Object.entries(svgs)) fs.writeFileSync(path.join(work, 'hyperframes', 'illus-local', f), txt);
  if (storyboard) fs.writeFileSync(path.join(work, 'storyboard.md'), storyboard);
  return work;
};
const ILLUS_LIST = `#### 插圖清單 x01

| 元件 | 來源 | 怎麼來 |
|---|---|---|
| 雲 | 畫廊 ✓ | \`data-illus="cloud" data-arrow="up"\` |
| 檔案夾＋加號 | 圖示組合 | lucide \`folder\`＋\`plus\` |
| 路由器 | **新建 SVG** | 規格：\`router\`，建議尺寸 220×120，狀態 \`.il-led\`（綠）、\`.il-warn\`（紅），描述：橫式機身＋兩根天線 |
`;

test('illus-lint：好檔 0 ✖（尺寸、狀態從插圖清單讀）、結束碼 0', () => {
  illusProject('il-good', { svgs: { 'router.svg': ROUTER_SVG }, storyboard: ILLUS_LIST });
  const r = node(MEDIA, ['illus-lint', '--no-sheet'], 'il-good');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /illus-local：1 個 SVG/);
  assert.match(r.stdout, /✓ illus-local\/router\.svg/);
  assert.doesNotMatch(r.stdout, /^[✖⚠]/m);
  assert.match(r.stdout, /通過：1 個 SVG，0 個提醒（⚠）/);
});

test('illus-lint：壞檔抓到（顏色、描邊、<text>；插圖清單的尺寸與狀態有套用）；列了新建 SVG 沒有檔 ✖；結束碼 1', () => {
  const bad = '<svg viewBox="0 0 100 100"><rect x="1" y="1" width="98" height="98" fill="#ff0000" stroke="var(--il-line)" stroke-width="5"/><text x="5" y="50">hi</text></svg>';
  illusProject('il-bad', { svgs: { 'router.svg': ROUTER_SVG, 'bad.svg': bad, 'extra.svg': ROUTER_SVG }, storyboard: `${ILLUS_LIST}| 壞掉的 | 新建 SVG | 規格：bad，建議尺寸 200×100，狀態 on |\n| 記憶卡 | 新建 SVG | 規格：sdcard，建議尺寸 120×160 |\n` });
  const r = node(MEDIA, ['illus-lint', '--no-sheet'], 'il-bad');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const lines = r.stdout.split('\n');
  const has = (re) => assert.ok(lines.some((l) => re.test(l)), `${re}\n${r.stdout}`);
  has(/^✖ \[illus-local\/bad\.svg\] bad：fill="#ff0000" 不是 token → /);
  has(/^✖ \[illus-local\/bad\.svg\] bad：描邊寬 5 不在 4／3／2 → /);
  has(/^✖ \[illus-local\/bad\.svg\] bad：不能用 <text> → /);
  has(/^✖ \[illus-local\/bad\.svg\] bad：viewBox 100×100 的比例 1\.00 和建議尺寸 200×100/);
  has(/^✖ \[illus-local\/bad\.svg\] bad：缺狀態群組 <g class="il-on"> → /);
  has(/^✖ \[插圖清單\] 新建 SVG「sdcard」還沒有檔 → .*work\/hyperframes\/illus-local\/sdcard\.svg/);
  has(/^⚠ \[illus-local\/extra\.svg\] extra：work\/storyboard\.md、work\/designs\/\*\.md 的插圖清單沒有這個元件的「新建 SVG」列/);
  has(/^✓ illus-local\/router\.svg$/);
  assert.ok(lines.findIndex((l) => l.startsWith('⚠')) > lines.findLastIndex((l) => l.startsWith('✖')), '✖ 排在 ⚠ 前面');
  for (const l of lines.filter((x) => /^[✖⚠]/.test(x))) { assert.match(l, / → /, `每則都有改法：${l}`); assert.doesNotMatch(l, /specs\//, `訊息不指到 specs/：${l}`); }
  assert.match(r.stdout, /未通過：\d+ 個錯誤（✖），1 個提醒（⚠）/);
});

test('023 illus-lint --only：只查自己那個檔（別人的 ✖、別人列了沒畫的都不報）；檔不存在 ✖', () => {
  const bad = '<svg viewBox="0 0 100 100"><text x="5" y="50">hi</text></svg>';
  illusProject('il-only', { svgs: { 'router.svg': ROUTER_SVG, 'bad.svg': bad }, storyboard: `${ILLUS_LIST}| 記憶卡 | 新建 SVG | 規格：sdcard，建議尺寸 120×160 |\n` });
  const r = node(MEDIA, ['illus-lint', '--no-sheet', '--only', 'router'], 'il-only');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /illus-local：1 個 SVG/);
  assert.match(r.stdout, /✓ illus-local\/router\.svg/);
  assert.doesNotMatch(r.stdout, /bad\.svg|sdcard/);
  const r2 = node(MEDIA, ['illus-lint', '--no-sheet', '--only', 'illus-local/nope.svg'], 'il-only');
  assert.equal(r2.status, 1, r2.stdout + r2.stderr);
  assert.match(r2.stdout, /✖ 找不到 .*illus-local\/nope\.svg → /);
});

test('illus-lint：沒有 illus-local、插圖清單也沒有新建 SVG → 印「無」、結束碼 0、不拼圖', () => {
  const work = illusProject('il-none');
  const r = node(MEDIA, ['illus-lint'], 'il-none');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /illus-local：無/);
  assert.match(r.stdout, /通過：沒有要查的 SVG，0 個提醒（⚠）/);
  assert.doesNotMatch(r.stdout, /^[✖⚠]/m);
  assert.ok(!fs.existsSync(path.join(work, '插圖清單.jpg')));
});

test('illus-lint：拼 work/插圖清單.jpg（畫廊用到的＋新建的，寬 1920、上亮下暗兩列）', { skip: !(await hasChrome()) && '沒有 HyperFrames 的 Chrome' }, () => {
  const work = illusProject('il-sheet', { svgs: { 'router.svg': ROUTER_SVG }, storyboard: ILLUS_LIST });
  const r = node(MEDIA, ['illus-lint'], 'il-sheet');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const jpg = path.join(work, '插圖清單.jpg');
  assert.ok(fs.existsSync(jpg), r.stdout);
  const [w, h] = probe(jpg, 'stream=width,height').split(',').map(Number);
  assert.equal(w, 1920);
  assert.match(r.stdout, new RegExp(`插圖清單\\.jpg：.*（1920×${h}；畫廊 1 個、新建 1 個；上亮下暗）`));
  // 上半亮、下半暗：各取中間一列最左邊的底色
  const px = (y) => spawnSync('ffmpeg', ['-v', 'error', '-i', jpg, '-vf', `crop=4:4:4:${y}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 20 }).stdout[0];
  assert.ok(px(10) > 200 && px(h / 2 + 10) < 60, `亮 ${px(10)}、暗 ${px(h / 2 + 10)}`);
});

test('023 illus-lint --only 拼 work/插圖清單-<名稱>.jpg（自己的＋三個畫廊比例尺），不動整份的插圖清單.jpg', { skip: !(await hasChrome()) && '沒有 HyperFrames 的 Chrome' }, () => {
  const work = illusProject('il-only-sheet', { svgs: { 'router.svg': ROUTER_SVG }, storyboard: ILLUS_LIST });
  const r = node(MEDIA, ['illus-lint', '--only', 'router'], 'il-only-sheet');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(work, '插圖清單-router.jpg')), r.stdout);
  assert.ok(!fs.existsSync(path.join(work, '插圖清單.jpg')));
  assert.match(r.stdout, /插圖清單-router\.jpg：.*畫廊 3 個、新建 1 個/);
});

test('readIllusList：認「#### 插圖清單 <段 id>」與舊名「素材清單」；表頭要有「元件」「來源」；沒有標題的同表頭表不算', async () => {
  const { readIllusList } = await import(new URL(`file://${MEDIA}`).href);
  const body = ILLUS_LIST.split('\n').slice(1).join('\n');
  const now = readIllusList(ILLUS_LIST), old = readIllusList(`素材清單\n${body}`), none = readIllusList(`#### 動畫分鏡 x01\n${body}`);
  assert.deepEqual(now.local.get('router'), { name: 'router', size: [220, 120], states: ['led', 'warn'], label: '路由器' });
  assert.deepEqual(now.gallery, [{ name: 'cloud', attrs: { arrow: 'up' }, label: '雲' }]);
  assert.deepEqual(old.local.get('router'), now.local.get('router'));
  assert.equal(none.local.size + none.gallery.length, 0);
  assert.deepEqual(readIllusList('#### 插圖清單 x02\n\n| 元件 | 來源 | 怎麼來 |\n|---|---|---|\n| 卡 | 新建 SVG | 規格：sdcard，建議尺寸 120×160，狀態 a／b；描述：有缺角 |\n').local.get('sdcard').states, ['a', 'b']);
});

// ---------- 009 直式（specs/009-vertical/spec.md FR-080、FR-081；canvas.mjs 的 media.view／textSafe／unsafe／pip.box）----------
test('直式：16:9 與 9:16 錄影放進上半資訊面板（y 240–900）；沒有講者面板用 containFull；標註只在安全區、STEP 在左上 y 260；DOM 用 1080×1920', async () => {
  const { checkMediaSeg, validateMedia, mediaParts, mediaFrame, mediaGeometry, placeCallout } = MEDIA_LIB;
  const { canvasOf } = await import(new URL(`file://${path.join(TOOLS, 'lib', 'canvas.mjs')}`).href);
  const { timeMap } = await import(new URL(`file://${path.join(TOOLS, 'lib', 'edit.mjs')}`).href);
  const C = canvasOf('portrait');
  const rec = (name, size) => ff(['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`, '-t', '16', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', path.join(proj, 'assets', 'screen', name)]);
  rec('橫錄.mp4', '1280x720'); rec('直錄.mp4', '360x640');
  // 幾何：橫式不變；直式 16:9 → 1080×608 在 y 266（上半可見區 240–900 置中）；9:16 → 371×660 置中；沒有講者面板 → 可見區 y 240–1260
  assert.equal(mediaFrame(null).format, 'landscape');
  assert.deepEqual(mediaGeometry({ width: 1920, height: 1080 }, 'contain'), mediaGeometry({ width: 1920, height: 1080 }, 'contain', mediaFrame(canvasOf('landscape'))));
  const P = mediaFrame(C), Pf = mediaFrame(C, { panel: false });
  const g = (w, h, F, fit = 'contain') => { const x = mediaGeometry({ width: w, height: h }, fit, F); return [x.left, x.top, x.width, x.height]; };
  assert.deepEqual(g(1280, 720, P), [0, 266, 1080, 608]);
  assert.deepEqual(g(360, 640, P), [355, 240, 371, 660]);
  assert.deepEqual(g(1280, 720, P, 'cover'), [-260, 0, 1600, 900]);
  assert.deepEqual(g(360, 640, Pf), [253, 240, 574, 1020]);
  assert.deepEqual(P.safe, [60, 260, 1020, 880]);
  assert.deepEqual(Pf.safe, [60, 260, 1020, 1260]);
  // 說明卡：右邊出 x 1020 → 自動放左邊；指定 right 放不下 → alt；CSS right 用 1080 算
  const R = [700, 400, 200, 80];
  const c1 = placeCallout({ R, w: 300, F: P });
  assert.equal(c1.side, 'left');
  assert.equal(c1.x, 1080 - (700 - 56));
  const c2 = placeCallout({ R, w: 300, side: 'right', F: P });
  assert.equal(c2.alt, 'left');
  assert.match(c2.fail.right[0], /超出安全區（x 60–1020、y 260–880/);

  const tm = timeMap([], 60);
  const run = (seg, { panel = true, start = 2, end = 14 } = {}) => {
    const errs = [], warns = [];
    const media = checkMediaSeg(seg, { projectDir: proj, err: (x) => errs.push(x), warn: (x) => warns.push(x) });
    assert.ok(media, errs.join('\n'));
    const it = { id: seg.id, seg, media, start, end, z: 20, enterFx: 'fade', exitFx: 'fade' };
    const r = validateMedia(it, { cues: [], tm, pipAt: () => panel, canvas: C, err: (x) => errs.push(x), warn: (x) => warns.push(x) });
    return { it, r, errs, warns };
  };
  // 16:9 錄影＋紅框、說明卡、箭頭、STEP：全部在上半安全區（y 260–880），不壓講者面板
  const a = run({ id: 'v01', type: 'media', src: 'assets/screen/橫錄.mp4',
    steps: [{ at: '+0.2', text: '打開設定' }],
    marks: [{ at: '+0.5', until: '+2', box: [100, 120, 300, 120] }],
    callouts: [{ at: '+2', until: '+5', box: [800, 300, 240, 120], text: '按這裡' }],
    arrows: [{ at: '+5.5', until: '+8.5', to: [640, 500] }] });
  assert.deepEqual(a.errs, []);
  const m = a.it.media;
  // 錄影 ≥ 4 秒一個標註、運鏡都沒有 → ⚠（只對好 in 不算配完）；有標註、或不到 4 秒 → 不提醒
  const bare = run({ id: 'v09', type: 'media', src: 'assets/screen/橫錄.mp4' });
  assert.ok(bare.warns.some((w) => /^錄影 12s 沒有任何標註或運鏡 → /.test(w)), bare.warns.join('\n'));
  assert.ok(!run({ id: 'v10', type: 'media', src: 'assets/screen/橫錄.mp4' }, { end: 5.5 }).warns.some((w) => /沒有任何標註/.test(w)));
  assert.ok(!a.warns.some((w) => /沒有任何標註/.test(w)));
  assert.deepEqual(m.steps.capsule.box.slice(0, 2), [60, 260]);
  const co = m.callouts[0];
  assert.ok(co.card[0] >= 60 && co.card[2] <= 1020 && co.card[1] >= 260 && co.card[3] <= 880, `說明卡 ${co.card}`);
  const ar = m.arrows[0];
  for (const q of [ar.tip, ar.tail]) assert.ok(q[0] >= 60 && q[0] <= 1020 && q[1] >= 260 && q[1] <= 880, `箭頭 ${q}`);
  const mk = m.marks[0].rect;
  assert.ok(mk[1] >= 240 && mk[1] + mk[3] <= 900, `紅框 ${mk}`);
  // FR-082：直式放橫錄影時 --check --json 的 annotations 多 view（縮放、運鏡數），給 qc storyboard 判「介面字太小」
  assert.deepEqual(a.r.json.view, { scale: 0.844, moves: 0, lens: 0 });
  // DOM：畫面座標的層吃 --cw／--ch、viewBox 1080×1920、STEP 膠囊位置寫在 style、滑入用畫布寬
  const html = mediaParts({ ...a.it, enterFx: 'slide', exitFx: 'slide', pipIds: [] }, { nextTrack: (() => { let n = 10; return () => n++; })() });
  assert.match(html.html, /class="mlayer" style="z-index:20;--cw:1080px;--ch:1920px"/);
  assert.match(html.html, /viewBox="0 0 1080 1920"/);
  assert.doesNotMatch(html.html, /1920 1080/);
  assert.match(html.html, /class="msteps" style="left:60px;top:260px"/);
  assert.ok(html.tl.some((x) => /\{ x: 1080 \}, \{ x: 0/.test(x)) && html.tl.some((x) => /x: -1080/.test(x)));
  // 直式也能甩鏡（畫布寬 1080）、斜躺擺平（消失點對準上半的面板中心 540, 570）
  const wt = mediaParts({ ...a.it, enterFx: 'tilt', exitFx: 'whip', pipIds: [] }, { nextTrack: (() => { let n = 10; return () => n++; })() });
  assert.match(wt.html, /class="mlayer" style="z-index:20;--cw:1080px;--ch:1920px;perspective:1800px;perspective-origin:540px 570px"/);
  assert.ok(wt.tl.some((x) => /tl\.fromTo\('#mgr-v01', \{ rotationX: 22/.test(x)) && wt.tl.some((x) => /\{ x: -1080, scaleX: 1\.15, filter: 'blur\(24px\)'/.test(x)));
  // 9:16 錄影、沒有講者面板（pip: false）：可見區伸到字幕區上方（y 1260），右側平台按鈕區要避開
  const b = run({ id: 'v02', type: 'media', src: 'assets/screen/直錄.mp4', pip: false,
    callouts: [{ at: '+0.5', until: '+3', box: [250, 500, 100, 60], text: '這一格', side: 'right' }] }, { panel: false });
  assert.deepEqual([b.it.media.geo.top, b.it.media.geo.height], [240, 1020]);
  assert.equal(b.r.json.view, undefined, '直的錄影不加 view');
  assert.equal(b.errs.length, 1);
  assert.match(b.errs[0], /callouts\[0\] 的卡片放 right 會.*壓到右側平台按鈕區（x 940–1080、y 840–1440）.*→ 改 "side": "(left|top|bottom)"（放得下）/);
  // 紅框推到講者面板上（cover 的下緣）→ ⚠ 壓到下半的講者面板
  const c = run({ id: 'v03', type: 'media', src: 'assets/screen/橫錄.mp4', fit: 'cover', marks: [{ at: '+0.5', until: '+2', box: [400, 700, 200, 20] }] });
  assert.ok(c.warns.some((x) => /marks\[0\] 壓到下半的講者面板（畫面 y > 900）→/.test(x)), c.warns.join('\n'));
});

test('kit/media.js 放大鏡：補間目標是 canvas 元素（目標是普通物件時 HyperFrames renderSeek 後畫面不再更新）；任何 seek 都畫對那一格', async () => {
  const vm = await import('node:vm');
  const drawn = [];
  const cv = { getContext: () => ({ drawImage: (im) => drawn.push(im.n) }), width: 10, height: 10 };
  const imgs = [0, 1, 2].map((n) => ({ n, complete: true, naturalWidth: 10, addEventListener() {} }));
  const calls = [];
  const tl = { fromTo: (target, from, to, at) => calls.push({ target, from, to, at }) };
  const ctx = { window: {}, document: { querySelector: () => cv, querySelectorAll: () => imgs } };
  vm.runInNewContext(fs.readFileSync(path.join(TEMPLATE, 'kit', 'media.js'), 'utf8'), ctx);
  ctx.window.MediaKit.lens(tl, '#c', '#s img', [0, 0, 1, 2], 5, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, cv, '補間目標要是 canvas 元素，不能是普通物件');
  assert.deepEqual([calls[0].from.lensFrame, calls[0].to.lensFrame, calls[0].at], [0, 4, 5]);
  for (const f of [3.5, 0.2, 2.1]) cv.lensFrame = f;   // 亂序 seek：每次都畫那一格的圖
  assert.deepEqual(drawn, [2, 0, 1]);
});

test('字幕斷行：沒有標點時斷在詞的邊界，不切詞、不切英文、不切引號', async () => {
  const M2 = await import(path.join(TOOLS, 'media.mjs'));
  const parts = (text, max = 18) => M2.splitRow({ text, start: 0, end: 5, chars: [], ok: true }, max).map((p) => p.text);
  for (const [text, bad] of [
    ['代表 AI 會自己判斷哪些動作需要你的授權並且直接執行其他動作', /動$/],
    ['你可以看到 AI 已經照剛剛的清單剪掉了六段影片也少了十五秒', /剛$/],
    ['現在 AI 大幅降低了剪輯的成本和能力門檻只要白話文就能開始', /剪$/],
    ['然後在「Select folder」選擇「Add new project」這個按鈕', /「$/],
    ['選我們剛剛下載下來的 auto-edit-workspace 這個資料夾來開始使用', /-$/],
    ['所以專案裡還有我根據自己習慣設計的 9 支剪片 Skill', /\d$/],
    ['我最常請 AI 把每一段動畫的最後一格截圖整理成網頁給我看', /每$/],
    ['其中最重要的是 HyperFrames 跟 auto-editor 這兩個開源工具', /跟$/],
    ['接著要把我放在 GitHub 上的 AI 剪輯工作流', /GitHub$/],
  ]) {
    const got = parts(text);
    assert.ok(got.length >= 2, text);
    for (const p of got.slice(0, -1)) assert.doesNotMatch(p, bad, `${text} → ${got.join('／')}`);
    assert.equal(got.join(''), text);
  }
  assert.ok(!/^的/.test(parts('現在 AI 大幅降低了剪輯的成本和能力門檻')[1]), '不要斷成「…剪輯／的成本」');
  // 標點斷太偏：一邊只有兩個字又放不下另一邊，改斷詞邊界
  const c = parts('未來，我會分享更多 AI 工具的應用技巧與注意事項');
  assert.equal(c.length, 2, c.join('／'));
  assert.ok(c[0].length > 4, c.join('／'));
});

test('media --help：預設只印指令清單，一條指令的說明另外查（省模型額度）', () => {
  const h = (...a) => spawnSync(process.execPath, [MEDIA, ...a], { encoding: 'utf8' }).stdout;
  const short = h('--help'), full = h('--help', '--all');
  assert.ok(short.length < full.length / 2, `${short.length} vs ${full.length}`);
  assert.match(short, /media\.mjs srt-align/);
  assert.match(short, /--help --all/);
  const one = h('srt-align', '--help');
  assert.match(one, /srt-align/);
  assert.doesNotMatch(one, /ng-snap --project/, '只印那一條');
});

test('frame --box：解析與錯誤訊息', () => {
  assert.deepEqual(MEDIA_LIB_FRAMES.parseBoxes('10,20,30,40;1,2,3,4'), [[10, 20, 30, 40], [1, 2, 3, 4]]);
  assert.deepEqual(MEDIA_LIB_FRAMES.parseBoxes(null), []);
  assert.throws(() => MEDIA_LIB_FRAMES.parseBoxes('10,20,30'), /--box 要寫 "x,y,w,h"/);
});

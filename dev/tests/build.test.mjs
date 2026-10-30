// build.mjs 端到端（不 render）：產生專案、雜湊保護、--check、--test、CRLF 字幕、舊檔清理、--list、--gallery
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { TOOLS, TEMPLATE, makeSrt, imp } from './helpers.mjs';

const BUILD = path.join(TOOLS, 'build.mjs');
const { verifyHash } = await imp('lib/assemble.mjs');
let dir, work, out, sfxDir;

const node = (...args) => spawnSync(process.execPath, [BUILD, '--template', TEMPLATE, '--plan', path.join(out, 'plan.json'), '--srt', path.join(work, 'rough.srt'), '--video', path.join(work, 'rough.mp4'), '--out', out, '--sfx', sfxDir, ...args], { encoding: 'utf8' });
const writePlan = (scenes) => fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, speakerBox: [700, 200, 1220, 1000], scenes }, null, 2));
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');

const SCENES = [
  { id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '**場地設定**：一份文件' } },
  { id: 's02', scene: 'side-panel', from: '#5', to: '#7e', slots: { title: '拍完之後', items: ['初剪', '轉字幕', '校對'] } },
  { id: 's03', scene: 'fs-list', from: '#9', to: '#10e', slots: { title: '清單', items: ['一', '二', '三'] } },
  { id: 's04', type: 'fx', fx: 29, from: '#12', to: '#12e', vars: { number: '18', label: '字' } },
];

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-build-'));
  work = path.join(dir, 'work');
  out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  // 完整的 12 個音效檔（內容用 pop.wav 代替，只測檔案在不在）
  sfxDir = path.join(dir, 'sfx');
  fs.mkdirSync(sfxDir);
  for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'pop.wav'), path.join(sfxDir, `${n}.wav`));
  // 44 秒的小影片（25fps、關鍵幀稀疏），build 會重新編碼成 30fps、每秒一個關鍵幀
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '44', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '250', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(r.status, 0, String(r.stderr));
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 12, eol: '\r\n' }));   // Windows 換行
  writePlan(SCENES);
});

test('--check 不寫檔，通過時 exit 0；有錯時 exit 1 並印出修改建議', () => {
  const r = node('--check');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /通過：4 段/);
  assert.ok(!fs.existsSync(path.join(out, 'index.html')));
  writePlan([{ id: 's01', scene: 'concept', from: '#2', slots: { text: '一'.repeat(30) } }]);
  const bad = node('--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✖ \[s01 concept\] slots\.text（正文）：.*30 字，上限 24 → 縮成 24 字以內/);
  writePlan(SCENES);
});

test('產生專案：CRLF 字幕、底片重新編碼、kit／音效／字卡動態都複製、檔案結構正確', () => {
  const r = node();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of ['index.html', 'hyperframes.json', 'meta.json', '.build-manifest.json', 'assets/rough.mp4', 'assets/sfx/pop.wav', 'kit/gsap.min.js', 'kit/fonts/NotoSansTC-VF.woff2',
    'compositions/s01-concept.html', 'compositions/s02-side-panel.html', 'compositions/s03-fs-list.html', 'compositions/fx-29-odometer.html', 'compositions/fx-kit.js', 'compositions/captions.html']) {
    assert.ok(fs.existsSync(path.join(out, f)), `少了 ${f}`);
  }
  assert.ok(!fs.existsSync(path.join(out, 'kit', 'icons.json')), 'icons.json 不用複製');
  const cap = read('compositions/captions.html');
  assert.equal((cap.match(/class="cg"/g) || []).length, 12, 'CRLF 的 12 句都要讀到');
  assert.match(cap, /id="cg-1" style="opacity:0;visibility:hidden"><span>第 1 句字幕內容<\/span>/);
  assert.match(cap, /data-layout-allow-caption-zone/);
  // 重新編碼：30fps、每秒一個關鍵幀
  const p = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', path.join(out, 'assets', 'rough.mp4')], { encoding: 'utf8' });
  assert.equal(p.stdout.trim(), '30/1');
  const k = spawnSync('ffprobe', ['-v', 'error', '-skip_frame', 'nokey', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', path.join(out, 'assets', 'rough.mp4')], { encoding: 'utf8' });
  const keys = k.stdout.trim().split('\n').map(Number);
  assert.ok(keys.length >= 43, `關鍵幀太少：${keys.length}`);
  // root 長度＝底片長度往下對齊 1/30
  assert.match(read('index.html'), /data-composition-id="main" data-start="0" data-duration="44"/);
  assert.match(r.stdout, /s02｜03 半版側邊欄｜/);
});

test('雜湊保護：手改的產生檔不覆寫，--force 才覆寫；index.html 被改就整個停下來', () => {
  const f = path.join(out, 'compositions', 's01-concept.html');
  const orig = fs.readFileSync(f, 'utf8');
  assert.ok(verifyHash(orig).ok);
  fs.writeFileSync(f, orig.replace('left: 120px', 'left: 96px'));
  writePlan(SCENES.map((s) => (s.id === 's01' ? { ...s, slots: { text: '**場地設定**：改過的字' } } : s)));
  const r = node();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /被手改過，沒有覆寫：compositions\/s01-concept\.html/);
  assert.ok(fs.readFileSync(f, 'utf8').includes('left: 96px'));
  const r2 = node('--force');
  assert.equal(r2.status, 0);
  assert.ok(fs.readFileSync(f, 'utf8').includes('改過的字'));
  // index.html 被改
  fs.writeFileSync(path.join(out, 'index.html'), read('index.html').replace('z-index:20', 'z-index:21'));
  writePlan(SCENES);
  const r3 = node();
  assert.equal(r3.status, 1);
  assert.match(r3.stderr, /index\.html 被手改過.*plan\.json.*--force/);
  assert.equal(node('--force').status, 0);
});

test('Studio 開啟時蓋上的 data-hf-id 不算手改（preview 開著也能直接 build）', () => {
  let n = 0;
  const stamp = (f) => fs.writeFileSync(path.join(out, f), read(f).replace(/<(div|span|video|audio|img)(?=[\s>])/g, (m) => `${m} data-hf-id="hf-${(n++).toString(36)}"`));
  stamp('index.html'); stamp('compositions/s01-concept.html');
  assert.match(read('index.html'), /data-hf-id="hf-/);
  const r = node();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /被手改過/);
  assert.doesNotMatch(read('index.html'), /data-hf-id/);
});

test('AI 手寫的 compositions/x-*.html 不會被 build 動到；plan 拿掉的段，舊檔（沒手改）會刪掉', () => {
  const x = path.join(out, 'compositions', 'x-flow.html');
  fs.writeFileSync(x, '<!doctype html><html><body><template><div id="x-flow" data-composition-id="x-flow"></div><script>window.__timelines[\'x-flow\'] = gsap.timeline({ paused: true });</script></template></body></html>');
  writePlan([...SCENES.filter((s) => s.id !== 's03'), { id: 'x01', type: 'custom', src: 'compositions/x-flow.html', layout: 'overlay', from: '#9', to: '#10e' }]);
  const before = fs.readFileSync(x, 'utf8');
  const r = node();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fs.readFileSync(x, 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(out, 'compositions', 's03-fs-list.html')));
  assert.match(r.stdout, /刪掉舊檔 compositions\/s03-fs-list\.html/);
  assert.match(read('index.html'), /data-composition-id="x-flow" data-composition-src="compositions\/x-flow\.html"/);
  writePlan(SCENES);
  assert.equal(node().status, 0);
});

test('--test 產生 compositions/test-clip.html（不放專案根目錄，免得變成第二個 root）', () => {
  const r = node('--test', '15,6');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!fs.existsSync(path.join(out, 'test.html')));
  const t = read('compositions/test-clip.html');
  assert.match(t, /data-composition-id="test-clip" data-start="0" data-duration="6"/);
  assert.match(t, /data-media-start="15"/);
  assert.match(t, /id="el-s02"[^>]*\n\s+data-start="0" data-duration="6"/);   // #5 起點＝15，平移後＝0、截到片段尾
  assert.doesNotMatch(t, /el-s01|el-s03|el-s04/, '片段外的段不放進來');
  assert.match(read('compositions/captions-test.html'), /data-composition-id="captions-test"/);
  assert.match(r.stdout, /render -c compositions\/test-clip\.html --quality draft/);
  const bad = node('--test', '15');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--test 要寫成「起點,秒數」/);
});

test('--list 印出 18 情境＋40 字卡動態；--json 可解析', () => {
  const r = spawnSync(process.execPath, [BUILD, '--template', TEMPLATE, '--list'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\| 04a \| fs-list \| 全畫面清單 \|/);
  assert.match(r.stdout, /\| 29 \| 數字計數 \|/);
  const j = JSON.parse(spawnSync(process.execPath, [BUILD, '--template', TEMPLATE, '--list', '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(j.scenes.length, 18);
  assert.equal(j.fx.length, 40);
});

test('--gallery 產生 18 頁預覽（獨立頁，連 ../kit 與 ../bg.jpg）', async () => {
  const { runGallery } = await imp('build.mjs');
  const tdir = path.join(dir, 'tpl');
  fs.mkdirSync(tdir);
  for (const sub of ['kit', 'scenes']) fs.cpSync(path.join(TEMPLATE, sub), path.join(tdir, sub), { recursive: true });
  const r = runGallery(tdir);
  assert.deepEqual(r.problems, []);
  assert.equal(r.made.filter((f) => f.endsWith('.html')).length, 18);
  const side = fs.readFileSync(path.join(tdir, 'preview', '03-side-panel.html'), 'utf8');
  assert.match(side, /<link rel="stylesheet" href="\.\.\/kit\/fonts\.css">\n<link rel="stylesheet" href="\.\.\/kit\/brand\.css">\n<link rel="stylesheet" href="\.\.\/kit\/scene\.css">/);
  assert.match(side, /url\("\.\.\/bg\.jpg"\), var\(--sc-side-pattern\)/);
  assert.match(side, /repeat: -1, repeatDelay: 1\.2/);
  assert.match(side, /tl\.fromTo\('#footage', \{ x: 0 \}, \{ x: 480/);
  // 音效資料與重播協定
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(tdir, 'preview', 'sfx-data.js'), 'utf8'), sandbox);
  assert.equal(sandbox.window.__SFX_DATA.scenes.concept.main.sound, 'pop');
  assert.equal(sandbox.window.__SFX_DATA.scenes['side-panel'].extra.length, 3);
  assert.equal(Object.keys(sandbox.window.__SFX_DATA.sounds).length, 12);
  const concept = fs.readFileSync(path.join(tdir, 'preview', '06-concept.html'), 'utf8');
  assert.match(concept, /hf-preview-ready/);
  assert.match(concept, /hf-preview-replay/);
  assert.match(concept, /window\.__PREVIEW = \{"key":"concept","duration":\d+(\.\d+)?,"cues":\[\{"sound":"pop","at":0\.1\}\]\}/);
});

test('產生的 index.html：每個 cue 一個 <audio>（主 sfx-<id>、附加 sfx-<id>-e<n>），track-index 不重複', () => {
  assert.equal(node().status, 0);
  const html = read('index.html');
  const audios = [...html.matchAll(/<audio id="([^"]+)"[^>]*data-track-index="(\d+)"/g)];
  const ids = audios.map((m) => m[1]);
  // s01 concept：主 1；s02 side-panel：主 1＋tick 3；s03 fs-list：主 1＋tick 3；s04 fx 29 catalog 預設 ding：主 1
  assert.deepEqual(ids, ['sfx-s01', 'sfx-s02', 'sfx-s02-e1', 'sfx-s02-e2', 'sfx-s02-e3', 'sfx-s03', 'sfx-s03-e1', 'sfx-s03-e2', 'sfx-s03-e3', 'sfx-s04']);
  const tracks = audios.map((m) => m[2]);
  assert.equal(new Set(tracks).size, tracks.length);
  const tickVol = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')).tick.volume;
  const tickAudio = html.match(/<audio id="sfx-s02-e1" src="assets\/sfx\/tick\.wav"[^>]*data-volume="([\d.]+)"/);
  assert.ok(tickAudio, '附加 tick 的 <audio> 要存在');
  assert.equal(Number(tickAudio[1]), tickVol);
});

test('音效檔不存在：--check 與 build 都 ✖，訊息指出缺哪個檔', () => {
  const part = path.join(dir, 'sfx-part');
  fs.mkdirSync(part, { recursive: true });
  for (const n of ['pop', 'alert']) fs.copyFileSync(path.join(sfxDir, `${n}.wav`), path.join(part, `${n}.wav`));
  writePlan([{ id: 's02', scene: 'side-panel', from: '#5', to: '#7e', slots: { title: '拍完之後', items: ['初剪', '轉字幕', '校對'] } }]);
  const r = node('--check', '--sfx', part);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✖ \[s02 side-panel\] 音效檔 shared\/sfx\/swipe\.wav 不存在 → shared\/sfx\/ 要有完整的 12 個檔/);
  assert.match(r.stdout, /音效檔 shared\/sfx\/tick\.wav 不存在/);
  writePlan(SCENES);
});

test('--list --json：sounds 在最前面、沒有重複的 sfx key，每顆有 file／exists', () => {
  const j = JSON.parse(spawnSync(process.execPath, [BUILD, '--template', TEMPLATE, '--sfx', sfxDir, '--list', '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(Object.keys(j)[0], 'sounds');
  assert.ok(!('sfx' in j));
  assert.equal(j.sounds.pop.file, 'shared/sfx/pop.wav');
  assert.equal(j.sounds.pop.exists, true);
  const j2 = JSON.parse(spawnSync(process.execPath, [BUILD, '--template', TEMPLATE, '--sfx', path.join(dir, 'nope'), '--list', '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(j2.sounds.pop.exists, false);
});

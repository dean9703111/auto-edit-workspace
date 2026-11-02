// build.mjs 端到端（不 render）：產生專案、雜湊保護、--check、--test、CRLF 字幕、舊檔清理、--list、--gallery
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
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
  // 完整的音效檔（內容用 ding.wav 代替，只測檔案在不在）
  sfxDir = path.join(dir, 'sfx');
  fs.mkdirSync(sfxDir);
  for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'ding.wav'), path.join(sfxDir, `${n}.wav`));
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
  for (const f of ['index.html', 'hyperframes.json', 'meta.json', '.build-manifest.json', 'assets/rough.mp4', 'assets/sfx/ding.wav', 'kit/gsap.min.js', 'kit/fonts/NotoSansTC-VF.woff2',
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
  // 2026-11-02 起 02–06、08、10–13 版型預設不配；09 qa 只有答案 ding（×0.8）
  assert.equal(sandbox.window.__SFX_DATA.scenes.concept.main, null);
  assert.equal(sandbox.window.__SFX_DATA.scenes['side-panel'].extra.length, 0);
  assert.equal(sandbox.window.__SFX_DATA.scenes.qa.extra.map((c) => c.sound).join(), 'ding');
  assert.equal(Object.keys(sandbox.window.__SFX_DATA.sounds).length, Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8'))).length);
  const concept = fs.readFileSync(path.join(tdir, 'preview', '06-concept.html'), 'utf8');
  assert.match(concept, /hf-preview-ready/);
  assert.match(concept, /hf-preview-replay/);
  assert.match(concept, /window\.__PREVIEW = \{"key":"concept","duration":\d+(\.\d+)?,"cues":\[\]\}/);
  const qa = fs.readFileSync(path.join(tdir, 'preview', '09-qa.html'), 'utf8');
  assert.match(qa, /window\.__PREVIEW = \{"key":"qa","duration":\d+(\.\d+)?,"cues":\[\{"sound":"ding","at":1\.9,"volume":0\.8\}\]\}/);
});

test('--gallery 直式（009 FR-073）：每支 custom 另出 x-<名稱>-v.html（1080×1920）；speaker.jpg 裁出 speaker-v.jpg（1080×1920，比 speaker.jpg 新就不重做）；橫式頁不變', async () => {
  const { runGallery } = await imp('build.mjs');
  const tdir = path.join(dir, 'tpl-v');
  for (const sub of ['kit', 'scenes']) fs.cpSync(path.join(TEMPLATE, sub), path.join(tdir, sub), { recursive: true });
  fs.mkdirSync(path.join(tdir, 'custom')); fs.mkdirSync(path.join(tdir, 'preview'));
  fs.copyFileSync(path.join(TEMPLATE, 'custom', 'x-process.html'), path.join(tdir, 'custom', 'x-process.html'));
  fs.copyFileSync(path.join(TEMPLATE, 'preview', 'speaker.jpg'), path.join(tdir, 'preview', 'speaker.jpg'));
  const r = runGallery(tdir, { only: ['x-process'] });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.made.map((f) => path.basename(f)), ['x-process.html', 'x-process-v.html', 'speaker-v.jpg']);
  const v = fs.readFileSync(path.join(tdir, 'preview', 'x-process-v.html'), 'utf8');
  assert.ok(v.includes('speaker-v.jpg') && v.includes('window.__regions'));
  assert.ok(v.includes('#stage { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px;') && v.includes('scale(0.8475)'));
  const land = fs.readFileSync(path.join(tdir, 'preview', 'x-process.html'), 'utf8');
  assert.equal(land, fs.readFileSync(path.join(TEMPLATE, 'preview', 'x-process.html'), 'utf8'), '橫式預覽頁和 shared/template/preview 的一樣');
  const dims = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(tdir, 'preview', 'speaker-v.jpg')], { encoding: 'utf8' }).stdout.trim();
  assert.equal(dims, '1080,1920');
  assert.deepEqual(runGallery(tdir, { only: ['x-process'] }).made.map((f) => path.basename(f)), ['x-process.html', 'x-process-v.html'], '第二次不重做 speaker-v.jpg');
  // 暗色主題的書櫃版 speaker-dark.jpg 同樣裁出 speaker-v-dark.jpg
  fs.copyFileSync(path.join(TEMPLATE, 'preview', 'speaker-dark.jpg'), path.join(tdir, 'preview', 'speaker-dark.jpg'));
  assert.deepEqual(runGallery(tdir, { only: ['x-process'] }).made.map((f) => path.basename(f)), ['x-process.html', 'x-process-v.html', 'speaker-v-dark.jpg']);
  const dimsDark = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(tdir, 'preview', 'speaker-v-dark.jpg')], { encoding: 'utf8' }).stdout.trim();
  assert.equal(dimsDark, '1080,1920');
});

test('產生的 index.html：每個 cue 一個 <audio>（主 sfx-<id>、附加 sfx-<id>-e<n>），track-index 不重複', () => {
  // s01、s02 自己寫主音效；s03 換成 09 qa（版型預設只有答案 ding 一顆附加）
  writePlan([{ ...SCENES[0], sfx: 'ding' }, { ...SCENES[1], sfx: 'impact' }, { id: 's03', scene: 'qa', from: '#9', to: '#10e', slots: { q: '可以直接上傳嗎？', a: '不行' } }, SCENES[3]]);
  assert.equal(node().status, 0);
  const html = read('index.html');
  const audios = [...html.matchAll(/<audio id="([^"]+)"[^>]*data-track-index="(\d+)"/g)];
  const ids = audios.map((m) => m[1]);
  // s01 concept：主 1；s02 side-panel：主 1；s03 qa：附加 ding 1；s04 fx 29 catalog 預設 ding：主 1
  assert.deepEqual(ids, ['sfx-s01', 'sfx-s02', 'sfx-s03-e1', 'sfx-s04']);
  const tracks = audios.map((m) => m[2]);
  assert.equal(new Set(tracks).size, tracks.length);
  const dingVol = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')).ding.volume;
  const extraAudio = html.match(/<audio id="sfx-s03-e1" src="assets\/sfx\/ding\.wav"[^>]*data-volume="([\d.]+)"/);
  assert.ok(extraAudio, '附加 ding 的 <audio> 要存在');
  assert.equal(Number(extraAudio[1]), Math.round(dingVol * 0.8 * 100) / 100, 'qa 答案 ding 音量＝kit 音量×0.8（取兩位）');
  writePlan(SCENES);
});

test('音效檔不存在：--check 與 build 都 ✖，訊息指出缺哪個檔', () => {
  const part = path.join(dir, 'sfx-part');
  fs.mkdirSync(part, { recursive: true });
  for (const n of ['alert']) fs.copyFileSync(path.join(sfxDir, `${n}.wav`), path.join(part, `${n}.wav`));
  writePlan([{ id: 's02', scene: 'side-panel', from: '#5', to: '#7e', sfx: 'impact', slots: { title: '拍完之後', items: ['初剪', '轉字幕', '校對'] } },
    { id: 's03', scene: 'qa', from: '#9', to: '#10e', slots: { q: '可以直接上傳嗎？', a: '不行' } }]);
  const r = node('--check', '--sfx', part);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✖ \[s02 side-panel\] 音效檔 shared\/sfx\/impact\.wav 不存在 → shared\/sfx\/ 要有完整的 \d+ 個檔/);
  assert.match(r.stdout, /音效檔 shared\/sfx\/ding\.wav 不存在/);
  writePlan(SCENES);
});

test('--list --json：sounds 在最前面、沒有重複的 sfx key，每顆有 file／exists', () => {
  const j = JSON.parse(spawnSync(process.execPath, [BUILD, '--template', TEMPLATE, '--sfx', sfxDir, '--list', '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(Object.keys(j)[0], 'sounds');
  assert.ok(!('sfx' in j));
  assert.equal(j.sounds.ding.file, 'shared/sfx/ding.wav');
  assert.equal(j.sounds.ding.exists, true);
  const j2 = JSON.parse(spawnSync(process.execPath, [BUILD, '--template', TEMPLATE, '--sfx', path.join(dir, 'nope'), '--list', '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(j2.sounds.ding.exists, false);
});

// ---------- 002 pipeline-timing ----------
const writePlanX = (obj) => fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, speakerBox: [700, 200, 1220, 1000], ...obj }, null, 2));

test('--check --json schema 2：必有的鍵與型別；planHash 跟著 plan.json 的位元組變；build 後寫進 .build-manifest.json', () => {
  writePlan(SCENES);
  const r = node('--check', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(j), ['schema', 'ok', 'errors', 'warnings', 'planHash', 'rhythm', 'theme', 'format', 'canvas', 'formatSource', 'versions', 'videoDur', 'outputDur', 'voiceOnly', 'roughBlack', 'voiceUncovered', 'uncovered', 'cutpoints', 'chapters', 'items', 'sfxCount', 'sfxBudget', 'outro', 'edit', 'paths']);
  assert.equal(j.schema, 2);
  assert.equal(j.theme, 'light');
  assert.match(j.planHash, /^[0-9a-f]{8}$/);
  assert.equal(j.rhythm, 'continuous');
  assert.deepEqual(Object.keys(j.versions.hyperframes), ['pinned', 'installed', 'ok']);
  assert.ok(Array.isArray(j.uncovered) && j.uncovered.every((u) => ['start', 'end', 'outStart', 'outEnd', 'len'].every((k) => typeof u[k] === 'number')));
  assert.deepEqual(Object.keys(j.sfxBudget), ['perMinuteAvg', 'over', 'dense', 'loud']);
  assert.equal(j.sfxCount.ding, 1);   // 只有 s04 fx 29 的 catalog 預設 ding（版型預設 2026-11-02 起不配）
  assert.equal(j.outro, null);
  for (const it of j.items) {
    for (const k of ['id', 'type', 'label', 'key', 'family', 'layout', 'layoutZh', 'opaque', 'start', 'end', 'sfx', 'warnings', 'out']) assert.ok(k in it, `${it.id} 少 ${k}`);
    assert.deepEqual(Object.keys(it.out), ['start', 'end', 'lists', 'annotations', 'pip', 'wipe', 'refs', 'tx']);
  }
  const s02 = j.items.find((x) => x.id === 's02'), s03 = j.items.find((x) => x.id === 's03');
  assert.deepEqual([s02.key, s02.family, s02.layout, s02.layoutZh], ['03-side-panel', 'panel', 'side', '半畫面']);
  assert.deepEqual([s03.layout, s03.out.pip.length], ['pip', 1]);
  assert.equal(s02.out.lists.length, 3);
  // plan.json 加一個空白 → planHash 變；build 後 manifest 的 planHash 和 --check 相同
  fs.appendFileSync(path.join(out, 'plan.json'), ' ');
  const j2 = JSON.parse(node('--check', '--json').stdout);
  assert.notEqual(j2.planHash, j.planHash);
  assert.equal(node().status, 0);
  assert.equal(JSON.parse(read('.build-manifest.json')).planHash, j2.planHash);
  writePlan(SCENES);
});

test('--check --json 出錯時（plan.json 不存在）也印齊 schema 2 的鍵、結束碼 1', () => {
  const r = spawnSync(process.execPath, [BUILD, '--template', TEMPLATE, '--plan', path.join(dir, 'nope.json'), '--srt', path.join(work, 'rough.srt'), '--video', path.join(work, 'rough.mp4'), '--out', out, '--check', '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(j), ['schema', 'ok', 'errors', 'warnings', 'planHash', 'rhythm', 'theme', 'format', 'canvas', 'formatSource', 'versions', 'videoDur', 'outputDur', 'voiceOnly', 'roughBlack', 'voiceUncovered', 'uncovered', 'cutpoints', 'chapters', 'items', 'sfxCount', 'sfxBudget', 'outro', 'edit', 'paths']);
  assert.equal(j.ok, false);
});

test('版本行：版式行（009 FR-003；沒有專案時第一行）的下一行印 HyperFrames 版本；工作區根目錄沒有 package.json 時 ⚠', () => {
  const r = node('--check');
  assert.equal(r.stdout.split('\n')[0], '版式：橫式 1920×1080（來源：預設）');
  const pinned = JSON.parse(fs.readFileSync(path.join(TEMPLATE, '..', '..', 'package.json'), 'utf8')).devDependencies.hyperframes;
  assert.ok(r.stdout.split('\n')[1] === `HyperFrames ${pinned}（package.json 釘 ${pinned}）` || r.stdout.split('\n')[1].startsWith('⚠ '), r.stdout.split('\n')[1]);
  const fake = path.join(dir, 'ws', 'shared', 'template');
  fs.mkdirSync(path.dirname(fake), { recursive: true });
  if (!fs.existsSync(fake)) fs.symlinkSync(TEMPLATE, fake, 'dir');
  const r2 = spawnSync(process.execPath, [BUILD, '--template', fake, '--plan', path.join(out, 'plan.json'), '--srt', path.join(work, 'rough.srt'), '--video', path.join(work, 'rough.mp4'), '--out', out, '--sfx', sfxDir, '--check'], { encoding: 'utf8' });
  assert.equal(r2.stdout.split('\n')[1], '⚠ 工作區根目錄沒有 package.json，HyperFrames 版本沒有釘住 → 照 setup/ 的手冊補上再跑 npm install');
});

test('示意插圖（specs/contracts/illus.md §5.1）：主合成與 custom 預覽頁載 illus.css（scene.css 後）、illus.js（scene-motion.js 後）；kit 只複製 illus.js／illus.css，不帶畫廊與風格說明', async () => {
  writePlan(SCENES);
  const r = node();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = read('index.html');
  const at = (s) => { const i = html.indexOf(s); assert.ok(i > 0, `index.html 沒有 ${s}`); return i; };
  assert.ok(at('href="kit/scene.css"') < at('href="kit/illus.css"') && at('href="kit/illus.css"') < at('href="kit/theme.css"'));
  assert.ok(at('src="kit/gsap.min.js"') < at('src="kit/scene-motion.js"') && at('src="kit/scene-motion.js"') < at('src="kit/illus.js"'));
  for (const f of ['illus.js', 'illus.css']) assert.ok(fs.existsSync(path.join(out, 'kit', f)), `kit/${f} 要複製`);
  for (const f of ['illus-gallery.html', 'illus-gallery.jpg', 'illus-style.md']) assert.ok(!fs.existsSync(path.join(out, 'kit', f)), `kit/${f} 不該進專案`);
  const { buildCustomPreview } = await import(path.join(TEMPLATE, 'tools', 'lib', 'custom-preview.mjs'));
  const { KIT_LINKS } = await import(path.join(TEMPLATE, 'tools', 'lib', 'main.mjs'));
  const pv = buildCustomPreview({ name: 'x-a', html: '<template id="x-a-template"><div id="x-a"></div></template>', kitLinks: KIT_LINKS });
  assert.ok(pv.indexOf('href="../kit/scene.css"') < pv.indexOf('href="../kit/illus.css"'));
  assert.ok(pv.indexOf('src="../kit/scene-motion.js"') < pv.indexOf('src="../kit/illus.js"'));
});

test('片尾離場：最後一段 to＝片長 → 淡出 0.5 秒、片尾前一格做完，沒有色帶收回；中間的全畫面段照舊色帶收回', () => {
  const last = { id: 's05', scene: 'fs-list', from: '#12', to: 44, slots: { title: '收尾', items: ['一', '二', '三'] } };
  writePlan([...SCENES.filter((x) => x.id !== 's04'), last]);
  const chk = node('--check', '--json');
  const tx = Object.fromEntries(JSON.parse(chk.stdout).items.map((x) => [x.id, x.out.tx.out]));
  assert.equal(tx.s03, 'retract');
  assert.equal(tx.s05, 'fade');
  const r = node();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = read('index.html');
  assert.match(html, /tl\.fromTo\('#el-s03', \{ clipPath: 'inset\(0% 0% 0% 0%\)' \}, \{ clipPath: 'inset\(0% 0% 0% 110\.4%\)'/, '中間段照舊收回');
  assert.doesNotMatch(html, /tl\.fromTo\('#el-s05', \{ clipPath: 'inset\(0% 0% 0% 0%\)' \}/, '最後一段不擦出');
  // 44 − 1/30 − 0.5 ＝ 43.467：最後一格（43.967）已經淡完
  assert.match(html, /tl\.to\('#el-s05[^']*', \{ opacity: 0, duration: 0\.5, ease: 'sine\.in' \}, 43\.467\);/);
  const bandsAfter = [...html.matchAll(/tl\.fromTo\('#tx\d+[ab]', \{ x: -?\d+ \}, \{ x: -?\d+, duration: [\d.]+, ease: 'expo\.inOut' \}, ([\d.]+)\);/g)].filter((m) => +m[1] > 40);
  assert.deepEqual(bandsAfter.map((m) => m[0]), [], '片尾沒有色帶');
  writePlan(SCENES);
});

test('custom 段：index.html 的 head 有 window.__cues（在 scene-motion.js 之前、JSON 可解析、< 跳脫）；沒有 custom 時沒有', () => {
  const x = path.join(out, 'compositions', 'x-flow.html');
  fs.writeFileSync(x, `<!doctype html><html><body><template><div id="x-flow" data-composition-id="x-flow"></div><script>P.at('#10'); window.__timelines['x-flow'] = gsap.timeline({ paused: true });</script></template></body></html>`);
  writePlan(SCENES);
  assert.equal(node().status, 0);
  assert.ok(!read('index.html').includes('window.__cues'));
  writePlan([...SCENES.filter((s) => s.id !== 's03'), { id: 'x01', type: 'custom', src: 'compositions/x-flow.html', layout: 'overlay', from: '#9', to: '#10e' }]);
  const r = node('--test', '29,6');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = read('index.html');
  const m = html.match(/  <script>window\.__cues = (.*);<\/script>\n  <script src="kit\/scene-motion\.js"><\/script>/);
  assert.ok(m, 'head 有 window.__cues 而且在 scene-motion.js 前一行');
  assert.ok(!m[1].includes('<'));
  const c = JSON.parse(m[1]);
  assert.equal(c.v, 1);
  assert.deepEqual(c.cues['9'], [29, 32]);
  assert.deepEqual(c.segs.x01, { comp: 'x-flow', start: 29, D: 6.5, prev: 'speaker', refs: { '#10': 32.5 } });
  // --test 41 起：全部平移
  const t = read('compositions/test-clip.html').match(/window\.__cues = (.*);<\/script>/);
  assert.deepEqual(JSON.parse(t[1]).segs.x01.refs, { '#10': 3.5 });
  assert.equal(JSON.parse(t[1]).segs.x01.D, 6.5, 'test-clip 的 D 是段長，不是截短後的長度（A-12）');
  assert.match(r.stdout, /綁句 1 個（#10）/);
  writePlan(SCENES);
  assert.equal(node().status, 0);
});

test('章節：captions.html 在章節 2.5 s 內沒有字幕；chapters 進 JSON；結尾配樂 <audio id="bgm-outro">（outro 寫 music 才配，build 印出處）', () => {
  const scenesC = [...SCENES, { id: 'c1', scene: 'chapter', at: '#8', slots: { num: '01', title: '章' } }].filter((s) => s.id !== 's03');
  writePlanX({ scenes: scenesC, outro: { from: '#11' } });
  assert.equal(JSON.parse(node('--check', '--json').stdout).outro, null, 'outro 沒寫 music＝不配');
  writePlanX({ scenes: scenesC, outro: { from: '#11', music: 'bgm-cylinder-five' } });
  const j = JSON.parse(node('--check', '--json').stdout);
  assert.deepEqual(j.errors, []);
  assert.deepEqual(j.chapters.map((c) => [c.id, c.cue, c.placement, c.captionsClipped]), [['c1', 8, 'cover', [8]]]);
  assert.equal(j.outro.music, 'bgm-cylinder-five');
  const r = node();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // #8 是 25.5–28.5，章節 25.5–28.0 → #8 只在 28.0 出現
  const cap = read('compositions/captions.html');
  assert.match(cap, /tl\.set\('#cg-8', \{ opacity: 1, visibility: 'visible' \}, 28\);/);
  assert.match(r.stdout, /字幕避開章節：#8 晚 2\.50s 出現/);
  const html = read('index.html');
  const a = html.match(/<audio id="bgm-outro" src="(assets\/bgm-cylinder-five-[0-9a-f]{12}\.wav)" data-start="([\d.]+)" data-duration="([\d.]+)" data-track-index="\d+" data-volume="1"><\/audio>/);
  assert.ok(a, '有結尾配樂');
  assert.ok(fs.existsSync(path.join(out, a[1])));
  assert.match(r.stdout, /結尾配樂：bgm-cylinder-five .*這首要在影片說明欄標示出處：Music: "Cylinder Five" by Chris Zabriskie/);
  assert.match(r.stdout, /音效比例：/);
  writePlan(SCENES);
  assert.equal(node().status, 0);
});

test('--list 音效行：不列配樂、標附加與每集上限；另起一行結尾配樂', () => {
  const r = spawnSync(process.execPath, [BUILD, '--template', TEMPLATE, '--list'], { encoding: 'utf8' });
  const line = r.stdout.split('\n').find((l) => l.startsWith('# 音效（"sfx"）'));
  assert.ok(!line.includes('bgm-cylinder-five'));
  assert.match(line, /click（[^）]*，附加）/);
  assert.match(line, /thunder（[^）]*，每集 ≤ 3）/);
  assert.match(r.stdout, /\n結尾配樂（plan\.json "outro"）：bgm-cylinder-five\n/);
});

test('check.textSync false：示意 plan（--plan 指到別處）不提醒；寫在專案正式的 work/hyperframes/plan.json 就 ⚠', async () => {
  const { textSyncOffWarnings } = await imp('build.mjs');
  const project = path.join(os.tmpdir(), 'p-ts');
  const off = { check: { textSync: false } };
  assert.deepEqual(textSyncOffWarnings({ project, plan: path.join(project, 'work', '.framing-preview', 'plan-z100.json') }, off), []);
  assert.deepEqual(textSyncOffWarnings({ project, plan: path.join(project, 'work', 'hyperframes', 'plan.json') }, {}), []);
  assert.deepEqual(textSyncOffWarnings({ project, plan: path.join(project, 'work', 'hyperframes', 'plan.json') }, off),
    ['plan.json 寫了 "check": { "textSync": false }，這次沒檢查「文字對時」→ 這只給示意／預覽用的 plan；正式 plan.json 刪掉 check，照 --check 的「文字對時」改時間']);
});

test('F8 字幕樣式與提醒：76px 估寬（18 字 1442px、門檻 1840）、含「，。；：」⚠、不到 0.6 秒 ⚠；captions.css 是剪映的數字', async () => {
  const { captionWidth, captionWarnings, CAPTION } = await imp('lib/captions.mjs');
  assert.equal(captionWidth('一'.repeat(18)), 18 * 76 + 74);
  assert.equal(captionWidth('AI Coding'), 8 * 40 + 19 + 74);
  assert.equal(CAPTION.maxW, 1840);
  const w = captionWarnings([
    { n: 1, start: 0, end: 2, text: '嗨！大家好我是鼎淵' },
    { n: 2, start: 2, end: 4, text: '歡迎來到，工程師下班有約。' },
    { n: 3, start: 4, end: 4.4, text: '好' },
    { n: 4, start: 4.4, end: 7, text: '這一句超過十八個字一定要拆開來才可以放進畫面' },
  ]);
  assert.deepEqual(w, [
    '字幕 #4「這一句超過十八個字一定要拆開來才可以放進畫面」22 字，超過 18 字 → 在 rough.srt 拆成兩則（斷在標點處）',
    '字幕含句中標點「，。；：」：#2 → 字幕不顯示這四種標點（保留「、！？」），跑 media.mjs srt-align 或在剪輯台改',
    '字幕不到 0.6 秒：#3 → 在剪輯台和前後句合併，或把起迄拉長',
  ]);
  const css = fs.readFileSync(path.join(TEMPLATE, 'kit', 'captions.css'), 'utf8');
  for (const x of ['bottom: 6px', 'font-weight: 400', 'font-size: 76px', 'line-height: 71px', 'padding: 24px 37px 23px', 'rgba(0, 0, 0, 0.7)', 'border-radius: 0']) assert.ok(css.includes(x), x);
});

test('theme "dark"（fixture dev/tests/fixtures/theme-dark）：換 bg-*-dark.jpg、主合成與 build 產生的子合成 <html data-theme="dark">、--check --json 報 theme；build 不寫 plan.json；寫錯 ✖；換回亮色沒有 data-theme', () => {
  const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'theme-dark');
  const planFile = path.join(out, 'plan.json');
  fs.copyFileSync(path.join(FIX, 'plan.json'), planFile);
  const planBytes = fs.readFileSync(planFile);
  assert.equal(JSON.parse(node('--check', '--json').stdout).theme, 'dark');
  const r = node('--test', '40,3');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /主題：暗色.*bg-fs-dark\.jpg、bg-side-dark\.jpg、bg-ch-dark\.jpg/);
  const gen = ['index.html', 'compositions/s01-concept.html', 'compositions/s02-side-panel.html', 'compositions/s03-fs-list.html', 'compositions/fx-29-odometer.html', 'compositions/captions.html'];
  for (const f of [...gen, 'compositions/test-clip.html', 'compositions/captions-test.html']) assert.match(read(f), /<html data-theme="dark"[ >]/, f);
  for (const k of ['fs', 'side', 'ch']) {
    assert.ok(fs.existsSync(path.join(out, 'assets', `bg-${k}-dark.jpg`)), `少了 assets/bg-${k}-dark.jpg`);
    assert.ok(read('index.html').includes(`assets/bg-${k}-dark.jpg`), `index.html 沒用 bg-${k}-dark.jpg`);
  }
  // build 從不寫 plan.json：剪輯台（006）存的 theme 不會被蓋掉
  assert.deepEqual(fs.readFileSync(planFile), planBytes);
  fs.writeFileSync(planFile, JSON.stringify({ ...JSON.parse(planBytes), theme: 'black' }));
  const bad = node('--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✖ theme 只能是 "light"（預設，米白底、白卡）或 "dark"（石墨黑底、玻璃卡），現在是 "black"/);
  // 亮色（不寫 theme）：沒有 data-theme、用亮色背景
  writePlan(SCENES);
  assert.equal(node().status, 0);
  for (const f of gen) assert.doesNotMatch(read(f), /data-theme/, f);
  assert.ok(read('index.html').includes('assets/bg-fs.jpg') && !read('index.html').includes('-dark.jpg'));
});

test('P.sfx（motion.md §5）：情境動畫的音效拍點靜態解析成 <audio>（ref 秒數＋off − peak ＋1 格）、算進 --check 的音效次數；寫錯名稱／不是字面值 ✖；sfxExtra: false 關掉', () => {
  fs.mkdirSync(path.join(out, 'compositions'), { recursive: true });
  const comp = (body) => fs.writeFileSync(path.join(out, 'compositions', 'x-beat.html'), `<template id="x-beat-template"><div id="x-beat" data-composition-id="x-beat" data-width="1920" data-height="1080"></div>
<script>
  // 範例：P.sfx('impact', '#9') 是註解，不算
  const tl = gsap.timeline({ paused: true }); const P = SceneMotion(tl);
  ${body}
  window.__timelines["x-beat"] = tl;
</script></template>`);
  const seg = (extra = {}) => [{ id: 'x01', type: 'custom', src: 'compositions/x-beat.html', layout: 'overlay', from: '#3', to: '#4e', ...extra }];
  comp(`const T1 = P.sfx('ding', '#3', 0.2);\n  P.sfx("click", "#4+0.5");`);
  writePlan(seg());
  const j = JSON.parse(node('--check', '--json').stdout);
  assert.equal(j.ok, true, j.errors.join('\n'));
  const x = j.items.find((i) => i.id === 'x01');
  const frame = 1 / 30, peak = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8'));
  assert.deepEqual(x.sfx.map((c) => [c.name, c.at]), [['ding', +(8.2 - peak.ding.peak + frame).toFixed(3)], ['click', +(12 - peak.click.peak + frame).toFixed(3)]]);
  assert.deepEqual(x.out.refs, { '#3': 8, '#4+0.5': 12 }, 'P.sfx 的 ref 也預先算好（@詞 才不會在執行期出錯）');
  assert.equal(x.out.tx.prev, 'speaker');
  assert.equal(j.sfxCount.ding, 1);
  assert.equal(j.sfxCount.click, 1);
  const r = node();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const idx = read('index.html');
  assert.match(idx, new RegExp(`<audio id="sfx-x01-e1" src="assets/sfx/ding\\.wav" data-start="${x.sfx[0].at}" data-track-index="\\d+" data-volume="[\\d.]+"></audio>`));
  assert.match(idx, /<audio id="sfx-x01-e2" src="assets\/sfx\/click\.wav"/);
  // custom 段的 prev 也進 window.__cues.segs[id]（P 讀得到）
  assert.match(idx, /"x01":\{"comp":"x-beat","start":8,"D":6\.5,"prev":"speaker","refs":/);
  // sfxExtra: false：整段的拍點音效關掉
  writePlan(seg({ sfxExtra: false }));
  assert.deepEqual(JSON.parse(node('--check', '--json').stdout).items.find((i) => i.id === 'x01').sfx, []);
  // 名稱不在 sfx.json、參數不是字面值 → ✖
  comp(`P.sfx('boom', '#3');\n  const n = 'click'; P.sfx(n, '#4');`);
  writePlan(seg());
  const bad = node('--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✖ \[x01 custom\] src（compositions\/x-beat\.html）：P\.sfx\(n, '#4'\)：音效名與 ref 要寫成字串字面值、off 寫數字/);
  assert.match(bad.stdout, /✖ \[x01 custom\] compositions\/x-beat\.html 的 P\.sfx\('boom', '#3'\)：kit\/sfx\.json 沒有「boom」這顆音效 → 改成 ding、success/);
  writePlan(SCENES);
});

test('012：prefixIds 改寫 data-links（a>b、a-b，id 本身有「-」）與產生的線 id（<a>-<b>、<a>-<b>-head）；checkRefs 認得產生的線（情境模板才能用 data-links）', async () => {
  const { prefixIds, checkRefs } = await import(path.join(TEMPLATE, 'tools', 'lib', 'assemble.mjs'));
  const body = '<div id="n-1"></div><div id="n-2"></div><div id="n3"></div><svg id="ln" data-links="n-1>n-2 n-2-n3"></svg>';
  const timeline = "P.stroke('#n-1-n-2', 1); P.comet('#n-2-n3', 2); P.in('#n-1-n-2-head', 3); P.in('#n-1', 0);";
  const out = prefixIds({ style: '#n-1 { left: 0; }', body, timeline }, 's05-');
  assert.match(out.body, /data-links="s05-n-1>s05-n-2 s05-n-2-s05-n3"/);
  assert.equal(out.timeline, "P.stroke('#s05-n-1-s05-n-2', 1); P.comet('#s05-n-2-s05-n3', 2); P.in('#s05-n-1-s05-n-2-head', 3); P.in('#s05-n-1', 0);");
  assert.equal(out.style, '#s05-n-1 { left: 0; }');
  assert.deepEqual(checkRefs(out, 's05-root'), []);
  assert.deepEqual(checkRefs({ ...out, timeline: "P.stroke('#s05-n-1-s05-n3', 1);" }, 's05-root'), ['s05-n-1-s05-n3'], '沒有這條線照樣報');
});

test('直式（fixture dev/tests/fixtures/portrait，009 T002-V03–V06）：主合成 1080×1920、舞台縮放＋純色底、講者面板、角標左上、字幕帶、--check --json 新鍵、03 ✖、橫式 flag 蓋過', () => {
  const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'portrait');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-portrait-'));
  const w = path.join(d, 'work'), o = path.join(w, 'hyperframes');
  fs.mkdirSync(o, { recursive: true });
  const r0 = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=180x320:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '44', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(w, 'rough.mp4')]);
  assert.equal(r0.status, 0, String(r0.stderr));
  fs.writeFileSync(path.join(w, 'rough.srt'), makeSrt({ n: 12 }));
  const planFile = path.join(o, 'plan.json');
  fs.copyFileSync(path.join(FIX, 'plan.json'), planFile);
  const run = (...args) => spawnSync(process.execPath, [BUILD, '--template', TEMPLATE, '--plan', planFile, '--srt', path.join(w, 'rough.srt'), '--video', path.join(w, 'rough.mp4'), '--out', o, '--sfx', sfxDir, ...args], { encoding: 'utf8' });
  const rd = (f) => fs.readFileSync(path.join(o, f), 'utf8');
  // --check --json：format／canvas／formatSource；上下分割的 layoutZh
  const j = JSON.parse(run('--check', '--json').stdout);
  assert.deepEqual([j.format, j.canvas, j.formatSource, j.ok], ['portrait', [1080, 1920], 'plan', true], JSON.stringify(j.errors));
  assert.equal(j.items.find((x) => x.id === 's03').layoutZh, '上下分割');
  const r = run('--test', '18,4');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^版式：直式 1080×1920（來源：plan\.json）$/m);
  assert.match(r.stdout, /npx hyperframes check --caption-zone "x0=0;y0=0\.667;x1=1;y1=0\.74;severity=error"/);
  // FR-100：直式底片沒有 frame → 縮到 1080×1920 置中裁切（build 把 canvas 傳給 encodeFootagePolished）；快取鍵帶版式
  const dims = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(o, 'assets', 'rough.mp4')], { encoding: 'utf8' }).stdout.trim();
  assert.equal(dims, '1080,1920');
  assert.equal(JSON.parse(rd('.cache/footage-audio.json')).key.format, 'portrait');
  const html = rd('index.html');
  // FR-021：root、viewport、底片、字幕 host 都是 1080×1920；window.__regions 注入具名區域
  assert.match(html, /<meta name="viewport" content="width=1080, height=1920">/);
  assert.match(html, /id="main-root" data-composition-id="main" data-start="0" data-duration="44" data-width="1080" data-height="1920"/);
  assert.match(html, /#footage video \{ position: absolute; left: 0; top: 0; width: 1080px; height: 1920px;/);
  assert.match(html, /id="el-captions"[\s\S]*?data-width="1080" data-height="1920"/);
  const reg = JSON.parse(html.match(/<script>window\.__regions = (\{.*\});<\/script>/)[1]);
  assert.deepEqual(reg.pip, [0, 900, 1080, 1020]);
  assert.ok(html.indexOf('window.__regions') < html.indexOf('kit/scene-motion.js'), '區域要在 scene-motion.js 之前');
  // FR-022：04a 舞台縮放（transform 寫在 host 的 CSS、allow-overflow、子合成仍 1920×1080）＋整張畫布的純色底，進退場連底一起
  assert.match(html, /id="el-s03"[^>]*\n\s+data-start="18\.5" data-duration="6\.5" data-track-index="\d+" data-width="1920" data-height="1080" data-prev="speaker" data-layout-allow-overflow style="z-index:30; transform: translate\(-61\.7px, 129\.825px\) scale\(0\.8475\); transform-origin: 0 0;"/);
  assert.match(html, /<div id="bd-s03" class="clip" data-start="18\.5" data-duration="6\.5" data-track-index="\d+" style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:var\(--sc-fs-bg\);z-index:29"><\/div>/);
  assert.match(html, /tl\.fromTo\('#el-s03, #bd-s03', \{ clipPath: 'inset\(0% 0% 0% 110\.4%\)' \}/);
  assert.doesNotMatch(html, /tl\.(fromTo|to|set)\('#el-s03'[^)]*\{ (x|y|scale):/, 'GSAP 對舞台 host 只動 opacity／clip-path');
  // 色帶掃過 1080 寬、高 1920
  assert.match(html, /class="v2-tx v2-tx--a" style="left:0;transform:translateX\(1080px\);height:1920px"/);
  // 字卡動態 bg none：縮到 top 766、不墊底
  assert.match(html, /id="el-s05"[\s\S]*?data-width="1920" data-height="1080"[^>]*data-layout-allow-overflow style="z-index:50; transform: translate\(0px, 766px\) scale\(0\.5625\);/);
  assert.ok(!html.includes('id="bd-s05"'));
  // 疊加情境：host 與子合成都是 1080×1920，卡片在 x 60、bottom 680（@style-portrait）
  assert.match(html, /id="el-s01"[\s\S]*?data-width="1080" data-height="1920"/);
  const s01 = rd('compositions/s01-concept.html');
  assert.match(s01, /data-width="1080" data-height="1920"/);
  assert.match(s01, /#s01-gCard \{ left: 60px; bottom: 680px; \}/);
  // 12 關鍵詞：直式排法 free（data-layout-portrait），卡片帶內橫排
  const s06 = rd('compositions/s06-keywords.html');
  assert.match(s06, /id="s06-kwList" data-layout="free" data-gap="md"/);
  assert.ok(!s06.includes('data-layout-portrait'));
  assert.match(s06, /flex-direction: row; flex-wrap: wrap;/);
  // FR-025：講者面板 pip.box、上緣 6px 主色線、飛入讀 pip.box（彈出原點＝面板中心）
  assert.match(html, /\.pip \{ position: absolute; left: 0px; top: 900px; width: 1080px; height: 1020px; overflow: hidden; z-index: 40; \}/);
  assert.match(html, /id="pipf-s03" class="clip pip-frame"[^>]*\n\s+style="position:absolute;left:0px;top:897px;width:1080px;height:6px;background:var\(--brand\)"/);
  assert.match(html, /transformOrigin: '540px 1410px'/);
  assert.ok(!html.includes('kit/pip-frame.png'));
  // FR-024：常駐角標左上 y 250
  assert.match(html, /<div id="chb-1" class="sc-chtag" data-chapter-badge="[^"]+" style="left:60px;top:250px;z-index:25;opacity:0">/);
  // 字幕：root 1080×1920、data-format="portrait"（kit/captions.css 換位置）
  assert.match(rd('compositions/captions.html'), /data-width="1080" data-height="1920" data-format="portrait"/);
  // --test 的 root 也是直式
  assert.match(rd('compositions/test-clip.html'), /id="test-root" data-composition-id="test-clip" data-start="0" data-duration="4" data-width="1080" data-height="1920"/);
  // 03 側邊欄、05 兩側：直式 ✖ 並建議替代；sideShift ⚠
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  fs.writeFileSync(planFile, JSON.stringify({ ...plan, sideShift: 300, scenes: [...plan.scenes, { id: 's07', scene: 'side-panel', from: '#1', to: '#1e', slots: { title: '一', items: ['a', 'b'] } }] }));
  const bad = run('--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✖ \[s07 side-panel\] 直式不提供「半版側邊欄」（1080 寬放不下側邊欄）→ 改用 04a 全畫面條列（直式是上下分割）或 13 標題條列/);
  assert.match(bad.stdout, /⚠ 直式不用 sideShift（沒有半畫面）→ 刪掉這個欄位/);
  // --format landscape 蓋過 plan.json；直拍素材做橫式 ✖（FR-004）
  fs.writeFileSync(planFile, JSON.stringify(plan));
  const flip = run('--check', '--format', 'landscape');
  assert.match(flip.stdout, /^版式：橫式 1920×1080（來源：--format）$/m);
  assert.match(flip.stdout, /✖ 主軌是直的（180×320），版式是橫式 → plan\.json 第一層加 "format": "portrait"/);
  fs.rmSync(d, { recursive: true, force: true });
});

test('--capcut：每段一支透明底合成（沒有字幕、主軌聲音；半畫面段帶靜音底片）＋主軌合成；capcut.json／capcut.srt；之後一般 build 不刪', () => {
  writePlan(SCENES);
  const r = node('--capcut');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const cc = JSON.parse(read('capcut.json'));
  assert.deepEqual(cc.segs.map((s) => s.id), ['s01', 's02', 's03', 's04']);
  assert.deepEqual(cc.segs.map((s) => s.layoutZh), ['疊加', '半畫面', '子母畫面', '疊加'], 'fx 不寫 bg＝透明字卡動態，算疊加');
  assert.equal(cc.segs[1].footage, true);
  assert.equal(cc.main.file, 'compositions/capcut-main.html');
  const s01 = read('compositions/capcut-s01.html');
  assert.match(s01, /data-composition-id="capcut-s01" data-start="0"/);
  assert.match(s01, /background: transparent/);
  assert.doesNotMatch(s01, /el-captions|id="rough"|el-s02/, '只有這一段：沒有字幕、底片、其他段');
  const s02 = read('compositions/capcut-s02.html');
  assert.match(s02, /<video id="rough" [^>]*data-media-start="15"[^>]*\n\s+data-track-index="0" muted/, '半畫面段帶底片，但靜音');
  assert.doesNotMatch(s02, /data-has-audio/);
  assert.match(read('compositions/capcut-s03.html'), /<video id="pipv-s03"/, '子母畫面段帶講者小窗');
  const main = read('compositions/capcut-main.html');
  assert.match(main, /<video id="rough" [^>]*data-has-audio="true"/);
  assert.doesNotMatch(main, /el-s0\d|el-captions|id="sfx-/);
  const srt = fs.readFileSync(path.join(out, 'capcut.srt'), 'utf8');
  assert.equal((srt.match(/-->/g) || []).length, 12);
  assert.match(srt, /^1\n00:00:01,000 --> 00:00:04,000\n第 1 句字幕內容\n/);
  assert.equal(node().status, 0);
  assert.ok(fs.existsSync(path.join(out, 'compositions', 'capcut-s01.html')), '一般 build 不刪剪映素材的合成');
});

test('style（風格包）：主色、外框、背景用 styles/<名稱>/ 的；拿掉就換回 shared/template/ 的；名稱打錯 ✖', () => {
  const same = (a, b) => fs.readFileSync(a).equals(fs.readFileSync(b));
  const pack = path.join(TEMPLATE, 'styles', '藍圖');
  const planFile = path.join(out, 'plan.json');
  const base = { version: 1, speakerBox: [700, 200, 1220, 1000], scenes: SCENES };
  fs.writeFileSync(planFile, JSON.stringify({ ...base, style: '藍圖' }));
  const r = node();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^風格包：藍圖（shared\/template\/styles\/藍圖\/：brand\.css、pip-frame\.png、pip-frame-v\.png、bg-fs\.jpg、bg-side\.jpg、bg-ch\.jpg）$/m);
  for (const f of ['brand.css', 'pip-frame.png']) assert.ok(same(path.join(out, 'kit', f), path.join(pack, f)), f);
  assert.ok(same(path.join(out, 'assets', 'bg-fs.jpg'), path.join(pack, 'bg-fs.jpg')));
  fs.writeFileSync(planFile, JSON.stringify(base));
  assert.equal(node().status, 0);
  assert.ok(same(path.join(out, 'kit', 'brand.css'), path.join(TEMPLATE, 'kit', 'brand.css')), '同樣大小的 brand.css 也要換回來');
  assert.ok(same(path.join(out, 'assets', 'bg-fs.jpg'), path.join(TEMPLATE, 'bg-fs.jpg')));
  fs.writeFileSync(planFile, JSON.stringify({ ...base, style: '沒有這包' }));
  const bad = node('--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✖ style：找不到風格包「沒有這包」→ 現有：預設、藍圖/);
  fs.writeFileSync(planFile, JSON.stringify({ ...base, style: 3 }));
  assert.match(node('--check').stdout, /✖ style 要寫風格包的名稱/);
  writePlan(SCENES);
});

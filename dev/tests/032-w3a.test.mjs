// 032 W3a（素材）：media.mjs sort／new（A6）、cuts（A9①）、illus-show、illus-lint --states（A9⑤）、素材清單（A10）、prep／rough 的回報段與停手（A3、A4）
// node --test dev/tests/032-w3a.test.mjs（端到端要 ffmpeg；prep／rough 那一則另外要 auto-editor，沒有就略過）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, imp } from './helpers.mjs';

import { pathToFileURL } from 'node:url';
const MEDIA = path.join(TOOLS, 'media.mjs');
const M = await import(pathToFileURL(MEDIA).href);
const F = await imp('lib/rough-flow.mjs');
const A = await imp('lib/assets-manifest.mjs');
const { REPORT_HEAD } = await imp('lib/say.mjs');
const hasAe = spawnSync('auto-editor', ['--version'], { encoding: 'utf8' }).status === 0;

// 每則測試自己的工作區：shared/template 是捷徑，projects/ 是空的
function mkRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-032-w3a-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  return root;
}
const cli = (root, args) => spawnSync(process.execPath, [MEDIA, ...args, '--template', path.join(root, 'shared', 'template')], { encoding: 'utf8', cwd: root });
const lines = (r) => r.stdout.trim().split('\n');
const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const video = (file, { audio = true, sec = 2 } = {}) => { fs.mkdirSync(path.dirname(file), { recursive: true }); ff(['-f', 'lavfi', '-i', `testsrc=size=160x90:rate=10:d=${sec}`, ...(audio ? ['-f', 'lavfi', '-i', `sine=d=${sec}`] : []), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac', '-shortest'] : []), file]); };
const sound = (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); ff(['-f', 'lavfi', '-i', 'sine=d=1', '-c:a', 'aac', file]); };
const image = (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); ff(['-f', 'lavfi', '-i', 'color=c=red:s=32x32', '-frames:v', '1', file]); };
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const rowOf = (r, file) => lines(r).find((l) => l.startsWith(`| ${file} |`)) || '';

// ---------- A6 sort ----------
test('sort（只印計畫）：決策表每一列；assets/、work/、output/、點開頭的檔不看；不搬任何檔；看圖的拼成 work/分類-總表.jpg', (t) => {
  const root = mkRoot(t), p = path.join(root, 'projects', 'mix');
  image(path.join(p, '場地照.jpg'));
  image(path.join(p, 'shot.png'));
  write(path.join(p, 'photo.HEIC'), 'heic');
  sound(path.join(p, 'voice.m4a'));
  video(path.join(p, 'Screen Recording 1.mov'), { audio: false });
  video(path.join(p, '錄屏 2.mp4'));
  video(path.join(p, 'raw', 'clip.mp4'));
  write(path.join(p, 'script.txt'), '# 稿\n\n大家好歡迎來到工程師下班有約今天要介紹一個工具\n');
  write(path.join(p, 'notes.docx'), 'x');
  write(path.join(p, 'broken.mp4'), 'not a video');
  write(path.join(p, '.DS_Store'), 'x');
  image(path.join(p, 'assets', 'images', 'old.png'));
  write(path.join(p, 'work', 'x.json'), '{}');
  write(path.join(p, 'output', 'final.mp4'), 'x');
  const before = fs.readdirSync(p).sort();
  const r = cli(root, ['sort', '--project', 'projects/mix']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(rowOf(r, '場地照.jpg'), /\| 不動 \| 檔名有「場地照」/);
  assert.match(rowOf(r, 'shot.png'), /\| assets\/images\/ \| 圖片/);
  assert.match(rowOf(r, 'photo.HEIC'), /\| assets\/images\/ \|/);
  assert.match(rowOf(r, 'voice.m4a'), /\| assets\/voice\/ \| ffprobe 只有聲音/);
  assert.match(rowOf(r, 'Screen Recording 1.mov'), /\| assets\/screen\/ \|/);
  assert.match(rowOf(r, '錄屏 2.mp4'), /\| assets\/screen\/ \|/);
  assert.match(rowOf(r, 'raw/clip.mp4'), /\| 看圖（第 1 格） \|/);
  assert.match(rowOf(r, 'script.txt'), /\| 講稿\.md \|/);
  assert.match(rowOf(r, 'notes.docx'), /\| 待確認 \| 不認得的檔案/);
  assert.match(rowOf(r, 'broken.mp4'), /\| 待確認 \| ffprobe 讀不到/);
  assert.doesNotMatch(r.stdout, /old\.png|x\.json|final\.mp4|DS_Store/);
  assert.match(r.stdout, /看圖 1 支：打開 .*work\/分類-總表\.jpg/);
  assert.ok(fs.existsSync(path.join(p, 'work', '分類-總表.jpg')));
  assert.deepEqual(fs.readdirSync(p).sort(), before, '只印計畫：一個檔都沒搬');
  const L = lines(r);
  assert.match(L.at(-2), /^→ 下一步：看完圖照表搬/);
  assert.equal(L.at(-1), 'node shared/template/tools/media.mjs sort --project projects/mix --apply');
});

test('sort --apply --as：照回答搬；目的地同名不覆寫、看圖沒回答的不搬，列為待確認；空的子資料夾留著；最後一行是給使用者的話', (t) => {
  const root = mkRoot(t), p = path.join(root, 'projects', 'mv');
  video(path.join(p, 'raw', 'a.mp4'));
  video(path.join(p, 'raw', 'b.mp4'));
  video(path.join(p, 'c.mp4'));
  image(path.join(p, 'shot.png'));
  image(path.join(p, 'assets', 'images', 'shot.png'));
  const old = fs.readFileSync(path.join(p, 'assets', 'images', 'shot.png'));
  const r = cli(root, ['sort', '--project', 'projects/mv', '--apply', '--as', 'a.mp4=camera;raw/b.mp4=screen']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(p, 'assets', 'camera', 'a.mp4')));
  assert.ok(fs.existsSync(path.join(p, 'assets', 'screen', 'b.mp4')));
  assert.ok(fs.existsSync(path.join(p, 'c.mp4')), '看圖沒回答：不搬');
  assert.ok(fs.existsSync(path.join(p, 'shot.png')), '目的地有同名檔：不搬');
  assert.deepEqual(fs.readFileSync(path.join(p, 'assets', 'images', 'shot.png')), old, '不覆寫');
  assert.ok(fs.existsSync(path.join(p, 'raw')), '搬完變空的子資料夾留著');
  for (const d of ['camera', 'voice', 'screen', 'images']) assert.ok(fs.existsSync(path.join(p, 'assets', d)));
  assert.match(r.stdout, /✓ 分類好了：搬了 2 個、不動 0 個、待確認 2 個/);
  assert.match(r.stdout, /- c\.mp4：看圖還沒回答（work\/分類-總表\.jpg 第 1 格）/);
  assert.match(r.stdout, /- shot\.png：目的地已經有同名檔 assets\/images\/shot\.png：不覆寫/);
  assert.equal(lines(r).at(-1), '→ 下一步：分類沒問題後說「剪乾淨」；要改就說哪個檔案放哪裡');
  // 第二次只剩待確認的：用 --as 補答 c.mp4
  const r2 = cli(root, ['sort', '--project', 'projects/mv', '--apply', '--as', 'c.mp4=skip']);
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.match(rowOf(r2, 'c.mp4'), /\| 不動 \| --as skip/);
  assert.ok(fs.existsSync(path.join(p, 'c.mp4')));
});

test('sort --as：分類寫錯、檔名不在表上、同名有好幾個 → ✖（附改法、結束碼 1）；兩個檔要搬到同一個名稱，第二個待確認', (t) => {
  const root = mkRoot(t), p = path.join(root, 'projects', 'bad');
  video(path.join(p, 'x', 'a.mp4'));
  video(path.join(p, 'y', 'a.mp4'));
  const k = cli(root, ['sort', '--project', 'projects/bad', '--as', 'x/a.mp4=video']);
  assert.equal(k.status, 1);
  assert.match(k.stdout + k.stderr, /✖ --as 的「video」不是能用的分類 → 只有 camera、voice、screen、images、script、skip/);
  const n = cli(root, ['sort', '--project', 'projects/bad', '--as', 'nope.mp4=camera']);
  assert.equal(n.status, 1);
  assert.match(n.stdout + n.stderr, /✖ --as 的「nope\.mp4」不是這次要分類的檔 → 寫表上的檔名：x\/a\.mp4、y\/a\.mp4/);
  const d = cli(root, ['sort', '--project', 'projects/bad', '--as', 'a.mp4=camera']);
  assert.equal(d.status, 1);
  assert.match(d.stdout + d.stderr, /✖ 「a\.mp4」有 2 個同名的檔 → 寫相對專案的路徑/);
  const both = cli(root, ['sort', '--project', 'projects/bad', '--as', 'x/a.mp4=camera;y/a.mp4=camera']);
  assert.equal(both.status, 0, both.stdout + both.stderr);
  assert.match(rowOf(both, 'x/a.mp4'), /\| assets\/camera\/ \|/);
  assert.match(rowOf(both, 'y/a.mp4'), /\| 待確認 \| 和 x\/a\.mp4 要搬到同一個名稱 assets\/camera\/a\.mp4：不覆寫/);
});

test('sort 講稿：已經有講稿.md → .md 待確認；好幾份候選 → 全部待確認，--as script 指定一份改名成講稿.md', (t) => {
  const root = mkRoot(t);
  const p1 = path.join(root, 'projects', 'has');
  write(path.join(p1, '講稿.md'), '# 稿\n');
  write(path.join(p1, '草稿.md'), '大家好歡迎來到工程師下班有約今天要介紹');
  const r1 = cli(root, ['sort', '--project', 'projects/has']);
  assert.match(rowOf(r1, '草稿.md'), /\| 待確認 \| 專案裡已經有 講稿\.md/);
  assert.doesNotMatch(r1.stdout, /\| 講稿\.md \| 待確認/, '根目錄的講稿.md 本身不列');
  const p2 = path.join(root, 'projects', 'two');
  write(path.join(p2, 'a.md'), '大家好歡迎來到工程師下班有約今天要介紹');
  write(path.join(p2, 'b.txt'), '大家好歡迎來到工程師下班有約今天要介紹');
  const r2 = cli(root, ['sort', '--project', 'projects/two']);
  assert.match(rowOf(r2, 'a.md'), /\| 待確認 \| 講稿候選有 2 份/);
  assert.equal(lines(r2).at(-1), '→ 下一步：分類沒問題後說「剪乾淨」；要改就說哪個檔案放哪裡', '沒有要搬的：不叫它 --apply');
  const r3 = cli(root, ['sort', '--project', 'projects/two', '--apply', '--as', 'b.txt=script']);
  assert.equal(r3.status, 0, r3.stdout + r3.stderr);
  assert.ok(fs.existsSync(path.join(p2, '講稿.md')) && !fs.existsSync(path.join(p2, 'b.txt')));
  assert.ok(fs.existsSync(path.join(p2, 'a.md')));
});

// ---------- A6 new ----------
test('new <名稱>：建專案與四個素材資料夾、印各放什麼、最後一行；已經有 ✖；名稱不合法 ✖', (t) => {
  const root = mkRoot(t);
  const r = cli(root, ['new', '第一集']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const d of ['camera', 'voice', 'screen', 'images']) assert.ok(fs.statSync(path.join(root, 'projects', '第一集', 'assets', d)).isDirectory(), d);
  assert.ok(!fs.existsSync(path.join(root, 'projects', '第一集', 'work')), '只建四個素材資料夾');
  assert.match(r.stdout, /有畫面的講解 → projects\/第一集\/assets\/camera\//);
  assert.match(r.stdout, /講稿 → 存成 projects\/第一集\/講稿\.md/);
  assert.equal(lines(r).at(-1), '→ 下一步：素材放好後說「剪乾淨」');
  const again = cli(root, ['new', '--name', '第一集']);
  assert.equal(again.status, 1);
  assert.match(again.stdout + again.stderr, /✖ projects\/第一集 已經有了 → 換一個名稱/);
  const bad = cli(root, ['new', 'a/b']);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout + bad.stderr, /✖ 要寫新專案的資料夾名稱.*→ /);
  assert.ok(!fs.existsSync(path.join(root, 'projects', 'a')));
});

// ---------- A9① cuts ----------
function cutsProject(root, name) {
  const p = path.join(root, 'projects', name);
  const rows = [
    { cut: true, start: 7.8, end: 12.5, text: '先打開設定頁面', reason: '同一句講兩次', pending: '' },
    { cut: false, start: 14, end: 15, text: '好', reason: '贅字「好」', pending: '' },
    { cut: true, start: 16, end: 17, text: '嗯', reason: '同一句講兩次', pending: '請試聽' },
  ];
  write(path.join(p, 'work', 'cuts.md'), F.cutsMarkdown({ rows, chapters: [{ title: '開場', first: '大家好', t: 1 }] }));
  return p;
}

test('cuts --keep／--cut：只改那幾列的「剪」欄、記 ① 修改後重停（原話）、回報段＋停點那兩行在最後', (t) => {
  const root = mkRoot(t), p = cutsProject(root, 'c1');
  const r = cli(root, ['cuts', '--project', 'projects/c1', '--keep', '1', '--cut', '2', '--said', '第 1 列不要剪、第 2 列要剪', '--no-editor']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const cm = M.parseCutsMd(fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8'));
  assert.deepEqual(cm.ng.map((x) => x.cut), [false, true, true]);
  const L = lines(r);
  assert.deepEqual(L.slice(-2), ['⏸ 停點 ① 剪輯清單｜請看 work/cuts.md', '請回：勾好後說「可以」，或要改的列']);
  assert.ok(L.includes(REPORT_HEAD), r.stdout);
  assert.match(r.stdout, /✓ 剪輯清單：第 1 列（0:07\.80–0:12\.50）不剪；第 2 列（0:14\.00–0:15\.00）要剪/);
  assert.match(r.stdout, /現在 3 列：剪 2 列、不剪 1 列/);
  assert.equal(r.stdout.match(/⏸ 停點/g).length, 1, '停點那一行只出現一次');
  assert.match(fs.readFileSync(path.join(p, 'work', '製作進度.md'), 'utf8'), /\| ① 剪輯清單 \| 修改後重停 \| 「第 1 列不要剪、第 2 列要剪」 \| work\/cuts\.md \|/);
  // --say 也收；範圍寫法
  const s = cli(root, ['cuts', '--project', 'projects/c1', '--cut', '1-2', '--say', '都剪', '--no-editor']);
  assert.equal(s.status, 0, s.stdout + s.stderr);
  assert.deepEqual(M.parseCutsMd(fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8')).ng.map((x) => x.cut), [true, true, true]);
  assert.match(fs.readFileSync(path.join(p, 'work', '製作進度.md'), 'utf8'), /修改後重停 \| 「都剪」/);
});

test('cuts：沒給列 ✖、列號超出 ✖、同一列兩邊都寫 ✖、沒有 cuts.md ✖、已經有 rough.mp4 ✖ 指向 rough --again；✖ 都不改檔', (t) => {
  const root = mkRoot(t), p = cutsProject(root, 'c2');
  const before = fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8');
  const run = (...a) => { const r = cli(root, ['cuts', '--project', 'projects/c2', '--no-editor', ...a]); assert.equal(r.status, 1, r.stdout + r.stderr); return r.stdout + r.stderr; };
  assert.match(run(), /✖ 要寫改哪幾列 → /);
  assert.match(run('--keep', '9'), /✖ 剪輯清單沒有第 9 列 → 現在是第 1–3 列/);
  assert.match(run('--keep', '2', '--cut', '2'), /✖ 第 2 列同時寫在 --keep 和 --cut → /);
  assert.match(run('--keep', 'abc'), /✖ --keep 要寫列號/);
  write(path.join(p, 'work', 'rough.mp4'), 'x');
  assert.match(run('--keep', '1'), /✖ 初剪已經輸出了.*media\.mjs rough --project projects\/c2 --again/);
  assert.equal(fs.readFileSync(path.join(p, 'work', 'cuts.md'), 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(p, 'work', '製作進度.md')), '✖ 不記停點');
  fs.mkdirSync(path.join(root, 'projects', 'c3'));
  const none = cli(root, ['cuts', '--project', 'projects/c3', '--keep', '1', '--no-editor']);
  assert.equal(none.status, 1);
  assert.match(none.stdout + none.stderr, /✖ 找不到 work\/cuts\.md → 先跑 node shared\/template\/tools\/media\.mjs prep/);
});

test('parseRowList：逗號、頓號、範圍、#、第 N 列都認；看不懂丟錯', () => {
  assert.deepEqual(F.parseRowList('3,5、7 #9 第11列 2-4', 'keep'), [3, 5, 7, 9, 11, 2, 4]);
  assert.throws(() => F.parseRowList('a', 'cut'), /--cut 要寫列號/);
});

// ---------- A9⑤ illus-show、illus-lint --states ----------
test('illus-show：印畫廊元件的 SVG（--opts 改選項）；不存在 ✖ 並列出有哪些；不用 --project', (t) => {
  const root = mkRoot(t);
  const r = cli(root, ['illus-show', 'phone']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout.trim(), /^<svg[\s\S]*<\/svg>$/);
  assert.match(r.stdout, /data-il="phone"/);
  const rec = cli(root, ['illus-show', 'phone', '--opts', 'screen=rec']);
  assert.equal(rec.status, 0, rec.stdout + rec.stderr);
  assert.notEqual(rec.stdout, r.stdout, '--opts 有作用');
  assert.equal(cli(root, ['illus-show', 'phone', '--opts', "{screen:'rec'}"]).stdout, rec.stdout, '舊文件 {screen:\'rec\'} 的寫法也收');
  const bad = cli(root, ['illus-show', 'nope']);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout + bad.stderr, /✖ 畫廊沒有「nope」這個元件 → .*有：phone、.*laptop/);
});

const ROUTER_SVG = fs.readFileSync(path.join(TEMPLATE, 'kit', 'illus-style.md'), 'utf8').match(/```svg\n([\s\S]*?)```/)[1];
test('illus-lint --only --states：每個狀態都要有 <g class="il-<狀態>">，少了 ✖；--states 沒有 --only ✖', (t) => {
  const root = mkRoot(t);
  write(path.join(root, 'projects', 'il', 'work', 'hyperframes', 'illus-local', 'router.svg'), ROUTER_SVG);
  const good = cli(root, ['illus-lint', '--project', 'projects/il', '--no-sheet', '--only', 'router', '--states', 'led,warn']);
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.doesNotMatch(good.stdout, /^✖/m);
  assert.match(good.stdout, /只查不用尺寸的規則/, '插圖清單沒有這一列：狀態照 --states 查');
  const miss = cli(root, ['illus-lint', '--project', 'projects/il', '--no-sheet', '--only', 'router', '--states', 'led,blink']);
  assert.equal(miss.status, 1, miss.stdout + miss.stderr);
  assert.match(miss.stdout, /^✖ \[illus-local\/router\.svg\] router：缺狀態群組 <g class="il-blink"> → /m);
  const alone = cli(root, ['illus-lint', '--project', 'projects/il', '--no-sheet', '--states', 'led']);
  assert.equal(alone.status, 1);
  assert.match(alone.stdout + alone.stderr, /✖ --states 要和 --only 一起用 → /);
});

// ---------- A10 素材清單 ----------
test('素材清單：writeManifest 記 assets/ 每個檔與講稿.md；diffManifest 回被改的、不見的，新檔不算；沒有清單回 null', (t) => {
  const root = mkRoot(t), p = path.join(root, 'projects', 'mf');
  write(path.join(p, 'assets', 'camera', 'a.mp4'), 'aaaa');
  write(path.join(p, 'assets', 'images', 'sub', 'b.png'), 'bb');
  write(path.join(p, 'assets', 'voice', '.DS_Store'), 'x');
  write(path.join(p, '講稿.md'), '# 稿\n');
  assert.equal(A.diffManifest(p), null);
  const w = A.writeManifest(p);
  assert.equal(w.file, path.join(p, 'work', '.jobs', 'assets-manifest.json'));
  assert.deepEqual(w.files.map((f) => f.path), ['assets/camera/a.mp4', 'assets/images/sub/b.png', '講稿.md']);
  assert.ok(w.files.every((f) => Number.isInteger(f.size) && Number.isInteger(f.mtimeMs)));
  assert.deepEqual(A.diffManifest(p), { changed: [], missing: [] });
  fs.appendFileSync(path.join(p, 'assets', 'camera', 'a.mp4'), 'more');
  fs.renameSync(path.join(p, 'assets', 'images', 'sub', 'b.png'), path.join(p, 'assets', 'images', 'c.png'));
  write(path.join(p, 'assets', 'screen', 'new.mov'), 'n');
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(p, '講稿.md'), later, later);
  assert.deepEqual(A.diffManifest(p), { changed: ['assets/camera/a.mp4', '講稿.md'], missing: ['assets/images/sub/b.png'] });
});

// ---------- A3、A4、A10：prep／rough 端到端 ----------
const SCRIPT = ['# 示範稿', '', '## 開場', '', '大家好歡迎來到工程師下班有約', '今天要介紹一個節省時間的工具', '', '## 操作', '', '先打開設定頁面按下新增專案', '接著選擇要用的解析度', ''].join('\n');
const say = (text, at, charSec = 0.2) => [...text].map((c, i) => ({ text: c, start: +(at + i * charSec).toFixed(3), end: +(at + (i + 1) * charSec).toFixed(3) }));
const e2eWords = () => [...say('大家好歡迎來到工程師下班有約', 1, 0.2), ...say('今天要介紹一個節省時間的工具', 4.3, 0.2), ...say('先打開設定頁面', 7.8, 0.2), ...say('先打開設定頁面按下新增專案', 12.5, 0.2), ...say('接著選擇要用的解析度', 15.7, 0.18)];

test('prep／rough：回報段（停點那兩行只在最後出現一次、rough 帶初剪連結）、prep 記素材清單、同一條連續沒過 4 次印停手', { skip: !hasAe && '沒有 auto-editor' }, (t) => {
  const root = mkRoot(t), p = path.join(root, 'projects', 'e2e');
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  const spans = [[1, 4], [4.3, 7.2], [7.8, 9.2], [12.5, 15.4], [15.7, 17.5]].map(([a, b]) => `between(t,${a},${b})`).join('+');
  ff(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:d=18', '-f', 'lavfi', '-i', `aevalsrc='0.4*sin(2*PI*440*t)*(${spans})':s=48000:d=18`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(p, 'assets', 'camera', 'a.mp4')]);
  fs.writeFileSync(path.join(p, '講稿.md'), SCRIPT);
  const tj = path.join(root, 'words.json');
  fs.writeFileSync(tj, JSON.stringify(e2eWords()));
  const pr = cli(root, ['prep', '--project', 'projects/e2e', '--no-editor', '--transcript', tj]);
  assert.equal(pr.status, 0, pr.stdout + pr.stderr);
  const L = lines(pr);
  assert.deepEqual(L.slice(-2), ['⏸ 停點 ① 剪輯清單｜請看 work/cuts.md', '請回：勾好後說「可以」，或要改的列']);
  const head = L.indexOf(REPORT_HEAD);
  assert.ok(head > 0 && /^✓ 剪輯清單：work\/cuts\.md（NG 1 列/.test(L[head + 1]), pr.stdout);
  assert.equal(pr.stdout.match(/✓ 剪輯清單/g).length, 1, '剪輯清單那一行只在回報段印一次');
  assert.equal(pr.stdout.match(/⏸ 停點/g).length, 1);
  assert.deepEqual(A.diffManifest(p), { changed: [], missing: [] });
  assert.deepEqual(JSON.parse(fs.readFileSync(A.manifestFile(p), 'utf8')).files.map((f) => f.path), ['assets/camera/a.mp4', '講稿.md']);
  const rr = cli(root, ['rough', '--project', 'projects/e2e', '--no-editor', '--said', '可以']);
  assert.equal(rr.status, 0, rr.stdout + rr.stderr);
  const R = lines(rr), h = R.indexOf(REPORT_HEAD);
  assert.ok(h > 0, rr.stdout);
  assert.match(R[h + 1], /^初剪完成：原始 18\.\d+s → 初剪/);
  assert.ok(R.slice(h).some((l) => /^摘要：（寫好 work\/摘要\.md、跑 .*status\.mjs --project projects\/e2e --summary/.test(l)), rr.stdout);
  assert.ok(R.slice(h).includes(`<deliver-assets><media type="video" src="${path.join(fs.realpathSync(p), 'work', 'rough.mp4').split(path.sep).join('/')}" /></deliver-assets>`), rr.stdout);
  assert.match(R.at(-2), /^→ 下一步：接著做/);
  assert.match(R.at(-1), /status\.mjs --project/);
  // 做完再跑（沒說 --again）會 ✖：連續 4 次就印停手；成功一次歸零
  const tries = [1, 2, 3, 4].map(() => cli(root, ['rough', '--project', 'projects/e2e', '--no-editor']));
  assert.ok(tries.every((x) => x.status === 1));
  assert.ok(tries.slice(0, 3).every((x) => !/→ 停手/.test(x.stdout)));
  assert.match(lines(tries[3]).at(-1), /^→ 停手：media\.mjs rough 已經連續 4 次沒過/);
});

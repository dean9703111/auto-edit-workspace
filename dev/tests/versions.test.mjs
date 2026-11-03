// versions.mjs：段落版本（存檔、改版提案、確認、退回、比較影片）＋ status.mjs 的改版判斷（specs/014-segment-versions/brief.md）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, imp } from './helpers.mjs';

const V = await imp('versions.mjs');
const { projectStatus } = await imp('status.mjs');
const { pathsFrom } = await imp('build.mjs');

const X1 = '<template id="x-a"><div class="t">主持人跟來賓</div><div data-illus-src="illus-local/router.svg"></div></template>\n';
const SB = ['# 分鏡表', '', '## 總覽', '', '| 段 | … |', '', '### s05｜15 金句（疊加）', '- 金句「小毛病」', '',
  '### s12｜x-a（全幕）', '- 截圖觀察：對比卡', '', '#### 動畫分鏡 s12', '', '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |',
  '|---|---|---|---|---|---|', '| 1 | #1@主持人 | 兩個面向 | 彈出 | 均衡 | tick |', '', '',
  '### s13｜04b（子母畫面）', '- 對照卡', '', '## 需要我決定的事', '', '- 無', ''].join('\n');

const touch = (p, rel, text = 'x', ageSec = 0) => {
  const f = path.join(p, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  const t = new Date(Date.now() - ageSec * 1000);
  fs.utimesSync(f, t, t);
};
function mk() {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-versions-'));
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  touch(p, 'assets/camera/a.mp4', 'x', 600);
  for (const f of ['work/cuts.md', 'work/rough.mp4', 'work/transcript.json', 'work/rough.srt.align-1', 'work/cutpoints.json', 'work/構圖預覽.jpg']) touch(p, f, 'x', 600);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:03,000\n主持人跟來賓\n', 600);
  touch(p, 'work/storyboard.md', SB, 120);
  const plan = { version: 1, scenes: [
    { id: 's05', scene: 'quote', from: '#1', to: '#1e', slots: { text: '小毛病' } },
    { id: 's12', type: 'custom', src: 'compositions/x-a.html', layout: 'fullscreen', from: '#1', to: '#1e' },
  ] };
  touch(p, 'work/hyperframes/plan.json', JSON.stringify(plan, null, 2) + '\n', 60);
  touch(p, 'work/hyperframes/compositions/x-a.html', X1, 60);
  touch(p, 'work/hyperframes/illus-local/router.svg', '<svg id="r1"/>', 60);
  touch(p, 'work/hyperframes/index.html', 'x', 30);
  return p;
}
const ctx = (p) => ({ P: pathsFrom({ project: p }), flags: { 'no-preview': true }, logs: [] });
const logTo = (c) => (s) => c.logs.push(s);
const read = (p, rel) => fs.readFileSync(path.join(p, ...rel.split('/')), 'utf8');
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('findSection／replaceSection：### 到下一個 ##／### 為止，#### 算在裡面；沒有就插在「需要我決定的事」前面', () => {
  const s = V.findSection(SB, 's12');
  assert.match(s.text, /^### s12｜x-a（全幕）/);
  assert.match(s.text, /#### 動畫分鏡 s12/);
  assert.match(s.text, /\| 1 \| #1@主持人/);
  assert.doesNotMatch(s.text, /s13/);
  assert.equal(V.findSection(SB, 's1'), null, 's1 不會對到 s12');
  const out = V.replaceSection(SB, 's12', '### s12｜x-b（全幕）\n- 新的');
  assert.match(out, /### s05｜15 金句（疊加）\n- 金句「小毛病」\n\n### s12｜x-b（全幕）\n- 新的\n\n\n### s13/);
  const add = V.replaceSection(SB, 's20b', '### s20b｜金句\n- 加的');
  assert.match(add, /### s20b｜金句\n- 加的\n\n\n## 需要我決定的事/);
});

test('save：第一次存 v1（段落、x 檔、svg、分鏡）；沒變不另存；改了存 v2；state 記使用中與上一版', () => {
  const p = mk(), c = ctx(p);
  const r1 = V.saveSeg(c.P, c.flags, 's12', logTo(c));
  assert.equal(r1.n, 1);
  assert.ok(r1.created);
  for (const f of ['段落.json', 'x-a.html', 'illus-local/router.svg', '分鏡.md', '.meta.json']) assert.ok(fs.existsSync(path.join(p, 'work', 'versions', 's12', 'v1', ...f.split('/'))), f);
  assert.match(read(p, 'work/versions/s12/v1/分鏡.md'), /^# s12 v1（存檔）[\s\S]*## 分鏡\n\n### s12｜x-a（全幕）[\s\S]*#### 動畫分鏡 s12/);
  assert.deepEqual(JSON.parse(read(p, 'work/versions/s12/v1/段落.json')).src, 'compositions/x-a.html');
  const r2 = V.saveSeg(c.P, c.flags, 's12', logTo(c));
  assert.equal(r2.n, 1);
  assert.equal(r2.created, false);
  assert.match(c.logs.at(-1), /s12：沒變，目前就是 v1/);
  touch(p, 'work/hyperframes/compositions/x-a.html', X1.replace('主持人跟來賓', '各拍各的'));
  const r3 = V.saveSeg(c.P, c.flags, 's12', logTo(c));
  assert.equal(r3.n, 2);
  const st = JSON.parse(read(p, 'work/versions/.state.json'));
  assert.deepEqual([st.live.s12, st.prev.s12], [2, 1]);
  const s05 = V.saveSeg(c.P, c.flags, 's05', logTo(c));
  assert.equal(s05.n, 1, '字卡段只存段落與分鏡');
  assert.deepEqual(fs.readdirSync(path.join(p, 'work', 'versions', 's05', 'v1')).sort(), ['.meta.json', '分鏡.md', '段落.json']);
  assert.throws(() => V.saveSeg(c.P, c.flags, 's99', logTo(c)), /plan\.json 沒有「s99」這一段 →/);
  fs.rmSync(p, { recursive: true });
});

test('改版：new 開提案 → 範本沒改不能 accept、提案沒確認不能 save → accept 寫回 storyboard → status 是「改版」不是停點 ③ → save 存進提案那一版', () => {
  const p = mk(), c = ctx(p);
  const r = V.newProposal(c.P, c.flags, 's12', logTo(c), '「s12 想更完善」');
  assert.equal(r.n, 2, '先存 v1，提案是 v2');
  const md = read(p, 'work/versions/s12/v2/分鏡.md');
  assert.match(md, /^# s12 v2（改版）\n\n- 提案：.*\n- 原話：「s12 想更完善」\n- 現在的樣子：\[v1\/預覽\.mp4\]/);
  assert.match(md, /## 這版要改什麼\n\n- （寫 1–5 條/);
  assert.equal(V.newProposal(c.P, c.flags, 's12', logTo(c)).reused, true, '提案還在就沿用');
  assert.throws(() => V.acceptProposal(c.P, 's12', logTo(c)), /還是範本那一行 →/);
  assert.throws(() => V.saveSeg(c.P, c.flags, 's12', logTo(c)), /v2 分鏡還在等使用者確認 →/);
  assert.deepEqual(V.pendingRevisions(p), [{ id: 's12', v: 2, state: '提案' }]);
  assert.equal(projectStatus(p).at, '改版／s12 v2（分鏡還沒給使用者確認）');
  fs.writeFileSync(path.join(p, 'work', 'versions', 's12', 'v2', '分鏡.md'), md.replace(/- （寫 1–5 條.*/, '- 收尾加蓋章').replace('| 1 | #1@主持人 | 兩個面向 | 彈出 |', '| 1 | #1@主持人 | 兩個面向＋蓋章 | 彈出；蓋章 |'));
  V.acceptProposal(c.P, 's12', logTo(c));
  const sb = read(p, 'work/storyboard.md');
  assert.match(sb, /兩個面向＋蓋章 \| 彈出；蓋章/);
  assert.equal(sb.replace('兩個面向＋蓋章 | 彈出；蓋章', '兩個面向 | 彈出'), SB, 'storyboard.md 只換 s12 那一節');
  assert.ok(V.storyboardByVersions(p));
  const s = projectStatus(p);
  assert.notEqual(s.stage, 'S10', 'accept 寫的 storyboard.md 不算停點 ③');
  assert.equal(s.at, '改版／s12 v2（分鏡已確認，還沒做完）');
  assert.equal(s.nextStop, '④ 影片編輯器');
  assert.throws(() => V.saveSeg(c.P, c.flags, 's12', logTo(c)), /還和 v1 一模一樣：v2 的分鏡還沒做 →/);
  touch(p, 'work/hyperframes/compositions/x-a.html', X1 + '<!-- 蓋章 -->\n');
  const done = V.saveSeg(c.P, c.flags, 's12', logTo(c));
  assert.equal(done.n, 2);
  const md2 = read(p, 'work/versions/s12/v2/分鏡.md');
  assert.match(md2, /- 收尾加蓋章/, '保留「這版要改什麼」');
  assert.match(md2, /兩個面向＋蓋章/, '「## 分鏡」換成 storyboard.md 現在那一節');
  assert.equal(JSON.parse(read(p, 'work/versions/s12/v2/.meta.json')).state, '完成');
  assert.deepEqual(V.pendingRevisions(p), []);
  touch(p, 'work/storyboard.md', SB, -5);
  assert.equal(projectStatus(p).stage, 'S10', '之後再手改 storyboard.md（晚 5 秒）就照常算停點 ③');
  fs.rmSync(p, { recursive: true });
});

test('use：先存現在的樣子，再把 plan.json 那段、x 檔、svg、storyboard 那一節換回舊版；沒做完的提案標放棄', () => {
  const p = mk(), c = ctx(p);
  V.saveSeg(c.P, c.flags, 's12', logTo(c));
  const plan = JSON.parse(read(p, 'work/hyperframes/plan.json'));
  plan.scenes[1].to = '#2e';
  touch(p, 'work/hyperframes/plan.json', JSON.stringify(plan, null, 2) + '\n');
  touch(p, 'work/hyperframes/compositions/x-a.html', 'v2 的動畫');
  touch(p, 'work/hyperframes/illus-local/router.svg', '<svg id="r2"/>');
  V.newProposal(c.P, c.flags, 's12', logTo(c));
  assert.deepEqual(V.listVersions(p, 's12').map((v) => [v.n, v.complete]), [[1, true], [2, true], [3, false]]);
  V.useVersion(c.P, c.flags, 's12', 'v1', logTo(c));
  assert.equal(JSON.parse(read(p, 'work/hyperframes/plan.json')).scenes[1].to, '#1e');
  assert.equal(JSON.parse(read(p, 'work/hyperframes/plan.json')).scenes[0].id, 's05', '其他段不動');
  assert.equal(read(p, 'work/hyperframes/compositions/x-a.html'), X1);
  assert.equal(read(p, 'work/hyperframes/illus-local/router.svg'), '<svg id="r1"/>');
  assert.equal(JSON.parse(read(p, 'work/versions/s12/v3/.meta.json')).state, '放棄');
  assert.deepEqual(V.pendingRevisions(p), []);
  const all = V.listAll(c.P);
  assert.deepEqual(all[0].versions.map((v) => [v.v, v.current]), [['v1', true], ['v2', false], ['v3', false]]);
  assert.throws(() => V.useVersion(c.P, c.flags, 's12', 'v3', logTo(c)), /沒有做完的 v3（有：v1、v2）→/);
  fs.rmSync(p, { recursive: true });
});

test('status：改版停點「③ 分鏡表（s12 v2）」待回覆 → 下一步指到那份分鏡.md 與 accept', () => {
  const p = mk(), c = ctx(p);
  V.newProposal(c.P, c.flags, 's12', logTo(c));
  touch(p, 'work/製作進度.md', ['## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|',
    '| 2026-11-02 15:00 | ③ 分鏡表（s12 v2） | 待回覆 | — | work/versions/s12/v2/分鏡.md |', ''].join('\n'));
  const s = projectStatus(p);
  assert.deepEqual(s.waiting, ['③ 分鏡表（s12 v2）']);
  assert.equal(s.at, '剪好看／停點 ③ 分鏡表（s12 v2）（待回覆）');
  assert.equal(s.nextStop, '③ 分鏡表');
  assert.match(s.next, /work\/versions\/s12\/v2\/分鏡\.md；回覆「可以」後跑 versions\.mjs accept --seg s12/);
  fs.rmSync(p, { recursive: true });
});

test('預覽拼格與比較影片（ffmpeg）：左舊右新、上方標版本號、聲音用新版、長度取長的', { skip: !ffmpeg && '沒有 ffmpeg' }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-versions-ff-'));
  const clip = (f, dur, color) => spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=1920x1080:r=30:d=${dur}`, '-f', 'lavfi', '-i', `sine=f=440:d=${dur}`, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(d, f)]);
  clip('a.mp4', 2, 'red');
  clip('b.mp4', 3, 'blue');
  V.contactSheet(path.join(d, 'b.mp4'), path.join(d, 'b.jpg'));
  const jpg = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(d, 'b.jpg')], { encoding: 'utf8' }).stdout.trim();
  assert.equal(jpg.split(',')[0], String(4 * 480 + 5 * 4), '4 欄、每格 480 寬');
  V.compareClip(path.join(d, 'a.mp4'), path.join(d, 'b.mp4'), path.join(d, '比較-v1-v2.mp4'), ['v1', 'v2']);
  const pr = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', path.join(d, '比較-v1-v2.mp4')], { encoding: 'utf8' }).stdout);
  const v = pr.streams.find((s) => s.codec_type === 'video');
  assert.deepEqual([v.width, v.height], [1920, 540 + V.PREVIEW.bar]);
  assert.ok(pr.streams.some((s) => s.codec_type === 'audio'));
  assert.ok(Math.abs(Number(pr.format.duration) - 3) < 0.2, `長度 ${pr.format.duration}`);
  const px = spawnSync('ffmpeg', ['-v', 'error', '-ss', '2.5', '-i', path.join(d, '比較-v1-v2.mp4'), '-frames:v', '1', '-vf', 'crop=2:2:480:300', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']).stdout;
  assert.ok(px[0] > 150 && px[2] < 100, '舊版比較短：停在最後一格（紅）');
  assert.ok(!fs.existsSync(path.join(d, '比較-v1-v2.label.jpg')), '標籤暫存圖刪掉');
  fs.rmSync(d, { recursive: true });
});

test('CLI：--help、指令名稱、--seg 必填、list --json', () => {
  const runV = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'versions.mjs'), ...a], { encoding: 'utf8' });
  assert.match(runV('--help').stdout, /versions\.mjs save --project/);
  const bad = runV('redo', '--project', '.');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /沒有「redo」這個指令：只有 save、new、accept、use、list →/);
  const p = mk();
  const noSeg = runV('save', '--project', p);
  assert.match(noSeg.stderr, /save 要加 --seg <段 id>/);
  assert.equal(runV('save', '--project', p, '--seg', 's12', '--no-preview').status, 0);
  const j = JSON.parse(runV('list', '--project', p, '--json').stdout);
  assert.deepEqual(j.segs.map((s) => [s.id, s.versions.length, s.versions[0].current]), [['s12', 1, true]]);
  fs.rmSync(p, { recursive: true });
});

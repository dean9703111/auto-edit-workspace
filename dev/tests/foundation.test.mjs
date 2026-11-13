// 032 共用模組：lib/tries.mjs（計數）、lib/stops.mjs（停點原文）、lib/say.mjs（訊息出口）、lib/cli.mjs（參數）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { imp, WORKSPACE } from './helpers.mjs';

const { bumpTry, readTry, resetTry, mainTry, mainTriesDir, MAIN_TRY_MAX, stopLine, touchBeat, lastBeat, beatsDir } = await imp('lib/tries.mjs');
const { STOP, stopLines } = await imp('lib/stops.mjs');
const { ok, warn, fail, quote, cmdLine, next, dispatch, assetsLine, report, REPORT_HEAD, REPORT_MAX } = await imp('lib/say.mjs');
const { splitFlag, valueOf, oneOf, saidOf } = await imp('lib/cli.mjs');

const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-found-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('tries：一個 key 一個檔，互不影響；歸零只動指名的', (t) => {
  const d = tmp(t);
  assert.equal(readTry(d, 'audit:s01'), 0);
  assert.equal(bumpTry(d, 'audit:s01'), 1);
  assert.equal(bumpTry(d, 'audit:s01'), 2);
  assert.equal(bumpTry(d, 'audit:s02'), 1);
  assert.equal(bumpTry(d, '第一章'), 1);
  assert.equal(fs.readdirSync(d).length, 3);
  assert.deepEqual(resetTry(d, ['audit:s01', '沒有的']), ['audit:s01']);
  assert.equal(readTry(d, 'audit:s01'), 0);
  assert.equal(readTry(d, 'audit:s02'), 1);
});

test('tries：壞掉的計數檔當 0，不丟錯', (t) => {
  const d = tmp(t);
  bumpTry(d, 'k');
  fs.writeFileSync(path.join(d, `${encodeURIComponent('k')}.json`), '{"n":');
  assert.equal(readTry(d, 'k'), 0);
  assert.equal(bumpTry(d, 'k'), 1);
});

test('mainTry：沒過累加、到上限 stop、過了歸零', (t) => {
  const p = tmp(t);
  const max = MAIN_TRY_MAX.rough;
  let r;
  for (let i = 1; i <= max; i++) { r = mainTry(p, 'rough', false); assert.equal(r.n, i); assert.equal(r.stop, i >= max); }
  assert.ok(fs.existsSync(mainTriesDir(p)));
  assert.match(stopLine(r.n, 'media.mjs rough '), /^→ 停手：media\.mjs rough 已經連續 \d+ 次沒過/);
  assert.deepEqual(mainTry(p, 'rough', true), { n: 0, max, stop: false });
  assert.equal(mainTry(p, 'rough', false).n, 1);
});

test('beats：每段各一個檔，沒碰過＝0，碰了記時間', (t) => {
  const p = tmp(t);
  assert.equal(lastBeat(p, 's0105'), 0);
  assert.equal(touchBeat(p, 's0105', 1000), 1000);
  touchBeat(p, 's0201', 2000);
  assert.equal(lastBeat(p, 's0105'), 1000);
  assert.equal(lastBeat(p, 's0201'), 2000);
  touchBeat(p, 's0105', 3000);
  assert.equal(lastBeat(p, 's0105'), 3000);
  assert.equal(fs.readdirSync(beatsDir(p)).length, 2);
});

test('stops：兩行原文和 AGENTS.md「停點總表」一字不差', () => {
  const agents = fs.readFileSync(path.join(WORKSPACE, 'AGENTS.md'), 'utf8');
  const cases = [
    stopLines.cuts('<剪輯清單網址>'),
    stopLines.framing('<構圖台網址>', { look: true }),
    stopLines.storyboard('<分鏡表網址>'),
    stopLines.revise('③ 分鏡表（<段> v<N>）', 'work/versions/<段>/v<N>/分鏡.md'),
    stopLines.final('<完成影片預覽網址>'),
    stopLines.editor('<剪輯台網址>'),
    stopLines.bg('<暫存資料夾>'),
    stopLines.music('<候選資料夾>/試聽.html'),
  ];
  for (const c of cases) assert.ok(agents.includes(c), `AGENTS.md 找不到：\n${c}`);
  assert.equal(stopLines.framing('http://x/framing').split('\n')[0], '⏸ 停點 ② 構圖｜請看 http://x/framing');
  assert.equal(STOP.final, '④ 完成影片預覽');
});

test('say：符號、引號、指令行', () => {
  assert.equal(ok('好了'), '✓ 好了');
  assert.equal(warn('太短', '延長 to'), '⚠ 太短 → 延長 to');
  assert.equal(fail('找不到'), '✖ 找不到');
  assert.equal(quote('projects/範例'), 'projects/範例');
  assert.equal(quote('projects/my video'), '"projects/my video"');
  assert.equal(quote('#12-#25'), '"#12-#25"');
  assert.equal(quote('a"b'), '"a\\"b"');
  assert.equal(cmdLine('build.mjs', ['--project', 'projects/my video', '--review']), 'node shared/template/tools/build.mjs --project "projects/my video" --review');
  assert.equal(cmdLine('status.mjs', ['--project', 'projects/x', { raw: '--said "<使用者原話>"' }]), 'node shared/template/tools/status.mjs --project projects/x --said "<使用者原話>"');
});

test('say.next：下面只能放指令', () => {
  assert.deepEqual(next('重跑 build', 'node shared/template/tools/build.mjs --project projects/x'), ['→ 下一步：重跑 build', 'node shared/template/tools/build.mjs --project projects/x']);
  assert.deepEqual(next('素材放好後說「剪乾淨」'), ['→ 下一步：素材放好後說「剪乾淨」']);
  assert.throws(() => next('剪新專案', '用 auto-edit-longform 剪 projects/x'), /只能放指令/);
  assert.doesNotThrow(() => next('看全片', '(cd projects/x/work/hyperframes && npx hyperframes snapshot --review)'));
  // 正式剪片（沒有 NODE_TEST_CONTEXT）不丟錯：說明句併進「→ 下一步」那一行，指令照放
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import { next } from ${JSON.stringify(pathToFileURL(path.join(WORKSPACE, 'shared/template/tools/lib/say.mjs')).href)}; console.log(JSON.stringify(next('剪新專案', '用 auto-edit-longform 剪', 'node a.mjs')));`], { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '', AUTO_EDIT_STRICT: '' } });
  assert.deepEqual(JSON.parse(r.stdout), ['→ 下一步：剪新專案；用 auto-edit-longform 剪', 'node a.mjs']);
  assert.deepEqual(dispatch('一段派一個設計師：s05、s12', '你是設計師，負責 <段>'), ['→ 派工：一段派一個設計師：s05、s12', '  你是設計師，負責 <段>']);
});

test('say.report：停點兩行在最後、附件在停點前、最多 15 行', () => {
  const stop = stopLines.final('http://127.0.0.1:4400/?view=final');
  const r = report(['預覽好了：12 段', 'audit：✖ 0、⚠ 3'], { assets: ['/tmp/a b/final.mp4'], stop });
  assert.equal(r[0], REPORT_HEAD);
  assert.deepEqual(r.slice(-2), stop.split('\n'));
  assert.equal(r.at(-3), '<deliver-assets><media type="video" src="/tmp/a b/final.mp4" /></deliver-assets>');
  const long = report(Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 行`), { stop });
  assert.equal(long.length, REPORT_MAX);
  assert.deepEqual(long.slice(-2), stop.split('\n'));
  assert.match(long.at(-3), /^（其餘 \d+ 行看上面的輸出）$/);
  assert.equal(assetsLine([]), '');
  assert.match(assetsLine([{ path: '/x/qc-sheet.jpg' }, '/x/y.srt']), /type="image".*type="file"/);
});

test('build-summary：六個字頭、音效 ⚠、不重複', async () => {
  const { SUMMARY_HEADS, isSummaryLine, isSfxWarn, summaryLines } = await imp('lib/build-summary.mjs');
  assert.equal(SUMMARY_HEADS.length, 6);
  assert.ok(isSummaryLine('  人聲響度：−14.1 LUFS'));
  assert.ok(!isSummaryLine('✓ build 完成'));
  assert.ok(isSfxWarn('⚠ 音效密度：第 3 分鐘 6 顆'));
  assert.deepEqual(summaryLines('人聲響度：a\n✓ x\n講者瘦臉：b\n人聲響度：a\n'), ['人聲響度：a', '講者瘦臉：b']);
  // build.mjs 真的印這些字頭（改了字頭這裡會紅）
  const src = fs.readFileSync(path.join(WORKSPACE, 'shared/template/tools/build.mjs'), 'utf8') + fs.readFileSync(path.join(WORKSPACE, 'shared/template/tools/lib/plan.mjs'), 'utf8') + fs.readFileSync(path.join(WORKSPACE, 'shared/template/tools/lib/look.mjs'), 'utf8');
  for (const h of SUMMARY_HEADS) assert.ok(src.includes(h), `build／plan／look 找不到摘要字頭「${h}」`);
});

test('cli：只在第一個 = 切、值不能是另一個旗標、模式互斥、--say 也收', () => {
  assert.deepEqual(splitFlag('--said=a=b'), ['said', 'a=b']);
  assert.deepEqual(splitFlag('--check'), ['check', undefined]);
  assert.deepEqual(valueOf(['--project', 'projects/x'], 0, 'project'), ['projects/x', 1]);
  assert.deepEqual(valueOf(['--said=哈'], 0, 'said', '哈'), ['哈', 0]);
  assert.throws(() => valueOf(['--project', '--check'], 0, 'project'), /--project 後面要接值/);
  assert.throws(() => valueOf(['--seg'], 0, 'seg'), /--seg 後面要接值/);
  assert.equal(oneOf({ review: true }, ['storyboard', 'review']), 'review');
  assert.equal(oneOf({}, ['storyboard', 'review']), null);
  assert.throws(() => oneOf({ storyboard: true, review: true }, ['storyboard', 'review']), /不能一起用/);
  assert.equal(saidOf({ say: '可以' }), '可以');
  assert.equal(saidOf({ said: '好', say: '可以' }), '好');
});

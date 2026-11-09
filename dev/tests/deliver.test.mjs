// lib/deliver.mjs、deliver.mjs：輸出流程（假 runner）、內容指紋、預先 render 接手／取消／上限、停點紀錄不重複、收行程樹；最後一組實跑真的 10 秒短片。
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { TEMPLATE, TOOLS, imp, hasChrome } from './helpers.mjs';

const D = await imp('lib/deliver.mjs');
const CLI = await imp('deliver.mjs');
const { progressFile } = await imp('lib/progress.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STOP_LOG = ['# 製作進度', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', '| 2026-11-06 10:00 | ④ 完成影片預覽 | 待回覆 | — | — |', '', '## 回饋輪', ''].join('\n');
const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

let P, F, calls, sleepers;

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-deliver-'));
  const project = path.join(root, 'projects', 'demo'), out = path.join(project, 'work', 'hyperframes');
  for (const d of ['compositions', 'kit', path.join('assets', 'sfx')]) fs.mkdirSync(path.join(out, d), { recursive: true });
  fs.mkdirSync(path.join(project, 'output'), { recursive: true });
  fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, scenes: [] }));
  fs.writeFileSync(path.join(out, 'index.html'), '<html>main</html>');
  fs.writeFileSync(path.join(out, 'compositions', 'a.html'), '<div>a</div>');
  fs.writeFileSync(path.join(out, 'kit', 'x.css'), 'a{}');
  fs.writeFileSync(path.join(out, 'assets', 'rough.mp4'), 'footage');
  fs.writeFileSync(path.join(project, 'work', 'rough.srt'), '1\n00:00:00,000 --> 00:00:01,000\n字幕\n');
  fs.writeFileSync(path.join(project, 'work', '製作進度.md'), STOP_LOG);
  return { root, project, out, plan: path.join(out, 'plan.json'), srt: path.join(project, 'work', 'rough.srt'), video: path.join(project, 'work', 'rough.mp4'), templateDir: TEMPLATE };
}

// 假的子處理程序：照參數判斷是哪一步（和 editor-export.test 一樣的分類）
function fakeRun(overrides = {}) {
  return async (cmd, args, opts = {}) => {
    const name = cmd === 'ffprobe' ? 'probe' : args.includes('--test') ? 'testBuild' : args.includes('compositions/test-clip.html') ? 'testRender' : args.includes('--fps') ? 'render' : args.includes('final') ? 'qc' : 'other';
    calls.push(name);
    if (overrides[name]) return overrides[name](args, opts);
    if (name === 'probe') return { code: 0, stdout: 'video\naudio\n', stderr: '' };
    if (name === 'render') {
      opts.onData?.('@hf-progress {"code":"capture","done":10,"total":300,"pct":37}\n[INFO] 這行的 99% 不算進度\n');
      fs.writeFileSync(args[args.indexOf('--output') + 1], 'new-video');
      return { code: 0, stdout: '', stderr: '' };
    }
    if (name === 'qc') return { code: 0, stdout: JSON.stringify({ ok: true, errors: 0, warnings: 1, checks: [{ level: 'ok', text: '格式正確' }, { level: 'warn', text: '音量偏小' }], format: { width: 1920, height: 1080, fps: 30, hasAudio: true }, duration: { actual: 155.2, expected: 155.2 }, sheet: 'output/qc/qc-sheet.jpg' }), stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
}
const deps = (overrides = {}, extra = {}) => ({
  run: fakeRun(overrides),
  build: async () => { calls.push('build'); return [200, { ok: true, log: '人聲響度 −10 LUFS\n別的行\n' }]; },
  report: async () => ({ report: { items: [{ type: 'media', start: 1 }, { type: 'scene', start: 12.5, out: { start: 10.25 } }] } }),
  pollMs: 10, said: '可以了，輸出完成影片', ...extra,
});
const deliver = async (d) => { const job = D.newJob(); await D.runDeliver(P, job, d); return job; };
const rowsOf = () => fs.readFileSync(progressFile(P.project), 'utf8').split('\n').filter((l) => l.includes('④') && l.includes('通過'));

// 真的行程（給 killTree 收）；tag：多帶一個參數，看起來像那支工具（鎖會看命令列）
function sleeper(ms = 60000, tag = 'sleeper') {
  const p = spawn(process.execPath, ['-e', `setTimeout(() => {}, ${ms})`, tag], { detached: true, stdio: 'ignore' });
  sleepers.push(p);
  return p;
}

// 把預先 render 的狀態擺好（假裝工作行程 pid 活著／做完）
function setPrerender(side, { jobPid = null } = {}) {
  fs.mkdirSync(path.join(P.project, 'work', '.jobs'), { recursive: true });
  fs.writeFileSync(F.preState, JSON.stringify(side));
  if (jobPid) fs.writeFileSync(path.join(P.project, 'work', '.jobs', 'prerender.json'), JSON.stringify({ name: 'prerender', pid: jobPid, state: 'running', startedAt: Date.now() }));
}
function donePrerender(fp, content = 'pre-video') {
  fs.writeFileSync(F.pre, content);
  setPrerender({ state: 'done', fingerprint: fp, size: Buffer.byteLength(content), percent: 100 });
}

beforeEach(() => { calls = []; sleepers = []; P = makeProject(); F = D.deliverPaths(P.project); });
afterEach(() => {
  for (const p of sleepers) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* 已經走了 */ } }
  fs.rmSync(P.root, { recursive: true, force: true });
});

// ---------- 參數 ----------

test('參數：--prerender／--cancel／--wait／--said；看不懂的帶 → 改法', () => {
  assert.deepEqual(CLI.parseDeliverArgs(['--project', 'p', '--prerender', '--workers', '2']), { project: 'p', prerender: true, workers: '2' });
  assert.deepEqual(CLI.parseDeliverArgs(['--project=p', '--said=可以了=輸出', '--wait', '30', '--force']), { project: 'p', said: '可以了=輸出', wait: '30', force: true });
  assert.throws(() => CLI.parseDeliverArgs(['--zzz']), /沒有 --zzz 這個參數 → 看用法/);
  assert.throws(() => CLI.parseDeliverArgs(['x']), /看不懂的參數「x」→ 看用法/);
  assert.throws(() => CLI.parseDeliverArgs(['--wait', 'abc']), /--wait 要寫數字.*→ 例：--wait 300/);
  assert.throws(() => CLI.parseDeliverArgs(['--quality', 'best']), /--quality 只能是.*→ 交付一律用 looks/);
  assert.throws(() => CLI.parseDeliverArgs(['--prerender', '--cancel']), /只能選一個 → 看用法/);
});

// ---------- 內容指紋 ----------

test('指紋：沒變就一樣；只換 index.html 時間、測試片段、剪映合成、快取都不算變', () => {
  const fp = D.contentFingerprint(P);
  assert.equal(D.contentFingerprint(P), fp);
  fs.utimesSync(path.join(P.out, 'index.html'), new Date(), new Date(Date.now() + 5000));   // build 每次都會更新 index.html 的時間
  fs.writeFileSync(path.join(P.out, 'compositions', 'test-clip.html'), 'x');
  fs.writeFileSync(path.join(P.out, 'compositions', 'captions-test.html'), 'x');
  fs.writeFileSync(path.join(P.out, 'compositions', 'capcut-s01.html'), 'x');
  fs.writeFileSync(path.join(P.out, 'capcut.json'), '{}');
  fs.writeFileSync(path.join(P.out, '.build-manifest.json'), '{}');
  for (const d of ['.cache', '.editor', '.storyboard-shots', 'node_modules', 'renders']) { fs.mkdirSync(path.join(P.out, d), { recursive: true }); fs.writeFileSync(path.join(P.out, d, 'f.txt'), 'x'); }
  assert.equal(D.contentFingerprint(P), fp);
});

test('指紋：plan.json、字幕、合成、kit、assets（大小或時間）、畫質任一變了就不同', () => {
  const fp = D.contentFingerprint(P);
  const differs = (name, fn) => { const before = D.contentFingerprint(P); fn(); assert.notEqual(D.contentFingerprint(P), before, name); };
  differs('plan.json', () => fs.appendFileSync(P.plan, ' '));
  differs('rough.srt', () => fs.appendFileSync(P.srt, '\n'));
  differs('合成內容', () => fs.writeFileSync(path.join(P.out, 'compositions', 'a.html'), '<div>b</div>'));
  differs('新合成', () => fs.writeFileSync(path.join(P.out, 'compositions', 'x-new.html'), '<div></div>'));
  differs('kit', () => fs.writeFileSync(path.join(P.out, 'kit', 'x.css'), 'b{}'));
  differs('底片換大小', () => fs.appendFileSync(path.join(P.out, 'assets', 'rough.mp4'), '1'));
  differs('底片重新編碼（只換時間）', () => fs.utimesSync(path.join(P.out, 'assets', 'rough.mp4'), new Date(), new Date(Date.now() + 9000)));
  differs('新音效', () => fs.writeFileSync(path.join(P.out, 'assets', 'sfx', 'a.wav'), 'x'));
  assert.notEqual(D.contentFingerprint(P), fp);
  assert.notEqual(D.contentFingerprint(P, { quality: 'draft' }), D.contentFingerprint(P));
  assert.notEqual(D.contentFingerprint(P, { fps: 60 }), D.contentFingerprint(P));
});

// ---------- 進度與 log ----------

test('指紋：預設的畫素與字幕不改指紋（舊的 final.mp4 照樣對得上）；4K、不燒字幕各自不同', () => {
  const a = D.contentFingerprint(P);
  assert.equal(D.contentFingerprint(P, { resolution: '1080p', captions: 'burn' }), a);
  const k4 = D.contentFingerprint(P, { resolution: '4k' }), off = D.contentFingerprint(P, { captions: 'off' });
  assert.notEqual(k4, a);
  assert.notEqual(off, a);
  assert.notEqual(k4, off);
  // 不燒字幕的合成和字幕檔是輸出時另外產生的，不算內容變了
  fs.writeFileSync(path.join(P.out, 'compositions', 'final-nocaps.html'), '<html>nocaps</html>');
  assert.equal(D.contentFingerprint(P), a);
});

test('選項：4K＋不燒字幕 → 測試片段那次 build 加 --nocaps、render 不燒字幕的合成＋--resolution、字幕另存 final.srt、驗收帶 --scale 2 --no-captions；不留增量的底', async () => {
  let testArgs, renderArgs, qcArgs;
  const job = await deliver(deps({
    testBuild: (args) => { testArgs = args; fs.writeFileSync(path.join(P.out, 'final-nocaps.srt'), '1\n00:00:00,000 --> 00:00:01,000\n字幕\n'); return { code: 0, stdout: '', stderr: '' }; },
    render: (args) => { renderArgs = args; fs.writeFileSync(args[args.indexOf('--output') + 1], 'new-video'); return { code: 0, stdout: '', stderr: '' }; },
    qc: (args) => { qcArgs = args; return { code: 0, stdout: JSON.stringify({ ok: true, errors: 0, warnings: 0, checks: [] }), stderr: '' }; },
  }, { resolution: '4k', captions: 'off' }));
  assert.equal(job.ok, true, job.message);
  assert.ok(testArgs.includes('--nocaps'));
  assert.equal(renderArgs[renderArgs.indexOf('render') + 1], '-c');
  assert.equal(renderArgs[renderArgs.indexOf('-c') + 1], 'compositions/final-nocaps.html');
  assert.equal(renderArgs[renderArgs.indexOf('--resolution') + 1], 'landscape-4k');
  assert.ok(qcArgs.includes('--no-captions'));
  assert.equal(qcArgs[qcArgs.indexOf('--scale') + 1], '2');
  assert.match(fs.readFileSync(path.join(P.project, 'output', 'final.srt'), 'utf8'), /字幕/);
  assert.deepEqual(job.options, { resolution: '4k', captions: 'off' });
  assert.match(job.message, /（4K、不燒字幕，另存 output\/final\.srt）$/);
  assert.ok(!fs.existsSync(F.finalContent), '4K／不燒字幕的成品不能當下次增量的底');
  assert.ok(D.finalIsCurrent(P, D.contentFingerprint(P, { resolution: '4k', captions: 'off' })));
  assert.ok(!D.finalIsCurrent(P, D.contentFingerprint(P)), '換回預設要重新輸出');
});

test('選項：預設 → 不加 --nocaps、--resolution、--scale；4K 磁碟不夠就不開始', async () => {
  let renderArgs, qcArgs;
  const job = await deliver(deps({
    render: (args) => { renderArgs = args; fs.writeFileSync(args[args.indexOf('--output') + 1], 'new-video'); return { code: 0, stdout: '', stderr: '' }; },
    qc: (args) => { qcArgs = args; return { code: 0, stdout: JSON.stringify({ ok: true, errors: 0, warnings: 0, checks: [] }), stderr: '' }; },
  }));
  assert.equal(job.ok, true, job.message);
  for (const a of ['-c', '--resolution']) assert.ok(!renderArgs.includes(a), a);
  for (const a of ['--scale', '--no-captions']) assert.ok(!qcArgs.includes(a), a);
  calls = [];
  const big = await deliver(deps({}, { force: true, resolution: '4k', report: async () => ({ report: { outputDur: 1e9, items: [] } }) }));
  assert.equal(big.ok, false);
  assert.match(big.message, /^磁碟剩 [\d.]+ GB，輸出 4K 大約要 [\d.]+ GB 暫存空間。$/);
  assert.ok(!calls.includes('render'));
});

test('參數：--resolution 4k／4K、--no-captions；其他畫素 → 改法；--prerender 不能加', () => {
  assert.equal(CLI.parseDeliverArgs(['--resolution', '4K']).resolution, '4k');
  assert.equal(CLI.parseDeliverArgs(['--no-captions'])['no-captions'], true);
  assert.throws(() => CLI.parseDeliverArgs(['--resolution', '720p']), /--resolution 只能是 1080p、4k/);
  assert.throws(() => CLI.parseDeliverArgs(['--prerender', '--no-captions']), /預先 render 只做 1080p＋燒字幕/);
});

test('進度：認 @hf-progress 和進度條，一塊一塊來也行、只往上走，[INFO] 裡的 % 不算', () => {
  const got = [];
  const parse = D.progressParser((p, frames) => got.push([p, frames]));
  parse('  █░░  5%  Compiling composition\n@hf-progress {"code":"compile","pct":5}\n@hf-prog');
  parse('ress {"code":"capture","done":1,"total":4650,"pct":25}\n[INFO] [Render] 99% of something\n');
  parse('@hf-progress {"code":"capture","done":2,"total":4650,"pct":20}\n  ██  37%  Capturing\n');
  assert.deepEqual(got, [[5, null], [25, 4650], [37, 4650]]);
});

// ---------- 流程 ----------

test('流程：照順序跑完，測試片段用完成影片秒數，整支換成 final.mp4，記指紋與 ④ 通過，log 全文進 work/render.log', async () => {
  fs.writeFileSync(F.final, 'old-video');
  let testArg, env;
  const seen = [];
  const job = await deliver(deps({
    testBuild: (args) => { testArg = args[args.indexOf('--test') + 1]; return { code: 0, stdout: '', stderr: '' }; },
    render: (args, opts) => { env = opts.env; opts.onData?.('@hf-progress {"code":"capture","pct":37}\n完整 log 內容\n'); fs.writeFileSync(args[args.indexOf('--output') + 1], 'new-video'); return { code: 0, stdout: '', stderr: '' }; },
  }, { renderEnv: { HYPERFRAMES_RENDER_DETACHED: '1' }, onPercent: (p) => seen.push(p) }));
  assert.deepEqual(calls, ['build', 'testBuild', 'testRender', 'probe', 'render', 'qc']);
  assert.equal(testArg, '10.25,4', '有 edit.cuts 時 start 是 rough.mp4 秒數，--test 要用 out.start');
  assert.equal(env.HYPERFRAMES_RENDER_DETACHED, '1');
  assert.equal(job.ok, true);
  assert.equal(job.source, 'render');
  assert.equal(job.percent, 100);
  assert.deepEqual(job.warnings, ['音量偏小']);
  assert.deepEqual(seen, [0, 37]);
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'new-video');
  assert.equal(fs.existsSync(F.tmp), false);
  assert.equal(fs.existsSync(F.lock), false, '做完放掉鎖');
  assert.match(fs.readFileSync(F.log, 'utf8'), /=== 整支.*===\n@hf-progress[^\n]*\n完整 log 內容/);
  assert.deepEqual(rowsOf().map((r) => r.replace(/^\| [^|]+\| /, '')), ['④ 完成影片預覽 | 通過 | 「可以了，輸出完成影片」 | output/final.mp4 |']);
  assert.equal(D.finalIsCurrent(P, D.contentFingerprint(P)), true);
});

test('流程：內容沒變再跑一次只重跑驗收、不重複記 ④；--force 才重新 render；手動蓋掉 final.mp4 就不算最新', async () => {
  await deliver(deps());
  calls = [];
  const again = await deliver(deps());
  assert.deepEqual(calls, ['build', 'qc']);
  assert.equal(again.source, 'same');
  assert.equal(again.ok, true);
  assert.equal(rowsOf().length, 1, '④ 已經通過，不重複');
  calls = [];
  const forced = await deliver(deps({}, { force: true }));
  assert.deepEqual(calls, ['build', 'testBuild', 'testRender', 'probe', 'render', 'qc']);
  assert.equal(forced.source, 'render');
  fs.writeFileSync(F.final, 'someone-else-rendered-this-longer');
  assert.equal(D.finalIsCurrent(P, D.contentFingerprint(P)), false);
  fs.rmSync(F.final);
  assert.equal(D.finalIsCurrent(P, D.contentFingerprint(P)), false);
});

test('流程：④ 後來又待回覆（又改過）→ 再通過時加一列', async () => {
  await deliver(deps());
  fs.writeFileSync(progressFile(P.project), fs.readFileSync(progressFile(P.project), 'utf8').replace('\n\n## 回饋輪', '\n| 2026-11-06 12:00 | ④ 完成影片預覽 | 待回覆 | — | — |\n\n## 回饋輪'));
  fs.appendFileSync(P.plan, ' ');
  await deliver(deps());
  assert.equal(rowsOf().length, 2);
});

test('流程：失敗都留 → 改法；測試片段沒聲音不 render；整支失敗舊檔不動；驗收 ✖ 留檔、不記通過', async () => {
  fs.writeFileSync(F.final, 'old-video');
  let job = await deliver(deps({ probe: () => ({ code: 0, stdout: 'video\n', stderr: '' }) }));
  assert.equal(job.ok, false);
  assert.equal(job.step, 'test');
  assert.equal(calls.includes('render'), false);
  assert.match(job.errors[0], /video/);
  assert.ok(job.fix);
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'old-video');

  calls = [];
  job = await deliver(deps({ render: (args) => { fs.writeFileSync(args[args.indexOf('--output') + 1], 'half'); return { code: 1, stdout: '[INFO] 開始\n✖ Error: Chrome 掛了\n後面一行\n', stderr: '' }; } }));
  assert.equal(job.ok, false);
  assert.deepEqual(job.errors, ['✖ Error: Chrome 掛了'], '抓有錯字樣的那行，不是最後一行');
  assert.match(job.fix, /render\.log/);
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'old-video');
  assert.equal(fs.existsSync(F.tmp), false);

  calls = [];
  job = await deliver(deps({ qc: () => ({ code: 1, stdout: JSON.stringify({ ok: false, errors: 1, warnings: 0, checks: [{ level: 'error', text: '長度不符' }] }), stderr: '' }) }));
  assert.equal(job.ok, false);
  assert.deepEqual(job.errors, ['長度不符']);
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'new-video');
  assert.equal(rowsOf().length, 0);

  calls = [];
  job = await deliver(deps({}, { build: async () => [200, { ok: false, issues: { errors: ['s05 文字超出上限'] } }] }));
  assert.equal(job.step, 'build');
  assert.deepEqual(job.errors, ['s05 文字超出上限']);
  assert.deepEqual(calls, []);
});

test('流程：內容設計動畫還是空白畫布 → 不 build、不 render、不記 ④，訊息列段號；做完就放行', async () => {
  fs.writeFileSync(P.plan, JSON.stringify({ version: 1, scenes: [{ id: 'd01', type: 'custom', design: true, from: '#1', to: '#2' }, { id: 's01', scene: 'key-point', from: '#3', to: '#4' }] }));
  const design = path.join(P.out, 'compositions', 'x-design-d01.html');
  let job = await deliver(deps());   // 還沒有檔
  assert.equal(job.ok, false);
  assert.match(job.message, /內容設計動畫還沒做：d01/);
  assert.match(job.fix, /design-build\.md/);
  assert.deepEqual(calls, []);
  assert.equal(rowsOf().length, 0);
  fs.writeFileSync(design, '<template id="x"><div data-design-blank="1">占位字</div></template>');
  calls = [];
  job = await deliver(deps());       // 空白畫布
  assert.equal(job.ok, false);
  assert.deepEqual(calls, []);
  assert.equal(fs.existsSync(F.final), false);
  fs.writeFileSync(design, '<template id="x"><div>真的動畫</div></template>');
  calls = [];
  job = await deliver(deps());       // 做完了
  assert.equal(job.ok, true);
  assert.ok(calls.includes('render'));
});

test('流程：分鏡表有改動還沒套回 → 不輸出、給 --apply-storyboard；套回後放行；沒有紀錄的舊專案照常', async () => {
  const { recordStoryboard } = await imp('lib/storyboard-state.mjs');
  const sb = path.join(P.project, 'work', 'storyboard.md');
  fs.writeFileSync(sb, '# 分鏡表\n');           // 沒有紀錄（舊專案、沒跑過 --storyboard）：不擋
  assert.equal(D.deliverBlocker(P), null);
  recordStoryboard(P, '# 分鏡表\n');
  assert.equal(D.deliverBlocker(P), null);      // 工具寫的，沒人改過
  fs.writeFileSync(sb, '# 分鏡表\n使用者改的字\n');
  const job = await deliver(deps());
  assert.equal(job.ok, false);
  assert.match(job.message, /還沒套回/);
  assert.match(job.fix, /--apply-storyboard/);
  assert.deepEqual(calls, []);
  recordStoryboard(P, fs.readFileSync(sb, 'utf8'));   // --apply-storyboard 做的事
  calls = [];
  assert.equal((await deliver(deps())).ok, true);
});

test('流程：整支做好了但 final.mp4 換不過去（被別的程式開著）→ 不白做，留著；再跑一次直接接手', async () => {
  fs.mkdirSync(F.final);   // 用資料夾擋住改名（Windows 上是播放器開著舊檔）
  fs.writeFileSync(path.join(F.final, 'x'), 'x');
  let job = await deliver(deps());
  assert.equal(job.ok, false);
  assert.equal(calls.filter((c) => c === 'render').length, 1);
  assert.match(job.message, /換不過去/);
  assert.match(job.fix, /不用重新 render/);
  assert.equal(fs.readFileSync(F.pre, 'utf8'), 'new-video');
  fs.rmSync(F.final, { recursive: true });
  calls = [];
  job = await deliver(deps());
  assert.deepEqual(calls, ['build', 'probe', 'qc']);
  assert.equal(job.ok, true);
  assert.equal(job.source, 'prerender');
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'new-video');
});

test('同時只能一個：別的行程（剪輯台）在輸出就不開始；pid 被別的程式重用不算', async () => {
  const stranger = sleeper();
  fs.mkdirSync(path.dirname(F.lock), { recursive: true });
  fs.writeFileSync(F.lock, JSON.stringify({ pid: stranger.pid, by: 'editor' }));
  assert.equal(D.lockHolder(P), null);
  const other = sleeper(60000, 'editor.mjs');
  fs.writeFileSync(F.lock, JSON.stringify({ pid: other.pid, by: 'editor' }));
  fs.writeFileSync(F.tmp, 'someone-is-rendering');
  assert.equal(D.lockHolder(P).by, 'editor');
  const job = await deliver(deps());
  assert.equal(job.ok, false);
  assert.deepEqual(calls, []);
  assert.match(job.message, /剪輯台正在輸出/);
  assert.equal(fs.readFileSync(F.tmp, 'utf8'), 'someone-is-rendering', '別人正在寫的暫存不能刪');
  assert.equal(JSON.parse(fs.readFileSync(F.lock, 'utf8')).pid, other.pid, '別人的鎖不動');
  // 鎖的主人不在了＝沒有人在輸出
  process.kill(other.pid, 'SIGKILL');
  await new Promise((r) => other.on('exit', r));
  assert.equal(D.lockHolder(P), null);
  assert.equal((await deliver(deps())).ok, true);
});

// ---------- 預先 render：接手 ----------

test('接手：指紋相同且做完 → 直接搬成 final.mp4、跑驗收，不重 render、不跑測試片段', async () => {
  fs.writeFileSync(F.final, 'old-video');
  donePrerender(D.contentFingerprint(P));
  const job = await deliver(deps());
  assert.deepEqual(calls, ['build', 'probe', 'qc']);
  assert.equal(job.source, 'prerender');
  assert.equal(job.ok, true);
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'pre-video');
  for (const f of [F.pre, F.preState]) assert.equal(fs.existsSync(f), false, f);
  assert.equal(D.finalIsCurrent(P, D.contentFingerprint(P)), true);
  assert.equal(rowsOf().length, 1);
});

test('接手：指紋不同（後來又改過）→ 丟掉、照常 render', async () => {
  donePrerender(D.contentFingerprint(P));
  fs.appendFileSync(P.plan, ' ');
  const job = await deliver(deps());
  assert.deepEqual(calls, ['build', 'testBuild', 'testRender', 'probe', 'render', 'qc']);
  assert.equal(job.source, 'render');
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'new-video');
  assert.equal(fs.existsSync(F.pre), false);
});

test('接手：檔案不完整（沒有音軌）、大小對不上 → 照常 render', async () => {
  donePrerender(D.contentFingerprint(P));
  let probes = 0;
  let job = await deliver(deps({ probe: () => ({ code: 0, stdout: probes++ ? 'video\naudio\n' : 'video\n', stderr: '' }) }));
  assert.equal(job.source, 'render');
  calls = [];
  fs.rmSync(F.final);
  donePrerender(D.contentFingerprint(P));
  fs.appendFileSync(F.pre, 'truncated-or-other');
  assert.equal(D.prerenderInfo(P).state, 'failed');
  job = await deliver(deps());
  assert.equal(job.source, 'render');
});

test('接手：指紋相同還在跑 → 接著等（進度照報），做完就用；不重新開始', async () => {
  const fp = D.contentFingerprint(P), seen = [];
  const worker = sleeper();
  setPrerender({ state: 'running', fingerprint: fp, percent: 40 }, { jobPid: worker.pid });
  const onPercent = (p) => {   // 看到進度才往下走，不靠時間
    seen.push(p);
    if (p === 40) setPrerender({ state: 'running', fingerprint: fp, percent: 80 });
    if (p === 80) {
      fs.writeFileSync(F.pre, 'pre-video');
      setPrerender({ state: 'done', fingerprint: fp, percent: 100, size: 9 });
      fs.writeFileSync(path.join(P.project, 'work', '.jobs', 'prerender.json'), JSON.stringify({ name: 'prerender', pid: worker.pid, state: 'done', code: 0 }));
    }
  };
  const job = await deliver(deps({}, { onPercent }));
  assert.deepEqual(calls, ['build', 'probe', 'qc']);
  assert.equal(job.source, 'prerender');
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'pre-video');
  assert.deepEqual([...new Set(seen)], [40, 80], '進度從預先 render 的狀態來');
});

test('接手：還在 build 階段（指紋還沒算）也接著等；工作行程死了 → 照常 render', async () => {
  const worker = sleeper();
  setPrerender({ state: 'running', fingerprint: null, percent: null }, { jobPid: worker.pid });
  setTimeout(() => { worker.kill('SIGKILL'); }, 40);
  const job = await deliver(deps());
  assert.deepEqual(calls, ['build', 'testBuild', 'testRender', 'probe', 'render', 'qc']);
  assert.equal(job.source, 'render');
});

test('接手：指紋不同還在跑 → 真的取消舊的（行程不見、狀態清掉）、重新 render', async () => {
  const worker = sleeper();
  setPrerender({ state: 'running', fingerprint: 'old', percent: 40 }, { jobPid: worker.pid });
  fs.writeFileSync(F.prePart, 'half');
  const job = await deliver(deps());
  assert.equal(isAlive(worker.pid), false);
  assert.equal(job.source, 'render');
  assert.equal(calls.filter((c) => c === 'render').length, 1);
  for (const f of [F.prePart, F.preState]) assert.equal(fs.existsSync(f), false, f);
});

test('--force：不接手；會 render 正式的，就把預先 render 收掉', async () => {
  donePrerender(D.contentFingerprint(P));
  const job = await deliver(deps({}, { force: true }));
  assert.equal(job.source, 'render');
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'new-video');
  assert.equal(fs.existsSync(F.pre), false);
});

// ---------- 預先 render：工作本身 ----------

const prerun = async (d, job = D.newJob()) => ({ job, code: await D.runPrerender(P, job, d) });
const preState = () => JSON.parse(fs.readFileSync(F.preState, 'utf8'));
// 假 render：開一個真的行程（給 killTree 收），它結束才回來
const realRender = (job) => async (args) => {
  const p = sleeper();
  job.child = p;
  await new Promise((r) => p.on('close', r));
  return { code: 143, stdout: '', stderr: '' };
};

test('預先 render：--workers 2、render 到 .part、成功才改名，記指紋；不碰 final.mp4、不記 ④', async () => {
  fs.writeFileSync(F.final, 'old-video');
  let args, opt;
  const { code } = await prerun(deps({ render: (a, o) => { args = a; opt = o; o.onData?.('@hf-progress {"code":"capture","done":1,"total":300,"pct":50}\n'); assert.equal(preState().phase, 'render'); fs.writeFileSync(a[a.indexOf('--output') + 1], 'pre-video'); return { code: 0, stdout: '', stderr: '' }; } }, { renderEnv: { HYPERFRAMES_RENDER_DETACHED: '1' } }));
  assert.equal(code, 0);
  assert.equal(args[args.indexOf('--workers') + 1], String(D.PRERENDER.workers));
  assert.equal(args[args.indexOf('--output') + 1], F.prePart);
  assert.equal(opt.env.HYPERFRAMES_RENDER_DETACHED, '1');
  const st = preState();
  assert.equal(st.state, 'done');
  assert.equal(st.fingerprint, D.contentFingerprint(P));
  assert.equal(st.size, 9);
  assert.equal(fs.readFileSync(F.pre, 'utf8'), 'pre-video');
  assert.equal(fs.existsSync(F.prePart), false);
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'old-video');
  assert.equal(rowsOf().length, 0);
  assert.equal(D.prerenderInfo(P).state, 'done');
});

test('預先 render：失敗只記狀態（結束碼 1），舊檔不動，之後 deliver 照常 render', async () => {
  fs.writeFileSync(F.final, 'old-video');
  const { code } = await prerun(deps({ render: (a) => { fs.writeFileSync(a[a.indexOf('--output') + 1], 'half'); return { code: 1, stdout: '', stderr: 'Error: boom' }; } }));
  assert.equal(code, 1);
  assert.equal(preState().state, 'failed');
  assert.match(preState().reason, /boom/);
  assert.equal(fs.existsSync(F.prePart), false);
  assert.equal(fs.existsSync(F.pre), false);
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'old-video');
  calls = [];
  const job = await deliver(deps());
  assert.equal(job.source, 'render');
  assert.equal(job.ok, true);
});

test('預先 render：重新產生失敗不 render；final.mp4 已經是現在的內容就不做', async () => {
  let { code } = await prerun(deps({}, { build: async () => [200, { ok: false, issues: { errors: ['s05 有錯'] } }] }));
  assert.equal(code, 1);
  assert.match(preState().reason, /s05 有錯/);
  assert.equal(calls.includes('render'), false);
  await deliver(deps());
  calls = [];
  ({ code } = await prerun(deps()));
  assert.equal(code, 0);
  assert.equal(preState().state, 'skipped');
  assert.equal(calls.includes('render'), false);
});

test('預先 render：使用者存檔（內容變了）→ 自己收掉 render、不留 .part、狀態 stale', async () => {
  const job = D.newJob();
  const run = fakeRun({ render: realRender(job) });
  setTimeout(() => fs.appendFileSync(P.plan, ' '), 60);
  const code = await D.runPrerender(P, job, deps({}, { run, watchMs: 20 }));
  assert.equal(code, 0, '內容改過不算失敗');
  assert.equal(preState().state, 'stale');
  assert.equal(isAlive(sleepers[0].pid), false, 'render 被收掉了');
  assert.equal(fs.existsSync(F.prePart), false);
  assert.equal(D.prerenderInfo(P).state, 'stale');
});

test('預先 render：上限保護——卡住太久、總時間超過上限都收掉，狀態 failed', async () => {
  let job = D.newJob();
  await D.runPrerender(P, job, deps({}, { run: fakeRun({ render: realRender(job) }), watchMs: 10, stallMs: 30 }));
  assert.equal(preState().state, 'failed');
  assert.match(preState().reason, /沒有進度/);
  assert.equal(isAlive(sleepers.at(-1).pid), false);

  job = D.newJob();
  const ticking = async (args, opts) => {
    const p = sleeper();
    job.child = p;
    const t = setInterval(() => opts.onData?.(`@hf-progress {"code":"capture","done":1,"total":3,"pct":${Math.min(99, Math.floor(Math.random() * 99))}}\n`), 3);
    await new Promise((r) => p.on('close', r));
    clearInterval(t);
    return { code: 143, stdout: '', stderr: '' };
  };
  await D.runPrerender(P, job, deps({}, { run: fakeRun({ render: ticking }), watchMs: 10, capMs: 40, stallMs: 60000 }));
  assert.equal(preState().state, 'failed');
  assert.match(preState().reason, /超過上限/);
  assert.equal(isAlive(sleepers.at(-1).pid), false);

  job = D.newJob();
  await D.runPrerender(P, job, deps({}, { run: fakeRun({ render: realRender(job) }), watchMs: 10, freeBytes: () => 1024 ** 3 }));
  assert.equal(preState().state, 'failed');
  assert.match(preState().reason, /磁碟只剩不到 5 GB/);
  assert.equal(isAlive(sleepers.at(-1).pid), false);
});

test('prerenderBlocked：記憶體 8 GB 以下、磁碟不夠不跑；其他照跑', () => {
  const GB = 1024 ** 3;
  assert.match(D.prerenderBlocked(P, { totalmem: 8 * GB, freeBytes: 500 * GB }), /記憶體 8 GB/);
  assert.match(D.prerenderBlocked(P, { totalmem: 16 * GB, freeBytes: 5 * GB }), /磁碟只剩 5 GB/);
  assert.equal(D.prerenderBlocked(P, { totalmem: 16 * GB, freeBytes: 500 * GB }), null);
});

// ---------- 開跑（前景那條指令）----------

const logs = () => { const L = []; return { L, log: (s) => L.push(s) }; };
const quick = ['-e', 'setTimeout(() => {}, 3000)'];   // 代替工作行程（不真的 render）

test('--prerender：同內容在跑或做好了不重開；內容改了取消舊的重開；final.mp4 是最新的不做；正式輸出中不做', async () => {
  const fp = D.contentFingerprint(P);
  const worker = sleeper();
  setPrerender({ state: 'running', fingerprint: fp, percent: 40 }, { jobPid: worker.pid });
  let o = logs();
  assert.equal(await CLI.startPrerender(P, {}, { log: o.log, argv: quick }), 0);
  assert.match(o.L.join('\n'), /已經在跑了（40%）/);
  assert.equal(isAlive(worker.pid), true);

  // 內容改了：舊的真的被收掉，開新的
  fs.appendFileSync(P.plan, ' ');
  o = logs();
  assert.equal(await CLI.startPrerender(P, {}, { log: o.log, argv: quick }), 0);
  assert.match(o.L.join('\n'), /取消舊的預先 render/);
  assert.match(o.L.join('\n'), /不用等它/);
  assert.equal(isAlive(worker.pid), false);
  const js = JSON.parse(fs.readFileSync(path.join(P.project, 'work', '.jobs', 'prerender.json'), 'utf8'));
  assert.equal(js.state, 'running');
  sleepers.push({ pid: js.pid });

  // 剛開的（指紋還沒算）：不重開
  o = logs();
  await CLI.startPrerender(P, {}, { log: o.log, argv: quick });
  assert.match(o.L.join('\n'), /已經在跑了/);
  await D.cancelPrerender(P);

  // 做好了
  donePrerender(D.contentFingerprint(P));
  o = logs();
  await CLI.startPrerender(P, {}, { log: o.log, argv: quick });
  assert.match(o.L.join('\n'), /已經做好了/);
  assert.equal(fs.existsSync(F.pre), true);
  await D.cancelPrerender(P);

  // final.mp4 已經是最新的
  await deliver(deps());
  o = logs();
  await CLI.startPrerender(P, {}, { log: o.log, argv: quick });
  assert.match(o.L.join('\n'), /不用預先 render/);
  assert.equal(fs.existsSync(path.join(P.project, 'work', '.jobs', 'prerender.json')), false);

  // 正式輸出中
  fs.appendFileSync(P.plan, ' ');
  const other = sleeper(60000, 'editor.mjs');
  fs.writeFileSync(F.lock, JSON.stringify({ pid: other.pid, by: 'editor' }));
  o = logs();
  await CLI.startPrerender(P, {}, { log: o.log, argv: quick });
  assert.match(o.L.join('\n'), /正在正式輸出.*剪輯台/);
  assert.equal(fs.existsSync(path.join(P.project, 'work', '.jobs', 'prerender.json')), false);
});

test('deliver.mjs：上次的結果沒印出來、內容也沒變 → 交代結果不重跑；內容改過 → 那個結果過期，重新輸出', async () => {
  await deliver(deps());
  const jobs = path.join(P.project, 'work', '.jobs');
  fs.mkdirSync(jobs, { recursive: true });
  fs.writeFileSync(path.join(jobs, 'deliver.json'), JSON.stringify({ name: 'deliver', pid: process.pid, state: 'done', code: 0, reported: false }));
  fs.writeFileSync(path.join(jobs, 'deliver.log'), '✔ 上次的結果\n');
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'deliver.mjs'), '--project', P.project, ...a], { cwd: P.root, encoding: 'utf8' });
  const same = run('--wait', '0');
  assert.equal(same.status, 0, same.stdout + same.stderr);
  assert.match(same.stdout, /✔ 上次的結果/);

  fs.writeFileSync(path.join(jobs, 'deliver.json'), JSON.stringify({ name: 'deliver', pid: process.pid, state: 'done', code: 0, reported: false }));
  fs.appendFileSync(P.plan, ' ');
  const changed = run('--wait', '0');
  assert.equal(changed.status, 75, changed.stdout + changed.stderr);
  assert.doesNotMatch(changed.stdout, /上次的結果/);
  assert.match(changed.stdout, /→ 下一步：再跑一次同一條指令會接著等，不會重跑\nnode .*deliver\.mjs/);
  const js = JSON.parse(fs.readFileSync(path.join(jobs, 'deliver.json'), 'utf8'));
  sleepers.push({ pid: js.pid });   // 真的開了背景工作（假專案的 build 會失敗，這裡只看它有重開）
  assert.notEqual(js.pid, process.pid);
});

// ---------- 收行程樹 ----------

// 做一棵和 render 一樣的樹：根（node）→ 自己一個 group 的「Chrome」（detached）→ 它的子行程；另一支不理 SIGTERM。pid 寫進檔案
const TREE = `
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const keep = 'setInterval(() => {}, 1000);';
const chrome = spawn(process.execPath, ['-e', keep + "const { spawn } = require('node:child_process'); const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); process.send(c.pid);"], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
const stubborn = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.send('ok')"], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
const ids = { root: process.pid, chrome: chrome.pid, stubborn: stubborn.pid };
let wait = 2;
const done = () => { if (--wait === 0) fs.writeFileSync(process.argv[1], JSON.stringify(ids)); };
chrome.on('message', (c) => { ids.renderer = c; done(); });
stubborn.on('message', done);
setInterval(() => {}, 1000);
`;

test('killTree：連自己一個 process group 的 Chrome 和它的子行程一起收；不理 SIGTERM 的補 SIGKILL', { skip: process.platform === 'win32' }, async () => {
  const idsFile = path.join(P.root, 'tree.json');
  const root = spawn(process.execPath, ['-e', TREE, idsFile], { detached: true, stdio: 'ignore' });
  for (let i = 0; i < 1000 && !fs.existsSync(idsFile); i++) await sleep(20);
  assert.ok(fs.existsSync(idsFile), '測試用的行程樹沒起來');
  const ids = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
  assert.notEqual(spawnSync('ps', ['-o', 'pgid=', '-p', String(ids.chrome)], { encoding: 'utf8' }).stdout.trim(), String(ids.root), '前提：Chrome 不在根的 group');
  const tree = D.processTree(ids.root);
  for (const k of ['root', 'chrome', 'renderer', 'stubborn']) assert.ok(tree.has(ids[k]), k);
  const res = await D.killTree(ids.root, { graceMs: 400, pollMs: 50 });
  assert.deepEqual(res.survivors, []);
  for (const k of ['root', 'chrome', 'renderer', 'stubborn']) {
    const stat = spawnSync('ps', ['-o', 'stat=', '-p', String(ids[k])], { encoding: 'utf8' }).stdout.trim();
    assert.ok(!stat || stat.startsWith('Z'), `${k}（${ids[k]}）還在：${stat}`);
  }
  root.unref();
});

test('killTree：順便刪這次收掉的 render 留下的影格暫存；別人的（主人還活著、沒有 owner.json）不動', { skip: process.platform === 'win32' }, async () => {
  const mk = (owner) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-render-')); fs.writeFileSync(path.join(d, 'frame.jpg'), 'x'); if (owner) fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify(owner)); return d; };
  const victim = sleeper(), other = sleeper();
  const mine = mk({ pid: victim.pid, host: 'h', boot: 'b' }), theirs = mk({ pid: other.pid, host: 'h', boot: 'b' }), noOwner = mk(null);
  try {
    await D.killTree(victim.pid, { pollMs: 20 });
    assert.equal(fs.existsSync(mine), false, '收掉的 render 的暫存要刪');
    assert.equal(fs.existsSync(theirs), true);
    assert.equal(fs.existsSync(noOwner), true);
  } finally {
    for (const d of [mine, theirs, noOwner]) fs.rmSync(d, { recursive: true, force: true });
  }
});

test('cancelPrerender：收掉工作行程、清掉暫存與狀態；沒在跑也不出錯', async () => {
  assert.deepEqual((await D.cancelPrerender(P)).survivors, []);
  const worker = sleeper();
  setPrerender({ state: 'running', fingerprint: 'x' }, { jobPid: worker.pid });
  fs.writeFileSync(F.prePart, 'half');
  fs.writeFileSync(F.pre, 'old');
  assert.deepEqual((await D.cancelPrerender(P)).survivors, []);
  assert.equal(isAlive(worker.pid), false);
  for (const f of [F.prePart, F.pre, F.preState]) assert.equal(fs.existsSync(f), false, f);
  assert.equal(D.prerenderInfo(P).state, 'none');
});

test('reapRender：工作行程被砍後留下的 render 收掉；pid 被別的程式重用就不動', { skip: process.platform === 'win32' }, async () => {
  const other = sleeper();
  fs.mkdirSync(path.dirname(F.renderPid('final')), { recursive: true });
  fs.writeFileSync(F.renderPid('final'), JSON.stringify({ pid: other.pid }));
  assert.equal(await D.reapRender(P, 'final'), false);
  assert.equal(isAlive(other.pid), true);
  assert.equal(fs.existsSync(F.renderPid('final')), false);
  const render = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'node_modules/hyperframes/dist/cli.js', 'render'], { detached: true, stdio: 'ignore' });
  sleepers.push(render);
  fs.writeFileSync(F.renderPid('final'), JSON.stringify({ pid: render.pid }));
  assert.equal(await D.reapRender(P, 'final'), true);
  assert.equal(isAlive(render.pid), false);
});

test('deliver.mjs --cancel：收掉背景的輸出和預先 render、清暫存；別的 shell 在等的看得到它被結束了；沒東西可取消也不出錯', async () => {
  const deliverJob = sleeper(60000, 'deliver.mjs'), preJob = sleeper();
  fs.mkdirSync(path.join(P.project, 'work', '.jobs'), { recursive: true });
  fs.writeFileSync(path.join(P.project, 'work', '.jobs', 'deliver.json'), JSON.stringify({ name: 'deliver', pid: deliverJob.pid, state: 'running', startedAt: Date.now() }));
  fs.writeFileSync(F.lock, JSON.stringify({ pid: deliverJob.pid, by: 'cli' }));
  fs.writeFileSync(F.tmp, 'half');
  setPrerender({ state: 'running', fingerprint: 'x' }, { jobPid: preJob.pid });
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'deliver.mjs'), '--project', P.project, ...a], { cwd: P.root, encoding: 'utf8' });
  const r = run('--cancel');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /已取消 2 個背景工作/);
  for (const p of [deliverJob, preJob]) {   // spawnSync 期間這裡收不到子行程結束（殭屍還算活著）：等事件來
    if (p.exitCode === null && p.signalCode === null) await new Promise((res) => p.on('exit', res));
    assert.equal(isAlive(p.pid), false);
  }
  for (const f of [F.tmp, F.lock, F.preState]) assert.equal(fs.existsSync(f), false, f);
  const { jobState } = await imp('lib/job.mjs');
  const js = jobState(P.project, 'deliver');
  assert.equal(js.state, 'failed');
  assert.equal(js.died, true);
  const again = run('--cancel');
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /現在沒有在背景輸出或預先 render/);
});

// ---------- 停點紀錄 ----------

test('停點紀錄：加在表的最後一列、保留 CRLF；已經通過不重複；沒有檔案或沒有表不寫', () => {
  const f = progressFile(P.project);
  fs.writeFileSync(f, STOP_LOG.replace(/\n/g, '\r\n'));
  assert.equal(D.recordStopPassed(P.project, { said: '在剪輯台按「輸出完成影片」', when: new Date(2026, 10, 6, 9, 5) }), true);
  const lines = fs.readFileSync(f, 'utf8').split('\r\n');
  const at = lines.findIndex((l) => l.includes('待回覆'));
  assert.equal(lines[at + 1], '| 2026-11-06 09:05 | ④ 完成影片預覽 | 通過 | 「在剪輯台按「輸出完成影片」」 | output/final.mp4 |');
  assert.equal(lines[at + 2], '');
  assert.equal(D.recordStopPassed(P.project, { said: '再一次' }), false);
  assert.equal(fs.readFileSync(f, 'utf8').split('④').length - 1, 2);
  // 別的停點的通過不算 ④ 通過
  fs.writeFileSync(f, STOP_LOG.replace('④ 完成影片預覽 | 待回覆', '③ 分鏡表 | 通過'));
  assert.equal(D.recordStopPassed(P.project, { said: 'x' }), true);
  fs.writeFileSync(f, '# 沒有那張表\n');
  assert.equal(D.recordStopPassed(P.project, { said: 'x' }), false);
  fs.rmSync(f);
  assert.equal(D.recordStopPassed(P.project, { said: 'x' }), false);
  assert.equal(fs.existsSync(f), false, '沒有檔案不會自己建');
});

// ---------- CLI 的輸出 ----------

test('結束時印：檔案路徑、長度、✖／⚠、驗收截圖；失敗有 → 改法', () => {
  const cwd = process.cwd();
  const ok = { ...D.newJob(), ok: true, source: 'prerender', warnings: ['音量偏小'], errors: [], qc: { errors: 0, warnings: 1, format: { width: 1920, height: 1080, fps: 30, hasAudio: true }, duration: { actual: 155.2 }, sheet: 'x' } };
  const text = CLI.finishLines(P, ok, { size: 38.5 * 1024 ** 2 }).join('\n');
  assert.match(text, new RegExp(`✔ 完成影片：${path.relative(cwd, F.final).split(path.sep).join('/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}（2:35\\.2（155\\.2 秒），1920×1080、30fps、有音軌，39 MB）`));
  assert.match(text, /來源：預先 render（沒有重新 render）/);
  assert.match(text, /驗收：0 個 ✖、1 個 ⚠\n⚠ 音量偏小\n驗收截圖：.*qc-sheet\.jpg/);
  assert.match(text, /→ 完成/);
  const bad = { ...D.newJob(), ok: false, message: '整支輸出失敗', errors: ['Chrome 掛了'], fix: '看 work/render.log' };
  assert.match(CLI.finishLines(P, bad, null).join('\n'), /✖ 整支輸出失敗\n✖ Chrome 掛了\n→ 看 work\/render\.log/);
  const qcBad = { ...D.newJob(), ok: false, message: '驗收沒過', errors: ['長度不符'], fix: '照 ✖ 改', qc: { ok: false, errors: 1, warnings: 0, format: { width: 1920, height: 1080, fps: 30, hasAudio: true }, duration: { actual: 3 }, sheet: null } };
  assert.match(CLI.finishLines(P, qcBad, { size: 1 }).join('\n'), /✖ 完成影片：.*\n驗收：1 個 ✖、0 個 ⚠\n✖ 長度不符\n→ 照 ✖ 改/);
});

test('build 的摘要：只留 AGENTS.md 要回報的六行和音效 ⚠', () => {
  const log = ['版式：橫式', '講者調光：關', '講者瘦臉：關、美顏：關', '人聲響度 −10 LUFS', '音效比例：主音效比人聲小 6 dB', '剪接點微淡化：4 個接點', '結尾配樂：不配', '⚠ [s01 speaker] 別的提醒', '⚠ 音效密度：2 個一分鐘', '⚠ 音效稀疏：0:24–1:35', '產生：27 個檔'].join('\n');
  assert.deepEqual(CLI.buildSummary(log), ['講者調光：關', '講者瘦臉：關、美顏：關', '人聲響度 −10 LUFS', '音效比例：主音效比人聲小 6 dB', '剪接點微淡化：4 個接點', '結尾配樂：不配', '⚠ 音效密度：2 個一分鐘', '⚠ 音效稀疏：0:24–1:35']);
});

// ---------- 實跑：真的 10 秒短片（要 Chrome、ffmpeg；不 mock） ----------

const ffmpegOk = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const chrome = await hasChrome();
const realSkip = !ffmpegOk || !chrome ? '要 ffmpeg 和 HyperFrames 的 Chrome' : false;
const DELIVER = path.join(TOOLS, 'deliver.mjs');

function realProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-deliver-real-'));
  const project = path.join(root, 'projects', 'demo'), work = path.join(project, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100', '-t', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(work, 'rough.mp4')]);
  assert.equal(ff.status, 0, String(ff.stderr));
  const cue = (i, a, b, t) => `${i}\n00:00:0${a},000 --> 00:00:${String(b).padStart(2, '0')},000\n${t}\n`;
  fs.writeFileSync(path.join(work, 'rough.srt'), [cue(1, 1, 3, '第一句字幕'), cue(2, 3, 6, '第二句字幕'), cue(3, 6, 9, '第三句字幕')].join('\n'));
  fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, speakerBox: [700, 200, 1220, 1000], look: { color: 0, slim: 0 }, check: { textSync: false }, scenes: [{ id: 's01', scene: 'concept', from: 2, to: 6.5, slots: { text: '**測試**：短片' } }] }, null, 2));
  fs.writeFileSync(path.join(work, '製作進度.md'), STOP_LOG);
  return { root, project, work, out };
}
const cli = (R, args, opts = {}) => spawnSync(process.execPath, [DELIVER, '--project', R.project, ...args], { cwd: R.root, encoding: 'utf8', timeout: 540000, ...opts });
const probeKinds = (f) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.replace(/,/g, '').trim().split(/\s+/).sort();
const stateOfJob = (R, n) => { try { return JSON.parse(fs.readFileSync(path.join(R.work, '.jobs', `${n}.json`), 'utf8')); } catch { return null; } };

test('實跑：deliver.mjs 一條指令跑完（build、測試片段、整支、驗收、記 ④）；輸出安靜；再跑一次不重 render', { skip: realSkip, timeout: 600000 }, () => {
  const R = realProject();
  try {
    // 等待上限到了：結束碼 75，最後一行是同一條指令；再跑一次接著等、不重跑
    const first = cli(R, ['--said', '可以了，輸出完成影片', '--wait', '1']);
    assert.equal(first.status, 75, first.stdout + first.stderr);
    assert.match(first.stdout, /→ 下一步：再跑一次同一條指令會接著等，不會重跑\nnode .*deliver\.mjs .*"?--said"? .*--wait 1\n$/);
    const worker = stateOfJob(R, 'deliver').pid;
    const r = cli(R, ['--said', '可以了，輸出完成影片']);
    const out = r.stdout;
    assert.equal(r.status, 0, out + r.stderr);
    assert.equal(stateOfJob(R, 'deliver').pid, worker, '同一個背景工作，沒有重跑');
    assert.match(out, /已經在背景跑了，接著等/);
    assert.deepEqual(probeKinds(path.join(R.project, 'output', 'final.mp4')), ['audio', 'video']);
    assert.ok(fs.existsSync(path.join(R.project, 'output', 'test-clips', 'test-clip.mp4')));
    assert.ok(fs.existsSync(path.join(R.project, 'output', 'qc', 'qc-sheet.jpg')));
    assert.equal(fs.existsSync(path.join(R.work, 'final-rendering.mp4')), false);
    assert.match(out, /✔ 完成影片：.*final\.mp4（0:10\.0（10\.0 秒），1920×1080、30fps、有音軌/);
    assert.match(out, /驗收截圖：.*qc-sheet\.jpg/);
    assert.match(out, /^人聲響度 /m);
    assert.doesNotMatch(out, /@hf-progress|\[INFO\]|█/, 'render 的 log 不進 agent 的輸出');
    assert.ok(out.split('\n').length < 60, `輸出 ${out.split('\n').length} 行`);
    assert.ok(fs.statSync(path.join(R.work, 'render.log')).size > 2000, 'render 全文在 work/render.log');
    assert.match(fs.readFileSync(path.join(R.work, '製作進度.md'), 'utf8'), /④ 完成影片預覽 \| 通過 \| 「可以了，輸出完成影片」/);
    const before = fs.statSync(path.join(R.project, 'output', 'final.mp4')).mtimeMs;
    const again = cli(R, []);
    assert.equal(again.status, 0, again.stdout);
    assert.match(again.stdout, /不用重新輸出/);
    assert.equal(fs.statSync(path.join(R.project, 'output', 'final.mp4')).mtimeMs, before);
    assert.equal(fs.readFileSync(path.join(R.work, '製作進度.md'), 'utf8').split('通過').length - 1, 1);
  } finally { fs.rmSync(R.root, { recursive: true, force: true }); }
});

test('實跑：--prerender 立刻返回 → 做完後 deliver.mjs 直接接手不重 render；--cancel 取消時 Chrome 一個不留', { skip: realSkip, timeout: 600000 }, async () => {
  const R = realProject();
  try {
    const t0 = Date.now();
    const start = cli(R, ['--prerender', '--workers', '2']);
    assert.equal(start.status, 0, start.stdout + start.stderr);
    assert.ok(Date.now() - t0 < 15000, `要立刻返回，用了 ${Date.now() - t0} ms`);
    assert.match(start.stdout, /在背景預先 render/);
    const dir = R.project, P2 = { project: dir, plan: path.join(R.out, 'plan.json'), srt: path.join(R.work, 'rough.srt'), out: R.out };

    // 第一次：等它做完
    while (stateOfJob(R, 'prerender')?.state === 'running') await sleep(500);
    const side = JSON.parse(fs.readFileSync(path.join(R.work, 'final-prerender.json'), 'utf8'));
    assert.equal(side.state, 'done', JSON.stringify(side) + fs.readFileSync(path.join(R.work, '.jobs', 'prerender.log'), 'utf8'));
    assert.equal(side.fingerprint, D.contentFingerprint(P2));

    const r = cli(R, []);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /用預先 render 好的完成影片/);
    assert.match(r.stdout, /來源：預先 render/);
    assert.doesNotMatch(r.stdout, /2\/4 測試片段/);
    assert.deepEqual(probeKinds(path.join(R.project, 'output', 'final.mp4')), ['audio', 'video']);
    assert.equal(fs.existsSync(path.join(R.work, 'final-prerender.mp4')), false);

    // 第二次：改內容、重開、render 中取消
    const plan = path.join(R.out, 'plan.json');
    fs.writeFileSync(plan, fs.readFileSync(plan, 'utf8').replace('短片', '短片二'));
    const started = cli(R, ['--prerender', '--workers', '2']);
    assert.equal(started.status, 0, started.stdout);
    let tree = new Set();
    const pid = stateOfJob(R, 'prerender').pid;
    for (let i = 0; i < 600; i++) {   // 等到 Chrome worker 起來（最多 5 分鐘）
      const now = D.processTree(pid);
      for (const p of now) tree.add(p);
      const cmds = spawnSync('ps', ['-o', 'command=', '-p', [...now].join(',')], { encoding: 'utf8' }).stdout;
      if (/chrome-headless-shell/.test(cmds) && /ffmpeg/.test(cmds)) break;
      await sleep(500);
    }
    assert.ok(tree.size >= 3, `樹太小：${[...tree]}`);
    const cancel = cli(R, ['--cancel']);
    assert.equal(cancel.status, 0, cancel.stdout);
    assert.match(cancel.stdout, /已取消 1 個背景工作/);
    await sleep(500);
    const left = spawnSync('ps', ['-o', 'pid=,stat=,command=', '-p', [...tree].join(',')], { encoding: 'utf8' }).stdout.trim().split('\n').filter((l) => l.trim() && !/\sZ/.test(l));
    assert.deepEqual(left, [], '取消後沒有孤兒');
    assert.equal(fs.existsSync(path.join(R.work, 'final-prerender.part.mp4')), false);
    assert.equal(fs.existsSync(path.join(R.work, 'final-prerender.json')), false);
    assert.deepEqual(probeKinds(path.join(R.project, 'output', 'final.mp4')), ['audio', 'video'], '上一支 final.mp4 沒被動到');
  } finally { fs.rmSync(R.root, { recursive: true, force: true }); }
});

test('實跑：capcut.mjs --background 接 status --wait：不用輪詢、做完回來；MOV 有透明通道、沒有留下 .part；再跑一次全部略過', { skip: realSkip, timeout: 600000 }, () => {
  const R = realProject();
  const CAPCUT = path.join(TOOLS, 'capcut.mjs');
  const cap = (...a) => spawnSync(process.execPath, [CAPCUT, ...a], { cwd: R.root, encoding: 'utf8', timeout: 560000 });
  try {
    const bg = cap('--project', R.project, '--background');
    assert.equal(bg.status, 0, bg.stdout + bg.stderr);
    assert.match(bg.stdout, /→ 下一步：等它做完.*\nnode .*capcut\.mjs status --project .* --wait\n$/);
    let st = cap('status', '--project', R.project, '--wait', '500');
    assert.equal(st.status, 0, st.stdout + st.stderr + fs.readFileSync(path.join(R.project, 'output', 'capcut', 'capcut.log'), 'utf8'));
    assert.equal(st.stdout.trim().split('\n').length, 2, `只印結果和下一步：${st.stdout}`);
    assert.match(st.stdout, /✔ 做完了：2／2 支\n→ 清單：/);
    const dir = path.join(R.project, 'output', 'capcut');
    const files = fs.readdirSync(dir);
    assert.ok(files.includes('主軌.mp4') && files.includes('字幕.srt') && files.includes('清單.md'), files.join('、'));
    assert.deepEqual(files.filter((f) => f.includes('.part')), []);
    const mov = files.find((f) => f.endsWith('.mov'));
    assert.match(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', path.join(dir, mov)], { encoding: 'utf8' }).stdout, /yuva/);
    const state = JSON.parse(fs.readFileSync(path.join(dir, '.capcut-state.json'), 'utf8'));
    assert.equal(state.jobs, 3);
    assert.ok(state.workers >= 1);
    assert.match(fs.readFileSync(path.join(dir, 'render.log'), 'utf8'), /^\[主軌\.mp4\] /m, 'render.log 每行帶檔名');
    const again = cap('--project', R.project);
    assert.equal(again.status, 0, again.stdout);
    assert.match(again.stdout, /✔ 2 支都好了（2 支沒變、略過）/);
  } finally { fs.rmSync(R.root, { recursive: true, force: true }); }
});

test('實跑：剪輯台按鈕走同一份流程：真的輸出到驗收、記 ④；再按一次內容沒變不重 render；render 中取消 Chrome 一個不留', { skip: realSkip, timeout: 600000 }, async () => {
  const R = realProject();
  const { startEditor } = await imp('editor.mjs');
  const editor = await startEditor({ flags: { project: R.project, template: TEMPLATE }, cwd: R.root, port: 0, writeState: false });
  const post = (route) => fetch(new URL(route, editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const state = async () => (await fetch(new URL('/api/export', editor.url))).json();
  const final = path.join(R.project, 'output', 'final.mp4');
  try {
    assert.equal((await post('/api/export')).status, 200);
    await editor.ctx.exportJob.done;
    let s = await state();
    assert.equal(s.ok, true, JSON.stringify({ message: s.message, errors: s.errors, log: s.log.slice(-800) }));
    assert.equal(s.percent, 100);
    assert.deepEqual(probeKinds(final), ['audio', 'video']);
    assert.ok(fs.existsSync(path.join(R.project, 'output', 'test-clips', 'test-clip.mp4')));
    assert.match(fs.readFileSync(path.join(R.work, '製作進度.md'), 'utf8'), /④ 完成影片預覽 \| 通過 \| 「在剪輯台按「輸出完成影片」」/);
    const before = fs.statSync(final).mtimeMs;

    assert.equal((await post('/api/export')).status, 200);
    await editor.ctx.exportJob.done;
    s = await state();
    assert.equal(s.ok, true);
    assert.match(s.log, /不用重新輸出/);
    assert.equal(fs.statSync(final).mtimeMs, before);

    // 改內容，整支 render 中取消
    const plan = path.join(R.out, 'plan.json');
    fs.writeFileSync(plan, fs.readFileSync(plan, 'utf8').replace('短片', '短片三'));
    assert.equal((await post('/api/export')).status, 200);
    const seen = new Set();
    let ready = false;
    for (let i = 0; i < 1200 && !ready; i++) {   // 最多 5 分鐘
      const job = editor.ctx.exportJob;
      if (!job.running) break;
      if (job.step === 'render' && job.child?.pid) {
        const tree = D.processTree(job.child.pid);
        for (const p of tree) seen.add(p);
        const cmds = spawnSync('ps', ['-o', 'command=', '-p', [...tree].join(',')], { encoding: 'utf8' }).stdout;
        ready = /chrome-headless-shell/.test(cmds);
      }
      if (!ready) await sleep(250);
    }
    assert.ok(ready, 'render 中應該看得到 Chrome');
    assert.equal((await post('/api/export/cancel')).status, 200);
    await editor.ctx.exportJob.done;
    s = await state();
    assert.equal(s.canceled, true);
    await sleep(1000);
    const left = spawnSync('ps', ['-o', 'pid=,stat=,command=', '-p', [...seen].join(',')], { encoding: 'utf8' }).stdout.trim().split('\n').filter((l) => l.trim() && !/^\s*\d+\s+Z/.test(l));
    assert.deepEqual(left, [], '取消後沒有孤兒');
    assert.equal(fs.statSync(final).mtimeMs, before, '上一支 final.mp4 沒被動到');
    assert.equal(fs.existsSync(path.join(R.work, 'final-rendering.mp4')), false);
  } finally {
    await editor.close();
    fs.rmSync(R.root, { recursive: true, force: true });
  }
});

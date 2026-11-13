// 032 第二階段 P2b：跨線介面（lib/job.mjs 的 runToolUntilDoneSync、editor.mjs --json＋lib/editor-urls.mjs 的 editorUrlsSync）、
// 參數解析改用 lib/cli.mjs（--said=a=b、--say、缺值、模式互斥、經 symlink 執行）、摘要行只認 lib/build-summary.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, TOOLS, imp, tmpDir } from './helpers.mjs';

const J = await imp('lib/job.mjs');
const { editorUrlsSync } = await imp('lib/editor-urls.mjs');
const E = await imp('editor.mjs');
const V = await imp('versions.mjs');
const D = await imp('deliver.mjs');
const C = await imp('capcut.mjs');
const L = await imp('look.mjs');
const S = await imp('status.mjs');
const { pathsFrom } = await imp('build.mjs');

// 假工作區：shared/template 是指回真的 template 的 symlink（從這裡執行工具＝經 symlink 執行）
function fakeRoot(t) {
  const root = tmpDir(t, 'ae-p2b-');
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  const project = path.join(root, 'projects', 'p2b');
  fs.mkdirSync(path.join(project, 'work', 'hyperframes'), { recursive: true });
  return { root, project };
}

// ---------- runToolUntilDoneSync ----------

// 假工具：每跑一次計數 +1；前 N 次回 75（還在跑），之後回 0。印出自己有沒有拿到 AUTO_EDIT_JOB
function fakeTool(t, stillRunning) {
  const dir = tmpDir(t, 'ae-p2b-tool-');
  const tool = path.join(dir, 'tool.mjs'), count = path.join(dir, 'n');
  fs.writeFileSync(tool, `import fs from 'node:fs';
const f = ${JSON.stringify(count)};
const n = (fs.existsSync(f) ? Number(fs.readFileSync(f, 'utf8')) : 0) + 1;
fs.writeFileSync(f, String(n));
console.log('run ' + n + ' args=' + process.argv.slice(2).join(',') + ' job=' + (process.env.AUTO_EDIT_JOB ?? '-') + ' x=' + (process.env.P2B_X ?? '-'));
process.exitCode = n <= ${stillRunning} ? 75 : 0;
`);
  return { tool, runs: () => Number(fs.readFileSync(count, 'utf8')) };
}

test('runToolUntilDoneSync：前兩次回 75 就再跑同一條，第三次 0 收；形狀和 spawnSync 一樣，加 waits、timedOut；不把 AUTO_EDIT_JOB 傳下去', (t) => {
  const f = fakeTool(t, 2);
  const before = process.env.AUTO_EDIT_JOB;
  process.env.AUTO_EDIT_JOB = 'outer';
  t.after(() => { if (before === undefined) delete process.env.AUTO_EDIT_JOB; else process.env.AUTO_EDIT_JOB = before; });
  const r = J.runToolUntilDoneSync(f.tool, ['--a', 'b'], { minGapMs: 0, env: { P2B_X: 'y' } });
  assert.equal(r.status, 0);
  assert.equal(r.waits, 2);
  assert.equal(r.timedOut, false);
  assert.equal(f.runs(), 3);
  assert.equal(r.stdout.trim(), 'run 3 args=--a,b job=- x=y', '最後一次的輸出；子行程不是誰的背景工作；env 加得進去');
  assert.equal(typeof r.stderr, 'string');
});

test('runToolUntilDoneSync：一直回 75、等到總上限 → timedOut、status 還是 75（不會永遠等）', (t) => {
  const f = fakeTool(t, 99);
  const r = J.runToolUntilDoneSync(f.tool, [], { maxWaitSec: 0, minGapMs: 0 });
  assert.deepEqual([r.status, r.waits, r.timedOut, f.runs()], [75, 1, true, 1]);
});

test('runToolUntilDone（async）和同步版共用判斷：結果的 waits、timedOut 一樣', async (t) => {
  const f = fakeTool(t, 2);
  const r = await J.runToolUntilDone(f.tool, [], { minGapMs: 0 });
  assert.deepEqual([r.code, r.waits, r.timedOut], [0, 2, false]);
  const g = fakeTool(t, 99);
  const s = await J.runToolUntilDone(g.tool, [], { maxWaitSec: 0, minGapMs: 0 });
  assert.deepEqual([s.code, s.waits, s.timedOut], [75, 1, true]);
});

// ---------- editor.mjs --json、editorUrlsSync ----------

test('editor.mjs --json 只印一行 JSON（ensureEditor 的結果）；editorUrlsSync 拿到同一組網址；開不起來回 null', async (t) => {
  const { root, project } = fakeRoot(t);
  const P = pathsFrom({ project, template: path.join(root, 'shared', 'template') }, root);
  t.after(async () => { await E.stopEditor(path.join(P.out, '.editor', 'server.json'), project); });
  const port = 49600 + (process.pid % 300);
  const r = spawnSync(process.execPath, [path.join(root, 'shared', 'template', 'tools', 'editor.mjs'), '--project', 'projects/p2b', '--template', 'shared/template', '--port', String(port), '--json'], { cwd: root, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1, `只印一行：${r.stdout}`);
  const u = JSON.parse(lines[0]);
  assert.match(u.main, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.deepEqual([u.cuts, u.framing, u.storyboard, u.final], ['cuts', 'framing', 'storyboard', '?view=final'].map((x) => new URL(x, u.main).href));
  const again = editorUrlsSync(project, { template: path.join(root, 'shared', 'template') });
  assert.ok(again, '開著就拿得到');
  assert.equal(again.main, u.main, '同一個剪輯台（網址不變）');
  assert.equal(again.final, u.final);
  assert.equal(editorUrlsSync(path.join(root, 'projects', '沒有這個')), null, '找不到專案：回 null，不丟錯');
  assert.equal(editorUrlsSync(''), null);
});

// ---------- 參數（lib/cli.mjs） ----------

test('--said=a=b 只在第一個 = 切；--say 也收（versions、deliver、status）；其他值旗標一樣', () => {
  assert.equal(V.parseArgs(['begin', '--said=可以=好']).said, '可以=好');
  assert.equal(V.parseArgs(['begin', '--say', '可以']).say, '可以');
  assert.equal(D.parseDeliverArgs(['--said=可以了=輸出']).said, '可以了=輸出');
  assert.deepEqual(D.parseDeliverArgs(['--say', '可以了']), { say: '可以了' });
  assert.equal(S.parseFlags(['--mark', '④', '--state', '通過', '--said=a=b']).said, 'a=b');
  assert.equal(S.parseFlags(['--mark', '④', '--state', '通過', '--say', '可以']).say, '可以');
  assert.equal(C.parseCapcutArgs(['--template=a=b']).template, 'a=b');
  assert.equal(L.parseLookArgs(['run', '--chrome=/x/a=b']).flags.chrome, '/x/a=b');
  assert.equal(E.parseArgs(['--message=a=b']).message, 'a=b');
});

test('缺值 ✖（到結尾、或下一個是另一個旗標）並附看用法', () => {
  assert.throws(() => V.parseArgs(['begin', '--seg']), /--seg 後面要接值 → 用 --help 看用法/);
  assert.throws(() => V.parseArgs(['begin', '--seg', '--json']), /--seg 後面要接值/);
  assert.throws(() => D.parseDeliverArgs(['--said', '--force']), /--said 後面要接值 → 看用法：node shared\/template\/tools\/deliver\.mjs --help/);
  assert.throws(() => C.parseCapcutArgs(['--only', '--force']), /--only 後面要接值 → 看用法/);
  assert.throws(() => L.parseLookArgs(['run', '--chrome']), /--chrome 後面要接值 → 看用法：node shared\/template\/tools\/look\.mjs --help/);
  assert.throws(() => S.parseFlags(['--mark']), /--mark 後面要接值（用 --help 看用法）/);
  assert.throws(() => E.parseArgs(['--project']), /--project 後面要接值/);
});

test('模式互斥：真的互斥的才擋，修飾旗標照舊能搭配', () => {
  assert.throws(() => V.parseArgs(['finish', '--preview', '--no-preview']), /--preview 和 --no-preview 不能一起用/);
  assert.doesNotThrow(() => V.parseArgs(['finish', '--preview', '--prerender', '--json']));
  assert.throws(() => D.parseDeliverArgs(['--prerender', '--cancel']), /--prerender 和 --cancel 不能一起用/);
  assert.doesNotThrow(() => D.parseDeliverArgs(['--force', '--wait', '30', '--said', 'x']));
  assert.throws(() => S.parseFlags(['--init', '--timeline']), /--init 和 --timeline 不能一起用/);
  assert.throws(() => S.parseFlags(['--mark', '②', '--init']), /不能一起用/);
  assert.doesNotThrow(() => S.parseFlags(['--init', '--format', 'portrait', '--json', '--project', 'p']));
  assert.throws(() => E.parseArgs(['--stop', '--status']), /--stop 和 --status 不能一起用/);
  assert.throws(() => E.parseArgs(['--json', '--stop']), /不能一起用/);
  assert.doesNotThrow(() => E.parseArgs(['--json', '--open', '--port', '4400']));
  assert.throws(() => C.parseCapcutArgs(['--cancel', '--dry-run']), /--cancel 只能單獨用/);
  assert.doesNotThrow(() => C.parseCapcutArgs(['--background', '--dry-run', '--jobs', '2']));
});

test('經 symlink 執行：deliver、capcut（以前什麼都不做）和其他工具都會跑', (t) => {
  const { root } = fakeRoot(t);
  const run = (tool, args) => spawnSync(process.execPath, [path.join(root, 'shared', 'template', 'tools', tool), ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });
  for (const [tool, re] of [['deliver.mjs', /輸出完成影片/], ['capcut.mjs', /剪映素材/], ['look.mjs', /講者調光/], ['versions.mjs', /段落版本與回饋輪/], ['status.mjs', /專案進度/], ['editor.mjs', /剪輯：在瀏覽器裡/]]) {
    const r = run(tool, ['--help']);
    assert.equal(r.status, 0, `${tool}：${r.stderr}`);
    assert.match(r.stdout, re, `${tool} 經 symlink 執行要印說明`);
  }
  const bad = run('deliver.mjs', ['--prerender', '--cancel']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^✖ --prerender 和 --cancel 不能一起用/);
});

// ---------- C6：摘要只認 lib/build-summary.mjs ----------

test('deliver.buildSummary、versions.digestBuild 的摘要都照 lib/build-summary.mjs', () => {
  const log = ['產生：index.html', '人聲響度：−14.0 LUFS', '  音效比例：12 顆', '⚠ s05 音效密度 9 顆／分', '⚠ s05 字太長', '結尾配樂：無'].join('\n');
  assert.deepEqual(D.buildSummary(log), ['人聲響度：−14.0 LUFS', '  音效比例：12 顆', '⚠ s05 音效密度 9 顆／分', '結尾配樂：無']);
  assert.deepEqual(V.digestBuild(log, ['s05'], ['s05']).summary, ['人聲響度：−14.0 LUFS', '音效比例：12 顆', '結尾配樂：無']);
});

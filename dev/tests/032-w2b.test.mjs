// 032 W2b：背景工作統一（C3：lib/job.mjs 的卡住偵測、waitJob、runToolUntilDone；look／capcut 走 runJob）、
// look.mjs default（A9②）、deliver.mjs 已經是最新的不重做（A9⑥）、回報段（A3）、連續沒過停手（A4）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { TEMPLATE, TOOLS, imp } from './helpers.mjs';

const J = await imp('lib/job.mjs');
const D = await imp('lib/deliver.mjs');
const CLI = await imp('deliver.mjs');
const { REPORT_HEAD } = await imp('lib/say.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function tmp(t, prefix = 'ae-w2b-') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}
const node = (tool, args, opts = {}) => spawnSync(process.execPath, [path.join(TOOLS, tool), ...args], { encoding: 'utf8', ...opts });

// ---------- lib/job.mjs ----------

// 和 reliability.test 一樣的小工具：--background＝開了就回；--stall＝卡住門檻 0 分鐘（一定提醒）
function jobFixture(t) {
  const project = tmp(t, 'ae-w2b-job-');
  fs.mkdirSync(path.join(project, 'work'), { recursive: true });
  const script = path.join(project, 'tool.mjs'), runs = path.join(project, 'runs.txt');
  fs.writeFileSync(script, `
import fs from 'node:fs';
import { runJob } from ${JSON.stringify(path.join(TOOLS, 'lib', 'job.mjs'))};
const flags = process.argv.slice(2);
const has = (k) => flags.includes(k);
const code = await runJob({ project: ${JSON.stringify(project)}, name: 'x', waitSec: has('--background') ? 0 : has('--wait') ? Number(flags[flags.indexOf('--wait') + 1]) : 30, pollMs: 30,
  stallMin: has('--stall') ? 0 : 10, cancel: 'node tool.mjs --cancel', log: console.log, run: async () => {
  fs.appendFileSync(${JSON.stringify(runs)}, flags.join(' ') + '\\n');
  console.log('做事');
  if (has('--slow')) await new Promise((r) => setTimeout(r, 3000));
  return 0;
} });
process.exitCode = code;
`);
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const count = () => { try { return fs.readFileSync(runs, 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
  const settled = async () => { for (let i = 0; i < 300; i++) { if (J.jobState(project, 'x').state !== 'running') return; await sleep(30); } throw new Error('工作一直沒結束'); };
  return { project, run, count, settled };
}

test('C3 stallWarning：log 超過門檻沒有新內容才提醒，帶取消指令；沒有 log 不判斷', (t) => {
  const project = tmp(t);
  assert.equal(J.stallWarning({ project, name: 'x' }), null, '還沒有 log');
  const log = path.join(project, 'work', '.jobs', 'x.log');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, '做事\n');
  assert.equal(J.stallWarning({ project, name: 'x' }), null, '剛寫過');
  const old = new Date(Date.now() - 25 * 60000);
  fs.utimesSync(log, old, old);
  const w = J.stallWarning({ project, name: 'x', stallMin: 20, cancel: 'node shared/template/tools/deliver.mjs --project projects/x --cancel' });
  assert.match(w, /^⚠ x 已經 25 分鐘沒有新的輸出（log：.*x\.log），可能卡住了 → 再等一次還是沒動靜就取消：node shared\/template\/tools\/deliver\.mjs --project projects\/x --cancel$/);
  assert.match(J.stallWarning({ project, name: 'x' }), /→ 再等一次還是沒動靜就停下來回報$/, '沒給取消指令');
  // render.log 這類 activity 還在寫就不算卡住
  const render = path.join(project, 'render.log');
  fs.writeFileSync(render, 'frame 1\n');
  assert.equal(J.stallWarning({ project, name: 'x', stallMin: 20, activity: [render] }), null);
});

test('C3 runJob：等到上限時，卡住的那一行夾在「⏳ 還在跑」和「→ 下一步」之間', async (t) => {
  const f = jobFixture(t);
  const r = f.run('--slow', '--stall', '--wait', '1');
  assert.equal(r.status, 75, r.stdout + r.stderr);
  assert.match(r.stdout, /⏳ x 還在跑[^\n]*\n⚠ x 已經 0 分鐘沒有新的輸出[^\n]*→ 再等一次還是沒動靜就取消：node tool\.mjs --cancel\n→ 下一步：再跑一次同一條指令會接著等，不會重跑\n$/);
  await f.settled();
  // 沒卡住（門檻 10 分鐘）就不多印
  const g = jobFixture(t);
  const q = g.run('--slow', '--wait', '1');
  assert.equal(q.status, 75);
  assert.doesNotMatch(q.stdout, /⚠/);
  await g.settled();
});

test('C3 sameRun：--background 不算參數不同：背景開的、做完沒人看，再跑同一條（不帶 --background）交代結果不重跑', async (t) => {
  const f = jobFixture(t);
  assert.equal(f.run('--background', '--edit', 'A').status, 75);
  await f.settled();
  const r = f.run('--edit', 'A');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /做事/);
  assert.equal(f.count(), 1, '沒有重跑');
});

test('C3 sameRun：--say 和 --said 一樣不算參數不同（--say "…"、--say=… 兩種寫法）', async (t) => {
  const f = jobFixture(t);
  assert.equal(f.run('--background', '--edit', 'A', '--said', '可以').status, 75);
  await f.settled();
  let r = f.run('--edit', 'A', '--say', '好');
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /參數不同/);
  assert.equal(f.count(), 1, '--say 重跑：交代結果，不重新開始');
  assert.equal(f.run('--background', '--edit', 'B', '--say=第一句').status, 75);
  await f.settled();
  r = f.run('--edit', 'B', '--say=第二句');
  assert.equal(r.status, 0);
  assert.equal(f.count(), 2);
  assert.equal(f.run('--background', '--edit', 'C').status, 75);
  await f.settled();
  r = f.run('--edit', 'D', '--say', '別的');
  assert.match(r.stdout, /參數不同，重新開始/, '真的參數不同還是重跑');
  assert.equal(f.count(), 4);
});

test('C3 waitJob：沒有工作回 null；在跑就等到做完、記成交代過；做完又交代過就直接回結束碼', async (t) => {
  const f = jobFixture(t);
  assert.equal(await J.waitJob({ project: f.project, name: 'x', log: () => {} }), null);
  f.run('--background', '--slow');
  const lines = [];
  assert.equal(await J.waitJob({ project: f.project, name: 'x', waitSec: 30, pollMs: 30, log: (s) => lines.push(s) }), 0);
  assert.match(lines.join('\n'), /做事/);
  assert.equal(J.jobState(f.project, 'x').reported, true);
  assert.equal(await J.waitJob({ project: f.project, name: 'x', log: () => { throw new Error('不該再印'); } }), 0);
  // 等不到：75，不開新的
  f.run('--background', '--slow');
  assert.equal(await J.waitJob({ project: f.project, name: 'x', waitSec: 0.2, pollMs: 30, log: () => {} }), J.STILL_RUNNING);
  await f.settled();
  assert.equal(f.count(), 2);
});

test('C3 runToolUntilDone：75 就再跑同一條、做完回結果；超過總上限回 timedOut；預設的 runner 真的跑 node 並拿掉 AUTO_EDIT_JOB', async (t) => {
  let n = 0;
  const waits = [];
  const fake = async (cmd, args) => { n++; assert.equal(cmd, process.execPath); assert.deepEqual(args, ['/x/build.mjs', '--a']); return { code: n < 3 ? 75 : 0, stdout: `第 ${n} 次`, stderr: '' }; };
  let r = await J.runToolUntilDone('/x/build.mjs', ['--a'], { run: fake, minGapMs: 0, onWait: (w) => waits.push(w.n) });
  assert.deepEqual([r.code, r.stdout, r.waits, r.timedOut], [0, '第 3 次', 2, false]);
  assert.deepEqual(waits, [1, 2]);
  n = 0;
  r = await J.runToolUntilDone('/x/build.mjs', ['--a'], { run: async () => ({ code: 75, stdout: '', stderr: '' }), maxWaitSec: 0, minGapMs: 0 });
  assert.deepEqual([r.code, r.timedOut], [75, true]);
  const dir = tmp(t);
  const script = path.join(dir, 'echo.mjs');
  fs.writeFileSync(script, 'console.log(process.env.AUTO_EDIT_JOB ?? "none", process.argv.slice(2).join(" ")); process.exitCode = 3;');
  process.env.AUTO_EDIT_JOB = 'deliver';
  try { r = await J.runToolUntilDone(script, ['a', 'b']); } finally { delete process.env.AUTO_EDIT_JOB; }
  assert.deepEqual([r.code, r.stdout.trim()], [3, 'none a b']);
});

// ---------- look.mjs default（A9②） ----------

function lookTemplate(t, text = '{\n  "color": 0,\n  "slim": 0,\n  "lut": "look/jianying-smart.cube"\n}\n') {
  const tpl = tmp(t, 'ae-w2b-tpl-');
  fs.mkdirSync(path.join(tpl, 'kit'), { recursive: true });
  fs.writeFileSync(path.join(tpl, 'kit', 'look.json'), text);
  return { tpl, file: path.join(tpl, 'kit', 'look.json') };
}

test('A9② look.mjs default：不帶值印目前的預設（和 status 的「設定」同格式）；帶值只改那幾個鍵、其他鍵與格式不動', (t) => {
  const { tpl, file } = lookTemplate(t);
  let r = node('look.mjs', ['default', '--template', tpl]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '設定：調光 關、瘦臉 關、美顏 關（來源：kit/look.json）\n');
  r = node('look.mjs', ['default', '--template', tpl, '--slim', '0.6', '--color', '0.8']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '✓ kit/look.json：調光 0 → 0.8、瘦臉 0 → 0.6\n設定：調光 0.8、瘦臉 0.6、美顏 關（來源：kit/look.json）\n');
  assert.equal(fs.readFileSync(file, 'utf8'), '{\n  "color": 0.8,\n  "slim": 0.6,\n  "lut": "look/jianying-smart.cube"\n}\n');
  r = node('look.mjs', ['default', '--template', tpl, '--beauty=0.5']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { color: 0.8, slim: 0.6, lut: 'look/jianying-smart.cube', beauty: 0.5 });
  r = node('look.mjs', ['default', '--template', tpl, '--slim', '0.6']);
  assert.match(r.stdout, /^✓ kit\/look\.json 本來就是這個值，沒有改\n設定：調光 0\.8、瘦臉 0\.6、美顏 0\.5/);
  assert.deepEqual(fs.readdirSync(path.join(tpl, 'kit')), ['look.json'], '沒有留下暫存檔');
});

test('A9② look.mjs default：超出範圍、不是數字 ✖（附 → 例）、檔案不動；其他子指令的旗標不能混用', (t) => {
  const { tpl, file } = lookTemplate(t);
  const before = fs.readFileSync(file, 'utf8');
  for (const [k, v, range] of [['slim', '1.5', '0–1.2'], ['color', '-0.1', '0–1'], ['beauty', 'abc', '0–1']]) {
    const r = node('look.mjs', ['default', '--template', tpl, `--${k}`, v]);
    assert.equal(r.status, 1, `${k}=${v}`);
    assert.match(r.stdout, new RegExp(`^✖ --${k} 要是 ${range} 的數字，現在是「${v.replace('.', '\\.')}」 → 例：--${k} `));
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const r = node('look.mjs', ['default', '--template', tpl, '--every', '2']);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /default 不能加 --every/);
  assert.match(node('look.mjs', ['--help']).stdout, /look\.mjs default \[--color 0–1\] \[--slim 0–1\.2\] \[--beauty 0–1\]/);
});

// ---------- look.mjs cancel、capcut.mjs --cancel ----------

function fakeProject(t) {
  const root = tmp(t, 'ae-w2b-proj-');
  const project = path.join(root, 'projects', 'demo');
  fs.mkdirSync(path.join(project, 'work', 'hyperframes'), { recursive: true });
  return { root, project };
}
// 假裝背景工作在跑：命令列帶工具名稱的 node 行程（jobState 會比命令列，確認 pid 沒被別的程式重用）
function fakeRunning(t, project, name, tool) {
  const p = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', tool], { detached: true, stdio: 'ignore' });
  t.after(() => { try { process.kill(p.pid, 'SIGKILL'); } catch { /* 已經走了 */ } });
  fs.mkdirSync(path.join(project, 'work', '.jobs'), { recursive: true });
  fs.writeFileSync(path.join(project, 'work', '.jobs', `${name}.json`), JSON.stringify({ name, pid: p.pid, state: 'running', startedAt: Date.now(), argv: [path.join(TOOLS, tool)] }));
  return p;
}
const gone = async (p) => { for (let i = 0; i < 100 && isAlive(p.pid) && p.exitCode === null && p.signalCode === null; i++) await sleep(30); return !isAlive(p.pid) || p.exitCode !== null || p.signalCode !== null; };

test('C3 look.mjs cancel：沒在跑就說沒有；在跑就連子行程一起收、狀態記成取消（status 看得到）', { skip: process.platform === 'win32' }, async (t) => {
  const { root, project } = fakeProject(t);
  let r = node('look.mjs', ['cancel', '--project', project], { cwd: root });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '現在沒有在背景跑 look.mjs run\n');
  const p = fakeRunning(t, project, 'look', 'look.mjs');
  r = node('look.mjs', ['cancel', '--project', project], { cwd: root });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`^已取消 look\\.mjs run（pid ${p.pid}）；work/rough-look\\.mp4 沒有換上去。要重來：node shared/template/tools/look\\.mjs run --project \\S+\\n$`));
  assert.ok(await gone(p), '背景工作被收掉');
  const L = await imp('lib/look.mjs');
  assert.deepEqual([L.readState(project).run.phase, L.readState(project).run.error], ['failed', '已取消（look.mjs cancel）']);
  assert.equal(J.jobState(project, 'look').state, 'failed', '等它的那條指令看得到中途被結束了');
});

test('C3 capcut.mjs --cancel：收掉背景工作；沒在跑就說沒有；--cancel 不能和 status、--background 一起', { skip: process.platform === 'win32' }, async (t) => {
  const { root, project } = fakeProject(t);
  let r = node('capcut.mjs', ['--project', project, '--cancel'], { cwd: root });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, '現在沒有在背景做剪映素材\n');
  const p = fakeRunning(t, project, 'capcut', 'capcut.mjs');
  r = node('capcut.mjs', ['--project', project, '--cancel'], { cwd: root });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`^已取消剪映素材（pid ${p.pid}）`));
  assert.ok(await gone(p));
  const C = await imp('capcut.mjs');
  assert.throws(() => C.parseCapcutArgs(['status', '--cancel']), /--cancel 只能單獨用/);
  assert.throws(() => C.parseCapcutArgs(['--background', '--cancel']), /--cancel 只能單獨用/);
  assert.match(node('capcut.mjs', ['--help']).stdout, /--cancel/);
});

test('C3 capcut.mjs：status --wait 等的是同一個背景工作，等到了就記成交代過（下一次同一條指令重新做，不會重印舊結果）', async (t) => {
  const { root, project } = fakeProject(t);
  const bg = node('capcut.mjs', ['--project', project, '--background'], { cwd: root });
  assert.equal(bg.status, 0, bg.stdout + bg.stderr);
  assert.match(bg.stdout, /→ 下一步：等它做完.*\nnode .*capcut\.mjs status --project .* --wait\n$/);
  // 假專案沒有 plan.json：子行程 build 失敗，status --wait 看得出中斷了
  const st = node('capcut.mjs', ['status', '--project', project, '--wait', '60'], { cwd: root });
  assert.equal(st.status, 1, st.stdout + st.stderr);
  assert.match(st.stdout, /✖ 中斷了/);
  const js = J.jobState(project, 'capcut');
  assert.deepEqual([js.state, js.reported], ['failed', true]);
  assert.match(fs.readFileSync(path.join(project, 'output', 'capcut', 'capcut.log'), 'utf8'), /build 沒過/, 'output/capcut/capcut.log 照舊有一份');
});

// ---------- deliver（A3、A4、A9⑥） ----------

const STOP_LOG = ['# 製作進度', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', '| 2026-11-06 10:00 | ④ 完成影片預覽 | 待回覆 | — | — |', ''].join('\n');
function deliverProject(t) {
  const root = tmp(t, 'ae-w2b-deliver-');
  const project = path.join(root, 'projects', 'demo'), out = path.join(project, 'work', 'hyperframes');
  for (const d of ['compositions', 'kit', 'assets']) fs.mkdirSync(path.join(out, d), { recursive: true });
  fs.mkdirSync(path.join(project, 'output'), { recursive: true });
  fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, scenes: [] }));
  fs.writeFileSync(path.join(out, 'index.html'), '<html>main</html>');
  fs.writeFileSync(path.join(out, 'kit', 'x.css'), 'a{}');
  fs.writeFileSync(path.join(project, 'work', 'rough.srt'), '1\n00:00:00,000 --> 00:00:01,000\n字幕\n');
  fs.writeFileSync(path.join(project, 'work', '製作進度.md'), STOP_LOG);
  return { root, project, out, plan: path.join(out, 'plan.json'), srt: path.join(project, 'work', 'rough.srt'), video: path.join(project, 'work', 'rough.mp4'), templateDir: TEMPLATE };
}
// 假的子處理程序（和 deliver.test 同一套分類）；qc 會真的寫驗收截圖
function fakeDeps(P, calls, { qcWarn = true, testBuild75 = 0 } = {}) {
  let left = testBuild75;
  return {
    run: async (cmd, args, opts = {}) => {
      const name = cmd === 'ffprobe' ? 'probe' : args.includes('--test') ? 'testBuild' : args.includes('compositions/test-clip.html') ? 'testRender' : args.includes('--fps') ? 'render' : args.includes('final') ? 'qc' : 'other';
      calls.push(name);
      if (name === 'testBuild' && left > 0) { left--; return { code: 75, stdout: '⏳ 還在跑', stderr: '' }; }
      if (name === 'probe') return { code: 0, stdout: 'video\naudio\n', stderr: '' };
      if (name === 'render') { fs.writeFileSync(args[args.indexOf('--output') + 1], 'new-video'); return { code: 0, stdout: '', stderr: '' }; }
      if (name === 'qc') {
        const sheet = path.join(P.project, 'output', 'qc', 'qc-sheet.jpg');
        fs.mkdirSync(path.dirname(sheet), { recursive: true });
        fs.writeFileSync(sheet, 'jpg');
        const checks = [{ level: 'ok', text: '格式 1920×1080、30fps、有音軌' }, { level: 'ok', text: '長度 155.2s' }, ...(qcWarn ? [{ level: 'warn', text: '0:12–0:15 畫面凍結 3 秒（s05）→ 看 qc-sheet.jpg' }] : [])];
        return { code: 0, stdout: JSON.stringify({ ok: true, errors: 0, warnings: qcWarn ? 1 : 0, checks, format: { width: 1920, height: 1080, fps: 30, hasAudio: true }, duration: { actual: 155.2, expected: 155.2 }, sheet: 'output/qc/qc-sheet.jpg' }), stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    },
    build: async () => { calls.push('build'); return [200, { ok: true, log: '人聲響度 −14 LUFS\n' }]; },
    report: async () => ({ report: { items: [{ type: 'scene', start: 2, out: { start: 2 } }] } }),
    pollMs: 10, said: '可以了，輸出完成影片',
  };
}
const deliverOnce = async (P, deps) => { const job = D.newJob(); await D.runDeliver(P, job, deps); return job; };

test('A9⑥ 內容沒變、上次驗收過：不重新輸出也不重跑驗收，印「✓ 已經是最新的」和上次的驗收結果；--force 才重做；截圖被刪就重跑驗收', async (t) => {
  const P = deliverProject(t);
  let calls = [];
  const first = await deliverOnce(P, fakeDeps(P, calls));
  assert.equal(first.ok, true, first.message);
  assert.deepEqual(calls, ['build', 'testBuild', 'testRender', 'probe', 'render', 'qc']);
  const memo = JSON.parse(fs.readFileSync(D.deliverPaths(P.project).memo, 'utf8'));
  assert.equal(memo.verified.fingerprint, memo.fingerprint, '驗收結果和指紋記在一起');
  assert.ok(D.verifiedOf(P, D.contentFingerprint(P), { speaker: memo.verified.speaker }));
  assert.equal(D.verifiedOf(P, D.contentFingerprint(P), { speaker: '{"換了講者":true}' }), null);

  calls = [];
  const again = await deliverOnce(P, fakeDeps(P, calls));
  assert.deepEqual(calls, ['build'], '只有 build（確認內容沒變），不 render、不跑 qc');
  assert.deepEqual([again.ok, again.reused, again.source], [true, true, 'same']);
  assert.deepEqual(again.warnings, ['0:12–0:15 畫面凍結 3 秒（s05）→ 看 qc-sheet.jpg'], '上次的 ⚠ 照樣列出來');
  const text = CLI.finishLines(P, again, { size: 1024 ** 2 }, { built: ['人聲響度 −14 LUFS'] }).join('\n');
  assert.match(text, /^\n✓ 已經是最新的：output\/final\.mp4（內容沒變，不重新輸出；要強制重做加 --force）\n✓ 完成影片：/);
  assert.match(text, /驗收：0 個 ✖、1 個 ⚠\n⚠ 0:12–0:15 畫面凍結/);
  assert.match(text, /qc final：✓ 2 項、⚠ 1 項、✖ 0 項（上次驗收的結果）/);

  calls = [];
  await deliverOnce(P, { ...fakeDeps(P, calls), force: true });
  assert.deepEqual(calls, ['build', 'testBuild', 'testRender', 'probe', 'render', 'qc'], '--force 整支重做');

  fs.rmSync(D.deliverPaths(P.project).sheet);
  calls = [];
  const noSheet = await deliverOnce(P, fakeDeps(P, calls));
  assert.deepEqual(calls, ['build', 'qc'], '驗收截圖不見了：不 render，但要重跑驗收');
  assert.equal(noSheet.reused, undefined);

  // 內容改過：指紋不同，照常輸出
  fs.appendFileSync(P.plan, ' ');
  calls = [];
  await deliverOnce(P, fakeDeps(P, calls));
  assert.ok(calls.includes('render'));
});

test('A9⑥ 剪輯台按「輸出完成影片」（by: editor，同一個 runDeliver）留下的驗收結果，deliver.mjs 也認得', async (t) => {
  const P = deliverProject(t);
  const calls = [];
  const editorJob = await deliverOnce(P, { ...fakeDeps(P, calls), by: 'editor', said: '在剪輯台按「輸出完成影片」' });
  assert.equal(editorJob.ok, true);
  calls.length = 0;
  const cli = await deliverOnce(P, { ...fakeDeps(P, calls), by: 'cli' });
  assert.deepEqual([cli.reused, calls], [true, ['build']]);
});

test('A9⑥ 講者資料改了（speakerGate 的結果不一樣）：就算指紋沒變也重跑驗收，不說「已經是最新的」', async (t) => {
  const P = deliverProject(t);
  const calls = [];
  let gate = { needed: true, state: 'unset', demo: '林大寶', segments: ['s01'], name: null, titles: [] };
  const first = await deliverOnce(P, { ...fakeDeps(P, calls), speakerGate: () => gate });
  assert.match(first.message, /示範人物「林大寶」/);
  gate = { needed: false, state: 'set', demo: '林大寶', segments: [], name: '鼎淵', titles: ['工程師'] };
  calls.length = 0;
  const again = await deliverOnce(P, { ...fakeDeps(P, calls), speakerGate: () => gate });
  assert.deepEqual(calls, ['build', 'qc']);
  assert.deepEqual([again.reused, again.message], [undefined, '完成影片輸出好了，驗收也通過了。']);
  calls.length = 0;
  const third = await deliverOnce(P, { ...fakeDeps(P, calls), speakerGate: () => gate });
  assert.deepEqual([third.reused, calls], [true, ['build']], '講者沒再改：沿用');
});

test('C3 lib/deliver：測試片段那次 build 回 75（底片還在處理）就再跑同一條，不是當成失敗', async (t) => {
  const P = deliverProject(t);
  const calls = [];
  const job = await deliverOnce(P, fakeDeps(P, calls, { testBuild75: 1 }));
  assert.equal(job.ok, true, job.message);
  assert.deepEqual(calls.filter((c) => c === 'testBuild').length, 2);
});

test('A3 回報段：照 deliver Skill 的回報格式，附 final.mp4 和驗收截圖的絕對路徑；每個 ⚠ 一行提示句；最後一行是「→ 完成」', (t) => {
  const P = deliverProject(t);
  const F = D.deliverPaths(P.project);
  const job = { ...D.newJob(), ok: true, source: 'render', warnings: ['0:12–0:15 畫面凍結 3 秒（s05）→ 看 qc-sheet.jpg'], errors: [], qc: { ok: true, errors: 0, warnings: 1, checks: [{ level: 'ok', text: 'a' }, { level: 'warn', text: 'b' }], format: { width: 1920, height: 1080, fps: 30, hasAudio: true }, duration: { actual: 155.2 }, sheet: 'output/qc/qc-sheet.jpg' } };
  const L = CLI.finishLines(P, job, { size: 38.5 * 1024 ** 2 }, { built: ['人聲響度 −14 LUFS', '講者瘦臉：關、美顏：關'] });
  const at = L.indexOf(REPORT_HEAD);
  assert.ok(at > 0, L.join('\n'));
  const R = L.slice(at);
  assert.ok(R.length <= 15);
  assert.match(R[1], /^完成影片輸出完成：.*output\/final\.mp4（155\.2s）$/);
  assert.equal(R[2], '驗證：1920×1080、30fps、有音軌，39 MB；這次 render');
  assert.equal(R[3], 'qc final：✓ 1 項、⚠ 1 項、✖ 0 項');
  assert.equal(R[4], '⚠ 說明：0:12–0:15 畫面凍結 3 秒（s05）｜刻意／要修：<理由>');
  assert.equal(R[5], '人聲響度 −14 LUFS；講者瘦臉：關、美顏：關（build 原文；和停點 ④ 報過的一樣就刪掉這行）');
  assert.match(R[6], /output\/qc\/qc-sheet\.jpg$/);
  const posix = (f) => path.resolve(f).split(path.sep).join('/');
  assert.equal(R.at(-2), `<deliver-assets><media type="video" src="${posix(F.final)}" /><media type="image" src="${posix(F.sheet)}" /></deliver-assets>`);
  assert.equal(R.at(-1), '→ 完成（有標「要修」的 ⚠ 時改寫：→ 下一個停點：④ 完成影片預覽（說「改 <段>」開始））');
  // 沒有 ⚠：最後一行就是「→ 完成」
  const clean = CLI.finishLines(P, { ...job, warnings: [], qc: { ...job.qc, warnings: 0, checks: [] } }, null);
  assert.equal(clean.at(-1), '→ 完成');
  // 失敗不印回報段
  assert.ok(!CLI.finishLines(P, { ...D.newJob(), ok: false, message: 'x', errors: ['y'], fix: 'z' }, null).includes(REPORT_HEAD));
});

test('A4 deliver.mjs：連續沒過 4 次最後印「→ 停手」；還在跑（75）、--cancel 不算', (t) => {
  const { root, project } = fakeProject(t);
  const run = (...a) => node('deliver.mjs', ['--project', project, ...a], { cwd: root });
  for (let i = 1; i <= 3; i++) {
    const r = run();
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /停手/);
  }
  assert.equal(run('--cancel').status, 0);
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout.trim().split('\n').at(-1), /^→ 停手：deliver\.mjs 已經連續 4 次沒過。/);
  const tries = triesOf(project);
  assert.equal(tries, 4);
});
function triesOf(project) {
  const f = path.join(project, 'work', '.jobs', 'tries', `${encodeURIComponent('main:deliver')}.json`);
  return JSON.parse(fs.readFileSync(f, 'utf8')).n;
}

test('C3 deliver.mjs --help：寫了「已經是最新的」、回報段、卡住提醒', () => {
  const h = node('deliver.mjs', ['--help']).stdout;
  assert.match(h, /✓ 已經是最新的/);
  assert.match(h, /回報段/);
  assert.match(h, /沒有新內容時，「⏳ 還在跑」下面多一行 ⚠ 和取消指令/);
});

// capcut.mjs（剪映素材）：參數、檔名、清單、同時 render 幾支、status --wait；合成本身在 build.test 的 --capcut
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { TOOLS, imp } from './helpers.mjs';

const C = await imp('capcut.mjs');

test('參數：status 子指令、--only／--dry-run／--no-main；看不懂的參數帶 → 用法', () => {
  assert.deepEqual(C.parseCapcutArgs(['--project', 'p', '--only', 's05,s12', '--dry-run']), { cmd: 'run', project: 'p', only: 's05,s12', 'dry-run': true });
  assert.deepEqual(C.parseCapcutArgs(['status', '--project=p']), { cmd: 'status', project: 'p' });
  assert.throws(() => C.parseCapcutArgs(['--zzz']), /沒有 --zzz 這個參數 → 看用法：node shared\/template\/tools\/capcut\.mjs --help/);
  assert.throws(() => C.parseCapcutArgs(['x']), /看不懂的參數「x」 → |看不懂的參數「x」→ /);
  assert.throws(() => C.parseCapcutArgs(['--only']), /--only 後面要接值/);
});

test('檔名：序號_段_起點（剪映照檔名排、看得出放哪一秒）；清單有主軌、每段放在哪一秒、字幕', () => {
  assert.equal(C.stampName(31.68), '0m31.68s');
  assert.equal(C.stampName(73.04), '1m13.04s');
  assert.equal(C.stampName(5), '0m05.00s');
  assert.equal(C.segFile({ id: 's06', start: 31.68 }, 5), '06_s06_0m31.68s.mov');
  const cc = { duration: 155.5, format: 'landscape', main: { duration: 155.5 },
    segs: [{ id: 's01', start: 0, duration: 4.5, layoutZh: '疊加', label: '14 講者介紹', sfx: 1 }, { id: 's03', start: 20, duration: 6, layoutZh: '半畫面', footage: true, label: '03 半版|側邊欄', sfx: 0 }] };
  const md = C.listMd(cc, { project: '範例', files: { main: '主軌.mp4', s01: '01_s01_0m00.00s.mov', s03: '02_s03_0m20.00s.mov' } });
  assert.match(md, /^# 剪映素材清單（範例）/);
  assert.match(md, /完成影片長度 2:35.50，橫式 1920×1080、30fps。/);
  assert.match(md, /\| 主軌\.mp4 \| 0:00\.00 \| 2:35\.50 \| 主軌 \|/);
  assert.match(md, /\| 02_s03_0m20\.00s\.mov \| 0:20\.00 \| 6\.00 秒 \| 半畫面（含講者） \| 03 半版｜側邊欄 \| 無 \|/);
  assert.match(md, /\| 字幕\.srt \|/);
});

test('參數：--jobs、--workers 要正整數；--wait 可以不寫秒數（預設 9 分鐘）', () => {
  assert.deepEqual(C.parseCapcutArgs(['--project', 'p', '--jobs', '4', '--workers', '1']), { cmd: 'run', project: 'p', jobs: '4', workers: '1' });
  assert.deepEqual(C.parseCapcutArgs(['status', '--project', 'p', '--wait']), { cmd: 'status', project: 'p', wait: 540 });
  assert.deepEqual(C.parseCapcutArgs(['status', '--wait', '30', '--project', 'p']), { cmd: 'status', wait: 30, project: 'p' });
  assert.deepEqual(C.parseCapcutArgs(['status', '--wait=30']), { cmd: 'status', wait: 30 });
  assert.throws(() => C.parseCapcutArgs(['--jobs', '0']), /--jobs 要寫正整數.*→ 例/);
  assert.throws(() => C.parseCapcutArgs(['--workers', 'x']), /--workers 要寫正整數/);
  assert.throws(() => C.parseCapcutArgs(['status', '--wait=abc']), /--wait 後面要接秒數.*→ 例/);
});

test('workersPerJob：平分約一半核心，加起來不超過只跑一支時，最少 1', () => {
  assert.equal(C.workersPerJob(3, 10), 1);
  assert.equal(C.workersPerJob(2, 10), 2);
  assert.equal(C.workersPerJob(3, 16), 2);
  assert.equal(C.workersPerJob(3, 2), 1);
  for (const cpus of [2, 4, 8, 10, 16, 32]) for (const jobs of [1, 2, 3, 4]) assert.ok(C.workersPerJob(jobs, cpus) * jobs <= Math.max(jobs, Math.floor(cpus / 2)), `${cpus} 核心 ${jobs} 支`);
});

test('mainWorkers：主軌拿其他幾支分完剩下的，加起來還是不超過只跑一支時', () => {
  assert.equal(C.mainWorkers(3, 10), 3, '10 核心：兩支各 1 個，主軌 3 個');
  assert.equal(C.mainWorkers(2, 10), 3);
  assert.equal(C.mainWorkers(3, 16), 4);
  assert.equal(C.mainWorkers(3, 2), 1);
  for (const cpus of [2, 4, 8, 10, 16, 32]) for (const jobs of [1, 2, 3, 4]) {
    const total = C.mainWorkers(jobs, cpus) + (jobs - 1) * C.workersPerJob(jobs, cpus);
    assert.ok(total <= Math.max(jobs, Math.floor(cpus / 2)), `${cpus} 核心 ${jobs} 支：${total}`);
    assert.ok(C.mainWorkers(jobs, cpus) >= C.workersPerJob(jobs, cpus), '主軌不會比一段少');
  }
});

test('runPool：同時不超過 limit，每個都做到，limit 比工作多也行', async () => {
  for (const limit of [1, 3, 20]) {
    let now = 0, top = 0;
    const seen = [];
    await C.runPool([0, 1, 2, 3, 4, 5, 6], limit, async (x) => { now++; top = Math.max(top, now); seen.push(x); await new Promise((r) => setTimeout(r, 5)); now--; });
    assert.deepEqual(seen.sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(top, Math.min(limit, 7));
  }
});

test('renderAll：沒變的略過、失敗的記下來不擋別支，state 邊跑邊存，status 隨時讀得到現在在做哪幾支', async () => {
  const jobs = ['a', 'b', 'c', 'd', 'e'].map((k) => ({ key: k, out: `${k}.mov` }));
  const state = { total: 5, made: [], skipped: [], failed: [], current: [], done: false };
  const lines = [], snapshots = [], made = [];
  await C.renderAll(jobs, {
    limit: 2, state, log: (s) => lines.push(s), save: () => snapshots.push([...state.current]),
    isFresh: (j) => j.key === 'a',
    render: async (j) => { await new Promise((r) => setTimeout(r, 5)); return j.key !== 'c'; },
    onMade: (j) => made.push(j.key),
  });
  assert.deepEqual(state.skipped, ['a.mov']);
  assert.deepEqual(state.failed, ['c.mov']);
  assert.deepEqual([...state.made].sort(), ['a.mov', 'b.mov', 'd.mov', 'e.mov']);
  assert.deepEqual(made.sort(), ['b', 'd', 'e'], '失敗的不寫快取');
  assert.deepEqual(state.current, []);
  assert.ok(snapshots.some((c) => c.length === 2), '同時兩支');
  assert.ok(lines.some((l) => /\[\d\/5\] ✖ c\.mov render 失敗/.test(l)));
  assert.ok(lines.some((l) => /a\.mov 沒變，略過/.test(l)));
});

test('--background 回來時狀態已經是「這次在跑」：馬上接 status --wait 不會讀到上一次的「做完了」', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-capcut-bg-'));
  const project = path.join(dir, 'projects', 'x'), capDir = path.join(project, 'output', 'capcut');
  fs.mkdirSync(path.join(project, 'work', 'hyperframes'), { recursive: true });
  fs.mkdirSync(capDir, { recursive: true });
  fs.writeFileSync(path.join(capDir, '.capcut-state.json'), JSON.stringify({ pid: process.pid, total: 3, made: ['a', 'b', 'c'], skipped: [], failed: [], current: [], done: true }));
  try {
    const r = spawnSync(process.execPath, [path.join(TOOLS, 'capcut.mjs'), '--project', project, '--background'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const st = JSON.parse(fs.readFileSync(path.join(capDir, '.capcut-state.json'), 'utf8'));
    assert.equal(st.done, false);
    assert.notEqual(st.pid, process.pid);
    assert.match(r.stdout, /→ 下一步：等它做完.*\nnode .*status --project .* --wait\n$/);
    // 子行程很快會失敗（沒有 plan.json）：等它走，status --wait 看得出中斷了
    const left = await C.waitForCapcut(capDir, 60, { pollMs: 20 });
    assert.equal(left.done, false);
    const L = [];
    assert.equal(C.statusCmd(capDir, 'projects/x', { waited: true, log: (x) => L.push(x) }), 1);
    assert.match(L.join('\n'), /✖ 中斷了/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('status --wait：做完就回來（不等到逾時）、逾時結束碼 75、中斷或有失敗 1；訊息都有下一步', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-capcut-'));
  const f = path.join(dir, '.capcut-state.json');
  const write = (o) => fs.writeFileSync(f, JSON.stringify({ total: 3, made: [], skipped: [], failed: [], current: [], done: false, ...o }));
  const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  const status = () => { const L = []; const code = C.statusCmd(dir, 'projects/x', { waited: true, log: (s) => L.push(s) }); return { code, text: L.join('\n') }; };
  try {
    // 還沒跑過
    assert.equal(await C.waitForCapcut(dir, 5), null);
    assert.equal(status().code, 1);

    // 跑到一半就做完：提早回來
    write({ pid: worker.pid, made: ['a.mov'], current: ['b.mov', 'c.mov'] });
    let r = status();
    assert.equal(r.code, 75);
    assert.match(r.text, /🔄 進行中：1／3 支（現在：b\.mov、c\.mov）/);
    assert.match(r.text, /→ 下一步：還沒好，接著等\nnode shared\/template\/tools\/capcut\.mjs status --project projects\/x --wait$/);
    setTimeout(() => write({ pid: worker.pid, made: ['a.mov', 'b.mov', 'c.mov'], done: true }), 60);
    const t0 = Date.now();
    await C.waitForCapcut(dir, 30, { pollMs: 10 });
    assert.ok(Date.now() - t0 < 5000, '做完就回來');
    r = status();
    assert.equal(r.code, 0);
    assert.match(r.text, /✔ 做完了：3／3 支\n→ 清單：projects\/x\/output\/capcut\/清單\.md/);

    // 逾時
    write({ pid: worker.pid, current: 'b.mov' });   // 舊版的 state：current 是字串
    const t1 = Date.now();
    await C.waitForCapcut(dir, 0.05, { pollMs: 10 });
    assert.ok(Date.now() - t1 < 5000);
    r = status();
    assert.equal(r.code, 75);
    assert.match(r.text, /現在：b\.mov/);

    // 做完但有失敗
    write({ pid: worker.pid, made: ['a.mov'], failed: ['b.mov'], done: true });
    r = status();
    assert.equal(r.code, 1);
    assert.match(r.text, /✖ 做完了但有失敗：1／3 支；失敗 b\.mov\n→ 看 .*render\.log 裡 \[b\.mov\]/);

    // 工作行程不見了
    worker.kill('SIGKILL');
    await new Promise((res) => worker.on('exit', res));
    write({ pid: worker.pid, made: ['a.mov'] });
    await C.waitForCapcut(dir, 30, { pollMs: 10 });
    r = status();
    assert.equal(r.code, 1);
    assert.match(r.text, /✖ 中斷了：1／3 支\n→ 下一步：看 .*capcut\.log 最後幾行，修好後接著做（做過的會略過）\nnode .*--background$/);
    // 不等的 status：結束碼維持 0（舊行為）
    assert.equal(C.statusCmd(dir, 'projects/x', { log: () => {} }), 0);
    // 專案名稱有空白：印出來的指令可以直接貼
    const L = [];
    C.statusCmd(dir, 'projects/我的 影片', { log: (x) => L.push(x) });
    assert.equal(L.at(-1), 'node shared/template/tools/capcut.mjs --project "projects/我的 影片" --background');
  } finally {
    worker.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 剪輯頁「輸出完成影片」（019）：流程順序、舊檔保護、沒聲音、驗收 ✖、取消、同時操作、停點紀錄、檔案路由。
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TEMPLATE, imp } from './helpers.mjs';

const { startEditor } = await imp('editor.mjs');
const D = await imp('lib/deliver.mjs');
let root, project, editor, calls;
const STOP_LOG = ['# 製作進度', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', '| 2026-11-06 10:00 | ④ 完成影片預覽 | 待回覆 |  |  |', '', '## 回饋輪', ''].join('\n');
const post = (route, body = {}) => fetch(new URL(route, editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const state = async () => (await fetch(new URL('/api/export', editor.url))).json();
const finished = async () => { await editor.ctx.exportJob.done; return state(); };
const finalFile = () => path.join(project, 'output', 'final.mp4');

// 假的子處理程序：照參數判斷是哪一步；overrides 可以換掉某一步的結果
function fakeRun(overrides = {}) {
  return async (cmd, args, opts = {}) => {
    const name = cmd === 'ffprobe' ? 'probe' : args.includes('--test') ? 'testBuild' : args.includes('compositions/test-clip.html') ? 'testRender' : args.includes('--fps') ? 'render' : args.includes('final') ? 'qc' : 'other';
    calls.push(name);
    if (overrides[name]) return overrides[name](args, opts);
    if (name === 'probe') return { code: 0, stdout: 'video\naudio\n', stderr: '' };
    if (name === 'render') {
      opts.onData?.('Rendering 37%\n');
      fs.writeFileSync(args[args.indexOf('--output') + 1], 'new-video');
      return { code: 0, stdout: '', stderr: '' };
    }
    if (name === 'qc') return { code: 0, stdout: JSON.stringify({ ok: true, errors: 0, warnings: 1, checks: [{ key: 'format', level: 'ok', text: '格式正確' }, { key: 'loud', level: 'warn', text: '音量偏小' }] }), stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
}
const start = async (overrides, extra = {}) => {
  editor = await startEditor({
    flags: { project, template: TEMPLATE }, cwd: root, port: 0, writeState: false, speakerTemplate: path.join(root, 'shared', 'template'),
    exportDeps: { build: async () => { calls.push('build'); return [200, { ok: true, log: '' }]; }, report: async () => ({ report: { items: [{ type: 'media', start: 1 }, { type: 'scene', start: 12.5 }] } }), run: fakeRun(overrides), ...extra },
  });
};

beforeEach(() => {
  calls = [];
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-editor-export-'));
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  project = path.join(root, 'projects', 'demo');
  fs.mkdirSync(path.join(project, 'work', 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(project, 'output'), { recursive: true });
  fs.writeFileSync(path.join(project, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, scenes: [] }));
  fs.writeFileSync(path.join(project, 'work', '製作進度.md'), STOP_LOG);
});
afterEach(async () => { await editor?.close(); editor = null; fs.rmSync(root, { recursive: true, force: true }); });

test('輸出：照順序跑完，測試片段從第一張卡開始，整支換成 final.mp4，寫停點紀錄，檔案可以播', async () => {
  fs.writeFileSync(finalFile(), 'old-video');
  let testArg;
  await start({ testBuild: (args) => { testArg = args[args.indexOf('--test') + 1]; return { code: 0, stdout: '', stderr: '' }; } });
  assert.equal((await post('/api/export')).status, 200);
  const s = await finished();
  assert.deepEqual(calls, ['build', 'testBuild', 'testRender', 'probe', 'render', 'qc']);
  assert.equal(testArg, '12.5,4');
  assert.equal(s.ok, true);
  assert.equal(s.percent, 100);
  assert.deepEqual(s.warnings, ['音量偏小']);
  assert.equal(fs.readFileSync(finalFile(), 'utf8'), 'new-video');
  assert.equal(fs.existsSync(path.join(project, 'work', 'final-rendering.mp4')), false);
  const log = fs.readFileSync(path.join(project, 'work', '製作進度.md'), 'utf8');
  assert.match(log, /\| \d{4}-\d\d-\d\d \d\d:\d\d \| ④ 完成影片預覽 \| 通過 \| 「在剪輯台按「輸出完成影片」」 \| output\/final\.mp4 \|\n\n## 回饋輪/);
  const part = await fetch(new URL(s.final.url, editor.url), { headers: { Range: 'bytes=0-2' } });
  assert.equal(part.status, 206);
  assert.equal((await fetch(new URL('/output/plan.json', editor.url))).status, 404);
});

test('輸出：測試片段沒有聲音就不輸出整支，舊的 final.mp4 不動', async () => {
  fs.writeFileSync(finalFile(), 'old-video');
  await start({ probe: () => ({ code: 0, stdout: 'video\n', stderr: '' }) });
  await post('/api/export');
  const s = await finished();
  assert.equal(s.ok, false);
  assert.equal(s.step, 'test');
  assert.equal(calls.includes('render'), false);
  assert.match(s.errors[0], /video/);
  assert.equal(fs.readFileSync(finalFile(), 'utf8'), 'old-video');
});

test('輸出：整支失敗時舊檔不動、暫存檔清掉', async () => {
  fs.writeFileSync(finalFile(), 'old-video');
  await start({ render: (args) => { fs.writeFileSync(args[args.indexOf('--output') + 1], 'half'); return { code: 1, stdout: '', stderr: 'render blew up' }; } });
  await post('/api/export');
  const s = await finished();
  assert.equal(s.ok, false);
  assert.deepEqual(s.errors, ['render blew up']);
  assert.equal(fs.readFileSync(finalFile(), 'utf8'), 'old-video');
  assert.equal(fs.existsSync(path.join(project, 'work', 'final-rendering.mp4')), false);
});

test('輸出：驗收有 ✖ 時留下檔案、列出 ✖、不寫通過', async () => {
  await start({ qc: () => ({ code: 1, stdout: JSON.stringify({ ok: false, errors: 1, warnings: 0, checks: [{ key: 'duration', level: 'error', text: '長度不符' }] }), stderr: '' }) });
  await post('/api/export');
  const s = await finished();
  assert.equal(s.ok, false);
  assert.deepEqual(s.errors, ['長度不符']);
  assert.equal(fs.readFileSync(finalFile(), 'utf8'), 'new-video');
  assert.equal(fs.readFileSync(path.join(project, 'work', '製作進度.md'), 'utf8'), STOP_LOG);
});

test('輸出：重新產生失敗就停在第一步', async () => {
  await start({}, { build: async () => [200, { ok: false, issues: { errors: ['s05 文字超出上限'], warnings: [] } }] });
  await post('/api/export');
  const s = await finished();
  assert.equal(s.ok, false);
  assert.equal(s.step, 'build');
  assert.deepEqual(s.errors, ['s05 文字超出上限']);
  assert.deepEqual(calls, []);
});

test('輸出中：不能再開一次、不能存檔或重新產生；可以取消，舊檔不動', async () => {
  fs.writeFileSync(finalFile(), 'old-video');
  let release;
  await start({ render: (args) => new Promise((resolve) => { fs.writeFileSync(args[args.indexOf('--output') + 1], 'half'); release = () => resolve({ code: 143, stdout: '', stderr: '' }); }) });
  assert.equal((await post('/api/export')).status, 200);
  while (!release) await new Promise((r) => setTimeout(r, 5));
  assert.equal((await state()).running, true);
  assert.equal((await post('/api/export')).status, 409);
  assert.equal((await post('/api/build')).status, 409);
  assert.equal((await post('/api/save', {})).status, 409);
  assert.equal((await post('/api/export/cancel')).status, 200);
  release();
  const s = await finished();
  assert.equal(s.canceled, true);
  assert.equal(s.ok, false);
  assert.equal(fs.readFileSync(finalFile(), 'utf8'), 'old-video');
  assert.equal(fs.existsSync(path.join(project, 'work', 'final-rendering.mp4')), false);
  assert.equal((await post('/api/export/cancel')).status, 409);
});

test('輸出：修改單生成中、沒有 plan.json 時擋下', async () => {
  await start({}, { requestStates: () => ({ s05: { state: 'generating' } }) });
  const r = await post('/api/export');
  assert.equal(r.status, 409);
  assert.match((await r.json()).message, /修改單/);
  await editor.close();
  fs.rmSync(path.join(project, 'work', 'hyperframes', 'plan.json'));
  await start();
  assert.equal((await post('/api/export')).status, 400);
  assert.deepEqual(calls, []);
});

// 預先 render（deliver.mjs --prerender）不算輸出；狀態擺好，不真的 render
const pre = (rel) => path.join(project, 'work', rel);
function setPrerender(side, jobPid) {
  fs.mkdirSync(pre('.jobs'), { recursive: true });
  fs.writeFileSync(pre('final-prerender.json'), JSON.stringify(side));
  if (jobPid) fs.writeFileSync(pre('.jobs/prerender.json'), JSON.stringify({ name: 'prerender', pid: jobPid, state: 'running', startedAt: Date.now() }));
}
const sleeper = (tag = 'sleeper') => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', tag], { stdio: 'ignore' });

test('預先 render 在跑：存檔、重新產生都不擋（不算輸出）；存檔不會被回 exporting', async () => {
  await start();
  const worker = sleeper();
  try {
    setPrerender({ state: 'running', fingerprint: 'x', percent: 10 }, worker.pid);
    const state0 = await state();
    assert.equal(state0.running, false);
    const r = await post('/api/save', {});
    assert.notEqual((await r.json()).error, 'exporting');
    const b = await post('/api/build', {});
    assert.notEqual((await b.json()).error, 'exporting');
    assert.equal(fs.existsSync(pre('final-prerender.json')), true, '剪輯台不動預先 render 的狀態（它自己看內容變了會收掉）');
  } finally { worker.kill('SIGKILL'); }
});

test('按輸出：預先 render 內容相同且做完 → 直接接手，不跑測試片段和整支；停點照記', async () => {
  fs.writeFileSync(finalFile(), 'old-video');
  await start();
  fs.writeFileSync(pre('final-prerender.mp4'), 'pre-video');
  setPrerender({ state: 'done', fingerprint: D.contentFingerprint(editor.ctx.P), size: 9, percent: 100 });
  assert.equal((await post('/api/export')).status, 200);
  const s = await finished();
  assert.deepEqual(calls, ['build', 'probe', 'qc']);
  assert.equal(s.ok, true);
  assert.equal(s.percent, 100);
  assert.equal(fs.readFileSync(finalFile(), 'utf8'), 'pre-video');
  assert.match(s.log, /用預先 render 好的完成影片/);
  assert.match(fs.readFileSync(pre('製作進度.md'), 'utf8'), /④ 完成影片預覽 \| 通過/);
});

test('按輸出：預先 render 還在跑、內容相同 → 接著等、百分比照報；取消只停這次輸出，不殺預先 render', async () => {
  fs.writeFileSync(finalFile(), 'old-video');
  await start();
  const worker = sleeper();
  try {
    setPrerender({ state: 'running', fingerprint: D.contentFingerprint(editor.ctx.P), percent: 40 }, worker.pid);
    assert.equal((await post('/api/export')).status, 200);
    for (let i = 0; i < 400 && (await state()).percent !== 40; i++) await new Promise((r) => setTimeout(r, 10));
    const mid = await state();
    assert.equal(mid.running, true);
    assert.equal(mid.step, 'render');
    assert.equal(mid.percent, 40);
    assert.equal(calls.includes('render'), false);
    assert.equal((await post('/api/export/cancel')).status, 200);
    const s = await finished();
    assert.equal(s.canceled, true);
    assert.equal(fs.readFileSync(finalFile(), 'utf8'), 'old-video');
    assert.equal(worker.exitCode, null, '預先 render 還活著');
  } finally { worker.kill('SIGKILL'); }
});

test('按輸出：AI 正在背景輸出（deliver.mjs）→ 擋下；它結束後就能輸出', async () => {
  await start();
  const worker = sleeper('deliver.mjs');
  fs.mkdirSync(pre('.jobs'), { recursive: true });
  fs.writeFileSync(pre('.jobs/deliver.lock'), JSON.stringify({ pid: worker.pid, by: 'cli' }));
  const r = await post('/api/export');
  assert.equal(r.status, 409);
  assert.match((await r.json()).message, /AI 正在背景輸出/);
  await new Promise((res) => { worker.on('exit', res); worker.kill('SIGKILL'); });
  assert.equal((await post('/api/export')).status, 200);
  assert.equal((await finished()).ok, true);
});

test('輸出前確認講者：畫面上還是示範人物就擋下來，照樣輸出時結果會講清楚；存好姓名後不再問', async () => {
  fs.writeFileSync(path.join(project, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, scenes: [{ id: 's0101', scene: 'speaker', from: '#2', to: '#5' }] }));
  await start();
  const info = await (await fetch(new URL('/api/speaker', editor.url))).json();
  assert.equal(info.needed, true);
  assert.equal(info.demo, '林大寶');
  assert.deepEqual(info.segments, ['s0101']);

  const blocked = await post('/api/export');
  assert.equal(blocked.status, 409);
  const body = await blocked.json();
  assert.equal(body.error, 'speaker');
  assert.equal(body.speaker.demo, '林大寶');
  assert.deepEqual(calls, [], '還沒確認，什麼都不跑');

  // 按「照樣輸出」：可以輸出，但不能只說驗收通過
  assert.equal((await post('/api/export', { confirmSpeaker: true })).status, 200);
  const done = await finished();
  assert.equal(done.ok, true);
  assert.match(done.message, /講者介紹還是示範人物「林大寶」/);
  assert.match(done.warnings[0], /^講者介紹還是示範人物「林大寶」（s0101）/);

  // 字數不對：擋下、不寫檔；存好之後就不再問
  const file = path.join(root, 'shared', '講者.json');
  const bad = await post('/api/speaker', { name: '一二三四五六', titles: '講師' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).message, /最多 5 字/);
  assert.equal(fs.existsSync(file), false);
  const ok = await post('/api/speaker', { name: '鼎淵', titles: '工程師、講師' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).speaker.needed, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { name: '鼎淵', titles: ['工程師', '講師'] });
  assert.equal((await post('/api/export')).status, 200);
  const again = await finished();
  assert.equal(again.ok, true);
  assert.equal(again.message, '完成影片輸出好了，驗收也通過了。');
  assert.ok(!again.warnings.some((w) => /示範人物/.test(w)));
});

test('輸出前確認講者：段落自己寫了姓名、或沒有講者段，都不問', async () => {
  fs.writeFileSync(path.join(project, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, scenes: [{ id: 's0101', scene: '14', slots: { name: '鼎淵' } }, { id: 's0102', scene: 'key-point' }] }));
  await start();
  assert.equal((await (await fetch(new URL('/api/speaker', editor.url))).json()).needed, false);
  assert.equal((await post('/api/export')).status, 200);
  await finished();
});

test('剩餘時間：走到 1% 之後才估，照到目前的速度算；接手預先 render 不是從 0 開始也對', async () => {
  let release, etaAtZero, mid;
  const hold = new Promise((r) => { release = r; });
  await start({ render: async (args, opts) => {
    etaAtZero = (await state()).eta;
    opts.onData?.('Rendering 30%\n');
    await new Promise((r) => setTimeout(r, 200));
    mid = await state();
    await hold;
    fs.writeFileSync(args[args.indexOf('--output') + 1], 'v');
    return { code: 0, stdout: '', stderr: '' };
  } });
  await post('/api/export');
  await new Promise((r) => setTimeout(r, 900));
  release();
  const done = await finished();
  assert.equal(etaAtZero, null, '還沒有進度：不能估');
  assert.equal(mid.step, 'render');
  assert.ok(mid.eta >= 0 && mid.eta < 60, `30% 花不到 1 秒，剩 70% 不會超過一分鐘，得到 ${mid.eta}`);
  assert.equal(done.eta, null, '做完就沒有剩餘時間');
  assert.equal(done.final.file, 'output/final.mp4', '路徑從專案算起，使用者看得懂');
});

test('在資料夾中顯示：打開 output/final.mp4 所在的地方；還沒有檔案就說沒有', async () => {
  const calls2 = [];
  await start({}, { reveal: (cmd, args) => { calls2.push([cmd, args]); return { on() {}, unref() {} }; } });
  const none = await post('/api/export/reveal');
  assert.equal(none.status, 404);
  assert.deepEqual(calls2, []);
  fs.writeFileSync(finalFile(), 'x');
  assert.equal((await post('/api/export/reveal')).status, 200);
  assert.equal(calls2.length, 1);
  assert.ok(calls2[0][1].join(' ').includes(process.platform === 'linux' ? 'output' : 'final.mp4'));
});

test('背景先算的完成影片：頁面看得到狀態；開始之後 plan.json 改過就標成不能用', async () => {
  await start();
  const version = async () => (await (await fetch(new URL('/api/version', editor.url))).json()).prerender;
  assert.deepEqual(await version(), { state: 'none' });
  const F = D.deliverPaths(project);
  fs.mkdirSync(path.dirname(F.pre), { recursive: true });
  fs.writeFileSync(F.pre, 'video');
  fs.writeFileSync(F.preState, JSON.stringify({ state: 'done', fingerprint: 'x', percent: 100, size: 5, startedAt: Date.now() + 5000, finishedAt: Date.now() }));
  assert.deepEqual(await version(), { state: 'done', percent: 100, fresh: true });
  fs.writeFileSync(F.preState, JSON.stringify({ state: 'done', fingerprint: 'x', percent: 100, size: 5, startedAt: Date.now() - 60000, finishedAt: Date.now() }));
  assert.equal((await version()).fresh, false, 'plan.json 比它新：這份不能用');
});

test('重新產生的狀態：寫白話的步驟與耗時；重新處理底片的耗時留給下次估', async () => {
  fs.mkdirSync(path.join(project, 'work', 'hyperframes', '.editor'), { recursive: true });
  await start();
  const brief = async () => (await (await fetch(new URL('/api/version', editor.url))).json()).build;
  assert.deepEqual(await brief(), { running: false, seconds: 0, phase: null, slowSeconds: null });
  editor.ctx.build = { running: true, log: '版式：橫式\n重新編碼底片 → assets/rough.mp4…\n量人聲響度（第一次會花一點時間，之後用快取）…\n', startedAt: Date.now() - 65000 };
  const b = await brief();
  assert.equal(b.running, true);
  assert.equal(b.phase, '重新處理影片底片');
  assert.ok(b.seconds >= 65);
  editor.ctx.build.log += '講者瘦臉：先偵測臉部、套用瘦臉（look.mjs run）…\n';
  assert.equal((await brief()).phase, '偵測臉部、套用瘦臉');
  editor.ctx.build = { running: false, log: '', startedAt: 0 };
});

test('輸出選項：頁面選的畫素與字幕傳給流程（render 加 --resolution、用不燒字幕的合成）；看不懂的值用預設；整體百分比只往上、做完 100', async () => {
  let renderArgs;
  await start({
    testBuild: () => { fs.writeFileSync(path.join(project, 'work', 'hyperframes', 'final-nocaps.srt'), '1\n00:00:00,000 --> 00:00:01,000\n字幕\n'); return { code: 0, stdout: '', stderr: '' }; },
    render: (args) => { renderArgs = args; fs.writeFileSync(args[args.indexOf('--output') + 1], 'new-video'); return { code: 0, stdout: '', stderr: '' }; },
  });
  assert.equal((await post('/api/export', { resolution: '4k', captions: 'off' })).status, 200);
  const s = await finished();
  assert.equal(s.ok, true, s.message);
  assert.deepEqual(s.options, { resolution: '4k', captions: 'off' });
  assert.equal(s.overall, 100);
  assert.ok(renderArgs.includes('--resolution') && renderArgs.includes('compositions/final-nocaps.html'));
  assert.ok(fs.existsSync(path.join(project, 'output', 'final.srt')));
  assert.ok(s.final.size > 0);
  await editor.close(); editor = null;
  await start();
  assert.equal((await post('/api/export', { resolution: '8k', captions: 'maybe' })).status, 200);
  assert.deepEqual((await finished()).options, { resolution: '1080p', captions: 'burn' });
});

test('整體百分比：四步照比重，render 那一步照它的 %，沒有 % 的步驟照時間慢慢上去但不超過那一步；只往上', async () => {
  const { overallPercent } = await imp('editor/server/export.mjs');
  const t0 = 1_000_000;
  const j = { running: true, step: 'build', percent: null };
  assert.equal(overallPercent(j, t0), 0);
  const b = overallPercent(j, t0 + 600_000);
  assert.ok(b > 0 && b <= 9, `更新預覽很久也不超過 10%：${b}`);
  j.step = 'render'; j.percent = 50;
  assert.equal(overallPercent(j, t0 + 600_001), 55);
  j.percent = 10;   // 換底片重算之類讓 % 變小：整體不倒退
  assert.equal(overallPercent(j, t0 + 600_002), 55);
  j.step = 'qc';
  assert.equal(overallPercent(j, t0 + 600_003), 95);
  j.running = false; j.ok = true;
  assert.equal(overallPercent(j), 100);
  assert.equal(overallPercent(null), null);
});

// 剪輯頁「輸出完成影片」（019）：流程順序、舊檔保護、沒聲音、驗收 ✖、取消、同時操作、停點紀錄、檔案路由。
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEMPLATE, imp } from './helpers.mjs';

const { startEditor } = await imp('editor.mjs');
const { appendStopPassed } = await imp('editor/server/export.mjs');
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
    flags: { project, template: TEMPLATE }, cwd: root, port: 0, writeState: false,
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
  assert.match(log, /\| \d{4}-\d\d-\d\d \d\d:\d\d \| ④ 完成影片預覽 \| 通過 \| 在剪輯台按「輸出完成影片」 \| output\/final\.mp4 \|\n\n## 回饋輪/);
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

test('停點紀錄：加在表的最後一列、保留 CRLF；沒有檔案或沒有表不寫', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-stoplog-'));
  const f = path.join(dir, 'p.md');
  fs.writeFileSync(f, STOP_LOG.replace(/\n/g, '\r\n'));
  assert.equal(appendStopPassed(f, new Date(2026, 10, 6, 9, 5)), true);
  const lines = fs.readFileSync(f, 'utf8').split('\r\n');
  const at = lines.findIndex((l) => l.includes('待回覆'));
  assert.equal(lines[at + 1], '| 2026-11-06 09:05 | ④ 完成影片預覽 | 通過 | 在剪輯台按「輸出完成影片」 | output/final.mp4 |');
  assert.equal(lines[at + 2], '');
  fs.writeFileSync(f, '# 沒有那張表\n');
  assert.equal(appendStopPassed(f), false);
  assert.equal(appendStopPassed(path.join(dir, 'none.md')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

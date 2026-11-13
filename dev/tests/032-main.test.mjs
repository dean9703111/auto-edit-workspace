// 032 主代理整合時補的修正：剪輯台在專案資料夾不見時自己關閉（不留孤兒服務佔住 port 4400–4419）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, tmpDir } from './helpers.mjs';

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('剪輯台：專案資料夾被刪掉後自己關閉', async (t) => {
  const root = tmpDir(t, 'ae-main-');
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  const project = path.join(root, 'projects', 'gone');
  fs.mkdirSync(path.join(project, 'work', 'hyperframes'), { recursive: true });
  const port = 49300 + (process.pid % 250);
  const r = spawnSync(process.execPath, [path.join(root, 'shared', 'template', 'tools', 'editor.mjs'), '--project', 'projects/gone', '--template', 'shared/template', '--port', String(port), '--json'],
    { cwd: root, encoding: 'utf8', timeout: 60000, env: { ...process.env, AUTO_EDIT_EDITOR_WATCH_MS: '200' } });
  assert.equal(r.status, 0, r.stderr);
  const { pid } = JSON.parse(r.stdout.trim());
  assert.ok(Number.isInteger(pid) && alive(pid), `剪輯台有開起來（pid ${pid}）`);
  t.after(() => { if (alive(pid)) process.kill(pid, 'SIGKILL'); });
  fs.rmSync(project, { recursive: true, force: true });
  for (let i = 0; i < 50 && alive(pid); i++) await sleep(100);
  assert.equal(alive(pid), false, '專案不見了 5 秒內要自己結束');
});

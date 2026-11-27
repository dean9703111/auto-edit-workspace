// 091 lib/hide-windows.mjs：背景跑的剪輯台／背景工作（Windows）叫命令列程式不跳黑色視窗
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withHide, hideChildWindows } from '../../shared/template/tools/lib/hide-windows.mjs';

test('withHide：每一種呼叫方式都加上 windowsHide，已經寫了的照它寫的，回呼留在最後', () => {
  const cb = () => {};
  assert.deepEqual(withHide('file', ['ffprobe', ['-v', 'error'], { encoding: 'utf8' }]), ['ffprobe', ['-v', 'error'], { encoding: 'utf8', windowsHide: true }]);
  assert.deepEqual(withHide('file', ['ffprobe', ['-v'], { windowsHide: false }]), ['ffprobe', ['-v'], { windowsHide: false }]);
  assert.deepEqual(withHide('file', ['ls']), ['ls', [], { windowsHide: true }]);
  assert.deepEqual(withHide('file', ['ls', { cwd: 'x' }]), ['ls', [], { cwd: 'x', windowsHide: true }]);
  assert.deepEqual(withHide('file', ['ls', ['a'], cb]), ['ls', ['a'], { windowsHide: true }, cb]);
  assert.deepEqual(withHide('file', ['ls', ['a'], { cwd: 'x' }, cb]), ['ls', ['a'], { cwd: 'x', windowsHide: true }, cb]);
  assert.deepEqual(withHide('exec', ['dir']), ['dir', { windowsHide: true }]);
  assert.deepEqual(withHide('exec', ['dir', cb]), ['dir', { windowsHide: true }, cb]);
  assert.deepEqual(withHide('exec', ['dir', { cwd: 'x' }, cb]), ['dir', { cwd: 'x', windowsHide: true }, cb]);
});

test('hideChildWindows：不是 Windows 不動；換了之後已經 import 的 spawnSync 也是新的，照樣能跑', async () => {
  assert.equal(hideChildWindows({ platform: 'darwin' }), false);
  const before = (await import('node:child_process')).spawnSync;
  assert.equal(hideChildWindows({ platform: 'win32' }), true);
  assert.equal(hideChildWindows({ platform: 'win32' }), false, '只換一次');
  const { spawnSync } = await import('node:child_process');
  assert.notEqual(spawnSync, before);
  const r = spawnSync(process.execPath, ['-e', 'console.log(42)'], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '42');
});

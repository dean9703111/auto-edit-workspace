// caps.mjs：能力探測（假的執行器，不呼叫真的 codex／mmx）、版本釘住、不洩漏金鑰（specs/contracts/cli-002.md §6）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { imp, WORKSPACE } from './helpers.mjs';

const { probeCaps, formatCaps, hyperframesVersion, versionLine, redact } = await imp('caps.mjs');

const fakeRoot = (pinned, installed) => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-caps-'));
  if (pinned) fs.writeFileSync(path.join(r, 'package.json'), JSON.stringify({ private: true, devDependencies: { hyperframes: pinned } }));
  if (installed) { fs.mkdirSync(path.join(r, 'node_modules', 'hyperframes'), { recursive: true }); fs.writeFileSync(path.join(r, 'node_modules', 'hyperframes', 'package.json'), JSON.stringify({ version: installed })); }
  return r;
};
const chrome = path.join(os.tmpdir(), 'fake-chrome-headless-shell');
fs.writeFileSync(chrome, '');
const runner = (table) => (cmd, args) => {
  const k = [cmd, ...args].join(' ');
  const v = table[k];
  if (v === undefined) return { code: null, stdout: '', stderr: '', error: `spawn ${cmd} ENOENT` };
  return { code: 0, stdout: '', stderr: '', error: null, ...v };
};
const ALL = {
  'codex --version': { stdout: 'codex-cli 0.163.0\n' }, 'codex login status': { stdout: 'Logged in using ChatGPT\n' },
  'mmx --version': { stdout: 'mmx 1.0.28\n' }, 'mmx auth status': { stdout: JSON.stringify({ method: 'api-key', source: 'config.json', key: 'sk-abcdefghijklmnop', balances: [{ amount: 12.5 }] }) },
  'npx --no -- hyperframes browser path': { stdout: `${chrome}\n` }, 'ffmpeg -version': { stdout: 'ffmpeg version 8.1 Copyright\n' }, 'ffprobe -version': { stdout: 'ffprobe version 8.1 Copyright\n' },
};

test('六列的結果、生圖路線、結束碼；mmx 的金鑰與餘額不出現在依據', () => {
  const root = fakeRoot('0.8.221', '0.8.221');
  const r = probeCaps({ root, run: runner(ALL) });
  assert.deepEqual(r.caps.map((c) => [c.id, c.result]), [['model', 'unknown'], ['codex', 'ok'], ['mmx', 'ok'], ['chrome', 'ok'], ['ffmpeg', 'ok'], ['hyperframes', 'ok']]);
  assert.deepEqual(r.imageRoutes, ['codex', 'mmx', 'html']);
  assert.equal(r.exitCode, 0);
  const text = formatCaps(r);
  assert.ok(!/sk-|12\.5|abcdef/.test(text), text);
  assert.match(text, /mmx auth status：已登入（method api-key，source config\.json）/);
  assert.match(text, /\| ffmpeg／ffprobe \| 可用 \| ffmpeg 8\.1、ffprobe 8\.1 \|/);
});

test('codex 壞掉（ENOENT）、codex 未登入、mmx 未登入、Chrome 不在、沒有 ffmpeg → 結束碼 1', () => {
  const root = fakeRoot('0.8.221', '0.8.221');
  const t = { ...ALL };
  delete t['codex --version'];
  t['mmx auth status'] = { code: 1, stdout: '', stderr: 'Not authenticated. Run mmx auth login\n' };
  let r = probeCaps({ root, run: runner(t) });
  assert.equal(r.caps.find((c) => c.id === 'codex').result, 'missing');
  assert.match(r.caps.find((c) => c.id === 'codex').evidence, /codex --version：spawn codex ENOENT/);
  assert.equal(r.caps.find((c) => c.id === 'mmx').result, 'not-logged-in');
  assert.equal(r.exitCode, 0, 'codex、mmx 不影響結束碼');
  assert.deepEqual(r.imageRoutes, ['html']);
  r = probeCaps({ root, run: runner({ ...ALL, 'codex login status': { code: 1, stdout: 'Not logged in\n' } }) });
  assert.equal(r.caps.find((c) => c.id === 'codex').result, 'not-logged-in');
  const t2 = { ...ALL, 'npx --no -- hyperframes browser path': { stdout: '/no/such/chrome\n' } };
  delete t2['ffmpeg -version'];
  r = probeCaps({ root, run: runner(t2) });
  assert.equal(r.caps.find((c) => c.id === 'chrome').result, 'missing');
  assert.equal(r.caps.find((c) => c.id === 'ffmpeg').result, 'missing');
  assert.equal(r.exitCode, 1);
  assert.match(formatCaps(r), /可用的生圖路線：codex → mmx/);
});

test('HyperFrames 版本：相同、不同、沒裝、沒有 package.json 的版本行；根目錄 package.json 釘精確版本', () => {
  assert.equal(versionLine(hyperframesVersion(fakeRoot('0.8.221', '0.8.221'))), 'HyperFrames 0.8.221（package.json 釘 0.8.221）');
  assert.equal(versionLine(hyperframesVersion(fakeRoot('0.8.221', '0.8.216'))), '⚠ HyperFrames 0.8.216 和 package.json 釘的 0.8.221 不同 → 在工作區根目錄跑 npm install');
  assert.match(versionLine(hyperframesVersion(fakeRoot('0.8.221', null))), /^⚠ 工作區根目錄還沒裝 HyperFrames（package\.json 釘 0\.8\.221）/);
  assert.match(versionLine(hyperframesVersion(fakeRoot(null, null))), /^⚠ 工作區根目錄沒有 package\.json/);
  const r = probeCaps({ root: fakeRoot('0.8.221', '0.8.216'), run: runner(ALL) });
  assert.equal(r.caps.find((c) => c.id === 'hyperframes').result, 'version-mismatch');
  assert.equal(r.exitCode, 0, '版本不符只提醒');
  const pkg = JSON.parse(fs.readFileSync(path.join(WORKSPACE, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.match(pkg.devDependencies.hyperframes, /^\d+\.\d+\.\d+$/, '釘精確版本（不能寫 ^ 或 ~）');
  assert.equal(redact('token: abc\nhello sk-123456'), 'hello sk-…');
});

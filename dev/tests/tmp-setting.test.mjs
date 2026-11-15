// 暫存資料夾可以改放別處（041）：預設關閉；shared/setting.json 的 tmp 開了之後每支工具開跑時自己指過去，用不了就退回系統暫存；status.mjs --tmp 設定。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, imp, tmpDir } from './helpers.mjs';

const T = await imp('lib/tmp.mjs');
const { parseFlags } = await imp('status.mjs');
const settingFile = (dir) => path.join(dir, 'setting.json');
const write = (dir, tmp) => fs.writeFileSync(settingFile(dir), typeof tmp === 'string' ? tmp : JSON.stringify({ agents: 4, ...(tmp ? { tmp } : {}) }));
const read = (dir) => JSON.parse(fs.readFileSync(settingFile(dir), 'utf8'));

test('預設關閉：沒有設定檔、沒寫 tmp、寫錯、設定檔壞掉，都不動環境變數', (t) => {
  const dir = tmpDir(t, 'tmp-set-');
  const untouched = (label) => { const env = {}; assert.deepEqual(T.applyTmp(dir, { env }), { state: 'off', dir: null }, label); assert.deepEqual(env, {}, label); };
  untouched('沒有設定檔');
  write(dir, null); untouched('沒寫 tmp');
  for (const bad of ['x', { dir: 'relative/tmp' }, { image: '/x.sparseimage' }, { dir: 5 }]) { write(dir, bad); assert.equal(T.tmpSetting(dir), null); untouched(JSON.stringify(bad)); }
  write(dir, '{ 壞掉'); untouched('不是合法的 JSON');
  assert.equal(T.tmpWarnLine(T.tmpApplied()), null, '關著的時候 status 不多印');
});

test('開著：資料夾在而且可寫 → 暫存指過去（Windows 是 TEMP、TMP，其他是 TMPDIR）', (t) => {
  const dir = tmpDir(t, 'tmp-set-'), ext = path.join(dir, 'ext');
  fs.mkdirSync(ext); write(dir, { dir: ext });
  let env = { TMPDIR: '/sys/tmp' };
  assert.deepEqual(T.applyTmp(dir, { env, platform: 'darwin' }), { state: 'on', dir: ext });
  assert.deepEqual(env, { TMPDIR: ext });
  env = { TEMP: 'C:\\sys', TMP: 'C:\\sys' };
  assert.equal(T.applyTmp(dir, { env, platform: 'win32' }).state, 'on');
  assert.deepEqual(env, { TEMP: ext, TMP: ext });
  assert.deepEqual(T.tmpApplied(), { state: 'on', dir: ext });
});

test('用不了（硬碟沒接）：照舊用系統暫存、不丟錯；這一串子處理程序不再試（AUTO_EDIT_TMP=off）；status 多一行 ⚠', (t) => {
  const dir = tmpDir(t, 'tmp-set-'), ext = path.join(dir, 'ext');
  write(dir, { dir: ext });
  const env = { TMPDIR: '/sys/tmp' };
  const r = T.applyTmp(dir, { env, platform: 'darwin' });
  assert.deepEqual(r, { state: 'fallback', dir: ext });
  assert.deepEqual(env, { TMPDIR: '/sys/tmp', AUTO_EDIT_TMP: 'off' });
  const line = T.tmpWarnLine(r);
  assert.match(line, /^暫存：⚠ /);
  assert.ok(line.includes(ext) && line.includes('系統暫存') && line.includes('--tmp off'), line);
  // 是檔案不是資料夾也算用不了
  fs.writeFileSync(ext, '');
  assert.equal(T.applyTmp(dir, { env: {}, platform: 'darwin' }).state, 'fallback');
});

test('映像檔：macOS 上資料夾不在、映像檔在才掛，掛上了就用；其他平台、映像檔不在都不掛', (t) => {
  const dir = tmpDir(t, 'tmp-set-'), ext = path.join(dir, 'ext'), image = path.join(dir, 'tmp.sparseimage');
  write(dir, { dir: ext, image });
  const calls = [];
  const attach = (img) => { calls.push(img); fs.mkdirSync(ext); };
  assert.equal(T.applyTmp(dir, { env: {}, platform: 'darwin', attach }).state, 'fallback', '映像檔不在');
  fs.writeFileSync(image, '');
  assert.equal(T.applyTmp(dir, { env: {}, platform: 'linux', attach }).state, 'fallback', '不是 macOS');
  assert.deepEqual(calls, []);
  const env = {};
  assert.deepEqual(T.applyTmp(dir, { env, platform: 'darwin', attach }), { state: 'on', dir: ext });
  assert.deepEqual(calls, [image]);
  assert.equal(env.TMPDIR, ext);
  assert.equal(T.applyTmp(dir, { env: {}, platform: 'darwin', attach }).state, 'on');
  assert.equal(calls.length, 1, '已經掛著就不再掛');
});

test('環境變數 AUTO_EDIT_TMP 蓋過設定：off＝這一次不改；<資料夾>＝這一次用這個', (t) => {
  const dir = tmpDir(t, 'tmp-set-'), ext = path.join(dir, 'ext'), other = path.join(dir, 'other');
  fs.mkdirSync(ext); fs.mkdirSync(other); write(dir, { dir: ext });
  let env = { AUTO_EDIT_TMP: 'off', TMPDIR: '/sys/tmp' };
  assert.equal(T.applyTmp(dir, { env, platform: 'darwin' }).state, 'off');
  assert.equal(env.TMPDIR, '/sys/tmp');
  env = { AUTO_EDIT_TMP: other };
  assert.deepEqual(T.applyTmp(dir, { env, platform: 'darwin' }), { state: 'on', dir: other });
  assert.equal(env.TMPDIR, other);
  fs.rmSync(settingFile(dir));
  assert.equal(T.applyTmp(dir, { env: { AUTO_EDIT_TMP: other }, platform: 'darwin' }).state, 'on', '沒有設定檔也可以只用環境變數');
});

test('saveTmp：只收用得了的完整路徑；寫 tmp 不動其他設定；off 拿掉；用不了時不寫', (t) => {
  const dir = tmpDir(t, 'tmp-set-'), ext = path.join(dir, 'ext'), image = path.join(dir, 'tmp.sparseimage');
  write(dir, null);
  assert.throws(() => T.saveTmp(dir, 'relative/tmp'), /完整路徑/);
  assert.throws(() => T.saveTmp(dir, ext), /現在用不了.*沒有寫進 shared\/setting\.json/);
  assert.throws(() => T.saveTmp(dir, ext, { image: 'tmp.sparseimage' }), /--tmp-image 要寫映像檔的完整路徑/);
  assert.throws(() => T.saveTmp(dir, ext, { image }), /找不到映像檔/);
  assert.deepEqual(read(dir), { agents: 4 }, '失敗都沒有動設定檔');
  fs.mkdirSync(ext);
  assert.equal(T.saveTmp(dir, ext).dir, ext);
  assert.deepEqual(read(dir), { agents: 4, tmp: { dir: ext } });
  // 映像檔還沒掛：設定時先掛一次，掛得上才寫
  fs.rmdirSync(ext); fs.writeFileSync(image, '');
  const r = T.saveTmp(dir, ext, { image, platform: 'darwin', attach: () => fs.mkdirSync(ext) });
  assert.deepEqual({ dir: r.dir, image: r.image }, { dir: ext, image });
  assert.deepEqual(read(dir), { agents: 4, tmp: { dir: ext, image } });
  assert.deepEqual(T.tmpSetting(dir), { dir: ext, image });
  assert.equal(T.saveTmp(dir, 'off').off, true);
  assert.deepEqual(read(dir), { agents: 4 });
  write(dir, '{ 壞掉');
  assert.throws(() => T.saveTmp(dir, ext), /修好這個檔再設定/);
});

test('status.mjs 的參數：--tmp、--tmp-image 收值；--tmp 和其他模式不能一起用', () => {
  assert.deepEqual(parseFlags(['--tmp', '/Volumes/x', '--tmp-image=/Volumes/v/x.sparseimage']), { tmp: '/Volumes/x', 'tmp-image': '/Volumes/v/x.sparseimage' });
  assert.equal(parseFlags(['--tmp', 'off']).tmp, 'off');
  assert.throws(() => parseFlags(['--tmp']), /--tmp 後面要接值/);
  assert.throws(() => parseFlags(['--tmp', '/x', '--agents', '3']), /不能一起用/);
});

// 整條路實跑：假的工作區（shared/setting.json＋shared/template/tools/ 的四支檔）裡放一支「工具」，看它和它的子處理程序的 os.tmpdir()
test('每支工具開跑時自己套用（isMain）：沒設定是系統暫存；設定了連子處理程序都跟著走；被 import 的時候不套用', (t) => {
  const root = tmpDir(t, 'tmp-set-'), shared = path.join(root, 'shared'), tools = path.join(shared, 'template', 'tools'), ext = path.join(root, 'ext');
  fs.mkdirSync(path.join(tools, 'lib'), { recursive: true });
  for (const f of ['cli.mjs', 'tmp.mjs', 'settings.mjs', 'atomic.mjs']) fs.copyFileSync(path.join(TOOLS, 'lib', f), path.join(tools, 'lib', f));
  fs.writeFileSync(path.join(tools, 'probe.mjs'), [
    "import os from 'node:os';",
    "import { spawnSync } from 'node:child_process';",
    "import { isMain } from './lib/cli.mjs';",
    'export const main = isMain(import.meta.url);',
    "const child = () => spawnSync(process.execPath, ['-e', 'console.log(require(\"node:os\").tmpdir())'], { encoding: 'utf8' }).stdout.trim();",
    'if (main) console.log(JSON.stringify({ tmp: os.tmpdir(), child: child() }));',
  ].join('\n'));
  fs.writeFileSync(path.join(tools, 'importer.mjs'), "import os from 'node:os';\nimport { main } from './probe.mjs';\nconsole.log(JSON.stringify({ main, tmp: os.tmpdir() }));\n");
  const env = { ...process.env }; delete env.AUTO_EDIT_TMP;
  const run = (file, extra = {}) => { const r = spawnSync(process.execPath, [path.join(tools, file)], { encoding: 'utf8', env: { ...env, ...extra } }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  const sys = run('probe.mjs');
  assert.equal(sys.tmp, sys.child);
  assert.notEqual(sys.tmp, ext, '沒有設定：系統暫存');
  fs.mkdirSync(ext); write(shared, { dir: ext });
  assert.deepEqual(run('probe.mjs'), { tmp: ext, child: ext }, '設定了：自己和子處理程序都用它');
  assert.deepEqual(run('importer.mjs'), { main: false, tmp: sys.tmp }, '被 import（不是直接執行的那支）不套用');
  assert.deepEqual(run('probe.mjs', { AUTO_EDIT_TMP: 'off' }), sys, 'AUTO_EDIT_TMP=off：這一次不改');
  fs.rmdirSync(ext);
  assert.deepEqual(run('probe.mjs'), sys, '資料夾不在：退回系統暫存，照常跑完');
});

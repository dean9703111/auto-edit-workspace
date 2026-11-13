// setup/install-skills.mjs 的測試（specs/contracts/cli-001.md §2 的 9 個案例＋032 D10 子代理定義、D3 checkInstalled）：node --test dev/tests/install-skills.test.mjs
// 每個案例都在系統暫存資料夾裡複製一份「迷你工作區」（setup/install-skills.mjs＋.agents/skills/，子代理的案例再加 .agents/agents/），用 --dest 裝到暫存位置；不碰真正的 ~/.minimax 與 .claude。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS = fs.readdirSync(path.join(ROOT, '.agents', 'skills')).filter((d) => d.startsWith('auto-edit-')).sort();
const AGENT = 'auto-edit-worker.md';

function workspace(t, { agents = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-skills-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'ws', 'setup'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'setup', 'install-skills.mjs'), path.join(dir, 'ws', 'setup', 'install-skills.mjs'));
  fs.cpSync(path.join(ROOT, '.agents', 'skills'), path.join(dir, 'ws', '.agents', 'skills'), { recursive: true });
  if (agents) fs.cpSync(path.join(ROOT, '.agents', 'agents'), path.join(dir, 'ws', '.agents', 'agents'), { recursive: true });
  const dest = path.join(dir, 'dest');
  const run = (...args) => spawnSync(process.execPath, [path.join(dir, 'ws', 'setup', 'install-skills.mjs'), '--dest', dest, ...args], { encoding: 'utf8' });
  return { dir, ws: path.join(dir, 'ws'), dest, run };
}
const tree = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).sort() : []);
const mtimes = (d) => Object.fromEntries(tree(d).map((f) => [f, fs.statSync(path.join(d, f)).mtimeMs]));

test('第一次裝：9 × 2 個資料夾，每個都有 SKILL.md 與標記檔，結束碼 0', (t) => {
  const w = workspace(t);
  const r = w.run();
  assert.equal(r.status, 0, `${r.stdout}${r.stderr} → 第一次裝要成功`);
  for (const where of ['project', 'user']) {
    for (const n of SKILLS) {
      assert.ok(fs.existsSync(path.join(w.dest, where, n, 'SKILL.md')), `${where}/${n}/SKILL.md 不在 → copyDir 沒複製到`);
      const mark = JSON.parse(fs.readFileSync(path.join(w.dest, where, n, '.auto-edit-install.json'), 'utf8'));
      assert.equal(mark.source, `.agents/skills/${n}`, '標記檔 source 不對 → 照 cli-001 §1.2 第 5 點');
      assert.ok(mark.files['SKILL.md'], '標記檔沒有 SKILL.md 的 sha256 → 照 cli-001 §1.2 第 5 點');
    }
  }
  assert.match(r.stdout, new RegExp(`✓ 完成：${SKILLS.length} 支 × 2 個位置，新裝 ${SKILLS.length * 2}、更新 0、沒變 0`), '最後一行和 cli-001 §1.3 不同 → 照原文印');
});

test('再跑一次：全部「沒變」，檔案 mtime 不變', (t) => {
  const w = workspace(t);
  w.run();
  const before = mtimes(w.dest);
  const r = w.run();
  assert.equal(r.status, 0, `${r.stdout}${r.stderr} → 第二次也要成功`);
  assert.equal((r.stdout.match(/沒變$/gm) || []).length, SKILLS.length * 2, `${r.stdout} → 每一列都要是「沒變」`);
  assert.deepEqual(mtimes(w.dest), before, '沒變卻重寫了檔案 → 內容一樣時不要動');
});

test('改一個原始 reference 檔：只有那支「更新（1 個檔不同）」', (t) => {
  const w = workspace(t);
  w.run();
  fs.appendFileSync(path.join(w.ws, '.agents', 'skills', 'auto-edit-rough', 'references', 'ng-rules.md'), '\n改了一行\n');
  const r = w.run('--target', 'project');
  assert.equal(r.status, 0, `${r.stdout}${r.stderr} → 要成功`);
  const updated = r.stdout.split('\n').filter((l) => l.includes('更新（'));
  assert.equal(updated.length, 1, `${r.stdout} → 只有 auto-edit-rough 要更新`);
  assert.match(updated[0], /auto-edit-rough\s+更新（1 個檔不同）/, '狀態字和 cli-001 §1.2 不同 → 印「更新（N 個檔不同）」');
  assert.match(fs.readFileSync(path.join(w.dest, 'project', 'auto-edit-rough', 'references', 'ng-rules.md'), 'utf8'), /改了一行/, '更新後內容還是舊的 → 整個資料夾換成新的');
});

test('目標已有沒標記檔的同名資料夾：✖ 衝突、其他照裝、結束碼 1、那個資料夾沒被動', (t) => {
  const w = workspace(t);
  const mine = path.join(w.dest, 'project', 'auto-edit-rough');
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(path.join(mine, 'SKILL.md'), '使用者自己的 Skill');
  const r = w.run();
  assert.equal(r.status, 1, `${r.stdout} → 有衝突要結束碼 1`);
  assert.match(r.stdout, /auto-edit-rough\s+✖ 衝突 → 這個資料夾不是 install-skills 裝的/, '衝突那一列和 cli-001 §1.3 不同 → 照原文印');
  assert.match(r.stdout, /✖ 有 1 個衝突，其他的已經裝好/, '最後一行和 cli-001 §1.3 不同 → 照原文印');
  assert.equal(fs.readFileSync(path.join(mine, 'SKILL.md'), 'utf8'), '使用者自己的 Skill', '動到了使用者的資料夾 → 沒有標記檔的一律不動');
  assert.deepEqual(fs.readdirSync(mine), ['SKILL.md'], '在使用者的資料夾裡寫了檔 → 一律不動');
  assert.ok(fs.existsSync(path.join(w.dest, 'project', 'auto-edit-review', 'SKILL.md')), '其他 Skill 沒裝 → 衝突只跳過那一支');
});

test('目標是 symlink：✖ 衝突，連結指到的資料夾沒被動', (t) => {
  const w = workspace(t);
  const real = path.join(w.dir, 'real-skill');
  fs.mkdirSync(real);
  fs.writeFileSync(path.join(real, 'SKILL.md'), '連結的目標');
  fs.mkdirSync(path.join(w.dest, 'user'), { recursive: true });
  try { fs.symlinkSync(real, path.join(w.dest, 'user', 'auto-edit-rough'), 'junction'); } catch (e) { t.skip(`這台機器不能建 symlink（${e.code}）`); return; }
  const r = w.run();
  assert.equal(r.status, 1, `${r.stdout} → symlink 要算衝突`);
  assert.match(r.stdout, /user\s+\S*auto-edit-rough\s+✖ 衝突/, `${r.stdout} → symlink 那一列要印 ✖ 衝突`);
  assert.deepEqual(fs.readdirSync(real), ['SKILL.md'], '跟著連結寫進去了 → symlink 一律不動、不跟著走');
  assert.equal(fs.readFileSync(path.join(real, 'SKILL.md'), 'utf8'), '連結的目標', '改到連結的目標 → symlink 一律不動');
});

test('原始 frontmatter 有 allowed-tools：驗證失敗、一個檔都沒寫、結束碼 1', (t) => {
  const w = workspace(t);
  const f = path.join(w.ws, '.agents', 'skills', 'auto-edit-rough', 'SKILL.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^version: .*$/m, (l) => `${l}\nallowed-tools: Bash`));
  const r = w.run();
  assert.equal(r.status, 1, `${r.stdout}${r.stderr} → 驗證失敗要結束碼 1`);
  assert.match(r.stderr, /✖ \.agents\/skills\/auto-edit-rough\/SKILL\.md：frontmatter 有不允許的欄位 allowed-tools → 只能用 name／description／version/, '錯誤訊息和 cli-001 §1.2 不同 → 照原文印');
  assert.deepEqual(tree(w.dest), [], '驗證失敗還寫了檔 → 任一支不過就整個不裝');
});

test('--dry-run：沒有任何檔被建立', (t) => {
  const w = workspace(t);
  const r = w.run('--dry-run');
  assert.equal(r.status, 0, `${r.stdout}${r.stderr} → 預演要成功`);
  assert.match(r.stdout, /（預演）新裝/, '狀態字前面要加（預演）→ 照 cli-001 §1.3');
  assert.match(r.stdout, /預演：.*沒有寫任何檔/, '最後一行和 cli-001 §1.3 不同 → 照原文印');
  assert.deepEqual(tree(w.dest), [], '--dry-run 寫了檔 → 預演不能寫');
});

test('--check：裝完後改一個已安裝檔 → ⚠ 和原始檔不同（1 個檔）、結束碼 1', (t) => {
  const w = workspace(t);
  w.run();
  const ok = w.run('--check');
  assert.equal(ok.status, 0, `${ok.stdout} → 剛裝完要一致`);
  assert.match(ok.stdout, /✓ .*都和 \.agents\/skills\/ 一致/, '一致時的原文不對 → 照 cli-001 §1.3');
  fs.appendFileSync(path.join(w.dest, 'user', 'auto-edit-style', 'SKILL.md'), '\n手改\n');
  const r = w.run('--check');
  assert.equal(r.status, 1, `${r.stdout} → 不一致要結束碼 1`);
  assert.match(r.stdout, /⚠ \S*auto-edit-style 和原始檔不同（1 個檔）/, `${r.stdout} → 照 cli-001 §1.3 印不一致的那一列`);
  assert.match(r.stdout, /→ 跑 node setup\/install-skills\.mjs 更新/, '最後一行要給修法 → 照 cli-001 §1.3');
  assert.match(fs.readFileSync(path.join(w.dest, 'user', 'auto-edit-style', 'SKILL.md'), 'utf8'), /手改/, '--check 動到檔案 → --check 只比對不寫');
});

test('--foo：結束碼 2', (t) => {
  const w = workspace(t);
  const r = w.run('--foo');
  assert.equal(r.status, 2, `${r.stderr} → 不認得的參數要結束碼 2`);
  assert.match(r.stderr, /✖ 不認得的參數：--foo → 跑 node setup\/install-skills\.mjs --help 看可用的參數/, '訊息和 cli-001 §1.1 不同 → 照原文印');
});

// ---------- 032 D10：子代理定義 .agents/agents/ → .claude/agents/（--dest 時是 <dest>/agents） ----------

test('子代理：和 Skill 一起裝到 agents/，有標記檔；最後一行多一段子代理；--target user 不裝', (t) => {
  const w = workspace(t, { agents: true });
  const r = w.run();
  assert.equal(r.status, 0, `${r.stdout}${r.stderr} → 第一次裝要成功`);
  assert.equal(fs.readFileSync(path.join(w.dest, 'agents', AGENT), 'utf8'), fs.readFileSync(path.join(ROOT, '.agents', 'agents', AGENT), 'utf8'), '裝好的內容要和正本一樣');
  const mark = JSON.parse(fs.readFileSync(path.join(w.dest, 'agents', '.auto-edit-install.json'), 'utf8'));
  assert.equal(mark.source, '.agents/agents', '標記檔 source 不對');
  assert.ok(mark.files[AGENT], '標記檔要列出裝的檔與 sha256 → 之後才知道哪些是 install-skills 裝的');
  assert.match(r.stdout, new RegExp(`✓ 完成：${SKILLS.length} 支 × 2 個位置，新裝 ${SKILLS.length * 2}、更新 0、沒變 0；子代理 1 個（\\.claude/agents/）：新裝 1、更新 0、沒變 0`), `${r.stdout} → Skill 那一段的原文不能變，子代理接在後面`);
  const again = w.run();
  assert.match(again.stdout, /auto-edit-worker\.md\s+沒變$/m, `${again.stdout} → 再跑一次要是「沒變」`);
  const u = workspace(t, { agents: true });
  assert.equal(u.run('--target', 'user').status, 0);
  assert.ok(!fs.existsSync(path.join(u.dest, 'agents')), '--target user 只裝 ~/.minimax/skills，不碰子代理（MiniMax Code 沒有對應的位置）');
});

test('子代理：已經有同名檔、內容一樣 → 接手（補上標記）；內容不一樣 → ✖ 衝突、不動它；別的子代理不碰', (t) => {
  const same = workspace(t, { agents: true });
  fs.mkdirSync(path.join(same.dest, 'agents'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, '.agents', 'agents', AGENT), path.join(same.dest, 'agents', AGENT));
  fs.writeFileSync(path.join(same.dest, 'agents', 'my-own.md'), '使用者自己的子代理');
  const r = same.run('--target', 'project');
  assert.equal(r.status, 0, `${r.stdout} → 內容一樣要能接手`);
  assert.match(r.stdout, /auto-edit-worker\.md\s+沒變（補上標記）/, `${r.stdout} → 接手那一列要講補上標記`);
  assert.ok(JSON.parse(fs.readFileSync(path.join(same.dest, 'agents', '.auto-edit-install.json'), 'utf8')).files[AGENT], '接手後標記檔要列出它');
  assert.equal(fs.readFileSync(path.join(same.dest, 'agents', 'my-own.md'), 'utf8'), '使用者自己的子代理', '動到了使用者自己的子代理');
  assert.ok(!r.stdout.includes('my-own'), '使用者自己的子代理不是它裝的，不用報');

  const diff = workspace(t, { agents: true });
  fs.mkdirSync(path.join(diff.dest, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(diff.dest, 'agents', AGENT), '---\nname: auto-edit-worker\n---\n舊的內容\n');
  const c = diff.run('--target', 'project');
  assert.equal(c.status, 1, `${c.stdout} → 內容不一樣要算衝突`);
  assert.match(c.stdout, /auto-edit-worker\.md\s+✖ 衝突 → 這個檔不是 install-skills 裝的/, `${c.stdout} → 衝突那一列照 Skill 的寫法`);
  assert.match(c.stdout, /✖ 有 1 個衝突，其他的已經裝好/);
  assert.equal(fs.readFileSync(path.join(diff.dest, 'agents', AGENT), 'utf8'), '---\nname: auto-edit-worker\n---\n舊的內容\n', '衝突的檔不能被覆寫');
  assert.ok(!fs.existsSync(path.join(diff.dest, 'agents', '.auto-edit-install.json')), '沒有裝任何子代理時不要寫標記檔');
});

test('子代理：正本改了 → 更新；--check 比對內容，裝好的被改過 → ⚠、結束碼 1', (t) => {
  const w = workspace(t, { agents: true });
  w.run();
  assert.match(w.run('--check').stdout, /✓ .*一致；子代理 1 個（\.claude\/agents\/）也和 \.agents\/agents\/ 一致/, '一致時要連子代理一起講');
  fs.appendFileSync(path.join(w.dest, 'agents', AGENT), '\n手改\n');
  const r = w.run('--check');
  assert.equal(r.status, 1, `${r.stdout} → 不一致要結束碼 1`);
  assert.match(r.stdout, /⚠ \S*auto-edit-worker\.md 和原始檔不同/, r.stdout);
  fs.appendFileSync(path.join(w.ws, '.agents', 'agents', AGENT), '\n正本多一行\n');
  const u = w.run('--target', 'project');
  assert.equal(u.status, 0, u.stdout);
  assert.match(u.stdout, /auto-edit-worker\.md\s+更新/, `${u.stdout} → 正本改了要更新`);
  assert.match(fs.readFileSync(path.join(w.dest, 'agents', AGENT), 'utf8'), /正本多一行/);
});

test('子代理：正本 frontmatter 的 name 和檔名不同 → 驗證失敗、一個檔都沒寫', (t) => {
  const w = workspace(t, { agents: true });
  const f = path.join(w.ws, '.agents', 'agents', AGENT);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^name: .*$/m, 'name: other'));
  const r = w.run();
  assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /✖ \.agents\/agents\/auto-edit-worker\.md：name 是「other」→ 要等於檔名 auto-edit-worker/, r.stderr);
  assert.deepEqual(tree(w.dest), [], '驗證失敗還寫了檔 → 任一個不過就整個不裝');
});

// ---------- 032 D3：checkInstalled()（status.mjs 用） ----------

test('checkInstalled()：不印、不安裝；回 { ok, stale }，同一個位置的併成一行', async (t) => {
  const w = workspace(t, { agents: true });
  const { checkInstalled } = await import(pathToFileURL(path.join(w.ws, 'setup', 'install-skills.mjs')).href);
  const printed = [];
  const keep = { log: console.log, error: console.error };
  console.log = (...a) => printed.push(a.join(' '));
  console.error = (...a) => printed.push(a.join(' '));
  let none, fresh, partial, conflict, wrote;
  try {
    none = checkInstalled({ dest: w.dest });
    wrote = fs.existsSync(w.dest);
    w.run();
    fresh = checkInstalled({ dest: w.dest });
    fs.appendFileSync(path.join(w.dest, 'user', 'auto-edit-style', 'SKILL.md'), '\n手改\n');
    fs.rmSync(path.join(w.dest, 'project', 'auto-edit-rough'), { recursive: true, force: true });
    partial = checkInstalled({ dest: w.dest });
    fs.rmSync(path.join(w.dest, 'agents', '.auto-edit-install.json'));
    fs.writeFileSync(path.join(w.dest, 'agents', AGENT), '別人的檔');
    conflict = checkInstalled({ dest: w.dest, target: 'project' });
  } finally { Object.assign(console, keep); }
  assert.deepEqual(printed, [], 'checkInstalled 不能印東西 → status.mjs 自己決定怎麼印');
  assert.equal(none.ok, false);
  assert.equal(none.stale.length, 3, `${none.stale.join('\n')} → 三個位置都沒裝：一個位置一行`);
  assert.ok(none.stale.every((l) => l.includes('還沒裝')), none.stale.join('\n'));
  assert.equal(wrote, false, 'checkInstalled 寫了檔 → 只比對，不能安裝');
  assert.deepEqual(fresh, { ok: true, stale: [] }, '剛裝完要一致');
  assert.equal(partial.ok, false);
  assert.ok(partial.stale.some((l) => /project 還沒裝 auto-edit-rough$/.test(l)), partial.stale.join('\n'));
  assert.ok(partial.stale.some((l) => /user 的 auto-edit-style 和 \.agents\/ 的正本不同$/.test(l)), partial.stale.join('\n'));
  assert.equal(conflict.ok, false);
  assert.ok(conflict.stale.some((l) => /auto-edit-worker\.md 不是 install-skills 裝的（同名）→ 改名或移走它/.test(l)), conflict.stale.join('\n'));
});

test('被 node -e 匯入、路徑放在參數裡：不能當成直接執行（不安裝），checkInstalled 照常回傳', (t) => {
  const w = workspace(t, { agents: true });
  const home = path.join(w.dir, 'home');
  fs.mkdirSync(home);
  const file = path.join(w.ws, 'setup', 'install-skills.mjs');
  const code = 'const { pathToFileURL } = await import("node:url"); const m = await import(pathToFileURL(process.argv[1]).href); console.log(JSON.stringify(m.checkInstalled()));';
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, file], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(w.ws, '.claude')), `${r.stdout} → 匯入時跑了 main()，真的裝進工作區了`);
  assert.ok(!fs.existsSync(path.join(home, '.minimax')), `${r.stdout} → 匯入時跑了 main()，真的裝進家目錄了`);
  assert.equal(JSON.parse(r.stdout.trim().split('\n').at(-1)).ok, false, `${r.stdout} → 只印 checkInstalled 的結果`);
});

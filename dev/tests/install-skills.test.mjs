// setup/install-skills.mjs 的測試（specs/contracts/cli-001.md §2 的 9 個案例）：node --test dev/tests/install-skills.test.mjs
// 每個案例都在系統暫存資料夾裡複製一份「迷你工作區」（setup/install-skills.mjs＋.agents/skills/），用 --dest 裝到暫存位置；不碰真正的 ~/.minimax 與 .claude。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS = fs.readdirSync(path.join(ROOT, '.agents', 'skills')).filter((d) => d.startsWith('auto-edit-')).sort();

function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-skills-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'ws', 'setup'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'setup', 'install-skills.mjs'), path.join(dir, 'ws', 'setup', 'install-skills.mjs'));
  fs.cpSync(path.join(ROOT, '.agents', 'skills'), path.join(dir, 'ws', '.agents', 'skills'), { recursive: true });
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
  assert.match(r.stdout, new RegExp(`✔ 完成：${SKILLS.length} 支 × 2 個位置，新裝 ${SKILLS.length * 2}、更新 0、沒變 0`), '最後一行和 cli-001 §1.3 不同 → 照原文印');
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
  assert.match(ok.stdout, /✔ .*都和 \.agents\/skills\/ 一致/, '一致時的原文不對 → 照 cli-001 §1.3');
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

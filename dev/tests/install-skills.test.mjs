// setup/install-skills.mjs 的測試（specs/contracts/cli-001.md §2）：node --test dev/tests/install-skills.test.mjs
// 每個案例都在系統暫存資料夾裡做一份「迷你工作區」（setup/install-skills.mjs＋.agents/skills/，子代理的案例再加 .agents/agents/）
// 和一個假的家目錄（HOME／USERPROFILE 指過去，裡面放哪些 Agent 的設定資料夾就偵測到哪些）；不碰真正的 ~/.minimax 與 .claude。
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
const WIN = process.platform === 'win32';
const N = SKILLS.length;

// home：家目錄裡要先有哪些 Agent 的設定資料夾（.claude、.minimax、.codex、.cursor）
function workspace(t, { agents = false, home = ['.claude', '.minimax'] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-skills-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ws = path.join(dir, 'ws');
  fs.mkdirSync(path.join(ws, 'setup'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'setup', 'install-skills.mjs'), path.join(ws, 'setup', 'install-skills.mjs'));
  fs.cpSync(path.join(ROOT, '.agents', 'skills'), path.join(ws, '.agents', 'skills'), { recursive: true });
  if (agents) fs.cpSync(path.join(ROOT, '.agents', 'agents'), path.join(ws, '.agents', 'agents'), { recursive: true });
  const hd = path.join(dir, 'home');
  for (const h of home) fs.mkdirSync(path.join(hd, h), { recursive: true });
  fs.mkdirSync(hd, { recursive: true });
  const env = { ...process.env, HOME: hd, USERPROFILE: hd };
  delete env.CLAUDE_CONFIG_DIR; delete env.CODEX_HOME; delete env.AUTO_EDIT_INSTALL_COPY;
  const run = (...args) => {
    const extra = typeof args.at(-1) === 'object' ? args.pop() : {};
    return spawnSync(process.execPath, [path.join(ws, 'setup', 'install-skills.mjs'), ...args], { encoding: 'utf8', env: { ...env, ...extra } });
  };
  return { dir, ws, home: hd, run, env };
}
const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
const tree = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).sort() : []);
// 舊版 install-skills 複製過去的樣子：資料夾＋標記檔
function oldCopy(src, dst, name) {
  fs.cpSync(src, dst, { recursive: true });
  fs.writeFileSync(path.join(dst, '.auto-edit-install.json'), JSON.stringify({ source: `.agents/skills/${name}`, version: '0.1.0', files: {} }));
}
function linkTo(target, at) {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at, WIN ? 'junction' : 'dir');
}

test('第一次裝：偵測到 Claude Code、MiniMax Code → 兩個專案層位置都是連到正本的連結，結束碼 0', (t) => {
  const w = workspace(t);
  const r = w.run();
  assert.equal(r.status, 0, `${r.stdout}${r.stderr} → 第一次裝要成功`);
  assert.match(r.stdout, /Agent（偵測到的）：Claude Code、MiniMax Code（連結）/, `${r.stdout} → 第二行要講偵測到哪些 Agent`);
  for (const where of ['.claude', '.minimax']) {
    for (const n of SKILLS) {
      const p = path.join(w.ws, where, 'skills', n);
      assert.ok(isLink(p), `${where}/skills/${n} 不是連結 → Mac 用 symlink、Windows 用 junction`);
      assert.equal(fs.realpathSync(p), fs.realpathSync(path.join(w.ws, '.agents', 'skills', n)), `${where}/skills/${n} 沒有指到正本`);
      if (!WIN) assert.equal(fs.readlinkSync(p), path.join('..', '..', '.agents', 'skills', n), 'Mac／Linux 要用相對路徑（工作區搬家也不會斷）');
      assert.ok(fs.existsSync(path.join(p, 'SKILL.md')), `${where}/skills/${n}/SKILL.md 讀不到`);
    }
  }
  assert.match(r.stdout, new RegExp(`✓ 完成：${N} 支 × 2 個 Agent（Claude Code、MiniMax Code），新裝 ${N * 2}、改成連結 0、更新 0、沒變 0`), '最後一行和 cli-001 §1.3 不同 → 照原文印');
  assert.ok(!fs.existsSync(path.join(w.home, '.minimax', 'skills')), '專案層優先：不能再裝到家目錄');
});

test('再跑一次：全部「沒變（連結）」；改正本不用重跑，--check 照樣一致', (t) => {
  const w = workspace(t);
  w.run();
  const r = w.run();
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.equal((r.stdout.match(/沒變（連結）$/gm) || []).length, N * 2, `${r.stdout} → 每一列都要是「沒變（連結）」`);
  fs.appendFileSync(path.join(w.ws, '.agents', 'skills', 'auto-edit-rough', 'SKILL.md'), '\n改了一行\n');
  assert.match(fs.readFileSync(path.join(w.ws, '.claude', 'skills', 'auto-edit-rough', 'SKILL.md'), 'utf8'), /改了一行/, '連結讀到的要是正本的最新內容');
  const c = w.run('--check');
  assert.equal(c.status, 0, `${c.stdout} → 改了正本，連結還是一致`);
  assert.match(c.stdout, /✓ .*都和 \.agents\/skills\/ 一致/, '一致時的原文不對 → 照 cli-001 §1.3');
});

test('偵測：只有 .claude → 只建 .claude/skills；只有 .codex、.cursor → 什麼都不用建；一個都沒有 → 全部建', (t) => {
  const c = workspace(t, { home: ['.claude'] });
  assert.equal(c.run().status, 0);
  assert.ok(isLink(path.join(c.ws, '.claude', 'skills', 'auto-edit-rough')), '偵測到 Claude Code 要建 .claude/skills');
  assert.ok(!fs.existsSync(path.join(c.ws, '.minimax')), '沒裝 MiniMax Code 不要建 .minimax/');

  const x = workspace(t, { home: ['.codex', '.cursor'] });
  const r = x.run();
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /✓ Codex、Cursor 直接讀 \.agents\/skills\/，不用裝/, r.stdout);
  assert.ok(!fs.existsSync(path.join(x.ws, '.claude')) && !fs.existsSync(path.join(x.ws, '.minimax')), '只有 Codex、Cursor 不用建任何連結');
  assert.equal(x.run('--check').status, 0, '只有 Codex、Cursor 時 --check 也要過');

  const none = workspace(t, { home: [] });
  const n = none.run();
  assert.equal(n.status, 0, n.stdout);
  assert.match(n.stdout, /Agent：一個都沒偵測到，全部都裝/, n.stdout);
  assert.ok(isLink(path.join(none.ws, '.claude', 'skills', 'auto-edit-rough')) && isLink(path.join(none.ws, '.minimax', 'skills', 'auto-edit-rough')), '偵測不到就兩個都建');
});

test('--agent：不偵測，只建指定的；不認得的 Agent 結束碼 2', (t) => {
  const w = workspace(t);
  const r = w.run('--agent', 'minimax');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /Agent（--agent 指定）：MiniMax Code（連結）/, r.stdout);
  assert.ok(isLink(path.join(w.ws, '.minimax', 'skills', 'auto-edit-rough')));
  assert.ok(!fs.existsSync(path.join(w.ws, '.claude')), '--agent minimax 不能建 .claude/');
  const bad = w.run('--agent', 'vim');
  assert.equal(bad.status, 2, bad.stderr);
  assert.match(bad.stderr, /✖ 不認得的參數：--agent vim（可以用 claude、minimax、codex、cursor 或 all）/, bad.stderr);
});

test('舊版的專案層複本（有標記檔）→ 改成連結；舊版的全域複本 → 移除，使用者自己的同名資料夾不動', (t) => {
  const w = workspace(t);
  const src = (n) => path.join(w.ws, '.agents', 'skills', n);
  oldCopy(src('auto-edit-rough'), path.join(w.ws, '.claude', 'skills', 'auto-edit-rough'), 'auto-edit-rough');
  const g = path.join(w.home, '.minimax', 'skills');
  for (const n of SKILLS) oldCopy(src(n), path.join(g, n), n);
  fs.mkdirSync(path.join(g, 'auto-edit-mine'));
  fs.writeFileSync(path.join(g, 'auto-edit-mine', 'SKILL.md'), '使用者自己的');
  fs.mkdirSync(path.join(g, 'hyperframes'));

  const before = w.run('--check');
  assert.equal(before.status, 1, `${before.stdout} → 還有全域複本要算不一致`);
  assert.match(before.stdout, /⚠ \S*auto-edit-rough 是舊版裝的全域複本，會和專案層的重複 → 跑 node setup\/install-skills\.mjs 移除/, before.stdout);

  const r = w.run();
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /\.claude\/skills\/auto-edit-rough\s+改成連結（原本是複製）/, r.stdout);
  assert.ok(isLink(path.join(w.ws, '.claude', 'skills', 'auto-edit-rough')), '舊複本要換成連結');
  assert.match(r.stdout, new RegExp(`移除舊的全域複本 ${N} 個`), r.stdout);
  assert.deepEqual(fs.readdirSync(g).sort(), ['auto-edit-mine', 'hyperframes'], '只能刪有標記檔的 auto-edit-*，其他的不動');
  assert.equal(fs.readFileSync(path.join(g, 'auto-edit-mine', 'SKILL.md'), 'utf8'), '使用者自己的');
  assert.equal(w.run('--check').status, 0, '清完之後 --check 要過');
});

test('衝突：沒標記檔的同名資料夾、指到別處的連結 → ✖ 衝突、結束碼 1、都不動，其他照裝', (t) => {
  const w = workspace(t);
  const mine = path.join(w.ws, '.claude', 'skills', 'auto-edit-rough');
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(path.join(mine, 'SKILL.md'), '使用者自己的 Skill');
  const real = path.join(w.dir, 'real-skill');
  fs.mkdirSync(real);
  fs.writeFileSync(path.join(real, 'SKILL.md'), '連結的目標');
  linkTo(real, path.join(w.ws, '.minimax', 'skills', 'auto-edit-rough'));
  const r = w.run();
  assert.equal(r.status, 1, `${r.stdout} → 有衝突要結束碼 1`);
  assert.match(r.stdout, /\.claude\/skills\/auto-edit-rough\s+✖ 衝突 → 這個資料夾不是 install-skills 裝的/, r.stdout);
  assert.match(r.stdout, /\.minimax\/skills\/auto-edit-rough\s+✖ 衝突/, `${r.stdout} → 指到別處的連結也算衝突`);
  assert.match(r.stdout, /✖ 有 2 個衝突，其他的已經裝好/, r.stdout);
  assert.deepEqual(fs.readdirSync(mine), ['SKILL.md'], '動到了使用者的資料夾');
  assert.equal(fs.readFileSync(path.join(real, 'SKILL.md'), 'utf8'), '連結的目標', '跟著別人的連結寫進去了');
  assert.ok(isLink(path.join(w.ws, '.claude', 'skills', 'auto-edit-review')), '其他 Skill 沒裝 → 衝突只跳過那一支');
});

test('它建的連結指錯（工作區搬家、從別份工作區連過來）→ 重新連結，原本指到的資料夾不動', (t) => {
  const w = workspace(t);
  const other = path.join(w.dir, 'old-ws', '.agents', 'skills', 'auto-edit-rough');
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(other, 'SKILL.md'), '舊工作區');
  const at = path.join(w.ws, '.claude', 'skills', 'auto-edit-rough');
  linkTo(other, at);
  assert.match(w.run('--check').stdout, /⚠ \.claude\/skills\/auto-edit-rough 的連結指到別的地方/, '--check 要報指錯的連結');
  const r = w.run();
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /auto-edit-rough\s+重新連結（原本指到 /, r.stdout);
  assert.equal(fs.realpathSync(at), fs.realpathSync(path.join(w.ws, '.agents', 'skills', 'auto-edit-rough')));
  assert.equal(fs.readFileSync(path.join(other, 'SKILL.md'), 'utf8'), '舊工作區', '動到舊工作區的檔');
});

test('正本已經沒有的 auto-edit-*：它建的連結拿掉，別的不碰', (t) => {
  const w = workspace(t, { home: ['.claude'] });
  linkTo(path.join(w.ws, '.agents', 'skills', 'auto-edit-gone'), path.join(w.ws, '.claude', 'skills', 'auto-edit-gone'));
  const r = w.run();
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /auto-edit-gone\s+拿掉連結（正本已經沒有了）/, r.stdout);
  assert.ok(!isLink(path.join(w.ws, '.claude', 'skills', 'auto-edit-gone')));
});

test('建不了連結的磁碟：退回複製（有標記檔）、印 ⚠ 要重跑；之後改正本 → 更新', (t) => {
  const w = workspace(t, { agents: true, home: ['.claude'] });
  const copy = { AUTO_EDIT_INSTALL_COPY: '1' };
  const r = w.run(copy);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const p = path.join(w.ws, '.claude', 'skills', 'auto-edit-rough');
  assert.ok(!isLink(p) && fs.existsSync(path.join(p, '.auto-edit-install.json')), '退回複製要有標記檔');
  assert.match(r.stdout, /新裝（複製：這個磁碟建不了連結）/, r.stdout);
  assert.match(r.stdout, new RegExp(`⚠ 有 ${N + 1} 個是複製的.*→ 改了 \\.agents/ 的正本之後要重跑 node setup/install-skills\\.mjs`), r.stdout);
  assert.ok(!isLink(path.join(w.ws, '.claude', 'agents', AGENT)) && fs.existsSync(path.join(w.ws, '.claude', 'agents', '.auto-edit-install.json')), '子代理也要退回複製');
  fs.appendFileSync(path.join(w.ws, '.agents', 'skills', 'auto-edit-rough', 'references', 'ng-rules.md'), '\n改了一行\n');
  const c = w.run('--check', copy);
  assert.equal(c.status, 1, c.stdout);
  assert.match(c.stdout, /⚠ \.claude\/skills\/auto-edit-rough 和正本不同（1 個檔）/, c.stdout);
  const u = w.run(copy);
  assert.match(u.stdout, /auto-edit-rough\s+更新（複製，1 個檔不同）/, u.stdout);
  assert.equal((u.stdout.match(/更新（複製/g) || []).length, 1, `${u.stdout} → 只有 auto-edit-rough 要更新`);
  // 換到建得了連結的磁碟：複本自動改成連結
  const l = w.run();
  assert.match(l.stdout, /auto-edit-rough\s+改成連結（原本是複製）/, l.stdout);
  assert.ok(isLink(p));
  if (isLink(path.join(w.ws, '.claude', 'agents', AGENT))) assert.ok(!fs.existsSync(path.join(w.ws, '.claude', 'agents', '.auto-edit-install.json')), '子代理都改成連結後不留標記檔');
});

test('原始 frontmatter 有 allowed-tools：驗證失敗、一個檔都沒寫、結束碼 1', (t) => {
  const w = workspace(t);
  const f = path.join(w.ws, '.agents', 'skills', 'auto-edit-rough', 'SKILL.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^version: .*$/m, (l) => `${l}\nallowed-tools: Bash`));
  const r = w.run();
  assert.equal(r.status, 1, `${r.stdout}${r.stderr} → 驗證失敗要結束碼 1`);
  assert.match(r.stderr, /✖ \.agents\/skills\/auto-edit-rough\/SKILL\.md：frontmatter 有不允許的欄位 allowed-tools → 只能用 name／description／version/, '錯誤訊息和 cli-001 §1.2 不同 → 照原文印');
  assert.ok(!fs.existsSync(path.join(w.ws, '.claude')) && !fs.existsSync(path.join(w.ws, '.minimax')), '驗證失敗還寫了檔 → 任一支不過就整個不裝');
});

test('--dry-run：沒有任何檔被建立或刪除', (t) => {
  const w = workspace(t);
  const g = path.join(w.home, '.minimax', 'skills', 'auto-edit-rough');
  oldCopy(path.join(w.ws, '.agents', 'skills', 'auto-edit-rough'), g, 'auto-edit-rough');
  const r = w.run('--dry-run');
  assert.equal(r.status, 0, `${r.stdout}${r.stderr} → 預演要成功`);
  assert.match(r.stdout, /（預演）新裝（連結）/, '狀態字前面要加（預演）→ 照 cli-001 §1.3');
  assert.match(r.stdout, /（預演）移除（舊版的全域複本；專案層優先）/, r.stdout);
  assert.match(r.stdout, /預演：.*會移除舊的全域複本 1 個；沒有寫任何檔/, '最後一行和 cli-001 §1.3 不同 → 照原文印');
  assert.ok(!fs.existsSync(path.join(w.ws, '.claude')) && !fs.existsSync(path.join(w.ws, '.minimax')), '--dry-run 寫了檔');
  assert.ok(fs.existsSync(path.join(g, 'SKILL.md')), '--dry-run 刪了檔');
});

test('--check：連結被拿掉 → ⚠ 還沒裝、結束碼 1；--check 不寫檔', (t) => {
  const w = workspace(t);
  w.run();
  fs.unlinkSync(path.join(w.ws, '.minimax', 'skills', 'auto-edit-style'));
  const r = w.run('--check');
  assert.equal(r.status, 1, `${r.stdout} → 不一致要結束碼 1`);
  assert.match(r.stdout, /⚠ \.minimax\/skills\/auto-edit-style 還沒裝/, r.stdout);
  assert.match(r.stdout, /→ 跑 node setup\/install-skills\.mjs 更新/, '最後一行要給修法 → 照 cli-001 §1.3');
  assert.ok(!fs.existsSync(path.join(w.ws, '.minimax', 'skills', 'auto-edit-style')), '--check 動到檔案 → --check 只比對不寫');
});

test('--foo：結束碼 2', (t) => {
  const w = workspace(t);
  const r = w.run('--foo');
  assert.equal(r.status, 2, `${r.stderr} → 不認得的參數要結束碼 2`);
  assert.match(r.stderr, /✖ 不認得的參數：--foo → 跑 node setup\/install-skills\.mjs --help 看可用的參數/, '訊息和 cli-001 §1.1 不同 → 照原文印');
});

// ---------- 子代理定義 .agents/agents/ → .claude/agents/（只有 Claude Code） ----------

test('子代理：和 Skill 一起連到 .claude/agents/；最後一行多一段子代理；沒有 Claude Code 不裝', (t) => {
  const w = workspace(t, { agents: true });
  const r = w.run();
  assert.equal(r.status, 0, `${r.stdout}${r.stderr} → 第一次裝要成功`);
  const p = path.join(w.ws, '.claude', 'agents', AGENT);
  assert.equal(fs.readFileSync(p, 'utf8'), fs.readFileSync(path.join(ROOT, '.agents', 'agents', AGENT), 'utf8'), '裝好的內容要和正本一樣');
  if (isLink(p)) assert.equal(fs.realpathSync(p), fs.realpathSync(path.join(w.ws, '.agents', 'agents', AGENT)));
  else assert.ok(WIN, '只有 Windows 沒開開發人員模式時才可以退回複製');
  assert.match(r.stdout, new RegExp(`✓ 完成：${N} 支 × 2 個 Agent（Claude Code、MiniMax Code），新裝 ${N * 2}、改成連結 0、更新 0、沒變 0；子代理 1 個（\\.claude/agents/）：新裝 1、改成連結 0、更新 0、沒變 0`), r.stdout);
  assert.match(w.run().stdout, /auto-edit-worker\.md\s+沒變（(連結|複製)）$/m, '再跑一次要是「沒變」');
  const m = workspace(t, { agents: true, home: ['.minimax'] });
  assert.equal(m.run().status, 0);
  assert.ok(!fs.existsSync(path.join(m.ws, '.claude')), '沒有 Claude Code 不裝子代理（MiniMax Code 沒有對應的位置）');
});

test('子代理：同名、內容一樣 → 改成連結；內容不一樣 → ✖ 衝突、不動它；別的子代理不碰', (t) => {
  const same = workspace(t, { agents: true, home: ['.claude'] });
  const adir = path.join(same.ws, '.claude', 'agents');
  fs.mkdirSync(adir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, '.agents', 'agents', AGENT), path.join(adir, AGENT));
  fs.writeFileSync(path.join(adir, 'my-own.md'), '使用者自己的子代理');
  const r = same.run();
  assert.equal(r.status, 0, `${r.stdout} → 內容一樣要能接手`);
  assert.match(r.stdout, /auto-edit-worker\.md\s+(改成連結（原本是複製）|沒變（複製，補上標記）)/, r.stdout);
  assert.equal(fs.readFileSync(path.join(adir, 'my-own.md'), 'utf8'), '使用者自己的子代理', '動到了使用者自己的子代理');
  assert.ok(!r.stdout.includes('my-own'), '使用者自己的子代理不是它裝的，不用報');

  const diff = workspace(t, { agents: true, home: ['.claude'] });
  const d2 = path.join(diff.ws, '.claude', 'agents');
  fs.mkdirSync(d2, { recursive: true });
  fs.writeFileSync(path.join(d2, AGENT), '---\nname: auto-edit-worker\n---\n舊的內容\n');
  const c = diff.run();
  assert.equal(c.status, 1, `${c.stdout} → 內容不一樣要算衝突`);
  assert.match(c.stdout, /auto-edit-worker\.md\s+✖ 衝突 → 這個檔不是 install-skills 裝的/, c.stdout);
  assert.match(c.stdout, /✖ 有 1 個衝突，其他的已經裝好/);
  assert.equal(fs.readFileSync(path.join(d2, AGENT), 'utf8'), '---\nname: auto-edit-worker\n---\n舊的內容\n', '衝突的檔不能被覆寫');
  assert.ok(!fs.existsSync(path.join(d2, '.auto-edit-install.json')), '沒有裝任何子代理時不要寫標記檔');
});

test('子代理：正本 frontmatter 的 name 和檔名不同 → 驗證失敗、一個檔都沒寫', (t) => {
  const w = workspace(t, { agents: true });
  const f = path.join(w.ws, '.agents', 'agents', AGENT);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^name: .*$/m, 'name: other'));
  const r = w.run();
  assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /✖ \.agents\/agents\/auto-edit-worker\.md：name 是「other」→ 要等於檔名 auto-edit-worker/, r.stderr);
  assert.ok(!fs.existsSync(path.join(w.ws, '.claude')), '驗證失敗還寫了檔 → 任一個不過就整個不裝');
});

// ---------- checkInstalled()（status.mjs、check.sh 用） ----------

test('checkInstalled()：不印、不安裝；回 { ok, none, stale }，同一個位置的併成一行', async (t) => {
  const w = workspace(t, { agents: true });
  const { checkInstalled } = await import(pathToFileURL(path.join(w.ws, 'setup', 'install-skills.mjs')).href);
  const printed = [];
  const keep = { log: console.log, error: console.error, home: process.env.HOME, profile: process.env.USERPROFILE };
  console.log = (...a) => printed.push(a.join(' '));
  console.error = (...a) => printed.push(a.join(' '));
  process.env.HOME = w.home; process.env.USERPROFILE = w.home;
  const agent = 'claude,minimax';
  let none, fresh, partial, legacy, conflict, wrote;
  try {
    none = checkInstalled({ agent });
    wrote = fs.existsSync(path.join(w.ws, '.claude')) || fs.existsSync(path.join(w.ws, '.minimax'));
    assert.equal(w.run('--agent', agent).status, 0);
    fresh = checkInstalled({ agent });
    fs.unlinkSync(path.join(w.ws, '.claude', 'skills', 'auto-edit-rough'));
    fs.unlinkSync(path.join(w.ws, '.claude', 'skills', 'auto-edit-style'));
    partial = checkInstalled({ agent });
    w.run('--agent', agent);
    oldCopy(path.join(w.ws, '.agents', 'skills', 'auto-edit-rough'), path.join(w.home, '.minimax', 'skills', 'auto-edit-rough'), 'auto-edit-rough');
    legacy = checkInstalled({ agent });
    fs.rmSync(path.join(w.home, '.minimax', 'skills'), { recursive: true });
    fs.unlinkSync(path.join(w.ws, '.claude', 'agents', AGENT));
    fs.writeFileSync(path.join(w.ws, '.claude', 'agents', AGENT), '別人的檔');
    conflict = checkInstalled({ agent });
  } finally { console.log = keep.log; console.error = keep.error; process.env.HOME = keep.home; process.env.USERPROFILE = keep.profile; }
  assert.deepEqual(printed, [], 'checkInstalled 不能印東西 → status.mjs 自己決定怎麼印');
  assert.equal(none.ok, false);
  assert.equal(none.none, true, '一支都沒裝時 none 要是 true（check.sh 用來分 missing／too_old）');
  assert.equal(none.stale.length, 3, `${none.stale.join('\n')} → 三個位置都沒裝：一個位置一行`);
  assert.ok(none.stale.every((l) => l.includes('還沒裝')), none.stale.join('\n'));
  assert.equal(wrote, false, 'checkInstalled 寫了檔 → 只比對，不能安裝');
  assert.deepEqual(fresh, { ok: true, none: false, stale: [] }, '剛裝完要一致');
  assert.equal(partial.none, false);
  assert.ok(partial.stale.some((l) => /^\.claude\/skills 還沒裝 auto-edit-rough、auto-edit-style$/.test(l)), partial.stale.join('\n'));
  assert.ok(legacy.stale.some((l) => /還有舊版的全域複本 auto-edit-rough（專案層優先）→ 跑 node setup\/install-skills\.mjs 移除$/.test(l)), legacy.stale.join('\n'));
  assert.equal(conflict.ok, false);
  assert.ok(conflict.stale.some((l) => /auto-edit-worker\.md 不是 install-skills 裝的（同名）→ 改名或移走它/.test(l)), conflict.stale.join('\n'));
});

test('被 node -e 匯入、路徑放在參數裡：不能當成直接執行（不安裝），checkInstalled 照常回傳', (t) => {
  const w = workspace(t, { agents: true });
  const file = path.join(w.ws, 'setup', 'install-skills.mjs');
  const code = 'const { pathToFileURL } = await import("node:url"); const m = await import(pathToFileURL(process.argv[1]).href); console.log(JSON.stringify(m.checkInstalled()));';
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, file], { encoding: 'utf8', env: w.env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(w.ws, '.claude')) && !fs.existsSync(path.join(w.ws, '.minimax')), `${r.stdout} → 匯入時跑了 main()，真的裝進工作區了`);
  assert.equal(JSON.parse(r.stdout.trim().split('\n').at(-1)).ok, false, `${r.stdout} → 只印 checkInstalled 的結果`);
});

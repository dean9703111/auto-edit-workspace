#!/usr/bin/env node
/**
 * 把 .agents/skills/auto-edit-* 的 9 支 Skill 複製到 Claude Code 與 MiniMax Code 讀得到的位置（零依賴，只用 Node 22）
 *
 *   node setup/install-skills.mjs              裝到兩個位置：<工作區>/.claude/skills/、~/.minimax/skills/
 *   node setup/install-skills.mjs --target project|user|all
 *   node setup/install-skills.mjs --dry-run    只印會做什麼，不寫檔
 *   node setup/install-skills.mjs --check      只比對已安裝的和原始檔是否一致（不一致結束碼 1）
 *   node setup/install-skills.mjs --json       stdout 只印一個 JSON
 *
 * 只更新它自己裝過的 auto-edit-* 資料夾（有 .auto-edit-install.json 標記檔）；同名但不是它裝的、或是 symlink，一律不動並報 ✖。
 * 改了 .agents/skills/ 之後重跑一次就會更新。
 *
 * 子代理定義 .agents/agents/*.md（正本）同一套做法裝到 <工作區>/.claude/agents/（Claude Code 的專案層；--target user 不裝）：
 * 標記檔 .claude/agents/.auto-edit-install.json 列的檔才是它裝的；已經有同名檔、內容和正本一樣就接手（補上標記），不一樣報 ✖ 衝突。
 * MiniMax Code、Codex 沒有對應的子代理位置，不裝。
 *
 * 給程式用：checkInstalled() → { ok, stale: [一行一個人看得懂的說明] }（只比對，不印、不安裝；status.mjs 用）。
 *
 * 契約：specs/contracts/cli-001.md。--dest <資料夾> 是測試用（三個位置換成 <資料夾>/project、<資料夾>/user、<資料夾>/agents）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, '.agents', 'skills');
const MARK = '.auto-edit-install.json';
const WIN = process.platform === 'win32';

const HELP = `把 .agents/skills/auto-edit-* 的 9 支 Skill 複製到 Claude Code 與 MiniMax Code 讀得到的位置（零依賴，只用 Node 22）

  node setup/install-skills.mjs              裝到兩個位置：<工作區>/.claude/skills/、~/.minimax/skills/
  node setup/install-skills.mjs --target project|user|all
  node setup/install-skills.mjs --dry-run    只印會做什麼，不寫檔
  node setup/install-skills.mjs --check      只比對已安裝的和原始檔是否一致（不一致結束碼 1）
  node setup/install-skills.mjs --json       stdout 只印一個 JSON

只更新它自己裝過的 auto-edit-* 資料夾（有 .auto-edit-install.json 標記檔）；同名但不是它裝的、或是 symlink，一律不動並報 ✖。
改了 .agents/skills/ 之後重跑一次就會更新。

子代理定義 .agents/agents/*.md 也一起裝到 <工作區>/.claude/agents/（Claude Code；--target user 不裝），規則一樣：
已經有同名檔、內容和正本一樣就接手，不一樣報 ✖ 衝突、不動它。`;

// ---------- 參數 ----------
function parseArgs(argv) {
  const o = { target: 'all', dryRun: false, check: false, json: false, dest: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [k, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null];
    const val = () => (inline != null ? inline : argv[++i]);
    if (k === '--help' || k === '-h') o.help = true;
    else if (k === '--dry-run') o.dryRun = true;
    else if (k === '--check') o.check = true;
    else if (k === '--json') o.json = true;
    else if (k === '--target') { o.target = val(); if (!['project', 'user', 'all'].includes(o.target)) return { bad: `--target ${o.target ?? ''}` }; }
    else if (k === '--dest') { o.dest = val(); if (!o.dest) return { bad: '--dest' }; }
    else return { bad: a };
  }
  return o;
}

// ---------- 原始 Skill ----------
const listFiles = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return listFiles(p, base);
  if (e.isFile() && e.name !== MARK) return [path.relative(base, p).split(path.sep).join('/')];
  return [];
}).sort();
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function validate(name) {
  const rel = `.agents/skills/${name}/SKILL.md`;
  const file = path.join(SRC, name, 'SKILL.md');
  if (!fs.existsSync(file)) return `✖ ${rel}：找不到 SKILL.md → 每支 Skill 的資料夾都要有 SKILL.md`;
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return `✖ ${rel}：開頭沒有 --- 包起來的 frontmatter → 第一行寫 ---，接 name／description／version，再一行 ---`;
  const fm = {};
  for (const l of m[1].split('\n')) {
    if (!l.trim()) continue;
    const k = l.match(/^([A-Za-z_-]+):\s?(.*)$/);
    if (!k) return `✖ ${rel}：frontmatter 有看不懂的行「${l.trim().slice(0, 40)}」→ description 要寫成單行`;
    fm[k[1]] = k[2];
  }
  const extra = Object.keys(fm).filter((k) => !['name', 'description', 'version'].includes(k));
  if (extra.length) return `✖ ${rel}：frontmatter 有不允許的欄位 ${extra.join('、')} → 只能用 name／description／version`;
  if (fm.name !== name) return `✖ ${rel}：name 是「${fm.name ?? ''}」→ 要等於資料夾名稱 ${name}`;
  if (!fm.description) return `✖ ${rel}：沒有 description → 寫一行「做什麼。當使用者說…時使用。…時不要用」`;
  return { version: fm.version || '' };
}

// ---------- 目標位置 ----------
function targets(o) {
  const home = os.homedir();
  const all = [
    { id: 'project', dir: o.dest ? path.join(o.dest, 'project') : path.join(ROOT, '.claude', 'skills') },
    { id: 'user', dir: o.dest ? path.join(o.dest, 'user') : path.join(home, '.minimax', 'skills') },
  ];
  return all.filter((t) => o.target === 'all' || o.target === t.id).map((t) => ({
    ...t,
    show: (name) => {
      if (o.dest) return path.join(t.dir, name);
      if (t.id === 'project') return `.claude/skills/${name}`;
      return WIN ? `%USERPROFILE%\\.minimax\\skills\\${name}` : `~/.minimax/skills/${name}`;
    },
  }));
}

// ---------- 子代理定義（.agents/agents/*.md → .claude/agents/） ----------
const AGENT_SRC = path.join(ROOT, '.agents', 'agents');
const agentFiles = () => (fs.existsSync(AGENT_SRC) ? fs.readdirSync(AGENT_SRC, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name).sort() : []);

function validateAgent(file) {
  const rel = `.agents/agents/${file}`;
  const text = fs.readFileSync(path.join(AGENT_SRC, file), 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return `✖ ${rel}：開頭沒有 --- 包起來的 frontmatter → 第一行寫 ---，接 name／description，再一行 ---`;
  const fm = {};
  for (const l of m[1].split('\n')) {
    if (!l.trim() || l.trim().startsWith('#')) continue;   // # 開頭是給人看的註解（例：model 可以改）
    const k = l.match(/^([A-Za-z_-]+):\s?(.*)$/);
    if (!k) return `✖ ${rel}：frontmatter 有看不懂的行「${l.trim().slice(0, 40)}」→ 每行寫成「欄位: 值」，description 寫成單行`;
    fm[k[1]] = k[2];
  }
  const name = file.slice(0, -3);
  if (fm.name !== name) return `✖ ${rel}：name 是「${fm.name ?? ''}」→ 要等於檔名 ${name}`;
  if (!fm.description) return `✖ ${rel}：沒有 description → 寫一行「這個子代理做什麼、什麼時候派它」`;
  return null;
}

// 只有 Claude Code 的專案層讀得到（MiniMax Code、Codex 沒有對應的位置）：--target user 時不裝
function agentTarget(o) {
  if (o.target === 'user') return null;
  const dir = o.dest ? path.join(o.dest, 'agents') : path.join(ROOT, '.claude', 'agents');
  return { id: 'project', dir, show: (f) => (o.dest ? path.join(dir, f) : `.claude/agents/${f}`) };
}

const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
const readMark = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, MARK), 'utf8')); } catch { return null; } };

function diffCount(srcDir, files, mark) {
  const want = Object.fromEntries(files.map((f) => [f, sha(path.join(srcDir, f))]));
  const have = mark?.files || {};
  const keys = new Set([...Object.keys(want), ...Object.keys(have)]);
  let n = 0;
  for (const k of keys) if (want[k] !== have[k]) n++;
  return { n, want };
}
function diffInstalled(dstDir, files, srcDir) {
  // --check：比對實際安裝的檔案內容（不只是標記檔）
  const want = Object.fromEntries(files.map((f) => [f, sha(path.join(srcDir, f))]));
  const got = fs.existsSync(dstDir) ? Object.fromEntries(listFiles(dstDir).map((f) => [f, sha(path.join(dstDir, f))])) : {};
  const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
  let n = 0;
  for (const k of keys) if (want[k] !== got[k]) n++;
  return n;
}

function copyDir(src, dst, files) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of files) {
    const to = path.join(dst, ...f.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(src, ...f.split('/')), to);
  }
}

// ---------- 主程式 ----------
export function main(argv, out = console.log, err = console.error) {
  const o = parseArgs(argv);
  if (o.bad) { err(`✖ 不認得的參數：${o.bad} → 跑 node setup/install-skills.mjs --help 看可用的參數`); return 2; }
  if (o.help) { out(HELP); return 0; }
  const log = o.json ? () => {} : out;

  const names = fs.existsSync(SRC) ? fs.readdirSync(SRC, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith('auto-edit-')).map((e) => e.name).sort() : [];
  if (!names.length) { err(`✖ 找不到 .agents/skills/auto-edit-* → 確認是在這個工作區執行（${ROOT}）`); return 1; }
  const meta = {};
  const invalid = [];
  for (const n of names) { const v = validate(n); if (typeof v === 'string') invalid.push(v); else meta[n] = { ...v, files: listFiles(path.join(SRC, n)) }; }
  const agentNames = agentFiles();
  for (const f of agentNames) { const v = validateAgent(f); if (v) invalid.push(v); }
  if (invalid.length) {
    if (o.json) out(JSON.stringify({ ok: false, dryRun: o.dryRun, check: o.check, skills: names.length, errors: invalid, items: [], agents: [], conflicts: [], orphans: [] }));
    else for (const l of invalid) err(l);
    return 1;
  }

  const ts = targets(o);
  log(`${o.check ? '檢查' : '安裝'} auto-edit Skill：${names.length} 支（來源 .agents/skills/）`);
  const items = [];
  const conflicts = [];
  const orphans = [];
  const count = { installed: 0, updated: 0, unchanged: 0 };
  const pad = (s, w) => s + ' '.repeat(Math.max(1, w - [...s].length));
  const pre = o.dryRun ? '（預演）' : '';

  for (const t of ts) {
    for (const n of names) {
      const src = path.join(SRC, n);
      const dst = path.join(t.dir, n);
      const item = { skill: n, target: t.id, path: dst, show: t.show(n) };
      const line = (status) => log(`  ${pad(t.id, 8)} ${pad(t.show(n), 42)} ${status}`);
      if (isLink(dst) || (fs.existsSync(dst) && !readMark(dst))) {
        item.status = 'conflict';
        conflicts.push(dst);
        line(`✖ 衝突 → 這個資料夾不是 install-skills 裝的；改名或移走它，再跑一次 node setup/install-skills.mjs`);
      } else if (o.check) {
        if (!fs.existsSync(dst)) { item.status = 'missing'; log(`⚠ ${t.show(n)} 還沒裝`); }
        else {
          const n2 = diffInstalled(dst, meta[n].files, src);
          if (n2) { item.status = 'stale'; item.changed = n2; log(`⚠ ${t.show(n)} 和原始檔不同（${n2} 個檔）`); }
          else item.status = 'unchanged';
        }
      } else if (!fs.existsSync(dst)) {
        item.status = 'installed'; count.installed++;
        if (!o.dryRun) { copyDir(src, dst, meta[n].files); writeMark(dst, n, meta[n], src); }
        line(`${pre}新裝`);
      } else {
        const { n: changed } = diffCount(src, meta[n].files, readMark(dst));
        const actual = diffInstalled(dst, meta[n].files, src);
        const k = Math.max(changed, actual);
        if (!k) { item.status = 'unchanged'; count.unchanged++; line(`${pre}沒變`); }
        else {
          item.status = 'updated'; item.changed = k; count.updated++;
          if (!o.dryRun) { fs.rmSync(dst, { recursive: true, force: true }); copyDir(src, dst, meta[n].files); writeMark(dst, n, meta[n], src); }
          line(`${pre}更新（${k} 個檔不同）`);
        }
      }
      items.push(item);
    }
    // 原始檔不再有、但目標還有標記檔的 auto-edit-*
    if (fs.existsSync(t.dir)) {
      for (const e of fs.readdirSync(t.dir, { withFileTypes: true })) {
        if (!e.name.startsWith('auto-edit-') || names.includes(e.name)) continue;
        const p = path.join(t.dir, e.name);
        if (!isLink(p) && readMark(p)) { orphans.push(p); log(`⚠ ${t.show(e.name)} 已經沒有原始檔 → 不用的話自己刪掉這個資料夾`); }
      }
    }
  }

  // 子代理定義：一個資料夾一個標記檔，files 列的檔才是 install-skills 裝的（.claude/agents/ 裡可能有使用者自己的子代理）
  const agents = [];
  const ac = { installed: 0, updated: 0, unchanged: 0 };
  const at = agentNames.length ? agentTarget(o) : null;
  if (at) {
    const owned = { ...(readMark(at.dir)?.files || {}) };
    let dirty = false;
    for (const f of agentNames) {
      const src = path.join(AGENT_SRC, f);
      const dst = path.join(at.dir, f);
      const want = sha(src);
      const has = !isLink(dst) && fs.existsSync(dst);
      const item = { agent: f.slice(0, -3), target: at.id, path: dst, show: at.show(f) };
      const line = (status) => log(`  ${pad(at.id, 8)} ${pad(at.show(f), 42)} ${status}`);
      if (isLink(dst) || (has && !owned[f] && sha(dst) !== want)) {
        item.status = 'conflict';
        conflicts.push(dst);
        line('✖ 衝突 → 這個檔不是 install-skills 裝的；改名或移走它，再跑一次 node setup/install-skills.mjs');
      } else if (has && !owned[f]) {
        // 內容和正本一樣（以前手動放的那一份）：接手，補上標記，之後照常更新
        item.status = 'unchanged'; ac.unchanged++;
        if (!o.check) { if (!o.dryRun) { owned[f] = want; dirty = true; } line(`${pre}沒變（補上標記）`); }
      } else if (o.check) {
        if (!has) { item.status = 'missing'; log(`⚠ ${at.show(f)} 還沒裝`); }
        else if (sha(dst) !== want) { item.status = 'stale'; item.changed = 1; log(`⚠ ${at.show(f)} 和原始檔不同`); }
        else item.status = 'unchanged';
      } else if (!has) {
        item.status = 'installed'; ac.installed++;
        if (!o.dryRun) { fs.mkdirSync(at.dir, { recursive: true }); fs.copyFileSync(src, dst); owned[f] = want; dirty = true; }
        line(`${pre}新裝`);
      } else if (sha(dst) === want && owned[f] === want) {
        item.status = 'unchanged'; ac.unchanged++;
        line(`${pre}沒變`);
      } else {
        item.status = 'updated'; item.changed = 1; ac.updated++;
        if (!o.dryRun) { fs.copyFileSync(src, dst); owned[f] = want; dirty = true; }
        line(`${pre}更新`);
      }
      agents.push(item);
    }
    for (const f of Object.keys(owned)) {
      if (agentNames.includes(f) || !fs.existsSync(path.join(at.dir, f))) continue;
      orphans.push(path.join(at.dir, f));
      log(`⚠ ${at.show(f)} 已經沒有原始檔 → 不用的話自己刪掉這個檔`);
    }
    if (dirty) fs.writeFileSync(path.join(at.dir, MARK), JSON.stringify({ source: '.agents/agents', files: owned }, null, 2) + '\n');
  }

  const where = `${names.length} 支 × ${ts.length} 個位置`;
  const agentWhere = at ? `；子代理 ${agentNames.length} 個（.claude/agents/）` : '';
  const stale = [...items, ...agents].filter((i) => i.status === 'missing' || i.status === 'stale').length;
  let code = 0;
  if (o.check) {
    if (conflicts.length || stale) { code = 1; if (conflicts.length) log(`✖ 有 ${conflicts.length} 個衝突`); log('→ 跑 node setup/install-skills.mjs 更新'); }
    else log(`✓ ${where}都和 .agents/skills/ 一致${at ? `${agentWhere}也和 .agents/agents/ 一致` : ''}`);
  } else if (conflicts.length) {
    code = 1;
    log(`✖ 有 ${conflicts.length} 個衝突，其他的已經裝好`);
  } else if (o.dryRun) {
    log(`預演：${where}，會新裝 ${count.installed}、更新 ${count.updated}、沒變 ${count.unchanged}${at ? `${agentWhere}：會新裝 ${ac.installed}、更新 ${ac.updated}、沒變 ${ac.unchanged}` : ''}；沒有寫任何檔`);
  } else {
    log(`✓ 完成：${where}，新裝 ${count.installed}、更新 ${count.updated}、沒變 ${count.unchanged}${at ? `${agentWhere}：新裝 ${ac.installed}、更新 ${ac.updated}、沒變 ${ac.unchanged}` : ''}`);
  }
  if (o.json) out(JSON.stringify({ ok: code === 0, dryRun: o.dryRun, check: o.check, skills: names.length, items, agents, conflicts, orphans }));
  return code;
}

// 給 status.mjs 用：只比對、不印、不安裝（就是 --check --json 換成人看得懂的句子）。
// 回傳 { ok, stale: [一行一個人看得懂的說明] }；同一個位置的「還沒裝」「和正本不同」併成一行。dest、target 只有測試會用
export function checkInstalled({ dest, target } = {}) {
  let json = '';
  const errs = [];
  main(['--check', '--json', ...(dest ? ['--dest', dest] : []), ...(target ? ['--target', target] : [])], (s) => { json = s; }, (s) => errs.push(s));
  let r;
  try { r = JSON.parse(json); } catch { return { ok: false, stale: errs.length ? errs : ['✖ install-skills.mjs --check 沒有回報結果'] }; }
  if (r.errors?.length) return { ok: false, stale: r.errors };
  const stale = [];
  const groups = new Map();
  for (const it of [...r.items, ...(r.agents || [])]) {
    if (it.status === 'conflict') { stale.push(`${it.show} 不是 install-skills 裝的（同名）→ 改名或移走它，再跑一次 node setup/install-skills.mjs`); continue; }
    if (it.status !== 'missing' && it.status !== 'stale') continue;
    const dir = it.show.slice(0, it.show.length - path.basename(it.show).length).replace(/[\\/]$/, '');
    const key = `${dir}\n${it.status}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(`${it.skill || it.agent}${it.changed > 1 ? `（${it.changed} 個檔）` : ''}`);
  }
  for (const [key, list] of groups) {
    const [dir, status] = key.split('\n');
    stale.push(status === 'missing' ? `${dir} 還沒裝 ${list.join('、')}` : `${dir} 的 ${list.join('、')} 和 .agents/ 的正本不同`);
  }
  return { ok: Boolean(r.ok), stale };
}

function writeMark(dst, name, m, src) {
  const files = Object.fromEntries(m.files.map((f) => [f, sha(path.join(src, f))]));
  fs.writeFileSync(path.join(dst, MARK), JSON.stringify({ source: `.agents/skills/${name}`, version: m.version, files }, null, 2) + '\n');
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
// node -e '…import(這個檔)…' <這個檔的路徑>：argv[1] 是 -e 的參數、不是被執行的檔，不能當成直接執行（會真的安裝）
const evalRun = process.execArgv.some((a) => ['-e', '--eval', '-p', '--print'].includes(a) || a.startsWith('--eval=') || a.startsWith('--print='));
if (process.argv[1] && !evalRun && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}

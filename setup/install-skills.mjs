#!/usr/bin/env node
/**
 * 把 .agents/skills/auto-edit-* 的 9 支 Skill 連結到這台電腦裝了的 Agent 讀得到的專案層位置（零依賴，只用 Node 22）
 *
 *   node setup/install-skills.mjs                              偵測裝了哪些 Agent，在工作區建連結
 *   node setup/install-skills.mjs --agent claude,minimax|all   不偵測，指定 Agent
 *   node setup/install-skills.mjs --dry-run                    只印會做什麼，不寫檔
 *   node setup/install-skills.mjs --check                      只比對（不一致結束碼 1）
 *   node setup/install-skills.mjs --json                       stdout 只印一個 JSON
 *
 * 正本是 .agents/skills/（進 git）。Codex、Cursor 直接讀它，不用做事；Claude Code 讀 .claude/skills/、MiniMax Code 讀
 * .minimax/skills/：在那裡建連到正本的連結（Mac／Linux 用相對路徑的 symlink；Windows 用 junction，一般帳號就能建），
 * 之後改 .agents/skills/ 不用重跑。這個磁碟建不了連結（exFAT 隨身碟、網路磁碟）才退回複製（資料夾裡放標記檔
 * .auto-edit-install.json），改了正本要重跑。
 * 專案層優先：舊版裝在 ~/.minimax/skills/ 的全域複本（有標記檔的才算）會移除，刪不掉就印指令。
 * 子代理定義 .agents/agents/*.md → .claude/agents/（只有 Claude Code 有這個位置）：檔案連結；Windows 沒開「開發人員模式」
 * 建不了檔案連結，就複製（.claude/agents/.auto-edit-install.json 列的檔才是它複製的）。
 * 同名但不是它裝的資料夾、檔案，或指到別處的連結：一律不動、報 ✖ 衝突。
 *
 * 給程式用：checkInstalled() → { ok, none, stale: [一行一個人看得懂的說明] }（只比對，不印、不安裝；status.mjs、check.sh 用）。
 *
 * 契約：specs/contracts/cli-001.md。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, '.agents', 'skills');
const AGENT_SRC = path.join(ROOT, '.agents', 'agents');
const MARK = '.auto-edit-install.json';
const WIN = process.platform === 'win32';
const RERUN = 'node setup/install-skills.mjs';

// 支援的 Agent：home＝裝了它就會有的家目錄設定資料夾（偵測用）；dir＝它讀的專案層資料夾（null＝直接讀 .agents/skills/，不用連結）；
// legacy＝舊版 install-skills 複製過去的全域位置（專案層優先，要清掉）
const AGENTS = [
  { id: 'claude', name: 'Claude Code', home: () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), dir: '.claude' },
  { id: 'minimax', name: 'MiniMax Code', home: () => path.join(os.homedir(), '.minimax'), dir: '.minimax', legacy: ['.minimax', 'skills'] },
  { id: 'codex', name: 'Codex', home: () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), dir: null },
  { id: 'cursor', name: 'Cursor', home: () => path.join(os.homedir(), '.cursor'), dir: null },
];
const IDS = AGENTS.map((a) => a.id);

const HELP = `把 .agents/skills/auto-edit-* 的 9 支 Skill 連結到這台電腦裝了的 Agent 讀得到的位置（零依賴，只用 Node 22）

  node setup/install-skills.mjs                              偵測裝了哪些 Agent，在工作區建連結
  node setup/install-skills.mjs --agent claude,minimax|all   不偵測，指定 Agent（${IDS.join('、')}）
  node setup/install-skills.mjs --dry-run                    只印會做什麼，不寫檔
  node setup/install-skills.mjs --check                      只比對裝好的和正本是否一致（不一致結束碼 1）
  node setup/install-skills.mjs --json                       stdout 只印一個 JSON

Claude Code → .claude/skills/、MiniMax Code → .minimax/skills/：連到 .agents/skills/ 的正本，改了正本不用重跑。
Codex、Cursor 直接讀 .agents/skills/，不用裝。子代理定義 .agents/agents/*.md 一起連到 .claude/agents/（Claude Code）。
Mac 用 symlink、Windows 用 junction；這個磁碟建不了連結才改成複製（改了正本要重跑）。
舊版裝在 ~/.minimax/skills/ 的全域複本會移除（專案層優先）。同名但不是它裝的，一律不動並報 ✖。`;

// ---------- 參數 ----------
function parseArgs(argv) {
  const o = { agent: null, dryRun: false, check: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [k, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null];
    const val = () => (inline != null ? inline : argv[++i]);
    if (k === '--help' || k === '-h') o.help = true;
    else if (k === '--dry-run') o.dryRun = true;
    else if (k === '--check') o.check = true;
    else if (k === '--json') o.json = true;
    else if (k === '--agent') {
      o.agent = val();
      const list = String(o.agent ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!list.length || (o.agent !== 'all' && list.some((s) => !IDS.includes(s)))) return { bad: `--agent ${o.agent ?? ''}（可以用 ${IDS.join('、')} 或 all）` };
      o.agent = o.agent === 'all' ? IDS : list;
    } else return { bad: a };
  }
  return o;
}

// 指定了就照指定；沒指定就看家目錄有哪些 Agent 的設定資料夾；一個都沒有就全部（之後才裝的 Agent，status.mjs 會提醒重跑）
function pickAgents(o) {
  const detected = AGENTS.filter((a) => fs.existsSync(a.home()));
  const chosen = o.agent ? AGENTS.filter((a) => o.agent.includes(a.id)) : detected.length ? detected : AGENTS;
  return { detected, chosen, link: chosen.filter((a) => a.dir), native: chosen.filter((a) => !a.dir), how: o.agent ? 'flag' : detected.length ? 'detected' : 'none' };
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

// ---------- 連結 ----------
const lstat = (p) => { try { return fs.lstatSync(p); } catch { return null; } };
const realOr = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const readLink = (p) => { try { return fs.readlinkSync(p).replace(/^\\\\\?\\/, ''); } catch { return ''; } };
const readMark = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, MARK), 'utf8')); } catch { return null; } };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 連結指到哪：ok＝這個工作區的正本；ours＝別份工作區（或搬家前）的 .agents/<sub>/<名稱>，是它建的、要重連；foreign＝別人的
function linkState(dst, src, sub, name) {
  const r = realOr(dst);
  if (r && r === realOr(src)) return 'ok';
  return new RegExp(`(^|[\\\\/])\\.agents[\\\\/]${sub}[\\\\/]${esc(name)}[\\\\/]?$`).test(readLink(dst)) ? 'ours' : 'foreign';
}

// Mac／Linux：相對路徑（整個工作區搬家也不會斷）；Windows 的資料夾用 junction（一般帳號就能建，只能用絕對路徑）
function makeLink(src, dst, kind) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (WIN && kind === 'dir') fs.symlinkSync(src, dst, 'junction');
  else fs.symlinkSync(path.relative(path.dirname(dst), src), dst, kind);
}
// 只拿掉連結本身，不碰它指到的資料夾（Windows 的 junction 有時要用 rmdir）
function removeLink(p) {
  try { fs.unlinkSync(p); } catch (e) { if (!WIN) throw e; fs.rmdirSync(p); }
}
// 這個資料夾所在的磁碟能不能建這種連結：先建一個測試連結再拿掉（同一個資料夾只試一次）
// 環境變數 AUTO_EDIT_INSTALL_COPY=1 是測試用：當作建不了連結，走複製那條路（文件不教使用者）
const probed = new Map();
function canLink(dir, kind, sample) {
  if (process.env.AUTO_EDIT_INSTALL_COPY === '1') return false;
  const key = `${dir}\n${kind}`;
  if (!probed.has(key)) {
    const p = path.join(dir, `.auto-edit-link-test-${process.pid}`);
    let ok = false;
    try { makeLink(sample, p, kind); ok = true; } catch { ok = false; }
    try { if (lstat(p)) removeLink(p); } catch { /* 拿不掉的測試連結留著也無害 */ }
    probed.set(key, ok);
  }
  return probed.get(key);
}

// ---------- 複製（建不了連結時） ----------
function diffCount(srcDir, files, mark) {
  const want = Object.fromEntries(files.map((f) => [f, sha(path.join(srcDir, f))]));
  const have = mark?.files || {};
  const keys = new Set([...Object.keys(want), ...Object.keys(have)]);
  let n = 0;
  for (const k of keys) if (want[k] !== have[k]) n++;
  return n;
}
function diffInstalled(dstDir, files, srcDir) {
  // 比對實際裝好的檔案內容（不只是標記檔）
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
function writeMark(dst, name, m, src) {
  const files = Object.fromEntries(m.files.map((f) => [f, sha(path.join(src, f))]));
  fs.writeFileSync(path.join(dst, MARK), JSON.stringify({ source: `.agents/skills/${name}`, version: m.version, files }, null, 2) + '\n');
}

const homeShow = (...parts) => (WIN ? `%USERPROFILE%\\${parts.join('\\')}` : `~/${parts.join('/')}`);
const rmCommand = (p) => (WIN ? `Remove-Item -Recurse -Force "${p}"` : `rm -rf "${p}"`);

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
  const pick = pickAgents(o);
  const head = { dryRun: o.dryRun, check: o.check, skills: names.length, detected: pick.detected.map((a) => a.id), linked: pick.link.map((a) => a.id), native: pick.native.map((a) => a.id) };
  if (invalid.length) {
    if (o.json) out(JSON.stringify({ ok: false, ...head, errors: invalid, items: [], agents: [], legacy: [], conflicts: [], orphans: [] }));
    else for (const l of invalid) err(l);
    return 1;
  }

  const nameList = (list) => list.map((a) => a.name).join('、');
  log(`${o.check ? '檢查' : '安裝'} auto-edit Skill：${names.length} 支（正本 .agents/skills/）`);
  const who = [pick.link.length ? `${nameList(pick.link)}（連結）` : '', pick.native.length ? `${nameList(pick.native)}（直接讀 .agents/skills/，不用裝）` : ''].filter(Boolean).join('；');
  log(pick.how === 'flag' ? `Agent（--agent 指定）：${who}` : pick.how === 'detected' ? `Agent（偵測到的）：${who}` : `Agent：一個都沒偵測到，全部都裝：${who}`);

  const items = [];
  const agents = [];
  const legacy = [];
  const conflicts = [];
  const orphans = [];
  const copies = [];
  const count = { installed: 0, relinked: 0, updated: 0, unchanged: 0 };
  const ac = { installed: 0, relinked: 0, updated: 0, unchanged: 0 };
  const width = (s) => [...s].reduce((n, c) => n + (c.codePointAt(0) >= 0x2e80 ? 2 : 1), 0);   // 中文佔兩格
  const pad = (s, w) => s + ' '.repeat(Math.max(1, w - width(s)));
  const pre = o.dryRun ? '（預演）' : '';
  let failed = 0;

  // ---- Skill：<工作區>/<Agent 資料夾>/skills/auto-edit-* → .agents/skills/auto-edit-* ----
  for (const a of pick.link) {
    const base = path.join(ROOT, a.dir, 'skills');
    const shown = (n) => `${a.dir}/skills/${n}`;
    for (const n of names) {
      const src = path.join(SRC, n);
      const dst = path.join(base, n);
      const item = { skill: n, target: a.id, path: dst, show: shown(n) };
      const line = (status) => log(`  ${pad(a.id, 8)} ${pad(shown(n), 42)} ${status}`);
      const conflict = () => { item.status = 'conflict'; conflicts.push(dst); line(`✖ 衝突 → 這個資料夾不是 install-skills 裝的；改名或移走它，再跑一次 ${RERUN}`); };
      // 新裝或重裝：建得了連結就連結，建不了才複製
      const put = () => {
        if (o.dryRun || canLink(base, 'dir', src)) { if (!o.dryRun) makeLink(src, dst, 'dir'); item.mode = 'link'; return '連結'; }
        copyDir(src, dst, meta[n].files); writeMark(dst, n, meta[n], src); item.mode = 'copy'; copies.push(dst);
        return '複製：這個磁碟建不了連結';
      };
      const st = lstat(dst);
      if (st?.isSymbolicLink()) {
        const ls = linkState(dst, src, 'skills', n);
        if (ls === 'foreign') conflict();
        else if (ls === 'ok') { item.status = 'unchanged'; item.mode = 'link'; count.unchanged++; if (!o.check) line(`${pre}沒變（連結）`); }
        else if (o.check) { item.status = 'stale'; log(`⚠ ${shown(n)} 的連結指到別的地方（${readLink(dst)}）`); }
        else {
          const was = readLink(dst);
          if (!o.dryRun) removeLink(dst);
          const how = put();
          item.status = 'relinked'; count.relinked++;
          line(`${pre}重新${how === '連結' ? '連結' : `裝（${how}）`}（原本指到 ${was}）`);
        }
      } else if (st && !readMark(dst)) conflict();
      else if (o.check) {
        if (!st) { item.status = 'missing'; log(`⚠ ${shown(n)} 還沒裝`); }
        else {
          item.mode = 'copy';
          const k = diffInstalled(dst, meta[n].files, src);
          if (k) { item.status = 'stale'; item.changed = k; log(`⚠ ${shown(n)} 和正本不同（${k} 個檔）`); }
          else item.status = 'unchanged';
        }
      } else if (!st) {
        const how = put();
        item.status = 'installed'; count.installed++;
        line(`${pre}新裝（${how}）`);
      } else if (o.dryRun || canLink(base, 'dir', src)) {
        // 以前複製的（有標記檔）：換成連結
        if (!o.dryRun) { fs.rmSync(dst, { recursive: true, force: true }); makeLink(src, dst, 'dir'); }
        item.status = 'relinked'; item.mode = 'link'; count.relinked++;
        line(`${pre}改成連結（原本是複製）`);
      } else {
        // 建不了連結的磁碟：照舊比對複本
        item.mode = 'copy'; copies.push(dst);
        const k = Math.max(diffCount(src, meta[n].files, readMark(dst)), diffInstalled(dst, meta[n].files, src));
        if (!k) { item.status = 'unchanged'; count.unchanged++; line('沒變（複製）'); }
        else {
          item.status = 'updated'; item.changed = k; count.updated++;
          fs.rmSync(dst, { recursive: true, force: true }); copyDir(src, dst, meta[n].files); writeMark(dst, n, meta[n], src);
          line(`更新（複製，${k} 個檔不同）`);
        }
      }
      items.push(item);
    }
    // 正本已經沒有的 auto-edit-*：它建的連結直接拿掉（不會刪到檔案）；它複製的資料夾只提醒
    if (fs.existsSync(base)) {
      for (const e of fs.readdirSync(base)) {
        if (!e.startsWith('auto-edit-') || names.includes(e)) continue;
        const p = path.join(base, e);
        if (lstat(p)?.isSymbolicLink()) {
          if (linkState(p, path.join(SRC, e), 'skills', e) === 'foreign') continue;
          orphans.push(p);
          if (o.check) log(`⚠ ${shown(e)} 的正本已經沒有了 → 跑 ${RERUN} 拿掉這個連結`);
          else { if (!o.dryRun) removeLink(p); log(`  ${pad(a.id, 8)} ${pad(shown(e), 42)} ${pre}拿掉連結（正本已經沒有了）`); }
        } else if (readMark(p)) { orphans.push(p); log(`⚠ ${shown(e)} 已經沒有正本 → 不用的話自己刪掉這個資料夾`); }
      }
    }
  }

  // ---- 子代理定義：.claude/agents/<名稱>.md → .agents/agents/<名稱>.md（只有 Claude Code 有這個位置） ----
  const claude = pick.link.find((a) => a.id === 'claude');
  const adir = path.join(ROOT, '.claude', 'agents');
  if (claude && agentNames.length) {
    const owned = { ...(readMark(adir)?.files || {}) };   // 複製的才記在標記檔
    let dirty = false;
    for (const f of agentNames) {
      const src = path.join(AGENT_SRC, f);
      const dst = path.join(adir, f);
      const want = sha(src);
      const show = `.claude/agents/${f}`;
      const item = { agent: f.slice(0, -3), target: 'claude', path: dst, show };
      const line = (status) => log(`  ${pad('claude', 8)} ${pad(show, 42)} ${status}`);
      const put = () => {
        if (o.dryRun || canLink(adir, 'file', src)) { if (!o.dryRun) makeLink(src, dst, 'file'); item.mode = 'link'; if (owned[f]) { delete owned[f]; dirty = true; } return '連結'; }
        fs.mkdirSync(adir, { recursive: true }); fs.copyFileSync(src, dst); owned[f] = want; dirty = true; item.mode = 'copy'; copies.push(dst);
        return '複製：這台電腦建不了檔案連結';
      };
      const st = lstat(dst);
      if (st?.isSymbolicLink()) {
        const ls = linkState(dst, src, 'agents', f);
        if (ls === 'foreign') { item.status = 'conflict'; conflicts.push(dst); line(`✖ 衝突 → 這個檔不是 install-skills 裝的；改名或移走它，再跑一次 ${RERUN}`); }
        else if (ls === 'ok') { item.status = 'unchanged'; item.mode = 'link'; ac.unchanged++; if (!o.check) line(`${pre}沒變（連結）`); }
        else if (o.check) { item.status = 'stale'; log(`⚠ ${show} 的連結指到別的地方（${readLink(dst)}）`); }
        else { const was = readLink(dst); if (!o.dryRun) removeLink(dst); const how = put(); item.status = 'relinked'; ac.relinked++; line(`${pre}重新${how === '連結' ? '連結' : `裝（${how}）`}（原本指到 ${was}）`); }
      } else if (st && !owned[f] && sha(dst) !== want) {
        item.status = 'conflict'; conflicts.push(dst);
        line(`✖ 衝突 → 這個檔不是 install-skills 裝的；改名或移走它，再跑一次 ${RERUN}`);
      } else if (o.check) {
        if (!st) { item.status = 'missing'; log(`⚠ ${show} 還沒裝`); }
        else if (sha(dst) !== want) { item.status = 'stale'; item.changed = 1; item.mode = 'copy'; log(`⚠ ${show} 和正本不同`); }
        else { item.status = 'unchanged'; item.mode = 'copy'; }
      } else if (!st) {
        const how = put();
        item.status = 'installed'; ac.installed++;
        line(`${pre}新裝（${how}）`);
      } else if (o.dryRun || canLink(adir, 'file', src)) {
        // 以前複製的、或內容和正本一樣的同名檔：換成連結
        if (!o.dryRun) { fs.unlinkSync(dst); makeLink(src, dst, 'file'); if (owned[f]) { delete owned[f]; dirty = true; } }
        item.status = 'relinked'; item.mode = 'link'; ac.relinked++;
        line(`${pre}改成連結（原本是複製）`);
      } else {
        item.mode = 'copy'; copies.push(dst);
        if (sha(dst) === want) {
          item.status = 'unchanged'; ac.unchanged++;
          if (!owned[f]) { owned[f] = want; dirty = true; line('沒變（複製，補上標記）'); } else line('沒變（複製）');
        } else {
          item.status = 'updated'; item.changed = 1; ac.updated++;
          fs.copyFileSync(src, dst); owned[f] = want; dirty = true;
          line('更新（複製）');
        }
      }
      agents.push(item);
    }
    // 正本已經沒有的：它建的連結直接拿掉；它複製的只提醒
    if (fs.existsSync(adir)) {
      for (const e of fs.readdirSync(adir)) {
        if (!e.endsWith('.md') || agentNames.includes(e)) continue;
        const p = path.join(adir, e);
        if (lstat(p)?.isSymbolicLink() && linkState(p, path.join(AGENT_SRC, e), 'agents', e) !== 'foreign') {
          orphans.push(p);
          if (o.check) log(`⚠ .claude/agents/${e} 的正本已經沒有了 → 跑 ${RERUN} 拿掉這個連結`);
          else { if (!o.dryRun) removeLink(p); log(`  ${pad('claude', 8)} ${pad(`.claude/agents/${e}`, 42)} ${pre}拿掉連結（正本已經沒有了）`); }
        } else if (owned[e] && fs.existsSync(p)) { orphans.push(p); log(`⚠ .claude/agents/${e} 已經沒有正本 → 不用的話自己刪掉這個檔`); }
      }
    }
    if (dirty && !o.dryRun && !o.check) {
      const markFile = path.join(adir, MARK);
      if (Object.keys(owned).length) fs.writeFileSync(markFile, JSON.stringify({ source: '.agents/agents', files: owned }, null, 2) + '\n');
      else fs.rmSync(markFile, { force: true });
    }
  }

  // ---- 專案層優先：舊版 install-skills 複製到全域位置的 auto-edit-*（有標記檔的才算）移除 ----
  for (const a of pick.chosen.filter((x) => x.legacy)) {
    const dir = path.join(os.homedir(), ...a.legacy);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir).sort()) {
      if (!e.startsWith('auto-edit-')) continue;
      const p = path.join(dir, e);
      const st = lstat(p);
      if (!st || st.isSymbolicLink() || !st.isDirectory() || !String(readMark(p)?.source || '').startsWith('.agents/skills/')) continue;
      const it = { skill: e, target: a.id, path: p, show: homeShow(...a.legacy, e) };
      const line = (status) => log(`  ${pad('全域', 8)} ${pad(it.show, 42)} ${status}`);
      if (o.check) { it.status = 'found'; log(`⚠ ${it.show} 是舊版裝的全域複本，會和專案層的重複 → 跑 ${RERUN} 移除`); }
      else if (o.dryRun) { it.status = 'found'; line(`${pre}移除（舊版的全域複本；專案層優先）`); }
      else {
        try { fs.rmSync(p, { recursive: true, force: true }); it.status = 'removed'; line('移除（舊版的全域複本；專案層優先）'); }
        catch (e2) { it.status = 'failed'; it.fix = rmCommand(p); failed++; line(`✖ 刪不掉（${e2.code || e2.message}）→ 自己執行：${it.fix}`); }
      }
      legacy.push(it);
    }
  }

  // ---- 總結 ----
  const where = `${names.length} 支 × ${pick.link.length} 個 Agent（${nameList(pick.link)}）`;
  const agentWhere = claude && agentNames.length ? `；子代理 ${agentNames.length} 個（.claude/agents/）` : '';
  const nums = (c) => `新裝 ${c.installed}、改成連結 ${c.relinked}、更新 ${c.updated}、沒變 ${c.unchanged}`;
  const removed = legacy.filter((l) => l.status === 'removed').length;
  const found = legacy.filter((l) => l.status === 'found').length;
  const stale = [...items, ...agents].filter((i) => i.status === 'missing' || i.status === 'stale').length + found + (o.check ? orphans.filter((p) => lstat(p)?.isSymbolicLink()).length : 0);
  let code = 0;
  if (copies.length && !o.check) log(`⚠ 有 ${copies.length} 個是複製的（這個磁碟或帳號建不了連結）→ 改了 .agents/ 的正本之後要重跑 ${RERUN}`);
  if (!pick.link.length) {
    log(`✓ ${nameList(pick.native)} 直接讀 .agents/skills/，不用裝`);
  } else if (o.check) {
    if (conflicts.length || stale) { code = 1; if (conflicts.length) log(`✖ 有 ${conflicts.length} 個衝突`); log(`→ 跑 ${RERUN} 更新`); }
    else log(`✓ ${where}都和 .agents/skills/ 一致${agentWhere ? `${agentWhere}也和 .agents/agents/ 一致` : ''}`);
  } else if (conflicts.length || failed) {
    code = 1;
    log([conflicts.length ? `有 ${conflicts.length} 個衝突` : '', failed ? `${failed} 個舊的全域複本刪不掉` : ''].filter(Boolean).join('、').replace(/^/, '✖ ') + '，其他的已經裝好');
  } else if (o.dryRun) {
    log(`預演：${where}，會${nums(count)}${agentWhere ? `${agentWhere}：會${nums(ac)}` : ''}${found ? `；會移除舊的全域複本 ${found} 個` : ''}；沒有寫任何檔`);
  } else {
    log(`✓ 完成：${where}，${nums(count)}${agentWhere ? `${agentWhere}：${nums(ac)}` : ''}${removed ? `；移除舊的全域複本 ${removed} 個` : ''}`);
  }
  if (o.json) out(JSON.stringify({ ok: code === 0, ...head, items, agents, legacy, conflicts, orphans, copies }));
  return code;
}

// 給 status.mjs、check.sh 用：只比對、不印、不安裝（就是 --check --json 換成人看得懂的句子）。
// 回傳 { ok, none, stale }：none＝一支都還沒裝；同一個位置的「還沒裝」「和正本不同」併成一行。agent 只有測試會用
export function checkInstalled({ agent } = {}) {
  let json = '';
  const errs = [];
  main(['--check', '--json', ...(agent ? ['--agent', agent] : [])], (s) => { json = s; }, (s) => errs.push(s));
  let r;
  try { r = JSON.parse(json); } catch { return { ok: false, none: false, stale: errs.length ? errs : ['✖ install-skills.mjs --check 沒有回報結果'] }; }
  if (r.errors?.length) return { ok: false, none: false, stale: r.errors };
  const stale = [];
  const groups = new Map();
  const all = [...r.items, ...(r.agents || [])];
  for (const it of all) {
    if (it.status === 'conflict') { stale.push(`${it.show} 不是 install-skills 裝的（同名）→ 改名或移走它，再跑一次 ${RERUN}`); continue; }
    if (it.status !== 'missing' && it.status !== 'stale') continue;
    const dir = it.show.slice(0, it.show.length - path.basename(it.show).length).replace(/[\\/]$/, '');
    const key = `${dir}\n${it.status}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(`${it.skill || it.agent}${it.changed > 1 ? `（${it.changed} 個檔）` : ''}`);
  }
  for (const it of r.legacy || []) {
    const dir = it.show.slice(0, it.show.length - it.skill.length).replace(/[\\/]$/, '');
    const key = `${dir}\nlegacy`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it.skill);
  }
  for (const [key, list] of groups) {
    const [dir, status] = key.split('\n');
    stale.push(status === 'missing' ? `${dir} 還沒裝 ${list.join('、')}`
      : status === 'legacy' ? `${dir} 還有舊版的全域複本 ${list.join('、')}（專案層優先）→ 跑 ${RERUN} 移除`
        : `${dir} 的 ${list.join('、')} 和 .agents/ 的正本不同`);
  }
  if (!r.ok && !stale.length) stale.push(`裝好的 Skill 和 .agents/ 的正本對不上 → 跑 ${RERUN}`);
  return { ok: Boolean(r.ok), none: all.length > 0 && all.every((i) => i.status === 'missing'), stale };
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
// node -e '…import(這個檔)…' <這個檔的路徑>：argv[1] 是 -e 的參數、不是被執行的檔，不能當成直接執行（會真的安裝）
const evalRun = process.execArgv.some((a) => ['-e', '--eval', '-p', '--print'].includes(a) || a.startsWith('--eval=') || a.startsWith('--print='));
if (process.argv[1] && !evalRun && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}

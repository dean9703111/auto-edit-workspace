#!/usr/bin/env node
/**
 * 能力檢查：這台電腦能用哪些生圖與影片工具（只檢查，不安裝、不登入、不下載）
 *
 *   node shared/template/tools/caps.mjs [--agent <名稱>] [--json]
 *
 * 印一張表（能力｜結果｜依據），結果只有：可用、未登入、沒有安裝或壞掉、版本不符、工具判斷不了。
 *   模型內建生圖     工具判斷不了（看這次 session 的工具清單）
 *   codex            codex --version、codex login status
 *   mmx              mmx --version、mmx auth status（不印 API key 與餘額）
 *   Antigravity      agy --version（有沒有登入查不到）
 *   HTML 截圖        npx --no -- hyperframes browser path（HyperFrames 的 Chrome）
 *   ffmpeg／ffprobe  -version
 *   HyperFrames      node_modules/hyperframes 的版本和 package.json 釘的版本比
 * 最後印「這次生圖走：<路線>」：照 shared/setting.json 的 image.<Agent>（沒寫用預設；lib/image-route.mjs），那條路這台不能用就退到 HTML。
 *   現在是哪個 Agent：Claude Code、Codex 工具自己認得出來；認不出來就每個 Agent 各印一行，或加 --agent 只印自己那一行
 *   --agent claude｜codex｜minimax｜antigravity｜other
 *   要換路線：node shared/template/tools/brand.mjs image <路線>
 * 每個指令最多等 15 秒。結束碼：Chrome、ffmpeg／ffprobe、HyperFrames 都可用＝0，否則 1（codex、mmx、Antigravity 不影響）。
 * --json：只印一個 JSON（node、root、caps[]、imageRoutes＝這台能用的路線、agent、image[]＝每個 Agent 走哪條）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isMain, splitFlag, valueOf } from './lib/cli.mjs';
import { AGENTS, ROUTE_DOC, detectAgent, checkAgent, imageRoute, resolveImageRoute, routeLine } from './lib/image-route.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..');
const TIMEOUT = 15000;
const ZH = { ok: '可用', 'not-logged-in': '未登入', missing: '沒有安裝或壞掉', 'version-mismatch': '版本不符', unknown: '工具判斷不了' };

export function defaultRun(cmd, args, { platform = process.platform } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: TIMEOUT, shell: platform === 'win32', windowsHide: true });
  return { code: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || ''), error: r.error ? r.error.message : null };
}

// 依據欄不能出現金鑰與餘額：JSON 只留 method／source／status 這類欄位；文字裡含 key、token、balance… 的行整行拿掉
const SECRET = /(key|token|secret|password|balance|amount|quota|credit)/i;
export function redact(text) {
  const t = String(text || '').trim();
  try {
    const j = JSON.parse(t);
    if (j && typeof j === 'object') {
      const keep = Object.entries(j).filter(([k, v]) => !SECRET.test(k) && (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') && /^(method|source|status|logged_?in|user(name)?|account|provider|region|type|mode)$/i.test(k));
      return keep.length ? keep.map(([k, v]) => `${k} ${v}`).join('，') : '已登入';
    }
  } catch { /* 不是 JSON */ }
  const line = t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !SECRET.test(l))[0] || '';
  return line.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-…').slice(0, 120);
}
const first = (r) => redact(r.error || r.stderr || r.stdout) || `結束碼 ${r.code}`;
const okRun = (r) => !r.error && r.code === 0;

export function hyperframesVersion(root = ROOT) {
  let pinned = null, installed = null, hasPkg = false;
  try { const p = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); hasPkg = true; pinned = p.devDependencies?.hyperframes ?? p.dependencies?.hyperframes ?? null; } catch { /* 沒有 package.json */ }
  try { installed = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'hyperframes', 'package.json'), 'utf8')).version ?? null; } catch { /* 沒裝 */ }
  return { pinned, installed, hasPkg, ok: !!pinned && installed === pinned };
}

// build 的版本行（specs/contracts/cli-002.md §1.1）
export function versionLine(v) {
  if (!v.hasPkg) return '⚠ 工作區根目錄沒有 package.json，HyperFrames 版本沒有釘住 → 照 setup/ 的手冊補上再跑 npm install';
  if (!v.installed) return `⚠ 工作區根目錄還沒裝 HyperFrames（package.json 釘 ${v.pinned}）→ 在工作區根目錄跑 npm install；在那之前 npx hyperframes 會用快取或下載最新版`;
  if (!v.ok) return `⚠ HyperFrames ${v.installed} 和 package.json 釘的 ${v.pinned} 不同 → 在工作區根目錄跑 npm install`;
  return `HyperFrames ${v.installed}（package.json 釘 ${v.pinned}）`;
}

export function probeCaps({ root = ROOT, run = defaultRun, platform = process.platform, env = process.env, agent = null } = {}) {
  const R = (cmd, args) => run(cmd, args, { platform });
  const caps = [{ id: 'model', name: '模型內建生圖', result: 'unknown', evidence: '看這次 session 的工具清單有沒有生圖工具' }];
  // codex
  {
    const v = R('codex', ['--version']);
    if (!okRun(v)) caps.push({ id: 'codex', name: 'codex', result: 'missing', evidence: `codex --version：${first(v)}` });
    else {
      const s = R('codex', ['login', 'status']);
      const out = `${s.stdout}\n${s.stderr}`;
      const logged = okRun(s) && !/not logged in/i.test(out);
      caps.push({ id: 'codex', name: 'codex', result: logged ? 'ok' : 'not-logged-in', evidence: `codex --version：${redact(v.stdout)}；codex login status：${first(s)}` });
    }
  }
  // mmx
  {
    const v = R('mmx', ['--version']);
    if (!okRun(v)) caps.push({ id: 'mmx', name: 'mmx', result: 'missing', evidence: `mmx --version：${first(v)}` });
    else {
      const s = R('mmx', ['auth', 'status']);
      caps.push({ id: 'mmx', name: 'mmx', result: okRun(s) ? 'ok' : 'not-logged-in', evidence: `mmx --version：${redact(v.stdout)}；mmx auth status：${okRun(s) ? (redact(s.stdout) ? `已登入（${redact(s.stdout)}）` : '已登入') : first(s)}` });
    }
  }
  // Antigravity（agy）：沒有查登入狀態的指令，只看裝了沒
  {
    const v = R('agy', ['--version']);
    caps.push({ id: 'antigravity', name: 'Antigravity（agy）', result: okRun(v) ? 'ok' : 'missing', evidence: `agy --version：${okRun(v) ? `${redact(v.stdout)}（有沒有登入查不到）` : first(v)}` });
  }
  // Chrome（HyperFrames 的 chrome-headless-shell）
  {
    const r = R('npx', ['--no', '--', 'hyperframes', 'browser', 'path']);
    const p = String(r.stdout).trim().split(/\r?\n/).pop() || '';
    const ok = okRun(r) && p && fs.existsSync(p);
    caps.push({ id: 'chrome', name: 'HTML 截圖（Chrome）', result: ok ? 'ok' : 'missing', evidence: ok ? `npx --no -- hyperframes browser path：${p}` : `npx --no -- hyperframes browser path：${first(r)} → npx hyperframes browser ensure`, ...(ok ? { path: p } : {}) });
  }
  // ffmpeg／ffprobe
  {
    const a = R('ffmpeg', ['-version']), b = R('ffprobe', ['-version']);
    const ver = (r) => (String(r.stdout).match(/version\s+(\S+)/) || [])[1] || '?';
    const ok = okRun(a) && okRun(b);
    caps.push({ id: 'ffmpeg', name: 'ffmpeg／ffprobe', result: ok ? 'ok' : 'missing', evidence: ok ? `ffmpeg ${ver(a)}、ffprobe ${ver(b)}` : `${okRun(a) ? `ffprobe -version：${first(b)}` : `ffmpeg -version：${first(a)}`} → 照 setup/ 的手冊安裝` });
  }
  // HyperFrames
  {
    const v = hyperframesVersion(root);
    const result = !v.installed ? 'missing' : v.ok ? 'ok' : 'version-mismatch';
    const evidence = !v.installed ? `沒有安裝（package.json 釘 ${v.pinned ?? '—'}）→ 在工作區根目錄跑 npm install` : v.ok ? `${v.installed}（package.json 釘 ${v.pinned}）` : `${v.installed}（package.json 釘 ${v.pinned ?? '—'}）→ 在工作區根目錄跑 npm install`;
    caps.push({ id: 'hyperframes', name: 'HyperFrames', result, evidence, pinned: v.pinned, installed: v.installed });
  }
  const ok = (id) => caps.find((c) => c.id === id)?.result === 'ok';
  const imageRoutes = ['codex', 'mmx', 'antigravity'].filter(ok).concat(ok('chrome') ? ['html'] : []);
  const need = ['chrome', 'ffmpeg'].every(ok) && caps.find((c) => c.id === 'hyperframes').result !== 'missing';
  // 這次生圖走哪條路：認得出 Agent（或 --agent 指定）就一行，認不出來每個 Agent 各一行
  const who = agent || detectAgent(env);
  const state = Object.fromEntries(['codex', 'mmx', 'antigravity', 'chrome'].map((id) => [id === 'chrome' ? 'html' : id, caps.find((c) => c.id === id).result]));
  const image = (who ? [who] : Object.keys(AGENTS)).map((a) => resolveImageRoute(imageRoute(path.join(root, 'shared'), a), state));
  return { node: process.versions.node, root, caps, imageRoutes, agent: who, image, exitCode: need ? 0 : 1 };
}

export function formatCaps(r) {
  const lines = [`Node ${r.node}（工作區 ${r.root}）`, '| 能力 | 結果 | 依據 |', '|---|---|---|'];
  for (const c of r.caps) lines.push(`| ${c.name} | ${ZH[c.result]} | ${c.evidence.replace(/\|/g, '／')} |`);
  for (const x of r.image) if (x.problem) lines.push(`⚠ ${x.problem}`);
  if (r.agent) lines.push(`這次生圖走：${routeLine(r.image[0])}`);
  else {
    lines.push(`認不出現在是哪個 Agent（工具只認得出 Claude Code、Codex），你是哪一個就走那一行（節＝${ROUTE_DOC} 的第幾節）：`);
    for (const x of r.image) lines.push(`  ${AGENTS[x.agent]}：${routeLine(x, { brief: true })}`);
    lines.push(`只印自己那一行：node shared/template/tools/caps.mjs --agent <${Object.keys(AGENTS).join('｜')}>`);
  }
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2), o = {};
  try {
    for (let i = 0; i < argv.length; i++) {
      const [k, inline] = String(argv[i]).startsWith('--') ? splitFlag(argv[i]) : [null];
      if (k === 'agent') { [o.agent, i] = valueOf(argv, i, k, inline); checkAgent(o.agent); }
      else if (k === 'json' || k === 'help') o[k] = true;
      else throw new Error(`沒有 ${argv[i]} 這個參數`);
    }
  } catch (e) { console.error(`✖ ${e.message}（用 --help 看用法）`); process.exitCode = 1; o.bad = true; }
  if (o.bad) { /* 上面印過了 */ }
  else if (o.help) console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, ''));
  else {
    const r = probeCaps({ agent: o.agent || null });
    if (o.json) { const { exitCode, ...j } = r; console.log(JSON.stringify(j, null, 2)); } else console.log(formatCaps(r));
    process.exitCode = r.exitCode;
  }
}

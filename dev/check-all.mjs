#!/usr/bin/env node
// 檢查迴圈的一鍵檢查（作者維護用，剪片時不用）：和 AI 剪片走同一條路，說明在下面的 HELP（--help 印出來）。
// 零依賴：Node 22、ffmpeg／ffprobe、whisper（media.mjs prep 用的那一套）、HyperFrames 的 chrome-headless-shell。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HELP = `一鍵檢查：照 status.mjs --json 印的下一條指令，從素材一路跑到停點 ④ 完成影片預覽（和 AI 剪片走同一條路）

  node dev/check-all.mjs                單元測試（npm run test:fast）→ 準備測試專案（projects/example 的素材與講稿複本，放暫存資料夾）→
                                        迴圈：status.mjs --json → 照它的 cmds 跑（結束碼 75 就再跑同一條）→ 再問 status，直到停點 ④。
                                        停點照固定回答自動回覆：① 可以、② 用建議的、③ 可以；到 ④ 停。
                                        要 AI 寫的檔（語意地圖、大綱、分鏡草稿、摘要）放 dev/loop/fixtures/example/ 的固定範例檔，
                                        並跑寫的人會跑的驗證（--map、--outline、--check-draft、--summary）；不呼叫任何 AI。
                                        接著把同一支示範口播裁成 9:16 直拍，從頭再跑一輪直式（固定檔在 dev/loop/fixtures/example-portrait/）。
  node dev/check-all.mjs --full         單元測試改跑整套（npm test）
  node dev/check-all.mjs --skip-tests   不跑單元測試（只看管線）
  node dev/check-all.mjs --no-portrait  不跑直式那一輪
  node dev/check-all.mjs --render       到 ④ 之後再加：build --test 3 秒片段 → render draft → ffprobe 有影音軌（多 1–2 分鐘）
  node dev/check-all.mjs --deliver      到 ④ 之後再回「可以了，輸出完成影片」，跑 status 印的那一條（deliver.mjs，整支 render，多幾分鐘）
  node dev/check-all.mjs --real projects/<專案>
                                        素材、講稿改用這個專案的複本；固定檔改用它自己的 work/drafts/*.map.md、*.outline.md、*.json 與 work/摘要.md
                                        （那個專案只讀、不寫任何檔；不跑直式）
  node dev/check-all.mjs --keep         保留測試專案（印出路徑；剪輯台照樣關掉，要看再跑 editor.mjs --project <路徑>）
  node dev/check-all.mjs --out <檔>     這一次的詳細報告寫到哪（預設 dev/loop/last-check.md）

每一步印 ✓／✖／略過與秒數；有 ✖ 就停下（後面的輪不跑）、印最後幾行輸出，結束碼 1。單元測試 ✖ 照樣跑測試專案（兩邊互不相依，一次看完）。
每次跑完在 dev/loop/check-log.md 加一行：日期、分支、commit、每一輪各停點的結果與秒數（用了固定檔的標「固定檔」）、總時間。
暫存：環境變數 AUTO_EDIT_TMP → /Volumes/auto-edit-tmp（作者外接硬碟上的映像，沒掛就先掛）→ 系統預設；跑完清掉測試專案（--keep 才留）。
沒有 Chrome（npx hyperframes browser ensure 還沒跑）時，測試專案那幾輪略過，不算失敗。

和舊版不同（保留不了的）：
  不再直接寫 plan.json 跑 --check → build → audit → snapshot：--review 本來就做 build、audit、完成態拼圖。
  --real 不再對真實專案本身跑（舊版會寫它的 work/），改成複本照流程跑；舊版有 output/final.mp4 就跑的 qc final 改由 --deliver（deliver.mjs 會跑）。
  直式不再用 projects/example-portrait 或合成的測試圖，改用示範口播裁成的直拍。`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TOOLS = path.join(ROOT, 'shared', 'template', 'tools');
const WIN = process.platform === 'win32';
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
if (flag('--help') || flag('-h')) { console.log(HELP); process.exit(0); }
const { hfArgs } = await import(path.join(TOOLS, 'lib', 'hf.mjs'));   // 測試專案在工作區外面：npx 會跑到快取裡的別版，直接跑工作區釘的那一版
const { STOP } = await import(path.join(TOOLS, 'lib', 'stops.mjs'));
const outFile = path.resolve(ROOT, val('--out') || path.join('dev', 'loop', 'last-check.md'));
const logFile = path.join(ROOT, 'dev', 'loop', 'check-log.md');
const FIXTURES = path.join(HERE, 'loop', 'fixtures');

// 暫存目錄：測試、測試專案、hyperframes render 的暫存（hf-*）都走 os.tmpdir()；有外接硬碟就導過去，免得塞爆系統碟。
// 優先序：環境變數 AUTO_EDIT_TMP → /Volumes/auto-edit-tmp（作者外接硬碟上的 APFS 映像卷，存在才用）→ 系統預設。子處理程序（node --test、hyperframes、look）都繼承 TMPDIR。
// 外接硬碟是 ExFAT，直接當暫存會被 macOS 寫進 ._* 隱藏檔、弄壞列目錄的測試；所以暫存放在硬碟上的 APFS 稀疏映像（auto-edit-tmp.sparseimage），沒掛載就先掛。
const extTmp = process.env.AUTO_EDIT_TMP || '/Volumes/auto-edit-tmp';
const extImg = '/Volumes/video/auto-edit-tmp.sparseimage';
if (!WIN && !process.env.AUTO_EDIT_TMP && !fs.existsSync(extTmp) && fs.existsSync(extImg)) {
  const r = spawnSync('hdiutil', ['attach', '-nobrowse', '-quiet', extImg], { stdio: 'ignore' });
  if (r.status === 0) console.log(`已掛載 ${extImg}`); // 掛不上就用系統預設
}
if (!WIN && fs.existsSync(extTmp)) { try { fs.accessSync(extTmp, fs.constants.W_OK); process.env.TMPDIR = extTmp; console.log(`暫存 → ${extTmp}`); } catch { /* 不可寫就用系統預設 */ } }

// 固定回答：AGENTS.md 停點表「我可以回」的那句；status 的 after[].when 寫著「回覆「…」」，用這句挑要跑哪一組指令
const ANSWER = { [STOP.cuts]: '可以', [STOP.framing]: '用建議的', [STOP.storyboard]: '可以' };
const DELIVER = '可以了，輸出完成影片';
const STEP_TIMEOUT = 30 * 60 * 1000;   // 一條指令卡 30 分鐘就算失敗（結束碼 75 的那種每次都會先回來）
const MAX_WAITS = 120;                 // 結束碼 75（還在跑）最多再跑幾次
const MAX_LOOPS = 40;                  // 一輪最多問幾次 status（正常 15 次以內到 ④）

const results = [];
const t0 = Date.now();
const secs = (ms) => +(ms / 1000).toFixed(1);
const lastLines = (text, n) => text.split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(-n);
const quote = (p) => `"${p}"`;
const short = (cmd) => cmd.replace(/^node\s+shared[\\/]template[\\/]tools[\\/]/, '').replace(/\s--project\s+("[^"]*"|\S+)/, '').replace(/\s--said\s+("[^"]*"|\S+)/, '').trim();
// 工具的回報段（「── 回報」下面、停點兩行之前）最能說明這一步做了什麼；沒有就挑 ✓／✖ 開頭的行
function brief(out) {
  const ls = out.split('\n').map((l) => l.trim()).filter(Boolean);
  const i = ls.findIndex((l) => l.startsWith('── 回報'));
  const pick = i >= 0 ? ls.slice(i + 1).filter((l) => !/^(⏸|請回：|<deliver-assets>|→ 下一步|node )/.test(l)) : ls.filter((l) => /^[✓✖]|通過/.test(l));
  return (pick.length ? pick : ls.slice(-2)).slice(0, 4).join('\n');
}

// 每一步：印 ✓／✖／略過與秒數；✖ 印最後 15 行輸出
function step(meta, fn) {
  const s = Date.now();
  let r;
  try { r = fn(); } catch (e) { r = { ok: false, detail: `丟出例外：${e.stack || e.message}` }; }
  Object.assign(r, meta, { sec: secs(Date.now() - s) });
  results.push(r);
  const mark = r.skip ? '略過' : r.ok ? '✓' : '✖';
  const head = `${meta.round ? `${meta.round}｜` : ''}${meta.name}${meta.fixture ? '（固定檔）' : ''}`;
  console.log(`${mark} ${head}（${r.sec}s）${r.detail ? `\n    ${String(r.detail).split('\n').join('\n    ')}` : ''}`);
  return r;
}

// 整行照 shell 跑（和 AI 貼進終端機一樣）；結束碼 75 就再跑同一條（會接著等，不會重跑）
function runLine(line) {
  let r, waits = 0;
  for (;;) {
    r = spawnSync(line, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: STEP_TIMEOUT, env: process.env });
    if (r.status !== 75 || waits >= MAX_WAITS) break;
    waits++;
  }
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const timedOut = r.error?.code === 'ETIMEDOUT';
  const ok = r.status === 0;
  const tail = ok ? brief(out) : `結束碼 ${r.status ?? r.signal}${timedOut ? '（逾時）' : ''}${r.status === 75 ? `（再跑了 ${waits} 次還在跑）` : ''}；最後幾行：\n${lastLines(out, 15).join('\n')}`;
  return { ok, out, waits, detail: `${waits ? `（等了 ${waits} 次）` : ''}${tail}` };
}
const tool = (file, project, rest) => `node shared/template/tools/${file} --project ${quote(project)}${rest ? ` ${rest}` : ''}`;

// ---------- Chrome、ffmpeg 有沒有 ----------
let chrome = null;
try { const { findChrome } = await import(path.join(TOOLS, 'lib', 'audit-browser.mjs')); chrome = findChrome({}); } catch { chrome = null; }
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

// ---------- 1. 單元測試 ----------
if (!flag('--skip-tests')) {
  const script = flag('--full') ? 'test' : 'test:fast';
  step({ round: '', stage: 'tests', name: `npm ${script === 'test' ? 'test' : 'run test:fast'}` }, () => {
    const r = spawnSync('npm', script === 'test' ? ['test'] : ['run', script], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: WIN, env: process.env });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    // 非 TTY 時 node --test 用 tap（# pass N），終端機是 spec（ℹ pass N）
    const num = (k) => new RegExp(`^(?:#|ℹ) ${k} (\\d+)`, 'm').exec(out)?.[1] ?? '?';
    const failing = [...new Set(out.split('\n').map((l) => l.trim()).filter((l) => /^not ok|^✖ /.test(l) && !/^✖ failing tests:/.test(l)))].slice(0, 8).join('\n');
    return { ok: r.status === 0, detail: `pass ${num('pass')}、fail ${num('fail')}${failing ? '\n' + failing : ''}`, pass: num('pass') };
  });
}

// ---------- 2. 各輪：準備測試專案 → 照 status 跑到 ④ ----------
const real = val('--real');
const rounds = [];
if (real) {
  const src = path.resolve(ROOT, real);
  rounds.push({ tag: '真實', source: src, fixtures: { drafts: path.join(src, 'work', 'drafts'), summary: path.join(src, 'work', '摘要.md') }, landscape: true });
} else {
  const src = path.join(ROOT, 'projects', 'example');
  const fx = (d) => ({ drafts: path.join(FIXTURES, d), summary: path.join(FIXTURES, d, '摘要.md') });
  rounds.push({ tag: '橫式', source: src, fixtures: fx('example'), landscape: true });
  if (!flag('--no-portrait')) rounds.push({ tag: '直式', source: src, fixtures: fx('example-portrait'), portrait: true });
}
const made = [];   // 這次建的測試專案
const keep = flag('--keep');
let failed = false;
for (const R of rounds) {
  if (failed) break;
  if (!chrome) { step({ round: R.tag, stage: 'prep', name: '測試專案', skip: true }, () => ({ ok: true, skip: true, detail: '沒有 chrome-headless-shell → 先跑 npx hyperframes browser ensure' })); continue; }
  const prep = step({ round: R.tag, stage: 'prep', name: `準備測試專案（${path.relative(ROOT, R.source) || R.source} 的素材與講稿${R.portrait ? '，主軌裁成 9:16 直拍' : ''}）` }, () => makeProject(R));
  if (!prep.ok) { if (prep.base && !keep) fs.rmSync(prep.base, { recursive: true, force: true }); failed = true; break; }
  made.push(prep);
  R.project = prep.project;
  failed = !drive(R);
  // 每一輪跑完就關它的剪輯台：剪輯台的埠只有 4400–4419，下一輪還要開
  spawnSync(tool('editor.mjs', R.project, '--stop'), { cwd: ROOT, shell: true, stdio: 'ignore' });
  if (!keep) fs.rmSync(prep.base, { recursive: true, force: true });
}

// ---------- 收尾：寫報告 ----------
const bad = results.filter((r) => !r.ok && !r.skip);
const total = secs(Date.now() - t0);
writeReport();
console.log(`\n${bad.length ? `✖ ${bad.map((r) => `${r.round ? `${r.round}｜` : ''}${r.name}`).join('、')} 沒過` : '✓ 全部通過'}（${clock(total)}）；報告 → ${path.relative(ROOT, outFile)}；紀錄 → ${path.relative(ROOT, logFile)}${keep && made.length ? `\n專案留在：${made.map((m) => m.project).join('、')}` : ''}`);
process.exit(bad.length ? 1 : 0);

// ---------- 準備測試專案：素材與講稿的複本（不碰來源專案） ----------
function makeProject(R) {
  if (!fs.existsSync(path.join(R.source, 'assets'))) return { ok: false, detail: `${R.source} 沒有 assets/` };
  if (!hasFfmpeg) return { ok: false, detail: '找不到 ffmpeg → 照 setup/ 的手冊裝' };
  const base = fs.mkdtempSync(path.join(os.tmpdir(), R.portrait ? 'auto-edit-check-v-' : 'auto-edit-check-'));
  const project = path.join(base, '專案');
  fs.mkdirSync(project, { recursive: true });
  fs.cpSync(path.join(R.source, 'assets'), path.join(project, 'assets'), { recursive: true, filter: (s) => path.basename(s) !== '.DS_Store' });
  if (fs.existsSync(path.join(R.source, '講稿.md'))) fs.copyFileSync(path.join(R.source, '講稿.md'), path.join(project, '講稿.md'));
  if (R.portrait) {
    // 直拍：中間裁 9:16、放大到 360×640（和舊版合成的直式測試片一樣大），聲音照原樣
    const cam = path.join(project, 'assets', 'camera');
    for (const f of fs.existsSync(cam) ? fs.readdirSync(cam).filter((x) => /\.(mp4|mov|m4v|mkv)$/i.test(x)) : []) {
      const src = path.join(R.source, 'assets', 'camera', f);
      const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', 'crop=trunc(ih*9/32)*2:ih,scale=360:640,setsar=1', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', path.join(cam, f)], { encoding: 'utf8' });
      if (r.status !== 0) return { ok: false, base, detail: `ffmpeg 裁直拍失敗：${lastLines(r.stderr || '', 3).join(' ')}` };
    }
  }
  return { ok: true, base, project, detail: project };
}

// ---------- 照 status 跑：回 true＝到 ④（和選用的 render／deliver）都過 ----------
function drive(R) {
  const P = R.project;
  let lastKey = '', repeats = 0;
  const fail = (stage, name, detail) => { step({ round: R.tag, stage, name }, () => ({ ok: false, detail })); return false; };
  const run = (stage, line, extra = {}) => step({ round: R.tag, stage, name: extra.name || short(line), fixture: extra.fixture }, () => runLine(line)).ok;
  for (let i = 0; i < MAX_LOOPS; i++) {
    const s = spawnSync(tool('status.mjs', P, '--json'), { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    let st;
    try { st = JSON.parse(s.stdout); } catch { return fail('', 'status.mjs --json', `沒印 JSON（結束碼 ${s.status}）：\n${lastLines(`${s.stdout}${s.stderr}`, 10).join('\n')}`); }
    const stage = st.nextStop || '';
    const key = `${st.at}\n${(st.cmds || []).join('\n')}`;
    repeats = key === lastKey ? repeats + 1 : 0;
    lastKey = key;
    if (repeats >= 2) return fail(stage, short(st.cmd || st.at), `status 連續 3 次印同一條（${st.at}）：跑完沒有前進\n依據：${(st.evidence || []).join('；')}`);
    // 停點在等、剪輯台沒開：AI 先跑 status 印的開剪輯台指令，網址填好才貼停點
    if ((st.waiting || []).length && st.needEditor && st.cmds?.length) {
      for (const c of st.cmds) if (!run(st.waiting[0], c, { name: `開剪輯台：${short(c)}` })) return false;
      continue;
    }
    if ((st.waiting || []).includes(STOP.final)) {
      step({ round: R.tag, stage: STOP.final, name: `到停點 ${STOP.final}` }, () => ({ ok: true, detail: String(st.stopLine || '').split('\n')[0] }));
      return extras(R, st);
    }
    if ((st.waiting || []).length) {
      const stop = st.waiting[0], ans = ANSWER[stop];
      const a = ans && (st.after || []).find((x) => String(x.when).includes(`「${ans}」`));
      if (!a) return fail(stop, `停點 ${stop}`, `沒有固定回答可以接（status 的 after：${(st.after || []).map((x) => x.when).join('／') || '空的'}）`);
      for (const c of a.cmds) if (!run(stop, c.split('<使用者原話>').join(ans), { name: `${stop} 回「${ans}」→ ${short(c)}` })) return false;
      if (!summary(R, stop)) return false;
      continue;
    }
    const cmd = st.cmd || '';
    const writes = /--map-merge\b/.test(cmd) ? 'maps' : /--merge-drafts\b/.test(cmd) ? 'drafts' : null;
    if (st.dispatch && !writes) return fail(stage, `${st.at}`, `status 要派子代理（${st.dispatch.note}），一鍵檢查不呼叫 AI → 補固定檔的接法，或改測試專案避開這一步`);
    if (!st.cmds?.length) return fail(stage, `${st.at}`, `status 沒有指令也沒有停點，這一步要 AI 自己做：${st.next}\n依據：${(st.evidence || []).join('；')}`);
    if (writes === 'maps' && !placeMaps(R, stage, run)) return false;
    if (writes === 'drafts' && !placeDrafts(R, stage, run)) return false;
    for (const c of st.cmds) if (!run(stage, c)) return false;
    if (!summary(R, stage)) return false;
  }
  return fail('', 'status 迴圈', `問了 ${MAX_LOOPS} 次 status 還沒到 ${STOP.final}`);
}

// 子代理第一回合寫的語意地圖：放固定檔，跑寫的人會跑的驗證（--map），再讓主流程合併
function placeMaps(R, stage, run) {
  const dir = path.join(R.project, 'work', 'drafts');
  const chs = listFixtures(R, '.map.md');
  if (!chs.length) { step({ round: R.tag, stage, name: '語意地圖', fixture: true }, () => ({ ok: false, detail: `${R.fixtures.drafts} 沒有 *.map.md 固定檔` })); return false; }
  fs.mkdirSync(dir, { recursive: true });
  for (const ch of chs) {
    fs.copyFileSync(path.join(R.fixtures.drafts, `${ch}.map.md`), path.join(dir, `${ch}.map.md`));
    if (!run(stage, tool('build.mjs', R.project, `--map ${ch}`), { name: `${ch}.map.md → build.mjs --map ${ch}`, fixture: true })) return false;
  }
  return true;
}

// 子代理第二回合：看校正後的地圖（--map）→ 寫大綱（--outline 出骨架）→ 填骨架（換成固定檔）→ --check-draft
function placeDrafts(R, stage, run) {
  const dir = path.join(R.project, 'work', 'drafts');
  const chs = listFixtures(R, '.json').filter((c) => !c.startsWith('_'));
  if (!chs.length) { step({ round: R.tag, stage, name: '分鏡草稿', fixture: true }, () => ({ ok: false, detail: `${R.fixtures.drafts} 沒有 <份>.json 固定檔` })); return false; }
  for (const ch of chs) {
    if (!run(stage, tool('build.mjs', R.project, `--map ${ch}`), { name: `build.mjs --map ${ch}（第二回合）` })) return false;
    const outline = path.join(R.fixtures.drafts, `${ch}.outline.md`);
    if (fs.existsSync(outline)) {
      fs.copyFileSync(outline, path.join(dir, `${ch}.outline.md`));
      if (!run(stage, tool('build.mjs', R.project, `--outline ${ch}`), { name: `${ch}.outline.md → build.mjs --outline ${ch}`, fixture: true })) return false;
    }
    fs.copyFileSync(path.join(R.fixtures.drafts, `${ch}.json`), path.join(dir, `${ch}.json`));
    if (!run(stage, tool('build.mjs', R.project, `--check-draft ${ch}`), { name: `${ch}.json → build.mjs --check-draft ${ch}`, fixture: true })) return false;
  }
  return true;
}
function listFixtures(R, ext) {
  return fs.existsSync(R.fixtures.drafts) ? fs.readdirSync(R.fixtures.drafts).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort() : [];
}

// 初剪好了 AI 要寫影片摘要（status 只印 ⚠、不擋流程）：放固定檔、跑 --summary 驗
function summary(R, stage) {
  const w = path.join(R.project, 'work');
  if (R.noSummary || !fs.existsSync(path.join(w, 'rough.mp4')) || fs.existsSync(path.join(w, '摘要.md'))) return true;
  if (!fs.existsSync(R.fixtures.summary)) { R.noSummary = true; step({ round: R.tag, stage, name: '摘要.md', fixture: true }, () => ({ ok: true, skip: true, detail: `沒有 ${R.fixtures.summary}` })); return true; }
  fs.copyFileSync(R.fixtures.summary, path.join(w, '摘要.md'));
  return step({ round: R.tag, stage, name: '摘要.md → status.mjs --summary', fixture: true }, () => runLine(tool('status.mjs', R.project, '--summary'))).ok;
}

// 到 ④ 之後的選用步驟（只跑橫式那一輪）
function extras(R, st) {
  if (!R.landscape) return true;
  const P = R.project;
  if (flag('--render')) {
    const r = step({ round: R.tag, stage: 'render', name: 'build --test 3 秒片段 → render draft → ffprobe 有影音軌' }, () => {
      const hf = path.join(P, 'work', 'hyperframes');
      const t = runLine(tool('build.mjs', P, '--test 8,3'));
      if (!t.ok) return t;
      const clip = path.join(P, 'output', 'test-clips', 'check-clip.mp4');
      fs.mkdirSync(path.dirname(clip), { recursive: true });
      const r = spawnSync(process.execPath, hfArgs(['render', '-c', 'compositions/test-clip.html', '--quality', 'draft', '-o', clip]), { cwd: hf, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (!fs.existsSync(clip)) return { ok: false, detail: `render 沒有輸出：${lastLines(`${r.stdout}${r.stderr}`, 5).join('\n')}` };
      const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', clip], { encoding: 'utf8' });
      return { ok: /video/.test(p.stdout) && /audio/.test(p.stdout), detail: `streams: ${p.stdout.trim().split('\n').join('、')}` };
    });
    if (!r.ok) return false;
  }
  if (flag('--deliver')) {
    const a = (st.after || []).find((x) => String(x.when).includes('可以了'));
    if (!a) { step({ round: R.tag, stage: 'deliver', name: `④ 回「${DELIVER}」` }, () => ({ ok: false, detail: `status 的 after 沒有「可以了」那一組：${(st.after || []).map((x) => x.when).join('／') || '空的'}` })); return false; }
    for (const c of a.cmds) {
      const r = step({ round: R.tag, stage: 'deliver', name: `④ 回「${DELIVER}」→ ${short(c)}` }, () => runLine(c.split('<使用者原話>').join(DELIVER)));
      if (!r.ok) return false;
    }
    const f = path.join(P, 'output', 'final.mp4');
    if (!step({ round: R.tag, stage: 'deliver', name: 'output/final.mp4' }, () => ({ ok: fs.existsSync(f), detail: fs.existsSync(f) ? `${(fs.statSync(f).size / 1e6).toFixed(1)} MB` : '沒有產生' })).ok) return false;
  }
  return true;
}

// ---------- 報告：詳細表（last-check.md，每次覆寫）＋紀錄一行（check-log.md，每次加一行） ----------
function clock(s) { const m = Math.floor(s / 60); return m ? `${m}m${String(Math.round(s % 60)).padStart(2, '0')}s` : `${Math.round(s)}s`; }
function git(a) { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : ''; }
function stamp() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function cell(s) { return String(s ?? '').replace(/\|/g, '｜').replace(/\n/g, '<br>'); }
// 一輪濃縮成「①✓19s ②✓3s ③✓80s 固定檔 ④✓14s」：照 status 印的下一個停點分組
function roundCell(tag) {
  const rs = results.filter((r) => r.round === tag);
  if (!rs.length) return '—';
  const groups = new Map();
  for (const r of rs) {
    const k = r.stage === 'prep' ? '準備' : r.stage === 'render' ? 'render' : r.stage === 'deliver' ? '輸出' : (String(r.stage).match(/^[①②③④⑤⑥]/)?.[0] || '其他');
    const g = groups.get(k) || { sec: 0, ok: true, skip: true, fixture: false };
    g.sec += r.sec; g.ok &&= r.ok || r.skip; g.skip &&= !!r.skip; g.fixture ||= !!r.fixture;
    groups.set(k, g);
  }
  return [...groups].map(([k, g]) => `${k}${g.skip ? '略過' : g.ok ? '✓' : '✖'}${clock(g.sec)}${g.fixture ? ' 固定檔' : ''}`).join(' ');
}
function writeReport() {
  const when = stamp();
  const md = [`# check-all ${when}`, '', `總耗時 ${clock(total)}；結果：${bad.length ? `✖ ${bad.length} 步沒過` : '全部通過'}${keep && made.length ? `；專案留在 ${made.map((m) => m.project).join('、')}` : '（測試專案已清掉）'}`, '',
    '| 輪 | 停點 | 步驟 | 結果 | 秒 | 細節 |', '|---|---|---|---|---|---|',
    ...results.map((r) => `| ${cell(r.round || '—')} | ${cell(r.stage)} | ${cell(r.name)}${r.fixture ? '（固定檔）' : ''} | ${r.skip ? '略過' : r.ok ? '✓' : '✖'} | ${r.sec} | ${cell(r.detail)} |`), ''].join('\n');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, md);
  const tests = results.find((r) => r.stage === 'tests');
  const head = git(['rev-parse', '--short', 'HEAD']);
  const dirty = git(['status', '--porcelain']) ? '＋未提交的改動' : '';
  const opts = ['--full', '--render', '--deliver', '--no-portrait', '--skip-tests'].filter(flag).concat(real ? [`--real ${real}`] : []).join(' ');
  const line = `| ${when} | ${cell(git(['rev-parse', '--abbrev-ref', 'HEAD']))} | ${head}${dirty} | ${tests ? `${tests.name} ${tests.ok ? '✓' : '✖'}${clock(tests.sec)}（pass ${tests.pass ?? '?'}）` : '沒跑'} | ${rounds.map((R) => `${R.tag}：${roundCell(R.tag)}`).join('<br>') || '—'} | ${cell(opts || '—')} | ${clock(total)} | ${bad.length ? '✖' : '✓'} |`;
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, ['# check-all 紀錄', '', '`node dev/check-all.mjs` 每跑一次在最後加一行（工具寫的，不要手改）。各輪的格子照 status 印的下一個停點分組：準備＝複製素材；① 剪輯清單（prep、回「可以」、初剪、摘要）；② 構圖；③ 分鏡表（語意地圖、草稿、合併、回「可以」）；④ 完成影片預覽（--review）。「固定檔」＝那一段有要 AI 寫的檔，用 `dev/loop/fixtures/` 的範例代替。', '',
      '| 時間 | 分支 | commit | 單元測試 | 各輪 | 選項 | 總時間 | 結果 |', '|---|---|---|---|---|---|---|---|', ''].join('\n'));
  }
  fs.appendFileSync(logFile, `${line}\n`);
}

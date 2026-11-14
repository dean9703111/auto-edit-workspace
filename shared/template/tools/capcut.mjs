#!/usr/bin/env node
// 剪映素材：把完成影片拆成「主軌＋每段一支透明 MOV＋字幕 SRT」，放進 projects/<專案>/output/capcut/，在剪映（CapCut）照清單排回時間軸
//   build.mjs --capcut 產生合成（compositions/capcut-*.html、capcut.json、capcut.srt）→ 這支同時 render 幾支（--jobs）、寫清單
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathsFrom } from './lib/project.mjs';
import { hfArgs } from './lib/hf.mjs';
import { DEFAULT_WAIT, STILL_RUNNING, runJob, waitJob, jobState, isJobChild, stallWarning, runToolUntilDone } from './lib/job.mjs';
import { killTree } from './lib/deliver.mjs';
import { cmdLine, next } from './lib/say.mjs';
import { splitFlag, valueOf, isMain } from './lib/cli.mjs';
import { clock2 } from './lib/time.mjs';

const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const DEFAULT_JOBS = 3;
const JOB = 'capcut';   // 背景工作的名字（work/.jobs/capcut.json）
const STALL_MIN = 30;   // 主軌是整支 render（--quiet 不太印東西），比預設的 10 分鐘寬
const HELP = `剪映素材（主軌＋每段一支透明 MOV＋字幕 SRT；要 Node 22、ffmpeg、HyperFrames）

  node shared/template/tools/capcut.mjs --project projects/<專案>               產生全部：output/capcut/ 的主軌.mp4、每段 .mov、字幕.srt、清單.md
                                                                               在背景跑，前景最多等 ${DEFAULT_WAIT} 秒（--wait <秒> 可改）；印「⏳ 還在跑」（結束碼 ${STILL_RUNNING}）就再跑同一條，會接著等、不會重做
  node shared/template/tools/capcut.mjs --project projects/<專案> --background  開了就回；接著用 status --wait 等（和上面那條是同一個背景工作）
  node shared/template/tools/capcut.mjs status --project projects/<專案>        背景跑到哪一支、做完的有哪些
  node shared/template/tools/capcut.mjs status --project projects/<專案> --wait [秒]  等到做完或逾時（預設 ${DEFAULT_WAIT} 秒）才印結果；結束碼 0 做完、1 失敗或中斷、${STILL_RUNNING} 還在跑（再跑一次接著等）
  node shared/template/tools/capcut.mjs --project projects/<專案> --cancel      取消背景的剪映素材（連 Chrome 一起收；做好的檔留著）
  node shared/template/tools/capcut.mjs --project projects/<專案> --dry-run     只產生合成和清單，不 render（先看會出幾支、多長）

選項：--only s05,s12（只做這幾段，不做主軌）、--no-main（不做主軌）、--force（已經做過、沒變的也重做）、
      --jobs <N>（同時 render 幾支，預設 ${DEFAULT_JOBS}）、--workers <N>（每支幾個 worker，預設自動：加起來不超過只跑一支時）
每段 .mov 是 ProRes 4444（有透明通道，帶這段的音效）：疊加卡只有卡片；子母畫面、全幕、半畫面整格都有（含講者小視窗）。
主軌.mp4 是講者畫面＋人聲＋片尾配樂（調光、瘦臉、剪輯台的跳接放大與過黑都在裡面）；沒有字卡、字幕、段落音效。
字幕.srt 是完成影片畫面上實際顯示的字幕（剪映：文本 → 本地字幕 → 匯入）。章節角標不輸出（剪映用文字貼）。
背景工作的 log 和 render.log 超過 ${STALL_MIN} 分鐘沒有新內容時，「⏳ 還在跑」／「進行中」下面多一行 ⚠ 和取消指令。`;

const VALUE_FLAGS = ['project', 'only', 'template', 'jobs', 'workers'];
const BOOL_FLAGS = ['background', 'dry-run', 'no-main', 'force', 'help', 'cancel'];
const USAGE = '→ 看用法：node shared/template/tools/capcut.mjs --help';

export function parseCapcutArgs(argv) {
  const flags = { cmd: 'run' };
  const rest = [...argv];
  if (rest[0] === 'status') { flags.cmd = 'status'; rest.shift(); }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`看不懂的參數「${a}」${USAGE}`);
    const [k, inline] = splitFlag(a);
    if (k === 'wait') {   // --wait [秒]：秒數可以不寫
      const v = inline ?? (/^\d+$/.test(rest[i + 1] ?? '') ? rest[++i] : null);
      if (v != null && !/^\d+$/.test(v)) throw new Error(`--wait 後面要接秒數，現在是「${v}」→ 例：--wait 300`);
      flags.wait = v == null ? DEFAULT_WAIT : Number(v);
    } else if (VALUE_FLAGS.includes(k)) {
      try { [flags[k], i] = valueOf(rest, i, k, inline); } catch (e) { throw new Error(`${e.message} ${USAGE}`); }
    } else if (BOOL_FLAGS.includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數 ${USAGE}`);
  }
  for (const k of ['jobs', 'workers']) if (flags[k] != null && !/^[1-9]\d*$/.test(flags[k])) throw new Error(`--${k} 要寫正整數，現在是「${flags[k]}」→ 例：--${k} 2`);
  if (flags.cancel && (flags.cmd === 'status' || flags.background || flags['dry-run'])) throw new Error('--cancel 只能單獨用 → node shared/template/tools/capcut.mjs --project projects/<專案> --cancel');
  return flags;
}

// 0m31.68s：檔名裡的起點（剪映照這個時間放）
export const stampName = (t) => `${Math.floor(t / 60)}m${(t % 60).toFixed(2).padStart(5, '0')}s`;
export const mmss = clock2;
export const segFile = (s, i) => `${String(i + 1).padStart(2, '0')}_${s.id}_${stampName(s.start)}.mov`;

// HyperFrames 自動開的 worker 約是核心數的一半（10 核心 5 個）；同時 N 支時平分，加起來不超過只跑一支時。
// 每段只有幾秒，1 個 worker 夠用（實測 24 段＋主軌：一支一支跑 578 秒、CPU 1638 秒；同時 3 支 286 秒、CPU 1400 秒。每支 2 個反而比 1 個慢）。
const workerBudget = (cpus) => Math.max(1, Math.floor(cpus / 2));
export function workersPerJob(jobs, cpus = os.cpus().length) {
  return Math.max(1, Math.floor(workerBudget(cpus) / jobs));
}
// 主軌是整支（實測 1 個 worker 比自動慢 1.6 倍）：其他幾支分完剩下的都給它
export function mainWorkers(jobs, cpus = os.cpus().length) {
  return Math.max(1, workerBudget(cpus) - (jobs - 1) * workersPerJob(jobs, cpus));
}

const hashFile = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function listMd(cc, { files, project }) {
  const L = [];
  L.push(`# 剪映素材清單（${project}）`, '');
  L.push(`完成影片長度 ${mmss(cc.duration)}，${cc.format === 'portrait' ? '直式 1080×1920' : '橫式 1920×1080'}、30fps。`, '');
  L.push('## 怎麼排', '');
  L.push('1. 新草稿的比例照上面的版式；把 `主軌.mp4` 拖到主軌道，從 0 秒開始。');
  L.push('2. 每支 `.mov` 拖到主軌道上面的畫中畫軌道，起點對齊下表的「放在」（檔名也寫了起點，例 `0m31.68s`＝0 分 31.68 秒）。');
  L.push('3. 文本 → 本地字幕 → 匯入 `字幕.srt`，再套你的字幕樣式（SRT 只有字和時間：剪輯台或 `brand.mjs captions` 選的字幕樣式、字體不會跟過來）。');
  L.push('4. `.mov` 有透明通道：疊加卡只有卡片；子母畫面、全幕、半畫面整格都有畫面（講者小視窗在裡面），蓋住主軌是對的。每支都帶自己那段的音效，不要可以在剪映把那支的音量關掉。', '');
  L.push('## 檔案', '');
  L.push('| 檔名 | 放在 | 長度 | 版面 | 內容 | 音效 |');
  L.push('|---|---|---|---|---|---|');
  if (files.main) L.push(`| ${files.main} | 0:00.00 | ${mmss(cc.main.duration)} | 主軌 | 講者＋人聲＋片尾配樂 | — |`);
  for (const s of cc.segs) if (files[s.id]) L.push(`| ${files[s.id]} | ${mmss(s.start)} | ${s.duration.toFixed(2)} 秒 | ${s.layoutZh}${s.footage ? '（含講者）' : ''} | ${String(s.label).replace(/\|/g, '｜')} | ${s.sfx ? `${s.sfx} 顆` : '無'} |`);
  L.push('| 字幕.srt | 0:00.00 | — | 字幕 | 畫面上實際顯示的字幕 | — |', '');
  L.push('沒有輸出：章節角標（剪映用文字貼）。', '');
  return L.join('\n');
}

// 同時有好幾支在跑：每一行加 [檔名]，render.log 才分得出是誰的
function logPrefixer(tag, write) {
  let buf = '';
  return {
    push(d) {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      if (lines.length) write(lines.map((l) => `[${tag}] ${l}\n`).join(''));
    },
    flush() { if (buf) write(`[${tag}] ${buf}\n`); buf = ''; },
  };
}

const rendering = new Set();   // 正在 render 的子行程：這支被中斷時一起收掉，不留 Chrome 孤兒

function render(hfDir, j, out, { logFd, workers, env }) {
  return new Promise((resolve) => {
    // 先寫 .part、成功才改名：中斷時不會留下半支又被當成做過
    const part = out.replace(/(\.\w+)$/, '.part$1');
    const args = hfArgs(['render', '-c', j.comp, ...j.args, ...(workers ? ['--workers', String(workers)] : []), '--quiet', '-o', part]);
    const p = spawn(process.execPath, args, { cwd: hfDir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, windowsHide: true });
    rendering.add(p);
    const log = logPrefixer(j.out, (s) => { try { fs.writeSync(logFd, s); } catch { /* log 寫不進去不影響輸出 */ } });
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => log.push(d));
    p.stderr.on('data', (d) => log.push(d));
    const done = (ok) => {
      rendering.delete(p);
      let good = ok;
      // Windows：舊檔開在剪映裡會換不過去，算這支失敗，不要整個停掉
      if (ok) { try { fs.renameSync(part, out); } catch (e) { log.push(`${e.message}\n`); good = false; } }
      if (!good) { try { fs.rmSync(part, { force: true }); } catch { /* 下次會覆寫 */ } }
      log.flush();
      resolve(good);
    };
    p.on('error', (e) => { log.push(`${e.message}\n`); done(false); });
    p.on('close', (code) => done(code === 0 && fs.existsSync(part)));
  });
}

// 同時最多 limit 個，照順序取
export async function runPool(items, limit, worker) {
  let next = 0;
  const one = async () => { while (next < items.length) { const i = next++; await worker(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, one));
}

// 沒變的略過（isFresh）、其他丟給 render（回傳 true＝成功）；state 隨時可以被 status 讀
export async function renderAll(jobs, { limit, isFresh, render: renderOne, state, save = () => {}, log = () => {}, onMade = () => {} }) {
  const total = jobs.length;
  let n = 0;
  save();
  await runPool(jobs, limit, async (j) => {
    if (isFresh(j)) { state.skipped.push(j.out); state.made.push(j.out); save(); log(`  [${++n}/${total}] ${j.out} 沒變，略過`); return; }
    state.current.push(j.out); save();
    const t = Date.now();
    const ok = await renderOne(j);
    state.current = state.current.filter((x) => x !== j.out);
    const sec = ((Date.now() - t) / 1000).toFixed(0);
    if (ok) { onMade(j); state.made.push(j.out); log(`  [${++n}/${total}] ✓ ${j.out}（${sec} 秒）`); }
    else { state.failed.push(j.out); log(`  [${++n}/${total}] ✖ ${j.out} render 失敗`); }
    save();
  });
  return state;
}

function probe(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt', '-of', 'compact=p=0:nk=1', f], { encoding: 'utf8' });
  return String(r.stdout || '').trim().split('\n').filter(Boolean).join('；');
}

const stateOf = (dir) => readJson(path.join(dir, '.capcut-state.json'), null);
function writeState(dir, st) {
  const f = path.join(dir, '.capcut-state.json');
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(st, null, 2) + '\n');
  fs.renameSync(`${f}.tmp`, f);
}
const q = (s) => (/\s/.test(s) ? `"${s}"` : s);   // 專案名稱有空白時，印出來的指令才能直接貼
const cancelCmd = (rel) => cmdLine('capcut.mjs', ['--project', rel, '--cancel']);
const waitCmd = (rel) => cmdLine('capcut.mjs', ['status', '--project', rel, '--wait']);
const activityOf = (dir) => [path.join(dir, 'render.log'), path.join(dir, 'capcut.log')];   // render 的全文、工作行程的訊息：有在寫就不算卡住

export function statusCmd(dir, rel, { waited = false, log = console.log, project = path.resolve(dir, '..', '..') } = {}) {
  const st = stateOf(dir);
  if (!st) { log(`還沒跑過 → node shared/template/tools/capcut.mjs --project ${q(rel)}`); return waited ? 1 : 0; }
  const alive = st.pid && pidAlive(st.pid);
  const current = [].concat(st.current ?? []);   // 舊版的 state 是字串
  const bad = st.done && st.failed.length > 0;
  log(`${bad ? '✖ 做完了但有失敗' : st.done ? '✓ 做完了' : alive ? '🔄 進行中' : '✖ 中斷了'}：${st.made.length}／${st.total} 支${!st.done && current.length ? `（現在：${current.join('、')}）` : ''}${st.failed.length ? `；失敗 ${st.failed.join('、')}` : ''}`);
  if (bad) log(`→ 看 ${rel}/output/capcut/render.log 裡 [${st.failed[0]}] 開頭的幾行，修好後同一個指令再跑一次（做過、沒變的會略過）`);
  else if (st.done) log(`→ 清單：${rel}/output/capcut/清單.md`);
  else if (!alive) { for (const l of next(`看 ${rel}/output/capcut/capcut.log 最後幾行，修好後接著做（做過的會略過）`, cmdLine('capcut.mjs', ['--project', rel, '--background']))) log(l); }
  else {
    const stall = stallWarning({ project, name: JOB, stallMin: STALL_MIN, cancel: cancelCmd(rel), activity: activityOf(dir) });
    if (stall) log(stall);
    for (const l of next('還沒好，接著等', waitCmd(rel))) log(l);
  }
  if (!waited) return 0;
  return st.done ? (bad ? 1 : 0) : alive ? STILL_RUNNING : 1;
}

// status --wait：等到做完、中斷或逾時才回來（agent 不用每 30 秒查一次）
export async function waitForCapcut(dir, seconds, { pollMs = 1000 } = {}) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const st = stateOf(dir);
    if (!st || st.done || !(st.pid && pidAlive(st.pid)) || Date.now() >= until) return st;
    await sleep(Math.min(pollMs, Math.max(50, until - Date.now())));
  }
}

// 這個 pid 還是 capcut.mjs 嗎（舊版背景跑時只記在 .capcut-state.json；pid 可能被別的程式重用，不能收錯）
const isCapcutPid = (pid) => process.platform === 'win32' || /capcut\.mjs/.test(spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout || '');
const freshState = (pid) => ({ pid, total: 0, made: [], skipped: [], failed: [], current: [], done: false });

async function cancelCapcut(P, dir, rel) {
  const js = jobState(P.project, JOB), cur = stateOf(dir);
  const pid = js.state === 'running' ? js.pid : cur && !cur.done && cur.pid && pidAlive(cur.pid) && isCapcutPid(cur.pid) ? cur.pid : null;
  if (!pid) { console.log('現在沒有在背景做剪映素材'); return 0; }
  const { survivors } = await killTree(pid);
  if (survivors.length) { console.log(`✖ 這些行程收不掉：${survivors.join('、')} → 回報這一行`); return 1; }
  console.log(`已取消剪映素材（pid ${pid}）；做好的檔留著，同一條指令再跑一次會略過沒變的：node shared/template/tools/capcut.mjs --project ${q(rel)}`);
  return 0;
}

async function main() {
  const flags = parseCapcutArgs(process.argv.slice(2));
  if (flags.help) { console.log(HELP); return 0; }
  const P = pathsFrom(flags);
  const rel = path.relative(process.cwd(), P.project).split(path.sep).join('/') || '.';
  const dir = path.join(P.project, 'output', 'capcut');
  fs.mkdirSync(dir, { recursive: true });
  if (flags.cmd === 'status') {
    // 和 capcut.mjs --project 同一個背景工作（lib/job.mjs）：只等、不開工；只印結果和下一步
    if (flags.wait != null) {
      if (jobState(P.project, JOB).state !== 'none') await waitJob({ project: P.project, name: JOB, waitSec: flags.wait, log: () => {} });
      else await waitForCapcut(dir, flags.wait);   // 舊版開的（沒有工作紀錄）
    }
    return statusCmd(dir, rel, { waited: flags.wait != null, project: P.project });
  }
  if (flags.cancel) return cancelCapcut(P, dir, rel);
  if (isJobChild(JOB)) return runJob({ project: P.project, name: JOB, run: () => work(P, flags, dir, rel) });
  const argv = [SELF, ...process.argv.slice(2)];
  // 先把狀態蓋成「這次在跑」：不然馬上接 status 會讀到上一次的「做完了」（子行程 build 完才開始寫）
  const onStart = (pid) => writeState(dir, freshState(pid));
  if (flags.background) {
    const js = jobState(P.project, JOB), cur = stateOf(dir);
    if (js.state === 'running') console.log(`已經在背景做了（pid ${js.pid}），不用重開`);
    else if (cur && !cur.done && cur.pid && pidAlive(cur.pid) && isCapcutPid(cur.pid)) console.log(`已經在背景做了（pid ${cur.pid}），不用重開`);
    else {
      await runJob({ project: P.project, name: JOB, argv, waitSec: 0, again: true, log: () => {}, onStart });
      console.log(`在背景做剪映素材（pid ${jobState(P.project, JOB).pid}），log：${rel}/output/capcut/capcut.log`);
    }
    for (const l of next('等它做完（這條指令最多等 9 分鐘；還沒好就再跑一次，不用自己查進度）', waitCmd(rel))) console.log(l);
    return 0;
  }
  const code = await runJob({
    project: P.project, name: JOB, argv, waitSec: flags.wait ?? DEFAULT_WAIT, onStart,
    stallMin: STALL_MIN, activity: activityOf(dir), cancel: cancelCmd(rel),
  });
  if (code === STILL_RUNNING) console.log(cmdLine('capcut.mjs', process.argv.slice(2)));
  return code;
}

// 背景工作的子行程：真正做事。stdout 進 work/.jobs/capcut.log，同一份也寫 output/capcut/capcut.log（中斷時訊息叫人看它）
async function work(P, flags, dir, rel) {
  const logFile = path.join(dir, 'capcut.log');
  try { fs.writeFileSync(logFile, ''); } catch { /* log 寫不進去不影響輸出 */ }
  const say = (s) => { console.log(s); try { fs.appendFileSync(logFile, `${s}\n`); } catch { /* 同上 */ } };

  // 1. build --capcut（失敗就停：plan.json 有 ✖）；build 回 75＝底片還在背景處理，再跑一次接著等（有總上限）
  say('產生剪映素材的合成（build.mjs --capcut）…');
  const b = await runToolUntilDone(path.join(HERE, 'build.mjs'), ['--project', P.project, '--capcut', ...(flags.template ? ['--template', flags.template] : [])], {
    onWait: ({ sec }) => say(`  （build 還在處理底片，已等 ${sec} 秒，接著等）`),
  });
  const blines = String(b.stdout || '').split('\n');
  for (const l of blines) if (/^(✖|產生：|風格包：|主題：)/.test(l)) say(`  ${l}`);
  if (b.timedOut) { say('✖ build 等到上限還沒做完，沒有產生剪映素材 → 看 work/.jobs/ 裡最新的 .log；還在動就同一條指令再跑一次，不動就停下來回報'); return 1; }
  if (b.code !== 0) { say(String(b.stderr || '').trim()); say('✖ build 沒過，沒有產生剪映素材 → 照上面 ✖ 的 → 改 plan.json，再跑一次這個指令'); return 1; }
  const cc = readJson(path.join(P.out, 'capcut.json'), null);
  if (!cc) { say('✖ build 沒有寫出 capcut.json → 回報這一行'); return 1; }

  const only = flags.only ? String(flags.only).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : null;
  if (only) {
    const bad = only.filter((id) => !cc.segs.some((s) => s.id === id));
    if (bad.length) { say(`✖ --only 的 ${bad.join('、')} 不在這一集的段落裡 → 現有：${cc.segs.map((s) => s.id).join('、')}`); return 1; }
  }
  const jobs = [];
  const files = {};
  if (!only && !flags['no-main']) { jobs.push({ key: 'main', comp: cc.main.file, out: '主軌.mp4', args: ['--quality', 'standard'] }); files.main = '主軌.mp4'; }
  cc.segs.forEach((s, i) => {
    files[s.id] = segFile(s, i);
    if (!only || only.includes(s.id)) jobs.push({ key: s.id, comp: s.file, out: files[s.id], args: ['--format', 'mov'] });
  });
  // 字幕與清單（不用 render，先寫）
  fs.copyFileSync(path.join(P.out, 'capcut.srt'), path.join(dir, '字幕.srt'));
  const projName = path.basename(P.project);
  say(`段落 ${cc.segs.length} 支 MOV${files.main ? '＋主軌' : ''}；這次要做 ${jobs.length} 支`);
  if (flags['dry-run']) {
    fs.writeFileSync(path.join(dir, '清單.md'), listMd(cc, { files, project: projName }));
    for (const j of jobs) say(`  ${j.out}（${j.comp}）`);
    say(`→ 清單：${rel}/output/capcut/清單.md、字幕：${rel}/output/capcut/字幕.srt（--dry-run 沒有 render）`);
    return 0;
  }

  // 2. 同時 render 幾支（合成沒變、檔還在就略過）；--jobs 1 用 HyperFrames 的自動 worker（和以前一樣）
  const limit = Number(flags.jobs ?? DEFAULT_JOBS);
  const workers = flags.workers ? Number(flags.workers) : limit > 1 ? workersPerJob(limit) : null;
  const mainW = flags.workers ? Number(flags.workers) : limit > 1 ? mainWorkers(limit) : null;
  const cacheFile = path.join(dir, '.capcut-cache.json');
  const cache = readJson(cacheFile, {});
  const state = { pid: process.pid, total: jobs.length, jobs: limit, workers, made: [], skipped: [], failed: [], current: [], done: false };
  const save = () => writeState(dir, state);
  const logFd = fs.openSync(path.join(dir, 'render.log'), 'a');
  const foot = path.join(P.out, 'assets', 'rough.mp4');
  const footStamp = fs.existsSync(foot) ? (({ size, mtimeMs }) => `${size}.${Math.round(mtimeMs)}`)(fs.statSync(foot)) : 'none';
  // 合成內容＋底片（調光、瘦臉重做時合成不變，底片會變）
  const keyOf = (j) => `${hashFile(path.join(P.out, j.comp))}-${footStamp}`;
  // 一律在背景工作的子行程跑，爸爸（前景那條指令）可能先結束：HyperFrames 不用盯爸爸（render_cancelled_parent_exited）；這支被砍時由下面的 signal 收
  const env = { HYPERFRAMES_RENDER_DETACHED: '1' };
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { Promise.allSettled([...rendering].map((p) => killTree(p.pid))).finally(() => process.exit(1)); });
  say(`同時 ${limit} 支${workers ? `、每支 ${workers} 個 worker${files.main && mainW !== workers ? `（主軌 ${mainW} 個）` : ''}` : ''}（render 全文：${rel}/output/capcut/render.log）`);
  await renderAll(jobs, {
    limit, state, save, log: say,
    isFresh: (j) => !flags.force && cache[j.out] === keyOf(j) && fs.existsSync(path.join(dir, j.out)),
    render: (j) => render(P.out, j, path.join(dir, j.out), { logFd, workers: j.key === 'main' ? mainW : workers, env }),
    onMade: (j) => { cache[j.out] = keyOf(j); fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2) + '\n'); },
  });
  fs.closeSync(logFd);
  state.done = true; save();

  // 3. 清單＋驗證
  fs.writeFileSync(path.join(dir, '清單.md'), listMd(cc, { files, project: projName }));
  const first = jobs.find((j) => j.out.endsWith('.mov') && fs.existsSync(path.join(dir, j.out)));
  if (fs.existsSync(path.join(dir, '主軌.mp4'))) say(`驗證 主軌.mp4：${probe(path.join(dir, '主軌.mp4'))}`);
  if (first) say(`驗證 ${first.out}：${probe(path.join(dir, first.out))}（yuva＝有透明通道）`);
  say(state.failed.length ? `✖ ${state.failed.length} 支失敗：${state.failed.join('、')} → 看 ${rel}/output/capcut/render.log 裡 [檔名] 開頭的幾行，修好後同一個指令再跑一次` : `✓ ${state.made.length} 支都好了${state.skipped.length ? `（${state.skipped.length} 支沒變、略過）` : ''}`);
  say(`→ 清單：${rel}/output/capcut/清單.md（照「放在」排進剪映）、字幕：${rel}/output/capcut/字幕.srt`);
  return state.failed.length ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main().then((c) => { process.exitCode = c; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
}

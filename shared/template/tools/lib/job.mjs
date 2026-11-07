// 背景工作：長時間的步驟放到背景跑，前景最多等 waitSec 秒。agent 的 shell 逾時或被砍都不影響背景工作，
// 再跑一次同一條指令會接著等，不會重跑（長片的 whisper、初剪、render 都可能超過 shell 的逾時）。零依賴。
//
//   runJob({ project, name, argv, run, waitSec, log, again, retryFailed })
//     父行程（agent 下的指令）：工作沒在跑就開背景子行程，接著等它；已經在跑就接著等。回傳 exit code：
//       0 做完、1 失敗、STILL_RUNNING（75）還在跑（已印「再跑一次同一條指令會接著等」）
//     again：不管上次的結果，一律重新開始。retryFailed：上次失敗了就重新開始（使用者明說要重來，例 --again）
//     上次做完、結果還沒印：參數相同才交代那個結果（前景被砍後再跑一次同一條）；參數不同是新的要求，重新開始
//     重新開始之前會收掉上一次留下的行程（工作行程被砍時，它開的 ffmpeg、auto-editor 不會跟著走，留著會和新的一起寫同一個檔）
//     子行程（環境變數 AUTO_EDIT_JOB=<name>）：直接呼叫 run()，stdout／stderr 寫進 log；回傳 run() 的 exit code
//   jobState(project, name)   → { name, pid, state: 'running'|'done'|'failed'|'none', code, startedAt, finishedAt, reported, logFile }
//   jobLog(project, name)     → log 全文（沒有就是空字串）
//   isJobChild(name)          → 目前是不是這個工作的子行程
//   clearJob(project, name)   → 清掉紀錄（下一次重新開始）
//
// 檔案：work/.jobs/<name>.json（狀態）、work/.jobs/<name>.log（輸出）、work/.jobs/<name>.starting（開工的鎖，同時多條指令只開一個）。
// 子行程結束才寫 done／failed；子行程被砍（pid 不在了、狀態還是 running）或 pid 被別的程式重用（當機、重開機後）都算 failed。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export const STILL_RUNNING = 75;
const ENV = 'AUTO_EDIT_JOB';
export const DEFAULT_WAIT = 540;   // 9 分鐘：比常見的 shell 逾時（10 分鐘）短一點

const dirOf = (project) => path.join(project, 'work', '.jobs');
const stateFile = (project, name) => path.join(dirOf(project), `${name}.json`);
const logFile = (project, name) => path.join(dirOf(project), `${name}.log`);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeState(project, name, st) {
  fs.mkdirSync(dirOf(project), { recursive: true });
  const f = stateFile(project, name), tmp = `${f}.${process.pid}.tmp`;   // 父子行程都會寫：暫存檔各用各的
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2));
  fs.renameSync(tmp, f);
}

// 這個 pid 還是當初開的工作行程嗎：當機、重開機後 pid 可能被別的程式重用，只看活不活會一直等下去。比命令列有沒有那支工具（Windows 沒有 ps，不比）
const verified = new Set();
function isOurs(st) {
  const script = st.argv?.[0];
  if (!script || st.pid === process.pid || process.platform === 'win32') return true;
  const key = `${st.pid}:${st.startedAt}`;
  if (verified.has(key)) return true;
  const r = spawnSync('ps', ['-o', 'command=', '-p', String(st.pid)], { encoding: 'utf8' });
  if (r.error) return true;
  const ok = String(r.stdout).includes(path.basename(script));
  if (ok) verified.add(key);
  return ok;
}

export function jobState(project, name) {
  let st;
  try { st = JSON.parse(fs.readFileSync(stateFile(project, name), 'utf8')); } catch { return { name, state: 'none', logFile: logFile(project, name) }; }
  if (st.state === 'running' && st.pid) {
    if (!alive(st.pid)) st = { ...st, state: 'failed', code: st.code ?? 1, died: true };
    else if (!isOurs(st)) st = { ...st, state: 'failed', code: st.code ?? 1, died: true, reused: true };
  }
  return { ...st, logFile: logFile(project, name) };
}

export function jobLog(project, name) {
  try { return fs.readFileSync(logFile(project, name), 'utf8'); } catch { return ''; }
}

export const isJobChild = (name) => process.env[ENV] === name;

export function clearJob(project, name) {
  for (const f of [stateFile(project, name), logFile(project, name)]) { try { fs.unlinkSync(f); } catch { /* 本來就沒有 */ } }
}

// 上一個工作行程已經不在，但它開的 ffmpeg、auto-editor 可能還活著（子行程和它同一個 process group，爸爸死了 group 還在）：
// 不收的話新舊兩邊搶 CPU，寫同一個檔還會把檔案寫壞。pid 還活著（被別的程式重用）就不是這個 group，不動
async function reapOrphans(st, log = () => {}) {
  if (!st?.pid || st.reused || process.platform === 'win32' || alive(st.pid)) return;
  const groupAlive = () => { try { process.kill(-st.pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  if (!groupAlive()) return;
  log(`（收掉上一次 ${st.name || '工作'} 留下的行程）`);
  try { process.kill(-st.pid, 'SIGTERM'); } catch { return; }
  for (let i = 0; i < 30 && groupAlive(); i++) await sleep(100);
  if (groupAlive()) { try { process.kill(-st.pid, 'SIGKILL'); } catch { /* 已經走了 */ } }
}

// 開工的鎖：幾條指令同時下（子代理、重試）時，判斷「沒在跑」到寫好狀態之間只有一條能進來。主人死了或卡太久就當沒有
async function startLock(project, name) {
  const f = path.join(dirOf(project), `${name}.starting`);
  fs.mkdirSync(dirOf(project), { recursive: true });
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    try {
      const fd = fs.openSync(f, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => { try { fs.unlinkSync(f); } catch { /* 已經沒了 */ } };
    } catch (e) {
      if (e.code !== 'EEXIST') return () => {};
      let holder = 0, age = 0;
      try { holder = Number(fs.readFileSync(f, 'utf8')); age = Date.now() - fs.statSync(f).mtimeMs; } catch { continue; }
      if ((holder && !alive(holder)) || age > 10000) { try { fs.unlinkSync(f); } catch { /* 別人清了 */ } continue; }
      await sleep(30);
    }
  }
  return () => {};
}

// 參數一樣嗎：--wait、--said 不算（前景等多久、記哪句原話，都還是同一件事）；沒有紀錄（舊的狀態檔）當一樣
function sameRun(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return true;
  const norm = (argv) => { const out = []; for (let i = 0; i < argv.length; i++) { const x = String(argv[i]); if (x === '--wait' || x === '--said') { i++; continue; } if (x.startsWith('--wait=') || x.startsWith('--said=')) continue; out.push(x); } return out.join('\0'); };
  return norm(a) === norm(b);
}

// 開背景子行程：同一支工具、同樣的參數，靠環境變數知道自己是子行程
function startChild({ project, name, argv, cwd, env }) {
  fs.mkdirSync(dirOf(project), { recursive: true });
  const fd = fs.openSync(logFile(project, name), 'w');
  const child = spawn(process.execPath, argv, { cwd: cwd || process.cwd(), detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, ...env, [ENV]: name }, windowsHide: true });
  child.unref();
  fs.closeSync(fd);
  writeState(project, name, { name, pid: child.pid, state: 'running', startedAt: Date.now(), argv });
  return child.pid;
}

// 從 offset 起印 log 的新內容，回傳新的 offset（前景看得到進度，又不會把全文重印一次）
function printNew(project, name, offset, log) {
  const text = jobLog(project, name);
  const buf = Buffer.from(text);
  if (buf.length > offset) {
    const piece = buf.subarray(offset).toString();
    if (piece.trim()) log(piece.replace(/\n$/, ''));
  }
  return Math.max(offset, buf.length);
}

// run：子行程要做的事，回傳 exit code。waitSec＝0：開了就回（不等）
export async function runJob({ project, name, argv = process.argv.slice(1), run, waitSec = DEFAULT_WAIT, log = console.log, env = {}, again = false, retryFailed = false, cwd, pollMs = 1000 }) {
  if (isJobChild(name)) {
    let code = 1;
    try { code = (await run()) ?? 0; } catch (e) { console.log(`✖ ${e.message}`); code = 1; }
    const st = jobState(project, name);
    writeState(project, name, { ...st, state: code === 0 ? 'done' : 'failed', code, finishedAt: Date.now(), reported: false, logFile: undefined });
    return code;
  }
  const release = await startLock(project, name);
  let st;
  try {
    st = jobState(project, name);
    // 上次做完、結果還沒印出來（等的那個行程先被砍了）：同一條指令就把結果交代，不重跑。
    // 參數不一樣是新的要求（例：換了 --edit）；失敗又帶 --again 是明說要重來：這兩種要真的重新開始，不能印舊的就算了
    if (!again && (st.state === 'done' || st.state === 'failed') && st.reported === false && !st.died) {
      const fresh = !sameRun(st.argv, argv), retry = retryFailed && st.state === 'failed';
      if (!fresh && !retry) {
        log(jobLog(project, name).replace(/\n$/, ''));
        writeState(project, name, { ...st, reported: true, logFile: undefined });
        return st.code ?? (st.state === 'done' ? 0 : 1);
      }
      const why = jobLog(project, name).split(/\r?\n/).filter((l) => l.startsWith('✖')).pop();
      log(`（上一次的 ${name} ${st.state === 'done' ? '做完了' : `失敗了${why ? `：${why.replace(/^✖\s*/, '').slice(0, 160)}` : ''}`}，結果沒印出來；這次${fresh ? '參數不同' : '明說要重來'}，重新開始）`);
    }
    if (st.state === 'running') log(`（${name} 已經在背景跑了，接著等）`);
    else {
      await reapOrphans(st, log);
      startChild({ project, name, argv, cwd, env });
      log(`（${name} 在背景跑，log：${path.relative(process.cwd(), logFile(project, name))}）`);
    }
  } finally { release(); }
  let offset = 0;
  if (waitSec <= 0) return STILL_RUNNING;
  const until = Date.now() + waitSec * 1000;
  for (;;) {
    offset = printNew(project, name, offset, log);
    st = jobState(project, name);
    if (st.state === 'done' || st.state === 'failed') {
      offset = printNew(project, name, offset, log);
      if (st.died) log(`✖ ${name} 中途被結束了（pid ${st.pid}）→ 再跑一次同一條指令會從頭做`);
      writeState(project, name, { ...st, reported: true, logFile: undefined });
      if (st.died) { await reapOrphans(st, log); clearJob(project, name); }
      return st.code ?? (st.state === 'done' ? 0 : 1);
    }
    if (Date.now() >= until) {
      log(`\n⏳ ${name} 還在跑（已經 ${Math.round((Date.now() - st.startedAt) / 1000)} 秒，背景繼續，不用重開）`);
      log('→ 下一步：再跑一次同一條指令會接著等，不會重跑');
      return STILL_RUNNING;
    }
    await sleep(pollMs);
  }
}

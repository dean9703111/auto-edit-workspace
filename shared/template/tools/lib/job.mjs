// 背景工作：長時間的步驟放到背景跑，前景最多等 waitSec 秒。agent 的 shell 逾時或被砍都不影響背景工作，
// 再跑一次同一條指令會接著等，不會重跑（長片的 whisper、初剪、render 都可能超過 shell 的逾時）。零依賴。
//
//   runJob({ project, name, argv, run, waitSec, log })
//     父行程（agent 下的指令）：工作沒在跑就開背景子行程，接著等它；已經在跑就接著等。回傳 exit code：
//       0 做完、1 失敗、STILL_RUNNING（75）還在跑（已印「再跑一次同一條指令會接著等」）
//     子行程（環境變數 AUTO_EDIT_JOB=<name>）：直接呼叫 run()，stdout／stderr 寫進 log；回傳 run() 的 exit code
//   jobState(project, name)   → { name, pid, state: 'running'|'done'|'failed'|'none', code, startedAt, finishedAt, reported, logFile }
//   jobLog(project, name)     → log 全文（沒有就是空字串）
//   isJobChild(name)          → 目前是不是這個工作的子行程
//   clearJob(project, name)   → 清掉紀錄（下一次重新開始）
//
// 檔案：work/.jobs/<name>.json（狀態）、work/.jobs/<name>.log（輸出）。子行程結束才寫 done／failed；
// 子行程被砍（pid 不在了、狀態還是 running）算 failed。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

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
  const f = stateFile(project, name);
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(st, null, 2));
  fs.renameSync(`${f}.tmp`, f);
}

export function jobState(project, name) {
  let st;
  try { st = JSON.parse(fs.readFileSync(stateFile(project, name), 'utf8')); } catch { return { name, state: 'none', logFile: logFile(project, name) }; }
  if (st.state === 'running' && st.pid && !alive(st.pid)) st = { ...st, state: 'failed', code: st.code ?? 1, died: true };
  return { ...st, logFile: logFile(project, name) };
}

export function jobLog(project, name) {
  try { return fs.readFileSync(logFile(project, name), 'utf8'); } catch { return ''; }
}

export const isJobChild = (name) => process.env[ENV] === name;

export function clearJob(project, name) {
  for (const f of [stateFile(project, name), logFile(project, name)]) { try { fs.unlinkSync(f); } catch { /* 本來就沒有 */ } }
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
export async function runJob({ project, name, argv = process.argv.slice(1), run, waitSec = DEFAULT_WAIT, log = console.log, env = {}, again = false, cwd, pollMs = 1000 }) {
  if (isJobChild(name)) {
    let code = 1;
    try { code = (await run()) ?? 0; } catch (e) { console.log(`✖ ${e.message}`); code = 1; }
    const st = jobState(project, name);
    writeState(project, name, { ...st, state: code === 0 ? 'done' : 'failed', code, finishedAt: Date.now(), reported: false, logFile: undefined });
    return code;
  }
  let st = jobState(project, name);
  // 上次做完、結果還沒印出來（等的那個行程先被砍了）：先把結果交代，不重跑
  if (!again && (st.state === 'done' || st.state === 'failed') && st.reported === false && !st.died) {
    log(jobLog(project, name).replace(/\n$/, ''));
    writeState(project, name, { ...st, reported: true, logFile: undefined });
    return st.code ?? (st.state === 'done' ? 0 : 1);
  }
  let offset = 0;
  if (st.state === 'running') log(`（${name} 已經在背景跑了，接著等）`);
  else {
    const fullArgv = argv.length && path.isAbsolute(argv[0]) ? argv : argv;
    startChild({ project, name, argv: fullArgv, cwd, env });
    log(`（${name} 在背景跑，log：${path.relative(process.cwd(), logFile(project, name))}）`);
  }
  if (waitSec <= 0) return STILL_RUNNING;
  const until = Date.now() + waitSec * 1000;
  for (;;) {
    offset = printNew(project, name, offset, log);
    st = jobState(project, name);
    if (st.state === 'done' || st.state === 'failed') {
      offset = printNew(project, name, offset, log);
      if (st.died) log(`✖ ${name} 中途被結束了（pid ${st.pid}）→ 再跑一次同一條指令會從頭做`);
      writeState(project, name, { ...st, reported: true, logFile: undefined });
      if (st.died) clearJob(project, name);
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

// 非同步跑外部程式（背景工作裡同時跑 ffmpeg、whisper、auto-editor 用；同步版在 ff.mjs 的 run）。零依賴。
//
//   spawnP(cmd, args, { env, cwd, binary, tail, onSpawn }) → Promise<{ status, signal, stdout, stderr, error }>
//     找不到指令時不丟例外，放在 error（呼叫端決定怎麼說）；binary：stdout 回 Buffer；tail：stderr 只留最後幾個字（whisper 的進度很長）
//   limiter(n)  → run(fn)：同時最多 n 個，其他排隊（fn 回傳 Promise）
//   JOBS        → 同時跑幾個 ffmpeg：留兩個核心給其他工作，2–8 個
import os from 'node:os';
import { spawn } from 'node:child_process';

const cores = () => (typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length) || 2;
export const JOBS = Math.max(2, Math.min(8, cores() - 2));

export function limiter(n = JOBS) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, res, rej } = queue.shift();
    Promise.resolve().then(fn).then(res, rej).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((res, rej) => { queue.push({ fn, res, rej }); next(); });
}

export function spawnP(cmd, args, { env, cwd, binary = false, tail = 0, onSpawn = null, shell = false } = {}) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell }); } catch (error) { resolve({ status: null, signal: null, stdout: binary ? Buffer.alloc(0) : '', stderr: '', error }); return; }
    const out = [];
    let err = Buffer.alloc(0), error = null;
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { err = Buffer.concat([err, d]); if (tail && err.length > tail * 2) err = err.subarray(err.length - tail); });
    child.on('error', (e) => { error = e; });
    child.on('close', (status, signal) => {
      const so = Buffer.concat(out);
      resolve({ status, signal, stdout: binary ? so : so.toString(), stderr: err.toString(), error });
    });
    if (onSpawn) onSpawn(child);
  });
}

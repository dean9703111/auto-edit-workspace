// Windows：背景跑的剪輯台、背景工作（detached）沒有自己的主控台，它直接叫的命令列程式（ffprobe、ffmpeg、npx…）
// 每叫一次就跳出一個新的黑色主控台視窗，一閃就關（作者：「一直有閃動」「感覺是某個背景程式在執行」；封面台每 2.5 秒看一次狀態，每次都叫 ffprobe）。
// 在這種行程裡把 child_process 的預設改成 windowsHide: true：Node 的 syncBuiltinESMExports() 讓已經 import 的 { spawn, spawnSync, … } 也換成新的，
// 各支工具不用一支一支改。已經寫了 windowsHide 的照它寫的；在終端機裡跑的工具共用那個主控台，不會閃，不用呼叫。
//
//   hideChildWindows({ platform })   → true＝這一次換好了；不是 Windows、已經換過回 false
//   withHide(kind, args)             → 加好 windowsHide 的參數（純函式，測試用）
import cp from 'node:child_process';
import util from 'node:util';
import { syncBuiltinESMExports } from 'node:module';

const opts = (o) => (o && typeof o === 'object' ? ('windowsHide' in o ? o : { ...o, windowsHide: true }) : { windowsHide: true });

// spawn／spawnSync／execFile／execFileSync：(file, args?, options?, callback?)；exec／execSync：(command, options?, callback?)
export function withHide(kind, args) {
  const [cmd, ...more] = args;
  const cb = typeof more.at(-1) === 'function' ? more.pop() : undefined;   // 最後一個是回呼就先拿出來，最後放回去
  const tail = cb ? [cb] : [];
  if (kind === 'exec') return [cmd, opts(more[0]), ...tail];                // (command, options?, callback?)
  const list = Array.isArray(more[0]) ? more.shift() : [];                  // (file, args?, options?, callback?)
  return [cmd, list, opts(more[0]), ...tail];
}

let done = false;
export function hideChildWindows({ platform = process.platform } = {}) {
  if (platform !== 'win32' || done) return false;
  done = true;
  for (const [name, kind] of [['spawn', 'file'], ['spawnSync', 'file'], ['execFile', 'file'], ['execFileSync', 'file'], ['exec', 'exec'], ['execSync', 'exec']]) {
    const orig = cp[name];
    const wrapped = function (...args) { return orig.apply(this, withHide(kind, args)); };
    if (orig[util.promisify.custom]) wrapped[util.promisify.custom] = (...args) => orig[util.promisify.custom](...withHide(kind, args));
    cp[name] = wrapped;
  }
  syncBuiltinESMExports();
  return true;
}

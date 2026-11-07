// 寫檔不留半個檔：先寫暫存檔（檔名帶 pid）再換名。plan.json、字幕、剪輯清單、製作進度是資料本體，磁碟滿、中途被砍都不能把舊內容弄壞。零依賴。
//
//   writeAtomic(file, text)               寫完才換上；失敗舊檔不動、不留暫存
//   rewriteIfSame(file, before, text)     別的行程可能正在存這個檔（子代理改動畫檔）：換上前再讀一次，內容變了就不寫，回傳 false
//   withLock(dir, fn)                     同一台電腦的行程之間互斥（mkdir 拿鎖，主人死了或卡太久就當沒有）
import fs from 'node:fs';
import path from 'node:path';

const tmpOf = (file) => path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function replace(tmp, file) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      // Windows：別的程式剛好開著這個檔
      if (process.platform !== 'win32' || i >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) { fs.rmSync(tmp, { force: true }); throw e; }
      wait(100);
    }
  }
}

export function writeAtomic(file, text) {
  const tmp = tmpOf(file);
  try { fs.writeFileSync(tmp, text); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  replace(tmp, file);
}

export function rewriteIfSame(file, before, text) {
  const tmp = tmpOf(file);
  try { fs.writeFileSync(tmp, text); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  let now = null;
  try { now = fs.readFileSync(file, 'utf8'); } catch { /* 被刪了 */ }
  if (now !== before) { fs.rmSync(tmp, { force: true }); return false; }
  replace(tmp, file);
  return true;
}

export function withLock(dir, fn, { timeoutMs = 5000, staleMs = 10000 } = {}) {
  const until = Date.now() + timeoutMs;
  let got = false;
  while (Date.now() < until) {
    try { fs.mkdirSync(dir); got = true; break; } catch (e) {
      if (e.code !== 'EEXIST') break;
      try { if (Date.now() - fs.statSync(dir).mtimeMs > staleMs) { fs.rmdirSync(dir); continue; } } catch { continue; }
      wait(5);
    }
  }
  try { return fn(); } finally { if (got) { try { fs.rmdirSync(dir); } catch { /* 別人清了 */ } } }
}

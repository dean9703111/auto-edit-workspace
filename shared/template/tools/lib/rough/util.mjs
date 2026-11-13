// media.mjs 各段共用的小工具（032 C9：從 media.mjs 搬過來）
import path from 'node:path';
import fs from 'node:fs';
import { r3, clock1, clock2 } from '../time.mjs';

export { r3 };
export const rel = (p) => path.relative(process.cwd(), p) || '.';
export const posix = (p) => p.split(path.sep).join('/');
export const fmtT = clock1;
export const natural = (a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true, sensitivity: 'base' });

export const listFiles = (dir, exts) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.') && exts.includes(path.extname(f).toLowerCase())).sort(natural) : []);
export const fmtC = clock2;
export const posixRel = (p) => posix(rel(p));

const stampNow = (now) => { const p2 = (n) => String(n).padStart(2, '0'); return `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`; };
export function backupPath(file, now, tag = 'bak') {
  const ts = stampNow(now);
  let b = `${file}.${tag}-${ts}`;
  for (let k = 2; fs.existsSync(b); k++) b = `${file}.${tag}-${ts}-${k}`;
  return b;
}
export const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

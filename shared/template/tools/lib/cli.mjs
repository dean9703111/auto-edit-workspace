// 指令列參數的共用寫法：每支工具的 parseArgs 都用這幾個，行為才會一樣。零依賴。
//   splitFlag('--said=a=b')            → ['said', 'a=b']（只在第一個 = 切；沒有 = 時第二個是 undefined）
//   valueOf(argv, i, key, inline)      → [值, 新的 i]；缺值、或下一個是另一個旗標就丟錯
//   oneOf(flags, modes)                → 開著的那個模式（沒有＝null）；開了兩個以上丟錯
//   saidOf(flags)                      → 使用者原話：--said 和 --say 都收
//   isMain(import.meta.url)            → 這支檔是不是被直接執行（用 realpath 比，經 symlink 執行也算）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function splitFlag(a) {
  const s = String(a).replace(/^--/, '');
  const i = s.indexOf('=');
  return i < 0 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1)];
}

export function valueOf(argv, i, key, inline) {
  if (inline !== undefined) return [inline, i];
  const v = argv[i + 1];
  if (v == null || String(v).startsWith('--')) throw new Error(`--${key} 後面要接值`);
  return [v, i + 1];
}

export function oneOf(flags, modes) {
  const on = modes.filter((m) => flags[m] != null && flags[m] !== false);
  if (on.length > 1) throw new Error(`--${on[0]} 和 --${on[1]} 不能一起用 → 一次跑一個`);
  return on[0] || null;
}

export const saidOf = (flags) => flags.said ?? flags.say ?? '';

export function isMain(metaUrl) {
  try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(metaUrl)); } catch { return false; }
}

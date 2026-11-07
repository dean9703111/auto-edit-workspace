// 讀講稿：UTF-8（有沒有 BOM 都可以）、UTF-16（要有 BOM）。其他編碼（舊版記事本的 Big5、ANSI）當 UTF-8 讀會全變亂碼、字幕也跟著亂碼，直接丟錯。零依賴。
import fs from 'node:fs';
import path from 'node:path';

export function readScript(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2, 2 + ((buf.length - 2) & ~1)).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1))).swap16().toString('utf16le');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch {
    throw new Error(`${path.basename(file)} 不是 UTF-8（多半是 Big5 或 ANSI，當 UTF-8 讀字幕會變亂碼）→ 用編輯器另存新檔、編碼選 UTF-8，再跑一次`);
  }
}

// 分鏡表（work/storyboard.md）有沒有還沒套回 plan.json 的改動。零依賴。
// 工具自己寫完分鏡表就記內容雜湊（work/hyperframes/.cache/storyboard.json）；之後內容不一樣＝網頁或手動改過。
// --storyboard、--review、deliver 都看這裡，不然使用者在網頁改的字會靜靜地不見（--apply-storyboard 才會套回 plan.json）。
//
//   sbHash(text)                 內容雜湊
//   storyboardDirty(P)           分鏡表有改動還沒套回（沒有分鏡表、沒有紀錄的舊專案都算沒有）
//   recordStoryboard(P, text, { at })   記「這份是工具寫的／套回過的」；at 不給就用現在
//   markStoryboardWritten(P, text)      回饋輪（versions.mjs accept／use）改寫分鏡表時用：只更新雜湊，時間不動；還沒有紀錄就不建
import fs from 'node:fs';
import path from 'node:path';

const stateFile = (P) => path.join(P.out, '.cache', 'storyboard.json');
const storyFile = (P) => path.join(P.project, 'work', 'storyboard.md');
const readState = (P) => { try { return JSON.parse(fs.readFileSync(stateFile(P), 'utf8')); } catch { return null; } };

export const sbHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return String(h); };

export function storyboardDirty(P) {
  if (!P?.project || !P.out) return false;
  const last = readState(P);
  if (!last?.hash) return false;
  let text;
  try { text = fs.readFileSync(storyFile(P), 'utf8'); } catch { return false; }
  return sbHash(text) !== last.hash;
}

export function recordStoryboard(P, text, { at = Date.now() } = {}) {
  fs.mkdirSync(path.dirname(stateFile(P)), { recursive: true });
  fs.writeFileSync(stateFile(P), JSON.stringify({ hash: sbHash(text), at }));
}

export function markStoryboardWritten(P, text) {
  const last = P?.out ? readState(P) : null;
  if (last?.hash) recordStoryboard(P, text, { at: last.at });
}

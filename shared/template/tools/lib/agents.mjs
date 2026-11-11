// 子代理一次最多派幾個（零依賴）：shared/設定.json 的 agents（不進版控，每個人本機各一份；沒有這個檔就是 10）
// 各家工具的上限不一樣、分份切小之後份數變多，所以讓使用者自己定：node shared/template/tools/status.mjs --agents <N>
//   agentLimit(sharedDir)        → 1–16 的整數（檔案不在、格式不對都回 10）
//   saveAgentLimit(sharedDir, n) → { n, file }；n 不是 1–16 的整數就丟錯
import fs from 'node:fs';
import path from 'node:path';

export const AGENTS_DEFAULT = 10;
export const AGENTS_MAX = 16;
export const SETTINGS_FILE = '設定.json';
export const AGENTS_CMD = 'node shared/template/tools/status.mjs --agents <N>';
const ok = (n) => Number.isInteger(n) && n >= 1 && n <= AGENTS_MAX;
const read = (file) => { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; } };

export function agentLimit(sharedDir) {
  const n = read(path.join(sharedDir, SETTINGS_FILE)).agents;
  return ok(n) ? n : AGENTS_DEFAULT;
}

export function saveAgentLimit(sharedDir, value) {
  const n = Number(value);
  if (!ok(n)) throw new Error(`--agents 要寫 1–${AGENTS_MAX} 的整數（現在是「${value}」）；1＝一次只派一個`);
  const file = path.join(sharedDir, SETTINGS_FILE);
  fs.writeFileSync(file, `${JSON.stringify({ ...read(file), agents: n }, null, 2)}\n`);
  return { n, file };
}

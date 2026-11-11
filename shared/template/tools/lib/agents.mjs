// 子代理一次最多派幾個（零依賴）：shared/setting.json 的 agents（lib/settings.mjs；沒有設定就是 10）
// 各家工具的上限不一樣、分份切小之後份數變多，所以讓使用者自己定：node shared/template/tools/status.mjs --agents <N>
//   agentLimit(sharedDir)        → 1–16 的整數（沒設定、格式不對都回 10）
//   saveAgentLimit(sharedDir, n) → { n, file }；n 不是 1–16 的整數就丟錯
import { readSettings, writeSetting, SETTINGS_FILE } from './settings.mjs';

export { SETTINGS_FILE };
export const AGENTS_DEFAULT = 10;
export const AGENTS_MAX = 16;
export const AGENTS_CMD = 'node shared/template/tools/status.mjs --agents <N>';
const ok = (n) => Number.isInteger(n) && n >= 1 && n <= AGENTS_MAX;

export function agentLimit(sharedDir) {
  const n = readSettings(sharedDir).data.agents;
  return ok(n) ? n : AGENTS_DEFAULT;
}

export function saveAgentLimit(sharedDir, value) {
  const n = Number(value);
  if (!ok(n)) throw new Error(`--agents 要寫 1–${AGENTS_MAX} 的整數（現在是「${value}」）；1＝一次只派一個`);
  return { n, file: writeSetting(sharedDir, 'agents', n) };
}

// 同一件事連續沒過幾次，由工具數（AI 不用自己數工具呼叫）。一個 key 一個檔：平行的子代理各寫各的，不會互相蓋掉次數。零依賴。
//   bumpTry(dir, key)            → 這是第幾次（寫回去）
//   readTry(dir, key)            → 目前幾次（沒有＝0）
//   resetTry(dir, keys)          → 真的歸零的那幾個 key
//   mainTry(project, name, ok)   → { n, max, stop }：主代理的指令沒過＋1、過了歸零；到上限 stop＝true（還在跑的結束碼 75 不要呼叫）
//   stopLine(n, what)            → 「→ 停手：…」那一行
import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic } from './atomic.mjs';

const fileOf = (dir, key) => path.join(dir, `${encodeURIComponent(String(key))}.json`);

export function readTry(dir, key) {
  try { return Number(JSON.parse(fs.readFileSync(fileOf(dir, key), 'utf8')).n) || 0; } catch { return 0; }
}

export function bumpTry(dir, key) {
  const n = readTry(dir, key) + 1;
  try { fs.mkdirSync(dir, { recursive: true }); writeAtomic(fileOf(dir, key), JSON.stringify({ n })); } catch { /* 只是提示，不影響檢查 */ }
  return n;
}

export function resetTry(dir, keys) {
  const hit = [];
  for (const k of keys) {
    const f = fileOf(dir, k);
    if (!fs.existsSync(f)) continue;
    try { fs.rmSync(f, { force: true }); hit.push(k); } catch { /* 只是提示，不影響檢查 */ }
  }
  return hit;
}

// 主代理每條指令連續沒過幾次就停手（原本寫在各支 Skill 的「工具呼叫預算」）
export const MAIN_TRY_MAX = Object.freeze({ prep: 4, rough: 4, framing: 4, 'map-merge': 6, 'merge-drafts': 8, storyboard: 6, 'apply-storyboard': 4, review: 6, finish: 6, deliver: 4 });
export const mainTriesDir = (project) => path.join(project, 'work', '.jobs', 'tries');

export function mainTry(project, name, ok) {
  const dir = mainTriesDir(project), key = `main:${name}`, max = MAIN_TRY_MAX[name] ?? 6;
  if (ok) { resetTry(dir, [key]); return { n: 0, max, stop: false }; }
  const n = bumpTry(dir, key);
  return { n, max, stop: n >= max };
}

// 子代理有沒有在動（B5）：每次驗收碰一下，--design-status 用「這次派工之後最後一次碰」判斷，不看檔案的舊時間
export const beatsDir = (project) => path.join(project, 'work', '.jobs', 'beats');
const beatFile = (project, id) => path.join(beatsDir(project), `${encodeURIComponent(String(id))}.json`);
export function touchBeat(project, id, at = Date.now()) {
  try { fs.mkdirSync(beatsDir(project), { recursive: true }); writeAtomic(beatFile(project, id), JSON.stringify({ at })); } catch { /* 只是提示 */ }
  return at;
}
export function lastBeat(project, id) {
  try { return Number(JSON.parse(fs.readFileSync(beatFile(project, id), 'utf8')).at) || 0; } catch { return 0; }
}

export const stopLine = (n, what) => `→ 停手：${what}已經連續 ${n} 次沒過。不要再改，把上面還在的 ✖ 原文回報，說明卡在哪。`;

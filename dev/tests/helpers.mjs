// 測試共用：素材包路徑、載入 lib、字幕與 plan 範本
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// 兩種擺法都能跑：agent-skills 的 video/minimax/素材/tools/template-tests/（工作區在 ../../workspace）、
// 獨立 repo auto-edit-workspace 的 dev/tests/（工作區就是 ../..）
const legacy = path.resolve(here, '..', '..', 'workspace');
export const WORKSPACE = fs.existsSync(path.join(legacy, 'shared', 'template')) ? legacy : path.resolve(here, '..', '..');
export const TEMPLATE = path.join(WORKSPACE, 'shared', 'template');
export const TOOLS = path.join(TEMPLATE, 'tools');
export const imp = (rel) => import(path.join(TOOLS, rel));

const stamp = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

// 12 句、每句 3 秒、句間 0.5 秒（#N 起點＝(N−1)×3.5＋1）
export function makeSrt({ n = 12, eol = '\n' } = {}) {
  const lines = [];
  for (let i = 1; i <= n; i++) {
    const a = (i - 1) * 3.5 + 1, b = a + 3;
    lines.push(`${i}${eol}${stamp(a)} --> ${stamp(b)}${eol}第 ${i} 句字幕內容${eol}`);
  }
  return lines.join(eol);
}
export const cueStart = (n) => (n - 1) * 3.5 + 1;
export const cueEnd = (n) => cueStart(n) + 3;

let libCache = null;
export async function lib() {
  if (!libCache) {
    const { loadLib } = await imp('build.mjs');
    libCache = loadLib(TEMPLATE);
  }
  return libCache;
}

// HyperFrames 的 Chrome（chrome-headless-shell）找得到就回傳路徑，找不到回 null（需要 Chrome 的測試用來 skip）
let chromeCache;
export async function hasChrome() {
  if (chromeCache === undefined) {
    try { chromeCache = (await imp(path.join('lib', 'audit-browser.mjs'))).findChrome(); } catch { chromeCache = null; }
  }
  return chromeCache;
}

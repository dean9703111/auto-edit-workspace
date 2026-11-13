// 測試共用：素材包路徑、載入 lib、字幕與 plan 範本、暫存資料夾、缺工具就略過、同一輪共用的小素材
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.AUTO_EDIT_NO_LOCAL_SFX ??= '1';   // 測試不看本機的自備音效（shared/sfx-local/ 每個人不一樣），結果才不會跟著機器變
const here = path.dirname(fileURLToPath(import.meta.url));
// 兩種擺法都能跑：agent-skills 的 video/minimax/素材/tools/template-tests/（工作區在 ../../workspace）、
// 獨立 repo auto-edit-workspace 的 dev/tests/（工作區就是 ../..）
const legacy = path.resolve(here, '..', '..', 'workspace');
export const WORKSPACE = fs.existsSync(path.join(legacy, 'shared', 'template')) ? legacy : path.resolve(here, '..', '..');
export const TEMPLATE = path.join(WORKSPACE, 'shared', 'template');
export const TOOLS = path.join(TEMPLATE, 'tools');
export const imp = (rel) => import(pathToFileURL(path.join(TOOLS, rel)).href);

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

// 暫存資料夾：這個測試（或 suite）結束就清掉，回傳路徑。t 是 test 的 context；沒有 t.after（suite、檔案最上層）就掛在 node:test 的 after
// （t 給 null 時掛在「正在跑的那一層」：test 裡＝那個 test 結束、檔案最上層＝整個檔跑完；在 before 裡呼叫會在 before 一結束就清，
//   before 開的資料夾照舊 mkdtemp，再在檔案最上層加 after(() => fs.rmSync(…)) 清）
export function tmpDir(t, prefix = 'auto-edit-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const clean = () => fs.rmSync(dir, { recursive: true, force: true });
  if (typeof t?.after === 'function') t.after(clean); else after(clean);
  return dir;
}

// ffmpeg 找不找得到（同一個行程只問一次）
let ffmpegCache;
export function hasFfmpeg() {
  if (ffmpegCache === undefined) ffmpegCache = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  return ffmpegCache;
}

// 缺哪個工具：都有回 false，缺的話回傳略過的理由（給 t.skip、test 的 { skip }）。puppeteer-core 是 hyperframes 順帶裝的，不在 package.json，所以也要問
const NEED = {
  ffmpeg: async () => hasFfmpeg() || '沒有 ffmpeg（setup/ 手冊的 M5／W5）',
  chrome: async () => Boolean(await hasChrome()) || '找不到 HyperFrames 的 Chrome（先跑 npx hyperframes browser ensure）',
  puppeteer: async () => import('puppeteer-core').then(() => true, () => '沒有 puppeteer-core（在工作區根目錄 npm install，跟 hyperframes 一起裝）'),
};
export async function missingTools(...what) {
  for (const w of what) {
    if (!NEED[w]) throw new Error(`missingTools：不認得「${w}」→ 只能寫 ${Object.keys(NEED).join('、')}`);
    const r = await NEED[w]();
    if (r !== true) return r;
  }
  return false;
}

// 測試開頭用：缺工具就 t.skip（理由會出現在報告）並回傳 false。用法：if (!(await needs(t, 'ffmpeg'))) return;
export async function needs(t, ...what) {
  const why = await missingTools(...what);
  if (why) t.skip(why);
  return !why;
}

// 整個檔都要某些工具時：缺的話回傳一個每個都 skip 的 test，不缺就是原本的 test（測試內容不用動）
export function skipAll(test, why) {
  if (!why) return test;
  return (name, opts, fn) => test(name, { ...(opts && typeof opts === 'object' ? opts : {}), skip: why }, typeof opts === 'function' ? opts : fn);
}

// 同一輪共用的小素材：第一次要時用 make(檔案路徑) 產生（例：spawnSync ffmpeg 的 lavfi），之後直接回傳同一個檔。
// 放在 os.tmpdir() 下以行程編號命名的資料夾，行程結束清掉；make 沒有產生檔案就丟錯，訊息附 make 的回傳值
let fixtureDir = null;
export function fixture(name, make) {
  if (!fixtureDir) {
    fixtureDir = path.join(os.tmpdir(), `auto-edit-fixtures-${process.pid}`);
    fs.mkdirSync(fixtureDir, { recursive: true });
    const dir = fixtureDir;
    process.once('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  }
  const file = path.join(fixtureDir, name);
  if (!fs.existsSync(file)) {
    const r = make(file);
    if (!fs.existsSync(file)) throw new Error(`fixture「${name}」沒有產生出來：${String(r?.stderr ?? r ?? '').slice(-300)}`);
  }
  return file;
}

// 工作區釘住的 HyperFrames：根目錄 package.json 釘版本，npm install 裝到 node_modules/hyperframes。
// render、snapshot、audit 的 runtime、剪輯台的播放器都只用這一份，不去 npx 快取挑「最新版」（快取裡常有別的版本）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const HF_MISSING = '找不到工作區的 HyperFrames（node_modules/hyperframes）→ 在工作區根目錄跑 npm install';

// { dir, version, cli }；沒裝回傳 null
export function hfLocal(root = WS_ROOT) {
  const dir = path.join(root, 'node_modules', 'hyperframes');
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { return null; }
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.hyperframes;
  return { dir, version: pkg.version, cli: bin ? path.join(dir, bin) : null };
}

// 跑工作區那一版 CLI 的參數：spawnSync(process.execPath, hfArgs([...]))。直接用 node 跑 bin、不經 npx：
// 專案在工作區外面（測試的暫存專案）也不會跑到快取裡的別版，Windows 也不用 shell
export function hfArgs(args, root = WS_ROOT) {
  const hf = hfLocal(root);
  if (!hf?.cli) throw new Error(HF_MISSING);
  return [hf.cli, ...args];
}

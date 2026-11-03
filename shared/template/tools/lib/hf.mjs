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

// 專案在工作區外面（例：外接硬碟，projects/ 底下放捷徑）：npx 從實體路徑往上找不到工作區的 node_modules，會跑到快取裡的別版。
// build 在 work/hyperframes 放 node_modules/.bin/hyperframes（＋Windows 的 .cmd）小腳本指到工作區這一版，
// 文件裡的 (cd projects/<專案>/work/hyperframes && npx hyperframes …) 就照樣用釘住的版本。外接硬碟常是 exFAT，不能用捷徑，所以寫成腳本。
export function hfShim(dir, root = WS_ROOT) {
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const r = real(root), d = real(dir);
  if (d === r || d.startsWith(r + path.sep)) return false;
  const hf = hfLocal(root);
  if (!hf?.cli) return false;
  const bin = path.join(dir, 'node_modules', '.bin');
  fs.mkdirSync(bin, { recursive: true });
  const sh = `#!/bin/sh\n# build.mjs 產生：專案在工作區外面時，npx hyperframes 用工作區釘住的 ${hf.version}\nexec "${process.execPath}" "${hf.cli}" "$@"\n`;
  const cmd = `@echo off\r\nrem build.mjs 產生：專案在工作區外面時，npx hyperframes 用工作區釘住的 ${hf.version}\r\n"${process.execPath}" "${hf.cli}" %*\r\n`;
  let changed = false;
  for (const [f, c] of [['hyperframes', sh], ['hyperframes.cmd', cmd]]) {
    const p = path.join(bin, f);
    if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === c) continue;
    fs.writeFileSync(p, c, { mode: 0o755 });
    changed = true;
  }
  return changed;
}

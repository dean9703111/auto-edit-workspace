// 素材清單（A10）：media.mjs prep 做完時記下 assets/ 底下每個檔和 講稿.md 的大小、修改時間；
// status.mjs 拿來比對：之後的初剪、字幕、分鏡都是照那時候的素材做的，素材被換掉或搬走要提醒。
// 多出來的新檔不算（使用者常先把之後才用得到的素材丟進來）。零依賴。
//   manifestFile(project)   → work/.jobs/assets-manifest.json
//   listAssets(project)     → [{ path: 'assets/camera/a.mp4'（相對專案、/ 分隔）, size, mtimeMs }]
//   writeManifest(project)  → 寫清單，回傳 { file, files }
//   diffManifest(project)   → 沒有清單回 null；否則 { changed: [相對路徑], missing: [相對路徑] }
import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic } from './atomic.mjs';

export const manifestFile = (project) => path.join(project, 'work', '.jobs', 'assets-manifest.json');
const posix = (p) => p.split(path.sep).join('/');
const statOf = (f) => { try { return fs.statSync(f); } catch { return null; } };

// .DS_Store 這類系統檔會自己變，算進來就是誤報：點開頭的檔與資料夾都不看
function walk(dir, out) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const abs = path.join(dir, name), st = statOf(abs);   // statSync 會跟著捷徑（symlink）走
    if (st?.isDirectory()) walk(abs, out);
    else if (st?.isFile()) out.push(abs);
  }
  return out;
}

export function listAssets(project) {
  const files = walk(path.join(project, 'assets'), []);
  const script = path.join(project, '講稿.md');
  if (statOf(script)?.isFile()) files.push(script);
  return files.map((abs) => {
    const st = fs.statSync(abs);
    return { path: posix(path.relative(project, abs)), size: st.size, mtimeMs: Math.round(st.mtimeMs) };
  }).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function writeManifest(project) {
  const files = listAssets(project), file = manifestFile(project);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, `${JSON.stringify({ version: 1, at: Date.now(), files }, null, 1)}\n`);
  return { file, files };
}

export function diffManifest(project) {
  let j;
  try { j = JSON.parse(fs.readFileSync(manifestFile(project), 'utf8')); } catch { return null; }
  if (!Array.isArray(j?.files)) return null;
  const changed = [], missing = [];
  for (const f of j.files) {
    const st = statOf(path.join(project, f.path));
    if (!st?.isFile()) missing.push(f.path);
    else if (st.size !== f.size || Math.round(st.mtimeMs) !== f.mtimeMs) changed.push(f.path);
  }
  return { changed, missing };
}

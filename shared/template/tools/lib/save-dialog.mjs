// 系統的「另存新檔」視窗（影片編輯器的「輸出」用）
// 影片編輯器只開在這台電腦的 127.0.0.1，所以由伺服器跳出 Mac／Windows／Linux 原生的存檔視窗、拿到真正的路徑，
// render 直接寫到那裡（瀏覽器的 showSaveFilePicker 不給路徑，只能先寫進專案再複製一份過去）。
//   pickSavePath({ title, name, dir, ext, filter: [說明, 副檔名] }, { onChild })
//     → { path }（絕對路徑，副檔名補齊）｜{ cancelled: true }；跳不出來就丟錯（呼叫的人改存專案的 output/）
import { spawn } from 'node:child_process';

const MAC = [
  'on run argv',
  'activate',
  'set f to choose file name with prompt (item 1 of argv) default name (item 2 of argv) default location ((POSIX file (item 3 of argv)) as alias)',
  'return POSIX path of f',
  'end run',
];
// 值都從環境變數讀：中文、空白、引號都不用跳脫
const WIN = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding=[Text.Encoding]::UTF8; "
  + '$d=New-Object System.Windows.Forms.SaveFileDialog; $d.Title=$env:AE_SAVE_TITLE; $d.FileName=$env:AE_SAVE_NAME; $d.InitialDirectory=$env:AE_SAVE_DIR; '
  + '$d.Filter=$env:AE_SAVE_FILTER; $d.OverwritePrompt=$true; $d.AddExtension=$true; '
  + '$o=New-Object System.Windows.Forms.Form -Property @{TopMost=$true;ShowInTaskbar=$false}; '
  + "if($d.ShowDialog($o) -eq 'OK'){[Console]::Out.Write($d.FileName)}";

export function saveCommand({ title, name, dir, filter }, platform = process.platform) {
  if (platform === 'darwin') return { cmd: 'osascript', args: [...MAC.flatMap((l) => ['-e', l]), title, name, dir], env: {} };
  if (platform === 'win32') {
    return { cmd: 'powershell.exe', args: ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', WIN],
      env: { AE_SAVE_TITLE: title, AE_SAVE_NAME: name, AE_SAVE_DIR: dir, AE_SAVE_FILTER: `${filter[0]} (*.${filter[1]})|*.${filter[1]}` } };
  }
  return { cmd: 'zenity', args: ['--file-selection', '--save', `--title=${title}`, `--filename=${dir.replace(/\/$/, '')}/${name}`], env: {} };
}

export function withExt(p, ext) { return p.toLowerCase().endsWith(`.${ext}`) ? p : `${p}.${ext}`; }

export function pickSavePath(opts, { onChild = null, platform = process.platform } = {}) {
  const { cmd, args, env } = saveCommand(opts, platform);
  return new Promise((resolve, reject) => {
    let out = '', err = '';
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    onChild?.(child);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? `找不到 ${cmd}` : e.message)));
    child.on('close', (code, signal) => {
      const p = out.trim();
      if (code === 0 && p) return resolve({ path: withExt(p, opts.ext) });
      // 按了取消：Mac 是錯誤 -128、Windows 沒有輸出、zenity 結束碼 1；伺服器關掉時被砍也當取消
      if (signal || (platform === 'darwin' && /-128/.test(err)) || (platform === 'win32' && code === 0) || (platform !== 'darwin' && platform !== 'win32' && code === 1)) return resolve({ cancelled: true });
      reject(new Error(err.trim().split('\n').pop()?.slice(0, 200) || `結束碼 ${code}`));
    });
  });
}

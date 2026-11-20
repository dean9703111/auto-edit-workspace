// 剪輯頁的「輸出完成影片」（019）：流程和判準在 lib/deliver.mjs（和 deliver.mjs 同一份），這裡只有剪輯台的狀態與 API。
// 整支先寫到 work/final-rendering.mp4，成功才換成 output/final.mp4；失敗或取消不動舊檔。
// 預先 render（deliver.mjs --prerender）不算輸出：不擋存檔和重新產生；這裡按「輸出」時內容沒變就直接接手它。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { STEPS, RESOLUTIONS, CAPTIONS, runDeliver, spawnRunner, killTree, newJob, lockHolder, deliverPaths, prerenderInfo, prerenderCanPatch, planCheckJson } from '../../lib/deliver.mjs';

const LOG_TAIL = 6000;
// 整體百分比：四步各佔多少（整支影片佔大部分）；沒有百分比的步驟照經過的時間慢慢往上（est 秒走到約 63%，最多 90%），換到下一步就跳到下一步的起點
const WEIGHT = { build: 10, test: 5, render: 80, qc: 5 };
const EST = { build: 60, test: 20, qc: 30 };

const statOf = (f) => { try { return fs.statSync(f); } catch { return null; } };
const finalPath = (P) => deliverPaths(P.project).final;
const sheetPath = (P) => deliverPaths(P.project).sheet;
const tag = (st) => `${Math.floor(st.mtimeMs).toString(36)}${st.size.toString(36)}`;

export const exportFile = (ctx, name) => (name === 'final.mp4' ? finalPath(ctx.P) : name === 'qc-sheet.jpg' ? sheetPath(ctx.P) : null);
export const exportBusy = (ctx) => !!ctx.exportJob?.running;

function finalInfo(ctx) {
  const P = ctx.P, st = statOf(finalPath(P)), sheet = statOf(sheetPath(P)), plan = statOf(P.plan);
  if (!st) return { exists: false };
  return {
    exists: true, file: path.relative(P.project, finalPath(P)).split(path.sep).join('/'), url: `/output/final.mp4?v=${tag(st)}`, size: st.size,
    sheetUrl: sheet ? `/output/qc-sheet.jpg?v=${tag(sheet)}` : null, stale: !!(plan && plan.mtimeMs > st.mtimeMs + 1),
  };
}

// 剩餘時間：照到目前的速度算（至少走了 1% 才算，太早的估計會差很多）
function etaSeconds(j) {
  const s = j?.pctStart;
  if (!j?.running || j.step !== 'render' || !s || j.percent == null) return null;
  const moved = j.percent - s.p;
  return moved >= 1 ? Math.max(1, Math.round(((Date.now() - s.t) / 1000 / moved) * (100 - j.percent))) : null;
}

// 整體百分比（四步合起來）；只往上走
export function overallPercent(j, now = Date.now()) {
  if (!j) return null;
  if (!j.running) return j.ok ? 100 : j.overall ?? 0;
  if (j.step !== j.seenStep) { j.seenStep = j.step; j.stepAt = now; }
  let done = 0;
  for (const [id] of STEPS) { if (id === j.step) break; done += WEIGHT[id]; }
  const frac = j.step === 'render' ? (j.percent ?? 0) / 100 : Math.min(0.9, 1 - Math.exp(-((now - j.stepAt) / 1000) / EST[j.step]));
  j.overall = Math.max(j.overall ?? 0, Math.min(99, Math.floor(done + WEIGHT[j.step] * frac)));
  return j.overall;
}

export function exportState(ctx) {
  const j = ctx.exportJob;
  const now = j?.finishedAt || Date.now();
  return {
    overall: overallPercent(j), options: j?.options ?? null, choices: { resolution: RESOLUTIONS, captions: CAPTIONS },
    running: !!j?.running, started: !!j, step: j?.step ?? null, steps: STEPS.map(([id, label]) => ({ id, label })), eta: etaSeconds(j),
    percent: j?.percent ?? null, ok: j?.ok ?? null, canceled: !!j?.canceled, message: j?.message ?? '', errors: j?.errors ?? [], warnings: j?.warnings ?? [],
    log: (j?.log ?? '').slice(-LOG_TAIL), seconds: j ? Math.round((now - j.startedAt) / 1000) : 0, final: finalInfo(ctx),
  };
}

export function startExport(ctx, deps, body = {}) {
  if (exportBusy(ctx)) return [409, { error: 'busy', message: '已經在輸出了，等它跑完' }];
  if (ctx.build?.running) return [409, { error: 'building', message: '正在更新預覽，等它跑完再輸出' }];
  if (!statOf(ctx.P.plan)) return [400, { error: 'noplan', message: '還沒有 plan.json，不能輸出 → 請 AI 先做到分鏡表確認' }];
  // 畫面上還是示範人物：先問過使用者（頁面跳確認卡；按「照樣輸出」才帶 confirmSpeaker）
  const gate = deps.speakerGate?.();
  if (gate?.needed && !body?.confirmSpeaker) return [409, { error: 'speaker', message: `講者介紹還是示範人物「${gate.demo}」，先確認再輸出`, speaker: gate }];
  if (Object.values(deps.requestStates?.() || {}).some((s) => s?.state === 'generating')) return [409, { error: 'generating', message: 'AI 正在照修改單修改，等它改完再輸出' }];
  const other = lockHolder(ctx.P);
  if (other && other.pid !== process.pid) return [409, { error: 'busy', message: 'AI 正在背景輸出完成影片，等它跑完（或請 AI 取消）再按' }];
  // 畫素與字幕：頁面選的（不認得的值當成沒選，用預設）
  const resolution = RESOLUTIONS.includes(body?.resolution) ? body.resolution : RESOLUTIONS[0];
  const captions = CAPTIONS.includes(body?.captions) ? body.captions : CAPTIONS[0];
  const job = newJob();
  ctx.exportJob = job;
  const log = (s) => { job.log = (job.log + s).slice(-LOG_TAIL * 4); };
  job.done = runDeliver(ctx.P, job, {
    run: spawnRunner(job), checkJson: () => planCheckJson(ctx.P), ...deps, resolution, captions, by: 'editor', said: '在剪輯台按「輸出完成影片」', say: (s) => log(`${s}\n`),
  }).finally(() => { ctx.report = null; });
  return [200, exportState(ctx)];
}

// 背景先算的完成影片（deliver.mjs --prerender）：頁面要讓使用者知道它在跑、改動大的存檔會讓它白算。fresh＝還用得上：開始之後 plan.json 沒有再被改過，或只改了幾段（跑完自動補上）
export function prerenderState(ctx) {
  const info = prerenderInfo(ctx.P);
  if (!['running', 'done'].includes(info.state)) return { state: 'none' };
  const plan = statOf(ctx.P.plan);
  return { state: info.state, percent: info.percent ?? null, fresh: !plan || !info.startedAt || plan.mtimeMs <= info.startedAt + 1000 || prerenderCanPatch(ctx.P) };
}

// Windows：一次 PowerShell 做完「重用既有視窗 → 選起來 → 帶到前景」。
// 不用 explorer.exe /select 的原因：每按一次會新開一個視窗（重複堆積），而且背景程序開的視窗拿不到前景權杖、使用者看不到。
// 腳本用 COM 列舉檔案總管視窗（Shell.Application.Windows()）找同一個資料夾的視窗：留一個、關掉其餘的，再把檔案選起來；
// 前景用 AttachThreadInput + ALT 授權（Windows 的前景視窗鎖）。腳本內容全英文：PowerShell 讀沒有 BOM 的 .ps1 會當成 ANSI，中文會壞掉。
const REVEAL_PS1 = `param([string]$Path, [string]$Mode = 'reveal')
# Mode=reveal: open the folder in Windows Explorer, reuse the window already on that folder (close the extra ones), select the file, bring it to the foreground.
# Mode=play:   open the video with the default player and bring the player window to the foreground.
$ErrorActionPreference = 'SilentlyContinue'
$log = Join-Path (Split-Path -Parent $PSCommandPath) 'reveal.log'
function Say($m) { try { Add-Content -LiteralPath $log -Value ((Get-Date -Format 'HH:mm:ss') + ' [' + $Mode + '] ' + $m) } catch {} }

if (-not $Path) { Say 'no path'; exit 1 }
if (-not (Test-Path -LiteralPath $Path)) { Say 'missing file'; exit 1 }
$item = Get-Item -LiteralPath $Path
$dir = $item.DirectoryName
$dirKey = $dir.TrimEnd('\\').ToLower()

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class RevealNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  // all visible top level windows (the player opens its own window)
  public static IntPtr[] TopLevel() {
    System.Collections.Generic.List<IntPtr> list = new System.Collections.Generic.List<IntPtr>();
    EnumWindows(delegate(IntPtr h, IntPtr l) { if (IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list.ToArray();
  }
}
"@

# bring a window to the front (Windows locks the foreground for background processes)
function Bring-Front($h) {
  $fg = [RevealNative]::GetForegroundWindow()
  $fgThread = [RevealNative]::GetWindowThreadProcessId($fg, [IntPtr]::Zero)
  $myThread = [RevealNative]::GetCurrentThreadId()
  $attached = $false
  if ($fgThread -ne 0 -and $fgThread -ne $myThread) { [RevealNative]::AttachThreadInput($myThread, $fgThread, $true) | Out-Null; $attached = $true }
  [RevealNative]::ShowWindow($h, 9) | Out-Null
  [RevealNative]::BringWindowToTop($h) | Out-Null
  $ok = [RevealNative]::SetForegroundWindow($h)
  if (-not $ok) {
    [RevealNative]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [RevealNative]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [RevealNative]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x0003) | Out-Null
    [RevealNative]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x0003) | Out-Null
    $ok = [RevealNative]::SetForegroundWindow($h)
  }
  if ($attached) { [RevealNative]::AttachThreadInput($myThread, $fgThread, $false) | Out-Null }
  return $ok
}

function Say-Foreground($h, $label) {
  Start-Sleep -Milliseconds 300
  $now = [RevealNative]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [RevealNative]::GetWindowTextW($now, $sb, 512) | Out-Null
  Say ($label + ' foreground: ' + $sb.ToString() + ' same=' + ($now -eq $h))
}

if ($Mode -eq 'play') {
  # open with the default player, then find the window it opened and bring it to the front
  $saved = 0
  $savedFile = Join-Path (Split-Path -Parent $PSCommandPath) 'player-hwnd.txt'
  try { $saved = [int64](Get-Content -LiteralPath $savedFile -Raw).Trim() } catch { $saved = 0 }
  $before = @{}
  foreach ($w in [RevealNative]::TopLevel()) { $before[[int64]$w] = $true }
  $fgBefore = [RevealNative]::GetForegroundWindow()
  Start-Process -FilePath $Path
  Say 'player launched'
  $target = 0
  for ($i = 0; $i -lt 17; $i++) {
    Start-Sleep -Milliseconds 300
    foreach ($w in [RevealNative]::TopLevel()) {
      if ($before.ContainsKey([int64]$w)) { continue }
      if ($target -eq 0) { $target = $w }
      $sb = New-Object System.Text.StringBuilder 512
      [RevealNative]::GetWindowTextW($w, $sb, 512) | Out-Null
      if ($sb.ToString() -like ('*' + $item.BaseName + '*')) { $target = $w; break }
    }
    if ($target -ne 0) { break }
    # the player was already running: Windows raises the existing window, so the foreground changed
    $fg = [RevealNative]::GetForegroundWindow()
    if ($fg -ne $fgBefore -and -not $before.ContainsKey([int64]$fg)) { $target = $fg; break }
  }
  if ($target -eq 0 -and $saved -ne 0 -and [RevealNative]::IsWindow([IntPtr]$saved)) {
    # the player is single instance: no new window, reuse the one from last time
    $target = [IntPtr]$saved
    Say 'reused the player window from last time'
  }
  if ($target -eq 0) { Say 'the player window was not found (the player was already open and Windows raised it)'; exit 0 }
  $sb = New-Object System.Text.StringBuilder 512
  [RevealNative]::GetWindowTextW($target, $sb, 512) | Out-Null
  Say ('player window: ' + $sb.ToString())
  $ok = Bring-Front $target
  Say-Foreground $target 'player'
  Say ('setfg=' + $ok)
  try { Set-Content -LiteralPath $savedFile -Value ([int64]$target) -NoNewline } catch {}
  exit 0
}

function Get-Matching($shell, $key) {
  $res = @()
  foreach ($w in @($shell.Windows())) {
    try { $u = $w.LocationURL } catch { $u = $null }
    if (-not $u) { continue }
    if (-not $u.StartsWith('file:///')) { continue }
    $p = $u.Substring(8)
    try { $p = [uri]::UnescapeDataString($p) } catch {}
    $p = $p.Replace('/', '\\').TrimEnd('\\').ToLower()
    if ($p -eq $key) { $res += $w }
  }
  return $res
}

$shell = New-Object -ComObject Shell.Application
$wins = @(Get-Matching $shell $dirKey)
Say ('existing windows: ' + $wins.Count)
if ($wins.Count -eq 0) {
  Start-Process -FilePath 'explorer.exe' -ArgumentList ('/select,"{0}"' -f $Path)
  Start-Sleep -Milliseconds 1500
  $wins = @(Get-Matching $shell $dirKey)
  Say ('windows after open: ' + $wins.Count)
}
if ($wins.Count -eq 0) { Say 'no window'; exit 2 }

$keep = $wins[0]
for ($i = 1; $i -lt $wins.Count; $i++) { try { $wins[$i].Quit() } catch {} }

$selected = ''
try {
  $doc = $keep.Document
  $fi = $doc.Folder.ParseName($item.Name)
  if ($fi) { $doc.SelectItem($fi, 1) }
  $sel = @($doc.SelectedItems())
  if ($sel.Count -gt 0) { $selected = $sel[0].Path }
} catch { $selected = 'ERR ' + $_.Exception.Message }
Say ('selected: ' + $selected)

try {
  $h = [IntPtr]$keep.HWND
  $ok = Bring-Front $h
  Say-Foreground $h 'explorer'
  Say ('setfg=' + $ok)
} catch { Say ('fg ERR: ' + $_.Exception.Message) }
exit 0
`;

// 開外部程式（播放／打開資料夾）：spawn 出去就不管了，結果寫在 work/hyperframes/.editor/reveal.log
function spawnExternal(ctx, cmd, args, spawnFn) {
  const note = (s) => {
    try {
      const file = path.join(ctx.editorDir, 'reveal.log');
      const st = statOf(file);
      if (st && st.size > 200 * 1024) fs.writeFileSync(file, `（太長，重來）\n`);
      fs.appendFileSync(file, `${new Date().toISOString()} ${s}\n`);
    } catch { /* 寫不進去就算了 */ }
  };
  note(`spawn ${cmd} ${args.join(' ')}`);
  // Windows：伺服器是背景行程（沒有主控台），PowerShell 在這種情況下 stdio 用 ignore 或 detached 都會「啟動後立刻結束、什麼都沒做」；
  // 改成 pipe 而且不 detached 才會真的執行腳本（mac／linux 維持原本的 detached）。
  const win = process.platform === 'win32';
  const child = spawnFn(cmd, args, win ? { stdio: ['ignore', 'pipe', 'pipe'], detached: false, windowsHide: true } : { stdio: 'ignore', detached: true, windowsHide: true });
  child.on?.('error', (e) => note(`spawn error: ${e?.message || e}`));
  child.stdout?.on?.('data', (d) => note(`stdout: ${String(d).trim().slice(0, 400)}`));
  child.stderr?.on?.('data', (d) => note(`stderr: ${String(d).trim().slice(0, 400)}`));
  child.on?.('exit', (code, sig) => { note(`exit code=${code} sig=${sig}`); child.stdout?.destroy?.(); child.stderr?.destroy?.(); });
  child.unref?.();
}

// Windows 的 PowerShell 腳本（reveal.ps1）：Mode=reveal 打開資料夾並選起來、Mode=play 用預設播放器開影片
function psScript(ctx) {
  const ps = path.join(ctx.editorDir, 'reveal.ps1');
  try {
    fs.mkdirSync(ctx.editorDir, { recursive: true });
    if (!statOf(ps) || fs.readFileSync(ps, 'utf8') !== REVEAL_PS1) fs.writeFileSync(ps, REVEAL_PS1);
  } catch { return null; }
  // 用絕對路徑叫 PowerShell：伺服器是背景程序，PATH 有時候沒有 System32
  const psExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return { cmd: fs.existsSync(psExe) ? psExe : 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps] };
}

// 在 Finder／檔案總管打開完成影片所在的資料夾並選起來（只有本機頁面會呼叫，路徑固定是 output/final.mp4）
export function revealFinal(ctx, { spawnFn = spawn } = {}) {
  const f = finalPath(ctx.P);
  if (!statOf(f)) return [404, { error: 'nofile', message: '還沒有完成影片' }];
  let cmd, args;
  if (process.platform === 'darwin') { cmd = 'open'; args = ['-R', f]; }
  else if (process.platform === 'win32') {
    const s = psScript(ctx);
    if (s) { cmd = s.cmd; args = [...s.args, '-Path', f]; }
    else { cmd = 'explorer'; args = [`/select,${f}`]; }   // 腳本寫不進去就退回舊做法（會新開視窗，但還看得到）
  }
  else { cmd = 'xdg-open'; args = [path.dirname(f)]; }
  spawnExternal(ctx, cmd, args, spawnFn);
  return [200, { ok: true, file: path.relative(ctx.P.project, f).split(path.sep).join('/') }];
}

// 用系統預設播放器開完成影片（不是開網頁分頁）：Windows 用預設程式（媒體播放器等）、mac 用 open、linux 用 xdg-open
export function playFinal(ctx, { spawnFn = spawn } = {}) {
  const f = finalPath(ctx.P);
  if (!statOf(f)) return [404, { error: 'nofile', message: '還沒有完成影片' }];
  let cmd, args;
  if (process.platform === 'win32') {
    const s = psScript(ctx);
    if (s) { cmd = s.cmd; args = [...s.args, '-Mode', 'play', '-Path', f]; }
    else { cmd = 'explorer'; args = [f]; }   // 退而求其次：讓檔案總管用預設程式開
  }
  else if (process.platform === 'darwin') { cmd = 'open'; args = [f]; }
  else { cmd = 'xdg-open'; args = [f]; }
  spawnExternal(ctx, cmd, args, spawnFn);
  return [200, { ok: true, file: path.relative(ctx.P.project, f).split(path.sep).join('/') }];
}

export function cancelExport(ctx) {
  const job = ctx.exportJob;
  if (!job?.running) return [409, { error: 'idle', message: '現在沒有在輸出' }];
  job.canceled = true;
  // render 的 Chrome worker 各自一個 process group，連子孫一起收；等待預先 render 時沒有 child，流程自己會停
  if (job.child?.pid) killTree(job.child.pid).catch(() => {});
  return [200, exportState(ctx)];
}

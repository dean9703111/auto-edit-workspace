# setup/windows-selftest.ps1 - one-off check of the Windows route on a real machine (for the author; NOT part of the install flow).
# Run from the workspace root:  powershell -NoProfile -ExecutionPolicy Bypass -File setup\windows-selftest.ps1
# Or paste this whole file into a PowerShell window opened at the workspace root.
# Installs nothing. Writes one 2-second test wav under %TEMP%. T14 runs "npx --yes hyperframes doctor --json" (may fill the npm cache).
# ASCII only on purpose, so the file needs no BOM. Windows PowerShell 5.1 syntax.
# Each line: [PASS] / [FAIL] / [WARN] / [SKIP] / [INFO]. Paste the whole output back.

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$Tally = @{ PASS = 0; FAIL = 0; WARN = 0; SKIP = 0; INFO = 0 }

function Say([string]$Id, [string]$Result, [string]$Detail) {
    $Tally[$Result] = $Tally[$Result] + 1
    if ($Detail.Length -gt 400) { $Detail = $Detail.Substring(0, 400) + '...' }
    Write-Output ('[' + $Result + '] ' + $Id + '  ' + $Detail)
}

function Run([string]$File, [string]$Arguments, [int]$TimeoutSec, [System.Text.Encoding]$Encoding) {
    $r = @{ Exit = $null; Out = ''; Err = '' }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $File
        $psi.Arguments = $Arguments
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        if ($Encoding) { $psi.StandardOutputEncoding = $Encoding; $psi.StandardErrorEncoding = $Encoding }
        $p = [System.Diagnostics.Process]::Start($psi)
        $o = $p.StandardOutput.ReadToEndAsync()
        $e = $p.StandardError.ReadToEndAsync()
        if (-not $p.WaitForExit($TimeoutSec * 1000)) { try { $p.Kill() } catch { }; $r.Exit = 'timeout'; return $r }
        $r.Exit = $p.ExitCode
        $r.Out = $o.Result
        $r.Err = $e.Result
    } catch {
        $r.Exit = 'error'
        $r.Err = $_.Exception.Message
    }
    return $r
}

function First([string]$Text) {
    foreach ($l in ($Text -split "`r?`n")) { if ($l.Trim()) { return $l.Trim() } }
    return ''
}

function Tail([string]$Text) {
    $ls = @($Text -split "`r?`n" | Where-Object { $_.Trim() })
    if ($ls.Count -eq 0) { return '' }
    return (($ls | Select-Object -Last 3) -join ' / ')
}

$utf8 = New-Object System.Text.UTF8Encoding -ArgumentList $false
$consoleEnc = [Console]::OutputEncoding
$root = (Get-Location).Path
if ($PSScriptRoot) { $root = Split-Path -Parent $PSScriptRoot }
$check = Join-Path $root 'setup\check.ps1'
$envKey = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment' -ErrorAction SilentlyContinue
$arch = 'x64'
if ($envKey -and $envKey.PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' }

Write-Output '=== windows-selftest ==='
Write-Output ('workspace: ' + $root + '   arch: ' + $arch + '   date: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm'))

# ---------- T01 who runs commands (MiniMax Code shell and its flags) ----------
Say 'T01 this PowerShell' 'INFO' ($PSVersionTable.PSVersion.ToString() + ' ' + $PSVersionTable.PSEdition + '  host=' + $Host.Name)
try {
    $me = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $PID)
    $par = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $me.ParentProcessId)
    if ($par) {
        Say 'T01 parent' 'INFO' ($par.Name + ' :: ' + $par.CommandLine)
        $gp = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $par.ParentProcessId)
        if ($gp) { Say 'T01 grandparent' 'INFO' ($gp.Name + ' :: ' + $gp.CommandLine) }
    }
} catch { Say 'T01 parent' 'INFO' ('unknown: ' + $_.Exception.Message) }

# ---------- T02 what this (not restarted) process can see ----------
$seen = @()
foreach ($n in @('git', 'node', 'npx', 'ffmpeg', 'ffprobe', 'auto-editor', 'whisper-cli', 'winget')) {
    if (Get-Command $n -ErrorAction SilentlyContinue) { $seen += $n }
}
Say 'T02 tools on this process PATH' 'INFO' ($seen -join ' ')
Say 'T02 HYPERFRAMES_WHISPER_PATH in this process' 'INFO' ([string]$env:HYPERFRAMES_WHISPER_PATH)

# ---------- T03 README step-0 command exactly as written (5.1 + BOM + UTF-8 + JSON) ----------
$json = $null
if (Test-Path -LiteralPath $check) {
    try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
    $lines = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $check 2>&1 | ForEach-Object { [string]$_ })
    try { [Console]::OutputEncoding = $consoleEnc } catch { }
    $title = [string][char]0x74B0 + [char]0x5883 + [char]0x6AA2 + [char]0x6E2C
    if (($lines -join "`n").Contains($title)) { Say 'T03 check.ps1 Chinese text decoded' 'PASS' '' }
    else { Say 'T03 check.ps1 Chinese text decoded' 'FAIL' ('first line: ' + (First ($lines -join "`n"))) }
    $jl = $lines | Where-Object { $_ -like 'JSON: *' } | Select-Object -Last 1
    if ($jl) {
        try {
            $json = $jl.Substring(6) | ConvertFrom-Json
            Say 'T03 check.ps1 JSON parses' 'PASS' ('all_ok=' + $json.all_ok + ' need_restart=' + $json.need_restart + ' todo=' + (@($json.todo) -join ',') + ' error=' + $json.error)
        } catch { Say 'T03 check.ps1 JSON parses' 'FAIL' $_.Exception.Message }
    } else { Say 'T03 check.ps1 JSON parses' 'FAIL' ('no JSON line; last: ' + (Tail ($lines -join "`n"))) }
} else { Say 'T03 check.ps1' 'FAIL' ('not found: ' + $check) }

# ---------- T04 winget App Execution Alias through Process.Start (how check.ps1 reads versions) ----------
if ($json) {
    $wgi = $json.items.winget
    if ($wgi.version) { Say 'T04 winget version via Process.Start' 'PASS' ($wgi.version + ' ' + $wgi.status) }
    else { Say 'T04 winget version via Process.Start' 'FAIL' ('status=' + $wgi.status + ' path=' + $wgi.path) }
} else { Say 'T04 winget' 'SKIP' 'no check.ps1 JSON' }

# From here on, use the PATH a freshly started program would get (same as after restarting MiniMax Code).
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$hw = [Environment]::GetEnvironmentVariable('HYPERFRAMES_WHISPER_PATH', 'User')
if ($hw) { $env:HYPERFRAMES_WHISPER_PATH = $hw }

# ---------- T05 npx in a plain powershell (no -ExecutionPolicy flag), like MiniMax Code by default ----------
$ps51 = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$r = Run $ps51 '-NoProfile -Command "Get-ExecutionPolicy -List | Out-String -Width 200"' 60 $consoleEnc
Say 'T05 execution policy list (5.1)' 'INFO' (((($r.Out -split "`r?`n") | Where-Object { $_ -match '\S' }) -join ' | ') -replace '\s+', ' ')
if (Get-Command npx.cmd -ErrorAction SilentlyContinue) {
    foreach ($pair in @(@('npx', 'T05 npx (npx.ps1) in plain powershell 5.1'), @('npx.cmd', 'T05 npx.cmd fallback in plain powershell 5.1'))) {
        $r = Run $ps51 ('-NoProfile -Command "' + $pair[0] + ' --version"') 180 $consoleEnc
        $m = [regex]::Match($r.Out, '(?m)^\s*(\d+\.\d+\.\d+)\s*$')
        if ($r.Exit -eq 0 -and $m.Success) { Say $pair[1] 'PASS' $m.Groups[1].Value }
        else { Say $pair[1] 'FAIL' ('exit=' + $r.Exit + ' ' + (First ($r.Out + "`n" + $r.Err))) }
    }
    $pw = Get-Command pwsh.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pw) {
        $r = Run $pw.Path '-NoProfile -Command "npx --version"' 180 $utf8
        $m = [regex]::Match($r.Out, '(?m)^\s*(\d+\.\d+\.\d+)\s*$')
        if ($r.Exit -eq 0 -and $m.Success) { Say 'T05 npx in plain pwsh 7' 'PASS' $m.Groups[1].Value }
        else { Say 'T05 npx in plain pwsh 7' 'FAIL' ('exit=' + $r.Exit + ' ' + (First ($r.Out + "`n" + $r.Err))) }
    }
} else { Say 'T05 npx' 'SKIP' 'Node.js not installed yet' }

# ---------- T06 VC++ runtime: registry vs DLL file version vs check.ps1 ----------
$reg = ''
foreach ($k in @("HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\$arch", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\$arch")) {
    $rt = Get-ItemProperty -Path $k -ErrorAction SilentlyContinue
    if ($rt) { $reg += ($k -replace '^HKLM:\\SOFTWARE\\', '') + '=' + [string]$rt.Version + ' ' }
}
$dllInfo = ''
foreach ($d in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'vcomp140.dll')) {
    $f = Join-Path $env:SystemRoot ('System32\' + $d)
    if (Test-Path -LiteralPath $f) { $dllInfo += $d + '=' + (Get-Item -LiteralPath $f).VersionInfo.FileVersion + ' ' } else { $dllInfo += $d + '=MISSING ' }
}
$vcCheck = ''
if ($json) { $vcCheck = $json.items.vcredist.status + ' ' + $json.items.vcredist.version }
Say 'T06 VC++ registry' 'INFO' $reg
Say 'T06 VC++ System32 DLLs' 'INFO' $dllInfo
Say 'T06 VC++ check.ps1 says' 'INFO' $vcCheck

# ---------- T07 whisper-cli: start, then a real (silent) inference with the downloaded model ----------
$wexe = $env:HYPERFRAMES_WHISPER_PATH
if ($wexe -and (Test-Path -LiteralPath $wexe)) {
    $r = Run $wexe '--version' 60 $utf8
    if ($r.Exit -eq 0 -and $r.Out -match 'whisper\.cpp version:') { Say 'T07 whisper-cli --version' 'PASS' (First $r.Out) }
    else { Say 'T07 whisper-cli --version' 'FAIL' ('exit=' + $r.Exit + ' ' + (Tail ($r.Out + "`n" + $r.Err))) }
    $model = Join-Path $env:USERPROFILE '.cache\hyperframes\whisper\models\ggml-small.bin'
    $ff = Get-Command ffmpeg -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ((Test-Path -LiteralPath $model) -and $ff) {
        $wav = Join-Path $env:TEMP 'hf-selftest-silence.wav'
        $r1 = Run $ff.Path ('-hide_banner -loglevel error -y -f lavfi -i anullsrc=r=16000:cl=mono -t 2 -c:a pcm_s16le "' + $wav + '"') 60 $utf8
        if ($r1.Exit -ne 0) { Say 'T07 make test wav' 'FAIL' ('exit=' + $r1.Exit + ' ' + (Tail $r1.Err)) }
        else {
            $r2 = Run $wexe ('-m "' + $model + '" -f "' + $wav + '" -l zh -nt') 600 $utf8
            if ($r2.Exit -eq 0) { Say 'T07 whisper-cli real inference (model + temp paths)' 'PASS' $model }
            else { Say 'T07 whisper-cli real inference (model + temp paths)' 'FAIL' ('exit=' + $r2.Exit + ' ' + (Tail ($r2.Out + "`n" + $r2.Err))) }
        }
    } else { Say 'T07 whisper-cli real inference' 'SKIP' 'ggml-small.bin not downloaded yet (run prompt 2 transcription once) or ffmpeg missing' }
} else { Say 'T07 whisper-cli' 'FAIL' ('HYPERFRAMES_WHISPER_PATH (User) not set or file missing: ' + [string]$wexe) }

# ---------- T08 auto-editor ----------
$ae = Get-Command auto-editor -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ae) {
    $r = Run $ae.Path '--version' 120 $utf8
    $v = First $r.Out
    if ($r.Exit -eq 0 -and $v -match '^\d+\.\d+\.\d+') { Say 'T08 auto-editor --version' 'PASS' ($v + '  ' + $ae.Path) }
    else { Say 'T08 auto-editor --version' 'FAIL' ('exit=' + $r.Exit + ' ' + (Tail ($r.Out + "`n" + $r.Err))) }
    $r = Run $ae.Path '--help' 120 $utf8
    if (($r.Out + $r.Err) -match '--cut-out') { Say 'T08 auto-editor --help lists --cut-out' 'PASS' '' }
    else { Say 'T08 auto-editor --help lists --cut-out' 'WARN' (First ($r.Out + "`n" + $r.Err)) }
} else { Say 'T08 auto-editor' 'FAIL' 'not on the user/machine PATH' }

# ---------- T09 how this PowerShell passes comma arguments to a native exe ----------
$nodeCmd = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nodeCmd) {
    $got = (& $nodeCmd.Path -e 'console.log(JSON.stringify(process.argv.slice(1)))' 17sec,25sec '30sec,40sec' | Out-String).Trim()
    if ($got -eq '["17sec,25sec","30sec,40sec"]') { Say 'T09 bare and quoted commas reach a native exe intact' 'PASS' ($PSVersionTable.PSVersion.ToString() + ' ' + $got) }
    else { Say 'T09 bare and quoted commas reach a native exe intact' 'WARN' ('got ' + $got + ' -> always quote comma arguments') }
} else { Say 'T09 comma arguments' 'SKIP' 'node not installed' }

# ---------- T10 non-ASCII paths vs the system ANSI code page (whisper-cli opens files with it) ----------
$acp = 0
try { $acp = [int](Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Nls\CodePage' -ErrorAction Stop).ACP } catch { }
$ansi = $null
try { $ansi = [System.Text.Encoding]::GetEncoding($acp) } catch { }
foreach ($pair in @(@('USERPROFILE', $env:USERPROFILE), @('TEMP', $env:TEMP), @('workspace', $root))) {
    $s = [string]$pair[1]
    if ($s -notmatch '[^\x00-\x7F]') { Say ('T10 ' + $pair[0] + ' path is ASCII') 'PASS' $s }
    elseif ($ansi -and ($ansi.GetString($ansi.GetBytes($s)) -eq $s)) { Say ('T10 ' + $pair[0] + ' path fits ANSI code page ' + $acp) 'PASS' $s }
    else { Say ('T10 ' + $pair[0] + ' path has characters outside ANSI code page ' + $acp) 'FAIL' ($s + '  -> whisper-cli may not open files here') }
}

# ---------- T11 OneDrive ----------
if ($root -match '\\OneDrive') { Say 'T11 workspace inside OneDrive' 'WARN' $root } else { Say 'T11 workspace outside OneDrive' 'PASS' '' }
$mediaDirs = @(Get-ChildItem -Path (Join-Path $root 'projects\*\assets\camera'), (Join-Path $root 'projects\*\assets\voice') -Directory -ErrorAction SilentlyContinue)
$cloud = @($mediaDirs | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -File -ErrorAction SilentlyContinue } | Where-Object { ([int]$_.Attributes -band 0x401000) -ne 0 })
if ($cloud.Count -gt 0) { Say 'T11 cloud-only files in projects/*/assets/' 'WARN' (($cloud | ForEach-Object { $_.Name }) -join ', ') }

# ---------- T12 Smart App Control ----------
$sac = $null
try { $sac = (Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -ErrorAction Stop).VerifiedAndReputablePolicyState } catch { }
if ($null -eq $sac) { Say 'T12 Smart App Control' 'PASS' 'not present' }
elseif ($sac -eq 0) { Say 'T12 Smart App Control' 'PASS' 'off (0)' }
else { Say 'T12 Smart App Control' 'WARN' ('state=' + $sac + ' (1=on, 2=evaluation): unsigned whisper-cli / auto-editor may be blocked') }

# ---------- T13 user PATH registry value after W8 ----------
try {
    $envReg = Get-Item -Path 'HKCU:\Environment' -ErrorAction Stop
    $kind = $envReg.GetValueKind('Path')
    $rawPath = $envReg.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    Say 'T13 HKCU\Environment\Path' 'INFO' ('kind=' + $kind + ' length=' + $rawPath.Length + ' has auto-editor=' + ($rawPath -like '*\auto-editor*'))
} catch { Say 'T13 HKCU\Environment\Path' 'INFO' ('cannot read: ' + $_.Exception.Message) }

# ---------- T14 HyperFrames finds the Windows tools (fresh PATH, npx.cmd) ----------
$npxCmd = Get-Command npx.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($npxCmd) {
    $r = Run $npxCmd.Path '--yes hyperframes doctor --json' 600 $utf8
    $i = $r.Out.IndexOf('{')
    $j = $r.Out.LastIndexOf('}')
    if ($i -ge 0 -and $j -gt $i) {
        try {
            $doc = $r.Out.Substring($i, $j - $i + 1) | ConvertFrom-Json
            foreach ($c in @($doc.checks)) {
                if ($c.name -match '^(Node\.js|FFmpeg|FFprobe|Chrome|Environment|whisper-cpp)$') {
                    $res = 'FAIL'
                    if ($c.ok) { $res = 'PASS' }
                    Say ('T14 doctor ' + $c.name) $res ([string]$c.detail)
                }
            }
        } catch { Say 'T14 hyperframes doctor --json' 'FAIL' $_.Exception.Message }
    } else { Say 'T14 hyperframes doctor --json' 'FAIL' ('exit=' + $r.Exit + ' ' + (Tail ($r.Out + "`n" + $r.Err))) }
} else { Say 'T14 hyperframes doctor' 'SKIP' 'npx.cmd not found' }

Write-Output ('=== summary: PASS ' + $Tally.PASS + ' / FAIL ' + $Tally.FAIL + ' / WARN ' + $Tally.WARN + ' / SKIP ' + $Tally.SKIP + ' / INFO ' + $Tally.INFO + ' ===')

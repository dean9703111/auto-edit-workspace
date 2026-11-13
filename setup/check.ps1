# setup/check.ps1 - Windows environment check. Read-only: installs nothing, writes no files, always exits 0.
# KEEP THIS FILE AS UTF-8 WITH BOM. Windows PowerShell 5.1 needs the BOM to read the Chinese text below.
# 用法（在工作區根目錄，PowerShell）：
#   [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; powershell -NoProfile -ExecutionPolicy Bypass -File setup\check.ps1
# 每項一行：✅ 可以用／⚠️ 裝了但這個視窗用不到／❌ 沒裝或太舊／ℹ️ 參考資訊。
# 最後一行「JSON: {...}」給 AI 解析；只用英數字（中文會轉成 \uXXXX），不受主控台編碼影響。
# 語法限制：只能用 Windows PowerShell 5.1 有的功能。不要用 ??、?:、&&、||、-AsHashtable、三個參數的 Join-Path。

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding -ArgumentList $false } catch { }
$OutputEncoding = New-Object System.Text.UTF8Encoding -ArgumentList $false

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    Write-Output 'This script is for Windows. On a Mac run: bash setup/check.sh'
    Write-Output 'JSON: {"script":"check.ps1","os":"other","all_ok":false,"need_restart":false,"todo":[],"items":{}}'
    exit 0
}

$NodeMin = 22
$ModelBytes = 487601967
$VcMinMinor = 40
$RestartNote = '已安裝，這個視窗還看不到，重開 MiniMax Code'

$IconOk = [string][char]0x2705
$IconNo = [string][char]0x274C
$IconWarn = [string][char]0x26A0 + [char]0xFE0F
$IconInfo = [string][char]0x2139 + [char]0xFE0F

$script:Items = New-Object System.Collections.ArrayList
$script:QuietExit = $null
$script:Fatal = ''

# ---------- 小工具 ----------

function ConvertTo-JsonText([string]$Text) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    foreach ($ch in $Text.ToCharArray()) {
        $code = [int]$ch
        if ($code -eq 34) { [void]$sb.Append('\"') }
        elseif ($code -eq 92) { [void]$sb.Append('\\') }
        elseif ($code -lt 32 -or $code -gt 126) { [void]$sb.Append('\u' + $code.ToString('x4')) }
        else { [void]$sb.Append($ch) }
    }
    [void]$sb.Append('"')
    return $sb.ToString()
}

function ConvertTo-JsonBool($Value) {
    if ($Value) { return 'true' }
    return 'false'
}

# 執行外部程式拿版本號：有逾時，不會被卡住；結束碼放在 $script:QuietExit
function Invoke-Quiet {
    param([string]$File, [string]$Arguments, [int]$TimeoutMs = 20000)
    $script:QuietExit = $null
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $File
        $psi.Arguments = $Arguments
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        $outTask = $proc.StandardOutput.ReadToEndAsync()
        $errTask = $proc.StandardError.ReadToEndAsync()
        if (-not $proc.WaitForExit($TimeoutMs)) {
            try { $proc.Kill() } catch { }
            $script:QuietExit = 'timeout'
            return ''
        }
        $script:QuietExit = $proc.ExitCode
        return ($outTask.Result + "`n" + $errTask.Result)
    } catch {
        return ''
    }
}

function Get-FirstLine([string]$Text) {
    foreach ($line in ($Text -split "`r?`n")) {
        $t = $line.Trim()
        if ($t) { return $t }
    }
    return ''
}

function Get-Major([string]$Version) {
    $m = [regex]::Match($Version, '^v?(\d+)')
    if ($m.Success) { return [int]$m.Groups[1].Value }
    return 0
}

function Test-File([string]$Path) {
    if (-not $Path) { return $false }
    try { return (Test-Path -LiteralPath $Path -PathType Leaf) } catch { return $false }
}

# 找執行檔。Where：path＝這個視窗找得到；registry＝已登記在 PATH，但這個視窗還沒更新；disk＝檔案在，但沒登記在 PATH
function Find-Exe {
    param([string]$Exe, [string[]]$Candidates)
    $cmd = Get-Command $Exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return @{ Path = $cmd.Path; Where = 'path' } }
    foreach ($dir in $script:RegistryDirs) {
        $p = $dir + '\' + $Exe
        if (Test-File $p) { return @{ Path = $p; Where = 'registry' } }
    }
    foreach ($pattern in $Candidates) {
        if (-not $pattern) { continue }
        $hit = Get-Item -Path $pattern -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer } | Select-Object -First 1
        if ($hit) { return @{ Path = $hit.FullName; Where = 'disk' } }
    }
    return $null
}

function Get-WhereStatus($Found) {
    if ($Found.Where -eq 'path') { return 'ok' }
    if ($Found.Where -eq 'registry') { return 'restart' }
    return 'not_in_path'
}

function Add-Item {
    param([string]$Key, [string]$Label, [string]$Status, [string]$Version, [string]$Path, [string]$Note, [bool]$Required, [string]$Step)
    if ($Status -eq 'restart') { $Step = 'W9' }
    [void]$script:Items.Add([ordered]@{ Key = $Key; Label = $Label; Status = $Status; Version = $Version; Path = $Path; Note = $Note; Required = $Required; Step = $Step })
}

# 一般工具：找到就看在不在這個視窗的 PATH 上
function Get-ToolResult {
    param([string]$Exe, [string[]]$Candidates, [string]$Step, [string]$VersionArgs, [string]$VersionPattern)
    $r = @{ Status = 'missing'; Version = ''; Path = ''; Note = "沒裝（windows.md 步驟 ${Step}）" }
    $found = Find-Exe $Exe $Candidates
    if ($found) {
        $r.Path = $found.Path
        $r.Status = Get-WhereStatus $found
        $r.Note = ''
        if ($r.Status -eq 'restart') { $r.Note = $RestartNote + '（windows.md 步驟 W9）' }
        if ($r.Status -eq 'not_in_path') { $r.Note = "找到檔案，但沒有加進 PATH（windows.md 步驟 ${Step}）" }
        $out = Get-FirstLine (Invoke-Quiet $found.Path $VersionArgs)
        $m = [regex]::Match($out, $VersionPattern)
        if ($m.Success) { $r.Version = $m.Groups[1].Value }
        elseif (-not $out) {
            if ([string]$script:QuietExit -eq 'timeout') { $r.Note = ($r.Note + '；執行逾時').TrimStart('；') }
            else { $r.Status = 'missing'; $r.Note = "找到檔案，但執行失敗（看 troubleshooting.md 的防毒，再重做 windows.md 步驟 ${Step}）" }
        }
    }
    return $r
}

try {
    # ---------- 作業系統 ----------

    $cv = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue
    $build = 0
    if ($cv -and $cv.CurrentBuildNumber) { $build = [int]$cv.CurrentBuildNumber }
    $winName = 'Windows 10'
    if ($build -ge 22000) { $winName = 'Windows 11' }
    $release = ''
    if ($cv) {
        if ($cv.DisplayVersion) { $release = [string]$cv.DisplayVersion }
        elseif ($cv.ReleaseId) { $release = [string]$cv.ReleaseId }
    }
    $envKey = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment' -ErrorAction SilentlyContinue
    $archRaw = ''
    if ($envKey) { $archRaw = [string]$envKey.PROCESSOR_ARCHITECTURE }
    if (-not $archRaw) { $archRaw = [string]$env:PROCESSOR_ARCHITECTURE }
    $arch = 'x64'
    if ($archRaw -eq 'ARM64') { $arch = 'arm64' }
    elseif ($archRaw -eq 'x86') { $arch = 'x86' }
    $hasPwsh = [bool](Get-Command pwsh.exe -CommandType Application -ErrorAction SilentlyContinue)

    # PATH：這個視窗的，和登記在系統裡的（新開的程式才看得到）
    $script:RegistryDirs = @()
    foreach ($scope in @('Machine', 'User')) {
        $raw = [Environment]::GetEnvironmentVariable('Path', $scope)
        if ($raw) {
            foreach ($d in ($raw -split ';')) {
                $t = [Environment]::ExpandEnvironmentVariables($d.Trim().Trim('"')).TrimEnd('\')
                if ($t) { $script:RegistryDirs += $t }
            }
        }
    }

    # ---------- PowerShell 腳本權限（npx 在 PowerShell 裡是 npx.ps1） ----------

    $policy = ''
    $policyScope = ''
    foreach ($scope in @('MachinePolicy', 'UserPolicy', 'CurrentUser', 'LocalMachine')) {
        $v = ''
        try { $v = [string](Get-ExecutionPolicy -Scope $scope) } catch { $v = '' }
        if ($v -and $v -ne 'Undefined') { $policy = $v; $policyScope = $scope; break }
    }
    if (-not $policy) { $policy = 'Restricted'; $policyScope = 'Default' }
    $polStatus = 'blocked'
    $polReq = $true
    $polNote = 'npx 在 PowerShell 會被擋（windows.md 步驟 W2）'
    if (@('RemoteSigned', 'Unrestricted', 'Bypass') -contains $policy) {
        $polStatus = 'ok'; $polNote = ''
    } elseif ($policyScope -eq 'MachinePolicy' -or $policyScope -eq 'UserPolicy') {
        $polStatus = 'info'; $polReq = $false
        $polNote = '被公司的群組原則鎖住，改不了；之後在 PowerShell 一律用 npx.cmd 取代 npx'
    }

    # ---------- git ----------

    $git = Get-ToolResult 'git.exe' @("$env:ProgramFiles\Git\cmd\git.exe", "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe") 'W3' '--version' 'version\s+(\S+)'

    # ---------- Node.js、npm ----------

    $nodeCandidates = @("$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe", 'C:\nvm4w\nodejs\node.exe')
    if ($env:NVM_SYMLINK) { $nodeCandidates += ($env:NVM_SYMLINK + '\node.exe') }
    $node = Get-ToolResult 'node.exe' $nodeCandidates 'W4' '-v' '^(v\d+\.\d+\.\d+)'
    if ($node.Path) {
        if (-not $node.Version) {
            $node.Status = 'missing'; $node.Note = '找到 node.exe，但執行失敗（windows.md 步驟 W4）'
        } elseif ((Get-Major $node.Version) -lt $NodeMin) {
            $node.Status = 'too_old'; $node.Note = "版本太舊，需要 $NodeMin 以上（windows.md 步驟 W4）"
        } elseif ($node.Status -eq 'ok') {
            $node.Note = "需要 $NodeMin 以上"
        }
    }

    $npm = @{ Status = 'missing'; Version = ''; Path = ''; Note = 'Node.js 裝好就會有（windows.md 步驟 W4）' }
    if ($node.Path) {
        $nodeDir = Split-Path -Parent $node.Path
        $npmCmd = $nodeDir + '\npm.cmd'
        if (Test-File $npmCmd) {
            $npm.Path = $npmCmd
            $npm.Status = $node.Status
            $npm.Note = '跟 Node.js 一樣處理'
            if ($node.Status -eq 'ok') { $npm.Note = '' }
            $pkg = $nodeDir + '\node_modules\npm\package.json'
            if (Test-File $pkg) {
                try { $npm.Version = [string]((Get-Content -LiteralPath $pkg -Raw | ConvertFrom-Json).version) } catch { }
            }
            if (-not (Test-File ($nodeDir + '\npx.cmd'))) { $npm.Note = ($npm.Note + '；找不到 npx.cmd').TrimStart('；') }
        }
    }

    # ---------- FFmpeg、FFprobe（winget 的 Gyan.FFmpeg 裝在 WinGet\Packages，連結在 WinGet\Links） ----------

    $ffResults = @{}
    foreach ($name in @('ffmpeg', 'ffprobe')) {
        $cands = @(
            "$env:LOCALAPPDATA\Microsoft\WinGet\Links\$name.exe",
            "$env:ProgramFiles\WinGet\Links\$name.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg*\*\bin\$name.exe",
            "$env:ProgramFiles\WinGet\Packages\Gyan.FFmpeg*\*\bin\$name.exe",
            "C:\ffmpeg\bin\$name.exe"
        )
        $ffResults[$name] = Get-ToolResult "$name.exe" $cands 'W5' '-version' 'version\s+(\S+)'
    }

    # ---------- VC++ 2015-2022 執行階段（whisper-cli.exe 需要，版本要 14.40 以上） ----------

    $vcArch = 'x64'
    if ($arch -eq 'arm64') { $vcArch = 'arm64' }
    $vcStep = 'W6'
    $vc = @{ Status = 'missing'; Version = ''; Path = ''; Note = "沒裝（windows.md 步驟 ${vcStep}）" }
    $sys32 = $env:SystemRoot + '\System32'
    $dlls = @('msvcp140.dll', 'vcruntime140.dll')
    if ($vcArch -eq 'x64') { $dlls += 'vcruntime140_1.dll'; $dlls += 'vcomp140.dll' }
    $missingDll = @()
    foreach ($dll in $dlls) { if (-not (Test-File ($sys32 + '\' + $dll))) { $missingDll += $dll } }
    $vcMajor = 0
    $vcMinor = 0
    foreach ($key in @("HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\$vcArch", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\$vcArch")) {
        $rt = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
        if ($rt -and $rt.Installed -eq 1) {
            $vcMajor = [int]$rt.Major; $vcMinor = [int]$rt.Minor
            $vc.Version = [string]$rt.Major + '.' + [string]$rt.Minor + '.' + [string]$rt.Bld
            break
        }
    }
    if (-not $vc.Version -and $missingDll.Count -eq 0) {
        $fi = (Get-Item -LiteralPath ($sys32 + '\msvcp140.dll')).VersionInfo
        $vcMajor = $fi.FileMajorPart; $vcMinor = $fi.FileMinorPart
        $vc.Version = [string]$fi.FileMajorPart + '.' + [string]$fi.FileMinorPart + '.' + [string]$fi.FileBuildPart
    }
    if ($missingDll.Count -gt 0) {
        $vc.Note = '缺 ' + ($missingDll -join '、') + "（windows.md 步驟 ${vcStep}）"
    } elseif ($vcMajor -gt 14 -or ($vcMajor -eq 14 -and $vcMinor -ge $VcMinMinor)) {
        $vc.Status = 'ok'; $vc.Note = "$vcArch"; $vc.Path = $sys32 + '\msvcp140.dll'
    } else {
        $vc.Status = 'too_old'; $vc.Path = $sys32 + '\msvcp140.dll'
        $vc.Note = "版本太舊，需要 14.$VcMinMinor 以上（windows.md 步驟 ${vcStep}）"
    }

    # ---------- whisper-cli（HyperFrames 找的順序：HYPERFRAMES_WHISPER_PATH → PATH 上的 whisper-cli） ----------

    $w = @{ Status = 'missing'; Version = ''; Path = ''; Note = '沒裝（windows.md 步驟 W7）' }
    $wDir = $env:LOCALAPPDATA + '\whisper-cpp'
    $envProc = $env:HYPERFRAMES_WHISPER_PATH
    $envUser = [Environment]::GetEnvironmentVariable('HYPERFRAMES_WHISPER_PATH', 'User')
    $envMachine = [Environment]::GetEnvironmentVariable('HYPERFRAMES_WHISPER_PATH', 'Machine')
    $wCmd = Get-Command whisper-cli.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (Test-File $envProc) {
        $w.Status = 'ok'; $w.Path = $envProc; $w.Note = '來自 HYPERFRAMES_WHISPER_PATH'
    } elseif ($wCmd) {
        $w.Status = 'ok'; $w.Path = $wCmd.Path; $w.Note = ''
    } elseif (Test-File $envUser) {
        $w.Status = 'restart'; $w.Path = $envUser; $w.Note = 'HYPERFRAMES_WHISPER_PATH 已設定，' + $RestartNote
    } elseif (Test-File $envMachine) {
        $w.Status = 'restart'; $w.Path = $envMachine; $w.Note = 'HYPERFRAMES_WHISPER_PATH 已設定，' + $RestartNote
    } else {
        $inReg = $null
        foreach ($dir in $script:RegistryDirs) { if (Test-File ($dir + '\whisper-cli.exe')) { $inReg = $dir + '\whisper-cli.exe'; break } }
        if ($inReg) {
            $w.Status = 'restart'; $w.Path = $inReg; $w.Note = $RestartNote
        } elseif (Test-Path -LiteralPath $wDir) {
            $hit = Get-ChildItem -LiteralPath $wDir -Recurse -Depth 3 -Filter 'whisper-cli.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($hit) {
                $w.Status = 'not_in_path'; $w.Path = $hit.FullName
                $w.Note = '找到檔案，但還沒設定 HYPERFRAMES_WHISPER_PATH（windows.md 步驟 W7 的最後一段）'
            } else {
                $w.Path = $wDir
                $w.Note = '資料夾在，但裡面沒有 whisper-cli.exe：解壓不完整或下載錯檔，重做 windows.md 步驟 W7'
            }
        }
    }
    if ($envProc -and -not (Test-File $envProc)) {
        $w.Note = ($w.Note + '；HYPERFRAMES_WHISPER_PATH 指到的檔案不存在：' + $envProc).TrimStart('；')
    }
    if ($w.Path -and $w.Status -ne 'missing') {
        if ($vc.Status -eq 'ok') {
            $out = Invoke-Quiet $w.Path '--version' 15000
            $m = [regex]::Match($out, 'version:\s*(\S+)')
            if ($m.Success) { $w.Version = $m.Groups[1].Value }
            if ([string]$script:QuietExit -eq 'timeout') { $w.Note = ($w.Note + '；whisper-cli.exe 執行逾時').TrimStart('；') }
            elseif ($script:QuietExit -ne 0) {
                $w.Status = 'missing'
                $w.Note = ($w.Note + '；whisper-cli.exe 執行失敗（exit code ' + [string]$script:QuietExit + '），看 troubleshooting.md，再重做 windows.md 步驟 W7').TrimStart('；')
            }
        } else {
            $w.Note = ($w.Note + '；VC++ 執行階段還沒好，先不執行它').TrimStart('；')
        }
    }

    # ---------- auto-editor ----------

    $ae = Get-ToolResult 'auto-editor.exe' @("$env:LOCALAPPDATA\auto-editor\auto-editor.exe") 'W8' '--version' '^(\d+\.\d+\.\d+)'
    if ($ae.Status -eq 'not_in_path') { $ae.Note = '找到檔案，但還沒加進使用者 PATH（windows.md 步驟 W8 的最後一段）' }

    # ---------- winget（只有還要裝東西時才需要） ----------

    $wingetNeeded = $false
    foreach ($r in @($git, $node, $npm, $ffResults['ffmpeg'], $ffResults['ffprobe'], $vc)) {
        if ($r.Status -eq 'missing' -or $r.Status -eq 'too_old') { $wingetNeeded = $true }
    }
    $wg = Get-ToolResult 'winget.exe' @("$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe") 'W1' '--version' '^v?(\d+\.\d+\S*)'
    $wgReq = $wingetNeeded
    if ($wg.Status -eq 'missing') {
        if ($wingetNeeded) {
            $wg.Note = '沒有 winget：到 Microsoft Store 更新「應用程式安裝程式」（windows.md 步驟 W1）'
            if ($build -gt 0 -and $build -lt 17763) { $wg.Note = "Windows 版本太舊（build $build），winget 需要 Windows 10 1809 以上" }
        } else {
            $wg.Status = 'info'; $wg.Note = '沒有 winget；其他工具都在，用不到'
        }
    }

    # ---------- 兩組 Skill、轉逐字稿模型 ----------

    $skillRoot = $env:USERPROFILE + '\.minimax\skills'
    $skills = @{}
    foreach ($pair in @(@('hyperframes', 'S1'), @('auto-editor', 'S2'))) {
        $d = $skillRoot + '\' + $pair[0]
        $s = @{ Status = 'missing'; Path = $d; Note = '沒裝（README 共用步驟 ' + $pair[1] + '）'; Step = $pair[1] }
        if (Test-File ($d + '\SKILL.md')) { $s.Status = 'ok'; $s.Note = '' }
        elseif (Test-Path -LiteralPath $d) { $s.Note = '資料夾在，但沒有 SKILL.md，重裝（README 共用步驟 ' + $pair[1] + '）' }
        $skills[$pair[0]] = $s
    }

    # 工作區的 HyperFrames（S3：npm install 照 package.json 釘的版本）
    $wsRoot = Split-Path -Parent $PSScriptRoot
    $hfPin = ''
    try { $hfPin = [string](Get-Content -Raw -LiteralPath ($wsRoot + '\package.json') -ErrorAction Stop | ConvertFrom-Json).devDependencies.hyperframes } catch { }
    $hfLocalDir = $wsRoot + '\node_modules\hyperframes'
    $hfLocal = @{ Status = 'missing'; Version = ''; Path = $hfLocalDir; Note = '沒裝（README 共用步驟 S3：在工作區根目錄 npm install）' }
    try { $hfLocal.Version = [string](Get-Content -Raw -LiteralPath ($hfLocalDir + '\package.json') -ErrorAction Stop | ConvertFrom-Json).version } catch { }
    if ($hfLocal.Version) {
        if ($hfPin -and $hfLocal.Version -ne $hfPin) { $hfLocal.Status = 'too_old'; $hfLocal.Note = '和 package.json 釘的 ' + $hfPin + ' 不同（README 共用步驟 S3）' }
        else { $hfLocal.Status = 'ok'; $hfLocal.Note = '' }
    }

    # 9 支 auto-edit Skill＋子代理定義（S4：node setup/install-skills.mjs）
    # 檔案都在之後，有 Node 22 就跑 install-skills.mjs --check --json 比對內容（sha256）：.agents/ 改過、複本還是舊的也算沒好
    $aeMissing = @()
    foreach ($n in @('longform', 'setup', 'rough', 'storyboard', 'screen', 'motion', 'review', 'deliver', 'style')) {
        if (-not (Test-File ($skillRoot + '\auto-edit-' + $n + '\SKILL.md'))) { $aeMissing += ('auto-edit-' + $n) }
    }
    $aeSkill = @{ Status = 'ok'; Note = '' }
    $aeScript = $wsRoot + '\setup\install-skills.mjs'
    if ($aeMissing.Count -gt 0) { $aeSkill.Status = 'missing'; $aeSkill.Note = '少了 ' + ($aeMissing -join '、') + '（README 共用步驟 S4）' }
    elseif ($node.Path -and (@('ok', 'restart', 'not_in_path') -contains $node.Status) -and (Test-File $aeScript)) {
        $aeOut = Invoke-Quiet $node.Path ('"' + $aeScript + '" --check --json')
        $aeJson = $null
        foreach ($line in ($aeOut -split "`r?`n")) {
            if ($line.StartsWith('{')) { try { $aeJson = $line | ConvertFrom-Json } catch { } }
        }
        if (-not $aeJson) { $aeSkill.Note = '檔案都在；install-skills.mjs 沒辦法比對內容' }
        elseif (-not $aeJson.ok) {
            $aeBad = @()
            foreach ($e in @($aeJson.errors)) { if ($e) { $aeBad += [string]$e } }
            foreach ($it in (@($aeJson.items) + @($aeJson.agents))) {
                if (-not $it) { continue }
                if ($it.status -eq 'conflict') { $aeBad += ([string]$it.show + ' 不是 install-skills 裝的（同名）→ 改名或移走它') }
                elseif ($it.status -eq 'missing') { $aeBad += ([string]$it.show + ' 還沒裝') }
                elseif ($it.status -eq 'stale') { $aeBad += ([string]$it.show + ' 和 .agents\ 的正本不同') }
            }
            $aeSkill.Status = 'too_old'
            $aeSkill.Note = ($aeBad -join '；') + '（README 共用步驟 S4）'
        }
    }

    # 臉部偵測檔（S5：look.mjs ensure；瘦臉是選用，missing 不算進 todo）
    $mpDir = $wsRoot + '\shared\template\vendor\mediapipe'
    $mpMissing = @()
    foreach ($f in @('vision_bundle.mjs', 'wasm\vision_wasm_internal.js', 'wasm\vision_wasm_internal.wasm', 'face_landmarker.task')) {
        if (-not (Test-File ($mpDir + '\' + $f))) { $mpMissing += $f }
    }
    $mp = @{ Status = 'ok'; Note = '檔案都在；完整性用 look.mjs ensure 檢查（README 共用步驟 S5）' }
    if ($mpMissing.Count -gt 0) { $mp.Status = 'missing'; $mp.Note = '少了 ' + ($mpMissing -join '、') + '（README 共用步驟 S5；不裝也能剪，只是不瘦臉）' }

    $modelPath = $env:USERPROFILE + '\.cache\hyperframes\whisper\models\ggml-small.bin'
    $model = @{ Status = 'info'; Note = '還沒下載；第一次轉逐字稿時自動下載（約 488 MB），不用先處理' }
    if (Test-File $modelPath) {
        $size = (Get-Item -LiteralPath $modelPath).Length
        if ($size -eq $ModelBytes) { $model.Status = 'ok'; $model.Note = '已下載' }
        else { $model.Status = 'incomplete'; $model.Note = "下載不完整（$size bytes），第一次轉逐字稿時會重新下載" }
    }

    # ---------- 整理 ----------

    Add-Item 'winget' 'winget' $wg.Status $wg.Version $wg.Path $wg.Note $wgReq 'W1'
    Add-Item 'exec_policy' 'PowerShell 腳本權限' $polStatus $policy '' $polNote $polReq 'W2'
    Add-Item 'git' 'git' $git.Status $git.Version $git.Path $git.Note $true 'W3'
    Add-Item 'node' 'Node.js' $node.Status $node.Version $node.Path $node.Note $true 'W4'
    Add-Item 'npm' 'npm' $npm.Status $npm.Version $npm.Path $npm.Note $true 'W4'
    Add-Item 'ffmpeg' 'FFmpeg' $ffResults['ffmpeg'].Status $ffResults['ffmpeg'].Version $ffResults['ffmpeg'].Path $ffResults['ffmpeg'].Note $true 'W5'
    Add-Item 'ffprobe' 'FFprobe' $ffResults['ffprobe'].Status $ffResults['ffprobe'].Version $ffResults['ffprobe'].Path $ffResults['ffprobe'].Note $true 'W5'
    Add-Item 'vcredist' 'VC++ 執行階段' $vc.Status $vc.Version $vc.Path $vc.Note $true 'W6'
    Add-Item 'whisper' 'whisper-cli' $w.Status $w.Version $w.Path $w.Note $true 'W7'
    Add-Item 'auto_editor' 'auto-editor' $ae.Status $ae.Version $ae.Path $ae.Note $true 'W8'
    Add-Item 'skill_hyperframes' 'Skill：hyperframes' $skills['hyperframes'].Status '' $skills['hyperframes'].Path $skills['hyperframes'].Note $true 'S1'
    Add-Item 'skill_auto_editor' 'Skill：auto-editor' $skills['auto-editor'].Status '' $skills['auto-editor'].Path $skills['auto-editor'].Note $true 'S2'
    Add-Item 'hyperframes_local' '工作區的 HyperFrames' $hfLocal.Status $hfLocal.Version $hfLocal.Path $hfLocal.Note $true 'S3'
    Add-Item 'skill_auto_edit' 'Skill：auto-edit（9 支）' $aeSkill.Status '' $skillRoot $aeSkill.Note $true 'S4'
    Add-Item 'mediapipe' '臉部偵測檔（瘦臉用）' $mp.Status '' $mpDir $mp.Note $false 'S5'
    Add-Item 'whisper_model' '轉逐字稿模型' $model.Status '' $modelPath $model.Note $false ''
} catch {
    $script:Fatal = [string]$_.Exception.Message
}

# ---------- 輸出 ----------

$head = '作業系統：' + $winName
if ($release) { $head += ' ' + $release }
$head += '（build ' + [string]$build + '，' + $arch + '）'
if ($arch -eq 'x86') { $head += '　32 位元 Windows 不支援這個流程' }
$psLine = 'PowerShell：這支檢測用 ' + [string]$PSVersionTable.PSVersion.Major + '.' + [string]$PSVersionTable.PSVersion.Minor + ' 執行'
if ($hasPwsh) { $psLine += '；電腦上也有 PowerShell 7（MiniMax Code 會優先用它）' }

Write-Output '=== 環境檢測（Windows）==='
Write-Output $head
Write-Output $psLine

$todo = @()
$fixLabels = @()
$restartLabels = @()
$needRestart = $false
$jsonItems = @()
foreach ($it in $script:Items) {
    $icon = $IconNo
    switch ($it.Status) {
        'ok' { $icon = $IconOk }
        'restart' { $icon = $IconWarn }
        'not_in_path' { $icon = $IconWarn }
        'incomplete' { $icon = $IconWarn }
        'info' { $icon = $IconInfo }
    }
    $line = $icon + ' ' + $it.Label
    if ($it.Version) { $line += '  ' + $it.Version }
    if ($it.Path) { $line += '  ' + $it.Path }
    if ($it.Note) { $line += '  ' + $it.Note }
    Write-Output $line

    if ($it.Required -and $it.Status -ne 'ok') {
        $todo += (ConvertTo-JsonText $it.Key)
        if ($it.Status -eq 'restart') { $needRestart = $true; $restartLabels += $it.Label }
        else { $fixLabels += $it.Label }
    }
    $jsonItems += (ConvertTo-JsonText $it.Key) + ':{"status":' + (ConvertTo-JsonText $it.Status) + ',"version":' + (ConvertTo-JsonText $it.Version) + ',"path":' + (ConvertTo-JsonText $it.Path) + ',"required":' + (ConvertTo-JsonBool $it.Required) + ',"step":' + (ConvertTo-JsonText $it.Step) + '}'
}

$allOk = $false
if ($script:Fatal) {
    Write-Output ('結果：檢測中途出錯：' + $script:Fatal + '。把這行錯誤貼給 AI，請它照 setup/troubleshooting.md 處理')
} elseif ($todo.Count -eq 0) {
    $allOk = $true
    Write-Output ('結果：全部就緒 ' + $IconOk)
} elseif ($fixLabels.Count -eq 0) {
    Write-Output ('結果：工具都裝好了，但有 ' + [string]$todo.Count + ' 項這個視窗還看不到 → 請使用者重開 MiniMax Code（windows.md 步驟 W9）')
} else {
    Write-Output ('結果：還有 ' + [string]$todo.Count + ' 項沒好。要安裝或設定：' + ($fixLabels -join '、'))
    if ($restartLabels.Count -gt 0) { Write-Output ('　　　裝好了但這個視窗看不到（重開 MiniMax Code 就好）：' + ($restartLabels -join '、')) }
}

$json = '{"script":"check.ps1","os":"windows"' +
    ',"os_version":' + (ConvertTo-JsonText ($winName + ' ' + $release + ' (build ' + [string]$build + ')')) +
    ',"arch":' + (ConvertTo-JsonText $arch) +
    ',"pwsh7":' + (ConvertTo-JsonBool $hasPwsh) +
    ',"all_ok":' + (ConvertTo-JsonBool $allOk) +
    ',"need_restart":' + (ConvertTo-JsonBool $needRestart) +
    ',"error":' + (ConvertTo-JsonText $script:Fatal) +
    ',"todo":[' + ($todo -join ',') + ']' +
    ',"items":{' + ($jsonItems -join ',') + '}}'
Write-Output ('JSON: ' + $json)
exit 0

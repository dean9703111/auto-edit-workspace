# Windows 安裝步驟（W1–W9）

> **未在 Windows 實測。** 每一步的驗證通過才往下做；驗證結果跟預期不同，就停下來回報，不要跳步。

由 `setup/README.md` 帶過來。只做檢測結果 `todo` 對到的步驟，順序照下面。
適用：Windows 10（1809 以後）或 Windows 11，64 位元（x64 或 ARM）。32 位元 Windows 不支援。

## 先知道

- 下面的指令都是 PowerShell 語法。MiniMax Code 在 Windows 預設用 PowerShell 執行指令。Windows PowerShell 5.1 不支援 `&&`、`||`，多個指令用 `;` 或換行分開。
- 如果你的 shell 是 Git Bash：不要把指令包進 `powershell -Command '...'`，下面的指令有單引號和 `$`，會被 bash 弄壞。改成先把那段指令存成暫存檔再執行：`cat > /tmp/step.ps1 <<'EOF'`，下一行起貼上指令，最後一行寫 `EOF`；接著執行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File /tmp/step.ps1`。
- 你的每個指令都是一個新的程序，看不到剛裝好的工具。所以 W3–W8 都用「完整路徑」或「重跑檢測」驗證，全部裝完再請使用者重開一次（W9）。
- 參數裡有逗號時要加引號（例如 `'stream=width,height'`），不然 PowerShell 會把它拆成好幾個參數。
- winget 執行前，先跟使用者說：「等一下可能跳出『是否允許此 App 變更你的裝置？』，請按『是』。」視窗可能藏在工作列，盾牌圖示在閃就點開它。
- winget 說 `Found an existing package already installed` 或 `No available upgrade found`，代表已經裝過，直接做驗證。
- 下載的暫存檔放在 `$env:TEMP`，不用刪。

## W1 確認 winget

- 什麼時候做：`winget` 是 `missing`，而且 `todo` 裡還有要用 winget 裝的東西（git、Node.js、FFmpeg、VC++ 執行階段）。
- 誰執行：你驗證；沒有的話請**使用者**更新。
- 驗證：

      winget --version

  預期：`v1.` 開頭的版本號。
- 沒有 winget 時，對使用者說：「請打開 Microsoft Store，搜尋『應用程式安裝程式』（App Installer），按『更新』或『取得』，好了跟我說。」然後再驗證一次。
- 常見錯誤：Windows 10 版本早於 1809（build 17763）沒有 winget → 請使用者先跑 Windows Update。

## W2 允許 PowerShell 執行 npm／npx

- 什麼時候做：`exec_policy` 是 `blocked`。Windows 預設不讓 PowerShell 執行 `npx.ps1`，之後每個 `npx` 指令都會失敗。
- 誰執行：你。只影響目前這個使用者，不需要系統管理員。
- 指令：

      powershell -NoProfile -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force"

- 驗證：

      powershell -NoProfile -Command "Get-ExecutionPolicy -Scope CurrentUser"

  預期：`RemoteSigned`。
- 常見錯誤：出現 `overridden by a policy defined at a more specific scope` → 公司電腦用群組原則鎖住，改不了。之後所有 `npx` 改寫成 `npx.cmd`（例如 `npx.cmd hyperframes doctor`），並告訴使用者這件事。

## W3 git

- 什麼時候做：`git` 是 `missing`。
- 誰執行：你執行，使用者按 UAC 的「是」。約 1–2 分鐘。
- 指令：

      winget install -e --id Git.Git --source winget --accept-source-agreements --accept-package-agreements

- 驗證：

      foreach ($p in @("$env:ProgramFiles\Git\cmd\git.exe", "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe")) { if (Test-Path -LiteralPath $p) { $p; & $p --version } }

  預期：印出 git.exe 的位置，下一行 `git version 2.` 開頭、`.windows.` 加數字結尾。什麼都沒印＝沒裝成功。
- 常見錯誤：使用者在 UAC 視窗按了「否」→ 重跑同一行指令。

## W4 Node.js（含 npm、npx）

- 什麼時候做：`node` 是 `missing` 或 `too_old`。
- 誰執行：你執行，使用者按 UAC 的「是」。約 1–2 分鐘。
- 指令：

      winget install -e --id OpenJS.NodeJS.LTS --source winget --accept-source-agreements --accept-package-agreements

- 驗證：

      & "$env:ProgramFiles\nodejs\node.exe" -v

  預期：`v22` 以上（winget 目前給 `v24` 或 `v26`）。
- 常見錯誤：檢測還是顯示舊版 → 電腦上有 nvm-windows 等其他 Node，看 `troubleshooting.md`「node -v 還是舊版」。

## W5 FFmpeg（含 FFprobe）

- 什麼時候做：`ffmpeg` 或 `ffprobe` 是 `missing`。
- 誰執行：你。下載量大，看網速約 1–5 分鐘，用背景執行。
- 指令（Gyan 的 full build，HyperFrames 也是建議這個）：

      winget install -e --id Gyan.FFmpeg --source winget --accept-source-agreements --accept-package-agreements

- 驗證：重跑檢測。`FFmpeg`、`FFprobe` 兩行是 ✅ 或 ⚠️（`restart`），版本是 `9.` 開頭。
- 常見錯誤：顯示 `not_in_path` → winget 沒把連結資料夾加進 PATH，看 `troubleshooting.md`「FFmpeg 找得到檔案但不在 PATH」。

## W6 VC++ 執行階段

- 什麼時候做：`vcredist` 是 `missing` 或 `too_old`。whisper-cli.exe 需要它，版本要 14.40 以上。
- 誰執行：你執行，使用者按 UAC 的「是」。約 1 分鐘。
- 指令（看檢測的 `arch`：`x64` 用第一行，`arm64` 用第二行）：

      winget install -e --id Microsoft.VCRedist.2015+.x64 --source winget --accept-source-agreements --accept-package-agreements
      winget install -e --id Microsoft.VCRedist.2015+.arm64 --source winget --accept-source-agreements --accept-package-agreements

- 驗證：重跑檢測。`VC++ 執行階段` 是 ✅，版本 `14.40` 以上。
- 常見錯誤：`too_old` 而 install 說已經裝過 → 把 `install` 換成 `upgrade` 再跑一次。

## W7 whisper-cli（轉逐字稿）

- 什麼時候做：`whisper` 是 `missing` 或 `not_in_path`。`not_in_path` 不用重新下載，只執行下面「只設定環境變數」那一行。
- 誰執行：你。約 1 分鐘（下載約 22 MB）。
- 為什麼這樣裝：winget 沒有 whisper.cpp。官方 GitHub 從 `v1.9.3` 起，`v` 開頭的 release 不附 Windows 執行檔，改附在同時發布、`b` 開頭的 release（標成 Pre-release，所以「Latest」連結找不到）。下面的指令會自動找「最新一個有這個 zip 的 release」，2026-10 時是 `b5454`。zip 裡的 `main.exe`（27 KB）是停用提示，不能用；要用的是 `Release\whisper-cli.exe`，旁邊的 `.dll` 不能拿走。
- 指令（整段一次執行）：

      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
      $ProgressPreference = 'SilentlyContinue'
      $asset = 'whisper-blas-bin-x64.zip'
      $arch = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment').PROCESSOR_ARCHITECTURE
      if ($arch -eq 'ARM64') { $asset = 'whisper-bin-win-cpu-arm64.zip' }
      $url = ''
      try {
          $releases = Invoke-RestMethod -UseBasicParsing -Uri 'https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=30'
          $release = $releases | Where-Object { $_.assets.name -contains $asset } | Select-Object -First 1
          $url = ($release.assets | Where-Object { $_.name -eq $asset }).browser_download_url
      } catch { }
      if (-not $url) { $url = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/$asset" }
      "download: $url"
      $zip = Join-Path $env:TEMP $asset
      try { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip } catch { throw "download failed: $($_.Exception.Message)" }
      $dest = Join-Path $env:LOCALAPPDATA 'whisper-cpp'
      Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force -ErrorAction Stop
      $exe = Join-Path $dest 'Release\whisper-cli.exe'
      if (-not (Test-Path -LiteralPath $exe)) { throw "whisper-cli.exe not found under $dest" }
      [Environment]::SetEnvironmentVariable('HYPERFRAMES_WHISPER_PATH', $exe, 'User')
      "HYPERFRAMES_WHISPER_PATH = $exe"

- 只設定環境變數（`not_in_path` 用；說找不到檔案就改做上面整段）：

      $exe = Join-Path $env:LOCALAPPDATA 'whisper-cpp\Release\whisper-cli.exe'; if (-not (Test-Path -LiteralPath $exe)) { throw "not found: $exe" }; [Environment]::SetEnvironmentVariable('HYPERFRAMES_WHISPER_PATH', $exe, 'User'); "HYPERFRAMES_WHISPER_PATH = $exe"

- 驗證：

      $exe = [Environment]::GetEnvironmentVariable('HYPERFRAMES_WHISPER_PATH', 'User'); $exe; & $exe --version; "exit code: $LASTEXITCODE"

  預期：第一行以 `\whisper-cpp\Release\whisper-cli.exe` 結尾；第二行 `whisper.cpp version: ` 開頭；第三行 `exit code: 0`。（不要用 `--help` 驗證：它的說明印在錯誤輸出，存不進變數。）
- 常見錯誤：跳出「找不到 MSVCP140.dll」視窗，或 exit code 是 `-1073741515`（缺 DLL）、`-1073741819`（VC++ 太舊）→ 請使用者按「確定」關掉視窗，做 W6，再驗證一次。

## W8 auto-editor

- 什麼時候做：`auto_editor` 是 `missing` 或 `not_in_path`。`missing` 兩段都做；`not_in_path` 只做第二段（加進 PATH）。
- 誰執行：你。約 1 分鐘（下載約 45 MB）。
- 為什麼這樣裝：auto-editor 31 版是單一執行檔，官方不再發布 pip 版；直接下載官方 GitHub release `31.7.2`（實測過的版本），放到使用者自己的資料夾，加進使用者 PATH。
- 第一段：下載（整段一次執行）：

      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
      $ProgressPreference = 'SilentlyContinue'
      $name = 'auto-editor-windows-x86_64.exe'
      $arch = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment').PROCESSOR_ARCHITECTURE
      if ($arch -eq 'ARM64') { $name = 'auto-editor-windows-aarch64.exe' }
      $dir = Join-Path $env:LOCALAPPDATA 'auto-editor'
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
      $exe = Join-Path $dir 'auto-editor.exe'
      try { Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/WyattBlue/auto-editor/releases/download/31.7.2/$name" -OutFile $exe } catch { throw "download failed: $($_.Exception.Message)" }
      & $exe --version

- 第二段：加進使用者 PATH（整段一次執行；用 .NET 寫法，不用 `setx`，避免 PATH 超過 1024 字被截斷）：

      $dir = Join-Path $env:LOCALAPPDATA 'auto-editor'
      $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
      if (-not $userPath) { $userPath = '' }
      $parts = @($userPath.Split(';') | Where-Object { $_ -ne '' })
      if ($parts -notcontains $dir) { [Environment]::SetEnvironmentVariable('Path', (($parts + $dir) -join ';'), 'User') }
      "user PATH includes: $dir"

- 驗證：

      & "$env:LOCALAPPDATA\auto-editor\auto-editor.exe" --version; [Environment]::GetEnvironmentVariable('Path', 'User') -split ';' | Where-Object { $_ -like '*\auto-editor' }

  預期：第一行 `31.7.2`；第二行是 `...\AppData\Local\auto-editor`。
- 常見錯誤：下載後檔案不見了，或執行時說被封鎖 → 防毒軟體誤判，看 `troubleshooting.md`「被防毒擋」和「智慧型應用程式控制」兩列。

## W9 重開 MiniMax Code

- 什麼時候做：W1–W8 做完，重跑檢測還有 `restart`。winget 和環境變數的變更，要重開 MiniMax Code 才看得到，所以裝過任何東西幾乎都要做這步。
- 誰執行：**使用者**。
- 你對使用者說：

      工具都裝好了，但 MiniMax Code 要重新打開才看得到新工具：
      1. 完全關閉 MiniMax Code。如果右下角通知區域還有它的圖示，在圖示上按右鍵選結束。
      2. 從開始功能表重新打開 MiniMax Code。
      3. 回到這個任務（或開新任務，一樣選 Local、選這個資料夾），再跟我說一次「幫我檢測環境」，我會接著把剩下的做完。

- 驗證：使用者回來後，你從 `README.md` 的步驟 0 重新開始。這時 git、Node.js、npm、FFmpeg、FFprobe、whisper-cli、auto-editor 應該都是 `ok`。
- 常見錯誤：重開後還是 `restart` → 看 `troubleshooting.md`「重開後還是看不到」。

## 附錄：作者實機驗證（照手冊安裝時不用做）

在 MiniMax Code 請 AI 於工作區根目錄執行 `powershell -NoProfile -ExecutionPolicy Bypass -File setup\windows-selftest.ps1`（全部裝完、重開 MiniMax Code、跑過一次提示詞 2 的轉逐字稿後再跑最完整），把整段輸出貼回來。

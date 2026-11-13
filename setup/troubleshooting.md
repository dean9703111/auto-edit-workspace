# 環境準備：卡住的時候

症狀對得上就照右邊做。做完回到原本那一步重新驗證。
Windows 的解法都**未在 Windows 實測**，照做後一定要再驗證。

## Mac

| 症狀 | 怎麼做 |
|---|---|
| `brew: command not found`（Homebrew 明明裝好了） | 這個視窗看不到。指令前面加 `export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH";`，並做 `mac.md` 的 M2，最後重開 MiniMax Code（M8） |
| 重開 MiniMax Code 後，檢測還是 `restart`（或 `not_in_path`） | ① 確認 M2 寫到對的檔：`grep 'brew shellenv' ~/.zprofile`（檢測 JSON 的 `shell` 是 `bash` 就看 `~/.bash_profile`），沒有就重做 M2。② 工具不在 Homebrew 路徑（例如 `~/.local/bin/auto-editor`）：照 M2 的指令 B 把那個資料夾也加進設定檔。③ 不管重開後有沒有好，之後所有指令最前面加 `export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH";` 照樣往下做，不要再請使用者重開。S6 也加前綴跑，總表最後註明「之後的指令要加 PATH 前綴」 |
| `brew install` 下載失敗、逾時 | 同一行指令再跑一次，brew 會接著裝。公司或學校網路擋 GitHub 時，換一個網路 |
| macOS 很舊，brew 開始從原始碼編譯、跑很久 | Homebrew 只對較新的 macOS 提供預先編好的版本。請使用者先更新 macOS 再裝 |
| node -v 還是舊版 | 電腦上有其他 Node 排在前面。執行 `which -a node` 看順序：有 `.nvm` 就執行 `. ~/.nvm/nvm.sh; nvm install 24; nvm alias default 24`；Intel Mac 的 brew 說 `brew link` 失敗就執行 `brew link --overwrite node`。做完重開 MiniMax Code |
| 檢測顯示 git ❌、「只有系統的空殼 git」 | 蘋果的開發者工具沒裝。執行 `brew install git`；或請使用者在終端機執行 `xcode-select --install`，跳出視窗按「安裝」 |
| 轉逐字稿出現 `whisper-cli crashed (SIGABRT)` | Homebrew 版 whisper.cpp 在部分 Mac（實測 M1 Max＋macOS 15.3.2）編譯 GPU 程式失敗。在轉逐字稿的指令最前面加 `GGML_METAL_BF16_DISABLE=1`，例如 `GGML_METAL_BF16_DISABLE=1 npx hyperframes transcribe …`，還是用 GPU，只要幾秒。或先把 macOS 更新到最新版 |
| 轉逐字稿前 30–40 秒完全沒反應 | whisper-cpp 沒先裝，HyperFrames 正在自動 `brew install whisper-cpp`，沒有任何輸出。等它跑完；下次先做 `mac.md` 的 M6 |

## Windows

| 症狀 | 怎麼做 |
|---|---|
| `winget` 不是可辨識的命令 | 先執行 `Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe`（新電腦第一次登入時 winget 常常還沒註冊好；不需要系統管理員），再驗證一次。還是沒有：請使用者到 Microsoft Store 搜尋「應用程式安裝程式」（App Installer）按更新。Windows 10 1809 以前沒有 winget，要先跑 Windows Update |
| winget 停在詢問是否同意來源條款，或出現 msstore 錯誤 | 指令要帶 `--source winget --accept-source-agreements --accept-package-agreements`（`windows.md` 的指令都有帶） |
| winget 說 `Found an existing package already installed`、`No available upgrade found`，或結束碼 `-1978335189` | 已經裝過了，算成功，直接做那一步的驗證 |
| 安裝卡住不動 | UAC 視窗可能藏在其他視窗後面。請使用者看工作列有沒有閃爍的盾牌圖示，點開按「是」。按了「否」就重跑那一行 |
| 使用者沒有系統管理員權限（UAC 要輸入別人的密碼） | Git、Node.js、VC++ 執行階段需要管理員。請公司 IT 協助安裝，裝完再檢測 |
| `npx` 出現 `running scripts is disabled on this system` 或 `npx.ps1 cannot be loaded` | 做 `windows.md` 的 W2。被群組原則鎖住時，所有 `npx` 改寫成 `npx.cmd` |
| 裝好了，但 `node`、`ffmpeg`、`auto-editor` 出現 `is not recognized` | 這個視窗的 PATH 還沒更新。請使用者重開 MiniMax Code（W9） |
| 重開後還是看不到 | 1. 確認是「完全關閉」：通知區域的圖示也要結束，再從開始功能表打開。2. 還是不行，請使用者登出 Windows 再登入。3. 暫時的做法：在指令前面加 `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'); $env:HYPERFRAMES_WHISPER_PATH = [Environment]::GetEnvironmentVariable('HYPERFRAMES_WHISPER_PATH','User');` |
| FFmpeg 找得到檔案但不在 PATH（檢測顯示 `not_in_path`） | 把 FFmpeg 的 `bin` 資料夾加進使用者 PATH：執行 W8 的第二段，但第一行改成 `$dir = '<檢測印出的路徑去掉最後的 \ffmpeg.exe>'`。再重開 MiniMax Code |
| `hyperframes doctor` 的 FFmpeg 是 ✗，提示 `Install a working 64-bit FFmpeg build with all required runtime DLLs` | 電腦上的 FFmpeg 是 32 位元或缺 DLL 的版本。照 W5 用 `Gyan.FFmpeg` 重裝，再重開 MiniMax Code |
| 找最新 whisper 版本時出現 403 或 rate limit | GitHub 限制了查詢次數。W7 的指令會自動改用固定網址（`b5454`），照常往下 |
| whisper-cli.exe 跳出「找不到 MSVCP140.dll／VCRUNTIME140_1.dll」，或結束碼 `-1073741515` | 缺 VC++ 執行階段。請使用者按「確定」關掉視窗，做 W6 |
| whisper-cli.exe 結束碼 `-1073741819`，沒有任何訊息 | VC++ 執行階段太舊（要 14.40 以上）。做 W6，`install` 換成 `upgrade` |
| 轉逐字稿出現 `whisper-cpp not found` | `HYPERFRAMES_WHISPER_PATH` 沒生效。執行 `[Environment]::GetEnvironmentVariable('HYPERFRAMES_WHISPER_PATH','User')` 確認有路徑、檔案存在；有就重開 MiniMax Code，沒有就重做 W7。不要照錯誤訊息去裝 cmake 自己編譯 |
| auto-editor.exe 或 whisper-cli.exe 被防毒擋（下載後檔案不見、說被封鎖，或檢測顯示「找到檔案，但執行失敗」） | 防毒軟體誤判。請使用者打開「Windows 安全性 → 病毒與威脅防護 → 保護歷程記錄」，對被擋的檔案選「允許」，再重做 W8 或 W7。公司電腦的防毒由 IT 管，請 IT 放行 `%LOCALAPPDATA%\auto-editor`、`%LOCALAPPDATA%\whisper-cpp` |
| 執行時出現「應用程式控制原則已封鎖此檔案」（`An Application Control policy has blocked this file`） | Windows 11 的「智慧型應用程式控制」擋下沒有簽章的程式，不能只放行單一檔案。把錯誤原文給使用者看，由他決定要不要到「Windows 安全性 → 應用程式與瀏覽器控制 → 智慧型應用程式控制設定」關閉（關閉後可能要重灌才能再打開）。不要自己改這個設定（未實測） |
| 雙擊 exe 時跳出「Windows 已保護您的電腦」（SmartScreen） | 這個流程都從指令執行，不用雙擊。使用者自己雙擊時，按「其他資訊 → 仍要執行」 |
| `check.ps1` 出現 `cannot be loaded` 或 `is not digitally signed`（已經帶 `-ExecutionPolicy Bypass`） | 公司用群組原則鎖住腳本權限，`Bypass` 沒有用。工作區是從網路下載的 zip 時，請使用者同意後執行 `Unblock-File -LiteralPath (Get-ChildItem -LiteralPath setup -File).FullName` 再試一次；還是擋就請 IT 協助，不要用其他方式繞過 |
| PATH 只剩一部分、很多指令突然找不到（之前有人用 `setx PATH` 改過） | `setx` 超過 1024 字會直接截斷，截掉的部分救不回來。這份手冊一律用 `[Environment]::SetEnvironmentVariable`，不要用 `setx`。把 `[Environment]::GetEnvironmentVariable('Path','User')` 的結果給使用者看，請他對照或請 IT 補回 |
| 轉逐字稿出現 `failed to open`、`failed to read audio` 或 `failed to initialize whisper context`，而 Windows 使用者名稱或工作區路徑有中文 | whisper-cli 用「非 Unicode 程式使用的語言」讀路徑，路徑裡有這個語言以外的字就開不了檔（模型和暫存音檔都在使用者資料夾裡）。請使用者到「設定 → 時間與語言 → 語言與地區 → 系統管理語言設定 → 變更系統地區設定」選「中文（繁體，台灣）」，重開機後再試（未實測） |
| 工作區在 OneDrive 裡（路徑有 `OneDrive`，例如 `OneDrive\桌面`）：讀影片很慢、說檔案被占用，或 `projects/*/assets/` 裡的影片打不開 | OneDrive 會把檔案只留在雲端、同步時鎖檔。請使用者在工作區資料夾按右鍵選「一律保留在此裝置上」，等圖示變成實心綠勾；還是不行就把工作區搬到 OneDrive 以外（例如 `C:\work`），在 MiniMax Code 重新開那個資料夾 |
| `check.ps1` 一跑就一堆紅字語法錯誤，或中文全是亂碼 | 檔案被存成沒有 BOM 的 UTF-8，Windows PowerShell 5.1 讀不懂中文。重新下載工作區取得原檔；急用時只看最後一行 `JSON:`，它只用英數字 |
| `check.ps1` 中文變亂碼，但有跑完 | 只是主控台編碼不同。指令前面加 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;`，或直接看最後一行 `JSON:` |

## 共用

| 症狀 | 怎麼做 |
|---|---|
| doctor 的 Chrome 是 ✗ | 執行 `npx -y hyperframes browser ensure`，再跑一次 doctor。Windows ARM 電腦還是 ✗ 時，裝 Google Chrome（`winget install -e --id Google.Chrome --source winget --accept-source-agreements --accept-package-agreements`），HyperFrames 會改用它（未實測） |
| `npx skills add` 停在 Cloning 或失敗 | 下載 Skill 要用 git。先確認檢測的 git 是 ✅；公司網路擋 GitHub 時換一個網路 |
| Skill 裝好了，但輸入框「+ → Skills」看不到 | 重開 MiniMax Code。再確認 `~/.minimax/skills/hyperframes/SKILL.md` 存在（Windows 在 `%USERPROFILE%\.minimax\skills\`） |
| 第一次執行 `npx` 等很久 | npx 會先下載套件，網路慢時要一兩分鐘，等它跑完 |
| `auto-editor --version` 第一次很慢、畫面在下載 | 用 pip 或 uv 裝的 auto-editor，第一次執行會下載對應平台的執行檔。等它跑完就好 |
| 檢測顯示「轉逐字稿模型」ℹ️ 或 ⚠️ | 不用處理。第一次轉逐字稿時會自動下載（約 488 MB），下載不完整也會自動重抓 |
| S3 `npm install` 失敗：`npm ERR! network`、`ETIMEDOUT` | 網路問題。等 1 分鐘重跑一次；公司網路擋 npm 時換一個網路。不要改用系統管理員權限 |
| S3 `npm install` 失敗：`npm ERR! code EACCES` | 不是在工作區根目錄跑，或資料夾沒有寫入權限。確認目前資料夾看得到 `package.json`、`AGENTS.md`，再跑一次；不要改用系統管理員權限 |
| S4 印 `✖ 衝突 … 這個資料夾不是 install-skills 裝的` | 那個位置已經有同名、但不是這個工具裝的 Skill（或是指到別處的捷徑）。把路徑給使用者看，請他改名或移走，再跑 `node setup/install-skills.mjs`；不要自己刪 |
| S5 `look.mjs ensure` 或 `look.mjs status` 印 `✖`（少檔、`sha256 不對`） | 瘦臉要用的 MediaPipe 檔不完整。先 `git checkout -- shared/template/vendor/mediapipe`（下載 ZIP 的使用者：重新下載工作區），再跑 `node shared/template/tools/look.mjs ensure`；還是 ✖ 才跑 `node shared/template/tools/look.mjs ensure --download`（約 18.7 MB，算安裝：先問使用者）。下載失敗就確認網路能連 `cdn.jsdelivr.net` 與 `storage.googleapis.com`；都不行就跳過，之後只調光、不瘦臉 |
| 輸入框「+ → Skills」看不到 `auto-edit-*` | 先跑 `node setup/install-skills.mjs --check`：印 `還沒裝`、`和正本不同`、`連結指到別的地方` 就跑 `node setup/install-skills.mjs`；都一致就重開 MiniMax Code。MiniMax Code 讀的是工作區的 `.minimax/skills/`、Claude Code 讀 `.claude/skills/`：第二行 `Agent（偵測到的）：` 沒有你用的那個 Agent，就加 `--agent minimax`（或 `claude`）再跑一次 |
| S4 印 `⚠ 有 N 個是複製的（這個磁碟或帳號建不了連結）` | 工作區放在 exFAT 隨身碟、網路磁碟，或 Windows 沒開「開發人員模式」（只影響子代理那一個檔）。照樣能用，只是之後改了 `.agents/` 的正本要再跑一次 `node setup/install-skills.mjs`；想改成連結就把工作區搬到電腦本機的磁碟 |
| S4 印 `✖ 刪不掉（…）→ 自己執行：…` | 舊版裝在 `~/.minimax/skills/` 的全域複本刪不掉（通常是 MiniMax Code 正開著、檔案被占用）。把那行指令貼給使用者，請他關掉 MiniMax Code 後自己執行，再跑一次 `node setup/install-skills.mjs` |

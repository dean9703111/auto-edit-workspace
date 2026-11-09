# 環境準備手冊（給 AI 照做）

使用者說「幫我檢測環境」「缺的工具幫我裝好」「安裝環境」「裝工具」這類話時，照這份做。
目標：裝齊這個剪輯流程要用的工具。每一步都要驗證，每做完一步回報一次進度。

## 要裝的東西

| 項目 | 用途 |
|---|---|
| Homebrew（只有 Mac） | Mac 的套件管理工具，用它裝下面的工具 |
| git | `npx skills add` 下載 Skill 時要用 |
| Node.js 22 以上（含 npm、npx） | 執行 `npx hyperframes`、`npx skills` |
| FFmpeg、FFprobe | 讀影片資訊、輸出影片 |
| whisper-cli（whisper.cpp） | `npx hyperframes transcribe` 轉逐字稿 |
| auto-editor | 剪掉空白和停頓 |
| HyperFrames Skill、auto-editor Skill | 裝到 `~/.minimax/skills/`（實體檔在 `~/.agents/skills/`，`~/.minimax/skills/` 是連結，兩邊都不要刪） |
| 工作區的 HyperFrames（`npm install`） | 照工作區根目錄 `package.json` 裝固定版本到 `node_modules/`；之後 `npx hyperframes` 都用這一版 |
| 9 支 auto-edit Skill | `node setup/install-skills.mjs` 從 `.agents/skills/` 複製到 `.claude/skills/`（Claude Code）與 `~/.minimax/skills/`（MiniMax Code） |
| HyperFrames 渲染用的瀏覽器 | 不用另外裝。S6 的 doctor 顯示 Chrome ✗ 時用 `npx -y hyperframes browser ensure` 下載，第一次 render 也會自動下載；放在 `~/.cache/hyperframes/chrome`，約 200 MB |
| 臉部偵測檔（MediaPipe，約 18.7 MB） | 瘦臉用。已經在 `shared/template/vendor/mediapipe/`，不用裝；S5 只檢查檔案完整 |

不用裝：Python、Docker、Google Chrome、轉逐字稿模型（約 488 MB，第一次轉逐字稿時自動下載）。

## 原則

1. 一次只做一步。做完、驗證通過、印出進度，才做下一步。
2. 成功與否看每一步寫的「驗證」，不是看安裝指令有沒有出錯。
3. 開始前把這一輪要做的步驟一次列給使用者，問一次（最後一行 `❓ 請回：「可以開始」或要拿掉的步驟編號`）。同意後照做，不再逐項問。
4. 檢測顯示已經有的，不重裝、不升級。
5. 不用 sudo。要輸入電腦密碼的步驟（Mac 安裝 Homebrew）交給使用者在終端機執行，你等他說「好了」再驗證。Windows 的 winget 由你執行，執行前先提醒使用者等一下跳出視窗要按「是」。
6. 不改 `projects/*/assets/`、`projects/*/講稿.md`、`shared/`，也不在工作區留下任何檔案（例外：S3 的 `node_modules/`、`package-lock.json`，S4 的 `.claude/skills/auto-edit-*`）。
7. 只裝上面表格裡的東西。
8. 同一步失敗兩次就停：印出 ❌、一句原因、下一步，再查 `troubleshooting.md`。不要自己改用別的安裝方式（pip、從原始碼編譯等）。這份手冊沒寫到的狀況，把錯誤訊息原文給使用者看，不要猜。
9. 會跑很久的指令（Homebrew、`brew install ffmpeg`、winget）照你的工具規則用背景執行，跑完再驗證。

## 進度回報格式（照抄）

每做完一步印一行。分母＝步驟 1 列出的清單長度：要做的 M／W 步驟、重開、S1–S9 各算一步；重開後是新的一輪，重新編號。清單外臨時多出的步驟，分母跟著加一。下面用步驟 1 的範例（共 11 步）：

    【環境準備 3/11】Node.js ✅ v26.13.0（需要 22 以上）

- 失敗：`【環境準備 4/11】FFmpeg ❌ 下載逾時。下一步：我再試一次`
- 等使用者動手：`【環境準備 1/11】Homebrew ⏳ 等你在終端機執行，做完跟我說「好了」`

最後印總表，必要項目一項一列。還有沒過的，標題改成【環境準備未完成】，最後一行改成使用者要做什麼：

    【環境準備完成】
    | 項目 | 狀態 | 版本或位置 |
    |---|---|---|
    | Node.js | ✅ | v26.13.0 |
    （其他項目）
    可以貼第二個提示詞了。

## 流程

### 步驟 0：檢測（不編號）

在工作區根目錄執行檢測腳本。它只檢查，不安裝、不寫檔：

- Mac：`bash setup/check.sh`
- Windows（PowerShell）：`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; powershell -NoProfile -ExecutionPolicy Bypass -File setup\check.ps1`（shell 是 Git Bash 的話：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File setup/check.ps1`）

最後一行 `JSON:` 是給你解析的結果。看 `todo`（還沒好的必要項目），再看每一項的 `status` 和 `step`：

| status | 意思 | 怎麼做 |
|---|---|---|
| `ok` | 可以用 | 跳過 |
| `missing`、`too_old` | 沒裝、版本太舊 | 做 `step` 那一步 |
| `not_in_path` | 檔案在，但路徑沒設定 | 做 `step` 那一步（Mac 多半是 M2） |
| `restart` | 裝好了，這個視窗還看不到 | 重開 MiniMax Code（Mac `M8`，Windows `W9`） |
| `blocked` | Windows 的 PowerShell 擋住 npx | Windows `W2` |
| `info`、`incomplete` | 參考資訊 | 不用處理 |

`step` 是 `M` 開頭看 `mac.md`，`W` 開頭看 `windows.md`，`S` 開頭是下面的共用步驟。`all_ok` 是 `true`：跳到共用步驟 S5。

### 步驟 1：列清單，問一次同意

先用一兩句話講檢測結果，再列這一輪要做的步驟，每步寫用途和指令，最後問一次。全新 Mac 的例子：

    這台是 Mac（Apple M1 Max，macOS 15.3.2），還沒有 Homebrew，下面的工具和兩組 Skill 都要裝。我會照順序做，每做完一步回報一次：
    1. 安裝 Homebrew（Mac 的套件管理工具）：要請你在終端機貼一行指令、輸入電腦密碼
    2. 讓 MiniMax Code 找得到裝好的工具：在你的終端機設定檔 ~/.zprofile 加一行，不動其他內容
    3–6. 用 Homebrew 一次裝一個：node（執行 npx）、ffmpeg（讀寫影片）、whisper-cpp（轉逐字稿）、auto-editor（剪空白）
    7–8. 安裝兩組 Skill：npx -y skills add heygen-com/hyperframes …、npx -y skills add …/auto-editor …
    9. 在工作區裝固定版本的 HyperFrames：npm install（會多出 node_modules/ 資料夾）
    10. 裝本工作區的 9 支 auto-edit Skill：node setup/install-skills.mjs
    11. 請你重開 MiniMax Code，回來再說一次「幫我檢測環境」
    重開後我會接著做：檢查臉部偵測檔（瘦臉用，只檢查不下載）、HyperFrames 自我檢查（第一次會下載它用的瀏覽器，約 200 MB）、確認 auto-editor 能執行、列出專案素材的影片、錄音資訊、最後檢測。
    過程中 MiniMax Code 會跳出權限詢問，按允許即可。
    ❓ 請回：「可以開始」或要拿掉的步驟編號

### 步驟 2：系統工具

依作業系統讀 `mac.md` 或 `windows.md`，只做 `todo` 對到的步驟，順序照文件。
做完再跑一次步驟 0 的檢測（Mac 不要加 PATH 前綴）：

- 還有 `restart`：先用 PATH 前綴把 S1–S4 做掉（它們只寫 `~/.agents/skills`、`~/.minimax/skills`、工作區的 `node_modules/` 與 `.claude/skills/`，跟重開無關），再請使用者重開 MiniMax Code（`M8`／`W9`），這一輪到這裡結束。他重開後再說一次「幫我檢測環境」，你從步驟 0 重新開始、重新編號，這時通常只剩 S5–S9。
- 沒有 `restart`：往下做共用步驟。

### 步驟 3：共用步驟（Mac、Windows 都一樣）

S1–S9 的指令都可以加 PATH 前綴（Mac：`export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH";`，Windows 見 `windows.md`）。`npx` 一律加 `-y`，第一次才不會停在 `Ok to proceed?` 等輸入。

**S1 安裝 HyperFrames Skill**（`skill_hyperframes` 是 `ok` 就跳過）：`npx -y skills add heygen-com/hyperframes -a minimax-code -g -y`
驗證：`~/.minimax/skills/hyperframes/SKILL.md` 存在（Windows：`$env:USERPROFILE\.minimax\skills\hyperframes\SKILL.md`）。可能會順便裝進同一個 repo 的其他 Skill，正常。

**S2 安裝 auto-editor Skill**（`skill_auto_editor` 是 `ok` 就跳過）：`npx -y skills add https://github.com/wyattblue/auto-editor --skill auto-editor -a minimax-code -g -y`
驗證：`~/.minimax/skills/auto-editor/SKILL.md` 存在（Windows 同上，換資料夾名稱）。

**S3 安裝工作區的 HyperFrames**（`hyperframes_local` 是 `ok` 就跳過）：在工作區根目錄執行 `npm install`。
驗證：`node -p "require('./node_modules/hyperframes/package.json').version"` 印出的版本和 `package.json` 的 `devDependencies.hyperframes` 一樣；`node shared/template/tools/caps.mjs` 的 HyperFrames 那一列是「可用」（這時 Chrome 那一列還沒好是正常的，S6 處理）。失敗看 `troubleshooting.md`「共用」。

**S4 安裝 9 支 auto-edit Skill**（`skill_auto_edit` 是 `ok` 就跳過）：`node setup/install-skills.mjs`（只想看會做什麼：加 `--dry-run`；只比對不寫檔：加 `--check`；只裝一個位置：`--target project` 或 `--target user`；給程式讀：加 `--json`）。
驗證：最後一行 `✔ 完成：9 支 × 2 個位置…`，結束碼 0。印 `✖ 衝突` 時看 `troubleshooting.md`「共用」。

**S5 臉部偵測檔**（瘦臉用；`mediapipe` 是 `ok` 就跳過，`missing` 不擋其他步驟）：`node shared/template/tools/look.mjs ensure`。驗證：最後一行 `✔ 4 個檔都對`。出現 ✖：先 `git checkout -- shared/template/vendor/mediapipe`（下載 ZIP 的使用者：重新下載工作區），再跑一次；還是 ✖ 就照那一行的 → 做（`--download` 會下載約 18.7 MB，算安裝：先把指令和用途告訴使用者，同意才跑）。不想處理也可以跳過，之後剪片只調光、不瘦臉。

**S6 HyperFrames 自我檢查**：`npx -y hyperframes doctor`。驗證：`Node.js`、`FFmpeg`、`FFprobe`、`Chrome`、`whisper-cpp` 這五行是 ✓。其他行（Version、TTS、BGM、Docker、Docker running）是 ✗、最後顯示 `Some checks failed` 都正常，不用處理，也不要去裝 Python 或 Docker。`Chrome` 是 ✗：執行 `npx -y hyperframes browser ensure`，再跑一次 doctor。

**S7 auto-editor 能執行**：`auto-editor --version`。驗證：印出版本號即可。pip／uv 裝的版本第一次會先下載執行檔，等它跑完。

**S8 列出專案素材的影片、錄音資訊**（只讀，不改檔）

- Mac：`for f in projects/*/assets/camera/* projects/*/assets/voice/*; do [ -f "$f" ] || continue; echo "== $f"; ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate:format=duration -of default=nw=1 "$f"; done`
- Windows：`Get-ChildItem 'projects\*\assets\camera\*','projects\*\assets\voice\*' -File -ErrorAction SilentlyContinue | ForEach-Object { '== ' + $_.Name; ffprobe -v error -select_streams v:0 -show_entries 'stream=width,height,r_frame_rate:format=duration' -of default=nw=1 $_.FullName }`

驗證：每支影片都有 `width`、`height`、`r_frame_rate`、`duration`。整理成「檔名｜長度｜解析度｜影格率」回報，例如 `test-raw.mp4｜1 分 47 秒｜1920×1080｜30 fps`（秒數取整數即可；`30/1` 是 30 fps，`30000/1001` 是 29.97 fps）。不是影片的檔案出錯可以忽略；只有聲音的檔案沒有 `width`、`height`，只回報長度。

**S9 最後檢測**：再跑一次步驟 0。`all_ok` 是 `true` 才算完成，然後印總表。重開後還看不到、改用 PATH 前綴繼續的，S9 也加前綴跑，總表最後註明「之後的指令要加 PATH 前綴」。總表下面接能力表：`node shared/template/tools/caps.mjs`（只檢查，不裝、不登入）。

卡住時，症狀對照與解法在 `troubleshooting.md`。

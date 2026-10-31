# Mac 安裝步驟（M1–M8）

由 `setup/README.md` 帶過來。只做檢測結果 `todo` 對到的步驟，順序照下面。
實測環境：Apple M1 Max、macOS 15.3.2（2026-10-29）。Intel Mac 的 Homebrew 在 `/usr/local`，其他步驟一樣。

## 先知道

- 你的每個指令都是新的 shell，上一個指令的 `export` 不會留下來；剛裝好的工具，這個視窗也看不到。所以 M3–M7、還有重開前先做的 S1–S4，指令最前面都加這段「PATH 前綴」（已經看得到也不影響）：

      export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH";

- 步驟 0 的檢測不要加 PATH 前綴，它要看的是這個視窗真正看得到什麼。
- 檢測 JSON 的 `shell` 決定設定檔：`zsh` 用 `~/.zprofile`，`bash` 用 `~/.bash_profile`。下面寫 `~/.zprofile` 的地方，`shell` 是 `bash` 就全部換掉。
- 每一步的常見錯誤只列一行，其他看 `troubleshooting.md`。

## M1 安裝 Homebrew

- 什麼時候做：`brew` 是 `missing`，而且 `todo` 裡還有要裝的工具。
- 誰執行：**使用者**。要輸入電腦開機密碼，你無法代打。
- 你對使用者說（照抄，可以改語氣，不要省略步驟）：

      這一步要請你自己做，大約 5 到 15 分鐘：
      1. 按 ⌘＋空白鍵，輸入「終端機」，按 Enter 打開。
      2. 把下面這一行整行複製、貼上，按 Enter。
      3. 要你輸入 Password 時，輸入這台電腦的開機密碼再按 Enter。輸入時畫面不會出現任何字，這是正常的。
      4. 看到 Press RETURN 就再按一次 Enter。如果跳出安裝「指令列開發者工具」的視窗，按「安裝」，這段常要 5–15 分鐘。
      5. 看到 Installation successful! 之後，回來跟我說「好了」。

- 指令（給使用者貼）：

      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

- 驗證（你執行）：

      /opt/homebrew/bin/brew --version || /usr/local/bin/brew --version

  預期：第一行是 `Homebrew` 加版本號。
- 常見錯誤：出現 `Need sudo access on macOS` → 這個帳號不是管理員。請使用者換管理員帳號登入，或請管理員到「系統設定 → 使用者與群組」把他設成管理員。

## M2 讓 MiniMax Code 找得到已裝好的工具

- 什麼時候做：檢測有 `not_in_path`（或剛做完 M1 的 Apple 晶片 Mac）。Intel Mac 的 `/usr/local/bin` 本來就在路徑上，Homebrew 部分跳過。
- 誰執行：你。
- 你對使用者說：「這一步是讓 MiniMax Code 找得到你電腦上已經裝好的工具，我會在你的終端機設定檔加一行，不會動其他東西。」
- 指令 A（Homebrew，路徑在 `/opt/homebrew/` 的項目）：

      grep -qs 'brew shellenv' ~/.zprofile || echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile

- 指令 B（不在 `/opt/homebrew/` 的項目，下面以檢測印出的 `~/.local/bin/auto-editor` 為例；別的資料夾就把兩處 `.local/bin` 換成那個資料夾，每個資料夾做一次）：

      grep -qs '.local/bin' ~/.zprofile || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zprofile

- 驗證：`cat ~/.zprofile`，預期看到剛加的那一行。再跑一次檢測（不加前綴），那些項目會從 `not_in_path` 變成 `restart`，最後一起重開（M8）。
- 常見錯誤：寫到不對的檔案 → 看檢測 JSON 的 `shell`，`zsh` 用 `~/.zprofile`，`bash` 用 `~/.bash_profile`。

## M3 git（很少需要）

- 什麼時候做：`git` 是 `missing`，而且 Homebrew 已經可以用（裝 Homebrew 時通常會一起裝好 git）。
- 誰執行：你。
- 指令：

      export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; brew install git

- 驗證：`export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; git --version` → `git version 2.` 開頭。
- 常見錯誤：跳出「需要指令列開發者工具」的視窗 → 請使用者按「安裝」，裝完再驗證。

## M4 Node.js（含 npm、npx）

- 什麼時候做：`node` 是 `missing` 或 `too_old`。
- 誰執行：你。約 1–3 分鐘。
- 指令：

      export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; brew install node

- 驗證：

      export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; node -v; npx -v

  預期：`node -v` 是 `v22` 以上（目前 Homebrew 給的是 `v26.x`），`npx -v` 印出版本號。
- 常見錯誤：裝好了 `node -v` 還是舊版 → 電腦上有 nvm 或官網安裝的舊 Node，看 `troubleshooting.md`「node -v 還是舊版」。

## M5 FFmpeg（含 FFprobe）

- 什麼時候做：`ffmpeg` 或 `ffprobe` 是 `missing`。
- 誰執行：你。相依套件多，約 3–10 分鐘，用背景執行。
- 指令：

      export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; brew install ffmpeg

- 驗證：

      export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; ffmpeg -version | head -n 1; ffprobe -version | head -n 1

  預期：兩行分別是 `ffmpeg version 9.` 和 `ffprobe version 9.` 開頭（8.x 也可以）。
- 常見錯誤：下載到一半失敗 → 同一行指令再跑一次，brew 會接著裝。

## M6 whisper-cpp（轉逐字稿）

- 什麼時候做：`whisper` 是 `missing`。沒先裝的話，HyperFrames 第一次轉逐字稿時會自己 `brew install`，畫面停 30–40 秒像當機。
- 誰執行：你。約 1 分鐘。
- 指令：

      export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; brew install whisper-cpp

- 驗證：

      export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; whisper-cli --version

  預期：`whisper.cpp version: 1.9.5`（或更新）。
- 常見錯誤：之後轉逐字稿出現 `whisper-cli crashed (SIGABRT)` → 不是安裝問題，看 `troubleshooting.md`。

## M7 auto-editor

- 什麼時候做：`auto_editor` 是 `missing`。已經用 pip／uv 裝過的不用重裝。
- 誰執行：你。約 1 分鐘。brew 會順便確認 ffmpeg、whisper.cpp 這些相依，已經裝好的不會重裝。
- 指令：

      export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; brew install auto-editor

- 驗證：

      export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; auto-editor --version

  預期：印出版本號即可（Homebrew 目前是 `31.7.2`）。
- 常見錯誤：`brew` 說找不到 auto-editor → 先 `brew update` 再裝一次。

## M8 重開 MiniMax Code

- 什麼時候做：上面的步驟和 S1–S4 都做完後，再跑一次檢測（不加 PATH 前綴），還有 `restart`。
- 為什麼：重開是為了之後的提示詞不用再加 PATH 前綴。重開後還是看不到也不用卡住：照 `troubleshooting.md`「重開後檢測還是 restart」處理，之後的指令加 PATH 前綴繼續做，不要再請使用者重開。
- 誰執行：**使用者**。
- 你對使用者說：

      工具都裝好了，但 MiniMax Code 要重新打開才看得到新工具：
      1. 按 ⌘Q 完全關閉 MiniMax Code，再重新打開。
      2. 回到這個任務（或開新任務，一樣選 Local、選這個資料夾）。
      3. 再跟我說一次「幫我檢測環境」，我會接著把剩下的做完。

- 驗證：使用者回來後，你從 `README.md` 的步驟 0 重新開始。這時這些項目應該都是 `ok`。
- 常見錯誤：重開後還是 `restart` → 看 `troubleshooting.md`「重開後檢測還是 restart」。

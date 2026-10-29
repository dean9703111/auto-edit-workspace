# 影片剪輯工作區規則

## 資料夾

| 資料夾 | 用途 | 權限 |
|---|---|---|
| `raw/` | 原始影片 | 只能讀，不可覆寫、移動或刪除 |
| `ref/` | 參考資料：場地照、講稿、風格規範、`template/` 情境庫模板 | 只能讀（例外：我要求換主色或背景時，可以改 `ref/template/kit/brand.css` 與 `ref/template/bg.jpg`） |
| `sfx/` | 可用的音效，只能從這裡挑 | 只能讀 |
| `setup/` | 環境檢測與安裝手冊（Mac／Windows），我說「幫我檢測環境」時照它做 | 只能讀 |
| `work/` | 中間產物：逐字稿、剪輯清單、初剪、片頭、HyperFrames 專案 | AI 可新增、修改 |
| `output/` | 最終成品與驗收截圖 | AI 可新增 |

## 規則

1. 不要覆寫或刪除 `raw/`、`ref/`、`sfx/` 的任何檔案（例外：我要求換主色或背景時，可以改 `ref/template/kit/brand.css` 與 `ref/template/bg.jpg`）；要刪除 `work/` 以外的檔案前，先問我。
2. 提示詞裡寫「停下來等我確認」的地方，一定要停：剪輯清單、分鏡表、Studio 預覽都要經過我同意。
3. 安裝新工具前，先告訴我指令和用途，等我同意再執行。照 `setup/` 手冊做時，整份清單問一次就好。
4. 字幕以 `ref/` 裡的講稿為準校正（`style.md` 以外的 `.md`；示範用 `ref/示範口播稿.md`，下一集換成該集講稿）；用繁體中文，技術名詞保留英文原文，中英文之間加半形空格。
5. 視覺、版型、字幕、音效的做法以 `ref/template/USAGE.md`（核心）與 `ref/template/USAGE-reference.md`（參考）為準；節奏與字卡文字以 `ref/style.md` 為準；有衝突時先問我。
6. 每次交付都附上驗證方式（例如 ffprobe 的輸出、截圖），不要只說「完成了」。
7. `work/` 的中間檔交付後都要保留：剪輯清單 `work/cuts.md`、分鏡表 `work/storyboard.md`、字幕、動畫設定 `work/hyperframes/plan.json`、HyperFrames 專案 `work/hyperframes/`；之後要修改或封裝成 Skill 都會用到。

## 環境準備

- 我說「幫我檢測環境」「檢測環境」「安裝環境」「裝工具」這類話時，先讀 `setup/README.md`，照它的步驟做；每做完一步，照 `setup/README.md` 規定的格式回報進度。
- 需要輸入密碼（Mac 的 Homebrew）或按系統確認視窗（Windows 的 winget）的步驟，請我自己做。
- 裝完工具後（Mac、Windows 都可能），檢測顯示 `restart` 就請我關掉 MiniMax Code 重開，再說一次「幫我檢測環境」。重開後還是找不到，就在指令最前面加 PATH 前綴照樣做（Mac：`export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH";`），不要卡在重開。
- `npx` 第一次跑某個套件會問 `Ok to proceed?`，手冊裡的 `npx` 一律加 `-y`（例如 `npx -y hyperframes doctor`）；之後提示詞裡的 `npx hyperframes …` 已經有快取，不會再問。

## 工具注意事項

- 做成片前先把 `ref/template/USAGE.md` 從頭讀完（`USAGE-reference.md` 照它的指示，做到那一步再查）；成片用 `node ref/template/tools/build.mjs` 產生，不要從零寫。
- 缺 Node.js 或其他工具時，照 `setup/` 的手冊裝，不要自己想辦法。
- 轉逐字稿用 `npx hyperframes transcribe`，**一定要帶 `--model small --language zh`**；預設的 `small.en` 會把中文翻成英文。
- 剪停頓和小聲的自言自語用 `auto-editor`；它的 Skill 文件和實際安裝的版本參數名稱可能不同（例如 `--cut` 與 `--cut-out`），**以 `auto-editor --help` 為準**。Windows 的 PowerShell 會把逗號拆成兩個參數，帶逗號或冒號的參數要加引號：`--cut-out "17sec,25sec"`、`--edit "audio:threshold=0.1"`。
- 音效只用 `sfx/`，不要另外下載素材，也不要登入任何第三方服務。
- 輸出前抽查畫面用 `npx hyperframes snapshot --review`（每段的開頭和中間、每個轉場前後都會截圖）；`hyperframes check` 回報沒問題，不代表版面正確，一定要看截圖。
- `hyperframes render` 沒有指定時間範圍的參數；要測短片段，用 `node ref/template/tools/build.mjs --test 起點,秒數` 產生 `compositions/test-clip.html`，再用 `npx hyperframes render -c compositions/test-clip.html --quality draft` 輸出。
- `render` 超過幾分鐘時，改用背景執行並看 log（指令在 `ref/template/USAGE.md` 第 2.7 節）。
- 開 Studio 用 `npx hyperframes preview --no-open`，把網址給我；我說「這張卡」「我選的」時，用 `npx hyperframes preview --context --json --context-fields selection` 讀取我在 Studio 選到的元素。

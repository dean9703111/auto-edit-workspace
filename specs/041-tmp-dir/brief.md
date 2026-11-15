# 041 暫存資料夾可以改放別處

來源：作者 2026-11-15。六支課程宣傳片連著輸出、跑測試之後，系統碟只剩 25 GB，系統暫存裡留了 12 GB（抽格快取 6.6 GB、測試留下的資料夾上千個）。我提議「改工具本身：有掛就自動用外接碟、沒掛就退回系統暫存」，作者回：「一勞永逸的設計，但是可以設定處理，預設關閉」。

## 現況（2026-11-15 盤點）

- 工具和測試的暫存都走 `os.tmpdir()`（工具裡 17 處：render 的影格、抽格快取、瀏覽器設定檔、拼圖）；hyperframes、ffmpeg、瀏覽器是子處理程序，跟著 `TMPDIR` 走。
- 只有 `dev/check-all.mjs` 會自己把 `TMPDIR` 指到外接硬碟的映像檔（路徑寫死在程式裡）。其他指令要自己加前綴 `TMPDIR=/Volumes/auto-edit-tmp`；映像檔沒掛的時候加了前綴，路徑不存在，每個指令都失敗（當天踩過一次：45 個測試失敗）。
- 子處理程序的環境變數都是呼叫當下從 `process.env` 展開的（`lib/job.mjs`、`lib/rough-flow.mjs`、`lib/deliver.mjs`、`editor.mjs`、`capcut.mjs`），沒有在載入時就存起來的。所以處理程序一開始改 `process.env.TMPDIR` 就夠。

## 定案

| # | 題目 | 定案 | 理由 |
|---|---|---|---|
| 1 | 開關放哪 | `shared/setting.json` 的 `tmp`：`{ "dir": "<資料夾>", "image": "<映像檔>" }`。沒寫＝關（系統暫存） | 作者原話「可以設定處理，預設關閉」。這是「這台機器自己的設定」，和講者、子代理數量、ACE-Step 的位置同一個檔；`dir`＋`image` 和 `music.acestep` 同一個形狀 |
| 2 | 怎麼設定 | `node shared/template/tools/status.mjs --tmp <資料夾> [--tmp-image <映像檔>]`；`--tmp off` 關掉。不用 `--project` | 和 `--agents` 同一個地方、同一種寫法（AGENTS.md 規則 1：`shared/` 的設定只透過工具寫） |
| 3 | 設定時驗什麼 | 要完整路徑；資料夾現在就要在、可以寫（有 `--tmp-image` 就先掛一次再看）。不行就 ✖、不寫設定 | 設定的當下硬碟一定接著，這時候擋得掉打錯的路徑；之後硬碟沒接是另一回事（第 5 點） |
| 4 | 什麼時候套用 | 每支工具開跑時一次：`lib/cli.mjs` 的 `isMain()` 回 true 時呼叫 `applyTmp()` | 13 支工具都用 `isMain(import.meta.url)` 判斷「我是不是被直接執行」，這一句剛好就是「一個工具處理程序開始了」。放這裡不用改 13 支，新工具也不會漏；被 import（測試、別的工具載入它）時不套用。代價：判斷式多了一個副作用，寫在 `cli.mjs` 檔頭 |
| 5 | 資料夾用不了（硬碟沒接、映像檔掛不上、不能寫入） | 不動 `TMPDIR`，照舊用系統暫存，照常做完，不丟錯。`status.mjs` 多印一行「暫存：⚠ …」，其他工具不印 | 作者要的是「一勞永逸」：硬碟沒接也不能壞。提醒放在 status：每次開工都會跑它，AI 會照 ⚠ 回報；每支工具都印會干擾輸出、也會讓 AI 想去「修」 |
| 6 | 映像檔 | `image` 選填，只在 macOS 用：`dir` 不在、映像檔在，先 `hdiutil attach -nobrowse -quiet`（最多等 60 秒）再看一次 | 作者的外接硬碟是 ExFAT，暫存放在硬碟上的 APFS 映像檔裡；不自己掛的話每次開工都要記得掛，就不是一勞永逸。硬碟沒接時映像檔也不在，只多一次 `existsSync` |
| 7 | 同一串子處理程序 | 退回系統暫存時把 `AUTO_EDIT_TMP` 設成 `off`，子處理程序不再各自試一次；開著的時候子處理程序各自讀設定（一次小檔讀取），結果一樣 | 映像檔掛不上時，`deliver` 底下每個子工具都再掛一次會各等一輪 |
| 8 | 環境變數 | `AUTO_EDIT_TMP=off`：這一次不套用；`AUTO_EDIT_TMP=<資料夾>`：這一次用這個，蓋過設定 | `check-all.mjs` 原本就用這個名字指定資料夾，意思對齊；`off` 給自己指定 `TMPDIR` 的測試、一次性的例外用 |
| 9 | 測試 | `dev/tests/helpers.mjs` 載入時也 `applyTmp()` | 系統暫存裡大部分是測試留下的；設定開了之後 `npm test` 不用再加前綴 |
| 10 | `check-all.mjs` | 不動 | 它原本的行為（作者的映像檔在就用）沒壞；改成讀設定會讓作者沒開設定時一鍵檢查反而回到系統暫存 |

沒做的：

- 不印「暫存 → …」這種每次都出現的訊息；要確認就看 `shared/setting.json`，或設定時那一行 ✓。
- 不檢查檔案系統。ExFAT 直接當暫存沒有整套驗過（測試會被 `._*` 檔弄壞），README 建議 Mac 的 ExFAT 硬碟用映像檔。
- 處理程序跑到一半硬碟被拔掉：那個處理程序之後開暫存會失敗（和手動加前綴一樣）。剪輯台開著時不要退出硬碟。
- 不清舊的暫存：系統暫存裡留下的 12 GB 是另一件事（刪除要作者同意）。

## 做了什麼

- `shared/template/tools/lib/tmp.mjs`（新）：`tmpSetting`、`applyTmp`、`tmpApplied`、`tmpWarnLine`、`saveTmp`。
- `shared/template/tools/lib/cli.mjs`：`isMain()` 是直接執行時呼叫 `applyTmp()`。
- `shared/template/tools/status.mjs`：`--tmp`、`--tmp-image`；狀態多一行「暫存：⚠ …」（只有設定了又用不了才印）；`--help`。
- `shared/template/tools/lib/settings.mjs`：檔頭的設定清單多一行。
- `dev/tests/helpers.mjs`：載入時套用。`dev/tests/tmp-setting.test.mjs`（新，加進 `test:fast`）：預設關閉、開、用不了、映像檔、環境變數、`saveTmp`、參數、假工作區實跑（工具和子處理程序的 `os.tmpdir()`）。
- 文件：`AGENTS.md`（路由表一列、規則 1 的設定清單）、`README.md`（常見問題一節）、`dev/README.md`（暫存目錄那一段）。

## 驗證

- `node --test dev/tests/tmp-setting.test.mjs`：8 過。
- `npm run test:fast`：303 過（設定關著）；`AUTO_EDIT_TMP=/Volumes/auto-edit-tmp npm run test:fast`：303 過。`npm run test:docs`：37 過。
- 整套 `AUTO_EDIT_TMP=/Volumes/auto-edit-tmp npm test`（暫存在外接碟，11.7 分鐘）：1737 個，1730 過、6 個照設計略過、1 個失敗。失敗的是 `032-b6.test.mjs`「步驟 1：遷移——example 複本 --migrate-beats --dry-run」，它看本機的 `projects/example`；加 `AUTO_EDIT_TMP=off` 單獨跑也一樣失敗，和這次改動無關。之前暫存在系統碟時整套有 7 個失敗，其中因為系統碟不到 20 GB 而失敗的預先 render 測試這次都過了。
- 真的工具：`AUTO_EDIT_TMP=/Volumes/auto-edit-tmp node shared/template/tools/audit.mjs --project projects/ppa-短影片4 --only s0101`，跑的當下新的 `hf-audit-*` 只出現在外接碟（1 個），系統暫存 0 個。
- `status.mjs`：沒設定時不印「暫存：」；`AUTO_EDIT_TMP=/Volumes/沒有這顆硬碟` 時印那一行 ⚠，其他照常。
- 做完時作者這台是關的。作者看完回「我希望是可以套用外接硬碟的」，照他說的用 `status.mjs --tmp /Volumes/auto-edit-tmp --tmp-image /Volumes/video/auto-edit-tmp.sparseimage` 開了；開了之後不加前綴跑 audit，新的暫存只出現在外接碟，`npm run test:fast` 303 過。
- 設定開著之後整套 `npm test` 再跑一次（1747 個）：1735 過、9 個略過、3 個失敗。失敗的是原本就有的 `032-b6` 那一條，和兩條偶發的：`editor-export`（清暫存資料夾時 ENOTEMPTY：背景的子處理程序還在寫檔，暫存在外接硬碟的映像檔上比較慢）、`editor-segments-ui`（點擊時機）。兩條單獨重跑三次，前者三次都過、後者過兩次。`helpers.mjs` 的 `tmpDir` 和 `editor-export.test.mjs` 清資料夾時改成最多重試 5 次。多出來的 3 個略過：兩條要 `projects/t029b`（資料夾 16:39 不在了）、一條的快照指紋含 `shared/setting.json`（多了 `tmp` 就不比）。

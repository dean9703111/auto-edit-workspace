# 056 包 F：介面／程式碼／對話（直式）

驗收：`node dev/056/compare.mjs --pack F --root /Volumes/auto-edit-projects/.tmp-056-F --jobs 2` → 結束碼 0，10 支橫式逐像素相同、直式 audit 0 ✖；每支只剩 1 個 ⚠ `beats-none`（暫存專案沒寫動畫分鏡，不用管）。
另外用 fill.json 的 `sampleMin`（沒有則用 `sample`）在直式建一個專案量過（`/Volumes/auto-edit-projects/.tmp-056-F/PM`）：build 0 ✖、audit 0 ✖，只剩 x-news 兩個 ⚠（見表下）。

字級寫法：主要文字（對話、留言、提示詞、程式碼、按鈕、標籤）寫 72（畫面上 61）、標題 76–80（畫面上 64–68）、關鍵數字 120（畫面上 102）；
只有視窗外框的字（視窗標題、檔名）寫 64（畫面上 54）、次要說明寫 57–60（畫面上 48–51）。沒有用 `data-portrait-type`（60 不夠 61），每支在 `#x-名[data-format="portrait"]` 自己寫。
內容占比＝主卡／視窗外框在舞台窗（x 120–1300、y 130–880，1180×750）的寬 × 高，範例原文的完成態。

| 模板 | 改了什麼（直式） | 主要文字（畫面上）改前 → 改後；最小字 | 內容占比 | 直式 ✖／⚠ | 並排圖 |
|---|---|---|---|---|---|
| x-slider | **修 ✖ portrait-window**：拉桿擺位 left 寫在起點 8%（translateX 扣掉），圓鈕擺位不出舞台窗。標題 80、膠囊字 72（高 104）；有標題時標題＋大框 x 184–1232、y 144–864（截圖區 1024×576），沒標題大框 1148×656。膠囊變大 → 快甩終點改成「之前」膠囊左緣再往左 56 px（範例約 63%），回彈少 4% | 膠囊 33.9 → 61、標題 47.5 → 68；最小 33.9 → 61 | 89% × 96% | 1 ✖ → 0 ✖；4 ⚠ → 1 | `/Volumes/auto-edit-projects/.tmp-056-F/compare/x-slider.jpg` |
| x-prompt | 標題 80、提示詞與提醒 72；提示詞框拉滿 1080 寬（行短時右邊留白標 `data-layout-allow-slack-portrait`），一行 ≤ 12 字、超過換行框變高；主卡 1180×712 置中。portraitMax：above、below ≤ 12 | 提示詞 44.1 → 61、標題 54 → 68；最小 44.1 → 61 | 100% × 95% | 0 ✖；7 ⚠ → 1 | `/Volumes/auto-edit-projects/.tmp-056-F/compare/x-prompt.jpg` |
| x-comment | 名稱、留言（行高 92）、回覆、回覆標籤 72；時間、讚數 60（次要）；留言卡 1180×472，回覆時 top 272 → 184（script 的 `P.portrait`），回覆卡 top 680、高 152。portraitMax：quote、quote2 ≤ 13、reply ≤ 8 | 留言 47.5 → 61、名稱 37.3 → 61、回覆 44 → 61；最小 33.8 → 50.8（時間、讚數） | 100% × 86% | 0 ✖；9 ⚠ → 1 | `/Volumes/auto-edit-projects/.tmp-056-F/compare/x-comment.jpg` |
| x-prompt-chat | 標題 80；問題、泡泡、回答 72（行高 92）；列距 `data-gap-portrait="md"`；三列 1080 寬，AI 頭像 104；主卡 1180×732。使用者泡泡內距上 20 下 24（script 拿掉它的 `.sc-opt`，見機制缺口 2）。portraitMax：ask、reply、reply2 ≤ 12 | 泡泡 33.9 → 61、標題 54 → 68；最小 33.9 → 61 | 100% × 98% | 0 ✖；5 ⚠ → 1 | `/Volumes/auto-edit-projects/.tmp-056-F/compare/x-prompt-chat.jpg` |
| x-ui-mock-tidy | 大視窗標題 76（標題列 136）、小視窗名稱／通知／完成標籤 72；大視窗 1180×736；小視窗散落 420×254、排整齊 534×254；散落位置上下平衡（CSS 和 script 的 MESSY／GRID 兩邊）。portraitMax：title ≤ 8 | 名稱、通知 33.9 → 61、大視窗標題 33.9 → 64；最小 33.9 → 61 | 100% × 98% | 0 ✖；12 ⚠ → 1 | `/Volumes/auto-edit-projects/.tmp-056-F/compare/x-ui-mock-tidy.jpg` |
| x-ui-mock | 側欄和第 3 列設定藏起來（放不下；焦點本來就在頁面標題和按鈕），頁面區拉滿；頁面標題 80、按鈕／兩列設定／通知 72、視窗標題 64；視窗 1180×720；`data-gap-portrait="lg"`、`data-align-portrait="center"`；游標終點照排好的按鈕位置算 | 介面字 33.8 → 61、頁面標題 44 → 68；最小 33.8 → 54.1（視窗標題） | 100% × 96% | 0 ✖；16 ⚠ → 1 | `/Volumes/auto-edit-projects/.tmp-056-F/compare/x-ui-mock.jpg` |
| x-terminal | 每行 72（行高 92）、視窗標題 64；指令欄可以換行（接在 $ 後面對齊），每一行的 top 和視窗高度由 script 照實際高度排、置中（範例換一行 1180×728）。portraitMax：doneText ≤ 14 | 指令與輸出 44 → 61；最小 33.9 → 54.2（視窗標題） | 100% × 97% | 0 ✖；17 ⚠ → 1 | `/Volumes/auto-edit-projects/.tmp-056-F/compare/x-terminal.jpg` |
| x-code-diff | 程式碼 72（行高 90）、結果列 72、檔名 64；一行 ≈ 24 個半形字，超過換行（續行縮 2 格），「−」「+」只標第一個畫面行（script 重寫 data-sg）；放不下（> 750）時先藏兩組一字不差的行（範例的 `save(video);`）；視窗高由 script 算、置中（範例 1180×742）。portraitMax：before、after ≤ 2 行、每行 ≤ 12 字、result ≤ 14 | 程式碼 37.3 → 61；最小 33.8 → 54.2（檔名） | 100% × 99% | 0 ✖；10 ⚠ → 1 | `/Volumes/auto-edit-projects/.tmp-056-F/compare/x-code-diff.jpg` |
| x-terminal-code | 程式碼 72（行高 90）、結果列 72、行號 60、檔名 64；script 把程式碼照 `<br>` 拆成一行一個 `.xtc-ln`、行號與標示帶照實際行位置排；程式區是 5 個畫面行的視窗（沒有結果列 6 行，`clip-path` 切掉內距），放不下就在 H1／H2 前 0.2 秒往下捲到「標的那幾行＋前一行」（範例：H1 不捲、H2 捲到第 3–6 行），`data-layout-allow-overflow-portrait` 標在程式區。portraitMax：result ≤ 14 | 程式碼 33.9 → 61；最小 33.8 → 50.9（行號） | 100% × 99% | 0 ✖；16 ⚠ → 1 | `/Volumes/auto-edit-projects/.tmp-056-F/compare/x-terminal-code.jpg` |
| x-news | 標題條 76（快訊標籤藏圖示、168 寬）、卡片說明 72、大數字 150 → 120、漲幅 80（疊在折線左上）、來源 57 不加底、最多兩行（text-wrap: balance）；第一列 y 152–288、兩張卡 660／496 × 392、來源 y 712–864；沒有來源整組下移、沒有走勢大數字卡 1180 寬內容置中（`:has()`）。portraitMax：headline ≤ 12、bigLabel ≤ 7.5、trendLabel ≤ 4.5 | 標題 44 → 64、說明 33.9 → 61、大數字 127 → 102；最小 33.8 → 48.3（來源） | 100% × 95% | 0 ✖；10 ⚠ → 1 | `/Volumes/auto-edit-projects/.tmp-056-F/compare/x-news.jpg` |

留下的 ⚠ 和理由：
- 10 支各 1 個 `beats-none`：暫存專案沒寫動畫分鏡。
- x-news 的 `sampleMin`（沒有走勢、沒有來源）直式：開場只有標題條那 2 秒報 `vbalance`（大數字卡還沒翻起來），完成態是置中的；橫式同一個變體同一拍也是這樣（不是直式才有）。另一個「畫面沒有變化 7.7 秒」是 sampleMin 少了兩拍的時間問題，和版面無關。
- x-ui-mock 的設定列在聚焦壓暗（P.spot 縮 0.96）時畫面上 58.6，回均衡後 61。
- 內容少的變體（x-code-diff 一行改一行、x-terminal-code 兩行）視窗照內容變矮、置中，高度占比會低於 70%（沒有放大字級去撐）。

## 可以從 PENDING_056 拿掉的名單

- `x-slider`（`dev/tests/examples.test.mjs` 的 `PENDING_056`；直式 0 ✖）

## 機制缺口

1. **portraitMax 只能管單一欄位**：fill.json 的 `lines`（同一行好幾格加起來）沒有直式版本 → x-prompt 關鍵詞那一行（pre＋k1＋mid＋k2＋post）、x-comment「回覆標籤＋回覆」量不到；x-code-diff 真正的上限是「兩組合計 ≤ 5 個畫面行（換行算一行）、一字不差的行不算」，也寫不出來，只好寫比較嚴的每組 2 行、每行 12 字。建議 portraitMax 接受 `lines` 那種合計（`{ "slots": [...], "max": 12 }`）。
2. **audit 的內距（padding）把自己的 padding 當成 `.sc-opt` 位移**（`lib/audit-page.mjs` ownContent：`shift = paddingBottom / 2`）：元素本身是 `.sc-opt`、又用 id 寫了自己的 padding（x-prompt-chat `#xpch-user` 的 `padding: 20px 36px`）時，位移算成 10 而不是 `--opt` 的一半，報假的「下內距不足」。模板內的解法：直式 script 拿掉那個元素的 `.sc-opt`、內距寫成上 20 下 24。建議改讀 `--opt`。
3. **`data-snap-width` 和 `P.type` 在 `white-space: normal` 的框裡對不上**：打字前游標（inline-block）插在第一個字前面，和原始碼的空白斷開、多出一個空白寬（72 字約 16 px），補寬量到的是打字前的寬度 → 打完框寬變半像素（x-prompt 直式報 subpixel）。模板內的解法：直式提示詞框寫死 1080 寬。
4. compare.mjs 只量「最小字 ≥ 48」，量不到這次的標準（主要文字 ≥ 60、內容外框 ≥ 85% × 70%）→ 上表是照版面數字算的；P.cam、P.spot 縮放後的字也沒有量。

其他：
- 暫存專案 `/Volumes/auto-edit-projects/.tmp-056-F/PM`（sampleMin 直式驗證用）留著，本機規則擋刪除。
- 跑 `dev/tests/custom-fill.test.mjs` 時看到 1 條失敗（「fillTemplate：項數變少刪掉那一站…」第 4 站整組拿掉）：是包 C 的 x-process 直式 CSS 寫了 `:has(> #xprocx07-n4)`，3 站時也留著 n4 的字串，不是包 F 的檔。

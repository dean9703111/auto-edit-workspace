# 回饋輪 r<N>

給 `auto-edit-review` 流程 B 用。規則來源是 AGENTS.md「進度紀錄」與規則 11；這裡放範本與判斷表。

## 1. 編號、備份、版本都由工具做

`versions.mjs begin` 算編號、備份 `plan.json.bak-r<N>`、存改前版本、開 `work/feedback/r<N>.md`；`versions.mjs finish` 存改後版本、填「分類」的改法和「改了哪幾段」、寫驗證。不用手動複製，也不用重寫工具填好的列（太籠統才用 edit 改那一列冒號後面的字）。

要還原這一輪：把 `plan.json.bak-r<N>` 複製回 `plan.json`，再 build。只還原一段：`node shared/template/tools/versions.mjs use --project projects/<專案> --seg <段> --ver v<N>`（x 檔、svg 一起換回去）。

每段的版本在 `work/versions/<段>/v<N>/`：`段落.json`（plan.json 那一段）、動畫的 html（手寫、內容設計、模板動畫都有）與 svg、內容設計動畫的 `鏡位腳本.md`、`分鏡.md`、`預覽.jpg`（audit 拼圖）。預設都不 render。

比較影片（`比較-v<舊>-v<新>.mp4`，左舊右新）要兩版都有 `預覽.mp4`。使用者說修改時就說要比較：`begin`、`finish` 都加 `--preview`。改完才要比較：先跟他說「舊版沒有預覽影片，兩版各要 render 一次（一段約 25 秒）」，他說好再跑下面四行（`use` 印的「→ 下一步」先不用照做，四行跑完、最後一行印「比較：…」就好）：

```
node shared/template/tools/versions.mjs use --project projects/<專案> --seg <段> --ver v<舊>
node shared/template/tools/versions.mjs save --project projects/<專案> --seg <段> --preview
node shared/template/tools/versions.mjs use --project projects/<專案> --seg <段> --ver v<新>
node shared/template/tools/versions.mjs save --project projects/<專案> --seg <段> --preview
```

## 2. 規則還是個案

| 使用者說的話長這樣 | 分類 | 做法 |
|---|---|---|
| 指名一段、一張卡、一個時間，有具體改法（「s05 往左移」「1:20 那張字太多」） | 個案 | 只改那一段的 plan.json |
| 指名一段動畫裡的東西，有具體改法（「s12 的箭頭慢一點」「手機畫大一點」），plan.json 改不到（內容設計動畫、模板 `slots` 做不到） | 個案 | 一段派一個子代理照 `.agents/skills/auto-edit-motion/references/worker-brief.md` 改那支動畫檔，同一則回覆一次派出，全部回來才 `finish`；主代理不自己改動畫檔 |
| 指名一段，只說要更好、沒說怎麼改（「s12 的動畫想更完善」「s12 重新設計」「換個動畫」） | 個案（改版） | 先出分鏡提案、停點 ③（`references/revise.md`）；rN.md 的改法寫「改版 s12 v2」 |
| 指名一個時間的音效或講者推近（「1:20 那聲太吵」「講到竟然要有音效」「這句講者推近」） | 個案 | `build.mjs --check` 的音效報告看那一顆是誰放的：「情緒點」那一行列的 → 改 plan.json 第一層 `moods`（不要＝刪那一項、換聲音＝`"sfx": "<名稱>"`、要推近＝`"zoom": true`、要新加＝`{ "at": "#N@詞", "kind": "<五類>" }`，style.md「情緒點」）；段上的 → 改那一段的 `sfx` |
| 「s12 用 v1」「退回上一版」 | 個案（退回） | SKILL.md 流程 E；rN.md 的改法寫「退回 v1」 |
| 「以後」「每次」「都」「全部的 X」 | 規則 | 這一集照做；在 rN.md「建議改規則」寫一條（一句完整的話，例「金句都放左邊」），**不改** `shared/`、AGENTS.md（AGENTS.md 規則 1）。之後 `status.mjs` 會提醒問使用者要不要每一集都照做（AGENTS.md 規則 11） |
| 「這張卡」「我選的」 | 個案 | 請使用者說段號或大約第幾秒，再照 `--check` 報告的「起–迄」找段（USAGE.md 2.6） |
| 分不出來 | 個案 | 照個案改，rN.md 註明「可能是規則，請確認」 |
| 一句話可以解成「刪掉」或「避開／挪開」（「擇一即可」「不要重疊」） | 個案 | 先做不刪的那個解讀（挪位置、錯開時間），回報另一種解讀讓使用者選；參考專案曾因刪掉 8 支箭頭白做一輪 |

個案改完再看同型：使用者的修改對得到工具的一條 ⚠ 或 ✖（例：「大約會蓋到講者框」、字太多）才找：跑 `node shared/template/tools/build.mjs --project projects/<專案> --check`，在它印的 ⚠ 裡找同一句（`finish` 只印這輪的段，別段只有數量），不跑 `audit.mjs --all`；對不到工具訊息的（往左移、換顏色）不找。找到就回報「同型 N 段：s08、s14…（這輪沒改，要一起改嗎）」，不要自己全部改（參考專案作者常回「後面的也有一樣問題」）。

同一輪有好幾項時的順序：剪接、字幕、音訊先改（動畫綁句的時間會跟著動），再改版面與動畫。

## 3. `work/feedback/r<N>.md` 範本（四節，標題逐字）

```markdown
# 回饋 r<N>（YYYY-MM-DD HH:MM）

## 原話

「s05 的金句卡往左移，s09 字太多」

## 分類

| # | 原話節錄 | 規則／個案 | 改哪一段 | 改法 |
|---|---|---|---|---|
| 1 | s05 的金句卡往左移 | 個案 | s05 | css 往左 120px |
| 2 | s09 字太多 | 個案 | s09 | key 縮成 10 字 |

建議改規則：（沒有寫「無」）

## 改了哪幾段

- s05：`"css": { "left": "-120px" }`（v1 → v2）
- s09：key「…」→「…」（v1 → v2）

## 驗證

- build --check：✖ 0、⚠ 3
- audit --only：✖ 0；拼圖 sheet-s05.jpg、sheet-s09.jpg 沒有 FAIL
```

## 4. 預算

每一項最多 6 次工具呼叫。某一項超過就停下來，回報那一項卡在哪，其他項照做。

# 照修改單改（流程 F）

給 `auto-edit-review` 流程 F 用。使用者在剪輯台右側「修改單」選段、點標籤或寫描述，按「複製給 AI」：待改的段存到 `work/feedback/editor-requests.md`（EDITOR.md「修改單」），剪貼簿只放一行指令「照剪輯台修改單改這 N 段（<檔案路徑>）：…」。使用者貼上這行、說「照修改單改」或貼上開頭是「# 剪輯台修改單」的文字，就照這份做。

修改單就是使用者確認過的改法：**直接做**，不開 `versions.mjs new`、不寫分鏡提案、不停停點 ③，也不要跑 `build.mjs --storyboard`（它會記一筆停點 ③）。這仍是一輪回饋，照這個順序：

1. `node shared/template/tools/versions.mjs begin --project projects/<專案> --seg <段,段> --say "照修改單改"`（`--seg` 只放 plan.json 有的段，見第 1 節）。
2. 回報剪輯台「生成中」（第 5 節）。
3. 照第 2、3 節改；要派的段同一則回覆一次派出。
4. 全部回來後跑 `node shared/template/tools/versions.mjs finish --project projects/<專案>`，build、audit 由它一次做完，不用另外跑。
5. `finish` 0 個 ✖ 後回報剪輯台「已改完」或「失敗」（第 5 節），補 r<N>.md（第 4 節）。

剪貼簿那行是剪輯台自動產生的。舊版寫「每段派一個子代理平行改，全部回來後 build、audit」：一樣照上面的順序做，只有第 3 節寫要派的段才派。

## 1. 讀修改單

每段一節 `## k. <段 id>　<名稱>`：動畫是什麼、「檔案」（自訂動畫、錄影；從工作區根目錄寫起的路徑，照抄就能用）、完成影片時間、plan.json 起訖、「要改」（標籤）、「描述」（使用者原話）、「對應字幕」（`#N 文字`）。貼上的和檔案不一樣時以使用者貼上的為準。「plan.json 裡找不到這段」→ 那段不做，回報裡問使用者是哪一段。

段號是 `t<秒>`（例 `t1095`）、寫著「這裡現在沒有段落」的，是要新增一段：

- `begin` 的 `--seg` 不放它（plan.json 沒有這段，放了會 ✖）。修改單只有這種段時，`--seg` 放它前一段的 id，只用來開這一輪；`finish` 印「⚠ <前一段> 和改之前一樣」是正常的。
- 照時間和字幕在前後兩段之間加一段，id 用前一段加一個字母（例 `s05b`），畫面照第 3 節分工。
- 回報剪輯台、寫 r<N>.md 都用修改單的段號 `t1095`（第 4、5 節）。

## 2. 標籤怎麼解讀

描述和標籤衝突時照描述。

| 標籤 | 改法 |
|---|---|
| 流程更細節 | 步驟拆細、多幾站（一站一個動作），每站綁 `#N@詞`；站數照字幕講到的步驟，不自己編 |
| 以圖像展示為主 | 文字降到標題＋每站 ≤ 6 字標籤，主體換插圖、圖示或介面示意（`kit/illus-style.md`、`x-ui-mock`） |
| 文字少一點 | 刪說明句，只留關鍵詞；清單每條 ≤ 8 字 |
| 畫出關係（箭頭、引線） | 加連接線、箭頭或引線（BEATS.md §2 的名稱），讓前後、因果看得出來 |
| 換一種動畫 | 換情境或版型（BEATS.md 選另一種拍型）；資訊卡、字卡換成情境動畫 |
| 動作慢一點 | 拉長站與站的間隔、進場時間；不超過段長、不早於講到的詞 |
| 跟講的話對齊 | 每個出現時間綁 `#N@詞`，差 ≤ 0.5 秒（audit「綁句對不上」0 個） |
| 更有質感 | 加層次（底版、陰影、光暈）。要鏡頭動作時只推沒有底的那一層（插圖群組、連接線），有底版的卡片不推（BEATS.md §2「鏡頭慢推」「鏡頭跟焦點」）。不加文字 |
| 標註更清楚（錄影） | `marks` 的框對準要看的地方（要文字說明用 `callouts`）；同時最多 2 個 |
| 推近到操作區（錄影） | 加 `moves` 推近到操作的位置 |
| 加步驟清單（錄影） | 橫式影片的直式錄影加 `side`；其他寫 `steps`（不和角標重複） |
| 換成動畫（錄影） | 改成不透明全幕情境動畫（介面操作用 `x-ui-mock`），錄影段移除或縮短 |
| 換一段錄影 | 照 `auto-edit-screen` 找 `assets/screen/` 裡對得上講解的另一支 |

## 3. 分工

先看這段在 plan.json 是哪一種（`build.mjs --show <段>`），再找對應的列；每段只會對到一列。

| 這段是什麼、要改的 | 誰做 |
|---|---|
| 模板動畫（`template`＋`slots`）、字卡、資訊卡：只改文字、條目、時間 | 你自己改 plan.json，不用派 |
| 模板動畫、字卡、資訊卡：「換一種動畫」「以圖像展示為主」，內容是條列、走流程 | 換 `build.mjs --list` 裡另一個模板（不和前後段同一個）：你改 plan.json 那段的 `template`／`scene`＋`slots`（欄位用 `build.mjs --spec <模板>` 查），不用派 |
| 模板動畫、字卡、資訊卡：「換一種動畫」「以圖像展示為主」，遮住字幕只看畫面看不懂、模板做不到（style.md「內容設計動畫」的判斷） | 你把那段改成 `"design": true`（拿掉 `template`、`slots`），跑 `node shared/template/tools/build.mjs --project projects/<專案> --check`，確認 `work/briefs/<段>.md` 有了再派工。派工照 `--apply-storyboard` 印的那一句：照 `.agents/skills/auto-edit-motion/references/design.md` 寫鏡位腳本、接著 做動畫。修改單就是確認過的改法，不用停 ③ |
| 模板動畫：其他 `slots` 做不到的改動 | 一段一個子代理改那支 `<模板>-<段>.html`，派工照 `.agents/skills/auto-edit-motion/references/worker-brief.md` |
| 已經是內容設計動畫（`"design": true`）的段，不管哪個標籤 | 一段一個子代理用 edit 改那支 `x-design-<段>.html`，派工照 `.agents/skills/auto-edit-motion/references/worker-brief.md`（寫法照 design.md；拍變了一起改 `work/designs/<段>.md`） |
| 錄影段的 `marks`、`moves`、`side`、`steps`、換成動畫 | 你自己改 plan.json；換一段錄影照 `auto-edit-screen` 的筆記挑 |

**同一則回覆一次全部派出**；派工訊息的「要改什麼」寫：

```
修改單（使用者確認過的改法，直接做，不用新分鏡）：
要改：<標籤>
描述：<使用者原話>
現在的動畫分鏡：照 work/storyboard.md 這段（grep -n -A30 "動畫分鏡 <段 id>" projects/<專案>/work/storyboard.md），照上面的改法改；拍變了改 work/designs/<段 id>.md 那張表（內容設計動畫段），不要改 storyboard.md
```

剛改成 `"design": true` 的段不附「現在的動畫分鏡」那行（那是舊模板的拍），設計師照鏡位腳本重想。

不 render：改完用 `versions.mjs finish` 驗證，作者在它印的完成影片預覽網址看會動的樣子。比較影片要兩版都有預覽：使用者說修改時就說要比較，`begin`、`finish` 都加 `--preview`；改完才要比較，先跟他說「舊版沒有預覽影片，兩版各要 render 一次（一段約 25 秒）」，他說好再照 `references/feedback-round.md` 第 1 節的四行做。

收件、整合照 AGENTS.md「子代理分工」第 2 條。

## 4. 驗收與紀錄

- 全部回來後跑 `node shared/template/tools/versions.mjs finish --project projects/<專案>`（build、量、存改後版本、寫驗證、記停點 ④），打開它印的圖，只看改到的段。
- `finish` 會自己填 `work/feedback/r<N>.md` 的「分類」改法和「改了哪幾段」（`- <段 id>：<改了什麼>（v1 → v2）`），不用重寫。你只補三種：沒做的段加一列 `- <段 id>：沒做，<理由>`；新增的段加一列 `- t1095：新增 s05b，<做了什麼>`；工具寫得太籠統（例「改了」）就用 edit 改那一列冒號後面的字。id 照修改單的寫、一段一列（剪輯台讀這一列，把修改單上那段標「✓ 已改」、可以點「看結果」）。
- 回報每段一行「<段>：<做了什麼>」，加「剪輯台的修改單可以按『清空修改單』」，最後兩行是停點 ④。
- 工具呼叫預算：每段算回饋輪的一項（6 次）；動畫段的子代理由工具數驗收次數（第 6 次還有 ✖ 印「→ 停手」）。

## 5. 回報剪輯台

剪輯台上那段要等你回報才標「生成中」「已改完」「生成失敗」。`--ids` 寫修改單的段號（含 `t<秒>`），逗號分開不要空格：

```
node shared/template/tools/editor.mjs --project projects/<專案> --requests-state status
node shared/template/tools/editor.mjs --project projects/<專案> --requests-state generating --request-revision <revision> --ids <段,段>
node shared/template/tools/editor.mjs --project projects/<專案> --requests-state done --request-revision <revision> --ids <段,段> --round r<N>
node shared/template/tools/editor.mjs --project projects/<專案> --requests-state failed --request-revision <revision> --ids <段> --message "<沒做的理由>"
```

- `begin` 之後跑第 1 行，抄它印的 `"revision"` 的值（剪貼簿那行已經帶 `--request-revision <值>` 就直接用那個）；再跑第 2 行。
- `finish` 0 個 ✖ 後跑第 3 行（改好的段）；沒做的段跑第 4 行。
- 印 `修改單版本已更新` → 使用者重新複製過修改單：停下來，重讀 `work/feedback/editor-requests.md`，問使用者要不要照新的改。

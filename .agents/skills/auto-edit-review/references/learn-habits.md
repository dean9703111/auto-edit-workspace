# 照這集的調整紀錄學使用者的習慣（流程 G）

給 `auto-edit-review` 流程 G 用。使用者在剪輯台按「整理這集的調整給 AI」、照貼 `deliver.mjs` 回報裡的那一行（「照這集的調整紀錄學我的習慣（projects/<專案>/work/feedback/learn.md）：…」），或說「整理這集的調整給 AI」時照這份做。

目的：從這一集使用者怎麼改，找出以後每一集都該照做的規則，做成選擇頁讓使用者勾；勾了的才寫進 `shared/偏好.md`（AGENTS.md 規則 11）。不改 plan.json，`shared/` 只透過 `status.mjs --prefs-add`、`--prefs-skip` 寫。

## 1. 產生紀錄

```
node shared/template/tools/versions.mjs learn --project projects/<專案>
```

它把回饋輪的原話（同類歸在一起、標次數）、建議改規則（已經在偏好裡的標「已是規則」）、剪輯台手改（剪接、聲音、音效、整支設定、字幕常改的字）、改版紀錄（換模板、重新設計、退回）寫進 `work/feedback/learn.md`。印「這集沒有調整紀錄」就跟使用者說這集沒有可以學的，結束。

只讀 `work/feedback/learn.md`；要看某一輪的細節才打開那份 `work/feedback/r<N>.md`。

## 2. 寫候選規則

寫 `work/feedback/learn-rules.json`，每條一個物件：

| 欄位 | 寫什麼 |
|---|---|
| `id` | L1、L2…，照重要程度排 |
| `text` | 規則：一句完整的話，有對象、有做法或數字，使用者看得懂、下一集照得了（例 `清單每一項的說明只留關鍵詞，最多 4 個字`）；不寫「更好看」這種 |
| `where` | 落點：`偏好`（寫分鏡、改段落、寫字卡時照做的品味，進 `shared/偏好.md`）／`改預設`（工具的預設值該換，例 剪接點轉場、字幕樣式、音效音量）／`程式檢查`（工具量得出來的毛病，例 字數、擋到講者） |
| `evidence` | 證據：哪幾輪、哪幾段、幾次，照 learn.md 抄（例 `r1 x0105、r2 x0106（2 次，都說了「以後」）`） |
| `now` | 現行：現在工具或 AI 怎麼做 |
| `change` | 建議：照這條之後怎麼做 |
| `cost` | 代價：照做會失去什麼、哪些情況不適用；沒有就寫「無」 |

挑哪些：

- 同類修改出現兩次以上，或使用者說了「以後」「都」「每次」的才列；只出現一次又沒說的不列。
- learn.md 標「已是規則」「使用者說過不要」的不列；和 `shared/偏好.md`「照做」意思一樣、只是說法不同的也不列。
- 剪輯台手改：同一種手改很多次（每個剪接點都改過黑、音效都調小、自己加同一顆音效）多半是 `改預設`；字幕常改的字（例 `「Cloud」→「Claude」`）列成 `偏好`（寫字幕、字卡時照用）。
- 最多十條，寧缺勿濫。

```json
{ "rules": [
  { "id": "L1", "text": "清單每一項的說明只留關鍵詞，最多 4 個字", "where": "偏好", "evidence": "r1 x0105、r2 x0106（2 次，都說了「以後」）", "now": "說明照講稿摘一句，常到 6–8 個字", "change": "說明只留關鍵詞", "cost": "長的術語要拆成標題＋說明" }
] }
```

## 3. 做成選擇頁

```
node shared/template/tools/versions.mjs learn --project projects/<專案> --page
```

它驗欄位（✖ 照 → 改好再跑），寫 `work/feedback/learn-choices.html`（固定模板，一個檔；照落點分組，每條有現行、建議、代價、證據，選「照做／不要／再想想」）。平台能發布網頁就發布、給網址；不能就給檔案路徑。不要自己另做一頁。回覆的最後兩行：

```
學習清單：<網址或 projects/<專案>/work/feedback/learn-choices.html>
請回：每條選「照做／不要／再想想」，按最下面「複製答案」貼回來
```

## 4. 照答案寫進偏好

使用者貼回「學習清單的答案（…）」，照 `learn-rules.json` 的 id 對：

| 答案 | 落點 | 做什麼 |
|---|---|---|
| 照做 | 偏好 | 一條跑一次 `node shared/template/tools/status.mjs --prefs-add "<那條的 text>"` |
| 不要 | 偏好 | 一條跑一次 `node shared/template/tools/status.mjs --prefs-skip "<那條的 text>"`（之後不再問） |
| 照做 | 改預設、程式檢查 | 不改 `shared/`、不改工具：寫進 `work/feedback/learn-tools.md`（給工具作者的回饋，每條一節：規則、證據、現行、建議、代價） |
| 再想想、沒選 | — | 不寫 |

「補充」有改某一條的字，照補充改了再寫。

回報（最多 15 行）：寫進偏好的幾條（原文）、記成工具回饋的幾條和 `work/feedback/learn-tools.md` 的路徑，最後一行 `→ 完成`。

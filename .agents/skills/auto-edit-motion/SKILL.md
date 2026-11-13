---
name: auto-edit-motion
description: 做情境動畫。內容設計動畫：使用者在停點 ③ 勾了的段，設計師子代理從內容出發寫鏡位腳本、接著從空白畫布做出來。模板動畫：填資料工具自動產出，只有使用者要求特殊改動時才手改。當分鏡表確認後有內容設計動畫要做、使用者說「做動畫」、或派工訊息指定某一段（包括改版確認後要重做的那一段）時使用。還沒有確認過的分鏡時不要用（改用 auto-edit-storyboard）。
version: 0.2.0
---
# 情境動畫

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| 確認過的分鏡（`work/storyboard.md`） | 步驟 1–3 | `compositions/x-design-<段>.html` | `audit --only` 0 個 ✖、拼圖親眼看過 | 沒有（做完接停點 ④） |

**兩種動畫不要混**：模板動畫（plan.json 寫 `template`＋`slots`）工具直接產出，不用動手。內容設計動畫（`design: true`）才要設計師，而且不能參考模板。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 主代理，分鏡確認了 | 步驟 1 派工 |
| 你是設計師子代理 | 讀 `references/design.md`，照派工訊息說的那一部分做（那一份就夠，不用往下讀本檔） |
| `design: true` 的段沒有 `work/designs/<段>.md` | 派工照 `--apply-storyboard`（或 `--to-design`）印的「→ 派工：」下面那一行（先寫腳本、接著做動畫）；那行沒寫就交回主代理 |
| 使用者要改模板動畫的文字、站數 | 改 plan.json 的 `slots`，不用動 HTML |
| 使用者要模板動畫做不到的改動（修改單、指定動作） | 步驟 3 |

## 步驟

**1. 派設計師**（主代理）

```
ls projects/<專案>/work/briefs/
```

一段一個子代理，同一則回覆一次全部派出；段數多時一次最多幾個照「→ 派工：」那一行寫的，回來再派下一批。派工訊息**只送** `--apply-storyboard`（或 `--to-design`）印的「→ 派工：」下面那一行（換掉 `<段>`），不要加要求、範圍、檢查指令或完成判準：設計師要的都在 brief 和文件裡，多加的會蓋過文件（派工訊息優先），把設計師帶去翻原始資料。沒有能派子代理的工具才自己一段一段做。要新畫的物件由設計師在同一輪自己畫（一段最多一個，過 `illus-lint` 才用），不用另外派工人；只有使用者另外要求畫元件時才照 `references/illus-worker.md` 派。
完成判準：每個 `design: true` 的段都派了。
常見錯誤：一段一段派 → 慢好幾倍，要同一則回覆一次派出。

**2. 收件**（主代理）

```
node shared/template/tools/build.mjs --project projects/<專案> --review
```

全部回來才跑。它會 build、量全部動畫、出完成態拼圖，停在停點 ④（`auto-edit-review` 流程 A）。有 ✖ 就把那幾行原文交回做那段的子代理。
還有段沒回來時，每收到一個完成通知就跑一次 `node shared/template/tools/build.mjs --project projects/<專案> --design-status`（不要寫 sleep 迴圈等檔案）。印「⚠ 超過 20 分鐘沒進度」的段，停掉原本那個，照它「→ 派工：」下面那一行重派一個新的；沒有 ⚠ 的段繼續等它回報，不要停它。要整段從頭重做（使用者要求重派、換了模型）：先停掉那一段的設計師，跑 `node shared/template/tools/build.mjs --project projects/<專案> --design-canvas <段,段> --reset`（舊的動畫檔和腳本備份到 `work/designs/.old/`、畫布換回空白），再照 `status.mjs` 印的「→ 派工：」下面那一行重派；不要自己搬動或刪除動畫檔，設計師會找不到畫布。主代理不自己寫 x-design 檔；使用者明說要你自己做時，先停掉那一段所有還在跑的設計師（含重派的），確認停了才動那個檔，不然兩邊會寫到同一個檔。
完成判準：`--review` 印出停點 ④ 那兩行。
常見錯誤：每收一個就 build → 不用，全部回來才跑一次。

**3. 手改模板動畫**（只有使用者要求模板做不到的改動才做）

```
node shared/template/tools/audit.mjs --project projects/<專案> --only <段> --shots --sheet
```

直接改 `compositions/<模板>-<段>.html`（改過之後工具不會再覆寫，slots 也不再生效；要回到填資料就刪掉這個檔）。派工照 `references/worker-brief.md`。
完成判準：`audit --only` 0 個 ✖；拼圖親眼看過，對得上要求。
常見錯誤：改了 slots 畫面沒變 → 那個檔手改過，工具印 ⚠「手改過」；要重新產生就刪掉它。

## 自我核對

- [ ] 內容設計動畫是從內容想出來的，不是某支模板的變形
- [ ] 派工訊息是照抄「→ 派工：」下面那一行（綁句、版面、節奏由 audit 量，不寫進派工訊息）
- [ ] 全部回來才跑一次 `--review`，沒有每收一個就 build
- [ ] 拼圖親眼看過：動作看得到、構圖有主角、最重要的詞一眼看得到、遮住字幕看得懂
- [ ] 要重做的段用 `--design-canvas <段> --reset`，沒有自己搬動或刪除動畫檔
- [ ] 主代理沒有自己改 x-design 檔

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| 內容設計動畫段的 ✖（`壓到子母畫面`、`進字幕區`、`綁句對不上`、`未定位頂層`…） | 主代理：把那幾行原文交回做那段的設計師，不自己改動畫檔 | 同一段交回 2 次還有 ✖ 就回報使用者 |
| `✖ … 動態「…」不在語彙表`、`✖ 分鏡表表頭不對` | 分鏡表的問題：改 `work/designs/<段>.md`，動態用語彙表的名稱、表頭照 `references/design.md` 一字不差（內容設計動畫交回設計師改） | 把原文交回主代理 |
| 改動畫時 `✖ … 的 P.at('…')（…）不在分鏡表`（拍改了） | 改 `work/designs/<段>.md` 那張表（手改的模板段第一次 audit 時工具會建好） | 把原文交回主代理 |
| 同一個 ✖ 改兩次還在，或 → 要改 plan.json | 停手，回報 `<段> ✖<N>｜卡在：<那行 ✖ 原文>`，主代理改 plan.json 後重派 | — |
| 子代理交回 `plan.json 比 index.html 新，這次量不準` | 主代理跑 `node shared/template/tools/build.mjs --project projects/<專案>`，再請同一個子代理重跑驗收 | 回報 |

## 工具呼叫預算

工具印「→ 停手」就停，把它上面還在的 ✖ 原文回報；同一個 ✖ 改 2 次還在也一樣（AGENTS.md 規則 9）。讀文件、派子代理、查 `--design-status`、印 ⏳ 之後再跑同一條都不算。設計師子代理一樣：audit 數驗收次數，印「→ 停手」就把那行原文交回主代理。

## 回報格式

子代理只回一行（`references/design.md`、`references/worker-brief.md` 的「回報」）。主代理收件跑的 `--review` 最後印回報段：照 `auto-edit-review` 的「回報格式」照貼、補那幾行。還有段沒回來時不用回報給使用者。

## 什麼時候讀 references/

- `references/design.md`：你就是設計師時才讀（主代理派工不用讀，工具會印派工訊息）。
- `references/design-kit.md`：設計師要用圖示、registry 的現成效果、kit 的現成動作、現成線稿元件，或要新畫一個物件時才讀，而且只讀那一節。
- `references/illus-worker.md`：使用者另外要求畫線稿元件時才讀（內容設計動畫要的新物件由設計師自己畫）。
- `references/worker-brief.md`：要手改動畫（步驟 3）時才讀。
- `references/kit-syntax.md`：手改模板動畫（`x-<模板>-<段>.html`）時才讀；內容設計動畫用 GSAP，不用讀。
- `hyperframes` skill：設計師從空白畫布畫的通用做法（`references/design.md` 會說哪一步讀它的哪一份參考檔）。主代理派工不用載入。

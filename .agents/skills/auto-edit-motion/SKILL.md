---
name: auto-edit-motion
description: 做情境動畫。內容設計動畫：設計師子代理從內容出發，先寫鏡位腳本（停點 ③ 確認），再從空白畫布做出來。模板動畫：填資料工具自動產出，只有使用者要求特殊改動時才手改。當分鏡表確認後有內容設計動畫要做、使用者說「做動畫」「s12 重新設計」、或派工訊息指定某一段時使用。還沒有確認過的分鏡時不要用（改用 auto-edit-storyboard）。
version: 0.2.0
---
# 情境動畫

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| 確認過的分鏡（`work/storyboard.md`） | 步驟 1–3 | `compositions/x-design-<段>.html` | `audit --only` 0 個 ✖、拼圖親眼看過 | 沒有（做完接停點 ④） |

**兩種動畫不要混**：模板動畫（plan.json 寫 `template`＋`slots`）工具直接產出，不用動手。內容設計動畫（`design: true`）才要設計師，而且不能參考模板。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 主代理，分鏡確認了 | 步驟 1 派工 |
| 你是設計師子代理 | 照派工訊息，讀 `references/design-brief.md` 那個階段 |
| 分鏡沒有 `#### 動畫分鏡 <段>` | 不要自己編：交回主代理（`auto-edit-storyboard` 步驟 6），使用者確認後再做 |
| 使用者要改模板動畫的文字、站數 | 改 plan.json 的 `slots`，不用動 HTML |
| 使用者要模板動畫做不到的改動（修改單、指定動作） | 步驟 3 |

## 步驟

**1. 派設計師**（主代理）

```
ls projects/<專案>/work/briefs/
```

一段一個子代理，同一則回覆一次全部派出；段數多時一次最多 8 個，回來再派下一批。派工訊息照 `references/design-brief.md`，階段二。沒有能派子代理的工具才自己一段一段做。新畫 SVG 的：先把所有新畫的元件同時派工人畫完（`references/illus-worker.md`），回來再派動畫。
完成判準：每個 `design: true` 的段都派了。
常見錯誤：一段一段派 → 慢好幾倍，要同一則回覆一次派出。

**2. 收件**（主代理）

```
node shared/template/tools/build.mjs --project projects/<專案> --review
```

全部回來才跑。它會 build、量全部動畫、出完成態拼圖，停在停點 ④（`auto-edit-review` 流程 A）。有 ✖ 就把那幾行原文交回做那段的子代理。
完成判準：`--review` 印出停點 ④ 那一行。
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
- [ ] 每一拍綁講到那個詞（`#N@詞`），差 ≤ 0.5 秒
- [ ] 拼圖親眼看過：動作看得到、構圖有主角、遮住字幕看得懂
- [ ] 同一支插圖、同一個物件在相鄰段長得一樣
- [ ] 沒有改 plan.json、storyboard.md、shared/（子代理）

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `壓到子母畫面`、`進字幕區`、`超出畫面` | 照 → 移元件，主內容留在 `P.region('panelTop')` | 把原文交回主代理 |
| `✖ … 動態「…」不在語彙表`、`✖ 分鏡表表頭不對` | 分鏡表的問題：改 `work/designs/<段>.md` 用語彙表的名稱，告訴主代理重產那段 | 把原文交回主代理 |
| `綁句對不上` | 照它給的 `P.at` 改 | 回報那幾則 |
| `P.spot 要照時間先後寫` | 拍照講解的時間排 | 回報 |
| 工具呼叫超過預算 | 停下來，把卡住的 ✖ 原文交回主代理 | — |

## 工具呼叫預算

每段鏡位腳本 6 次、做動畫 18 次（AGENTS.md「階段預算」）。超過就停下來，把卡住的 ✖ 原文交回主代理。

## 回報格式

子代理照 `references/design-brief.md` 最後一行（最多 10 行）。主代理：`內容設計動畫 <N> 段做好了；audit ✖ 0、⚠ <N>`，接停點 ④。

## 什麼時候讀 references/

- `references/design-brief.md`：派設計師、或你就是設計師時才讀。
- `references/illus-worker.md`：要新畫線稿元件時才讀。
- `references/worker-brief.md`：要手改動畫（步驟 3）時才讀。

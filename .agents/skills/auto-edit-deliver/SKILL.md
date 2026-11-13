---
name: auto-edit-deliver
description: 輸出完成影片並驗收：deliver.mjs 一條指令做完 build、4 秒測試片段確認有聲音、整支 render、qc.mjs final，使用者要求先在背景算（--prerender）過的，內容沒變就直接接手。使用者要在剪映（CapCut）自己剪時，另外用 capcut.mjs 輸出主軌＋每段透明 MOV＋字幕 SRT。封面、縮圖照 references/cover.md 做（剪乾淨之後就能做，不用等完成影片）。當使用者看完完成影片預覽之後說「可以了，輸出完成影片」「輸出」「輸出剪映素材」「要用剪映剪」「輸出 mov」，或說「做封面」「做縮圖」時使用。還有要改的地方、還沒看過完成影片預覽時不要用來輸出完成影片（改用 auto-edit-review）；做封面、縮圖不受這條限制。
version: 0.2.0
---
# 輸出完成影片與驗收

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| 停點 ④ 通過 | 步驟 1 | `output/final.mp4`、`output/test-clips/test-clip.mp4`、`output/qc/qc-sheet.jpg` | `deliver.mjs` 印 ✓ 完成影片；驗收 0 個 ✖ | — |
| 「輸出剪映素材」 | 步驟 2 | `output/capcut/` | `capcut.mjs` 印「✓ N 支都好了」 | — |

**不用輪詢、不用看 log**：`deliver.mjs`、`capcut.mjs` 都在背景跑，前景最多等 9 分鐘；結束碼 75 表示還在跑，再跑一次同一條會接著等，不會重跑。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 停點紀錄 ④ 沒有「通過」，使用者也沒說要輸出 | 改用 `auto-edit-review` |
| 使用者只要剪映素材（不要 final.mp4） | 只做步驟 2 |
| 使用者要封面圖（「做封面」「做縮圖」） | 照 `references/cover.md`（`media.mjs cover`：一個標題出三張給他挑）；沒要求就不做 |

## 步驟

**1. 輸出完成影片**

```
node shared/template/tools/deliver.mjs --project projects/<專案> --said "使用者原話"
```

使用者說要 4K 加 `--resolution 4k`；說字幕不要燒進影片（要字幕檔、要上 CC）加 `--no-captions`，字幕另存 `output/final.srt`。沒說就不加（預設 1080p、燒進影片）。

一條做完：重新產生 → 4 秒測試片段確認有影音 → 整支（成功才換成 `output/final.mp4`，失敗不動舊檔）→ `qc.mjs final`。要整支重畫還是只重畫改到的幾秒、要不要接手背景先算好的那一份（`--prerender`）、`output/final.mp4` 已經是最新的就不重做（印「✓ 已經是最新的」，使用者在剪輯台輸出過也一樣），工具自己判斷，不用另外下指令（要強制整支加 `--force`）。打開 `output/qc/qc-sheet.jpg` 掃一眼。`qc.mjs final` 有 ⚠ 想看那一段：`node shared/template/tools/qc.mjs observe --project projects/<專案> --from <秒> --to <秒>`。
完成判準：印 `✓ 完成影片`；驗收 0 個 ✖（包括沒有「沒有講者小視窗」的 ✖）；每個 ⚠ 寫「刻意」或「要修」。標「要修」的不在這一步改：回報列出來，最後一行改寫 `→ 下一個停點：④ 完成影片預覽（說「改 <段>」開始）`；使用者說要改就走 `auto-edit-review` 流程 B，改完再輸出。

**2. 剪映素材（使用者要求才做）**

```
node shared/template/tools/capcut.mjs --project projects/<專案>
```

在背景跑（同時 3 支）；印「⏳ 還在跑」就再跑同一條（會接著等、做過的不重做），不用每 30 秒查。只重做某幾段：`--only s05,s12`。產出都在 `output/capcut/`：`主軌.mp4`（講者＋人聲＋片尾配樂，沒有字卡和字幕）、每段一支 ProRes 4444 `.mov`（有透明通道，帶自己那段的音效）、`字幕.srt`、`清單.md`（每支放在剪映時間軸的哪一秒）。
完成判準：印「✓ N 支都好了」和「→ 清單：…」那一行；把 `清單.md` 的路徑和怎麼排的四步貼給使用者。章節角標不輸出（使用者問起，請他在剪映用文字貼）。

## 自我核對

- [ ] 用 `deliver.mjs`、`capcut.mjs`，沒有自己拆開 render、輪詢 log
- [ ] 回報段每個「⚠ 說明」的「刻意／要修：<理由>」都填了
- [ ] `output/qc/qc-sheet.jpg` 親眼掃過（掉圖、卡片破版、錄影卡住）
- [ ] build 那一行和停點 ④ 報過的一樣就刪了；有配樂就提醒使用者把出處那一句貼進說明欄
- [ ] 標「要修」的 ⚠ 沒有在這一步改，最後一行改成 → 下一個停點：④

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `⏳ … 還在跑` | 再跑一次同一條指令（會接著等） | — |
| `✖ 長度 Ns，預期 Ns，差 Ns（> …s）→ 重新 build 再 render…` | 照 → 重新 build 再 render：再跑一次同一條 `deliver.mjs`（它會先 build；常見原因是 plan.json 比 index.html 新）。有 `edit.cuts` 時預期長度是 rough.mp4 減掉 cuts，不用自己算 | 停下來回報 |
| `✖ <段> 是全畫面清單卻沒有講者小視窗：work/rough.mp4 在 …–… 是全黑（原始素材不是）→ 初剪壞了…` | 不交、不改 plan.json；照 → 跑 `verify-rough` 重做初剪 | 停下來回報 |
| render 失敗、記憶體不足 | 看 `work/render.log` 最後幾行，再跑一次（記憶體 8GB 以下會自動單 worker，USAGE-reference.md R13） | 停下來回報：指令、log 最後 20 行、已經試過什麼 |
| 已經在輸出、被鎖住 | 使用者可能按了剪輯台的「輸出完成影片」，等它做完；要取消：`deliver.mjs --project projects/<專案> --cancel` | 停下來回報 |
| 剪映素材 `✖ N 支失敗` | 看 `output/capcut/render.log` 最後幾行，修好後同一條再跑一次（做過、沒變的會略過） | 停下來回報 |
| `⚠ … 分鐘沒有新的輸出` | 再跑一次同一條；還是一樣就跑那一行印的取消指令（剪映素材：`node shared/template/tools/capcut.mjs --project projects/<專案> --cancel`），回報原文 | — |
| qc final 的 ✖（格式、長度） | 照 `→` 改；格式不對多半是 render 用錯參數 | 停下來回報 |
| 工具印「→ 停手」 | 停下來，把它上面還在的 ✖ 原文回報，說卡在哪 | — |

## 工具呼叫預算

`deliver.mjs` 由工具數：印「→ 停手」就停，把它上面還在的 ✖ 原文回報（印 ⏳ 之後再跑同一條不算）。剪映素材、封面：同一個 ✖ 改 2 次還在就停下來回報。

## 回報格式

完成影片：照貼 `deliver.mjs` 最後印的回報段（「── 回報（照貼；要你判斷的另外補一行）──」下面每一行，`<deliver-assets>` 已經在裡面），把每個「⚠ 說明：…｜刻意／要修：<理由>」填好；build 那一行和停點 ④ 報過的一樣就刪掉。

剪映素材（工具沒有回報段）：

```
剪映素材：output/capcut/（<「✓ N 支都好了」原文>）
清單：output/capcut/清單.md（照「放在」排進剪映）；字幕：output/capcut/字幕.srt
→ 完成
```

## 什麼時候讀 references/

- `references/cover.md`：使用者說「做封面」「封面圖」「做縮圖」時才讀（照它做，不做本檔的步驟）。

---
name: auto-edit-deliver
description: 輸出完成影片並驗收：先輸出 3–5 秒測試片段確認有聲音與版面，再在背景 render 整支 output/final.mp4，跑觀影總表與 qc.mjs final，照驗收清單回報。使用者要在剪映（CapCut）自己剪時，另外用 capcut.mjs 輸出主軌＋每段透明 MOV＋字幕 SRT。當使用者看完完成影片預覽之後說「可以了，輸出完成影片」「輸出」「輸出剪映素材」「要用剪映剪」「輸出 mov」時使用。還有要改的地方、還沒看過完成影片預覽時不要用（改用 auto-edit-review）。
version: 0.1.0
---
# 輸出完成影片與驗收

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| 停點 ④ 通過 | `build.mjs --test`、hyperframes `render`、`qc.mjs observe`、`qc.mjs final` | `output/test-clips/test-clip.mp4`、`output/final.mp4`、`work/observe/`、`output/qc/qc-sheet.jpg` | `qc.mjs final` 0 個 ✖、每個 ⚠ 都有說明 | 沒有 |
| 「輸出剪映素材」 | `capcut.mjs` | `output/capcut/`：`主軌.mp4`、每段 `.mov`、`字幕.srt`、`清單.md` | `capcut.mjs` 印「✔ N 支都好了」、`.mov` 的 ffprobe 有 `yuva` | 沒有 |

做法的唯一定義：USAGE.md 2.7（render）、2.8（驗收）；交付清單：`shared/template/REVIEW.md` §5。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 停點紀錄 ④ 沒有「通過」 | 改用 `auto-edit-review` |
| plan.json 比 `work/hyperframes/index.html` 新 | 先 `node shared/template/tools/build.mjs --project projects/<專案>` |
| 使用者只要剪映素材（不要 final.mp4） | 只做步驟 5 |
| 停點紀錄 ④ 最後一列是「通過」、原話是「在剪輯台按「輸出完成影片」」，而且 `output/final.mp4` 比 plan.json 新 | 使用者已在剪輯台輸出並驗收（019），不要重做；要看內容才跑步驟 4 |

## 步驟

**1. 挑測試位置**

```
node shared/template/tools/build.mjs --project projects/<專案> --check
```

挑第一張資訊卡出現的那段（使用者有指定就照他的）；有螢幕錄影時再挑一段有紅框或放大鏡的。起點用 `--check` 報告那段「起–迄」的起點（完成影片秒數）。
完成判準：寫下起點秒數。
常見錯誤：有 `edit.cuts` 時用了 rough.mp4 的秒數 → 一律用報告上的完成影片秒數。

**2. 測試片段（AGENTS.md「剪好看的數字」：3–5 秒）**

```
node shared/template/tools/build.mjs --project projects/<專案> --test <起點>,4
(cd projects/<專案>/work/hyperframes && npx hyperframes render -c compositions/test-clip.html --quality draft -o ../../output/test-clips/test-clip.mp4)
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 projects/<專案>/output/test-clips/test-clip.mp4
node shared/template/tools/qc.mjs observe --project projects/<專案> --file projects/<專案>/output/test-clips/test-clip.mp4 --offset <起點>
```

完成判準：ffprobe 印出 `video` 與 `audio` 兩行；`work/observe/sheet-01.jpg` 看過，版面和完成影片預覽一樣。
常見錯誤：`⚠ s04 在 49.5s 就開始了`（build）或 `⚠ s04 在 0:49.5 就開始了，測試片段不含這段`（observe）→ 要看那段，把 `--test` 的起點改成它印的秒數重做；`qc.mjs observe` 印 ✖ 找不到 Chrome → `npx hyperframes browser ensure` 再跑一次。

**3. 整支 render（背景）**

```
Mac：(cd projects/<專案>/work/hyperframes && HYPERFRAMES_RENDER_DETACHED=1 npx hyperframes render --fps 30 --quality looks --output ../../output/final.mp4 > ../render.log 2>&1 &)
Mac 看進度：tail -n 3 projects/<專案>/work/render.log
Windows（PowerShell）：照 USAGE.md 2.7 的 $env:HYPERFRAMES_RENDER_DETACHED 與 Start-Process 那幾行
```

背景模式是 HyperFrames 自己的環境變數 `HYPERFRAMES_RENDER_DETACHED=1`，不要用 `nohup`、也不要只加 `&`（子代理的回合結束時 render 會被取消）。
完成判準：log 出現 `Render complete`；交付一律 `--quality looks`。
常見錯誤：log 最後是 `render_cancelled_parent_exited` → 少了 `HYPERFRAMES_RENDER_DETACHED=1`，照上面那一行重跑；log 停在同一行很久 → 回報使用者，不要重開第二個 render。

**4. 觀影總表與驗收**

```
node shared/template/tools/qc.mjs observe --project projects/<專案>
node shared/template/tools/qc.mjs final --project projects/<專案>
```

直式專案 `qc.mjs final` 的格式是 1080×1920，`qc-sheet.jpg` 上有安全區框，字不能出框。先看 `work/observe/index.md` 的靜止區間與接縫（門檻與看法照 REVIEW.md §3）；總表的「小視窗（子母畫面段）」欄每段要是 `有`，看到 `無`、`部分（m:ss.s 起沒有）` 就看 `qc.mjs final` 的原因。再跑 `qc.mjs final`，打開 `output/qc/qc-sheet.jpg` 掃一眼（最上面標 `theme: light`／`theme: dark`，要和 plan.json 一致）。`qc final` 會量字幕樣式（底板 y 956–1074、字高 71，照剪映）與字幕文字（「，」「。」、不到 0.6 秒），都是 ⚠：樣式 ⚠ 多半是完成影片在 captions.css 改版前 render 的，重新 build、render；還是 ⚠ 就回報維護者，不要改 `shared/`。字幕文字 ⚠ 照 → 到剪輯台改。
完成判準：`qc.mjs final` 0 個 ✖（包括沒有「沒有講者小視窗」的 ✖）；每個 ⚠ 寫「刻意」或「要修」；REVIEW.md §5 交付清單每一項都打勾。
常見錯誤：✖ 長度不符 → 確認 build 和 render 是同一版 plan.json（plan.json 比 index.html 新就重 build、重 render）；印 `✖ s21 是全畫面清單卻沒有講者小視窗：work/rough.mp4 在 …–… 是全黑（原始素材不是）→ 初剪壞了，跑 node shared/template/tools/media.mjs verify-rough …` → 不要交，不是版面的問題、不要改 plan.json；照 → 重做初剪（`auto-edit-rough` 步驟 6），再 build、render。

**5. 剪映素材（使用者要求才做）**

```
node shared/template/tools/capcut.mjs --project projects/<專案> --dry-run
node shared/template/tools/capcut.mjs --project projects/<專案> --background
node shared/template/tools/capcut.mjs status --project projects/<專案>
```

先 `--dry-run` 看會出幾支、多長（每段約 30 秒 render），再在背景跑，每 30 秒跑一次 `status` 直到「✔ 做完了」。只重做某幾段：`--only s05,s12`。產出都在 `output/capcut/`：`主軌.mp4`（講者＋人聲＋片尾配樂，沒有字卡和字幕）、每段一支 ProRes 4444 `.mov`（有透明通道，帶自己那段的音效）、`字幕.srt`（畫面上實際顯示的字幕）、`清單.md`（每支放在剪映時間軸的哪一秒）。
完成判準：最後一次 `status` 是「✔ 做完了」；前景跑的話印「✔ N 支都好了」與 `驗證 …：…yuva444p12le…`（有透明通道）；把 `清單.md` 的路徑和怎麼排的四步貼給使用者。
常見錯誤：`✖ build 沒過` → 照它印的 ✖ 改 plan.json；某一支 `✖ render 失敗` → 看 `output/capcut/render.log` 最後幾行，修好後同一個指令再跑一次（做過、沒變的會略過）；使用者問章節角標 → 不輸出，請他在剪映用文字貼。

## 自我核對

- [ ] 先測試片段、確認有音軌，才 render 整支
- [ ] 交付用 `--quality looks`
- [ ] `qc.mjs final` 0 個 ✖（沒有「沒有講者小視窗」的 ✖），⚠ 逐項說明
- [ ] 附上 `output/qc/qc-sheet.jpg`
- [ ] 貼了 build 的「人聲響度」「音效比例」「剪接點微淡化」「講者調光」「講者瘦臉」「結尾配樂」六行（音效次數、密度有 ⚠ 也貼；有配樂就把出處那一句提醒使用者貼進說明欄）
- [ ] 停點紀錄、`work/製作進度.md` 的階段表更新到「交付 ✅」

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| render log 在 `Render complete` 之前出現 `Error`、記憶體不足 | 重跑一次（記憶體 8GB 以下會自動單 worker，USAGE-reference.md R13） | 停下來回報：指令、log 最後 20 行、已經試過什麼 |
| render log 出現 `render_cancelled_parent_exited` | 用背景模式重跑：指令前面加 `HYPERFRAMES_RENDER_DETACHED=1`（步驟 3 那一行），不要用 `nohup` | 停下來回報：指令、log 最後 20 行 |
| `✖ 找不到完成影片 … → 先 render` | 確認步驟 3 的 log 有 `Render complete`、路徑是 `output/final.mp4` | 停下來回報 |
| qc final 的 ✖（格式、長度） | 照 `→` 改；格式不對多半是 render 用錯參數 | 停下來回報 |
| `✖ … 卻沒有講者小視窗：work/rough.mp4 在 …–… 是全黑（原始素材不是）→ 初剪壞了…` | 照 → 跑 `verify-rough` 重做初剪，再 build、測試片段、render | 停下來回報：verify-rough 原文、已經試過什麼 |
| render log 看了 20 次還沒完成 | 回報目前進度（log 最後 3 行） | — |

## 工具呼叫預算

最多 12 次，看 render log 另計最多 20 次（AGENTS.md「階段預算」）。超過就停下來回報卡在哪。

## 回報格式

```
完成影片輸出完成：output/final.mp4（<長度>s）
驗證：ffprobe → 1920×1080、30fps、有音軌
qc final：<✔／⚠／✖ 原文，每項一行>
⚠ 說明：<每個 ⚠ 一行：刻意／要修＋理由>
人聲響度 …、剪接點微淡化 …、音效比例 …、講者調光 …、講者瘦臉 …、結尾配樂 …（build 原文）
觀影總表：work/observe/index.md（靜止區間 <N> 段，說明見上）
output/qc/qc-sheet.jpg
→ 完成
```

# 派情境動畫子代理的派工訊息（主代理用）

時機：停點 ③ 通過、正式 plan.json 已登記每段情境動畫（`"type": "custom"`、`src`、`layout`）、build 過一次之後（剛複製、還沒改的範例 build 只 ⚠「還是範例原文」，不擋）。子代理改完自己的 x 檔跑 `audit --only` 不用重 build：新加的 `P.at('#N@詞')` 由 audit 用 `build --check` 現算的秒數量、截圖（`--shots`），不用等主代理 build。

- 2 段以上、而且有能派子代理的工具：**一段一個子代理，同一則回覆一次全部派出**（平行跑；一段一段派會慢好幾倍）。派完等全部回來，再照 AGENTS.md「子代理分工」第 2 條收件、整合。
- 每段把字幕與確認過的動畫分鏡原文貼進派工訊息，子代理就不用自己讀 rough.srt、storyboard.md。
- 沒有子代理工具，或只有 1 段：自己照 `auto-edit-motion` 一段一段做。
- 跨段一致：派工前先寫一段「共用元件規格」貼進每一則（同一種元件的大小、位置、配色，例：手機插圖寬 360、放畫面左側 x 300；進度膠囊列在 y 120、完成綠✓／目前主色／未到灰）。3 段以上在講同一份清單的第 1..N 項時，用同一排進度膠囊、第一格就在原位。參考專案三個子代理把同一個元件做成 126／100／118 px，要整片重修。

## 派工訊息（每段一則，`<…>` 換成實際值）

```
你是情境動畫子代理：照 .agents/skills/auto-edit-motion/SKILL.md 做一段情境動畫，做完照 references/worker-report.md 回報（最多 25 行）。
專案：projects/<專案>
段落：<段 id>（<情境>；<起>–<迄>；layout <layout>）
你只能寫：projects/<專案>/work/hyperframes/compositions/x-<名稱>.html（還沒有就從 shared/template/custom/<範例>.html 複製）
不能做：改 plan.json、work/rough.srt、work/storyboard.md、shared/、assets/；跑 build（不加 --check）、snapshot、preview、render
可以跑：
  node shared/template/tools/build.mjs --check --project projects/<專案>
  node shared/template/tools/audit.mjs --project projects/<專案> --only <段 id> --shots
  （--shots 把中點、靜止、完成態各存一張截圖到 work/audit-shots/，你看不到 snapshot，用它看自己那段）
只讀這些：auto-edit-motion 步驟 1–7；USAGE-reference.md R7.2、R7.3、R7.6；shared/template/BEATS.md 這段情境的拍型（示意動畫加 §5）
注意：拍的先後照口播的詞序（範例分鏡的拍序只是範例）；根元素的 data-cues-sample 只給畫廊預覽用，不用改
這段的字幕（句號：文字）：
#<N> <字幕原文>
#<N+1> <字幕原文>
共用元件規格（每段相同，主代理寫）：
<元件：大小、位置、配色>
確認過的動畫分鏡（work/storyboard.md 原文）：
#### 動畫分鏡 <段 id>
<整張表原文>
驗收：build --check 這段 0 個 ✖；audit --only <段 id> 0 個 ✖；打開 --shots 的截圖，對著分鏡一拍一拍看：每個動作真的看得到（移動有位移、狀態換了）、同一個畫面視角一致、字和插圖沒有擠在一角（回報寫你看了哪幾張、看到什麼）
```

# 手改動畫：子代理的派工與回報

模板動畫平常填資料就好（改 plan.json 的 `slots`），工具會自己產生。這份只用在兩種情況：使用者要的改動 `slots` 做不到；或要改一段內容設計動畫裡的東西（修改單、停點 ④ 口頭說的都算）。

2 段以上、有能派子代理的工具：**一段一個子代理，同一則回覆一次全部派出**，全部回來才由主代理跑 `--review` 或 `versions.mjs finish`。沒有子代理工具才自己一段一段做。

跨段一致：3 段以上在講同一份清單時，派工前先寫一段「共用元件規格」（大小、位置、配色）貼進每一則，不然會做成不同大小，要整片重修。

## 派工訊息（每段一則，`<…>` 換成實際值）

```
你負責改一段動畫：<段 id>（<起>–<迄>）。
專案：projects/<專案>
你只能寫：projects/<專案>/work/hyperframes/compositions/<檔名>（build 已經產生）、projects/<專案>/work/hyperframes/illus-local/ 底下自己新畫的 SVG、projects/<專案>/work/reports/<段 id>.md；內容設計動畫段另外可以寫 projects/<專案>/work/designs/<段 id>.md（拍變了就改這張動畫分鏡表，audit 照它對）
不能做：改 plan.json、work/rough.srt、work/storyboard.md、shared/、assets/；跑 build、snapshot、render（查圖示名稱的 build.mjs --icons 可以跑）；讀 shared/template/tools/、shared/template/kit/*.js、USAGE-reference.md、別段的 compositions；用 node 或 python 拆元件、圖示的 SVG（寫 data-illus、data-icon）
改法：用 edit 改要改的那幾處，不要整份重寫（重寫一次和第一次做一樣久）；這份工作不用載入 hyperframes skill（從空白重畫的設計師才用）
寫法：x-design-<段 id>.html 照 .agents/skills/auto-edit-motion/references/design.md 第 2 節用 GSAP 改。模板檔（x-<模板>-<段 id>.html）沿用檔裡原本的 id 前綴、檔頭【D 下限】和版面範圍，不要改成 x-design 的寫法；語法照 .agents/skills/auto-edit-motion/references/kit-syntax.md
要改什麼：<修改單的標籤與描述，或使用者原話>
這段的字幕：
#<N> <字幕原文>
共用元件規格（有才寫）：<元件：大小、位置、配色>
驗收（一條指令，內含這段的所有檢查；別段有 ✖ 不影響你）：
node shared/template/tools/audit.mjs --project projects/<專案> --only <段 id> --shots --sheet
✖ 全修。→ 寫「重跑 build」「snapshot」時，只要改好這支檔、重跑上面那條 audit；要改 plan.json 才修得掉的，把那行原文交回主代理。同一個 ✖ 改兩次還在就停手回報。
⚠ 只修一輪：照 → 用 edit 改那幾行（不要整份重寫），再跑同一條 audit 一次就停，留下的 ⚠ 和理由寫進 work/reports/<段 id>.md。印「通過」或「可以交件」都算過關。
0 個 ✖ 才會出拼圖，交件前打開 work/audit-shots/sheet-<段 id>.jpg 看一次：動作看得到、字和插圖沒有擠在一角。子母畫面的小視窗在這張圖是空框，正常。
```

改過的檔工具不會再覆寫，那段的 `slots` 也不再生效；要回到填資料就刪掉那個檔。

不 render：子代理驗收用 audit 的拼圖；作者看會動的樣子用 `versions.mjs finish` 印的完成影片預覽網址（瀏覽器即時播放）。

## 回報

只回一行：`<段> ✖0 ⚠<N>｜改了什麼，一句話`；停手時回 `<段> ✖<N>｜卡在：<那行 ✖ 原文>`。模板段畫了游標按下時加 `｜clicks：#N@詞`（主代理要寫進 plan.json）；內容設計動畫段直接在檔裡寫 `P.sfx('click', '#N@詞')`，不用回報。留著的 ⚠ 和理由寫到 `work/reports/<段>.md`。

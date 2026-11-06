# 手改動畫：子代理的派工與回報

模板動畫平常填資料就好（改 plan.json 的 `slots`），工具會自己產生。這份只用在兩種情況：使用者要的改動 `slots` 做不到；或修改單要改一段內容設計動畫。

2 段以上、有能派子代理的工具：**一段一個子代理，同一則回覆一次全部派出**，全部回來才由主代理跑 `--review` 或 `versions.mjs finish`。沒有子代理工具才自己一段一段做。

跨段一致：3 段以上在講同一份清單時，派工前先寫一段「共用元件規格」（大小、位置、配色）貼進每一則，不然會做成不同大小，要整片重修。

## 派工訊息（每段一則，`<…>` 換成實際值）

```
你負責改一段動畫：<段 id>（<起>–<迄>）。
專案：projects/<專案>
你只能寫：projects/<專案>/work/hyperframes/compositions/<檔名>（build 已經產生）
不能做：改 plan.json、work/rough.srt、work/storyboard.md、shared/、assets/；跑 build、snapshot、render
寫法：.agents/skills/auto-edit-motion/references/design-brief.md「階段二」的畫布、寫法、時間軸、不能做
要改什麼：<修改單的標籤與描述，或使用者原話>
這段的字幕：
#<N> <字幕原文>
共用元件規格（有才寫）：<元件：大小、位置、配色>
驗收（一條指令，內含這段的所有檢查；別段有 ✖ 不影響你）：
node shared/template/tools/audit.mjs --project projects/<專案> --only <段 id> --shots --sheet
✖ 全修；⚠ 照 → 改，或回報寫理由。打開它印的 work/audit-shots/sheet-<段 id>.jpg 親眼看：動作看得到、字和插圖沒有擠在一角。子母畫面的小視窗在這張圖是空框，正常。
```

改過的檔工具不會再覆寫，那段的 `slots` 也不再生效；要回到填資料就刪掉那個檔。

## 回報（最多 25 行）

```
段落：<段 id>
檔案：<路徑>
改了什麼：<一兩句；沒照做的與理由>
綁句：<P.at 清單，例 #18@剪輯清單、#20>；畫了游標按下時加「clicks：#N@詞」請主代理寫進 plan.json
audit --only <段 id>：✖ <N>、⚠ <N>；留著的 ⚠ 與理由
拼圖看到：<一句>
```

# 063 手機確認頁（site）

作者原話：「然後我覺得讓每個動畫的最後一格變成發佈網頁這塊，希望直接設計一個模板讓 AI 塞入，這是因為遠端時我需要在手機上確認，上面會需要有動畫編號、最後一個影像、想調整的輸入框與基礎選項，最下面可以複製提示詞」

## 做了什麼

1. 固定模板 `shared/template/site/review.html`（手機 390 寬優先，桌機也能看；跟著 `kit/brand.css` 的主色）。工具只塞資料，AI 不寫版面。
   - 上方：專案名稱、輸出時間、段數（字卡、動畫、錄影、圖片各幾段）、範圍（全部／r<N> 改到的／指定的）、段號導覽列（填過的標 ✎）。
   - 每段一張卡：大字段號、種類標籤、完成影片時間、這段在講什麼、動畫是什麼、最後一格（點了全螢幕放大）、對應字幕（收合）、想怎麼改（和剪輯台修改單同一套標籤：動畫段一組、錄影段一組）、動畫段的「重新設計這一段」、想調整的輸入框。
   - 填的東西存在那支手機（`localStorage`，每個專案一份），重新整理還在；「清空」要按兩次。
   - 最下面固定「複製提示詞（N 段）」：只收有填的段；沒填時是灰的，旁邊寫原因。剪貼簿不行時開一個可以手動複製的框。
2. `versions.mjs site --project projects/<專案> [--round | --only s01,s02] [--json]` → `work/site/index.html`（一個檔就是整包，圖片內嵌成 data URI，可以直接發布）。
   - 預設放全部段（字卡、動畫、錄影、圖片，錄影段標成錄影）；`--round` 只放最新一輪 r<N>.md 改到的段；`--only` 指定段（不在 plan.json ✖ 有 →）。
   - 最後一格：沿用已有的完成態截圖（`work/storyboard-preview/` 的分鏡截圖，`shots.json` 這段最後一張；`work/audit-shots/` 秒數最大的那張；取比較新的）。沒有、或比那段的動畫檔／最新版本舊的段，一次用 `qc.mjs storyboard --only` 補截；補截失敗照樣產生、那幾段標「沒有截圖」或「可能不是最新的」，印 ⚠ 與 →。
   - 壓圖：橫式寬 720、直式寬 540，一張 ≤ 120 KB（先降品質再縮小）；段很多時每張的上限再降，整包盡量 ≤ 15 MB。
3. 標籤與修改單格式抽成共用模組 `shared/template/tools/lib/requests-md.mjs`（沒有 import，瀏覽器和 Node 都能用）：剪輯台從 `/lib/requests-md.mjs` 載入，手機確認頁把它去掉 `export` 內嵌。兩邊複製的修改單是同一支 `rqMarkdown`，開頭都是 `# 剪輯台修改單`。手機不能寫檔，所以手機版第三行多一句「這份是從手機確認頁複製的整份修改單：先把整份原文存成 projects/<專案>/work/feedback/editor-requests.md（覆寫），再…」，來源那一行寫「從手機確認頁複製」；其他每一行和剪輯台一樣。
4. 文件：`auto-edit-review` 流程 H、`references/mobile-site.md`（產生、發布、收到貼回來的修改單）、`references/editor-requests.md`（流程 F 開頭：貼上的是手機確認頁的整份，先存成 editor-requests.md 再 `begin --requests`）、AGENTS.md 路由、EDITOR.md「修改單」、PROMPTS.md 5f、CONTENTS.md。

## 決定

- 指令放在 `versions.mjs site`（`--round` 要讀回饋輪），模板放 `shared/template/site/`（和 062 的選擇頁一起）。
- 一個 HTML 檔、圖片內嵌：平台的網頁發布（MiniMax Site、Claude Artifact）多半只收一個檔，手機上也不會有圖片載不到的問題。
- 段的範圍預設是全部；長片段很多時用 `--round`／`--only` 控制大小（超過 15 MB 印 ⚠ 建議這兩個）。
- 截圖只補「沒有或舊的」，不整支重截；補截要 plan 已經 build 過（qc 自己會擋），擋到就沿用舊圖並標出來。
- 縮圖右上角常有章節角標，放大的小圖示放左上角。

## 改了哪些檔

- 新增：`shared/template/site/review.html`、`shared/template/tools/lib/requests-md.mjs`、`shared/template/tools/lib/review-site.mjs`、`.agents/skills/auto-edit-review/references/mobile-site.md`、`dev/tests/review-site.test.mjs`
- 修改：`shared/template/tools/versions.mjs`（site 子指令、--help）、`editor.mjs`（送 `/lib/requests-md.mjs`）、`editor/app.js`（標籤、修改單格式改用共用模組，拿掉重複的 `RQ_TAGS`、`rqMs`、`rqTime`、`fmtTime`）、`.agents/skills/auto-edit-review/SKILL.md`、`references/editor-requests.md`、`AGENTS.md`、`shared/template/EDITOR.md`、`PROMPTS.md`、`CONTENTS.md`

## 端對端（worktree 的 projects/example）

```
$ node shared/template/tools/versions.mjs site --project projects/example
✓ 手機確認頁：projects/example/work/site/index.html（全部段落：動畫與字卡 12、錄影 0；0.7 MB，最大一張 54 KB）

$ node shared/template/tools/versions.mjs site --project projects/example --round
補截 2 段的最後一格（s0103、x0106）…
✓ 手機確認頁：projects/example/work/site/index.html（r2 改到的 2 段：動畫與字卡 2、錄影 0；0.1 MB，最大一張 51 KB）
最後一格：沿用 0 張、補截 2 段
```

plan.json 在 build 之後改過時補截會被擋，照樣產生並印：

```
⚠ 補截沒有成功，x0106 用舊圖或沒有圖：plan.json 在上次 build 之後改過 → 先跑 node shared/template/tools/build.mjs --project projects/example，再截圖；還是失敗就照樣發布，回報這行
```

在 390×844 的瀏覽器填 s0103（動作慢一點）、x0106（文字少一點＋描述）按「複製提示詞」，把複製的整份存成 `work/feedback/editor-requests.md` 後 `versions.mjs begin --requests` 開出 r2，`finish` 走完（見 062 端對端第 2 步）。複製出來的開頭：

```
# 剪輯台修改單

照剪輯台修改單改這 2 段（projects/example/work/feedback/editor-requests.md）：這份是從手機確認頁複製的整份修改單：先把整份原文存成 projects/example/work/feedback/editor-requests.md（覆寫），再照 auto-edit-review 流程 F 做（.agents/skills/auto-edit-review/references/editor-requests.md），不用先出提案，停在停點 ④。這次沒有要重新設計的段：都在現有的動畫上改。存好之後第一步跑 node shared/template/tools/versions.mjs begin --project "projects/example" --requests

（2026-11-19 10:52 從手機確認頁複製）

## 1. s0103　每錄完一段都要跑到手機旁播放確認
- 動畫：資訊卡 key-point（重點字卡）
- 完成影片時間：0:18.0–0:31.8（projects/example/work/hyperframes/plan.json：#9 → #15）
- 做法：在現有的動畫上改（沒勾「重新設計」）。改 plan.json 的資料、換模板或手改那支檔；不要改成 "design": true
- 要改：動作慢一點
- 對應字幕：
  - #9 過去正式開拍前
  ...
```

截圖（本資料夾，390×844、2 倍）：

- `shot-390-top.png`：全部段落，頁首與第一張卡
- `shot-390-fill.png`：填了兩段（標籤、描述），段號導覽標 ✎、底部「複製提示詞（2 段）」、複製後的提示
- `shot-390-zoom.png`：點最後一格放大
- `shot-390-round.png`：`--round` 只放 r2 改到的 2 段

## 測試

（見文末「測試輸出」）

## 沒做的

- 不會自己發布：工具只產生 `work/site/index.html`，發布靠平台（MiniMax Site、Claude Artifact）；不能發布時給檔案路徑。
- 填的內容只存在那支手機的瀏覽器；換手機、換瀏覽器要重填。
- 修改單只勾「重新設計」、沒有標籤也沒寫描述的段，`begin --requests` 照樣放進這一輪，但 r<N>.md 的「原話」不會列那一段（`requestNotes` 原本就只收有標籤或描述的段，沒改）。
- 標題那一行（`## k. <段>　<名稱>`）：剪輯台用時間軸上的段名，手機確認頁用分鏡寫的「這段在講什麼」，兩邊的名稱可能不一樣；格式相同。
- 沒有「這裡只有講者，想加畫面」的空檔段（剪輯台修改單的 `t<秒>`）；手機確認頁只放 plan.json 裡有的段。

## 測試輸出

和 062 一起跑，完整輸出與失敗的說明在 `specs/062-learn-from-edits/spec.md`「測試輸出」。這支的新測試 `dev/tests/review-site.test.mjs`（7 則：siteSegments、roundSegs、findShot／sourceTime、buildSite 壓圖與補截、修改單格式和剪輯台只差兩行、390 寬 UI 實點並把複製的整份存成修改單後 `begin --requests` 開得了回饋輪、CLI 錯誤）：

```
✔ siteSegments：照完成影片時間排；段號、種類標籤（字卡／動畫／錄影／圖片）、動畫是什麼、時間、對應字幕；--only、--round 的範圍與錯誤
✔ roundSegs：最新一輪 r<N>.md 的「改了哪幾段」與分類表的段
✔ findShot／sourceTime：分鏡截圖和量測截圖取比較新的；動畫檔、最新版本比截圖新＝要補截
✔ buildSite：沿用新的截圖、舊的與沒有的一次補截；每張 ≤ 120 KB、寬 720；整包一個 index.html、資料內嵌、佔位都換掉
✔ 修改單格式：手機確認頁和剪輯台同一支 rqMarkdown；只差第三行（多了「先存成檔」）和來源那一行
✔ 手機確認頁 UI：390 寬；點標籤、寫描述、勾重新設計會記下；沒填時複製鍵灰的並說原因；複製的修改單照流程 F 開得了回饋輪
✔ versions.mjs site：--round 和 --only 不能一起用；沒有 plan.json 時 ✖ 有 →
```

剪輯台原本的修改單 UI 測試（`editor-requests-ui.test.mjs`，改用共用模組之後）在整合測試裡通過。

# 017 分鏡表網頁（停點 ③）

來源：作者 2026-11-06 說「這個也設計成網頁，背後資料依舊是 markdown，但我可以做內容編輯，這樣彈性更高；完成後也要截圖更新到 README 跟官網上」。

## 定案

| 題目 | 定案 | 理由 |
|---|---|---|
| 範圍 | 停點 ③ 的整份 `work/storyboard.md`，新頁 `/storyboard`；改版提案 `work/versions/<段>/v<N>/分鏡.md` 這次不動 | 作者指的是分鏡表；改版提案另一條流程，要做再加 |
| 真相在哪 | 仍是 `work/storyboard.md`；頁面每次只動改到的那幾行，其他字元原樣保留（含 CRLF、BOM） | `audit.mjs`、`versions.mjs`、`illus-lint` 和 AI 照舊讀檔 |
| 可以改什麼 | 欄位內容（冒號前的欄名不動）、表格的格、加減列、金句勾選（`☑`／`☐`）；要改結構用該段的「改原始 Markdown」 | 彈性來自原始 Markdown；日常修改不用碰語法 |
| 保護 | 表頭與段標題不能點來改（audit 逐字讀）；原始 Markdown 第一行要保留同一個標題；動畫分鏡表頭被改掉、段號重複時頁面顯示警告 | 改壞了工具會讀不到 |
| 存檔 | 離開欄位或按 Enter 就存，Esc 取消；存前比對檔案 hash，並比對那一格改之前的內容，對不上就不寫，沒存到的文字留在頁面上 | 沿用「被別人改過就不寫」；文字比勾選值錢，不能直接丟 |
| 只能看 | 製作進度「③ 分鏡表」最後一列是「通過」或「略過」；「修改後重停」「待回覆」又能改；改版的 `③ 分鏡表（s12 v2）` 不算 | 通過後已照這份寫正式 plan.json，再改不會生效 |
| 預設展開 | 需要決定的事、總覽、每段、動畫分鏡展開；四種版面、圖示表、情境判定、插圖清單收起 | 先看要決定的內容，參考資料要用再開 |
| 服務 | 沿用 `editor.mjs`，多一頁 `/storyboard`；啟動時多印「分鏡表：<網址>」 | 不新增指令與名詞 |

## 做了什麼

| 檔案 | 內容 |
|---|---|
| `shared/template/tools/editor/server/storyboard.mjs`（新）、`editor/storyboard.html`、`editor/storyboard.js`（新） | `/api/storyboard`、`/api/storyboard/save`、`/storyboard-preview/<檔名>`、頁面 |
| `shared/template/tools/editor.mjs` | 路由；啟動印分鏡表網址 |
| `shared/template/tools/status.mjs` | 停點 ③ 的下一步提到網頁 |
| `AGENTS.md`、`auto-edit-storyboard/SKILL.md`、`references/storyboard-template.md`、`USAGE.md`、`EDITOR.md`、`PROMPTS.md`、`README.md`、`dev/site/index.html` | 停點 ③ 改給網址、退路（網頁開不起來改給 `work/storyboard.md`）、看圖說明 |
| `specs/contracts/stop-points.md`、`dev/tests/docs.test.mjs` | 停點 ③ 那一行 |
| `dev/tools/docs-visuals.mjs`、`dev/site/guides/storyboard.jpg` | 文件截圖 |
| `dev/tests/editor-storyboard.test.mjs`（新） | API、只動改到的行、衝突、行號錯開、唯讀、CRLF／BOM |

停點 ③ 的最後一行：`⏸ 停點 ③ 分鏡表｜請看：<分鏡表網址>｜請回：改好後說「可以」，或要改的地方`

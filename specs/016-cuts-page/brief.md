# 016 剪輯清單網頁（停點 ①）

來源：作者 2026-11-05 說「讓使用者閱讀 Markdown 難度太高也不直覺，不如把 cuts.md 轉成網頁；剪輯這部分是 checkbox 預設全選，不要的取消，Markdown 也跟著改，AI 照這份文件做後續」。

## 定案

| 題目 | 定案 | 理由 |
|---|---|---|
| 範圍 | 只做停點 ① 的 `/cuts`（作者選「先做剪輯清單頁」） | 其他停點各有網頁（構圖台、Studio）或之後再做 |
| 進度列 | 不放（作者看過後說「上面有要列出那麼多資訊嗎？構圖、分鏡都是其他網頁了」） | 這頁需要的狀態（AI 還在找、等你確認、已輸出只能看）頁面本身已表達 |
| 試聽 | 每列 ▶ 播 `work/main.mp4` 那段前後各多 1 秒，紅色標出會剪的部分（作者選「要試聽」） | 光看時間碼判斷不了該不該剪 |
| 待確認的列 | 預設也勾（作者選「全部預設勾」），標黃色「AI 不確定，建議先試聽」 | 照作者的話；「不用停」略過停點 ① 時仍維持舊規則：待確認的改 `[ ]` 不剪 |
| 真相在哪 | 仍是 `work/cuts.md`；NG 表加第一欄「剪」（`[x]`／`[ ]`），網頁只改這一格 | 弱模型照舊讀檔、`ng-snap` 照舊跑；對話裡說「第 3 列不要剪」AI 一樣改這一格 |
| 存檔 | 勾了就存；存前比對檔案 hash，AI 改過就擋下、回新內容、提示再勾一次；有 `work/rough.mp4` 後只能看 | 沿用剪輯台「被別人改過就不寫」；初剪後改勾選不會生效，避免誤會 |
| 舊格式 | 沒有「剪」欄時照舊（待確認的不剪）；網頁第一次存檔在最前面補「剪」欄 | 舊專案打開也能用 |
| 服務 | 沿用 `editor.mjs`，多一頁 `/cuts`；啟動時多印「剪輯清單：<網址>」 | 不新增指令與名詞 |

## 做了什麼

| 檔案 | 內容 |
|---|---|
| `shared/template/tools/media.mjs` | `parseCutsMd` 認「剪」欄（`cut`、`reason`、`line`、`hasCutCol`、`ngTables`）；新 `setCutChecks`；ng-snap／cutpoints 只看 `cut`；ng-scan 印的 NG 表多「剪」欄、每列 `[x]` |
| `shared/template/tools/editor/server/cuts.mjs`（新）、`editor/cuts.html`、`editor/cuts.js`（新） | `/api/cuts`、`/api/cuts/save`、頁面 |
| `shared/template/tools/editor.mjs` | 路由 `/cuts`、`/media/main.mp4`；啟動印剪輯清單網址；服務版本算進 media.mjs |
| `shared/template/tools/status.mjs` | 停點 ① 的下一步提到網頁與「剪」欄 |
| `AGENTS.md`、`auto-edit-rough/SKILL.md`、`references/ng-rules.md`、`EDITOR.md`、`PROMPTS.md`、`README.md` | 停點 ① 改給網址、表頭五欄、略過規則、退路（網頁開不起來改給 `work/cuts.md`） |
| `specs/contracts/stop-points.md`、`cli-002.md`、`dev/tests/docs.test.mjs` | 停點 ① 那一行與 ng-snap 訊息 |
| `dev/tests/editor-cuts.test.mjs`（新）、`media-cli.test.mjs` | API、衝突、唯讀、寫回只改一格、舊格式補欄、ng-snap 只剪 `[x]` |

停點 ① 的最後一行：`⏸ 停點 ① 剪輯清單｜請看：<剪輯清單網址>｜請回：勾好後說「可以」，或要改的列`

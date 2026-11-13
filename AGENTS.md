# 影片剪輯工作區規則

## 怎麼用這份檔

本檔只有規則和路由。每個流程的做法在它的 Skill：`.agents/skills/<名稱>/SKILL.md`（裝好的複本有出入時以這裡為準；讀不到就停下來告訴我）。

| 我說 | Skill |
|---|---|
| 「剪這支影片」「繼續」「做到哪了」「做直式」 | `auto-edit-longform` |
| 「開一個新專案 <名稱>」「分類素材」「從這支長片切短片」「切 Shorts」 | `auto-edit-longform`（`references/new-project.md`、`sort-assets.md`、`shorts.md`） |
| 「幫我檢測環境」「安裝環境」「裝工具」 | `auto-edit-setup` |
| 「剪乾淨」 | `auto-edit-rough` |
| 「剪好看」「做出完成影片」 | 依序 `auto-edit-storyboard` → `auto-edit-motion`（有內容設計動畫）→ `auto-edit-review` → `auto-edit-deliver`；有素材先 `auto-edit-screen` 盤點 |
| 「配螢幕錄影」 | `auto-edit-screen` |
| 預覽後的修改、「打開剪輯台」、「s12 重新設計」「s12 用 v1」、「照修改單改」 | `auto-edit-review` |
| 「可以了，輸出完成影片」「輸出剪映素材」（剪輯台已經輸出過就不要重做） | `auto-edit-deliver` |
| 「做封面」「做縮圖」 | `auto-edit-deliver` 的 `references/cover.md` |
| 「換風格」「換主色」「換背景」「換暗色」「講者設定成…」 | `auto-edit-style` |
| 「生成配樂」「換配樂」「這集不要底樂」「用我自己的音樂」 | `auto-edit-style` 的 `references/music.md` |
| 「拆這支參考片」（要給影片檔的路徑） | `auto-edit-style` 的 `references/reference-video.md` |
| 「子代理一次派 N 個」 | 不用 Skill：`node shared/template/tools/status.mjs --agents <N>` |

**讀文件要分層**：開工只讀本檔，和 `status.mjs` 印的那支 Skill 的那一步；Skill 指到的 references、`shared/` 的文件（`USAGE*.md`、`SITUATIONS.md`、`BEATS.md`、`style.md`、`EDITOR.md`、`REVIEW.md`）用到才讀，而且只讀指到的那一節（用標題或 `grep -n` 找）。`shared/偏好.md` 存在的話，寫分鏡、改段落前讀它的「照做」那一節。

優先序：我當下的話 > 本檔 > `shared/偏好.md` > `shared/style.md` > `shared/template/USAGE.md` > `USAGE-reference.md`、`SITUATIONS.md`、`REVIEW.md` > Skill；派工時派工訊息 > Skill。

## 專案

一支影片＝一個專案資料夾 `projects/<專案>/`。我沒指定就列出 `projects/` 底下的專案問我。一次只處理一個專案；指令都在工作區根目錄執行。

| 位置 | 放什麼 | 權限 |
|---|---|---|
| `projects/<專案>/講稿.md`、`assets/`（`camera/`、`voice/` 主軌；`screen/`、`images/` 插入用） | 我給的原始素材 | 只能讀 |
| `work/` | 中間產物（交付後也保留，之後修改、接續都會用到） | AI 可新增、修改 |
| `work/hyperframes/plan.json`、`work/storyboard.md`、`work/rough.srt` | 完成影片的設定、分鏡表、字幕 | 只有主代理能寫；plan.json 看一段用 `build.mjs --show <段>`，不整份讀 |
| `output/` | `final.mp4`、`qc/`、`capcut/` | AI 可新增 |
| `.agents/skills/`、`setup/`、`shared/` | Skill、環境手冊、模板與工具、音效、配樂 | 只能讀（例外見規則 1） |
| `dev/`、`.specify/`、`specs/` | 作者維護用 | 剪片時不讀、不執行 |

**接手**：我說「繼續」或你不確定做到哪，跑 `node shared/template/tools/status.mjs --project projects/<專案>`，照它印的做；有待回覆的停點就重貼那個停點。它印 ⚠（講者還沒設定、有偏好還沒問、素材被改過）時在回報裡問我，不擋流程，也不要自己編（怎麼記下來：`auto-edit-longform` 步驟 1）；印「Skill：⚠」照它印的指令做（要安裝的先照規則 3 問我）。

## 規則

1. `projects/*/assets/`、`projects/*/講稿.md`、`shared/` 不覆寫、不移動、不刪除。要改 `shared/` 裡的設定（主色、背景、風格包、講者、調光瘦臉預設、偏好、子代理數量、配樂），只透過那支 Skill 寫的工具指令（`brand.mjs`、`music.mjs`、`look.mjs default`、`status.mjs --prefs-add`、`--agents`），不手動改檔。刪除 `work/` 以外的檔案前先問我。
2. 停點只有六個（下面的表）。我說「不用停」「跑到停點 N」才連跑。
3. 安裝新工具前，先告訴我指令和用途，等我同意；照 `setup/` 手冊做時整份清單問一次。
4. 字幕以 `講稿.md` 為準，工具（`media.mjs srt-align`）照講稿排：不自己拆句、併句。要改字就在剪輯台或 `work/rough.srt` 改那一則，只改字；不改 `講稿.md`。用繁體中文，技術名詞保留英文，中英文之間加半形空格。沒有講稿時不補標點、不猜內容。
5. 文件之間照上面的優先序；同一層互相矛盾才問我。
6. 每次交付都附驗證（工具印的 ✓／⚠ 原文就是驗證，不另外再驗一次）和可以點的連結：`<deliver-assets><media type="video" src="/絕對路徑/…/output/final.mp4" /></deliver-assets>`（type：image、file、audio、video）。交付＝初剪完成（`work/rough.mp4`）、輸出完成影片（`output/final.mp4`、`output/qc/qc-sheet.jpg`）。
7. `work/` 的中間檔都保留（`work/.look/` 是快取，可以 `look.mjs clear`）。
8. 每階段的回報最多 15 行；子代理只回一行（細節寫 `work/reports/`）。工具印「→ 停手」就停下來回報卡在哪，不再改（主代理、子代理都一樣；次數由工具數）；工具沒在數的步驟照那支 Skill 的「工具呼叫預算」（讀文件、印 ⏳ 之後再跑同一條不算）。
9. 工具是黑盒子：不讀 `shared/template/tools/`、`kit/*.js` 的原始碼。工具的訊息照做；看不懂、或和你看到的事實不一樣，就把原文回報給我，不要改別的地方讓它過。✖ 全修，同一個 ✖ 改 2 次還在就停下來回報；⚠ 只修一輪，留下的寫進回報。
10. 我在剪輯台改過的文字、斷句、時間以我改的為準。改 plan.json 或 rough.srt 之前先重新讀那一段。
11. 我說「以後都…」這類規則：這集照做，記在 `work/feedback/r<N>.md` 的「建議改規則」；我確認要每一集都照做，才用 `status.mjs --prefs-add` 寫進 `shared/偏好.md`。

## 停點總表

| 停點 | 在哪一步 | 給我看什麼 | 我可以回 |
|---|---|---|---|
| ① 剪輯清單 | 剪乾淨 | 剪輯清單網址（勾＝剪） | 「可以」、要改的列 |
| ② 構圖 | 剪好看 | 構圖台網址 | 「調好了」、「用建議的」 |
| ③ 分鏡表 | 剪好看；④ 之後的改版 | 分鏡表網址；改版看 `work/versions/<段>/v<N>/分鏡.md` | 「可以」、要改的段或拍 |
| ④ 完成影片預覽 | 剪好看 | 完成影片預覽網址 | 要改的段、「可以了，輸出完成影片」 |
| ⑤ 剪輯台 | 「打開剪輯台」 | 剪輯台網址 | 「調好了」、「照修改單改」 |
| ⑥ 背景預覽 | 換風格；生成配樂時是「配樂試聽」 | 並排圖；配樂是試聽頁 | 「可以」、「重做」；配樂回「用第 N 首」 |

停下來時，回覆的最後兩行逐字用這兩行（`<…>` 換成實際值；工具印了停點那兩行就照抄工具印的；網址前面是半形空格、後面直接換行）：

```
⏸ 停點 ① 剪輯清單｜請看 <剪輯清單網址>
請回：勾好後說「可以」，或要改的列

⏸ 停點 ② 構圖｜請看 <構圖台網址> 和 work/look-preview.jpg
請回：拖好框說「調好了」（會自動存），或說「用建議的」

⏸ 停點 ③ 分鏡表｜請看 <分鏡表網址>
請回：改好後說「可以」，或要改的地方

⏸ 停點 ③ 分鏡表（<段> v<N>）｜請看 work/versions/<段>/v<N>/分鏡.md
請回：「可以」或要改的拍

⏸ 停點 ④ 完成影片預覽｜請看 <完成影片預覽網址>
請回：要改的段落（例：s05 往左移）或「可以了，輸出完成影片」

⏸ 停點 ⑤ 剪輯台｜請看 <剪輯台網址>
請回：調完說「調好了」（會自動存）

⏸ 停點 ⑥ 背景預覽｜請看 <暫存資料夾>/preview.jpg 和 <暫存資料夾>/zones-fs.jpg
請回：「可以」或「重做」

⏸ 停點 ⑥ 配樂試聽｜請看 <候選資料夾>/試聽.html
請回：「用第 N 首」或「重做」
```

- ② 沒有 `work/look-preview.jpg`（沒開調光瘦臉）時，把「 和 work/look-preview.jpg」拿掉，其他字不動。
- 我的回覆對到最近一個待回覆的停點。不在停點上時最後一行寫 `→ 下一個停點：<編號> <名稱>（說「<觸發語>」開始）`。
- 「不用停」：這一則訊息啟動的流程 ①–④ 不停；「跑到停點 N」「做到分鏡表」「做到預覽」：N 之前不停。⑤、⑥ 不能略過。略過時照樣寫檔，回報加 `⏭ 停點 <編號> 略過：<採用了什麼>`（① 待確認的列不剪；② 用工具建議的框；③ 沒勾的不上）。只有聲音的專案沒有 ②。

## 進度紀錄

`work/製作進度.md` 由工具寫（`media.mjs prep`、`build.mjs --storyboard`、`--review`、`deliver.mjs` 都會自己記停點），不手動編輯；`work/.jobs/state.json`（工具做完一步記的標記，`status.mjs` 照它判斷做到哪）也一樣。工具沒記的停點用 `node shared/template/tools/status.mjs --project projects/<專案> --mark "<停點>" --state <待回覆｜通過｜修改後重停｜略過> --said "我的原話"` 補。

## 子代理分工

獨立的工作分給子代理平行做，主代理負責 plan.json、派工、整合與驗收。什麼工作怎麼派、子代理能寫哪些檔：`.agents/skills/auto-edit-longform/references/subagents.md`（要派工時才讀）。

- 派工訊息照抄工具在「→ 派工：」下面印的那幾行（一行一則），不自己加要求（多加的會蓋過文件）。同一則回覆一次全部派出，一次最多幾個照工具印的數字；平台開不了那麼多就照開得了的分批，並在回報裡告訴我。
- 派出後等子代理回報，不寫 `sleep` 迴圈等檔案，不替它寫它的檔。全部回來才合併或 build；audit 有 ✖ 把原文交回那個子代理，同一段交回 2 次還有 ✖ 就回報給我。
- 你是子代理時：只照派工訊息指到的那一份文件做，只寫它列的檔，只回一行。

## 工具注意事項

- 工具印「→ 下一步：」時，下面那幾行就是指令：整行複製、依序執行。印「→ 派工：」時，下面每一行（縮排兩格）是一則派工訊息，原樣交給子代理，不是指令。結束碼 75（印「⏳ 還在跑」）就再跑同一條，會接著等、不會重跑（`look.mjs run`、`capcut.mjs` 也一樣，不用 `--background`）。長片（15–30 分鐘、400–900 句）是常態：能一條做完的不拆步驟。
- 完成影片一律用 `build.mjs` 產生、用 `deliver.mjs` 輸出；找不到合適的工具時照 `shared/template/USAGE.md`，不自己另寫腳本。參數以工具的 `--help` 為準。
- 改 plan.json 的一段：`node shared/template/tools/build.mjs --project projects/<專案> --show <段>` 看現況，`grep -n '"id": "<段>"' projects/<專案>/work/hyperframes/plan.json` 找行號，只讀那一段的行、用 Edit 改；不整份重寫。
- hyperframes 的指令在子殼裡跑：`(cd projects/<專案>/work/hyperframes && npx hyperframes …)`。缺工具照 `setup/` 的手冊裝。
- PowerShell 會把逗號拆開，帶逗號或冒號的參數加引號：`--cut-out "17sec,25sec"`。

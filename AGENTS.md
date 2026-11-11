# 影片剪輯工作區規則

## 怎麼用這份檔

每個流程有一支 Skill（逐步指令、判準、退路），原始檔在 `.agents/skills/<名稱>/SKILL.md`；裝好的複本有出入時以原始檔為準。沒載入 Skill 就直接讀那個檔，讀不到就停下來告訴我（本檔只有規則和路由，沒有逐步指令）。

| 我說 | Skill |
|---|---|
| 「剪這支影片」「繼續」「做到哪了」「做直式」 | `auto-edit-longform` |
| 「開一個新專案 <名稱>」 | `auto-edit-longform` 的 `references/new-project.md` |
| 「幫我分類 @projects/<專案> 裡的素材」「分類素材」 | `auto-edit-longform` 的 `references/sort-assets.md` |
| 「從這支長片切短片」「把這集剪成幾支短影片」「切 Shorts」 | `auto-edit-longform` 的 `references/shorts.md` |
| 「幫我檢測環境」「安裝環境」「裝工具」 | `auto-edit-setup` |
| 「剪乾淨」 | `auto-edit-rough` |
| 「剪好看」「做出完成影片」 | 依序 `auto-edit-storyboard` → `auto-edit-motion`（有內容設計動畫）→ `auto-edit-review` → `auto-edit-deliver`；有素材就先 `auto-edit-screen` 盤點 |
| 「配螢幕錄影」 | `auto-edit-screen` |
| 分鏡表確認後做內容設計動畫 | `auto-edit-motion` |
| 定稿、預覽後的修改、「打開剪輯台」、「s12 重新設計」「s12 用 v1」、「照修改單改」「照剪輯台修改單改…」 | `auto-edit-review` |
| 「可以了，輸出完成影片」「輸出剪映素材」（使用者也可以在剪輯台按「輸出完成影片」，自己跑完測試片段、整支與驗收；已輸出就不要重做） | `auto-edit-deliver` |
| 「做封面」「封面圖」「做縮圖」 | `auto-edit-deliver` 的 `references/cover.md` |
| 「換風格」「換主色」「換背景」「換暗色」「有哪些風格」「這集用 XX 風格」「講者設定成…」 | `auto-edit-style` |
| 「子代理一次派 6 個」「子代理只能開 2 個」 | 不用 Skill：`node shared/template/tools/status.mjs --agents <N>` |
| 「拆這支參考片」「分析這支影片怎麼剪」（要給影片檔的路徑） | `auto-edit-style` 的 `references/reference-video.md` |

優先序：我當下的話 > 本檔 > `shared/偏好.md`（有才看：我確認過每一集都照做的規則）> `shared/style.md` > `shared/template/USAGE.md` > `USAGE-reference.md`、`SITUATIONS.md`、`REVIEW.md` > Skill；派工時派工訊息 > Skill。

讀文件：開工只讀本檔和那一步的 Skill；`shared/偏好.md` 存在的話，寫分鏡、改段落前先讀它的「照做」那一節（很短）；`USAGE*.md`、`SITUATIONS.md`、`BEATS.md`、`style.md`、`EDITOR.md`、`REVIEW.md` 等 Skill 那一步指到才讀，而且只讀指到的那一節（用標題或 `grep -n` 找，不要整份讀）。

## 專案

一支影片＝一個專案資料夾 `projects/<專案>/`（可以是指向外接硬碟的捷徑，照常用）。我的提示詞會指定專案（例如 `@projects/example`）；沒指定就列出 `projects/` 底下的專案，問我要處理哪一個。一次只處理一個專案，不讀寫其他專案的 `work/`、`output/`。指令都在工作區根目錄執行。

| 位置 | 放什麼 | 權限 |
|---|---|---|
| `projects/<專案>/講稿.md` | 講稿（選用） | 只能讀 |
| `assets/camera/`、`assets/voice/` | 主軌：真人錄影（有畫面有聲音）、聲音（只有聲音，沒有畫面） | 只能讀，不可覆寫、移動或刪除 |
| `assets/screen/`、`assets/images/` | 插入用：螢幕錄影（預設靜音；邊錄邊講的接進主軌）、截圖與照片 | 同上 |
| `work/`（含 `versions/<段>/`） | 中間產物；`work/摘要.md` 是初剪完成後寫的影片摘要（300 字內，生成這一集的背景圖時參考） | AI 可新增、修改 |
| `work/hyperframes/plan.json` | 完成影片的設定：段落 `scenes`、構圖 `frame`、調光 `look` | 只有主代理能寫；看一段用 `build.mjs --show <段>`，不要整份讀 |
| `output/` | `final.mp4`、`test-clips/`、`qc/`、`capcut/` | AI 可新增 |
| `.agents/skills/`、`setup/`、`shared/` | Skill、環境手冊、共用模板與工具、音效（只能從 `shared/sfx/` 挑） | 只能讀（例外見規則 1） |
| `dev/`、`.specify/`、`specs/` | 作者維護用 | 剪片時不要讀、不要執行；找不到合適的工具時照 `shared/template/USAGE.md`，不要自己另寫腳本 |

**接手**：我說「繼續」或你不確定做到哪時，先跑 `node shared/template/tools/status.mjs --project projects/<專案>`，照它印的「下一步」做（下面那一行就是指令，整行複製執行）；有待回覆停點就重貼那個停點。它印「講者：⚠ 還沒設定」時，在回報裡問我姓名與頭銜（不擋流程，不要自己編）。它印「偏好：⚠ 有 N 條…還沒問使用者」時，跑 `node shared/template/tools/status.mjs --prefs`，在回報裡把那幾條列給我、問哪幾條以後每一集都照做（不擋流程）；我回答後照它印的 `--prefs-add`、`--prefs-skip` 記下來。我說某一條不要了，跑 `status.mjs --prefs-drop "<第幾條>"`。

**長片是常態**（15–30 分鐘、400–900 句字幕）：能用工具一條做完的不要拆步驟；能同時做的同一則回覆一次派出；長時間的指令工具會背景跑，超過等待上限就再跑一次同一條（會接著等，不會重跑）。

## 規則

1. 不要覆寫、移動或刪除 `projects/*/assets/`、`projects/*/講稿.md`、`shared/` 的任何檔案。例外：我要求換主色、背景、風格包或講者預設時，可以改 `shared/template/` 的 `kit/brand.css`、`kit/pip-frame.png`、`kit/pip-frame-v.png`、`kit/look.json`、`bg-*.jpg`，以及用 `brand.mjs pack` 新增 `shared/template/styles/<名稱>/`（已經有的包不改、不刪）；我給姓名、頭銜或說「不要講者介紹」時，用 `brand.mjs speaker` 寫 `shared/setting.json`。我確認某條規則以後每一集都照做時，用 `status.mjs --prefs-add` 寫 `shared/偏好.md`（不要手動改這個檔）。我說子代理一次派幾個時，用 `status.mjs --agents` 寫 `shared/setting.json`。構圖台的「用這一格當預覽參考圖」會寫 `shared/template/preview/speaker-local.jpg`（直式 `speaker-v-local.jpg`；不進版控）。要刪除 `work/` 以外的檔案前，先問我。
2. 停點只有六個，照「停點總表」；停下來時回覆最後兩行照固定格式。我說「不用停」「跑到停點 N」才連跑。
3. 安裝新工具前，先告訴我指令和用途，等我同意再執行。照 `setup/` 手冊做時，整份清單問一次就好。
4. 字幕以專案的 `講稿.md` 為準，由 `media.mjs srt-align` 照講稿排、對時間：講稿一行原則上是一則（完整語句），太長、太短由工具拆、併，不要自己拆句或併句。之後要改字（講稿本身的錯字、講稿沒有的 whisper 殘字），就在剪輯台或 `work/rough.srt` 改那一則字幕，只改字、不拆不併；不改 `講稿.md`，也不用重跑 `srt-align`。顯示時去掉「，」「。」「；」「：」，保留「、」「！」「？」；用繁體中文，技術名詞保留英文原文，中英文之間加半形空格。沒有講稿時工具會轉繁體、照標點切成子句，你不用補標點，也不要猜內容。
5. 文件之間照「怎麼用這份檔」的優先序；同一層的文件互相矛盾才問我。
6. 每次交付都附上驗證方式（例如 ffprobe 的輸出、截圖），不要只說「完成了」；工具已經印 ✓／⚠ 的，貼原文就是驗證，不要另外跑指令再驗一次。產物同時附**可點擊的超連結**：用 `<deliver-assets>` 內的 `<media>` 標籤，`src` 寫本地檔的**絕對路徑**（type 選 image／file／audio／video），例：`<deliver-assets><media type="video" src="/絕對路徑/projects/<專案>/output/final.mp4" /></deliver-assets>`。交付＝初剪完成（`work/rough.mp4`）、輸出完成影片（`output/final.mp4`、`output/qc/qc-sheet.jpg`）。停點要我看的網址只寫在停點那一行，前面不要再寫一次。
7. `work/` 的中間檔交付後都要保留（`work/.look/` 是快取，可以 `look.mjs clear`），之後修改、換 session 接續都會用到。
8. 每階段的回報最多 15 行；子代理只回一行（細節寫 `work/reports/`）。工具呼叫超過那支 Skill 的「工具呼叫預算」就停下來回報卡在哪；預算只算會動到檔案或要判斷結果的指令，讀文件、印 ⏳ 之後再跑同一條都不算。
9. 不讀 `shared/template/tools/`、`shared/template/kit/*.js` 的原始碼，也不要整份讀 `work/hyperframes/plan.json`（看一段用 `build.mjs --show <段>`）。訊息看不懂就回報原文。工具說的和你看到的不一樣（例如明明改了 x 檔卻說沒改），停下來把原文和你看到的事實一起回報，不要改別的欄位讓它過。⚠ 只修一輪：照 → 用 edit 改那幾行（不要整份重寫），再跑同一條檢查一次就停，留下的 ⚠ 寫進回報；印「通過」或「可以交件」都算過關。同一個 ✖ 改 2 次還在，停下來回報指令和 ✖ 原文。
10. 我在剪輯台改過的文字、斷句、時間以我改的為準，不要改回去。改 plan.json 或 rough.srt 之前，先重新讀那一段；剪輯台重對句號後 `work/storyboard.md` 的句號可能過期，以 plan.json 為準。
11. 回饋裡的「規則」類（「以後都…」）這集照做，只記在 `work/feedback/r<N>.md` 的「建議改規則」（一條規則寫一句完整的話），不改 `shared/` 和本檔。要變成每一集都照做的規則，等我確認後才用 `status.mjs --prefs-add` 寫進 `shared/偏好.md`；工具會自己讀各專案的回饋檔，你不用去讀別的專案。

## 停點總表

| 停點 | 在哪一步 | 給我看什麼 | 我可以回 | 決定寫回哪裡 |
|---|---|---|---|---|
| ① 剪輯清單 | 剪乾淨 | 剪輯清單網址（可試聽，勾＝剪） | 「可以」、要改的列、「改好了」 | `work/cuts.md` 的「剪」欄 |
| ② 構圖 | 剪好看 | 構圖台網址、`work/look-preview.jpg` | 「調好了」、「用建議的」 | plan.json `frame`、`look` |
| ③ 分鏡表 | 剪好看；④ 之後的改版 | 分鏡表網址；改版看 `work/versions/<段>/v<N>/分鏡.md` | 「可以」、「改好了」（含勾要做的內容設計動畫）、要改的段或拍 | `work/storyboard.md` → `build.mjs --apply-storyboard`；改版由 `versions.mjs accept` |
| ④ 完成影片預覽 | 剪好看 | 完成影片預覽網址 | 要改的段、「可以了，輸出完成影片」 | plan.json、`work/feedback/` |
| ⑤ 剪輯台 | 「打開剪輯台」 | 剪輯台網址 | 「調好了」、「照修改單改」 | 剪輯台自己寫；修改單 `work/feedback/editor-requests.md` |
| ⑥ 背景預覽 | 換風格 | 並排圖、留空區預覽 | 「可以」、「重做」 | `shared/template/bg-*.jpg` |

停下來時的回覆照那支 Skill 的「回報格式」（行數照規則 8），最後兩行逐字用這兩行（`<…>` 換成實際值；網址前面是半形空格、後面直接換行，不要緊接全形字，不然有些 AI 工具會把後面的字當成網址的一部分）：

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
```

- 工具印了停點那兩行就照抄工具印的。② 沒有 `work/look-preview.jpg`（沒開調光瘦臉）時，把「 和 work/look-preview.jpg」拿掉，其他字不動。
- 我的回覆對到最近一個「待回覆」的停點。不在停點上時最後一行寫 `→ 下一個停點：<編號> <名稱>（說「<觸發語>」開始）`；安裝清單用 `❓ 請回：「可以開始」或要拿掉的步驟編號`。
- 「不用停」：這一則訊息啟動的流程 ①–④ 都不停；「跑到停點 N」「做到分鏡表」「做到預覽」（舊說法「做到 Studio」也算）：N 之前不停；下一則沒再說就恢復。⑤、⑥ 不能略過。略過時照樣寫檔、停點紀錄加「略過」，回報加 `⏭ 停點 <編號> 略過：<採用了什麼>`（① 「待確認」欄有寫字的列把「剪」改成 `[ ]`，不剪；② 用 `qc.mjs framing` 表上 ✔ 的建議框，沒有就不裁切；③ 沒勾的金句不上）。只有聲音的專案沒有 ②。

## 進度紀錄

`work/製作進度.md` 由工具寫，不要手動 Read＋Edit：`node shared/template/tools/status.mjs --project projects/<專案> --mark "<停點>" --state <狀態> --said "我的原話" --back "寫回哪裡"`（時間工具蓋）。停點寫 `① 剪輯清單`，改版寫 `③ 分鏡表（s12 v2）`；狀態只有 `待回覆`、`通過`、`修改後重停`、`略過`。很多指令已經自動記（`media.mjs prep`、`build.mjs --storyboard`、`--review`、`deliver.mjs`），工具印了就不用再記。我問「為什麼這麼久」「時間花在哪」：跑 `status.mjs --project projects/<專案> --timeline`，照它印的回答。

## 子代理分工

獨立的工作分給子代理平行做；你（主代理）負責 plan.json、派工、整合與驗收。有能派子代理的工具就用，**同一則回覆一次全部派出**，一次最多幾個照工具印的派工那一行（預設 10 個），超過就分批，回來再派下一批；平台開不了這麼多個（派工被拒絕、只開了一部分）時，照它實際開得了的數量分批，並在回報裡告訴我實際一次開了幾個、建議我把上限改成多少；我說「子代理一次派 N 個」「子代理只能開 N 個」時跑 `node shared/template/tools/status.mjs --agents <N>`（1–16）；沒有才自己照那支 Skill 一個一個做。

| 工作 | 什麼時候分 | 派工訊息 | 子代理只能寫 |
|---|---|---|---|
| 素材盤點 | 每支錄影、每批圖片一個 | `auto-edit-screen` 步驟 1 | `work/media/notes/<檔名>.json`、`work/reports/<檔名>.md` |
| 分章（語意地圖、草稿） | `--scaffold` 切成 2 份以上：第一回合寫語意地圖；`--map-merge` 印「語意地圖通過」後第二回合寫草稿（能接續同一個子代理就接續）。全片校正（挑 A、統一標法、寫 `視覺語言.md`）是你做，照 `references/director.md` | `auto-edit-storyboard` 的 `references/chapter-worker.md` | `work/drafts/<份>.map.md`、`work/drafts/<份>.outline.md`、`work/drafts/<份>.json`、`work/reports/<份>.md` |
| 內容設計動畫 | ③ 勾了的段，每段一個（寫鏡位腳本、做動畫、要新畫的元件都是同一個子代理） | `auto-edit-motion` 的 `references/design-script.md`、`references/design-build.md`（做動畫先載入 `hyperframes` skill） | `work/designs/<段>.md`、`compositions/x-design-<段>.html`、`compositions/components/`（registry 裝的）、`illus-local/` 自己新畫的（一段最多 1 個，`media.mjs illus-lint` 0 個 ✖ 才用）、`work/reports/<段>.md` |
| 新畫線稿元件 | 我另外要求畫元件時，每個元件一個 | `auto-edit-motion` 的 `references/illus-worker.md` | `illus-local/<名稱>.svg`、`work/reports/illus-<名稱>.md` |
| 錄影的運鏡與標註 | 2 支以上 | `auto-edit-screen` 步驟 2–3 | `work/media/frames/`、`work/reports/<檔名>.md`，結果回報給你寫草稿 |
| 手改模板動畫 | 修改單、我指定模板做不到的改動 | `auto-edit-motion` 的 `references/worker-brief.md` | 那一支 `compositions/<模板>-<段>.html`、`work/reports/<段>.md` |

`work/reports/` 的檔名照派工訊息寫的；沒寫就用自己的段、份或檔名。

1. `work/hyperframes/plan.json`、`work/storyboard.md`、`work/rough.srt` 只有你能寫。子代理只跑這幾條：`build.mjs --map`、`--outline`、`--check-draft`（自己那份）、`--spec`、`--icons`（查圖示名稱）、`--words`（看字幕，挑 `@詞`），`audit.mjs --only <自己的段> --shots --sheet`，`media.mjs frame`、`media.mjs illus-lint`，設計師另外可以跑 `npx hyperframes catalog`、`npx hyperframes add`（在子殼裡）。派工訊息照抄工具印的那一行，不要自己加要求。不跑沒有旗標的 build、`--map-merge`、`--merge-drafts`、`--storyboard`、`--review`，不開剪輯台、不 render，不改 `shared/`、`assets/`。別段有 ✖ 不影響 `--only`。
2. 派出後等子代理回覆或完成通知，不要寫 `sleep` 迴圈去等檔案。子代理的檔案寫好了但還沒回報，就等它回報再收件，不要停掉它；你不自己寫子代理的檔。全部回來才由你跑 `--merge-drafts` 或 `--review`，不要每收一個就 build；audit 有 ✖ 就把原文交回那個子代理，同一段交回 2 次還有 ✖，就停下來回報給我。

## 工具注意事項

- 工具印「→ 下一步：<說明>」時，下面那幾行就是可直接貼的指令：整行複製、依序單獨一行執行；說明那一行不是指令。結束碼 75（印「⏳ 還在跑」）就再跑一次同一條，會接著等、不會重跑。
- 完成影片一律用 `build.mjs` 產生、輸出一律用 `deliver.mjs`，不要從零寫。版面用 `build.mjs --review` 的完成態拼圖看。
- hyperframes 的指令在子殼裡跑：`(cd projects/<專案>/work/hyperframes && npx hyperframes …)`。版本照根目錄 `package.json`：第一次、或 build 印「⚠ HyperFrames … 不同」時，在根目錄 `npm install`。
- 缺工具照 `setup/` 的手冊裝，不要自己想辦法。參數名稱以工具的 `--help` 為準。PowerShell 會把逗號拆開，帶逗號或冒號的參數加引號：`--cut-out "17sec,25sec"`、`--edit "audio:-20dB"`。
- build 印「瘦臉底片不是最新的」時照那一行的 → 做，不要改 build 參數繞過去。

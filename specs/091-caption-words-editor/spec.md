# 091 剪輯台可以選字標重點字幕（只標一句裡的幾個字）

## 作者原話（2026-11-27）

- 「我發現字幕重點的功能，選擇部分文字無效，目前只能夠完整段落」
- 047 的定案 6 先只讓 AI 能標 `"#N@詞"`，剪輯台只管整則；這次補上剪輯台的操作。

## 原本的樣子（047）

- 「重點」鈕、屬性面板「重點字幕（H）」、鍵盤 H 只看句號，在改字框裡選了幾個字再按也是整則。
- 存檔時頁面只送整則的清單，`"#N@詞"` 由伺服器照檔案裡的保留，所以剪輯台不能新增、取消。
- 「字幕」分頁、快速試聽看不出哪幾個字有標，要看完成影片預覽；`"#N@詞"` 改了要「更新預覽」。

## 定案

| # | 題目 | 定案 |
|---|---|---|
| 1 | 怎麼標 | 在改字的時候標：「字幕」分頁點那一句進去改字、屬性面板的「文字」、時間軸上雙擊改字。選那幾個字，按「重點」（字幕分頁那一列的、屬性面板的「重點字幕（H）」）或 ⌘B／Ctrl+B。按鈕按下去不搶焦點，選的字留得住。沒選字照舊切換整則。 |
| 2 | 怎麼取消 | 游標放在標過的字裡（或選到同樣的字）再按一次；屬性面板「標了」那一列每個詞有 ×。 |
| 3 | 和整則的關係 | 同一則整則為準（和 047 一樣）。標幾個字時那一則整則的取消，標整則（H、沒選字按「重點」）時那一則的字拿掉，兩種不會同時存在，toast 說明換了什麼。 |
| 4 | 同一個詞出現兩次 | 沿用 047：只標第一次。選到後面那一次時 toast 說明。 |
| 5 | 看得到 | 字幕分頁：那一句的字是主色塊、那一列左邊主色虛線、「重點」鈕實心；時間軸：上緣斷開的一條主色；快速試聽、完成影片預覽馬上包 `<em class="cw">`（和 build 同一支 `markWords`，搬到 `lib/caption-style.mjs`，頁面也載得到），不用「更新預覽」、不發光。「重點 N 則」、只看重點、摘要都把只標幾個字的那幾則算進去。 |
| 6 | 存檔 | 頁面送整份清單（`fmtCaptionMarks(marks, words)`）；伺服器照頁面的寫，不再保留檔案裡原本的 `"#N@詞"`（不然取消不掉）。字改掉、那一句找不到那幾個字的不送（＝拿掉）。頁面沒送 `captionMarks`、只有字幕操作時照舊由 `remapPlan` 換句號。 |
| 7 | 增刪字幕、復原 | 頁面上和存檔重播同一套 `remapWordMark`（分割跟到有那幾個字的那一半、合併併過去、刪除拿掉）；復原、重新載入保留還沒存的標記和整則的一樣。 |

## 第二輪（2026-11-27）：字幕樣式找不到

原話：「調整字幕樣式，目前好像也沒有 UI 可以調整」

- 其實有（035 的「整支 → 字幕」），只是那一區預設收起來、選到字幕時屬性面板換成那一句、「字幕」分頁也沒有入口。
- 「字幕」分頁上面多一個「字幕樣式」，選到字幕時屬性面板多一個「字幕樣式…」：都會取消選取、打開「整支 → 字幕」、捲到字幕樣式（`showCapStyle`）。
- 「整支 → 字幕」預設打開（`FOLD_OPEN.caps`）。
- `EDITOR.md`、剪輯台說明加入口；`editor-caption-marks-ui.test.mjs` 的 091 那一項多驗兩個入口和換樣式存檔。`editor-caption-style-ui`、`editor-live-sound-ui` 也改用 junction（Windows 跑得起來），兩支都過。

## 第三輪（2026-11-27）：換字幕樣式畫面往上跳、講者設定找不到

原話：「我發現調整完字幕樣式後，畫面會往上調」「另外沒有設定講者的話(setting.json)判斷，不是上面會有「⚠ 講者還沒設定」警告嗎?沒看到」「可是講者設定我沒有看到」

- **往上跳**：屬性面板每次重畫都 `scrollTop = 0`。改成同一個東西重畫（選取的種類和 id 一樣）停在原本捲到的地方，換選取才回到最上面（`renderInspector` 的 `inspKey`）。
- **講者**：原本頂端的提醒和設定對話框只在「畫面上真的會出現示範人物」（有 14 講者介紹段、沒寫姓名）時才有，其他時候剪輯台找不到講者設定。
  - 屬性面板「整支 → 講者」最上面一直有「姓名與頭銜」和「設定／修改姓名與頭銜」（`inspSpeaker`）；對話框不是示範人物的情況換成「講者的姓名與頭銜」，帶著現在的值。
  - 還沒設定（或設定檔格式不對）但畫面上不會出現示範人物：頂端是淡的「⚠ 講者還沒設定」（`.warn-chip.soft`），不擋輸出；會出現示範人物時照舊是紅的、輸出前問。
  - 存好之後這一集有講者介紹段才更新預覽：`lib/speaker.mjs` 加 `speakerSegments`，`/api/state` 的 `speaker.used`（`speakerGate` 的回傳不變，輸出驗收的比對不受影響）。
- 測試：091 的瀏覽器測試多驗換樣式後不跳；新增「091 講者設定」一項（寫在暫存的 shared，不碰真的 setting.json）；`speaker.test` 多驗 `speakerSegments`、暫存的 scenes 改用 junction（Windows 跑得起來，8 過）。

## 第四輪（2026-11-27）：封面台閃動、改成流程裡的一頁、時間軸挑表情

原話：「點擊[封面台]載入的時候，好像有一堆東西在閃動，眼睛並不舒服，還有我希望他是以分頁的概念出現在下方，現在是獨立網頁」「我覺得他可以參考上面的步驟，可以擁有下面的頁面，但是我希望上面都是固定的」「不需要有那麼多的照片顯示，而是出現時間軸讓人可以選擇用哪一張，這樣使用上畫面也更加簡約」

- **閃動**：封面台每 2.5 秒輪詢一次，每次把 8 張表情候選整份重畫（`innerHTML`），圖一直重新載入。量過：8 秒內重建 24 張 `<img>`；改完 0 張。現在候選格換成時間軸，刻度和預覽只在真的變了才動。
- **流程裡的一頁**：`/api/flow` 最後多一格 `{ id: 'cover', no: '◎', label: '封面', optional: true }`（不是停點、不算「第 N／M 步」；剪乾淨之後點得到，有 `output/cover/cover.jpg` 算 ✓），分隔用「｜」。封面台的頁首換成和其他頁同一個（流程列由 `flow.js` 放進來），`position: sticky` 固定在上面。頂列「做封面」改成同一個視窗換頁（剪輯台的修改是自動存的，換頁前會先送出）。
- **時間軸挑表情**：一張預覽（`<video>` 播 `/cover/video`：和剪輯台同一支 `pickVideo`，build 重新編碼過、每秒一個關鍵影格的那支比較新就用它，否則 `work/rough.mp4`、再沒有 `main.mp4`。原始的 rough.mp4 在 Chrome 跳到中間會解碼失敗（`PIPELINE_ERROR_DECODE`，範例專案實測），重新編碼過的那支正常）＋時間軸（0.1 秒一格）＋建議的 8 格是刻度。拖只換預覽，按「用這一格」才寫 `cover.json` 的 `at`；任何一秒都可以（伺服器原本就收 0–片長）。`coverState` 多回 `duration`、`video`。AI 指令裡的 `candidates.jpg` 照舊產生。
- 測試：`cover.test` 的封面台那一項改成時間軸（刻度、拖到 7.3 秒、按了才寫）、流程列在這一頁是「封面」且頁首 sticky、輪詢 5.5 秒內不重建圖、「做封面」不另開分頁；`editor-storyboard-ui` 的流程列多一格 cover。這兩支和 `editor-rough-preview` 的暫存 `shared/template` 改用 junction。

## 第五輪（2026-11-27）：講者預覽拖的時候還在閃、好幾段講者以第一段為主

原話：「現在切換到預覽還是會一樣有閃動，能處理嗎?另外我覺得如果有多段人像，以第一段為主」（問過：閃的是封面台的講者預覽；多段人像＝影片裡有好幾段講者畫面）

- **講者預覽不閃**：拖時間軸時每動一下就叫 `<video>` 跳一次格，跳格中間畫面會空掉。改成影片藏起來只解碼，畫面畫在 `<canvas>`：新的一格解好（`seeked`）才換，中間一直是上一格；一次只跳一格，還沒跳完就只記最後要去的秒數。測試：連拖 30 下跳格次數 < 30，停下來畫的是最後那一秒。影片解碼失敗時頁面說明，時間軸照樣能挑。
- **好幾段講者以第一段為主**：`lib/cover.mjs` 的 `firstCameraSpan`：`work/main.json` 的 `kind: camera` 照 `work/cuts.v1.json`（auto-editor 留下來的片段）換成 rough.mp4 的秒數，第一段還留著（≥ 2 秒）的那一段；第一段整段剪掉就用下一段。建議的 8 格（`candidateTimes(長度, 8, 起點)`）和預設那一格都在那一段裡。全部都是鏡頭、沒有鏡頭、沒有 `cuts.v1.json` 時照舊整支。測試：`cover.test` 多一項（鏡頭 0–5、螢幕錄影 5–8、鏡頭 8–13，剪掉前 1 秒 → 0–4 秒；第一段整段剪掉 → 3–8 秒）。

## 第六輪（2026-11-27）：切到封面台「一直卡住」、還是在閃（背景程式）

原話：「（截圖）一直卡住」「切到[做封面]的時候，還是會有閃動的問題」「感覺是某個背景程式在執行」

- **卡住**：開著的剪輯台是改版前啟動的，伺服器舊、頁面新：`/api/cover` 沒有 `duration`、`video`，`/cover/video` 404 → 時間軸 max 變成 0.1 秒、預覽全黑。重新啟動就好；頁面另外加了退路：伺服器沒給片長就用影片自己的長度、播 `/media/source.mp4`，並提醒重新啟動。
- **閃（背景程式）**：剪輯台在背景跑（detached）時沒有主控台，它直接叫的命令列程式（ffprobe、ffmpeg、npx…，約 70 處都沒寫 `windowsHide`）在 Windows 每叫一次就跳一個黑色主控台視窗、一閃就關；封面台每 2.5 秒問一次狀態，每次都叫 ffprobe。
  - `lib/hide-windows.mjs`：`hideChildWindows()` 把 child_process 的 spawn／spawnSync／execFile／execFileSync／exec／execSync 預設改成 `windowsHide: true`（`syncBuiltinESMExports`，已經 import 的也換掉；有寫 windowsHide 的照寫的）。只在背景跑的剪輯台（`AUTO_EDIT_EDITOR_CHILD`）和背景工作（`lib/job.mjs` 的子行程）呼叫；在終端機裡跑的工具共用那個主控台，不會閃。
  - 封面台的狀態不再每次都跑 ffprobe：`coverInfo` 照影片的大小與修改時間快取。
  - 測試：`dev/tests/hide-windows.test.mjs`（每一種呼叫方式都加上、回呼留在最後、換完 spawnSync 照樣能跑），加進 `test:fast`。
- 錄了從剪輯台按「做封面」的逐格畫面：頁面只有載入的 0.5 秒內出現頁首 → 內容 → 流程列 → 講者畫面，之後不再變；看得到的閃不在頁面裡。

## 第七輪（2026-11-27）：學習清單由剪輯台提供

原話：「我貼上指令後，這個網址是會出現的嗎?」「好，讓剪輯台也提供這一頁」

- 原本：`versions.mjs learn --page` 寫 `work/feedback/learn-choices.html`，「平台能發布就給網址，不能就給檔案路徑」，所以多半拿到的是檔案路徑。
- 現在：剪輯台的 `/learn` 直接給這一頁（還沒做好時 404 說怎麼做）。`learn --page` 剪輯台開著就印「學習清單網址：…/learn」，沒開就印開剪輯台的指令；剪輯台啟動、已經開著時印的各頁網址多「封面：」和（做好了才印）「學習清單：」。剪輯台預覽旁邊「整理這集的調整給 AI」後面，做好了多一個「打開學習清單」。`editorPages`、`status.mjs` 的 `editorUrls` 多 `cover`、`learn`。
- `learn-habits.md` 第 3 步改成給剪輯台的 `/learn` 網址（開不了剪輯台才給檔案路徑，不另外發布）；`EDITOR.md` 補上。
- 測試：`learn.test` 多一項（/learn 沒做好 404、做好就是那一頁），`learn --page` 那一項多驗「剪輯台沒開」那一行；暫存的 `shared/template` 改用 junction（Windows 7 項全過）。

## 第八輪（2026-11-27）：剪映草稿在 Windows 的 CapCut 打開是「專案來自異常路徑」

原話：「執行[輸出素材到剪映，建立草稿]有成功，但是打開時出現[專案來自異常路徑]錯誤」「我希望 Mac 跟 Windows 都可以」

- 原因：`capcut.mjs draft` 只做 Mac 剪映專業版的草稿；那次是用 `JIANYING_DRAFT_ROOT`（正斜線）指到 Windows 的 CapCut 草稿資料夾。和 CapCut 9.9 自己存的草稿（同一台電腦的 1127）比：`draft_meta_info.json` 的 `draft_root_path` CapCut 寫反斜線、我們寫正斜線；平台是 Mac 剪映 5.7（`os: mac`、`app_source: lv`）；字幕字體指到 `/Applications/VideoFusion-macOS.app/…`；CapCut 讀的是 `draft_content.json`（我們只寫 `draft_info.json`）。
- `lib/jianying-draft.mjs` 加「目標程式」：`draftTarget()`（Mac＝剪映專業版，照舊；Windows 先找 `%LOCALAPPDATA%CapCut`、再找 `JianyingPro` 的草稿資料夾；`JIANYING_DRAFT_ROOT` 照路徑認是哪一個）、`appVersion`（安裝資料夾或 `Apps` 裡最大的版本）、`appRunning`（Windows 用 tasklist）。Windows 的草稿：寫 `draft_content.json`＋`draft_info.json`；平台 `windows`／`cc`（剪映 `lv`）／偵測到的版本；字幕不帶字體路徑（用 CapCut 預設）；`draft_root_path` 反斜線、`draft_fold_path` 和素材路徑正斜線、`root_meta_info.json` 那一筆照 CapCut 的寫法。訊息裡的程式名照目標（CapCut／剪映）。Mac 的輸出逐欄不變（原本 8 項測試照過）。
- 測試：`capcut-draft.test` 多兩項（`draftTarget` 各種情況；Windows 草稿的檔案、平台、字體、路徑寫法、--force 不重複註冊）。
- 這台電腦用新格式另做了 `example-portrait-win`（舊的 `example-portrait` 沒動，要不要刪由使用者決定）；有沒有真的打得開要使用者在 CapCut 確認。

## 做了什麼

- `lib/caption-style.mjs`：`markWords` 從 `lib/captions.mjs` 搬過來（`captions.mjs` 照舊匯出）。
- `editor/app.js`：`app.words`／`savedWords`、`liveWords`（快取）、`wordsOf`／`hasWords`、`captionSel`、`toggleWordFromSel`、`toggleMark` 先看選取、`capWordKey`（⌘B／Ctrl+B）、`dropWord`、屬性面板「標了」那一區（`#capMarkBox`，正在改字時只換這一區）、快照、存檔、`keepState`／`applyKept`、計數與摘要。
- `editor/preview.js`：快速試聽包 `em.cw`；完成影片預覽的 `applyText` 照剪輯台現在標的字重包（比對用 `cjkSpace`，和 build 一樣補過空格）。
- `editor/timeline.js`：只標幾個字的上緣斷開的一條。`editor/editor.css`：`.side-row.cue.emw`、`.x em.cw`。
- `editor/server/write.mjs`：`captionMarks` 整份照頁面的寫。
- 文件：`EDITOR.md`（欄位表、即時套用、使用說明、快捷鍵）、`style.md`、`USAGE.md`、剪輯台的說明（`index.html`）、047 的「沒做的」。
- 測試：`caption-marks.test.mjs` 047 存檔那一項改成新的規則（頁面取消得掉、整則為準、不在字幕裡的不寫）；`editor-caption-marks-ui.test.mjs` 多一項 091 的瀏覽器測試，暫存的 `shared/template` 改用 junction（Windows 不用系統管理員也建得了，其他系統忽略）。

## 沒做的

- 同一個詞在一句裡出現兩次只能標第一次（資料格式沒改）。
- 時間軸上雙擊改字的那一格看不到標過的字（只有字幕分頁、預覽看得到）。
- 剪映素材照舊只出 SRT。

## 驗證

- `node --test dev/tests/caption-marks.test.mjs`：25 過。
- `node --test dev/tests/editor-caption-marks-ui.test.mjs`：3 過；`speaker.test` 8 過；`editor-caption-style-ui`、`editor-live-sound-ui` 各 1 過（Windows；ffmpeg 要在 PATH 上）。
- `npm run test:docs`：37 過。
- `cover.test` 8 過、`editor-storyboard-ui` 13 過、`editor-rough-preview` 3 過。
- `npm run test:fast`：393 過、14 敗，都和這次無關：13 個是 Windows 建資料夾連結沒有權限（`symlink` EPERM，learn、speaker、分鏡表、剪輯清單的測試），1 個是本機 `.claude/agents` 的複本和 `.agents/` 正本不同（`install-skills.test`）。

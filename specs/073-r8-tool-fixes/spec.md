# 073 r8、r9 修改單順手修的工具問題（角標、暗接亮轉場、連接線箭頭、tape 避開小視窗、錄影自帶黑邊）

## 作者原話（minimax-ep1 修改單 r8）

- m0207：「右上角的角標超過螢幕錄影的右側範圍，請優化，上與右應該一致；全部螢幕錄影的片段都檢查一次」
- x0211：「從上一個黑色到白色的畫面，應該要設計轉場，視覺才不會突兀，這個需要設計為全部的通例」
- s0103：「我發現箭頭結束會插入到下一個元素」
- s0109：「我覺得圖片可以往左，不需要被右下壓住，可以適當縮小」

## 定案

### 錄影框照素材比例收（`fitWin`，m0207）

- 原因：錄影畫面框是 16:9，錄影大多是 3840×2280（1.684）。contain 之後左右各空約 43 px 黑邊，角標照框的右緣排，就跨在錄影邊上。
- 做法：橫式 contain 的素材（比例 ≥ 1.2）把框收到素材比例，置中。3840×2280 在這集的框 [135,12,1651,929] 會變成 [178,12,1565,929]。
- 角標、小視窗、安全區都照收過的框算，所以「看得到的錄影邊」就是框邊：角標上、右等距，小視窗對齊右下。
- 不收的情況：cover、直式素材（比例 < 1.2）、比例本來就一樣。

### 變速錄影接動畫也擦入（`freezeTail`，x0211）

- 原因：錄影接動畫原本會擦入，但要用錄影後面多播的 0.45 秒墊在下面。變速段（retime）的檔案就是這一段，後面沒有多的，`rollRoom` 回 0，所以硬切。這集有 20 處暗的錄影硬切到亮的動畫。
- 做法：
  - plan 給前一段標 `freezeTail = 0.45`、`postroll = 0.45`，下一段照樣 `wipeIn`；報告寫「最後一格定格 0.45s 墊在下面」。
  - build 抽最後一片的最後一格，存成 `assets/media/<名>-<段>-tail<ms7>.jpg`，記在 index.json 快取。抽格秒數不超過檔案長度 − 0.08，因為變速檔最後一格的時間可能比算的早。
  - `mediaParts` 在段尾最後 0.45 秒疊一張 `mft-<段>` 圖（class `clip mxf`，同一個位置，在 stage 裡）。
  - `rolled()` 遇到 `freezeTail` 不延長最後一片。

### 連接線箭頭那一端多留（`data-link-gap-end`，s0103）

- 原因：連接線端點離元件外框 12。下一站聚焦時放大 1.08、抬起 12，頂邊往箭頭長了約 21，箭頭就插進去。
- 做法：`kit/scene-layout.js` 的 data-links svg 多一個選填屬性 `data-link-gap-end`：有箭頭（`a>b`）的那一端離外框幾 px，沒寫就照 `--sc-link-gap`。
- x-process 寫 32，剛好是 audit layout-link 的上限 32；聚焦後箭頭還離 11。其他有連接線又會抬起的模板沒有改，看到同樣的問題再加。

### tape 截圖避開講者小視窗（s0109）

- 有講者小視窗時，tape 截圖區右緣停在小視窗禁入區（`PIP_ZONE` 左緣 1424）左邊 48。截圖先往左，太寬才縮小；下方 caption 跟著截圖置中。

### 錄影檔自帶黑邊（`blackBars`，r9）

- 作者原話：「我發現許多螢幕錄影的右上角標題，還是沒有修正，參考點可以使用「到 MiniMax Code 官網下載頁，Mac、Windows 照自己的裝置選安裝檔」幫我全片審視一遍優化」
- 全片量過：41 段錄影、圖片裡，38 段的角標本來就離錄影上、右 24。只有用 `02_登入.mp4` 的 m0202、m0202b、m0911 不對：檔案 3840×2160，左右各自帶 98 px 黑邊（畫面 3644 寬）。框照整個檔案排，角標右緣跨到黑邊上 18 px。
- 做法：
  - `ff.mjs blackBars`：平均抽 6 格關鍵影格跑 cropdetect（limit 16），取聯集（任何一格碰到邊就不算黑邊）；兩邊加起來不到 1% 不算。ffmpeg 解出來的大小和 info 不同（假 probe、旋轉）不判。結果記在 `work/hyperframes/.cache/media-bars.json`（檔案大小＋修改時間）。只量影片。
  - `checkMediaSeg`：有黑邊就記成 `info.content = [x0, y0, x1, y1]`（來源像素）。
  - `mediaGeometry`：left／top／width／height 改成黑邊裡的畫面；多 `ox`、`oy`（黑邊）與 `el`（整個檔案的位置）。`stageOf` 換算時扣掉黑邊，`fitWin` 照黑邊裡的比例。標註、運鏡邊界、角標、小視窗都跟著看得到的畫面。
  - `mediaParts`：video、img、定格圖照 `el` 放，黑邊落在框外被裁掉（沒有框時面板加 overflow hidden）。
  - 報告多一句「錄影自帶黑邊（左 98、右 98…），框照黑邊裡的畫面放」。
- 沒有黑邊的素材：輸出逐字和改之前一樣。

### 剪輯台程式更新後，開著的分頁提示重新整理

- 作者原話：「我發現生成完畢的，會卡在生成中，還是需要重啟才會套用呢？」
- 原因：那一頁是 072 之前載入的，一直跑舊程式。舊程式把修改單存在瀏覽器（localStorage），第 2–4 批沒進專案的 `editor-requests-list.json`，狀態也停在生成中。伺服器那邊已經全部是「已改完」。
- 做法：
  - `/api/state`、`/api/version` 多回一個 `client`：`editor/` 底下 js、css、html、mjs 最後改的時間。
  - 分頁記住載入時那一版（`app.clientAt`）。輪詢看到不一樣，就跳橫幅「剪輯台的程式剛更新：重新整理這一頁才會用到新版」，附「重新整理」鈕。還有沒存的調整時先提示，不重新整理。
- 舊分頁沒有這段程式，這一次要手動重新整理。重新整理後，瀏覽器裡的修改單會自動搬進專案（072）。

## 改了哪些檔

- `shared/template/tools/lib/screen-frame.mjs`：`FIT_MIN`、`fitWin`（r9：照 `info.content` 的比例）
- `shared/template/tools/lib/ff.mjs`：`blackBars`（r9）
- `shared/template/tools/lib/plan.mjs`：`frameInfo` 帶 `content`（r9）
- `shared/template/tools/lib/media.mjs`：
  - `mediaCorner`、`validateMedia` 用 `fitWin`
  - `mediaParts` 的 `mft`、r9 的 `elStyle`
  - r9：`checkMediaSeg` 量黑邊、`mediaGeometry` 的 `ox`／`oy`／`el`、`stageOf` 扣黑邊、報告多一句
  - tape 的 `TAPE_PIP_GAP`
- `shared/template/tools/lib/plan.mjs`：錄影接動畫的 `freezeTail` 分支
- `shared/template/tools/lib/main.mjs`：`rolled()`
- `shared/template/tools/build.mjs`：`prepareMedia` 抽最後一格
- `shared/template/kit/scene-layout.js`：`linkPts` 的 `ge`、`data-link-gap-end`
- `shared/template/custom/x-process.html`：`data-link-gap-end="32"`
- `shared/template/tools/editor.mjs`：`clientRev`；`shared/template/tools/editor/app.js`：`app.clientAt`、輪詢的橫幅
- 測試：
  - `dev/tests/screen-frame.test.mjs`（角標等距；r9 錄影自帶黑邊）
  - `dev/tests/plan.test.mjs`（變速錄影擦入）
  - `dev/tests/switches.test.mjs`（`mft`）
  - `dev/tests/media.test.mjs`（tape＋小視窗）
  - `dev/tests/examples.test.mjs`（x-process 箭頭端 32）
  - `dev/tests/editor-requests-ui.test.mjs`（程式更新橫幅）
  - 整套測試跟著 069–073 更新：`dev/tests/fixtures/032-p3e/` 快照（070 的 screenBg／bg、069 箭頭 body；example.json 不動）、`032-w1b`（能寫的設定多了 screenBg）、`shared/template/preview/x-process*.html`（`build.mjs --gallery` 重產）、`editor-segments-ui`（072 打字直接換字之後，第二次點那一句前等清單重畫完）
  - 整套剩下的失敗都和這次無關：`032-b6` 14 個（本機 `projects/example/work/` 11-18 改過，不在版控）、`look`／`look-belly` 3 個（c669fcb 換了 854×480 的示範口播，臉寬、肩寬的門檻還是舊片的）、`brand`／`build` 風格包清單各 1 個（本機多了沒 commit 的 橘色-20261119）、`scaffold` 1 個（`shared/template/scenes/.DS_Store`）

# 035 字幕樣式可調

來源：作者 2026-11-14（034 驗收的同一天）說「另外我希望字幕也有一定的靈活性，就是字體大小、粗細能調整，字體也從開源免費的挑出 5 個，還有除了像是這種深色底白字外，也要有白字黑框這類常見的選項，幫我優化，字幕的調整都是屬於調一個，全部都動的」。
同一天實作中又補兩句：「另外字幕也要保留上下移動的彈性，比如短影音就會需要」、「整體 UIUX 也要顧及到，比如字幕上下是可以手動拖移的，這個長影片（橫式）跟短影片（直式）會分開紀錄」。

## 現況（2026-11-14 盤點）

- 字幕只有一種長相：照剪映量的 F8（`kit/captions.css`）：思源黑體 Regular 76 px、白字、70% 黑底直角、底板 y 956–1074（直式 1291–1409）。
- 數字散在 10 幾個地方：`captions.css`、`lib/canvas.mjs`（caption）、`lib/captions.mjs`（CAPTION 估寬）、`qc.mjs`（CAPTION 量底板）、剪輯台快速預覽、`style.md`，還有對字面值的測試（build、canvas、032-c7、docs、qc）。
- 沒有任何設定：plan.json、shared/setting.json、風格包都碰不到字幕；剪輯台的字幕只能改字和時間。
- 字型全部放在 `kit/fonts/`（思源黑體 VF 5.4 MB），build 把整個 kit 複製進每個專案。

## 作者的回答（驗收單，2026-11-14）

commit=same（在分支 033-034-ending-fullscreen 多一個 commit）、scope=two（這一集＋預設兩層）、tick=on（「之後的影片也用這個」預設勾）、looks=five、**fonts=bundle（五個字體都放進 repo）**、size=now（60–96）、weight=real（只給字體真的有的）、stroke=mid（0.12 倍）、capcut=srt（只出 SRT）。

## 定案

| # | 題目 | 定案 | 理由 |
|---|---|---|---|
| 1 | 調了改哪裡 | 一組設定管整支影片的每一則字幕。存兩層：這一集 plan.json 第一層 `captionStyle`；以後每集的預設 `shared/setting.json` 的 `captions`。build 照「這一集 → 預設 → 原本的 F8」取 | 「調一個，全部都動」；頻道通常整個系列同一種字幕，但舊影片重 build 不該被新預設改掉（作者答 scope=two） |
| 2 | 在哪裡調 | 剪輯台「整支」的字幕區：樣式、字體、大小、粗細、上下位置，改了預覽馬上變；勾「之後的影片也用這個」（預設勾）同時寫預設。AI 用 `brand.mjs captions --look … --font … --size … --weight … --lift-landscape … --lift-portrait …`（寫預設），`auto-edit-style` 步驟 10 | 看得到才好選；AI 也能照一句話改（作者答 tick=on） |
| 3 | 樣式（look） | 5 種：`box` 深底白字（原本，預設）、`outline` 白字黑框、`yellow` 黃字黑框、`light` 白底黑字、`brand` 主色底（字色照 `--brand-ink`）。沒做「白字只加陰影」 | 全畫面動畫多是淺底，只有陰影的白字看不清楚 |
| 4 | 字體 | 思源黑體（內建，預設）＋ 5 個 Google Fonts 上的 SIL OFL 開源字體：思源宋體 Noto Serif TC、霞鶩文楷 LXGW WenKai TC、jf open 粉圓 Huninn、霞鶩漫黑 LXGW Marker Gothic、芫荽 Iansui。**都放在 `shared/template/kit/fonts/`（跟著 repo，TTF 約 60 MB）**，build 只複製這一集選到的那一個（和它的授權檔）進專案 | 作者答 fonts=bundle：不用連網、不用等下載。原本做的「第一次選才下載」（`lib/caption-fonts.mjs`、`/api/caption-font`）已拿掉 |
| 5 | 大小 | 60–96 px（預設 76）；行高、內距照 76 的比例縮放，底板下緣固定（橫式 y 1074；直式置中在字幕帶 1350）。直式最大 76（10 字要塞進 834 寬） | 96 時底板頂 925，還在字幕區（920 起）裡，不用動版面 |
| 6 | 粗細 | 300 細、400 一般、500 中、700 粗、900 特粗；只列字體真的有的：思源黑體、思源宋體 5 種都有，文楷 400／700，粉圓、漫黑、芫荽只有 400（剪輯台那幾個按鈕灰掉並說明） | 假粗體（瀏覽器硬加粗）字會糊 |
| 7 | 黑框怎麼畫 | `-webkit-text-stroke` 加 `paint-order: stroke fill`（框畫在字外面，不吃字），粗細＝字級 × 0.12（76 px 時 9 px） | 剪映「描邊」的樣子（作者答 stroke=mid） |
| 8 | 預設長相 | 不設定時輸出和現在逐位元相同（captions.html 不多任何屬性），舊專案不用重 render | 局部重算（incremental）不會因為這次改版整支重來 |
| 9 | 品質檢查 | qc 的字幕檢查照設定的字級、位置量字幕框；字高只在「深底白字＋思源黑體」量（其他字體字面高低不同）；印出「字幕樣式（白字黑框、霞鶩文楷 84 px 粗、往上 120 px）：底板 y …（這種樣式不量字高）」 | 字面高度每個字體不同，量了只會誤報 |
| 10 | 剪映素材 | 照舊只出 SRT（剪映自己套樣式），capcut 的說明加一句「字幕樣式不會跟著過去」 | SRT 沒有樣式（作者答 capcut=srt） |
| 11 | 上下位置（作者補的，我定細節） | 欄位 `lift`（px，往上為正）。橫式 0–400（原位已經貼著畫面底，只能往上）；直式 −350–350（原位在講者面板中間 y 1350，上下都能移）。這一集是一個數字（`captionStyle.lift`）；預設**橫式、直式分開記**：`captions.lift = { "landscape": 0, "portrait": 120 }`。換版式時超出範圍的夾回去（notes 說明） | 一集只有一個版式，所以這一集一個數字就夠；預設要分開，因為長片和短影音要的位置不同（作者原話） |
| 12 | 怎麼拖（我定） | 預覽畫面上字幕那一條是一個拖曳框（快速試聽、完成影片預覽都在）：滑過出現黃色虛線框和「字幕往上 120 px（橫式）」；上下拖、2 px 一格、離原位 12 px 內吸回原位；方向鍵 ±2、Shift ±10；雙擊回原位；拖到一半按 Esc 取消；放開才進復原清單、寫預設。屬性面板另外有「上下位置」滑桿和「回到原位」 | 直接拖最直覺；吸附讓「回到原位」不用對很準；滑桿給要精確數字的人 |
| 13 | 字幕區檢查（我定） | `audit` 的字幕區（y ≥ 920 不放卡片）照原位算，不跟著 lift 移；往上移時 build 報告印「往上 120 px」，style.md 提醒別蓋到卡片 | 字幕區是模板的版面約定（卡片都照它排），跟著移會讓所有模板一起動；字幕往上移是使用者自己的選擇 |

## 實作（2026-11-14）

- `lib/caption-style.mjs`（新，不 import node 模組，剪輯台頁面也直接載）：表（`CAP_LOOKS`、`CAP_FONTS`、`CAP_WEIGHTS`、`CAP_SIZE`、`CAP_LIFT`）、`sanitizeCaptionStyle`、`resolveCaptionStyle({ plan, settings, format })`（這一集只寫的欄位蓋在這個版式的預設上）、`clampLift`、`captionGeom`（`bottom`＝原位＋lift）、`captionRootAttrs`／`captionRootVars`、`captionFontFace`、`fontFiles`、`EXTRA_FONT_FILES`、`describeCaptionStyle`／`describeLift`
- `kit/captions.css`：`[data-cap]` 才吃 `--cap-*` 變數（含 `--cap-bottom`）；5 種樣式的規則；預設那幾行不動
- `kit/fonts/`：5 個字體的 TTF＋`OFL-<字體>.txt`
- `lib/captions.mjs`：root 帶 `data-cap`＋變數；估寬、⚠ 照字級
- `lib/plan.mjs`：`captionStyle` 檢查、照版式解析、報告印「字幕樣式：…（這一集 plan.json｜預設 shared/setting.json）」
- `build.mjs`：kit 複製略過沒選到的字體和它們的授權檔；`--set captionStyle.look|font|size|weight|lift`
- `lib/main.mjs`：選到的字體 `@font-face` 只加在這一支的 `index.html`
- `qc.mjs`：照樣式、版式量（見定案 9）
- 剪輯台：整支 → 字幕區（樣式、字體下拉、大小、粗細、上下位置、「之後的影片也用這個」、「回到原位」、「回到原本的樣子」）；預覽畫面上的拖曳框 `#capDrag`（定案 12）；快速預覽與 HyperFrames 預覽即時套用；預設寫 setting.json（`/api/caption-default`，帶 `format`，600 ms 合併；位置只寫這個版式那一個，另一個不動）
- `brand.mjs captions`：不帶參數／`--help` 印橫式、直式的現況與所有選項；`--look --font --size --weight --lift-landscape --lift-portrait` 寫預設（位置合併進原本的）；超出範圍 ✖；`off` 拿掉
- 文件：style.md「字幕樣式可以換」、USAGE.md（`captionStyle`、`--set`）、EDITOR.md、auto-edit-style SKILL 步驟 10＋AGENTS.md 路由「換字幕樣式」、README、官網（功能＋FAQ）、llms.txt、CONTENTS、NOTICE（字體授權）、情境庫「換成自己的風格」加「換字幕樣式」卡（`gallery/caption-styles.jpg`，`dev/tools/caption-sheet.mjs` 重截）、頁尾字型 2 → 8
- 測試：`dev/tests/caption-style.test.mjs`（檢查、解析順序、幾何、root 屬性、字型檔都在 repo、上下位置範圍與夾回、預設分版式）、`editor-caption-style-ui.test.mjs`（點選 → 預覽變、存 plan.json、勾選寫預設、拖字幕往上、方向鍵微調、預設只記橫式且直式留著、取消勾選不寫、雙擊回原位、回到原本）

### 和上面計畫不一樣的地方

- 沒動 `kit/fonts.css` 和 `lib/canvas.mjs`：`@font-face` 改成只在選到時注入（沒選的字體一個字都不會出現在輸出裡）；字幕幾何集中在 `captionGeom`，canvas 照舊管 F8
- 字體用 TTF 放進 repo，沒轉 woff2：轉檔要 fonttools 的 brotli 模組（本機沒裝，裝新工具要先問）。轉了大約可以從 60 MB 降到 30 多 MB，作者同意再做

## 驗證

- 整套 `npm test` 跑出來要改的：resolvePlan 快照多 `captionStyle`、`captionFrom` 兩個鍵（`P3E_UPDATE=1` 重產，diff 只有這兩行）；`--unset` 的清單多 `captionStyle`（032-w1b）；`dev/README.md` 補 `tools/caption-sheet.mjs`（032-w5）
- 跑整套時抓到的漏洞：字體的授權檔 `OFL-*.txt` 原本沒略過，每個專案都會帶進沒選到的字體的授權檔（預設輸出就不是逐位元相同）；已修，t034-full 重 build「kit 更新 0 個檔」
- HyperFrames 實際截圖：霞鶩文楷粗體白字黑框，框在字外不吃字；預設樣式的 captions.html 和改版前逐位元相同
- 剪輯台截圖：橫式往上 140 px、直式往下 120 px，拖曳框和標籤位置都對
- `brand.mjs captions` show／set（含兩個版式的位置）／錯誤值／off 在暫存 kit 試過；`build --set captionStyle.*` 收對的值、擋錯的值

## 事故紀錄：projects/example/work 被測試寫到（2026-11-14）

為了比對改版前後的 resolvePlan，我把真的 `projects/example/work` 用捷徑連進 HEAD 的暫存工作樹跑測試，b6 測試複製檔案時順著捷徑寫回真的資料夾（588 個檔）。已經還原：plan.json、rough.srt、compositions、designs（雜湊和 resolvePlan 都和快照一樣）；storyboard.md、製作進度.md 照工具重建；editor.log 沒救回（執行紀錄）；index.html 現在多了片尾卡（照本機 setting.json 重 build）。受損的那份留在 scratchpad。教訓：絕不把真專案的 work 連進暫存工作樹跑測試。

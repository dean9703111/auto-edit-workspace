# 038 重點字幕（單則字幕換色）

來源：作者 2026-11-15 兩則訊息。

1. （貼了一張截圖：一則字幕是主色橘底、白色粗體字、直角底板、寬度貼字，文字是那一段的重點句）「我希望有這類型的字幕處理，也加入到程式中」
2. 「另外我希望如果是短影片，在重要的字幕可以換色有『重點』感，這個也可以手動選擇調整，幫我優化 UI」

## 現況（做之前）

- 字幕樣式是「一組設定管整支」（035：`captionStyle`、`shared/setting.json` 的 `captions`、`kit/captions.css`），不能只讓某幾則不一樣。
- 每則字幕是 `<div class="cg" id="cg-N"><span>…</span></div>`，同一時間只顯示一則，時間軸硬開硬關。
- 剪輯台的字幕清單只能改字、增刪、改時間。

## 定案（主代理定，照做）

| # | 題目 | 定案 |
|---|---|---|
| 1 | 資料 | plan.json 第一層 `"captionMarks": ["#6", "#7", "#13"]`（字幕句號，和其他欄位的 `#N` 同一套）。格式不對 ✖；句號不在字幕裡 ⚠ 並略過；重複的略過。`resolvePlan` 回傳 `captionMarks: [6, 7, 13]`。`build.mjs --set "captionMarks=#6,#7,#13"`、`--unset captionMarks` |
| 2 | 畫面 | 那幾則的 div 多一個 class `cg--em`。`kit/captions.css`：底板 `var(--brand)`、字色 `var(--brand-ink)`、字重 700；字級、行高、內距、位置、直角、寬度貼字、同一時間只顯示一則、不加進出場動畫都照一般字幕。035 的 `outline`／`yellow`（沒有底板）重點那則照樣畫主色底板、拿掉描邊；整支是 `brand`（主色底）時重點那則改成 `#111111` 底白字。沒有 `captionMarks` 時輸出和以前逐位元相同 |
| 3 | 短影片自動標 | 直式由 AI 在寫分鏡時標，不是程式猜。`style.md`「重點字幕」寫規則（直式每支 3–6 則、大約每 10 秒最多 1 則、連續最多 2 則；挑開場鉤子的關鍵句、每個要點的標題句、結論或金句、行動呼籲；橫式預設不標）。build／`--check` 報告多一行「重點字幕：N 則（#6、#7…）」；直式一則都沒標、直式超過 6 則、連續超過 2 則各 ⚠ 一行。`auto-edit-storyboard` 步驟 5 第 5 點：直式在貼停點 ③ 之前用 `--set` 標 |
| 4 | 剪輯台 | 「字幕」分頁每一句右邊一個「重點」開關；重點的那一列左邊一條主色、開關實心；切換後預覽畫面馬上換樣式；標題顯示「重點 N 則」。走自動存檔、復原／重做同一條路。鍵盤可以切換。不新增面板 |
| 5 | 增刪字幕 | 分割 → 兩半都是重點；合併 → 任一則是重點，合併後就是；刪除 → 標記拿掉；插入 → 後面順延。和 `remapPlan`／`replay`、`srt-align --remap-plan` 同一套 |
| 6 | 驗收 | `qc.mjs final` 量字幕樣式時不抽重點字幕；報告加一行重點字幕幾則。`capcut.mjs` 的 SRT 不帶樣式，維持原樣 |

## 實作時我定的細節

| 題目 | 做法 | 理由 |
|---|---|---|
| 字體沒有 700 | CSS 寫 `font-weight: 700; font-synthesis: none`：粉圓、漫黑、芫荽（只有一般）重點那則只換顏色，不讓瀏覽器硬加粗；霞鶩文楷選「一般」時，有重點字幕就多帶 Bold 那個檔（`fontFiles(style, { bold: true })`），重點那則才是真的粗體 | 035 定案 6：假粗體字會糊。沒有重點字幕時複製的字型檔和以前一樣 |
| CSS 的權重 | `.cg.cg--em > span, [data-cap] .cg.cg--em > span`：帶 `[data-cap]` 的那一個蓋得過 035 每一種樣式的規則，不靠先後順序 | 之後有人在檔尾加樣式也不會壞 |
| 直式的 ⚠ 什麼時候出現 | 排了段落（`scenes` 不是空的）才提醒「直式還沒標重點字幕」 | 構圖、剛剪乾淨時 `--check` 不該催還沒到的步驟 |
| 橫式的上限 | 不限則數（作者要才標）；「連續超過 2 則」橫式、直式都 ⚠ | 定案只說直式 6 則 |
| `--set` 的寫法 | `#6,#7,#13`（逗號、頓號、空白都收，不寫 `#` 也收），去重、照句號排後整份換掉；`none`、空的 ✖（全部拿掉用 `--unset`）。句號在不在字幕裡交給 build 的 ⚠ | 一條指令就是最後的樣子，弱模型不用先讀現況再合併 |
| 剪輯台的鍵 | **H**（Highlight）。選到的那一句；沒選字幕時是播放頭所在的那一句（可以邊播邊標） | 沒被佔用；M 在別的剪輯軟體是「加標記點」，容易誤會 |
| 剪輯台其他入口 | 選到字幕時屬性面板的「重點字幕（H）」（鍵盤走得到的按鈕；清單裡每一句的開關不進 Tab 順序，長片有幾百個）；「字幕」分頁上面的「重點 N 則」按下去只看重點字幕；時間軸字幕軌那一句上緣一條主色；「整支 → 字幕」標題多「｜重點 N 則」 | 幾百句裡要看得到標在哪、有沒有擠在一起；都放在既有的列和按鈕列，沒有新面板 |
| 點清單裡的「重點」 | 沒在播放時跳到那一句並選起來（預覽馬上看得到），不進改字；播放中、正在改別句的字時只切換不跳。按下去不搶焦點，正在改字的那一句也能標 | 「切換後預覽畫面上的字幕馬上換樣式」；不打斷校字 |
| 剪輯台怎麼存 | 頁面記 `app.marks`（數字），和 `cap`、`theme` 一樣進快照（復原、重做）、`dirtySnap`（自動存）、`keepState`（檔案被改過時保留）。存檔送整份清單 `captionMarks: ["#6", …]`（句號是字幕操作做完之後的）；沒送時，`replay` 裡的 `remapPlan` 照樣把檔案裡的標記換句號。都取消就拿掉欄位；不在字幕裡的句號不寫 | 伺服器和頁面用同一支 `remapMarks`，兩邊算出來一樣，不會存完又變 dirty |
| 完成影片預覽即時換 | `PlayerPreview.applyMarks`：照現在的標記切換播放器裡每一則的 `cg--em`；同一個句號的文字和上次 build 不一樣（之後才增刪、改字）的那幾則不動，等「更新預覽」 | 句號可能已經位移，寧可不換也不要把別句標成重點 |
| 字幕檔被別人改過 | 還沒存的標記放棄並提示「要重標」（句號對不上） | 和還沒存的字幕操作同一個處理 |
| `srt-align --remap-plan` | 照時間換：新的一則有一半以上落在舊的重點字幕裡，或舊的重點字幕有一半以上落在新的這一則裡，就是重點（拆開兩則都是、併起來也是） | 這條路是整份重新斷句，沒有一步一步的 op |
| qc | 字幕樣式抽樣先拿掉重點字幕；另外抽頭、中、尾最多 3 則，在 build 好的頁面看有沒有 `cg--em`、底板 y 和一般字幕一不一樣（字高不量：主色底上量不到白字）。沒套上 ⚠「標完還沒重新產生」；`--no-captions` 寫明重點樣式不會出現 | 最常見的錯是標完沒重新 build 就輸出 |
| 分章子代理看不到這幾則 ⚠ | `--check-draft` 的略過清單加「重點字幕／captionMarks」；`--merge-drafts` 通過時把「⚠ 直式還沒標重點字幕 → …」那一行照印（其他 ⚠ 照舊只算個數） | 標重點字幕是主代理合併之後的事（plan.json 只有主代理能寫）；合併平常不印 ⚠，不照印主代理看不到提醒 |
| 剪輯台「檢查」分頁 | `editor/issues.mjs` 多兩條規則：「短影片還沒標重點字幕」「重點字幕標太多或擠在一起」算作者自己改得掉的（附白話做法），不收進「給 AI 的細節」 | 這兩件事作者在「字幕」分頁點一下就好 |
| 局部重 render | `lib/incremental.mjs` 認得 `class="cg cg--em"`：標或取消一則只重畫那一則的時間，不算「字幕的樣式變了」整支重來 | 交付前在剪輯台多標一則不該整支重算 |

## 改了哪些檔

- `shared/template/kit/captions.css`：`.cg--em` 兩條規則
- `shared/template/tools/lib/caption-style.mjs`：`CAP_MARKS`、`parseCaptionMarks`、`fmtCaptionMarks`、`markRuns`、`resolveCaptionMarks`、`describeCaptionMarks`；`fontFiles`／`captionFontFace` 多 `{ bold }`
- `lib/captions.mjs`：`buildCaptions(…, { marks })` 加 class、回傳 `marks`
- `lib/plan.mjs`：`TOP_KEYS`、檢查、`resolvePlan` 回傳 `captionMarks`、報告一行
- `lib/plan-set.mjs`：`captionMarks` 鍵；`build.mjs`：傳 `marks`、字型檔、`--help`；`lib/main.mjs`：`@font-face` 帶粗體檔
- `lib/incremental.mjs`：字幕的解析認得 `cg--em`；`lib/flow.mjs`：`--check-draft` 略過、`--merge-drafts` 照印那一行；`editor/issues.mjs`：兩條白話規則
- `editor/subtitles.mjs`：`remapMarks`、`remapPlan` 一起換 `captionMarks`；`lib/rough/align.mjs`：`remapMarksByTime`、`remapPlanByTime` 一起換
- `editor/server/write.mjs`：`applySave` 收 `captionMarks`、只動那一個鍵；`editor.mjs`：重送判斷的簽名加 `captionMarks`、檔頭說明
- `editor/app.js`、`index.html`、`editor.css`、`preview.js`、`timeline.js`：開關、鍵盤、只看重點、預覽即時換、時間軸標示（頁首沒動）
- `qc.mjs`：`captionMarksOf`、`measureMarks`、`captionMarkChecks`，抽樣跳過重點字幕；`capcut.mjs`：清單說明多一句
- 文件：`shared/style.md`「重點字幕」、`USAGE.md` 3.2、`USAGE-reference.md` R5.1、`EDITOR.md`（欄位表、句號規則、使用說明、快捷鍵）、`auto-edit-storyboard` 步驟 5 第 5 點＋自我核對、`README.md` 一句
- 測試：`dev/tests/caption-marks.test.mjs`（新，進 `test:fast`）、`editor-caption-marks-ui.test.mjs`（新，要 Chrome）、`incremental.test.mjs` 加一段、`fixtures/032-p3e/*.json` 重產（多 `captionMarks` 一個鍵；直式那份多一行 ⚠）

## 沒做的事

- 不自動挑重點句（定案：AI 寫分鏡時標，程式只提醒）。
- 重點樣式只有一種，不能每則選不同顏色；沒有進出場動畫、沒有音效。
- 以後每集的預設（`shared/setting.json`）沒有重點字幕的設定：標哪幾則是這一集的事。
- 分鏡表頁（停點 ③）沒有重點字幕的勾選表；在剪輯台或 `--set` 改。
- `--check --json` 沒加欄位（報告文字和 ⚠ 有）；`specs/contracts/` 沒補（035 的 `captionStyle` 也沒進契約）。
- AGENTS.md 路由表沒有加「標重點字幕」的觸發語（要動 Skill 的 description，T34 會查）；使用者說了，AI 照 `style.md`「重點字幕」用 `--set` 改。
- `dev/tools/caption-sheet.mjs` 的字幕樣式一覽圖沒有加重點字幕那一格（要重截 `gallery/caption-styles.jpg`）；官網、`llms.txt` 沒更新。
- 剪映素材照舊只出 SRT，重點樣式不會跟過去。
- 「直式大約每 10 秒最多 1 則」只寫在 `style.md`，工具照定案只查「超過 6 則」和「連續超過 2 則」。

## 驗證（2026-11-15）

- `projects/example` 複製到暫存、真的跑 `media.mjs prep`＋`rough`（70 則字幕）、寫三段的 plan.json、build；`--set "captionMarks=#6,#8"` 再 build：`captions.html` 只差那兩個 div 的 class（和檔頭的雜湊），「產生：1 個檔（沒變 6）；kit 更新 0 個檔」，報告印「重點字幕：2 則（#6、#8）」。
- `hyperframes snapshot --at 10,13,16.5`：一般字幕是深底白字，#6 是主色橘底白色粗體、直角、寬度貼字，位置和大小一樣。整支換成白字黑框（`outline`）：重點那則照樣是主色底、沒有黑框；換成主色底（`brand`）：重點那則是深底白字。`hyperframes check` 0 個 error、0 個 warning。
- 同一個複本跑 `deliver.mjs`（整支 render＋`qc.mjs final`）：0 個 ✖；「✓ 字幕樣式照剪映（F8）…（量 5 則：#1、#11、#18、#25、#32）」「✓ 重點字幕 2 則（#6、#8）：主色底的重點樣式，位置和一般字幕一樣（量 2 則：#6、#8）；字幕樣式的抽樣不含這幾則」。
- 剪輯台實際開起來截圖：清單的開關、左邊主色條、「重點 2 則」、預覽上的重點字幕、時間軸的主色條都在。
- 沒實跑的：`--merge-drafts` 照印那一行（要整包分鏡素材；`--check` 印出來的那一行原文用真的 CLI 看過）、直式專案整支 render、Windows。

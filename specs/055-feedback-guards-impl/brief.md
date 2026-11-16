# 055 回饋變成檢查：實作 054＋之後的新意見

來源：作者 2026-11-16：「目前 PPA 這些影片都符合需求了，不管橫式還是直式都可以。希望彙整我們過去討論後優化的細節放到程式或是規範中，減少錯誤與來回對話的成本。可以先列出來我們調整的方向，用網頁呈現後，我確認完再進行調整」

決定單：https://claude.ai/artifact/GvmM6bJYw6vtPHNtfZUGBx（db `decisions/main`）。作者貼回的選擇（原文）：

```
1. 橫式錄影段小視窗：A 錄影、圖片段預設不放
2. 錄影段起始鏡位：A 加起始鏡位，拿掉先看全景
3. 直式字級下限：A 48 px
4. 反轉音效：A 全部換成丁
5. 初剪頭尾與贅字：A 講稿外的頭尾預設剪，贅字只列出
6. 講到的那一項：A 預設只用明暗
7. 每集照做的品味規則：全部
我先定的：全部照做
可選：都不做
```

054（`specs/054-feedback-guards/brief.md`）是調查和規格，程式一條都還沒做；這份是實作，054 寫過的機制照 054 做，這裡只寫決定、054 之後新加的項目和分包。

## 決定（作者選的）

| # | 題目 | 定案 | 054 |
|---|---|---|---|
| Q1 | 橫式錄影段小視窗 | 錄影、圖片段（media）預設 `pip: false`，要露臉寫 `"pip": true`；錄影以外的子母畫面照舊一定有小視窗；直式不變。`REVIEW.md` 的 P0 改成「錄影段以外」 | D1 |
| Q2 | 錄影段起始鏡位 | media 段加 `"start": [x,y,w,h]`（第一格就在那一塊、沒有推的動作；可以裁掉左右空白）；拿掉「第一次運鏡要在段起點 0.8 秒後」那條 ⚠；直式除了 start 以外最多再動 1 次（C11），橫式維持 2 次 | D2、C11 |
| Q3 | 直式字級下限 | 畫面上 48 px（`CANVAS.portrait.minTextPx`），縮放段的寫字下限照縮放換算；直式 `build --review` 的 audit 連模板段一起量 | D8、C01 |
| Q4 | 反轉音效 | 情緒點 `turn` 的預設音效橫式直式都從 `shine` 換成 `ding` | D5 |
| Q5 | 初剪頭尾與贅字 | 講稿第一句之前、最後一句之後的講稿外內容預設剪（`[x]`，原因「試講／講完後的自言自語」）；贅字照舊不剪，但初剪完一定列出（C20） | D6 |
| Q6 | 聚焦 | `P.spot` 預設不插亮框，只做明暗（和縮放）；要框寫 `{ glow: true }` | D7 |
| Q7 | 品味規則 | 下面 13 條全部寫進 `shared/style.md` 與設計師文件，每一集都照做 | W1–W8 等 |

Q7 的 13 條：

1. 疊在講者身上的大字，被講者擋最多一個字、那個字最多擋一半；放不下就移到頭頂上方。
2. 每一組東西在它的底塊裡左右置中，不對齊畫布左邊。
3. 同一張卡的標籤和大字不重複同一個詞，上下兩行要搭得起來。
4. 疊在講者身上的段只放一個大字，或左右兩個對比，配圖示，不鋪整面字。
5. 工具標誌用真實的彩色標誌（`shared/logos/ai/`），排緊密、整組置中。
6. 列舉三件以上用 1 2 3 編號，卡片同寬、單欄、圖示同一套。
7. 大字下面的副標（例如英文名）至少和大字同寬。
8. 講到推翻、否定時，畫面上前面那個說法加刪除線。
9. 一大群東西逐一出現時，固定間隔一路冒到講到的那個詞；不要冒一些、停住、再一口氣冒完。
10. 新的一組出現時，前一組退場或壓暗。
11. 照片不加來源標示，作者要求才加。
12. 展示整頁作品不推近；網頁、工具頁從剛打開、停在最上方的那一格開始播。
13. 講到的東西錄影裡看得到才框；框出現時錄影停住不捲，小按鈕用箭頭。

## 項目（「我先定的」32 條，全做）

054 有的照 054 那一節做；N 開頭是 054 之後新加的，機制寫在下一節。

| 決定單 | 項目 | 054／新 | 包 |
|---|---|---|---|
| k1 | 直式模板段也量字級（含字卡動態 `portraitMinPx`） | C01、C02 | A（audit）、C（fx catalog） |
| k2 | 卡片空太多、字可以更大 | N1 | A |
| k3 | 線穿過字或卡片 | C03 | A |
| k4 | 大字被切 ✖、自己斷行 ⚠ | C04 | A |
| k5 | 去背大字被講者擋太多 | C05 | A |
| k6 | 沒置中 | C06 | A |
| k7 | 同一個詞出現兩次 | C07 | A（設計段）、C（模板 slots） |
| k8 | 疊在講者身上的段字太多 | C08 | A |
| k9 | 同一組卡片寬度不一致 | N2 | A |
| k10 | 段尾淡出不再先亮一下（`P.out`） | N3 | D |
| k11 | 段的起點改了，手改過的模板動畫跟著平移 | N4 | D |
| k12 | 換段時畫面閃一下 | N5 | F |
| k13 | 有底色的動畫硬切回講者 | N6 | F |
| k14 | 卡上的字比講的晚（綁在句尾的字） | N7 | A |
| k15 | 連續圖片快切自動甩鏡 | C18 | C |
| k16 | 直式第一格上半黑底 | C10 | B |
| k17 | 推近把整頁網頁切掉 | C12 | B |
| k18 | 工具頁不是從頁首開始 | C13 | B |
| k19 | 紅框跟著內容（含多停 1 秒、綁詞、驗收截圖每框兩格） | C14、C15、D3 | B |
| k20 | 隱私沒打碼 | C16 | B |
| k21 | 慢放捲動看起來卡 | C17 | B |
| k22 | 錄影停住太久 | N8 | B |
| k23 | 情緒點和動畫音效 3 秒內只出一顆（含密度照實際出聲算、列出拿掉的） | D4 | C |
| k24 | 兩顆音效疊在同一刻 | C19 | C |
| k25 | 初剪完再掃一次重講和贅字 | C20 | E |
| k26 | 初剪開頭有講稿以外的話 | C21 | E |
| k27 | 剪掉一段後，剪點旁的停頓和太短的字幕（build 就報） | N9 | C |
| k28 | 去背有一塊在閃 | C22 | E |
| k29 | 修改單的描述寫進回饋紀錄 | F1 | D |
| k30 | 講到畫面或聲音毛病，一律寫「建議改規則」 | F2 | G（文件） |
| k31 | 版本工具也比對手改的模板動畫和情緒點 | N10 | D |
| k32 | 預覽頁的多層影片對齊 | N11 | F |

054 裡這次**不做**的：C09（素材沒用到）、W3（分鏡照因果寫，director.md）——決定單沒列，作者沒選。

## 新項目的機制

- **N1 卡片空太多**（audit ⚠ `card-space`）：有底色的卡片（寬 ≥ 300、高 ≥ 200 畫面 px），完成態裡面文字墨跡的聯集占卡片面積 < 15%、而且卡內最大字級還能放大 ≥ 1.4 倍（放大後的文字框仍在卡片內距裡）→ ⚠「<卡> 裡的字只占 N%，旁邊大片空白 → 字可以放大到約 M px（或卡片縮小）」。橫式直式都量；圖示、插圖算內容。驗證：主宣傳片 x0107 v2（r11 前）報、v3 不報；短影片5 s0106 v2 報。
- **N2 卡片寬度不一致**（audit ⚠ `sibling-width`）：同一個父元素底下 ≥ 3 個有底色、同 class 的兄弟卡，寬度最大／最小 > 1.1 → ⚠「<父> 的 N 張卡寬度 A–B px 不一樣 → 同寬（取最寬的）」。寫了 `data-allow-uneven` 不報。驗證：audit 測試的假頁面（三張不同寬的卡報、同寬不報）。
- **N3 `P.out` 從現在的透明度淡出**：kit `P.out`（`kit/scene-motion.js` 的 `fade(sel, at, 1, 0, …)`）改成從元素在那一刻的透明度淡到 0，不從 1 開始；用在已經被壓暗（`P.dim`、`tl.to(opacity: .25)`）的元素上不會先亮一下。要確認 hyperframes 逐格 seek（任意順序跳）時結果一樣。驗證：短影片4 `s0101/v8`（r13 前）在 9.0–9.3 秒取格，標誌不再變亮；`dev/tests/motion.test.mjs` 加「壓暗後 out」。
- **N4 手改的模板動畫跟著起點平移**：工具產生的模板動畫檔頭記下產生時的段起點與段長（`t0=`、`d=`）。build 遇到手改過（不覆寫）的檔、而 plan.json 的起點或段長變了：把檔裡的時間參數（`P.<動作>(sel, <秒>, …)`、`tl.<補間>(…, <秒>)`、`const D = <秒>`）照起點差平移、`D` 換成新段長，報告印「s0104 手改過的動畫檔照新起點平移 −0.5 秒」；認不出的寫法就 ✖「手改過的動畫檔起點從 X 改成 Y，裡面的秒數沒跟著動 → 秒數各減 Z，或刪掉這個檔重產」。沒有 `t0=` 的舊檔：用 `const D` 和現在段長推算，推不出來就 ✖。驗證：短影片4 r10 的情況（`s0104` 手改檔、from `#17` → `#17+0.5`）build 後三個 `P.pop` 各少 0.5 秒。
- **N5 換段閃一下**（`lib/seams.mjs`，⚠ `seam-flash`）：在換段（以及段尾 1 秒內）前後 0.5 秒取 6–8 格**真的畫面**（含底片，hyperframes snapshot），切成格子比亮度：頭尾兩格相近、中間某格在 ≥ 5% 面積突然變亮或變暗（露出底下的講者、壓暗的東西變回全亮）→ ⚠「9.35 秒換段前後畫面閃一下（9.10–9.30 秒，<位置>）→ 前後兩段同一個底色就讓底一直在，只淡出字和圖」。只量這一輪改到的段的前後換段（`versions.mjs finish`）和 `build --review` 的全片（可以抽樣、要有時間上限）。驗證：短影片4 `s0101/v7`（r11 前，背景先淡掉露出書櫃）、`s0101/v8`（r13 前，標誌亮起）、`x0103/v5`（r10 前，深色底重跑擦入）要報；現在的版本不報。
- **N6 有底色的動畫硬切回講者**（同一個模組，⚠ `seam-cut`）：不透明底（整張幕、疊加段的色塊）在一格之內消失、露出講者，前後 0.3 秒沒有淡出或擦開 → ⚠「x0103 的深色底在 19.73 秒一格內消失 → 至少 0.3 秒淡出或擦開」。換到錄影段、章節幕這種本來就硬切的換段不報。驗證：短影片4 `x0103/v4`（「切換到沒有背景的畫面時，應該要動畫而非瞬間」那一版）報。
- **N7 卡上的字比講的晚**（audit ⚠ `bind-late`，和現在的「綁句對不上」同一處）：一拍綁 `#N@詞`，那一拍進場的元素的字在第 N 句裡從「詞」之前就開始了（元素的字含第 N 句裡比「詞」早的字），而且兩者相差 > 0.5 秒 → ⚠「s0110 拍 1 的字『用對的人很少』在 #46 一開口就講了，綁在『少』晚 0.9 秒 → 綁 #46@用對」。驗證：短影片1 `s0110/v5`（綁 `#46@少`）報、`v6` 不報。
- **N8 錄影停住太久**（`--check` ⚠ `media-hold`）：media 段裡 `retime` 讓錄影停在同一格（兩點 `src` 一樣）超過 2.5 秒、這段時間有字幕（講者在講）、而且沒有紅框、說明卡、步驟、箭頭在畫面上 → ⚠「m0105 錄影從 0:31.2 起停住 3.4 秒，畫面沒有在動 → 接到下一段錄影的開頭，或加紅框、說明卡」。驗證：短影片5 `m0105/v2` 報、`v3` 不報。
- **N9 剪點旁的停頓與短字幕**（build ⚠，`--check` 也印）：套完 `edit.cuts` 之後 (a) 某則字幕在完成影片裡不到 0.6 秒（和 `qc.mjs` F8 同一個判斷，抽成共用函式）→ ⚠「#29 剪掉一段後只剩 0.48 秒 → 剪輯台併到相鄰那則，或把剪點收到字幕開頭」；(b) 剪點兩邊用詞級逐字稿（或人聲能量）量到 > 0.2 秒的停頓 → ⚠「剪點 0:33.6 後面還有 0.24 秒停頓 → 剪點延到 0:33.84」。驗證：短影片4 現在的 plan.json（cuts `[33.52, 34.5]`）報 (a)；`plan.json.bak-r10`（cuts `[33.6, 34.1]`）報 (b)。
- **N10 版本工具也比手改的模板動畫和情緒點**：`versions.mjs begin` 存改前版本時，這一段若是模板段而且 `compositions/<模板>-<段>.html` 是手改過的（不是工具產生的），一起存；也存 plan.json 第一層 `moods`、`edit` 裡落在這段時間內的項目。`finish` 比對這些：有變就算「改了」（版本號 +1、剪輯台標「已改完」），報告寫「手改 compositions/…」「情緒點 #19@系統 改了」。驗證：短影片4 r8（s0104 手改）、主宣傳片 r12（只改情緒點的 x0105）重放，不再印「沒變」或標「失敗」。
- **N11 預覽頁多層影片對齊**（`tools/editor/preview*.js`）：完成影片預覽播放時，把去背層（`mattev-*`）、講者片段、錄影片段每一格對齊主時間（差超過 1 格就校正 `currentTime`），剪點前 0.5 秒先把下一段載好、seek 好；做不到（播放由 hyperframes 執行環境控制、改不到）就在預覽頁標一行「多層影片在預覽可能差一兩格，輸出不會」，並寫進回報。驗證：短影片4 預覽 0:33 剪點、短影片1 0:14–0:25 去背段，用瀏覽器量各層 `currentTime` 和主時間的差。

## 分包（平行做，檔案互不重疊；交界的地方只做最小的插入）

| 包 | 項目 | 主要的檔 |
|---|---|---|
| A 版面量測 | Q3、k1（audit 部分）、k2、k3、k4、k5、k6、k7（設計段）、k8、k9、k14 | `tools/audit.mjs`、`lib/audit-rules.mjs`、`lib/audit-page.mjs`、`lib/audit-browser.mjs`、`lib/audit-layout.mjs`、`lib/audit-beats.mjs`、`lib/canvas.mjs`、`lib/flow.mjs`（只改 `--review` 的 audit 範圍）；`dev/tests/audit*.test.mjs`、`canvas.test.mjs` |
| B 錄影段 | Q1（`media.mjs` 回傳 `m.pip`）、Q2、k16–k22、D3 | `lib/media.mjs`、`lib/events.mjs`、`kit/media.js`、`kit/media.css`、`tools/qc.mjs`（每框兩格的截圖）、`lib/main.mjs`（只有起始鏡位的初始 transform 需要時）；`dev/tests/media.test.mjs`、`screen-events.test.mjs`、`retime.test.mjs`、`qc.test.mjs` |
| C plan 層與聲音 | Q1（`plan.mjs` 讀 `m.pip`）、Q4、k1（`fx/catalog.json` 的 `portraitMinPx` 與 `--check`）、k7（模板 slots）、k15、k23、k24、k27 | `lib/plan.mjs`、`lib/moods.mjs`、`lib/autofix.mjs`、`lib/build-summary.mjs`、`lib/edit.mjs`、`lib/captions.mjs`、`fx/catalog.json`；`dev/tests/plan.test.mjs`、`moods.test.mjs`、`sfx.test.mjs`、`autofix.test.mjs`、`edit.test.mjs` |
| D kit、手改檔、版本 | Q6、k10、k11、k29、k31 | `kit/scene-motion.js`、`kit/scene.css`、`lib/custom-fill.mjs`、`tools/build.mjs`（手改檔那一段）、`tools/versions.mjs`；`dev/tests/motion.test.mjs`、`custom-fill.test.mjs`、`versions.test.mjs`、`feedback-round.test.mjs` |
| E 初剪與去背 | Q5、k25、k26、k28 | `lib/rough-flow.mjs`、`lib/rough/*.mjs`、`lib/matte.mjs`、`lib/matte-steady.mjs`；`dev/tests/ngscan.test.mjs`、`rough-flow.test.mjs`、`matte*.test.mjs` |
| F 換段與預覽 | k12、k13、k32 | 新的 `lib/seams.mjs`、`tools/editor/preview*.js`；在 `tools/versions.mjs` 的 finish 和 `lib/flow.mjs` 的 `--review` 各插一個呼叫 |
| G 文件（A–F 合併後） | Q7 的 13 條、k30（F2）、每條新檢查與新預設的說明 | `shared/style.md`、`shared/template/REVIEW.md`、`shared/template/USAGE.md`、`USAGE-reference.md`、`.agents/skills/auto-edit-motion/references/design.md`、`design-kit.md`、`.agents/skills/auto-edit-screen/SKILL.md`、`.agents/skills/auto-edit-rough/references/ng-rules.md`、`.agents/skills/auto-edit-review/references/feedback-round.md`；`dev/tests/docs.test.mjs`；改完重裝 Skill |

共同規則：

- 不 commit。工作區另有別的 session 沒 commit 的剪映草稿改動（`capcut.mjs`、`lib/jianying-draft.mjs`、`USAGE.md` 的一段、`auto-edit-deliver/SKILL.md`），不要動、不要還原。
- 驗證一律在複製出來的專案上跑：`cp -cR /Volumes/auto-edit-projects/<專案> /Volumes/auto-edit-projects/.tmp-055/<包>/<專案>`（同一個 APFS 映像檔，是複本不佔空間），再用 `ln -s` 掛成 `projects/tmp055-<包>-<專案>`；不在 `projects/ppa-*` 本體上跑，也不把真專案的 `work/` 連結進 worktree。用完刪掉自己的複本和連結。
- 只跑自己動到的測試檔（整套測試在全部合併後由主代理跑）；剪輯台的測試會搶 4401–4410 埠，不要跑。
- ⚠／✖ 的訊息照現有格式：「<段> <事實> → <怎麼改>」，台灣用語。新的門檻寫成常數、放在檔頭。
- 每包把做了什麼、驗證結果（哪一版報、哪一版不報）、留下的問題寫進 `specs/055-feedback-guards-impl/<包>.md`。

## 整批回歸（主代理，全部合併後）

1. 六支 PPA 各複製一份，現在的版本 `build --review`＋`versions.mjs finish`：記下新增的 ⚠，每一條要嘛是真的問題（列給作者），要嘛調門檻。不能讓新規則變成大家都忽略的雜訊。
2. 054／055 每條的「驗證」：抱怨的那一版要報、改好的那一版不報。
3. 整套測試加逾時跑一次。

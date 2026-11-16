# 056 作者回饋 r1：x-recap、x-receipt、x-ring-facets、x-trend 的直式（2026-11-16）

只改這 4 支 `shared/template/custom/*.html` 的直式（CSS 在 `[data-format="portrait"]` 底下，script 用 `P.portrait`／`PORT` 判斷）；這 4 支的 `.fill.json` 不用改。
r2 加做 x-comment：改了 `.html` 的直式，也改了 `x-comment.fill.json` 的 portraitMax。驗收是 `node dev/056/compare.mjs x-comment --root /Volumes/auto-edit-projects/.tmp-056-E --jobs 2`。
驗收：`node dev/056/compare.mjs x-recap x-receipt x-ring-facets x-trend --root /Volumes/auto-edit-projects/.tmp-056-E --jobs 2`，4 支都是「橫式 ✓ 逐像素相同、直式 audit 0 ✖」。
字級都是子合成的 px，畫面上的大小再乘 0.8475。

| 支 | 作者原話 | 改了什麼（直式） | 直式 ✖／⚠ | 並排圖 |
|---|---|---|---|---|
| x-recap | 左上角的 1~4 是多餘的 | script 在直式把每格的序號 `.xrcp-no` 刪掉（原本是搬進框的左上角），框下緣的標籤帶保留；拿掉用不到的 `.xrcp-no` 直式 CSS | 0 ✖、1 ⚠（beats-none） | `/Volumes/auto-edit-projects/.tmp-056-E/compare/x-recap.jpg` |
| x-receipt | 有點擁擠，0.8 倍字體 | 字照 0.8 倍縮：抬頭與「合計」80 → 64、品項／金額／單位 72 → 58、合計數字 120 → 96（畫面上 54／49／81）；行高跟著縮。列高（88）、抬頭（136）、合計列（132）不變，字和列之間多出空間；抬頭字的下內距 18 → 24，標題落在出紙口和虛線中間 | 0 ✖、1 ⚠（beats-none） | `/Volumes/auto-edit-projects/.tmp-056-E/compare/x-receipt.jpg` |
| x-ring-facets | 左側圓形的框要 1.8 倍粗，這樣數字才會順利呈現 | 環寬 56 → 95（viewBox 單位；畫面上 66 → 119，1.8 倍）。圓環 520 → 552，半徑 180 → 172（script 的 `RR`），外緣貼齊 552 的框。號碼球（80）整顆落在環帶裡，內外各留約 20。中間主題框跟著移到新圓心。兩行主題（topic2）在直式改成 60 字、行高 72（`#xrf-topic:has(br)`），因為環變粗、內徑剩約 312，兩行 72 字會壓到環 | 0 ✖、1 ⚠（beats-none） | `/Volumes/auto-edit-projects/.tmp-056-E/compare/x-ring-facets.jpg` |
| x-trend | 右側膠囊有點擁擠，可以 0.9 倍；文字的對齊有點怪異 | 一、膠囊：高 96 → 86、內距 32／28 → 29／25、間距 18 → 16、圓點 20 → 18，都是 0.9 倍。字 60 → 57，只縮到 0.95 倍，因為直式字級下限是 57（`shared/style.md`）。二、對齊，見下表 | 0 ✖、1 ⚠（beats-none） | `/Volumes/auto-edit-projects/.tmp-056-E/compare/x-trend.jpg` |
| x-comment（r2，包 F 改的那支） | 協調者看到、作者同意：頭像圓和箭頭圓相對太小；留言卡右邊空一截 | 字級都沒動。一、留言卡在直式改成 flex 一列：頭像和文字欄都放進流裡，`width: max-content`，寬度跟著內容走（範例 1180 → 約 1090，右邊不再空一截）。二、頭像 96 → 240（圖示 56 → 136），約等於名稱加兩行留言的高度；內距左 40、右 48，和文字欄間距 40。三、回覆卡 left 240 → 120，和留言卡左緣對齊，寬度一樣跟著內容。四、箭頭圓 80 → 104，和「我的回答」膠囊同高；由 script 搬進回覆卡當第一格，回覆卡內距 32、間距 20。五、頭像變大後文字欄最寬只剩 808，fill.json 的 portraitMax 改成留言每行 13 → 11 字，另外加名稱 ≤ 7、來源 ≤ 4.5；回覆維持 ≤ 8 | 0 ✖、1 ⚠（beats-none） | `/Volumes/auto-edit-projects/.tmp-056-E/compare/x-comment.jpg` |

## x-trend 找到的不對齊和改法

位置都是在直式完成態截圖上量的，單位是畫面 px。

| 不對齊 | 改前 | 改法 | 改後 |
|---|---|---|---|
| 「開始做 Shorts」標籤和「20,000 人」上下沒對齊 | 標籤貼圖表區頂（top 0）。標籤中線比數字字形中線高約 34 | 標籤 top 改成提示框 top＋40，讓它的中線對齊數字字形的中線 | 標籤中線 449.5、數字字形中線 450。標籤底 493，「人」底 491，底也幾乎貼齊 |
| 「人」和數字基線不一致 | 提示框是 `align-items: center`。數字行高 160、單位行高 84，兩個是各自置中，「人」浮在數字中段 | 直式提示框改成 `align-items: baseline` | 數字底 487，「人」底 491（中文字本來就比西文基線低約 4，屬正常） |
| 數字沒對齊 12 月那根柱子 | 提示框想置中在最後一根柱上，但被圖表區右緣擋住，結果停在圖表區右緣，比柱子右緣多出約 16 | 直式改成字的右緣（框線 4＋內距 28 往內）對齊最後一根柱的右緣 | 「人」右緣 967，柱子右緣 969 |

## 留下的 ⚠ 和要知道的

- 4 支都只剩 `beats-none`：暫存專案沒有動畫分鏡檔，不是模板的問題。
- x-trend 膠囊的字沒照 0.9 倍縮到 54。54 在畫面上是 45.8，低於作者訂的 48 下限，audit 會報 ⚠ `font`，所以停在 57。如果作者要字也剛好 0.9 倍，把 `#xtr-pill` 的 `font-size` 改成 54 就好，代價是一個 ⚠ `font`。
- x-ring-facets 主題的邊界內容另外試過：做法是暫時改暫存專案 P 裡的那支合成、用 `--no-build` 截圖，之後重跑整套 compare 換回範例。
  - 4 字單行（72 字）：放得進，左右離環內緣大約 10。
  - 兩行（4 字＋3 字，60 字）：放得進，四周都有空間。
- x-trend 沒有新增邊界風險，提示框只比原本往左 8 px。不過有一個從改前就存在的狀況：最長數字（「120,000」）加 3 字單位、又有標註的時候，標註會被擠到圖表區左緣，和提示框左段左右重疊。這是照 script 的常數算出來的，沒有實際截圖確認。
- x-comment 的代價：頭像做到約名稱加兩行那麼大，直式留言一行就從 13 字降到 11 字。想多留字可以縮頭像：196 時一行 12 字，124 時才回到 13 字。
- x-comment 也試過最少內容：沒有來源、只有一行留言、沒有讚數、沒有回覆。做法同上，暫時改 P 的合成、用 `--no-build` 截圖，再重跑換回範例。結果是 0 ✖，卡寬跟著收；頭像比一行的文字區高，不過整組上下置中。
- `node --test dev/tests/custom-fill.test.mjs`：16 條全過（加了 x-comment 之後重跑過）。

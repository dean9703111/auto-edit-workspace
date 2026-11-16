# 056 包 D：清單／堆疊（2026-11-16）

範圍：x-checklist（照新標準重做包 0 的示範）、x-checklist-ai、x-fix、x-folder、x-recap、x-relay、x-scroll-brake、x-stack、x-stack-podium、x-warnings。
只改了 `shared/template/custom/` 這幾支的 `.html`，以及 x-checklist、x-checklist-ai、x-folder、x-stack 的 `.fill.json`（加 `portraitMax`）。

驗收：`node dev/056/compare.mjs --pack D --root /Volumes/auto-edit-projects/.tmp-056-D --jobs 2` → 結束碼 0；10 支橫式都逐像素相同，直式都是 0 ✖，每支只剩 1 個 ⚠ `beats-none`（暫存專案沒寫動畫分鏡，不用管）。

## 標準怎麼套

- 字級寫在子合成裡，乘 0.8475 才是畫面上的大小。這一包的寫法：標題 80（畫面上 68）；主要文字 72–96（61–81）；大字 120–200（102–170）；次要小字 60（51）。
- `P.spot` 會把沒聚焦的列縮到 0.96，所以會被壓暗的字最少寫 60（壓暗時畫面上 48.8）。
- 主卡一律拉到 top 136、卡底 876（內容區 1176×608），標題列字 80。
- 有框的列：audit 的「內距不足」要框內高大約是 2 倍字級，字放大到 72 以上就放不進四層或三列。這幾支在直式改用膠囊的比例：容器加 `data-layout-allow-tight-portrait`，`portraitize` 只在直式把它換成 `data-layout-allow-tight`，橫式不受影響（見「機制缺口」1）。
- 檔頭【版面】每支都多一段「直式：」，寫排法、尺寸和放得下幾項、幾個字。

## 每一支

畫面上的字都已經乘過縮放。「內容占比」是直式完成態在舞台窗（子合成 x 120–1300、y 130–880）裡的寬×高。外框把卡片、框都算進去；字與圖只算文字、圖示和圖片。改前那欄是 survey 量的，量法不完全一樣，只能當參考。

| 模板 | 直式改了什麼 | 主要文字（改前 → 改後） | 最小字（改前 → 改後） | 內容占比（改前 → 改後：外框；字與圖） | 直式 ✖／⚠ | 並排圖 |
|---|---|---|---|---|---|---|
| x-checklist | 計數搬進標題列右邊（白字 80；`P.portrait` 時由 script 把 `#xchk-n` 移進標題列）；進度區只剩一條軌道 1080×24；四列 1096×112、空框 88、間距 16（`data-gap-portrait="sm"`）；拿掉包 0 的 `data-portrait-type`，改成每個字級直接寫；`portraitMax items.text 9` | 項目 44 → 81；標題 54 → 68；計數 44 → 68 | 44 → 67.8 | 0.9×0.86 → 1×0.99；0.9×0.89 | 0 ✖、1 ⚠（beats-none） | `/Volumes/auto-edit-projects/.tmp-056-D/compare/x-checklist.jpg` |
| x-checklist-ai | 同 x-checklist（計數移進標題列，和軌道用同一個 `P.in` 淡入）；四列 1096×112，項目與結果 88，狀態圈 88；`portraitMax items.text 6、items.res 4` | 項目／結果 44 → 75；標題、計數 54／44 → 68 | 44.1 → 67.6 | 0.9×0.86 → 1×0.99；0.9×0.88 | 0 ✖、1 ⚠ | `…/compare/x-checklist-ai.jpg` |
| x-fix | 改成上下排（`data-layout-portrait="col"`）：痛點欄在上（不畫框，一列高 88、字 72），箭頭往下，解法卡改成橫的 1000×184（圖示 104＋字 88）；副句在直式不放 | 痛點 44 → 61；解法 44 → 75；標題 54 → 68 | 33.9 → 61 | 1×0.92 → 1×0.99；1×0.97 | 0 ✖、1 ⚠ | `…/compare/x-fix.jpg` |
| x-folder | script 開頭用 `SceneMotion.portrait(ROOT)` 判斷直式，再照列數選尺寸：5 列以下列高 104、名稱 80；6 列列高 88、名稱 72；超過 6 列退一級（字 60）；`portraitMax items 6`（樣本有 9 列，所以 `--check` 會 ⚠） | 名稱 34 → 61–68（6 列以下）；樣本 9 列 → 51；標題 54 → 68 | 32.2 → 50.7（樣本 9 列，退一級） | 0.7×0.87 → 1×0.99；0.77×0.94 | 0 ✖、1 ⚠ | `…/compare/x-folder.jpg` |
| x-recap | 標籤由 script 搬進框裡，疊在截圖下緣的深色半透明帶上（白字 72 置中）；序號改成框左上角的圓（88，字 60）；用直式自己的 LAY：4 張 2×2 框 472×272、3 張時第三張在第二列置中、2 張一列 536×310；打勾徽章 88；標籤帶和序號標 `data-layout-allow-overlap` | 標籤 34 → 61；標題 61 → 68；序號 27 → 51 | 27.1 → 50.9 | 0.76×1 → 0.85×0.96；0.83×0.94 | 0 ✖、1 ⚠ | `…/compare/x-recap.jpg` |
| x-relay | 膠片變窄（截圖卡 480×280，一格 312，視窗 y 130–880）；右欄 x 648 起：主體 80、能力詞 120、說明 60（超過 10 字換第二行）；`STEP` 依直式改 | 能力詞 95 → 102；主體 54 → 68；說明 34 → 51 | 33.9 → 50.8 | 0.89×1 → 0.85×1；0.84×1 | 0 ✖、1 ⚠ | `…/compare/x-relay.jpg` |
| x-scroll-brake | 改成上下排：上面一列計數（大數字 200 靠右，右邊是小標膠囊和單位 80），下面是視窗卡 1180×516；一屏 3 列（列高 104、列距 120、名稱 72、編號圓 88）；捲動距離、第一屏列數、準星寬度由 script 依直式改 | 名稱 34 → 61；單位 47.5 → 68；大數字 203 → 170；標題 54 → 68；編號、膠囊 34 → 51 | 33.9 → 50.8 | 0.92×1 → 1×1；0.89×1 | 0 ✖、1 ⚠ | `…/compare/x-scroll-brake.jpg` |
| x-stack | 層的大小不變（1048×112）；名稱 72、說明 60、圖示 88；`portraitMax items.text 4、items.desc 9` | 名稱 44 → 61；說明 34 → 51 | 33.8 → 50.7 | 0.92×0.89 → 1×0.99；0.92×0.93 | 0 ✖、1 ⚠ | `…/compare/x-stack.jpg` |
| x-stack-podium | 層寬不變，層高 118 → 120；名稱 72、圖示 80 | 名稱 44 → 61 | 44.1 → 61 | 0.9×0.89 → 1×0.99；0.9×0.93 | 0 ✖、1 ⚠ | `…/compare/x-stack-podium.jpg` |
| x-warnings | 改成上下排（`data-layout-portrait="col"`）：清單三列 1096×104（字 72）在上，示意區變成下面一條 1096×144（圖示 104＋說明 72 並排） | 列字 44 → 61；示意說明 44 → 61 | 44.1 → 61 | 0.79×0.8 → 1×0.99；0.66×0.88 | 0 ✖、1 ⚠ | `…/compare/x-warnings.jpg` |

另外驗了少項的版本（compare 只截樣本，所以另外用 fillTemplate 產生後放進 P 專案再 build、audit）：

- x-recap 3 張、2 張：都是 0 ✖。
- x-folder 5、6、7 列：都是 0 ✖，名稱在畫面上 68／61／51。
- 只有 `static` ⚠，原因是我的測試方式：拿掉項目後段長沒跟著縮短。

## 達標狀況

- 9 支用範例內容就達標：主要文字 ≥ 60、標題 68、大字 ≥ 96、次要字 ≥ 48，內容外框寬 ≥ 85%、高 ≥ 96%。
- x-folder：6 列以下達標（61–68 px）。樣本有 9 列，超過直式上限 6 列，只能退一級排（字在畫面上 51、列很擠）。這是「放不下就減量」的設計：`--check` 會用 portraitMax ⚠ 提醒拆成兩段。看並排圖時要知道，那張是退一級的畫面。
- 這幾支在直式放寬了框內上下內距（`data-layout-allow-tight-portrait`）：x-stack、x-stack-podium、x-warnings、x-scroll-brake、x-recap（標籤帶）。字在框裡看起來比橫式緊，像膠囊的比例。

## 可以從 PENDING_056 拿掉的名單

沒有。`dev/tests/examples.test.mjs` 的 PENDING_056 只有 x-receipt（E）、x-slider（F）；包 D 的 10 支一開始就不在表上，改完直式也都是 0 ✖。

## 機制缺口

1. **audit 的「內距不足」和直式大字衝突**：門檻是框內上下 ≥ 0.28 em，量的是字的整個 content area，所以框內高大約要 2 倍字級。直式字放大到 72 以上之後，有框的列（層、清單列、示意帶）幾乎都會撞到。這次在模板裡用 `data-layout-allow-tight-portrait` 只在直式放寬，是現有機制做得到的寫法。要不要讓 audit 對縮放段改用膠囊比例，或在文件裡把這個寫法列為正式做法，請作者決定。
2. **直式要把元素搬到別的父層，只能靠 script**：title-overlap 只放過標題列的子孫，所以「計數放進標題列」得在 script 用 `P.portrait` 搬 DOM（x-checklist、x-checklist-ai）。x-recap 的標籤、序號搬進框裡也一樣。目前沒有宣告式的「直式換父層」。
3. **SceneMotion 之前就要長 DOM 的模板**（x-folder、x-recap、x-relay、x-scroll-brake）要在 script 開頭呼叫 `SceneMotion.portrait(ROOT)` 才知道是直式（包 0 有提供這個函式）。USAGE-reference R7.2 只寫了 `P.portrait`，建議補一句。
4. **x-folder 9 列在直式只能縮字**：要在直式放 7–9 列又不縮字，得做成「樹在視窗裡跟著焦點捲動」。不過捲出卡片的列會被 audit 當成被裁掉（✖），要 audit 放行才做得到。這次沒做，改用 portraitMax 6。
5. **compare.mjs 只截樣本**：少項的版本要自己產生（我在 scratchpad 寫了一支用 fillTemplate 產生後放進 P 再 build 的小工具，沒放進 repo）。另外，在暫存專案自己跑 `build.mjs` 時要加 `AUTO_EDIT_MATTE=box`。compare 有設，自己跑沒設會去跑真的去背模型，卡好幾分鐘。

## 附帶發現（不是包 D 的檔）

`node --test dev/tests/custom-fill.test.mjs` 第 2 條（fillTemplate 項數變少刪掉那一站）目前失敗，失敗在 x-process（包 C 正在改的檔）：產生的檔還留著直式 CSS 的 `#xprocx07-n4` 選擇器。包 D 的模板在第 1 條（sample 填回去＝模板）都通過。

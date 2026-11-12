# 028 圖庫：常用物件的線稿

來源：作者 2026-11-12。

- 「可以事先製作一些常用的 SVG 圖片並說明使用時機，可以先上網搜尋一些免費的開源資訊，大概可以先備齊 400 個常用的，這樣渲染時更像是找匹配」
- 「設計成類似目錄的格式來存取，這種結構化資訊更好處理」
- 「如果要製作示意圖，生成時可以使用 Codex」（這次的說明圖是程式畫的 SVG，沒有用到生圖）

## 決定

| 題目 | 決定 | 為什麼 |
|---|---|---|
| 來源 | Tabler Icons outline（MIT，4,936 個）為主，工作區已有的 Lucide（ISC）補幾個 | 兩套都是 24 格、只有線的圖示，換成工作區畫風後看起來是同一套。OpenMoji（CC BY-SA）、Streamline 免費組（CC BY）要在每支影片標示出處，不用；Phosphor duotone 的線是填色畫的，放大後比現有元件粗很多，不用 |
| 畫風 | 和 `kit/illus-style.md` 同一套：封閉的形狀補白色主體、底下一層錯開的主色淡影、線 4px 不隨縮放變粗；顏色只用 `--il-*` | 和畫廊的 22 個元件、連接線放在一起不突兀，跟著主色與亮暗主題。試了五種處理（只有線、加白色主體、加主色錯位影、最小塊換主色、加主色圓底）：「最小塊換主色」有時很好（相機鏡頭）有時很怪（車輪），選每一張都穩的錯位影 |
| 轉換 | 程式做：先畫所有填色、再畫所有線，填色不會蓋掉線；只有「一筆畫完、頭尾相接」的 path 才補填色 | 444 張不可能手調；線都是同一個顏色，改畫的順序看不出來 |
| 目錄 | 三層：`catalog.json`（16 類，每類「什麼時候翻」）→ `<類別>.json`（每張的中文名、使用時機、關鍵字、來源）→ `<類別>/<id>.svg` | 用到哪一層讀哪一層，不用整份讀 |
| 查詢 | `build.mjs --pics`（目錄）、`--pics <類別>`、`--pics 手機,獎盃`（印 id、使用時機、整行寫法） | 和 `--icons` 同一個習慣 |
| 怎麼用 | 內容設計動畫：`data-illus-src="kit/pics/<類別>/<id>.svg"`；示意動畫 `x-scene` 的 parts 寫 `"pic": "<id>"`（工具換成路徑、固定正方形，分鏡表插圖欄寫 `pic:<id>`） | 沿用外部 SVG 的掛法（`ILLUS.mount` 同步讀檔）；kit 本來就整包複製到專案 |
| 找圖的順序 | 畫廊 → 圖庫 → 圖示 → 新畫 | 寫在 `kit/illus-style.md` §1、`design-kit.md`、`--spec x-scene`、`SITUATIONS.md` |

## 檔案

- 來源清單：`dev/pics/catalog.tsv`（`id|來源|中文名|使用時機|關鍵字`；類別列是 `# 類別 id|中文名|什麼時候翻`）
- 產生器：`node dev/tools/pics-build.mjs --tabler <Tabler 的 icons/outline 資料夾> [--check] [--sheet <png>]`。Tabler 不放進 repo：在暫存資料夾跑 `npm pack @tabler/icons` 再解開（這次用 3.31.0）
- 產物：`shared/template/kit/pics/`（444 張、約 1.9 MB，含 `LICENSE-tabler.txt`）、`shared/template/kit/pics-gallery.html`（給人看：搜尋、切亮暗、點了複製寫法）
- 工具：`shared/template/tools/lib/pics.mjs`；`lib/custom-fill.mjs`（x-scene 的 pic）、`lib/audit-illus.mjs`、`lib/audit-beats.mjs`、`audit.mjs`（認得圖庫路徑和 `pic:<id>`）
- 測試：`dev/tests/pics.test.mjs`（目錄三層對得上、每張的畫風規則、查詢、x-scene、audit、圖庫頁）
- 說明圖：`dev/site/guides/pics.jpg`（`node dev/tools/docs-figures.mjs`）

## 驗證

- `projects/t026` 用圖庫的 phone、cloud-upload、laptop 排一段 x-scene：build、audit 通過，截圖上線條粗細和連接線一致。
- 總覽圖只看了前半（截圖工具一次截不到整頁），後半沒有逐張看。

## 還沒做

- 其他模板的插圖欄位（`x-callout` 的主體、`x-callout-parts` 的 `illus`）還只能選畫廊元件，沒有接圖庫。
- audit 的「主角太小」只量畫廊元件，圖庫的圖量不到。
- 圖只有一種狀態（沒有 `.il-<狀態>`）；要換狀態的物件還是用畫廊元件或自己畫。
- 清單是照這個頻道常講的題材挑的，沒有用實際講稿統計過哪些詞常出現。

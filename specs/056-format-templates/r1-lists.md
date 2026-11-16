# 056 r1：清單類直式縮小（2026-11-16）

作者看完對照圖後的原話（這幾支都只改直式）：
x-checklist、x-checklist-ai「清單字大概調整後的 0.8 倍」；x-scroll-brake、x-stack「調整後畫面太壅擠，列表可以調整為 0.8 倍大小」；x-stack-podium「…列表可以調整為 0.9 倍大小」。

做法：清單那部分（字、列高、圖示、編號圓）照比例縮。標題、計數、x-scroll-brake 上面那一列計數都不動。縮完空出來的地方用間距鬆開（列與列的間距、上下內距），不把字放回去。
只改了 `shared/template/custom/` 這 5 支的 `.html` 直式 CSS、檔頭「直式：」那一行，以及 x-checklist、x-checklist-ai、x-stack 的 `.fill.json` `portraitMax`。

驗收：`node dev/056/compare.mjs x-checklist x-checklist-ai x-scroll-brake x-stack x-stack-podium --root /Volumes/auto-edit-projects/.tmp-056-D --jobs 2` → 「5 支都過」：5 支橫式都和改前逐像素相同，直式都是 0 ✖。`node --test dev/tests/custom-fill.test.mjs` 16/16 通過；`node --test dev/tests/examples.test.mjs` 0 fail（含 056 直式整合：54 支 build → audit 0 ✖）。

畫面上的 px 已經乘過縮放 0.8475。「056」是 r1 之前的工作區版本（不是 git HEAD）。

| 模板 | 改了什麼（直式） | 主要文字（056 → r1，畫面上） | 直式 ✖／⚠ | 並排圖 |
|---|---|---|---|---|
| x-checklist | 項目字 96 → 76；列 1096×112 → 1096×88；空框 88 → 72；列距 16 → 24（拿掉 `data-gap-portrait="sm"`，和橫式一樣用 md）；四列＋軌道 536 → 472，上下 36 → 68。`portraitMax items.text` 9 → 12 | 項目 81.4 → 64.4（0.79 倍）；標題 68、計數 68 不變 | 0 ✖、1 ⚠（beats-none） | `/Volumes/auto-edit-projects/.tmp-056-D/compare/x-checklist.jpg` |
| x-checklist-ai | 項目與結果 88 → 70；列 112 → 88；狀態圈 88 → 72；列距 16 → 24（一樣拿掉 `data-gap-portrait`）；上下 36 → 68。`portraitMax` items.text 6 → 7、items.res 4 → 5（12 字 × 70 ＋ 列內 192 ≤ 1096） | 項目／結果 74.6 → 59.3（0.80 倍）；標題、計數 68 不變 | 0 ✖、1 ⚠（beats-none） | `/Volumes/auto-edit-projects/.tmp-056-D/compare/x-checklist-ai.jpg` |
| x-scroll-brake | 清單：列高 104 → 84，列距 120 不變（間距 16 → 36，一屏照樣 3 列整列露出）；名稱 72 → 58；編號圓 88 → 72（字 60 → 48）；「留下的」膠囊高 88 → 72，字 60 → 58（和名稱同字級，橫式也是同字級）；四角準星 y 602–754 → 612–744（離上下兩列各 12，056 版會壓到上一列 8 px）；script 的 `dist` 列高改 84。上面計數那一列不動。r2：作者說停點列的橘框離字太近，列高 84 → 100，編號圓、膠囊離框上下各 10。列距 120 → 134（間距 34），清單區卡底上 16 → 12（高 368，一屏照樣 3 列整列露出；標題列下照樣 24，往上挪會出 title-gap ⚠）。四角準星 y 612–752（上下外擴 20、左右 22，離上下兩列各 14）。`dist` 改成 134 ×（K − 1）＋ 50 − 184。字級照 r1；compare 橫式逐像素相同、直式 0 ✖、⚠ 一樣是編號 31 個＋ beats-none | 名稱 61.0 → 49.2（0.81 倍）；膠囊 50.9 → 49.2；編號 50.9 → 40.7；大數字 170、單位 68、標題 68 不變 | 0 ✖、32 ⚠（31 個「字太小」＋ beats-none，見下面） | `/Volumes/auto-edit-projects/.tmp-056-D/compare/x-scroll-brake.jpg` |
| x-stack | 名稱 72 → 60；說明 60 → 48；圖示 88 → 72；層高 112 → 96（層寬 1048 不變）；層距 16 → 24（`data-gap-portrait="md"`）；四層 496 → 456，上下 56 → 76。`portraitMax`：items.text 4 拿掉（名稱回到橫式上限 6 字），items.desc 9 → 10 | 名稱 61.0 → 50.9（0.83 倍；沒聚焦的層縮 0.96 也有 48.8）；說明 50.9 → 40.7；標題 68 不變 | 0 ✖、6 ⚠（5 個「字太小」＋ beats-none，見下面） | `/Volumes/auto-edit-projects/.tmp-056-D/compare/x-stack.jpg` |
| x-stack-podium | 0.9 倍：名稱 72 → 64；圖示 80 → 72；層高 120 → 108（層寬 960／800／640／480 不變，台座照樣緊貼）；四層 480 → 432，上下 56 → 88 | 名稱 61.0 → 54.2（0.89 倍）；標題 68 不變 | 0 ✖、1 ⚠（beats-none） | `/Volumes/auto-edit-projects/.tmp-056-D/compare/x-stack-podium.jpg` |

## 和「0.8 倍」不完全一樣的地方

- x-stack 名稱用 60，不用 58（0.83 倍）：58 在沒聚焦的層（P.spot 縮 0.96）畫面上是 47.2，差 0.8 px 就低於下限 48，audit 會 ⚠。改成 60 之後就過了。
- x-stack 層高 96，不用 88（0.86 倍）：88 看起來字還是塞滿整層，和 056 一樣擠。改 96 之後層裡上下有空，整組也比 056 矮 40。
- x-scroll-brake 的「留下的」膠囊字用 58，不用 48：0.8 倍會變成畫面上 40.7，這是停下來那一列的重點標籤。膠囊靠右、旁邊很空，放大不會變擠。

## 留下的 ⚠（作者的 0.8 倍和直式字級下限 48 px 衝突）

- **x-scroll-brake：編號圓的數字 31 個**（30 列的 `.xsb-chip`，加上停點列的主色圓 `.xsb-on`），畫面上 40.7。056 寫 60，0.8 倍就是 48。要回到 ≥ 57，編號圓得放大回 88、列高回到 104，等於沒縮。編號是次要資訊（序號），所以照作者的 0.8 倍。
- **x-stack：說明 5 個**，畫面上 40.7。056 是 60，0.8 倍是 48。說明在沒聚焦的層也會縮 0.96，要不 ⚠ 得寫 60，也就是說明完全不縮，名稱和說明一樣大，橫向照樣擠。所以照作者的 0.8 倍。
- 請作者決定：要守 48 下限的話，x-stack 說明改回 60（名稱跟著維持 60 以上），x-scroll-brake 編號改回 88 圓、57 字（列高回 104）。只要改這兩支直式 CSS 的那幾行。
- 5 支都還有 1 個 `beats-none`：暫存專案沒寫動畫分鏡，和 D.md 一樣，不用管。

## 有看過的畫面

每支都看過並排圖，第一列是完成態；x-stack、x-stack-podium、x-checklist、x-checklist-ai 也看過關鍵拍（聚焦一列、其他壓暗）。直式沒有破版，沒有字被切掉。
清單比 056 小一號，列和列之間、清單和標題列之間都鬆開了。x-scroll-brake 停下來時上下兩列整列露出，準星不再壓到鄰列。

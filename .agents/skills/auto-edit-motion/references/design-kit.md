# 內容設計動畫：現成資源（用到哪一節讀哪一節）

`design.md` 的補充。畫面自己畫就夠的段不用讀這份。指令在工作區根目錄跑。

## 圖庫（常用物件的線稿）

講解提到一個具體的東西（手機、雲端、獎盃、行李箱、錢、火箭…）先來這裡找，有就用，不用自己畫。每一張都附「什麼時候用」。

- 用詞找：`node shared/template/tools/build.mjs --project projects/<專案> --pics 手機,獎盃`，印出符合的 id、使用時機和整行寫法。
- 看目錄：`--pics` 不帶詞印有哪幾類、每一類什麼時候翻；`--pics <類別>` 印那一類全部。
- 掛上去：`<div data-illus-src="kit/pics/<類別>/<id>.svg" style="width:320px;height:320px"></div>`（都是正方形；主角 300–480px），script 第一行加 `ILLUS.mount(document.getElementById('x-design-<段>'));`。顏色跟著主色和亮暗主題，不用自己上色。
- 圖庫沒有的：先想能不能用形狀自己畫，或用下面的圖示；真的需要一個新物件才照「新畫一個物件」。回報加 `｜圖庫：<id>`。

## 圖示（lucide）

`<span class="sc-icon" data-icon="名稱" style="--d:140px;--i:84px"></span>`：`--d` 是圓底大小、`--i` 是圖示大小，工具會把圖示畫進去。

查名稱：`node shared/template/tools/build.mjs --project projects/<專案> --icons 行事曆,clock`（一次查好幾個；中文查不到換英文關鍵字）。

## 有名字的現成效果（registry）

```
(cd projects/<專案>/work/hyperframes && npx hyperframes catalog --query "<英文描述>" --type component --json)
(cd projects/<專案>/work/hyperframes && npx hyperframes add <名稱> --json)
```

只用 component。裝好的在 `work/hyperframes/compositions/components/<名稱>.html`：把它的 markup、style、script 搬進你的動畫檔，id 和 class 換成自己的前綴、選擇器加 `#x-design-<段>`、拿掉它自帶的字型、顏色換成 token、時間改用你的 `Tn`。查兩次沒有合用的就自己寫。回報加 `｜registry：<名稱>`。

## 新畫一個物件

現成的線稿元件、圖示、registry 都沒有合用的才畫；一段最多新畫一個（其他的用圖示或簡單形狀代替）。

1. 鏡位腳本的表下面加一張清單（檢查會照它核對尺寸和狀態）：

   ```
   #### 插圖清單 <段 id>

   | 元件 | 來源 | 怎麼來 |
   |---|---|---|
   | hourglass | 新建 SVG | 規格：hourglass，建議尺寸 220×300，狀態 full／empty；描述：上下兩個玻璃球、中間細腰、上下各一條底座 |
   ```

   名稱小寫英文開頭、只用英數；沒有狀態寫 `狀態 —`。
2. 照 `shared/template/kit/illus-style.md` 畫，存成 `work/hyperframes/illus-local/<名稱>.svg`。
3. 跑 `node shared/template/tools/media.mjs illus-lint --project projects/<專案> --only <名稱>`：0 個 ✖ 才用，⚠ 照 → 改一輪。打開它印的 `work/插圖清單-<名稱>.jpg`，和旁邊的現成元件比線粗、圓角、用色，不像同一套就改一次。
4. 掛上去：`<div data-illus-src="illus-local/<名稱>.svg" style="width:<寬>px;height:<高>px"></div>`（路徑從 `work/hyperframes/` 算），script 第一行加 `ILLUS.mount(document.getElementById('x-design-<段>'));`；狀態用 GSAP 調 `.il-<狀態>` 的 opacity。回報加 `｜新畫：<名稱>`。

## kit 的現成動作（`P.*`）

數字滾動 `P.count`、打字 `P.type`、把線或框畫出來 `P.draw`／`P.stroke`、聚焦（一個放大、其他壓暗）`P.spot`、換狀態 `P.swap` 這幾種，用 kit 的比自己寫穩（時間軸跳到任何一秒都對）。寫法查同一個資料夾的 `kit-syntax.md` 那一列；可以和 GSAP 混在同一個檔。

## 連接線、引線

兩個東西之間的線（箭頭、引線、連到標籤的線）不要自己算座標寫 `<path d="M440 560 L560 300">`：元件一搬位置線就歪，兩條線還會交叉。放一個空的 svg，寫要連哪兩個元件的 id，kit 會把線畫在兩邊外框邊的中點之間、兩端各留一點空隙：

```html
<svg id="xd-lines" data-links="xd-phone-xd-cardA xd-phone>xd-cardB"></svg>
```

- `a-b` 沒有箭頭、`a>b` 有箭頭；多條用空白隔開。svg 放在和這些元件同一個容器裡（容器要有 `position`）。
- 線的 id 是 `<a>-<b>`，描出來寫 `P.stroke('#xd-phone-xd-cardA', T, { dur: 0.5 })`。顏色、粗細用 CSS 寫在這個 id 上。
- 左右並排的兩個元件是水平直線，上下並排是垂直直線，斜對角是先水平再垂直的折線。想要線是直的，就把兩個元件排在同一列或同一欄。
- 真的要手寫（例：曲線），兩端要落在元件邊的中點外 4–32 px；audit 會量，歪了印 ⚠ `layout-link`。

## 現成的線稿元件

有合用的就用它（別段也用同一個，全片才一致）；沒有才照「新畫一個物件」畫。現有：`phone`、`phoneTripod`、`tripod`、`laptop`、`monitor`、`cloud`、`personBust`、`pgPerson`、`personTop`、`desk`、`stage`、`cone`、`waveform`、`progress`、`energy`、`fileVideo`、`window`、`searchBar`、`badge`、`recPill`、`stopwatch`、`hourglass`（沙漏，沙會流）、`bookmark`。長相、選項和寫法看 `shared/template/kit/illus-gallery.jpg`（一張圖，每格下面有寫法）。

- 掛上去：`<div data-illus="laptop" data-screen="blank" style="width:420px;height:285px"></div>`（寬高照圖上的比例放大），script 第一行加 `ILLUS.mount(document.getElementById('x-design-<段>'));`。
- 有螢幕的元件每個狀態都畫好了，是 `.il-<狀態>` 子元素（`video` 的 class 是 `.il-content`）；換狀態：`P.swap('#xd<段>-a .il-rec', '#xd<段>-a .il-warn', T2)`。
- brief 的前後段寫了用到哪個元件、朝向時，同一個東西用同一個。

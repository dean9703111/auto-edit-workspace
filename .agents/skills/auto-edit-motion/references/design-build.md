# 內容設計動畫：做動畫

**這不是套模板。** 模板（字卡、`x-process`、`x-scene`…）工具會自動產出。這裡是使用者最在意、最能提升質感的部分：從這段**內容**出發，專門為它設計一個畫面。不要打開 `shared/template/custom/x-*.html` 找靈感、複製或模仿版面；看過模板，做出來就會長得像模板。

不要讀 `shared/template/tools/`、`shared/template/kit/*.js`：要用到的都寫在這份。也不要讀別段的 `compositions/*.html`。不要用 node 或 python 拆現成元件的 SVG、也不要複製圖示的 SVG 路徑貼進檔裡：插圖寫 `data-illus`、圖示寫 `data-icon`，工具會自己畫進去。畫廊的元件和圖示都不合，就照 `shared/template/kit/illus-style.md` 新畫一個（見最後的「新畫線稿元件」）。指令都在工作區根目錄跑，路徑從 `projects/<專案>/` 寫起。文件裡的 `work/` 都是 `projects/<專案>/work/`。

每段最多 18 次工具呼叫（新畫元件也算在裡面）。到第 18 次就停手，照最後的「回報」回卡在哪。

**開工**（照順序；剛照 design-script.md 寫完鏡位腳本的，brief 和腳本都讀過了，直接做第 4 步）：

1. 沒有 `work/briefs/<段 id>.md` 就停手，只回 `<段> 沒有 brief`。
2. 讀畫布：`grep -n -A4 "## 畫布" projects/<專案>/work/briefs/<段 id>.md`。
3. 讀鏡位腳本：跑 `ls -t projects/<專案>/work/designs/<段 id>.md projects/<專案>/work/storyboard.md | head -1`，印出哪個就讀哪個（audit 也照比較新的那份對拍）。印 designs 就整份讀；印 storyboard.md 就跑 `grep -n -A30 "動畫分鏡 <段 id>" projects/<專案>/work/storyboard.md`。
4. 改 `work/hyperframes/compositions/x-design-<段 id>.html`：工具已經開好空白畫布，先把裡面那個占位的 `data-design-blank` 元素整個刪掉（工具靠它判斷這段還沒做）。

你只能寫這個檔、`illus-local/` 底下自己新畫的 SVG、`work/designs/<段 id>.md`、`work/reports/<段 id>.md`；不改 plan.json、storyboard.md、shared/，不跑 build、不 render（`audit` 會自己檢查，作者在完成影片預覽看會動的樣子）。查圖示名稱的 `build.mjs --icons` 可以跑（只查名稱，不算跑 build）。改動畫時拍變了（修改單、改版）：改 `work/designs/<段 id>.md` 那張動畫分鏡表（沒有這個檔就把 storyboard.md 那一節的表抄過去再改），audit 照比較新的那份對拍，`versions.mjs finish` 會寫回 storyboard.md。

分兩次做，不要在心裡把整份想完才動手（一次想太多會寫到一半被中斷，前面全白做）：**第一次 write 只寫骨架**：版面和元件擺好、每拍一個 `const Tn = P.at(…)` 和那一拍的主要動作，就跑 audit；**之後只用 edit** 補細節（描線、強調、退焦、音效）和改 audit 指出的地方。不要整份重寫：重寫一次和第一次一樣久，檔案在你讀過之後被工具動過時還會被拒絕寫入。

鏡位腳本的位置是相對描述（舊腳本有座標就當參考）。畫布範圍只用來放最外層容器，容器裡的元件用排版宣告擺，不寫座標（見「寫法」的版面那一條）。

**畫布**：1920×1080。這段是哪一種，看 brief 的「畫布」那一節，工具已經算好：

| brief 寫 | 可以用的範圍 | 注意 |
|---|---|---|
| 全螢幕（這段沒有講者） | x 120–1800、y 40–900 | 最外層容器放 x 120–1800、y 112–900：y 112 以上是右上角小節角標那一排（角標座標看 brief「不能碰」那一行）。不用留小視窗，內容撐開整個寬度，主角放大。左右和縮到 87% 的螢幕錄影對齊（錄影 x 125–1796、y 0–940），接到錄影不會跳。底是純色，沒有背景圖 |
| 右下有講者小視窗 | x 120–1300、y 150–858 | 最外層容器就放這個範圍。小視窗 x 1424–1888、y 581–951 不能碰 |
| 疊在講者畫面上 | brief 寫的「內容放在…」那一區（講者框外） | 沒有底圖，內容不要擋臉；brief 沒有講者框座標時放講者旁邊的空位，audit 報「壓到講者」就照 → 移 |

三種都一樣：y ≥ 920 是字幕，不能碰。寬 1180 的主卡（`.sc-wcard`）在全螢幕段會自動拉成 1680。

**寫法**：

- 所有 CSS 選擇器以 `#x-design-<段 id> ` 開頭；自己的 id、class 用畫布已有的前綴 `xd<段 id>-`。
- 骨架（`$q`、`SceneMotion`、`P.end()`、`__timelines`）已經寫好，不要動。長度不用管：結尾的 `P.end()` 會讓這段自動等於段長，`data-duration` 不用改。插圖裡能單獨動的只有下面元件表列的 class（`.il-<狀態>`、`.il-content`、`.il-fill`…），其他部分整個插圖一起動。用到插圖時，寫 `<div data-illus="phone" data-orient="landscape" data-screen="qr" style="width:250px;height:120px"></div>`（`data-*` 就是元件表的選項），script 第一行加 `ILLUS.mount(document.getElementById('x-design-<段 id>'));`。換螢幕狀態：`P.swap('#a .il-qr', '#a .il-content', T1)`（class 是 `.il-<狀態>`，video 是 `.il-content`）。
- 版面用宣告，不自己算座標。最外層容器照上面的畫布表寫一次位置和大小，例（有小視窗）：`<div id="xd<段 id>-stage" data-layout="row" data-gap="xl" style="position:absolute;left:120px;top:150px;width:1180px;height:708px">`（全螢幕段寫 `left:120px;top:112px;width:1680px;height:788px`）。裡面的元件加 `data-slot`，不寫 left、top；排法 `data-layout="row|col|cols-2|grid-2x2|free"`、間距 `data-gap="xxl|xl|lg|md|sm|none"`，元件裡面還要排就再包一層有 `data-layout` 的 `data-slot`。連接線 `<svg data-links="xdID-a>xdID-b" xmlns="http://www.w3.org/2000/svg"></svg>`（線 id 是 `<a>-<b>`）。只有位置本身有意思的（地圖上的點、一個元件疊在另一個上面）才用 `data-layout="free"` 自己寫 left、top，數字用 8 的倍數。
- 顏色只用 token：`var(--brand)`、`var(--sc-fs-ink)`、`var(--sc-fs-card)`、`var(--sc-fs-card-line)`、`var(--sc-warn)`、`var(--sc-good)`、`var(--v2-node)`、`var(--v2-line)`、`var(--v2-card)`。陰影用 `var(--v2-card-shadow)`；光暈、發光由 `P.spot`、`P.comet` 自己帶，不用另外寫；其他 `--v2-*` 名稱不要自己猜。主色只給焦點。
- 字級 class 只有 `.sc-t30`、`.sc-t34`、`.sc-t36`、`.sc-t40`、`.sc-t44`、`.sc-t48`、`.sc-t52`、`.sc-t54`、`.sc-t56`、`.sc-t60`、`.sc-t64`、`.sc-t72`、`.sc-t80`、`.sc-t112`、`.sc-t150`，其他字級直接寫 `font-size`；粗細 `.sc-w700`／`.sc-w900`、`.sc-opt`。常用零件：`.sc-wcard`＋`.sc-wcard__bar`（主卡與標題列）、`.sc-icon`（`--d` 圓的大小、`--i` 圖示大小）、`.sc-pill`。
- 晚出現的東西要有進場動作（擦開、滑入、彈出、長出、抽屜抽出、淡入、逐字、打字、描線），進場前工具會讓它看不見。三個條件：程式照時間先後寫，這個元素的進場那行寫在它的聚焦、退焦、淡出前面；有底或有框的盒子（卡片、膠囊）對盒子本身做進場，只對裡面的字做逐字，盒子會先露出來；只做強調（螢光筆、重拍、光澤、漣漪）或數字滾動的元素開場就看得到，要晚出現就先加一行 `P.in`。不要用 CSS `opacity: 0` 藏：擦開、抽屜、逐字、描線不會把它調回來，會一直看不見。拼圖最早那幾格看到還沒講到的東西，就是這條沒做到。

**時間軸**：每一拍一個常數，名字只用大寫英文和數字：`const T1 = P.at('#13@跑到');`（字串字面值，不要組字串）。配音效：`const T2 = P.sfx('success', '#14@確認');`（一段最多一顆主音效；游標按下另外寫 `P.sfx('click', '#15@按下')`，不算主音效）。時間一律「本段起點之後的秒數」，對字幕一定用 `P.at`。同一拍裡的小動作用 `T1 + 1.2` 接；`@詞` 要是字幕那句裡連續的字，`audit` 第一行會印每個綁句的實際秒數。

語法速查（不用去讀 `kit/scene-motion.js`；`sel` 是選擇器字串，`at` 是秒數，大括號都是選填）：

| 動態 | 寫法 |
|---|---|
| 擦開、擦掉 | `P.wipe(sel, at, {dir, dur})`（dir：left、right、up、down）、`P.wipeOut(sel, at, {dir})` |
| 滑入 | `P.drift(sel, at, {dx, dur, stagger})`（dx 預設 16，左側元件寫 -16） |
| 彈出、錯拍彈出 | `P.pop(sel, at, {from, dy, to, dur, stagger})`（to 是落地亮度，預設 1） |
| 長出 | `P.grow(sel, at)`（卡片要固定寬高） |
| 抽屜 | `P.slide(sel, at, {from})`、`P.slideOut(sel, at, {to})`（外層 overflow:hidden） |
| 淡入、淡出、換內容 | `P.in(sel, at, {dur, stagger})`、`P.out(sel, at)`、`P.swap(舊, 新, at)` |
| 逐字 | `P.chars(sel, at, {mode, stagger})`（mode：rise、pop、drop） |
| 打字 | `P.type(sel, at, {cps})` |
| 數字滾動 | `P.count(sel, at, {from, to, dur, prefix, suffix, ease})`（一格一格跳寫 `ease: 'none'`） |
| 描線 | 整個插圖畫出來 `P.draw(sel, at, {dur})`；單一線條 `P.stroke(sel, at, {dur, stagger})` |
| 彗星描線 | `P.comet(線, at, {dur})`（描完是實線；沒有 stagger，錯拍就分開呼叫） |
| 圖示描線、描圈打勾 | `P.icon(圖示容器, at)`、`P.check(圖示容器, at)`（圖示用 circle-check；最短 0.55 秒） |
| 劃掉、量條 | `P.strike(sel, at, {wave})`、`P.bar(sel, at, {from, to})` |
| 光澤、螢光筆 | `P.sheen(sel, at)`（元素要 overflow:hidden）、`P.marker(sel, at)` |
| 重拍、漣漪 | `P.punch(sel, at)`、`P.ripple(sel, at, {to})`（to 是元素大小的倍數，預設 2.1） |
| 蓋章 | `P.stamp(sel, at, {on})`：印章 `class="sc-stamp"`，on 是被蓋的元素，兩者是兄弟 |
| 聚焦、回均衡、預覽態 | `P.spot(ALL, sel, at, {scale, lift, dim, done})`、`P.spot(ALL, null, at)`、`P.spot(ALL, 'none', at)`（ALL 是選擇器字串，只放已經進場的元素；新進場的元素 0.6 秒後才聚焦） |
| 退焦 | `P.dim(sel, at, {to})`（`{to: 1}` 回來） |
| 鏡頭 | 慢推 `P.cam('#xd<段 id>-group', T1 + 1.7, {scale: 1.04})`；跟焦點 `P.cam('#xd<段 id>-group', T3 - 0.2, {to: '#xd<段 id>-s3', k: 0.12})`（整個群組往 s3 那邊帶 12%，s3 要在群組裡面）；回正 `P.cam('#xd<段 id>-group', T5, {x: 0, y: 0, scale: 1})`。sel 只能是沒有底色、框線、陰影的群組，有底版的卡片寫了也不會動 |
| 游標移動 | `P.morph(sel, at, {left, top}, {from: {left, top}, dur})`（一定要帶 from，下一次的 from＝這次的終點）；沿線走 `P.along(sel, 線, at, {from, to, dur})` |

**audit 量的門檻**（寫的時候就照這些排，比較不用重來）：

- 兩拍之間畫面要靜止 ≥ 1.2 秒；任何 1 秒內新元素 ≤ 2 個；一起出現的間隔 0 或 ≥ 0.12 秒。
- 畫面連續不動 ≤ 6 秒；最後一幕停 ≥ 1.5 秒（kit 會把沒綁句的收尾往前挪，最後一拍離段尾還是要 ≥ 3 秒）。
- 完成態內容在 y 120–870 帶裡上下留白差 ≤ 40（全螢幕段看 y 112–900）；全螢幕段內容中心離畫面中線 ≤ 160、寬度 ≥ 1100；字 ≥ 30px（直式專案 ≥ 38px；audit 第一行會印版式）；自畫的膠囊標籤內距上下 ≥ 14、左右 ≥ 24，行高 ≥ 1.25。
- 飛行中的物件和標籤不要加 `data-slot`（會被算進同列對齊）；`.sc-pill` 會被當成標題，場景裡的小標籤用自己的 class。
- 連接線先用 `data-links`；多對一會穿過中間的元件，就手寫 svg 線（會有 ⚠，回報寫理由）。

**不能做**：GSAP 的 `onUpdate`／`onComplete`（跳時間截圖不會觸發）、補間顏色、旋轉、大位移飛入、拍與拍之間的微動（呼吸、漂浮、流動）、擠壓已經在畫面上的元素（最終版面先排好，預留位置）。

**驗收**（一條指令，內含這段的所有檢查）：

```
node shared/template/tools/audit.mjs --project projects/<專案> --only <段 id> --shots --sheet
```

- ✖ 全修：照 → 用 edit 改動畫檔，再跑同一條 audit。
- → 寫「重跑 build」「snapshot」時，你只要改好動畫檔，直接重跑上面那條 audit，不跑 build、snapshot。要改 plan.json 才修得掉的，把那行原文交回主代理。
- 同一個 ✖ 改兩次還在，或 → 要你改 plan.json、storyboard.md，就停手回報（格式見最後的「回報」）。工具呼叫到第 18 次也一樣停手回報。
- ⚠ 只修一輪：照 → 用 edit 改那幾行（不要整份重寫），再跑同一條 audit 一次就停，留下的 ⚠ 和理由寫進 `work/reports/<段 id>.md`。印「通過」或「可以交件」都算過關。追 ⚠ 常常越改越多。
- 0 個 ✖ 才會出拼圖；**交件前打開看一次**：動作真的看得到、字和插圖沒有擠在一角、構圖有主角、遮住字幕看得懂。不像鏡位腳本寫的就改。子母畫面的小視窗在這張圖是空框，正常。

**現成的線稿元件**（`data-illus`；可以放大，線不會變粗）：

| 元件 | 狀態、選項 | 建議大小（px） |
|---|---|---|
| `phone` | orient：portrait、landscape；screen：blank、video（人像）、play、rec、check、warn、shorts、qr | 直 120×250、橫 250×120 |
| `phoneTripod` | 同 phone（手機架在腳架上） | 直 140×360、橫 260×300 |
| `tripod` | — | 140×180 |
| `laptop` | screen：blank、video、play、rec、check、warn、app | 280×190 |
| `monitor` | 同 laptop | 360×300 |
| `cloud` | arrow：none、up、down | 220×150 |
| `personBust` | tone：a、b；`.il-talk` 說話的弧線 | 160×170 |
| `pgPerson` | pose：stand、walk、point；tone：a、b、accent | 120×284 |
| `personTop` | 俯視的人 | 110×72 |
| `desk` | 俯視的桌面＋筆電 | 320×150 |
| `stage` | 2.5D 地台，裝置站在頂面 | 960×180 |
| `cone` | angle、len、fill（視野、光錐） | 依 len |
| `waveform` | bars、seed、color：white、yellow、red | 360×90 |
| `progress` | `.il-fill` 橫向填滿 | 320×28 |
| `energy` | `.il-cell` 五格電量 | 220×90 |
| `fileVideo` | — | 100×120 |
| `window` | title | 480×300 |
| `searchBar` | text | 640×84 |
| `badge` | kind：check、cross、warn | 72×72 |
| `recPill` | `.il-time` 時間字（自帶紅點） | 200×60 |
| `stopwatch` | `.il-hand` 指針、`.il-sweep` 外圈 | 220×240 |
| `bookmark` | saved：false、true | 220×72 |

先看這張表選；不確定長相就打開一次 `shared/template/kit/illus-gallery.jpg`（一張圖，每格下面有寫法），不要跑程式。螢幕的每個狀態都預先畫好了（換狀態直接 `P.swap`）；`pgPerson` 是左右對稱的正面人形，不用翻轉。沒有的物件先找 lucide 圖示：`<span class="sc-icon" data-icon="名稱"></span>`，工具自動填。名稱用 `node shared/template/tools/build.mjs --project projects/<專案> --icons 手機,雲端,footprints` 查（只查名稱，不算跑 build；中文查不到就換英文關鍵字）。不要打開 `shared/template/kit/icons.json`，它是一行 586 KB。圖示也不合才新畫（下一節）。

**新畫線稿元件**（畫廊和圖示都不合才畫；一段最多新畫一個，算在 18 次裡）：

1. 鏡位腳本的表下面要有 `#### 插圖清單 <段 id>`，新建 SVG 那一列寫 `規格：<名稱>，建議尺寸 <寬>×<高>，狀態 <a>／<b>；描述：…`（格式照 design-script.md）。腳本沒寫就用 edit 補進 `work/designs/<段 id>.md`，尺寸抄上面元件表大小相近的。
2. 照 `shared/template/kit/illus-style.md` 畫，存成 `work/hyperframes/illus-local/<名稱>.svg`。
3. 跑 `node shared/template/tools/media.mjs illus-lint --project projects/<專案> --only <名稱>`（只查你這個檔）：0 個 ✖ 才掛上去，⚠ 照 → 改一輪。打開它印的 `work/插圖清單-<名稱>.jpg`，和旁邊三個畫廊元件比線粗、圓角、用色，不像同一套就改一次。
4. 掛法：`<div data-illus-src="illus-local/<名稱>.svg" style="width:<寬>px;height:<高>px"></div>`（路徑從 `work/hyperframes/` 算），狀態用 `P.in('#… .il-<狀態>', T2)` 打開、`P.out` 關掉。

## 回報

只回一行：

- 做完：`<段> ✖0 ⚠<N>｜<做了什麼，一句話>`；有新畫元件加 `｜新畫：<名稱>`。
- 停手：`<段> ✖<N>｜卡在：<那行 ✖ 原文>`；沒有 brief 就回 `<段> 沒有 brief`。

改了鏡位腳本、留著的 ⚠ 和理由寫到 `work/reports/<段 id>.md`，不要寫在回報裡。

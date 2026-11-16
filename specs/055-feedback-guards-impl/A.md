# 055 包 A：版面量測（audit）

做了：Q3、k1 的 audit 那一半（C01）、k2（N1）、k3（C03）、k4（C04）、k5（C05）、k6（C06）、k7 的設計段那一半（C07 `dup-word`）、k8（C08）、k9（N2）、k14（N7）。全部是 `audit.mjs` 的規則，`--help` 有寫（`specs/contracts/cli-003.md` §1 同步）。除了字太小（Q3）和 bind-late，**都只量內容設計段（`design: true`）和手改過的模板動畫檔**，工具產生的 x-* 範本不量（見最後一節「範本整合測試的回歸」）。

## 改了哪些檔

| 檔 | 改了什麼 |
|---|---|
| `lib/canvas.mjs` | Q3：`CANVAS.portrait.minTextPx` 32 → **48** |
| `lib/audit-page.mjs` | 每個元素多 `disp`、`allowUneven`、`allowRepeat`、`justify`；新量 `bigText`（字級 ≥ 120 的區塊：行數、`<br>` 數、white-space）、`glyphs`（字級 ≥ 120 逐字墨跡框）、`lines`（svg 線稿每 8px 取樣成畫面座標）；動畫目標多 `all`（整塊的字，N7 用） |
| `lib/audit-rules.mjs` | 新門檻常數在「055」那一節開頭（`CARD_SPACE`、`SIBLING`、`LINE_CROSS`、`BIG_TEXT`、`HCENTER`、`DUP_STOP`、`TEXT_HEAVY`、`MATTE_GLYPH`、`BIND_LATE`）；新函式 `judgeFeedback`、`matteGlyphFindings`、`bindLateFindings`；`stageKindOf` 認全幕版（`full`，s 0.5952）；字太小的修法分縮放／不縮放、模板多一句；逐字拆開的 span 字太小併成一則 |
| `lib/audit-browser.mjs` | `matteAlphaAt(file, t)`：ffmpeg 從去背 webm 抽一格 alpha（270×480 灰階） |
| `audit.mjs` | 接上三個新函式；去背段找 `mattev-<id>` 的 webm；沒有去背檔印一行「還沒有去背檔（先 build），大字被講者擋多少沒量」；`--help` |
| `lib/flow.mjs`（最小） | C01：`reviewNow` 的 `customs` 直式連 `scene` 段；`--review` 的 audit 直式加 `--all`（2 行＋1 行註解） |
| `specs/contracts/cli-003.md` | §1 照 `--help`；§2 字太小的門檻 |
| 測試 | `audit.test.mjs`（直式 48、模板那句、逐字併一則）、新 `audit-055.test.mjs`（13 項，含一個真瀏覽器量 bigText／glyphs／lines）、`fixtures/032-p3e/kitchen-portrait.json`（minTextPx 48） |

## 每一條：門檻、訊息原文

訊息都是「<段> <事實> → <怎麼改>」，`<…>` 是量到的值。直式縮放段的座標是縮放前的，門檻先除以縮放倍率 s。

### Q3／C01 直式字太小（`font`）
- 畫面上 < 48px。縮放段寫字下限：全畫面家族與設計段 57、章節 77、全幕版 81、字卡動態 86。
- 縮放段：`字太小：#xp-s 直式縮 0.8475 倍後 47.5px（< 48px）` → `直式要寫 ≥ 57px（縮放前；畫面上至少 48px）；放不下就縮文案，不縮字`；不縮放的段：`直式畫面上至少 48px；放不下就縮文案，不縮字`。模板段多一句 `；模板字級是固定的：換內容設計動畫，或換成不縮放的版面`。
- 逐字拆開的 span（沒 id、同父層、同字級）併成一則：`#xstpx0108-n2 <元素>「接上工具」`。
- C01：`build --review` 直式時 audit 加 `--all`（模板段一起量）；字卡動態仍由 `--check` 的 `portraitMinPx`（包 C）管。

### C04 大字被切掉 ✖（`text-cut`）、大字自動換行 ⚠（`text-wrap`）
- text-cut：寫了 `data-layout-allow-overflow` 的字，墨跡一部分超出畫面左右下緣（縮放段：看得到的範圍）或被會裁切的祖先切掉。整列在框外（捲動清單捲走的列）、比畫面或裁切框寬 1.5 倍以上（跑馬燈、字牆，`TEXT_CUT.marquee`）不算。`大字被切掉：#xds0101-w2a「每個都要學？」超出畫面左邊 72.5px、右邊 72.5px（data-layout-allow-overflow 只放行字頂到上緣，不放行字被切）` → `縮小字級或拆成兩行（<br> 斷在語意處），整句留在 x 0–1080 以內`。
- text-wrap（custom）：字級 ≥ 120、不是 nowrap/pre、行數 > `<br>`＋1。`大字自動換行：#id「…」排成 2 行（只寫了 0 個 <br>）` → `用 <br> 斷在語意處，或縮短、縮小一級`。模板不量（欄位有每行字數上限，`--check` 管；短影片5 s0101 問答卡斷得對）。

### C03 線穿過字／卡片 ⚠（`line-cross`）
- 靜止的 svg path／circle／ellipse／line／polyline／polygon／rect（只描邊、長 ≥ 40），每 8px 一點；落在字（外擴 4px）或有底卡片（外擴 **12px**：卡片有陰影，擦過卡角看起來就是壓到）裡、連續 ≥ 2 點算一處。線頭、線尾在卡片裡（連接線）、只碰外擴那圈而且沿著卡片一邊走超過半邊（地平線、底線）、總長 < 80px（箭頭頭、勾勾，`LINE_CROSS.minLen`）不算；卡片和卡片裡的字都被穿過只寫卡片。
- `線穿過字／卡片：#xdx0101-ring 的 <circle id="xdx0101-track"> 穿過 #xdx0101-chat 4 處` → `把卡片移出線的範圍（至少隔 24px），或把線縮短；刻意疊的加 data-layout-allow-overlap`。

### C05 大字被講者擋太多 ⚠（`matte-glyph`）
- 去背的疊加內容設計段（`layout: "overlay"`、`design: true`、`matteKindOf` = full）中點、完成態；字級 ≥ 120 逐字和遮罩（alpha ≥ 128）比，`data-matte-front` 的洞扣掉。一個字被擋 > 10% 算擋到；擋到 > 1 個字、或任何一個 > 50% 報。
- `大字被講者擋太多：「每」「個」2 個字被擋，「個」擋 33%（講者頭頂在 y 400）` → `字往上移到頭頂上方（被擋的字現在從 y N 開始，下緣要在 y H 以上），或左右移開；最多擋一個字、那個字最多擋一半`。

### C06 內容沒置中 ⚠（`hcenter`，完成態）
- 只看「東西」：有底色的卡、圖片、圖示（長寬 ≥ 40px；底線、項目符號不算）。字靠左是排版，不管。
- (1) 色塊（寬 ≥ 240、寬 < 畫面 95%，含當成背景的側欄）裡每一列左右留白差 > max(24, 寬 4%)：`內容沒置中：#xds0101-basel 裡左 153、右 34px` → `整組往左移 60px（每個元素的 left −60）；刻意靠一邊加 data-justify="start"／"end"`。兩層疊在一起的底裝同一組東西只報一次。
- (2) 直式（縮放段看舞台窗、疊加段看安全區）：東西整組的聯集，加上排在整組旁邊的字（上下重疊、≥ 80% 在整組左右外面：圖左字右是一組），中心偏 > 48：`內容沒置中：#xds0101-wall .xds0101-tile.xds0101-r0 等 24 個 x 70–870，中心 470；安全區 x 60–1020 的中心是 540（差 70px）` → `整組往右移 70px → 移完在 x 140–940；刻意靠一邊加 data-justify="start"／"end"`。疊在東西上面的大字不算進聯集。

### C07 同一個詞出現兩次 ⚠（`dup-word`，custom 完成態）
- 同一張卡裡上下相鄰的兩行字（不透明度 ≥ 0.5、水平重疊、間距 ≤ 1.5 倍字級；同一組並排的兄弟不算）有同一個詞（2 字中文不含 `DUP_STOP` 的字、3 字母以上英文）。`同一個詞出現兩次：A 和 B 都有「課程」` → `標籤換成別的詞（例：行動、重點），或大字拿掉這個詞，上下兩行要搭得起來；刻意重複（口號）加 data-allow-repeat`。

### C08 疊在講者身上的字太多 ⚠（`text-heavy`，custom 疊加段完成態）
- 可見的字（不算數字）> 24。`疊在講者身上的字太多：完成態 28 字（上限 24，不算數字）` → `留一個大字或左右兩個對比，配圖示；其他交給字幕（shared/style.md「疊加段」）`。

### N1 卡片空太多 ⚠（`card-space`，完成態）
- 卡 ≥ 300×200；內容（字、圖示）占卡片 < **30%**（brief 初值 15%：主宣傳片 x0107 v2 量到 19–24%，15% 抓不到），而且內容還能整組放大 ≥ 1.4 倍（內距 24）。`卡片空太多：#xptx0107-card（1180×516）裡的字只占 19%，旁邊大片空白` → `字可以放大到約 Mpx（最大的字現在 Fpx），或卡片縮小到貼著內容（內距 ≥ 24px）`。

### N2 同一組卡片寬度不一致 ⚠（`sibling-width`，custom 完成態）
- 同一個父層 ≥ 3 張同 class、有底色、裝字的卡（高 ≥ 100），寬最大／最小 > 1.1。卡裡有圖片的（照片牆）、寬度一路遞增／遞減 > 2% 的（金字塔、漏斗）、模板（寬度照字數排）不算。`同一組卡片寬度不一致：#xd-list 底下 3 張 .xd-item 寬 600–700px` → `同寬（都改成 700px，取最寬的）；刻意不同寬加 data-allow-uneven`。

### N7 卡上的字比講的晚 ⚠（`bind-late`，和「綁句對不上」同一處）
- `P.at('#N@詞')` 綁的那一拍：目標整塊的字（`all`）含這個詞，而且這句在這個詞之前的一段（4→2 字）也在卡上 → 卡上的字從更早的地方就開始講；差 > 0.5 秒報。`卡上的字比講的晚：「用對的人很少」在 #46 講到「用對的人」（0:58.38）就開始了，T1 = P.at('#46@少') 晚 0.91s` → `綁 #46@用對的人：T1 改 P.at('#46@用對的人')（字一講到就出現；分鏡表那一拍一起改），改完重跑這條 audit`。

## 驗證（複本 `versions.mjs use` → build → `audit --only`）

| 規則 | 該報 | 結果 | 下一版 | 結果 |
|---|---|---|---|---|
| font 48 | 短影片2 s0106 v1、s0108 v2、x0101 v1、x0107 v1 | ⚠ 4、8、5、3 則 | v2、v3、v2/v3、v2 | 不報 ✓ |
| line-cross | 短影片2 x0101 v2（v1 也報） | ⚠ 4 處 | v3 | 不報 ✓ |
| text-cut／text-wrap | 短影片4 r6 的破版（存檔的 v4 沒有這個狀態，照 r6.md 在複本重做：250px、`white-space: normal`） | ✖「超出畫面左邊 72.5px、右邊 72.5px」＋⚠ 2 行 | v5 | 不報 ✓ |
| matte-glyph | 短影片4 s0101 v2 | ⚠「工」66%；完成態 5 個字 | v3、v4 不報 ✓；**v5 報 4 個字** | 見下 |
| hcenter | 主宣傳片 s0101 v4、短影片4 s0101 v3 | ⚠ 左右兩塊側欄、標誌牆差 70 | v5、v4 | 不報 ✓ |
| hcenter | 短影片1 s0103 v3 | ⚠ 關鍵詞差 210（收窄前）；那一版是關鍵詞模板（scene），audit 不量；**改了模板，直式關鍵詞不再靠左**（見最後一節） | v4 | 不報 |
| hcenter | 短影片5 s0104 v1 | **不報** | v2 | **報差 68** |
| card-space | 主宣傳片 x0107 v2 | ⚠ 19%（收窄前）；**v2 是工具產生的 x-point 範本（build 沒印手改過），收窄後不報** | v3（手改過，照量） | 不報 ✓ |
| bind-late | 短影片1 s0110 v5 | ⚠ 晚 0.91s | v6 | 不報 ✓ |
| dup-word | 短影片5 s0106 v2 是模板段 → 包 C 的 slots 檢查；設計段只有假頁面測試 | — | — | — |
| sibling-width、text-heavy | 沒有對應的真版本，只有假頁面測試 | — | — | — |

和 brief 不一樣的兩個：
- 短影片4 s0101 **v5 確實擋到**：hyperframes snapshot 8.75 秒看得到「每個」大半在頭後面（r9 把 v5 換成 v7，現行 v9 不報）。不是誤報。
- 短影片5 s0104 v1 的偏左發生在完成態之前（「大幅減少」出現前 Token 列整列靠左），完成態整列是置中的；只量完成態抓不到。v2 完成態「Token＋電池＋大幅減少」整列偏右 58px（畫面），看圖確實偏右。要抓 v1 得量靜止態，但逐一出現的流程圖中途本來就偏一邊，會很吵，沒做。

## 現行六支多出來的（`audit --all`，和改之前比）

收窄前多 45 則，收窄後 44 則（短影片4 s0104 關鍵詞模板的 hcenter 拿掉），全是 ⚠，沒有 ✖：
- **40 則字太小**，全部是 48px（Q3 作者選的）造成的：短影片1 s0102（模板 40px）、x0106、x0108（逐字已併）；短影片3 s0112；短影片4 s0106；短影片5 s0101、s0102、s0104。都是畫面上真的 < 48。
- **4 則其他**，看過截圖都是真的：bind-late 短影片1 s0103（晚 0.68s）、x0108（「教會 SOP」晚 0.88s）；hcenter 短影片5 s0104（偏右 68，同上）、短影片2 x0101 對話框裡「背景」「格式」偏右（左 98、右 28）。
- 調掉的誤報：模板段的 sibling-width（關鍵詞板照字數排）、照片牆、金字塔；模板段的 text-wrap；圖左字右的版面、散在講者四周的照片被當成沒置中；地平線被當成穿過卡片。

## 留下的問題

- `docs.test.mjs` 會失敗，直到包 G 把 `shared/style.md` 直式字級下限改成 48（縮放段 57／77／81／86）。
- C01 的 `--review` 只改了參數，沒有整條 `build --review` 跑過（複本上 audit 直接跑過）。
- 已發出去的直式專案 `--review` 會多出模板段的字太小 ⚠（上面 40 則那種），修法寫的是「換內容設計動畫，或換成不縮放的版面」。
- 複本 `/Volumes/auto-edit-projects/.tmp-055/A/`（約 18 GB，APFS 複本）沒刪：遞迴刪除被本機規則擋，請手動 `! rm -rf /Volumes/auto-edit-projects/.tmp-055/A`；`projects/tmp055-A-*` 連結已刪。

## 範本整合測試的回歸（2026-11-16 修）

`examples.test.mjs`「整合：54 支 → audit 0 ✖、0 ⚠」沒過：x42（字牆跑馬燈）、x50（捲動清單）報 ✖ text-cut；箭頭頭碰目標框、打勾框和同一列的字、折線圖穿過資料點報 line-cross；x42、x43（講者站在字牆、雜誌封面前）報 matte-glyph、text-heavy；還有 hcenter、card-space。範本作者看過，所以是回歸。改法：

- `judgeFeedback` 開頭：不是內容設計段（`custom` 且 `seg.design`）、也不是手改過的模板動畫檔（`ctx.hand`）就不量。`audit.mjs` 用 `fillStateOf`（`lib/custom-fill.mjs`，build 判斷「手改過，沒有覆寫」用的同一個）算 `hand`，每段算一次。text-cut、text-wrap、line-cross、card-space、sibling-width、hcenter、dup-word、text-heavy 都只量內容設計段。
- matte-glyph 只量 `layout: "overlay"` 的內容設計段、手改過的模板檔（`audit.mjs` 呼叫的地方）。
- text-cut 另外收窄（內容設計段也可能做捲動清單、跑馬燈）：整列在框外不算、比框寬 1.5 倍不算。
- line-cross 另外收窄：總長 < 80px 的線（箭頭頭、勾勾）不量。
- 字太小（Q3 48px）和 bind-late 沒收窄。
- 測試：`audit-055.test.mjs` 加「模板不量」「手改過的模板檔照量」「捲走了」「跑馬燈」「箭頭頭」。`examples.test.mjs` 0 fail（整合 54 支 audit 0 ✖、0 ⚠）；`audit-055`、`audit`、`canvas`、`audit-parallel`、`scenes` 125 pass；`build`、`hand-shift` 35 pass。

代價：抱怨過的兩個模板版本：
- 主宣傳片 x0107 v2 **抓不到**：複本 `versions.mjs use v2` 後 build 沒印「手改過」，v2 就是工具照 slots 產生的 x-point；v3 才是手改（build 印 `compositions/x-point-x0107.html 手改過`），v3 照量、不報。v2 的空是 x-point 範本本身的版面（範本 x45 預設資料量到 18%，和 v2 的 19% 同一個卡）。要抓到 v2 只能改 x-point 範本（字放大或卡片縮小），會動到橫式所有用 x-point 的片，沒改，請作者決定。
- 短影片1 s0103 v3：直接修了關鍵詞範本的直式排法（下一節）。
內容設計段的驗證都照樣成立（上表）。

### 模板量到的 hcenter、card-space（沒改模板，給作者看）

範本預設資料量到的數字，**沒有逐張看圖確認**是不是真的不置中或空太多：

| 範本 | 規則 | 量到 |
|---|---|---|
| x04 | hcenter | `#xn-trackB` 裡左 0、右 119px |
| x07 | hcenter | `#xui-view` 裡左 0、右 72px |
| x14 | hcenter | `#xvs-card` 裡左 200、右 452px |
| x15 | hcenter | `#xtr-card` 裡左 152、右 56px |
| x19 | hcenter | `#xscr-card` 裡左 214、右 70px |
| x28 | hcenter | `#xtrb-card` 裡左 96、右 667px |
| x34 | hcenter | `#xcrd-card` 裡左 77、右 437px |
| x35 | hcenter | `#xcq-la` 裡左 197、右 97px；`#xcq-lb` 裡左 434、右 102px |
| x05 | card-space | `#xwarn-panel`（456×500）字只占 17% |
| x44 | card-space | `#xbk-lid`（560×266）字只占 17% |
| x45 | card-space | `#xpt-card`（1180×516）字只占 18%（主宣傳片 x0107 v2 被抱怨的就是這個模板） |

### 關鍵詞範本直式靠左（修了）

- 原因：`shared/template/scenes/12-keywords/template.html` 的 `@style-portrait` 把 `#kwList` 改成卡片帶（x 60–940）裡的 flex 橫排換行，但沒寫 `justify-content`，預設靠左；三塊 460 寬的板放不下一列，就一塊一列疊在左邊（x 60–520）。橫式的 `data-justify="start"` 在直式的 free 排法不作用。
- 改法：直式那一行加 `justify-content: center;`（每一列在帶內置中，中心 x 500＝安全區中心；右邊 x 940–1080 是平台按鈕區），註解寫原因。只動 `@style-portrait`，`lib/assemble.mjs` 只在直式套它。
- 前後對照（短影片1 複本換回 s0103 v3、build、snapshot 20.17 秒）：改前 `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/815f192b-d692-4a86-902c-6e9ff375331a/scratchpad/kw/before/frame-00-at-20.17s.png`（三塊板疊在 x 60–520），改後 `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/815f192b-d692-4a86-902c-6e9ff375331a/scratchpad/kw/after/frame-00-at-20.17s.png`（疊在 x 270–730）。
- 橫式不變：主宣傳片複本（橫式，s0104 是工具產生的關鍵詞段）改前改後各 build 一次，`compositions/s0104-keywords.html` 逐位元組相同（`cmp` 沒差）。
- 沒碰到的：短影片4 現行的 s0104 是手改過的關鍵詞檔（build 印「手改過，沒有覆寫」），範本修了也不會套用；要套用得把改動搬回 plan.json 再 `--force`。
- 測試：`scenes.test.mjs`、`build.test.mjs`、`hand-shift.test.mjs` 都過。

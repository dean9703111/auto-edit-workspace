# 056 盤點：每支模板的橫式／直式（第 1 步，2026-11-16）

只盤點，沒改模板、工具、文件。brief 見 `brief.md`。

## 結論數字

| 範圍 | 支數 | 可以 | 直式要自己的參數 | 直式不適合 | 橫式也要修 |
|---|---|---|---|---|---|
| 情境（scenes/） | 18 | 1（13） | 15（含 06、11 只有全幕版要改） | 2（03、05，已標不提供） | 0 |
| 情境動畫模板（custom/x-*.html） | 54 | 1（x-numbers） | 49 | 4（x-breakout、x-magazine、x-tags、x-wall，已標 portrait: none） | 0 |
| 字卡動態（fx/） | 40 | 24 | 2（20、22） | 14（catalog 已標 band） | 13（band 類，和「直式不適合」重疊） |
| 合計 | 112 | 26 | 66 | 20 | 13 |

- `custom/` 實際是 54 支 `x-*.html`（brief 寫 55，多算的是 `_blank.html`＝內容設計動畫的空白畫布，不是模板）。
- 橫式沒有一支模板版面壞掉：橫式 audit 只報 fx 的字太小／完成態全在動，和 07 一條半像素邊。「橫式也要修」只有 band 類字卡動態透明時的裁切（見下方共通發現 5）。
- 直式最大的問題是字級：縮 0.8475 進上半面板後，54 支情境動畫有 52 支最小字 < 48 px（扣掉 3 支已標直式不提供的疊加模板是 49 支）（多數是 `.sc-t40`／`.sc-t44`／`.sc-t52` → 畫面 34／37／44 px）。版面本身大多放得下：估計約 27 支只換字級就放得下（照字數與欄寬估的，沒有實際改字驗證），其餘要改排法（見總表「要改什麼」）。

## 怎麼量的

- 暫存專案（照 `dev/tests/examples.test.mjs` 的 makeProject，範例原文＋sample 句號；情境用 scene.json 的 sample＋4 張全幕版；字卡動態用預設文字，`bg` 不寫＝透明）：
  - 橫式 `/Volumes/auto-edit-projects/.tmp-056/L`（116 段）、直式 `/Volumes/auto-edit-projects/.tmp-056/P`（114 段，03、05 直式不放）
  - 沒有建軟連結；資料夾留著（本機規則擋刪除）。裡面有 `measure-L.json`／`measure-P.json`（我的量測）、`audit-L.json`／`audit-P.json`（`audit.mjs --json --only 全部`）、`audit-P-fx.json`（直式 fx 明寫 `bg: none` 後重量）、`check.json`
- 截圖與量測：`audit-browser.mjs` 開 HyperFrames 的 Chrome、`renderSeek` 跳時間（和 audit、snapshot 同一個 runtime）。
  - 情境動畫：完成態（段尾前 0.6 秒）＋關鍵拍：P.at 標記 ≥ 3 個加中間拍＋1 秒，≥ 5 個再加第一拍＋1 秒
  - 字卡動態：catalog 的 done（label 'done' 或最後一塊動畫停住、收尾前 0.1 秒）＋段中間
  - 量的東西：畫面上最小字（字級 × 實際縮放）、內容外框占可用區（直式舞台窗 x 40–1040、y 240–876；疊加段 x 60–1020、y 240–1440）、左右偏移、超出窗的字
- 截圖資料夾：`/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/815f192b-d692-4a86-902c-6e9ff375331a/scratchpad/056-survey/`
  - 每支一張 `<模板>.jpg`：上列左＝橫式完成態 1920×1080、右＝直式完成態（縮成 608×1080）；有關鍵拍時第二列是「橫｜直」各一到兩組
  - 總覽 `overview-01.jpg` … `overview-10.jpg`（每張 12 支，順序＝下面總表的 #）
  - 原始截圖在 `shots/`（`<模板>.<L|P>.<end|b0|b1>.jpg`）
- 量測的限制：
  - HyperFrames 的 chrome-headless-shell 解不了 H.264（`<video>` error 4），講者畫面是用 `preview/speaker.jpg`／`speaker-v.jpg` 當 poster 補的；子母畫面的裁切因此和實片不同，只看版面
  - 字幕是假字幕（長句），直式會超出 10 字，和模板無關
  - x-recap、x-relay、x-slider 的截圖檔路徑是 `../preview/shots/`，audit 的伺服器根目錄是 `work/hyperframes/`，看不到 → 我在暫存專案多放一份 `work/hyperframes/preview/shots/` 才截到圖（真專案 build 有沒有同樣問題要另外查）

## 共通發現（不只一支模板）

1. **字級**：直式全畫面 custom 縮 0.8475。模板的字大多用 `kit/scene.css` 的字級 class：`.sc-t40` 100 處、`.sc-t52` 134 處、`.sc-t44` 40 處（54 支合計），這三級在直式都 < 48 px。一張「直式字級表」（40／44／48／52 → 57）能一次解掉大部分，只剩放不下的要各自重排。
2. **P.cam 在直式不推**（scene-motion.js `STAGED` 時 `{to}` 不帶、原點改上緣）：橫式完成態靠推近放大的模板（x-prompt-tree 最明顯）在直式停在小的全景。
3. **全幕版沒有直式樣式的位置**：`lib/scenes.mjs` 的 `fullScene()` 把 `stylePortrait` 設成空字串，06／09／11／15 的全幕版縮 0.5952 後標籤只有 26 px。
4. **01 章節直式是 16:9 一條**：ch 舞台縮 0.625 放中間，上下 1/3 是深色底。直式要排滿 1080×1920 得讓 01 直式改成 1080×1920 子合成（像疊加情境的 `portrait: "move"`）。
5. **band 類字卡動態在橫式透明時被裁成方框**：027 的 fxStage 把透明字卡縮到講者旁邊，滿版流動字（09–18、21、31、33）的邊被子合成框硬切（例：`fx-12-diagonal-text-bands.jpg`）。改 build（band 類透明時不縮、或預設不透明），不用改 13 個特效檔。
6. **工具面的小問題**（直式要「過 audit」前得先處理，不然模板改好也還是 ✖）：
   - `lib/audit-rules.mjs:129` 只在 plan 明寫 `bg: "none"` 時用透明 fx 的舞台換算；build 是 `bg` 不寫就當透明（main.mjs `!it.opaque`）。結果直式 40 支 fx 全報 ✖ 壓到講者；明寫 `bg: none` 後剩 5 個 ✖、4 個 ⚠（`audit-P-fx.json`）
   - 直式 audit 對捲軸型 fx（25 翻牌、28 拉霸、29 里程表、30 標題切換）報 ✖ clipped（框外的字本來就是藏起來的），橫式不報
   - fx-19 圓柱背面的字 21 px 被算進字太小
   - 直式 audit 的 ✖ canvas（fx 02、05 等）是在段尾前 0.6 秒量到退場時飛出畫面的字；fx 應該照 catalog 的 done 量


## 機制建議：情境動畫模板在同一個檔裡寫直式參數

### 現在怎麼運作（查過的）

- 情境：`lib/scenes.mjs` 的 `splitTemplate` 讀 `@style-portrait`，`lib/assemble.mjs` 的 `sceneParts` 在直式把它接在 `@style` 後面，並把 body 的 `data-layout-portrait="X"` 換成 `data-layout`。這是 build 時做的。
- 情境動畫模板：檔案原樣（或 `custom-fill.mjs` 填資料後）放進 `compositions/`，由 runtime 載入。直式只多兩件事：
  - `main.mjs` 的 host 帶 `stageTransform('fs')`（translate＋scale 0.8475），子合成仍是 1920×1080
  - `index.html` 注入 `window.__regions`（`regionsScript`）
- kit 已經認得「直式裡的橫式子合成」：`kit/scene-motion.js` 的 `STAGED = !!window.__regions && root 寬 > 高`，用在 `P.region()` 和 `P.cam`。直式預覽頁 `x-<名稱>-v.html`（`custom-preview.mjs`）也注入 `__regions`，所以預覽一樣成立。
- runtime 會把模板 CSS 的 `#x-ring …` 改寫成 `[data-composition-id="x-ring"] [data-hf-authored-id="x-ring"] …`（實測），root 的 id 換成 `data-hf-authored-id`，其他屬性留著。所以寫在 root 上的屬性，模板 CSS 用 `#x-ring[data-format="portrait"] …` 對得到，預覽頁（沒有改寫、root 還是 id）也對得到。
- 全寬版型（`data-wide`）就是同一種做法的前例：build 在 host 寫屬性 → `kit/scene-layout.js` 的 `widen()` 在排版前調整 → 模板用 `data-wide-keep`、`data-wide-justify`、`data-wide-zoom`、`[data-wide] #x` 選擇器寫自己的全寬參數。

### 建議（A）：kit 在直式替 root 打一個標記，模板用屬性選擇器、`-portrait` 屬性、`P.portrait` 寫直式參數

要改的檔：

| 檔 | 改什麼 |
|---|---|
| `kit/scene-motion.js` | `STAGED` 移到 SceneMotion 一開始算（在 `snapWidths`、`SceneLayout.apply` 之前），成立時 `root.setAttribute('data-format', 'portrait')`（字幕子合成已經用同一個屬性名，`kit/captions.css` 的 `[data-format="portrait"]`）；多一個 `P.portrait`（布林）給 script 用 |
| `kit/scene-layout.js` | `apply()` 開頭（`widen` 旁邊）加 `portraitize(root)`：root 有 `data-format="portrait"` 時，把裡面所有 `data-<名>-portrait` 的值搬到 `data-<名>`（`data-layout`、`data-gap`、`data-justify`、`data-align`…，和情境的 `data-layout-portrait` 同一個命名），再照常排版、畫連接線 |
| `kit/scene.css` | 直式字級表，模板自己選用：`[data-format="portrait"][data-portrait-type] .sc-t40, … .sc-t52 { font-size: 57px; line-height: 76px }`、`.sc-t56 → 60/84`；64 以上不動 |
| `kit/illus.js` | 插圖元件的 SVG 標籤字級在 root 是直式時放大到 57（x-scene 三支共用） |
| `lib/scenes.mjs` | `splitTemplate` 多收 `@style-full-portrait`，`fullScene()` 用它（全幕版直式樣式） |
| `lib/custom-fill.mjs`（選用） | fill.json 收 `"portraitMax": { "items": 3, "text": 8 }` 這類直式上限，`validateSlots` 在直式專案照它 ⚠／✖（04d、x-folder、x-code-diff 要） |
| `dev/tests/examples.test.mjs` | 「全部排進同一個專案」多跑一份直式（`format: portrait`），audit 0 ✖；橫式那份照舊逐像素比 |
| `shared/style.md`「直式」、`USAGE-reference.md` R7 | 寫法說明（一段） |

模板裡怎麼寫（同一個檔、同一個 `<style>`、同一段 script）：

```html
<div id="x-ring" data-composition-id="x-ring" data-width="1920" data-height="1080" data-portrait-type …>
  …
  <div id="xring-rows" data-layout="row" data-layout-portrait="col" data-gap="xl" data-gap-portrait="m">…</div>
```
```css
/* ── 直式（kit 在直式替 root 加 data-format="portrait"；橫式不會對到）── */
#x-ring[data-format="portrait"] #xring-card { top: 160px; }
#x-ring[data-format="portrait"] .xring-note { display: none; }
```
```js
const COLS = P.portrait ? 2 : 4;          // 只有排法、數量這種 CSS 做不到的才寫在 script
```

檔頭【版面】多一行「直式：…」寫這支在直式改了什麼（給設計師和子代理看）。

影響：

- **橫式輸出不變**：橫式沒有 `__regions` → root 不會有 `data-format`，直式 CSS、`-portrait` 屬性、`P.portrait` 分支都不生效；`index.html` 一個字都不變。模板檔的文字變了，增量 build 會把這些段當成有改、重新輸出，但畫面逐像素相同（照 `examples.test.mjs` 的逐像素比驗）。
- **現有 54 支**：沒寫直式參數的檔完全不受影響（kit 只多一個屬性；字級表要 root 寫 `data-portrait-type` 才生效，是「選用」）。現有的 `data-format` 只有字幕子合成（`lib/captions.mjs` 的 root、`kit/captions.css` 的 `.cg`）、封面（`lib/cover.mjs`）和 `fx/index.html` 畫廊頁；字幕 root 沒有 `data-portrait-type`、也不用 `.sc-t*`，字級表不會誤觸。
- **專案裡的檔**：
  - 模板段（`template` ＋ `slots`）的檔是工具產生的（`.cache/custom-fill.json` 的雜湊對得上）→ 下次 build 會換成新模板 → **直式專案（PPA 短影片 1–5）下次 build 畫面會變**，橫式專案畫面不變。要在回報裡先講。
  - 手改過的模板檔（`fillStateOf` = hand）、內容設計動畫（`x-design-*`）不會被覆寫，維持舊樣子；kit 更新後只多一個 root 屬性，畫面不變。要直式參數就照新寫法自己加。
  - 每次 build 都會更新專案的 `kit/`，所以 kit 的改動會到所有專案；上面已確認 kit 改動對沒寫參數的檔是無效果的。

### 替代方案與代價

| 方案 | 做法 | 好處 | 代價 |
|---|---|---|---|
| B. build 時展開（和情境 `@style-portrait` 完全同一套） | 模板裡寫 `<style data-format="portrait">` 一段和 `data-*-portrait`，`custom-fill.mjs` 產生 `compositions/x-…-<段>.html` 時照版式留／刪、換屬性；`custom-preview.mjs` 也做一次 | 產生的檔就是畫面；沒有 runtime 邏輯 | 只對模板段有效：`src` 指的原文複本、手改檔、內容設計動畫都吃不到；換版式要重產檔，`fillStateOf` 的 tool／hand 雜湊要把版式算進去；`P.portrait` 這種 script 參數還是要另外做 |
| C. CSS `@media (orientation: portrait)` | 模板 CSS 直接寫 media query（runtime 只跳過 keyframes／font-face，media 裡的規則照樣加前綴） | 不改任何工具 | 靠的是瀏覽器視窗方向：render、audit（1080×1920 視窗）對，但直式預覽頁、剪輯台、縮圖若用橫的 iframe 就不會套用；script 參數要另寫 `matchMedia`；`data-layout` 換排法做不到 |
| D. 模板宣告自己的直式取景框 | 模板寫 `data-portrait-window="x0 y0 x1 y1"`，build 照它算 host 的縮放（例：x-point、x-receipt 內容只占窗的一半，縮放可以從 0.8475 拉到 1.2） | 「內容太空」的模板不用改版面就變大；和 A 可以並存 | 只解決太空，不解決字小＋擠；build 要讀模板屬性（`readCustom` 已經在讀檔，可行）；audit 的舞台窗換算要跟著改 |
| E. 另做 `x-<名稱>-v.html` | 每支複製一份直式檔 | 最自由 | brief 明說不要；兩份會分岔，55 支變 110 支 |

**建議 A**，D 留作第二步（等 A 做完，再看還有幾支是「太空」）。

情境（scenes）這邊不用新機制，補三個洞：全幕版的 `@style-full-portrait`（`lib/scenes.mjs`）、01 章節直式改成 1080×1920 子合成（scene.json `portrait` ＋ `main.mjs` 的 `stageOf`）、04 家族直接用現有的 `@style-portrait` 寫字級。

## 建議的分包

包 0 先做、單獨一包（其他包都依賴它）；A–G 檔案互不重疊，可以平行。標「—」的不用改（可以、或已標直式不提供）。

| 包 | 內容 | 支數 | 只會改的檔 |
|---|---|---|---|
| 0 機制 | 上面建議 A 的 kit／lib 改動、audit 三個小問題（fx `bg` 預設、捲軸 clipped、fx 照 done 量）、直式整合測試、文件 | 機制 | `kit/scene-motion.js`、`kit/scene-layout.js`、`kit/scene.css`、`kit/illus.js`、`lib/scenes.mjs`、`lib/custom-fill.mjs`、`lib/audit-rules.mjs`、`lib/audit-page.mjs`（若要）、`dev/tests/examples.test.mjs`、`shared/style.md`、`USAGE-reference.md` |
| A 疊加情境＋全幕版 | 06（全幕）、07、08、09（＋全幕）、10、11（全幕）、12、14、15（＋全幕） | 9 檔（13 個版式） | `scenes/06,07,08,09,10,11,12,14,15/template.html` |
| B 舞台情境＋角標＋字卡動態 | 01、02、04a、04b、04c、04d、fx-20、fx-22；band 類 13 張橫式透明裁切（build 一處） | 8＋1 處 build | `scenes/01-chapter/`（template、scene.json）、`scenes/04a–04d/template.html`、`fx/effects/fx-20-*.html`、`fx-22-*.html`、`fx/catalog.json`、`lib/main.mjs`（01 舞台、02 直式角標字級）、`lib/speaker-side.mjs`（fxStage） |
| C 流程／架構 | x-architecture、x-architecture-send、x-branch、x-callout、x-process、x-process-loop、x-process-trace、x-prompt-tree、x-route、x-timeline | 10 | 各自的 `custom/x-*.html`、`.fill.json` |
| D 清單／堆疊 | x-checklist、x-checklist-ai、x-fix、x-folder、x-recap、x-relay、x-scroll-brake、x-stack、x-stack-podium、x-warnings | 10 | 同上 |
| E 數字／圖表 | x-before-after、x-crowd、x-crowd-queue、x-rank、x-receipt、x-ring、x-ring-facets、x-trend、x-trend-blocks、x-versus | 10 | 同上 |
| F 介面／程式碼／對話 | x-code-diff、x-comment、x-news、x-prompt、x-prompt-chat、x-slider、x-terminal、x-terminal-code、x-ui-mock、x-ui-mock-tidy | 10 | 同上 |
| G 示意／比喻／短句 | x-scene、x-scene-example-outline、x-scene-example-rec、x-desk、x-metaphor、x-callout-parts、x-callout-phone、x-point、x-wordcut | 9 | 同上（x-scene 系的插圖標籤靠包 0 的 `kit/illus.js`） |

不用動：13、06／11 的疊加版、x-numbers、24 張直式 ok 的 fx、03、05、x-breakout、x-magazine、x-tags、x-wall（已標直式不提供）、14 張 band fx 的直式（catalog 已標）。

每包驗收照 brief 第 3 步：橫式逐像素不變（除非表上寫橫式也要修）、直式 `audit.mjs --format portrait` 0 ✖（48 px、置中、不被切）；可以重用這次的暫存專案（`make-projects.mjs` 會重建）和 `measure.mjs`、`compose.mjs` 出改前／改後並排圖（第 4 步的對照頁）。腳本在 `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/815f192b-d692-4a86-902c-6e9ff375331a/scratchpad/056-scripts/`（scratchpad，會清掉；要留就搬進 `dev/`）。

## 總表

截圖都在 `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/815f192b-d692-4a86-902c-6e9ff375331a/scratchpad/056-survey/`。「最小字」是畫面上的 px（直式已乘縮放），— 是沒量到（角標由 main 畫、或直式不放）。「直式內容寬×高」是字＋圖占可用區的比例。

| # | 模板 | 種類 | 橫式 | 直式 | 要改什麼 | 包 | 最小字 橫／直（px） | 直式內容寬×高 | 截圖 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 01-chapter | 情境 | 可以 | 直式要自己的參數 | 直式只用中間一條 16:9（上下各 1/3 深底空著）、CHAPTER 21 px、副標 38 px → 直式改成 1080×1920 直排（圖示／CHAPTER 01／章名／副標上下疊）、字 ≥ 48；要 build 讓 01 直式不走 ch 舞台（scene.json portrait＋main.mjs stageOf）。短影片 < 3 分鐘不放章節，優先度低 | B | 34.1／21.3 | 0.5×0.75 | `01-chapter.jpg` |
| 2 | 02-chapter-tag | 情境 | 可以 | 直式要自己的參數 | 直式章名 44 px（不縮放）< 48 → 直式 48。角標由 main.mjs 畫（class .sc-chtag__name，kit/scene.css），不在 template：在 main.mjs 直式角標加 class 或 inline 字級 | B | —／— | — | `02-chapter-tag.jpg` |
| 3 | 03-side-panel | 情境 | 可以 | 直式不適合 | 已標「直式不提供」，維持（替代：13 標題條列、04a） | — | —／— | — | `03-side-panel.jpg` |
| 4 | 04a-fs-list | 情境 | 可以 | 直式要自己的參數 | 清單字 56 → 畫面 47.4 px，差一點 → @style-portrait 字 57 | B | 56／47.4 | 0.63×0.76 | `04a-fs-list.jpg` |
| 5 | 04b-fs-compare | 情境 | 可以 | 直式要自己的參數 | 左右項 字級 44（畫面 37） → 寫 ≥ 57（直式縮 0.8475）；兩欄每項 ≤ 10 字 × 57 px 放不下欄寬 → 直式改上下兩段，或直式每項 ≤ 8 字 | B | 44／37.3 | 0.8×0.76 | `04b-fs-compare.jpg` |
| 6 | 04c-fs-flow | 情境 | 可以 | 直式要自己的參數 | 站名 字級 44（畫面 37） → 寫 ≥ 57（直式縮 0.8475）；4 站 × 5 字剛好塞滿 → 圖示縮一級或 4 站改 2×2 | B | 44／37.3 | 1×0.81 | `04c-fs-flow.jpg` |
| 7 | 04d-fs-table | 情境 | 可以 | 直式要自己的參數 | 表格字 字級 44（畫面 37） → 寫 ≥ 57（直式縮 0.8475）；4 欄 × 10 字放不下 → 直式最多 3 欄、每格 ≤ 6 字（slots 直式上限） | B | 44／37.3 | 0.66×0.81 | `04d-fs-table.jpg` |
| 8 | 05-two-sides | 情境 | 可以 | 直式不適合 | 已標「直式不提供」，維持（替代：12 關鍵詞條列、04a） | — | 60／— | — | `05-two-sides.jpg` |
| 9 | 06-concept | 情境 | 可以 | 可以 | —（全幕版另列下一行） | A | 53.9／53.9 | 0.78×0.16 | `06-concept.jpg` |
| 10 | 06-concept-full | 情境（全幕版） | 可以 | 直式要自己的參數 | 縮 0.5952 後標籤 26 px、定義 33 px，內容只占面板寬 30% → 需要 @style-full-portrait（字 ≥ 81、放大填滿面板） | A | 44／26.2 | 0.3×0.58 | `06-concept-full.jpg` |
| 11 | 07-key-point | 情境 | 可以 | 直式要自己的參數 | 直式前句＋重點左右並排，重點板超出右緣 275 px（audit ✖ canvas／unsafe）→ data-layout-portrait 改上下兩列；標籤 44 → 48。橫式 audit ⚠ 半像素邊 1 條順手修 | A | 44／44 | 0.94×0.14 | `07-key-point.jpg` |
| 12 | 08-steps | 情境 | 可以 | 直式要自己的參數 | 底板右緣 962 進右側按鈕列（audit ✖ unsafe）→ 直式卡寬 ≤ 880（x 60–940） | A | 54／54 | 0.49×0.16 | `08-steps.jpg` |
| 13 | 09-qa | 情境 | 可以 | 直式要自己的參數 | Q／A 標 36 px → 48 | A | 36／36 | 0.7×0.24 | `09-qa.jpg` |
| 14 | 09-qa-full | 情境（全幕版） | 可以 | 直式要自己的參數 | 「我的回答」26 px、A 標 38 px，內容 51%×41% → @style-full-portrait | A | 44／26.2 | 0.51×0.41 | `09-qa-full.jpg` |
| 15 | 10-tips | 情境 | 可以 | 直式要自己的參數 | 說明兩行 40 px → 48；每行上限直式 22 → 16 字 | A | 40／40 | 0.64×0.24 | `10-tips.jpg` |
| 16 | 11-summary | 情境 | 可以 | 可以 | —（全幕版另列下一行） | A | 54／54 | 0.6×0.23 | `11-summary.jpg` |
| 17 | 11-summary-full | 情境（全幕版） | 可以 | 直式要自己的參數 | 標籤 26 px、正文 47.6 px → @style-full-portrait | A | 44／26.2 | 0.43×0.61 | `11-summary-full.jpg` |
| 18 | 12-keywords | 情境 | 可以 | 直式要自己的參數 | 直式 2＋1 排法 audit ⚠ 間距不一（−180／24 px）、內距 → 改成一列三個等寬或單欄三列（data-layout-portrait） | A | 72／72 | 0.73×0.26 | `12-keywords.jpg` |
| 19 | 13-title-list | 情境 | 可以 | 可以 | — | — | 52／52 | 0.78×0.15 | `13-title-list.jpg` |
| 20 | 14-speaker | 情境 | 可以 | 直式要自己的參數 | 三個頭銜 40 px → 48；一行放不下時直式拆兩行 | A | 40／40 | 0.82×0.24 | `14-speaker.jpg` |
| 21 | 15-quote | 情境 | 可以 | 直式要自己的參數 | 出處 36 px → 48 | A | 36／36 | 0.68×0.25 | `15-quote.jpg` |
| 22 | 15-quote-full | 情境（全幕版） | 可以 | 直式要自己的參數 | 出處 26 px → @style-full-portrait（正文已 ≥ 48） | A | 44／26.2 | 0.96×0.5 | `15-quote-full.jpg` |
| 23 | x-architecture | 情境動畫 | 可以 | 直式要自己的參數 | 站名／雲端 字級 52（畫面 44） → 寫 ≥ 57（直式縮 0.8475） | C | 52／44.1 | 1×0.92 | `x-architecture.jpg` |
| 24 | x-architecture-send | 情境動畫 | 可以 | 直式要自己的參數 | 「都收到」40、名稱 52 → 57 | C | 40／33.9 | 1×0.93 | `x-architecture-send.jpg` |
| 25 | x-before-after | 情境動畫 | 可以 | 直式要自己的參數 | 痛點小字 40、標籤 52 → 57；兩卡並排放得下 | E | 40／33.9 | 1×0.92 | `x-before-after.jpg` |
| 26 | x-branch | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52（畫面 44） → 寫 ≥ 57（直式縮 0.8475） | C | 52／44.1 | 1×0.92 | `x-branch.jpg` |
| 27 | x-breakout | 情境動畫（疊加） | 可以 | 直式不適合 | 已標 portrait: none（portraitAlt 15 金句字卡），維持 | — | 44.6／44.6 | 0.21×0.06 | `x-breakout.jpg` |
| 28 | x-callout | 情境動畫 | 可以 | 直式要自己的參數 | 四個標註 字級 52 → 寫 ≥ 57（直式縮 0.8475）；左右各兩個 ≤ 5 字放得下 | C | 52／44.1 | 1×0.92 | `x-callout.jpg` |
| 29 | x-callout-parts | 情境動畫 | 可以 | 直式要自己的參數 | 號碼、物件名 40（畫面 34）→ 57；右側 4 列清單行距重排 | G | 40／33.9 | 1×0.92 | `x-callout-parts.jpg` |
| 30 | x-callout-phone | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475） | G | 52／44.1 | 0.83×0.81 | `x-callout-phone.jpg` |
| 31 | x-checklist | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475） | D | 51.9／44 | 0.9×0.86 | `x-checklist.jpg` |
| 32 | x-checklist-ai | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475）；右側數字欄同步放大 | D | 52／44.1 | 0.9×0.86 | `x-checklist-ai.jpg` |
| 33 | x-code-diff | 情境動畫 | 可以 | 直式要自己的參數 | 程式碼 44（畫面 37）、檔名 40 → 57；57 px 等寬字一行只放得下約 26 個半形字元（範例最長 37）→ 直式限每行字數（fill.json 直式上限，超過 ⚠ 換錄影段） | F | 39.9／33.8 | 0.81×0.85 | `x-code-diff.jpg` |
| 34 | x-comment | 情境動畫 | 可以 | 直式要自己的參數 | 名稱／時間／讚數 40–44 → 57；內容只占面板 66%×67%、偏左 110 px → 留言卡放大置中 | F | 39.9／33.8 | 0.66×0.67 | `x-comment.jpg` |
| 35 | x-crowd | 情境動畫 | 可以 | 直式要自己的參數 | 標籤 40（畫面 34）、人數單位 52 → 57 | E | 40／33.9 | 0.89×0.88 | `x-crowd.jpg` |
| 36 | x-crowd-queue | 情境動畫 | 可以 | 直式要自己的參數 | 「5 天」「1 天」40（畫面 32）、名稱 52 → 57 | E | 38.2／32.4 | 0.9×0.87 | `x-crowd-queue.jpg` |
| 37 | x-desk | 情境動畫 | 可以 | 直式要自己的參數 | 桌上三個物件名 40（畫面 34）→ 57 | G | 40／33.9 | 0.9×0.86 | `x-desk.jpg` |
| 38 | x-fix | 情境動畫 | 可以 | 直式要自己的參數 | 痛點 52、副標 40 → 57 | D | 40／33.9 | 1×0.92 | `x-fix.jpg` |
| 39 | x-folder | 情境動畫 | 可以 | 直式要自己的參數 | 樹 40（畫面 32）；橫式完成態靠樹長大，直式 11 列 × 57 px 塞不進面板 636 高 → 直式最多 7 列（或兩欄）＋字 57 | D | 38／32.2 | 0.7×0.87 | `x-folder.jpg` |
| 40 | x-magazine | 情境動畫（疊加） | 可以 | 直式不適合 | 已標 portrait: none；直式量到 ✖ canvas、unsafe（雜誌標頭在平台介面區） | — | 39.9／44 | 0.96×0.53 | `x-magazine.jpg` |
| 41 | x-metaphor | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475） | G | 52／44.1 | 0.83×0.83 | `x-metaphor.jpg` |
| 42 | x-news | 情境動畫 | 可以 | 直式要自己的參數 | 標題列 52、資料來源 40、圖表標籤 → 57 | F | 39.9／33.8 | 0.93×0.86 | `x-news.jpg` |
| 43 | x-numbers | 情境動畫 | 可以 | 可以 | 直式最小字 54 px，面板占滿 | — | 63.9／54.1 | 0.6×0.77 | `x-numbers.jpg` |
| 44 | x-point | 情境動畫 | 可以 | 直式要自己的參數 | 標籤 40、副標 44（畫面 34–37）；內容只占面板 58%×37%（太空）→ 直式整張卡放大、主句 ≥ 72 | G | 40／33.9 | 0.58×0.37 | `x-point.jpg` |
| 45 | x-process | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475） | C | 52／44.1 | 1×0.92 | `x-process.jpg` |
| 46 | x-process-loop | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475） | C | 52／44.1 | 1×0.92 | `x-process-loop.jpg` |
| 47 | x-process-trace | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475） | C | 52／44.1 | 1×0.92 | `x-process-trace.jpg` |
| 48 | x-prompt | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475）；提示詞框只占 63% 寬 → 直式拉滿 | F | 52／44.1 | 0.63×0.75 | `x-prompt.jpg` |
| 49 | x-prompt-chat | 情境動畫 | 可以 | 直式要自己的參數 | 對話泡泡 40（畫面 34）→ 57；泡泡寬度、斷行重排 | F | 40／33.9 | 0.86×0.82 | `x-prompt-chat.jpg` |
| 50 | x-prompt-tree | 情境動畫 | 可以 | 直式要自己的參數 | 橫式完成態靠 P.cam 推近；直式舞台不推（STAGED），樹只占上半、子項 34–41 px（audit ⚠ portrait-cam、vbalance）→ 直式自己的排法：不用 P.cam、整棵樹放大到面板、子項 57 | C | 40／33.9 | 1×1 | `x-prompt-tree.jpg` |
| 51 | x-rank | 情境動畫 | 可以 | 直式要自己的參數 | 5 列標籤／數字 40–52 → 57；長條縮短讓位給字 | E | 40／33.9 | 0.89×0.75 | `x-rank.jpg` |
| 52 | x-recap | 情境動畫 | 可以 | 直式要自己的參數 | 卡號 32（畫面 27）、標題 40 → 57；2×2 格上緣超出內容區 64 px（vbalance ⚠）→ 縮間距、整組下移 | D | 32／27.1 | 0.76×1 | `x-recap.jpg` |
| 53 | x-receipt | 情境動畫 | 可以 | 直式要自己的參數 | 收據字 44（畫面 37）；撕口上緣 y 92 超出舞台窗（audit ✖ portrait-window）→ 直式收據下移進窗、放大到面板高、字 57 | E | 43.8／37.1 | 0.49×0.98 | `x-receipt.jpg` |
| 54 | x-relay | 情境動畫 | 可以 | 直式要自己的參數 | 步驟字 40（畫面 34）→ 57；左欄截圖、右側大字並排擠 → 截圖欄窄化或改上下 | D | 40／33.9 | 0.89×1 | `x-relay.jpg` |
| 55 | x-ring | 情境動畫 | 可以 | 直式要自己的參數 | 單位 40、兩列 52 → 57 | E | 40／33.9 | 1×0.92 | `x-ring.jpg` |
| 56 | x-ring-facets | 情境動畫 | 可以 | 直式要自己的參數 | 號碼、說明 40（畫面 34）→ 57；四列說明直式放不下 → 直式只留面向名 | E | 40／33.9 | 0.81×0.83 | `x-ring-facets.jpg` |
| 57 | x-route | 情境動畫 | 可以 | 直式要自己的參數 | 站名 44、備註 40（畫面 34–37）→ 57；4 站橫排放得下 | C | 40／33.9 | 0.9×0.73 | `x-route.jpg` |
| 58 | x-scene | 情境動畫（示意） | 可以 | 直式要自己的參數 | 插圖標籤 32（畫面 27，kit/illus.js 畫的 SVG 字）→ 直式 57；三支 x-scene 系共用 | G | 32／27.1 | 1×0.92 | `x-scene.jpg` |
| 59 | x-scene-example-outline | 情境動畫（示意範例） | 可以 | 直式要自己的參數 | 同 x-scene（插圖標籤、REC 小字） | G | 14.6／12.4 | 1×0.92 | `x-scene-example-outline.jpg` |
| 60 | x-scene-example-rec | 情境動畫（示意範例） | 可以 | 直式要自己的參數 | 同 x-scene（插圖標籤、REC 00:05） | G | 27.8／23.6 | 1×0.92 | `x-scene-example-rec.jpg` |
| 61 | x-scroll-brake | 情境動畫 | 可以 | 直式要自己的參數 | 清單 40（畫面 34）；左大數字＋右清單並排 → 直式改上下（數字在上、清單 3 列在下）、字 57 | D | 40／33.9 | 0.92×1 | `x-scroll-brake.jpg` |
| 62 | x-slider | 情境動畫 | 可以 | 直式要自己的參數 | 拉桿把手 x 88 超出舞台窗左緣 32 px（audit ✖ portrait-window）→ 把手不出窗；標籤 40 → 57 | F | 40／33.9 | 0.97×0.97 | `x-slider.jpg` |
| 63 | x-stack | 情境動畫 | 可以 | 直式要自己的參數 | 右側說明 40（畫面 34）→ 57 放不進同一列 → 直式拿掉說明或改兩行 | D | 39.9／33.8 | 0.92×0.89 | `x-stack.jpg` |
| 64 | x-stack-podium | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475） | D | 52／44.1 | 0.9×0.89 | `x-stack-podium.jpg` |
| 65 | x-tags | 情境動畫（疊加） | 可以 | 直式不適合 | 已標 portrait: none；直式量到 ✖ canvas、unsafe、壓到臉 | — | 45.1／45.1 | 0.14×0.36 | `x-tags.jpg` |
| 66 | x-terminal | 情境動畫 | 可以 | 直式要自己的參數 | 標題列 40、指令 52 → 57；一行 ≤ 26 半形字元 | F | 40／33.9 | 0.84×0.67 | `x-terminal.jpg` |
| 67 | x-terminal-code | 情境動畫 | 可以 | 直式要自己的參數 | 行號／程式碼 40（畫面 34）→ 57；一行 ≤ 26 半形字元（範例 44）→ 同 x-code-diff 直式上限 | F | 39.9／33.8 | 0.84×0.79 | `x-terminal-code.jpg` |
| 68 | x-timeline | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475） | C | 52／44.1 | 1×0.92 | `x-timeline.jpg` |
| 69 | x-trend | 情境動畫 | 可以 | 直式要自己的參數 | 軸標 40（畫面 33）→ 57；5 個月份放得下 | E | 39.3／33.3 | 0.9×0.87 | `x-trend.jpg` |
| 70 | x-trend-blocks | 情境動畫 | 可以 | 直式要自己的參數 | 軸標 40、數字 52 → 57 | E | 39.3／33.3 | 0.9×0.87 | `x-trend-blocks.jpg` |
| 71 | x-ui-mock | 情境動畫 | 可以 | 直式要自己的參數 | 介面字 40（畫面 34）→ 57；側欄＋4 列設定放不下 → 直式藏側欄、視窗放大（像 data-wide-zoom 的直式版） | F | 39.8／33.8 | 0.88×0.7 | `x-ui-mock.jpg` |
| 72 | x-ui-mock-tidy | 情境動畫 | 可以 | 直式要自己的參數 | 視窗名 40 → 57；2×2 視窗放得下 | F | 40／33.9 | 0.85×0.78 | `x-ui-mock-tidy.jpg` |
| 73 | x-versus | 情境動畫 | 可以 | 直式要自己的參數 | VS 40、數字 52 → 57；三列對照放得下 | E | 39.6／33.6 | 0.88×0.84 | `x-versus.jpg` |
| 74 | x-wall | 情境動畫（疊加） | 可以 | 直式不適合 | 已標 portrait: none；直式量到 ✖ unsafe（字牆壓右側按鈕列） | — | 132／132 | 1×0.57 | `x-wall.jpg` |
| 75 | x-warnings | 情境動畫 | 可以 | 直式要自己的參數 | 字級 52 → 寫 ≥ 57（直式縮 0.8475） | D | 52／44.1 | 0.79×0.8 | `x-warnings.jpg` |
| 76 | x-wordcut | 情境動畫 | 可以 | 直式要自己的參數 | 副標 52 → 57 | G | 52／44.1 | 0.49×0.83 | `x-wordcut.jpg` |
| 77 | fx-01-word-burst | 字卡動態 | 可以 | 可以 | — | — | 84／157.5 | 0.58×0.38 | `fx-01-word-burst.jpg` |
| 78 | fx-02-letter-sequence | 字卡動態 | 可以 | 可以 | 畫面可以；audit ✖ canvas 是退場時字飛出上緣（段尾前 0.6 秒量到） | — | 156／292.5 | 0.27×0.7 | `fx-02-letter-sequence.jpg` |
| 79 | fx-03-text-stamp | 字卡動態 | 可以 | 可以 | — | — | 49.4／92.5 | 0.81×0.74 | `fx-03-text-stamp.jpg` |
| 80 | fx-04-punch-zoom | 字卡動態 | 可以 | 可以 | — | — | 90／168.8 | 0.63×0.4 | `fx-04-punch-zoom.jpg` |
| 81 | fx-05-kinetic-stack | 字卡動態 | 可以 | 可以 | 畫面可以；第一組詞往上推出（over 470 px）是設計，audit ✖ canvas 同上 | — | 78／146.3 | 0.27×0.61 | `fx-05-kinetic-stack.jpg` |
| 82 | fx-06-stretch-text | 字卡動態 | 可以 | 可以 | — | — | 90／168.8 | 0.63×0.61 | `fx-06-stretch-text.jpg` |
| 83 | fx-07-text-zoom-through | 字卡動態（band） | 可以 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持 | — | 78／146.3 | 0.54×0.35 | `fx-07-text-zoom-through.jpg` |
| 84 | fx-08-text-squeeze | 字卡動態 | 可以 | 可以 | — | — | 48.1／90.1 | 0.55×0.28 | `fx-08-text-squeeze.jpg` |
| 85 | fx-09-huge-text-scroll | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 19.2／36 | 1×0.7 | `fx-09-huge-text-scroll.jpg` |
| 86 | fx-10-vertical-typography | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 30／56.3 | 0.98×1 | `fx-10-vertical-typography.jpg` |
| 87 | fx-11-repeating-text-wave | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 30.6／57.4 | 1×1 | `fx-11-repeating-text-wave.jpg` |
| 88 | fx-12-diagonal-text-bands | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 45.9／86 | 1×1 | `fx-12-diagonal-text-bands.jpg` |
| 89 | fx-13-text-ribbon | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 33.6／63 | 1×0.63 | `fx-13-text-ribbon.jpg` |
| 90 | fx-14-marquee-board | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 36.6／68.6 | 1×0.93 | `fx-14-marquee-board.jpg` |
| 91 | fx-15-parallax-columns | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 33／61.9 | 0.97×1 | `fx-15-parallax-columns.jpg` |
| 92 | fx-16-tape-cross | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 31.8／59.6 | 1×0.72 | `fx-16-tape-cross.jpg` |
| 93 | fx-17-text-tunnel | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 3.2／6 | 1×1 | `fx-17-text-tunnel.jpg` |
| 94 | fx-18-text-corridor | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 0.5／1 | 1×1 | `fx-18-text-corridor.jpg` |
| 95 | fx-19-text-cylinder | 字卡動態 | 可以 | 可以 | 正面字 149 px；audit ⚠ 背面字 21 px（圓柱背面本來就小）→ audit 該略過背面，不改模板 | — | 8.5／15.9 | 0.46×0.66 | `fx-19-text-cylinder.jpg` |
| 96 | fx-20-text-vortex | 字卡動態 | 可以 | 直式要自己的參數 | 直式退場時字掃進字幕帶（audit ✖ caption，子合成 y 953 → 畫面 y 1302）→ 直式漩渦半徑收小或位置上移 30 px | B | 89.6／168 | 0.57×0.39 | `fx-20-text-vortex.jpg` |
| 97 | fx-21-ring-tunnel | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 1.8／2.4 | 0.95×1 | `fx-21-ring-tunnel.jpg` |
| 98 | fx-22-text-orbit | 字卡動態 | 可以 | 直式要自己的參數 | 環繞小字 42 px（catalog portraitMinPx 42，--check 已 ⚠）→ 直式環繞字放大到 ≥ 86（畫面 48） | B | 22.5／42.2 | 0.78×0.54 | `fx-22-text-orbit.jpg` |
| 99 | fx-23-text-cube | 字卡動態 | 可以 | 可以 | — | — | 41.7／78.2 | 0.24×0.41 | `fx-23-text-cube.jpg` |
| 100 | fx-24-extrude-text | 字卡動態 | 可以 | 可以 | — | — | 90／168.7 | 0.65×0.46 | `fx-24-extrude-text.jpg` |
| 101 | fx-25-split-flap | 字卡動態 | 可以 | 可以 | 畫面可以；直式 audit ✖ clipped（翻牌半片裁切是設計），橫式不報 → audit 要放行 | — | 63.3／118.7 | 0.59×0.29 | `fx-25-split-flap.jpg` |
| 102 | fx-26-flip-cards | 字卡動態 | 可以 | 可以 | — | — | 50.9／95.5 | 0.49×0.3 | `fx-26-flip-cards.jpg` |
| 103 | fx-27-typewriter | 字卡動態 | 可以 | 可以 | — | — | 66／123.8 | 0.34×0.29 | `fx-27-typewriter.jpg` |
| 104 | fx-28-slot-text | 字卡動態 | 可以 | 可以 | 畫面可以；直式 audit ✖ clipped（拉霸捲軸框外的字是設計）→ audit 要放行 | — | 63.3／118.7 | 0.5×0.6 | `fx-28-slot-text.jpg` |
| 105 | fx-29-odometer | 字卡動態 | 可以 | 可以 | 畫面可以；直式 audit ✖ clipped（里程表捲軸）→ audit 要放行 | — | 35.1／65.8 | 0.65×1 | `fx-29-odometer.jpg` |
| 106 | fx-30-headline-swap | 字卡動態 | 可以 | 可以 | 畫面可以；直式 audit ✖ clipped（標題捲軸）→ audit 要放行 | — | 32.4／60.8 | 0.6×0.47 | `fx-30-headline-swap.jpg` |
| 107 | fx-31-led-text | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 72／135 | 1×0.32 | `fx-31-led-text.jpg` |
| 108 | fx-32-split-halves | 字卡動態 | 可以 | 可以 | — | — | 29.8／55.8 | 0.79×0.38 | `fx-32-split-halves.jpg` |
| 109 | fx-33-outline-text | 字卡動態（band） | 橫式也要修 | 直式不適合 | catalog 已標 band，--check 會 ⚠，維持；橫式透明（bg none）縮到講者旁時被裁成方框，滿版流動字的邊被硬切 → band 類透明時不要縮小（整張疊）或預設不透明（改 build／speaker-side.mjs fxStage，不改模板） | B | 44.9／84.2 | 1×1 | `fx-33-outline-text.jpg` |
| 110 | fx-34-glitch-slices | 字卡動態 | 可以 | 可以 | — | — | 90／168.8 | 0.63×0.4 | `fx-34-glitch-slices.jpg` |
| 111 | fx-35-text-mask-pattern | 字卡動態 | 可以 | 可以 | 畫面可以；黑字圖紋疊在深色衣服上對比差（素材相關，不算模板問題） | — | 90／168.8 | 0.63×0.4 | `fx-35-text-mask-pattern.jpg` |
| 112 | fx-36-long-shadow | 字卡動態 | 可以 | 可以 | — | — | 78／146.3 | 0.54×0.35 | `fx-36-long-shadow.jpg` |
| 113 | fx-37-liquid-fill | 字卡動態 | 可以 | 可以 | — | — | 84／157.5 | 0.58×0.38 | `fx-37-liquid-fill.jpg` |
| 114 | fx-38-highlight-text | 字卡動態 | 可以 | 可以 | — | — | 66／123.8 | 0.57×0.29 | `fx-38-highlight-text.jpg` |
| 115 | fx-39-split-color-word | 字卡動態 | 可以 | 可以 | — | — | 90／168.8 | 0.63×0.4 | `fx-39-split-color-word.jpg` |
| 116 | fx-40-text-echo | 字卡動態 | 可以 | 可以 | — | — | 66／123.7 | 0.5×0.52 | `fx-40-text-echo.jpg` |

---
name: auto-edit-motion
description: 做一段第二層情境動畫 work/hyperframes/compositions/x-<名稱>.html：從 shared/template/custom/ 的範例改、用句號綁字幕、自查後照固定格式回報。當主代理派工「做 x-<名稱> 情境動畫」，或分鏡表確認後只有一段情境動畫要自己做時使用。要改第一層情境模板、plan.json、rough.srt 時不要用（那是主代理的事，改用 auto-edit-review）。
version: 0.1.0
---
# 一段情境動畫

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| 停點 ③ 通過；這段確認過的動畫分鏡；plan.json 已登記這段（`"type": "custom"`、`src`、`layout`）；主代理已 build 過一次 | `build.mjs --check`、`audit.mjs --only <段 id>` | `work/hyperframes/compositions/x-<名稱>.html` | 兩個指令都 0 個 ✖ | 沒有（交回主代理） |

做法的唯一定義：USAGE-reference.md R7，照步驟只讀那一小節（步驟 2 讀 R7.5、步驟 3 和 5 讀 R7.2 檔案與登記、步驟 4 讀 R7.3 骨架與方法、步驟 6 讀 R7.6 檢查），不整個 R7 讀；動作名稱與對應的 `P.*`：`shared/template/BEATS.md` §2；版面與動作門檻：style.md「動畫視覺」「節奏」、USAGE-reference.md R8（只看下面寫到的那幾條，例 #2、#17）。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 當子代理 | 只能寫自己那支 `x-<名稱>.html`；不跑 build、snapshot、preview、render（AGENTS.md「子代理分工」） |
| 主代理、而且有 2 段以上 | 有能派子代理的工具：一段一個子代理，同一則回覆一次全部派出（派工訊息照 `references/worker-brief.md`），等它們回覆或完成通知（不要寫 `sleep` 迴圈等檔案），全部回來再整合、build 一次；沒有才自己一段一段照本檔做 |
| `compositions/x-<名稱>.html` 已經存在、不是範例原文 | 從步驟 4 接著改，不要重新複製蓋掉 |
| storyboard.md 沒有這段的 `#### 動畫分鏡`，派工訊息也沒附 | 不要自己編：交回主代理補（`auto-edit-storyboard` 步驟 5），使用者確認後再做 |
| 停點 ④ 之後的改版（主代理跑過 `versions.mjs accept`） | 步驟 1 讀的就是確認過的新分鏡；x 檔已經在，從步驟 4 照新分鏡改（拍數、動作變了就整段時間軸重排，不保留舊版的拍）；舊版已經存在 `work/versions/<段>/`，不用自己備份 |

## 步驟

**1. 讀確認過的動畫分鏡**
```
grep -n -A 25 "#### 動畫分鏡 <段 id>" projects/<專案>/work/storyboard.md
```
照停點 ③ 確認過的那張表一拍一拍做（派工時用派工訊息附的那張）。每一拍＝一個拍點常數：「講到」欄照抄成 `const T1 = P.at('#38@兩支')`（「`#35`＋0.7」寫 `P.at('#35', 0.7)`）；「音效拍點」有寫就改用 `const T1 = P.sfx('success', '#38@兩支')`（回傳秒數，同時當這一拍的動畫時間；`P.sfx('ding', '#41', 0.2)` 晚 0.2 秒）：音效名、ref 都寫字串字面值，off 寫數字；build 會排成音效、算進 `--check` 的音效次數與密度，不要在 plan.json 另外寫。「動態」欄每個名稱查 `shared/template/BEATS.md` §2 的「對應」欄，用那個 `P.*`；對應寫「build 自動」的（背景環境、色帶擦開、子母畫面飛入、色帶收回）不用寫程式。不從範例猜動作，不自己加拍、刪拍、換動作。
完成判準：每一拍都對到一個拍點常數（或「上一拍＋秒數」）；動態欄每個名稱都在 BEATS.md §2 找得到。
常見錯誤：動態欄有語彙表沒有的詞 → 不要自己解讀，交回主代理問使用者；只抄了「講到」沒抄詞（`#38`）→ 照表寫 `#38@兩支`。

**2. 挑範例、複製**（主代理已放好就跳過）
```
Mac：cp shared/template/custom/<範例>.html projects/<專案>/work/hyperframes/compositions/x-<名稱>.html
Windows（PowerShell）：Copy-Item shared\template\custom\<範例>.html projects\<專案>\work\hyperframes\compositions\x-<名稱>.html
```
從哪支範例改：

| 看哪裡 | 範例在哪一格 |
|---|---|
| 分鏡表「情境判定」那段寫的「SITUATIONS §3 哪一列」 | `shared/template/SITUATIONS.md` §3 那一列的「首選」與「動態（build 自動做／custom 範例）」欄寫的 `x-*.html`（用 `grep -n` 找那一列，不要整節讀） |
| §3 沒有對到的情境 | USAGE-reference.md R7.5 的表（每支範例的適用口播、要改的欄位） |

17 支範例（`shared/template/custom/`）：

| 口播在講 | 範例 |
|---|---|
| 有先後的過程，3–4 站、每站一句 | `x-process.html` |
| 比喻：生活物件 → 技術概念 → 一句代價 | `x-metaphor.html` |
| 同一件事換個做法，時間或成本差很多 | `x-before-after.html` |
| 數量超過上限，再處理掉大部分 | `x-numbers.html` |
| 一組 2–3 條警告，一條一句 | `x-warnings.html` |
| 提示詞、終端機指令、網址 | `x-prompt.html` |
| 介面操作，但沒有螢幕錄影 | `x-ui-mock.html` |
| 資料在裝置之間怎麼走、不經過雲端 | `x-architecture.html` |
| 一個起點分成 2–3 條路，或 2–3 個來源匯成一個 | `x-branch.html` |
| 由下往上的組成，3–4 層、從底層講起 | `x-stack.html` |
| 一組要確認／要完成的事，2–4 項 | `x-checklist.html` |
| 有時間先後的 3–4 個點（年份、版本、「這集分成三個部分」） | `x-timeline.html` |
| 兩個選項在 2–3 個面向上比，每個面向有數字 | `x-versus.html` |
| 一個主體＋2–4 個短名詞（毛病、零件、用途） | `x-callout.html` |
| 同一個量在 3–6 個時間點的變化 | `x-trend.html` |
| 一個比例或一段時間，前後各一句起點與結論 | `x-ring.html` |
| 先講 2–3 個痛點，再給一個解法 | `x-fix.html` |
完成判準：檔案存在；複製的範例和分鏡表「情境判定」那一列寫的一致。
常見錯誤：名稱有中文或空白 → 只能英數與 `-`（R7.2）。

**3. 改名四處＋前綴**
```
grep -c "x-<名稱>" projects/<專案>/work/hyperframes/compositions/x-<名稱>.html
```
檔名、`data-composition-id`、`<template id>`、`window.__timelines[...]` 四處都換成 `x-<名稱>`，id／class 前綴一起換（R7.2 第 1 點）。
完成判準：grep 的數字至少 4。
常見錯誤：漏改一處 → `--check` 報骨架錯，照它說的那一處補。

**4. 照分鏡改文字、圖示、時間軸**
```
node shared/template/tools/build.mjs --project projects/<專案> --check
```
照範例檔頭「要改的地方」「綁句欄位」改，範例的拍換成步驟 1 那張分鏡的拍（拍數、動作以分鏡為準）。直式專案不用改尺寸（build 整張縮放放進上半資訊窗），內容一樣留在 x 120–1300、y 130–880；audit 的 `portrait-window` ✖ 要修，`portrait-cam`、`font` ⚠ 照 → 改（字級下限、鏡頭推的範圍見 `shared/style.md`「直式」）。時間以 `@詞` 為主：檔頭的 T1–T4（每一站、每一拍）一律寫 `P.at('#N@詞')`，N＝講到這一站的那句，詞＝這一站畫面上的字在字幕裡的寫法（例 `P.at('#21@剪輯清單')`）；那句一開口就是這個詞才只寫 `P.at('#21')`。拍點常數（`const T1 = P.at(…)`）的名字用大寫英文字母開頭、只用大寫字母和數字（`T1`、`ALL`、`FIX`、`R2`），不要有底線或小寫；檔頭【D 下限】用同一個名字。`P.at('#21e')`＝那句結尾、`P.at('#21@剪輯清單', 0.2)`＝那個詞開口後 0.2 秒（`@詞` 寫成字串字面值）。出現時間和講到那個詞差 ≤ 0.5 秒（AGENTS.md「剪好看」硬規則；情境動畫的站由 audit 的「綁句對不上」量，`--check` 的「文字對時」不量 custom）。站名、項目、關鍵詞在句中間或句尾時一定用 `P.at('#N@詞')`，不要綁句首（綁句首，字會比講到早 1–3 秒出現）；剛好是那句第一個詞才寫 `P.at('#N')`。audit 的 ⚠ 綁句對不上會給改法。圖示：icons.json 的 svg 原文整段貼上、一個字都不改（R7.3）。只綁每個新訊息的第一拍，同一件事的後續步驟用「上一拍 + 秒數」。一組只亮一個用 `P.focus`、打字用 `P.type`（方法表在 R7.3）。畫面文字只放關鍵詞（R7.3 版面原則）；顏色只用 token。畫了游標按下：那一拍用 `P.at('#N@詞')`，回報裡請主代理在 plan.json 這段的 `clicks` 寫同一個 `#N@詞`。
完成判準：`--check` 對這段沒有 ✖；報告這段的 note 有「綁句 N 個（#…）」；步驟 6 的 audit 沒有「綁句對不上」⚠（或寫了保留理由）。
常見錯誤：`P.at('3.2')：只能寫句號` → 秒數直接寫數字 `P.in(sel, 3.2)`；`字幕沒有第 N 句` → 改成這段範圍內的句號；用了 `onUpdate`／`onComplete` → 改用 R7.3 的 SceneMotion 方法。

**5. 段長（`P.end()`）**
```
node shared/template/tools/build.mjs --project projects/<專案> --check
```
結尾寫 `P.end()`（不帶參數）：段長只由 plan.json 決定，build 會帶入（`P.dur()`），不用把 `--check` 的長度填回 `data-duration`、也不寫 `const D`（R7.2 第 4 點）。overlay 自己退場寫 `P.out(..., P.dur() - P.OUT)`。
完成判準：`--check` 不印「data-duration 比段長短」；檔內沒有 `const D`。
常見錯誤：audit 印「段長不符」→ 結尾改 `P.end()`、刪 `const D`；`--check` 印「data-duration 比段長短」→ 照 → 改成 ≥ 段長。

**6. 自查**
```
node shared/template/tools/build.mjs --project projects/<專案> --check
node shared/template/tools/audit.mjs --project projects/<專案> --only <段 id> --shots
```
完成判準：兩個都 0 個 ✖；⚠ 照 → 改，或在回報寫保留的理由；打開 `--shots` 存的截圖（`work/audit-shots/`）對著分鏡看：每個動作看得到（移動有位移、狀態換了）、視角一致（BEATS.md §5.4 下面的條列）。
常見錯誤：audit 的 ✖ → 照 `→` 改再跑一次（只改 custom 檔不用重 build）；同一個 ✖ 改兩次還在 → 停，把那幾行原文交回主代理。

**7. 回報**
```
ls -l projects/<專案>/work/hyperframes/compositions/x-<名稱>.html
```
完成判準：照 `references/worker-report.md` 的格式，最多 25 行。
常見錯誤：說完成但檔案沒寫進去 → `ls -l` 的時間不是剛剛，回步驟 4 重寫。

### 示意動畫分支（情境是 `x-scene`）：步驟 2–4、6 換成 S1–S4，步驟 1、5、7 照做

**S1. 讀插圖清單，缺的先造**
```
grep -n -A 12 "#### 插圖清單 <段 id>" projects/<專案>/work/storyboard.md
```
「來源」是「新建 SVG」的每一列造一個 `projects/<專案>/work/hyperframes/illus-local/<名稱>.svg`：派素材工人（`references/illus-worker.md`，一次一個）或自己照 `shared/template/kit/illus-style.md` 畫；「畫廊」「圖示組合」的不用造。
完成判準：每個「新建 SVG」列都有那個檔。
常見錯誤：把 SVG 直接貼進 x 檔 → 新元件一律放 `illus-local/`，用 `data-illus-src="illus-local/<名稱>.svg"` 掛。

**S2. 風格檢查、看拼圖**
```
node shared/template/tools/media.mjs illus-lint --project projects/<專案>
```
✖ 全修，⚠ 照 → 改或寫理由；再打開 `work/插圖清單.jpg`（新元件和畫廊元件並排），線粗、圓角、用色不像同一套就退回重畫。
完成判準：illus-lint 0 個 ✖；插圖清單.jpg 看過。
常見錯誤：用了色碼、漸層、`<text>` → 只能 `var(--il-*)`、字寫在 HTML 標籤（illus-style.md §3）。

**S3. 從骨架照拍組裝**
```
Mac：cp shared/template/custom/x-scene.html projects/<專案>/work/hyperframes/compositions/x-<名稱>.html
Windows（PowerShell）：Copy-Item shared\template\custom\x-scene.html projects\<專案>\work\hyperframes\compositions\x-<名稱>.html
```
改名四處（步驟 3），只填檔頭的 `DATA`：「元件清單」照分鏡的「插圖元件（狀態）」「位置」欄寫宣告：外層 `data-layout`／`data-gap`（靠左加 `data-justify="start"`），每項加 `data-slot`（第二列 `data-row="2"`）、`data-illus` 或 `data-illus-src`、狀態、標籤 ≤ 10 字；連接線寫 `data-links`；不寫 `left`／`top`、不手寫 path（`shared/style.md`「版面」），「拍」照分鏡一拍一列（`#N@詞`、做什麼）。寫法看 `shared/template/custom/x-scene-example-rec.html`（手機試錄）、`shared/template/custom/x-scene-example-outline.html`（本集大綱）。script 第一行 `ILLUS.mount(...)` 不要動。
完成判準：分鏡每一拍、插圖清單每個元件都在 `DATA` 裡。
常見錯誤：自己加了分鏡沒有的元件或拍 → 刪掉，要加請主代理問使用者；手寫了 `left`／`top` 或 path → 刪掉，交給 `data-layout`、`data-links`。

**S4. 三關自驗**
```
node shared/template/tools/build.mjs --project projects/<專案> --check
node shared/template/tools/audit.mjs --project projects/<專案> --only <段 id> --shots
node shared/template/tools/media.mjs illus-lint --project projects/<專案>
```
完成判準：三個都 0 個 ✖；audit 的 `layout-*` ⚠ 照改法改，不改的寫理由。
常見錯誤：audit 報 `[ILLUS] 讀不到 data-illus-src=…` → 路徑相對 `work/hyperframes/`，寫 `illus-local/<名稱>.svg`。

## 自我核對

- [ ] 只改了自己那支 `x-<名稱>.html`
- [ ] 顏色只用 token，沒有寫死色碼
- [ ] 動畫只用 SceneMotion 方法，結尾有 `P.end()`，沒有 `const D`
- [ ] 動畫分鏡每一拍都做了，動作只用 BEATS.md「對應」欄的 `P.*`，沒有自己加拍、刪拍；示意動畫的新元件都在 `illus-local/`、illus-lint 0 個 ✖
- [ ] 每一站、每一拍用 `P.at('#N@詞')` 綁到講到那個詞（audit 沒有「綁句對不上」），沒有用報告的起點自己算秒數
- [ ] 最後一幕的停留照 style.md「節奏」的完成態停留
- [ ] 不壓講者框 speakerBox、不進字幕區（R8 #2、#17）
- [ ] `--check`、`audit --only` 都 0 個 ✖

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `✖ … 綁句失敗：…` | 照 → 改句號或詞；原因是 `找不到 window.__cues` 就請主代理重跑 build | 停下來回報：指令、錯誤原文、已經試過什麼 |
| `✖ … 未定位頂層：…` | 那個元素寫 `position: absolute` 和整數 px 的 `left`、`top` | 停下來回報 |
| `✖ … 標題壓到內容：…` | 內容整組往下移到和標題列隔 40 px（下面每一層一起移） | 停下來回報 |
| `文字撐破容器` | 縮文案或加寬容器，不縮字級 | 停下來回報 |
| `內容被裁掉`、`超出畫面` | 照 → 移位置或縮小元素 | 停下來回報 |
| `layout-row-align`、`layout-gap`、`layout-center`、`layout-pad`、`layout-label`、`layout-label-row`、`layout-link` | 照 → 改宣告（`data-layout`／`data-gap`／`data-justify`／`data-align`／`data-links`），不手寫座標（`shared/style.md`「版面」） | 回報保留理由 |
| `進字幕區` | 元素底邊移到字幕帶上面（R8 #2） | 停下來回報 |
| `壓到子母畫面` | 照 R7.3 版面原則避開右下角小窗 | 停下來回報 |
| `對不上` | 檔名、`data-composition-id`、`<template id>`、`__timelines` 四處對齊（步驟 3） | 停下來回報 |
| `⚠ … 間距不足`、`區塊重疊` | 內容整組往下移到 40 px；重疊的移開到隔 24 px，刻意疊的加 `data-layout-allow-overlap` 並在回報寫理由（svg 線稿與連接線不算區塊，不會報） | 回報保留理由 |
| `⚠ … nowrap 餘裕不足`、`右側空白過多`、`內距不足`、`行高不足`、`垂直不平衡` | 照 → 給的寬度、高度或位移改；框寬用 `width: max-content`；字級用 kit 的 `.sc-tNN` class，不縮字（內距容許 2 px：差 ≤ 2 px 不報） | 回報保留理由 |
| `⚠ … 同一秒新元素太多`、`間隔太短` | stagger 改 0.5，或每個元素綁自己的句子 | 回報保留理由 |
| `⚠ … 完成態停太短` | 下一拍綁晚一點的句子；中間步驟改用「上一拍 + 秒數」，不要另外綁句（量的是兩拍之間畫面最長的一段靜止，拍前就開始的動作算到它結束為止） | 回報保留理由 |
| `⚠ … 綁句對不上：「…」在 #M 才講到、不是 #N` | 照 → 把那個常數改成 `P.at('#M@詞')`（站名、項目在哪一句講到就綁哪一句的那個詞）；字幕那句真的是別的意思就保留，回報寫理由 | 回報保留理由 |
| `⚠ 畫面沒有變化：<段> 在 <t1>–<t2> 畫面 <q>s 沒有變化（口播 #N–#M 在講；上限 6s）` | 照 → 補一拍綁 `P.at('#K@詞')`（詞換成 #K 講到的站名、項目、數字，讓那一刻有東西出現、亮起或換數字）；補不出來就請主代理在 #K 拆成兩段 | 回報保留理由 |
| `⚠ … 最後一幕太短` | 請主代理把 plan.json 這段的 `to` 往後延訊息給的秒數 | 回報保留理由 |
| `✖ … 分鏡第 N 拍 #…（…）在 x-….html 找不到對應的 P.at…` | 照 → 在 script 開頭加那一拍的 `const T<k> = P.at('#N@詞')`，照分鏡「動態」欄做這一拍 | 停下來，把原文交回主代理（分鏡寫錯要使用者在停點 ③ 重看） |
| `✖ … P.at('#…')（…）不在分鏡表…` | 這一下不是分鏡的拍：改用「上一拍 + 秒數」接，或刪掉 | 交回主代理問使用者要不要加一拍 |
| `✖ … 動態「…」不在語彙表…`、`✖ 分鏡表表頭不對…`、`⚠ 沒有動畫分鏡：…` | 分鏡表的問題，不是動畫檔的：原文交回主代理改 storyboard.md（`auto-edit-storyboard` 步驟 5） | — |
| `⚠ 分鏡用了「…」，… 裡沒有 P.…(…)` | 照 → 在那一拍加那個 `P.*`（對應看 BEATS.md §2） | 回報保留理由 |
| `✖ … P.sfx(…)：音效名與 ref 要寫成字串字面值、off 寫數字…`、`✖ … P.sfx('…', '#…')：kit/sfx.json 沒有「…」這顆音效 → 改成 …` | 照 → 改成字面值，或換成它列的音效名 | 停下來回報 |
| `⚠ … P.sfx('…', '#…') 在 …，不在這段 …–… 裡，已拿掉 → 改綁這段裡的句子` | 照 → 改綁這段範圍內的句號 | 回報保留理由 |

同一條 ⚠ 改兩次還在：停下來，把那一行原文和 snapshot 給主代理（使用者決定）。audit 的完整訊息清單：`node shared/template/tools/audit.mjs --help`。

## 工具呼叫預算

每段最多 18 次（AGENTS.md「階段預算」）。超過就停下來，把卡住的 ✖ 原文交回主代理。

## 回報格式

照 `references/worker-report.md`（最多 25 行）：檔案路徑＋`ls -l` 一行、用到的 `P.at('#N…')` 清單、`--check` 與 audit 結果原文、還留著的 ⚠ 與理由、「我沒有改的東西」。

## 什麼時候讀 references/

- `references/worker-brief.md`：主代理要派子代理時才讀；`references/worker-report.md`：步驟 7 回報時才讀。
- `references/illus-worker.md`：示意動畫 S1 要派素材工人畫新元件時才讀。

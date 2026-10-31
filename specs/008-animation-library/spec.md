# 008 動畫庫：首批 8 支實作規格

日期：2026-10-31。依據：`research.md` §4。給移植工人照做：每人 1–2 支，產出放 `specs/008-animation-library/staging/x-<名稱>.html`，003 驗收後搬進 `shared/template/custom/`。

| 序 | 檔名 | 版面 | 取代／覆蓋 | 靈感 slug（詳見 research.md §2） |
|---|---|---|---|---|
| 1 | `x-checklist` | fullscreen | 04a、打勾完成清單 | koushikde-937635、mattbean-917572、n01ennn-597182 |
| 2 | `x-timeline` | fullscreen | 04a、時間軸、本集大綱 | rpa-dake-593915、kloss-xyz-067876、airobertdaily-416945 |
| 3 | `x-versus` | fullscreen | 比較（A vs B 動態版） | n01ennn-597182、dys-hay-749645、threeaus-886343 |
| 4 | `x-stack` | fullscreen | 13、架構堆疊 | techhalla-498547、gdgtify-130294、0xlangeai-597929 |
| 5 | `x-fix` | fullscreen | 04a、問題→解法翻轉 | techhalla-498547、alex-prompter-997524、0xlangeai-597929 |
| 6 | `x-callout` | fullscreen | 12 | stokebuilder-356793、heyiamnick-119558 |
| 7 | `x-ring` | fullscreen | 百分比／進度環、計時、倒數 | 0xnicc0-516612、twoclipping-747965、dys-hay-749645 |
| 8 | `x-trend` | fullscreen | 成長／下降趨勢 | annacher-433425、nummanali-340931、twoclipping-747965 |

授權：只移植技法、自己寫碼；不得複製靈感來源的程式、文案、配色、素材。~~每支檔頭**不**寫靈感來源~~（2026-10-31 作廢）：檔頭保留一行「靈感（只借技法）：slug／作者／網址」；003 搬進 custom 時同一份清單記進 `NOTICE.md`「008 情境動畫的靈感來源」一節（只借技法、自己寫碼）。

---

## 0. 共同規則（8 支都照做；和 USAGE-reference R7.2–R7.6、R8 相同的不再重述）

### 0.1 檔案與骨架

- 照 R7.3 骨架：`<head>` 只有 `<meta charset>` 與 `<title>`；`<style>`、畫面、`<script>` 都在 `<template id="x-<名稱>-template">` 裡；root 是 `<div id="x-<名稱>" data-composition-id="x-<名稱>" data-width="1920" data-height="1080" data-duration="<sample D>" data-cues-sample='…'>`。
- `$q` 與兩行 `forEach` 照抄 `shared/template/custom/x-process.html`（含 `'type'` 與 `'focus'`）。
- id／class 前綴用下表的「短名」；所有 CSS 選擇器前面加 `#x-<名稱> `。

  | 檔名 | 前綴 | 句號區段（data-cues-sample） |
  |---|---|---|
  | x-callout | `xcall-` | #101–#105 |
  | x-stack | `xstk-` | #111–#115 |
  | x-checklist | `xchk-` | #121–#125 |
  | x-timeline | `xtl-` | #131–#135 |
  | x-versus | `xvs-` | #141–#145 |
  | x-trend | `xtr-` | #151–#154 |
  | x-ring | `xring-` | #161–#164 |
  | x-fix | `xfix-` | #171–#175 |

- 檔頭固定 6 小節，順序：`【適用的口播】`、`【不要用在哪裡】`、`【要改的地方】`、`【綁句欄位】`、`【D 下限】`、`【版面】`（003 FR-021）。下面每支的「檔頭草稿」可以直接貼進 `<!doctype html>` 之後的註解；註解第一行寫 `x-<名稱>：<一句話>（第二層 custom，layout: "fullscreen"）`。
- `【D 下限】`的最後一條一律寫成 `D ≥ <最後一個常數> + <秒數>`（examples.test 會解析這個格式），後面接 `結尾寫 P.end()（不帶參數）…` 那一行（照 x-process 原文）。
- **文字寫在 HTML、數字只寫一次**：要計算長度、比例、位置的數字放在 `<script>` 開頭、`P.at` 那幾行下面的一個常數（`DATA`／`RING`／`X`），寬度、比例、座標由 script 算；檔頭寫明「只改這一行的數字」。例外只有 `x-trend` 的時間標籤（和數值成對，放在 `DATA`）。
- 綁句一律 `P.at('#N@詞')`（F4：主文字出現＝講到那個詞，差 ≤ 0.5 秒）；檔頭照新版 x-process 的四句寫法（@詞 用字串字面值、詞剛好在句首才寫 `#N`、要晚一點加第二個參數、audit 會印 ⚠ 綁句對不上）。
- 禁止：`onUpdate`／`onComplete`／`requestAnimationFrame`／`Date.now`／`setInterval`／`setTimeout`／`Math.random`、`<img>`、`<canvas>`、外部字型與 `font-family` 字面名、任何色碼（只用 `var(--brand)`、`var(--sc-*)`）、`will-change`、`display:none` 藏後出現的元素（用 opacity）、非 90 度旋轉、`const D =`、數字 `P.end(…)`。
- script 動態產生 DOM（只有 x-trend）：在建立任何 tween **之前**一次產生完，id 用固定格式（`xtr-b0…`），不讀版面量測值（不用 `getBoundingClientRect`、`offsetWidth`），只用 `DATA` 與寫死的常數算座標，保證每次載入結果相同。

### 0.2 共用幾何（fullscreen）

全部 8 支用同一個主卡，和 x-process 相同：

- 主卡 `#<前綴>card.sc-wcard`：left 120、top 150、width 1180（右緣 1300，避開子母畫面禁入區 x 1424–1888、y 581–951）。
- 標題列 `.sc-wcard__bar`：height 128、padding 20px 56px，裡面 `<span class="sc-opt">標題</span>`（≤ 10 字）。
- 內容區 `#<前綴>body`：position relative、1176×580。**以下所有座標都是內容區座標**（原點約在畫面 x 122、y 280）。卡底 862，內容 150–862，垂直平衡差 22（< 40，不報）。
- 字級：正文 `.sc-t52`（行高 72）以上、標籤 `.sc-t40` 以上、大數字 `.sc-t72`／`.sc-t112`；框的內距左右 ≥ 24、上下 ≥ 16（52 px 字的下限 14.56，留 1.4 px 餘裕）。
- 顏色 token：卡內格子底 `--sc-fs-node`、格子框 `--sc-fs-node-line`、線 `--sc-fs-line`、字 `--sc-fs-ink`、次要字 `.sc-gray`／`--sc-fs-mute`、關鍵詞 `--sc-fs-kw`、主色 `--brand`、警示 `--sc-warn`／`--sc-on-warn`、完成 `--sc-good`、亮起底色 `--sc-fs-tint`。整塊的底（軌道、輸家條、還沒輪到的柱）用 `--sc-fs-node-line`，不用 `--sc-fs-line`：`--sc-fs-line` 在深色主題是 86% 白，當整塊底太亮、主色進度疊上去看不出來；`--sc-fs-line` 只給描線（軸、地基線、框）。（2026-10-31 x-versus 工人提出，003 採用；x-checklist 的進度軌道已照改）
- 自畫的線 ≥ 4 px、座標整數 px。

### 0.3 共用節奏

- 0.5 秒前不動；`P.reveal(card, 0.5)`。
- 總覽階段的新元素每 0.5 秒一個；任何 1 秒窗新元素 ≤ 2 個；描線（`P.stroke`／`P.icon`）、亮框（`P.focus` 的 ring、疊在父元素上的 inset 層）、`P.bar`／`P.morph`／`P.count` 都不算新元素（audit FR-051）。
- 每一拍：新元素出現 → 0.15 秒（`P.BEAT`）後圖示描線 → 停 ≥ 1.2 秒才到下一拍；最後一幕停 ≥ 1.5 秒＋ build 淡出 0.5 秒。
- 「相鄰 ≥ N 秒」的 N＝這一拍最後一個動作結束的時刻－拍點＋1.2，四捨五入到 0.1 秒（下面每支都列推導）。

### 0.4 共用驗收（每支都要過；各支另有「本支驗收」）

1. **結構**（examples.test 會測，請 003 把 9 支擴到 17 支）：6 小節順序對；沒有 `const D =`、沒有數字 `P.end(`；至少 2 個 `P.at(`；每個 `P.at('…')` 字面值都能從 `data-cues-sample` 算出（`#N` 在 `cues`、`#N@詞` 在 `refs`）；sample 的 D 與相鄰拍間距滿足檔頭的數字；句號落在 §0.1 的區段。
2. **grep 0 筆**：`sed -E "s/[\"']#[0-9]{1,3}e?(@[^\"']*)?[\"']//g" x-<名稱>.html | grep -nE "onUpdate|onComplete|requestAnimationFrame|Date\.now|setInterval|setTimeout|Math\.random|<img|<canvas|font-family:|#[0-9A-Fa-f]{3,6}\b|will-change|const D ="`（前面的 `sed` 先拿掉引號裡的句號 `'#121@詞'`、`"#125"`、`'#62e'`，三位數句號才不會被當成色碼；行號不變。id 選擇器的 `#` 後面接字母前綴，不會被誤抓。限制：引號裡 1–3 位純數字的色碼（`'#111'`）也會被拿掉，色碼一律寫 `var(--…)`；若誤抓逐行說明）。
3. **預覽**：003 跑 `node shared/template/tools/build.mjs --gallery` 後，打開 `shared/template/preview/x-<名稱>.html?t=<秒>`，看「本支驗收」列的每個時刻。
4. **audit**：放進整合專案（003 FR-072 那一份）跑 `node shared/template/tools/audit.mjs --project <整合專案> --only <段>`：**0 ✖**；版面規則與節奏規則 **0 ⚠**（有 ⚠ 要在交件回報逐條說明為什麼保留）。
5. **亂序截圖**：`npx hyperframes snapshot --at <完成態>,<第一拍+1>,<中間拍+1>`，和照時間順序截的同名圖逐像素相同（FR-036）。
6. **弱模型試填**（003 收件後、001 寫 SITUATIONS 前）：只給 Sonnet 檔頭＋範例專案的一段字幕（各支的「試填題」），它只改「要改的地方」列的東西就能過 1、4。

交件回報（工人 → 主代理，≤ 25 行）：檔案路徑、綁了哪幾句（`P.at` 原文）、`?t=` 看了哪幾格、audit 結果原文的統計行、亂序截圖是否相同、有保留的 ⚠ 與理由。

---

## 1. `x-checklist`：打勾完成清單

### 1.1 檔頭草稿

```
x-checklist：打勾完成清單（第二層 custom，layout: "fullscreen"；先畫空框，講到哪項寫出來、打勾，進度條跟著走）

【適用的口播】
在講一組「要確認／要完成的事」，2–4 項、一項一句或一個詞，例如「包含新增專案、下載 APP、配對手機、調整解析度等細節」。
畫面一開始只有空框和橫線（看得出有幾項，但字還沒出來），講到哪一項，那一項的字浮出、框裡描出勾，底下的進度條和「2 / 4」跟著前進；
講到「這樣就全部好了」時進度條換成完成色（選用）。

【不要用在哪裡】
- 回顧剛剛講過的重點（總結、回顧）：用 11 總結字卡。
- 有先後順序、每一步是一個動作的流程：用 x-process 或 04c（流程的站不打勾）。
- 是警告、注意事項：用 x-warnings 或 07 tone: warn。
- 超過 4 項：拆兩段，或用 04a。只有 1 項：不下卡。

【要改的地方】
1. 文字：標題列（≤ 10 字）、四個 .xchk-t 的項目文字（每項 ≤ 14 字，動詞放前面）。
2. 綁句：<script> 開頭 T 陣列的句號與詞、ALL 的句號（見【綁句欄位】）。
項數不是 4：刪掉最後幾列的 .xchk-row（整個 div）、svg 裡同號的 xchk-rule／xchk-box／xchk-boxon／xchk-k，和 T 陣列最後幾個；
進度條的分母、「/ 4」的數字會自動跟著項數變，不用改。

【綁句欄位】
T = [ P.at('#121@新增專案'), P.at('#122@下載'), P.at('#123@配對手機'), P.at('#124@調整解析度') ]：講到那一項「項目詞」的時刻，那一項的字浮出，0.3 秒後打勾、進度前進一格。
ALL = P.at('#125')：講到「全部完成／都好了」那一句，進度條換成完成色。沒有這句就刪掉 ALL 那兩行。
項目詞在句中間或句尾時一定用 @詞，不要綁句首（綁句首，字會比講到早 1–3 秒出來）；項目詞剛好是那句的第一個詞才寫 P.at('#122')。
「@詞」要寫成字串字面值（P.at('#122@下載')，不要用變數組字串），build 才算得到；要再晚一點加第二個參數：P.at('#122@下載', 0.3)。
相鄰兩項至少差 2.1 秒（字浮出 0.5 秒、0.3 秒後打勾、進度條 0.6 秒＝忙到 0.9 秒，再停 1.2 秒）；太近就綁後面一句，或把兩項合併成一項。
audit 會比對：這一拍出現的字（項目）在別句才講到時，印 ⚠ 綁句對不上，照它給的 P.at 改。

【D 下限】
T[0] ≥ 2.2（卡片 0.5 秒、空框與橫線從 1.0 秒起每 0.15 秒描一列，2.15 秒描完）
T[i+1] ≥ T[i] + 2.1
ALL ≥ 最後一項 + 2.1
D ≥ ALL + 2.5（完成色 0.5 秒＋最後一幕停 1.5 秒＋build 加的淡出 0.5 秒；沒有 ALL 時 D ≥ 最後一項 + 2.9；D＝plan.json 這段的長度）
結尾寫 P.end()（不帶參數），長度自動等於 plan.json 這段的長度；root 的 data-duration 只給單獨開檔時用。

【版面】
fullscreen：整段淡入淡出 0.5 秒由 build 處理；0.5 秒前不動。主卡 left 120、top 150、寬 1180（右緣 1300），標題列 128、內容區 1176×580。
四列每列高 112（top 12／124／236／348）：空框 56×56 在 x 56、列頂 +28；項目字 left 144、列頂 +20；橫線在列底（y 124／236／348／460），x 56–1120。
進度區 top 492：軌道 left 56、寬 800、高 24（y 516–540）；計數 x 896–1120 靠右。項目字放不下就縮文案，不縮字。
```

### 1.2 DOM 草圖

```
#x-checklist（root；data-duration="14"；data-cues-sample 見 1.5）
├─ .sc-surface-fs.fill
└─ #xchk-card.sc-wcard（left 120, top 150, w 1180）
   ├─ .sc-wcard__bar（h 128, padding 20 56）> span.sc-opt「操作前的準備」
   └─ #xchk-body（relative, 1176×580）
      ├─ svg#xchk-lines（absolute 0,0；1176×580；viewBox 0 0 1176 580）
      │   ├─ line#xchk-rule1..4.xchk-rule   x1 56 x2 1120，y＝124／236／348／460；stroke --sc-fs-line 4
      │   ├─ rect#xchk-box1..4.xchk-box     x 58, y＝42／154／266／378（列頂+30），52×52，rx 12；stroke --sc-fs-line 4，fill none
      │   ├─ rect#xchk-boxon1..4.xchk-boxon 同 box 座標；stroke --brand 6（打勾時描出＝框變主色）
      │   └─ path#xchk-k1..4.xchk-tick      "M70 69 L80 79 L98 58"（第 1 列；第 i 列 y 再加 112×(i−1)）；stroke --brand 6、round
      ├─ div.xchk-row#xchk-row1..4（absolute left 0, top 12＋112×(i−1), 1176×112；只是定位用的透明容器）
      │   └─ span#xchk-t1..4.sc-t52.sc-w900.sc-opt（absolute left 144, top 20；white-space nowrap）「新增專案」
      └─ #xchk-prog（absolute left 56, top 492, 1064×72）
          ├─ #xchk-track（absolute left 0, top 24, 800×24, radius 12, bg --sc-fs-node-line）
          │   ├─ #xchk-fill（absolute inset 0, radius 12, bg --brand；scaleX 由 P.bar 控制）
          │   └─ #xchk-fillok（absolute inset 0, radius 12, bg --sc-good, opacity 0）
          └─ span#xchk-n.sc-t52.sc-w900（absolute right 0, top 0, width 224, text-align right）「0 / 4」
```

script 開頭（數字與綁句只寫這裡）：

```
const T = [ P.at('#121@新增專案'), P.at('#122@下載'), P.at('#123@配對手機'), P.at('#124@調整解析度') ];
const ALL = P.at('#125');
const N = T.length;   // 項數＝T 的個數（刪列時 T 也刪，N 自動對）
```

### 1.3 時間軸分鏡

| 時刻 | 誰 | 怎麼動 | P.* |
|---|---|---|---|
| 0.5 | 主卡 | 遮罩揭開 | `P.reveal('#xchk-card', 0.5)` |
| 1.0 | 四條橫線、四個空框 | 每列錯開 0.15 秒描出（不算新元素） | `P.stroke('.xchk-rule', 1.0, {stagger: 0.15})`、`P.stroke('.xchk-box', 1.0, {stagger: 0.15})` |
| 1.0 | 進度區（軌道＋「0 / 4」） | 淡入（新元素 1） | `P.in('#xchk-prog', 1.0)` |
| T[i] | 第 i 項文字 | 淡入＋上漂 8（新元素 1） | `P.rise('#xchk-t'+(i+1), T[i])` |
| T[i]+0.3 | 框變主色、勾描出 | 0.4 秒 | `P.stroke('#xchk-boxon'+(i+1)+', #xchk-k'+(i+1), T[i]+0.3, {dur: 0.4})` |
| T[i]+0.3 | 計數 | i → i+1，0.4 秒 | `P.count('#xchk-n', T[i]+0.3, {from: i, to: i+1, dur: 0.4, suffix: ' / ' + N})` |
| T[i]+0.3 | 進度條 | i/N → (i+1)/N，0.6 秒 | `P.bar('#xchk-fill', T[i]+0.3, {from: i/N, to: (i+1)/N, dur: 0.6})` |
| ALL | 完成色 | 疊層淡入（變化） | `P.in('#xchk-fillok', ALL)` |
| — | 收尾 | | `P.end()` |

用 `for (let i = 0; i < N; i++) { … }` 寫 T[i] 那四行（迴圈裡不呼叫 `P.at`）。

### 1.4 slots

| 欄位 | 在哪 | 上限 | 範例 |
|---|---|---|---|
| 標題 | `.sc-wcard__bar` | ≤ 10 字 | 操作前的準備 |
| 項目 ×2–4 | `#xchk-t1..4` | ≤ 14 字（728 px，止於 x 872） | 新增專案／下載 APP／配對手機／調整解析度 |
| 綁句 | `T`、`ALL` | 每項一個 | 見檔頭 |

文字欄 ≤ 5；沒有圖示欄（勾就是圖示）。

### 1.5 綁句與 D 下限

- 推導：空框 1.0 + 3×0.15 + 0.7 = 2.15 → T[0] ≥ 2.2；每拍忙到 T+0.3+0.6 = T+0.9，+1.2 → 2.1；ALL 0.5＋1.5＋0.5 = 2.5。
- sample：`{"start":0,"D":14,"cues":{"121":[2.2,4.4],"122":[4.5,6.6],"123":[6.7,8.8],"124":[8.9,11],"125":[11.2,13.5]},"refs":{"#121@新增專案":2.4,"#122@下載":4.6,"#123@配對手機":6.8,"#124@調整解析度":9.0}}`（T 間距 2.2、ALL 11.2 ≥ 9.0+2.1、D 14 ≥ 11.2+2.5）。

### 1.6 本支驗收

- `?t=1.6`：四條線、四個空框正在描；`?t=2.2`：全部描完、進度「0 / 4」、沒有任何項目字。
- `?t=5.6`：第 1、2 項有字、框主色、勾完整（勾的三個點不缺角）；第 3、4 項只有空框；進度條一半、「2 / 4」。
- `?t=13.5`（完成態）：四項全勾、「4 / 4」、進度條完成色、計數數字寬度不抖（tabular）。
- 刪成 3 項（試填題）：「3 / 3」、進度三等分，不用改 script 主體。
- 試填題：範例專案 #66–#67「包含新增專案、下載 APP、配對手機、調整解析度等細節」，四項各綁 `#66@新增專案`、`#66@下載`、`#66@配對手機`、`#67@調整解析度`；若相鄰 < 2.1 秒，弱模型應照檔頭改成合併或綁後句。

---

## 2. `x-timeline`：時間軸／歷史演進／本集大綱

### 2.1 檔頭草稿

```
x-timeline：時間軸逐點前進（第二層 custom，layout: "fullscreen"；也用在「本集分成幾個部分」）

【適用的口播】
在講「有時間先後的 3–4 個點」：年份、版本、階段，或「這集分成三個部分，先…接著…最後…」。
畫面一開始只有一條橫軸和幾個空心點；講到哪個時間點，主色進度沿著軸走到那個點、點填滿，點上方浮出卡片（圖示＋年份或序號），下方一行說明。
目前這一點的卡片有主色框；下一點亮起時框移走，走過的點保持實心。

【不要用在哪裡】
- 沒有先後的並列項目：用 x-callout、12 或 04a。
- 每一站是一個動作、要看出「做完這步才做下一步」：用 x-process 或 04c。
- 超過 4 個點：拆兩段；年份加說明都很長（說明 > 8 字）：縮文案，放不下就改 04a。
- 「以前 vs 現在」只有兩個點：用 04b 或 x-before-after。

【要改的地方】
1. 文字：標題列（≤ 10 字）；每個點的 .xtl-lab（4 位數字的年份，或 ≤ 2 個字；大綱用 01／02／03 不用改）；
   每個點的 .xtl-cap 說明（≤ 8 字，每行 ≤ 4 字，用 <br> 斷在語意處，最多 2 行）。
2. 圖示：每個點 .sc-icon 裡的 svg。到 kit/icons.json 找名稱，把 svg 原文貼上（拿掉 class、width、height）。
3. 綁句：<script> 開頭 T1–T4 的句號與詞（見【綁句欄位】）。
點數是 3：照【版面】的「3 點」那一列改 CSS 的 left、width 與 script 的 X，刪第 4 點的卡片、說明、兩個圓點與 T4。

【綁句欄位】
T1 = P.at('#131@2019')、T2 = P.at('#132@2022')、T3 = P.at('#133@2024')、T4 = P.at('#134@今年')：講到那個時間點（年份、「第一部分」「接著」「最後」後面那個詞）的時刻，
進度走到那個點、卡片和說明出現；進度在 T 之前 0.4 秒出發，剛好在 T 到點。
時間詞在句中間或句尾時一定用 @詞，不要綁句首；剛好是那句的第一個詞才寫 P.at('#132')。
「@詞」要寫成字串字面值（P.at('#132@2022')，不要用變數組字串），build 才算得到；要再晚一點加第二個參數：P.at('#132@2022', 0.3)。
相鄰兩點至少差 2.5 秒（卡片 0.5 秒、說明晚 0.15 秒、圖示描線到 0.85 秒，停 1.2 秒，下一段進度提早 0.4 秒出發）。
audit 會比對：這一拍出現的字（年份、說明）在別句才講到時，印 ⚠ 綁句對不上，照它給的 P.at 改。

【D 下限】
T1 ≥ 2.1（卡片 0.5 秒、橫軸 1.0 秒起描 0.7 秒，第一段進度 T1 − 0.4 出發要在 1.7 秒之後）
T2 ≥ T1 + 2.5；T3 ≥ T2 + 2.5；T4 ≥ T3 + 2.5
D ≥ T4 + 2.9（圖示描完 0.85 秒＋最後一幕停 1.5 秒＋build 加的淡出 0.5 秒；D＝plan.json 這段的長度）
結尾寫 P.end()（不帶參數），長度自動等於 plan.json 這段的長度；root 的 data-duration 只給單獨開檔時用。

【版面】
fullscreen：整段淡入淡出 0.5 秒由 build 處理；0.5 秒前不動。主卡 left 120、top 150、寬 1180，標題列 128、內容區 1176×580。
橫軸 y 300、x 56–1120；點的中心 x（script 的 X）：
  4 點：X = [168, 448, 728, 1008]，卡片與說明寬 256、left = X − 128；
  3 點：X = [196, 588, 980]，卡片與說明寬 320、left = X − 160（說明每行可到 5 字）。
卡片 top 20、高 252（圖示 88＋年份 72 字）；說明 top 336、置中、行高 72。卡片底 272 離軸 28，說明離軸 36。
```

### 2.2 DOM 草圖

```
#x-timeline（root；data-duration="13"）
├─ .sc-surface-fs.fill
└─ #xtl-card.sc-wcard（left 120, top 150, w 1180）
   ├─ .sc-wcard__bar > span.sc-opt「我的拍片歷程」
   └─ #xtl-body（relative, 1176×580）
      ├─ svg#xtl-track（absolute 0,0；1176×580）> line#xtl-axis  x1 56 y1 300 x2 1120 y2 300；stroke --sc-fs-line 8、round
      ├─ #xtl-fill（absolute left 56, top 296, 1064×8, radius 4, bg --brand；scaleX 由 P.bar 控制，起始 0）
      ├─ svg#xtl-dots（absolute 0,0；1176×580；疊在 fill 上面）
      │   ├─ circle#xtl-dot1..4.xtl-dot   cx＝X[i], cy 300, r 14；stroke --sc-fs-line 6、fill --sc-fs-card（空心點）
      │   └─ circle#xtl-don1..4.xtl-don   cx＝X[i], cy 300, r 7；stroke --brand 14、fill none（描完＝實心點）
      ├─ div#xtl-n1..4.xtl-node（absolute left X−128, top 20, 256×252；border 4 --sc-fs-node-line、radius 20、bg --sc-fs-node；
      │   │                       flex column、center、gap 16）
      │   ├─ i#xtl-on1..4.xtl-on（absolute inset −4, border 4 --brand, radius 20；目前這一點的框）
      │   ├─ span#xtl-ico1..4.sc-icon（--d 88px; --i 48px）> svg（icons.json：clapperboard／smartphone／video／bot 之類）
      │   └─ span.xtl-lab.sc-t72.sc-w900.sc-opt「2019」
      └─ div#xtl-c1..4.xtl-cap.sc-t52.sc-w700.sc-opt（absolute left X−128, top 336, width 256, text-align center）「開始<br>拍片」
```

script 開頭：

```
const T1 = P.at('#131@2019'), T2 = P.at('#132@2022'), T3 = P.at('#133@2024'), T4 = P.at('#134@今年');
const T = [T1, T2, T3, T4];
const X = [168, 448, 728, 1008];                 // 點的中心 x；3 點改成 [196, 588, 980]
const F = X.map(function (x) { return (x - 56) / 1064; });   // 進度條要走到的比例（自動算）
```

### 2.3 時間軸分鏡

| 時刻 | 誰 | 怎麼動 | P.* |
|---|---|---|---|
| 0.5 | 主卡 | 揭開 | `P.reveal('#xtl-card', 0.5)` |
| 1.0 | 橫軸 | 描線 0.7 | `P.stroke('#xtl-axis', 1.0)` |
| 1.2 | 空心點 ×4 | 每 0.15 描一個 | `P.stroke('.xtl-dot', 1.2, {stagger: 0.15})` |
| T[i]−0.4 | 進度 | 從上一點的比例走到這一點，0.4 | `P.bar('#xtl-fill', T[i]-0.4, {from: i ? F[i-1] : 0, to: F[i], dur: 0.4})` |
| T[i] | 實心點 | 描 0.3（粗描邊填滿） | `P.stroke('#xtl-don'+(i+1), T[i], {dur: 0.3})` |
| T[i] | 卡片 | 淡入＋上漂（新元素 1） | `P.rise('#xtl-n'+(i+1), T[i])` |
| T[i] | 目前框 | 這一點淡入、上一點淡出 | `P.in('#xtl-on'+(i+1), T[i])`；`i>0` 時 `P.out('#xtl-on'+i, T[i])` |
| T[i]+0.15 | 圖示、說明 | 描線；說明淡入＋上漂（新元素 2） | `P.icon('#xtl-ico'+(i+1), T[i]+P.BEAT)`、`P.rise('#xtl-c'+(i+1), T[i]+P.BEAT)` |
| — | 收尾 | | `P.end()` |

`.xtl-on` 的 opacity 由 `P.in` 第一次 tween 設成 0（immediateRender），CSS 不用先藏；`P.out` 是同一元素第二次 tween（SceneMotion 自動處理）。

### 2.4 slots

| 欄位 | 在哪 | 上限 | 範例 |
|---|---|---|---|
| 標題 | `.sc-wcard__bar` | ≤ 10 字 | 我的拍片歷程 |
| 說明 ×3–4 | `.xtl-cap` | ≤ 8 字、每行 ≤ 4 字（3 點 ≤ 5 字） | 開始拍片／改用手機／多機錄影／交給 AI |
| 標籤 ×3–4（選填） | `.xtl-lab` | 4 位數字或 ≤ 2 字 | 2019／01 |
| 圖示 ×3–4 | `.sc-icon` | icons.json 名稱 | clapperboard、smartphone |
| 綁句 | `T1..T4` | | 見檔頭 |

「本集大綱」變體：標籤固定 01／02／03（不改），弱模型只改標題＋說明＋圖示＋句號（文字欄 4）。

### 2.5 綁句與 D 下限

- 推導：軸 1.0+0.7 = 1.7，T1−0.4 ≥ 1.7 → T1 ≥ 2.1；每拍忙到 T+0.15+0.7 = T+0.85，停 1.2，下一段進度提早 0.4 → 0.85+1.2+0.4 = 2.45 → 2.5；最後 0.85＋1.5＋0.5 = 2.85 → 2.9。
- sample：`{"start":0,"D":13,"cues":{"131":[2,4.5],"132":[4.6,7.1],"133":[7.2,9.7],"134":[9.8,12.5]},"refs":{"#131@2019":2.2,"#132@2022":4.8,"#133@2024":7.4,"#134@今年":10.0}}`（間距 2.6、D 13 ≥ 10.0+2.9）。

### 2.6 本支驗收

- `?t=1.7`：只有軸與空心點，沒有卡片、沒有進度（sample T1＝2.2，第一段進度 T1 − 0.4＝1.8 出發；原寫 1.9 時進度已經在動）。
- `?t=6.0`：進度停在第 2 點（點的圓心，誤差 ≤ 2 px）；第 1、2 點實心，第 2 張卡有主色框、第 1 張沒有；第 3、4 點空心。
- `?t=12.5`（完成態）：四張卡、四行說明、進度停在第 4 點；說明與卡片都不壓到軸（卡底 272、說明頂 336；實作卡片下移到 top 72 避開 24 px 下限，卡底 328、說明頂 392，以檔頭【版面】為準）。
- 3 點變體：照【版面】改完，`?t=` 完成態三張卡等距、右側空白 ≤ 80（卡寬 320 置中）。
- 試填題：範例專案 #64–#71（本集三個部分）用 3 點大綱變體，T1 = `P.at('#65@實際操作')`、T2 = `P.at('#68@安裝工具')`、T3 = `P.at('#70@AI Coding')`（取代 s23 的 04a）。

---

## 3. `x-versus`：A vs B 動態比較（蝴蝶長條）

### 3.1 檔頭草稿

```
x-versus：A vs B 逐項比較（第二層 custom，layout: "fullscreen"；蝴蝶長條，數字同步計數）

【適用的口播】
在講「兩個選項在 2–3 個面向上比」，每個面向有數字，例如「手動剪要 180 分鐘、AI 只要 20 分鐘；手動 6 個步驟、AI 只剩 2 個」。
上方是兩個對手（圖示＋名稱），講到哪個面向，那一列出現：中間是面向名稱，A 的條往左長、B 的條往右長，數字同時跑；
贏的那一邊是主色、輸的是灰色。最後講結論時，贏家的標頭亮框（選用）。

【不要用在哪裡】
- 沒有數字，只是兩個名詞的特點對照：用 04b。
- 同一件事前後差多少（只有一個面向、要看「變成」的過程）：用 x-before-after。
- 超過 3 個面向或超過 2 個對手：用 04d 表格。
- 兩邊數字差 20 倍以上：小的那條會只剩 8 px，改成 x-numbers 或把單位換大。

【要改的地方】
1. 文字：標題列（≤ 10 字）、兩個標頭名稱 .xvs-hname（≤ 4 字）、每列面向名稱 .xvs-lab（≤ 4 字，單位寫進去，例「分鐘」「步驟數」「月費」）。
2. 圖示：兩個標頭的 .sc-icon。到 kit/icons.json 找名稱，把 svg 原文貼上（拿掉 class、width、height）。
3. 數字：只改 <script> 開頭 DATA 那一行：每列 { a: A 的數字, b: B 的數字, win: 'a' 或 'b' }；最後 WINNER 寫 'a' 或 'b'。條的長度、顏色由程式算，不用改 CSS。
4. 綁句：<script> 開頭 T1–T3、WIN 的句號與詞（見【綁句欄位】）。
面向是 2 個：刪掉第 3 列（#xvs-r3 整個 div）、DATA 的第 3 個、T3 那一行；最後一拍改成 T2。

【綁句欄位】
T1 = P.at('#141@分鐘')、T2 = P.at('#142@步驟')、T3 = P.at('#143@月費')：講到那個面向的時刻，那一列出現，0.15 秒後兩條同時長、數字同時跑。
WIN = P.at('#144@AI')：講到結論（「所以 AI 完勝」）時，贏家標頭亮框。沒有結論句就刪掉 WIN 那兩行。
面向詞在句中間或句尾時一定用 @詞，不要綁句首；剛好是那句的第一個詞才寫 P.at('#142')。
「@詞」要寫成字串字面值（P.at('#142@步驟')，不要用變數組字串），build 才算得到；要再晚一點加第二個參數：P.at('#142@步驟', 0.3)。
相鄰兩列至少差 2.2 秒（列出現 0.5 秒、長條與數字 0.15 秒起跑 0.8 秒＝忙到 0.95 秒，再停 1.2 秒）。
audit 會比對：這一拍出現的字（面向名稱）在別句才講到時，印 ⚠ 綁句對不上，照它給的 P.at 改。

【D 下限】
T1 ≥ 2.0（卡片 0.5 秒、A 標頭 1.0 秒、B 標頭 1.5 秒）
T2 ≥ T1 + 2.2；T3 ≥ T2 + 2.2；WIN ≥ T3 + 2.2
D ≥ WIN + 2.5（亮框 0.5 秒＋最後一幕停 1.5 秒＋build 加的淡出 0.5 秒；沒有 WIN 時 D ≥ 最後一列 + 3.0；D＝plan.json 這段的長度）
結尾寫 P.end()（不帶參數），長度自動等於 plan.json 這段的長度；root 的 data-duration 只給單獨開檔時用。

【版面】
fullscreen：整段淡入淡出 0.5 秒由 build 處理；0.5 秒前不動。主卡 left 120、top 150、寬 1180，標題列 128、內容區 1176×580。
標頭 top 24、高 112：A x 56–528、B x 648–1120，中間 VS 圓 88（x 544–632）。三列 top 176／312／448、高 112：
A 數字 x 40–176（靠右）、A 條右緣固定在 x 428（最長 236，往左長）、面向名稱框 x 444–732、B 條左緣固定在 x 748（最長 236）、B 數字 x 1000–1136（靠左）。
條高 48、在列中線；每列較大的數字＝236 px，較小的照比例，最短 8 px。
```

### 3.2 DOM 草圖

```
#x-versus（root；data-duration="12"）
├─ .sc-surface-fs.fill
└─ #xvs-card.sc-wcard（left 120, top 150, w 1180）
   ├─ .sc-wcard__bar > span.sc-opt「手動剪 vs AI 剪」
   └─ #xvs-body（relative, 1176×580）
      ├─ div#xvs-ha.xvs-head（absolute left 56, top 24, 472×112；border 4 --sc-fs-node-line、radius 16、bg --sc-fs-node；
      │   │                   flex row center、gap 16）
      │   ├─ i#xvs-hon-a.xvs-on（absolute inset −4, border 4 --brand, radius 16）
      │   ├─ span#xvs-icoa.sc-icon.sc-icon--72 > svg（hand）
      │   └─ span.xvs-hname.sc-t52.sc-w900.sc-opt「手動剪」
      ├─ div#xvs-hb.xvs-head（absolute left 648, top 24, 472×112；同上，i#xvs-hon-b、span#xvs-icob（bot）、「AI 剪」）
      ├─ div#xvs-vs（absolute left 544, top 36, 88×88；圓、bg --sc-fs-ink、字 --sc-fs-card；sc-t40 sc-w900「VS」）
      │      ※ 主卡的一部分，跟主卡一起揭開，不另外進場
      └─ div#xvs-r1..3.xvs-row（absolute left 0, top 176／312／448, 1176×112；透明容器）
          ├─ span#xvs-na1..3.xvs-num.sc-t52.sc-w900（absolute left 40, top 20, width 136, text-align right）「0」
          ├─ i#xvs-ba1..3.xvs-bar（absolute right 748px, top 32, height 48, width 0, radius 8）  ← 右錨定，往左長
          ├─ div#xvs-l1..3.xvs-lab（absolute left 444, top 0, 288×112；border 4 --sc-fs-node-line、radius 16、bg --sc-fs-node；
          │                        flex center；span.sc-t52.sc-w900.sc-opt「分鐘」）
          ├─ i#xvs-bb1..3.xvs-bar（absolute left 748, top 32, height 48, width 0, radius 8）  ← 左錨定，往右長
          └─ span#xvs-nb1..3.xvs-num.sc-t52.sc-w900（absolute left 1000, top 20, width 136, text-align left）「0」
CSS：.xvs-bar.xvs-win { background: var(--brand) }、.xvs-bar.xvs-lose { background: var(--sc-fs-line) }；
     .xvs-num.xvs-win { color: var(--sc-fs-kw) }、.xvs-num.xvs-lose { color: var(--sc-fs-mute) }
```

script 開頭：

```
const T1 = P.at('#141@分鐘'), T2 = P.at('#142@步驟'), T3 = P.at('#143@月費'), WIN = P.at('#144@AI');
const T = [T1, T2, T3];
const DATA = [ { a: 180, b: 20, win: 'b' }, { a: 6, b: 2, win: 'b' }, { a: 0, b: 600, win: 'a' } ];   // 只改這一行的數字
const WINNER = 'b';
// 由 DATA 算：每列 w = Math.max(8, Math.round(v / Math.max(a, b, 1) * 236))；v 是 0 時 w = 0。
// 在建 tween 之前，依 win 給四個元素（兩條、兩個數字）加 xvs-win／xvs-lose class（靜態上色，不補間顏色）。
```

### 3.3 時間軸分鏡

| 時刻 | 誰 | 怎麼動 | P.* |
|---|---|---|---|
| 0.5 | 主卡（含 VS） | 揭開 | `P.reveal('#xvs-card', 0.5)` |
| 1.0 | A 標頭 | 淡入＋上漂；0.15 後圖示描線 | `P.rise('#xvs-ha', 1.0)`、`P.icon('#xvs-icoa', 1.0+P.BEAT)` |
| 1.5 | B 標頭 | 同上 | `P.rise('#xvs-hb', 1.5)`、`P.icon('#xvs-icob', 1.5+P.BEAT)` |
| T[i] | 第 i 列（名稱框＋兩個 0） | 淡入＋上漂（新元素 1，子元素併入） | `P.rise('#xvs-r'+(i+1), T[i])` |
| T[i]+0.15 | A 條、B 條 | 寬 0→w，0.8，power2.out | `P.morph('#xvs-ba'+(i+1), T[i]+P.BEAT, {width: wa}, {from: {width: 0}, dur: 0.8, ease: 'power2.out'})`；B 同 |
| T[i]+0.15 | 兩個數字 | 0→a、0→b，0.8 | `P.count('#xvs-na'+(i+1), T[i]+P.BEAT, {from: 0, to: a, dur: 0.8})`；B 同 |
| WIN | 贏家標頭 | 亮框淡入（變化） | `P.in('#xvs-hon-' + WINNER, WIN)` |
| — | 收尾 | | `P.end()` |

### 3.4 slots

| 欄位 | 在哪 | 上限 | 範例 |
|---|---|---|---|
| 標題 | `.sc-wcard__bar` | ≤ 10 字 | 手動剪 vs AI 剪 |
| A 名稱、B 名稱 | `.xvs-hname` | ≤ 4 字 | 手動剪／AI 剪 |
| 面向 ×2–3 | `.xvs-lab span` | ≤ 4 字（含單位） | 分鐘／步驟數／月費 |
| 圖示 ×2 | 標頭 `.sc-icon` | icons.json | hand、bot |
| 數字 | `DATA`、`WINNER` | 每個 ≤ 4 位數 | 見上 |
| 綁句 | `T1..T3`、`WIN` | | |

文字欄 ≤ 6。

### 3.5 綁句與 D 下限

- 推導：列 0.5、條與數字 0.15+0.8 = 0.95，+1.2 = 2.15 → 2.2；沒有 WIN：0.95＋1.5＋0.5 = 2.95 → 3.0；WIN：0.5＋1.5＋0.5 = 2.5。
- sample：`{"start":0,"D":12,"cues":{"141":[2,4.3],"142":[4.4,6.7],"143":[6.8,9.2],"144":[9.3,11.5]},"refs":{"#141@分鐘":2.2,"#142@步驟":4.6,"#143@月費":7.0,"#144@AI":9.4}}`（間距 2.4、D 12 ≥ 9.4+2.5）。

### 3.6 本支驗收

- `?t=1.9`：兩個標頭、VS，沒有任何列。
- `?t=5.8`：第 1 列 A 條 236 px（灰）、B 條 26 px（主色）、數字 180／20；第 2 列正在長或已停。
- `?t=11.5`（完成態）：三列；第 3 列 A 是 0（沒有條、數字 0、主色字），B 600 灰色 236 px；B 標頭主色框。
- 條的外緣固定：A 條右緣都在 x 428、B 條左緣都在 x 748（三列對齊，差 0 px）。
- 試填題：範例專案 #37–#40「單機 vs 多機」改成兩列（「啟動」：a 1 步、b 2 支要分開按；「同步」…）——若弱模型找不到數字，應照【不要用在哪裡】改用 04b，這也算通過。

---

## 4. `x-stack`：架構堆疊

### 4.1 檔頭草稿

```
x-stack：架構一層一層疊上去（第二層 custom，layout: "fullscreen"）

【適用的口播】
在講「由下往上的組成」：3–4 層、從底層講起，每層一個名稱＋一句說明，例如「最底層是手機上的錄影 App，中間靠區網連線，最上層是電腦端的控制台」。
畫面先畫出地基線；講到哪一層，那一層從上方落下就位（小幅、不彈），層內左邊圖示＋名稱、右邊說明；目前這一層有主色框。
講到「這幾層合起來…」時框全部拿掉（選用）。

【不要用在哪裡】
- 口播從最上層往下講：用 13 標題條列或 04a（這支第 1 個講到的永遠放最底層）。
- 各項之間沒有上下依賴、只是並列：用 13、x-callout 或 04a。
- 有先後順序的步驟：用 x-process。
- 超過 4 層：拆兩段。

【要改的地方】
1. 文字：標題列（≤ 10 字）；每層 .xstk-name 名稱（≤ 6 字）、.xstk-desc 說明（≤ 12 字，選填：不寫就刪掉那個 span，
   並在那一層的 .xstk-layer 加 data-layout-allow-slack（層要等寬，右邊是刻意留白；不加 audit 會報右側空白過多）。
2. 圖示：每層的 .sc-icon。到 kit/icons.json 找名稱，把 svg 原文貼上（拿掉 class、width、height）。
3. 綁句：<script> 開頭 T1–T4、ALL 的句號與詞（見【綁句欄位】）。
層數是 3：刪掉 #xstk-l4 與 T4，照【版面】「3 層」那一列改三層的 top；P.focus 的那幾行跟著刪最後一層。

【綁句欄位】
T1 = P.at('#111@手機')、T2 = P.at('#112@區網')、T3 = P.at('#113@控制台')、T4 = P.at('#114@剪輯')：講到那一層名稱的時刻，那一層落下，主色框移到這一層。
ALL = P.at('#115')：講到「合起來就是…」那一句，框全部拿掉。沒有這句就刪掉 ALL 那一行。
名稱在句中間或句尾時一定用 @詞，不要綁句首；剛好是那句的第一個詞才寫 P.at('#112')。
「@詞」要寫成字串字面值（P.at('#112@區網')，不要用變數組字串），build 才算得到；要再晚一點加第二個參數：P.at('#112@區網', 0.3)。
相鄰兩層至少差 2.1 秒（落下 0.5 秒、圖示 0.15 秒起描 0.7 秒＝忙到 0.85 秒，再停 1.2 秒）。
audit 會比對：這一拍出現的字（層名、說明）在別句才講到時，印 ⚠ 綁句對不上，照它給的 P.at 改。

【D 下限】
T1 ≥ 1.7（卡片 0.5 秒、地基線 1.0 秒起描 0.7 秒）
T2 ≥ T1 + 2.1；T3 ≥ T2 + 2.1；T4 ≥ T3 + 2.1；ALL ≥ T4 + 2.1
D ≥ ALL + 2.4（框淡出 0.4 秒＋最後一幕停 1.5 秒＋build 加的淡出 0.5 秒；沒有 ALL 時 D ≥ T4 + 2.9；D＝plan.json 這段的長度）
結尾寫 P.end()（不帶參數），長度自動等於 plan.json 這段的長度；root 的 data-duration 只給單獨開檔時用。

【版面】
fullscreen：整段淡入淡出 0.5 秒由 build 處理；0.5 秒前不動。主卡 left 120、top 150、寬 1180，標題列 128、內容區 1176×580。
每層 x 56、寬 1064、高 112，左邊圖示 72＋名稱（52 字），右邊說明（40 字、靠右）；左右內距 32。
  4 層：top 由下往上 438／302／166／30（間距 24）；3 層：top 400／248／96（間距 40）。地基線 y 566（4 層）／528（3 層），x 40–1136。
```

### 4.2 DOM 草圖

```
#x-stack（root；data-duration="13"）
├─ .sc-surface-fs.fill
└─ #xstk-card.sc-wcard（left 120, top 150, w 1180）
   ├─ .sc-wcard__bar > span.sc-opt「多機錄影工具的架構」
   └─ #xstk-body（relative, 1176×580）
      ├─ svg#xstk-base（absolute 0,0；1176×580）> line#xstk-ground  x1 40 y1 566 x2 1136 y2 566；stroke --sc-fs-line 4、round
      └─ div#xstk-l1..4.xstk-layer（absolute left 56, top 438／302／166／30, 1064×112；border 4 --sc-fs-node-line、radius 16、
          │                        bg --sc-fs-node；flex row、align center、justify-content space-between、padding 0 32）
          ├─ i.xstk-on（absolute inset −4, border 4 --brand, radius 16；P.focus 的框）
          ├─ span.xstk-left（flex row, gap 24, align center）
          │   ├─ span#xstk-ico1..4.sc-icon.sc-icon--72 > svg（smartphone／wifi／monitor／scissors）
          │   └─ span.xstk-name.sc-t52.sc-w900.sc-opt「手機 App」
          └─ span.xstk-desc.sc-t40.sc-w500.sc-gray.sc-opt「負責錄影與回傳」（靠右；有它時內容最右緣＝框內距，右側空白 ≤ 32）
```

script 開頭：

```
const T1 = P.at('#111@手機'), T2 = P.at('#112@區網'), T3 = P.at('#113@控制台'), T4 = P.at('#114@剪輯'), ALL = P.at('#115');
```

### 4.3 時間軸分鏡

| 時刻 | 誰 | 怎麼動 | P.* |
|---|---|---|---|
| 0.5 | 主卡 | 揭開 | `P.reveal('#xstk-card', 0.5)` |
| 1.0 | 地基線 | 描線 0.7 | `P.stroke('#xstk-ground', 1.0)` |
| Ti | 第 i 層 | 淡入＋從上方 12 px 落下（新元素 1） | `P.rise('#xstk-li', Ti, {dy: -12})` |
| Ti+0.15 | 第 i 層圖示 | 描線 | `P.icon('#xstk-icoi', Ti+P.BEAT)` |
| Ti+0.3 | 主色框 | 移到第 i 層；不降亮度（dim 1） | `P.focus('#xstk-l1, …, #xstk-li', '#xstk-li', Ti+0.3, {dim: 1, ring: '.xstk-on'})`（group 只寫已經落下的層） |
| ALL | 主色框 | 全部拿掉 | `P.focus('#xstk-l1, #xstk-l2, #xstk-l3, #xstk-l4', null, ALL, {dim: 1, ring: '.xstk-on'})` |
| — | 收尾 | | `P.end()` |

### 4.4 slots

| 欄位 | 在哪 | 上限 | 範例 |
|---|---|---|---|
| 標題 | `.sc-wcard__bar` | ≤ 10 字 | 多機錄影工具的架構 |
| 層名 ×3–4 | `.xstk-name` | ≤ 6 字 | 手機 App／區網連線／控制台／剪輯流程 |
| 說明 ×3–4（選填） | `.xstk-desc` | ≤ 12 字 | 負責錄影與回傳／同一個 Wi-Fi 傳檔／電腦上按開始結束／直接接剪輯軟體 |
| 圖示 ×3–4 | `.sc-icon` | icons.json | smartphone、wifi、monitor、scissors |
| 綁句 | `T1..T4`、`ALL` | | |

文字欄：標題＋層名 4＝5（說明選填；要寫說明時層數建議 3，文字欄 7 → 檔頭已允許，屬「選填」不計入弱模型必改欄）。

### 4.5 綁句與 D 下限

- 推導：地基 1.0+0.7 = 1.7；每拍忙到 T+0.85（框 T+0.3+0.4 = T+0.7 較早），+1.2 = 2.05 → 2.1；ALL：0.4＋1.5＋0.5 = 2.4。
- sample：`{"start":0,"D":13,"cues":{"111":[1.6,3.6],"112":[3.7,5.8],"113":[5.9,8],"114":[8.1,10.4],"115":[10.6,12.5]},"refs":{"#111@手機":1.8,"#112@區網":4.0,"#113@控制台":6.2,"#114@剪輯":8.4}}`（間距 2.2、ALL＝#115 句首 10.6 ≥ 8.4+2.1、D 13 ≥ 10.6+2.4）。

### 4.6 本支驗收

- `?t=1.35`：地基線描到一半，沒有任何層（地基 1.0 起描 0.7 秒，1.35 是一半；原寫 1.6 時已描完 86%）。
- `?t=5.0`：第 1、2 層；第 2 層主色框、第 1 層沒有框且**亮度沒變**（dim 1）；層的右側說明右緣對齊（四層同一條線）。
- `?t=12.5`（完成態）：四層、沒有框；層與層間距 24、層與地基線 16。
- 落下距離 12 px、沒有過衝（`?t=T1+0.25` 截圖該層 y 在 −12 和 0 之間）。
- 試填題：自擬「這套工具分三層：手機端錄影、區網傳檔、電腦端控制」→ 3 層變體；檢查弱模型有沒有照表改 top 與地基線。

---

## 5. `x-fix`：問題 → 解法翻轉

### 5.1 檔頭草稿

```
x-fix：痛點逐條劃掉，換成一個解法（第二層 custom，layout: "fullscreen"）

【適用的口播】
先講 2–3 個痛點，接著「所以我…」「為了解決…」「後來改成…」給一個解法，同一段 20 秒內講完，例如
「試了很多工具都不順手：啟動不同步、要走來走去、還要一支一支檢查，所以我乾脆自己設計了一套」。
左欄痛點逐條出現（警示色圖示）；講到解法時，痛點依序被劃掉、降成淡色，箭頭描向右邊，解法卡浮出，解法下面畫一條主色底線。

【不要用在哪裡】
- 只有一句「不是 X，而是 Y」：用 15 金句字卡（或 fx 32／39）。
- 痛點和解法隔很遠（中間超過 20 秒、跨段落）：前段用 x-warnings 或 04a，後段用 07 重點字卡。
- 痛點是要觀眾注意的警告、沒有解法：用 x-warnings。
- 超過 3 個痛點：挑 3 個，或用 04a。

【要改的地方】
1. 文字：標題列（≤ 10 字）；三個痛點 .xfix-t（≤ 7 字，留住 span 裡的 <i class="xfix-strike"></i>）；
   解法 #xfix-st（≤ 6 字，留住裡面的 <i class="xfix-ul"></i>）；解法副句 #xfix-sub（≤ 8 字，選填：不寫就刪掉）。
2. 圖示：三個痛點的 .sc-icon（建議同一個：circle-x 或 triangle-alert）、解法的 .sc-icon。到 kit/icons.json 找名稱，把 svg 原文貼上。
3. 綁句：<script> 開頭 P1–P3、FIX 的句號與詞（見【綁句欄位】）。
痛點是 2 個：刪掉 #xfix-p3 與 P3、#xfix-s3 那一行，照【版面】「2 個痛點」改兩列的 top。

【綁句欄位】
P1 = P.at('#171@不同步')、P2 = P.at('#172@走來走去')、P3 = P.at('#173@一支一支')：講到那個痛點的時刻，那一列出現。
FIX = P.at('#174@自己')：講到解法的那個詞，痛點依序被劃掉（每條晚 0.15 秒），0.4 秒後解法卡浮出、箭頭描過去，1.2 秒後畫底線。
痛點詞、解法詞在句中間或句尾時一定用 @詞，不要綁句首；剛好是那句的第一個詞才寫 P.at('#172')。
「@詞」要寫成字串字面值（P.at('#174@自己')，不要用變數組字串），build 才算得到；要再晚一點加第二個參數：P.at('#174@自己', 0.3)。
相鄰兩個痛點、最後一個痛點到 FIX，都至少差 2.1 秒（列出現 0.5 秒、圖示 0.15 秒起描 0.7 秒＝忙到 0.85 秒，再停 1.2 秒）。
audit 會比對：這一拍出現的字（痛點、解法）在別句才講到時，印 ⚠ 綁句對不上，照它給的 P.at 改。

【D 下限】
P1 ≥ 1.0（卡片 0.5 秒）
P2 ≥ P1 + 2.1；P3 ≥ P2 + 2.1；FIX ≥ P3 + 2.1
D ≥ FIX + 4.0（劃掉、解法、箭頭、降亮度、底線忙到 FIX + 2.0＋最後一幕停 1.5 秒＋build 加的淡出 0.5 秒；D＝plan.json 這段的長度）
結尾寫 P.end()（不帶參數），長度自動等於 plan.json 這段的長度；root 的 data-duration 只給單獨開檔時用。

【版面】
fullscreen：整段淡入淡出 0.5 秒由 build 處理；0.5 秒前不動。主卡 left 120、top 150、寬 1180，標題列 128、內容區 1176×580。
左欄痛點 left 40、高 112、寬跟著字（最寬 520）：3 個 top 60／234／408；2 個 top 120／348。圖示圓 72 用警示色。
箭頭 x 592–676、y 290。解法卡 left 704、top 126、432×328（中線 y 290），圖示 120＋解法 52 字＋副句 40 字，置中。
刪除線在字的中線、高 6；底線在解法字底下 4–10 px、高 6。
```

### 5.2 DOM 草圖

```
#x-fix（root；data-duration="12"）
├─ .sc-surface-fs.fill
└─ #xfix-card.sc-wcard（left 120, top 150, w 1180）
   ├─ .sc-wcard__bar > span.sc-opt「多機錄影的痛點」
   └─ #xfix-body（relative, 1176×580）
      ├─ div#xfix-p1..3.xfix-pain（absolute left 40, top 60／234／408, height 112, width max-content；
      │   │                       border 4 --sc-fs-node-line、radius 16、bg --sc-fs-node；flex row、align center、gap 20、padding 0 28）
      │   ├─ span#xfix-pico1..3.sc-icon.sc-icon--72.xfix-ico > svg（circle-x）   ← .xfix-ico：background var(--sc-warn)、線色 var(--sc-on-warn)
      │   └─ span.xfix-t.sc-t52.sc-w900.sc-opt（position relative）「啟動不同步」
      │       └─ i#xfix-s1..3.xfix-strike（absolute left −4, right −4, top calc(50% − 3px), height 6, bg --sc-warn,
      │                                    transform-origin left；P.bar 控制）
      ├─ svg#xfix-arrow（absolute 0,0；1176×580）
      │   ├─ path#xfix-a1  d="M592 290 H676"；stroke --brand 6、round
      │   └─ path#xfix-a2  d="M660 274 L676 290 L660 306"；同上
      └─ div#xfix-sol（absolute left 704, top 126, 432×328；border 4 --brand、radius 20、bg --sc-fs-card；
          │            flex column、center、gap 16）
          ├─ span#xfix-sico.sc-icon（--d 120px; --i 64px）> svg（wrench）
          ├─ span#xfix-st.sc-t52.sc-w900.sc-opt（position relative）「電腦一鍵控制」
          │   └─ i#xfix-ul.xfix-ul（absolute left 0, right 0, bottom −10px, height 6, bg --brand, transform-origin left）
          └─ span#xfix-sub.sc-t40.sc-w500.sc-gray.sc-opt「自己設計一套」
```

script 開頭：

```
const P1 = P.at('#171@不同步'), P2 = P.at('#172@走來走去'), P3 = P.at('#173@一支一支'), FIX = P.at('#174@自己');
```

### 5.3 時間軸分鏡

| 時刻 | 誰 | 怎麼動 | P.* |
|---|---|---|---|
| 0.5 | 主卡 | 揭開 | `P.reveal('#xfix-card', 0.5)` |
| Pi | 第 i 個痛點 | 淡入＋上漂（新元素 1） | `P.rise('#xfix-pi', Pi)` |
| Pi+0.15 | 痛點圖示 | 描線 | `P.icon('#xfix-picoi', Pi+P.BEAT)` |
| FIX / +0.15 / +0.3 | 三條刪除線 | scaleX 0→1，各 0.4 | `P.bar('#xfix-s1', FIX, {dur: 0.4})`、`P.bar('#xfix-s2', FIX+0.15, {dur: 0.4})`、`P.bar('#xfix-s3', FIX+0.3, {dur: 0.4})` |
| FIX+0.4 | 解法卡 | 淡入＋上漂（新元素 1） | `P.rise('#xfix-sol', FIX+0.4)` |
| FIX+0.55 | 解法圖示、箭頭 | 描線（先有卡再畫箭頭） | `P.icon('#xfix-sico', FIX+0.55)`、`P.stroke('#xfix-a1', FIX+0.55, {dur: 0.3})`、`P.stroke('#xfix-a2', FIX+0.85, {dur: 0.2})` |
| FIX+0.9 | 痛點 | 降到 0.4，解法保持 1 | `P.focus('#xfix-p1, #xfix-p2, #xfix-p3, #xfix-sol', '#xfix-sol', FIX+0.9)` |
| FIX+1.2 | 底線 | scaleX 0→1，0.8 | `P.bar('#xfix-ul', FIX+1.2)` |
| — | 收尾 | | `P.end()` |

### 5.4 slots

| 欄位 | 在哪 | 上限 | 範例 |
|---|---|---|---|
| 標題 | `.sc-wcard__bar` | ≤ 10 字 | 多機錄影的痛點 |
| 痛點 ×2–3 | `.xfix-t` | ≤ 7 字 | 啟動不同步／走來走去／一支一支檢查 |
| 解法 | `#xfix-st` | ≤ 6 字 | 電腦一鍵控制 |
| 副句（選填） | `#xfix-sub` | ≤ 8 字 | 自己設計一套 |
| 圖示 | 痛點共用 1、解法 1 | icons.json | circle-x、wrench |
| 綁句 | `P1..P3`、`FIX` | | |

文字欄 ≤ 6。

### 5.5 綁句與 D 下限

- 推導：每個痛點忙到 P+0.85，+1.2 → 2.05 → 2.1；FIX 之後忙到 FIX+1.2+0.8 = FIX+2.0，＋1.5＋0.5 = 4.0。解法字在 FIX+0.4 出現（≤ 0.5 秒，F4 不報）。
- sample：`{"start":0,"D":12,"cues":{"171":[1,3.3],"172":[3.3,5.5],"173":[5.5,7.6],"174":[7.6,10]},"refs":{"#171@不同步":1.2,"#172@走來走去":3.4,"#173@一支一支":5.6,"#174@自己":7.8}}`（間距 2.2、D 12 ≥ 7.8+4.0）。

### 5.6 本支驗收

- `?t=6.5`：三個痛點、沒有刪除線、沒有解法卡、沒有箭頭。
- `?t=8.3`（劃掉中）：第 1、2 條刪除線完整或正在畫，刪除線兩端各超出字 4 px、在字的中線。
- `?t=11.5`（完成態）：三條全劃掉、痛點淡（0.4）、箭頭完整、解法卡亮、底線在解法字底下 4–10 px、不碰副句。
- 痛點列寬跟字走：三列左緣對齊 x 40，右緣不同；最寬的不超過 x 560（箭頭起點 592 前留 32）。
- 試填題：範例專案 #48–#53「試過多機錄影工具都不順手…所以我乾脆根據自己實際的工作流設計了一套」→ 2 個痛點變體（取代 s18、s19 兩張字卡）。

---

## 6. `x-callout`：部位標註

### 6.1 檔頭草稿

```
x-callout：一個主體，四周逐一貼上標籤（第二層 custom，layout: "fullscreen"；取代關鍵詞條列）

【適用的口播】
在講「一個主體＋ 2–4 個短名詞」：主體的毛病、零件、用途、特徵，一個詞一句或一句裡連講，
例如「像腳架不穩造成畫面輕微晃動，或自己穿的衣服太薄有激凸問題」（主體＝手機錄的畫面）。
中央一個大圖示圓（主體）；講到哪個詞，四角之一的標籤浮出，引線從標籤描到主體邊緣、端點一個小圓；目前這個標籤有主色框。

【不要用在哪裡】
- 名詞之間沒有共同的主體：用 12 關鍵詞條列或 04a。
- 每個名詞後面還有一句說明要同時看到：用 13 標題條列或 x-stack。
- 段長不到 4 秒或只有一句字幕：維持 12（style.md「情境動畫優先」的三條判準）。
- 超過 4 個詞：拆兩段，或用 04a。

【要改的地方】
1. 文字：標題列（≤ 10 字，寫主體與主題，例「錄影常見小毛病」）；四個標籤的 .xcall-name（≤ 4 字）。
2. 圖示：中央主體 #xcall-obj 的 svg、四個標籤的 .sc-icon。到 kit/icons.json 找名稱，把 svg 原文貼上（拿掉 class、width、height）。
3. 綁句：<script> 開頭 T1–T4、ALL 的句號與詞（見【綁句欄位】）。
標籤是 3 個：刪掉 #xcall-t4、#xcall-c4、#xcall-d4 與 T4（右下角空著）；2 個：再刪 #xcall-t3、#xcall-c3、#xcall-d3 與 T3（只留上排）。座標不用改。

【綁句欄位】
T1 = P.at('#101@腳架不穩')、T2 = P.at('#102@衣服太薄')、T3 = P.at('#103@收音太遠')、T4 = P.at('#104@背光太暗')：講到那個詞的時刻，那個標籤浮出、引線描到主體。
ALL = P.at('#105')：講到總結那一句，主色框全部拿掉。沒有這句就刪掉 ALL 那一行。
名詞在句中間或句尾時一定用 @詞，不要綁句首；剛好是那句的第一個詞才寫 P.at('#102')。
「@詞」要寫成字串字面值（P.at('#102@衣服太薄')，不要用變數組字串），build 才算得到；要再晚一點加第二個參數：P.at('#102@衣服太薄', 0.3)。
相鄰兩個標籤至少差 2.1 秒（標籤 0.5 秒、引線 0.3 秒起描 0.5 秒、圖示描到 0.85 秒，再停 1.2 秒）。
audit 會比對：這一拍出現的字（標籤）在別句才講到時，印 ⚠ 綁句對不上，照它給的 P.at 改。

【D 下限】
T1 ≥ 1.6（卡片 0.5 秒、主體 1.0 秒）
T2 ≥ T1 + 2.1；T3 ≥ T2 + 2.1；T4 ≥ T3 + 2.1；ALL ≥ T4 + 2.1
D ≥ ALL + 2.4（框淡出 0.4 秒＋最後一幕停 1.5 秒＋build 加的淡出 0.5 秒；沒有 ALL 時 D ≥ T4 + 2.9；D＝plan.json 這段的長度）
結尾寫 P.end()（不帶參數），長度自動等於 plan.json 這段的長度；root 的 data-duration 只給單獨開檔時用。

【版面】
fullscreen：整段淡入淡出 0.5 秒由 build 處理；0.5 秒前不動。主卡 left 120、top 150、寬 1180，標題列 128、內容區 1176×580。
主體圖示圓 220（x 478–698、y 180–400，中心 588,290）。標籤 360×112：左上 (40, 92)、右上 (776, 92)、左下 (40, 376)、右下 (776, 376)。
引線從標籤內側邊的中點水平 40 px 再斜到主體圓周（45 度方向），端點小圓 r 10 壓在圓周上；四條座標寫死，不要改。
```

### 6.2 DOM 草圖

```
#x-callout（root；data-duration="13"）
├─ .sc-surface-fs.fill
└─ #xcall-card.sc-wcard（left 120, top 150, w 1180）
   ├─ .sc-wcard__bar > span.sc-opt「錄影常見小毛病」
   └─ #xcall-body（relative, 1176×580）
      ├─ svg#xcall-lines（absolute 0,0；1176×580；viewBox 0 0 1176 580；在標籤與主體「下面」）
      │   ├─ path#xcall-c1.xcall-line  d="M400 148 H440 L510 212"     （左上）
      │   ├─ path#xcall-c2.xcall-line  d="M776 148 H736 L666 212"     （右上）
      │   ├─ path#xcall-c3.xcall-line  d="M400 432 H440 L510 368"     （左下）
      │   ├─ path#xcall-c4.xcall-line  d="M776 432 H736 L666 368"     （右下）
      │   └─ circle#xcall-d1..4.xcall-dot  (510,212)／(666,212)／(510,368)／(666,368)，r 10
      │        .xcall-line：fill none、stroke --sc-fs-ink 4、round；.xcall-dot：fill --sc-fs-card、stroke --brand 4
      ├─ span#xcall-obj.sc-icon（absolute left 478, top 180；--d 220px; --i 120px）> svg（smartphone）
      └─ div#xcall-t1..4.xcall-tag（absolute 左上 left 40 top 92／右上 left 776 top 92／左下 left 40 top 376／右下 left 776 top 376；
          │                       360×112；border 4 --sc-fs-node-line、radius 16、bg --sc-fs-node；flex row、center、gap 16）
          ├─ i.xcall-on（absolute inset −4, border 4 --brand, radius 16）
          ├─ span#xcall-ico1..4.sc-icon（--d 64px; --i 36px）> svg（smartphone／shirt／mic／sun）
          └─ span.xcall-name.sc-t52.sc-w900.sc-opt「腳架不穩」
```

（圓周檢查：(510,212) 與中心 (588,290) 差 (−78, −78)，距離 110.3 ≈ 半徑 110。）

script 開頭：

```
const T1 = P.at('#101@腳架不穩'), T2 = P.at('#102@衣服太薄'), T3 = P.at('#103@收音太遠'), T4 = P.at('#104@背光太暗'), ALL = P.at('#105');
```

### 6.3 時間軸分鏡

| 時刻 | 誰 | 怎麼動 | P.* |
|---|---|---|---|
| 0.5 | 主卡 | 揭開 | `P.reveal('#xcall-card', 0.5)` |
| 1.0 | 主體圓 | 淡入＋上漂（新元素 1）；0.15 後圖示描線 | `P.rise('#xcall-obj', 1.0)`、`P.icon('#xcall-obj', 1.0+P.BEAT)` |
| Ti | 第 i 個標籤 | 淡入＋上漂（新元素 1） | `P.rise('#xcall-ti', Ti)` |
| Ti+0.15 | 標籤圖示 | 描線 | `P.icon('#xcall-icoi', Ti+P.BEAT)` |
| Ti+0.3 | 引線＋端點 | 描線 0.5（不算新元素） | `P.stroke('#xcall-ci, #xcall-di', Ti+0.3, {dur: 0.5})` |
| Ti+0.3 | 主色框 | 移到這個標籤（dim 1） | `P.focus('#xcall-t1, …, #xcall-ti', '#xcall-ti', Ti+0.3, {dim: 1, ring: '.xcall-on'})` |
| ALL | 主色框 | 全部拿掉 | `P.focus('#xcall-t1, #xcall-t2, #xcall-t3, #xcall-t4', null, ALL, {dim: 1, ring: '.xcall-on'})` |
| — | 收尾 | | `P.end()` |

### 6.4 slots

| 欄位 | 在哪 | 上限 | 範例 |
|---|---|---|---|
| 標題 | `.sc-wcard__bar` | ≤ 10 字 | 錄影常見小毛病 |
| 標籤 ×2–4 | `.xcall-name` | ≤ 4 字 | 腳架不穩／衣服太薄／收音太遠／背光太暗 |
| 主體圖示 | `#xcall-obj` | icons.json | smartphone |
| 標籤圖示 ×2–4 | `.xcall-tag .sc-icon` | icons.json | smartphone、shirt、mic、sun |
| 綁句 | `T1..T4`、`ALL` | | |

文字欄 ≤ 5。標籤內距：內寬 352 − 左右 24×2 = 304；圖示 64＋間距 16＋4 字 208 = 288，nowrap 餘裕 8；上下 (112 − 8 − 72)/2 = 16。

### 6.5 綁句與 D 下限

- 推導：主體 1.0 進場，T1 ≥ 1.5 才不會 1 秒內 3 個新元素，取 1.6；每拍忙到 T+0.85（引線 T+0.8），+1.2 → 2.05 → 2.1；ALL 0.4＋1.5＋0.5 = 2.4。
- sample：`{"start":0,"D":13,"cues":{"101":[1.6,3.8],"102":[3.9,6],"103":[6.1,8.2],"104":[8.3,10.4],"105":[10.6,12.6]},"refs":{"#101@腳架不穩":1.8,"#102@衣服太薄":4.0,"#103@收音太遠":6.2,"#104@背光太暗":8.4}}`（間距 2.2、ALL 10.6 ≥ 8.4+2.1、D 13 ≥ 10.6+2.4）。

### 6.6 本支驗收

- `?t=1.5`：只有主體圓（圖示描線中），四角都空。
- `?t=5.0`：左上、右上兩個標籤；兩條引線完整、端點小圓壓在主體圓周上（目測不離縫、不刺入圓心方向超過 10 px）；右上有主色框、左上沒有。
- `?t=12.6`（完成態）：四個標籤、四條引線、沒有框；引線離其他標籤 ≥ 16 px。
- 刪成 2 個標籤：只有上排兩個，畫面不出現多的引線或端點。
- 試填題：範例專案 #21–#22 → T1 = `P.at('#21@腳架不穩')`、T2 = `P.at('#22@衣服太薄')`，2 個標籤變體（取代 s08 的 12）；若 #21、#22 起點差 < 2.1 秒，弱模型應照檔頭綁後面的詞或延長段。

---

## 7. `x-ring`：百分比／進度環（計時、倒數）

### 7.1 檔頭草稿

```
x-ring：進度環（第二層 custom，layout: "fullscreen"；百分比、計時、倒數共用一個檔）

【適用的口播】
在講「一個比例」或「一段時間」，前後各有一句主題或起點、結論或終點，例如
「32 段 NG 裡，AI 剪掉了 87%，也就是 28 段」「這個工具從萌生想法到完成產品原型，前後只花了一個小時」。
左邊一個大圓環、中央是數字；講到數字時，主色弧從 12 點鐘方向走到那個比例，數字同步跑；右邊上下兩列（起點／主題 → 終點／結論），中間一個向下箭頭。
倒數：從滿走到空、數字往下數，同一個檔、只改 RING。

【不要用在哪裡】
- 只有一個數字、沒有比例也沒有起訖：用 fx 29 數字計數。
- 兩個數字在比：用 x-versus 或 x-numbers。
- 一個比例要和另一個比例並排：用 04d 表格或拆兩段。
- 中央數字超過 4 個字元（例「1,200」）：換單位（「1.2 千」）或用 fx 29。

【要改的地方】
1. 文字：標題列（≤ 10 字）；中央單位 #xring-unit（≤ 3 字，例「剪掉」「分鐘」「完成度」）；右邊兩列 .xring-text（各 ≤ 8 字）。
2. 圖示：右邊兩列的 .sc-icon。到 kit/icons.json 找名稱，把 svg 原文貼上（拿掉 class、width、height）。
3. 數字：只改 <script> 開頭 RING 那一行：{ from: 起點, to: 終點, max: 一整圈代表多少, suffix: 數字後面的字 }。
   百分比 { from: 0, to: 87, max: 100, suffix: '%' }；計時一小時 { from: 0, to: 60, max: 60, suffix: '' }（單位寫「分鐘」）；
   倒數十秒 { from: 10, to: 0, max: 10, suffix: '' }。弧走多少由程式算，不用改 CSS。
4. 綁句：<script> 開頭 R1、RING_AT、R2 的句號與詞（見【綁句欄位】）。

【綁句欄位】
R1 = P.at('#161@32')：講到主題或起點的時刻，右上那一列出現。
RING_AT = P.at('#162@87')：講到數字的時刻，弧開始走、數字開始跑（1.2 秒）。
R2 = P.at('#163@剪掉')：講到結論或終點的時刻，右下那一列出現、箭頭描下來。
三拍可以任意先後（照口播順序綁就好），不用改下面的程式。
詞在句中間或句尾時一定用 @詞，不要綁句首；剛好是那句的第一個詞才寫 P.at('#162')。
「@詞」要寫成字串字面值（P.at('#162@87')，不要用變數組字串），build 才算得到；要再晚一點加第二個參數：P.at('#162@87', 0.3)。
R1 或 R2 之後的下一拍至少差 2.1 秒；RING_AT 之後的下一拍至少差 2.4 秒。同一句裡的兩個詞太近（例「從萌生想法到完成產品原型」）：R2 改綁那句結尾 P.at('#62e')，或綁下一句。
audit 會比對：這一拍出現的字（兩列文字）在別句才講到時，印 ⚠ 綁句對不上，照它給的 P.at 改。

【D 下限】
第一拍 ≥ 1.5（卡片 0.5 秒、圓環 1.0 秒）
R1、R2 之後的下一拍 ≥ 那一拍 + 2.1；RING_AT 之後的下一拍 ≥ RING_AT + 2.4
D ≥ R2 + 2.9（最後一拍是 R1 或 R2：+2.9；最後一拍是 RING_AT：D ≥ RING_AT + 3.2；含最後一幕停 1.5 秒＋build 加的淡出 0.5 秒；D＝plan.json 這段的長度）
結尾寫 P.end()（不帶參數），長度自動等於 plan.json 這段的長度；root 的 data-duration 只給單獨開檔時用。

【版面】
fullscreen：整段淡入淡出 0.5 秒由 build 處理；0.5 秒前不動。主卡 left 120、top 150、寬 1180，標題列 128、內容區 1176×580。
圓環 440×440 在 (40, 70)，中心 (260, 290)、半徑 180、線寬 40；中央數字 112 字、單位 40 字，放在寬 300 的置中框。
右邊兩列 x 552–1136、高 112：上列 top 120、下列 top 348，內容置中；箭頭 x 844、y 248–332。
```

### 7.2 DOM 草圖

```
#x-ring（root；data-duration="9.5"）
├─ .sc-surface-fs.fill
└─ #xring-card.sc-wcard（left 120, top 150, w 1180）
   ├─ .sc-wcard__bar > span.sc-opt「AI 剪掉多少 NG」
   └─ #xring-body（relative, 1176×580）
      ├─ div#xring-dial（absolute left 40, top 70, 440×440）
      │   ├─ svg（440×440；viewBox 0 0 440 440）
      │   │   ├─ circle#xring-track  cx 220 cy 220 r 180；fill none、stroke --sc-fs-line 40
      │   │   └─ circle#xring-arc    同上；stroke --brand 40、stroke-linecap butt、pathLength="1"、
      │   │                            style: stroke-dasharray 1; transform="rotate(-90 220 220)"（只轉 −90，屬 90 度）
      │   └─ div#xring-mid（absolute left 70, top 100, 300×240；flex column、center）
      │       ├─ span#xring-num.sc-t112.sc-w900（width 300, text-align center）「0%」
      │       └─ span#xring-unit.sc-t40.sc-w700.sc-gray.sc-opt「剪掉」
      ├─ svg#xring-arrow（absolute 0,0；1176×580）
      │   ├─ path#xring-a1  d="M844 248 V332"；stroke --sc-fs-ink 6、round
      │   └─ path#xring-a2  d="M828 316 L844 332 L860 316"；同上
      ├─ div#xring-r1.xring-row（absolute left 552, top 120, 584×112；border 4 --sc-fs-node-line、radius 16、bg --sc-fs-node；
      │   │                     flex row、justify-content center、align center、gap 24）
      │   ├─ span#xring-ico1.sc-icon.sc-icon--72 > svg（scissors）
      │   └─ span.xring-text.sc-t52.sc-w900.sc-opt「32 段 NG」
      └─ div#xring-r2.xring-row（absolute left 552, top 348；同上，span#xring-ico2（bot）、「AI 剪掉 28 段」）
```

script 開頭：

```
const R1 = P.at('#161@32'), RING_AT = P.at('#162@87'), R2 = P.at('#163@剪掉');
const RING = { from: 0, to: 87, max: 100, suffix: '%' };     // 只改這一行
const OFF0 = 1 - RING.from / RING.max, OFF1 = 1 - RING.to / RING.max;   // 弧的起訖（自動算）
```

### 7.3 時間軸分鏡

| 時刻 | 誰 | 怎麼動 | P.* |
|---|---|---|---|
| 0.5 | 主卡 | 揭開 | `P.reveal('#xring-card', 0.5)` |
| 1.0 | 圓環（灰軌道＋起始數字） | 淡入＋上漂（新元素 1）；弧停在 OFF0、數字顯示 from | `P.rise('#xring-dial', 1.0)`；弧與數字的初值由下面兩個 tween 的 immediateRender 設定 |
| R1 | 右上列 | 淡入＋上漂；0.15 後圖示描線 | `P.rise('#xring-r1', R1)`、`P.icon('#xring-ico1', R1+P.BEAT)` |
| RING_AT | 主色弧 | strokeDashoffset OFF0→OFF1，1.2，power2.out | `P.morph('#xring-arc', RING_AT, {strokeDashoffset: OFF1}, {from: {strokeDashoffset: OFF0}, dur: 1.2, ease: 'power2.out'})` |
| RING_AT | 中央數字 | from→to，1.2，同一個 ease | `P.count('#xring-num', RING_AT, {from: RING.from, to: RING.to, dur: 1.2, suffix: RING.suffix})` |
| R2 | 右下列 | 淡入＋上漂；0.15 後箭頭描下來、圖示描線 | `P.rise('#xring-r2', R2)`、`P.stroke('#xring-a1', R2+P.BEAT, {dur: 0.3})`、`P.stroke('#xring-a2', R2+0.45, {dur: 0.2})`、`P.icon('#xring-ico2', R2+P.BEAT)` |
| — | 收尾 | | `P.end()` |

### 7.4 slots

| 欄位 | 在哪 | 上限 | 範例（百分比／計時） |
|---|---|---|---|
| 標題 | `.sc-wcard__bar` | ≤ 10 字 | AI 剪掉多少 NG／做出原型花多久 |
| 中央單位 | `#xring-unit` | ≤ 3 字 | 剪掉／分鐘 |
| 上列 | `#xring-r1 .xring-text` | ≤ 8 字 | 32 段 NG／萌生想法 |
| 下列 | `#xring-r2 .xring-text` | ≤ 8 字 | AI 剪掉 28 段／完成原型 |
| 圖示 ×2 | `.xring-row .sc-icon` | icons.json | scissors、bot／lightbulb、rocket |
| 數字 | `RING` | 中央 ≤ 4 字元 | 見上 |
| 綁句 | `R1`、`RING_AT`、`R2` | | |

文字欄 4。

### 7.5 綁句與 D 下限

- 推導：列忙到 +0.85（圖示），+1.2 → 2.05 → 2.1；弧與數字 1.2，+1.2 → 2.4；最後一拍是列：0.85＋1.5＋0.5 = 2.85 → 2.9；是弧：1.2＋1.5＋0.5 = 3.2。
- sample：`{"start":0,"D":9.5,"cues":{"161":[1.4,3.8],"162":[3.8,6.4],"163":[6.4,9]},"refs":{"#161@32":1.6,"#162@87":4.0,"#163@剪掉":6.6}}`（4.0 ≥ 1.6+2.1、6.6 ≥ 4.0+2.4、D 9.5 ≥ 6.6+2.9）。

### 7.6 本支驗收

- `?t=1.4`：灰軌道、中央「0%」、沒有主色弧（起點不留圓點：linecap butt）。
- `?t=5.3`（弧剛走完）：主色弧止於 87%（約 2 點半～3 點之間往回 47 度的位置，目測對）、數字「87%」寬度不抖。
- `?t=9.0`（完成態）：兩列、箭頭完整、弧不動。
- 計時變體 `{0, 60, 60}`：弧走滿一整圈，**12 點鐘接縫沒有缺口**；有缺口就把 `#xring-arc` 的 stroke-dasharray 改成 1.002（寫進檔頭【版面】），這一格是必驗。
- 倒數變體 `{10, 0, 10}`：起始是滿圈「10」，走完是空圈「0」。
- 試填題：範例專案 #62–#64「從萌生想法到完成產品原型，前後只花了一個小時」→ 計時變體；R1 = `P.at('#62@萌生想法')`、R2 = `P.at('#62e')`（太近時照檔頭改）、RING_AT = `P.at('#64@一個小時')`（取代 s22 的 fx「1 小時」）。

---

## 8. `x-trend`：成長／下降趨勢

### 8.1 檔頭草稿

```
x-trend：長條逐根長出＋趨勢線＋最後的值（第二層 custom，layout: "fullscreen"）

【適用的口播】
在講「同一個量在 3–6 個時間點的變化」，最後點出現在的值，例如「開台第一個月 200 人訂閱，半年後 2 千，今年破兩萬」
「每集的剪輯時間從 6 小時一路降到 40 分鐘」。
講到第一個值時，長條由左到右每 0.5 秒長一根（下面的時間標籤一起出現）；講到最後的值時，最後一根換主色、趨勢線沿著柱頂描過去、
提示框浮出並數到最後的值；講結論時左上出現一顆膠囊（選用）。

【不要用在哪裡】
- 只有兩個數字：用 x-numbers、x-versus 或 x-before-after。
- 只有一個數字：用 fx 29。
- 不是同一個量（例：不同工具各自的分數）：用 x-versus 或 04d。
- 超過 6 個時間點：只留頭、尾和 2–3 個轉折點。

【要改的地方】
1. 文字：標題列（≤ 10 字）；提示框的單位 #xtr-unit（≤ 3 字）；結論膠囊 #xtr-pill（≤ 8 字，選填）。
2. 數字：只改 <script> 開頭 DATA 那一行：[[時間標籤, 數字], …]，3–6 組，時間標籤 ≤ 3 字（例「1 月」「2024」）。
   柱的位置、高度、趨勢線、提示框位置都由程式算，不用改 CSS。
3. 綁句：<script> 開頭 T1、T2、T3 的句號與詞（見【綁句欄位】）。

【綁句欄位】
T1 = P.at('#151@200')：講到第一個值的時刻，柱子開始一根一根長（每根晚 0.5 秒、長 0.6 秒）。
T2 = P.at('#152@兩萬')：講到最後的值的時刻，最後一根換主色、趨勢線描出、提示框數到最後的值。
T3 = P.at('#153@翻')：講到結論的時刻，膠囊出現。沒有結論句就刪掉 T3 那兩行。
值在句中間或句尾時一定用 @詞，不要綁句首；剛好是那句的第一個詞才寫 P.at('#152')。
「@詞」要寫成字串字面值（P.at('#152@兩萬')，不要用變數組字串），build 才算得到；要再晚一點加第二個參數：P.at('#152@兩萬', 0.3)。
T2 和 T1 的距離要夠所有柱子長完再停 1.2 秒：T2 ≥ T1 + 0.5 × 柱數 + 1.3（5 根＝3.8 秒、6 根＝4.3 秒）。
audit 會比對：這一拍出現的字（時間標籤、膠囊）在別句才講到時，印 ⚠ 綁句對不上，照它給的 P.at 改。

【D 下限】
T1 ≥ 1.5（卡片 0.5 秒、基線 1.0 秒起描）
T2 ≥ T1 + 0.5 × 柱數 + 1.3；T3 ≥ T2 + 2.7
D ≥ T3 + 2.5（膠囊 0.5 秒＋最後一幕停 1.5 秒＋build 加的淡出 0.5 秒；沒有 T3 時 D ≥ T2 + 3.5；D＝plan.json 這段的長度）
結尾寫 P.end()（不帶參數），長度自動等於 plan.json 這段的長度；root 的 data-duration 只給單獨開檔時用。

【版面】
fullscreen：整段淡入淡出 0.5 秒由 build 處理；0.5 秒前不動。主卡 left 120、top 150、寬 1180，標題列 128、內容區 1176×580。
基線 y 470、x 56–1120。柱寬 112，第一根 left 96、最後一根 left 968，中間等距（程式算）；最高的柱 300 px，最矮 16 px。
時間標籤 40 字、在柱下 top 486。提示框 300×104（數字 52 字＋單位 40 字），放在最後一根上方、右緣 ≤ 1136，且高過它覆蓋到的所有柱子 32 px。
膠囊 .sc-pill 在 (56, 24)。
```

### 8.2 DOM 草圖

```
#x-trend（root；data-duration="11"）
├─ .sc-surface-fs.fill
└─ #xtr-card.sc-wcard（left 120, top 150, w 1180）
   ├─ .sc-wcard__bar > span.sc-opt「訂閱人數」
   └─ #xtr-body（relative, 1176×580）
      ├─ svg#xtr-axis-svg（absolute 0,0；1176×580）> line#xtr-axis  x1 56 y1 470 x2 1120 y2 470；stroke --sc-fs-line 4
      ├─ div#xtr-plot（absolute 0,0；1176×580）  ← script 在這裡產生：
      │   ├─ div#xtr-b0..b{n−1}.xtr-bar（absolute left＝96＋i×step, bottom 110, width 112, height 0；radius 8 8 0 0；bg --sc-fs-node-line）
      │   │   └─（只有最後一根）i#xtr-hl（absolute inset 0；radius 8 8 0 0；bg --brand）
      │   └─ div#xtr-l0..l{n−1}.xtr-lab.sc-t40.sc-w700.sc-gray（absolute left＝柱中心−80, top 486, width 160, text-align center）
      ├─ svg#xtr-line-svg（absolute 0,0；1176×580；疊在柱上面）
      │   ├─ polyline#xtr-line  points 由 script 寫（每根柱中心 x、柱頂 −12）；fill none、stroke --brand 6、round
      │   └─ circle#xtr-end      最後一點，r 10；fill --sc-fs-card、stroke --brand 4
      ├─ div#xtr-tip（absolute；left／top 由 script 寫；300×104；border 4 --brand、radius 16、bg --sc-fs-card；flex row center gap 8）
      │   ├─ span#xtr-num.sc-t52.sc-w900（width 200, text-align right）「0」
      │   └─ span#xtr-unit.sc-t40.sc-w700.sc-opt「人」
      └─ div#xtr-pill.sc-pill（absolute left 56, top 24）> span.sc-opt「一年翻 100 倍」
```

script 開頭（在任何 P.* 之前）：

```
const T1 = P.at('#151@200'), T2 = P.at('#152@兩萬'), T3 = P.at('#153@翻');
const DATA = [ ['1 月', 200], ['3 月', 900], ['6 月', 2000], ['9 月', 8000], ['12 月', 20000] ];   // 只改這一行
// 程式算（寫死在範例裡，弱模型不改）：
//   n = DATA.length；step = Math.floor((968 − 96) / (n − 1))；left_i = 96 + i × step；
//   vmax = 所有值的最大值；h_i = Math.max(16, Math.round(v_i / vmax × 300))；柱頂 y_i = 470 − h_i；
//   趨勢線點 (left_i + 56, y_i − 12)；
//   提示框 left = Math.min(left_{n−1} + 56 − 150, 1136 − 300)；
//   提示框 top = (提示框 x 範圍內所有柱的最小 y) − 32 − 104，再取 Math.max(16, …)。
// 產生 n 根 .xtr-bar 與 n 個 .xtr-lab、寫 polyline points、設 #xtr-end 的 cx／cy、設 #xtr-tip 的 left／top。
```

### 8.3 時間軸分鏡

| 時刻 | 誰 | 怎麼動 | P.* |
|---|---|---|---|
| 0.5 | 主卡（含空的 plot） | 揭開 | `P.reveal('#xtr-card', 0.5)` |
| 1.0 | 基線 | 描線 0.7 | `P.stroke('#xtr-axis', 1.0)` |
| T1+0.5i | 第 i 根柱 | 高 0→h_i，0.6，power2.out（變化） | `P.morph('#xtr-b'+i, T1+0.5*i, {height: h_i}, {from: {height: 0}, dur: 0.6, ease: 'power2.out'})` |
| T1+0.5i | 第 i 個時間標籤 | 淡入（新元素 1／0.5 秒） | `P.in('#xtr-l'+i, T1+0.5*i)` |
| T2 | 最後一根 | 主色層淡入（疊在父元素上，變化） | `P.in('#xtr-hl', T2)` |
| T2 | 趨勢線 | 描線 0.9；端點 0.2 | `P.stroke('#xtr-line', T2, {dur: 0.9})`、`P.stroke('#xtr-end', T2+0.9, {dur: 0.2})` |
| T2+0.3 | 提示框 | 淡入＋上漂（新元素 1） | `P.rise('#xtr-tip', T2+0.3)` |
| T2+0.3 | 數字 | 0→最後的值，1.2，comma | `P.count('#xtr-num', T2+0.3, {from: 0, to: last, dur: 1.2, comma: true})` |
| T3 | 膠囊 | 淡入＋上漂（新元素 1） | `P.rise('#xtr-pill', T3)` |
| — | 收尾 | | `P.end()` |

### 8.4 slots

| 欄位 | 在哪 | 上限 | 範例 |
|---|---|---|---|
| 標題 | `.sc-wcard__bar` | ≤ 10 字 | 訂閱人數 |
| 單位 | `#xtr-unit` | ≤ 3 字 | 人 |
| 結論膠囊（選填） | `#xtr-pill` | ≤ 8 字 | 一年翻 100 倍 |
| 資料 | `DATA` | 3–6 組；標籤 ≤ 3 字；值 ≤ 999,999 | 見上 |
| 綁句 | `T1`、`T2`、`T3` | | |

HTML 文字欄 3；時間標籤在 `DATA`（研究 §1.4 的例外）。

### 8.5 綁句與 D 下限

- 推導：第 n 根柱在 T1+0.5(n−1) 起長 0.6 → 忙到 T1+0.5n+0.1，+1.2 → T2 ≥ T1+0.5n+1.3；T2 之後數字忙到 T2+1.5，+1.2 → T3 ≥ T2+2.7；沒有 T3：1.5＋1.5＋0.5 = 3.5；有 T3：0.5＋1.5＋0.5 = 2.5。
- sample（5 根）：`{"start":0,"D":11,"cues":{"151":[1.4,5.4],"152":[5.4,8.2],"153":[8.2,10.6]},"refs":{"#151@200":1.6,"#152@兩萬":5.6,"#153@翻":8.4}}`（5.6 ≥ 1.6+3.8、8.4 ≥ 5.6+2.7、D 11 ≥ 8.4+2.5）。

### 8.6 本支驗收

- `?t=1.5`：只有基線（描到一半），沒有柱。
- `?t=4.5`：5 根柱全部長完（最矮的 16 px 看得到）、5 個標籤；沒有提示框、沒有趨勢線、全是灰柱。
- `?t=10.6`（完成態）：最後一根主色、趨勢線經過每根柱頂上方 12 px、端點小圓、提示框「20,000 人」在最後一根上方 32 px 以上且右緣 ≤ 1136、膠囊不壓到任何柱與線。
- 下降資料 `[['1 月', 360], ['3 月', 240], ['6 月', 120], ['9 月', 60], ['12 月', 40]]`：提示框不壓到第 4 根（程式取覆蓋到的柱的最高點）。
- 6 組資料：最後一根 left 968、柱間距相等（step 174）。
- 試填題：自擬「每集剪輯時間從 6 小時降到 40 分鐘」→ 下降變體，`DATA` 用分鐘、單位「分鐘」。

---

## 9. 請其他工作線加

| 對象 | 要加什麼 |
|---|---|
| 003 | 收件驗收（§0.4）；`examples.test`／`index.html`／R7.5 從 9 支擴到 17 支；句號區段 #101–#175 收進 FR-024 表；NOTICE 記靈感來源（本檔表頭的 slug＋research.md 的作者與連結） |
| 001 | SITUATIONS.md §3 加 8 列（「句子長這樣」用各支檔頭【適用的口播】第一句），12／13／04a 三列的「次選／條件」加上 research.md §3 的替代；storyboard Skill 情境判定表；R7.5 範例表 8 列 |
| 002 | 無程式改動；只確認 `P.at('#N@詞')` 在詞是數字（「200」「87」「2019」）時查得到（F4 的 transcript.json 是逐字，數字可能被拆成單字元：查不到時退回字數比例並 ⚠，本規格接受這個退路） |
| 主代理 | 派工：每位工人 1–2 支；建議分組（風險相近）：① x-checklist＋x-stack、② x-timeline＋x-callout、③ x-versus＋x-ring、④ x-fix＋x-trend |

# 契約：`build.mjs --check --json` 的輸出（check-json）

- **擁有者**：002 pipeline-timing。**照它讀**：004（`qc.mjs storyboard`、`observe`、`final`）、006（剪輯台時間軸）、003（`audit.mjs` 取段落與時間）、001（文件引用欄位名）、007（`dev/check-all.mjs`）。
- **版本**：`schema: 2`（2026-10-31）。現行輸出（`build.mjs:422-430`、`plan.mjs:597-611`）沒有 `schema` 欄，視為 1。
- **指令**：`node shared/template/tools/build.mjs --project projects/<專案> --check --json`。stdout 只有一個 JSON 物件（`JSON.stringify(…, null, 2)`），其他訊息不印；出錯時也印同樣的鍵（§5）。
- **規格出處**：`specs/002-pipeline-timing/spec.md` FR-013、FR-034、FR-050、FR-054、FR-058、FR-063、FR-067–FR-070；`contracts/media.md` §7（`items[].out`）；`contracts/sfx.md` §9、`cli-005.md` §3.5（`sfxCount`、`sfxBudget`、`outro`）；`cli-004.md` §2.1（`planHash`）。

## 1. 共通規則

1. **兩種時間基準**。沒有寫「完成影片」的時間欄位都是 **rough.mp4 秒數**（剪輯台用 rough.mp4 的時間軸；現行慣例，`plan.mjs:595-599`）：起點用 `tm.unmapStart`、迄點用 `tm.unmapEnd` 換回。名稱是 `out`（物件）或 `outStart`／`outEnd`／`len` 的是**完成影片秒數**（qc 截圖用）。`edit.cuts` 是空的時候兩者相同。
2. 秒數一律四捨五入到 0.001（`r3`）；dB 到 0.1。
3. 表上「必有」的鍵一定在，沒有資料時是 `[]`、`{}` 或 `null`（照表上寫的空值），消費端不用判斷鍵存不存在。「選填」的鍵只在有值時才出現（現行 `shownEnd` 的做法）。
4. `errors`、`warnings` 是字串陣列，**不含**開頭的 `✖ `／`⚠ ` 符號（現行，`build.mjs:279-280` 印文字報告時才加）；每則都帶 `→` 後面的改法（憲法 III）。外部函式回傳帶符號的（例：005 `sfxBudget().warnings` 是 `'⚠ …'`），002 推進來之前先去掉符號。
5. 加欄位不升 `schema`；改名、改型別、改意思才升，並在 §6 記錄。

## 2. 第一層

| 鍵 | 型別 | 必有／選填 | 時間基準 | 意思 | 從哪來 | 誰讀 |
|---|---|---|---|---|---|---|
| `schema` | `2` | 必有 | — | 本契約版本 | 新 | 全部 |
| `ok` | 布林 | 必有 | — | `errors` 是空的 | 現行 | 全部 |
| `errors` | 字串[] | 必有 | — | ✖ 訊息 | 現行 | 全部 |
| `warnings` | 字串[] | 必有 | — | ⚠ 訊息（含字幕 > 18 字、lookCheck、sfxBudget 的 ⚠） | 現行＋FR-058、FR-063 | 全部 |
| `planHash` | 字串（8 碼 hex） | 必有 | — | `work/hyperframes/plan.json` 檔案內容（原始位元組）sha1 前 8 碼；build 成功後同一個值寫進 `work/hyperframes/.build-manifest.json` 的 `planHash` | 新（FR-069） | 004 storyboard |
| `rhythm` | `"continuous"`／`"spaced"` | 必有 | — | plan.json 的 `rhythm`（沒寫＝`continuous`） | 新（FR-015） | 004、006 |
| `theme` | `"light"`／`"dark"` | 必有（出錯時 `null`） | — | plan.json 的 `theme`（沒寫＝`light`；寫錯時 `errors` 有一則 ✖、這裡是 `light`）。`dark` 時 build 換 `bg-*-dark.jpg`、所有 build 產生的合成 `<html data-theme="dark">` | 新（第二段 A） | 004 qc（qc-sheet 標主題）、006 剪輯台 |
| `format` | `"landscape"`／`"portrait"` | 必有（出錯時 `null`） | — | 這次用的版式（`canvas.mjs` 的 `resolveFormat`：`--format` > plan.json `format` > 開工決策表「版式」列 > 主軌寬高比） | 新（009 FR-006） | 003 audit、004 qc、006 剪輯台 |
| `canvas` | `[W, H]` | 必有（出錯時 `null`） | — | 畫布尺寸：橫式 `[1920, 1080]`、直式 `[1080, 1920]`（`specs/contracts/canvas.md`） | 新（009 FR-006） | 同上 |
| `formatSource` | `"flag"`／`"plan"`／`"progress"`／`"media"`／`"default"` | 必有（出錯時 `null`） | — | 版式從哪裡來（`default`＝沒有專案資料夾、什麼都讀不到時的橫式） | 新（009 FR-006） | 007 |
| `versions` | 物件 | 必有 | — | `{ hyperframes: { pinned, installed, ok } }`；`pinned` 是根目錄 package.json 的值、`installed` 是 `node_modules/hyperframes/package.json` 的 `version` 或 `null` | 新（FR-050） | 007 |
| `videoDur` | 數字 | 必有（出錯時 `null`） | rough | rough.mp4 長度（對齊格） | 現行 | 004、006 |
| `outputDur` | 數字 | 必有（出錯時 `null`） | 完成影片 | 完成影片長度（有片尾卡時含片尾卡＝`resolvePlan().finalDur`，033） | 現行 | 004 final |
| `ending` | 物件或 `null` | 必有（出錯、沒設定片尾、這一集關掉、直式時 `null`） | 完成影片 | 片尾模板（033，`lib/ending.mjs`）：`{ at, dur, quote, quoteFrom, subscribe, notes }`；`at`＝影片（講者）結束、片尾卡從這裡接 `dur` 秒（只有訂閱動畫時 `dur` 是 0）；`quote`＝片尾金句（分段用「，」接）、`quoteFrom`＝來源；`subscribe`＝訂閱動畫跟的句號或 `null`；`notes`＝沒放的原因 | 新（033） | 004 qc final（片尾卡不判凍結／黑畫面／無聲）、停點 ③ |
| `voiceOnly` | `[[起, 迄]]` | 必有 | rough | 只有聲音的區間（rough.mp4 全黑）。專案沒有純聲音素材時一律是 `[]`（全黑改列在 `roughBlack`） | 現行 | 006 |
| `roughBlack` | `[[起, 迄]]` | 必有 | rough | 初剪壞掉的全黑區間：rough.mp4 全黑、但 `素材/聲音/` 是空的而且 `work/main.json` 沒有 `kind: "voice"`；相鄰 ≤ 0.1 s 的黑段併成一段。不是空的時候 `errors` 一定有 §2.4 那則 ✖ | 新（round 2，F2） | 004 qc final |
| `voiceUncovered` | 物件[]（§2.1） | 必有 | rough＋完成影片 | 只有聲音、而且沒被 media 段或不透明全畫面蓋住的區間（長度 > 0.1 s 才列，FR-029） | 新 | 006（紅色斜線）、004 |
| `uncovered` | 物件[]（§2.1） | 必有 | rough＋完成影片 | 沒有任何卡片、動畫或素材的講解區間（> 1.0 s，FR-011） | 新 | 006（灰色斜線）、004 |
| `cutpoints` | `[{ at, kind }]` | 必有 | rough | `work/cutpoints.json` 讀進來的剪接點（`kind` 是 `ng`／`pause`） | 現行 | 006 |
| `chapters` | 物件[]（§2.2） | 必有 | rough＋完成影片 | 每個章節起點：01 章節轉場，以及（常駐角標開著時）沒有 01 的獨立 02 章節角標段；依起點排序 | 新 | 004、006 |
| `items` | 物件[]（§3） | 必有（plan 沒解出時間時 `[]`） | 見 §3 | 每段 | 現行＋新 | 全部 |
| `sfxCount` | `{ 名稱: 次數 }` | 必有 | — | 全片每種音效的次數（主＋附加；3 秒規則之後；不含配樂）＝005 `sfxBudget().count` | 新（FR-058） | 004、006 |
| `sfxBudget` | 物件（§2.3） | 必有 | rough | `{ perMinuteAvg, over, dense, loud }`，`sfxBudget()` 的回傳去掉 `count`、`levels`、`warnings`、`lines` | 新（FR-058） | 006 |
| `moods` | 物件[] | 必有（沒有情緒點＝`[]`） | rough | 情緒點（plan.json `moods`，023）：`{ i, kind, at, outAt, sfx, dropped, off, zoom }`；`i`＝moods 的第幾個、`at`＝rough.mp4 秒數（詞的開口）、`outAt`＝完成影片秒數、`sfx`＝最後出聲的音效（取捨拿掉＝`null`，`dropped` 寫原本那顆）、`off`＝寫了 `"sfx": null`、`zoom`＝這個點有推近 | 新（023） | 剪輯台音效軌、分鏡表情緒點表 |
| `outro` | 物件或 `null` | 必有 | rough | `{ music, start, dur, aligned }`；沒寫 `outro` 或 `music: null` 時 `null`（`cli-005.md` §3.5） | 新（FR-054） | 004 final、006 |
| `edit` | 物件 | 必有（出錯時 `null`） | rough | 正規化後的 `edit`（`normalizeEdit`，`edit.mjs`） | 現行 | 006 |
| `paths` | `{ project, video, plan, out }` | 必有（出錯時 `{}`） | — | 相對工作區根目錄的路徑 | 現行 | 004、006 |

### 2.1 `uncovered[]`、`voiceUncovered[]`

```json
{ "start": 41.2, "end": 47.9, "outStart": 41.2, "outEnd": 47.9, "len": 6.7 }
```

| 鍵 | 意思 |
|---|---|
| `start`／`end` | rough.mp4 秒數 |
| `outStart`／`outEnd` | 完成影片秒數 |
| `len` | 完成影片秒數的長度（`outEnd − outStart`） |
| `level` | 只有 `voiceUncovered` 有：`"error"`（> 1.0 s，✖）或 `"warn"`（> 0.1 s，⚠） |

依起點排序；兩個陣列不重疊（`uncovered` 先扣掉只有聲音的區間，FR-011）。

### 2.2 `chapters[]`

```json
{ "id": "s07", "kind": "chapter", "num": "01", "cue": 11, "title": "痛點", "start": 38.6, "end": 41.1, "outStart": 38.6, "outEnd": 41.1,
  "gap": 3.2, "placement": "centered", "captionsClipped": [10], "badge": [[41.1, 77.2], [90.2, 100.0]], "outBadge": [[41.1, 77.2], [90.2, 100.0]] }
```

| 鍵 | 型別 | 意思 |
|---|---|---|
| `id` | 字串 | 章節段的 id |
| `cue` | 整數 | 綁的句號（plan.json `at`／`from` 的 `#N`） |
| `title` | 字串 | 章名（slots 的 title，現行 01 的欄位） |
| `start`／`end` | 數字 | rough.mp4 秒數；`end − start` 是 2.5 s（`scenes/01-chapter/scene.json` `duration.fixed`），不含墊底延長 |
| `outStart`／`outEnd` | 數字 | 完成影片秒數 |
| `gap` | 數字 | 第 `cue` 句前的空檔（完成影片秒數：前一句結尾到第 `cue` 句起點；第一句時＝它的起點） |
| `placement` | `"centered"`／`"flush"`／`"cover"` | 空檔 ≥ 2.8 s 置中；2.0–2.8 s 結尾貼齊第 `cue` 句；< 2.0 s 從第 `cue` 句起點蓋（壓人聲，有 ⚠，FR-005–FR-006） |
| `captionsClipped` | 整數[] | 因章節被提早收或延後出現的字幕句號（FR-007） |
| `kind` | `"chapter"`／`"tag"` | `chapter`＝01 章節轉場；`tag`＝沒有 01、由獨立 02 章節角標段開始的章節（round 2，F1）。`tag` 的 `cue`、`gap`、`placement` 是 `null`、`captionsClipped` 是 `[]`，`start`／`end` 是那段 02 的起訖 |
| `num` | 字串 | 章節號碼（slots 的 `num`） |
| `badge` | `[[起, 迄]]` | 常駐章節角標實際露出的區間（rough.mp4 秒數；規則見 §2.5）。`plan.json` 寫 `"chapterBadge": false`、或整章都在子母畫面／全幕裡時是 `[]` |
| `outBadge` | `[[起, 迄]]` | 同上，完成影片秒數 |

### 2.3 `sfxBudget`

照 `contracts/sfx.md` §4.3、`cli-005.md` §3.5，時間換回 rough.mp4 秒數：

```json
{ "perMinuteAvg": 1.8,
  "over":  [ { "name": "thunder", "n": 4, "max": 3, "cues": [ { "id": "s03", "at": 12.4 } ] } ],
  "dense": [ { "from": 0, "to": 60, "n": 4, "ids": ["s01", "s02", "s03", "s04"] } ],
  "loud":  [ { "id": "s05", "name": "chapter", "at": 62.4, "relDb": -1.0 } ] }
```

`dense[].from`／`to` 是**完成影片**的分鐘邊界（`floor(at/60)` 分組，005 定義），不換算。

### 2.4 初剪全黑（`roughBlack`，round 2 F2）

專案沒有純聲音素材（`素材/聲音/` 是空的、`work/main.json` 沒有 `kind: "voice"` 的段），rough.mp4 卻有全黑區間（blackdetect `d=0.3 pix_th=0.02 pic_th=0.998`，和「只有聲音」同一組）→ 不當成只有聲音（`voiceOnly` 是 `[]`，子母畫面照放），`errors` 加一則（build 也停）：

```
work/rough.mp4 在 1:56.14–2:33.51 是全黑，但素材沒有純聲音檔 → 初剪壞了：跑 node shared/template/tools/media.mjs verify-rough --project projects/<專案>
```

區間 `m:ss.ss–m:ss.ss`，幾段用「、」接（例 `0:53.91–0:55.62、1:56.14–2:33.51`）。004 的 `qc.mjs final` 引用這則訊息與 `verify-rough` 這個指令名，改名要先通知 004。

### 2.5 常駐章節角標（`chapters[].badge`，round 2 F1）

- ⚠ 原文：`<it.where> 02 章節角標整段（<m:ss.ss>–<m:ss.ss>）被 <coverId> 蓋住，畫面看不到，只當章節起點用 → 要看到角標就把它的 from 移到疊加段，或刪掉這段只留 chapterBadge`。其他單一不透明段覆蓋 02 整段時警告（起迄容許 0.05 s 誤差）。
- 開關：plan.json 第一層 `"chapterBadge": false` 關掉（不寫＝開）。值不是布林 → ✖ `chapterBadge 只能是 true 或 false（不寫＝true：章節角標自動常駐右上角），現在是 <值> → 不要常駐角標就寫 false，否則刪掉這個欄位`。
- 章節起點：01 章節轉場**結束**時；沒有 01 時是獨立 02 章節角標段的**起點**（號碼和前一章相同的 02 段不另起一章）。
- 章節終點：下一章的起點（01 的起點或 02 的起點）、`outro.from` 那一句的起點、片尾，取最早的。
- 隱藏：不透明的段（子母畫面 `pip`、全幕 `full`：04 全畫面家族、01 章節、`bg` 不是 none 的 fx、`layout: "fullscreen"` 的 custom、media）期間淡出 0.3 s、段結束後淡入 0.3 s；兩段不透明之間空 ≤ 0.6 s 時不露出；露出不到 0.3 s 的片段不列。
- 和疊加情境的衝突（模板實際座標；角標 `[1200, 56, 1824, 168]`）：05 兩側右卡 `[1320, 211, 1824, 819]`（頂 211 > 角標底 168）、03 側邊欄面板 `[0, 0, 960, 1080]`（右緣 960 < 角標左 1200）、12 關鍵詞 `[120, 160, 560, 870]` → **都不衝突，角標留著**。其他疊加情境的字卡都在 y ≥ 520。custom（overlay）與透明 fx 不量（003 的 audit 看畫面）。
- 主合成：每章一個 `<div id="chb-<k>" class="sc-chtag" data-chapter-badge="起–迄">`（z-index 25：一般情境 20 之上、不透明幕 30 之下），進場同 02（右邊 16 px 滑入＋淡入 0.5 s），章節結束前 0.3 s 淡出。02 段本身不放 host（音效照放）。
- 角標**不是** `.clip`（`hyperframes lint` 會把有子元素的 clip 報成 `nested_structure_needs_subcomposition`）：時間 0 設 `opacity` 初值、之後的露出／隱藏全由 GSAP 的 opacity tween 決定，`data-chapter-badge` 只是給人看的起訖。
- `chtag: true`（舊的附件角標）保留相容：開著常駐角標時不畫附件，⚠ `[s05 concept] chtag：不用寫，角標現在自動常駐 → 刪掉 "chtag": true（要舊的附件角標，plan.json 第一層寫 "chapterBadge": false）`。

### 2.6 文字對時（round 2 F4；✖／⚠ 進 `errors`／`warnings`）

**量什麼**：每段主文字欄的「出現秒數」和「講到那幾個字的秒數」（完成影片秒數）。

| 情境（scene key） | 欄位 → 出現秒數由誰決定（改法寫哪裡） |
|---|---|
| 03 `side-panel` | `title` → `beats.head`；`items[i]` → `slots.items[i].at` |
| 04a `fs-list` | `title` → 段起點（`from`）；`items[i]` → `slots.items[i].at` |
| 04b `fs-compare` | `title` → `from`；`left[i]`、`right[i]` → `slots.left[i].at`、`slots.right[i].at` |
| 04c `fs-flow` | `title` → `from`；`nodes[i]` → `slots.nodes[i].at` |
| 04d `fs-table` | `title` → `from`；`rows[i]`（第一欄）→ `slots.rows[i].at` |
| 05 `two-sides` | `cards[i]` → `slots.cards[i].at` |
| 06 `concept` | `text` → `beats.in` |
| 07 `key-point` | `lead` → `from`；`key` → `beats.keyAt`（round 2 新增；預設 `{{in}} + P.BEAT`，和舊版同一拍；主音效跟著 `keyAt`） |
| 08 `steps` | `steps[i]` → `slots.steps[i].at` |
| 09 `qa` | `q` → `beats.in`；`a` → `beats.aAt` |
| 10 `tips` | `title`、`desc` → `beats.in` |
| 11 `summary`、15 `quote` | `text` → `beats.in` |
| 12 `keywords` | `items[i]` → `slots.items[i].at` |
| 13 `title-list` | `title` → `from`；`items[i]` → `slots.items[i].at` |
| fx（字卡動態） | `vars.text` → `from` |
| 不量 | 01 章節、02 章節角標、14 講者介紹；custom（情境動畫的站名由 003 的 audit 量） |

**對到哪一句、哪個詞**：欄位文字去掉 `**`、`//`、空白、標點（NFKC、小寫）後，和這段起點前 15 s 到終點後 15 s 內每一句 rough.srt 比「最長共同子字串」（round 2b 起以「單位」比）：
- 單位：中文一個字一個單位（權重 1）；英文／數字一整個 token（原文相連的 `[a-z0-9]`）一個單位（權重＝字數），只能整個對，不從中間切。中文數字 `零〇一二兩三四五六七八九` 當成 0–9、數字後面的「個」不算（卡片「1 小時」對得到字幕「一個小時」）。
- 相同部分的權重至少 3 才算對到（`TEXT_SYNC.minMatch`）：中文要連續 3 字以上；「AI」（2）、「工具」（2）這種到處都有的不猜，「AI 工具」（4）、「Podcast」（7）、「1 小時」（3）可以。對不到＝不報。取權重最大的那句，一樣大取起點離出現秒數最近的句。
- 詞＝那段相同的單位，最多 4 個字寬（中文 1、英數每字 0.5），英文／數字 token 不切開（第一個 token 超過 4 個字寬也整個用）；寫回時用字幕原文的那一段（含中間的標點）。

**關掉這條規則**：plan.json 第一層 `"check": { "textSync": false }`（plan-fields.md）。只給示意／預覽用的 plan（例 004 的 `qc.mjs framing --cards` 示意卡，文字跟字幕無關）；寫在專案正式的 `work/hyperframes/plan.json` 時 build／`--check` 會 ⚠：

```
plan.json 寫了 "check": { "textSync": false }，這次沒檢查「文字對時」→ 這只給示意／預覽用的 plan；正式 plan.json 刪掉 check，照 --check 的「文字對時」改時間
```

`check` 格式錯誤是 ✖：`check 要是物件（例 "check": { "textSync": false }），現在是 … → 正式 plan.json 不用寫這個欄位，刪掉`、`check 沒有「x」這個欄位（只有 textSync）→ 刪掉`、`check.textSync 只能是 true 或 false，現在是 … → 正式 plan.json 刪掉這個欄位`。

**講到的秒數**：有詞級逐字稿（`work/transcript.json`，條件見下）就用那句前後 1.5 s 內這個詞第一個字的起點；整個詞找不到時找詞裡最長的一段（≥ 2 字，逐字稿聽成別的字時）再往前推「少掉的字數 × 這段每字中位秒數」；都找不到、或沒有詞級逐字稿 → 字數比例（同 `#N@詞` 的舊算法），訊息尾巴加註。

**判定**：差＝出現秒數 − 講到的秒數。|差| < 0.6 s 不報；0.6–1.5 s ⚠；> 1.5 s ✖。找不到對應句不報。原文（`errors`／`warnings` 裡一樣，不含 `✖ `／`⚠ `）：

```
文字對時：s07 的 key「放到電腦才看得出」在 0:28.84 出現，「到電腦」0:34.84（#20）才講到 → beats.keyAt 寫 "#20@到電腦"
文字對時：s21 的 items[1]「按下結束，影片回傳電腦」在 2:05.04 出現，「按下結束」2:02.72（#59）就講到了，晚了 2.32s → slots.items[1].at 寫 "#59@按下結束"
文字對時：s22 的 fx vars.text「1 小時」在 2:08.78 出現，「一個小時」2:12.87（#64）才講到 → from 寫 "#64@一個小時"
```

尾巴加註：沒有詞級逐字稿 →「（沒有詞級逐字稿，講到的秒數用字數比例估）」；有逐字稿但找不到這個詞 →「（逐字稿裡找不到這個詞，講到的秒數用字數比例估）」。

**`#N@詞` 的真實時間**（`from`／`to`／`at`／`beats`／清單 `at`／custom 的 `P.at`／`clicks`／`outro.from` 都適用）：build 讀 `work/transcript.json`（剪乾淨第 6 步對 rough.mp4 轉的，`[{ text, start, end }]`），**不比 rough.mp4 舊（容許 1 s）、最後一個詞的結尾和 rough.srt 最後一句的結尾差 ≤ 2 s** 才用；有 `edit.cuts` 時詞的時間跟著換成完成影片秒數。用不到時退回字數比例，整份報告一則 ⚠：

```
#N@詞 有 2 個用字數比例估（沒有 work/transcript.json（rough.mp4 的詞級逐字稿）），可能差 1 秒：#20@放到電腦、#64@一個小時 → 對 rough.mp4 重轉詞級逐字稿：npx hyperframes transcribe projects/<專案>/work/rough.mp4 -d projects/<專案>/work --model small --language zh --json
```

原因的其他寫法：`work/transcript.json 比 rough.mp4 舊（不是這支初剪轉的）`、`work/transcript.json 的長度（Xs）和 rough.srt（Ys）對不上`、`work/transcript.json 不是合法的 JSON`、`work/transcript.json 的格式不是 [{ text, start, end }]`；逐字稿在、只是找不到詞時是 `詞級逐字稿在那句附近找不到這些詞`，改法換成 `詞照字幕原文挑 2–4 個字；逐字稿聽成別的字時換相鄰的詞`。

### 2.8 字幕（F8；⚠ 只進文字報告與 `warnings` 的最後面，和其他字幕提醒同一處）

`kit/captions.css` 照剪映：76 px／字重 400／行高 71／內距 24 37 23／黑底 0.7 直角／寬度貼合／`bottom: 6px` → 底板 y 956–1074（高 118）、字高約 70。估寬 `captionWidth`（`lib/captions.mjs` 的 `CAPTION`）：全形 76、半形 40、空白 19、左右內距共 74（18 個全形＝1442 px）；超寬門檻 1840（兩側各留 40）。

| 規則 | 等級 | 原文 |
|---|---|---|
| 一則 > 18 字（照舊） | ⚠ | `字幕 #12「…」19 字，超過 18 字 → 在 rough.srt 拆成兩則（斷在標點處）` |
| 估寬 > 1840 px | ⚠ | `字幕 #12 估寬 1880px，超過 1840px → 在 rough.srt 拆句` |
| 含「，。；：」（新） | ⚠（整份一則） | `字幕含句中標點「，。；：」：#2、#5、#7 等 12 則 → 字幕不顯示這四種標點（保留「、！？」），跑 media.mjs srt-align 或在剪輯台改` |
| 每則 < 0.6 秒（新；剪映最短 0.73） | ⚠（整份一則） | `字幕不到 0.6 秒：#3、#9 → 在剪輯台和前後句合併，或把起迄拉長` |

句號清單最多列 8 個，超過寫「等 N 則」。

### 2.7 講者調光瘦臉（C-14 的決定：維持 ⚠）

`lookCheck`（006）回的 ⚠ 原樣進 `warnings`，包括開頭是 `build 會停下來：` 的那則，**不改成 ✖**。理由：
1. `--check` 檢查的是 plan.json 寫得對不對，分鏡表草稿、剪輯台每次存檔都要跑；瘦臉底片是不是最新和 plan 無關，改成 ✖ 會讓 `ok: false`、擋住剪輯台與 004 的 storyboard 截圖。
2. 不會卡住弱模型：build 停下來時印同一則 ✖＋指令；`status.mjs` 在構圖預覽與 build 之前就會先叫 `look.mjs` 的下一步（C-01，cli-002 §5.1）。
3. 合成流程（`dev/check-all.mjs`）是「`--check` → `look.mjs run` → build」，改 ✖ 要先把 look 移到 `--check` 前面。

要改成 ✖ 時只動 `build.mjs` 的 `lookCheck` 那三行（把前綴是「build 會停下來：」的那則移到 `errors`、去掉前綴），並同步改 check-all 的順序。

## 3. `items[]`（每段一筆，依 plan.json 順序；`edit.cuts` 整段剪掉的段不列）

| 鍵 | 型別 | 必有／選填 | 時間基準 | 意思 | 從哪來 |
|---|---|---|---|---|---|
| `id` | 字串 | 必有 | — | 段 id | 現行 |
| `type` | `"scene"`／`"fx"`／`"custom"`／`"media"` | 必有 | — | 段的種類 | 現行 |
| `label` | 字串 | 必有 | — | 報告的「情境」欄（例 `04a 全畫面清單`） | 現行 |
| `key` | 字串 | 必有 | — | scene 的資料夾名（例 `04a-fs-list`）、fx 的名稱、custom 的 `src` 檔名（不含路徑）、media 的 `src` | 新 |
| `family` | 字串 | 必有 | — | `chapter`、`edge`、`panel`、`fullscreen`、`lower-third`（scene 的家族，`scenes/<資料夾>/scene.json` 的 `family`）；`fx`；`custom`；`media` | 新 |
| `layout` | `"overlay"`／`"side"`／`"pip"`／`"full"` | 必有 | — | 實際版面（不是 plan 寫的）：`side`＝03 側邊欄；不透明而且這段有任何子母畫面片段＝`pip`；不透明而且沒有子母畫面＝`full`；其他＝`overlay` | 新 |
| `layoutZh` | `"疊加"`／`"半畫面"`／`"子母畫面"`／`"全幕"`；直式 `"疊加"`／`"上下分割"`／`"全幕"` | 必有 | — | `layout` 的中文（AGENTS.md「剪好看」第 6 步的四個版面名）。直式時 `pip` 叫「上下分割」，`side` 不會出現（03 直式 ✖），`layout` 機器值不變 | 新（直式：009 FR-006、FR-042） |
| `opaque` | 布林 | 必有 | — | 會不會整張蓋住講者 | 新 |
| `start` | 數字 | 必有 | rough | 起點 | 現行 |
| `end` | 數字 | 必有 | rough | plan.json 寫的迄點（剪輯台拖邊緣用） | 現行 |
| `shownEnd` | 數字 | 選填 | rough | 畫面上實際停到哪裡（換卡、墊底、被蓋過時才和 `end` 不同） | 現行 |
| `sfx` | `[{ name, at, volume, db }]` | 必有 | rough | 這段的主音效＋附加音效 | 現行 |
| `warnings` | 整數 | 必有 | — | 這段的 ⚠ **則數**（文字在第一層 `warnings`） | 現行 |
| `src`、`enter`、`exit`、`volume`、`kind` | — | 只有 media | — | 現行（`kind` 是 `video`／`image`） | 現行 |
| `out` | 物件（§3.1） | 必有 | **完成影片** | 完成影片秒數的時間資訊 | 新（`contracts/media.md` §7＋本線） |

### 3.1 `items[].out`（完成影片秒數）

```json
"out": {
  "start": 61.9, "end": 70.2,
  "lists": [63.1, 64.6, 66.0],
  "annotations": { "marks": [], "callouts": [], "spot": [], "steps": [], "arrows": [], "lens": [] },
  "pip": [ { "start": 61.9, "end": 70.2, "enter": "fly", "exit": "layer" } ],
  "wipe": { "in": false, "out": true, "preroll": 0, "postroll": 0 },
  "refs": { "#18": 43.2, "#18@剪輯清單": 44.05 }
}
```

| 鍵 | 誰有 | 意思 |
|---|---|---|
| `start`／`end` | 每段 | 畫面上實際的起迄（含自動延長、墊底；`it.start`／`it.end`） |
| `lists` | 有條列的 scene | 每條進場的完成影片秒數（`it.start + it.resolved.listTimes[key][i]`，所有 key 攤平、依時間排序）；沒有條列時 `[]` |
| `annotations` | media 段 | 004 `validateMedia()` 回傳的 `json`（`contracts/media.md` §4.1）；不是 media 時 `null` |
| `pip` | 每段 | 子母畫面片段 `[{ start, end, enter, exit }]`：`enter` 是 `"fly"`／`"fade"`／`"none"`，`exit` 是 `"layer"`／`"fade"`／`"none"`（spec FR-022、FR-026）；沒有子母畫面時 `[]` |
| `wipe` | 每段 | `{ in, out, preroll, postroll }`：`in`／`out` 布林（這段擦入／擦出，FR-030）；`preroll`／`postroll` 秒數（只有 media 段可能 > 0，FR-032） |
| `refs` | custom 段 | build 從 `x-*.html` 掃出的 `P.at('…')` 與 `P.sfx('名', '…')` 的 ref 字面值 → 完成影片秒數（`contracts/cues.md` §2 的 `segs[id].refs`）；不是 custom 時 `{}` |
| `tx` | 每段 | 轉場語彙（`specs/010-motion-v2/design-system.md` §5）`{ in, out, prev }`（`prev`＝前一段是什麼：`speaker`／`fullscreen`／`pip`，見 `plan-fields.md` §4）。`in`：`band`（疊加卡進場、講者慢推）／`wipe`（色帶帶路擦開＋講者飛進子母畫面）／`swap`（換卡不換景）／`chapter`（主色色塊從左下斜擦）／`side`／`fade`／`media`／`wipeIn`／`cut`／`overlay`；`out`：`band`（收卡、講者推回）／`retract`（色帶反向收、子母畫面淡出）／`swap`（舊卡擦掉）／`cover`／`hold`／`handoff`／`fade`／`media`／`wipeOut`／`side`／`cut`／`overlay`（第二段 B） |
| `pipShift` | media 段 | 子母畫面相對畫布右下的位移 `[dx, dy]`：橫式錄影段移進素材右下角（`lib/media.mjs` 的 `pipShift`）；沒有移（只碰到素材邊邊、鋪滿、`tape`、右側步驟清單、沒有小視窗）或其他段 `null` |
| `wide` | 每段 | 布林：全寬版型（沒有講者的全畫面段：主卡 1680、背景只留底色；內容設計動畫用全螢幕畫布） |
| `badgeBox` | 全畫面段 | 右上角小節角標的框 `[x0, y0, x1, y1]`，沒有小節（`sections`）時 `null` |

custom 段 `x-*.html` 的 `P.sfx('名', '#N…', off)`（`contracts/motion.md` §5）由 build 靜態解析成附加音效：出現在 `items[].sfx`（`sfx-<id>-e<n>` 的 `<audio>`），時間＝ref 的完成影片秒數＋off − 音效的 peak＋1 格；算進 `sfxCount`、`sfxBudget`（tick、click 以外的算主音效密度），不受主音效 3 秒規則；段的 `sfxExtra: false` 整段關掉、`sfxVolume` 一起調。

**qc 截圖時刻**照 `cli-004.md` §2.2 用 `out.start`、`out.end`、`out.lists`、`out.annotations`；本表其他鍵是給剪輯台和除錯用。

## 4. 範例（節錄，範例專案、沒有 cuts）

```json
{
  "schema": 2, "ok": true, "errors": [],
  "warnings": ["[s05 07 重點] 和前一段 s04 之間只空 0.40s，講者會閃一下 → s04 改 \"to\": \"#21\"（0 秒相接），或拉開到 1.0s 以上"],
  "planHash": "3f9a01c2", "rhythm": "continuous", "theme": "light", "format": "landscape", "canvas": [1920, 1080], "formatSource": "default",
  "versions": { "hyperframes": { "pinned": "0.8.221", "installed": "0.8.221", "ok": true } },
  "videoDur": 182.4, "outputDur": 182.4,
  "voiceOnly": [], "voiceUncovered": [],
  "uncovered": [ { "start": 41.2, "end": 47.9, "outStart": 41.2, "outEnd": 47.9, "len": 6.7 } ],
  "cutpoints": [ { "at": 12.34, "kind": "ng" } ],
  "chapters": [ { "id": "s07", "cue": 11, "title": "痛點", "start": 38.6, "end": 41.1, "outStart": 38.6, "outEnd": 41.1, "gap": 3.2, "placement": "centered", "captionsClipped": [] } ],
  "items": [
    { "id": "s04", "type": "scene", "label": "04a 全畫面清單", "key": "04a-fs-list", "family": "fullscreen",
      "layout": "pip", "layoutZh": "子母畫面", "opaque": true,
      "start": 30.1, "end": 37.9, "sfx": [ { "name": "whoosh", "at": 29.98, "volume": 0.5, "db": -6 } ], "warnings": 0,
      "out": { "start": 30.1, "end": 37.9, "lists": [31.2, 32.6, 34.0], "annotations": null,
               "pip": [ { "start": 30.1, "end": 37.9, "enter": "fly", "exit": "layer" } ],
               "wipe": { "in": false, "out": false, "preroll": 0, "postroll": 0 }, "refs": {} } }
  ],
  "sfxCount": { "pop": 3, "whoosh": 1, "tick": 3 },
  "sfxBudget": { "perMinuteAvg": 1.3, "over": [], "dense": [], "loud": [] },
  "outro": null,
  "edit": { "cuts": [], "fadeIn": 0, "fadeOut": 0, "volume": { "voice": 0, "sfx": 0, "media": 0 }, "gains": [], "joins": [] },
  "paths": { "project": "projects/範例", "video": "projects/範例/work/rough.mp4", "plan": "projects/範例/work/hyperframes/plan.json", "out": "projects/範例/work/hyperframes" }
}
```

## 5. 出錯時（`build.mjs:594`）

讀不到 plan.json、找不到專案這類丟錯的情況，stdout 仍只印一個 JSON，鍵和 §2 相同：

```json
{ "schema": 2, "ok": false, "errors": ["<訊息>"], "warnings": [], "planHash": null, "rhythm": null, "theme": null,
  "format": null, "canvas": null, "formatSource": null,
  "versions": { "hyperframes": { "pinned": null, "installed": null, "ok": false } },
  "videoDur": null, "outputDur": null, "ending": null, "voiceOnly": [], "roughBlack": [], "voiceUncovered": [], "uncovered": [], "cutpoints": [],
  "chapters": [], "items": [], "sfxCount": {}, "sfxBudget": { "perMinuteAvg": 0, "over": [], "dense": [], "loud": [] },
  "outro": null, "edit": null, "paths": {} }
```

結束碼：`ok` 是 `false` → 1，否則 0（現行）。

## 6. 版本紀錄

| schema | 日期 | 變更 |
|---|---|---|
| 1 | （現行，沒有 `schema` 鍵） | `ok errors warnings videoDur outputDur voiceOnly cutpoints items edit paths` |
| 2 | 2026-10-31 | 加 `schema planHash rhythm versions voiceUncovered uncovered chapters sfxCount sfxBudget outro`；items 加 `key family layout layoutZh opaque out`。既有鍵不變 |
| 2 | 2026-10-31（F8） | 字幕 ⚠ 兩條（§2.8），估寬門檻 1600 → 1840。不加欄位 |
| 2 | 2026-10-31（round 2） | 加 `roughBlack`（`voiceOnly` 後面）；`chapters[]` 加 `kind num badge outBadge`，並列出獨立 02 段開始的章節；§2.6 文字對時、§2.7 C-14（維持 ⚠）。加欄位不升 schema |
| 2 | 2026-10-31（第二段 A） | 加 `theme`（`rhythm` 後面）。加欄位不升 schema |
| 2 | 2026-10-31（第二段 B） | `items[].out` 加 `tx`（`refs` 後面）；custom 段的 `P.sfx` 進 `items[].sfx`、`sfxCount`、`sfxBudget`。加欄位不升 schema |
| 2 | 2026-10-31（009 直式） | 加 `format`、`canvas`、`formatSource`（`theme` 後面）；`items[].layoutZh` 直式多「上下分割」。`errors` 多版式一致性 ✖（`canvas.mjs` 的 `formatErrors`：plan.json 和開工決策表不同、開工決策表直式但 plan.json 沒寫、主軌直拍但版式橫式、直式專案給橫式素材）。加欄位不升 schema |
| 2 | 2026-11-07（沒有講者的全螢幕） | `items[].out` 加 `wide`、`badgeBox`（`tx` 後面）。加欄位不升 schema |
| 2 | 2026-11-07（子母畫面移進錄影） | `items[].out` 加 `pipShift`（`pip` 後面）。加欄位不升 schema |

## 7. 測試（002 的 `dev/tests/build.test.mjs`）

1. 範例專案 `--check --json`：§2、§3 每個「必有」的鍵都在、型別相符。
2. 有 `edit.cuts` 的 fixture：`items[].start` ≠ `items[].out.start`，`uncovered[].start` 是 `tm.unmapStart(outStart)`。
3. 出錯 fixture（`--plan` 指向不存在的檔）：§5 的每個鍵都在、結束碼 1。
4. `planHash`：plan.json 加一個空白就變；build 後 `.build-manifest.json` 的 `planHash` 和 `--check --json` 相同。

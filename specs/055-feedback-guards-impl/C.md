# 055 包 C：plan 層與聲音

做了：Q1、Q4、k1（C02 字卡動態 `portraitMinPx` 與 `--check`）、k7（C07 模板 slots）、k15（C18）、k23（D4＋密度＋列出拿掉的）、k24（C19）、k27（N9）。全部在 `--check` 與 build 都印（`resolvePlan` 的 warnings）。

## 改了哪些檔

| 檔 | 改了什麼 |
|---|---|
| `shared/template/tools/lib/plan.mjs` | Q1 media 段 pip 預設；`imageBursts`（k15）、`cutSeams`（k27）、`slotRepeats`（k7）三個新的一節；`moodsAndSfxBudget` 加 k23、k24；fx 段 `portraitMinPx`（k1）；`jsonItems` 的 media 段多 `pip`；新門檻常數在檔頭（`BURST_*`、`SFX_STACK`、`CUT_*`、`REPEAT_*`） |
| `shared/template/tools/lib/moods.mjs` | Q4：`MOOD_KINDS.turn.sound` `shine` → `ding` |
| `shared/template/tools/lib/autofix.mjs` | 新修法 `whip`（k15） |
| `shared/template/tools/lib/captions.mjs` | 共用的 `isShortCaption(cue, min)`（`captionWarnings` 改用它；k27 用它） |
| `shared/template/tools/lib/build-summary.mjs` | `isSfxWarn` 多認「兩顆音效疊在一起」「同一顆音效連響兩次」（deliver 回報段會帶） |
| `shared/template/fx/catalog.json` | 40 支各加 `portraitMinPx`；第一層加 `portraitMinPx` 說明 |
| 交界的檔（最小插入） | `lib/scenes.mjs` `loadFx` 多帶 `portraitMinPx`（1 行）；`tools/qc.mjs` `wantsPip` 那一行（media 看 `--check --json` 的 `pip`）；`lib/media.mjs` `--list` 的 pip 那一列、pip 型別錯的 ✖ 訊息（兩行，只改「預設」的字） |
| 測試 | `plan.test.mjs`（Q1、k1、k7、k15 四項＋右側步驟清單那一項改寫 `pip: true`）、`moods.test.mjs`（Q4、k23 三項、k24；原本期待 shine 的三處改）、`autofix.test.mjs`（whip）、`edit.test.mjs`（k27）、`fixtures/032-p3e/trial1.json`（只有 k7 的 7 則 ⚠，見「留下的問題」） |

## 每一條：預設、門檻、訊息原文

### Q1 橫式錄影、圖片段預設不放小視窗

- `it.pip = portrait ? seg.pip !== false : seg.pip === true`（只改 media 段；04 全畫面家族、`layout: "fullscreen"` 的 custom 照舊；直式下半講者面板照舊）。
- `--check --json` 的 `items[]`：media 段多 `pip`（true／false，這段要不要小視窗；`specs/contracts/check-json.md` 還沒寫，G 或主代理補）。`qc.mjs` F2 的 `wantsPip`：media 段 `pip !== false` 才算該有（舊的 JSON 沒有這欄照舊算）。
- `media.mjs --list`：pip 那一列預設寫「橫式 false、直式 true」；寫錯型別的 ✖：`pip 只能寫 true（右下角子母畫面露臉；直式預設）或 false（整段不露臉；橫式預設），現在是 …`。
- `shared/style.md`、`REVIEW.md` P0（改成「錄影段以外的子母畫面一定有小視窗」）、`USAGE.md` 5.3 要改（G）。

### Q4 情緒點反轉的預設音效

- `turn` → `ding`（橫式直式一樣）。`shared/style.md` 第 339 行情緒點表 `turn` 那一列還寫 `shine`（G）。
- 每集上限換音效（shine 超過 3 次換 ding）的規則不變；寫 `"sfx": "shine"` 照樣能用。

### k1（C02）字卡動態直式小字

- 門檻：`CANVAS.portrait.minTextPx`（A 改成 48）。`portrait: "band"` 的卡不報這條（它已經有「直式只剩中間一條」）。
- 訊息：`[f1 fx 22] fx-22（文字軌道環繞）直式的小字只有 42px（< 48px）→ 換成 portraitMinPx ≥ 48 的特效（同類可用：19、20、23、24）或拿掉`（同類沒有：`同類 <類別> 沒有，換別類`）。
- `portraitMinPx` 怎麼量的（2026-11-16，headless Chrome，腳本留在 scratchpad 沒進 repo）：預設文字、1920×1080 排版，每 0.05 秒取樣，只算最上層看得到（`elementFromPoint`）、累積不透明度 ≥ 0.9 的字；每個元素取「連續 ≥ 0.4 秒字級差 ≤ 3%」最長那一段的字級（翻到一半、飛散中的不算），全卡最小的那個 × 0.5625 取整數。一直在動的卡（06 伸縮）取中位數；縱深卡 17、18、21 取 scale 1 的字級（深處的字是裝飾）；25 翻牌取靜止的字（211px）。
- 結果：ok 的卡只有 **22 文字軌道環繞＝42**（中間的「軌道環繞」75px）低於 48；band 的 09＝36、21＝43。其他：01 154、02 292、03 118、04 167、05 146、06 163、07 144、08 112、10 56、11 57、12 170、13 63、14 68、15 106、16 127、17 157、18 58、19 149、20 146、23 109、24 168、25 118、26 118、27 123、28 118、29 65、30 60、31 135、32 69、33 290、34 168、35 168、36 146、37 157、38 123、39 168、40 123。
- 量的是預設文字；文字越長字越小（`fitSize`），這條只照 catalog 的數字判。

### k7（C07）模板 slots 重複同一個詞

- 比的範圍：「標籤」欄（`REPEAT_LABELS`＝`tag`、`eyebrow`、`lead`）和同一張卡其他 `text`／`rich` 欄位（情境 `scene.json`、模板 `custom/<模板>.fill.json`）。**大字和大字、清單項目不比**：054 寫的是 tag、title、lead、key、text、items 全比，但試剪固定檔（trial1）會報 fs-list 的標題和項目（「同步錄影與回傳」和「多機同步錄影」），模板也有本來就一樣的欄（x-numbers 的 `unitA`／`unitB`、x-prompt 一句拆成幾段）；Q7 第 3 條講的是「標籤和大字」。
- 詞：連續 2 個中文字（不含虛字 `REPEAT_FUNC`：的了是在和與…）、3 個字母以上的英文（不分大小寫）。`tag` 只有幾個字（≤ 6 個中文字），有一個實字（扣掉 `REPEAT_TAG_FUNC`）出現在別欄就算——短影片5 是「課程」對「加入這堂課」，兩個字的詞抓不到。
- 訊息：`[s0106 concept] slots.tag「課程」和 slots.text「想了解怎麼做到？加入這堂課」都有「課」，同一張卡講了兩次 → slots.tag 換成別的詞（例：行動、重點、提醒），或 slots.text 拿掉「課」，上下兩行要互補`。
- 設計段（audit `dup-word`）是 A 的。

### k15（C18）連續圖片快切

- 門檻：只看整張幕這一層（透明字卡不打斷），連續 `BURST_RUN`＝3 段以上的圖片 media（`kind: "image"`）、每段（plan 寫的長度）≤ `BURST_MAX`＝2.5 秒、前一張結束到下一張開始 ≤ `BURST_JOIN`＝0.1 秒；第二張起進場是 `BURST_STATIC`（沒寫、`"cut"`、`"fade"`）才報。slide、zoom、whip、tape、tilt 本來就有動作，不報（054 寫「不是 whip 就報」，這裡放寬：作者抱怨的是硬切）。
- 訊息：`[m0109b media] 是連續 6 張快切圖片的第 2 張（每張 ≤ 2.5 秒），進場寫 "cut"，換圖太生硬 → 寫 "enter": "whip"（甩鏡；build.mjs --autofix 會自動寫）`（沒寫 enter 時是「進場是預設的淡入」）。
- `--autofix` 新修法 `whip`（「連續圖片甩鏡」）：那一段寫 `"enter": "whip"`（放在 `to` 後面），摘要 `m0109b：進場從 "cut" 改成 "whip"（連續圖片快切，甩鏡換圖）`。第一張不動。

### k23（D4）情緒點和動畫音效 3 秒內只出一顆

順序（`moodsAndSfxBudget`）：反應音效挪句尾 → **情緒點讓給動畫音效** → 3 秒規則 → **同一顆不連響** → 每分鐘上限（照實際出聲的算）→ 每集上限換音效 → **兩顆疊在一起 ⚠**。

1. 情緒點的音效和任一段動畫的 `P.sfx`（非 additive）起點相距 < 3 秒（`SFX_RULES.gapSec`）→ 情緒點不出聲，推近照留。報告一行（不是 ⚠）：`情緒點讓給動畫音效：moods[0]（#5@焦慮 痛點）→s0101 的 alert（0:06.50，相距 1.12 秒）；…（和動畫的 P.sfx 相距不到 3 秒只出一顆；推近照留）`。`--check --json` 的 `moods[].dropped` 寫讓掉的那顆。
2. 同一顆非 additive 音效 3 秒內響兩次（不管來源：段上、模板、動畫 `P.sfx`、等待卡、情緒點；秒針 tick、`edit.sfx` 不算）→ 拿掉後面那顆、⚠：`[x01 custom] 的 impact（動畫的 P.sfx，0:16.50）和 x01 的 impact（0:15.00）相距 1.5 秒（< 3 秒），同一顆音效連響兩次，已拿掉後面這顆 → 兩顆都要就把其中一顆換成別的音效；不要這顆就在 compositions/x-beat.html 拿掉那個 P.sfx`（段上的寫「在 <段> 寫 "sfx": null」、情緒點寫「在 moods[i] 寫 "sfx": null」、其他寫「在 <段> 寫 "sfxExtra": false」）。
3. 每分鐘上限、整支平均上限照上面兩步之後還出聲的算（讓位的情緒點不再佔名額，短影片2 x0107 的 impact 不會被擠掉）。被上限拿掉的列一行（不是 ⚠）：`音效上限拿掉的：x1 的 ding 0:57.00（動畫拍點）、s08 的 ding 1:38.10 → 想留哪一顆，就把同一分鐘別段的音效拿掉（段上寫 "sfx": null）；動畫拍點不要就在那段寫 "sfxExtra": false，結果才不會每次 build 不一樣`（最多列 8 顆）。原本「音效密度」那一行的「已自動拿掉 N 顆」照舊。

### k24（C19）兩顆音效疊在一起

- 門檻：`SFX_STACK`＝0.4 秒，比峰值（`at`＋那顆的 peak）；非 additive、不含秒針。
- 訊息：`[x01 custom] 的 alert（動畫的 P.sfx，0:15.23）和 x01 的 success（動畫的 P.sfx）只差 0.2 秒，兩顆音效疊在一起 → 留一顆：在 compositions/x-beat.html 拿掉其中一個 P.sfx`（兩顆在不同段時是「在 <段> 寫 "sfx": null，或在 <檔> 拿掉那個 P.sfx」）。
- 這條和「同一顆連響兩次」都算進 `isSfxWarn`（deliver 回報段會帶）。

### k27（N9）剪點旁的停頓與短字幕

只在有 `edit.cuts` 時。片頭片尾的 cut 只是裁掉，不算接點（和 `timeMap` 的 `joinsOut` 一樣）。

- (a) 字幕在完成影片不到 0.6 秒（`isShortCaption`，和 `captionWarnings`、`qc.mjs` F8 同一個 0.6）、而且是被 cut 剪短的（rough 裡本來 ≥ 0.6 秒；整則剪掉的不報；本來就短的由 `captionWarnings` 報）：`字幕 #29「以及資料的」剪掉一段（edit.cuts [33.52, 34.5]）後只剩 0.48 秒（< 0.6 秒）→ 在剪輯台把它併到相鄰那則，或把剪點收到字幕開頭（rough 0:33.75）`。
- (b) 停頓：rough 的人聲能量停頓 `cues.pauses`（沒有就用詞級逐字稿的空檔）。剪點前／後 `CUT_NEAR`＝0.3 秒內開始（中間最多隔 0.3 秒剪剩的殘字）、留在完成影片裡的長度 > `CUT_PAUSE`＝0.2 秒的停頓：
  - `剪點 0:33.60（edit.cuts [33.6, 34.1]）後面隔 0.20 秒還有 0.22 秒停頓 → 剪點的迄點延到 34.47（cuts 改成 [33.6, 34.47]），剪剩的殘字和停頓跟著剪掉`
  - `剪點 0:12.00（edit.cuts [12, 13]）前面隔 0.05 秒還有 0.35 秒停頓 → 剪點的起點提早到 11.65（cuts 改成 [11.65, 13]），停頓跟著剪掉`
  - 建議的新剪點留 0.05 秒（停頓起點＋0.05／終點−0.05）。剪點時間 `0:33.60` 是完成影片秒數，cuts 裡的數字是 rough 秒數（和 plan.json 一樣）。
- 054 的例子「0.24 秒停頓 → 延到 0:33.84」量不出來：bak-r10 的實際情形是剪點後 0.04 秒停頓、0.16 秒的「資」、再 0.22 秒停頓（作者改成 34.5 把三段一起剪掉），所以 (b) 要能跨過剪剩的殘字。

## 驗證（在 `/Volumes/auto-edit-projects/.tmp-055/C/` 的複本上）

| 項目 | 抱怨的那一版 | 改好的那一版 |
|---|---|---|
| Q1 | 主宣傳片 `plan.json.bak-r5`（錄影段沒寫 pip）：8 段 media 全部 `pip: false`、`layout: "full"`、沒有小視窗片段 | 現行版（都寫了 `pip: false`）版面不變 |
| k23 | 短影片4 `plan.json.bak-r6`＋`s0101/v4`、`x0103/v2` 的動畫檔：alert 只剩 s0101 動畫那一顆、shine 只剩 x0103 動畫那一顆，兩個情緒點都讓位 | — |
| k23 | 短影片2 拿掉 `moods[0].sfx: null`：情緒點讓給 x0101 的 alert，x0107 的 impact 照樣出聲（音效清單和現行版一樣） | — |
| k27 (a) | 短影片4 現行 cuts `[33.52, 34.5]`：報 #29 剩 0.48 秒 | — |
| k27 (b) | 短影片4 `plan.json.bak-r10`（cuts `[33.6, 34.1]`）：報「後面隔 0.20 秒還有 0.22 秒停頓 → 延到 34.47」 | 現行 `[33.52, 34.5]` 不報 (b) |
| k7 | 短影片5 `s0106/v2`（tag「課程」）報 | `v3`（tag「行動」）不報 |
| k15 | 短影片1 `m0109b–f/v1`（都是 cut）：m0109b–f 五段都報（連續 6 張） | `v2`（whip）不報 |
| k1 | 六支沒有用字卡動態；單元測試：直式 fx 22 報、01 不報、21（band）只報原本那條、橫式不報 | — |

六支 PPA 現行版本各跑一次 `build.mjs --check`（和改之前比，只算包 C 的訊息；其他新 ⚠ 是包 B 的錄影段檢查）：

| 專案 | 包 C 多報 | 音效清單 |
|---|---|---|
| 短影片1 | 0 | 不變 |
| 短影片2 | 0 | 不變 |
| 短影片3 | 0 | 不變 |
| 短影片4 | 1：字幕 #29 剩 0.48 秒（真的問題：「以及資」的聲音剪掉了，字幕還是「以及資料的」閃 0.48 秒；054／055 的驗證本來就要它報） | 不變 |
| 短影片5 | 0 | 不變 |
| 主宣傳片 | 0（多一行「情緒點讓給動畫音效：moods[2]→m0106 的 impact」，不是 ⚠） | moods[2] 的 impact 不響、改成 m0106 動畫拍點的 impact 響（同一刻、早 0.07 秒）；原本是情緒點響、拍點被每分鐘上限拿掉，現在沒有被上限拿掉的音效 |

測試：`plan` 58、`moods` 18、`edit` 14、`autofix` 17、`sfx` 15 全過。

## 留下的問題

- **032-p3e 快照**：`trial1.json` 已更新（差異只有 k7 的 7 則 ⚠：試剪固定檔 s04「工具」、s05「拍前」、s11「多機」、s14「單機」、s16「驗收」、s18「工具」的 tag 和正文重複，s19 lead／key 都有「自己」——照 Q7 第 3 條都算真的問題）。`kitchen-*.json` 有我的差異（m1、m2、m3 沒寫 pip → `pip: false`、`pipPieces: []`、`pipShift: null`；直式多一行「音效上限拿掉的：x1 的 ding、s08 的 ding」）也有包 B 的差異（`startBox`、`start`、`asStart`、`projectDir`、新的 ⚠），`validate-media.json` 只有包 B 的：我沒重產，等全部合併後主代理 `P3E_UPDATE=1` 一起重產、看 diff。
- **其他包的測試可能要改期待值（我沒跑）**：橫式 media 段沒寫 `pip` 的地方現在沒有小視窗——`media.test.mjs`、`media-cli.test.mjs`、`retime.test.mjs`、`qc-long.test.mjs`、`full-canvas.test.mjs`、`audit.test.mjs` 有經過 `resolvePlan` 的 media 段時要看；`foundation.test.mjs` 測 `isSfxWarn`（只多認兩種，舊的照舊）。
- **文件（G）**：`shared/style.md` 情緒點表 turn → ding（第 339 行）、螢幕錄影與圖片的小視窗、連續圖片 whip 現在工具會報＋autofix；`REVIEW.md` P0；`USAGE.md` 5.3 pip 預設；`specs/contracts/check-json.md` items 的 media `pip`；新 ⚠ 的說明照上面的原文。
- **054 G17 引的音效檢查報告另外三條沒做**（不在這次分配）：09 QA 答案的 ding 算主音效、shine 照片長的上限與動畫不能自挑 shine／sparkle、3 分鐘以下兩顆主音效間隔 > 25 秒 ⚠。第四條（被拿掉的動畫拍點列出來＋`sfxExtra: false`）併在「音效上限拿掉的」那一行。
- `portraitMinPx` 是照預設文字量的；文字比預設長時實際字更小，這條抓不到（要量就得在 audit 量真的頁面，A 的 C01 會量模板段）。
- `qc.mjs` F8 的 `captionTextChecks` 沒改成呼叫 `isShortCaption`（包 B 的檔，判斷一樣是 `< 0.6`）；要統一時把那一行的 `c.end - c.start < CAPTION.minDur - 1e-6` 換成 `isShortCaption(c)`（從 `lib/captions.mjs` 匯入）。

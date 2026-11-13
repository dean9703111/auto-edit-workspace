# B6 拍點只存一處（設計）

- 對應：032 決定單 B6（`brief.md:65`，第三階段）。狀態：設計定案（§8 五題都選 A），第二階段整合後照 §6 實作。
- 2026-11-13 寫，分支 `032-arch-optimizations`。行號是寫這份時的位置；第一、二階段的工作線正在改這些檔，實作前用函式名 `grep -n` 重新找。
- 路徑省略 `shared/template/tools/`。

## 0. 結論

拍點現在同時存在 plan.json 的 slots（模板段）、動畫檔的 `P.at`、`work/storyboard.md` 的「動畫分鏡」表、`work/designs/<段>.md` 四個地方。讀的工具各用不同的優先序，audit 和 build --check 都以 ③ 那時候凍結在 storyboard.md 的副本為準。模板段的動畫檔其實是 slots 產生的：slots 一改（主代理修【D 下限】、autofix 併拍）或動畫檔一手改（子代理），storyboard.md 就落後、audit 就報 ✖，子代理又不能改 storyboard.md。

設計：**每段一個正本**。動畫檔由工具照 slots 產生的段，正本是 plan.json；動畫檔是人寫的段（內容設計段、手改過的模板段），正本是 `work/designs/<段>.md`。storyboard.md 的動畫分鏡一律由工具從正本重產；讀拍點的工具只讀正本。原則：**誰改得到動畫檔，誰就改得到那段的正本**。

## 1. 現況

### 1.1 拍點存在哪幾份

| # | 在哪 | 誰寫 | 誰讀 |
|---|---|---|---|
| A | plan.json 模板段的 `slots`：`type: "at"` 的欄位（`openAt`、`hitAt`…，47 支模板的 fill.json 共 105 個）、清單項目的 `at`；`x-scene` 的 `slots.beats[]`（`at`、`in`、`state`、`focus`…）與 `parts` | 主代理（草稿、改段）；`--merge-drafts` 把 `auto` 補成 `#N@詞`；autofix 的 textSync、merge（`lib/autofix.mjs:311-322`）；剪輯台增刪字幕（`editor/subtitles.mjs:316` `remapPlan`）；`media.mjs srt-align --remap-plan` | build：`lib/custom-fill.mjs:209` `applyRefs` 把值寫進動畫檔的 `P.at('…')`；`:401` `sceneBeatCode` 產生 x-scene 的拍；`:560` `renderSheet` 照 fill.json 的 `sheet` 樣板產生動畫分鏡表 |
| B | 模板動畫檔 `compositions/<模板>-<段>.html` 的 `P.at` | build（`materializeFills`，`custom-fill.mjs:642`；手改過就不覆寫、只 ⚠，`:676-686`）；子代理照 `worker-brief.md` 手改 | audit 量 marks；build 對時 |
| C | `work/storyboard.md` 每段的 `#### 動畫分鏡 <段>`、`#### 插圖清單 <段>` | `--storyboard`（`lib/flow.mjs:1219` `storyboardRun` → `lib/storyboard-gen.mjs:139` `renderSection`：模板段照 slots、內容設計段抄 designs）；`--apply-storyboard`、`--to-design` 把剛勾成內容設計的段的表換成一行（`flow.mjs:1294` `dropBeatSheets`、`lib/plan-set.mjs:237`）；`versions.mjs` accept／use 整節覆寫、finish 從 designs 抄回（`versions.mjs:211` `syncDesignSheet`）；網頁可改「畫面上出現什麼」格子裡「」的字（`editor/storyboard-md.mjs:163`、`editor/storyboard.js:63-65,93`）；主代理手改（`BEATS.md:4,10` 說不要） | audit（優先）；build --check（優先）；`--review` 的重用雜湊；versions 快照；`media.mjs illus-lint` |
| D | `work/designs/<段>.md`（鏡位腳本：概念、畫面、`#### 動畫分鏡`、插圖清單） | 設計師；改內容設計段的子代理（worker-brief 允許） | `--storyboard`（`flow.mjs:1165` `loadDesigns`）；audit（比 storyboard.md 新才用）；build --check（最後才用）；versions 快照與還原；illus-lint |
| E | `compositions/x-design-<段>.html` 的 `P.at` | 設計師、子代理 | audit |
| F | 段上的 `__sheet`（記憶體） | `materializeFills` 照 slots 算（`custom-fill.mjs:672`，動畫檔手改過也照 slots 算）；autofix 的 `checkerOf` 每試一次重算（`build.mjs:644-661`） | audit、build --check（storyboard.md 沒這段才用）；autofix merge（只用它，`autofix.mjs:315`） |
| G | `work/versions/<段>/v<N>/`：`段落.json`、動畫檔、`鏡位腳本.md`（只有 `design: true`）、`分鏡.md`（storyboard.md 那一節的副本） | `versions.mjs:138` `snapshotOf`、`:309` `saveSeg`；提案的 `分鏡.md` 由 AI 改 | `use`（`:422`）整份還原，連 storyboard.md 那一節；`accept`（`:395`）把提案那節寫回 storyboard.md；版本雜湊不含 `分鏡.md`（`snapshotOf` 的 `hash`） |

### 1.2 讀的人各有各的優先序

| 讀的人 | 規則 | 位置 |
|---|---|---|
| audit 對拍 | storyboard.md 有這段就用它，沒有用 `__sheet`；內容設計段的 designs **修改時間**比 storyboard.md 新才用 designs | `audit.mjs:437-454`、`lib/audit-beats.mjs:99` `pickBeatSheet` |
| build --check 排拍（拍序、【D 下限】） | storyboard.md → `__sheet` → designs，不看時間 | `lib/plan.mjs:414-424,947` |
| autofix 併拍、延段尾 | 只看 `__sheet`（slots） | `lib/autofix.mjs:315` |
| `--review` 重用量測 | storyboard.md 的表＋designs 全文都算進雜湊 | `flow.mjs:1469-1474` `reviewNow` |

後果（看程式推得，沒有實測紀錄）：storyboard.md 存在之後（③ 之後），build --check 照它的舊表報「拍距不足」；autofix 照 `__sheet` 改 slots 併拍，`checkerOf` 重算的 `__sheet` 排在 storyboard.md 後面用不到，提醒不會消失，修法被退回。所以 `--apply-storyboard` 之後的自動併拍不會成功。

### 1.3 `--apply-storyboard` 怎麼套回網頁的修改

`applyStoryboard`（`storyboard-gen.mjs:326-444`）只套回畫面文字、音效、金句勾選、內容設計候選勾選、情緒點；「想換成」「補充說明」列成 requests 給 AI。**動畫分鏡表一格都不讀。**

- 網頁改了動畫分鏡格子裡「」的字：不套回。`--apply-storyboard` 印「分鏡表沒有改到文字、音效或金句」，`recordStoryboard` 把這份記成已套回 → 字沒進影片，下次重產生分鏡表時就消失。
- 畫面文字的「」數和 slots 欄位數對不上：`⚠ <段>：畫面文字有 N 則，plan.json 有 M 個欄位 → 這段請 AI 照分鏡表手動改`（`:350`）。example 11-12 23:19 的 x0108 就是這條（x-route 的欄位標籤自帶「吃午餐」「搭高鐵」，數錯；和拍點無關，另案）。
- 結構改動（加拍、刪拍、換順序）網頁本來就做不到，只能寫「補充說明」→ AI 改 slots 或 designs → `--storyboard --only` 重產（applyRun 印的「→ 下一步」）。
- ③ 通過後網頁唯讀（`editor/server/storyboard.mjs:29-34,54`），之後只有工具和主代理寫 storyboard.md。

## 2. 實際不同步的情境

| # | 誰改了哪份 | 哪份沒跟上 | 結果 | 證據 |
|---|---|---|---|---|
| S1 | 主代理改 plan.json 模板段的綁詞修 audit 的【D 下限】：x0105 `openAt` `#12@開拍`→`#12@拍`、`hitAt` `#13@手機`→`#13@旁邊`；x0107 `path`／`flow`；x0113 `items[0].at` `#63@實際`→`#64@下載` | build 照 slots 重產動畫檔；storyboard.md 還是舊表 | `--review` 多 4 個 ✖（x0107、x0113 各一個 beats-missing＋beats-extra）。主代理只能 `--storyboard --only x0107,x0113` 重截，③ 又被記回待回覆（`projects/example/work/製作進度.md:27-28`，B2 之前）。x0105 換的詞和原本的相鄰（拍／開拍、旁邊／手機），差不到 0.5 s 沒報，storyboard.md 至今還是舊詞（`storyboard.md:129-130` 對 `plan.json:105-106`） | MiniMax `mvs_9c47f90b…`，11-12 23:21（訊息 33600 改 plan、33622 的 4 個 ✖、33634 重產） |
| S2 | 子代理照修改單手改模板動畫 `x-scene-s0108.html`，新增 4 拍 | storyboard.md 的表（子代理不能改）、slots | 4 個 beats-extra ✖，子代理停手、在報告裡寫好整張新表等主代理抄 | `projects/t029b/work/reports/s0108.md`；`specs/029-redo-with-hyperframes/brief.md:16` |
| S3 | 同上，子代理避開新拍，把新內容塞進原本 3 拍 | storyboard.md 的「畫面上出現什麼」「插圖元件」 | 0 個 ✖，分鏡表描述的卻是舊畫面；報告寫「分鏡表我沒有改，需要主代理同步」，沒人同步 | `projects/t029a/work/reports/s0108.md`「和分鏡表不一致的地方」 |
| S4 | 設計師改內容設計段 designs 的拍 | storyboard.md 那份；兩份靠修改時間決定誰算 | 設計師不知道 audit 讀哪份，推理裡反覆猜；build --check 和 audit 對同一段可能用不同的表。022 也記錄設計師卡在舊分鏡 220 s、整份重寫 3 次 | MiniMax `mvs_b491562d…`，11-12 11:19（s0116）；`specs/022-pipeline-speed/spec.md:21` |
| S5 | 剪輯台分割／合併／刪字幕（`editor/server/write.mjs:559` `replay`），或 `srt-align --remap-plan` | 前者只重對 plan.json；後者另外只改 plan.json 寫了 `src` 的動畫檔（`media.mjs` `srtAlign`，搜 `typeof x.src === 'string'`）。designs、x-design 動畫檔（plan.json 沒有 `src`）、storyboard.md 都沒改 | 內容設計段的 `P.at` 和鏡位腳本整段錯開一句；文件只能寫「storyboard.md 的句號會過期，以 plan.json 為準」（`EDITOR.md:114`、`USAGE.md:600`、`auto-edit-review/SKILL.md:56`） | 程式、文件 |

規模：MiniMax 紀錄裡「找不到對應的 P.at」出現在 15 個 session（43 列），「不在分鏡表」44 個 session（含文件引用）。

## 3. 內容設計段做到哪，模板段差在哪

022 之後內容設計段接近單一來源：設計師只寫 `work/designs/<段>.md`，`--storyboard` 照它產生分鏡表那一段（`storyboard-gen.mjs:164-165`）；audit 看到 designs 比較新就用它；`versions finish` 抄回 storyboard.md；勾成內容設計時先拿掉模板的舊表，免得 audit 讀到。t029c 用同一張修改單、`design: true` 重做 s0108，0 個 ✖。

還差：靠修改時間（複製、git checkout、編輯器存檔都會改到），storyboard.md 比較新時 storyboard.md 贏（022 的 edge case），兩份都還能改；三個讀的人規則不同；要兩個同步點（`syncDesignSheet`、`dropBeatSheets`）補。

模板段差在：
1. 動畫檔是 slots 產生的，正本其實是 slots，audit 的基準卻是 ③ 時凍結的副本（S1）。
2. 手改過的模板段，動畫檔不再跟 slots，也沒有任何一份子代理能改的拍點檔（S2、S3）；worker-brief 只讓內容設計段寫 designs。
3. `__sheet` 已經照 slots 每次重算（`build.mjs:656` 的註解，032 為 autofix 補的），只是排在 storyboard.md 後面。

## 4. 設計

### 4.1 目標與不做的事

目標
1. 每段只有一份可以改的拍點（正本）；storyboard.md 的動畫分鏡、版本裡的 `分鏡.md` 都是副本。
2. 讀拍點的工具（audit、build --check、autofix、`--review` 快取、versions）只讀正本，不比修改時間。
3. 誰改得到動畫檔，誰就改得到正本：主代理改 slots；設計師、子代理改 `work/designs/<段>.md`。子代理不再因「不能改 storyboard.md」停手。
4. 退場：`pickBeatSheet`、`syncDesignSheet`、`dropBeatSheets`、`plan.mjs` 的 `beatSheets`／`designSheetOf`；文件裡「以 plan.json 為準」「audit 照比較新的那份」。

不做
- 網頁不做結構改動：加拍、刪拍、換順序照舊寫「補充說明」，AI 改正本。
- 不改分鏡表其他部分（畫面文字、音效、金句、情緒點、候選）的套回。
- 不改表頭、語彙、對拍規則（±0.5 s、同一句一組）。
- 不從動畫檔的 `P.at` 反推拍點。
- 字卡（scene）、字卡動態（fx）、media 照舊沒有動畫分鏡；07 的 `beats.keyAt` 本來就只在 plan.json。
- `status.mjs` 判斷階段的方式不改（寫 storyboard.md 要照它的規則記時間，見 §4.4 規則 3）。

### 4.2 正本

| 段 | 判定 | 正本 | 拍點在哪 | 誰改 |
|---|---|---|---|---|
| 模板段，動畫檔是工具產生的（owner `plan`） | `template` 有值，`fillStateOf` 是 `tool` 或 `missing` | plan.json 那段的 `slots`＋`custom/<模板>.fill.json` 的 `sheet` 樣板（唯讀） | `type: "at"` 的欄位；清單項目的 `at`；x-scene 的 `beats[]`（一項一拍，加拍刪拍＝增刪陣列元素） | 主代理、autofix、重對句號的工具 |
| 手寫段（owner `script`） | `design: true`；或 `template` 而 `fillStateOf` 是 `hand`；或手寫 `src`（舊專案） | `work/designs/<段>.md` 的 `#### 動畫分鏡 <段>`（＋`#### 插圖清單 <段>`） | 「講到（綁句）」欄；表頭照 `BEAT_HEADER`（從 x-scene 抄來的多兩欄） | 設計師、改動畫的子代理、主代理 |
| 其他（owner `none`） | scene、fx、media | 沒有動畫分鏡 | — | — |

`fillStateOf({ seg, outDir, lib })`：從 `materializeFills`（`custom-fill.mjs:676-686`）抽出來共用，判斷不變：檔不在＝`missing`；內容＝照現在 slots 產生的，或雜湊＝`.cache/custom-fill.json` 記的＝`tool`；其他＝`hand`。

**手改過的模板段第一次被發現**（audit 或 build 呼叫 `beatSourceOf` 時）：工具建 `work/designs/<段>.md`（`seedScript`）。
- 內容：`概念：模板 <模板> 手改（拍點改下面這張表；plan.json 這段 slots 的綁詞不再生效）`，接著一張表。表的來源依序：storyboard.md 那段現有的表（舊專案、t029a 那種照它改的）→ 照目前 slots 的 `renderSheet`。
- 印一行（不是 ⚠，不占「⚠ 只修一輪」）：`s0108 的動畫檔手改過：拍點改 work/designs/s0108.md（工具剛照分鏡表建好）`。
- 檔已經在就不動。動畫檔回到工具產生（刪掉手改的檔重 build、`versions use` 退回到沒手改的版）時，`materializeFills` 把孤兒 `work/designs/<段>.md` 搬到 `work/designs/.old/<段>-<時間>.md`，印一行；不然下次手改會沿用過期的表。
- `--to-design` 遇到這種段也先搬到 `.old/`：重新設計要從空白想，不能被 `plan-set.mjs:206` 的 `notStarted` 當成「腳本已經寫好」。

**新模組 `lib/beat-source.mjs`**（零依賴；只 import `custom-fill.mjs`、`audit-beats.mjs`、`storyboard-gen.mjs` 的 `parseDesign`）：

```js
beatSourceOf(P, seg, { lib, specs, seed = true })
  // → { owner: 'plan'|'script'|'none', why: 'template'|'design'|'hand'|'src',
  //     file: 'plan.json'|'work/designs/<段>.md', md, sheet /* parseBeatSheets 的一段 */, list /* parseIllusLists 的一段 */ }
  // owner plan 的 md＝renderSheet(spec, seg.slots, seg.id)（和 __sheet 同一個函式）；owner script 的 md＝parseDesign(text, id).sheet
beatBlock(P, seg, ctx)                          // storyboard.md 那段要放的 markdown（動畫分鏡＋插圖清單；沒有就 ''）
refreshBeatTables(md, segs, blockOf, { only })  // 純文字：每段 ### 底下的 #### 動畫分鏡／插圖清單換成 blockOf(seg)；回 { md, changed: [id] }
migrateBeats(P, { lib, dryRun })                // §4.8
```

### 4.3 衍生物：誰在什麼時候重產

| 衍生物 | 從哪產 | 什麼時候 |
|---|---|---|
| 模板動畫檔的 `P.at` | slots | 每次 build（現在就是） |
| storyboard.md 的動畫分鏡、插圖清單 | `beatBlock` | `--storyboard`（整份或 `--only`）；`--apply-storyboard` 寫完 plan.json 後；`--to-design`；`--review` 的 build 之後；`versions.mjs` accept、use、finish |
| `__sheet` | `beatSourceOf` | `materializeFills`、`checkerOf`（現在就是；owner script 改成讀 designs） |
| 版本的 `分鏡.md` | storyboard.md 那一節（已經重產過） | `saveSeg`（現在就是） |
| `work/designs/<段>.md`（只有手改模板段的第一份） | storyboard.md 的表或 slots | `seedScript`，一次 |

plain build（沒有旗標）不寫 storyboard.md：子代理不跑 build、主代理改完一定走 `--review` 或 `versions finish`，夠了；也避開 §7 的 status 時間問題。

### 4.4 storyboard.md 動畫分鏡的重產

寫入規則（所有呼叫點共用）：
1. `storyboardDirty(P)` 為真（使用者在網頁改到一半還沒套回）就不寫，印 `分鏡表有改動還沒套回，動畫分鏡這次沒更新`。`storyboardRun` 開頭原本的擋法不變。
2. 只換 `#### 動畫分鏡`、`#### 插圖清單` 兩塊，同段其他行（截圖、截圖觀察、畫面文字、要求欄）一個字都不動。內容一樣就不寫（不動修改時間）。
3. 寫完照呼叫者記：`lib/flow.mjs`、`lib/plan-set.mjs` 用 `writeAtomic`＋`recordStoryboard(P, md)`（`at`＝現在，`status.mjs:479` 的 `storyApplied` 才成立）；`versions.mjs` 用原本的 `markStoryboard`（`:201`，同時更新 `storyboardByVersions` 的時間）。
4. `--review` 印一行 `分鏡表的動畫分鏡跟著正本更新：x0105、x0107`（`refreshBeatTables` 回的 `changed`；沒有就不印），放進回報段，讓作者知道 ③ 之後哪幾段的拍變了（§8 Q3）。

`renderSection` 對 owner script 的段多寫一行 `- 拍點正本：work/designs/<段>.md`（內容設計段原本就有「概念」，手改模板段靠這行），網頁和 `applyStoryboard` 都用它分辨。

**網頁改的寫回正本**（`applyStoryboard` 加一段，`changes` 多這幾種）：
- owner script：分鏡表那張和正本列數相同、每列「講到」相同時，「畫面上出現什麼」不同的格子寫回 `work/designs/<段>.md` 同一列同一格（照 `storyboard-md.mjs` 的 `cellSpans` 只換那一格），印 `改：s0108 動畫分鏡第 2 拍「…」→「…」（寫回 work/designs/s0108.md）`。
- owner plan：網頁上這種格子改成唯讀（`editor/storyboard.js` 的 `textField(…, { beat })`：段落沒有「拍點正本」那一行就走 `sb-read`）。同一個字在「畫面文字」那一行改，本來就會套回 slots。舊頁面送來的 cell 修改 `applyStoryboardOp` 照收；`--apply-storyboard` 比對到就印 `⚠ x0105 的動畫分鏡照 plan.json 產生，表上改的字不會生效 → 要改字在「畫面文字」那一行改`。
- 結構不同（列數或「講到」不同；網頁做不到，只會是主代理手改）：owner script → 整張收進 designs（舊檔先備份到 `.old/`），印 `改：s0108 整張動畫分鏡寫回 work/designs/s0108.md`；owner plan → 不收，印 `⚠ x0107 的動畫分鏡是照 plan.json 的 slots 產生的，表上手改的拍不會生效：第 5 拍 #21@下載（表）／#21@電腦（slots） → 改 plan.json 這段 slots 的 flow，再跑 build.mjs --storyboard --only x0107`。
- 最後 `refreshBeatTables`，storyboard.md 一定等於正本。

**結構改動的正規路線**（不變，只是之後沒有另一份要同步）：使用者寫「補充說明」→ `--apply-storyboard` 印要求 → AI 改正本（模板段：x-scene 增刪 `slots.beats[]`、清單模板增刪項目、固定拍數的模板換模板或交給子代理手改；手寫段：改 designs 的表）→ `--storyboard --only <段>` 重產＋重截 → 重貼 ③。

**看現在的拍**：`build.mjs --show <段>`（`flow.mjs:423` `showCmd`）在段落 JSON 後面多印 `動畫分鏡（正本：plan.json｜work/designs/<段>.md）：` 和那張表。子代理改動畫前用它看拍（worker-brief「不能跑 build」加這個例外，和 `--icons` 一樣）。

### 4.5 讀的人只讀正本

| 檔 | 改成 |
|---|---|
| `audit.mjs:437-467` | 拿掉讀 storyboard.md、`designOf`、`pickBeatSheet`；每段 `beatSourceOf(P, it.seg, { seed: true })`。沒有表＝`noSheetFinding`，「→」照 owner 指到 designs 或「主代理跑 build」 |
| `lib/audit-beats.mjs` | 刪 `pickBeatSheet`；`beatFindings` 收 `src`（正本路徑）、`owner`，beats-missing／beats-extra 的「→」照下表 |
| `lib/plan.mjs:414-424,947` | 拿掉 `beatSheets`、`designSheetOf`，只用 `it.seg.__sheet`（`materializeFills` 已照 owner 設好） |
| `lib/custom-fill.mjs:672` | `__sheet` 照 owner：plan＝`renderSheet`；hand＝designs 的表（沒有就 `seedScript`）；另設 `__beatOwner`；孤兒 designs 搬 `.old/` |
| `build.mjs:644-661` `checkerOf` | 只對 `__beatOwner === 'plan'` 的段重算 `__sheet` |
| `lib/autofix.mjs:311-322` | `__beatOwner !== 'plan'` 不出 merge 候選（綁詞不在 slots，`swapRef` 改不到） |
| `lib/flow.mjs:1469-1474` `reviewNow` | 雜湊裡的 `sheets` 換成 owner script 段的 designs 全文（owner plan 的拍已經在段落 JSON 裡）；storyboard.md 不再算 |
| `lib/plan-set.mjs:237` | `dropBeatSheets` 換成 `refreshBeatTables`；先搬手改段的 seed 檔（§4.2） |
| `media.mjs illus-lint` | 不用改（storyboard.md＋designs 都讀，結果一樣）；之後可以只讀正本 |

beats-missing／beats-extra 的「→」：

| owner | beats-missing | beats-extra |
|---|---|---|
| script | `→ 在 script 開頭加 const T3 = P.at('#29@直的')，照 work/designs/s0108.md 那一列做；或把那一列改成檔裡實際綁的句號` | `→ work/designs/s0108.md 那張表加一拍（講到、畫面上出現什麼、動態），或刪掉這個 P.at` |
| plan | `→ 動畫檔和 plan.json 的 slots 對不上：主代理先跑 build；子代理把這行原文交回主代理` | 同左 |

owner plan 的段兩邊都從 slots 產生，正常不會報；會報就是動畫檔還沒重 build，或模板 fill.json 的 `sheet` 寫錯（`custom-fill.test.mjs` 該抓到）。

### 4.6 versions

- `snapshotOf`（`:138`）：存 `鏡位腳本.md` 的條件從 `seg.design` 改成 owner script（手改模板段也存）。雜湊照舊不含 `分鏡.md`。
- `use`（`:422`）：還原段落、動畫檔、鏡位腳本，storyboard.md 那一節照舊整節換回，再 `refreshBeatTables(…, { only: [id] })`。
- `accept`（`:395`）：
  - owner script：提案 `分鏡.md` 的那張表寫進 `work/designs/<段>.md`（舊的備份到 `.old/`），再寫 storyboard.md 那一節。
  - owner plan：照舊寫 storyboard.md 那一節；另外把提案表的綁詞清單記進 `v<N>/.meta.json` 的 `promised`。
- `finish`（`:993`）：`syncDesignSheet` 換成 `refreshBeatTables(…, { only: 改到的段 })`。owner plan 的段有 `promised` 而和現在 slots 產生的綁詞不同 → `⚠ s0108：v3 提案確認的拍是 #27@一次、#28@橫著…，現在 plan.json 產生的是 … → 照提案改 slots；模板做不到就交給子代理手改動畫檔（拍點會移到 work/designs/s0108.md）`。今天這件事是靠 audit 拿 storyboard.md 那張表比出來的，改成只對正本後要補上。
- 刪 `syncDesignSheet`。

### 4.7 字幕重對時連正本一起改

- 把 `media.mjs` 的 `remapCustomRefs`（`P.at`／`P.sfx` 的句號）搬到新檔 `lib/beat-remap.mjs`，加 `remapBeatTable(md, mapper)`：只動表裡「講到」欄的 `#N…`（比對規則同 `audit-beats.mjs:61` 的 `REF_RE`）。
- 剪輯台結構操作（`editor/server/write.mjs:559` `replay` 之後）：owner script 的段，`work/designs/<段>.md` 和那支動畫檔（x-design，或手改的模板檔）照同一個 op 重對（`editor/subtitles.mjs` 的 `remapRef`），先備份 `.align-<時間>`。
- `srt-align --remap-plan`：要改的檔從「plan.json 寫了 `src` 的」擴成「owner script 的動畫檔＋designs」；那句 ✖ 的「之後分鏡表 storyboard.md 的句號會過期，以 plan.json 為準」（`media.mjs:2495`）刪掉後半。
- storyboard.md 不用改，下次重產就跟上。

### 4.8 舊專案的相容與遷移

`migrateBeats(P)` 外面包 `ensureBeatsV2(P)`：`work/hyperframes/.cache/beats-v2.json` 不在才跑，跑完寫 `{ at, moved }`。`build.mjs`（每個模式，`--help` 除外）、`audit.mjs`、`versions.mjs` 開頭都呼叫，所以**每個專案自動跑一次**，使用者和 AI 不用知道。手動：`build.mjs --project <專案> --migrate-beats [--dry-run]`（不看標記重跑；`--dry-run` 只印），給作者檢查用。

每個 custom 段：

| 段 | 做什麼 |
|---|---|
| owner plan，storyboard.md 的表和 slots 產生的綁詞相同 | 不動 |
| owner plan，不同（S1 留下的，例 example 的 x0105） | 不寫檔；印 `x0105：分鏡表的拍（#12@開拍、#13@手機）和 plan.json（#12@拍、#13@旁邊）不同，之後以 plan.json 為準，分鏡表下次產生時更新` |
| 手改模板段、手寫 `src` 段，沒有 designs | 建 designs，表抄 storyboard.md 那張（沒表的 `src` 段照舊 `noSheetFinding` ⚠） |
| `design: true`，有 designs，storyboard.md 那張不同且比較新 | 照 022 的規則最後一次：storyboard.md 那張寫進 designs（舊的備份 `.old/`） |
| `design: true`，沒有 designs、storyboard.md 有表 | 建 designs |

遷移不寫 storyboard.md（③ 待回覆、使用者正在網頁改的專案不受影響），storyboard.md 在下一個 §4.3 的時間點自然更新。只動 `work/designs/`，可以從 `.old/` 退回。

## 5. Skill 與文件要改的

實作完成後一次改（W4／P2d／P2e 的檔，docs.test 有比對原文的一起改）。行號是現在的。

| 檔:行 | 現在 | 改成 |
|---|---|---|
| `.agents/skills/auto-edit-motion/SKILL.md:74` | 改 designs「（沒有就從 storyboard.md 那一節抄過去再改），audit 照比較新的那份對；`versions.mjs finish` 會寫回 storyboard.md」 | 「改 `work/designs/<段>.md` 那張表（手改的模板段第一次 audit 時工具會建好）」；括號和後半句刪 |
| 同檔 `:22` | 括號「分鏡表裡那段的動畫分鏡可能是勾選前的模板拍，不算」 | 刪 |
| 同檔 `:75`、`references/design.md:120` | 「要改 plan.json、storyboard.md」 | 「要改 plan.json」 |
| `auto-edit-motion/references/worker-brief.md:14` | 「內容設計動畫段另外可以寫 designs」 | 「這段的拍點正本 `work/designs/<段 id>.md`（內容設計段、手改的模板段都是；拍或畫面變了就改這張表，audit 照它對）」 |
| 同檔 `:15` | 不能跑 build（`--icons` 例外） | 例外加 `build.mjs --show <段>` |
| 同檔 `:29` | 「改過的檔工具不會再覆寫，那段的 slots 也不再生效」 | 後面加「拍點改 `work/designs/<段>.md`」 |
| `auto-edit-review/references/editor-requests.md:72` | 「現在的動畫分鏡：照 work/storyboard.md 這段（grep -n -A30 …）…不要改 storyboard.md」 | 「現在的動畫分鏡：`node shared/template/tools/build.mjs --project projects/<專案> --show <段 id>` 印的那張；拍變了改它寫的正本」 |
| `auto-edit-review/references/revise.md:22` | 「記 ③ 通過，分鏡寫回 work/storyboard.md」 | 「記 ③ 通過；內容設計段、手改模板段的拍寫進 `work/designs/<段>.md`，模板段照提案改 slots（finish 會比對）」 |
| `auto-edit-review/SKILL.md:56`、`shared/template/EDITOR.md:114`、`USAGE.md:109`、`USAGE.md:600` | 「storyboard.md 的句號會過期，以 plan.json 為準」 | 刪 |
| `shared/template/EDITOR.md:21` | 網頁可改「動畫分鏡『畫面上出現什麼』裡「」內的字」 | 「內容設計動畫的動畫分鏡『畫面上出現什麼』裡「」內的字（模板動畫的字在畫面文字改）」 |
| `shared/template/EDITOR.md:164` | 剪輯台只寫的檔 | 加 `work/designs/*.md`、動畫檔（增刪字幕重對句號時） |
| `shared/template/BEATS.md:4,10` | 「storyboard.md 由工具產生…不要手改」 | 保留，加「拍點改正本：模板段改 plan.json 的 slots；內容設計段、手改的模板段改 `work/designs/<段>.md`」 |
| `shared/template/USAGE.md:99` | 內容設計段的表由工具從 designs 放進分鏡表 | 改成通則：每段的動畫分鏡都是工具從正本產生 |

`AGENTS.md:35` 不用改（storyboard.md 照舊只有主代理能寫，實際上只剩工具寫）。

## 6. 分步實作

每一步可以單獨合併；後一步用前一步的函式，不依賴它改掉的行為。新測試寫在 `dev/tests/032-b6.test.mjs`，用 `projects/example`（以及 t029b，作者刪掉前）的複本。

**步驟 1：正本模組＋遷移（讀的人還沒換，行為不變）**
- 動：新檔 `lib/beat-source.mjs`；`lib/custom-fill.mjs`（抽 `fillStateOf`，`materializeFills` 改用它，邏輯不變）；`build.mjs`、`audit.mjs`、`versions.mjs` 開頭呼叫 `ensureBeatsV2`；`build.mjs --migrate-beats [--dry-run]` 與 `--help`。
- 驗證：
  1. 單元：template 沒手改 → `plan`；動畫檔改一個字 → `script`／`hand`；`design: true` → `script`／`design`；`src` → `script`／`src`；scene、fx、media → `none`。
  2. 遷移：example 複本的 x0105 → `--migrate-beats --dry-run` 印 §4.8 那一行、不寫檔；t029b 複本的 s0108（手改、沒有 designs）→ 建 `work/designs/s0108.md`，表＝storyboard.md 那張；再跑一次不動（標記在）。
  3. `custom-fill.test.mjs` 全過。

**步驟 2：讀的人只讀正本**
- 動：`audit.mjs`、`lib/audit-beats.mjs`、`lib/plan.mjs`、`lib/custom-fill.mjs`（`__sheet`、`__beatOwner`、seed、孤兒搬 `.old/`）、`build.mjs` `checkerOf`、`lib/autofix.mjs`、`lib/flow.mjs` `reviewNow`、`lib/plan-set.mjs`（`--to-design` 搬 seed 檔）。`audit.test.mjs:1246` 的 `pickBeatSheet` 測試改寫。
- 驗證：
  1. S1：example 複本把 x0107 的 `flow` 改成 `#21@電腦` → build → `audit --only x0107` 沒有 beats-missing／beats-extra（現在 2 個）；storyboard.md 沒被碰。
  2. S2：手改 x-scene 段的動畫檔加 `const T9 = P.at('#28@橫著')` → `audit --only` → 印 seed 那一行、`work/designs/<段>.md` 建好、1 個 beats-extra 且「→」指到那個檔；表加一列 `#28@橫著` → 0 個 beats ✖。
  3. S4：內容設計段 designs 的修改時間比 storyboard.md 舊、兩張表不同 → audit 照 designs（現在照 storyboard.md）。
  4. autofix：storyboard.md 在、模板段兩拍只隔 0.4 s → `build.mjs --autofix` 併拍成功（現在被退回）。
  5. `--review` 快取：只改 storyboard.md 的動畫分鏡 → 不重量；改 designs → 重量那一段。

**步驟 3：分鏡表的動畫分鏡從正本重產＋網頁寫回**
- 動：`lib/storyboard-gen.mjs`（`renderSection` 用 `beatBlock`、加「拍點正本」那行；`applyStoryboard` 加 §4.4 的寫回）、`lib/flow.mjs`（applyRun 用 `refreshBeatTables` 取代 `dropBeatSheets`；`--review` 呼叫 refresh 並印那一行；`showCmd` 印正本的表）、`lib/plan-set.mjs`、`editor/storyboard.js`（owner plan 的動畫分鏡格唯讀）。刪 `dropBeatSheets`，`scaffold.test.mjs:387` 改驗 refresh。
- 驗證：
  1. 內容設計段：用 `applyStoryboardEdit` 的 cell op 改動畫分鏡第 2 拍「」裡的字 → `--apply-storyboard` 印「寫回 work/designs/<段>.md」、designs 那一格改了、storyboard.md 和正本一致、`storyboardDirty` 為假。
  2. 模板段：手改 storyboard.md 一列的綁詞 → `--apply-storyboard` 印 ⚠（表和 slots 兩邊的詞都印）、那張表換回 slots 產生的。
  3. ③ 通過後改 slots → `--review` → storyboard.md 那段的表更新、印「跟著正本更新：<段>」；`status.mjs --project … --json` 的階段是 ④，不是「③ 通過，套回 plan.json」。
  4. ③ 待回覆、storyboard.md dirty → refresh 不寫，印那一行。
  5. `editor-storyboard-ui.test.mjs`：模板段動畫分鏡格沒有 contenteditable，內容設計段有。

**步驟 4：versions**
- 動：`versions.mjs`（snapshot 條件、accept 分流、`promised`、finish 用 refresh、刪 `syncDesignSheet`）。`versions.test.mjs:180-190` 改寫。
- 驗證：手改模板段 save → 版本裡有 `鏡位腳本.md`；use 退回到沒手改的版 → designs 搬到 `.old/`、owner 回到 plan；模板段提案加一拍、accept 後不改 slots → finish 印 promised 的 ⚠；內容設計段提案 accept → designs 的表＝提案的表。

**步驟 5：字幕重對連正本**
- 動：新檔 `lib/beat-remap.mjs`；`media.mjs`（`remapCustomRefs` 改 import、擴大範圍、改那句 ✖）；`editor/server/write.mjs`。
- 驗證：內容設計段從 `#5` 起，designs 綁 `#6@詞`、動畫檔 `P.at('#6@詞')`；剪輯台 op 把 `#3` 分成兩句 → plan.json 的 from 是 `#6`、designs 是 `#7@詞`、動畫檔是 `P.at('#7@詞')`、各有 `.align-*` 備份；`audit --only` 0 個 beats ✖。`srt-align --remap-plan` 同一組斷言。

**步驟 6：文件**（§5，最後一起改、跑 docs.test）。

## 7. 風險

| 風險 | 處理 |
|---|---|
| `status.mjs` 用「storyboard.md 比 plan.json 新」判斷還在 ③（`:479,509`），工具重產 storyboard.md 會讓接手被帶回 ③ | §4.4 規則 3：一律 `recordStoryboard`（`at`＝寫完）或 `markStoryboard`；plain build 不寫；步驟 3 驗證 3 |
| ③ 待回覆時使用者在網頁改到一半，工具重產蓋掉 | §4.4 規則 1：dirty 不寫 |
| 手改判斷靠 `.cache/custom-fill.json`：快取被刪，和 slots 產生的不一樣的檔都算手改 | 多建一份 designs（抄 storyboard.md 或 slots，綁詞相同），不會多出 ✖；印的那一行看得到 |
| ③ 之後改 slots 的綁詞不再被 audit 擋，使用者確認過的拍可能被換掉 | 和 autofix 的文字對時、併拍同一類（本來就不重開 ③）；`--review` 回報段列出拍有變的段（§8 Q3） |
| 改版提案確認的拍沒人驗（模板段） | `promised` 比對（§8 Q4） |
| audit（子代理跑）會寫 `work/designs/<段>.md` | 只寫自己那段、只寫不存在的檔；和主代理改 plan.json 不衝突 |
| 版本雜湊多了 `鏡位腳本.md`：手改模板段第一次 save 多存一版 | 022 已有同樣的 edge case，接受 |
| 剪輯台開始寫 designs 和動畫檔（步驟 5） | 寫之前備份；EDITOR.md 寫明（§8 Q5） |
| 第一、二階段還在改 `audit.mjs`、`lib/plan.mjs`、`lib/flow.mjs`、`versions.mjs` | 第三階段才做；開工前重新 grep 行號 |

## 8. 要作者拍板

> **定案（主代理 2026-11-13，作者授權「全部優化」、用起來最順就直接定）：五題都照建議選 A**，最後那個預設也照寫的做。作者要推翻哪一題，直接說「B6 第 N 題改 B」。

1. **手改過的模板段，拍點正本放哪**
   - A. `work/designs/<段>.md`，工具第一次發現手改時自動建（和內容設計段同一套，子代理本來就能寫）。**建議 A。**
   - B. 不要表，audit 直接拿動畫檔的 `P.at` 當拍（分鏡表少了「畫面上出現什麼」，看不出這段在演什麼）。
   - C. 手改前一律先 `--to-design` 轉成內容設計段（畫布清空，等於重做，029 量到要 1.7 倍時間）。
2. **分鏡表網頁上動畫分鏡格子裡「」的字**
   - A. 模板段唯讀（同一個字在「畫面文字」改，已經會套回）；內容設計段、手改模板段可改，寫回 designs。**建議 A。**
   - B. 全部唯讀，要改寫「補充說明」。
   - C. 全部可改，模板段照 fill.json 的 `sheet` 樣板反推回 slots（多一套對應規則，容易錯）。
3. **③ 通過之後主代理改了模板段的綁詞（例 x0105 的 openAt），要不要重開 ③**
   - A. 不用：算機械修正（和 autofix 一樣），分鏡表在 `--review` 自動跟上，回報段列出拍有變的段。**建議 A。**
   - B. 要：拍有變就記 ③ 待回覆、印停點 ③（S1 那次就是這樣多停一次）。
4. **改版提案（versions new／accept）確認的拍，模板段怎麼確保做到**
   - A. accept 記下提案的綁詞，finish 比對，不同就 ⚠。**建議 A。**
   - B. accept 時直接把模板段轉成手寫（正本搬到 designs），之後一律子代理手改。
   - C. 不比對。
5. **剪輯台增刪字幕時，要不要連內容設計段（與手改模板段）的鏡位腳本、動畫檔一起重對句號**
   - A. 一起改（先備份），剪輯台多寫這兩種檔。**建議 A。**
   - B. 不改，下次 `--review` 報 ✖，主代理照「→」跑一條重對指令。

另外一個預設（不用回，要反過來再說）：遷移時內容設計段 storyboard.md 那張比 designs 新，照 022 的規則讓 storyboard.md 那張贏最後一次（§4.8）。

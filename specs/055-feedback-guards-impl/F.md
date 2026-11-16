# 055 包 F：換段與預覽（k12 N5、k13 N6、k32 N11）

狀態：k12、k13、k32 都做完，未 commit。文件（USAGE、REVIEW、Skill）照分工留給包 G，要寫的內容在本檔「給包 G」。

## 改了哪些檔

| 檔 | 改了什麼 |
|---|---|
| `shared/template/tools/lib/seams.mjs`（新） | 換段清單、取格、截圖（hyperframes snapshot）、亮度格子比對、訊息、快取、CLI |
| `shared/template/tools/versions.mjs`（包 D 的檔，插一行＋import） | `finishOnce` 的 audit／錄影段截圖之後：`notes.push(...(S.seams \|\| seamsSync)(P, ids…))` |
| `shared/template/tools/lib/flow.mjs`（包 A 的檔，插兩行＋import） | `reviewRun`：Promise.all 之前 `const seamsRun = seamsLines(P)`，印完 `audit：✖…` 那行之後印 `await seamsRun` |
| `shared/template/tools/editor/preview.js` | `PlayerPreview` 加 `LAYER_SYNC`、`scanLayers`、`dropLayers`、`syncLayers`（`tick()` 最後呼叫） |
| `dev/tests/seams.test.mjs`（新）、`dev/tests/fixtures/055-seams/`（新，7 個 json，共 144 KB） | 純函式＋短影片 1、4 真的畫面縮成的格子 |

`preview-bridge.js` 沒改：它只給構圖台、設計預覽頁用，完成影片預覽走 `preview.js` 的 HyperFrames 播放器。

## k12／k13：換段閃一下（seam-flash）、硬切回講者（seam-cut）

### 做法

1. 換段清單（`seamList`）：照 `--check --json` 的 items（`out.start/end`、`out.tx`），每一段的開頭、段尾各一個換段；兩段相接只算一個。
   - 不量：片頭片尾 0.05 秒內；任一邊是錄影段（`type: media`，錄影本身在動）；kit 自己的版面轉場（下一段 `tx.in` 是 wipe、wipeIn、swap、side、push、dive、band、media、chapter；上一段 `tx.out` 是 wipeOut、swap、retract、rise、side、push、dive、band、handoff、media）。這些是 kit 的固定動作，量了只會報 kit 本身。
   - seam-cut 只量「前一段是動畫、後面露出講者」的換段：後一段是 null（段尾接講者）或一般段；前後任一邊是章節幕（`key/family: chapter`）不報，接錄影段整個不量（本來就是硬切）。
2. 取格（`frameTimes`）：都對齊 fps 的格。換段前 1 秒（頭）、換段前 0.5／0.38／0.27／0.17／0.08 秒、換段前最後一格、換段後第一格、換段後 0.15／0.3 秒、換段後 0.6 秒（尾）；一個換段 11 格。
3. 截圖：`hyperframes snapshot --at … --no-end --keep`（有錄影、去背層的真畫面），幾個行程同時跑（`jobs` 3，最多核心數的一半）；ffmpeg 縮成畫面 ÷ 5 的灰階，切 8×8 的格子（＝畫面 40 px），每格記平均亮度與標準差。字幕帶（照 `captions.html` root 的 `--cap-bottom`、`--cap-line`、`--cap-pad`，上下多 12 px）不算。
4. seam-flash：換段前後中間那幾格，有格子的亮度跑出頭尾兩格的範圍（±24），而且頭或尾那一格是純色（標準差 < 2）→ 算「突然變」；一格裡這種格子 ≥ 5% 就報。純色的條件把錄影自己在動、特效放大淡出（錄影上的東西，標準差 ≥ 3）排掉。頭尾兩端都是純色、變的格子 ≥ 60% → 判成「底先淡掉露出講者」（reveal），改法只講「同一個底色就讓底一直在」。
5. seam-cut（沒有 flash 才看）：換段前最後一格是純色（< 2）、換段後第一格是錄影（≥ 3）、亮度差 > 30，而且換段前 0.27 秒那一格（最接近 0.3 秒的取格）和最後一格差不多（≤ 12，沒有在淡出）；這種格子 ≥ 8% 就報。
6. 快取：`work/.cache/seams.json`，鍵＝`reviewHashes`（`lib/incremental.mjs`，加 `SEAM` 常數）的全片雜湊＋換段時間＋前後兩段的內容雜湊。前後段沒改的換段不重量；換段不在了的鍵會清掉。
7. 時間上限：`build --review` 90 秒（`SEAM.budget`），finish 120 秒（`SEAM.finishBudget`）。先量有自己底的（內容設計動畫 2 分、整張幕 1 分），量不完的印「沒量到 N（超過時間上限，下次接著量）」，下次有快取會接著量。

### 接在哪

- `versions.mjs finish`：只量這一輪改到的段（`--only <ids>`）前後的換段；同步呼叫自己的 CLI。沒有 `index.html`、沒有 hyperframes、逾時 → 回空的，不擋 finish。訊息放進 notes（和其他 ⚠ 一起，印在「回饋 rN：…」下面）。
- `build --review`：全片，和 audit、完成態拼圖同時跑（非同步），印在 `audit：✖ N、⚠ N` 那行下面，最後一行摘要。只是 ⚠，不影響結束碼、不擋 `--review` 的快取。
- CLI：`node shared/template/tools/lib/seams.mjs --project projects/<專案> [--only s0101,x0103] [--budget 90] [--jobs 3] [--no-cache] [--json] [--debug]`

### 訊息原文

```
⚠ s0101→x0103 9.35 秒換段前後畫面閃一下（9.17–9.33 秒，整個畫面變亮，約占 33%）→ 前後兩段同一個底色就讓底一直在，只淡出字和圖
⚠ s0101→x0103 9.35 秒換段前後畫面閃一下（9.07–9.27 秒，畫面中間變亮，約占 6%）→ 退場從現在的樣子直接淡掉（壓暗的東西不要先變回全亮）；前後兩段同一個底色就讓底一直在，只淡出字和圖
⚠ x0103 的深色底在 19.23 秒一格內消失、露出講者（整個畫面，約占 50%）→ 至少 0.3 秒淡出或擦開
換段：3 個、沿用上次 1、這次量 2（14.2 秒）、沒量到 1（超過時間上限，下次接著量）；閃一下、硬切 ⚠ 0
```

- 段名：`a→b`（兩段相接）、`a 段尾`（接講者）、`b 開頭`（講者接進來）。60 秒以上的時間寫 `1:02.35`。
- 位置：整個畫面、畫面上方／中間／下方、畫面左上…（變的格子的範圍）。顏色：深色／淺色／有色（seam-cut 的底）。
- 摘要那一行只在 `--review` 印；finish 只印 ⚠。

### 門檻（`seams.mjs` 檔頭的 `SEAM`）

| 常數 | 值 | 意思 |
|---|---|---|
| `pre`／`post` | −1.0／0.6 秒 | 頭尾兩格 |
| `mids`／`after` | −0.5、−0.38、−0.27、−0.17、−0.08／0.15、0.3 | 中間取格（閃一下常常只有 0.1–0.2 秒，要密） |
| `scale`、`cell` | 5、8 | 縮圖 ÷ 5，格子 8×8（畫面 40 px） |
| `tol` | 24 | 亮度超出頭尾範圍多少才算突然變 |
| `flatSd`／`textureSd` | 2／3 | 純色底／錄影的格子標準差 |
| `flashArea` | 0.05 | seam-flash 面積 |
| `cutDelta`、`cutArea`、`cutGap` | 30、0.08、0.3 秒 | seam-cut 亮度差、面積、之前多久沒在變 |
| `capPad` | 12 px | 字幕帶上下多遮 |
| `secPerFrame`、`startSec`、`jobs` | 0.8、5、3 | 估時間、同時幾個行程 |
| `budget`、`finishBudget` | 90、120 秒 | 時間上限 |

### 驗證（複本 `projects/tmp055-F-ppa-*`，HEAD 的 kit＝包 D 改 `P.out` 之前）

| 版本 | 要 | 實際 |
|---|---|---|
| 短影片4 s0101 v7（r11） | seam-flash | ✓ 9.35 秒，整個畫面變亮 33%，reveal |
| 短影片4 s0101 v8（r13） | seam-flash | ✓ 9.35 秒，畫面中間變亮 6%（9.07–9.27 秒，壓暗的標誌先亮起來） |
| 短影片4 x0103 v5（r10） | seam-flash | ✓ 9.35 秒，整個畫面變亮 39%（8.97–9.67 秒） |
| 短影片4 x0103 v4 | seam-cut | ✓ 19.23 秒，深色底一格內消失 50%；`versions.mjs finish` 實跑也印了這一行 |
| 六支現行版本全片 | 不報 | ✓ 0 則：短影片1 量 2 個、短影片4 量 3 個、主宣傳片量 2 個；短影片2、3、5 的換段都是錄影段或 kit 版面轉場，0 個要量 |

最接近門檻的現行換段：短影片1 20.77 秒（s0103 白卡一格內收掉回講者）seam-cut 5.5%（門檻 8%）、flash 2.2%（門檻 5%）；其他都 < 1%。這張白卡在講者身上一格收掉，看起來是「卡片收起」，沒有被抱怨過，所以門檻放在它上面。

`dev/tests/seams.test.mjs`：11 個測試全過（0.1 秒），包含上面 4 個目標版本與 3 個現行換段的真畫面格子。`dev/tests/feedback-round.test.mjs`（versions.mjs finish 的測試）26 個全過：測試的 steps 沒有 `seams`、暫存專案沒有 `index.html`，`seamsSync` 回空的。

### 花多少時間（這台機器，其他代理同時在跑，load average 11–19）

| 情況 | 時間 |
|---|---|
| finish（改 1–2 段，2–3 個換段，22–33 格） | 13–20 秒（這次 finish 全部 133 秒） |
| `--review` 第一次，全片 | 短影片1 14 秒、短影片4 18 秒、主宣傳片 17 秒；和 audit、拼圖同時跑 |
| `--review` 第二次（沒改） | 0–1 秒（全部沿用） |
| 沒有要量的換段 | 約 1 秒（`--check --json`） |

## k32：完成影片預覽多層影片對齊

### 做法（`preview.js`）

- HyperFrames 播放器自己對齊影片的方式：差 0.04 秒以上才微調播放速度（3%／10%／25%），差 0.5 秒以上才跳；開頭前 1.5 秒先 seek。去背層（`mattev-*`）常常差 1–3 格，人看到重影。
- 播放時每一格（剪輯台的 frame loop 呼叫 `tick()`）：
  1. 主時間＝正在播、有聲音的講者底片「真的顯示出來的那一格」（`requestVideoFrameCallback` 的 `mediaTime`），沒有就用播放器時鐘。
  2. 其他影片（去背層、講者小視窗 `pipv-*`、錄影片段 `mv-*`）：拿「同一次畫面更新」（`expectedDisplayTime` 差 ≤ 20 ms）的那一格比，差超過 1 格就改 `currentTime`；每支記住跳完 0.15 秒後還差多少（`fix`，最多 ±0.3 秒），下次一起補（解碼、顯示要時間）；同一支兩次跳之間至少 0.3 秒。
  3. 剪點前 0.5 秒：下一支還停著的影片先 `preload=auto`、seek 到它的第一格。
  4. 有聲音的底片不動（動了聲音會斷）。輸出完成影片不經過這裡。
- 常數：`LAYER_SYNC = { frames: 1, cooldownMs: 300, settleMs: 150, preroll: 0.5, maxLead: 0.3, vsyncMs: 20 }`。
- 沒有加「多層影片在預覽可能差一兩格，輸出不會」那一行：對齊做得到。

### 驗證（Playwright Chrome，複本的剪輯台開在 5471、5472 埠，量每一格顯示出來的 mediaTime 和底片差幾格）

| 位置 | 改之前（平均／> 1 格的比例／最大） | 改之後 |
|---|---|---|
| 短影片1 11.5–25.5 秒，去背層 vs 底片 | 1.14–1.43 格／100%／2.1–3.1 格（6 次裡有 1 次剛好 0.13） | 0.22–0.45 格／3–5%（seek 那一下）／1.13 格 |
| 短影片1 x0105 講者小視窗 | 通常 ≤ 0.8 格 | 差不多（不變差） |
| 短影片4 26–36 秒，`pipv-m0105` | 0.92／0.10 格（兩次） | 0.14／0.36 格 |
| 短影片4 26–36 秒，`mv-m0105`（螢幕錄影） | 1.0–1.44 格 | 1.36–1.67 格（沒有明顯變好；機器忙時底片自己也跳格） |
| 短影片4 33.52 秒剪點（之前說會黑一格） | 6 次 0 格黑 | 6 次 0 格黑 |

## 還沒處理的

- 不量 kit 的版面轉場、錄影段的換段、片頭第一格；kit 版面轉場本身如果有閃，這支工具看不到（要在 kit 那邊驗）。
- seam-cut 只看「純色底一格內變成講者」；半透明底、漸層底（標準差 ≥ 2）不報。
- 預覽：螢幕錄影層（`mv-*`）在機器忙時沒有明顯變好；短影片4 剪點黑一格在這台重現不了，不知道修好了沒有。
- `--review` 現在多跑一個 snapshot 行程組，`dev/tests/032-b6` 等跑 `--review` 的整合測試會多花幾秒到十幾秒（沒有跑，照規則只跑自己的測試）。

## 給包 G（文件要寫的）

- `REVIEW.md`／`USAGE.md` 的 `--review`、finish 段：多了 `⚠ … 換段前後畫面閃一下…`、`⚠ … 一格內消失、露出講者…` 兩種，只是 ⚠；改法照箭頭後面做，改完再 finish 一次會重量那個換段。
- `seams.mjs` CLI 一行（上面「接在哪」）；快取在 `work/.cache/seams.json`，可以刪。
- 剪輯台：完成影片預覽的去背層、小視窗會自己對齊，不用跟使用者說「預覽差一兩格」。

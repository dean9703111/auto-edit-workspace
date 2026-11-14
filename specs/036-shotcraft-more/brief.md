# 036 回顧牆、穿窗、截圖接力、前後拉桿、本集地圖（shotcraft 第二輪的後半）

來源：034 驗收頁（https://claude.ai/artifact/MM1mjUXN2MC8Mb733DdZ4Y）作者勾了「之後要做」的五項；2026-11-14 作者說「接著做 036」「都完成後合併到 main」。
原卡：shotcraft `outro/outro-group-photo-launch`（回顧牆，034 原型 fr-recap）、`transition/shot-transitions` C 式（穿窗，034 原型 ft-transitions）、`typography/word-relay-filmstrip`（截圖接力）、`data/before-after-slider-scrub`（前後拉桿）、`camera/basic-3d-scene` 改平面＋`ui-entrance/wall-reveal-moves`（本集地圖）。

## 共同的缺口：真的截圖放不進模板

回顧牆、截圖接力、前後拉桿都要放「真的畫面」（這一集前面的段、素材裡的截圖）。現在圖片只能走 media 段（整張蓋住講者），情境動畫（custom）裡不能放 `<img>`。

## 定案（我先定，作者可以推翻；作者說過「給我使用上最順暢的設計」）

| # | 題目 | 定案 | 理由 |
|---|---|---|---|
| 1 | 截圖怎麼進模板 | 情境動畫的欄位多一種 `shot`（截圖）：值寫 `assets/images/…`、`assets/screen/…` 的圖片檔，或這一集某一段的 id（`"s0106"`）＝那一段的完成態截圖（分鏡表停點 ③ 時工具已經截好的 `work/storyboard-preview/`，一段有好幾張取最後一張；橫式切掉字幕帶）。build 縮好放 `work/hyperframes/assets/shots/`，模板裡換成 `<img>`。錄影不行（會動的畫面照舊用 media 段） | 沿用模板填資料（AI 只寫路徑或段 id）；段的截圖不用多一次 render |
| 2 | 回顧牆 | 新模板 `x-recap`：2–4 張這一集前面的段的截圖＋標籤，合影進場 → 講到哪件就那張聚焦打勾 → 回均衡。截圖還沒有（沒跑過分鏡表截圖）時 ⚠、先用標籤卡代替 | 034 原型 fr-recap；結尾回顧用「真的出現過的畫面」比圖示好記 |
| 3 | 截圖接力 | 新模板 `x-relay`：一個主體（例「Claude Code」）＋ 3–4 種能力，每種配一張素材截圖；左邊截圖膠片一格一格往上換，右邊主體不動、能力那個詞接力換 | 「一個主體 × 多種能力」；旁白片素材多時好用 |
| 4 | 前後拉桿 | 新模板 `x-slider`：前後兩張同尺寸的截圖疊在一起，拉桿先快甩（宣告變了）再慢掃回來（看清差在哪），最後停在 40%。標籤預設「之前」「之後」 | 調光前後、字幕修正前後；用素材截圖，不手做假的 before |
| 5 | 本集地圖 | 01 章節轉場的「地圖版」：plan.json 第一層 `"chapterMap": true`（`build.mjs --set chapterMap=true`）→ 每一個 01 段換成地圖版：整集的章排在一張平面地圖上，前面的章打勾，鏡頭從上一章推到這一章。章名、章數從各個 01 段自動收，不用另外寫。章數 3–8 才有效，其他 ⚠ 照舊 | 沿用 01（章節角標照舊從 01 起算），一個開關；長片才需要 |
| 6 | 穿窗 | 後一段寫 `"enter": "dive"`：前後都是全畫面（換卡不換景的接縫）時，前一段最後聚焦的那個元素變成一扇窗、長成全畫面，後一段從窗裡長出來（1.33 秒）。窗的位置播放時自動找（和畫面推近同一套：前一段結尾前最後開始動的元素），build 不用量；找不到從畫面中央開窗。不是全畫面接全畫面時 ⚠ 並照舊 | 034 原型 ft-transitions；自動找就不用 AI 寫選擇器 |
| 7 | 限制 | 穿窗一集 ≤ 3 次、相鄰兩個接縫不能都穿窗（⚠）；回顧牆的段 id 要在這一段之前（✖）；截圖接力、前後拉桿的圖片只能是圖片檔（✖） | 原型的防呆 |

## 實作紀錄

- **截圖欄位**：`tools/lib/shots.mjs`（新）：`shotRel`（段 → `assets/shots/seg-<id>.jpg`；圖片 → `img-<檔名>-<sha1 8 碼>.jpg`，鍵只看值）、`checkShots`（build／`--check` 共用：檔不在、段不在、段不在前面、種類不對 ✖；段還沒截圖 ⚠ 先放空白）、`prepareShots`（ffmpeg；來源簽名沒變不重做、沒用到的刪掉、`index.json` 沒變不重寫）。`custom-fill.mjs`：`validateSlots` 多 `shot`、填資料把元素裡面換成 `<img>`。`build.mjs`：materializeFills 後 checkShots、prepareMedia 後 prepareShots。局部重算（`incremental.mjs`）把 `assets/shots/` 當素材看。`--list`、`--spec`、草稿範本印「截圖：前面某一段的 id／圖片檔」（`shotHint`、`shotHolder`）。
- **三支模板**（子代理照 `BRIEF` 各做一支，主代理整合）：`x-recap`（前綴 `xrcp`：原本 `xrc` 和 x-receipt 撞名，改掉）、`x-relay`（`xrl`）、`x-slider`（`xsl`）。示意圖 `preview/shots/`（recap-1..4＝畫廊截圖、relay-1..4、slider-before／after＝講者示意圖調光前後），custom-check 會複製進暫存專案的 `assets/images/`。
- **穿窗**：`plan.mjs` `diveSeams`（接在 pushSeams 後面：換卡不換景／上推的接縫才換成 dive）；`main.mjs`：新的一段 `clip-path: circle()`＋`scale: var(--dk)`，前一段 `scale: var(--dz)` 放大 2.4 倍，窗框是另一層 `#dvr-<段>`；窗的中心和半徑播放時量（`diveAt`：前一段結尾前 4 秒內最後開始動的元素，和畫面推近共用 `aimBox`），記住第一次量的值（seek-safe）。
- **本集地圖**：`01-chapter/template.html` 多 `@style-map／@body-map／@timeline-map` 三節；`scenes.mjs` `mapScene`、`chapterMapCtx`（站、路線、兩層相機的數字都算好：外層 `#mpCam` 靜態擺在開始位置，裡層 `#mpWorld` 用 `P.cam` 推，組起來＝這一章的站落在 `MAP.at`）；`plan.mjs` `chapterMapCards`（第一層 `chapterMap: true`、01 有 3–8 段、橫式才換；地圖版不提醒副標）。`plan-set` 可以 `--set chapterMap=true`。畫廊多 `preview/01-chapter-map.html`、`gallery/01-chapter-map.jpg`。

## 驗證

- 單元：`dev/tests/shotcraft-more.test.mjs` 9 項（截圖值、validateSlots、checkShots 的 ✖⚠、prepareShots 的縮圖／快取／清理、穿窗的條件與 HTML、穿窗上限、本集地圖的條件、chapterMapCtx 的相機數學、地圖版組裝）。
- 範例：`examples.test.mjs` 加三支（靜態 27 項全過；整合「54 支排進同一個專案 → build → audit 0 ✖ 0 ⚠ → 亂序截圖一致」過）。三支 `custom-check --stress --shots` 都 ✓（剩的 ⚠ 是驗收工具把同一個模板排成相鄰三段）。
- 真的 build：`projects/t036`（t034-full 的完整複本，不連結）加四個 01＋`chapterMap`、s0110 `enter: "dive"`：`--check` 0 ✖、`audit` 6 段 0 ✖；snapshot 看過地圖 1／4、2／4、3／4、4／4（鏡頭推進中、完成態）和穿窗中途（窗從前一段的標題長出、前一段放大）。

## 和定案不一樣的地方

- 地圖版面第一輪：亮色底上路線看不到（線用 `--sc-ch-sub-ink` 白色）、下一排的站名壓到章號牌 → 路線改兩層（淡框線＋深色線，和站一樣亮底暗底都看得到）、`MAP` 改 scale 1.1、站在 (640, 320)、上下兩排差 100；後面的章改成底不透明、字淡一點（原本整個半透明，路線會透出來）。
- 地圖版直式不做（⚠ 照舊）：定案沒寫，地圖是照橫式排的。
- 回顧牆「截圖還沒有時先用標籤卡代替」改成先放空白圖＋⚠（模板不用多一種樣子；分鏡表停點 ③ 之後一定有截圖）。
- 回顧牆開場的「合影進場」語彙表沒有，分鏡寫「游標移動＋淡入（錯拍）」，沒新增語彙。
- 前後拉桿的膠囊：「之後」在左上、「之前」在右上（拉桿從左邊出發，之後那層一定在杆子左邊）。
- 截圖接力不畫引線（子母畫面版放不下），用主色亮框標出講到的那張；不配音效（條列逐條不配）。
- 順手修：暗色主題的全寬段底色是亮的（034 留下的：暗色沒有覆寫 `--sc-fs-bg`）→ `kit/scene.css` 暗色補 `--sc-fs-bg`；`custom-check --shots` 只帶走 `<id>.png`，現在 qc storyboard 存 `<id>-N.png` → 全部帶走。

## 留給作者

- 01 和下一段在同一句開始時（空檔 < 2 秒、01 從那句起點蓋 2.5 秒），下一段如果是不透明的全畫面段，z 比較高會蓋住 01（一般 01 也一樣，不是地圖版才有）。真實專案的章節段放在停頓裡少見，這次沒改。

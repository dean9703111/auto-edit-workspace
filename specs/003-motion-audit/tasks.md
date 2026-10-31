# Tasks: 003 motion-audit

**Spec**: `spec.md`　**Plan**: `plan.md`　**契約**：`specs/contracts/cli-003.md`、`specs/contracts/cues.md`（002）
**記號**：`[P]`＝和同一階段其他 `[P]` 任務改不同檔、可以同時做（可以各派一個子代理）；沒標的照順序做。每個任務的「完成」都要附驗證輸出（憲法：交付附驗證方式）。

## 依賴總覽

```
Phase 0 前置 ──┬─> Phase 1 SM ───────────────┬─> Phase 3 改寫 4 支 [P×4] ─┐
               │                              ├─> Phase 4 新 5 支 [P×5] ───┼─> Phase 6 整合驗收 ─> Phase 7 交件
               └─> Phase 2 audit ─> T025 基準 ─┘                            │
                                   Phase 5 預覽頁（T050 等 T030–T044 檔頭定稿）┘
```

- Phase 1 和 Phase 2 改的檔不重疊，可以同時做（兩條各一個子代理）。
- Phase 3、Phase 4 的 9 支範例彼此獨立；寫檔只需要 Phase 1 的 API 名稱定案（FR-002、FR-010、FR-015），**跑**驗證要等 Phase 1 完成。
- 整合測試（T061）要 002 的 cue 注入（002 FR-017–FR-018）已經合併；沒合併前用 T061 的「手動注入」退路。

---

## Phase 0：前置

- [x] **T001** 讀 `specs/contracts/cues.md` v1（002，2026-10-31）並對齊：spec「和 002 契約的對齊」表已逐列核對。
- [ ] **T001b** 等 002 回覆本線對 cues.md 的 3 項補充與 §5 預覽頁寫法（spec「請 00N 加」002 第 1 列）；002 改了 cues.md 就重跑對齊表。
  - 完成：對齊表沒有「請 002 收進」字樣；或 002 回覆不收、本線拿掉補充。
- [ ] **T002** 取得主代理裁決：`tools/lib/custom-preview.mjs` 所有權（spec 待裁決 1）、嚴重度（5）、間隔門檻（4）。
  - 完成：裁決結果寫進 spec.md「待主代理裁決」各條後面。
- [ ] **T003** 存一份改寫前的範例：`git show HEAD:shared/template/custom/<檔>` 4 支存到 `/private/tmp/…/scratchpad/w003/before/`（T025 用；不放進 repo）。
  - 完成：`ls -l` 4 個檔，大小和 HEAD 相同。

## Phase 1：SceneMotion（`shared/template/kit/scene-motion.js`，同一個檔，照順序）

- [ ] **T010** 找段（cues.md §4.1）、`readSample`、`P.at`、`P.dur`、`P.end()`、`P.marks`、`window.SceneMotion.marks`、`pushErr`（plan §A.1）。
  - 完成：`motion.test` 的 A.4（cues.md §6 #1–#13＋本線 E1–E6）全過（T014 先寫測試再實作）。
- [ ] **T011** 亮度記錄 `lv`；`fade`／`move` 讀寫記錄；`P.focus`（plan §B.1）；骨架 `forEach` 名單說明加進 API 註解。
  - 完成：`motion.test`「P.focus 亂序 seek」「focus 後 P.out 不跳」「倒著寫丟錯」「ring 第 0 秒看不到」全過；既有「P.in／P.rise 起點與終點值」不改仍過。
- [ ] **T012** `scType` plugin、`prep`、`paint`、`P.type`（plan §C.1）。
  - 完成：`motion.test` 的 C.2 全過；`grep -nE "setTimeout|setInterval|onUpdate|Math.random" shared/template/kit/scene-motion.js` 沒有新增（既有測試 `motion.test.mjs:43`）。
- [ ] **T013** SM 開頭 API 註解：加 5 列、刪「綁口播時傳 T.at(句號)」（SM:70）。
  - 完成：`motion.test`「新 API 與常數存在，開頭 API 註解有記錄」擴充到 at／dur／end()／focus／type 後過。
- [ ] **T014** `dev/tests/motion.test.mjs`：先寫 T010–T012 的測試（紅燈），`helpers.mjs` 加 `makeDomShim()`。
  - 完成：`node --test dev/tests/motion.test.mjs` 在 T010–T012 之前失敗、之後全過；印出的測試名稱貼進回報。

## Phase 2：audit（AP、AR、AB、AU 四個檔；T020 與 T021 可同時做）

- [ ] **T020** [P] `lib/audit-page.mjs`：`measureInPage` 加 F.1 的欄位；新增 `collectMotionInPage`（plan §F.2）。
  - 完成：`audit.test` 既有斷言全過（欄位只加不改）；瀏覽器實量測試（T023）量到新欄位。
- [ ] **T021** [P] `lib/audit-rules.mjs`：G.1 常數、`judgeLayout`、`judgeMotion`、`stillTimes`、`cueFindings`、`customDuration.autoEnd`（plan §G）。
  - 完成：T022 的純函式測試全過。
- [ ] **T022** [P] `dev/tests/audit.test.mjs`：版面 8 條 × 違規／過關、節奏 4 條 × 違規／過關、`cueFindings`、`autoEnd`、`stillTimes`；訊息用 `assert.match` 對 cli-003 §2 原文的關鍵字（和 T021 同時寫：先寫測試）。
  - 完成：`node --test dev/tests/audit.test.mjs` 全過；新增測試數 ≥ 28。
- [ ] **T023** `lib/audit-browser.mjs`：`S.motion()`、`S.cueErrors()`；`audit.test` 加瀏覽器實量 fixture（plan §J）。
  - 完成：作者 Mac 上這支測試沒有 skip、量到 `unpositioned`、`title-overlap`、`stagger`、`hold` 四個 rule。
- [ ] **T024** `tools/audit.mjs`：取樣排程（still）、呼叫新規則、`durationWarnings` 用 `autoEnd`、檔頭／`--help` 照 cli-003 §1（含禁入區數字改照 `PIP_ZONE`）。
  - 完成：`node shared/template/tools/audit.mjs --help` 的輸出和 cli-003 §1 逐字相同（`audit.test` 斷言）；`projects/範例` 跑 audit 結束碼和改之前相同（範例專案沒有 custom 時印「plan.json 沒有 custom 段」）。
- [ ] **T025** SC-004 基準：用 T003 的 4 支改寫前範例建暫存專案（`makeCustomProject`，T060），跑新版 audit，存報告到 `dev/loop/003-before.md`（007 擁有 `dev/loop/**`：交給 007 收，或主代理同意後由本線寫）。
  - 完成：報告至少有 spec SC-004 列的 7 筆 rule；貼出 `audit --json` 裡 `findings[].rule` 的計數。

## Phase 3：4 支範例改寫（每支一個子代理，`[P]`）

每支的共同完成條件：
1. 照 plan §D.x 的表改完；檔頭 6 小節；`data-cues-sample`；`P.end()`；骨架新 `forEach`。
2. `grep -nE "相減|填回 .*data-duration|2 段 custom|一起進場|進場 0\.3–0\.5|const D =" <檔>` 沒有輸出。
3. `examples.test` 結構測試（T062）這支過。
4. 回報：檔案路徑、綁了哪幾句（ref 清單）、D 下限公式、`examples.test` 輸出。

- [ ] **T030** [P] `custom/x-process.html`（plan §D.1；`examples.test.mjs:130` 的曲線幾何檢查要過）。
- [ ] **T031** [P] `custom/x-metaphor.html`（plan §D.2）。
- [ ] **T032** [P] `custom/x-before-after.html`（plan §D.3；刪 `:12` 的「2 段 custom」）。
- [ ] **T033** [P] `custom/x-numbers.html`（plan §D.4；刪 `:13` 的「2 段 custom」）。

## Phase 4：5 支新範例（每支一個子代理，`[P]`）

每支的共同完成條件（spec FR-030）：
1. 照 plan §E.x 的版面表與時間軸寫；R7.3 骨架（含新 `forEach`）；檔頭 6 小節（適用口播、不要用、要改的地方、綁句欄位、D 下限、版面）＋變體表（有的話）。
2. 只用 token 顏色、SM 方法；圖示 svg 從 `kit/icons.json` 原文貼上（拿掉 class、width、height）。
3. `data-cues-sample` 和 plan 給的值相同；`examples.test` 結構測試這支過。
4. 回報：檔案路徑、綁了哪幾句、D 下限公式、R7.6 檢查結果（整合測試前先回報結構測試；整合後補 audit 輸出）。

- [ ] **T040** [P] `custom/x-warnings.html`（plan §E.1）。
- [ ] **T041** [P] `custom/x-prompt.html`（plan §E.2；含指令、網址兩個變體的檔頭表；snapshot 量底線離字底 8–10 px，調 `.xprompt-u` 的 `bottom`，量到的值寫進檔頭）。
- [ ] **T042** [P] `custom/x-ui-mock.html`（plan §E.3；檔頭寫 origin 與游標終點公式；plan.json 範例含 `"clicks"`）。
- [ ] **T043** [P] `custom/x-architecture.html`（plan §E.4）。
- [ ] **T044** [P] `custom/x-branch.html`（plan §E.5；含兩條分支、匯流兩個變體的檔頭表）。

## Phase 5：預覽頁

- [ ] **T050** [P] `tools/lib/custom-preview.mjs`（T002 裁決後；歸 002 時改成把 plan §I.1 交給 002）：`buildCustomPreview`。
  - 完成：`examples.test`「buildCustomPreview：有 template 內容、沒有 window.__cues、有 ?t= 與 hf-preview-ready」過。
- [ ] **T051** [P] `shared/template/index.html`：④ 情境動畫分頁與 9 張卡（說明句等 T030–T044 的檔頭定稿）；`#motion` 刪兩行舊數字；`#sfx` 照 sfx.md 分組（plan §I.2）。
  - 完成：`examples.test` 的 index.html 對應測試過；`grep -nE "進場 0\.3–0\.5|露臉 3" shared/template/index.html` 沒有輸出。
- [ ] **T052** 請 002 在 `runGallery` 呼叫 `buildCustomPreview`（spec「請 002 加」第 3 列）；合併後跑 `node shared/template/tools/build.mjs --gallery`，用瀏覽器開 `shared/template/index.html#custom` 看 9 支都在動，各截一張 `?t=<完成態>`。
  - 完成：9 張截圖路徑＋`ls -l shared/template/preview/x-*.html`。

## Phase 6：整合驗收

- [ ] **T060** `helpers.mjs` 加 `makeCustomProject({ examples, gap })`（plan §J 的 rough.mp4／rough.srt／plan.json 產生法）。
  - 完成：產生的專案 `build.mjs --check` 0 ✖（用改寫前的 4 支也要能跑，T025 用）。
- [ ] **T061** `examples.test` 整合：9 支 → `--check` 0 ✖ → build → `audit --json` 0 ✖、新 rule 0 ⚠ → 亂序 snapshot 比對（FR-036）。002 的 cue 注入還沒合併時：測試在 build 後把 `window.__cues`（由 sample＋段起點算）手動插進 index.html `<head>`，並在測試名稱標「手動注入」；合併後拿掉這段。
  - 完成：`node --test dev/tests/examples.test.mjs` 在作者 Mac 上全過、0 skip；貼出耗時（≤ 120 s，FR-074）。
- [ ] **T062** `examples.test` 結構：9 支骨架、6 小節、sample 涵蓋 `P.at` 字面值、D 下限可解析且 sample 滿足、句號區段不重疊、圖示存在、沒有色碼與 font-family（spec FR-072）。
  - 完成：測試過；故意把一支的 sample 刪一個 ref → 測試失敗並指出檔名與 ref（貼輸出）。
- [ ] **T063** [P] `icons.test.mjs` 擴充到新 5 支（FR-073）。
- [ ] **T064** 全部測試：`node --test dev/tests/*.test.mjs`。
  - 完成：0 失敗；本線 4 個測試檔 0 skip；貼出最後的 `# pass`／`# fail` 行。
- [ ] **T065** 亂序 snapshot 人工複查：9 支各挑完成態一張，貼進回報；看文字斷行、底線位置、游標、點的位置。
  - 完成：9 張截圖路徑＋每張一句觀察。

## Phase 7：交件

- [ ] **T070** `docs.md` 照實作結果更新（訊息原文以程式輸出為準，和 cli-003 不同時兩邊一起改），交 001。
- [ ] **T071** `specs/contracts/cli-003.md` 對照 `audit.mjs --help` 與 `audit.test` 的斷言，逐條確認原文一致。
- [ ] **T072** 回報主代理：改了哪些檔（`git status --short` 只列 003 擁有的檔）、測試輸出、SC-001–SC-006 各一行結果、「請 00N 加」各列的狀態。

## 第 2 輪（r1 使用者回饋 F3／F4、審查 r1-B）

- [x] **T080** F4 fx：40 張 fx 的宣告變數全部有讀到、程式讀的都有宣告（`examples.test`「fx 40 張」）；fx 29 加 `unit`、拿掉沒用的 `text`；`fx/index.html` 40 個「複製 plan 片段」改成 plan.mjs 收的寫法（`bg` 寫外層、不寫 `accent`）、內嵌程式碼和檔案同步（`examples.test`「fx 圖庫」）。
- [x] **T081** F4 custom：9 支檔頭【綁句欄位】改成 `@詞` 為主，程式的拍點常數同步改成 `P.at('#N@詞')`（sample 補 refs）；【要改的地方】圖示改成「整段貼上、一個字都不改」並說明 `<rect>` 的寬高。
- [x] **T082** F4 audit：⚠ `cue-text` 綁句對不上（cli-003 §2.3b）。字幕文字取 `build --check` 的 `res.cuesOut`（成片秒數、有 text），**不用請 002 在 cues.md 加 `text`**。
- [x] **T083** B-02 P1 x-ui-mock：按鈕移到中心 (1000, 84)、通知 top 360、第三列在 ZOOM 淡出；檔頭寫按鈕位置上限公式。
- [x] **T084** B-03 未定位頂層的父層印成 `root（<comp>）`；B-04 綁句失敗的原因去掉自帶的 →；B-05 `--json` 的 `segments[].motion` 照 cli-003 §5（units 個數、marks／busy 段內秒）。
- 不在本線：B-11（`build --check`，002）；F4 情境模板的 beat 綁 `@詞`（`scenes/**` 這一輪不在 003 的所有權表，主代理另派）。
- [x] **T086**（004 請求）fx 27 打字機的時間軸只有 tl.set（沒有補間），截圖工具算不出完成態：檔裡加 `tl.addLabel('done', 第一行打完停留的中間)`；`fx/catalog.json` 每張加 `done`（`"timeline"`＝看時間軸、`"label"`＝讀 `window.__timelines[comp].labels.done`，段內秒數），頂層 `done` 寫說明。`lib/audit-browser.mjs` 的 `openSession({ dir, chrome, runtime })`、`findRuntime(opts).file`、session 方法（seek／measure／motion／cueErrors／evaluate／screenshot／close／errors）不改，`audit.test` 有斷言。
- [x] **T085** F3：008 動畫庫 8 支（x-callout、x-stack、x-checklist、x-timeline、x-versus、x-trend、x-ring、x-fix）搬進 `shared/template/custom/`（檔頭拿掉「拿掉 class、width、height」、靈感行改指 NOTICE.md；x-checklist 進度軌道改 `--sc-fs-node-line`）；examples.test／icons.test／index.html ④ 改成 17 支（數量用 `COUNT`，x-checklist 標 `noIcon`）；makeProject 開場句號＝sample 第一句 − 1、`@詞` 放句中；NOTICE.md 加「情境動畫範例的靈感來源（008）」；docs.md §4 R7.5 加 8 列、§9 SITUATIONS 加 8 列＋12／13／04a 次選、§11 兩條；cue-text 修兩個誤報（刪除線／位移不算出現、數字與英文整個詞比）；custom-preview 拿掉不存在的 `../bg.jpg`。

## 第 3 輪（010 motion v2 階段 B，第一棒：原語＋audit）

- [x] **T090** `kit/scene-motion.js` v2：§11 全部原語（chars／wipe／wipeOut／slide／slideOut／pop／punch／dim／marker／strike／sheen／ripple／comet／flow／idle／spot／cam／grow／ambient／sfx）、`P.V2` 曲線表、`P.U`、`P.region`（`window.__regions` 蓋過橫式預設）、`P.end()` 自動背景環境層；舊 `P.OUT` 改 0.3（＝V2.OUT）。契約 `specs/contracts/motion.md`。
- [x] **T091** 每個 tween 帶 `data:{sc, role, fn}`；motion.test：API 清單、標記、每個原語亂序 seek 的計算樣式與 snapshot md5 相同。
- [x] **T092** audit §13 四條：`[data-sc-ch]` 併回父元素、同一個 `sc` 算 1 個新元素、`role: micro` 不算忙碌（hold／tail／static／靜止取樣）、量版面跳過 v2 自動插的元素；`fn` 判 wipe／slide 進場、wipeOut／slideOut 退場。
- [x] **T093** 新規則「分鏡對齊」（`tools/lib/audit-beats.mjs`，cli-003 §2.3d）：✖ beats-header／missing／extra／vocab／cue，⚠ beats-none／prim；語彙 45 個和 `shared/template/BEATS.md` §2 逐列比對；訊息只指 `shared/`。
- [x] **T094** examples.test：方法偵測認 `P.k = function`、CSS 光暈／漸層只能 `var(--v2-*)`、makeProject 寫 `work/storyboard.md` 分鏡表（17 支整合 0 ✖ 0 ⚠）。
- [x] **T095** `scene.css` 浮塵改遮罩＋`--v2-dust-ink: var(--brand)`（004 回報：寫死主色碼，brand.mjs 換不到）。
- [x] **T096** 第二棒：18 個情境模板 v2（檔頭「預設拍型」；07 收原型）、x-process（拍型 A）／x-timeline（拍型 B）；projects/範例 s03／x01／x05 對原型條一致（x05 預覽態比原型多了壓暗：原型的 $q 把 'none' 變成 [] 沒生效，正式 kit 照分鏡做）；每格 render 1.15–1.3 倍。
- [x] **T097** 暗色：scene.css dark 區塊補 `--sc-side-*`、`--sc-card*`、`--sc-plate`、`--sc-deep`、`--sc-ch-*`；18 個模板暗色截圖看過；`.sc-mk` 不用負 z-index（混色）。
- [x] **T098** audit：`MERGE_WIN` 0.6、新元素只算 role enter、hold／tail 不看 accent、grow 算進場、subpixel 不量縮放中與漂浮中的元素；examples.test 亂序截圖容許十萬分之一反鋸齒差。
- [x] **T099** 04a–d 主卡進場看 `P.prev()`（fullscreen＝換卡不換景 `P.wipe`＋`P.pop`；speaker／pip＝`P.grow`）；x-process／x-timeline 改預設寫法 `const ENTER = P.prev() === 'fullscreen' ? 'swap' : 'grow';`；examples.test 認預設寫法與字面值 `'grow'`／`'swap'`。
- [ ] **T100** P2 暫存沒清：hyperframes 的 `hf-final-tmp-*`（render 暫存）與 look.mjs 的 `look-*` Chrome profile 在測試後沒清，1 小時累積 31 GB、系統碟寫滿（ffmpeg ENOSPC）。之後由各自擁有者在測試結束時清掉或改指到 scratchpad：`hf-*`＝hyperframes CLI／check-all 的 fixture，`look-*`＝006。暫時做法：`TMPDIR=/Volumes/video/auto-edit-tmp`（check-all 會自動偵測並設給子程序）。
- [x] **T101** 收尾掃描（2026-10-31）：20 支 custom（17＋x-scene 三支）都是 `const ENTER = P.prev() === 'fullscreen' ? 'swap' : 'grow'`、都有 `P.sfx`、第一行都是「預設拍型」（x-process 補 A、x-timeline 補 B；x-metaphor／x-prompt／x-ui-mock 從「待定」改 G／H／I，不再指到 specs/）；標題逐字上浮統一 0.5 s（x-process 0.65、x-timeline 0.72、x-scene 三支 0.65 → 0.5；x-prompt 0.62 照 BEATS H：標題列圖示 0.5）；`audit --all` 0 ✖。驗證：examples.test 整合 20 段 0 ✖ 0 ⚠、亂序 snapshot 過；swap／grow 兩種開場 audit 都沒有密度 ⚠。
- [x] **T102** 段起點當隱含的一拍（T113c）。
- [x] **T103** 語彙 46 個（游標移動 → P.morph）；`VOCAB_ALT`：回均衡也認 `P.dim`、退焦也認 `P.spot`（預覽態／dim）；design-system §14.1、cli-003 §2.3d 一起改。
- [x] **T104** 第二棒＝011 T113a–d（見 `specs/011-illustrated-beats/tasks.md` 003 節）。
- [x] **T105** kit 亂序不確定（W2／W3 回報）：縮放過又回到 1 的元素（聚焦「走過」、`P.dim` 亮回 1、逐字彈出、回均衡）在 Chrome 裡反鋸齒跟著 seek 先後不同。`mv()` 把縮放回 1 換成 `V2.REST`＝1.0001（第一個縮放補間的起點仍是 1），motion.md §6 記錄。驗證：把「走過」加回 x-process／x-branch／x-architecture、逐字彈出加回 x-before-after／x-trend／x-architecture、列改回 `P.dim` 的 x-versus，舊 kit 22／317／328／2550–3867／55–138 個色值 → 新 kit 全部 0（32 個整合取樣點＋0.5 s 密集取樣）；motion.test 新增 REST 測試。x-architecture 改回「走過」，各支「不用 pop／不用 done：亂序…」的註解拿掉。
- [x] **T106** snapWidths 改量計算樣式的寬（`getComputedStyle().width`＋內距框線），不用 `getBoundingClientRect`：fonts.ready 時祖先可能停在進場縮放（彈出 0.7、長出）。
- [x] **T107** audit：svg 的 shapeRect 不含 v2 零件（彗星頭與光暈），標題「間距不足」不再誤報；examples.test 亂序 snapshot 每次先截一格暖身（0.1 s，不比）。qc.mjs 沒有亂序比對，不用改。
- [ ] **T108** P2（沒修，記錄）：`hyperframes snapshot` 照順序從段前一格跳進 P.grow 期間（段起點＋0.3–1.1 s）時，那一格截到的是原尺寸的卡（DOM 計算樣式和亂序時相同，像是截圖早於重畫）；整合測試的取樣點不會碰到。render 的平行 worker 如果剛好從長出中間開始，可能有一格閃大卡。重現：0.5 s 密集取樣 x-before-after、x-trend 的段起點＋0.4 s。
- [ ] **T109** P2：「游標移動」用 `P.morph` 動 left／top，慢的尾巴每格 < 1 px 會一格一格跳（HyperFrames 的 `gsap_non_transform_motion` 規則講的就是這個）；改 x／y 會和聚焦的 lift（y）打架，要另外包一層。
- 請 002：`scanCueRefs` 收 `P.sfx` 的 ref、build 把 `P.sfx` 解析成 `<audio>`（motion.md §5）；`lib/scenes.mjs:366` 訊息寫死「D−0.4−0.6」，`P.OUT` 已是 0.3。

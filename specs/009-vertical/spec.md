# Feature Specification: 009 vertical（直式短影片）

**Feature Branch**: `009-vertical`

**Created**: 2026-10-31

**Status**: Draft（只有規格；還沒有 plan.md、tasks.md、契約）

**Input**: 使用者原話：「我在思考，如果調整成直式的短影片，應該也要能適用，但這個會在一開始 Agents.md 就設定好分歧的路，另外其他流程也都是照做，範例我覺得可以先把範例的mp4裁剪成短影片的格式」。主代理已備好 `projects/範例-直式/`（`素材/真人錄影/示範口播-直式.mp4` 202×360、170.8 s，`講稿.md`）。

**研究**：`specs/009-vertical/research.md`（平台慣例、安全區、版面對照與 ASCII 圖、custom 改寫成本、範例素材觀察、寫死 1920×1080 的盤點）。本檔的數字都出自 research §1.1、§2、§4；標「建議初值」的要等驗證計畫（§F）後再定。

**契約**：本線新增 `specs/contracts/canvas.md`（畫布設定，草稿在本檔 §B，整合時由 002 搬過去並擁有）；改 `plan-fields.md`（加 `format`）、`check-json.md`（加 `format`、`canvas`、`formatSource`，不升 schema）、`cli-002.md`（`srt-align`／`srt-split` 預設 `--max`、`status.mjs` 第一行、build 的版式行與 `--format`）、`cli-004.md`（`qc.mjs framing` 直式候選）、`stop-points.md`（不變，只加一句「直式時停點 ② 的預覽圖是直的」）。

## 背景（一段話）

工作區現在只會做 1920×1080 長片。使用者要同一套流程也能做 9:16 短影片，而且分歧只在一開始決定一次。研究結論（research §0）：版式寫進 plan.json 第一層 `format`；直式只有三種版面（疊加、上下分割、全幕）；04 家族、17 支 custom 與 40 張 fx 都用「1920 舞台等比縮放」放進直式畫面，不改檔；下方字卡只換位置；字幕縮到每則 10 字。差異全部收進一份畫布設定（`tools/lib/canvas.mjs`），文件只在 AGENTS.md 加一節分歧表。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 直式素材剪成直式短影片（Priority: P1）🎯 MVP

作者把手機直拍的口播放進 `素材/真人錄影/`，說「剪這支影片」。AI 在開工決策表判定「直式」，之後照同樣的剪乾淨、剪好看、六個停點做下去，成片是 1080×1920，字幕、卡片、角標都在平台介面蓋不到的地方，講者在子母畫面的位置變成下半面板、不會消失。

**Why this priority**: 這是使用者要的主要情境（手機直拍短影片）；不碰橫式素材裁切，能單獨上線。

**Independent Test**: 在 `projects/範例-直式` 用 Sonnet 從「剪這支影片」跑到 `成片/final.mp4`（§F 驗證計畫 V-1–V-8）：`ffprobe` 1080×1920、30 fps、有音軌；`qc.mjs final` 0 ✖；六個停點的最後一行和橫式逐字相同（只有內容不同）。

**Acceptance Scenarios**:

1. **Given** 主軌 202×360、使用者沒提版式，**When** 開工，**Then** 製作進度.md 開工決策表「版式」列寫「直式（主軌 202×360，寬 < 高）」，status.mjs 第一行印 `版式：直式 1080×1920（來源：work/製作進度.md）`。
2. **Given** 直式專案剪乾淨第 6 步，**When** `media.mjs srt-split --project … --dry-run`，**Then** 不用加參數就以每則 10 字拆句，印 `版式：直式 → 每則最多 10 字`。
3. **Given** 草稿 plan.json 沒寫 `format` 而製作進度.md 是直式，**When** `build.mjs --check`，**Then** ✖ `plan.json 沒有 "format"，但開工決策表是直式 → plan.json 第一層加 "format": "portrait"`。
4. **Given** plan.json `"format": "portrait"`、一段 04a、一段 x-process，**When** build，**Then** `index.html` 的 root 是 1080×1920；兩段的子合成檔和橫式逐位元組相同，host 帶舞台縮放（research §2.2）；同時段有下半講者面板。
5. **Given** 一段 03 side-panel，**When** `--check`，**Then** ✖ `s05 是半畫面（03），直式不提供 → 改 13 標題條列，或 04a 全畫面清單（上下分割）`。
6. **Given** 直式成片，**When** `qc.mjs final`，**Then** 格式檢查以 1080×1920 為準；上下分割段沒有講者面板時 ✖（沿用「講者小窗」規則，名稱改「講者面板」）。

---

### User Story 2 - 橫式完全不變（Priority: P1）

既有橫式專案（`projects/範例`）不寫 `format` 時，所有工具的輸出和改版前一樣。

**Why this priority**: 橫式是現有主力，不能因為直式回歸。

**Independent Test**: 改版前後各 build 一次 `projects/範例`，`work/hyperframes/` 下除了 `.build-manifest.json` 的時間戳以外逐位元組相同；`dev/tests` 全過；`--check --json` 只多 `format`、`canvas`、`formatSource` 三個鍵。

**Acceptance Scenarios**:

1. **Given** plan.json 沒有 `format`，**When** build，**Then** 產生檔和改版前相同。
2. **Given** plan.json `"format": "landscape"`，**When** build，**Then** 同上（顯式寫也一樣）。
3. **Given** 直式素材、`"format": "landscape"`，**When** `--check`，**Then** ✖ `主軌是 202×360（直式），直式素材做橫式不在範圍 → 改成 "format": "portrait"，或換橫式素材`。

---

### User Story 3 - 橫式素材剪成直式（Priority: P2）

作者拿橫式口播說「剪成短影片」。停點 ② 的構圖預覽給 9:16 直條的三個倍率，選好後寫進 `frame`，之後流程同 US1。

**Why this priority**: 次要情境；要多處理構圖與講者面板的臉太大問題（research §5）。

**Independent Test**: 主代理另開 `projects/範例-橫轉直`（複製 `projects/範例/素材`），說「剪成短影片」跑到停點 ④：構圖預覽是三張直條；選 1.0 後 `frame` 寬高比 9:16；Studio 裡講者滿版段臉在 y 380–860。

**Acceptance Scenarios**:

1. **Given** 主軌 640×360、使用者說「短影片」，**When** 開工，**Then** 版式＝直式（使用者的話優先於寬高比）。
2. **Given** 直式專案、主軌橫式、plan.json 沒有 `frame`，**When** `--check`，**Then** ✖ `橫式素材做直式要先選 9:16 構圖 → 跑 qc.mjs framing --cards，停點 ② 選倍率後寫 frame`。
3. **Given** 上下分割的講者面板放不下臉（臉在面板裡超出 y 940–1280），**When** `--check`，**Then** ⚠ 並附 `pipCrop` 建議值。

---

### User Story 4 - 直式插入螢幕錄影與圖片（Priority: P2）

直式專案的 media 段：16:9 錄影放在上半面板、講者在下半；手機直式錄影可以鋪滿全畫面；紅框、說明卡照樣用素材像素寫。

**Independent Test**: `projects/範例-直式` 加一支 16:9 與一支 9:16 錄影的測試 plan（dev 測試 fixture），build 後 snapshot：16:9 錄影在 y 266–874，9:16 錄影 `pip: false`＋`cover` 鋪滿；說明卡不進字幕保留帶與右側按鈕列。

**Acceptance Scenarios**:

1. **Given** 16:9 錄影、`fit: "contain"`、有講者面板，**When** build，**Then** 錄影 1080×608 置中在 y 240–900。
2. **Given** 同一段沒有 `moves`、長度 > 3 s，**When** `qc.mjs storyboard`，**Then** ⚠ `m01 的錄影在直式只有原尺寸 56 %，介面字會太小 → 加 moves 推近到操作區`。

---

### User Story 5 - 剪輯台與 Studio 看得到直式（Priority: P2）

停點 ④ Studio、停點 ⑤ 剪輯台的預覽框是 9:16，講者框疊圖、縮圖、字幕字數提醒都照直式。

**Independent Test**: `dev/tests/editor.test.mjs` 用 `"format": "portrait"` 的 fixture：預覽框 CSS 是 9:16、講者框疊圖以 1080×1920 換算、字幕超過 10 字時標紅。

---

### Edge Cases

- 主軌寬高比 = 1（正方形）：當橫式，開工決策表寫「寬 = 高，預設橫式」並在回報問一句。
- 多支主軌寬高比不同（`media.mjs main` 接主軌）：以第一支為準，其他支不同時 ⚠（`main` 已經跟第一支的解析度轉檔）。
- 製作進度.md 不存在（使用者直接說「剪好看」）：版式來源退到 plan.json，再退到主軌寬高比；印出來源。
- 直式專案用 01 章節轉場（影片 ≥ 180 s）：可以用（P2 的舞台縮放）；P1 期間 `--check` ⚠「直式 01 還沒驗證」。
- 直式 + `"chapterBadge": false`、`rhythm: "spaced"`、`outro`、`edit`（剪輯台 cuts、joins punch）：行為和橫式相同；punch 的放大原點用直式講者框上方。
- 直式的 `sideShift`：沒有意義；寫了 ⚠「直式不用 sideShift（沒有半畫面）」。
- 直式 overlay custom（`layout: "overlay"`）：沒有舞台縮放，子合成直接用 1080×1920 座標（R7 加一句）；範例裡沒有 overlay custom，這條只留規則。
- 素材已經是 1080×1920 以上（例：4K 直拍 2160×3840）：底片編碼縮到 1080×1920，和橫式 4K 的處理一樣。

## Requirements *(mandatory)*

### A. 分歧設計

- **FR-001** [001]：開工決策表加一列「版式」（`.agents/skills/auto-edit-longform/references/progress-template.md` 與 AGENTS.md「開工」表）。判斷順序：①使用者說「短影片」「直式」「Shorts」「Reels」「抖音」→ 直式；②說「長片」「橫式」→ 橫式；③都沒說：ffprobe 主軌，寬 < 高 → 直式，否則橫式。欄位值寫「直式（理由）」或「橫式（理由）」，開頭兩個字固定，工具讀這兩個字。使用者之後說「改成直式／橫式」可以覆寫（覆寫時新增停點紀錄列，不改舊列）。
- **FR-002** [002]：plan.json 第一層新增 `format`：`"landscape"`｜`"portrait"`，預設 `"landscape"`；`TOP_KEYS` 放在 `version` 後面（`['version', 'format', 'frame', …]`）。其他值 ✖ `format 只能是 "landscape" 或 "portrait"`。橫式不用寫。
- **FR-003** [002]：新函式 `resolveFormat({ projectDir, plan, flag })` → `{ format, source }`，順序：`--format` 參數 > plan.json `format` > `work/製作進度.md` 開工決策表「版式」列（`/^\|\s*版式\s*\|\s*(直式|橫式)/m`）> 主軌寬高比（`work/main.mp4`，沒有就 `素材/真人錄影/` 第一支，再沒有就 `素材/聲音/` → 橫式）。會受版式影響的指令（`build.mjs`、`status.mjs`、`media.mjs srt-split`、`qc.mjs`、`audit.mjs`、`editor.mjs`）第一行印 `版式：直式 1080×1920（來源：plan.json）`（橫式也印，`橫式 1920×1080`）。
- **FR-004** [002]：`--check` 一致性檢查：plan.json 的版式和開工決策表不同 → ✖ 並列出兩邊的值與 →；plan.json 沒寫 `format` 但開工決策表是直式 → ✖（US1-3）；主軌直式而 `format` 是橫式 → ✖（US2-3）。
- **FR-005** [002]：`format` 不存在或是 `"landscape"` 時，build 的所有產生檔與改版前逐位元組相同（現有 `edit` 的同一條保證，FR 照抄）；`--check` 文字報告只多第一行版式。
- **FR-006** [002]：`--check --json` 第一層加 `format`（字串）、`canvas`（`[W, H]`）、`formatSource`（`"flag"`／`"plan"`／`"progress"`／`"media"`）。加欄位不升 `schema`（check-json §1 規則 5）。`items[].layoutZh` 直式時是「疊加」「上下分割」「全幕」，`layout` 機器值不變。
- **FR-007** [002]：`status.mjs` 第一行印版式（FR-003 格式）；「下一步」邏輯不變。
- **FR-008** [001]：六個停點的固定回覆格式一字不改（`contracts/stop-points.md`）；停點 ② 的兩張預覽圖直式時是直的，倍率仍是 1.0／1.15／1.3。

### B. 畫布設定（`tools/lib/canvas.mjs`，契約定稿在 `specs/contracts/canvas.md`；數字以 canvas.mjs 為準，本節的表是 2026-10-31 定稿時的抄錄）

- **FR-010** [002]：新檔 `tools/lib/canvas.mjs` 匯出 `CANVAS = { landscape, portrait }` 與 `canvasOf(format)`。橫式的值＝現在散在各檔的常數（搬進來，數值不變）；直式的值如下表（建議初值）。直式的程式路徑一律讀這份，不准再寫死數字；橫式既有常數可以留在原檔，但要有測試確認和 `CANVAS.landscape` 相同。

| 鍵 | landscape（現行） | portrait（建議初值） | 誰用 |
|---|---|---|---|
| `W`、`H`、`fps` | 1920、1080、30 | 1080、1920、30 | 全部 |
| `unsafe[]` | `[]` | `[[0,0,1080,240],[0,1440,1080,1920],[940,840,1080,1440]]` | audit、plan footprint、media 擺位、qc 疊圖 |
| `textSafe[]` | `[[0,120,1920,870]]`（R4.1 內容區） | `[[60,240,1020,840],[60,840,940,1440]]` | 同上 |
| `caption` | `{ font: 76, line: 71, weight: 400, stroke: 0, pad: [24,37,23], bottom: 6, box: [40,956,1880,1074], zone: [0,920,1920,1080], maxChars: 18, maxW: 1840 }`（F8） | `{ font: 76, line: 71, weight: 400, stroke: 0, pad: [24,37,23], bottom: 511, box: [123,1291,957,1409], zone: [0,1280,1080,1420], maxChars: 10, maxW: 834 }`（決定 2：和橫式同一套，底板 118 高置中在 zone 裡；每則 10 字） | captions、srt-align／srt-split、plan 警告、editor、HF `--caption-zone` |
| `lowerThird` | `{ left: 120, bottom: 220, rect: [120,536,1020,860] }` | `{ left: 60, bottom: 680, rect: [60,880,940,1240] }` | scenes `@style-portrait`、FOOTPRINT |
| `centerCard` | `{ rect: [510,536,1410,860] }` | `{ left: 60, right: 140, rect: [60,880,940,1240] }` | 11、15 |
| `badge` | `{ rect: [1200,56,1824,168], side: 'right', dx: 16 }` | `{ rect: [60,250,684,362], side: 'left', dx: -16 }` | 常駐角標、02 |
| `pip` | `{ box: [1424,594,432,324], zone: [1424,581,1888,951], aspect: 4/3, frame: 'kit/pip-frame.png' }` | `{ box: [0,900,1080,1020], zone: [0,900,1080,1920], aspect: 1080/1020, frame: 'kit/pip-frame-v.png', face: [940,1280] }` | main、plan、media、qc |
| `stage.fs` | `null`（不縮放） | `{ window: [120,130,1300,880], to: [40,240], scale: 0.8475 }` | 04 家族、custom fullscreen |
| `stage.fx` | `null` | `{ opaque: { top: 416, scale: 0.5625 }, clear: { top: 766, scale: 0.5625 } }` | fx |
| `stage.ch` | `null` | `{ window: [160,260,1760,870], scale: 0.625, centerY: 860 }` | 01 章節 |
| `media.view` | `{ contain: [0,0,1920,940], cover: [0,0,1920,1080] }` | `{ contain: [0,240,1080,900], cover: [0,0,1080,900], containFull: [0,240,1080,1260], coverFull: [0,0,1080,1920] }`（`Full`＝沒有講者面板時） | lib/media.mjs |
| `framing` | `{ aspect: 16/9, headTop: 120 }` | `{ aspect: 9/16, headTop: [380,520], chinMax: 860 }` | qc framing |
| `minTextPx` | 30（audit 現行值） | 32（輸出像素） | audit |
| `regions` | motion.md §1 的橫式預設 | `band [60,880,880,360]`、`panelTop [0,0,1080,900]`、`panelBottom`／`pip [0,900,1080,1020]`、`badge [60,250,624,112]`、`captions [0,1280,1080,140]`、`safe [60,240,960,1200]`（`[x, y, w, h]`） | main 注入 `window.__regions`（012 `kit/scene-layout.js`、010 `P.region` 讀它） |

- **FR-011** [002]：`stage.fs` 的換算公式固定為 `X = to[0] + (x − window[0]) × scale`、`Y = to[1] + (y − window[1]) × scale`，host 的 CSS 是 `transform: translate(tx, ty) scale(s)`、`transform-origin: 0 0`（`tx = to[0] − window[0]×s`、`ty = to[1] − window[1]×s`）。`canvas.mjs` 匯出 `stageTransform(kind, canvas)` 給 main、audit、custom-preview、qc 共用。
  - `window` 是 `[x0, y0, x1, y1]`（不是 `[x, y, w, h]`）：`[120,130,1300,880]`＝1180×750，×0.8475＝1000×636。
  - host 除了 `transform`／`transform-origin`，還要加 `data-layout-allow-overflow`：縮放後的 1920×1080 子合成左緣到 x −61.7、右緣到 x 1565，不加 `hyperframes check` 會報 `panel_out_of_canvas` ⚠。
  - transform 寫在 host 的 CSS（`<style>` 的 `#el-<id>` 規則或 inline style），main 的 GSAP 對 host 只能動 `opacity`（動 `x`／`y`／`scale` 會改寫 inline transform、蓋掉舞台縮放；直式進場要位移就動 backdrop 或子合成裡的元素）。translate 取小數 3 位：`translate(-61.7px, 129.825px) scale(0.8475)`。（2026-10-31 spike，`specs/009-vertical/plan.md` D-1）

### C. 每一層要改什麼

#### C.0 前置驗證（Phase 0，阻擋其他實作）

- **FR-020** [002]：spike：1080×1920 root 裡放 data-width 1920／data-height 1080 的子合成 host、加 FR-011 的 transform，確認 ① `hyperframes check` 沒有新 error；② `snapshot` 與 `render` 的畫面位置正確；③ `preview`（Studio）顯示正確、能選取；④ 字幕子合成（1080×1920）在最上層。任一項不過的退路：host 外面包一層非 clip 的 `<div class="stage-wrap">` 做 transform；還不過就把子合成的 root 改成 data-width 1000／data-height 636，由 build 注入內層 scale（子合成檔仍不改）。spike 結果寫進 `specs/009-vertical/plan.md` 的決策紀錄。

#### C.1 主合成（`lib/main.mjs`）[002]

- **FR-021**：root、`<meta viewport>`、`#footage video`、captions host、test-clip root 的尺寸都讀 canvas。直式時 head 在 `kit/scene-motion.js` 之前注入 `<script>window.__regions = {…};</script>`（`canvas.mjs` 的 `regionsScript`；012 的 `kit/scene-layout.js` 與 010 的 `P.region` 都讀它）；橫式不注入（輸出不變）。
- **FR-022**：fullscreen 家族（04a–d、custom `layout: "fullscreen"`）直式時：host 帶 `stage.fs` transform；host 下面加一層 1080×1920 的純色 backdrop `#bd-<id>`（`var(--sc-fs-bg)`，01 用 `var(--sc-ch-bg)`；和 host 同起迄、同進退場：色帶擦入擦出、片尾淡出都同時動 host 與 backdrop），補滿舞台縮放後露出的頂端與左右。
- **FR-023**：fx 直式時：`bg` 是 dark／light／accent → backdrop 用同一個底色 token，舞台用 `stage.fx.opaque`；`bg: none` → 沒有 backdrop，舞台用 `stage.fx.clear`。01 用 `stage.ch`＋`bg-ch` backdrop。
- **FR-024**：常駐章節角標直式時用 `badge` 的位置，進場從左邊 16 px 滑入；隱藏規則同橫式（上下分割、全幕時淡出）。
- **FR-025**：`.pip` 直式時是講者面板：本體 `pip.box`、`overflow: hidden`；上緣一條主色 6 px 分隔線由 main 直接畫（`top: 897px`、`background: var(--brand)`，換主色自動跟著變），成片不用 `kit/pip-frame-v.png`（那張只給 brand 預留與剪輯台顯示用；`contracts/canvas.md` §6）。飛入的起點公式（`FLY`）改讀 `pip.box`，不再寫死 1424／594／432。
- **FR-026**：footage 側移（03 的 `sideShift`）直式不會發生（03 ✖）；punch 放大原點照 speakerBox 換算，不寫死 1920。

#### C.2 字幕（`kit/captions.css`、`lib/captions.mjs`、`media.mjs srt-split`）[002]

- **FR-030**（決定 2，16:05 改）：字幕樣式和橫式同一套（76 px、行高 71、字重 400、無描邊、黑底 70 %、底板高 118、內距上 24／下 23／左右 37、只排一行），直式只改位置：captions 子合成 root 帶 `data-format="portrait"`，`captions.css` 加 `[data-format="portrait"] .cg { bottom: 511px; }`（底板 y 1291–1409，置中在 `caption.zone` y 1280–1420）。
- **FR-031**：`captionWarnings`、`--check` 的字數 ⚠、`srt-align`（F8 起的斷句工具）與舊流程 `srt-split` 的預設 `--max`、剪輯台的字數提醒都讀 `caption.maxChars`（18／10）與 `caption.maxW`（1840／834）。直式時 srt-align／srt-split 第一行印 `版式：直式 → 每則最多 10 字（來源：…）`；明寫 `--max` 時以參數為準。
- **FR-032**：build 結尾印出可以直接複製的 `hyperframes check --caption-zone "…"` 指令（值由 `caption.zone` 換算成比例：直式 `x0=0;y0=0.667;x1=1;y1=0.74;severity=error`）。USAGE 2 第 8 步改成「照 build 印的那一行」。

#### C.3 上下分割（`lib/plan.mjs` 的 `pipGeometry`、`pipMotion`）[002]

- **FR-040**：`pipGeometry(pipCrop, speakerBox, canvas)`：裁切框寬高比用 `pip.aspect`；`"auto"` 時直式以「頭頂落在面板頂端下方 40 px、裁切寬 = clamp(講者框寬 × 1.3, 540, 1080)」算（建議初值）；手寫 `[x, y, w, h]` 是畫布座標。
- **FR-041**：⚠「講者面板的臉超出 y 940–1280」：用 speakerBox 上緣＋框高 30 % 當臉的估計，算出放進面板後的位置，超出就給 `pipCrop` 建議值（US3-3）。
- **FR-042**：`layoutZh` 直式 `pip` → 「上下分割」；`LAYOUT_ZH` 依版式。分鏡表「版面」欄直式只用 疊加／上下分割／全幕。
- **FR-043**：只有聲音的區間、`"pip": false`：沒有講者面板，media 段改用 `containFull`／`coverFull`（C.6）。

#### C.4 18 個情境（`shared/template/scenes/**`、`lib/assemble.mjs`、`lib/scenes.mjs`）[002]

- **FR-050**：`scene.json` 加 `"portrait": "move" | "stage" | "none"`（必填，`--list` 多一欄「直式」）與選填 `"portraitFootprint"`；`template.html` 可以多一節 `<!-- @style-portrait -->`，直式時接在 `@style` 後面（同一個 id 前綴與範圍，CSS 後寫的贏）。`assemble.mjs` 的 `sceneParts` 支援這一節；橫式完全不讀它。
- **FR-051**：18 個情境的直式做法：

| 情境 | 橫式版面 | 直式 | 做法 | 優先 |
|---|---|---|---|---|
| 01 chapter | 全幕 | stage | `stage.ch` 縮 0.625 置中，backdrop `bg-ch` | P2 |
| 02 chapter-tag | 疊加 | move | `#cBadge { left: 60px; right: auto; top: 250px; }` | P1 |
| 03 side-panel | 半畫面 | none | ✖ → 13 或 04a；P3 才考慮直式面板 | — |
| 04a fs-list、04b fs-compare、04c fs-flow、04d fs-table | 子母畫面 | stage | `stage.fs`（主卡 x 120–1300 已在窗內）；04d 表格字 40 → 34 要 audit 看 | P1 |
| 05 two-sides | 疊加 | none | ✖ → 12 或 13 | — |
| 06、07、08、09、10、13、14 | 疊加（下方字卡） | move | `#gCard`／`#qaCard`／`#tipCard`／`#spkCard` 的 `left: 60px; bottom: 680px;` | P1 |
| 11 summary、15 quote | 疊加（置中） | move | `#gCard { left: 60px; right: 140px; margin: 0 auto; bottom: 680px; }` | P1 |
| 12 keywords | 疊加（左直欄） | move（換排法） | `#kwList` 改成卡片帶內橫排換行（`flex-direction: row; flex-wrap: wrap; left: 60px; width: 880px; bottom: 680px; top: auto; height: auto`），每顆膠囊高度不變；做不出來就退成 none（✖ → 13） | P1 |

- **FR-052**：`FOOTPRINT`、`BADGE.zones` 依版式取（直式值＝上表的 rect）；碰撞 ⚠ 的 15 % 門檻不變。直式多一條 ⚠：任何 footprint 壓到 `unsafe[]`。
- **FR-053**：直式的 slots 上限：下方字卡寬 880（橫式 900），先沿用橫式上限；003 跑 `audit --all` 直式量到撐破的情境，再在 `scene.json` 加 `portraitMax`（`--list` 顯示）。

#### C.5 40 張字卡動態（`shared/template/fx/**`）[003]

- **FR-060**：`catalog.json` 每張加 `"portrait": "ok" | "band"`。`band`＝滿版流動字，縮到 0.5625 後只佔畫面中間一條（初判 09–15、17、22、31，以 fx 圖庫直式截圖為準）；直式 `--check` 對 `band` 的 fx ⚠「直式只佔中間一條 → 建議換 <同類 ok 的編號>」。
- **FR-061**：fx 檔不改；`fx/index.html` 圖庫加「直式」切換（用 FR-011 的 transform 預覽 1080×1920），003 用它截 40 張的直式總表確認分類。
- **FR-062**：P3：`band` 的卡改成讀根元素寬高（fx-kit 提供 `W`／`H`），直式原生鋪滿。

#### C.6 17 支情境動畫（`shared/template/custom/**`、`tools/audit.mjs`、`lib/audit-*.mjs`、`lib/custom-preview.mjs`）[003]

- **FR-070**：17 支範例檔**不改**；直式用 `stage.fs` 舞台縮放（research §6 的比較與工作量）。檔頭【版面】不用改，R7 加一句「直式時內容一樣留在 x 120–1300、y 130–880」。
- **FR-071**：`audit.mjs` 在直式專案多兩條規則（只在 `format: "portrait"` 時跑）：① ✖ `portrait-window`：fullscreen custom 的帶 id 絕對定位元素超出舞台窗 `[120,130,1300,880]`（`data-layout-allow-overflow` 的除外）→「直式時會被切到或壓到講者面板」；② ⚠ 字太小：字級 × 0.8475 < 32 px。橫式的規則照舊（舞台座標還是 1920×1080，量法不變）。
- **FR-072**：overlay custom（`layout: "overlay"`）直式不縮放：子合成 root 寫 `data-width="1080" data-height="1920"`，audit 用 1080×1920 視窗量，規則換成直式的字幕保留帶、`unsafe[]`、speakerBox。
- **FR-073**：`custom-preview.mjs` 加直式預覽（底下放直式講者底片截圖與講者面板示意）。
- **FR-074**：P3：直式全畫面（`"pip": false`）常用的 2–3 支出直式變體（例：`x-timeline` 直軸、`x-process` 縱向），每支 1–1.5 小時；試跑後再決定要不要做。

#### C.7 插入素材（`tools/lib/media.mjs`、`kit/media.css`、`kit/media.js`）[004]

- **FR-080**：`lib/media.mjs` 的 `VIEW`、`PIP_ZONE`、可見區、`offScreen`、`placeArrow` 的避讓區都改讀 canvas（直式值見 FR-010 `media.view`、`pip.zone`、`caption.zone`、`unsafe[]`）；`.mstage`／`.mmarks`／`.mann`／`.mlreg` 的寬高改成 CSS 變數 `--cw`／`--ch`，svg `viewBox` 用 canvas。
- **FR-081**：標註座標仍寫「素材像素」（`frame --grid` 讀的），build 換算；直式擺不下時 ✖ 附建議值（沿用「給了 side／from 但放不下」的定案）。STEP 膠囊在可見區左上、y ≥ 260。
- **FR-082**：qc storyboard 對直式 16:9 錄影 ⚠「縮放 < 0.6、沒有 moves、> 3 秒」（US4-2）。

#### C.8 qc（`tools/qc.mjs`）[004]

- **FR-090**：`final`：`LIMITS.width/height` 讀 canvas；「講者小窗」檢查直式改名「講者面板」，判準相同；`qc-sheet.jpg` 直式每格 9:16，並畫出 `unsafe[]` 的半透明框給人看。
- **FR-091**：`framing`：直式候選是 9:16。直式素材：1.0＝原畫面，1.15／1.3 放大，垂直位置讓頭頂落在 `framing.headTop` 範圍、下巴 ≤ `chinMax`（用 006 的 `face-landmarks.json`，沒有就用動作範圍上緣估）；橫式素材（P2）：1.0＝以講者框中心取的整高直條。放大倍數門檻 3.5 不變。`--cards` 直式三欄：疊加（卡片帶＋字幕）｜上下分割｜全幕。
- **FR-092**：`speaker`：疊影圖與格線用畫布尺寸（直式 1080×1920，格線每 100／500 px），數字直接是 speakerBox 座標。
- **FR-093**：`storyboard`、`observe`：截圖與總表依畫布比例排版（直式每列放更多格）；觀影總表的版面名稱用 FR-042。

#### C.9 講者調光瘦臉與底片編碼（`tools/lib/ff.mjs`、`tools/look.mjs`）[006]

- **FR-100**：`ff.mjs` 的底片編碼：`scale=1920:1080` 改成 canvas 的 `W:H`；`frame` 的寬高比照 `framing.aspect` 驗證。直式素材在直式專案沒有 `frame` 時直接縮放到 1080×1920（等比，不補邊）。
- **FR-101**：`look.mjs` 的偵測、瘦臉、調光不受版式影響（作用在 rough.mp4 的像素）；`look-preview.jpg` 依來源比例排版。
- **FR-102**：P3：`look.mjs track` 用 `face-landmarks.json` 產生臉部跟隨的裁切路徑（1.5 秒移動平均、5 % 死區，research §5 B），build 用分段線性的 crop 表達式套用。

#### C.10 build、測試片段、Studio [002]

- **FR-110**：`build.mjs`：`frame` 換算、speakerBox 原尺寸提示（現在寫死 1920）、`--test` 的 root 都讀 canvas；`--test` 的 render 指令不變。
- **FR-111**：Studio（`hyperframes preview`）不需要改程式；FR-020 spike 驗證它顯示直式與選取子合成正常。

#### C.11 剪輯台（`tools/editor.mjs`、`tools/editor/**`）[006]

- **FR-120**：預覽框 `aspect-ratio` 由 plan.json 的版式決定（`editor.css` 的 16:9 改成 CSS 變數）；講者框疊圖以 canvas 換算（`app.js:992`）；縮圖條 `tile` 尺寸依比例；字幕字數提醒用 `caption.maxChars`；存檔保留 `format`（剪輯台不改它）。

#### C.12 換風格（`tools/brand.mjs`）[004]

- **FR-130**：`brand.mjs "#RRGGBB"` 同時重畫 `kit/pip-frame.png` 與新的 `kit/pip-frame-v.png`（1080×1920 透明、y 897–903 一條主色線）；AGENTS.md 規則 1 的例外清單加 `kit/pip-frame-v.png`（001）。
- **FR-131**：背景圖 P1 沿用 `bg-fs.jpg`／`bg-ch.jpg`（`background-size: cover`，直式時取中間）；P3 才加 `bg-fs-v.jpg`（1080×1920）與直式留空區預覽，停點 ⑥ 格式不變。

#### C.13 音效 [005]

- **FR-140**：沒有要改的；005 確認 `audio.mjs` 沒有用到畫面尺寸即可（回報一行）。

### D. 文件與 Skill [001]

- **FR-150**：AGENTS.md 加一節「版式（橫式／直式）」，放在「專案」之後、「資料夾」之前（草稿見 §D.1）；「開工」表加「版式」列；「剪乾淨的數字」字幕列改「每則最多 18 字（直式 10 字）」；「剪好看」第 3 步版面名稱加直式三種；「剪好看的數字」構圖倍率列加直式的頭頂／下巴；規則 1 例外清單加 `kit/pip-frame-v.png`。
- **FR-151**：`shared/style.md` 加「直式」一節：字幕、文字安全區、卡片帶、角標、版面（數字只寫在這裡與 `canvas.mjs`，docs.test 對照兩邊）。
- **FR-152**：SITUATIONS.md §2 四種版面表加「直式」欄（§D.2），§3 的 03、05、12 列在「不要用在」補直式說明。
- **FR-153**：USAGE.md：2.2 第 0 步加直式構圖；2.4 字數「18 字（直式 10 字）」；2 第 8 步 `--caption-zone` 改「照 build 印的指令」；2.8 格式「1920×1080（直式 1080×1920）」；3.2 第一層欄位表加 `format`。USAGE-reference：R4 加「R4.7 直式分區」（research §1.1、§2 的表與圖）；R5.1 字幕直式值；R7.2 表加「直式：fullscreen 自動縮放、內容留在 x 120–1300、y 130–880；overlay 用 1080×1920 座標」；R9.2 背景圖直式沿用。EDITOR.md 加一句「直式專案預覽框是 9:16」。
- **FR-154**：Skill 各加一兩句（§D.3）；`auto-edit-longform` 的 description 加觸發語「剪成短影片」「做直式」。
- **FR-155**：`dev/tests/docs.test.mjs` 對照：AGENTS.md 直式數字表、style.md「直式」節、`canvas.mjs` 三處的字幕字數、字幕框、安全區、卡片帶數字一致。

#### D.1 AGENTS.md 草稿（001 照這段改寫進去）

```markdown
## 版式（橫式／直式）

開工時決定一次，寫進開工決策表「版式」；寫 plan.json 時第一層加 `"format": "portrait"`（橫式不寫）。之後的流程、停點、指令都一樣，差異由工具處理。

| 判斷順序 | 版式 |
|---|---|
| 1. 我說「短影片」「直式」「Shorts」「Reels」「抖音」 | 直式 |
| 2. 我說「長片」「橫式」 | 橫式 |
| 3. 都沒說：ffprobe 主軌，寬 < 高 | 直式；否則橫式 |

- 工具第一行會印「版式：直式 1080×1920（來源：…）」；和開工決策表不一樣時 `--check` 會 ✖，照 → 改 plan.json。
- 直式素材做橫式：不支援，告訴我。橫式素材做直式：停點 ② 選 9:16 構圖（`frame` 一定要寫）。

| 直式的數字 | 值 |
|---|---|
| 畫布 | 1080×1920、30fps |
| 版面 | 疊加、上下分割（取代子母畫面：上半資訊、下半講者）、全幕；03 半版側邊欄、05 兩側不能用 |
| 字幕 | 每則最多 10 字（`srt-align` 自動照版式）；樣式和橫式同一套（76 px、字重 400、底板 118），底板 y 1291–1409（字幕帶 y 1280–1420） |
| 文字安全區 | y 240–1440；y 840 以下右緣 940（右側按鈕列） |
| 下方字卡 | 卡片帶 y 880–1240，不擋臉 |
| 章節角標 | 左上 y 250 |
| 構圖 | 頭頂 y 380–520、下巴 ≤ 860 |
| 錄影段 | 16:9 錄影只有 1080 寬，一定要用 `moves` 推近到操作區 |
```

開工表加的列：`| 版式 | 我的話；沒說就看主軌寬高比（見「版式」） | 畫布、版面、字幕字數；plan.json "format" |`。

#### D.2 SITUATIONS.md §2 直式欄（加在「什麼時候用」之後）

| 版面 | 直式 |
|---|---|
| 疊加 | 疊加：講者滿版，卡片在卡片帶（y 880–1240），12 關鍵詞改橫排；05 不能用 → 12 或 13 |
| 半畫面 | 不提供 → 13 標題條列，或 04a（上下分割） |
| 子母畫面 | 上下分割：上半是同一張卡縮小（04 家族、custom、media），下半是講者 |
| 全幕 | 全幕：01、fx 置中，四周補底色 |

#### D.3 Skill 要加的話

| Skill | 加什麼 |
|---|---|
| `auto-edit-longform` | 開工決策表多「版式」：照 AGENTS.md「版式」的判斷順序填；寫 plan.json 時提醒 `"format": "portrait"`。description 加「剪成短影片」「做直式」 |
| `auto-edit-rough` | 第 6 步：`srt-split` 第一行印版式與字數上限，直式 10 字，不用自己加 `--max` |
| `auto-edit-storyboard` | 構圖預覽直式看頭頂／下巴有沒有落在範圍；草稿 plan.json 第一層先寫 `format`；直式「版面」欄只用疊加／上下分割／全幕，不挑 03、05 |
| `auto-edit-screen` | 直式：16:9 錄影一定加 `moves` 推近；手機直式錄影用 `"pip": false` ＋ `fit: "cover"` 鋪滿 |
| `auto-edit-motion` | 直式不用改 custom 的尺寸，build 會縮放；內容一樣留在 x 120–1300、y 130–880；audit 的 `portrait-window` ✖ 要修 |
| `auto-edit-review` | snapshot 多看三件事：文字沒進頂部 240／底部 1440 以下／右側按鈕列；上下分割的臉沒被字幕壓到；講者面板一直都在 |
| `auto-edit-deliver` | `qc.mjs final` 的格式直式是 1080×1920；看 `qc-sheet.jpg` 上的安全區框 |
| `auto-edit-style` | 直式背景先沿用三張橫式圖（取中間）；換主色會一起重畫 `pip-frame-v.png` |
| `auto-edit-setup` | 不用改 |

### E. 工作切分

依 `specs/README.md` 的檔案所有權；009 本身不擁有程式檔，只交規格與 `contracts/canvas.md` 草稿。

| 工作線 | 任務（ID） | 檔案 | 驗收 | 規模 |
|---|---|---|---|---|
| 002 | T002-V01 spike（FR-020） | scratch 專案 | 四項全過或採用退路，寫進 plan.md | 1–2 h |
| 002 | T002-V02 `canvas.mjs`＋`resolveFormat`＋`contracts/canvas.md`（FR-002–FR-011） | `lib/canvas.mjs`（新）、`lib/plan.mjs`、`contracts/{canvas,plan-fields,check-json,cli-002}.md` | `canvas.test.mjs`：橫式值等於現行常數；`resolveFormat` 四種來源 | 2 h |
| 002 | T002-V03 主合成、上下分割、角標（FR-021–FR-026、FR-040–FR-043） | `lib/main.mjs`、`lib/plan.mjs` | 橫式逐位元組相同；直式 fixture 的 index.html 尺寸、transform、講者面板、角標位置 | 3 h |
| 002 | T002-V04 字幕（FR-030–FR-032） | `kit/captions.css`、`lib/captions.mjs`、`tools/media.mjs` | srt-split 直式預設 12；captions 子合成帶 `data-format` | 1 h |
| 002 | T002-V05 情境（FR-050–FR-053） | `lib/assemble.mjs`、`lib/scenes.mjs`、`scenes/*/scene.json`（18）、`scenes/{02,06–15}/template.html`（12 個加 `@style-portrait`） | `--list` 有直式欄；03／05 ✖；12 橫排 snapshot | 2 h |
| 002 | T002-V06 build／status／一致性檢查（FR-004–FR-007、FR-110） | `build.mjs`、`status.mjs` | check-json 新鍵；US1-3、US2-3 的 ✖ | 1.5 h |
| 003 | T003-V01 audit 直式規則（FR-071、FR-072） | `audit.mjs`、`lib/audit-rules.mjs`、`lib/audit-browser.mjs`、`lib/audit-page.mjs` | 17 支 custom 直式 0 ✖；故意超窗的 fixture ✖ | 2 h |
| 003 | T003-V02 fx 分類與圖庫（FR-060、FR-061） | `fx/catalog.json`、`fx/index.html` | 40 張直式總表；`band` 名單 | 1.5 h |
| 003 | T003-V03 custom 預覽（FR-073） | `lib/custom-preview.mjs` | 17 支直式預覽頁可開 | 1 h |
| 004 | T004-V01 media 座標系（FR-080–FR-082） | `lib/media.mjs`、`kit/media.css`、`kit/media.js` | 16:9／9:16 錄影 fixture 位置；標註避開直式禁區 | 3 h |
| 004 | T004-V02 qc（FR-090–FR-093） | `tools/qc.mjs` | framing 直式三個候選；final 1080×1920；qc-sheet 安全區框 | 3 h |
| 004 | T004-V03 brand（FR-130） | `tools/brand.mjs` | 換主色後兩張 pip-frame 都更新 | 0.5 h |
| 005 | T005-V01 確認（FR-140） | — | 回報一行 | 0.1 h |
| 006 | T006-V01 底片編碼（FR-100、FR-101） | `lib/ff.mjs` | 直式 rough 編成 1080×1920；`frame` 寬高比檢查 | 1 h |
| 006 | T006-V02 剪輯台（FR-120） | `editor.css`、`editor/app.js`、`editor/preview.js`、`editor.mjs` | editor.test 直式 fixture | 2 h |
| 001 | T001-V01 文件與 Skill（FR-001、FR-008、FR-150–FR-155） | AGENTS.md、style.md、USAGE.md、USAGE-reference.md、SITUATIONS.md、EDITOR.md、8 支 Skill、progress-template、docs.test | docs.test 三處數字一致；Skill 只引用文件裡有的數字 | 3–4 h |
| 007 | T007-V01 檢查迴圈 | `dev/check-all.mjs` | 加跑 `projects/範例-直式` 的 `--check`→build→audit | 0.5 h |

- **規模**：程式約 30 個檔（含 18 個 scene.json 只加一個鍵、12 個模板各加一節）＋文件約 14 個檔；新增測試約 80 則（002 約 35、004 約 20、003 約 10、006 約 8、001 約 6、canvas 單元測試含在 002）。代理時間合計約 30–35 小時；平行後實際 1.5–2 天。
- **平行**：Phase 0（T002-V01、T002-V02）做完才開始其他；之後 002 的 V03–V06、003、004、006、001 全部平行（都只依賴 `canvas.mjs` 與契約）。001 先照契約寫，Phase 2 再對數字。
- **整合順序**：① 002 V01→V02（契約定稿）② 平行實作 ③ 主代理：`projects/範例` 橫式回歸（逐位元組）④ 主代理：`projects/範例-直式` 跑 `--check`→build→audit→snapshot→render 測試片段 ⑤ Sonnet 試跑（§F）⑥ 回饋輪修正 ⑦ P2（橫轉直、01、media 精修）⑧ P3（臉部跟隨、fx 原生直式、custom 變體、直式背景圖）。

### F. 直式範例驗證計畫（`projects/範例-直式`，Sonnet 試跑）

提示詞：「用 auto-edit-longform 剪 @projects/範例-直式」，照常在停點停下，主代理代替使用者回覆。

| # | 看什麼 | 過關條件 |
|---|---|---|
| V-1 | 開工決策表 | 「版式」＝直式，理由寫寬高比；長度 170.8 s 判定不用 01 |
| V-2 | 剪乾淨 | `verify-rough` 沒有全黑（VFR 來源，r1 F2）；`srt-align` 自動 10 字；拆句數約為橫式的 1.4–1.6 倍並回報 |
| V-3 | 調光瘦臉 | 臉寬 < 60 px 的 ⚠ 照預期出現、只調光（006 既定行為） |
| V-4 | 停點 ② | 兩張直式預覽；三個倍率都有「放大 5.35 倍」⚠，建議 1.0；最後一行和橫式格式相同 |
| V-5 | 停點 ③ 分鏡表 | 「版面」欄只出現 疊加／上下分割／全幕；沒有 03、05；情境判定表照常；plan.json 有 `"format": "portrait"` |
| V-6 | build／audit | `--check` 0 ✖；audit 直式規則 0 ✖；build 印的 `--caption-zone` 是直式值 |
| V-7 | snapshot／Studio | 文字不進 `unsafe[]`；上下分割段講者面板一直在、臉不被字幕壓到；章節角標在左上、上下分割時隱藏；fullscreen 卡片字可讀 |
| V-8 | 交付 | 測試片段與 final 都是 1080×1920、30 fps、有音軌；`qc.mjs final` 0 ✖；`qc-sheet.jpg` 的安全區框看得到 |
| V-9 | 手機實機 | 作者把 final.mp4 用 YouTube Shorts 與 IG Reels「不公開／限動」各上傳一次，截圖確認字幕、卡片沒被介面蓋到（安全區數字的最後校正） |
| V-10 | 預算 | 每階段工具呼叫次數不超過 AGENTS.md「階段預算」的 1.2 倍 |

試跑後寫 `dev/loop/round-N.md`；直式的數字（分割線 900、字幕 1291–1409、卡片帶、角標）依 V-7、V-9 調整後把「建議初值」拿掉。

### G. 風險與取捨

| # | 風險 | 影響 | 緩解 |
|---|---|---|---|
| R-1 | HyperFrames 對「直式 root 裡縮放 1920×1080 子合成」的 lint、snapshot、render、Studio 選取行為未知 | 整個舞台縮放方案的前提 | Phase 0 spike（FR-020）；兩層退路 |
| R-2 | 固定字幕帶（底板 y 1291–1409）在上下分割或近景講者時壓到下巴；10 字上限讓字幕變碎（拆句約 1.5 倍、綁句 `#N` 變多、剪輯台改字幕更常重對句號） | 字幕擋臉；分鏡表與 `P.at` 要綁更多句 | 構圖預覽（停點 ②）量頭頂／下巴；FR-041 的 ⚠ 與 `pipCrop` 建議；V-7 實測後再定字幕位置 |
| R-3 | `範例-直式` 是 202×360：放大 5.35 倍、臉寬約 47 px（瘦臉略過）、VFR | 只能驗流程與版面，不能驗畫質與瘦臉；auto-editor 全黑可能重現 | 驗證計畫只看版面；請作者提供 1080×1920 以上的直拍素材做第二輪 |
| R-4 | 安全區數字各來源差很多，沒有官方規格 | 卡片或字幕被平台介面蓋到 | 取保守值、標建議初值；V-9 手機實機上傳校正 |
| R-5 | 舞台縮放讓 custom 最小字只剩 25 px | 手機上約 9 pt，偏小 | audit 直式 ⚠ 字太小（< 32 px）；必要時 P3 變體 |
| R-6 | 橫式素材轉直式時，講者面板只能從 9:16 直條裁，臉太大放不進 940–1280 | US3 字幕壓臉 | P2 的寬視野講者面板（research §5 C）；先 ⚠ |
| R-7 | 文件出現兩套數字，弱模型混用 | 用錯字數、座標 | 數字只寫在 style.md「直式」節與 `canvas.mjs`；工具自己印版式、字數上限、`--caption-zone` 指令，AI 照印的做 |
| R-8 | 12 關鍵詞改橫排只靠 CSS 可能排不好 | 12 在直式不能用 | 退成 `portrait: "none"`（✖ → 13） |
| R-9 | 版式有兩個來源（製作進度.md、plan.json） | 不一致時行為不明 | FR-004 一致性 ✖；工具第一行印來源 |
| R-10 | 「橫式逐位元組不變」要求讓 002 的重構範圍受限 | 實作要雙路徑 | 直式只走新分支；`canvas.landscape` 有測試對齊現行常數 |

取捨紀錄：
- 子母畫面 → 上下分割，不做角落小窗（research §3）。
- custom 用舞台縮放，不改寫成 CSS 變數（research §6，省 13–17 小時；版面結果相同）。
- 分割線 900（主代理原案 ~1000）：下半面板多 100 px，臉才落在字幕框上方。
- 03、05 直式不提供（版面在直式沒有對應），12 換排法。
- 角標放左上（右上有平台按鈕）。

### Key Entities

- **版式（format）**：`landscape`／`portrait`；來源 `flag`／`plan`／`progress`／`media`。
- **畫布設定（canvas）**：一個版式的全部幾何數字（FR-010 表）。
- **舞台（stage）**：1920×1080 子合成在直式畫面上的縮放與位移（窗、目標點、倍率）。
- **講者面板**：直式的「子母畫面」，畫布下半 1080×1020。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：`projects/範例`（橫式）改版前後 build 產生檔逐位元組相同；`dev/tests` 全過。
- **SC-002**：`projects/範例-直式` 由 Sonnet 從「剪這支影片」跑到 final.mp4，六個停點的最後一行格式和橫式相同，主代理介入只限回覆停點。
- **SC-003**：直式 final.mp4 是 1080×1920、30 fps、有音軌，`qc.mjs final` 0 ✖。
- **SC-004**：直式成片裡沒有卡片文字、角標、字幕落在 `unsafe[]`（snapshot 與 qc-sheet 人工確認，0 處）。
- **SC-005**：17 支 custom 範例在直式 audit 0 ✖，而且檔案沒有改動（`git diff --stat shared/template/custom/` 為空）。
- **SC-006**：直式所有字幕 ≤ 10 字、字幕底板在 x 123–957（`caption.box`）。
- **SC-007**：每個非全幕的時間點都看得到講者（滿版或講者面板），觀影總表 0 處講者消失（只有聲音的區間除外）。

## Assumptions

- 直式成片固定 1080×1920、30 fps；不做 4:5、1:1。
- YouTube Shorts 上限 3 分鐘；短片多半 < 180 s，所以 01 章節轉場列 P2。
- 平台介面的實際位置以 V-9 實機為準；本檔數字是保守的建議初值。
- 直式素材做橫式不在範圍（使用者沒有要求）。
- 音效、剪輯台的音量與剪接、講者調光瘦臉的演算法都和版式無關。

## 決定（2026-10-31 15:20，使用者授權主代理決定：「用你的專業做出最好的決策」）

| # | 題目 | 決定 | 理由 |
|---|---|---|---|
| 1 | 分割線 | **y 900**（上 1080×900、下 1080×1020） | 下半多 100 px 讓臉（940–1280）完整落在字幕框（決定 2 後 1291 起）上方；資訊窗 1000×636 與主卡框同比例，17 支 custom 與 04 家族不用改檔 |
| 2 | 字幕 | **76 px（＝橫式，也是 1080 寬的 7%）、每則最多 10 字、字重 400、底板 118、位置在字幕帶 y 1280–1420**（16:05 改：原定 60 px／字重 700／描邊，改成和橫式同一套，只差每則字數與位置；20:30 改：12 字 → 10 字） | 使用者 15:55 要求字幕照他的剪映設計（F8：76 px／400／底板 118／距底 6），直式沿用同一套才不會兩種字幕；10 字 × 76 ＋ 內距 74 ＝ 834，置中 x 123–957，只碰右側平台按鈕區（x 940 起）邊緣 17 px；12 字會到 x 47–1033、壓進按鈕區 93 px。拆句變碎的代價由 `#N@詞` 綁詞吸收 |
| 3 | 章節角標 | **左上 y 250** | 右上是平台按鈕列；左上在安全區內且不與字卡帶（880–1240）衝突 |
| 4 | 03 側邊欄、05 兩側 | **直式不提供**，`--check` ✖ 並建議替代（03→04a 上下分割、05→13 條列或 x-versus） | 1080 寬放不下側欄與雙側卡；硬塞只會做出不專業的版面 |
| 5 | 橫式素材轉直式 | **P2**；第一階段只收直拍素材（寬高比 < 1），橫式素材在直式專案 `--check` ✖「請提供直拍素材或等 P2」 | 自動裁切要臉部跟隨（006 的 face-landmarks 可用），獨立一條線做才穩 |
| 6 | 第二輪測試素材 | **先用 `範例-直式`（202×360）驗流程**；畫質驗證等使用者提供 1080×1920 以上的直拍口播，放進 `projects/範例-直式/素材/真人錄影/` 後重跑 | 主代理無法自己產生真實素材；流程與畫質分兩輪驗，不互相卡 |

**順序決定**：先做 010 動態 v2（階段 A 原型 → 使用者點頭 → 階段 B 全面重做），**再**做 009 直式。理由：009 的上半面板是把子合成整體縮 0.8475 放進去，動態 v2 改的是子合成內部的動態語彙與主合成的轉場（子母畫面進出、章節轉場），兩者同時改 `lib/main.mjs`、`lib/assemble.mjs`、`kit/scene-motion.js` 會互相蓋；而且先做直式只是把不專業的動畫縮小放上半。009 唯一可先做的是 T002-V01 spike（HyperFrames 子合成縮放四項驗證）與 T002-V02 `canvas.mjs` 純幾何模組＋單元測試（不接線），在 010 階段 B 派工時一併交給 002，接線等 010 收斂後再做。

**v2 動態要給 009 的介面**：design-system.md 的區域（zones）與轉場語彙必須用 `canvas.mjs` 的具名區域（`band`、`panelTop`、`panelBottom`、`badge`、`captions`）表達，不寫死 1920×1080 座標；這是 010 階段 B 對 002／003 的硬要求（寫進 010 的派工）。

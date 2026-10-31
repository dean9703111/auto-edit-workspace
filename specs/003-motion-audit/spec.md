# Feature Specification: 003 motion-audit（SceneMotion 綁句與新語彙、5 支新情境動畫、audit 版面與節奏規則）

**Feature Branch**: `003-motion-audit`（不另開分支，跟 `specs/README.md` 同一輪）
**Created**: 2026-10-31
**Status**: Draft（第一輪：只寫規格。`window.__cues`、`P.at`／`P.dur`／`P.end()`、`window.__cueErrors`、`data-cues-sample` 的語意以 002 的 `specs/contracts/cues.md` v1（2026-10-31）為準，本規格照它寫；本線補充的地方列在「和 002 契約的對齊」表，請 002 收進 cues.md）
**Input**: 主代理派工「工作線 003 motion-audit」。來源：分析報告 02 §1 #5、#10、#12、#13、#15、#16，§4 G02（SM 端）、G08、G11、G12；`specs/README.md`「已定案的規則」；`.specify/memory/constitution.md`。

## 縮寫與出處寫法

| 代號 | 指的是 |
|---|---|
| SM | `shared/template/kit/scene-motion.js` |
| R／U | `shared/template/USAGE-reference.md`／`USAGE.md`（`R:607`＝第 607 行） |
| AR／AP／AB／AU | `tools/lib/audit-rules.mjs`／`lib/audit-page.mjs`／`lib/audit-browser.mjs`／`tools/audit.mjs` |
| 定案 | `specs/README.md`「已定案的規則」表 |
| 02 §1 #N、G0N | 分析報告 `analysis/02-skill-gap.md` 的情境表第 N 列、落差清單 |
| ES／TR／OV／JY | 作者另一個 repo（agent-skills）的來源，路徑寫法照 02 §縮寫：`ES/segNN`（esim_ep2 段落）、`TR/v3`（PPA 試看 v3 工人說明）、`OV/SKILL.md`、`OV/AW`（audit-workflow.md）、`OV/DR`（design-rules.md）、`OV/MR`（motion-recipes.md）、`OV/PS`（scripts/padding-scan.mjs）、`JY/SKILL.md` |
| 本線初值 | 本規格新定的數字，沒有外部出處；理由寫在同一行，作者看預覽後可以改 |

所有座標是 1920×1080 畫面的 px；時間是秒（s）；「段內秒數」＝從這段 custom 起點算起的秒數（和 SM 時間軸一致）。

## 範圍

1. **SM 加語彙**（全部 seek-safe）：`P.at(ref, off)`、`P.dur()`、`P.end()` 不帶參數、`P.focus`（ES seg58 activate）、`P.type`（打字）。
2. **4 支範例改寫**：x-process、x-metaphor、x-before-after、x-numbers 改用 `P.at` 綁句、`P.end()`；檔頭「時間軸」改綁句寫法；刪掉手算相減與「一集已經有 2 段 custom 就改回第一層」；版面照新規則修到 0 ✖、新規則 0 ⚠。
3. **5 支新範例**：`x-warnings`、`x-prompt`、`x-ui-mock`、`x-architecture`、`x-branch`。
4. **audit 版面規則（G08）**：未定位頂層、標題到內容間距、區塊重疊、nowrap 餘裕、右側空白、垂直平衡、內距與行高。
5. **audit 節奏 ⚠（G12）**：同一秒新元素 > 2、間隔 < 0.12 s、完成態 < 1.2 s、最後一幕 < 1.5 s。
6. **預覽頁**：`shared/template/index.html` 登記 9 支情境動畫；R7.1、R7.5 表格的新列交 001。
7. **測試**：`motion.test`、`audit.test`、`examples.test`。

不在範圍：
- build 端的 cue 注入、`P.at` 字面值預先計算、`--check` 的綁句 ✖（002 FR-017–FR-021）。
- `P.morph` 預設 `back.out(1.15)`（SM:239）和 TR/v3「不用 back.out」的衝突：本線不改，列進「待主代理裁決」第 6 條。
- 字形下伸部的 iT／iB 檢查（`OV/PS:L28`，要 canvas measureText）、跨段同角色元件一致性（`OV/PS:L8-9`）：先不做。
- 字卡動態（`fx/**`）與情境模板（`scenes/**`）：新規則只量 custom，理由見 FR-040。

## 名詞

| 名詞 | 定義 |
|---|---|
| 綁句點（mark） | 一次 `P.at(...)` 的回傳值（段內秒數）。SM 把它記在 `P.marks`，audit 用它切「拍」 |
| 拍（beat） | 相鄰兩個綁句點之間的時間窗 `[m_i, m_{i+1})`；最後一拍到「最後一幕」為止 |
| 動作（tween） | 時間軸上長度 > 0.002 s、目標是 DOM 元素的 tween（SM 描線開頭那個 0.001 s 的 opacity tween 不算，SM:175） |
| 新元素（unit） | 被「進場」tween 從看不見變成看得見的元素；祖先在它之前 ≤ 0.3 s 進場的，併進祖先算同一個（FR-051） |
| 靜止區間 | 沒有任何動作在跑的時間區間 |
| 完成態停留 | 一拍裡最長的靜止區間 |
| 最後一幕 | 最後一個動作結束到「淡出或收尾退場開始」之間的靜止時間 |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 情境動畫直接寫句號，不用手算（Priority: P1）

AI 從範例複製一支情境動畫，綁句只寫 `P.at('#18')`、`P.at('#18@逐字稿', 0.2)`，結尾寫 `P.end()`。不用拿 `--check` 報告的起點和 rough.srt 相減，也不用把段長填回 `data-duration` 與 `const D`。

**Why this priority**: 02 G02（P0）；現在 4 支範例檔頭都教人手算（`custom/x-process.html:18-25`、R:486、R:543），弱模型最常在這裡算錯。

**Independent Test**: `motion.test.mjs` 跑 cues.md §6 的 13 組測試向量（共同輸入：`window.__cues`＋root 掛在 `#el-x01` host 底下），回傳值與 `window.__cueErrors` 全部相符。

**Acceptance Scenarios**:

1. **Given** `window.__cues.segs.x01 = { comp: 'x-process', start: 40.0, D: 14.5, refs: { '#18': 43.2 } }`、root 在 `<div id="el-x01" data-composition-src="…">` 底下，**When** 檔內寫 `P.at('#18')`，**Then** 回傳 3.2；`P.at('#18', 0.2)` 回傳 3.4。
2. **Given** 同上，`refs` 沒有 `#18@沒算到`，**When** `P.at('#18@沒算到')`，**Then** 回傳 0，`window.__cueErrors` 多一則 `x01 P.at('#18@沒算到')：「@詞」沒有被 build 預先算到 → …`（cues.md §6 #9），audit 把它報成 ✖。
3. **Given** plan.json 把 x01 的 `to` 延長 3 s、重新 build，**When** 檔內是 `P.end()`，**Then** 時間軸長度＝新的 `D`，檔案一個位元組都沒改，audit 不再報「段長不符」。

---

### User Story 2 - audit 抓得到間距、重疊、內距與節奏（Priority: P1）

AI 跑 `audit.mjs`，除了現有的撐破、裁掉、出畫、字幕區、子母畫面，還會看到「標題壓到內容」「間距不足」「區塊重疊」「nowrap 餘裕不足」「右側空白過多」「垂直不平衡」「內距不足」「行高不足」「未定位頂層」，以及節奏的「同一秒新元素太多」「間隔太短」「完成態停太短」「最後一幕太短」，每一條都附 `→` 改法與數字。

**Why this priority**: 02 G08（P0）、G12；R8 表格自己寫「audit 抓不到：間距與內距、兩張卡互相重疊」（R:622）；作者 agent-skills 端已經有這些規則（`OV/AW:L77-89,L215-218`、`OV/PS:L1-31`）；定案「完成態 ≥ 1.2 s、最後一幕 ≥ 1.5 s」目前沒有工具檢查（02 §1 表後註）。

**Independent Test**: `audit.test.mjs` 每條新規則一組假量測資料（故意違規＋剛好過關），訊息原文照 `contracts/cli-003.md`；瀏覽器實量測試（沒有 Chrome 就 skip）量一支故意擠在一起的 fixture。

**Acceptance Scenarios**:

1. **Given** custom 裡有一個 `position: static` 的 `<div>` 直接放在 root 底下，**When** audit，**Then** ✖ `未定位頂層：…`，結束碼 1。
2. **Given** 標題列下緣 y=278、第一個節點上緣 y=290，**When** audit，**Then** ⚠ `間距不足：… 只有 12px（< 24px；目標 ≥ 40px） → 內容整組往下移 28px …`，結束碼 0。
3. **Given** 4 個站用 `stagger: 0.12` 在 0.36 s 內進場，**When** audit，**Then** ⚠ `同一秒新元素太多：… 出現 4 個（上限 2 個）…`。
4. **Given** `P.at('#18')`＝3.2、`P.at('#19')`＝4.6，第 1 拍的動作 3.2–4.0，**When** audit，**Then** ⚠ `完成態停太短：… 最長只靜止 0.60s（新資訊要停 ≥ 1.2s）…`。

---

### User Story 3 - 五種新情境有範例可以改（Priority: P1）

分鏡時遇到「一組 2–3 條警告」「提示詞／指令／網址」「沒有錄影的介面操作」「誰傳給誰、不經過雲端」「一個起點分成幾條路（或匯流）」，AI 在 R7.5 表找到對應範例，照檔頭「要改的地方」只改文字、圖示和綁句欄位，就能過 R7.6 三道關卡。

**Why this priority**: 02 G11（P1）；02 §1 #5、#10、#12、#13、#15、#16 標 ✗「沒有範例」；001 FR-082 的 SITUATIONS.md 要指到範例檔名。

**Independent Test**: `examples.test.mjs`：9 支範例的檔頭有 6 個固定小節、每個 `P.at` 字面值都在 `data-cues-sample` 裡、骨架檢查過；整合測試把 9 支登記成一個暫存專案的 custom 段，`build --check` 0 ✖、audit 0 ✖ 且新規則 0 ⚠（沒有 Chrome 或 ffmpeg 就 skip）。

**Acceptance Scenarios**:

1. **Given** 口播「有三件事要小心：API key 不要貼進講稿、不要直接覆寫素材、交付前一定要跑 qc」，**When** AI 從 `x-warnings.html` 改，把 `W1..W3` 綁到 #52–#54，**Then** 三列先依序出現，講到哪一條那一條亮框、其他降到 0.4，右側示意同位置換內容。
2. **Given** 提示詞 27 字、`TYPE = P.at('#62', 0.45)`，**When** seek 到 `TYPE + 1.0`，**Then** 畫面上打出前 8 或 9 個字（8.5 字／秒），卡片大小和打完時一樣、游標在最後一個字後面。

---

### User Story 4 - 範例預覽看得到（Priority: P2）

作者打開 `shared/template/index.html`，在「④ 情境動畫」分頁看到 9 支範例實際在動，跟模板一樣能點「全尺寸 ↗」，網址加 `?t=秒數` 停在那一刻。

**Why this priority**: 作者用 index.html 挑版型（`index.html:172-180` 分頁）；現在 custom 範例完全沒有預覽，只能讀程式碼想像。

**Independent Test**: `examples.test.mjs` 檢查 index.html 有 9 個 `preview/x-*.html` 的 iframe 與連結，名稱和 `custom/` 的檔案一一對應。

---

### User Story 5 - 預覽頁的規則和 style.md 一致（Priority: P3）

index.html「動態規則」分頁不再寫「進場 0.3–0.5」「露臉 3 秒」，改成和 style.md 一致的節奏數字；「音效」分頁的事件與配樂照 005 `contracts/sfx.md`。

**Why this priority**: 001 SC-002 的 grep 會掃到這兩行以外的同類字串；index.html 歸 003。

---

### Edge Cases

- **段裡完全沒有 `P.at`**（舊檔照手算寫）：照常能跑；節奏的「完成態停太短」不判（沒有拍可切），其他節奏與版面規則照判；報告 notes 多一行 `x01：沒有 P.at 綁句，完成態停留不檢查`。
- **兩個 custom 段用同一支檔**：002 在 `--check` 擋 ✖（cues.md §3.3）；執行期不另外偵測（`P` 用 host 的 id 找段，cues.md §4.1）。
- **`P.at` 的結果 < 0**（綁到段開始之前的句子）：回傳 0、不記錯（cues.md §4.2；`--check` 已經 ⚠ 段外）；> D 時照原值回傳（動作落在段外，HyperFrames 不會播；節奏規則只看 `[0, D)`）。
- **`P.at` 在預覽頁**（沒有 host、沒有 `window.__cues`）：讀 root 的 `data-cues-sample`（FR-005）；兩者都沒有 → 回傳 `max(0, off)`、推 cues.md §4.4 第 3 種原因。
- **`P.type` 的元素裡有 `<br>`、關鍵詞 `<span>`、底線 `<svg>`**：只動文字節點，元素原樣保留；空白字元跟著下一個字一起出現。
- **`P.type` 和 `P.rise` 同一個元素**：可以（opacity 和 scType 是不同屬性）；建議先 rise 外框、再 type 文字。
- **`P.focus` 之後 `P.out` 同一個元素**：`P.out` 從目前的亮度（例 0.4）淡到 0，不會先跳回 1（FR-012）。
- **`P.focus` 呼叫順序和時間不一致**（後面那行的 `at` 比較早）：建立時丟錯，audit 報 script ✖，訊息叫你照時間先後寫（FR-013）。
- **縮放中的畫面（`P.push`）**：版面規則量的是 `getBoundingClientRect`（含 transform），推進途中元素在動、不判；推進後的靜止畫面照判。x-ui-mock 的畫布刻意放大超出視窗，標 `data-layout-allow-overflow`。
- **刻意重疊**（彈出通知疊在介面上、標籤壓在卡角）：在其中一個元素加 `data-layout-allow-overlap`（x-before-after 已經這樣用，`custom/x-before-after.html:72`），檔頭寫理由。
- **置中的版面**（`text-align: center`、`justify-content: center`）：左右空白差 ≤ 8 px 視為置中，不報「右側空白過多」。
- **並排等寬的卡**：同一欄（left 與 width 都相同）自動視為一組，取組內最小的右側空白判；左右並排要等寬時加 `data-width-shared`（`OV/SKILL.md:140`）。
- **kit 元件**（`.sc-wcard__bar`、`.sc-pill`、`.sc-num`、`.sc-icon`）：內距由 kit 保證（R8 開頭「第一層模板已經全部遵守」，R:598），不量內距與行高；仍參加重疊、間距、垂直平衡。
- **圓形與 ≤ 2 個字的小徽章**：不量內距（`OV/PS:L29`）。
- **字級 ≥ 100 px 的大數字**（`.sc-t112` 行高 136、`.sc-t150` 行高 150，`kit/scene.css:230-231`）：不量行高（只用在數字，沒有下伸部）。
- **舊專案的 custom 檔被新規則多出 ⚠**：只是提醒，結束碼不變；✖ 只有「未定位頂層」「標題壓到內容」「綁句失敗」三條是新的，三條在舊檔都會真的造成錯位或時間錯（FR-041、FR-042、FR-057）。

---

## Requirements *(mandatory)*

### Functional Requirements

#### A. 綁句：`P.at`／`P.dur`／`P.end()`（範圍 1）

- **FR-001**（找段，cues.md §4.1）：`SceneMotion(tl, root)` 建 `P` 時：`host = root.closest('[data-composition-src], [data-composition-file]')`、`id = host.id` 去掉 `el-`，`seg = window.__cues.segs[id]`；沒有就讀 root 的 `data-cues-sample`（FR-005）；都沒有 `seg = null`。只找一次，存在這個 P。
  - 驗：`motion.test` cues.md §6 #1–#13（root shim 帶 `closest`）。
- **FR-002**（`P.at(ref, off = 0)`，cues.md §4.2）：
  1. `ref` 是數字 → `ref + off`（照舊可以寫秒數）；
  2. 字串而且 `seg.refs[ref]` 有值 → `r3(seg.refs[ref] − seg.start + off)`（build 預先算好的字面值，cues.md §3.2）；
  3. 字串符合 `^#(\d+)(e)?([+-]\d+(?:\.\d+)?)?$` 而且 `cues[N]` 有值 → 用 `cues[N]` 的起點（或 `e` 的結尾）＋秒數現算（`cues` 取 `window.__cues.cues`，預覽時取 sample 的 `cues`）；
  4. 其他 → `max(0, off)`，推一則 `window.__cueErrors`（FR-004）。
  - 結果 < 0 回 0。
  - **本線補充**（cues.md 沒寫，請 002 收進 §4.2）：`ref` 不是字串也不是數字、或 `off` 不是有限數字 → 丟錯（原文 cli-003 §3.1）。理由：NaN 當成時間軸位置不會報錯，動畫會悄悄跑到 0 秒。
  - 驗：`motion.test` cues.md §6 #1–#9、#12–#13，加本線 2 組（丟錯）。
- **FR-003**（記綁句點，本線補充）：每次 `P.at`（含退路）都把 `{ ref, t }` 推進 `P.marks`，並放到 `window.SceneMotion.marks[comp]`（`comp`＝root 的 `data-composition-id`；每次 `SceneMotion(tl, root)` 建立時換新陣列）。只有 audit 用（FR-053），不影響畫面。數字 ref 也記（`ref` 存數字）。
  - 驗：`motion.test`「P.marks 照呼叫順序、重建 SceneMotion 會清空」。
- **FR-004**（找不到時不丟錯，cues.md §4.4）：`window.__cueErrors` 是字串陣列，第一次推時建立；每則 `<段 id 或 comp id> P.at('<ref>')：<原因>`，原因只有 cues.md §4.4 的三種原文（字幕沒有第 N 句／「@詞」沒有被 build 預先算到／找不到 window.__cues 也沒有 data-cues-sample）。同一則字串只推一次（HyperFrames 重新執行 script 時不重複，本線補充）。理由（不丟錯）：丟錯會讓整條時間軸沒建好，畫面停在初始狀態，比時間偏掉更糟。
  - 驗：`motion.test` cues.md §6 #8、#9、#13 的字串逐字相同；`audit.test`「__cueErrors 有內容 → 每則一個 ✖ 綁句失敗」。
- **FR-005**（預覽退路 `data-cues-sample`，cues.md §5）：格式和 `segs[id]` 相同、多一個 `cues`：`{ "start", "D", "cues": { N: [起, 迄] }, "refs"?: { ref: 秒數 } }`。9 支範例都寫，一律 `"start": 0`（`cues` 的值直接就是段內秒數，人看得懂）；`#N@詞` 的 ref 放進 `refs`。只有找不到 `seg` 時才用。
  - 驗：`examples.test`「每支範例的 `P.at` 字面值都能從 sample 算出（`#N` 在 `cues`、`@詞` 在 `refs`）；sample 的 D 滿足檔頭寫的 D 下限」。
- **FR-006**（`P.dur()`，cues.md §4.3）：`seg.D`；`seg` 是 null 時讀 root 的 `data-duration`；再沒有回 0 並推 `__cueErrors`（這種情形的原因原文 cues.md 沒列，本線提議 `<comp> P.dur()：找不到 window.__cues、data-cues-sample，root 也沒有 data-duration → 用 build 產生的 index.html 看，或在 root 寫 data-duration`，請 002 收進 §4.4）。
  - 驗：`motion.test` cues.md §6 #10，加「root 只有 data-duration」「三者都沒有」2 組。
- **FR-007**（`P.end()`）：不帶參數＝`P.end(P.dur())`；帶數字照舊（`tl.set({}, {}, x)`）。
  - 驗：cues.md §6 #11；既有的 `P.end(D)` 測試不變。
- **FR-008**（API 註解與骨架）：SM 開頭的 API 註解（SM:1-70）加 `P.at`、`P.dur`、`P.end()`、`P.focus`、`P.type` 五列，刪「綁口播時傳 T.at(句號)」（SM:70）；R7.3 骨架的兩行 `forEach` 分別加 `'type'`（單一選擇器那行）與 `'focus'`（兩個選擇器那行）（原文在 docs.md §3）。
  - 驗：`motion.test` 既有的「新 API 與常數存在，開頭 API 註解有記錄」擴充到這五個名字。

#### B. 聚焦：`P.focus`（範圍 1，ES seg58 activate）

- **FR-010**（簽名與預設）：`P.focus(group, active, at, { dim = 0.4, dur = 0.4, ring = null })`。
  - `group`：一組元素（選擇器或陣列）；`active`：其中一個（選擇器、元素）或 `null`（`null`＝全部恢復）。
  - 每個 group 元素的目標亮度：`active` 是 `null` 或就是它 → 1；其他 → `dim`。
  - `ring`：每個 group 元素裡的子元素選擇器（例 `'.xwarn-on'`），目標：是 active 而且 active 不是 `null` → 1，其他 → 0。
  - 預設數字出處：`dim` 0.4＝ES seg58（其他降到 0.4，02 §1 #10）；`dur` 0.4＝TR/v3「強調用 0.4 s 換色」（02 §2）；ES 原本是 0.3 s，取 TR/v3 的 0.4 讓全工作區強調一致。ease `sine.inOut`（和 `P.in`／`P.out` 同族，SM:197-198）。
  - 驗：`motion.test`「P.focus：三個元素依序聚焦、最後恢復，亂序 seek 每個時間點的 opacity 都對」。
- **FR-011**（seek-safe 的做法）：SM 對每個元素記「目前亮度」（沒記過＝1）與「目前框亮度」（沒記過＝0）；每次 `P.focus` 用 `fromTo(上一次的值 → 目標)`，值相同就不寫 tween。ring 第一次被碰到時，就算目標是 0 也寫一個 `0 → 0` 的 tween（`immediateRender: true`），所以 CSS 不用先把框藏起來。
  - 驗：`motion.test`「ring 沒先藏，第 0 秒也看不到」。
- **FR-012**（和 in／out 互相知道）：被 `P.focus` 記過亮度的元素，之後的 `P.out`、`P.swap` 的出場那一半、`P.axis` 的出場那一半，起點用記錄的亮度（例 0.4）而不是固定 1；`P.in`、`P.rise`、`P.reveal`、`P.drift` 讓記錄變回 1，出場讓記錄變 0。沒被 `P.focus` 記過的元素行為完全不變。
  - 驗：`motion.test`「focus 後 P.out：out 起點那一格 opacity 0.4（沒有跳回 1）」；既有「P.in／P.rise 的起點與終點值」測試不改。
- **FR-013**（呼叫順序）：同一個元素的 `P.focus`（以及 FR-012 會讀寫記錄的方法）必須照時間先後寫；這一次的 `at` 比上一次記錄的時間早 → 丟錯，原文 cli-003 §3.1。理由：fromTo 鏈是照呼叫順序接的，倒著寫往回 seek 會錯。
  - 驗：`motion.test`「倒著寫 → 丟錯，訊息有兩個秒數與改法」。
- **FR-014**（不做的事）：不補間顏色（R7.3「不要用 GSAP 補間顏色」，R:545）；亮起靠「疊一層主色框再淡入」＝`ring`。

#### C. 打字：`P.type`（範圍 1，ES seg16）

- **FR-015**（簽名與預設）：`P.type(sel, at, { cps = 8.5, dur, caret = true })`。
  - 字數 N＝元素裡所有文字節點的非空白字元數（以 code point 算，`Array.from`；半形英數一個算一個）。
  - 長度＝`dur` 有寫用 `dur`，否則 `round2(N / cps)`；ease 固定 `none`（等速打字）。
  - 8.5 字／秒＝ES seg16 的網址 17 字 2.0 s 打完（`ES/seg16:L302-304`，02 §1 #13）。
  - 驗：`motion.test`「P.type：N 與預設長度」。
- **FR-016**（seek-safe 的做法）：用 GSAP plugin `scType`（同 `scCount` 的寫法，SM:116-124）：`render(ratio)` 依 `k = floor(ratio × N + 1e-6)` 把前 k 個字放進「已打」span、其餘放進同一位置的「未打」span（`visibility: hidden`），所以版面在打字前後完全一樣（框的寬高、換行位置不變）。不用 `onUpdate`、不用計時器。同一元素第一次 `P.type` 才 `immediateRender`（`first('scType', el)`），所以 `at` 之前整段文字看不見。
  - 驗：`motion.test` 用 DOM shim：亂序 seek 到 ratio 0／0.37／1／0.5，已打的字串＝原文前 k 個字，已打＋未打＝原文。
- **FR-017**（保留標記）：只動文字節點；`<br>`、`<span class="sc-kw">`、底線 `<svg>` 等元素原樣保留在原位。空白（含換行縮排）跟著它後面那個字一起出現；只有空白的文字節點不動。第一次處理時在元素上寫 `data-sc-type="N"`，再呼叫一次不會重包。
  - 驗：`motion.test`「關鍵詞 span 與 br 還在；呼叫兩次 N 不變、span 不重複」。
- **FR-018**（游標）：`caret: true` 時，在「已打」最後一個字後面放一個淨寬 0 的游標（`display:inline-block; width:0; height:0.9em; vertical-align:-0.1em; border-left:4px solid currentColor; margin-left:-4px`）；ratio ≥ 1 時隱藏。不閃爍：TR/v3 禁 `repeat`／`yoyo`（02 §2），ES 的閃爍不搬（02 §6 不搬清單的同類理由）。
  - 驗：`motion.test`「ratio 1 時游標隱藏；游標不改變 offsetWidth（shim 檢查樣式字串）」。
- **FR-019**（DOM 介面最小化）：`P.type` 只用下列 DOM API，測試 shim 照這份清單實作：`childNodes`、`nodeType`、`nodeValue`、`parentNode.insertBefore`、`parentNode.removeChild`、`ownerDocument.createElement`、`ownerDocument.createTextNode`、`setAttribute`／`getAttribute`／`hasAttribute`、`style.cssText`、`textContent`、`className`。
  - 驗：`motion.test` 的 shim 只實作這些，P.type 測試全過。

#### D. 4 支範例改寫（範圍 2）

- **FR-020**（綁句寫法）：4 支範例的時間常數全部改成 `const T1 = P.at('#12'), …`：只綁「每個新訊息的第一拍」，同一件事接著發生的步驟用 `T1 + 秒數` 接（例：x-metaphor 的箭頭 `T1 + 1.4`、右圖示 `T1 + 2.8`）。結尾改 `P.end()`、刪 `const D = …`。
  - 驗：`examples.test`「4 支範例沒有 `const D =`、沒有數字 `P.end(`；每支至少 2 個 `P.at(`」。
- **FR-021**（檔頭）：檔頭固定 6 個小節，照這個順序：`【適用的口播】`、`【不要用在哪裡】`、`【要改的地方】`、`【綁句欄位】`、`【D 下限】`、`【版面】`。
  - `【時間軸怎麼對到字幕句】` 改名 `【綁句欄位】`，內容只寫「哪個常數綁哪一句、`P.at` 怎麼寫、拍與拍之間至少差幾秒」。
  - 刪掉所有手算說明（含「相減」「填回 data-duration」「起點看 --check 報告」）與「一集已經有 2 段 custom：改回第一層」（`x-before-after.html:12`、`x-numbers.html:13`；001 FR-065）。
  - 驗：`examples.test` 檢查 6 個小節標題與順序；`grep -nE "相減|填回 .*data-duration|2 段 custom|一起進場|進場 0\.3–0\.5" shared/template/custom/*.html` 沒有輸出（002 SC-004、001 SC-002）。
- **FR-022**（D 下限寫成公式）：`【D 下限】`寫「plan.json 這段的長度要 ≥ 最後一拍 + N 秒」，N 由該範例的動作長度算好寫死（例 x-process：最後一站亮起 0.5 s ＋最後一幕 1.5 s ＋淡出 0.5 s＝2.5 s；R7.2 表「整段淡入淡出 0.5 秒」、定案「最後一幕 ≥ 1.5 s」）；拍與拍的最小間隔同樣寫死（例 x-process 相鄰兩站 ≥ 2.6 s，plan.md §D.1 推導）。
  - 驗：`examples.test` 用 `data-cues-sample` 檢查：sample 的 D 與每對相鄰綁句點都滿足檔頭寫的數字（從檔頭用固定格式 `D ≥ 最後一拍 + 2.5` 解析）。
- **FR-023**（版面修到新規則 0 ⚠）：4 支照 plan.md §D 的靜態估算修版面（站寬、框高、置中、間距），整合測試 audit 新規則 0 ⚠。主要改動：
  - x-process：站 248×208 → 264×224（內距：左右 (256−208)/2＝24 px、上下 (216−184)/2＝16 px，R8 #6 公式 max(24, 0.45×52)＝24、max(14, 0.28×52)＝14.56）；總覽進場改每 0.5 s 一個（FR-050）。
  - x-metaphor：框高 220 → 240（上下內距 6 → 16 px）；兩框進場 1.0／1.5 s。
  - x-before-after：膠囊高 96 → 112、省下膠囊 96 → 104（sc-t52 行高 72，上下內距 12 → ≥ 15 px）；卡片 before／after 兩態都垂直置中（top 185 → 255 跟著 `P.morph`）；總覽改 0.5 s 一個。
  - x-numbers：A 區 top 36 → 40（標題到內容目標 40，R8 #6）；卡片整組下移到 top 179（上下留白差 −62 → 0 px，`OV/AW:L218` 門檻 40）。
  - 驗：整合測試（FR-072）。
- **FR-024**（`data-cues-sample` 與句號區段）：每支範例用互不重疊的句號區段，方便整合測試把 9 支放進同一份 rough.srt：

  | 範例 | 句號 | 範例 | 句號 |
  |---|---|---|---|
  | x-process | #11–#15 | x-warnings | #51–#56 |
  | x-metaphor | #21–#25 | x-prompt | #61–#65 |
  | x-before-after | #31–#35 | x-ui-mock | #71–#76 |
  | x-numbers | #41–#44 | x-architecture | #81–#87 |
  | | | x-branch | #91–#95 |

  - 驗：`examples.test`「9 支的 sample refs 句號落在各自區段、彼此不重疊」。
- **FR-025**（root 的 `data-duration`）：保留，寫成 sample 的 D（給 HyperFrames Studio 單獨開檔與 `P.dur()` 最後一層退路）；檔頭不再要求它等於段長（002 FR-019）。
- **FR-026**（不改的地方）：4 支的配色、圖示、文案、曲線造型不變；只動 FR-020–FR-025 列的地方與為了新座標必須跟著動的曲線端點（`examples.test.mjs:130` 的幾何檢查要繼續過）。

#### E. 5 支新範例（範圍 3）

- **FR-030**（共同規則）：5 支都：
  - 照 R7.3 骨架（R:488-562，含 FR-008 的新 `forEach`）、R7.5 檔頭格式（FR-021 的 6 小節）、R7.6 三道關卡（`--check`、audit、亂序 snapshot）；
  - `layout: "fullscreen"`；主卡 left 120、width 1180（右緣 1300，R7.2 表「範例目前排到 1300」；子母畫面禁入區 x 1424–1888、y 581–951，`lib/media.mjs` 的 `PIP_ZONE`；派工單寫的 x 1344–1888、y 617–951 是 agent-skills 的子母畫面（480×270，右下）禁入區，`OV/AW:L228`，右緣 1300 兩組都避開）；
  - 內容在 y 120–870 內垂直置中：`top = 120 + (750 − 卡高) / 2`（R4.1 內容區、`AR:17`；上下留白差 0，`OV/AW:L218` 門檻 40）；
  - 0.5 s 前不動（淡入，R7.2 表）；總覽的新元素每 0.5 s 一個（FR-050 的「每秒 ≤ 2 個」）；
  - 只用 token 顏色、只用 SM 方法、不宣告字型（R7.3、R7.4；`examples.test` 既有斷言）；
  - 每個概念都有圖示（R7.3 版面原則「圖示先行」），圖示名稱都在 `kit/icons.json`（2026-10-31 實查 1541 個鍵，本規格用到的全部存在）；
  - 寫 `data-cues-sample`（FR-005）與檔頭 `【D 下限】`；
  - 整合測試 audit 0 ✖、新規則 0 ⚠。
  - 驗：`examples.test` 結構測試 ×5＋整合測試。
- **FR-031**（x-warnings，02 §1 #10、ES seg58）：見 plan.md §E.1 的版面與時間軸。
  - 適用口播：一組 2–3 條警告／注意事項，一條一句，講到哪條聚焦哪條。
  - 不要用：只有 1 條（用 07 重點字卡 `tone: warn`）；4 條以上（04a 全畫面清單逐條）；每條沒有可以放在右側的示意（04a）；在講先後步驟（x-process）。
  - 要改的地方：標題（≤ 10 字）、三列文字（每列 ≤ 8 字）、三列圖示、右側三張示意（圖示＋≤ 7 字）、`W1..W3`。
  - 綁句欄位：`W1 = P.at('#52')`、`W2 = P.at('#53')`、`W3 = P.at('#54')`；選用 `ALL = P.at('#55')`（「這三點都要注意」→ 全部恢復亮度）。
  - D 下限：`W1 ≥ 3.0`；相鄰兩條 ≥ 2.2 s；D ≥ 最後一拍 + 3.0。
  - 驗：結構測試＋亂序 snapshot（`--at W3+1,W1+1,W2+1`）完成態和順序 seek 相同。
- **FR-032**（x-prompt，02 §1 #12、#13；ES seg16、JY）：
  - 適用口播：唸出或展示一段要貼給 AI 的提示詞（去空白後 ≤ 49 字，`JY/SKILL.md:L123`「≥ 50 字不下卡」），接著點名其中 1–2 個關鍵詞；變體：一行終端機指令或網址。
  - 不要用：提示詞 ≥ 50 字（只上字幕，畫面用螢幕錄影）；有打字的螢幕錄影（media 段）；只講一個名詞（06／07）。
  - 要改的地方：標題、提示詞文字（每行 ≤ 18 字、≤ 3 行，用 `<br>` 斷在語意處）、兩個關鍵詞（包 `<span class="sc-kw xprompt-k">`）、底下的提醒膠囊（≤ 10 字）、`TYPE`／`K1`／`K2`／`NOTE`。
  - 綁句欄位：`TYPE = P.at('#62', 0.45)`（句子開口後 0.45 s 開始打，ES seg16）、`K1 = P.at('#63@<關鍵詞1>')`、`K2 = P.at('#64@<關鍵詞2>')`、`NOTE = P.at('#65')`。
  - D 下限：`TYPE ≥ 1.5`；`K1 ≥ TYPE + 打字長度 + 1.2`（打字長度＝字數 ÷ 8.5）；`K2 ≥ K1 + 2.0`；`NOTE ≥ K2 + 2.0`；D ≥ NOTE + 2.9。
  - 關鍵詞只改字色、不用螢光筆；點名時畫底線，底線在字底下 8–10 px（`OV/DR:L56`）。底線是關鍵詞 span 裡一條 6 px 高的 `<i>`，用 `P.bar`（scaleX 0→1、0.8 s，SM:132 `BAR`）畫出來，不用 SVG 描線（G11 原本寫 `P.stroke`；改 `P.bar` 是因為 `preserveAspectRatio="none"` 的 SVG 線寬會跟著拉伸，`vector-effect` 和 `pathLength` 一起用在 Chrome 的結果沒驗證過）。
  - 變體表（檔頭）：「指令」（前面加 `$ `、單行、`white-space: nowrap`）、「網址」（單行、不拆，`JY/SKILL.md:L133`；≤ 34 個半形字，本線初值：52 px 英數平均約 29 px 寬 × 34 ≈ 986 px ≤ 框內寬 984＋2，放不下 audit 會報撐破）。
- **FR-033**（x-ui-mock，02 §1 #15、ES seg02）：
  - 適用口播：講一個介面操作，但沒有螢幕錄影（「在設定頁按右上角的匯出，就會跳出完成通知」）：先給全貌、鏡頭推到按鈕、游標移過去按下、跳出結果。
  - 不要用：有螢幕錄影（media 段，U 第 5 節）；操作超過 2 步（拆兩段或去錄影）；要看清楚真實介面細節（截圖放 media 段）。
  - 要改的地方：視窗標題（≤ 16 字）、側欄三項（≤ 4 字）、頁面標題、按鈕文字（≤ 4 字）、通知（圖示＋≤ 8 字）、`ZOOM`／`CLICK`／`RESULT`。
  - 綁句欄位：`ZOOM = P.at('#72')`、`CLICK = P.at('#73@匯出')`（游標在 CLICK 前 0.6 s 出發、剛好在這一刻按下）、`RESULT = P.at('#74')`。plan.json 這段同時寫 `"clicks": ["#73@匯出"]`（005 `contracts/sfx.md` §5，只在畫面上看得到游標按下時寫）。
  - D 下限：`ZOOM ≥ 1.1`；`CLICK ≥ ZOOM + 3.0`；`RESULT ≥ CLICK + 1.5`；D ≥ RESULT + 2.9。
  - 游標移動 0.6 s、點擊漣漪 scale 0.82→1（ES seg02，02 §1 #15）；鏡頭推進用 `P.push`（1→1.4，SM 預設倍率；長度改 1.2 s，本線初值：預設 2.4 s 會吃掉一整拍）。
- **FR-034**（x-architecture，02 §1 #16、ES seg20）：
  - 適用口播：講資料在幾個裝置之間怎麼走、誰傳給誰、有沒有經過雲端（「手機的照片直接傳到電腦，不經過雲端」）：三拍：路徑描出來 → 檔案沿路徑流過去 → 劃掉不走的那條。
  - 不要用：只是並列幾個元件、沒有東西在流動（04a／04c）；有先後步驟但不是傳遞（x-process）；超過 2 個裝置加 1 個中繼（拆兩段）。
  - 要改的地方：標題、兩個裝置（圖示＋≤ 4 字）、中繼（預設雲端，圖示＋≤ 3 字）、結論膠囊（≤ 6 字）、`PATH`／`FLOW`／`CUT`。
  - 綁句欄位：`PATH = P.at('#82')`、`FLOW = P.at('#83')`、`CUT = P.at('#84')`。
  - D 下限：`PATH ≥ 3.0`；`FLOW ≥ PATH + 1.9`；`CUT ≥ FLOW + 3.7`；D ≥ CUT + 3.6。
  - 檔案點沿路徑等速走 1.5 s（ES seg20）；三個點相隔 0.5 s（ES 是 0.4 s，改 0.5 s 才符合「每秒 ≤ 2 個新元素」，FR-050）。
- **FR-035**（x-branch，02 §1 #5、`OV/MR:L150-176`）：
  - 適用口播：一個起點分成 2–3 條路，講到哪條亮哪條（「同一支錄影，可以剪成長片、剪成短影音，或直接出逐字稿」）；變體：2–3 個來源匯成一個結果（匯流）。
  - 不要用：一直線 3–4 站（04c）；有先後順序的一條路（x-process）；超過 3 條（04a）；兩邊比較（04b）。
  - 要改的地方：標題、起點（圖示＋≤ 4 字）、每條分支（圖示＋≤ 5 字）、`B1..B3`；2 條分支或匯流時照檔頭變體表改座標與曲線。
  - 綁句欄位：`B1 = P.at('#92')`、`B2 = P.at('#93')`、`B3 = P.at('#94')`；選用 `ALL = P.at('#95')`。
  - D 下限：`B1 ≥ 3.4`；相鄰兩條 ≥ 2.5 s；D ≥ 最後一拍 + 3.3。
  - 分支不打勾、走過不換底色，只用 `P.focus` 的框（02 §1 #5「流程圖的站禁用打勾」）。
- **FR-036**（R7.6 亂序 snapshot）：每支範例在整合專案裡跑 `npx hyperframes snapshot --at <完成態>,<第一拍+1>,<中間拍+1>`（亂序），和順序 `--at` 的同名截圖逐像素比對相同（G11 驗證方式）。
  - 驗：整合測試（FR-072），需要 Chrome；沒有就 skip。

#### F. audit 版面規則（範圍 4，G08）

- **FR-040**（只量 custom）：新版面規則只對 `type: "custom"` 的段判（`--all` 量到的情境模板不判：模板版面固定、由 002 維護，R8 開頭說明）。
  - 驗：`audit.test`「同一份量測資料，item.type 是 scene 時新規則 0 筆」。
- **FR-041**（✖ 未定位頂層）：composition root 與 `.fill` 的直接子元素，computed `position` 不是 `absolute`／`fixed` → ✖（`OV/SKILL.md:139`「`.fill` 的直接子元素一律 position: absolute 並寫死 left／top」）。排除 `<style>`、`<script>`、`display:none`、寬或高為 0 的元素。理由：static 元素會照文件順序往下排，換字就跑位，而且其他規則量到的位置都不可靠。
  - 驗：`audit.test` fixture：root 下一個 static div → ✖；改 absolute → 0 筆。
- **FR-042**（標題到內容）：標題＝`.sc-wcard__bar`、`.sc-pill`、`[data-audit-title]`。內容＝在標題「最近的有底有框祖先」（找不到就是 root）裡、不在標題自己子樹裡、上緣 ≥ 標題上緣、和標題水平有交集的可見元素（有字、有底框或媒體；不含背景層）。間距＝min(內容上緣) − 標題下緣。
  - 間距 < 0 → ✖「標題壓到內容」；0 ≤ 間距 < 24 → ⚠「間距不足」；≥ 24 不報。門檻 24 與目標 40 出自 `OV/AW:L77`、R8 #6（R:607）。
  - 改法給「整組往下移 (40 − 間距) px」，並提醒下面每一層一起移（`OV/AW:L85`）。
  - 驗：`audit.test` fixture：−14 → ✖、16 → ⚠、40 → 0 筆。
- **FR-043**（⚠ 區塊重疊）：可見的有底框元素與媒體元素，兩兩不是祖先／子孫關係、而且交集兩軸都 > 2 px（`OV/PS:L33`、`AR:24` 的 TOL 2）→ ⚠。排除：任一方或其祖先有 `data-layout-allow-overlap`、正在動、背景層、累計 opacity < 0.05。
  - 驗：`audit.test` fixture：兩張卡交疊 120×40 → ⚠；加 `data-layout-allow-overlap` → 0 筆；子層的亮框（inset −4）→ 0 筆。
- **FR-044**（⚠ nowrap 餘裕）：`white-space: nowrap` 而且有自己文字的元素，在最近的有底框容器（自己有底框就是自己）裡：餘裕＝文字左右兩邊到容器框線內側（含 padding）的較小距離；0 ≤ 餘裕 < 7 → ⚠（`OV/SKILL.md:132`「固定寬度＋nowrap 元素的餘裕 ≥ 7px」）；< 0 已經是既有的「文字撐破」✖，不重複報；同一個容器已經報了「內距不足」（FR-047）就不再報這條。
  - 驗：`audit.test` fixture：餘裕 4 → ⚠、7 → 0 筆。
- **FR-045**（⚠ 右側空白過多）：有底框而且裡面有字的元素：右側空白＝容器內緣（扣框與右 padding）− 內容最右緣（文字框、子層有底框的元素、媒體）。> 80 → ⚠（`OV/SKILL.md:140`「內容最右緣離卡片內緣 ≤ 80」）。
  - 豁免：左右空白差 ≤ 8 px（置中，本線初值：52 px 字的 1/6 以內視為置中的量測誤差）；元素或祖先有 `data-layout-allow-slack` 或 `data-width-shared`（`OV/MR:L334`、`OV/SKILL.md:140`）；kit 元件（Edge Cases）；寬度 ≥ 父層內寬 − 16 px 的橫條（標題列、視窗標題列、撐滿清單欄的列，本線初值：這種元素的寬度由父層決定，不是 max-content 的問題）。
  - 同一欄（left 與 width 相同）的元素算一組，取組內最小的右側空白判（`OV/DR:L12`「同欄區塊等寬＝最寬那塊」）。
  - 驗：`audit.test` fixture：單張空白 236 → ⚠；同欄三張其中一張只剩 40 → 0 筆；置中 → 0 筆。
- **FR-046**（⚠ 垂直不平衡）：只在 `layout: "fullscreen"`：可見內容（不含背景層）的聯集上緣 top、下緣 bottom；上留白＝top − 120、下留白＝870 − bottom、差＝上 − 下；|差| > 40 → ⚠，改法「整組往下移 (下 − 上)/2 px」（正值往下）。出處：`OV/AW:L218`；120／870＝R4.1 內容區（`AR:17`）。
  - 驗：`audit.test` fixture：內容 150–778（差 −62）→ ⚠ 建議 +31；150–862（差 22）→ 0 筆。
- **FR-047**（⚠ 內距不足）：文字框＝有底框（底色 alpha ≥ 0.3、背景圖、或框線 ≥ 1 px 且 alpha ≥ 0.15）而且「自己的文字」非空的元素（定義照 `OV/PS:L19-21`：往下走不穿過 absolute 子層與另一個文字框）。內容＝自己的文字行框 ∪ 流內的 svg／img ∪ 巢狀框的外框。四邊內距（框內緣到內容）：
  - 左右 ≥ max(24, 0.45×字級)、上下 ≥ max(14, 0.28×字級)（R8 #6，R:607；上下量到行框，`OV/PS:L23`）；
  - 豁免：圓形（寬高差 ≤ 2 px 且圓角 ≥ 一半）、≤ 2 個字的小徽章（`OV/PS:L29`）、kit 元件（Edge Cases）、`data-layout-allow-tight`（新標記，本線加）。
  - 驗：`audit.test` fixture：x-process 舊站（左右 16、上下 8）→ ⚠ 兩筆合成一則；264×224 → 0 筆。
- **FR-048**（⚠ 行高不足）：文字框裡的文字 line-height < 1.25×字級，而且下內距 < 門檻 + 4 px → ⚠（`OV/PS:L27`「line-height ≥ 1.25×字級，或 tB ≥ 門檻＋4」）；字級 ≥ 100 px 不判（Edge Cases）。
  - 驗：`audit.test` fixture：52 px／行高 60、下內距 12 → ⚠；行高 72 → 0 筆。
- **FR-049**（取樣時刻）：版面規則在三種時刻量：既有的中點、完成態（`AR:53-58`），加上「靜止」取樣：每個 ≥ 0.4 s 的靜止區間（FR-052）取中點，每段最多 8 個（`OV/AW:L215`「聯集連續 ≥ 0.4s 不變」算一個穩定狀態；8＝本線初值，讓一段量測 ≤ 約 3 s）。同一段同一規則同一元素照 `mergeFindings` 合併成一筆（`AR:273-283`）。
  - 驗：`audit.test`「靜止取樣：給 3 個靜止區間 → 3 個 still 時刻；10 個 → 8 個（取最長的 8 個）」。

#### G. audit 節奏 ⚠（範圍 5，G12）

- **FR-050**（⚠ 同一秒新元素太多）：任何 `[t, t + 1.0)` 秒窗裡新元素 > 2 個 → ⚠（TR/v3「每秒新元素 ≤ 2」，`TR/v3:L12-13`）。窗的起點取每個新元素的出現時刻；同一段只報最擠的那一窗，訊息列出窗裡的元素。
  - 驗：`audit.test`：4 個站 stagger 0.12 → ⚠ 列 4 個；0.5 s 一個 → 0 筆。
- **FR-051**（怎麼數「新元素」）：從 `collectMotionInPage`（FR-055）拿到的動作：
  - **進場**：opacity 從 < 0.2 變成 ≥ 0.2（fromTo 的 `vars.startAt.opacity`；2026-10-31 實測 GSAP 3 的 fromTo 把起點存在 `vars.startAt`），或 clip-path 從全裁變成打開（`P.reveal`／`P.maskUp`）；
  - **退場**：opacity 從 ≥ 0.2 變成 < 0.2；
  - **描線**：SVG 形狀的 strokeDashoffset（`P.stroke`／`P.icon`／`P.check`）——算「動作」但**不算新元素**（連接線與圖示線條是在已經出現的元素上畫，不是新的區塊；x-process 的線＋箭頭＋下一站亮起會是 3 個，算成新元素就和範例的正確寫法衝突）；
  - **亮起**：進場的目標是疊在父元素上的一層（`offsetParent` 就是父元素、`|offsetLeft|`、`|offsetTop|` ≤ 8 px、面積 ≥ 父元素的 80%；x-process 的 `.xproc-on`／`.xproc-now`、`P.focus` 的框、點擊漣漪）——算「變化」，不算新元素（TR/v3「強調用 0.4 s 換色」是強調、不是新資訊；8 px 與 80% 是本線初值：範例的框是 inset −4、漣漪 inset −8）；
  - **替換**：進場的元素和同一個父元素裡、前後 0.15 s 內退場的元素位置重疊 ≥ 50%（`P.swap`、x-warnings 右側換圖）——算「變化」（02 §1 #7「swap 同時 out 0.4＋in 0.5」是同位置換內容；0.15 s＝`P.BEAT`、50% 是本線初值）；
  - **變化**：其他（位移、縮放、`P.bar` 的 scaleX、亮度 0.4↔1、計數、打字）。
  - 新元素＝有進場的元素，出現時刻＝它第一次進場的起點；如果某個祖先在它之前 ≤ 0.3 s（本線初值：`P.BEAT` 0.15 的 2 倍，「外殼＋內容晚 0.15」是同一塊，02 §1 #1）進場，併進祖先、不另算。
  - 驗：`audit.test` 用假時間軸資料：卡片 0.5、卡內標題 0.65 → 1 個；0.9 → 2 個；描線 → 0 個。
- **FR-052**（⚠ 間隔太短）：所有新元素照出現時刻排序，相鄰兩個差 0.001 < Δ < 0.12 s → ⚠（TR/v3「間隔 ≥ 0.12」，`TR/v3:L12-13`）；Δ ≤ 0.001（同一刻一起出現）不報（亮框＋底色一起亮是正常的，人數由 FR-050 管）。改法建議 stagger ≥ 0.15（定案「沒有句子可綁時每條相隔 ≥ 0.15 s」）或綁句。
  - 驗：`audit.test`：stagger 0.1 → ⚠；0.12 → 0 筆；同一刻 2 個 → 0 筆。
- **FR-053**（⚠ 完成態停太短）：用 `P.marks`（FR-003）排序去重、只留 `(0, D)` 裡的，切成拍。第 i 拍（不含最後一拍）的窗＝`[m_i, m_{i+1})`：
  - 從窗裡第一個動作的起點（起點 ≥ m_i − 0.05）算起，到 `m_{i+1}` 為止，最長的靜止區間 < 1.2 s → ⚠（定案「新訊息完成態 ≥ 1.2 s，中間步驟可 0.6 s」）。
  - 窗裡沒有任何動作 → 這拍不判。
  - 動作的時間區間合併成「忙碌段」時，間隔 < 0.05 s 的視為連續（本線初值：兩格 30 fps 以內）。
  - 用「最長靜止」而不是「最後一段靜止」：同一拍裡用 `+秒數` 接的中間步驟可以只停 0.6 s，只要這拍裡有一段 ≥ 1.2 s；下一站的連接線提早描（x-process 的 `T2 − 0.9`）也不會被誤判。
  - 沒有任何 `P.marks` → 不判，notes 印一行（Edge Cases）。
  - 驗：`audit.test`：最長靜止 0.9 → ⚠；中間步驟 0.6＋最後停 1.4 → 0 筆；拍內沒動作 → 0 筆。
- **FR-054**（⚠ 最後一幕太短）：收尾點＝`D − 0.5`（這段有 build 加的淡出時，R7.2 表；讀 audit 已經拿到的 `chk.res.items[].fadeOut`，`plan.mjs:8`、`:358-363`）或 `D`；如果有退場動作的結束 ≥ 收尾點 − 0.05，收尾點改成這些退場的最早起點。最後一幕＝收尾點 − 收尾點之前最後一個動作的結束；< 1.5 s → ⚠（定案「段尾最後一幕 ≥ 1.5 s」、`P.HOLD_END` 1.5，SM:130），改法給「plan.json 的 to 往後延 ≥ (1.5 − 最後一幕) s，或把最後一拍提早」。
  - 驗：`audit.test`：最後動作 8.6 結束、D 10、有淡出 → 0.9 → ⚠ 延 0.6；overlay 段自己 `P.out` 在 D − 0.4 → 收尾點改 D − 0.4。
- **FR-055**（CDP 怎麼量出現時刻）：AP 加一個在頁面裡跑的函式 `collectMotionInPage({ hostId, compId })`，由 AB 的 `S.evaluate` 執行，**時間軸建好之後跑一次就好，不用 seek**：
  1. 讀 `window.__timelines[compId].getChildren(true, true, false)`（巢狀時間軸裡的 tween 也拿得到）；
  2. 每個 tween：起點＝`startTime()` 一路加上父時間軸的 `startTime()` 到 comp 的根時間軸（段內秒數）、終點＝起點＋`totalDuration()`；
  3. 目標只留 DOM 元素（`nodeType === 1`）、而且在 `#<hostId>` 裡；
  4. 依 FR-051 分類（「亮起」「替換」要用元素的 `offset*` 版面框判斷，所以在頁面裡做），回傳 `{ D, marks, tweens: [{ start, end, kind, targets: [{ key, desc, parentKeys }] }] }`（`key` 是元素在 host 裡的索引路徑，`desc` 用 AP 既有的 `descOf` 格式；`parentKeys` 給 FR-051 的「併進祖先」）；`D` 讀 `window.__timelines[compId].duration()`，`marks` 讀 `window.SceneMotion.marks[compId]`。
  - 為什麼不用逐格 seek 看 opacity：一段 15 s 要 450 次 seek＋量測（每次約 50 ms），而且看不出哪個元素先、哪個是祖先；讀時間軸是 O(tween 數)、0.1 s 內完成，和 AP 既有的「正在動的元素」偵測（AP:45-60）同一種做法。
  - 驗：`audit.test` 瀏覽器實量（沒有 Chrome 就 skip）：fixture 有 fromTo、巢狀 timeline、stagger、描線，回傳的 start／kind 和預期表相同。
- **FR-056**（嚴重度）：節奏四條都是 ⚠，不影響結束碼（主代理派工指定「節奏 ⚠」；完成態和最後一幕的長短也受口播速度影響，硬擋會讓 AI 去改講稿時間）。

#### H. 綁句錯誤與段長（範圍 1、4 的 audit 端）

- **FR-057**（✖ 綁句失敗）：audit 量完後讀 `window.__cueErrors`（字串陣列），每則用 `^(\S+) (P\.(?:at|dur)\(.*?\))：(.*)$` 拆出段 id（或 comp id）、呼叫、原因，對到量測段 → ✖ 一則，fix 依原因種類給（原文 cli-003 §2.3；cues.md §4.4「003 的 audit.mjs 在頁面載入後讀它，有內容就每則一個 ✖」）。對不到段的 → `report.warnings`。
  - 驗：`audit.test`：cues.md §6 #8、#9、#13 的三則字串 → 三則 ✖，訊息含 ref 與改法；`P.dur()` 那則也能拆。
- **FR-058**（段長不符）：`durationWarnings`（`AU:61-72`）只在檔內**沒有**寫 `P.end()`（不帶參數）也沒有 `P.dur()` 時才比 `data-duration`／`const D`；改法從「填回」改成「把結尾改成 `P.end()`（不帶參數），長度就會自動等於段長」（002 FR-019）。
  - 驗：`audit.test`「customDuration／durationWarnings」擴充：有 `P.end()` → 0 筆；有 `P.end(9)` 且段長 12 → ⚠ 新改法。

- **FR-059**（`--help` 訂正）：`audit.mjs` 檔頭（也是 `--help` 原文，AU:1-31）的「壓到子母畫面」改成照 `PIP_ZONE` 的 x 1424–1888、y 581–951；新規則與節奏 ⚠ 的說明加進檔頭的 ✖／⚠ 兩張表（原文 cli-003 §1）。
  - 驗：`audit.test`「--help 的禁入區數字＝PIP_ZONE；列出所有 rule 的中文名」。

#### I. 預覽頁（範圍 6）

- **FR-060**（index.html 新分頁）：`shared/template/index.html` 加 `<section class="block" id="custom">` 與分頁連結 `④ 情境動畫`（放在 `③ 條列` 之後、字卡動態之前，`index.html:172-180`）；9 張卡片，每張：iframe `preview/x-<名稱>.html`、「全尺寸 ↗」連結（同 `index.html:194-195` 的寫法）、名稱、一句適用口播（和 R7.5 表同一句）、版面「子母畫面」（AGENTS.md「剪好看」第 6 步：custom fullscreen 屬子母畫面）。
  - 驗：`examples.test`「index.html 有 9 個 preview/x-*.html 的 iframe，和 custom/ 的檔案一一對應」。
- **FR-061**（預覽頁怎麼產生）：`preview/x-<名稱>.html` 由 `build.mjs --gallery` 產生（和模板預覽同一個指令，`build.mjs:231-263`）。頁面內容：模板預覽同款的舞台、講者底圖、子母畫面（`main.mjs:236-300` 的 `buildPreview` 結構），`#scene` 裡直接放 custom 檔 `<template>` 的內容；沒有 `window.__cues`，`P.at` 讀 `data-cues-sample`（FR-005）；時間軸從 `window.__timelines[名稱]` 拿、包一層外層時間軸做淡入淡出 0.5 s 與重播（`repeat: -1`、間隔 1.2 s，同 `buildPreview`）；`?t=秒數` 停在那一刻；送 `hf-preview-ready`。
  - 產生頁面的純函式 `buildCustomPreview({ name, html, pipStyle, kitLinks }) → html` 放在新檔 `shared/template/tools/lib/custom-preview.mjs`（003 擁有；**新檔，要主代理核准所有權**），`runGallery` 呼叫它（請 002 加）。
  - 驗：`examples.test`「buildCustomPreview：輸出有 template 內容、沒有 window.__cues、有 ?t= 與 hf-preview-ready」；`build.test`（002）「--gallery 產生 9 支 preview/x-*.html」。
- **FR-062**（R7.1、R7.5 新列）：R7.1「挑法」表與 R7.5 範例表各加 5 列、R7.5 的 4 列改「要改的地方」欄（`T1..T4、D` → 綁句欄位），原文在 docs.md §3、§4，交 001 併（R7.1 挑法表依 001 FR-073 會搬到 SITUATIONS.md §3，原文同時給 SITUATIONS 的格式）。
- **FR-063**（P3：動態規則與音效分頁）：index.html「動態規則」分頁刪「進場 0.3–0.5」「露臉 3 秒」，改成 style.md 的節奏數字（每秒 ≤ 2 個新元素、間隔 ≥ 0.12 s、完成態 ≥ 1.2 s、最後一幕 ≥ 1.5 s；數字以 001 寫進 style.md 的版本為準）；「音效」分頁照 005 `contracts/sfx.md`：配樂（`kind: "bgm"`）分開列、名稱用 `zh`、數量照 `sfx-data.js` 動態算，不寫死。
  - 驗：`grep -nE "進場 0\.3–0\.5|露臉 3" shared/template/index.html` 沒有輸出。

#### J. 測試（範圍 7）

- **FR-070**（`motion.test.mjs`）：
  - `P.at`／`P.dur`／`P.end()`：`cues.md` §6 的 13 組向量＋本線補充 4 組（參數型別丟錯 2、`P.dur` 退路 2）＋`P.marks`；亂序 seek 比對（綁句算出的時間軸，亂序 seek 到 20 個時刻的屬性和順序 seek 相同）。
  - `P.focus`：三元素依序聚焦＋恢復＋之後 `P.out`，亂序 seek 比對；倒著寫丟錯；ring 第 0 秒看不到。
  - `P.type`：DOM shim（只實作 FR-019 的 API）；亂序 seek 比對已打字串；保留 span／br；冪等；游標。
  - 既有測試全部不改（只擴充「API 註解有記錄」那一條的名單）。
- **FR-071**（`audit.test.mjs`）：每條新規則至少一組「故意違規」＋一組「剛好過關」的假量測資料（版面 8 條、節奏 4 條、綁句失敗 1 條、段長 1 條）；訊息用 `assert.match` 比對 cli-003 的原文關鍵字；一個瀏覽器實量測試（fixture 同時有擠在一起的版面與 stagger 0.1 的時間軸，量到 FR-041–FR-055 的對應 rule）。
- **FR-072**（`examples.test.mjs`）：
  - 結構：9 支都過 R7.3 骨架檢查（`<template>`、三處 id、前綴、`$q` 與 `forEach`）、檔頭 6 小節、`data-cues-sample` 可解析且涵蓋所有 `P.at` 字面值、D 下限可解析且 sample 滿足、句號區段不重疊、圖示名稱存在、沒有色碼與 `font-family`。
  - 整合（需要 ffmpeg；沒有就 skip）：在暫存資料夾建一個專案：`work/rough.mp4`＝ffmpeg `testsrc2` 1920×1080 30 fps＋`sine` 音軌、長度＝9 段 D 加總＋段間 1.0 s；`work/rough.srt` 依 9 支的 sample 產生（`#N` 起點＝段起點＋sample 秒數，`@詞` 的句子文字以那個詞開頭，讓 `cueSeconds` 算出句子起點）；`plan.json` 把 9 支登記成 custom fullscreen。跑 `build.mjs --check` → 0 ✖；build；需要 Chrome 時再跑 `audit.mjs --json` → 0 ✖、新規則（FR-041–FR-054）0 ⚠；FR-036 亂序 snapshot 比對。
  - 驗收：`node --test dev/tests/examples.test.mjs` 在作者 Mac 上全過、沒有 skip。
- **FR-073**（`icons.test.mjs`）：5 支新範例貼的 svg 都能在 `kit/icons.json` 找到同名原文（既有測試的檢查擴充到新檔）。
- **FR-074**（執行時間）：`motion.test`＋`audit.test` 的純函式部分 ≤ 5 s；整合測試 ≤ 120 s（本線初值：build 9 段＋audit 9 段，現行 audit 一段 2–5 s，`AU:11`）。

#### K. 文件原文（交 001）

- **FR-080**：`specs/003-motion-audit/docs.md` 照 001 spec 規定的 5 部分格式交件（001 spec「請 00N 加」：指令原文、成功關鍵行、✖／⚠ 原文與改法、放進哪份文件哪一節、新數字＋單位＋出處）。
- **FR-081**：docs.md 另附：R7.2 第 4 步、R7.3 骨架與方法表、R7.5 表、R7.6、R8 #6／#17 與「audit 抓得到／抓不到」表、SITUATIONS.md 5 列、AGENTS.md「子代理分工」表的回報欄（「長度 D」改「綁了哪幾句」）。
- **FR-082**：要成為規則的數字（每秒 ≤ 2 個新元素、間隔 ≥ 0.12 s、完成態 ≥ 1.2 s、最後一幕 ≥ 1.5 s、中間步驟 0.6 s）寫「請 001 寫進 style.md〈節奏〉」，不寫進 USAGE。

### Key Entities

- **`window.__cues`**（002 擁有，`cues.md` §2）：`{ v: 1, cues: { N: [起, 迄] }, segs: { <段 id>: { comp, start, D, refs: { '<ref>': 秒數 } } } }`，秒數和 host `data-start` 同基準。
- **`data-cues-sample`**（root 屬性，cues.md §5）：`{ start, D, cues, refs? }`；範例一律 `start: 0`。
- **`window.__cueErrors`**（cues.md §4.4）：字串陣列，每則 `<段 id 或 comp id> P.at('<ref>')：<原因>`。
- **`window.SceneMotion.marks[comp]`**：`[{ ref, t }]`，`t` 是段內秒數。
- **動作清單**（FR-055 回傳）：`{ D, marks, tweens: [{ start, end, kind: 'enter'|'exit'|'draw'|'change', targets }] }`。
- **finding 的 rule 名**：`unpositioned`、`title-overlap`、`title-gap`、`overlap`、`nowrap`、`slack`、`vbalance`、`padding`、`line-height`、`density`、`stagger`、`hold`、`tail`、`cue`（另加既有的 `duration` 改法）。

---

## 和 002 契約的對齊（`cues.md` v1）

2026-10-31 對照 `specs/contracts/cues.md` v1 逐條核對：

| 項目 | cues.md | 本線 | 一致？ |
|---|---|---|---|
| 注入位置與格式 | §2：`{ v, cues, segs: { id: { comp, start, D, refs } } }`，`refs` 與 `cues` 和 host `data-start` 同基準 | FR-001、FR-002 照用 | ✓ |
| 找段 | §4.1：`root.closest('[data-composition-src], [data-composition-file]')` 的 id 去掉 `el-` | FR-001 照用 | ✓ |
| `P.at` 取值順序 | §4.2：數字照舊 → `refs` → `#N`／`#Ne`／`#N±秒` 現算 → 其他 `max(0, off)` 並記錯；< 0 回 0 | FR-002 照用 | ✓ |
| `P.at` 參數型別錯 | 沒寫 | 本線補充：丟錯（FR-002） | 請 002 收進 §4.2 |
| `__cueErrors` | §4.4：字串陣列、三種原因原文 | FR-004、FR-057 照用；本線補「同一則只推一次」 | ✓（去重請 002 收進 §4.4） |
| `P.dur()` | §4.3：`seg.D` → root `data-duration` → 回 0 並推錯 | FR-006 照用；推錯的原因原文 cues.md 沒列，本線提議一則 | 請 002 收進 §4.4 |
| `P.end()` | §4.3 | FR-007 | ✓ |
| `data-cues-sample` | §5：`{ start, D, cues, refs? }`，只在找不到 `seg` 時用 | FR-005；範例一律 `start: 0` | ✓ |
| 測試向量 | §6 #1–#13 | FR-070 全部跑 | ✓ |
| 同檔兩段 | §3.3 `--check` ✖ | 執行期不另外偵測 | ✓ |
| `P.marks` | 沒寫 | 本線補充（FR-003），只給 audit | 不影響 002 |
| 預覽頁 | §5 寫「index.html 直接開 `custom/x-*.html`」 | x-*.html 的內容包在 `<template>` 裡，直接開是空白頁；改成 `--gallery` 產生 `preview/x-*.html`（FR-061），頁面裡沒有 host，所以照 §4.1 第 3 步用 sample | 請 002 把 §5 第一句改成「gallery 預覽頁（`preview/x-*.html`）」 |
| 字串但不是句號寫法（例 `P.at('3.2')`）的執行期原因 | §4.2 歸「其他」，§4.4 三種原因都不貼切 | 本線用第 2 種原因原文（`--check` 已經 ✖，執行期只是保險） | 請 002 確認 |

本線先前草擬的「`__cues[comp] = { at, lead }`」格式與「找不到時退到句子起點」已放棄，全部照 cues.md（憲法「單一真相」：契約擁有者是 002）。

## 請 00N 加

| 給誰 | 要加什麼 | 為什麼（本線哪條 FR） |
|---|---|---|
| 002 | `cues.md` 收進本線三項補充：§4.2「`ref` 不是字串也不是數字、`off` 不是有限數字 → 丟錯」；§4.4「同一則只推一次」與 `P.dur()` 推錯的原因原文（FR-006 提議）；§5 第一句改成 gallery 預覽頁 `preview/x-*.html`（`x-*.html` 直接開是空白頁）。另請確認字串但不是句號寫法時用哪一種原因 | FR-002、FR-004–FR-006、FR-061 |
| 002 | `runGallery`（`build.mjs:233`）多跑一圈：`shared/template/custom/x-*.html` 每支呼叫本線的 `buildCustomPreview({ name, html, pipStyle, kitLinks })`（`kitLinks`＝`main.mjs` 的 `KIT_LINKS`，由呼叫端傳，本線不 import 002 的模組），寫成 `preview/x-<名稱>.html`；`sfx-data.js` 不用收 custom | FR-061 |
| 002 | `plan-fields.md` 列 custom 段的 `clicks`（005 sfx.md §5 已定） | FR-033 |
| 001 | 把 docs.md §1–§9 併進 R7.1–R7.6、R8 #6 與「audit 抓得到／抓不到」表、SITUATIONS.md §3、AGENTS.md「子代理分工」表（「長度 D」改「綁了哪幾句」） | FR-062、FR-080–FR-082 |
| 001 | style.md〈節奏〉寫入：每秒新元素 ≤ 2 個（TR/v3:L12-13）、同組間隔 ≥ 0.12 s（同）、新資訊完成態 ≥ 1.2 s、最後一幕 ≥ 1.5 s、中間步驟可 0.6 s（定案） | FR-082、FR-063 |
| 001 | `docs.test`：custom 範例檔頭的 6 小節名稱與 R7.5 一致；`grep` 斷言加 `相減`（002 SC-004） | FR-021 |
| 007 | `dev/check-all.mjs` 跑 `node --test dev/tests/examples.test.mjs` 時確認整合測試沒有被 skip（要有 ffmpeg 與 Chrome） | FR-072 |
| 007 | 收本線的 SC-004 基準報告（改寫前 4 支範例的新規則命中），存成 `dev/loop/003-before.md`（`dev/loop/**` 歸 007） | SC-004、tasks T025 |

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：`node --test dev/tests/motion.test.mjs dev/tests/audit.test.mjs dev/tests/examples.test.mjs dev/tests/icons.test.mjs` 全過，在作者 Mac 上 0 個 skip。
- **SC-002**：9 支範例在整合專案裡 `build.mjs --check` 0 ✖；`audit.mjs` 0 ✖、`unpositioned`／`title-gap`／`overlap`／`nowrap`／`slack`／`vbalance`／`padding`／`line-height`／`density`／`stagger`／`hold`／`tail` 0 ⚠。
- **SC-003**：`grep -nE "相減|填回 .*data-duration|2 段 custom|一起進場|進場 0\.3–0\.5|const D =" shared/template/custom/*.html` 沒有輸出。
- **SC-004**：把現行（改寫前）的 4 支範例放進整合專案跑 audit，新規則至少抓到：x-process 的 `density`、`padding`；x-before-after 的 `density`、`stagger`、`vbalance`、`padding`；x-numbers 的 `vbalance`（證明規則真的會響；在改寫前先跑一次存成 `dev/loop` 紀錄，由 007 收）。
- **SC-005**：亂序 snapshot：9 支各 3 個時刻，亂序與順序截圖逐像素相同。
- **SC-006**：`audit.mjs` 一段的耗時增加 ≤ 1.5 s（靜止取樣最多 8 次＋一次動作清單；現行 2–5 s，`AU:11`）。
- **SC-007**：弱模型試跑（007 `dev/loop`）：只照 x-warnings 檔頭「要改的地方」與「綁句欄位」改一支新的，第一次 audit 0 ✖。

## Assumptions

- GSAP 3 的 `fromTo` 把起點值存在 `tween.vars.startAt`，巢狀時間軸用 `getChildren(true, true, false)` 拿得到所有 tween（2026-10-31 用 `kit/gsap.min.js` 在 Node 實測：起點、巢狀起點 4.2 s、`set` 的 0 長度都正確）。
- SM 的 `stagger` 是每個元素各自一個 tween（SM:151、SM:165），所以 FR-051 拿得到每個元素各自的出現時刻。
- HyperFrames 0.8.221 執行子合成 script 時 `window.__cues`（head 同步 script）已經存在（002 Assumptions 第 2 條）。
- audit 的頁面是 1920×1080、deviceScaleFactor 1，`getBoundingClientRect` 就是畫面座標（AR:10）。
- `data-layout-allow-overflow` 會讓子孫不判撐破與裁切（AP:187 用 `closest`），x-ui-mock 的畫布靠它。
- 9 支範例的版面數字是靜態估算（字寬 52 px 一個中文字、kit 行高 `kit/scene.css:218-231`），實作時以 audit 實量為準；估算和實量差超過 4 px 的地方在 tasks 裡記錄。

## 待主代理裁決

1. **新檔 `tools/lib/custom-preview.mjs` 的所有權**：它是預覽頁產生器，和 003 的 custom 範例綁在一起，建議歸 003；另一條路是整段寫進 002 的 `lib/main.mjs`（本線給函式規格，002 實作）。請裁決；本線兩種都可以。
2. **cues.md 的補充**：本線已照 cues.md v1 對齊（對齊表）；另有 3 項補充（參數型別丟錯、`__cueErrors` 去重、`P.dur()` 推錯的原文）要 002 收進契約。002 不收的話，本線拿掉補充、只照 cues.md 原文做。
3. **預覽頁和 cues.md §5 的寫法不同**：cues.md 說 index.html「直接開 `custom/x-*.html`」，但 x-*.html 的內容在 `<template>` 裡，直接開是空白頁；本線改成 `--gallery` 產生 `preview/x-*.html`（FR-061，需要 002 在 `runGallery` 加一圈）。請確認這個分工。
4. **間隔門檻用 0.12 s（TR/v3）還是 0.15 s（定案的清單間隔）**：本線 ⚠ 門檻用 0.12（量的是所有新元素），改法建議寫 0.15（清單）；兩個數字都進 style.md。若主代理要單一數字，建議 0.15（更嚴、和定案一致），本線改 FR-052 一個常數即可。
5. **嚴重度**：新增的 ✖ 只有「未定位頂層」「標題壓到內容」「綁句失敗」；其餘版面與節奏都是 ⚠。依據：作者 agent-skills 把間距不足、重疊列為不合格（`OV/AW:L66`），但本工作區 ✖ 會讓 AI 卡住、改不出來時停下來問；先用 ⚠ 跑一輪 `dev/loop`，誤報率低再升級。請裁決是否接受。
6. **`P.morph` 預設 `back.out(1.15)`**（SM:239、R7.3 方法表）和 TR/v3「不用 back.out」衝突：本線新範例一律明寫 `ease: 'power2.inOut'`，不改 SM 預設（改預設會讓舊專案重 build 後動作變了）。要不要另開一條改預設？
7. **子母畫面禁入區的數字**：派工單寫 x 1344–1888、y 617–951，但工作區的程式（`lib/media.mjs` 的 `PIP_ZONE`）與文件（R4.1、R8 #17，R:618）都是 x 1424–1888、y 581–951；1344／617 只出現在 `audit.mjs` 檔頭註解（AU:19，寫錯，本線 FR-059 改成照 `PIP_ZONE`）與 agent-skills（`OV/AW:L228`）。本線照程式；新範例右緣 1300、下緣 ≤ 870，兩組都避開。請確認不要改 `PIP_ZONE`。
8. **契約檔名**：本線寫 `specs/contracts/cli-003.md`（主代理 2026-10-31 裁決「各寫 cli-00N.md、001 第二輪合併」）。

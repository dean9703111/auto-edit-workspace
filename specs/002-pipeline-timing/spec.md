# 規格：002 pipeline-timing（時間軸、版面接法與流程工具）

**Feature Branch**: `002-pipeline-timing`

**Created**: 2026-10-31

**Status**: Draft（只寫規格與契約，這一輪不實作）

**Input**: 主代理派工「工作線 002 pipeline-timing」：章節空檔、無畫面空白偵測、rhythm、cue 注入、PiP 飛入／三層淡出、旁白段擦入、`media.mjs cutpoints／ng-snap／srt-split`、`status.mjs`、`caps.mjs`、hyperframes 版本釘住、結尾配樂、音效政策接線、look 接線、`--margin 0.15sec`。

**出處縮寫**：`01`＝分析報告 `01-jianying-technique.md`；`02`＝`02-skill-gap.md`（G 編號）；`00`＝`00-phase1-report.md`；檔名:行號＝工作區現行程式（2026-10-31，commit 22caf6c）；`README`＝`specs/README.md`「已定案的規則」。

**本線的契約**：`specs/contracts/check-json.md`、`cues.md`、`plan-fields.md`、`cli-002.md`。要併進文件的原文在 `specs/002-pipeline-timing/docs.md`。

---

## 範圍對照

| # | 主代理列的範圍 | 本規格的 FR | 來源 |
|---|---|---|---|
| 1 | 章節空檔（剪乾淨保留 3.0 s、plan ⚠、章節期間字幕清空、前段墊底） | FR-001–FR-010 | G01、01 P1-1、§2.7、附錄 C |
| 2 | 無畫面空白偵測 | FR-011–FR-014 | G05、01 P0-1、P1-3、§3.5 |
| 3 | rhythm 設定 | FR-015–FR-016 | G04 ①③ |
| 4 | cue 注入＋自動段長 | FR-017–FR-021 | G02（build 端） |
| 5 | PiP 飛入與三層淡出 | FR-022–FR-028 | 01 P0-4、P0-5、§2.2、§3.6 |
| 6 | 旁白段擦入 | FR-029–FR-034 | 01 P0-6、§2.5、§3.2 |
| 7 | `media.mjs cutpoints`、`srt-split` | FR-035–FR-041 | G03、G17 |
| 8 | `status.mjs`、`caps.mjs` | FR-042–FR-048 | G10、G07、02 §5.5、`contracts/stop-points.md` §4 |
| 9 | hyperframes 版本釘住 | FR-049–FR-051 | README 定案、00 §8 第 15 題 |
| 10 | 結尾配樂 | FR-052–FR-055 | 01 P2-2、§2.8、G20；`contracts/sfx.md` §6 |
| 11 | 音效政策接線 | FR-056–FR-061 | G18、01 P0-7、§2.7；`contracts/sfx.md` §4、§5、§7；`cli-005.md` §3 |
| 12 | look 接線 | FR-062–FR-065 | `contracts/look.md` §2.2、§3、§4；`cli-006.md` §7 |
| 13 | `--margin 0.15sec` | FR-066 | G16 |
| — | `--check --json` 契約、004 的介面 | FR-067–FR-072 | 主代理派工；001、004、005、006 spec「請 002 加」 |

不在範圍：P1-5「錄影比口播快時插定格」（media 段的定格屬 004 的 media 欄位；custom 改用 cue 注入綁句後不再需要定格對時）；G19 業配 profile；`edit.pads` 只保留欄位名（P2，FR-010）。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 章節轉場不壓口播（Priority: P1）

作者講到新章節，畫面要停 2.5 s 章節幕，人聲不能在章節幕底下繼續講；章節期間沒有字幕；前一段的畫面停在完成態，章節幕淡入時墊在底下，不會露出一閃的講者。

**Why this priority**: 02 G01 是作者明文否決過、而工作區會重犯的 P0（`plan.mjs:285-286` 在空檔 < 2 s 時「從 #N 起點開始蓋 2.5s，人聲在下面繼續」）。

**Independent Test**: 用固定的 `cuts.md`＋auto-editor v1 JSON 跑 `media.mjs ng-snap`，比對印出的 `--add-in` 範圍；用 `plan.test.mjs` 的章節案例比對起點、⚠ 文字、字幕被清掉的區間。

**Acceptance Scenarios**:

1. **Given** `work/cuts.md` 的「章節空檔」表有一列「第一句 0:41.20」，原片在那句前有 4.0 s 停頓，**When** 跑 `media.mjs ng-snap --project projects/範例`，**Then** 印出的指令含 `--add-in "38.35sec,41.05sec"`（＝靜音段終點 41.05 往前 3.0 − 2 × 0.15＝2.70 s，FR-003 公式），章節空檔表那一列的「原始停頓」是 4.00s、「剪完空檔」是 3.00s（版面照 `cli-002.md` §2）。
2. **Given** 同一章原片停頓只有 1.2 s，**When** 跑 ng-snap，**Then** 印 `⚠ 章節 1「痛點」原始停頓只有 1.20s（< 3.0s）…`，`--add-in` 涵蓋整段停頓，結束碼 0。
3. **Given** plan.json 的章節 `"at": "#11"`、#11 前的空檔 0.5 s，**When** 跑 `build.mjs --check`，**Then** 出現一則 ⚠（不是報告括號裡的 note），文字含 `→ 回剪乾淨保留 3 秒停頓` 與 `media.mjs ng-snap --project projects/範例`。
4. **Given** #11 前的空檔 3.2 s，**When** build，**Then** 章節 2.5 s 置中在空檔裡（前後各 0.35 s），報告寫 `放在 #11 前的空檔（3.20s），前後各留 0.35s`。
5. **Given** 章節壓到 #10 的結尾 0.3 s，**When** build，**Then** `compositions/captions.html` 裡 #10 的關閉時間＝章節起點，章節的 2.5 s 內沒有任何字幕是可見的。
6. **Given** 章節前一段是 04a 全畫面清單、兩段相隔 ≤ 1.0 s，**When** build，**Then** 04a 延長到章節起點＋0.5 s、不淡出；章節淡入 0.5 s；04a 的子母畫面在同一個 0.5 s 內淡出。

---

### User Story 2 - 子母畫面從臉飛到角落、三層一起淡出（Priority: P1）

從講者滿版切到子母畫面時，觀眾看到講者的臉直接縮進右下角；連續兩段子母畫面中間小窗不閃；回到講者時幕、小窗、外框一起淡出。

**Why this priority**: 01 P0-4、P0-5（兩集全部的「露臉 → 子母畫面」都這樣做：esim 18.2、73.033、211.5 s；PPA 31.733、77.667、168.733、272.1 s）；工作區現在小窗是跟著幕一起淡入（`main.mjs:91-95`）。

**Independent Test**: `plan.test.mjs` 比對每個子母畫面片段的 `enter`／`exit` 判斷；`build.test.mjs` 比對 index.html 產生的 tween（起訖值、時間、ease）；整合驗證用 snapshot 四格（FR-023）。

**Acceptance Scenarios**:

1. **Given** s03 是 04a、前一刻講者滿版（前面是透明字卡或沒有卡），**When** build，**Then** `#pip-s03` 有一個 0.7 s、ease 為 `SceneMotion.pushEase` 的 tween，起始框＝`pipGeometry().crop`（1920×1080 座標），終點＝右下角 432×324；`#pipf-s03` 在 +0.7 s 起 0.3 s 淡入；`#pip-s03` 不在幕的 0.5 s 淡入 tween 裡。
2. **Given** s04 前一刻是章節幕或只有聲音的區間，**When** build，**Then** s04 的小窗與外框原地淡入 0.4 s，沒有位移 tween。
3. **Given** s03（04a）與 s04（04b）相接，**When** build，**Then** `#pip-s03` 的 `data-start＋data-duration`＝`#pip-s04` 的 `data-start`（差 0），兩個 `<video>` 的 left／top／width／height 相同，中間沒有任何 opacity tween。
4. **Given** s04 結束後回講者，**When** build，**Then** 幕、`#pip-s04`、`#pipf-s04` 在同一個 0.5 s 淡出 tween 裡。

---

### User Story 3 - 旁白段每一秒都有畫面，錄影與動畫幕擦入擦出（Priority: P1）

只有聲音的區間（`素材/聲音/` 接進主軌、rough.mp4 全黑）一定被 media 段或不透明全幕蓋住；從錄影切到動畫幕時，動畫幕 0.45 s 由左往右擦入，底下的錄影繼續播 0.5 s，看得到的是錄影不是黑底。

**Why this priority**: 01 P0-6（esim 中段 70 % 片長是這種接法，A→B 15 次、B→A 15 次，全部 0 s 空檔）。

**Independent Test**: `plan.test.mjs` 用假的 `voiceOnly` 區間測擦入／擦出的判斷、pre-roll／post-roll 的夾值與退回硬切；`build.test.mjs` 比對產生的 `clip-path` tween。

**Acceptance Scenarios**:

1. **Given** 只有聲音的區間 60–90 s，m01（media）60–70 s 接 s05（04c）70–80 s，**When** build，**Then** s05 的 host 有 `clipPath` 從 `inset(0% 100% 0% 0%)` 到 `inset(0% 0% 0% 0%)`、0.45 s 的 tween；m01 的錄影多播 0.5 s（`postroll: 0.5`）；s05 的 z-index 是 31。
2. **Given** s05 接 m02（media）、m02 的 `in`＝0.2、`speed`＝1，**When** build，**Then** 不擦出（硬切），報告寫 `不擦出：m02 的 in 只有 0.20s，提早不了 0.5s → in 改 ≥ 0.5 才有擦出（現在硬切）`。
3. **Given** 只有聲音的區間有 0.3 s 沒被蓋住，**When** `--check`，**Then** ⚠（舊版 0.5 s 以下不報）；沒被蓋住 1.2 s 時 ✖（同舊版）。

---

### User Story 4 - 情境動畫綁句不用手算（Priority: P1）

AI 寫第二層情境動畫時直接寫 `P.at('#21')`、`P.at('#21@剪輯清單', 0.2)`，不用拿 `--check` 報告的起點和 rough.srt 相減，也不用把段長手填回 `data-duration` 與 `const D`。

**Why this priority**: 02 G02（P0）；現在 4 支範例檔頭都教人手算（`custom/x-process.html:18-25`；R7.2 第 4 步 `USAGE-reference.md:486`；R7.3 `:543`）。

**Independent Test**: `build.test.mjs` 檢查 index.html 有 `window.__cues`、內容等於 `contracts/cues.md` 的格式；`timing.test.mjs` 檢查 `P.at` 字面值被 build 用 `time.mjs` 算好放進 `refs`，找不到句號／詞時 `--check` ✖ 並附原文。

**Acceptance Scenarios**:

1. **Given** x01（custom，`compositions/x-process.html`）從 #17（40.0 s）開始、檔內寫 `P.at('#18')`，#18 起點 43.2 s，**When** build，**Then** index.html 的 `window.__cues.segs.x01.refs['#18']`＝43.2、`segs.x01.start`＝40.0（段內秒數 3.2 由 `P.at` 在瀏覽器裡相減）。
2. **Given** 檔內寫 `P.at('#99')`、字幕只有 45 句，**When** `--check`，**Then** ✖ `[x01 custom] compositions/x-process.html 的 P.at('#99')：字幕沒有第 99 句（rough.srt 共 45 句，句號 1–45）…`。
3. **Given** 使用者在剪輯台把 #18 的起點改晚 0.5 s，**When** 重跑 build（不改 x-process.html），**Then** `refs['#18']` 跟著變成 43.7。
4. **Given** plan.json 把 x01 的 `to` 延長 3 s，**When** build，**Then** host 的 `data-duration` 與 `segs.x01.D` 都是新長度，`--check` 不再要求手填 `data-duration`。

---

### User Story 5 - 連續覆蓋：沒有畫面的空白會被報出來（Priority: P1）

作者的規則是「從頭到尾每一段口播都有畫面」（`shared/style.md:45`）。`--check` 列出沒有任何卡片、動畫或素材的區間，剪輯台把它畫在時間軸上；預設不再印和 style.md 衝突的兩條 ⚠。

**Why this priority**: 02 G05（P0：`plan.mjs:517` 只在空白 0.01–3 s 提醒，> 3 s 完全不報）、G04 ①③（`plan.mjs:533-534`、`:517` 和 `style.md:58`、`:64` 衝突）。

**Independent Test**: `plan.test.mjs`：刪掉一段後 `uncovered` 出現那段、補回後消失；`rhythm` 兩種值的 ⚠ 有無。

**Acceptance Scenarios**:

1. **Given** 範例 plan 刪掉 s03（41.2–47.9 s），**When** `--check`，**Then** 報告有 `沒有畫面的區間（> 1.0s）：0:41.20–0:47.90（6.70s）；共 6.70s，佔口播 …%`，`--check --json` 的 `uncovered` 有 `{ "start": 41.2, "end": 47.9, "outStart": 41.2, "outEnd": 47.9, "len": 6.7 }`。
2. **Given** plan.json 沒寫 `rhythm`，**When** `--check`，**Then** 不印「開場前 30 秒已經有 N 張」「之間只露臉 Ns（< 3s）」；寫 `"rhythm": "spaced"` 才印。
3. **Given** s04 結尾和 s05 起點之間空 0.4 s，**When** `--check`（continuous），**Then** ⚠ `[s05 …] 和前一段 s04 之間只空 0.40s，講者會閃一下 → s04 改 "to": "#21"（0 秒相接），或拉開到 1.0s 以上`。

---

### User Story 6 - 剪乾淨的秒數都由工具算（Priority: P2）

AI 不再從 `--export v1` 的幀數累加剪接點、不再手算字幕拆句的時間、不再手算 NG 起訖對齊靜音。

**Why this priority**: 02 G03、G17、G16；AGENTS.md:65、:68 現在要 AI 手算，又在 :72-74 禁止音訊分析，弱模型兩頭為難。

**Independent Test**: `media-cli.test.mjs`（新）：固定的 v1 JSON → cutpoints.json；固定的 SRT → srt-split 的輸出與備份；不需要 auto-editor 與 whisper。

**Acceptance Scenarios**:

1. **Given** `work/cuts.v1.json` 的 chunks 是 `[[0,64,1],[64,75,99999],[75,90,1],[90,116,99999],[116,180,1]]`、rough.mp4 30 fps、cuts.md 的 NG 是 3.0–3.9 s，**When** 跑 `media.mjs cutpoints`，**Then** `work/cutpoints.json`＝`{ "cuts": [ { "at": 2.133, "kind": "pause" }, { "at": 2.633, "kind": "ng" } ] }`。
2. **Given** rough.srt 的 #12 是 19 字、中間有逗號，**When** `media.mjs srt-split --dry-run`，**Then** 印拆句表、不寫檔；去掉 `--dry-run` 後 #12 變兩則、後面句號 +1、原檔備份成 `rough.srt.bak-<時間戳>`。

---

### User Story 7 - 換 session 接得上、能力看得到、版本對得上（Priority: P2）

使用者隔天說「繼續 projects/EP2」，AI 只跑 `status.mjs` 就知道在哪一步、等哪個停點；換背景前 `caps.mjs` 一次列出 codex／mmx／Chrome／ffmpeg／HyperFrames；HyperFrames 版本固定在 0.8.221。

**Why this priority**: 02 G10、G07；README 定案「hyperframes 版本：根目錄 package.json 釘 0.8.221」。

**Independent Test**: `status.test.mjs`、`caps.test.mjs`（新）用暫存專案資料夾與假的指令執行器（不呼叫真的 codex／mmx）。

**Acceptance Scenarios**:

1. **Given** `work/storyboard.md` 比 `work/hyperframes/plan.json` 新、`work/製作進度.md` 停點紀錄最後一列是「③ 分鏡表｜待回覆」，**When** `node shared/template/tools/status.mjs --project projects/範例`，**Then** 印 `目前在：剪好看／停點 ③ 分鏡表（待回覆）`、`下一步：…`、`下一個停點：③ 分鏡表`、`待回覆停點：③ 分鏡表`、`下一輪回饋編號：r1`。
2. **Given** codex 的執行檔壞掉（spawn ENOENT）、mmx 已登入，**When** `caps.mjs`，**Then** 能力表 codex 一列是「沒有安裝或壞掉」並附錯誤第一行、mmx 一列「可用」，依據欄不印 API key。
3. **Given** `node_modules/hyperframes` 是 0.8.216，**When** build，**Then** 第二行印 `⚠ HyperFrames 0.8.216 和 package.json 釘的 0.8.221 不同 → 在工作區根目錄跑 npm install`。

---

### User Story 8 - 片尾配樂、音效政策、調光瘦臉接進 build（Priority: P3）

plan.json 寫一行 `outro` 就有片尾配樂；音效每集上限、每分鐘密度、附加音效不受 3 秒規則都由 build 檢查；開了 look 的專案，底片自動換成瘦臉後的版本、重新編碼時順手調光。

**Why this priority**: 01 P2-2；G18、G20；資料（音效檔、LUT、模型）與演算法由 005、006 提供（`contracts/sfx.md`、`contracts/look.md`），本線只接線。

**Independent Test**: `plan.test.mjs` 跑 `contracts/sfx.md` §10 的共用 fixture；`build.test.mjs` 用 006 的 `ensureLook` stub 回傳另一個檔名，檢查重新編碼的來源與戳記。

**Acceptance Scenarios**:

1. **Given** `"outro": { "from": "#187" }`、成片 498.4 s、#187 起點 476.2 s、`bgm-outro.wav` 40 s，**When** build，**Then** index.html 有 `<audio id="bgm-outro" … data-start="476.2" data-duration="22.2" … data-volume="1">`，src 是 `renderBgmClip` 產生的 `assets/bgm-outro-<hash>.wav`；報告有 `結尾配樂：bgm-outro 從 7:56.20 起播 22.2 秒（…）`。
2. **Given** 4 段 15 quote `tone: "warn"`（預設 thunder、`maxPerVideo` 3），**When** `--check`，**Then** 一則 ⚠ `音效 thunder 用了 4 次，每集上限 3 次（…）`，四顆都保留；`--check --json` 的 `sfxCount.thunder`＝4。
3. **Given** `kit/look.json` 瘦臉 0.6、`work/rough-look.mp4` 是最新的，**When** build，**Then** 重新編碼的來源是 `work/rough-look.mp4`、戳記有 `look` 鍵、報告印 `講者瘦臉：0.6（work/rough-look.mp4；…）`；look 關掉時戳記和舊版一字不差。

### Edge Cases

- **章節前後是 media 段**：前段墊底用 media 的 post-roll（錄影繼續播 0.5 s），不改 media 的 `end`（避免觸發「整張幕重疊」✖，`plan.mjs:487-489`）；錄影剩下的長度不夠 0.5 s 時，章節照常淡入、前段在章節起點硬切（報告寫明）。
- **章節在影片開頭（第一句就是章節第一句）**：沒有前一句，空檔＝第一句起點（`plan.mjs:284` 現行算法）；ng-snap 的 `--add-in` 起點夾到 0。
- **ng-snap 的 NG 和章節保留區重疊**：保留區起點改成 NG 終點，印 ⚠；保留區被吃光（< 0.5 s）時不加 `--add-in`，印 ⚠ 交使用者決定。
- **cuts.md 的 NG 列標了「待確認」**：不放進指令，印 ⚠ 列出列號（`contracts/stop-points.md` §5「待確認的列不剪」）。
- **子母畫面起點時，底片正被 03 側邊欄右移或 `edit.joins` 的 punch 放大**：不飛入，改原地淡入 0.4 s（起始框對不上臉）。
- **子母畫面片段 < 1.0 s**（0.7 s 飛入＋0.3 s 外框）：改原地淡入。
- **子母畫面在 media 段中途因為只有聲音的區間被切開**：洞前的片段原地淡出 0.4 s、洞後的片段原地淡入 0.4 s；剪接點（`edit.cuts`）切開的片段不淡（現行 `splitAtJoins`，`edit.mjs:179-189`）。
- **同一支 `x-*.html` 登記兩次**：✖（cue 注入以段 id 為鍵，但子合成的 `data-composition-id` 會重複，`P.at` 無法分辨是哪一段）。
- **custom 檔裡的 `P.at` 用變數組字串**（`P.at('#' + n)`）：build 掃不到，執行期只支援 `#N`／`#Ne`／`#N±秒`，`@詞` 會記進 `window.__cueErrors`（`contracts/cues.md` §4）。
- **有 `edit.cuts`**：所有計算在成片秒數做；`--check --json` 的既有欄位換回 rough.mp4 秒數（`plan.mjs:597-599` 既有慣例），`out` 與 `outStart`／`outEnd` 是成片秒數；整句被剪掉的句子 `cues[N]` 起迄相同。
- **`--test` 測試片段**：`window.__cues` 的句子時間和段起點都跟 test-clip 的 `data-start` 同一基準（一起減掉片段起點），段內秒數不變（`contracts/cues.md` §2）。
- **rough.srt 沒有任何句子在某段的範圍裡**：uncovered 只在「第一句起點到最後一句結尾」之間算，片頭片尾的空白不列。
- **多個子代理同時跑 `--check`**：見「回覆 001 的問題」第 1 條。

---

## Requirements *(mandatory)*

### 常數表（本線新增或改變的數字；實作時集中在檔頭常數，USAGE 引用時寫「照 style.md」）

| 名稱 | 值 | 單位 | 用在 | 出處 |
|---|---|---|---|---|
| `CH_KEEP` | 3.0 | s | ng-snap：章節第一句前保留的停頓 | G01（`JY/EP:L17`） |
| `CH_MIN` | 2.0 | s | plan：空檔 < 2.0 s 時章節會壓人聲 → ⚠ | `plan.mjs:285`（沿用） |
| `CH_D` | 2.5 | s | 章節幕長度 | `scenes/01-chapter/scene.json` `duration.fixed` |
| `CH_PAD` | 0.15 | s | 置中時前後至少各留這麼多 | G01「下一句起音在章節結束後 ≥ 0.15s」 |
| `CH_BRIDGE` | 1.0 | s | 章節和前／後一段相隔 ≤ 這個值就墊底接上 | 01 §2.7（章節結束→下句 0–0.5 s；建議初值） |
| `FADE` | 0.5 | s | 不透明幕淡入淡出、墊底長度 | `plan.mjs:36`、`main.mjs:16`（沿用；01 §2.7 0.4–0.5） |
| `UNCOVERED_MIN` | 1.0 | s | 沒有畫面的區間超過才列 | G05（建議初值） |
| `FLASH_MAX` | 1.0 | s | continuous 時相鄰兩段空 0.05–1.0 s → ⚠ | 01 P0-1（原文 0.05–1.5 s，和 UNCOVERED_MIN 合併成一條界線；建議初值） |
| `FLASH_MIN` | 0.05 | s | 比這個小算 0 s 相接 | 01 P0-1 |
| `VOICE_ERR` | 1.0 | s | 只有聲音的區間沒被蓋住 > 1.0 s → ✖ | `plan.mjs:33`（沿用） |
| `VOICE_WARN` | 0.1 | s | 沒被蓋住 > 0.1 s → ⚠（舊值 0.5） | 01 P0-6「每一秒都要被蓋住」；30 fps 的 3 格 |
| `PIP_FLY` | 0.7 | s | 子母畫面飛入；ease＝`SceneMotion.pushEase`（9 點 easeInOutSine） | 01 §2.2；`main.mjs:17` PUSH；`scene-motion.js:20` |
| `PIP_FRAME_AT` | 0.7 | s | 外框淡入起點（相對片段起點） | 01 §2.2 |
| `PIP_FRAME_IN` | 0.3 | s | 外框淡入長度 | 01 §2.2（esim 0.15、PPA 0.3；建議初值） |
| `PIP_FADE` | 0.4 | s | 子母畫面原地淡入／淡出 | 01 §2.2（PPA `渐显／渐隐 0.4`） |
| `PIP_FLY_MIN` | 1.0 | s | 片段短於這個不飛入 | `PIP_FLY`＋`PIP_FRAME_IN` |
| `WIPE` | 0.45 | s | 旁白段不透明幕擦入／擦出；擦入 `sine.out`、擦出 `sine.in` | 01 §2.5、§3.2（seg26 alpha 0.25 s＝0.74） |
| `ROLL` | 0.5 | s | 擦入時底下錄影多播、擦出時錄影提早開始 | 01 §2.5（15/15 段） |
| `NG_SNAP` | 1.0 | s | ng-snap：NG 起訖往前後找停頓的範圍 | AGENTS.md:67「逐字稿…常比嘴巴早 1 秒左右」（建議初值） |
| `ONSET_EARLY`／`ONSET_LATE` | 0.6／1.5 | s | ng-snap：章節第一句開口點的搜尋窗 | `media.mjs:298-299`（snap-srt 的 early／late） |
| `NG_KIND_OVERLAP` | 0.3 s 或 NG 長度 × 0.5（取小） | s | cutpoints：剪掉的段和 NG 重疊到這麼多才算 `ng` | 建議初值 |
| `SRT_MAX` | 18 | 字（全形 1、半形 0.5） | srt-split | `shared/style.md`「字幕」；`captions.mjs:29` |
| `outro.fadeOut` 預設 | 跟 `kit/sfx.json` 的 `bgm-outro.fadeOut`（2.0） | s | 結尾配樂淡出；可在 plan.json 覆寫（例 1.85） | `contracts/sfx.md` §6.2（005 建議初值）；01 §2.8（剪映講者畫面與聲音淡出 1.851 s） |
| `HF_PIN` | 0.8.221 | 版本 | 根目錄 `package.json` | README 定案 |
| `AE_MARGIN` | 0.15sec | s | auto-editor `--margin` | G16（auto-editor 29.3.1 `--help` 預設 `0.2s`） |
| `CAPS_TIMEOUT` | 15 | s | caps.mjs 每個探測指令的逾時 | 建議初值 |

### Functional Requirements

每條後面的「驗：」是驗收方式（測試檔＋測試名稱的關鍵字，或可執行的指令）。測試檔都是本線擁有的 `dev/tests/*.test.mjs`。

#### A. 章節空檔（範圍 1）

- **FR-001**（`work/cuts.md` 機器可讀格式）：ng-snap 與 cutpoints 讀 `work/cuts.md` 的兩張 Markdown 表，用**表頭**辨認（不看標題文字）：
  - NG 表：表頭含「時間碼」與「原因」兩欄（`contracts/stop-points.md` §1 停點 ① 的四欄：時間碼｜內容｜原因｜待確認）。「時間碼」寫 `起–迄`（`–`、`-`、`~`、`～` 都可），每個時間是 `m:ss.ss`、`h:mm:ss.ss`、`ss.ss` 或 SRT 的 `hh:mm:ss,mmm`；是**原片**（`work/main.mp4`，沒有接主軌時是唯一那支真人錄影）的秒數。
  - 章節空檔表：表頭含「章節」與「第一句」兩欄，另有「時間碼」欄（第一句的起點；寫範圍時取起點）。
  - 「待確認」欄不是空白、`—`、`-`、`否` 的列不放進指令。
  - 驗：`media-cli.test.mjs`「cuts.md：兩張表用表頭辨認、四種時間寫法、待確認的列略過、表格外的文字不影響」。
- **FR-002**（`media.mjs ng-snap`）：讀 FR-001 的兩張表；用 auto-editor 自己判斷靜音（`auto-editor <原片> --edit <門檻> --margin <margin> --export v1 -o work/.cache/ng-snap.v1.json`，結果依原片大小＋修改時間＋門檻＋margin 快取），把 NG 起點吸到最近的靜音段**起點**、終點吸到最近的靜音段**終點**（只在 ±`NG_SNAP` 1.0 s 內找）；印出調整表與三行可以直接複製的 auto-editor 指令（`--preview`、輸出 `work/rough.mp4`、`--export v1 -o work/cuts.v1.json`），三行的 `--edit`、`--margin`、`--cut-out`、`--add-in` 完全相同。不寫 `work/.cache/` 以外的檔。指令格式與訊息原文照 `cli-002.md` §2。
  - 驗：`media-cli.test.mjs`「ng-snap：用 --v1 給固定的靜音分析，NG 吸附到靜音邊界、找不到停頓時 ⚠ 原值不動、三行指令參數一致、不寫 work/.cache 以外的檔」。
- **FR-003**（章節 `--add-in` 公式）：章節第一句的開口點＝靜音段終點 `b`（auto-editor 的靜音段已扣掉 margin，`b`＋margin＝實際開口），找法依序（round 2，A-01）：① 包含表上時間碼的靜音段；② 表上時間之後 6 s 內第一個靜音段終點；③ 表上時間前 0.6 s 內最後一個靜音段終點。開口比表上時間晚超過 1.5 s 時印「章節 N 時間碼比開口早 X s，已改用開口 m:ss.ss」（逐字稿常把那一句的起點標在停頓裡）；`--add-in` 範圍＝`[max(0, b − (CH_KEEP − 2 × margin)), b]`，讓剪完的空檔＝`CH_KEEP` 3.0 s（前一句尾巴的 margin＋保留區＋開口前的 margin；margin 0.15 s 時保留區 2.70 s）。原始停頓（靜音段長＋2×margin）< 3.0 s 時：`--add-in` 改成整段靜音 `[a, b]`、印 ⚠「原始停頓只有 Ns」並在調整表標「空檔不足」；三種都找不到時不加 `--add-in`、印 ⚠「不在停頓裡、之後 6 秒內也找不到停頓」。
  - 驗：`media-cli.test.mjs`「ng-snap 章節：停頓 4.0 s、margin 0.15 → add-in 長 2.70 s；停頓 1.2 s → 整段保留＋⚠；找不到停頓 → ⚠ 不加」。
- **FR-004**（NG 與章節保留區衝突）：某章的保留區和某列 NG 的 `--cut-out` 重疊時，保留區起點改成 NG 終點並 ⚠；剩下 < 0.5 s 就不加這章的 `--add-in`，⚠ 交使用者決定。
  - 驗：`media-cli.test.mjs`「ng-snap：NG 緊接章節第一句之前時，保留區從 NG 終點開始」。
- **FR-005**（plan 的章節 ⚠）：`plan.mjs` 章節空檔 < `CH_MIN` 2.0 s 時，從現行的報告 note（`plan.mjs:286`）改成 ⚠，原文照 `cli-002.md` §1.2「章節壓到人聲」；章節位置仍是「從 #N 起點蓋 2.5 s」（行為不變，只把提醒升級）。
  - 驗：`plan.test.mjs`「章節：空檔 < 2 s → ⚠ 帶 ng-snap 指令與專案名；note 不再出現『人聲在下面繼續』」。
- **FR-006**（章節置中）：空檔 ≥ `CH_D`＋2×`CH_PAD`（2.8 s）時，章節置中：`start = 前一句結尾 + (空檔 − 2.5) / 2`；2.0 s ≤ 空檔 < 2.8 s 時維持現行 `start = #N 起點 − 2.5`（`plan.mjs:285`）。報告 note 照 `cli-002.md` §1.2。
  - 驗：`plan.test.mjs`「章節轉場：空檔 3 s → 置中（4.25）；空檔 2.5 s → 結尾貼齊 #N；空檔 0.5 s → 從 #N 起點」（取代現行 `plan.test.mjs:76-82` 的第一個斷言 4.5）。
- **FR-007**（章節期間不放字幕）：`buildCaptions` 收 `blackout: [[起, 迄], …]`（成片秒數；每個章節 `[start, start + 2.5]`，不含墊底延長的部分），每則字幕的顯示區間扣掉 blackout，剩下 < 0.05 s 的片段不顯示（沿用 `captions.mjs:45`）。被裁到的字幕列在章節那一列的報告 note：`字幕避開章節：#10 提早 0.30s 收、#11 晚 2.50s 出現`。
  - 驗：`plan.test.mjs`「章節期間字幕清空：壓到的那則提早收或晚出現，章節 2.5 s 內 captions.html 沒有任何 set visible」。
- **FR-008**（章節墊底）：相鄰判斷對章節放寬到 `CH_BRIDGE` 1.0 s：
  - 前一段是不透明幕（04、custom fullscreen、fx bg 非 none）、和章節相隔 ≤ 1.0 s：前一段延長到「章節起點＋`FADE` 0.5 s」、不淡出；章節照常淡入 0.5 s（取代現行「不透明接不透明＝硬切」，`plan.mjs:359-368`）。前一段的子母畫面在延長的那 0.5 s 內淡出（FR-026）。
  - 前一段是 media：用 post-roll 0.5 s（FR-032 的機制），不改 media 的 `end`。
  - 前一段是透明卡、相隔 ≤ 1.0 s：照現行「停在完成態、被幕蓋過」（`plan.mjs:376-385`），容許值從 0.1 s 放寬到 1.0 s。
  - 章節後一段是不透明幕、相隔 ≤ 1.0 s：章節延長到「後一段起點＋0.5 s」、不淡出；後一段淡入 0.5 s（PPA 做法：下一段 HF 在章節上 `渐显 0.4`，01 §2.7）。
  - 「整張幕同一時間只能有一張」的重疊檢查（`plan.mjs:478-496`）對這種墊底延長放行（容許＝`FADE`）。
  - 驗：`plan.test.mjs`「章節墊底：04a→章節、章節→04b、media→章節、lower-third→章節（相隔 0.3 s）各自的 end／fadeIn／fadeOut；不觸發整張幕重疊 ✖」。
- **FR-009**（情境預設音效，照 `contracts/sfx.md` §7）：`scenes/01-chapter/scene.json` 的 `sfx.main` 改 `{ "sound": "chapter", "at": "titleAt" }`（章名落定那一格＝段起點＋0.45 s，`scene.json` beats `titleAt` 預設 0.45；剪映「嘭」起音在章節起點＋0.37～0.40 s，01 §2.7）；`14-speaker` 改 `{ "sound": "sparkle", "at": "in + 0.1" }`；`15-quote` 改 `{ "sound": { "default": "sparkle", "good": "sparkle", "warn": "thunder" }, "at": "in + 0.1" }`（`sceneSfxCues` 已支援依 tone 選音效，`plan.mjs:101-102`）。各自等對應的 `.wav` 進 `shared/sfx/` 才改（否則 `--check` ✖ 音效檔不存在，`plan.mjs:442`）。whoosh 只留給全畫面幕。
  - 驗：`plan.test.mjs`「章節音效：chapter 的起播＝段起點＋0.45 − chapter.peak＋1 格；04a 仍是 whoosh；15 tone warn＝thunder」。
- **FR-010**（`edit.pads`，P2，本輪不實作）：plan-fields 保留欄位名 `edit.pads: [{ "at": <rough 秒數>, "dur": <秒> }]`（在 rough.mp4 的 `at` 插入 `dur` 秒靜音＋前一格定格，給「原片沒有停頓、又不想重剪」的章節用）；`normalizeEdit` 這輪遇到 `pads` 照現行規則 ✖「沒有這個欄位」（`edit.mjs:36`），不提前放行。
  - 驗：`edit.test.mjs` 現有斷言不變。

#### B. 無畫面空白偵測（範圍 2）

- **FR-011**（計算）：在成片秒數、`[第一句起點, 最後一句結尾]`（略過剪掉後長度 0 的句子）範圍內，扣掉所有段落的實際顯示區間（含換卡、墊底、被蓋過的延長；02 章節角標不算，`plan.mjs:514` 的 `shown` 同一個排除），再扣掉只有聲音的區間（它們另外報 ✖／⚠，FR-029），剩下長度 > `UNCOVERED_MIN` 1.0 s 的區間＝沒有畫面的區間。章節、media、全畫面、不透明 fx 都算有畫面（G05「排除章節／media／全畫面」）。
  - 驗：`plan.test.mjs`「沒有畫面的區間：刪掉一段後列出、補回後消失；章節與 media 算有畫面；02 章節角標不算；只有聲音的區間不重複列」。
- **FR-012**（報告行）：`--check` 與 build 的報告在「影片長度」那一行後面固定印一行（不論 rhythm），原文照 `cli-002.md` §1.3；沒有時印 `沒有畫面的區間（> 1.0s）：無`。
  - 驗：`plan.test.mjs`「formatReport：沒有畫面的區間一行，含總秒數與佔口播的百分比」。
- **FR-013**（JSON）：`--check --json` 加 `uncovered: [{ start, end, outStart, outEnd, len }]`（`start`／`end` 是 rough.mp4 秒數、`outStart`／`outEnd`／`len` 是成片秒數），格式照 `check-json.md` §2。
  - 驗：`build.test.mjs`「--check --json：uncovered 欄位存在，有 cuts 時 start／end 是 rough 秒數」。
- **FR-014**（continuous 的兩條 ⚠）：`rhythm` 是 `continuous` 時：(1) 有任何 uncovered 區間 → 一則彙總 ⚠；(2) 相鄰兩段（`shown` 依起點排序，前一段不是章節）空 `FLASH_MIN` 0.05 s 到 `FLASH_MAX` 1.0 s → 後一段一則「講者會閃一下」⚠，`→` 後面給前一段要改的 `to`（＝後一段的 `from` 原文）。原文照 `cli-002.md` §1.3。
  - 驗：`plan.test.mjs`「continuous：空 0.4 s → ⚠ 附 to 寫法；空 0.03 s → 不報；前一段是章節 → 不報」。

#### C. rhythm（範圍 3）

- **FR-015**：plan.json 第一層加 `rhythm`，值只能是 `"continuous"`（預設，不寫＝它；照 `shared/style.md:45`、`:58`、`:64`）或 `"spaced"`。
  - `continuous`：不印「開場前 30 秒已經有 N 張」（`plan.mjs:533-534`）與「之間只露臉 Ns（< 3s）」（`plan.mjs:516-519`）；印 FR-014 的兩條。
  - `spaced`：印現行兩條、不印 FR-014 的兩條。
  - 兩種都在報告表格後、「影片長度」那一行之後印一行 `節奏：continuous（連續覆蓋：…）`（原文 `cli-002.md` §1.3）。
  - 驗：`plan.test.mjs`「rhythm：不寫＝continuous，兩條舊 ⚠ 消失；spaced 時出現；報告第一行是節奏」。
- **FR-016**：`rhythm` 寫其他值 → ✖ `rhythm 只能是 "continuous"（預設，照 style.md 連續覆蓋）或 "spaced"（要留露臉空檔），現在是 "…"`。
  - 驗：`plan.test.mjs`「rhythm 寫錯 → ✖ 列出兩個可用值」。

#### D. cue 注入（範圍 4）

- **FR-017**（注入）：plan 有 custom 段時，build 在 `index.html`（與 `compositions/test-clip.html`）的 `<head>`、`kit/scene-motion.js` 之前插一段 `<script>window.__cues = {…};</script>`，格式照 `contracts/cues.md` §2：全片句子表 `cues`（成片秒數 `[起, 迄]`）＋每個 custom 段的 `segs[段 id] = { comp, start, D, refs }`。沒有 custom 段時不插（輸出和現行逐位元組相同）。
  - 驗：`build.test.mjs`「cue 注入：有 custom 段時 head 有 window.__cues，JSON 可解析、欄位照 cues.md；沒有 custom 時 index.html 和舊版相同」。
- **FR-018**（`P.at` 字面值預先算好）：`--check`／build 讀每支登記的 `x-*.html`，用 `cues.md` §3 的規則掃出 `P.at('<ref>'` 的字串字面值，每個用 `time.mjs` 的 `parseTime`＋`cueSeconds`（和 plan.json 的 from／to 同一套，`time.mjs:27-79`）算成成片秒數，放進 `segs[id].refs`。
  - 找不到句號或詞 → ✖，原文照 `cli-002.md` §1.4（附那一句原文）。
  - 算出來在段外（< 段起點 − 0.05 s 或 > 段尾＋0.05 s）→ ⚠。
  - 驗：`timing.test.mjs`「cue 注入：P.at 字面值和 plan.json 的 from 算出同一個秒數；#N@詞 找不到 → ✖ 附原文；段外 → ⚠」。
- **FR-019**（段長自動）：custom 段的長度只由 plan.json 決定：host 的 `data-duration`（現行就是，`main.mjs:78-79`）＝`segs[id].D`；custom 檔 root 上的 `data-duration` 與 `const D` 不再需要和段長一致，`--check` 不再提示手填。檔內改用 `P.dur()`／`P.end()`（003 實作，`cues.md` §4）。
  - 驗：`build.test.mjs`「custom 段延長 3 s：host data-duration 與 __cues.segs.x01.D 都變，x-*.html 一個位元組都沒動」；整合驗證（007）：custom root 寫 `data-duration="1"`、段長 8 s，`npx hyperframes snapshot --at <段起點+7>` 看到完成態（確認 HyperFrames 以 host 長度為準；不成立時見「待裁決」第 4 條）。
- **FR-020**（同一支檔登記兩次）：兩個 custom 段的 `src` 相同 → ✖，原文照 `cli-002.md` §1.4。
  - 驗：`plan.test.mjs`「custom：同一個 src 兩段 → ✖ 叫你複製成另一個檔名」。
- **FR-021**（契約）：`specs/contracts/cues.md` 寫清楚 `window.__cues` 格式、`P.at`／`P.end()`／`P.dur()` 語意、段內秒數定義、找不到句號時的行為、預覽頁的退路與測試向量，003 照它在 `scene-motion.js` 實作。
  - 驗：003 的 `motion.test.mjs` 跑 `cues.md` §6 的測試向量全過（003 的驗收）。

#### E. PiP 飛入與三層淡出（範圍 5）

- **FR-022**（片段的進場判斷）：`plan.mjs` 對每個子母畫面片段（`pipPieces`，`plan.mjs:395-401`）標 `enter`，依序判斷第一個成立的：
  1. 另一段的子母畫面片段剛好在這個片段起點結束（差 ≤ 0.001 s）→ `none`（接續，不動）；
  2. 片段起點是因為剪接點（`edit.cuts`）切開 → `none`；
  3. 起點前一格（−1/30 s）講者滿版：不在任何不透明段的 `[start, end)` 裡、不在只有聲音的區間、沒有 03 側邊欄在場、沒有 punch 生效，而且片段長 ≥ `PIP_FLY_MIN` 1.0 s → `fly`；
  4. 其他 → `fade`。
  - 驗：`plan.test.mjs`「子母畫面進場：透明卡→04a＝fly；章節→04a＝fade；04a→04b＝none；側邊欄→04a＝fade；只有聲音的洞後＝fade；cuts 切開＝none；片段 0.8 s＝fade」。
- **FR-023**（飛入的畫法）：`main.mjs` 對 `enter: fly` 的片段：
  - `.pip` 容器保持終點版面（`left 1424 top 594`、432×324，`main.mjs:190`），裡面 `<video>` 保持終點的 `pipGeometry().style`；只對容器做 transform：`transform-origin: 0 0`，`fromTo({ x: crop.x − 1424, y: crop.y − 594, scale: crop.w / 432 }, { x: 0, y: 0, scale: 1, duration: 0.7, ease })`，`ease`＝主合成既有的 `SceneMotion.pushEase`（`main.mjs:222`）。起始畫面與底下底片的臉逐像素重合（推導見 plan.md P-05）。
  - 外框 `#pipf-<id>`：`fromTo(opacity 0 → 1, duration 0.3)`，起點＝片段起點＋0.7 s。
  - 幕的淡入 tween（`main.mjs:93`）不含這個片段的 `#pip`／`#pipf`。
  - 驗：`build.test.mjs`「PiP 飛入：tween 起始值＝crop 換算、0.7 s、pushEase；外框 +0.7 s 起 0.3 s；幕的淡入不含 pip」；整合驗證（007，憲法迴圈第 2 步）：範例專案 `npx hyperframes snapshot --at <t0>,<t0+0.35>,<t0+0.7>,<t0+1.0>`，第 0 格 PiP 區域和前一格底片的同一區域平均差 ≤ 8/255、+0.7 落定、+1.0 外框完整（外框 +0.7 起淡入 0.3 s；01 P0-4 驗證欄）。
- **FR-024**（原地淡入）：`enter: fade` → `#pip`、`#pipf` 一起 `opacity 0 → 1`、0.4 s、`sine.out`，從片段起點開始。
  - 驗：`build.test.mjs`「PiP 原地淡入 0.4 s」。
- **FR-025**（接續）：`enter: none` → 沒有任何 tween；兩個片段的 `data-start＋data-duration` 與下一個的 `data-start` 一字不差、`<video>` 的 style 相同（像素位置差 0）。
  - 驗：`build.test.mjs`「連續兩段子母畫面：邊界數字相同、style 相同、沒有 opacity tween」；整合驗證：段界前後各 1 格 snapshot，PiP 區域相同。
- **FR-026**（出場）：每個片段標 `exit`：
  - `layer`：片段結束＝段落結束、段落要淡出（`fadeOut`）→ 跟幕一起在現行的 0.5 s 淡出 tween 裡（`main.mjs:94`；media 段在 `mediaParts` 的出場 tween 裡）——三層一起淡出，不做放大回原位（01 P0-5；作者 PPA 情境規範）；
  - `none`：接續到下一個片段，或段落接縫不淡（`seamTo`）且下一段有子母畫面；
  - `fade`：其他（後面是只有聲音的區間、章節墊底、下一段沒有子母畫面的整張幕）→ 原地淡出，長度：章節墊底＝0.5 s（和章節淡入同步，FR-008）、其他＝0.4 s，結束在片段終點。
  - 驗：`plan.test.mjs`「子母畫面出場：回講者＝layer；04a→04b＝none；04a→章節＝fade 0.5；洞前＝fade 0.4」。
- **FR-027**（固定數字不變）：子母畫面本體 432×324、位置 `x 1424–1856、y 594–918`（`main.mjs:189-190`、`plan.mjs:51`；外框禁入區是 `lib/media.mjs:25` 的 `PIP_ZONE`）不改；01 的 480×360 是剪映的盒子，工作區沿用現行尺寸（`pip-frame.png` 已照它畫）。
  - 驗：`plan.test.mjs` 現有「子母畫面裁切」測試不變。
- **FR-028**（media 段）：media 段的子母畫面用同一套 `enter`／`exit`；`mediaParts`（004 的檔）進場 tween 不再包含子母畫面（見「請 004 加」），出場照現行（`lib/media.mjs:418-434` 的 `both`）只放 `exit: layer` 的片段 id。
  - 驗：`build.test.mjs`「media 段：露臉→media＝PiP 飛入；mediaParts 的進場 tween 只有 #el-<id>」（004 合併後）。

#### F. 旁白段擦入（範圍 6）

- **FR-029**（覆蓋等級）：只有聲音的區間沒被不透明段蓋住的部分：> `VOICE_ERR` 1.0 s ✖（現行）、> `VOICE_WARN` 0.1 s ⚠（舊值 0.5，`plan.mjs:34`）；報告「只有聲音」那一行（`plan.mjs:642-645`）沒蓋住的區間前面加等級符號，原文照 `cli-002.md` §1.5。
  - 驗：`plan.test.mjs`「只有聲音：沒蓋住 0.3 s → ⚠；1.2 s → ✖；報告行寫 ⚠／✖」。
- **FR-030**（什麼時候擦）：兩個不透明段無縫相接（現行 `seamTo`，`plan.mjs:359-368`）、接縫時間在某個只有聲音的區間**內部**（離區間兩端都 > 0.05 s），而且兩段都不是章節：
  - media → 非 media（A 幕）：後一段 `wipeIn`；
  - 非 media → media：前一段 `wipeOut`；
  - media → media、非 media → 非 media：照現行（硬接；01 §3.6「A→A 直接接，同一張深色底」）。
  - 驗：`plan.test.mjs`「擦入擦出：只在只有聲音的區間內、兩種方向、章節不擦、講者段不擦」。
- **FR-031**（擦的畫法）：`main.mjs` 對 host `#el-<id>`：擦入 `fromTo({ clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, ease: 'sine.out' })` 從段起點；擦出 `fromTo({ clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.45, ease: 'sine.in', immediateRender: false })` 在段尾 −0.45 s。擦的那一段 `z` 改 31（壓在 z 30 的 media 上面）。
  - 驗：`build.test.mjs`「擦入：clip-path tween 0.45 s、z-index 31」；整合驗證（007）：交界前後 0.25 s 各截一格，擦入途中左邊是動畫幕、右邊是錄影，不是黑（01 P0-6 驗證欄）。
- **FR-032**（底下的錄影多播）：
  - 擦入：前一段 media `postroll = ROLL 0.5`；錄影要夠長：影片 `in + (段長 + 0.5) × speed ≤ 素材長度`，不夠時 `postroll` 取能播的最大值；< 0.45 s 時不擦入（硬切）並在報告 note 說明。圖片一律可以。
  - 擦出：後一段 media `preroll = ROLL 0.5`；影片 `in − 0.5 × speed ≥ 0`，不夠時同上取最大值、< 0.45 s 時不擦出（硬切）＋note（原文 `cli-002.md` §1.5）。
  - `preroll`／`postroll` 只影響畫面，不改 media 段的 `start`／`end`、不參與「整張幕重疊」檢查。
  - 驗：`plan.test.mjs`「pre-roll／post-roll：夠長＝0.5；in 0.2 → 不擦出＋note；圖片可以」。
- **FR-033**（章節前後）：章節前後的段第一格／最後一格本來就是不透明，不擦（01 §2.5 最後一段）；由 FR-008 處理。
  - 驗：FR-030 的測試含「章節不擦」。
- **FR-034**（JSON）：`--check --json` 的 `items[].out.wipe`＝`{ in, out, preroll, postroll }`（`check-json.md` §3）。
  - 驗：`build.test.mjs`「--check --json：wipe 與 preroll／postroll」。

#### G. `media.mjs cutpoints`、`srt-split`（範圍 7）

- **FR-035**（cutpoints）：讀 `work/cuts.v1.json`（沒有就讀 `work/cuts.v1`）的 `chunks`（`[起始幀, 結束幀, 速度]`；速度 1＝保留、≥ 99999＝剪掉；2026-10-31 用 auto-editor 29.3.1 實測格式 `{ "version": "1", "source", "chunks" }`，沒有 timebase 欄），幀率用 `work/rough.mp4` 的 fps（沒有 rough.mp4 時用 `source`）；把保留段依序累加，每個「保留→剪掉→保留」的位置是一個剪接點（片頭片尾的剪掉不算，和 `edit.mjs:166` 的 `joinsOut` 一致），秒數 r3。寫 `work/cutpoints.json`＝`{ "cuts": [ { "at", "kind" } ] }`（現行格式，`build.mjs:298-308` 讀它）。`--dry-run` 只印不寫。
  - 驗：`media-cli.test.mjs`「cutpoints：US6 情境 1 的固定 JSON → 固定輸出；片頭片尾的剪掉不算；--dry-run 不寫」。
- **FR-036**（kind）：剪掉的那段在原片的範圍和 cuts.md 任一列 NG（FR-001，包含「待確認」的列以外的全部）重疊 ≥ `NG_KIND_OVERLAP` → `ng`，否則 `pause`；cuts.md 不存在或沒有 NG 表 → 全部 `pause` 並印 ⚠。
  - 驗：`media-cli.test.mjs`「cutpoints kind：和 NG 重疊 ≥ 0.3 s 是 ng；沒有 cuts.md 全部 pause＋⚠」。
- **FR-037**（自我核對）：保留幀數總和 ÷ fps 和 rough.mp4 長度差 > 2 格（0.067 s @30fps）→ ⚠「cuts.v1.json 和 rough.mp4 對不上」；有變速段（速度不是 1 也不是 ≥ 99999）→ ✖。
  - 驗：`media-cli.test.mjs`「cutpoints：長度對不上 ⚠、變速 ✖」。
- **FR-038**（srt-split 拆法）：`visibleLen`（`scenes.mjs:111`，全形 1、半形 0.5、四捨五入）> `--max`（預設 `SRT_MAX` 18）的句子，在「左右兩半都 ≤ max」的切點中挑：先挑標點後面（`，。！？、；：,.!?;:`），再挑空白，同類裡挑左右字數最接近的；兩邊仍 > max 就對那一半遞迴；都沒有可切的標點與空白 → 切在最接近中間、兩邊都不是半形英數的字元之間，並 ⚠「沒有標點，斷在第 N 字」。文字不增不減（標點留在前半、切點兩側的空白去掉），句號從 1 重新連號。
  - 驗：`media-cli.test.mjs`「srt-split：標點優先、空白其次、遞迴三段、沒有標點 ⚠、拆完每則 ≤ 18、文字串起來等於原文」。
- **FR-039**（時間）：每一則的長度依 `textWidth`（`time.mjs:48`，全形 1、半形 0.5，不四捨五入）比例分配原句長度，首尾相接（前一則終點＝後一則起點），r3。
  - 驗：`media-cli.test.mjs`「srt-split 時間：比例分配、首尾相接、總長不變」。
- **FR-040**（寫檔）：`--dry-run` 只印拆句表；否則先備份 `work/rough.srt.split-<YYYYMMDD-HHMMSS>`（撞名加 `-2`；round 2 A-02：`.bak-*` 留給 snap-srt，status 的 S6 靠它判斷 snap-srt 跑過沒有），再寫回；換行風格與 BOM 跟原檔一樣；沒有要拆的句子時不寫也不備份。
  - 驗：`media-cli.test.mjs`「srt-split：備份檔內容一字不差、CRLF 原樣、沒有要拆時不備份」。
- **FR-041**（擋下會讓句號位移的時機）：`work/hyperframes/plan.json` 存在、而且裡面有任何 `#數字` 的時間 → ✖ 不拆，原文照 `cli-002.md` §4（改用剪輯台分割，剪輯台會一起重對 #N；`AGENTS.md`「剪輯台」第 3 點）。
  - 驗：`media-cli.test.mjs`「srt-split：plan.json 有 #N → ✖ 結束碼 1，rough.srt 沒動」。

#### H. `status.mjs`、`caps.mjs`（範圍 8）

- **FR-042**（status 判斷）：`tools/status.mjs` 只讀檔，依 `cli-002.md` §5.2 的判斷表（S0–S14，15 列；實作見 `plan.md` P-10）（只看檔案在不在、修改時間先後、rough.srt 有沒有 > 18 字的句子）判斷階段；有 `work/製作進度.md` 的 `## 停點紀錄` 表時，照 `contracts/stop-points.md` §4 的判斷規則（同一停點以最後一列為準、最後一列「待回覆」＝卡住）決定「待回覆停點」，而且有待回覆停點時「目前在」以它為準。
  - 驗：`status.test.mjs`「判斷表 14 列各一個暫存專案；停點紀錄最後一列待回覆 → 以它為準；同一停點後來通過 → 不算待回覆」。
- **FR-043**（status 輸出）：固定印 5 行（原文 `cli-002.md` §5）：`目前在：`、`下一步：`、`下一個停點：`、`待回覆停點：`、`下一輪回饋編號：r<N>`（N＝`work/回饋/` 裡 `r*.md` 的最大編號＋1），再印一行 `依據：`；`--json` 只印一個 JSON。結束碼：0；找不到專案 1。
  - 驗：`status.test.mjs`「輸出 5＋1 行的開頭固定；--json 欄位；r 編號」。
- **FR-044**（status 不寫檔）：不建資料夾、不寫任何檔、不呼叫 ffmpeg（只用 `fs.statSync`、讀文字檔）。
  - 驗：`status.test.mjs`「跑完前後暫存專案的檔案清單與 mtime 一樣」。
- **FR-045**（caps 探測）：`tools/caps.mjs` 依序探測 6 列（格式照 02 §5.5 能力表：能力｜結果｜依據），每個指令逾時 `CAPS_TIMEOUT` 15 s、Windows 用 `shell: true`：

  | 能力 | 指令 | 「可用」的條件 |
  |---|---|---|
  | 模型內建生圖 | （不執行） | 固定寫「工具判斷不了」、依據「看本次 session 的工具清單」（02 §5.5 第 1 步） |
  | codex | `codex --version`；有版本才跑 `codex login status` | 兩個都結束碼 0，且輸出不含 `not logged in`（不分大小寫） |
  | mmx | `mmx --version`；有版本才跑 `mmx auth status` | 兩個都結束碼 0 |
  | HTML 截圖（Chrome） | `npx --no -- hyperframes browser path` | 結束碼 0 且最後一行是存在的檔案 |
  | ffmpeg／ffprobe | `ffmpeg -version`、`ffprobe -version` | 兩個都結束碼 0，取第一行的版本號 |
  | HyperFrames | 讀 `<根目錄>/node_modules/hyperframes/package.json` 的 `version`，和 `package.json` 的 `devDependencies.hyperframes` 比 | 有安裝且相同（FR-050） |

  結果欄只用：`可用`、`未登入`、`沒有安裝或壞掉`、`版本不符`、`工具判斷不了`。表後印一行可用的生圖路線（`codex`／`mmx`／`HTML`，照 AGENTS.md「換風格」路由表選）。
  - 驗：`caps.test.mjs`「用假的執行器：六列的結果欄；codex ENOENT → 沒有安裝或壞掉＋錯誤第一行；mmx 未登入；Chrome 路徑不存在」。
- **FR-046**（caps 不改環境、不洩漏）：沒裝不裝、沒登入不登入（AGENTS.md 規則 3、02 §5.5）；不跑任何會下載的指令（`npx --no`）；依據欄只節錄第一行或 `method`／`source` 這類欄位，**遇到 `key`、`token`、`api_key`、`balance`、`amount` 一律不印**（實測 `mmx auth status` 會印部分 API key 與餘額）。
  - 驗：`caps.test.mjs`「mmx 的 JSON 有 key 與 balance → 依據欄沒有 sk-、沒有數字餘額」。
- **FR-047**（caps 結束碼）：必要的 3 列（Chrome、ffmpeg／ffprobe、HyperFrames 有安裝；版本不符只 ⚠）全部可用 → 0；任一不可用 → 1。codex、mmx、模型內建生圖不影響結束碼。`--json` 只印一個 JSON（`cli-002.md` §6）。
  - 驗：`caps.test.mjs`「結束碼：codex 壞掉仍 0；沒有 ffmpeg → 1」。
- **FR-048**（caps 的函式介面）：匯出 `probeCaps({ root, run, platform })`（`run` 可注入，測試用假的）與 `hyperframesVersion(root)`（build 也用，FR-050）。
  - 驗：`caps.test.mjs` 直接呼叫兩個函式。

#### I. hyperframes 版本釘住（範圍 9）

- **FR-049**：根目錄新增 `package.json`：`{ "name": "auto-edit-workspace", "private": true, "description": "…", "engines": { "node": ">=22" }, "devDependencies": { "hyperframes": "0.8.221" } }`（精確版本、不加 `^`；不加 `type`、`scripts`）。`node_modules/` 已在 `.gitignore`。`package-lock.json` 要不要進 git 見「待裁決」第 6 條。
  - 驗：`caps.test.mjs`「根目錄 package.json：private、devDependencies.hyperframes 是精確版本 0.8.221」。
- **FR-050**（版本檢查）：`hyperframesVersion(root)` 回傳 `{ pinned, installed, ok }`（pinned＝package.json 的值、installed＝`node_modules/hyperframes/package.json` 的 `version` 或 null）。build（含 `--check` 文字模式）在「專案：」下一行印 `HyperFrames 0.8.221（package.json 釘 0.8.221）`；不符或沒裝時印 ⚠，原文照 `cli-002.md` §1.1；不影響結束碼。
  - 驗：`build.test.mjs`「版本行：用 --template 指向的根目錄放假的 node_modules/hyperframes/package.json，三種情況的原文」。
- **FR-051**：`--check --json` 加 `versions.hyperframes`（`check-json.md`）。另外，`(cd projects/<專案>/work/hyperframes && npx hyperframes …)` 會用根目錄的版本，前提是 build 不在 `work/hyperframes/` 裡產生 `package.json` 或 `node_modules`（npm 從目前資料夾往上找第一個有 `package.json` 或 `node_modules` 的資料夾當專案根目錄）。
  - 驗：`project.test.mjs`「build 產生的專案裡沒有 package.json、沒有 node_modules」；整合驗證（007）：`cd projects/範例/work/hyperframes && npx --no -- hyperframes --version` 印 `0.8.221`。

#### J. 結尾配樂（範圍 10；語意照 `contracts/sfx.md` §6，訊息原文照 `cli-005.md` §3.3–§3.4）

- **FR-052**（欄位）：plan.json 第一層 `outro`：`from`（必填，`"#N"`／`"#N@詞"`，結語金句講完後那一句）、`music`（選填，預設 `"bgm-outro"`；`null`＝這集不配；只能是 `kit/sfx.json` 裡 `kind: "bgm"` 的名稱）、`volume`（選填，dB，−20～+6，預設 0）、`fadeOut`（選填，秒，0–10；不寫＝`kit/sfx.json` 那顆的 `fadeOut`）。多的鍵 → ✖「沒有這個欄位」。錯誤原文照 `cli-005.md` §3.3；`fadeOut` 範圍錯的原文照 `cli-002.md` §1.6。
  - 驗：`plan.test.mjs`「outro：缺 from、from 寫秒數、music 是 sfx、volume 超出範圍、fadeOut 超出範圍、多的鍵，各自的 ✖ 原文」。
- **FR-053**（時間與檔案）：`start`＝`from` 句起點（成片秒數）、`span`＝成片長度 − `start`、`len`＝配樂檔長度（ffprobe）；`len ≥ span` 從 `start` 播 `span` 秒，否則從「成片長度 − `len`」起播（對齊片尾；資訊行，不是 ⚠）。淡入＝`min(fadeIn, 播放長度 ÷ 3)`、淡出＝`min(max(fadeOut, edit.fadeOut), 播放長度 ÷ 3)`；增益＝kit `volume` × dB(`outro.volume`) × dB(`edit.volume.sfx`)。build 呼叫 005 的 `renderBgmClip(src, dst, { from, dur, fadeIn, fadeOut, gain })` 把淡入淡出與增益烤進檔案（`contracts/sfx.md` §6.2），主合成放 `<audio id="bgm-outro" src="assets/<回傳的檔名>" data-start data-duration data-track-index data-volume="1">`。配樂不參加 3 秒規則、不進 `sfxBudget`。
  - 驗：`plan.test.mjs`「outro：起點、對齊片尾、淡入淡出取 min」（`contracts/sfx.md` §10 最後一列）；`build.test.mjs`「outro：<audio id="bgm-outro"> 的 data-start／data-duration／data-volume＝1」。
- **FR-054**（報告與 JSON）：「結尾配樂：…」一行印在音效行後面（原文 `cli-005.md` §3.4）；`--check --json` 加 `outro: { music, start, dur, aligned }`（`check-json.md` §2）。
  - 驗：`plan.test.mjs`「outro 報告行：正常、對齊片尾、music null」。
- **FR-055**（`--test`）：測試片段只放落在範圍內的部分：配樂起點在片段前 → `data-start 0`、`data-media-start`＝差值；在範圍外 → 不放。
  - 驗：`plan.test.mjs`「--test 平移：outro 被裁進片段」。

#### K. 音效政策接線（範圍 11；照 `contracts/sfx.md` §4、§5、§7，函式由 005 的 `lib/audio.mjs` 提供）

- **FR-056**（常數單一真相）：`plan.mjs` 的 `SFX_GAP`（`:38`）、`EXTRA_GAP`（`:39`）改成 `import { SFX_RULES } from './audio.mjs'` 的 `gapSec`、`extraGapSec`（值不變：3 s、0.2 s）。
  - 驗：`plan.test.mjs` 既有的 3 秒規則測試不改仍過。
- **FR-057**（`additive`）：3 秒規則（`plan.mjs:462-468`）排序後逐顆看，`sfxConf[name].additive === true` 的主音效跳過、不更新 `lastSfx`（不被拿掉，也不讓後一顆被拿掉）。
  - 驗：`plan.test.mjs` 跑 `contracts/sfx.md` §10 第 1–3 列。
- **FR-058**（`sfxBudget`）：音效段最後（`edit` 音量調整 `plan.mjs:470-474` 之後）呼叫 `sfxBudget(cues, sfxConf, { voiceDb: edit.volume.voice, outDur, fmt })`：`warnings` 推進全域 ⚠、`lines`（音效次數、音效密度）印在 `--check` 報告的音效段；`--check --json` 加 `sfxCount`＝`count`、`sfxBudget`＝`{ perMinuteAvg, over, dense, loud }`（裡面的 `at` 換回 rough.mp4 秒數）。只提醒，不拿掉任何 cue。
  - 驗：`plan.test.mjs` 跑 `contracts/sfx.md` §10 第 4–6 列；`build.test.mjs`「--check --json 有 sfxCount、sfxBudget」。
- **FR-059**（build 的音效比例行）：`audioReportLines(info, { loudnorm, declick, cutpointsExist, sfx: budget })`（`build.mjs` 印「人聲響度…」那段）。
  - 驗：`build.test.mjs`「build 報告有『音效比例：』一行」。
- **FR-060**（段落音效的種類、錯誤與 `--list`）：段落 `"sfx"` 只接受 `kind: "sfx"`，寫 `bgm` 名稱 → ✖（原文 `cli-005.md` §3.3 第 1 列）；「音效檔不存在」（`plan.mjs:442`）的「12 個檔」改成 `Object.keys(sfxConf).length`，`build.test.mjs:170` 的 `12` 同步；`--list` 的音效行跳過 `kind: "bgm"`、每顆後面標「附加」（`additive`）與「每集 ≤ N」（`maxPerVideo`），另起一行 `結尾配樂（plan.json "outro"）：bgm-outro`。
  - 驗：`plan.test.mjs`「段落 sfx 寫 bgm-outro → ✖」；`build.test.mjs`「--list 音效行」。
- **FR-061**（`clicks`）：custom 段加 `clicks` 欄位（`KEYS.custom`，`plan.mjs:26-31`）；時間文法與錯誤原文照 `contracts/sfx.md` §5（`"+秒"`、`"#N"`、`"#N@詞"`，要落在段內）；media 段讀 004 解析好的 `it.media.clicks`。每一項變成一顆 `click` 附加音效（起播＝事件 − `click.peak`＋1 格）；`"sfxExtra": false` 時不加。
  - 驗：`plan.test.mjs` 跑 `contracts/sfx.md` §10 第 2 列；custom 段 `clicks` 超出段 → ✖ 原文。
- （條件式，不編號）005 的 FR-031 量到剪接點凹洞、FR-032 成立時，build 傳 `join: { mode: 'xfade', source, chunks, fps }` 給 `encodeFootagePolished`（`specs/005-sfx/spec.md`「請 002 加」第 9 條）；等 005 定案再補 FR。

#### L. look 接線（範圍 12；照 `contracts/look.md` §2.2、§3、§4 與 `cli-006.md` §7）

- **FR-062**（plan 欄位）：`TOP_KEYS`（`plan.mjs:25`）加 `look`；`resolvePlan` 呼叫 006 的 `validateLook(plan.look)`，回傳的每則當 ✖（原文 `look.md` §2.2）。
  - 驗：`plan.test.mjs`「look：不再是未知欄位；"look": true → ✖ 原文」。
- **FR-063**（`--check`）：`--check`（文字與 `--json`）呼叫 `lookCheck({ projectDir, plan, templateDir })`，errors 併進 ✖、warnings 併進 ⚠；不呼叫 `ensureLook`、不做影像處理（`look.md` §3.3：< 5 ms、不寫檔）。
  - 驗：`build.test.mjs`「--check：lookCheck 的 ⚠ 出現在報告與 JSON 的 warnings」。
- **FR-064**（build 呼叫 `ensureLook`）：非 `--check` 路徑，在算重新編碼戳記（`build.mjs:408`）之前呼叫 `ensureLook({ projectDir: P.project, plan, log, templateDir: P.templateDir, strict: true })` → `{ footage, lut, key, report }`；在「重新編碼底片」那行之前原樣印 `report` 每一行；`audioKey` 的 `src`、`fresh` 判斷（`:409`）、`encodeFootagePolished` 的 `src`、`frameCrop` 的來源（`:452`）都改用 `footage`，`encodeFootagePolished` 加 `lut`。丟錯 → 印 `✖ <message>`、結束碼 1、不編碼（`cli-006.md` §7）。只有聲音的偵測（`build.mjs:312`）、`--check` 用的影片、剪輯台的 `--video` 預設仍是 `work/rough.mp4`。
  - 驗：`build.test.mjs`「look 接線：stub 回傳 rough-look.mp4 → 重新編碼的來源是它；stub 丟錯 → 結束碼 1、沒有產生 assets/rough.mp4」。
- **FR-065**（戳記）：`audioKey({ src, cutpoints, …, frame, look: key })`（005 的 `audioKey` 已在 `contracts/sfx.md` §8 加 `look = null`）；`key` 是 `null` 時戳記和舊版一字不差（舊專案不重新編碼）。
  - 驗：`build.test.mjs`「look key 變 → 重新編碼；key null → 戳記同舊版」。

#### M. auto-editor 停頓（範圍 13）

- **FR-066**：剪乾淨的 auto-editor 指令固定帶 `--margin 0.15sec`（G16：作者非章節停頓 0.30 s，兩側合計 0.3 s；auto-editor 29.3.1 預設 0.2 s，兩側合計 0.4 s）；ng-snap 印的三行指令都帶它（`--margin` 參數可改）。文件原文在 `docs.md` §1。
  - 驗：`media-cli.test.mjs`「ng-snap：預設 --margin 0.15sec 出現在三行指令裡」；001 的 `docs.test.mjs` 檢查 AGENTS.md／Skill 的剪乾淨指令有 `--margin 0.15sec`。

#### N. `--check --json` 契約與 004 的介面

- **FR-067**：`build.mjs --check --json` 的完整欄位照 `specs/contracts/check-json.md`（`schema: 2`）。第一層新欄位：`schema`、`planHash`、`rhythm`、`versions`、`uncovered`、`voiceUncovered`、`chapters`、`sfxCount`、`sfxBudget`、`outro`；items 新欄位：`key`、`family`、`layout`、`layoutZh`、`opaque`、`out`。出錯時（`build.mjs:594`）的 JSON 也帶齊這些鍵（空值）。
  - 驗：`build.test.mjs`「--check --json：照 check-json.md 的欄位表逐一檢查型別；出錯時的 JSON 也有全部的鍵」。
- **FR-068**（相容）：既有欄位（`ok`、`errors`、`warnings`、`videoDur`、`outputDur`、`voiceOnly`、`cutpoints`、`items[].id／type／label／start／end／shownEnd／sfx／warnings／src／enter／exit／volume／kind`、`edit`、`paths`）名稱、型別、意思都不變（`qc.mjs:243-244`、`editor.mjs:250`、`:449-451`、`audit.mjs:100-114` 在讀），時間仍是 rough.mp4 秒數；新增的成片秒數一律放在 `out` 或叫 `outStart`／`outEnd`。`items[].kind` 繼續是 media 的 `video`／`image`，主代理說的「每段的 kind」在本契約叫 `family`。
  - 驗：`build.test.mjs` 與 `editor.test.mjs`（006）既有測試不改仍過。
- **FR-069**（`planHash`）：`--check --json` 第一層加 `planHash`（plan.json 檔案內容的 sha1 前 8 碼）；build 成功後在 `work/hyperframes/.build-manifest.json` 寫同一個 `planHash`（manifest 其他內容保留）。004 的 `qc.mjs storyboard` 用它判斷「改過還沒 build」（`cli-004.md` §2.1）。
  - 驗：`build.test.mjs`「planHash：--check --json 與 build 後的 manifest 相同；plan.json 多一個空白就變」。
- **FR-070**（`items[].out`）：照 `contracts/media.md` §7：每段 `out: { start, end, lists, annotations }`（成片秒數；`lists`＝`it.start + it.resolved.listTimes` 攤平排序；`annotations`＝`validateMedia` 的 `json`，只有 media 段有），本線再加 `pip`、`wipe`、`refs`（`check-json.md` §3）。
  - 驗：`build.test.mjs`「items[].out：條列段的 lists 是成片秒數；有 cuts 時 out.start 和 start 不同」。
- **FR-071**（`validateMedia`）：`plan.mjs` 第二輪改呼叫 004 的 `validateMedia(it, { cues, tm, pipAt, icons, steps, err, warn })`（取代 `resolveMedia`）；`resolvePlan` 開頭建 `const steps = newStepState()`，依段落起點順序傳給每個 media 段；回傳存 `it.mediaReport`；`formatReport` media 那段（`plan.mjs:630-631`）改印 `it.mediaReport.summary`（`contracts/media.md` §4.1、§7）。
  - 驗：`plan.test.mjs`「media：STEP 編號跨段接續；報告括號是 summary」。
- **FR-072**（`MEDIA_FIELDS` 與測試搬家）：`build.mjs` 刪掉自己的 `MEDIA_FIELDS`（`:215`），改 `import { MEDIA_FIELDS } from './lib/media.mjs'`；`dev/tests/media.test.mjs` 裡測 002 的 `media.mjs main／scan／frame` 與 `--check --json` 的案例，在 `media-cli.test.mjs` 建好同等案例後通知 004 刪掉（`specs/004-media-annotations-qc/spec.md`「請 002 加」第 6 列）。
  - 驗：`build.test.mjs`「--list --json 的 media.fields 等於 lib/media.mjs 的 MEDIA_FIELDS」；`media-cli.test.mjs` 涵蓋原案例。

### Key Entities

- **cuts.md 的兩張表**：NG（時間碼範圍、內容、原因、待確認）；章節空檔（章節、第一句、時間碼）。時間都是原片秒數。
- **靜音段**：auto-editor v1 export 裡速度 ≥ 99999 的 chunk，原片秒數 `[a, b]`，已扣掉 margin。
- **剪接點**：rough.mp4 秒數 `at`＋`kind`（`ng`／`pause`）。
- **子母畫面片段（PiP piece）**：`{ s, e, ms, enter: fly|fade|none, exit: layer|fade|none, exitDur }`，成片秒數。
- **擦入擦出**：段落的 `wipe: { in, out }`；media 的 `preroll`、`postroll`（秒）。
- **章節**：`{ id, start, end, cue, num, title, gap, placement: centered|flush|cover, captionsClipped[] }`。
- **plan 的 `outro`**：`{ from, music, volume, fadeOut }`（FR-052）。
- **cue 表**：`window.__cues`（`contracts/cues.md`）。
- **停點紀錄**：`work/製作進度.md` 的 `## 停點紀錄`（001 的 `contracts/stop-points.md` §4）。

---

## 請 00N 加

| 給誰 | 要加什麼 | 為什麼（本線哪條 FR） |
|---|---|---|
| 001 | 把 `docs.md` 的原文併進 AGENTS.md「剪乾淨」4–7 步（或 `auto-edit-rough` 步驟 4–7）、「剪好看」、style.md「節奏」「字幕」、USAGE.md 2.4／4.1／4.2、USAGE-reference.md R2.6／R6／R7.2／R7.3、setup（`npm install`） | FR-001–FR-008、FR-012–FR-016、FR-019、FR-035–FR-041、FR-049、FR-066 |
| 001 | `docs.test.mjs` 收錄 `cli-002.md` 的 5 個新指令（`media.mjs ng-snap／cutpoints／srt-split`、`status.mjs`、`caps.mjs`），並檢查剪乾淨指令有 `--margin 0.15sec` | 憲法 IV、FR-066 |
| 001 | `contracts/cli-002.md` 併進 `contracts/cli.md`（或主代理決定保留分檔） | README 契約表 |
| 003 | `scene-motion.js` 照 `cues.md` §4 實作 `P.at(ref, off?)`、`P.dur()`、`P.end()` 不帶參數讀注入的 D；錯誤寫進 `window.__cueErrors`；跑 `cues.md` §6 的測試向量 | FR-017–FR-021 |
| 003 | `audit-rules.mjs:291-298` 的 `customDuration`：custom 檔用 `P.dur()` 或不帶參數的 `P.end()` 時不再比 `data-duration`；`window.__cueErrors` 有內容就 ✖ | FR-019、`cues.md` §4.4 |
| 003 | 4 支範例與新範例改用 `P.at`／`P.dur()`，root 加 `data-cues-sample`（`cues.md` §5）給 `shared/template/index.html` 預覽；刪掉檔頭「跑 --check 把長度填回 data-duration」與「起點相減」兩段（`custom/x-process.html:18-25`） | FR-019、G02 (4) |
| 004 | `mediaParts`：進場 tween 只動 `#el-<id>`（子母畫面進場改由 main.mjs 依 `piece.enter` 做）；出場照現行，但 `it.pipIds` 只會收到 `exit: layer` 的片段 id（`lib/media.mjs:418-434`） | FR-028 |
| 004 | `validateMedia`／`mediaParts` 支援 `it.preroll`、`it.postroll`（秒）：錄影片段往前／往後多播，`data-start`、`data-duration`、`data-media-start` 跟著延伸；圖片直接延長；`mbg` 底不延長 | FR-032 |
| 005 | `contracts/sfx.md` §6.1 的 `outro` 欄位表加 `fadeOut`（選填，秒，覆寫 kit 的 `fadeOut`）；或回覆不要，本線就拿掉 | FR-052 |
| 005 | `sfxBudget` 回傳的 `over[].cues[].at`、`dense[].from／to`、`loud[].at` 確認是成片秒數（本線在 JSON 換回 rough.mp4 秒數） | FR-058 |
| 005 | `chapter.wav`、`sparkle.wav`、`thunder.wav` 進 `shared/sfx/` 時通知 002 改 01／14／15 的 scene.json | FR-009 |
| 006 | `tools/lib/look.mjs` 先交 stub：`ensureLook()` 回傳 `{ footage: <work/rough.mp4>, lut: null, key: null, report: [] }`、`lookCheck()` 回傳 `{ errors: [], warnings: [] }`、`validateLook()` 回傳 `[]`（簽名照 `look.md` §2.2、§3、§3.3）；本線靜態 import 這三個名字 | FR-062–FR-065 |
| 006 | 剪輯台存檔時保留 plan.json 第一層的 `rhythm`、`outro`、`look`（不認得的鍵不要丟）；時間軸畫 `check-json.md` 的 `voiceUncovered`（紅色斜線）與 `uncovered`（灰色斜線） | FR-013、FR-067 |
| 006 | （選做）`lib/ff.mjs` 的 `blackDetect` 快取（`:128`）改成「寫暫存檔再 rename」，多個 `--check` 同時跑不會讀到寫一半的檔 | 回覆 001 第 1 條 |
| 007 | `dev/check-all.mjs` 加：從 `projects/範例/work/hyperframes` 跑 `npx --no -- hyperframes --version` 要是 0.8.221；FR-019、FR-023、FR-025、FR-031 的 snapshot 整合驗證；`status.mjs`、`caps.mjs` 冒煙測試 | FR-019、FR-023、FR-025、FR-031、FR-051 |

## 回覆 001 的問題（001 spec「請 002 加」）

1. **多個子代理同時跑 `build.mjs --check` 會不會寫壞快取**：`--check` 只寫 `work/hyperframes/.cache/blackdetect.json`（`build.mjs:311-313` → `ff.mjs:112-131`）；讀的時候 JSON 壞了會整段重算（`ff.mjs:117-120` 的 try/catch），而且每個寫入者寫的是同一份內容（同一支 rough.mp4 的偵測結果），最壞情況是某個子代理多花一次偵測時間，不會留下錯的結果。結論：**子代理可以跑 `--check`**；仍請 006 改成原子寫入（上表）。本線新增的 ng-snap 快取（`work/.cache/ng-snap.v1.json`）只在剪乾淨跑，不會並行。
2. **`(cd projects/<專案>/work/hyperframes && npx hyperframes …)` 用哪一版**：npm 以「從目前資料夾往上第一個有 `package.json` 或 `node_modules` 的資料夾」當本地專案；build 只在 `work/hyperframes/` 寫 `hyperframes.json`、`meta.json`（`build.mjs:518-520`），沒有 `package.json`，所以會一路找到工作區根目錄、用根目錄 `node_modules/.bin/hyperframes`（0.8.221）。FR-051 用測試鎖住「build 不產生 package.json／node_modules」，007 的 check-all 實際跑一次確認。根目錄還沒 `npm install` 時 npx 會用全域快取或下載最新版，build 的版本行會 ⚠ 提醒（FR-050）。
3. **`status.mjs` 的輸出**：照 001 要的三行原文（`目前在：`、`下一步：`、`待回覆停點：`）＋ `下一輪回饋編號：r<N>`，另外依主代理派工加 `下一個停點：`，共 5 行＋`依據：`（FR-043、`cli-002.md` §5）。
4. **`rhythm`**：欄位名、值、關掉哪兩條 ⚠、範例輸出原文在 `docs.md` §3 與 `cli-002.md` §1.3。

## 依賴與待對齊

| 依賴 | 狀態（2026-10-31） | 本線怎麼處理 |
|---|---|---|
| 005 `contracts/sfx.md`（版本 1）、`cli-005.md` | 已有 | FR-009、FR-052–FR-061 照它；`renderBgmClip`、`sfxBudget`、`SFX_RULES` 進 `lib/audio.mjs` 之前，tasks.md Phase 9 不開工 |
| 006 `contracts/look.md`、`cli-006.md` | 已有 | FR-062–FR-065 照它；需要 006 先交 `lib/look.mjs` stub 才能靜態 import |
| 004 `contracts/media.md`、`cli-004.md` | 已有 | FR-070–FR-072 照它；FR-028、FR-032 需要 004 改 `mediaParts`（上表） |
| 003 `SceneMotion.P.at` | 還沒有 | 本線先做 build 端（注入、預先算 refs、檢查）；003 合併前，現行手算寫法照常能跑（注入的 script 不影響舊檔） |
| 001 `contracts/stop-points.md` §4 | 已有 | status.mjs 照它讀停點紀錄 |

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：`node --test dev/tests/*.test.mjs` 全綠，本線新增 3 個測試檔（`media-cli`、`status`、`caps`），既有測試只改兩個斷言：`plan.test.mjs:78` 的 4.5 → 4.25（FR-006 置中）、`build.test.mjs:170` 的 12 → 音效數（FR-060）。
- **SC-002**：範例專案（`projects/範例`）跑 `build.mjs --check`：0 個 ✖；報告沒有「人聲在下面繼續」、沒有「開場前 30 秒」、沒有「只露臉」；有「節奏：continuous」與「沒有畫面的區間」兩行。
- **SC-003**：範例專案 build 後，`grep -c "window.__cues" projects/範例/work/hyperframes/index.html` 在有 custom 段時是 1、沒有時是 0。
- **SC-004**：`grep -nE "和 rough.srt 相減|起點相減|填回 .*data-duration" shared/template/USAGE-reference.md shared/template/custom/*.html` 沒有輸出（001、003 照本線契約改完後；A-14：只抓「叫 AI 自己相減」的寫法，「不要用 --check 的起點自己算秒數」這種提醒不算）。
- **SC-005**：剪乾淨從「使用者確認剪輯清單」到「cutpoints.json 寫好」，AI 不需要自己算任何秒數：用到的秒數全部是 `ng-snap`、`cutpoints`、`srt-split`、`snap-srt` 印出來的（007 弱模型試跑紀錄 `dev/loop/round-N.md` 逐項打勾）。
- **SC-006**：子母畫面飛入的第 0 格，PiP 區域和底下講者的同一區域平均像素差 ≤ 8/255；連續兩段子母畫面的段界前後一格 PiP 區域完全相同（FR-023、FR-025 的整合驗證）。
- **SC-007**：`node shared/template/tools/caps.mjs` 在作者的 Mac 上 ≤ 30 s 跑完，輸出沒有任何 `sk-` 開頭的字串。

## Assumptions

- HyperFrames 0.8.221 的子合成 DOM 掛在 host（`data-composition-src` 的元素）底下：`fx/effects/fx-kit.js:95-96` 的 `slotDuration` 用 `el.closest('[data-composition-src], [data-composition-file]')` 讀 host 的 `data-duration`，字卡動態的長度都靠它，證明 host 是祖先、而且 host 的 `data-duration` 才是實際長度。
- 主合成 `<head>` 的同步 `<script>` 會在任何子合成的 script 之前執行（HyperFrames runtime 在文件解析完後才 fetch 子合成並 `runScripts`）。
- `<video>` 的祖先元素做 transform 在 HyperFrames render 裡是對的：現行 03 側邊欄（`#footage` 的 x，`main.mjs:105-107`）與 punch（`#footage` 的 scale，`main.mjs:118-119`）已經這樣用。
- auto-editor 的 `--cut-out`、`--add-in` 每一段各寫一次旗標（2026-10-31 用 29.3.1 實測：同一個旗標後面接兩段 → 結束碼 1；重複旗標 → 兩段都生效）；`--margin 0.15sec`、`--export v1 -o <檔>.json` 在 29.3.1 實測可用（2026-10-31，用 ffmpeg 合成的 6 s 測試檔）。
- `work/cuts.md` 由 AI 照停點 ① 的格式寫（001 的 stop-points.md §1）；本線只規定機器怎麼讀，表格的欄名與 001 一致。
- 字幕在剪乾淨階段拆句（srt-split）時 plan.json 還沒有綁句號；之後要拆句一律到剪輯台。

## 待主代理裁決

1. **PiP 飛入在 HyperFrames 的畫質**：FR-023 用「容器 transform scale」做（和側邊欄、punch 同一類已驗證的寫法）。不確定的是 HyperFrames render 時 `<video>` 用原始解析度還是版面大小的畫格：如果是版面大小（終點那支 `<video>` 實際寬度約 1037 px），飛入頭幾格放大約 1.85 倍、變軟 0.2–0.3 s。退路：改成同時補間 `.pip` 與 `<video>` 的 left／top／width／height（版面屬性），代價是每格重排。建議先照 FR-023 做，SC-006 量不過再換退路。
2. **章節行為改變**：FR-006 置中、FR-008 章節前後由硬切改成墊底淡入；舊專案重 build 後章節起點最多晚 `(空檔 − 2.5)/2` 秒、接縫多 0.5 s 墊底。建議直接生效、不加開關（憲法 VIII）。
3. **`VOICE_WARN` 從 0.5 s 降到 0.1 s**：舊專案可能多出 ⚠；0.1 s（3 格）黑畫面肉眼看得到，01 P0-6 要「每一秒都被蓋住」，建議降。
4. **custom root 的 `data-duration` 不必等於段長**：依據是字卡動態的先例（Assumptions 第 1 條）；整合驗證若發現 HyperFrames 用 root 的值截斷時間軸，退路是 `--check` 改成 ⚠「data-duration 和段長不同 → 改成 N」（數字由工具算好）。
5. **擦入擦出只在只有聲音的區間內**（FR-030）：講者段的 media ↔ 全畫面接縫維持硬接。esim 的擦入只出現在旁白段；要擴大只改 FR-030 一個條件。
6. **`package-lock.json` 要不要進 git**：建議進（`npm ci` 可重現、鎖住間接依賴），代價是檔案大、跨平台可能有差異。
7. **ng-snap 用 auto-editor 判斷靜音**：和最後剪片同一套判斷；另一條路是重用 snap-srt 的能量包絡（`media.mjs:309-353`，零外部依賴），但門檻和 `-20dB` 不同，吸附的邊界可能落在 auto-editor 認為有聲音的地方。建議用 auto-editor。
8. **`FLASH_MAX` 用 1.0 s 而不是 01 P0-1 的 1.5 s**：和 `UNCOVERED_MIN` 共用一條界線，同一個空白不報兩次。
9. **結尾配樂淡出預設**：005 的 kit 值 2.0 s（建議初值，剪映配樂沒有淡出可抄）vs 01 §2.8 講者畫面與聲音淡出 1.851 s。本線讓 `outro.fadeOut` 可覆寫、預設跟 kit；要不要把 kit 值改成 1.85 由 005 決定。
10. **`--check --json` 兩種時間基準並存**：既有欄位是 rough.mp4 秒數（剪輯台用），新的 `out`、`outStart`／`outEnd` 是成片秒數（qc 用，004 已定）。沒有 `edit.cuts` 時兩者相同；有 cuts 時消費端要挑對欄位。

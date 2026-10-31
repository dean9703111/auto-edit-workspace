# Feature Specification: 005 sfx（音效替代、新事件、音量政策、剪接點評估）

**Feature Branch**: `005-sfx`

**Created**: 2026-10-31

**Status**: Draft

**Input**: 主代理派工「工作線 005 sfx：三批替代音效（B＋C）、新事件 click／sparkle／shine／thunder／chapter／bgm、`kit/sfx.json` 新欄位、音量跟剪映但上限人聲下 3 dB、剪接點交叉淡化評估、`audioKey` 加 `look`、`dev/tools/make-sfx.mjs`、測試」。

**依據**：分析報告 `analysis/03-sfx-sources.md`（下稱 03）、`03-sfx-map.json`（下稱 map）、`01-jianying-technique.md`（下稱 01）§2.7、§2.8、§5、§8、`02-skill-gap.md`（下稱 02）G15、G18、`00-phase1-report.md` §3；`specs/README.md` 定案；憲法 VII。agent-skills 的 `jianying-editing/SKILL.md` 簡寫 `JY/SKILL.md`、`references/sfx-palette.json` 簡寫 `JY/PAL`（02 §縮寫）。

**相關契約**：`specs/contracts/sfx.md`（本工作線寫）、`specs/contracts/cli-005.md`（本工作線寫）、002 的 `contracts/plan-fields.md`、`contracts/check-json.md`、`contracts/cues.md`、004 的 `contracts/media.md`（§2.2 時間語法，`clicks` 沿用）、006 的 `contracts/look.md`（§4 `look` 鍵與 `lut`，FR-033 照它）。

## 範圍

| 做 | 不做 |
|---|---|
| `shared/sfx/` 換 4 顆、加 6 顆（共 18 顆），全部 CC0 或作者合成以 CC0 釋出 | 把剪映快取 mp3 放進任何會進 git 的地方（憲法 VII；03 §4） |
| `kit/sfx.json` 加 `kind`、`event`、`additive`、`maxPerVideo`、`targetDb`（`bgm` 另有 `fadeIn`、`fadeOut`） | 疑問（G18「疑問 ≤ 1」）、金錢、秒針事件（定案沒列） |
| 音量政策、「音效比例」提醒、次數上限與每分鐘密度 ⚠ 的規則與函式（`audio.mjs`） | 改 plan.mjs、scene.json、media.mjs、build.mjs（列在「請 00N 加」） |
| `clicks`、`outro` 的語意（契約） | 同類音效最小間隔 25 s（01 §5.2 觀察值，沒人要求） |
| 剪接點 RMS 凹洞量測；有凹洞才做 0.1 s 交叉淡化 | 依 whisper 詞級時間或能量包絡重新決定剪接點（02 §368：要做就做成工具，不是這條線） |
| `dev/tools/make-sfx.mjs`（Node 零依賴＋ffmpeg）取代 `make_sfx.py` 的產生工作 | 重新產生凍結的 8 顆（`pop` `tick` `swipe` `whoosh` `flip` `type` `glitch` `riser`） |

## User Scenarios & Testing *(mandatory)*

### User Story 1 － 第一批：最常用的 4 顆聽起來像剪映定稿（Priority: P1）

作者剪完一支片，錯誤、提醒、成功、錄影點擊的聲音跟他在剪映定稿裡用的一樣「對味」：錯誤是電子蜂鳴「嗶-嗶—」不是木琴、提醒是平穩的「滴——」、成功是 C6–D6–G6–C7 上行琶音、錄影裡按按鈕有「喀-喀」兩聲。這 4 顆占剪映兩集音效用量 45／76 段（03 §6）。

**Why this priority**：用量最大，而且 C 路線（合成）幾乎能做到一模一樣（03 §5 C 表「高」）。

**Independent Test**：只做第一批也能交付：`node dev/tools/make-sfx.mjs --candidates --only alert --ref <AN>/sfx-preview/cuowu-jinggao-didi.wav --out <scratchpad>/w005/ab` 產生 A/B 試聽檔，作者選定後 `--write --only alert`，`node --test dev/tests/sfx.test.mjs` 全綠，範例專案 build 後 07 `tone: "warn"` 那張卡是新的聲音。

**Acceptance Scenarios**：

1. **Given** 第一批 4 顆已 `--write`，**When** 跑 `node --test dev/tests/sfx.test.mjs`，**Then** 18 項檢查中這 4 顆的檔案、長度、峰值、響度、欄位全過。
2. **Given** media 段寫 `"clicks": ["+1.00", "+1.63"]`，**When** `build.mjs --check`，**Then** 報告該段音效欄出現 `＋click×2`，且不會因為 3 s 規則拿掉同一秒的其他主音效。
3. **Given** 試聽檔放在工作區裡，**When** 跑 `make-sfx.mjs --candidates --out projects/x`，**Then** 結束碼 2 並印 `✖ 試聽檔不能放進工作區`（剪映原音不能進 repo）。

---

### User Story 2 － 音量跟剪映、但不會蓋過人聲（Priority: P1）

成片裡每顆音效的大小跟剪映定稿相對人聲的大小一樣（比現在大 2–7 dB，03 §0），但沒有任何一顆超過「人聲下 3 dB」；剪輯台把某段音效調太大聲時，build 會提醒。

**Why this priority**：定案。音量不對，換再像的音色都不對味。

**Independent Test**：不用換任何音檔也能測：凍結的 8 顆補上 `targetDb`，`sfxBudget()` 的單元測試（`dev/tests/audio.test.mjs`）用 contracts/sfx.md §10 的 fixture 驗。

**Acceptance Scenarios**：

1. **Given** 18 顆的 `targetDb` 與 `volume`，**When** 測試換算 `M max＋20·log10(volume)＋14`，**Then** 每顆和 `targetDb` 差 ≤ 0.5 dB，且 `targetDb ≤ −3`。
2. **Given** 01 章節段寫 `"sfxVolume": 2`，**When** build，**Then** 報告印 `⚠ 音效比例：1 顆音效比人聲下 3 dB 還大聲（s05 chapter 1:02.40 −1.0 dB → sfxVolume 再減 2.0）…`。
3. **Given** 收音很小的主軌（−26 LUFS → 調大 12 dB），**When** build，**Then** 不再印舊的「⚠ 人聲被調大 12 dB，音效相對人聲小了 12 dB」（誤報，見 FR-021）。

---

### User Story 3 － 第二批：咚咚、章節「嘭」、打卡成功（Priority: P2）

章節轉場有電影感的重低音「嘭——」，而且全畫面幕、切錄影不會跟著「嘭」（拆成 `chapter` 與 `whoosh` 兩個事件，03 §3 結構問題 1）；蓋章、數字落定是綜藝大鼓「咚、咚」。

**Why this priority**：「嘭」和現在的 whoosh「幾乎是相反的聲音」（03 §3），但要先拆事件才能換；需要 002 改 01 的 scene.json。

**Independent Test**：`--write --only chapter,impact` 後，`build.mjs --list` 的音效行有 `chapter`；002 改完 01 預設後，範例專案章節段報告寫 `chapter 0:xx.xx`、04 段仍是 `whoosh`。

**Acceptance Scenarios**：

1. **Given** 002 已把 01 改成 `{ "sound": "chapter", "at": "titleAt" }`，**When** `--check`，**Then** 章節段音效時間＝段起點＋0.45 s − `chapter.peak` ＋ 1 格。
2. **Given** 一段 04a fs-list，**When** `--check`，**Then** 音效仍是 `whoosh`（`start - 0.15`）。

---

### User Story 4 － 剪接點聲音有沒有凹洞，用數據決定（Priority: P2）

作者在剪映端量過「30 ms 淡出＋淡入在 −44 dB 底噪的旁白上會挖出 60 ms 凹洞」（02 G15）。工作區現在是 15 ms。用 dev 測試量清楚：沒有凹洞就維持 15 ms 並留下數據；有就改 0.1 s 交叉淡化。

**Why this priority**：定案「先量 RMS，有凹洞才改」。

**Independent Test**：`node --test dev/tests/audio.test.mjs` 的合成測試（不需要任何專案）；有範例 work/ 時 `AUTO_EDIT_RMS_PROJECT=projects/範例 node --test dev/tests/audio.test.mjs` 量真實素材。

**Acceptance Scenarios**：

1. **Given** −44 dBFS 底噪的合成音、接點在純底噪處，**When** 用 15 ms 微淡化，**Then** `cutDips` 判 0 個凹洞（低於底噪 −6 dB 的連續寬度約 13 ms < 20 ms）。
2. **Given** 同一段合成音，**When** 用 30 ms 微淡化，**Then** 判 1 個凹洞（約 29 ms ≥ 20 ms）——重現作者的觀察，證明量測方法抓得到。
3. **Given** 範例專案的 rough.mp4 與 cutpoints.json，**When** 跑 gated 測試，**Then** 每個接點的數據寫進 `specs/005-sfx/research.md`，並依 FR-031 決定要不要改交叉淡化。

---

### User Story 5 － 第三批：入場閃粉、亮點登場、打雷、結尾配樂（Priority: P3）

開場介紹講者、金句卡有「刷啦啦～」閃粉；本集最得意的設計有「登登登～」；壓力問句有雷聲；結語之後有一段感性配樂墊到片尾。

**Why this priority**：用量少（仙塵 6、閃亮 3、打雷 2、配樂 2 次，03 §2），而且 CC0 來源最不確定（03 §5 B 表「中到低」「低」）。

**Independent Test**：每顆獨立 `--write`；`bgm-outro` 等 002 的 `outro` 欄位完成後，範例專案寫 `"outro": { "from": "#N" }` build，報告有「結尾配樂：…」一行、`qc.mjs final` 0 ✖。

**Acceptance Scenarios**：

1. **Given** 4 段 15 金句 `tone: "warn"`，**When** `--check`，**Then** 印 `⚠ 音效 thunder 用了 4 次，每集上限 3 次（…）→ …`，4 顆都還在（不自動拿掉）。
2. **Given** `outro.from` 到片尾 40.5 s、配樂檔 16 s，**When** build，**Then** 配樂從片尾前 16 s 起播、淡入 3.2 s、淡出 1.85 s，印資訊行不印 ⚠。

---

### Edge Cases

- 某顆音效檔被 true peak −1.2 dBTP 壓住、M max 到不了目標（例：次低頻很多的 `chapter`）→ `volume` 照實測 M max 換算，可能 > 檔案目標算出的預估值；上限 `volume ≤ 1.0`，超過就把檔案目標調低重做（`--write` 印 ✖，見 cli-005 §1.6）。
- `sfxVolume`、`edit.volume.sfx` 是正數 → 可能超過 −3 dB 上限 → 只 ⚠，不自動壓（使用者在剪輯台調的優先，AGENTS.md 剪輯台第 3 條）。
- `--no-loudnorm` → 人聲不是 −14 LUFS，「音效比例」印「沒有檢查」而不是給錯的數字。
- `clicks` 寫在沒有游標的錄影段 → 工具無法判斷，文件規定「看得到游標按下才寫」；`--check` 不擋。
- 一集 0 個主音效（全是 media）→ 「音效密度」印 `主音效 0 顆`，不除以 0。
- 結尾配樂比 `outro.from` 到片尾還長 → 從 `from` 播到片尾、淡出；比較短 → 對齊片尾起播（contracts/sfx.md §6.2）。
- 舊專案（沒有 `look`、沒有 `clicks`、沒有 `outro`）→ 戳記、音效行為完全不變，不重新編碼。
- 私人 `--sfx` 資料夾只放 12 個舊檔 → plan.mjs 既有錯誤「音效檔 … 不存在」（002 把「12 個檔」改成依 `kit/sfx.json` 計數）。

## Requirements *(mandatory)*

每條的「驗」＝迴圈第 4 步審查員打勾的方法。

### A. `kit/sfx.json` 與音檔

- **FR-001** `kit/sfx.json` 照 `contracts/sfx.md` §1 的 schema：每項都有 `kind`、`zh`、`use`、`event`、`peak`、`volume`、`targetDb`、`additive`、`maxPerVideo`；`kind: "bgm"` 另有 `fadeIn`、`fadeOut`；不允許其他欄位。**驗**：`sfx.test.mjs`「欄位齊全」「沒有不認得的欄位」。
- **FR-002** 名稱固定 18 個，清單＝`contracts/sfx.md` §2。**驗**：`sfx.test.mjs` 比對 `Object.keys(kit)` 與契約表抽出的名稱（測試裡寫死同一份清單）。
- **FR-003** 凍結 8 顆（`pop` `tick` `swipe` `whoosh` `flip` `type` `glitch` `riser`）的 wav 位元組不變、`peak`／`volume` 不變，只補新欄位；`whoosh` 的 `use` 改成「全畫面幕進場、從講者切到螢幕錄影的第一段」。**驗**：`sources.json` 每筆新增 `sha256`（wav 檔本身），測試重算一致；`git diff --stat shared/sfx/*.wav` 只有被換、被加的 10 個檔。
- **FR-004** 所有音檔：WAV、PCM 16-bit、48 000 Hz、立體聲；true peak ≤ −1.0 dBTP（產生時上限 −1.2 dBTP，留 0.2 dB 給量測差，沿用 `make_sfx.py` `TP_CEIL`）；`kind: "sfx"` 長度 ≤ 各顆上限（FR-010～012 表），`kind: "bgm"` 10–20 s（派工要求）。**驗**：`sfx.test.mjs` 讀 WAV 檔頭、ffmpeg `ebur128=peak=true` 量。
- **FR-005** `kind: "sfx"` 第一個超過 −40 dBFS 的樣本前最多留 2 ms 靜音（`riser` 例外，沿用 `make_sfx.py` `finish()`）。**驗**：`sfx.test.mjs`「起音 ≤ 2.5 ms」（凍結 8 顆照 sources.json `onset_ms`，`riser` 跳過）。
- **FR-006** `peak`＝檔案最大絕對值樣本的時間（秒，3 位小數）；`|peak − 實測| ≤ 0.010 s`（派工要求）。合成配方要讓最大樣本落在「對齊點」（起音結束、第一下、按下那聲），做法寫在各配方（例：持平段每 100 ms 降 0.4 dB、第二聲小 1–6 dB）。**驗**：`sfx.test.mjs`。

### B. 三批替代音效（照 03 §6；每顆至少 3 個候選，含「保留現狀」對照組時另計）

共同欄位：**檔案目標**＝產生時把檔案的 M max（`bgm` 是整合響度）調到這個值（被 true peak 壓住時以實測為準）；**targetDb** 出處 map `rel_to_voice_db`（剪映兩集草稿相對人聲的中位數）壓到 ≤ −3；**預估 volume**＝`10^((−14＋targetDb−檔案目標)/20)`，實際值由 `--write` 依實測寫入；**A/B 參考**＝`analysis/sfx-preview/<檔>.wav`（只在 scratchpad，不進 repo）。Kenney 包的下載網址與 sha256 沿用 `make_sfx.py` 的 `SOURCES`（已核對過的值）：UI Audio `946fc23a…1d5eb6`、Interface Sounds `f2193d07…c81232`、Impact Sounds `029d734a…de77f8`、Sci-fi Sounds `119340f3…49e04`、Music Jingles `b729ba57…7197b8`，下載頁 `https://kenney.nl/assets/<slug>`；以下 Kenney 檔名中 Impact、Interface 兩包已在本機另一份解壓的包（`/Users/lindingyuan/web-survivor-old/assets/audio/kenney_*`）核對存在，其他包的檔名在實作 T020 列 zip 目錄確認。

- **FR-010 第一批**（用量 45／76 段：鼠标单击 23、错误警告-滴滴 12、滴，提示音 6、正确 4；03 §0、§6）

| 名稱 | 取代剪映 | 候選 | 路線與參數 | 檔案目標 | 長度上限 | targetDb | 預估 volume | A/B 參考 |
|---|---|---|---|---|---|---|---|---|
| `ding` | 滴，提示音 | `ding-a` | C：正弦 785 Hz、2 次諧波 −40 dB；起音 15 ms（raised-cosine）；15–400 ms 線性降 1.5 dB；400–870 ms 指數收尾（τ 0.08 s）。依據 03 §3「純正弦 785 Hz，起音 15 ms，平穩撐 0.4 s 再慢慢收，共 0.87 s」 | −20 LUFS | 1.0 s | −12.6 | 0.468 | `di-tishiyin.wav` |
| | | `ding-b` | C：同 a，起音 25 ms、2 次諧波 −30 dB（較圓） | | | | | |
| | | `ding-keep` | 現在的 `ding.wav`（對照組） | | | | | |
| `alert` | 错误警告-滴滴 | `alert-a` | C：帶限方波 234 Hz（奇次諧波到 8 kHz）＋117 Hz 正弦 −6 dB；兩聲 0–80 ms、100–260 ms，各 2 ms 起落；每聲內線性降 1 dB；第二聲 −1 dB。依據 03 §3「基音約 117 Hz，主峰 234 Hz，兩段 80＋160 ms，音量持平」 | −16 LUFS | 0.4 s | −6.9 | 0.569 | `cuowu-jinggao-didi.wav` |
| | | `alert-b` | C：117 Hz 帶限方波，時序同 a | | | | | |
| | | `alert-c` | B：Kenney Interface Sounds `Audio/error_006.ogg`（本規格實測 0.50 s、頻譜重心 1.1 kHz） | | | | | |
| | | `alert-keep` | 現在的 `alert.wav` | | | | | |
| `success` | 正确 | `success-a` | C：作者 `correct-3` 的 `synth_correct()` 改 D6（03 §5 C）：四音（起點 s, Hz, τ s）＝(0, 1046.5, 0.22)、(0.075, 1174.7, 0.22)、(0.150, 1568.0, 0.25)、(0.225, 2093.0, 0.45)；泛音（倍頻, 振幅, 衰減指數）＝(1, 1, 1)、(2, 0.32, 0.6)、(3, 0.12, 0.45)、(4.16, 0.07, 0.3)；起音 τ 2 ms；四音音量 0／−1.5／−2／−2.5 dB（四音重疊，最大樣本落在第四音、約 0.23 s；實作時量到剪映「正确」也是後段最大聲、到頂 0.17 s，所以對齊點＝最高音到位，不改音量）；長 1.0 s＋80 ms 淡出 | −16 LUFS | 2.0 s（2026-10-31 放寬，原 1.2 s） | −5.2 | 0.692 | `zhengque.wav` |
| | | `success-keep` | 現在的 `success.wav`（Kenney confirmation_002） | | | | | |
| | | （第二批加 `success-b`、`success-c`，見 FR-011） | | | | | | |
| `click` | 鼠标单击 | `click-a` | B：Kenney UI Audio `Audio/mouseclick1.ogg` 在 0 s＋`Audio/mouserelease1.ogg` 在 +0.125 s（−6 dB）。依據 03 §3「按下和放開兩聲相隔 125 ms」 | −24 LUFS | 0.35 s | −19.6 | 0.331 | `shubiao-danji.wav` |
| | | `click-b` | B：Kenney Interface Sounds `Audio/click_002.ogg` 0 s＋`Audio/click_004.ogg` +0.125 s（−6 dB） | | | | | |
| | | `click-c` | C：兩顆 3 ms 白雜訊（二階高通 6 kHz、指數衰減 τ 0.8 ms）＋4 kHz 共振（帶通 Q 8、τ 2 ms、−12 dB）；第二顆 +0.125 s、−6 dB | | | | | |

- **FR-011 第二批**（找 CC0 錄音再加工；03 §6）

| 名稱 | 取代剪映 | 候選 | 路線與參數 | 檔案目標 | 長度上限 | targetDb | 預估 volume | A/B 參考 |
|---|---|---|---|---|---|---|---|---|
| `impact` | 综艺-咚咚 | `impact-a` | B：Kenney Impact Sounds `Audio/impactSoft_heavy_001.ogg` 0 s＋`Audio/impactSoft_heavy_003.ogg` +0.12 s（−1.5 dB）＋`Audio/impactPunch_heavy_002.ogg` 疊在第一下 −8 dB（本規格實測頻譜重心 126／138／254 Hz；Punch 補中頻讓手機喇叭聽得到）。依據 03 §3「約 100 Hz 鼓皮聲加 300 Hz 共鳴，兩下」 | −16 LUFS | 0.8 s | −6.2 | 0.617 | `zongyi-dongdong.wav` |
| | | `impact-b` | B：`Audio/impactPunch_heavy_000.ogg` 0 s＋`Audio/impactPunch_heavy_004.ogg` +0.12 s（−1.5 dB） | | | | | |
| | | `impact-c` | C：兩下，每下＝正弦 130→90 Hz 指數滑音 0.15 s（起音 2 ms、τ 0.12 s）＋300 Hz 正弦 τ 0.05 s −8 dB＋4 ms 雜訊起音（一階低通 3 kHz）−12 dB；第二下 +0.12 s −1.5 dB；tanh 軟削波（drive 1.2） | | | | | |
| | | `impact-keep` | 現在的 `impact.wav`（A/B 時另聽字卡動態 01、02、03、16、24 的預設，這 5 支也用 `impact`） | | | | | |
| `chapter` | 综艺嘭字幕音效震撼出场 | `chapter-a` | B＋C：Kenney Sci-fi Sounds `Audio/lowFrequency_explosion_000.ogg`＋合成次低頻（正弦 60→35 Hz 指數滑音 1.0 s、τ 0.35 s、−3 dB）；tanh 軟削波（drive 1.5） | −16 LUFS | 2.5 s（2026-10-31 放寬，原 1.3 s；v2 合成仍用 1.3 s 的配方長度） | −3.0（剪映 +3.9 壓到上限） | 0.891 | `zongyi-peng-zimu.wav`（原檔就削頂 +2.2 dBTP，03 §2；試聽檔會被調到同響度） |
| | | `chapter-b` | B＋C：`Audio/lowFrequency_explosion_001.ogg`＋同一個次低頻 | | | | | |
| | | `chapter-c` | C：次低頻（同上）＋140 Hz（−6 dB、τ 0.25 s）＋250 Hz（−10 dB、τ 0.2 s）；起音 20 ms 帶通雜訊（中心 2 kHz、Q 1、−6 dB）；0.15 s 後 7 Hz 振幅顫動（深度 30 %）；tanh drive 1.5。依據 03 §3「58 Hz 超低頻加 140／250 Hz，起音帶 2 kHz 爆裂聲，80 ms 到頂，1 s 會顫動的隆隆尾巴」 | | | | | |
| `success`（挑戰者） | 打卡成功 | `success-b` | C：808 Hz FM 鈴（調變比 1:3.5、調變指數 2.5 以 τ 0.25 s 衰減；振幅起音 3 ms、τ 0.35 s，長 1.1 s）＋前 0.15 s 12 顆 2–6 kHz 短正弦亮片（各 20 ms、τ 8 ms、−14 dB、種子 20261031）。依據 03 §5 C | −16 LUFS | 2.0 s（2026-10-31 放寬，原 1.2 s） | −5.7 | 0.653 | `daka-chenggong.wav` |
| | | `success-c` | B：Kenney Interface Sounds `Audio/confirmation_001.ogg`（本規格實測 0.29 s、重心 823 Hz） | | | | | |

`success` 一個事件只有一個檔：作者在 `success-a`（第一批已上線的）、`success-b`、`success-c`、`success-keep` 裡選一個（「需要主代理裁決」第 8 條）。

- **FR-012 第三批**（新事件、用量少；03 §6）

| 名稱 | 取代剪映 | 候選 | 路線與參數 | 檔案目標 | 長度上限 | targetDb | 預估 volume | A/B 參考 |
|---|---|---|---|---|---|---|---|---|
| `sparkle` | 仙尘音效 | `sparkle-a` | C：正弦顆粒 0–1.6 s：0–0.33 s 間隔 40 ms 指數縮到 6 ms、0.33–1.6 s 再線性放寬到 25 ms（實作時改的：只撒到 0.9 s 的話 0.9 s 以後只剩「空氣」雜訊，撐不出 1.8 s 尾韻）；頻率 6→14 kHz 在 0–0.9 s 上升（±15 % 亂數）；每顆 15–40 ms 指數衰減；左右隨機定位 ±0.8；整體包絡 0.33 s 到頂、之後 τ 0.5 s 收到 1.8 s；疊 6 kHz 高通雜訊「空氣」−24 dB；種子 20261031。依據 03 §3「8→13 kHz 細碎高音往上撒，0.33 s 到頂，1.8 s 尾韻，立體聲很寬」 | −16 LUFS | 2.8 s（2026-10-31 放寬，原 2.0 s） | −5.9 | 0.638 | `xianchen.wav` |
| | | `sparkle-b` | B：Kenney Interface Sounds `Audio/glass_004.ogg` 0 s＋`Audio/glass_001.ogg` +0.10 s（−4 dB）＋`Audio/glass_006.ogg` +0.20 s（−6 dB）（本規格實測 glass_004 0.69 s、重心 7.2 kHz） | | | | | |
| | | `sparkle-c` | B＋C：a 的顆粒＋`glass_004.ogg` 疊在 0.30 s、−6 dB | | | | | |
| `shine` | 综艺闪亮登场音效 | `shine-a`～`c` | B：Kenney Music Jingles `Audio/Steel jingles/jingles_STEEL00`–`16.ogg`、`Audio/Pizzicato jingles/jingles_PIZZI00`–`16.ogg`、`Audio/Sax jingles/jingles_SAX00`–`16.ogg` 全部先量「後 0.3 s 頻譜重心 ÷ 前 0.3 s ≥ 1.3」（上行）且長度 ≤ 2 s，挑重心最接近 2.5 kHz 的 3 顆（實作結果：51 顆只有 `SAX02`、`PIZZI16`、`PIZZI02` 過門檻，重心 848／444／396 Hz，離 2.5 kHz 都很遠） | −16 LUFS | 2.0 s（2026-10-31 放寬，原 1.6 s） | −3.0（剪映 −2.5 壓到上限） | 0.891 | `zongyi-shanliang-dengchang.wav` |
| | | `shine-d` | C：鐘琴三音 F6 1396.9 Hz、C7 2093.0 Hz、G7 3136.0 Hz 在 0、0.05、0.10 s；每音模態比 1、2.76、5.40（振幅 1、0.35、0.12、τ 0.6 s）；尾巴疊 sparkle-a 的顆粒（3–8 kHz、1.3 s、−12 dB）。依據 03 §3「1.4→2.1 kHz 往上爬、最後亮到 3.2 kHz，0.13 s 到頂，尾巴 1.3 s」 | | | | | |
| `thunder` | 打雷音效 | `thunder-a` | B：OpenGameArt「Rain + Long Thunder」（WuxiaScrub）https://opengameart.org/content/rain-long-thunder ，截一聲雷 ≤ 1.4 s（雨聲蓋過就放棄這個候選）。**授權欄與檔名未核對**（本輪 OpenGameArt 頁面回 HTTP 403） | −16 LUFS | 2.5 s（2026-10-31 放寬，原 1.4 s；v2 合成仍用 1.4 s 的配方長度） | −3.0（剪映 −2.1 壓到上限） | 0.891 | `dalei.wav` |
| | | `thunder-b` | B：OpenGameArt「100 CC0 SFX #2」（rubberduck）https://opengameart.org/content/100-cc0-sfx-2 的 thunder 類。**檔名未核對** | | | | | |
| | | `thunder-c` | C：棕色雜訊（白雜訊積分、洩漏 0.995）一階低通 1 kHz；6 次爆裂在 0.04、0.10、0.17、0.26、0.37、0.50 s（振幅 0.5、0.6、0.7、0.8、1.0、0.7，各 τ 0.12 s）；105 Hz＋270 Hz 正弦（−6／−9 dB）跟同一包絡；整體 τ 0.35 s 收到 1.3 s；左右兩組獨立雜訊（種子 20261031／20261032）。03 §5 C 評「低」，當保底 | | | | | |
| `bgm-outro` | 自備結尾配樂（CC BY 4.0，不能用） | `bgm-a`～`c` | B：OpenGameArt CC0 作品，截 10–20 s、結束在終止式上、檔尾 2 s 淡出：「Pianosoft8」（Tozan）https://opengameart.org/content/pianosoft8 、「Distant Jingle」（Centurion_of_war）https://opengameart.org/content/distant-jingle 、「Title Screens Beginnings Collection」（Holizna）https://opengameart.org/content/title-screens-beginnings-collection 。**三個作品頁的授權欄都未核對**（搜尋結果標 CC0，頁面 403 打不開） | 整合響度 −20 LUFS | 10–20 s | −11.0（整合響度，見 FR-020） | 0.562 | 作者自己的「適合放在結尾，感性.mp3」前 20 s（作者用 ffmpeg 自己轉，`--ref` 指過去，不進 repo） |
| | | `bgm-d` | C：I–V–vi–IV–I（C–G–Am–F–C），每和弦 3.2 s、共 16 s；pad＝每音 3 個鋸齒波 ±7 cents、一階低通 1.5 kHz、起音 0.8 s、釋放 1.2 s；電鋼琴琶音＝FM 1:1、調變指數 2→0.3（τ 0.8 s）、八分音符 0.4 s（每和弦剛好 8 顆、75 BPM；原寫 0.333 s 除不盡 3.2 s）走和弦音 C4–C6；Schroeder 殘響（梳狀 29.7／37.1／41.1／43.7 ms、回授 0.84；全通 5.0／1.7 ms、g 0.7）濕 −10 dB；最後 2 s 淡出；種子 20261031。03 §5 C 提醒「合成容易聽起來廉價」 | | | | | |

- **FR-013 A/B 試聽**：每個名稱都用
  `node dev/tools/make-sfx.mjs --candidates --only <名稱> --ref <剪映試聽檔> --out <scratchpad>/w005/ab`
  產出 `<out>/<名稱>/<候選>.wav`（成品，檔案層級音量）、`<out>/<名稱>/ab-<候選>.wav`（參考 → 0.5 s 靜音 → 候選 → 0.5 s 靜音 → 參考，**兩者都調到成片大小**：M max＝−14＋targetDb）、`<out>/index.html`（播放器＋客觀表：長度、峰值秒、M max、true peak、頻譜重心，參考與每個候選並排）。`--voice <wav>` 時再出 `voice-<候選>.wav`：一段人聲（調到 −14 LUFS）上每 3 s 疊一顆候選，聽「墊在講話底下」的大小。**驗**：cli-005 §1 的輸出行；`sfx.test.mjs` 用 C 配方離線跑一次 `--candidates --only ding --out <tmp>`，檢查檔案都在、ab 檔長度＝參考×2＋候選＋1.0 s（±1 樣本）。
- **FR-014 選定與紀錄**：作者聽完說選哪個，改 `make-sfx.mjs` 的 `CHOICE` 再 `--write --only <名稱>`；選定結果（日期、名稱、候選 id、作者原話一句）寫進 `specs/005-sfx/research.md` 的「A/B 紀錄」表。作者沒選之前不 `--write`。**驗**：research.md 每個新／換檔的名稱各一列；`sources.json` 的 `candidate` 欄與紀錄一致。

### C. 音量政策

- **FR-020 換算表**（定案「跟剪映一樣但上限人聲下 3 dB」；換算式見 contracts/sfx.md §3）

| 名稱 | 剪映相對人聲（中位，範圍） | 現在工作區 | targetDb | 檔案目標 | 預估 volume | 出處 |
|---|---|---|---|---|---|---|
| `click` | −19.6（−19.6～−12.8） | —（新） | −19.6 | −24 | 0.331 | map 鼠标单击 |
| `alert` | −6.9（−7.6～−4.5） | −10.0 | −6.9 | −16 | 0.569 | map 错误警告-滴滴 |
| `ding` | −12.6（−15.2～−6.8） | −10.0 | −12.6 | −20 | 0.468 | map 滴，提示音 |
| `success` | −5.2（−7.1～−3.0）（打卡成功 −5.7） | −8.9 | −5.2（選 `success-b` 時 −5.7） | −16 | 0.692（0.653） | map 正确／打卡成功 |
| `impact` | −6.2（−12.7～−4.3） | −7.9 | −6.2 | −16 | 0.617 | map 综艺-咚咚 |
| `chapter` | +3.9（+2.7～+5.1） | −8.0（whoosh） | **−3.0** | −16 | 0.891 | map 综艺嘭；壓到上限 |
| `sparkle` | −5.9（−9.9～−3.6） | — | −5.9 | −16 | 0.638 | map 仙尘音效 |
| `shine` | −2.5（−2.5～−2.2） | — | **−3.0** | −16 | 0.891 | map 综艺闪亮登场；壓到上限 |
| `thunder` | −2.1（−2.3～−1.9） | — | **−3.0** | −16 | 0.891 | map 打雷音效；壓到上限 |
| `bgm-outro` | 整合響度 −11.9（esim）、−9.9（PPA） | — | −11.0（整合響度） | I −20 | 0.562 | 本規格 2026-10-31 量測，contracts/sfx.md §6.2 第 5 點 |
| `pop` | 剪映沒有對應 | −7.8 | −7.8 | 凍結 −17.4 | 0.6（不變） | sources.json −17.4＋20·log10(0.6)＋14 |
| `tick` | 同上 | −16.1 | −16.1 | 凍結 −24.9 | 0.55 | 同上算法 |
| `swipe` | 同上 | −8.9 | −8.9 | 凍結 −17.7 | 0.55 | 同上 |
| `whoosh` | 同上 | −8.0 | −8.0 | 凍結 −16.0 | 0.5 | 同上 |
| `flip` | 同上 | −9.9 | −9.9 | 凍結 −22.0 | 0.8 | 同上 |
| `type` | 同上 | −16.5 | −16.5 | 凍結 −20.0 | 0.3 | 同上 |
| `glitch` | 同上 | −11.1 | −11.1 | 凍結 −16.0 | 0.35 | 同上 |
| `riser` | 同上 | −8.9 | −8.9 | 凍結 −16.0 | 0.45 | 同上 |

  **驗**：`sfx.test.mjs`「targetDb 與實測一致（±0.5 dB）」「targetDb ≤ −3」。
- **FR-021 「音效比例」重新定義**（`audio.mjs` `audioReportLines`）：刪掉舊提醒「⚠ 人聲被調大 N dB，音效是固定音量，所以音效相對人聲小了 N dB」。理由：build 一律把人聲調到 −14 LUFS，音效相對人聲的大小只由 `targetDb`（＋使用者調的 `sfxVolume`、`edit.volume`）決定，跟原始收音大小無關；舊提醒在每支收音偏小（例：攝影機收音 −26 LUFS，調大 12 dB）的片都會誤報、還教人把音效調錯方向。新的一行報「主音效、附加音效相對人聲的範圍」，超過 −3 dB 上限才 ⚠；`--no-loudnorm` 時報「沒有檢查」。原文見 cli-005 §3.1。**驗**：`audio.test.mjs`「報告」測試改成：調幅 12 dB 時沒有 ⚠；`sfx.loud` 有 1 筆時有 ⚠ 且列出段 id 與要再調低的 dB。
- **FR-022** `SFX_RULES = { gapSec: 3, extraGapSec: 0.2, perMinute: 2, capDb: -3 }` 從 `audio.mjs` 匯出（contracts/sfx.md §4.2）。`shared/style.md` 音效段要寫出其中的 3 秒、每分 2 顆、人聲下 3 dB（0.2 s 維持只寫在 USAGE-reference R5.2，現狀），由 `sfx.test.mjs` 比對；style.md 表格的「每集上限」欄＝kit `maxPerVideo`（`—`＝`null`）。**驗**：測試讀 style.md 音效段，找得到「3 秒」「2 顆」「3 dB」，上限欄逐列相等。

### D. 事件語意（002 照 contracts/sfx.md 實作，005 提供函式）

- **FR-025 additive**：`tick`、`click` 是 `additive: true`，其他 `false`；語意見 contracts/sfx.md §4.1。**驗**：002 的 `plan.test.mjs` 跑 contracts/sfx.md §10 第 2、3 列；005 的 `sfx.test.mjs` 檢查只有這兩個是 `true`。
- **FR-026 maxPerVideo**：`sparkle` 6、`shine` 3、`thunder` 3，其他 `null`；超過時 1 種音效 1 行 ⚠，不拿掉。出處見 contracts/sfx.md §2。**驗**：`audio.test.mjs`「sfxBudget：thunder 4 次 → over 1 筆、warnings 1 行、原文照 cli-005 §3.2」。
- **FR-027 每分鐘密度**：主音效（非 additive）以 `floor(at/60)` 分組，任一組 > 2 顆 → 全片 1 行 ⚠；`--check` 另印資訊行「音效密度：主音效平均 N 顆／分」。**驗**：`audio.test.mjs` fixture（contracts/sfx.md §10 第 5 列）。
- **FR-028 clicks**：media 段與 custom 段的 `clicks` 陣列，語意與錯誤原文見 contracts/sfx.md §5。**驗**：004 的 `media.test.mjs`（欄位驗證）、002 的 `plan.test.mjs`（變成 `click` 附加音效）。
- **FR-029 結尾配樂**：`bgm-outro` 與 plan.json `outro` 的語意見 contracts/sfx.md §6；`audio.mjs` 匯出 `renderBgmClip(src, dst, { from, dur, fadeIn, fadeOut, gain })`（ffmpeg `atrim`＋`afade`＋`volume`，輸出 48 kHz 立體聲 pcm_s16le，檔名含參數 hash、同參數不重做）。**驗**：`audio.test.mjs`（需要 ffmpeg）：用合成 30 s 正弦當來源，`dur` 16 s、淡入 3.2 s → 輸出長度 16.000 s（±1 樣本）、第 0.1 s 的 RMS 比第 8 s 小 ≥ 20 dB、整合響度＝來源＋20·log10(gain)（±0.5 dB）。

### E. 剪接點交叉淡化評估（G15、01 P2-6；定案「先量 RMS，有凹洞才改」）

- **FR-030 量測方法**：`audio.mjs` 匯出 `cutDips(f32, { channels, rate, points, ref })`。
  - 10 ms RMS 窗、1 ms 步進，看每個接點前後 100 ms（派工要求）。
  - **底噪**＝`ref`（處理前的同一段聲音；沒給就用輸入本身）整檔 10 ms RMS 的第 10 百分位（dBFS）。
  - **凹洞**＝處理後的 RMS 連續 ≥ 20 ms 低於「底噪 − 6 dB」，而且處理前同一位置沒有低於（`preexisting: false`），**而且比處理前同一位置低 ≥ 6 dB**（實作時加的第三個條件：範例 10 個停頓接點裡有 2 個的參考只比門檻高約 3 dB，淡化掉 3 dB 就被算成凹洞；加了之後才是「淡化本身挖出 6 dB 以上」。數據見 research.md「剪接點 RMS」）。20 ms 出處：`JY/SKILL.md` 主音軌接縫第 1 條「連續 ≥ 20 ms」；−6 dB 是**建議初值**。
  - 解析預期（本規格用 `scratchpad/w005/dipwidth.mjs` 算，穩定底噪上、V 形淡化）：

| 淡化（每側） | 10 ms 窗最低 | 低於底噪 −6 dB 的寬度 | ±100 ms 平均損失 | 判定 |
|---|---|---|---|---|
| 15 ms（現行 `CUT_FADE`） | −14.3 dB | 13 ms | −0.46 dB | 不是凹洞 |
| 20 ms | −16.8 dB | 19 ms | −0.62 dB | 不是凹洞（臨界） |
| 30 ms（作者實測會挖洞的長度） | −20.3 dB | 29 ms | −0.97 dB | **凹洞** |

  **驗**：`audio.test.mjs` 合成測試三條（Acceptance US4 第 1、2 條＋硬切 0 凹洞）。
- **FR-031 真實素材與決策**：`AUTO_EDIT_RMS_PROJECT=projects/範例 node --test dev/tests/audio.test.mjs` 在 `<專案>/work/rough.mp4` 與 `work/cutpoints.json` 都在時才跑（否則 skip，原因寫「沒有 work/rough.mp4」）：抽 rough.mp4 聲音（48 kHz、立體聲 f32），複製一份套 `applyDipsToFile`（現行 15 ms），`cutDips(處理後, { ref: 處理前 })`，用 `t.diagnostic` 印每個接點一列（秒數、ng／pause、底噪、最低、寬度、是否凹洞），斷言凹洞數＝0。
  - 0 個凹洞 → 維持 15 ms，數據表貼進 `specs/005-sfx/research.md`「剪接點 RMS」節，`CUT_FADE` 的註解改指到 research.md。
  - ≥ 1 個凹洞 → 做 FR-032。
  - **驗**：research.md 有數據表與結論一行；測試在有 work/ 的機器上綠。
- **FR-032（條件式，FR-031 有凹洞才做）0.1 s 交叉淡化**：`encodeFootagePolished(src, dst, { …, join: { mode: 'xfade', source, chunks, fps } })`：從 `source`（`work/main.mp4` 或唯一一支真人錄影）依 `work/cuts.v1.json` 的保留段（`chunks` 裡速度 1.0 的 `[起始幀, 結束幀]`）重組聲音：每段兩側各多取 50 ms（素材頭尾不夠就取到頭尾），相鄰兩段重疊 100 ms（`CUT_XFADE = 0.1`，出處 G15、01 P2-6 的 0.1–0.27 s 取下限）用等功率（sin／cos）交叉淡化，中心對齊剪接點 → 輸出長度與 rough.mp4 相同（±1 樣本），字幕、動畫、音效時間全部不用動。`AUDIO_VER` 改 2；報告行改成 `剪接點交叉淡化：N 個接點，重疊 100 ms`（cli-005 §3.1）。需要 002 在 build 傳 `join`（請 002 第 9 條）。**驗**：同一份範例素材重跑 FR-031 → 0 個凹洞；`ffprobe` 長度與 rough.mp4 相同；每個接點 ±3 s 輸出試聽檔到 scratchpad 給作者聽（02 G15 驗證方式）。

### F. 快取戳記

- **FR-033** 照 006 的 `contracts/look.md` §4（2026-10-31 版）：
  - `audioKey({ src, cutpoints, loudnorm, declick, frame, look = null })`：`look` 不是 `null` 時放進戳記（`...(look ? { look } : {})`，跟 `frame` 同做法）。`look`＝`ensureLook().key`，內容 `{ v, color, lut, slim, footage }`，005 不解讀、原樣放。
  - `encodeFootagePolished(src, dst, { …, lut = null })`：兩處 `encodeFootage(...)` 原樣帶 `{ crop, lut }`（`lut` 怎麼套是 006 的 `lib/ff.mjs` 的事）。
  - **驗**：`audio.test.mjs`「沒有 look 時戳記和現在完全相同（JSON 字串相等）」「look 的任一欄位不同 → `stampMatches` false」「`lut: null` 時輸出和改版前相同（現有整支流程測試不改仍綠）」；套 LUT 的端到端由 006 的 `look.test.mjs` 驗。

### G. 產生工具與來源紀錄

- **FR-034 `dev/tools/make-sfx.mjs`**：只用 Node 22 內建模組（`node:fs` `node:path` `node:crypto` `node:zlib` `node:child_process` `node:os` `node:url`）＋ffmpeg／ffprobe（工作區既有依賴，憲法 II）；自己寫 WAV（RIFF、PCM 16-bit、48 kHz、立體聲）、自己讀 zip（中央目錄＋`inflateRawSync`）；合成、混音、增益、截長、淡入淡出在 JS 做；解碼（ogg、flac、mp3）與量測（`ebur128=peak=true`）交給 ffmpeg。指令、參數、輸出原文見 cli-005 §1。
  - C 配方用固定種子（mulberry32）→ 同一台機器跑兩次位元組相同。
  - B 配方：Kenney 包照 `make_sfx.py` `fetch()` 的流程（先開素材頁拿 cookie，再打 download-link 拿簽章網址）；OpenGameArt 用 `https://opengameart.org/sites/default/files/<檔名>`；每個下載檔核對 sha256，配方還沒登記 sha256 的（第三批 OpenGameArt 候選）只能 `--candidates`，`--write` 會 ✖。
  - `--write` 只改這幾個地方：`shared/sfx/<名稱>.wav`、`sources.json` 那一筆、`kit/sfx.json` 那一項的 `peak` 與 `volume`、`shared/sfx/README.md`（整份依 sources.json＋kit 重產）。kit 裡沒有那一項就 ✖（先照 contracts/sfx.md §2 手動加 `kind`、`zh`、`use`、`event`、`targetDb`、`additive`、`maxPerVideo`）。
  - **驗**：`sfx.test.mjs`「make-sfx 只用內建模組」（掃 import）、「C 配方兩次輸出 sha256 相同」、「--out 在工作區內 → 結束碼 2」。
- **FR-035 `sources.json`**：每個名稱一筆，欄位＝現有欄位＋`sha256`（wav 本身）＋`kind`；換、加的 10 筆另有 `recipe`（候選 id）、`route`（`"B"`／`"C"`／`"B+C"`）；B 的每個來源寫 `source_pack`、`source_author`、`source_file`（zip 內路徑）、`source_url`、`download_url`、`zip_sha256`、`license: "CC0 1.0"`、`license_url`；C 寫 `source: "程式合成（dev/tools/make-sfx.mjs 配方 <id>）"`、`license: "CC0 1.0"`、`license_note: "作者合成，以 CC0 1.0 釋出（2026-10 定案）"`。**驗**：`sfx.test.mjs`「sources.json 欄位」。
- **FR-036 `shared/sfx/README.md`**：開頭改成「18 個音效：取自 CC0（公眾領域）素材，或作者合成並以 CC0 釋出」；表格每個名稱一列（檔名、聽起來像、用在哪、來源、授權）；「作者端重新產生」改成 `node dev/tools/make-sfx.mjs --write --only <名稱>`，並說明凍結的 8 顆由舊工具產生、處理方式記在 sources.json `processing`。**驗**：`sfx.test.mjs`「README 每個名稱一列」。
- **FR-037 `NOTICE.md` 音效段**：「12 個」改「18 個」；Kenney 段補 Music Jingles（若 `shine` 選 B）並列出每包對應的檔名；OpenGameArt 段補 `thunder`、`bgm-outro` 的作品頁（若選 B）；新增「作者合成」小節：列出合成的檔名、`dev/tools/make-sfx.mjs`、CC0 1.0 釋出。**驗**：`sfx.test.mjs`「NOTICE 音效段提到每個檔名」。
- **FR-038 `make_sfx.py` 退役**：檔頭加兩行「已由 `dev/tools/make-sfx.mjs` 取代；只保留當凍結 8 顆的處理紀錄」，在 numpy 等第三方 import 之前 `if __name__ == "__main__": sys.exit(…)` 並印同一句（放在 `main()` 裡的話，沒裝 numpy 的機器會先 ImportError、印不出說明）（避免有人重跑它把新檔蓋回舊檔、把 sources.json 縮回 12 筆）。**驗**：`python3 dev/tools/make_sfx.py` 結束碼 ≠ 0 且印出取代說明（作者機器上手動跑一次，記在 research.md）。
- **FR-039 授權護欄**（憲法 VII）：`shared/sfx/**`、`kit/sfx.json`、`NOTICE.md` 音效段不出現剪映音效名與剪映、CapCut 字樣；剪映試聽檔只能透過 `--ref` 讀，`--out` 必須在工作區外。**驗**：`sfx.test.mjs` 掃這些檔，找不到 `剪映|CapCut|综艺|鼠标|仙尘|打卡成功|正确`。

### H. 測試

- **FR-040 `dev/tests/sfx.test.mjs`（新）**：FR-001～006、FR-013、FR-020、FR-022、FR-025、FR-034～037、FR-039 的檢查；需要 ffmpeg 的部分沒有 ffmpeg 就 skip（沿用 `audio.test.mjs` 的 `SKIP` 寫法）。
- **FR-041 `dev/tests/audio.test.mjs`（改）**：`sfxBudget` fixture、「報告」測試改寫（FR-021）、`cutDips` 三條合成測試＋一條 gated 真實素材（FR-030、031）、`audioKey` look（FR-033）、`renderBgmClip`（FR-029）。只能加測試、改「報告」那一條；`helpers.mjs` 只加函式（README 規定）。

### Key Entities

- **音效設定**（`kit/sfx.json` 一項）：名稱、kind、時機（event）、預設大小（targetDb→volume）、對齊點（peak）、是否附加、每集上限。
- **音檔來源紀錄**（`sources.json` 一筆）：路線（B／C）、原始檔與 sha256、處理鏈、實測響度。
- **cue**：段 id、音效名、起播秒數、最終音量、是主音效還是附加音效。
- **剪接點量測列**：秒數、ng／pause、底噪、最低 RMS、低於門檻寬度、是否凹洞。

## 請 00N 加

### 請 002 加

1. scene.json 預設（contracts/sfx.md §7）：01 chapter `sfx.main` 改 `{ "sound": "chapter", "at": "titleAt" }`（等 `chapter.wav` 進 repo）；14 speaker 改 `{ "sound": "sparkle", "at": "in + 0.1" }`；15 quote 改 `{ "sound": { "default": "sparkle", "good": "sparkle", "warn": "thunder" }, "at": "in + 0.1" }`（等 `sparkle`、`thunder` 進 repo）。
2. plan.mjs：`SFX_GAP`、`EXTRA_GAP` 改從 `audio.mjs` 的 `SFX_RULES` import；3 s 規則跳過 `additive: true` 的音效（contracts/sfx.md §4.1）。
3. plan.mjs：段落 `sfx` 只接受 `kind: "sfx"`，`bgm` 名稱 → ✖（原文 cli-005 §3.3）；錯誤訊息「shared/sfx/ 要有完整的 12 個檔」改成依 `Object.keys(sfxConf).length`。
4. plan.mjs：custom 段加 `clicks` 欄位；media 段讀 004 解析好的 `it.media.clicks`；兩者都變成 `click` 附加音效（`sfxExtra: false` 時不加）。
5. plan.mjs：音效段最後（`edit` 音量調整之後）呼叫 `sfxBudget(cues, sfxConf, { voiceDb: edit.volume.voice, outDur, fmt })`，`warnings` 推進全域 warnings、`lines` 印在 `--check` 文字報告最後；`--check --json` 加 `sfxCount`、`sfxBudget`（寫進 `contracts/check-json.md`）。
6. build.mjs：`audioReportLines(info, { …, sfx: budget })`；`--list` 音效行跳過 `kind: "bgm"`、每顆後面標「附加」「每集 ≤ N」，另起一行「結尾配樂（plan.json "outro"）：bgm-outro」。
7. plan-fields.md 加第一層 `outro`（contracts/sfx.md §6.1）；build 呼叫 `renderBgmClip`、`lib/main.mjs` 放 `<audio id="bgm-outro">`；報告印「結尾配樂：…」（原文 cli-005 §3.4）。
8. `dev/tests/build.test.mjs:170` 的 `12` 改成 `Object.keys(kit/sfx.json).length`；`plan.test.mjs` 加 contracts/sfx.md §10 的 fixture。
9. （只有 FR-032 成立時）build 傳 `join: { mode: 'xfade', source, chunks, fps }` 給 `encodeFootagePolished`；`source`＝有 `work/main.json` 時 `work/main.mp4`，否則 `素材/真人錄影/` 唯一一支，`chunks` 讀 `work/cuts.v1.json`；兩個檔不在 → 退回 15 ms 並印 `⚠ 剪接點交叉淡化：找不到 work/cuts.v1.json，改用 15 ms 微淡化 → 照 AGENTS.md「剪乾淨」第 7 步存 cuts.v1.json`。

### 請 004 加

1. `MEDIA_KEYS` 加 `clicks`；`checkMediaSeg`／`resolveMedia` 驗證並解析成 `m.clicks`（成片秒數陣列），時間文法與錯誤原文照 contracts/sfx.md §5（和 `marks[].at` 共用 `tAt`、`inSeg`）；`contracts/media.md` 與 `--list` 的 media 表加這一列。

### 請 003 加

1. `shared/template/index.html` 音效區：顯示 `event`、「附加」、「每集 ≤ N」；`kind: "bgm"` 不放進「段落音效」表，另列一行「結尾配樂」。
2. `fx/catalog.json` 不改（記錄在案：字卡動態的音效是動畫節拍的一部分）。
3. 有游標的情境動畫範例（例：G11 的 `x-ui-mock.html`）檔頭註明「游標按下用 `P.at('#N@詞')`；plan.json 該段 `clicks` 寫同一個錨點」。

### 請 006 加

1. （已完成：`contracts/look.md` §4 已寫明 `ensureLook().key` 與 `lut` 轉傳；005 照做，見 FR-033。）
2. 剪輯台的音效選單（`editor.mjs` 讀 `--list --json` 的 `sounds`）排除 `kind: "bgm"`。

### 請 001 加

1. `docs.md` 的原文：`shared/style.md` 音效段、`AGENTS.md` 剪好看第 5 步、`USAGE.md` §2.8 聲音段、`USAGE-reference.md` R5.2。
2. `dev/README.md` 表格：`tools/make_sfx.py` 一列改成 `tools/make-sfx.mjs`（`node dev/tools/make-sfx.mjs --help`；不用 Python）。
3. `docs.test.mjs` 的門檻數字清單加：3 秒、每分 2 顆、人聲下 3 dB、15 毫秒（或 FR-032 成立時的 100 毫秒）。
4. 分鏡表 Skill 的音效欄：寫「預設」、`clicks N 下`、`outro`；`thunder`／`shine`／`sparkle` 照 style.md 每集上限。

## 需要主代理裁決

1. **`click` 不設 `maxPerVideo`**（建議）：G18 寫「單擊 ≤ 2」，出處是 `JY/SKILL.md` 的 `sfx_click_max` 預設 2，但那是給「依字幕關鍵詞」自動加的點擊；作者 esim 定稿實際有 22 顆（都對到畫面游標，01 §5.2）。工作區的 `click` 只能從 `clicks`（看得到游標才寫）來，所以建議不設上限。要照 G18 就把 `click.maxPerVideo` 改 2。
2. **每分鐘 ≤ 2 顆主音效只 ⚠、不自動刪**（建議）：工作區每張卡都有預設主音效（style.md 密度「每 1–4 句一段」），現在的片大概每分鐘 3–6 顆會超過；自動刪會改變 002 的預設聲音設計。替代方案：(a) 依優先序自動刪到 2 顆；(b) 門檻改成 4。
3. **結尾配樂沒有已核對的 CC0 曲目**：三個 OpenGameArt 候選的授權欄本輪打不開（HTTP 403），長度與檔名也沒核對；合成鋪底 `bgm-d` 可能聽起來廉價。作者原本用的「Carefree」是 CC BY 4.0，不能進 `shared/sfx/`，只能放私人 `--sfx` 資料夾。需要作者在瀏覽器打開候選頁核對授權並試聽。
4. **`thunder` 的 CC0 錄音也未核對**（同上原因）；合成保底 03 評「低」。可接受「三個都不像就先不上 `thunder`，15 warn 退回 `alert`」嗎？
5. **「音效比例」舊提醒是誤報**（FR-021）：audio.mjs 是 005 的檔，我會改；001 的 USAGE §2.8 文字要一起換（docs.md 已附原文）。
6. **`make_sfx.py` 只凍結不移植**（建議）：全部移植成 Node 會讓凍結的 8 顆重產、位元組改變、要重新 A/B；只移植新配方最小。
7. **`impact` 換成「咚咚」會影響 5 支字卡動態**（01、02、03、16、24 的預設）：A/B 時一起聽；不合時只能保留舊 `impact`，「咚咚」改新名稱——但那是定案以外的新事件。
8. **`success` 二選一**：「正确」型（`success-a`，第一批）或「打卡成功」型（`success-b`／`c`，第二批）；一個事件一個檔。
9. **契約檔名**：本工作線照派工寫 `contracts/cli-005.md`，README 契約表寫的是 `contracts/cli.md` 各加一節（001 也遇到同一個問題）。
10. **配樂跟著「音效」總音量**（`edit.volume.sfx`）：建議沿用；另開 `edit.volume.music` 要 006 改剪輯台。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：`node --test dev/tests/sfx.test.mjs dev/tests/audio.test.mjs` 全綠（有 ffmpeg 的機器上 0 skip，gated 真實素材測試除外）。
- **SC-002**：18 個名稱都有檔；換、加的 10 個在 research.md 的 A/B 紀錄都有作者選定的一列。
- **SC-003**：範例專案 `build.mjs --check` 音效相關 0 ✖；build 報告有「音效比例」一行，且 0 顆超過人聲下 3 dB（不寫 `sfxVolume` 時）。
- **SC-004**：`shared/sfx/`、`kit/sfx.json`、`NOTICE.md` 音效段掃不到剪映音效名（FR-039）。
- **SC-005**：剪接點 RMS：合成 15 ms → 0 凹洞、30 ms → 1 凹洞；範例專案的數據與決策寫在 research.md。
- **SC-006**：`make-sfx.mjs` 的 C 配方同機兩次輸出 sha256 相同；`--out` 指進工作區一定被擋。

## Assumptions

- 人聲固定 −14 LUFS（`LOUD.I`），`qc.mjs final` 響度 −15.5～−12.5 LUFS 的範圍不變；結尾配樂墊在人聲下 11 dB，整合響度預估最多抬高約 0.3 dB（−14 與 −25 LUFS 能量相加）。
- 剪映試聽檔留在作者本機 scratchpad（`analysis/sfx-preview/`），實作者能讀到。
- 作者會親自聽 A/B 並回覆選擇；沒選的名稱不上線（對應的 002 預設也不改）。
- 第三批 OpenGameArt 候選要作者在瀏覽器打開作品頁核對授權後，才把 sha256 登記進配方。
- 006 的 `look.md` 若再改 §4 的欄位，以 look.md 為準；005 不解讀 `look` 內容，只需要參數名一致。

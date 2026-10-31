# 審查 r1-A：002 pipeline-timing＋005 sfx（2026-10-31，只讀審查員 A）

## 怎麼驗的

- `node dev/check-all.mjs --keep --skip-tests`：全部通過，留下合成專案（70 秒、20 句、8 段）。另外把它複製到 scratchpad（`…/scratchpad/rA/proj/專案`），改出三種 plan：V1 章節墊底＋PiP 接續＋章節壓人聲；V2 rough.mp4 前 10 秒塗黑（只有聲音的區間）＋media↔動畫幕擦入擦出；V3 thunder×4、additive tick、clicks、chapter `sfxVolume: 2`、outro。
- snapshot 一律用工作區釘的 `node_modules/.bin/hyperframes`（0.8.221），截圖在 `…/scratchpad/rA/{pip,ch1,ch2,wipe,cust}/`。
- 剪乾淨三個指令：合成一支有真正靜音的片（0–5 s 有聲、5–9 s 靜音、14–14.5 s 靜音），用 ng-snap 印出的第 2、3 行**真的跑 auto-editor 29.3.1**，再跑 cutpoints、srt-split。另外用手寫的 `--v1` 檔測吸附算法。
- `node --test dev/tests/*.test.mjs`：437 個測試，436 pass、0 fail、1 skip（gated 的 RMS 真實素材測試）。
- 範例專案：複製到 scratchpad 才跑 `--check`（沒有寫進 `projects/範例`）。

## 問題表

| 編號 | 等級 | 位置（檔:行 或 指令） | 問題 | 證據（原文／截圖路徑） | 修法 |
|---|---|---|---|---|---|
| A-01 | P0 | `tools/media.mjs:596-611` `chapterKeep`（搜尋窗 `CUT.early 0.6／late 1.5`） | 章節開口的搜尋窗只有表上時間 −0.6～+1.5 s。逐字稿常把那一句的起點標在停頓**裡面**（比開口早好幾秒），這時搜尋窗找不到靜音段終點，ng-snap 就印「找不到停頓，不保留」，auto-editor 會把整段停頓剪到剩 0.3 s，章節接著會壓到人聲。round-1 的弱模型試跑已經踩到（章節 2、4），**現在還沒修**。⚠ 的修法叫使用者「確認時間碼是那一句的起點」，但它本來就是逐字稿那一句的起點，弱模型改不動 | `chapterKeep([{t:5.3}], [[5.167,8.867]], 0.15)` → `{"none":true}`（4 s 的停頓整段沒保留）；`dev/loop/round-1.md:28` | 先找「包含 t 的靜音段」，用它的終點當 `b`；沒有的話往後找到 +6 s（或下一個有聲段的起點）裡第一個靜音段終點。印 `章節 N 時間碼比開口早 X s，已改用開口 m:ss.ss`。spec FR-003、cli-002 §2 一起改，並加 `media-cli.test` 案例「t 落在停頓中間」 |
| A-02 | P1 | `tools/status.mjs:72`、`:87`（S6）；`cli-002.md` §5.2 S6；spec FR-040 | S6 拿「有沒有 `work/rough.srt.bak-*`」判斷 snap-srt 跑過沒有，可是 srt-split 也寫同一種備份檔名。照 S5 跑完 srt-split 之後，status 直接跳到 S7，**snap-srt 被跳過**，成片字幕會比嘴巴早約 1 秒（REVIEW.md 的 P0 類）。只在中途換 session、用 status 接手時才會發生 | 暫存專案：status 先印 `目前在：剪乾淨／字幕拆句`；跑 `srt-split` 後印 `目前在：剪乾淨／剪接點`、`依據：沒有 work/cutpoints.json` | srt-split 的備份改名（例：`rough.srt.split-<時間戳>`），或 snap-srt 另外寫一個標記檔（例：`work/.cache/snap-srt.json`），S6 改看那個標記。FR-040、cli-002 §4／§5.2、`status.test` 同步改 |
| A-03 | P1 | `tools/media.mjs:663`（ng-snap ✖）、`tools/build.mjs:26`（`--help`） | 工具印給 AI 看的修法指向 `specs/contracts/stop-points.md`、`specs/contracts/cues.md`，但 AGENTS.md:52 規定剪片時 `specs/` 不要讀。弱模型要嘛違規，要嘛卡住 | `✖ work/cuts.md 裡找不到 NG 表…→ 照停點 ① 的格式（specs/contracts/stop-points.md §1）` | 改成指向 AGENTS.md「停點總表」（或 `auto-edit-rough` Skill）；`--help` 改寫「見 USAGE-reference R7.3」。在 docs.test 加檢查：工具字串不能出現 `specs/` |
| A-04 | P1 | `specs/005-sfx/research.md:13-22`（SC-002） | 換掉、新增的 10 顆裡，有 6 顆的「作者原話」還是「（待作者試聽）」，FR-014 要的作者選定還沒做。檔案已經用暫定的 `CHOICE` 寫進 `shared/sfx/` | research.md 表上 ding、alert、click、chapter、sparkle、shine 六列都是 `（待作者試聽）`；research.md:24 另外記了 impact／chapter／thunder 的頻譜重心比參考低約一個八度 | 交付報告請作者試聽 `w005/ab/index.html`，回覆後補表（不是程式問題，但 SC-002 不能打勾） |
| A-05 | P2 | `tools/media.mjs:587` `snapNg` | NG 只有一邊吸到停頓時（起點找不到、終點落在停頓裡），表上「對齊停頓後」的終點其實已經移動了，旁邊卻寫「⚠ 前後 1.0s 內沒有停頓，用原值」。終點如果落在章節停頓裡，會被吸到停頓終點，把章節保留區整段吃掉 | `snapNg([{start:3,end:6}], [[5.167,8.867]])` → `a:3, b:8.867, miss:true`（終點移了 2.87 s，卻標「用原值」） | `miss` 分成 `missStart`／`missEnd`，訊息照實寫哪一邊用原值。終點落在章節空檔表那一章的停頓裡時，改吸到停頓**起點** |
| A-06 | P2 | `tools/lib/plan.mjs:642` | 只有聲音的區間沒被蓋住的部分如果在**第一段之前**（或最後一段之後），⚠ 的修法「把前一段的 to 延到下一段的 from」用不上，因為根本沒有前一段 | V2：`⚠ 只有聲音的區間 0:00.00–0:01.00 有 1s 是黑畫面 → 把前一段的 to 延到下一段的 from（0 秒相接）`（m00 是第一段） | 區間前面沒有段時改成「把 <下一段 id> 的 from 提早到 <區間起點>」；後面沒有段時同理處理 to |
| A-07 | P2 | `tools/media.mjs:64` `parseArgs` | `--key=value` 寫法：值裡面有 `=` 會被截斷，而且不會報錯（契約寫 `--key=value` 可以用，AGENTS 又把 −20dB 解釋成 `threshold=0.1`） | `parseArgs(['ng-snap','--edit=audio:threshold=0.1'])` → `edit: 'audio:threshold'` | 改成只在第一個 `=` 切：`const i = s.indexOf('='); k = s.slice(0, i); v = s.slice(i + 1)` |
| A-08 | P2 | `lib/plan.mjs:33-...`（rhythm／outro.*／`sfx：只能是`／clicks 陣列）、`media.mjs`（`rough.srt 讀不到任何字幕`、cutpoints 的「沒有 NG 表」⚠、ng-snap「保留區改從…」⚠）、`audio.mjs`（renderBgmClip 失敗）、`build.mjs` 的「找不到 plan.json」 | 新加的 ✖／⚠ 有十幾則沒有「→ 改法」（憲法 III.4；check-json §1 第 4 條要求每則都有 →）。大多照抄契約原文，所以 **cli-002／cli-005 也要一起補** | `✖ outro.music：「pop」不是配樂（可用：bgm-outro，或 null 不配）`；`✖ rhythm 只能是 … 現在是 "dense"`；`⚠ 沒有 work/cuts.md 的 NG 表，剪接點全部標 pause` | 每則補 `→ 改 …`（例：`→ 把 music 改成 "bgm-outro" 或 null`、`→ 刪掉 rhythm 或改成 "continuous"`、`→ 有 NG 就照停點 ① 補 NG 表再跑一次`）；契約原文同步改 |
| A-09 | P2 | 報告原文和契約的小差異 | ① 結尾配樂：`淡出 1.9 秒`，cli-005 §3.4 是 `1.85 秒`（`toFixed(1)` 把 1.85 進位成 1.9）。② 只有聲音那一行：`，10s）`，cli-002 §1.5 是 `，30.0s）`。③ caps 的 mmx：`mmx auth status：method api-key，source config.json`，契約是 `已登入（method api-key，source config）`。④ ng-snap 第二行：`（存在 work/.cache/…）`，契約是 `（快取 …）`。⑤ status 的 S11 多了「先跑 look.mjs run…」前綴，cli-002 §5.2 沒有 | build／caps／ng-snap／status 的實際輸出（見上面各節） | 以程式為準時改契約，以契約為準時改程式；docs.test 的逐字比對要涵蓋這幾行 |
| A-10 | P2 | `lib/audio.mjs:257` | 主音效**平均**超過每分鐘 2 顆時，只印資訊行、沒有 ⚠（因為 ⚠ 是按每一分鐘分組算的）。弱模型看到「平均 2.3（上限 2）」可能會自己去刪音效 | 範例專案 `--check`：`音效密度：主音效平均 2.3 顆／分（上限每分 2 顆）`，0 則密度 ⚠ | 括號改成「（上限：任一分鐘 ≤ 2 顆，超過才 ⚠）」 |
| A-11 | P2 | spec FR-023「驗」與 FR-015、cli-002 §1.3 | ① FR-023 寫「+0.9 外框完整」，但外框從 +0.7 開始淡入 0.3 s，實際 +1.0 才完整（+0.9 時大約 87%）。② FR-015 寫「節奏」行在報告表頭前，程式和 cli-002 §1.3 都放在「影片長度」之後 | `…/scratchpad/rA/pip/contact-sheet.jpg` 第 5 格（32.4 s）外框還半透明，第 6 格（33.5 s）完整 | 把 spec 改成「+1.0 外框完整」和「影片長度之後」 |
| A-12 | P2 | `lib/main.mjs:206`（`--test`） | test-clip 裡 `segs[id].D` 是**截短後**的片段長度（例：3），不是段長 17。情境動畫如果用 `P.dur()`／`P.end()` 安排退場，測試片段會比成片早出現退場。cues.md §2 說「段內秒數不變」，但沒有講 D | `--test 38.5,3` → `"segs":{"x01":{"start":0,"D":3,…}}` | D 照段長給（host 仍然截短），或在 cues.md 寫明 test-clip 的 D 是截短後的值（沒有看畫面差異，屬建議） |
| A-13 | P2 | 跨平台：`tools/media.mjs:646` | `spawnSync('auto-editor', …)` 沒有 `shell`。pip／pipx 裝的 `auto-editor.exe` 沒問題，但如果裝成 `.cmd` 包裝檔，Windows 會 ENOENT。其他新檔沒有 `npx` 不帶 shell、`~`、硬寫路徑分隔、遞迴刪除指令或 Python | grep 結果：只有 caps.mjs:29 用 `shell: platform === 'win32'`；make-sfx 與 media 只 spawn ffmpeg／auto-editor | Windows 實機跑一次 ng-snap；ENOENT 時退回 `shell: true` 再試 |
| A-14 | P2 | spec SC-004（002）；`USAGE-reference.md:514`（001 的檔） | SC-004 的 grep 會命中 `不要拿 --check 報告的起點和 rough.srt 相減`，但這句是「不要做」的提醒 | `grep -nE "相減|填回 .*data-duration" …` 輸出 1 行 | 改這句的寫法（例：「不要用 --check 的起點自己算秒數」），或把 SC-004 的 grep 改窄 |

## 實測通過（摘要）

- **`--check --json` schema 2**：`schema planHash rhythm versions uncovered voiceUncovered chapters sfxCount sfxBudget outro`，以及 items 的 `key family layout layoutZh opaque out{start,end,lists,annotations,pip,wipe,refs}`、`warnings`（整數）都在。`planHash`＝plan.json 的 sha1 前 8 碼＝`.build-manifest.json` 的值（3425f3a3）。`--plan` 指到不存在的檔時，§5 的每個鍵都在，結束碼 1。`work/hyperframes/` 裡沒有 package.json 或 node_modules。
- **PiP 飛入**（s04，31.5 s）：第 0 格 PiP 區域和底片同一區域的平均差 **1.81/255**（≤ 8）；+0.35 s 時數字邊緣銳利，看不出 transform 放大造成的糊（但素材只有 640×360，不是 1080p 真人）；+0.7 s 落定；外框 +0.7 s 開始淡入。s04→x01 接續：`style` 相同、31.5＋7＝38.5 剛好接上、沒有 opacity tween。
- **章節**：V1 置中（3.00 s，前後各留 0.25 s），前一段 04a 墊在下面、沒露出講者，後一段 04a 照常淡入。壓人聲那一章 70.0–72.5 s 字幕全空，72.6 s 才出現 #20，前一段金句卡墊在下面；`captionsClipped:[20]`，⚠ 原文和契約相同。截圖：`ch1/`、`ch2/contact-sheet.jpg`。
- **只有聲音**：擦入擦出只發生在 0–10 s 那段（m00→s01 擦入、s01→m02 擦出、preroll／postroll 0.5）；區間外的 x01→m01 不擦。擦的途中左右各半，沒有黑畫面（`wipe-sheet.jpg`）。1.3 s → ✖、0.3 s → ⚠，`voiceUncovered[].level` 正確；洞後的 PiP 照規則原地淡入。
- **剪乾淨**：ng-snap 印的三行指令參數一模一樣、引號照契約加；`--add-in`＝[b − (3.0 − 2×0.15), b]＝2.70 s。真的跑完 auto-editor 後，章節停頓量到 **2.989 s**，一般停頓 0.29 s。cutpoints 算出 5.167／13.167／14.6（ng），和手算相同；`--dry-run` 沒寫檔、第二次跑印「內容相同，沒有寫」。srt-split 先斷在標點、沒有標點時 ⚠、CRLF 保持原樣、有備份；plan.json 用到 #N 時 ✖、結束碼 1。
- **status／caps**：各列判斷正確（A-02 除外）；停點紀錄取最後一列、回饋編號 r4 正確；找不到專案時結束碼 1。caps 跑 2.3 s、結束碼 0、輸出沒有 `sk-` 和餘額。`--help` 和 docs.md §6.1–6.4 逐字相同。
- **音效**：章節用 chapter.wav，起播時間 15.196＝14.75＋0.45 − peak 0.037＋1 格；15 金句 tone warn＝thunder、預設＝sparkle；04a 還是 whoosh。additive 的主音效不參加 3 秒規則（`plan.mjs:589` 過濾掉）；clicks 三顆起播時間算得對，報告印 `＋click×3`。thunder 4 次、密度、音效比例（s07 −1.0 dB）三種 ⚠ 原文和 cli-005 §3.2 相同。outro 的 `<audio id="bgm-outro" … data-volume="1">` 正確，`--test` 片段裡的 outro 有裁進去（data-start 2.5）。`--list` 有「附加」「每集 ≤ N」和結尾配樂那一行。18 顆 wav 都是 48 kHz 立體聲 s16、長度 > 0；sfx.json 每顆欄位齊全，additive 只有 tick、click。

## SC 逐項打勾

| SC | 結果 | 證據 |
|---|---|---|
| 002 SC-001 | ✓ | 437 個測試：436 pass、0 fail、1 skip（gated）。「既有測試只改兩個斷言」沒有逐行核對 |
| 002 SC-002 | ✓ | 範例專案（複本）`--check`：0 ✖；三個舊字串都沒出現；有「節奏：continuous」和「沒有畫面的區間（> 1.0s）：無」 |
| 002 SC-003 | ✓ | 範例專案 index.html（3 個 custom 段）`grep -c window.__cues`＝1；合成專案 V3（沒有 custom）＝0 |
| 002 SC-004 | ✗ | USAGE-reference.md:514 命中「相減」（是「不要做」的句子，見 A-14） |
| 002 SC-005 | ✓（有保留） | round-1 試跑：初剪那一列「自己算了什麼：無」；但 ng-snap 章節保留失敗會讓停頓被剪掉（A-01） |
| 002 SC-006 | ✓ | 第 0 格平均差 1.81/255；接續處 style 相同、時間首尾相接、沒有 tween（素材只有 640×360、沒有臉） |
| 002 SC-007 | ✓ | caps 跑 2.3 s，輸出和 JSON 都沒有 `sk-`、key、餘額 |
| 005 SC-001 | ✓ | sfx.test、audio.test 全綠（RMS 真實素材那條是 gated skip） |
| 005 SC-002 | ✗ | 18 顆檔案都在；但 10 列 A/B 紀錄裡有 6 列「待作者試聽」（A-04） |
| 005 SC-003 | ✓ | 範例專案（複本）`--check` 沒有音效 ✖、沒有「音效比例」⚠；合成專案 build 有「音效比例：主音效比人聲小 3.0–12.6 dB…」那一行 |
| 005 SC-004 | ✓ | `shared/sfx`、`kit/sfx.json`、NOTICE 音效段 grep 剪映、CapCut 等字樣：0 筆 |
| 005 SC-005 | ✓ | audio.test 的 cutDips 合成測試（15 ms → 13 ms、30 ms → 29 ms）＋research.md 範例數據（15 ms 0 個凹洞、30 ms 4 個） |
| 005 SC-006 | ✓ | `--candidates --only ding,thunder` 跑兩次 sha256 相同，也和 repo 裡的檔相同；`--out projects/x` → 結束碼 2＋原文 ✖ |

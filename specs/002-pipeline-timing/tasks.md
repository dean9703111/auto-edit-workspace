# Tasks：002 pipeline-timing

**輸入**：`specs/002-pipeline-timing/spec.md`、`plan.md`；契約 `specs/contracts/{check-json,cues,plan-fields,cli-002}.md`。
**格式**：`- [ ] T### [P?] [US?] 做什麼（檔案）→ 驗：怎麼確認`。`[P]`＝和同一階段其他 `[P]` 任務改不同檔、可以並行。路徑以工作區根目錄為準，`T/`＝`shared/template/tools/`。
**每個任務做完都跑**：`node --test dev/tests/*.test.mjs` 全綠；改到報告文字的，對照 `cli-002.md` 原文逐字一致。

## Phase 1：準備（沒有依賴）

- [ ] T001 [P] 根目錄新增 `package.json`（`plan.md` P-11 原文），不跑 `npm install`（安裝要先問使用者，AGENTS.md 規則 3）→ 驗：`node -e "const p=require('./package.json');if(p.devDependencies.hyperframes!=='0.8.221'||!p.private)process.exit(1)"`
- [ ] T002 [P] 新增 `dev/tests/media-cli.test.mjs`、`status.test.mjs`、`caps.test.mjs` 骨架（每支一個會過的 smoke 測試，暫存資料夾 helper 用 `dev/tests/helpers.mjs` 既有的，只新增不改）→ 驗：`node --test dev/tests/media-cli.test.mjs dev/tests/status.test.mjs dev/tests/caps.test.mjs`
- [ ] T003 [P] `T/lib/srt.mjs` 新增 `formatSrt(cues, { eol = '\n', bom = false })`（`parseSrt` 的反函式）→ 驗：`timing.test.mjs`「formatSrt(parseSrt(x)) === x」，含 CRLF、BOM

## Phase 2：基礎（後面各 US 都會用到）

- [ ] T004 `T/lib/plan.mjs`：`TOP_KEYS` 改成 `plan-fields.md` §1 的 11 個；`KEYS.custom` 加 `clicks`（只先認得欄位，內容在 T083）；`rhythm` 驗證（FR-016）→ 驗：`plan.test.mjs`「rhythm 寫錯 ✖ 原文」「outro／look／rhythm 不是未知欄位」
- [ ] T005 `T/build.mjs` 與 `T/lib/plan.mjs` 的 `jsonItems`：`--check --json` 改 schema 2 的骨架（新鍵先給空值：`uncovered: []`、`chapters: []`…），`planHash`，出錯 JSON 帶齊鍵（`check-json.md` §2、§5）→ 驗：`build.test.mjs`「check-json 必有鍵、型別」「出錯 JSON 有全部鍵」；`editor.test.mjs`（006）既有測試不改仍過
- [ ] T006 `T/build.mjs`：build 成功後寫 `<out>/.build-manifest.json` 的 `planHash`（FR-069）→ 驗：`build.test.mjs`「planHash 與 manifest 相同；plan.json 加空白就變」
- [ ] T007 `T/lib/plan.mjs` 的 `jsonItems`：`key`、`family`、`layout`、`layoutZh`、`opaque`、`out.start／end／lists／annotations`（FR-070）→ 驗：`build.test.mjs`「items[].out.lists 是成片秒數」「有 cuts 時 out.start ≠ start」
- [ ] T008 [P] `T/media.mjs`：匯出 `parseCutsMd(text)`（`plan.md` P-01）；`parseArgs` 的 `VALUE_FLAGS` 加 `edit`、`margin`、`v1`、`max`（FR-001）→ 驗：`media-cli.test.mjs`「cuts.md：兩張表、四種時間寫法、待確認略過、程式碼區塊裡的表略過」

## Phase 3：US1 章節不壓口播（P1）

- [ ] T010 [US1] `T/lib/plan.mjs` 章節位置：置中／貼齊／壓人聲 ⚠（FR-005、FR-006）；改 `plan.test.mjs:76-82` 第一個斷言 4.5 → 4.25 → 驗：`plan.test.mjs`「章節轉場：空檔 3 s 置中 4.25；2.5 s 貼齊；0.5 s ⚠ 含 ng-snap 指令與專案名」
- [ ] T011 [US1] `T/lib/captions.mjs` 加 `blackout`；`T/lib/plan.mjs` 收集章節區間、回傳被裁的句號；`T/build.mjs:497` 傳入（FR-007）→ 驗：`plan.test.mjs`「章節期間字幕清空」；`build.test.mjs`「captions.html 在章節 2.5 s 內沒有 visible」
- [ ] T012 [US1] `T/lib/plan.mjs` 章節墊底四種＋整張幕重疊放行（FR-008）→ 驗：`plan.test.mjs`「章節墊底：04a→章節、章節→04b、media→章節、lower-third→章節」，且沒有「整張幕重疊」✖
- [ ] T013 [US1] `T/lib/plan.mjs`：`chapters[]` 進 JSON（`check-json.md` §2.2）→ 驗：`build.test.mjs`「chapters 欄位與 placement」
- [ ] T014 [US1] `T/media.mjs ng-snap`（`plan.md` P-02；FR-002–FR-004、FR-066）→ 驗：`media-cli.test.mjs`「ng-snap：NG 吸附、找不到停頓 ⚠、章節 add-in 2.70 s、停頓不足 ⚠、NG 吃掉保留區、三行指令參數一致、每段一個旗標、預設 --margin 0.15sec、--margin 4 ✖、不寫 work/.cache 以外的檔」
- [ ] T015 [US1] 手動驗證（不在測試裡）：用 `scratchpad` 合成一支有 4 s 停頓的測試片跑真的 auto-editor，ng-snap 印的第 3 行跑完後，`media.mjs cutpoints` 算出的章節前空檔 = 3.00 s ± 1 格 → 驗：貼 ng-snap 與 cutpoints 的輸出

## Phase 4：US2 子母畫面飛入與三層淡出（P1）

- [ ] T020 [US2] `T/lib/plan.mjs` 新增 `pipMotion()`：每個片段的 `enter`／`exit`／`exitDur`（FR-022、FR-026）→ 驗：`plan.test.mjs`「子母畫面進場 7 種、出場 4 種」
- [ ] T021 [US2] `T/lib/main.mjs`：幕的淡入不含 pip；`fly`／`fade`／`none` 三種 tween；淡出只含 `exit: layer` 的片段（FR-023–FR-025）→ 驗：`build.test.mjs`「PiP 飛入 tween 起始值＝crop 換算、0.7 s、pushEase；外框 +0.7 s 起 0.3 s」「連續兩段 PiP 邊界相同、沒有 opacity tween」
- [ ] T022 [US2] `items[].out.pip` 進 JSON → 驗：`build.test.mjs`「out.pip 的 enter／exit」
- [ ] T023 [US2] 整合驗證（交 007 或作者）：範例專案 build 後 `cd projects/範例/work/hyperframes && npx hyperframes snapshot --at <t0>,<t0+0.35>,<t0+0.7>,<t0+0.9>`；量第 0 格 PiP 區域和前一格同區域的平均像素差（SC-006 ≤ 8/255）→ 驗：四張截圖＋差值；不過就照 spec「待裁決」第 1 條換退路（`plan.md` P-05 退路）

## Phase 5：US3 旁白段擦入（P1）

- [ ] T030 [US3] `T/lib/plan.mjs`：`VOICE_WARN` 0.1；報告行 ⚠／✖ 前綴（FR-029）→ 驗：`plan.test.mjs`「只有聲音：沒蓋住 0.3 s ⚠、1.2 s ✖」
- [ ] T031 [US3] `T/lib/plan.mjs`：擦入擦出判斷、`rollFor`、退回硬切 note（FR-030、FR-032、FR-033）→ 驗：`plan.test.mjs`「擦入擦出：兩個方向、in 0.2 退回、圖片可以、章節不擦、講者段不擦」
- [ ] T032 [US3] `T/lib/main.mjs`：clip-path tween、z 31（FR-031）；`items[].out.wipe`（FR-034）→ 驗：`build.test.mjs`「擦入 clip-path 0.45 s、z-index 31」「out.wipe」
- [ ] T033 [US3] 等 004 的 `mediaParts` 支援 `preroll`／`postroll`（spec「請 004 加」）後接上 → 驗：`build.test.mjs`「media postroll 0.5：data-duration 多 0.5」
- [ ] T034 [US3] 整合驗證（交 007）：合成一個有只有聲音區間的專案，交界前後 0.25 s 各 snapshot 一格，擦入途中左邊是動畫幕、右邊是錄影 → 驗：兩張截圖

## Phase 6：US4 情境動畫綁句（P1）

- [ ] T040 [US4] `T/lib/assemble.mjs`：`scanCueRefs(html)`；`readCustom` 回傳 `refs`（`cues.md` §3.2）→ 驗：`timing.test.mjs`「註解裡的 P.at 不算；雙引號單引號都抓」
- [ ] T041 [US4] `T/lib/plan.mjs`：refs 換秒數、✖／⚠、同一個 src 兩段 ✖（FR-018、FR-020）→ 驗：`timing.test.mjs`「cues.md §6 的 002 端四列」；`plan.test.mjs`「同一個 src 兩段 ✖」
- [ ] T042 [US4] `T/lib/main.mjs`：`window.__cues` 注入（`index.html` 與 `test-clip.html`；`--test` 平移）（FR-017）→ 驗：`build.test.mjs`「有 custom 時 head 有 window.__cues 且在 scene-motion.js 之前、JSON 可解析；沒有 custom 時 index.html 和改之前逐位元組相同；`</script>` 字幕被跳脫」
- [ ] T043 [US4] `items[].out.refs` 進 JSON；報告 note「綁句 N 個」→ 驗：`build.test.mjs`「out.refs」
- [ ] T044 [US4] 整合驗證（等 003 的 `P.at` 合併後，交 007）：custom root 寫 `data-duration="1"`、plan 段長 8 s，snapshot 段起點＋7 s 看得到完成態（FR-019；不成立 → spec「待裁決」第 4 條退路）→ 驗：截圖

## Phase 7：US5 連續覆蓋與 rhythm（P1）

- [ ] T050 [US5] `T/lib/plan.mjs`：`uncovered`、`voiceUncovered`、閃一下 ⚠、彙總 ⚠、rhythm 切換兩條舊 ⚠（FR-011、FR-014、FR-015）→ 驗：`plan.test.mjs`「沒有畫面的區間：刪一段出現、補回消失；章節與 media 算有畫面；02 角標不算」「continuous：空 0.4 s ⚠ 附 to；0.03 s 不報」「spaced：舊兩條出現」
- [ ] T051 [US5] `formatReport`：節奏行、沒有畫面的區間行（FR-012）；JSON `uncovered`／`voiceUncovered`（FR-013）→ 驗：`plan.test.mjs`「formatReport 兩行原文」；`build.test.mjs`「uncovered 有 cuts 時 start 是 rough 秒數」
- [ ] T052 [US5] 範例專案驗證：`node T/build.mjs --project projects/範例 --check` → 驗：SC-002（0 ✖；沒有「人聲在下面繼續」「開場前 30 秒」「只露臉」；有「節奏：continuous」「沒有畫面的區間」）

## Phase 8：US6 剪乾淨的工具（P2）

- [ ] T060 [P] [US6] `T/media.mjs cutpoints`（`plan.md` P-03；FR-035–FR-037）→ 驗：`media-cli.test.mjs`「US6 情境 1 → { at 2.133 pause, at 2.633 ng }」「片頭片尾不算」「長度對不上 ⚠」「變速 ✖」「--dry-run 不寫」「舊檔不同時備份」
- [ ] T061 [P] [US6] `T/media.mjs srt-split`（`plan.md` P-04；FR-038–FR-041）→ 驗：`media-cli.test.mjs`「標點優先、空白其次、遞迴三段、沒有標點 ⚠、拆完每則 ≤ 18、文字不增不減、時間首尾相接、CRLF 原樣、沒要拆不備份、plan.json 有 #N ✖ 且 rough.srt 沒動」
- [ ] T062 [US6] `T/media.mjs` 檔頭加 `docs.md` §6.1 的 `--help` 原文；`cli()` 的指令清單與錯誤訊息加三個新指令 → 驗：`node T/media.mjs --help` 有 ng-snap、cutpoints、srt-split；`node T/media.mjs xyz` 的 ✖ 列出 7 個指令
- [ ] T063 [US6] 從 `dev/tests/media.test.mjs` 把測 002 的 `media.mjs main／scan／frame` 與 `--check --json` 的案例，在 `media-cli.test.mjs` 建好同等案例；通知 004 刪舊的（FR-072；不改 004 的檔）→ 驗：兩個檔都過；回報列出搬了哪幾個案例名稱

## Phase 9：US7 status、caps、版本（P2）

- [ ] T070 [P] [US7] 新增 `T/status.mjs`（`plan.md` P-10；`cli-002.md` §5；檔頭 `docs.md` §6.2）→ 驗：`status.test.mjs`「判斷表 S0–S14 各一個暫存專案」「停點紀錄：最後一列待回覆 → 以它為準；後來通過 → 不算」「r 編號」「--json」「跑完前後檔案清單與 mtime 不變」
- [ ] T071 [P] [US7] 新增 `T/caps.mjs`（`plan.md` P-11；`cli-002.md` §6；檔頭 `docs.md` §6.3）→ 驗：`caps.test.mjs`「六列結果」「codex ENOENT」「mmx 的 JSON 有 key 與 balance → 依據沒有 sk- 與數字餘額」「結束碼：codex 壞仍 0、沒 ffmpeg 1」
- [ ] T072 [US7] `T/build.mjs`：`專案：` 下一行印版本（`cli-002.md` §1.1）；JSON `versions`（FR-050、FR-051）→ 驗：`build.test.mjs`「版本行三種」；`project.test.mjs`「build 產生的專案沒有 package.json、沒有 node_modules」
- [ ] T073 [US7] 作者電腦冒煙：`node T/caps.mjs`、`node T/status.mjs --project projects/範例` → 驗：貼輸出（caps ≤ 30 s、沒有 `sk-`，SC-007）

## Phase 10：US8 音效政策、結尾配樂、look（P3；依賴 005、006 的程式合併）

**開工前確認**：`T/lib/audio.mjs` 已匯出 `SFX_RULES`、`sfxBudget`、`renderBgmClip`、`audioKey({ look })`（005）；`T/lib/look.mjs` 已匯出 `ensureLook`、`lookCheck`、`validateLook`（006，stub 也可以）。用 `grep -n "export" T/lib/audio.mjs T/lib/look.mjs` 確認。

- [ ] T080 [US8] `T/lib/plan.mjs`：`SFX_RULES` import、additive 跳過 3 秒規則（FR-056、FR-057）→ 驗：`plan.test.mjs` 跑 `contracts/sfx.md` §10 第 1–3 列
- [ ] T081 [US8] `T/lib/plan.mjs`：`sfxBudget` 接線、`sfxCount`／`sfxBudget` 進 JSON（FR-058）→ 驗：`contracts/sfx.md` §10 第 4–6 列；`build.test.mjs`「sfxCount、sfxBudget」
- [ ] T082 [US8] `T/lib/plan.mjs`：段落 sfx 只收 `kind: "sfx"`、「12 個檔」改計數；`dev/tests/build.test.mjs:170` 同步；`T/build.mjs --list` 音效行（FR-060）→ 驗：`plan.test.mjs`「sfx 寫 bgm-outro ✖」；`build.test.mjs`「--list 音效行」
- [ ] T083 [US8] `T/lib/plan.mjs`：custom 與 media 的 `clicks` → `click` 附加音效（FR-061）→ 驗：`contracts/sfx.md` §10 第 2 列；custom `clicks` 超出段 ✖ 原文
- [ ] T084 [US8] `T/build.mjs`：`audioReportLines(..., { sfx })`（FR-059）→ 驗：`build.test.mjs`「build 報告有『音效比例：』」
- [ ] T085 [US8] `T/lib/plan.mjs`＋`T/build.mjs`＋`T/lib/main.mjs`：`outro`（驗證、時間、`renderBgmClip`、`<audio id="bgm-outro">`、`--test`、報告行、JSON）（FR-052–FR-055）→ 驗：`plan.test.mjs`「outro 錯誤 6 種、起點、對齊片尾、淡入淡出 min、--test 裁切」；`build.test.mjs`「<audio id="bgm-outro"> 屬性」
- [ ] T086 [US8] `shared/template/scenes/01-chapter/scene.json`、`14-speaker`、`15-quote` 的預設音效（FR-009）——**等 `shared/sfx/chapter.wav`、`sparkle.wav`、`thunder.wav` 進 repo 才做**（`ls shared/sfx/` 確認）→ 驗：`plan.test.mjs`「章節音效起播＝起點＋0.45 − peak＋1 格；04a 仍 whoosh；15 warn＝thunder」
- [ ] T087 [US8] `T/lib/plan.mjs`：`validateLook`（FR-062）；`T/build.mjs --check`：`lookCheck`（FR-063）→ 驗：`plan.test.mjs`「"look": true ✖ 原文」；`build.test.mjs`「lookCheck 的 ⚠ 進報告與 JSON」
- [ ] T088 [US8] `T/build.mjs`：`ensureLook` 接線、`audioKey({ look })`、`lut`（FR-064、FR-065）→ 驗：`build.test.mjs`「stub 回傳 rough-look.mp4 → 重新編碼來源是它；丟錯 → 結束碼 1、沒有 assets/rough.mp4；key null → 戳記同舊版」

## Phase 11：004 介面與收尾

- [ ] T090 `T/lib/plan.mjs`：`validateMedia`＋`newStepState`、`it.mediaReport`、`formatReport` 用 `summary`（FR-071；004 合併 `validateMedia` 前用 `resolveMedia` 別名）→ 驗：`plan.test.mjs`「STEP 跨段接續；報告括號是 summary」
- [ ] T091 `T/build.mjs`：刪 `MEDIA_FIELDS`，從 `lib/media.mjs` import（FR-072；004 已搬過去才做：`grep -n "export const MEDIA_FIELDS" T/lib/media.mjs`）→ 驗：`build.test.mjs`「--list --json media.fields 等於 lib/media.mjs 的」
- [ ] T092 等 004 的 `mediaParts` 不再淡 pip（spec「請 004 加」）後，media 段的 PiP 改走 T021 的 tween（FR-028）→ 驗：`build.test.mjs`「露臉→media＝PiP 飛入；mediaParts 進場 tween 只有 #el-<id>」
- [ ] T093 `T/build.mjs` 檔頭加 `docs.md` §6.4 原文 → 驗：`node T/build.mjs --help` 有那四行
- [ ] T094 把 `docs.md` 交給 001（訊息原文以 `cli-002.md` 為準）；確認 001 的 `docs.test.mjs` 收錄 5 個新指令 → 驗：001 回報合併完成；`grep -n "ng-snap\|cutpoints\|srt-split\|status.mjs\|caps.mjs" AGENTS.md shared/template/USAGE*.md` 有輸出
- [ ] T095 全部完成後：`node --test dev/tests/*.test.mjs`；`node T/build.mjs --project projects/範例 --check`；`node T/build.mjs --project projects/範例`；`node T/audit.mjs --project projects/範例` → 驗：貼四個指令的最後幾行（SC-001–SC-003）

## 依賴

| 任務 | 等誰 |
|---|---|
| T005–T007 | 無（先做，004／006 依賴 check-json） |
| T014 | T008 |
| T060 | T008（kind 要讀 cuts.md） |
| T033、T092 | 004 改 `mediaParts`（spec「請 004 加」） |
| T044 | 003 的 `P.at` |
| T080–T086 | 005 的 `lib/audio.mjs`、`shared/sfx/*.wav` |
| T087–T088 | 006 的 `lib/look.mjs`（stub 即可） |
| T090–T091 | 004 的 `validateMedia`、`MEDIA_FIELDS` 搬家 |

## 並行建議

Phase 1 全部並行；Phase 2 完成後，US1（T010–T015）、US2（T020–T023）、US5（T050–T052）都改 `plan.mjs`，要依序做（同一個檔）；`media.mjs` 的 T014、T060、T061 可以和 `plan.mjs` 的工作並行；`status.mjs`、`caps.mjs`（T070、T071）任何時候都可以並行。

## Round 2（2026-10-31，dev/loop/feedback-r1-user.md、review-r1-A.md）

| 任務 | 內容 | 狀態 |
|---|---|---|
| R2-F2a | 重現：auto-editor 29.3.1 剪手機原檔（VFR 359/12、yuvj420p）＋`--cut-out` → rough.mp4 後段全黑；任何一次 ffmpeg 重新編碼（CFR 30／VFR 照舊／yuvj420p 照舊）都 0 段黑畫面 → 選「原片一律先轉 work/main.mp4」：`media.mjs main` 單支也轉、`ng-snap` 沒有 main.mp4 時自動轉，三行指令用 main.mp4（cli-002 §2.0） | ✓ |
| R2-F2b | `media.mjs verify-rough`（cli-002 §2.5）；範例實測：舊 rough ✖ 2 段，照它重做後 ✓ | ✓ |
| R2-F2c | `build --check` 全黑＋沒有純聲音素材 → ✖、`voiceOnly: []`、新鍵 `roughBlack`（check-json §2.4）；`hasVoiceSource` 匯出給 004 | ✓ |
| R2-F1 | 常駐章節角標：plan.mjs `badges`／`chapters[].kind num badge outBadge`、main.mjs `#chb-<k>`（不是 clip，`hyperframes lint` 0 warning）、`chapterBadge`、`chtag` ⚠（check-json §2.5、plan-fields） | ✓ |
| R2-F4 | `#N@詞` 用 `work/transcript.json` 真實時間（time.mjs `wordTime`、build.mjs `attachWords`）；「文字對時」✖／⚠（check-json §2.6）；07 加 `keyAt` beat | ✓ |
| R2b-P1 | 「文字對時」對到門檻改成權重 ≥ 3（中文連續 3 字、英文／數字整個 token、中文數字＝0–9、數字後的「個」不算），拿掉 2 字規則；plan 第一層 `"check": { "textSync": false }` 給示意 plan（004 `framing --cards`），寫在正式 plan.json ⚠（build.mjs `textSyncOffWarnings`）；範例舊版 13 列仍全 ✖（scratch 複本驗，19 ✖） | ✓ |
| R2b-P2 | ng-snap：NG 終點往後延到停頓末端 > 0.3 s 時內容欄加「終點落在後一次開口（m:ss.ss）之前的停頓末端，後一次完整保留」 | ✓ |
| R2b-fixture | 範例舊版（work.trial1）的 plan.json、rough.srt、transcript.json、3 支 x-*.html 複製成 `dev/tests/fixtures/example-trial1/work/`；plan.test 的 F1 角標覆蓋與 F4 13 列 ✖ 改讀 fixture（不再依賴 live 專案、不再 skip） | ✓ |
| A-01 | 章節開口：包含表上時間的停頓 → 往後 6 s → 往前 0.6 s；FR-003、cli-002 §2 | ✓ |
| A-02 | srt-split 備份改 `rough.srt.split-*`；status S6；FR-040、cli-002 §4／§5.2 | ✓ |
| A-03 | 工具字串不指向 specs/（ng-snap ✖、build --help） | ✓ |
| A-05 | `snapNg` 的 `missStart`／`missEnd`；終點落在章節停頓裡吸到停頓起點 | ✓ |
| A-06 | 只有聲音 ⚠：前面沒段 → 提早後一段 from；後面沒段 → 延長前一段 to | ✓ |
| A-07 | `--k=v` 只在第一個 = 切 | ✓ |
| A-08 | rhythm、outro.*、sfx 名稱、type、clicks、cutpoints 沒有 NG 表、ng-snap 保留區重疊、rough.srt 空、build 讀不到字幕都補 → 改法；cli-002／cli-005 同步 | ✓（005 的 `lib/media.mjs` `tAt` 那一則不是本線的檔，交 004） |
| A-09 | ① 淡入淡出 `String(+x.toFixed(2))` ② 只有聲音那一行以程式為準（`30s`）改契約 ③ caps mmx `已登入（…）` ④ ng-snap 一律「快取」⑤ status S11 改用 lookNextStep 改契約 | ✓ |
| A-11 | spec FR-023「+1.0 外框完整」、FR-015「影片長度之後」 | ✓ |
| A-12 | test-clip 的 `segs[id].D` 給段長 | ✓ |
| A-13 | Windows `.cmd` ENOENT 退回 `shell: true` | 程式 ✓；**沒有 Windows 實機跑**（本機是 macOS），留給 007 的 Windows 冒煙 |
| A-14 | SC-004 的 grep 改窄（只抓叫 AI 相減的寫法） | ✓ |
| B-11 | a `P.at('#99')` 補「→ 改成這段範圍內的句號（#a–#b）」；b 不是字串字面值 ✖；c custom 用 src 判斷連續三段 | ✓ |
| C-01 | status 的 S8／S11 用 006 的 `lookNextStep`，cmd 另一行 | ✓ |
| C-14 | 決定：`--check` 維持 ⚠，理由寫進 check-json §2.7（改 ✖ 會擋住分鏡表草稿與剪輯台；check-all 的順序也是先 --check 再 look） | ✓（決定） |
| 其他 | 連續 5 段同一版面家族 ⚠；fx `vars` 未宣告的 key 原本就 ✖（含 `text`） | ✓ |

沒做、原因：
- 剪輯台（`editor/server/write.mjs` 的 `resolveTime`）還是用字數比例算 `#N@詞`，有 `work/transcript.json` 時剪輯台顯示的起點會和 build 差（通常 < 1 s）。剪輯台不是本線的檔，交剪輯台的擁有者決定要不要讀 transcript.json（`time.mjs` 的 `wordTime` 可以直接用）。
- 「文字對時」不量 custom（情境動畫的站名）：照派工由 003 的 audit 量。
- 範例專案的 rough.mp4 沒有重做（`--check` 要留著 F2 的 ✖ 給主代理看）；重做步驟見 cli-002 §2.5 實測那一段。

## F8（2026-10-31，dev/loop/feedback-r1-user.md「F8」）

| # | 內容 | 狀態 |
|---|---|---|
| F8-1 | `media.mjs srt-align`：講稿行／子句、transcript.json 全域序列對齊（NW 字元層級）、> 18 字在「、，」拆、同一口氣（≤ 0.12 秒）或一邊 ≤ 4 字可併、連接詞不併、空檔 < 1 秒補滿、對不上內插 ⚠；`--remap-plan` 照時間換 plan.json（含 outro、anchor 平移）與 custom `P.at` | ✓ |
| F8-2 | 顯示文字去「，。；：」保留「、！？」；rough.srt 存顯示文字 | ✓ |
| F8-3 | `kit/captions.css` 76／400／行高 71／內距 24 37 23／bottom 6；`captionWidth`（`CAPTION`）與門檻 1840 | ✓ |
| F8-4 | `captionWarnings`：含「，。；：」⚠、< 0.6 秒 ⚠（整份各一則） | ✓（qc final 歸 004） |
| F8-5 | status S4–S6：srt-align 取代 srt-split；有 transcript.json 不用 snap-srt | ✓ |
| F8-6 | 文件：cli-002 §4.5、check-json §2.8、docs.md §9（給 001） | ✓ |
| F8-驗收 | 範例：84 行 → 70 則（剪映同段 66 則；按長度比例 67）、0 則含「，。」、相鄰空檔中位 0.00、對齊 ⚠ 0；底板 y 956–1073（118 高、離底 6）、字高 70、18 字寬 1442＝估寬 | ✓ |

- 偏離派工的地方：合併規則除了「≤ 4 字且同句」，再加「同一口氣（停頓 ≤ 0.12 秒）」。只用 ≤ 4 字規則，範例是 82 則（和剪映同字只有 32 則）；加上後 70 則（44 則和剪映一字不差，其他差在講稿與實際講的字不同）。
- 剪輯台的字幕預覽樣式（`tools/editor/`）歸 006，沒改；`qc final` 的字幕 ⚠ 歸 004。

## 第二段（2026-10-31，010 動態 v2 階段 B＋009 T002-V02）

| # | 內容 | 狀態 |
|---|---|---|
| F8-7 | 合併規則（含 24 個連接詞全文）寫進 cli-002 §4.5、docs.md §9.1；測試比對文件和 `CONNECTIVE` 一字不差 | ✓ |
| F8-8 | 重新對句號的三個坑變測試：custom 只換 `<script>` 裡的 `P.at`／`P.sfx` 字串（檔頭 HTML 註解含「<script>」、JS 註解、屬性不動）、`outro.from`、anchor 段平移長度不變且前一段的 `to` 跟著接上 | ✓ |
| A-1 | plan.json `"theme": "light"｜"dark"`（`TOP_KEYS`、寫錯 ✖）；暗色換 `bg-*-dark.jpg`（缺就退回亮色 ⚠）；主合成、測試片段、build 產生的子合成 `<html data-theme="dark">`（`withTheme`）；`--check --json` 報 `theme`；build 不寫 plan.json | ✓ |
| A-2 | 暗色回歸 fixture `dev/tests/fixtures/theme-dark/`（plan.json＋rough.srt）＋build.test（004 的 T115 用） | ✓ |
| V02 | `tools/lib/canvas.mjs`（`CANVAS`、`canvasOf`、`stageTransform`、`regionsOf`／`regionsScript`、`resolveFormat`、`formatLine`、`probeDims`）＋`canvas.test.mjs`；橫式值＝現行常數（測試比對）；未接線。spec FR-011 補 spike 三句 | ✓ |
| B-1 | `P.sfx`：`scanCueRefs` 收 ref、`scanSfxCues`（motion.md §5 regex）、不是字面值 ✖、名稱不在 sfx.json ✖；附加音效 `<audio>`、算進次數與密度 | ✓ |
| B-2 | 轉場語彙（design-system §5）：`txIn／txOut`、色帶擦開、色帶收回、換卡不換景（舊幕多留 0.3 s、z 連鎖遞減）、章節色塊斜擦、角標（P.wipe／pop／chars）；講者慢推（§7，原點＝臉）；子母畫面飛入 0.75 s＋0.62 s 外框彈出 | ✓ |
| B-3 | scenes.mjs「晚於 D−P.OUT−0.6」讀 kit 常數 | ✓ |
| B-4 | `--check`：`items[].out.tx`、報告最後一行「轉場：…｜主題：…」 | ✓ |

- 換卡不換景的舊卡退場：custom 檔不是 build 產生的，改不到段內；做法是舊的 host 多留 0.3 s、疊在新的幕上，clip 只留內容區（x 96–1404、y 96–894）再往左擦掉。兩張幕都是 bg-fs，外面那圈本來就一樣。
- 主時間軸對 host 只動 opacity 與 clip-path（不動 x／y／scale，009 直式的 transform 不會被蓋掉）。
